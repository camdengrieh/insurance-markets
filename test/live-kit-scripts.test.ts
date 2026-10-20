import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { RELAY_USER_AGENT } from "../src/relay/contract.js";
import { listing } from "../scripts/live/index.js";
import { ALL_SPECS, specById } from "../scripts/live/lib/registry.js";
import { PASS_THROUGH } from "../scripts/live/lib/relay.js";
import { PRECONDITION_DEDICATED } from "../scripts/live/lib/text.js";
import type { TestSpec } from "../scripts/live/lib/types.js";
import { runOnMock } from "./live-kit-helpers.js";

// Properties every live-kit script must have, checked on all eleven of them: what they cost, what they print
// before they do anything, what makes them refuse, and that nothing in them can identify a person.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// The worst case of docs/phase1-gap-closing.md section 6, reconciled by amendment A10 (the cap multiplier of 1000 bps
// on every BUY, the probes' orders, the seed cap of $10.80). A script may declare LESS than this, never more.
const WORST_CASE_USD: Readonly<Record<string, string>> = {
  T0: "0",
  T1: "0",
  T2: "0",
  T3a: "3",
  T4: "3",
  T3b: "0.66",
  T3c: "1.10",
  T5: "0",
  T8: "1.43",
  T6: "1",
  T6b: "10.8",
};

// Arguments that make a script's own required options valid.
function required(spec: TestSpec): string[] {
  const extra: string[] = [];
  if (spec.id === "T3a" || spec.id === "T4") extra.push("--amount-usd", "1");
  return extra;
}

const micro = (usd: string): bigint => {
  const [whole, fraction = ""] = usd.split(".");
  return BigInt(whole as string) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
};

let fetched: string[] = [];
const realFetch = globalThis.fetch;
beforeEach(() => {
  fetched = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url));
    throw new Error("the test has no network");
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("the eleven tests of docs/phase1-gap-closing.md section 6", () => {
  it("exist, in the recommended order, one script each", () => {
    assert.deepEqual(
      ALL_SPECS.map((spec) => spec.id),
      ["T0", "T1", "T2", "T3a", "T4", "T3b", "T3c", "T5", "T8", "T6", "T6b"],
    );
    for (const spec of ALL_SPECS) {
      assert.ok(existsSync(join(ROOT, "scripts", "live", `${spec.slug}.ts`)), `${spec.slug}.ts`);
      assert.equal(specById(spec.id.toLowerCase()), spec);
    }
    assert.equal(new Set(ALL_SPECS.map((spec) => spec.slug)).size, ALL_SPECS.length);
  });

  it("declare a worst case that matches the reconciled table, and a stop rule, settled items and preconditions", () => {
    for (const spec of ALL_SPECS) {
      assert.equal(spec.worstCaseUsd, WORST_CASE_USD[spec.id], `${spec.id} worst case`);
      assert.ok(spec.stopRule.length > 20, `${spec.id} stop rule`);
      assert.ok(spec.settles.length > 0, `${spec.id} settles`);
      assert.ok(spec.costNote.length > 10, `${spec.id} cost note`);
      assert.ok(spec.preconditions.includes(PRECONDITION_DEDICATED), `${spec.id} states the dedicated-wallet precondition (A4)`);
      assert.ok(new Set(spec.steps.map((step) => step.id)).size === spec.steps.length, `${spec.id} step ids are unique`);
      for (const step of spec.steps) assert.ok(step.calls.length > 0, `${spec.id}/${step.id} lists its calls`);
    }
  });

  it("never plan to put more at risk than their worst case, and the exposure is never above the budget the default options need", () => {
    for (const spec of ALL_SPECS) {
      assert.ok(micro(spec.worstCaseUsd) >= 0n);
      for (const step of spec.steps) if (step.exposureUsd !== undefined) assert.ok(micro(step.exposureUsd) <= micro(spec.worstCaseUsd), `${spec.id}/${step.id} exposure`);
    }
  });

  it("only write behind a flag that defaults off: every script that sends a write arms exactly the flags it needs, for its own relay", () => {
    for (const spec of ALL_SPECS) {
      const hasWrite = spec.steps.some((step) => step.write === true);
      if (hasWrite && spec.id !== "T3a" && spec.id !== "T0") assert.ok(spec.flagsToArm.length > 0, `${spec.id} arms its flags`);
      for (const flag of spec.flagsToArm) assert.match(flag, /^(?:ENABLE_[A-Z_]+|XO_ENABLE_CREATE)$/);
    }
    assert.deepEqual(specById("T0")?.flagsToArm, [], "T0 writes nothing that needs a flag");
  });

  it("the index lists every test with its worst case", () => {
    const text = listing().join("\n");
    for (const spec of ALL_SPECS) {
      assert.ok(text.includes(spec.id) && text.includes(spec.slug) && text.includes(`$${spec.worstCaseUsd}`), spec.id);
    }
  });
});

