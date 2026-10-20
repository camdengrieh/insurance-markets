// Builds ChainLog rows for the market manager's events with viem's own encoder, so the review tracker's decoder
// is tested against logs shaped like the explorer's, and a hand parser checks the word layout of note 23 V3.5.

import { encodeAbiParameters, encodeEventTopics, getAbiItem, type AbiEvent } from "viem";

import { MARKET_MANAGER_ABI } from "../../../src/xo/chain/abi.js";
import { MARKET_MANAGER, type Address, type Hex } from "../../../src/xo/chain/constants.js";
import type { ChainLog } from "../../../src/xo/chain/reads.js";

export type ManagerEventName = "CLOBMarketCreated" | "MarketReviewed" | "MarketCreationFeeCharged" | "UpdateRequestResponded" | "MarketCancelledByOwner" | "MetadataUpdated";

function eventItem(name: ManagerEventName): AbiEvent {
  const item = getAbiItem({ abi: MARKET_MANAGER_ABI, name }) as AbiEvent | undefined;
  if (item === undefined) throw new Error(`no event ${name}`);
  return item;
}

export interface LogPosition {
  readonly blockNumber: bigint;
  readonly logIndex: bigint;
  readonly timestamp: bigint | null;
  readonly transactionHash?: Hex | null;
}

export function managerLog(name: ManagerEventName, args: Record<string, unknown>, position: LogPosition, address: string = MARKET_MANAGER): ChainLog {
  const item = eventItem(name);
  const indexed = item.inputs.filter((input) => input.indexed === true);
  const plain = item.inputs.filter((input) => input.indexed !== true);
  const topics = encodeEventTopics({
    abi: [item],
    eventName: name,
    args: Object.fromEntries(indexed.map((input) => [input.name as string, args[input.name as string]])),
  } as never) as Hex[];
  const data = encodeAbiParameters(
    plain as never,
    plain.map((input) => args[input.name as string]) as never,
  );
  return {
    address: address as Address,
    topics: topics.map((topic) => topic.toLowerCase() as Hex),
    data,
    blockNumber: position.blockNumber,
    logIndex: position.logIndex,
    transactionHash: position.transactionHash === undefined ? (`0x${position.blockNumber.toString(16).padStart(64, "0")}` as Hex) : position.transactionHash,
    timestamp: position.timestamp,
  };
}

// The 32-byte words of a log's data, as hex strings without 0x.
export function dataWords(log: ChainLog): string[] {
  const body = log.data.slice(2);
  const words: string[] = [];
  for (let index = 0; index < body.length; index += 64) words.push(body.slice(index, index + 64));
  return words;
}

// One real-looking set of arguments for each event.
export function createdArgs(input: { conditionId: Hex; creator: Address; yes: bigint; no: bigint; collateral: Address; startsAt: number; expiresAt: number; uri: string }): Record<string, unknown> {
  return {
    conditionId: input.conditionId,
    creator: input.creator,
    questionId: `0x${"ab".repeat(32)}`,
    outcome1TokenId: input.yes,
    outcome2TokenId: input.no,
    collateralToken: input.collateral,
    resolver: input.creator,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    creatorFeeBps: 0,
    metadataURI: input.uri,
    marketType: 4,
  };
}
