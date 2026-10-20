// The chain harness: a local anvil that carries the REAL XO account stack at its real addresses.
//
//   real bytecode (captured 2026-10-19, test/fixtures/bytecode/*)
//     EntryPoint v0.7, its SenderCreator, KernelFactory 0.3.1, ECDSA validator, Kernel implementation
//     0.3.1, and the PolicyPaymaster (7,309 bytes)
//   stubs (test/anvil/stubs.ts, each labelled for what it is)
//     USDC.e as a plain ERC-20, a minimal Conditional Tokens, a minimal exchange
//   a test EOA that plays the bundler by calling EntryPoint.handleOps
//
// What this proves: contract-level behaviour of the real code (address derivation, deployment by
// initCode, signature validation, nonces, execute, ERC-1271, the paymaster's call-data policy).
// What it does not prove: anything about XO's bundler, orderbook, registry or gateway (spec 5.5).
//
// Two variants. "xo" is chain 3223 with captured bytecode. "base" is chain 8453 with the same
// EntryPoint, factory and validator and a Kernel implementation whose two chain-dependent immutables
// are rewritten as the notes describe (bytecode.ts). The Base variant was NOT captured from Base and
// is unverified against the real Base contracts; it has no paymaster and no stubs.

import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  http,
  pad,
  parseAbi,
  parseEventLogs,
  toFunctionSelector,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";

import { ENTRY_POINT_ABI } from "../../src/xo/chain/abi.js";
import {
  BASE_CHAIN_ID,
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE,
  APPROVE_SELECTOR,
  ECDSA_VALIDATOR,
  ENTRY_POINT_V07,
  KERNEL_FACTORY,
  KERNEL_IMPLEMENTATION,
  MARKET_MANAGER,
  PAYMASTER_DAILY_TX_LIMIT_OBSERVED,
  PAYMASTER_OWNER_OBSERVED,
  PAYMASTER_POLICY_PROBES,
  POLICY_PAYMASTER,
  USDC_E_ADDRESS,
  XO_CHAIN_ID,
} from "../../src/xo/chain/constants.js";
import { startAnvil, type AnvilHandle } from "./start.js";
import {
  loadAllBytecode,
  patchKernelImplementation,
  type BytecodeName,
} from "./bytecode.js";
import { ctfStubRuntime, exchangeStubRuntime, usdceStubRuntime } from "./stubs.js";
import { decodeEntryPointError, type EntryPointError, type PackedUserOp } from "./userop.js";

// The well-known public test mnemonic that Anvil and Hardhat derive their default accounts from.
// TEST ONLY: these keys control nothing on any real chain.
export const TEST_MNEMONIC = "test test test test test test test test test test test junk";

export const TEST_ACCOUNT_COUNT = 10;

export function testAccount(index: number): HDAccount {
  if (!Number.isInteger(index) || index < 0 || index >= TEST_ACCOUNT_COUNT) throw new Error("test account index is 0 to 9");
  return mnemonicToAccount(TEST_MNEMONIC, { addressIndex: index });
}

// ---- events and errors we decode -------------------------------------------------------------------------

export const ENTRY_POINT_EVENTS_ABI = parseAbi([
  "event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)",
  "event UserOperationRevertReason(bytes32 indexed userOpHash, address indexed sender, uint256 nonce, bytes revertReason)",
  "event AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)",
  "event Deposited(address indexed account, uint256 totalDeposit)",
]);

export const PAYMASTER_ADMIN_ABI = parseAbi([
  "function owner() view returns (address)",
  "function paused() view returns (bool)",
  "function dailyTxLimit() view returns (uint256)",
  "function getDailyUsage(address account) view returns (uint256)",
  "function getDeposit() view returns (uint256)",
  "function deposit() payable",
  "function pause()",
  "function unpause()",
  "function setDailyTxLimit(uint256 dailyTxLimit)",
  "function setGloballyAllowedSelector(bytes4 selector, bool status)",
  "function setAllowedSelectors(address target, bytes4[] selectors, bool status)",
  "function setUnlimitedAddress(address account, bool status)",
]);

