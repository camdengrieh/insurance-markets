import assert from "node:assert/strict";
import { request as httpRequest, type ClientRequest } from "node:http";
import { afterEach, describe, it } from "node:test";

import { ARM_CODE_PATTERN, ARM_CODE_TTL_S, TOKEN_SCAN_PATTERN, armConfirmResponseSchema, armResponseSchema, bridgeErrorResponseSchema, disarmResponseSchema } from "../../contract.js";
import { ARM_CODE_ALPHABET, MAX_ARM_ATTEMPTS, SubmitLedger, SUBMIT_LEDGER_MAX, SUBMIT_LEDGER_TTL_MS, armControllerOf, attachEffectiveFlags, mintArmCode, postureOf } from "../../arming.js";
import { bridgeModule as realEventsModule } from "../../events.js";
import { bearer, postJson, seededRandom } from "../server/helpers.js";
import { ARMABLE_ENV, startGateDaemon, type GateDaemon } from "./helpers.js";

const started: GateDaemon[] = [];
const open: ClientRequest[] = [];
afterEach(async () => {
  for (const req of open.splice(0)) req.destroy();
  while (started.length > 0) await started.pop()?.stop();
});
async function gate(options: Parameters<typeof startGateDaemon>[0] = { env: ARMABLE_ENV }): Promise<GateDaemon> {
  const daemon = await startGateDaemon(options);
  started.push(daemon);
  return daemon;
}

const code = (reply: { json(): unknown }): string => bridgeErrorResponseSchema.parse(reply.json()).error.code;
const ID = "ab".repeat(16);
const armCodeOf = (d: GateDaemon): string => {
  const matches = [...d.stderr.text().matchAll(/ARM code ([2-9A-HJ-NP-Z]{8})/g)];
  const last = matches.at(-1)?.[1];
  assert.ok(last, "an ARM code is on stderr");
  return last;
};

describe("opening the window needs a human at the keyboard", () => {
  it("prints the code on stderr only and answers that a code was printed", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    assert.equal(reply.status, 200);
    const body = armResponseSchema.parse(reply.json());
    assert.equal(body.state, "code_printed");
    const printed = armCodeOf(d);
    assert.match(printed, ARM_CODE_PATTERN);
    assert.ok(!reply.text.includes(printed), "the code is not in the response");
    assert.equal(body.code_expires_at, new Date(d.clock.now + ARM_CODE_TTL_S * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"));
  });

  it("opens the window with the right code and reports when it closes", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    const confirmed = await d.arm(ui, 3);
    assert.equal(confirmed.status, 200);
    const body = armConfirmResponseSchema.parse(confirmed.json());
    assert.equal(body.armed_until, new Date(d.clock.now + 3 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"));
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    assert.equal(postureOf(d.daemon.host, ["read", "prepare"]), "ARMED");
  });

  it("refuses a window of more than ten minutes, or none", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    for (const minutes of [11, 0, -1, 2.5, "5"]) assert.equal((await postJson(d.port, "/ui/arm", { minutes }, bearer(ui))).status, 400, String(minutes));
    assert.equal(d.stderr.text().includes("ARM code"), false);
  });

  it("refuses an agent token, whatever its scopes: only the page can arm", async () => {
    const d = await gate();
    const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(d.agentToken));
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
    assert.equal(d.stderr.text().includes("ARM code"), false);
    const confirm = await postJson(d.port, "/ui/arm/confirm", { code: "AAAAAAAA" }, bearer(d.agentToken));
    assert.equal(confirm.status, 403);
  });

  it("does nothing when every ENABLE_ flag is off: arming is refused and no code is printed", async () => {
    const d = await gate({ env: {} });
    const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(await d.uiToken()));
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "flag_off");
    assert.equal(d.stderr.text().includes("ARM code"), false);
    assert.equal(d.audit.find((record) => record.ev === "ui.arm")?.outcome, "refused");
  });

  it("does not count the kill switch or a garbage flag as a write flag", async () => {
    for (const env of [{ KILL: "1", ENABLE_TRADING: "0" }, { ENABLE_TRADING: "maybe" }] as Array<Record<string, string>>) {
      const d = await gate({ env });
      const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(await d.uiToken()));
      assert.equal(reply.status, env["KILL"] === undefined ? 403 : 503, JSON.stringify(env));
    }
  });

  it("refuses on a read-only instance", async () => {
    const d = await gate({ env: ARMABLE_ENV, role: "read_only" });
    const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(await d.uiToken()));
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "scope_denied");
  });

  it("refuses to arm again while a window is open", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await d.arm(ui);
    const again = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    assert.equal(again.status, 422);
    assert.equal(code(again), "precondition_failed");
  });
});

