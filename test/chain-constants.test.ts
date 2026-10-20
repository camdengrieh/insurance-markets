import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { encodeAbiParameters, getAddress, isAddress, keccak256, stringToBytes } from "viem";

import { AccountError, parseAddress } from "../src/xo/account/derive.js";
import * as C from "../src/xo/chain/constants.js";
import * as G from "../src/guardrails/constants.js";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

// Walks an exported value and returns every 20-byte hex string with the path it was found at.
function collectAddresses(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === "string") {
    if (ADDRESS_RE.test(value)) out.set(path, value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectAddresses(entry, `${path}[${index}]`, out));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) collectAddresses(entry, `${path}.${key}`, out);
  }
}

function exportedAddresses(): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, value] of Object.entries(C)) collectAddresses(value, name, out);
  return out;
}

describe("strict EIP-55 over every pinned address", () => {
  it("finds the whole pinned set, including addresses nested in arrays and objects", () => {
    const found = exportedAddresses();
    assert.ok(found.size >= 35, `expected at least 35 addresses, found ${found.size}`);
    for (const name of [
      "ENTRY_POINT_V07",
      "KERNEL_FACTORY",
      "KERNEL_IMPLEMENTATION",
      "ECDSA_VALIDATOR",
      "POLICY_PAYMASTER",
      "CTF_EXCHANGE",
      "EXCHANGE_IMPLEMENTATION",
      "USDC_E_ADDRESS",
      "CONDITIONAL_TOKENS",
      "MARKET_MANAGER",
      "MANAGER_IMPLEMENTATION",
      "ACCESS_MANAGER",
      "CONFIG_MANAGER",
      "BASE_WARP_ROUTER",
      "BASE_ROUTER_IMPLEMENTATION",
      "BASE_USDC",
      "XO_WARP_ROUTE",
      "XO_ROUTE_IMPLEMENTATION",
      "HYPERLANE_MAILBOX",
      "HYPERLANE_HOOK",
      "HYPERLANE_ISM",
      "HYPERLANE_ISM_VALIDATORS[0]",
      "HYPERLANE_ISM_VALIDATORS[1]",
      "HYPERLANE_ISM_VALIDATORS[2]",
    ]) {
      assert.ok(found.has(name), `${name} is missing from the walk`);
    }
  });

  it("writes every address in exact EIP-55 form (a lower-case or mis-cased pin is a failure)", () => {
    for (const [path, address] of exportedAddresses()) {
      assert.equal(getAddress(address), address, `${path} is not in exact EIP-55 form`);
      assert.ok(isAddress(address, { strict: true }), `${path} fails the strict check`);
    }
  });

  it("lists every contract in PINNED_CONTRACTS with a distinct name and a checksummed address", () => {
    const names = new Set<string>();
    for (const contract of C.PINNED_CONTRACTS) {
      assert.ok(!names.has(contract.name), `duplicate ${contract.name}`);
      names.add(contract.name);
      assert.equal(getAddress(contract.address), contract.address, contract.name);
    }
    assert.ok(C.PINNED_CONTRACTS.some((c) => c.chain === "base") && C.PINNED_CONTRACTS.some((c) => c.chain === "xo"));
  });

  it("keeps the exact section 2.1 values for the headline addresses", () => {
    assert.equal(C.ENTRY_POINT_V07, "0x0000000071727De22E5E9d8BAf0edAc6f37da032");
    assert.equal(C.KERNEL_FACTORY, "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419");
    assert.equal(C.KERNEL_IMPLEMENTATION, "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D");
    assert.equal(C.ECDSA_VALIDATOR, "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57");
    assert.equal(C.POLICY_PAYMASTER, "0x2353B23D8F329fD3cEC0d21652F14208248A439d");
    assert.equal(C.CTF_EXCHANGE, "0x4bC5E872256D12E6017dfe466E04c867DC761B77");
    assert.equal(C.XO_WARP_ROUTE, "0x9090463546d725F6ecE5D1A4B27bEB929D5d1983");
    assert.equal(C.BASE_WARP_ROUTER, "0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F");
    assert.equal(C.HYPERLANE_MAILBOX, "0xfDd96df1b2D4354DbB1070815819DB47469Ca470");
  });
});

