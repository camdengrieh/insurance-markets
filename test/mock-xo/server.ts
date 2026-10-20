// The local mock XO: several node:http listeners on 127.0.0.1 (each on a port the OS picks), one chain
// harness behind them, one injected clock, one switch store.
//
//   orderbook   the orderbook's read surface         (orderbooks.xo.market)
//   dataApi     the Data API's read surface           (api-mainnet.xo.market)
//   explorer    getLogs, lazy is_contract, mempool    (explorer-mainnet.xo.market)
//   xoRpc       JSON-RPC for chain 3223 from anvil    (rpc-mainnet-2.xo.market)
//   baseRpc     JSON-RPC for Base from anvil          (mainnet.base.org)
//   bundler     the bundler's read surface            (mainnet-bundler.xo.market)
//   control     profile, switch, clock, fault control (the mock's own, never faulted)
//
// Nothing here reaches the network. `mock.fetch` maps the real hostnames to the listeners and refuses every
// other host, so a client under test can keep its real https URLs and still never leave the machine.
//
// The write surfaces are here too: orders and cancels (orders.ts, engine.ts), L1 and L2 credentials (auth.ts), the
// bundler's send and estimate (userops.ts, bundler.ts), the Hyperlane emulation (hyperlane.ts) and market creation
// (creation.ts, manager-stub.ts). Everything that happens later in mock time is scheduled (scheduler.ts) and runs
// when a test calls mock.advance(). What is still not built is listed in test/mock-xo/README.md.

import type { FetchLike } from "../../src/xo/http.js";
import { XO_DATA_API_HOST, XO_EXPLORER_HOST, XO_ORDERBOOK_HOST } from "../../src/xo/http.js";
import type { RpcHttpResponse, RpcTransport } from "../../src/xo/chain/reads.js";
import type { XoChain } from "../anvil/chain.js";
import { registerAuth } from "./auth.js";
import { registerBundler } from "./bundler.js";
import { MockChains } from "./chains.js";
import { createMockClock, type MockClock } from "./clock.js";
import { CreationFlow, type CreationPolicy } from "./creation.js";
import { registerDataApiReads } from "./dataapi.js";
import { Engine } from "./engine.js";
import type { MockEnv } from "./env.js";
import { Hyperlane } from "./hyperlane.js";
import { PaymasterControl } from "./paymaster.js";
import { registerOrders } from "./orders.js";
import { Scheduler } from "./scheduler.js";
import { UserOpPool } from "./userops.js";
import { VirtualContracts } from "./virtual.js";
import { WriteState } from "./write-state.js";
import { ExplorerState, registerExplorer } from "./explorer.js";
import { FaultInjector, type FaultKind, type InjectOptions } from "./faults.js";
import { RateLimiter, type RateLimit } from "./limits.js";
import { MockListener, type BeforeRoute, type MockReply, type RecordedRequest } from "./listener.js";
import { BASE_RPC_HOST, XO_BUNDLER_HOST, XO_RPC_HOST } from "./observed.js";
import { registerOrderbookReads } from "./orderbook.js";
import { MockSwitchError, SWITCH_IMPLEMENTATION, SwitchStore } from "./profile.js";
import { registerRpc } from "./rpc.js";
import { MockState } from "./state.js";
import type { MockProfile, MockProfileName, MockSwitchName, MockSwitchValue } from "./switches.js";

export const LISTENER_NAMES = ["orderbook", "dataApi", "explorer", "xoRpc", "baseRpc", "bundler"] as const;
export type ListenerName = (typeof LISTENER_NAMES)[number];

// The real hostname each listener stands in for.
export const MOCK_HOSTS: Readonly<Record<ListenerName, string>> = Object.freeze({
  orderbook: XO_ORDERBOOK_HOST,
  dataApi: XO_DATA_API_HOST,
  explorer: XO_EXPLORER_HOST,
  xoRpc: XO_RPC_HOST,
  baseRpc: BASE_RPC_HOST,
  bundler: XO_BUNDLER_HOST,
});

