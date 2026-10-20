import { InMemoryTransport, McpServer } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";
import { hashTypedData, keccak256, stringToHex } from "viem";

import { loadConfig, type EnvLike } from "../src/config.js";
import type { AuditEvent } from "../src/guardrails/audit.js";
import {
  POST_ROUTES,
  digestTag,
  matchGetRoute,
  type DigestForm,
  type Hex,
  type PostPath,
  type PreparedKind,
  type PreparedSign,
  type RelayCallOptions,
  type RelayClient,
  type RelayResult,
} from "../src/relay/contract.js";
import type { ErrorCode } from "../src/relay/errors.js";
import { FLAG_NAMES } from "../src/relay/flags.js";
import type { RelayToolDeps } from "../src/tools/relay-tool-kit.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { ANVIL_ACCOUNT_0_OWNER, type Address } from "../src/xo/chain/constants.js";

// Helpers for the tool tests (test/tools-*.test.ts): an in-memory MCP server driven over a linked
// transport, a stub RelayClient that records every call, and builders for answers that satisfy the
// relay contract. Nothing here touches the network. The keys and signatures are fake test strings.

export type Obj = Record<string, unknown>;

// 2026-10-19T12:00:00Z; every tool gets this clock.
export const NOW = Date.parse("2026-10-19T12:00:00Z");
// The public Anvil account 0 address (never a key) and the XO account derived from it.
export const OWNER: Address = ANVIL_ACCOUNT_0_OWNER;
export const ACCOUNT: Address = deriveAccount(OWNER);
// A relay key shaped like a real one; tests assert it never leaves the plugin.
export const RELAY_KEY = "test-relay-key-AbCdEf0123456789-XYZ";
export const RELAY_URL = "http://127.0.0.1:8787";

export const ENV_ON: EnvLike = Object.freeze({
  XO_RELAY_URL: RELAY_URL,
  XO_RELAY_KEY: RELAY_KEY,
  ENABLE_USEROP_SUBMIT: "1",
  ENABLE_TRADING: "1",
  ENABLE_WITHDRAW: "1",
});

// A fake 65-byte signature. The stub relay never verifies it.
export const SIGNATURE = `0x${"11".repeat(32)}${"22".repeat(32)}1b`;

// ---- MCP harness ------------------------------------------------------------------------------------------------

export interface CallResult {
  readonly isError: boolean;
  readonly text: string;
  readonly structured: Obj | undefined;
}

export interface Harness {
  call(name: string, args: Obj): Promise<CallResult>;
  list(): Promise<Obj[]>;
  close(): Promise<void>;
}

const closers: Array<() => Promise<void>> = [];
export async function closeAll(): Promise<void> {
  while (closers.length > 0) await closers.pop()?.();
}

