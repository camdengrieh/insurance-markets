// Holdings read from the chain alone, for the venues that settle on one: Polymarket (Polygon 137), Limitless (Base
// 8453) and XO (chain 3223). No venue API is asked anything (docs/sdk-and-api-design.md section 9 step 6).
//
// Which token ids are read:
//   - the outcome tokens of the markets this page has already loaded (its market rows), accepted only where the ids
//     derive from the market's condition on chain terms (sdk/chain/<venue>), and
//   - the ids that moved TO the address in the newest SCAN_WINDOWS x SCAN_WINDOW_BLOCKS blocks of the ledger's
//     TransferSingle and TransferBatch logs. The range is stated on the page.
// Balances come from the pinned ledger (ERC-1155 balanceOfBatch) and results from Conditional Tokens' payouts or
// Polymarket's V2 modules, each contract checked against its pinned code first. A market title and outcome label
// come from the page's own market rows; a token the page has not loaded is listed by its id, because the chain does
// not name it. The chain holds no prices, so an open position has no value here.

import { MAX_TARGETS, readPositions, scanTransfersTo, type PositionRead, type PositionTarget, type TransferScan } from "@sdk/chain/positions";
import { createPinGuard, pinFailureText, type ContractPin, type PinGuard } from "@sdk/chain/pins";
import { createRpcPort, isRpcError, rpcPostFromFetch, type Address, type RpcPort } from "@sdk/chain/rpc";
import { POLYMARKET_PINS } from "@sdk/chain/polymarket/constants";
import { polymarketScannedTarget, polymarketTargets, type PolymarketLedger } from "@sdk/chain/polymarket/reads";
import { LIMITLESS_PINS } from "@sdk/chain/limitless/constants";
import { limitlessTargets } from "@sdk/chain/limitless/reads";
import { XO_PINS } from "@sdk/chain/xo/pins";
import { xoScannedTargets, xoTargets } from "@sdk/chain/xo/positions";
import { fromBaseUnits, type Qty } from "@sdk/money/qty";
import { ERC20_ABI } from "@shared/xo/chain/abi";
import { USDC_E_ADDRESS, USDC_E_DECIMALS } from "@shared/xo/chain/constants";
import { encodeFunctionData, getAddress } from "viem";

import { chainById } from "../../core/account";
import type { AdapterDeps, MarketSummary, Untrusted, VenueId } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import { makeProv } from "../../core/venue-policy";
import { rpcUrlOf } from "../wallet/rpc";
import { makeRow } from "./rows";
import type { PlannedRead } from "./targets";
import type { AddressResolution, CollateralUnit, PortfolioRow, VenueReadOk, VenueReadOutcome } from "./types";

export type ChainVenue = "polymarket" | "limitless" | "xo";

export const CHAIN_OF: Readonly<Record<ChainVenue, 137 | 8453 | 3223>> = Object.freeze({ polymarket: 137, limitless: 8453, xo: 3223 });

// The public RPCs refuse eth_getLogs ranges over 10,000 blocks; three of them are the newest 30,000 blocks.
export const SCAN_WINDOW_BLOCKS = 10_000n;
export const SCAN_WINDOWS = 3;
// Outcome tokens of every venue here carry six decimals (the collateral's).
const SHARE_DECIMALS = 6;
const POSITIONS_TTL_MS = 30_000;
const MAX_KNOWN_MARKETS = 400;

export interface ChainSession {
  readonly port: RpcPort;
  readonly guard: PinGuard;
}

const METHODS = ["eth_blockNumber", "eth_call", "eth_getCode", "eth_getLogs", "eth_getStorageAt"] as const;

// One port and one pin guard per chain, from the page's injected fetch and the RPC host the CSP lists for the chain.
export function createChainSession(deps: AdapterDeps, chainId: number): ChainSession | null {
  const chain = chainById(chainId);
  const url = chain === undefined ? null : rpcUrlOf(chain);
  if (url === null) return null;
  const port = createRpcPort({ url, post: rpcPostFromFetch(deps.fetch, { nowMs: deps.nowMs }), methods: METHODS });
  return { port, guard: createPinGuard(port) };
}

// ---- the page's market rows as candidates -------------------------------------------------------------------------

interface Labelled {
  readonly market: Untrusted<string>;
  readonly outcome: Untrusted<string> | null;
}

