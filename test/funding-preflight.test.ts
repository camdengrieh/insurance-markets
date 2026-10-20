import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeFunctionData, parseAbi } from "viem";

import { ERC20_ABI } from "../src/xo/chain/abi.js";
import {
  BASE_ROUTER_IMPLEMENTATION,
  BASE_USDC,
  BASE_WARP_ROUTER,
  HYPERLANE_HOOK,
  HYPERLANE_ISM,
  HYPERLANE_MAILBOX,
  MARKET_MANAGER,
  USDC_E_ADDRESS,
  XO_ROUTE_IMPLEMENTATION,
  XO_WARP_ROUTE,
  type Address,
  type Hex,
} from "../src/xo/chain/constants.js";
import { ChainReadError, type RoutePairingReading, type RpcHttpResponse, type RpcTransport } from "../src/xo/chain/reads.js";
import { nextFundingStep } from "../src/xo/funding/steps.js";
import { buildFundingCalls, encodeTransferRemote, padRecipient, type FundingCall } from "../src/xo/funding/calldata.js";
import {
  BaseRpc,
  DEFAULT_BASE_RPC_URL,
  FUNDING_CEILING_ATOMIC,
  FUNDING_TEST_AMOUNT_ATOMIC,
  PREFLIGHT_CHECK_IDS,
  checkAllowance,
  checkBalances,
  checkDestinationDomain,
  checkFundingAmount,
  checkMsgValueZero,
  checkQuoteZeroFee,
  checkRecipientDeployed,
  checkRecipientNotEoaNotZero,
  checkRouterPairing,
  proofFromAccountState,
  proofFromRelayState,
  readFundingChain,
  runPreflight,
  type DeploymentProof,
  type PreflightCheckId,
  type PreflightCode,
  type PreflightInput,
} from "../src/xo/funding/preflight.js";
import { revert } from "./fixtures/chain/fakes.js";
import {
  ACCOUNT,
  ACCOUNT_B,
  BASE_URL,
  FakeBase,
  OWNER,
  OWNER_B,
  USDC,
  accountStateFromLogs,
  baseRpcOver,
} from "./funding-helpers.js";

const A = 3n * USDC;
// The two ERC-20 reads, for decoding the eth_call data the reader sent.
const ERC20_READS = parseAbi(["function allowance(address owner, address spender) view returns (uint256)", "function balanceOf(address account) view returns (uint256)"]);
const YES_BOTH: readonly DeploymentProof[] = [{ source: "relay", deployed: "yes" }, { source: "chain_logs", deployed: "yes" }];

async function baseline(step: "approve" | "transfer" = "transfer", change: (base: FakeBase) => void = () => undefined): Promise<PreflightInput> {
  const base = new FakeBase();
  base.allowance = step === "transfer" ? A : 0n;
  base.balance = 10n * A;
  change(base);
  const readings = await readFundingChain(baseRpcOver(base), OWNER, ACCOUNT, A);
  const calls = buildFundingCalls({ owner: OWNER, amount: A });
  return {
    owner: OWNER,
    account: ACCOUNT,
    amount: A,
    step,
    calls: [calls.approve, calls.transfer],
    chainId: readings.chainId,
    pairing: readings.pairing,
    allowance: readings.allowance,
    baseBalance: readings.baseBalance,
    deployment: YES_BOTH,
  };
}

function withBaseSide(input: PreflightInput, change: Partial<NonNullable<RoutePairingReading["base"]>>): PreflightInput {
  assert.ok(input.pairing);
  return { ...input, pairing: { ...input.pairing, base: { ...input.pairing.base, ...change } } };
}

function withCall(input: PreflightInput, kind: "approve" | "transfer", change: Partial<FundingCall>): PreflightInput {
  return { ...input, calls: input.calls.map((call) => (call.kind === kind ? { ...call, ...change } : call)) };
}

const OTHER: Address = ACCOUNT_B;
const failedIds = (input: PreflightInput): PreflightCheckId[] => runPreflight(input).failures.map((check) => check.id);

describe("the baseline", () => {
  it("passes all eight checks, in order, for both steps", async () => {
    for (const step of ["approve", "transfer"] as const) {
      const report = runPreflight(await baseline(step));
      assert.equal(report.ok, true, step);
      assert.deepEqual(report.checks.map((check) => check.id), [...PREFLIGHT_CHECK_IDS]);
      assert.equal(report.checks.length, 8);
      assert.deepEqual(report.failures, []);
    }
  });

  it("marks the allowance check as not applicable for the approve step only", async () => {
    const approve = runPreflight(await baseline("approve")).checks.find((check) => check.id === "allowance");
    assert.deepEqual([approve?.applies, approve?.code], [false, "not_applicable"]);
    const transfer = runPreflight(await baseline("transfer")).checks.find((check) => check.id === "allowance");
    assert.deepEqual([transfer?.applies, transfer?.code], [true, "ok"]);
  });

  it("reports that the XO side was not read, and that the relay alone vouches for deployment", async () => {
    const input = await baseline();
    assert.deepEqual(runPreflight(input).warnings, ["xo_side_unchecked"]);
    const relayOnly = runPreflight({ ...input, deployment: [proofFromRelayState("registered")] });
    assert.ok(relayOnly.warnings.includes("deployment_confirmed_by_relay_only"));
    assert.equal(relayOnly.ok, true);
  });
});

