import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { securityHeaders } from "../../../app/headers.config.js";
import { makeFixtureApp, startE2eDaemon, type E2eDaemon } from "./harness.js";

// The daemon serves the Cockpit build and nothing else: no path outside the build directory, no dot-files, no
// listing, GET and HEAD only, every answer with the security headers.

let daemon: E2eDaemon;
let appDir: string;
let outside: string;

before(async () => {
  appDir = await makeFixtureApp();
  outside = await mkdtemp(join(tmpdir(), "cockpit-e2e-outside-"));
  await writeFile(join(outside, "secret.txt"), "not part of the app\n");
  await symlink(join(outside, "secret.txt"), join(appDir, "escape.txt"));
  await symlink(outside, join(appDir, "escape-dir"));
  daemon = await startE2eDaemon({ appDir, hostile: false });
});
after(async () => {
  await daemon.stop();
  await rm(appDir, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe("static serving", () => {
  it("serves the app with the cockpit headers", async () => {
    const page = await daemon.request({ path: "/", headers: { accept: "text/html" } });
    assert.equal(page.status, 200);
    assert.match(String(page.headers["content-type"]), /^text\/html/);
    for (const pair of securityHeaders("cockpit")) assert.equal(page.headers[pair.key.toLowerCase()], pair.value, pair.key);
    const script = await daemon.request({ path: "/app.js" });
    assert.match(String(script.headers["content-type"]), /^text\/javascript/);
  });

  it("refuses dot-files, traversal, encoded tricks and backslashes", async () => {
    for (const path of ["/.secret", "/.git/config", "/%2e%2e/%2e%2e/etc/passwd", "/..%2f..%2fpackage.json", "/%2e%2e%2fpackage.json", "/..\\package.json", "/a/../../x", "/app.js%00.html", "/%00", "//evil.example/x"]) {
      const reply = await daemon.request({ path });
      assert.ok(reply.status === 400 || reply.status === 403 || reply.status === 404, `${path} -> ${reply.status}`);
      assert.doesNotMatch(reply.text, /dot files are never served|root:/);
    }
  });

  it("does not follow a symlink out of the build directory", async () => {
    for (const path of ["/escape.txt", "/escape-dir/secret.txt"]) {
      const reply = await daemon.request({ path });
      assert.notEqual(reply.status, 200, path);
      assert.doesNotMatch(reply.text, /not part of the app/);
    }
  });

  it("lists no directory, and answers a missing file with 404 instead of the app", async () => {
    const missing = await daemon.request({ path: "/assets/missing.js", headers: { accept: "*/*" } });
    assert.equal(missing.status, 404);
    const dir = await daemon.request({ path: "/escape-dir/", headers: { accept: "*/*" } });
    assert.notEqual(dir.status, 200);
  });

  it("serves a page route (no extension, Accept: text/html) as the app, so the client router can own it", async () => {
    const reply = await daemon.request({ path: "/markets", headers: { accept: "text/html" } });
    assert.equal(reply.status, 200);
    assert.match(reply.text, /<div id="root">/);
  });

  it("takes GET and HEAD only on the app", async () => {
    const head = await daemon.request({ method: "HEAD", path: "/" });
    assert.equal(head.status, 200);
    assert.equal(head.text, "");
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const reply = await daemon.request({ method, path: "/app.js", headers: { "content-type": "application/json" }, body: "{}" });
      assert.ok(reply.status === 405 || reply.status === 401, `${method} -> ${reply.status}`);
    }
  });

  it("every response carries the security headers, whatever the status", async () => {
    for (const path of ["/", "/nope.js", "/.secret", "/ui/status", "/ui/nothing"]) {
      const reply = await daemon.request({ path });
      for (const pair of securityHeaders("cockpit")) assert.equal(reply.headers[pair.key.toLowerCase()], pair.value, `${pair.key} on ${path} (${reply.status})`);
    }
  });
});
