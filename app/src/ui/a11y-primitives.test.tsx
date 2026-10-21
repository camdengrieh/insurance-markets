// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Prov, Untrusted } from "../core/ports";
import { AnnouncerProvider, useAnnounce } from "./a11y";
import { ClockProvider, type Clock } from "./context";
import { DataTable, type Column } from "./DataTable";
import { Dialog } from "./Dialog";
import { formatAge, formatCountdown, formatUtc, toIso } from "./format-time";
import { Button, Disclosure, Missing } from "./primitives";
import { ProvenanceStrip } from "./ProvenanceStrip";
import { act, allText, click, cleanup, must, press, render } from "./testing/dom";
import { UntrustedText } from "./UntrustedText";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

interface Row {
  readonly title: string;
  readonly volume: string | null;
  readonly bid: string | null;
}

const rows: readonly Row[] = [
  { title: "Rain in Paris", volume: "1200.50", bid: "0.42" },
  { title: "<img src=x onerror=alert(1)>", volume: null, bid: null },
];

const columns: readonly Column<Row>[] = [
  { key: "title", header: "Market", rowHeader: true, render: (row) => <UntrustedText value={{ untrusted: true, value: row.title } satisfies Untrusted<string>} field="title" /> },
  { key: "volume", header: "Volume (USD)", align: "end", render: (row) => row.volume },
  { key: "bid", header: "Best bid (USD per share)", align: "end", render: (row) => row.bid },
];

describe("DataTable", () => {
  it("is a real table with a caption, column headers with scope, and row headers", () => {
    const { container } = render(<DataTable caption="Markets" columns={columns} rows={rows} rowKey={(row) => row.title} />);
    const table = must<HTMLTableElement>(container, "table");
    expect(table.caption?.textContent).toBe("Markets");
    const heads = [...table.querySelectorAll("thead th")];
    expect(heads.map((th) => th.getAttribute("scope"))).toEqual(["col", "col", "col"]);
    expect(heads.map((th) => th.textContent)).toEqual(["Market", "Volume (USD)", "Best bid (USD per share)"]);
    const rowHeaders = [...table.querySelectorAll("tbody th")];
    expect(rowHeaders.length).toBe(2);
    expect(rowHeaders.every((th) => th.getAttribute("scope") === "row")).toBe(true);
  });

  it("makes the scroll region focusable and named by the caption", () => {
    const { container } = render(<DataTable caption="Markets" columns={columns} rows={rows} rowKey={(row) => row.title} />);
    const region = must<HTMLElement>(container, ".ui-table-scroll");
    expect(region.getAttribute("role")).toBe("region");
    expect(region.tabIndex).toBe(0);
    const id = region.getAttribute("aria-labelledby");
    expect(id).not.toBeNull();
    expect(document.getElementById(id ?? "")?.textContent).toBe("Markets");
  });

  it("renders null as no data, never as 0 or blank, and 0 as 0", () => {
    const { container } = render(
      <DataTable
        caption="Numbers"
        columns={[{ key: "n", header: "Count", align: "end", render: (row: { n: number | null }) => (row.n === null ? null : String(row.n)) }]}
        rows={[{ n: null }, { n: 0 }]}
        rowKey={(_row, index) => String(index)}
      />,
    );
    const cells = [...container.querySelectorAll("tbody td")].map((td) => td.textContent);
    expect(cells[0]).toContain("no data");
    expect(cells[0]).not.toBe("0");
    expect(cells[1]).toBe("0");
  });

  it("shows hostile cell text as inert text", () => {
    const { container } = render(<DataTable caption="Markets" columns={columns} rows={rows} rowKey={(row) => row.title} />);
    expect(container.querySelector("img")).toBeNull();
    expect(allText(container)).toContain("<img src=x onerror=alert(1)>");
  });

  it("shows an empty tile instead of an empty table", () => {
    const { container } = render(<DataTable caption="Open orders" columns={columns} rows={[]} rowKey={() => "x"} />);
    expect(container.querySelector("table")).toBeNull();
    expect(allText(container)).toContain("empty result, not an error and not a zero");
  });

  it("can hide the caption visually and keep it for screen readers", () => {
    const { container } = render(<DataTable caption="Markets" captionHidden columns={columns} rows={rows} rowKey={(row) => row.title} />);
    expect(must(container, "caption").className).toContain("ui-visually-hidden");
  });
});