export interface MockXoOptions {
  // A profile name, or switch values applied on top of the pessimistic profile. Default: pessimistic (D9).
  readonly profile?: MockProfileName | Partial<MockProfile>;
  readonly clock?: MockClock;
  // false: no chain at all (the chain-backed surfaces answer "not part of this mock"). Otherwise per chain:
  // true starts a fresh anvil, an XoChain is shared and left running when the mock stops. Default: both started.
  readonly chains?: false | { readonly xo?: boolean | XoChain; readonly base?: boolean | XoChain };
  // Seed the default market catalogue (default true).
  readonly seedMarkets?: boolean;
}

export interface MockXo {
  readonly clock: MockClock;
  readonly switches: SwitchStore;
  readonly state: MockState;
  readonly chains: MockChains;
  readonly explorer: ExplorerState;
  readonly faults: FaultInjector;
  readonly limiter: RateLimiter;
  readonly env: MockEnv;
  // The write mock's services (also on env): things that happen later, the order engine, the bundler's pool, the
  // Hyperlane emulation, market creation, the paymaster control and the virtual contracts.
  readonly scheduler: Scheduler;
  readonly engine: Engine;
  readonly userops: UserOpPool;
  readonly hyperlane: Hyperlane;
  readonly creation: CreationFlow;
  readonly paymaster: PaymasterControl;
  readonly virtual: VirtualContracts;
  readonly write: WriteState;
  readonly listeners: Readonly<Record<ListenerName, MockListener>>;
  readonly control: MockListener;
  // http://127.0.0.1:<port> of each listener.
  readonly urls: Readonly<Record<ListenerName | "control", string>>;
  readonly ports: Readonly<Record<ListenerName | "control", number>>;
  // Everything the listeners received, in order.
  readonly requests: readonly RecordedRequest[];
  // A fetch that serves the real https hostnames from the listeners and refuses any other host.
  readonly fetch: FetchLike;
  // The same mapping as a drop-in for the global fetch (the relay's upstream client takes one).
  readonly asFetch: typeof fetch;
  // An RpcTransport (src/xo/chain/reads.ts) that posts to a listener; accepts a listener URL or a real https URL.
  readonly rpcTransport: RpcTransport;
  // Errors thrown inside a handler (a bug in the mock). A test asserts this is empty.
  internalErrors(): readonly Error[];
  requestsTo(listener: ListenerName): readonly RecordedRequest[];
  clearRequests(): void;
  setProfile(profile: MockProfileName): void;
  setSwitch<N extends MockSwitchName>(name: N, value: MockSwitchValue<N>): void;
  injectFault(kind: FaultKind, options?: InjectOptions): void;
  setRateLimit(listener: "orderbook" | "dataApi", limit: RateLimit | null): void;
  // Moves the clock forward and brings the XO chain's time up to it. Everything scheduled inside the window runs
  // on the way, in time order, each at its own moment (a UserOp inclusion, a Hyperlane delivery, an oracle
  // review, a credit, a GTD sweep), and a taker order held on the clock is released once its delay has passed.
  advance(seconds: number): Promise<void>;
  stop(): Promise<void>;
}

export type MockXoStart = { readonly ok: true; readonly mock: MockXo } | { readonly ok: false; readonly reason: string };

export class MockHostError extends Error {
  constructor(host: string) {
    super(`mock fetch: ${host} is not one of the mocked hosts; nothing leaves the machine`);
    this.name = "MockHostError";
  }
}

