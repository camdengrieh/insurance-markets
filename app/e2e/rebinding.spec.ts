import { bearer, startE2eDaemon, type E2eDaemon } from "../../bridge/test/e2e/harness";
import { DIST } from "./support/env";
import { expect, test } from "./support/fixtures";
import { startHostilePage } from "./support/servers";
import { HERO_H1, observe } from "./support/world";

// M1-1 and M1-2 in a real browser. The browser is started with a resolver rule that maps the name `rebind.test` to 127.0.0.1,
// which is what a DNS-rebinding attacker's name does after the flip. And a second loopback origin plays the hostile local page.

let owned: E2eDaemon | undefined;
test.afterEach(async () => {
  await owned?.stop();
  owned = undefined;
});

test("DNS rebinding: the daemon answers a name that points at it with 403, for the page, the API and the stream", async ({ page, daemon }) => {
  await daemon.waitForLink(1);
  const token = (await daemon.pair().catch(() => null))?.token ?? null;
  const seen = await observe(page, { target: "cockpit", continueHosts: ["rebind.test"] });
  const response = await page.goto(`http://rebind.test:${daemon.port}/`);
  expect(response?.status()).toBe(403);
  expect(await page.locator("body").innerText()).toContain("host_forbidden");
  expect(await page.locator("#root").count(), "the app did not load").toBe(0);

  // From inside the rebound origin, same-origin requests, with and without a valid token (the attacker would not have one,
  // but the Host check must hold on its own).
  const results = await page.evaluate(async (valid) => {
    const out: Record<string, number | string> = {};
    for (const path of ["/", "/ui/inbox", "/ui/events", "/ui/read/xo_data/api/markets"]) {
      for (const withToken of valid === null ? [false] : [false, true]) {
        const reply = await fetch(path, { headers: withToken && valid !== null ? { authorization: `Bearer ${valid}` } : {} });
        out[`${path} token=${String(withToken)}`] = reply.status;
      }
    }
    const post = await fetch("/ui/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: "0".repeat(32) }) });
    out["POST /ui/pair"] = post.status;
    return out;
  }, token);
  for (const [name, status] of Object.entries(results)) expect(status, name).toBe(403);
  expect(seen.external().every((entry) => entry.outcome === "continued")).toBe(true);
  expect(await page.context().cookies(), "no cookie is ever set").toEqual([]);
});

test("a hostile local page on another port cannot read, write or frame the daemon", async ({ page }) => {
  // Its own daemon: the test spends (or not) the single pairing code, so no other test may share it.
  owned = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  const daemon = owned;
  const link = await daemon.waitForLink(1);
  const hostile = await startHostilePage(`<!doctype html><meta charset="utf-8"><title>hostile</title><body><script>
    const target = ${JSON.stringify(daemon.origin)};
    const code = ${JSON.stringify(link.code)};
    const out = (window.__results = {});
    const attempt = async (name, run) => { try { out[name] = await run(); } catch (error) { out[name] = "blocked:" + (error && error.name); } };
    (async () => {
      await attempt("read-with-token", async () => (await fetch(target + "/ui/inbox", { headers: { authorization: "Bearer cku_" + "A".repeat(43) } })).status);
      await attempt("read-simple", async () => (await fetch(target + "/ui/status")).status);
      await attempt("pair-cors", async () => (await fetch(target + "/ui/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })).status);
      await attempt("pair-no-cors", async () => { const reply = await fetch(target + "/ui/pair", { method: "POST", mode: "no-cors", headers: { "content-type": "text/plain" }, body: JSON.stringify({ code }) }); return reply.type; });
      await attempt("events", () => new Promise((resolve) => { const source = new EventSource(target + "/ui/events"); source.onerror = () => { source.close(); resolve("error"); }; source.onopen = () => { source.close(); resolve("open"); }; setTimeout(() => resolve("timeout"), 4000); }));
      await attempt("websocket", () => new Promise((resolve) => { const socket = new WebSocket(target.replace("http", "ws") + "/ui/events"); socket.onerror = () => resolve("error"); socket.onopen = () => { socket.close(); resolve("open"); }; setTimeout(() => resolve("timeout"), 4000); }));
      const frame = document.createElement("iframe"); frame.src = target + "/"; document.body.append(frame);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      out.done = true;
    })();
  </script></body>`);
  try {
    await observe(page, { target: "cockpit" });
    await page.goto(hostile.url);
    await page.waitForFunction(() => (window as unknown as { __results?: { done?: boolean } }).__results?.done === true, undefined, { timeout: 20_000 });
    const results = (await page.evaluate(() => (window as unknown as { __results: Record<string, unknown> }).__results)) as Record<string, unknown>;

    // The browser blocks the preflighted requests before they leave. The simple POST does reach the daemon (the proof is further
    // down: the code in it was not spent) and the reply is hidden from the page, by Cross-Origin-Resource-Policy: same-origin.
    expect(String(results["read-with-token"])).toMatch(/^blocked:TypeError/);
    expect(String(results["read-simple"])).toMatch(/^blocked:TypeError/);
    expect(String(results["pair-cors"])).toMatch(/^blocked:TypeError/);
    expect(["opaque", "blocked:TypeError"]).toContain(results["pair-no-cors"]);
    expect(results["events"]).toBe("error");
    expect(results["websocket"]).toBe("error");
    // The iframe: refused by X-Frame-Options and frame-ancestors; the frame shows the browser's error page, not the app.
    const frames = page.frames().filter((frame) => frame !== page.mainFrame());
    expect(frames.length).toBe(1);
    expect(frames[0]?.url()).not.toBe(`${daemon.origin}/`);

    // The daemon's side: the correct pairing code that the hostile page sent was not spent, so the user's own pairing still works.
    expect(daemon.links().length).toBe(1);
    const paired = await daemon.pair();
    expect(paired.scopes.length).toBeGreaterThan(0);
    // And nothing the page did produced a cookie.
    expect(await page.context().cookies()).toEqual([]);
    expect(bearer("x")).toEqual({ authorization: "Bearer x" });
  } finally {
    await hostile.close();
  }
});

test("the user's own page, served by the daemon, keeps working next to the attacks and receives no cookie", async ({ page }) => {
  owned = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  await observe(page, { target: "cockpit" });
  await page.goto(`${owned.origin}/#/markets`);
  await expect(page.locator("h1")).toHaveText(HERO_H1);
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});
