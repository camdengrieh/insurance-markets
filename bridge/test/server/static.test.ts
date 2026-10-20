import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { securityHeaders } from "../../../app/headers.config.js";
import { bearer, startTestDaemon, send, type TestDaemon } from "./helpers.js";
import { contentTypeFor, createStaticSite, defaultAppDir, type StaticOutcome, type StaticSite } from "../../static.js";

let dir: string;
let build: string;
let outside: string;
let running: TestDaemon | undefined;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "cockpit-static-"));
  build = join(dir, "dist", "cockpit");
  outside = join(dir, "outside");
  await mkdir(join(build, "assets"), { recursive: true });
  await mkdir(join(build, ".hidden"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(build, "index.html"), "<!doctype html><title>cockpit</title><script type=\"module\" src=\"/assets/app.js\"></script>");
  await writeFile(join(build, "assets", "app.js"), "export const a = 1;\n");
  await writeFile(join(build, "assets", "app.css"), "body{margin:0}\n");
  await writeFile(join(build, "assets", "icon.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"/>");
  await writeFile(join(build, ".env"), "SECRET=1\n");
  await writeFile(join(build, ".hidden", "x.txt"), "hidden\n");
  await writeFile(join(outside, "secret.txt"), "outside the build\n");
  await symlink(join(outside, "secret.txt"), join(build, "assets", "leak.txt"));
  await symlink(outside, join(build, "assets", "linkdir"));
});
afterEach(async () => {
  await running?.stop();
  running = undefined;
  await rm(dir, { recursive: true, force: true });
});

async function start(site = createStaticSite(build)): Promise<TestDaemon> {
  running = await startTestDaemon({ site });
  return running;
}

const html = { accept: "text/html,application/xhtml+xml" };

describe("serving the build", () => {
  it("serves index.html at / with the Cockpit security headers and no caching", async () => {
    const t = await start();
    const reply = await send({ port: t.port, path: "/", headers: html });
    assert.equal(reply.status, 200);
    assert.match(reply.text, /<title>cockpit<\/title>/);
    assert.equal(reply.headers["content-type"], "text/html; charset=utf-8");
    for (const pair of securityHeaders("cockpit")) assert.equal(reply.headers[pair.key.toLowerCase()], pair.value, pair.key);
    assert.equal(reply.headers["cache-control"], "no-store");
    assert.equal(reply.headers["set-cookie"], undefined);
    assert.equal((await send({ port: t.port, path: "/index.html" })).status, 200);
  });
  it("serves assets with their types and a correct Content-Length", async () => {
    const t = await start();
    const js = await send({ port: t.port, path: "/assets/app.js" });
    assert.equal(js.headers["content-type"], "text/javascript; charset=utf-8");
    assert.equal(js.headers["content-length"], String(Buffer.byteLength(js.text)));
    assert.equal((await send({ port: t.port, path: "/assets/app.css" })).headers["content-type"], "text/css; charset=utf-8");
    assert.equal((await send({ port: t.port, path: "/assets/icon.svg" })).headers["content-type"], "image/svg+xml");
  });
  it("answers HEAD with the headers and no body", async () => {
    const t = await start();
    const reply = await send({ port: t.port, method: "HEAD", path: "/assets/app.js" });
    assert.equal(reply.status, 200);
    assert.equal(reply.text, "");
    assert.equal(reply.headers["content-length"], "20");
  });
  it("hands a client-side route the index when a browser asks for a page, and 404s a missing asset", async () => {
    const t = await start();
    const route = await send({ port: t.port, path: "/markets/some-market", headers: html });
    assert.equal(route.status, 200);
    assert.match(route.text, /<title>cockpit<\/title>/);
    assert.equal((await send({ port: t.port, path: "/markets/some-market", headers: { accept: "application/json" } })).status, 404);
    assert.equal((await send({ port: t.port, path: "/assets/missing.js", headers: html })).status, 404);
    assert.equal((await send({ port: t.port, path: "/favicon.ico", headers: html })).status, 404);
  });
  it("never serves an API path from files, and API paths need a token", async () => {
    const t = await start();
    assert.equal((await send({ port: t.port, path: "/ui/anything", headers: html })).status, 401);
    const token = await t.pair();
    assert.equal((await send({ port: t.port, path: "/ui/anything", headers: { ...html, ...bearer(token) } })).status, 404);
  });
  it("accepts GET and HEAD only", async () => {
    const t = await start();
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const reply = await send({ port: t.port, method, path: "/", headers: { "content-type": "application/json" }, body: method === "POST" || method === "PUT" ? "{}" : undefined });
      assert.equal(reply.status, 405, method);
      assert.equal(reply.headers["allow"], "GET, HEAD");
    }
  });
});

