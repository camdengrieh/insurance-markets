import { apiServability, type Servability } from "../sdk/venues/licence.js";

// The one place the API decides what it may serve (docs/sdk-and-api-design.md section 5, binding):
//
//   - Quotient responses: never (Quotient is not a venue; no code here reads it);
//   - own_use_only venues (Kalshi and five more): never read, cached or served;
//   - venues whose licence is unknown: never, until a person records a class in sdk/venues/policy.ts;
//   - links as approved: only when a person approved them (groups.ts); every candidate is served as "proposed".
//
// `ServingPolicy.servability` decides BEFORE anything is read: a venue that is not served gets no reader, no cache entry
// and no request. `checkBody` then walks every answer before it is sent and refuses (as an internal error, never as a
// partial answer) any object that names a venue the policy does not serve under a `venue` key. /v1/venues lists every
// venue under `id` with its verdict: that list is our own policy table, not venue data.
//
// The policy is code. main.ts always uses API_SERVING_POLICY (sdk/venues/licence.ts); no variable or file can widen it.
// Tests may construct the app with another policy only to exercise a path no venue reaches today (a venue being served
// on a chain the index reads), and the gate test walks every endpoint with the real one.

export interface ServingPolicy {
  servability(venue: unknown): Servability;
}

export const API_SERVING_POLICY: ServingPolicy = Object.freeze({ servability: apiServability });

export class ServingViolation extends Error {
  constructor() {
    super("an answer named a venue the API does not serve; nothing was sent");
    this.name = "ServingViolation";
  }
}

const MAX_NODES = 200_000;

// Throws ServingViolation when any object in `body` carries a `venue` the policy does not serve. Iterative.
export function checkBody(policy: ServingPolicy, body: unknown): void {
  const stack: unknown[] = [body];
  let seen = 0;
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value !== "object" || value === null) continue;
    seen += 1;
    if (seen > MAX_NODES) throw new ServingViolation();
    if (Array.isArray(value)) {
      for (const item of value) stack.push(item);
      continue;
    }
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, "venue") && !policy.servability(record["venue"]).served) throw new ServingViolation();
    for (const key of Object.keys(record)) stack.push(record[key]);
  }
}
