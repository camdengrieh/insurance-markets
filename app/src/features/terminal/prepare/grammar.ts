// The prepare-command grammar of the terminal (docs/dapp-design.md 5.2 "Prepare", acceptance M5-1 and M5-2).
//
// A line that starts with one of SIX verbs is a PREPARE command: order, cancel, redeem, fund, deploy, revoke. All
// of them end in a checked, prepared item (or, for cancel, a hand-off text) that the person reviews on the Signature
// Card. Nothing in this language signs, sends, arms, kills, sets a flag or a cap, or names a tool or a raw call:
// those words are refused by name, and any other word falls through to the read grammar, which refuses it too.
//
// The language is closed. There is no pipe, variable, redirect, JSON, script or "call this tool" form; a line with
// any character that has a meaning in a shell is refused whole, and a pasted newline was already flattened by
// normalizeLine (so a paste can never become a second command). The parser decides WHAT is asked; run.ts decides
// how, after the gate and the re-typing rule.
//
// Pure code: no DOM, no network, no clock.

import { checkEvmAddress } from "../../../core/address";
import { parseLine, normalizeLine, MAX_LINE_CHARS, type Command as ReadCommand, type RefusalKind } from "../grammar";

export const PREPARE_VERBS = ["order", "cancel", "redeem", "fund", "deploy", "revoke"] as const;
export type PrepareVerb = (typeof PREPARE_VERBS)[number];

// The plugin's own ceiling for one redeem operation. A line is at most 400 characters (the read grammar's limit, which
// normalizeLine applies), and a market id is 66, so in practice a line holds five; the Trade screen takes more.
export const MAX_REDEEM_MARKETS = 50;
export const MAX_REDEEM_MARKETS_PER_LINE = 5;

export type PrepareTif = "GTD" | "FOK" | "FAK";

export type Allowance = { readonly kind: "unlimited" } | { readonly kind: "capped"; readonly usd: string };

interface Owned {
  // The owner address the person typed after `from`, or null (then the one saved owner is used).
  readonly from: string | null;
}

export type PrepareCommand =
  | (Owned & {
      readonly name: "order";
      readonly side: "BUY" | "SELL";
      readonly marketId: string;
      readonly outcome: "yes" | "no";
      readonly shares: string;
      readonly price: string;
      readonly tif: PrepareTif;
      // "" = the relay's default life; otherwise whole seconds as typed (range checked by the ticket).
      readonly ttlS: string;
      readonly postOnly: boolean;
    })
  | (Owned & { readonly name: "cancel"; readonly orderHash: string })
  | (Owned & { readonly name: "redeem"; readonly marketIds: readonly string[] })
  | (Owned & { readonly name: "fund"; readonly amount: string })
  | (Owned & { readonly name: "deploy"; readonly allowance: Allowance })
  | (Owned & { readonly name: "revoke" });

export interface PrepareHelp {
  readonly usage: string;
  readonly summary: string;
}

export const PREPARE_HELP: Readonly<Record<PrepareVerb, PrepareHelp>> = Object.freeze({
  order: {
    usage: "order <buy|sell> <market id> <yes|no> <shares> <price> [gtd|fok|fak] [ttl <seconds>] [post-only] [from <owner address>]",
    summary: "Prepare one order to be signed. The price is a decimal from 0.001 to 0.999. A BUY counts its principal plus a 10 percent fee bound against the advisory caps.",
  },
  cancel: {
    usage: "cancel <order hash> [from <owner address>]",
    summary: "Show the exact call your agent makes to cancel one of your open orders. This terminal sends nothing.",
  },
  redeem: {
    usage: `redeem <market id> [<market id> ...up to ${String(MAX_REDEEM_MARKETS_PER_LINE)} on a line] [from <owner address>]`,
    summary: "Prepare redeeming resolved markets for USDC.e.",
  },
  fund: {
    usage: "fund <USDC amount> [from <owner address>]",
    summary: "Prepare the next Base step that moves USDC to the XO account derived from the owner. The destination is never typed.",
  },
  deploy: {
    usage: "deploy <unlimited | capped <USDC.e amount>> [from <owner address>]",
    summary: "Prepare deploying the XO account (if needed) and enabling trading. You must choose the allowance: XO's unlimited approval or a capped one.",
  },
  revoke: {
    usage: "revoke [from <owner address>]",
    summary: "Prepare revoking trading: the exchange's allowance back to 0.",
  },
});

// ---- refusals -------------------------------------------------------------------------------------------------------

export type PrepareRefusalKind = RefusalKind | "not_offered";

export interface PrepareRefusal {
  readonly ok: false;
  readonly kind: PrepareRefusalKind;
  readonly message: string;
  readonly usage?: string;
}

function refuse(kind: PrepareRefusalKind, message: string, usage?: string): PrepareRefusal {
  return usage === undefined ? { ok: false, kind, message } : { ok: false, kind, message, usage };
}

