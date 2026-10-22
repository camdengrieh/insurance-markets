import { decodeEventLog, encodePacked, keccak256, parseAbi, toEventSelector, type Abi } from "viem";

import type { Address, Hex, RpcLog } from "./rpc.js";

// Gnosis Conditional Tokens (ERC-1155), as deployed by Polymarket on Polygon, Limitless on Base and XO on its own
// chain. Everything here is pure: the ABI fragments the readers call, the position-id derivation, and the event
// decoders. The derivation and every signature below were read from the verified source of the Polygon deployment
// (Sourcify, chain 137, 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045, ConditionalTokens.sol, solc 0.5.10, read
// 2026-10-22: `library CTHelpers`, the ERC1155 and ConditionalTokens events); the Base deployment's verified source
// is the same @gnosis.pm/conditional-tokens-contracts package. readers.test.ts checks the derivation against eth_call
// answers of the deployed `getCollectionId` and `getPositionId` and against the venues' own token ids.

export const CTF_ABI = parseAbi([
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] owners, uint256[] ids) view returns (uint256[])",
  "function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)",
  "function payoutDenominator(bytes32 conditionId) view returns (uint256)",
  "function getOutcomeSlotCount(bytes32 conditionId) view returns (uint256)",
  "function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)",
  "function getPositionId(address collateralToken, bytes32 collectionId) pure returns (uint256)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)",
]);

export const TRANSFER_SINGLE_TOPIC = toEventSelector("TransferSingle(address,address,address,uint256,uint256)");
export const TRANSFER_BATCH_TOPIC = toEventSelector("TransferBatch(address,address,address,uint256[],uint256[])");
export const CONDITION_RESOLUTION_TOPIC = toEventSelector("ConditionResolution(bytes32,address,bytes32,uint256,uint256[])");

const BYTES32 = /^0x[0-9a-fA-F]{64}$/;
const ZERO32 = `0x${"00".repeat(32)}` as Hex;

// ---- position ids -------------------------------------------------------------------------------------------------------

// alt_bn128: y^2 = x^3 + 3 over the prime field P (CTHelpers.P and CTHelpers.B).
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const B = 3n;

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if ((e & 1n) === 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

// CTHelpers.sqrt raises to (P + 1) / 4 (its addition chain's comment says so); P is 3 mod 4, so that is a square
// root whenever one exists. The caller checks y * y == yy, as the contract does.
function sqrtModP(value: bigint): bigint {
  return modPow(value, (P + 1n) / 4n, P);
}

function curvePoint(x: bigint, odd: boolean): { x: bigint; y: bigint } | null {
  const yy = (modPow(x, 3n, P) + B) % P;
  let y = sqrtModP(yy);
  if ((y * y) % P !== yy) return null;
  if ((odd && y % 2n === 0n) || (!odd && y % 2n === 1n)) y = P - y;
  return { x, y };
}

// CTHelpers.getCollectionId(ZERO, conditionId, indexSet), statement by statement: the collection of a top-level
// position. A nested collection (a non-zero parent) adds the parent's curve point through the alt_bn128 precompile;
// no venue read here uses one, and that path is refused rather than reimplemented untested.
export function collectionIdOf(parentCollectionId: Hex, conditionId: Hex, indexSet: bigint): Hex {
  if (!BYTES32.test(parentCollectionId) || !BYTES32.test(conditionId)) throw new RangeError("a collection or condition id is not 32 bytes");
  if (BigInt(parentCollectionId) !== 0n) throw new RangeError("nested collections are not derived");
  if (indexSet <= 0n || indexSet >= 1n << 256n) throw new RangeError("the index set is out of range");
  let x1 = BigInt(keccak256(encodePacked(["bytes32", "uint256"], [conditionId, indexSet])));
  const odd = x1 >> 255n !== 0n;
  let point: { x: bigint; y: bigint } | null = null;
  // The do/while of the contract: step x until x^3 + 3 is a square.
  for (let tries = 0; tries < 10_000 && point === null; tries += 1) {
    x1 = (x1 + 1n) % P;
    point = curvePoint(x1, odd);
  }
  if (point === null) throw new RangeError("no curve point found");
  let x = point.x;
  if (point.y % 2n === 1n) x ^= 1n << 254n;
  return `0x${x.toString(16).padStart(64, "0")}` as Hex;
}

// CTHelpers.getPositionId(collateralToken, collectionId): the ERC-1155 id.
export function positionIdOf(collateralToken: Address, collectionId: Hex): bigint {
  if (!/^0x[0-9a-fA-F]{40}$/.test(collateralToken) || !BYTES32.test(collectionId)) throw new RangeError("a collateral or collection id is malformed");
  return BigInt(keccak256(encodePacked(["address", "bytes32"], [collateralToken, collectionId])));
}

// The position ids of a binary condition's two singleton collections (index sets 1 and 2), in outcome order, for a
// top-level position (parent collection zero).
export function binaryPositionIds(collateralToken: Address, conditionId: Hex): readonly [bigint, bigint] {
  return [positionIdOf(collateralToken, collectionIdOf(ZERO32, conditionId, 1n)), positionIdOf(collateralToken, collectionIdOf(ZERO32, conditionId, 2n))];
}

// ---- payouts ------------------------------------------------------------------------------------------------------------

export type Payouts =
  // payoutDenominator is zero: the oracle has not reported.
  | { readonly state: "unresolved" }
  | { readonly state: "resolved"; readonly numerators: readonly bigint[]; readonly denominator: bigint };

// Builds the payout vector from the contract's own reads. A denominator that is not the sum of the numerators, or a
// count that does not match the slot count, is refused: the contract sets both together in reportPayouts.
export function payoutsOf(denominator: bigint, numerators: readonly bigint[], slotCount: bigint | null): Payouts | null {
  if (denominator === 0n) return numerators.every((n) => n === 0n) ? { state: "unresolved" } : null;
  if (slotCount !== null && BigInt(numerators.length) !== slotCount) return null;
  const sum = numerators.reduce((total, n) => total + n, 0n);
  if (sum !== denominator || numerators.some((n) => n < 0n)) return null;
  return { state: "resolved", numerators: Object.freeze([...numerators]), denominator };
}

// ---- events ---------------------------------------------------------------------------------------------------------------

export interface TransferRow {
  readonly ledger: Address;
  readonly operator: Address;
  readonly from: Address;
  readonly to: Address;
  readonly id: bigint;
  readonly value: bigint;
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
  readonly logIndex: number;
}

export interface ConditionResolutionRow {
  readonly ledger: Address;
  readonly conditionId: Hex;
  readonly oracle: Address;
  readonly questionId: Hex;
  readonly outcomeSlotCount: bigint;
  readonly payoutNumerators: readonly bigint[];
  readonly blockNumber: bigint;
  readonly transactionHash: Hex;
}

function decode(abi: Abi, log: RpcLog): { eventName: string; args: Record<string, unknown> } | null {
  try {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
    return { eventName: String(decoded.eventName), args: (decoded.args ?? {}) as Record<string, unknown> };
  } catch {
    return null;
  }
}

function lower(value: unknown): Address | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? (value.toLowerCase() as Address) : null;
}

