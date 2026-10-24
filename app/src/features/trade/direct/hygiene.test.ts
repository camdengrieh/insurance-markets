import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The direct path is the one place in the page that sends a wallet's signature to a venue (the trade desk's other
// files prepare and never send; ../hygiene.test.ts holds them to that). These rules keep it small and auditable:
//   - one network door: the browser's fetch is named only in services.tsx, which hands it to the venue port (http.ts);
//   - one storage: sessionStorage, named only in services.tsx; never localStorage, IndexedDB, cookies or the clipboard;
//   - nothing logged, no string-to-HTML or string-to-code sink, no URL typed into the source (origins come from the
//     registry the CSP is built from);
//   - the screens never touch the credential (no apiKey, secret or passphrase in a .tsx file), and a venue's or a
//     wallet's words reach the screen only through the untrusted slot.

const HERE = dirname(fileURLToPath(import.meta.url));
const TEST_ONLY = /(?:\.test\.tsx?|testkit\.ts)$/;

function files(): Array<{ readonly name: string; readonly text: string }> {
  const out: Array<{ name: string; text: string }> = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !TEST_ONLY.test(entry.name)) out.push({ name: relative(HERE, full), text: readFileSync(full, "utf8") });
    }
  };
  walk(HERE);
  return out;
}

function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ALL = files();

describe("the direct path's source", () => {
  it("scans the files it should", () => {
    const names = ALL.map((file) => file.name);
    for (const expected of ["index.ts", "types.ts", "http.ts", "credentials.ts", "services.tsx", "kit.ts", "routes.ts", "wallet.ts", "TradeTicket.tsx", "polymarket/executor.ts", "polymarket/l2.ts", "polymarket/api.ts", "polymarket/relayer.ts", "polymarket/batch.ts", "polymarket/activation.ts", "polymarket/bridge.ts", "limitless/executor.ts", "limitless/relay.ts", "limitless/activation.ts", "xo/venue.ts"]) expect(names).toContain(expected);
  });

  it("holds no Limitless API token: the page signs no Limitless request and asks for no pasted credential", () => {
    const names = ALL.map((file) => file.name);
    for (const gone of ["limitless/hmac.ts", "limitless/token.ts", "limitless/words.ts", "limitless/LimitlessTicket.tsx"]) expect(names).not.toContain(gone);
    for (const { name, text } of ALL) {
      const source = code(text);
      expect(source, name).not.toMatch(/lmts-(?:api-key|signature|timestamp)/);
      expect(source, name).not.toMatch(/\bpaste\b/i);
    }
  });

  it("names the browser's fetch and sessionStorage in services.tsx only, and never another store", () => {
    for (const { name, text } of ALL) {
      const source = code(text);
      expect(source, name).not.toMatch(/\b(?:localStorage|indexedDB|document\.cookie|clipboard|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/);
      // The wiring points: services.tsx (the page's fetch for every executor, and for the XO relay client); for XO,
      // its credential store (the tab's sessionStorage) too; each takes fakes in tests.
      if (name === "services.tsx" || name === "xo/credentials.ts") continue;
      expect(source, name).not.toMatch(/\bsessionStorage\b/);
      expect(source, name).not.toMatch(/(?:globalThis|window)\.fetch\b|(?<![.\w#])fetch\s*\(/);
    }
  });

  it("logs nothing, has no HTML or code sink and types no URL", () => {
    for (const { name, text } of ALL) {
      const source = code(text);
      expect(source, name).not.toMatch(/\bconsole\.|\bdebugger\b/);
      expect(source, name).not.toMatch(/\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|eval|new Function)\b/);
      expect(source, name).not.toMatch(/https?:\/\//);
    }
  });

  it("keeps the credential out of the screens and a stranger's words in the untrusted slot", () => {
    for (const { name, text } of ALL.filter((file) => file.name.endsWith(".tsx"))) {
      // Module paths ("./credentials") are not a use of the credential.
      const source = code(text).replace(/from\s+"[^"]*"/g, "");
      expect(source, name).not.toMatch(/\b(?:apiKey|secret|passphrase|credentials)\b/);
      // A venue's or a wallet's words are never a bare JSX child.
      expect(source, name).not.toMatch(/\{\s*[\w.?!]*(?:venueText|reason|outcome|signer\.name|order\.status)\s*\}/);
    }
  });
});
