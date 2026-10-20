import { createHash } from "node:crypto";

import { formatRelayAuditLine, type RelayAuditEvent } from "../relay/audit.js";
import { TOKEN_SCAN_PATTERN, type AuditFeedEntry } from "./contract.js";
import { eventBusOf, isoSecond } from "./events.js";
import type { BridgeModule, BridgeModuleFactory, DaemonAuditRecord, DaemonHost } from "./server.js";

// The audit adapter (docs/dapp-design.md 5.4 "Audit", ask A7, work package D4).
//
// The daemon front and the other bridge modules report what happened with `host.emitAudit(record)`: ui.pair,
// ui.arm, ui.disarm, ui.kill, ui.command, ui.card.shown, ui.card.decision, signer.request, signer.result, agent.call,
// feed.mismatch, schema.violation. This module is the one listener for them. For every record it does three things:
//
//   1. Writes it to the relay's audit log (relay/audit.ts `write`) when a sink is attached, so the daemon's events
//      share the relay's one authoritative log and its hash chain. The page is never a writer; only this server
//      side is. A read-only instance has no relay and therefore no sink: it writes nothing to a directory it does
//      not own.
//   2. Turns it into a feed entry for the observer pane: fixed daemon wording built ONLY from the fields that
//      relay/audit.ts accepted (each is shaped by an allowlisted pattern: hashes, short ids, enum words). The
//      record is run through formatRelayAuditLine first, so anything that did not fit its shape is gone before
//      the wording is built. No tool argument, tool result, token, signature, key or page text can reach an entry.
//   3. Chains the entry (SHA-256 over the previous link and the entry), keeps the newest 500, and publishes it on
//      the event bus as an `audit` event. The head of that chain is what the status bar shows (`audit_head`).
//      The chain is tamper-evident against accident, not against a malicious local process, and it restarts at the
//      zero link with the process.
//
// An unwritable audit log is a refusal, not a warning: while the sink reports itself unhealthy the adapter's guard
// refuses every route that prepares or sends (scope prepare or submit), except the kill and disarm, which only
// reduce risk. The refusal itself tries one write so the log can recover. (The relay applies the same rule to its
// own write paths: an unaudited send is worse than a refused one.)
//
// WIRING. `attachAuditSink(host, sink)` takes the relay's RelayAudit (or a function that returns it, for a relay
// that is still starting). `attachRelayRuntime` in bridge/inbox.ts wires this and the inbox's relay source from the
// local runtime in one call.

export interface AuditSink {
  write(event: RelayAuditEvent): Promise<void>;
  healthy(): boolean;
}
export type AuditSinkSource = AuditSink | (() => AuditSink | undefined);

export const FEED_SIZE = 500;
const ZERO_LINK = "0".repeat(64);
// Routes that only reduce risk stay open while the audit log cannot be written.
export const AUDIT_EXEMPT_KEYS: ReadonlySet<string> = new Set(["POST /ui/kill", "POST /ui/disarm"]);
const PROBE_MIN_GAP_MS = 1_000;

export interface AuditAdapterStats {
  // Records turned into feed entries.
  readonly recorded: number;
  // Records not written to the sink because the write threw (the sink reports its own health).
  readonly sinkFailures: number;
  // Records that were not recorded at all (token-shaped text survived the shaping, which should never happen).
  readonly dropped: number;
}

type Shaped = Readonly<Record<string, unknown>>;

const str = (record: Shaped, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
};

