// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import type { WalletSigner } from "../../../core/signer";
import { ModeProvider } from "../../../ui/context";
import { act, cleanup, render } from "../../../ui/testing/dom";
import { eventually } from "../view-harness";
import { useWalletSigner } from "./context";
import type { WalletEnvironment } from "./environment";
import { ACCOUNT_0, ACCOUNT_1, announcement, fakeSignClient, fakeTarget, fakeWallet, memoryStorage, session, SESSION_TOPIC, testEnvironment } from "./testkit";
import { LAST_WALLET_KEY, WalletConnectionProvider, useWalletConnection, type WalletConnection } from "./WalletConnectionProvider";

// The connection's life cycle without any UI: account and chain changes from a browser wallet, a WalletConnect
// session's events, and reconnecting after a reload without a prompt.

afterEach(cleanup);

interface Seen {
  connection: WalletConnection | null;
  signer: WalletSigner | null;
  signers: WalletSigner[];
}

function Probe({ seen }: { readonly seen: Seen }) {
  const connection = useWalletConnection();
  const signer = useWalletSigner();
  seen.connection = connection;
  seen.signer = signer;
  if (signer !== null && !seen.signers.includes(signer)) seen.signers.push(signer);
  return null;
}

function mount(environment: WalletEnvironment): Seen {
  const seen: Seen = { connection: null, signer: null, signers: [] };
  render(
    <ModeProvider mode="standalone">
      <WalletConnectionProvider environment={environment}>
        <Probe seen={seen} />
      </WalletConnectionProvider>
    </ModeProvider>,
  );
  return seen;
}

function live(seen: Seen): WalletConnection {
  if (seen.connection === null) throw new Error("not rendered");
  return seen.connection;
}

async function connectInjected(options: { readonly storage?: ReturnType<typeof memoryStorage> } = {}) {
  const wallet = fakeWallet({ chainId: 137 });
  const storage = options.storage ?? memoryStorage();
  const seen = mount(testEnvironment({ target: fakeTarget([announcement(wallet, { rdns: "org.example.wallet" })]), storage }));
  await eventually(() => expect(live(seen).wallets).toHaveLength(1), act);
  await act(async () => live(seen).connectInjected("org.example.wallet"));
  await eventually(() => expect(seen.signer).not.toBeNull(), act);
  return { wallet, storage, seen };
}

