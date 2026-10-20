// Seeded property tests for pm_check_structure. Independent integer maths for the Polymarket
// curve fee (rate 0.04, prices on a 0.001 grid) cross-checks the exact-rational pipeline.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkStructure, type StructureFinding, type StructureResult } from "../../ops/structure.js";
import { structureOutputSchema } from "../../ops/structure-schema.js";
import { int, prng } from "../core/helpers.js";
import { DAY_MS, FRICTIONLESS, NOW_MS, group, member, poly, type Levels } from "./structure-helpers.js";

function ok(g: Parameters<typeof checkStructure>[0], o: Parameters<typeof checkStructure>[1] = {}): StructureResult {
  const r = checkStructure(g, o, NOW_MS);
  assert.equal(r.ok, true, r.ok ? "" : `${r.error}: ${r.detail ?? ""}`);
  const v = (r as { ok: true; value: StructureResult }).value;
  assert.equal(structureOutputSchema.safeParse(v).success, true);
  return v;
}

// units of 1e-8 to a trimmed signed decimal string
function fromUnits(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / 100_000_000n;
  const frac = (abs % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  const body = frac === "" ? `${whole}` : `${whole}.${frac}`;
  return negative && body !== "0" ? `-${body}` : body;
}

const px = (ticks: number): string => (ticks / 1000).toFixed(3);

interface Gen {
  readonly ticks: number[];
  readonly sizes: number[];
}

function genSet(rand: () => number, n: number): Gen {
  return {
    ticks: Array.from({ length: n }, () => int(rand, 20, 950)),
    sizes: Array.from({ length: n }, () => int(rand, 1, 500)),
  };
}

const build = (g: Gen, rate = "0.04", over: Parameters<typeof group>[1] = {}) =>
  group(
    g.ticks.map((t, i) => {
      const bid = px(Math.max(1, t - 10));
      return member(`o${i}`, { fee: poly(rate), yes: { bids: [[bid, "1000"]], asks: [[px(t), String(g.sizes[i])]] } });
    }),
    { resolutionAtMs: NOW_MS + DAY_MS, ...over },
  );

test("property: partition long net equals independent integer maths (200 random sets)", () => {
  const rand = prng(20261020);
  for (let iter = 0; iter < 200; iter += 1) {
    const g = genSet(rand, int(rand, 2, 6));
    const sumK = g.ticks.reduce((a, t) => a + t, 0);
    const sumCurve = g.ticks.reduce((a, t) => a + t * (1000 - t), 0);
    const units = 100_000_000n - BigInt(sumK) * 100_000n - 4n * BigInt(sumCurve);
    const r = ok(build(g), FRICTIONLESS);
    const f = r.findings.find((x) => x.id === "partition:long");
    assert.ok(f);
    assert.equal(f.top?.net, fromUnits(units), `iter ${iter}`);
    // net > 0 means a candidate; otherwise the mid may still alert but never a candidate
    assert.equal(f.verdict === "candidate", units > 0n, `iter ${iter} units ${units}`);
    if (f.verdict === "candidate") {
      const qty = BigInt(Math.min(...g.sizes));
      assert.equal(f.depth?.qty, qty.toString());
      assert.equal(f.depth?.net, fromUnits(units * qty), `iter ${iter}`);
    }
  }
});

test("property: labels respect their definition on random sets", () => {
  const rand = prng(7);
  let structural = 0;
  let candidates = 0;
  for (let iter = 0; iter < 400; iter += 1) {
    const g = genSet(rand, int(rand, 2, 5));
    // Cheap sets (asks well under 1 in total) are the ones that can clear fees.
    const cheap: Gen = { ticks: g.ticks.map((t) => Math.max(20, Math.floor(t / 3))), sizes: g.sizes };
    const grp = build(rand() % 2 === 0 ? cheap : g, "0.04", { resolutionAtMs: rand() % 3 === 0 ? null : NOW_MS + int(rand, 1, 90) * DAY_MS });
    const r = ok(grp, { reservePerShare: String(int(rand, 0, 3) / 1000), tau: String(int(rand, 0, 5) / 1000) });
    for (const f of r.findings) {
      if (f.verdict === "candidate") candidates += 1;
      if (f.label === "structural_violation") {
        structural += 1;
        assert.equal(f.verdict, "candidate");
        assert.deepEqual(f.reasons, []);
        assert.equal(f.booksNative, true);
        assert.ok(f.depth !== null && f.basis === "depth_walk_after_fees");
      }
      if (f.verdict === "no_edge" || f.verdict === "unavailable") assert.equal(f.label, null);
      if (f.verdict === "candidate") assert.ok(f.top && !f.top.net.startsWith("-") && f.top.net !== "0");
      assert.ok(f.label === null || f.label === "structural_violation" || f.label === "indicative_discrepancy");
    }
  }
  // The generator must actually reach both branches, or the assertions above prove nothing.
  assert.ok(structural > 0 && candidates > structural, `structural ${structural}, candidates ${candidates}`);
});

test("property: a higher fee rate never raises the net edge", () => {
  const rand = prng(99);
  for (let iter = 0; iter < 100; iter += 1) {
    const g = genSet(rand, int(rand, 2, 5));
    const net = (rate: string): number => {
      const f = ok(build(g, rate), FRICTIONLESS).findings.find((x) => x.id === "partition:long");
      assert.ok(f?.top);
      return Number(f.top.net);
    };
    const [n0, n4, n7] = [net("0"), net("0.04"), net("0.07")];
    assert.ok(n0 >= n4 && n4 >= n7, `${n0} ${n4} ${n7}`);
  }
});

test("property: shuffling the members does not change the partition numbers", () => {
  const rand = prng(5);
  for (let iter = 0; iter < 60; iter += 1) {
    const grp = build(genSet(rand, int(rand, 2, 6)));
    const shuffled = [...grp.members];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = rand() % (i + 1);
      const a = shuffled[i];
      const b = shuffled[j];
      if (a !== undefined && b !== undefined) {
        shuffled[i] = b;
        shuffled[j] = a;
      }
    }
    const a = ok(grp, FRICTIONLESS).findings.find((x) => x.id === "partition:long");
    const b = ok({ ...grp, members: shuffled }, FRICTIONLESS).findings.find((x) => x.id === "partition:long");
    assert.deepEqual(a?.top, b?.top);
    assert.deepEqual(a?.depth, b?.depth);
    assert.equal(a?.verdict, b?.verdict);
  }
});

