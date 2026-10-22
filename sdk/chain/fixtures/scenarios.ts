// The read scenarios behind the chain recordings. test/fixtures/chain-recordings/capture.ts ran each one ONCE against
// the public RPCs (2026-10-22) through a recording transport and saved every JSON-RPC exchange, together with the
// inputs the scenario chose (a settled block, a maker taken from that block's public OrderFilled logs), into
// <venue>/fixtures/recorded_2026-10-22.json. The tests run the same scenario over a replay transport (replay.ts) with
// those inputs, so the readers send exactly the requests that were recorded and get exactly the answers.
//
// The holders are contracts on the venues' own lists, or a maker address read from the venue exchange's own public
// OrderFilled logs. No address of a person was looked up anywhere else.

import { decodeConditionResolution, CONDITION_RESOLUTION_TOPIC, CTF_ABI } from "../ctf.js";
import { readFills, type Fill, type FillShape } from "../fills.js";
import { createPinGuard } from "../pins.js";
import { readCtfPayouts, readModuleResults, readPositions, scanTransfersTo, type PositionTarget, type PositionsResult, type TransferScan } from "../positions.js";
import type { Address, Hex, RpcPort } from "../rpc.js";
import { decodeFunctionResult, encodeFunctionData, toEventSelector } from "viem";
import { POLYMARKET_BINARY_MODULE, POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_CTF_EXCHANGE, POLYMARKET_PINS, POLYMARKET_USDC_E, POLYMARKET_WRAPPED_COLLATERAL } from "../polymarket/constants.js";
import { polymarketScannedTarget, polymarketTargets } from "../polymarket/reads.js";
import { LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_CTF_EXCHANGE, LIMITLESS_PINS, LIMITLESS_USDC } from "../limitless/constants.js";
import { limitlessTargets } from "../limitless/reads.js";
import { CONDITIONAL_TOKENS as XO_CONDITIONAL_TOKENS, CTF_EXCHANGE as XO_CTF_EXCHANGE, USDC_E_ADDRESS } from "../xo/constants.js";
import { XO_PINS } from "../xo/pins.js";
import { xoScannedTargets, xoTargets } from "../xo/positions.js";

// Market ids from the venues' own recorded answers in sdk/venues/<venue>/fixtures.
export const KNOWN_MARKETS = Object.freeze({
  // gamma_markets_keyset_captured_2026-10-20.json: version "v1", negRisk false, open; it also lists Protocol V2 ids.
  polymarketPlain: {
    conditionId: "0xa467b14d51f01b957109d9cbb1d6c124fab2a089d52ed8f471d23c2812e743b7",
    clobTokenIds: ["32338220190071351435772801779725302244575775216413325951443816017994629993401", "25659310674993675562345759665114759892400026242514633218387667107987341231962"],
    positionIds: ["895257453734540292493143124621755605615887197499956109032745153687078305792", "895257453734540292493143124621755605615887197499956109032745153687078305793"],
  },
  // gamma_events_keyset_recorded_2026-10-18.json: version "v1", negRisk true, closed, umaResolutionStatus "resolved".
  polymarketNegRisk: {
    conditionId: "0x63d8f3a34c90bd5342dda8acf62b6a898dfa52f86475efaf180b66493ef6af80",
    clobTokenIds: ["66991175107696133528353695394151645462081911990365106169948013117379189357520", "106199154714545451005463800266480893448383896699905306895283360115694583822185"],
  },
  // markets_active_list_captured_2026-10-20.json: a CLOB market on the v3 exchange.
  limitless: {
    conditionId: "0x9e35423a292f2e0462bed39890e5cdcc306fa544f656c6ea2989d215c8f44463",
    tokens: ["26150597149103310177672015101141588011999526184428875401494084768567805831835", "34471428307704598429816403940987329762845789213050239117009215688387975623005"],
  },
  // data-markets-closed-resolved.json: two CLOSED markets with a winning outcome.
  xoResolved: {
    conditionId: "0xc7a52c3e1d542324628def3dc83b2278afb335dabbcdf5369926e85f45d5cc07",
    tokenIds: ["2477642433257774211170266154923194968257797889461711679667033521254534193011", "2528919163975898124965220747258955712801584450050779303785512455625740594085"],
  },
  xoResolvedSecond: {
    conditionId: "0x8bdb947f7120cfc96b11a22f19ca30b777d5dfa570f3af717a84a563b7e1e417",
    tokenIds: ["33176442485171306958741657737670909532018693498539893704936281044816042402199", "103072680917662628535456085310465751035163639203230674011851692116279329603743"],
  },
});

export interface ScenarioInputs {
  // The newest block the scenario reads logs up to (a settled block, chosen at capture time).
  readonly block: string;
  // How many blocks of OrderFilled logs to read, ending at `block`.
  readonly fillBlocks: string;
}

