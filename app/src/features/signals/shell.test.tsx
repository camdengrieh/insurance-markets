// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import type { Loader } from "../../ui/routes";
import { runAxe } from "../../ui/testing/axe";
import { cleanup, click, must, render } from "../../ui/testing/dom";
import { SignalsServicesProvider } from "./services";
import { makeRig, until } from "./test-support";

afterEach(cleanup);

let axeSource = "";
beforeAll(() => {
  const fromApp = createRequire(import.meta.url);
  const playwrightEntry = fromApp.resolve("@axe-core/playwright");
  axeSource = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library; app source itself never does this.
  new Function(axeSource).call(window);
});

// The real route file, loaded the way the shell's glob loads it.
const loaders: Record<string, Loader> = { "./routes/signals.tsx": () => import("../../routes/signals") };

async function mountApp(mode: "standalone" | "cockpit") {
  const rig = makeRig({ mode, routes: {} });
  const location = memoryLocation({ path: "/signals" });
  const rendered = render(
    <SignalsServicesProvider services={rig.services}>
      <App loaders={loaders} mode={mode} locationHook={location.hook} clock={{ now: () => rig.clock.now }} />
    </SignalsServicesProvider>,
  );
  await until(() => rendered.container.querySelector('[data-kind="signals-gate"]') !== null);
  return { ...rendered, rig };
}

function buttonWith(root: ParentNode, pattern: RegExp): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => pattern.test(b.textContent ?? ""));
  if (found === undefined) throw new Error(`no button ${String(pattern)}`);
  return found;
}

describe("the Signals route inside the shell", () => {
  it("adds Signals to the navigation, owns the single h1, and works in both builds", async () => {
    for (const mode of ["standalone", "cockpit"] as const) {
      const { container } = await mountApp(mode);
      expect([...container.querySelectorAll("nav a")].map((a) => a.textContent)).toContain("Signals");
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(must(container, "h1").textContent).toBe("Signals");
      expect(document.title).toBe("Signals · XO Cockpit");
      expect(container.querySelector('[data-kind="needs-cockpit"]')).toBeNull();
      expect(must(container, '[data-kind="signals-gate"]').getAttribute("data-code")).toBe("off");
      cleanup();
    }
  });

  it("has no structural accessibility violations: off, and on with no rows asked for", async () => {
    const { container, rig } = await mountApp("standalone");
    expect(await runAxe(container)).toEqual([]);

    click(must(container, 'input[type="checkbox"]'));
    click(buttonWith(container, /Turn Quotient on/));
    await until(() => rig.session.getSnapshot().enabled);
    const violations = await runAxe(container);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