// One flip per row; each must fail exactly the named check, with the named stable code.
interface Flip {
  readonly name: string;
  readonly check: PreflightCheckId;
  readonly code: PreflightCode;
  readonly apply: (input: PreflightInput) => PreflightInput;
  readonly step?: "approve" | "transfer";
  // Other checks that fail for the same reason (an input two checks both depend on).
  readonly also?: readonly PreflightCheckId[];
}

const wordHex = (address: string): string => padRecipient(address).slice(2);
const wrongDomainTransfer = (domain: number, amount: bigint = A): Hex => encodeTransferRemote(padRecipient(ACCOUNT), amount, domain);
const rightPadded: Hex = `0x81b4e8b4${(3223).toString(16).padStart(64, "0")}${ACCOUNT.slice(2).toLowerCase()}${"0".repeat(24)}${A.toString(16).padStart(64, "0")}`;

const FLIPS: readonly Flip[] = [
  // 1 router_pairing
  { name: "RPC is not Base", check: "router_pairing", code: "wrong_chain", apply: (i) => ({ ...i, chainId: 1 }) },
  { name: "chain id unreadable", check: "router_pairing", code: "chain_unreadable", apply: (i) => ({ ...i, chainId: null }) },
  { name: "pairing unreadable", check: "router_pairing", code: "pairing_unreadable", also: ["quote_zero_fee"], apply: (i) => ({ ...i, pairing: null }) },
  { name: "router token differs", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { token: USDC_E_ADDRESS }) },
  { name: "routers(3223) is not the XO route", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { remoteRouter: wordHex(OTHER) as Hex }) },
  { name: "routers(3223) is empty", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { remoteRouter: `0x${"0".repeat(64)}` }) },
  { name: "Mailbox differs", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { mailbox: OTHER }) },
  { name: "ISM differs", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { ism: OTHER }) },
  { name: "local domain differs", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { localDomain: 1 }) },
  { name: "implementation was upgraded", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { implementation: OTHER }) },
  { name: "default hook differs", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { defaultHook: OTHER }) },
  { name: "required hook differs", check: "router_pairing", code: "wrong_router", apply: (i) => withBaseSide(i, { requiredHook: OTHER }) },
  { name: "a pairing field is unreadable", check: "router_pairing", code: "pairing_unreadable", apply: (i) => withBaseSide(i, { implementation: null }) },
  { name: "the transfer goes to another router", check: "router_pairing", code: "wrong_router", apply: (i) => withCall(i, "transfer", { to: XO_WARP_ROUTE }) },
  { name: "the approve goes to another token", check: "router_pairing", code: "wrong_router", apply: (i) => withCall(i, "approve", { to: USDC_E_ADDRESS }) },
  {
    name: "the XO side names another token",
    check: "router_pairing",
    code: "wrong_router",
    apply: (i) => ({
      ...i,
      pairing: {
        ...(i.pairing as RoutePairingReading),
        xo: { token: BASE_USDC, remoteRouter: wordHex(BASE_WARP_ROUTER) as Hex, mailbox: HYPERLANE_MAILBOX, ism: HYPERLANE_ISM, localDomain: 3223, implementation: XO_ROUTE_IMPLEMENTATION, defaultHook: HYPERLANE_HOOK, requiredHook: HYPERLANE_HOOK },
      },
    }),
  },
  // 2 msg_value_zero
  { name: "transfer carries value", check: "msg_value_zero", code: "value_not_zero", apply: (i) => withCall(i, "transfer", { value: "1" }) },
  { name: "approve carries value", check: "msg_value_zero", code: "value_not_zero", apply: (i) => withCall(i, "approve", { value: "1000000000000000000" }) },
  { name: "value spelled 0x0", check: "msg_value_zero", code: "value_not_zero", apply: (i) => withCall(i, "transfer", { value: "0x0" }) },
  { name: "value spelled 00", check: "msg_value_zero", code: "value_not_zero", apply: (i) => withCall(i, "transfer", { value: "00" }) },
  // 3 quote_zero_fee
  { name: "quote unreadable", check: "quote_zero_fee", code: "quote_unreadable", apply: (i) => ({ ...i, pairing: { ...(i.pairing as RoutePairingReading), baseQuote: null } }) },
  {
    name: "quote asks for native gas",
    check: "quote_zero_fee",
    code: "quote_not_zero_fee",
    apply: (i) => ({ ...i, pairing: { ...(i.pairing as RoutePairingReading), baseQuote: [{ token: "0x0000000000000000000000000000000000000000", amount: 1n }, { token: BASE_USDC, amount: A }, { token: BASE_USDC, amount: 0n }] } }),
  },
  {
    name: "quote asks for a warp fee",
    check: "quote_zero_fee",
    code: "quote_not_zero_fee",
    apply: (i) => ({ ...i, pairing: { ...(i.pairing as RoutePairingReading), baseQuote: [{ token: "0x0000000000000000000000000000000000000000", amount: 0n }, { token: BASE_USDC, amount: A }, { token: BASE_USDC, amount: 1n }] } }),
  },
  {
    name: "quote pulls a different amount",
    check: "quote_zero_fee",
    code: "quote_not_zero_fee",
    apply: (i) => ({ ...i, pairing: { ...(i.pairing as RoutePairingReading), baseQuote: [{ token: "0x0000000000000000000000000000000000000000", amount: 0n }, { token: BASE_USDC, amount: A + 1n }, { token: BASE_USDC, amount: 0n }] } }),
  },
  {
    name: "quote has an extra entry",
    check: "quote_zero_fee",
    code: "quote_not_zero_fee",
    apply: (i) => ({ ...i, pairing: { ...(i.pairing as RoutePairingReading), baseQuote: [...((i.pairing as RoutePairingReading).baseQuote ?? []), { token: BASE_USDC, amount: 0n }] } }),
  },
  {
    name: "quote names another token",
    check: "quote_zero_fee",
    code: "quote_not_zero_fee",
    apply: (i) => ({ ...i, pairing: { ...(i.pairing as RoutePairingReading), baseQuote: [{ token: "0x0000000000000000000000000000000000000000", amount: 0n }, { token: USDC_E_ADDRESS, amount: A }, { token: BASE_USDC, amount: 0n }] } }),
  },
  // 4 destination_domain
  { name: "destination is Base itself", check: "destination_domain", code: "wrong_destination", apply: (i) => withCall(i, "transfer", { data: wrongDomainTransfer(8453) }) },
  { name: "destination is 3222", check: "destination_domain", code: "wrong_destination", apply: (i) => withCall(i, "transfer", { data: wrongDomainTransfer(3222) }) },
  { name: "an approve is on Ethereum", check: "destination_domain", code: "wrong_proposal_chain", apply: (i) => withCall(i, "approve", { chain: "eip155:1" }) },
  { name: "the transfer is on the XO chain", check: "destination_domain", code: "wrong_proposal_chain", apply: (i) => withCall(i, "transfer", { chain: "eip155:3223" }) },
  { name: "the transfer calldata is garbage", check: "destination_domain", code: "bad_calldata", also: ["recipient_not_eoa_not_zero"], apply: (i) => withCall(i, "transfer", { data: "0x81b4e8b4" }) },
  { name: "the transfer call is missing", check: "destination_domain", code: "bad_calldata", also: ["router_pairing", "recipient_not_eoa_not_zero"], apply: (i) => ({ ...i, calls: i.calls.filter((call) => call.kind !== "transfer") }) },
  // 5 recipient_deployed
  { name: "no deployment evidence at all", check: "recipient_deployed", code: "deployment_unproven", apply: (i) => ({ ...i, deployment: [] }) },
  { name: "the relay says undeployed", check: "recipient_deployed", code: "recipient_undeployed", apply: (i) => ({ ...i, deployment: [proofFromRelayState("undeployed")] }) },
  { name: "the logs say undeployed", check: "recipient_deployed", code: "recipient_undeployed", apply: (i) => ({ ...i, deployment: [{ source: "chain_logs", deployed: "no" }] }) },
  { name: "the sources contradict (relay yes, logs no)", check: "recipient_deployed", code: "recipient_undeployed", apply: (i) => ({ ...i, deployment: [{ source: "relay", deployed: "yes" }, { source: "chain_logs", deployed: "no" }] }) },
  { name: "the only evidence is unknown", check: "recipient_deployed", code: "deployment_unproven", apply: (i) => ({ ...i, deployment: [{ source: "chain_logs", deployed: "unknown" }] }) },
  // 6 recipient_not_eoa_not_zero
  { name: "recipient is the zero address", check: "recipient_not_eoa_not_zero", code: "zero_recipient", apply: (i) => withCall(i, "transfer", { data: encodeTransferRemote(`0x${"0".repeat(64)}`, A) }) },
  { name: "recipient is the owner EOA", check: "recipient_not_eoa_not_zero", code: "recipient_is_owner", apply: (i) => withCall(i, "transfer", { data: encodeTransferRemote(padRecipient(OWNER), A) }) },
  { name: "recipient is another owner's account", check: "recipient_not_eoa_not_zero", code: "recipient_not_derived", apply: (i) => withCall(i, "transfer", { data: encodeTransferRemote(padRecipient(ACCOUNT_B), A) }) },
  { name: "recipient is a protocol contract", check: "recipient_not_eoa_not_zero", code: "recipient_protocol_contract", apply: (i) => withCall(i, "transfer", { data: encodeTransferRemote(padRecipient(MARKET_MANAGER), A) }) },
  { name: "the flow is for another account than the recipient", check: "recipient_not_eoa_not_zero", code: "recipient_not_derived", apply: (i) => ({ ...i, account: ACCOUNT_B }) },
  { name: "recipient word is right-padded", check: "recipient_not_eoa_not_zero", code: "bad_padding", apply: (i) => withCall(i, "transfer", { data: rightPadded }) },
  { name: "the transfer call is missing", check: "recipient_not_eoa_not_zero", code: "bad_calldata", also: ["router_pairing", "destination_domain"], apply: (i) => ({ ...i, calls: i.calls.filter((call) => call.kind !== "transfer") }) },
  // 7 allowance
  { name: "allowance unreadable (transfer step)", check: "allowance", code: "allowance_unreadable", apply: (i) => ({ ...i, allowance: null }) },
  { name: "allowance unreadable (approve step)", check: "allowance", code: "allowance_unreadable", step: "approve", apply: (i) => ({ ...i, allowance: null }) },
  { name: "allowance short for the transfer", check: "allowance", code: "allowance_short", apply: (i) => ({ ...i, allowance: A - 1n }) },
  { name: "allowance zero for the transfer", check: "allowance", code: "allowance_short", apply: (i) => ({ ...i, allowance: 0n }) },
  // 8 balances
  { name: "balance unreadable", check: "balances", code: "balance_unreadable", apply: (i) => ({ ...i, baseBalance: null }) },
  { name: "balance one atom short", check: "balances", code: "insufficient_balance", apply: (i) => ({ ...i, baseBalance: A - 1n }) },
  { name: "balance zero", check: "balances", code: "insufficient_balance", step: "approve", apply: (i) => ({ ...i, baseBalance: 0n }) },
];

