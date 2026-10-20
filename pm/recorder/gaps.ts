// Gap detection over recorded snapshots. A gap is a stretch between two consecutive snapshots of
// one target longer than gapFactor times the interval in force. Pure over timestamps.

import type { RecorderConfig } from "./config.js";
import { bookIntervalMs, sliceFor } from "./plan.js";

export interface Gap {
  readonly fromMs: number;
  readonly toMs: number;
  readonly missedMs: number;
}

type GapCfg = Pick<RecorderConfig, "gapFactor" | "intervalSec" | "shortIntervalSec" | "shortHorizonSec" | "postCloseGraceSec">;

export function thresholdMs(closeMs: number | null, atMs: number, cfg: GapCfg): number {
  return cfg.gapFactor * bookIntervalMs(sliceFor(closeMs, atMs, cfg), cfg);
}

export function detectGaps(observedMs: readonly number[], closeMs: number | null, cfg: GapCfg): Gap[] {
  const out: Gap[] = [];
  for (let i = 1; i < observedMs.length; i += 1) {
    const a = observedMs[i - 1] as number;
    const b = observedMs[i] as number;
    if (b - a > thresholdMs(closeMs, a, cfg)) out.push({ fromMs: a, toMs: b, missedMs: b - a });
  }
  return out;
}
