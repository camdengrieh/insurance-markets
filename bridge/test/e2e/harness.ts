import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Starts the real Cockpit daemon in a child process (bridge/test/e2e/daemon-main.ts) and gives the suites a way to
// talk to it. Used by the node:test files in this directory and by the Playwright specs in app/e2e.
//
// Deliberately self-contained (Node built-ins only, no zod, no repo imports) so that it loads the same under tsx and
// under the Playwright loader, and so that nothing in a test can reach a different copy of the daemon's code than
// the child process runs.
//
// The child gets an almost empty environment (PATH and TMPDIR only): no flag, no key, no data directory setting.
// Every write path is therefore OFF, which is what the suites assert. The child binds 127.0.0.1 on a free port.

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_DIR = join(HERE, "..", "..", "..");
export const DEFAULT_APP_DIR = join(REPO_DIR, "app", "dist", "cockpit");
const LAUNCHER = join(HERE, "daemon-main.ts");

export interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly text: string;
  json(): unknown;
}

export interface RequestInput {
  readonly method?: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Buffer;
  // Default 127.0.0.1:<port>. null sends no Host header at all.
  readonly host?: string | null;
}

export interface Logged {
  readonly method: string;
  readonly path: string;
  readonly host: string | null | undefined;
  readonly reply: Reply;
}

export interface MockUrls {
  readonly dataApi: string;
  readonly orderbook: string;
}

export interface HostileMarket {
  readonly id: string;
  readonly title: string;
  readonly conditionId: string;
  readonly slug: string;
}

export interface StartOptions {
  readonly readOnly?: boolean;
  readonly hostile?: boolean;
  // Arguments of `serve` (--agent-scope, --rotate-agent-token, --port ...).
  readonly serveArgs?: readonly string[];
  readonly appDir?: string;
  readonly dataDir?: string;
  // How long to wait for the ready line.
  readonly startTimeoutMs?: number;
}

export interface E2eDaemon {
  readonly origin: string;
  readonly port: number;
  readonly pid: number;
  readonly role: "writer" | "read_only";
  readonly dataDir: string;
  readonly modules: readonly string[];
  readonly mock: MockUrls | null;
  readonly hostile: readonly HostileMarket[];
  // Everything the daemon wrote to stderr / stdout so far.
  stderr(): string;
  stdout(): string;
  // Pairing links announced on stderr, oldest first, as {url, code}.
  links(): readonly { readonly url: string; readonly code: string }[];
  // Waits for the Nth (1-based) pairing link.
  waitForLink(count: number, timeoutMs?: number): Promise<{ readonly url: string; readonly code: string }>;
  // The agent token printed once on first start, or null.
  agentToken(): string | null;
  // Hosts the proxy's upstream refused (the daemon never reaches a real host).
  blockedHosts(): readonly string[];
  kills(): number;
  // Every reply the helpers below received, in order (for "never any Set-Cookie" style sweeps).
  log(): readonly Logged[];
  request(input: RequestInput): Promise<Reply>;
  postJson(path: string, body: unknown, headers?: Readonly<Record<string, string>>): Promise<Reply>;
  getJson(path: string, token?: string, headers?: Readonly<Record<string, string>>): Promise<Reply>;
  // Pairs with the newest unused link and returns the ui token (throws if the daemon refuses).
  pair(): Promise<{ readonly token: string; readonly scopes: readonly string[] }>;
  raw(text: string, waitMs?: number): Promise<string>;
  stop(): Promise<void>;
}

const LINK = /(http:\/\/127\.0\.0\.1:\d+)\/#pair=([0-9a-f]{32})/g;
const AGENT = /NEW AGENT TOKEN[^\n]*\n\s+(cka_[A-Za-z0-9_-]{43})/;

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function makeRequest(port: number, input: RequestInput): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(input.headers ?? {}) };
    if (input.host !== null) headers["host"] = input.host ?? `127.0.0.1:${port}`;
    const req = httpRequest({ host: "127.0.0.1", port, method: input.method ?? "GET", path: input.path, headers, setHost: false, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) as unknown });
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (input.body !== undefined) req.write(input.body);
    req.end();
  });
}

export function rawExchange(port: number, text: string, waitMs = 250): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => socket.write(text));
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    let finished = false;
    const done = (): void => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    socket.on("end", done);
    socket.on("close", done);
    setTimeout(done, waitMs).unref();
  });
}

