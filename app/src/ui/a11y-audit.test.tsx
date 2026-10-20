// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { memoryLocation } from "wouter/memory-location";

import { App } from "../App";
import type { Prov, Untrusted } from "../core/ports";
import { DataTable } from "./DataTable";
import { Dialog } from "./Dialog";
import { Badge, Button, Disclosure } from "./primitives";
import { ProvenanceStrip } from "./ProvenanceStrip";
import type { Loader } from "./routes";
import { CapabilityBadge, EmptyTile, ErrorTile, NeedsCockpitTile, RestrictedTermsTile, UnprovenTile } from "./Tiles";
import { cleanup, render, settle } from "./testing/dom";
import { runAxe } from "./testing/axe";
import { UntrustedText } from "./UntrustedText";

// Structural accessibility audit with axe-core in jsdom (Chromium-free). It covers names, roles, landmarks,
// heading order, table structure, ARIA validity and labels. Contrast and layout belong to theme-tokens.test.ts
// and the Playwright suite at 360 and 1280 px (M0-5).

let axeSource = "";

beforeAll(() => {
  // axe-core is a transitive dependency of @axe-core/playwright: resolve it from there.
  const fromApp = createRequire(import.meta.url);
  const playwrightEntry = fromApp.resolve("@axe-core/playwright");
  axeSource = readFileSync(createRequire(playwrightEntry).resolve("axe-core/axe.min.js"), "utf8");
  // Test-only evaluation of a pinned, locally installed library; app source itself never does this.
  new Function(axeSource).call(window);
});

afterEach(cleanup);

const untrusted = (value: string): Untrusted<string> => ({ untrusted: true, value });
const prov: Prov = { venue: "manifold", source: "api", fetchedAtMs: 1_760_875_203_000, transport: "T0", freshness: "recent", ttlMs: 15_000, license: "open" };

function show(violations: Awaited<ReturnType<typeof runAxe>>): string {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help} @ ${v.targets.join(" | ")}`).join("\n");
}

describe("axe (structure only)", () => {
  it("finds a seeded violation, so a clean run means something", async () => {
    const { container } = render(
      <main>
        <h1>Page</h1>
        <img src="data:," />
        <button type="button" />
      </main>,
    );
    const violations = await runAxe(container);
    const ids = violations.map((v) => v.id);
    expect(ids).toContain("image-alt");
    expect(ids).toContain("button-name");
  });

  it("the primitives and tiles together have no violations", async () => {
    const { container } = render(
      <main>
        <h1>Gallery</h1>
        <ProvenanceStrip prov={prov} />
        <ErrorTile code="TIMEOUT" venue="polymarket" onRetry={() => undefined} detail={untrusted("<img src=x onerror=alert(1)>")} />
        <EmptyTile />
        <UnprovenTile capability="Enable Trading" />
        <RestrictedTermsTile venue="kalshi" clause="its developer agreement bars caching." />
        <NeedsCockpitTile venue="limitless" />
        <CapabilityBadge state="unknown" label="Door (a)" />
        <Badge tone="ok">ok</Badge>
        <Button variant="primary">Do it</Button>
        <Disclosure summary="Data table">
          <DataTable
            caption="Markets"
            rows={[{ title: "Rain", price: "0.42" }, { title: "<b>x</b>", price: null }]}
            rowKey={(row) => row.title}
            columns={[
              { key: "t", header: "Market", rowHeader: true, render: (row) => <UntrustedText value={untrusted(row.title)} field="title" /> },
              { key: "p", header: "Price (USD per share)", align: "end", render: (row) => row.price },
            ]}
          />
        </Disclosure>
        <UntrustedText value={untrusted("Resolves YES if it rains.")} field="rules" block />
      </main>,
    );
    const violations = await runAxe(container, ["region"]);
    expect(violations, show(violations)).toEqual([]);
  });

  it("an open dialog has no violations", async () => {
    render(
      <Dialog open title="Confirm" onClose={() => undefined}>
        <p>Are you sure?</p>
        <Button>Yes</Button>
      </Dialog>,
    );
    const violations = await runAxe(document.body, ["region"]);
    expect(violations, show(violations)).toEqual([]);
  });

  for (const mode of ["standalone", "cockpit"] as const) {
    it(`the full shell (${mode}) on the overview, a table screen and a crashed screen has no violations`, async () => {
      const loaders: Record<string, Loader> = {
        "./routes/markets.tsx": async () => ({
          route: { id: "markets", path: "/markets", title: "Markets", nav: { label: "Markets", order: 1 } },
          default: () => (
            <>
              <h2>Venues</h2>
              <DataTable caption="Markets" rows={[{ id: "1" }]} rowKey={(row) => row.id} columns={[{ key: "id", header: "Id", rowHeader: true, render: (row) => row.id }]} />
            </>
          ),
        }),
        "./routes/terminal.tsx": async () => ({
          route: { id: "terminal", path: "/terminal", title: "Terminal", nav: { label: "Terminal", order: 2 }, availability: "cockpit" },
          default: () => <p>console</p>,
        }),
        "./routes/broken.tsx": async () => {
          throw new Error("x");
        },
      };
      for (const path of ["/", "/markets", "/terminal", "/missing"]) {
        const location = memoryLocation({ path });
        const { container, unmount } = render(<App loaders={loaders} mode={mode} locationHook={location.hook} />);
        await settle();
        const violations = await runAxe(container);
        expect(violations, `${mode} ${path}\n${show(violations)}`).toEqual([]);
        unmount();
      }
    });
  }
});
