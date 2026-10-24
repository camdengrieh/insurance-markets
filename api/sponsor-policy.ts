import { decodeFunctionData, getAddress, parseAbi, type Address, type Hex } from "viem";
import { entryPoint08Address } from "viem/account-abstraction";

import {
  LIMITLESS_CONDITIONAL_TOKENS,
  LIMITLESS_CTF_EXCHANGE,
  LIMITLESS_CTF_EXCHANGE_V1,
  LIMITLESS_CTF_EXCHANGE_V2,
  LIMITLESS_NEG_RISK_ADAPTER_V1,
  LIMITLESS_NEG_RISK_ADAPTER_V2,
  LIMITLESS_NEG_RISK_ADAPTER_V3,
  LIMITLESS_NEG_RISK_EXCHANGE_V1,
  LIMITLESS_NEG_RISK_EXCHANGE_V2,
  LIMITLESS_NEG_RISK_EXCHANGE_V3,
  LIMITLESS_USDC,
} from "../sdk/chain/limitless/constants.js";
import {
  POLYMARKET_CONDITIONAL_TOKENS,
  POLYMARKET_CTF_COLLATERAL_ADAPTER,
  POLYMARKET_CTF_EXCHANGE,
  POLYMARKET_EXCHANGE_V3,
  POLYMARKET_NEG_RISK_ADAPTER,
  POLYMARKET_NEG_RISK_EXCHANGE,
  POLYMARKET_POSITION_MANAGER,
  POLYMARKET_PUSD,
  POLYMARKET_USDC_E,
} from "../sdk/chain/polymarket/constants.js";

// What the gas sponsor pays for (paymaster.ts) and what the Polymarket relay lets a Deposit Wallet batch call
// (polymarket-relay.ts): docs/unified-account-design.md section 3.2. Every address below is either imported from the
// SDK's pinned chain constants (each with its own source and code-hash pin there) or copied, with its source named on
// the line, from a research note that read it first-hand. None is invented, none comes from a request, and an address
// the repo does not carry is NOT here (see "Not sponsored" in api/README.md: Limitless's per-venue fee modules, the
// Polymarket NegRiskCtfCollateralAdapter, BNB USDT and Predict.fun's Conditional Tokens).

// ---- the account the user operations come from ---------------------------------------------------------------------
//
// The trading key E delegates by EIP-7702 to viem's Simple7702Account for EntryPoint 0.8 (design section 3.1). Both values
// are read from the installed viem 2.57.2: the implementation is the default of toSimple7702SmartAccount
// (node_modules/viem/_esm/account-abstraction/accounts/implementations/toSimple7702SmartAccount.js, "return
// '0xe6Cae83BdE06E4c305530e199D7217f42808555B'" for the 0.8 entry point; test/api/paymaster.test.ts asserts viem still
// builds that authorization), and the entry point is viem's exported entryPoint08Address.
export const SIMPLE_7702_IMPLEMENTATION: Address = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";
export const ENTRY_POINT_V08: Address = entryPoint08Address;
// EIP-7702: a delegated account's code is 0xef0100 followed by the 20-byte delegate.
export const DELEGATION_PREFIX = "0xef0100";
export const SIMPLE_7702_DELEGATION_CODE = `${DELEGATION_PREFIX}${SIMPLE_7702_IMPLEMENTATION.slice(2).toLowerCase()}` as Hex;

// ---- per chain -------------------------------------------------------------------------------------------------------

export const SPONSORED_CHAINS = [137, 8453, 56] as const;
export type SponsoredChain = (typeof SPONSORED_CHAINS)[number];

export function isSponsoredChain(value: number): value is SponsoredChain {
  return (SPONSORED_CHAINS as readonly number[]).includes(value);
}

export interface TokenRule {
  readonly symbol: string;
  // The token implements EIP-3009 transferWithAuthorization / receiveWithAuthorization (a gasless deposit from the
  // funding wallet W that E submits, design section 1 "Money").
  readonly eip3009: boolean;
}

export interface ChainPolicy {
  readonly chainId: SponsoredChain;
  // ERC-20s: approve to a listed spender; transfer (bridge deposit or counted withdrawal); EIP-3009 deposits to E.
  readonly tokens: ReadonlyMap<string, TokenRule>;
  // Who an ERC-20 approval may name.
  readonly spenders: ReadonlySet<string>;
  // ERC-1155 position contracts: setApprovalForAll to a listed operator.
  readonly positions: ReadonlySet<string>;
  readonly operators: ReadonlySet<string>;
  // Contracts a Polymarket Deposit Wallet batch may call with any function (adapters and position contracts: redeem,
  // split, merge, convert, wrap). Empty off Polygon.
  readonly walletAnyCall: ReadonlySet<string>;
}

