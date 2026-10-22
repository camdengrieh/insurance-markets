// Working registry: the editable set of link records plus an append-only event log. Everything
// here is a pure function from one registry value to the next, so tests need no files. The only
// function that can create state "approved" lives in approve.ts; this module can add candidates
// and take links OUT of service (suspend, revoke, veto), never into it.

import * as z from "zod/v4";
import {
  LINK_SCHEMA_VERSION,
  candidateInputSchema,
  computeLinkId,
  dateOnly,
  handle,
  linkSchema,
  type CandidateInput,
  type Link,
  type PersistenceTerms,
  type ProposerSource,
} from "./schema.js";
import { candidateErrors, isAutomationHandle, linkErrors } from "./invariants.js";

export const REGISTRY_FORMAT = "pm-link-registry";
export const EVENT_ACTIONS = ["propose", "approve_partial", "approve", "reinstate", "suspend", "revoke", "veto"] as const;

export const eventSchema = z.strictObject({
  at: dateOnly,
  actor: handle,
  action: z.enum(EVENT_ACTIONS),
  linkId: z.string().regex(/^lnk_[0-9a-f]{32}$/),
  note: z.string().min(1).max(300).optional(),
});
export type RegistryEvent = z.infer<typeof eventSchema>;

export const registrySchema = z.strictObject({
  format: z.literal(REGISTRY_FORMAT),
  version: z.literal(1),
  links: z.array(linkSchema),
  events: z.array(eventSchema),
});
export type Registry = z.infer<typeof registrySchema>;

export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly errors: string[] };

export function emptyRegistry(): Registry {
  return { format: REGISTRY_FORMAT, version: 1, links: [], events: [] };
}

function zodErrors(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export function parseRegistry(input: unknown, terms: PersistenceTerms): Outcome<Registry> {
  const parsed = registrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const link of parsed.data.links) {
    if (seen.has(link.linkId)) errors.push(`duplicate link ${link.linkId}`);
    seen.add(link.linkId);
    for (const e of linkErrors(link, terms)) errors.push(`${link.linkId}: ${e}`);
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: parsed.data };
}

export function findLink(reg: Registry, linkId: string): Link | undefined {
  return reg.links.find((l) => l.linkId === linkId);
}

export function replaceLink(reg: Registry, next: Link, event: RegistryEvent): Registry {
  return {
    ...reg,
    links: reg.links.map((l) => (l.linkId === next.linkId ? next : l)),
    events: [...reg.events, event],
  };
}

// ---------------------------------------------------------------------------------------------
// Propose

export interface Proposer {
  readonly source: ProposerSource;
  readonly id: string;
}

// Evidence an LLM or a statistical screen is allowed to claim. They may not claim deterministic
// proof (native hook, equal slots, template) or human review: those are not theirs to assert.
const AUTOMATED_SOURCES: readonly ProposerSource[] = ["llm", "statistics"];
const AUTOMATED_EVIDENCE = new Set(["llm_quoted", "statistics_hint"]);

function marketSet(link: Pick<Link, "legs">): string {
  return link.legs.map((l) => `${l.venue}:${l.marketId}`).sort().join("|");
}

// Rules that keep the active set unambiguous: one active link per relation and market set, and at
// most one identity partner per liquidity pool per market (design G5). Shared by `propose` and the
// bundle validator.
export function pairConflicts(existing: readonly Link[], link: Link): string[] {
  const errors: string[] = [];
  const set = marketSet(link);
  for (const other of existing) {
    if (other.linkId === link.linkId) continue;
    if (other.state !== "candidate" && other.state !== "approved") continue;
    if (other.relation === link.relation && marketSet(other) === set) {
      errors.push(`conflicting ${other.state} link ${other.linkId} covers the same markets; suspend or revoke it first`);
    }
  }
  if (link.relation === "identity" || link.relation === "near_identity") {
    for (const other of existing) {
      if (other.linkId === link.linkId) continue;
      if ((other.state !== "candidate" && other.state !== "approved") || other.synthetic !== link.synthetic) continue;
      if (other.relation !== "identity" && other.relation !== "near_identity") continue;
      for (const a of link.legs) {
        for (const b of link.legs) {
          if (a === b || a.venue === b.venue) continue;
          const clash =
            other.legs.some((x) => x.venue === a.venue && x.marketId === a.marketId) &&
            other.legs.some((y) => y.venue === b.venue && y.marketId !== b.marketId);
          if (clash) errors.push(`${a.venue}:${a.marketId} already has an identity partner on ${b.venue} in ${other.linkId}`);
        }
      }
    }
  }
  return errors;
}

