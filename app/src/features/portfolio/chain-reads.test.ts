import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { padHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";

import { KNOWN_MARKETS } from "@sdk/chain/fixtures/scenarios";
import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_CTF_EXCHANGE } from "@sdk/chain/limitless/constants";
import {
  POLYMARKET_BINARY_MODULE,
  POLYMARKET_BINARY_MODULE_IMPLEMENTATION,
  POLYMARKET_CONDITIONAL_TOKENS,
  POLYMARKET_POSITION_MANAGER,
  POLYMARKET_POSITION_MANAGER_IMPLEMENTATION,
} from "@sdk/chain/polymarket/constants";
import { v2PositionParts } from "@sdk/chain/polymarket/reads";
import { CONDITIONAL_TOKENS as XO_CONDITIONAL_TOKENS, CTF_EXCHANGE as XO_CTF_EXCHANGE, USDC_E_ADDRESS } from "@shared/xo/chain/constants";

import { deriveKernelAccount } from "../../core/account";
import type { AddressBinding } from "../../core/bindings";
import type { MarketSummary, VenueId } from "../../core/ports";
import { DEFAULT_SWITCHES } from "../../core/venue-policy";
import { toDec, type Qty } from "../../core/money";
import { untrusted } from "../../core/untrusted";
import { manualClock } from "../wallet/testkit";
import { chainNetwork, type MemoryChain } from "./chain-testkit";
import { SCAN_WINDOW_BLOCKS, SCAN_WINDOWS } from "./chain-reads";
import { NOW, prov } from "./fixtures";
import { createPortfolioAdapters, readAll } from "./readers";
import { planReads } from "./targets";
import type { VenueReadOk, VenueReadOutcome } from "./types";

// The done-test of docs/sdk-and-api-design.md section 9 step 6: the Holdings view reads XO, Polymarket and Limitless
// positions from the chain with no venue API call. The chain is an in-memory double (chain-testkit.ts) serving the
// REAL runtime code of every pinned contract (the recordings in test/fixtures/chain-bytecode), so the pin checks run
// as they do live; the balances, results and transfers are this test's inputs. The token and condition ids are real
// ones from the venues' recorded market answers. HOLDER is a public test address.

const BYTECODE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "test", "fixtures", "chain-bytecode");
const codeOf = (folder: string, name: string): string => readFileSync(join(BYTECODE, folder, `${name}.hex`), "utf8").trim();
const slotOf = (address: string): string => padHex(address.toLowerCase() as Hex, { size: 32 });

const HOLDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const POLYGON = "polygon-bor-rpc.publicnode.com";
const BASE = "base-rpc.publicnode.com";
const XO = "rpc-mainnet-2.xo.market";
const HEAD = 90_000_000n;

function binding(overrides: Partial<AddressBinding> & { id: string }): AddressBinding {
  return { label: "Mine", kind: "venue_proxy", chain: "evm", address: HOLDER, status: "derived", venues: [], source: "pasted", ...overrides };
}

function summary(venue: VenueId, marketId: string, title: string, tokenIds: readonly string[], native: Record<string, string> = {}): MarketSummary {
  return {
    ref: { venue, marketId, native },
    title: untrusted(title),
    status: "active",
    closesAtUtc: null,
    outcomes: tokenIds.map((tokenId, index) => ({ index, role: index === 0 ? "yes" : "no", label: untrusted(index === 0 ? "Yes" : "No"), tokenId, displayPrice: null })),
    volume: { amount: null, unit: "unknown", windowHours: null },
    prov: { ...prov, venue },
  };
}

const dec = (qty: Qty | null | undefined): string | null => (qty === null || qty === undefined ? null : toDec(qty));

const ok = (outcome: VenueReadOutcome | undefined): VenueReadOk => {
  if (outcome === undefined || outcome.kind !== "ok") throw new Error(`expected ok, got ${JSON.stringify(outcome?.kind)}`);
  return outcome;
};

