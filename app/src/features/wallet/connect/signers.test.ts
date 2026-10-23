import { describe, expect, it } from "vitest";

import { recoverMessageAddress, recoverTypedDataAddress, hexToString, type TypedDataDefinition } from "viem";

import { WalletError } from "../../../core/signer";
import { addableChain } from "./chains";
import { accountsOf, chainIdOf, createInjectedSigner } from "./injected";
import { ACCOUNT_0, ACCOUNT_1, fakeSignClient, fakeWallet, RpcFailure, session, SESSION_TOPIC } from "./testkit";
import { createWalletConnectSigner, peerName } from "./walletconnect-signer";

const TYPED = (chainId: number): TypedDataDefinition => ({
  domain: { name: "Test", version: "1", chainId },
  types: { Note: [{ name: "text", type: "string" }] },
  primaryType: "Note",
  message: { text: "hello" },
});

async function rejection(promise: Promise<unknown>): Promise<WalletError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof WalletError) return error;
    throw error;
  }
  throw new Error("expected a rejection");
}

describe("the browser-wallet signer", () => {
  it("reads the wallet's chain, signs a message the way the address recovers, and says it sends transactions on any chain", async () => {
    const wallet = fakeWallet({ chainId: 137 });
    const signer = createInjectedSigner({ provider: wallet, name: "Test Wallet", address: ACCOUNT_0.address });
    expect(signer.kind).toBe("injected");
    expect(signer.capabilities).toEqual({ sendTransaction: true, rawMessage: true, chains: "any" });
    expect(await signer.chainId()).toBe(137);
    const signature = await signer.signMessage("hello");
    expect(await recoverMessageAddress({ message: "hello", signature })).toBe(ACCOUNT_0.address);
  });

  it("switches to the typed data's chain before signing, so the wallet does not refuse the domain", async () => {
    const wallet = fakeWallet({ chainId: 1 });
    const signer = createInjectedSigner({ provider: wallet, name: "Test Wallet", address: ACCOUNT_0.address });
    const signature = await signer.signTypedData(TYPED(137));
    expect(wallet.chainId).toBe(137);
    const methods = wallet.calls.map((call) => call.method);
    expect(methods.indexOf("wallet_switchEthereumChain")).toBeLessThan(methods.indexOf("eth_signTypedData_v4"));
    expect(await recoverTypedDataAddress({ ...TYPED(137), signature } as never)).toBe(ACCOUNT_0.address);
  });

  it("adds XO when the wallet answers 4902, with XO's public RPC, explorer and native coin, then switches", async () => {
    const wallet = fakeWallet({ chainId: 1 });
    const signer = createInjectedSigner({ provider: wallet, name: "Test Wallet", address: ACCOUNT_0.address });
    await signer.switchChain(3223);
    expect(wallet.chainId).toBe(3223);
    const add = wallet.calls.find((call) => call.method === "wallet_addEthereumChain");
    expect(add?.params).toEqual([
      {
        chainId: "0xc97",
        chainName: "XO Network",
        nativeCurrency: { name: "XO", symbol: "XO", decimals: 18 },
        rpcUrls: ["https://rpc-mainnet-2.xo.market"],
        blockExplorerUrls: ["https://explorer-mainnet.xo.market"],
      },
    ]);
  });

  it("refuses a chain it has nothing to offer for, and maps a declined switch", async () => {
    expect(addableChain(42161)).toBeNull();
    const wallet = fakeWallet({ chainId: 1 });
    const signer = createInjectedSigner({ provider: wallet, name: "Test Wallet", address: ACCOUNT_0.address });
    const unknown = await rejection(signer.switchChain(42161));
    expect(unknown.code).toBe("unsupported_chain");
    expect(wallet.calls.some((call) => call.method === "wallet_addEthereumChain")).toBe(false);
    wallet.failNext.set("wallet_switchEthereumChain", new RpcFailure(4001, "User rejected"));
    expect((await rejection(signer.switchChain(137))).code).toBe("rejected");
    wallet.failNext.set("wallet_addEthereumChain", new RpcFailure(4001, "User rejected"));
    expect((await rejection(signer.switchChain(3223))).code).toBe("rejected");
  });

  it("sends a transaction on the requested chain with the value in hex, and maps a declined one", async () => {
    const wallet = fakeWallet({ chainId: 1 });
    const signer = createInjectedSigner({ provider: wallet, name: "Test Wallet", address: ACCOUNT_0.address });
    const hash = await signer.sendTransaction({ chainId: 8453, to: ACCOUNT_1.address, data: "0x", value: 10n });
    expect(hash).toBe(`0x${"ab".repeat(32)}`);
    expect(wallet.chainId).toBe(8453);
    expect(wallet.calls.at(-1)).toEqual({ method: "eth_sendTransaction", params: [{ from: ACCOUNT_0.address, to: ACCOUNT_1.address, data: "0x", value: "0xa" }] });
    wallet.failNext.set("eth_sendTransaction", new RpcFailure(4001, "User denied"));
    expect((await rejection(signer.sendTransaction({ chainId: 8453, to: ACCOUNT_1.address, data: "0x" }))).code).toBe("rejected");
    wallet.failNext.set("personal_sign", new RpcFailure(4900, "Disconnected"));
    expect((await rejection(signer.signMessage("x"))).code).toBe("disconnected");
  });

  it("signs raw bytes with personal_sign over the bytes themselves (EIP-191), not over their hex spelling", async () => {
    const wallet = fakeWallet({ chainId: 137 });
    const signer = createInjectedSigner({ provider: wallet, name: "Test Wallet", address: ACCOUNT_0.address });
    const raw = `0x${"5a".repeat(32)}` as const;
    const signature = await signer.signRawMessage(raw);
    expect(wallet.calls.at(-1)).toEqual({ method: "personal_sign", params: [raw, ACCOUNT_0.address] });
    expect(await recoverMessageAddress({ message: { raw }, signature })).toBe(ACCOUNT_0.address);
    expect(await recoverMessageAddress({ message: raw, signature })).not.toBe(ACCOUNT_0.address);
    expect(wallet.chainId).toBe(137);
    const calls = wallet.calls.length;
    expect((await rejection(signer.signRawMessage("0x123" as `0x${string}`))).code).toBe("failed");
    expect((await rejection(signer.signRawMessage("0x" as `0x${string}`))).code).toBe("failed");
    expect(wallet.calls).toHaveLength(calls);
    wallet.failNext.set("personal_sign", new RpcFailure(4001, "User rejected"));
    expect((await rejection(signer.signRawMessage(raw))).code).toBe("rejected");
  });

  it("reads accounts and chain ids defensively", () => {
    expect(accountsOf([ACCOUNT_0.address.toLowerCase(), "0x1234", 5, ACCOUNT_0.address, ACCOUNT_1.address])).toEqual([ACCOUNT_0.address, ACCOUNT_1.address]);
    expect(accountsOf("nope")).toEqual([]);
    expect(chainIdOf("0x89")).toBe(137);
    expect(chainIdOf(8453)).toBe(8453);
    expect(chainIdOf("137")).toBe(137);
    expect(chainIdOf("0x")).toBeNull();
    expect(chainIdOf(-1)).toBeNull();
  });
});

