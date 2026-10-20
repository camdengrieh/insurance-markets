import { randomBytes } from "node:crypto";

import { Secret } from "../../../src/config.js";
import { createRelayClient } from "../../../src/relay/client.js";
import { RELAY_USER_AGENT, type RelayClient } from "../../../src/relay/contract.js";
import type { WriteFlagName } from "../../../src/relay/flags.js";
import { createRelay, type CoreServices, type CreateRelayOptions, type Relay } from "../../../relay/main.js";
import { createCredentialRoutes, credentialReadiness, signL2 } from "../../../relay/credentials.js";
import * as creationModule from "../../../relay/creation.js";
import { routes as fundingRoutes } from "../../../relay/funding.js";
import { routes as healthRoutes } from "../../../relay/health.js";
import { createOrderRoutes, type L2Auth } from "../../../relay/orders.js";
import { mergeRoutes } from "../../../relay/routes.js";
import type { RelayServices, RouteTable } from "../../../relay/types.js";
import { createAccountDirectory, loadUserOpOptions, routes as useropRoutes, type UserOpExtensions } from "../../../relay/userops.js";
import type { AllowedHost } from "../../../relay/upstream.js";
import type { Net } from "./net.js";
import type { Clock, Env } from "./types.js";

// The relay of one live-kit run: in this process, on 127.0.0.1 and a free port, with a key made for this
// run alone (it is never printed and never leaves the machine). Because the kit hosts the relay itself it
// can read and write the relay's capability facts, which no HTTP route offers (the contract is frozen).
// The facts live in the data directory, so a `pnpm relay` started later on the same directory sees them.
// Stop that relay first: a data directory has one owner at a time.
//
// What this wires, because createRelay does not do it by itself (relay/userops.ts "WIRING"):
//   accounts      the account directory behind POST /v1/account/status (relay/userops.ts)
//   userops       XO_RPC_URL / XO_BUNDLER_URL / allowance policy from the environment
//   l2auth        orders sign their XO calls through the credential module (relay/credentials.ts signL2);
//                 without this the orders module would look for a vault secret the credential flow never writes
//   routes        health, credentials, orders, userops, funding, creation
// Which flags are on is decided here: only the flags the test arms (RELAY_ARM) are switched on, whatever
// the operator's shell has set. The kill switch is the exception: it comes from the environment and wins.

export interface StartRelayArgs {
  readonly env: Env;
  readonly dataDir: string;
  readonly flagsToArm: readonly WriteFlagName[];
  readonly credentialStore: boolean;
  readonly masterSecret?: Secret;
  readonly net: Net;
  readonly clock: Clock;
  // Extra upstream hosts (the Base node).
  readonly extraUpstreamHosts?: readonly AllowedHost[];
  // The creation stream's wiring, when a caller has any.
  readonly extraServices?: Partial<RelayServices>;
  readonly createOptions?: Partial<CreateRelayOptions>;
  // false: leave the relay's own request budget at its defaults (the live target). The mock target raises it,
  // because mock time moves in jumps and a request must not be answered `pending` by accident.
  readonly generousBudgets?: boolean;
}

export interface RunRelay {
  readonly relay: Relay;
  readonly services: CoreServices;
  readonly url: string;
  readonly client: RelayClient;
  // The key of this run; registered with the printer by the caller.
  readonly key: Secret;
  readonly issues: readonly string[];
  // One pass of the creation watcher, when this build has a real one (the mock rehearsal calls it as it moves its clock).
  readonly creationTick: (() => Promise<unknown>) | undefined;
  close(): Promise<void>;
}

// Variables the operator's environment may pass on to the relay. Everything else is dropped: a flag that
// happens to be set in the shell must not switch a write path on.
export const PASS_THROUGH = [
  "XO_MAX_ORDER_USD",
  "XO_MAX_DAILY_USD",
  "XO_PRICE_BAND_TICKS",
  "XO_QUOTE_TTL_SECONDS",
  "XO_ORDER_EXPIRY_SECONDS",
  "KILL",
  "XO_KILL_SWITCH",
  "RELAY_BASE_RPC_URL",
  "XO_RPC_URL",
  "XO_BUNDLER_URL",
  "RELAY_ALLOWANCE_POLICY",
  "RELAY_UNLIMITED_BALANCE_MAX_USD",
  "RELAY_ALLOWANCE_FLOOR_USD",
  "RELAY_SEED_CAP_USD",
  "RELAY_FUNDING_TEST_CAP_USD",
  "RELAY_FUNDING_DAILY_CAP_USD",
  "RELAY_SELF_HOST",
  "RELAY_ACK_TRIPWIRES",
  "RELAY_ENFORCE_FLAG_FACTS",
] as const;

// What the creation stream's relay module offers in this build: the route (POST /v1/creation/track) and a
// runtime that supplies the create, respond and cancel builders and the "did this owner create this market"
// check a seed needs. There is no stand-in: a build without the real thing refuses create_market, on both targets,
// and the creation tests then say so instead of rehearsing something else.
export function realCreation(): { readonly routes: boolean; readonly createRuntime: ((options?: { readonly intervalMs?: number; readonly now?: () => number }) => CreationRuntimeLike) | undefined } {
  const mod = creationModule as unknown as Record<string, unknown>;
  const asObject = (value: unknown): object | undefined => (typeof value === "object" && value !== null ? value : undefined);
  const routes = asObject(mod["routes"]);
  const factory = mod["createCreationRuntime"];
  return {
    routes: routes !== undefined && Object.keys(routes).length > 0,
    createRuntime: typeof factory === "function" ? (factory as NonNullable<ReturnType<typeof realCreation>["createRuntime"]>) : undefined,
  };
}

