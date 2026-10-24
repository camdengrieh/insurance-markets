import { describe, expect, it } from "vitest";

import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, erc20Abi, getAddress, maxUint256, parseAbi, recoverMessageAddress, recoverTypedDataAddress, type Hex } from "viem";

import { LIMITLESS_USDC } from "@sdk/chain/limitless/constants";
import { POLYMARKET_PUSD } from "@sdk/chain/polymarket/constants";
import { polymarketWalletCandidates } from "@sdk/chain/polymarket/wallets";
import { POLYMARKET_DEPOSIT_WALLET_FACTORY } from "@sdk/chain/xo/constants";
import { DEPOSIT_WALLET_READ_ABI } from "@sdk/trade/clob/polymarket/deposit-wallet";

import { ANVIL_TEST_ACCOUNTS } from "../../../../../../test/fixtures/userop/anvil-test-keys";
import { MARKETS_API_ORIGIN } from "../../../../core/markets-api";
import type { TradingAccount } from "../../../account/types";
import type { VenueRequest } from "../http";
import { PROOF_HEADER, proofText } from "../../../account/proof";
import { asLocal, fakeChain, fakeSigner, fakeVenue, json, testDeps, TEST_NOW_MS, type FakeSigner, type FakeVenue, type Route } from "../testkit";
import { CONTRACT_OWNER, POLYMARKET_NOT_AVAILABLE, polymarketActivation, polymarketBalanceSource, STEP_APPROVE, STEP_CREATE, STEP_SIGN_IN } from "./activation";
import { depositWalletBatchTypedData, POLYMARKET_APPROVALS } from "./batch";
import { BRIDGE_MIN_ATOMIC, fundPolymarketFromBase } from "./bridge";
import { createPolymarketExecutor } from "./executor";
import { createPolymarketRelayerClient, type WalletBatchRequest } from "./relayer";

// Polymarket for the trading account against a scripted markets API (its relayer mirror and bridge route), Polymarket's
// CLOB and an in-memory Polygon and Base node: the deploy carries the key's ownership proof and nothing is deployed for
// a contract owner; the approvals are one batch signed with the wallet's DepositWallet/1 domain, signed once more on a
// stale nonce; the sign-in derives the CLOB credential; funding sends Base USDC to the bridge's deposit address. No
// network; the keys are the public Anvil test keys and every answer is written here.

const OWNER = ANVIL_TEST_ACCOUNTS[0]!;
const [, , BEACON] = polymarketWalletCandidates(OWNER.address);
if (BEACON === undefined) throw new Error("candidates");
const WALLET = BEACON.address;
const RELAY = "/v1/relay/polymarket";
const CREDENTIALS = { apiKey: "00000000-test-only-0000-000000000000", secret: "dGVzdC1vbmx5LXNlY3JldC0_Pz8-Pj4tYnl0ZXMtMDE=", passphrase: "test-only-passphrase" };
const DEPOSIT = getAddress(`0x${"de".repeat(20)}`);
const TX = `0x${"77".repeat(32)}` as Hex;

const READS = parseAbi([
  "function allowance(address, address) view returns (uint256)",
  "function isApprovedForAll(address, address) view returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function eip712Domain() view returns (bytes1 fields, string name, string version, uint256 chainId, address verifyingContract, bytes32 salt, uint256[] extensions)",
  "function getOwners() view returns (address[])",
]);

interface World {
  deployed: boolean;
  approved: boolean;
  ownerCode?: string;
  usdc?: bigint;
  pusd?: bigint;
}

