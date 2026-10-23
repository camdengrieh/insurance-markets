import { describe, expect, it } from "vitest";
import { getAddress, hashMessage, recoverAddress } from "viem";

import { CONDITIONAL_TOKENS, CTF_EXCHANGE, ENTRY_POINT_V07, KERNEL_FACTORY, POLICY_PAYMASTER, USDC_E_ADDRESS } from "@sdk/chain/xo/constants";
import { buildInitCode, deriveAccount } from "@sdk/trade/xo/account/derive";
import { decodeExecute } from "@sdk/trade/xo/userop/encode";
import { userOpHash } from "@sdk/trade/xo/userop/hash";
import { firstOpNonce, kernelNonce } from "@sdk/trade/xo/userop/nonce";
import { unpackUserOp } from "@sdk/trade/xo/userop/pack";
import { verifyUserOpSignature } from "@sdk/trade/xo/userop/verify";
import { fromRpcUserOperation } from "@shared/xo/userop/bundler";

import { WalletError } from "../../../../core/signer";
import type { XoReadiness } from "./readiness";
import { XoRelayClient } from "./relay";
import { parseAllowanceCap, RAW_SIGNING_WORDS, setupActionFor, setupCardPasses, XoAccountSetup, type AllowanceChoice, type ChainCall, type XoSetupCard } from "./setup";
import { fakeRelay, fakeSetupBundler, fakeSigner, fakeXoChain, ownerAddress, RELAY_ORIGIN, TEST_TX as TX, type BundlerRequest, type FakeSigner, type Route } from "./testkit";

// The account setup against a fake XO chain (eth_call answers written here) and a fake bundler behind the fake relay.
// Nothing here contacts XO: every answer is made up by the test that installs it.

const OWNER = ownerAddress();
const ACCOUNT = getAddress(deriveAccount(OWNER));
const UNLIMITED: AllowanceChoice = { kind: "unlimited" };

