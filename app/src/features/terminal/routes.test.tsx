// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import { allText, cleanup, must, render } from "../../ui/testing/dom";
import { resolveRoutes, type Loader } from "../../ui/routes";
import { TerminalServicesProvider } from "./services";
import { PAIR_CODE, fakeServices, flush, installReadTools, scriptedDaemon, until } from "./test-support";

afterEach(cleanup);

const loaders: Record<string, Loader> = { "./routes/terminal.tsx": () => import("../../routes/terminal") };

describe("the terminal route file", () => {
  it("has valid metadata, a fixed title and needs the Cockpit", async () => {
    const resolved = await resolveRoutes(loaders);
    expect(resolved).toHaveLength(1);
    const entry = resolved[0];
    expect(entry?.status).toBe("ok");
    if (entry?.status !== "ok") return;
    expect(entry.meta).toMatchObject({ id: "terminal", path: "/terminal", title: "Terminal", availability: "cockpit" });
    expect(entry.meta.nav).toEqual({ label: "Terminal", order: 50 });
  });

  it("is a screen of the Cockpit build under a fixed h1, listed in the navigation", async () => {
    const daemon = scriptedDaemon();
    installReadTools(daemon);
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const location = memoryLocation({ path: "/terminal" });
    const view = render(
      <TerminalServicesProvider services={services}>
        <App loaders={loaders} mode="cockpit" locationHook={location.hook} clock={{ now: timers.clock }} />
      </TerminalServicesProvider>,
    );
    await until(() => view.container.querySelector("input.terminal-input") !== null);
    expect(must(view.container, "h1").textContent).toBe("Terminal");
    expect([...view.container.querySelectorAll("nav a")].map((a) => a.textContent)).toEqual(["Overview", "Terminal"]);
    expect(document.title).toBe("Terminal · XO Cockpit");
    expect(view.container.querySelectorAll("h1")).toHaveLength(1);
  });

  it("in the standalone build the shell shows the needs-the-Cockpit tile and never mounts the screen or asks a daemon", async () => {
    const daemon = scriptedDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const location = memoryLocation({ path: "/terminal" });
    const view = render(
      <TerminalServicesProvider services={services}>
        <App loaders={loaders} mode="standalone" locationHook={location.hook} clock={{ now: timers.clock }} />
      </TerminalServicesProvider>,
    );
    await flush(10);
    expect(view.container.querySelector('[data-kind="needs-cockpit"]')).not.toBeNull();
    expect(allText(view.container)).toContain("needs the Cockpit");
    expect(view.container.querySelector("input.terminal-input")).toBeNull();
    expect(daemon.raw.calls).toHaveLength(0);
  });
});
