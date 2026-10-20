// The creation flow: what happens to a market after createConvictionMarket (docs/research/23 sec 4, V3.5).
//
// The manager stub on the local chain (manager-stub.ts) charges the fee and emits CLOBMarketCreated and
// MarketCreationFeeCharged with the real layouts when the account's UserOp calls it. This class watches the
// manager's logs and plays the rest of XO's side:
//
//   - the market appears in the catalogue as PENDING (Data API and orderbook, orderbook `active: false`)
//   - what happens to it is sampled from the 585 observed markets: 287 approved at the first review (49 percent),
//     233 sent back for an update (40), 51 rejected (9) and 14 cancelled by their own creator before any review
//     (2). The oracle acts later in MOCK time by calling the stub as the XO oracle (anvil impersonates it); the
//     creator's own cancel is made by impersonating the creator's account, which the stub accepts as msg.sender.
//     Time to the first review: median 9.9 minutes, p75 34.2, p90 166.3, max 652; time to an owner cancel: median
//     2.9 minutes, max 30.2.
//   - UPDATE_REQUIRED carries a suggested metadata URI, a suggestion window (48 h for 71 percent, 26 h for 12,
//     shorter for the rest, the shortest 20 minutes) and, in 9.4 percent, a changed expiry (suggestedExpiresAt)
//   - the owner answers with respondToUpdateRequest; an accept before the window applies the suggestion
//   - once ACTIVE, 10 percent of markets get a MetadataUpdated later (XO rewriting metadata)
//   - meta.foreign_uri: a metadata URI outside XO's two buckets is reviewed like any other (reviewed), never
//     looked at (ignored: the market stays PENDING), or rejected within minutes (rejected)
//
// Every draw is a keccak of the condition id, so a run never depends on Math.random or the order tests ran in;
// `policy` pins any of them. Basis: the distributions are the observed ones (docs/research/23 sec 4, H on the
// sample); the oracle's texts, the suggested URI and the post-activation delay are synthetic (M).

import { decodeEventLog, encodeAbiParameters, encodeFunctionData, keccak256, toEventSelector, toHex, type Address, type Hex } from "viem";

import { MARKET_MANAGER_ABI } from "../../src/xo/chain/abi.js";
import { MARKET_MANAGER, XO_ORACLE } from "../../src/xo/chain/constants.js";
import { iso } from "./catalog.js";
import type { MockEnv } from "./env.js";
import { MANAGER_STATUS, MANAGER_STUB_ABI } from "./manager-stub.js";
import { accountKey } from "./state.js";

export const REVIEW_DECISION = Object.freeze({ approve: 0, reject: 1, update: 2 } as const);
export type ReviewDecisionName = keyof typeof REVIEW_DECISION;
// What can become of a created market first: one of the oracle's three decisions, or the creator cancelling.
export type CreationOutcome = ReviewDecisionName | "cancel";

const TOPIC_MARKET_REVIEWED = toEventSelector(
  "event MarketReviewed(bytes32 indexed conditionId, uint8 decision, string suggestedMetaDataURI, string extraNotes, uint40 suggestedExpiresAt, uint40 suggestionExpiresAt)",
);
const TOPIC_METADATA_UPDATED = toEventSelector("event MetadataUpdated(bytes32 indexed conditionId, string newURI)");

export interface CreationPolicy {
  // Pin what happens first. Default: sampled 287 / 233 / 51 / 14 of 585.
  decision?: CreationOutcome;
  // Seconds from creation to an owner cancel when the outcome is "cancel". Default: sampled.
  cancelDelayS?: number;
  // Seconds from creation to the first review. Default: sampled.
  reviewDelayS?: number;
  // Seconds the update suggestion stays open. Default: sampled.
  windowS?: number;
  // Whether an UPDATE_REQUIRED suggestion also changes the expiry. Default: 9.4 percent.
  changeExpiry?: boolean;
  // Whether an ACTIVE market later gets a MetadataUpdated. Default: 10 percent.
  metadataUpdate?: boolean;
  // The oracle's free text. Untrusted data on the real service; a test can put hostile text here.
  notes?: string;
}

export interface CreatedMarket {
  readonly conditionId: Hex;
  readonly creator: Address;
  readonly startsAt: number;
  expiresAt: number;
  readonly createdAtS: number;
  metadataUri: string;
  status: "PENDING" | "ACTIVE" | "CANCELLED" | "UPDATE_REQUIRED";
  decision: ReviewDecisionName | null;
  suggestion: { readonly uri: string; readonly expiresAt: number; readonly windowEnd: number } | null;
  reviewedAtS: number | null;
}

