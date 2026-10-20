import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AccountError } from "../src/xo/account/derive.js";
import {
  AccountStateError,
  deriveAccountState,
  gateConnect,
  gateDeploy,
  gateExistingAccountUserOp,
  gateFunding,
  gateTrading,
  requireGate,
  type AccountStateInput,
  type AccountStateResult,
  type RegistryObservation,
} from "../src/xo/account/state.js";
import { ExplorerLogReader, readDeploymentLogs, type DeploymentLogs } from "../src/xo/chain/reads.js";
import * as C from "../src/xo/chain/constants.js";
import { FakeExplorer, accountDeployedRow, ownerRegisteredRow, type RawRow } from "./fixtures/chain/fakes.js";

const OWNER = C.ANVIL_ACCOUNT_0_OWNER;
const ACCOUNT = C.ANVIL_ACCOUNT_0_ACCOUNT;
const OTHER_OWNER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;

const deployedLog = { account: ACCOUNT, userOpHash: `0x${"11".repeat(32)}`, factory: C.KERNEL_FACTORY, paymaster: C.POLICY_PAYMASTER, blockNumber: 7n, transactionHash: null } as const;
const registeredLog = { account: ACCOUNT, owner: OWNER, blockNumber: 7n, transactionHash: null } as const;

function logs(patch: Partial<DeploymentLogs> = {}): DeploymentLogs {
  return { accountDeployed: [], ownerRegistered: [], complete: true, requests: 2, ...patch };
}

const registryYes: RegistryObservation = { kind: "read", smartAccount: ACCOUNT.slice(2).toLowerCase() };
const registryNo: RegistryObservation = { kind: "read", smartAccount: null };
const registryDown: RegistryObservation = { kind: "unavailable" };

const stateOf = (input: Partial<AccountStateInput> & { logs: DeploymentLogs | null }): AccountStateResult =>
  deriveAccountState({ owner: OWNER, registry: registryDown, ...input });

describe("state machine over deployment logs and the registry", () => {
  it("undeployed: a complete read with no log, and the registry null or unreachable", () => {
    for (const registry of [registryNo, registryDown]) {
      const result = stateOf({ logs: logs(), registry });
      assert.deepEqual([result.state, result.deployed], ["undeployed", "no"]);
      assert.deepEqual(result.evidence, []);
    }
  });

  it("deployed_unregistered: a deployment log and the registry says null", () => {
    for (const patch of [{ accountDeployed: [deployedLog] }, { ownerRegistered: [registeredLog] }, { accountDeployed: [deployedLog], ownerRegistered: [registeredLog] }]) {
      const result = stateOf({ logs: logs(patch), registry: registryNo });
      assert.deepEqual([result.state, result.deployed, result.registered], ["deployed_unregistered", "yes", "no"]);
    }
  });

  it("registered: a deployment log and the registry returns the account", () => {
    const result = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryYes });
    assert.deepEqual([result.state, result.deployed, result.registered], ["registered", "yes", "yes"]);
    assert.deepEqual(result.evidence, ["account_deployed_log"]);
  });

  it("reads the registry value in any form the orderbook or the client might hand back", () => {
    for (const smartAccount of [ACCOUNT.slice(2).toLowerCase(), ACCOUNT.toLowerCase(), ACCOUNT, ACCOUNT.slice(2).toUpperCase()]) {
      const result = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: { kind: "read", smartAccount } });
      assert.equal(result.state, "registered", smartAccount);
    }
  });

  it("unknown: deployed but the registry could not be read", () => {
    const result = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryDown });
    assert.deepEqual([result.state, result.deployed, result.registered], ["unknown", "yes", "unknown"]);
  });

  it("unknown: the logs could not be read, or are incomplete without any positive proof", () => {
    assert.deepEqual([stateOf({ logs: null, registry: registryNo }).state, stateOf({ logs: null, registry: registryNo }).deployed], ["unknown", "unknown"]);
    const incomplete = stateOf({ logs: logs({ complete: false }), registry: registryNo });
    assert.deepEqual([incomplete.state, incomplete.deployed], ["unknown", "unknown"]);
    assert.ok(incomplete.anomalies.includes("logs_incomplete"));
  });

  it("an incomplete read that found a deployment log is still positive proof", () => {
    const result = stateOf({ logs: logs({ complete: false, accountDeployed: [deployedLog] }), registry: registryNo });
    assert.deepEqual([result.state, result.deployed], ["deployed_unregistered", "yes"]);
  });

  it("ignores log rows that belong to another account", () => {
    const stranger = { ...deployedLog, account: "0xEC4b217240f0292c65Bf136b341e400e2D28cA6F" } as const;
    const result = stateOf({ logs: logs({ accountDeployed: [stranger] }), registry: registryNo });
    assert.deepEqual([result.state, result.deployed], ["undeployed", "no"]);
  });
});

