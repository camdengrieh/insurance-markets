import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { rm } from "node:fs/promises";

import { encodeAbiParameters, getAddress, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

import { Secret } from "../src/config.js";
import { createRelayClient } from "../src/relay/client.js";
import type { GetPath, PostPath, PostRequest, PostResponse, Prepared, RelayClient, RelayResult } from "../src/relay/contract.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { CTF_EXCHANGE, NONCE_INCREMENTED_TOPIC } from "../src/xo/chain/constants.js";
import { decodeOrderAmounts, formatMicro, formatTick, hashOrder, orderFromWire } from "../src/xo/signing/index.js";
import { createRelay, type CreateRelayOptions, type Relay } from "../relay/main.js";
import { ORDER_FILLED_TOPIC, createOrderRoutes, type OrderRouteDeps, type OrderRoutes } from "../relay/orders.js";
import type { AccountDirectory, AccountReading } from "../relay/health.js";
import type { RelayContext, RelayServices } from "../relay/types.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { FakeClock, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, tempDir, type TempDir } from "./relay-core-helpers.js";
import { checkDecoded } from "./relay-decoded-check.js";

// Shared rig for the relay-orders tests. Not a test file.
//
// Everything here is local and deterministic: a scripted stand-in for XO's order book and explorer (no
// network), an injected clock, a seeded salt source, and the public Anvil/Hardhat TEST keys, which hold
// nothing anywhere and are labelled as test keys. Nothing signs or sends anything real.

// PUBLIC TEST KEYS: Anvil/Hardhat default accounts 0 and 1. Never fund them.
export const OWNER_KEY: PrivateKeyAccount = ANVIL_TEST_ACCOUNTS[0] as PrivateKeyAccount;
export const STRANGER_KEY: PrivateKeyAccount = ANVIL_TEST_ACCOUNTS[1] as PrivateKeyAccount;

// A made-up token id and condition id (decimal and 32-byte hex), as the order book spells them.
export const TOKEN_ID = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
export const OTHER_TOKEN_ID = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
export const CONDITION_ID = "0x99b2ff7bfebd5e3dd1bd4d0d3d632e09e52b4451653d52eb3be5df917b936cc5";

export const hash32 = (n: number): Hex => `0x${n.toString(16).padStart(64, "0")}` as Hex;

// ---- a scripted XO ----------------------------------------------------------------------------------------------

export type PostBehavior =
  | { readonly kind: "accept" }
  // A definite refusal: a 4xx with this error text.
  | { readonly kind: "reject"; readonly status: number; readonly error: string }
  // HTTP 200 with success:false (how a FOK that did not fill answers).
  | { readonly kind: "success_false"; readonly errorMsg: string }
  // The request never gets an answer (until the caller aborts it).
  | { readonly kind: "hang" }
  // The order is placed and the response is lost on the way back.
  | { readonly kind: "lost_response" }
  // The order is placed and the connection then hangs until the caller aborts it.
  | { readonly kind: "place_then_hang" }
  // The answer waits for openGate(), then the order is placed and accepted.
  | { readonly kind: "gate" }
  | { readonly kind: "http"; readonly status: number; readonly body: string; readonly headers?: Record<string, string> };

export interface FakeOrder {
  readonly hash: string;
  readonly id: number;
  readonly account: string;
  readonly tokenId: string;
  readonly side: 0 | 1;
  readonly tick: number;
  readonly sharesMicro: bigint;
  readonly expiration: number;
  status: "LIVE" | "MATCHED" | "CANCELED" | "EXPIRED";
  matchedMicro: bigint;
  orderType: string;
  feeRateBps?: number;
}

export interface PostRecord {
  readonly body: { readonly order: Record<string, unknown>; readonly orderType: string; readonly postOnly?: boolean };
  readonly headers: Record<string, string>;
  readonly prefix: string;
  readonly hash: string;
}

export interface Triplet {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export const TEST_TRIPLET: Triplet = Object.freeze({ apiKey: "test-api-key-0001", secret: "dGVzdC1obWFjLXNlY3JldC0wMDAxLXNlY3JldA==", passphrase: "test-passphrase-0001" });

export function hmacReference(secret: string, mode: "b64url-decoded-padded" | "stripped" | "raw", message: string): string {
  const key = mode === "raw" ? Buffer.from(secret, "utf8") : Buffer.from(secret.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, ""), "base64");
  const text = createHmac("sha256", key).update(message, "utf8").digest("base64").replace(/\+/g, "-").replace(/\//g, "_");
  return mode === "stripped" ? text.replace(/=+$/, "") : text;
}

const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// The clock a rig runs on: the relay's injected clock, which the tests also move. FakeClock is one; the
// mock-backed tests use an adapter over the mock's clock.
export interface RigClock {
  readonly now: () => number;
  advance(ms: number): void;
  set(iso: string): void;
  readonly sleep: (ms: number) => Promise<void>;
}

export class FakeXo {
  readonly clock: RigClock;
  // XO's clock minus the relay's, in seconds.
  skewS = 0;
  readonly unknownTokens = new Set<string>();
  readonly bookByToken = new Map<string, Record<string, unknown>>();
  readonly orders = new Map<string, FakeOrder>();
  readonly posts: PostRecord[] = [];
  readonly deletes: Array<{ readonly body: Record<string, unknown>; readonly headers: Record<string, string> }> = [];
  readonly requests: string[] = [];
  readonly postQueue: PostBehavior[] = [];
  // After the queue is empty every POST gets this.
  defaultPost: PostBehavior = { kind: "accept" };
  // DELETE /order: which body key and id form the fake server takes.
  cancelBody: "orderID-hash" | "orderId" | "numeric-id" = "orderID-hash";
  deleteStatusOverride: { readonly status: number; readonly body: string } | undefined;
  // The DELETE is carried out and the response is lost on the way back.
  deleteLosesResponse = false;
  // Prefixes the fake gateway refuses with a signature error.
  refusedPrefixes = new Set<string>();
  refusalText = "invalid signature: the 0x01 signature prefix is not accepted";
  creds: Triplet = TEST_TRIPLET;
  decode: "b64url-decoded-padded" | "stripped" | "raw" = "b64url-decoded-padded";
  requireL2 = true;
  // The gateway wants XO_ADDRESS as well (switch l2.xo_address = required).
  requireAddressHeader = false;
  // Explorer: nonce-increment rows per maker (lower-case) and fill rows per order hash, or a failure.
  nonceRows = new Map<string, Array<Record<string, unknown>>>();
  fillRows = new Map<string, Array<Record<string, unknown>>>();
  explorerFailure: number | undefined;
  nextId = 1000;
  // Test hooks.
  listFailure: number | undefined;
  // GET /orders/{hash} answers with this other order's row (a gateway that returns the wrong order).
  singleAnswersWith: string | undefined;
  listCursor: string | undefined;
  private hangs = new Set<() => void>();
  private gates: Array<() => void> = [];

  constructor(clock: RigClock) {
    this.clock = clock;
  }

  get nowS(): number {
    return Math.floor(this.clock.now() / 1000) + this.skewS;
  }

  postsOnly(): number {
    return this.requests.filter((entry) => entry.startsWith("POST ")).length;
  }

  // Places an order directly on the fake book (what a lost response leaves behind).
  placeFromWire(wire: Record<string, unknown>, orderType: string): FakeOrder {
    const order = orderFromWire(wire);
    const hash = hashOrder(order).toLowerCase();
    const decoded = decodeOrderAmounts({ side: order.side, makerAmount: order.makerAmount, takerAmount: order.takerAmount });
    const placed: FakeOrder = {
      hash,
      id: this.nextId++,
      account: order.maker.toLowerCase(),
      tokenId: order.tokenId.toString(),
      side: order.side,
      tick: decoded.priceTick,
      sharesMicro: decoded.sharesMicro,
      expiration: Number(order.expiration),
      status: "LIVE",
      matchedMicro: 0n,
      orderType,
    };
    this.orders.set(hash, placed);
    return placed;
  }

  openGate(): void {
    const open = this.gates;
    this.gates = [];
    for (const release of open) release();
  }

  releaseHangs(): void {
    for (const release of this.hangs) release();
    this.hangs.clear();
  }

  private row(order: FakeOrder): Record<string, unknown> {
    return {
      id: order.id,
      order_hash: order.hash,
      status: order.status,
      maker_address: order.account,
      market: CONDITION_ID,
      asset_id: order.tokenId,
      side: order.side === 0 ? "BUY" : "SELL",
      price: formatTick(order.tick),
      original_size: formatMicro(order.sharesMicro),
      size_matched: formatMicro(order.matchedMicro),
      order_type: order.orderType,
      expiration: String(order.expiration),
      ...(order.feeRateBps === undefined ? {} : { fee_rate_bps: order.feeRateBps }),
    };
  }

  private l2(method: string, path: string, body: string, headers: Record<string, string>): Response | undefined {
    if (!this.requireL2) return undefined;
    const need = (name: string): string | undefined => headers[name];
    const timestamp = need("xo_timestamp");
    const expected = timestamp === undefined ? "" : hmacReference(this.creds.secret, this.decode, `${timestamp}${method}${path}${body}`);
    if (
      (this.requireAddressHeader && need("xo_address") === undefined) ||
      need("xo_api_key") !== this.creds.apiKey ||
      need("xo_passphrase") !== this.creds.passphrase ||
      timestamp === undefined ||
      Math.abs(Number(timestamp) - this.nowS) > 30 ||
      need("xo_signature") !== expected
    ) {
      return json(401, { error: "HMAC L2 credentials required" });
    }
    return undefined;
  }

  readonly fetch = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) headers[name.toLowerCase()] = value;
    const body = typeof init?.body === "string" ? init.body : "";
    this.requests.push(`${method} ${url.host}${url.pathname}${url.search}`);
    // A caller that aborts gets what fetch gives: a rejection.
    const aborted = (): Promise<never> =>
      new Promise((_resolve, reject) => {
        const fail = (): void => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted === true) fail();
        init?.signal?.addEventListener("abort", fail, { once: true });
        this.hangs.add(() => reject(Object.assign(new Error("connection reset"), { name: "TypeError" })));
      });

    if (url.host === "orderbooks.xo.market") return this.orderbook(method, url, body, headers, aborted);
    if (url.host === "explorer-mainnet.xo.market") return this.explorer(url);
    return json(404, { error: "unknown host" });
  }) as typeof fetch;

  private async orderbook(method: string, url: URL, body: string, headers: Record<string, string>, aborted: () => Promise<never>): Promise<Response> {
    const path = url.pathname;
    if (method === "GET" && path === "/time") return new Response(String(this.nowS), { status: 200 });
    if (method === "GET" && path === "/book") {
      const token = url.searchParams.get("token_id") ?? "";
      if (this.unknownTokens.has(token)) return json(404, { error: "no orderbook exists for the requested token id" });
      return json(
        200,
        this.bookByToken.get(token) ?? {
          market: CONDITION_ID,
          asset_id: token,
          bids: [{ price: "0.40", size: "100" }, { price: "0.35", size: "50" }],
          asks: [{ price: "0.60", size: "100" }, { price: "0.65", size: "50" }],
          min_order_size: "0",
          tick_size: "0.001",
          neg_risk: false,
          last_trade_price: "0.50",
        },
      );
    }
    if (method === "GET" && path === "/orders") {
      const denied = this.l2("GET", path, "", headers);
      if (denied !== undefined) return denied;
      if (this.listFailure !== undefined) return json(this.listFailure, { error: "server error" });
      const rows = [...this.orders.values()].filter((order) => order.status === "LIVE").map((order) => this.row(order));
      return json(200, { limit: 100, count: rows.length, next_cursor: this.listCursor ?? "LTE=", data: rows });
    }
    const single = /^\/orders\/(.+)$/.exec(path);
    if (method === "GET" && single !== null) {
      const denied = this.l2("GET", path, "", headers);
      if (denied !== undefined) return denied;
      if (this.listFailure !== undefined) return json(this.listFailure, { error: "server error" });
      const found = this.orders.get(this.singleAnswersWith ?? (single[1] as string).toLowerCase());
      return found === undefined ? json(404, { error: "order not found" }) : json(200, this.row(found));
    }
    if (method === "POST" && path === "/order") {
      const denied = this.l2("POST", path, body, headers);
      if (denied !== undefined) return denied;
      const parsed = JSON.parse(body) as PostRecord["body"];
      const signature = String(parsed.order["signature"]);
      const hash = hashOrder(orderFromWire(parsed.order)).toLowerCase();
      const record: PostRecord = { body: parsed, headers, prefix: signature.slice(0, 4), hash };
      this.posts.push(record);
      const behavior = this.postQueue.shift() ?? this.defaultPost;
      if (this.refusedPrefixes.has(record.prefix)) return json(400, { error: this.refusalText });
      switch (behavior.kind) {
        case "accept": {
          this.placeFromWire(parsed.order, parsed.orderType);
          return json(200, { success: true, errorMsg: "", orderID: hash, status: "live", makingAmount: "0", takingAmount: "0" });
        }
        case "reject":
          return json(behavior.status, { error: behavior.error });
        case "success_false":
          return json(200, { success: false, errorMsg: behavior.errorMsg, orderID: "", status: "delayed" });
        case "hang":
          return aborted();
        case "lost_response":
          this.placeFromWire(parsed.order, parsed.orderType);
          throw new TypeError("fetch failed");
        case "place_then_hang":
          this.placeFromWire(parsed.order, parsed.orderType);
          return aborted();
        case "gate":
          // waits for openGate(), unless the caller aborts the request first (as fetch would)
          await Promise.race([new Promise<void>((resolve) => this.gates.push(resolve)), aborted()]);
          this.placeFromWire(parsed.order, parsed.orderType);
          return json(200, { success: true, errorMsg: "", orderID: hash, status: "live", makingAmount: "0", takingAmount: "0" });
        case "http":
          return new Response(behavior.body, { status: behavior.status, headers: behavior.headers });
      }
    }
    if (method === "DELETE" && path === "/order") {
      const denied = this.l2("DELETE", path, body, headers);
      if (denied !== undefined) return denied;
      const parsed = JSON.parse(body) as Record<string, unknown>;
      this.deletes.push({ body: parsed, headers });
      if (this.deleteStatusOverride !== undefined) return new Response(this.deleteStatusOverride.body, { status: this.deleteStatusOverride.status });
      const key = this.cancelBody === "orderId" ? "orderId" : "orderID";
      const value = parsed[key];
      if (typeof value !== "string" && typeof value !== "number") return json(400, { error: `invalid cancel request: expected {"${key}": <id>}` });
      const wantsNumeric = this.cancelBody === "numeric-id";
      const order = [...this.orders.values()].find((entry) => (wantsNumeric ? String(entry.id) === String(value) : entry.hash === String(value).toLowerCase()));
      if (order === undefined) return json(200, { canceled: [], notCanceled: { [String(value)]: "not found" } });
      if (order.status === "MATCHED") return json(200, { canceled: [], notCanceled: { [String(value)]: "already filled" } });
      order.status = "CANCELED";
      if (this.deleteLosesResponse) throw new TypeError("fetch failed");
      return json(200, { canceled: [String(order.id)], notCanceled: {} });
    }
    return json(404, { error: "route not found" });
  }

  private explorer(url: URL): Response {
    if (this.explorerFailure !== undefined) return new Response("down", { status: this.explorerFailure });
    const topic0 = (url.searchParams.get("topic0") ?? "").toLowerCase();
    const topic1 = (url.searchParams.get("topic1") ?? "").toLowerCase();
    let rows: Array<Record<string, unknown>> = [];
    if (topic0 === NONCE_INCREMENTED_TOPIC) rows = this.nonceRows.get(`0x${topic1.slice(26)}`) ?? [];
    else if (topic0 === ORDER_FILLED_TOPIC) rows = this.fillRows.get(topic1) ?? [];
    return json(200, rows.length > 0 ? { status: "1", message: "OK", result: rows } : { status: "0", message: "No logs found", result: [] });
  }
}