describe("Dialog", () => {
  function Harness({ dismissOnEscape = true }: { readonly dismissOnEscape?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <div>
        <button type="button" id="opener" onClick={() => setOpen(true)}>
          Open
        </button>
        <a href="#elsewhere" id="behind">
          Behind
        </a>
        <Dialog open={open} title="Confirm" onClose={() => setOpen(false)} dismissOnEscape={dismissOnEscape}>
          <p>Are you sure?</p>
          <Button id="first" onClick={() => setOpen(false)}>
            First
          </Button>
          <Button id="last">Last</Button>
        </Dialog>
      </div>
    );
  }

  it("is labelled, modal, focuses the first control of its body (not the close button), inerts the page and restores focus on close", () => {
    const { container } = render(<Harness />);
    const opener = must<HTMLButtonElement>(container, "#opener");
    opener.focus();
    click(opener);
    const dialog = must<HTMLElement>(document, '[role="dialog"]');
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby") ?? "")?.textContent).toBe("Confirm");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.id).toBe("first");
    expect(container.parentElement?.hasAttribute("inert") || container.hasAttribute("inert")).toBe(true);
    expect(document.body.classList.contains("ui-scroll-lock")).toBe(true);
    expect(dialog.querySelector("[style]")).toBeNull();
    press(dialog, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.hasAttribute("inert")).toBe(false);
    expect(document.body.classList.contains("ui-scroll-lock")).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("has a 44 px close button that is labelled and closes, and draws its scrim as a dither rect", () => {
    const { container } = render(<Harness />);
    click(must(container, "#opener"));
    const close = must<HTMLButtonElement>(document, ".ui-dialog-close");
    expect(close.getAttribute("aria-label")).toBe("Close");
    expect(must(document, ".ui-dialog-scrim rect").getAttribute("fill")).toBe("url(#d4)");
    click(close);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps Tab and Shift+Tab inside: the close button in the head is the first stop, the last body control the last", () => {
    const { container } = render(<Harness />);
    click(must(container, "#opener"));
    const dialog = must<HTMLElement>(document, '[role="dialog"]');
    must<HTMLElement>(dialog, "#last").focus();
    press(dialog, "Tab");
    expect(document.activeElement?.className).toBe("ui-dialog-close");
    press(dialog, "Tab", { shiftKey: true });
    expect(document.activeElement?.id).toBe("last");
  });

  it("does not close on Escape when dismissOnEscape is false, shows no close button, and never closes on a backdrop click", () => {
    const { container } = render(<Harness dismissOnEscape={false} />);
    click(must(container, "#opener"));
    const dialog = must<HTMLElement>(document, '[role="dialog"]');
    expect(document.querySelector(".ui-dialog-close")).toBeNull();
    press(dialog, "Escape");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    click(must(document, ".ui-dialog-backdrop"));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    // With no close button the body's controls are the whole ring.
    must<HTMLElement>(dialog, "#last").focus();
    press(dialog, "Tab");
    expect(document.activeElement?.id).toBe("first");
    press(dialog, "Tab", { shiftKey: true });
    expect(document.activeElement?.id).toBe("last");
  });

  it("closes on Escape after a backdrop click has moved focus to the body", () => {
    const { container } = render(<Harness />);
    click(must(container, "#opener"));
    const backdrop = must<HTMLElement>(document, ".ui-dialog-backdrop");
    // A click on the scrim: nothing closes, and focus is no longer inside the panel.
    click(backdrop);
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
    press(document.body, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the page scroll locked while an inner dialog closes over an outer one", () => {
    function Nested() {
      const [inner, setInner] = useState(true);
      return (
        <Dialog open title="Outer" onClose={() => undefined}>
          <Button id="open-inner" onClick={() => setInner(true)}>
            Inner
          </Button>
          <Dialog open={inner} title="Inner" onClose={() => setInner(false)}>
            <Button id="close-inner" onClick={() => setInner(false)}>
              Close inner
            </Button>
          </Dialog>
        </Dialog>
      );
    }
    render(<Nested />);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(document.body.classList.contains("ui-scroll-lock")).toBe(true);
    click(must(document, "#close-inner"));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.body.classList.contains("ui-scroll-lock")).toBe(true);
  });

  it("takes a size and marks the backdrop with it", () => {
    render(
      <Dialog open title="Wide" size="wide" onClose={() => undefined}>
        <p>x</p>
      </Dialog>,
    );
    expect(must(document, ".ui-dialog-backdrop").getAttribute("data-size")).toBe("wide");
  });

  it("survives StrictMode double effects without leaving the page inert", () => {
    const { container, unmount } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    click(must(container, "#opener"));
    click(must(document, "#first"));
    expect(container.hasAttribute("inert")).toBe(false);
    unmount();
    expect(document.querySelector("[inert]")).toBeNull();
  });
});

describe("AnnouncerProvider", () => {
  function Speaker({ messages }: { readonly messages: ReadonlyArray<readonly [string, ("polite" | "assertive")?]> }) {
    const announce = useAnnounce();
    return (
      <button type="button" onClick={() => messages.forEach(([text, priority]) => announce(text, priority))}>
        say
      </button>
    );
  }
  const live = (name: "polite" | "assertive") => must<HTMLElement>(document, `[data-live="${name}"]`);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  });

  it("has a polite status region and an assertive alert region", () => {
    render(
      <AnnouncerProvider>
        <p>x</p>
      </AnnouncerProvider>,
    );
    expect(live("polite").getAttribute("role")).toBe("status");
    expect(live("polite").getAttribute("aria-live")).toBe("polite");
    expect(live("assertive").getAttribute("role")).toBe("alert");
    expect(live("assertive").getAttribute("aria-live")).toBe("assertive");
  });

  it("speaks the first polite message at once and throttles the rest to the latest", () => {
    const burst = Array.from({ length: 100 }, (_, index) => [`price ${index}`] as const);
    const { container } = render(
      <AnnouncerProvider minIntervalMs={1500}>
        <Speaker messages={burst} />
      </AnnouncerProvider>,
    );
    click(must(container, "button"));
    expect(live("polite").textContent?.trim()).toBe("price 0");
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(live("polite").textContent?.trim()).toBe("price 0");
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(live("polite").textContent?.trim()).toBe("price 99");
  });

  it("never delays an assertive message and ignores blank ones", () => {
    const { container } = render(
      <AnnouncerProvider>
        <Speaker messages={[["fine"], ["   "], ["Kill switch engaged", "assertive"]]} />
      </AnnouncerProvider>,
    );
    click(must(container, "button"));
    expect(live("assertive").textContent?.trim()).toBe("Kill switch engaged");
    expect(live("polite").textContent?.trim()).toBe("fine");
  });

  it("announces the same sentence again", () => {
    const { container } = render(
      <AnnouncerProvider minIntervalMs={0}>
        <Speaker messages={[["Updated"]]} />
      </AnnouncerProvider>,
    );
    click(must(container, "button"));
    const first = live("polite").textContent;
    click(must(container, "button"));
    expect(live("polite").textContent).not.toBe(first);
    expect(live("polite").textContent?.trim()).toBe("Updated");
  });

  it("announcing outside a provider does nothing and does not throw", () => {
    const { container } = render(<Speaker messages={[["x"]]} />);
    expect(() => click(must(container, "button"))).not.toThrow();
  });
});

