import { describe, expect, it } from "vitest";

import { binaryPositionIds } from "./ctf.js";
import { loadRecording, replayPort } from "./fixtures/load.js";
import { KNOWN_MARKETS, limitlessScenario, polymarketScenario, xoScenario, type ScenarioResult } from "./fixtures/scenarios.js";
import { POLYMARKET_PINS, POLYMARKET_USDC_E, POLYMARKET_WRAPPED_COLLATERAL } from "./polymarket/constants.js";
import { polymarketTargets, v2PositionParts } from "./polymarket/reads.js";
import { LIMITLESS_PINS, LIMITLESS_USDC } from "./limitless/constants.js";
import { USDC_E_ADDRESS } from "./xo/constants.js";
import { XO_PINS } from "./xo/pins.js";
import { xoTargets } from "./xo/positions.js";
import type { Hex } from "./rpc.js";

// The position, fill and resolution readers of the three venues, over JSON-RPC answers recorded from the public RPCs on
// 2026-10-22 (fixtures/scenarios.ts says what was read and why; test/fixtures/chain-recordings/capture.ts recorded
// it). The replay refuses any request that was not recorded, so these also pin what the readers send.

const scenarios: ReadonlyArray<[string, "polymarket" | "limitless" | "xo", (port: ReturnType<typeof replayPort>["port"], inputs: { block: string; fillBlocks: string }) => Promise<ScenarioResult>]> = [
  ["Polymarket (Polygon 137)", "polymarket", polymarketScenario],
  ["Limitless (Base 8453)", "limitless", limitlessScenario],
  ["XO (chain 3223)", "xo", xoScenario],
];

describe.each(scenarios)("%s, replayed", (_label, venue, run) => {
  const recording = loadRecording(venue);

  it("was recorded from the RPC the dApp names, and says so", () => {
    expect(recording.captured_at).toBe("2026-10-22");
    expect(recording.source).toMatch(/read-only JSON-RPC/);
    expect(recording.exchanges.length).toBeGreaterThan(10);
    // Nothing that writes or signs, and no open log range.
    for (const exchange of recording.exchanges) expect(["eth_blockNumber", "eth_call", "eth_getCode", "eth_getLogs", "eth_getStorageAt"]).toContain(exchange.method);
    for (const exchange of recording.exchanges.filter((e) => e.method === "eth_getLogs")) {
      const filter = (exchange.params as Array<{ fromBlock: string; toBlock: string }>)[0];
      expect(filter?.toBlock).toMatch(/^0x[0-9a-f]+$/);
      expect(BigInt(filter?.toBlock ?? "0x0") - BigInt(filter?.fromBlock ?? "0x0")).toBeLessThan(10_000n);
    }
  });

  it("decodes every OrderFilled log of the recorded range from the pinned exchange", async () => {
    const { port } = replayPort(recording);
    const result = await run(port, recording.inputs);
    expect(result.fills.length).toBeGreaterThan(0);
    expect(result.fillsComplete).toBe(true);
    for (const fill of result.fills) {
      expect(fill.makerAmountFilled > 0n || fill.takerAmountFilled > 0n).toBe(true);
      expect(fill.blockNumber <= BigInt(recording.inputs.block)).toBe(true);
      expect(fill.tokenId > 0n).toBe(true);
    }
    expect(result.holder).not.toBeNull();
  });

  it("checks the ledger's pinned code before reading, and reads a non-zero balance for the token the holder bought", async () => {
    const { port, sent } = replayPort(recording);
    const result = await run(port, recording.inputs);
    expect(result.positions?.refused).toEqual([]);
    expect(sent).toContain("eth_getCode");
    const bought = result.fills.find((fill) => fill.maker === result.holder)?.tokenId;
    const held = result.positions?.positions.find((position) => position.target.tokenId === bought);
    expect(held?.balance ?? 0n).toBeGreaterThan(0n);
  });

  it("resolves positions from the chain: open markets are unresolved, resolved ones carry the contract's payout", async () => {
    const { port } = replayPort(recording);
    const result = await run(port, recording.inputs);
    for (const position of result.positions?.positions ?? []) {
      if (position.resolution.state === "resolved") {
        expect(position.resolution.numerator <= position.resolution.denominator).toBe(true);
        expect(position.resolution.denominator > 0n).toBe(true);
      }
    }
    // The newest ConditionResolution in the recorded window, decoded from the log, equals the stored payouts.
    const first = result.resolutions[0];
    expect(first).toBeDefined();
    const stored = result.resolvedPayouts.get(first?.conditionId as Hex) as { state: string; numerators: readonly bigint[] } | null;
    expect(stored?.state).toBe("resolved");
    expect(stored?.numerators).toEqual(first?.payoutNumerators);
  });

  it("finds token ids by a bounded scan of transfers to the holder, and says the scan was complete", async () => {
    const { port } = replayPort(recording);
    const result = await run(port, recording.inputs);
    expect(result.scan?.complete).toBe(true);
    expect(result.scan?.requests).toBe(1);
    expect(result.scan?.toBlock).toBe(BigInt(recording.inputs.block));
    expect((result.scan?.tokenIds.length ?? 0) > 0).toBe(true);
  });

  it("derives the venue's token ids exactly as the deployed Conditional Tokens computes them", async () => {
    const { port } = replayPort(recording);
    const result = await run(port, recording.inputs);
    expect(result.onChainIds.length).toBeGreaterThan(0);
    for (const entry of result.onChainIds) expect(binaryPositionIds(entry.collateral, entry.conditionId)).toEqual(entry.ids);
  });
});

