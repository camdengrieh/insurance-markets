import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Market, MarketRef } from "../../model.js";
import { XO_COLLATERAL, XO_FEE_STATUS, XO_SCHEMA_HASH, XO_TICK, createXoAdapter, isXoAdapterError, rulesSha256, XoAdapterError, type XoAdapter } from "./index.js";
import { manualClock, scriptedFetch, type ScriptedReply } from "./testkit.js";

// getMarket: rules, the rules hash, the fee spec, tradability and hostile text, against recorded detail routes.

const FIXTURES = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as unknown;
type Rec = Record<string, unknown>;
const clone = <T>(value: T): T => structuredClone(value);

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const DATA = "api-mainnet.xo.market";
// live-data-detail-fee-400.json: a long-form CLOB market (type 2) with FLAT_BPS at 400 bps.
const FEE400 = "0xb63d8f77fc1437a804d5fdeedb4c00dc49e1d7c7738f6410c36f1f44e6cfd654";
const YES_TOKEN = "68215442288791572296498952759094916177229244750752613990844701608971303593663";
const NO_TOKEN = "6530318981470987186894988035298961845748217855361759807272408942024241321361";

const detailBody = (): Rec => clone(fixture("live-data-detail-fee-400.json")) as Rec;
const refOf = (marketId: string, venue: MarketRef["venue"] = "xo"): MarketRef => ({ venue, marketId, native: {} });

function setup(reply: ScriptedReply | ((url: URL) => ScriptedReply), id = FEE400) {
  const { fetch, calls } = scriptedFetch([{ host: DATA, path: `/api/markets/contract/${id}`, reply }]);
  const clock = manualClock(NOW);
  const adapter: XoAdapter = createXoAdapter({ fetch, nowMs: clock.nowMs }, { variant: "standalone" });
  return { adapter, calls, clock };
}

async function failure(promise: Promise<unknown>): Promise<XoAdapterError> {
  try {
    await promise;
  } catch (error) {
    if (isXoAdapterError(error)) return error;
    throw error;
  }
  throw new Error("expected a XoAdapterError");
}

describe("getMarket: the recorded 400 bps market", () => {
  it("maps ids, outcomes, times, tick and collateral", async () => {
    const { adapter, calls } = setup({ body: detailBody() });
    const market = await adapter.getMarket(refOf(FEE400));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url.pathname).toBe(`/api/markets/contract/${FEE400}`);
    expect(market.ref).toEqual({ venue: "xo", marketId: FEE400, native: { id: "29879", kind: "clob", slug: "imavov-ufc-title-2026-1256" } });
    expect(market.title).toEqual({ untrusted: true, value: "Imavov UFC Title 2026" });
    expect(market.outcomes.map((o) => [o.index, o.role, o.tokenId, o.label.value])).toEqual([
      [0, "yes", YES_TOKEN, "Yes"],
      [1, "no", NO_TOKEN, "No"],
    ]);
    expect(market.status).toBe("active");
    expect(market.timesUtc).toEqual({ opensAt: "2026-08-16T13:06:00.000Z", closesAt: "2026-12-31T23:59:00.000Z" });
    expect(market.tick).toBe("0.001");
    expect(market.tick).toBe(XO_TICK);
    expect(market.collateral).toEqual(XO_COLLATERAL);
    expect(market.collateral).toEqual({ symbol: "USDC.e", chain: "eip155:3223", decimals: 6, custody: "smart_account" });
    expect(market.prov).toEqual({ fetchedAtMs: NOW, source: "xo_data:/markets/contract", adapterVersion: "xo-adapter/1", schemaHash: XO_SCHEMA_HASH });
  });

  it("pins the schema hash, so a change to the fields the adapter reads is visible in review", () => {
    // Changed when categoryPath[name,slug] joined the list fields the adapter reads (the category verdict).
    expect(XO_SCHEMA_HASH).toBe("03471fff16e77a7035fdb986972f5e1e9789e8feee5af5758d4aad7e0e5835a7");
  });

  it("keeps the rules text as untrusted paragraphs, the creator's sources that are https links, and the exact mechanism", async () => {
    const { adapter } = setup({ body: detailBody() });
    const rules = (await adapter.getMarket(refOf(FEE400))).rules;
    expect(rules.text.untrusted).toBe(true);
    const lines = rules.text.value.split("\n");
    expect(lines[0]?.startsWith("This market will resolve based on whether the listed fighter")).toBe(true);
    expect(lines.slice(-2)).toEqual(["Yes: Nassourdine Imavov captures a UFC belt in 2026", "No: Nassourdine Imavov does not capture a UFC belt in 2026"]);
    expect(rules.sources).toEqual(["https://www.ufc.com/athletes"]);
    expect(rules.mechanism).toBe("xo_manual_modra");
    // The recorded resolver is a redaction placeholder, not an address: so there is no resolver.
    expect(rules.resolver).toBeUndefined();
    expect(rules.cutoffUtc).toBe("2026-12-31T23:59:00.000Z");
    expect(rules.windowStartUtc).toBe("2026-08-16T13:06:00.000Z");
    // XO states its void handling in free text, which is never parsed.
    expect(rules.void).toBe("unknown");
    expect(rules.canCloseEarly).toBeUndefined();
  });

  it("carries a valid resolver address through, lowercased, and nothing else that looks like one", async () => {
    const body = detailBody();
    body.resolverAddress = "0xabCDeF0123456789AbcdEf0123456789aBCDEF01";
    const { adapter } = setup({ body });
    expect((await adapter.getMarket(refOf(FEE400))).rules.resolver).toBe("0xabcdef0123456789abcdef0123456789abcdef01");
  });

  it("reads any other resolution type as an unknown mechanism", async () => {
    for (const type of ["manual", "MANUAL ", "ORACLE", null]) {
      const body = detailBody();
      body.resolutionType = type;
      const { adapter } = setup({ body });
      expect((await adapter.getMarket(refOf(FEE400))).rules.mechanism).toBe("unknown");
    }
  });
});

