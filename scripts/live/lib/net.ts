import { createHash } from "node:crypto";

import { RELAY_KEY_HEADER, RELAY_USER_AGENT } from "../../../src/relay/contract.js";
import { describeBody, describeHeaders, describeUrl, type Printer } from "./redact.js";
import type { ReadLimit, WriteAllowance } from "./types.js";

// The one place every request of a live-kit run passes through, on both targets:
//
//   * script -> relay (loopback, layer "relay") and relay -> XO / Base (layer "upstream") alike;
//   * each call is PRINTED (method, URL without query values, body with secrets masked) BEFORE it is made;
//   * a host outside the allowlist, a header that could identify a person or leak the relay key, a user
//     agent other than the pinned one, a write that the test did not list, a second copy of the same write
//     and any signing or sending JSON-RPC method (apart from the bundler's eth_sendUserOperation) are
//     refused before anything leaves;
//   * a 401 or 403 from a host that XO documents as needing a key (and serves without) latches: the run
//     stops, nothing more goes to that host, and nobody looks for a key. A Cloudflare challenge is the
//     same: it is not worked around.
//
// The same code runs on the mock target (the underlying fetch maps the real host names to local
// listeners), so the sequence a rehearsal prints is the sequence the live run will make.

export class NetBlocked extends TypeError {
  readonly rule: string;
  constructor(rule: string, message: string) {
    super(message);
    this.name = "NetBlocked";
    this.rule = rule;
  }
}

export interface RecordedCall {
  readonly n: number;
  readonly layer: "relay" | "upstream";
  readonly method: string;
  readonly host: string;
  readonly path: string;
  readonly search: string;
  // The JSON-RPC method of a POST body, when it has one.
  readonly rpc: string | undefined;
  readonly write: boolean;
  readonly label: string;
  readonly status: number | undefined;
  readonly blocked: string | undefined;
  readonly atMs: number;
  // "arrange" for the mock's own set-up (what earlier tests would have left behind), "run" for the test itself.
  readonly phase: "arrange" | "run";
}

export interface NetTrip {
  readonly rule: string;
  readonly message: string;
}

export interface NetOptions {
  // For the upstream layer: the real network on the live target, the mock's mapped fetch on the mock.
  readonly baseFetch: typeof fetch;
  // For the loopback relay (default: the global fetch).
  readonly relayFetch?: typeof fetch;
  readonly printer: Printer;
  readonly nowMs: () => number;
  // Real host names (lower case) the run may talk to besides the relay.
  readonly allowedHosts: readonly string[];
  // Hosts where 401 or 403 means the door closed (XO documents a key; none is needed today).
  readonly keylessHosts: readonly string[];
  readonly writes: readonly WriteAllowance[];
  readonly readLimits?: readonly ReadLimit[];
  readonly userAgent?: string;
  // false: nothing is printed (the script's own quiet set-up on the mock).
  readonly print?: boolean;
}

interface Classified {
  readonly layer: "relay" | "upstream";
  readonly write: boolean;
  readonly label: string;
  readonly forbidden: string | undefined;
  readonly rpc: string | undefined;
}

const RELAY_WRITE_PATHS = new Set(["/v1/userop/submit", "/v1/auth/submit", "/v1/order/submit", "/v1/order/cancel"]);
const BANNED_RPC = /^(?:eth_send(?!UserOperation$)|eth_sign|eth_accounts|personal_|debug_|anvil_|evm_|hardhat_|admin_|txpool_|engine_|miner_)/;
const FORBIDDEN_HEADERS = new Set(["from", "referer", "origin", "cookie", "authorization", "proxy-authorization", "x-forwarded-for", "x-real-ip", "forwarded", "via"]);
const SHORT_HOST: Readonly<Record<string, string>> = {
  "orderbooks.xo.market": "orderbook",
  "mainnet-bundler.xo.market": "bundler",
  "rpc-mainnet-2.xo.market": "xo-rpc",
  "explorer-mainnet.xo.market": "explorer",
  "api-mainnet.xo.market": "data-api",
};

function shortHost(host: string): string {
  return SHORT_HOST[host] ?? host;
}

function normalisePath(path: string): string {
  return path
    .split("/")
    .map((segment) => (/^(?:0x[0-9a-fA-F]{16,}|[0-9]{6,})$/.test(segment) ? ":id" : segment))
    .join("/");
}

function rpcMethodOf(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (Array.isArray(parsed)) return "(batch)";
    if (typeof parsed === "object" && parsed !== null && typeof (parsed as { method?: unknown }).method === "string") return (parsed as { method: string }).method;
  } catch {
    // not JSON
  }
  return undefined;
}

export function normaliseHeaders(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const headers = init?.headers;
  if (headers === undefined) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, name) => {
      out[name.toLowerCase()] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const [name, value] of headers as [string, string][]) out[String(name).toLowerCase()] = String(value);
  } else {
    for (const [name, value] of Object.entries(headers as Record<string, string>)) out[name.toLowerCase()] = String(value);
  }
  return out;
}

