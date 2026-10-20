import type { LocalRuntime } from "../src/local/runtime.js";
import { STATUS_CAPABILITY_IDS, flagsSnapshot } from "../relay/health.js";
import { FLAG_NAMES } from "../src/relay/flags.js";
import { armControllerOf, postureOf } from "./arming.js";
import { auditAdapterOf } from "./audit-adapter.js";
import { BRIDGE_CONTRACT_VERSION, type StatusResponse } from "./contract.js";
import { eventBusOf, isoSecond } from "./events.js";
import { killControllerOf } from "./kill.js";
import { venueSwitchesOf } from "./proxy.js";
import { defineRoute, json, type BridgeModule, type BridgeModuleFactory, type DaemonHost } from "./server.js";

// GET /ui/status: one honest snapshot of what the daemon knows, for the status bar, the terminal and the screens that
// grey out what is not recorded as working. It is read-only and carries no secret: flags are shown and never set,
// capabilities are the relay's recorded facts (only an exact "yes" counts as proven), tripwires and upstream health are
// the relay's own views, venues are the read proxy's switches.
//
// Without a relay (a read-only instance, or one that failed to start) there is nothing to read. Every flag then reads
// OFF, no capability is recorded, and one tripwire entry says why, so a page never mistakes silence for health.

type RelayView = Extract<ReturnType<LocalRuntime["status"]>, { readonly state: "ready" }>["relay"];

const NO_RELAY_TRIPWIRE = { id: "no_relay", detail: "The local relay is not running in this process, so nothing can be prepared or sent from here." } as const;

const ALL_OFF: StatusResponse["flags"] = Object.freeze(Object.fromEntries(FLAG_NAMES.map((name) => [name, false]))) as StatusResponse["flags"];

const sources = new WeakMap<object, () => RelayView | undefined>();

// Connects the status to the in-process relay. Called once by the host process (bridge/main.ts) after the daemon starts.
export function attachStatusRuntime(host: DaemonHost, runtime: Pick<LocalRuntime, "status">): void {
  sources.set(host, () => {
    try {
      const status = runtime.status();
      // A relay that is "ready" but is missing the parts read below is treated as absent, never as healthy.
      const relay = status.state === "ready" ? status.relay : undefined;
      return typeof relay?.flags === "function" && relay.services?.tripwires !== undefined && relay.services.upstream !== undefined && relay.services.capabilities !== undefined ? relay : undefined;
    } catch {
      return undefined;
    }
  });
}

export function statusOf(host: DaemonHost, token: StatusResponse["token"]): StatusResponse {
  const relay = sources.get(host)?.();
  const kill = killControllerOf(host).engaged() || (relay !== undefined && relay.flags().KILL === true);
  const until = armControllerOf(host).armedUntilMs();
  const venues: StatusResponse["venues"] = {};
  for (const [service, state] of Object.entries(venueSwitchesOf(host) ?? {})) {
    venues[service] = { enabled: state.enabled, reason: state.reason, paused_until: state.paused_until ?? null };
  }
  const tripwires = relay?.services.tripwires.snapshot();
  return {
    contract_version: BRIDGE_CONTRACT_VERSION,
    version: host.version,
    time: isoSecond(host.clock()),
    posture: postureOf(host, token.scopes),
    armed_until: until === null ? null : isoSecond(until),
    kill,
    instance: host.instance(),
    flags: relay === undefined ? ALL_OFF : flagsSnapshot(relay.flags()),
    tripwires:
      tripwires === undefined
        ? { ok: false, tripped: [{ ...NO_RELAY_TRIPWIRE }] }
        : { ok: tripwires.ok, tripped: tripwires.tripped.map((entry) => ({ ...entry })) },
    upstream: relay?.services.upstream.health() ?? {},
    capabilities: relay?.services.capabilities.snapshot(STATUS_CAPABILITY_IDS) ?? {},
    venues,
    audit_head: auditAdapterOf(host).head(),
    token,
  };
}

export const bridgeModule: BridgeModuleFactory = (host: DaemonHost): BridgeModule => {
  // The event stream's "status" events use the page's view: a ui token holds read and prepare, or read only when this
  // instance does not own the data directory.
  eventBusOf(host).setStatusProvider(() => statusOf(host, { kind: "ui", scopes: host.instance() === "writer" ? ["read", "prepare"] : ["read"] }));
  return {
    name: "status",
    routes: [
      defineRoute({
        method: "GET",
        path: "/ui/status",
        access: { scope: "read" },
        handler: (ctx) => {
          const principal = ctx.principal;
          const token = principal === null ? { kind: "ui" as const, scopes: ["read" as const] } : { kind: principal.kind, scopes: [...principal.scopes] };
          return json(statusOf(host, token));
        },
      }),
    ],
  };
};
