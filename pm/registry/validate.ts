// CI-style invariants for registry records (docs/platform-registry-design.md 3.12). Returns a list
// of human-readable problems; an empty list means the records are well formed. This checks shape
// and honesty rules, not facts: it cannot tell whether a recorded fact is true.

import { FEE_MODEL_BY_VENUE, REGISTRY_VENUE_IDS, feeSpecId, isFeeSpecId } from "./ids.js";
import { derivePools } from "./pools.js";
import { SECTION_KEYS, SECTION_POLICY, parseIsoDate, type Section } from "./staleness.js";
import type { PlatformRecord } from "./types.js";

const MAX_STRING = 200;
const CHAIN_RE = /^([a-z0-9-]{3,32}:[A-Za-z0-9_-]{1,64}|offchain|unknown)$/;
const REGION_RE = /^[A-Z]{2}(-[A-Z0-9]{1,3})?$/;
const SOURCE_RE = /^docs\/[A-Za-z0-9_./-]+(#[A-Za-z0-9._-]+)?$/;
const FORBIDDEN_STRING = [/\/Users\//, /\/home\//, /\/private\//, /@/, /\\/];
const FIRST_HAND = ["primary_doc", "live_api", "onchain_read"];

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
  }
}

export function validateRegistry(records: readonly PlatformRecord[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const rec of records) {
    const at = rec.id;
    if (seen.has(rec.id)) problems.push(`${at}: duplicate id`);
    seen.add(rec.id);
    if (!(REGISTRY_VENUE_IDS as readonly string[]).includes(rec.id)) problems.push(`${at}: unknown id`);

    for (const key of SECTION_KEYS) {
      const section = rec[key] as Section<unknown> | undefined;
      if (section === undefined) {
        problems.push(`${at}.${key}: missing section`);
        continue;
      }
      const m = section.meta;
      const policy = SECTION_POLICY[key];
      if (parseIsoDate(m.lastVerified) === null) problems.push(`${at}.${key}: bad lastVerified`);
      if (!Number.isInteger(m.ttlDays) || m.ttlDays <= 0) problems.push(`${at}.${key}: bad ttlDays`);
      else if (m.ttlDays > policy.ttlDays) {
        problems.push(`${at}.${key}: ttlDays ${m.ttlDays} exceeds the ${policy.ttlDays} day default`);
      }
      if (m.sources.length === 0) problems.push(`${at}.${key}: no sources`);
      for (const src of m.sources) {
        if (!SOURCE_RE.test(src)) problems.push(`${at}.${key}: source is not a repo-relative docs path: ${src}`);
      }
      if (m.verifiedBy.trim() === "") problems.push(`${at}.${key}: empty verifiedBy`);
      if (m.verification === "verified") {
        if (m.confidence !== "H") problems.push(`${at}.${key}: verified requires confidence H`);
        if (!FIRST_HAND.includes(m.method)) problems.push(`${at}.${key}: verified requires a first-hand method`);
      }
      if (m.confidence === "H" && m.verification !== "verified" && FIRST_HAND.includes(m.method)) {
        problems.push(`${at}.${key}: H from a first-hand method must be labelled verified`);
      }
      if (m.method === "vendor_claim" && m.confidence === "H") {
        problems.push(`${at}.${key}: a vendor claim cannot be confidence H`);
      }
      for (const [path, text] of strings(section.value, `${at}.${key}`)) {
        if (text.length > MAX_STRING) problems.push(`${path}: string longer than ${MAX_STRING} characters`);
        for (const re of FORBIDDEN_STRING) {
          if (re.test(text)) problems.push(`${path}: contains a forbidden pattern ${re}`);
        }
      }
    }

    // Identity
    for (const url of rec.identity.value.urls.apiBase) {
      if (!url.startsWith("https://")) problems.push(`${at}.identity: apiBase must be https: ${url}`);
      if (url.includes("?") || url.includes("#")) problems.push(`${at}.identity: apiBase must not carry a query`);
    }
    const docs = rec.identity.value.urls.docs;
    if (docs !== null && !docs.startsWith("https://")) problems.push(`${at}.identity: docs must be https`);

    // Collateral
    if (!CHAIN_RE.test(rec.collateral.value.chain)) problems.push(`${at}.collateral: bad chain id`);
    const dec = rec.collateral.value.decimals;
    if (dec !== null && (!Number.isInteger(dec) || dec < 0 || dec > 36)) problems.push(`${at}.collateral: bad decimals`);

    // Fees
    const f = rec.fees.value;
    if (f.feeSpecId !== feeSpecId(rec.id, f.modelId)) problems.push(`${at}.fees: feeSpecId does not match the model`);
    if (!isFeeSpecId(f.feeSpecId)) problems.push(`${at}.fees: malformed feeSpecId`);
    if (FEE_MODEL_BY_VENUE[rec.id] !== f.modelId) problems.push(`${at}.fees: model differs from ids.ts`);
    if (f.modelId === "unknown") {
      if (f.status !== "unknown" || f.useRule !== "fail_closed") {
        problems.push(`${at}.fees: an unknown model must be status unknown and fail closed`);
      }
    } else {
      if (f.formula === null) problems.push(`${at}.fees: a known model needs a formula`);
      if (f.status === "unknown") problems.push(`${at}.fees: a known model cannot have status unknown`);
    }
    if ((f.status === "verified" || f.status === "conflicted") && f.paramsSource === null) {
      problems.push(`${at}.fees: ${f.status} needs a params source`);
    }
    if (f.status === "conflicted" && (f.secondarySource === null || f.useRule === "read_live" || f.useRule === "fail_closed")) {
      problems.push(`${at}.fees: conflicted needs a secondary source and a reconciliation use rule`);
    }
    if (f.status === "docs_only" && f.useRule !== "fail_closed") {
      problems.push(`${at}.fees: docs_only cannot be used for pricing; use rule must be fail_closed`);
    }
    for (const [name, value] of Object.entries(f.indicative)) {
      if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) problems.push(`${at}.fees.indicative.${name}: not a plain decimal`);
    }

    // Geo
    const regions = rec.geo.value.restrictedRegions;
    if (regions !== null) {
      for (const r of regions) if (!REGION_RE.test(r)) problems.push(`${at}.geo: bad region code ${r}`);
    }

    // Reachability
    const r = rec.reachability.value;
    if (r.proof !== "none" && r.class === "unknown") problems.push(`${at}.reachability: proof needs a class`);
    for (const step of r.humanOnboardingSteps) {
      if (step.length > MAX_STRING) problems.push(`${at}.reachability: step too long`);
    }

    // Data terms
    const t = rec.dataTerms.value;
    if (t.clause.trim() === "") problems.push(`${at}.dataTerms: empty clause`);
    if (t.restricted === "restricted" && !/memory-only/.test(t.clause)) {
      problems.push(`${at}.dataTerms: a restricted clause must state the memory-only rule`);
    }

    // Adapter mapping
    if (rec.adapterVenueId !== null && rec.adapterVenueId !== rec.id) {
      problems.push(`${at}: adapterVenueId ${rec.adapterVenueId} differs from the registry id`);
    }
  }

  // Referential integrity and pool rules (cross-record).
  for (const id of REGISTRY_VENUE_IDS) {
    if (!seen.has(id)) problems.push(`${id}: no record for a registry venue id`);
  }
  const pools = derivePools(records.map((rec) => ({ id: rec.id, liquidityLinks: rec.links.value.liquidityLinks })));
  for (const d of pools.dangling) problems.push(`links: dangling target ${d}`);
  const byId = new Map(records.map((rec) => [rec.id, rec] as const));
  for (const rec of records) {
    for (const link of rec.links.value.liquidityLinks) {
      if (link.target === rec.id) problems.push(`${rec.id}.links: link to itself`);
      if (link.relation === "routes_to") {
        const target = byId.get(link.target);
        const onward = target?.links.value.liquidityLinks.some((l) => l.relation === "routes_to") ?? false;
        if (onward) problems.push(`${rec.id}.links: routes_to target ${link.target} is not a pool representative`);
      }
    }
  }
  return problems;
}
