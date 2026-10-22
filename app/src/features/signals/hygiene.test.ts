import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ENTRY_STATUSES } from "./quotient";
import { gateReasonText, orientationText } from "./words";
import { pointsText, probabilityText, usdLabel } from "./figures";

// Source rules for the Signals feature (M3-4, M3-8, R3, R5), enforced as tests so a violation fails here before the
// build-level checks see it.

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..");

function files(): Array<{ readonly name: string; readonly text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      // quotient/ is the Quotient client (it makes the requests, reads the 402 challenge and serialises nothing to
      // the screen); its own hygiene test (quotient/hygiene.test.ts) holds it to the client's rules.
      if (entry.isDirectory()) {
        if (entry.name !== "quotient") walk(full);
      }
      else if (/\.(?:tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push({ name: full.slice(src.length + 1), text: readFileSync(full, "utf8") });
    }
  };
  walk(here);
  // There is no route file: the Quotient settings dialog is opened from the Markets surface (features/explorer).
  // The surface's two components that show Quotient output are scanned under the same rules: the Quotient panel
  // (the only component that fires the paid lookup) and the "Same question elsewhere" panel (the link candidates).
  for (const name of ["QuotientPanel.tsx", "SameQuestion.tsx"]) out.push({ name: `features/explorer/${name}`, text: readFileSync(join(src, "features", "explorer", name), "utf8") });
  return out;
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const all = files();
// test-support.tsx is test scaffolding (a fake store and a mount helper); no build imports it.
const sources = all.filter((file) => !file.name.endsWith(".css") && !file.name.endsWith("test-support.tsx"));

describe("Signals source hygiene", () => {
  it("scans the files it should", () => {
    const names = all.map((file) => file.name);
    for (const expected of ["features/signals/SignalsView.tsx", "features/signals/QuotientSettingsDialog.tsx", "features/signals/RowCard.tsx", "features/signals/session.ts", "features/signals/LinkOverlay.tsx", "features/signals/links/verify.ts", "features/explorer/QuotientPanel.tsx", "features/explorer/SameQuestion.tsx"]) expect(names).toContain(expected);
    expect(names.some((name) => name.startsWith("routes/"))).toBe(false);
  });

  it("has no string-to-HTML or string-to-code sink, no inline style, no URL literal", () => {
    for (const { name, text } of all) {
      expect(code(text), name).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|document\.write|eval|new Function)\b/);
      if (!name.endsWith(".css")) {
        expect(code(text), name).not.toMatch(/\bstyle\s*=\s*[{"']/);
        expect(code(text), name).not.toMatch(/\.style\./);
      }
      expect(text, name).not.toMatch(/\b(?:https?|wss?|ftp):\/\//);
    }
  });

  it("makes no request of its own and starts nothing on a timer: every request goes through the injected client", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/\bfetch\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
      expect(code(text), name).not.toMatch(/\bset(?:Timeout|Interval)\b/);
      expect(code(text), name).not.toMatch(/\bwindow\.open\b|target\s*=\s*["']_blank["']/);
    }
  });

  it("touches no storage, cookie, address bar or history (M3-4)", () => {
    for (const { name, text } of sources) {
      // Only the services record opens the settings store, and only the session writes the gate record to it.
      if (name !== "features/signals/services.tsx") expect(code(text), name).not.toMatch(/\bopenStores\b/);
      expect(code(text), name).not.toMatch(/\b(?:localStorage|sessionStorage|indexedDB|document\.cookie|BindingsStore)\b/);
      expect(code(text), name).not.toMatch(/\b(?:location|history)\s*\.|\bURLSearchParams\b|\bpushState\b|\breplaceState\b|\bhref\s*=/);
    }
  });

  it("has no export, copy, share, download or print path (M3-8, R5)", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/\b(?:Blob|createObjectURL|FileReader|showSaveFilePicker|clipboard|writeText|navigator\.share|window\.print|saveAs|execCommand|toBlob|toDataURL)\b/);
      expect(code(text), name).not.toMatch(/\bdownload\b|data:text|data:application/);
      // Serialising is allowed only where a dataset is hashed; no other file turns data into text.
      if (name !== "features/signals/links/dataset.ts") expect(code(text), name).not.toMatch(/\bJSON\.stringify\b/);
    }
  });

  it("never reads a raw Quotient probability or an Untrusted value outside the shared paths", () => {
    for (const { name, text } of sources) {
      expect(code(text), name).not.toMatch(/\bqYesRaw\b/);
      expect(code(text), name).not.toMatch(/\.untrusted\b/);
    }
  });

  it("imports no payment, signing or wallet module", () => {
    for (const { name, text } of sources) {
      for (const match of code(text).matchAll(/from\s+["']([^"']+)["']/g)) {
        const specifier = match[1] ?? "";
        expect(specifier, name).not.toMatch(/(?:^|\/)(?:payment|signer|signing|signature|hmac|wallet|relay|bridge)(?:\/|$|\.)/i);
        // The shared SDK's pure modules (sdk/README.md) are allowed; they hold no payment, signing or wallet code.
        const allowed = specifier.startsWith(".") || /^(?:react|zod\/v4|viem|vitest)$/.test(specifier) || /^@sdk\/(?:rules|hash|model|category|links\/dataset)$/.test(specifier);
        expect(allowed, `${name} imports ${specifier}`).toBe(true);
      }
    }
  });
});

