import { CAPABILITY_ID } from "../../relay/capabilities.js";
import { flagStatus, withStandaloneRegistry } from "./lib/facts.js";
import { isEntryPoint, processIo } from "./lib/harness.js";
import { Printer, SecretRegistry, cleanLine } from "./lib/redact.js";
import type { Io } from "./lib/types.js";

// The relay's capability facts, from the command line (docs/phase1-gap-closing.md amendment A11).
//
//   tsx scripts/live/facts.ts list  --data-dir <dir>
//   tsx scripts/live/facts.ts flags --data-dir <dir>
//   tsx scripts/live/facts.ts record --data-dir <dir> --id T4 --state yes [--value token] [--note "text"] [--record-text "RECORD T4=yes"]
//
// `list` shows every recorded fact (id, state, who recorded it, when, the selected variant, the note). `flags`
// shows which write flags the recorded facts unlock (a flag is still off unless its environment variable is on).
// `record` writes one fact by hand, for a result the scripts cannot see for themselves (the answer to a
// question you settled elsewhere); it needs the same confirmation phrase as a script does, naming the id and
// the state.
//
// The data directory has one owner at a time: stop `pnpm relay` first.

const USAGE = `Usage:
  tsx scripts/live/facts.ts list   --data-dir <dir>
  tsx scripts/live/facts.ts flags  --data-dir <dir>
  tsx scripts/live/facts.ts record --data-dir <dir> --id <ID> --state <yes|no|unknown> [--value <token>] [--note <text>] [--record-text "RECORD <ID>=<state>"]

Stop the relay first: a data directory has one owner at a time.`;

export interface FactsDeps {
  readonly io?: Io;
  readonly nowMs?: () => number;
}

function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

// Returns the process exit code: 0 done, 2 refused or misused.
export async function runFactsCli(argv: readonly string[], deps: FactsDeps = {}): Promise<number> {
  const io = deps.io ?? processIo();
  const printer = new Printer(io, new SecretRegistry());
  const now = deps.nowMs ?? ((): number => Date.now());
  const command = argv[0];
  const dir = option(argv, "data-dir");
  if (command === undefined || !["list", "flags", "record"].includes(command) || dir === undefined) {
    printer.error(USAGE);
    return 2;
  }

  if (command === "list" || command === "flags") {
    return withStandaloneRegistry(dir, now, async (registry) => {
      const facts = registry.all();
      if (command === "list") {
        printer.line(facts.length === 0 ? "No capability fact is recorded." : `${String(facts.length)} capability fact(s):`);
        for (const fact of facts) {
          printer.line(`  ${fact.id.padEnd(4)} ${fact.state.padEnd(7)} ${fact.source.padEnd(8)} ${fact.recordedAt}${fact.value === undefined ? "" : `  value ${fact.value}`}${fact.note === undefined ? "" : `  - ${cleanLine(fact.note, 160)}`}`);
        }
        return 0;
      }
      for (const status of flagStatus(facts)) {
        printer.line(`  ${status.flag.padEnd(28)} ${status.unlocked ? "UNLOCKED by the recorded facts" : "locked    "}  needs ${status.needs.map((entry) => `${entry.id}=${entry.state}`).join(", ")}`);
      }
      printer.line("A flag is also off unless its environment variable is on, and the kill switch (KILL, XO_KILL_SWITCH) overrides everything.");
      return 0;
    }).catch((error: unknown) => {
      printer.error(`Could not open the data directory (${error instanceof Error ? ((error as { code?: string }).code ?? error.name) : "error"}). If \`pnpm relay\` is running on it, stop it first.`);
      return 2;
    });
  }

  const id = option(argv, "id");
  const state = option(argv, "state");
  if (id === undefined || !CAPABILITY_ID.test(id)) {
    printer.error("--id must be a capability id such as T4, FU9 or PB1.");
    return 2;
  }
  if (state !== "yes" && state !== "no" && state !== "unknown") {
    printer.error("--state must be yes, no or unknown.");
    return 2;
  }
  const value = option(argv, "value");
  const note = option(argv, "note");
  const phrase = `RECORD ${id}=${state}`;
  printer.line(`This writes ${id} = ${state}${value === undefined ? "" : ` (${value})`} into the relay's capability register as an operator fact.`);
  printer.line(`Type exactly   ${phrase}   to record it (anything else records nothing).`);
  const answer = option(argv, "record-text") ?? (await printer.ask("> "));
  if (answer === undefined || answer.trim() !== phrase) {
    printer.line("The text did not match. Nothing was recorded.");
    return 2;
  }
  try {
    await withStandaloneRegistry(dir, now, async (registry) => {
      await registry.record({ id, state, source: "operator", ...(value === undefined ? {} : { value }), ...(note === undefined ? {} : { note }) });
    });
  } catch (error) {
    printer.error(`Not recorded: ${cleanLine(error instanceof Error ? error.message : "refused", 200)}`);
    return 2;
  }
  printer.line(`Recorded ${id} = ${state}.`);
  return 0;
}

if (isEntryPoint(import.meta.url)) process.exitCode = await runFactsCli(process.argv.slice(2));