function chainOf(world: World) {
  return {
    get code(): Record<string, string> {
      return { ...(world.deployed ? { [WALLET.toLowerCase()]: BEACON!.runtimeCode } : {}), ...(world.ownerCode === undefined ? {} : { [OWNER.address.toLowerCase()]: world.ownerCode }) };
    },
    call: (to: string, data: Hex): Hex | null => {
      const decoded = decodeFunctionData({ abi: READS, data });
      switch (decoded.functionName) {
        case "owner":
          return world.deployed && to === WALLET.toLowerCase() ? encodeAbiParameters([{ type: "address" }], [OWNER.address]) : null;
        case "eip712Domain":
          return world.deployed && to === WALLET.toLowerCase() ? encodeFunctionResult({ abi: DEPOSIT_WALLET_READ_ABI, functionName: "eip712Domain", result: ["0x0f", "DepositWallet", "1", 137n, WALLET, `0x${"00".repeat(32)}`, []] }) : null;
        case "allowance":
          return encodeAbiParameters([{ type: "uint256" }], [world.approved ? maxUint256 : 0n]);
        case "isApprovedForAll":
          return encodeAbiParameters([{ type: "bool" }], [world.approved]);
        case "balanceOf":
          if (to === LIMITLESS_USDC.toLowerCase()) return encodeAbiParameters([{ type: "uint256" }], [world.usdc ?? 0n]);
          if (to === POLYMARKET_PUSD.toLowerCase()) return encodeAbiParameters([{ type: "uint256" }], [world.pusd ?? 0n]);
          return null;
        default:
          return null;
      }
    },
  };
}

function rig(world: World, routes: Record<string, Route> = {}, options: { readonly relay?: boolean; readonly signer?: FakeSigner } = {}) {
  const node = chainOf(world);
  // A live view of the world: the code map is read on every request.
  const chain = fakeChain({ get code() { return node.code; }, call: node.call } as Parameters<typeof fakeChain>[0]);
  const submits: WalletBatchRequest[] = [];
  const venue: FakeVenue = fakeVenue({
    [`POST ${RELAY}/submit`]: (request) => {
      const body = JSON.parse(request.body ?? "{}") as { type: string };
      if (body.type === "WALLET-CREATE") return json(200, { transactionID: "tx-create", state: "STATE_NEW" });
      submits.push(body as WalletBatchRequest);
      return json(200, { transactionID: "tx-approve", state: "STATE_NEW" });
    },
    [`GET ${RELAY}/v1/account/transactions/tx-create`]: () => {
      world.deployed = true;
      return json(200, { transactionID: "tx-create", state: "STATE_CONFIRMED", proxyAddress: WALLET, transactionHash: TX });
    },
    [`GET ${RELAY}/v1/account/transactions/tx-approve`]: () => {
      world.approved = true;
      return json(200, [{ transactionID: "tx-approve", state: "STATE_CONFIRMED", transactionHash: TX }]);
    },
    [`GET ${RELAY}/v1/account/transactions/params`]: () => json(200, { address: `0x${"4c".repeat(20)}`, nonce: "3" }),
    "GET /time": () => ({ status: 200, text: String(Math.floor(TEST_NOW_MS / 1000)) }),
    "GET /auth/derive-api-key": () => json(200, CREDENTIALS),
    "GET /balance-allowance/update": () => json(200, {}),
    "POST /v1/relay/polymarket-bridge/deposit": () => json(201, { address: { evm: DEPOSIT, svm: "not-used", btc: "not-used" }, note: "test" }),
    ...routes,
  });
  const deps = testDeps(venue, chain);
  const executor = createPolymarketExecutor(deps);
  const relayer = options.relay === false ? null : createPolymarketRelayerClient(deps.http, MARKETS_API_ORIGIN ?? "");
  const activation = polymarketActivation({ deps, executor, relayer, sleep: async () => undefined, maxPolls: 3 });
  const signer = options.signer ?? fakeSigner(OWNER, { txHash: TX });
  const acct: TradingAccount = { signer: asLocal(signer), address: OWNER.address, mode: "derived", funding: null };
  return { venue, deps, executor, relayer, activation, signer, acct, submits };
}

const pathsOf = (venue: FakeVenue): string[] => venue.requests.map((request: VenueRequest) => `${request.method} ${new URL(request.url).pathname}`);

