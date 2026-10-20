import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// SHA-256 values from https://developer.paybox.sh/plugin-starter/v1.0.2/manifest.json. The
// starter says to replace tooling files together and never mix releases, so these files must
// stay byte-identical until a whole new release is adopted on purpose.
const STARTER_HASHES: Readonly<Record<string, string>> = {
  "scripts/conformance.mjs": "c562913acfce45ab56ef18678420e4ebadec351a72059d3d96d37cea7c744445",
  "scripts/test.mjs": "6cbccaacd119bd5c4833d4ab7831da8fa43bd0929f3b54f4d0e1ac3f425b4656",
  "scripts/process.mjs": "097a0e57b10ce5ae7fb3a796c85b4960572cd3394378c3a406370a221fb177e6",
  "scripts/report.mjs": "23b07a80b78549e6310df1a419cdab4d08b9bb6d09e1a33fc823daceb87b6226",
  "scripts/schema.mjs": "22d76374e6c4ef0dca0615f418c477dd67151f6e3e09b316c75a5a9c91b26bfa",
  "src/paybox.ts": "65608cd3253131c24ba0993b1988f0794b6e1ae4aa9ee988e2317178a69058ca",
  "pnpm-workspace.yaml": "dad6d0d0c2a58fce70bb566123424ef6c566169cdaacee163c3059d66a2a006e",
  "starter-version.json": "4ecd2912a07c08fb345c8b0d028194103fafe071f8ec3c32b683ebc56d435811",
  "tsconfig.json": "0eeb98e5e27493fddec3d7a290cb26e2f2b1c9e5312445be812b37c8f7705b10",
};

// Local additions the project made on purpose after the verbatim starter text. The starter part (everything before
// the marker) must still hash to the manifest value; what follows the marker is ours. pnpm-workspace.yaml gains the
// 14-day release-age rule (dapp-design A6), which the starter does not carry.
const LOCAL_TAIL_MARKERS: Readonly<Record<string, string>> = {
  "pnpm-workspace.yaml": "\n# Supply-chain rule",
};

const root = fileURLToPath(new URL("../", import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Returns the paths whose content differs from the expected hash; a missing file counts as a
// mismatch so deleting a verbatim file cannot pass silently.
function findMismatches(
  files: ReadonlyMap<string, Uint8Array>,
  expected: Readonly<Record<string, string>>,
): string[] {
  return Object.entries(expected)
    .filter(([path, hash]) => {
      const bytes = files.get(path);
      return bytes === undefined || sha256(bytes) !== hash;
    })
    .map(([path]) => path);
}

// Exact semver only: no ranges, tags, wildcards, git or file specifiers.
function isExactPin(spec: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(spec);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown, label: string): Record<string, string> {
  assert.ok(isRecord(value), `${label} must be an object`);
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    assert.equal(typeof entry, "string", `${label}.${key} must be a string`);
    out[key] = String(entry);
  }
  return out;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(`${root}${path}`, "utf8")) as unknown;
}

// The bytes of the starter part of a file: the whole file, or everything before its documented local tail.
function withoutLocalTail(path: string, bytes: Uint8Array): Uint8Array {
  const marker = LOCAL_TAIL_MARKERS[path];
  if (marker === undefined) return bytes;
  const text = new TextDecoder().decode(bytes);
  const at = text.indexOf(marker);
  return at === -1 ? bytes : new TextEncoder().encode(text.slice(0, at));
}

describe("starter files stay verbatim", () => {
  it("matches the 1.0.2 manifest hashes", async () => {
    const files = new Map<string, Uint8Array>();
    for (const path of Object.keys(STARTER_HASHES)) files.set(path, withoutLocalTail(path, await readFile(`${root}${path}`)));
    assert.deepEqual(findMismatches(files, STARTER_HASHES), []);
  });

  it("keeps the local release-age rule in pnpm-workspace.yaml", async () => {
    const text = await readFile(`${root}pnpm-workspace.yaml`, "utf8");
    assert.match(text, /^minimumReleaseAge: 20160$/m);
  });

  it("rejects a starter part that was edited before the local tail", () => {
    const edited = new TextEncoder().encode('packages:\n  - "."\n\nallowBuilds:\n  esbuild: false\n\n# Supply-chain rule\nminimumReleaseAge: 20160\n');
    const cut = withoutLocalTail("pnpm-workspace.yaml", edited);
    assert.deepEqual(findMismatches(new Map([["pnpm-workspace.yaml", cut]]), { "pnpm-workspace.yaml": STARTER_HASHES["pnpm-workspace.yaml"] ?? "" }), ["pnpm-workspace.yaml"]);
  });

  it("rejects an edited file", () => {
    const files = new Map<string, Uint8Array>([["src/paybox.ts", new TextEncoder().encode("export {};\n")]]);
    assert.deepEqual(findMismatches(files, { "src/paybox.ts": STARTER_HASHES["src/paybox.ts"] ?? "" }), ["src/paybox.ts"]);
  });

  it("rejects a missing file", () => {
    assert.deepEqual(findMismatches(new Map(), { "scripts/test.mjs": STARTER_HASHES["scripts/test.mjs"] ?? "" }), ["scripts/test.mjs"]);
  });
});

describe("package pins", () => {
  it("pins every dependency exactly", async () => {
    const pkg = await readJson("package.json");
    assert.ok(isRecord(pkg));
    for (const section of ["dependencies", "devDependencies"] as const) {
      for (const [name, spec] of Object.entries(stringMap(pkg[section], section))) {
        assert.ok(isExactPin(spec), `${section}.${name} must be an exact version, got ${spec}`);
      }
    }
  });

  it("rejects ranges, tags and non-registry specifiers", () => {
    for (const spec of ["^1.2.3", "~1.2.3", "1.x", "*", "latest", ">=1.0.0", "1.2", "git+https://example.invalid/x.git", "file:../x", "1.2.3-beta.1"]) {
      assert.equal(isExactPin(spec), false, spec);
    }
    assert.equal(isExactPin("2.57.2"), true);
  });

  it("agrees with starter-version.json on the pnpm version", async () => {
    const pkg = await readJson("package.json");
    const release = await readJson("starter-version.json");
    assert.ok(isRecord(pkg) && isRecord(release));
    assert.equal(pkg["packageManager"], `pnpm@${String(release["pnpm"])}`);
    assert.ok(isRecord(pkg["engines"]));
    assert.equal(pkg["engines"]["pnpm"], release["pnpm"]);
  });
});
