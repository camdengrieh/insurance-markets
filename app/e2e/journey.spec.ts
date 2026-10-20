import { startE2eDaemon, type E2eDaemon } from "../../bridge/test/e2e/harness";
import { DIST } from "./support/env";
import { expect, test } from "./support/fixtures";
import { unknownViolations } from "./support/known-issues";
import { pagePairedToken } from "./support/session";
import { observe, waitForMarkets } from "./support/world";

// A full read journey against the local mock XO, in a real browser, in both builds.
//
//   standalone: the page reads XO's Data API directly (the request is answered by the mock XO), lists, filters, opens a market,
//               shows its rules and its fee ceiling, and says "needs the Cockpit" where a browser cannot read.
//   cockpit:    the page pairs itself with the real daemon and reads the same data through the daemon's allowlisted proxy,
//               including the order book that only the daemon can fetch. The proxy's checks are driven with the page's own token;
//               the Markets screen is then driven as a person would.

let owned: E2eDaemon | undefined;
test.afterEach(async () => {
  await owned?.stop();
  owned = undefined;
});

test("standalone: list, filter, open a market, read its rules, see what a browser cannot read", async ({ page, standalone, daemon }) => {
  const seen = await observe(page, { target: "standalone", mock: daemon.mock });
  await page.goto(`${standalone.url}#/markets`);
  const shown = await waitForMarkets(page);
  expect(shown, "the mock's active markets (3 default, 13 hostile)").toBe(16);

  // The venue panel: XO read; the rest of this build's venues are down in the test world and say so, not "empty".
  const xo = page.locator("li.explorer-venue", { hasText: "XO Market" }).first();
  await expect(xo).toContainText("16 loaded");
  await expect(page.getByText("XO Market: needs the Cockpit")).toBeVisible();
  await expect(page.getByText(/different from an empty book/).first()).toBeVisible();
  await expect(page.getByText("Kalshi: off, restricted terms")).toBeVisible();
  await expect(page.getByText("Limitless: needs the Cockpit")).toBeVisible();
  await expect(page.getByText("Polymarket: The venue did not answer in time").or(page.getByText(/Polymarket: This venue is paused/))).toBeVisible();

  // The table: XO rows carry a display price, labelled as such, and no executable spread.
  const table = page.getByRole("table", { name: /Markets across the venues/ });
  await expect(table).toBeVisible();
  const row = table.getByRole("row", { name: /Mock market A \(CLOB, active\)/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("display price, not executable");
  await expect(row).toContainText("needs the Cockpit");
  await expect(row).not.toContainText(/book spread/i);

  // Filtering narrows the rows already loaded and sends nothing.
  const before = seen.requests().length;
  await page.getByRole("searchbox", { name: "Search titles" }).fill("Mock market B");
  await expect(table.getByRole("row", { name: /Mock market B/ })).toHaveCount(1);
  await expect(table.getByRole("row", { name: /Mock market A/ })).toHaveCount(0);
  expect(seen.requests().length, "typing sends nothing").toBe(before);
  await page.getByRole("button", { name: "Clear search" }).click();

  // Open a market from the list.
  await table.getByRole("link", { name: /Mock market A/ }).click();
  await expect(page).toHaveURL(/#\/market\/xo\/0x[0-9a-f]{64}$/);
  await expect(page.locator("h1")).toHaveText("Market");
  await expect(page.getByRole("heading", { name: /rules/i }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("This fee is a ceiling that has not been reconciled with a real fill.")).toBeVisible();
  await expect(page.getByText("XO Market: needs the Cockpit")).toBeVisible();
  await expect(page.getByText(/Rules fingerprint \(sha256/)).toBeVisible();
  await expect(page.getByText(/not an arbitrage|no links/i).first()).toBeVisible();

  // Over the whole journey: XO's host was answered by the mock, every other listed host was a stub, nothing outside the CSP.
  const external = seen.external();
  expect(external.some((entry) => entry.origin === "https://api-mainnet.xo.market" && entry.outcome === "mock-xo")).toBe(true);
  expect(external.filter((entry) => entry.outcome === "refused")).toEqual([]);
  expect(external.some((entry) => entry.origin === "https://orderbooks.xo.market"), "the standalone build never asks for XO's order book").toBe(false);
  expect(unknownViolations(await seen.violations())).toEqual([]);
  expect(seen.pageErrors()).toEqual([]);
});

test("cockpit: pair, then read the list, the rules and the order book through the daemon's proxy, equal to the mock's own answers", async ({ page }) => {
  owned = await startE2eDaemon({ appDir: DIST.cockpit });
  const daemon = owned;
  const link = await daemon.waitForLink(1);
  const seen = await observe(page, { target: "cockpit" });
  await page.goto(link.url);
  await expect(page.locator("h1")).toBeVisible();

  const pageToken = await pagePairedToken(page);
  const journey = await page.evaluate(async (pairedToken) => {
    const json = async (path: string, token: string | null, init: RequestInit = {}): Promise<{ status: number; body: unknown }> => {
      const reply = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...(token === null ? {} : { authorization: `Bearer ${token}` }) } });
      return { status: reply.status, body: await reply.json() };
    };
    const token = pairedToken;
    const list = await json("/ui/read/xo_data/api/markets?marketType=2,4&statuses=ACTIVE&take=50&page=1", token);
    const rows = ((list.body as { body: { data: { conditionId: string; title: string }[] } }).body.data);
    const first = rows.find((row) => row.title.startsWith("Mock market A"));
    const detail = await json(`/ui/read/xo_data/api/markets/contract/${first?.conditionId ?? ""}`, token);
    const tokenId = (detail.body as { body: { outcomes: { outcomeTokenId: string }[] } }).body.outcomes[0]?.outcomeTokenId ?? "";
    const book = await json(`/ui/read/xo_orderbook/book?token_id=${tokenId}`, token);
    const refused = await json("/ui/read/xo_orderbook/orders", token);
    const rpc = await json("/ui/read/xo_rpc/", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: ["0x00"] }) });
    return { list, detail, tokenId, book, refused: refused.status, rpc: rpc.status, conditionId: first?.conditionId ?? "" };
  }, pageToken);

  expect(link.code.length).toBe(32);
  expect(journey.list.status).toBe(200);
  expect(journey.detail.status).toBe(200);
  expect(journey.book.status).toBe(200);
  expect(journey.refused, "the signed-only orders route is not on the allowlist").toBe(403);
  expect(journey.rpc, "a JSON-RPC write method is refused").toBe(403);

  // Equal to what the mock itself serves (the mock's listeners are on loopback; this process reads them directly).
  const mock = daemon.mock;
  expect(mock).not.toBeNull();
  const direct = async (base: string, path: string): Promise<unknown> => (await fetch(`${base}${path}`)).json();
  expect((journey.list.body as { body: unknown }).body).toEqual(await direct(mock?.dataApi ?? "", "/api/markets?marketType=2,4&statuses=ACTIVE&take=50&page=1"));
  expect((journey.detail.body as { body: unknown }).body).toEqual(await direct(mock?.dataApi ?? "", `/api/markets/contract/${journey.conditionId}`));
  const bookBody = (journey.book.body as { body: unknown; service: string }).body;
  expect(bookBody).toEqual(await direct(mock?.orderbook ?? "", `/book?token_id=${journey.tokenId}`));
  expect((journey.book.body as { service: string }).service).toBe("xo_orderbook");

  // Every request the page made went to the daemon itself, under the cockpit CSP, with no violation.
  for (const request of seen.requests()) expect(new URL(request.url).origin).toBe(daemon.origin);
  expect(unknownViolations(await seen.violations())).toEqual([]);
  expect(seen.external()).toEqual([]);
  expect(daemon.blockedHosts(), "the daemon asked no host but the mock").toEqual([]);
});

