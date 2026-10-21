// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../../App";
import { allText, cleanup, click, must, render } from "../../ui/testing/dom";
import { Dock, STANDALONE_STRIP_TEXT } from "./Dock";
import { TerminalServicesProvider } from "./services";
import { PAIR_CODE, fakeServices, flush, installReadTools, scriptedDaemon, until } from "./test-support";

// The terminal has no route any more: it is the dock in the shell's footer, on every page of the Cockpit build
// (main.tsx passes it to the App's `dock` slot). These tests mount the App the way main.tsx does, with no screens,
// and check what the footer holds in each build.

afterEach(cleanup);

describe("the dock in the shell", () => {
  it("in the Cockpit build the footer holds the dock: a strip with the pairing words, and the terminal once it is opened", async () => {
    const daemon = scriptedDaemon();
    installReadTools(daemon);
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const location = memoryLocation({ path: "/" });
    const view = render(
      <TerminalServicesProvider services={services}>
        <App loaders={{}} mode="cockpit" locationHook={location.hook} clock={{ now: timers.clock }} dock={<Dock services={services} />} />
      </TerminalServicesProvider>,
    );
    await until(() => allText(view.container.querySelector("footer") ?? document.createElement("div")).includes("paired · read and prepare, never submit"));
    const footer = must<HTMLElement>(view.container, "footer.ui-dock");
    // Collapsed: the panel is hidden and no stream is open.
    expect(must<HTMLElement>(footer, ".dock-panel").hidden).toBe(true);
    expect(daemon.paths()).not.toContain("/ui/events");
    click(must(footer, "button[aria-expanded]"));
    await until(() => !must<HTMLElement>(footer, ".dock-panel").hidden && footer.querySelector("input.terminal-input") !== null);
    expect([...footer.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual(["Terminal", "Prepare", "Observer", "Inbox"]);
    // The page's one h1 stays the screen's; the dock adds none, and there is no navigation bar to list it in.
    expect(view.container.querySelectorAll("h1")).toHaveLength(1);
    expect(view.container.querySelector("nav")).toBeNull();
    await until(() => daemon.paths().includes("/ui/events"));
  });

  it("in the standalone build the footer says there is no daemon, and asks nothing of one", async () => {
    const daemon = scriptedDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const location = memoryLocation({ path: "/" });
    const view = render(
      <TerminalServicesProvider services={services}>
        <App loaders={{}} mode="standalone" locationHook={location.hook} clock={{ now: timers.clock }} dock={<Dock services={services} />} />
      </TerminalServicesProvider>,
    );
    await flush(10);
    const footer = must<HTMLElement>(view.container, "footer.ui-dock");
    expect(allText(footer)).toContain(STANDALONE_STRIP_TEXT);
    expect(footer.querySelector("button")).toBeNull();
    expect(footer.querySelector("input")).toBeNull();
    expect(allText(footer)).not.toContain("needs the Cockpit");
    expect(daemon.raw.calls).toHaveLength(0);
  });
});
