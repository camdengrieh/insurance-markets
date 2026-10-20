// The read terminal's command grammar (docs/dapp-design.md 5.2, acceptance M5-1 for the read half and M5-2).
//
// This file is the whole language. It is a closed table of nine read commands plus `clear`. There is no
// pipe, variable, redirect, script, JSON or "call this tool" form, no flag or cap setter and no raw-call path,
// and nothing here knows how to build one. A line that names anything else is refused as a whole; it is never
// partly run. A pasted newline is flattened to a space, so a paste can never become a second command.
//
// Pure code: no DOM, no network, no clock. The parser decides WHAT the user asked for; execute.ts decides how.

import { HARD_MAX_CHARS, sanitizeUntrusted } from "@shared/guardrails/untrusted";

import { checkEvmAddress } from "../../core/address";

export const MAX_LINE_CHARS = 400;
export const MARKETS_QUERY_MAX_CHARS = 100;
export const AUDIT_MAX_ROWS = 50;
export const AUDIT_DEFAULT_ROWS = 10;

// ---- the line ------------------------------------------------------------------------------------------------------

export interface NormalizedLine {
  readonly line: string;
  // The paste held a line break (or a Unicode line or paragraph separator) that became a space.
  readonly flattened: boolean;
  // Invisible, bidi or control characters were removed.
  readonly strippedInvisible: boolean;
  readonly tooLong: boolean;
}

// Anything the user typed or pasted becomes ONE visible line: line breaks and every other white space become one
// space, invisible and bidi-control characters are removed, compatibility forms are folded (a full-width
// semicolon becomes a semicolon, which the grammar then refuses), and the result is trimmed. The shared
// sanitiser does the stripping so this terminal and the market-text renderer follow one rule.
export function normalizeLine(raw: unknown): NormalizedLine {
  const text = typeof raw === "string" ? raw : "";
  const flattened = /[\r\n\v\f\u0085\u2028\u2029]/.test(text);
  const cleaned = sanitizeUntrusted(text, { maxChars: HARD_MAX_CHARS });
  const strippedInvisible = cleaned.flags.some((flag) => flag === "had-bidi-controls" || flag === "had-tag-chars" || flag === "had-invisible-chars" || flag === "had-control-chars");
  const line = cleaned.text.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return { line, flattened, strippedInvisible, tooLong: cleaned.truncated || line.length > MAX_LINE_CHARS };
}

// ---- commands -------------------------------------------------------------------------------------------------------

export const COMMAND_NAMES = ["help", "status", "markets", "market", "book", "positions", "wallet", "signals", "audit", "clear"] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export type BookSide = "yes" | "no" | "both";

export type Command =
  | { readonly name: "help"; readonly topic: CommandName | null }
  | { readonly name: "status" }
  | { readonly name: "markets"; readonly query: string }
  | { readonly name: "market"; readonly id: string }
  | { readonly name: "book"; readonly id: string; readonly side: BookSide }
  | { readonly name: "positions"; readonly address: string | null }
  | { readonly name: "wallet" }
  | { readonly name: "signals" }
  | { readonly name: "audit"; readonly rows: number }
  | { readonly name: "clear" };

export interface CommandHelp {
  readonly usage: string;
  readonly summary: string;
  // What answers it, in words: "the daemon's xo_search tool" or "this page only".
  readonly source: string;
}

export const COMMAND_HELP: Readonly<Record<CommandName, CommandHelp>> = Object.freeze({
  help: { usage: "help [command]", summary: "List the commands, or explain one.", source: "this page only" },
  status: { usage: "status", summary: "Posture, kill switch, write flags, tripwires, upstream health and which capabilities are proven.", source: "the daemon's status route" },
  markets: { usage: "markets <text>", summary: "Search XO markets by title (active markets, first page).", source: "the daemon's xo_search tool" },
  market: { usage: "market <market id>", summary: "One XO market: rules, tradability, book-derived quote and fee ceiling. The id is 0x plus 64 hex digits.", source: "the daemon's xo_get_market tool" },
  book: { usage: "book <market id> [yes|no]", summary: "The XO order book for one or both outcomes of a market (top levels).", source: "the daemon's xo_get_market and xo_orderbook tools" },
  positions: { usage: "positions [XO account address]", summary: "Outcome-share positions held by an XO account. Without an address, the one derived from your saved addresses.", source: "the daemon's xo_positions tool" },
  wallet: { usage: "wallet", summary: "Your saved addresses and the XO account each owner derives to. Nothing is looked up.", source: "this browser's saved addresses" },
  signals: { usage: "signals", summary: "Where Quotient signals live. This terminal never makes a paid call.", source: "this page only" },
  audit: { usage: `audit [rows 1 to ${String(AUDIT_MAX_ROWS)}]`, summary: "The latest audit entries the observer pane has received.", source: "the daemon's event stream" },
  clear: { usage: "clear", summary: "Clear this transcript. Nothing else changes.", source: "this page only" },
});