// Spec section 2.3: strings found in the notes and fixtures that fail EIP-55.
const BAD_CHECKSUMS: ReadonlyArray<{ readonly label: string; readonly bad: string; readonly good: string; readonly pinned: string | null }> = [
  { label: "factory in note 19", bad: "0xaac5D4240AF87249B3f71bC8E4A2cae074A3E419", good: "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419", pinned: "KERNEL_FACTORY" },
  { label: "XO route in notes 03 and 21", bad: "0x9090463546d725F6eCE5D1A4B27beB929D5D1983", good: "0x9090463546d725F6ecE5D1A4B27bEB929D5d1983", pinned: "XO_WARP_ROUTE" },
  { label: "paymaster in the template builder", bad: "0x2353b23d8F329fD3cec0D21652f14208248A439D", good: "0x2353B23D8F329fD3cEC0d21652F14208248A439d", pinned: "POLICY_PAYMASTER" },
  { label: "Mailbox in note 20", bad: "0xfDd96df1b2D4354dbB1070815819DB47469Ca470", good: "0xfDd96df1b2D4354DbB1070815819DB47469Ca470", pinned: "HYPERLANE_MAILBOX" },
  { label: "validator 3 in note 20", bad: "0xA6c998F0DB2b56d7a63FAF30a9B677C8B9b6faab", good: "0xA6c998F0DB2b56D7a63FAF30a9B677C8B9b6faab", pinned: "HYPERLANE_ISM_VALIDATORS[2]" },
  { label: "Base Safe in note 20 (not pinned)", bad: "0x9dC83f5947E5F86D9726D6484195F9DC4FdfC5D6", good: "0x9dC83f5947E5F86d9726D6484195F9DC4FdfC5D6", pinned: null },
  { label: "old paymaster owner in note 21 (not pinned)", bad: "0x30e817b9703c77A3baF82a4d8B3D231F3Ed8Cf93", good: "0x30e817b9703c77A3bAF82a4d8B3D231F3Ed8Cf93", pinned: null },
];

describe("the seven bad-checksum strings of spec section 2.3", () => {
  const pinnedAddresses = exportedAddresses();

  for (const row of BAD_CHECKSUMS) {
    it(`rejects ${row.label}`, () => {
      // Same 40 hex digits, wrong letter case: a strict parser must refuse it.
      assert.equal(row.bad.toLowerCase(), row.good.toLowerCase(), "the fixture pair must differ in case only");
      assert.notEqual(row.bad, row.good);
      assert.equal(isAddress(row.bad, { strict: true }), false);
      // viem's getAddress normalises instead of validating, so compare rather than expect a throw.
      assert.notEqual(getAddress(row.bad), row.bad);
      assert.throws(
        () => parseAddress(row.bad),
        (error: unknown) => error instanceof AccountError && error.code === "invalid_address",
      );
      // The corrected form and the all-lower-case form are accepted.
      assert.equal(parseAddress(row.good), row.good);
      assert.equal(parseAddress(row.good.toLowerCase()), row.good);
    });

    it(`never pins ${row.label} in its bad form`, () => {
      for (const [path, address] of pinnedAddresses) assert.notEqual(address, row.bad, path);
      if (row.pinned !== null) assert.equal(pinnedAddresses.get(row.pinned), row.good);
    });
  }

  it("is not satisfied by a case-insensitive comparison: each bad string changes at least one letter's case", () => {
    for (const row of BAD_CHECKSUMS) {
      const differing = [...row.bad].filter((ch, i) => ch !== row.good[i]);
      assert.ok(differing.length > 0 && differing.length <= 8, row.label);
    }
  });
});

