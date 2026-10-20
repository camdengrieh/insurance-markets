// The Data API's READ surface (api-mainnet.xo.market/api). Rows are clones of the recorded rows (see
// catalog.ts), so their shape is the recorded shape. Behaviours reproduced from the recordings and notes
// (docs/research/02, 03):
//   - take is 1 to 50; above that the API answers 400 validations.MAXIMUM_NOT_OBSERVED
//   - the list endpoint filters AFTER it counts: a market flagged `hidden` is in itemCount but its row is
//     missing from `data`, so a short page is not the last page (page on meta.hasNextPage)
//   - 200 responses carry x-ratelimit-limit: 50 and x-ratelimit-reset: 1
//   - a 404 echoes the request path (and query), which the client must treat as untrusted text

import { dataDetail, dataListRow, MARKET_TYPE_CODE, type MockMarket } from "./catalog.js";
import type { MockEnv } from "./env.js";
import { dataApiErrors } from "./errors.js";
import type { MockListener, MockReply, MockRequest } from "./listener.js";
import { iso } from "./catalog.js";

const RATE_HEADERS = { "x-ratelimit-limit": "50", "x-ratelimit-reset": "1" } as const;
const MAX_TAKE = 50;
const DEFAULT_TAKE = 10;
const ADDRESS_QUERY = /^0x[0-9a-fA-F]{40}$/;
const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
const SORT_FIELDS = ["createdAt", "expiresAt", "startsAt", "totalVolume", "totalVolumeInUSD"] as const;
type SortField = (typeof SORT_FIELDS)[number];

const ok = (json: unknown): MockReply => ({ status: 200, json, headers: RATE_HEADERS });

function integerParam(request: MockRequest, name: string, fallback: number): number | null {
  const raw = request.query.get(name);
  if (raw === null) return fallback;
  return /^[0-9]{1,9}$/.test(raw) ? Number(raw) : null;
}

function pageMeta(page: number, take: number, itemCount: number): Record<string, unknown> {
  const pageCount = Math.ceil(itemCount / take);
  return { page, take, itemCount, pageCount, hasPreviousPage: page > 1, hasNextPage: page < pageCount };
}

function sortValue(market: MockMarket, field: SortField): string {
  switch (field) {
    case "createdAt":
      return iso(market.createdAtMs);
    case "expiresAt":
      return market.expiresAt;
    case "startsAt":
      return market.startsAt;
    default:
      // Every mock market has traded nothing.
      return "0";
  }
}

export function registerDataApiReads(listener: MockListener, env: MockEnv): void {
  const { state, clock } = env;
  const stamp = (): string => iso(clock.nowMs());

  listener.route("GET", "/api/markets", (request) => {
    const take = integerParam(request, "take", DEFAULT_TAKE);
    const page = integerParam(request, "page", 1);
    if (take === null || take < 1) return dataApiErrors.invalidParameter("validations.MINIMUM_NOT_OBSERVED");
    if (take > MAX_TAKE) return dataApiErrors.takeOverMax();
    if (page === null || page < 1) return dataApiErrors.invalidParameter("validations.MINIMUM_NOT_OBSERVED");

    // The default scope hides every CLOB market (docs/research/02): without marketType only type 4 is listed.
    const types = new Set((request.query.get("marketType") ?? "4").split(",").map((part) => part.trim()));
    const statuses = new Set((request.query.get("statuses") ?? "ACTIVE").split(",").map((part) => part.trim()));
    const search = (request.query.get("search") ?? "").trim().toLowerCase();
    const sortByRaw = request.query.get("sortBy") ?? "createdAt";
    if (!(SORT_FIELDS as readonly string[]).includes(sortByRaw)) return dataApiErrors.invalidParameter("validations.INVALID_SORT_FIELD");
    const sortBy = sortByRaw as SortField;
    const sortOrder = request.query.get("sortOrder") ?? "DESC";
    if (sortOrder !== "ASC" && sortOrder !== "DESC") return dataApiErrors.invalidParameter("validations.INVALID_SORT_ORDER");

    const matched = state.markets
      .filter((market) => types.has(String(MARKET_TYPE_CODE[market.kind])))
      .filter((market) => statuses.has(market.status))
      .filter((market) => search === "" || market.title.toLowerCase().includes(search));
    matched.sort((a, b) => {
      const left = sortValue(a, sortBy);
      const right = sortValue(b, sortBy);
      const order = left < right ? -1 : left > right ? 1 : a.id - b.id;
      return sortOrder === "ASC" ? order : -order;
    });

    const start = (page - 1) * take;
    // Hidden rows are dropped after the page is cut and after the count is taken.
    const rows = matched.slice(start, start + take).filter((market) => !market.hidden).map(dataListRow);
    return ok({ data: rows, meta: pageMeta(page, take, matched.length) });
  });

  listener.route("GET", "/api/markets/contract/:cid", (request) => {
    const cid = request.params["cid"] ?? "";
    const market = CONDITION_ID.test(cid) ? state.marketByCondition(cid) : undefined;
    return market === undefined ? dataApiErrors.marketNotFound(request.path, stamp()) : ok(dataDetail(market));
  });

  listener.route("GET", "/api/markets/slug/:slug", (request) => {
    const market = state.marketBySlug(request.params["slug"] ?? "");
    return market === undefined ? dataApiErrors.marketNotFound(request.path, stamp()) : ok(dataDetail(market));
  });

  listener.route("GET", "/api/markets/:id", (request) => {
    const raw = request.params["id"] ?? "";
    if (!/^[0-9]{1,15}$/.test(raw)) return { status: 400, json: { statusCode: 400, message: "Validation failed (numeric string is expected)", error: "Bad Request" } };
    const market = state.marketById(Number(raw));
    return market === undefined ? dataApiErrors.marketNotFound(request.path, stamp()) : ok(dataDetail(market));
  });

  // Keyed by the SMART ACCOUNT: an owner EOA is 404 (docs/research/19). No profile is the default; a test
  // gives an account one with state.setPortfolio.
  listener.route("GET", "/api/users/portfolio", (request) => {
    const user = request.query.get("user");
    if (user === null || !ADDRESS_QUERY.test(user)) return dataApiErrors.invalidParameter("validations.INVALID_ADDRESS");
    const take = integerParam(request, "take", DEFAULT_TAKE);
    const page = integerParam(request, "page", 1);
    if (take === null || take < 1) return dataApiErrors.invalidParameter("validations.MINIMUM_NOT_OBSERVED");
    if (take > MAX_TAKE) return dataApiErrors.takeOverMax();
    if (page === null || page < 1) return dataApiErrors.invalidParameter("validations.MINIMUM_NOT_OBSERVED");
    const rows = state.portfolio(user);
    if (rows === undefined) return dataApiErrors.userNotFound(`${request.path}${request.search}`, stamp());
    const start = (page - 1) * take;
    return ok({ data: rows.slice(start, start + take), meta: pageMeta(page, take, rows.length) });
  });

  listener.fallback((request) => dataApiErrors.routeNotFound(`${request.path}${request.search}`, stamp()));
}
