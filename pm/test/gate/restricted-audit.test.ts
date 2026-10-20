// Integration gate: restricted-terms audit (Kalshi, Quotient) and address-pin checks.
// A sentinel string rides in every restricted body; after exercising the adapter, the signal parser
// and the recorder, no file under pm/ or in the OS temp area may contain it, and the pm/ tree must be
// byte-identical to before. Everything is offline: stub fetch plus loopback fake servers.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { getAddress } from "viem";
import { adapterDescriptor, createKalshiAdapter } from "../../adapters/index.js";
import { buildBundle, serializeBundle } from "../../links/bundle.js";
import { emptyRegistry } from "../../links/store.js";
import { runCli, type CliIo } from "../../recorder/main.js";
import { PAYMENT_PIN } from "../../signals/constants.js";
import { parseSignalBody } from "../../signals/index.js";
import { fast, nowMs, route, stubFetch } from "../adapters/helpers.js";
import { identityCandidate, leg, propose } from "../links/fixtures.js";
import { market, startWorld, tempDir, type World } from "../recorder/helpers.js";
import { FLAG_ON, NOW_MS } from "../signals/fixtures.js";

// Built from parts so this source file does not itself contain the sentinel text.
const SENTINEL = ["RESTRICTED", "SENTINEL", "9c41e7"].join("-");
const PM_ROOT = join(import.meta.dirname, "..", "..");

const worlds: World[] = [];
after(async () => {
  for (const w of worlds) await w.close();
});

function treeHash(root: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.set(full, createHash("sha256").update(readFileSync(full)).digest("hex"));
    }
  };
  walk(root);
  return out;
}

// Files created in the OS temp area during the test that contain the sentinel (any depth <= 3).
function sentinelFilesIn(root: string, depth = 0, hits: string[] = []): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(root);
  } catch {
    return hits;
  }
  for (const name of names) {
    const full = join(root, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // tsx keeps compiled copies of test sources (including older versions of this file) under tsx-<uid>.
      if (depth < 3 && !/^tsx-\d+$/.test(name)) sentinelFilesIn(full, depth + 1, hits);
    } else if (st.isFile() && st.size < 20_000_000) {
      try {
        if (readFileSync(full).includes(SENTINEL)) hits.push(full);
      } catch {
        // unreadable files (other users' temp files) cannot be ours
      }
    }
  }
  return hits;
}

const HOST = "external-api.kalshi.com";
const P = "/trade-api/v2";
const TICKER = "KXSENT-26DEC31-A";