describe("contradictions are unknown, never a guess", () => {
  it("owner_mismatch: OwnerRegistered names another owner for this account", () => {
    const result = stateOf({ logs: logs({ accountDeployed: [deployedLog], ownerRegistered: [{ ...registeredLog, owner: OTHER_OWNER }] }), registry: registryYes });
    assert.equal(result.state, "unknown");
    assert.equal(result.deployed, "unknown");
    assert.ok(result.anomalies.includes("owner_mismatch"));
    // Even when a second event registers the right owner.
    const both = stateOf({ logs: logs({ ownerRegistered: [registeredLog, { ...registeredLog, owner: OTHER_OWNER }] }), registry: registryYes });
    assert.equal(both.state, "unknown");
  });

  it("registry_account_mismatch: the registry names a different smart account", () => {
    const result = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: { kind: "read", smartAccount: OTHER_OWNER.slice(2).toLowerCase() } });
    assert.equal(result.state, "unknown");
    assert.ok(result.anomalies.includes("registry_account_mismatch"));
    assert.notEqual(result.registered, "yes");
  });

  it("registry_without_deployment: registered but no deployment proof is not 'undeployed' and not 'registered'", () => {
    const result = stateOf({ logs: logs(), registry: registryYes });
    assert.equal(result.state, "unknown");
    assert.equal(result.deployed, "unknown");
    assert.ok(result.anomalies.includes("registry_without_deployment"));
  });

  it("foreign_code: other code at the account address is not a deployed Kernel", () => {
    const result = stateOf({ logs: logs(), code: "other_code", registry: registryNo });
    assert.equal(result.state, "unknown");
    assert.ok(result.anomalies.includes("foreign_code"));
    const withLogs = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), code: "other_code", registry: registryNo });
    assert.equal(withLogs.state, "unknown");
  });
});

describe("RPC code observations", () => {
  it("the Kernel proxy runtime is positive proof even when the explorer logs are unreadable", () => {
    const result = stateOf({ logs: null, code: "kernel_proxy", registry: registryYes });
    assert.deepEqual([result.state, result.deployed, result.evidence], ["registered", "yes", ["rpc_code"]]);
  });

  it("a code reading of none leaves a complete negative alone, and a lagging RPC does not undo a deployment log", () => {
    const none = stateOf({ logs: logs(), code: "none", registry: registryNo });
    assert.deepEqual([none.state, none.deployed], ["undeployed", "no"]);
    const unread = stateOf({ logs: logs(), code: null, registry: registryNo });
    assert.equal(unread.state, "undeployed");
    const noneButLogs = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), code: "none", registry: registryNo });
    assert.equal(noneButLogs.deployed, "yes", "a lagging RPC does not undo a deployment log");
  });
});

