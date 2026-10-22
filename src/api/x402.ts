import * as z from "zod/v4";

import { formatAtomic } from "../guardrails/amount.js";
import { BASE_USDC as PINNED_BASE_USDC } from "../xo/chain/constants.js";
import { USDC_DECIMALS } from "./config.js";

// Reading the markets API's x402 challenge for a paid route (docs/sdk-and-api-design.md section 4: "x402 per call, USDC on
// Base"). The plugin never pays and never holds a key. It probes the route once, unpaid, reads the 402 it gets back, checks
// it against the operator's own values, and hands PayBox a payment proposal (src/paybox.ts proposeX402) for that exact URL
// with that exact amount as the ceiling. PayBox's documented plugin contract does the rest: it fetches the live 402 itself,
// checks its asset and amount against the proposal, asks the user to approve, pays from an eligible wallet and retries the
// URL; the paid answer reaches the agent through the PayBox request, and the plugin is not resumed.
//
// Both x402 shapes are read: version 2 (the PAYMENT-REQUIRED header, base64 JSON, with `resource.url` and `amount`) and
// version 1 (the JSON body, with `resource` and `maxAmountRequired` on each entry). Of the offered entries, exactly one must
// be the "exact" scheme on Base for USDC; entries for other networks are left alone (the proposal is for Base only), and two
// Base USDC entries are ambiguous and refused. That entry must name the configured payee, ask for no more than the
// configured ceiling, and name the URL that was probed (its origin and path, and its query when it states one). Anything else is a hard stop: no proposal.

// USDC on Base (the pinned constant), the asset src/paybox.ts puts in every Base x402 proposal, in lower case.
export const BASE_USDC = PINNED_BASE_USDC.toLowerCase();
export const BASE_CHAIN = "eip155:8453" as const;
const MAX_ACCEPTS = 8;
const MAX_HEADER_CHARS = 16 * 1024;
const ATOMIC = /^[1-9][0-9]{0,18}$/;

const entryV2 = z.object({
  scheme: z.string().max(40),
  network: z.string().max(80),
  amount: z.string().max(40),
  asset: z.string().max(100),
  payTo: z.string().max(100),
  maxTimeoutSeconds: z.number().int().optional(),
});
const challengeV2 = z.object({
  x402Version: z.literal(2),
  resource: z.object({ url: z.string().max(4096) }),
  accepts: z.array(z.unknown()).min(1).max(MAX_ACCEPTS),
});
const entryV1 = z.object({
  scheme: z.string().max(40),
  network: z.string().max(80),
  maxAmountRequired: z.string().max(40),
  resource: z.string().max(4096),
  asset: z.string().max(100),
  payTo: z.string().max(100),
  maxTimeoutSeconds: z.number().int().optional(),
});
const challengeV1 = z.object({
  x402Version: z.literal(1),
  accepts: z.array(z.unknown()).min(1).max(MAX_ACCEPTS),
});

export type ChallengeRefusal =
  | "no_challenge"
  | "malformed"
  | "no_base_usdc_offer"
  | "ambiguous_offers"
  | "pay_to_mismatch"
  | "amount_invalid"
  | "amount_over_ceiling"
  | "resource_mismatch";

export const REFUSAL_TEXT: Readonly<Record<ChallengeRefusal, string>> = Object.freeze({
  no_challenge: "the API answered 402 without a readable x402 challenge",
  malformed: "the API's x402 challenge does not have the x402 shape",
  no_base_usdc_offer: "the challenge offers no exact payment in USDC on Base",
  ambiguous_offers: "the challenge offers more than one USDC-on-Base payment, so which one PayBox would pay is not certain",
  pay_to_mismatch: "the challenge names a payee other than the configured MARKETS_API_PAY_TO",
  amount_invalid: "the challenge's amount is not a whole number of USDC units above zero",
  amount_over_ceiling: "the challenge asks for more than MARKETS_API_MAX_PAYMENT_USDC",
  resource_mismatch: "the challenge names a resource other than the URL the plugin asked for",
});

// The checked payment requirement, as the proposal and the agent's summary state it.
export interface PaymentRequirement {
  readonly x402Version: 1 | 2;
  readonly url: string;
  readonly network: typeof BASE_CHAIN;
  readonly asset: string;
  readonly payTo: string;
  readonly amountAtomic: string;
  readonly amountUsdc: string;
  readonly maxTimeoutSeconds: number | null;
}

