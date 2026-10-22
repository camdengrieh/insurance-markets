import { adapterErrorOfFetch, isFetchError } from "../../../core/fetch";
import { parseRetryAfterMs } from "../../../core/budget";
import { InflightDedupe, MemoryStore, ttlFor } from "../../../core/cache";
import { parseIsoMs } from "../../../core/format";
import type { AdapterDeps, AdapterError, Dec, FetchResponseLike } from "../../../core/ports";
import { sanitizeText } from "../../../core/untrusted";
import { MAX_BODY_CHARS, QUOTIENT_ORIGIN, REQUEST_TIMEOUT_MS } from "./constants";
import { ingest, type IngestContext, type PerformanceSnapshot, type QuotientRow, type RowRefusal, type RowSet } from "@sdk/signals/quotient";
import { judgeChallenge, type HardStop, type PaymentRequired } from "./payment";
import {
  ROUTES,
  RouteParamError,
  buildRequest,
  type BuiltRequest,
  type LookupParams,
  type MispricedParams,
  type RouteId,
  type SignalsParams,
} from "./routes";
import { SpendMeter, type SpendSnapshot } from "./spend";

// The Quotient client. It builds a closed set of GET requests, sends them through the injected fetch, and returns
// a typed result. What it does NOT do, by construction:
//   - pay. There is no code path that builds or sends a payment, a proof, or a PAYMENT-SIGNATURE / X-Payment
//     header. A 402 is parsed, judged against the pinned tuple, and reported as "payment required" (M3-1).
//   - run without being asked. There is no timer and no poll: a paid route runs only from a call that carries the
//     price the user saw (M3-5), and a repeat inside the cache lifetime is served from memory without a charge.
//   - keep anything. Results live in a MemoryStore (own-use-only data, dropped after 15 idle minutes and on page
//     hide). Nothing is written to IndexedDB, localStorage, a file or a URL (M3-4); this module imports no storage.
//   - send a credential anywhere but Quotient. The key header is attached only to this origin's URLs, and a key in
//     page memory is refused in the Cockpit build (the daemon holds it there).

// ---- configuration --------------------------------------------------------------------------------------------------------

// The switch. Off by default: a client built without it refuses everything before any request. `licenceShownAtMs`
// is when the user saw the licence clause and chose to turn Quotient on (R8); both are needed.
export interface QuotientGate {
  readonly enabled: boolean;
  readonly licenceAcknowledgedAtMs: number | null;
}

// How a key reaches Quotient.
//   none         no key: paid routes answer 402 and the result says "payment required" (import mode is the way in)
//   daemon       mode A in the Cockpit: the daemon holds the user's qt_ key and adds it; the page sends no credential
//   page_memory  mode A in the standalone build: the key sits in page memory only, handed in per request
export type KeyAccess =
  | { readonly mode: "none" }
  | { readonly mode: "daemon" }
  | { readonly mode: "page_memory"; readonly getKey: () => string | undefined };

export interface QuotientClientOptions {
  readonly build: "standalone" | "cockpit";
  readonly gate?: QuotientGate;
  readonly access?: KeyAccess;
  readonly dailyBudgetUsd?: Dec;
  readonly timeoutMs?: number;
}

export class QuotientConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotientConfigError";
  }
}

// What a press carries: the route and the price the user was shown. It must equal the table price.
export interface PaidCallApproval {
  readonly route: RouteId;
  readonly priceUsd: Dec;
}

// For the press handler: the approval for exactly what the button label said.
export function approvalFor(route: RouteId): PaidCallApproval {
  return { route, priceUsd: ROUTES[route].priceUsd };
}

export interface CallOptions {
  // Required for a paid route when a key is attached (a call that costs money). Not needed to read the 402.
  readonly approval?: PaidCallApproval;
  // Skip the memory cache. On a paid route this is a new charge and needs the approval.
  readonly refresh?: boolean;
}