test("cockpit UI: the paired page lists XO's markets through the proxy, and says what the other venues did", async ({ page }) => {
  owned = await startE2eDaemon({ appDir: DIST.cockpit });
  const daemon = owned;
  const link = await daemon.waitForLink(1);
  const seen = await observe(page, { target: "cockpit" });
  await page.goto(link.url);
  await pagePairedToken(page);
  await page.evaluate(() => {
    location.hash = "#/markets";
  });
  await expect(page.locator("h1")).toHaveText("Markets");
  const shown = await waitForMarkets(page);
  expect(shown, "XO's active markets, read through the daemon: 3 default and 13 hostile").toBeGreaterThanOrEqual(16);
  const table = page.getByRole("table", { name: /Markets across the venues/ });
  await expect(table.getByRole("row", { name: /Mock market A \(CLOB, active\)/ })).toHaveCount(1);
  // The venues the daemon cannot reach in the test world are named as failures; an empty list is never what a failure looks like.
  await expect(page.locator("li.explorer-venue", { hasText: "XO Market" }).first()).toContainText("loaded");
  expect(seen.pageErrors()).toEqual([]);
  expect(seen.external(), "the page itself reached no host but the daemon").toEqual([]);
  for (const request of seen.requests()) expect(new URL(request.url).origin).toBe(daemon.origin);
  expect(unknownViolations(await seen.violations())).toEqual([]);
});