describe("rules hash", () => {
  // The shared rules-v2 recipe (sdk/rules.ts) written out a second time, with Node's own hash, so a change to the
  // SDK cannot pass by agreeing with itself. Fields, in order: the rules text (description, then one "Outcome i:"
  // paragraph per outcome rule), the resolution sources joined with U+241E, the resolver address and expiresAt,
  // joined with U+241F; then NFC, control and format characters dropped, whitespace collapsed, trimmed. Markup is
  // kept as text and compatibility forms are not folded: the fingerprint is an equality pin.
  function expected(detail: Rec): string {
    const rules = detail.rules as { description: string | null; outcomeRules: Array<{ outcomeIndex: number; rule: string }> };
    const paragraphs = [...(rules.description ? [rules.description] : []), ...rules.outcomeRules.map((r) => `Outcome ${r.outcomeIndex}: ${r.rule}`)];
    const fields = [paragraphs.join("\n\n"), (detail.resolutionSources as string[]).join("\u241e"), /^0x[0-9a-fA-F]{40}$/.test(String(detail.resolverAddress)) ? String(detail.resolverAddress) : "", detail.expiresAt as string];
    const joined = fields.join("\u241f").normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, (c) => (/\s/u.test(c) ? " " : ""));
    return createHash("sha256").update(joined.replace(/\s+/gu, " ").trim(), "utf8").digest("hex");
  }

  const hashOf = async (body: Rec): Promise<string> => {
    const { adapter } = setup({ body });
    return (await adapter.getMarket(refOf(FEE400))).rules.sha256;
  };

  it("matches the shared recipe and is 64 lowercase hex characters", async () => {
    const body = detailBody();
    const hash = await hashOf(body);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(expected(body));
    // Pinned: a change to the recipe changes every approved link's hash, so it must be a reviewed change.
    expect(hash).toBe("36cf09d47dfc91d0c70d1ddd46db5f50a3a1a293e6a4a6d828a7a9227ff94e34");
  });

  it("ignores spacing only: markup, compatibility forms, words, dates and sources all change it", async () => {
    const base = await hashOf(detailBody());

    const spaced = detailBody();
    (spaced.rules as Rec).description = `${String((spaced.rules as Rec).description).replace(/ /g, "   ")}\n`;
    expect(await hashOf(spaced)).toBe(base);

    const marked = detailBody();
    (marked.rules as Rec).description = `<b>${String((marked.rules as Rec).description)}</b>`;
    expect(await hashOf(marked)).not.toBe(base);

    const fullwidth = detailBody();
    (fullwidth.rules as Rec).description = String((fullwidth.rules as Rec).description).replace("UFC", "ＵＦＣ");
    expect(await hashOf(fullwidth)).not.toBe(base);

    const reworded = detailBody();
    (reworded.rules as Rec).description = String((reworded.rules as Rec).description).replace("Interim champions will not count", "Interim champions will count");
    expect(await hashOf(reworded)).not.toBe(base);

    const later = detailBody();
    later.expiresAt = "2027-01-01T23:59:00.000Z";
    expect(await hashOf(later)).not.toBe(base);

    const otherSource = detailBody();
    otherSource.resolutionSources = ["https://www.ufc.com/rankings"];
    expect(await hashOf(otherSource)).not.toBe(base);

    // Text that tries to move words from one field into the next by carrying the separator itself.
    const injected = detailBody();
    (injected.rules as Rec).description = String((injected.rules as Rec).description) + "\u241fNassourdine Imavov captures a UFC belt in 2026";
    (injected.rules as Rec).outcomeRules = [{ outcomeIndex: 1, rule: String(((detailBody().rules as Rec).outcomeRules as Rec[])[1]?.rule) }];
    expect(await hashOf(injected)).not.toBe(base);

    const noRule = detailBody();
    (noRule.rules as Rec).outcomeRules = [];
    expect(await hashOf(noRule)).not.toBe(base);
  });

  it("is also exported for callers that hold a decoded detail", () => {
    expect(typeof rulesSha256).toBe("function");
  });
});

