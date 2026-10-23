import { describe, expect, it } from "vitest";

import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, padHex, parseAbi, type Hex } from "viem";

import { POLYMARKET_SAFE_SINGLETON } from "@sdk/chain/polymarket/constants";
import { polymarketWalletCandidates } from "@sdk/chain/polymarket/wallets";
import { DEPOSIT_WALLET_READ_ABI } from "@sdk/trade/clob/polymarket/deposit-wallet";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { fakeChain, fakeSigner, fakeVenue, testDeps, type FakeNode } from "../testkit";
import { createPolymarketExecutor } from "./executor";
import { EOA_ALLOWLIST_NOTE, MAKER_LABEL, readPolymarketAccounts } from "./maker";

// Which account a wallet trades from, against an in-memory Polygon node: the relay's rule (Deposit Wallet, else the
// wallet itself) plus the Safe, and a refusal in words whenever the chain cannot be read or says something odd.

const SIGNER = ANVIL_TEST_ACCOUNTS[1]!.address;
const STRANGER = ANVIL_TEST_ACCOUNTS[2]!.address;
const [PROXY, SAFE, BEACON, UUPS] = polymarketWalletCandidates(SIGNER);
if (PROXY === undefined || SAFE === undefined || BEACON === undefined || UUPS === undefined) throw new Error("candidates");
const key = (address: string): string => address.toLowerCase();
const SINGLETON_SLOT = padHex(POLYMARKET_SAFE_SINGLETON.toLowerCase() as Hex, { size: 32 });
const READS = parseAbi(["function getOwners() view returns (address[])", "function owner() view returns (address)", "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)"]);
const ZERO32 = `0x${"00".repeat(32)}` as const;

interface World {
  readonly safeOwners?: readonly string[];
  readonly depositOwner?: string;
  readonly domain?: "ok" | "other" | "revert";
}

function calls(world: World): FakeNode["call"] {
  return (to, data) => {
    const { functionName } = decodeFunctionData({ abi: READS, data });
    if (functionName === "getOwners" && to === key(SAFE!.address) && world.safeOwners !== undefined) return encodeAbiParameters([{ type: "address[]" }], [world.safeOwners as `0x${string}`[]]);
    if (functionName === "owner" && world.depositOwner !== undefined) return encodeAbiParameters([{ type: "address" }], [world.depositOwner as `0x${string}`]);
    if (functionName === "eip712Domain" && world.domain !== "revert") {
      const name = world.domain === "other" ? "SomethingElse" : "DepositWallet";
      return encodeFunctionResult({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "eip712Domain", result: ["0x0f", name, "1", 137n, to as `0x${string}`, ZERO32, []] });
    }
    return null;
  };
}

const safeDeployed = { [key(SAFE.address)]: SAFE.runtimeCode };
const beaconDeployed = { [key(BEACON.address)]: BEACON.runtimeCode };

