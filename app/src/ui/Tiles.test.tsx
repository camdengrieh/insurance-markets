// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterError, Untrusted } from "../core/ports";
import { ADAPTER_ERROR_TEXT, CapabilityBadge, CapabilityGate, EmptyTile, ErrorTile, NeedsCockpitTile, RestrictedTermsTile, UnprovenTile, errorText, isProven } from "./Tiles";
import { allText, click, cleanup, must, render } from "./testing/dom";

afterEach(cleanup);

const CODES: readonly AdapterError[] = ["RATE_LIMITED", "STALE", "NOT_SUPPORTED", "SCHEMA_DRIFT", "VENUE_PAUSED", "NOT_FOUND", "TIMEOUT", "EMPTY_BOOK"];

describe("ErrorTile", () => {
  it("has plain words for every adapter error code and is an alert", () => {
    expect(Object.keys(ADAPTER_ERROR_TEXT).sort()).toEqual([...CODES].sort());
    for (const code of CODES) {
      const { container } = render(<ErrorTile code={code} venue="polymarket" />);
      const tile = must(container, "section");
      expect(tile.getAttribute("role")).toBe("alert");
      expect(tile.getAttribute("data-code")).toBe(code);
      expect(allText(tile)).toContain("Polymarket");
      expect(allText(tile).length).toBeGreaterThan(40);
      cleanup();
    }
  });

  it("keeps an empty book distinct from an unreachable venue", () => {
    expect(errorText("EMPTY_BOOK").explain).toMatch(/not the same as an unreachable venue/);
    expect(errorText("TIMEOUT").explain).toMatch(/unreachable venue/);
    expect(errorText("EMPTY_BOOK").title).not.toBe(errorText("TIMEOUT").title);
  });

  it("falls back to words that do not guess for an unknown code, including prototype names", () => {
    for (const code of ["MADE_UP", "__proto__", "constructor", "toString", undefined]) {
      expect(errorText(code).title).toBe("Something went wrong");
    }
  });

  it("shows an upstream message only inside the untrusted slot", () => {
    const detail: Untrusted<string> = { untrusted: true, value: '<img src=x onerror=alert(1)>' };
    const { container } = render(<ErrorTile code="SCHEMA_DRIFT" detail={detail} />);
    expect(container.querySelector("img")).toBeNull();
    expect(must(container, ".ui-untrusted").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("offers a retry that calls back", () => {
    const retry = vi.fn();
    const { container } = render(<ErrorTile code="TIMEOUT" onRetry={retry} />);
    click(must(container, "button"));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("EmptyTile", () => {
  it("says empty is not an error and not zero", () => {
    const { container } = render(<EmptyTile />);
    expect(allText(container)).toMatch(/not an error and not a zero/);
    expect(must(container, "section").getAttribute("role")).toBe("status");
  });
});

describe("capabilities (unproven unless recorded as yes)", () => {
  it("only the string yes is proven", () => {
    expect(isProven("yes")).toBe(true);
    for (const value of ["no", "unknown", "YES", "true", true, 1, null, undefined, {}, "yes "]) expect(isProven(value)).toBe(false);
  });

  it("the gate hides its children and says unproven for every other value", () => {
    for (const state of ["no", "unknown", undefined, null, "YES", 1, "true"]) {
      const { container } = render(
        <CapabilityGate state={state} capability="Enable Trading">
          <button type="button">Enable now</button>
        </CapabilityGate>,
      );
      expect(container.querySelector("button")).toBeNull();
      expect(allText(container)).toContain("Unproven: Enable Trading");
      cleanup();
    }
  });

  it("the gate shows its children for yes", () => {
    const { container } = render(
      <CapabilityGate state="yes" capability="Enable Trading">
        <button type="button">Enable now</button>
      </CapabilityGate>,
    );
    expect(container.querySelector("button")).not.toBeNull();
    expect(allText(container)).not.toContain("nproven");
  });

  it("the badge and tile separate a recorded no from unknown, and both say unproven", () => {
    const { container } = render(
      <>
        <CapabilityBadge state="no" label="Door (a)" />
        <CapabilityBadge state="unknown" label="Door (b)" />
        <CapabilityBadge state="yes" label="Door (c)" />
        <UnprovenTile capability="Withdraw" state="no" />
      </>,
    );
    const text = allText(container);
    expect(text).toContain("Door (a): unproven (recorded: no)");
    expect(text).toContain("Door (b): unproven");
    expect(text).toContain("Door (c): proven");
    expect(text).toContain("A live test recorded that it does not work.");
  });
});

describe("venue availability tiles", () => {
  it("restricted terms: off, with the clause, never an empty list", () => {
    const { container } = render(<RestrictedTermsTile venue="kalshi" clause="its developer agreement bars caching and aggregating beyond your own trading." />);
    const text = allText(container);
    expect(text).toContain("Kalshi: off, restricted terms");
    expect(text).toContain("nothing was requested");
    expect(text).toContain("not an empty market list");
    expect(text).toContain("developer agreement");
  });

  it("restricted terms: the on state says memory only", () => {
    const { container } = render(<RestrictedTermsTile venue="gemini" clause="terms" enabled />);
    expect(allText(container)).toMatch(/memory only.*no export/);
  });

  it("needs the Cockpit: says it is not an empty book", () => {
    const { container } = render(<NeedsCockpitTile venue="limitless" what="its order books" />);
    const text = allText(container);
    expect(text).toContain("Limitless: needs the Cockpit");
    expect(text).toContain("different from an empty book");
  });

  it("never prints a raw venue id it does not know", () => {
    const { container } = render(<NeedsCockpitTile venue={"<b>x</b>" as never} />);
    expect(container.querySelector("b")).toBeNull();
    expect(allText(container)).toContain("unknown venue");
  });
});