describe("fee spec", () => {
  it("reports the Data API figure as an unreconciled ceiling, with exact rates", async () => {
    const { adapter } = setup({ body: detailBody() });
    const market = await adapter.getMarket(refOf(FEE400));
    expect(market.fee).toEqual({
      venue: "xo",
      modelId: "ad_valorem_bps",
      taker: { bps: "400" },
      maker: { bps: "0" },
      rounding: "ceil",
      payer: "buyer_adds_seller_withholds",
      paramsSource: { url: `https://api-mainnet.xo.market/api/markets/contract/${FEE400}`, field: "effectiveFeeConfig.takerFeeBps", granularity: "market" },
      verifiedAt: "2026-10-19T12:00:00.000Z",
      ttlSec: 300,
    });
    const detailed = await adapter.getMarketDetail(refOf(FEE400));
    expect(detailed.fee.status).toBe(XO_FEE_STATUS);
    expect(XO_FEE_STATUS).toBe("ceiling_unreconciled");
  });

  it("is never below the p(1-p) curve it may really be: bps on notional is the larger of the two", async () => {
    // For any price p in (0,1): p >= p(1-p). Checked on a grid of integer micro prices without floating point.
    const { adapter } = setup({ body: detailBody() });
    const spec = (await adapter.getMarket(refOf(FEE400))).fee;
    const bps = BigInt(spec.taker?.bps ?? -1);
    for (let micro = 1000n; micro < 1_000_000n; micro += 7000n) {
      const flat = bps * micro; // bps * p, scaled by 1e6
      const curve = (bps * micro * (1_000_000n - micro)) / 1_000_000n; // bps * p(1-p), scaled by 1e6
      expect(flat >= curve).toBe(true);
    }
  });

  it("fails closed for a curve it does not know, a missing config, or an unusable one", async () => {
    const conviction = clone(fixture("data-market-by-contract-conviction.json")) as Rec;
    const unknownCurve = detailBody();
    (unknownCurve.effectiveFeeConfig as Rec).curveModel = "SOMETHING_NEW";
    const lowercase = detailBody();
    (lowercase.effectiveFeeConfig as Rec).curveModel = "flat_bps";
    const missing = detailBody();
    delete missing.effectiveFeeConfig;
    const unusable = detailBody();
    (unusable.effectiveFeeConfig as Rec).takerFeeBps = 20000;
    const noModel = detailBody();
    delete (noModel.effectiveFeeConfig as Rec).curveModel;
    for (const [body, id] of [
      [conviction, conviction.conditionId as string],
      [unknownCurve, FEE400],
      [lowercase, FEE400],
      [missing, FEE400],
      [unusable, FEE400],
      [noModel, FEE400],
    ] as const) {
      const { adapter } = setup({ body }, id);
      const market = await adapter.getMarket(refOf(id));
      expect(market.fee.modelId).toBe("unknown");
      expect(market.fee.taker).toBeUndefined();
    }
  });

  it("explains an unusable fee config in the notes", async () => {
    const body = detailBody();
    (body.effectiveFeeConfig as Rec).takerFeeBps = -1;
    const { adapter } = setup({ body });
    const detailed = await adapter.getMarketDetail(refOf(FEE400));
    expect(detailed.notes).toContain("effectiveFeeConfig was present but unusable; the fee is unknown");
  });

  it("reads a recorded 0 bps market as zero, not unknown", async () => {
    const body = clone(fixture("data-market-by-slug.json")) as Rec;
    const { adapter } = setup({ body }, body.conditionId as string);
    const market = await adapter.getMarket(refOf(body.conditionId as string));
    expect(market.fee.modelId).toBe("ad_valorem_bps");
    expect(market.fee.taker).toEqual({ bps: "0" });
  });
});

