// Plain-text rendering of an evaluation report. Numbers only; no market text.

import { TARGETS, type EvaluationReport, type Metrics } from "./evaluate.js";
import type { Bound } from "./stats.js";

function pct(b: Bound): string {
  if (b.point === null || b.lower === null || b.upper === null) return `n/a (0 of 0)`;
  return `${(b.point * 100).toFixed(1)}% (${b.k} of ${b.n}; Wilson 95% ${(b.lower * 100).toFixed(1)}-${(b.upper * 100).toFixed(1)}%)`;
}

function metricsLines(m: Metrics, indent: string): string[] {
  return [
    `${indent}labels ${m.labels}, link verdicts ${m.predictedLinks}, no prediction ${m.missingPredictions}`,
    `${indent}qLevel precision  ${pct(m.precisionQ)}  (false links ${m.falseLinks}, orientation errors ${m.orientationErrors}, relation errors ${m.relationErrors})`,
    `${indent}rLevel precision  ${pct(m.precisionR)}  (axis-free link verdicts only)`,
    `${indent}qLevel recall     ${pct(m.recallQ)}  (false rejects ${m.falseRejects}, abstained on true ${m.abstainedOnTrue})`,
    `${indent}axis recall       ${pct(m.axisRecall)}  (spurious axes ${m.spuriousAxes})`,
  ];
}

function kappa(k: number | null): string {
  return k === null ? "n/a" : k.toFixed(3);
}

export function formatReport(r: EvaluationReport): string {
  const lines: string[] = [];
  lines.push(`Gold-set evaluation of generator "${r.generatorId}"`);
  lines.push(`Certifiable: ${r.certifiable ? "yes" : "NO"}`);
  for (const reason of r.certifiableReasons) lines.push(`  - ${reason}`);
  lines.push(
    `Targets: q >= ${TARGETS.q}, r (hedged) >= ${TARGETS.rHedged}, axis recall >= ${TARGETS.axisRecall} (min ${TARGETS.axisRecallMinN} gold axes). Executable stays unproven: it needs two real fills (D2).`,
  );
  lines.push("");
  lines.push("Certification set (cert + test_sealed, labelled after the freeze):");
  lines.push(...metricsLines(r.certification, "  "));
  lines.push("");
  lines.push("By split:");
  for (const split of ["dev", "silver", "cert", "test_sealed"] as const) {
    lines.push(`  ${split}${split === "dev" ? " (never certifies)" : split === "silver" ? " (recall only)" : ""}:`);
    lines.push(...metricsLines(r.bySplit[split], "    "));
  }
  lines.push("");
  lines.push("Classes (relation|venues|family):");
  if (r.classes.length === 0) lines.push("  none: no certifying labels");
  for (const c of r.classes) {
    lines.push(`  ${c.classKey}`);
    lines.push(`    gate q=${c.q ? "yes" : "no"} hedged=${c.hedged ? "yes" : "no"} executable=${c.executable}`);
    lines.push(...metricsLines(c.metrics, "    "));
    for (const why of c.reasons) lines.push(`    - ${why}`);
    if (c.moreNeededForQ !== null) lines.push(`    - at least ${c.moreNeededForQ} more link verdicts needed at the current failure count`);
  }
  lines.push("");
  lines.push(
    `Labeler agreement on ${r.agreement.doubleLabelled} double-labelled items: kappa q ${kappa(r.agreement.kappaQ)}, relation ${kappa(r.agreement.kappaRelation)} (>= ${TARGETS.kappaRelation}), axes ${kappa(r.agreement.kappaAxes)} (>= ${TARGETS.kappaAxes}): ${r.agreement.ok ? "ok" : "not met"}`,
  );
  const c = r.counts;
  lines.push(
    `Counts: labels ${c.labels}, predictions ${c.predictions}, predictions without a label ${c.predictionsWithoutLabel}, labels without a prediction ${c.labelsWithoutPrediction}, excluded stale ${c.excludedStale}, pre-freeze ${c.excludedPreFreeze}, non-certifying split ${c.excludedNotCertifying}`,
  );
  return `${lines.join("\n")}\n`;
}
