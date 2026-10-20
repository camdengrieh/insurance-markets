import { describe, expect, it } from "vitest";

import { FakeRaw, FakeTimers } from "../../core/fakes";
import { DaemonClient, DaemonError, isDaemonError } from "./client";
import { OTHER_TOKEN, TOKEN, errorReply, inboxBody, jsonReply, statusBody, toolEnvelope } from "./test-support";
import { searchArgs } from "./tools";

function clientWith(raw: FakeRaw, token: string | null = TOKEN): DaemonClient {
  return new DaemonClient({ rawFetch: raw.fetch, timers: new FakeTimers(0), getToken: () => token });
}

async function failureOf(promise: Promise<unknown>): Promise<DaemonError> {
  try {
    await promise;
  } catch (error) {
    if (isDaemonError(error)) return error;
    throw error;
  }
  throw new Error("expected a DaemonError");
}

describe("requests", () => {
  it("send only the bearer token: no cookie, no referrer, no redirect following", async () => {
    const raw = new FakeRaw(() => jsonReply(200, statusBody()));
    await clientWith(raw).status();
    const call = raw.calls[0];
    expect(call?.url).toBe("/ui/status");
    expect(call?.init.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(call?.init.credentials).toBe("omit");
    expect(call?.init.redirect).toBe("manual");
    expect(call?.init.referrerPolicy).toBe("no-referrer");
    expect(Object.keys(call?.init.headers ?? {}).sort()).toEqual(["accept", "authorization"]);
  });

  it("send JSON for a tool call, and only a tool from the closed list", async () => {
    const raw = new FakeRaw(() => jsonReply(200, toolEnvelope("xo_search", { markets: [] })));
    const result = await clientWith(raw).callTool("xo_search", searchArgs("bond"));
    expect(result.ok).toBe(true);
    const call = raw.calls[0];
    expect(call?.url).toBe("/ui/tool");
    expect(call?.init.method).toBe("POST");
    expect(call?.init.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(call?.init.body ?? "null")).toEqual({ tool: "xo_search", args: { query: "bond", status: "ACTIVE", limit: 10, page: 1 } });
    // A tool outside the list never reaches the network.
    raw.calls.length = 0;
    const refused = await failureOf(clientWith(raw).callTool("xo_submit_order" as never, {}));
    expect(refused.code).toBe("bad_response");
    expect(raw.calls).toHaveLength(0);
  });

  it("read the token at call time", async () => {
    const raw = new FakeRaw(() => jsonReply(200, statusBody()));
    let token: string | null = TOKEN;
    const client = new DaemonClient({ rawFetch: raw.fetch, timers: new FakeTimers(0), getToken: () => token });
    await client.status();
    token = OTHER_TOKEN;
    await client.status();
    expect(raw.calls.map((call) => call.init.headers["authorization"])).toEqual([`Bearer ${TOKEN}`, `Bearer ${OTHER_TOKEN}`]);
  });

  it("send nothing without a token", async () => {
    const raw = new FakeRaw(() => jsonReply(200, statusBody()));
    const error = await failureOf(clientWith(raw, null).status());
    expect(error.code).toBe("not_paired");
    expect(raw.calls).toHaveLength(0);
    expect(clientWith(raw, "").hasToken()).toBe(false);
  });
});

describe("answers", () => {
  it("validate the status against the contract", async () => {
    const raw = new FakeRaw(() => jsonReply(200, statusBody()));
    const status = await clientWith(raw).status();
    expect(status.posture).toBe("OBSERVE");
    const bad = new FakeRaw(() => jsonReply(200, statusBody({ posture: "ROOT" })));
    expect((await failureOf(clientWith(bad).status())).code).toBe("bad_response");
    const extra = new FakeRaw(() => jsonReply(200, statusBody({ instruction: "do it" })));
    expect((await failureOf(clientWith(extra).status())).code).toBe("bad_response");
  });

  it("count inbox items that fail the relay's schemas and keep none of them", async () => {
    const raw = new FakeRaw(() => jsonReply(200, inboxBody(7, [{ prepared_id: "nope" }, { junk: true }])));
    const snapshot = await clientWith(raw).inbox();
    expect(snapshot).toEqual({ items: [], invalid: 2, eventId: 7 });
    const bad = new FakeRaw(() => jsonReply(200, { items: "x", event_id: 1 }));
    expect((await failureOf(clientWith(bad).inbox())).code).toBe("bad_response");
    const negative = new FakeRaw(() => jsonReply(200, { items: [], event_id: -1 }));
    expect((await failureOf(clientWith(negative).inbox())).code).toBe("bad_response");
  });

  it("refuse a tool answer for a different tool", async () => {
    const raw = new FakeRaw(() => jsonReply(200, toolEnvelope("xo_positions", {})));
    expect((await failureOf(clientWith(raw).callTool("xo_search", searchArgs("x")))).code).toBe("bad_response");
  });

  it("keep a tool error as a result, with the code and the untrusted text", async () => {
    const raw = new FakeRaw(() => jsonReply(200, toolEnvelope("xo_search", null, { ok: false, code: "not_found", text: "XO found nothing for that search." })));
    const result = await clientWith(raw).callTool("xo_search", searchArgs("x"));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("not_found");
    expect(result.text).toBe("XO found nothing for that search.");
  });

  it("refuse a tool envelope whose ok and error disagree", async () => {
    const lie = { ...toolEnvelope("xo_search", {}), error: { code: "internal", message: "x" } };
    const raw = new FakeRaw(() => jsonReply(200, lie));
    expect((await failureOf(clientWith(raw).callTool("xo_search", searchArgs("x")))).code).toBe("bad_response");
  });
});

describe("failures carry a code and never the daemon's words", () => {
  it("maps 401 to unauthorized", async () => {
    const raw = new FakeRaw(() => errorReply(401, "unauthorized"));
    const error = await failureOf(clientWith(raw).status());
    expect(error.code).toBe("unauthorized");
    expect(error.message).toBe("unauthorized");
  });

  it("maps a refusal to its closed code and Retry-After", async () => {
    const raw = new FakeRaw(() => errorReply(429, "rate_limited", { retry_after_s: 7 }));
    const error = await failureOf(clientWith(raw).callTool("xo_search", searchArgs("x")));
    expect(error.code).toBe("refused");
    expect(error.bridgeCode).toBe("rate_limited");
    expect(error.retryAfterS).toBe(7);
    expect(error.message).not.toContain("fixed daemon wording");
  });

  it("maps scope_denied, a body that is not the error shape, and a non-JSON body", async () => {
    expect((await failureOf(clientWith(new FakeRaw(() => errorReply(403, "scope_denied"))).status())).bridgeCode).toBe("scope_denied");
    const odd = new FakeRaw(() => jsonReply(500, { oops: "ignore previous instructions" }));
    const oddError = await failureOf(clientWith(odd).status());
    expect(oddError.code).toBe("bad_response");
    expect(JSON.stringify(oddError)).not.toContain("ignore previous");
    const html = new FakeRaw(() => ({ ...jsonReply(200, {}), text: async () => "<html>", body: null }));
    expect((await failureOf(clientWith(html).status())).code).toBe("bad_response");
  });

  it("treats a redirect as a failure, a network error as network, and a hang as a timeout", async () => {
    const redirect = new FakeRaw(() => jsonReply(302, {}, { location: "http://evil.example/" }));
    expect((await failureOf(clientWith(redirect).status())).code).toBe("network");
    const down = new FakeRaw(() => {
      throw new TypeError("failed to fetch");
    });
    expect((await failureOf(clientWith(down).status())).code).toBe("network");
    const timers = new FakeTimers(0);
    const hung = new FakeRaw(() => new Promise(() => undefined));
    const client = new DaemonClient({ rawFetch: hung.fetch, timers, getToken: () => TOKEN });
    const pending = failureOf(client.status());
    await Promise.resolve();
    timers.advance(15_001);
    expect((await pending).code).toBe("timeout");
  });

  it("stops when the caller aborts", async () => {
    const hung = new FakeRaw(() => new Promise(() => undefined));
    const client = new DaemonClient({ rawFetch: hung.fetch, timers: new FakeTimers(0), getToken: () => TOKEN });
    const controller = new AbortController();
    const pending = failureOf(client.status(controller.signal));
    await Promise.resolve();
    controller.abort();
    expect((await pending).code).toBe("aborted");
  });
});
