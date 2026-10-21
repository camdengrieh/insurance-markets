// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DITHER_STEPS, DitherBar, DitherDefs, DitherField, barWidth, ditherFill, paintField, parseHexColour } from "./dither";
import { act, cleanup, must, render } from "./testing/dom";

// jsdom has no 2D canvas, no requestAnimationFrame worth trusting and no matchMedia; each one is stubbed per test
// so the component's own rules (one frame under reduced motion, no loop in a hidden tab, bail out without a
// context) are what is checked, not the browser's.

interface FakeContext {
  readonly frames: number[];
  createImageData(w: number, h: number): { data: Uint8ClampedArray; width: number; height: number };
  putImageData(image: { width: number; height: number }): void;
}

function fakeContext(): FakeContext {
  const frames: number[] = [];
  return {
    frames,
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    putImageData: (image) => {
      frames.push(image.width * image.height);
    },
  };
}

let raf: { queued: Array<(t: number) => void>; cancelled: number[] };

function install(options: { readonly context: FakeContext | null; readonly reduced: boolean | "absent"; readonly visibility?: DocumentVisibilityState }): void {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => options.context as unknown as CanvasRenderingContext2D);
  raf = { queued: [], cancelled: [] };
  let next = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: (t: number) => void) => {
    raf.queued.push(callback);
    next += 1;
    return next;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    raf.cancelled.push(id);
  });
  if (options.reduced === "absent") vi.stubGlobal("matchMedia", undefined);
  else {
    const matches = options.reduced;
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") ? matches : false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  }
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => options.visibility ?? "visible" });
}

function runQueuedFrame(t: number): void {
  const callbacks = raf.queued.splice(0);
  act(() => {
    for (const callback of callbacks) callback(t);
  });
}