async function read(chains: Record<string, MemoryChain>, bindings: AddressBinding[], known: MarketSummary[], mode: "standalone" | "cockpit" = "standalone") {
  const net = chainNetwork(chains);
  const deps = { fetch: net.fetch, nowMs: manualClock(NOW).nowMs };
  const outcomes = await readAll({ deps, adapters: createPortfolioAdapters(deps, mode), mode, known }, planReads(bindings, DEFAULT_SWITCHES, mode));
  return { net, outcomes };
}

// ---- Polymarket ---------------------------------------------------------------------------------------------------------

const PLAIN = KNOWN_MARKETS.polymarketPlain;
const NEG = KNOWN_MARKETS.polymarketNegRisk;
const V2_NO = PLAIN.positionIds[1] as string;
const V2_CONDITION = (v2PositionParts(BigInt(V2_NO))?.conditionId ?? "0x") as string;
const SCANNED_ONLY = 777_000_001n;
const holderKey = HOLDER.toLowerCase();

function polygon(overrides: Partial<MemoryChain> = {}): MemoryChain {
  return {
    head: HEAD,
    code: {
      [POLYMARKET_CONDITIONAL_TOKENS.toLowerCase()]: codeOf("polygon", "polymarket-conditional-tokens"),
      [POLYMARKET_POSITION_MANAGER.toLowerCase()]: codeOf("polygon", "polymarket-position-manager"),
      [POLYMARKET_POSITION_MANAGER_IMPLEMENTATION.toLowerCase()]: codeOf("polygon", "polymarket-position-manager-implementation"),
      [POLYMARKET_BINARY_MODULE.toLowerCase()]: codeOf("polygon", "polymarket-binary-module"),
      [POLYMARKET_BINARY_MODULE_IMPLEMENTATION.toLowerCase()]: codeOf("polygon", "polymarket-binary-module-implementation"),
    },
    slots: {
      [POLYMARKET_POSITION_MANAGER.toLowerCase()]: slotOf(POLYMARKET_POSITION_MANAGER_IMPLEMENTATION),
      [POLYMARKET_BINARY_MODULE.toLowerCase()]: slotOf(POLYMARKET_BINARY_MODULE_IMPLEMENTATION),
    },
    balances: {
      [POLYMARKET_CONDITIONAL_TOKENS.toLowerCase()]: {
        [holderKey]: { [PLAIN.clobTokenIds[0] as string]: 2_500_000n, [NEG.clobTokenIds[0] as string]: 3_000_000n, [NEG.clobTokenIds[1] as string]: 10_000_000n, [SCANNED_ONLY.toString()]: 4_000_000n },
      },
      [POLYMARKET_POSITION_MANAGER.toLowerCase()]: { [holderKey]: { [V2_NO]: 1_000_000n } },
    },
    payouts: { [PLAIN.conditionId]: [0n, 0n], [NEG.conditionId]: [0n, 1n] },
    results: { [POLYMARKET_BINARY_MODULE.toLowerCase()]: { [V2_CONDITION]: [0n, 1_000_000n] } },
    transfers: [{ ledger: POLYMARKET_CONDITIONAL_TOKENS, to: HOLDER, id: SCANNED_ONLY, value: 4_000_000n, block: HEAD - 5n }],
    ...overrides,
  };
}

const polymarketKnown = [
  summary("polymarket", PLAIN.conditionId, "Plain market", PLAIN.clobTokenIds, { ledger: "ctf_v1", negRisk: "false" }),
  summary("polymarket", NEG.conditionId, "Negative-risk market", NEG.clobTokenIds, { ledger: "ctf_v1", negRisk: "true" }),
  summary("polymarket", PLAIN.conditionId, "The same market on Protocol V2", PLAIN.positionIds, { ledger: "protocol_v2", negRisk: "false" }),
];

