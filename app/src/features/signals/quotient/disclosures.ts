import { formatAge, formatUtc } from "../../../core/format";
import type { Untrusted } from "../../../core/ports";
import { QUOTIENT_ATTRIBUTION } from "./constants";
import { allPass, type Gate } from "./orientation";
import type { QuotientRow } from "@sdk/signals/quotient";
import { ROUTES, type RouteId } from "./routes";

// Everything that must sit next to a Quotient number (research 12 section 10.9, 26 8.6, dapp-design 4.7; M3-7).
// disclosuresFor() returns every item for a row, always, so a screen cannot render a Q number and forget one: the
// record has no optional key, and a test fails if any value is empty. Fixed text only; the sole upstream string
// is the quality "basis", and it travels as an Untrusted<string> in its own slot.

// ---- the licence clause, shown FIRST before Quotient is switched on (R8) -------------------------------------------------

export const LICENCE_CLAUSE_TITLE = "Quotient's terms limit what you may do with its output";
export const LICENCE_CLAUSE_QUOTES: readonly string[] = Object.freeze([
  "a limited, revocable, nonexclusive, nontransferable right to use the Services for your personal or internal business purposes",
  "You may not share or resell access",
  "copy, republish, redistribute, sublicense, or sell the Services or their outputs except as expressly permitted",
  "use the Services to build a competing data or signals product",
]);
export const LICENCE_CLAUSE_SOURCE = "quotient.social/terms, last updated 2026-08-07, as read by this project's research on 2026-10-18";
export const LICENCE_CLAUSE_BODY =
  "Quotient is OFF until you switch it on. When it is on, every request goes from your machine with your own key (or your own agent's payment), the answer is shown only to you, is kept only in this tab's memory, and is never written to disk, a URL or an export. There is no export, share link or screenshot helper for Quotient output. This is the project's reading of the terms, not legal advice, and no licence from Quotient exists. If you want more than own use, ask Quotient.";

// ---- the spread vocabulary (M3-10) ---------------------------------------------------------------------------------------

export const SPREAD_LABELS = ["indicative", "model_edge", "structural_violation", "hedged_discrepancy"] as const;
export type SpreadLabel = (typeof SPREAD_LABELS)[number];

// Nothing above `hedged_discrepancy` while the global arbitrage criterion (aggregation-design D2) is unmet: any
// label that is not on the list, `executable_arbitrage` included, comes back as `indicative`.
export function capSpreadLabel(label: unknown): SpreadLabel {
  return typeof label === "string" && (SPREAD_LABELS as readonly string[]).includes(label) ? (label as SpreadLabel) : "indicative";
}

// A Q-versus-quote gap is a model view against one quote. It is never more than a `model_edge`, and only while
// every gate passes; otherwise it is `indicative`.
export function labelFor(gates: readonly Gate[]): SpreadLabel {
  return allPass(gates) ? "model_edge" : "indicative";
}

export const WHY_NOT_ARBITRAGE =
  "Why this is not arbitrage: the gap is between a model's estimate and one selected quote at one moment. It is not two executable prices, it ignores fees, slippage and thin books, a market can resolve unexpectedly or be disputed, and a same-outcome link can still have different rules.";

// ---- track record ---------------------------------------------------------------------------------------------------------

export const TRACK_RECORD_CAVEATS: readonly string[] = Object.freeze([
  "Quotient's performance figures are hypothetical paper results. They exclude fees, spread crossing and slippage, and the signals record mixes historical replays with live signals.",
  "As read by this project's research on 2026-10-18, over its full history Quotient's own free snapshot showed Q about equal to the market overall and slightly behind it on geopolitics; the favourable window is the last 60 days.",
  "The measured edge is small (a Brier advantage of about 0.003) and was not distinguishable from zero once forecasts made on the scheduled end date were excluded. Sports rows are experimental with no established edge.",
  "Show the all-time figure beside any short-window figure, never the favourable one alone.",
]);

// ---- per-number disclosures -----------------------------------------------------------------------------------------------

