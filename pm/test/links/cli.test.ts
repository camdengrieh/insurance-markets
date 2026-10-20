import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { APPROVAL_ACK } from "../../links/approve.js";
import { runCli, type CliEnv } from "../../links/cli.js";
import { SHIPPED_BUNDLE_PIN } from "../../links/shipped-data.js";
import { NOW, TODAY, identityCandidate, nearIdentityCandidate } from "./fixtures.js";
import { cliGoldSet, cliPredictions } from "./goldset-fixtures.js";

const HERE = dirname(fileURLToPath(import.meta.url));

// `typed` models the person at the terminal: "copy" types what the prompt asks for, null is a
// non-interactive stdin, any other string is a wrong answer.
function makeEnv(initial: Record<string, string> = {}, typed: "copy" | string | null = "copy") {
  const prompts: string[] = [];
  const files = new Map<string, string>(Object.entries(initial));
  const out: string[] = [];
  const err: string[] = [];
  const env: CliEnv = {
    files: {
      readText: (p) => {
        const v = files.get(p);
        if (v === undefined) throw new Error(`ENOENT ${p}`);
        return v;
      },
      writeText: (p, t) => void files.set(p, t),
      exists: (p) => files.has(p),
    },
    out: (t) => void out.push(t),
    err: (t) => void err.push(t),
    today: () => TODAY,
    now: () => NOW,
    registryPath: "/mem/registry.json",
    dataDir: "/mem/data",
    confirm: (question) => {
      prompts.push(question);
      if (typed === null) return null;
      if (typed !== "copy") return typed;
      const m = /\(([0-9a-f]{8})\)/.exec(question);
      return m === null ? "" : (m[1] as string);
    },
  };
  const lastJson = (): any => JSON.parse(out.join(""));
  const run = async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    return runCli(argv, env);
  };
  return { env, files, out, err, run, lastJson, prompts };
}

async function proposeAndGetId(h: ReturnType<typeof makeEnv>, candidate = identityCandidate(), source = "structural"): Promise<string> {
  h.files.set("/mem/cand.json", JSON.stringify(candidate));
  const code = await h.run("propose", "--file", "/mem/cand.json", "--source", source, "--by", "gen-structural");
  assert.equal(code, 0, h.err.join(""));
  return h.lastJson().linkId as string;
}

async function digestOf(h: ReturnType<typeof makeEnv>, id: string): Promise<string> {
  assert.equal(await h.run("review", id), 0);
  return h.lastJson().sheet.digest as string;
}

test("init creates an empty registry once", async () => {
  const h = makeEnv();
  assert.equal(await h.run("init"), 0);
  assert.equal(h.files.has("/mem/registry.json"), true);
  assert.equal(await h.run("init"), 1);
});

test("end to end: propose, review, approve, export, verify, lookup", async () => {
  const h = makeEnv();
  const id = await proposeAndGetId(h);
  assert.equal(await h.run("list", "--state", "candidate"), 0);
  assert.equal(h.lastJson().length, 1);

  const digest = await digestOf(h, id);
  assert.equal(h.lastJson().sheet.requiredApprovals, 1);
  assert.equal(h.lastJson().approvalAcknowledgement, APPROVAL_ACK);
  // review did not change anything
  assert.equal(await h.run("list", "--state", "approved"), 0);
  assert.equal(h.lastJson().length, 0);

  const approveArgs = ["approve", id, "--reviewer", "reviewer-a", "--date", TODAY, "--evidence", "synthetic: compared rule text", "--digest", digest, "--ack", APPROVAL_ACK];
  assert.equal(await h.run(...approveArgs), 0, h.err.join(""));
  assert.equal(h.lastJson().state, "approved");
  assert.equal(h.lastJson().finalised, true);

  assert.equal(await h.run("export", "--out", "/mem/bundle.json", "--created-at", "2026-10-20T00:00:00Z"), 0, h.err.join(""));
  const pin = h.lastJson().manifestSha256 as string;
  assert.match(pin, /^[0-9a-f]{64}$/);

  assert.equal(await h.run("verify-bundle", "/mem/bundle.json", "--pin", pin), 1); // synthetic refused
  assert.equal(await h.run("verify-bundle", "/mem/bundle.json", "--pin", pin, "--allow-synthetic"), 0, h.err.join(""));
  assert.equal(await h.run("verify-bundle", "/mem/bundle.json", "--pin", "0".repeat(64), "--allow-synthetic"), 1);

  assert.equal(await h.run("lookup", "--bundle", "/mem/bundle.json", "--pin", pin, "--venue", "xo", "--market-id", "SYNTHETIC-xo-0001", "--allow-synthetic"), 0, h.err.join(""));
  const res = h.lastJson();
  assert.equal(res.approved.length, 1);
  assert.equal(res.approved[0].effectiveTierCap, "indicative_discrepancy"); // no gold-set gate yet
});

