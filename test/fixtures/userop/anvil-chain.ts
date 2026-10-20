// A throwaway local anvil (chain id 3223) carrying the REAL EntryPoint v0.7, SenderCreator, KernelFactory,
// ECDSA validator and Kernel implementation at their real addresses (bytecode captured from the public XO
// explorer on 2026-10-19, test/fixtures/bytecode/). The three contracts the account calls (USDC.e, the
// Conditional Tokens, the market manager) and the XO route are one-line stubs that log their calldata, so
// a test can see exactly what the Kernel executed. A funded test EOA plays the bundler.
//
// This file is tooling for test/userop-anvil.test.ts and uses only the public Anvil test accounts. It starts
// anvil through test/anvil/start.ts (127.0.0.1, free port, killed on stop). If anvil or the bytecode is
// missing, boot() returns { ok: false, reason } and the test skips.

import { readFileSync } from "node:fs";

import { decodeErrorResult, encodeFunctionData, keccak256, parseAbi, type Hex } from "viem";

import { ENTRY_POINT_ABI } from "../../../src/xo/chain/abi.js";
import { CONDITIONAL_TOKENS, ENTRY_POINT_V07, MARKET_MANAGER, USDC_E_ADDRESS, XO_CHAIN_ID, XO_WARP_ROUTE, type Address } from "../../../src/xo/chain/constants.js";
import { startAnvil, type AnvilHandle } from "../../anvil/start.js";
import type { PackedUserOp } from "../../../src/xo/userop/pack.js";
import { ANVIL_TEST_ACCOUNTS } from "./anvil-test-keys.js";

const REAL_CONTRACTS = ["entrypoint-v07", "sender-creator", "kernel-factory", "ecdsa-validator", "kernel-implementation"] as const;

// CALLDATASIZE PUSH0 PUSH0 CALLDATACOPY CALLDATASIZE PUSH0 LOG0 STOP: log0(calldata). Needs PUSH0 (Shanghai+).
export const LOGGING_STUB: Hex = "0x365f5f37365fa000";

export const STUBBED_TARGETS: readonly Address[] = [USDC_E_ADDRESS, CONDITIONAL_TOKENS, MARKET_MANAGER, XO_WARP_ROUTE];

const ERRORS_ABI = parseAbi([
  "error FailedOp(uint256 opIndex, string reason)",
  "error FailedOpWithRevert(uint256 opIndex, string reason, bytes inner)",
]);

interface Fixture {
  readonly name: string;
  readonly address: Address;
  readonly code: Hex;
}

function loadFixture(name: string): Fixture | string {
  try {
    const meta = JSON.parse(readFileSync(new URL(`../bytecode/${name}.json`, import.meta.url), "utf8")) as { address: Address; keccak256: Hex };
    const code = readFileSync(new URL(`../bytecode/${name}.hex`, import.meta.url), "utf8").trim() as Hex;
    if (keccak256(code) !== meta.keccak256) return `the bytecode fixture ${name} does not match its recorded hash`;
    return { name, address: meta.address, code };
  } catch {
    return `the bytecode fixture ${name} is missing`;
  }
}

export interface Chain {
  readonly ok: true;
  readonly anvil: AnvilHandle;
  readonly bundler: Address;
  rpc<T = unknown>(method: string, params?: readonly unknown[]): Promise<T>;
  // eth_call
  call(to: Address, data: Hex, from?: Address): Promise<Hex>;
  // The bundler EOA calls EntryPoint.handleOps([op], beneficiary) and the receipt comes back (status, logs).
  bundle(op: PackedUserOp): Promise<Receipt>;
  // The same call as a simulation. ok:true, or the EntryPoint's own error (for example "AA24 signature error").
  simulate(op: PackedUserOp): Promise<{ ok: true } | { ok: false; reason: string; revert: Hex | null }>;
  stop(): Promise<void>;
}

export interface Receipt {
  readonly status: "success" | "reverted";
  readonly logs: readonly { address: string; topics: readonly string[]; data: Hex }[];
}

export type Boot = Chain | { readonly ok: false; readonly reason: string };

export async function boot(): Promise<Boot> {
  const fixtures: Fixture[] = [];
  for (const name of REAL_CONTRACTS) {
    const loaded = loadFixture(name);
    if (typeof loaded === "string") return { ok: false, reason: loaded };
    fixtures.push(loaded);
  }
  const started = await startAnvil({ chainId: XO_CHAIN_ID });
  if (!started.ok) return { ok: false, reason: started.reason };
  const anvil = started;
  const rpc = anvil.rpc.bind(anvil);
  for (const f of fixtures) await rpc("anvil_setCode", [f.address, f.code]);
  for (const target of STUBBED_TARGETS) await rpc("anvil_setCode", [target, LOGGING_STUB]);
  const bundler = (ANVIL_TEST_ACCOUNTS[1] as (typeof ANVIL_TEST_ACCOUNTS)[number]).address;
  const beneficiary = bundler;

  const handleOpsData = (op: PackedUserOp): Hex => encodeFunctionData({ abi: ENTRY_POINT_ABI, functionName: "handleOps", args: [[op], beneficiary] });

  const call = async (to: Address, data: Hex, from?: Address): Promise<Hex> => rpc<Hex>("eth_call", [{ to, data, ...(from === undefined ? {} : { from }) }, "latest"]);

  return {
    ok: true,
    anvil,
    bundler,
    rpc,
    call,
    async bundle(op) {
      // The bundler is an unlocked default account; gas is set so no estimate is needed.
      const hash = await rpc<Hex>("eth_sendTransaction", [{ from: bundler, to: ENTRY_POINT_V07, data: handleOpsData(op), gas: "0x4c4b40" }]);
      const receipt = await rpc<{ status: string; logs: { address: string; topics: string[]; data: Hex }[] }>("eth_getTransactionReceipt", [hash]);
      return { status: receipt.status === "0x1" ? "success" : "reverted", logs: receipt.logs };
    },
    async simulate(op) {
      try {
        await rpc("eth_call", [{ from: bundler, to: ENTRY_POINT_V07, data: handleOpsData(op), gas: "0x4c4b40" }, "latest"]);
        return { ok: true };
      } catch (error) {
        const data = (error as { data?: unknown }).data;
        if (typeof data === "string" && data.startsWith("0x")) {
          try {
            const decoded = decodeErrorResult({ abi: ERRORS_ABI, data: data as Hex });
            return { ok: false, reason: String(decoded.args?.[1] ?? decoded.errorName), revert: data as Hex };
          } catch {
            return { ok: false, reason: `reverted with ${data.slice(0, 10)}`, revert: data as Hex };
          }
        }
        return { ok: false, reason: error instanceof Error ? error.message : String(error), revert: null };
      }
    },
    stop: () => anvil.stop(),
  };
}
