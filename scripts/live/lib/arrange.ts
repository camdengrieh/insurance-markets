import { encodeAbiParameters, encodeFunctionData, getAbiItem, keccak256, pad, toEventSelector, toHex, type Hex } from "viem";

import { CONDITIONAL_TOKENS_ABI } from "../../../src/xo/chain/abi.js";
import { CONDITIONAL_TOKENS, CTF_EXCHANGE, GAS_DEFAULTS, USDC_E_ADDRESS } from "../../../src/xo/chain/constants.js";
import { createMarketCalls } from "../../../src/xo/userop/calls.js";
import { approveCall, buildOp, enableTradingCalls } from "../../../test/anvil/scenarios.js";
import { CTF_STUB_ABI, USDCE_STUB_ABI } from "../../../test/anvil/stubs.js";
import { connectCredentials } from "./flows.js";
import { SAMPLE_METADATA_URI } from "./sample-metadata.js";
import { REHEARSAL_BASE_USDC_MICRO, REHEARSAL_FUNDED_MICRO, REHEARSAL_SEED_FUNDED_MICRO } from "./world.js";
import { Refusal, type ArrangeStep, type RunContext } from "./types.js";

// The mock target stands in for what the earlier tests, and the people running them, would have left
// behind. A rehearsal of T3b starts with a deployed account, an orderbook balance and stored credentials
// the way a real T3b starts after T1, T2 and T3a. Nothing here is part of the plan: it is printed as
// nothing, counted against no write limit, and never runs on the live target (where the script checks the
// same facts instead and stops if they are not there).
//
// What it does NOT do is force a result that belongs to a mock switch: whether the orderbook registers an
// account is registry.trigger's business, so an account is registered here only if the profile says so.

const CONDITION_RESOLUTION_TOPIC = toEventSelector(getAbiItem({ abi: CONDITIONAL_TOKENS_ABI, name: "ConditionResolution" }));

export async function arrange(ctx: RunContext, steps: readonly ArrangeStep[]): Promise<void> {
  const mock = ctx.world.mock;
  if (mock === undefined || ctx.world.ownerKey === undefined) return;
  const chain = mock.chains.xo;
  if (chain === undefined) throw new Refusal("no_chain", "The rehearsal needs the XO chain.");
  const wanted = new Set(steps);
  const owner = ctx.world.ownerKey;
  const account = ctx.account;

  // A second run on the same chain (the same owner, a data directory kept from the first) finds the account there already.
  const existing = await chain.publicClient.getCode({ address: account });
  const alreadyDeployed = existing !== undefined && existing !== "0x";
  if ((wanted.has("deployed") || wanted.has("trading_enabled")) && !alreadyDeployed) {
    // This lands the operation straight on the chain, not through the bundler, so the paymaster has to
    // sponsor whatever paymaster.state says (the pessimistic profile pauses it the next time it is read).
    await mock.paymaster.reconcile("sponsor");
    const first = await buildOp({
      chain,
      owner,
      init: true,
      sponsored: true,
      calls: wanted.has("trading_enabled") ? enableTradingCalls() : [approveCall(CTF_EXCHANGE, 0n)],
    });
    const landed = await chain.handleOps([first.op]);
    if (!landed.ok) throw new Refusal("arrange_failed", "The rehearsal could not deploy the owner's account on the local chain.");
  }

  if (wanted.has("funded") || wanted.has("funded_seed")) {
    // A seed needs $10.80 on the orderbook; the other tests need what T3a would have left ($3).
    const micro = wanted.has("funded_seed") ? REHEARSAL_SEED_FUNDED_MICRO : REHEARSAL_FUNDED_MICRO;
    await chain.sendFrom(chain.bundler.address, USDC_E_ADDRESS, encodeFunctionData({ abi: USDCE_STUB_ABI, functionName: "mint", args: [account, micro] }));
    mock.state.setBalance(account, { balanceMicro: micro, allowanceMicro: micro, cashBalanceMicro: micro });
  }

  if (wanted.has("base_funded")) mock.hyperlane.setBaseBalance(ctx.owner, REHEARSAL_BASE_USDC_MICRO);

  if (wanted.has("market") || wanted.has("fee_market")) {
    // The fee market charges a flat 4% taker fee in the mock, which is what T3c's reconciliation needs to see.
    const market = mock.state.markets.find((entry) => entry.seed === (wanted.has("fee_market") ? "clob-active-b" : "clob-active-a"));
    if (market === undefined) throw new Refusal("no_market", "The mock has no active market to trade on.");
    ctx.world.state.tokenId = market.yesTokenId;
    ctx.world.state.noTokenId = market.noTokenId;
    ctx.world.state.marketSeed = market.seed;
    ctx.world.state.marketConditionId = market.conditionId as Hex;
  }

  if (wanted.has("resolved_condition")) {
    const conditionId = keccak256(toHex("live-kit T5 rehearsal condition")) as Hex;
    await chain.sendFrom(chain.bundler.address, CONDITIONAL_TOKENS, encodeFunctionData({ abi: CTF_STUB_ABI, functionName: "stubSetPayoutDenominator", args: [conditionId, 1n] }));
    mock.explorer.syntheticLogs.push({
      address: CONDITIONAL_TOKENS,
      topics: [CONDITION_RESOLUTION_TOPIC, conditionId, pad("0x01", { size: 32 }), pad("0x02", { size: 32 })],
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256[]" }], [2n, [1n, 0n]]),
      blockNumber: 1,
      logIndex: 0,
      transactionHash: `0x${"11".repeat(32)}`,
    });
    ctx.world.state.conditionId = conditionId;
  }

  // A market this account created and the oracle approved (what T6 leaves behind), made through the mock's own
  // creation flow: the real create calls land on the local chain, the oracle approves 60 seconds later.
  if (wanted.has("created_market")) {
    mock.creation.policy = { decision: "approve", reviewDelayS: 60 };
    const now = await chain.blockTimestamp();
    const created = await buildOp({
      chain,
      owner,
      sponsored: true,
      sequence: 1n,
      gas: GAS_DEFAULTS.createMarket,
      calls: createMarketCalls({ startsAt: now, expiresAt: now + 3 * 86_400, metadataUri: SAMPLE_METADATA_URI }).map((call) => ({ target: call.to, data: call.data, value: call.value })),
    });
    const landed = await chain.handleOps([created.op]);
    if (!landed.ok) throw new Refusal("arrange_failed", "The rehearsal could not create a market on the local chain.");
    await mock.creation.sync();
    await mock.advance(120);
    await mock.creation.sync();
    const market = [...mock.creation.markets.values()].find((entry) => entry.creator.toLowerCase() === account.toLowerCase());
    const catalogue = market === undefined ? undefined : mock.state.markets.find((entry) => entry.conditionId === market.conditionId);
    if (market === undefined || catalogue === undefined || market.status !== "ACTIVE") throw new Refusal("arrange_failed", "The rehearsal's market did not become active.");
    ctx.world.state.tokenId = catalogue.yesTokenId;
    ctx.world.state.noTokenId = catalogue.noTokenId;
    ctx.world.state.marketConditionId = market.conditionId;
  }

  // Last: it uses the relay, the signer and the state above.
  if (wanted.has("credentials")) {
    try {
      await connectCredentials(ctx);
    } catch (error) {
      if (error instanceof Refusal) throw new Refusal("arrange_failed", `The rehearsal could not store credentials first (${error.message}). Try --mock-profile optimistic, or run T2 on its own.`);
      throw error;
    }
  }
}