describe("each flipped input refuses, on its own check, with a stable code", () => {
  for (const flip of FLIPS) {
    it(`${flip.check}: ${flip.name}`, async () => {
      const input = flip.apply(await baseline(flip.step ?? "transfer"));
      const report = runPreflight(input);
      assert.equal(report.ok, false);
      const failure = report.failures.find((check) => check.id === flip.check);
      assert.ok(failure, `expected ${flip.check} to fail; failures: ${report.failures.map((f) => f.id).join(",")}`);
      assert.equal(failure.code, flip.code);
      assert.equal(failure.ok, false);
      assert.ok(failure.detail.length > 0);
      // The flip must not spill into an unrelated check. Where two checks read the same input, the row
      // says so in `also`.
      const expected = [flip.check, ...(flip.also ?? [])];
      assert.deepEqual([...failedIds(input)].sort(), [...expected].sort(), flip.name);
    });
  }

  it("covers every one of the eight checks, with at least two flips each", () => {
    for (const id of PREFLIGHT_CHECK_IDS) assert.ok(FLIPS.filter((flip) => flip.check === id).length >= 2, id);
  });
});

describe("the step machine and the preflight agree", () => {
  it("every step the machine hands out passes the preflight; every block is refused on the balance", async () => {
    const allowances = [0n, A - 1n, A, A + 1n, 2n ** 256n - 1n];
    const balances = [0n, A - 1n, A, A + 1n, 10n * A];
    for (const allowance of allowances) {
      for (const baseBalance of balances) {
        const decision = nextFundingStep({ amount: A, allowance, baseBalance, xoBalance: null, xoBalanceBefore: null });
        assert.ok(decision.step === "approve" || decision.step === "transfer" || decision.step === "blocked");
        const input = { ...(await baseline(decision.step === "transfer" ? "transfer" : "approve")), allowance, baseBalance };
        const report = runPreflight(input);
        if (decision.step === "blocked") {
          assert.deepEqual(report.failures.map((check) => check.id), ["balances"], `${allowance} ${baseBalance}`);
        } else {
          assert.equal(report.ok, true, `${decision.step} ${allowance} ${baseBalance}`);
        }
      }
    }
  });
});

