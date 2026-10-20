import { describe, expect, it } from "vitest";

import { KERNEL_FACTORY } from "@shared/xo/chain/constants";

import { base58ByteLength, checkEvmAddress, checkSolanaAddress, poisoningKey, type SavedAddress } from "./address";

// The public Anvil test account 0.
const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("checkEvmAddress (M2-1)", () => {
  it("accepts a checksummed address and returns it unchanged", () => {
    const result = checkEvmAddress(ANVIL_0);
    expect(result).toEqual({ ok: true, address: ANVIL_0, form: "checksummed", warnings: [], needsConfirmation: false });
  });

  it("accepts all-lowercase, returns the checksummed form and says it is unchecked", () => {
    const result = checkEvmAddress(ANVIL_0.toLowerCase());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.address).toBe(ANVIL_0);
    expect(result.form).toBe("lowercase");
    expect(result.warnings.map((warning) => warning.code)).toEqual(["lowercase_unchecked"]);
    expect(result.needsConfirmation).toBe(false);
  });

  it("trims ASCII whitespace around a paste and nothing else", () => {
    expect(checkEvmAddress(`  ${ANVIL_0}\n`).ok).toBe(true);
    expect(checkEvmAddress(`${ANVIL_0.slice(0, 20)}\n${ANVIL_0.slice(20)}`)).toMatchObject({ ok: false, code: "invisible_characters" });
  });

  it("refuses mixed case with a bad checksum, for every single flipped letter", () => {
    const letters = [...ANVIL_0.slice(2)].map((char, index) => ({ char, index })).filter((entry) => /[a-fA-F]/.test(entry.char));
    expect(letters.length).toBeGreaterThan(10);
    for (const { char, index } of letters) {
      const flipped = char === char.toLowerCase() ? char.toUpperCase() : char.toLowerCase();
      const altered = `0x${ANVIL_0.slice(2, 2 + index)}${flipped}${ANVIL_0.slice(3 + index)}`;
      expect(checkEvmAddress(altered), altered).toMatchObject({ ok: false, code: "bad_checksum" });
    }
  });

  it("refuses all-uppercase hex, which carries no checksum", () => {
    expect(checkEvmAddress(`0x${ANVIL_0.slice(2).toUpperCase()}`)).toMatchObject({ ok: false, code: "uppercase_unverified" });
  });

  it("refuses invisible, zero-width and look-alike characters by name", () => {
    expect(checkEvmAddress(`${ANVIL_0.slice(0, 10)}​${ANVIL_0.slice(10)}`)).toMatchObject({ ok: false, code: "invisible_characters" });
    // Cyrillic 'а' in place of the Latin 'a'.
    expect(checkEvmAddress(ANVIL_0.replace("a", "а"))).toMatchObject({ ok: false, code: "invisible_characters" });
    expect(checkEvmAddress(`${ANVIL_0}‮`)).toMatchObject({ ok: false, code: "invisible_characters" });
  });

  it("refuses non-addresses, ENS names, empty and oversized input", () => {
    expect(checkEvmAddress("")).toMatchObject({ ok: false, code: "empty" });
    expect(checkEvmAddress("   ")).toMatchObject({ ok: false, code: "empty" });
    expect(checkEvmAddress("vitalik.eth")).toMatchObject({ ok: false, code: "ens_not_supported" });
    expect(checkEvmAddress("example.com")).toMatchObject({ ok: false, code: "ens_not_supported" });
    expect(checkEvmAddress(ANVIL_0.slice(2))).toMatchObject({ ok: false, code: "not_an_address" });
    expect(checkEvmAddress(ANVIL_0.slice(0, -1))).toMatchObject({ ok: false, code: "not_an_address" });
    expect(checkEvmAddress(`${ANVIL_0}0`)).toMatchObject({ ok: false, code: "not_an_address" });
    expect(checkEvmAddress("0x" + "g".repeat(40))).toMatchObject({ ok: false, code: "not_an_address" });
    expect(checkEvmAddress("a".repeat(500))).toMatchObject({ ok: false, code: "too_long" });
    expect(checkEvmAddress(42)).toMatchObject({ ok: false, code: "not_an_address" });
    expect(checkEvmAddress(null)).toMatchObject({ ok: false, code: "not_an_address" });
  });

  it("refuses the zero address and a pinned protocol contract as a wallet", () => {
    expect(checkEvmAddress("0x0000000000000000000000000000000000000000")).toMatchObject({ ok: false, code: "zero_address" });
    expect(checkEvmAddress(KERNEL_FACTORY)).toMatchObject({ ok: false, code: "protocol_contract" });
    expect(checkEvmAddress(KERNEL_FACTORY.toLowerCase())).toMatchObject({ ok: false, code: "protocol_contract" });
    expect(checkEvmAddress(KERNEL_FACTORY, [], { role: "any" }).ok).toBe(true);
  });

  it("warns, and asks for confirmation, on a burn address", () => {
    const result = checkEvmAddress("0x000000000000000000000000000000000000dEaD");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((warning) => warning.code)).toContain("burn_address");
    expect(result.needsConfirmation).toBe(true);
  });

  describe("address poisoning", () => {
    const saved: SavedAddress[] = [{ id: "mine", address: ANVIL_0 }];
    // Same first four and last four hex digits, different middle.
    const lookalike = `0x${ANVIL_0.slice(2, 6)}${"1".repeat(32)}${ANVIL_0.slice(-4)}`.toLowerCase();

    it("builds the key from the first and last four hex digits, case-insensitively", () => {
      expect(poisoningKey(ANVIL_0)).toBe("f39f..2266");
      expect(poisoningKey(ANVIL_0.toLowerCase())).toBe("f39f..2266");
      expect(poisoningKey("hello")).toBeNull();
    });

    it("warns, and needs confirmation, for a different address that shares the ends of a saved one", () => {
      const result = checkEvmAddress(lookalike, saved);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings.map((warning) => warning.code)).toContain("lookalike");
      expect(result.warnings.find((warning) => warning.code === "lookalike")?.otherId).toBe("mine");
      expect(result.needsConfirmation).toBe(true);
    });

    it("does not warn when only one end matches", () => {
      const sameStart = `0x${ANVIL_0.slice(2, 6)}${"1".repeat(32)}abcd`;
      const result = checkEvmAddress(sameStart, saved);
      expect(result.ok && result.warnings.some((warning) => warning.code === "lookalike")).toBe(false);
    });

    it("reports an exact duplicate as a duplicate, not a look-alike", () => {
      const result = checkEvmAddress(ANVIL_0.toLowerCase(), saved);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings.map((warning) => warning.code)).toEqual(["lowercase_unchecked", "duplicate"]);
      expect(result.needsConfirmation).toBe(false);
    });

    it("checks against every saved address", () => {
      const many: SavedAddress[] = [
        { id: "a", address: "0x1111111111111111111111111111111111111111" },
        { id: "b", address: ANVIL_0 },
        { id: "c", address: "not an address" },
      ];
      const result = checkEvmAddress(lookalike, many);
      expect(result.ok && result.warnings.filter((warning) => warning.code === "lookalike").map((warning) => warning.otherId)).toEqual(["b"]);
    });
  });
});

