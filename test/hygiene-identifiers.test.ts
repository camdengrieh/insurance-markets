import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";

// Pre-commit check for personal identifiers (sec-03). A hit means a name, handle, organisation,
// home directory or session scratch path is about to be committed. The identifiers themselves are
// built from pieces so that this file does not contain them.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HANDLE = ["cam", "den", "grieh"].join("");
const FIRST_NAME = ["cam", "den"].join("");
const ORGANISATION = ["3stu", "dio"].join("");

interface Rule {
  readonly name: string;
  readonly pattern: RegExp;
}

// Safe to apply to anything, including the built bundle.
const PERSONAL: readonly Rule[] = [
  { name: "GitHub handle or username", pattern: new RegExp(HANDLE, "i") },
  { name: "first name", pattern: new RegExp(FIRST_NAME, "i") },
  { name: "organisation or e-mail domain", pattern: new RegExp(ORGANISATION, "i") },
  { name: "session scratch path", pattern: /claude-\d{2,}/ },
  { name: "temporary session directory", pattern: /\/private\/tmp\// },
];

// Machine paths. A synthetic /Users/example/... fixture is fine; /home/ is only checked in our own files.
const PATHS: readonly Rule[] = [{ name: "home directory path", pattern: /\/(?:Users|home)\/(?!example\b)[A-Za-z][\w.-]*\// }];

// The repository slug in docs/plan.md was committed before this check existed and is already in
// the git remote. Nothing else may carry the handle.
const KNOWN_SLUG = new RegExp(`${HANDLE}/insurance-markets`, "g");
const EXEMPT_SLUG_FILES: ReadonlySet<string> = new Set(["docs/plan.md"]);

// Never scanned: dependencies, build output, caches, downloaded browsers, test artefacts, tool state.
const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  "dist",
  ".git",
  ".tools",
  ".claude",
  ".cache",
  "test-results",
  "playwright-report",
  ".playwright-browsers",
  ".playwright",
  "ms-playwright",
]);
const TEXT_FILE = /\.(?:md|ts|mjs|js|json|py|sh|yaml|yml|txt|toml|csv)$|^(?:NOTICE|\.gitignore|\.gitattributes|\.editorconfig)$/;
// app/ (the static client) and bridge/ (the daemon) hold more kinds of text: components, styles, pages, manifests,
// host-header files. Those are scanned there; the third-party research fixtures elsewhere keep the narrower list.
const APP_TEXT_FILE =
  /\.(?:md|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|html|css|svg|webmanifest|map|txt|yaml|yml|toml|sh|py|csv|headers)$|^(?:NOTICE|LICENSE|_headers|\.gitignore|\.gitattributes|\.editorconfig|\.npmrc|\.env\.example)$/;
const APP_ROOTS: readonly string[] = ["app", "bridge"];
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_BINARY_BYTES = 16 * 1024 * 1024;

interface Files {
  readonly text: string[];
  // Files that are not text: images, fonts, archives, Python bytecode. Scanned as bytes.
  readonly binary: string[];
}

function isAppPath(root: string, path: string): boolean {
  const first = relative(root, path).split(sep)[0] ?? "";
  return APP_ROOTS.includes(first);
}

// Everything the scan covers under `root`, split into text and binary. Binary means: any file under app/ or
// bridge/ that is not text, and Python bytecode anywhere.
function collect(root: string): Files {
  const text: string[] = [];
  const binary: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(path);
      } else if (entry.isFile()) {
        const app = isAppPath(root, path);
        if (TEXT_FILE.test(entry.name) || (app && APP_TEXT_FILE.test(entry.name))) {
          if (statSync(path).size <= MAX_BYTES) text.push(path);
        } else if (app || /\.py[co]$/.test(entry.name)) {
          binary.push(path);
        }
      }
    }
  };
  visit(root);
  return { text, binary };
}

function* walk(directory: string): Generator<string> {
  yield* collect(directory).text;
}

// Paths git would commit (tracked, or untracked and not ignored). null when git cannot say.
function committable(): ReadonlySet<string> | null {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 || typeof result.stdout !== "string") return null;
  return new Set(result.stdout.split("\0").filter((name) => name !== ""));
}

function scan(path: string, rules: readonly Rule[]): string[] {
  const relativePath = relative(ROOT, path);
  let text = readFileSync(path, "utf8");
  if (EXEMPT_SLUG_FILES.has(relativePath)) text = text.replace(KNOWN_SLUG, "");
  const hits: string[] = [];
  text.split("\n").forEach((line, index) => {
    for (const rule of rules) {
      if (rule.pattern.test(line)) hits.push(`${relativePath}:${index + 1} (${rule.name})`);
    }
  });
  return hits;
}

