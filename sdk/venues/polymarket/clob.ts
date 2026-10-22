import { clobFee, type PolymarketFee } from "./normalize.js";
import { isOpenUnitInterval, numericToDec, cmpDec, type Dec } from "./decimal.js";
import { clobMarketInfoSchema } from "./schemas.js";

// GET /clob-markets/{conditionId} -> what the matching engine says about one market: its token list, tick, minimum
// order size, whether it accepts orders, and its fee. The engine's values are the ones that are charged and
// enforced; Gamma's copies are a cache. Pure: the caller fetches, this module only reads.

export interface ClobMarketInfo {
  readonly conditionId: string;
  // The engine's tokens in its own order, with the outcome label it gives each one.
  readonly tokens: ReadonlyArray<{ readonly tokenId: string; readonly outcome: string }>;
  // null when absent or not a price step (0 < tick < 1).
  readonly tick: Dec | null;
  // null when absent or negative.
  readonly minSize: Dec | null;
  readonly acceptingOrders: boolean | null;
  // null when the engine sent no `fd` block.
  readonly fee: PolymarketFee | null;
}

export type ClobInfoOutcome = { readonly ok: true; readonly info: ClobMarketInfo } | { readonly ok: false; readonly reason: string };

// `conditionId` is the market the caller asked about; an answer for another condition is drift.
export function parseClobMarketInfo(payload: unknown, conditionId: string): ClobInfoOutcome {
  const parsed = clobMarketInfoSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: "the market info does not match the expected shape" };
  const info = parsed.data;
  if (info.c.toLowerCase() !== conditionId.toLowerCase()) return { ok: false, reason: "the market info is for another condition" };
  const tick = info.mts === null || info.mts === undefined ? null : numericToDec(info.mts);
  const minSize = info.mos === null || info.mos === undefined ? null : numericToDec(info.mos);
  return {
    ok: true,
    info: {
      conditionId: info.c.toLowerCase(),
      tokens: info.t.map((entry) => ({ tokenId: entry.t, outcome: entry.o })),
      tick: tick !== null && isOpenUnitInterval(tick) ? tick : null,
      minSize: minSize !== null && cmpDec(minSize, "0") !== -1 ? minSize : null,
      acceptingOrders: info.ao ?? null,
      fee: clobFee(info.fd),
    },
  };
}

// Per-index confirmation that Gamma's token ids and labels (as Gamma wrote them, before sanitising) agree with the
// engine's. A mismatch means one of the two is stale or the ledger rule is wrong, and a wrong-way outcome mapping
// would flip every price, so the caller refuses the market. Returns null when they agree, else a fixed sentence.
export function crossCheckClobTokens(
  gamma: { readonly tokenIds: readonly string[]; readonly labels: readonly string[]; readonly ledger: string | undefined },
  info: ClobMarketInfo,
): string | null {
  for (const [index, tokenId] of gamma.tokenIds.entries()) {
    const entry = info.tokens.find((candidate) => candidate.tokenId === tokenId);
    if (entry === undefined) {
      return gamma.ledger === "protocol_v2"
        ? "v2 positionIds could not be confirmed against the CLOB (unexercised path)"
        : "Gamma's token ids are not the CLOB's token ids";
    }
    if (entry.outcome !== gamma.labels[index]) return "Gamma and the CLOB disagree on outcome order";
  }
  return null;
}
