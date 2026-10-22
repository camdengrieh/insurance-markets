import { randomBytes } from "node:crypto";

import type { Secret } from "../src/config.js";
import { createEmbeddedRelayClient, type EmbeddedHandler, type EmbeddedReply, type EmbeddedRequest } from "../src/relay/client.js";
import {
  GET_ROUTES,
  isPostPath,
  matchGetRoute,
  POST_ROUTES,
  type RelayClient,
  type RouteKey,
} from "../src/relay/contract.js";
import { ERROR_HTTP_STATUS, RelayError, toRelayErrorBody, type ErrorCode, type RelayErrorBody } from "../src/relay/errors.js";
import type { FlagEnv, Flags } from "../src/relay/flags.js";
import type { HookRunner, TripwireChecker } from "./alerts.js";
import { TokenBuckets } from "./auth.js";
import { assembleCore, type CoreServices } from "./main.js";
import { confirmFundingAbsent } from "./funding.js";
import { DEFAULT_HTTP, RELAY_ENV, type RelayConfig, type RelayHttpConfig } from "./config.js";
import type { AccountDirectory } from "./health.js";
import { keepPreparedAnswer, withDecodedBlock } from "./prepared.js";
import { routes as defaultRoutes } from "./routes.js";
import { READ_ROUTE_KEYS, WRITE_ROUTE_KEYS } from "./server.js";
import type { FsLike } from "./store.js";
import type { KdfParams } from "./crypto.js";
import type { RelayContext, RelayServices, RouteTable } from "./types.js";
import type { UserOpExtensions, UserOpOptions } from "./userops.js";
import { credentialL2Auth, healAtStart, prepareWiring, runUpkeep } from "./wiring.js";
import { checkOwnerScopedRead, OWNER_WRITE_ROUTES, OwnerPolicy, SUBMIT_ROUTES, type OwnerGate, type OwnerMode, type OwnerPolicyView } from "./owners.js";
import { NAMESPACES, type Json } from "./store.js";

export { ALLOW_ANY_OWNER_ENV, OWNER_ENV, type OwnerMode, type OwnerPolicyView } from "./owners.js";
import type { AllowedHost } from "./upstream.js";

// The relay without a socket (docs/phase1-gap-closing.md section 5.2, product decision "one codebase,
// two modes"). createEmbeddedRelay builds the same relay that `pnpm relay` runs (storage, ledger,
// prepared items, capability facts, flags, tripwires, audit, the XO upstream client, every route
// handler) and hands back a RelayClient that calls the route pipeline as a function. There is no
// listener, no X-Relay-Key and no operator: one user, one process, one data directory.
//
// The pipeline here is the HTTP server's, minus the pieces that exist only because of a socket:
//   - the same route table, the same kill switch on every write route, the same per-endpoint token
//     buckets, the same body rules (no forbidden keys, strict schema), the same answer-by budget
//     (`pending` after 6 s while the handler finishes in the background), the same response check
//     against the contract and the same fixed `internal` for anything that is not a RelayError;
//   - the same wire format: the client turns the reply into a Response, so the error mapping and the
//     schema and echo checks in src/relay/client.ts are one code path for both transports;
//   - not here: Host and Origin checks, the peer address and the relay key (nothing to attack).
// test/local-parity.test.ts runs one set of requests through both and compares the answers.
//
// State is keyed by the owner's XO account everywhere (ledger, credentials, prepared items, orders).
// Two owners in one data directory share nothing except the protocol-level facts (capability facts,
// tripwires, kill switch), which are about XO and not about a person. The owner policy below decides
// WHICH owners this process serves; it is not a security boundary against the user's own agent.