describe("checkSolanaAddress", () => {
  const SYSTEM_PROGRAM = "11111111111111111111111111111111";
  const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

  it("accepts a 32-byte base58 key", () => {
    expect(checkSolanaAddress(SYSTEM_PROGRAM)).toMatchObject({ ok: true, address: SYSTEM_PROGRAM, form: "base58" });
    expect(checkSolanaAddress(` ${TOKEN_PROGRAM}\n`)).toMatchObject({ ok: true, address: TOKEN_PROGRAM });
    expect(base58ByteLength(TOKEN_PROGRAM)).toBe(32);
    expect(base58ByteLength(SYSTEM_PROGRAM)).toBe(32);
  });

  it("refuses wrong alphabet, wrong length and wrong decoded size", () => {
    expect(checkSolanaAddress("0OIl" + "1".repeat(30))).toMatchObject({ ok: false, code: "not_solana" });
    expect(checkSolanaAddress("1".repeat(31))).toMatchObject({ ok: false, code: "not_solana" });
    expect(checkSolanaAddress("z".repeat(44))).toMatchObject({ ok: false, code: "not_solana" });
    expect(checkSolanaAddress(ANVIL_0)).toMatchObject({ ok: false, code: "not_solana" });
    expect(checkSolanaAddress("")).toMatchObject({ ok: false, code: "empty" });
    expect(checkSolanaAddress(`${TOKEN_PROGRAM}​`)).toMatchObject({ ok: false, code: "invisible_characters" });
    expect(checkSolanaAddress(7)).toMatchObject({ ok: false, code: "not_solana" });
  });

  it("warns on a look-alike of a saved Solana address", () => {
    const saved: SavedAddress[] = [{ id: "pascal", address: TOKEN_PROGRAM }];
    // One middle character changed: same first and last four characters, still 32 bytes once decoded.
    const middle = TOKEN_PROGRAM[20] === "2" ? "3" : "2";
    const candidate = `${TOKEN_PROGRAM.slice(0, 20)}${middle}${TOKEN_PROGRAM.slice(21)}`;
    const result = checkSolanaAddress(candidate, saved);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings.map((warning) => warning.code)).toEqual(["lookalike"]);
    expect(result.needsConfirmation).toBe(true);
    const duplicate = checkSolanaAddress(TOKEN_PROGRAM, saved);
    expect(duplicate.ok && duplicate.warnings.map((warning) => warning.code)).toEqual(["duplicate"]);
  });
});
