import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { JSDOM } from "jsdom";
import { build, mergeConfig, type InlineConfig } from "vite";
import { describe, expect, it } from "vitest";

type BuildTarget = "standalone" | "cockpit";
const BUILD_TARGETS: readonly BuildTarget[] = ["standalone", "cockpit"];

// scripts/vite-base.ts is Node tooling that imports with .ts extensions, which this folder's tsconfig does not
// allow, so it is loaded at run time through a computed specifier instead of a static import.
async function loadBaseConfig(): Promise<(options: { readonly mode: string }) => InlineConfig> {
  const module = (await import(new URL("../../scripts/vite-base.ts", import.meta.url).href)) as { baseConfig: (options: { readonly mode: string }) => InlineConfig };
  return module.baseConfig;
}

// The REAL production bundle (index.html + src/main.tsx, both targets) run in a DOM, as far as a DOM without
// Chromium can show W0-3 and M0-3: the shell boots, takes the pairing fragment out of the address bar, renders,
// navigates and switches theme without reaching a string-to-HTML sink or the Function constructor / eval,
// which the CSP (require-trusted-types-for 'script', no 'unsafe-eval') would report as violations.
// A real browser run belongs to the e2e suite. jsdom has no Trusted Types and cannot load ES module chunks, so
// if a build splits route chunks that the entry imports statically, this test says so instead of guessing.

const CODE = "0123456789abcdef0123456789abcdef";

const INSTRUMENT = `
  globalThis.__sinks = [];
  globalThis.__codeGen = [];
  const note = (name) => globalThis.__sinks.push(name);
  for (const [proto, prop] of [[Element.prototype, "innerHTML"], [Element.prototype, "outerHTML"], [HTMLIFrameElement.prototype, "srcdoc"], [HTMLScriptElement.prototype, "text"], [HTMLScriptElement.prototype, "textContent"], [HTMLScriptElement.prototype, "src"]]) {
    const d = Object.getOwnPropertyDescriptor(proto, prop);
    if (d && d.set) Object.defineProperty(proto, prop, { ...d, set(v) { note(prop); return d.set.call(this, v); } });
  }
  for (const [obj, name] of [[Element.prototype, "insertAdjacentHTML"], [Document.prototype, "write"], [Document.prototype, "writeln"], [Range.prototype, "createContextualFragment"], [DOMParser.prototype, "parseFromString"]]) {
    const f = obj[name];
    if (typeof f === "function") obj[name] = function (...a) { note(name); return f.apply(this, a); };
  }
  const RealFunction = Function;
  globalThis.Function = new Proxy(RealFunction, {
    apply(target, thisArg, args) { globalThis.__codeGen.push(["Function", args.map(String)]); return Reflect.apply(target, thisArg, args); },
    construct(target, args, newTarget) { globalThis.__codeGen.push(["new Function", args.map(String)]); return Reflect.construct(target, args, newTarget); },
  });
`;

interface Probe {
  __sinks: string[];
  __codeGen: unknown[];
}

// Same as scripts/build-lib.ts buildApp, plus `mode`: `vite build --mode standalone` sets import.meta.env.MODE,
// which the shell reads to tell the two builds apart, and buildApp does not pass it (it would build "production").
async function buildReal(target: BuildTarget): Promise<{ readonly outDir: string; readonly dispose: () => Promise<void> }> {
  const baseConfig = await loadBaseConfig();
  const outDir = await mkdtemp(join(tmpdir(), "xo-app-shell-"));
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await build(mergeConfig(baseConfig({ mode: target }), { configFile: false, mode: target, logLevel: "silent", build: { outDir, emptyOutDir: true } }));
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
  return { outDir, dispose: () => rm(outDir, { recursive: true, force: true }) };
}

