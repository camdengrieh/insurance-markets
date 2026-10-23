import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BROWSER_DIRECT_ORIGINS, DAEMON_ONLY_ORIGINS, READ_SERVICES, type ReadService } from "../../../app/headers.config.js";
import {
  HYPERLIQUID_INFO_TYPES,
  MAX_CLOB_BATCH,
  MAX_RPC_BATCH,
  RESTRICTED_SERVICES,
  SERVICE_ORIGINS,
  decide,
  isRestrictedService,
  originOf,
  routesOf,
  type Allowed,
  type RequestInput,
} from "../../allowlist.js";
import { JSON_RPC_READ_METHODS } from "../../contract.js";
import { seededRandom } from "../server/helpers.js";

const CID = `0x${"ab".repeat(32)}`;
const ADDR = `0x${"cd".repeat(20)}`;
const TOKEN = "74611051635435493013469257818411865069553882173471237703549469284847187679089";

function get(service: string, path: string, query = ""): ReturnType<typeof decide> {
  return decide({ service, method: "GET", path, query });
}
function post(service: string, path: string, body: unknown, query = ""): ReturnType<typeof decide> {
  return decide({ service, method: "POST", path, query, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function allowed(verdict: ReturnType<typeof decide>): Allowed {
  assert.equal(verdict.ok, true, verdict.ok ? "" : `${verdict.code}: ${verdict.message}`);
  if (!verdict.ok) throw new Error("unreachable");
  return verdict.allowed;
}
function refusedWith(verdict: ReturnType<typeof decide>, code: string): void {
  assert.equal(verdict.ok, false, "expected a refusal");
  if (!verdict.ok) assert.equal(verdict.code, code, verdict.message);
}
const rpc = (method: string, params: unknown[] = [], id: number | string = 1): Record<string, unknown> => ({ jsonrpc: "2.0", id, method, params });

describe("hosts come from headers.config.ts", () => {
  it("gives every read service one https origin without a port, path or credentials", () => {
    for (const service of READ_SERVICES) {
      const origin = originOf(service);
      assert.ok(origin !== undefined, `${service} has no origin`);
      const url = new URL(origin);
      assert.equal(url.protocol, "https:");
      assert.equal(url.origin, origin, `${service} origin is not a bare origin`);
      assert.equal(url.port, "");
      // Every venue service has a daemon route table; our own markets API is reached by the hosted page only.
      if (service !== "markets_api") assert.ok(routesOf(service).length > 0, `${service} has no route table`);
    }
  });

  it("is exactly the browser-direct and daemon-only lists, nothing more", () => {
    const expected = new Map<string, string>();
    for (const entry of BROWSER_DIRECT_ORIGINS) expected.set(entry.service, entry.origin);
    for (const entry of DAEMON_ONLY_ORIGINS) if (entry.service !== null) expected.set(entry.service, entry.origin);
    assert.deepEqual(Object.fromEntries(Object.entries(SERVICE_ORIGINS)), Object.fromEntries(expected));
    assert.deepEqual([...expected.keys()].sort(), [...READ_SERVICES].sort());
  });

  it("never lists the bundler or a PayBox host, which are not read services", () => {
    const origins = Object.values(SERVICE_ORIGINS).join(" ");
    assert.doesNotMatch(origins, /bundler|paybox|trueo\.com/);
  });

  it("sends only to the service's own host, whatever the path looks like (seeded fuzz)", () => {
    const random = seededRandom("allowlist-fuzz");
    const pieces = ["api", "markets", "contract", "..", ".", "%2e%2e", "%2f", "%5c", "@evil.example", "evil.example", "", "\\", "v2", "positions", CID, ADDR, "0", "info", "book", "//", "%00"];
    const corpus: Array<[ReadService, string]> = [
      ["xo_data", `/api/markets/contract/${CID}`],
      ["xo_data", "/api/markets"],
      ["xo_orderbook", "/book"],
      ["polymarket_data", "/v2/positions"],
      ["polymarket_gamma", "/markets/slug/abc"],
      ["pascal", "/api/v1/markets"],
      ["xo_explorer", `/api/v2/addresses/${ADDR}`],
      ["novig", "/v3/public/catalog/events"],
      ["kalshi", "/trade-api/v2/markets/ABC"],
    ];
    let accepted = 0;
    let refused = 0;
    for (let round = 0; round < 1200; round += 1) {
      const bytes = random(6);
      const [service, base] = corpus[(bytes[0] ?? 0) % corpus.length] as [ReadService, string];
      const segments = base.slice(1).split("/");
      const mode = (bytes[1] ?? 0) % 4;
      const piece = pieces[(bytes[2] ?? 0) % pieces.length] as string;
      const at = (bytes[3] ?? 0) % segments.length;
      if (mode === 1) segments[at] = piece;
      else if (mode === 2) segments.splice(at, 0, piece);
      else if (mode === 3) segments.push(piece);
      const path = `/${segments.join("/")}`;
      const verdict = decide({ service, method: "GET", path, query: "" });
      if (!verdict.ok) {
        refused += 1;
        continue;
      }
      accepted += 1;
      const url = new URL(verdict.allowed.url);
      assert.equal(url.origin, originOf(service));
      assert.equal(url.pathname, path);
      assert.equal(url.username, "");
    }
    assert.ok(accepted > 100 && refused > 100, `the fuzz must exercise both outcomes (accepted ${accepted}, refused ${refused})`);
  });
});

describe("what each adapter requests is allowed", () => {
  const cases: Array<[string, string, string, string]> = [
    // XO (app/src/venues/xo/urls.ts and src/xo/client.ts)
    ["xo_data", "GET", "/api/markets", "marketType=2,4&statuses=ACTIVE&take=20&page=1"],
    ["xo_data", "GET", `/api/markets/contract/${CID}`, ""],
    ["xo_data", "GET", "/api/users/portfolio", `user=${ADDR}&take=20&page=1`],
    ["xo_orderbook", "GET", "/book", `token_id=${TOKEN}`],
    ["xo_orderbook", "GET", "/fee-rate", `token_id=${TOKEN}`],
    ["xo_orderbook", "GET", "/trading-state", ""],
    ["xo_orderbook", "GET", `/markets/${CID}`, ""],
    ["xo_orderbook", "GET", "/positions", `address=${ADDR}`],
    ["xo_explorer", "GET", "/api", `module=logs&action=getLogs&address=${ADDR}`],
    ["xo_explorer", "GET", `/api/v2/addresses/${ADDR}/token-balances`, ""],
    // Polymarket (sdk/venues/polymarket/adapter.ts)
    ["polymarket_gamma", "GET", "/public-search", "q=arsenal&limit_per_type=5"],
    ["polymarket_gamma", "GET", "/markets/keyset", "closed=false&limit=20&after_cursor=abc"],
    ["polymarket_gamma", "GET", "/markets/slug/will-it-rain-2026", ""],
    ["polymarket_gamma", "GET", "/markets/12345", ""],
    ["polymarket_gamma", "GET", "/public-profile", `address=${ADDR}`],
    ["polymarket_clob", "GET", "/book", `token_id=${TOKEN}`],
    ["polymarket_clob", "GET", "/time", ""],
    ["polymarket_data", "GET", "/v2/positions", `user=${ADDR}&limit=50`],
    ["polymarket_data", "GET", "/v2/tokens", `condition=${CID}`],
    // Manifold, Pascal
    ["manifold", "GET", "/v0/search-markets", "term=&limit=20&filter=open&contractType=BINARY"],
    ["manifold", "GET", "/v0/market/ulm6rrplx5", ""],
    ["pascal", "GET", "/api/v1/markets", ""],
    ["pascal", "GET", "/api/v1/books", "symbols=HOUSE,CUBE"],
    ["pascal", "GET", "/api/v1/accounts/9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", ""],
    // The daemon-only venues
    ["limitless", "GET", "/markets/active", ""],
    ["limitless", "GET", `/portfolio/${ADDR}/positions`, ""],
    ["kalshi", "GET", "/trade-api/v2/markets", "status=open&limit=100"],
    ["kalshi", "GET", "/trade-api/v2/markets/KXHIGHNY-26OCT19-T70/orderbook", "depth=20"],
    ["quotient", "GET", "/api/public/performance", ""],
    ["quotient", "GET", "/api/public/forecast-availability", "market_key=polymarket:123"],
    ["quotient", "GET", "/api/v1/markets/mispriced", "venue=polymarket&min_spread=0.05"],
    ["novig", "GET", "/v3/public/catalog/events", ""],
    ["gemini", "GET", "/v1/prediction-markets/events", "status=active&limit=3"],
    ["defillama", "GET", "/protocols", ""],
    ["polymarket_us", "GET", "/v1/markets", "limit=10"],
  ];
  for (const [service, method, path, query] of cases) {
    it(`${method} ${service} ${path}`, () => {
      const result = allowed(decide({ service, method, path, query }));
      assert.equal(result.url, `${originOf(service as ReadService)}${path}${query === "" ? "" : `?${query}`}`);
      assert.equal(result.method, "GET");
      assert.equal(result.restricted, RESTRICTED_SERVICES.includes(service as ReadService));
    });
  }

  it("allows the Hyperliquid and chain reads the adapters send", () => {
    allowed(post("hyperliquid_info", "/info", { type: "outcomeMeta" }));
    allowed(post("hyperliquid_info", "/info", { type: "allMids" }));
    allowed(post("hyperliquid_info", "/info", { type: "l2Book", coin: "#150" }));
    allowed(post("hyperliquid_info", "/info", { type: "settledOutcome", outcome: 7 }));
    allowed(post("rpc_base", "/", [rpc("eth_call", [{ to: ADDR, data: "0x" }, "latest"]), rpc("eth_getLogs", [{ fromBlock: "0x1" }], 2)]));
    allowed(post("xo_rpc", "/", rpc("eth_getCode", [ADDR, "latest"])));
    allowed(post("hyperliquid_rpc", "/evm", rpc("eth_chainId")));
  });
});

describe("refusals (M1-3)", () => {
  it("refuses a service that is not in READ_SERVICES, or is spelled oddly", () => {
    for (const service of ["", "evil", "XO_DATA", "xo_data ", "xo_data/../x", "paybox", "xo_bundler", "constructor", "__proto__", "toString"]) {
      refusedWith(get(service, "/api/markets"), "service_not_allowed");
    }
  });

  it("refuses paths that are not listed for the service", () => {
    const paths: Array<[string, string]> = [
      ["xo_orderbook", "/orders"], // needs the L2 HMAC triplet
      ["xo_orderbook", "/trades"],
      ["xo_orderbook", "/"],
      ["xo_data", "/api"],
      ["xo_data", "/api/markets/contract/0x12"], // not a 32-byte id
      ["xo_data", "/api/admin"],
      ["kalshi", "/trade-api/v2/portfolio/positions"], // signed
      ["kalshi", "/trade-api/v2/portfolio/orders"],
      ["kalshi", "/trade-api/v2/exchange/anything"],
      ["kalshi", "/trade-api/v1/markets"],
      ["limitless", "/markets/some-slug/user-orders"], // HMAC token
      ["quotient", "/api/v1/portfolio"], // takes the user's wallet
      ["quotient", "/api/v1/wallets/link"],
      ["quotient", "/api/auth/forecast-requests"],
      ["novig", "/v3/account/positions"], // a trading key that can place orders
      ["novig", "/v3/public"],
      ["polymarket_gamma", "/events"],
      ["polymarket_data", "/v1/positions"], // v1 retires 2026-10-24
      ["polymarket_clob", "/order"],
      ["polymarket_clob", "/orders"],
      ["manifold", "/v0/bet"],
      ["pascal", "/api/v1/accounts"],
      ["pascal", "/api/v1/accounts/not-a-pubkey"],
      ["defillama", "/protocols/anything"],
      ["rpc_base", "/anything"],
      ["hyperliquid_info", "/exchange"],
      ["hyperliquid_rpc", "/other"],
    ];
    for (const [service, path] of paths) refusedWith(decide({ service, method: "GET", path, query: "" }), "path_not_allowed");
  });

  it("refuses unsafe paths: dot segments, encoded slash, dot or backslash, empty segments, a trailing slash", () => {
    for (const path of ["/api/markets/../markets", "/api/./markets", "/api/%2e%2e/markets", "/api/markets%2fcontract", "/api%5cmarkets", "//api/markets", "/api//markets", "/api/markets/", "api/markets", "", "/api/markets\u0000", "/api/ markets", "/api/markets#x"]) {
      refusedWith(decide({ service: "xo_data", method: "GET", path, query: "" }), "path_not_allowed");
    }
    refusedWith(decide({ service: "xo_data", method: "GET", path: "/api/markets", query: "a=b\u0000" }), "path_not_allowed");
    refusedWith(decide({ service: "xo_data", method: "GET", path: "/api/markets", query: "a=b c" }), "path_not_allowed");
    refusedWith(decide({ service: "xo_data", method: "GET", path: "/api/markets", query: "a=b#c" }), "path_not_allowed");
  });

  it("refuses a method the route does not take", () => {
    refusedWith(post("xo_data", "/api/markets", { a: 1 }), "method_not_allowed");
    refusedWith(get("rpc_base", "/"), "method_not_allowed");
    refusedWith(get("hyperliquid_info", "/info"), "method_not_allowed");
    refusedWith(post("xo_orderbook", "/book", {}), "method_not_allowed");
    for (const method of ["PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "CONNECT", "get", ""]) {
      refusedWith(decide({ service: "xo_data", method, path: "/api/markets", query: "" }), "method_not_allowed");
    }
  });

  it("refuses a query that carries a credential, whatever the route", () => {
    for (const name of ["api_key", "apikey", "api-key", "token", "access_token", "secret", "signature", "sig", "password", "jwt", "auth", "x_token"]) {
      refusedWith(decide({ service: "xo_data", method: "GET", path: "/api/markets", query: `${name}=abc` }), "path_not_allowed");
    }
    // Ordinary names that merely contain such a word are fine.
    allowed(decide({ service: "xo_orderbook", method: "GET", path: "/book", query: `token_id=${TOKEN}` }));
    allowed(decide({ service: "quotient", method: "GET", path: "/api/public/forecast-availability", query: "market_key=polymarket:1" }));
  });

  it("refuses any query on a POST route (an api_key cannot ride along)", () => {
    refusedWith(post("xo_rpc", "/", rpc("eth_chainId"), "api_key=abc"), "path_not_allowed");
    refusedWith(post("rpc_base", "/", rpc("eth_chainId"), "x=1"), "path_not_allowed");
    refusedWith(post("hyperliquid_info", "/info", { type: "allMids" }, "x=1"), "path_not_allowed");
  });

  it("limits the explorer's etherscan-style route to read modules", () => {
    allowed(get("xo_explorer", "/api", "module=account&action=tokenbalance"));
    for (const query of ["", "module=contract&action=verify", "module=account", "module=logs&action=get-logs", "action=getLogs", "module=proxy&action=eth_sendRawTransaction"]) {
      refusedWith(get("xo_explorer", "/api", query), "path_not_allowed");
    }
  });

  it("refuses a GET that carries a body and a POST with no body or bad JSON", () => {
    refusedWith(decide({ service: "xo_data", method: "GET", path: "/api/markets", query: "", body: "{}" }), "invalid_request");
    refusedWith(decide({ service: "rpc_base", method: "POST", path: "/", query: "" }), "invalid_request");
    refusedWith(post("rpc_base", "/", ""), "invalid_request");
    refusedWith(post("rpc_base", "/", "{not json"), "invalid_request");
  });
});

describe("JSON-RPC bodies", () => {
  it("allows every method of the contract's read list", () => {
    for (const method of JSON_RPC_READ_METHODS) allowed(post("rpc_base", "/", rpc(method)));
  });

  it("the contract's read list contains no method that sends, signs or changes state", () => {
    for (const method of JSON_RPC_READ_METHODS) assert.doesNotMatch(method, /send|sign|submit|personal|debug|admin|miner|txpool|unlock|account|filter|subscribe|raw/i, method);
    assert.ok(JSON_RPC_READ_METHODS.every((method) => /^(eth|net)_/.test(method)));
  });

  it("refuses write, signing, account and node-admin methods", () => {
    for (const method of [
      "eth_sendRawTransaction",
      "eth_sendTransaction",
      "eth_sign",
      "eth_signTransaction",
      "eth_signTypedData_v4",
      "personal_sign",
      "personal_unlockAccount",
      "eth_accounts",
      "eth_requestAccounts",
      "eth_sendUserOperation",
      "eth_newFilter",
      "eth_subscribe",
      "debug_traceTransaction",
      "admin_addPeer",
      "txpool_content",
      "web3_clientVersion",
      "eth_supportedEntryPoints",
      "ETH_CALL",
      "eth_call ",
      "",
    ]) {
      refusedWith(post("rpc_base", "/", rpc(method)), "rpc_method_not_allowed");
    }
  });

  it("refuses a batch with one bad call, an empty or oversize batch and any extra key", () => {
    refusedWith(post("rpc_base", "/", [rpc("eth_call"), rpc("eth_sendRawTransaction", [], 2)]), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", []), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", Array.from({ length: MAX_RPC_BATCH + 1 }, (_, i) => rpc("eth_chainId", [], i))), "rpc_method_not_allowed");
    allowed(post("rpc_base", "/", Array.from({ length: MAX_RPC_BATCH }, (_, i) => rpc("eth_chainId", [], i))));
    refusedWith(post("rpc_base", "/", { ...rpc("eth_call"), extra: 1 }), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", { ...rpc("eth_call"), jsonrpc: "1.0" }), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", { ...rpc("eth_call"), id: { a: 1 } }), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", { ...rpc("eth_call"), params: { a: 1 } }), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", { ...rpc("eth_call"), params: [1, 2, 3, 4, 5] }), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", "5"), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", "null"), "rpc_method_not_allowed");
    refusedWith(post("rpc_base", "/", { method: ["eth_call"], jsonrpc: "2.0", id: 1 }), "rpc_method_not_allowed");
  });

  it("applies the same rule to every chain service", () => {
    for (const service of ["xo_rpc", "rpc_base", "rpc_polygon", "rpc_bnb", "hyperliquid_rpc"]) {
      allowed(post(service, "/", rpc("eth_blockNumber")));
      refusedWith(post(service, "/", rpc("eth_sendRawTransaction")), "rpc_method_not_allowed");
    }
  });
});

