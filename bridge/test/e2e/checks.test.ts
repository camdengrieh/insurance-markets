import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

// Failing-case tests for the two check scripts this stream added (app/scripts/check-supply-chain.mjs and check-e2e-hygiene.mjs): each
// rule has a seeded tree that must trip it, and a clean tree must pass. The scripts are plain ES modules; they are loaded by URL so the
// type checker does not need declarations for them.

interface Violation {
  readonly file: string;
  readonly rule: string;
  readonly detail: string;
}
interface SupplyChain {
  checkSupplyChain(options: { appDir: string; repoRoot: string; requireInstalled?: boolean }): Promise<Violation[]>;
  lockPackageIds(lock: string): string[];
  idOfPnpmFolder(folder: string): string | null;
  MAX_LOCK_PACKAGES: number;
}
interface Hygiene {
  checkE2eHygiene(options: { roots: string[]; repoRoot: string }): Promise<Violation[]>;
}

let supply: SupplyChain;
let hygiene: Hygiene;
let scratch: string;
let counter = 0;

before(async () => {
  supply = (await import(new URL("../../../app/scripts/check-supply-chain.mjs", import.meta.url).href)) as SupplyChain;
  hygiene = (await import(new URL("../../../app/scripts/check-e2e-hygiene.mjs", import.meta.url).href)) as Hygiene;
  scratch = await mkdtemp(join(tmpdir(), "cockpit-e2e-checks-"));
});
after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function put(root: string, path: string, text: string): Promise<void> {
  const full = join(root, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, text);
}

const LOCK = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true

importers:

  .:
    dependencies:
      left-pad:
        specifier: 1.3.0
        version: 1.3.0

packages:

  '@scope/tool@2.0.1':
    resolution: {integrity: sha512-aaaa}

  left-pad@1.3.0:
    resolution: {integrity: sha512-bbbb}

snapshots:

  '@scope/tool@2.0.1': {}

  left-pad@1.3.0: {}
