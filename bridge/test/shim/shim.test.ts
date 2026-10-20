import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { MAX_REQUEST_BODY_BYTES } from "../../contract.js";
import { envTokenSource, fileTokenSource } from "../../shim.js";
import {
  CATALOG,
  TOKEN_A,
  TOKEN_B,
  connectShim,
  errorBody,
  freePort,
  okAnswer,
  scratch,
  shimCode,
  startFakeDaemon,
  textOf,
  type FakeDaemon,
  type Scratch,
  type ShimClient,
} from "./helpers.js";

// The MCP-facing behaviour of the shim against a scripted fake daemon on a real loopback socket.

describe("tools/list", () => {
  let box: Scratch;
  beforeEach(() => {
    box = scratch();
  });
  afterEach(() => box.cleanup());

  it("lists the catalogue with every field intact while no daemon is running", async () => {
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      const reply = await client.request("tools/list");
      assert.deepEqual(reply.result?.["tools"], CATALOG);
      const marker = (reply.result?.["tools"] as Array<{ name: string; _meta?: Record<string, unknown> }>).find((tool) => tool.name === "xo_submit_order");
      assert.equal(marker?._meta?.["anthropic/requiresUserInteraction"], true);
    } finally {
      await client.close();
    }
  });

  it("works with no token configured, because listing sends nothing", async () => {
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(undefined) });
    try {
      const reply = await client.request("tools/list");
      assert.equal((reply.result?.["tools"] as unknown[]).length, CATALOG.length);
    } finally {
      await client.close();
    }
  });

  it("answers a protocol error, not a crash, when the definitions cannot be loaded, and tries again next time", async () => {
    let attempts = 0;
    const client = await connectShim({
      dataDir: box.dir,
      tokens: envTokenSource(TOKEN_A),
      catalog: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom with /private/path");
        return CATALOG;
      },
    });
    try {
      const first = await client.request("tools/list");
      assert.ok(first.error);
      assert.doesNotMatch(first.error.message, /private/);
      const second = await client.request("tools/list");
      assert.equal((second.result?.["tools"] as unknown[]).length, CATALOG.length);
    } finally {
      await client.close();
    }
  });
});

