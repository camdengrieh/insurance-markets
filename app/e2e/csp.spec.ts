import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cspHeaderValue, securityHeaders } from "../headers.config";
import { startE2eDaemon } from "../../bridge/test/e2e/harness";
import { DIST } from "./support/env";
import { expect, test } from "./support/fixtures";
import { unknownViolations } from "./support/known-issues";
import { pagePairedToken } from "./support/session";
import { observe, waitForMarkets } from "./support/world";

// W0-3: a real browser loads each build under its real Content-Security-Policy and Trusted Types enforcement, and shows
// zero securitypolicyviolation events and no request to an origin outside the CSP, on every screen.

const CONDITION = `0x${"ab".repeat(32)}`;
const ROUTES: readonly { readonly name: string; readonly hash: string }[] = [
  { name: "overview", hash: "#/" },
  { name: "markets", hash: "#/markets" },
  { name: "portfolio", hash: "#/portfolio" },
  { name: "wallet", hash: "#/wallet" },
  { name: "signals", hash: "#/signals" },
  { name: "terminal", hash: "#/terminal" },
  { name: "trade", hash: "#/trade" },
  { name: "signing", hash: "#/signing" },
  { name: "a market page", hash: `#/market/xo/${CONDITION}` },
  { name: "an unknown route", hash: "#/nonexistent" },
];

test.describe("the CSP is enforced, so a clean load means something", () => {
  test("the built HTML carries no inline script, no inline style, no event handler and no remote asset", () => {
    for (const target of ["standalone", "cockpit"] as const) {
      const html = readFileSync(join(DIST[target], "index.html"), "utf8");
      expect(html, target).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
      expect(html, target).not.toMatch(/<style\b/i);
      expect(html, target).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html, target).not.toMatch(/\sstyle\s*=/i);
      expect(html, target).not.toMatch(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i);
    }
  });

  test("the standalone server sends the standalone CSP, and the browser enforces it, Trusted Types included", async ({ page, standalone }) => {
    const seen = await observe(page, { target: "standalone" });
    const response = await page.goto(standalone.url);
    expect(response?.headers()["content-security-policy"]).toBe(cspHeaderValue("standalone"));
    for (const pair of securityHeaders("standalone")) expect(response?.headers()[pair.key.toLowerCase()], pair.key).toBe(pair.value);
    // Positive control. The browser must refuse a string-to-HTML write, or a clean run below would prove nothing. (Code that
    // Playwright evaluates is exempt from script-src, so eval and Function are covered by the clean-load tests instead:
    // the page's own attempt would be reported as a violation.)
    const controls = await page.evaluate(() => {
      const outcome: Record<string, string> = {};
      try {
        document.body.innerHTML = "<b>x</b>";
        outcome["innerHTML"] = "allowed";
      } catch (error) {
        outcome["innerHTML"] = error instanceof TypeError ? "blocked" : "other";
      }
      outcome["trustedTypes"] = typeof (window as unknown as { trustedTypes?: unknown }).trustedTypes;
      return outcome;
    });
    expect(controls).toEqual({ innerHTML: "blocked", trustedTypes: "object" });
    expect((await seen.violations()).map((entry) => entry.directive)).toContain("require-trusted-types-for");
  });

  test("a request to an unlisted origin is refused and reported under the cockpit CSP (connect-src 'self')", async ({ page, cockpitStatic }) => {
    const seen = await observe(page, { target: "cockpit" });
    await page.goto(cockpitStatic.url);
    await page.waitForSelector("#root");
    const outcome = await page.evaluate(async () => {
      try {
        await fetch("https://api-mainnet.xo.market/api/markets");
        return "allowed";
      } catch {
        return "blocked";
      }
    });
    expect(outcome).toBe("blocked");
    expect((await seen.violations()).some((entry) => entry.directive === "connect-src")).toBe(true);
    expect(seen.external(), "the request never reached the network layer").toEqual([]);
  });
});

