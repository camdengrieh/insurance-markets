import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import { encodeAbiParameters, encodeFunctionResult, getAddress, type Address, type Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

import { Secret } from "../src/config.js";
import { hashLimitlessOrder, type LimitlessOrder } from "../src/clob/limitless/order.js";
import { DEPOSIT_WALLET_DOMAIN_CALL, DEPOSIT_WALLET_OWNER_CALL, DEPOSIT_WALLET_READ_ABI, depositWalletAddress, depositWalletRuntimeCode, type DepositWalletProxy } from "../src/clob/polymarket/deposit-wallet.js";
import { hashPolymarketOrder, type PolymarketOrder } from "../src/clob/polymarket/order.js";
import { LIMITLESS_EXCHANGES, type PolymarketBook } from "../src/clob/venues.js";
import { createRelayClient } from "../src/relay/client.js";
import type { GetPath, PostPath, PostRequest, PostResponse, RelayClient, RelayResult } from "../src/relay/contract.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { createRelay, type Relay } from "../relay/main.js";
import { createClobRoutes, type ClobRouteDeps, type ClobRoutes } from "../relay/clob.js";
import type { AccountDirectory } from "../relay/health.js";
import { mergeRoutes } from "../relay/routes.js";
import type { RelayContext, RouteTable } from "../relay/types.js";
import { ANVIL_TEST_ACCOUNTS } from "./fixtures/userop/anvil-test-keys.js";
import { FakeClock, TEST_KDF, TEST_MASTER_SECRET, TEST_RELAY_KEY, tempDir, type TempDir } from "./relay-core-helpers.js";
import { checkDecoded } from "./relay-decoded-check.js";
import { seededRandom } from "./relay-orders-helpers.js";

// Shared rig for the relay-clob tests. Not a test file. Everything is local and deterministic: scripted stand-ins
// for Polymarket's CLOB and Gamma hosts and for Limitless's API (no network), an injected clock, a seeded salt source
// and the public Anvil TEST keys, which hold nothing anywhere. The fakes answer with the shapes the venues document
// (place-orders.md, wallets-auth.md, eip712-signing, programmatic-api) as read on 2026-10-21; nothing here was recorded
// from a real venue, which is why the tests that use it say "against the scripted fake".

export const OWNER_KEY: PrivateKeyAccount = ANVIL_TEST_ACCOUNTS[0] as PrivateKeyAccount;
export const STRANGER_KEY: PrivateKeyAccount = ANVIL_TEST_ACCOUNTS[1] as PrivateKeyAccount;

export const PM_CONDITION = "0x99b2ff7bfebd5e3dd1bd4d0d3d632e09e52b4451653d52eb3be5df917b936cc5";
export const PM_YES_TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";
export const PM_NO_TOKEN = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
export const LM_SLUG = "will-it-rain-1792411200000";
export const LM_YES_TOKEN = "11111111111111111111111111111111111111111111111111111111111111111111111111111";
export const LM_NO_TOKEN = "22222222222222222222222222222222222222222222222222222222222222222222222222222";
export const LM_EXCHANGE = LIMITLESS_EXCHANGES[0] as Address;

// A made-up credential, labelled as such; never a real one.
export const FAKE_TRIPLET = Object.freeze({ apiKey: "fake-api-key-0001", secret: Buffer.from("fake-secret-not-a-real-credential-01", "utf8").toString("base64"), passphrase: "fake-passphrase" });
export const FAKE_TOKEN = Object.freeze({ tokenId: "fake-token-0001", secret: Buffer.from("fake-token-secret-not-real-01", "utf8").toString("base64") });

// The owner's Deposit Wallet as the Polygon fake reports it. Each field left out answers what a real, healthy wallet
// derived for the rig's owner would answer (its exact proxy code, owner() = the owner, the DepositWallet domain).
export interface FakeDepositWallet {
  readonly proxy: DepositWalletProxy;
  readonly code?: Hex;
  readonly owner?: Address;
  readonly domainName?: string;
  readonly revert?: boolean;
}

export const POLYGON_RPC_HOST = "polygon-bor-rpc.publicnode.com";

export type PostBehavior =
  | { readonly kind: "accept" }
  | { readonly kind: "reject"; readonly status: number; readonly error: string }
  | { readonly kind: "success_false"; readonly errorMsg: string }
  | { readonly kind: "http"; readonly status: number; readonly body: string }
  | { readonly kind: "hang" };

export interface SentPost {
  readonly host: string;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export class FakeVenues {
  readonly clock: FakeClock;
  skewS = 0;
  readonly requests: string[] = [];
  readonly posts: SentPost[] = [];
  readonly postQueue: PostBehavior[] = [];
  defaultPost: PostBehavior = { kind: "accept" };
  pmTick = "0.01";
  pmMinSize = "5";
  pmVersion: string | undefined = "v2";
  pmNegRisk = false;
  pmBids: Array<[string, string]> = [["0.50", "100"], ["0.49", "40"]];
  pmAsks: Array<[string, string]> = [["0.54", "60"]];
  lmFeeModule = "COLLATERAL";
  lmExchange: string = LM_EXCHANGE;
  lmTradeType = "clob";
  lmMinSize = "1";
  lmBids: Array<[string, string]> = [["0.500", "150000000"]];
  lmAsks: Array<[string, string]> = [["0.540", "20000000"]];
  // The login: derive answers a triplet when true, else 404 and create answers one.
  derivable = false;
  loginRefused = false;
  readonly logins: Array<{ readonly path: string; readonly headers: Record<string, string> }> = [];
  // Polygon (eth_getCode / eth_call only): no Deposit Wallet by default, so a Polymarket order is an EOA order.
  pmWallets: FakeDepositWallet[] = [];
  rpcDown = false;
  readonly rpcCalls: string[] = [];
  private hangs: Array<() => void> = [];

  constructor(clock: FakeClock) {
    this.clock = clock;
  }

  get nowS(): number {
    return Math.floor(this.clock.now() / 1000) + this.skewS;
  }

  releaseHangs(): void {
    for (const release of this.hangs) release();
    this.hangs = [];
  }

  readonly fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    const raw = init?.headers;
    if (raw !== undefined) {
      const entries = raw instanceof Headers ? [...raw.entries()] : Array.isArray(raw) ? raw : Object.entries(raw);
      for (const [name, value] of entries) headers[name.toLowerCase()] = String(value);
    }
    this.requests.push(`${method} ${url.host}${url.pathname}`);
    const body = typeof init?.body === "string" ? init.body : "";
    if (url.host === "clob.polymarket.com") return this.polymarket(method, url, headers, body);
    if (url.host === "gamma-api.polymarket.com") return this.gamma(url);
    if (url.host === "api.limitless.exchange") return this.limitless(method, url, headers, body);
    if (url.host === POLYGON_RPC_HOST && method === "POST") return this.polygon(body);
    return json(404, { error: "unknown host" });
  };

  // A wallet for the rig's owner in the given form.
  walletAddress(proxy: DepositWalletProxy): Address {
    return depositWalletAddress(OWNER_KEY.address, proxy);
  }

  private polygon(body: string): Response {
    if (this.rpcDown) return new Response("unavailable", { status: 503 });
    const request = JSON.parse(body) as { id: number; method: string; params: unknown[] };
    const reply = (result: unknown): Response => json(200, { jsonrpc: "2.0", id: request.id, result });
    const revert = (): Response => json(200, { jsonrpc: "2.0", id: request.id, error: { code: 3, message: "execution reverted" } });
    const walletAt = (address: unknown): FakeDepositWallet | undefined => this.pmWallets.find((wallet) => typeof address === "string" && this.walletAddress(wallet.proxy).toLowerCase() === address.toLowerCase());
    if (request.method === "eth_getCode") {
      this.rpcCalls.push(`eth_getCode ${String(request.params[0])}`);
      const wallet = walletAt(request.params[0]);
      return reply(wallet === undefined ? "0x" : (wallet.code ?? depositWalletRuntimeCode(OWNER_KEY.address, wallet.proxy)));
    }
    if (request.method === "eth_call") {
      const call = request.params[0] as { to: string; data: string };
      this.rpcCalls.push(`eth_call ${call.to} ${call.data.slice(0, 10)}`);
      const wallet = walletAt(call.to);
      if (wallet === undefined || wallet.revert === true) return revert();
      if (call.data === DEPOSIT_WALLET_OWNER_CALL) return reply(encodeFunctionResult({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "owner", result: getAddress(wallet.owner ?? OWNER_KEY.address) }));
      if (call.data === DEPOSIT_WALLET_DOMAIN_CALL) {
        return reply(
          encodeAbiParameters(
            [{ type: "bytes1" }, { type: "string" }, { type: "string" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }, { type: "uint256[]" }],
            ["0x0f", wallet.domainName ?? "DepositWallet", "1", 137n, this.walletAddress(wallet.proxy), "0x0000000000000000000000000000000000000000000000000000000000000000", []],
          ),
        );
      }
      return revert();
    }
    return json(200, { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "method not found" } });
  }

  private polymarket(method: string, url: URL, headers: Record<string, string>, body: string): Response | Promise<Response> {
    if (method === "GET" && url.pathname === "/time") return new Response(String(this.nowS), { status: 200 });
    if (method === "GET" && url.pathname === "/book") {
      const token = url.searchParams.get("token_id");
      if (token !== PM_YES_TOKEN && token !== PM_NO_TOKEN) return json(404, { error: "no book" });
      return json(200, {
        market: PM_CONDITION,
        asset_id: token,
        bids: this.pmBids.map(([price, size]) => ({ price, size })),
        asks: this.pmAsks.map(([price, size]) => ({ price, size })),
        tick_size: this.pmTick,
        min_order_size: this.pmMinSize,
        neg_risk: this.pmNegRisk,
        timestamp: String(this.clock.now()),
      });
    }
    if (url.pathname === "/auth/derive-api-key" || url.pathname === "/auth/api-key") {
      this.logins.push({ path: url.pathname, headers });
      if (this.loginRefused || headers["poly_signature"] === undefined || headers["poly_address"] === undefined) return json(401, { error: "invalid signature" });
      if (url.pathname === "/auth/derive-api-key" && !this.derivable) return json(404, { error: "no key" });
      return json(200, { ...FAKE_TRIPLET });
    }
    if (method === "POST" && url.pathname === "/order") return this.order("clob.polymarket.com", "/order", headers, body);
    return json(404, { error: "no route" });
  }

  private gamma(url: URL): Response {
    if (url.pathname === "/markets/keyset" && url.searchParams.get("condition_ids") === PM_CONDITION.toLowerCase()) {
      return json(200, { markets: [{ conditionId: PM_CONDITION, question: "x", ...(this.pmVersion === undefined ? {} : { version: this.pmVersion }), negRisk: this.pmNegRisk }] });
    }
    return json(200, { markets: [] });
  }

  private limitless(method: string, url: URL, headers: Record<string, string>, body: string): Response | Promise<Response> {
    if (method === "GET" && url.pathname === `/markets/${LM_SLUG}`) {
      return json(200, { slug: LM_SLUG, tradeType: this.lmTradeType, tokens: { yes: LM_YES_TOKEN, no: LM_NO_TOKEN }, venue: { exchange: this.lmExchange, feeModuleType: this.lmFeeModule }, minSize: this.lmMinSize });
    }
    if (method === "GET" && url.pathname === `/markets/${LM_SLUG}/orderbook`) {
      return json(200, { bids: this.lmBids.map(([price, size]) => ({ price, size })), asks: this.lmAsks.map(([price, size]) => ({ price, size })) });
    }
    if (method === "GET" && url.pathname.startsWith("/markets/")) return json(404, { message: "not found" });
    if (method === "POST" && url.pathname === "/orders") return this.order("api.limitless.exchange", "/orders", headers, body);
    return json(404, { message: "no route" });
  }

  private order(host: string, path: string, headers: Record<string, string>, body: string): Response | Promise<Response> {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body) as Record<string, unknown>;
    } catch {
      return json(400, { error: "bad json" });
    }
    this.posts.push({ host, path, headers, body: parsed });
    const behavior = this.postQueue.shift() ?? this.defaultPost;
    switch (behavior.kind) {
      case "accept": {
        if (host === "clob.polymarket.com") {
          if (headers["poly_api_key"] !== FAKE_TRIPLET.apiKey || headers["poly_passphrase"] !== FAKE_TRIPLET.passphrase || headers["poly_signature"] === undefined) return json(401, { error: "unauthorized" });
          return json(200, { success: true, errorMsg: "", orderID: polymarketHashOfWire(parsed["order"] as Record<string, unknown>), status: "live", makingAmount: "", takingAmount: "", transactionsHashes: [] });
        }
        if (headers["lmts-api-key"] !== FAKE_TOKEN.tokenId || headers["lmts-signature"] === undefined) return json(401, { message: "unauthorized" });
        return json(201, { id: 1, makerMatches: [] });
      }
      case "reject":
        return json(behavior.status, host === "clob.polymarket.com" ? { error: behavior.error } : { message: behavior.error });
      case "success_false":
        return json(200, { success: false, errorMsg: behavior.errorMsg });
      case "http":
        return new Response(behavior.body, { status: behavior.status, headers: { "content-type": "application/json" } });
      case "hang":
        return new Promise<Response>((resolve) => {
          this.hangs.push(() => resolve(json(200, { success: true, orderID: polymarketHashOfWire(parsed["order"] as Record<string, unknown>), status: "live" })));
        });
    }
  }
}

