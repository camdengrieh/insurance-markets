// Canonical hash of a market's rules text, the value links pin and the runtime verifier compares
// (docs/aggregation-design.md 2.1 Rules.sha256, 4.3 L4): sha256 over the NFKC-normalised text
// with every run of whitespace collapsed to one space and the ends trimmed, as lowercase hex.
// Nothing else is stripped, so any visible or invisible edit to the rules changes the hash.

import { createHash } from "node:crypto";

export function normaliseRulesText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function rulesSha256(text: string): string {
  return createHash("sha256").update(normaliseRulesText(text), "utf8").digest("hex");
}
