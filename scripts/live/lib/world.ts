import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";
import type { HDAccount } from "viem/accounts";

import { decodeFundingData } from "../../../src/xo/funding/calldata.js";
import { testAccount } from "../../../test/anvil/chain.js";
import type { MockXo, MockXoOptions } from "../../../test/mock-xo/server.js";
import type { Printer } from "./redact.js";
import { operatorBaseWallet, operatorSigner, simulatedSigner, type SimulatedPayboxOptions } from "./signer.js";
import type { ArrangeStep, BaseCall, BaseWallet, Clock, Options, Signer, TargetName } from "./types.js";

// The world a run happens in. On the live target it is the real clock, the real network and a person with
// PayBox. On the mock target it is a local rehearsal: the mock XO (real EntryPoint, factory, validator and
// Kernel bytecode on a local anvil; nothing leaves this machine), its clock, a stand-in for PayBox that
// signs with a PUBLIC Anvil test key, and a stand-in for the user's Base wallet.
//
// The script code never asks which world it is in, except through the few methods below that stand for
// something a person or XO does on the live target (the operator pays gas on Base; the exchange reads the
// allowance from the chain itself).

export const ANVIL_OWNER_COUNT = 10;
// The balance the rehearsal gives the owner on Base and what "funded" means on the mock: what T3a would leave.
export const REHEARSAL_BASE_USDC_MICRO = 10_000_000n;
export const REHEARSAL_FUNDED_MICRO = 3_000_000n;
// What a seed (a $10 stake plus the fee bound) needs on the orderbook.
export const REHEARSAL_SEED_FUNDED_MICRO = 12_000_000n;

export interface WorldState {
  tokenId?: string;
  noTokenId?: string;
  marketSeed?: string;
  // The market's condition id (the fee market of T3c, or the market the rehearsal trades on).
  marketConditionId?: Hex;
  // A resolved condition for T5's redeem.
  conditionId?: Hex;
}

export interface World {
  readonly target: TargetName;
  readonly banner: string;
  readonly clock: Clock;
  readonly baseFetch: typeof fetch;
  // Upstream hosts beyond XO's own (the Base node).
  readonly extraHosts: readonly string[];
  readonly owner: Address;
  readonly signer: Signer;
  readonly baseWallet: BaseWallet;
  readonly mock: MockXo | undefined;
  readonly ownerKey: HDAccount | undefined;
  readonly state: WorldState;
  // Lets a request held on the mock's clock (a taker order's delay) finish while the caller waits for it.
  pump<T>(work: Promise<T>): Promise<T>;
  // The exchange reads the allowance from the chain on the live target; on the mock the orderbook keeps its own.
  mirrorAllowance(account: Address, micro: bigint): Promise<void>;
  // The person hosts a metadata file themselves on the live target; the rehearsal keeps it in memory.
  host(uri: string, text: string): void;
  readHosted(uri: string): string | undefined;
  // How the rehearsal's oracle treats the next created market (the live oracle decides by itself).
  configureCreation(policy: { readonly decision?: "approve" | "update" | "reject" | "cancel"; readonly reviewDelayS?: number }): void;
  close(): Promise<void>;
}

export interface WorldDeps {
  // A mock to use instead of starting one (shared by several runs; left running).
  readonly mock?: MockXo;
  // A complete world to use instead of building one (tests of the live path against the mock).
  readonly world?: World;
  readonly baseFetch?: typeof fetch;
  readonly clock?: Clock;
  readonly signer?: Signer;
  readonly baseWallet?: BaseWallet;
  readonly signerOptions?: SimulatedPayboxOptions;
  readonly mockOptions?: Pick<MockXoOptions, "seedMarkets">;
}

export type WorldResult = { readonly ok: true; readonly world: World } | { readonly ok: false; readonly reason: string };