describe("tradable and status", () => {
  it("is ok only for an open, approved market, and says why otherwise", async () => {
    const { adapter } = setup({ body: detailBody() });
    expect((await adapter.getMarket(refOf(FEE400))).tradable).toEqual({ ok: true, reasons: [] });

    const conviction = clone(fixture("live-data-detail-fractional.json")) as Rec;
    const id = conviction.conditionId as string;
    const second = setup({ body: conviction }, id);
    expect((await second.adapter.getMarket(refOf(id))).tradable).toEqual({ ok: false, reasons: ["review_update_required"] });

    const paused = detailBody();
    paused.status = "PAUSED";
    paused.reviewStatus = null;
    const third = setup({ body: paused });
    expect((await third.adapter.getMarket(refOf(FEE400))).tradable).toEqual({ ok: false, reasons: ["status_paused", "review_status_missing"] });
  });

  it("maps a closed market with a recorded winner to resolved and reports the winner outside the port", async () => {
    const body = detailBody();
    body.status = "CLOSED";
    body.winningOutcomeId = 60122;
    body.resolvedAt = "2026-10-01T10:00:00.000Z";
    const { adapter } = setup({ body });
    const detailed = await adapter.getMarketDetail(refOf(FEE400));
    expect(detailed.market.status).toBe("resolved");
    expect(detailed.settlement).toEqual({ winningOutcomeIndex: 1, resolvedAt: "2026-10-01T10:00:00.000Z" });
    expect(detailed.market.tradable.ok).toBe(false);
  });

  it("rejects a winner that is not one of the market's own outcome rows", async () => {
    const body = detailBody();
    body.status = "CLOSED";
    body.winningOutcomeId = 1;
    const { adapter } = setup({ body });
    expect((await failure(adapter.getMarket(refOf(FEE400)))).code).toBe("SCHEMA_DRIFT");
  });
});

describe("references and failures", () => {
  it("never sends a request for a reference that is not a well-formed XO condition id", async () => {
    const { adapter, calls } = setup({ body: detailBody() });
    const refs = [refOf("not-an-id"), refOf(`${FEE400}00`), refOf(FEE400.slice(0, -1)), refOf("0x" + "g".repeat(64)), refOf(FEE400, "polymarket")];
    for (const ref of refs) expect((await failure(adapter.getMarket(ref))).code).toBe("NOT_FOUND");
    expect(calls).toHaveLength(0);
  });

  it("accepts an upper-case id and asks for the lower-case route", async () => {
    const { adapter, calls } = setup({ body: detailBody() });
    await adapter.getMarket(refOf(`0x${FEE400.slice(2).toUpperCase()}`));
    expect(calls[0]?.url.pathname).toBe(`/api/markets/contract/${FEE400}`);
  });

  it("maps a 404 to NOT_FOUND and a market that answers for another id to SCHEMA_DRIFT", async () => {
    const missing = setup({ status: 404, body: fixture("data-error-404-market.json") });
    expect((await failure(missing.adapter.getMarket(refOf(FEE400)))).code).toBe("NOT_FOUND");
    const other = clone(fixture("data-market-by-slug.json"));
    const mismatch = setup({ body: other });
    const error = await failure(mismatch.adapter.getMarket(refOf(FEE400)));
    expect(error.code).toBe("SCHEMA_DRIFT");
    expect(error.reason).toBe("condition_id_mismatch");
  });

  it("fails closed when an outcome pair is not exactly Yes at index 0 and No at index 1", async () => {
    const swapped = detailBody();
    ((swapped.outcomes as Rec[])[1] as Rec).index = 0;
    const three = detailBody();
    (three.outcomes as Rec[]).push({ ...((three.outcomes as Rec[])[0] as Rec), id: 1, index: 2 });
    for (const body of [swapped, three]) {
      const { adapter } = setup({ body });
      expect((await failure(adapter.getMarket(refOf(FEE400)))).code).toBe("SCHEMA_DRIFT");
    }
  });

  it("refuses collateral that is not six decimals, because every amount here assumes six", async () => {
    const body = detailBody();
    ((body.collateralToken as Rec)).decimals = 18;
    const { adapter } = setup({ body });
    expect((await failure(adapter.getMarket(refOf(FEE400)))).code).toBe("SCHEMA_DRIFT");
  });
});

