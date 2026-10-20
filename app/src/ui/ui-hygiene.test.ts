import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Source rules for the shell package (app/src/ui, App.tsx, main.tsx), enforced as tests so a violation fails
// here before the build-level checks (check-origins, check-boundaries, check-bundle) see it.

const ui = dirname(fileURLToPath(import.meta.url));
const src = join(ui, "..");

function files(): Array<{ readonly name: string; readonly text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push({ name: full.slice(src.length + 1), text: readFileSync(full, "utf8") });
    }
  };
  walk(ui);
  for (const name of ["App.tsx", "main.tsx"]) out.push({ name, text: readFileSync(join(src, name), "utf8") });
  return out;
}

// Comments may name a banned thing to forbid it.
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const all = files();

describe("shell source hygiene", () => {
  it("scans the files it should", () => {
    const names = all.map((file) => file.name);
    for (const expected of ["App.tsx", "main.tsx", "ui/UntrustedText.tsx", "ui/Tiles.tsx", "ui/Shell.tsx", "ui/theme.css", "ui/testing/dom.tsx"]) expect(names).toContain(expected);
  });

  it("has no string-to-HTML or string-to-code sink", () => {
    for (const { name, text } of all) {
      expect(code(text), name).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
      expect(code(text), name).not.toMatch(/\bset(?:Timeout|Interval)\s*\(\s*["'`]/);
    }
  });

  it("has no inline styles (style-src 'self')", () => {
    for (const { name, text } of all) {
      if (name.endsWith(".css")) continue;
      expect(code(text), name).not.toMatch(/\bstyle\s*=\s*\{/);
      expect(code(text), name).not.toMatch(/\bstyle\s*=\s*["']/);
      expect(code(text), name).not.toMatch(/<style\b/);
      expect(code(text), name).not.toMatch(/\.style\./);
      expect(code(text), name).not.toMatch(/\bsetAttribute\(\s*["']style["']/);
    }
  });

  it("makes no network request and opens no window", () => {
    for (const { name, text } of all) {
      expect(code(text), name).not.toMatch(/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
      expect(code(text), name).not.toMatch(/\bwindow\.open\b/);
      expect(code(text), name).not.toMatch(/target\s*=\s*["']_blank["']/);
    }
  });

  it("has no hostname or URL literal, not even in a comment (check-origins reads comments too)", () => {
    for (const { name, text } of all) {
      expect(text, name).not.toMatch(/\b(?:https?|wss?|ftp):\/\//);
    }
  });

  it("loads no third-party script, font or analytics module", () => {
    for (const { name, text } of all) {
      for (const match of code(text).matchAll(/from\s+["']([^"']+)["']/g)) {
        const specifier = match[1] ?? "";
        const allowed = specifier.startsWith(".") || /^(?:react|react-dom|react-dom\/client|wouter|wouter\/use-hash-location|wouter\/memory-location|@tanstack\/react-query|vitest|node:fs|node:path|node:url|node:module)$/.test(specifier) || specifier.startsWith("@shared/guardrails/") || specifier.startsWith("@bridge/contract");
        expect(allowed, `${name} imports ${specifier}`).toBe(true);
      }
    }
  });

  it("keeps storage access in theme.ts only, behind try/catch", () => {
    for (const { name, text } of all) {
      if (name === "ui/theme.ts") {
        expect(text).toMatch(/try\s*\{[\s\S]*localStorage[\s\S]*\}\s*catch/);
        continue;
      }
      expect(code(text), name).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/);
    }
  });

  it("imports no Node module (the boundary check treats this folder as bundled code)", () => {
    for (const { name, text } of all) {
      expect(code(text), name).not.toMatch(/from\s+["']node:/);
    }
  });

  it("reads Untrusted values only inside UntrustedText", () => {
    for (const { name, text } of all) {
      if (name === "ui/UntrustedText.tsx") continue;
      // `.value` of an Untrusted is the raw stranger text. Form controls' `.value` is fine; the
      // distinguishing sign is the brand check or a field named `untrusted`.
      expect(code(text), name).not.toMatch(/\.untrusted\b/);
    }
  });
});