`;

// A tree that passes: both packages installed, no scripts, the workspace files as the app has them.
async function cleanTree(): Promise<{ repo: string; app: string }> {
  counter += 1;
  const repo = join(scratch, `tree-${counter}`);
  const app = join(repo, "app");
  await put(app, "package.json", JSON.stringify({ name: "x", scripts: { dev: "vite", build: "vite build" }, dependencies: { "left-pad": "1.3.0" } }));
  await put(app, "pnpm-workspace.yaml", 'packages:\n  - "."\nminimumReleaseAge: 20160\nblockExoticSubdeps: true\ntrustPolicy: no-downgrade\nallowBuilds: {}\n');
  await put(app, "pnpm-lock.yaml", LOCK);
  await put(app, "scripts/dependencies.json", JSON.stringify({ transitiveInstallScripts: { note: "n", "fsevents@2.3.3": "documented" } }));
  await put(app, ".gitignore", "node_modules/\n.playwright-browsers/\ntest-results/\n");
  await put(repo, "pnpm-workspace.yaml", "packages:\n  - app\nminimumReleaseAge: 20160\n");
  await put(app, "node_modules/.pnpm/@scope+tool@2.0.1/node_modules/@scope/tool/package.json", JSON.stringify({ name: "@scope/tool", version: "2.0.1" }));
  await put(app, "node_modules/.pnpm/left-pad@1.3.0/node_modules/left-pad/package.json", JSON.stringify({ name: "left-pad", version: "1.3.0", scripts: { test: "x" } }));
  return { repo, app };
}

async function rules(tree: { repo: string; app: string }, requireInstalled = true): Promise<string[]> {
  return (await supply.checkSupplyChain({ appDir: tree.app, repoRoot: tree.repo, requireInstalled })).map((violation) => violation.rule);
}

describe("check-supply-chain", () => {
  it("passes a clean tree", async () => {
    assert.deepEqual(await rules(await cleanTree()), []);
  });

  it("reads the lockfile and the pnpm folder names the way pnpm writes them", () => {
    assert.deepEqual(supply.lockPackageIds(LOCK), ["@scope/tool@2.0.1", "left-pad@1.3.0"]);
    assert.equal(supply.idOfPnpmFolder("@axe-core+playwright@4.13.0_playwright-core@1.63.0"), "@axe-core/playwright@4.13.0");
    assert.equal(supply.idOfPnpmFolder("viem@2.57.2_typescript@5.9.3_zod@4.4.3"), "viem@2.57.2");
    assert.equal(supply.idOfPnpmFolder("node_modules"), null);
  });

  it("fails an installed package with a postinstall (or install, or preinstall) script", async () => {
    for (const script of ["postinstall", "install", "preinstall"]) {
      const tree = await cleanTree();
      await put(tree.app, "node_modules/.pnpm/left-pad@1.3.0/node_modules/left-pad/package.json", JSON.stringify({ name: "left-pad", version: "1.3.0", scripts: { [script]: "node steal.js" } }));
      assert.ok((await rules(tree)).includes("install-script"), script);
    }
  });

  it("allows an install script only when dependencies.json documents that exact version", async () => {
    const tree = await cleanTree();
    await put(tree.app, "node_modules/.pnpm/fsevents@2.3.3/node_modules/fsevents/package.json", JSON.stringify({ name: "fsevents", version: "2.3.3", scripts: { install: "node-gyp rebuild" } }));
    await put(tree.app, "pnpm-lock.yaml", LOCK.replace("  left-pad@1.3.0:\n    resolution", "  fsevents@2.3.3:\n    resolution: {integrity: sha512-cccc}\n\n  left-pad@1.3.0:\n    resolution"));
    assert.deepEqual(await rules(tree), []);
    await put(tree.app, "scripts/dependencies.json", JSON.stringify({ transitiveInstallScripts: { note: "n" } }));
    assert.ok((await rules(tree)).includes("install-script"));
  });

  it("fails a native build hidden in binding.gyp", async () => {
    const tree = await cleanTree();
    await put(tree.app, "node_modules/.pnpm/left-pad@1.3.0/node_modules/left-pad/binding.gyp", "{}");
    assert.ok((await rules(tree)).includes("native-build"));
  });

  it("fails a package that is installed but not in the lockfile, and a folder whose package.json says something else", async () => {
    const extra = await cleanTree();
    await put(extra.app, "node_modules/.pnpm/evil-pkg@1.0.0/node_modules/evil-pkg/package.json", JSON.stringify({ name: "evil-pkg", version: "1.0.0" }));
    assert.ok((await rules(extra)).includes("unlocked-package"));
    const swapped = await cleanTree();
    await put(swapped.app, "node_modules/.pnpm/left-pad@1.3.0/node_modules/left-pad/package.json", JSON.stringify({ name: "right-pad", version: "9.9.9" }));
    assert.ok((await rules(swapped)).includes("identity-mismatch"));
  });

  it("fails when nothing is installed and installation is required, and is silent when it is not required", async () => {
    const tree = await cleanTree();
    await rm(join(tree.app, "node_modules"), { recursive: true, force: true });
    assert.ok((await rules(tree, true)).includes("not-installed"));
    assert.deepEqual(await rules(tree, false), []);
  });

  it("fails a lifecycle script, or an install-shaping field, in app/package.json", async () => {
    const scripts = await cleanTree();
    await put(scripts.app, "package.json", JSON.stringify({ name: "x", scripts: { postinstall: "node x.js" } }));
    assert.ok((await rules(scripts)).includes("lifecycle-script"));
    for (const field of ["overrides", "resolutions", "patchedDependencies", "pnpm", "optionalDependencies"]) {
      const tree = await cleanTree();
      await put(tree.app, "package.json", JSON.stringify({ name: "x", [field]: { "left-pad": "9.9.9" } }));
      assert.ok((await rules(tree)).includes("install-shaping-field"), field);
    }
  });

  it("fails an install hook file and an .npmrc that re-enables scripts, adds a registry or carries a token", async () => {
    const hook = await cleanTree();
    await put(hook.app, ".pnpmfile.cjs", "module.exports = {};");
    assert.ok((await rules(hook)).includes("install-hook"));
    for (const [text, rule] of [
      ["ignore-scripts=false\n", "scripts-enabled"],
      ["registry=https://registry.example.net/\n", "other-registry"],
      ["//registry.npmjs.org/:_authToken=abc\n", "credential"],
      ["unsafe-perm=true\n", "script-setting"],
    ] as const) {
      const tree = await cleanTree();
      await put(tree.app, ".npmrc", text);
      assert.ok((await rules(tree)).includes(rule), text);
    }
    const fine = await cleanTree();
    await put(fine.app, ".npmrc", "# comment\nignore-scripts=true\nregistry=https://registry.npmjs.org/\n");
    assert.deepEqual(await rules(fine), []);
  });

  it("fails a workspace setting that widens an install, and a missing or short release-age gate at the root", async () => {
    for (const extra of ["overrides:\n  left-pad: 9.9.9\n", "patchedDependencies:\n  left-pad: patches/x.patch\n", "minimumReleaseAgeExclude:\n  - left-pad\n", "onlyBuiltDependencies:\n  - left-pad\n", "dangerouslyAllowAllBuilds: true\n"]) {
      const tree = await cleanTree();
      await put(tree.app, "pnpm-workspace.yaml", `packages:\n  - "."\nminimumReleaseAge: 20160\nblockExoticSubdeps: true\ntrustPolicy: no-downgrade\nallowBuilds: {}\n${extra}`);
      assert.ok((await rules(tree)).includes("unknown-setting"), extra);
    }
    const extraPackage = await cleanTree();
    await put(extraPackage.app, "pnpm-workspace.yaml", 'packages:\n  - "."\n  - ../elsewhere\nminimumReleaseAge: 20160\nblockExoticSubdeps: true\ntrustPolicy: no-downgrade\nallowBuilds: {}\n');
    assert.ok((await rules(extraPackage)).includes("extra-workspace-package"));
    const noAge = await cleanTree();
    await put(noAge.repo, "pnpm-workspace.yaml", "packages:\n  - app\n");
    assert.ok((await rules(noAge)).includes("root-release-age"));
    const shortAge = await cleanTree();
    await put(shortAge.repo, "pnpm-workspace.yaml", "packages:\n  - app\nminimumReleaseAge: 1440\n");
    assert.ok((await rules(shortAge)).includes("root-release-age"));
    const excluded = await cleanTree();
    await put(excluded.repo, "pnpm-workspace.yaml", "packages:\n  - app\nminimumReleaseAge: 20160\nminimumReleaseAgeExclude:\n  - left-pad\n");
    assert.ok((await rules(excluded)).includes("root-release-age-exclusion"));
  });

  it("fails lockfile growth past the ceiling, a non-registry version and an unreadable lockfile", async () => {
    const grown = await cleanTree();
    const many = Array.from({ length: supply.MAX_LOCK_PACKAGES + 1 }, (_, index) => `  pkg-${index}@1.0.0:\n    resolution: {integrity: sha512-x}\n`).join("\n");
    await put(grown.app, "pnpm-lock.yaml", `lockfileVersion: '9.0'\n\nimporters:\n\n  .:\n    dependencies: {}\n\npackages:\n\n${many}\nsnapshots:\n`);
    assert.ok((await rules(grown, false)).includes("lockfile-growth"));
    const exotic = await cleanTree();
    await put(exotic.app, "pnpm-lock.yaml", LOCK.replace("left-pad@1.3.0:\n    resolution", "left-pad@github:someone/left-pad:\n    resolution"));
    const exoticRules = await rules(exotic, false);
    assert.ok(exoticRules.includes("unparsed") || exoticRules.includes("non-registry-version") || exoticRules.includes("unlocked-package"));
    const empty = await cleanTree();
    await put(empty.app, "pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    assert.ok((await rules(empty, false)).includes("unparsed"));
  });

  it("fails when browsers or test results are not gitignored", async () => {
    const tree = await cleanTree();
    await put(tree.app, ".gitignore", "node_modules/\n");
    const found = await rules(tree);
    assert.ok(found.includes("browsers-not-ignored"));
    assert.ok(found.includes("results-not-ignored"));
  });

  it("passes on this repository's own app", async () => {
    const repo = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
    const found = await supply.checkSupplyChain({ appDir: join(repo, "app"), repoRoot: repo, requireInstalled: false });
    assert.deepEqual(found, []);
  });
});

describe("check-e2e-hygiene", () => {
  async function scan(files: Record<string, string>): Promise<string[]> {
    counter += 1;
    const repo = join(scratch, `hygiene-${counter}`);
    for (const [path, text] of Object.entries(files)) await put(repo, path, text);
    const found = await hygiene.checkE2eHygiene({ roots: [join(repo, "app", "e2e")], repoRoot: repo });
    return found.map((violation) => violation.rule);
  }
  const file = (text: string): Record<string, string> => ({ "app/e2e/x.spec.ts": text });

  it("passes loopback, reserved names, listed venue hosts and ordinary code", async () => {
    assert.deepEqual(
      await scan(file(`const a = "http://127.0.0.1:1234/"; const b = "http://rebind.test:80"; const c = "https://api-mainnet.xo.market/api"; const d = /x/.exec("x");`)),
      [],
    );
  });

  it("fails a foreign host", async () => {
    assert.deepEqual(await scan(file(`await fetch("https://api.some-venue.io/markets");`)), ["foreign-host"]);
    assert.deepEqual(await scan(file(`const url = "http://169.254.169.254/latest";`)), ["foreign-host"]);
  });

  it("fails every way of using a real browser profile or weakening the page", async () => {
    for (const [code, rule] of [
      [`launch({ channel: "chrome" })`, "system-browser"],
      [`newContext({ bypassCSP: true })`, "bypass-csp"],
      [`newContext({ ignoreHTTPSErrors: true })`, "ignore-https-errors"],
      [`newContext({ storageState: "state.json" })`, "browser-profile"],
      [`chromium.launchPersistentContext(dir)`, "browser-profile"],
      [`chromium.connectOverCDP(url)`, "browser-profile"],
    ] as const) {
      assert.ok((await scan(file(code))).includes(rule), code);
    }
  });

  it("fails .only and a hidden failure outside the pinned places", async () => {
    assert.ok((await scan(file(`test.only("x", () => {});`))).includes("only"));
    assert.ok((await scan(file(`test.fixme(true, "later");`))).includes("hidden-failure"));
    assert.ok((await scan(file(`test.fail(true, "later");`))).includes("hidden-failure"));
    assert.ok((await scan(file(`test.skip(true, "later");`))).includes("hidden-failure"));
    assert.deepEqual(await scan({ "app/e2e/a11y.spec.ts": `test.fail(true, "K3");` }), []);
  });

  it("fails a home path, a user name from the environment, an email address and shelling out", async () => {
    assert.ok((await scan(file(`const p = "${["", "Users", "someone", "project"].join("/")}";`))).includes("home-path"));
    assert.ok((await scan(file(`const p = process.env.HOME;`))).includes("home-path"));
    assert.ok((await scan(file(`import { homedir } from "node:os"; homedir();`))).includes("home-path"));
    assert.ok((await scan(file(`const who = "someone@company.io";`))).includes("email"));
    assert.ok((await scan(file(`execSync("rm -rf x");`))).includes("shell-out"));
    assert.deepEqual(await scan(file(`const u = "user@example.org"; spawn(process.execPath, []);`)), []);
  });

  it("fails a User-Agent other than the two fixed ones", async () => {
    assert.ok((await scan(file(`headers: { "user-agent": "my-name-here/1.0" }`))).includes("user-agent"));
    assert.deepEqual(await scan(file(`headers: { "user-agent": "insurance-markets-research/0.1" }`)), []);
  });

  it("fails when there is nothing to scan", async () => {
    counter += 1;
    const repo = join(scratch, `hygiene-${counter}`);
    await mkdir(join(repo, "app", "e2e"), { recursive: true });
    assert.deepEqual((await hygiene.checkE2eHygiene({ roots: [join(repo, "app", "e2e")], repoRoot: repo })).map((violation) => violation.rule), ["vacuous"]);
  });

  it("passes this repository's own suites", async () => {
    const repo = join(dirname(new URL(import.meta.url).pathname), "..", "..", "..");
    const found = await hygiene.checkE2eHygiene({ roots: [join(repo, "app", "e2e"), join(repo, "bridge", "test", "e2e")], repoRoot: repo });
    assert.deepEqual(found, []);
  });
});