async function entryScript(outDir: string): Promise<string> {
  const html = await readFile(join(outDir, "index.html"), "utf8");
  const match = /<script[^>]+src="\.\/(assets\/[^"]+\.js)"/.exec(html);
  expect(match?.[1], "index.html references one module script").toBeDefined();
  return readFile(join(outDir, match?.[1] ?? ""), "utf8");
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

for (const target of BUILD_TARGETS) {
  describe(`the built ${target} app in a DOM`, () => {
    it("boots, strips the pairing fragment, renders, navigates and switches theme with no HTML or code sink", async (context) => {
      const built = await buildReal(target);
      try {
        const code = await entryScript(built.outDir);
        const staticImport = /^\s*import\s*(?:[\w*{][^;]*?from\s*)?["']\.\//m.test(code);
        if (staticImport) {
          // Reported as a skip with its reason, never as a pass: the e2e suite covers this case in a real browser.
          context.skip("the entry chunk statically imports sibling chunks, which jsdom cannot run");
          return;
        }
        const dom = new JSDOM('<!doctype html><html lang="en"><body><div id="root"></div></body></html>', { runScripts: "outside-only", url: `http://127.0.0.1/#pair=${CODE}` });
        const win = dom.window;
        win.eval(INSTRUMENT);
        const probe = win as unknown as Probe;
        // Control: the instrumentation sees a sink when one is used.
        win.eval('document.createElement("div").innerHTML = "<b>x</b>"; new Function("return 1");');
        expect(probe.__sinks).toEqual(["innerHTML"]);
        expect(probe.__codeGen.length).toBe(1);
        probe.__sinks.length = 0;
        probe.__codeGen.length = 0;

        win.eval(code);
        await wait(80);

        // M1-4: the fragment is gone from the address bar, and the URL holds no trace of it.
        expect(win.location.hash).toBe("");
        expect(win.location.href).not.toContain(CODE);

        const doc = win.document;
        expect(doc.querySelectorAll("h1").length).toBe(1);
        // "/" is the Overview while no route claims it and the Markets surface once routes/home.tsx does.
        expect(["Overview", "Markets"]).toContain(doc.querySelector("h1")?.textContent);
        // There is no navigation bar: the brand links to the start, the chips and modals do the rest.
        expect(doc.querySelector("nav")).toBeNull();
        expect(doc.querySelector("header a.ui-brand")).not.toBeNull();
        expect(doc.querySelector("header input[type='search']")).not.toBeNull();
        expect(doc.querySelector("main#main")).not.toBeNull();
        expect(doc.querySelector("footer.ui-dock")).not.toBeNull();
        expect(doc.querySelector("svg.ui-dither-defs pattern#d4")).not.toBeNull();
        expect(doc.querySelector("[style]")).toBeNull();
        expect(doc.querySelector("header")?.textContent).toContain(target === "standalone" ? "Standalone explorer" : "Local Cockpit");
        // The stylesheet names the vendored faces and the build emitted them as files next to it.
        const css = await readFile(join(built.outDir, "assets", (await readdir(join(built.outDir, "assets"))).find((name) => name.endsWith(".css")) ?? ""), "utf8");
        expect(css).toContain('font-family:"Archivo"');
        expect(css).toContain('font-family:"Martian Mono"');
        expect(css).not.toMatch(/url\(["']?data:/);
        const assets = await readdir(join(built.outDir, "assets"));
        expect(assets.filter((name) => name.endsWith(".woff2")).length).toBe(6);

        win.location.hash = "#/nowhere";
        await wait(50);
        expect(doc.querySelector("h1")?.textContent).toBe("Page not found");
        expect(doc.title).toContain("Not found");

        const select = doc.querySelector("select") as HTMLSelectElement;
        select.value = "dark";
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
        await wait(20);
        expect(doc.documentElement.getAttribute("data-theme")).toBe("dark");

        expect(probe.__sinks).toEqual([]);
        expect(probe.__codeGen).toEqual([]);
        dom.window.close();
      } finally {
        await built.dispose();
      }
    });
  });
}
