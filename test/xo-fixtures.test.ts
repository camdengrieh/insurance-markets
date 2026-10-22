import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { XO_FIXTURE_DIRECTORY } from "./fixtures/xo/load.js";

// Guards the recorded XO fixtures: every file is accounted for in MANIFEST.json, every file is a recording of the
// venue (nothing hand-written or synthetic is allowed), and none of them carries a third-party wallet, an email
// address or a profile picture URL.

const dir = XO_FIXTURE_DIRECTORY;
const files = readdirSync(dir).filter((name) => name.endsWith(".json") && name !== "MANIFEST.json");
const manifest = JSON.parse(readFileSync(new URL("MANIFEST.json", dir), "utf8")) as Record<string, { source: string; note: string }>;

// Addresses that legitimately appear: the docs' sample address and XO's published contracts.
const ALLOWED_ADDRESSES = new Set([
  "0xcafe000000000000000000000000000000000a11",
  "0xe1654812ac8896a69efa3b6aa71090e4b44eb307",
  "0xccf1b2c676e2f9a13e5674be0e0ddff6d0b13909",
  "0x80c12230ce677e6f304027a14780edd2a829ab0c",
]);

describe("XO fixtures", () => {
  it("lists every fixture in the manifest with a known source, and nothing else", () => {
    assert.deepEqual(Object.keys(manifest).sort(), [...files].sort());
    for (const [name, entry] of Object.entries(manifest)) {
      // live-get-trimmed: a live GET with third-party identities, links and free text removed (the note says what).
      assert.ok(["research-copy", "live-get", "live-get-trimmed", "live-observed"].includes(entry.source), `${name}: ${entry.source}`);
    }
  });

  it("is valid JSON, and no fixture is synthetic or hand-written", () => {
    for (const name of files) {
      JSON.parse(readFileSync(new URL(name, dir), "utf8"));
      assert.equal(/synthetic|placeholder|hand-written/i.test(name), false, name);
      assert.equal(/synthetic|placeholder|hand-written/i.test(manifest[name]?.note ?? ""), false, name);
      if (manifest[name]?.source === "live-get" || manifest[name]?.source === "live-observed") assert.ok(name.startsWith("live-"), name);
    }
  });

  it("holds no third-party wallet, email address or profile image URL", () => {
    for (const name of files) {
      const text = readFileSync(new URL(name, dir), "utf8");
      for (const match of text.match(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g) ?? []) {
        assert.ok(ALLOWED_ADDRESSES.has(match.toLowerCase()), `${name} contains ${match}`);
      }
      assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text), false, `${name} contains an email-like string`);
      assert.equal(/twimg|profile_images/.test(text), false, `${name} contains a profile image URL`);
    }
  });
});