test("approve refuses every missing or wrong input and changes nothing", async () => {
  const h = makeEnv();
  const id = await proposeAndGetId(h);
  const digest = await digestOf(h, id);
  const base = ["approve", id, "--reviewer", "reviewer-a", "--date", TODAY, "--evidence", "e", "--digest", digest, "--ack", APPROVAL_ACK];
  const without = (flag: string): string[] => {
    const i = base.indexOf(flag);
    return [...base.slice(0, i), ...base.slice(i + 2)];
  };
  for (const flag of ["--reviewer", "--date", "--digest", "--ack"]) {
    assert.equal(await h.run(...without(flag)), 2, flag); // usage error
  }
  assert.equal(await h.run(...without("--evidence")), 1); // no evidence
  const swap = (flag: string, value: string): string[] => base.map((a, i) => (base[i - 1] === flag ? value : a));
  assert.equal(await h.run(...swap("--ack", "ok")), 1);
  assert.equal(await h.run(...swap("--digest", "0".repeat(64))), 1);
  assert.equal(await h.run(...swap("--reviewer", "llm-judge")), 1);
  assert.equal(await h.run(...swap("--date", "2099-01-01")), 1);
  assert.equal(await h.run("approve", id, "--bogus-flag", "x"), 2);
  assert.equal(await h.run("approve"), 2);
  assert.equal(await h.run("list", "--state", "approved"), 0);
  assert.equal(h.lastJson().length, 0);
});

test("propose rejects smuggled state and writes nothing", async () => {
  const h = makeEnv();
  await h.run("init");
  const before = h.files.get("/mem/registry.json");
  h.files.set("/mem/bad.json", JSON.stringify({ ...identityCandidate(), state: "approved", reviewer: "reviewer-a" }));
  assert.equal(await h.run("propose", "--file", "/mem/bad.json", "--source", "manual", "--by", "reviewer-a"), 1);
  assert.equal(h.files.get("/mem/registry.json"), before);
  assert.equal(await h.run("propose", "--file", "/mem/bad.json", "--source", "oracle", "--by", "x1"), 2);
  assert.equal(await h.run("propose", "--file", "/mem/missing.json", "--source", "manual", "--by", "reviewer-a"), 2);
});

test("an LLM-sourced proposal that claims deterministic proof is refused; an honest one is a candidate", async () => {
  const h = makeEnv();
  h.files.set("/mem/c.json", JSON.stringify(identityCandidate("0030")));
  assert.equal(await h.run("propose", "--file", "/mem/c.json", "--source", "llm", "--by", "gen-llm"), 1);
  const honest = identityCandidate("0030");
  honest.proof = { level: "P3_llm_assisted", evidence: [{ method: "llm_quoted", detail: "synthetic" }] };
  h.files.set("/mem/c.json", JSON.stringify(honest));
  assert.equal(await h.run("propose", "--file", "/mem/c.json", "--source", "llm", "--by", "gen-llm"), 0, h.err.join(""));
  assert.equal(h.lastJson().state, "candidate");
});

test("suspend, veto and revoke through the CLI", async () => {
  const h = makeEnv();
  const id = await proposeAndGetId(h);
  const digest = await digestOf(h, id);
  await h.run("approve", id, "--reviewer", "reviewer-a", "--date", TODAY, "--evidence", "e", "--digest", digest, "--ack", APPROVAL_ACK);
  assert.equal(await h.run("suspend", id, "--by", "pin-checker", "--reason", "hash changed"), 0, h.err.join(""));
  await h.run("list", "--state", "suspended");
  assert.equal(h.lastJson().length, 1);
  assert.equal(await h.run("veto", id, "--by", "gen-llm", "--source", "llm", "--reason", "entity swap"), 0);
  assert.equal(await h.run("revoke", id, "--by", "llm-judge", "--reason", "x"), 1);
  assert.equal(await h.run("revoke", id, "--by", "reviewer-a", "--reason", "wrong question"), 0);
  await h.run("list", "--state", "revoked");
  assert.equal(h.lastJson().length, 1);
  // revoked is final: approval is refused
  const d2 = await digestOf(h, id);
  assert.equal(await h.run("approve", id, "--reviewer", "reviewer-a", "--date", TODAY, "--evidence", "e", "--digest", d2, "--ack", APPROVAL_ACK), 1);
});

test("two-key approval through the CLI", async () => {
  const h = makeEnv();
  const c = nearIdentityCandidate("0040");
  c.relation = "partition";
  c.exhaustiveness = "E2_by_rule_clause";
  c.basis = { class: "identical", axes: [], cutoffDeltaMinutes: 0 };
  c.proof = { level: "P1_slot_equal", evidence: [{ method: "slot_equal", detail: "synthetic" }] };
  delete c.templateId;
  const id = await proposeAndGetId(h, c);
  const digest = await digestOf(h, id);
  const args = (who: string): string[] => ["approve", id, "--reviewer", who, "--date", TODAY, "--evidence", "e", "--digest", digest, "--ack", APPROVAL_ACK];
  assert.equal(await h.run(...args("reviewer-a")), 0, h.err.join(""));
  assert.equal(h.lastJson().finalised, false);
  assert.equal(h.lastJson().state, "candidate");
  assert.equal(await h.run(...args("reviewer-a")), 1);
  assert.equal(await h.run(...args("reviewer-b")), 0);
  assert.equal(h.lastJson().state, "approved");
});

