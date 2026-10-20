import { afterEach, describe, expect, it } from "vitest";
import { getAddress } from "viem";

import { checkAddresses, literalViolations, pinnedAddressViolations } from "./check-addresses.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";
import * as constants from "../../src/xo/chain/constants.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

// A real address with one letter's case flipped: still the same bytes, no longer the right checksum.
function flipOneLetter(address: string): string {
  const body = address.slice(2);
  const at = [...body].findIndex((char) => /[a-f]/i.test(char));
  const flipped = body[at] === body[at]?.toLowerCase() ? body[at]?.toUpperCase() : body[at]?.toLowerCase();
  return `0x${body.slice(0, at)}${flipped}${body.slice(at + 1)}`;
}

const ADDRESS_EXPORTS = Object.entries(constants).filter(([, value]) => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value));
// A seeded bad checksum needs a letter whose case can be flipped; an all-digit address has no checksum to get wrong.
const WITH_LETTERS = ADDRESS_EXPORTS.filter(([, value]) => /[a-f]/i.test(String(value).slice(2)));

describe("check-addresses (W0-5)", () => {
  it("passes over every pinned address and every literal in the app and shared sources", async () => {
    expect(await checkAddresses()).toEqual([]);
  });

  it("covers the addresses that matter (the check is not vacuous)", () => {
    const names = ADDRESS_EXPORTS.map(([name]) => name);
    for (const expected of ["ENTRY_POINT_V07", "KERNEL_FACTORY", "KERNEL_IMPLEMENTATION", "ECDSA_VALIDATOR", "ANVIL_ACCOUNT_0_OWNER", "ANVIL_ACCOUNT_0_ACCOUNT"]) expect(names).toContain(expected);
  });

  it("fails each pinned address when a seeded copy has a bad checksum", () => {
    expect(WITH_LETTERS.length).toBeGreaterThanOrEqual(6);
    for (const [name, value] of WITH_LETTERS) {
      const bad = flipOneLetter(String(value));
      expect(bad).not.toBe(value);
      expect(pinnedAddressViolations("c.ts", { [name]: bad }).map((v) => v.rule), name).toEqual(["pinned-checksum"]);
      expect(literalViolations("c.ts", `export const A = "${bad}";`).map((v) => v.rule), name).toEqual(["bad-checksum"]);
    }
  });

  it("requires the checksummed form for a pinned constant but lets a literal be all lower case", () => {
    const sample = String(WITH_LETTERS[0]?.[1]);
    expect(pinnedAddressViolations("c.ts", { A: sample.toLowerCase() }).length).toBe(1);
    expect(literalViolations("c.ts", sample.toLowerCase())).toEqual([]);
    // viem's strict check accepts all-lowercase only; an all-uppercase literal is a mixed-case error.
    expect(literalViolations("c.ts", `0x${sample.slice(2).toUpperCase()}`).map((v) => v.rule)).toEqual(["bad-checksum"]);
    expect(literalViolations("c.ts", sample)).toEqual([]);
    expect(getAddress(sample)).toBe(sample);
  });

  it("ignores 32-byte values and finds a bad literal in a scanned file", async () => {
    expect(literalViolations("c.ts", `const topic = "0x${"ab".repeat(32)}";`)).toEqual([]);
    const bad = flipOneLetter(String(WITH_LETTERS[0]?.[1]));
    const repo = await tempRepo({ "app/src/venues/x.ts": `export const A = "${bad}";\n`, "app/headers.config.ts": "export {};\n" });
    repos.push(repo);
    const found = await checkAddresses({ repoRoot: repo.root, constants: {} });
    expect(found.map((violation) => `${violation.rule}:${violation.file}:${violation.line}`)).toEqual(["bad-checksum:app/src/venues/x.ts:1"]);
  });
});