describe("hostile creator text", () => {
  it("drops resolution sources that are not plain https links, and says how many", async () => {
    const body = detailBody();
    body.resolutionSources = [
      "javascript:alert(1)",
      "https://user:secret@evil.example/path",
      "http://plain.example/page",
      "data:text/html,<script>alert(1)</script>",
      "https://ok.example/a?b=c",
      "//protocol-relative.example",
      "https://" + "a".repeat(2100),
      "  https://padded.example/x  ",
    ];
    const { adapter } = setup({ body });
    const detailed = await adapter.getMarketDetail(refOf(FEE400));
    expect(detailed.market.rules.sources).toEqual(["https://ok.example/a?b=c", "https://padded.example/x"]);
    expect(detailed.notes).toContain("6 resolution source(s) were not plain https links and were left out");
  });

  it("keeps markup in rules as inert text, keeps paragraph breaks, and removes control and bidi characters", async () => {
    const body = detailBody();
    (body.rules as Rec).description = 'First line <script>alert(1)</script>\nSecond ‮line​\u0000 [x](javascript:alert(2))\n\n\nThird';
    const { adapter } = setup({ body });
    const text = (await adapter.getMarket(refOf(FEE400))).rules.text.value;
    expect(text.split("\n").slice(0, 3)).toEqual(["First line <script>alert(1)</script>", "Second line [x](javascript:alert(2))", "Third"]);
    expect(/[‮​\u0000]/.test(text)).toBe(false);
  });

  it("cuts a very long rules text and says so", async () => {
    const body = detailBody();
    (body.rules as Rec).description = Array.from({ length: 400 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`).join("\n");
    const { adapter } = setup({ body });
    const text = (await adapter.getMarket(refOf(FEE400))).rules.text.value;
    expect(text.length).toBeLessThanOrEqual(8000 + " [truncated]".length);
    expect(text.endsWith(" [truncated]")).toBe(true);
  });

  it("reports text the decoder had to cut", async () => {
    const body = detailBody();
    (body.rules as Rec).description = "x".repeat(25_000);
    const { adapter } = setup({ body });
    const detailed = await adapter.getMarketDetail(refOf(FEE400));
    expect(detailed.notes).toContain("rules.description was longer than 20000 characters and was cut");
  });

  it("keeps hostile text out of every field except the untrusted slots", async () => {
    const body = detailBody();
    body.title = "<img src=x onerror=alert(1)>";
    body.slug = "x\"><svg onload=alert(2)>";
    (body.rules as Rec).description = "<iframe src=javascript:alert(3)>";
    ((body.outcomes as Rec[])[0] as Rec).title = "<a href=javascript:alert(4)>";
    body.resolutionSources = ["javascript:alert(5)"];
    const { adapter } = setup({ body });
    const market: Market = await adapter.getMarket(refOf(FEE400));
    const stripSlots = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(stripSlots);
      if (typeof value === "object" && value !== null) {
        if ((value as Rec).untrusted === true) return "[slot]";
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stripSlots(entry)]));
      }
      return value;
    };
    const outside = JSON.stringify(stripSlots(market));
    for (const needle of ["onerror", "onload", "iframe", "javascript", "alert", "<"]) expect(outside).not.toContain(needle);
  });
});