// Verbs of the full design that a person might type here and that this terminal must never act on. Each gets its own
// reason so the answer is "not offered, and why", not a shrug.
const NOT_OFFERED: Readonly<Record<string, string>> = Object.freeze({
  buy: "There is no buy command. Use: order buy <market id> <yes|no> <shares> <price>",
  sell: "There is no sell command. Use: order sell <market id> <yes|no> <shares> <price>",
  submit: "This terminal never sends anything. Your agent sends a prepared item after you approve it in PayBox, with a submit-scope token and an open ARM window.",
  sign: "This terminal never signs. You approve in PayBox; your agent holds the signature and sends it.",
  approve: "This terminal never signs or approves. You approve in PayBox.",
  withdraw: "Withdrawals are not offered here. If your agent prepares one, the Signature Card shows it.",
  create: "Creating markets is not offered here.",
  transfer: "There is no transfer command. fund prepares the one fixed Base route to your derived XO account.",
  send: "This terminal never sends anything.",
  swap: "There is no swap command.",
  pay: "There is no pay command, and this terminal never pays.",
  place: "Use: order <buy|sell> <market id> <yes|no> <shares> <price>",
  respond: "Not offered here.",
  connect: "Not offered here. Your agent runs the login step.",
  "enable-trading": "Use: deploy <unlimited | capped <USDC.e amount>>",
  "revoke-trading": "Use: revoke",
});

