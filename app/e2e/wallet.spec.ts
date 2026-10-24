import { WALLET_RELAY_ORIGINS } from "../headers.config";
import { expect, test } from "./support/fixtures";
import { unknownViolations } from "./support/known-issues";
import { observe } from "./support/world";

// Connecting a wallet in a real browser, under the standalone build's real CSP and Trusted Types:
//   - a browser wallet announced the EIP-6963 way (a stand-in provider the test injects; no extension is involved);
//   - WalletConnect: the sign-client chunk loads from the page's own origin, starts, opens its one WebSocket to the
//     relay the CSP lists, and mints a pairing link shown as a QR and as text. The relay is answered by the test
//     (page.routeWebSocket), so nothing leaves this machine and no wallet is ever paired.
// Both runs must raise no securitypolicyviolation event, no uncaught error and no request outside the CSP.

const RELAY = WALLET_RELAY_ORIGINS[0]?.origin ?? "";
const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// The stand-in wallet: answers requestProvider with one announcement whose provider shares one account on Polygon.
const FAKE_WALLET = `(() => {
  const provider = {
    calls: [],
    async request({ method }) {
      provider.calls.push(method);
      if (method === "eth_requestAccounts" || method === "eth_accounts") return ["${ADDRESS}"];
      if (method === "eth_chainId") return "0x89";
      throw Object.assign(new Error("unsupported in the test wallet"), { code: 4200 });
    },
    on() {},
    removeListener() {},
  };
  window.__testWallet = provider;
  const info = Object.freeze({ uuid: "6f1c4a52-3d1e-4f6b-9a0e-2b7c5d8e9f01", name: "E2E Wallet", rdns: "test.e2e.wallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxMCcgaGVpZ2h0PScxMCcvPg==" });
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  });
})();`;

