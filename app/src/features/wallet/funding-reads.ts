// The Base and XO reads that decide which funding step is next (display only; see funding-view.ts).
//
// Three numbers, each null when it could not be read (never 0): the owner's Circle USDC balance on Base, the
// allowance the owner has given the Hyperlane router, and the XO account's USDC.e balance on chain 3223. They
// choose the step the screen suggests; they never change what a call contains.

import { encodeFunctionData, getAddress, type Hex } from "viem";

import { BASE_CHAIN_ID, BASE_USDC, BASE_WARP_ROUTER, USDC_E_ADDRESS, XO_CHAIN_ID } from "@shared/xo/chain/constants";
import { ERC20_ABI } from "@shared/xo/chain/abi";

import { chainById } from "../../core/account";
import type { AdapterDeps } from "../../core/ports";
import { createChainReader, uintOf } from "./rpc";

export interface FundingReads {
  readonly baseUsdcBalance: bigint | null;
  readonly allowance: bigint | null;
  readonly xoBalance: bigint | null;
}

export async function readFundingReads(deps: AdapterDeps, owner: string, account: string): Promise<FundingReads> {
  const base = chainById(BASE_CHAIN_ID);
  const xo = chainById(XO_CHAIN_ID);
  const baseReader = base === undefined ? null : createChainReader(deps, base);
  const xoReader = xo === undefined ? null : createChainReader(deps, xo);

  const ownerAddress = getAddress(owner);
  const accountAddress = getAddress(account);
  const balanceOf = (holder: `0x${string}`): Hex => encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [holder] });

  const [baseResults, xoResults] = await Promise.all([
    baseReader === null
      ? null
      : baseReader
          .read([
            { kind: "call", to: BASE_USDC, data: balanceOf(ownerAddress) },
            { kind: "call", to: BASE_USDC, data: encodeFunctionData({ abi: ERC20_ABI, functionName: "allowance", args: [ownerAddress, BASE_WARP_ROUTER] }) },
          ])
          .catch(() => null),
    xoReader === null ? null : xoReader.read([{ kind: "call", to: USDC_E_ADDRESS, data: balanceOf(accountAddress) }]).catch(() => null),
  ]);
  return {
    baseUsdcBalance: uintOf(baseResults?.[0]),
    allowance: uintOf(baseResults?.[1]),
    xoBalance: uintOf(xoResults?.[0]),
  };
}
