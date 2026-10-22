import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import { clobAccountOf } from "../clob/polymarket/deposit-wallet.js";
import {
  PREPARED_GET_SINCE_RELAY_VERSION,
  PREPARED_KINDS,
  RELAY_CLIENT_TIMEOUT_MS,
  SAFETY_NOTICES,
  preparedIdSchema,
  preparedItemPath,
  preparedItemSchema,
  type PreparedKind,
  type RelayFailure,
  type RelayResult,
} from "../relay/contract.js";
import type { WriteFlagName } from "../relay/flags.js";
import {
  Budget,
  DECODED_NOTICE,
  FACT_IDS_NOTE,
  STATUS_ANNOTATIONS,
  baseResultShape,
  buildPreparedResult,
  cleanText,
  defaultRelayToolDeps,
  gateWrite,
  internalFailure,
  makeScrub,
  nextFor,
  parseIdentity,
  preparedOutputSchema,
  preparedResultShape,
  readConventionShape,
  readConventions,
  refusalFromFailure,
  refusalResult,
  vetPrepared,
  type PreparedLike,
  type Refusal,
  type RelayToolDeps,
  type Scrub,
  type ToolContext,
} from "./relay-tool-kit.js";

// xo_get_prepared (amendment R9, docs/dapp-design.md 5.5): returns the stored Prepared record for a prepared_id.
//
// Why: when the Cockpit page asks the relay to prepare something (the dApp-initiated flow), the agent must not
// take the page's word for what it is about to have signed. It asks the relay for the record by id instead, and
// this plugin does what it does for every prepared item it builds itself: it checks the owner, the derived
// account, the kind and the time left, rebuilds the digest, the inner_hash_tag and every summary line from the
// decoded block (R1), cleans every text, and refuses an item that does not match. Read-only: it changes nothing,
// reserves nothing and needs no switch. It hands out sign_with_paybox only when the matching write path is on at
// this plugin and the kill switch is off, like a prepare tool outside a dry run.
//
// The relay route it calls, GET /v1/prepared/{prepared_id} (src/relay/contract.ts, relay/prepared.ts), answers exactly
// the item the prepare route returned (the strict Prepared object of its kind) while that item can still be signed,
// and otherwise its state: expired, already used (or a send whose outcome is unknown), or not found (which is also the
// answer for an item of an owner the relay does not serve). The relay and this plugin ship separately, so a relay older
// than PREPARED_GET_SINCE_RELAY_VERSION has no such route and answers not_found ("No such route"); this tool then
// reads the relay's version from GET /v1/health and refuses with the version mismatch instead of "no such item".

export const GET_PREPARED_TOOL = "xo_get_prepared";
export const PREPARED_GET_ROUTE = "/v1/prepared/:id";

const CALL_CAP_MS = 3_500;

export function preparedPath(preparedId: string): `/v1/prepared/${string}` {
  return preparedItemPath(preparedId);
}

const getPreparedInput = z
  .object({
    prepared_id: preparedIdSchema.describe("The prepared_id of an item the relay already holds: from a prepare tool, or the one the Cockpit page shows for an item it asked the relay to prepare."),
  })
  .strict();
export type GetPreparedInput = z.infer<typeof getPreparedInput>;

// The Prepared schemas are large (the sign block, the decoded block). The item is validated on the way in against the
// relay contract; the published output schema keeps the item loose so that tools/list stays small.
const getPreparedOutputSchema = z
  .object({
    outcome: z.enum(["prepared", "dry_run", "refused"]),
    ...baseResultShape,
    ...preparedResultShape,
    ...readConventionShape,
    prepared: preparedOutputSchema.optional().describe("The relay's Prepared item (src/relay/contract.ts), its text cleaned, with the decoded block."),
  })
  .strict();

// The submit tool that takes this kind of item, and the switches it needs at this plugin.
const SUBMIT_FOR: Readonly<Record<PreparedKind, { readonly call: string; readonly flags: readonly WriteFlagName[] }>> = Object.freeze({
  userop: { call: "xo_submit_userop", flags: ["ENABLE_USEROP_SUBMIT"] },
  create: { call: "xo_submit_create_market", flags: ["XO_ENABLE_CREATE", "ENABLE_USEROP_SUBMIT"] },
  order: { call: "xo_submit_order", flags: ["ENABLE_TRADING"] },
  auth: { call: 'xo_connect with step "submit"', flags: ["ENABLE_TRADING"] },
  // The CLOB venues (src/tools/clob.ts): the venue's own flag is checked by the tool from the item's venue.
  clob_order: { call: 'clob_order with step "submit"', flags: ["ENABLE_CLOB_POLYMARKET", "ENABLE_CLOB_LIMITLESS"] },
  clob_auth: { call: 'clob_auth with step "submit"', flags: ["ENABLE_CLOB_POLYMARKET"] },
});

