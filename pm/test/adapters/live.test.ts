// Opt-in live drift suite. NOT part of the gate: it is skipped unless PM_LIVE=1 and it needs the
// network. Public GET reads only, with the fixed research User-Agent, a handful of requests per
// venue, nothing written anywhere. Run it by hand to see whether a venue changed shape:
//
//   PM_LIVE=1 node_modules/.bin/tsx --test pm/test/adapters/live.test.ts
//
// Kalshi data carries restricted terms (memory only, no storage, no sharing), so its block also
// needs PM_LIVE_KALSHI=1 and the clause acknowledgement is computed from the current descriptor,
// which is what a user would be shown. Results are asserted in memory and never saved.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  RESEARCH_USER_AGENT,
  adapterDescriptor,
  createKalshiAdapter,
  createPolymarketAdapter,
  createXoAdapter,
} from "../../adapters/index.js";
import type { PmVenueAdapter } from "../../adapters/types.js";
import type { Book, TokenRef } from "../../types.js";

const LIVE = process.env["PM_LIVE"] === "1";
const LIVE_KALSHI = LIVE && process.env["PM_LIVE_KALSHI"] === "1";
const http = { userAgent: RESEARCH_USER_AGENT, deadlineMs: 15_000, attemptTimeoutMs: 8000 };

function assertSortedBook(book: Book): void {
  for (let i = 1; i < book.bids.length; i += 1) assert.ok(Number(book.bids[i - 1]?.price) > Number(book.bids[i]?.price), "bids descending");
  for (let i = 1; i < book.asks.length; i += 1) assert.ok(Number(book.asks[i - 1]?.price) < Number(book.asks[i]?.price), "asks ascending");
  const bid = book.bids[0];
  const ask = book.asks[0];
  if (bid !== undefined && ask !== undefined) assert.ok(Number(bid.price) < Number(ask.price), "not crossed");
}

async function firstBooks(adapter: PmVenueAdapter, tokens: TokenRef[]): Promise<Book[]> {
  const results = await adapter.getBooks(tokens, { deadlineMs: 20_000 });
  return results.flatMap((r) => (r.ok ? [r.value] : []));
}

describe("live drift: XO", { skip: !LIVE }, () => {
  const adapter = createXoAdapter({ http });

  it("health, list, detail and a book still decode", async () => {
    assert.equal((await adapter.health()).ok, true);
    const page = await adapter.listMarkets({ limit: 5 });
    assert.ok(page.items.length > 0);
    const first = page.items[0];
    assert.ok(first);
    const m = await adapter.getMarket(first.ref);
    assert.equal(m.outcomes.length, 2);
    assert.equal(m.tick, "0.001");
    assert.ok(["unknown", "curve_pq"].includes(m.fee.modelId));
    const books = await firstBooks(adapter, m.outcomes.map((o) => ({ venue: "xo" as const, tokenId: o.tokenId })));
    for (const b of books) assertSortedBook(b);
  });
});

describe("live drift: Polymarket", { skip: !LIVE }, () => {
  const adapter = createPolymarketAdapter({ http });

  it("keyset list, market, CLOB info and books still decode; best level is read from the sorted book", async () => {
    assert.equal((await adapter.health()).ok, true);
    const page = await adapter.listMarkets({ limit: 5 });
    assert.ok(page.items.length > 0);
    assert.equal(page.skipped.length, 0, "every listed row should be recognisable");
    const first = page.items[0];
    assert.ok(first);
    const m = await adapter.getMarket(first.ref);
    assert.equal(m.outcomes.length, 2);
    assert.ok(m.fee.modelId !== undefined);
    const books = await firstBooks(adapter, m.outcomes.map((o) => ({ venue: "polymarket" as const, tokenId: o.tokenId })));
    for (const b of books) assertSortedBook(b);
  });
});

describe("live drift: Kalshi (restricted terms, memory only)", { skip: !LIVE_KALSHI }, () => {
  const adapter = createKalshiAdapter(
    { enabled: true, acknowledgedClauseSha256: adapterDescriptor("kalshi", Date.now()).clauseSha256 },
    { http: { ...http, minIntervalMs: 500 } },
  );

  it("exchange status, list, market, fee_changes reading and batch-versus-single books", async () => {
    assert.equal((await adapter.health()).ok, true);
    const page = await adapter.listMarkets({ limit: 5 });
    assert.ok(page.items.length >= 2);
    const [a, b] = page.items;
    assert.ok(a && b);
    const m = await adapter.getMarket(a.ref);
    // The tolerant fee_changes reading must not be inconclusive on a live market.
    assert.ok(!m.extras.warnings.some((w) => w.includes("could not be read reliably")), m.extras.warnings.join("; "));
    const tokens: TokenRef[] = [a, b].map((x) => ({ venue: "kalshi" as const, tokenId: `${x.ref.marketId}:yes` }));
    const batch = await firstBooks(adapter, tokens);
    const single0 = await firstBooks(adapter, tokens.slice(0, 1));
    assert.ok(batch.length >= 1);
    if (batch[0] !== undefined && single0[0] !== undefined) {
      assert.deepEqual(batch[0].bids, single0[0].bids);
    }
    for (const book of batch) assertSortedBook(book);
  });
});
