// The orderbook registry: which accounts GET /balance-allowance reports as `smart_account`.
//
// What makes an account registered on the real service is NOT ESTABLISHABLE WITHOUT XO (spec 4, N2): the
// first-op class does not predict it (docs/research/19 V2.5). The registry.trigger switch picks a rule:
//
//   never              no account is ever registered by itself (the pessimistic default)
//   on-deploy          the account has been deployed (the EntryPoint emitted AccountDeployed for it)
//   on-enable-trading  deployed AND trading enabled (USDC.e allowance and CTF approval to the exchange)
//   on-l1-create       an L1 credential create happened for it (the write mock calls markL1Created)
//
// The rule is evaluated on every read from the chain and the state, so flipping the switch changes the
// answer at once and the registry never goes stale. state.forceRegistered(address) registers an account
// whatever the switch says (a test that does not care how it got registered).
//
// An owner EOA is never registered: the registry holds accounts, and GET /balance-allowance?address=<owner>
// answers smart_account null even when the owner's account is registered (docs/research/19 V1, AD3).

import { getAddress, type Address } from "viem";

import type { MockEnv } from "./env.js";
import { accountKey } from "./state.js";

export async function isRegistered(env: MockEnv, address: string): Promise<boolean> {
  const key = accountKey(address);
  if (env.state.forcedRegistered.has(key)) return true;
  const trigger = env.switches.get("registry.trigger");
  if (trigger === "never") return false;
  if (trigger === "on-l1-create") return env.state.l1Created.has(key);
  const account = getAddress(`0x${key}`) as Address;
  const deployed = await env.chains.isDeployed(account);
  if (trigger === "on-deploy") return deployed;
  // on-enable-trading
  return deployed && (await env.chains.isTradingEnabled(account));
}
