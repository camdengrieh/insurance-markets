import { useEffect, useRef } from "react";

// Tone by 4x4 Bayer ordered dither, the only shading in this system (docs/design/cockpit-v2/System.dc.html).
//
//   DitherDefs   the seven SVG <pattern>s (2/16 to 14/16 of the cells inked, 2 px cells), rendered ONCE by the
//                Shell so that every fill="url(#dN)" in the document resolves, inside portaled dialogs too.
//   DitherBar    a depth bar: one <rect> whose width is an SVG attribute (never an inline style), filled with a
//                pattern step in the side's ink (--yes, --no or --text through CSS `color`; the patterns paint
//                currentColor).
//   DitherField  the one live thing on the page: a low-resolution <canvas> scaled with image-rendering:
//                pixelated, a moving scalar field thresholded by the same Bayer matrix into three inks read from
//                the CSS tokens at draw time (paper --bg, accent --yes, ink --text). One frame under
//                prefers-reduced-motion or `still`; the loop stops while the tab is hidden; decorative
//                (aria-hidden), and nothing is ever written on top of it.
//
// Dither never sits under text.

export type DitherStep = 2 | 4 | 6 | 8 | 10 | 12 | 14;

export const DITHER_STEPS: readonly DitherStep[] = [2, 4, 6, 8, 10, 12, 14];

// The 4x4 Bayer matrix, row-major: threshold rank of each cell (0..15).
const BAYER: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

// The cells inked at each step, in Bayer order, so every step contains the sparser ones.
function cellsFor(step: DitherStep): string {
  const parts: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    const rank = BAYER[index] ?? 0;
    if (rank < step) parts.push(`M${index % 4} ${Math.floor(index / 4)}h1v1H${index % 4}z`);
  }
  return parts.join("");
}

export function ditherId(step: DitherStep): string {
  return `d${step}`;
}

// The value for an SVG `fill` attribute.
export function ditherFill(step: DitherStep): string {
  return `url(#${ditherId(step)})`;
}

export function DitherDefs() {
  return (
    <svg className="ui-dither-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {DITHER_STEPS.map((step) => (
          <pattern key={step} id={ditherId(step)} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="scale(2)">
            <path d={cellsFor(step)} fill="currentColor" />
          </pattern>
        ))}
      </defs>
    </svg>
  );
}

// ---- depth bar ------------------------------------------------------------------------------------------------

export type DitherTone = "yes" | "no" | "ink";

export interface DitherBarProps {
  // 0..1: the size relative to the deepest level shown. Anything else draws as empty.
  readonly value: number;
  readonly tone?: DitherTone;
  // Fixed app text for screen readers ("depth 72 of 100 shares"). Without one the bar is decorative, and the
  // number beside it carries the meaning.
  readonly label?: string;
  readonly step?: DitherStep;
}

export function barWidth(value: number): string {
  const ratio = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return `${Math.round(ratio * 1000) / 10}%`;
}

export function DitherBar({ value, tone = "ink", label, step = 12 }: DitherBarProps) {
  const decorative = label === undefined;
  return (
    <svg className="ui-dither-bar" data-tone={tone} role={decorative ? undefined : "img"} aria-label={label} aria-hidden={decorative ? "true" : undefined} focusable="false">
      <rect width={barWidth(value)} height="100%" fill={ditherFill(step)} />
    </svg>
  );
}

// ---- live field -----------------------------------------------------------------------------------------------

type Rgb = readonly [number, number, number];

// Used only when a token cannot be read (no computed style, as in a DOM without layout); the page's real inks
// come from theme.css at draw time.
const FALLBACK_INKS: { readonly paper: Rgb; readonly accent: Rgb; readonly ink: Rgb } = { paper: [232, 229, 219], accent: [36, 67, 200], ink: [26, 27, 31] };

export function parseHexColour(value: string): Rgb | null {
  const text = value.trim();
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(text);
  if (long !== null) return [Number.parseInt(long[1] ?? "0", 16), Number.parseInt(long[2] ?? "0", 16), Number.parseInt(long[3] ?? "0", 16)];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short !== null) return [Number.parseInt(`${short[1]}${short[1]}`, 16), Number.parseInt(`${short[2]}${short[2]}`, 16), Number.parseInt(`${short[3]}${short[3]}`, 16)];
  return null;
}

function tokenInk(style: CSSStyleDeclaration, token: string, fallback: Rgb): Rgb {
  return parseHexColour(style.getPropertyValue(token)) ?? fallback;
}

// Fills `data` (w*h*4) with the field at time `t` (ms). Exported for the test: no canvas is needed to check it.
export function paintField(data: Uint8ClampedArray, w: number, h: number, t: number, inks: { readonly paper: Rgb; readonly accent: Rgb; readonly ink: Rgb }): void {
  const s = t * 0.00045;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const ny = y / h;
      let v = 0.5 + 0.5 * Math.sin(nx * 9 + s * 2.1) * Math.cos(ny * 7 - s * 1.3);
      const dx = nx - 0.62 - 0.12 * Math.sin(s);
      const dy = (ny - 0.5) * 0.6;
      v = 0.55 * v + 0.45 * (1 - Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2.2)) + 0.12 * Math.sin((nx + ny) * 18 - s * 3);
      const threshold = ((BAYER[(y & 3) * 4 + (x & 3)] ?? 0) + 0.5) / 16;
      let colour = inks.paper;
      if (v > 0.78 + threshold * 0.22) colour = inks.ink;
      else if (v > 0.36 + threshold * 0.42) colour = inks.accent;
      const i = (y * w + x) * 4;
      data[i] = colour[0];
      data[i + 1] = colour[1];
      data[i + 2] = colour[2];
      data[i + 3] = 255;
    }
  }
}

export interface DitherFieldProps {
  // Draw one frame and stop, whatever the motion preference says.
  readonly still?: boolean;
  // CSS pixels per field cell (3 to 10 in the design; the canvas is this many times smaller than its box).
  readonly cell?: number;
}

export const DEFAULT_CELL = 6;

export function DitherField({ still = false, cell = DEFAULT_CELL }: DitherFieldProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    // A DOM without a 2D context (jsdom) gets a blank canvas and no loop.
    const context = canvas.getContext("2d");
    if (context === null || context === undefined) return;
    const motion = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const oneFrame = still || motion === null || motion.matches;
    const size = Math.max(1, Math.floor(cell));

    let frame = 0;
    let running = false;

    const draw = (t: number): void => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(40, Math.floor(rect.width / size));
      const h = Math.max(20, Math.floor(rect.height / size));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const style = getComputedStyle(canvas);
      const inks = { paper: tokenInk(style, "--bg", FALLBACK_INKS.paper), accent: tokenInk(style, "--yes", FALLBACK_INKS.accent), ink: tokenInk(style, "--text", FALLBACK_INKS.ink) };
      const image = context.createImageData(w, h);
      paintField(image.data, w, h, t, inks);
      context.putImageData(image, 0, 0);
    };

    const tick = (t: number): void => {
      if (!running) return;
      draw(t);
      frame = requestAnimationFrame(tick);
    };
    const start = (): void => {
      if (running || oneFrame) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      running = false;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
    };
    // R9: nothing runs in a hidden tab.
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };
    const onResize = (): void => {
      if (oneFrame) draw(0);
    };

    if (oneFrame) draw(0);
    else if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
    };
  }, [still, cell]);

  return <canvas ref={ref} className="ui-dither-field" aria-hidden="true" data-cell={cell} data-still={still ? "true" : undefined} />;
}