export interface EmbeddedRelayOptions {
  // The relay's state directory. Created 0700 by the storage layer; the caller resolves it.
  readonly dataDir: string;
  // The environment the relay reads (flags, caps, endpoints, XO_OWNER). RELAY_DATA_DIR in it is overridden by dataDir.
  readonly env: FlagEnv;
  // Epoch milliseconds. Defaults to Date.now. The mock-backed tests inject the mock's clock.
  readonly clock?: () => number;
  // Required while the credential store is on (the default). Resolved by the caller (src/local/master-key.ts).
  readonly masterSecret?: Secret;
  // Seams for tests and for the streams that plug into the relay.
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly fs?: FsLike;
  readonly kdf?: KdfParams;
  readonly allowWeakKdf?: boolean;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly hookRunner?: HookRunner;
  readonly newRequestId?: () => string;
  readonly tripwireCheckers?: readonly TripwireChecker[];
  readonly extraUpstreamHosts?: readonly AllowedHost[];
  readonly extraServices?: Partial<RelayServices>;
  readonly userops?: UserOpOptions;
  readonly useropExtensions?: UserOpExtensions;
  // Replaces the account directory built from the relay's own XO readers (tests).
  readonly accounts?: AccountDirectory;
  readonly routes?: RouteTable;
  readonly http?: Partial<RelayHttpConfig>;
  // RT-2: without XO_OWNER (or XO_ALLOW_ANY_OWNER) the first write for an unbound owner is refused with a tool
  // result that names the wallet and asks for the user's confirmation (see OwnerConfirmation below). Default on;
  // false restores "serve anyone until a signature binds one" (tests of other things, not a product setting).
  readonly ownerConfirmation?: boolean;
  // Background upkeep (expiry sweeps, funding follow-up, tripwire re-checks). Default on, every 60 s.
  readonly maintenance?: boolean;
  readonly maintenanceIntervalMs?: number;
}

export interface EmbeddedRelay {
  readonly client: RelayClient;
  readonly handler: EmbeddedHandler;
  readonly config: RelayConfig;
  readonly services: CoreServices;
  readonly flags: () => Flags;
  readonly recovered: { readonly interruptedSends: number; readonly tornJournalBytes: number };
  // Names of environment variables that had a bad value and were replaced by a safe default. Never values.
  readonly issues: readonly string[];
  owners(): OwnerPolicyView;
  // The wallet a first-owner confirmation was asked about, and whether it was confirmed; null when none is pending
  // (an explicit or any-owner policy, a bound relay, or nothing asked yet).
  ownerConfirmation(): { readonly owner: string; readonly confirmed: boolean } | null;
  // One round of upkeep, now. The background timer calls the same function.
  maintain(): Promise<void>;
  // Resolves when every handler that was answered `pending` has finished.
  idle(): Promise<void>;
  close(): Promise<void>;
  // Test hook: drop everything without an orderly shutdown, as a crash would.
  abandon(): Promise<void>;
}

interface Reply {
  readonly status: number;
  readonly body: unknown;
  readonly code?: ErrorCode;
}

const PENDING_BODY = {
  error: { code: "pending", message: "Still in flight. The relay is finishing this in the background; poll the status route." },
} as const;

function errorReply(code: ErrorCode, message: string, details?: RelayErrorBody["details"], status?: number): Reply {
  const body: RelayErrorBody = details === undefined ? { code, message } : { code, message, details };
  return { status: status ?? ERROR_HTTP_STATUS[code], body: { error: body }, code };
}

function replyFromError(error: unknown): Reply {
  const body = toRelayErrorBody(error);
  return { status: ERROR_HTTP_STATUS[body.code], body: { error: body }, code: body.code };
}

// Same rule as the HTTP server: a path of safe characters only, no query, no fragment, no traversal.
function parseTarget(raw: string): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: "query" | "shape" } {
  if (raw.length > 512 || !raw.startsWith("/") || raw.startsWith("//")) return { ok: false, reason: "shape" };
  if (raw.includes("?") || raw.includes("#")) return { ok: false, reason: "query" };
  if (!/^\/[A-Za-z0-9/_:.-]*$/.test(raw) || raw.includes("..") || raw.includes("//")) return { ok: false, reason: "shape" };
  return { ok: true, path: raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw };
}