interface Candidates {
  readonly targets: PositionTarget[];
  readonly labels: Map<string, Labelled>;
  readonly refused: number;
  readonly markets: number;
}

function labelsOf(summary: MarketSummary, labels: Map<string, Labelled>): void {
  for (const outcome of summary.outcomes) labels.set(outcome.tokenId, { market: summary.title, outcome: outcome.label });
}

function knownCandidates(venue: ChainVenue, known: readonly MarketSummary[]): Candidates & { readonly limitlessIds: string[] } {
  const rows = known.filter((summary) => summary.ref.venue === venue).slice(0, MAX_KNOWN_MARKETS);
  const targets: PositionTarget[] = [];
  const labels = new Map<string, Labelled>();
  const limitlessIds: string[] = [];
  let refused = 0;
  for (const summary of rows) {
    const tokenIds = summary.outcomes.map((outcome) => outcome.tokenId);
    if (venue === "limitless") {
      limitlessIds.push(...tokenIds);
      labelsOf(summary, labels);
      continue;
    }
    const result =
      venue === "xo"
        ? xoTargets({ conditionId: summary.ref.marketId, tokenIds })
        : polymarketTargets({
            conditionId: summary.ref.marketId,
            ledger: summary.ref.native["ledger"] === "protocol_v2" ? "protocol_v2" : "ctf_v1",
            negRisk: summary.ref.native["negRisk"] === "true" ? true : summary.ref.native["negRisk"] === "false" ? false : null,
            tokenIds,
          });
    if (!result.ok) {
      refused += 1;
      continue;
    }
    targets.push(...result.targets);
    labelsOf(summary, labels);
  }
  return { targets, labels, refused, markets: rows.length, limitlessIds };
}

// ---- reading -----------------------------------------------------------------------------------------------------------

function ledgersOf(venue: ChainVenue): ReadonlyArray<{ readonly pin: ContractPin; readonly ledger: PolymarketLedger | null }> {
  if (venue === "polymarket") return [{ pin: POLYMARKET_PINS.conditionalTokens, ledger: "ctf_v1" }, { pin: POLYMARKET_PINS.positionManager, ledger: "protocol_v2" }];
  if (venue === "limitless") return [{ pin: LIMITLESS_PINS.conditionalTokens, ledger: null }];
  return [{ pin: XO_PINS.conditionalTokens, ledger: null }];
}

function collateralOf(venue: ChainVenue, target: PositionTarget): { readonly unit: CollateralUnit; readonly symbol: string } {
  if (venue === "xo") return { unit: "usdc_e", symbol: "USDC.e" };
  if (venue === "limitless") return { unit: "usd", symbol: "USDC" };
  // Polymarket: CTF positions redeem in USDC.e (wrapped collateral unwraps to it); Protocol V2 positions in pUSD.
  return target.ledger.address === POLYMARKET_PINS.positionManager.address ? { unit: "usd", symbol: "pUSD" } : { unit: "usdc_e", symbol: "USDC.e" };
}

function shortId(id: bigint): string {
  const text = id.toString();
  return text.length <= 14 ? text : `${text.slice(0, 6)}…${text.slice(-6)}`;
}

function rowOf(venue: ChainVenue, plan: Extract<PlannedRead, { kind: "run" }>, read: PositionRead, labels: Map<string, Labelled>, prov: ReturnType<typeof makeProv>): PortfolioRow {
  const tokenId = read.target.tokenId.toString();
  const label = labels.get(tokenId);
  const { unit, symbol } = collateralOf(venue, read.target);
  const qty = read.balance === null ? null : fromBaseUnits("shares", read.balance, SHARE_DECIMALS);
  const resolution = read.resolution;
  let status: PortfolioRow["status"];
  let claimable: Qty | null = null;
  if (resolution.state === "unresolved") status = "open";
  else if (resolution.state === "unknown") status = "unknown";
  else if (resolution.numerator === 0n) status = "lost";
  else {
    status = "claimable";
    // What redeemPositions pays: balance x numerator / denominator, rounded down, in collateral units.
    claimable = read.balance === null ? null : fromBaseUnits(unit, (read.balance * resolution.numerator) / resolution.denominator, SHARE_DECIMALS);
  }
  return makeRow({
    id: `${venue}:${read.target.ledger.address.toLowerCase()}:${tokenId}`,
    venue,
    bindingId: plan.binding.id,
    holder: plan.address,
    market: label?.market ?? untrustedField("generic", `Market not loaded on this page (token ${shortId(read.target.tokenId)})`, venue),
    outcome: label?.outcome ?? null,
    tokenId,
    qty,
    status,
    collateral: unit,
    collateralSymbol: symbol,
    prov,
    valueNote: status === "open" ? "The chain holds no price, and this view asks no venue for one." : null,
    claimable,
    claimSource: claimable === null ? "none" : "settlement",
    claimNote: status === "claimable" ? "Computed from the payout stored on chain (numerator over denominator), not from a venue figure." : resolution.state === "unknown" ? resolution.why : null,
    flags: label === undefined ? ["Found only on chain: this token's market is not among the markets this page has loaded."] : [],
  });
}