export interface ScenarioResult {
  readonly inputs: ScenarioInputs;
  readonly fills: readonly Fill[];
  readonly fillsComplete: boolean;
  // The maker of the first fill: the holder whose positions are read.
  readonly holder: Address | null;
  readonly resolutions: readonly { readonly conditionId: Hex; readonly payoutNumerators: readonly bigint[] }[];
  readonly resolvedPayouts: ReadonlyMap<Hex, unknown>;
  readonly targets: readonly PositionTarget[];
  readonly positions: PositionsResult | null;
  readonly scan: TransferScan | null;
  // getCollectionId / getPositionId as the deployed contract computes them, for the derivation test.
  readonly onChainIds: readonly { readonly conditionId: Hex; readonly collateral: Address; readonly ids: readonly [bigint, bigint] }[];
  readonly extra: Readonly<Record<string, unknown>>;
}

export const SCAN_WINDOW_BLOCKS = 2_000n;
const ZERO32 = `0x${"00".repeat(32)}` as Hex;

async function onChainIds(port: RpcPort, ledger: Address, collateral: Address, conditionId: Hex): Promise<{ conditionId: Hex; collateral: Address; ids: readonly [bigint, bigint] }> {
  const collections = await port.callMany(
    [1n, 2n].map((indexSet) => ({ to: ledger, data: encodeFunctionData({ abi: CTF_ABI, functionName: "getCollectionId", args: [ZERO32, conditionId, indexSet] }) })),
  );
  const collectionIds = collections.map((result) => {
    if (!result.ok) throw new Error("getCollectionId failed");
    return decodeFunctionResult({ abi: CTF_ABI, functionName: "getCollectionId", data: result.data });
  });
  const positions = await port.callMany(collectionIds.map((collectionId) => ({ to: ledger, data: encodeFunctionData({ abi: CTF_ABI, functionName: "getPositionId", args: [collateral, collectionId] }) })));
  const ids = positions.map((result) => {
    if (!result.ok) throw new Error("getPositionId failed");
    return decodeFunctionResult({ abi: CTF_ABI, functionName: "getPositionId", data: result.data });
  });
  return { conditionId, collateral, ids: [ids[0] as bigint, ids[1] as bigint] };
}

async function common(
  port: RpcPort,
  given: ScenarioInputs | undefined,
  venue: { readonly exchange: Address; readonly shape: FillShape; readonly ledger: Address; readonly fillBlocks: bigint; readonly settle: bigint },
): Promise<{ inputs: ScenarioInputs; fills: Fill[]; fillsComplete: boolean; holder: Address | null; resolutions: Array<{ conditionId: Hex; payoutNumerators: readonly bigint[] }> }> {
  const block = given === undefined ? (await port.blockNumber()) - venue.settle : BigInt(given.block);
  const fillBlocks = given === undefined ? venue.fillBlocks : BigInt(given.fillBlocks);
  const inputs: ScenarioInputs = { block: block.toString(), fillBlocks: fillBlocks.toString() };
  const read = await readFills(port, { exchange: venue.exchange, shape: venue.shape, fromBlock: block - fillBlocks + 1n, toBlock: block });
  const buyer = read.fills.find((fill) => fill.side === "buy" && fill.maker !== venue.exchange.toLowerCase()) ?? null;
  const logs = await port.getLogs({ address: venue.ledger, topics: [CONDITION_RESOLUTION_TOPIC], fromBlock: block - 199n, toBlock: block });
  const resolutions = logs.logs.flatMap((log) => {
    const row = decodeConditionResolution(log, venue.ledger);
    return row === null ? [] : [{ conditionId: row.conditionId, payoutNumerators: row.payoutNumerators }];
  });
  return { inputs, fills: read.fills.slice(), fillsComplete: read.complete, holder: buyer?.maker ?? null, resolutions };
}

