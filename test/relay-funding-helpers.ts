import type { Address, Hex } from "viem";

import { BASE_WARP_ROUTER } from "../src/xo/chain/constants.js";
import { deriveAccount } from "../src/xo/account/derive.js";
import { padRecipient } from "../src/xo/funding/calldata.js";
import type { MockXo } from "./mock-xo/server.js";

// Helpers for the relay-funding tests. Not a test file.

export const USD = 1_000_000n;

export interface SentFunding {
  readonly hash: Hex;
  readonly messageId: Hex | null;
  readonly status: "success" | "reverted";
}

// What the owner does with PayBox on Base: approve the exact amount, then transferRemote(3223, account, amount).
// The user's Base wallet is the mock's emulation (mock.hyperlane); the relay never does this.
export async function sendFunding(
  mock: MockXo,
  owner: Address,
  amount: bigint,
  options: { readonly recipient?: Hex; readonly approve?: bigint; readonly value?: bigint; readonly sendAmount?: bigint } = {},
): Promise<SentFunding> {
  mock.hyperlane.setBaseBalance(owner, 100n * USD);
  await mock.hyperlane.baseApprove(owner, BASE_WARP_ROUTER, options.approve ?? amount);
  const sent = await mock.hyperlane.baseTransferRemote({
    from: owner,
    recipient: options.recipient ?? padRecipient(deriveAccount(owner)),
    amount: options.sendAmount ?? amount,
    ...(options.value === undefined ? {} : { value: options.value }),
  });
  return { hash: sent.transactionHash, messageId: sent.messageId, status: sent.status };
}

export function usd(atomic: bigint): string {
  const whole = atomic / USD;
  const fraction = (atomic % USD).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction === "" ? whole.toString() : `${whole}.${fraction}`;
}