describe("a browser wallet connection", () => {
  it("provides the signer to every screen and remembers the wallet by its id, never an address", async () => {
    const { seen, storage } = await connectInjected();
    expect(seen.signer?.address).toBe(ACCOUNT_0.address);
    expect(live(seen).phase).toEqual({ kind: "connected", via: "injected" });
    expect(live(seen).chainId).toBe(137);
    expect(JSON.parse(storage.map.get(LAST_WALLET_KEY) ?? "null")).toEqual({ via: "injected", walletId: "org.example.wallet" });
  });

  it("replaces the signer with a new object when the account changes, and keeps it when the same account is reported", async () => {
    const { wallet, seen } = await connectInjected();
    const first = seen.signer;
    act(() => wallet.emit("accountsChanged", [ACCOUNT_0.address.toLowerCase()]));
    expect(seen.signer).toBe(first);
    act(() => wallet.emit("accountsChanged", [ACCOUNT_1.address]));
    await eventually(() => expect(seen.signer?.address).toBe(ACCOUNT_1.address), act);
    expect(seen.signer).not.toBe(first);
    expect(seen.signers).toHaveLength(2);
  });

  it("follows a chain change, and ends the connection on an empty account list or a disconnect event", async () => {
    const { wallet, seen, storage } = await connectInjected();
    act(() => wallet.emit("chainChanged", "0x2105"));
    await eventually(() => expect(live(seen).chainId).toBe(8453), act);
    act(() => wallet.emit("accountsChanged", []));
    await eventually(() => expect(seen.signer).toBeNull(), act);
    expect(live(seen).phase).toEqual({ kind: "idle" });
    expect(storage.map.has(LAST_WALLET_KEY)).toBe(false);
    // The listeners went with the connection.
    expect(wallet.listenerCount("accountsChanged")).toBe(0);

    const again = await connectInjected();
    act(() => again.wallet.emit("disconnect", { code: 4900 }));
    await eventually(() => expect(again.seen.signer).toBeNull(), act);
  });

  it("reconnects the last wallet after a reload with eth_accounts, without a prompt", async () => {
    const wallet = fakeWallet({ chainId: 8453, authorised: true });
    const storage = memoryStorage({ [LAST_WALLET_KEY]: JSON.stringify({ via: "injected", walletId: "org.example.wallet" }) });
    const seen = mount(testEnvironment({ target: fakeTarget([announcement(wallet, { rdns: "org.example.wallet" })]), storage }));
    await eventually(() => expect(seen.signer?.address).toBe(ACCOUNT_0.address), act);
    expect(wallet.calls.map((call) => call.method)).toEqual(["eth_accounts", "eth_chainId"]);
    expect(live(seen).chainId).toBe(8453);
  });

  it("stays disconnected after a reload when the wallet no longer shares an account", async () => {
    const wallet = fakeWallet({ authorised: false });
    const storage = memoryStorage({ [LAST_WALLET_KEY]: JSON.stringify({ via: "injected", walletId: "org.example.wallet" }) });
    const seen = mount(testEnvironment({ target: fakeTarget([announcement(wallet, { rdns: "org.example.wallet" })]), storage }));
    await eventually(() => expect(live(seen).phase).toEqual({ kind: "idle" }), act);
    expect(wallet.calls.map((call) => call.method)).toEqual(["eth_accounts"]);
    expect(seen.signer).toBeNull();
  });

  it("ignores a damaged or foreign remembered value", async () => {
    const wallet = fakeWallet({ authorised: true });
    const storage = memoryStorage({ [LAST_WALLET_KEY]: "{not json" });
    const seen = mount(testEnvironment({ target: fakeTarget([announcement(wallet)]), storage }));
    await eventually(() => expect(live(seen).discovering).toBe(false), act);
    expect(wallet.calls).toEqual([]);
    expect(seen.signer).toBeNull();
  });
});

