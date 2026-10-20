import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { recoverAddress, type Hex } from "viem";

import { inboxSignResponseSchema } from "../../contract.js";
import { PayboxSigningPath } from "../../paybox-signer.js";
import { attachEffectiveFlags } from "../../arming.js";
import { bearer, postJson } from "../server/helpers.js";
import { ID_AUTH, ID_ORDER, ID_USEROP, OWNER, OWNER_KEY_ACCOUNT, OTHER_KEY_ACCOUNT, FakeClient, S2_ENV, authItem, deferred, deployItem, digestOfIntent, digestOf, edit, orderItem, signWith } from "./fixtures.js";
import { errorOf, startSignerRig, waitUntil, type SignerRig } from "./rig.js";

// POST /ui/inbox/sign through the real daemon front, the real class-table guard, ARM window, kill switch and inbox.
// PayBox is a fake client and the submit port a recorder: nothing is signed with anything but the public Anvil key,
// and nothing is sent anywhere.

const rigs: SignerRig[] = [];
afterEach(async () => {
  while (rigs.length > 0) await rigs.pop()?.stop();
});
interface Setup {
  readonly rig: SignerRig;
  readonly client: FakeClient;
}
async function setup(options: Parameters<typeof startSignerRig>[0] = {}): Promise<Setup> {
  const client = new FakeClient();
  const rig = await startSignerRig({ ...options, signer: { path: new PayboxSigningPath(client), ...options.signer } });
  rigs.push(rig);
  return { rig, client };
}
const untouched = ({ rig, client }: Setup): void => {
  assert.equal(client.credentialCalls, 0, "PayBox was not asked about the credential");
  assert.equal(client.signCalls.length, 0, "PayBox was not asked to sign");
  assert.equal(rig.submit.requests.length, 0, "nothing was submitted");
};
const audits = (rig: SignerRig, ev: string): typeof rig.d.audit => rig.d.audit.filter((record) => record.ev === ev);
const without = (names: readonly string[]): Record<string, string | undefined> => Object.fromEntries(Object.entries(S2_ENV).filter(([key]) => !names.includes(key)));