describe("the code", () => {
  it("is eight characters from an alphabet with no 0, 1, I or O, drawn without bias", () => {
    assert.equal(ARM_CODE_ALPHABET.length, 32);
    assert.equal(new Set(ARM_CODE_ALPHABET).size, 32);
    assert.doesNotMatch(ARM_CODE_ALPHABET, /[01IO]/);
    const random = seededRandom("arm-codes");
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i += 1) {
      const minted = mintArmCode(random);
      assert.match(minted, ARM_CODE_PATTERN);
      seen.add(minted);
      for (const char of minted) counts.set(char, (counts.get(char) ?? 0) + 1);
    }
    assert.equal(seen.size, 2000);
    assert.equal(counts.size, 32);
    // 16000 draws over 32 symbols: each about 500; a biased draw would sit far outside this band.
    for (const count of counts.values()) assert.ok(count > 380 && count < 620, String(count));
  });

  it("is single use", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await d.arm(ui);
    const printed = armCodeOf(d);
    armControllerOf(d.daemon.host).disarm("user");
    const reuse = await postJson(d.port, "/ui/arm/confirm", { code: printed }, bearer(ui));
    assert.equal(reuse.status, 401);
    assert.equal(code(reuse), "pairing_invalid");
  });

  it("cannot be confirmed a second time while the window it opened is still open", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    assert.equal((await d.arm(ui, 5)).status, 200);
    const printed = armCodeOf(d);
    const again = await postJson(d.port, "/ui/arm/confirm", { code: printed }, bearer(ui));
    assert.equal(again.status, 401);
    assert.equal(code(again), "pairing_invalid");
  });

  it("is burned by five wrong tries, even for the right code afterwards", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    const printed = armCodeOf(d);
    const wrong = printed === "AAAAAAAA" ? "BBBBBBBB" : "AAAAAAAA";
    for (let i = 0; i < MAX_ARM_ATTEMPTS; i += 1) {
      const reply = await postJson(d.port, "/ui/arm/confirm", { code: wrong }, bearer(ui));
      assert.equal(reply.status, 401);
    }
    const right = await postJson(d.port, "/ui/arm/confirm", { code: printed }, bearer(ui));
    assert.equal(right.status, 401);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
  });

  it("stops working after two minutes", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    const printed = armCodeOf(d);
    d.clock.now += ARM_CODE_TTL_S * 1000;
    const late = await postJson(d.port, "/ui/arm/confirm", { code: printed }, bearer(ui));
    assert.equal(late.status, 410);
    assert.equal(code(late), "pairing_expired");
  });

  it("is replaced by a newer code", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    const first = armCodeOf(d);
    await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    const second = armCodeOf(d);
    assert.notEqual(first, second);
    assert.equal((await postJson(d.port, "/ui/arm/confirm", { code: first }, bearer(ui))).status, 401);
    assert.equal((await postJson(d.port, "/ui/arm/confirm", { code: second }, bearer(ui))).status, 200);
  });

  it("is checked against the pattern first: malformed input is a plain refusal, not a crash", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    // the body schema rejects a malformed code before the controller sees it
    assert.equal((await postJson(d.port, "/ui/arm/confirm", { code: "short" }, bearer(ui))).status, 400);
    assert.equal((await postJson(d.port, "/ui/arm/confirm", { code: "01IO01IO" }, bearer(ui))).status, 400);
    assert.equal((await postJson(d.port, "/ui/arm/confirm", {}, bearer(ui))).status, 400);
  });

  it("is never written anywhere but stderr (responses, audit records)", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    const first = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    const printed = armCodeOf(d);
    const second = await postJson(d.port, "/ui/arm/confirm", { code: printed }, bearer(ui));
    for (const text of [first.text, second.text, JSON.stringify(d.audit)]) assert.ok(!text.includes(printed));
    // and the audit never holds a token
    assert.doesNotMatch(JSON.stringify(d.audit), TOKEN_SCAN_PATTERN);
  });
});

