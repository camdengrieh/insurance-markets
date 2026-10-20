import { spec as t0 } from "../t0-paybox-signing.js";
import { spec as t1 } from "../t1-deploy-enable-trading.js";
import { spec as t2 } from "../t2-credentials.js";
import { spec as t3a } from "../t3a-deposit.js";
import { spec as t3b } from "../t3b-first-order.js";
import { spec as t3c } from "../t3c-fee-reconciliation.js";
import { spec as t4 } from "../t4-exit.js";
import { spec as t5 } from "../t5-redeem.js";
import { spec as t6 } from "../t6-creation.js";
import { spec as t6b } from "../t6b-seed.js";
import { spec as t8 } from "../t8-capped-allowance.js";
import type { TestSpec } from "./types.js";

// Every test of the kit, in the order docs/phase1-gap-closing.md section 6 recommends: T0, T1, T2, T3a, T4,
// T3b (T3c after it, optional), T5, T8, then T6 and T6b.
export const ALL_SPECS: readonly TestSpec[] = Object.freeze([t0, t1, t2, t3a, t4, t3b, t3c, t5, t8, t6, t6b]);

export function specById(id: string): TestSpec | undefined {
  return ALL_SPECS.find((spec) => spec.id.toLowerCase() === id.toLowerCase());
}
