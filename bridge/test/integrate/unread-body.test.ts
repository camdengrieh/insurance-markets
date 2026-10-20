import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { createStaticSite } from "../../static.js";
import { send, startTestDaemon, type TestDaemon } from "../server/helpers.js";

// A request the daemon refuses before reading its body (405 on the app, 405 on a method no route takes) is answered once
// with `Connection: close`. The body the client sends after its headers is not a new request, and the parser's complaint
// about it used to become a second response on the same socket ("Data after `Connection: close`" in the client), in
// about a quarter of the attempts with node's http client.

let dir: string;
let daemon: TestDaemon;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cockpit-unread-"));
  await writeFile(join(dir, "index.html"), "<!doctype html><div id=root></div>");
  daemon = await startTestDaemon({ site: createStaticSite(dir) });
});
afterEach(async () => {
  await daemon.stop();
  await rm(dir, { recursive: true, force: true });
});

describe("a refused request with an unread body", () => {
  it("gets exactly one answer, whatever the method and however the client splits headers and body", async () => {
    const failures: string[] = [];
    for (let round = 0; round < 60; round += 1) {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        for (const path of ["/app.js", "/index.html"]) {
          try {
            const reply = await send({ port: daemon.port, method, path, headers: { "content-type": "application/json" }, body: JSON.stringify({ round }) });
            if (reply.status !== 405) failures.push(`${method} ${path} -> ${reply.status}`);
          } catch (error) {
            failures.push(`${method} ${path} -> ${error instanceof Error ? error.message : "error"}`);
          }
        }
      }
    }
    assert.deepEqual(failures.slice(0, 5), []);
  });

  it("still answers the next, well-formed request on a new connection", async () => {
    await send({ port: daemon.port, method: "POST", path: "/app.js", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
    const page = await send({ port: daemon.port, path: "/" });
    assert.equal(page.status, 200);
  });
});