describe("the window closes", () => {
  async function armed(): Promise<{ d: GateDaemon; ui: string }> {
    const d = await gate();
    const ui = await d.uiToken();
    assert.equal((await d.arm(ui, 5)).status, 200);
    return { d, ui };
  }
  const submit = (d: GateDaemon) => d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });

  it("on expiry, to the second", async () => {
    const { d } = await armed();
    d.clock.now += 5 * 60_000 - 1;
    assert.equal((await submit(d)).status, 200);
    d.clock.now += 1;
    const late = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: "cd".repeat(16) });
    assert.equal(code(late), "not_armed");
    assert.deepEqual(d.audit.filter((record) => record.ev === "ui.disarm").map((record) => record.code), ["expired"]);
  });

  it("on disarm, by the page or by the agent", async () => {
    for (const who of ["ui", "agent"] as const) {
      const { d, ui } = await armed();
      const token = who === "ui" ? ui : d.agentToken;
      const reply = await postJson(d.port, "/ui/disarm", {}, bearer(token));
      assert.equal(reply.status, 200);
      assert.equal(disarmResponseSchema.parse(reply.json()).posture, who === "ui" ? "PREPARE" : "PREPARE");
      assert.equal(code(await submit(d)), "not_armed");
      assert.deepEqual(d.audit.filter((record) => record.ev === "ui.disarm").map((record) => record.code), ["user"]);
    }
  });

  it("on the kill, at that moment and not only at the next check, and it stays shut", async () => {
    const { d, ui } = await armed();
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    // nothing has asked whether the window is open since the kill, yet the closing is already audited
    assert.ok(d.audit.some((record) => record.ev === "ui.disarm" && record.code === "kill"));
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
    assert.equal(code(await submit(d)), "kill_switch");
    assert.ok(d.audit.some((record) => record.ev === "ui.disarm" && record.code === "kill"));
    const rearm = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    assert.equal(rearm.status, 503);
    assert.equal(code(rearm), "kill_switch");
  });

  it("on a tripwire reported by a tool answer", async () => {
    const { d } = await armed();
    d.runner.next = () => ({ isError: true, text: null, structured: { outcome: "refused", code: "tripwire" } });
    await d.tool(d.agentToken, "xo_prepare_order", {});
    assert.equal(code(await submit(d)), "not_armed");
    assert.ok(d.audit.some((record) => record.ev === "ui.disarm" && record.code === "tripwire"));
  });

  it("on a tripwire reported by code", async () => {
    const { d } = await armed();
    armControllerOf(d.daemon.host).trip();
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
  });

  it("is closed when it is closed: disarming twice writes one event", async () => {
    const { d, ui } = await armed();
    await postJson(d.port, "/ui/disarm", {}, bearer(ui));
    await postJson(d.port, "/ui/disarm", {}, bearer(ui));
    assert.equal(d.audit.filter((record) => record.ev === "ui.disarm").length, 1);
  });

  it("drops a pending code on disarm", async () => {
    const d = await gate();
    const ui = await d.uiToken();
    await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    const printed = armCodeOf(d);
    await postJson(d.port, "/ui/disarm", {}, bearer(ui));
    assert.equal((await postJson(d.port, "/ui/arm/confirm", { code: printed }, bearer(ui))).status, 401);
  });

  it("tells listeners (the event feed) about each change", async () => {
    const d = await gate();
    const seen: string[] = [];
    armControllerOf(d.daemon.host).onChange((change) => seen.push(`${change.state}:${change.reason}`));
    const ui = await d.uiToken();
    await d.arm(ui);
    await postJson(d.port, "/ui/disarm", {}, bearer(ui));
    assert.deepEqual(seen, ["code_pending:code_printed", "armed:armed", "closed:user"]);
  });

  it("a listener that throws does not stop the window from closing", async () => {
    const { d, ui } = await armed();
    armControllerOf(d.daemon.host).onChange(() => {
      throw new Error("listener");
    });
    await postJson(d.port, "/ui/disarm", {}, bearer(ui));
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
  });
});

