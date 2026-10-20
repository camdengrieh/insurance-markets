import { DEFAULTS } from "../src/config.js";
import {
  lintMarketDraft,
  type LintItem,
  type LintOptions,
  type LintResult,
  type MarketDraft,
} from "../src/create/lint.js";

// Shared by the draft-lint-*.test.ts files. Not a test itself.

// The clock is always passed in, so every date is fixed against this instant.
export const NOW = Date.parse("2026-10-19T12:00:00Z");

export const GOOD_RULES =
  "This market resolves Yes if the 1-day candle for BTC-USD on Coinbase Exchange (https://exchange.coinbase.com/markets/BTC-USD) that opens at 2026-12-31T00:00:00Z closes at a price strictly above 150,000 USD. Otherwise the market resolves No. If Coinbase does not publish that candle, or BTC-USD trading is suspended for the whole day, the market is void and positions resolve equally.";
export const GOOD_TITLE = "Will Bitcoin's daily closing price on Coinbase be above $150,000 on December 31, 2026?";

export const GOOD: MarketDraft = {
  title: GOOD_TITLE,
  description: "Binary market on whether BTC-USD closes above $150,000 on Coinbase on the last day of 2026.",
  category: "Crypto",
  outcomes: ["Yes", "No"],
  rules: GOOD_RULES,
  resolutionSources: ["https://exchange.coinbase.com/markets/BTC-USD"],
  closeDate: "2027-01-01T00:00:00Z",
};

export function lint(overrides: Partial<MarketDraft> = {}, nowMs = NOW, extra: Partial<LintOptions> = {}): LintResult {
  return lintMarketDraft({ ...GOOD, ...overrides }, { nowMs, config: DEFAULTS, ...extra });
}

export const problems = (result: { items: readonly LintItem[] }): LintItem[] =>
  result.items.filter((item) => item.severity !== "pass");
export const codesOf = (result: { items: readonly LintItem[] }): string[] => problems(result).map((item) => item.code);
export const find = (result: { items: readonly LintItem[] }, code: string): LintItem | undefined =>
  result.items.find((item) => item.code === code);

// The at sign is written as a code point so that test files hold no email-like text.
export const AT = String.fromCharCode(64);

// Fixed-seed generator (mulberry32): property-style tests never read the clock or Math.random.
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
