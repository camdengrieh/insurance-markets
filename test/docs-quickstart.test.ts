import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { ALL_SPECS } from "../scripts/live/lib/registry.js";

// The quickstart's cost table is what a stranger budgets from (F5). It is checked against the kit's own figures
// (scripts/live), so the two cannot drift apart again, and against the runbook's table.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path: string): string => readFileSync(`${ROOT}${path}`, "utf8");

// "| T3c Fee reconciliation (optional) | Which fee figure is real | $1.10 |" -> { id: "T3c", cost: "$1.10" }
function quickstartCosts(): Map<string, string> {
  const costs = new Map<string, string>();
  for (const line of read("docs/quickstart.md").split("\n")) {
    const match = /^\| (T\d+[a-z]?) [^|]*\|[^|]*\| ([^|]*) \|$/.exec(line);
    if (match !== null) costs.set(match[1] as string, (match[2] as string).trim());
  }
  return costs;
}

describe("docs/quickstart.md cost table", () => {
  const costs = quickstartCosts();

  it("lists every test of the kit", () => {
    assert.deepEqual([...costs.keys()].sort(), ALL_SPECS.map((spec) => spec.id).sort());
  });

  for (const spec of ALL_SPECS) {
    it(`${spec.id}: the worst case is the kit's own figure ($${spec.worstCaseUsd})`, () => {
      const cost = costs.get(spec.id);
      assert.ok(cost !== undefined, `no row for ${spec.id}`);
      const figures = [...cost.matchAll(/\$(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      // The first figure is the base; a second one (T3b with probes) is the larger ceiling the index prints.
      assert.ok(figures.length > 0, `no dollar figure in "${cost}"`);
      assert.equal(Math.max(...figures), Number(spec.worstCaseUsd), `${spec.id} says "${cost}", the script says $${spec.worstCaseUsd}`);
    });
  }

  it("T3b names both its base ceiling and the one with probes, as the runbook does", () => {
    assert.match(costs.get("T3b") ?? "", /\$0\.55.*\$0\.66/);
    assert.match(read("docs/runbook.md"), /\*\*\$0\.55\*\*; \*\*\$0\.66\*\* with `--probes`/);
  });
});

describe("docs/quickstart.md rolling back", () => {
  it("says the kill switch works by signal in local mode, not that it needs a restart", () => {
    const text = read("docs/quickstart.md");
    assert.doesNotMatch(text, /local mode does not wire that signal/);
    assert.match(text, /`SIGUSR2` switches every write off at once, without a restart/);
    assert.match(text, /stdio and `serve`/);
  });

  it("the signal handler it points at exists in local mode", () => {
    const cli = read("src/local/cli.ts");
    assert.match(cli, /SIGUSR2/);
    assert.match(read("src/local/README.md"), /kill -USR2 <pid>/);
  });
});

describe("docs/safety.md cap description", () => {
  it("counts a BUY with the 1,000 bps cap multiplier, not the 8% fee bound", () => {
    const text = read("docs/safety.md");
    assert.doesNotMatch(text, /XO's fee bound of up to 8%/);
    assert.match(text, /10% of the principal, the cap multiplier of 1,000 bps/);
  });
});
