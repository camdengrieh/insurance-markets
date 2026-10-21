// Hash-pinned link bundle: the file that ships (or is exported) from the working registry.
//
//   { format, formatVersion, manifest, manifestSha256, links[] }
//
// manifest.entries pins every link by its record hash, manifestSha256 pins the manifest, and the
// loader additionally requires an EXPECTED manifest hash supplied out of band (a constant in
// shipped code, or --pin on the CLI). Unknown fields and enum values are refused. Records hold ids,
// hashes and typed values only; no restricted-venue text can be in a valid bundle.

import * as z from "zod/v4";
import { canonicalPretty, canonicalSha256 } from "./canonical.js";
import { linkErrors } from "./invariants.js";
import { MASK_RECIPE, RULES_HASH_RECIPE } from "./hash.js";
import { LINK_STATES, linkSchema, recordSha256, utcStamp, type Link } from "./schema.js";
import { pairConflicts, type Outcome, type Registry } from "./store.js";

export const BUNDLE_FORMAT = "pm-link-bundle";
export const BUNDLE_FORMAT_VERSION = 1;
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const manifestSchema = z.strictObject({
  createdAt: utcStamp,
  recipes: z.strictObject({
    rulesHash: z.literal(RULES_HASH_RECIPE),
    maskedHash: z.literal(MASK_RECIPE),
  }),
  entityTableSha256: hex64.nullable(),
  restrictedData: z.literal("ids-and-hashes-only"),
  synthetic: z.boolean(),
  counts: z.strictObject({
    approved: z.int().min(0),
    candidate: z.int().min(0),
    suspended: z.int().min(0),
    revoked: z.int().min(0),
  }),
  entries: z.array(
    z.strictObject({
      linkId: z.string().regex(/^lnk_[0-9a-f]{32}$/),
      recordSha256: hex64,
      state: z.enum(LINK_STATES),
    }),
  ),
});
export type Manifest = z.infer<typeof manifestSchema>;

export const bundleSchema = z.strictObject({
  format: z.literal(BUNDLE_FORMAT),
  formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
  manifest: manifestSchema,
  manifestSha256: hex64,
  links: z.array(linkSchema),
});
export type Bundle = z.infer<typeof bundleSchema>;

export interface BuildOptions {
  readonly createdAt: string;
  readonly includeCandidates?: boolean;
  readonly entityTableSha256?: string | null;
}

function zodErrors(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export interface LoadOptions {
  // Manifest hash obtained out of band. Required unless `unpinned` is set.
  readonly expectedManifestSha256?: string;
  readonly unpinned?: boolean;
  // Synthetic fixtures are refused unless a test opts in.
  readonly allowSynthetic?: boolean;
}

export function validateBundle(input: string | unknown, options: LoadOptions = {}): Outcome<Bundle> {
  let raw: unknown = input;
  if (typeof input === "string") {
    if (Buffer.byteLength(input, "utf8") > MAX_BUNDLE_BYTES) return { ok: false, errors: ["bundle is too large"] };
    try {
      raw = JSON.parse(input) as unknown;
    } catch {
      return { ok: false, errors: ["bundle is not valid JSON"] };
    }
  }
  const parsed = bundleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: zodErrors(parsed.error) };
  const bundle = parsed.data;
  const errors: string[] = [];

  if (canonicalSha256(bundle.manifest) !== bundle.manifestSha256) errors.push("manifestSha256 does not match the manifest");
  if (options.expectedManifestSha256 !== undefined) {
    if (bundle.manifestSha256 !== options.expectedManifestSha256) {
      errors.push("manifest hash does not match the pinned hash");
    }
  } else if (options.unpinned !== true) {
    errors.push("no pinned manifest hash supplied");
  }

  const { links, manifest } = bundle;
  if (manifest.entries.length !== links.length) errors.push("manifest entries do not cover the links one for one");
  const counts = { approved: 0, candidate: 0, suspended: 0, revoked: 0 };
  const seen = new Set<string>();
  let previous = "";
  const accepted: Link[] = [];
  links.forEach((link, i) => {
    if (link.linkId <= previous) errors.push(`links[${i}] is not in strictly ascending linkId order`);
    previous = link.linkId;
    if (seen.has(link.linkId)) errors.push(`duplicate link ${link.linkId}`);
    seen.add(link.linkId);
    counts[link.state] += 1;
    const entry = manifest.entries[i];
    if (entry === undefined || entry.linkId !== link.linkId || entry.state !== link.state) {
      errors.push(`manifest entry ${i} does not match ${link.linkId}`);
    } else if (entry.recordSha256 !== recordSha256(link)) {
      errors.push(`record hash mismatch for ${link.linkId}`);
    }
    for (const e of linkErrors(link)) errors.push(`${link.linkId}: ${e}`);
    // Only a live record can conflict: a suspended or revoked link on the same markets is exactly
    // what a re-proposal after a veto leaves behind, and the store already allows that.
    if (link.state === "candidate" || link.state === "approved") for (const e of pairConflicts(accepted, link)) errors.push(`${link.linkId}: ${e}`);
    accepted.push(link);
  });
  for (const state of LINK_STATES) {
    if (manifest.counts[state] !== counts[state]) errors.push(`manifest count for ${state} is wrong`);
  }
  const anySynthetic = links.some((l) => l.synthetic);
  if (links.some((l) => l.synthetic !== anySynthetic)) errors.push("bundle mixes synthetic and real links");
  if (manifest.synthetic !== anySynthetic) errors.push("manifest.synthetic does not match the links");
  if (anySynthetic && options.allowSynthetic !== true) errors.push("synthetic fixtures are not allowed in this bundle");

  return errors.length > 0 ? { ok: false, errors: [...new Set(errors)] } : { ok: true, value: bundle };
}

// Builds a bundle from the working registry. Approved links are always included, suspended and
// revoked ones too (so a stale copy can be told to stand down); candidates only on request.
export function buildBundle(reg: Registry, options: BuildOptions): Outcome<Bundle> {
  const links = reg.links
    .filter((l) => options.includeCandidates === true || l.state !== "candidate")
    .sort((a, b) => (a.linkId < b.linkId ? -1 : a.linkId > b.linkId ? 1 : 0));
  const counts = { approved: 0, candidate: 0, suspended: 0, revoked: 0 };
  for (const l of links) counts[l.state] += 1;
  const manifest: Manifest = {
    createdAt: options.createdAt,
    recipes: { rulesHash: RULES_HASH_RECIPE, maskedHash: MASK_RECIPE },
    entityTableSha256: options.entityTableSha256 ?? null,
    restrictedData: "ids-and-hashes-only",
    synthetic: links.some((l) => l.synthetic),
    counts,
    entries: links.map((l) => ({ linkId: l.linkId, recordSha256: recordSha256(l), state: l.state })),
  };
  const bundle: Bundle = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    manifest,
    manifestSha256: canonicalSha256(manifest),
    links,
  };
  const checked = validateBundle(bundle, { expectedManifestSha256: bundle.manifestSha256, allowSynthetic: manifest.synthetic });
  return checked.ok ? { ok: true, value: bundle } : checked;
}

export function serializeBundle(bundle: Bundle): string {
  return `${canonicalPretty(bundle)}\n`;
}
