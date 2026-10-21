import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The vendored fonts: every face in fonts.css points at a woff2 file that exists beside it, with its OFL licence
// text, and no stylesheet under app/src sets text in upper case (the "never uppercase labels" rule of the design).
// jsdom loads no fonts, so this is a file-level check; the built-bundle tests cover that the files ship.

const ui = dirname(fileURLToPath(import.meta.url));
const src = join(ui, "..");
const fonts = readFileSync(join(ui, "fonts.css"), "utf8");
const theme = readFileSync(join(ui, "theme.css"), "utf8");

const FAMILIES = new Set(["Archivo", "Martian Mono"]);
const WOFF2_MAGIC = "wOF2";

function faces(): Array<{ readonly family: string; readonly display: string | undefined; readonly url: string | undefined }> {
  const out: Array<{ family: string; display: string | undefined; url: string | undefined }> = [];
  for (const match of fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const body = match[1] ?? "";
    out.push({
      family: /font-family:\s*"([^"]+)"/.exec(body)?.[1] ?? "",
      display: /font-display:\s*([a-z]+)/.exec(body)?.[1],
      url: /url\(([^)]+)\)/.exec(body)?.[1]?.replace(/^["']|["']$/g, ""),
    });
  }
  return out;
}

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...cssFiles(full));
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

describe("vendored fonts", () => {
  const all = faces();

  it("declares six faces: four Archivo weights and two Martian Mono weights", () => {
    expect(all.length).toBe(6);
    expect(all.filter((face) => face.family === "Archivo").length).toBe(4);
    expect(all.filter((face) => face.family === "Martian Mono").length).toBe(2);
  });

  it("every face names one of the two families, swaps in, and points at a relative woff2 file that exists", () => {
    for (const face of all) {
      expect(FAMILIES.has(face.family), face.family).toBe(true);
      expect(face.display, face.family).toBe("swap");
      expect(face.url, face.family).toBeDefined();
      const url = face.url ?? "";
      expect(url.startsWith("./fonts/"), url).toBe(true);
      expect(url.endsWith(".woff2"), url).toBe(true);
      expect(url).not.toMatch(/^[a-z]+:/i);
      const file = join(ui, url);
      expect(existsSync(file), `${url} is missing`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(10_000);
      expect(readFileSync(file).subarray(0, 4).toString("latin1"), `${url} is not a woff2 file`).toBe(WOFF2_MAGIC);
    }
  });

  it("loads nothing from another origin and uses no data: URL (font-src 'self' has no data:)", () => {
    expect(fonts).not.toMatch(/https?:\/\//);
    expect(fonts).not.toMatch(/data:/);
    expect(fonts).not.toMatch(/@import/);
  });

  it("ships the OFL 1.1 licence text of each family beside the files", () => {
    for (const [file, family] of [
      ["OFL-Archivo.txt", "Archivo"],
      ["OFL-MartianMono.txt", "Martian Mono"],
    ] as const) {
      const text = readFileSync(join(ui, "fonts", file), "utf8");
      expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1");
      expect(text.split("\n")[0]).toMatch(new RegExp(`^Copyright .*${family} Project Authors`));
    }
  });

  it("names Archivo first in --font and Martian Mono first in --mono, with system stacks behind them", () => {
    expect(theme).toMatch(/--font:\s*"Archivo",\s*system-ui/);
    expect(theme).toMatch(/--mono:\s*"Martian Mono",\s*ui-monospace/);
  });

  it("sets nothing in upper case anywhere under app/src (sentence case throughout)", () => {
    for (const file of cssFiles(src)) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/text-transform:\s*uppercase/);
    }
  });
});