const XO_BUCKET_GCS = { host: "storage.googleapis.com", prefix: "/market-metadata-mainnet/" } as const;
const XO_BUCKET_S3_HOST = "market-metadata-623756711122.s3.eu-west-1.amazonaws.com";

export function isXoMetadataHost(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:") return false;
    return (url.hostname === XO_BUCKET_GCS.host && url.pathname.startsWith(XO_BUCKET_GCS.prefix)) || url.hostname === XO_BUCKET_S3_HOST;
  } catch {
    return false;
  }
}

// A uniform draw in [0, 1) from the condition id and a label.
function draw(conditionId: string, label: string): number {
  return Number(BigInt(`0x${keccak256(toHex(`${conditionId}:${label}`)).slice(2, 18)}`)) / 2 ** 64;
}

// 22 of the 233 update suggestions changed the expiry (9.4 percent); about 10 percent of ACTIVE markets later got a
// MetadataUpdated (docs/research/23 sec 4 and V2.1: at least 10.3 percent).
export const EXPIRY_CHANGE_SHARE = 0.094;
export const METADATA_UPDATE_SHARE = 0.1;
export const plannedExpiryChange = (conditionId: string): boolean => draw(conditionId, "expiry-change") < EXPIRY_CHANGE_SHARE;
export const plannedMetadataUpdate = (conditionId: string): boolean => draw(conditionId, "metadata-update") < METADATA_UPDATE_SHARE;

// Piecewise-linear in log time through the observed quantiles of "creation to first review" (minutes).
const REVIEW_QUANTILES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.25, 4],
  [0.5, 9.9],
  [0.75, 34.2],
  [0.9, 166.3],
  [1, 652.2],
];

export function sampleReviewDelayMinutes(u: number): number {
  return interpolateLog(REVIEW_QUANTILES, u);
}

// 287 approved at the first review, 233 UPDATE_REQUIRED, 51 rejected, 14 cancelled by the owner, of 585.
export function sampleOutcome(u: number): CreationOutcome {
  const k = u * 585;
  if (k < 287) return "approve";
  if (k < 287 + 233) return "update";
  if (k < 287 + 233 + 51) return "reject";
  return "cancel";
}

// Time from creation to an owner cancel (all 14 were before any review): median 2.9 minutes, max 30.2.
const CANCEL_QUANTILES: readonly (readonly [number, number])[] = [
  [0, 0.5],
  [0.25, 1.4],
  [0.5, 2.9],
  [0.75, 8],
  [0.9, 17],
  [1, 30.2],
];

function interpolateLog(quantiles: readonly (readonly [number, number])[], u: number): number {
  for (let i = 1; i < quantiles.length; i += 1) {
    const [p1, m1] = quantiles[i] as readonly [number, number];
    const [p0, m0] = quantiles[i - 1] as readonly [number, number];
    if (u <= p1) return Math.exp(Math.log(m0) + ((u - p0) / (p1 - p0)) * (Math.log(m1) - Math.log(m0)));
  }
  return (quantiles[quantiles.length - 1] as readonly [number, number])[1];
}

export const sampleCancelDelayMinutes = (u: number): number => interpolateLog(CANCEL_QUANTILES, u);

// 48 h for 165 of 233, 26 h for 27, under 24 h for 15 (5 under 6 h, the shortest 20 minutes), the rest 24 to 48 h.
export function sampleWindowSeconds(u: number): number {
  if (u < 0.708) return 48 * 3600;
  if (u < 0.824) return 26 * 3600;
  if (u < 0.888) return Math.round(6 * 3600 + ((u - 0.824) / 0.064) * 18 * 3600);
  if (u < 0.91) return Math.round(20 * 60 + ((u - 0.888) / 0.022) * (6 * 3600 - 20 * 60));
  return Math.round(24 * 3600 + ((u - 0.91) / 0.09) * 24 * 3600);
}

