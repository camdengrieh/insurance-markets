import { describe, expect, it } from "vitest";

import type { AddressBinding } from "../../core/bindings";
import { FetchError } from "../../core/fetch";
import { toDec } from "../../core/money";
import type { AdapterDeps, AdapterError, Book, Result, TokenRef } from "../../core/ports";
import { DEFAULT_SWITCHES } from "../../core/venue-policy";
import type { VenuePosition } from "@sdk/venues/pascal";
import { fakeNetwork, manualClock, type FakeNetwork } from "../wallet/testkit";
import { book as makeBook, must, NOW, prov } from "./fixtures";
import { createPortfolioAdapters, markWithBids, MAX_MARKED_ROWS_PER_VENUE, readAll, type PortfolioAdapters, type ReadContext } from "./readers";
import { planReads } from "./targets";
import { FLAG_READS_DISAGREE } from "./xo-reads";
import type { VenueReadOk, VenueReadOutcome } from "./types";
import { row as makeRowFixture } from "./fixtures";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const SOLANA = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

function binding(overrides: Partial<AddressBinding> & { id: string }): AddressBinding {
  return { label: "Mine", kind: "eoa", chain: "evm", address: OWNER, status: "derived", venues: ["polymarket"], source: "pasted", ...overrides };
}

const ok = (outcome: VenueReadOutcome | undefined): VenueReadOk => {
  if (outcome === undefined || outcome.kind !== "ok") throw new Error(`expected ok, got ${outcome?.kind ?? "nothing"}`);
  return outcome;
};

function context(net: FakeNetwork, adapters?: Partial<PortfolioAdapters>, mode: "standalone" | "cockpit" = "cockpit"): ReadContext {
  const deps: AdapterDeps = { fetch: net.fetch, nowMs: manualClock(NOW).nowMs };
  return { deps, adapters: { ...createPortfolioAdapters(deps, mode), ...adapters }, mode };
}

// XO, Polymarket and Limitless are read from the chain alone: chain-reads.test.ts.

// ---- isolation (M2-6) ----------------------------------------------------------------------------------------------------

describe("M2-6: one venue failing leaves the others rendering", () => {

  it("an adapter that throws something unknown becomes a failed outcome for its own venue only", async () => {
    const adapters: Partial<PortfolioAdapters> = {
      pascal: () => ({
        positionsByAddress: async () => {
          throw new Error("<script>alert(1)</script> not an adapter error");
        },
      }),
      trueo: () => ({ positionsByAddress: async () => ({ positions: [], unmarked: 0, claims: [], scanned: 0, skipped: [] }) }),
    };
    const planned = planReads(
      [binding({ id: "s", kind: "solana", chain: "solana", address: SOLANA, venues: ["pascal"] }), binding({ id: "e", venues: ["trueo"] })],
      DEFAULT_SWITCHES,
      "cockpit",
    );
    const outcomes = await readAll(context(fakeNetwork({}), adapters), planned);
    expect(outcomes[0]).toMatchObject({ kind: "failed", venue: "pascal", code: "UNKNOWN" });
    expect(JSON.stringify(outcomes[0], (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value))).not.toContain("script");
    expect(outcomes[1]).toMatchObject({ kind: "ok", venue: "trueo" });
  });

  it("a venue that is reachable only through the Cockpit becomes 'needs the Cockpit', not a failure", async () => {
    const adapters: Partial<PortfolioAdapters> = {
      trueo: () => ({
        positionsByAddress: async () => {
          throw new FetchError("needs_cockpit", "blocked in browsers", { service: "rpc_base" });
        },
      }),
    };
    const [outcome] = await readAll(context(fakeNetwork({}), adapters, "standalone"), planReads([binding({ id: "e", venues: ["trueo"] })], DEFAULT_SWITCHES, "standalone"));
    expect(outcome).toMatchObject({ kind: "needs_cockpit", venue: "trueo" });
  });

  it("a Cockpit build with no session is 'not paired', not a venue failure", async () => {
    const adapters: Partial<PortfolioAdapters> = {
      trueo: () => ({
        positionsByAddress: async () => {
          throw new FetchError("unauthorized", "the Cockpit is not paired", { service: "rpc_base" });
        },
      }),
    };
    const [outcome] = await readAll(context(fakeNetwork({}), adapters), planReads([binding({ id: "e", venues: ["trueo"] })], DEFAULT_SWITCHES, "cockpit"));
    expect(outcome).toMatchObject({ kind: "not_paired", venue: "trueo" });
  });

  it("skipped plans come back as their own outcomes, in order, with no request", async () => {
    const net = fakeNetwork({});
    const planned = planReads([binding({ id: "a", venues: ["kalshi", "hyperliquid"] })], DEFAULT_SWITCHES, "cockpit");
    const outcomes = await readAll(context(net), planned);
    expect(outcomes.map((outcome) => outcome.kind)).toEqual(["off", "unsupported"]);
    expect(net.calls).toHaveLength(0);
  });
});

