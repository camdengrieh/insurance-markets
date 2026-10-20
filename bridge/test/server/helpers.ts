import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";

import { Auth, type InstanceRole, type RandomBytes } from "../../auth.js";
import type { TokenScope } from "../../contract.js";
import { startDaemon, type BridgeModuleSource, type Daemon, type DaemonAuditRecord, type DaemonOptions } from "../../server.js";
import type { StaticSite } from "../../static.js";

// Shared helpers for the daemon front tests: deterministic randomness, an injected clock, a captured stderr,
// and plain node:http / node:net clients (fetch cannot set a Host header or send a malformed request).

export interface FakeClock {
  now: number;
  (): number;
}

export function fakeClock(start = Date.UTC(2026, 9, 19, 12, 0, 0)): FakeClock {
  const clock = (() => clock.now) as FakeClock;
  clock.now = start;
  return clock;
}

// Counter-based bytes from SHA-256: fixed seed, no Math.random, different on every call.
export function seededRandom(seed: string): RandomBytes {
  let counter = 0;
  return (size) => {
    const out = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const block = createHash("sha256").update(`${seed}:${counter}`).digest();
      counter += 1;
      block.copy(out, offset, 0, Math.min(block.length, size - offset));
      offset += block.length;
    }
    return out;
  };
}

export interface Captured {
  readonly text: () => string;
  readonly write: (text: string) => void;
}

export function captureStderr(): Captured {
  const chunks: string[] = [];
  return { text: () => chunks.join(""), write: (text) => void chunks.push(text) };
}

export interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  readonly text: string;
  json(): unknown;
}

export interface RequestInput {
  readonly port: number;
  readonly method?: string;
  readonly path: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Buffer;
  // Default: Host = 127.0.0.1:<port>.
  readonly host?: string | null;
}

export function send(input: RequestInput): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(input.headers ?? {}) };
    if (input.host !== null) headers["host"] = input.host ?? `127.0.0.1:${input.port}`;
    const req = httpRequest({ host: "127.0.0.1", port: input.port, method: input.method ?? "GET", path: input.path, headers, setHost: false, agent: false }, (res) => {
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

export function postJson(port: number, path: string, body: unknown, headers: Readonly<Record<string, string>> = {}): Promise<Reply> {
  return send({ port, method: "POST", path, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

// One raw TCP exchange: for requests node:http would refuse to build (duplicate Host, absolute-form target).
export function raw(port: number, text: string, waitMs = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => socket.write(text));
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    const done = (): void => {
      socket.destroy();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    socket.on("end", done);
    socket.on("close", done);
    setTimeout(done, waitMs).unref();
  });
}

export interface TestDaemon {
  readonly daemon: Daemon;
  readonly port: number;
  readonly auth: Auth;
  readonly clock: FakeClock;
  readonly stderr: Captured;
  readonly audit: DaemonAuditRecord[];
  role: InstanceRole;
  // Pairs a page: returns its ui token.
  pair(): Promise<string>;
  stop(): Promise<void>;
}

export interface TestDaemonOptions {
  readonly modules?: readonly { readonly name: string; readonly source: BridgeModuleSource }[];
  readonly site?: StaticSite;
  readonly role?: InstanceRole;
  readonly agentScopes?: readonly TokenScope[];
  readonly agentHash?: { readonly id: string; readonly sha256: string };
  readonly extraRouteKeys?: readonly string[];
  readonly maxBodyBytes?: number;
  readonly requestsPerSecond?: number;
  readonly daemon?: Partial<DaemonOptions>;
}

export async function startTestDaemon(options: TestDaemonOptions = {}): Promise<TestDaemon> {
  const clock = fakeClock();
  const random = seededRandom("daemon-front");
  const stderr = captureStderr();
  const state = { role: options.role ?? ("writer" as InstanceRole) };
  const auth = new Auth({
    clock,
    random,
    instance: () => state.role,
    ...(options.agentScopes === undefined ? {} : { agentScopes: options.agentScopes }),
    ...(options.agentHash === undefined ? {} : { agentHash: options.agentHash }),
  });
  const daemon = await startDaemon({
    version: "0.0.0-test",
    stderr,
    clock,
    random,
    auth,
    ...(options.site === undefined ? {} : { site: options.site }),
    ...(options.modules === undefined ? {} : { modules: options.modules }),
    ...(options.extraRouteKeys === undefined ? {} : { extraRouteKeys: options.extraRouteKeys }),
    ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
    ...(options.requestsPerSecond === undefined ? {} : { requestsPerSecond: options.requestsPerSecond }),
    ...options.daemon,
  });
  const audit: DaemonAuditRecord[] = [];
  daemon.host.onAudit((record) => audit.push(record), { replay: true });
  return {
    daemon,
    port: daemon.port,
    auth,
    clock,
    stderr,
    audit,
    get role() {
      return state.role;
    },
    set role(value: InstanceRole) {
      state.role = value;
    },
    async pair() {
      const grant = auth.issuePairing();
      const reply = await postJson(daemon.port, "/ui/pair", { code: grant.code });
      if (reply.status !== 200) throw new Error(`pairing failed: ${reply.status}`);
      return (reply.json() as { token: string }).token;
    },
    stop: () => daemon.close(),
  };
}