// Every file under src/ and relay/ other than the chain constants.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

const ADDRESS_LITERAL = /(?<![0-9a-fA-Fx])0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;

function literalsIn(file: string): string[] {
  return [...readFileSync(file, "utf8").matchAll(ADDRESS_LITERAL)].map((m) => m[0]).filter((a) => a !== ZERO);
}

describe("no address literal outside src/xo/chain/constants.ts", () => {
  const constantsFile = `${REPO}src/xo/chain/constants.ts`;
  const pinnedLower = new Set([...exportedAddresses().values()].map((a) => a.toLowerCase()));
  // Files written before the chain constants existed. Each may keep literals ONLY when they equal a
  // pinned constant, so they cannot drift; new code must import from constants.ts instead.
  // test/guardrails-constants.test.ts reads src/guardrails/constants.ts as text and pins its three
  // literals, so that file keeps them (it re-exports everything else).
  const legacy = new Set([`${REPO}src/guardrails/constants.ts`, `${REPO}src/xo/signing/constants.ts`, `${REPO}src/paybox.ts`]);

  it("scans a non-trivial number of files", () => {
    const files = [...sourceFiles(`${REPO}src`), ...sourceFiles(`${REPO}relay`)];
    assert.ok(files.length > 30, `only ${files.length} files scanned`);
    assert.ok(files.includes(constantsFile));
  });

  it("finds no address literal in any other file, apart from legacy literals that equal a pinned constant", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(`${REPO}src`), ...sourceFiles(`${REPO}relay`)]) {
      if (file === constantsFile) continue;
      for (const literal of literalsIn(file)) {
        if (legacy.has(file) && pinnedLower.has(literal.toLowerCase())) continue;
        offenders.push(`${file.slice(REPO.length)}: ${literal}`);
      }
    }
    assert.deepEqual(offenders, [], "import the address from src/xo/chain/constants.ts instead of writing it out");
  });

  it("proves the scanner would catch a stray literal", () => {
    const sample = 'const x = "0x4bC5E872256D12E6017dfe466E04c867DC761B77" as const; const y = 0x' + "ab".repeat(32) + ";";
    const hits = [...sample.matchAll(ADDRESS_LITERAL)].map((m) => m[0]);
    assert.deepEqual(hits, ["0x4bC5E872256D12E6017dfe466E04c867DC761B77"]);
  });

  it("keeps the three guardrails literals identical to the chain constants", () => {
    assert.equal(G.CTF_EXCHANGE, C.CTF_EXCHANGE);
    assert.equal(G.USDC_E_ADDRESS, C.USDC_E_ADDRESS);
    assert.equal(G.CONDITIONAL_TOKENS, C.CONDITIONAL_TOKENS);
    const text = readFileSync(`${REPO}src/guardrails/constants.ts`, "utf8");
    const pinned = [...text.matchAll(/"(0x[0-9a-fA-F]{40})" as const/g)].map((m) => m[1]);
    assert.deepEqual(pinned, [C.CTF_EXCHANGE, C.USDC_E_ADDRESS, C.CONDITIONAL_TOKENS]);
  });

  it("never lets the zero address count as a pinned contract", () => {
    for (const contract of C.PINNED_CONTRACTS) assert.notEqual(contract.address, ZERO);
  });
});

