import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUNDLED_LINKS_PATH } from "./dataset";

// The dApp loads the link file from the place the linker writes it. A drift between the two leaves every market
// with "no links" however many links the linker exported, so both ends are pinned here.

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..", "..", "..", "..");
const REPO = resolve(APP, "..");

describe("the bundled link file path", () => {
  it("is where the loader's glob points", () => {
    const source = readFileSync(resolve(HERE, "dataset.ts"), "utf8");
    const glob = /import\.meta\.glob<unknown>\("([^"]+)"/.exec(source)?.[1];
    expect(glob).toBeDefined();
    expect(relative(APP, resolve(HERE, glob ?? ""))).toBe(BUNDLED_LINKS_PATH);
  });

  it("is where the linker runbook's export-app step writes", () => {
    const runbook = readFileSync(resolve(REPO, "docs", "linker-runbook.md"), "utf8");
    expect(runbook).toContain(`--app-out app/${BUNDLED_LINKS_PATH}`);
  });
});