// ---- the paymaster allowlist we replay -------------------------------------------------------------------------

// The identified part of the allowlist on 2026-10-18 (docs/research/21 sec 7 and V1.10). It is written
// into the real contract's storage through its own owner functions, so the contract's validation code
// is real and the allowlist CONTENT is replayed from those notes, not from logs (no network here).
// Not replayed because the notes could not name them: 33 further global selectors, three manager
// selectors (createCLOBMarket, pauseTrading, unpauseTrading) and the oracle entries.
export interface ReplayEntry {
  readonly scope: "global" | "target";
  readonly target?: Address;
  readonly selector: Hex;
  readonly label: string;
}

const SAFE_TRANSFER_FROM = toFunctionSelector("safeTransferFrom(address,address,uint256,uint256,bytes)");
const CREATE_CONVICTION_MARKET_FOR = toFunctionSelector("createConvictionMarketFor(address,uint40,uint40,address,string)");

export const PAYMASTER_REPLAY: readonly ReplayEntry[] = Object.freeze([
  { scope: "global", selector: APPROVE_SELECTOR, label: "approve(address,uint256) on any target" },
  ...PAYMASTER_POLICY_PROBES.filter((probe) => probe.allowed && probe.selector !== APPROVE_SELECTOR).map(
    (probe): ReplayEntry => ({ scope: "target", target: probe.target, selector: probe.selector, label: probe.label }),
  ),
  { scope: "target", target: CONDITIONAL_TOKENS, selector: SAFE_TRANSFER_FROM, label: "CTF safeTransferFrom" },
  {
    scope: "target",
    target: MARKET_MANAGER,
    selector: CREATE_CONVICTION_MARKET_FOR,
    label: "manager createConvictionMarketFor",
  },
] as const);

// ---- the chain object ----------------------------------------------------------------------------------------------

export type ChainKind = "xo" | "base";

export interface XoChainOptions {
  readonly kind?: ChainKind;
  // Install the real PolicyPaymaster with the replayed allowlist and a deposit (xo only). Default true.
  readonly paymaster?: boolean;
  // Install the three stubs (xo only). Default true.
  readonly stubs?: boolean;
}

export interface UserOpEventSummary {
  readonly userOpHash: Hex;
  readonly sender: Address;
  readonly paymaster: Address;
  readonly nonce: bigint;
  readonly success: boolean;
  readonly actualGasCost: bigint;
  readonly actualGasUsed: bigint;
}

export interface AccountDeployedSummary {
  readonly userOpHash: Hex;
  readonly sender: Address;
  readonly factory: Address;
  readonly paymaster: Address;
}

export interface HandleOpsSuccess {
  readonly ok: true;
  readonly txHash: Hex;
  readonly receipt: TransactionReceipt;
  readonly ops: readonly UserOpEventSummary[];
  // AccountDeployed events, in log order (the EntryPoint emits one per initCode that created a sender).
  readonly deployments: readonly AccountDeployedSummary[];
  // Revert reasons the EntryPoint reported for inner calls that failed (the op landed, success false).
  readonly revertReasons: readonly Hex[];
}

export interface HandleOpsFailure {
  readonly ok: false;
  readonly error: EntryPointError;
}

export interface CallFrame {
  readonly type: string;
  readonly from: Address;
  readonly to?: Address;
  readonly input: Hex;
  readonly value: bigint;
  readonly error?: string;
  readonly calls: readonly CallFrame[];
}

