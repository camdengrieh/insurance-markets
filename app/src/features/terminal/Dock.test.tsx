// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

import type { PageSessionState } from "../../session";
import { act, allText, cleanup, click, must } from "../../ui/testing/dom";
import { runAxe } from "../../ui/testing/axe";
import { NOW_MS, deployItem, isoSecond, recordOf } from "../signing/testkit";
import { NOT_WATCHING_TEXT, STANDALONE_STRIP_TEXT, pairingWords } from "./Dock";
import { PAIR_REASON_TEXT } from "./session";
import { LiveStream, PAIR_CODE, TOKEN, fakeServices, flush, frame, inboxBody, installReadTools, jsonReply, memoryStorage, mountDock, scriptedDaemon, until, type Daemon } from "./test-support";

// The dock: the footer strip and the panel it expands into. What these tests pin down:
//   - the one event stream of the page opens only while the dock is expanded and the page is paired, and closes
//     when the dock is collapsed (one connection per token, nothing in the background);
//   - the strip's words and numbers come from the daemon or the relay, or say they are not known;
//   - the item count opens the Signature Card as a modal over the page;
//   - the standalone build has a strip and nothing else, and asks nothing of a daemon.

beforeAll(() => {
  const require = createRequire(import.meta.url);
  const playwrightEntry = require.resolve("@axe-core/playwright");
  // Test-only evaluation of a pinned, locally installed library; app source never does this.
  new Function(readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8")).call(window);
});

afterEach(cleanup);

function strip(container: HTMLElement): HTMLElement {
  return must<HTMLElement>(container, "[data-dock]");
}

function toggle(container: HTMLElement): HTMLButtonElement {
  return must<HTMLButtonElement>(container, "button[aria-expanded]");
}

function panel(container: HTMLElement): HTMLElement {
  return must<HTMLElement>(container, ".dock-panel");
}

function openDaemon(options: { readonly records?: unknown[]; readonly setup?: (daemon: Daemon) => void } = {}): { daemon: Daemon; stream: LiveStream } {
  const daemon = scriptedDaemon();
  installReadTools(daemon);
  const stream = new LiveStream();
  daemon.events = () => stream.response;
  if (options.records !== undefined) daemon.inbox = () => jsonReply(200, inboxBody(0, options.records));
  options.setup?.(daemon);
  return { daemon, stream };
}

describe("the standalone build", () => {
  it("shows one line of words, no toggle and no panel, and makes no request", async () => {
    const { daemon } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers, { expand: false, mode: "standalone" });
    await flush(4);
    expect(allText(view.container)).toBe(STANDALONE_STRIP_TEXT);
    expect(view.container.querySelector("button")).toBeNull();
    expect(view.container.querySelector(".dock-panel")).toBeNull();
    expect(daemon.raw.calls).toHaveLength(0);
  });
});

describe("expand, collapse and the stream", () => {
  it("collapsed, it pairs and says so, but opens no stream; expanded, it reads the inbox then opens the stream; collapsed again, it closes it", async () => {
    const { daemon, stream } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers, { expand: false });
    await until(() => allText(strip(view.container)).includes("paired · read and prepare, never submit"));
    expect(toggle(view.container).getAttribute("aria-expanded")).toBe("false");
    expect(panel(view.container).hidden).toBe(true);
    expect(daemon.paths()).toEqual(["/ui/pair"]);
    expect(allText(strip(view.container))).toContain(NOT_WATCHING_TEXT);

    click(toggle(view.container));
    expect(toggle(view.container).getAttribute("aria-expanded")).toBe("true");
    expect(panel(view.container).hidden).toBe(false);
    await until(() => daemon.paths().includes("/ui/events"));
    expect(daemon.paths()).toEqual(["/ui/pair", "/ui/inbox", "/ui/events"]);
    expect(daemon.paths().filter((path) => path === "/ui/events")).toHaveLength(1);
    await until(() => allText(strip(view.container)).includes("agent · live"));
    expect(allText(strip(view.container))).toContain("0 prepared items");
    expect(allText(strip(view.container))).toContain("armed: not known yet");
    expect(allText(strip(view.container))).toContain("caps: no open item reports them");
    expect(allText(strip(view.container))).toContain("last read just now");

    click(toggle(view.container));
    await flush(4);
    expect(stream.cancelled).toBe(true);
    expect(panel(view.container).hidden).toBe(true);
    expect(allText(strip(view.container))).toContain(NOT_WATCHING_TEXT);
    expect(allText(strip(view.container))).not.toContain("agent ·");
    // Collapsing closed the only stream; nothing else was asked.
    expect(daemon.paths().filter((path) => path === "/ui/events")).toHaveLength(1);
  });

  it("expanded before the pairing finishes, it waits for the token and then opens exactly one stream", async () => {
    const { daemon } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    expect(toggle(view.container).getAttribute("aria-expanded")).toBe("true");
    await until(() => daemon.paths().includes("/ui/events"));
    expect(daemon.paths().slice(0, 3)).toEqual(["/ui/pair", "/ui/inbox", "/ui/events"]);
    expect(daemon.paths().filter((path) => path === "/ui/events")).toHaveLength(1);
  });

  it("the panel holds the terminal, the prepare console, the observer pane and the inbox, under one pairing notice", async () => {
    const { daemon } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    await until(() => daemon.paths().includes("/ui/events"));
    const headings = [...panel(view.container).querySelectorAll("h2")].map((heading) => heading.textContent);
    expect(headings).toEqual(["Terminal", "Prepare", "Observer", "Inbox"]);
    expect(panel(view.container).querySelectorAll("input.terminal-input")).toHaveLength(2);
    expect(panel(view.container).querySelectorAll('[data-code="NOT_PAIRED"]')).toHaveLength(0);
    expect(allText(panel(view.container))).toContain("No prepared items");
    expect(allText(panel(view.container))).toContain("arming is done at your Cockpit");
  });
});

