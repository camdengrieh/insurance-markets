import { encodeAbiParameters, getAddress, toEventSelector } from "viem";

import { fromBaseUnits, toDec } from "../../core/money";
import { TRANSFER_EVENT } from "./abi";
import { AdapterFailure } from "./errors";
import type { Address, Hex, Rpc, RpcLog } from "./rpc";

// Opt-in history scan: ERC-20 Transfer logs of one market's YES and NO tokens that involve one owner. It is the
// only use of eth_getLogs, it shows when and how many outcome tokens moved (not what they cost: swap prices are
// not in a Transfer), and it is bounded: the caller names the block range, and a span above MAX_BLOCK_SPAN is
// refused before any request. Public RPCs refuse wide ranges; a refusal is NOT_SUPPORTED with "ask for less".

export const MAX_BLOCK_SPAN = 100_000n;

const TRANSFER_TOPIC = toEventSelector(TRANSFER_EVENT[0]);

export interface TransferEvent {
  readonly token: Address;
  readonly side: "yes" | "no";
  readonly direction: "in" | "out";
  // Outcome-token amount in shares (18 decimals), exact.
  readonly shares: string;
  readonly blockNumber: string;
  readonly transactionHash: Hex;
  readonly logIndex: number;
}

// An address as a 32-byte topic: left-padded.
function ownerTopic(owner: Address): Hex {
  return encodeAbiParameters([{ type: "address" }], [owner]);
}

export async function scanTransfers(
  rpc: Rpc,
  args: { readonly owner: Address; readonly yesToken: Address; readonly noToken: Address; readonly fromBlock: bigint; readonly toBlock: bigint | "latest" },
  deadlineAtMs: number,
): Promise<readonly TransferEvent[]> {
  if (args.fromBlock < 0n || (args.toBlock !== "latest" && args.toBlock < args.fromBlock)) throw new AdapterFailure("trueo", "NOT_SUPPORTED", "bad_block_range");
  if (args.toBlock !== "latest" && args.toBlock - args.fromBlock > MAX_BLOCK_SPAN) throw new AdapterFailure("trueo", "NOT_SUPPORTED", "block_span_too_large");
  const topic = ownerTopic(args.owner);
  const base = { address: [args.yesToken, args.noToken], fromBlock: args.fromBlock, toBlock: args.toBlock } as const;
  const [incoming, outgoing] = await Promise.all([
    rpc.logs({ ...base, topics: [TRANSFER_TOPIC, null, topic] }, deadlineAtMs),
    rpc.logs({ ...base, topics: [TRANSFER_TOPIC, topic, null] }, deadlineAtMs),
  ]);
  const events = new Map<string, TransferEvent>();
  const take = (log: RpcLog, direction: "in" | "out"): void => {
    const token = getAddress(log.address);
    const side = token.toLowerCase() === args.yesToken.toLowerCase() ? "yes" : token.toLowerCase() === args.noToken.toLowerCase() ? "no" : null;
    // A log for an address nobody asked about is not trusted, whatever the node says.
    if (side === null || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) return;
    const value = /^0x[0-9a-fA-F]{64}$/.test(log.data) ? BigInt(log.data) : null;
    const qty = value === null ? null : fromBaseUnits("shares", value, 18);
    if (qty === null) throw new AdapterFailure("trueo", "SCHEMA_DRIFT", "transfer_amount");
    // A self-transfer appears in both filters; keep one row, as "in".
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (events.has(key)) return;
    events.set(key, { token, side, direction, shares: toDec(qty), blockNumber: log.blockNumber.toString(), transactionHash: log.transactionHash, logIndex: log.logIndex });
  };
  for (const log of incoming) take(log, "in");
  for (const log of outgoing) take(log, "out");
  return [...events.values()].sort((a, b) => (BigInt(a.blockNumber) === BigInt(b.blockNumber) ? a.logIndex - b.logIndex : BigInt(a.blockNumber) < BigInt(b.blockNumber) ? -1 : 1));
}