const padTopic = (value: string): Hex => `0x${value.toLowerCase().replace(/^0x/, "").padStart(64, "0")}` as Hex;

export function nonceMovedRow(maker: string): Record<string, unknown> {
  return {
    address: CTF_EXCHANGE.toLowerCase(),
    topics: [NONCE_INCREMENTED_TOPIC, padTopic(maker), padTopic("0x01"), null],
    data: encodeAbiParameters([{ type: "uint128" }, { type: "uint128" }], [0n, 1n]),
    blockNumber: "0x64",
    logIndex: "0x0",
    transactionHash: hash32(0xaa),
  };
}

// An OrderFilled row for an order: [makerAssetId, takerAssetId, makerAmountFilled, takerAmountFilled, fee].
export function fillRow(orderHash: string, maker: string, row: { readonly makerAmount: bigint; readonly takerAmount: bigint; readonly fee: bigint }): Record<string, unknown> {
  return {
    address: CTF_EXCHANGE.toLowerCase(),
    topics: [ORDER_FILLED_TOPIC, orderHash.toLowerCase(), padTopic(maker), padTopic("0x02")],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
      [0n, 1n, row.makerAmount, row.takerAmount, row.fee],
    ),
    blockNumber: "0x65",
    logIndex: "0x1",
    transactionHash: hash32(0xbb),
  };
}

