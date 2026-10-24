import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Source rules for "no fake or placeholder data" in everything that ships to users: no sample markets or accounts,
// no prefilled example amounts or addresses, no demo mode. Test builders, fixtures and test kits are excluded.

const src = join(dirname(fileURLToPath(import.meta.url)), "..");
// The shared SDK ships in the page too (the venue readers, the model, the money code); its files are named "sdk/...".
const sdk = join(src, "..", "..", "sdk");

function production(): Array<{ readonly name: string; readonly text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  const walk = (root: string, prefix: string, dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // sdk/node is the Node-only part (credentialed signers); it never ships in the page.
        if (entry.name === "fixtures" || entry.name === "testing" || (prefix === "sdk/" && dir === root && entry.name === "node")) continue;
        walk(root, prefix, full);
      } else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !/(?:test-support|testkit|view-harness)\./.test(entry.name) && entry.name !== "fixtures.ts" && entry.name !== "fakes.ts") {
        out.push({ name: `${prefix}${relative(root, full)}`, text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(src, "", src);
  walk(sdk, "sdk/", sdk);
  return out;
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const all = production();

// Full 20-byte addresses that may appear in shipped code: pinned protocol constants and the zero/burn sentinels.
const PINNED_ADDRESS_FILES = new Set([
  "core/address.ts", // zero and burn sentinels used to refuse a destination
  "features/trade/vet.ts", // the zero address, to refuse an order that redirects proceeds
  "sdk/chain/multicall.ts", // Multicall3, the same address on every chain
  "sdk/chain/xo/constants.ts", // XO's pinned contracts (moved from src/xo/chain/constants.ts) and the other CLOB venues' exchanges
  "sdk/chain/polymarket/constants.ts", // Polymarket's pinned Polygon contracts (docs.polymarket.com/resources/contracts)
  "sdk/chain/limitless/constants.ts", // Limitless's pinned Base contracts (docs.limitless.exchange smart-contracts)
  "sdk/venues/limitless/constants.ts", // Base USDC
  "sdk/venues/trueo/constants.ts", // Trueo's pinned Base contracts (manager, token, pool reads) and Base USDC
  "sdk/trade/xo/constants.ts", // XO's order domain contract, the Kernel ECDSA validator and the zero address
  "features/signals/quotient/constants.ts", // Base USDC and the pay-to address of the x402 route
  // Circle's native USDC on Polygon, which the trading account takes deposits in and withdraws (nothing else in the page
  // names it: Polymarket's own collateral is USDC.e and pUSD). Base USDC there is imported from the SDK's pin.
  "features/account/constants.ts",
]);

describe("no invented data in shipped code", () => {
  it("scans the files it should", () => {
    const names = all.map((file) => file.name);
    for (const expected of ["App.tsx", "features/wallet/FundingPanel.tsx", "features/trade/ActionPanels.tsx", "features/signals/quotient/constants.ts", "sdk/model.ts", "sdk/venues/xo/adapter.ts", "sdk/venues/polymarket/normalize.ts"]) expect(names).toContain(expected);
    expect(names.some((name) => name.includes("fixtures"))).toBe(false);
  });

  it("holds a full address only in the files that pin one", () => {
    for (const { name, text } of all) {
      if (PINNED_ADDRESS_FILES.has(name)) continue;
      expect(code(text), name).not.toMatch(/0x[0-9a-fA-F]{40}\b/);
    }
  });

  it("has no input placeholder that looks like data", () => {
    for (const { name, text } of all) {
      for (const match of code(text).matchAll(/\bplaceholder\s*=\s*(?:"([^"]*)"|\{\s*["'`]([^"'`]*)["'`]\s*\})/g)) {
        const value = match[1] ?? match[2] ?? "";
        expect(value, `${name}: placeholder ${value}`).not.toMatch(/0x|[0-9]/);
      }
    }
  });

  it("prefills no amount, address or id in a form field", () => {
    // Every state seeded with a non-empty string literal in a screen is a choice (a filter, a sort, a mode, a spend limit),
    // never an amount, an address or an id. Each one is listed; a new one fails here until it is reviewed.
    const allowed = new Map<string, number>([
      ["features/signals/SignalsView.tsx", 2], // the user's own daily spend limit (a safety cap on paid calls) and the coverage filter
      ["features/signals/CallPanel.tsx", 2], // status filter "active" and the route "mispriced"
      ["features/explorer/MarketsView.tsx", 2], // status filter "active" and sort "closing"
      ["features/trade/ActionPanels.tsx", 1], // allowance mode "unlimited" (a radio choice; the capped amount starts empty)
      ["features/terminal/prepare/PrepareConsole.tsx", 1], // origin tag "typed"
      ["features/wallet/services.tsx", 1], // load status "loading"
      ["features/wallet/BindingsPanel.tsx", 1], // address kind "eoa" (a select choice; the address starts empty)
      ["features/account/context.tsx", 1], // passkey support "unknown" until the browser is asked (a load status)
    ]);
    const literal = /useState(?:<[^>]*>)?\(\s*(?:"[^"]+"|'[^']+'|`[^`]+`)\s*\)/g;
    for (const { name, text } of all) {
      if (!name.startsWith("features/")) continue;
      const found = [...code(text).matchAll(literal)].map((match) => match[0]);
      expect(found.length, `${name}: ${found.join(", ")}`).toBeLessThanOrEqual(allowed.get(name) ?? 0);
    }
  });

  it("has no demo, sample, dummy or lorem content", () => {
    for (const { name, text } of all) {
      expect(code(text), name).not.toMatch(/\b(?:lorem ipsum|dummy (?:data|market|address)|sample (?:market|position|address|data)|demo mode|example\.com)\b/i);
    }
  });
});
