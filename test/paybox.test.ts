import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";

import {
  atomicAmount,
  evmOutputSchema,
  proposeEvm,
  proposeSolana,
  proposeX402,
  solanaOutputSchema,
  x402OutputSchema,
} from "../src/paybox.js";

// src/paybox.ts is the PayBox starter's transaction-proposal builder, vendored byte for byte and
// pinned by hash in scaffold.test.ts. The hash only says the file is unchanged; this file says it
// behaves: every guard in it has a case that proves it blocks the bad input (TM-09). The v0.1
// bundle does not import it, but it is the only guard on the v0.2 transaction path.

const KEY = "io.paybox/transactionProposal";
// A whole second, so the expiry boundaries below are exact.
const T0 = Date.parse("2030-01-01T00:00:00.000Z");
const iso = (offsetSeconds: number): string => new Date(T0 + offsetSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const TO = "0x80c12230ce677e6f304027a14780Edd2A829ab0c";
const BASE_USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const SOLANA_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const proposal = (result: { structuredContent: Record<string, unknown> }): Record<string, unknown> =>
  result.structuredContent[KEY] as Record<string, unknown>;

beforeEach(() => {
  mock.timers.enable({ apis: ["Date"], now: T0 });
});
afterEach(() => {
  mock.timers.reset();
});

describe("proposal expiry window", () => {
  it("defaults to four minutes ahead, as a whole second", () => {
    const result = proposeEvm({ chain: "eip155:8453", to: TO });
    assert.equal(proposal(result)["expiresAt"], iso(240));
  });

  it("accepts an expiry up to five minutes ahead and refuses one a second later", () => {
    assert.doesNotThrow(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: iso(300) }));
    assert.throws(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: iso(301) }), /within five minutes/);
    assert.throws(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: iso(3600) }), /within five minutes/);
  });

  it("refuses an expiry that is now or already past, and accepts one second ahead", () => {
    assert.throws(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: iso(0) }), /within five minutes/);
    assert.throws(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: iso(-60) }), /within five minutes/);
    assert.doesNotThrow(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: iso(1) }));
  });

  it("refuses anything that is not a canonical whole-second UTC timestamp", () => {
    const base = iso(120);
    for (const bad of [base.replace("Z", ".000Z"), base.replace("Z", "+00:00"), base.replace("T", " "), base.toLowerCase(), "soon", "", `${base} `]) {
      assert.throws(() => proposeEvm({ chain: "eip155:8453", to: TO, expiresAt: bad }), /whole-second UTC timestamp/, JSON.stringify(bad));
    }
  });

  it("applies to every proposal kind", () => {
    const tx = Buffer.alloc(100, 1).toString("base64");
    assert.throws(() => proposeSolana({ transactionBase64: tx, expiresAt: iso(301) }), /within five minutes/);
    assert.throws(() => proposeX402({ chain: "eip155:8453", url: "https://example.com/pay", maxAmount: "1", expiresAt: iso(301) }), /within five minutes/);
  });
});