beforeEach(() => {
  raf = { queued: [], cancelled: [] };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DitherDefs", () => {
  it("defines the seven Bayer steps once, each containing the sparser ones, as decorative SVG", () => {
    const { container } = render(<DitherDefs />);
    const svg = must<SVGElement>(container, "svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    const patterns = [...container.querySelectorAll("pattern")];
    expect(patterns.map((pattern) => pattern.id)).toEqual(DITHER_STEPS.map((step) => `d${step}`));
    let previous = 0;
    for (const pattern of patterns) {
      expect(pattern.getAttribute("patternUnits")).toBe("userSpaceOnUse");
      const cells = (pattern.querySelector("path")?.getAttribute("d") ?? "").split("z").filter((part) => part !== "").length;
      expect(cells).toBeGreaterThan(previous);
      previous = cells;
    }
    expect(previous).toBe(14);
    expect(ditherFill(8)).toBe("url(#d8)");
  });
});

describe("DitherBar", () => {
  it("sets the width as an SVG attribute, clamped to 0..100%, and is decorative without a label", () => {
    const { container } = render(
      <>
        <DitherBar value={0.72} tone="yes" />
        <DitherBar value={7} tone="no" label="depth: all of the deepest level shown" />
        <DitherBar value={Number.NaN} />
      </>,
    );
    const bars = [...container.querySelectorAll("svg.ui-dither-bar")];
    expect(bars.map((bar) => bar.querySelector("rect")?.getAttribute("width"))).toEqual(["72%", "100%", "0%"]);
    expect(bars[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(bars[0]?.getAttribute("data-tone")).toBe("yes");
    expect(bars[1]?.getAttribute("role")).toBe("img");
    expect(bars[1]?.getAttribute("aria-label")).toBe("depth: all of the deepest level shown");
    expect(bars[0]?.querySelector("rect")?.getAttribute("fill")).toBe("url(#d12)");
    expect(container.querySelector("[style]")).toBeNull();
    expect(barWidth(-1)).toBe("0%");
    expect(barWidth(0.123456)).toBe("12.3%");
  });
});

describe("DitherField", () => {
  it("is a decorative canvas with no inline style and sizes itself through attributes only", () => {
    const context = fakeContext();
    install({ context, reduced: true });
    const { container } = render(<DitherField cell={4} />);
    const canvas = must<HTMLCanvasElement>(container, "canvas.ui-dither-field");
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(canvas.hasAttribute("style")).toBe(false);
    expect(canvas.getAttribute("data-cell")).toBe("4");
    // No layout in jsdom: the minimum field is 40 by 20 cells.
    expect(canvas.width).toBe(40);
    expect(canvas.height).toBe(20);
  });

  it("draws exactly one frame under prefers-reduced-motion and schedules no loop", () => {
    const context = fakeContext();
    install({ context, reduced: true });
    render(<DitherField />);
    expect(context.frames).toEqual([800]);
    expect(raf.queued).toEqual([]);
  });

  it("draws one frame when `still` is set, even with motion allowed", () => {
    const context = fakeContext();
    install({ context, reduced: false });
    render(<DitherField still />);
    expect(context.frames.length).toBe(1);
    expect(raf.queued).toEqual([]);
  });

  it("treats a missing matchMedia as reduced motion", () => {
    const context = fakeContext();
    install({ context, reduced: "absent" });
    render(<DitherField />);
    expect(context.frames.length).toBe(1);
    expect(raf.queued).toEqual([]);
  });

  it("loops with requestAnimationFrame when motion is allowed, stops while the tab is hidden, resumes when shown, and stops on unmount", () => {
    const context = fakeContext();
    const state = { context, reduced: false as boolean, visibility: "visible" as DocumentVisibilityState };
    install(state);
    const { unmount } = render(<DitherField />);
    expect(context.frames).toEqual([]);
    expect(raf.queued.length).toBe(1);
    runQueuedFrame(16);
    runQueuedFrame(32);
    expect(context.frames.length).toBe(2);
    expect(raf.queued.length).toBe(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(raf.cancelled.length).toBe(1);
    runQueuedFrame(48);
    expect(context.frames.length, "a frame that fires after stop draws nothing").toBe(2);
    expect(raf.queued.length).toBe(0);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(raf.queued.length).toBe(1);
    runQueuedFrame(64);
    expect(context.frames.length).toBe(3);

    unmount();
    expect(raf.cancelled.length).toBe(2);
    runQueuedFrame(80);
    expect(context.frames.length).toBe(3);
  });

  it("does not start in a hidden tab", () => {
    const context = fakeContext();
    install({ context, reduced: false, visibility: "hidden" });
    render(<DitherField />);
    expect(context.frames).toEqual([]);
    expect(raf.queued).toEqual([]);
  });

  it("bails out quietly when the canvas has no 2D context", () => {
    install({ context: null, reduced: false });
    const { container } = render(<DitherField />);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(raf.queued).toEqual([]);
  });
});

describe("the field itself", () => {
  it("paints only the three inks, fully opaque, and moves with time", () => {
    const inks = { paper: [1, 1, 1], accent: [2, 2, 2], ink: [3, 3, 3] } as const;
    const w = 40;
    const h = 20;
    const a = new Uint8ClampedArray(w * h * 4);
    const b = new Uint8ClampedArray(w * h * 4);
    paintField(a, w, h, 0, inks);
    paintField(b, w, h, 5_000, inks);
    const seen = new Set<number>();
    for (let i = 0; i < a.length; i += 4) {
      seen.add(a[i] ?? 0);
      expect(a[i + 3]).toBe(255);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  it("reads #rrggbb and #rgb and refuses anything else", () => {
    expect(parseHexColour(" #e8e5db ")).toEqual([232, 229, 219]);
    expect(parseHexColour("#fff")).toEqual([255, 255, 255]);
    expect(parseHexColour("rgb(1 2 3)")).toBeNull();
    expect(parseHexColour("")).toBeNull();
  });
});