describe("the gates, in order, before PayBox hears anything", () => {
  it("is off by default: with the flag unset, an armed agent gets flag_off", async () => {
    const s = await setup({ env: without(["ENABLE_PAYBOX_SIGNER"]) });
    s.rig.show(deployItem());
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 403);
    assert.equal(errorOf(reply).code, "flag_off");
    assert.equal(errorOf(reply).details?.["flag"], "ENABLE_PAYBOX_SIGNER");
    untouched(s);
    const refused = audits(s.rig, "signer.result");
    assert.equal(refused.length, 1);
    assert.equal(refused[0]?.outcome, "refused");
    assert.equal(refused[0]?.code, "flag_off");
  });

  it("the flag alone is not enough: the operator must state that DT1 and DT3 were run", async () => {
    for (const ack of [undefined, "", "DT1", "DT3", "DT1,DT2", "DT1,DT3,DT4", "yes"]) {
      const s = await setup({ env: { ...S2_ENV, PAYBOX_SIGNER_ACK_DT: ack } });
      s.rig.show(deployItem());
      await s.rig.armed();
      const reply = await s.rig.sign(ID_USEROP);
      assert.equal(reply.status, 422, String(ack));
      assert.equal(errorOf(reply).details?.["reason"], "dt_not_acknowledged", String(ack));
      untouched(s);
    }
    // order and case do not matter
    const ok = await setup({ env: { ...S2_ENV, PAYBOX_SIGNER_ACK_DT: " dt3 , DT1 " } });
    ok.rig.show(deployItem());
    await ok.rig.armed();
    assert.equal((await ok.rig.sign(ID_USEROP)).status, 200);
  });

  it("an unconfigured signer names the missing variables, never their values", async () => {
    const cases: Array<[Record<string, string | undefined>, string]> = [
      [without(["PAYBOX_CONFIG_DIR"]), "PAYBOX_CONFIG_DIR"],
      [{ ...S2_ENV, PAYBOX_CONFIG_DIR: "relative/dir" }, "PAYBOX_CONFIG_DIR"],
      [{ ...S2_ENV, PAYBOX_CONFIG_DIR: "   " }, "PAYBOX_CONFIG_DIR"],
      [without(["PAYBOX_SIGNER_CREDENTIAL"]), "PAYBOX_SIGNER_CREDENTIAL"],
      [{ ...S2_ENV, PAYBOX_SIGNER_CREDENTIAL: "bad id; rm" }, "PAYBOX_SIGNER_CREDENTIAL"],
      [{ ...S2_ENV, PAYBOX_BIN: "pay box; rm -rf /" }, "PAYBOX_BIN"],
    ];
    for (const [env, name] of cases) {
      const s = await setup({ env });
      s.rig.show(deployItem());
      await s.rig.armed();
      const reply = await s.rig.sign(ID_USEROP);
      assert.equal(reply.status, 422, name);
      const error = errorOf(reply);
      assert.equal(error.details?.["reason"], "signer_not_configured");
      assert.deepEqual(error.details?.["missing"], [name]);
      assert.ok(!reply.text.includes("relative/dir") && !reply.text.includes("rm -rf"), "no value is echoed");
      untouched(s);
    }
  });

  it("needs an open ARM window (the class guard answers before the route runs)", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 403);
    assert.equal(errorOf(reply).code, "not_armed");
    untouched(s);
  });

  it("a page token cannot reach it, and neither can an agent whose ceiling lacks submit", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    const page = await s.rig.sign(ID_USEROP, s.rig.ui);
    assert.equal(page.status, 403);
    assert.equal(errorOf(page).code, "scope_denied");
    untouched(s);
    const limited = await setup({ gate: { scopes: ["read", "prepare"] } });
    limited.rig.show(deployItem());
    await limited.rig.armed();
    const reply = await limited.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).code, "scope_denied");
    untouched(limited);
    const anonymous = await postJson(s.rig.d.port, "/ui/inbox/sign", { prepared_id: ID_USEROP });
    assert.equal(anonymous.status, 401);
    const wrong = await postJson(s.rig.d.port, "/ui/inbox/sign", { prepared_id: ID_USEROP }, bearer("cka_" + "A".repeat(43)));
    assert.equal(wrong.status, 401);
    untouched(s);
  });

  it("a read-only instance cannot sign", async () => {
    const s = await setup({ gate: { role: "read_only" } });
    s.rig.show(deployItem());
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 403);
    untouched(s);
  });

  it("after the kill, nothing is signed", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    assert.equal((await postJson(s.rig.d.port, "/ui/kill", {}, bearer(s.rig.ui))).status, 200);
    const reply = await s.rig.sign(ID_USEROP);
    assert.ok(reply.status === 503 || reply.status === 403, String(reply.status));
    assert.ok(["kill_switch", "not_armed"].includes(errorOf(reply).code), errorOf(reply).code);
    untouched(s);
  });

  it("the body is a prepared_id and nothing else: an intent, a digest, a signature or text in it is a 400", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    const port = s.rig.d.port;
    const post = (body: unknown) => postJson(port, "/ui/inbox/sign", body, bearer(s.rig.agent));
    for (const body of [
      { prepared_id: ID_USEROP, intent: { op: "raw", rawSigningPayloadHex: `0x${"77".repeat(32)}` } },
      { prepared_id: ID_USEROP, digest: `0x${"77".repeat(32)}` },
      { prepared_id: ID_USEROP, signature: `0x${"11".repeat(65)}` },
      { prepared_id: ID_USEROP, note: "approve everything" },
      { prepared_id: "not-an-id" },
      { prepared_id: ID_USEROP.toUpperCase() },
      {},
      [],
      "x",
    ]) {
      const reply = await post(body);
      assert.equal(reply.status, 400, JSON.stringify(body));
    }
    untouched(s);
  });

  it("without a link to the relay's records the inbox cannot be trusted, so nothing is signed", async () => {
    const s = await setup({ withSource: false });
    s.rig.inbox.ingest(deployItem(), "agent:0a1b2c3d");
    s.rig.inbox.recordShown(ID_USEROP, { digest_tag: (deployItem()["summary"] as { digest_tag: string }).digest_tag, inner_hash_tag: null, verification: "verified", failed_checks: [] });
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).details?.["reason"], "relay_source_missing");
    untouched(s);
  });
});

