import { decodeFunctionData, erc20Abi, getAddress, keccak256, recoverTypedDataAddress, serializeSignature, stringToBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { BASE_USDC } from "@sdk/chain/xo/constants";

import { WalletError } from "../../core/signer";
import { POLYGON_USDC } from "./constants";
import {
  checkWithdrawDestination,
  deposit,
  parseUsdcAmount,
  readTokenDomain,
  TRANSFER_WITH_AUTHORIZATION_ABI,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  transferWithAuthorizationCalldata,
  transferWithAuthorizationTypedData,
  withdraw,
  type TransferAuthorization,
} from "./money";
import { SponsorError } from "./sponsor";
import { fakeChainCalls, fakeSponsor, fakeWallet, TRADING_KEY, WALLET_KEY, type FakeToken } from "./testkit";

// Deposits are an EIP-3009 transferWithAuthorization that the funding wallet signs (typed data only) and the trading
// account submits through the sponsor; withdrawals are a sponsored ERC-20 transfer. The token's EIP-712 name and version
// come from the chain (here a fake that answers as Circle's FiatToken does).

const wallet = privateKeyToAccount(WALLET_KEY).address;
const account = privateKeyToAccount(TRADING_KEY).address;
const NOW_MS = 1_792_756_800_000;
const fixedRandom = (length: number): Uint8Array => new Uint8Array(length).fill(9);

function tokens(balances: Record<string, bigint> = {}): Record<number, Record<string, FakeToken>> {
  const map = new Map(Object.entries(balances).map(([holder, value]) => [holder.toLowerCase(), value]));
  return {
    8453: { [BASE_USDC.toLowerCase()]: { name: "USD Coin", version: "2", balances: map } },
    137: { [POLYGON_USDC.toLowerCase()]: { name: "USD Coin", version: "2", balances: map } },
  };
}

describe("EIP-3009 typed data", () => {
  it("has exactly the standard's type, whose hash is the one FiatToken checks", () => {
    const fields = TRANSFER_WITH_AUTHORIZATION_TYPES.TransferWithAuthorization.map((field) => `${field.type} ${field.name}`).join(",");
    const encoded = `TransferWithAuthorization(${fields})`;
    expect(encoded).toBe("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    // TRANSFER_WITH_AUTHORIZATION_TYPEHASH in Circle's EIP3009.sol.
    expect(keccak256(stringToBytes(encoded))).toBe("0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267");
  });

  it("puts the token's own name and version, the chain and the token in the domain", () => {
    const auth: TransferAuthorization = { chainId: 8453, token: BASE_USDC, domain: { name: "USD Coin", version: "2" }, from: wallet, to: account, value: 25_000_000n, validAfter: 0n, validBefore: 1_792_760_400n, nonce: `0x${"09".repeat(32)}` };
    const typed = transferWithAuthorizationTypedData(auth);
    expect(typed.domain).toEqual({ name: "USD Coin", version: "2", chainId: 8453, verifyingContract: BASE_USDC });
    expect(typed.primaryType).toBe("TransferWithAuthorization");
    expect(typed.message).toEqual({ from: wallet, to: account, value: 25_000_000n, validAfter: 0n, validBefore: 1_792_760_400n, nonce: `0x${"09".repeat(32)}` });
  });

  it("encodes the signature as v, r, s for transferWithAuthorization", () => {
    const auth: TransferAuthorization = { chainId: 137, token: POLYGON_USDC, domain: { name: "USD Coin", version: "2" }, from: wallet, to: account, value: 1n, validAfter: 0n, validBefore: 2n, nonce: `0x${"01".repeat(32)}` };
    const signature = serializeSignature({ r: `0x${"aa".repeat(32)}`, s: `0x${"0b".repeat(32)}`, yParity: 1 });
    const decoded = decodeFunctionData({ abi: TRANSFER_WITH_AUTHORIZATION_ABI, data: transferWithAuthorizationCalldata(auth, signature) });
    expect(decoded.args).toEqual([wallet, account, 1n, 0n, 2n, `0x${"01".repeat(32)}`, 28, `0x${"aa".repeat(32)}`, `0x${"0b".repeat(32)}`]);
  });

  it("reads the domain from the token, and returns null when it cannot", async () => {
    expect(await readTokenDomain(fakeChainCalls(tokens()), 8453, BASE_USDC)).toEqual({ name: "USD Coin", version: "2" });
    expect(await readTokenDomain(fakeChainCalls({}), 8453, BASE_USDC)).toBeNull();
  });
});

describe("deposit", () => {
  it("has the wallet sign a transfer to the account and submits it through the sponsor", async () => {
    const funding = fakeWallet();
    const sponsor = fakeSponsor();
    const result = await deposit({ funding, account, sponsor, calls: fakeChainCalls(tokens({ [wallet]: 30_000_000n })), chainId: 8453, value: 25_000_000n, nowMs: NOW_MS, randomBytes: fixedRandom });
    expect(result).toEqual({ ok: true, transactionHash: `0x${"ab".repeat(32)}` });
    expect(funding.typedRequests).toHaveLength(1);
    expect(sponsor.sent).toHaveLength(1);
    const [sent] = sponsor.sent;
    expect(sent?.chainId).toBe(8453);
    expect(sent?.calls[0]?.to).toBe(BASE_USDC);
    const decoded = decodeFunctionData({ abi: TRANSFER_WITH_AUTHORIZATION_ABI, data: sent?.calls[0]?.data ?? "0x" });
    const [from, to, value, validAfter, validBefore, nonce, v, r, s] = decoded.args;
    expect([from, to, value, validAfter, validBefore, nonce]).toEqual([wallet, account, 25_000_000n, 0n, 1_792_760_400n, `0x${"09".repeat(32)}`]);
    // What the token will check: the signature recovers to `from` over the typed data with the token's own domain.
    const signer = await recoverTypedDataAddress({
      ...transferWithAuthorizationTypedData({ chainId: 8453, token: BASE_USDC, domain: { name: "USD Coin", version: "2" }, from, to, value, validAfter, validBefore, nonce }),
      signature: serializeSignature({ r, s, yParity: v === 28 ? 1 : 0 }),
    });
    expect(signer).toBe(wallet);
  });

  it("signs nothing when the wallet holds too little or the token cannot be read", async () => {
    const funding = fakeWallet();
    const sponsor = fakeSponsor();
    const short = await deposit({ funding, account, sponsor, calls: fakeChainCalls(tokens({ [wallet]: 1n })), chainId: 137, value: 25_000_000n, nowMs: NOW_MS, randomBytes: fixedRandom });
    expect(short).toMatchObject({ ok: false, message: expect.stringMatching(/less USDC on Polygon/) });
    const unread = await deposit({ funding, account, sponsor, calls: fakeChainCalls({}), chainId: 8453, value: 1n, nowMs: NOW_MS, randomBytes: fixedRandom });
    expect(unread).toMatchObject({ ok: false, message: expect.stringMatching(/could not be read/) });
    expect(funding.typedRequests).toHaveLength(0);
    expect(sponsor.sent).toHaveLength(0);
  });

  it("refuses a signature that is not the wallet's own, and reports a declined one", async () => {
    const sponsor = fakeSponsor();
    const calls = fakeChainCalls(tokens({ [wallet]: 5n }));
    const foreign = await deposit({ funding: fakeWallet({ mode: "other_key" }), account, sponsor, calls, chainId: 8453, value: 5n, nowMs: NOW_MS, randomBytes: fixedRandom });
    expect(foreign).toMatchObject({ ok: false, message: expect.stringMatching(/plain key signature/) });
    const declined = await deposit({ funding: fakeWallet({ error: new WalletError("rejected", "no") }), account, sponsor, calls, chainId: 8453, value: 5n, nowMs: NOW_MS, randomBytes: fixedRandom });
    expect(declined).toMatchObject({ ok: false, message: expect.stringMatching(/declined/) });
    expect(sponsor.sent).toHaveLength(0);
  });

  it("passes the sponsor's refusal through with its words and any hash", async () => {
    const sponsor = fakeSponsor(async () => {
      throw new SponsorError("reverted", "The action was mined but failed on chain. No funds moved.", { detail: "boom", transactionHash: `0x${"cd".repeat(32)}` });
    });
    const result = await deposit({ funding: fakeWallet(), account, sponsor, calls: fakeChainCalls(tokens({ [wallet]: 5n })), chainId: 8453, value: 5n, nowMs: NOW_MS, randomBytes: fixedRandom });
    expect(result).toEqual({ ok: false, message: "The action was mined but failed on chain. No funds moved.", detail: "boom", transactionHash: `0x${"cd".repeat(32)}` });
  });
});

describe("withdraw", () => {
  const destination: Address = getAddress(`0x${"3f".repeat(20)}`);

  it("sends a sponsored USDC transfer from the account", async () => {
    const sponsor = fakeSponsor();
    const result = await withdraw({ account, sponsor, calls: fakeChainCalls(tokens({ [account]: 10_000_000n })), chainId: 137, to: destination, value: 4_000_000n });
    expect(result.ok).toBe(true);
    const call = sponsor.sent[0]?.calls[0];
    expect(call?.to).toBe(POLYGON_USDC);
    expect(decodeFunctionData({ abi: erc20Abi, data: call?.data ?? "0x" }).args).toEqual([destination, 4_000_000n]);
  });

  it("refuses more than the balance, and sending to the account itself", async () => {
    const sponsor = fakeSponsor();
    const calls = fakeChainCalls(tokens({ [account]: 1n }));
    expect(await withdraw({ account, sponsor, calls, chainId: 8453, to: destination, value: 2n })).toMatchObject({ ok: false });
    expect(await withdraw({ account, sponsor, calls, chainId: 8453, to: account, value: 1n })).toMatchObject({ ok: false });
    expect(sponsor.sent).toHaveLength(0);
  });
});

describe("amounts and destinations", () => {
  it("parses USDC amounts exactly and refuses more than 6 decimals", () => {
    expect(parseUsdcAmount("25.5")).toEqual({ ok: true, value: 25_500_000n });
    expect(parseUsdcAmount("0.000001")).toEqual({ ok: true, value: 1n });
    expect(parseUsdcAmount("0.0000001").ok).toBe(false);
    expect(parseUsdcAmount("0").ok).toBe(false);
    expect(parseUsdcAmount("-1").ok).toBe(false);
    expect(parseUsdcAmount("").ok).toBe(false);
  });

  it("checks a typed destination with the page's address rules", () => {
    expect(checkWithdrawDestination(`0x${"00".repeat(20)}`)).toMatchObject({ ok: false, code: "zero_address" });
    expect(checkWithdrawDestination(account.toLowerCase())).toMatchObject({ ok: true, form: "lowercase" });
    expect(checkWithdrawDestination("name.eth")).toMatchObject({ ok: false });
  });
});
