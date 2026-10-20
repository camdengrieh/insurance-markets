import { describe, expect, it } from "vitest";

import { COMMAND_NAMES } from "../grammar";
import { MAX_REDEEM_MARKETS, MAX_REDEEM_MARKETS_PER_LINE, PREPARE_HELP, PREPARE_VERBS, describePrepare, routeLine, type PrepareCommand } from "./grammar";

const MARKET = `0x${"ab".repeat(32)}`;
const OTHER = `0x${"cd".repeat(32)}`;
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

function prepared(line: string): PrepareCommand {
  const result = routeLine(line);
  if (!result.ok || result.route !== "prepare") throw new Error(`not a prepare command: ${line}`);
  return result.command;
}

function refusedKind(line: string): string {
  const result = routeLine(line);
  if (result.ok) throw new Error(`should have been refused: ${line}`);
  return result.kind;
}

describe("the closed list of prepare verbs", () => {
  it("is exactly order, cancel, redeem, fund, deploy, revoke, each with help", () => {
    expect([...PREPARE_VERBS]).toEqual(["order", "cancel", "redeem", "fund", "deploy", "revoke"]);
    for (const verb of PREPARE_VERBS) expect(PREPARE_HELP[verb].usage.startsWith(verb)).toBe(true);
  });

  it("does not overlap with the read terminal's commands", () => {
    for (const verb of PREPARE_VERBS) expect(COMMAND_NAMES as readonly string[]).not.toContain(verb);
  });
});

describe("parsing", () => {
  it("parses an order with every option and prints it back", () => {
    const command = prepared(`ORDER Buy ${MARKET.toUpperCase().replace("0X", "0x")} YES 10 0.4 fok ttl 60 post-only from ${OWNER}`);
    expect(command).toEqual({ name: "order", side: "BUY", marketId: MARKET, outcome: "yes", shares: "10", price: "0.4", tif: "FOK", ttlS: "60", postOnly: true, from: OWNER });
    expect(describePrepare(command)).toBe(`order buy ${MARKET} yes 10 0.4 fok ttl 60 post-only from ${OWNER}`);
  });

  it("defaults an order to GTD with the relay's default life", () => {
    expect(prepared(`order sell ${MARKET} no 5 0.62`)).toMatchObject({ side: "SELL", outcome: "no", tif: "GTD", ttlS: "", postOnly: false, from: null });
  });

  it("parses cancel, redeem, fund, deploy and revoke", () => {
    expect(prepared(`cancel ${MARKET}`)).toEqual({ name: "cancel", orderHash: MARKET, from: null });
    expect(prepared(`redeem ${MARKET} ${OTHER}`)).toEqual({ name: "redeem", marketIds: [MARKET, OTHER], from: null });
    expect(prepared("fund 2.5")).toEqual({ name: "fund", amount: "2.5", from: null });
    expect(prepared("deploy unlimited")).toEqual({ name: "deploy", allowance: { kind: "unlimited" }, from: null });
    expect(prepared("deploy capped 50")).toEqual({ name: "deploy", allowance: { kind: "capped", usd: "50" }, from: null });
    expect(prepared(`revoke from ${OWNER}`)).toEqual({ name: "revoke", from: OWNER });
  });

  it("makes the person choose the deploy allowance on purpose", () => {
    expect(refusedKind("deploy")).toBe("bad_arguments");
    expect(refusedKind("deploy 50")).toBe("bad_arguments");
    expect(refusedKind("deploy capped 0")).toBe("bad_arguments");
    expect(refusedKind("deploy capped")).toBe("bad_arguments");
    expect(refusedKind("deploy unlimited 5")).toBe("bad_arguments");
  });

  it("refuses malformed arguments whole and says the usage", () => {
    const lines = [
      `order ${MARKET} yes 10 0.4`,
      "order buy 0x1234 yes 10 0.4",
      `order buy ${MARKET} maybe 10 0.4`,
      `order buy ${MARKET} yes ten 0.4`,
      `order buy ${MARKET} yes 10 -0.4`,
      `order buy ${MARKET} yes 10 0.4 gtd fok`,
      `order buy ${MARKET} yes 10 0.4 ttl`,
      `order buy ${MARKET} yes 10 0.4 ttl 0`,
      `order buy ${MARKET} yes 10 0.4 post-only post-only`,
      `order buy ${MARKET} yes 10 0.4 market`,
      "cancel 0x12",
      "redeem",
      `redeem ${MARKET} ${MARKET}`,
      "redeem 12",
      "fund",
      "fund one",
      "fund 1 2",
      "revoke now",
      `revoke from`,
      `revoke from 0x12`,
      `revoke from ${OWNER} extra`,
    ];
    for (const line of lines) {
      const result = routeLine(line);
      expect(result.ok, line).toBe(false);
      if (!result.ok) expect(result.kind, line).toBe("bad_arguments");
    }
  });

  it("holds a redeem to what fits on one line, which is below the plugin's limit", () => {
    const many = Array.from({ length: MAX_REDEEM_MARKETS_PER_LINE + 1 }, (_, index) => `0x${index.toString(16).padStart(64, "0")}`);
    expect(MAX_REDEEM_MARKETS_PER_LINE).toBeLessThanOrEqual(MAX_REDEEM_MARKETS);
    expect(refusedKind(`redeem ${many.join(" ")}`)).toBe("too_long");
    expect(prepared(`redeem ${many.slice(0, MAX_REDEEM_MARKETS_PER_LINE).join(" ")}`)).toMatchObject({ name: "redeem" });
  });

  it("refuses options that start with a dash", () => {
    expect(refusedKind(`order buy ${MARKET} yes 10 0.4 --force`)).toBe("bad_arguments");
    expect(refusedKind("fund -1")).toBe("bad_arguments");
  });

  it("refuses an owner address with a bad checksum", () => {
    expect(refusedKind(`revoke from ${OWNER.slice(0, 20)}${OWNER.slice(20).toUpperCase().replace("0X", "0x")}`)).toBe("bad_arguments");
  });
});

