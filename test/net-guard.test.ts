import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// The offline guard (test/net-guard.mjs) itself. The child processes never reach a real host: 192.0.2.1 is a
// TEST-NET-1 address that nothing answers, and with the guard on the attempt is refused before any packet is sent.

const GUARD = fileURLToPath(new URL("./net-guard.mjs", import.meta.url));

function run(script: string, env: Record<string, string> = {}): { status: number | null; out: string } {
  const child = spawnSync(process.execPath, ["--import", GUARD, "--input-type=module", "-e", script], {
    encoding: "utf8",
    timeout: 20_000,
    env: { PATH: process.env["PATH"] ?? "", ...env },
  });
  return { status: child.status, out: `${child.stdout}${child.stderr}` };
}

describe("the offline guard", () => {
  it("refuses fetch to a non-loopback host, with a message that says why", () => {
    const { status, out } = run(`
      try { await fetch("https://192.0.2.1/x"); console.log("REACHED"); } catch (e) { console.log("BLOCKED " + e.message); }
      console.log(JSON.stringify(globalThis.__netGuardBlocked));
    `);
    assert.equal(status, 0, out);
    assert.match(out, /BLOCKED net-guard: a test tried to reach 192\.0\.2\.1/);
    assert.match(out, /fetch 192\.0\.2\.1/);
    assert.doesNotMatch(out, /REACHED/);
  });

  it("refuses a raw TCP connection to a non-loopback host", () => {
    const { status, out } = run(`
      import net from "node:net";
      await new Promise((resolve) => {
        const socket = net.connect({ host: "192.0.2.1", port: 9 });
        socket.on("error", (e) => { console.log("BLOCKED " + e.message); resolve(); });
        socket.on("connect", () => { console.log("REACHED"); resolve(); });
      });
    `);
    assert.equal(status, 0, out);
    assert.match(out, /BLOCKED net-guard: a test tried to connect to 192\.0\.2\.1/);
    assert.doesNotMatch(out, /REACHED/);
  });

  it("lets loopback through, over fetch and over a socket", () => {
    const { status, out } = run(`
      import http from "node:http";
      const server = http.createServer((_, res) => res.end("hello"));
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const { port } = server.address();
      const body = await (await fetch("http://127.0.0.1:" + port + "/")).text();
      const viaLocalhost = await (await fetch("http://localhost:" + port + "/")).text().catch(() => "unreachable-but-allowed");
      console.log("OK " + body + " " + viaLocalhost + " " + JSON.stringify(globalThis.__netGuardBlocked));
      server.close();
    `);
    assert.equal(status, 0, out);
    assert.match(out, /OK hello /);
    assert.match(out, /\[\]$/m);
  });

  it("stays off for the opt-in live suites", () => {
    const { status, out } = run(`console.log("installed=" + (globalThis.__netGuardInstalled === true));`, { XO_LIVE: "1" });
    assert.equal(status, 0, out);
    assert.match(out, /installed=false/);
  });
});