describe("the checks are separately callable", () => {
  it("checkRouterPairing, checkMsgValueZero, checkQuoteZeroFee, checkDestinationDomain, and the rest", async () => {
    const input = await baseline();
    assert.equal(checkRouterPairing(input).ok, true);
    assert.equal(checkMsgValueZero(input).ok, true);
    assert.equal(checkQuoteZeroFee(input).ok, true);
    assert.equal(checkDestinationDomain(input).ok, true);
    assert.equal(checkRecipientDeployed(input).ok, true);
    assert.equal(checkRecipientNotEoaNotZero(input).ok, true);
    assert.equal(checkAllowance(input).ok, true);
    assert.equal(checkBalances(input).ok, true);
  });

  it("deployment proofs: a relay state or a log result is positive only when deployed", async () => {
    assert.deepEqual(proofFromRelayState("undeployed"), { source: "relay", deployed: "no" });
    assert.deepEqual(proofFromRelayState("deployed_unregistered"), { source: "relay", deployed: "yes" });
    assert.deepEqual(proofFromRelayState("registered"), { source: "relay", deployed: "yes" });
    assert.deepEqual(proofFromAccountState(await accountStateFromLogs(OWNER, ACCOUNT, true)), { source: "chain_logs", deployed: "yes" });
    assert.deepEqual(proofFromAccountState(await accountStateFromLogs(OWNER, ACCOUNT, false)), { source: "chain_logs", deployed: "no" });
  });

  it("a deployed account the logs cannot show stays unproven, not undeployed", async () => {
    // Registered with the orderbook but no deployment log: the state machine calls it unknown.
    const state = await accountStateFromLogs(OWNER, ACCOUNT, false, true);
    assert.equal(state.deployed, "unknown");
    assert.equal(checkRecipientDeployed({ deployment: [proofFromAccountState(state)] }).code, "deployment_unproven");
  });
});