function decodeManagerLog(log: { readonly topics: Hex[]; readonly data: Hex }) {
  return decodeEventLog({ abi: MARKET_MANAGER_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
}
type ManagerEvent = ReturnType<typeof decodeManagerLog>;

export class CreationFlow {
  policy: CreationPolicy = {};
  readonly markets = new Map<string, CreatedMarket>();
  // Titles a test registered for a metadata URI (the real title lives in the JSON at the URI, which a mock
  // never fetches). Untrusted text on the real service.
  private readonly titles = new Map<string, string>();
  private lastBlock = -1;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly env: () => MockEnv) {}

  reset(): void {
    this.policy = {};
    this.markets.clear();
    this.titles.clear();
    this.lastBlock = -1;
  }

  registerMetadata(uri: string, metadata: { readonly title: string }): void {
    this.titles.set(uri, metadata.title);
  }

  // ---- watching the manager --------------------------------------------------------------------------------------------

  // Reads the manager's new logs and applies them to the catalogue. Cheap when nothing is new.
  sync(): Promise<void> {
    const run = this.tail.then(() => this.doSync());
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async doSync(): Promise<void> {
    const env = this.env();
    const chains = env.chains;
    if (chains.xo === undefined || !chains.xo.stubs) return;
    const head = Number(BigInt(await chains.call<Hex>("xo", "eth_blockNumber")));
    if (head <= this.lastBlock) return;
    const logs = await chains.call<{ topics: Hex[]; data: Hex; blockNumber: Hex; logIndex: Hex }[]>("xo", "eth_getLogs", [
      { fromBlock: toHex(this.lastBlock + 1), toBlock: toHex(head), address: MARKET_MANAGER },
    ]);
    this.lastBlock = head;
    logs.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.logIndex) - BigInt(b.logIndex)));
    for (const log of logs) {
      let event: ManagerEvent;
      try {
        event = decodeManagerLog(log);
      } catch {
        continue;
      }
      await this.apply(event, Number(BigInt(log.blockNumber)));
    }
  }

  private async blockTimestamp(blockNumber: number): Promise<number> {
    const block = await this.env().chains.call<{ timestamp: Hex }>("xo", "eth_getBlockByNumber", [toHex(blockNumber), false]);
    return Number(BigInt(block.timestamp));
  }

  private async apply(event: ManagerEvent, blockNumber: number): Promise<void> {
    const env = this.env();
    const { state } = env;
    switch (event.eventName) {
      case "CLOBMarketCreated": {
        const a = event.args;
        if (this.markets.has(a.conditionId)) return;
        const createdAtS = await this.blockTimestamp(blockNumber);
        const created: CreatedMarket = {
          conditionId: a.conditionId,
          creator: a.creator,
          startsAt: Number(a.startsAt),
          expiresAt: Number(a.expiresAt),
          createdAtS,
          metadataUri: a.metadataURI,
          status: "PENDING",
          decision: null,
          suggestion: null,
          reviewedAtS: null,
        };
        this.markets.set(a.conditionId, created);
        state.addMarket({
          seed: `onchain-${a.conditionId}`,
          title: this.titles.get(a.metadataURI) ?? `Mock created market ${a.conditionId.slice(2, 10)}`,
          kind: "conviction",
          status: "PENDING",
          orderbookActive: false,
          conditionId: a.conditionId,
          yesTokenId: a.outcome1TokenId.toString(10),
          noTokenId: a.outcome2TokenId.toString(10),
          metadataUri: a.metadataURI,
          creator: accountKey(a.creator),
          createdAtMs: createdAtS * 1000 + 2000,
          startsAt: iso(Number(a.startsAt) * 1000),
          expiresAt: iso(Number(a.expiresAt) * 1000),
        });
        this.scheduleReview(created);
        return;
      }
      case "MarketReviewed": {
        const a = event.args;
        const market = this.markets.get(a.conditionId);
        if (market === undefined) return;
        market.reviewedAtS = await this.blockTimestamp(blockNumber);
        if (a.decision === REVIEW_DECISION.approve) {
          market.decision = "approve";
          this.setStatus(market, "ACTIVE");
        } else if (a.decision === REVIEW_DECISION.reject) {
          market.decision = "reject";
          this.setStatus(market, "CANCELLED");
        } else {
          market.decision = "update";
          market.suggestion = { uri: a.suggestedMetaDataURI, expiresAt: Number(a.suggestedExpiresAt), windowEnd: Number(a.suggestionExpiresAt) };
          this.setStatus(market, "UPDATE_REQUIRED");
        }
        return;
      }
      case "UpdateRequestResponded": {
        const a = event.args;
        const market = this.markets.get(a.conditionId);
        if (market === undefined) return;
        if (a.accepted) {
          // The real contract applies the suggested URI and, when non-zero, the suggested expiry.
          if (market.suggestion !== null) {
            market.metadataUri = market.suggestion.uri;
            if (market.suggestion.expiresAt !== 0) market.expiresAt = market.suggestion.expiresAt;
          }
          const row = state.marketByCondition(market.conditionId);
          if (row !== undefined) {
            row.metadataUri = market.metadataUri;
            row.expiresAt = iso(market.expiresAt * 1000);
          }
          this.setStatus(market, "ACTIVE");
        } else {
          this.setStatus(market, "CANCELLED");
        }
        return;
      }
      case "MarketCancelledByOwner": {
        const market = this.markets.get(event.args.conditionId);
        if (market !== undefined) this.setStatus(market, "CANCELLED");
        return;
      }
      case "MetadataUpdated": {
        const market = this.markets.get(event.args.conditionId);
        if (market === undefined) return;
        market.metadataUri = event.args.newURI;
        const row = state.marketByCondition(market.conditionId);
        if (row !== undefined) row.metadataUri = event.args.newURI;
        return;
      }
      default:
        return;
    }
  }

  private setStatus(market: CreatedMarket, status: CreatedMarket["status"]): void {
    const env = this.env();
    market.status = status;
    env.state.setStatus(market.conditionId, status);
    if (status === "CANCELLED") env.engine.cancelMarket(market.conditionId, "market_cancelled");
    if (status === "ACTIVE") this.scheduleMetadataUpdate(market);
  }

  // ---- the oracle -------------------------------------------------------------------------------------------------------

  private scheduleReview(market: CreatedMarket): void {
    const env = this.env();
    const foreign = !isXoMetadataHost(market.metadataUri);
    const rule = env.switches.get("meta.foreign_uri");
    // A foreign URI the oracle never looks at: the market stays PENDING and nothing else ever happens to it.
    if (foreign && rule === "ignored") return;
    const delayMinutes = foreign && rule === "rejected" ? 2 : sampleReviewDelayMinutes(draw(market.conditionId, "review-delay"));
    const delayS = this.policy.reviewDelayS ?? Math.round(delayMinutes * 60);
    const dueMs = Math.max(env.clock.nowMs(), (market.createdAtS + delayS) * 1000);
    env.scheduler.at(dueMs, `review market ${market.conditionId.slice(0, 10)}`, () => this.review(market.conditionId));
    // The creator changes their mind first (2 percent of the observed markets). The review is still scheduled: the
    // oracle finds the market cancelled and leaves it.
    if ((this.policy.decision ?? sampleOutcome(draw(market.conditionId, "decision"))) === "cancel") {
      const cancelS = this.policy.cancelDelayS ?? Math.round(sampleCancelDelayMinutes(draw(market.conditionId, "cancel-delay")) * 60);
      env.scheduler.at(Math.max(env.clock.nowMs(), (market.createdAtS + cancelS) * 1000), `owner cancels ${market.conditionId.slice(0, 10)}`, () => this.ownerCancel(market.conditionId));
    }
  }

  /** The creator cancels a PENDING market now, as the creator's own account (impersonated on the local chain). */
  async ownerCancel(conditionId: Hex): Promise<void> {
    await this.sync();
    const market = this.markets.get(conditionId);
    const chain = this.env().chains.xo;
    if (market === undefined || chain === undefined || market.status !== "PENDING") return;
    await this.env().chains.syncToClock(this.env().clock);
    await chain.anvil.rpc("anvil_impersonateAccount", [market.creator]);
    await chain.anvil.rpc("anvil_setBalance", [market.creator, "0xde0b6b3a7640000"]);
    try {
      const receipt = await chain.sendFrom(market.creator, MARKET_MANAGER, encodeFunctionData({ abi: MARKET_MANAGER_ABI, functionName: "cancelMarket", args: [conditionId] }));
      if (receipt.status !== "success") throw new Error("the creator's cancel reverted");
    } finally {
      await chain.anvil.rpc("anvil_stopImpersonatingAccount", [market.creator]);
    }
    await this.sync();
  }

  private scheduleMetadataUpdate(market: CreatedMarket): void {
    const env = this.env();
    const wanted = this.policy.metadataUpdate ?? plannedMetadataUpdate(market.conditionId);
    if (!wanted) return;
    const delayS = 3600 + Math.round(draw(market.conditionId, "metadata-delay") * 47 * 3600);
    env.scheduler.after(delayS * 1000, `metadata update ${market.conditionId.slice(0, 10)}`, () => this.updateMetadata(market.conditionId));
  }

  /** The first review of a PENDING market now (the scheduler calls this; a test may too). */
  async review(conditionId: Hex, forced?: ReviewDecisionName): Promise<void> {
    const env = this.env();
    await this.sync();
    const market = this.markets.get(conditionId);
    const chain = env.chains.xo;
    if (market === undefined || chain === undefined) return;
    const status = (await chain.publicClient.readContract({ address: MARKET_MANAGER, abi: MANAGER_STUB_ABI, functionName: "stubStatusPlusOne", args: [conditionId] })) as bigint;
    // The creator cancelled before the oracle looked (2 percent of the observed markets), or it was reviewed.
    if (Number(status) !== MANAGER_STATUS.PENDING + 1) return;
    const foreign = !isXoMetadataHost(market.metadataUri);
    const foreignRejected = foreign && env.switches.get("meta.foreign_uri") === "rejected";
    const planned = this.policy.decision ?? sampleOutcome(draw(conditionId, "decision"));
    // "cancel" is not an oracle decision: if the creator has not cancelled yet, the oracle reviews it normally (approve).
    const decision: ReviewDecisionName = forced ?? (foreignRejected ? "reject" : planned === "cancel" ? "approve" : planned);
    await env.chains.syncToClock(env.clock);
    const now = await chain.blockTimestamp();
    let suggestedUri = "";
    let suggestedExpiresAt = 0;
    let windowEnd = 0;
    let nextStatus: number = MANAGER_STATUS.ACTIVE;
    let notes = this.policy.notes ?? "Approved: the market meets the listing guidelines.";
    if (decision === "reject") {
      nextStatus = MANAGER_STATUS.CANCELLED;
      notes = this.policy.notes ?? (foreignRejected ? "Rejected: the metadata URI is not hosted by XO." : "Rejected: the market duplicates an existing market.");
    } else if (decision === "update") {
      nextStatus = MANAGER_STATUS.UPDATE_REQUIRED;
      const windowS = this.policy.windowS ?? sampleWindowSeconds(draw(conditionId, "window"));
      windowEnd = now + windowS;
      suggestedUri = `https://${XO_BUCKET_GCS.host}${XO_BUCKET_GCS.prefix}suggested-${conditionId.slice(2, 18)}.json`;
      const change = this.policy.changeExpiry ?? plannedExpiryChange(conditionId);
      if (change) suggestedExpiresAt = Math.max(now + 3600, market.expiresAt + 2 * 86_400);
      notes = this.policy.notes ?? "Update required: the resolution criteria need a source and an exact end time.";
    }
    const data = encodeAbiParameters(
      [{ type: "uint8" }, { type: "string" }, { type: "string" }, { type: "uint40" }, { type: "uint40" }],
      [REVIEW_DECISION[decision], suggestedUri, notes, suggestedExpiresAt, windowEnd],
    );
    await this.oracleCalls([
      encodeFunctionData({ abi: MANAGER_STUB_ABI, functionName: "stubSetState", args: [conditionId, BigInt(nextStatus + 1), BigInt(windowEnd)] }),
      encodeFunctionData({ abi: MANAGER_STUB_ABI, functionName: "stubEmit2", args: [TOPIC_MARKET_REVIEWED, conditionId, data] }),
    ]);
    await this.sync();
  }

  /** XO rewriting an ACTIVE market's metadata (MetadataUpdated). */
  async updateMetadata(conditionId: Hex, newUri?: string): Promise<void> {
    await this.sync();
    const market = this.markets.get(conditionId);
    if (market === undefined || market.status !== "ACTIVE") return;
    const uri = newUri ?? `https://${XO_BUCKET_GCS.host}${XO_BUCKET_GCS.prefix}updated-${conditionId.slice(2, 18)}.json`;
    await this.env().chains.syncToClock(this.env().clock);
    await this.oracleCalls([
      encodeFunctionData({ abi: MANAGER_STUB_ABI, functionName: "stubEmit2", args: [TOPIC_METADATA_UPDATED, conditionId, encodeAbiParameters([{ type: "string" }], [uri])] }),
    ]);
    await this.sync();
  }

  private async oracleCalls(calls: readonly Hex[]): Promise<void> {
    const chain = this.env().chains.xo;
    if (chain === undefined) return;
    await chain.anvil.rpc("anvil_impersonateAccount", [XO_ORACLE]);
    try {
      for (const data of calls) {
        const receipt = await chain.sendFrom(XO_ORACLE, MARKET_MANAGER, data);
        if (receipt.status !== "success") throw new Error("the mock oracle's call to the manager stub reverted");
      }
    } finally {
      await chain.anvil.rpc("anvil_stopImpersonatingAccount", [XO_ORACLE]);
    }
  }
}