// "0.3.0" -> [0, 3, 0]; undefined for anything that is not three dot-separated numbers.
function versionParts(version: string): readonly [number, number, number] | undefined {
  const match = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+].*)?$/.exec(version);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function relayVersionPredatesPreparedGet(version: string): boolean | undefined {
  const have = versionParts(version);
  const need = versionParts(PREPARED_GET_SINCE_RELAY_VERSION);
  if (have === undefined || need === undefined) return undefined;
  for (let index = 0; index < 3; index += 1) {
    if (have[index] !== need[index]) return (have[index] as number) < (need[index] as number);
  }
  return false;
}

function versionMismatch(version: string): Refusal {
  return {
    code: "not_implemented",
    message: `The relay reports version ${version}, which predates GET /v1/prepared/{prepared_id} (relay ${PREPARED_GET_SINCE_RELAY_VERSION} or later), so it cannot return a prepared item by id. Nothing was read or changed.`,
    next: `Ask the operator to update the relay to ${PREPARED_GET_SINCE_RELAY_VERSION} or later. Until then, do not sign anything on the strength of this id: prepare the item again through the matching prepare tool, which returns the item itself.`,
    details: { relay_version: version, needs_relay_version: PREPARED_GET_SINCE_RELAY_VERSION },
  };
}

// The relay's answer for a stored item that cannot be handed out, worded for someone holding only its id.
function failureRefusal(failure: RelayFailure, scrub: Scrub): Refusal {
  const refusal = refusalFromFailure(failure, "read", scrub);
  const state = failure.details?.["state"];
  if (failure.code === "not_found") {
    return { ...refusal, next: "The relay holds no item under this id for an owner it serves (it may have expired and been removed, or never existed). Do not sign anything for this id; prepare the item again." };
  }
  if (failure.code === "prepared_used" && state === "ambiguous") {
    return { ...refusal, next: "A send for this item was started and its outcome is unknown. Do NOT sign or submit it again, and do not prepare an identical item to send: check the order with xo_order_status or the operation with xo_userop_status first." };
  }
  if (failure.code === "prepared_used") {
    return { ...refusal, next: "This item was already used (it is single use) and nothing for it can be signed now. Check the status of what it held; prepare a new item only if that is still wanted." };
  }
  return refusal;
}

