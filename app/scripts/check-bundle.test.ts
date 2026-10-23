import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";

import { BUILD_TARGETS } from "../headers.config.ts";
import { buildSmoke } from "./build-lib.ts";
import { checkBundle, copyViolations, inspectDirectory } from "./check-bundle.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
afterEach(async () => {
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

const PAGE = '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="./a.js"></script></body></html>';

async function inspect(files: Record<string, string>): Promise<string[]> {
  const repo = await tempRepo();
  repos.push(repo);
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(repo.root, "dist"), { recursive: true });
    await writeFile(join(repo.root, "dist", name), text);
  }
  return (await inspectDirectory(join(repo.root, "dist"), "dist")).map((violation) => `${violation.rule}:${violation.file}`);
}

describe("check-bundle", () => {
  it("passes for the smoke fixture on both builds (W0-2: one viem, one zod)", async () => {
    expect(await checkBundle()).toEqual([]);
  });

  it("builds the shared plugin sources into the smoke bundle with exactly one copy of viem and zod", async () => {
    for (const target of BUILD_TARGETS) {
      const build = await buildSmoke({ target });
      try {
        expect(build.moduleIds.some((id) => id.includes("/src/relay/contract.ts"))).toBe(true);
        expect(build.moduleIds.some((id) => id.includes("/bridge/contract.ts"))).toBe(true);
        expect(build.moduleIds.some((id) => id.includes("/viem/"))).toBe(true);
        expect(copyViolations(target, build.moduleIds)).toEqual([]);
      } finally {
        await build.dispose();
      }
    }
  });

  it("fails when dedupe is off: the shared sources then bring a second viem and a second zod", async () => {
    const build = await buildSmoke({ dedupe: false });
    try {
      const found = copyViolations("seeded", build.moduleIds).map((violation) => `${violation.rule}:${violation.detail.split(" ")[3]}`);
      expect(found).toEqual(["duplicate-package:viem", "duplicate-package:zod"]);
    } finally {
      await build.dispose();
    }
  });

  it("reports a missing package instead of passing vacuously", () => {
    expect(copyViolations("x", ["/r/node_modules/react/index.js"]).map((violation) => violation.rule)).toEqual(["package-missing", "package-missing"]);
    expect(
      copyViolations("x", [
        "/r/app/node_modules/.pnpm/viem@2.57.2/node_modules/viem/_esm/a.js",
        "/r/node_modules/.pnpm/viem@2.57.2/node_modules/viem/_esm/a.js",
        "/r/app/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/a.js",
      ]).map((violation) => violation.rule),
    ).toEqual(["duplicate-package"]);
  });

  it("accepts a clean directory (control) and flags each seeded defect", async () => {
    expect(await inspect({ "index.html": PAGE, "a.js": 'export const u = "https://gamma-api.polymarket.com";' })).toEqual([]);
    expect(await inspect({ "index.html": PAGE, "a.js": "x", "a.js.map": "{}" })).toEqual(["source-map:dist/a.js.map"]);
    expect(await inspect({ "index.html": PAGE, "a.js": "x", "x.exe": "MZ" })).toEqual(["file-type:dist/x.exe"]);
    expect(await inspect({ "a.js": "x" })).toEqual(["no-index:dist"]);
    expect(await inspect({ "index.html": PAGE.replace("<div", "<style>a{}</style><div"), "a.js": "x" })).toEqual(["inline-style:dist/index.html"]);
    expect(await inspect({ "index.html": PAGE.replace("</body>", "<script>1</script></body>"), "a.js": "x" })).toEqual(["inline-script:dist/index.html"]);
    expect(await inspect({ "index.html": PAGE, "a.js": 'fetch("https://tracker.example.com/p")' })).toEqual(["unknown-origin:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": 'const h = "api.paybox.sh"' })).toEqual(["never-host:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": 'fetch("http://127.0.0.1:8787/x")' })).toEqual(["unknown-origin:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": 'a{background:url(https://cdn.example.com/x.png)}' })).toEqual(["unknown-origin:dist/a.js"]);
  });

  it("flags eval-like sinks but not zod's empty-body capability probe", async () => {
    expect(await inspect({ "index.html": PAGE, "a.js": 'const r = eval("1+1");' })).toEqual(["code-sink:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": 'const f = new Function("a", "return a");' })).toEqual(["code-sink:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": 'setTimeout("boom()", 1);' })).toEqual(["code-sink:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": "try{return Function(``),!0}catch{return!1}" })).toEqual([]);
  });

  it("lets through lodash's global-object probe in exactly its minified shape, and nothing like it", async () => {
    const probe = "var N=typeof global==`object`&&global&&global.Object===Object&&global,P=typeof self==`object`&&self&&self.Object===Object&&self,F=N||P||Function(`return this`)();";
    expect(await inspect({ "index.html": PAGE, "a.js": probe })).toEqual([]);
    // The same call without the self check before it, or with another body, is a sink.
    expect(await inspect({ "index.html": PAGE, "a.js": "var F=N||P||Function(`return this`)();" })).toEqual(["code-sink:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": probe.replace("return this", "return fetch") })).toEqual(["code-sink:dist/a.js"]);
    expect(await inspect({ "index.html": PAGE, "a.js": `${probe}Function(\`alert(1)\`)();` })).toEqual(["code-sink:dist/a.js"]);
  });

  it("renders and re-renders a typical tree without touching a Trusted Types sink (React 19, W0-6 as far as a DOM without Trusted Types can show)", async () => {
    const build = await buildSmoke({ target: "cockpit" });
    try {
      const code = await readFile(join(build.outDir, build.files.find((file) => file.endsWith(".js")) ?? ""), "utf8");
      const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: "outside-only", url: "http://127.0.0.1/" });
      const win = dom.window;
      // Every string-to-HTML or string-to-script sink a Trusted Types policy of 'none' would reject.
      win.eval(`
        globalThis.__sinks = [];
        const note = (name) => globalThis.__sinks.push(name);
        for (const [proto, prop] of [[Element.prototype, "innerHTML"], [Element.prototype, "outerHTML"], [ShadowRoot.prototype, "innerHTML"], [HTMLIFrameElement.prototype, "srcdoc"], [HTMLScriptElement.prototype, "text"], [HTMLScriptElement.prototype, "textContent"], [HTMLScriptElement.prototype, "src"]]) {
          const d = Object.getOwnPropertyDescriptor(proto, prop);
          if (d && d.set) Object.defineProperty(proto, prop, { ...d, set(v) { note(prop); return d.set.call(this, v); } });
        }
        for (const [obj, name] of [[Element.prototype, "insertAdjacentHTML"], [Document.prototype, "write"], [Document.prototype, "writeln"], [Range.prototype, "createContextualFragment"], [DOMParser.prototype, "parseFromString"]]) {
          const f = obj[name];
          if (typeof f === "function") obj[name] = function (...a) { note(name); return f.apply(this, a); };
        }
      `);
      // Control: the instrumentation does see a sink when one is used.
      win.eval('document.createElement("div").innerHTML = "<b>x</b>"; document.createElement("div").insertAdjacentHTML("beforeend", "<i></i>");');
      expect((win as unknown as { __sinks: string[] }).__sinks).toEqual(["innerHTML", "insertAdjacentHTML"]);
      (win as unknown as { __sinks: string[] }).__sinks.length = 0;
      win.eval(code);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const button = win.document.querySelector("button");
      expect(button?.textContent).toBe("clicked 0");
      button?.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(win.document.querySelector("button")?.textContent).toBe("clicked 1");
      expect(win.document.querySelector("svg circle")).not.toBeNull();
      expect((win as unknown as { __sinks: string[] }).__sinks).toEqual([]);
      dom.window.close();
    } finally {
      await build.dispose();
    }
  });

  it("runs the built smoke bundle in a DOM, renders, and never reaches eval or Function with a body (W0-3 without a browser)", async () => {
    const build = await buildSmoke({ target: "standalone" });
    try {
      const script = build.files.find((file) => file.endsWith(".js"));
      expect(script).toBeDefined();
      const code = await readFile(join(build.outDir, script ?? ""), "utf8");
      const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: "outside-only", url: "http://127.0.0.1/" });
      const win = dom.window;
      // Count every call to the Function constructor and to eval, as a CSP without 'unsafe-eval' would report them.
      win.eval(`
        globalThis.__codeGen = [];
        const RealFunction = Function;
        globalThis.Function = new Proxy(RealFunction, {
          apply(target, thisArg, args) { globalThis.__codeGen.push(["Function", args.map(String)]); return Reflect.apply(target, thisArg, args); },
          construct(target, args, newTarget) { globalThis.__codeGen.push(["new Function", args.map(String)]); return Reflect.construct(target, args, newTarget); },
        });
      `);
      // The bundle is an ES module; it has no imports or exports, so it runs as a classic script here.
      win.eval(code);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const text = win.document.getElementById("root")?.textContent ?? "";
      expect(text).toContain("abababababababab");
      expect(text).toContain("row 3");
      const calls = (win as unknown as { __codeGen: unknown[] }).__codeGen;
      expect(calls).toEqual([]);
      dom.window.close();
    } finally {
      await build.dispose();
    }
  });
});
