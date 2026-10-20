// Runs axe-core inside the jsdom document of a component test. jsdom has no layout, so rules that need
// geometry or painted colours (colour contrast, target size) cannot run here: contrast is covered by
// theme-tokens.test.ts, and the Playwright + axe suite in app/e2e covers both at 360 and 1280 px.
//
// axe-core is a transitive dependency of @axe-core/playwright, so a bare import does not resolve under
// pnpm, and string-to-code evaluation is banned in app source. So the calling *.test.tsx finds the source text
// (node:module is allowed in tests, not here), evaluates it once in beforeAll, and this file only runs it.

interface AxeNodeResult {
  readonly target: readonly unknown[];
  readonly failureSummary?: string;
}

interface AxeViolationRaw {
  readonly id: string;
  readonly impact?: string | null;
  readonly help: string;
  readonly nodes: readonly AxeNodeResult[];
}

interface AxeApi {
  run(context: Element, options: unknown): Promise<{ readonly violations: readonly AxeViolationRaw[] }>;
}

export interface AxeViolation {
  readonly id: string;
  readonly impact: string;
  readonly help: string;
  readonly targets: readonly string[];
}

// Rules that need layout or a rendered page. Everything else runs.
const NEEDS_LAYOUT = ["color-contrast", "color-contrast-enhanced", "target-size", "scrollable-region-focusable"];

function installed(): AxeApi | undefined {
  return (window as unknown as { axe?: AxeApi }).axe;
}

export async function runAxe(container: Element, extraDisabled: readonly string[] = []): Promise<AxeViolation[]> {
  const axe = installed();
  if (axe === undefined) throw new Error("axe-core is not loaded: evaluate its source in the test's beforeAll (see a11y-audit.test.tsx)");
  const rules: Record<string, { enabled: boolean }> = {};
  for (const id of [...NEEDS_LAYOUT, ...extraDisabled]) rules[id] = { enabled: false };
  const result = await axe.run(container, { rules, resultTypes: ["violations"] });
  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.map(String).join(" ")),
  }));
}
