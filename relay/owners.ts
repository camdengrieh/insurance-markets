import { RelayError } from "../src/relay/errors.js";
import type { RouteKey } from "../src/relay/contract.js";
import type { FlagEnv } from "../src/relay/flags.js";
import { parseOwner } from "../src/xo/account/derive.js";
import { RelayConfigError } from "./config.js";
import type { CoreServices } from "./main.js";
import { preparedNotFound, preparedOwnerOf, type PreparedStore } from "./prepared.js";
import { NAMESPACES, type Json } from "./store.js";

// Which owners a relay process serves for writes (XO_OWNER, XO_ALLOW_ANY_OWNER, else the first owner whose
// signature is accepted). Shared by the in-process relay (relay/embedded.ts) and the HTTP relay (relay/main.ts
// createProductionRelay), so an agent holding the relay key cannot start work for a wallet that is not the
// operator's. The caps are keyed by account, so without this each extra owner would bring its own caps.

export const OWNER_ENV = "XO_OWNER";
export const ALLOW_ANY_OWNER_ENV = "XO_ALLOW_ANY_OWNER";
const BOUND_OWNER_KEY = "local_owner";
const TRUTHY = new Set(["1", "true", "yes", "on"]);

// Routes that start something for an owner. Reads (status, listing, tracking) are open to any owner:
// they change nothing, and an owner with no credential here has nothing to list.
export const OWNER_WRITE_ROUTES: ReadonlySet<RouteKey> = new Set<RouteKey>([
  "POST /v1/auth/prepare",
  "POST /v1/userop/prepare",
  "POST /v1/order/prepare",
  "POST /v1/order/cancel",
  "POST /v1/funding/check",
  "POST /v1/funding/report",
]);
// Reads about one owner's stored item. The pipelines find whose item it is BEFORE the handler runs and answer an
// owner this process does not serve exactly as they answer an id that does not exist (relay/prepared.ts
// preparedNotFound), so the caller learns neither that the item exists nor what state it is in. The relay key (or,
// in-process, being the process) is the only caller identity there is; which owners that caller acts for is this
// policy, the same one the write routes use.
export const OWNER_SCOPED_READ_ROUTES: ReadonlySet<RouteKey> = new Set<RouteKey>(["GET /v1/prepared/:id"]);

// Throws the not-found answer when the route reads an item of an owner the gate does not serve. A relay with no
// gate (a bare test relay) serves every owner, as it does for writes.
export function checkOwnerScopedRead(gate: Pick<OwnerGate, "serves"> | undefined, route: RouteKey, input: unknown, services: { readonly prepared?: PreparedStore }): void {
  if (gate === undefined || !OWNER_SCOPED_READ_ROUTES.has(route)) return;
  const id = typeof input === "object" && input !== null ? (input as { readonly id?: unknown }).id : undefined;
  const owner = preparedOwnerOf(services.prepared, id);
  if (owner !== undefined && !gate.serves(owner)) throw preparedNotFound();
}

// Routes whose success means a signature from the prepared item's owner was verified and used.
export const SUBMIT_ROUTES: ReadonlySet<RouteKey> = new Set<RouteKey>(["POST /v1/auth/submit", "POST /v1/userop/submit", "POST /v1/order/submit"]);

export type OwnerMode = "explicit" | "first_connected" | "any";

export interface OwnerPolicyView {
  readonly mode: OwnerMode;
  // Lower-case owner addresses this process serves for writes. Empty in `any` mode and before the first connect.
  readonly owners: readonly string[];
}

// ---- who this process serves --------------------------------------------------------------------------------------------------

export class OwnerPolicy {
  readonly #services: CoreServices;
  readonly mode: OwnerMode;
  readonly #explicit: readonly string[];
  #bound: string | undefined;

  private constructor(services: CoreServices, mode: OwnerMode, explicit: readonly string[], bound: string | undefined) {
    this.#services = services;
    this.mode = mode;
    this.#explicit = explicit;
    this.#bound = bound;
  }