// TransferSingle and TransferBatch of an ERC-1155 ledger (Conditional Tokens, Polymarket's PositionManager), one row
// per id. A log from any other emitter than `ledger`, or one that does not decode, is null.
export function decodeTransfers(log: RpcLog, ledger: Address): readonly TransferRow[] | null {
  if (log.address.toLowerCase() !== ledger.toLowerCase()) return null;
  const decoded = decode(CTF_ABI, log);
  if (decoded === null) return null;
  const { eventName, args } = decoded;
  const operator = lower(args["operator"]);
  const from = lower(args["from"]);
  const to = lower(args["to"]);
  if (operator === null || from === null || to === null) return null;
  const base = { ledger: ledger.toLowerCase() as Address, operator, from, to, blockNumber: log.blockNumber, transactionHash: log.transactionHash, logIndex: log.logIndex };
  if (eventName === "TransferSingle" && typeof args["id"] === "bigint" && typeof args["value"] === "bigint") return [{ ...base, id: args["id"], value: args["value"] }];
  if (eventName === "TransferBatch") {
    const ids = args["ids"];
    const values = args["values"];
    if (!Array.isArray(ids) || !Array.isArray(values) || ids.length !== values.length) return null;
    if (!ids.every((id) => typeof id === "bigint") || !values.every((value) => typeof value === "bigint")) return null;
    return ids.map((id, index) => ({ ...base, id: id as bigint, value: values[index] as bigint }));
  }
  return null;
}

export function decodeConditionResolution(log: RpcLog, ledger: Address): ConditionResolutionRow | null {
  if (log.address.toLowerCase() !== ledger.toLowerCase()) return null;
  const decoded = decode(CTF_ABI, log);
  if (decoded === null || decoded.eventName !== "ConditionResolution") return null;
  const { args } = decoded;
  const oracle = lower(args["oracle"]);
  const numerators = args["payoutNumerators"];
  if (oracle === null || typeof args["conditionId"] !== "string" || typeof args["questionId"] !== "string" || typeof args["outcomeSlotCount"] !== "bigint") return null;
  if (!Array.isArray(numerators) || !numerators.every((n) => typeof n === "bigint")) return null;
  return {
    ledger: ledger.toLowerCase() as Address,
    conditionId: (args["conditionId"] as string).toLowerCase() as Hex,
    oracle,
    questionId: (args["questionId"] as string).toLowerCase() as Hex,
    outcomeSlotCount: args["outcomeSlotCount"],
    payoutNumerators: numerators as bigint[],
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
  };
}