// A body that carries __proto__, constructor or prototype is broken or probing. Iterative, so a deeply
// nested body cannot exhaust the stack.
function hasForbiddenKey(value: unknown): boolean {
  const stack: unknown[] = [value];
  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current !== "object" || current === null) continue;
    visited += 1;
    if (visited > 20_000) return true;
    if (Array.isArray(current)) {
      for (const item of current) stack.push(item);
      continue;
    }
    for (const key of Object.keys(current)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") return true;
      stack.push((current as Record<string, unknown>)[key]);
    }
  }
  return false;
}

function safeFieldName(part: PropertyKey): string {
  return String(part).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48);
}

// credentialL2Auth lives in relay/wiring.ts (shared with `pnpm relay`); re-exported for callers of this module.
export { credentialL2Auth };


// ---- the first-owner confirmation (RT-2) ----------------------------------------------------------------------------------------
//
// With no XO_OWNER and no XO_ALLOW_ANY_OWNER the relay binds the first wallet whose signature it accepts. Until now the
// agent chose that wallet by naming it in a prepare, and nothing showed the user which one it was. Now the first owner
// write for an unbound wallet is refused with a tool result that says so and names the wallet; the user is to be shown
// it. The same call repeated after OWNER_CONFIRM_MIN_DELAY_MS (a person had time to answer) and within
// OWNER_CONFIRM_WINDOW_MS goes through. The record is durable, so a restart is not a way around the pause or the
// window. Asking about another wallet replaces the pending one; binding still happens only at the first accepted
// signature (OwnerPolicy.bindAfterSubmit) and clears the record. This is a speed bump that puts the wallet in front of
// the user, not a barrier against a compromised agent, which can repeat a call: the caps stay advisory.
export const OWNER_CONFIRM_MIN_DELAY_MS = 5_000;
export const OWNER_CONFIRM_WINDOW_MS = 15 * 60_000;
const CONFIRM_KEY = "owner_confirmation";

type ConfirmationRecord = { readonly owner: string; readonly askedAtMs: number; readonly confirmed: boolean };

function readConfirmation(value: Json | undefined): ConfirmationRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record = value as { readonly [key: string]: Json };
  const { owner, askedAtMs, confirmed } = record;
  return typeof owner === "string" && /^0x[0-9a-f]{40}$/.test(owner) && typeof askedAtMs === "number" && Number.isFinite(askedAtMs) && typeof confirmed === "boolean" ? { owner, askedAtMs, confirmed } : undefined;
}

class OwnerConfirmation implements OwnerGate {
  readonly #policy: OwnerPolicy;
  readonly #services: CoreServices;
  readonly #now: () => number;

  constructor(policy: OwnerPolicy, services: CoreServices, now: () => number) {
    this.#policy = policy;
    this.#services = services;
    this.#now = now;
  }

