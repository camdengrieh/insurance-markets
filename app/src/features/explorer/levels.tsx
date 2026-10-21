// One side of an order book as rows (Main.dc.html, Market.dc.html): price · a dither bar in the side's ink · size.
// The bar is decoration beside the exact figures: its width is the level's size over the largest size shown, the
// one place floating point is used, because nothing is printed from it. An empty side says so in words; no price is
// implied from it.

import { DitherBar, Num } from "../../ui";
import type { Level } from "../../core/ports";
import { priceText, sizeText } from "./display";

export type BookSide = "bids" | "asks";

export function levelRatio(size: string, largest: string | null): number {
  if (largest === null) return 0;
  const top = Number(largest);
  const own = Number(size);
  if (!Number.isFinite(top) || !Number.isFinite(own) || top <= 0 || own < 0) return 0;
  return Math.min(1, own / top);
}

// The largest size among the shown levels, as a decimal string, or null when none parses.
export function largestSize(levels: readonly Level[]): string | null {
  let best: number | null = null;
  for (const level of levels) {
    const value = Number(level.size);
    if (Number.isFinite(value) && value >= 0 && (best === null || value > best)) best = value;
  }
  return best === null ? null : String(best);
}

export function LevelRows({ caption, levels, side, top }: { readonly caption: string; readonly levels: readonly Level[]; readonly side: BookSide; readonly top: number }) {
  const shown = levels.slice(0, top);
  if (shown.length === 0) return <p className="explorer-note">{`${caption}: no orders on this side. No price is implied.`}</p>;
  const largest = largestSize(shown);
  return (
    <div className="explorer-side" data-side={side}>
      <p className="explorer-levels-caption">{caption}</p>
      <ul className="explorer-levels" aria-label={caption}>
        {shown.map((level, index) => (
          <li key={`${level.price}:${index}`} className="explorer-level">
            <Num>{priceText(level.price) ?? "n/a"}</Num>
            <DitherBar value={levelRatio(level.size, largest)} tone={side === "bids" ? "yes" : "no"} />
            <Num>{sizeText(level.size) ?? "n/a"}</Num>
          </li>
        ))}
      </ul>
    </div>
  );
}
