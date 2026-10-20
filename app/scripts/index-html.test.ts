import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { build, mergeConfig } from "vite";

import { listFiles } from "./build-lib.ts";
import { APP_DIR } from "./lib.ts";
import { htmlViolations } from "./policy.ts";
import { baseConfig } from "./vite-base.ts";

// Inside app/ so the stub entry resolves react from app/node_modules; ignored by git (app/.gitignore).
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("index.html", () => {
  it("passes the HTML rules as written", async () => {
    expect(htmlViolations("app/index.html", await readFile(join(APP_DIR, "index.html"), "utf8"))).toEqual([]);
  });

  it("builds into a page with one external module script, with the real Vite config, from a stub entry", async () => {
    // The real entry (src/main.tsx) belongs to the shell stream; a stub stands in so this test never writes there.
    const base = await mkdtemp(join(APP_DIR, "scripts", "fixtures", ".tmp-"));
    dirs.push(base);
    const root = join(base, "site");
    await mkdir(join(root, "src"), { recursive: true });
    await cp(join(APP_DIR, "index.html"), join(root, "index.html"));
    await writeFile(join(root, "src", "main.tsx"), 'import { createRoot } from "react-dom/client";\ncreateRoot(document.getElementById("root") as HTMLElement).render(<p>hello</p>);\n');
    const outDir = join(base, "out");
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await build(mergeConfig(baseConfig({ mode: "standalone" }), { configFile: false, root, logLevel: "silent", build: { outDir, emptyOutDir: true } }));
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
    const files = await listFiles(outDir);
    expect(files).toContain("index.html");
    expect(files.filter((file) => file.endsWith(".js")).length).toBe(1);
    expect(files.some((file) => file.endsWith(".map"))).toBe(false);
    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toMatch(/<script type="module" crossorigin src="\.\/assets\/[^"]+\.js"><\/script>/);
    expect(htmlViolations("out/index.html", html)).toEqual([]);
  });
});