export interface XoChain {
  readonly kind: ChainKind;
  readonly chainId: number;
  readonly url: string;
  readonly anvil: AnvilHandle;
  readonly publicClient: PublicClient;
  readonly bundler: HDAccount;
  readonly entryPoint: Address;
  readonly stubs: boolean;
  readonly paymaster: boolean;
  owner(index: number): HDAccount;
  rpc<T = unknown>(method: string, params?: readonly unknown[]): Promise<T>;
  snapshot(): Promise<string>;
  revert(id: string): Promise<void>;
  setNextBlockTimestamp(timestamp: number): Promise<void>;
  increaseTime(seconds: number): Promise<void>;
  blockTimestamp(): Promise<number>;
  sendFrom(from: Address, to: Address, data: Hex, options?: { value?: bigint; gas?: bigint }): Promise<TransactionReceipt>;
  simulateHandleOps(ops: readonly PackedUserOp[]): Promise<{ ok: true } | HandleOpsFailure>;
  handleOps(ops: readonly PackedUserOp[]): Promise<HandleOpsSuccess | HandleOpsFailure>;
  entryPointGetUserOpHash(op: PackedUserOp): Promise<Hex>;
  getNonce(sender: Address, key: bigint): Promise<bigint>;
  callTrace(txHash: Hex): Promise<CallFrame>;
  stop(): Promise<void>;
}

// ok: false only when anvil itself is unavailable (the caller skips with the reason). Any other problem throws.
export type XoChainStart = { readonly ok: true; readonly chain: XoChain } | { readonly ok: false; readonly reason: string };

const toRpcHex = (value: bigint): Hex => toHex(value);

