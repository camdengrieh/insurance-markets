import { useId, type ReactNode } from "react";

import { DitherField } from "./dither";
import { Num } from "./primitives";

// The hero band of a surface: the live dither field on the left and a flat panel on the right with the page's
// <h1>, a lede and up to three facts. The facts are REAL values or an empty state in words ("none approved",
// "no address watched"); never a sample count. Dither never sits under text: the field and the panel are two
// cells, and on a phone the band is a 96 px strip.
//
// The screen that renders it declares `hero: true` in its route metadata so the shell renders no second h1
// (ui/route-types.ts). The h1 carries data-route-heading so navigation focus lands on it like any other page.

export interface HeroFact {
  // Fixed app text.
  readonly label: string;
  // A number, a short mono word ("off") or a Missing. Set in mono.
  readonly value: ReactNode;
  // Words beside the value ("none approved", "licence first").
  readonly note?: string;
  // The top rule's ink: the page ink, the Yes blue or the No rust.
  readonly tone?: "ink" | "yes" | "no";
}

export interface HeroBandProps {
  readonly title: string;
  readonly lede?: string;
  readonly facts?: readonly HeroFact[];
  // Draw the field once (tests, or a page that must not move).
  readonly still?: boolean;
  // The phone's one-line label over the field (Mobile.dc.html, "6 venues · 9 rows · 3 held"). Computed values
  // only; it repeats the facts, so it is hidden from assistive technology, which reads the h1 and the facts.
  readonly compact?: ReactNode;
  readonly children?: ReactNode;
}

export function HeroBand({ title, lede, facts = [], still = false, compact, children }: HeroBandProps) {
  const headingId = useId();
  return (
    <section className="ui-hero" aria-labelledby={headingId} data-compact={compact === undefined ? undefined : "true"}>
      <div className="ui-hero-field">
        <DitherField still={still} />
      </div>
      <div className="ui-hero-panel">
        {compact === undefined ? null : (
          <p className="ui-hero-compact" aria-hidden="true">
            {compact}
          </p>
        )}
        <h1 id={headingId} tabIndex={-1} data-route-heading="">
          {title}
        </h1>
        {lede === undefined ? null : <p className="ui-hero-lede">{lede}</p>}
        {facts.length === 0 ? null : (
          <dl className="ui-hero-facts">
            {facts.map((fact) => (
              <div key={fact.label} className="ui-hero-fact" data-tone={fact.tone ?? "ink"}>
                <dt>{fact.label}</dt>
                <dd>
                  <Num>{fact.value}</Num>
                  {fact.note === undefined ? null : <span className="ui-hero-note"> {fact.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </section>
  );
}