export async function startMockXo(options: MockXoOptions = {}): Promise<MockXoStart> {
  const clock = options.clock ?? createMockClock();
  const switches = new SwitchStore(options.profile ?? "pessimistic");
  const state = new MockState(clock);
  if (options.seedMarkets !== false) state.seedDefaultMarkets();

  const wanted = options.chains === false ? { xo: false, base: false } : { xo: options.chains?.xo ?? true, base: options.chains?.base ?? true };
  const started = await MockChains.start(wanted);
  if (!started.ok) return { ok: false, reason: started.reason };
  const chains = started.chains;

  const closers: (() => Promise<void>)[] = [];
  try {
    const scheduler = new Scheduler(clock, (atSeconds) => chains.syncToSeconds(atSeconds));
    const explorer = new ExplorerState();
    const write = new WriteState();
    // The services need the whole env, and the env holds the services: build the env first, fill it in, and let the
    // services read it only when they are called.
    const env = { clock, switches, state, chains, scheduler, explorer, write } as unknown as MockEnv;
    const getEnv = (): MockEnv => env;
    Object.assign(env, {
      engine: new Engine(getEnv),
      paymaster: new PaymasterControl(getEnv),
      userops: new UserOpPool(getEnv),
      hyperlane: new Hyperlane(getEnv),
      creation: new CreationFlow(getEnv),
      virtual: new VirtualContracts(getEnv),
    });
    env.engine.install();
    // Everything the write mock keeps goes back to its starting state with the rest of the state (tests call
    // state.reset() between cases): keys, orders, scheduled tasks, held requests, messages, created markets.
    state.onReset(() => {
      write.reset();
      scheduler.clear();
      clock.cancelWaiters();
      env.hyperlane.reset();
      env.creation.reset();
      env.userops.reset();
      env.virtual.reset();
    });
    const faults = new FaultInjector(switches, clock);
    const limiter = new RateLimiter(clock);
    const recorded: RecordedRequest[] = [];
    const onRecord = (entry: RecordedRequest): void => {
      recorded.push(entry);
    };

    const before = (name: string): BeforeRoute => {
      const limit = limiter.before(name);
      const fault = faults.before(name);
      return async (request) => {
        const early = (await limit(request)) ?? (await fault(request));
        // A market created through the manager shows up in the catalogue before the next read answers.
        if (early === undefined && request.method === "GET" && (name === "orderbook" || name === "dataApi")) await env.creation.sync();
        return early;
      };
    };
    const make = (name: ListenerName): MockListener => new MockListener(name, { before: before(name), after: faults.after(name), onRecord });
    const listeners: Record<ListenerName, MockListener> = {
      orderbook: make("orderbook"),
      dataApi: make("dataApi"),
      explorer: make("explorer"),
      xoRpc: make("xoRpc"),
      baseRpc: make("baseRpc"),
      bundler: make("bundler"),
    };
    registerOrderbookReads(listeners.orderbook, env);
    registerAuth(listeners.orderbook, env);
    registerOrders(listeners.orderbook, env);
    registerDataApiReads(listeners.dataApi, env);
    registerExplorer(listeners.explorer, env, explorer);
    registerRpc(listeners.xoRpc, env, "xo");
    registerRpc(listeners.baseRpc, env, "base");
    registerBundler(listeners.bundler, env);

    // The control listener has no fault hook and no limiter: it must keep answering while a fault is on.
    // A page in a browser must not be able to steer the mock (DNS rebinding, a cross-site POST): the Host header
    // has to be the loopback address of this listener, and a request that carries an Origin is refused.
    const guard: BeforeRoute = (request) => {
      const host = request.headers["host"];
      if (host !== `127.0.0.1:${String(control.port)}` || request.headers["origin"] !== undefined) {
        return { status: 403, json: { error: "forbidden" } };
      }
      return undefined;
    };
    const control: MockListener = new MockListener("control", { onRecord, before: guard });
    const advance = async (seconds: number): Promise<void> => {
      await scheduler.advance(seconds);
      await env.creation.sync();
    };
    const mock0 = { clock, switches, state, chains, faults, limiter, advance, scheduler, creation: env.creation, userops: env.userops };
    registerControl(control, mock0);

    for (const listener of [...Object.values(listeners), control]) {
      closers.push(() => listener.close());
      await listener.listen();
    }
    await chains.syncToClock(clock);

    const urls = Object.fromEntries([...LISTENER_NAMES.map((name) => [name, listeners[name].url]), ["control", control.url]]) as Record<ListenerName | "control", string>;
    const ports = Object.fromEntries([...LISTENER_NAMES.map((name) => [name, listeners[name].port]), ["control", control.port]]) as Record<ListenerName | "control", number>;
    const byHost = new Map<string, ListenerName>(LISTENER_NAMES.map((name) => [MOCK_HOSTS[name], name]));

    const rewrite = (raw: string): string => {
      let url: URL;
      try {
        url = new URL(raw);
      } catch {
        throw new MockHostError("an unparsable URL");
      }
      // A mock listener URL is used as it is.
      if (url.protocol === "http:" && url.hostname === "127.0.0.1" && Object.values(ports).includes(Number(url.port))) return url.toString();
      const name = byHost.get(url.hostname);
      if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "" || name === undefined) throw new MockHostError(url.hostname);
      return `${urls[name]}${url.pathname}${url.search}`;
    };

    const mockFetch: FetchLike = (input, init) => globalThis.fetch(rewrite(input), init);
    const asFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(rewrite(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url), init)) as typeof fetch;
    const rpcTransport: RpcTransport = {
      async postJson(url, body): Promise<RpcHttpResponse> {
        const response = await globalThis.fetch(rewrite(url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await response.text();
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text) as unknown;
        } catch {
          // keep the raw text
        }
        return { status: response.status, body: parsed };
      },
    };

    let stopped = false;
    const mock: MockXo = {
      clock,
      switches,
      state,
      chains,
      explorer,
      faults,
      limiter,
      env,
      scheduler,
      engine: env.engine,
      userops: env.userops,
      hyperlane: env.hyperlane,
      creation: env.creation,
      paymaster: env.paymaster,
      virtual: env.virtual,
      write,
      listeners,
      control,
      urls,
      ports,
      requests: recorded,
      fetch: mockFetch,
      asFetch,
      rpcTransport,
      internalErrors: () => [...Object.values(listeners), control].flatMap((listener) => listener.errors),
      requestsTo: (name) => recorded.filter((entry) => entry.listener === name),
      clearRequests: () => {
        recorded.length = 0;
      },
      setProfile: (profile) => switches.setProfile(profile),
      setSwitch: (name, value) => switches.set(name, value),
      injectFault: (kind, injectOptions) => faults.inject(kind, injectOptions),
      setRateLimit: (name, limit) => limiter.set(name, limit),
      advance,
      stop: async () => {
        if (stopped) return;
        stopped = true;
        clock.cancelWaiters();
        await Promise.all(closers.map((close) => close()));
        await chains.stop();
      },
    };
    return { ok: true, mock };
  } catch (error) {
    await Promise.all(closers.map((close) => close()));
    await chains.stop();
    throw error;
  }
}

