# Cockpit v2 design: "risograph desk"

Six HTML artboards and their canvas file, copied unchanged from the design session of 2026-10-20. They are the
reference for the restyle of `app/` (the Cockpit page). They are design documents, not app code: each board loads
Google Fonts and carries inline styles and sample rows, none of which may enter `app/` (the app's CSP allows no
third-party origin and no inline style, and ships no sample data).

| File | Board |
|---|---|
| `canvas.json` | Board positions, titles and order |
| `Main.dc.html` | 1 Cockpit: one surface (markets table, inspector aside, view chips, hero band, footer dock strip) |
| `Market.dc.html` | 2 Market modal: both sides of the book, linked legs, Quotient, ticket or worksheet |
| `Signing.dc.html` | 3 Signature Card over the terminal dock |
| `Connect.dc.html` | 4 Connect PayBox modal: pair, sign in, or just watch an address |
| `Mobile.dc.html` | 5 Phone (390 px): rows as cards, inspector as a bottom sheet, 96 px hero strip |
| `System.dc.html` | 6 Dither system: colour, dither steps, type, components, where things live |

Every value in the boards is exact: read the inline `style` attributes for sizes, borders and colours. The
sample rows, counts, prices and addresses in the boards are illustrations only; the app shows real data or an
empty state in words.

## Tokens

Light theme ("paper"). The dark theme swaps paper and ink and keeps both accents; every text pair must still
pass WCAG (app/src/ui/theme-tokens.test.ts checks it).

| Name | Value | Use | Maps to (app/src/ui/theme.css) |
|---|---|---|---|
| Paper | `#e8e5db` | page ground | `--bg` |
| Panel | `#f3f1ea` | inspector, modals, wells | `--surface` (and `--surface-2` for the darker well) |
| Ink | `#1a1b1f` | text, lines, primary fill; dark-theme ground | `--text`, `--border` on strong rules, `--accent` for the primary button |
| Dim ink | `#5b5952` | secondary text (5.6:1 on paper) | `--text-muted` |
| Yes | `#2443c8` | Yes side, links, selection rule, live dot, focus ring | new `--yes` (and `--focus`) |
| No | `#b5401a` | No side, Reject, Quotient mark | new `--no` |
| Caution | `#8a5a00` | caution glyph and text only, always with a dashed border and words; never a fill | new `--caution` |
| Line | `#c7c3b6` | row and panel rules | `--border` |
| Strong line | `#7e7b72` | control outlines (3.5:1) | `--border-strong` |

Other fixed values: square corners (radius 0), 1.5 px lines (2 px for the header and dialog frames), 44 px
minimum touch target, 36 px view chips, focus ring 3 px in Yes blue with 2 px offset.

Type: Archivo for UI text (sentence case, never upper-case labels); Martian Mono for every number, id, hash,
time and command. Both are SIL OFL 1.1. The app must vendor them as woff2 under `app/` with the licence text or
fall back to the system stacks; it never loads them from a third-party origin.

Tone: only by 4x4 Bayer ordered dither. Static tone is an SVG `<pattern>` (2/16 to 14/16 steps, 2 px cells) for
depth bars, modal scrims, rules and empty fills. Live tone is one `<canvas>` in the hero band, drawn at low
resolution with `image-rendering: pixelated`, three inks (paper, accent, ink), one frame under
`prefers-reduced-motion`. Dither never sits under text.