describe("words for every reason the Quotient client can give", () => {
  const FALLBACK = "A reason this screen has no words for. The check failed.";

  it("has words for every gate reason the client writes", () => {
    const orientation = readFileSync(join(here, "quotient", "orientation.ts"), "utf8");
    const tokens = new Set<string>();
    for (const match of orientation.matchAll(/fail\(\s*"[a-z_]+"\s*,\s*"([a-z_0-9]+)"/g)) tokens.add(match[1] ?? "");
    for (const match of orientation.matchAll(/\?\s*"([a-z_0-9]+)"\s*:/g)) tokens.add(match[1] ?? "");
    for (const match of orientation.matchAll(/return fail\("[a-z_]+",\s*"([a-z_0-9]+)"\)/g)) tokens.add(match[1] ?? "");
    for (const token of ["coverage_experimental", "coverage_under_review", "coverage_research_only", "forecast_status_warning", "forecast_status_caution", "dispute_state_unknown"]) tokens.add(token);
    expect(tokens.size).toBeGreaterThan(15);
    for (const token of tokens) expect(gateReasonText(token), token).not.toBe(FALLBACK);
  });

  it("has words for every entry status, and a fixed fallback (never the raw token) for anything else", () => {
    for (const status of ENTRY_STATUSES) expect(gateReasonText(`entry_${status}`)).toContain("not eligible");
    expect(gateReasonText("entry_<img src=x>")).toBe(FALLBACK);
    expect(gateReasonText("<img src=x onerror=alert(1)>")).toBe(FALLBACK);
    expect(orientationText("<b>x</b>")).not.toContain("<b>");
  });
});

describe("figures", () => {
  it("formats exact decimals and refuses anything else as n/a", () => {
    expect(probabilityText("0.62")).toBe("62.0%");
    expect(probabilityText("0.5345")).toBe("53.4%");
    expect(probabilityText("1")).toBe("100.0%");
    expect(probabilityText("0")).toBe("0.0%");
    for (const bad of [null, "", "1.5", "-0.1", "abc", "0.1e2", "NaN", "0.62 "]) expect(probabilityText(bad), String(bad)).toBe("n/a");
    expect(pointsText("0.10")).toBe("+10.0 points");
    expect(pointsText("-0.025")).toBe("-2.5 points");
    expect(pointsText("0")).toBe("0.0 points");
    expect(pointsText("-0")).toBe("0.0 points");
    expect(pointsText("2")).toBe("n/a");
    expect(pointsText(null)).toBe("n/a");
    expect(usdLabel("0.005")).toBe("$0.005");
    expect(usdLabel("-1")).toBe("n/a");
  });
});