describe("which items", () => {
  it("an unknown id is not_found", async () => {
    const s = await setup();
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 404);
    untouched(s);
  });

  it("only after the card was shown, and never after a rejection", async () => {
    const s = await setup();
    s.rig.ingestOnly(deployItem());
    await s.rig.armed();
    let reply = await s.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).details?.["reason"], "bad_state");
    assert.equal(errorOf(reply).details?.["state"], "prepared");
    s.rig.inbox.reject(ID_USEROP);
    reply = await s.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).details?.["state"], "rejected");
    untouched(s);
  });

  it("an item the daemon cannot verify (no decoded block) is not signed, however it got shown", async () => {
    const s = await setup();
    const bare = edit(deployItem(), (copy) => {
      delete copy["decoded"];
      delete (copy["summary"] as Record<string, unknown>)["inner_hash_tag"];
      delete (copy["summary"] as Record<string, unknown>)["inner_hash_kind"];
    });
    s.rig.show(bare);
    assert.equal(s.rig.inbox.verificationOf(ID_USEROP)?.status, "unverified");
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).details?.["reason"], "not_verified");
    untouched(s);
  });

  it("an item too near its expiry is not signed", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    s.rig.d.clock.now += 260_000;
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 410);
    assert.equal(errorOf(reply).code, "expired");
    untouched(s);
  });

  it("an order needs ENABLE_TRADING and a user operation ENABLE_USEROP_SUBMIT: signing for a path that is off is refused", async () => {
    const s = await setup({ env: without(["ENABLE_TRADING"]) });
    s.rig.show(orderItem());
    s.rig.show(deployItem());
    await s.rig.armed();
    const order = await s.rig.sign(ID_ORDER);
    assert.equal(errorOf(order).code, "flag_off");
    assert.equal(errorOf(order).details?.["flag"], "ENABLE_TRADING");
    untouched(s);
    assert.equal((await s.rig.sign(ID_USEROP)).status, 200);
  });
});

describe("the relay's effective flags decide, not the environment (DS-3)", () => {
  it("does not ask PayBox to sign for a write path the relay holds back, although the environment asks for it", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    // From here the relay reports ENABLE_TRADING as the only flag on (so the window stays open); ENABLE_USEROP_SUBMIT is
    // requested by the environment but held by the relay.
    attachEffectiveFlags(s.rig.d.daemon.host, () => ({ ENABLE_USEROP_SUBMIT: false, ENABLE_TRADING: true }));
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).code, "flag_off");
    assert.equal(errorOf(reply).details?.["flag"], "ENABLE_USEROP_SUBMIT");
    untouched(s);
  });

  it("an armed window over a relay that answers nothing signs nothing", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    attachEffectiveFlags(s.rig.d.daemon.host, () => undefined);
    // The window itself closes (every flag is off), so the signer is never reached: not_armed.
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(errorOf(reply).code, "not_armed");
    untouched(s);
  });
});

describe("the credential", () => {
  it("autonomous, iframe and every other mode than always_approve: PayBox is never asked to sign (M5-4)", async () => {
    for (const mode of ["autonomous", "iframe", "paybox", "", null]) {
      const s = await setup();
      s.client.approvalMode = mode;
      s.rig.show(deployItem());
      await s.rig.armed();
      const reply = await s.rig.sign(ID_USEROP);
      assert.equal(reply.status, 422, String(mode));
      assert.equal(errorOf(reply).details?.["reason"], "credential_not_always_approve");
      assert.equal(s.client.signCalls.length, 0);
      assert.equal(s.rig.submit.requests.length, 0);
      assert.equal(s.rig.inbox.get(ID_USEROP)?.state, "shown", "the item stays open");
      assert.equal(audits(s.rig, "signer.request").length, 0, "no request was made to PayBox, so none is recorded");
    }
  });

  it("a credential whose address is not the owner is refused", async () => {
    const s = await setup();
    s.client.address = OTHER_KEY_ACCOUNT.address;
    s.rig.show(deployItem());
    await s.rig.armed();
    assert.equal(errorOf(await s.rig.sign(ID_USEROP)).details?.["reason"], "credential_owner_mismatch");
    assert.equal(s.client.signCalls.length, 0);
  });

  it("the configured credential id is what PayBox is asked about", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    await s.rig.sign(ID_USEROP);
    assert.equal(s.client.signCalls[0]?.credentialId, S2_ENV["PAYBOX_SIGNER_CREDENTIAL"]);
  });
});

