// Gnosis Conditional Tokens position ids, derived here from a condition id.
//
// Why: an XO order names a market only by an opaque 77-digit token id, while the card also shows a "Market
// condition" line that the relay supplies. Deriving the two position ids from the condition id lets the
// checker require that the signed token id really belongs to the condition shown (SC-7). The formula is the
// standard one (parent collection 0, XO's USDC.e as collateral, index sets 1 and 2); the XO docs only say
// "derived from getPositionId(conditionId, indexSet)", so the test pins it against real XO market data.
//
// getCollectionId (parent 0): x = keccak256(conditionId ++ indexSet); odd = top bit of x; then x is bumped by 1
// until x^3 + 3 is a square modulo the alt_bn128 field prime; the collection id is that x, with bit 254 set
// when the original top bit was set. positionId = keccak256(collateral ++ collectionId).

import { concatHex, keccak256, pad, toHex, type Hex } from "viem";

import { USDC_E_ADDRESS } from "../chain/constants.js";

const FIELD_PRIME = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const CURVE_B = 3n;
const BIT_254 = 1n << 254n;
const MAX_STEPS = 1000;

function powMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
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

const word = (value: bigint): Hex => pad(toHex(value), { size: 32 });

export function collectionIdOf(conditionId: Hex, indexSet: bigint): Hex {
  let x = BigInt(keccak256(concatHex([conditionId, word(indexSet)])));
  const odd = x >> 255n !== 0n;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    x = (x + 1n) % FIELD_PRIME;
    const yy = (((x * x) % FIELD_PRIME) * x + CURVE_B) % FIELD_PRIME;
    const y = powMod(yy, (FIELD_PRIME + 1n) / 4n, FIELD_PRIME);
    if ((y * y) % FIELD_PRIME === yy) return word(odd ? x | BIT_254 : x);
  }
  throw new Error("no collection id found");
}

export function positionIdOf(conditionId: Hex, indexSet: bigint, collateral: Hex = USDC_E_ADDRESS): bigint {
  return BigInt(keccak256(concatHex([collateral, collectionIdOf(conditionId, indexSet)])));
}

// The two outcome token ids of a binary market (index sets 1 and 2), as decimal strings.
export function binaryPositionIds(conditionId: Hex): readonly [string, string] {
  return [positionIdOf(conditionId, 1n).toString(10), positionIdOf(conditionId, 2n).toString(10)];
}
