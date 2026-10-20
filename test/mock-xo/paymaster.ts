// The PolicyPaymaster's state, driven by the paymaster.state switch. The REAL contract runs on the local chain
// (test/anvil/chain.ts installs it with the allowlist replayed from docs/research/21), so a refused or paused
// sponsorship is the contract's own answer, not a mock rule. This class makes the chain agree with the switch:
//
//   sponsor          unpaused, the replayed allowlist (approve is allowed globally, CTF setApprovalForAll too)
//   paused           the owner calls pause(): every sponsored operation fails validation (AA33)
//   policy-narrowed  unpaused, but the owner removes the global approve and CTF setApprovalForAll: Enable
//                    Trading and market creation (which both approve) are refused, redeems still pass
//
// The owner is impersonated on the local chain (anvil), exactly as the harness does to install the allowlist;
// no key exists. reconcile() reads the chain first and does nothing when it already agrees, so it is cheap to
// call before every sponsored UserOp and before every read of the paymaster (paused(), checkPolicy), which is
// where the relay would notice the change. It runs one at a time.
//
// Basis: the paymaster is owner-editable and changed owner five times (docs/research/21 V2.2), so "paused" and
// "narrowed" are things XO can do any day (M for how XO would do them).

import { encodeFunctionData, getAddress, type Address, type Hex } from "viem";

import { POLICY_PAYMASTER_ABI } from "../../src/xo/chain/abi.js";
import { APPROVE_SELECTOR, CONDITIONAL_TOKENS, POLICY_PAYMASTER, USDC_E_ADDRESS } from "../../src/xo/chain/constants.js";
import { PAYMASTER_ADMIN_ABI } from "../anvil/chain.js";
import { asPaymasterOwner } from "../anvil/scenarios.js";
import type { MockEnv } from "./env.js";
import type { MockSwitchValue } from "./switches.js";

export type PaymasterState = MockSwitchValue<"paymaster.state">;

const CTF_SET_APPROVAL_FOR_ALL_SELECTOR: Hex = "0xa22cb465";
// checkPolicy ignores the account for the allowlist; any address will do.
const PROBE_ACCOUNT: Address = getAddress(`0x${"00".repeat(19)}01`);

export class PaymasterControl {
  private tail: Promise<void> = Promise.resolve();
  private reconciles = 0;

  constructor(private readonly env: () => MockEnv) {}

  /** How many times the chain was actually changed (for tests). */
  get changes(): number {
    return this.reconciles;
  }

  desired(): PaymasterState {
    return this.env().switches.get("paymaster.state");
  }

  // Makes the chain match the switch (or `override`, for a test fixture that must sponsor whatever the switch
  // says). Safe to call concurrently.
  reconcile(override?: PaymasterState): Promise<void> {
    const run = this.tail.then(() => this.apply(override ?? this.desired()));
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async apply(want: PaymasterState): Promise<void> {
    const chain = this.env().chains.xo;
    if (chain === undefined || !chain.paymaster) return;
    const read = async (functionName: "paused"): Promise<boolean> =>
      (await chain.publicClient.readContract({ address: POLICY_PAYMASTER, abi: PAYMASTER_ADMIN_ABI, functionName })) as boolean;
    const approveAllowed = async (): Promise<boolean> => {
      const data = encodeFunctionData({ abi: POLICY_PAYMASTER_ABI, functionName: "checkPolicy", args: [PROBE_ACCOUNT, USDC_E_ADDRESS, APPROVE_SELECTOR] });
      const answer = await chain.rpc<Hex>("eth_call", [{ to: POLICY_PAYMASTER, data }, "latest"]);
      return BigInt(answer.slice(0, 66)) === 1n;
    };
    const wantPaused = want === "paused";
    const wantNarrow = want === "policy-narrowed";
    const paused = await read("paused");
    const allowed = await approveAllowed();
    const needPause = paused !== wantPaused;
    const needPolicy = allowed === wantNarrow;
    if (!needPause && !needPolicy) return;
    this.reconciles += 1;
    await asPaymasterOwner(chain, async (send) => {
      if (needPolicy) {
        await send("setGloballyAllowedSelector", [APPROVE_SELECTOR, !wantNarrow]);
        await send("setAllowedSelectors", [CONDITIONAL_TOKENS, [CTF_SET_APPROVAL_FOR_ALL_SELECTOR], !wantNarrow]);
      }
      if (needPause) await send(wantPaused ? "pause" : "unpause", []);
    });
  }
}