describe("amount policy (amendment A6)", () => {
  const policy = (amount: bigint, delivery: "unknown" | "yes" | "no", credit: "unknown" | "yes" | "no") => checkFundingAmount({ amount, delivery, credit });

  it("has the documented limits", () => {
    assert.equal(FUNDING_TEST_AMOUNT_ATOMIC, 3_000_000n);
    assert.equal(FUNDING_CEILING_ATOMIC, 50_000_000n);
  });

  it("allows up to the test amount with no facts at all", () => {
    for (const amount of [1n, USDC, FUNDING_TEST_AMOUNT_ATOMIC]) assert.deepEqual(policy(amount, "unknown", "unknown").code, "ok");
  });

  it("refuses above the test amount unless delivery AND credit are both recorded as yes", () => {
    const over = FUNDING_TEST_AMOUNT_ATOMIC + 1n;
    for (const delivery of ["unknown", "yes", "no"] as const) {
      for (const credit of ["unknown", "yes", "no"] as const) {
        const result = policy(over, delivery, credit);
        const allowed = delivery === "yes" && credit === "yes";
        assert.equal(result.ok, allowed, `${delivery}/${credit}`);
        assert.equal(result.code, allowed ? "ok" : "above_test_amount");
      }
    }
  });

  it("refuses above the daily funding ceiling even with both facts", () => {
    assert.equal(policy(FUNDING_CEILING_ATOMIC, "yes", "yes").ok, true);
    assert.deepEqual(policy(FUNDING_CEILING_ATOMIC + 1n, "yes", "yes").code, "above_ceiling");
  });

  it("refuses zero, negative and non-bigint amounts", () => {
    for (const bad of [0n, -1n, 1 as unknown as bigint]) assert.equal(policy(bad, "yes", "yes").code, "invalid_amount");
  });

  it("lets a caller lower the test amount, and applies it", () => {
    assert.equal(checkFundingAmount({ amount: 2n * USDC, delivery: "unknown", credit: "unknown", testAmount: USDC }).code, "above_test_amount");
    assert.equal(checkFundingAmount({ amount: USDC, delivery: "unknown", credit: "unknown", testAmount: USDC }).code, "ok");
  });
});