function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), ms);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function startE2eDaemon(options: StartOptions = {}): Promise<E2eDaemon> {
  const args = ["--import", "tsx", LAUNCHER];
  if (options.dataDir !== undefined) args.push("--data-dir", options.dataDir);
  if (options.readOnly === true) args.push("--read-only");
  if (options.hostile === false) args.push("--no-hostile");
  args.push("--app-dir", options.appDir ?? DEFAULT_APP_DIR, ...(options.serveArgs ?? []));
  const env: Record<string, string> = {};
  for (const name of ["PATH", "TMPDIR"]) {
    const value = process.env[name];
    if (value !== undefined) env[name] = value;
  }
  const child = spawn(process.execPath, args, { cwd: REPO_DIR, env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  const blocked: string[] = [];
  let kills = 0;
  let ready: Record<string, unknown> | undefined;
  let readyWaiter: { resolve(): void; reject(error: Error): void } | undefined;
  const linkWaiters: { count: number; resolve(link: { url: string; code: string }): void }[] = [];
  const seenLinks: { url: string; code: string }[] = [];
  let stdoutTail = "";
  let stderrScan = 0;

  const scanLinks = (): void => {
    LINK.lastIndex = stderrScan;
    for (let match = LINK.exec(err); match !== null; match = LINK.exec(err)) {
      seenLinks.push({ url: `${match[1]}/#pair=${match[2]}`, code: match[2] as string });
      stderrScan = LINK.lastIndex;
    }
    for (const waiter of [...linkWaiters]) {
      const link = seenLinks[waiter.count - 1];
      if (link !== undefined) {
        linkWaiters.splice(linkWaiters.indexOf(waiter), 1);
        waiter.resolve(link);
      }
    }
  };
  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    out += text;
    stdoutTail += text;
    const lines = stdoutTail.split("\n");
    stdoutTail = lines.pop() ?? "";
    for (const line of lines) {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event["event"] === "ready") {
        ready = event;
        readyWaiter?.resolve();
      } else if (event["event"] === "blocked" && typeof event["host"] === "string") blocked.push(event["host"]);
      else if (event["event"] === "kill") kills += 1;
      else if (event["event"] === "unavailable") readyWaiter?.reject(new Error(`the mock XO is unavailable: ${String(event["reason"])}`));
    }
  });
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString("utf8");
    scanLinks();
  });

  const started = new Promise<void>((resolve, reject) => {
    readyWaiter = { resolve, reject };
    child.once("exit", (code) => reject(new Error(`the e2e daemon exited with code ${String(code)} before it was ready; stderr: ${err.slice(0, 600)}`)));
  });
  const timer = setTimeout(() => readyWaiter?.reject(new Error("the e2e daemon did not become ready in time")), options.startTimeoutMs ?? 60_000);
  try {
    await started;
  } catch (error) {
    child.kill("SIGKILL");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const replies: Logged[] = [];
  const send = async (input: RequestInput): Promise<Reply> => {
    const reply = await makeRequest(Number(ready?.["port"]), input);
    replies.push({ method: input.method ?? "GET", path: input.path, host: input.host, reply });
    return reply;
  };
  const info = ready as Record<string, unknown>;
  const port = Number(info["port"]);
  const dataDir = String(info["dataDir"]);

  const daemon: E2eDaemon = {
    origin: String(info["origin"]),
    port,
    pid: Number(info["pid"]),
    role: info["role"] === "read_only" ? "read_only" : "writer",
    dataDir,
    modules: (info["modules"] as string[] | undefined) ?? [],
    mock: (info["mock"] as MockUrls | null | undefined) ?? null,
    hostile: (info["hostile"] as HostileMarket[] | undefined) ?? [],
    stderr: () => err,
    stdout: () => out,
    links: () => [...seenLinks],
    waitForLink: (count, timeoutMs = 10_000) =>
      new Promise((resolve, reject) => {
        const existing = seenLinks[count - 1];
        if (existing !== undefined) return resolve(existing);
        const timeout = setTimeout(() => reject(new Error(`no pairing link number ${count} was announced`)), timeoutMs);
        linkWaiters.push({
          count,
          resolve: (link) => {
            clearTimeout(timeout);
            resolve(link);
          },
        });
      }),
    agentToken: () => AGENT.exec(err)?.[1] ?? null,
    blockedHosts: () => [...blocked],
    kills: () => kills,
    log: () => [...replies],
    request: send,
    postJson: (path, body, headers = {}) => send({ method: "POST", path, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }),
    getJson: (path, token, headers = {}) => send({ path, headers: { ...(token === undefined ? {} : bearer(token)), ...headers } }),
    pair: async () => {
      const links = seenLinks;
      const link = links[links.length - 1];
      if (link === undefined) throw new Error("no pairing link has been announced");
      const reply = await send({ method: "POST", path: "/ui/pair", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: link.code }) });
      if (reply.status !== 200) throw new Error(`pairing was refused (${reply.status})`);
      const body = reply.json() as { token: string; scopes: string[] };
      return { token: body.token, scopes: body.scopes };
    },
    raw: (text, waitMs) => rawExchange(port, text, waitMs),
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
        if (!(await waitForExit(child, 10_000))) {
          child.kill("SIGKILL");
          await waitForExit(child, 5_000);
        }
      }
      if (options.dataDir === undefined) await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
  return daemon;
}

