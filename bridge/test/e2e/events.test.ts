import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { after, afterEach, before, describe, it } from "node:test";

import { TOKEN_SCAN_PATTERN, bridgeErrorResponseSchema, uiEventSchema } from "../../contract.js";
import { bearer, makeFixtureApp, openSse, startE2eDaemon, type E2eDaemon, type SseStream } from "./harness.js";

// The SSE feed of the real daemon: authentication, Origin and Host pinning, the shape of every event (checked against
// the contract's own schema), the audit entries that a refused action produces, resume by Last-Event-ID, and
// the rule that nothing secret ever travels on it.

let daemon: E2eDaemon;
let appDir: string;
let token: string;
const opened: SseStream[] = [];

before(async () => {
  appDir = await makeFixtureApp();
  daemon = await startE2eDaemon({ appDir, hostile: false });
  await daemon.waitForLink(1);
  token = (await daemon.pair()).token;
});
// The daemon allows a few streams per token (a slow or forgotten one must not starve the page): close each one.
afterEach(() => {
  for (const stream of opened.splice(0)) stream.close();
});
after(async () => {
  await daemon.stop();
  await rm(appDir, { recursive: true, force: true });
});

// The stream sends plain `data:` lines (the type is in the JSON), so classify by the payload.
function kind(event: { readonly data: string }): string | undefined {
  try {
    return (JSON.parse(event.data) as { type?: string }).type;
  } catch {
    return undefined;
  }
}
const isAudit = (event: { readonly data: string }): boolean => kind(event) === "audit";

async function open(headers: Record<string, string> = bearer(token)): Promise<SseStream> {
  const stream = await openSse(daemon.port, "/ui/events", headers);
  opened.push(stream);
  return stream;
}