// The fake gateway recomputes the order id the way the venue does (the EIP-712 hash), for the Protocol V2 book.
export function polymarketHashOfWire(wire: Record<string, unknown>, book: PolymarketBook = "v2"): string {
  const order: PolymarketOrder = {
    salt: BigInt(wire["salt"] as number),
    maker: wire["maker"] as Address,
    signer: wire["signer"] as Address,
    tokenId: BigInt(wire["tokenId"] as string),
    makerAmount: BigInt(wire["makerAmount"] as string),
    takerAmount: BigInt(wire["takerAmount"] as string),
    side: wire["side"] === "BUY" ? 0 : 1,
    signatureType: wire["signatureType"] as number,
    timestamp: BigInt(wire["timestamp"] as string),
    metadata: wire["metadata"] as Hex,
    builder: wire["builder"] as Hex,
  };
  return hashPolymarketOrder(order, book).toLowerCase();
}

export function limitlessHashOfWire(wire: Record<string, unknown>): string {
  const order: LimitlessOrder = {
    salt: BigInt(wire["salt"] as string),
    maker: wire["maker"] as Address,
    signer: wire["signer"] as Address,
    taker: wire["taker"] as Address,
    tokenId: BigInt(wire["tokenId"] as string),
    makerAmount: BigInt(wire["makerAmount"] as string),
    takerAmount: BigInt(wire["takerAmount"] as string),
    expiration: BigInt(wire["expiration"] as string),
    nonce: BigInt(wire["nonce"] as string),
    feeRateBps: BigInt(wire["feeRateBps"] as string),
    side: wire["side"] as 0 | 1,
    signatureType: wire["signatureType"] as number,
  };
  return hashLimitlessOrder(order, LM_EXCHANGE).toLowerCase();
}

