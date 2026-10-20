// Text for portfolio figures. A figure always carries what it is counted in: "12.50 pUSD", "3.00 TYD", never a
// bare "$". A missing figure prints NULL_TEXT, never 0 (core/format.ts).

import { NULL_TEXT, formatQty } from "../../core/format";
import { toFixedText, type Qty } from "../../core/money";

export function moneyText(q: Qty | null, symbol: string, places = 2): string {
  if (q === null) return NULL_TEXT;
  const { text, roundedToZero } = toFixedText(q, places, "down", { thousands: true });
  if (roundedToZero) return `${q.atomic < 0n ? "-" : ""}<${places === 0 ? "1" : `0.${"0".repeat(places - 1)}1`} ${symbol}`;
  return `${text} ${symbol}`;
}

export function signedMoneyText(q: Qty | null, symbol: string): string {
  if (q === null) return NULL_TEXT;
  const { text, roundedToZero } = toFixedText(q, 2, "down", { thousands: true, plus: true });
  return roundedToZero ? `<0.01 ${symbol}` : `${text} ${symbol}`;
}

export function sharesText(q: Qty | null): string {
  return formatQty(q, { places: 4 });
}