// Adds a candidate. Never approves: the new record is state "candidate", capped at indicative, with
// no reviewer, whatever the input says (unknown keys such as state or reviewer are refused).
export function proposeLink(
  reg: Registry,
  input: unknown,
  proposer: Proposer,
  ctx: { today: string },
  terms: PersistenceTerms,
): Outcome<{ registry: Registry; link: Link }> {
  const parsed = candidateInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const c: CandidateInput = parsed.data;

  const errors: string[] = [];
  if (!handle.safeParse(proposer.id).success) errors.push("proposer id must be a handle (2-40 chars of A-Za-z0-9._-)");
  if (!dateOnly.safeParse(ctx.today).success) errors.push("today must be YYYY-MM-DD");
  if (AUTOMATED_SOURCES.includes(proposer.source)) {
    for (const e of c.proof.evidence) {
      if (!AUTOMATED_EVIDENCE.has(e.method)) {
        errors.push(`${proposer.source} proposals may not claim ${e.method} evidence`);
      }
    }
  }
  errors.push(...candidateErrors(c, terms));
  if (errors.length > 0) return { ok: false, errors };

  const link: Link = {
    schemaVersion: LINK_SCHEMA_VERSION,
    linkId: computeLinkId(c),
    relation: c.relation,
    ...(c.ladder === undefined ? {} : { ladder: c.ladder }),
    ...(c.exhaustiveness === undefined ? {} : { exhaustiveness: c.exhaustiveness }),
    legs: c.legs,
    basis: c.basis,
    proof: c.proof,
    ...(c.templateId === undefined ? {} : { templateId: c.templateId }),
    state: "candidate",
    tierCap: "indicative_discrepancy",
    proposedBy: { source: proposer.source, id: proposer.id, at: ctx.today },
    approvals: [],
    validUntil: c.validUntil,
    synthetic: c.synthetic,
  };
  errors.push(...linkErrors(link, terms));

  if (findLink(reg, link.linkId) !== undefined) errors.push(`link ${link.linkId} already exists`);
  errors.push(...pairConflicts(reg.links, link));
  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const event: RegistryEvent = {
    at: ctx.today,
    actor: proposer.id,
    action: "propose",
    linkId: link.linkId,
    note: `source=${proposer.source}`,
  };
  return { ok: true, value: { registry: { ...reg, links: [...reg.links, link], events: [...reg.events, event] }, link } };
}

// ---------------------------------------------------------------------------------------------
// Taking links out of service

function out(link: Link, state: "suspended" | "revoked", by: string, today: string, reason: string): Link {
  return {
    ...link,
    state,
    tierCap: state === "revoked" ? "indicative_discrepancy" : link.tierCap,
    approvals: [],
    stateReason: reason,
    stateChangedBy: by,
    stateChangedAt: today,
  };
}

function checkOut(
  reg: Registry,
  linkId: string,
  by: string,
  reason: string,
  today: string,
): { link: Link } | { errors: string[] } {
  const errors: string[] = [];
  const link = findLink(reg, linkId);
  if (link === undefined) errors.push(`no link ${linkId}`);
  if (!handle.safeParse(by).success) errors.push("actor must be a handle");
  if (reason.trim() === "" || reason.length > 300) errors.push("reason must be 1-300 characters");
  if (!dateOnly.safeParse(today).success) errors.push("today must be YYYY-MM-DD");
  if (errors.length > 0 || link === undefined) return { errors };
  return { link };
}

// Anyone (human, LLM, statistics, the pin checker) may suspend an approved link. This is the safe
// direction: it can only reduce what the product shows.
export function suspendLink(reg: Registry, linkId: string, by: string, reason: string, ctx: { today: string }): Outcome<Registry> {
  const c = checkOut(reg, linkId, by, reason, ctx.today);
  if ("errors" in c) return { ok: false, errors: c.errors };
  if (c.link.state !== "approved") return { ok: false, errors: [`only approved links can be suspended (state is ${c.link.state})`] };
  const next = out(c.link, "suspended", by, ctx.today, reason);
  return { ok: true, value: replaceLink(reg, next, { at: ctx.today, actor: by, action: "suspend", linkId, note: reason }) };
}

// A veto from an LLM or statistical screen: a candidate is revoked, an approved link is suspended
// for human review. Vetoes never promote.
export function vetoLink(
  reg: Registry,
  linkId: string,
  by: { source: ProposerSource; id: string },
  reason: string,
  ctx: { today: string },
): Outcome<Registry> {
  const c = checkOut(reg, linkId, by.id, reason, ctx.today);
  if ("errors" in c) return { ok: false, errors: c.errors };
  const { link } = c;
  if (link.state === "revoked") return { ok: false, errors: ["link is already revoked"] };
  const next = out(link, link.state === "candidate" ? "revoked" : "suspended", by.id, ctx.today, `veto(${by.source}): ${reason}`.slice(0, 300));
  return { ok: true, value: replaceLink(reg, next, { at: ctx.today, actor: by.id, action: "veto", linkId, note: reason }) };
}

// Revocation is permanent and a human decision.
export function revokeLink(reg: Registry, linkId: string, by: string, reason: string, ctx: { today: string }): Outcome<Registry> {
  const c = checkOut(reg, linkId, by, reason, ctx.today);
  if ("errors" in c) return { ok: false, errors: c.errors };
  if (isAutomationHandle(by)) return { ok: false, errors: [`"${by}" looks like automation; revocation is a human decision`] };
  if (c.link.state === "revoked") return { ok: false, errors: ["link is already revoked"] };
  const next = out(c.link, "revoked", by, ctx.today, reason);
  return { ok: true, value: replaceLink(reg, next, { at: ctx.today, actor: by, action: "revoke", linkId, note: reason }) };
}