// The fixed wording of a feed entry. Every substituted value was already shaped by relay/audit.ts.
export function summaryOf(type: AuditFeedEntry["type"], record: Shaped): string {
  const outcome = str(record, "outcome");
  const code = str(record, "code");
  const pid = str(record, "pid");
  const done = outcome === "ok" ? "succeeded" : outcome === "refused" ? "was refused" : outcome === "error" ? "failed" : outcome === "ambiguous" ? "is ambiguous" : (outcome ?? "was recorded");
  const why = code === undefined ? "" : ` (${code})`;
  const item = pid === undefined ? "" : ` for item ${pid}`;
  switch (type) {
    case "ui.pair":
      return `Page pairing ${done}${why}.`;
    case "ui.arm":
      return `Submit window request ${done}${why}.`;
    case "ui.disarm":
      return `Submit window closed${why}.`;
    case "ui.kill":
      return `Kill switch engaged${why}. Only a restart releases it.`;
    case "ui.command":
      return `Terminal command ${str(record, "command") ?? "unknown"} ${done}${why}.`;
    case "ui.card.shown": {
      const tag = str(record, "digest_tag");
      const inner = str(record, "inner_tag");
      const verdict = str(record, "verdict");
      return `Signature card shown${item}${tag === undefined ? "" : `; digest tag ${tag}`}${inner === undefined ? "" : `; inner tag ${inner}`}${verdict === undefined ? "" : `; daemon check ${verdict}`}.`;
    }
    case "ui.card.decision":
      return `Signature card decision ${str(record, "decision") ?? "unknown"}${item} ${done}${why}.`;
    case "signer.request":
      return `Signing requested${item}${str(record, "request_ref") === undefined ? "" : `; request ${str(record, "request_ref") as string}`}.`;
    case "signer.result":
      return `Signing result${item} ${done}${why}.`;
    case "agent.call": {
      const ms = record["ms"];
      return `Agent called ${str(record, "tool") ?? "a tool"} (${str(record, "tool_class") ?? "unclassified"}): ${outcome ?? "recorded"}${why}${typeof ms === "number" ? ` in ${String(ms)} ms` : ""}.`;
    }
    case "feed.mismatch":
      return `Mismatch between two views of the same item${item}: ${str(record, "field") ?? "unspecified field"}.`;
    case "schema.violation":
      return `A message did not match its schema: ${str(record, "field") ?? str(record, "route") ?? "unspecified"}.`;
  }
}

function actorOf(type: AuditFeedEntry["type"], record: Shaped): AuditFeedEntry["actor"] {
  const token = str(record, "token");
  if (type === "agent.call") return token !== undefined && /^[0-9a-f]{8}$/.test(token) ? (`agent:${token}` as const) : "system";
  if (type === "ui.command") return "terminal";
  if (type.startsWith("ui.")) return "ui";
  return "system";
}

export class AuditAdapter {
  readonly #host: DaemonHost;
  readonly #bus: ReturnType<typeof eventBusOf>;
  #sink: AuditSinkSource | undefined;
  #entries: AuditFeedEntry[] = [];
  #link = ZERO_LINK;
  #seq = 0;
  #recorded = 0;
  #sinkFailures = 0;
  #dropped = 0;
  #lastProbeAt = -Infinity;
  #detach: (() => void) | undefined;

  constructor(host: DaemonHost) {
    this.#host = host;
    this.#bus = eventBusOf(host);
    // Replay: events emitted before this listener attached (the daemon front audits from its first request).
    this.#detach = host.onAudit((record) => this.#record(record), { replay: true });
    host.onClose(() => this.close());
  }

  attachSink(source: AuditSinkSource | undefined): void {
    this.#sink = source;
  }

  sink(): AuditSink | undefined {
    const source = this.#sink;
    return typeof source === "function" ? source() : source;
  }

  // The newest link as a 0x-prefixed hex string, or null before the first entry. The status bar shows it.
  head(): string | null {
    return this.#seq === 0 ? null : `0x${this.#link}`;
  }

  // Entries with seq greater than `afterSeq`, oldest first.
  entries(afterSeq = 0): readonly AuditFeedEntry[] {
    return this.#entries.filter((entry) => entry.seq > afterSeq);
  }

