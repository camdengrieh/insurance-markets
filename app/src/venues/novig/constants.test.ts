import { describe, expect, it } from "vitest";

import { BROWSER_DIRECT_ORIGINS, READ_SERVICES } from "../../../headers.config";
import { cmpQty, parseQty, subQty, type Qty } from "../../core/money";
import { createNovigAdapter } from "./adapter";
import { NOVIG_ORIGIN, NOVIG_READ_SERVICE, NOVIG_TICK_RANGES } from "./constants";
import { depsOf } from "./fixtures/fake-fetch";

const price = (text: string): Qty => parseQty("price", text) as Qty;

// Is a price on the documented grid? Exact: the distance from the start of its range is a whole number of ticks.
function onGrid(text: string): boolean {
  const value = price(text);
  for (const range of NOVIG_TICK_RANGES) {
    if (cmpQty(value, price(range.from)) < 0 || cmpQty(value, price(range.to)) > 0) continue;
    const distance = subQty(value, price(range.from));
    const tick = price(range.tick);
    const scale = Math.max(distance.scale, tick.scale);
    const left = distance.atomic * 10n ** BigInt(scale - distance.scale);
    const step = tick.atomic * 10n ** BigInt(scale - tick.scale);
    return left % step === 0n;
  }
  return false;
}

describe("Novig constants", () => {
  it("name the origin and service that headers.config.ts lists", () => {
    expect(BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === NOVIG_READ_SERVICE)?.origin).toBe(NOVIG_ORIGIN);
    expect(READ_SERVICES).toContain(NOVIG_READ_SERVICE);
  });

  it("describe the documented tick grid", () => {
    expect(NOVIG_TICK_RANGES).toHaveLength(3);
    for (const text of ["0.001", "0.05", "0.055", "0.295", "0.665", "0.945", "0.95", "0.999"]) expect(onGrid(text), text).toBe(true);
    for (const text of ["0.0005", "0.052", "0.297", "0.9495", "0.9995", "1"]) expect(onGrid(text), text).toBe(false);
  });

  it("refuse a market type list that could change the request", () => {
    const { deps } = depsOf({});
    expect(() => createNovigAdapter(deps, { marketTypes: ["MONEY&limit=1"] })).toThrow(RangeError);
    expect(() => createNovigAdapter(deps, { marketTypes: ["MONEY", "total", "SPREAD"] })).not.toThrow();
  });
});