describe("the Polymarket activation", () => {
  it("creates the wallet with an ownership proof, approves in one batch, signs in, and then reads ready", async () => {
    const world: World = { deployed: false, approved: false };
    const { activation, acct, venue, signer, submits } = rig(world);
    expect(await activation.status(acct)).toEqual({ state: "needs_activation", steps: [STEP_CREATE, STEP_APPROVE, STEP_SIGN_IN] });
    const progress: string[] = [];
    expect(await activation.activate(acct, (step) => progress.push(step))).toEqual({ ok: true, value: undefined });
    expect(progress).toEqual([STEP_CREATE, STEP_APPROVE, STEP_SIGN_IN]);
    expect(pathsOf(venue)).toEqual([
      `POST ${RELAY}/submit`,
      `GET ${RELAY}/v1/account/transactions/tx-create`,
      `GET ${RELAY}/v1/account/transactions/params`,
      `POST ${RELAY}/submit`,
      `GET ${RELAY}/v1/account/transactions/tx-approve`,
      "GET /time",
      "GET /auth/derive-api-key",
      "GET /balance-allowance/update",
    ]);
    // The deploy: WALLET-CREATE for the key, to the factory, with a proof that recovers to the key.
    const deploy = venue.requests[0]!;
    expect(JSON.parse(deploy.body ?? "{}")).toEqual({ type: "WALLET-CREATE", from: OWNER.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY, metadata: "Deploy Deposit Wallet" });
    const [who, seconds, proof] = (deploy.headers?.[PROOF_HEADER] ?? "").split(".");
    expect(who).toBe(OWNER.address);
    expect(await recoverMessageAddress({ message: proofText("POST", `${RELAY}/submit`, Number(seconds), deploy.body ?? ""), signature: proof as Hex })).toBe(OWNER.address);
    expect(new URL(venue.requests[2]!.url).search).toBe(`?address=${OWNER.address}&type=WALLET`);
    // The batch: every approval, nonce 3, signed by the key over the wallet's DepositWallet/1 domain, no proof needed.
    expect(submits).toHaveLength(1);
    const batch = submits[0]!;
    expect(batch).toMatchObject({ type: "WALLET", from: OWNER.address, to: POLYMARKET_DEPOSIT_WALLET_FACTORY, nonce: "3" });
    expect(batch.depositWalletParams.depositWallet).toBe(WALLET);
    expect(batch.depositWalletParams.calls).toHaveLength(POLYMARKET_APPROVALS.length);
    expect(Number(batch.depositWalletParams.deadline)).toBe(Math.floor(TEST_NOW_MS / 1000) + 600);
    const typed = depositWalletBatchTypedData({ wallet: WALLET, nonce: 3n, deadline: BigInt(batch.depositWalletParams.deadline), calls: batch.depositWalletParams.calls });
    expect(await recoverTypedDataAddress({ ...typed, signature: batch.signature })).toBe(OWNER.address);
    expect(venue.requests[3]?.headers?.[PROOF_HEADER]).toBeUndefined();
    // Nothing was sent as a transaction from the key: Polymarket's relayer carries it all.
    expect(signer.transactions).toEqual([]);
    expect(await activation.status(acct)).toEqual({ state: "ready" });
  });

  it("signs the batch once more with the nonce the relayer names when its own was stale", async () => {
    let first = true;
    const { activation, acct, submits } = rig({ deployed: true, approved: false }, {
      [`POST ${RELAY}/submit`]: (request) => {
        const body = JSON.parse(request.body ?? "{}") as WalletBatchRequest;
        submits.push(body);
        if (first) {
          first = false;
          return { status: 400, text: "batch nonce 3 does not match on-chain nonce 5" };
        }
        return json(200, { transactionID: "tx-approve", state: "STATE_NEW" });
      },
    });
    expect(await activation.activate(acct, () => undefined)).toEqual({ ok: true, value: undefined });
    expect(submits.map((entry) => entry.nonce)).toEqual(["3", "5"]);
  });

  it("deploys nothing for an owner with contract code that is not a 7702 delegation, and accepts one that is", async () => {
    const contract = rig({ deployed: false, approved: false, ownerCode: "0x6080604052" });
    expect(await contract.activation.status(contract.acct)).toEqual({ state: "unavailable", reason: CONTRACT_OWNER });
    const refused = await contract.activation.activate(contract.acct, () => undefined);
    expect(!refused.ok && refused.refusal).toMatchObject({ code: "account_refused", message: CONTRACT_OWNER });
    expect(contract.venue.requests).toEqual([]);
    const delegated = rig({ deployed: false, approved: false, ownerCode: `0xef0100${"11".repeat(20)}` });
    expect((await delegated.activation.status(delegated.acct)).state).toBe("needs_activation");
  });

  it("says when the relayer refuses, reports an unsettled deploy as unknown, and is unavailable without a markets API", async () => {
    const limited = rig({ deployed: false, approved: false }, { [`POST ${RELAY}/submit`]: () => json(429, { error: "quota exceeded" }) });
    const answer = await limited.activation.activate(limited.acct, () => undefined);
    expect(!answer.ok && answer.refusal.code).toBe("venue_refused");
    expect(!answer.ok && answer.refusal.venueText).toBe("quota exceeded");
    const pending = rig({ deployed: false, approved: false }, { [`GET ${RELAY}/v1/account/transactions/tx-create`]: () => json(200, { state: "STATE_MINED" }) });
    const unsettled = await pending.activation.activate(pending.acct, () => undefined);
    expect(!unsettled.ok && unsettled.refusal.code).toBe("venue_ambiguous");
    const failed = rig({ deployed: false, approved: false }, { [`GET ${RELAY}/v1/account/transactions/tx-create`]: () => json(200, { state: "STATE_FAILED" }) });
    const lost = await failed.activation.activate(failed.acct, () => undefined);
    expect(!lost.ok && lost.refusal.code).toBe("venue_refused");
    const off = rig({ deployed: false, approved: false }, {}, { relay: false });
    expect(await off.activation.status(off.acct)).toEqual({ state: "unavailable", reason: POLYMARKET_NOT_AVAILABLE });
  });
});