// Characters with a meaning in a shell or a scripting language. This language has none of those meanings, so a line
// that uses one is refused whole.
const SYNTAX_CHARACTERS = /[|;&$`<>\\{}]/;

const HEX_32 = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,29})(\.[0-9]{1,18})?$/;
const SECONDS = /^[1-9][0-9]{0,5}$/;
const ADDRESS_SHAPE = /^0x[0-9a-fA-F]{40}$/;

// ---- the parser -------------------------------------------------------------------------------------------------------

export type PrepareParse = { readonly ok: true; readonly command: PrepareCommand } | PrepareRefusal;

export function isPrepareVerb(word: string): word is PrepareVerb {
  return (PREPARE_VERBS as readonly string[]).includes(word);
}

function bad(verb: PrepareVerb, what: string): PrepareRefusal {
  const usage = PREPARE_HELP[verb].usage;
  return refuse("bad_arguments", `${what} Usage: ${usage}`, usage);
}

// Splits a trailing `from <address>` off the arguments.
function takeFrom(verb: PrepareVerb, args: readonly string[]): { readonly ok: true; readonly rest: readonly string[]; readonly from: string | null } | PrepareRefusal {
  const index = args.findIndex((word) => word.toLowerCase() === "from");
  if (index === -1) return { ok: true, rest: args, from: null };
  if (index !== args.length - 2) return bad(verb, "from takes exactly one owner address and comes last.");
  const checked = checkEvmAddress(args[index + 1], [], { role: "wallet" });
  if (!checked.ok) return bad(verb, `That owner address was not accepted: ${checked.message}`);
  if (!ADDRESS_SHAPE.test(checked.address)) return bad(verb, "The owner must be a plain 0x address.");
  return { ok: true, rest: args.slice(0, index), from: checked.address };
}

export function parsePrepareWords(verb: PrepareVerb, rawArgs: readonly string[]): PrepareParse {
  if (rawArgs.some((word) => word.startsWith("-"))) return bad(verb, `${verb} takes no options (words that start with a dash).`);
  const split = takeFrom(verb, rawArgs);
  if (!("rest" in split)) return split;
  const { rest, from } = split;
  switch (verb) {
    case "revoke": {
      if (rest.length > 0) return bad(verb, "revoke takes no arguments except from.");
      return { ok: true, command: { name: "revoke", from } };
    }
    case "fund": {
      const amount = rest[0] ?? "";
      if (rest.length !== 1 || !DECIMAL.test(amount)) return bad(verb, "fund takes one plain USDC amount, such as 1 or 2.5.");
      return { ok: true, command: { name: "fund", amount, from } };
    }
    case "cancel": {
      const hash = rest[0] ?? "";
      if (rest.length !== 1 || !HEX_32.test(hash)) return bad(verb, "cancel takes one order hash: 0x plus 64 hex digits.");
      return { ok: true, command: { name: "cancel", orderHash: hash.toLowerCase(), from } };
    }
    case "redeem": {
      if (rest.length === 0 || rest.length > MAX_REDEEM_MARKETS) return bad(verb, `redeem takes 1 to ${String(MAX_REDEEM_MARKETS)} market ids.`);
      const ids: string[] = [];
      for (const word of rest) {
        if (!HEX_32.test(word)) return bad(verb, "Each market id is 0x plus 64 hex digits.");
        const id = word.toLowerCase();
        if (ids.includes(id)) return bad(verb, "A market id is listed twice.");
        ids.push(id);
      }
      return { ok: true, command: { name: "redeem", marketIds: ids, from } };
    }
    case "deploy": {
      const choice = (rest[0] ?? "").toLowerCase();
      if (choice === "unlimited") {
        if (rest.length !== 1) return bad(verb, "unlimited takes no amount.");
        return { ok: true, command: { name: "deploy", allowance: { kind: "unlimited" }, from } };
      }
      if (choice === "capped") {
        const usd = rest[1] ?? "";
        if (rest.length !== 2 || !DECIMAL.test(usd) || !/[1-9]/.test(usd)) return bad(verb, "capped takes one USDC.e amount above zero.");
        return { ok: true, command: { name: "deploy", allowance: { kind: "capped", usd }, from } };
      }
      return bad(verb, "Choose the allowance on purpose: unlimited, or capped with an amount.");
    }
    case "order": {
      const [sideWord, market, outcomeWord, shares, price, ...options] = rest;
      const side = (sideWord ?? "").toLowerCase();
      if (side !== "buy" && side !== "sell") return bad(verb, "Start with buy or sell.");
      if (market === undefined || !HEX_32.test(market)) return bad(verb, "The market id is 0x plus 64 hex digits.");
      const outcome = (outcomeWord ?? "").toLowerCase();
      if (outcome !== "yes" && outcome !== "no") return bad(verb, "The outcome is yes or no.");
      if (shares === undefined || !DECIMAL.test(shares)) return bad(verb, "Shares are a plain decimal, such as 10 or 2.5.");
      if (price === undefined || !DECIMAL.test(price)) return bad(verb, "The price is a plain decimal, such as 0.4.");
      let tif: PrepareTif | null = null;
      let ttlS = "";
      let postOnly = false;
      for (let index = 0; index < options.length; index += 1) {
        const word = (options[index] ?? "").toLowerCase();
        if (word === "gtd" || word === "fok" || word === "fak") {
          if (tif !== null) return bad(verb, "Give the time-in-force once.");
          tif = word === "gtd" ? "GTD" : word === "fok" ? "FOK" : "FAK";
        } else if (word === "post-only" || word === "postonly") {
          if (postOnly) return bad(verb, "post-only is given once.");
          postOnly = true;
        } else if (word === "ttl") {
          const seconds = options[index + 1] ?? "";
          if (ttlS !== "" || !SECONDS.test(seconds)) return bad(verb, "ttl takes whole seconds, once.");
          ttlS = seconds;
          index += 1;
        } else {
          return bad(verb, "An option here is not one of gtd, fok, fak, ttl <seconds> or post-only.");
        }
      }
      return {
        ok: true,
        command: {
          name: "order",
          side: side === "buy" ? "BUY" : "SELL",
          marketId: market.toLowerCase(),
          outcome,
          shares,
          price,
          tif: tif ?? "GTD",
          ttlS,
          postOnly,
          from,
        },
      };
    }
  }
}

// ---- routing ----------------------------------------------------------------------------------------------------------

export type RouteResult =
  | { readonly ok: true; readonly route: "prepare"; readonly command: PrepareCommand }
  | { readonly ok: true; readonly route: "read"; readonly command: ReadCommand }
  | PrepareRefusal;

// One entry point for a line in the prepare console. A prepare verb is parsed here; a read verb is reported as a
// read command (the read terminal runs it); everything else (flags, caps, arm, kill, call, raw, scripting) is
// refused by the read grammar, which names it and says why.
export function routeLine(raw: unknown): RouteResult {
  const normalized = normalizeLine(raw);
  if (normalized.tooLong) return refuse("too_long", `That line is longer than ${String(MAX_LINE_CHARS)} characters. Nothing was run.`);
  if (normalized.line === "") return refuse("empty", "Type a command. Try: help");
  if (SYNTAX_CHARACTERS.test(normalized.line)) {
    return refuse("unsupported_syntax", "This terminal has no pipes, variables, redirects, scripts or JSON, so the characters | ; & $ ` < > \\ { } are not accepted. Nothing was run.");
  }
  const words = normalized.line.split(" ");
  const verb = (words[0] ?? "").toLowerCase();
  if (isPrepareVerb(verb)) {
    const parsed = parsePrepareWords(verb, words.slice(1));
    return parsed.ok ? { ok: true, route: "prepare", command: parsed.command } : parsed;
  }
  if (Object.hasOwn(NOT_OFFERED, verb)) return refuse("not_offered", NOT_OFFERED[verb] ?? "Not offered here.");
  const read = parseLine(normalized.line);
  return read.ok ? { ok: true, route: "read", command: read.command } : read;
}

// The parsed command as fixed words with the typed values in place: what the transcript prints.
export function describePrepare(command: PrepareCommand): string {
  const tail = command.from === null ? "" : ` from ${command.from}`;
  switch (command.name) {
    case "order":
      return `order ${command.side.toLowerCase()} ${command.marketId} ${command.outcome} ${command.shares} ${command.price} ${command.tif.toLowerCase()}${command.ttlS === "" ? "" : ` ttl ${command.ttlS}`}${command.postOnly ? " post-only" : ""}${tail}`;
    case "cancel":
      return `cancel ${command.orderHash}${tail}`;
    case "redeem":
      return `redeem ${command.marketIds.join(" ")}${tail}`;
    case "fund":
      return `fund ${command.amount}${tail}`;
    case "deploy":
      return `deploy ${command.allowance.kind === "unlimited" ? "unlimited" : `capped ${command.allowance.usd}`}${tail}`;
    case "revoke":
      return `revoke${tail}`;
  }
}
