// The XO chain reads live in the SDK (sdk/chain/xo/reads.ts), over the one JSON-RPC port (sdk/chain/rpc.ts). This
// path stays for its many plugin, relay and test importers, and adds the one read that needs the Kernel account
// derivation, which is not in the SDK.

import { isAddress } from "viem";

import { isKernelProxyRuntime } from "../account/derive.js";
import { ChainReadError, type RpcReader } from "../../../sdk/chain/xo/reads.js";
import type { Address } from "../../../sdk/chain/xo/constants.js";

export * from "../../../sdk/chain/xo/reads.js";

export type CodeObservation = "kernel_proxy" | "other_code" | "none";

// eth_getCode on the account. Only the exact Kernel proxy runtime counts as a deployed Kernel.
export async function readAccountCode(rpc: RpcReader, account: Address): Promise<CodeObservation> {
  // Lower-case or exact EIP-55 only, as every helper read requires.
  if (typeof account !== "string" || !isAddress(account, { strict: true })) throw new ChainReadError("invalid_input", "account is not a valid address");
  const code = await rpc.getCode(account);
  if (code === "0x") return "none";
  return isKernelProxyRuntime(code) ? "kernel_proxy" : "other_code";
}