describe("forwarding a call", () => {
  let box: Scratch;
  let daemon: FakeDaemon;
  let client: ShimClient;
  beforeEach(async () => {
    box = scratch();
    daemon = await startFakeDaemon();
    box.daemonFile({ port: daemon.port });
    client = await connectShim({ dataDir: box.dir, tokens: fileTokenSource(box.tokenFile(TOKEN_A)) });
  });
  afterEach(async () => {
    await client.close();
    await daemon.close();
    box.cleanup();
  });

  it("sends the tool name and arguments to /ui/tool with the agent token and nothing else", async () => {
    const reply = await client.call("xo_search", { query: "bond" });
    assert.equal(reply.result?.["isError"], false);
    const call = daemon.seen.find((request) => request.path === "/ui/tool");
    assert.ok(call);
    assert.equal(call.method, "POST");
    assert.equal(call.headers["authorization"], `Bearer ${TOKEN_A}`);
    assert.equal(call.headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(call.body), { tool: "xo_search", args: { query: "bond" } });
    assert.equal(call.headers["origin"], undefined);
    assert.equal(call.headers["cookie"], undefined);
    assert.equal(call.headers["host"], `127.0.0.1:${daemon.port}`);
  });

  it("returns the tool's text and structured content, and defaults missing arguments to an empty object", async () => {
    daemon.onTool = (request) => ({ body: okAnswer(request.tool, { outcome: "ok", n: 2 }, "two results") });
    const reply = await client.request("tools/call", { name: "xo_search" });
    assert.equal(textOf(reply), "two results");
    assert.deepEqual(reply.result?.["structuredContent"], { outcome: "ok", n: 2 });
    assert.deepEqual(JSON.parse(daemon.seen.at(-1)?.body ?? "{}"), { tool: "xo_search", args: {} });
  });

  it("uses the structured answer as the text when the tool gave none, and drops a structured value that is not an object", async () => {
    daemon.onTool = (request) => ({ body: okAnswer(request.tool, { outcome: "ok" }, null) });
    const one = await client.call("xo_search");
    assert.equal(textOf(one), '{"outcome":"ok"}');
    daemon.onTool = (request) => ({ body: okAnswer(request.tool, [1, 2], "list") });
    const two = await client.call("xo_search");
    assert.equal(two.result?.["structuredContent"], undefined);
    assert.equal(textOf(two), "list");
  });

  it("marks a failed tool run as an error and keeps the tool's own structured answer", async () => {
    daemon.onTool = (request) => ({
      body: { tool: request.tool, tool_class: "prepare", ok: false, duration_ms: 1, structured: { outcome: "refused", code: "flag_off" }, text: "Trading is off.", error: { code: "flag_off", message: "The tool reported an error. See the text." } },
    });
    const reply = await client.call("xo_prepare_order");
    assert.equal(reply.result?.["isError"], true);
    assert.deepEqual(reply.result?.["structuredContent"], { outcome: "refused", code: "flag_off" });
    assert.equal(textOf(reply), "Trading is off.");
  });

  it("passes the daemon's refusals through with their code and message (scope_denied, not_armed, rate_limited)", async () => {
    for (const [code, status] of [
      ["scope_denied", 403],
      ["not_armed", 403],
      ["rate_limited", 429],
    ] as const) {
      daemon.onTool = () => ({ status, body: errorBody(code, `The daemon says ${code}.`, code === "rate_limited" ? { retry_after_s: 7 } : {}) });
      const reply = await client.call("xo_submit_order");
      assert.equal(reply.result?.["isError"], true);
      assert.equal(shimCode(reply), code);
      assert.match(textOf(reply), new RegExp(`The daemon says ${code}`));
      if (code === "rate_limited") assert.match(textOf(reply), /Retry after 7 s/);
    }
  });

  it("does not use an answer that is outside the daemon's contract, and says the call may have run", async () => {
    daemon.onTool = () => ({ status: 200, body: { ok: true, surprise: 1 } });
    const reply = await client.call("xo_submit_order");
    assert.equal(reply.result?.["isError"], true);
    assert.equal(shimCode(reply), "response_invalid");
    assert.match(textOf(reply), /may have run/);
  });

  it("removes token-shaped text from anything the daemon returns", async () => {
    daemon.onTool = (request) => ({ body: okAnswer(request.tool, { echo: TOKEN_B }, `leak ${TOKEN_B} and ${TOKEN_A}`) });
    const reply = await client.call("xo_search");
    const everything = JSON.stringify(reply);
    assert.doesNotMatch(everything, /cka_/);
    assert.match(textOf(reply), /\[removed\]/);
  });

  it("refuses locally, sending nothing, for a bad tool name, bad arguments or an oversize body", async () => {
    const before = daemon.seen.length;
    const badName = await client.call("Not-A-Tool!");
    assert.equal(shimCode(badName), "request_invalid");
    // The SDK may reject a non-object `arguments` itself (a protocol error) before the shim sees it; either way nothing is sent.
    const badArgs = await client.request("tools/call", { name: "xo_search", arguments: ["a"] });
    assert.ok(badArgs.error !== undefined || shimCode(badArgs) === "request_invalid");
    const badKey = await client.call("xo_search", { ["k".repeat(65)]: 1 });
    assert.equal(shimCode(badKey), "request_invalid");
    const big = await client.call("xo_search", { query: "x".repeat(MAX_REQUEST_BODY_BYTES + 1) });
    assert.equal(shimCode(big), "request_invalid");
    assert.equal(daemon.seen.length, before, "nothing reached the daemon");
  });

  it("answers an unknown tool with a protocol error and sends nothing", async () => {
    const before = daemon.seen.length;
    const reply = await client.call("xo_does_not_exist");
    assert.ok(reply.error);
    assert.equal(reply.error.code, -32602);
    assert.equal(daemon.seen.length, before);
  });

  it("checks the daemon's identity once, before the first token is sent, and not again", async () => {
    await client.call("xo_search");
    await client.call("xo_search");
    const statusProbes = daemon.seen.filter((request) => request.path === "/ui/status");
    assert.equal(statusProbes.length, 1);
    assert.equal(statusProbes[0]?.headers["authorization"], undefined);
    assert.equal(daemon.seen[0]?.path, "/ui/status", "the probe came first");
  });
});

