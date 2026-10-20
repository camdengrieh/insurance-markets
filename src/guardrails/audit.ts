import { sanitizeUntrusted } from "./untrusted.js";

// One-line structured audit records.
//
// stdout belongs to MCP, so records go to stderr only, and the hosted runner kills a plugin whose
// stderr passes 16 KiB (scripts/conformance.mjs MAX_STDERR_BYTES). The writer therefore keeps its
// own byte budget well under that and drops records once it is spent.
//
// This is a log line, not storage: the plugin cannot keep an audit trail across calls. It exists
// so that whoever runs the host (or the hosted Test console) can see what each guard decided.
//
// Records are built from an allowlist of typed fields. Nothing is spread from the caller's
// object, so a stray secret property never reaches the line, and free text is sanitized and
// scrubbed of key-shaped strings, e-mail addresses and long tokens.

export const AUDIT_PREFIX = "xo-audit";
export const AUDIT_STDERR_BUDGET_BYTES = 8 * 1024;
// Never exceed this even if a caller asks for more: the runner's own cap is 16 KiB in total.
export const AUDIT_STDERR_HARD_CAP_BYTES = 12 * 1024;
export const AUDIT_LINE_MAX_BYTES = 1024;
// Space kept back to say "budget spent" once, after which further records are dropped silently.
const BUDGET_NOTICE_RESERVE_BYTES = 256;
const NOTE_MAX_CHARS = 200;
const HARD_INPUT_CHARS = 2000;
const MAX_WARNINGS = 4;

export type AuditAction =
  | "read"
  | "guard"
  | "quote"
  | "order_submit"
  | "order_cancel"
  | "market_create"
  | "fund"
  | "withdraw"
  | "enable_trading"
  | "redeem";

export type AuditOutcome = "allowed" | "blocked" | "ok" | "error";

export interface AuditEvent {
  readonly tool: string;
  readonly action: AuditAction;
  readonly outcome: AuditOutcome;
  // A short machine code such as a GuardCode.
  readonly code?: string;
  readonly side?: "BUY" | "SELL";
  // Condition id and order hash: 0x plus 64 hex digits.
  readonly marketId?: string;
  readonly orderHash?: string;
  readonly amountAtomic?: bigint;
  readonly priceTicks?: number;
  // Smart account address. Written in shortened form.
  readonly account?: string;
  // True when the account is trading a market it created itself. Allowed by the author's
  // decision, never blocked, always marked.
  readonly selfTrade?: boolean;
  readonly warnings?: readonly string[];
  readonly note?: string;
  readonly nowMs?: number;
}

const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const CODE = /^[a-z0-9_]{1,48}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export const SELF_TRADE_NOTICE =
  "Self-trade: this account created the market it is trading. Allowed by the operator, but XO's wash-trading and influence rules may still apply and its matching engine cancels self-matches.";