export interface ClobRigOptions {
  readonly env?: Record<string, string>;
  readonly deps?: ClobRouteDeps;
  readonly seed?: number;
  readonly venues?: FakeVenues;
  readonly clock?: FakeClock;
  readonly dir?: TempDir;
  // Which credentials to seed in the vault (default: both fakes).
  readonly credentials?: { readonly polymarket?: boolean; readonly limitless?: boolean };
  // Served next to the CLOB routes (GET /v1/prepared/:id, for example).
  readonly extraRoutes?: RouteTable;
}

export interface ClobRig {
  readonly relay: Relay;
  readonly venues: FakeVenues;
  readonly clock: FakeClock;
  readonly clob: ClobRoutes;
  readonly client: RelayClient;
  readonly owner: PrivateKeyAccount;
  readonly dir: TempDir;
  post<P extends PostPath>(path: P, body: PostRequest<P>): Promise<RelayResult<PostResponse<P>>>;
  get(path: GetPath): Promise<RelayResult<unknown>>;
  context(signal?: AbortSignal): RelayContext;
  stop(): Promise<void>;
}

const BIG_RATES = { readRate: { capacity: 10_000, refillPerSecond: 10_000 }, writeRate: { capacity: 10_000, refillPerSecond: 10_000 } } as const;