// ---- Pascal and Trueo (positions arrive marked from their adapters) -------------------------------------------------------

function sharedPosition(overrides: Partial<VenuePosition> & { id: string }): VenuePosition {
  return {
    holder: { bindingId: "b" },
    market: { venue: "pascal", marketId: "BTC-UP", native: {} },
    outcome: { index: 0, role: "yes", tokenId: "BTC-UP#long" },
    shape: "long_short",
    qty: "12",
    qtyUnit: "contracts_1usd",
    free: null,
    reserved: null,
    cost: { total: null, avg: null, fees: null, source: "unknown" },
    mark: { price: "0.4", basis: "bid", asOfMs: NOW },
    value: "4.8",
    pnl: { realized: null, unrealized: null, total: null, source: "unavailable" },
    status: "open",
    collateral: { symbol: "USDC", chain: "solana:x", decimals: 6, custody: "self" },
    prov: { ...prov, venue: "pascal" },
    ...overrides,
  };
}

describe("Pascal and Trueo rows", () => {
  const pascalAdapters = (positions: VenuePosition[], registered = true): Partial<PortfolioAdapters> => ({
    pascal: () => ({
      positionsByAddress: async () => ({
        registered,
        account: registered ? { collateralUsd: "100", pendingDepositsUsd: null } : null,
        positions,
        unmarked: 0,
        shape: "synthetic" as const,
        prov: { ...prov, venue: "pascal" },
      }),
    }),
  });
  const plan = () => planReads([binding({ id: "s", kind: "solana", chain: "solana", address: SOLANA, venues: ["pascal"] })], DEFAULT_SWITCHES, "cockpit");

  it("an open Pascal position keeps the adapter's bid mark as its value, in USDC", async () => {
    const result = ok((await readAll(context(fakeNetwork({}), pascalAdapters([sharedPosition({ id: "p1" })])), plan()))[0]);
    const row = must(result.rows[0]);
    expect(row.status).toBe("open");
    expect(toDec(must(row.value))).toBe("4.8");
    expect(row.collateralSymbol).toBe("USDC");
    expect(row.qty?.unit).toBe("contracts");
    expect(row.shape).toBe("synthetic-shape tested");
    expect(result.facts.map((fact) => [fact.label, fact.value === null ? null : toDec(fact.value)])).toEqual([
      ["Pascal collateral", "100"],
      ["Pascal pending deposits", null],
    ]);
  });

  it("a position with no executable mark has no value and says why (never 0)", async () => {
    const unmarked = sharedPosition({ id: "p2", mark: { price: null, basis: "none", asOfMs: NOW }, value: null });
    const row = must(ok((await readAll(context(fakeNetwork({}), pascalAdapters([unmarked])), plan()))[0]).rows[0]);
    expect(row.value).toBeNull();
    expect(row.valueNote).toMatch(/No executable price/);
  });

  it("an account Pascal does not know is an answer with no rows, not an error", async () => {
    const result = ok((await readAll(context(fakeNetwork({}), pascalAdapters([], false)), plan()))[0]);
    expect(result.rows).toEqual([]);
    expect(result.notListed.join(" ")).toMatch(/no account/);
  });

  it("a claimed position is not listed; a settled one counts as claimable, not as value", async () => {
    const positions = [
      sharedPosition({ id: "c1", status: "claimed" }),
      sharedPosition({ id: "c2", status: "claimable", mark: { price: "1", basis: "settlement", asOfMs: NOW }, value: "12" }),
    ];
    const result = ok((await readAll(context(fakeNetwork({}), pascalAdapters(positions)), plan()))[0]);
    expect(result.rows.map((row) => row.id)).toEqual(["c2"]);
    const row = must(result.rows[0]);
    expect(toDec(must(row.claimable))).toBe("12");
    expect(row.claimSource).toBe("settlement");
    expect(row.value).toBeNull();
  });

  it("Trueo amounts are TYD, never dollars, and a venue that disagrees with the balances is flagged", async () => {
    const trueoPosition = sharedPosition({
      id: "t1",
      market: { venue: "trueo", marketId: "8453:0x0000000000000000000000000000000000000001", native: {} },
      outcome: { index: 0, role: "yes", tokenId: "0x0000000000000000000000000000000000000002" },
      shape: "token_holding",
      qty: "100",
      qtyUnit: "shares",
      value: "37.5",
      collateral: { symbol: "TYD", chain: "eip155:8453", decimals: 6, custody: "self" },
      prov: { ...prov, venue: "trueo" },
    });
    const adapters: Partial<PortfolioAdapters> = {
      trueo: () => ({
        positionsByAddress: async () => ({
          positions: [trueoPosition],
          unmarked: 0,
          claims: [{ marketId: "8453:0x0000000000000000000000000000000000000001", claimableTyd: null, venuePositionAgrees: false }],
          scanned: 3,
          skipped: [{ marketId: "x", reason: "not_active" } as never],
        }),
      }),
    };
    const result = ok((await readAll(context(fakeNetwork({}), adapters), planReads([binding({ id: "e", venues: ["trueo"] })], DEFAULT_SWITCHES, "cockpit")))[0]);
    const row = must(result.rows[0]);
    expect(row.collateral).toBe("tyd");
    expect(row.collateralSymbol).toBe("TYD");
    expect(row.value?.unit).toBe("tyd");
    expect(row.flags.join(" ")).toMatch(/differs from the token balances/);
    expect(result.partial).toBe(true);
    expect(result.notes.join(" ")).toMatch(/not in dollars/);
  });
});

