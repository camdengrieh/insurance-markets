// The one rules-hash recipe for the venue readers (docs/market-linking-design.md section 5, finding A2).
//
//   sha256( join( normalise(field) for each rule-bearing field, U+241F ) )
//   normalise = strip tags to spaces, NFKC, whitespace runs to one space, trim
//
// It is taken over the FULL text of each field, never the capped display copy, so a change after the display cut
// (3000 characters for rules) or in a source field still changes the hash. Each field is cleaned on its own before
// the join, so markup or spacing next to the separator cannot change the hash, and a field that contains U+241F
// cannot move text into the next one. A missing field is the empty string: silence is a value. A reader whose
// fields are all empty has no rules text to fingerprint and gets "" (the port's "no hash").

import { sha256, toBytes } from "viem";

const UNIT_SEPARATOR = "␟";
// Runs of combining marks are cut to four first: canonical reordering is quadratic in them.
const MARK_RUN = /(\p{M}{4})\p{M}+/gu;

export function normalizeRuleField(raw: string): string {
  return raw
    .replace(MARK_RUN, "$1")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFKC")
    .replaceAll(UNIT_SEPARATOR, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function rulesHashOf(fields: readonly (string | null | undefined)[]): string {
  const cleaned = fields.map((field) => normalizeRuleField(typeof field === "string" ? field : ""));
  if (cleaned.every((field) => field === "")) return "";
  return sha256(toBytes(cleaned.join(UNIT_SEPARATOR))).slice(2);
}