describe("the window closes when the page's event stream goes away", () => {
  // The real events module: the window counts page (ui token) streams only, and the bus knows each stream's kind.
  function eventsModule() {
    return { name: "events", source: realEventsModule };
  }

  function openStream(port: number, token: string): Promise<ClientRequest> {
    return new Promise((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/ui/events", headers: { host: `127.0.0.1:${port}`, ...bearer(token) }, agent: false }, (res) => {
        res.on("data", () => undefined);
        resolve(req);
      });
      req.on("error", () => undefined);
      req.on("close", () => undefined);
      req.end();
      setTimeout(() => reject(new Error("stream did not open")), 3000).unref();
      open.push(req);
    });
  }

  async function waitFor(check: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(check(), "condition reached");
  }

  const disarmReasons = (d: GateDaemon): unknown[] => d.audit.filter((record) => record.ev === "ui.disarm").map((record) => record.code);

  it("closes after the last page stream closes", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const stream = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal((await d.arm(ui)).status, 200);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    stream.destroy();
    await waitFor(() => d.daemon.host.openStreams() === 0);
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "not_armed");
    assert.ok(d.audit.some((record) => record.ev === "ui.disarm" && record.code === "sse_disconnect"));
  });

  it("closes the moment the last page stream goes, without waiting for anyone to ask (DS-2: the signal is wired)", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const stream = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    await d.arm(ui);
    // Nothing calls isArmed() between the close and the check below: only the bus callback can have disarmed.
    stream.destroy();
    await waitFor(() => disarmReasons(d).includes("sse_disconnect"));
  });

  it("stays open while another page stream is still there", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const one = await openStream(d.port, ui);
    const two = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 2);
    await d.arm(ui);
    one.destroy();
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    two.destroy();
  });

  it("an agent's own event stream does not keep the window open after the page's stream is gone (DS-2)", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const page = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal((await d.arm(ui)).status, 200);
    const agent = await openStream(d.port, d.agentToken);
    await waitFor(() => d.daemon.host.openStreams() === 2);
    page.destroy();
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false, "the agent's stream is not the page");
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "not_armed");
    assert.ok(disarmReasons(d).includes("sse_disconnect"));
    assert.equal(d.runner.calls.length, 0, "the submit never reached the tool runner");
    agent.destroy();
  });

  it("refuses to start a window while no page stream is open, when the daemon serves the event feed (DS-2)", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    assert.equal(reply.status, 422);
    assert.equal(code(reply), "precondition_failed");
    assert.doesNotMatch(d.stderr.text(), /ARM code/, "no code is printed for a window that cannot open");
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
  });

  it("an agent stream alone does not let the window start (DS-2)", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const agent = await openStream(d.port, d.agentToken);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal((await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui))).status, 422);
    agent.destroy();
  });

  it("refuses to confirm a code once the page stream has gone, and keeps the code for a retry (DS-2)", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const page = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal((await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui))).status, 200);
    page.destroy();
    await waitFor(() => d.daemon.host.openStreams() === 0);
    const typed = armCodeOf(d);
    const refused = await postJson(d.port, "/ui/arm/confirm", { code: typed }, bearer(ui));
    assert.equal(refused.status, 422);
    assert.equal(code(refused), "precondition_failed");
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
    const back = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    assert.equal((await postJson(d.port, "/ui/arm/confirm", { code: typed }, bearer(ui))).status, 200);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    back.destroy();
  });

  it("a daemon with no event feed has nothing to tie the window to, so it opens as before", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const ui = await d.uiToken();
    assert.equal((await d.arm(ui)).status, 200);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
  });

  it("closes at once when the events module reports its last stream closed", async () => {
    const d = await gate({ env: ARMABLE_ENV, extraModules: [eventsModule()] });
    const ui = await d.uiToken();
    const stream = await openStream(d.port, ui);
    await waitFor(() => d.daemon.host.openStreams() === 1);
    await d.arm(ui);
    armControllerOf(d.daemon.host).streamClosed(0);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
    stream.destroy();
  });
});

