import { describe, expect, it } from "vitest";

import { COMMAND_NAMES, MAX_LINE_CHARS, describeCommand, normalizeLine, parseLine, type Command } from "./grammar";

const ID = `0x${"ab".repeat(32)}`;
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// The same address with the case of its first letter flipped: valid hex, wrong EIP-55 checksum.
function withBadChecksum(address: string): string {
  const index = address.search(/[a-fA-F]/);
  const letter = address.charAt(index);
  return `${address.slice(0, index)}${letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase()}${address.slice(index + 1)}`;
}

function ok(line: string): Command {
  const result = parseLine(line);
  if (!result.ok) throw new Error(`expected "${line}" to parse, got ${result.kind}: ${result.message}`);
  return result.command;
}

function refused(line: unknown): string {
  const result = parseLine(line);
  if (result.ok) throw new Error(`expected "${String(line)}" to be refused, got ${JSON.stringify(result.command)}`);
  return result.kind;
}

describe("the closed command table", () => {
  it("parses every read command with its arguments", () => {
    expect(ok("help")).toEqual({ name: "help", topic: null });
    expect(ok("help book")).toEqual({ name: "help", topic: "book" });
    expect(ok("status")).toEqual({ name: "status" });
    expect(ok("markets french election")).toEqual({ name: "markets", query: "french election" });
    expect(ok(`market ${ID}`)).toEqual({ name: "market", id: ID });
    expect(ok(`book ${ID}`)).toEqual({ name: "book", id: ID, side: "both" });
    expect(ok(`book ${ID} yes`)).toEqual({ name: "book", id: ID, side: "yes" });
    expect(ok(`book ${ID} NO`)).toEqual({ name: "book", id: ID, side: "no" });
    expect(ok("positions")).toEqual({ name: "positions", address: null });
    expect(ok("wallet")).toEqual({ name: "wallet" });
    expect(ok("signals")).toEqual({ name: "signals" });
    expect(ok("audit")).toEqual({ name: "audit", rows: 10 });
    expect(ok("audit 25")).toEqual({ name: "audit", rows: 25 });
    expect(ok("clear")).toEqual({ name: "clear" });
  });

  it("lower-cases the command word and the market id, and collapses extra spaces", () => {
    expect(ok("   STATUS   ")).toEqual({ name: "status" });
    expect(ok(`MARKET 0x${"AB".repeat(32)}`)).toEqual({ name: "market", id: ID });
    expect(ok("markets   a    b")).toEqual({ name: "markets", query: "a b" });
  });

  it("round-trips every command through describeCommand", () => {
    const samples = ["help", "help market", "status", "markets bond", `market ${ID}`, `book ${ID}`, `book ${ID} yes`, "positions", `positions ${OWNER.toLowerCase()}`, "wallet", "signals", "audit 7", "clear"];
    for (const line of samples) {
      const command = ok(line);
      expect(ok(describeCommand(command))).toEqual(command);
    }
  });

  it("rejects bad arguments with the usage line", () => {
    expect(refused("status now")).toBe("bad_arguments");
    expect(refused("market")).toBe("bad_arguments");
    expect(refused(`market ${ID} yes`)).toBe("bad_arguments");
    expect(refused("market 0x1234")).toBe("bad_arguments");
    expect(refused(`market 0x${"g".repeat(64)}`)).toBe("bad_arguments");
    expect(refused(`book ${ID} maybe`)).toBe("bad_arguments");
    expect(refused(`book ${ID} both`)).toBe("bad_arguments");
    expect(refused(`book ${ID} yes no`)).toBe("bad_arguments");
    expect(refused("markets")).toBe("bad_arguments");
    expect(refused("audit 0")).toBe("bad_arguments");
    expect(refused("audit 51")).toBe("bad_arguments");
    expect(refused("audit ten")).toBe("bad_arguments");
    expect(refused("help nothing")).toBe("bad_arguments");
    expect(refused("positions a b")).toBe("bad_arguments");
    const result = parseLine("market");
    expect(!result.ok && result.usage).toBe("market <market id>");
  });

  it("checks a typed address with the same rules as the wallet screen", () => {
    expect(ok(`positions ${OWNER}`)).toEqual({ name: "positions", address: OWNER.toLowerCase() });
    // A wrong checksum, a name, a zero address and a protocol contract are all refused, never queried.
    expect(refused(`positions ${withBadChecksum(OWNER)}`)).toBe("bad_arguments");
    expect(refused("positions vitalik.eth")).toBe("bad_arguments");
    expect(refused(`positions 0x${"0".repeat(40)}`)).toBe("bad_arguments");
    expect(refused("positions 0x1234")).toBe("bad_arguments");
  });

  it("refuses options, which no command takes", () => {
    expect(refused("markets --all bond")).toBe("bad_arguments");
    expect(refused("status -v")).toBe("bad_arguments");
  });

  it("refuses an empty line and a line that is too long", () => {
    expect(refused("")).toBe("empty");
    expect(refused("   \n\t ")).toBe("empty");
    expect(refused(`markets ${"x".repeat(MAX_LINE_CHARS)}`)).toBe("too_long");
    expect(refused(`markets ${"x".repeat(101)}`)).toBe("bad_arguments");
  });
});

