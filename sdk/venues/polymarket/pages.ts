import type { MarketSummary } from "../../model.js";
import { normalizeSummary, type Normalized, type NormalizeContext } from "./normalize.js";
import { CONDITION_ID, gammaMarketSchema, gammaMarketsKeysetSchema, gammaSearchSchema, type GammaEvent, type GammaMarket } from "./schemas.js";

// Gamma answers -> rows, and one row -> a market. Pure: what every Polymarket client (the dApp reader, the pm
// adapter, the cross-venue linker) needs to read a Gamma page the same way. Paging policy (which route, which
// cursor to send) stays with the caller.

// An opaque venue cursor: what Gamma issues and what may be sent back.
export const CURSOR = /^[A-Za-z0-9_\-+/=.~]{1,2048}$/;

// The id a row claims, for a refusal report; null when it has none that parses.
export function claimedConditionId(row: unknown): string | null {
  if (typeof row !== "object" || row === null) return null;
  const id = (row as { conditionId?: unknown }).conditionId;
  return typeof id === "string" && CONDITION_ID.test(id) ? id.toLowerCase() : null;
}

export function parseGammaMarket(row: unknown): Normalized<GammaMarket> {
  const parsed = gammaMarketSchema.safeParse(row);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "row does not match the market shape" };
}

export type RowOutcome =
  | { readonly ok: true; readonly value: MarketSummary }
  | { readonly ok: false; readonly id: string | null; readonly reason: string };

// One Gamma market row (from any route) -> a list row. `ctx.event` is the event a search or events route nested it
// under; otherwise the row's own first event is used.
export function summarizeRow(row: unknown, ctx: NormalizeContext): RowOutcome {
  const parsed = parseGammaMarket(row);
  if (!parsed.ok) return { ok: false, id: claimedConditionId(row), reason: parsed.reason };
  const result = normalizeSummary(parsed.value, ctx);
  return result.ok ? result : { ok: false, id: parsed.value.conditionId.toLowerCase(), reason: result.reason };
}

export type PageOutcome<T> = ({ readonly ok: true } & T) | { readonly ok: false; readonly reason: string };

// GET /markets/keyset: {markets, next_cursor}. The rows are returned unparsed so one bad row does not hide the page.
export function parseKeysetPage(payload: unknown): PageOutcome<{ readonly rows: readonly unknown[]; readonly next: string | null }> {
  const parsed = gammaMarketsKeysetSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "the list answer does not match the expected shape" };
  const next = parsed.data.next_cursor ?? null;
  if (next !== null && !CURSOR.test(next)) return { ok: false, reason: "the next cursor is not an opaque token" };
  return { ok: true, rows: parsed.data.markets, next };
}

export interface SearchRow {
  readonly row: unknown;
  readonly event: GammaEvent;
}

// GET /public-search: {events:[{..., markets:[...]}], pagination:{hasMore}}. Each market row comes with the event it
// was nested under (its id, slug and neg-risk fields), which names its group and its category words.
export function parseSearchPage(payload: unknown): PageOutcome<{ readonly rows: readonly SearchRow[]; readonly hasMore: boolean }> {
  const parsed = gammaSearchSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "the search answer does not match the expected shape" };
  const rows: SearchRow[] = [];
  for (const event of parsed.data.events) {
    const nested: GammaEvent = {
      id: event.id ?? null,
      slug: event.slug ?? null,
      title: event.title ?? null,
      description: event.description ?? null,
      negRisk: event.negRisk ?? null,
      negRiskMarketID: event.negRiskMarketID ?? null,
    };
    for (const row of event.markets ?? []) rows.push({ row, event: nested });
  }
  return { ok: true, rows, hasMore: parsed.data.pagination.hasMore };
}