function scanNote(venue: ChainVenue, scans: readonly TransferScan[]): string {
  const blocks = SCAN_WINDOW_BLOCKS * BigInt(SCAN_WINDOWS);
  const incomplete = scans.some((scan) => !scan.complete);
  const range = scans[0] === undefined ? "" : ` (blocks ${scans[0].fromBlock.toString()} to ${scans[0].toBlock.toString()})`;
  return incomplete
    ? `Transfers to this address were scanned only in part: the node refused part of the newest ${blocks.toString()} blocks${range}. Tokens received earlier are found only through the markets this page has loaded.`
    : `Transfers to this address in the newest ${blocks.toString()} blocks of ${venue === "polymarket" ? "Polygon" : venue === "limitless" ? "Base" : "XO's chain"}${range} were scanned for tokens. Tokens received earlier are found only through the markets this page has loaded.`;
}

export async function readChainHoldings(
  deps: AdapterDeps,
  session: ChainSession,
  venue: ChainVenue,
  plan: Extract<PlannedRead, { kind: "run" }>,
  known: readonly MarketSummary[],
): Promise<VenueReadOutcome> {
  const { port, guard } = session;
  const holder = plan.address as Address;
  const now = deps.nowMs();
  const prov = makeProv({ venue: venue as VenueId, source: `eth_call:${CHAIN_OF[venue]}`, fetchedAtMs: now, nowMs: now, ttlMs: POSITIONS_TTL_MS, transport: "T0-RPC" });
  const candidates = knownCandidates(venue, known);
  const notes: string[] = [];
  const notListed: string[] = [];

  // Token ids received in the newest blocks, per ledger. A ledger whose pin fails is not scanned.
  const head = await port.blockNumber();
  const scans: TransferScan[] = [];
  const scanned: PositionTarget[] = [];
  const refusedText: string[] = [];
  for (const { pin, ledger } of ledgersOf(venue)) {
    const check = await guard.check(pin);
    if (!check.ok) {
      refusedText.push(pinFailureText(check));
      continue;
    }
    const scan = await scanTransfersTo(port, pin, holder, { toBlock: head, windowBlocks: SCAN_WINDOW_BLOCKS, windows: SCAN_WINDOWS });
    scans.push(scan);
    for (const id of scan.tokenIds) {
      if (candidates.labels.has(id.toString()) && venue !== "limitless") continue;
      if (venue === "polymarket") {
        const target = polymarketScannedTarget(id, ledger ?? "ctf_v1");
        if (target !== null) scanned.push(target);
      } else if (venue === "xo") {
        scanned.push({ tokenId: id, ledger: pin, resolution: null });
      } else {
        candidates.limitlessIds.push(id.toString());
      }
    }
  }

  // Phase 1: balances of every candidate, ledger by ledger, with no result reads.
  let targets: PositionTarget[];
  if (venue === "limitless") {
    targets = [...new Set(candidates.limitlessIds)].map((id) => ({ tokenId: BigInt(id), ledger: LIMITLESS_PINS.conditionalTokens, resolution: null }));
  } else {
    const seen = new Set<string>();
    targets = [...candidates.targets, ...scanned].filter((target) => {
      const key = `${target.ledger.address}:${target.tokenId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  // At most MAX_TARGETS ids in one read: the page's markets first, then the scan's.
  const capped = targets.length > MAX_TARGETS;
  targets = targets.slice(0, MAX_TARGETS);
  const first = await readPositions(port, guard, { holder, targets: targets.map((target) => ({ ...target, resolution: null })) });
  for (const refused of first.refused) refusedText.push(pinFailureText(refused));
  const held = targets.filter((_, index) => {
    const balance = first.positions[index]?.balance;
    return balance !== null && balance !== undefined && balance > 0n;
  });
  const unreadable = first.positions.filter((position) => position.balance === null).length;

  // Phase 2: where each held token's result lives, then its result. Limitless and XO tokens found by the scan are
  // looked up in the pinned exchanges' registries and checked by derivation.
  let resolved: PositionTarget[] = held;
  if (venue === "limitless") resolved = [...(await limitlessTargets(port, held.map((target) => target.tokenId))).targets];
  else if (venue === "xo") {
    const lookup = held.filter((target) => target.resolution === null).map((target) => target.tokenId);
    const found = lookup.length === 0 ? [] : (await xoScannedTargets(port, lookup)).targets;
    resolved = held.map((target) => found.find((entry) => entry.tokenId === target.tokenId) ?? target);
  }
  const second = resolved.length === 0 ? { positions: [], refused: [] } : await readPositions(port, guard, { holder, targets: resolved });
  for (const refused of second.refused) refusedText.push(pinFailureText(refused));
  const rows = second.positions.filter((position) => position.balance !== null && position.balance > 0n).map((read) => rowOf(venue, plan, read, candidates.labels, prov));

  // XO: the account's USDC on chain, the cash the order book trades with.
  const facts: Array<{ label: string; value: Qty | null; symbol: string }> = [];
  if (venue === "xo") {
    try {
      const [balance] = await readBalancesErc20(port, holder);
      facts.push({ label: "XO USDC held by the account (on chain)", value: balance === null ? null : fromBaseUnits("usdc_e", balance, USDC_E_DECIMALS), symbol: "USDC.e" });
    } catch (error) {
      if (!isRpcError(error)) throw error;
      facts.push({ label: "XO USDC held by the account (on chain)", value: null, symbol: "USDC.e" });
    }
  }

  notes.push(`Read from the chain only, with no venue API: balances from ${ledgersOf(venue).map(({ pin }) => pin.name).join(" and ")}, each checked against the code pinned on ${ledgersOf(venue)[0]?.pin.readOn ?? ""}, and results from the contracts that settle them.`);
  notes.push(`Token ids came from the ${candidates.markets.toString()} ${venue === "xo" ? "XO" : venue === "limitless" ? "Limitless" : "Polymarket"} markets this page has loaded and from a scan of transfers. ${scanNote(venue, scans)}`);
  notes.push("The chain holds no prices, so open positions have no value here; a settled position shows what the contract pays. Market titles and outcome names are the page's own market rows.");
  if (venue === "polymarket" && plan.binding.kind === "eoa") {
    notes.push("Polymarket usually holds an owner's positions in a wallet it creates for them (a proxy, Safe or deposit wallet), not in the owner's address. This read is of the address itself; paste the Polymarket wallet as its own entry to read that one.");
  }
  notes.push(...refusedText);
  if (candidates.refused > 0) notListed.push(`${candidates.refused.toString()} loaded markets were not read: their listed token ids do not derive from their condition.`);
  if (unreadable > 0) notListed.push(`${unreadable.toString()} token balances could not be read.`);
  if (capped) notListed.push(`Only the first ${MAX_TARGETS.toString()} candidate tokens were read.`);
  const resolution: AddressResolution = { source: plan.resolution === "derived_kernel" ? "derived" : "pasted", address: plan.address, candidate: null };
  const outcome: VenueReadOk = {
    kind: "ok",
    venue,
    bindingId: plan.binding.id,
    bindingLabel: plan.binding.label,
    holder: plan.address,
    rows,
    rejected: 0,
    notListed,
    notes,
    prov,
    partial: capped || refusedText.length > 0 || unreadable > 0 || scans.some((scan) => !scan.complete),
    facts,
    resolution,
  };
  return outcome;
}

// ERC-20 balanceOf of XO USDC for the account, one eth_call.
async function readBalancesErc20(port: RpcPort, holder: Address): Promise<Array<bigint | null>> {
  const data = encodeFunctionData({ abi: ERC20_ABI, functionName: "balanceOf", args: [getAddress(holder)] });
  const [result] = await port.callMany([{ to: USDC_E_ADDRESS, data }]);
  if (result === undefined || !result.ok || !/^0x[0-9a-f]{64}$/.test(result.data)) return [null];
  return [BigInt(result.data)];
}