// A tiny stand-in for the built Cockpit app, for suites that test the daemon and not the page.
export async function makeFixtureApp(): Promise<string> {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "cockpit-e2e-app-"));
  await writeFile(join(dir, "index.html"), "<!doctype html><html><head><meta charset=\"utf-8\"><title>fixture</title></head><body><div id=\"root\"></div></body></html>\n");
  await writeFile(join(dir, "app.js"), "export {};\n");
  await writeFile(join(dir, ".secret"), "dot files are never served\n");
  return dir;
}

export interface SseEvent {
  readonly id: number | null;
  readonly event: string | null;
  readonly data: string;
}

export interface SseStream {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  events(): readonly SseEvent[];
  // Resolves with the first event (seen so far or later) that satisfies `match`.
  waitFor(match: (event: SseEvent) => boolean, timeoutMs?: number): Promise<SseEvent>;
  // The raw text received, for "nothing secret on the stream" scans.
  text(): string;
  closed(): boolean;
  close(): void;
}

// A streaming GET for text/event-stream (the fetch of a page would do the same). Resolves once the response
// headers arrive; a refusal (401, 403, 422) comes back as a stream that is already closed with its status.
export function openSse(port: number, path: string, headers: Readonly<Record<string, string>> = {}): Promise<SseStream> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method: "GET", path, headers: { host: `127.0.0.1:${port}`, accept: "text/event-stream", ...headers }, setHost: false, agent: false },
      (res) => {
        let buffer = "";
        let all = "";
        let ended = false;
        const events: SseEvent[] = [];
        const waiters: { match: (event: SseEvent) => boolean; resolve(event: SseEvent): void }[] = [];
        const parse = (block: string): void => {
          let id: number | null = null;
          let event: string | null = null;
          const data: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith(":")) continue;
            if (line.startsWith("id:")) id = Number(line.slice(3).trim());
            else if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
          }
          if (data.length === 0 && event === null && id === null) return;
          const parsed: SseEvent = { id, event, data: data.join("\n") };
          events.push(parsed);
          for (const waiter of [...waiters]) {
            if (waiter.match(parsed)) {
              waiters.splice(waiters.indexOf(waiter), 1);
              waiter.resolve(parsed);
            }
          }
        };
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          all += chunk;
          buffer += chunk;
          let at = buffer.indexOf("\n\n");
          while (at !== -1) {
            parse(buffer.slice(0, at));
            buffer = buffer.slice(at + 2);
            at = buffer.indexOf("\n\n");
          }
        });
        res.on("end", () => (ended = true));
        res.on("close", () => (ended = true));
        res.on("error", () => (ended = true));
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          events: () => [...events],
          waitFor: (match, timeoutMs = 10_000) =>
            new Promise((resolveEvent, rejectEvent) => {
              const seen = events.find(match);
              if (seen !== undefined) return resolveEvent(seen);
              const timer = setTimeout(() => rejectEvent(new Error("no matching event arrived")), timeoutMs);
              waiters.push({
                match,
                resolve: (event) => {
                  clearTimeout(timer);
                  resolveEvent(event);
                },
              });
            }),
          text: () => all,
          closed: () => ended,
          close: () => req.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}
