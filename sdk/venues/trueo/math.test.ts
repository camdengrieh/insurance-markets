import { describe, expect, it } from "vitest";

import { toDec } from "../../money/qty.js";
import { poolIdOf, ratioQty, sqrtPriceToPrice, type PoolKey } from "./math.js";
import type { Address } from "./rpc.js";

const TYD = "0xb13CF163d916917d9cD6E836905cA5f12a1dEF4B" as Address;
const HOOK = "0x3E83479B2276EcFb7C7181F67b5d092d3511e0C4" as Address;
const YES = "0x1111111111111111111111111111111111111111" as Address;

describe("pool id", () => {
  it("is keccak256(abi.encode(poolKey)): a vector computed with Foundry's cast", () => {
    // cast keccak $(cast abi-encode "f(address,address,uint24,int24,address)" YES TYD 1 60 HOOK)
    const key: PoolKey = { currency0: YES, currency1: TYD, fee: 1, tickSpacing: 60, hooks: HOOK };
    expect(poolIdOf(key)).toBe("0x84564fc8fde8aeb9b26c3ab8632647e4f7a9c8d73fb4d69cd82bbbe5b99b74fa");
  });

  it("changes with every field of the key", () => {
    const base: PoolKey = { currency0: YES, currency1: TYD, fee: 1, tickSpacing: 60, hooks: HOOK };
    const ids = new Set([
      poolIdOf(base),
      poolIdOf({ ...base, fee: 8000 }),
      poolIdOf({ ...base, tickSpacing: 61 }),
      poolIdOf({ ...base, hooks: "0x1cFeAD8E66cebC5E51093Dfd247Ad34f841740c4" }),
      poolIdOf({ ...base, currency0: "0x2222222222222222222222222222222222222222" }),
    ]);
    expect(ids.size).toBe(5);
  });
});

describe("sqrtPriceX96 -> TYD price (research 11 section 7.2)", () => {
  it("decodes the note's worked example: YES at 0.1482 (the site printed 0.14820014)", () => {
    // Market 0xa96ac028: YES token is currency0, so price = P x 1e12 with P = (sqrt / 2^96)^2.
    const price = sqrtPriceToPrice(30500284735263970804878n, true);
    expect(price).not.toBeNull();
    // 0.14820014206363...: half up at 12 places is ...064 (truncation would give ...063).
    expect(toDec(price as never)).toBe("0.148200142064");
  });

  it("uses 1e12 / P when TYD is currency0, and the two forms are inverse of each other", () => {
    // sqrt = 2e6 x 2^96 means P = 4e12, so 1e12 / P = 0.25 exactly.
    const sqrt = 2_000_000n * 2n ** 96n;
    expect(toDec(sqrtPriceToPrice(sqrt, false) as never)).toBe("0.25");
    // The same sqrt read with the outcome as currency0 is 4e12 x 1e12, far above 1 TYD: refused, not shown.
    expect(sqrtPriceToPrice(sqrt, true)).toBeNull();
  });

  it("returns exactly 1 at the upper bound and nothing above it", () => {
    // P = 1e-12 -> price 1: sqrt = 2^96 / 1e6.
    const one = 2n ** 96n / 1_000_000n;
    const price = sqrtPriceToPrice(one, true);
    expect(price).not.toBeNull();
    expect(Number(toDec(price as never))).toBeLessThanOrEqual(1);
    expect(sqrtPriceToPrice(one * 2n, true)).toBeNull();
  });

  it("rounds half up at 12 places and keeps full integer precision for a 160-bit input", () => {
    const sqrt = (1n << 160n) - 1n;
    // Huge P with TYD as currency0: price near 0, never an exception and never a float.
    const price = sqrtPriceToPrice(sqrt, false);
    expect(price === null || toDec(price) === "0").toBe(true);
    // Just under the upper bound still rounds, not truncates: 2^96 / 1e6 is P = 1e-12 minus a hair.
    expect(toDec(sqrtPriceToPrice(2n ** 96n / 1_000_000n, true) as never)).toBe("1");
  });

  it("refuses zero (an uninitialised pool), negative, oversize and wrong-decimals input", () => {
    expect(sqrtPriceToPrice(0n, true)).toBeNull();
    expect(sqrtPriceToPrice(-1n, true)).toBeNull();
    expect(sqrtPriceToPrice(1n << 160n, true)).toBeNull();
    expect(sqrtPriceToPrice(30500284735263970804878n, true, 6, 6)).toBeNull();
    expect(sqrtPriceToPrice(30500284735263970804878n, true, 18, 18)).toBeNull();
  });
});

describe("ratio rounding", () => {
  it("floors a bid and ceils an ask, and is exact when the division is", () => {
    expect(toDec(ratioQty("price", 1n, 3n, 9, "floor"))).toBe("0.333333333");
    expect(toDec(ratioQty("price", 1n, 3n, 9, "ceil"))).toBe("0.333333334");
    expect(toDec(ratioQty("price", 1n, 4n, 9, "ceil"))).toBe("0.25");
    expect(toDec(ratioQty("price", 6n, 3n, 9, "ceil"))).toBe("2");
  });

  it("rejects a non-positive denominator and a negative numerator", () => {
    expect(() => ratioQty("price", 1n, 0n, 9, "floor")).toThrow();
    expect(() => ratioQty("price", -1n, 3n, 9, "floor")).toThrow();
  });
});
