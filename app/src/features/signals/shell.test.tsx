// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import type { Loader } from "../../ui/routes";
import { runAxe } from "../../ui/testing/axe";
import { cleanup, click, must, render } from "../../ui/testing/dom";
import { ExplorerServicesProvider } from "../explorer/services";
import { fakeEntry, fakeServices, summary } from "../explorer/test-support";
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

// There is no Signals route: the Quotient settings dialog opens from the Markets surface. The real home route file is
// loaded the way the shell's glob loads it.
const loaders: Record<string, Loader> = { "./routes/home.tsx": () => import("../../routes/home") };

async function mountApp(mode: "standalone" | "cockpit") {
  const rig = makeRig({ mode, routes: {} });
  const explorer = fakeServices([fakeEntry("polymarket", { pages: [[summary("polymarket", "p1", { title: "Poly one" })]] })], { mode });
  const location = memoryLocation({ path: "/" });
  const rendered = render(
    <ExplorerServicesProvider services={explorer}>
      <SignalsServicesProvider services={rig.services}>
        <App loaders={loaders} mode={mode} locationHook={location.hook} clock={{ now: () => rig.clock.now }} />
      </SignalsServicesProvider>
    </ExplorerServicesProvider>,
  );
  await until(() => rendered.container.querySelector("tbody tr") !== null);
  return { ...rendered, rig };
}

function buttonWith(root: ParentNode, pattern: RegExp): HTMLButtonElement {
  const found = [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => pattern.test(b.textContent ?? ""));
  if (found === undefined) throw new Error(`no button ${String(pattern)}`);
  return found;
}

describe("the Quotient settings dialog inside the shell", () => {
  it("opens from the Signals view of the surface, under the one h1, with the switch off, in both builds", async () => {
    for (const mode of ["standalone", "cockpit"] as const) {
      const { container, rig } = await mountApp(mode);
      expect(container.querySelectorAll("h1")).toHaveLength(1);
      expect(must(container, "h1").textContent).toBe("Markets");
      expect(container.querySelector("nav")).toBeNull();
      click(must(container, ".ui-chip[data-view='signals']"));
      click(buttonWith(must(container, "[data-view-note='signals']"), /Quotient settings/));
      const dialog = must(document.body, "[role='dialog']");
      expect(must(dialog, "h2").textContent).toBe("Quotient settings");
      expect(must(dialog, '[data-kind="signals-gate"]').getAttribute("data-code")).toBe("off");
      expect(dialog.querySelector('[data-kind="needs-cockpit"]')).toBeNull();
      // Nothing was requested from Quotient by opening the dialog.
      expect(rig.fake.calls).toHaveLength(0);
      cleanup();
    }
  });

  it("has no structural accessibility violations: off, and on with no rows asked for", async () => {
    const { container, rig } = await mountApp("standalone");
    click(must(container, ".ui-chip[data-view='signals']"));
    click(buttonWith(must(container, "[data-view-note='signals']"), /Quotient settings/));
    const dialog = must(document.body, "[role='dialog']");
    expect(await runAxe(document.body, ["region"])).toEqual([]);

    click(must(dialog, 'input[type="checkbox"]'));
    click(buttonWith(dialog, /Turn Quotient on/));
    await until(() => rig.session.getSnapshot().enabled);
    const violations = await runAxe(document.body, ["region"]);
    expect(violations.map((v) => `${v.id}: ${v.targets.join(" | ")}`)).toEqual([]);
  });
});