// Compares two EVM addresses ignoring case. False when either is missing or malformed, so a
// failed lookup never produces a false "self-trade" claim.
export function isSelfTrade(account: unknown, creator: unknown): boolean {
  return (
    typeof account === "string" &&
    typeof creator === "string" &&
    ADDRESS.test(account) &&
    ADDRESS.test(creator) &&
    account.toLowerCase() === creator.toLowerCase()
  );
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6).toLowerCase()}...${address.slice(-4).toLowerCase()}`;
}

// Removes anything shaped like a credential from free text. Lossy on purpose.
export function redactSecrets(text: string): string {
  return text
    .replace(/0x[0-9a-fA-F]{64,}/g, "[redacted-hex]")
    .replace(/\b0x[0-9a-fA-F]{40}\b/g, (match) => shortAddress(match))
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted-email]")
    .replace(/[A-Za-z0-9+/_=-]{32,}/g, "[redacted-token]");
}

function cleanText(value: string, maxChars: number): string {
  // Sanitize first so invisible characters cannot split a secret past the redaction patterns
  // (this also collapses whitespace, so U+2028 cannot break the line), then redact, then cap.
  const sanitized = sanitizeUntrusted(value, { maxChars: HARD_INPUT_CHARS }).text;
  return sanitizeUntrusted(redactSecrets(sanitized), { maxChars }).text;
}

function timestamp(nowMs: number | undefined): string {
  const date = new Date(typeof nowMs === "number" ? nowMs : Date.now());
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

const ACTIONS: ReadonlySet<string> = new Set<AuditAction>([
  "read",
  "guard",
  "quote",
  "order_submit",
  "order_cancel",
  "market_create",
  "fund",
  "withdraw",
  "enable_trading",
  "redeem",
]);
const OUTCOMES: ReadonlySet<string> = new Set<AuditOutcome>(["allowed", "blocked", "ok", "error"]);

export function formatAuditLine(event: AuditEvent): string {
  try {
    const dropped: string[] = [];
    // Callers are TypeScript, but a value from JSON or a cast can still be anything: validate.
    const record: Record<string, unknown> = {
      v: 1,
      ts: timestamp(event.nowMs),
      tool: typeof event.tool === "string" && TOOL_NAME.test(event.tool) ? event.tool : "invalid_tool",
      action: ACTIONS.has(event.action) ? event.action : "unknown",
      outcome: OUTCOMES.has(event.outcome) ? event.outcome : "unknown",
    };
    if (event.code !== undefined) {
      if (typeof event.code === "string" && CODE.test(event.code)) record["code"] = event.code;
      else dropped.push("code");
    }
    if (event.side === "BUY" || event.side === "SELL") record["side"] = event.side;
    if (event.marketId !== undefined) {
      if (typeof event.marketId === "string" && HASH.test(event.marketId)) {
        record["market"] = event.marketId.toLowerCase();
      } else dropped.push("market");
    }
    if (event.orderHash !== undefined) {
      if (typeof event.orderHash === "string" && HASH.test(event.orderHash)) {
        record["order_hash"] = event.orderHash.toLowerCase();
      } else dropped.push("order_hash");
    }
    if (typeof event.amountAtomic === "bigint") record["amount_atomic"] = event.amountAtomic.toString();
    if (typeof event.priceTicks === "number" && Number.isInteger(event.priceTicks)) {
      record["price_ticks"] = event.priceTicks;
    }
    if (event.account !== undefined) {
      if (typeof event.account === "string" && ADDRESS.test(event.account)) {
        record["account"] = shortAddress(event.account);
      } else dropped.push("account");
    }
    if (event.selfTrade === true) record["self_trade"] = true;
    if (Array.isArray(event.warnings)) {
      const warnings = event.warnings
        .filter((warning): warning is string => typeof warning === "string")
        .slice(0, MAX_WARNINGS)
        .map((warning) => cleanText(warning, NOTE_MAX_CHARS));
      if (warnings.length > 0) record["warnings"] = warnings;
    }
    if (typeof event.note === "string") record["note"] = cleanText(event.note, NOTE_MAX_CHARS);
    if (dropped.length > 0) record["dropped"] = dropped;

    // Shed optional detail until the line fits; the core fields always remain.
    for (const key of ["note", "warnings", "dropped"]) {
      if (Buffer.byteLength(`${AUDIT_PREFIX} ${JSON.stringify(record)}`) <= AUDIT_LINE_MAX_BYTES) break;
      delete record[key];
    }
    return `${AUDIT_PREFIX} ${JSON.stringify(record)}`;
  } catch {
    return `${AUDIT_PREFIX} ${JSON.stringify({ v: 1, ts: timestamp(undefined), outcome: "error", code: "audit_format_failed" })}`;
  }
}

export interface AuditSink {
  write(chunk: string): unknown;
}

export type AuditWriteResult = "written" | "dropped";

export interface AuditWriter {
  write(event: AuditEvent): AuditWriteResult;
  bytesWritten(): number;
  droppedCount(): number;
}

export interface AuditWriterOptions {
  // Defaults to process.stderr. Never pass process.stdout: it carries the MCP stream.
  readonly sink?: AuditSink;
  readonly budgetBytes?: number;
}

export function createAuditWriter(options: AuditWriterOptions = {}): AuditWriter {
  const sink = options.sink ?? process.stderr;
  const requested = options.budgetBytes;
  const budget = Math.min(
    typeof requested === "number" && Number.isInteger(requested) && requested > 0
      ? requested
      : AUDIT_STDERR_BUDGET_BYTES,
    AUDIT_STDERR_HARD_CAP_BYTES,
  );
  let used = 0;
  let dropped = 0;
  let noticeSent = false;

  function emit(line: string): boolean {
    const bytes = Buffer.byteLength(line);
    if (used + bytes > budget) return false;
    try {
      sink.write(line);
    } catch {
      // A closed stderr must never break a tool call.
      return false;
    }
    used += bytes;
    return true;
  }

  return {
    write(event) {
      const line = `${formatAuditLine(event)}\n`;
      if (used + Buffer.byteLength(line) <= budget - BUDGET_NOTICE_RESERVE_BYTES && emit(line)) {
        return "written";
      }
      dropped += 1;
      if (!noticeSent) {
        noticeSent = true;
        emit(
          `${AUDIT_PREFIX} ${JSON.stringify({ v: 1, ts: timestamp(undefined), outcome: "error", code: "audit_budget_spent" })}\n`,
        );
      }
      return "dropped";
    },
    bytesWritten: () => used,
    droppedCount: () => dropped,
  };
}

// Process-wide writer to stderr, used by the tools.
export const audit: AuditWriter = createAuditWriter();