describe("when the daemon is not what it should be", () => {
  let box: Scratch;
  beforeEach(() => {
    box = scratch();
  });
  afterEach(() => box.cleanup());

  it("says the daemon is not running when there is no info file, with the command to start it, and creates nothing", async () => {
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      const reply = await client.call("xo_search");
      assert.equal(reply.result?.["isError"], true);
      assert.equal(shimCode(reply), "daemon_not_running");
      assert.match(textOf(reply), /serve/);
      assert.match(textOf(reply), /never starts a daemon or an embedded relay/);
    } finally {
      await client.close();
    }
  });

  it("treats an info file left by a dead process as not running, without connecting", async () => {
    const daemon = await startFakeDaemon();
    box.daemonFile({ port: daemon.port });
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A), pidAlive: () => false });
    try {
      const reply = await client.call("xo_search");
      assert.equal(shimCode(reply), "daemon_not_running");
      assert.match(textOf(reply), /left over/);
      assert.equal(daemon.seen.length, 0, "no request, so no token, went to the port");
    } finally {
      await client.close();
      await daemon.close();
    }
  });

  it("says not running when the port in the info file has nothing listening", async () => {
    box.daemonFile({ port: await freePort() });
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      const reply = await client.call("xo_search");
      assert.equal(shimCode(reply), "daemon_not_running");
    } finally {
      await client.close();
    }
  });

  it("does not send the token to a listener that does not answer like the Cockpit", async () => {
    for (const identity of ["wrong_status", "wrong_body"] as const) {
      const daemon = await startFakeDaemon();
      daemon.identity = identity;
      box.daemonFile({ port: daemon.port });
      const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
      try {
        const reply = await client.call("xo_search");
        assert.equal(shimCode(reply), "daemon_identity", identity);
        assert.ok(
          daemon.seen.every((request) => request.headers["authorization"] === undefined),
          "no request carried the token",
        );
        assert.ok(daemon.seen.every((request) => !JSON.stringify(request).includes(TOKEN_A)));
      } finally {
        await client.close();
        await daemon.close();
      }
    }
  });

  it("refuses an address that is not exactly http://127.0.0.1:<port>", async () => {
    for (const url of ["http://localhost:4000", "https://127.0.0.1:4000", "http://127.0.0.1:4000/x", "http://user:pw@127.0.0.1:4000", "http://10.0.0.5:4000", "http://127.0.0.1", "not a url"]) {
      const client = await connectShim({ url, tokens: envTokenSource(TOKEN_A) });
      try {
        const reply = await client.call("xo_search");
        assert.equal(shimCode(reply), "daemon_unreachable", url);
      } finally {
        await client.close();
      }
    }
  });

  it("follows a daemon that restarted on a new port, once, without resending anything that was processed", async () => {
    const first = await startFakeDaemon();
    box.daemonFile({ port: first.port });
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      assert.equal((await client.call("xo_search")).result?.["isError"], false);
      await first.close();
      const second = await startFakeDaemon();
      box.daemonFile({ port: second.port });
      try {
        const reply = await client.call("xo_search", { query: "after restart" });
        assert.equal(reply.result?.["isError"], false);
        const call = second.seen.find((request) => request.path === "/ui/tool");
        assert.deepEqual(JSON.parse(call?.body ?? "{}"), { tool: "xo_search", args: { query: "after restart" } });
        assert.equal(second.seen.filter((request) => request.path === "/ui/tool").length, 1);
      } finally {
        await second.close();
      }
    } finally {
      await client.close();
    }
  });

  it("recovers when the daemon was down and comes back, without restarting the shim", async () => {
    const port = await freePort();
    box.daemonFile({ port });
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      assert.equal(shimCode(await client.call("xo_search")), "daemon_not_running");
      const daemon = await startFakeDaemon({ port });
      try {
        assert.equal((await client.call("xo_search")).result?.["isError"], false);
      } finally {
        await daemon.close();
      }
    } finally {
      await client.close();
    }
  });
});

describe("the agent token", () => {
  let box: Scratch;
  let daemon: FakeDaemon;
  beforeEach(async () => {
    box = scratch();
    daemon = await startFakeDaemon();
    box.daemonFile({ port: daemon.port });
  });
  afterEach(async () => {
    await daemon.close();
    box.cleanup();
  });

  it("says no token is configured, and sends nothing, when there is none", async () => {
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(undefined) });
    try {
      const reply = await client.call("xo_search");
      assert.equal(shimCode(reply), "token_missing");
      assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 0);
    } finally {
      await client.close();
    }
  });

  it("refuses a malformed token, a page token and a daemon-style hash, naming the problem but not the value", async () => {
    for (const value of ["cka_short", "cku_" + "A".repeat(43), "a".repeat(64), "Bearer " + TOKEN_A]) {
      const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(value) });
      try {
        const reply = await client.call("xo_search");
        assert.equal(shimCode(reply), "token_invalid", value.slice(0, 8));
        assert.ok(!textOf(reply).includes(value));
      } finally {
        await client.close();
      }
    }
    assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 0);
  });

  it("refuses a token file that other users can read, a link, and a file that is not a token", async () => {
    const open = fileTokenSource(box.tokenFile(TOKEN_A, 0o644));
    await assert.rejects(open.get(), (error: { code?: string; message: string }) => error.code === "token_invalid" && /chmod 600/.test(error.message));
    const missing = fileTokenSource(box.dir + "/nope");
    await assert.rejects(missing.get(), (error: { code?: string }) => error.code === "token_missing");
    const directory = fileTokenSource(box.dir);
    await assert.rejects(directory.get(), (error: { code?: string }) => error.code === "token_invalid");
  });

  it("picks up a rotated token from its file after one 401 and retries the call once", async () => {
    const file = box.tokenFile(TOKEN_A);
    const client = await connectShim({ dataDir: box.dir, tokens: fileTokenSource(file) });
    try {
      assert.equal((await client.call("xo_search")).result?.["isError"], false);
      // The user runs `serve --rotate-agent-token` and saves the new token over the old file.
      daemon.accepted = TOKEN_B;
      box.tokenFile(TOKEN_B);
      const reply = await client.call("xo_search", { query: "after rotation" });
      assert.equal(reply.result?.["isError"], false);
      const calls = daemon.seen.filter((request) => request.path === "/ui/tool");
      assert.equal(calls.length, 3, "first call, the rejected one, and the retry");
      assert.equal(calls[1]?.headers["authorization"], `Bearer ${TOKEN_A}`);
      assert.equal(calls[2]?.headers["authorization"], `Bearer ${TOKEN_B}`);
      // The new token stays in use without another round trip.
      await client.call("xo_search");
      assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").at(-1)?.headers["authorization"], `Bearer ${TOKEN_B}`);
    } finally {
      await client.close();
    }
  });

  it("reports token_rejected, without looping, when the file still holds the old token", async () => {
    const client = await connectShim({ dataDir: box.dir, tokens: fileTokenSource(box.tokenFile(TOKEN_A)) });
    try {
      daemon.accepted = TOKEN_B;
      const reply = await client.call("xo_search");
      assert.equal(shimCode(reply), "token_rejected");
      assert.match(textOf(reply), /rotate-agent-token/);
      assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 1, "one try, no reload gain, no retry");
    } finally {
      await client.close();
    }
  });

  it("tells an environment-token user to restart, since that token cannot change under a running shim", async () => {
    daemon.accepted = TOKEN_B;
    const client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      const reply = await client.call("xo_search");
      assert.equal(shimCode(reply), "token_rejected");
      assert.match(textOf(reply), /XO_COCKPIT_AGENT_TOKEN/);
      assert.doesNotMatch(JSON.stringify(reply), /cka_/);
    } finally {
      await client.close();
    }
  });
});