describe("only a write flag the relay really has on counts (DS-3), and a flag turned off closes the window (TM-10)", () => {
  const audited = (d: GateDaemon, reason: string): boolean => d.audit.some((record) => record.ev === "ui.disarm" && record.code === reason);

  it("refuses to arm when the environment asks for a flag the relay holds back", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    // The relay's effective flags: nothing is on, because no live-test result is recorded and RELAY_ARM is unset.
    attachEffectiveFlags(d.daemon.host, () => ({ ENABLE_TRADING: false, ENABLE_USEROP_SUBMIT: false, KILL: false }));
    const ui = await d.uiToken();
    const reply = await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui));
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "flag_off");
    assert.doesNotMatch(d.stderr.text(), /ARM code/);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
  });

  it("treats a view that cannot answer as every flag off", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    attachEffectiveFlags(d.daemon.host, () => undefined);
    assert.equal(code(await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(await d.uiToken()))), "flag_off");
    attachEffectiveFlags(d.daemon.host, () => {
      throw new Error("relay gone");
    });
    assert.equal(code(await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(await d.uiToken()))), "flag_off");
  });

  it("does not count KILL as a write flag", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    attachEffectiveFlags(d.daemon.host, () => ({ KILL: true }));
    assert.equal(code(await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(await d.uiToken()))), "flag_off");
  });

  it("arms when one relay flag is on", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    attachEffectiveFlags(d.daemon.host, () => ({ ENABLE_TRADING: true, ENABLE_USEROP_SUBMIT: false }));
    assert.equal((await d.arm(await d.uiToken())).status, 200);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
  });

  it("drops the code at confirm when the relay turned the flag off in between", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const flags = { ENABLE_TRADING: true };
    attachEffectiveFlags(d.daemon.host, () => flags);
    const ui = await d.uiToken();
    assert.equal((await postJson(d.port, "/ui/arm", { minutes: 5 }, bearer(ui))).status, 200);
    flags.ENABLE_TRADING = false;
    const reply = await postJson(d.port, "/ui/arm/confirm", { code: armCodeOf(d) }, bearer(ui));
    assert.equal(code(reply), "flag_off");
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
  });

  it("closes an open window when the relay's last write flag goes off, and the next submit is refused", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const flags: Record<string, boolean> = { ENABLE_TRADING: true };
    attachEffectiveFlags(d.daemon.host, () => flags);
    assert.equal((await d.arm(await d.uiToken())).status, 200);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    flags["ENABLE_TRADING"] = false;
    const reply = await d.tool(d.agentToken, "xo_submit_order", { prepared_id: ID });
    assert.equal(reply.status, 403);
    assert.equal(code(reply), "not_armed");
    assert.ok(audited(d, "flags_off"), "the closing is audited as flags_off");
    assert.equal(d.runner.calls.length, 0);
  });

  it("closes an open window when the environment's flag goes off (no relay view attached)", async () => {
    const env: Record<string, string> = { ENABLE_TRADING: "1" };
    const d = await gate({ env });
    assert.equal((await d.arm(await d.uiToken())).status, 200);
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
    env["ENABLE_TRADING"] = "0";
    assert.equal(armControllerOf(d.daemon.host).isArmed(), false);
    assert.ok(audited(d, "flags_off"));
  });

  it("stays open while at least one write flag is still on", async () => {
    const d = await gate({ env: ARMABLE_ENV });
    const flags: Record<string, boolean> = { ENABLE_TRADING: true, ENABLE_USEROP_SUBMIT: true };
    attachEffectiveFlags(d.daemon.host, () => flags);
    await d.arm(await d.uiToken());
    flags["ENABLE_TRADING"] = false;
    assert.equal(armControllerOf(d.daemon.host).isArmed(), true);
  });
});

describe("posture", () => {
  it("is OBSERVE without prepare, PREPARE with it, ARMED in the window and KILLED after the kill", async () => {
    const d = await gate();
    const host = d.daemon.host;
    assert.equal(postureOf(host, ["read"]), "OBSERVE");
    assert.equal(postureOf(host, ["read", "prepare"]), "PREPARE");
    const ui = await d.uiToken();
    await d.arm(ui);
    assert.equal(postureOf(host, ["read", "prepare"]), "ARMED");
    await postJson(d.port, "/ui/kill", {}, bearer(ui));
    assert.equal(postureOf(host, ["read", "prepare"]), "KILLED");
    assert.equal(postureOf(host, ["read"]), "KILLED");
  });
});

describe("the once-only ledger", () => {
  it("claims once, then reports in flight, then done", () => {
    let now = 1_000;
    const ledger = new SubmitLedger(() => now);
    assert.deepEqual(ledger.claim("a"), { kind: "first" });
    assert.deepEqual(ledger.claim("a"), { kind: "in_flight" });
    ledger.settle("a", "ok");
    assert.deepEqual(ledger.claim("a"), { kind: "done", outcome: "ok" });
    ledger.release("a");
    assert.deepEqual(ledger.claim("a"), { kind: "first" });
    now += 1;
  });

  it("forgets after its time to live, and never evicts a send that is in flight", () => {
    let now = 1_000;
    const ledger = new SubmitLedger(() => now);
    ledger.claim("old");
    ledger.settle("old", "ok");
    now += SUBMIT_LEDGER_TTL_MS + 1;
    assert.deepEqual(ledger.claim("old"), { kind: "first" });
    ledger.claim("inflight");
    for (let i = 0; i < SUBMIT_LEDGER_MAX + 50; i += 1) {
      ledger.claim(`k${i}`);
      ledger.settle(`k${i}`, "ok");
    }
    assert.ok(ledger.size() <= SUBMIT_LEDGER_MAX + 1);
    assert.deepEqual(ledger.claim("inflight"), { kind: "in_flight" });
  });
});