describe("the explorer smart-contracts endpoint is never evidence of absence", () => {
  const runtime = C.KERNEL_PROXY_RUNTIME_CODE;

  it("a 404 or an empty answer is ignored: with logs the account is still deployed", () => {
    for (const lookup of [{ status: 404 }, { status: 200, deployedBytecode: null }, { status: 200, deployedBytecode: "0x" }, { status: 500 }]) {
      const result = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), explorerLookup: lookup, registry: registryYes });
      assert.equal(result.state, "registered", JSON.stringify(lookup));
      assert.equal(result.ignoredNegativeLookup, true);
    }
  });

  it("a 404 alone never produces 'undeployed': unreadable logs stay unknown", () => {
    const result = stateOf({ logs: null, explorerLookup: { status: 404 }, registry: registryNo });
    assert.equal(result.state, "unknown");
    assert.equal(result.deployed, "unknown");
  });

  it("a 200 with the exact Kernel proxy bytecode is positive proof", () => {
    const result = stateOf({ logs: null, explorerLookup: { status: 200, deployedBytecode: runtime }, registry: registryNo });
    assert.deepEqual([result.state, result.deployed, result.evidence], ["deployed_unregistered", "yes", ["explorer_code"]]);
    assert.equal(result.ignoredNegativeLookup, false);
  });

  it("a 200 with some other bytecode is ignored", () => {
    const result = stateOf({ logs: null, explorerLookup: { status: 200, deployedBytecode: "0x6080" }, registry: registryNo });
    assert.equal(result.deployed, "unknown");
  });
});

describe("gates need positive proof of deployment", () => {
  const cases: Array<[string, AccountStateResult]> = [
    ["undeployed", stateOf({ logs: logs(), registry: registryNo })],
    ["unknown (logs unreadable)", stateOf({ logs: null, registry: registryNo })],
    ["unknown (incomplete logs)", stateOf({ logs: logs({ complete: false }), registry: registryNo })],
    ["unknown (contradiction)", stateOf({ logs: logs(), registry: registryYes })],
  ];

  for (const [label, result] of cases) {
    it(`refuses funding, connecting and existing-account operations when ${label}`, () => {
      for (const gate of [gateFunding, gateConnect, gateExistingAccountUserOp, gateTrading]) {
        const decision = gate(result);
        assert.equal(decision.allowed, false);
        assert.notEqual(decision.code, "ok");
        assert.throws(() => requireGate(decision), (error: unknown) => error instanceof AccountStateError && error.code === decision.code);
      }
    });
  }

  it("never relaxes after two (or two hundred) consecutive negatives", () => {
    const negatives = Array.from({ length: 200 }, () => stateOf({ logs: logs(), registry: registryNo }));
    for (const result of negatives) assert.equal(gateFunding(result).allowed, false);
    // and a stream of unreadable answers is no better
    const unreadable = Array.from({ length: 200 }, () => stateOf({ logs: null, registry: registryDown }));
    for (const result of unreadable) assert.equal(gateFunding(result).allowed, false);
  });

  it("allows funding, connecting and existing-account operations once deployment is proven, registered or not", () => {
    const unregistered = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryNo });
    const registered = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryYes });
    const registryUnread = stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryDown });
    for (const result of [unregistered, registered, registryUnread]) {
      assert.equal(gateFunding(result).allowed, true, result.state);
      assert.equal(gateConnect(result).allowed, true);
      assert.equal(gateExistingAccountUserOp(result).allowed, true);
    }
  });

  it("allows trading only for a registered account", () => {
    assert.equal(gateTrading(stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryYes })).allowed, true);
    const unregistered = gateTrading(stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryNo }));
    assert.deepEqual([unregistered.allowed, unregistered.code], [false, "not_registered"]);
    const unread = gateTrading(stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryDown }));
    assert.deepEqual([unread.allowed, unread.code], [false, "state_unknown"]);
  });

  it("allows the deploying operation only on a complete negative, and refuses an unknown state", () => {
    assert.equal(gateDeploy(stateOf({ logs: logs(), registry: registryNo })).allowed, true);
    assert.deepEqual(
      [gateDeploy(stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryNo })).code, gateDeploy(stateOf({ logs: null, registry: registryNo })).code],
      ["already_deployed", "state_unknown"],
    );
  });

  it("uses fixed messages that never contain upstream or market text", () => {
    for (const [, result] of cases) for (const gate of [gateFunding, gateTrading, gateDeploy]) assert.ok(gate(result).message.length < 160);
  });

  it("requireGate returns normally for an allowed decision", () => {
    const ok = gateFunding(stateOf({ logs: logs({ accountDeployed: [deployedLog] }), registry: registryYes }));
    assert.doesNotThrow(() => requireGate(ok));
  });
});

