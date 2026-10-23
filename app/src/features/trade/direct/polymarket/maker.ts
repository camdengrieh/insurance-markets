// Which account a wallet trades from on Polymarket, read from Polygon. The relay's rule (relay/clob.ts
// readPolymarketMaker), plus the Safe:
//
//   1. the wallet's Deposit Wallet (signature type 3): one of the two addresses derived from the wallet holds exactly
//      Polymarket's proxy code for it, answers owner() with the wallet and eip712Domain() with DepositWallet version 1
//      on chain 137 at its own address. Both forms deployed, foreign code, another owner or another domain: refused, as
//      the relay refuses them;
//   2. the wallet's Polymarket Safe (signature type 2): the address derived from the wallet holds the Safe proxy, its
//      singleton is the pinned one and getOwners() lists the wallet (sdk/chain/polymarket/wallets.ts). Most people who
//      signed up on polymarket.com with a browser wallet trade from one. A Safe in any other state is refused when it
//      would otherwise be the account;
//   3. neither: the wallet itself (signature type 0), with the relay's caution that Polymarket takes an EOA as the
//      account only when it is allowlisted.
// When both a Deposit Wallet and a Safe are usable, both are offered, the Deposit Wallet first (the relay's choice);
// the visitor picks the one that holds their funds. Any read that fails is a refusal in words, never a guess: an
// unreadable address could be the account.

import { findPolymarketWallets, POLYMARKET_WALLET_KIND_TEXT, type PolymarketWalletCheck } from "@sdk/chain/polymarket/wallets";
import { DEPOSIT_WALLET_DOMAIN_CALL, depositWalletDomainMatches } from "@sdk/trade/clob/polymarket/deposit-wallet";
import { CLOB_CHAIN_IDS, POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET, POLYMARKET_SIGNATURE_TYPE_EOA, POLYMARKET_SIGNATURE_TYPE_SAFE } from "@sdk/trade/clob/venues";
import { getAddress, type Address } from "viem";

import { ok, refuse, type ChainSession, type DirectAccount, type DirectReadiness, type DirectResult } from "../types";

export const POLYMARKET_VENUE = "polymarket";

export const MAKER_LABEL = Object.freeze({
  eoa: "your wallet itself",
  safe: "your Polymarket Safe",
  deposit_wallet: "your Polymarket Deposit Wallet",
});

export const EOA_ALLOWLIST_NOTE =
  "No Polymarket Deposit Wallet or Safe is deployed for this wallet on Polygon, so your wallet itself is the maker (signature type 0). Polymarket uses a plain wallet as the account only when it is allowlisted for trading; otherwise expect it to refuse the order.";

function account(signer: Address, maker: Address, kind: keyof typeof MAKER_LABEL): DirectAccount {
  const signatureType = kind === "eoa" ? POLYMARKET_SIGNATURE_TYPE_EOA : kind === "safe" ? POLYMARKET_SIGNATURE_TYPE_SAFE : POLYMARKET_SIGNATURE_TYPE_DEPOSIT_WALLET;
  return { venue: POLYMARKET_VENUE, chainId: CLOB_CHAIN_IDS.polymarket, signer, maker, label: MAKER_LABEL[kind], signatureType, makerIsSigner: kind === "eoa" };
}

const UNREADABLE = "This page could not read your Polymarket account on Polygon, so it cannot tell which wallet is the maker. Nothing was signed; read again in a moment.";

function describe(check: PolymarketWalletCheck): string {
  return `${POLYMARKET_WALLET_KIND_TEXT[check.kind]} ${check.address}: ${check.why ?? "found"}`;
}

export async function readPolymarketAccounts(chain: ChainSession | null, owner: Address): Promise<DirectResult<DirectReadiness>> {
  if (chain === null) return refuse("chain_unreadable", "This build names no Polygon RPC, so your Polymarket account cannot be read.");
  const signer = getAddress(owner);
  let checks: readonly PolymarketWalletCheck[];
  try {
    checks = await findPolymarketWallets(chain.port, signer, { guard: chain.guard });
  } catch {
    return refuse("chain_unreadable", UNREADABLE);
  }
  const unreadable = checks.find((check) => check.state === "unreadable");
  if (unreadable !== undefined) return refuse("chain_unreadable", `${UNREADABLE} (${describe(unreadable)})`);

  const deposits = checks.filter((check) => check.kind === "deposit_beacon" || check.kind === "deposit_uups");
  const odd = deposits.find((check) => check.state !== "found" && check.state !== "not_deployed");
  if (odd !== undefined) return refuse("account_refused", `An address derived as your Polymarket Deposit Wallet cannot be used, so nothing is signed for it. ${describe(odd)}`);
  const foundDeposits = deposits.filter((check) => check.state === "found");
  if (foundDeposits.length > 1) return refuse("account_refused", "Both addresses derived as your Polymarket Deposit Wallet hold a wallet; which one your account uses is not decided here, so nothing is signed.");

  const accounts: DirectAccount[] = [];
  const notes: string[] = [];
  const deposit = foundDeposits[0];
  if (deposit !== undefined) {
    // The relay's last check: the wallet's own EIP-712 domain is the one the TypedDataSign wrapper names.
    let domain: Awaited<ReturnType<typeof chain.port.callMany>>;
    try {
      domain = await chain.port.callMany([{ to: deposit.address, data: DEPOSIT_WALLET_DOMAIN_CALL }]);
    } catch {
      return refuse("chain_unreadable", UNREADABLE);
    }
    const answer = domain[0];
    if (answer === undefined || !answer.ok) return refuse("chain_unreadable", `${UNREADABLE} (your Deposit Wallet did not answer eip712Domain())`);
    if (!depositWalletDomainMatches(answer.data, deposit.address, CLOB_CHAIN_IDS.polymarket)) {
      return refuse("account_refused", "Your Polymarket Deposit Wallet's EIP-712 domain is not DepositWallet version 1 on chain 137 at its own address, so the signature this page builds would not verify. Nothing is signed.");
    }
    accounts.push(account(signer, deposit.address, "deposit_wallet"));
  }

  const safe = checks.find((check) => check.kind === "safe");
  if (safe?.state === "found") accounts.push(account(signer, safe.address, "safe"));
  else if (safe !== undefined && safe.state !== "not_deployed") {
    if (accounts.length === 0) return refuse("account_refused", `Your Polymarket Safe cannot be used, so nothing is signed for it. ${describe(safe)}`);
    notes.push(`Your Polymarket Safe is not used: ${describe(safe)}`);
  }

  const proxy = checks.find((check) => check.kind === "proxy");
  if (proxy?.state === "found") {
    // The proxy wallet (email and Google accounts, signature type 1) is not built here.
    if (accounts.length === 0) return refuse("account_refused", `Your Polymarket account is a proxy wallet (${proxy.address}, signature type 1), which this page does not build orders for. Nothing is signed.`);
    notes.push(`A Polymarket proxy wallet also exists for this wallet (${proxy.address}); it is not used here.`);
  }

  if (accounts.length === 0) {
    accounts.push(account(signer, signer, "eoa"));
    notes.push(EOA_ALLOWLIST_NOTE);
  } else if (accounts.length > 1) {
    notes.push("Both a Deposit Wallet and a Safe exist for this wallet. The Deposit Wallet is chosen first, as the relay chooses; pick the Safe instead if that is where your funds are.");
  }
  return ok({ accounts, notes });
}