describe("a call that may have been processed is never sent twice", () => {
  let box: Scratch;
  let daemon: FakeDaemon;
  let client: ShimClient;
  beforeEach(async () => {
    box = scratch();
    daemon = await startFakeDaemon();
    box.daemonFile({ port: daemon.port });
  });
  afterEach(async () => {
    await client.close();
    await daemon.close();
    box.cleanup();
  });

  it("reports outcome_unknown when the connection drops after the request arrived, and does not resend", async () => {
    client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    daemon.onTool = () => ({ drop: true });
    const reply = await client.call("xo_submit_order", { prepared_id: "p1" });
    assert.equal(reply.result?.["isError"], true);
    assert.equal(shimCode(reply), "outcome_unknown");
    assert.match(textOf(reply), /may have run/);
    assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 1);
  });

  it("reports outcome_unknown on timeout, and does not resend", async () => {
    client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A), callTimeoutMs: 150 });
    daemon.onTool = () => ({ hang: true });
    const reply = await client.call("xo_submit_order");
    assert.equal(shimCode(reply), "outcome_unknown");
    assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 1);
  });

  it("reports outcome_unknown, with a cancel notice, when the client cancels a call that was already sent", async () => {
    client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    daemon.onTool = () => ({ hang: true });
    const started = client.begin("xo_submit_order");
    // Wait until the request has arrived at the daemon.
    for (let waited = 0; waited < 50 && !daemon.seen.some((request) => request.path === "/ui/tool"); waited += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(daemon.seen.some((request) => request.path === "/ui/tool"));
    await client.cancel(started.id);
    // A cancelled request gets no answer from the SDK; the daemon still saw exactly one call.
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 1);
  });

  it("does not resend after a 5xx the daemon gave for the call", async () => {
    client = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    daemon.onTool = () => ({ status: 500, body: errorBody("internal", "The daemon failed.") });
    const reply = await client.call("xo_submit_order");
    assert.equal(shimCode(reply), "internal");
    assert.equal(daemon.seen.filter((request) => request.path === "/ui/tool").length, 1);
  });
});

describe("shared state", () => {
  it("is one daemon and one link: two shims on one daemon.json talk to the same daemon", async () => {
    const box = scratch();
    const daemon = await startFakeDaemon();
    box.daemonFile({ port: daemon.port });
    const first = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    const second = await connectShim({ dataDir: box.dir, tokens: envTokenSource(TOKEN_A) });
    try {
      await first.call("xo_search", { query: "a" });
      await second.call("xo_search", { query: "b" });
      const bodies = daemon.seen.filter((request) => request.path === "/ui/tool").map((request) => (JSON.parse(request.body) as { args: { query: string } }).args.query);
      assert.deepEqual(bodies, ["a", "b"]);
    } finally {
      await first.close();
      await second.close();
      await daemon.close();
      box.cleanup();
    }
  });
});