test("hash prints hashes only, never the rule text", async () => {
  const h = makeEnv();
  const vectors = JSON.parse(readFileSync(join(HERE, "../../links/golden/hash-vectors.json"), "utf8")) as { records: { venue: string; record: unknown; rulesSha256: string; maskedSha256: string }[] };
  const kalshi = vectors.records.find((r) => r.venue === "kalshi")!;
  h.files.set("/mem/rec.json", JSON.stringify(kalshi.record));
  assert.equal(await h.run("hash", "--venue", "kalshi", "--record", "/mem/rec.json"), 0, h.err.join(""));
  const text = h.out.join("");
  const res = JSON.parse(text);
  assert.equal(res.rulesSha256, kalshi.rulesSha256);
  assert.equal(res.maskedSha256, kalshi.maskedSha256);
  assert.equal(text.includes("SYNTHETIC primary rule"), false);
  assert.equal([...h.files.keys()].every((k) => k === "/mem/rec.json"), true); // nothing was written
  assert.equal(await h.run("hash", "--venue", "opinion", "--record", "/mem/rec.json"), 1);
});

test("export --write-shipped refuses synthetic fixtures and writes the pinned triple for an empty set", async () => {
  const h = makeEnv();
  await proposeAndGetId(h);
  assert.equal(await h.run("export", "--write-shipped", "--include-candidates", "--created-at", "2026-10-20T00:00:00Z"), 1);
  assert.equal(h.files.has("/mem/data/links.bundle.json"), false);

  const e = makeEnv();
  assert.equal(await e.run("export", "--write-shipped", "--created-at", "2026-10-20T00:00:00Z"), 0, e.err.join(""));
  assert.equal(e.lastJson().counts.approved, 0);
  assert.equal(e.files.get("/mem/data/links.bundle.pin")?.trim(), SHIPPED_BUNDLE_PIN);
  assert.ok(e.files.get("/mem/shipped-data.ts")?.includes(SHIPPED_BUNDLE_PIN));
});

test("goldset validate and eval run on a built synthetic gold set", async () => {
  const gold = JSON.stringify(cliGoldSet());
  const preds = JSON.stringify(cliPredictions());
  const h = makeEnv({ "/mem/gold.json": gold, "/mem/preds.json": preds });
  assert.equal(await h.run("goldset", "validate", "--gold", "/mem/gold.json"), 0, h.err.join(""));
  assert.equal(await h.run("goldset", "eval", "--gold", "/mem/gold.json", "--predictions", "/mem/preds.json"), 0, h.err.join(""));
  const text = h.out.join("");
  assert.match(text, /Gold-set evaluation of generator "SYNTHETIC-generator"/);
  assert.match(text, /Executable stays unproven/);
  assert.equal(await h.run("goldset", "eval", "--gold", "/mem/gold.json", "--predictions", "/mem/preds.json", "--json"), 0);
  assert.equal(h.lastJson().certifiable, true);
  assert.equal(await h.run("goldset"), 2);
  assert.equal(await h.run("goldset", "validate", "--gold", "/mem/nope.json"), 2);
});

test("unknown commands, missing arguments and unknown flags are usage errors", async () => {
  const h = makeEnv();
  assert.equal(await h.run(), 2);
  assert.equal(await h.run("promote-all"), 2);
  assert.equal(await h.run("show"), 2);
  assert.equal(await h.run("show", "lnk_x"), 1);
  assert.equal(await h.run("list", "--no-such-flag"), 2);
});

test("LS-2: approval needs an interactive terminal and the typed digest prefix; nothing changes otherwise", async () => {
  for (const typed of [null, "", "00000000", "reviewer-a"] as const) {
    const h = makeEnv({}, typed);
    const id = await proposeAndGetId(h);
    const digest = await digestOf(h, id);
    const args = ["approve", id, "--reviewer", "reviewer-a", "--date", TODAY, "--evidence", "e", "--digest", digest, "--ack", APPROVAL_ACK];
    assert.equal(await h.run(...args), 1, String(typed));
    assert.equal(h.prompts.length, 1);
    assert.ok(h.prompts[0]?.includes(digest.slice(0, 8)));
    assert.equal(h.err.join("").includes(typed === null ? "interactive terminal" : "does not match"), true, h.err.join(""));
    await h.run("list", "--state", "approved");
    assert.equal(h.lastJson().length, 0);
  }
  const ok = makeEnv({}, "copy");
  const id = await proposeAndGetId(ok);
  const digest = await digestOf(ok, id);
  assert.equal(await ok.run("approve", id, "--reviewer", "reviewer-a", "--date", TODAY, "--evidence", "e", "--digest", digest, "--ack", APPROVAL_ACK), 0, ok.err.join(""));
  assert.equal(ok.lastJson().state, "approved");
});
