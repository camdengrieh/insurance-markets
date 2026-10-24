import { setSignEntropy } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { deriveTradingKey } from "./derive";
import { fakeWallet } from "./testkit";

// A wallet that signs with random nonces gives a different (valid) signature for the same message each time, so it could
// never make the same account again. viem's signing entropy stands in for such a wallet; it is a process-wide switch, so
// this test has a file (and so a module instance) of its own.

describe("a wallet that does not sign deterministically", () => {
  it("is refused on first creation, with the passkey offered instead", async () => {
    setSignEntropy(true);
    const result = await deriveTradingKey(fakeWallet(), { confirm: true });
    expect(result).toMatchObject({ ok: false, reason: "not_deterministic" });
    if (!result.ok) expect(result.message).toMatch(/passkey/);
  });
});