test("restricted bodies (Kalshi adapter, Quotient parser, recorder with a Kalshi link) never reach disk", async () => {
  const before = treeHash(PM_ROOT);

  // Kalshi: enabled with the exact acknowledgement, fed a body that carries the sentinel everywhere.
  const ack = adapterDescriptor("kalshi", nowMs()).clauseSha256;
  const stub = stubFetch([
    route(HOST, `${P}/markets/${TICKER}`, {
      market: {
        ticker: TICKER, event_ticker: "KXSENT-26DEC31", market_type: "binary", status: "active",
        title: SENTINEL, yes_sub_title: SENTINEL, no_sub_title: SENTINEL, rules_primary: SENTINEL, rules_secondary: SENTINEL,
        open_time: "2026-10-01T00:00:00Z", close_time: "2026-12-31T23:00:00Z", expected_expiration_time: "2026-12-31T23:30:00Z",
        latest_expiration_time: "2027-01-07T23:00:00Z", can_close_early: true, exchange_index: 0, price_level_structure: "linear_cent",
        price_ranges: [{ start: "0.0000", end: "1.0000", step: "0.0100" }], yes_bid_dollars: "0.3800", yes_ask_dollars: "0.3900",
      },
    }),
    route(HOST, `${P}/events/KXSENT-26DEC31`, { event: { event_ticker: "KXSENT-26DEC31", series_ticker: "KXSENT", mutually_exclusive: true, settlement_sources: [{ name: SENTINEL, url: "https://example.com/s" }] } }),
    route(HOST, `${P}/series/KXSENT`, { series: { ticker: "KXSENT", fee_type: "quadratic", fee_multiplier: 1 } }),
    route(HOST, `${P}/series/fee_changes`, { series_fee_changes: [] }),
    route(HOST, `${P}/events/fee_changes`, { event_fee_changes: [] }),
    route(HOST, `${P}/markets/${TICKER}/orderbook`, { orderbook_fp: { yes_dollars: [["0.3800", "40"]], no_dollars: [["0.6100", "22"]] } }),
  ]);
  const kalshi = createKalshiAdapter({ enabled: true, acknowledgedClauseSha256: ack }, { http: fast(stub.fetchImpl), nowMs });
  const m = await kalshi.getMarket({ venue: "kalshi", marketId: TICKER, native: {} });
  assert.ok(m, "the market is held in memory only; the audit below is about disk");
  await kalshi.getBooks([{ venue: "kalshi", tokenId: `${TICKER}:yes` }], { deadlineMs: 5000 });
  assert.ok(stub.calls.length > 0, "the stub was exercised");

  // Quotient: a body with the sentinel in its free text (no Quotient row is committed, so the row is only the sentinel).
  const parsed = parseSignalBody(FLAG_ON, "mispriced", [{ question: SENTINEL }], { nowMs: NOW_MS });
  assert.equal(parsed.ok, true);

  // Recorder: a bundle with an XO/Polymarket link and a link with a Kalshi leg whose id carries the sentinel.
  const world = await startWorld([market("xo", "SYNTHETIC-xo-aaa", { fee: "600" }), market("polymarket", "SYNTHETIC-poly-bbb", { fee: "0.04" })]);
  worlds.push(world);
  const dir = tempDir();
  try {
    let reg = emptyRegistry();
    const a = leg("xo", "x");
    const b = leg("polymarket", "p", { rulesSha256: a.rulesSha256, maskedSha256: a.maskedSha256 });
    reg = propose(reg, identityCandidate("0001", { legs: [{ ...a, marketId: "SYNTHETIC-xo-aaa" }, { ...b, marketId: "SYNTHETIC-poly-bbb" }] })).registry;
    const x2 = leg("xo", "x2");
    const k = leg("kalshi", "k", { rulesSha256: x2.rulesSha256, maskedSha256: x2.maskedSha256 });
    reg = propose(reg, identityCandidate("0002", { legs: [x2, { ...k, marketId: `SYNTHETIC-${SENTINEL}` }] })).registry;
    const built = buildBundle(reg, { createdAt: "2026-10-20T00:00:00Z", includeCandidates: true });
    assert.ok(built.ok);
    if (!built.ok) throw new Error("bundle");
    const bundle = join(dir.path, "links.bundle.json");
    writeFileSync(bundle, serializeBundle(built.value));
    const cfg = join(dir.path, "cfg.json");
    writeFileSync(cfg, JSON.stringify({ hostBases: Object.fromEntries(Object.entries(world.hosts).map(([h, f]) => [h, f.base])), backoff: { baseMs: 1000, maxMs: 5000, factor: 2, jitter: 0, maxAttempts: 2 } }));
    const db = join(dir.path, "rec.sqlite");
    const out: string[] = [];
    const io: CliIo = { out: (l) => out.push(l), err: (l) => out.push(l), clock: world.clock, allowSynthetic: true };
    assert.equal(await runCli(["once", "--db", db, "--bundle", bundle, "--pin", built.value.manifestSha256, "--config", cfg], io), 0, out.join("\n"));
    let bytes = "";
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(db + suffix)) bytes += readFileSync(db + suffix).toString("latin1");
    assert.ok(bytes.length > 1000, "the recorder wrote its database");
    assert.equal(bytes.includes(SENTINEL), false, "no restricted id or text in the recorder database");
    // The input bundle legitimately names the Kalshi leg; every other file the run created must not.
    assert.deepEqual(sentinelFilesIn(dir.path).filter((f) => f !== bundle), [], "no recorder output file holds the sentinel");
  } finally {
    dir.remove();
  }

  const after = treeHash(PM_ROOT);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((f) => before.get(f) !== after.get(f));
  assert.deepEqual(changed, [], "pm/ is byte-identical after the run");
  assert.deepEqual(sentinelFilesIn(PM_ROOT), [], "no file under pm/ holds a restricted body");
  assert.deepEqual(sentinelFilesIn(tmpdir()), [], "no temp file holds a restricted body");
});

test("pinned x402 addresses are lowercase forms of valid EIP-55 addresses", () => {
  for (const a of [PAYMENT_PIN.asset, PAYMENT_PIN.payTo]) {
    assert.match(a, /^0x[0-9a-f]{40}$/);
    assert.equal(getAddress(a).toLowerCase(), a);
  }
  // USDC on Base, the well-known checksummed form.
  assert.equal(getAddress(PAYMENT_PIN.asset), "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
});

test("the audit itself detects a leak (failing-case check on the scanner and the tree diff)", () => {
  const dir = tempDir();
  try {
    const f = join(dir.path, "leak.txt");
    writeFileSync(f, `x ${SENTINEL} y`);
    assert.deepEqual(sentinelFilesIn(dir.path), [f]);
    const before = treeHash(dir.path);
    writeFileSync(join(dir.path, "new.txt"), "n");
    assert.notDeepEqual([...treeHash(dir.path).keys()], [...before.keys()]);
  } finally {
    dir.remove();
  }
});