export async function startClobRig(options: ClobRigOptions = {}): Promise<ClobRig> {
  const dir = options.dir ?? (await tempDir("relay-clob-"));
  const clock = options.clock ?? new FakeClock("2026-10-19T12:00:00Z");
  const venues = options.venues ?? new FakeVenues(clock);
  const clob = createClobRoutes({ random: seededRandom(options.seed ?? 11), pendingAfterMs: 2_000, postTimeoutMs: 3_000, ...options.deps });
  // No XO account reads are made by these routes; the directory is a stub that answers nothing.
  const accounts: AccountDirectory = {
    derive: (owner) => deriveAccount(owner),
    read: async () => ({ state: "undeployed", registered: false, trading_enabled: "unknown", balance_usd: null }),
  };
  const relay = await createRelay({
    env: {
      RELAY_DATA_DIR: dir.dir,
      XO_RELAY_KEY: TEST_RELAY_KEY,
      RELAY_PORT: "0",
      RELAY_ENFORCE_FLAG_FACTS: "0",
      ENABLE_CLOB_POLYMARKET: "1",
      ENABLE_CLOB_LIMITLESS: "1",
      ...options.env,
    },
    masterSecret: new Secret(TEST_MASTER_SECRET),
    kdf: TEST_KDF,
    allowWeakKdf: true,
    now: clock.now,
    sleep: clock.sleep,
    maintenance: false,
    routes: options.extraRoutes === undefined ? clob.routes : mergeRoutes(clob.routes, options.extraRoutes),
    accounts,
    fetch: venues.fetch,
    http: BIG_RATES,
  });
  const secrets = relay.services.secrets;
  assert.ok(secrets !== undefined, "the credential store is on");
  const account = OWNER_KEY.address.toLowerCase();
  if (options.credentials?.polymarket !== false && !(await secrets.has(account, "clob_polymarket_l2"))) await secrets.put(account, "clob_polymarket_l2", JSON.stringify(FAKE_TRIPLET));
  if (options.credentials?.limitless !== false && !(await secrets.has(account, "clob_limitless_token"))) await secrets.put(account, "clob_limitless_token", JSON.stringify(FAKE_TOKEN));
  const client = createRelayClient({ baseUrl: relay.url, key: new Secret(TEST_RELAY_KEY) });
  return {
    relay,
    venues,
    clock,
    clob,
    client,
    owner: OWNER_KEY,
    dir,
    post: (async (path: string, body: never) => checkDecoded(path, await client.post(path as never, body))) as never,
    get: (path) => client.get(path) as never,
    context(signal = new AbortController().signal): RelayContext {
      return { flags: relay.flags, now: clock.now, requestId: "test", signal, services: relay.services };
    },
    async stop() {
      await relay.close().catch(() => undefined);
    },
  };
}

