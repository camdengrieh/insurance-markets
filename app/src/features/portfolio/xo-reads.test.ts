import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { fakeNetwork, manualClock, type GetRoute } from "../wallet/testkit";
import { NOW } from "./fixtures";
import { XO_PORTFOLIO_SCOPES, orderbookUrl, portfolioUrl, readXoAccount } from "./xo-reads";

// The XO reads. No populated XO answer was ever captured (a funded account is a real person's wallet, and none is
// looked up), so the tests here use the recorded answers for an address with nothing and inline error cases.

const FIXTURES = new URL("../../../../test/fixtures/xo/", import.meta.url);
const fixture = (name: string): Record<string, unknown> => JSON.parse(readFileSync(new URL(name, FIXTURES), "utf8")) as Record<string, unknown>;
const ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d";
const DATA = "api-mainnet.xo.market/api/users/portfolio";
const BOOK = "orderbooks.xo.market";

function setup(routes: Record<string, GetRoute>, cockpit = false) {
  const net = fakeNetwork({ get: routes });
  const deps = { fetch: net.fetch, nowMs: manualClock(NOW).nowMs };
  return { net, read: () => readXoAccount(deps, { bindingId: "b1", account: ACCOUNT, cockpit }) };
}

const noProfile = fixture("data-error-404-user-portfolio.json");
const portfolioRoute = (body: unknown = noProfile): GetRoute => () => ({ status: 404, body });

describe("URLs", () => {
  it("ask for the derived account in each scope, with a page size, and nothing else", () => {
    const url = new URL(portfolioUrl(ACCOUNT, "onlyClob", 2));
    expect(url.origin).toBe("https://api-mainnet.xo.market");
    expect(url.pathname).toBe("/api/users/portfolio");
    expect(Object.fromEntries(url.searchParams)).toEqual({ user: ACCOUNT, take: "50", page: "2", marketScope: "onlyClob" });
    expect(XO_PORTFOLIO_SCOPES).toEqual(["onlyClob", "withPulse"]);
    expect(orderbookUrl("/positions", ACCOUNT)).toBe(`https://orderbooks.xo.market/positions?address=${ACCOUNT}`);
  });
});

describe("standalone build (Data API only)", () => {
  it("a 404 means XO has no profile for the account: an answer with no rows, not an error", async () => {
    const { read } = setup({ [DATA]: portfolioRoute() });
    const result = await read();
    expect(result.rows).toEqual([]);
    expect(result.profile).toBe("none");
  });

  it("every scope failing fails the whole read", async () => {
    const { read } = setup({ [DATA]: () => ({ status: 500 }) });
    await expect(read()).rejects.toBeDefined();
  });
});

describe("Cockpit build (adds the order book reads)", () => {
  it("reads the recorded answers for an address with nothing: no rows, a cash balance of zero, no profile", async () => {
    const { read } = setup(
      {
        [DATA]: portfolioRoute(),
        [`${BOOK}/positions`]: () => ({ body: fixture("orderbook-positions-dummy-address.json") }),
        [`${BOOK}/claimable`]: () => ({ body: fixture("orderbook-claimable-dummy-address.json") }),
      },
      true,
    );
    const result = await read();
    expect(result.rows).toEqual([]);
    expect(result.profile).toBe("none");
    expect(result.cash).not.toBeNull();
  });
});