// ---- the rig ------------------------------------------------------------------------------------------------------

export interface RigOptions {
  readonly env?: Record<string, string>;
  readonly deps?: OrderRouteDeps;
  readonly extraServices?: Partial<RelayServices>;
  readonly credentials?: boolean;
  // Seed of the salt and id source. A restart changes it, so a new process never repeats an old salt.
  readonly seed?: number;
  readonly reading?: AccountReading;
  readonly xo?: FakeXo;
  readonly clock?: RigClock;
  // The credentials the relay stores (default: the fake's own).
  readonly triplet?: Triplet;
  readonly dir?: TempDir;
  readonly fetch?: typeof fetch;
  readonly tripwireCheckers?: CreateRelayOptions["tripwireCheckers"];
}

export interface Rig {
  readonly relay: Relay;
  readonly xo: FakeXo;
  readonly clock: RigClock;
  readonly orders: OrderRoutes;
  readonly client: RelayClient;
  readonly owner: PrivateKeyAccount;
  readonly account: Address;
  readonly dir: TempDir;
  reading: AccountReading;
  post<P extends PostPath>(path: P, body: PostRequest<P>): Promise<RelayResult<PostResponse<P>>>;
  get(path: GetPath): Promise<RelayResult<unknown>>;
  // The handler context, for calling a route directly (fake timers, no HTTP).
  context(signal?: AbortSignal): RelayContext;
  // Stops the relay (cleanly or like a crash) and starts a new one on the same directory, XO and clock.
  restart(how: "close" | "crash", options?: Partial<RigOptions>): Promise<Rig>;
  stop(): Promise<void>;
}

