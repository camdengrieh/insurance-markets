// A small node:http listener for the mock. One listener = one server bound to 127.0.0.1 on a port the
// OS picks (port 0, so there is never a fixed port and never a race), with exact and ":param" routes,
// an optional hook that runs before routing (fault injection, rate limits), and a request log.
//
// Rules this file keeps:
//   - binds 127.0.0.1 only
//   - a handler that throws gives a 500 and the error is kept in `errors`, so a bug in the mock is
//     never mistaken for an injected fault: tests assert `errors` is empty
//   - close() destroys every open socket, including requests the mock deliberately never answers

import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface MockRequest {
  readonly listener: string;
  readonly method: string;
  // Pathname only, exactly as received (no decoding beyond what URL does).
  readonly path: string;
  // "?a=b" or "".
  readonly search: string;
  readonly query: URLSearchParams;
  // Captures of ":name" segments in the matched route.
  readonly params: Readonly<Record<string, string>>;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

export interface MockReply {
  readonly status: number;
  // Serialised with JSON.stringify (content-type application/json).
  readonly json?: unknown;
  // A raw body instead of json (content-type text/plain unless a header says otherwise).
  readonly text?: string;
  readonly headers?: Readonly<Record<string, string>>;
  // Fault behaviours. At most one is set.
  // Never answer: the connection stays open until the client gives up or the listener closes.
  readonly hang?: true;
  // Close the socket without a response (a host that is down).
  readonly drop?: true;
}

export type Handler = (request: MockRequest) => MockReply | Promise<MockReply>;
export type BeforeRoute = (request: MockRequest) => MockReply | undefined | Promise<MockReply | undefined>;
// Runs after the handler, with its reply. Returning a reply replaces it (the write already happened: the
// "response lost" fault of the write mock).
export type AfterRoute = (request: MockRequest, reply: MockReply) => MockReply | undefined | Promise<MockReply | undefined>;

export interface RecordedRequest {
  readonly listener: string;
  readonly method: string;
  readonly path: string;
  readonly search: string;
  readonly status: number | "hang" | "drop";
  readonly userAgent: string | null;
  // Identifying headers the mock watches for. A request from this project sends none of them.
  readonly from: string | null;
  readonly referer: string | null;
  readonly origin: string | null;
  // Every header name that arrived (lower-case), never the values.
  readonly headerNames: readonly string[];
}

interface Route {
  readonly method: string;
  readonly segments: readonly string[];
  readonly handler: Handler;
  readonly pattern: string;
}

const MAX_BODY_BYTES = 1024 * 1024;

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment !== "");
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value.join(", ");
  return typeof value === "string" ? value : null;
}

export interface ListenerOptions {
  readonly before?: BeforeRoute;
  readonly after?: AfterRoute;
  readonly onRecord?: (entry: RecordedRequest) => void;
}

export class MockListener {
  readonly name: string;
  readonly errors: Error[] = [];
  private readonly server: Server;
  private readonly routes: Route[] = [];
  private fallbackHandler: Handler | undefined;
  private readonly sockets = new Set<Socket>();
  private readonly options: ListenerOptions;
  private boundPort = 0;
  private closed = false;

  constructor(name: string, options: ListenerOptions = {}) {
    this.name = name;
    this.options = options;
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    this.server.on("connection", (socket) => {
      this.sockets.add(socket);
      socket.once("close", () => this.sockets.delete(socket));
    });
  }

  // Registers a route. "/markets/:cid" captures one segment. Registering the same method and pattern
  // twice throws, so two streams cannot silently override each other.
  route(method: string, pattern: string, handler: Handler): void {
    const upper = method.toUpperCase();
    if (this.routes.some((route) => route.method === upper && route.pattern === pattern)) {
      throw new Error(`${this.name}: route ${upper} ${pattern} is already registered`);
    }
    this.routes.push({ method: upper, segments: splitPath(pattern), handler, pattern });
  }

  // Replaces the handler of an existing route, or adds the route. The write mock uses this to take over a
  // route that answers 501 "not built yet" here.
  override(method: string, pattern: string, handler: Handler): void {
    const upper = method.toUpperCase();
    const index = this.routes.findIndex((route) => route.method === upper && route.pattern === pattern);
    const route: Route = { method: upper, segments: splitPath(pattern), handler, pattern };
    if (index === -1) this.routes.push(route);
    else this.routes[index] = route;
  }