describe("proposeEvm", () => {
  it("builds a proposal that its own output schema accepts", () => {
    const result = proposeEvm({ chain: "eip155:8453", to: TO, value: "1000", data: "0xa9059cbb" });
    assert.deepEqual(proposal(result), {
      version: "1",
      expiresAt: iso(240),
      kind: "evm",
      chain: "eip155:8453",
      transaction: { to: TO, value: "1000", data: "0xa9059cbb" },
    });
    assert.doesNotThrow(() => evmOutputSchema.parse(result.structuredContent));
    assert.match(result.content[0]?.text ?? "", /nothing has been signed or paid/);
  });

  it("defaults the value to 0 and the calldata to empty", () => {
    const tx = proposal(proposeEvm({ chain: "eip155:1", to: TO }))["transaction"];
    assert.deepEqual(tx, { to: TO, value: "0", data: "0x" });
  });

  it("holds the value to uint256", () => {
    const max = (2n ** 256n - 1n).toString();
    assert.doesNotThrow(() => proposeEvm({ chain: "eip155:1", to: TO, value: max }));
    assert.throws(() => proposeEvm({ chain: "eip155:1", to: TO, value: (2n ** 256n).toString() }), /exceeds uint256/);
    assert.throws(() => proposeEvm({ chain: "eip155:1", to: TO, value: "1".repeat(79) }), Error);
    for (const bad of ["-1", "1.5", "01", "", "1e3", "0x10"]) {
      assert.throws(() => proposeEvm({ chain: "eip155:1", to: TO, value: bad }), Error, JSON.stringify(bad));
    }
  });

  it("holds the chain id to uint64 and the CAIP-2 shape", () => {
    assert.doesNotThrow(() => proposeEvm({ chain: `eip155:${2n ** 64n - 1n}`, to: TO }));
    assert.throws(() => proposeEvm({ chain: `eip155:${2n ** 64n}`, to: TO }), /chain ID exceeds uint64/);
    for (const bad of ["eip155:", "eip155:01", "eip155:-1", "solana:mainnet", "8453", "eip155:1 ", "EIP155:1"]) {
      assert.throws(() => proposeEvm({ chain: bad, to: TO }), Error, JSON.stringify(bad));
    }
  });

  it("caps calldata at 120 KiB", () => {
    const bytes = (n: number): string => `0x${"ab".repeat(n)}`;
    assert.doesNotThrow(() => proposeEvm({ chain: "eip155:1", to: TO, data: bytes(120 * 1024) }));
    assert.throws(() => proposeEvm({ chain: "eip155:1", to: TO, data: bytes(120 * 1024 + 1) }), /calldata exceeds 120 KiB/);
  });

  it("accepts only whole-byte hex calldata and a 20-byte hex address", () => {
    for (const bad of ["0xabc", "abcd", "0xzz", "0x ab", "0XAB"]) {
      assert.throws(() => proposeEvm({ chain: "eip155:1", to: TO, data: bad }), Error, JSON.stringify(bad));
    }
    for (const bad of ["0x1234", `0x${"a".repeat(41)}`, `0x${"a".repeat(39)}`, `0x${"g".repeat(40)}`, "vitalik.eth", "", TO.slice(2)]) {
      assert.throws(() => proposeEvm({ chain: "eip155:1", to: bad }), Error, JSON.stringify(bad));
    }
  });
});

