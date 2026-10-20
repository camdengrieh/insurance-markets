import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { MAX_PAIR_ATTEMPTS } from "../../auth.js";
import { PAIR_CODE_TTL_S, TOKEN_SCAN_PATTERN, bridgeErrorResponseSchema, pairResponseSchema } from "../../contract.js";
import { defineRoute, json, type BridgeModule } from "../../server.js";
import { bearer, postJson, send, startTestDaemon, type TestDaemon } from "./helpers.js";

const status: BridgeModule = {
  name: "status",
  routes: [defineRoute({ method: "GET", path: "/ui/status", access: { scope: "read" }, handler: (ctx) => json({ ok: true, scopes: ctx.principal?.scopes }) })],
};

let running: TestDaemon | undefined;
afterEach(async () => {
  await running?.stop();
  running = undefined;
});
async function start(extra: Parameters<typeof startTestDaemon>[0] = {}): Promise<TestDaemon> {
  running = await startTestDaemon({ modules: [{ name: "status", source: status }], ...extra });
  return running;
}

function linkIn(text: string): { link: string; code: string } {
  const match = /(http:\/\/127\.0\.0\.1:\d+\/#pair=([0-9a-f]{32}))/.exec(text);
  assert.ok(match, "a pairing link is printed");
  return { link: match[1] as string, code: match[2] as string };
}

describe("the pairing link", () => {
  it("is printed on stderr once at start, as a fragment URL on the daemon's own origin", async () => {
    const t = await start();
    const link = t.daemon.announcePairing({ force: true });
    assert.ok(link !== undefined);
    const printed = linkIn(t.stderr.text());
    assert.equal(printed.link, link);
    assert.equal(printed.link.startsWith(`${t.daemon.origin}/#pair=`), true);
    assert.match(t.stderr.text(), new RegExp(`valid ${PAIR_CODE_TTL_S} s`));
  });
  it("is not printed again while a code is open, unless forced", async () => {
    const t = await start();
    t.daemon.announcePairing({ force: true });
    assert.equal(t.daemon.announcePairing(), undefined);
    assert.notEqual(t.daemon.announcePairing({ force: true }), undefined);
    assert.equal((t.stderr.text().match(/#pair=/g) ?? []).length, 2);
  });
});

describe("POST /ui/pair", () => {
  it("exchanges a fresh code for a ui token with read and prepare scopes, and the token works", async () => {
    const t = await start();
    t.daemon.announcePairing({ force: true });
    const { code } = linkIn(t.stderr.text());
    const reply = await postJson(t.port, "/ui/pair", { code });
    assert.equal(reply.status, 200);
    const body = pairResponseSchema.parse(reply.json());
    assert.deepEqual(body.scopes, ["read", "prepare"]);
    const used = await send({ port: t.port, path: "/ui/status", headers: bearer(body.token) });
    assert.deepEqual(used.json(), { ok: true, scopes: ["read", "prepare"] });
  });
  it("works once: a second exchange of the same code is pairing_invalid", async () => {
    const t = await start();
    const { code } = linkIn((t.daemon.announcePairing({ force: true }), t.stderr.text()));
    assert.equal((await postJson(t.port, "/ui/pair", { code })).status, 200);
    const again = await postJson(t.port, "/ui/pair", { code });
    assert.equal(again.status, 401);
    assert.equal(bridgeErrorResponseSchema.parse(again.json()).error.code, "pairing_invalid");
  });
  it("answers 410 pairing_expired after the code's time, then pairing_invalid", async () => {
    const t = await start();
    const { code } = linkIn((t.daemon.announcePairing({ force: true }), t.stderr.text()));
    t.clock.now += PAIR_CODE_TTL_S * 1000;
    const late = await postJson(t.port, "/ui/pair", { code });
    assert.equal(late.status, 410);
    assert.equal(bridgeErrorResponseSchema.parse(late.json()).error.code, "pairing_expired");
    assert.equal((await postJson(t.port, "/ui/pair", { code })).status, 401);
  });
  it("answers 401 pairing_invalid for a wrong, malformed or empty code, and locks the code after repeated failures", async () => {
    const t = await start();
    const { code } = linkIn((t.daemon.announcePairing({ force: true }), t.stderr.text()));
    for (const wrong of ["", "xyz", "0".repeat(32), "A".repeat(32), `${code}0`]) {
      const reply = await postJson(t.port, "/ui/pair", { code: wrong });
      assert.equal(reply.status, 401, wrong);
      assert.equal(bridgeErrorResponseSchema.parse(reply.json()).error.code, "pairing_invalid");
    }
    // 5 wrong digit-strings of the right shape burn the code (malformed ones above do not count)
    for (let index = 0; index < MAX_PAIR_ATTEMPTS; index += 1) await postJson(t.port, "/ui/pair", { code: "1".repeat(32) });
    assert.equal((await postJson(t.port, "/ui/pair", { code })).status, 401);
  });
  it("answers 400 for a body with extra fields or no code, 415 for the wrong type", async () => {
    const t = await start();
    assert.equal((await postJson(t.port, "/ui/pair", { code: "0".repeat(32), extra: 1 })).status, 400);
    assert.equal((await postJson(t.port, "/ui/pair", {})).status, 400);
    assert.equal((await send({ port: t.port, method: "POST", path: "/ui/pair", headers: { "content-type": "text/plain" }, body: "x" })).status, 415);
  });
  it("is closed to a cross-origin page and to a foreign Host, with or without a valid code", async () => {
    const t = await start();
    const { code } = linkIn((t.daemon.announcePairing({ force: true }), t.stderr.text()));
    const cross = await postJson(t.port, "/ui/pair", { code }, { origin: "https://example.org" });
    assert.equal(cross.status, 403);
    const rebinding = await send({ port: t.port, method: "POST", path: "/ui/pair", host: "evil.example", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    assert.equal(rebinding.status, 403);
    // the code is still good for the real page
    assert.equal((await postJson(t.port, "/ui/pair", { code })).status, 200);
  });
  it("gives a read-only instance's ui token the read scope only", async () => {
    const t = await start({ role: "read_only" });
    const { code } = linkIn((t.daemon.announcePairing({ force: true }), t.stderr.text()));
    const body = pairResponseSchema.parse((await postJson(t.port, "/ui/pair", { code })).json());
    assert.deepEqual(body.scopes, ["read"]);
    const used = await send({ port: t.port, path: "/ui/status", headers: bearer(body.token) });
    assert.deepEqual((used.json() as { scopes: string[] }).scopes, ["read"]);
  });
});

describe("M1-4: the pairing secret appears nowhere but the one stderr link", () => {
  it("is absent from every response, audit record and later stderr line, and so is the ui token", async () => {
    const t = await start();
    t.daemon.announcePairing({ force: true });
    const stderrAfterLink = t.stderr.text();
    const { code } = linkIn(stderrAfterLink);
    const pairReply = await postJson(t.port, "/ui/pair", { code });
    const token = (pairReply.json() as { token: string }).token;
    const seen: string[] = [pairReply.text.replace(token, "")];
    for (const path of ["/", "/ui/status", "/ui/nothing", "/robots.txt"]) {
      const reply = await send({ port: t.port, path, headers: bearer(token) });
      seen.push(reply.text, JSON.stringify(reply.headers));
    }
    seen.push(JSON.stringify(t.audit));
    seen.push(t.stderr.text().replace(stderrAfterLink, ""));
    const all = seen.join("\n");
    assert.equal(all.includes(code), false, "the pairing code");
    assert.equal(all.includes(token), false, "the ui token");
    assert.equal(TOKEN_SCAN_PATTERN.test(all), false, "no token-shaped string");
    // the audit record names the token by its 8-character id only
    const paired = t.audit.find((record) => record.ev === "ui.pair" && record.outcome === "ok");
    assert.match(paired?.tokenId ?? "", /^[0-9a-f]{8}$/);
  });
  it("is audited as ui.pair, ok and refused, with a code word and no secret", async () => {
    const t = await start();
    const { code } = linkIn((t.daemon.announcePairing({ force: true }), t.stderr.text()));
    await postJson(t.port, "/ui/pair", { code: "2".repeat(32) });
    await postJson(t.port, "/ui/pair", { code });
    const pairs = t.audit.filter((record) => record.ev === "ui.pair");
    assert.deepEqual(pairs.map((record) => [record.outcome, record.code ?? null]), [["refused", "pairing_invalid"], ["ok", null]]);
    assert.equal(JSON.stringify(pairs).includes(code), false);
  });
});