  // What answers a path that no route matches (default: 404).
  fallback(handler: Handler): void {
    this.fallbackHandler = handler;
  }

  routePatterns(): readonly string[] {
    return this.routes.map((route) => `${route.method} ${route.pattern}`);
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(0, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
    const address = this.server.address() as AddressInfo | string | null;
    if (address === null || typeof address === "string" || address.address !== "127.0.0.1") {
      await this.close();
      throw new Error(`${this.name}: listener is not bound to 127.0.0.1`);
    }
    this.boundPort = address.port;
    return this.boundPort;
  }

  get port(): number {
    return this.boundPort;
  }

  get url(): string {
    return `http://127.0.0.1:${String(this.boundPort)}`;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private match(method: string, path: string): { route: Route; params: Record<string, string> } | "method" | undefined {
    const parts = splitPath(path);
    let pathMatched = false;
    for (const route of this.routes) {
      if (route.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let index = 0; index < parts.length; index += 1) {
        const want = route.segments[index] as string;
        const got = parts[index] as string;
        if (want.startsWith(":")) {
          let decoded = got;
          try {
            decoded = decodeURIComponent(got);
          } catch {
            // keep the raw segment
          }
          params[want.slice(1)] = decoded;
        } else if (want !== got) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      pathMatched = true;
      if (route.method === method) return { route, params };
    }
    return pathMatched ? "method" : undefined;
  }

  private async readBody(request: IncomingMessage): Promise<string | "too_large"> {
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of request) {
      const buffer = chunk as Buffer;
      total += buffer.length;
      if (total > MAX_BODY_BYTES) return "too_large";
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = (request.method ?? "GET").toUpperCase();
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      this.send(response, { status: 400, json: { error: "bad request target" } }, null);
      return;
    }
    const body = await this.readBody(request);
    const base = {
      listener: this.name,
      method,
      path: url.pathname,
      search: url.search,
      query: url.searchParams,
      headers: request.headers,
    };
    const record = (status: RecordedRequest["status"]): void => {
      this.options.onRecord?.({
        listener: this.name,
        method,
        path: url.pathname,
        search: url.search,
        status,
        userAgent: header(request.headers, "user-agent"),
        from: header(request.headers, "from"),
        referer: header(request.headers, "referer"),
        origin: header(request.headers, "origin"),
        headerNames: Object.keys(request.headers).map((key) => key.toLowerCase()).sort(),
      });
    };
    if (body === "too_large") {
      record(413);
      this.send(response, { status: 413, json: { error: "request body too large" } }, null);
      return;
    }
    try {
      const matched = this.match(method, url.pathname);
      const params = typeof matched === "object" ? matched.params : {};
      const full: MockRequest = { ...base, params, body };
      const early = await this.options.before?.(full);
      let reply: MockReply;
      if (early !== undefined) reply = early;
      else if (typeof matched === "object") reply = await matched.route.handler(full);
      else if (this.fallbackHandler !== undefined) reply = await this.fallbackHandler(full);
      else if (matched === "method") reply = { status: 405, json: { error: "method not allowed" } };
      else reply = { status: 404, json: { error: "route not found" } };
      if (early === undefined) reply = (await this.options.after?.(full, reply)) ?? reply;
      record(reply.hang === true ? "hang" : reply.drop === true ? "drop" : reply.status);
      this.send(response, reply, request.socket);
    } catch (error) {
      this.errors.push(error instanceof Error ? error : new Error(String(error)));
      record(500);
      this.send(response, { status: 500, json: { error: "mock internal error" } }, null);
    }
  }

  private send(response: ServerResponse, reply: MockReply, socket: Socket | null): void {
    if (reply.drop === true) {
      (socket ?? response.socket)?.destroy();
      return;
    }
    if (reply.hang === true) return;
    const headers: Record<string, string> = { ...reply.headers };
    let payload: string;
    if (reply.text !== undefined) {
      payload = reply.text;
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) headers["content-type"] = "text/plain; charset=utf-8";
    } else {
      payload = reply.json === undefined ? "" : JSON.stringify(reply.json);
      if (reply.json !== undefined) headers["content-type"] = "application/json";
    }
    headers["content-length"] = String(Buffer.byteLength(payload));
    response.writeHead(reply.status, headers);
    response.end(payload);
  }
}