// ---- the control listener -------------------------------------------------------------------------------------------

interface ControlTarget {
  readonly clock: MockClock;
  readonly switches: SwitchStore;
  readonly state: MockState;
  readonly faults: FaultInjector;
  readonly limiter: RateLimiter;
  readonly scheduler: Scheduler;
  readonly creation: CreationFlow;
  readonly userops: UserOpPool;
  advance(seconds: number): Promise<void>;
}

function registerControl(control: MockListener, target: ControlTarget): void {
  const bad = (message: string): MockReply => ({ status: 400, json: { error: message } });
  const parse = (body: string): Record<string, unknown> | undefined => {
    try {
      const value = JSON.parse(body) as unknown;
      return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  };
  control.route("GET", "/state", () => ({
    status: 200,
    json: {
      profile: target.switches.profile,
      switches: target.switches.snapshot(),
      implementation: SWITCH_IMPLEMENTATION,
      clock_ms: target.clock.nowMs(),
      scheduled: target.scheduler.pending().length,
      markets: target.state.markets.map((market) => ({ condition_id: market.conditionId, status: market.status, kind: market.kind })),
    },
  }));
  control.route("POST", "/profile", (request) => {
    const body = parse(request.body);
    const profile = body?.["profile"];
    if (profile !== "pessimistic" && profile !== "optimistic") return bad("profile must be pessimistic or optimistic");
    target.switches.setProfile(profile);
    return { status: 200, json: { profile: target.switches.profile } };
  });
  control.route("POST", "/switch", (request) => {
    const body = parse(request.body);
    const name = body?.["name"];
    const value = body?.["value"];
    if (typeof name !== "string" || typeof value !== "string") return bad("name and value must be strings");
    try {
      target.switches.setByName(name, value);
    } catch (error) {
      if (error instanceof MockSwitchError) return bad(error.message);
      throw error;
    }
    return { status: 200, json: { name, value, profile: target.switches.profile } };
  });
  control.route("POST", "/advance", async (request) => {
    const seconds = parse(request.body)?.["seconds"];
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return bad("seconds must be a non-negative number");
    await target.advance(seconds);
    return { status: 200, json: { clock_ms: target.clock.nowMs() } };
  });
  control.route("POST", "/fault", (request) => {
    const body = parse(request.body);
    const kind = body?.["kind"];
    if (kind === "none") {
      target.faults.clear();
      return { status: 200, json: { faults: "none" } };
    }
    if (kind !== "429-retry-after" && kind !== "5xx" && kind !== "timeout" && kind !== "truncated-json") return bad("unknown fault kind");
    const count = body?.["count"];
    try {
      target.faults.inject(kind, typeof count === "number" ? { count } : {});
    } catch (error) {
      if (error instanceof RangeError) return bad(error.message);
      throw error;
    }
    return { status: 200, json: { faults: kind } };
  });

  // ---- the write mock's set-up routes (a standalone run needs them: there is no test code to call the methods) ------------
  const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
  const addressOf = (body: Record<string, unknown> | undefined): string | undefined => {
    const address = body?.["address"];
    return typeof address === "string" && ADDRESS.test(address) ? address : undefined;
  };
  // XO provisioned this account itself (bundler.foreign_account only gates the others).
  control.route("POST", "/provision", (request) => {
    const address = addressOf(parse(request.body));
    if (address === undefined) return bad("address must be 0x plus 40 hex digits");
    target.state.provisionAccount(address);
    return { status: 200, json: { provisioned: address.toLowerCase() } };
  });
  // The orderbook knows this account, whatever registry.trigger says.
  control.route("POST", "/register", (request) => {
    const address = addressOf(parse(request.body));
    if (address === undefined) return bad("address must be 0x plus 40 hex digits");
    target.state.forceRegistered(address);
    return { status: 200, json: { registered: address.toLowerCase() } };
  });
  // Orderbook collateral for an account, in micro units (balance, allowance and cash together).
  control.route("POST", "/fund", (request) => {
    const body = parse(request.body);
    const address = addressOf(body);
    const micro = body?.["micro"];
    if (address === undefined) return bad("address must be 0x plus 40 hex digits");
    if (typeof micro !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(micro)) return bad("micro must be a decimal string");
    target.state.setBalance(address, { balanceMicro: BigInt(micro), allowanceMicro: BigInt(micro), cashBalanceMicro: BigInt(micro) });
    return { status: 200, json: { funded: address.toLowerCase(), micro } };
  });
  // How the oracle treats the next created markets (see creation.ts).
  control.route("POST", "/creation", (request) => {
    const body = parse(request.body);
    if (body === undefined) return bad("body must be a JSON object");
    const next: CreationPolicy = {};
    const decision = body["decision"];
    if (decision !== undefined) {
      if (decision !== "approve" && decision !== "update" && decision !== "reject" && decision !== "cancel") return bad("decision must be approve, update, reject or cancel");
      next.decision = decision;
    }
    for (const key of ["reviewDelayS", "windowS", "cancelDelayS"] as const) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return bad(`${key} must be a non-negative number`);
      next[key] = value;
    }
    for (const key of ["changeExpiry", "metadataUpdate"] as const) {
      const value = body[key];
      if (value === undefined) continue;
      if (typeof value !== "boolean") return bad(`${key} must be a boolean`);
      next[key] = value;
    }
    if (body["notes"] !== undefined) {
      if (typeof body["notes"] !== "string") return bad("notes must be a string");
      next.notes = body["notes"];
    }
    target.creation.policy = next;
    return { status: 200, json: { policy: next } };
  });
  // Seconds between eth_sendUserOperation and inclusion (0 lands the operation inside the send).
  control.route("POST", "/inclusion-delay", (request) => {
    const seconds = parse(request.body)?.["seconds"];
    if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return bad("seconds must be a non-negative number");
    target.userops.inclusionDelaySeconds = seconds;
    return { status: 200, json: { inclusion_delay_s: seconds } };
  });
  control.fallback(() => bad("unknown control route"));
}