// ---- marking ---------------------------------------------------------------------------------------------------------------

describe("markWithBids", () => {
  const rows = (count: number) => Array.from({ length: count }, (_, index) => makeRowFixture({ id: `r${index}`, qty: "10" }));
  const fetchBooks = (answer: (token: TokenRef) => Result<Book, AdapterError>) => async (tokens: TokenRef[]) => tokens.map(answer);

  it("prices at most MAX_MARKED_ROWS_PER_VENUE rows and says why the rest are not priced", async () => {
    const asked: number[] = [];
    const marked = await markWithBids(
      rows(MAX_MARKED_ROWS_PER_VENUE + 5),
      "polymarket",
      async (tokens) => {
        asked.push(tokens.length);
        return tokens.map(() => ({ ok: true as const, value: makeBook([["0.5", "1"]]) }));
      },
      NOW,
      "n/a",
    );
    expect(asked).toEqual([MAX_MARKED_ROWS_PER_VENUE]);
    expect(marked.filter((row) => row.value !== null)).toHaveLength(MAX_MARKED_ROWS_PER_VENUE);
    expect(marked.filter((row) => row.value === null).every((row) => /first 40/.test(row.valueNote ?? ""))).toBe(true);
  });

  it("only open rows are priced; settled rows are left alone", async () => {
    const input = [makeRowFixture({ id: "o", status: "open" }), makeRowFixture({ id: "c", status: "claimable", claimable: "5" })];
    const marked = await markWithBids(input, "polymarket", fetchBooks(() => ({ ok: true, value: makeBook([["0.5", "1"]]) })), NOW, "n/a");
    expect(marked[0]?.value).not.toBeNull();
    expect(marked[1]).toEqual(input[1]);
  });

  it("an error per token leaves the others priced, and a thrown fetch becomes a note on every row", async () => {
    const input = [makeRowFixture({ id: "a" }), makeRowFixture({ id: "b" })];
    const partial = await markWithBids(input, "polymarket", fetchBooks((token) => (token.tokenId === "token-a" ? { ok: false, error: "EMPTY_BOOK" } : { ok: true, value: makeBook([["0.5", "1"]]) })), NOW, "n/a");
    expect(partial[0]?.value).toBeNull();
    expect(partial[0]?.valueNote).toMatch(/No price/);
    expect(partial[1]?.value).not.toBeNull();
    const thrown = await markWithBids(input, "polymarket", async () => {
      throw new FetchError("needs_cockpit", "x");
    }, NOW, "n/a");
    expect(thrown.every((row) => row.value === null && /Cockpit/.test(row.valueNote ?? ""))).toBe(true);
  });

  it("a row flagged because XO's two reads disagree is neither priced nor looked up", async () => {
    const flagged = makeRowFixture({ id: "f", flags: [FLAG_READS_DISAGREE] });
    const clean = makeRowFixture({ id: "c" });
    const asked: string[] = [];
    const marked = await markWithBids([flagged, clean], "xo", async (tokens) => {
      asked.push(...tokens.map((token) => token.tokenId));
      return tokens.map(() => ({ ok: true as const, value: makeBook([["0.5", "1"]]) }));
    }, NOW, "n/a");
    expect(asked).toEqual(["token-c"]);
    expect(marked[0]?.value).toBeNull();
    expect(marked[0]?.valueNote).toBe(FLAG_READS_DISAGREE);
    expect(marked[1]?.value).not.toBeNull();
  });

  it("without a book source every open row says why, and none gets a value", async () => {
    const marked = await markWithBids(rows(3), "xo", null, NOW, "Books need the Cockpit.");
    expect(marked.every((row) => row.value === null && row.valueNote === "Books need the Cockpit.")).toBe(true);
  });

  it("a row whose size or token is unknown is not priced", async () => {
    const [sizeless] = await markWithBids([makeRowFixture({ id: "x", qty: null })], "polymarket", fetchBooks(() => ({ ok: true, value: makeBook([["0.5", "1"]]) })), NOW, "n/a");
    expect(sizeless?.value).toBeNull();
    expect(sizeless?.valueNote).toMatch(/not known/);
  });
});
