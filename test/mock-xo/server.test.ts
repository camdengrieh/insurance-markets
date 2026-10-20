import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createMockClock, MOCK_EPOCH_SECONDS } from "./clock.js";
import { MockHostError, LISTENER_NAMES, MOCK_HOSTS, startMockXo, type MockXo } from "./server.js";
import { MockListener } from "./listener.js";
import { OPTIMISTIC_PROFILE, PESSIMISTIC_PROFILE } from "./switches.js";
import { getJson, useMock } from "./testing.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("the injected clock", () => {
  it("moves only when told to, and only forward", () => {
    const clock = createMockClock();
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS);
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS);
    clock.advance(5);
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS + 5);
    clock.advanceMs(1500);
    assert.equal(clock.nowMs(), (MOCK_EPOCH_SECONDS + 5) * 1000 + 1500);
    assert.equal(clock.nowSeconds(), MOCK_EPOCH_SECONDS + 6);
    assert.throws(() => clock.advance(-1), RangeError);
    assert.throws(() => clock.advance(Number.NaN), RangeError);
    assert.throws(() => clock.advanceMs(0.5), RangeError);
    assert.throws(() => clock.set(1), RangeError);
    clock.set(clock.nowMs() + 10);
    assert.throws(() => createMockClock(-1), RangeError);
  });
});

describe("the listeners", () => {
  const harness = useMock({ chains: false });

  harness.it("binds seven listeners to 127.0.0.1 on distinct ports the OS picked", async (mock) => {
    const ports = Object.values(mock.ports);
    assert.equal(ports.length, LISTENER_NAMES.length + 1);
    assert.equal(new Set(ports).size, ports.length);
    for (const url of Object.values(mock.urls)) assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    for (const port of ports) assert.equal(await canConnect(port), true);
  });

  harness.it("does not listen on any other interface", async (mock, t) => {
    const { networkInterfaces } = await import("node:os");
    const external = Object.values(networkInterfaces())
      .flat()
      .find((entry) => entry !== undefined && entry.family === "IPv4" && !entry.internal);
    if (external === undefined) return t.skip("no non-loopback IPv4 interface on this machine to probe");
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = connect({ port: mock.ports.orderbook, host: external.address });
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
    });
    assert.equal(reachable, false);
  });

  harness.it("serves the real hostnames from the listeners through mock.fetch", async (mock) => {
    const response = await mock.fetch("https://orderbooks.xo.market/time", { method: "GET" });
    assert.equal(response.status, 200);
    assert.equal(await response.json(), MOCK_EPOCH_SECONDS);
    for (const name of LISTENER_NAMES) assert.match(MOCK_HOSTS[name], /^[a-z0-9.-]+\.[a-z]+$/);
  });

  harness.it("refuses every other host before anything is sent, and never calls the network", async (mock) => {
    const seen: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      seen.push(String(input));
      return (real as (a: unknown, b?: unknown) => Promise<Response>)(input, init);
    }) as typeof fetch;
    try {
      for (const url of [
        "https://example.com/time",
        "http://orderbooks.xo.market/time",
        "https://orderbooks.xo.market:8443/time",
        ["https://user:pw", "orderbooks.xo.market/time"].join("@"),
        "https://orderbooks.xo.market.evil.example/time",
        "https://api.xo.market/time",
        "not a url",
        "http://127.0.0.1:1/time",
      ]) {
        await assert.rejects(Promise.resolve().then(() => mock.fetch(url, { method: "GET" })), MockHostError, url);
      }
      await assert.rejects(mock.rpcTransport.postJson("https://rpc.example.com/", {}), MockHostError);
      assert.equal(seen.length, 0);
      await mock.fetch("https://api-mainnet.xo.market/api/markets?take=1", { method: "GET" });
      assert.equal(seen.length, 1);
      assert.match(seen[0] ?? "", /^http:\/\/127\.0\.0\.1:\d+\//);
    } finally {
      globalThis.fetch = real;
    }
  });

  harness.it("records what it received, and no request carries an identifying header", async (mock) => {
    await mock.fetch("https://orderbooks.xo.market/time", { method: "GET", headers: { "user-agent": "insurance-markets-xo-plugin/0.2", accept: "application/json" } });
    const [entry] = mock.requestsTo("orderbook");
    assert.ok(entry !== undefined);
    assert.equal(entry.method, "GET");
    assert.equal(entry.path, "/time");
    assert.equal(entry.status, 200);
    assert.equal(entry.userAgent, "insurance-markets-xo-plugin/0.2");
    assert.equal(entry.from, null);
    assert.equal(entry.referer, null);
    assert.equal(entry.origin, null);
    assert.ok(!entry.headerNames.includes("cookie"));
    assert.ok(!entry.headerNames.includes("authorization"));
    mock.clearRequests();
    assert.equal(mock.requests.length, 0);
  });

  harness.it("answers 404 for a path no route matches, and keeps a throwing handler from looking like a fault", async (mock) => {
    const missing = await getJson(mock, "orderbook", "/nope");
    assert.equal(missing.status, 404);
    mock.listeners.orderbook.override("GET", "/boom", () => {
      throw new Error("handler bug");
    });
    const boom = await getJson(mock, "orderbook", "/boom");
    assert.equal(boom.status, 500);
    assert.equal(mock.internalErrors().length, 1);
    (mock.listeners.orderbook.errors as Error[]).length = 0;
  });

  it("refuses to register a route twice, and lets an override take one over", () => {
    const listener = new MockListener("probe");
    listener.route("GET", "/a/:x", () => ({ status: 200, json: 1 }));
    assert.throws(() => listener.route("GET", "/a/:x", () => ({ status: 200, json: 2 })), /already registered/);
    listener.override("GET", "/a/:x", () => ({ status: 200, json: 3 }));
    assert.deepEqual(listener.routePatterns(), ["GET /a/:x"]);
  });
});