describe("Polymarket holdings, from Polygon only", () => {
  it("asks only the Polygon RPC: no Gamma, no Data API, no CLOB", async () => {
    const { net, outcomes } = await read({ [POLYGON]: polygon() }, [binding({ id: "w", venues: ["polymarket"] })], polymarketKnown);
    ok(outcomes[0]);
    expect(new Set(net.hosts)).toEqual(new Set([POLYGON]));
    expect(new Set(net.methods)).toEqual(new Set(["eth_blockNumber", "eth_getCode", "eth_getStorageAt", "eth_getLogs", "eth_call"]));
  });

  it("lists each held token with the page's own title, its chain status and what a settled one pays", async () => {
    const { outcomes } = await read({ [POLYGON]: polygon() }, [binding({ id: "w", venues: ["polymarket"] })], polymarketKnown);
    const result = ok(outcomes[0]);
    const byToken = new Map(result.rows.map((row) => [row.tokenId, row]));
    const open = byToken.get(PLAIN.clobTokenIds[0] as string);
    expect(open?.status).toBe("open");
    expect(open?.market.value).toBe("Plain market");
    expect(dec(open?.qty)).toBe("2.5");
    expect(open?.value).toBeNull();
    expect(open?.valueNote).toMatch(/no price/);
    const won = byToken.get(NEG.clobTokenIds[1] as string);
    expect(won).toMatchObject({ status: "claimable", collateralSymbol: "USDC.e", claimSource: "settlement" });
    expect(dec(won?.claimable)).toBe("10");
    expect(byToken.get(NEG.clobTokenIds[0] as string)?.status).toBe("lost");
    const v2 = byToken.get(V2_NO);
    expect(v2).toMatchObject({ status: "claimable", collateralSymbol: "pUSD" });
    expect(dec(v2?.claimable)).toBe("1");
    // Found only by the transfer scan: listed by id, flagged, with no result the chain could name.
    const scanned = byToken.get(SCANNED_ONLY.toString());
    expect(scanned?.status).toBe("unknown");
    expect(scanned?.flags.join(" ")).toMatch(/Found only on chain/);
    expect(scanned?.market.value).toMatch(/not loaded on this page/);
    expect(result.rows).toHaveLength(5);
    expect(result.partial).toBe(false);
  });

  it("states the scanned range and that no venue API was asked", async () => {
    const { outcomes } = await read({ [POLYGON]: polygon() }, [binding({ id: "w", venues: ["polymarket"] })], polymarketKnown);
    const notes = ok(outcomes[0]).notes.join("\n");
    expect(notes).toMatch(/no venue API/);
    expect(notes).toContain(`newest ${(SCAN_WINDOW_BLOCKS * BigInt(SCAN_WINDOWS)).toString()} blocks`);
    expect(notes).toContain(`to ${HEAD.toString()}`);
  });

  it("reads nothing from a ledger whose code is not the pinned code, and says so", async () => {
    const chain = polygon();
    const changed = polygon({ code: { ...chain.code, [POLYMARKET_CONDITIONAL_TOKENS.toLowerCase()]: `${chain.code[POLYMARKET_CONDITIONAL_TOKENS.toLowerCase()] ?? ""}00` } });
    const { outcomes } = await read({ [POLYGON]: changed }, [binding({ id: "w", venues: ["polymarket"] })], polymarketKnown);
    const result = ok(outcomes[0]);
    expect(result.rows.every((row) => row.tokenId === V2_NO)).toBe(true);
    expect(result.partial).toBe(true);
    expect(result.notes.join(" ")).toMatch(/not the code pinned/);
  });

  it("an owner's own address is read as it is, with a note about the venue's wallets, and no profile lookup", async () => {
    const { net, outcomes } = await read({ [POLYGON]: polygon() }, [binding({ id: "o", kind: "eoa", venues: ["polymarket"] })], polymarketKnown);
    const result = ok(outcomes[0]);
    expect(result.resolution).toEqual({ source: "pasted", address: HOLDER, candidate: null });
    expect(result.notes.join(" ")).toMatch(/paste the Polymarket wallet/);
    expect(net.hosts.every((host) => host === POLYGON)).toBe(true);
  });
});

