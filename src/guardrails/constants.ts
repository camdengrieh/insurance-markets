// Pinned XO constants for the trade and create tiers. They are compiled in: never accept one from
// the agent, from market data or from the environment.
//
// The pinned set now lives in src/xo/chain/constants.ts (docs/phase1-gap-closing.md section 2.1:
// the Kernel stack, the EntryPoint, the PolicyPaymaster, the exchange and its fee and nonce
// tripwires, the market manager, the Base funding router and the Hyperlane Mailbox, hook and ISM,
// each with its confidence tag and note cite). Every name this file has always exported is re-exported
// from there, so existing imports keep working. New code imports src/xo/chain/constants.ts directly.
//
// Three addresses (the exchange, USDC.e and the Conditional Tokens contract) are still written out
// below because test/guardrails-constants.test.ts reads this file's source text and pins exactly those
// three literals. They duplicate the chain constants on purpose and cannot drift: the `Same` checks
// below fail the type check if either side changes, and test/chain-constants.test.ts compares them at
// run time and lists this file as the one place a legacy literal remains.
//
// Confidence: H = primary source read and independently re-derived, M = single pass or inference.
//   [01] docs/research/01-xo-auth-signing.md      [02] docs/research/02-xo-read-api.md
//   [03] docs/research/03-xo-lifecycle-funding-creation-policy.md
//   [07] docs/research/07-xo-bot-reference.md     "V" = that note's Verification section

import {
  CTF_EXCHANGE as CHAIN_CTF_EXCHANGE,
  CONDITIONAL_TOKENS as CHAIN_CONDITIONAL_TOKENS,
  USDC_E_ADDRESS as CHAIN_USDC_E_ADDRESS,
} from "../xo/chain/constants.js";

// Chain id of the XO network. H: [01 sec c, V], [03 sec 4]; printed on /guides/smart-accounts and
// /guides/wire-conventions (the authentication page shows a placeholder, not the number).
//
// Order EIP-712 domain ("XO Market CLOB", "1"), Kernel v3.1 wrapper domain ("Kernel", "0.3.1"), the
// L1 ClobAuth domain, signature type 3 (the only one accepted live), the 6-decimal collateral and
// share units, the 0.001 price grid, the 86-byte wire signature and the $1.00 creation fee are all
// defined once, in the chain constants.
export {
  CLOB_AUTH_DOMAIN,
  CLOB_AUTH_DOMAIN_NAME,
  CLOB_AUTH_DOMAIN_VERSION,
  CREATION_FEE_ATOMIC,
  KERNEL_DOMAIN_BASE,
  KERNEL_DOMAIN_NAME,
  KERNEL_DOMAIN_VERSION,
  MAX_PRICE_TICK,
  MIN_PRICE_TICK,
  ORDER_DOMAIN,
  ORDER_DOMAIN_NAME,
  ORDER_DOMAIN_VERSION,
  PRICE_TICK_DENOMINATOR,
  SHARE_DECIMALS,
  SHARE_MICRO_PER_SHARE,
  SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  USDC_E_ATOMIC_PER_UNIT,
  USDC_E_DECIMALS,
  WIRE_SIGNATURE_BYTES,
  XO_CHAIN_ID,
} from "../xo/chain/constants.js";

// CTF Exchange: verifyingContract of the order domain. ERC1967Proxy to a verified CTFExchange
// implementation. H: docs [01 sec c], explorer [03], address matched character for character in
// [01 V] and the third-party bot constants [07]. Upgradeable, so XO can change the logic (the
// chain tripwires watch for a second Upgraded log).
export const CTF_EXCHANGE = "0x4bC5E872256D12E6017dfe466E04c867DC761B77" as const;

// Collateral token (USDC.e), "Bridged USDC (XO)". H: docs [01], explorer FiatTokenProxy metadata [03], [07].
export const USDC_E_ADDRESS = "0x80c12230ce677e6f304027a14780Edd2A829ab0c" as const;

// ERC-1155 Conditional Tokens: outcome token ids live here. H: docs [01], live Data API rows carry
// it as outcomeTokenAddress [02], bot table [07].
export const CONDITIONAL_TOKENS = "0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909" as const;

// Compile-time proof that the three literals above equal the chain constants: a mismatch makes the
// conditional type `never`, which `true` is not assignable to.
type Same<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const sameAsChainConstants: readonly [
  Same<typeof CTF_EXCHANGE, typeof CHAIN_CTF_EXCHANGE>,
  Same<typeof USDC_E_ADDRESS, typeof CHAIN_USDC_E_ADDRESS>,
  Same<typeof CONDITIONAL_TOKENS, typeof CHAIN_CONDITIONAL_TOKENS>,
] = [true, true, true];
void sameAsChainConstants;
