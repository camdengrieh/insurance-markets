import { ALL_SPECS } from "./lib/registry.js";
import { isEntryPoint } from "./lib/harness.js";

// Lists the live tests, in the order to run them, with what each can cost. Runs nothing.
//
//   tsx scripts/live/index.ts
//
// Each test is its own script: `tsx scripts/live/<slug>.ts --help` shows its options, and without --confirm
// it prints its plan and does nothing. docs/runbook.md says what each costs, what it settles and how to roll back.

export function listing(): string[] {
  const lines = ["The live tests, in the order to run them (each is optional, each needs your explicit go):", ""];
  for (const spec of ALL_SPECS) {
    lines.push(`  ${spec.id.padEnd(4)} ${spec.slug.padEnd(24)} worst case $${spec.worstCaseUsd.padEnd(5)} ${spec.title}`);
    lines.push(`       settles ${spec.settles.join(", ")}; arms ${spec.flagsToArm.length === 0 ? "no flag" : spec.flagsToArm.join(", ")}`);
  }
  lines.push("", "Also: tsx scripts/live/facts.ts list|flags|record --data-dir <dir>   (the capability facts)");
  return lines;
}

if (isEntryPoint(import.meta.url)) for (const line of listing()) process.stdout.write(`${line}\n`);