describe("ProvenanceStrip and time text", () => {
  const prov: Prov = { venue: "polymarket", source: "gamma /markets", fetchedAtMs: Date.UTC(2026, 9, 19, 12, 0, 3), transport: "T0", freshness: "live", ttlMs: 15_000, license: "open" };
  const clock = (now: number): Clock => ({ now: () => now });

  it("shows venue, route, UTC fetch time with age, and freshness as words", () => {
    const { container } = render(
      <ClockProvider clock={clock(Date.UTC(2026, 9, 19, 12, 0, 15))}>
        <ProvenanceStrip prov={prov} />
      </ClockProvider>,
    );
    const text = allText(container);
    expect(text).toContain("Polymarket");
    expect(text).toContain("browser direct");
    expect(text).toContain("2026-10-19 12:00:03 UTC (12 s ago)");
    expect(text).toContain("live");
    expect(must(container, "time").getAttribute("datetime")).toBe("2026-10-19T12:00:03.000Z");
  });

  it("flags stale and unknown freshness and own-use-only terms", () => {
    const { container } = render(
      <ClockProvider clock={clock(prov.fetchedAtMs + 600_000)}>
        <ProvenanceStrip prov={{ ...prov, venue: "kalshi", freshness: "stale", license: "own_use_only", transport: "T1" }} />
      </ClockProvider>,
    );
    const text = allText(container);
    expect(text).toContain("stale");
    expect(text).toContain("via the Cockpit");
    expect(text).toContain("own use only: memory only, no export");
    expect(text).toContain("10 min ago");
  });

  it("does not throw for a nonsense timestamp or enum", () => {
    const { container } = render(
      <ClockProvider clock={clock(0)}>
        <ProvenanceStrip prov={{ ...prov, fetchedAtMs: Number.NaN, freshness: "bogus" as never, transport: "T9" as never, venue: "nope" as never }} />
      </ClockProvider>,
    );
    const text = allText(container);
    expect(text).toContain("unknown");
    expect(text).toContain("freshness unknown");
  });

  it("formats ages, UTC text and countdowns", () => {
    expect(formatAge(1000, 3000)).toBe("just now");
    expect(formatAge(0, 59_000)).toBe("59 s ago");
    expect(formatAge(0, 3_600_000)).toBe("1 h ago");
    expect(formatAge(0, 3 * 86_400_000)).toBe("3 d ago");
    expect(formatAge(10_000, 0)).toBe("ahead of this clock");
    expect(formatAge(null, 0)).toBe("unknown");
    expect(formatUtc(Date.UTC(2026, 0, 2, 3, 4, 5))).toBe("2026-01-02 03:04:05 UTC");
    expect(formatUtc(Number.NaN)).toBe("unknown");
    expect(formatUtc(1e20)).toBe("unknown");
    expect(toIso(1e20)).toBeUndefined();
    expect(formatCountdown(61_000)).toBe("01:01");
    expect(formatCountdown(0)).toBe("expired");
    expect(formatCountdown(-5)).toBe("expired");
    expect(formatCountdown(Number.NaN)).toBe("unknown");
  });
});

describe("small primitives", () => {
  it("Missing keeps a text alternative", () => {
    const { container } = render(<Missing label="not reported" />);
    expect(allText(container)).toContain("not reported");
  });

  it("Disclosure is a native details element", () => {
    const { container } = render(<Disclosure summary="Data table">rows</Disclosure>);
    expect(must(container, "details > summary").textContent).toBe("Data table");
  });

  it("a busy Button cannot be pressed twice", () => {
    const onClick = vi.fn();
    const { container } = render(<Button busy onClick={onClick}>Save</Button>);
    const button = must<HTMLButtonElement>(container, "button");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.type).toBe("button");
    click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
