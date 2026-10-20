import { mkdir, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cspHeaderValue } from "../headers.config.ts";
import { startStaticServer, type RunningServer } from "./serve-with-headers.ts";
import { tempRepo, type TempRepo } from "./test-helpers.ts";

const repos: TempRepo[] = [];
const servers: RunningServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(repos.splice(0).map((repo) => repo.dispose()));
});

// fetch() normalises dot segments before sending, so traversal has to be sent as a raw request target.
function rawStatus(server: RunningServer, target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: server.port, path: target, method: "GET" }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

async function serve(target: "standalone" | "cockpit"): Promise<RunningServer> {
  const repo = await tempRepo({ "dist/index.html": "<!doctype html><p>hi</p>", "dist/assets/a.js": "export {}", "dist/.secret": "no", "outside.txt": "no" });
  repos.push(repo);
  await mkdir(join(repo.root, "dist", "sub"), { recursive: true });
  await writeFile(join(repo.root, "dist", "sub", "x.css"), "p{}");
  const server = await startStaticServer({ dir: join(repo.root, "dist"), target });
  servers.push(server);
  return server;
}

describe("serve-with-headers", () => {
  it("binds 127.0.0.1 only and serves each build with its own CSP", async () => {
    for (const target of ["standalone", "cockpit"] as const) {
      const server = await serve(target);
      expect(server.url.startsWith("http://127.0.0.1:")).toBe(true);
      const address = server.server.address();
      expect(typeof address === "object" && address !== null ? address.address : "").toBe("127.0.0.1");
      const response = await fetch(server.url);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(cspHeaderValue(target));
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(await response.text()).toContain("hi");
    }
  });

  it("serves assets with the right type and refuses traversal, dotfiles, other methods and directories", async () => {
    const server = await serve("cockpit");
    const js = await fetch(`${server.url}assets/a.js`);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect((await fetch(`${server.url}sub/x.css`)).headers.get("content-type")).toContain("text/css");
    expect((await fetch(`${server.url}.secret`)).status).toBe(404);
    for (const target of ["/%2e%2e/outside.txt", "/..%2foutside.txt", "/../outside.txt", "/sub/../../outside.txt", "/%2e%2e%2foutside.txt"]) {
      const status = await rawStatus(server, target);
      expect([403, 404], target).toContain(status);
    }
    expect(await rawStatus(server, "/a%00b")).toBe(400);
    expect((await fetch(`${server.url}sub/`)).status).toBe(404);
    expect((await fetch(`${server.url}missing.js`)).status).toBe(404);
    expect((await fetch(server.url, { method: "POST", body: "x" })).status).toBe(405);
    const head = await fetch(server.url, { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.headers.get("content-security-policy")).toBe(cspHeaderValue("cockpit"));
    // Errors carry the security headers too.
    expect((await fetch(`${server.url}missing.js`)).headers.get("x-frame-options")).toBe("DENY");
  });
});