describe("a signature, end to end", () => {
  for (const [name, make, id, kind, op] of [
    ["a user operation", deployItem, ID_USEROP, "userop", "raw"],
    ["an order", orderItem, ID_ORDER, "order", "typedData"],
    ["the XO login", authItem, ID_AUTH, "auth", "raw"],
  ] as const) {
    it(`${name}: PayBox gets the item's own intent, and the submit port gets a signature that recovers to the owner`, async () => {
      const s = await setup();
      const item = make();
      s.rig.show(item);
      await s.rig.armed();
      const reply = await s.rig.sign(id);
      assert.equal(reply.status, 200, reply.text);
      const body = inboxSignResponseSchema.parse(reply.json());
      assert.equal(body.prepared_id, id);
      assert.equal(body.state, "signed");
      assert.equal(body.detail, "submitted");
      assert.equal(s.client.signCalls.length, 1);
      const intent = s.client.signCalls[0]?.intent;
      assert.ok(intent);
      assert.equal(intent.op, op);
      assert.deepEqual(intent, (item["sign"] as { intent: unknown }).intent);
      assert.equal(s.rig.submit.requests.length, 1);
      const sent = s.rig.submit.requests[0];
      assert.ok(sent);
      assert.equal(sent.kind, kind);
      assert.equal(sent.preparedId, id);
      assert.equal(sent.principal.kind, "agent");
      assert.equal(await recoverAddress({ hash: digestOf(item), signature: sent.signature }), OWNER);
      assert.equal(s.rig.inbox.get(id)?.state, "signed");
      // The signature is in no response and no audit line.
      const everything = JSON.stringify([reply.text, s.rig.d.audit, s.rig.d.stderr.text()]);
      assert.ok(!everything.includes(sent.signature.slice(2)), "the signature appears nowhere else");
    });
  }

  it("records signer.request and then signer.result, with tags, the token id and the 8-character prepared id", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    await s.rig.sign(ID_USEROP);
    const request = audits(s.rig, "signer.request");
    const result = audits(s.rig, "signer.result");
    assert.equal(request.length, 1);
    assert.equal(result.length, 1);
    assert.equal(request[0]?.preparedId, ID_USEROP.slice(0, 8));
    assert.equal(request[0]?.digestTag, (deployItem()["summary"] as { digest_tag: string }).digest_tag);
    assert.equal(request[0]?.innerTag, (deployItem()["summary"] as { inner_hash_tag: string }).inner_hash_tag);
    assert.equal(request[0]?.tokenId, s.rig.d.auth.authenticate(`Bearer ${s.rig.agent}`)?.id);
    assert.equal(result[0]?.outcome, "ok");
    assert.equal(result[0]?.requestRef, "req_test_0001");
    const order = s.rig.d.audit.map((record) => record.ev).filter((ev) => ev.startsWith("signer."));
    assert.deepEqual(order, ["signer.request", "signer.result"]);
  });

  it("a second request for the same item does not sign again", async () => {
    const s = await setup();
    s.rig.show(deployItem());
    await s.rig.armed();
    assert.equal((await s.rig.sign(ID_USEROP)).status, 200);
    const again = await s.rig.sign(ID_USEROP);
    assert.equal(again.status, 422);
    assert.equal(errorOf(again).details?.["state"], "signed");
    assert.equal(s.client.signCalls.length, 1);
    assert.equal(s.rig.submit.requests.length, 1);
  });
});