describe("GET /ui/events", () => {
  it("needs a token, the right Origin and the right Host", async () => {
    for (const headers of [{}, bearer("cku_" + "A".repeat(43)), { ...bearer(token), origin: "http://evil.example" }, { ...bearer(token), "sec-fetch-site": "cross-site" }]) {
      const stream = await openSse(daemon.port, "/ui/events", headers);
      assert.ok(stream.status === 401 || stream.status === 403, `status ${stream.status}`);
      stream.close();
    }
    const wrongHost = await openSse(daemon.port, "/ui/events", { ...bearer(token), host: "evil.example" });
    assert.equal(wrongHost.status, 403);
    wrongHost.close();
  });

  it("is text/event-stream, uncached, with the cockpit security headers and no cookie", async () => {
    const stream = await open();
    assert.equal(stream.status, 200);
    assert.match(String(stream.headers["content-type"]), /^text\/event-stream/);
    assert.match(String(stream.headers["cache-control"]), /no-(store|cache)/);
    assert.equal(stream.headers["set-cookie"], undefined);
    assert.equal(stream.headers["access-control-allow-origin"], undefined);
    assert.match(String(stream.headers["content-security-policy"]), /connect-src 'self'/);
  });

  it("delivers the audit entry of a refused pairing, in the contract's shape, in order", async () => {
    const stream = await open();
    const wrong = await daemon.postJson("/ui/pair", { code: "f".repeat(32) });
    assert.equal(wrong.status, 401);
    const arrived = await stream.waitFor((event) => isAudit(event) && /pair/i.test(event.data));
    const parsed = uiEventSchema.parse(JSON.parse(arrived.data));
    assert.equal(parsed.type, "audit");
    if (parsed.type === "audit") {
      assert.match(parsed.entry.type, /^ui\.pair$/);
      assert.match(parsed.entry.hash, /^0x[0-9a-f]{64}$/);
      assert.ok(parsed.entry.summary.length > 0 && parsed.entry.summary.length <= 300);
    }
    assert.equal(arrived.id, parsed.id);
  });

  it("chains the audit entries: seq rises by one and every hash is different", async () => {
    const stream = await open();
    for (let attempt = 0; attempt < 3; attempt += 1) await daemon.postJson("/ui/pair", { code: String(attempt).repeat(32).slice(0, 32) });
    await stream.waitFor(() => stream.events().filter(isAudit).length >= 3);
    const entries = stream
      .events()
      .filter(isAudit)
      .map((event) => uiEventSchema.parse(JSON.parse(event.data)))
      .flatMap((event) => (event.type === "audit" ? [event.entry] : []));
    assert.ok(entries.length >= 3);
    for (let index = 1; index < entries.length; index += 1) {
      const previous = entries[index - 1];
      const current = entries[index];
      assert.ok(previous && current);
      assert.equal(current.seq, previous.seq + 1);
      assert.notEqual(current.hash, previous.hash);
    }
  });

  it("every event validates against the contract and ids only go up", async () => {
    const stream = await open();
    await daemon.postJson("/ui/pair", { code: "a".repeat(32) });
    await stream.waitFor((event) => isAudit(event));
    let last = -1;
    for (const event of stream.events()) {
      const parsed = uiEventSchema.parse(JSON.parse(event.data));
      assert.ok(parsed.id > last, "monotonic ids");
      last = parsed.id;
      assert.equal(kind(event), parsed.type);
    }
  });

  it("resumes from Last-Event-ID without repeating or losing events", async () => {
    const first = await open();
    await daemon.postJson("/ui/pair", { code: "b".repeat(32) });
    const seen = await first.waitFor((event) => isAudit(event));
    first.close();
    await daemon.postJson("/ui/pair", { code: "c".repeat(32) });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await open({ ...bearer(token), "last-event-id": String(seen.id) });
    assert.equal(second.status, 200);
    const missed = await second.waitFor((event) => isAudit(event));
    assert.ok((missed.id ?? 0) > (seen.id ?? 0), "only newer events");
  });

  it("answers a resume from the future with a precondition error and no stream (the page must reload)", async () => {
    const stream = await open({ ...bearer(token), "last-event-id": "999999999" });
    assert.equal(stream.status, 422);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const body = bridgeErrorResponseSchema.parse(JSON.parse(stream.text()));
    assert.equal(body.error.code, "precondition_failed");
    assert.equal(body.error.details?.["reason"], "resume_gap");
  });

  it("carries no token, no pairing code and no agent token, however many events there are", async () => {
    const stream = await open();
    await daemon.postJson("/ui/pair", { code: "d".repeat(32) });
    await stream.waitFor((event) => isAudit(event));
    const text = stream.text();
    assert.doesNotMatch(text, TOKEN_SCAN_PATTERN);
    for (const link of daemon.links()) assert.equal(text.includes(link.code), false);
    const agent = daemon.agentToken();
    assert.ok(agent);
    assert.equal(text.includes(agent), false);
    assert.equal(text.includes(token), false);
  });

  it("caps the streams per token, so a forgotten tab cannot starve the page, and frees a slot when one closes", async () => {
    const streams: SseStream[] = [];
    let refused: SseStream | undefined;
    for (let attempt = 0; attempt < 8 && refused === undefined; attempt += 1) {
      const stream = await open();
      if (stream.status === 200) streams.push(stream);
      else refused = stream;
    }
    assert.ok(refused, "a cap exists");
    assert.equal(refused.status, 429);
    assert.ok(streams.length >= 1 && streams.length <= 6, `${streams.length} streams were allowed`);
    streams[0]?.close();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const again = await open();
    assert.equal(again.status, 200, "closing one frees a slot");
  });

  it("ends every stream when the daemon stops", async () => {
    const second = await startE2eDaemon({ appDir, hostile: false });
    await second.waitForLink(1);
    const paired = await second.pair();
    const stream = await openSse(second.port, "/ui/events", bearer(paired.token));
    assert.equal(stream.status, 200);
    await second.stop();
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(stream.closed(), true);
  });
});
