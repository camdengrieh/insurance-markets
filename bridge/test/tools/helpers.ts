import { createHash } from "node:crypto";

import { mintAgentToken, tokenId } from "../../auth.js";
import type { TokenScope } from "../../contract.js";
import { createToolClassesModule, type ToolLimits, type ToolRunResult, type ToolRunner } from "../../tool-classes.js";
import { bridgeModule as armingModule } from "../../arming.js";
import { bridgeModule as killModule } from "../../kill.js";
import { bearer, postJson, seededRandom, send, startTestDaemon, type Reply, type TestDaemon, type TestDaemonOptions } from "../server/helpers.js";

// Shared setup for the class table, ARM window and kill tests: a daemon with the three modules (and a recording
// fake tool runner, so no MCP server and no relay is needed), one page token and one agent token.

export interface RunnerCall {
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export interface FakeRunner extends ToolRunner {
  readonly calls: RunnerCall[];
  // What the next calls answer; default is a plain success.
  next: (call: RunnerCall) => ToolRunResult | Promise<ToolRunResult>;
}

export function fakeRunner(): FakeRunner {
  const runner: FakeRunner = {
    calls: [],
    next: () => ({ isError: false, text: "ok", structured: { outcome: "submitted" } }),
    async call(tool, args) {
      runner.calls.push({ tool, args });
      return runner.next({ tool, args });
    },
  };
  return runner;
}

export interface GateDaemon extends TestDaemon {
  readonly runner: FakeRunner;
  // Reasons the daemon passed to the relay-side kill hook (context.engageKill).
  readonly kills: string[];
  readonly agentToken: string;
  uiToken(): Promise<string>;
  // Runs POST /ui/arm and POST /ui/arm/confirm with the code read from stderr, as a person would.
  arm(ui: string, minutes?: number): Promise<Reply>;
  tool(token: string, tool: string, args?: Record<string, unknown>): Promise<Reply>;
}

export interface GateOptions {
  readonly env?: Record<string, string>;
  readonly scopes?: readonly TokenScope[];
  readonly role?: TestDaemonOptions["role"];
  readonly limits?: ToolLimits;
  readonly killHost?: (reason: string) => Promise<boolean>;
  readonly extraModules?: TestDaemonOptions["modules"];
  readonly extraRouteKeys?: readonly string[];
  // Leaves out the tool-classes module, so no class guard stands in front of the routes: for tests of the checks a
  // route repeats inside itself (defence in depth). /ui/tool does not exist then.
  readonly withoutClassGuard?: boolean;
}

export const ARMABLE_ENV = { ENABLE_TRADING: "1", ENABLE_USEROP_SUBMIT: "1" } as const;

export async function startGateDaemon(options: GateOptions = {}): Promise<GateDaemon> {
  const runner = fakeRunner();
  const random = seededRandom("agent-token");
  const agentToken = mintAgentToken(random);
  const agentHash = { id: tokenId(agentToken), sha256: createHash("sha256").update(agentToken, "utf8").digest("hex") };
  const kills: string[] = [];
  const daemon = await startTestDaemon({
    agentScopes: options.scopes ?? ["read", "prepare", "submit"],
    agentHash,
    ...(options.role === undefined ? {} : { role: options.role }),
    ...(options.extraRouteKeys === undefined ? {} : { extraRouteKeys: options.extraRouteKeys }),
    modules: [
      ...(options.withoutClassGuard === true ? [] : [{ name: "tool-classes", source: createToolClassesModule({ runner, ...(options.limits === undefined ? {} : { limits: options.limits }) }) }]),
      { name: "arming", source: armingModule },
      { name: "kill", source: killModule },
      ...(options.extraModules ?? []),
    ],
    daemon: {
      env: options.env ?? {},
      engageKill: async (reason) => {
        kills.push(reason);
        return options.killHost === undefined ? true : options.killHost(reason);
      },
    },
  });
  const gate: GateDaemon = Object.assign(daemon, {
    runner,
    agentToken,
    kills,
    uiToken: () => daemon.pair(),
    async arm(ui: string, minutes = 5): Promise<Reply> {
      const asked = await postJson(daemon.port, "/ui/arm", { minutes }, bearer(ui));
      if (asked.status !== 200) return asked;
      const code = /ARM code ([2-9A-HJ-NP-Z]{8})/.exec(daemon.stderr.text())?.[1];
      if (code === undefined) throw new Error("no arm code on stderr");
      return postJson(daemon.port, "/ui/arm/confirm", { code }, bearer(ui));
    },
    tool: (token: string, tool: string, args: Record<string, unknown> = {}) => postJson(daemon.port, "/ui/tool", { tool, args }, bearer(token)),
  });
  return gate;
}

export function get(port: number, path: string, token: string): Promise<Reply> {
  return send({ port, path, headers: bearer(token) });
}
