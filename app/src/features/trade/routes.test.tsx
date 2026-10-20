// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { metaProblem } from "../../ui/routes";
import { cleanup, render, allText } from "../../ui/testing/dom";
import { ModeProvider } from "../../ui";
import TradeScreen, { route } from "../../routes/trade";
import { TradeServicesProvider } from "./services";
import { makeRig } from "./test-support";

afterEach(cleanup);

describe("the trade route", () => {
  it("has valid metadata, a fixed title with no market text, and needs the Cockpit", () => {
    expect(metaProblem(route)).toBeNull();
    expect(route).toMatchObject({ id: "trade", path: "/trade", title: "Trade", availability: "cockpit" });
  });

  it("is not a creation screen", () => {
    expect(JSON.stringify(route)).not.toMatch(/creat/i);
  });

  it("renders in the Cockpit build without reaching anything before the page is paired", () => {
    const rig = makeRig({ code: undefined });
    const { container } = render(
      <ModeProvider mode="cockpit">
        <TradeServicesProvider services={rig.services}>
          <TradeScreen />
        </TradeServicesProvider>
      </ModeProvider>,
    );
    expect(allText(container)).toContain("This page prepares. It never signs and never sends.");
    expect(rig.daemon.toolCalls).toEqual([]);
  });
});