describe("BaseRpc", () => {
  const post = (handler: (body: { id: number; method: string; params: unknown[] }) => RpcHttpResponse | Promise<RpcHttpResponse>): RpcTransport => ({
    postJson: async (_url, body) => handler(body as { id: number; method: string; params: unknown[] }),
  });
  const reply = (id: number, result: unknown): RpcHttpResponse => ({ status: 200, body: { jsonrpc: "2.0", id, result } });
  const code = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      return error instanceof ChainReadError ? error.code : `other:${String(error)}`;
    }
    return "none";
  };

  it("accepts only an https URL with no credentials or query", () => {
    const transport = post((b) => reply(b.id, "0x2105"));
    assert.doesNotThrow(() => new BaseRpc({ transport, url: DEFAULT_BASE_RPC_URL }));
    assert.doesNotThrow(() => new BaseRpc({ transport, url: BASE_URL }));
    for (const bad of ["http://base.example.test", "http://127.0.0.1:8545", "ws://x.test", "ftp://x.test", "https://user:pw@x.test", "https://x.test/?key=abc", "x.test", "", "https://"]) {
      assert.throws(() => new BaseRpc({ transport, url: bad }), ChainReadError, bad);
    }
  });

  it("reads the chain id", async () => {
    const rpc = new BaseRpc({ transport: post((b) => reply(b.id, "0x2105")), url: BASE_URL });
    assert.equal(await rpc.chainId(), 8453);
    for (const bad of [null, "8453", "0x", "0xzz", 8453, {}]) {
      const wrong = new BaseRpc({ transport: post((b) => reply(b.id, bad)), url: BASE_URL });
      assert.equal(await code(() => wrong.chainId()), "invalid_response", JSON.stringify(bad));
    }
  });

  it("latches on a 401 or 403 and then sends nothing more, to either reader", async () => {
    let sent = 0;
    const rpc = new BaseRpc({
      transport: post((b) => {
        sent += 1;
        return b.method === "eth_chainId" ? { status: 401, body: "unauthorized" } : reply(b.id, "0x");
      }),
      url: BASE_URL,
    });
    assert.equal(await code(() => rpc.chainId()), "requires_key");
    assert.equal(rpc.requiresKey, true);
    assert.equal(sent, 1);
    assert.equal(await code(() => rpc.chainId()), "requires_key");
    assert.equal(await code(() => rpc.allowance(OWNER)), "requires_key");
    assert.equal(await code(() => rpc.getTransactionReceipt(`0x${"11".repeat(32)}`)), "requires_key");
    assert.equal(sent, 1, "nothing was sent after the latch");
  });

  it("latches on a 403 seen by the shared reader as well", async () => {
    let sent = 0;
    const rpc = new BaseRpc({ transport: post(() => { sent += 1; return { status: 403, body: "forbidden" }; }), url: BASE_URL });
    assert.equal(await code(() => rpc.balanceOf(OWNER)), "requires_key");
    assert.equal(await code(() => rpc.chainId()), "requires_key");
    assert.equal(sent, 1);
  });

  it("maps 429, other non-2xx and RPC errors to stable codes without echoing their bodies", async () => {
    const make = (response: RpcHttpResponse) => new BaseRpc({ transport: post(() => response), url: BASE_URL });
    assert.equal(await code(() => make({ status: 429, body: "slow down" }).chainId()), "rate_limited");
    assert.equal(await code(() => make({ status: 500, body: "boom" }).chainId()), "upstream_error");
    assert.equal(await code(() => make({ status: 500, body: "invalid api_key" }).chainId()), "requires_key");
    assert.equal(await code(() => make({ status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "SECRET-LOOKING-TEXT" } } }).chainId()), "upstream_error");
    assert.equal(await code(() => make({ status: 200, body: "<html>" }).chainId()), "invalid_response");
    assert.equal(await code(() => make({ status: 200, body: { jsonrpc: "2.0", id: 99, result: "0x2105" } }).chainId()), "invalid_response");
    try {
      await make({ status: 200, body: { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "SECRET-LOOKING-TEXT" } } }).chainId();
    } catch (error) {
      assert.doesNotMatch((error as Error).message, /SECRET/);
    }
  });

  it("maps a throwing transport to upstream_error or timeout", async () => {
    const make = (error: unknown) => new BaseRpc({ transport: { postJson: async () => { throw error; } }, url: BASE_URL });
    assert.equal(await code(() => make(new Error("down")).chainId()), "upstream_error");
    assert.equal(await code(() => make(Object.assign(new Error("slow"), { name: "TimeoutError" })).chainId()), "timeout");
    assert.equal(await code(() => make(Object.assign(new Error("slow"), { name: "AbortError" })).chainId()), "timeout");
  });

  it("refuses a method outside its allowlist before sending anything", async () => {
    let sent = 0;
    const rpc = new BaseRpc({ transport: post((b) => { sent += 1; return reply(b.id, "0x"); }), url: BASE_URL });
    const raw = rpc as unknown as { rpc(method: string, params: unknown[]): Promise<unknown>; reader: { request(method: string, params: unknown[]): Promise<unknown> } };
    for (const method of ["eth_sendRawTransaction", "eth_sendTransaction", "personal_sign", "eth_accounts", "eth_getBalance"]) {
      assert.equal(await code(() => raw.rpc(method, [])), "unsupported_method", method);
      assert.equal(await code(() => raw.reader.request(method, [])), "unsupported_method", method);
    }
    assert.equal(sent, 0);
  });

  describe("receipts and blocks", () => {
    const hash = `0x${"ab".repeat(32)}`;
    const goodReceipt = {
      transactionHash: hash,
      status: "0x1",
      blockNumber: "0x3e8",
      from: OWNER.toLowerCase(),
      to: BASE_WARP_ROUTER.toLowerCase(),
      logs: [{ address: BASE_WARP_ROUTER.toLowerCase(), topics: [`0x${"11".repeat(32)}`], data: "0x" }],
    };
    const rpcWith = (result: unknown) => new BaseRpc({ transport: post((b) => reply(b.id, result)), url: BASE_URL });

    it("parses a receipt and lower-cases what it keeps", async () => {
      const receipt = await rpcWith({ ...goodReceipt, transactionHash: hash.toUpperCase().replace("0X", "0x") }).getTransactionReceipt(hash);
      assert.equal(receipt?.status, "success");
      assert.equal(receipt?.blockNumber, 1000n);
      assert.equal(receipt?.transactionHash, hash);
      assert.equal(receipt?.logs.length, 1);
      assert.equal((await rpcWith({ ...goodReceipt, status: "0x0" }).getTransactionReceipt(hash))?.status, "reverted");
    });

    it("returns null for a transaction the node does not know", async () => {
      assert.equal(await rpcWith(null).getTransactionReceipt(hash), null);
    });

    it("refuses a receipt for a different transaction and any malformed receipt", async () => {
      const bads: unknown[] = [
        { ...goodReceipt, transactionHash: `0x${"cd".repeat(32)}` },
        { ...goodReceipt, status: "0x2" },
        { ...goodReceipt, status: undefined },
        { ...goodReceipt, blockNumber: "1000" },
        { ...goodReceipt, logs: "none" },
        { ...goodReceipt, logs: [{ address: "0x12", topics: [], data: "0x" }] },
        { ...goodReceipt, logs: [{ address: BASE_WARP_ROUTER, topics: ["0x12"], data: "0x" }] },
        { ...goodReceipt, logs: [{ address: BASE_WARP_ROUTER, topics: [], data: "xyz" }] },
        { ...goodReceipt, logs: new Array(501).fill(goodReceipt.logs[0]) },
        "receipt",
        [],
      ];
      for (const bad of bads) assert.equal(await code(() => rpcWith(bad).getTransactionReceipt(hash)), "invalid_response", JSON.stringify(bad)?.slice(0, 60));
    });

    it("refuses a malformed hash before sending", async () => {
      let sent = 0;
      const rpc = new BaseRpc({ transport: post((b) => { sent += 1; return reply(b.id, null); }), url: BASE_URL });
      for (const bad of ["0x12", "nope", "", `0x${"zz".repeat(32)}`]) assert.equal(await code(() => rpc.getTransactionReceipt(bad)), "invalid_input");
      assert.equal(sent, 0);
    });

    it("reads a block timestamp, null for an unknown block, and refuses malformed blocks", async () => {
      assert.equal(await rpcWith({ timestamp: "0x6553f100" }).getBlockTimestamp(5n), 0x6553f100n);
      assert.equal(await rpcWith(null).getBlockTimestamp(5n), null);
      assert.equal(await code(() => rpcWith({ timestamp: "later" }).getBlockTimestamp(5n)), "invalid_response");
      assert.equal(await code(() => rpcWith("x").getBlockTimestamp(5n)), "invalid_response");
      assert.equal(await code(() => rpcWith({}).getBlockTimestamp(-1n)), "invalid_input");
    });
  });
});

