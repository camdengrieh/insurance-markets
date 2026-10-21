// Quotient agreement for the stdout report ONLY. The linker never fetches or pays for Quotient:
// when PM_QUOTIENT=1 the operator may hand it a body the agent already paid for (a file path),
// which is parsed in memory by pm/signals/parse.ts and compared per candidate. The result is a
// list of lines for the terminal. It is never part of the bundle, the state file or any file.

import { ratFromDec, cmp, sub, absR, ratToDec } from "../core/rational.js";
import { flagOff, quotientEnabled, type EnvLike } from "../signals/flag.js";
import { parseSignalBody, type ParseKind, type QuotientRow } from "../signals/parse.js";

export const AGREEMENT_TOLERANCE = "0.05";

export interface QuotientInput {
  readonly env: EnvLike;
  readonly bodyText: string | null;
  readonly kind: ParseKind;
  readonly candidates: readonly { readonly linkId: string; readonly legs: readonly { readonly venue: string; readonly marketId: string }[] }[];
  readonly nowMs: number;
}

function keysOf(row: QuotientRow): string[] {
  const keys = [`${row.venue}:${row.marketId.toLowerCase()}`];
  if (row.conditionId !== null) keys.push(`${row.venue}:${row.conditionId.toLowerCase()}`);
  return keys;
}

export function quotientLines(input: QuotientInput): string[] {
  if (!quotientEnabled(input.env)) {
    const off = flagOff();
    return ["quotient: off (PM_QUOTIENT is not set); no agreement was computed", `  clause: ${off.clause}`];
  }
  if (input.bodyText === null) {
    return ["quotient: on, but no --quotient-body file was given; nothing was read. The linker never fetches or pays for Quotient."];
  }
  const parsed = parseSignalBody({ enabled: true }, input.kind, input.bodyText, { nowMs: input.nowMs });
  if (!parsed.ok) return [`quotient: on; the body could not be parsed (${parsed.error}); no agreement was computed`];
  const q = new Map<string, string>();
  for (const row of parsed.rows) for (const k of keysOf(row)) if (!q.has(k)) q.set(k, row.qYes);
  const lines = [`quotient: on; ${parsed.rows.length} rows parsed in memory (${parsed.rejected.length} rejected); memory-only, printed here and written nowhere`];
  const tol = ratFromDec(AGREEMENT_TOLERANCE);
  if (!tol.ok) return lines;
  for (const c of input.candidates) {
    const legs = c.legs.map((l) => ({ leg: `${l.venue}:${l.marketId}`, q: q.get(`${l.venue}:${l.marketId.toLowerCase()}`) ?? null }));
    const withQ = legs.filter((l): l is { leg: string; q: string } => l.q !== null);
    if (withQ.length === 0) {
      lines.push(`  ${c.linkId}: no Quotient row for any leg`);
      continue;
    }
    if (withQ.length === 1) {
      lines.push(`  ${c.linkId}: one leg has a Quotient row (q=${withQ[0]?.q ?? ""}); no cross-leg agreement`);
      continue;
    }
    const a = ratFromDec(withQ[0]?.q ?? "");
    const b = ratFromDec(withQ[1]?.q ?? "");
    if (!a.ok || !b.ok) {
      lines.push(`  ${c.linkId}: Quotient rows present but not comparable`);
      continue;
    }
    const diff = absR(sub(a.value, b.value));
    const verdict = cmp(diff, tol.value) <= 0 ? "agree" : "disagree";
    lines.push(`  ${c.linkId}: Quotient ${verdict} (|q-q'|=${ratToDec(diff, 4, "half_up")} against ${AGREEMENT_TOLERANCE}); a prior, not a price`);
  }
  return lines;
}