describe("every script, before it does anything", () => {
  for (const spec of ALL_SPECS) {
    describe(`${spec.id} ${spec.slug}`, () => {
      it("--dry-run prints the plan with every call, costs and the stop rule, and touches nothing", async () => {
        const outcome = await runOnMock(spec, ["--dry-run", ...required(spec)], undefined);
        assert.equal(outcome.report.status, "dry_run");
        assert.equal(outcome.report.exitCode, 0);
        assert.deepEqual(outcome.report.calls, []);
        assert.deepEqual(fetched, []);
        const text = outcome.scripted.out.join("\n");
        assert.ok(text.includes(spec.title) && text.includes(spec.stopRule), "title and stop rule");
        assert.ok(text.includes(`worst case:    $${spec.worstCaseUsd}`));
        assert.match(text, /DRY RUN: nothing was sent, signed or recorded/);
        for (const step of spec.steps) {
          assert.ok(text.includes(step.title), `${step.id}: ${step.title}`);
          for (const call of step.calls) assert.ok(text.includes(call.target), `${step.id}: ${call.target}`);
        }
        // Every host a plan names is a real XO or Base host, in the clear.
        assert.doesNotMatch(text, /127\.0\.0\.1:\d{3,5}\//, "the plan names real hosts, not the mock's ports");
      });

      it("without --confirm it refuses, prints the plan, sends nothing and exits 2", async () => {
        const outcome = await runOnMock(spec, ["--budget-usd", spec.worstCaseUsd, ...required(spec)], undefined);
        assert.equal(outcome.report.status, "refused");
        assert.equal(outcome.report.exitCode, 2);
        assert.match(outcome.text, /--confirm was not given/);
        assert.deepEqual(outcome.report.calls, []);
        assert.deepEqual(fetched, []);
        assert.match(outcome.scripted.out.join("\n"), new RegExp(spec.title.replace(/[()]/g, ".")));
      });

      it("without an explicit --budget-usd it refuses, even though it costs nothing", async () => {
        const outcome = await runOnMock(spec, ["--confirm", ...required(spec)], undefined);
        assert.equal(outcome.report.status, "refused");
        assert.equal(outcome.report.exitCode, 2);
        assert.match(outcome.text, /--budget-usd is required/);
        assert.deepEqual(outcome.report.calls, []);
      });

      it("with a budget above its worst case it refuses", async () => {
        const above = (Number(spec.worstCaseUsd) + 0.01).toFixed(2);
        const outcome = await runOnMock(spec, ["--confirm", "--budget-usd", above, ...required(spec)], undefined);
        assert.equal(outcome.report.status, "refused");
        assert.match(outcome.text, /above the worst case/);
        assert.deepEqual(outcome.report.calls, []);
      });

      it("refuses everything while the kill switch is on", async () => {
        const outcome = await runOnMock(spec, ["--confirm", "--budget-usd", spec.worstCaseUsd, ...required(spec)], undefined, { env: { KILL: "1" } });
        assert.equal(outcome.report.status, "refused");
        assert.match(outcome.text, /kill switch/);
        assert.deepEqual(outcome.report.calls, []);
      });

      it("on the live target it refuses without the acknowledgement for this test, and sends nothing", async () => {
        const argv = ["--target=live", "--confirm", "--budget-usd", spec.worstCaseUsd, "--owner", OWNER, "--data-dir", "data", "--credential-id", "c", ...required(spec), ...liveRequired(spec)];
        const noAck = await runOnMock(spec, argv, undefined, { env: {} });
        assert.equal(noAck.report.status, "refused");
        assert.match(noAck.text, new RegExp(`XO_LIVE_ACK=${spec.id}`));
        const otherAck = await runOnMock(spec, argv, undefined, { env: { XO_LIVE_ACK: spec.id === "T0" ? "T1" : "T0" } });
        assert.equal(otherAck.report.status, "refused", "another test's acknowledgement does not count");
        assert.deepEqual(noAck.report.calls, []);
        assert.deepEqual(fetched, []);
      });

      it("--help shows its own options and the common ones and exits 0", async () => {
        const outcome = await runOnMock(spec, ["--help"], undefined);
        assert.equal(outcome.report.exitCode, 0);
        const text = outcome.scripted.out.join("\n");
        for (const name of ["--confirm", "--budget-usd", "--target", ...spec.flags.map((flag) => `--${flag.name}`)]) assert.ok(text.includes(name), name);
      });

      it("an unknown option is a refusal, not a guess", async () => {
        const outcome = await runOnMock(spec, ["--confirm", "--budget-usd", "0", "--frobnicate"], undefined);
        assert.equal(outcome.report.status, "refused");
        assert.match(outcome.text, /unknown option/);
      });
    });
  }
});

// The few options a script needs on the live target before it will go any further.
function liveRequired(spec: TestSpec): string[] {
  switch (spec.id) {
    case "T3b":
    case "T3c":
    case "T8":
      return ["--token-id", "123"];
    case "T5":
      return ["--condition-id", `0x${"11".repeat(32)}`];
    case "T6":
      return ["--metadata-file", "m.json", "--metadata-uri", "https://example.com/m.json"];
    case "T6b":
      return ["--condition-id", `0x${"22".repeat(32)}`];
    default:
      return [];
  }
}

describe("nothing in the kit can identify a person", () => {
  function* files(directory: string): Generator<string> {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) yield* files(path);
      else if (/\.(?:ts|md)$/.test(entry)) yield path;
    }
  }
  const kit = [...files(join(ROOT, "scripts", "live")), join(ROOT, "docs", "runbook.md"), ...readdirSync(ROOT.concat("test")).filter((name) => name.startsWith("live-kit-")).map((name) => join(ROOT, "test", name))].filter(existsSync);

  it("has files to look at", () => {
    assert.ok(kit.length > 20);
    assert.ok(kit.some((path) => path.endsWith("runbook.md")), "the runbook exists");
  });

  it("holds no e-mail address, no home directory path and no session path", () => {
    for (const path of kit) {
      const text = readFileSync(path, "utf8");
      const name = relative(ROOT, path);
      assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/, `${name}: an e-mail address`);
      assert.doesNotMatch(text, /\/(?:Users|home)\/(?!example\b)[A-Za-z][\w.-]*\//, `${name}: a home directory path`);
      assert.doesNotMatch(text, /\/private\/tmp\/|claude-\d{2,}/, `${name}: a session path`);
    }
  });

  it("sets no user agent of its own: the only one is the contract's pinned value", () => {
    assert.equal(RELAY_USER_AGENT, "insurance-markets-xo-plugin/0.2");
    for (const path of kit.filter((entry) => entry.includes(join("scripts", "live")))) {
      const text = readFileSync(path, "utf8");
      const name = relative(ROOT, path);
      assert.doesNotMatch(text, /["']user-agent["']\s*:/i, `${name}: sets a user agent header by hand`);
      assert.doesNotMatch(text, /insurance-markets-research/, `${name}: the research agent is not for the kit`);
      assert.doesNotMatch(text, /\b(?:referer|x-forwarded-for)\b\s*[:=]/i, `${name}: sets an identifying header`);
    }
  });

  it("reads only the environment variables the runbook documents, and documents every one the relay is handed", () => {
    const allowed = new Set(["XO_LIVE_ACK", "KILL", "XO_KILL_SWITCH", "RELAY_MASTER_KEY", "RELAY_BASE_RPC_URL", "XO_BASE_RPC_URL", "XO_RPC_URL", "XO_FUNDING_TEST_AMOUNT_USD", "LIVE_KIT_DEBUG", "RELAY_SELF_HOST"]);
    const runbook = readFileSync(join(ROOT, "docs", "runbook.md"), "utf8");
    for (const path of kit.filter((entry) => entry.includes(join("scripts", "live")))) {
      const text = readFileSync(path, "utf8");
      for (const match of text.matchAll(/(?:\benv|process\.env)\[\s*["']([A-Z][A-Z0-9_]{3,})["']\s*\](?!\s*=[^=])/g)) {
        const variable = match[1] as string;
        if (!allowed.has(variable)) assert.fail(`${relative(ROOT, path)} reads ${variable}, which is not on the documented list`);
        assert.ok(runbook.includes(variable), `${variable} is documented in the runbook`);
      }
    }
    for (const variable of [...allowed, ...PASS_THROUGH]) assert.ok(runbook.includes(variable), `${variable} is in the runbook`);
  });

  it("never fixes a port: every listener is on a free port chosen at run time", () => {
    for (const path of kit.filter((entry) => entry.includes(join("scripts", "live")))) {
      const text = readFileSync(path, "utf8");
      assert.doesNotMatch(text, /\.listen\(\s*\d{2,5}/, `${relative(ROOT, path)}: a fixed port`);
    }
  });
});
