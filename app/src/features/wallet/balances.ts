// Balances of the owner EOA and its derived account on each chain (docs/dapp-design.md 4.5 Wallet, 7.2 M2).
//
// Sources: the chain's public RPC (one Multicall3 read, rpc.ts) and, on XO 3223, the XO explorer. Rules:
//   - a balance that could not be read is null, never 0; an unreachable chain says so;
//   - nothing is summed: native coins and tokens of different chains and units are listed one by one;
//   - only tokens the repository pins are asked for (the others would be a guess about a contract address);
//   - the explorer is third-party text: its token symbols go through the untrusted slot.

import { encodeFunctionData, getAddress, parseAbi, type Hex } from "viem";
import * as z from "zod/v4";

import { BASE_CHAIN_ID, BASE_USDC, BASE_USDC_DECIMALS, USDC_E_ADDRESS, USDC_E_DECIMALS, XO_CHAIN_ID } from "@shared/xo/chain/constants";

import { BROWSER_DIRECT_ORIGINS } from "../../../headers.config";
import type { AccountChain } from "../../core/account";
import { AdapterException } from "../../core/errors";
import { toFixedText, fromAtomic } from "../../core/money";
import type { AdapterDeps, Untrusted } from "../../core/ports";
import { untrustedField } from "../../core/untrusted";
import { failureOf, type Failure } from "./failure";
import { createChainReader, uintOf, type ChainReader, type ReadOp } from "./rpc";

const ERC20_BALANCE = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

export interface TokenSpec {
  readonly symbol: string;
  readonly address: string;
  readonly decimals: number;
}

// The only ERC-20s asked for: pinned in src/xo/chain/constants.ts, each with a strict-checksum test elsewhere.
export const CHAIN_TOKENS: Readonly<Record<number, readonly TokenSpec[]>> = Object.freeze({
  [XO_CHAIN_ID]: Object.freeze([{ symbol: "USDC.e", address: USDC_E_ADDRESS, decimals: USDC_E_DECIMALS }]),
  [BASE_CHAIN_ID]: Object.freeze([{ symbol: "USDC", address: BASE_USDC, decimals: BASE_USDC_DECIMALS }]),
});

// Fixed app text. XO's native coin has no symbol the notes record, so it is not given one.
const NATIVE_SYMBOL: Readonly<Record<number, string>> = Object.freeze({
  3223: "native coin",
  8453: "ETH",
  137: "POL",
  56: "BNB",
  999: "HYPE",
  42161: "ETH",
  1: "ETH",
  10: "ETH",
  43114: "AVAX",
  100: "xDAI",
});

export function nativeSymbol(chainId: number): string {
  return NATIVE_SYMBOL[chainId] ?? "native coin";
}

