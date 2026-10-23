import { afterEach, describe, expect, it } from "vitest";

import { checkBoundaries } from "./check-boundaries.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

async function repoWith(files: Record<string, string>): Promise<TempRepo> {
  const repo = await tempRepo(files);
  repos.push(repo);
  return repo;
}

async function rules(files: Record<string, string>): Promise<string[]> {
  const repo = await repoWith(files);
  return (await checkBoundaries({ repoRoot: repo.root })).map((violation) => `${violation.rule}:${violation.file}`);
}

describe("check-boundaries", () => {
  it("passes on the real tree", async () => {
    expect(await checkBoundaries()).toEqual([]);
  });

  it("accepts a clean bundled file that uses allowlisted shared sources (control)", async () => {
    expect(
      await rules({
        "app/src/main.ts": 'import { digestTag } from "@shared/relay/contract";\nimport { x } from "./a.js";\nexport const y = [digestTag, x];\n',
        "app/src/a.ts": "export const x = 1;\n",
        "src/relay/contract.ts": 'import { z } from "zod/v4";\nexport const digestTag = z;\n',
      }),
    ).toEqual([]);
  });

  it("fails a bundled file that imports a Node module (W0-4)", async () => {
    expect(await rules({ "app/src/main.ts": 'import { readFileSync } from "node:fs";\nexport const a = readFileSync;\n' })).toEqual(["node-builtin:app/src/main.ts"]);
    expect(await rules({ "app/src/main.ts": 'import { join } from "path";\nexport const a = join;\n' })).toEqual(["node-builtin:app/src/main.ts"]);
    expect(await rules({ "app/src/main.ts": 'export const a = import("node:crypto");\n' })).toEqual(["node-builtin:app/src/main.ts"]);
  });

  it("fails imports of relay/, src/local, src/tools, the HMAC signer and the audit writer", async () => {
    const files = {
      "relay/server.ts": "export const s = 1;\n",
      "src/local/cli.ts": "export const c = 1;\n",
      "src/tools/read.ts": "export const t = 1;\n",
      "src/xo/signing/hmac.ts": "export const h = 1;\n",
      "src/guardrails/audit.ts": "export const a = 1;\n",
    };
    for (const spec of ["../../relay/server.js", "@shared/../relay/server.js", "../../src/local/cli.js", "@shared/tools/read.js", "@shared/xo/signing/hmac.js", "@shared/guardrails/audit.js"]) {
      const found = await rules({ ...files, "app/src/main.ts": `import { v } from "${spec}";\nexport const x = v;\n` });
      expect(found.some((entry) => entry.startsWith("forbidden-import:app/src/main.ts")), spec).toBe(true);
    }
  });

  it("allows the pure sdk to the bundle but never sdk/node, by alias, by relative path or through an sdk file", async () => {
    const files = {
      "sdk/trade/clean.ts": "export const c = 1;\n",
      "sdk/trade/leaky.ts": 'import { h } from "../node/trade/xo/hmac.js";\nexport const l = h;\n',
      "sdk/node/trade/xo/hmac.ts": 'import { createHmac } from "node:crypto";\nexport const h = createHmac;\n',
    };
    expect(await rules({ ...files, "app/src/main.ts": 'import { c } from "@sdk/trade/clean";\nexport const x = c;\n' })).toEqual([]);
    expect(await rules({ ...files, "app/src/main.ts": 'import { h } from "@sdk/node/trade/xo/hmac";\nexport const x = h;\n' })).toEqual(["forbidden-import:app/src/main.ts"]);
    expect(await rules({ ...files, "app/src/main.ts": 'import { h } from "../../sdk/node/trade/xo/hmac.js";\nexport const x = h;\n' })).toEqual(["forbidden-import:app/src/main.ts"]);
    expect(await rules({ ...files, "app/src/main.ts": 'import { l } from "@sdk/trade/leaky";\nexport const x = l;\n' })).toEqual(["forbidden-import:sdk/trade/leaky.ts"]);
    // A test is not bundled, but it may not reach the credentialed signers either.
    expect(await rules({ ...files, "app/src/main.ts": "export const x = 1;\n", "app/src/a.test.ts": 'import { h } from "@sdk/node/trade/xo/hmac";\nexport const t = h;\n' })).toEqual(["forbidden-import:app/src/a.test.ts"]);
  });

  it("lets only the XO HMAC parity tests import the Node XO signer, and nothing else from sdk/node", async () => {
    const files = {
      "app/src/main.ts": "export const x = 1;\n",
      "sdk/node/trade/xo/hmac.ts": 'import { createHmac } from "node:crypto";\nexport const h = createHmac;\n',
      "sdk/node/trade/clob/polymarket/l2.ts": "export const p = 1;\n",
    };
    const parity = "app/src/features/trade/direct/xo/hmac.test.ts";
    expect(await rules({ ...files, [parity]: 'import { h } from "@sdk/node/trade/xo/hmac";\nexport const t = h;\n' })).toEqual([]);
    expect(await rules({ ...files, "app/src/features/trade/direct/xo/other.test.ts": 'import { h } from "@sdk/node/trade/xo/hmac";\nexport const t = h;\n' })).toEqual(["forbidden-import:app/src/features/trade/direct/xo/other.test.ts"]);
    // The page's own folder never may.
    expect(await rules({ ...files, "app/src/features/trade/direct/xo/hmac.ts": 'import { h } from "@sdk/node/trade/xo/hmac";\nexport const t = h;\n' })).toEqual(["forbidden-import:app/src/features/trade/direct/xo/hmac.ts"]);
  });

  it("lets only the Limitless HMAC parity test import the Node Limitless signer", async () => {
    const files = { "app/src/main.ts": "export const x = 1;\n", "sdk/node/trade/clob/limitless/hmac.ts": 'import { createHmac } from "node:crypto";\nexport const h = createHmac;\n' };
    const importer = 'import { h } from "@sdk/node/trade/clob/limitless/hmac";\nexport const t = h;\n';
    expect(await rules({ ...files, "app/src/features/trade/direct/limitless/hmac.test.ts": importer })).toEqual([]);
    expect(await rules({ ...files, "app/src/features/trade/direct/limitless/executor.test.ts": importer })).toEqual(["forbidden-import:app/src/features/trade/direct/limitless/executor.test.ts"]);
    expect(await rules({ ...files, "app/src/features/trade/direct/limitless/hmac.ts": importer })).toEqual(["forbidden-import:app/src/features/trade/direct/limitless/hmac.ts"]);
  });

  it("lets a parity test, and only a test, import the Node Polymarket L2 signer", async () => {
    const files = { "sdk/node/trade/clob/polymarket/l2.ts": 'import { createHmac } from "node:crypto";\nexport const l2 = createHmac;\n' };
    expect(await rules({ ...files, "app/src/main.ts": "export const x = 1;\n", "app/src/l2.test.ts": 'import { l2 } from "@sdk/node/trade/clob/polymarket/l2";\nexport const t = l2;\n' })).toEqual([]);
    expect(await rules({ ...files, "app/src/main.ts": 'import { l2 } from "@sdk/node/trade/clob/polymarket/l2";\nexport const x = l2;\n' })).toEqual(["forbidden-import:app/src/main.ts"]);
  });

  it("fails an import outside app/ that is not on the shared allowlist", async () => {
    const found = await rules({
      "src/other.ts": "export const o = 1;\n",
      "app/src/main.ts": 'import { o } from "../../src/other.js";\nexport const x = o;\n',
    });
    expect(found).toEqual(["not-allowlisted:app/src/main.ts"]);
  });

  it("follows the import closure: an allowlisted shared file that itself imports node:* fails", async () => {
    const found = await rules({
      "src/xo/helper.ts": 'import { createHash } from "node:crypto";\nexport const h = createHash;\n',
      "app/src/main.ts": 'import { h } from "@shared/xo/helper";\nexport const x = h;\n',
    });
    expect(found).toEqual(["node-builtin:src/xo/helper.ts"]);
  });

  it("keeps the daemon's internals out of the bundle but allows bridge/contract.ts", async () => {
    const ok = await rules({
      "bridge/contract.ts": "export const c = 1;\n",
      "app/src/main.ts": 'import { c } from "@bridge/contract";\nexport const x = c;\n',
    });
    expect(ok).toEqual([]);
    const bad = await rules({
      "bridge/server.ts": "export const s = 1;\n",
      "app/src/main.ts": 'import { s } from "@bridge/server";\nexport const x = s;\n',
    });
    expect(bad).toEqual(["forbidden-import:app/src/main.ts"]);
  });

  it("lets tests and e2e use Node but not relay/", async () => {
    const ok = await rules({
      "app/src/main.ts": "export const x = 1;\n",
      "app/src/a.test.ts": 'import { readFileSync } from "node:fs";\nexport const r = readFileSync;\n',
      "app/e2e/flow.spec.ts": 'import { spawn } from "node:child_process";\nexport const s = spawn;\n',
    });
    expect(ok).toEqual([]);
    const bad = await rules({
      "relay/server.ts": "export const s = 1;\n",
      "app/src/main.ts": "export const x = 1;\n",
      "app/e2e/flow.spec.ts": 'import { s } from "../../relay/server.js";\nexport const r = s;\n',
    });
    expect(bad).toEqual(["forbidden-import:app/e2e/flow.spec.ts"]);
  });

  it("fails plugin, relay and test code that imports app/ or the daemon", async () => {
    const found = await rules({
      "app/src/x.ts": "export const x = 1;\n",
      "app/headers.config.ts": "export const h = 1;\n",
      "bridge/main.ts": "export const m = 1;\n",
      "src/a.ts": 'import { x } from "../app/src/x.js";\nexport const a = x;\n',
      "relay/b.ts": 'import { m } from "../bridge/main.js";\nexport const b = m;\n',
      "src/plugin.ts": 'import { m } from "../bridge/main.js";\nexport const p = m;\n',
      "src/local/cli.ts": 'export const load = () => import("../../bridge/main.js");\n',
      "test/c.test.ts": 'import { h } from "../app/headers.config.js";\nexport const c = h;\n',
    });
    expect(found.sort()).toEqual(["reverse-import:relay/b.ts", "reverse-import:src/a.ts", "reverse-import:src/plugin.ts", "reverse-import:test/c.test.ts"]);
  });

  it("lets the daemon import app/headers.config only", async () => {
    const found = await rules({
      "app/headers.config.ts": "export const h = 1;\n",
      "app/src/x.ts": "export const x = 1;\n",
      "bridge/contract.ts": 'import { h } from "../app/headers.config.js";\nexport const c = h;\n',
      "bridge/server.ts": 'import { x } from "../app/src/x.js";\nexport const s = x;\n',
    });
    expect(found).toEqual(["reverse-import:bridge/server.ts"]);
  });
});