describe("M5-1: no flag or cap setter, no raw-call path", () => {
  it("names and refuses every setter, session and scripting verb", () => {
    const refusals: Readonly<Record<string, string>> = {
      set: "setter_verb",
      unset: "setter_verb",
      flags: "setter_verb",
      flag: "setter_verb",
      caps: "setter_verb",
      cap: "setter_verb",
      config: "setter_verb",
      enable: "setter_verb",
      disable: "setter_verb",
      grant: "setter_verb",
      token: "setter_verb",
      arm: "session_verb",
      disarm: "session_verb",
      kill: "session_verb",
      "export-audit": "session_verb",
      call: "raw_verb",
      raw: "raw_verb",
      run: "raw_verb",
      exec: "raw_verb",
      tool: "raw_verb",
      rpc: "raw_verb",
      curl: "raw_verb",
      fetch: "raw_verb",
      bash: "raw_verb",
    };
    for (const [verb, kind] of Object.entries(refusals)) {
      expect(refusedKind(`${verb} ENABLE_TRADING true`), verb).toBe(kind);
      expect(refusedKind(verb), verb).toBe(kind);
    }
  });

  it("refuses sending, signing, withdrawing and creating by name", () => {
    for (const verb of ["submit", "sign", "approve", "withdraw", "create", "transfer", "send", "swap", "pay", "place", "respond", "connect", "enable-trading", "revoke-trading", "buy", "sell"]) {
      expect(refusedKind(`${verb} 1`), verb).toBe("not_offered");
    }
  });

  it("points buy and sell to the order command", () => {
    const result = routeLine(`buy ${MARKET} yes 1 0.5`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("order buy");
  });

  it("has no tool-by-name, JSON or scripting form: a line with a shell or JSON character is refused whole", () => {
    for (const line of [
      `order buy ${MARKET} yes 10 0.4; kill`,
      `order buy ${MARKET} yes 10 0.4 | tee`,
      `fund 1 && fund 1`,
      "fund $(whoami)",
      "fund `x`",
      'call {"tool":"xo_submit_order"}',
      `order buy ${MARKET} yes 10 0.4 > out`,
      "redeem \\n",
      "fund ${1}",
    ]) {
      expect(refusedKind(line), line).toBe("unsupported_syntax");
    }
  });

  it("refuses a full-width semicolon after folding, so a look-alike cannot smuggle a second command", () => {
    expect(refusedKind(`fund 1； kill`)).toBe("unsupported_syntax");
  });

  it("refuses a tool name typed as a verb", () => {
    for (const name of ["xo_submit_order", "xo_cancel_order", "xo_prepare_order", "request_wallet_sign", "xo_submit_userop"]) {
      const kind = refusedKind(`${name} 1`);
      expect(["unknown_command"]).toContain(kind);
    }
  });

  it("sends read verbs to the read terminal and refuses unknown ones", () => {
    const read = routeLine("markets bond");
    expect(read.ok && read.route === "read" && read.command.name === "markets").toBe(true);
    expect(refusedKind("what is up")).toBe("unknown_command");
    expect(refusedKind("")).toBe("empty");
    expect(refusedKind("x".repeat(500))).toBe("too_long");
  });
});

describe("M5-2: a pasted newline is flattened and never becomes a second command", () => {
  it("turns line breaks into spaces, so a second line is more arguments of the first", () => {
    const result = routeLine(`fund 1\nkill`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("bad_arguments");
    const two = routeLine(`revoke\nfund 1`);
    expect(two.ok).toBe(false);
  });

  it("flattens other line separators and removes invisible and direction-changing characters", () => {
    expect(prepared(`fund  1​.5‮`)).toMatchObject({ name: "fund", amount: "1.5" });
    expect(prepared("fund\r\n\t 2")).toMatchObject({ name: "fund", amount: "2" });
  });

  it("cannot hide a verb behind a line break", () => {
    const result = routeLine(`order buy ${MARKET} yes 10 0.4\nfrom ${OWNER}`);
    expect(result.ok && result.route === "prepare" && result.command.name === "order" && result.command.from === OWNER).toBe(true);
    expect(refusedKind(`order buy ${MARKET} yes 10 0.4\nkill`)).toBe("bad_arguments");
  });
});
