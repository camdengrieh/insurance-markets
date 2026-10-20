import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { after, before, describe, it } from "node:test";

import { concat, decodeAbiParameters, decodeFunctionData, getAddress, keccak256, pad, slice, toHex, zeroAddress } from "viem";

import {
  AccountError,
  accountCreate2Salt,
  buildInitCode,
  buildInitData,
  deriveAccount,
  describeAccount,
  isKernelProxyRuntime,
  parseAddress,
  parseOwner,
  proxyInitCode,
  proxyInitCodeHash,
  requireDerivedAccount,
  validatorOwnerStorageKey,
} from "../src/xo/account/derive.js";
import { KERNEL_ABI, KERNEL_FACTORY_ABI } from "../src/xo/chain/abi.js";
import * as C from "../src/xo/chain/constants.js";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/chain/${name}`, import.meta.url), "utf8")) as T;
}

interface Pair {
  owner: string;
  account: string;
  index?: number;
}
const pairs = fixture<{ initCodeHash: string; anvil: Pair[]; observed: Pair[] }>("owner-account-pairs.json");
const invariants = fixture<{ canonicalRows: number; invariants: Record<string, string | number | boolean> }>("deployment-invariants.json");

// The recomputation a reader can check by hand: CREATE2 = keccak256(0xff ++ factory ++ salt ++ initCodeHash)[12:].
function create2ByHand(factory: string, salt: string, codeHash: string): string {
  const hash = keccak256(concat(["0xff", factory as `0x${string}`, salt as `0x${string}`, codeHash as `0x${string}`]));
  return getAddress(slice(hash, 12));
}

describe("derivation golden vectors", () => {
  it("maps public Anvil account 0 to the account of spec section 2.1", () => {
    assert.equal(C.ANVIL_ACCOUNT_0_OWNER, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    assert.equal(C.ANVIL_ACCOUNT_0_ACCOUNT, "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d");
    assert.equal(deriveAccount(C.ANVIL_ACCOUNT_0_OWNER), C.ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(deriveAccount(C.ANVIL_ACCOUNT_0_OWNER.toLowerCase()), C.ANVIL_ACCOUNT_0_ACCOUNT);
  });

  it("re-derives all ten Anvil pairs, computed independently with Foundry cast", () => {
    assert.equal(pairs.anvil.length, 10);
    assert.equal(pairs.anvil[0]?.owner, C.ANVIL_ACCOUNT_0_OWNER);
    for (const pair of pairs.anvil) {
      assert.equal(deriveAccount(pair.owner), pair.account, `anvil ${String(pair.index)}`);
      assert.equal(requireDerivedAccount(pair.owner, pair.account), pair.account);
    }
  });

  it("re-derives every observed on-chain owner to account pair", () => {
    assert.ok(pairs.observed.length >= 10);
    for (const pair of pairs.observed) {
      assert.equal(deriveAccount(pair.owner), pair.account, `observed pair for owner ${pair.owner.slice(0, 8)}..`);
      assert.notEqual(pair.owner, pair.account);
    }
    assert.equal(new Set(pairs.observed.map((p) => p.account)).size, pairs.observed.length, "accounts are distinct");
  });

  it("agrees with a hand-written CREATE2 over the pinned init-code hash", () => {
    for (const pair of [...pairs.anvil, ...pairs.observed]) {
      assert.equal(create2ByHand(C.KERNEL_FACTORY, accountCreate2Salt(pair.owner), C.ERC1967_INIT_CODE_HASH), pair.account);
    }
  });

  it("recomputes the pinned ERC-1967 init-code hash from the implementation address", () => {
    assert.equal(proxyInitCodeHash(C.KERNEL_IMPLEMENTATION), C.ERC1967_INIT_CODE_HASH);
    assert.equal(pairs.initCodeHash, C.ERC1967_INIT_CODE_HASH, "the cast-computed hash in the fixture agrees");
    assert.equal((proxyInitCode().length - 2) / 2, 95);
    assert.equal((C.KERNEL_PROXY_RUNTIME_CODE.length - 2) / 2, 61);
    // A different implementation gives a different hash, hence a different account for every owner.
    assert.notEqual(proxyInitCodeHash("0x0000000000000000000000000000000000000001"), C.ERC1967_INIT_CODE_HASH);
  });

  it("builds the runtime code from head, slot and tail exactly as the notes list them", () => {
    assert.equal(
      C.KERNEL_PROXY_RUNTIME_CODE,
      `0x363d3d373d3d363d7f${C.EIP1967_IMPLEMENTATION_SLOT.slice(2)}545af43d6000803e6038573d6000fd5b3d6000f3`,
    );
    assert.ok(isKernelProxyRuntime(C.KERNEL_PROXY_RUNTIME_CODE));
    assert.ok(isKernelProxyRuntime(C.KERNEL_PROXY_RUNTIME_CODE.toUpperCase().replace("0X", "0x")));
    assert.ok(!isKernelProxyRuntime("0x"));
    assert.ok(!isKernelProxyRuntime(`${C.KERNEL_PROXY_RUNTIME_CODE}00`));
    assert.ok(!isKernelProxyRuntime(C.KERNEL_PROXY_RUNTIME_CODE.replace("3d3d", "3d3e")));
  });
});

describe("init data and init code", () => {
  const owner = C.ANVIL_ACCOUNT_0_OWNER;

  it("is initialize(0x01 || validator, 0, owner, 0x, []) in 292 bytes", () => {
    const data = buildInitData(owner);
    assert.equal((data.length - 2) / 2, C.KERNEL_INIT_DATA_BYTES);
    assert.equal(data.slice(0, 10), C.KERNEL_INITIALIZE_SELECTOR);
    const decoded = decodeFunctionData({ abi: KERNEL_ABI, data });
    assert.equal(decoded.functionName, "initialize");
    const [rootValidator, hook, validatorData, hookData, initConfig] = decoded.args as readonly [string, string, string, string, readonly string[]];
    assert.equal(rootValidator, `0x01${C.ECDSA_VALIDATOR.slice(2).toLowerCase()}`);
    assert.equal(hook, zeroAddress);
    assert.equal(validatorData.toLowerCase(), owner.toLowerCase());
    assert.equal((validatorData.length - 2) / 2, 20);
    assert.equal(hookData, "0x");
    assert.deepEqual(initConfig, []);
  });

  it("is factory || createAccount(initData, 0) in 440 bytes", () => {
    const code = buildInitCode(owner);
    assert.equal((code.length - 2) / 2, C.USEROP_INIT_CODE_BYTES);
    assert.equal(getAddress(slice(code, 0, 20)), C.KERNEL_FACTORY);
    assert.equal(slice(code, 20, 24), C.FACTORY_CREATE_ACCOUNT_SELECTOR);
    const decoded = decodeFunctionData({ abi: KERNEL_FACTORY_ABI, data: slice(code, 20) });
    assert.equal(decoded.functionName, "createAccount");
    assert.deepEqual(decoded.args, [buildInitData(owner), C.ACCOUNT_SALT]);
    // The create2 salt hashes the initData followed by the zero salt, as KernelFactory does.
    assert.equal(accountCreate2Salt(owner), keccak256(concat([buildInitData(owner), C.ACCOUNT_SALT])));
  });

  it("reproduces the structural invariants of the 34 decoded on-chain deployments", () => {
    const inv = invariants.invariants;
    assert.equal(invariants.canonicalRows, 34);
    for (const sample of [owner, ...pairs.anvil.map((p) => p.owner), ...pairs.observed.map((p) => p.owner)]) {
      const code = buildInitCode(sample);
      assert.equal(getAddress(slice(code, 0, 20)), inv["factory"]);
      assert.equal(slice(code, 20, 24), inv["factory_selector"]);
      const [data, salt] = decodeAbiParameters([{ type: "bytes" }, { type: "bytes32" }], `0x${code.slice(2 + 2 * 24)}` as `0x${string}`);
      assert.equal(salt, inv["salt"]);
      assert.equal(slice(data, 0, 4), inv["init_selector"]);
      assert.equal((data.length - 2) / 2, inv["init_data_len"]);
      const decoded = decodeFunctionData({ abi: KERNEL_ABI, data });
      const args = decoded.args as readonly [string, string, string, string, readonly string[]];
      assert.equal(args[0].toLowerCase(), inv["root_validator"]);
      assert.equal(args[1], inv["hook"]);
      assert.equal((args[2].length - 2) / 2, inv["validator_data_len"]);
      assert.equal((args[3].length - 2) / 2, inv["hook_data_len"]);
      assert.equal(args[4].length, inv["init_config_len"]);
      assert.notEqual(deriveAccount(sample).toLowerCase(), sample.toLowerCase());
    }
  });

  it("describeAccount returns one consistent bundle", () => {
    const parts = describeAccount(owner.toLowerCase());
    assert.equal(parts.owner, owner);
    assert.equal(parts.account, C.ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(parts.initData, buildInitData(owner));
    assert.equal(parts.initCode, buildInitCode(owner));
    assert.equal(parts.create2Salt, accountCreate2Salt(owner));
  });
});

describe("owner and address validation", () => {
  const code = (fn: () => unknown): string | null => {
    try {
      fn();
      return null;
    } catch (error) {
      return error instanceof AccountError ? error.code : `other:${String(error)}`;
    }
  };

  it("accepts lower-case and exact checksums and returns the checksummed form", () => {
    assert.equal(parseAddress(C.CTF_EXCHANGE.toLowerCase()), C.CTF_EXCHANGE);
    assert.equal(parseAddress(C.CTF_EXCHANGE), C.CTF_EXCHANGE);
    assert.equal(parseOwner(C.ANVIL_ACCOUNT_0_OWNER.toLowerCase()), C.ANVIL_ACCOUNT_0_OWNER);
  });

  it("refuses everything else as invalid_address", () => {
    const bad: unknown[] = [
      "",
      "0x",
      "not an address",
      "0x1234",
      `${C.ANVIL_ACCOUNT_0_OWNER}00`,
      C.ANVIL_ACCOUNT_0_OWNER.slice(0, -1),
      C.ANVIL_ACCOUNT_0_OWNER.replace("0x", "0X"),
      `0x${C.ANVIL_ACCOUNT_0_OWNER.slice(2).toUpperCase()}`,
      C.ANVIL_ACCOUNT_0_OWNER.replace("f39F", "F39f"),
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      undefined,
      null,
      12345,
      {},
      [C.ANVIL_ACCOUNT_0_OWNER],
    ];
    for (const value of bad) assert.equal(code(() => parseAddress(value)), "invalid_address", JSON.stringify(value));
    assert.equal(code(() => deriveAccount("0xzzzz")), "invalid_address");
    assert.equal(code(() => buildInitData("hello")), "invalid_address");
    assert.equal(code(() => buildInitCode(undefined as unknown as string)), "invalid_address");
  });

  it("refuses the zero address as an owner", () => {
    assert.equal(code(() => parseOwner(zeroAddress)), "zero_owner");
    assert.equal(code(() => deriveAccount(zeroAddress)), "zero_owner");
  });

  it("refuses every pinned protocol contract as an owner", () => {
    for (const contract of C.PINNED_CONTRACTS) {
      assert.equal(code(() => parseOwner(contract.address)), "protocol_contract_owner", contract.name);
      assert.equal(code(() => deriveAccount(contract.address.toLowerCase())), "protocol_contract_owner", contract.name);
    }
  });

  it("never accepts an account address from outside without comparing it to the derivation", () => {
    const owner = C.ANVIL_ACCOUNT_0_OWNER;
    assert.equal(requireDerivedAccount(owner), C.ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(requireDerivedAccount(owner, null), C.ANVIL_ACCOUNT_0_ACCOUNT);
    assert.equal(requireDerivedAccount(owner, C.ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase()), C.ANVIL_ACCOUNT_0_ACCOUNT);
    // Another owner's account, the exchange, a one-character difference: all refused.
    const other = pairs.anvil[1];
    assert.ok(other !== undefined);
    assert.equal(code(() => requireDerivedAccount(owner, other.account)), "account_mismatch");
    assert.equal(code(() => requireDerivedAccount(owner, C.CTF_EXCHANGE)), "account_mismatch");
    const flipped = `${C.ANVIL_ACCOUNT_0_ACCOUNT.slice(0, -1)}${C.ANVIL_ACCOUNT_0_ACCOUNT.endsWith("d") ? "e" : "d"}`.toLowerCase();
    assert.equal(code(() => requireDerivedAccount(owner, flipped)), "account_mismatch");
    // The owner passed off as the smart account (funds sent there are stranded on XO's chain).
    assert.equal(code(() => requireDerivedAccount(owner, owner)), "account_is_owner");
    assert.equal(code(() => requireDerivedAccount(owner, owner.toLowerCase())), "account_is_owner");
    // A malformed supplied account is invalid_address, not a mismatch.
    assert.equal(code(() => requireDerivedAccount(owner, "0x1234")), "invalid_address");
  });
});

describe("validator owner storage key", () => {
  it("is keccak256(abi.encode(kernel, 0)): the kernel address as one 32-byte word, then slot 0", () => {
    const word = `0x${"00".repeat(12)}${C.ANVIL_ACCOUNT_0_ACCOUNT.slice(2).toLowerCase()}${"00".repeat(32)}` as `0x${string}`;
    assert.equal(C.ECDSA_VALIDATOR_OWNER_MAPPING_SLOT, 0n);
    assert.equal(validatorOwnerStorageKey(C.ANVIL_ACCOUNT_0_ACCOUNT), keccak256(word));
    assert.equal(validatorOwnerStorageKey(C.ANVIL_ACCOUNT_0_ACCOUNT.toLowerCase()), keccak256(word));
    assert.notEqual(validatorOwnerStorageKey(pairs.anvil[1]?.account ?? ""), keccak256(word));
    assert.throws(() => validatorOwnerStorageKey("0x1234"), AccountError);
  });
});

describe("derivation properties (fixed seed)", () => {
  // A deterministic stream of owners: keccak256 of "<seed>:<i>", last 20 bytes. No Math.random.
  const ownerFor = (seed: string, i: number): `0x${string}` => getAddress(slice(keccak256(toHex(`${seed}:${i}`)), 12));

  it("is deterministic, injective over a sample, and never returns the owner", () => {
    const seen = new Map<string, string>();
    for (let i = 0; i < 200; i += 1) {
      const owner = ownerFor("chain-account-seed-1", i);
      const account = deriveAccount(owner);
      assert.equal(deriveAccount(owner), account);
      assert.equal(deriveAccount(owner.toLowerCase()), account);
      assert.notEqual(account.toLowerCase(), owner.toLowerCase());
      assert.equal(getAddress(account), account);
      assert.equal(create2ByHand(C.KERNEL_FACTORY, accountCreate2Salt(owner), C.ERC1967_INIT_CODE_HASH), account);
      assert.ok(!seen.has(account), "two owners share an account");
      seen.set(account, owner);
    }
  });

  it("changes the account when any single byte of the owner changes", () => {
    const base = ownerFor("chain-account-seed-2", 0);
    const baseAccount = deriveAccount(base);
    for (let byte = 0; byte < 20; byte += 1) {
      const hex = base.slice(2).toLowerCase();
      const flipped = `0x${hex.slice(0, byte * 2)}${((Number.parseInt(hex.slice(byte * 2, byte * 2 + 2), 16) ^ 0x01) & 0xff).toString(16).padStart(2, "0")}${hex.slice(byte * 2 + 2)}`;
      if (flipped === zeroAddress) continue;
      assert.notEqual(deriveAccount(flipped), baseAccount, `byte ${byte}`);
    }
  });

  it("puts the owner into the init data only as the 20-byte validatorData", () => {
    for (let i = 0; i < 20; i += 1) {
      const owner = ownerFor("chain-account-seed-3", i);
      const data = buildInitData(owner);
      assert.equal(data.toLowerCase().split(owner.slice(2).toLowerCase()).length - 1, 1, "the owner appears exactly once");
      assert.equal(pad(owner.toLowerCase() as `0x${string}`, { size: 32 }).length, 66);
    }
  });
});

// ---- the proxy creation code on a real EVM (anvil) --------------------------------------------

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

describe("proxy creation code on a local anvil (chain id 3223)", () => {
  let child: ChildProcess | null = null;
  let url = "";
  let skipReason: string | null = null;

  const rpc = async (method: string, params: unknown[] = []): Promise<unknown> => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await response.json()) as { result?: unknown; error?: { message: string } };
    if (body.error !== undefined) throw new Error(body.error.message);
    return body.result;
  };

  // Anvil mines on send, but the receipt can lag the reply by a moment.
  const receiptFor = async (hash: string): Promise<unknown> => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const receipt = await rpc("eth_getTransactionReceipt", [hash]);
      if (receipt !== null) return receipt;
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("no receipt");
  };

  before(async () => {
    const port = await freePort();
    url = `http://127.0.0.1:${port}`;
    try {
      const process = spawn("anvil", ["--host", "127.0.0.1", "--port", String(port), "--chain-id", String(C.XO_CHAIN_ID), "--silent"], { stdio: "ignore" });
      child = process;
      const failed = new Promise<string>((resolve) => {
        process.once("error", () => resolve("anvil is not installed or could not start"));
        process.once("exit", () => resolve("anvil exited early"));
      });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const outcome = await Promise.race([failed, new Promise<null>((resolve) => setTimeout(() => resolve(null), 100))]);
        if (outcome !== null) {
          skipReason = outcome;
          return;
        }
        try {
          if ((await rpc("eth_chainId")) === C.XO_CHAIN_ID_HEX) return;
        } catch {
          // not listening yet
        }
      }
      skipReason = "anvil did not answer in time";
    } catch (error) {
      skipReason = `anvil could not be started: ${String(error)}`;
    }
  });

  after(async () => {
    if (child !== null && child.exitCode === null) {
      const exited = new Promise<void>((resolve) => child?.once("exit", () => resolve()));
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("deploys the 61-byte runtime and stores the implementation in the EIP-1967 slot", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const [from] = (await rpc("eth_accounts")) as string[];
    assert.ok(from !== undefined);
    const hash = (await rpc("eth_sendTransaction", [{ from, data: proxyInitCode(C.KERNEL_IMPLEMENTATION), gas: "0x100000" }])) as string;
    const receipt = (await receiptFor(hash)) as { status: string; contractAddress: string };
    assert.equal(receipt.status, "0x1");
    const code = (await rpc("eth_getCode", [receipt.contractAddress, "latest"])) as string;
    assert.equal(code, C.KERNEL_PROXY_RUNTIME_CODE);
    assert.ok(isKernelProxyRuntime(code));
    const slot = (await rpc("eth_getStorageAt", [receipt.contractAddress, C.EIP1967_IMPLEMENTATION_SLOT, "latest"])) as string;
    assert.equal(slot, pad(C.KERNEL_IMPLEMENTATION.toLowerCase() as `0x${string}`, { size: 32 }));
  });

  it("deploys a different runtime when the creation code is altered (the equality check has teeth)", async (t) => {
    if (skipReason !== null) return t.skip(skipReason);
    const [from] = (await rpc("eth_accounts")) as string[];
    const altered = proxyInitCode(C.KERNEL_IMPLEMENTATION).replace("363d3d37", "363d3d38") as `0x${string}`;
    const hash = (await rpc("eth_sendTransaction", [{ from, data: altered, gas: "0x100000" }])) as string;
    const receipt = (await receiptFor(hash)) as { contractAddress: string | null; status: string };
    const code = receipt.contractAddress === null ? "0x" : ((await rpc("eth_getCode", [receipt.contractAddress, "latest"])) as string);
    assert.ok(!isKernelProxyRuntime(code));
  });
});