export class Net {
  readonly calls: RecordedCall[] = [];
  readonly #options: NetOptions;
  readonly #counts = new Map<string, number>();
  readonly #readCounts = new Map<string, number>();
  readonly #bodies = new Set<string>();
  readonly #latched = new Set<string>();
  #relayOrigin: string | undefined;
  #seq = 0;
  #trip: NetTrip | undefined;
  #quiet = false;
  #arranging = false;

  constructor(options: NetOptions) {
    this.#options = options;
  }

  setRelayOrigin(origin: string): void {
    this.#relayOrigin = origin;
  }

  // Prints nothing while `fn` runs (the mock's own set-up). Calls are still recorded and still checked.
  async quietly<T>(fn: () => Promise<T>): Promise<T> {
    const was = this.#quiet;
    this.#quiet = true;
    try {
      return await fn();
    } finally {
      this.#quiet = was;
    }
  }

  // The mock's own set-up: quiet, and the test's write list does not apply (and does not count). Everything
  // else still does: hosts, the user agent, the forbidden methods.
  async arranging<T>(fn: () => Promise<T>): Promise<T> {
    const was = this.#arranging;
    this.#arranging = true;
    try {
      return await this.quietly(fn);
    } finally {
      this.#arranging = was;
    }
  }

  get tripped(): NetTrip | undefined {
    return this.#trip;
  }

  writeCount(label: string): number {
    return this.#counts.get(label) ?? 0;
  }