describe("Hyperliquid /info bodies", () => {
  it("names the read-only types it allows", () => {
    assert.deepEqual([...HYPERLIQUID_INFO_TYPES].sort(), ["allMids", "l2Book", "outcomeMeta", "settledOutcome", "spotClearinghouseState", "userFills"]);
    for (const type of HYPERLIQUID_INFO_TYPES) assert.doesNotMatch(type, /order|cancel|transfer|withdraw|approve|exchange|action/i);
  });

  it("refuses anything else", () => {
    for (const body of [
      { type: "order" },
      { type: "cancel", coin: "#1" },
      { type: "exchange", action: {} },
      { action: { type: "order" } },
      { type: "outcomeMeta", extra: 1 },
      { type: "l2Book" },
      { type: "l2Book", coin: "BTC" },
      { type: "l2Book", coin: "#1; drop" },
      { type: "l2Book", coin: "#150", nSigFigs: 99 },
      { type: "settledOutcome", outcome: -1 },
      { type: "settledOutcome", outcome: "7" },
      { type: "userFills", user: "0x12" },
      { type: "spotClearinghouseState", user: ADDR, extra: true },
      { type: "constructor" },
      { type: "__proto__" },
      [{ type: "allMids" }],
      "allMids",
      {},
    ]) {
      const verdict = post("hyperliquid_info", "/info", body);
      assert.equal(verdict.ok, false, JSON.stringify(body));
    }
    refusedWith(post("hyperliquid_info", "/info", { type: "order" }), "rpc_method_not_allowed");
  });

  it("allows user reads for an exact address", () => {
    allowed(post("hyperliquid_info", "/info", { type: "spotClearinghouseState", user: ADDR }));
    allowed(post("hyperliquid_info", "/info", { type: "userFills", user: ADDR, aggregateByTime: true }));
  });
});