  // XO_OWNER (one address or a comma or space separated list) wins. XO_ALLOW_ANY_OWNER=1 serves every
  // owner (each one still isolated). Otherwise the first owner whose signature is accepted is bound,
  // and the binding survives restarts.
  static open(env: FlagEnv, services: CoreServices): OwnerPolicy {
    const raw = typeof env[OWNER_ENV] === "string" ? (env[OWNER_ENV] as string).trim() : "";
    if (raw !== "") {
      const owners: string[] = [];
      for (const part of raw.split(/[\s,]+/).filter((entry) => entry !== "")) {
        try {
          owners.push(parseOwner(part).toLowerCase());
        } catch {
          throw new RelayConfigError([{ variable: OWNER_ENV, message: "XO_OWNER holds a value that is not a usable wallet address (0x plus 40 hex digits, not the zero address).", fatal: true }]);
        }
      }
      return new OwnerPolicy(services, "explicit", [...new Set(owners)], undefined);
    }
    const anyRaw = typeof env[ALLOW_ANY_OWNER_ENV] === "string" ? (env[ALLOW_ANY_OWNER_ENV] as string).trim().toLowerCase() : "";
    if (TRUTHY.has(anyRaw)) return new OwnerPolicy(services, "any", [], undefined);
    const stored = services.state.get<Json>(NAMESPACES.meta, BOUND_OWNER_KEY);
    const storedOwner = typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as { readonly [key: string]: Json })["owner"] : undefined;
    const bound = typeof storedOwner === "string" && /^0x[0-9a-f]{40}$/.test(storedOwner) ? storedOwner : undefined;
    return new OwnerPolicy(services, "first_connected", [], bound);
  }

  view(): OwnerPolicyView {
    if (this.mode === "explicit") return { mode: this.mode, owners: this.#explicit };
    if (this.mode === "first_connected") return { mode: this.mode, owners: this.#bound === undefined ? [] : [this.#bound] };
    return { mode: this.mode, owners: [] };
  }

  // Whether this process acts for the owner: named in XO_OWNER, the bound owner (or any owner before one is bound),
  // or anyone under XO_ALLOW_ANY_OWNER.
  serves(owner: string): boolean {
    const lower = owner.toLowerCase();
    if (this.mode === "any") return true;
    if (this.mode === "explicit") return this.#explicit.includes(lower);
    return this.#bound === undefined || this.#bound === lower;
  }

  // Throws precondition_failed (fixed text, no echo of the caller's value) when this owner is not served.
  check(owner: string): void {
    if (this.serves(owner)) return;
    if (this.mode === "explicit") {
      throw new RelayError("precondition_failed", "This local relay serves only the owner(s) named in XO_OWNER. Use that wallet, or change XO_OWNER and restart.", { reason: "owner_not_allowed" });
    }
    throw new RelayError(
      "precondition_failed",
      "This local relay is bound to the first owner whose signature it accepted, and this is a different wallet. Set XO_OWNER to the wallet you want (or XO_ALLOW_ANY_OWNER=1) and restart.",
      { reason: "owner_not_allowed" },
    );
  }

  // The write-route form of check(): funding additionally needs an owner that is already established (named in
  // XO_OWNER, bound by an earlier signed action, or served under XO_ALLOW_ANY_OWNER). Before that, anyone who can
  // type an address could steer the recipient of a funding to an account of their choosing.
  checkRoute(route: RouteKey, owner: string): void {
    this.check(owner);
    if (route === "POST /v1/funding/check" && this.mode === "first_connected" && this.#bound === undefined) {
      throw new RelayError(
        "precondition_failed",
        "Funding needs a known owner: set XO_OWNER to your wallet and restart, or complete a first signed action (deploy_enable_trading) with it so this relay binds to it.",
        { reason: "owner_not_established" },
      );
    }
  }

  // Called after a submit succeeded: the prepared item's owner has signed, so it is a real wallet.
  async bindAfterSubmit(preparedId: string): Promise<void> {
    if (this.mode !== "first_connected" || this.#bound !== undefined) return;
    const record = this.#services.prepared.get(preparedId);
    if (record === undefined || !(["accepted", "sending", "ambiguous"] as readonly string[]).includes(record.state)) return;
    const owner = record.owner.toLowerCase();
    // The first to get here wins; a concurrent second one finds it set.
    if (this.#bound !== undefined) return;
    this.#bound = owner;
    await this.#services.state.set(NAMESPACES.meta, BOUND_OWNER_KEY, { owner });
    await this.#services.audit.write({ ev: "request", state: "owner_bound", owner, outcome: "ok", sync: true });
  }
}


// What the server needs from a policy (relay/server.ts); the class above satisfies it.
export interface OwnerGate {
  checkRoute(route: RouteKey, owner: string): void;
  // The non-throwing form, for the owner-scoped reads.
  serves(owner: string): boolean;
  bindAfterSubmit(preparedId: string): Promise<void>;
}