describe("which Polymarket account a wallet trades from", () => {
  it("nothing deployed: the wallet itself, type 0, with the relay's allowlist caution", async () => {
    const result = await readPolymarketAccounts(fakeChain({}), SIGNER);
    expect(result).toEqual({ ok: true, value: { accounts: [{ venue: "polymarket", chainId: 137, signer: SIGNER, maker: SIGNER, label: MAKER_LABEL.eoa, signatureType: 0, makerIsSigner: true }], notes: [EOA_ALLOWLIST_NOTE] } });
  });

  it("a Safe the wallet owns: the Safe, type 2, the wallet signing for it", async () => {
    const chain = fakeChain({ code: safeDeployed, slot0: { [key(SAFE.address)]: SINGLETON_SLOT }, call: calls({ safeOwners: [STRANGER, SIGNER] }) });
    const result = await readPolymarketAccounts(chain, SIGNER);
    expect(result.ok ? result.value.accounts : null).toEqual([{ venue: "polymarket", chainId: 137, signer: SIGNER, maker: SAFE.address, label: MAKER_LABEL.safe, signatureType: 2, makerIsSigner: false }]);
  });

  it("a Deposit Wallet the wallet owns with the expected domain: the Deposit Wallet, type 3", async () => {
    const chain = fakeChain({ code: beaconDeployed, call: calls({ depositOwner: SIGNER, domain: "ok" }) });
    const result = await readPolymarketAccounts(chain, SIGNER);
    expect(result.ok ? result.value.accounts.map((entry) => [entry.maker, entry.signatureType]) : null).toEqual([[BEACON.address, 3]]);
  });

  it("both a Deposit Wallet and a Safe: both offered, the Deposit Wallet first, and the page says so", async () => {
    const chain = fakeChain({ code: { ...safeDeployed, ...beaconDeployed }, slot0: { [key(SAFE.address)]: SINGLETON_SLOT }, call: calls({ safeOwners: [SIGNER], depositOwner: SIGNER, domain: "ok" }) });
    const result = await readPolymarketAccounts(chain, SIGNER);
    expect(result.ok ? result.value.accounts.map((entry) => entry.signatureType) : null).toEqual([3, 2]);
    expect(result.ok ? result.value.notes.join(" ") : "").toMatch(/pick the Safe instead/);
  });

  it("a failed read is a refusal in words, never the wallet itself by default", async () => {
    const down = await readPolymarketAccounts(fakeChain({ down: true }), SIGNER);
    expect(down.ok ? null : down.refusal.code).toBe("chain_unreadable");
    // A deployed Deposit Wallet that does not answer owner(): unreadable, so not "no wallet".
    const silent = await readPolymarketAccounts(fakeChain({ code: beaconDeployed }), SIGNER);
    expect(silent.ok ? null : silent.refusal.code).toBe("chain_unreadable");
    const noDomain = await readPolymarketAccounts(fakeChain({ code: beaconDeployed, call: calls({ depositOwner: SIGNER, domain: "revert" }) }), SIGNER);
    expect(noDomain.ok ? null : noDomain.refusal.code).toBe("chain_unreadable");
    expect(await readPolymarketAccounts(null, SIGNER)).toMatchObject({ ok: false, refusal: { code: "chain_unreadable" } });
  });

  it("refuses what the relay refuses, and a Safe it cannot use when the Safe would be the account", async () => {
    const owned = await readPolymarketAccounts(fakeChain({ code: beaconDeployed, call: calls({ depositOwner: STRANGER, domain: "ok" }) }), SIGNER);
    expect(owned.ok ? null : owned.refusal.code).toBe("account_refused");
    const domain = await readPolymarketAccounts(fakeChain({ code: beaconDeployed, call: calls({ depositOwner: SIGNER, domain: "other" }) }), SIGNER);
    expect(domain.ok ? null : domain.refusal.message).toMatch(/EIP-712 domain/);
    const both = await readPolymarketAccounts(fakeChain({ code: { ...beaconDeployed, [key(UUPS.address)]: UUPS.runtimeCode }, call: calls({ depositOwner: SIGNER, domain: "ok" }) }), SIGNER);
    expect(both.ok ? null : both.refusal.message).toMatch(/Both addresses/);
    const foreignSafe = await readPolymarketAccounts(fakeChain({ code: safeDeployed, slot0: { [key(SAFE.address)]: SINGLETON_SLOT }, call: calls({ safeOwners: [STRANGER] }) }), SIGNER);
    expect(foreignSafe.ok ? null : foreignSafe.refusal.code).toBe("account_refused");
    const proxyOnly = await readPolymarketAccounts(fakeChain({ code: { [key(PROXY.address)]: PROXY.runtimeCode } }), SIGNER);
    expect(proxyOnly.ok ? null : proxyOnly.refusal.message).toMatch(/proxy wallet/);
  });

  it("the executor asks only when the wallet's session includes Polygon", async () => {
    const executor = createPolymarketExecutor(testDeps(fakeVenue(), fakeChain({})));
    const ready = await executor.ready(fakeSigner(ANVIL_TEST_ACCOUNTS[1]!, { capabilities: { chains: [8453] } }));
    expect(ready.ok ? null : ready.refusal.code).toBe("wallet_wrong_chain");
    expect((await executor.ready(fakeSigner(ANVIL_TEST_ACCOUNTS[1]!, { capabilities: { chains: [137] } }))).ok).toBe(true);
  });
});