// ---- results --------------------------------------------------------------------------------------------------------------

export const REFUSAL_REASONS = [
  "off_by_default",
  "licence_not_acknowledged",
  "halted_after_payment_mismatch",
  "bad_params",
  "approval_required",
  "approval_price_mismatch",
  "call_above_limit",
  "day_budget_reached",
  "key_missing",
  "key_invalid",
  "payload_too_large",
  "not_json",
] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export const REFUSAL_TEXT: Readonly<Record<RefusalReason, string>> = Object.freeze({
  off_by_default: "Quotient is off. Turn it on in Settings after reading the licence clause. Nothing was requested.",
  licence_not_acknowledged: "The licence clause has not been acknowledged. Nothing was requested.",
  halted_after_payment_mismatch: "Stopped: a payment request did not match the pinned payee, token, network or price. Quotient calls stay stopped until you reset them. Nothing was requested.",
  bad_params: "That request has a value Quotient's API would not accept, so it was not sent.",
  approval_required: "This call costs money. Press the button that shows its price. Nothing was requested.",
  approval_price_mismatch: "The price you confirmed is not the price of this call. Nothing was requested.",
  call_above_limit: "This call is above the per-call data limit. Nothing was requested.",
  day_budget_reached: "Today's Quotient data budget is used up. Nothing was requested.",
  key_missing: "No Quotient key is set for this tab. Nothing was requested.",
  key_invalid: "The Quotient key does not look like a key. It was not sent anywhere.",
  payload_too_large: "That file is too large to import.",
  not_json: "That is not JSON.",
});