describe("two mocks at once and a clean stop", () => {
  it("run on different ports, are independent, and release their ports when stopped", async () => {
    const a = await startMockXo({ chains: false });
    const b = await startMockXo({ chains: false, profile: "optimistic" });
    assert.ok(a.ok && b.ok);
    if (!a.ok || !b.ok) return;
    const ports = [...Object.values(a.mock.ports), ...Object.values(b.mock.ports)];
    assert.equal(new Set(ports).size, ports.length);
    assert.deepEqual(a.mock.switches.snapshot(), PESSIMISTIC_PROFILE);
    assert.deepEqual(b.mock.switches.snapshot(), OPTIMISTIC_PROFILE);
    a.mock.switches.set("faults", "5xx");
    assert.equal(b.mock.switches.get("faults"), "none");
    a.mock.clock.advance(100);
    assert.equal(b.mock.clock.nowSeconds(), MOCK_EPOCH_SECONDS);
    await a.mock.stop();
    await a.mock.stop();
    for (const port of Object.values(a.mock.ports)) assert.equal(await canConnect(port), false);
    for (const port of Object.values(b.mock.ports)) assert.equal(await canConnect(port), true);
    await b.mock.stop();
    for (const port of Object.values(b.mock.ports)) assert.equal(await canConnect(port), false);
  });

  it("closes a connection it was deliberately never going to answer", async () => {
    const started = await startMockXo({ chains: false });
    assert.ok(started.ok);
    if (!started.ok) return;
    const { mock } = started;
    mock.injectFault("timeout");
    let failure: unknown;
    const pending = globalThis.fetch(`${mock.urls.orderbook}/time`).catch((error: unknown) => {
      failure = error;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await mock.stop();
    await pending;
    assert.ok(failure !== undefined, "the hung request must end when the mock stops");
  });

  it("starts on a mock-only clock: nothing it serves depends on the real time", async () => {
    const started = await startMockXo({ chains: false, clock: createMockClock(1_800_000_000_000) });
    assert.ok(started.ok);
    if (!started.ok) return;
    try {
      const time = await getJson(started.mock, "orderbook", "/time");
      assert.equal(time.body, 1_800_000_000);
      started.mock.clock.advance(3);
      assert.equal((await getJson(started.mock, "orderbook", "/time")).body, 1_800_000_003);
    } finally {
      await started.mock.stop();
    }
  });
});

describe("the control listener", () => {
  const harness = useMock({ chains: false });

  harness.it("reports the profile, every switch and which switches have behaviour", async (mock) => {
    const state = await getJson(mock, "control", "/state");
    assert.equal(state.status, 200);
    const body = state.body as { profile: string; switches: Record<string, string>; implementation: Record<string, string>; clock_ms: number; markets: unknown[] };
    assert.equal(body.profile, "pessimistic");
    assert.deepEqual(body.switches, PESSIMISTIC_PROFILE);
    assert.equal(body.implementation["rpc.access"], "mock-read");
    assert.equal(body.implementation["order.min_size"], "mock-write");
    assert.equal(body.clock_ms, MOCK_EPOCH_SECONDS * 1000);
    assert.ok(body.markets.length >= 9);
  });

  harness.it("sets a profile, flips one switch, moves the clock and injects a fault over HTTP", async (mock) => {
    const post = (path: string, payload: unknown) => getJson(mock, "control", path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal((await post("/profile", { profile: "optimistic" })).status, 200);
    assert.deepEqual(mock.switches.snapshot(), OPTIMISTIC_PROFILE);
    assert.equal((await post("/switch", { name: "rpc.access", value: "down" })).status, 200);
    assert.equal(mock.switches.get("rpc.access"), "down");
    assert.equal(mock.switches.profile, "custom");
    assert.equal((await post("/advance", { seconds: 30 })).status, 200);
    assert.equal(mock.clock.nowSeconds(), MOCK_EPOCH_SECONDS + 30);
    assert.equal((await post("/fault", { kind: "5xx", count: 1 })).status, 200);
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 503);
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 200);
  });

  harness.it("rejects bad input with 400 and changes nothing", async (mock) => {
    const clockBefore = mock.clock.nowSeconds();
    const post = (path: string, payload: string) => getJson(mock, "control", path, { method: "POST", headers: { "content-type": "application/json" }, body: payload });
    assert.equal((await post("/profile", JSON.stringify({ profile: "hopeful" }))).status, 400);
    assert.equal((await post("/switch", JSON.stringify({ name: "rpc.access", value: "maybe" }))).status, 400);
    assert.equal((await post("/switch", JSON.stringify({ name: "nope", value: "x" }))).status, 400);
    assert.equal((await post("/switch", "{broken")).status, 400);
    assert.equal((await post("/advance", JSON.stringify({ seconds: -5 }))).status, 400);
    assert.equal((await post("/fault", JSON.stringify({ kind: "meltdown" }))).status, 400);
    assert.equal((await post("/fault", JSON.stringify({ kind: "5xx", count: 0 }))).status, 400);
    assert.equal((await getJson(mock, "control", "/nowhere")).status, 400);
    assert.deepEqual(mock.switches.snapshot(), PESSIMISTIC_PROFILE);
    assert.equal(mock.clock.nowSeconds(), clockBefore);
  });

  harness.it("keeps answering while a fault is on for every other listener", async (mock) => {
    mock.switches.set("faults", "5xx");
    assert.equal((await getJson(mock, "orderbook", "/time")).status, 503);
    assert.equal((await getJson(mock, "control", "/state")).status, 200);
  });

  harness.it("refuses a request with the wrong Host header or with an Origin (DNS rebinding, cross-site POST)", async (mock) => {
    const send = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const req = httpRequest({ host: "127.0.0.1", port: mock.ports.control, path: "/state", method: "GET", headers }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.once("error", reject);
        req.end();
      });
    assert.equal(await send({ host: `127.0.0.1:${String(mock.ports.control)}` }), 200);
    assert.equal(await send({ host: "evil.example" }), 403);
    assert.equal(await send({ host: `localhost:${String(mock.ports.control)}` }), 403);
    assert.equal(await send({ host: `127.0.0.1:${String(mock.ports.control)}`, origin: "https://evil.example" }), 403);
  });
});