const lower = (values: readonly string[]): ReadonlySet<string> => new Set(values.map((value) => getAddress(value).toLowerCase()));

// Polygon (137).
//   pUSD, USDC.e, CTF, the three exchanges, the Neg Risk Adapter, the CtfCollateralAdapter and the PositionManager: the
//   SDK's pinned Polymarket constants (sdk/chain/polymarket/constants.ts, from docs.polymarket.com/resources/contracts.md).
//   Native USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359: docs/research/venues/polybet.md (H, GeckoTerminal "USD Coin",
//   6 decimals), the same address in docs/research/venues/unihedge.md and magistery.md (H); Circle's FiatToken, which
//   implements EIP-3009 (M).
//   Collateral Onramp 0x93070a847efEf7F70739046A929D47a521F5B8ee: docs/research/45-polymarket-gasless-relayer.md section 6
//   (H, docs.polymarket.com concepts/pusd.md): USDC.e is approved to it and wrapped into pUSD.
export const POLYGON_NATIVE_USDC: Address = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
export const POLYMARKET_COLLATERAL_ONRAMP: Address = "0x93070a847efEf7F70739046A929D47a521F5B8ee";

// BNB Chain (56).
//   Binance-Peg USDC 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d (18 decimals): docs/research/venues/wager-predict.md (H)
//   and docs/research/venues/bento-bento-fun.md (H, README and eth_call). No EIP-3009.
//   Predict.fun's CTF Exchange, Neg Risk exchange and the two yield-bearing exchanges: docs/research/37-aa-venue-accounts.md
//   section 4.3 (H, Sourcify exact_match).
export const BNB_USDC: Address = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
export const PREDICT_EXCHANGES: readonly Address[] = Object.freeze([
  "0x8BC070BEdAB741406F4B1Eb65A72bee27894B689",
  "0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A",
  "0x6bEb5a40C032AFc305961162d8204CDA16DECFa5",
  "0x8A289d458f5a134bA40015085A8F50Ffb681B41d",
]);

const POLYMARKET_SPENDERS = [POLYMARKET_CTF_EXCHANGE, POLYMARKET_NEG_RISK_EXCHANGE, POLYMARKET_EXCHANGE_V3, POLYMARKET_NEG_RISK_ADAPTER, POLYMARKET_CTF_COLLATERAL_ADAPTER];
const LIMITLESS_SPENDERS = [
  LIMITLESS_CTF_EXCHANGE_V1,
  LIMITLESS_CTF_EXCHANGE_V2,
  LIMITLESS_CTF_EXCHANGE,
  LIMITLESS_NEG_RISK_EXCHANGE_V1,
  LIMITLESS_NEG_RISK_EXCHANGE_V2,
  LIMITLESS_NEG_RISK_EXCHANGE_V3,
  LIMITLESS_NEG_RISK_ADAPTER_V1,
  LIMITLESS_NEG_RISK_ADAPTER_V2,
  LIMITLESS_NEG_RISK_ADAPTER_V3,
];

export const CHAIN_POLICIES: Readonly<Record<SponsoredChain, ChainPolicy>> = Object.freeze({
  137: Object.freeze({
    chainId: 137,
    tokens: new Map<string, TokenRule>([
      [POLYMARKET_PUSD.toLowerCase(), { symbol: "pUSD", eip3009: false }],
      [POLYMARKET_USDC_E.toLowerCase(), { symbol: "USDC.e", eip3009: false }],
      [POLYGON_NATIVE_USDC.toLowerCase(), { symbol: "USDC", eip3009: true }],
    ]),
    spenders: lower([...POLYMARKET_SPENDERS, POLYMARKET_COLLATERAL_ONRAMP]),
    positions: lower([POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_POSITION_MANAGER]),
    operators: lower(POLYMARKET_SPENDERS),
    walletAnyCall: lower([POLYMARKET_CONDITIONAL_TOKENS, POLYMARKET_POSITION_MANAGER, POLYMARKET_NEG_RISK_ADAPTER, POLYMARKET_CTF_COLLATERAL_ADAPTER, POLYMARKET_COLLATERAL_ONRAMP]),
  }),
  // Base (8453): native USDC (EIP-3009: it is the x402 asset, api/x402.ts) and the Limitless venue contracts of
  // sdk/chain/limitless/constants.ts (docs.limitless.exchange/user-guide/smart-contracts.md).
  8453: Object.freeze({
    chainId: 8453,
    tokens: new Map<string, TokenRule>([[LIMITLESS_USDC.toLowerCase(), { symbol: "USDC", eip3009: true }]]),
    spenders: lower(LIMITLESS_SPENDERS),
    positions: lower([LIMITLESS_CONDITIONAL_TOKENS]),
    operators: lower(LIMITLESS_SPENDERS),
    walletAnyCall: new Set<string>(),
  }),
  56: Object.freeze({
    chainId: 56,
    tokens: new Map<string, TokenRule>([[BNB_USDC.toLowerCase(), { symbol: "USDC", eip3009: false }]]),
    spenders: lower(PREDICT_EXCHANGES),
    positions: new Set<string>(),
    operators: lower(PREDICT_EXCHANGES),
    walletAnyCall: new Set<string>(),
  }),
});

