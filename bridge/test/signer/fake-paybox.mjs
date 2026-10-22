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
} else if (mode === "usage") {
  // How commander reports bad usage: plain text on stderr, nothing on stdout, exit 1.
  process.stderr.write("error: unknown option '--wait'\n");
  process.exitCode = 1;
} else if (mode === "flow") {
  // text is a JSON object { sign, request, complete } of stdout strings; the appended argv picks one, the way the
  // client's three commands differ: `--json sign ...`, `--json request <id>`, `--json request <id> --complete-signature`.
  const answers = JSON.parse(text ?? "{}");
  const rest = process.argv.slice(4);
  const key = rest.includes("sign") ? "sign" : rest.includes("--complete-signature") ? "complete" : rest.includes("request") ? "request" : "";
  process.stdout.write(answers[key] ?? "");
} else if (mode === "sleep") {
  setTimeout(() => undefined, 30_000);
} else if (mode === "flood") {
  process.stdout.write("x".repeat(200_000));
}