describe("the strip's facts come from the daemon and the relay", () => {
  const record = () => recordOf(deployItem(), { state: "prepared" });

  it("counts the open items, shows the relay's caps for the newest one, and opens its card as a modal from the count", async () => {
    const { daemon } = openDaemon({ records: [record()] });
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    await until(() => allText(strip(view.container)).includes("1 prepared item"));
    const text = allText(strip(view.container));
    expect(text).toContain("caps, as the relay states them");
    const caps = (record().prepared as { caps: { reserved_usd: string; day_remaining_usd: string } }).caps;
    expect(text).toContain(`counts ${caps.reserved_usd} USD`);
    expect(text).toContain(`${caps.day_remaining_usd} USD left today`);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    click(must(strip(view.container), 'button[data-fact="items"]'));
    await flush(4);
    const dialog = must<HTMLElement>(document.body, '[role="dialog"]');
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(allText(dialog)).toContain("Signature card");
    expect(dialog.querySelector("article.signing-card")).not.toBeNull();
    // The dock's strip is inert behind the modal; its own buttons are the way out, and closing records nothing.
    expect(view.container.closest("[inert]") ?? view.container.hasAttribute("inert")).toBeTruthy();
    const close = [...dialog.querySelectorAll("button")].find((button) => /Close the card/.test(button.textContent ?? ""));
    if (close === undefined) throw new Error("no close button");
    click(close);
    await flush(4);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const decisions = daemon.raw.calls.filter((call) => call.url === "/ui/inbox/decision").map((call) => (JSON.parse(call.init.body ?? "null") as { decision: string }).decision);
    expect(decisions).toEqual(["shown"]);
  });

  it("an ARM window from the feed shows as a countdown in the strip and the pane, and never as a control", async () => {
    const { daemon, stream } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    await until(() => daemon.paths().includes("/ui/events"));
    await act(async () => {
      stream.push(frame(1, { id: 1, at: isoSecond(NOW_MS), type: "posture", posture: "ARMED", armed_until: isoSecond(NOW_MS + 90_000) }));
    });
    await until(() => allText(strip(view.container)).includes("armed: yes"));
    expect(allText(strip(view.container))).toMatch(/armed: yes · 01:(29|30) left/);
    const pane = must<HTMLElement>(view.container, ".terminal-observer");
    expect(allText(pane)).toContain("ARM window");
    expect(pane.querySelector(".ui-dither-bar")).not.toBeNull();
    expect(pane.querySelector("button, input, select")).toBeNull();
    const labels = [...view.container.querySelectorAll("button")].map((button) => button.textContent ?? "");
    expect(labels.some((label) => /\barm\b/i.test(label))).toBe(false);
  });

  it("an armed posture whose window end is missing says so, never 'armed: no'; before any posture it says not known", async () => {
    const { daemon, stream } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    await until(() => daemon.paths().includes("/ui/events"));
    await until(() => allText(strip(view.container)).includes("agent · live"));
    // The inbox read carries no posture: the strip says the fact is not known rather than asserting "no".
    expect(allText(strip(view.container))).toContain("posture not known yet");
    expect(allText(strip(view.container))).toContain("armed: not known yet");
    expect(allText(strip(view.container))).not.toMatch(/armed: no\b/);
    await act(async () => {
      stream.push(frame(1, { id: 1, at: isoSecond(NOW_MS), type: "posture", posture: "ARMED", armed_until: null }));
    });
    await until(() => allText(strip(view.container)).includes("armed: yes"));
    expect(allText(strip(view.container))).toContain("armed: yes · window end not stated");
    expect(allText(strip(view.container))).toContain("posture armed");
    expect(allText(strip(view.container))).not.toContain("ARMED");
    await act(async () => {
      stream.push(frame(2, { id: 2, at: isoSecond(NOW_MS), type: "posture", posture: "OBSERVE", armed_until: null }));
    });
    await until(() => allText(strip(view.container)).includes("armed: no"));
    expect(allText(strip(view.container))).toContain("posture observe");
  });

  it("a kill from the feed is said in the strip", async () => {
    const { daemon, stream } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    await until(() => daemon.paths().includes("/ui/events"));
    await act(async () => {
      stream.push(frame(1, { id: 1, at: isoSecond(NOW_MS), type: "posture", posture: "KILLED", armed_until: null }));
    });
    await until(() => allText(strip(view.container)).includes("killed"));
    expect(allText(strip(view.container))).toContain("only a restart clears it");
  });
});

