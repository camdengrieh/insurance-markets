import { afterEach, describe, expect, it } from "vitest";

import { bridgeModule as auditModule } from "../../../../bridge/audit-adapter";
import { bridgeModule as eventsModule, eventBusOf } from "../../../../bridge/events";
import { bridgeModule as inboxModule } from "../../../../bridge/inbox";
import { defineRoute, json } from "../../../../bridge/server";
import { startGateDaemon, type GateDaemon } from "../../../../bridge/test/tools/helpers";
import type { TimerApi } from "../../core/cache";
import type { RawFetch, RawResponse } from "../../core/fetch";
import { DaemonClient, isDaemonError } from "./client";
import { execute, type ExecContext, type Outcome } from "./execute";
import { PageSession } from "./session";
import { runEventStream, type StreamState } from "./stream";
import { FIXTURES, OTHER_TOKEN, statusBody } from "./test-support";
import { searchArgs, searchOutput } from "./tools";
import { observerReducer, INITIAL_OBSERVER, type ObserverState } from "./observer";

// The page's own client against the REAL daemon front (Host and Origin pinning, bearer tokens, the tool gate, the
// event stream), with the plugin's tool runner replaced by a recorder. Only the loopback socket is used.

const timers: TimerApi = { setTimeout: (handler, ms) => globalThis.setTimeout(handler, ms), clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>) };

let daemon: GateDaemon | null = null;
afterEach(async () => {
  await daemon?.stop();
  daemon = null;
});

async function start(): Promise<{ readonly t: GateDaemon; readonly rawFetch: RawFetch; readonly session: PageSession; readonly client: DaemonClient }> {
  const t = await startGateDaemon({
    extraModules: [
      { name: "audit-adapter", source: auditModule },
      { name: "events", source: eventsModule },
      { name: "inbox", source: inboxModule },
      {
        // /ui/status has no owner yet in bridge/, so the test serves a contract-shaped one.
        name: "status",
        source: { name: "status", routes: [defineRoute({ method: "GET", path: "/ui/status", access: { scope: "read" }, handler: () => json(statusBody()) })] },
      },
    ],
  });
  daemon = t;
  t.runner.next = () => ({ isError: false, text: null, structured: FIXTURES.search });
  const rawFetch: RawFetch = (path, init) => fetch(`http://127.0.0.1:${String(t.port)}${path}`, init) as unknown as Promise<RawResponse>;
  const session = new PageSession({ rawFetch, timers, consumeCode: () => t.auth.issuePairing().code, storage: null });
  const client = new DaemonClient({ rawFetch, timers, getToken: () => session.token() });
  return { t, rawFetch, session, client };
}

describe("the page against the real daemon", () => {
  it("pairs, reads the status and the inbox, and calls a read tool through the gate", async () => {
    const { t, session, client } = await start();
    expect(await session.pair()).toEqual({ ok: true });
    expect(session.token()).toMatch(/^cku_/);

    const status = await client.status();
    expect(status.contract_version).toBe(1);

    const inbox = await client.inbox();
    expect(inbox.items).toEqual([]);
    expect(inbox.eventId).toBeGreaterThanOrEqual(0);

    const answer = await client.callTool("xo_search", searchArgs("french"));
    expect(answer.ok).toBe(true);
    expect(answer.toolClass).toBe("read");
    expect(searchOutput.safeParse(answer.structured).success).toBe(true);
    expect(t.runner.calls).toEqual([{ tool: "xo_search", args: { query: "french", status: "ACTIVE", limit: 10, page: 1 } }]);
  });

  it("runs the whole markets command, and nothing the daemon would class above read ever leaves the page", async () => {
    const { t, session, client } = await start();
    await session.pair();
    const records: unknown[] = [];
    let id = 0;
    const ctx: ExecContext = {
      client,
      signal: new AbortController().signal,
      nowMs: () => Date.now(),
      loadBindings: async () => ({ bindings: [], persistence: "memory" }),
      audit: () => ({ rows: [], connection: "idle" }),
      onCall: (record) => records.push(record),
      onUnauthorized: () => undefined,
      nextCallId: () => (id += 1),
    };
    const outcome: Outcome = await execute({ name: "markets", query: "french" }, ctx);
    expect(outcome.kind).toBe("markets");
    const status = await execute({ name: "status" }, ctx);
    expect(status.kind).toBe("status");
    // The daemon's own audit trail saw read-class calls only.
    expect(t.runner.calls.map((call) => call.tool)).toEqual(["xo_search"]);
  });

  it("is refused with a token the daemon did not issue, and the page reports an expired session", async () => {
    const { client, session } = await start();
    await session.pair();
    const stranger = new DaemonClient({ rawFetch: (path, init) => fetch(`http://127.0.0.1:${String(daemon?.port)}${path}`, init) as unknown as Promise<RawResponse>, timers, getToken: () => OTHER_TOKEN });
    for (const call of [() => stranger.status(), () => stranger.inbox(), () => stranger.callTool("xo_search", searchArgs("x"))]) {
      try {
        await call();
        throw new Error("expected a refusal");
      } catch (error) {
        expect(isDaemonError(error) && error.code === "unauthorized").toBe(true);
      }
    }
    expect((await client.status()).contract_version).toBe(1);
  });

  it("follows the event stream: posture changes arrive, and the connection closes with the page", async () => {
    const { t, session, rawFetch } = await start();
    await session.pair();
    const states: StreamState[] = [];
    let observed: ObserverState = INITIAL_OBSERVER;
    const controller = new AbortController();
    const done = runEventStream(
      {
        rawFetch,
        timers,
        getToken: () => session.token(),
        sleep: (ms, signal) =>
          new Promise<void>((resolve) => {
            const handle = setTimeout(resolve, ms);
            signal.addEventListener("abort", () => (clearTimeout(handle), resolve()), { once: true });
          }),
        random: () => 0.5,
      },
      {
        onState: (state) => {
          states.push(state);
          observed = observerReducer(observed, { type: "connection", state });
        },
        onEvent: (event) => {
          observed = observerReducer(observed, { type: "event", event });
        },
        onViolation: () => {
          observed = observerReducer(observed, { type: "violation" });
        },
        resync: async () => 0,
      },
      controller.signal,
    );
    const waitFor = async (check: () => boolean): Promise<void> => {
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if (check()) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("timed out waiting for the stream");
    };
    await waitFor(() => states.includes("live"));
    expect(t.daemon.host.openStreams()).toBe(1);
    eventBusOf(t.daemon.host).publishPosture("PREPARE", null);
    await waitFor(() => observed.posture === "PREPARE");
    expect(observed.violations).toBe(0);
    controller.abort();
    await done;
    expect(states.at(-1)).toBe("stopped");
    await waitFor(() => t.daemon.host.openStreams() === 0);
  });
});