describe("readFundingChain against the pinned fake chain", () => {
  it("reads chain id, pairing with quote, allowance and balance with read-only methods only", async () => {
    const base = new FakeBase();
    base.allowance = 5n;
    base.balance = 9n;
    const readings = await readFundingChain(baseRpcOver(base), OWNER, ACCOUNT, A);
    assert.equal(readings.chainId, 8453);
    assert.equal(readings.allowance, 5n);
    assert.equal(readings.baseBalance, 9n);
    assert.deepEqual(readings.notes, []);
    assert.equal(readings.pairing?.base.token, BASE_USDC);
    assert.equal(readings.pairing?.base.implementation, BASE_ROUTER_IMPLEMENTATION);
    assert.equal(readings.pairing?.xo, null);
    assert.equal(readings.pairing?.baseQuote?.length, 3);
    const allowed = new Set(["eth_chainId", "eth_call", "eth_getStorageAt"]);
    for (const request of base.requests) assert.ok(allowed.has(request.method), request.method);
    assert.ok(base.requests.every((request) => request.url === `${BASE_URL}/`));
  });

  it("asks the router for the allowance of the OWNER to the ROUTER, and the balance of the owner", async () => {
    const base = new FakeBase();
    await readFundingChain(baseRpcOver(base), OWNER, ACCOUNT, A);
    const calls = base.requests.filter((request) => request.method === "eth_call").map((request) => request.params[0] as { to: string; data: Hex });
    const erc20 = calls.filter((call) => call.to.toLowerCase() === BASE_USDC.toLowerCase());
    assert.equal(erc20.length, 2);
    const names = erc20.map((call) => {
      const decoded = decodeFunctionData({ abi: ERC20_READS, data: call.data });
      return { name: decoded.functionName, args: (decoded.args as readonly string[]).map((arg) => String(arg).toLowerCase()) };
    });
    assert.deepEqual(names.find((entry) => entry.name === "allowance")?.args, [OWNER.toLowerCase(), BASE_WARP_ROUTER.toLowerCase()]);
    assert.deepEqual(names.find((entry) => entry.name === "balanceOf")?.args, [OWNER.toLowerCase()]);
  });

  it("turns each failed read into null plus a fixed note, and still reads the rest", async () => {
    const base = new FakeBase();
    base.throwOn.add("eth_chainId");
    const readings = await readFundingChain(baseRpcOver(base), OWNER, ACCOUNT, A);
    assert.equal(readings.chainId, null);
    assert.ok(readings.notes.includes("chainId:upstream_error"));
    assert.equal(readings.allowance, 0n);
    assert.notEqual(readings.pairing, null);
  });

  it("notes a token whose balance read reverts", async () => {
    const base = new FakeBase();
    base.inner.setCall(BASE_USDC, ERC20_ABI, "balanceOf", () => revert());
    const readings = await readFundingChain(baseRpcOver(base), OWNER, ACCOUNT, A);
    assert.equal(readings.baseBalance, null);
    assert.ok(readings.notes.some((note) => note.startsWith("balance:")));
  });

  it("a wrong-chain RPC fails the preflight even if everything else reads back", async () => {
    const input = await baseline("transfer", (base) => {
      base.chainId = 1;
    });
    assert.equal(input.chainId, 1);
    assert.deepEqual(failedIds(input), ["router_pairing"]);
  });

  it("an upgraded router implementation fails the preflight", async () => {
    const input = await baseline("transfer", (base) => {
      base.inner.setStorage(BASE_WARP_ROUTER, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", `0x${"0".repeat(24)}${OTHER.slice(2).toLowerCase()}`);
    });
    assert.deepEqual(failedIds(input), ["router_pairing"]);
    assert.equal(runPreflight(input).failures[0]?.code, "wrong_router");
  });

  it("a quote with a fee fails the preflight", async () => {
    const base = new FakeBase((amount) => [
      { token: "0x0000000000000000000000000000000000000000", amount: 0n },
      { token: BASE_USDC, amount },
      { token: BASE_USDC, amount: 1n },
    ]);
    base.allowance = A;
    const readings = await readFundingChain(baseRpcOver(base), OWNER, ACCOUNT, A);
    const calls = buildFundingCalls({ owner: OWNER, amount: A });
    const report = runPreflight({
      owner: OWNER,
      account: ACCOUNT,
      amount: A,
      step: "transfer",
      calls: [calls.approve, calls.transfer],
      chainId: readings.chainId,
      pairing: readings.pairing,
      allowance: readings.allowance,
      baseBalance: readings.baseBalance,
      deployment: YES_BOTH,
    });
    assert.deepEqual(report.failures.map((check) => [check.id, check.code]), [["quote_zero_fee", "quote_not_zero_fee"]]);
  });

  it("the funding calls survive a deep clone: the checks read data, not object identity", async () => {
    const input = await baseline();
    const clone = structuredClone({ ...input, calls: input.calls.map((call) => ({ ...call })) });
    assert.equal(runPreflight(clone).ok, true);
  });

  it("another owner's world passes too, with its own account", async () => {
    const base = new FakeBase();
    base.allowance = A;
    const readings = await readFundingChain(baseRpcOver(base), OWNER_B, ACCOUNT_B, A);
    const calls = buildFundingCalls({ owner: OWNER_B, amount: A });
    const report = runPreflight({
      owner: OWNER_B,
      account: ACCOUNT_B,
      amount: A,
      step: "transfer",
      calls: [calls.approve, calls.transfer],
      chainId: readings.chainId,
      pairing: readings.pairing,
      allowance: readings.allowance,
      baseBalance: readings.baseBalance,
      deployment: YES_BOTH,
    });
    assert.equal(report.ok, true);
    // The same calls against the wrong owner fail the recipient check.
    assert.equal(runPreflight({ ...{ owner: OWNER, account: ACCOUNT, amount: A, step: "transfer" as const }, calls: [calls.approve, calls.transfer], chainId: 8453, pairing: readings.pairing, allowance: A, baseBalance: A, deployment: YES_BOTH }).ok, false);
  });
});