export async function cleanupClob(rigs: readonly ClobRig[]): Promise<void> {
  const dirs = new Set<TempDir>();
  for (const rig of rigs) {
    await rig.stop();
    dirs.add(rig.dir);
  }
  for (const dir of dirs) await rm(dir.dir, { recursive: true, force: true });
}

export function pmOrderBody(over: Partial<PostRequest<"/v1/clob/order/prepare">> = {}): PostRequest<"/v1/clob/order/prepare"> {
  return { owner: OWNER_KEY.address, venue: "polymarket", market_id: PM_CONDITION, token_id: PM_YES_TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTD", ttl_s: 300, ...over };
}

export function lmOrderBody(over: Partial<PostRequest<"/v1/clob/order/prepare">> = {}): PostRequest<"/v1/clob/order/prepare"> {
  return { owner: OWNER_KEY.address, venue: "limitless", market_id: LM_SLUG, token_id: LM_YES_TOKEN, side: "BUY", price: "0.52", shares: "10", tif: "GTC", ...over };
}

// Signs the digest the item carries the way an EOA does for EIP-712: a raw signature over the 32-byte hash.
export async function signDigest(digest: string, signer: PrivateKeyAccount = OWNER_KEY): Promise<Hex> {
  return signer.sign({ hash: digest as Hex });
}

export async function prepareOk<P extends "/v1/clob/order/prepare" | "/v1/clob/auth/prepare">(rig: ClobRig, path: P, body: PostRequest<P>): Promise<PostResponse<P>> {
  const result = await rig.post(path, body);
  if (!result.ok) throw new Error(`prepare failed: ${result.error.code} ${result.error.message} ${JSON.stringify(result.error.details ?? {})}`);
  return result.data;
}
