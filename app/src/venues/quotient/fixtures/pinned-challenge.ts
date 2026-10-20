import { PINNED_PAYMENT } from "../constants";
import { ROUTES } from "../routes";

// Test input only, imported by tests. It is NOT a Quotient response and NOT a recording: it is the unpaid x402
// challenge the client's own pinned tuple (constants.ts PINNED_PAYMENT) and price table (routes.ts) say a
// well-formed answer would carry. The payment tests mutate it field by field to prove that every deviation from the
// pinned tuple is a hard stop. No Quotient response body is committed to this repository (restricted terms).

const atomic = (usd: string): string => {
  const [whole = "0", fraction = ""] = usd.split(".");
  return `${whole}${fraction.padEnd(PINNED_PAYMENT.decimals, "0")}`.replace(/^0+(?=\d)/, "");
};

export const challenge = {
  x402Version: PINNED_PAYMENT.x402Version,
  accepts: [
    {
      scheme: PINNED_PAYMENT.scheme,
      network: PINNED_PAYMENT.network,
      amount: atomic(ROUTES.mispriced.priceUsd),
      asset: PINNED_PAYMENT.asset,
      payTo: PINNED_PAYMENT.payTo,
      maxTimeoutSeconds: PINNED_PAYMENT.maxTimeoutSeconds,
    },
  ],
};