const REAL_CLOCK: Clock = {
  nowMs: () => Date.now(),
  sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

export interface BuildWorldArgs {
  readonly opts: Options;
  readonly printer: Printer;
  readonly hide: (value: string | undefined) => void;
  readonly needsXoChain: boolean;
  readonly needsBaseChain: boolean;
  readonly deps: WorldDeps;
  readonly rehearsalKeyAsk?: boolean;
}

export async function buildWorld(args: BuildWorldArgs): Promise<WorldResult> {
  if (args.deps.world !== undefined) return { ok: true, world: args.deps.world };
  return args.opts.target === "mock" ? buildMockWorld(args) : buildLiveWorld(args);
}

// ---- live ------------------------------------------------------------------------------------------------------

function buildLiveWorld(args: BuildWorldArgs): WorldResult {
  const { opts } = args;
  if (opts.owner === undefined) return { ok: false, reason: "--owner is required on the live target: the EVM address of the PayBox credential that owns the XO account." };
  const signer =
    args.deps.signer ??
    operatorSigner({ owner: opts.owner, credentialId: opts.credentialId ?? "<your PayBox credential_id>", printer: args.printer, hide: args.hide, askNote: false });
  const baseWallet = args.deps.baseWallet ?? operatorBaseWallet({ printer: args.printer, hide: args.hide });
  const clock = args.deps.clock ?? REAL_CLOCK;
  return {
    ok: true,
    world: {
      target: "live",
      banner: "LIVE: the real XO and Base services. PayBox is driven by you.",
      clock,
      baseFetch: args.deps.baseFetch ?? ((input, init) => globalThis.fetch(input, init)),
      extraHosts: [],
      owner: opts.owner,
      signer,
      baseWallet,
      mock: undefined,
      ownerKey: undefined,
      state: {},
      pump: (work) => work,
      mirrorAllowance: async () => undefined,
      host: () => undefined,
      readHosted: () => undefined,
      configureCreation: () => undefined,
      close: async () => undefined,
    },
  };
}

// ---- the mock rehearsal --------------------------------------------------------------------------------------------

export function simulatedBaseWallet(mock: MockXo, owner: Address): BaseWallet {
  return {
    kind: "simulated",
    async send(call: BaseCall): Promise<Hex | undefined> {
      const decoded = decodeFundingData(call.data);
      if (decoded.kind === "approve") {
        const tx = await mock.hyperlane.baseApprove(owner, decoded.spender, decoded.amount);
        return tx.transactionHash;
      }
      const result = await mock.hyperlane.baseTransferRemote({ from: owner, recipient: decoded.recipientWord, amount: decoded.amount, destination: decoded.destination });
      return result.transactionHash;
    },
  };
}

async function buildMockWorld(args: BuildWorldArgs): Promise<WorldResult> {
  const { opts } = args;
  const { startMockXo } = await import("../../../test/mock-xo/server.js");
  let mock = args.deps.mock;
  let ownsMock = false;
  if (mock === undefined) {
    const started = await startMockXo({
      profile: opts.mockProfile,
      chains: args.needsXoChain || args.needsBaseChain ? { xo: args.needsXoChain, base: args.needsBaseChain } : false,
      ...(args.deps.mockOptions ?? {}),
    });
    if (!started.ok) return { ok: false, reason: started.reason };
    mock = started.mock;
    ownsMock = true;
  } else {
    mock.setProfile(opts.mockProfile);
  }
  try {
    for (const entry of opts.mockSet) {
      const [name, value] = entry.split("=") as [string, string];
      mock.switches.setByName(name, value);
    }
  } catch (error) {
    if (ownsMock) await mock.stop();
    return { ok: false, reason: `--mock-set: ${error instanceof Error ? error.message : "refused"}` };
  }
  if (args.needsXoChain && mock.chains.xo === undefined) {
    if (ownsMock) await mock.stop();
    return { ok: false, reason: "the rehearsal needs the XO chain and the mock has none" };
  }
  // The public Anvil test accounts: the same keys the chain harness uses, with or without a chain.
  const ownerKey = testAccount(opts.mockOwnerIndex);
  if (opts.owner !== undefined && opts.owner.toLowerCase() !== ownerKey.address.toLowerCase()) {
    if (ownsMock) await mock.stop();
    return { ok: false, reason: "on the mock target the owner is one of the public Anvil test accounts; leave --owner out or use --mock-owner-index" };
  }
  const live = mock;
  const hostedFiles = new Map<string, string>();
  // The file the person would host themselves on the live target is served from memory; everything else is the mock.
  const hostedFetch: typeof fetch = async (input, init) => {
    const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const text = (init?.method ?? "GET").toUpperCase() === "GET" ? hostedFiles.get(href) : undefined;
    if (text !== undefined) return new Response(text, { status: 200, headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(text)) } });
    return live.asFetch(input, init);
  };
  const clock: Clock = args.deps.clock ?? {
    nowMs: () => live.clock.nowMs(),
    sleep: async (ms) => {
      await live.advance(Math.max(0, ms) / 1000);
    },
    pace: async (ms) => {
      live.clock.advanceMs(Math.max(0, Math.round(ms)));
    },
  };
  const signer = args.deps.signer ?? simulatedSigner(ownerKey as unknown as Parameters<typeof simulatedSigner>[0], args.deps.signerOptions);
  const world: World = {
    target: "mock",
    banner: "MOCK: a local rehearsal on the mock XO. Nothing leaves this machine. The signer is a stand-in with a PUBLIC test key.",
    clock,
    baseFetch: hostedFetch,
    extraHosts: ["mainnet.base.org"],
    owner: ownerKey.address,
    signer,
    baseWallet: args.deps.baseWallet ?? simulatedBaseWallet(live, ownerKey.address),
    mock,
    ownerKey,
    state: {},
    async pump<T>(work: Promise<T>): Promise<T> {
      let done = false;
      const settled = work.finally(() => {
        done = true;
      });
      const timer = setInterval(() => {
        if (!done && live.clock.waiterCount() > 0) void live.advance(1);
      }, 15);
      try {
        return await settled;
      } finally {
        clearInterval(timer);
      }
    },
    async mirrorAllowance(account, micro) {
      live.state.setBalance(account, { allowanceMicro: micro });
    },
    host: (uri, text) => {
      hostedFiles.set(uri, text);
    },
    readHosted: (uri) => hostedFiles.get(uri),
    configureCreation: (policy) => {
      live.creation.policy = { ...live.creation.policy, ...policy };
    },
    async close() {
      if (ownsMock) await live.stop();
    },
  };
  return { ok: true, world };
}

export function arrangeNeeds(steps: readonly ArrangeStep[]): ReadonlySet<ArrangeStep> {
  return new Set(steps);
}

export { encodeFunctionData, getAddress };
