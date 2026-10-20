import { isMain, report, type Violation } from "./lib.ts";
import { checkAddresses } from "./check-addresses.ts";
import { checkBoundaries } from "./check-boundaries.ts";
import { checkBundle } from "./check-bundle.ts";
import { checkCsp } from "./check-csp.ts";
import { checkDeps } from "./check-deps.ts";
import { checkOrigins } from "./check-origins.ts";

// Every offline check, in one run. The root-isolation check is separate because it runs an install.

const CHECKS: ReadonlyArray<readonly [string, () => Promise<Violation[]>]> = [
  ["check-deps", () => checkDeps()],
  ["check-boundaries", () => checkBoundaries()],
  ["check-csp", () => checkCsp()],
  ["check-origins", () => checkOrigins()],
  ["check-addresses", () => checkAddresses()],
  ["check-bundle", () => checkBundle()],
];

if (isMain(import.meta.url)) {
  let code = 0;
  for (const [name, run] of CHECKS) code |= report(name, await run());
  process.exitCode = code;
}