describe("pairing words", () => {
  it("has a line for every phase", () => {
    expect(pairingWords({ phase: "checking" })).toBe("checking the session");
    expect(pairingWords({ phase: "ready", carriedOver: false })).toBe("paired · read and prepare, never submit");
    expect(pairingWords({ phase: "ready", carriedOver: true })).toContain("from earlier in this tab");
    expect(pairingWords({ phase: "unpaired", reason: "no_code" })).toBe("not paired");
    expect(pairingWords({ phase: "expired" })).toBe("session expired");
  });

  it("without a code or a session the strip says not paired, the panel says why, and nothing is requested even when expanded", async () => {
    const { daemon } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: undefined });
    const view = mountDock(services, timers);
    await flush(4);
    expect(allText(strip(view.container))).toContain("not paired");
    expect(must(strip(view.container), '[data-fact="session"]').getAttribute("role")).toBe("alert");
    expect(allText(panel(view.container))).toContain(PAIR_REASON_TEXT.no_code);
    expect(panel(view.container).querySelectorAll('[data-code="NOT_PAIRED"]')).toHaveLength(1);
    expect(daemon.raw.calls).toHaveLength(0);
    expect(must<HTMLInputElement>(panel(view.container), "input.terminal-input").disabled).toBe(true);
  });

  it("takes the page's one session when given it: a carried-over token is said to be one, and an unpaired reason is the session's", async () => {
    const { daemon } = openDaemon();
    const { services, timers } = fakeServices({ daemon, code: undefined, storage: memoryStorage({ "xo-cockpit.ui-session": TOKEN }) });
    const { Dock } = await import("./Dock");
    const { render } = await import("../../ui/testing/dom");
    const { QueryClientProvider } = await import("@tanstack/react-query");
    const { ClockProvider, ModeProvider, createAppQueryClient } = await import("../../ui");
    const { AnnouncerProvider } = await import("../../ui/a11y");
    const { TerminalServicesProvider } = await import("./services");
    const mount = (session: Promise<PageSessionState>) =>
      render(
        <QueryClientProvider client={createAppQueryClient()}>
          <ModeProvider mode="cockpit">
            <ClockProvider clock={{ now: timers.clock }}>
              <AnnouncerProvider>
                <TerminalServicesProvider services={services}>
                  <Dock services={services} session={session} />
                </TerminalServicesProvider>
              </AnnouncerProvider>
            </ClockProvider>
          </ModeProvider>
        </QueryClientProvider>,
      );
    const carried = mount(Promise.resolve({ kind: "paired", fresh: false }));
    await flush(4);
    expect(allText(strip(carried.container))).toContain("from earlier in this tab");
    carried.unmount();
    const refused = mount(Promise.resolve({ kind: "unpaired", reason: "pairing_expired" }));
    await flush(4);
    expect(allText(strip(refused.container))).toContain("not paired");
    click(toggle(refused.container));
    await flush(2);
    expect(allText(panel(refused.container))).toContain(PAIR_REASON_TEXT.pairing_expired);
    // The dock asked the daemon for nothing itself: the session was the page's.
    expect(daemon.paths()).not.toContain("/ui/pair");
  });
});

describe("accessibility", () => {
  it("the strip and the open panel have no structural violations", async () => {
    const { daemon } = openDaemon({ records: [recordOf(deployItem(), { state: "prepared" })] });
    const { services, timers } = fakeServices({ daemon, code: PAIR_CODE });
    const view = mountDock(services, timers);
    await until(() => allText(strip(view.container)).includes("1 prepared item"));
    const violations = await runAxe(view.container, ["region", "page-has-heading-one", "landmark-one-main"]);
    expect(violations.map((violation) => `${violation.id}: ${violation.targets.join(",")}`)).toEqual([]);
    expect(toggle(view.container).getAttribute("aria-controls")).toBe(panel(view.container).id);
  });
});
