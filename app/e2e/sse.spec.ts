import { startE2eDaemon, type E2eDaemon } from "../../bridge/test/e2e/harness";
import { DIST } from "./support/env";
import { expect, test } from "./support/fixtures";
import { unknownViolations } from "./support/known-issues";
import { pagePairedToken } from "./support/session";
import { observe } from "./support/world";

// The SSE feed read the way the page reads it: fetch plus a ReadableStream with the bearer token (EventSource cannot send a
// header), from the page's own origin, under the cockpit CSP (connect-src 'self').

let owned: E2eDaemon | undefined;
test.afterEach(async () => {
  await owned?.stop();
  owned = undefined;
});

test("the page reads audit entries from the stream, in order, and resumes after a reconnect", async ({ page }) => {
  owned = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  const daemon = owned;
  const link = await daemon.waitForLink(1);
  const seen = await observe(page, { target: "cockpit" });
  await page.goto(link.url);
  await expect(page.locator("h1")).toBeVisible();

  const pageToken = await pagePairedToken(page);
  await page.evaluate(async (bearerToken) => {
    const body = { token: bearerToken };
    const state = { token: body.token, events: [] as { id: number; type: string; summary?: string }[], status: 0, controller: new AbortController() };
    (window as unknown as { __sse: typeof state }).__sse = state;
    const response = await fetch("/ui/events", { headers: { authorization: `Bearer ${body.token}`, accept: "text/event-stream" }, signal: state.controller.signal });
    state.status = response.status;
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    void (async () => {
      while (reader !== undefined) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let at = buffer.indexOf("\n\n");
        while (at !== -1) {
          const block = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const data = block.split("\n").find((line) => line.startsWith("data:"));
          if (data !== undefined) {
            const parsed = JSON.parse(data.slice(5)) as { id: number; type: string; entry?: { summary: string } };
            state.events.push({ id: parsed.id, type: parsed.type, ...(parsed.entry === undefined ? {} : { summary: parsed.entry.summary }) });
          }
          at = buffer.indexOf("\n\n");
        }
      }
    })();
  }, pageToken);

  await page.waitForFunction(() => (window as unknown as { __sse?: { status: number } }).__sse?.status === 200);

  // Two refused pairing attempts from outside: the user's browser sees both as audit entries, in order.
  for (const code of ["1".repeat(32), "2".repeat(32)]) expect((await daemon.postJson("/ui/pair", { code })).status).toBe(401);
  await page.waitForFunction(() => ((window as unknown as { __sse: { events: { type: string }[] } }).__sse.events.filter((event) => event.type === "audit").length) >= 2);
  const events = await page.evaluate(() => (window as unknown as { __sse: { events: { id: number; type: string; summary?: string }[] } }).__sse.events);
  const audits = events.filter((event) => event.type === "audit");
  expect(audits.length).toBeGreaterThanOrEqual(2);
  for (const entry of audits.slice(-2)) expect(entry.summary).toMatch(/pairing was refused/i);
  for (let index = 1; index < events.length; index += 1) expect((events[index]?.id ?? 0) > (events[index - 1]?.id ?? 0)).toBe(true);

  // The feed carries no secret: not the pairing code, not the page's token.
  const everything = JSON.stringify(events);
  expect(everything).not.toContain(link.code);
  const token = await page.evaluate(() => (window as unknown as { __sse: { token: string } }).__sse.token);
  expect(everything).not.toContain(token);

  // Reconnect with Last-Event-ID and receive only what was missed.
  const lastId = events.at(-1)?.id ?? 0;
  await page.evaluate(() => (window as unknown as { __sse: { controller: AbortController } }).__sse.controller.abort());
  expect((await daemon.postJson("/ui/pair", { code: "3".repeat(32) })).status).toBe(401);
  const resumed = await page.evaluate(
    async ({ token: bearer, last }) => {
      const response = await fetch("/ui/events", { headers: { authorization: `Bearer ${bearer}`, "last-event-id": String(last) } });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = "";
      const deadline = Date.now() + 3000;
      while (reader !== undefined && Date.now() < deadline && !text.includes('"type":"audit"')) {
        const chunk = await Promise.race([reader.read(), new Promise<{ done: true; value: undefined }>((resolve) => setTimeout(() => resolve({ done: true, value: undefined }), 500))]);
        if (chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
      }
      await reader?.cancel();
      return { status: response.status, ids: [...text.matchAll(/^id: (\d+)$/gm)].map((match) => Number(match[1])) };
    },
    { token, last: lastId },
  );
  expect(resumed.status).toBe(200);
  expect(resumed.ids.length).toBeGreaterThan(0);
  for (const id of resumed.ids) expect(id).toBeGreaterThan(lastId);

  expect(unknownViolations(await seen.violations())).toEqual([]);
  expect(seen.external()).toEqual([]);
});

test("the stream refuses a page without a token and a stale resume point", async ({ page }) => {
  owned = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  const daemon = owned;
  const link = await daemon.waitForLink(1);
  await observe(page, { target: "cockpit" });
  await page.goto(link.url);
  const token = await pagePairedToken(page);
  const outcome = await page.evaluate(async (bearerToken) => {
    const anonymous = await fetch("/ui/events");
    const token = bearerToken;
    const stale = await fetch("/ui/events", { headers: { authorization: `Bearer ${token}`, "last-event-id": "987654321" } });
    const staleBody = (await stale.json()) as { error: { code: string; details?: { reason?: string } } };
    return { anonymous: anonymous.status, stale: stale.status, code: staleBody.error.code, reason: staleBody.error.details?.reason };
  }, token);
  expect(outcome).toEqual({ anonymous: 401, stale: 422, code: "precondition_failed", reason: "resume_gap" });
});
