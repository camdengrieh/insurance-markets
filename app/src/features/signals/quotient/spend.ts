import { addQty, cmpQty, parseQty, toDec, zero, type Qty } from "../../../core/money";
import type { Dec } from "../../../core/ports";
import { MAX_CALL_USD, MAX_DAY_USD } from "./constants";
import { ROUTES, type RouteId } from "./routes";

// The spend meter (M3 "spend meter", research 26 8.3). It counts what the user's own key is charged for: the
// table price of each paid call that came back 200 with a key attached. It is an ESTIMATE (the gateway's own
// ledger is authoritative) and it lives in this tab's memory only. It never writes anywhere, so a reload resets
// it; the prepaid balance on the key is the hard cap, this meter is the early warning and a second brake.

export const HARD_MAX_DAILY_BUDGET_USD: Dec = "20";
const DAY_MS = 86_400_000;

export interface SpendSnapshot {
  readonly sessionUsd: Dec;
  readonly todayUsd: Dec;
  readonly dailyBudgetUsd: Dec;
  readonly perCallLimitUsd: Dec;
  readonly paidCalls: number;
  // Always true: counted from the price table, not read from Quotient's ledger.
  readonly estimated: true;
}

export type SpendCheck = { readonly ok: true } | { readonly ok: false; readonly reason: "call_above_limit" | "day_budget_reached" };

export class SpendMeter {
  readonly #nowMs: () => number;
  readonly #budget: Qty;
  readonly #perCall: Qty;
  #session: Qty;
  #today: Qty;
  #day: number;
  #calls = 0;

  constructor(nowMs: () => number, dailyBudgetUsd: Dec = MAX_DAY_USD) {
    const budget = parseQty("usd", dailyBudgetUsd);
    const hard = parseQty("usd", HARD_MAX_DAILY_BUDGET_USD);
    const perCall = parseQty("usd", MAX_CALL_USD);
    if (budget === null || hard === null || perCall === null || budget.atomic <= 0n || cmpQty(budget, hard) > 0) throw new RangeError("daily budget must be above 0 and at most 20 USD");
    this.#nowMs = nowMs;
    this.#budget = budget;
    this.#perCall = perCall;
    this.#session = zero("usd");
    this.#today = zero("usd");
    this.#day = Math.floor(nowMs() / DAY_MS);
  }

  #roll(): void {
    const day = Math.floor(this.#nowMs() / DAY_MS);
    if (day !== this.#day) {
      this.#day = day;
      this.#today = zero("usd");
    }
  }

  check(route: RouteId): SpendCheck {
    this.#roll();
    const price = parseQty("usd", ROUTES[route].priceUsd);
    if (price === null) return { ok: false, reason: "call_above_limit" };
    if (cmpQty(price, this.#perCall) > 0) return { ok: false, reason: "call_above_limit" };
    if (cmpQty(addQty(this.#today, price), this.#budget) > 0) return { ok: false, reason: "day_budget_reached" };
    return { ok: true };
  }

  record(route: RouteId): void {
    this.#roll();
    const price = parseQty("usd", ROUTES[route].priceUsd);
    if (price === null || price.atomic === 0n) return;
    this.#session = addQty(this.#session, price);
    this.#today = addQty(this.#today, price);
    this.#calls += 1;
  }

  snapshot(): SpendSnapshot {
    this.#roll();
    return {
      sessionUsd: toDec(this.#session),
      todayUsd: toDec(this.#today),
      dailyBudgetUsd: toDec(this.#budget),
      perCallLimitUsd: toDec(this.#perCall),
      paidCalls: this.#calls,
      estimated: true,
    };
  }

  reset(): void {
    this.#session = zero("usd");
    this.#today = zero("usd");
    this.#calls = 0;
  }
}
