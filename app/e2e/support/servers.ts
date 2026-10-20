import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";

import { securityHeaders, type BuildTarget } from "../../headers.config";

// Static servers for the two builds, for the specs that need the build without the daemon. Both bind 127.0.0.1 on a
// free port. `withHeaders: true` sends the build's real security headers (the same securityHeaders() the daemon's
// static server and the generated example files use); `false` sends none, to show the app is safe even when the CSP is
// missing (hostile.spec.ts). Neither is the daemon: no API, GET and HEAD only.

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export interface RunningStatic {
  readonly url: string;
  readonly origin: string;
  readonly port: number;
  readonly requests: string[];
  close(): Promise<void>;
}

export interface StaticOptions {
  readonly dir: string;
  readonly target: BuildTarget;
  readonly withHeaders: boolean;
}

export async function startStatic(options: StaticOptions): Promise<RunningStatic> {
  const root = resolve(options.dir);
  const headers = options.withHeaders ? securityHeaders(options.target) : [];
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    void (async () => {
      requests.push(`${request.method ?? "?"} ${request.url ?? "?"}`);
      const send = (status: number, body: string, type = "text/plain; charset=utf-8"): void => {
        for (const pair of headers) response.setHeader(pair.key, pair.value);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", type);
        response.statusCode = status;
        response.end(body);
      };
      if (request.method !== "GET" && request.method !== "HEAD") return send(405, "method not allowed\n");
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      } catch {
        return send(400, "bad request\n");
      }
      const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^[/\\]+/, "");
      const file = join(root, relative);
      if (file !== root && !file.startsWith(`${root}${sep}`)) return send(403, "forbidden\n");
      try {
        const info = await stat(file);
        if (!info.isFile()) return send(404, "not found\n");
        for (const pair of headers) response.setHeader(pair.key, pair.value);
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Content-Type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        response.setHeader("Content-Length", String(info.size));
        response.statusCode = 200;
        if (request.method === "HEAD") return void response.end();
        createReadStream(file).pipe(response);
      } catch {
        send(404, "not found\n");
      }
    })();
  });
  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    origin: `http://127.0.0.1:${port}`,
    port,
    requests,
    close: () =>
      new Promise<void>((resolveClosed, reject) => {
        server.close((error) => (error === undefined ? resolveClosed() : reject(error)));
        server.closeAllConnections();
      }),
  };
}

// A page that is not the Cockpit: it tries to talk to a given origin the way a hostile local page would. It is served
// from its own port, so its origin is `http://127.0.0.1:<other port>` (same host, different origin).
export async function startHostilePage(html: string): Promise<RunningStatic> {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    requests.push(`${request.method ?? "?"} ${request.url ?? "?"}`);
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");
    response.end(html);
  });
  await new Promise<void>((resolveListening, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    origin: `http://127.0.0.1:${port}`,
    port,
    requests,
    close: () =>
      new Promise<void>((resolveClosed, reject) => {
        server.close((error) => (error === undefined ? resolveClosed() : reject(error)));
        server.closeAllConnections();
      }),
  };
}
