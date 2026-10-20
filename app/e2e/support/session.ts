import type { Page } from "@playwright/test";

// The Cockpit page pairs itself at load (app/src/session.ts): it exchanges the code in its #pair= fragment for a ui token and
// keeps that token in sessionStorage for the tab. These helpers read what the page holds, so a test can use the page's own
// session instead of playing the client with a second exchange (a code is single use).

export const SESSION_KEY = "xo-cockpit.ui-session";

export async function pagePairedToken(page: Page): Promise<string> {
  await page.waitForFunction((key) => sessionStorage.getItem(key) !== null, SESSION_KEY, { timeout: 15_000 });
  return page.evaluate((key) => sessionStorage.getItem(key) ?? "", SESSION_KEY);
}