// ---- XO -----------------------------------------------------------------------------------------------------------------

describe("XO holdings, from XO's chain only", () => {
  const account = deriveKernelAccount(HOLDER);
  if (!account.ok) throw new Error("derive");
  const accountKey = account.account.toLowerCase();
  const first = KNOWN_MARKETS.xoResolved;
  const second = KNOWN_MARKETS.xoResolvedSecond;
  const xo = (): MemoryChain => ({
    head: 12_000_000n,
    code: { [XO_CONDITIONAL_TOKENS.toLowerCase()]: codeOf("xo", "xo-conditional-tokens") },
    balances: { [XO_CONDITIONAL_TOKENS.toLowerCase()]: { [accountKey]: { [first.tokenIds[0] as string]: 5_000_000n, [second.tokenIds[0] as string]: 2_000_000n } } },
    payouts: { [first.conditionId]: [1n, 0n], [second.conditionId]: [0n, 1n] },
    registry: { [XO_CTF_EXCHANGE.toLowerCase()]: { [second.tokenIds[0] as string]: second.conditionId } },
    erc20: { [USDC_E_ADDRESS.toLowerCase()]: { [accountKey]: 12_500_000n } },
    transfers: [{ ledger: XO_CONDITIONAL_TOKENS, to: account.account, id: BigInt(second.tokenIds[0] as string), value: 2_000_000n, block: 11_999_990n }],
  });

  it("reads the derived account's positions and cash on chain; a scanned token is placed by the exchange registry", async () => {
    const { net, outcomes } = await read({ [XO]: xo() }, [binding({ id: "o", kind: "eoa", venues: ["xo"] })], [summary("xo", first.conditionId, "First XO market", first.tokenIds)]);
    const result = ok(outcomes[0]);
    expect(new Set(net.hosts)).toEqual(new Set([XO]));
    expect(result.holder).toBe(account.account);
    const byToken = new Map(result.rows.map((row) => [row.tokenId, row]));
    expect(byToken.get(first.tokenIds[0] as string)).toMatchObject({ status: "claimable", collateralSymbol: "USDC.e" });
    expect(dec(byToken.get(first.tokenIds[0] as string)?.claimable)).toBe("5");
    // Not among the page's markets: the registry names its condition and the derivation confirms it; it lost.
    expect(byToken.get(second.tokenIds[0] as string)?.status).toBe("lost");
    expect(dec(result.facts[0]?.value)).toBe("12.5");
  });
});

// ---- Limitless -----------------------------------------------------------------------------------------------------------

describe("Limitless holdings, from Base only, in the standalone build", () => {
  const market = KNOWN_MARKETS.limitless;
  const base = (): MemoryChain => ({
    head: 50_000_000n,
    code: { [LIMITLESS_CONDITIONAL_TOKENS.toLowerCase()]: codeOf("base", "limitless-conditional-tokens") },
    balances: { [LIMITLESS_CONDITIONAL_TOKENS.toLowerCase()]: { [holderKey]: { [market.tokens[0] as string]: 7_000_000n } } },
    payouts: { [market.conditionId]: [0n, 0n] },
    registry: { [LIMITLESS_CTF_EXCHANGE.toLowerCase()]: { [market.tokens[0] as string]: market.conditionId, [market.tokens[1] as string]: market.conditionId } },
  });

  it("is read without the Cockpit, because only the public Base RPC is asked", async () => {
    const { net, outcomes } = await read({ [BASE]: base() }, [binding({ id: "w", kind: "eoa", venues: ["limitless"] })], [summary("limitless", "a-limitless-slug", "A Limitless market", market.tokens)]);
    const result = ok(outcomes[0]);
    expect(new Set(net.hosts)).toEqual(new Set([BASE]));
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ status: "open", tokenId: market.tokens[0], collateralSymbol: "USDC" });
    expect(result.rows[0]?.market.value).toBe("A Limitless market");
  });
});
