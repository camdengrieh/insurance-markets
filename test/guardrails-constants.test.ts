import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { encodeAbiParameters, getAddress, keccak256, stringToBytes } from "viem";

import {
  CLOB_AUTH_DOMAIN,
  CONDITIONAL_TOKENS,
  CREATION_FEE_ATOMIC,
  CTF_EXCHANGE,
  KERNEL_DOMAIN_BASE,
  MAX_PRICE_TICK,
  MIN_PRICE_TICK,
  ORDER_DOMAIN,
  PRICE_TICK_DENOMINATOR,
  SHARE_DECIMALS,
  SHARE_MICRO_PER_SHARE,
  SIGNATURE_TYPE_XO_SMART_ACCOUNT,
  USDC_E_ADDRESS,
  USDC_E_ATOMIC_PER_UNIT,
  USDC_E_DECIMALS,
  WIRE_SIGNATURE_BYTES,
  XO_CHAIN_ID,
} from "../src/guardrails/constants.js";

// Golden values from docs/research/07-xo-bot-reference.md section 4 and 01 section (c): derived
// with Foundry `cast` from the documented formulas, independent of any typed-data library.
const GOLDEN = {
  domainTypehash: "0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f",
  orderDomainSeparator: "0x377cb2cbb6c9bcc7400f72694c6fc43a929de4faf9ee0ce851a8c2cdd02260ae",
  kernelDomainSeparator: "0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818",
  clobAuthDomainTypehash: "0xc2f8787176b8ac6bf7215b4adcc1e069bf4ab82d9ab1df05a57a91d425935b6e",
  clobAuthDomainSeparator: "0x44e30cd10e3df85b868a7b3850e9e35945475365c26a07680811e3ff1e85197b",
} as const;
// The placeholder smart account the XO docs and OpenAPI examples use. It is not a valid EIP-55
// checksum in mixed case, so it is written in lowercase here.
const PLACEHOLDER_ACCOUNT = "0xcafe000000000000000000000000000000000a11";

const hash = (text: string) => keccak256(stringToBytes(text));

function domainSeparatorWithContract(domain: {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: `0x${string}`;
}): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        hash("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        hash(domain.name),
        hash(domain.version),
        BigInt(domain.chainId),
        domain.verifyingContract,
      ],
    ),
  );
}

describe("pinned XO constants", () => {
  it("pins the verified scalar values", () => {
    assert.equal(XO_CHAIN_ID, 3223);
    assert.equal(ORDER_DOMAIN.name, "XO Market CLOB");
    assert.equal(ORDER_DOMAIN.version, "1");
    assert.equal(KERNEL_DOMAIN_BASE.name, "Kernel");
    assert.equal(KERNEL_DOMAIN_BASE.version, "0.3.1");
    assert.equal(CLOB_AUTH_DOMAIN.name, "ClobAuthDomain");
    assert.equal(CLOB_AUTH_DOMAIN.version, "1");
    assert.equal(SIGNATURE_TYPE_XO_SMART_ACCOUNT, 3);
    assert.equal(WIRE_SIGNATURE_BYTES, 1 + 20 + 65);
    assert.equal(CREATION_FEE_ATOMIC, 1_000_000n);
  });

  it("keeps units internally consistent: 6-decimal collateral, 6-decimal micro-shares, 0.001 ticks", () => {
    assert.equal(USDC_E_DECIMALS, 6);
    assert.equal(SHARE_DECIMALS, 6);
    assert.equal(USDC_E_ATOMIC_PER_UNIT, 10n ** BigInt(USDC_E_DECIMALS));
    assert.equal(SHARE_MICRO_PER_SHARE, 10n ** BigInt(SHARE_DECIMALS));
    assert.equal(PRICE_TICK_DENOMINATOR, 1000);
    assert.equal(MIN_PRICE_TICK, 1);
    assert.equal(MAX_PRICE_TICK, PRICE_TICK_DENOMINATOR - 1);
  });

  it("uses the same chain id in every domain", () => {
    assert.equal(ORDER_DOMAIN.chainId, XO_CHAIN_ID);
    assert.equal(KERNEL_DOMAIN_BASE.chainId, XO_CHAIN_ID);
    assert.equal(CLOB_AUTH_DOMAIN.chainId, XO_CHAIN_ID);
  });

  it("stores checksummed addresses", () => {
    for (const address of [CTF_EXCHANGE, USDC_E_ADDRESS, CONDITIONAL_TOKENS]) {
      assert.equal(getAddress(address), address);
    }
  });

  it("reproduces the independently derived domain separators from the verified notes", () => {
    assert.equal(
      hash("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
      GOLDEN.domainTypehash,
    );
    assert.equal(domainSeparatorWithContract(ORDER_DOMAIN), GOLDEN.orderDomainSeparator);
    assert.equal(
      domainSeparatorWithContract({ ...KERNEL_DOMAIN_BASE, verifyingContract: PLACEHOLDER_ACCOUNT }),
      GOLDEN.kernelDomainSeparator,
    );

    // ClobAuth has no verifyingContract, so its domain type has three fields.
    assert.equal(hash("EIP712Domain(string name,string version,uint256 chainId)"), GOLDEN.clobAuthDomainTypehash);
    const clobAuth = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }],
        [
          GOLDEN.clobAuthDomainTypehash,
          hash(CLOB_AUTH_DOMAIN.name),
          hash(CLOB_AUTH_DOMAIN.version),
          BigInt(CLOB_AUTH_DOMAIN.chainId),
        ],
      ),
    );
    assert.equal(clobAuth, GOLDEN.clobAuthDomainSeparator);
  });

  it("fails the golden check if a pinned value is wrong", () => {
    // Proves the check above has teeth: changing any domain field changes the separator.
    const tampered = { ...ORDER_DOMAIN, name: "XO Market CLOB " };
    assert.notEqual(domainSeparatorWithContract(tampered), GOLDEN.orderDomainSeparator);
    const wrongChain = { ...ORDER_DOMAIN, chainId: 1 };
    assert.notEqual(domainSeparatorWithContract(wrongChain), GOLDEN.orderDomainSeparator);
  });

  it("is immutable at runtime", () => {
    assert.throws(() => {
      (ORDER_DOMAIN as { chainId: number }).chainId = 1;
    });
    assert.throws(() => {
      (KERNEL_DOMAIN_BASE as { version: string }).version = "9";
    });
  });

  it("pins only the three addresses that are verified against more than docs text", async () => {
    // Guards against someone adding an unverified address (validator, entry point, paymaster,
    // router, ...) without the notes to back it. Update the list and the file header together.
    const source = await readFile(fileURLToPath(new URL("../src/guardrails/constants.ts", import.meta.url)), "utf8");
    const pinned = [...source.matchAll(/"(0x[0-9a-fA-F]{40})" as const/g)].map((match) => match[1]);
    assert.deepEqual(pinned, [CTF_EXCHANGE, USDC_E_ADDRESS, CONDITIONAL_TOKENS]);
  });
});
