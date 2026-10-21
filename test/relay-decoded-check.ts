import type { RelayResult } from "../src/relay/contract.js";
import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";

// Test-rig hook (amendment R1): every prepared item a relay test gets back is run through verifyPrepared with the
// repo's own rebuild. A prepare whose decoded block does not rebuild to the digest, the tags and the summary it came
// with fails the test that asked for it, so the many existing prepare tests double as R1/R2 tests.

const PREPARE_PATHS: ReadonlySet<string> = new Set(["/v1/userop/prepare", "/v1/order/prepare", "/v1/auth/prepare", "/v1/clob/order/prepare", "/v1/clob/auth/prepare"]);

export function checkDecoded<T>(path: string, result: RelayResult<T>): RelayResult<T> {
  if (!result.ok || !PREPARE_PATHS.has(path)) return result;
  const verdict = verifyPreparedLocal(result.data);
  if (!verdict.ok) throw new Error(`the item prepared by ${path} does not rebuild from its decoded block: ${verdict.status} at ${verdict.field}: ${verdict.reason}`);
  return result;
}
