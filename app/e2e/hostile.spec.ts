import { HOSTILE_CASES } from "../../bridge/test/e2e/corpus";
import { expect, test } from "./support/fixtures";
import { domProblems, isClean } from "./support/inert";
import { observe, waitForMarkets } from "./support/world";

// M0-3 and M1-9: a market whose title, rules, description and sources are hostile renders as inert text, in both builds,
// with and without the Content-Security-Policy. The CSP-free run is the point: the page must not depend on the policy to be safe.

for (const variant of ["with the CSP", "with no security headers at all"] as const) {
  test.describe(`standalone build ${variant}`, () => {
    test("the market list shows every hostile title as text and creates no element, handler or link from it", async ({ page, standalone, standaloneNoHeaders, daemon }) => {
      const server = variant === "with the CSP" ? standalone : standaloneNoHeaders;
      const seen = await observe(page, { target: "standalone", mock: daemon.mock, hostileRules: true });
      await page.goto(`${server.url}#/markets`);
      const shown = await waitForMarkets(page);
      expect(shown, "the hostile rows are listed").toBeGreaterThanOrEqual(HOSTILE_CASES.length);

      const problems = await domProblems(page);
      expect(problems, JSON.stringify(problems)).toMatchObject({ eventHandlerAttributes: [], dangerousElements: [], foreignAnchors: [], dangerousUrls: [], markupOutsideSlots: [], activeForms: [], probeSet: false });
      // The text is there, as text: the prompt-injection title is shown verbatim, in the untrusted slot.
      const injection = HOSTILE_CASES.find((item) => item.id === "prompt-injection");
      expect(injection).toBeDefined();
      await expect(page.getByText(injection?.title ?? "", { exact: false }).first()).toBeVisible();
      // Nothing the payloads asked for happened on the network.
      for (const request of seen.requests()) expect(request.url, "request caused by market text").not.toMatch(/evil\.example|exfil|javascript:/i);
      expect(seen.external().filter((entry) => entry.outcome === "refused")).toEqual([]);
      expect(seen.pageErrors()).toEqual([]);
    });

    test("every hostile market page shows its rules, description and sources as inert text", async ({ page, standalone, standaloneNoHeaders, daemon }) => {
      const server = variant === "with the CSP" ? standalone : standaloneNoHeaders;
      const seen = await observe(page, { target: "standalone", mock: daemon.mock, hostileRules: true });
      expect(daemon.hostile.length).toBe(HOSTILE_CASES.length);
      for (const market of daemon.hostile) {
        await page.goto(`${server.url}#/market/xo/${market.conditionId}`);
        // A cold load of a market address shows the Markets surface (its h1 is the hero band's) with the modal open
        // over it; the rules section only exists once the detail read succeeded.
        await expect(page.locator("h1")).toHaveText("Markets");
        await expect(page.getByRole("dialog", { name: "Market" }).getByRole("heading", { name: /rules/i }).first()).toBeVisible({ timeout: 15_000 });
        await page.waitForTimeout(150);
        const problems = await domProblems(page);
        expect(problems, `${market.id}: ${JSON.stringify(problems)}`).toMatchObject({ eventHandlerAttributes: [], dangerousElements: [], foreignAnchors: [], dangerousUrls: [], markupOutsideSlots: [], activeForms: [], probeSet: false });
      }
      for (const request of seen.requests()) expect(request.url).not.toMatch(/evil\.example|exfil|javascript:/i);
      expect(seen.external().filter((entry) => entry.outcome === "refused")).toEqual([]);
      expect(seen.pageErrors()).toEqual([]);
    });
  });
}

test("payload markup is visible as literal text inside the untrusted slot, and a hostile source is never a link", async ({ page, standalone, daemon }) => {
  await observe(page, { target: "standalone", mock: daemon.mock, hostileRules: true });
  const market = daemon.hostile.find((item) => item.id === "img-onerror");
  expect(market).toBeDefined();
  await page.goto(`${standalone.url}#/market/xo/${market?.conditionId ?? ""}`);
  const modal = page.getByRole("dialog", { name: "Market" });
  await expect(modal.getByRole("heading", { name: /rules/i }).first()).toBeVisible({ timeout: 15_000 });
  // The payload is on the page as characters (so a reader sees what the creator wrote) and nowhere as an element. The
  // page's own decorative SVGs (tile glyphs, dither bars, the scrim) are aria-hidden and carry no script or link.
  const slotText = (await page.locator("[data-trust], .ui-untrusted-block").allInnerTexts()).join("\n");
  expect(slotText).toContain("<img src=x onerror=");
  expect(await page.locator("main img, main script, main iframe, [role='dialog'] img, [role='dialog'] script, [role='dialog'] iframe").count()).toBe(0);
  expect(await page.locator("main svg:not([aria-hidden='true']), [role='dialog'] svg:not([aria-hidden='true'])").count()).toBe(0);
  // The one legitimate https source is shown as text; the javascript:, data: and http: ones are not links, and neither is it.
  expect(await page.locator("main a:not([href^='#']), [role='dialog'] a:not([href^='#'])").count()).toBe(0);
  expect(await page.getByText("3 resolution source(s) were not plain https links and were left out").count()).toBe(1);
  expect((await domProblems(page)).probeSet).toBe(false);
});

// The control for everything above: the same check, run on a page that really does contain hostile markup, must fail. Only the
// header-less server allows the injection; under the CSP the browser refuses the write.
test("the inertness check has teeth: markup written into the DOM is reported", async ({ page, standaloneNoHeaders }) => {
  await observe(page, { target: "standalone" });
  await page.goto(standaloneNoHeaders.url);
  await expect(page.locator("h1")).toBeVisible();
  expect(isClean(await domProblems(page))).toBe(true);
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div><img src="x" onerror="window.__pwned=1"><a href="javascript:window.__pwned=2">x</a><iframe srcdoc="y"></iframe><form action="/x"></form></div>',
    );
    (window as unknown as { __pwned: number }).__pwned = 3;
  });
  const problems = await domProblems(page);
  expect(isClean(problems)).toBe(false);
  expect(problems.eventHandlerAttributes).toContain("img[onerror]");
  expect(problems.dangerousElements).toEqual(expect.arrayContaining(["img", "iframe"]));
  expect(problems.foreignAnchors).toContain("javascript:window.__pwned=2");
  expect(problems.dangerousUrls.length).toBeGreaterThan(0);
  expect(problems.activeForms).toContain("form[action]");
  expect(problems.probeSet).toBe(true);
});