function readiness(overrides: Partial<XoReadiness> = {}): XoReadiness {
  return { owner: OWNER, account: ACCOUNT, deployed: "no", registered: false, usdcMicro: 0n, allowanceMicro: 0n, sellApproved: false, ...overrides };
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const chain = fakeXoChain;
const bundler = fakeSetupBundler;

interface Harness {
  readonly setup: XoAccountSetup;
  readonly signer: FakeSigner;
  readonly cards: XoSetupCard[];
  readonly bundlerSeen: BundlerRequest[];
  readonly chainSeen: ChainCall[];
  readonly relayCalls: ReturnType<typeof fakeRelay>["calls"];
}

function harness(options: { readonly signer?: FakeSigner; readonly chain?: ReturnType<typeof chain>; readonly bundler?: ReturnType<typeof bundler>; readonly decide?: boolean; readonly bundlerRoute?: Route; readonly maxPolls?: number } = {}): Harness {
  const fake = options.bundler ?? bundler();
  const relay = fakeRelay({ "POST /v1/relay/xo/bundler": options.bundlerRoute ?? fake.route });
  const signer = options.signer ?? fakeSigner();
  const node = options.chain ?? chain();
  const cards: XoSetupCard[] = [];
  const setup = new XoAccountSetup({
    signer,
    relay: new XoRelayClient(RELAY_ORIGIN, relay.fetch),
    call: node.call,
    confirm: async (card) => {
      cards.push(card);
      // The card is decided before the wallet is asked anything.
      expect(signer.calls.some((call) => call.method === "signRawMessage")).toBe(false);
      return options.decide ?? true;
    },
    sleep: async () => undefined,
    maxPolls: options.maxPolls ?? 5,
  });
  return { setup, signer, cards, bundlerSeen: fake.seen, chainSeen: node.seen, relayCalls: relay.calls };
}

const methods = (seen: readonly BundlerRequest[]): string[] => seen.map((request) => request.method);

describe("what the account needs", () => {
  it("follows the read: no code deploys, missing approvals enable, an unknown or a complete account offers nothing", () => {
    expect(setupActionFor(readiness())).toBe("deploy_enable_trading");
    expect(setupActionFor(readiness({ deployed: "yes" }))).toBe("enable_trading");
    expect(setupActionFor(readiness({ deployed: "yes", allowanceMicro: 5n, sellApproved: false }))).toBe("enable_trading");
    expect(setupActionFor(readiness({ deployed: "yes", allowanceMicro: 5n, sellApproved: true }))).toBeNull();
    expect(setupActionFor(readiness({ deployed: "unknown" }))).toBeNull();
    expect(setupActionFor(readiness({ deployed: "yes", allowanceMicro: null }))).toBeNull();
    expect(setupActionFor(readiness({ deployed: "yes", sellApproved: null }))).toBeNull();
  });

  it("reads a typed allowance cap exactly, and refuses zero or anything that is not an amount", () => {
    expect(parseAllowanceCap(" 25.5 ")).toEqual({ ok: true, amountMicro: 25_500_000n });
    expect(parseAllowanceCap("0").ok).toBe(false);
    expect(parseAllowanceCap("1e6").ok).toBe(false);
    expect(parseAllowanceCap("0.0000001").ok).toBe(false);
  });
});

describe("deploying the account and enabling trading", () => {
  it("builds the operation the relay would, shows every call on the card, signs the userOpHash with personal_sign, sends it once and follows the receipt", async () => {
    const h = harness();
    const result = await h.setup.run(readiness(), UNLIMITED);
    expect(result.state).toBe("done");
    expect(result.words).toContain(TX);

    // The card: the deploy, both calls decoded, the unlimited approval said in words, every check passing.
    const card = h.cards[0] as XoSetupCard;
    expect(card.action).toBe("deploy_enable_trading");
    expect(setupCardPasses(card)).toBe(true);
    expect(card.rows.find((row) => row.label === "Deploys the account")?.value).toContain(KERNEL_FACTORY);
    expect(card.rows.find((row) => row.label === "Paymaster")?.value).toContain(POLICY_PAYMASTER);
    expect(card.calls).toHaveLength(2);
    expect(card.calls[0]).toMatchObject({ targetAddress: getAddress(USDC_E_ADDRESS), fn: "approve(address spender, uint256 amount)", unlimited: true });
    expect(card.calls[0]?.args.map((arg) => arg.value).join(" ")).toContain(`the CTF exchange ${getAddress(CTF_EXCHANGE)}`);
    expect(card.calls[0]?.args.find((arg) => arg.label === "amount")?.value).toMatch(/^UNLIMITED/);
    expect(card.calls[1]).toMatchObject({ targetAddress: getAddress(CONDITIONAL_TOKENS), fn: "setApprovalForAll(address operator, bool approved)" });
    expect(card.eip191Digest).toBe(hashMessage({ raw: card.userOpHash }));
    expect(card.notes.join(" ")).toContain("unlimited");

    // The wallet was asked for the userOpHash as raw bytes, once, after the card.
    expect(h.signer.calls.filter((call) => call.method === "signRawMessage").map((call) => call.arg)).toEqual([card.userOpHash]);
    expect(h.signer.calls.some((call) => call.method === "signTypedData" || call.method === "switchChain")).toBe(false);

    // One estimate, one send, then the receipt until it came. No nonce read for a deployment: the first-op nonce.
    expect(methods(h.bundlerSeen)).toEqual(["eth_estimateUserOperationGas", "eth_sendUserOperation", "eth_getUserOperationReceipt", "eth_getUserOperationReceipt"]);
    expect(h.chainSeen.some((entry) => same(entry.to, ENTRY_POINT_V07))).toBe(false);
    expect(h.relayCalls.every((call) => call.url === `${RELAY_ORIGIN}/v1/relay/xo/bundler` && call.method === "POST")).toBe(true);

    // What was sent is the card's operation, signed by the owner over the EIP-191 hash, with the estimate applied.
    const sendRequest = h.bundlerSeen[1] as BundlerRequest;
    expect(sendRequest.params[1]).toBe(ENTRY_POINT_V07);
    const sent = fromRpcUserOperation(sendRequest.params[0]);
    expect(userOpHash(sent)).toBe(card.userOpHash);
    expect(sent.initCode).toBe(buildInitCode(OWNER));
    expect(sent.nonce).toBe(firstOpNonce());
    const fields = unpackUserOp(sent);
    expect([fields.maxFeePerGas, fields.maxPriorityFeePerGas]).toEqual([0n, 0n]);
    expect(fields.verificationGasLimit).toBe(0x50000n);
    expect(fields.callGasLimit).toBe((0x20000n * 130n + 99n) / 100n);
    expect(fields.paymaster?.address).toBe(getAddress(POLICY_PAYMASTER));
    expect(await recoverAddress({ hash: hashMessage({ raw: card.userOpHash }), signature: sent.signature })).toBe(OWNER);
    const verified = await verifyUserOpSignature({ op: sent, signature: sent.signature, expectedOwner: OWNER });
    expect(verified.ok && verified.form).toBe("eip191");
    expect(decodeExecute(sent.callData).calls.map((call) => getAddress(call.to))).toEqual([getAddress(USDC_E_ADDRESS), getAddress(CONDITIONAL_TOKENS)]);
  });

  it("never sends a deployment the paymaster will not sponsor, and asks the wallet nothing", async () => {
    for (const node of [chain({ policy: false }), chain({ paused: true }), chain({ down: true })]) {
      const h = harness({ chain: node });
      const result = await h.setup.run(readiness(), UNLIMITED);
      expect(result.state).toBe("refused");
      expect(result.words).toContain("never sent without it");
      expect(h.cards).toHaveLength(0);
      expect(h.signer.calls).toEqual([]);
      expect(h.bundlerSeen).toEqual([]);
    }
  });

  it("keeps the observed limits when the bundler gives no estimate, and says so on the card", async () => {
    const h = harness({ bundler: bundler({ estimate: () => ({ error: { code: -32601, message: "method not found" } }) }) });
    const result = await h.setup.run(readiness(), UNLIMITED);
    expect(result.state).toBe("done");
    const card = h.cards[0] as XoSetupCard;
    expect(card.notes.join(" ")).toContain("no gas estimate");
    expect(card.rows.find((row) => row.label === "Gas limits")?.value).toContain("observed defaults");
  });
});

describe("enabling trading on a deployed account", () => {
  it("reads the nonce on XO's chain, sends no initCode, and shows a capped allowance as the amount typed", async () => {
    const nonce = kernelNonce({ sequence: 3n });
    const h = harness({ chain: chain({ nonce }) });
    const result = await h.setup.run(readiness({ deployed: "yes" }), { kind: "capped", amountMicro: 25_000_000n });
    expect(result.state).toBe("done");
    const card = h.cards[0] as XoSetupCard;
    expect(card.action).toBe("enable_trading");
    expect(card.rows.find((row) => row.label === "Deploys the account")?.value).toBe("no: it already has code");
    expect(card.calls[0]?.unlimited).toBe(false);
    expect(card.calls[0]?.args.find((arg) => arg.label === "amount")?.value).toBe("25 USDC.e (25000000 micro)");
    expect(card.notes.join(" ")).toContain("T8");
    expect(h.chainSeen.some((entry) => same(entry.to, ENTRY_POINT_V07))).toBe(true);
    const sent = fromRpcUserOperation((h.bundlerSeen.find((request) => request.method === "eth_sendUserOperation") as BundlerRequest).params[0]);
    expect(sent.initCode).toBe("0x");
    expect(sent.nonce).toBe(nonce);
  });

  it("goes without the paymaster when it will not sponsor an existing account, and says so", async () => {
    const h = harness({ chain: chain({ nonce: kernelNonce({ sequence: 1n }), paused: true }) });
    const result = await h.setup.run(readiness({ deployed: "yes" }), UNLIMITED);
    expect(result.state).toBe("done");
    const card = h.cards[0] as XoSetupCard;
    expect(card.rows.find((row) => row.label === "Paymaster")?.value).toBe("none");
    expect(card.notes.join(" ")).toContain("No paymaster is used (it is paused)");
  });

  it("builds nothing when the nonce cannot be read", async () => {
    const h = harness({ chain: chain({ down: true }) });
    const result = await h.setup.run(readiness({ deployed: "yes" }), UNLIMITED);
    expect(result.state).toBe("refused");
    expect(result.words).toContain("nonce");
    expect(h.bundlerSeen).toEqual([]);
  });
});

describe("the wallet and the signature", () => {
  it("refuses in words a connection that cannot sign raw bytes (PayBox), before building anything", async () => {
    const h = harness({ signer: fakeSigner({ kind: "walletconnect", chains: [3223], rawMessage: false }) });
    const result = await h.setup.run(readiness(), UNLIMITED);
    expect(result).toMatchObject({ state: "refused", words: RAW_SIGNING_WORDS });
    expect(h.cards).toHaveLength(0);
    expect(h.chainSeen).toEqual([]);
    expect(h.bundlerSeen).toEqual([]);
  });

  it("maps a wallet that refuses the bytes, or a person who declines, and sends nothing", async () => {
    const refusing = harness({ signer: fakeSigner({ rawMode: "refuse" }) });
    expect(await refusing.setup.run(readiness(), UNLIMITED)).toMatchObject({ state: "refused", words: RAW_SIGNING_WORDS });
    expect(methods(refusing.bundlerSeen)).toEqual(["eth_estimateUserOperationGas"]);
    const declining = harness({ signer: fakeSigner({ signError: new WalletError("rejected", "User rejected the request.") }) });
    expect((await declining.setup.run(readiness(), UNLIMITED)).state).toBe("declined");
    expect(methods(declining.bundlerSeen)).toEqual(["eth_estimateUserOperationGas"]);
    const card = harness({ decide: false });
    expect(await card.setup.run(readiness(), UNLIMITED)).toMatchObject({ state: "declined", words: "You chose not to sign the account setup. Nothing was sent." });
    expect(card.signer.calls).toEqual([]);
  });

  it("sends nothing when the signature is not the owner's EIP-191 signature of the userOpHash", async () => {
    const other = harness({ signer: fakeSigner({ signWith: `0x${"5d".repeat(32)}` }) });
    expect((await other.setup.run(readiness(), UNLIMITED)).words).toContain("does not recover to the connected address");
    // A wallet that signed the 32 bytes with no prefix (not what personal_sign does): valid for the validator, but not
    // what the card said the wallet would sign, so it is refused too.
    const unprefixed = harness({ signer: fakeSigner({ rawMode: "unprefixed" }) });
    expect((await unprefixed.setup.run(readiness(), UNLIMITED)).state).toBe("refused");
    for (const h of [other, unprefixed]) expect(methods(h.bundlerSeen)).toEqual(["eth_estimateUserOperationGas"]);
  });
});

describe("the send and its outcome", () => {
  it("a relay refusal before sending is 'nothing sent'; a relay timeout is ambiguous and is never sent again", async () => {
    const refusedFirst = harness({
      bundler: bundler({ send: () => ({ reply: { status: 429, from: "relay", body: { error: { code: "rate_limited", message: "Too many relay requests" } } } }) }),
    });
    const refused = await refusedFirst.setup.run(readiness(), UNLIMITED);
    expect(refused.state).toBe("refused");
    expect(refused.words).toContain("Nothing reached XO's bundler");

    const timedOut = harness({
      bundler: bundler({ send: () => ({ reply: { status: 504, from: "relay", body: { error: { code: "upstream_timeout", message: "XO's bundler did not answer in time." } } } }) }),
    });
    const ambiguous = await timedOut.setup.run(readiness(), UNLIMITED);
    expect(ambiguous.state).toBe("ambiguous");
    expect(ambiguous.value?.userOpHash).toBe((timedOut.cards[0] as XoSetupCard).userOpHash);
    expect(methods(timedOut.bundlerSeen).filter((method) => method === "eth_sendUserOperation")).toHaveLength(1);
    expect(methods(timedOut.bundlerSeen)).not.toContain("eth_getUserOperationReceipt");
  });

  it("passes on the bundler's refusal with its AA code, and a hash that differs from ours is ambiguous", async () => {
    const aa = harness({ bundler: bundler({ send: () => ({ error: { code: -32500, message: "AA33 reverted: paymaster validation" } }) }) });
    const refused = await aa.setup.run(readiness(), UNLIMITED);
    expect(refused.state).toBe("refused");
    expect(refused.words).toContain("AA33");
    expect(refused.answer?.text).toContain("paymaster validation");
    const odd = harness({ bundler: bundler({ send: () => ({ result: `0x${"01".repeat(32)}` }) }) });
    expect((await odd.setup.run(readiness(), UNLIMITED)).state).toBe("ambiguous");
  });

  it("stops polling after the bound and says to check again; follow() settles it later; a revert is said", async () => {
    const slow = harness({ bundler: bundler({ receipts: ["none"] }), maxPolls: 3 });
    const pending = await slow.setup.run(readiness(), UNLIMITED);
    expect(pending.state).toBe("ambiguous");
    expect(pending.words).toContain("Do not sign another");
    expect(methods(slow.bundlerSeen).filter((method) => method === "eth_getUserOperationReceipt")).toHaveLength(3);

    const later = harness({ bundler: bundler({ receipts: ["ok"] }) });
    const settled = await later.setup.follow((slow.cards[0] as XoSetupCard).userOpHash);
    expect(settled.state).toBe("done");
    expect(methods(later.bundlerSeen)).toEqual(["eth_getUserOperationReceipt"]);

    const reverted = harness({ bundler: bundler({ receipts: ["reverted"] }) });
    const result = await reverted.setup.run(readiness(), UNLIMITED);
    expect(result.state).toBe("refused");
    expect(result.words).toContain("reverted");
  });
});

