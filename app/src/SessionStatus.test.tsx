// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { PAIR_REASON_TEXT } from "./features/terminal/session";
import type { PageSessionState } from "./session";
import { SessionStatus } from "./SessionStatus";
import { allText, cleanup, render, settle } from "./ui/testing/dom";

afterEach(cleanup);

async function shown(state: PageSessionState) {
  const rendered = render(<SessionStatus session={Promise.resolve(state)} />);
  await settle();
  return rendered.container;
}

describe("SessionStatus", () => {
  it("shows nothing in the standalone build, which has no daemon", async () => {
    expect(allText(await shown({ kind: "standalone" }))).toBe("");
  });

  it("says a fresh pairing is read and prepare only, and that the page cannot submit", async () => {
    const text = allText(await shown({ kind: "paired", fresh: true }));
    expect(text).toContain("Paired with the local daemon");
    expect(text).toContain("cannot submit");
    expect(text).not.toContain("restarted");
  });

  it("warns that a pairing carried over from earlier in the tab may be stale", async () => {
    expect(allText(await shown({ kind: "paired", fresh: false }))).toContain("daemon restarted");
  });

  it("gives every unpaired reason in words, as an alert, with the fixed text and nothing else", async () => {
    for (const reason of Object.keys(PAIR_REASON_TEXT) as (keyof typeof PAIR_REASON_TEXT)[]) {
      const container = await shown({ kind: "unpaired", reason });
      expect(container.querySelector("[role=alert]")).not.toBeNull();
      expect(allText(container)).toContain("Not paired with the daemon");
      expect(allText(container)).toContain(PAIR_REASON_TEXT[reason]);
      cleanup();
    }
  });
});
