import type { CallToolResult, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";

import {
  POST_ROUTES,
  PREPARED_KINDS,
  RELAY_CLIENT_TIMEOUT_MS,
  SAFETY_NOTICES,
  preparedIdSchema,
  type GetPath,
  type PreparedKind,
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
// The relay route this calls, GET /v1/prepared/{prepared_id}, is NOT in the relay contract yet (it belongs to
// src/relay/contract.ts and relay/, which this stream does not own). Until the relay owner adds it, a real relay
// answers not_implemented (or the client refuses the unknown path), and this tool says so instead of guessing.
// The answer it expects is exactly the item a prepare route returns: the strict Prepared object of its kind.

export const GET_PREPARED_TOOL = "xo_get_prepared";
export const PREPARED_GET_ROUTE = "/v1/prepared/:id";

const CALL_CAP_MS = 3_500;

export function preparedPath(preparedId: string): string {
  return `/v1/prepared/${preparedIdSchema.parse(preparedId)}`;
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
});

function schemaFor(item: unknown) {
  if (typeof item === "object" && item !== null) {
    if ("quote" in item) return POST_ROUTES["/v1/order/prepare"].response;
    if ("user_op_hash" in item) return POST_ROUTES["/v1/userop/prepare"].response;
  }
  return POST_ROUTES["/v1/auth/prepare"].response;
}

function notImplemented(): Refusal {
  return {
    code: "not_implemented",
    message: "This relay cannot return a prepared item by id (GET /v1/prepared/{prepared_id} is not part of its contract yet).",
    next: `${nextFor("not_implemented")} Ask the operator to update the relay, or prepare the item through the matching prepare tool instead.`,
  };
}

export async function handleGetPrepared(input: GetPreparedInput, deps: RelayToolDeps = defaultRelayToolDeps()): Promise<CallToolResult> {
  const base: ToolContext = { tool: GET_PREPARED_TOOL, auditAction: "read" };
  try {
    const budget = new Budget(deps.nowMs);
    if (!budget.canStart(false)) {
      return refusalResult(deps, base, { code: "budget_exceeded", message: "Too little time was left in this call to start the relay request safely.", next: nextFor("budget_exceeded") });
    }
    const scrub = makeScrub(deps.config());
    let result: RelayResult<unknown>;
    try {
      // Not a path of the relay contract yet (see the note at the top), so it is typed through GetPath on purpose; the
      // real client refuses an unknown path before sending anything, which is mapped to not_implemented below.
      result = (await deps.relay().get(preparedPath(input.prepared_id) as GetPath, { timeoutMs: budget.relayMs(Math.min(CALL_CAP_MS, RELAY_CLIENT_TIMEOUT_MS)) })) as RelayResult<unknown>;
    } catch {
      return refusalResult(deps, base, { code: "internal", message: "The relay's answer could not be read, so it was not used.", next: "The relay did not answer. Nothing was changed. Try the read again." });
    }
    if (!result.ok) {
      const fields = result.error.details?.["fields"];
      const refusedPath = result.error.code === "invalid_request" && Array.isArray(fields) && fields.includes("(path)");
      return refusalResult(deps, base, refusedPath ? notImplemented() : refusalFromFailure(result.error, "read", scrub));
    }
    const parsed = schemaFor(result.data).safeParse(result.data);
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
    const identity = parsedIdentity.value;
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
  "To sign, pass sign_with_paybox UNCHANGED to PayBox request_wallet_sign and compare the tags; then submit with the tool named in next_action. Needs a relay that supports GET /v1/prepared/{prepared_id}; an older relay answers not_implemented.",
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
