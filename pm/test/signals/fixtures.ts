// Test inputs for the pm/signals tests. Quotient has restricted terms and every route that carries data is paid, so no
// Quotient response body exists in this repository: the earlier hand-written "synthetic-shape" row builders were
// deleted together with the tests that read them. What stays here is not a Quotient response either:
//   the fixed clock and the flag objects, and
//   `challenge`, the unpaid x402 challenge the pinned tuple (signals/constants.ts PAYMENT_PIN) says a well-formed answer
//   would carry; the payment tests mutate it field by field to prove that every deviation is a hard stop.

export const NOW_MS = Date.parse("2026-10-20T12:00:00Z");
export const FLAG_ON = { enabled: true } as const;
export const FLAG_OFF = { enabled: false } as const;

type Json = Record<string, unknown>;

// Valid challenge for the described URL, as decoded from a free unpaid 402.
export function challenge(url: string, amount = "20000", overrides: Json = {}): Json {
  return {
    x402Version: 2,
    error: "payment_required",
    resource: { url },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount,
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0xC3d01FD2F79d4c57aD106AB8ecc12a5dE24F97cB",
        maxTimeoutSeconds: 300,
        extra: { name: "USD Coin", version: "2" },
      },
    ],
    ...overrides,
  };
}
