import { fromAtomic, parseQty, type Qty } from "../../money/qty.js";
import { safeHttpsUrl } from "../../text.js";
import { displayAttributesSchema, marketRowSchema, msOf, parseReference, parseScalar, type PascalReference } from "./schemas.js";

// One /markets entry, validated and reduced to what the adapter uses. Text a stranger can influence stays a raw
// string here (`titleText`, `descriptionText`, `labels`) and is branded Untrusted only in map.ts.

export type LabelKind = "default" | "custom" | "unrecognised";
export interface Labels {
  readonly kind: LabelKind;
  readonly long: string;
  readonly short: string;
}

export interface PascalRow {
  readonly symbol: string;
  readonly event: string;
  readonly titleText: string;
  readonly descriptionText: string;
  readonly takerFeeRate: Qty;
  readonly makerRebateShare: Qty;
  readonly tickMinMicro: bigint;
  readonly sigFigs: number;
  readonly bestBid: Qty | null;
  readonly bestAsk: Qty | null;
  readonly expectedResolutionMs: number | null;
  readonly listingMs: number | null;
  readonly reference: PascalReference | null;
  readonly scalar: { readonly lower: string; readonly upper: string } | null;
  readonly labels: Labels;
  readonly rulesUrl: string | null;
  readonly volume24h: Qty | null;
}

export const ONE_PRICE: Qty = fromAtomic("price", 1n, 0);

// Price in (0, 1]. "" and null mean one-sided; a value outside the range is a drift, so the whole row drops.
function price(value: string | null | undefined): Qty | null | "bad" {
  if (value === undefined || value === null || value === "") return null;
  const qty = parseQty("price", value, { maxScale: 6 });
  if (qty === null) return "bad";
  if (qty.atomic <= 0n) return null;
  // Compare against 1 exactly: atomic / 10^scale <= 1.
  const one = 10n ** BigInt(qty.scale);
  return qty.atomic <= one ? qty : "bad";
}

function parseLabels(value: unknown): Labels {
  if (value === undefined || value === null) return { kind: "default", long: "Yes", short: "No" };
  const text = (item: unknown): string | null => (typeof item === "string" && item.trim() !== "" && item.length <= 80 ? item : null);
  if (Array.isArray(value) && value.length === 2) {
    const long = text(value[0]);
    const short = text(value[1]);
    if (long !== null && short !== null) return { kind: "custom", long, short };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const record = value as { long?: unknown; short?: unknown };
    const long = text(record.long);
    const short = text(record.short);
    if (long !== null && short !== null) return { kind: "custom", long, short };
  }
  // Neutral names when the shape is not understood: never "Yes" and "No" for outcomes of unknown meaning.
  return { kind: "unrecognised", long: "Long", short: "Short" };
}

// Pascal-written rules live at an S3 URL. Only that shape is passed on as a source link.
const RULES_HOST = /^[a-z0-9-]+\.s3\.[a-z0-9-]+\.amazonaws\.com$/;
export function safeRulesUrl(value: string | undefined): string | null {
  if (value === undefined) return null;
  const href = safeHttpsUrl(value);
  if (href === null) return null;
  const url = new URL(href);
  if (!RULES_HOST.test(url.hostname) || !/^\/[A-Za-z0-9_./-]{1,300}\.md$/.test(url.pathname) || url.search !== "" || url.hash !== "") return null;
  return href;
}

export function parseRow(raw: unknown): PascalRow | null {
  const parsed = marketRowSchema.safeParse(raw);
  if (!parsed.success) return null;
  const row = parsed.data;
  const attrs = displayAttributesSchema.safeParse(row.display_attributes ?? {});
  if (!attrs.success) return null;

  const takerFeeRate = parseQty("price", row.taker_fee_rate, { maxScale: 6 });
  const makerRebateShare = parseQty("price", row.maker_rebate_share, { maxScale: 6 });
  const tickMin = parseQty("price", row.tick_size_min, { maxScale: 6 });
  if (takerFeeRate === null || makerRebateShare === null || tickMin === null) return null;
  // A fee above 100 per cent, a rebate share above 1 or a tick of zero is not a Pascal market.
  if (takerFeeRate.atomic > 10n ** BigInt(takerFeeRate.scale)) return null;
  if (makerRebateShare.atomic > 10n ** BigInt(makerRebateShare.scale)) return null;
  const tickMinMicro = tickMin.atomic * 10n ** BigInt(6 - tickMin.scale);
  if (tickMinMicro <= 0n || tickMinMicro >= 1_000_000n) return null;

  const bestBid = price(row.best_bid);
  const bestAsk = price(row.best_ask);
  if (bestBid === "bad" || bestAsk === "bad") return null;

  const window = row.stats?.last_24h;
  const buy = window?.taker_buy_volume_notional === undefined ? null : parseQty("usd", window.taker_buy_volume_notional, { maxScale: 6 });
  const sell = window?.taker_sell_volume_notional === undefined ? null : parseQty("usd", window.taker_sell_volume_notional, { maxScale: 6 });
  let volume24h: Qty | null = null;
  if (buy !== null && sell !== null) {
    const scale = Math.max(buy.scale, sell.scale);
    const lift = (q: Qty): bigint => q.atomic * 10n ** BigInt(scale - q.scale);
    volume24h = fromAtomic("usd", lift(buy) + lift(sell), scale);
  }

  const event = row.symbol.slice(0, row.symbol.indexOf("."));
  const eventText = attrs.data.event_description?.trim() ?? "";
  const marketText = attrs.data.market_description?.trim() ?? "";
  const titleText = eventText !== "" && marketText !== "" ? `${eventText} — ${marketText}` : eventText !== "" ? eventText : marketText !== "" ? marketText : row.symbol;

  return {
    symbol: row.symbol,
    event,
    titleText,
    descriptionText: [eventText, marketText].filter((part) => part !== "").join("\n"),
    takerFeeRate,
    makerRebateShare,
    tickMinMicro,
    sigFigs: row.tick_sig_figs,
    bestBid,
    bestAsk,
    expectedResolutionMs: msOf(attrs.data.expected_resolution_time_ms),
    listingMs: msOf(row.listing_ts_ms),
    reference: parseReference(attrs.data.reference),
    scalar: parseScalar(attrs.data.scalar),
    labels: parseLabels(attrs.data.outcome_labels),
    rulesUrl: safeRulesUrl(row.rules_url),
    volume24h,
  };
}

export interface ParsedRows {
  readonly rows: readonly PascalRow[];
  readonly dropped: number;
}

export function parseRows(data: readonly unknown[]): ParsedRows {
  const parsed: PascalRow[] = [];
  let dropped = 0;
  for (const raw of data) {
    const row = parseRow(raw);
    if (row === null) dropped += 1;
    else parsed.push(row);
  }
  // A repeated symbol is a drift: which entry is right is unknowable, so none of them is kept.
  const counts = new Map<string, number>();
  for (const row of parsed) counts.set(row.symbol, (counts.get(row.symbol) ?? 0) + 1);
  const rows = parsed.filter((row) => counts.get(row.symbol) === 1);
  return { rows, dropped: dropped + (parsed.length - rows.length) };
}
