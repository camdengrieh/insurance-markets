import type { BrowserContext, Page, Request, Route } from "@playwright/test";

import { cspDirectives, type BuildTarget } from "../../headers.config";
import { hostileDetail } from "../../../bridge/test/e2e/corpus";
import type { MockUrls } from "../../../bridge/test/e2e/harness";

// The offline world a page runs in, and the instruments that watch it.
//
//   - Requests to 127.0.0.1 go where they say (the static servers and the daemon of the test).
//   - A request to any other host is intercepted before it can leave: XO's Data API host is answered from the local mock
//     XO, every other host the build's CSP lists is answered "503, offline" (as if that venue were down), and anything
//     else is refused. The browser cannot resolve those hosts anyway (HOST_RESOLVER_RULES).
//   - Every request, every securitypolicyviolation event, every console message and every page error is recorded, so a
//     test can assert on all of them: zero violations, no request to an origin outside the CSP.

export interface CspViolation {
  readonly directive: string;
  readonly blockedUri: string;
  readonly sourceFile: string;
  readonly sample: string;
  readonly disposition: string;
}

export interface Observed {
  readonly page: Page;
  // Every request the page and its frames made, in order.
  requests(): readonly { readonly url: string; readonly method: string; readonly type: string }[];
  // Requests to hosts other than 127.0.0.1, as {origin, outcome}.
  external(): readonly { readonly origin: string; readonly method: string; readonly outcome: "mock-xo" | "offline-stub" | "refused" | "continued" }[];
  // securitypolicyviolation events seen in the page (all documents, all navigations).
  violations(): Promise<readonly CspViolation[]>;
  consoleErrors(): readonly string[];
  pageErrors(): readonly string[];
  // The set of origins the page's CSP allows requests to for this target (self is the page's own origin).
  allowedOrigins(): ReadonlySet<string>;
}

export interface ObserveOptions {
  readonly target: BuildTarget;
  // The mock XO's loopback URLs; without them XO's Data API host is answered "offline" like any other.
  readonly mock?: MockUrls | null;
  // Rewrite XO market detail rows so their rules and sources are hostile (hostile.spec.ts).
  readonly hostileRules?: boolean;
  // Hosts a test lets through to the network layer (the rebinding spec's rebind.test, which the resolver maps to loopback).
  readonly continueHosts?: readonly string[];
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "access-control-max-age": "60",
} as const;

const XO_DATA_HOST = "api-mainnet.xo.market";

export function allowedConnectOrigins(target: BuildTarget): ReadonlySet<string> {
  const connect = cspDirectives(target)["connect-src"] ?? [];
  return new Set(connect.filter((entry) => entry.startsWith("https://")));
}

const INIT = `(() => {
  const found = [];
  window.__cspViolations = found;
  document.addEventListener("securitypolicyviolation", (event) => {
    found.push({
      directive: event.effectiveDirective || event.violatedDirective || "",
      blockedUri: event.blockedURI || "",
      sourceFile: event.sourceFile || "",
      sample: event.sample || "",
      disposition: event.disposition || "",
    });
  });
})();`;

async function answerFromMock(route: Route, request: Request, mock: MockUrls, hostileRules: boolean): Promise<void> {
  const url = new URL(request.url());
  const upstream = `${mock.dataApi}${url.pathname}${url.search}`;
  let response: Response;
  try {
    response = await fetch(upstream, { headers: { accept: "application/json" } });
  } catch {
    return void (await route.fulfill({ status: 502, headers: CORS, contentType: "application/json", body: '{"error":"mock unavailable"}' }));
  }
  let text = await response.text();
  if (hostileRules && /^\/api\/markets\/contract\/0x[0-9a-f]{64}$/.test(url.pathname) && response.status === 200) {
    const row = JSON.parse(text) as Record<string, unknown>;
    const index = Number(BigInt(`0x${url.pathname.slice(-8)}`) % 13n);
    text = JSON.stringify(hostileDetail(row, index));
  }
  await route.fulfill({ status: response.status, headers: { ...CORS, "cache-control": "no-store" }, contentType: "application/json", body: text });
}

export async function observe(page: Page, options: ObserveOptions): Promise<Observed> {
  const context: BrowserContext = page.context();
  const allowed = allowedConnectOrigins(options.target);
  const requests: { url: string; method: string; type: string }[] = [];
  const external: { origin: string; method: string; outcome: "mock-xo" | "offline-stub" | "refused" | "continued" }[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  await context.addInitScript(INIT);
  page.on("request", (request) => requests.push({ url: request.url(), method: request.method(), type: request.resourceType() }));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await context.route(
    (url) => url.hostname !== "127.0.0.1",
    async (route, request) => {
      const url = new URL(request.url());
      const record = (outcome: "mock-xo" | "offline-stub" | "refused" | "continued"): void => void external.push({ origin: url.origin, method: request.method(), outcome });
      if ((options.continueHosts ?? []).includes(url.hostname)) {
        record("continued");
        return void (await route.continue());
      }
      if (url.protocol !== "https:" || !allowed.has(url.origin)) {
        record("refused");
        return void (await route.abort("blockedbyclient"));
      }
      if (request.method() === "OPTIONS") {
        record("offline-stub");
        return void (await route.fulfill({ status: 204, headers: CORS }));
      }
      if (url.hostname === XO_DATA_HOST && options.mock !== undefined && options.mock !== null) {
        record("mock-xo");
        return void (await answerFromMock(route, request, options.mock, options.hostileRules === true));
      }
      record("offline-stub");
      await route.fulfill({ status: 503, headers: CORS, contentType: "application/json", body: '{"error":"offline in the test world"}' });
    },
  );

  return {
    page,
    requests: () => [...requests],
    external: () => [...external],
    violations: async () => {
      try {
        return (await page.evaluate(() => (window as unknown as { __cspViolations?: unknown[] }).__cspViolations ?? [])) as CspViolation[];
      } catch {
        return [];
      }
    },
    consoleErrors: () => [...consoleErrors],
    pageErrors: () => [...pageErrors],
    allowedOrigins: () => allowed,
  };
}

// Waits until the explorer has finished its first round of reads: the count line stops saying "Loading" and says how many rows
// are shown. Returns that number.
export async function waitForMarkets(page: Page): Promise<number> {
  const count = page.getByTestId("explorer-count");
  await count.waitFor({ state: "visible" });
  await page.waitForFunction(
    () => /^\d+ markets? shown/.test(document.querySelector('[data-testid="explorer-count"]')?.textContent ?? ""),
    undefined,
    { timeout: 20_000 },
  );
  const text = (await count.textContent()) ?? "";
  return Number(/^(\d+)/.exec(text)?.[1] ?? "0");
}

// The venue panel (which venues were read, which could not be, and why) is folded under the table in a disclosure that
// opens on its own only when a venue failed. Opens it when it is closed, so a test can read the tiles.
export async function openVenuePanel(page: Page): Promise<void> {
  const summary = page.locator("details.ui-disclosure > summary", { hasText: /^Venues:/ });
  await summary.waitFor({ state: "visible" });
  const open = await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open);
  if (!open) await summary.click();
}
