import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { submitLedgerOf } from "../../arming.js";
import { ROUTE_RULES } from "../../tool-classes.js";
import { createInboxModule, inboxOf } from "../../inbox.js";
import { S2_ACK_VALUE, S2_ENABLE_CONDITIONS, S2_FLAG, bridgeModule, gateSubmitPort, s2Acknowledged, s2FlagOn, signerReadiness } from "../../paybox-signer.js";
import { FakeTimers } from "../events/helpers.js";
import { bearer, postJson } from "../server/helpers.js";
import { ARMABLE_ENV, fakeRunner, startGateDaemon, type GateDaemon } from "../tools/helpers.js";
import { CONFIG_DIR, CREDENTIAL, ID_AUTH, ID_ORDER, ID_USEROP, S2_ENV, FakeClient, authItem, deployItem, orderItem } from "./fixtures.js";
import { errorOf, startSignerRig, type SignerRig } from "./rig.js";
import { PayboxSigningPath } from "../../paybox-signer.js";

// Configuration, the start-up line, the default module, the default submit port (the plugin's tools through the tool
// gate) and a source scan of the one file that can start a process.

const rigs: SignerRig[] = [];
const daemons: GateDaemon[] = [];
afterEach(async () => {
  while (rigs.length > 0) await rigs.pop()?.stop();
  while (daemons.length > 0) await daemons.pop()?.stop();
});