describe("Polymarket CLOB batch reads", () => {
  it("allows lists of token ids", () => {
    allowed(post("polymarket_clob", "/books", [{ token_id: TOKEN }]));
    allowed(post("polymarket_clob", "/midpoints", [{ token_id: TOKEN }, { token_id: "1" }]));
    allowed(post("polymarket_clob", "/prices", [{ token_id: TOKEN, side: "BUY" }]));
  });

  it("refuses anything else", () => {
    refusedWith(post("polymarket_clob", "/books", []), "invalid_request");
    refusedWith(post("polymarket_clob", "/books", { token_id: TOKEN }), "invalid_request");
    refusedWith(post("polymarket_clob", "/books", [{ token_id: "abc" }]), "invalid_request");
    refusedWith(post("polymarket_clob", "/books", [{ token_id: TOKEN, side: "BUY" }]), "invalid_request");
    refusedWith(post("polymarket_clob", "/books", [{ token_id: TOKEN, order: {} }]), "invalid_request");
    refusedWith(post("polymarket_clob", "/prices", [{ token_id: TOKEN }]), "invalid_request");
    refusedWith(post("polymarket_clob", "/prices", [{ token_id: TOKEN, side: "HOLD" }]), "invalid_request");
    refusedWith(post("polymarket_clob", "/books", Array.from({ length: MAX_CLOB_BATCH + 1 }, () => ({ token_id: "1" }))), "invalid_request");
    refusedWith(post("polymarket_clob", "/order", [{ token_id: TOKEN }]), "path_not_allowed");
  });
});