describe("supplied accounts and invalid owners", () => {
  it("compares a supplied account with the derivation", () => {
    assert.equal(stateOf({ logs: logs(), suppliedAccount: ACCOUNT.toLowerCase(), registry: registryNo }).account, ACCOUNT);
    for (const supplied of [OTHER_OWNER, C.CTF_EXCHANGE, "0x1234"]) {
      assert.throws(() => stateOf({ logs: logs(), suppliedAccount: supplied, registry: registryNo }), AccountError, supplied);
    }
  });

  it("refuses the owner passed as the account, which is how funds get stranded", () => {
    assert.throws(
      () => stateOf({ logs: logs(), suppliedAccount: OWNER, registry: registryNo }),
      (error: unknown) => error instanceof AccountError && error.code === "account_is_owner",
    );
  });

  it("refuses a malformed or protocol-contract owner", () => {
    for (const owner of ["nonsense", "0x", C.ENTRY_POINT_V07, "0x0000000000000000000000000000000000000000"]) {
      assert.throws(() => deriveAccountState({ owner, logs: logs(), registry: registryNo }), AccountError, owner);
    }
  });
});

describe("end to end over the log reader", () => {
  const readerFor = (rows: RawRow[]): ExplorerLogReader => new ExplorerLogReader({ transport: new FakeExplorer({ rows }) });

  it("undeployed account: nothing on chain", async () => {
    const result = deriveAccountState({ owner: OWNER, logs: await readDeploymentLogs(readerFor([]), ACCOUNT), registry: registryNo });
    assert.equal(result.state, "undeployed");
  });

  it("deployed account whose explorer lookup 404s: the logs still prove it", async () => {
    const reader = readerFor([accountDeployedRow(ACCOUNT, { block: 5 }), ownerRegisteredRow(ACCOUNT, OWNER, { block: 5 })]);
    const result = deriveAccountState({ owner: OWNER, logs: await readDeploymentLogs(reader, ACCOUNT), explorerLookup: { status: 404 }, registry: registryYes });
    assert.equal(result.state, "registered");
    assert.deepEqual(result.evidence, ["account_deployed_log", "owner_registered_log"]);
    assert.equal(gateTrading(result).allowed, true);
  });

  it("an OwnerRegistered log for a different owner at this account is refused end to end", async () => {
    const reader = readerFor([ownerRegisteredRow(ACCOUNT, OTHER_OWNER, { block: 5 })]);
    const result = deriveAccountState({ owner: OWNER, logs: await readDeploymentLogs(reader, ACCOUNT), registry: registryYes });
    assert.equal(result.state, "unknown");
    assert.equal(gateFunding(result).allowed, false);
  });

  it("only OwnerRegistered (a deployment outside the EntryPoint) still proves deployment", async () => {
    const reader = readerFor([ownerRegisteredRow(ACCOUNT, OWNER, { block: 5 })]);
    const result = deriveAccountState({ owner: OWNER, logs: await readDeploymentLogs(reader, ACCOUNT), registry: registryNo });
    assert.deepEqual([result.state, result.evidence], ["deployed_unregistered", ["owner_registered_log"]]);
  });
});