  // The writes made so far, in order.
  writesMade(): readonly RecordedCall[] {
    return this.calls.filter((call) => call.write && call.blocked === undefined && call.phase === "run");
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw this.#block("url", "a request URL could not be parsed");
    }
    const method = (init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const headers = normaliseHeaders(init);
    const body = typeof init?.body === "string" ? init.body : init?.body === undefined || init.body === null ? undefined : "[non-text body]";
    const classified = this.#classify(url, method, body);
    const n = ++this.#seq;
    const print = this.#options.print !== false && !this.#quiet;
    const say = (text: string): void => {
      if (print) this.#options.printer.line(text);
    };

    const refusal = this.#check(classified, url, headers, body);
    const record = (status: number | undefined, blocked: string | undefined): void => {
      this.calls.push({
        n,
        layer: classified.layer,
        method,
        host: url.host,
        path: url.pathname,
        search: url.search,
        rpc: classified.rpc,
        write: classified.write,
        label: classified.label,
        status,
        blocked,
        atMs: this.#options.nowMs(),
        phase: this.#arranging ? "arrange" : "run",
      });
    };

    say(`-> [${String(n)}] ${method} ${describeUrl(url)}  (${classified.layer === "relay" ? "this machine's relay" : "upstream"}${classified.write ? ", WRITE" : ""})`);
    if (classified.rpc !== undefined) say(`      json-rpc: ${classified.rpc}`);
    say(`      headers: ${describeHeaders(headers)}`);
    if (body !== undefined) say(`      body: ${describeBody(body)}`);

    if (refusal !== undefined) {
      record(undefined, refusal.rule);
      say(`<- [${String(n)}] BLOCKED before sending: ${refusal.message}`);
      throw this.#block(refusal.rule, refusal.message);
    }
    if (classified.write && !this.#arranging) {
      this.#counts.set(classified.label, (this.#counts.get(classified.label) ?? 0) + 1);
      this.#bodies.add(`${classified.label}\n${createHash("sha256").update(body ?? "").digest("hex")}`);
    }

    let response: Response;
    try {
      response = await (classified.layer === "relay" ? (this.#options.relayFetch ?? ((i, n) => globalThis.fetch(i, n))) : this.#options.baseFetch)(input, init);
    } catch (error) {
      record(undefined, undefined);
      say(`<- [${String(n)}] no answer (${error instanceof Error ? error.name : "error"})`);
      throw error;
    }
    record(response.status, undefined);
    const length = response.headers.get("content-length");
    say(`<- [${String(n)}] ${String(response.status)}${length === null ? "" : ` (${length} bytes)`}`);
    this.#watch(classified, url, response);
    return response;
  };

  #classify(url: URL, method: string, body: string | undefined): Classified {
    const host = url.hostname.toLowerCase();
    const isRelay = this.#relayOrigin !== undefined && url.origin === this.#relayOrigin;
    if (isRelay) {
      const write = method === "POST" && RELAY_WRITE_PATHS.has(url.pathname);
      return { layer: "relay", write, label: `relay ${method} ${url.pathname}`, forbidden: undefined, rpc: undefined };
    }
    const rpc = method === "POST" ? rpcMethodOf(body) : undefined;
    const short = shortHost(host);
    if (rpc !== undefined && (BANNED_RPC.test(rpc) || rpc === "(batch)")) {
      return { layer: "upstream", write: true, label: `${short} ${rpc}`, forbidden: `the JSON-RPC method ${rpc} is never sent by the live kit`, rpc };
    }
    if (rpc === "eth_sendUserOperation") {
      return { layer: "upstream", write: true, label: `${short} eth_sendUserOperation`, forbidden: host === "mainnet-bundler.xo.market" ? undefined : "eth_sendUserOperation goes only to the XO bundler", rpc };
    }
    if (method === "POST" || method === "DELETE") {
      // JSON-RPC reads are POSTs too.
      if (method === "POST" && rpc !== undefined && host !== "orderbooks.xo.market") {
        return { layer: "upstream", write: false, label: `${short} ${rpc}`, forbidden: undefined, rpc };
      }
      return { layer: "upstream", write: true, label: `${short} ${method} ${normalisePath(url.pathname)}`, forbidden: undefined, rpc };
    }
    return { layer: "upstream", write: false, label: `${short} ${method} ${normalisePath(url.pathname)}`, forbidden: undefined, rpc };
  }

  #check(classified: Classified, url: URL, headers: Record<string, string>, body: string | undefined): NetTrip | undefined {
    const host = url.hostname.toLowerCase();
    if (this.#trip !== undefined && classified.layer === "upstream") {
      return { rule: "stopped", message: `the run already hit a stop rule (${this.#trip.rule}); nothing more is sent` };
    }
    if (classified.forbidden !== undefined) return { rule: "forbidden_call", message: classified.forbidden };
    const agent = this.#options.userAgent ?? RELAY_USER_AGENT;
    if (headers["user-agent"] !== agent) return { rule: "user_agent", message: `the user agent must be exactly ${agent}` };
    for (const name of Object.keys(headers)) {
      if (FORBIDDEN_HEADERS.has(name)) return { rule: "identifying_header", message: `the header ${name} is never sent` };
    }
    if (classified.layer === "upstream") {
      if (headers[RELAY_KEY_HEADER] !== undefined) return { rule: "relay_key_leak", message: "the relay key must never leave this machine" };
      if (url.protocol !== "https:") return { rule: "scheme", message: "upstream requests are https only" };
      if (url.username !== "" || url.password !== "") return { rule: "credentials_in_url", message: "a URL with credentials is never used" };
      if (!this.#options.allowedHosts.includes(host)) return { rule: "host_not_allowed", message: `${host} is not on this run's host list` };
      if (this.#latched.has(host)) return { rule: "host_latched", message: `${host} answered 401, 403 or a challenge earlier in this run; nothing more is sent to it` };
    } else if (url.hostname !== "127.0.0.1") {
      return { rule: "host_not_allowed", message: "the relay is on 127.0.0.1" };
    }
    if (classified.write && !this.#arranging) {
      const allowance = this.#options.writes.find((entry) => entry.label === classified.label);
      if (allowance === undefined) return { rule: "write_not_listed", message: `this test does not list the write "${classified.label}"` };
      const made = this.#counts.get(classified.label) ?? 0;
      if (made >= allowance.max) return { rule: "write_limit", message: `"${classified.label}" is limited to ${String(allowance.max)} in this test and it was made ${String(made)} time(s); a write is never repeated` };
      const digest = `${classified.label}\n${createHash("sha256").update(body ?? "").digest("hex")}`;
      if (allowance.allowDuplicate !== true && this.#bodies.has(digest)) return { rule: "write_repeated", message: `the same write "${classified.label}" was already made; a write is never retried` };
    }
    if (!this.#arranging && !classified.write) {
      for (const limit of this.#options.readLimits ?? []) {
        if (!limit.labels.includes(classified.label)) continue;
        const seen = this.#readCounts.get(limit.name) ?? 0;
        if (seen >= limit.max) return { rule: "read_limit", message: `${limit.name}: at most ${String(limit.max)} (the test's stop rule); the ${String(limit.max + 1)}th is not made` };
        this.#readCounts.set(limit.name, seen + 1);
      }
    }
    return undefined;
  }

  #watch(classified: Classified, url: URL, response: Response): void {
    if (classified.layer !== "upstream") return;
    const host = url.hostname.toLowerCase();
    const challenged = response.headers.get("cf-mitigated") !== null || (response.status === 403 && /cloudflare/i.test(response.headers.get("server") ?? ""));
    if (challenged) {
      this.#latched.add(host);
      this.#trip ??= { rule: "cloudflare", message: `${host} answered with a Cloudflare challenge. The kit does not work around it. Stop.` };
      return;
    }
    if ((response.status === 401 || response.status === 403) && this.#options.keylessHosts.includes(host)) {
      this.#latched.add(host);
      this.#trip ??= { rule: "requires_key", message: `${host} answered ${String(response.status)}: it now asks for a key. Recorded as "requires key"; the kit does not look for one. Stop.` };
    }
  }

  #block(rule: string, message: string): NetBlocked {
    // A blocked call is a stop rule: the run ends and nothing more goes upstream. (The two rules below are
    // only the consequence of one that was already hit.)
    if (rule !== "stopped" && rule !== "host_latched") this.#trip ??= { rule, message };
    return new NetBlocked(rule, message);
  }
}