describe("static path safety", () => {
  it("refuses dot-files and dot-directories", async () => {
    const t = await start();
    assert.equal((await send({ port: t.port, path: "/.env" })).status, 404);
    assert.equal((await send({ port: t.port, path: "/.hidden/x.txt" })).status, 404);
    assert.equal((await send({ port: t.port, path: "/assets/.." })).status, 400);
  });
  it("refuses traversal in plain and encoded form", async () => {
    const t = await start();
    for (const path of ["/../outside/secret.txt", "/assets/../../outside/secret.txt", "/%2e%2e/outside/secret.txt", "/assets/%2e%2e/%2e%2e/outside/secret.txt", "/..%2foutside/secret.txt", "/assets%5c..%5c..%5coutside%5csecret.txt"]) {
      const reply = await send({ port: t.port, path });
      assert.ok(reply.status === 400 || reply.status === 404, `${path} -> ${reply.status}`);
      assert.equal(reply.text.includes("outside the build"), false, path);
    }
  });
  it("refuses a symlink that leaves the build directory, to a file or to a directory", async () => {
    const t = await start();
    const file = await send({ port: t.port, path: "/assets/leak.txt" });
    assert.equal(file.status, 404);
    assert.equal(file.text.includes("outside the build"), false);
    const viaDir = await send({ port: t.port, path: "/assets/linkdir/secret.txt" });
    assert.equal(viaDir.status, 404);
    assert.equal(viaDir.text.includes("outside the build"), false);
  });
  it("refuses NUL, backslashes and bad escapes", async () => {
    const t = await start();
    for (const path of ["/assets/app.js%00.png", "/assets%5capp.js", "/%zz", "/assets/app.js%"]) {
      const reply = await send({ port: t.port, path });
      assert.ok(reply.status === 400 || reply.status === 404, `${path} -> ${reply.status}`);
    }
  });
  it("does not list a directory", async () => {
    const t = await start();
    const reply = await send({ port: t.port, path: "/assets/", headers: { accept: "*/*" } });
    assert.equal(reply.status, 404);
    assert.equal(reply.text.includes("app.js"), false);
  });
});

describe("a build that is not there", () => {
  it("answers 404 with the build command, and the daemon still serves its API", async () => {
    const t = await start(createStaticSite(join(dir, "nope")));
    const reply = await send({ port: t.port, path: "/", headers: html });
    assert.equal(reply.status, 404);
    assert.match(reply.text, /pnpm --dir app run build:cockpit/);
    assert.equal((await send({ port: t.port, path: "/ui/status" })).status, 401);
  });
  it("reports whether index.html exists", async () => {
    assert.equal(await createStaticSite(build).available(), true);
    assert.equal(await createStaticSite(join(dir, "nope")).available(), false);
    await rm(join(build, "index.html"));
    assert.equal(await createStaticSite(build).available(), false);
  });
  it("needs an absolute directory", () => {
    assert.throws(() => createStaticSite("relative/dir"));
  });
});