describe("request bodies", () => {
  it("re-serialises what was checked, so only the checked fields go upstream", () => {
    const result = allowed(decide({ service: "rpc_base", method: "POST", path: "/", query: "", body: `  { "jsonrpc" : "2.0", "id": 1,\n "method":"eth_chainId", "params": [] }  ` }));
    assert.equal(result.body, '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}');
    assert.equal(result.method, "POST");
  });

  it("accepts a byte array body", () => {
    const body = new TextEncoder().encode(JSON.stringify(rpc("eth_chainId")));
    allowed(decide({ service: "rpc_base", method: "POST", path: "/", query: "", body }));
  });

  it("only honours an origin override when the caller passes one", () => {
    const input: RequestInput = { service: "xo_data", method: "GET", path: "/api/markets", query: "" };
    assert.equal(allowed(decide(input)).origin, "https://api-mainnet.xo.market");
    assert.equal(allowed(decide(input, { origins: { xo_data: "http://127.0.0.1:9" } })).url, "http://127.0.0.1:9/api/markets");
  });
});

describe("restricted-terms services", () => {
  it("are Kalshi, Quotient, Novig and Gemini, and nothing else", () => {
    assert.deepEqual([...RESTRICTED_SERVICES].sort(), ["gemini", "kalshi", "novig", "quotient"]);
    for (const service of READ_SERVICES) assert.equal(isRestrictedService(service), RESTRICTED_SERVICES.includes(service));
  });

  it("are marked on the decision", () => {
    assert.equal(allowed(get("kalshi", "/trade-api/v2/markets")).restricted, true);
    assert.equal(allowed(get("xo_orderbook", "/time")).restricted, false);
  });
});
