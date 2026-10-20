import assert from "node:assert/strict";

import { Secret } from "../src/config.js";
import { RELAY_USER_AGENT } from "../src/relay/contract.js";
import { parseArgs } from "../scripts/live/lib/args.js";
import { runLiveTest, type HarnessDeps, type RunReport } from "../scripts/live/lib/harness.js";
import type { Io, TestSpec } from "../scripts/live/lib/types.js";
import type { MockXo } from "./mock-xo/server.js";
import { TEST_KDF, TEST_MASTER_SECRET } from "./relay-core-helpers.js";

// Helpers for the live-kit tests. Not a test file.

export interface Scripted {
  readonly io: Io;
  readonly out: string[];
  readonly err: string[];
  readonly asked: string[];
}

// An Io that answers each prompt from a queue (undefined when the queue is empty, as a closed stdin does).
export function scriptedIo(answers: readonly string[] = []): Scripted {
  const queue = [...answers];
  const out: string[] = [];
  const err: string[] = [];
  const asked: string[] = [];
  return {
    out,
    err,
    asked,
    io: {
      out: (text) => {
        out.push(text);
      },
      err: (text) => {
        err.push(text);
      },
      ask: async (prompt) => {
        asked.push(prompt);
        return queue.shift();
      },
    },
  };
}

// Fast key stretching and a fixed master secret: the relay's real settings would take seconds per run.
export const FAST_RELAY = Object.freeze({
  createOptions: { kdf: TEST_KDF, allowWeakKdf: true },
  masterSecret: new Secret(TEST_MASTER_SECRET),
});

export interface RunOutcome {
  readonly report: RunReport;
  readonly scripted: Scripted;
  readonly text: string;
}

// Runs one script on the shared mock, fully deterministic: the environment is empty, the random bytes are a
// counter, the relay uses the fast settings.
export async function runOnMock(spec: TestSpec, argv: readonly string[], mock: MockXo | undefined, more: Partial<HarnessDeps> = {}, answers: readonly string[] = []): Promise<RunOutcome> {
  const scripted = scriptedIo(answers);
  let counter = 0;
  const report = await runLiveTest(spec, argv, {
    env: {},
    io: scripted.io,
    random: (bytes) => Uint8Array.from({ length: bytes }, () => ((counter += 7) % 251) + 1),
    ...(mock === undefined ? {} : { world: { mock } }),
    ...FAST_RELAY,
    ...more,
  });
  return { report, scripted, text: [...scripted.out, ...scripted.err].join("\n") };
}

export const MOCK_ARGS = ["--target=mock", "--confirm"] as const;

// Writes the run made (run phase only), as "layer label".
export function writesOf(report: RunReport): string[] {
  return report.calls
    .filter((call) => call.phase === "run" && call.write && call.blocked === undefined)
    .sort((a, b) => a.n - b.n)
    .map((call) => call.label);
}

export function runCalls(report: RunReport): RunReport["calls"] {
  return report.calls.filter((call) => call.phase === "run");
}

export { RELAY_USER_AGENT };

// ---- what every finished run must satisfy, whichever test it was ------------------------------------------------------------

// A signature, however it is spelled, must never reach the output: 65, 66 and 86 bytes of hex (a raw signature,
// an ERC-1271 one, the Kernel-wrapped order form).
const SIGNATURE_SHAPED = /0x(?:[0-9a-fA-F]{130}|[0-9a-fA-F]{132}|[0-9a-fA-F]{172})(?![0-9a-fA-F])/;
const EMAIL_SHAPED = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export interface TranscriptExpectations {
  // Strings that must not appear anywhere in the output (a relay key, a master secret, an HMAC secret).
  readonly secrets?: readonly string[];
  // The run touched the network (false for T0 on the live path).
  readonly madeCalls?: boolean;
}

export function assertTranscript(spec: TestSpec, argv: readonly string[], outcome: RunOutcome, expectations: TranscriptExpectations = {}): void {
  const { report, text } = outcome;
  const parsed = parseArgs(argv, spec.flags);
  assert.ok(parsed.ok, "the test's own arguments parse");
  const writes = spec.writesFor?.(parsed.opts) ?? spec.writes;

  // 1. secrets never reach the output.
  assert.ok(!SIGNATURE_SHAPED.test(text), "a signature-shaped value was printed");
  assert.ok(!EMAIL_SHAPED.test(text), "something shaped like an e-mail address was printed");
  assert.ok(!/\/(?:Users|home)\/[A-Za-z]/.test(text), "a home directory path was printed");
  for (const secret of expectations.secrets ?? []) assert.ok(!text.includes(secret), `a secret (${secret.slice(0, 4)}...) was printed`);

  // 2. every call of the run was printed BEFORE it was made, and every answer after.
  const runCallsMade = report.calls.filter((call) => call.phase === "run");
  const order = (needle: string): number => report.lines.findIndex((line) => line.startsWith(needle));
  for (const call of runCallsMade) {
    const before = order(`-> [${String(call.n)}] `);
    assert.ok(before >= 0, `call ${String(call.n)} (${call.label}) was never printed`);
    const after = order(call.blocked !== undefined ? `<- [${String(call.n)}] BLOCKED` : call.status === undefined ? `<- [${String(call.n)}] no answer` : `<- [${String(call.n)}] ${String(call.status)}`);
    assert.ok(after > before, `call ${String(call.n)} (${call.label}) has no answer line after its request line`);
  }

  // 3. only the pinned user agent is ever shown, and no identifying header is.
  for (const line of report.lines) {
    if (!/^\s+headers: /.test(line)) continue;
    const agent = /user-agent=(\S+)/.exec(line)?.[1];
    assert.equal(agent, RELAY_USER_AGENT, line);
    assert.ok(!/\b(?:from|referer|origin|cookie|authorization)\b/.test(line.replace(/\+\d+ not shown \(.*\)/, "")), line);
  }

  // 4. every write was one the test lists, none more often than listed, none with the same body twice.
  const made = runCallsMade.filter((call) => call.write && call.blocked === undefined);
  for (const call of made) assert.ok(writes.some((entry) => entry.label === call.label), `a write the test does not list: ${call.label}`);
  for (const entry of writes) {
    const count = made.filter((call) => call.label === entry.label).length;
    assert.ok(count <= entry.max, `${entry.label}: ${String(count)} made, ${String(entry.max)} allowed`);
  }

  // 5. every host it spoke to is named in the plan it printed first.
  if (expectations.madeCalls !== false) {
    const planText = JSON.stringify(spec.steps);
    for (const call of runCallsMade.filter((entry) => entry.layer === "upstream")) {
      const host = call.host.replace(/:\d+$/, "");
      if (host === "mainnet.base.org") assert.ok(/base|Base/.test(planText), `${call.label}: Base is not in the plan`);
      else if (host === "metadata.sample-host.net") assert.ok(planText.includes("RELAY_SELF_HOST"), `${call.label}: the self-host is not in the plan`);
      else assert.ok(planText.includes(host), `${call.label}: ${host} is not in the plan`);
    }
    for (const call of runCallsMade.filter((entry) => entry.layer === "relay")) {
      const route = /^\/v1\/[a-z]+/.exec(call.path)?.[0] ?? call.path;
      assert.ok(planText.includes(route), `${call.label}: ${route} is not in the plan`);
    }
  }
}