export interface Disclosures {
  readonly forecastTime: string;
  readonly coverage: string;
  readonly quality: string;
  readonly qualityBasis: Untrusted<string> | null;
  readonly quote: string;
  readonly notExecutableEdge: string;
  readonly hypotheticalPerformance: string;
  readonly smallEdge: string;
  readonly perCallCost: string;
  readonly notAdvice: string;
  readonly noAffiliation: string;
  readonly attribution: string;
  readonly noAutoTrade: string;
  readonly whyNotArbitrage: string;
}

export const DISCLOSURE_KEYS: ReadonlyArray<keyof Disclosures> = Object.freeze([
  "forecastTime",
  "coverage",
  "quality",
  "qualityBasis",
  "quote",
  "notExecutableEdge",
  "hypotheticalPerformance",
  "smallEdge",
  "perCallCost",
  "notAdvice",
  "noAffiliation",
  "attribution",
  "noAutoTrade",
  "whyNotArbitrage",
]);

const COVERAGE_TEXT: Readonly<Record<NonNullable<QuotientRow["coverage"]>, string>> = Object.freeze({
  forecasting: "Coverage: forecasting (Quotient reports evidence of an edge in this class).",
  experimental: "Coverage: experimental, no established edge. This covers every sports market; it is live but not yet proven.",
  under_review: "Coverage: under review. Quotient has paused forecasting here.",
  research_only: "Coverage: research only. Quotient does not stand behind a forecast here.",
});

function qualityText(row: QuotientRow): string {
  const q = row.quality;
  if (q === null) return "Quality: Quotient gave no quality record for this row. Treat the number as unrated.";
  const parts = [
    `status ${q.status ?? "not given"}`,
    `tier ${q.tier ?? "not given"}`,
    `assessment ${q.assessmentSource === null ? "not given" : q.assessmentSource === "live" ? "from live results" : "from historical replays"}`,
    `sample ${q.liveSample === null ? "live n/a" : `live ${q.liveSample}`}, ${q.historicalSample === null ? "historical n/a" : `historical ${q.historicalSample}`}`,
  ];
  return `Quality: ${parts.join("; ")}.`;
}

function quoteText(row: QuotientRow, nowMs: number): string {
  const q = row.quote;
  if (q === null) return "Quote: no venue quote came with this row, so there is no spread to speak of.";
  const method = q.method === null ? "unknown method" : q.method === "graph_snapshot" ? "graph snapshot (stale, not a live quote)" : q.method;
  const venue = row.venue ?? "the venue";
  return `Quote: ${method} on ${venue}, observed ${q.observedAtMs === null ? "at an unknown time" : `${formatUtc(q.observedAtMs)} (${formatAge(nowMs, q.observedAtMs)})`}. It is a selected quote, not an executable price.`;
}

// `route` is the route the row came from, for the cost line.
export function disclosuresFor(row: QuotientRow, nowMs: number, route: RouteId): Disclosures {
  const price = ROUTES[route].priceUsd;
  return Object.freeze({
    forecastTime: `Forecast made ${formatUtc(row.forecast.createdAtMs)} (${formatAge(nowMs, row.forecast.createdAtMs)}). Q's estimate, not a price target.`,
    coverage: row.coverage === null ? "Coverage: Quotient did not state one. Treat as unproven." : COVERAGE_TEXT[row.coverage],
    quality: qualityText(row),
    qualityBasis: row.quality?.basis ?? null,
    quote: quoteText(row, nowMs),
    notExecutableEdge: "A spread is not an executable edge. Fees, slippage and thin books can remove it; recompute from the venue's own book before acting.",
    hypotheticalPerformance: TRACK_RECORD_CAVEATS[0] ?? "",
    smallEdge: "The edge is small and concentrated at short lead times. Quotient's forecasts do not beat the market in every category.",
    perCallCost: price === "0" ? "This route is free." : `Each call to this route costs about $${price} (the payment challenge is authoritative). A refresh is a new charge.`,
    notAdvice: "Model-generated research, not investment advice and not a recommendation. Quotient is a publisher of information; it does not place trades.",
    noAffiliation: "Quotient is not affiliated with the venues shown, and this project is not endorsed by Quotient.",
    attribution: `Source: ${QUOTIENT_ATTRIBUTION}. Shown unaltered, for you only.`,
    noAutoTrade: "No order is ever placed from a Quotient number. Any trade goes through the normal quote, cap and approval path.",
    whyNotArbitrage: WHY_NOT_ARBITRAGE,
  });
}