  #applies(): boolean {
    return this.#policy.mode === "first_connected" && this.#policy.view().owners.length === 0;
  }

  pending(): { readonly owner: string; readonly confirmed: boolean } | null {
    if (!this.#applies()) return null;
    const record = readConfirmation(this.#services.state.get<Json>(NAMESPACES.meta, CONFIRM_KEY));
    return record === undefined ? null : { owner: record.owner, confirmed: record.confirmed };
  }

  // Throws precondition_failed (owner_confirmation_required / owner_confirmation_pending) while a confirmation is
  // outstanding. It is an async check because the question is stored, so the server calls the sync gate first and
  // this one through `confirm`.
  async confirm(route: RouteKey, owner: string): Promise<void> {
    this.#policy.checkRoute(route, owner);
    if (!this.#applies()) return;
    const lowered = owner.toLowerCase();
    const nowMs = this.#now();
    const record = readConfirmation(this.#services.state.get<Json>(NAMESPACES.meta, CONFIRM_KEY));
    if (record !== undefined && record.owner === lowered) {
      if (record.confirmed) return;
      const waited = nowMs - record.askedAtMs;
      if (waited > OWNER_CONFIRM_WINDOW_MS) {
        // Too old: ask again from the start.
      } else if (waited < OWNER_CONFIRM_MIN_DELAY_MS) {
        throw new RelayError(
          "precondition_failed",
          `Waiting for the user to confirm ${lowered} as this relay's owner. Do not repeat the call until they have answered; if they confirm, repeat it once.`,
          { reason: "owner_confirmation_pending", owner: lowered, wait_s: Math.ceil((OWNER_CONFIRM_MIN_DELAY_MS - waited) / 1000) },
        );
      } else {
        await this.#services.state.set(NAMESPACES.meta, CONFIRM_KEY, { owner: lowered, askedAtMs: record.askedAtMs, confirmed: true });
        await this.#services.audit.write({ ev: "request", state: "owner_confirmed", owner: lowered, outcome: "ok", sync: true });
        return;
      }
    }
    await this.#services.state.set(NAMESPACES.meta, CONFIRM_KEY, { owner: lowered, askedAtMs: nowMs, confirmed: false });
    await this.#services.audit.write({ ev: "refused", state: "owner_confirmation_asked", owner: lowered, outcome: "refused", sync: true });
    throw new RelayError(
      "precondition_failed",
      `No owner is bound yet: this relay binds to the first wallet that signs. The request names ${lowered}. Show it to the user and ask if it is their wallet. If yes, repeat the same call once. To skip this step, set XO_OWNER to the address and restart.`,
      { reason: "owner_confirmation_required", owner: lowered },
    );
  }

  checkRoute(route: RouteKey, owner: string): void {
    this.#policy.checkRoute(route, owner);
  }

  serves(owner: string): boolean {
    return this.#policy.serves(owner);
  }

  async bindAfterSubmit(preparedId: string): Promise<void> {
    await this.#policy.bindAfterSubmit(preparedId);
    if (this.#policy.view().owners.length > 0 && readConfirmation(this.#services.state.get<Json>(NAMESPACES.meta, CONFIRM_KEY)) !== undefined) {
      await this.#services.state.delete(NAMESPACES.meta, CONFIRM_KEY).catch(() => undefined);
    }
  }
}

// ---- the relay ------------------------------------------------------------------------------------------------------------------------

export async function createEmbeddedRelay(options: EmbeddedRelayOptions): Promise<EmbeddedRelay> {
  const now = options.clock ?? Date.now;
  const env: FlagEnv = { ...options.env, [RELAY_ENV.dataDir]: options.dataDir };
  const http: RelayHttpConfig = { ...DEFAULT_HTTP, ...options.http };

  const wiring = prepareWiring({
    env,
    now,
    ...(options.userops === undefined ? {} : { userops: options.userops }),
    ...(options.useropExtensions === undefined ? {} : { useropExtensions: options.useropExtensions }),
    ...(options.extraServices === undefined ? {} : { extraServices: options.extraServices }),
    ...(options.accounts === undefined ? {} : { accounts: options.accounts }),
    // The creation watcher follows the same switch as the rest of the upkeep.
    ...(options.maintenance === false ? { creationIntervalMs: 0 } : {}),
  });

  const core = await assembleCore({
    env,
    requireRelayKey: false,
    now,
    accounts: wiring.accounts,
    ...(options.masterSecret === undefined ? {} : { masterSecret: options.masterSecret }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    ...(options.fs === undefined ? {} : { fs: options.fs }),
    ...(options.kdf === undefined ? {} : { kdf: options.kdf }),
    ...(options.allowWeakKdf === true ? { allowWeakKdf: true } : {}),
    ...(options.isProcessAlive === undefined ? {} : { isProcessAlive: options.isProcessAlive }),
    ...(options.hookRunner === undefined ? {} : { hookRunner: options.hookRunner }),
    ...(options.tripwireCheckers === undefined ? {} : { tripwireCheckers: options.tripwireCheckers }),
    ...(options.extraUpstreamHosts === undefined ? {} : { extraUpstreamHosts: options.extraUpstreamHosts }),
    extraServices: wiring.extraServices,
  });
  const table: RouteTable = options.routes ?? defaultRoutes;
  const flags = core.flags;
  const audit = core.services.audit;

  let owners: OwnerPolicy;
  try {
    owners = OwnerPolicy.open(env, core.services);
  } catch (error) {
    await core.close().catch(() => undefined);
    throw error;
  }
  const confirmation = options.ownerConfirmation === false ? undefined : new OwnerConfirmation(owners, core.services, now);
  // Last step that can still fail is behind us: resume the creation watchers (if any) and let the directories find the relay.
  wiring.bind(core);

  const newRequestId = options.newRequestId ?? ((): string => `req_${randomBytes(6).toString("hex")}`);
  const buckets = new TokenBuckets();
  const background = new Set<Promise<unknown>>();
  const stopper = new AbortController();
  let closing = false;

  const contextFor = (requestId: string, signal: AbortSignal): RelayContext => ({ flags, now, requestId, signal, services: core.services });

  // ---- one request ----------------------------------------------------------------------------------------------------------------

  async function dispatch(request: EmbeddedRequest): Promise<Reply> {
    const startedAt = now();
    const requestId = newRequestId();
    let routeKey: RouteKey | undefined;
    const note = (outcome: "ok" | "refused" | "error" | "pending", final: Reply): void => {
      void audit.write({
        ev: outcome === "refused" ? "refused" : "request",
        rid: requestId,
        route: routeKey ?? "unmatched",
        status: final.status,
        ...(final.code === undefined ? {} : { code: final.code }),
        outcome,
        ms: Math.max(0, now() - startedAt),
      });
    };
    const refuse = (reply: Reply): Reply => {
      note("refused", reply);
      return reply;
    };

    if (closing) return errorReply("internal", "The relay is shutting down.", undefined, 503);

    // The route.
    const target = parseTarget(request.path);
    if (!target.ok) return refuse(errorReply("invalid_request", target.reason === "query" ? "These routes take no query string." : "The request path is not valid."));
    let getParams: Readonly<Record<string, string>> = {};
    if (request.method === "POST" && isPostPath(target.path)) {
      routeKey = `POST ${target.path}`;
    } else if (request.method === "GET") {
      const matched = matchGetRoute(target.path);
      if (matched !== undefined) {
        routeKey = `GET ${matched.route}`;
        getParams = matched.params;
      }
    }
    if (routeKey === undefined) {
      const otherMethod = isPostPath(target.path) || matchGetRoute(target.path) !== undefined;
      return refuse(otherMethod ? errorReply("invalid_request", "That route does not take this method.", undefined, 405) : errorReply("not_found", "No such route."));
    }
    const isWrite = !READ_ROUTE_KEYS.has(routeKey);

    // The kill switch: every write route, and any route not on the read list.
    if (isWrite && flags().KILL !== false) return refuse(errorReply("kill_switch", "The kill switch is on: every write is disabled. Reads still work."));

    // Per-endpoint token bucket (one local client).
    const limit = buckets.take(`embedded|${routeKey}`, isWrite ? http.writeRate : http.readRate, now());
    // The HTTP server says it as a Retry-After header in whole seconds, which the client turns into milliseconds.
    if (!limit.allowed) return refuse(errorReply("rate_limited", "Too many requests for this endpoint. Slow down.", { retry_after_ms: Math.max(1, Math.ceil(limit.retryAfterMs / 1000)) * 1000 }));

    const handler = (table as Readonly<Record<string, unknown>>)[routeKey];
    if (typeof handler !== "function") return refuse(errorReply("not_implemented", "This route is in the contract but has no handler yet."));

    // The body.
    let input: unknown;
    if (request.method === "POST") {
      if (request.bodyText === undefined || Buffer.byteLength(request.bodyText, "utf8") > http.bodyLimitBytes) {
        return refuse(errorReply("invalid_request", "The request body is too large.", { reason: "body_too_large", limit_bytes: http.bodyLimitBytes }, 413));
      }
      let json: unknown;
      try {
        json = JSON.parse(request.bodyText);
      } catch {
        return refuse(errorReply("invalid_request", "The body is not valid JSON."));
      }
      if (hasForbiddenKey(json)) return refuse(errorReply("invalid_request", "The body contains a key that is not allowed."));
      const parsed = POST_ROUTES[routeKey.slice(5) as keyof typeof POST_ROUTES].request.safeParse(json);
      if (!parsed.success) {
        const fields = [...new Set(parsed.error.issues.slice(0, 8).map((issue) => issue.path.map(safeFieldName).join(".") || "(body)"))];
        return refuse(errorReply("invalid_request", "The request does not match the contract.", { fields }));
      }
      input = parsed.data;
    } else {
      const parsed = GET_ROUTES[routeKey.slice(4) as keyof typeof GET_ROUTES].params.safeParse(getParams);
      if (!parsed.success) return refuse(errorReply("invalid_request", "The path parameter does not match the contract."));
      input = parsed.data;
    }

    // Which owners this process serves: for a write, the owner it names; for a read of a stored item, the item's owner.
    if (OWNER_WRITE_ROUTES.has(routeKey)) {
      try {
        const wanted = (input as { owner: string }).owner;
        if (confirmation === undefined) owners.checkRoute(routeKey, wanted);
        else await confirmation.confirm(routeKey, wanted);
      } catch (error) {
        return refuse(replyFromError(error));
      }
    }
    try {
      checkOwnerScopedRead(owners, routeKey, input, core.services);
    } catch (error) {
      return refuse(replyFromError(error));
    }

    // The handler, with the answer-by budget. The caller's cancel reaches the handler only until the
    // answer has been given, as a closed connection would: a send already under way is never aborted
    // by a caller that has stopped listening.
    const controller = new AbortController();
    const hardTimer = setTimeout(() => controller.abort(), http.hardDeadlineMs);
    hardTimer.unref();
    const onCallerAbort = (): void => controller.abort();
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", onCallerAbort, { once: true });
    const onStop = (): void => controller.abort();
    stopper.signal.addEventListener("abort", onStop, { once: true });
    const responseSchema =
      request.method === "POST"
        ? POST_ROUTES[routeKey.slice(5) as keyof typeof POST_ROUTES].response
        : GET_ROUTES[routeKey.slice(4) as keyof typeof GET_ROUTES].response;
    const submitted = SUBMIT_ROUTES.has(routeKey) ? (input as { prepared_id: string }).prepared_id : undefined;
    const context = contextFor(requestId, controller.signal);

    const work: Promise<Reply> = (async (): Promise<Reply> => {
      try {
        const answered = await (handler as (body: unknown, context: RelayContext) => Promise<unknown>)(input, context);
        // R1: an item from a module that predates the decoded block gets one here, or goes on without.
        const output = await withDecodedBlock(routeKey, answered, core.services);
        const checked = responseSchema.safeParse(output);
        if (!checked.success) {
          void audit.write({ ev: "error", rid: requestId, route: routeKey, code: "response_invalid", outcome: "error" });
          return errorReply("internal", "The relay produced an answer that does not match its contract. Nothing was sent.");
        }
        // R9: a prepared item is kept as it is sent, so GET /v1/prepared/{id} can return exactly this answer.
        await keepPreparedAnswer(routeKey, checked.data, core.services);
        if (submitted !== undefined) await (confirmation ?? owners).bindAfterSubmit(submitted).catch(() => undefined);
        return { status: 200, body: checked.data };
      } catch (error) {
        if (!(error instanceof RelayError)) {
          void audit.write({ ev: "error", rid: requestId, route: routeKey, code: "handler_threw", outcome: "error", note: error instanceof Error ? error.name : "non_error" });
        }
        return replyFromError(error);
      } finally {
        clearTimeout(hardTimer);
        stopper.signal.removeEventListener("abort", onStop);
      }
    })();

    let budgetTimer: NodeJS.Timeout | undefined;
    const budget = new Promise<"pending">((resolve) => {
      budgetTimer = setTimeout(() => resolve("pending"), http.requestBudgetMs);
    });
    const first = await Promise.race([work, budget]);
    clearTimeout(budgetTimer);
    request.signal.removeEventListener("abort", onCallerAbort);
    if (first === "pending") {
      const pending: Reply = { status: ERROR_HTTP_STATUS.pending, body: PENDING_BODY, code: "pending" };
      note("pending", pending);
      const late = work.then((final) => {
        void audit.write({
          ev: "request",
          rid: requestId,
          route: routeKey ?? "unmatched",
          status: final.status,
          ...(final.code === undefined ? {} : { code: final.code }),
          outcome: final.status < 400 ? "ok" : "error",
          state: "completed_late",
          ms: Math.max(0, now() - startedAt),
        });
      });
      background.add(late);
      void late.finally(() => background.delete(late));
      return pending;
    }
    note(first.status < 400 ? "ok" : first.status >= 500 ? "error" : "refused", first);
    return first;
  }

  const handler: EmbeddedHandler = async (request): Promise<EmbeddedReply> => {
    let reply: Reply;
    try {
      reply = await dispatch(request);
    } catch {
      // dispatch answers every request itself; this keeps an unexpected throw from reaching the caller.
      reply = errorReply("internal", "The relay failed unexpectedly. Nothing was sent.");
    }
    return { status: reply.status, bodyText: JSON.stringify(reply.body) };
  };

  // ---- upkeep -----------------------------------------------------------------------------------------------------------------------

  let maintaining: Promise<void> | undefined;
  async function maintainNow(): Promise<void> {
    if (closing) return;
    await runUpkeep(contextFor("req_maintenance", stopper.signal), options.tripwireCheckers ?? []);
  }
  const maintain = (): Promise<void> => {
    // Rounds do not overlap: a slow one is waited for, not doubled.
    maintaining ??= maintainNow().finally(() => {
      maintaining = undefined;
    });
    return maintaining;
  };

  // Start-up: make the credential records agree with the vault (a crash right after a key was minted).
  await healAtStart(contextFor("req_startup", stopper.signal));
  await audit.write({
    ev: "startup",
    outcome: "ok",
    state: core.services.tripwires.isTripped() ? "tripwire_active" : "ready",
    note: `embedded; owners ${owners.mode}; kill ${flags().KILL ? "on" : "off"}; ${core.config.enforceFlagFacts ? "flag facts enforced" : "flag facts NOT enforced"}`,
    sync: true,
  });

  let timer: NodeJS.Timeout | undefined;
  if (options.maintenance !== false) {
    timer = setInterval(() => void maintain(), options.maintenanceIntervalMs ?? 60_000);
    timer.unref();
  }

  const stopTimer = (): void => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };
  return {
    client: createEmbeddedRelayClient(handler),
    handler,
    config: core.config,
    services: core.services,
    flags,
    recovered: core.recovered,
    issues: wiring.issues,
    owners: () => owners.view(),
    ownerConfirmation: () => confirmation?.pending() ?? null,
    maintain,
    async idle() {
      while (background.size > 0) await Promise.allSettled([...background]);
    },
    async close() {
      if (closing) return;
      stopTimer();
      wiring.stop();
      await maintaining?.catch(() => undefined);
      await audit.write({ ev: "shutdown", outcome: "ok", sync: true });
      // Let handlers that were answered `pending` finish (bounded), then stop whatever is left.
      const grace = new Promise<void>((resolve) => setTimeout(resolve, http.shutdownGraceMs).unref());
      await Promise.race([(async () => { while (background.size > 0) await Promise.allSettled([...background]); })(), grace]);
      closing = true;
      stopper.abort();
      await core.close();
    },
    async abandon() {
      stopTimer();
      wiring.stop();
      closing = true;
      stopper.abort();
      await core.abandon();
    },
  };
}

// Re-exported so a caller can tell which write routes exist without importing the server.
export { WRITE_ROUTE_KEYS };
