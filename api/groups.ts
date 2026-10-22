import { readFileSync, statSync } from "node:fs";

import { validateBundle, type Bundle } from "../sdk/links/bundle.js";
import type { DatasetLink } from "../sdk/links/dataset.js";
import type { Link } from "../sdk/links/schema.js";
import { toLinkDataset } from "../sdk/linker/dataset.js";
import { termsAllowPersistence } from "../sdk/venues/licence.js";
import type { ServingPolicy } from "./serving.js";

// GET /v1/groups (docs/sdk-and-api-design.md sections 4 and 5): approved links, and the linker's candidates, which are
// ALWAYS served as "proposed" with their score band.
//
// Both come from hash-pinned link bundles (sdk/links/bundle.ts) named in the configuration: the shipped approved bundle and
// the linker's candidates bundle, each with the pin of its manifest in a separate file. A bundle is checked exactly as pm
// writes it (record hashes, manifest, invariants, under the registry's persistence terms) or not used at all.
//
// What is served:
//   - a link is "approved" only when its record says a person approved it (state "approved" with at least one recorded
//     approval, which only sdk/links/approve.ts can write, from the pm CLI); everything else from either bundle that is
//     live is a candidate and is served as "proposed";
//   - a link with any leg on a venue the serving policy does not serve is withheld entirely and only counted;
//   - each link is converted by the dApp's dataset contract (sdk/linker/dataset.ts): ids, hashes, close times, outcome maps,
//     proof, state and band; never a title, a price or rules text.
// The files are re-read when they change on disk (checked at most once every RELOAD_CHECK_MS).

export const RELOAD_CHECK_MS = 30_000;

export type BundleLoad =
  | { readonly state: "absent" }
  | { readonly state: "loaded"; readonly bundle: Bundle; readonly manifestSha256: string; readonly createdAt: string }
  | { readonly state: "rejected"; readonly reason: string };

export interface BundleSource {
  readonly bundle: string;
  readonly pin: string;
}

export interface GroupsAnswer {
  readonly approved: readonly DatasetLink[];
  readonly proposed: readonly DatasetLink[];
  readonly withheld: { readonly count: number; readonly reason: string };
  readonly sources: { readonly approved: SourceView; readonly candidates: SourceView };
}

export interface SourceView {
  readonly state: "absent" | "loaded" | "rejected";
  readonly reason?: string;
  readonly createdAt?: string;
  readonly manifestSha256?: string;
}

const PIN = /^[0-9a-f]{64}$/;

export function loadBundle(source: BundleSource | null): BundleLoad {
  if (source === null) return { state: "absent" };
  let text: string;
  let pin: string;
  try {
    text = readFileSync(source.bundle, "utf8");
    pin = readFileSync(source.pin, "utf8").trim();
  } catch {
    return { state: "rejected", reason: "the bundle or its pin could not be read" };
  }
  if (!PIN.test(pin)) return { state: "rejected", reason: "the pin file does not hold one sha256" };
  const checked = validateBundle(text, { expectedManifestSha256: pin }, termsAllowPersistence);
  if (!checked.ok) return { state: "rejected", reason: "the bundle did not validate against its pin and the link schema" };
  return { state: "loaded", bundle: checked.value, manifestSha256: checked.value.manifestSha256, createdAt: checked.value.manifest.createdAt };
}

function view(load: BundleLoad): SourceView {
  if (load.state === "loaded") return { state: "loaded", createdAt: load.createdAt, manifestSha256: load.manifestSha256 };
  if (load.state === "rejected") return { state: "rejected", reason: load.reason };
  return { state: "absent" };
}

// A person approved it: the approval module is the only writer of state "approved", and it records each approval.
export function approvedByAPerson(link: Link): boolean {
  return link.state === "approved" && link.approvals.length > 0 && link.approvals.every((a) => a.reviewer.trim() !== "" && a.evidence.length > 0);
}

export function buildGroups(approved: BundleLoad, candidates: BundleLoad, policy: ServingPolicy, nowMs: number): GroupsAnswer {
  const served = (venue: string): boolean => policy.servability(venue).served;
  const approvedLinks = new Map<string, Link>();
  const candidateLinks = new Map<string, Link>();
  let withheld = 0;
  for (const load of [approved, candidates]) {
    if (load.state !== "loaded") continue;
    for (const link of load.bundle.links) {
      if (link.synthetic) continue;
      if (link.state !== "approved" && link.state !== "candidate") continue;
      if (approvedByAPerson(link)) {
        approvedLinks.set(link.linkId, link);
        candidateLinks.delete(link.linkId);
      } else if (!approvedLinks.has(link.linkId)) {
        // An "approved" record without a recorded approval is not served as approved: it is a proposal at most.
        candidateLinks.set(link.linkId, { ...link, state: "candidate" });
      }
    }
  }
  const convert = (links: readonly Link[]): DatasetLink[] => {
    if (links.length === 0) return [];
    // toLinkDataset reads only the bundle's links (already validated above) and leaves out, as "restricted_leg", any link
    // with a leg the given terms refuse: here, any venue the API does not serve. Its release date is not served.
    const bundle = { links } as unknown as Bundle;
    const { dataset, skipped } = toLinkDataset(bundle, { release: new Date(nowMs).toISOString().slice(0, 10) }, served);
    withheld += skipped.length;
    return [...dataset.links];
  };
  const approvedOut = convert([...approvedLinks.values()].sort((a, b) => (a.linkId < b.linkId ? -1 : 1)));
  const proposedOut = convert([...candidateLinks.values()].sort((a, b) => (a.linkId < b.linkId ? -1 : 1))).map((link) => ({ ...link, state: "proposed" as const }));
  return {
    approved: approvedOut,
    proposed: proposedOut,
    withheld: { count: withheld, reason: "Links with a leg on a venue the API does not serve (sdk/venues/licence.ts) are left out, as are links the dataset contract refuses." },
    sources: { approved: view(approved), candidates: view(candidates) },
  };
}

// Keeps both bundles loaded, re-reading a file when its size or modification time changes.
export class GroupsSource {
  readonly #approved: BundleSource | null;
  readonly #candidates: BundleSource | null;
  readonly #nowMs: () => number;
  #checkedMs = Number.NEGATIVE_INFINITY;
  #stamp = "";
  #loads: [BundleLoad, BundleLoad] = [{ state: "absent" }, { state: "absent" }];

  constructor(approved: BundleSource | null, candidates: BundleSource | null, nowMs: () => number) {
    this.#approved = approved;
    this.#candidates = candidates;
    this.#nowMs = nowMs;
  }

  #stampOf(): string {
    const parts: string[] = [];
    for (const source of [this.#approved, this.#candidates]) {
      if (source === null) {
        parts.push("-");
        continue;
      }
      for (const path of [source.bundle, source.pin]) {
        try {
          const s = statSync(path);
          parts.push(`${s.size}:${s.mtimeMs}`);
        } catch {
          parts.push("missing");
        }
      }
    }
    return parts.join("|");
  }

  current(): readonly [BundleLoad, BundleLoad] {
    const now = this.#nowMs();
    if (now - this.#checkedMs >= RELOAD_CHECK_MS) {
      this.#checkedMs = now;
      const stamp = this.#stampOf();
      if (stamp !== this.#stamp) {
        this.#stamp = stamp;
        this.#loads = [loadBundle(this.#approved), loadBundle(this.#candidates)];
      }
    }
    return this.#loads;
  }
}