describe("the flag and the acknowledgement", () => {
  it("only a recognised on-word turns the flag on", () => {
    for (const on of ["1", "true", "TRUE", "yes", "on", " On "]) assert.equal(s2FlagOn({ [S2_FLAG]: on }), true, on);
    for (const off of [undefined, "", " ", "0", "false", "no", "off", "2", "enabled", "maybe", "y", "t"]) assert.equal(s2FlagOn({ [S2_FLAG]: off }), false, String(off));
    assert.equal(s2FlagOn({}), false);
  });

  it("the acknowledgement names exactly DT1 and DT3", () => {
    assert.equal(S2_ACK_VALUE, "DT1,DT3");
    for (const good of ["DT1,DT3", "dt3,dt1", " DT1 , DT3 "]) assert.equal(s2Acknowledged({ PAYBOX_SIGNER_ACK_DT: good }), true, good);
    for (const bad of [undefined, "", "DT1", "DT3", "DT1,DT1", "DT1,DT3,DT2", "DT1;DT3", "all", "1,3"]) assert.equal(s2Acknowledged({ PAYBOX_SIGNER_ACK_DT: bad }), false, String(bad));
  });

  it("readiness needs the flag, the acknowledgement, an absolute config directory and a credential id", () => {
    assert.equal(signerReadiness(S2_ENV).ready, true);
    assert.deepEqual(signerReadiness({}), { flag: false, acknowledged: false, missing: ["PAYBOX_CONFIG_DIR", "PAYBOX_SIGNER_CREDENTIAL"], ready: false });
    assert.equal(signerReadiness({ ...S2_ENV, ENABLE_PAYBOX_SIGNER: "0" }).ready, false);
    assert.deepEqual(signerReadiness({ ...S2_ENV, PAYBOX_CONFIG_DIR: "config" }).missing, ["PAYBOX_CONFIG_DIR"]);
    assert.deepEqual(signerReadiness({ ...S2_ENV, PAYBOX_CONFIG_DIR: `${CONFIG_DIR}\0x` }).missing, ["PAYBOX_CONFIG_DIR"]);
    // The PayBox CLI takes a credential id only as a UUID (@paybox-sh/sdk 2.2.0), so anything else is not configured.
    for (const bad of ["ab", "cred-test-0001", "Personal wallet", `${CREDENTIAL}x`, CREDENTIAL.replace(/-/g, "")]) {
      assert.deepEqual(signerReadiness({ ...S2_ENV, PAYBOX_SIGNER_CREDENTIAL: bad }).missing, ["PAYBOX_SIGNER_CREDENTIAL"], bad);
    }
    assert.equal(signerReadiness({ ...S2_ENV, PAYBOX_SIGNER_CREDENTIAL: CREDENTIAL.toUpperCase() }).ready, true);
    assert.deepEqual(signerReadiness({ ...S2_ENV, PAYBOX_BIN: "paybox --flag" }).missing, ["PAYBOX_BIN"]);
    assert.equal(signerReadiness({ ...S2_ENV, PAYBOX_BIN: "/opt/paybox/bin/paybox" }).ready, true);
    assert.match(CREDENTIAL, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("the conditions for turning it on are written down", () => {
  it("covers DT1 and DT3, each with what to show and what changes if it differs", () => {
    const tests = new Set(S2_ENABLE_CONDITIONS.map((condition) => condition.test));
    assert.deepEqual([...tests].sort(), ["DT1", "DT3"]);
    assert.equal(new Set(S2_ENABLE_CONDITIONS.map((condition) => condition.id)).size, S2_ENABLE_CONDITIONS.length, "ids are unique");
    for (const condition of S2_ENABLE_CONDITIONS) {
      assert.ok(condition.readFromSource.length > 40, condition.id);
      assert.ok(condition.mustShow.length > 40, condition.id);
      assert.ok(condition.ifDifferent.length > 10, condition.id);
    }
    const ids = S2_ENABLE_CONDITIONS.map((condition) => condition.id);
    for (const required of ["dt1_raw_allowed", "dt1_typed_data_allowed", "dt1_output_shape", "dt3_sign_command", "dt3_credential_listing", "dt3_single_process"]) assert.ok(ids.includes(required), required);
  });

  it("each condition says what was read from the published CLI and what only the live run can show; nothing is a guess", () => {
    for (const condition of S2_ENABLE_CONDITIONS) assert.match(condition.readFromSource, /@paybox-sh\/sdk 2\.2\.0/, condition.id);
    const source = readFileSync(fileURLToPath(new URL("../../paybox-signer.ts", import.meta.url)), "utf8");
    assert.ok(!/GUESS/.test(source), "no GUESS marker is left in the signer");
    assert.ok(!/"--wait"/.test(source), "no command of the flow is built with --wait");
  });
});

describe("the start-up line", () => {
  const startWith = async (env: Record<string, string>): Promise<GateDaemon> => {
    const d = await startGateDaemon({ env, extraModules: [{ name: "inbox", source: createInboxModule({ timers: new FakeTimers() }) }, { name: "paybox-signer", source: bridgeModule }] });
    daemons.push(d);
    return d;
  };

  it("says nothing when the flag is off", async () => {
    const d = await startWith({ ...ARMABLE_ENV });
    assert.ok(!/PayBox signer/i.test(d.stderr.text()));
  });

  it("says it is not ready, and what to set, without printing a value", async () => {
    const d = await startWith({ ...ARMABLE_ENV, ENABLE_PAYBOX_SIGNER: "1", PAYBOX_CONFIG_DIR: CONFIG_DIR });
    assert.match(d.stderr.text(), /PayBox signer \(path S2\) is NOT READY \(PAYBOX_SIGNER_ACK_DT must be DT1,DT3/);
    assert.ok(!d.stderr.text().includes(CONFIG_DIR));
    const acknowledged = await startWith({ ...ARMABLE_ENV, ENABLE_PAYBOX_SIGNER: "1", PAYBOX_SIGNER_ACK_DT: "DT1,DT3" });
    assert.match(acknowledged.stderr.text(), /NOT READY \(set PAYBOX_CONFIG_DIR, PAYBOX_SIGNER_CREDENTIAL\)/);
  });

  it("says it is ready, and that it is unproven", async () => {
    const d = await startWith({ ...S2_ENV });
    assert.match(d.stderr.text(), /PayBox signer \(path S2\) is READY\. It is unproven until DT1 and DT3 are recorded\./);
  });

  it("the default module registers the route and answers flag_off while the flag is off", async () => {
    const d = await startWith({ ...ARMABLE_ENV });
    const ui = await d.uiToken();
    assert.equal((await d.arm(ui, 5)).status, 200);
    const reply = await postJson(d.port, "/ui/inbox/sign", { prepared_id: ID_USEROP }, bearer(d.agentToken));
    assert.equal(reply.status, 403);
    assert.equal(errorOf(reply).code, "flag_off");
  });

  it("a ready default module with no PayBox on this machine answers paybox_missing, and still sends nothing", async () => {
    const d = await startWith({ ...S2_ENV, PAYBOX_BIN: "cockpit-test-no-such-binary-anywhere" });
    const inbox = inboxOf(d.daemon.host);
    inbox.attachSource({
      lookup: (id) => {
        const item = deployItem(id);
        return { id, kind: "userop", owner: String(item["owner"]), account: String(item["account"]), digest: (item["sign"] as { expected_digest: string }).expected_digest, state: "prepared", detail: null };
      },
    });
    assert.equal(inbox.ingest(deployItem(), "agent:0a1b2c3d").ok, true);
    const summary = deployItem()["summary"] as { digest_tag: string; inner_hash_tag: string };
    inbox.recordShown(ID_USEROP, { digest_tag: summary.digest_tag, inner_hash_tag: summary.inner_hash_tag, verification: "verified", failed_checks: [] });
    const ui = await d.uiToken();
    assert.equal((await d.arm(ui, 5)).status, 200);
    // The credential is read first through the CLI; a missing binary is a failed read, not a signature.
    const reply = await postJson(d.port, "/ui/inbox/sign", { prepared_id: ID_USEROP }, bearer(d.agentToken));
    assert.equal(reply.status, 422);
    assert.equal(errorOf(reply).details?.["reason"], "paybox_missing");
    assert.equal(inbox.get(ID_USEROP)?.state, "shown");
  });
});

describe("the route is the one the class table describes", () => {
  it("POST /ui/inbox/sign is registered once, with the submit scope, for agent tokens", async () => {
    const rig = await startSignerRig();
    rigs.push(rig);
    const routes = rig.d.daemon.host.routes().filter((route) => route.key.includes("/ui/inbox/sign"));
    assert.deepEqual(routes, [{ key: "POST /ui/inbox/sign", access: { scope: "submit" } }]);
    assert.deepEqual(ROUTE_RULES["POST /ui/inbox/sign"], { routeClass: "submit", scope: "submit", kinds: ["agent"] });
  });
});

describe("the default submit port: the plugin's own submit tools, through the tool gate", () => {
  async function gated(): Promise<{ rig: SignerRig; runner: ReturnType<typeof fakeRunner> }> {
    const runner = fakeRunner();
    const rig = await startSignerRig({ signer: { path: new PayboxSigningPath(new FakeClient()), submit: (host) => gateSubmitPort(host, runner) } });
    rigs.push(rig);
    return { rig, runner };
  }

  for (const [make, id, tool, step] of [
    [deployItem, ID_USEROP, "xo_submit_userop", false],
    [orderItem, ID_ORDER, "xo_submit_order", false],
    [authItem, ID_AUTH, "xo_connect", true],
  ] as const) {
    it(`${tool} gets the prepared id and the signature, and nothing else`, async () => {
      const { rig, runner } = await gated();
      rig.show(make());
      await rig.armed();
      const reply = await rig.sign(id);
      assert.equal(reply.status, 200, reply.text);
      assert.equal(runner.calls.length, 1);
      assert.equal(runner.calls[0]?.tool, tool);
      const args = runner.calls[0]?.args ?? {};
      assert.deepEqual(Object.keys(args).sort(), step ? ["prepared_id", "signature", "step"] : ["prepared_id", "signature"]);
      assert.equal(args["prepared_id"], id);
      assert.match(String(args["signature"]), /^0x[0-9a-f]{130}$/);
      if (step) assert.equal(args["step"], "submit");
      const calls = rig.d.audit.filter((record) => record.ev === "agent.call");
      assert.ok(calls.some((record) => record.tool === tool && record.outcome === "ok"));
      assert.ok(!JSON.stringify(rig.d.audit).includes(String(args["signature"]).slice(2)), "the signature is in no audit record");
    });
  }

  it("the gate's own refusals apply: an item whose submit is already claimed is never forwarded", async () => {
    const { rig, runner } = await gated();
    rig.show(deployItem());
    await rig.armed();
    submitLedgerOf(rig.d.daemon.host).claim(`p:${ID_USEROP}`);
    const reply = await rig.sign(ID_USEROP);
    assert.equal(reply.status, 409);
    assert.equal(errorOf(reply).code, "prepared_used");
    assert.equal(runner.calls.length, 0);
  });

  it("a tool that refuses, errors, is cut off or says ambiguous", async () => {
    const cases: Array<[Parameters<typeof runnerNext>[0], number, string]> = [
      [{ isError: true, text: null, structured: { outcome: "refused", code: "flag_off" } }, 403, "flag_off"],
      [{ isError: true, text: null, structured: { outcome: "refused" } }, 422, "precondition_failed"],
      [{ isError: true, text: null, structured: { code: "upstream_rejected" } }, 502, "upstream_rejected"],
      [{ isError: true, text: null, structured: null, thrown: true }, 409, "ambiguous"],
      [{ isError: false, text: null, structured: { outcome: "ambiguous", code: "ambiguous" } }, 409, "ambiguous"],
      [{ isError: false, text: null, structured: { outcome: "pending" } }, 200, ""],
    ];
    for (const [result, status, code] of cases) {
      const { rig, runner } = await gated();
      runner.next = runnerNext(result);
      rig.show(deployItem());
      await rig.armed();
      const reply = await rig.sign(ID_USEROP);
      assert.equal(reply.status, status, JSON.stringify(result));
      if (code !== "") assert.equal(errorOf(reply).code, code);
    }
  });
});

function runnerNext(result: { isError: boolean; text: string | null; structured: unknown; thrown?: boolean }): () => typeof result {
  return () => result;
}

describe("the one file that can start a process", () => {
  const source = readFileSync(fileURLToPath(new URL("../../paybox-signer.ts", import.meta.url)), "utf8");
  const code = source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  it("starts a process in exactly one place, with an argument array and no shell", () => {
    assert.equal((code.match(/\bspawn\(/g) ?? []).length, 1);
    assert.match(code, /shell: false/);
    assert.ok(!/shell:\s*true/.test(code));
    assert.ok(!/\b(?:exec|execSync|execFile|execFileSync|fork|spawnSync)\b/.test(code));
    assert.match(code, /stdio: \["ignore", "pipe", "pipe"\]/);
  });

  it("does not touch the disk, the network or the console, and reads the environment only through the host", () => {
    for (const pattern of [/node:fs/, /\bfs\./, /readFile|writeFile|appendFile|createWriteStream|createReadStream|mkdir|rmSync|unlink/, /node:(?:net|http|https|http2|dgram|tls|dns)\b/, /\bfetch\(/, /XMLHttpRequest|WebSocket/, /console\./, /process\.(?:stdout|stderr|env)/, /\beval\(|new Function\(/]) {
      assert.ok(!pattern.test(code), String(pattern));
    }
  });

  it("holds no key, token or personal identifier", () => {
    for (const pattern of [/pbxk1\.[A-Za-z0-9]/, /pbx_live_[A-Za-z0-9]/, /\bck[ua]_[A-Za-z0-9_-]{20,}/, /\/Users\/|\/home\/[a-z]/, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i]) {
      assert.ok(!pattern.test(source), String(pattern));
    }
  });

  it("signs nothing but through the vetted path: no other op name is built anywhere", () => {
    for (const op of ["message", "transaction", "authorization", "personal_sign", "eth_sign"]) {
      assert.ok(!new RegExp(`op:\\s*"${op}"`).test(code), op);
    }
  });
});