// The part of the creation runtime this file uses (relay/creation.ts createCreationRuntime).
export interface CreationRuntimeLike {
  readonly extraServices: Partial<RelayServices>;
  attach(relay: { readonly services: CoreServices; readonly flags: Relay["flags"] }): void;
  tick(): Promise<unknown>;
  stop(): void;
}

export function relayEnvFor(args: Pick<StartRelayArgs, "env" | "dataDir" | "flagsToArm" | "credentialStore">, key: string): Record<string, string> {
  const env: Record<string, string> = {
    RELAY_DATA_DIR: args.dataDir,
    XO_RELAY_KEY: key,
    RELAY_PORT: "0",
    RELAY_CREDENTIAL_STORE: args.credentialStore ? "on" : "off",
  };
  for (const name of PASS_THROUGH) {
    const value = args.env[name];
    if (typeof value === "string" && value !== "") env[name] = value;
  }
  // The flags this test arms, and only those. XO_ENABLE_CREATE is a flag and a guardrail name at once.
  for (const flag of args.flagsToArm) env[flag] = "1";
  if (args.flagsToArm.length > 0) env["RELAY_ARM"] = args.flagsToArm.join(",");
  return env;
}

function lowerCaseHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

export async function startRunRelay(args: StartRelayArgs): Promise<RunRelay> {
  const key = randomBytes(24).toString("base64url");
  const issues: string[] = [];
  const userops = loadUserOpOptions(args.env);
  for (const issue of userops.issues) issues.push(`${issue.variable}: ${issue.message}`);

  let ref: Relay | undefined;
  const now = (): number => args.clock.nowMs();
  const sleep = (ms: number): Promise<void> => args.clock.sleep(ms);
  const accounts = createAccountDirectory({ upstream: () => ref?.services.upstream, options: userops.options, now });
  const orders = createOrderRoutes({});
  const real = realCreation();
  const creationTable = real.routes ? (creationModule.routes as RouteTable) : {};
  const routes = mergeRoutes(healthRoutes, createCredentialRoutes({ sleep }), orders.routes, useropRoutes, fundingRoutes, creationTable);
  const l2auth: L2Auth | undefined = args.credentialStore
    ? {
        async has(account) {
          const services = ref?.services;
          return services !== undefined && credentialReadiness(services, account).state === "validated";
        },
        async headers(request) {
          const services = ref?.services;
          if (services === undefined) throw new Error("the relay is not up");
          const signed = await signL2({ services, now }, { account: request.account, method: request.method, path: request.path, body: request.body }, { sleep });
          return lowerCaseHeaders(signed.headers);
        },
      }
    : undefined;

  // The real creation runtime when this build has one. On the mock target its timer is off (mock time moves in jumps; the
  // tracker is read on demand by POST /v1/creation/track); on the live target it keeps watching while the process lives.
  const runtime = real.createRuntime?.({ intervalMs: args.generousBudgets === true ? 0 : undefined, now });
  const useropExtensions = runtime?.extraServices.useropExtensions;
  const createdMarkets = runtime?.extraServices.createdMarkets;
  const extraServices: Partial<RelayServices> = {
    userops: userops.options,
    ...(l2auth === undefined ? {} : { l2auth }),
    ...(useropExtensions === undefined ? {} : { useropExtensions }),
    ...(createdMarkets === undefined ? {} : { createdMarkets }),
    ...(args.extraServices as Partial<RelayServices> | undefined),
  };
  const relay = await createRelay({
    env: relayEnvFor(args, key),
    ...(args.masterSecret === undefined ? {} : { masterSecret: args.masterSecret }),
    fetch: args.net.fetch,
    now,
    sleep,
    accounts,
    routes,
    maintenance: false,
    extraServices,
    ...(args.extraUpstreamHosts === undefined ? {} : { extraUpstreamHosts: args.extraUpstreamHosts }),
    ...(args.generousBudgets === true
      ? {
          http: {
            readRate: { capacity: 100_000, refillPerSecond: 100_000 },
            writeRate: { capacity: 100_000, refillPerSecond: 100_000 },
            requestBudgetMs: 120_000,
            hardDeadlineMs: 180_000,
          },
        }
      : {}),
    ...args.createOptions,
  });
  ref = relay;
  runtime?.attach(relay);
  args.net.setRelayOrigin(relay.server.origin);
  const secret = new Secret(key);
  const client = createRelayClient({ baseUrl: relay.url, key: secret, fetch: args.net.fetch });
  return {
    relay,
    services: relay.services,
    url: relay.url,
    client,
    key: secret,
    issues,
    creationTick: runtime === undefined ? undefined : () => runtime.tick(),
    close: async () => {
      runtime?.stop();
      await relay.close();
    },
  };
}

// The pinned User-Agent, for the places that need to say it.
export const KIT_USER_AGENT = RELAY_USER_AGENT;
export type { UserOpExtensions };
