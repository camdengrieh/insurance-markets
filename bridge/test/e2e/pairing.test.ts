import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, before, describe, it } from "node:test";

import { AGENT_TOKEN_PATTERN, UI_TOKEN_PATTERN, pairCodeSchema, pairResponseSchema } from "../../contract.js";
import { makeFixtureApp, startE2eDaemon, type E2eDaemon } from "./harness.js";

// M1-4 on the daemon side: the pairing secret travels in a URL fragment, is printed once on stderr, works once,
// and appears in no response, no request line the server saw, no audit entry and no later log line. (The page
// side, removing the fragment from the address bar, is app/e2e/pairing.spec.ts.)

let daemon: E2eDaemon;
let appDir: string;

before(async () => {
  appDir = await makeFixtureApp();
  daemon = await startE2eDaemon({ appDir, hostile: false });
});
after(async () => {
  await daemon.stop();
  await rm(appDir, { recursive: true, force: true });
});

const NAVIGATION = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document", "sec-fetch-site": "none", accept: "text/html" };

describe("pairing", () => {
  it("announces one 128-bit code, in a fragment, on stderr only", async () => {
    const link = await daemon.waitForLink(1);
    assert.ok(pairCodeSchema.safeParse(link.code).success);
    assert.equal(link.url, `${daemon.origin}/#pair=${link.code}`);
    assert.equal(daemon.stdout().includes(link.code), false, "not on stdout");
    assert.equal(daemon.stderr().split(link.code).length - 1, 1, "once on stderr");
  });

  it("refuses a wrong code without spending the right one, then accepts the right one exactly once", async () => {
    const link = daemon.links()[0];
    assert.ok(link);
    const wrong = await daemon.postJson("/ui/pair", { code: "0".repeat(32) });
    assert.equal(wrong.status, 401);
    assert.equal((wrong.json() as { error: { code: string } }).error.code, "pairing_invalid");
    const malformed = await daemon.postJson("/ui/pair", { code: "not a code" });
    assert.equal(malformed.status, 401);
    const extra = await daemon.postJson("/ui/pair", { code: link.code, admin: true });
    assert.ok(extra.status >= 400 && extra.status < 500, "an extra key is refused by the strict schema");

    const ok = await daemon.postJson("/ui/pair", { code: link.code });
    assert.equal(ok.status, 200);
    const parsed = pairResponseSchema.parse(ok.json());
    assert.match(parsed.token, UI_TOKEN_PATTERN);
    assert.deepEqual([...parsed.scopes].sort(), ["prepare", "read"]);
    assert.equal((parsed.scopes as readonly string[]).includes("submit"), false, "a page token never holds submit");

    const again = await daemon.postJson("/ui/pair", { code: link.code });
    assert.equal(again.status, 401, "the code works once");
  });

  it("never sets a cookie, and the token is in the pairing response only", () => {
    for (const entry of daemon.log()) {
      assert.equal(entry.reply.headers["set-cookie"], undefined);
      if (entry.path === "/ui/pair" && entry.reply.status === 200) continue;
      assert.doesNotMatch(entry.reply.text, /cku_[A-Za-z0-9_-]{20,}/, `${entry.path}`);
    }
  });

  it("keeps the code out of every later log line, and the tokens out of all of them", () => {
    const link = daemon.links()[0];
    assert.ok(link);
    const lines = daemon.stderr().split("\n");
    const mentioning = lines.filter((line) => line.includes(link.code));
    assert.equal(mentioning.length, 1, "exactly the announcement line");
    assert.match(mentioning[0] as string, /^\s+http:\/\/127\.0\.0\.1:\d+\/#pair=/);
    assert.doesNotMatch(daemon.stderr(), /cku_[A-Za-z0-9_-]{20,}/, "no page token in the log");
    assert.doesNotMatch(daemon.stdout(), /ck[ua]_[A-Za-z0-9_-]{20,}/, "no token on stdout");
    const agent = daemon.agentToken();
    assert.ok(agent && AGENT_TOKEN_PATTERN.test(agent), "the agent token is printed once on first start");
    assert.equal(daemon.stderr().split(agent).length - 1, 1, "the agent token appears once");
  });

  it("does not announce a new link to a script on another page, only to a user navigation", async () => {
    // The daemon spaces announcements; wait it out, then compare a cross-site navigation with a user's.
    const known = daemon.links().length;
    await new Promise((resolve) => setTimeout(resolve, 5500));
    const hostile = await daemon.request({ path: "/", headers: { ...NAVIGATION, "sec-fetch-site": "cross-site" } });
    assert.equal(hostile.status, 200);
    const fetched = await daemon.request({ path: "/", headers: { "sec-fetch-mode": "cors", "sec-fetch-dest": "empty", "sec-fetch-site": "same-origin", accept: "*/*" } });
    assert.equal(fetched.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(daemon.links().length, known, "no new link for a cross-site navigation or a script fetch");
    const user = await daemon.request({ path: "/", headers: NAVIGATION });
    assert.equal(user.status, 200);
    const fresh = await daemon.waitForLink(known + 1, 3000);
    assert.ok(pairCodeSchema.safeParse(fresh.code).success);
    assert.notEqual(fresh.code, daemon.links()[0]?.code);
    const paired = await daemon.pair();
    assert.match(paired.token, UI_TOKEN_PATTERN);
    const inbox = await daemon.getJson("/ui/inbox", paired.token);
    assert.equal(inbox.status, 200);
  });

  it("a page token is random per run and means nothing to another daemon", async () => {
    const second = await startE2eDaemon({ appDir, hostile: false });
    try {
      await second.waitForLink(1);
      const mine = await second.pair();
      assert.equal((await daemon.getJson("/ui/inbox", mine.token)).status, 401);
      assert.equal((await second.getJson("/ui/inbox", mine.token)).status, 200);
    } finally {
      await second.stop();
    }
  });
});