// Bytes of a non-text file. A gzip is opened first (a compressed handle would not match). Python bytecode is
// reported even without a match: it embeds the absolute path of the source it came from, and the repository
// ignores it, so one that is not ignored means that rule was lost.
function scanBinary(name: string, bytes: Buffer, rules: readonly Rule[]): string[] {
  const hits: string[] = [];
  if (/\.py[co]$/.test(name)) hits.push(`${name} (python bytecode embeds absolute paths and must not be committed)`);
  let content = bytes;
  if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      content = gunzipSync(bytes, { maxOutputLength: MAX_BINARY_BYTES });
    } catch {
      hits.push(`${name} (a gzip that cannot be opened to check)`);
    }
  }
  const body = content.toString("latin1");
  for (const rule of rules) if (rule.pattern.test(body)) hits.push(`${name} (${rule.name})`);
  return hits;
}

describe("personal identifiers stay out of everything that can be committed", () => {
  it("finds none in the docs, source, tests, scripts and root files", () => {
    const hits = [...walk(ROOT)].flatMap((path) => scan(path, [...PERSONAL, ...PATHS]));
    assert.deepEqual(hits, [], `personal identifiers found:\n${hits.join("\n")}`);
  });

  it("finds none in app/ and bridge/ (text files, and the bytes of images, fonts, archives and bytecode), excluding dependencies, build output and caches", () => {
    const files = collect(ROOT);
    const appText = files.text.filter((path) => isAppPath(ROOT, path));
    const hits = appText.flatMap((path) => scan(path, [...PERSONAL, ...PATHS]));
    // Binary files count only if git would commit them; a local, ignored one (a download, a cache) is not a leak.
    const wanted = committable();
    const binary = files.binary.filter((path) => wanted === null || wanted.has(relative(ROOT, path).split(sep).join("/")));
    for (const path of binary) {
      if (statSync(path).size > MAX_BINARY_BYTES) {
        hits.push(`${relative(ROOT, path)} (a binary over ${MAX_BINARY_BYTES} bytes cannot be checked)`);
        continue;
      }
      hits.push(...scanBinary(relative(ROOT, path), readFileSync(path), [...PERSONAL, ...PATHS]));
    }
    assert.deepEqual(hits, [], `personal identifiers found:\n${hits.join("\n")}`);
  });

  it("finds no Python bytecode that git would commit, anywhere in the repository", () => {
    const wanted = committable();
    const found = collect(ROOT).binary.filter((path) => /\.py[co]$/.test(path) && (wanted === null || wanted.has(relative(ROOT, path).split(sep).join("/"))));
    assert.deepEqual(found.map((path) => relative(ROOT, path)), []);
  });

  it("finds none in the built bundles", () => {
    for (const name of ["plugin.mjs", "local.mjs"]) {
      const bundle = join(ROOT, "dist", name);
      if (!existsSync(bundle)) continue;
      assert.deepEqual(scan(bundle, PERSONAL), [], name);
    }
  });

  it("would catch each kind of identifier (the check itself works)", () => {
    const hit = (rule: Rule, text: string): boolean => rule.pattern.test(text);
    const [handle, first, org, scratch, tmp] = PERSONAL as [Rule, Rule, Rule, Rule, Rule];
    const [path] = PATHS as [Rule];
    // Samples are assembled from pieces so this file stays clean under its own scan.
    const slash = "/";
    assert.equal(hit(handle, `github.com/${HANDLE}/x`), true);
    assert.equal(hit(first, `by ${FIRST_NAME[0]?.toUpperCase()}${FIRST_NAME.slice(1)}`), true);
    assert.equal(hit(org, `${ORGANISATION.toUpperCase()}Tech`), true);
    assert.equal(hit(scratch, ["", "x", "claude" + "-501", "y"].join(slash)), true);
    assert.equal(hit(tmp, ["", "private", "tmp", "anything"].join(slash)), true);
    assert.equal(hit(path, ["", "Users", "someone", "Documents", "x"].join(slash)), true);
    assert.equal(hit(path, ["", "home", "someone", "x"].join(slash)), true);
    assert.equal(hit(path, ["", "Users", "example", "Documents-Local", "project"].join(slash)), false);
    assert.equal(hit(path, "GET /api/users/portfolio"), false);
    assert.equal(hit(handle, "an ordinary sentence"), false);
  });

  describe("the app/ and bridge/ scan itself works", () => {
    const made: string[] = [];
    after(() => {
      for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    function tree(files: Record<string, string | Buffer>): string {
      const root = mkdtempSync(join(tmpdir(), "hygiene-tree-"));
      made.push(root);
      for (const [name, content] of Object.entries(files)) {
        const path = join(root, name);
        mkdirSync(join(path, ".."), { recursive: true });
        writeFileSync(path, content);
      }
      return root;
    }

    it("covers every kind of text file under app/ and bridge/ and skips dependencies, build output and caches", () => {
      const root = tree({
        "app/src/main.tsx": "x",
        "app/src/styles.css": "x",
        "app/index.html": "x",
        "app/public/icon.svg": "x",
        "app/public/site.webmanifest": "x",
        "app/public/_headers": "x",
        "app/vercel.json": "x",
        "bridge/main.ts": "x",
        "bridge/test/a.test.ts": "x",
        "app/node_modules/dep/index.js": "x",
        "app/dist/assets/index.js": "x",
        "app/.cache/vite/deps.json": "x",
        "app/.playwright-browsers/chromium/notes.txt": "x",
        "app/test-results/trace.json": "x",
        "bridge/node_modules/dep/index.js": "x",
        "bridge/dist/main.js": "x",
        "elsewhere/page.html": "x",
        "elsewhere/component.tsx": "x",
      });
      const names = collect(root).text.map((path) => relative(root, path).split(sep).join("/")).sort();
      assert.deepEqual(names, [
        "app/index.html",
        "app/public/_headers",
        "app/public/icon.svg",
        "app/public/site.webmanifest",
        "app/src/main.tsx",
        "app/src/styles.css",
        "app/vercel.json",
        "bridge/main.ts",
        "bridge/test/a.test.ts",
      ]);
    });

    it("sees binary files under app/ and bridge/ and Python bytecode anywhere, but not inside skipped directories", () => {
      const root = tree({
        "app/public/logo.png": Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        "app/public/font.woff2": Buffer.from([1, 2, 3]),
        "bridge/data.bin": Buffer.from([1]),
        "docs/research/scripts/__pycache__/tool.cpython-313.pyc": Buffer.from([1]),
        "app/node_modules/x/logo.png": Buffer.from([1]),
        "app/dist/logo.png": Buffer.from([1]),
        "elsewhere/picture.png": Buffer.from([1]),
      });
      const names = collect(root).binary.map((path) => relative(root, path).split(sep).join("/")).sort();
      assert.deepEqual(names, ["app/public/font.woff2", "app/public/logo.png", "bridge/data.bin", "docs/research/scripts/__pycache__/tool.cpython-313.pyc"]);
    });

    it("finds an identifier in a text file under app/ and in the bytes of a binary, a bytecode file and a gzip", () => {
      const home = ["", "Users", "someone", "Documents", "project", "x.py"].join("/");
      const root = tree({
        "app/src/leak.tsx": `// by ${HANDLE}\n`,
        "app/public/logo.png": Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.from(`Author\0${FIRST_NAME}`, "latin1")]),
        "bridge/cache/module.pyc": Buffer.from(`\0\0${home}\0`, "latin1"),
        "app/public/data.json.gz": gzipSync(Buffer.from(`{"owner":"${HANDLE}"}`)),
        "app/public/clean.png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
        "app/public/clean.json.gz": gzipSync(Buffer.from('{"fine":true}')),
      });
      const rules = [...PERSONAL, ...PATHS];
      const files = collect(root);
      const textHits = files.text.flatMap((path) => scan(path, rules));
      assert.ok(textHits.length >= 1 && textHits.every((hit) => hit.includes("leak.tsx:1")), textHits.join());
      assert.match(textHits.join(), /GitHub handle/);
      const byName = (name: string): string[] => scanBinary(name, readFileSync(join(root, name)), rules);
      assert.match(byName("app/public/logo.png").join(), /first name/);
      assert.match(byName("bridge/cache/module.pyc").join(), /python bytecode/);
      assert.match(byName("bridge/cache/module.pyc").join(), /home directory path/);
      assert.match(byName("app/public/data.json.gz").join(), /GitHub handle/);
      assert.deepEqual(byName("app/public/clean.png"), []);
      assert.deepEqual(byName("app/public/clean.json.gz"), []);
      assert.match(scanBinary("a.gz", Buffer.from([0x1f, 0x8b, 0x00, 0x01]), rules).join(), /cannot be opened/);
    });
  });

  it("only the repository slug in docs/plan.md is exempt", () => {
    assert.deepEqual([...EXEMPT_SLUG_FILES], ["docs/plan.md"]);
    const plan = readFileSync(join(ROOT, "docs", "plan.md"), "utf8").replace(KNOWN_SLUG, "");
    assert.equal(new RegExp(HANDLE, "i").test(plan), false);
  });
});
