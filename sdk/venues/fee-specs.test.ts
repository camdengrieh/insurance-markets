import { describe, expect, it } from "vitest";

import type { FeeSpec } from "../model.js";
import { checkFeeSpec, orderFee, type FeeRole, type FeeSide } from "../engine/fees.js";
import { dec, ratToDecExact } from "../money/rational.js";
import { feeSpecOf as geminiFeeSpecOf, type GeminiEvent } from "./gemini/map.js";
import { feeSpecOf as kalshiFeeSpecOf, type KalshiSeries } from "./kalshi/map.js";
import { feeSpecOf as novigFeeSpecOf } from "./novig/map.js";
import { feeSpecOf as ogFeeSpecOf } from "./og/map.js";
import { feeSpec as udxFeeSpec } from "./udx/map.js";
import type { NovigMarket } from "./novig/schemas.js";
import type { OgMarket } from "./og/map.js";

// Each reader's own fee spec, priced by the engine against the venue's published worked example where one exists.
// Gemini, Kalshi, Novig, OG and UDX keep no recorded payload in this public repo (their fixtures/README.txt says why),
// so each spec is built from the few fields the reader's fee builder reads, never from a venue response. XO, Trueo,
// Polymarket and Pascal are priced from their recorded fixtures in their own tests (xo/detail.test.ts,
// trueo/adapter.test.ts, polymarket/normalize.test.ts, pascal/adapter.test.ts).

const NOW = Date.parse("2026-10-22T12:00:00Z");

function fee(spec: FeeSpec, side: FeeSide, fills: ReadonlyArray<readonly [string, string]>, role: FeeRole = "taker"): string {
  expect(checkFeeSpec(spec, NOW).ok).toBe(true);
  const result = orderFee(spec, role, side, fills.map(([price, qty]) => ({ price: dec(price), qty: dec(qty) })));
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return ratToDecExact(result.value) ?? "inexact";
}

describe("Kalshi (docs.kalshi.com/getting_started/fee_rounding, read 2026-10-22)", () => {
  const series: KalshiSeries = { ticker: "KXTEST", feeType: "quadratic", feeMultiplier: 1, sources: [] };
  const spec = kalshiFeeSpecOf(series, "https://external-api.kalshi.com", NOW);

  it("states the trade fee rounded up to $0.000001 and the balance aligned to the cent", () => {
    expect(spec).toMatchObject({ modelId: "curve_pq", taker: { rate: "0.07", multiplier: "1" }, rounding: "ceil:6,align:2" });
    expect(spec.maker).toBeUndefined();
  });

  it("reproduces the FCM-cleared worked example: -$0.055 of revenue, model fee $0.00363825, fee plus rounding fee $0.005", () => {
    // One contract bought at 0.055: 0.07 x 0.055 x 0.945 = 0.00363825 -> 0.003639; the balance moves by -0.06.
    expect(fee(spec, "buy", [["0.055", "1"]])).toBe("0.005");
  });

  it("aligns a sale against the seller, and leaves an already aligned order at its rounded-up trade fee", () => {
    // 0.055 - 0.003639 = 0.051361 is received as 0.05.
    expect(fee(spec, "sell", [["0.055", "1"]])).toBe("0.005");
    // 100 at 0.50: 1.75 exactly, notional 50 already on the cent grid.
    expect(fee(spec, "buy", [["0.5", "100"]])).toBe("1.75");
  });
});

describe("Gemini (gemini.com/fees/predictions, read 2026-10-22)", () => {
  // Only the listing dates are read: a contract listed after 2026-03-18 is on the documented schedule.
  const event = { shell: { createdAt: "2026-09-01T00:00:00Z" }, contracts: [{ createdAt: "2026-09-01T00:00:00Z" }] } as unknown as GeminiEvent;
  const spec = geminiFeeSpecOf(event, Date.parse("2026-10-20T00:00:00Z"));

  it("rounds up to the next cent", () => {
    expect(spec).toMatchObject({ modelId: "curve_pq", rounding: "ceil:2", taker: { rate: "0.07" }, maker: { rate: "0.0175" } });
  });

  it("reproduces the page's four examples for 100 contracts", () => {
    expect(fee(spec, "buy", [["0.4", "100"]])).toBe("1.68");
    expect(fee(spec, "buy", [["0.9", "100"]])).toBe("0.63");
    // 0.1575 and 0.4375 shown as $0.16 and $0.44: rounded up.
    expect(fee(spec, "buy", [["0.1", "100"]], "maker")).toBe("0.16");
    expect(fee(spec, "buy", [["0.5", "100"]], "maker")).toBe("0.44");
  });
});

describe("UDX (UDX Fee Schedule effective 2026-10-09, read 2026-10-22)", () => {
  // The origin only names the paramsSource.
  const spec = udxFeeSpec("https://example.invalid");

  it("rounds to the nearest cent with halves to even (the schedule gives the rule and no worked example)", () => {
    expect(spec).toMatchObject({ modelId: "curve_pq", rounding: "half_even:2" });
    // 30 x 0.07 x 0.25 = 0.525, a half: to the even cent 0.52, where half up would give 0.53.
    expect(fee(spec, "buy", [["0.5", "30"]])).toBe("0.52");
    // 50 x 0.07 x 0.25 = 0.875 -> 0.88.
    expect(fee(spec, "buy", [["0.5", "50"]])).toBe("0.88");
  });
});

describe("Novig (docs.novig.com/api/concepts/fees and docs.novig.com/fees, read 2026-10-22)", () => {
  const market = { marketId: "m-1", fee: { coefficient: "0.06", charged: "ALWAYS", makerCredit: "0.25" } } as unknown as NovigMarket;
  const spec = novigFeeSpecOf(market, NOW);

  it("rounds half up to $0.00001 with no cent floor", () => {
    expect(spec).toMatchObject({ modelId: "curve_pq", rounding: "half_up:5", taker: { rate: "0.06" }, maker: { rate: "0" } });
  });

  it("reproduces the venue's examples", () => {
    // 100 contracts at 0.50: $1.50.
    expect(fee(spec, "buy", [["0.5", "100"]])).toBe("1.5");
    // 500 contracts at 0.45: $7.425, "not rounded to $7.43".
    expect(fee(spec, "buy", [["0.45", "500"]])).toBe("7.425");
    // 0.01 contract at 0.50: $0.00015.
    expect(fee(spec, "buy", [["0.5", "0.01"]])).toBe("0.00015");
  });
});

describe("OG (help.og.com fee table and the NADEX Fee Schedule effective 2026-08-01, read 2026-10-22)", () => {
  it("states no rounding, so the reader's spec is refused rather than priced with a guessed mode", () => {
    const market = { instruments: [{ event_details: { metaData: { PREDICT_CATEGORY: "sports" } } }] } as unknown as OgMarket;
    const spec = ogFeeSpecOf(market, Date.parse("2026-10-20T00:00:00Z"));
    expect(spec).toMatchObject({ modelId: "curve_pq", rounding: "unknown" });
    const result = orderFee(spec, "taker", "buy", [{ price: dec("0.5"), qty: dec("10") }]);
    expect(result.ok ? "priced" : result.code).toBe("ROUNDING_UNSUPPORTED");
  });
});