describe("the Polymarket wallet's balance and funding from Base", () => {
  it("reports the wallet's pUSD, and nothing before the wallet exists", async () => {
    const before = rig({ deployed: false, approved: false });
    expect(await polymarketBalanceSource(before.deps).read(before.acct)).toEqual([]);
    const after = rig({ deployed: true, approved: true, pusd: 42_000_000n });
    expect(await polymarketBalanceSource(after.deps).read(after.acct)).toEqual([{ id: "polymarket-pusd", label: "Polymarket wallet (pUSD)", micros: 42_000_000n }]);
  });

  it("asks the bridge for the wallet's deposit address and sends Base USDC there from the key, once", async () => {
    const { deps, relayer, acct, signer, venue } = rig({ deployed: true, approved: true, usdc: 10_000_000n });
    const funded = await fundPolymarketFromBase(deps, relayer, acct, 5_000_000n);
    expect(funded).toEqual({ ok: true, value: { depositAddress: DEPOSIT, transactionHash: TX } });
    expect(JSON.parse(venue.requests.find((request) => request.url.endsWith("/deposit"))?.body ?? "{}")).toEqual({ address: WALLET });
    expect(signer.transactions).toHaveLength(1);
    const sent = signer.transactions[0]!;
    expect(sent).toMatchObject({ chainId: 8453, to: LIMITLESS_USDC });
    expect(decodeFunctionData({ abi: erc20Abi, data: sent.data }).args).toEqual([DEPOSIT, 5_000_000n]);
  });

  it("refuses below the bridge's minimum, beyond the balance, and before the wallet exists, sending nothing", async () => {
    const funded = rig({ deployed: true, approved: true, usdc: 1_000_000n });
    const small = await fundPolymarketFromBase(funded.deps, funded.relayer, funded.acct, BRIDGE_MIN_ATOMIC - 1n);
    expect(!small.ok && small.refusal.code).toBe("invalid_order");
    const short = await fundPolymarketFromBase(funded.deps, funded.relayer, funded.acct, BRIDGE_MIN_ATOMIC);
    expect(!short.ok && short.refusal.message).toMatch(/holds 1 USDC on Base/);
    const none = rig({ deployed: false, approved: false, usdc: 10_000_000n });
    const early = await fundPolymarketFromBase(none.deps, none.relayer, none.acct, BRIDGE_MIN_ATOMIC);
    expect(!early.ok && early.refusal.code).toBe("not_logged_in");
    expect([...funded.signer.transactions, ...none.signer.transactions]).toEqual([]);
  });
});
