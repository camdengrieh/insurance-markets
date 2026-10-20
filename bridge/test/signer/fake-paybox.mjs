// A stand-in for the `paybox` command line tool, used only by cli.test.ts. It is NOT PayBox and talks to nothing.
// argv: <mode> [text] [...whatever the client appended]
const [mode, text] = process.argv.slice(2);
if (mode === "dump") {
  process.stdout.write(JSON.stringify({ args: process.argv.slice(3), env: process.env }));
} else if (mode === "print") {
  process.stdout.write(text ?? "");
} else if (mode === "fail") {
  process.stderr.write("pbxk1.SECRET-IN-STDERR\n");
  process.stdout.write(text ?? "");
  process.exitCode = 1;
} else if (mode === "sleep") {
  setTimeout(() => undefined, 30_000);
} else if (mode === "flood") {
  process.stdout.write("x".repeat(200_000));
}
