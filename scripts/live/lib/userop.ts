import type { PostRequest, PostResponse, RelayFailure } from "../../../src/relay/contract.js";
import { cleanLine } from "./redact.js";
import { rawPrefixFromFacts, signItem, type SignedItem } from "./flows.js";
import type { RunContext } from "./types.js";

// The user-operation procedure T5, T8, T6 and T4 share: prepare, sign the userOpHash once, submit once,
// follow by hash. The relay does the deciding (gates, paymaster, nonce, gas); the kit only carries the
// owner's signature across and prints what it is asked to sign.

export type UserOpBody = PostRequest<"/v1/userop/prepare">;
export type PreparedUserOpItem = PostResponse<"/v1/userop/prepare">;

export type PreparedOp = { readonly ok: true; readonly item: PreparedUserOpItem } | { readonly ok: false; readonly error: RelayFailure; readonly httpStatus: number };

export async function prepareUserOp(ctx: RunContext, body: UserOpBody): Promise<PreparedOp> {
  const result = await ctx.client.post("/v1/userop/prepare", body);
  if (!result.ok) return { ok: false, error: result.error, httpStatus: result.status };
  const item = result.data;
  ctx.observe("user_op_hash", item.user_op_hash);
  ctx.observe("digest_tag", item.summary.digest_tag);
  for (const line of item.summary.lines) ctx.say(`   ${cleanLine(line, 300)}`);
  for (const warning of item.warnings) ctx.say(`   warning: ${cleanLine(warning, 300)}`);
  return { ok: true, item };
}

export interface Sent {
  readonly state: "submitted" | "rejected" | "ambiguous";
  readonly hash: string;
  readonly detail: string | undefined;
  readonly signed: SignedItem;
}

// Signs and submits ONCE. A refusal from the relay (flag, tripwire, bundler unreachable) comes back as `refused`;
// the item is then unused or spent, and nothing is sent again by this code.
export async function signAndSubmitUserOp(
  ctx: RunContext,
  item: PreparedUserOpItem,
  label: string,
  steps: { readonly sign?: () => void; readonly submit?: () => void } = {},
): Promise<Sent | { readonly refused: RelayFailure }> {
  const prefix = rawPrefixFromFacts(ctx);
  steps.sign?.();
  const signed = await signItem(ctx, item, label, { validForS: 300, ...(prefix === undefined ? {} : { rawHexPrefix: prefix }) });
  ctx.observe("signature", `recovers the owner under the ${signed.form} digest`);
  steps.submit?.();
  const result = await ctx.client.post("/v1/userop/submit", { prepared_id: item.prepared_id, signature: signed.input });
  if (!result.ok) return { refused: result.error };
  ctx.observe("submit", `${result.data.state}${result.data.detail === undefined ? "" : `: ${cleanLine(result.data.detail, 200)}`}`);
  return { state: result.data.state, hash: result.data.user_op_hash, detail: result.data.detail, signed };
}