export const DEPLOYED_READING: AccountReading = Object.freeze({ state: "registered", registered: true, trading_enabled: "yes", balance_usd: "100" });

export const BIG_RATES = { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 } } as const;

export async function startRig(options: RigOptions = {}): Promise<Rig> {
  const dir = options.dir ?? (await tempDir("relay-orders-"));
  const clock = options.clock ?? new FakeClock("2026-10-19T12:00:00Z");
  const xo = options.xo ?? new FakeXo(clock);
  const orders = createOrderRoutes({ random: seededRandom(options.seed ?? 7), ...options.deps });
  const holder: { reading: AccountReading } = { reading: options.reading ?? DEPLOYED_READING };
  const accounts: AccountDirectory = {
    derive: (owner) => deriveAccount(owner),
    read: async () => holder.reading,
  };
  const relay = await createRelay({
    env: {
      RELAY_DATA_DIR: dir.dir,
      XO_RELAY_KEY: TEST_RELAY_KEY,
      RELAY_PORT: "0",
      RELAY_ENFORCE_FLAG_FACTS: "0",
      ENABLE_TRADING: "1",
      ...options.env,
    },
    masterSecret: new Secret(TEST_MASTER_SECRET),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    now: clock.now,
    sleep: clock.sleep,
    maintenance: false,
    routes: orders.routes,
    accounts,
    fetch: options.fetch ?? xo.fetch,
    http: BIG_RATES,
    ...(options.extraServices === undefined ? {} : { extraServices: options.extraServices }),
    ...(options.tripwireCheckers === undefined ? {} : { tripwireCheckers: options.tripwireCheckers }),
  });
  const account = deriveAccount(OWNER_KEY.address);
  if (options.credentials !== false) {
    const secrets = relay.services.secrets;
    assert.ok(secrets !== undefined, "the credential store is on");
    if (!(await secrets.has(account.toLowerCase(), "hmac_triplet"))) await secrets.put(account.toLowerCase(), "hmac_triplet", JSON.stringify(options.triplet ?? xo.creds));
  }
  const client = createRelayClient({ baseUrl: relay.url, key: new Secret(TEST_RELAY_KEY) });
  const rig: Rig = {
    relay,
    xo,
    clock,
    orders,
    client,
    owner: OWNER_KEY,
    account,
    dir,
    get reading() {
      return holder.reading;
    },
    set reading(value: AccountReading) {
      holder.reading = value;
    },
    post: (async (path: string, body: never) => checkDecoded(path, await client.post(path as never, body))) as never,
    get: (path) => client.get(path) as never,
    context(signal = new AbortController().signal): RelayContext {
      return { flags: relay.flags, now: clock.now, requestId: "test", signal, services: relay.services };
    },
    async restart(how, more = {}) {
      if (how === "crash") await relay.abandon();
      else await relay.close();
      return startRig({ ...options, ...more, seed: (options.seed ?? 7) + 101, dir, clock, xo, reading: holder.reading });
    },
    async stop() {
      await relay.close().catch(() => undefined);
    },
  };
  return rig;
}

