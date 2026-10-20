// Runs the mock as a standalone program, for tools that live in another process (the live kit's dry runs,
// `pnpm call` against a local relay):
//
//   pnpm exec tsx test/mock-xo/main.ts [--profile=pessimistic|optimistic] [--no-chains] [--set name=value ...]
//
// It prints one JSON line when it is ready ({"event":"ready", "urls": {...}}) and runs until it receives
// SIGINT or SIGTERM, then stops every listener and every anvil it started. Listeners bind 127.0.0.1 on
// ports the OS picks. Nothing leaves the machine.

import { pathToFileURL } from "node:url";

import { MockSwitchError, isMockSwitchName } from "./profile.js";
import { startMockXo } from "./server.js";

export async function main(argv: readonly string[]): Promise<number> {
  let profile: "pessimistic" | "optimistic" = "pessimistic";
  let chains = true;
  const sets: [string, string][] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--no-chains") {
      chains = false;
    } else if (arg.startsWith("--profile=")) {
      const value = arg.slice("--profile=".length);
      if (value !== "pessimistic" && value !== "optimistic") {
        process.stderr.write("--profile must be pessimistic or optimistic\n");
        return 64;
      }
      profile = value;
    } else if (arg === "--set") {
      // --set name=value, one switch per flag
      const pair = argv[index + 1] ?? "";
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      if (at < 1 || !isMockSwitchName(name)) {
        process.stderr.write("--set takes name=value for a known switch\n");
        return 64;
      }
      sets.push([name, pair.slice(at + 1)]);
      index += 1;
    } else {
      process.stderr.write(`unknown argument: ${arg}\n`);
      return 64;
    }
  }
  const started = await startMockXo({ profile, ...(chains ? {} : { chains: false as const }) });
  if (!started.ok) {
    process.stdout.write(`${JSON.stringify({ event: "unavailable", reason: started.reason })}\n`);
    return 2;
  }
  const { mock } = started;
  try {
    for (const [name, value] of sets) mock.switches.setByName(name, value);
  } catch (error) {
    await mock.stop();
    process.stderr.write(`${error instanceof MockSwitchError ? error.message : "could not apply a switch"}\n`);
    return 64;
  }
  process.stdout.write(`${JSON.stringify({ event: "ready", profile: mock.switches.profile, urls: mock.urls })}\n`);
  await new Promise<void>((resolve) => {
    const stop = (): void => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  await mock.stop();
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "mock failed"}\n`);
      process.exit(1);
    },
  );
}