export async function polymarketScenario(port: RpcPort, given?: ScenarioInputs): Promise<ScenarioResult> {
  const base = await common(port, given, { exchange: POLYMARKET_CTF_EXCHANGE, shape: "polymarket", ledger: POLYMARKET_CONDITIONAL_TOKENS, fillBlocks: 1n, settle: 64n });
  const firstResolved = base.resolutions[0]?.conditionId;
  const resolvedPayouts = await readCtfPayouts(port, POLYMARKET_CONDITIONAL_TOKENS, firstResolved === undefined ? [] : [firstResolved]);
  // A Protocol V2 result: the newest ConditionResolved of the BinaryModule in the same window.
  const v2Logs = await port.getLogs({ address: POLYMARKET_BINARY_MODULE, topics: [toEventSelector("ConditionResolved(bytes31,uint256[])")], fromBlock: BigInt(base.inputs.block) - 199n, toBlock: BigInt(base.inputs.block) });
  const v2Condition = v2Logs.logs[0]?.topics[1]?.slice(0, 64) as Hex | undefined;
  const v2Results = await readModuleResults(port, POLYMARKET_BINARY_MODULE, v2Condition === undefined ? [] : [v2Condition]);
  const plain = polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketPlain.conditionId, ledger: "ctf_v1", negRisk: false, tokenIds: KNOWN_MARKETS.polymarketPlain.clobTokenIds });
  const negRisk = polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketNegRisk.conditionId, ledger: "ctf_v1", negRisk: true, tokenIds: KNOWN_MARKETS.polymarketNegRisk.clobTokenIds });
  const v2 = polymarketTargets({ conditionId: KNOWN_MARKETS.polymarketPlain.conditionId, ledger: "protocol_v2", negRisk: false, tokenIds: KNOWN_MARKETS.polymarketPlain.positionIds });
  const targets: PositionTarget[] = [plain, negRisk, v2].flatMap((result) => (result.ok ? result.targets : []));
  const fillToken = base.fills.find((fill) => fill.maker === base.holder)?.tokenId;
  if (fillToken !== undefined) {
    const scanned = polymarketScannedTarget(fillToken, "ctf_v1");
    if (scanned !== null) targets.push(scanned);
  }
  const guard = createPinGuard(port);
  const holder = base.holder;
  const positions = holder === null ? null : await readPositions(port, guard, { holder, targets });
  const scan = holder === null ? null : await scanTransfersTo(port, POLYMARKET_PINS.conditionalTokens, holder, { toBlock: BigInt(base.inputs.block), windowBlocks: SCAN_WINDOW_BLOCKS, windows: 1 });
  const ids = [
    await onChainIds(port, POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_USDC_E, KNOWN_MARKETS.polymarketPlain.conditionId as Hex),
    await onChainIds(port, POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_WRAPPED_COLLATERAL, KNOWN_MARKETS.polymarketNegRisk.conditionId as Hex),
  ];
  return { ...base, resolvedPayouts, targets, positions, scan, onChainIds: ids, extra: { v2Condition: v2Condition ?? null, v2Result: v2Condition === undefined ? null : (v2Results.get(v2Condition) ?? null) } };
}

export async function limitlessScenario(port: RpcPort, given?: ScenarioInputs): Promise<ScenarioResult> {
  const base = await common(port, given, { exchange: LIMITLESS_CTF_EXCHANGE, shape: "limitless", ledger: LIMITLESS_CONDITIONAL_TOKENS, fillBlocks: 200n, settle: 64n });
  const firstResolved = base.resolutions[0]?.conditionId;
  const resolvedPayouts = await readCtfPayouts(port, LIMITLESS_CONDITIONAL_TOKENS, firstResolved === undefined ? [] : [firstResolved]);
  const fillToken = base.fills.find((fill) => fill.maker === base.holder)?.tokenId;
  const { targets } = await limitlessTargets(port, [...KNOWN_MARKETS.limitless.tokens, ...(fillToken === undefined ? [] : [fillToken])]);
  const guard = createPinGuard(port);
  const holder = base.holder;
  const positions = holder === null ? null : await readPositions(port, guard, { holder, targets });
  const scan = holder === null ? null : await scanTransfersTo(port, LIMITLESS_PINS.conditionalTokens, holder, { toBlock: BigInt(base.inputs.block), windowBlocks: SCAN_WINDOW_BLOCKS, windows: 1 });
  const ids = [await onChainIds(port, LIMITLESS_CONDITIONAL_TOKENS, LIMITLESS_USDC, KNOWN_MARKETS.limitless.conditionId as Hex)];
  return { ...base, resolvedPayouts, targets, positions, scan, onChainIds: ids, extra: {} };
}

export async function xoScenario(port: RpcPort, given?: ScenarioInputs): Promise<ScenarioResult> {
  const base = await common(port, given, { exchange: XO_CTF_EXCHANGE, shape: "xo", ledger: XO_CONDITIONAL_TOKENS, fillBlocks: 20n, settle: 64n });
  const firstResolved = base.resolutions[0]?.conditionId;
  const resolvedPayouts = await readCtfPayouts(port, XO_CONDITIONAL_TOKENS, firstResolved === undefined ? [] : [firstResolved]);
  const known = [xoTargets(KNOWN_MARKETS.xoResolved), xoTargets(KNOWN_MARKETS.xoResolvedSecond)].flatMap((result) => (result.ok ? result.targets : []));
  const fillToken = base.fills.find((fill) => fill.maker === base.holder)?.tokenId;
  const scanned = fillToken === undefined ? { targets: [] } : await xoScannedTargets(port, [fillToken]);
  const targets = [...known, ...scanned.targets];
  const guard = createPinGuard(port);
  const holder = base.holder;
  const positions = holder === null ? null : await readPositions(port, guard, { holder, targets });
  const scan = holder === null ? null : await scanTransfersTo(port, XO_PINS.conditionalTokens, holder, { toBlock: BigInt(base.inputs.block), windowBlocks: SCAN_WINDOW_BLOCKS, windows: 1 });
  const ids = [await onChainIds(port, XO_CONDITIONAL_TOKENS, USDC_E_ADDRESS, KNOWN_MARKETS.xoResolved.conditionId as Hex)];
  return { ...base, resolvedPayouts, targets, positions, scan, onChainIds: ids, extra: {} };
}

// The read methods every scenario port needs.
export const SCENARIO_METHODS = ["eth_blockNumber", "eth_call", "eth_getCode", "eth_getLogs", "eth_getStorageAt"] as const;