async function pause(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function startXoChain(options: XoChainOptions = {}): Promise<XoChainStart> {
  const kind: ChainKind = options.kind ?? "xo";
  const chainId = kind === "xo" ? XO_CHAIN_ID : BASE_CHAIN_ID;
  const wantPaymaster = kind === "xo" && options.paymaster !== false;
  const wantStubs = kind === "xo" && options.stubs !== false;

  // Only a node that is not there is a reason to skip. A missing or altered fixture, or a setup step that
  // fails, is a broken harness and throws, so the tests fail instead of silently skipping.
  const fixtures = loadAllBytecode();

  const started = await startAnvil({ chainId });
  if (!started.ok) return { ok: false, reason: started.reason };
  const anvil = started;

  try {
    const setCode = async (address: Address, code: Hex): Promise<void> => {
      await anvil.rpc("anvil_setCode", [address, code]);
    };
    const names: BytecodeName[] = ["entrypoint-v07", "sender-creator", "kernel-factory", "ecdsa-validator", "kernel-implementation"];
    if (wantPaymaster) names.push("policy-paymaster");
    for (const name of names) {
      const fixture = fixtures[name];
      const code = kind === "base" && name === "kernel-implementation" ? patchKernelImplementation(fixture.code, XO_CHAIN_ID, BASE_CHAIN_ID).code : fixture.code;
      await setCode(fixture.address, code);
    }
    if (wantStubs) {
      await setCode(USDC_E_ADDRESS, usdceStubRuntime());
      await setCode(CONDITIONAL_TOKENS, ctfStubRuntime());
      await setCode(CTF_EXCHANGE, exchangeStubRuntime());
    }

    const viemChain = defineChain({
      id: chainId,
      name: kind === "xo" ? "XO (local anvil, test)" : "Base (local anvil, test, derived bytecode)",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [anvil.url] } },
    });
    const publicClient = createPublicClient({ chain: viemChain, transport: http(anvil.url), pollingInterval: 20 });
    const bundler = testAccount(1);

    const receiptFor = async (hash: Hex): Promise<TransactionReceipt> => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        try {
          return await publicClient.getTransactionReceipt({ hash });
        } catch {
          await pause(25);
        }
      }
      throw new Error(`no receipt for ${hash}`);
    };

    const sendFrom: XoChain["sendFrom"] = async (from, to, data, sendOptions = {}) => {
      const hash = await anvil.rpc<Hex>("eth_sendTransaction", [
        {
          from,
          to,
          data,
          ...(sendOptions.value !== undefined ? { value: toRpcHex(sendOptions.value) } : {}),
          gas: toRpcHex(sendOptions.gas ?? 12_000_000n),
        },
      ]);
      return receiptFor(hash);
    };

    if (wantPaymaster) {
      // Slot 0 of the real contract holds Ownable._owner (and Pausable._paused in the next byte). The
      // layout is read from the verified source and then checked below by calling owner() and paused().
      await anvil.rpc("anvil_setStorageAt", [POLICY_PAYMASTER, toHex(0n, { size: 32 }), pad(PAYMASTER_OWNER_OBSERVED, { size: 32 })]);
      const owner = (await publicClient.readContract({ address: POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName: "owner" })) as Address;
      if (owner.toLowerCase() !== PAYMASTER_OWNER_OBSERVED.toLowerCase()) throw new Error("paymaster owner slot guess is wrong");
      const paused = await publicClient.readContract({ address: POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName: "paused" });
      if (paused) throw new Error("paymaster starts paused");
      await anvil.rpc("anvil_impersonateAccount", [PAYMASTER_OWNER_OBSERVED]);
      await anvil.rpc("anvil_setBalance", [PAYMASTER_OWNER_OBSERVED, toRpcHex(10n ** 18n)]);
      const ownerCall = async (data: Hex): Promise<void> => {
        const receipt = await sendFrom(PAYMASTER_OWNER_OBSERVED, POLICY_PAYMASTER, data);
        if (receipt.status !== "success") throw new Error("a paymaster owner call reverted");
      };
      await ownerCall(encodeFunctionData({ abi: PAYMASTER_ADMIN_ABI, functionName: "setDailyTxLimit", args: [PAYMASTER_DAILY_TX_LIMIT_OBSERVED] }));
      for (const entry of PAYMASTER_REPLAY) {
        if (entry.scope === "global") {
          await ownerCall(encodeFunctionData({ abi: PAYMASTER_ADMIN_ABI, functionName: "setGloballyAllowedSelector", args: [entry.selector as Hex, true] }));
        } else {
          await ownerCall(
            encodeFunctionData({ abi: PAYMASTER_ADMIN_ABI, functionName: "setAllowedSelectors", args: [entry.target as Address, [entry.selector as Hex], true] }),
          );
        }
      }
      await anvil.rpc("anvil_stopImpersonatingAccount", [PAYMASTER_OWNER_OBSERVED]);
      // The paymaster pays from its EntryPoint deposit; fund it from the bundler's test balance.
      const deposited = await sendFrom(bundler.address, POLICY_PAYMASTER, encodeFunctionData({ abi: PAYMASTER_ADMIN_ABI, functionName: "deposit" }), {
        value: 100n * 10n ** 18n,
      });
      if (deposited.status !== "success") throw new Error("paymaster deposit failed");
    }

    const handleOpsData = (ops: readonly PackedUserOp[]): Hex =>
      encodeFunctionData({ abi: ENTRY_POINT_ABI, functionName: "handleOps", args: [ops.map((op) => ({ ...op })), bundler.address] });

    const simulateHandleOps: XoChain["simulateHandleOps"] = async (ops) => {
      try {
        await anvil.rpc("eth_call", [{ from: bundler.address, to: ENTRY_POINT_V07, data: handleOpsData(ops), gas: toRpcHex(12_000_000n) }, "latest"]);
        return { ok: true };
      } catch (error) {
        const data = (error as { data?: unknown }).data;
        return { ok: false, error: decodeEntryPointError(typeof data === "string" ? (data as Hex) : undefined) };
      }
    };

    const handleOps: XoChain["handleOps"] = async (ops) => {
      const simulated = await simulateHandleOps(ops);
      if (!simulated.ok) return simulated;
      const receipt = await sendFrom(bundler.address, ENTRY_POINT_V07, handleOpsData(ops));
      const events = parseEventLogs({ abi: ENTRY_POINT_EVENTS_ABI, logs: receipt.logs });
      const summaries: UserOpEventSummary[] = [];
      const deployments: AccountDeployedSummary[] = [];
      const revertReasons: Hex[] = [];
      for (const event of events) {
        if (event.eventName === "UserOperationEvent") {
          summaries.push({
            userOpHash: event.args.userOpHash,
            sender: event.args.sender,
            paymaster: event.args.paymaster,
            nonce: event.args.nonce,
            success: event.args.success,
            actualGasCost: event.args.actualGasCost,
            actualGasUsed: event.args.actualGasUsed,
          });
        } else if (event.eventName === "AccountDeployed") {
          deployments.push({ userOpHash: event.args.userOpHash, sender: event.args.sender, factory: event.args.factory, paymaster: event.args.paymaster });
        } else if (event.eventName === "UserOperationRevertReason") {
          revertReasons.push(event.args.revertReason);
        }
      }
      return { ok: true, txHash: receipt.transactionHash, receipt, ops: summaries, deployments, revertReasons };
    };

    const chain: XoChain = {
      kind,
      chainId,
      url: anvil.url,
      anvil,
      publicClient,
      bundler,
      entryPoint: ENTRY_POINT_V07,
      stubs: wantStubs,
      paymaster: wantPaymaster,
      owner: testAccount,
      rpc: anvil.rpc,
      snapshot: () => anvil.rpc<string>("evm_snapshot"),
      revert: async (id) => {
        const ok = await anvil.rpc<boolean>("evm_revert", [id]);
        if (!ok) throw new Error("evm_revert refused the snapshot id");
      },
      setNextBlockTimestamp: async (timestamp) => {
        await anvil.rpc("evm_setNextBlockTimestamp", [timestamp]);
        await anvil.rpc("evm_mine");
      },
      increaseTime: async (seconds) => {
        await anvil.rpc("evm_increaseTime", [seconds]);
        await anvil.rpc("evm_mine");
      },
      blockTimestamp: async () => {
        const block = await anvil.rpc<{ timestamp: Hex }>("eth_getBlockByNumber", ["latest", false]);
        return Number(BigInt(block.timestamp));
      },
      sendFrom,
      simulateHandleOps,
      handleOps,
      entryPointGetUserOpHash: (op) =>
        publicClient.readContract({ address: ENTRY_POINT_V07, abi: ENTRY_POINT_ABI, functionName: "getUserOpHash", args: [{ ...op }] }) as Promise<Hex>,
      getNonce: (sender, key) =>
        publicClient.readContract({ address: ENTRY_POINT_V07, abi: ENTRY_POINT_ABI, functionName: "getNonce", args: [sender, key] }) as Promise<bigint>,
      callTrace: async (txHash) => {
        const raw = await anvil.rpc<RawFrame>("debug_traceTransaction", [txHash, { tracer: "callTracer" }]);
        return toFrame(raw);
      },
      stop: () => anvil.stop(),
    };
    return { ok: true, chain };
  } catch (error) {
    await anvil.stop();
    throw error;
  }
}