export async function cleanup(rigs: readonly Rig[]): Promise<void> {
  const dirs = new Set<TempDir>();
  for (const rig of rigs) {
    await rig.stop();
    dirs.add(rig.dir);
  }
  for (const dir of dirs) await rm(dir.dir, { recursive: true, force: true });
}

// A deterministic stand-in for crypto.randomBytes: the same seed gives the same salts and ids.
export function seededRandom(seed: number): (bytes: number) => Buffer {
  let state = seed >>> 0;
  return (bytes) => {
    const out = Buffer.alloc(bytes);
    for (let i = 0; i < bytes; i += 1) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      out[i] = (t ^ (t >>> 14)) & 0xff;
    }
    return out;
  };
}

// ---- driving the flow ---------------------------------------------------------------------------------------------

export type OrderParams = Partial<PostRequest<"/v1/order/prepare">>;

export function orderBody(rig: Rig, over: OrderParams = {}): PostRequest<"/v1/order/prepare"> {
  return { owner: rig.owner.address, token_id: TOKEN_ID, side: "BUY", price: "0.55", shares: "10", tif: "GTD", ...over };
}

export async function prepareOk(rig: Rig, over: OrderParams = {}): Promise<Prepared & { readonly quote: { readonly price: string; readonly shares: string; readonly max_outlay_usd: string; readonly fee_bound_bps: number; readonly expires_at: string } }> {
  const result = await rig.post("/v1/order/prepare", orderBody(rig, over));
  assert.ok(result.ok, `prepare failed: ${JSON.stringify(result)}`);
  return result.data as never;
}