// Verbs from the full design that this terminal must never act on. They are named so the refusal can say why
// instead of "unknown command": a write-class verb is refused before anything is asked of anyone.
const WRITE_VERBS: ReadonlySet<string> = new Set([
  "buy", "sell", "redeem", "enable-trading", "revoke-trading", "connect", "fund", "withdraw", "create", "cancel",
  "submit", "sign", "approve", "deploy", "place", "respond", "transfer", "send", "swap", "pay",
]);
// Session and configuration verbs: the read terminal sets no flag, cap, window or kill.
const SESSION_VERBS: ReadonlySet<string> = new Set(["arm", "disarm", "kill", "export-audit"]);
const SETTER_VERBS: ReadonlySet<string> = new Set(["set", "unset", "config", "export", "flag", "flags", "cap", "caps", "env", "enable", "disable", "grant", "token", "pair"]);
// Verbs for scripting or reaching a tool by name. The grammar has no such feature; the words are named so the
// answer is "there is no raw-call path" and not a shrug.
const RAW_VERBS: ReadonlySet<string> = new Set(["call", "raw", "run", "exec", "tool", "rpc", "curl", "fetch", "sh", "bash", "source", "echo", "alias", "let", "var"]);
// Read commands of the design that this release does not offer.
const LATER_VERBS: ReadonlySet<string> = new Set(["orders", "order", "account", "prices", "price", "compare", "edge"]);

export type RefusalKind = "empty" | "too_long" | "unsupported_syntax" | "unknown_command" | "write_verb" | "session_verb" | "setter_verb" | "raw_verb" | "later_verb" | "bad_arguments";

export interface ParseRefusal {
  readonly ok: false;
  readonly kind: RefusalKind;
  readonly message: string;
  readonly usage?: string;
}
export interface ParseSuccess {
  readonly ok: true;
  readonly command: Command;
}
export type ParseResult = ParseSuccess | ParseRefusal;