export const UNAVAILABLE_REASONS = [
  "rate_limited",
  "key_rejected",
  "no_coverage",
  "request_not_accepted",
  "payment_replay_mismatch",
  "upstream_error",
  "network",
  "transport_refused",
  "unexpected_status",
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export const UNAVAILABLE_TEXT: Readonly<Record<UnavailableReason, string>> = Object.freeze({
  rate_limited: "Quotient asked us to slow down. This call is not billed. Try again after the wait.",
  key_rejected: "Quotient refused the key. Check it in your Quotient console. Not retried.",
  no_coverage: "Quotient has no forecast for this market (not billed). That is not the same as a price of zero.",
  request_not_accepted: "Quotient did not accept this request (not billed). It was not retried or reworded.",
  payment_replay_mismatch: "Quotient reported a payment replay mismatch. Nothing was paid from this page.",
  upstream_error: "Quotient had a server error (not billed). It was not retried automatically.",
  network: "The request failed before any answer (network, CORS or timeout).",
  transport_refused: "The request was refused before it left this page.",
  unexpected_status: "Quotient answered in a way this client does not recognise. Nothing was used.",
});

export const FAILED_CLOSED_REASONS = ["bad_envelope", "every_row_refused", "not_json", "challenge_unreadable", "bad_shape"] as const;
export type FailedClosedReason = (typeof FAILED_CLOSED_REASONS)[number];

export type Origin = "network" | "cache" | "import";

export interface Okay<T> {
  readonly status: "ok";
  readonly route: RouteId;
  readonly data: T;
  readonly origin: Origin;
  readonly fetchedAtMs: number;
  // True when this call was a paid request that went through with a key attached.
  readonly charged: boolean;
  readonly spend: SpendSnapshot;
}

export type QuotientResult<T> =
  | Okay<T>
  | { readonly status: "payment_required"; readonly route: RouteId; readonly verdict: PaymentRequired; readonly keyed: boolean; readonly text: string }
  | { readonly status: "hard_stop"; readonly route: RouteId; readonly verdict: HardStop; readonly text: string }
  | { readonly status: "refused"; readonly route: RouteId; readonly reason: RefusalReason; readonly text: string }
  | { readonly status: "failed_closed"; readonly route: RouteId; readonly reason: FailedClosedReason; readonly rejected: readonly RowRefusal[]; readonly text: string }
  | {
      readonly status: "unavailable";
      readonly route: RouteId;
      readonly code: AdapterError;
      readonly reason: UnavailableReason;
      readonly retryAfterMs: number | null;
      readonly text: string;
    };

const FAILED_CLOSED_TEXT: Readonly<Record<FailedClosedReason, string>> = Object.freeze({
  bad_envelope: "Failed closed: the answer is not the shape this client expects, so nothing from it is shown. Quotient may have changed its API.",
  every_row_refused: "Failed closed: every row had an unknown value or a value out of range, so none is shown.",
  not_json: "Failed closed: the answer is not JSON, so nothing from it is shown.",
  challenge_unreadable: "Failed closed: a payment request came back that this client cannot read. Nothing was paid.",
  bad_shape: "Failed closed: the answer is not the shape this client expects, so nothing from it is shown.",
});

const PAYMENT_TEXT =
  "Payment required. This page never pays. Pay with your own agent and import the JSON it saves, or use your own Quotient key. The price comes from Quotient's challenge, checked against the pinned payee and token.";
const HARD_STOP_TEXT = "Hard stop: the payment request does not match what this client pins (payee, token, network, timeout or price). Nothing was paid, and further paid calls are stopped until you reset them.";

// ---- the client -----------------------------------------------------------------------------------------------------------

export type RowsResult = QuotientResult<RowSet>;

export interface QuotientClient {
  readonly build: "standalone" | "cockpit";
  status(): QuotientClientStatus;
  performance(options?: { readonly refresh?: boolean }): Promise<QuotientResult<PerformanceSnapshot>>;
  mispriced(params: MispricedParams, options?: CallOptions): Promise<RowsResult>;
  signals(params: SignalsParams, options?: CallOptions): Promise<RowsResult>;
  lookup(params: LookupParams, options?: CallOptions): Promise<RowsResult>;
  // Import mode: the user's own agent paid and saved the response; the user drops the JSON text here.
  importJson(route: "mispriced" | "signals" | "lookup" | "performance", text: string): QuotientResult<RowSet | PerformanceSnapshot>;
  // A person's explicit action after a hard stop.
  resetHalt(): void;
  clearMemory(): void;
}

export interface QuotientClientStatus {
  readonly enabled: boolean;
  readonly access: KeyAccess["mode"];
  readonly halted: HardStop | null;
  readonly spend: SpendSnapshot;
}

const KEY_HEADER = "x-quotient-api-key";
const KEY_SHAPE = /^qt_[A-Za-z0-9_-]{8,200}$/;

export function createQuotientClient(deps: AdapterDeps, options: QuotientClientOptions): QuotientClient {
  const access: KeyAccess = options.access ?? { mode: "none" };
  if (access.mode === "page_memory" && options.build === "cockpit") {
    // The Cockpit's daemon holds the key; a key in page JS is exposed to XSS and the Cockpit port forwards none.
    throw new QuotientConfigError("a key in page memory is not allowed in the Cockpit build; the daemon holds it");
  }
  if (access.mode === "daemon" && options.build === "standalone") {
    throw new QuotientConfigError("the daemon holds no key for the standalone build");
  }
  const gate = options.gate ?? { enabled: false, licenceAcknowledgedAtMs: null };
  const meter = new SpendMeter(deps.nowMs, options.dailyBudgetUsd);
  const store = new MemoryStore<unknown>("quotient", { nowMs: deps.nowMs });
  const inflight = new InflightDedupe();
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  let halted: HardStop | null = null;

  const keyed = access.mode !== "none";
  const transport = (): "T0" | "T2" => (keyed ? "T2" : "T0");

  function refusal<T>(route: RouteId, reason: RefusalReason): QuotientResult<T> {
    return { status: "refused", route, reason, text: REFUSAL_TEXT[reason] };
  }

  function ok<T>(route: RouteId, data: T, origin: Origin, charged: boolean, fetchedAtMs: number): Okay<T> {
    return { status: "ok", route, data, origin, fetchedAtMs, charged, spend: meter.snapshot() };
  }

  // Gate, halt: the checks every call passes before anything else. Returns a refusal or null.
  function precheck(route: RouteId): RefusalReason | null {
    if (!gate.enabled) return "off_by_default";
    if (gate.licenceAcknowledgedAtMs === null) return "licence_not_acknowledged";
    if (halted !== null && ROUTES[route].paid) return "halted_after_payment_mismatch";
    return null;
  }

  function headersFor(): Record<string, string> | RefusalReason {
    const headers: Record<string, string> = { accept: "application/json" };
    if (access.mode === "page_memory") {
      const key = access.getKey();
      if (key === undefined || key.length === 0) return "key_missing";
      if (!KEY_SHAPE.test(key)) return "key_invalid";
      headers[KEY_HEADER] = key;
    }
    return headers;
  }

  async function send(built: BuiltRequest, headers: Record<string, string>): Promise<FetchResponseLike | { readonly failure: QuotientResult<never> }> {
    const route = built.route;
    // The key header goes only to the pinned origin: the URL comes from the route table, but the check is cheap.
    if (!built.url.startsWith(`${QUOTIENT_ORIGIN}/`) && KEY_HEADER in headers) return { failure: refusal(route, "key_invalid") };
    try {
      return await deps.fetch(built.url, { method: "GET", headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const code = adapterErrorOfFetch(error) ?? "TIMEOUT";
      const refused = isFetchError(error) && !["timeout", "network", "aborted"].includes(error.code);
      return {
        failure: {
          status: "unavailable",
          route,
          code,
          reason: refused ? "transport_refused" : "network",
          retryAfterMs: isFetchError(error) ? error.retryAfterMs : null,
          text: UNAVAILABLE_TEXT[refused ? "transport_refused" : "network"],
        },
      };
    }
  }

  function unavailable(route: RouteId, response: FetchResponseLike): QuotientResult<never> {
    const status = response.status;
    const retry = status === 429 || status === 503 ? parseRetryAfterMs(response.headers.get("retry-after"), deps.nowMs()) : null;
    let code: AdapterError;
    let reason: UnavailableReason;
    if (status === 429) [code, reason] = ["RATE_LIMITED", "rate_limited"];
    else if (status === 401 || status === 403) [code, reason] = ["VENUE_PAUSED", "key_rejected"];
    else if (status === 404) [code, reason] = ["NOT_FOUND", "no_coverage"];
    else if (status === 409) [code, reason] = ["SCHEMA_DRIFT", "payment_replay_mismatch"];
    else if (status === 400 || status === 422) [code, reason] = ["NOT_SUPPORTED", "request_not_accepted"];
    else if (status >= 500) [code, reason] = ["TIMEOUT", "upstream_error"];
    else [code, reason] = ["SCHEMA_DRIFT", "unexpected_status"];
    return { status: "unavailable", route, code, reason, retryAfterMs: retry, text: UNAVAILABLE_TEXT[reason] };
  }

  // Core of every network call: returns the parsed body of a 200, or a terminal result.
  async function fetchBody(built: BuiltRequest): Promise<{ readonly body: unknown } | { readonly done: QuotientResult<never> }> {
    const route = built.route;
    const headers = headersFor();
    if (typeof headers === "string") return { done: refusal(route, headers) };
    const sent = await send(built, headers);
    if ("failure" in sent) return { done: sent.failure };
    const response = sent;

    if (response.status === 402) {
      // Body first (the Cockpit's proxy carries only the body), then the header when the browser exposes it.
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const verdict = judgeChallenge(route, built.path, body, response.headers.get("payment-required"));
      if (verdict.state === "hard_stop") {
        halted = verdict;
        return { done: { status: "hard_stop", route, verdict, text: HARD_STOP_TEXT } };
      }
      if (verdict.state === "unreadable") return { done: { status: "failed_closed", route, reason: "challenge_unreadable", rejected: [], text: FAILED_CLOSED_TEXT.challenge_unreadable } };
      return { done: { status: "payment_required", route, verdict, keyed, text: keyed ? `${PAYMENT_TEXT} Your key did not cover this call (its credits may be used up).` : PAYMENT_TEXT } };
    }
    if (!response.ok) return { done: unavailable(route, response) };
    // A 200 with a key attached was charged, whatever the body turns out to be (an envelope the client does not
    // know, or not JSON, fails closed below). Counting it here keeps the daily budget honest.
    if (keyed) meter.record(route);
    try {
      return { body: await response.json() };
    } catch {
      return { done: { status: "failed_closed", route, reason: "not_json", rejected: [], text: FAILED_CLOSED_TEXT.not_json } };
    }
  }

  async function listCall(route: "mispriced" | "signals" | "lookup", build: () => BuiltRequest, call: CallOptions | undefined): Promise<RowsResult> {
    const blocked = precheck(route);
    if (blocked !== null) return refusal(route, blocked);
    let built: BuiltRequest;
    try {
      built = build();
    } catch (error) {
      if (error instanceof RouteParamError) return refusal(route, "bad_params");
      throw error;
    }
    const cached = call?.refresh === true ? undefined : (store.get(built.url) as RowSet | undefined);
    if (cached !== undefined) return ok(route, cached, "cache", false, deps.nowMs());

    // A call that can cost money needs the price the user saw, and must fit the budget.
    if (keyed) {
      const approval = call?.approval;
      if (approval === undefined || approval.route !== route) return refusal(route, "approval_required");
      if (approval.priceUsd !== ROUTES[route].priceUsd) return refusal(route, "approval_price_mismatch");
      const budget = meter.check(route);
      if (!budget.ok) return refusal(route, budget.reason);
    }

    return inflight.run(built.url, async () => {
      const got = await fetchBody(built);
      if ("done" in got) return got.done;
      const fetchedAtMs = deps.nowMs();
      const ctx: IngestContext = { fetchedAtMs, transport: transport(), route };
      const outcome = ingest(got.body, ctx);
      if (!outcome.ok) {
        const reason: FailedClosedReason = outcome.reason;
        return { status: "failed_closed", route, reason, rejected: outcome.rejected, text: FAILED_CLOSED_TEXT[reason] } as QuotientResult<never>;
      }
      // (The spend was counted in fetchBody, as soon as the 200 came back.)
      store.set(built.url, outcome.set, ttlFor(ROUTES[route].cacheClass));
      return ok(route, outcome.set, "network", keyed, fetchedAtMs);
    });
  }

  return {
    build: options.build,

    status() {
      return { enabled: gate.enabled && gate.licenceAcknowledgedAtMs !== null, access: access.mode, halted, spend: meter.snapshot() };
    },

    async performance(opts) {
      const route: RouteId = "performance";
      const blocked = precheck(route);
      if (blocked !== null) return refusal(route, blocked);
      const built = buildRequest("performance", {});
      const cached = opts?.refresh === true ? undefined : (store.get(built.url) as PerformanceSnapshot | undefined);
      if (cached !== undefined) return ok(route, cached, "cache", false, deps.nowMs());
      return inflight.run(built.url, async () => {
        // The free route never carries a key: nothing about the user goes with it.
        let response: FetchResponseLike;
        try {
          response = await deps.fetch(built.url, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
        } catch (error) {
          const code = adapterErrorOfFetch(error) ?? "TIMEOUT";
          return { status: "unavailable", route, code, reason: "network", retryAfterMs: isFetchError(error) ? error.retryAfterMs : null, text: UNAVAILABLE_TEXT.network } as QuotientResult<PerformanceSnapshot>;
        }
        if (!response.ok) return unavailable(route, response);
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return { status: "failed_closed", route, reason: "not_json", rejected: [], text: FAILED_CLOSED_TEXT.not_json } as QuotientResult<PerformanceSnapshot>;
        }
        const snapshot = parsePerformance(body);
        if (snapshot === null) return { status: "failed_closed", route, reason: "bad_shape", rejected: [], text: FAILED_CLOSED_TEXT.bad_shape } as QuotientResult<PerformanceSnapshot>;
        const fetchedAtMs = deps.nowMs();
        store.set(built.url, snapshot, ttlFor(ROUTES.performance.cacheClass));
        return ok(route, snapshot, "network", false, fetchedAtMs);
      });
    },

    mispriced: (params, call) => listCall("mispriced", () => buildRequest("mispriced", params), call),
    signals: (params, call) => listCall("signals", () => buildRequest("signals", params), call),
    lookup: (params, call) => listCall("lookup", () => buildRequest("lookup", params), call),

    importJson(route, text) {
      const blocked = precheck(route);
      if (blocked !== null) return refusal(route, blocked);
      const parsed = parseImportText(text);
      if ("refusal" in parsed) return refusal(route, parsed.refusal);
      const body = parsed.body;
      // A saved 402 is not data: judge it like a live one, so a doctored challenge is a hard stop here too.
      if (looksLikeChallenge(body)) {
        const path = route === "performance" ? "/api/public/performance" : route === "signals" ? "/api/v1/signals" : route === "mispriced" ? "/api/v1/markets/mispriced" : "/api/v1/markets/lookup";
        const verdict = judgeChallenge(route, path, body, null);
        if (verdict.state === "hard_stop") {
          halted = verdict;
          return { status: "hard_stop", route, verdict, text: HARD_STOP_TEXT };
        }
        if (verdict.state === "payment_required") return { status: "payment_required", route, verdict, keyed: false, text: PAYMENT_TEXT };
        return { status: "failed_closed", route, reason: "challenge_unreadable", rejected: [], text: FAILED_CLOSED_TEXT.challenge_unreadable };
      }
      const now = deps.nowMs();
      if (route === "performance") {
        const snapshot = parsePerformance(body);
        if (snapshot === null) return { status: "failed_closed", route, reason: "bad_shape", rejected: [], text: FAILED_CLOSED_TEXT.bad_shape };
        return ok(route, snapshot, "import", false, now);
      }
      const outcome = ingest(body, { fetchedAtMs: now, transport: "T3", route });
      if (!outcome.ok) {
        const reason: FailedClosedReason = outcome.reason;
        return { status: "failed_closed", route, reason, rejected: outcome.rejected, text: FAILED_CLOSED_TEXT[reason] };
      }
      return ok(route, outcome.set, "import", false, now);
    },

    resetHalt() {
      halted = null;
    },

    clearMemory() {
      store.clear();
    },
  };
}

// ---- helpers --------------------------------------------------------------------------------------------------------------

export function parseImportText(text: string): { readonly body: unknown } | { readonly refusal: RefusalReason } {
  if (typeof text !== "string" || text.length > MAX_BODY_CHARS) return { refusal: "payload_too_large" };
  try {
    return { body: JSON.parse(text) as unknown };
  } catch {
    return { refusal: "not_json" };
  }
}

function looksLikeChallenge(body: unknown): boolean {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;
  return "x402Version" in record || "accepts" in record || record["error"] === "payment_required";
}

export function parsePerformance(body: unknown): PerformanceSnapshot | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const generated = typeof record["generatedAt"] === "string" ? parseIsoMs(record["generatedAt"]) : null;
  let json: string;
  try {
    json = JSON.stringify(body);
  } catch {
    return null;
  }
  const clean = sanitizeText("rules", json.slice(0, 20_000), "quotient");
  return { generatedAtMs: generated, excerpt: clean.text, excerptTruncated: clean.truncated || json.length > 20_000, shape: "unverified" };
}

export type { QuotientRow, RowSet };