for (const target of ["standalone", "cockpit"] as const) {
  test.describe(`${target}: every screen loads clean`, () => {
    for (const route of ROUTES) {
      test(route.name, async ({ page, standalone, cockpitStatic, daemon }) => {
        const server = target === "standalone" ? standalone : cockpitStatic;
        const seen = await observe(page, { target, mock: daemon.mock });
        const response = await page.goto(`${server.url}${route.hash}`);
        expect(response?.headers()["content-security-policy"]).toBe(cspHeaderValue(target));
        await expect(page.locator("h1")).toBeVisible();
        if (route.hash === "#/markets" && target === "standalone") await waitForMarkets(page);
        else await page.waitForTimeout(600);

        expect(unknownViolations(await seen.violations()), "securitypolicyviolation events").toEqual([]);
        expect(seen.pageErrors(), "uncaught errors").toEqual([]);
        expect(
          seen.consoleErrors().filter((text) => /content security policy|trusted type|refused to/i.test(text) && !/Function\|/.test(text)),
          "CSP messages in the console",
        ).toEqual([]);

        const allowed = seen.allowedOrigins();
        for (const request of seen.requests()) {
          const url = new URL(request.url);
          if (url.protocol === "data:" || url.protocol === "blob:") continue;
          expect(url.origin === server.origin || allowed.has(url.origin), `request to ${url.origin} is outside the CSP`).toBe(true);
        }
        if (target === "cockpit") {
          expect(seen.external(), "the cockpit build never names a third-party host").toEqual([]);
        } else {
          expect(seen.external().filter((entry) => entry.outcome === "refused"), "nothing outside the CSP was attempted").toEqual([]);
          expect(seen.external().filter((entry) => entry.outcome === "continued")).toEqual([]);
        }
      });
    }
  });
}

test("the daemon serves the cockpit build under the same CSP and the page loads clean from it", async ({ page, daemon }) => {
  const seen = await observe(page, { target: "cockpit", mock: daemon.mock });
  const response = await page.goto(`${daemon.origin}/#/markets`);
  expect(response?.headers()["content-security-policy"]).toBe(cspHeaderValue("cockpit"));
  await expect(page.locator("h1")).toHaveText("Markets");
  await page.waitForTimeout(800);
  expect(unknownViolations(await seen.violations())).toEqual([]);
  expect(seen.pageErrors()).toEqual([]);
  expect(seen.external()).toEqual([]);
  for (const request of seen.requests()) expect(new URL(request.url).origin).toBe(daemon.origin);
});

// The screens that only exist with the daemon, opened by a paired page: the terminal and its prepare console, the trade screen and the
// signing inbox. They talk to the daemon over fetch (and an event stream) from the page's own origin, under Trusted Types.
test("a paired page opens the terminal, trade and signing screens clean, and the daemon's event stream runs under the CSP", async ({ page }) => {
  const owned = await startE2eDaemon({ appDir: DIST.cockpit, hostile: false });
  try {
    const link = await owned.waitForLink(1);
    const seen = await observe(page, { target: "cockpit" });
    await page.goto(link.url);
    await expect(page.locator("h1")).toBeVisible();
    await pagePairedToken(page);
    for (const hash of ["#/terminal", "#/trade", "#/signing"]) {
      await page.evaluate((next) => {
        location.hash = next;
      }, hash);
      await expect(page.locator("h1")).toHaveText(hash === "#/terminal" ? "Terminal" : hash === "#/trade" ? "Trade" : "Signing");
      await page.waitForTimeout(800);
    }
    expect(unknownViolations(await seen.violations()), "securitypolicyviolation events").toEqual([]);
    expect(seen.pageErrors()).toEqual([]);
    expect(seen.external()).toEqual([]);
    for (const request of seen.requests()) expect(new URL(request.url).origin).toBe(owned.origin);
  } finally {
    await owned.stop();
  }
});
