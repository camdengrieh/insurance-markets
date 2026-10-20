import { parseFlags } from "../src/relay/flags.js";
import type { Principal } from "./auth.js";
import type { BridgeModule, DaemonHost } from "./server.js";
import { defineRoute, json } from "./server.js";
import { emptyRequestSchema, killResponseSchema } from "./contract.js";

// The runtime kill of the Cockpit daemon (docs/dapp-design.md 5.4 "Kill", 7.2 M4-10, ask R6).
//
// WHAT IT IS. `POST /ui/kill` engages the existing one-way software kill: the relay's flag gate latches (through
// host.engageKill, which is the A1 hook `context.engageKill` of src/local/cli.ts, the same call SIGUSR2 makes) and
// this daemon latches too. Only a restart lifts it. There is no "un-kill" route, method or function here.
//
// TWO LATCHES, ON PURPOSE.
//   - The local latch is set synchronously, before anything is awaited. From that instant the guard in
//     bridge/tool-classes.ts refuses every prepare- and submit-class call and the ARM window is closed, whether or
//     not the relay answers. A relay that is slow, absent (read-only instance) or failing cannot delay the page's
//     "KILLED" state.
//   - The relay latch is the one that stops a send that is already past this daemon (the relay refuses every write
//     with `kill_switch`).
//
// WHAT COUNTS AS KILLED, in any order, never reset: the environment (KILL or XO_KILL_SWITCH, read once with the
// relay's own parser, so a garbage value means ON), POST /ui/kill, `engage()` from code, a relay answer that says
// `kill_switch` (SIGUSR2 reaches only the relay, so the daemon learns of it from the first refused write), and an
// optional probe (`observe`) that the host process can wire to the relay's flag gate.
//
// WHO MAY CALL IT. Any token, read scope, any instance role: a panic button must work from a read-only instance and
// from an agent token (a compromised agent can only stop things, which is the safe direction).

export interface KillOutcome {
  // False when no relay is running (read-only instance): nothing can write then anyway.
  readonly relayLatched: boolean;
  // True when this call is the one that engaged it.
  readonly first: boolean;
}

export type KillListener = (reason: string) => void;

export class KillController {
  readonly #host: DaemonHost;
  #latched = false;
  #reason: string | undefined;
  #probe: (() => boolean) | undefined;
  readonly #listeners: KillListener[] = [];
  readonly #envKill: boolean;

  constructor(host: DaemonHost) {
    this.#host = host;
    this.#envKill = parseFlags(host.env).flags.KILL;
    if (this.#envKill) this.#reason = "environment";
  }

  // True once killed, forever. Cheap enough to call on every request.
  engaged(): boolean {
    if (this.#latched || this.#envKill) return true;
    if (this.#probe !== undefined) {
      let probed = false;
      try {
        probed = this.#probe();
      } catch {
        // A probe that breaks is not evidence of a kill.
      }
      if (probed) this.#latch("relay");
    }
    return this.#latched;
  }

  // Short fixed word: "environment", "operator", "relay", "tripwire" is not one of these (that only disarms).
  reason(): string | undefined {
    return this.engaged() ? this.#reason : undefined;
  }

  // Lets the host process connect the relay's own state (for example `flagGate.killEngaged`), so a SIGUSR2 shows up
  // as KILLED without a refused write first. A probe can only ever add a kill.
  observe(probe: () => boolean): void {
    this.#probe = probe;
  }

  // The relay or a tool said `kill_switch`: believe it. Anything else is ignored.
  observeCode(code: unknown): void {
    if (code === "kill_switch") this.#latch("relay");
  }

  // Called once, at the moment the latch first sets. The ARM window uses this to close.
  onEngage(listener: KillListener): void {
    this.#listeners.push(listener);
  }

  #latch(reason: string): boolean {
    if (this.#latched) return false;
    this.#latched = true;
    this.#reason ??= reason;
    for (const listener of this.#listeners) {
      try {
        listener(reason);
      } catch {
        // A listener must not stop the latch.
      }
    }
    return true;
  }

  // The kill. Local latch first (synchronous), then the relay. Never rejects.
  async engage(reason: string, by?: Principal): Promise<KillOutcome> {
    const first = this.#latch(reason);
    const relayLatched = await this.#host.engageKill(`cockpit: ${reason}`);
    this.#host.emitAudit({
      ev: "ui.kill",
      outcome: "ok",
      state: relayLatched ? "relay_latched" : "local_only",
      ...(by === undefined ? {} : { tokenId: by.id }),
      ...(first ? {} : { note: "already engaged" }),
    });
    return { relayLatched, first };
  }
}

const controllers = new WeakMap<object, KillController>();

// One controller per daemon, shared by every module that loads for it (the arming window, the class gate, the
// kill route).
export function killControllerOf(host: DaemonHost): KillController {
  let controller = controllers.get(host);
  if (controller === undefined) {
    controller = new KillController(host);
    controllers.set(host, controller);
  }
  return controller;
}

export const bridgeModule = (host: DaemonHost): BridgeModule => {
  const kill = killControllerOf(host);
  return {
    name: "kill",
    routes: [
      defineRoute({
        method: "POST",
        path: "/ui/kill",
        // Any token: the safe direction needs no privilege. Not restricted to the page on purpose.
        access: { scope: "read" },
        body: emptyRequestSchema,
        handler: async (ctx) => {
          await kill.engage(ctx.principal?.kind === "agent" ? "agent kill request" : "kill button", ctx.principal ?? undefined);
          return json(killResponseSchema.parse({ kill: true, posture: "KILLED" }));
        },
      }),
    ],
  };
};
