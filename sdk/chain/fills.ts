import { decodeEventLog, getAddress, padHex, parseAbi, toEventSelector, type Abi } from "viem";

import { POLYMARKET_EXCHANGE_ABI, POLYMARKET_ORDER_FILLED_TOPIC } from "./polymarket/abi.js";
import { RpcError, type Address, type Hex, type RpcLog, type RpcPort, type RpcRequestOptions } from "./rpc.js";

// OrderFilled events of the three venues' exchange contracts, one decoder per verified ABI, and a reader that only
// ever asks for a bounded block range of one pinned exchange. A fill is what the chain settled: the maker, the taker,
// the amounts that moved and the fee. Prices are not in the event; a caller that wants one divides the two amounts
// and says so.
//
// Signatures, from the verified sources (read 2026-10-22):
//   Polymarket CTF and Neg Risk exchanges and the Protocol V2 Exchange (Sourcify, chain 137): see polymarket/abi.ts.
//   Limitless CTF and NegRisk exchanges, all versions (Sourcify exact_match, chain 8453):
//     OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId,
//                 uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)
//   XO CTFExchange implementation (verified on XO's explorer; docs/research/fixtures/gaps/userop-templates/abi):
//     OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId,
//                 uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee,
//                 address beneficiary, bytes16 identifier, bytes32 metadata)

export const LIMITLESS_EXCHANGE_ABI = parseAbi([
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)",
]);
export const LIMITLESS_ORDER_FILLED_TOPIC = toEventSelector("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");

export const XO_EXCHANGE_FILL_ABI = parseAbi([
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee, address beneficiary, bytes16 identifier, bytes32 metadata)",
]);
export const XO_ORDER_FILLED_TOPIC = toEventSelector("OrderFilled(bytes32,address,address,uint256,uint256,uint256,uint256,uint256,address,bytes16,bytes32)");

export type FillShape = "polymarket" | "limitless" | "xo";

export interface Fill {
  readonly exchange: Address;
  readonly orderHash: Hex;
  readonly maker: Address;
  readonly taker: Address;
  // The outcome token: Polymarket names it; the others name the two asset ids, one of which is 0 (collateral).
  readonly tokenId: bigint;
  // "buy": the maker paid collateral for the outcome token. Polymarket states it; for the others it follows from
  // which asset id is 0.
  readonly side: "buy" | "sell";
  readonly makerAmountFilled: bigint;
  readonly takerAmountFilled: bigint;
  readonly fee: bigint;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
}

const SHAPES: Readonly<Record<FillShape, { readonly abi: Abi; readonly topic: Hex }>> = {
  polymarket: { abi: POLYMARKET_EXCHANGE_ABI, topic: POLYMARKET_ORDER_FILLED_TOPIC },
  limitless: { abi: LIMITLESS_EXCHANGE_ABI, topic: LIMITLESS_ORDER_FILLED_TOPIC },
  xo: { abi: XO_EXCHANGE_FILL_ABI, topic: XO_ORDER_FILLED_TOPIC },
};

export function orderFilledTopic(shape: FillShape): Hex {
  return SHAPES[shape].topic;
}

// One OrderFilled log, or null when it is from another emitter or does not decode as `shape`.
export function decodeFill(log: RpcLog, exchange: Address, shape: FillShape): Fill | null {
  if (log.address.toLowerCase() !== exchange.toLowerCase() || log.topics[0] !== SHAPES[shape].topic) return null;
  let args: Record<string, unknown>;
  try {
    args = decodeEventLog({ abi: SHAPES[shape].abi, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true }).args as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const big = (key: string): bigint | null => (typeof args[key] === "bigint" ? (args[key] as bigint) : null);
  const maker = typeof args["maker"] === "string" ? (args["maker"] as string).toLowerCase() : null;
  const taker = typeof args["taker"] === "string" ? (args["taker"] as string).toLowerCase() : null;
  const orderHash = typeof args["orderHash"] === "string" ? (args["orderHash"] as string).toLowerCase() : null;
  const makerAmountFilled = big("makerAmountFilled");
  const takerAmountFilled = big("takerAmountFilled");
  const fee = big("fee");
  if (maker === null || taker === null || orderHash === null || makerAmountFilled === null || takerAmountFilled === null || fee === null) return null;
  let tokenId: bigint;
  let side: Fill["side"];
  if (shape === "polymarket") {
    const id = big("tokenId");
    const rawSide = typeof args["side"] === "number" ? args["side"] : null;
    if (id === null || (rawSide !== 0 && rawSide !== 1)) return null;
    tokenId = id;
    side = rawSide === 0 ? "buy" : "sell";
  } else {
    const makerAsset = big("makerAssetId");
    const takerAsset = big("takerAssetId");
    if (makerAsset === null || takerAsset === null) return null;
    // Exactly one side is collateral (asset id 0).
    if ((makerAsset === 0n) === (takerAsset === 0n)) return null;
    tokenId = makerAsset === 0n ? takerAsset : makerAsset;
    side = makerAsset === 0n ? "buy" : "sell";
  }
  return {
    exchange: exchange.toLowerCase() as Address,
    orderHash: orderHash as Hex,
    maker: maker as Address,
    taker: taker as Address,
    tokenId,
    side,
    makerAmountFilled,
    takerAmountFilled,
    fee,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
    logIndex: log.logIndex,
  };
}

export interface FillQuery {
  readonly exchange: Address;
  readonly shape: FillShape;
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  // Only fills where this address was the maker (topic2).
  readonly maker?: Address;
}

export interface FillRead {
  readonly fills: readonly Fill[];
  // Logs the node returned for this query that did not decode, or rows it dropped: the answer is incomplete.
  readonly undecoded: number;
  readonly complete: boolean;
}

// One bounded eth_getLogs (the port refuses a range wider than its limit or ending at "latest").
export async function readFills(port: RpcPort, query: FillQuery, options?: RpcRequestOptions): Promise<FillRead> {
  if (query.toBlock < query.fromBlock) throw new RpcError("invalid_input", "bad_block_range");
  const topics: Array<Hex | null> = [SHAPES[query.shape].topic];
  if (query.maker !== undefined) topics.push(null, padHex(getAddress(query.maker).toLowerCase() as Hex, { size: 32 }));
  const read = await port.getLogs({ address: query.exchange, topics, fromBlock: query.fromBlock, toBlock: query.toBlock }, options);
  const fills: Fill[] = [];
  let undecoded = 0;
  for (const log of read.logs) {
    const fill = decodeFill(log, query.exchange, query.shape);
    if (fill === null) undecoded += 1;
    else fills.push(fill);
  }
  return { fills, undecoded, complete: undecoded === 0 && read.droppedMalformed === 0 && read.droppedPending === 0 };
}