describe("the standalone program", () => {
  it("prints a ready line, answers on the ports it printed, and stops on SIGTERM", async () => {
    const root = join(HERE, "..", "..");
    const child = spawn(process.execPath, ["--import", "tsx", join(HERE, "main.ts"), "--no-chains", "--profile=optimistic"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    try {
      const ready = await new Promise<{ event: string; profile: string; urls: Record<string, string> }>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          settled = true;
          reject(new Error(`no ready line: ${output}`));
        }, 20_000);
        const check = (): void => {
          if (settled) return;
          const line = output.split("\n").find((entry) => entry.startsWith("{"));
          if (line !== undefined) {
            settled = true;
            clearTimeout(timer);
            resolve(JSON.parse(line) as { event: string; profile: string; urls: Record<string, string> });
          } else if (child.exitCode !== null) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(`the program exited with ${String(child.exitCode)} before it was ready: ${output}`));
          } else setTimeout(check, 25);
        };
        check();
      });
      assert.equal(ready.event, "ready");
      assert.equal(ready.profile, "optimistic");
      const time = await (await fetch(`${ready.urls["orderbook"]}/time`)).json();
      assert.equal(time, MOCK_EPOCH_SECONDS);
      const port = Number(new URL(ready.urls["orderbook"] as string).port);
      const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
      child.kill("SIGTERM");
      assert.equal(await exited, 0);
      assert.equal(await canConnect(port), false);
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("refuses an unknown argument and an invalid switch value without starting", async () => {
    const root = join(HERE, "..", "..");
    const run = (args: string[]) =>
      new Promise<number | null>((resolve) => {
        const child = spawn(process.execPath, ["--import", "tsx", join(HERE, "main.ts"), ...args], { cwd: root, stdio: "ignore" });
        child.once("exit", (code) => resolve(code));
      });
    assert.equal(await run(["--bogus"]), 64);
    assert.equal(await run(["--no-chains", "--profile=hopeful"]), 64);
    assert.equal(await run(["--no-chains", "--set", "rpc.access=maybe"]), 64);
  });
});