export type SignForm = "raw" | "eip191" | "typed";

// What PayBox would hand back for the prepared item's intent.
export async function signPrepared(prepared: Prepared, signer: PrivateKeyAccount = OWNER_KEY, form?: SignForm): Promise<Hex> {
  const digest = prepared.sign.expected_digest as Hex;
  const intent = prepared.sign.intent;
  if (form === "eip191") return signer.signMessage({ message: { raw: digest } });
  if (form === "raw" || (form === undefined && intent.op === "raw")) return signer.sign({ hash: digest });
  assert.equal(intent.op, "typedData");
  const data = intent.op === "typedData" ? intent.typedData : undefined;
  assert.ok(data !== undefined);
  return signer.signTypedData({ domain: data.domain, types: data.types, primaryType: data.primaryType, message: data.message } as never);
}

export function orderHashOf(prepared: Prepared): string {
  const line = prepared.summary.lines.find((entry) => entry.startsWith("Order id (hash) "));
  assert.ok(line !== undefined, "the summary carries the order hash");
  return line.slice("Order id (hash) ".length).replace(/\.$/, "");
}

export async function submitOk(rig: Rig, prepared: Prepared, signature?: Hex): Promise<PostResponse<"/v1/order/submit">> {
  const result = await rig.post("/v1/order/submit", { prepared_id: prepared.prepared_id, signature: signature ?? (await signPrepared(prepared)) });
  assert.ok(result.ok, `submit failed: ${JSON.stringify(result)}`);
  return result.data;
}

export { getAddress };