describe("M5-1: no flag or cap setter and no raw-call path", () => {
  const WRITE_AND_SETTER_LINES = [
    "buy 5 yes", "sell 5 no", "redeem", "enable-trading", "revoke-trading", "connect", "fund 10", "withdraw 10", "create market", "cancel 0x1",
    "submit abc", "sign abc", "approve", "deploy", "place seed", "respond update", "transfer 5", "send 5", "swap", "pay",
    "arm 5", "disarm", "kill", "export-audit",
    "set ENABLE_TRADING on", "set cap 1000", "unset KILL", "config", "flag ENABLE_TRADING=1", "flags", "caps", "cap 5", "export", "enable trading", "disable kill", "grant submit", "token", "pair",
    "call xo_search", "call xo_prepare_order {}", "raw 0x1234", "run script", "exec ls", "eval 1+1", "tool xo_submit_order", "rpc eth_call", "curl x", "fetch x", "sh", "bash -c x", "echo hi", "alias a=b", "let x=1",
    "orders", "order 0x1", "account", "prices", "compare", "edge",
  ];

  it("refuses every write, session, setter, scripting and later verb, naming the reason", () => {
    for (const line of WRITE_AND_SETTER_LINES) {
      const result = parseLine(line);
      expect(result.ok, line).toBe(false);
      if (!result.ok) {
        // A refusal says why, in words of this app. It never echoes the input as an instruction.
        expect(result.message.length, line).toBeGreaterThan(10);
        expect(["write_verb", "session_verb", "setter_verb", "raw_verb", "later_verb", "unsupported_syntax", "bad_arguments", "unknown_command"]).toContain(result.kind);
      }
    }
  });

  it("classes each family of verb as such", () => {
    expect(refused("buy 1")).toBe("write_verb");
    expect(refused("kill")).toBe("session_verb");
    expect(refused("arm")).toBe("session_verb");
    expect(refused("set a b")).toBe("setter_verb");
    expect(refused("flags")).toBe("setter_verb");
    expect(refused("call tool")).toBe("raw_verb");
    expect(refused("orders")).toBe("later_verb");
    expect(refused("frobnicate")).toBe("unknown_command");
  });

  it("refuses JSON, pipes, separators, substitution, redirects and escapes as a whole line", () => {
    const lines = [
      'markets x; kill', "markets x && kill", "markets a | b", "markets $(whoami)", "markets `whoami`", "markets x > out", "markets x < in", 'markets {"tool":"xo_submit_order"}',
      "markets a\\nb", "status; status", "markets ${HOME}", "market ${ID}",
    ];
    for (const line of lines) expect(refused(line), line).toBe("unsupported_syntax");
  });

  it("only ever produces a command from the closed list", () => {
    // A seeded fuzz over words, symbols and separators: whatever comes out, an accepted line is a listed command.
    let seed = 20261019;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    const words = [...COMMAND_NAMES, "buy", "kill", "set", "yes", "no", "0x12", ID, OWNER, "xo_search", "ENABLE_TRADING", "1", "-x", ";", "|", "{", "$", "a", "bond"];
    let accepted = 0;
    for (let round = 0; round < 3000; round += 1) {
      const length = 1 + Math.floor(next() * 5);
      const line = Array.from({ length }, () => words[Math.floor(next() * words.length)] ?? "").join(next() < 0.1 ? "\n" : " ");
      const result = parseLine(line);
      if (result.ok) {
        accepted += 1;
        expect(COMMAND_NAMES as readonly string[]).toContain(result.command.name);
      }
    }
    expect(accepted).toBeGreaterThan(50);
  });
});

describe("M5-2: a pasted newline is flattened and never becomes a second command", () => {
  it("turns line breaks and separators into spaces", () => {
    const flat = normalizeLine("status\nkill\r\narm x y\u0085z");
    expect(flat.line).toBe("status kill arm x y z");
    expect(flat.flattened).toBe(true);
  });

  it("runs the flattened text as ONE line: a second command word is an argument, not a command", () => {
    // "help\nkill" is "help kill": help with an unknown topic, refused whole.
    expect(refused("help\nkill")).toBe("bad_arguments");
    // "status\nstatus" is "status status": refused for its extra argument, not run twice.
    expect(refused("status\nstatus")).toBe("bad_arguments");
    // A search whose text contains a second command is a search for that text.
    expect(ok("markets bond\nkill")).toEqual({ name: "markets", query: "bond kill" });
    expect(ok("markets bond\r\nset cap 100")).toEqual({ name: "markets", query: "bond set cap 100" });
  });

  it("reports that it flattened, and that a trailing line break was only whitespace", () => {
    expect(normalizeLine("status\n").flattened).toBe(true);
    expect(normalizeLine("status\n").line).toBe("status");
    expect(normalizeLine("status").flattened).toBe(false);
  });

  it("removes invisible and direction-changing characters and says so", () => {
    const hostile = normalizeLine("sta​tus‮");
    expect(hostile.line).toBe("status");
    expect(hostile.strippedInvisible).toBe(true);
    expect(ok("sta​tus")).toEqual({ name: "status" });
  });

  it("folds compatibility characters, so a full-width separator is still a refused separator", () => {
    expect(refused("markets x； kill")).toBe("unsupported_syntax");
    expect(refused("markets x｜ kill")).toBe("unsupported_syntax");
  });

  it("treats non-string input as an empty line", () => {
    expect(refused(undefined)).toBe("empty");
    expect(refused(42)).toBe("empty");
  });
});