describe("src/guardrails/constants.ts re-exports the chain constants", () => {
  it("exports every name it has always exported, with the chain value", () => {
    const names = [
      "XO_CHAIN_ID",
      "ORDER_DOMAIN_NAME",
      "ORDER_DOMAIN_VERSION",
      "KERNEL_DOMAIN_NAME",
      "KERNEL_DOMAIN_VERSION",
      "CLOB_AUTH_DOMAIN_NAME",
      "CLOB_AUTH_DOMAIN_VERSION",
      "SIGNATURE_TYPE_XO_SMART_ACCOUNT",
      "USDC_E_DECIMALS",
      "USDC_E_ATOMIC_PER_UNIT",
      "SHARE_DECIMALS",
      "SHARE_MICRO_PER_SHARE",
      "PRICE_TICK_DENOMINATOR",
      "MIN_PRICE_TICK",
      "MAX_PRICE_TICK",
      "WIRE_SIGNATURE_BYTES",
      "CREATION_FEE_ATOMIC",
      "CTF_EXCHANGE",
      "USDC_E_ADDRESS",
      "CONDITIONAL_TOKENS",
      "ORDER_DOMAIN",
      "KERNEL_DOMAIN_BASE",
      "CLOB_AUTH_DOMAIN",
    ] as const;
    for (const name of names) {
      assert.deepEqual((G as Record<string, unknown>)[name], (C as Record<string, unknown>)[name], name);
    }
  });

  it("has dropped the 'deliberately NOT pinned' header", () => {
    const text = readFileSync(`${REPO}src/guardrails/constants.ts`, "utf8");
    assert.ok(!/deliberately NOT pinned/i.test(text));
    assert.match(text, /src\/xo\/chain\/constants\.ts/);
  });
});