describe("what is dropped", () => {
  it("a signature by someone other than the owner never reaches the submit port, and the item stays open", async () => {
    const s = await setup();
    s.client.signer = async (call) => ({ ok: true, signature: await signWith(OTHER_KEY_ACCOUNT, digestOfIntent(call.intent)) });
    s.rig.show(deployItem());
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 403);
    assert.equal(errorOf(reply).code, "owner_mismatch");
    assert.equal(s.rig.submit.requests.length, 0);
    assert.equal(s.rig.inbox.get(ID_USEROP)?.state, "shown");
    assert.equal(audits(s.rig, "signer.result")[0]?.outcome, "refused");
  });

  it("PayBox declining, timing out or failing keeps the item open and sends nothing", async () => {
    for (const code of ["paybox_declined", "paybox_timeout", "paybox_failed", "paybox_missing", "paybox_output_invalid"] as const) {
      const s = await setup();
      s.client.signer = async () => ({ ok: false, code });
      s.rig.show(deployItem());
      await s.rig.armed();
      const reply = await s.rig.sign(ID_USEROP);
      assert.equal(reply.status, 422, code);
      assert.equal(errorOf(reply).details?.["reason"], code);
      assert.equal(s.rig.submit.requests.length, 0);
      assert.equal(s.rig.inbox.get(ID_USEROP)?.state, "shown");
    }
  });

  it("the user rejecting the card while PayBox waits drops the signature", async () => {
    const s = await setup();
    const gate = deferred<void>();
    s.client.signer = async (call) => {
      await gate.promise;
      return { ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)) };
    };
    s.rig.show(deployItem());
    await s.rig.armed();
    const pending = s.rig.sign(ID_USEROP);
    await waitUntil(() => s.client.signCalls.length === 1);
    assert.equal(s.rig.inbox.reject(ID_USEROP).ok, true);
    gate.resolve();
    const reply = await pending;
    assert.equal(errorOf(reply).details?.["reason"], "changed_while_signing");
    assert.equal(s.rig.submit.requests.length, 0);
    assert.equal(s.rig.inbox.get(ID_USEROP)?.state, "rejected");
  });

  it("the kill switch, a disarm or the clock running out while PayBox waits each drop the signature", async () => {
    const cases: Array<[string, (s: Setup) => Promise<void> | void, string]> = [
      ["kill", async (s) => void (await postJson(s.rig.d.port, "/ui/kill", {}, bearer(s.rig.ui))), "kill_switch"],
      ["disarm", async (s) => void (await postJson(s.rig.d.port, "/ui/disarm", {}, bearer(s.rig.ui))), "not_armed"],
      ["clock", (s) => void (s.rig.d.clock.now += 220_000), "expired"],
    ];
    for (const [name, act, code] of cases) {
      const s = await setup();
      const gate = deferred<void>();
      s.client.signer = async (call) => {
        await gate.promise;
        return { ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)) };
      };
      // an order needs 90 s at submit, so 220 s of a 300 s life is too much
      s.rig.show(orderItem());
      await s.rig.armed();
      const pending = s.rig.sign(ID_ORDER);
      await waitUntil(() => s.client.signCalls.length === 1);
      await act(s);
      gate.resolve();
      const reply = await pending;
      assert.equal(errorOf(reply).code, code, name);
      assert.equal(s.rig.submit.requests.length, 0, name);
      assert.notEqual(s.rig.inbox.get(ID_ORDER)?.state, "signed", name);
    }
  });

  it("the wait itself is limited to the item's remaining life less the submit margin", async () => {
    const s = await setup();
    s.rig.show(orderItem());
    await s.rig.armed();
    await s.rig.sign(ID_ORDER);
    // 300 s of life, less the 90 s an order needs at submit
    assert.equal(s.client.signCalls[0]?.timeoutMs, 210_000);
  });
});

describe("one signature at a time, and a limit on prompts", () => {
  it("a second item cannot be signed while the first waits for approval", async () => {
    const s = await setup();
    const gate = deferred<void>();
    s.client.signer = async (call) => {
      await gate.promise;
      return { ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)) };
    };
    s.rig.show(deployItem());
    s.rig.show(authItem());
    await s.rig.armed();
    const first = s.rig.sign(ID_USEROP);
    await waitUntil(() => s.client.signCalls.length === 1);
    const second = await s.rig.sign(ID_AUTH);
    assert.equal(errorOf(second).details?.["reason"], "signing_in_progress");
    assert.equal(s.client.signCalls.length, 1);
    gate.resolve();
    assert.equal((await first).status, 200);
    // and afterwards the second can go
    s.client.signer = async (call) => ({ ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)) });
    assert.equal((await s.rig.sign(ID_AUTH)).status, 200);
  });

  it("an item is put to PayBox at most three times", async () => {
    const s = await setup();
    s.client.signer = async () => ({ ok: false, code: "paybox_declined" });
    s.rig.show(deployItem());
    await s.rig.armed();
    for (let attempt = 0; attempt < 3; attempt += 1) assert.equal(errorOf(await s.rig.sign(ID_USEROP)).details?.["reason"], "paybox_declined");
    const fourth = await s.rig.sign(ID_USEROP);
    assert.equal(fourth.status, 429);
    assert.equal(errorOf(fourth).code, "rate_limited");
    assert.ok(Number(fourth.headers["retry-after"]) >= 1);
    assert.equal(s.client.signCalls.length, 3);
  });

  it("and ten approval prompts in ten minutes are the most a token can cause", async () => {
    const s = await setup();
    s.client.signer = async () => ({ ok: false, code: "paybox_declined" });
    await s.rig.armed();
    for (let index = 0; index < 11; index += 1) {
      const id = (index + 1).toString(16).padStart(32, "a");
      s.rig.show(deployItem(id, { ttlS: 3000 }));
    }
    for (let index = 0; index < 10; index += 1) {
      const id = (index + 1).toString(16).padStart(32, "a");
      assert.equal(errorOf(await s.rig.sign(id)).details?.["reason"], "paybox_declined", String(index));
    }
    const eleventh = await s.rig.sign((11).toString(16).padStart(32, "a"));
    assert.equal(eleventh.status, 429);
    assert.equal(s.client.signCalls.length, 10);
  });
});