export async function connect(register: (server: McpServer) => void): Promise<Harness> {
  const server = new McpServer({ name: "xo-market", version: "0.1.0" }, { supportedProtocolVersions: ["2026-07-28"] });
  register(server);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const pending = new Map<number, (message: Obj) => void>();
  clientSide.onmessage = (message) => {
    const id = (message as { id?: number }).id;
    if (id !== undefined) pending.get(id)?.(message as unknown as Obj);
  };
  await clientSide.start();
  let nextId = 1;
  const rpc = (method: string, params: Obj): Promise<Obj> => {
    const id = nextId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      void clientSide.send({
        jsonrpc: "2.0",
        id,
        method,
        params: {
          ...params,
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": { name: "tools-test", version: "0" },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      } as never);
    });
  };
  const close = async (): Promise<void> => {
    await clientSide.close();
    await server.close();
  };
  closers.push(close);
  return {
    async call(name, args) {
      const response = await rpc("tools/call", { name, arguments: args });
      const result = response["result"] as Obj | undefined;
      if (result === undefined) {
        // A JSON-RPC level error (for example an unknown tool).
        return { isError: true, text: JSON.stringify(response["error"] ?? response), structured: undefined };
      }
      const content = (result["content"] as Array<{ type: string; text: string }> | undefined) ?? [];
      return {
        isError: result["isError"] === true,
        text: content.map((item) => item.text).join("\n"),
        structured: result["structuredContent"] as Obj | undefined,
      };
    },
    async list() {
      const response = await rpc("tools/list", {});
      return (response["result"] as Obj)["tools"] as Obj[];
    },
    close,
  };
}

export function must<T>(value: T | undefined | null, label = "value"): T {
  if (value === undefined || value === null) throw new Error(`${label} is missing`);
  return value;
}
export const asObj = (value: unknown): Obj => value as Obj;
export const asArr = (value: unknown): Obj[] => value as Obj[];

// ---- the stub relay -------------------------------------------------------------------------------------------------

export interface StubCall {
  readonly method: "POST" | "GET";
  readonly path: string;
  readonly body: unknown;
  readonly options: RelayCallOptions | undefined;
}

export type StubHandler = (body: unknown, path: string) => RelayResult<unknown> | Promise<RelayResult<unknown>>;

export const ok = (data: unknown, status = 200): RelayResult<unknown> => ({ ok: true, status, data });
export const fail = (
  code: ErrorCode,
  message = `stub ${code}`,
  details?: Readonly<Record<string, string | number | boolean | null | readonly string[]>>,
  status = 0,
): RelayResult<unknown> => ({ ok: false, status, error: { code, message, ...(details === undefined ? {} : { details }) } });

// Answers by route key ("POST /v1/userop/prepare", "GET /v1/userop/:hash"). A route nobody
// registered answers not_implemented, like a real relay with no handler.
export class StubRelay implements RelayClient {
  readonly calls: StubCall[] = [];
  private readonly handlers = new Map<string, StubHandler>();

  on(route: string, answer: StubHandler | RelayResult<unknown> | object): this {
    const handler: StubHandler =
      typeof answer === "function"
        ? (answer as StubHandler)
        : "ok" in answer && typeof (answer as { ok: unknown }).ok === "boolean"
          ? () => answer as RelayResult<unknown>
          : () => ok(answer);
    this.handlers.set(route, handler);
    return this;
  }

  callsTo(route: string): StubCall[] {
    return this.calls.filter((call) => `${call.method} ${call.path}` === route || (call.method === "GET" && route === `GET ${matchGetRoute(call.path)?.route ?? ""}`));
  }

  async post<P extends PostPath>(path: P, body: unknown, options?: RelayCallOptions): Promise<never> {
    this.calls.push({ method: "POST", path, body, options });
    const handler = this.handlers.get(`POST ${path}`);
    const result = handler === undefined ? fail("not_implemented", `no stub for POST ${path}`) : await handler(body, path);
    return result as never;
  }

  async get(path: string, options?: RelayCallOptions): Promise<never> {
    this.calls.push({ method: "GET", path, body: undefined, options });
    const matched = matchGetRoute(path);
    const handler = matched === undefined ? undefined : this.handlers.get(`GET ${matched.route}`);
    const result = handler === undefined ? fail("not_implemented", `no stub for GET ${path}`) : await handler(matched?.params, path);
    return result as never;
  }
}

// ---- deps ---------------------------------------------------------------------------------------------------------------

export interface Built {
  readonly deps: RelayToolDeps;
  readonly relay: StubRelay;
  readonly events: AuditEvent[];
}

export function makeDeps(options: { env?: EnvLike; relay?: StubRelay; nowMs?: () => number } = {}): Built {
  const env = options.env ?? ENV_ON;
  const relay = options.relay ?? new StubRelay();
  const events: AuditEvent[] = [];
  const loaded = loadConfig(env);
  const deps: RelayToolDeps = {
    nowMs: options.nowMs ?? (() => NOW),
    config: () => loaded.config,
    env: () => env,
    relay: () => relay,
    audit: { write: (event) => events.push(event) },
  };
  return { deps, relay, events };
}

// ---- answers that satisfy the contract ------------------------------------------------------------------------------------

export function digestOf(seed: string): Hex {
  return keccak256(stringToHex(seed));
}

export function rawSign(digest: Hex, form: DigestForm): PreparedSign {
  return { intent: { op: "raw", rawSigningPayloadHex: digest }, expected_digest: digest, digest_form: form };
}

// A typed-data signing block (the ClobAuth shape), with its true EIP-712 digest.
export function typedAuthSign(): PreparedSign {
  const typedData = {
    types: { ClobAuth: [{ name: "address", type: "address" }, { name: "timestamp", type: "string" }, { name: "nonce", type: "uint256" }, { name: "message", type: "string" }] },
    primaryType: "ClobAuth",
    domain: { name: "ClobAuthDomain", version: "1", chainId: 3223 },
    message: { address: ACCOUNT, timestamp: "1792411200", nonce: 0, message: "This message attests that I control the given wallet" },
  };
  const digest = hashTypedData(typedData as never);
  return { intent: { op: "typedData", typedData: typedData as never }, expected_digest: digest, digest_form: "kernelWrappedClobAuth" };
}

export function isoSecond(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

const FORM_BY_KIND: Record<PreparedKind, DigestForm> = {
  userop: "userOpHash",
  create: "userOpHash",
  order: "kernelWrappedOrderHash",
  auth: "kernelWrappedClobAuth",
};

export interface PreparedOptions {
  readonly kind: PreparedKind;
  readonly seed: string;
  readonly owner?: string;
  readonly account?: string;
  readonly ttlS?: number;
  readonly lines?: string[];
  readonly warnings?: string[];
  readonly capabilities?: Record<string, "yes" | "no" | "unknown">;
  readonly sign?: PreparedSign;
  readonly reservedUsd?: string;
}

export function preparedBase(options: PreparedOptions): Obj & { sign: PreparedSign; summary: { lines: string[]; digest_tag: string } } {
  const sign = options.sign ?? rawSign(digestOf(options.seed), FORM_BY_KIND[options.kind]);
  return {
    prepared_id: keccak256(stringToHex(`id:${options.seed}`)).slice(2, 34),
    kind: options.kind,
    owner: options.owner ?? OWNER,
    account: options.account ?? ACCOUNT,
    expires_at: isoSecond(NOW + (options.ttlS ?? 300) * 1000),
    sign,
    summary: { lines: options.lines ?? ["Test decode line."], digest_tag: digestTag(sign.expected_digest) },
    caps: { reserved_usd: options.reservedUsd ?? "0", day_remaining_usd: "50" },
    capabilities: options.capabilities ?? { AD5: "unknown", UO7: "unknown" },
    warnings: options.warnings ?? [],
  };
}

export function userOpPrepared(options: Omit<PreparedOptions, "kind"> & { kind?: PreparedKind }): Obj {
  const base = preparedBase({ ...options, kind: options.kind ?? "userop" });
  const item = { ...base, user_op_hash: base.sign.expected_digest };
  return POST_ROUTES["/v1/userop/prepare"].response.parse(item) as Obj;
}

export function authPrepared(options: Omit<PreparedOptions, "kind"> = { seed: "auth" }): Obj {
  const base = preparedBase({ ttlS: 90, ...options, kind: "auth" });
  return POST_ROUTES["/v1/auth/prepare"].response.parse(base) as Obj;
}

export interface OrderQuote {
  price: string;
  shares: string;
  max_outlay_usd: string;
  fee_bound_bps: number;
  expires_at: string;
}

export function orderPrepared(options: Omit<PreparedOptions, "kind"> & { quote?: Partial<OrderQuote> } = { seed: "order" }): Obj {
  const base = preparedBase({ ...options, kind: "order" });
  const quote = { price: "0.5", shares: "10", max_outlay_usd: "5.4", fee_bound_bps: 800, expires_at: isoSecond(NOW + 300_000), ...(options.quote ?? {}) };
  return POST_ROUTES["/v1/order/prepare"].response.parse({ ...base, quote }) as Obj;
}

export function allFlags(overrides: Partial<Record<(typeof FLAG_NAMES)[number], boolean>> = {}): Record<string, boolean> {
  return Object.fromEntries(FLAG_NAMES.map((name) => [name, overrides[name] ?? false]));
}

export interface StatusOptions {
  state?: "undeployed" | "deployed_unregistered" | "registered";
  registered?: boolean;
  trading_enabled?: "yes" | "no" | "unknown";
  balance_usd?: string | null;
  credentials?: { state: "none" | "stored" | "validated" | "failed"; key_tag: string | null };
  flags?: Partial<Record<(typeof FLAG_NAMES)[number], boolean>>;
  tripwires?: { ok: boolean; tripped: Array<{ id: string; detail: string }> };
  capabilities?: Record<string, "yes" | "no" | "unknown">;
  account?: string;
}

export function statusResponse(options: StatusOptions = {}): Obj {
  const state = options.state ?? "registered";
  return POST_ROUTES["/v1/account/status"].response.parse({
    account: options.account ?? ACCOUNT,
    state,
    registered: options.registered ?? state === "registered",
    trading_enabled: options.trading_enabled ?? "unknown",
    balance_usd: options.balance_usd === undefined ? "25" : options.balance_usd,
    credentials: options.credentials ?? { state: "stored", key_tag: "k1a2b3c4" },
    flags: allFlags(options.flags ?? { ENABLE_USEROP_SUBMIT: true, ENABLE_TRADING: true }),
    tripwires: options.tripwires ?? { ok: true, tripped: [] },
    capabilities: options.capabilities ?? { AD5: "unknown", T1: "no", UO7: "yes" },
    upstream: {},
  }) as Obj;
}

// Validates a structured result against the JSON Schema a tool published. Used for refusals too:
// the SDK checks only successful results, but every result is meant to match.
export async function validateAgainstTool(harness: Harness, tool: string, structured: unknown): Promise<string | undefined> {
  const listed = must((await harness.list()).find((entry) => entry["name"] === tool), `tool ${tool}`);
  const validate = new Ajv2020({ strict: false, validateFormats: false, logger: false }).compile(asObj(listed["outputSchema"]));
  return validate(structured) ? undefined : JSON.stringify(validate.errors);
}