test("standalone: a browser wallet announced through EIP-6963 connects, and the chip shows it, with a clean CSP", async ({ page, standalone }) => {
  const seen = await observe(page, { target: "standalone" });
  await page.context().addInitScript(FAKE_WALLET);
  await page.goto(`${standalone.url}#/`);
  await expect(page.locator("h1")).toBeVisible();
  // Discovery asked the wallet for nothing.
  expect(await page.evaluate(() => (window as unknown as { __testWallet: { calls: string[] } }).__testWallet.calls)).toEqual([]);

  await page.locator("button.ui-wallet-chip:not(.ac-chip)").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab", { name: "Browser wallet" })).toHaveAttribute("aria-selected", "true");
  const wallet = dialog.getByRole("button", { name: "E2E Wallet" });
  await expect(wallet).toBeVisible();
  await expect(wallet.locator("img")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
  await wallet.click();

  await expect(page.locator("button.ui-wallet-chip:not(.ac-chip)")).toHaveAttribute("data-connected", "injected");
  await expect(page.locator("button.ui-wallet-chip:not(.ac-chip)")).toContainText("0xf39F…2266");
  await expect(dialog.locator('[data-kind="connected"]')).toContainText(ADDRESS);
  await dialog.locator('button[data-action="not-now"]').click();
  await page.locator('button[data-action="chip-disconnect"]').click();
  await expect(page.locator("button.ui-wallet-chip:not(.ac-chip)")).not.toHaveAttribute("data-connected", /.+/);

  expect(unknownViolations(await seen.violations()), "securitypolicyviolation events").toEqual([]);
  expect(seen.pageErrors(), "uncaught errors").toEqual([]);
  expect(seen.external().filter((entry) => entry.outcome === "refused"), "nothing outside the CSP was attempted").toEqual([]);
});

test("standalone: WalletConnect loads on demand, reaches only the listed relay, and shows a pairing link as a QR and as text", async ({ page, standalone }) => {
  const seen = await observe(page, { target: "standalone" });
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  const relayMessages: string[] = [];
  // The relay, answered here: every JSON-RPC request gets a success (a subscription id for a subscribe).
  const routed: string[] = [];
  await page.routeWebSocket((url) => url.origin === RELAY, (socket) => {
    routed.push(socket.url());
    socket.onMessage((message) => {
      const text = typeof message === "string" ? message : message.toString("utf8");
      relayMessages.push(text);
      const request = JSON.parse(text) as { id: number; method?: string; params?: { topics?: string[] } };
      if (request.method === undefined) return;
      const result = /batchSubscribe$/.test(request.method) ? (request.params?.topics ?? []).map(() => "d".repeat(64)) : /subscribe$/i.test(request.method) && !/unsubscribe$/i.test(request.method) ? "d".repeat(64) : true;
      socket.send(JSON.stringify({ id: request.id, jsonrpc: "2.0", result }));
    });
  });
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
  });

  await page.goto(`${standalone.url}#/`);
  await expect(page.locator("h1")).toBeVisible();
  const before = scripts.length;
  expect(sockets).toEqual([]);

  await page.locator("button.ui-wallet-chip:not(.ac-chip)").click();
  const dialog = page.getByRole("dialog");
  // No browser wallet in this browser: the modal opens on WalletConnect.
  await expect(dialog.getByRole("tab", { name: "WalletConnect (PayBox, phone wallets)" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog).toContainText("send transactions, or sign anything on chain 3223 (XO)");
  await dialog.locator('button[data-action="walletconnect-start"]').click();

  const link = dialog.locator('[data-kind="pairing-link"]');
  await expect(link).toHaveText(/^wc:[0-9a-f]{64}@2\?/, { timeout: 15_000 });
  const uri = (await link.textContent()) ?? "";
  // The library came as a separate chunk from this page's origin, only now.
  expect(scripts.length).toBeGreaterThan(before);
  // Every socket the page opened went to the relay (answered by the route above, never the real one).
  expect(routed.length).toBeGreaterThan(0);
  for (const url of [...routed, ...sockets]) expect(new URL(url).origin).toBe(RELAY);
  expect(relayMessages.some((text) => text.includes("subscribe"))).toBe(true);

  // The QR is painted: dark modules on a light ground.
  const painted = await dialog.locator("canvas.wl-qr").evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d");
    if (context === null) return { dark: 0, light: 0 };
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    let light = 0;
    for (let index = 0; index < data.length; index += 4) {
      if ((data[index] ?? 0) < 20) dark += 1;
      else if ((data[index] ?? 0) > 235) light += 1;
    }
    return { dark, light };
  });
  expect(painted.dark).toBeGreaterThan(500);
  expect(painted.light).toBeGreaterThan(painted.dark);

  const open = dialog.locator('a[data-action="open-paybox"]');
  expect(new URL((await open.getAttribute("href")) ?? "").searchParams.get("uri")).toBe(uri);
  await expect(open).toHaveAttribute("target", "_blank");
  await dialog.locator('button[data-action="walletconnect-cancel"]').click();
  await expect(link).toHaveCount(0);

  expect(unknownViolations(await seen.violations()), "securitypolicyviolation events").toEqual([]);
  expect(seen.pageErrors(), "uncaught errors").toEqual([]);
  // No https request outside the CSP, and none to any WalletConnect host but the relay's socket.
  expect(seen.external().filter((entry) => entry.outcome === "refused"), "nothing outside the CSP was attempted").toEqual([]);
  for (const request of seen.requests()) expect(new URL(request.url).hostname).not.toMatch(/walletconnect/);
});

test("cockpit: WalletConnect is off and says why; nothing is loaded and no socket is opened", async ({ page, cockpitStatic }) => {
  const seen = await observe(page, { target: "cockpit" });
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  await page.goto(`${cockpitStatic.url}#/`);
  await page.locator("button.ui-wallet-chip:not(.ac-chip)").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "WalletConnect (PayBox, phone wallets)" }).click();
  await expect(dialog.locator('button[data-action="walletconnect-start"]')).toBeDisabled();
  await expect(dialog).toContainText("connect-src 'self'");
  expect(sockets).toEqual([]);
  expect(unknownViolations(await seen.violations())).toEqual([]);
  expect(seen.pageErrors()).toEqual([]);
});