describe("the send", () => {
  it("pending is reported as such", async () => {
    const s = await setup();
    s.rig.submit.next = { outcome: "pending" };
    s.rig.show(deployItem());
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 200);
    assert.equal(inboxSignResponseSchema.parse(reply.json()).detail, "pending");
  });

  it("ambiguous means do not resend: 409, and the item is not signable again", async () => {
    for (const next of [{ outcome: "ambiguous" } as const, async () => { throw new Error("boom"); }]) {
      const s = await setup();
      s.rig.submit.next = next as never;
      s.rig.show(deployItem());
      await s.rig.armed();
      const reply = await s.rig.sign(ID_USEROP);
      assert.equal(reply.status, 409);
      assert.equal(errorOf(reply).code, "ambiguous");
      assert.match(errorOf(reply).message, /Do not sign or send this item again/);
      assert.equal((await s.rig.sign(ID_USEROP)).status, 422);
      assert.equal(s.client.signCalls.length, 1);
      assert.equal(audits(s.rig, "signer.result")[0]?.outcome, "ambiguous");
    }
  });

  it("a refused send maps the code through when it is a known one, and says the signature was not kept", async () => {
    const s = await setup();
    s.rig.submit.next = { outcome: "refused", code: "flag_off" };
    s.rig.show(deployItem());
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 403);
    assert.equal(errorOf(reply).code, "flag_off");
    assert.match(errorOf(reply).message, /not stored/);
    const other = await setup();
    other.rig.submit.next = { outcome: "error", code: "something_odd" };
    other.rig.show(deployItem());
    await other.rig.armed();
    assert.equal(errorOf(await other.rig.sign(ID_USEROP)).code, "precondition_failed");
  });
});

describe("no secret in anything the daemon says (M5-9)", () => {
  const PLANTED = "pbxk1.PLANTED-SECRET-VALUE-0123456789";
  const LIVE = "pbx_live_PLANTED-API-KEY-0123456789";
  function scan(s: Setup, replies: readonly string[]): void {
    const everything = JSON.stringify([replies, s.rig.d.audit, s.rig.d.stderr.text()]);
    for (const needle of ["PLANTED", "pbxk1", "pbx_live"]) assert.ok(!everything.includes(needle), needle);
  }

  it("a client that throws with a key in the message", async () => {
    const s = await setup({ signer: { path: new PayboxSigningPath({ credential: async () => { throw new Error(PLANTED); }, sign: async () => { throw new Error(LIVE); } }) } });
    s.rig.show(deployItem());
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 422);
    scan(s, [reply.text]);
    const signing = await setup({ signer: { path: new PayboxSigningPath({ credential: async () => ({ ok: true, approvalMode: "always_approve", address: OWNER }), sign: async () => { throw new Error(LIVE); } }) } });
    signing.rig.show(deployItem());
    await signing.rig.armed();
    const second = await signing.rig.sign(ID_USEROP);
    assert.equal(errorOf(second).details?.["reason"], "paybox_failed");
    scan(signing, [second.text]);
  });

  it("a request reference that is a key", async () => {
    const s = await setup();
    s.client.signer = async (call) => ({ ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)), requestRef: PLANTED });
    s.rig.show(deployItem());
    await s.rig.armed();
    const reply = await s.rig.sign(ID_USEROP);
    assert.equal(reply.status, 200);
    scan(s, [reply.text]);
  });

  it("a key in the environment of the daemon is not in any response either", async () => {
    const s = await setup({ env: { ...S2_ENV, SOME_OTHER_SECRET: LIVE } });
    s.rig.show(deployItem());
    await s.rig.armed();
    scan(s, [(await s.rig.sign(ID_USEROP)).text]);
  });
});