describe("venue specifics", () => {
  it("Polymarket: a plain market derives from USDC.e, a negative-risk one from the wrapped collateral, and the venue's ids match", () => {
    expect(binaryPositionIds(POLYMARKET_USDC_E, KNOWN_MARKETS.polymarketPlain.conditionId as Hex).map(String)).toEqual(KNOWN_MARKETS.polymarketPlain.clobTokenIds);
    expect(binaryPositionIds(POLYMARKET_WRAPPED_COLLATERAL, KNOWN_MARKETS.polymarketNegRisk.conditionId as Hex).map(String)).toEqual(KNOWN_MARKETS.polymarketNegRisk.clobTokenIds);
    // The wrong collateral, or token ids that are not the condition's, are refused rather than read.
    expect(polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketPlain.conditionId, ledger: "ctf_v1", negRisk: true, tokenIds: KNOWN_MARKETS.polymarketPlain.clobTokenIds }).ok).toBe(false);
    expect(polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketNegRisk.conditionId, ledger: "ctf_v1", negRisk: null, tokenIds: KNOWN_MARKETS.polymarketPlain.clobTokenIds }).ok).toBe(false);
    const both = polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketNegRisk.conditionId, ledger: "ctf_v1", negRisk: null, tokenIds: KNOWN_MARKETS.polymarketNegRisk.clobTokenIds });
    expect(both.ok && both.targets.every((target) => target.ledger === POLYMARKET_PINS.conditionalTokens)).toBe(true);
  });

  it("Polymarket Protocol V2: a position id names its module, its 31-byte condition and its outcome", () => {
    const [yes, no] = KNOWN_MARKETS.polymarketPlain.positionIds.map((id) => v2PositionParts(BigInt(id)));
    expect(yes?.moduleId).toBe(1);
    expect([yes?.outcomeIndex, no?.outcomeIndex]).toEqual([0, 1]);
    expect(yes?.conditionId).toBe(no?.conditionId);
    expect(yes?.conditionId).toMatch(/^0x[0-9a-f]{62}$/);
    const v2 = polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketPlain.conditionId, ledger: "protocol_v2", negRisk: false, tokenIds: KNOWN_MARKETS.polymarketPlain.positionIds });
    expect(v2.ok && v2.targets.every((target) => target.ledger === POLYMARKET_PINS.positionManager && target.resolution?.kind === "module")).toBe(true);
    // Out of order, or not a module's id at all: refused.
    expect(polymarketTargets({ conditionId: "", ledger: "protocol_v2", negRisk: null, tokenIds: [...KNOWN_MARKETS.polymarketPlain.positionIds].reverse() }).ok).toBe(false);
    expect(v2PositionParts(5n)).toBeNull();
  });

  it("Polymarket Protocol V2: the recorded module result is two values in parts per million", async () => {
    const recording = loadRecording("polymarket");
    const { port } = replayPort(recording);
    const result = await polymarketScenario(port, recording.inputs);
    const value = result.extra["v2Result"] as readonly bigint[] | null;
    expect(value?.length).toBe(2);
    expect((value ?? []).reduce((sum, n) => sum + n, 0n)).toBe(1_000_000n);
  });

  it("Limitless: the exchanges' registry names the condition, and the ids derive from it with USDC", async () => {
    expect(binaryPositionIds(LIMITLESS_USDC, KNOWN_MARKETS.limitless.conditionId as Hex).map(String)).toEqual(KNOWN_MARKETS.limitless.tokens);
    const recording = loadRecording("limitless");
    const { port } = replayPort(recording);
    const result = await limitlessScenario(port, recording.inputs);
    const known = result.targets.filter((target) => KNOWN_MARKETS.limitless.tokens.includes(target.tokenId.toString()));
    expect(known.map((target) => target.resolution?.kind === "ctf" && target.resolution.conditionId)).toEqual([KNOWN_MARKETS.limitless.conditionId, KNOWN_MARKETS.limitless.conditionId]);
    expect(known.every((target) => target.ledger === LIMITLESS_PINS.conditionalTokens)).toBe(true);
  });

  it("XO: listed ids must derive from the condition with XO USDC; a scanned id is confirmed through the exchange registry", async () => {
    expect(binaryPositionIds(USDC_E_ADDRESS, KNOWN_MARKETS.xoResolved.conditionId as Hex).map(String)).toEqual(KNOWN_MARKETS.xoResolved.tokenIds);
    expect(xoTargets({ conditionId: KNOWN_MARKETS.xoResolved.conditionId, tokenIds: KNOWN_MARKETS.xoResolvedSecond.tokenIds }).ok).toBe(false);
    const recording = loadRecording("xo");
    const { port } = replayPort(recording);
    const result = await xoScenario(port, recording.inputs);
    const scanned = result.targets.at(-1);
    expect(scanned?.ledger).toBe(XO_PINS.conditionalTokens);
    expect(scanned?.resolution?.kind).toBe("ctf");
    // Both listed markets were closed with a winner on XO's API; the chain agrees that each is resolved.
    const listed = result.positions?.positions.filter((position) => [...KNOWN_MARKETS.xoResolved.tokenIds, ...KNOWN_MARKETS.xoResolvedSecond.tokenIds].includes(position.target.tokenId.toString()));
    expect(listed?.length).toBe(4);
    expect(listed?.every((position) => position.resolution.state === "resolved")).toBe(true);
  });
});