describe("proposeSolana", () => {
  const encode = (n: number): string => Buffer.alloc(n, 7).toString("base64");

  it("builds a proposal that its own output schema accepts", () => {
    const tx = encode(300);
    const result = proposeSolana({ transactionBase64: tx });
    assert.deepEqual(proposal(result), {
      version: "1",
      expiresAt: iso(240),
      kind: "solana",
      chain: "solana:mainnet",
      transaction: { transactionBase64: tx },
    });
    assert.doesNotThrow(() => solanaOutputSchema.parse(result.structuredContent));
  });

  it("caps a transaction at 1232 bytes and refuses an empty one", () => {
    assert.doesNotThrow(() => proposeSolana({ transactionBase64: encode(1232) }));
    assert.throws(() => proposeSolana({ transactionBase64: encode(1233) }), /at most 1,232 bytes/);
    assert.throws(() => proposeSolana({ transactionBase64: "" }), /canonical padded Base64/);
  });

  it("refuses Base64 that is not canonical and padded", () => {
    // 0xfb bytes encode with both '+' and '/', so the URL-safe spelling differs from the standard one.
    const good = Buffer.alloc(100, 0xfb).toString("base64");
    assert.ok(good.endsWith("=") && good.includes("+") && good.includes("/"), "precondition");
    assert.doesNotThrow(() => proposeSolana({ transactionBase64: good }));
    for (const bad of [good.replace(/=+$/, ""), `${good}\n`, ` ${good}`, good.replace(/\+/g, "-").replace(/\//g, "_"), `${good.slice(0, 10)} ${good.slice(10)}`, "not base64 at all!"]) {
      assert.throws(() => proposeSolana({ transactionBase64: bad }), /canonical padded Base64/, JSON.stringify(bad));
    }
  });
});

describe("proposeX402", () => {
  const ok = { chain: "eip155:8453", url: "https://example.com/pay", maxAmount: "1000000" } as const;

  it("builds a proposal that its own output schema accepts, with the USDC of the chosen chain", () => {
    const evm = proposeX402(ok);
    assert.deepEqual(proposal(evm), {
      version: "1",
      expiresAt: iso(240),
      kind: "x402",
      chain: "eip155:8453",
      request: { url: "https://example.com/pay", method: "GET" },
      payment: { asset: BASE_USDC, maxAmount: "1000000" },
    });
    assert.doesNotThrow(() => x402OutputSchema.parse(evm.structuredContent));
    const sol = proposal(proposeX402({ ...ok, chain: "solana:mainnet" }));
    assert.equal((sol["payment"] as Record<string, unknown>)["asset"], SOLANA_USDC);
    assert.notEqual(BASE_USDC, SOLANA_USDC);
  });

  it("is limited to Base and Solana mainnet", () => {
    for (const chain of ["eip155:1", "eip155:137", "solana:devnet", "base", ""]) {
      assert.throws(() => proposeX402({ ...ok, chain: chain as never }), Error, JSON.stringify(chain));
    }
  });

  it("requires https on port 443 with no credentials and no fragment", () => {
    assert.throws(() => proposeX402({ ...ok, url: "http://example.com/pay" }), /HTTPS port 443/);
    assert.throws(() => proposeX402({ ...ok, url: "https://example.com:8443/pay" }), /HTTPS port 443/);
    assert.throws(() => proposeX402({ ...ok, url: "https://user:pass@example.com/pay" }), /HTTPS port 443/);
    assert.throws(() => proposeX402({ ...ok, url: "https://user@example.com/pay" }), /HTTPS port 443/);
    assert.throws(() => proposeX402({ ...ok, url: "https://example.com/pay#frag" }), /HTTPS port 443/);
    assert.throws(() => proposeX402({ ...ok, url: "ftp://example.com/pay" }), /HTTPS port 443/);
    assert.throws(() => proposeX402({ ...ok, url: "not a url" }), Error);
    assert.doesNotThrow(() => proposeX402({ ...ok, url: "https://example.com:443/pay?x=1" }));
  });

  it("caps the URL at 2048 characters", () => {
    const padded = (total: number): string => `https://example.com/${"a".repeat(total - "https://example.com/".length)}`;
    assert.doesNotThrow(() => proposeX402({ ...ok, url: padded(2048) }));
    assert.throws(() => proposeX402({ ...ok, url: padded(2049) }), Error);
  });

  it("refuses a body on GET, allows one on POST, and caps it at 64 KiB", () => {
    assert.throws(() => proposeX402({ ...ok, body: { a: 1 } }), /GET requests cannot have a body/);
    assert.throws(() => proposeX402({ ...ok, method: "GET", body: "x" }), /GET requests cannot have a body/);
    const post = proposal(proposeX402({ ...ok, method: "POST", body: { a: 1 } }));
    assert.deepEqual(post["request"], { url: "https://example.com/pay", method: "POST", body: { a: 1 } });
    // JSON.stringify adds two quotes around a string.
    assert.doesNotThrow(() => proposeX402({ ...ok, method: "POST", body: "x".repeat(64 * 1024 - 2) }));
    assert.throws(() => proposeX402({ ...ok, method: "POST", body: "x".repeat(64 * 1024 - 1) }), /exceeds 64 KiB/);
  });

  it("holds maxAmount to a positive uint64 written without leading zeros", () => {
    assert.doesNotThrow(() => proposeX402({ ...ok, maxAmount: (2n ** 64n - 1n).toString() }));
    assert.throws(() => proposeX402({ ...ok, maxAmount: (2n ** 64n).toString() }), /exceeds uint64/);
    for (const bad of ["0", "", "-1", "01", "1.5", "1e6", "9".repeat(21)]) {
      assert.throws(() => proposeX402({ ...ok, maxAmount: bad }), Error, JSON.stringify(bad));
    }
  });
});

describe("atomicAmount", () => {
  it("converts exactly, with integer math", () => {
    assert.equal(atomicAmount("1.5", 6), "1500000");
    assert.equal(atomicAmount("0", 6), "0");
    assert.equal(atomicAmount("0.000001", 6), "1");
    assert.equal(atomicAmount("1.50", 6), "1500000");
    assert.equal(atomicAmount("5", 0), "5");
    assert.equal(atomicAmount("4.35", 2), "435");
    assert.equal(atomicAmount("9007199254740993", 6), "9007199254740993000000");
    assert.equal(atomicAmount("1", 18), "1000000000000000000");
  });

  it("refuses more decimal places than the asset has", () => {
    assert.throws(() => atomicAmount("0.1234567", 6), /more decimal places/);
    assert.throws(() => atomicAmount("5.0", 0), /more decimal places/);
    assert.throws(() => atomicAmount("1.01", 1), /more decimal places/);
  });

  it("accepts token precision from 0 to 255 and nothing else", () => {
    assert.equal(atomicAmount("1", 255), `1${"0".repeat(255)}`);
    for (const bad of [256, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => atomicAmount("1", bad), /nonnegative decimal string/, String(bad));
    }
  });

  it("refuses anything that is not a plain nonnegative decimal string", () => {
    for (const bad of ["", "-1", "+1", "01", ".5", "1.", "1e3", "1,5", " 1", "1 ", "0x10", "NaN", "1.2.3", "１"]) {
      assert.throws(() => atomicAmount(bad, 6), /nonnegative decimal string/, JSON.stringify(bad));
    }
    assert.doesNotThrow(() => atomicAmount("1".repeat(256), 6));
    assert.throws(() => atomicAmount("1".repeat(257), 6), /nonnegative decimal string/);
  });
});