export async function handleGetPrepared(input: GetPreparedInput, deps: RelayToolDeps = defaultRelayToolDeps()): Promise<CallToolResult> {
  const base: ToolContext = { tool: GET_PREPARED_TOOL, auditAction: "read" };
  try {
    const budget = new Budget(deps.nowMs);
    if (!budget.canStart(false)) {
      return refusalResult(deps, base, { code: "budget_exceeded", message: "Too little time was left in this call to start the relay request safely.", next: nextFor("budget_exceeded") });
    }
    const scrub = makeScrub(deps.config());
    const relay = deps.relay();
    let result: RelayResult<unknown>;
    try {
      result = await relay.get(preparedPath(input.prepared_id), { timeoutMs: budget.relayMs(Math.min(CALL_CAP_MS, RELAY_CLIENT_TIMEOUT_MS)) });
    } catch {
      return refusalResult(deps, base, { code: "internal", message: "The relay's answer could not be read, so it was not used.", next: "The relay did not answer. Nothing was changed. Try the read again." });
    }
    if (!result.ok) {
      // A relay without this route answers not_found ("No such route"), or not_implemented when its route table lacks
      // the handler. Its version, from GET /v1/health, tells that apart from an id it does not hold.
      if ((result.error.code === "not_found" || result.error.code === "not_implemented") && budget.canStart(false)) {
        try {
          const health = await relay.get("/v1/health", { timeoutMs: budget.relayMs(Math.min(CALL_CAP_MS, RELAY_CLIENT_TIMEOUT_MS)) });
          if (health.ok && relayVersionPredatesPreparedGet(health.data.version) === true) return refusalResult(deps, base, versionMismatch(cleanText(health.data.version, 32, scrub, true)));
        } catch {
          // No version to compare: the relay's own answer stands.
        }
      }
      return refusalResult(deps, base, failureRefusal(result.error, scrub));
    }
    const parsed = preparedItemSchema.safeParse(result.data);
    if (!parsed.success) {
      return refusalResult(deps, base, { code: "internal", message: "The relay's answer did not match the prepared-item contract, so it was not used.", next: nextFor("internal") });
    }
    const item = parsed.data as PreparedLike;
    if (item.prepared_id !== input.prepared_id) {
      return refusalResult(deps, base, { code: "internal", message: "The relay answered for a different prepared item than the one asked about, so the answer was not used.", next: nextFor("internal") });
    }
    // The owner is whatever the item says; the account must be the one derived from it, like everywhere else.
    const parsedIdentity = parseIdentity(item.owner);
    if (!parsedIdentity.ok) return refusalResult(deps, base, parsedIdentity.refusal);
    // A CLOB venue item's maker is the owner itself or (a Polymarket order) the owner's Deposit Wallet, re-derived from the
    // owner here; any other account is compared against the owner and refused (src/clob/decoded.ts rebuilds the rest).
    const identity =
      item.kind === "clob_order" || item.kind === "clob_auth"
        ? { ...parsedIdentity.value, account: (item.kind === "clob_order" ? clobAccountOf(parsedIdentity.value.owner as `0x${string}`, item.account) : null) ?? parsedIdentity.value.owner }
        : parsedIdentity.value;
    const ctx: ToolContext = { ...base, owner: identity.owner, account: identity.account };
    const vetted = vetPrepared(deps, identity, item, PREPARED_KINDS);
    if (!vetted.ok) return refusalResult(deps, ctx, vetted.refusal);

    const submit = SUBMIT_FOR[item.kind];
    let dryRun: string | undefined;
    for (const flag of submit.flags) {
      const gate = gateWrite(deps, flag);
      if (!gate.ok) {
        dryRun = gate.refusal.code === "kill_switch" ? "The kill switch is on at this plugin." : `${flag} is off in this plugin's environment.`;
        dryRun = `${dryRun} Nothing can be signed or submitted from here, so no signing intent is returned.`;
        break;
      }
    }
    return buildPreparedResult(deps, {
      ctx,
      identity,
      vetted: vetted.value,
      headline: `Stored ${item.kind} item ${item.prepared_id}, fetched from the relay by id. It may have been prepared by the Cockpit page rather than by this agent: what follows is what the relay holds, rebuilt and checked here. Nothing was changed or reserved by this call.`,
      submitCall: submit.call,
      dryRun,
      extra: readConventions(deps, "GET /v1/prepared/{prepared_id} (the relay)", {}),
      extraLines: [`Facts this step depends on are listed under unproven_capabilities ${FACT_IDS_NOTE}.`],
    });
  } catch {
    return internalFailure(deps, base);
  }
}

const GET_PREPARED_DESCRIPTION = [
  "Returns the prepared item the relay holds under a prepared_id: the signing intent, the summary lines, both tags (digest_tag and inner_hash_tag), the caps it reserves, its expiry and the decoded block (the operation's fields and calls, the order's 13 signed fields, or the login message's fields). Use it when something other than this agent asked the relay to prepare an item (the Cockpit page, for example) and you were handed only the id: fetch the record here instead of trusting the page's description of it.",
  "Read-only: it changes nothing and reserves nothing, and it works with the kill switch on. The plugin checks the owner, the derived account, the kind and the time left, then rebuilds the digest, the inner_hash_tag and every summary line from the decoded block and reports the result as verification. An item that fails that check is refused (prepared_mismatch); an item with no decoded block is passed on marked unverified. sign_with_paybox is returned only when the write path that would submit it is on at this plugin and the kill switch is off.",
  `To sign, pass sign_with_paybox UNCHANGED to PayBox request_wallet_sign and compare the tags; then submit with the tool named in next_action. The relay returns an item only while it can still be signed: an expired item is refused with expired, a used one (or one whose send has an unknown outcome) with prepared_used, and an id it does not hold for an owner it serves with not_found. Reads GET /v1/prepared/{prepared_id}, which needs relay ${PREPARED_GET_SINCE_RELAY_VERSION} or later; an older relay is refused with not_implemented naming its version.`,
  DECODED_NOTICE,
  SAFETY_NOTICES.advisoryCaps,
  SAFETY_NOTICES.untrustedText,
].join(" ");

// Registers only the tool definition: no network call, no environment read, no storage.
export function registerPreparedTools(server: McpServer, deps?: RelayToolDeps): void {
  server.registerTool(
    GET_PREPARED_TOOL,
    {
      title: "Get a prepared item by id",
      description: GET_PREPARED_DESCRIPTION,
      inputSchema: getPreparedInput,
      outputSchema: getPreparedOutputSchema,
      annotations: STATUS_ANNOTATIONS,
    },
    async (args) => handleGetPrepared(args, deps ?? defaultRelayToolDeps()),
  );
}