describe("the WalletConnect signer", () => {
  it("takes its capabilities from the approved session: PayBox's chains, and no transactions", async () => {
    const client = fakeSignClient();
    const signer = createWalletConnectSigner({ client, session: session(), name: peerName(session()) });
    if (signer === null) throw new Error("fixture");
    expect(signer.kind).toBe("walletconnect");
    expect(signer.name).toBe("PayBox");
    expect(signer.address).toBe(ACCOUNT_0.address);
    expect(signer.capabilities).toEqual({ sendTransaction: false, rawMessage: true, chains: [137, 8453] });
    expect(await signer.chainId()).toBe(137);
    const refused = await rejection(signer.sendTransaction({ chainId: 137, to: ACCOUNT_1.address, data: "0x" }));
    expect(refused.code).toBe("unsupported");
    expect(client.requests).toEqual([]);
  });

  it("grants sending when the wallet approved eth_sendTransaction, on an approved chain only", async () => {
    const client = fakeSignClient();
    const approved = session({ methods: ["personal_sign", "eth_sendTransaction"] });
    const signer = createWalletConnectSigner({ client, session: approved, name: "Phone" });
    if (signer === null) throw new Error("fixture");
    expect(signer.capabilities.sendTransaction).toBe(true);
    client.answer = () => `0x${"cd".repeat(32)}`;
    expect(await signer.sendTransaction({ chainId: 8453, to: ACCOUNT_1.address, data: "0x12", value: 1n })).toBe(`0x${"cd".repeat(32)}`);
    expect(client.requests.at(-1)).toEqual({ topic: SESSION_TOPIC, chainId: "eip155:8453", method: "eth_sendTransaction", params: [{ from: ACCOUNT_0.address, to: ACCOUNT_1.address, data: "0x12", value: "0x1" }] });
    expect((await rejection(signer.sendTransaction({ chainId: 3223, to: ACCOUNT_1.address, data: "0x" }))).code).toBe("unsupported_chain");
  });

  it("signs typed data on the domain's chain, and refuses a domain on a chain the session lacks (XO for PayBox)", async () => {
    const client = fakeSignClient();
    const signer = createWalletConnectSigner({ client, session: session(), name: "PayBox" });
    if (signer === null) throw new Error("fixture");
    await signer.signTypedData(TYPED(8453));
    const request = client.requests.at(-1);
    expect(request?.chainId).toBe("eip155:8453");
    expect(request?.method).toBe("eth_signTypedData_v4");
    const [from, json] = request?.params as [string, string];
    expect(from).toBe(ACCOUNT_0.address);
    expect(JSON.parse(json)).toMatchObject({ primaryType: "Note", domain: { chainId: 8453 }, message: { text: "hello" } });
    expect(await signer.chainId()).toBe(8453);
    const xo = await rejection(signer.signTypedData(TYPED(3223)));
    expect(xo.code).toBe("unsupported_chain");
    expect(xo.message).toContain("XO");
    expect(client.requests).toHaveLength(1);
  });

  it("signs text as hex-encoded UTF-8 then the address, and maps a refusal", async () => {
    const client = fakeSignClient();
    const signer = createWalletConnectSigner({ client, session: session(), name: "PayBox" });
    if (signer === null) throw new Error("fixture");
    await signer.signMessage("héllo");
    const [data, from] = client.requests.at(-1)?.params as [`0x${string}`, string];
    expect(hexToString(data)).toBe("héllo");
    expect(from).toBe(ACCOUNT_0.address);
    client.answer = () => {
      throw { code: 5000, message: "User rejected." };
    };
    expect((await rejection(signer.signMessage("x"))).code).toBe("rejected");
    client.answer = () => "not hex";
    expect((await rejection(signer.signMessage("x"))).code).toBe("failed");
  });

  it("signs raw bytes only when the session approved personal_sign, and reads PayBox's refusal of binary data as unsupported", async () => {
    const raw = `0x${"5a".repeat(32)}` as const;
    const client = fakeSignClient();
    const phone = createWalletConnectSigner({ client, session: session({ chains: ["eip155:3223"], accounts: [`eip155:3223:${ACCOUNT_0.address}`] }), name: "Phone" });
    if (phone === null) throw new Error("fixture");
    expect(phone.capabilities.rawMessage).toBe(true);
    client.answer = (method, params) => (method === "personal_sign" ? ACCOUNT_0.signMessage({ message: { raw: (params as [`0x${string}`])[0] } }) : null);
    const signature = await phone.signRawMessage(raw);
    expect(client.requests.at(-1)).toEqual({ topic: SESSION_TOPIC, chainId: "eip155:3223", method: "personal_sign", params: [raw, ACCOUNT_0.address] });
    expect(await recoverMessageAddress({ message: { raw }, signature })).toBe(ACCOUNT_0.address);

    // PayBox approves personal_sign but signs valid UTF-8 text only: its error for bytes becomes "unsupported", in words.
    const paybox = createWalletConnectSigner({ client, session: session(), name: "PayBox" });
    if (paybox === null) throw new Error("fixture");
    expect(paybox.capabilities.rawMessage).toBe(true);
    client.answer = () => {
      throw { code: -32603, message: "Message is not valid UTF-8" };
    };
    const refused = await rejection(paybox.signRawMessage(raw));
    expect(refused.code).toBe("unsupported");
    expect(refused.message).toContain("PayBox signs text only");
    client.answer = () => {
      throw { code: 5000, message: "User rejected." };
    };
    expect((await rejection(paybox.signRawMessage(raw))).code).toBe("rejected");
    client.answer = () => "not hex";
    expect((await rejection(paybox.signRawMessage(raw))).code).toBe("failed");

    // A session without personal_sign offers no raw signing and asks the wallet nothing.
    const typedOnly = createWalletConnectSigner({ client, session: session({ methods: ["eth_signTypedData_v4"] }), name: "Typed only" });
    if (typedOnly === null) throw new Error("fixture");
    expect(typedOnly.capabilities.rawMessage).toBe(false);
    const before = client.requests.length;
    expect((await rejection(typedOnly.signRawMessage(raw))).code).toBe("unsupported");
    expect(client.requests).toHaveLength(before);
  });

  it("switches within the approved chains (asking the wallet only when it granted the method) and refuses others", async () => {
    const client = fakeSignClient();
    const quiet = createWalletConnectSigner({ client, session: session(), name: "PayBox" });
    if (quiet === null) throw new Error("fixture");
    await quiet.switchChain(8453);
    expect(await quiet.chainId()).toBe(8453);
    expect(client.requests).toEqual([]);
    expect((await rejection(quiet.switchChain(1))).code).toBe("unsupported_chain");
    const asking = createWalletConnectSigner({ client, session: session({ methods: ["wallet_switchEthereumChain"] }), name: "Phone" });
    if (asking === null) throw new Error("fixture");
    client.answer = () => null;
    await asking.switchChain(8453);
    expect(client.requests.at(-1)).toMatchObject({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] });
  });

  it("uses a later account only when the session approved it, and is null for a session without an eip155 account", () => {
    const client = fakeSignClient();
    const both = session({ accounts: [`eip155:137:${ACCOUNT_0.address}`, `eip155:137:${ACCOUNT_1.address}`] });
    expect(createWalletConnectSigner({ client, session: both, name: "x", address: ACCOUNT_1.address })?.address).toBe(ACCOUNT_1.address);
    expect(createWalletConnectSigner({ client, session: session(), name: "x", address: ACCOUNT_1.address })?.address).toBe(ACCOUNT_0.address);
    expect(createWalletConnectSigner({ client, session: session({ accounts: [] }), name: "x" })).toBeNull();
    expect(peerName({ ...session(), peer: { metadata: {} } })).toBe("WalletConnect wallet");
  });
});