// Exact decimal text of an atomic amount with up to `places` decimals, rounded toward zero. A non-zero amount that
// rounds to zero prints as "<0.000001", never as "0".
export function atomicText(raw: bigint, decimals: number, places = 6): string {
  const q = fromAtomic("usd", raw, decimals);
  const { text, roundedToZero } = toFixedText(q, Math.min(places, decimals), "down", { thousands: true });
  if (roundedToZero) return `<${text.replace(/[0-9]$/, "1")}`;
  // Trailing zeros after the point carry no information: "2.500000" is "2.5".
  return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

export type BalanceHolder = "owner" | "account";

export interface BalanceRow {
  readonly holder: BalanceHolder;
  readonly address: string;
  readonly kind: "native" | "token";
  // Fixed app text for pinned tokens and native coins; an explorer-only token carries its (untrusted) symbol in `untrustedSymbol`.
  readonly symbol: string;
  readonly untrustedSymbol: Untrusted<string> | null;
  readonly decimals: number;
  // null: not read (never 0).
  readonly raw: bigint | null;
  readonly text: string | null;
  readonly source: "rpc_multicall" | "rpc" | "explorer";
}

export type ChainBalancesState =
  | { readonly state: "ok"; readonly rows: readonly BalanceRow[]; readonly mode: ReturnType<ChainReader["mode"]> }
  // This build has no public RPC for the chain (the CSP is a closed list): not an error, and not an empty wallet.
  | { readonly state: "no_rpc" }
  | { readonly state: "failed"; readonly failure: Failure };

function rowOf(holder: BalanceHolder, address: string, token: { symbol: string; decimals: number; kind: "native" | "token" }, raw: bigint | null, source: BalanceRow["source"]): BalanceRow {
  return { holder, address, kind: token.kind, symbol: token.symbol, untrustedSymbol: null, decimals: token.decimals, raw, text: raw === null ? null : atomicText(raw, token.decimals), source };
}

export interface Holders {
  readonly owner: string;
  readonly account: string;
}

export async function readChainBalances(deps: AdapterDeps, chain: AccountChain, holders: Holders): Promise<ChainBalancesState> {
  const reader = createChainReader(deps, chain);
  if (reader === null) return { state: "no_rpc" };
  const tokens = CHAIN_TOKENS[chain.chainId] ?? [];
  const wanted: Array<{ holder: BalanceHolder; address: string; token: { symbol: string; decimals: number; kind: "native" | "token" }; op: ReadOp }> = [];
  for (const [holder, address] of [["owner", holders.owner], ["account", holders.account]] as const) {
    wanted.push({ holder, address, token: { symbol: nativeSymbol(chain.chainId), decimals: 18, kind: "native" }, op: { kind: "native", holder: address } });
    for (const token of tokens) {
      const data: Hex = encodeFunctionData({ abi: ERC20_BALANCE, functionName: "balanceOf", args: [getAddress(address)] });
      wanted.push({ holder, address, token: { symbol: token.symbol, decimals: token.decimals, kind: "token" }, op: { kind: "call", to: token.address, data } });
    }
  }
  try {
    const results = await reader.read(wanted.map((entry) => entry.op));
    const rows = wanted.map((entry, index) => rowOf(entry.holder, entry.address, entry.token, uintOf(results[index]), reader.mode() === "multicall" ? "rpc_multicall" : "rpc"));
    return { state: "ok", rows, mode: reader.mode() };
  } catch (error) {
    return { state: "failed", failure: failureOf(error) };
  }
}

// ---- the XO explorer (chain 3223) ------------------------------------------------------------------------------

const explorerOrigin = (): string | null => BROWSER_DIRECT_ORIGINS.find((entry) => entry.service === "xo_explorer")?.origin ?? null;

// Blockscout-style v2 shapes. Never observed populated by this project: the parser is strict about what it reads
// and the screen labels the result "synthetic-shape tested".
const addressSchema = z.looseObject({ coin_balance: z.union([z.string().regex(/^[0-9]{1,40}$/), z.null()]).optional() });
const tokenBalanceSchema = z.looseObject({
  token: z.looseObject({
    address_hash: z.string().optional(),
    address: z.string().optional(),
    decimals: z.union([z.string().regex(/^[0-9]{1,2}$/), z.null()]).optional(),
    symbol: z.union([z.string().max(100), z.null()]).optional(),
    type: z.string().max(40).optional(),
  }),
  value: z.string().regex(/^[0-9]{1,78}$/),
});

export interface ExplorerBalances {
  readonly address: string;
  // null: the explorer has no record (a 404 is not evidence that the balance is zero).
  readonly native: bigint | null;
  readonly tokens: ReadonlyArray<{ readonly symbol: Untrusted<string>; readonly address: string | null; readonly decimals: number | null; readonly raw: bigint }>;
  // Rows the explorer sent that were not understood, counted and not shown.
  readonly skipped: number;
}

async function getJson(deps: AdapterDeps, url: string): Promise<{ readonly status: number; readonly body: unknown }> {
  const response = await deps.fetch(url, { method: "GET", headers: { accept: "application/json" } });
  if (response.status === 404) return { status: 404, body: null };
  if (!response.ok) return { status: response.status, body: null };
  const text = await response.text();
  if (text.length > 1_000_000) return { status: 502, body: null };
  try {
    return { status: 200, body: JSON.parse(text) as unknown };
  } catch {
    return { status: 502, body: null };
  }
}

export async function readExplorerBalances(deps: AdapterDeps, address: string): Promise<ExplorerBalances> {
  const origin = explorerOrigin();
  if (origin === null) throw new RangeError("the explorer origin is not listed");
  const checked = getAddress(address);
  const [info, tokens] = await Promise.all([getJson(deps, `${origin}/api/v2/addresses/${checked}`), getJson(deps, `${origin}/api/v2/addresses/${checked}/token-balances`)]);
  for (const answer of [info, tokens]) {
    if (answer.status !== 200 && answer.status !== 404) throw new AdapterException(answer.status === 429 ? "RATE_LIMITED" : answer.status >= 500 ? "TIMEOUT" : "SCHEMA_DRIFT", "explorer_status");
  }
  let native: bigint | null = null;
  if (info.status === 200) {
    const parsed = addressSchema.safeParse(info.body);
    if (!parsed.success) throw new AdapterException("SCHEMA_DRIFT", "explorer_shape");
    native = parsed.data.coin_balance === null || parsed.data.coin_balance === undefined ? null : BigInt(parsed.data.coin_balance);
  }
  const out: ExplorerBalances["tokens"][number][] = [];
  let skipped = 0;
  if (tokens.status === 200) {
    if (!Array.isArray(tokens.body) || tokens.body.length > 200) throw new AdapterException("SCHEMA_DRIFT", "explorer_shape");
    for (const item of tokens.body) {
      const parsed = tokenBalanceSchema.safeParse(item);
      if (!parsed.success) {
        skipped += 1;
        continue;
      }
      const tokenAddress = parsed.data.token.address_hash ?? parsed.data.token.address ?? null;
      let normalized: string | null = null;
      if (tokenAddress !== null && /^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) normalized = getAddress(tokenAddress.toLowerCase());
      const decimals = parsed.data.token.decimals === null || parsed.data.token.decimals === undefined ? null : Number(parsed.data.token.decimals);
      out.push({ symbol: untrustedField("generic", parsed.data.token.symbol ?? "", "xo_explorer"), address: normalized, decimals, raw: BigInt(parsed.data.value) });
    }
  }
  return { address: checked, native, tokens: out, skipped };
}
