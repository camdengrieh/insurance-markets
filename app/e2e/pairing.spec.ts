import { startE2eDaemon, type E2eDaemon } from "../../bridge/test/e2e/harness";
import { DIST } from "./support/env";
import { expect, test } from "./support/fixtures";
import { startHostilePage } from "./support/servers";
import { SESSION_KEY, pagePairedToken } from "./support/session";
import { observe } from "./support/world";

// M1-4, the page half: the pairing code arrives in a URL fragment, the page removes it from the address bar before anything
// else, and it appears in no request line or header the browser made, in exactly one request body (its own exchange at
// POST /ui/pair, same origin), and in nothing the page stored. (The daemon half: no response, audit
// entry or log line carries it, bridge/test/e2e/pairing.test.ts.)

let daemon: E2eDaemon | undefined;
test.afterEach(async () => {
  await daemon?.stop();
  daemon = undefined;
});

test("the fragment is removed from the address bar, out of history, and out of every request and every store", async ({ page }) => {
  daemon = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  const link = await daemon.waitForLink(1);
  const seen = await observe(page, { target: "cockpit" });
  const requests: { url: string; headers: Record<string, string>; body: string | null }[] = [];
  page.on("request", (request) => {
    void request.allHeaders().then((headers) => requests.push({ url: request.url(), headers, body: request.postData() }));
  });

  await page.goto(link.url);
  await expect(page.locator("h1")).toBeVisible();
  const token = await pagePairedToken(page);
  expect(token).toMatch(/^cku_/);
  await page.waitForTimeout(500);

  expect(page.url(), "the address bar").toBe(`${daemon.origin}/`);
  const state = await page.evaluate(async () => {
    const stores: Record<string, string> = {
      local: JSON.stringify(Object.entries(localStorage)),
      session: JSON.stringify(Object.entries(sessionStorage)),
      cookie: document.cookie,
      title: document.title,
      referrer: document.referrer,
    };
    const databases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
    return { stores, hash: location.hash, search: location.search, historyState: JSON.stringify(history.state), databases: JSON.stringify(databases) };
  });
  expect(state.hash).toBe("");
  expect(state.search).toBe("");
  for (const [name, value] of Object.entries({ ...state.stores, historyState: state.historyState, databases: state.databases })) expect(value, name).not.toContain(link.code);
  // The page's session lives in sessionStorage for this tab (the token, never the code) and nowhere longer-lived.
  expect(state.stores["session"]).toContain(SESSION_KEY);
  expect(state.stores["local"]).not.toContain(token);
  expect(state.stores["cookie"]).toBe("");

  // Not in any request line or header the browser sent (the fragment never leaves the browser by design), and in a request body
  // only once: the page's own exchange, a same-origin POST to /ui/pair.
  expect(requests.length).toBeGreaterThan(0);
  const withCodeInBody = requests.filter((request) => (request.body ?? "").includes(link.code));
  for (const request of requests) {
    expect(request.url, "request line").not.toContain(link.code);
    expect(JSON.stringify(request.headers), `headers of ${request.url}`).not.toContain(link.code);
    expect(request.url, "the token is never in a URL").not.toContain(token);
  }
  expect(withCodeInBody.map((request) => new URL(request.url).pathname)).toEqual(["/ui/pair"]);
  for (const request of seen.requests()) expect(request.url).not.toContain(link.code);

  // The daemon's log has it once, in the announcement, and nowhere else.
  expect(daemon.stderr().split(link.code).length - 1).toBe(1);

  // The link replaced its own history entry: Back leaves the app (to the blank page the tab started on) instead of returning to a
  // URL that carries the code. Forward again, then a reload does not bring the fragment back either.
  await page.goBack();
  expect(page.url()).toBe("about:blank");
  await page.goForward();
  expect(page.url()).toBe(`${daemon.origin}/`);
  await page.reload();
  expect(page.url()).toBe(`${daemon.origin}/`);
  expect(await page.evaluate(() => location.hash)).toBe("");
  // The page spent the code on its own exchange: it is single use, so a second exchange is refused.
  expect((await daemon.postJson("/ui/pair", { code: link.code })).status).toBe(401);
});

test("a malformed fragment is removed too, and pairs nothing", async ({ page }) => {
  daemon = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  await daemon.waitForLink(1);
  await observe(page, { target: "cockpit" });
  await page.goto(`${daemon.origin}/#pair=not-a-code&other=1`);
  await expect(page.locator("h1")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => location.hash)).toBe("");
  expect(page.url()).toBe(`${daemon.origin}/`);
  const requestedPairing = daemon.log().filter((entry) => entry.path === "/ui/pair");
  expect(requestedPairing).toEqual([]);
});

test("a route fragment is left alone", async ({ page }) => {
  daemon = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  await daemon.waitForLink(1);
  await observe(page, { target: "cockpit" });
  await page.goto(`${daemon.origin}/#/markets`);
  await expect(page.locator("h1")).toHaveText("Markets");
  expect(page.url()).toBe(`${daemon.origin}/#/markets`);
});

test("the paired page's own token reads through the daemon, and the spent code does not pair again", async ({ page }) => {
  daemon = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  const link = await daemon.waitForLink(1);
  await observe(page, { target: "cockpit" });
  await page.goto(link.url);
  await expect(page.locator("h1")).toBeVisible();
  // The page's session client exchanged the code itself: same origin, the real CSP (connect-src 'self'), the real Origin header.
  const token = await pagePairedToken(page);
  const outcome = await page.evaluate(
    async ({ code, bearer }) => {
      const again = await fetch("/ui/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const read = await fetch("/ui/inbox", { headers: { authorization: `Bearer ${bearer}` } });
      const unauthenticated = await fetch("/ui/inbox");
      return { again: again.status, read: read.status, unauthenticated: unauthenticated.status, setCookie: document.cookie };
    },
    { code: link.code, bearer: token },
  );
  expect(outcome).toEqual({ again: 401, read: 200, unauthenticated: 401, setCookie: "" });
});

// The control for the first test: a page that does nothing with its fragment keeps it, and the same measurements see it. Without this a
// page that never had a fragment to begin with would pass the checks above for the wrong reason.
test("control: a page that ignores the fragment leaves it in the address bar, and the check can see that", async ({ page }) => {
  const bare = await startHostilePage("<!doctype html><meta charset=utf-8><title>bare</title><h1>bare</h1>");
  try {
    await observe(page, { target: "cockpit" });
    await page.goto(`${bare.url}#pair=${"a".repeat(32)}`);
    expect(await page.evaluate(() => location.hash)).toBe(`#pair=${"a".repeat(32)}`);
    expect(page.url()).toContain("#pair=");
    await page.goBack();
    expect(page.url()).toBe("about:blank");
  } finally {
    await bare.close();
  }
});