// ---- decoding ----------------------------------------------------------------------------------------------------------

// Simple7702Account's two entry points (the ABI in viem's toSimple7702SmartAccount.js, eth-infinitism BaseAccount).
export const SIMPLE_7702_ABI = parseAbi([
  "function execute(address target, uint256 value, bytes data)",
  "function executeBatch((address target, uint256 value, bytes data)[] calls)",
]);

// The token and position calls the policy recognises. EIP-3009 in both FiatTokenV2_2 forms (v, r, s and bytes signature).
const CALL_ABI = parseAbi([
  "function approve(address spender, uint256 amount)",
  "function transfer(address to, uint256 amount)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s)",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature)",
]);

export const MAX_CALLS = 16;

export interface Call {
  readonly to: Address;
  readonly value: bigint;
  readonly data: Hex;
}

export function decodeAccountCalls(callData: string): { readonly ok: true; readonly calls: readonly Call[] } | { readonly ok: false; readonly reason: string } {
  if (!/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(callData)) return { ok: false, reason: "The user operation's callData is not hex with a function selector." };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: SIMPLE_7702_ABI, data: callData as Hex });
  } catch {
    return { ok: false, reason: "The user operation's callData is not Simple7702Account execute or executeBatch." };
  }
  const calls: Call[] =
    decoded.functionName === "execute"
      ? [{ to: decoded.args[0], value: decoded.args[1], data: decoded.args[2] }]
      : decoded.args[0].map((call) => ({ to: call.target, value: call.value, data: call.data }));
  if (calls.length === 0) return { ok: false, reason: "The batch has no call." };
  if (calls.length > MAX_CALLS) return { ok: false, reason: `A sponsored batch has at most ${MAX_CALLS} calls.` };
  return { ok: true, calls };
}

export type CallKind = "approve" | "set_approval_for_all" | "bridge_deposit" | "withdrawal" | "eip3009_deposit";

export interface CheckedCall {
  readonly kind: CallKind;
  readonly to: Address;
}

export type CallsVerdict = { readonly ok: true; readonly calls: readonly CheckedCall[]; readonly withdrawals: number } | { readonly ok: false; readonly index: number; readonly reason: string };

export interface CallContext {
  readonly policy: ChainPolicy;
  readonly sender: Address;
  // Lower-case deposit addresses the bridge returned to this server for the sender.
  readonly bridgeDeposits: ReadonlySet<string>;
}

const ZERO = "0x0000000000000000000000000000000000000000";