test("property: a stale member always blocks both partition baskets and shows no numbers", () => {
  const rand = prng(11);
  for (let iter = 0; iter < 60; iter += 1) {
    const g = genSet(rand, int(rand, 2, 6));
    const grp = build(g);
    const victim = rand() % grp.members.length;
    const members = grp.members.map((m, i) =>
      i === victim && m.yes !== null && m.no !== undefined ? { ...m, yes: { ...m.yes, asOfMs: NOW_MS - 61_000 } } : m,
    );
    const r = ok({ ...grp, members }, FRICTIONLESS);
    for (const id of ["partition:long", "partition:short"]) {
      const f = r.findings.find((x) => x.id === id);
      assert.ok(f);
      assert.equal(f.verdict, "unavailable");
      assert.equal(f.top, null);
      assert.equal(f.label, null);
      assert.ok(f.reasons.includes(`stale:m${victim}`), f.reasons.join(","));
    }
    assert.equal(r.partition?.sumAsk, null);
  }
});

test("property: a non-exhaustive set never produces a buy-every-YES finding with numbers", () => {
  const rand = prng(3);
  for (let iter = 0; iter < 100; iter += 1) {
    const g = genSet(rand, int(rand, 2, 6));
    for (const exhaustive of ["no", "unknown"] as const) {
      const r = ok(build(g, "0", { exhaustive, kind: rand() % 2 === 0 ? "neg_risk" : "mutually_exclusive" }), FRICTIONLESS);
      assert.equal(r.partition?.expectedSum, "at_most_1");
      const long = r.findings.find((x) => x.direction === "buy_all_yes");
      assert.ok(long);
      assert.equal(long.verdict, "unavailable");
      assert.equal(long.top, null);
      assert.equal(long.midGap, null);
    }
  }
});

test("property: complement findings are never structural (a mirrored-book gap is a suspect print)", () => {
  const rand = prng(13);
  for (let iter = 0; iter < 200; iter += 1) {
    const mk = (id: string) => {
      const yb = int(rand, 5, 900);
      const ya = yb + int(rand, 1, 80);
      const nb = int(rand, 5, 900);
      const na = nb + int(rand, 1, 80);
      const lv = (t: number): Levels => [[px(Math.min(t, 990)), "50"]];
      return member(id, { yes: { bids: lv(yb), asks: lv(Math.min(ya, 990)) }, no: { bids: lv(nb), asks: lv(Math.min(na, 990)) } });
    };
    const r = ok(group([mk("a"), mk("b"), mk("c")], { resolutionAtMs: NOW_MS + DAY_MS }), { ...FRICTIONLESS, checks: ["complement"] });
    for (const f of r.findings) {
      assert.notEqual(f.label, "structural_violation");
      assert.equal(f.check, "complement");
    }
  }
});

test("property: arbitrary garbage books never throw and always satisfy the output schema", () => {
  const rand = prng(424242);
  const garbagePrice = (): string => {
    const pick = rand() % 9;
    if (pick === 0) return "0";
    if (pick === 1) return "1";
    if (pick === 2) return "1.5";
    return px(int(rand, 1, 999));
  };
  const levels = (): Levels => Array.from({ length: int(rand, 0, 4) }, () => [garbagePrice(), String(int(rand, 0, 100))] as const);
  for (let iter = 0; iter < 300; iter += 1) {
    const n = int(rand, 1, 7);
    const members = Array.from({ length: n }, (_, i) =>
      member(`g${i}`, {
        yes: rand() % 8 === 0 ? null : { bids: levels(), asks: levels() },
        ...(rand() % 2 === 0 ? { no: { bids: levels(), asks: levels() } } : {}),
        ...(rand() % 4 === 0 ? { asOfMs: NOW_MS - int(rand, 0, 200_000) } : {}),
        ...(rand() % 5 === 0 ? { rung: { strike: String(int(rand, 1, 5)), deadlineMs: NOW_MS + int(rand, 1, 3) * DAY_MS, direction: "above" as const, kind: rand() % 2 === 0 ? ("terminal" as const) : ("touch" as const) } } : {}),
      }),
    );
    const grp = group(members, {
      kind: (["neg_risk", "mutually_exclusive", "event", "series"] as const)[rand() % 4] ?? "event",
      exhaustive: (["proven", "by_rule", "no", "unknown"] as const)[rand() % 4] ?? "unknown",
      membersComplete: rand() % 3 !== 0,
      resolutionAtMs: rand() % 4 === 0 ? null : NOW_MS + int(rand, 1, 100) * DAY_MS,
    });
    const r = ok(grp, { tau: String(int(rand, 0, 20) / 1000) });
    const labelled: StructureFinding[] = r.findings.filter((f) => f.label !== null);
    for (const f of labelled) assert.ok(f.verdict === "candidate" || f.verdict === "mid_gap_only");
  }
});