// Characters with a meaning in a shell or a scripting language. This terminal has none of those meanings, so a line
// that uses one is refused whole: "markets x; kill" is an error, not a search for the text "x; kill".
const SYNTAX_CHARACTERS = /[|;&$`<>\\{}]/;
const HEX_MARKET_ID = /^0x[0-9a-fA-F]{64}$/;

function refuse(kind: RefusalKind, message: string, usage?: string): ParseRefusal {
  return usage === undefined ? { ok: false, kind, message } : { ok: false, kind, message, usage };
}

function isCommandName(word: string): word is CommandName {
  return (COMMAND_NAMES as readonly string[]).includes(word);
}

function usageOf(name: CommandName): string {
  return COMMAND_HELP[name].usage;
}

export function parseLine(raw: unknown): ParseResult {
  const normalized = normalizeLine(raw);
  if (normalized.tooLong) return refuse("too_long", `That line is longer than ${String(MAX_LINE_CHARS)} characters. Nothing was run.`);
  const line = normalized.line;
  if (line === "") return refuse("empty", "Type a command. Try: help");
  if (SYNTAX_CHARACTERS.test(line)) {
    return refuse("unsupported_syntax", "This terminal has no pipes, variables, redirects, scripts or JSON, so the characters | ; & $ ` < > \\ { } are not accepted. Nothing was run.");
  }
  const words = line.split(" ");
  const verb = (words[0] ?? "").toLowerCase();
  const args = words.slice(1);

  if (!/^[a-z][a-z-]{0,23}$/.test(verb)) return refuse("unknown_command", "That is not a command of this terminal. Try: help");
  if (WRITE_VERBS.has(verb)) {
    return refuse("write_verb", `${verb} is a write-class action. This terminal only reads: it never prepares, signs, sends, funds or cancels. If your agent prepares something, it appears in the observer pane and on the signing screen for you to review.`);
  }
  if (SESSION_VERBS.has(verb)) {
    return refuse("session_verb", `${verb} is a session control and is not part of the read terminal. To stop all writes at once, restart the daemon with XO_KILL_SWITCH=1 or send it SIGUSR2.`);
  }
  if (SETTER_VERBS.has(verb)) {
    return refuse("setter_verb", `${verb} would change a flag, a cap or a setting. Flags and caps are shown, never set, by this page. Use status to see them.`);
  }
  if (RAW_VERBS.has(verb)) {
    return refuse("raw_verb", `${verb}: this terminal has no scripting and no raw-call path. It can only run the commands in help.`);
  }
  if (LATER_VERBS.has(verb)) {
    return refuse("later_verb", `${verb} is planned but not in this release. Use markets, market, book, positions or wallet.`);
  }
  if (!isCommandName(verb)) return refuse("unknown_command", `${verb} is not a command of this terminal. Try: help`);

  if (args.some((word) => word.startsWith("-"))) {
    return refuse("bad_arguments", `${verb} takes no options (words that start with a dash). Usage: ${usageOf(verb)}`, usageOf(verb));
  }

  switch (verb) {
    case "help": {
      if (args.length === 0) return { ok: true, command: { name: "help", topic: null } };
      const topic = args.length === 1 ? (args[0] ?? "").toLowerCase() : "";
      if (isCommandName(topic)) return { ok: true, command: { name: "help", topic } };
      return refuse("bad_arguments", `help takes one command name. Usage: ${usageOf("help")}`, usageOf("help"));
    }
    case "status":
    case "wallet":
    case "signals":
    case "clear": {
      if (args.length > 0) return refuse("bad_arguments", `${verb} takes no arguments. Usage: ${usageOf(verb)}`, usageOf(verb));
      return { ok: true, command: { name: verb } };
    }
    case "audit": {
      if (args.length === 0) return { ok: true, command: { name: "audit", rows: AUDIT_DEFAULT_ROWS } };
      const text = args[0] ?? "";
      if (args.length !== 1 || !/^[0-9]{1,3}$/.test(text)) return refuse("bad_arguments", `audit takes one whole number. Usage: ${usageOf("audit")}`, usageOf("audit"));
      const rows = Number(text);
      if (rows < 1 || rows > AUDIT_MAX_ROWS) return refuse("bad_arguments", `audit shows 1 to ${String(AUDIT_MAX_ROWS)} rows. Usage: ${usageOf("audit")}`, usageOf("audit"));
      return { ok: true, command: { name: "audit", rows } };
    }
    case "markets": {
      const query = args.join(" ");
      if (query === "") return refuse("bad_arguments", `markets needs some text to look for in titles. Usage: ${usageOf("markets")}`, usageOf("markets"));
      if (query.length > MARKETS_QUERY_MAX_CHARS) return refuse("bad_arguments", `The search text is longer than ${String(MARKETS_QUERY_MAX_CHARS)} characters.`, usageOf("markets"));
      return { ok: true, command: { name: "markets", query } };
    }
    case "market": {
      const id = args[0] ?? "";
      if (args.length !== 1 || !HEX_MARKET_ID.test(id)) return refuse("bad_arguments", `market needs one market id: 0x followed by 64 hex digits (from markets). Usage: ${usageOf("market")}`, usageOf("market"));
      return { ok: true, command: { name: "market", id: id.toLowerCase() } };
    }
    case "book": {
      const id = args[0] ?? "";
      if (args.length < 1 || args.length > 2 || !HEX_MARKET_ID.test(id)) return refuse("bad_arguments", `book needs a market id (0x plus 64 hex digits) and optionally yes or no. Usage: ${usageOf("book")}`, usageOf("book"));
      const side = (args[1] ?? "both").toLowerCase();
      if (side !== "yes" && side !== "no" && side !== "both") return refuse("bad_arguments", `The outcome is yes or no. Usage: ${usageOf("book")}`, usageOf("book"));
      // "both" is the default and is not a word the user can type: only yes, no or nothing.
      if (args.length === 2 && side === "both") return refuse("bad_arguments", `The outcome is yes or no. Usage: ${usageOf("book")}`, usageOf("book"));
      return { ok: true, command: { name: "book", id: id.toLowerCase(), side } };
    }
    case "positions": {
      if (args.length === 0) return { ok: true, command: { name: "positions", address: null } };
      if (args.length !== 1) return refuse("bad_arguments", `positions takes at most one address. Usage: ${usageOf("positions")}`, usageOf("positions"));
      const checked = checkEvmAddress(args[0], [], { role: "wallet" });
      if (!checked.ok) return refuse("bad_arguments", `That address was not accepted: ${checked.message}`, usageOf("positions"));
      return { ok: true, command: { name: "positions", address: checked.address.toLowerCase() } };
    }
  }
}

// The parsed command as fixed words with the typed values in place: what the transcript prints and the audit
// event names ("the parsed command, not the raw line").
export function describeCommand(command: Command): string {
  switch (command.name) {
    case "help":
      return command.topic === null ? "help" : `help ${command.topic}`;
    case "markets":
      return `markets ${command.query}`;
    case "market":
      return `market ${command.id}`;
    case "book":
      return command.side === "both" ? `book ${command.id}` : `book ${command.id} ${command.side}`;
    case "positions":
      return command.address === null ? "positions" : `positions ${command.address}`;
    case "audit":
      return `audit ${String(command.rows)}`;
    default:
      return command.name;
  }
}
