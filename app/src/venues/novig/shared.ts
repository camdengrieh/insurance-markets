// Code the four reference-price modules share (novig, og, gemini, defillama): one error type, one GET helper, one
// gate check and a few exact-decimal helpers. It lives here because the C7 work package owns these four directories
// and nothing else; it is plain browser-safe code with no storage, no global and no clock of its own.
//
// What the helpers promise:
//   - a failure is an AdapterFailure whose `detail` is a short fixed token; upstream text never reaches a message;
//   - a request goes only through the injected fetch, is a GET, has a deadline, and is size-capped before parsing;
//   - a restricted-terms venue refuses before any request unless the user's switch AND the disclosure of the current
//     version are both on (docs/dapp-design.md 4.8 R3 and R8, fork F5).

import { parseRetryAfterMs } from "../../core/budget";
import { AdapterException, isAdapterException } from "../../core/errors";
import { adapterErrorOfFetch, isFetchError } from "../../core/fetch";
import { fromAtomic, parseQty, toDec, type Qty } from "../../core/money";
import type { AdapterDeps, AdapterError, Dec, VenueId } from "../../core/ports";
import { DEFAULT_SWITCHES, venueState, type BuildKind, type VenueSwitches } from "../../core/venue-policy";

// ---- errors ----------------------------------------------------------------------------------------------------------

// What a read throws when it cannot become a value. `code` is the port's closed AdapterError set. It extends core's
// AdapterException and carries the name "AdapterFailure", `venue` and `detail`: the shape the other venue adapters use,
// so one test serves all of them.
export class AdapterFailure extends AdapterException {
  readonly venue: VenueId | "defillama";
  readonly detail: string;

  constructor(venue: VenueId | "defillama", code: AdapterError, detail: string, retryAfterMs: number | null = null) {
    super(code, `${venue}:${code}:${detail}`, retryAfterMs);
    this.name = "AdapterFailure";
    this.venue = venue;
    this.detail = detail;
  }
}

export function isAdapterFailure(value: unknown): value is AdapterFailure {
  return value instanceof AdapterFailure;
}

// ---- the gate --------------------------------------------------------------------------------------------------------

export interface GateOptions {
  // The user's venue switches (core/settings.ts loads them). Default: nothing on, so a restricted venue is OFF.
  readonly switches?: VenueSwitches;
  readonly build?: BuildKind;
}

// Throws before any request when the venue may not run. NOT_SUPPORTED with the policy's reason as the detail
// ("off_restricted_off" for a restricted venue the user has not switched on and accepted).
export function assertEnabled(venue: VenueId, options: GateOptions): void {
  const state = venueState(venue, options.switches ?? DEFAULT_SWITCHES, options.build ?? "standalone");
  if (!state.enabled) throw new AdapterFailure(venue, "NOT_SUPPORTED", `off_${state.reason}`);
}

// ---- one GET ---------------------------------------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 20_000;
// R9: a 403 pauses the venue for ten minutes. Core's pause table owns the policy; the adapter only reports it.
export const FORBIDDEN_PAUSE_MS = 10 * 60_000;
// Characters, not bytes: JSON text is parsed only below this size.
export const DEFAULT_MAX_BODY_CHARS = 8_000_000;

// Epoch milliseconds are above 1e12 from 2001 to 2286. A smaller number is read as a duration from now, so a
// `deadlineMs` is safe whichever way the caller meant it.
export function resolveDeadline(deadlineMs: number | undefined, nowMs: number, fallbackMs = DEFAULT_TIMEOUT_MS): number {
  if (deadlineMs === undefined || !Number.isFinite(deadlineMs) || deadlineMs <= 0) return nowMs + fallbackMs;
  return deadlineMs < 1e12 ? nowMs + deadlineMs : deadlineMs;
}

export interface GetOptions {
  readonly url: string;
  // Absolute time on deps.nowMs.
  readonly deadlineAtMs?: number;
  // Statuses that mean "no such thing" for this call.
  readonly notFoundStatuses?: readonly number[];
  // Statuses whose body is read as the answer (a venue that reports an error inside a 400 body).
  readonly bodyStatuses?: readonly number[];
  readonly maxBodyChars?: number;
}

function statusToFailure(venue: VenueId | "defillama", status: number, retryAfterMs: number | null, notFound: readonly number[]): AdapterFailure {
  if (notFound.includes(status)) return new AdapterFailure(venue, "NOT_FOUND", `http_${status}`);
  if (status === 429) return new AdapterFailure(venue, "RATE_LIMITED", "http_429", retryAfterMs);
  if (status === 401 || status === 403 || status === 451) return new AdapterFailure(venue, "VENUE_PAUSED", `http_${status}`, retryAfterMs ?? FORBIDDEN_PAUSE_MS);
  if (status === 404) return new AdapterFailure(venue, "NOT_FOUND", "http_404");
  if (status === 408 || status === 504) return new AdapterFailure(venue, "TIMEOUT", `http_${status}`);
  // A 5xx is the venue failing to answer, not a refusal: core maps it the same way.
  if (status >= 500) return new AdapterFailure(venue, "TIMEOUT", `http_${status}`, retryAfterMs);
  return new AdapterFailure(venue, "SCHEMA_DRIFT", `http_${status}`);
}

