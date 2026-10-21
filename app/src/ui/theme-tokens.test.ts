import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The stylesheets are the source of truth for the palette; this test parses them and checks the rules from
// docs/research/28 section 8.5: contrast at least 4.5:1 for text and 3:1 for UI, in both themes, and a dark
// theme that is the same whether it comes from the OS preference or the manual toggle.

const here = dirname(fileURLToPath(import.meta.url));
const theme = readFileSync(join(here, "theme.css"), "utf8");
const components = readFileSync(join(here, "components.css"), "utf8");

type Tokens = Record<string, string>;

function declarations(block: string): Tokens {
  const out: Tokens = {};
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) out[name] = value.trim();
  }
  return out;
}

// Body of the first `{ ... }` after a selector marker (no nested braces in the blocks we read).
function blockAfter(source: string, marker: string): string {
  const at = source.indexOf(marker);
  if (at === -1) throw new Error(`missing ${marker}`);
  const open = source.indexOf("{", at);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

const light = declarations(blockAfter(theme, "\n:root {"));
const darkOs = declarations(blockAfter(theme, ':root:not([data-theme="light"])'));
const darkManual = declarations(blockAfter(theme, ':root[data-theme="dark"]'));

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null || match[1] === undefined) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--text", "--bg"],
  ["--text", "--surface"],
  ["--text", "--surface-2"],
  ["--text-muted", "--bg"],
  ["--text-muted", "--surface"],
  ["--text-muted", "--surface-2"],
  ["--accent", "--bg"],
  ["--accent", "--surface"],
  ["--accent-fg", "--accent"],
  ["--ok-fg", "--ok-bg"],
  ["--warn-fg", "--warn-bg"],
  ["--danger-fg", "--danger-bg"],
  ["--info-fg", "--info-bg"],
  ["--neutral-fg", "--neutral-bg"],
  ["--untrusted-fg", "--untrusted-bg"],
  ["--text-muted", "--untrusted-bg"],
  // The dock strip and the primary button: paper on ink (ink on paper in the dark theme), plus its dim text.
  ["--accent-fg-muted", "--accent"],
  // The two sides and caution are text, so they pass as text on the paper, the panel and the well.
  ["--yes", "--bg"],
  ["--yes", "--surface"],
  ["--yes", "--surface-2"],
  ["--no", "--bg"],
  ["--no", "--surface"],
  ["--no", "--surface-2"],
  ["--caution", "--bg"],
  ["--caution", "--surface"],
  ["--caution", "--surface-2"],
];

const UI_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["--focus", "--bg"],
  ["--focus", "--surface"],
  ["--border-strong", "--bg"],
  ["--border-strong", "--surface"],
  ["--border-strong", "--surface-2"],
  ["--border-strong", "--untrusted-bg"],
  // The 9 px venue marks and the live dot are drawn in these, on paper and on the panel.
  ["--yes", "--bg"],
  ["--no", "--bg"],
  ["--yes", "--surface"],
  ["--no", "--surface"],
];

describe("theme tokens", () => {
  it("defines the same token names in light and dark", () => {
    expect(Object.keys(darkOs).sort()).toEqual(Object.keys(darkManual).sort());
    for (const name of Object.keys(darkOs)) expect(light).toHaveProperty([name]);
  });

  it("keeps the OS-preference dark block identical to the manual dark block", () => {
    const { ["color-scheme"]: _ignored, ...manual } = darkManual;
    expect(darkOs).toEqual(manual);
  });

  for (const [themeName, tokens] of [["light", { ...light }], ["dark", { ...light, ...darkManual }]] as const) {
    it(`meets 4.5:1 for text pairs in the ${themeName} theme`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(tokens[fg] as string, tokens[bg] as string);
        expect(ratio, `${fg} on ${bg} in ${themeName}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`meets 3:1 for focus ring and control outlines in the ${themeName} theme`, () => {
      for (const [fg, bg] of UI_PAIRS) {
        const ratio = contrast(tokens[fg] as string, tokens[bg] as string);
        expect(ratio, `${fg} on ${bg} in ${themeName}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("the contrast function agrees with the known extremes", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThan(4.5);
  });

  it("fails the check for a seeded low-contrast pair", () => {
    expect(contrast("#aaaaaa", "#ffffff")).toBeLessThan(4.5);
  });
});

describe("stylesheets obey the CSP", () => {
  for (const [name, css] of [["theme.css", theme], ["components.css", components]] as const) {
    it(`${name} loads nothing and holds no remote reference`, () => {
      expect(css).not.toMatch(/@import/);
      expect(css).not.toMatch(/url\(/);
      expect(css).not.toMatch(/https?:\/\//);
      expect(css).not.toMatch(/@font-face/);
    });
  }

  it("honours reduced motion and sizes touch targets at 44 px", () => {
    expect(theme).toMatch(/prefers-reduced-motion: reduce/);
    expect(theme).toMatch(/--tap: 44px/);
    expect(components).toMatch(/min-height: var\(--tap\)/);
  });

  it("uses only tokens for colour in component styles (the dialog scrim is a token too)", () => {
    expect(components).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(components).not.toMatch(/\brgba?\(/);
    expect(components).not.toMatch(/\bhsla?\(/);
  });

  it("keeps square corners and 1.5 px lines as tokens", () => {
    expect(light["--radius"]).toBe("0");
    expect(light["--line"]).toBe("1.5px");
    expect(darkManual["--scrim"]).toMatch(/^rgb\(/);
  });
});