interface RawFrame {
  type: string;
  from: Address;
  to?: Address;
  input?: Hex;
  value?: Hex;
  error?: string;
  calls?: RawFrame[];
}

// Thrown when the node does not return a callTracer tree (anvil 0.2.0 returns something else).
export class TraceUnsupportedError extends Error {
  constructor() {
    super("this anvil's debug_traceTransaction does not return a callTracer tree (anvil 0.2.0 does not; a current foundryup anvil does)");
    this.name = "TraceUnsupportedError";
  }
}

function toFrame(raw: RawFrame): CallFrame {
  if (typeof raw.type !== "string" || typeof raw.from !== "string") throw new TraceUnsupportedError();
  return {
    type: raw.type,
    from: raw.from,
    ...(raw.to !== undefined ? { to: raw.to } : {}),
    input: raw.input ?? "0x",
    value: raw.value === undefined ? 0n : BigInt(raw.value),
    ...(raw.error !== undefined ? { error: raw.error } : {}),
    calls: (raw.calls ?? []).map(toFrame),
  };
}

// Every frame of the tree in call order (depth first), for assertions such as "the Kernel called
// USDC.e.approve(exchange, max)".
export function flattenFrames(frame: CallFrame): CallFrame[] {
  return [frame, ...frame.calls.flatMap(flattenFrames)];
}

export const KNOWN_REAL_ADDRESSES = Object.freeze({
  entryPoint: ENTRY_POINT_V07,
  factory: KERNEL_FACTORY,
  validator: ECDSA_VALIDATOR,
  implementation: KERNEL_IMPLEMENTATION,
  paymaster: POLICY_PAYMASTER,
});