describe("derived and structural constants", () => {
  it("recomputes the Kernel wrapper typehash", () => {
    assert.equal(keccak256(stringToBytes(C.KERNEL_WRAPPER_TYPE_STRING)), C.KERNEL_WRAPPER_TYPEHASH);
  });

  it("recomputes the EIP-1967 implementation slot as keccak256('eip1967.proxy.implementation') - 1", () => {
    const slot = BigInt(keccak256(stringToBytes("eip1967.proxy.implementation"))) - 1n;
    assert.equal(`0x${slot.toString(16).padStart(64, "0")}`, C.EIP1967_IMPLEMENTATION_SLOT);
  });

  it("reproduces the order, Kernel and ClobAuth domain separators of the verified notes", () => {
    const domainTypehash = keccak256(stringToBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"));
    const separator = (name: string, version: string, chainId: number, contract: `0x${string}`) =>
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
          [domainTypehash, keccak256(stringToBytes(name)), keccak256(stringToBytes(version)), BigInt(chainId), contract],
        ),
      );
    assert.equal(
      separator(C.ORDER_DOMAIN.name, C.ORDER_DOMAIN.version, C.ORDER_DOMAIN.chainId, C.ORDER_DOMAIN.verifyingContract),
      "0x377cb2cbb6c9bcc7400f72694c6fc43a929de4faf9ee0ce851a8c2cdd02260ae",
    );
    assert.equal(
      separator(C.KERNEL_DOMAIN_BASE.name, C.KERNEL_DOMAIN_BASE.version, C.KERNEL_DOMAIN_BASE.chainId, "0xcafe000000000000000000000000000000000a11"),
      "0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818",
    );
  });

  it("encodes the nonce layout, execution modes and sizes the notes describe", () => {
    assert.equal(C.FIRST_OP_NONCE.length, 66);
    assert.equal(C.FIRST_OP_NONCE, `0x0000${C.ECDSA_VALIDATOR.slice(2).toLowerCase()}${"00".repeat(10)}`);
    assert.equal(C.EXEC_MODE_SINGLE.length, 66);
    assert.equal(C.EXEC_MODE_BATCH.length, 66);
    assert.equal(C.EXEC_MODE_BATCH.slice(0, 4), "0x01");
    assert.equal(C.EXEC_MODE_BATCH.slice(4), "00".repeat(31));
    assert.equal(C.NONCE_KEY_SHIFT, 64n);
    assert.equal(C.KERNEL_INIT_DATA_BYTES, 292);
    assert.equal(C.USEROP_INIT_CODE_BYTES, 20 + 4 + 32 + 32 + 32 + 320);
    assert.equal(C.PAYMASTER_AND_DATA_BYTES, 20 + 16 + 16);
    assert.equal(C.USEROP_SIGNATURE_BYTES, 65);
    assert.equal(C.WIRE_SIGNATURE_BYTES, 1 + 20 + 65);
    assert.equal(C.WIRE_SIGNATURE_FALLBACK_BYTES, 1 + 65);
    assert.equal(C.APPROVE_CALLDATA_BYTES, 4 + 32 + 32);
    assert.equal(C.TRANSFER_REMOTE_CALLDATA_BYTES, 4 + 32 + 32 + 32);
  });

  it("keeps the numbers of spec section 2.1", () => {
    assert.equal(C.XO_CHAIN_ID, 3223);
    assert.equal(C.XO_CHAIN_ID_HEX, "0xc97");
    assert.equal(C.BASE_CHAIN_ID, 8453);
    assert.equal(C.BASE_CHAIN_ID_HEX, "0x2105");
    assert.equal(C.HYPERLANE_DOMAIN_XO, C.XO_CHAIN_ID);
    assert.equal(C.HYPERLANE_DOMAIN_BASE, C.BASE_CHAIN_ID);
    assert.equal(C.MAX_FEE_RATE_BPS, 800);
    assert.equal(C.FEE_RATE_CEILING_BPS, 1000);
    assert.equal(C.CREATION_FEE_ATOMIC, 1_000_000n);
    assert.equal(C.ORDER_NONCE, 0n);
    assert.equal(C.SIGNATURE_TYPE_XO_SMART_ACCOUNT, 3);
    assert.equal(C.PRICE_TICK_DENOMINATOR, 1000);
    assert.equal(C.MIN_PRICE_TICK, 1);
    assert.equal(C.MAX_PRICE_TICK, 999);
    assert.equal(C.SHARE_STEP_MICRO, 1000n);
    assert.equal(C.ROUTE_DESTINATION_GAS, 68_000n);
    assert.equal(C.FUNDING_VALUE_WEI, "0");
    assert.equal(C.HYPERLANE_ISM_THRESHOLD, 2);
    assert.equal(C.HYPERLANE_ISM_VALIDATORS.length, 3);
    assert.equal(C.DELIVERY_POLL_TIMEOUT_S, 600);
    assert.deepEqual({ ...C.DELIVERY_TIMING_S.baseToXo }, { median: 14, p90: 24, max: 27 });
    assert.deepEqual({ ...C.DELIVERY_TIMING_S.xoToBase }, { median: 12, p90: 14, max: 18 });
    assert.equal(C.OPERATING_LIMITS.l1TimestampWindowS, 120);
    assert.equal(C.OPERATING_LIMITS.l2TimestampWindowS, 30);
    assert.equal(C.OPERATING_LIMITS.explorerLogRowCap, 1000);
    assert.equal(C.OPERATING_LIMITS.requestsPerSecondPerHost, 4);
    assert.equal(C.CLOB_AUTH_MESSAGE, "This message attests that I control the given wallet");
    assert.equal(C.WIRE_SIGNATURE_PREFIX, "0x01");
    assert.equal(C.WIRE_SIGNATURE_FALLBACK_PREFIX, "0x00");
  });

  it("keeps the gas defaults copied from real operations", () => {
    assert.deepEqual({ ...C.GAS_DEFAULTS.deployAndEnableTrading }, {
      verificationGasLimit: 297_342n,
      callGasLimit: 74_916n,
      preVerificationGas: 56_214n,
      paymasterVerificationGasLimit: 40_262n,
      paymasterPostOpGasLimit: 26_478n,
    });
    assert.equal(C.GAS_DEFAULTS.redeemOne.verificationGasLimit, 87_869n);
    assert.equal(C.GAS_DEFAULTS.redeemOne.callGasLimit, 126_186n);
    assert.equal(C.GAS_DEFAULTS.redeemOne.preVerificationGas, 51_195n);
    assert.equal(C.GAS_DEFAULTS.createMarket.verificationGasLimit, 105_442n);
    assert.equal(C.GAS_DEFAULTS.createMarket.callGasLimit, 1_100_000n);
    assert.equal(C.GAS_DEFAULTS.createMarket.preVerificationGas, 55_814n);
    assert.equal(C.DEFAULT_MAX_FEE_PER_GAS, 0n);
    assert.equal(C.DEFAULT_MAX_PRIORITY_FEE_PER_GAS, 0n);
  });

  it("keeps enum values in the order the notes list them", () => {
    assert.deepEqual({ ...C.REVIEW_DECISION }, { APPROVE: 0, REJECT: 1, UPDATE_REQUIRED: 2 });
    assert.deepEqual(Object.keys(C.MARKET_STATUS), ["PENDING", "CANCELLED", "ACTIVE", "PAUSED", "RESOLVED", "CLOSED", "UPDATE_REQUIRED", "VOIDED", "VOIDED_CLOSED"]);
    assert.deepEqual(Object.values(C.MARKET_STATUS), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(C.MARKET_TYPE_CLOB_CONVICTION, 4);
  });

  it("is immutable at runtime", () => {
    assert.throws(() => {
      (C.ORDER_DOMAIN as { chainId: number }).chainId = 1;
    });
    assert.throws(() => {
      (C.GAS_DEFAULTS.redeemOne as { callGasLimit: bigint }).callGasLimit = 1n;
    });
    assert.throws(() => {
      (C.PINNED_CONTRACTS as unknown as unknown[]).push({});
    });
    assert.throws(() => {
      (C.HYPERLANE_ISM_VALIDATORS as unknown as string[])[0] = "0x";
    });
    assert.throws(() => {
      (C.OPERATING_LIMITS as { takerDelayMs: number }).takerDelayMs = 0;
    });
  });

  it("holds selectors as 4 bytes and topics as 32 bytes of lower-case hex", () => {
    for (const [name, value] of Object.entries(C)) {
      if (typeof value !== "string") continue;
      if (/_SELECTOR(_NEVER_CALL)?$/.test(name)) assert.match(value, /^0x[0-9a-f]{8}$/, name);
      if (/_TOPIC$/.test(name)) assert.match(value, /^0x[0-9a-f]{64}$/, name);
    }
  });

  it("marks the operator and role-gated selectors NEVER_CALL in their names", () => {
    const never = Object.keys(C).filter((name) => name.endsWith("_NEVER_CALL")).sort();
    assert.deepEqual(never, ["CREATE_CONVICTION_MARKET_FOR_SELECTOR_NEVER_CALL", "REVIEW_MARKET_SELECTOR_NEVER_CALL", "UPDATE_METADATA_SELECTOR_NEVER_CALL"]);
  });
});

describe("module hygiene of the chain-account files", () => {
  const files = [
    "src/xo/chain/constants.ts",
    "src/xo/chain/abi.ts",
    "src/xo/chain/reads.ts",
    "src/xo/chain/tripwires.ts",
    "src/xo/account/derive.ts",
    "src/xo/account/state.ts",
  ];

  it("imports no node: module and touches no global I/O, clock, randomness or environment", () => {
    for (const file of files) {
      const text = readFileSync(`${REPO}${file}`, "utf8").replace(/\/\/.*$/gm, "");
      assert.ok(!/from\s+["']node:/.test(text), `${file} imports a node: module`);
      assert.ok(!/\bprocess\./.test(text), `${file} reads process`);
      assert.ok(!/\bDate\.now\b|\bnew Date\b|\bMath\.random\b|\bperformance\.now\b/.test(text), `${file} reads a clock or randomness`);
      assert.ok(!/\bfetch\(|\bsetTimeout\b|\bsetInterval\b/.test(text), `${file} performs I/O or timers directly`);
    }
  });
});
