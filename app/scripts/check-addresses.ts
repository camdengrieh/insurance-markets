import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { getAddress, isAddress } from "viem";

import { REPO_DIR, SOURCE_FILE, isMain, lineOf, relPosix, report, walk, type Violation } from "./lib.ts";

// Strict EIP-55 over every address the app and its shared sources pin (acceptance W0-5, docs/dapp-design.md
// section 9 row 15: research note 28 printed the Kernel factory with a checksum that fails).
//
// 1. Every exported string of sdk/chain/xo/constants.ts that is an address must equal its own checksummed
//    form (all-lowercase is not accepted for a pinned constant).
// 2. Every 40-hex-digit literal in the app's source, the shared XO sources and bridge/contract.ts must pass
//    viem's strict check: all-lowercase passes, anything with capitals needs the right checksum.

const ADDRESS_LITERAL = /0x[0-9a-fA-F]{40}\b/g;
const SKIP = new Set(["node_modules", "dist", "fixtures", "test-results", "playwright-report"]);

export function pinnedAddressViolations(file: string, constants: Readonly<Record<string, unknown>>): Violation[] {
  const violations: Violation[] = [];
  for (const [name, value] of Object.entries(constants)) {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) continue;
    if (getAddress(value) !== value) {
      violations.push({ file, rule: "pinned-checksum", detail: `${name} = ${value} is not the checksummed form ${getAddress(value)}` });
    }
  }
  return violations;
}

export function literalViolations(file: string, text: string): Violation[] {
  const violations: Violation[] = [];
  for (const match of text.matchAll(ADDRESS_LITERAL)) {
    const literal = match[0];
    if (!isAddress(literal, { strict: true })) {
      violations.push({ file, line: lineOf(text, match.index ?? 0), rule: "bad-checksum", detail: `${literal} fails the strict EIP-55 check (expected ${getAddress(literal.toLowerCase())})` });
    }
  }
  return violations;
}

export interface AddressOptions {
  readonly repoRoot?: string;
  readonly appDir?: string;
  // Replaces the import of sdk/chain/xo/constants.ts (tests).
  readonly constants?: Readonly<Record<string, unknown>>;
}

export async function checkAddresses(options: AddressOptions = {}): Promise<Violation[]> {
  const repoRoot = options.repoRoot ?? REPO_DIR;
  const appDir = options.appDir ?? resolve(repoRoot, "app");
  const violations: Violation[] = [];
  // The constants live in sdk/chain/xo/constants.ts; src/xo/chain/constants.ts is a re-export whose .js specifier
  // Node's type stripping cannot follow, so the SDK file is imported directly.
  const constants = options.constants ?? ((await import(resolve(repoRoot, "sdk/chain/xo/constants.ts"))) as Record<string, unknown>);
  violations.push(...pinnedAddressViolations("sdk/chain/xo/constants.ts", constants));
  const files = [
    ...(await walk(join(repoRoot, "src", "xo"), SKIP)),
    join(repoRoot, "src", "relay", "contract.ts"),
    join(repoRoot, "bridge", "contract.ts"),
    join(appDir, "headers.config.ts"),
    ...(await walk(join(appDir, "src"), SKIP)),
    // The venue readers and the shared model the page bundles.
    ...(await walk(join(repoRoot, "sdk"), SKIP)),
  ].filter((file) => SOURCE_FILE.test(file));
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, "utf8");
    } catch {
      continue;
    }
    violations.push(...literalViolations(relPosix(repoRoot, file), text));
  }
  return violations;
}

if (isMain(import.meta.url)) {
  process.exitCode = report("check-addresses", await checkAddresses());
}