// One GET through the injected fetch. The adapter never reads a global fetch and sets no Origin, Referer or
// User-Agent (a browser cannot, and a custom header would break CORS safelisting). The parsed JSON is returned
// untouched: the caller validates it with a strict schema.
export async function getJson(deps: AdapterDeps, venue: VenueId | "defillama", options: GetOptions): Promise<unknown> {
  const now = deps.nowMs();
  const deadline = options.deadlineAtMs ?? now + DEFAULT_TIMEOUT_MS;
  const remaining = deadline - now;
  if (remaining <= 0) throw new AdapterFailure(venue, "TIMEOUT", "deadline_passed");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AdapterFailure(venue, "TIMEOUT", "deadline"));
    }, remaining);
  });

  const work = (async (): Promise<unknown> => {
    let response;
    try {
      response = await deps.fetch(options.url, { method: "GET", signal: controller.signal });
    } catch (error) {
      if (isAdapterException(error)) throw error;
      // The fetch layer's own failures (needs the Cockpit, paused, throttled, too large, not JSON) keep their
      // meaning; anything else is "the venue gave no answer".
      if (isFetchError(error)) throw new AdapterFailure(venue, adapterErrorOfFetch(error) ?? "TIMEOUT", `fetch_${error.code}`, error.retryAfterMs);
      throw new AdapterFailure(venue, "TIMEOUT", "no_response");
    }
    if (!response.ok && !(options.bodyStatuses ?? []).includes(response.status)) {
      throw statusToFailure(venue, response.status, parseRetryAfterMs(response.headers.get("retry-after"), deps.nowMs()), options.notFoundStatuses ?? []);
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      throw new AdapterFailure(venue, "TIMEOUT", "body_unreadable");
    }
    if (text.length > (options.maxBodyChars ?? DEFAULT_MAX_BODY_CHARS)) throw new AdapterFailure(venue, "SCHEMA_DRIFT", "body_too_large");
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new AdapterFailure(venue, "SCHEMA_DRIFT", "invalid_json");
    }
  })();
  // If the deadline wins, the late result must not become an unhandled rejection.
  work.catch(() => undefined);

  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ---- query building --------------------------------------------------------------------------------------------------

// Percent-encodes one query value. Names are fixed strings in the adapters; only values are encoded.
export function queryOf(params: ReadonlyArray<readonly [string, string | number | undefined]>): string {
  const parts: string[] = [];
  for (const [name, value] of params) {
    if (value === undefined || value === "") continue;
    // A comma separates list values (marketType=MONEY,SPREAD) and needs no escape in a query.
    parts.push(`${name}=${encodeURIComponent(String(value)).replace(/%2C/gi, ",")}`);
  }
  return parts.length === 0 ? "" : `?${parts.join("&")}`;
}

export function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), min), max);
}

// ---- paging across several statuses ----------------------------------------------------------------------------------

// Some venues take one status per request. A page cursor then carries which status is being read and the venue's
// own opaque cursor for it: "<index>:<opaque>". The opaque part is never parsed; it is only checked to be a
// plain token before it goes back into a URL.
const OPAQUE_CURSOR = /^[A-Za-z0-9_=.-]{0,200}$/;

export interface StatusCursor {
  readonly index: number;
  readonly opaque: string;
}

export function decodeStatusCursor(venue: VenueId, cursor: string | undefined, statusCount: number): StatusCursor {
  if (cursor === undefined || cursor === "") return { index: 0, opaque: "" };
  const colon = cursor.indexOf(":");
  const index = colon === -1 ? Number.NaN : Number(cursor.slice(0, colon));
  const opaque = colon === -1 ? "" : cursor.slice(colon + 1);
  if (!Number.isInteger(index) || index < 0 || index >= statusCount || !OPAQUE_CURSOR.test(opaque)) throw new AdapterFailure(venue, "NOT_SUPPORTED", "bad_cursor");
  return { index, opaque };
}

// The cursor of the next page: the venue's own cursor if it gave one, else the start of the next status, else null.
export function nextStatusCursor(index: number, statusCount: number, venueNext: string | null | undefined): string | null {
  if (venueNext !== null && venueNext !== undefined && venueNext !== "" && OPAQUE_CURSOR.test(venueNext)) return `${index}:${venueNext}`;
  return index + 1 < statusCount ? `${index + 1}:` : null;
}

// ---- exact decimals --------------------------------------------------------------------------------------------------

export const ONE_PRICE: Qty = fromAtomic("price", 1n, 0);

// A price strictly between 0 and 1 as an exact quantity, or null. Never rounds: more than `maxScale` places is null.
export function openUnitPrice(text: unknown, maxScale = 6): Qty | null {
  const price = parseQty("price", text, { maxScale });
  if (price === null || price.atomic <= 0n) return null;
  // price < 1  <=>  atomic < 10^scale
  if (price.atomic >= 10n ** BigInt(price.scale)) return null;
  return price;
}

export function priceDec(price: Qty): Dec {
  return toDec(price);
}

// ---- time ------------------------------------------------------------------------------------------------------------

export function isoOfMs(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// A positive safe integer millisecond timestamp below year 5138, else null.
export function msOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value < 1e14 ? value : null;
}
