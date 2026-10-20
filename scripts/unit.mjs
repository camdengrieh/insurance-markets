// Runs the unit suite with the offline guard preloaded (test/net-guard.mjs): any test connection to a
// non-loopback host fails the test. Same file selection as `pnpm unit`; extra arguments are test files.
//   node scripts/unit.mjs [test files...]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const files = process.argv.slice(2);
const args = ["exec", "tsx", "--test", "--import", "./test/net-guard.mjs", ...(files.length > 0 ? files : ["test/**/*.test.ts"])];
const child = spawn("pnpm", args, { cwd: root, stdio: "inherit" });
child.on("exit", (code, signal) => {
  process.exitCode = signal === null ? (code ?? 1) : 1;
});