export type ChallengeCheck = { readonly ok: true; readonly requirement: PaymentRequirement } | { readonly ok: false; readonly refusal: ChallengeRefusal };

function decodeHeader(header: string): unknown {
  if (header.length > MAX_HEADER_CHARS || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(header)) return undefined;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as unknown;
  } catch {
    return undefined;
  }
}

interface Offer {
  readonly network: string;
  readonly scheme: string;
  readonly asset: string;
  readonly payTo: string;
  readonly amount: string;
  readonly resource: string;
  readonly maxTimeoutSeconds: number | null;
}

function offers(header: string | null, body: unknown): { version: 1 | 2; offers: Offer[] } | ChallengeRefusal {
  const fromHeader = header === null ? undefined : decodeHeader(header);
  if (fromHeader !== undefined) {
    const parsed = challengeV2.safeParse(fromHeader);
    if (!parsed.success) return "malformed";
    const list: Offer[] = [];
    for (const raw of parsed.data.accepts) {
      const entry = entryV2.safeParse(raw);
      if (!entry.success) return "malformed";
      const e = entry.data;
      list.push({ network: e.network, scheme: e.scheme, asset: e.asset, payTo: e.payTo, amount: e.amount, resource: parsed.data.resource.url, maxTimeoutSeconds: e.maxTimeoutSeconds ?? null });
    }
    return { version: 2, offers: list };
  }
  if (header !== null) return "malformed";
  if (body === null || body === undefined) return "no_challenge";
  const parsed = challengeV1.safeParse(body);
  if (!parsed.success) return typeof body === "object" && body !== null && "x402Version" in body ? "malformed" : "no_challenge";
  const list: Offer[] = [];
  for (const raw of parsed.data.accepts) {
    const entry = entryV1.safeParse(raw);
    if (!entry.success) return "malformed";
    const e = entry.data;
    list.push({ network: e.network, scheme: e.scheme, asset: e.asset, payTo: e.payTo, amount: e.maxAmountRequired, resource: e.resource, maxTimeoutSeconds: e.maxTimeoutSeconds ?? null });
  }
  return { version: 1, offers: list };
}

// Base as each version names it: CAIP-2 in version 2, the short name in version 1.
function onBase(version: 1 | 2, network: string): boolean {
  return version === 2 ? network === BASE_CHAIN : network === "base";
}

// The challenge's resource is the probed URL: the same origin and path, and the same query when it states one (a server
// may name the route without its query; PayBox pays for the proposal's own URL either way).
function sameResource(resource: string, expected: string): boolean {
  let a: URL;
  let b: URL;
  try {
    a = new URL(resource);
    b = new URL(expected);
  } catch {
    return false;
  }
  if (a.origin !== b.origin || a.pathname !== b.pathname || a.username !== "" || a.password !== "" || a.hash !== "") return false;
  return a.search === "" || a.search === b.search;
}

export function checkChallenge(
  header: string | null,
  body: unknown,
  expected: { readonly url: string; readonly payTo: string; readonly maxAtomic: bigint },
): ChallengeCheck {
  const read = offers(header, body);
  if (typeof read === "string") return { ok: false, refusal: read };
  const base = read.offers.filter((o) => o.scheme === "exact" && onBase(read.version, o.network) && o.asset.toLowerCase() === BASE_USDC);
  if (base.length === 0) return { ok: false, refusal: "no_base_usdc_offer" };
  if (base.length > 1) return { ok: false, refusal: "ambiguous_offers" };
  const offer = base[0] as Offer;
  if (offer.payTo.toLowerCase() !== expected.payTo.toLowerCase()) return { ok: false, refusal: "pay_to_mismatch" };
  if (!ATOMIC.test(offer.amount)) return { ok: false, refusal: "amount_invalid" };
  const amount = BigInt(offer.amount);
  if (amount > expected.maxAtomic) return { ok: false, refusal: "amount_over_ceiling" };
  if (!sameResource(offer.resource, expected.url)) return { ok: false, refusal: "resource_mismatch" };
  return {
    ok: true,
    requirement: {
      x402Version: read.version,
      url: expected.url,
      network: BASE_CHAIN,
      asset: BASE_USDC,
      payTo: offer.payTo.toLowerCase(),
      amountAtomic: amount.toString(),
      amountUsdc: formatAtomic(amount, USDC_DECIMALS),
      maxTimeoutSeconds: offer.maxTimeoutSeconds,
    },
  };
}