// One call of E's user operation, against the chain's policy.
export function checkSponsoredCall(call: Call, context: CallContext): { readonly ok: true; readonly kind: CallKind } | { readonly ok: false; readonly reason: string } {
  const target = call.to.toLowerCase();
  const sender = context.sender.toLowerCase();
  if (call.value !== 0n) return { ok: false, reason: "A sponsored call sends no native value." };
  if (target === sender) return { ok: false, reason: "A sponsored call does not call the account itself." };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: CALL_ABI, data: call.data });
  } catch {
    return { ok: false, reason: `The call to ${call.to} is not one the sponsor pays for (approve, setApprovalForAll, transfer or an EIP-3009 deposit on a listed contract).` };
  }
  const token = context.policy.tokens.get(target);
  switch (decoded.functionName) {
    case "approve": {
      if (token === undefined) return { ok: false, reason: `${call.to} is not a token the sponsor lists on chain ${context.policy.chainId}.` };
      const spender = (decoded.args[0] as string).toLowerCase();
      if (!context.policy.spenders.has(spender)) return { ok: false, reason: `An approval of ${token.symbol} to ${decoded.args[0] as string} is not sponsored: the spender is not a listed venue contract.` };
      return { ok: true, kind: "approve" };
    }
    case "setApprovalForAll": {
      if (!context.policy.positions.has(target)) return { ok: false, reason: `${call.to} is not a position contract the sponsor lists on chain ${context.policy.chainId}.` };
      if (!context.policy.operators.has((decoded.args[0] as string).toLowerCase())) return { ok: false, reason: `setApprovalForAll to ${decoded.args[0] as string} is not sponsored: the operator is not a listed venue contract.` };
      return { ok: true, kind: "set_approval_for_all" };
    }
    case "transfer": {
      if (token === undefined) return { ok: false, reason: `${call.to} is not a token the sponsor lists on chain ${context.policy.chainId}.` };
      const to = (decoded.args[0] as string).toLowerCase();
      if (to === ZERO || to === target) return { ok: false, reason: "A transfer to the zero address or to the token itself is not sponsored." };
      return { ok: true, kind: context.bridgeDeposits.has(to) ? "bridge_deposit" : "withdrawal" };
    }
    case "transferWithAuthorization":
    case "receiveWithAuthorization": {
      if (token === undefined || !token.eip3009) return { ok: false, reason: `${call.to} is not a token whose EIP-3009 deposits the sponsor pays for on chain ${context.policy.chainId}.` };
      if ((decoded.args[1] as string).toLowerCase() !== sender) return { ok: false, reason: "An EIP-3009 deposit is sponsored only when it pays the account that sends it." };
      return { ok: true, kind: "eip3009_deposit" };
    }
  }
}

export function checkSponsoredCalls(calls: readonly Call[], context: CallContext): CallsVerdict {
  const out: CheckedCall[] = [];
  let withdrawals = 0;
  for (const [index, call] of calls.entries()) {
    const verdict = checkSponsoredCall(call, context);
    if (!verdict.ok) return { ok: false, index, reason: verdict.reason };
    if (verdict.kind === "withdrawal") withdrawals += 1;
    out.push({ kind: verdict.kind, to: call.to });
  }
  return { ok: true, calls: out, withdrawals };
}

// One call of a Polymarket Deposit Wallet batch (polymarket-relay.ts WALLET). The owner's signature over the batch is
// checked on chain, so this guards the operator's relayer quota and builder identity, not the visitor's funds: only
// listed targets, an approval only to a listed spender, a transfer only back to the wallet's owner.
export function checkWalletCall(call: Call, owner: string): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const policy = CHAIN_POLICIES[137];
  const target = call.to.toLowerCase();
  if (call.value !== 0n) return { ok: false, reason: "A Deposit Wallet call relayed here sends no native value." };
  if (policy.walletAnyCall.has(target)) {
    if (policy.positions.has(target) && call.data.slice(0, 10).toLowerCase() === "0xa22cb465") {
      // setApprovalForAll(address,bool): the operator must be listed.
      try {
        const decoded = decodeFunctionData({ abi: CALL_ABI, data: call.data });
        if (decoded.functionName === "setApprovalForAll" && !policy.operators.has((decoded.args[0] as string).toLowerCase())) return { ok: false, reason: `setApprovalForAll to ${decoded.args[0] as string} is not relayed: the operator is not a listed venue contract.` };
      } catch {
        return { ok: false, reason: "The setApprovalForAll call does not decode." };
      }
    }
    return { ok: true };
  }
  const token = policy.tokens.get(target);
  if (token === undefined) return { ok: false, reason: `${call.to} is not a contract this relay lets a Deposit Wallet call.` };
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: CALL_ABI, data: call.data });
  } catch {
    return { ok: false, reason: `Only approve and transfer calls on ${token.symbol} are relayed.` };
  }
  if (decoded.functionName === "approve") {
    if (!policy.spenders.has((decoded.args[0] as string).toLowerCase())) return { ok: false, reason: `An approval of ${token.symbol} to ${decoded.args[0] as string} is not relayed: the spender is not a listed venue contract.` };
    return { ok: true };
  }
  if (decoded.functionName === "transfer") {
    if ((decoded.args[0] as string).toLowerCase() !== owner.toLowerCase()) return { ok: false, reason: `A transfer of ${token.symbol} out of the Deposit Wallet is relayed only to the wallet's owner.` };
    return { ok: true };
  }
  return { ok: false, reason: `Only approve and transfer calls on ${token.symbol} are relayed.` };
}