describe("a WalletConnect connection", () => {
  async function paired(options: { readonly storage?: ReturnType<typeof memoryStorage> } = {}) {
    const client = fakeSignClient();
    const storage = options.storage ?? memoryStorage();
    const environment = testEnvironment({ target: null, client, storage });
    const seen = mount(environment);
    await act(async () => {
      void live(seen).startWalletConnect();
    });
    await eventually(() => expect(live(seen).phase).toMatchObject({ kind: "pairing", uri: expect.stringMatching(/^wc:/) as unknown }), act);
    await act(async () => client.approve(session({ accounts: [`eip155:137:${ACCOUNT_0.address}`, `eip155:137:${ACCOUNT_1.address}`, `eip155:8453:${ACCOUNT_0.address}`] })));
    await eventually(() => expect(seen.signer).not.toBeNull(), act);
    return { client, storage, seen, environment };
  }

  it("does not load the sign-client at all until the visitor starts WalletConnect", () => {
    const environment = testEnvironment({ target: null, client: fakeSignClient() });
    mount(environment);
    expect(environment.loads).toEqual([]);
  });

  it("connects, remembers the session topic, and follows the wallet's chain and account events", async () => {
    const { client, storage, seen } = await paired();
    expect(seen.signer?.kind).toBe("walletconnect");
    expect(JSON.parse(storage.map.get(LAST_WALLET_KEY) ?? "null")).toEqual({ via: "walletconnect", topic: SESSION_TOPIC });
    act(() => client.emit("session_event", { topic: SESSION_TOPIC, params: { event: { name: "chainChanged", data: 8453 }, chainId: "eip155:8453" } }));
    await eventually(() => expect(live(seen).chainId).toBe(8453), act);
    expect(await seen.signer?.chainId()).toBe(8453);
    // A chain outside the session is ignored.
    act(() => client.emit("session_event", { topic: SESSION_TOPIC, params: { event: { name: "chainChanged", data: 3223 } } }));
    expect(live(seen).chainId).toBe(8453);
    const first = seen.signer;
    await act(async () => client.emit("session_event", { topic: SESSION_TOPIC, params: { event: { name: "accountsChanged", data: [`eip155:137:${ACCOUNT_1.address}`] } } }));
    await eventually(() => expect(seen.signer?.address).toBe(ACCOUNT_1.address), act);
    expect(seen.signer).not.toBe(first);
    // Events for another session's topic change nothing.
    act(() => client.emit("session_delete", { topic: "f".repeat(64) }));
    expect(seen.signer).not.toBeNull();
  });

  it("ends the connection when the wallet deletes the session or it expires", async () => {
    const one = await paired();
    act(() => one.client.emit("session_delete", { topic: SESSION_TOPIC }));
    await eventually(() => expect(one.seen.signer).toBeNull(), act);
    expect(one.storage.map.has(LAST_WALLET_KEY)).toBe(false);
    cleanup();
    const two = await paired();
    act(() => two.client.emit("session_expire", { topic: SESSION_TOPIC }));
    await eventually(() => expect(two.seen.signer).toBeNull(), act);
  });

  it("restores the stored session after a reload, and forgets one that has expired", async () => {
    const client = fakeSignClient();
    client.sessions = [session()];
    const storage = memoryStorage({ [LAST_WALLET_KEY]: JSON.stringify({ via: "walletconnect", topic: SESSION_TOPIC }) });
    const environment = testEnvironment({ target: null, client, storage });
    const seen = mount(environment);
    await eventually(() => expect(seen.signer?.kind).toBe("walletconnect"), act);
    expect(environment.loads).toHaveLength(1);
    expect(seen.signer?.capabilities).toEqual({ sendTransaction: false, rawMessage: true, chains: [137, 8453] });
    cleanup();

    const stale = fakeSignClient();
    stale.sessions = [session({ expiry: 1 })];
    const staleStorage = memoryStorage({ [LAST_WALLET_KEY]: JSON.stringify({ via: "walletconnect", topic: SESSION_TOPIC }) });
    const after = mount(testEnvironment({ target: null, client: stale, storage: staleStorage }));
    await eventually(() => expect(live(after).phase).toEqual({ kind: "idle" }), act);
    expect(after.signer).toBeNull();
    expect(staleStorage.map.has(LAST_WALLET_KEY)).toBe(false);
  });

  it("does not start, or restore, when the build has no project id", async () => {
    const client = fakeSignClient();
    const storage = memoryStorage({ [LAST_WALLET_KEY]: JSON.stringify({ via: "walletconnect", topic: SESSION_TOPIC }) });
    const environment = testEnvironment({ target: null, client, storage, projectId: null });
    const seen = mount(environment);
    expect(live(seen).walletConnect).toEqual({ status: "not_configured", reason: "WalletConnect is not configured in this build" });
    await act(async () => live(seen).startWalletConnect());
    expect(environment.loads).toEqual([]);
    expect(client.connects).toEqual([]);
  });

  it("reports a declined pairing in words", async () => {
    const client = fakeSignClient();
    const seen = mount(testEnvironment({ target: null, client }));
    await act(async () => {
      void live(seen).startWalletConnect();
    });
    await eventually(() => expect(live(seen).phase.kind).toBe("pairing"), act);
    await act(async () => client.reject({ code: 5000, message: "User rejected." }));
    await eventually(() => expect(live(seen).error?.code).toBe("rejected"), act);
    expect(live(seen).phase).toEqual({ kind: "idle" });
  });
});
