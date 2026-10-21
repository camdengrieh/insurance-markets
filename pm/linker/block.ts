// Blocking: candidate pairs are only drawn inside a block (category + close-time bucket) and
// between a bucket and the next one. Deterministic: markets are sorted by key, blocks by key,
// so the same input always yields the same pair order.

import { BLOCK_BUCKET_MINUTES, MAX_BLOCK_SIZE, MAX_PAIRS_PER_RUN } from "./constants.js";
import { featureKey, type MarketFeatures } from "./features.js";

export interface Block {
  readonly key: string;
  readonly category: string;
  readonly bucket: number;
  readonly markets: readonly MarketFeatures[];
  readonly truncated: number;
}

export function bucketOf(closeUtc: string): number {
  const ms = Date.parse(closeUtc);
  return Number.isFinite(ms) ? Math.floor(ms / (BLOCK_BUCKET_MINUTES * 60_000)) : -1;
}

export function blockKey(category: string, bucket: number): string {
  return `${category}|${bucket}`;
}

export function buildBlocks(features: readonly MarketFeatures[]): Block[] {
  const byKey = new Map<string, MarketFeatures[]>();
  const sorted = [...features].sort((a, b) => (featureKey(a) < featureKey(b) ? -1 : 1));
  for (const f of sorted) {
    const key = blockKey(f.category, bucketOf(f.closeUtc));
    const list = byKey.get(key);
    if (list === undefined) byKey.set(key, [f]);
    else list.push(f);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, markets]) => {
      const [category = "", bucketText = "-1"] = key.split("|");
      return { key, category, bucket: Number(bucketText), markets: markets.slice(0, MAX_BLOCK_SIZE), truncated: Math.max(0, markets.length - MAX_BLOCK_SIZE) };
    });
}

export interface Pair {
  readonly a: MarketFeatures;
  readonly b: MarketFeatures;
  readonly blockKey: string;
}

// The category a market gets when neither the venue nor the title says anything. A market there
// may be the same question as one with a known category, so "other" pairs with every category.
export const WILDCARD_CATEGORY = "other";

// Within a block every unordered pair once; across adjacent buckets of one category every pair
// once; the wildcard block of a bucket against every other category of that bucket and the next.
// Each unordered pair is generated exactly once. Stops at MAX_PAIRS_PER_RUN and counts the rest.
export function pairsOf(blocks: readonly Block[]): { pairs: Pair[]; skipped: number } {
  const pairs: Pair[] = [];
  let skipped = 0;
  const byKey = new Map(blocks.map((b) => [b.key, b]));
  const push = (a: MarketFeatures, b: MarketFeatures, key: string): void => {
    if (pairs.length >= MAX_PAIRS_PER_RUN) skipped += 1;
    else pairs.push({ a, b, blockKey: key });
  };
  const cross = (from: Block, to: Block | undefined, label: string): void => {
    if (to === undefined) return;
    for (const a of from.markets) for (const b of to.markets) push(a, b, label);
  };
  for (const block of blocks) {
    const m = block.markets;
    for (let i = 0; i < m.length; i += 1) for (let j = i + 1; j < m.length; j += 1) push(m[i] as MarketFeatures, m[j] as MarketFeatures, block.key);
    cross(block, byKey.get(blockKey(block.category, block.bucket + 1)), `${block.key}+1`);
    if (block.category !== WILDCARD_CATEGORY) {
      cross(block, byKey.get(blockKey(WILDCARD_CATEGORY, block.bucket)), `${block.key}~`);
      cross(block, byKey.get(blockKey(WILDCARD_CATEGORY, block.bucket + 1)), `${block.key}~+1`);
    } else {
      for (const other of blocks) if (other.category !== WILDCARD_CATEGORY && other.bucket === block.bucket + 1) cross(block, other, `${block.key}~+1`);
    }
  }
  return { pairs, skipped };
}