  stats(): AuditAdapterStats {
    return { recorded: this.#recorded, sinkFailures: this.#sinkFailures, dropped: this.#dropped };
  }

  // True while a sink is attached and reports itself unable to write.
  sinkUnhealthy(): boolean {
    const sink = this.sink();
    if (sink === undefined) return false;
    try {
      return !sink.healthy();
    } catch {
      return true;
    }
  }

  // One write so an unhealthy log can notice it works again. At most one a second.
  probe(): void {
    const now = this.#host.clock();
    const sink = this.sink();
    if (sink === undefined || now - this.#lastProbeAt < PROBE_MIN_GAP_MS) return;
    this.#lastProbeAt = now;
    void this.#write(sink, { ev: "refused", outcome: "refused", code: "audit_unhealthy" });
  }

  #write(sink: AuditSink, record: RelayAuditEvent): Promise<void> {
    return sink.write(record).catch(() => {
      this.#sinkFailures += 1;
    });
  }

  #record(record: DaemonAuditRecord): void {
    const nowMs = this.#host.clock();
    // The writer's own shaping decides what survives; the wording below is built from the survivors only.
    const line = formatRelayAuditLine(record, nowMs);
    if (TOKEN_SCAN_PATTERN.test(line)) {
      this.#dropped += 1;
      return;
    }
    let shaped: Shaped;
    try {
      shaped = JSON.parse(line) as Shaped;
    } catch {
      this.#dropped += 1;
      return;
    }
    const sink = this.sink();
    if (sink !== undefined) void this.#write(sink, record);
    const type = record.ev;
    const body = { seq: this.#seq + 1, at: isoSecond(nowMs), type, actor: actorOf(type, shaped), summary: summaryOf(type, shaped).slice(0, 300) };
    const link = createHash("sha256").update(`${this.#link}\n${JSON.stringify(body)}`).digest("hex");
    const entry: AuditFeedEntry = { ...body, hash: `0x${link}` };
    this.#seq = body.seq;
    this.#link = link;
    this.#recorded += 1;
    this.#entries.push(entry);
    if (this.#entries.length > FEED_SIZE) this.#entries.shift();
    this.#bus.publish({ type: "audit", entry });
  }

  close(): void {
    this.#detach?.();
    this.#detach = undefined;
  }
}

const adapters = new WeakMap<DaemonHost, AuditAdapter>();

// The host's one adapter, created on first use (so the inbox can use it whatever the load order).
export function auditAdapterOf(host: DaemonHost): AuditAdapter {
  let adapter = adapters.get(host);
  if (adapter === undefined) {
    adapter = new AuditAdapter(host);
    adapters.set(host, adapter);
  }
  return adapter;
}

// True while this host's audit log cannot be written. Does not create the adapter: a daemon without the audit module
// has no log to be unhealthy. Also nudges the log to prove it works again (at most one probe a second).
// The tool gate asks this for a prepare or submit tool: those calls arrive on routes registered at scope `read`
// (POST /ui/tool, the MCP endpoint), so the route guard above cannot see their class.
export function auditLogUnwritable(host: DaemonHost): boolean {
  const adapter = adapters.get(host);
  if (adapter === undefined || !adapter.sinkUnhealthy()) return false;
  adapter.probe();
  return true;
}

export function attachAuditSink(host: DaemonHost, source: AuditSinkSource | undefined): void {
  auditAdapterOf(host).attachSink(source);
}

export const bridgeModule: BridgeModuleFactory = (host: DaemonHost): BridgeModule => {
  const adapter = auditAdapterOf(host);
  host.addGuard((ctx) => {
    if (ctx.access === "public" || ctx.access.scope === "read") return undefined;
    if (AUDIT_EXEMPT_KEYS.has(ctx.key)) return undefined;
    if (!adapter.sinkUnhealthy()) return undefined;
    adapter.probe();
    return {
      code: "precondition_failed",
      message: "The audit log cannot be written, so nothing that prepares or sends is allowed until it can.",
      details: { reason: "audit_log_unwritable" },
    };
  });
  return { name: "audit-adapter", close: () => adapter.close() };
};