describe("hygiene of the mock's own files", () => {
  const files = readdirSync(HERE).filter((name) => /\.(?:ts|md)$/.test(name));

  it("holds no e-mail address, home path or session path", () => {
    assert.ok(files.length >= 20);
    for (const name of files) {
      const text = readFileSync(join(HERE, name), "utf8");
      assert.equal(/[\w.+-]+@[\w-]+\.[\w.-]+/.test(text), false, `${name} has an e-mail-like string`);
      assert.equal(/\/(?:Users|home)\/[A-Za-z]/.test(text), false, `${name} has a home path`);
    }
  });

  it("writes no address literal except in the test files that name a public test address", () => {
    const literal = /(?<![0-9a-fA-Fx])0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
    const allowed = new Set(["0xcafe000000000000000000000000000000000a11", "0x1234567890abcdef1234567890abcdef12345678", "0x0000000000000000000000000000000000000000"]);
    // observed.ts holds the one address the project deliberately does not pin: the v0.6 EntryPoint the bundler advertises.
    const found = files.filter((name) => name !== "observed.ts").flatMap((name) => [...readFileSync(join(HERE, name), "utf8").matchAll(literal)].map((m) => `${name}: ${m[0]}`)).filter((entry) => !allowed.has((entry.split(": ")[1] as string).toLowerCase()));
    assert.deepEqual(found, []);
  });
});