describe("a new pairing link on page load", () => {
  const navigation = { ...html, "sec-fetch-site": "none", "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };
  it("is printed when a user opens the page and no code is open", async () => {
    const t = await start();
    assert.equal(t.stderr.text(), "");
    await send({ port: t.port, path: "/", headers: navigation });
    assert.match(t.stderr.text(), /#pair=[0-9a-f]{32}/);
    // a code is open now: another load prints nothing new
    await send({ port: t.port, path: "/", headers: navigation });
    assert.equal((t.stderr.text().match(/#pair=/g) ?? []).length, 1);
  });
  it("is printed again after the code expires, and after it is used, but not faster than every 5 seconds", async () => {
    const t = await start();
    await send({ port: t.port, path: "/", headers: navigation });
    t.clock.now += 120_000;
    await send({ port: t.port, path: "/", headers: navigation });
    assert.equal((t.stderr.text().match(/#pair=/g) ?? []).length, 2);
    // use the second code: the page is paired, then opened in a new tab right away
    const code = [...t.stderr.text().matchAll(/#pair=([0-9a-f]{32})/g)].at(-1)?.[1] ?? "";
    assert.equal(t.auth.redeemPairing(code).ok, true);
    await send({ port: t.port, path: "/", headers: navigation });
    assert.equal((t.stderr.text().match(/#pair=/g) ?? []).length, 2, "under 5 s since the last link: nothing printed");
    t.clock.now += 6_000;
    await send({ port: t.port, path: "/", headers: navigation });
    assert.equal((t.stderr.text().match(/#pair=/g) ?? []).length, 3);
  });
  it("is not printed for a script's request, a cross-site navigation, or an asset", async () => {
    const t = await start();
    await send({ port: t.port, path: "/", headers: { accept: "*/*" } });
    await send({ port: t.port, path: "/", headers: { ...navigation, "sec-fetch-site": "cross-site" } });
    await send({ port: t.port, path: "/", headers: { ...navigation, "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" } });
    await send({ port: t.port, path: "/assets/app.js", headers: navigation });
    assert.equal(t.stderr.text(), "");
  });
  it("is not printed on a read-only HEAD of a missing page", async () => {
    const t = await start();
    await send({ port: t.port, path: "/missing.png", headers: navigation });
    assert.equal(t.stderr.text(), "");
  });
});

describe("a client that leaves while the file is being opened (DS-1)", () => {
  // A site whose serve() waits on a gate, so the test can disconnect the client while the daemon is still awaiting it.
  function gatedSite() {
    const real = createStaticSite(build);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: () => void = () => undefined;
    const enteredPromise = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const opened: Extract<StaticOutcome, { kind: "file" }>[] = [];
    let closes = 0;
    const site: StaticSite = {
      root: real.root,
      available: () => real.available(),
      async serve(request) {
        entered();
        await gate;
        const outcome = await real.serve(request);
        if (outcome.kind !== "file") return outcome;
        const wrapped = {
          ...outcome,
          close: async () => {
            closes += 1;
            await outcome.close();
          },
        };
        opened.push(wrapped);
        return wrapped;
      },
    };
    return { site, release: () => release(), entered: enteredPromise, opened, closes: () => closes };
  }

  async function waitFor(check: () => boolean): Promise<void> {
    for (let i = 0; i < 200 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(check(), "condition reached");
  }

  async function leaveEarly(path: string, method: "GET" | "HEAD" = "GET") {
    const gated = gatedSite();
    const t = await start(gated.site);
    const socket = connect({ host: "127.0.0.1", port: t.port }, () => socket.write(`${method} ${path} HTTP/1.1\r\nHost: 127.0.0.1:${String(t.port)}\r\nAccept: */*\r\n\r\n`));
    socket.on("error", () => undefined);
    await gated.entered;
    socket.destroy();
    // The daemon sees the socket close while serve() is still pending.
    await new Promise((resolve) => setTimeout(resolve, 60));
    gated.release();
    return { gated, t };
  }

  it("closes the file handle and destroys the body stream when the response is already gone", async () => {
    const { gated } = await leaveEarly("/assets/app.js");
    await waitFor(() => gated.opened.length === 1);
    const outcome = gated.opened[0];
    assert.ok(outcome?.body !== undefined, "a GET has a body stream");
    await waitFor(() => gated.closes() >= 1 && outcome.body?.destroyed === true);
  });

  it("does the same for a repeated disconnect, and the daemon keeps serving", async () => {
    for (let round = 0; round < 3; round += 1) {
      const { gated, t } = await leaveEarly("/assets/app.js");
      await waitFor(() => gated.opened.length === 1);
      await waitFor(() => gated.closes() >= 1 && gated.opened[0]?.body?.destroyed === true);
      await t.stop();
      running = undefined;
    }
    const t = await start();
    assert.equal((await send({ port: t.port, path: "/assets/app.js" })).status, 200);
  });

  it("a client that stays gets the file, and the handle is released at the end of the response", async () => {
    const gated = gatedSite();
    const t = await start(gated.site);
    const pending = send({ port: t.port, path: "/assets/app.js" });
    await gated.entered;
    gated.release();
    const reply = await pending;
    assert.equal(reply.status, 200);
    assert.equal(reply.text, "export const a = 1;\n");
    await waitFor(() => gated.closes() === 1);
  });
});

describe("helpers", () => {
  it("maps file extensions to types and defaults to octet-stream", () => {
    assert.equal(contentTypeFor("a/b.html"), "text/html; charset=utf-8");
    assert.equal(contentTypeFor("a/b.WOFF2"), "font/woff2");
    assert.equal(contentTypeFor("a/b.unknown"), "application/octet-stream");
    assert.equal(contentTypeFor("a/noext"), "application/octet-stream");
  });
  it("finds app/dist/cockpit from the module location, one level below the repository root", () => {
    const found = defaultAppDir("file:///repo/bridge/static.ts");
    assert.equal(found.replaceAll("\\", "/").endsWith("/repo/app/dist/cockpit"), true);
    assert.equal(defaultAppDir("file:///repo/dist/local.mjs").replaceAll("\\", "/").endsWith("/repo/app/dist/cockpit"), true);
  });
});
