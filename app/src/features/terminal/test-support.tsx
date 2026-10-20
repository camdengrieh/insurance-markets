// Builders for the terminal's tests: a scripted daemon behind a fake raw fetch, a controllable event stream, a
// services record with an injected clock, and a mount helper. Pure code with no Node import (the boundary check
// treats every non-*.test file under app/src as bundled code); only test files import it.

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import type { AddressBinding } from "../../core/bindings";
import type { Env } from "../../core/env";
import { FakeRaw, FakeTimers, rawResponse } from "../../core/fakes";
import type { RawResponse } from "../../core/fetch";
import { ClockProvider, ModeProvider, createAppQueryClient } from "../../ui";
import { act, render } from "../../ui/testing/dom";
import marketFixture from "./fixtures/plugin-xo_get_market.json";
import bookNoFixture from "./fixtures/plugin-xo_orderbook-no.json";
import bookYesFixture from "./fixtures/plugin-xo_orderbook-yes.json";
import positionsFixture from "./fixtures/plugin-xo_positions.json";
import searchFixture from "./fixtures/plugin-xo_search.json";
import { TerminalView } from "./TerminalView";
import { createTerminalServices, TerminalServicesProvider, type TerminalServices } from "./services";
import type { StorageLike } from "./session";

export const NOW = Date.parse("2026-10-19T12:00:00.000Z");
export const TOKEN = `cku_${"A".repeat(43)}`;
export const OTHER_TOKEN = `cku_${"B".repeat(43)}`;
export const PAIR_CODE = "0123456789abcdef0123456789abcdef";

export function jsonReply(status: number, value: unknown, headers: Readonly<Record<string, string>> = {}): RawResponse {
  return rawResponse({ status, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}

export function errorReply(status: number, code: string, extra: { readonly retry_after_s?: number } = {}): RawResponse {
  return jsonReply(status, { error: { code, message: "fixed daemon wording", ...extra } });
}

// An event stream the test controls: push frames, end it, or let the reader be cancelled.
export class LiveStream {
  readonly response: RawResponse;
  cancelled = false;
  #queue: Uint8Array[] = [];
  #waiting: ((value: { readonly done: boolean; readonly value?: Uint8Array }) => void) | null = null;
  #ended = false;

  constructor() {
    this.response = {
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "text/event-stream" : null) },
      body: {
        getReader: () => ({
          read: () =>
            new Promise((resolve) => {
              const next = this.#queue.shift();
              if (next !== undefined) resolve({ done: false, value: next });
              else if (this.#ended) resolve({ done: true });
              else this.#waiting = resolve;
            }),
          cancel: async () => {
            this.cancelled = true;
            this.end();
          },
        }),
      },
      text: async () => "",
    };
  }

  push(text: string): void {
    const bytes = new TextEncoder().encode(text);
    if (this.#waiting !== null) {
      const resolve = this.#waiting;
      this.#waiting = null;
      resolve({ done: false, value: bytes });
    } else {
      this.#queue.push(bytes);
    }
  }

  end(): void {
    this.#ended = true;
    if (this.#waiting !== null) {
      const resolve = this.#waiting;
      this.#waiting = null;
      resolve({ done: true });
    }
  }
}

export function frame(id: number, event: unknown): string {
  return `id: ${String(id)}\ndata: ${JSON.stringify(event)}\n\n`;
}

// ---- contract-shaped values --------------------------------------------------------------------------------------------------

export function statusBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_version: 1,
    version: "0.2.0",
    time: "2026-10-19T12:00:00Z",
    posture: "OBSERVE",
    armed_until: null,
    kill: false,
    instance: "writer",
    flags: { ENABLE_USEROP_SUBMIT: false, ENABLE_TRADING: false, ENABLE_FUNDING: false, ENABLE_WITHDRAW: false, XO_ENABLE_CREATE: false, ENABLE_SELF_HOSTED_METADATA: false, KILL: false },
    tripwires: { ok: true, tripped: [] },
    upstream: { "api-mainnet.xo.market": { state: "ok", errors: 0, last_error_at: null } },
    capabilities: { T0: "yes", T1: "unknown", T3a: "no" },
    venues: { kalshi: { enabled: false, reason: "default_off", paused_until: null } },
    audit_head: `0x${"ab".repeat(32)}`,
    token: { kind: "ui", scopes: ["read", "prepare"] },
    ...overrides,
  };
}

export function toolEnvelope(tool: string, structured: unknown, extra: { readonly ok?: boolean; readonly text?: string | null; readonly code?: string } = {}): Record<string, unknown> {
  const ok = extra.ok ?? true;
  return {
    tool,
    tool_class: "read",
    ok,
    duration_ms: 12,
    structured: ok ? structured : null,
    text: extra.text ?? null,
    error: ok ? null : { code: extra.code ?? "internal", message: "The tool reported an error. See the text." },
  };
}

export function inboxBody(eventId = 0, items: readonly unknown[] = []): Record<string, unknown> {
  return { items, event_id: eventId };
}

// ---- a scripted daemon -------------------------------------------------------------------------------------------------------

export type ToolHandler = (args: Record<string, unknown>) => RawResponse | Record<string, unknown> | Promise<RawResponse | Record<string, unknown>>;

export interface Daemon {
  readonly raw: FakeRaw;
  readonly tools: Map<string, ToolHandler>;
  status: () => RawResponse;
  inbox: () => RawResponse;
  events: () => RawResponse;
  pair: (body: unknown) => RawResponse;
  // Every tool name the page asked for, in order.
  readonly toolCalls: string[];
  // Paths requested, in order.
  paths(): string[];
}

export function scriptedDaemon(): Daemon {
  const tools = new Map<string, ToolHandler>();
  const toolCalls: string[] = [];
  const daemon: Daemon = {
    raw: new FakeRaw(),
    tools,
    status: () => jsonReply(200, statusBody()),
    inbox: () => jsonReply(200, inboxBody()),
    events: () => new LiveStream().response,
    pair: () => jsonReply(200, { token: TOKEN, kind: "ui", scopes: ["read", "prepare"] }),
    toolCalls,
    paths: () => daemon.raw.calls.map((call) => call.url),
  };
  daemon.raw.handler = async (url, init) => {
    if (url === "/ui/status") return daemon.status();
    if (url === "/ui/inbox") return daemon.inbox();
    if (url === "/ui/events") return daemon.events();
    if (url === "/ui/pair") return daemon.pair(JSON.parse(init.body ?? "null"));
    if (url === "/ui/tool") {
      const body = JSON.parse(init.body ?? "null") as { tool: string; args: Record<string, unknown> };
      toolCalls.push(body.tool);
      const handler = tools.get(body.tool);
      if (handler === undefined) return errorReply(403, "scope_denied");
      const answer = await handler(body.args);
      return "ok" in answer && "status" in answer && "headers" in answer ? (answer as unknown as RawResponse) : jsonReply(200, answer);
    }
    return errorReply(404, "not_found");
  };
  return daemon;
}

// ---- the plugin's recorded answers ---------------------------------------------------------------------------------------------

export const FIXTURES = { search: searchFixture, market: marketFixture, bookYes: bookYesFixture, bookNo: bookNoFixture, positions: positionsFixture } as const;
export const CONDITION_ID = marketFixture.market.condition_id.toLowerCase();
export const YES_TOKEN = bookYesFixture.token_id;
export const NO_TOKEN = bookNoFixture.token_id;

// Answers every read tool from the recorded fixtures. The positions tool echoes the address it was asked about.
export function installReadTools(daemon: Daemon): void {
  daemon.tools.set("xo_search", () => toolEnvelope("xo_search", searchFixture));
  daemon.tools.set("xo_get_market", () => toolEnvelope("xo_get_market", marketFixture));
  daemon.tools.set("xo_orderbook", (args) => toolEnvelope("xo_orderbook", args["token_id"] === NO_TOKEN ? bookNoFixture : bookYesFixture));
  daemon.tools.set("xo_positions", (args) => toolEnvelope("xo_positions", { ...positionsFixture, address: args["address"] }));
}

// ---- services and mounting ---------------------------------------------------------------------------------------------------------

export function memoryStorage(initial: Readonly<Record<string, string>> = {}): StorageLike & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

export function binding(overrides: Partial<AddressBinding> & { readonly id: string }): AddressBinding {
  return {
    label: "My owner",
    kind: "eoa",
    chain: "evm",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    status: "derived",
    venues: ["xo"],
    source: "pasted",
    ...overrides,
  };
}

export interface FakeEnvBundle {
  readonly timers: FakeTimers;
  readonly env: Env;
}

export function fakeEnv(daemon: Daemon, timers = new FakeTimers(NOW)): FakeEnvBundle {
  return {
    timers,
    env: {
      rawFetch: daemon.raw.fetch,
      timers,
      nowMs: timers.clock,
      sleep: timers.sleep,
      random: () => 0.5,
    },
  };
}

export interface ServicesOptions {
  readonly daemon: Daemon;
  readonly storage?: StorageLike | null;
  readonly code?: string | undefined;
  readonly bindings?: readonly AddressBinding[];
  readonly timers?: FakeTimers;
}

export function fakeServices(options: ServicesOptions): { readonly services: TerminalServices; readonly timers: FakeTimers } {
  const { env, timers } = fakeEnv(options.daemon, options.timers);
  let code = options.code;
  const base = createTerminalServices({
    mode: "cockpit",
    env,
    storage: options.storage === undefined ? memoryStorage() : options.storage,
    consumeCode: () => {
      const once = code;
      code = undefined;
      return once;
    },
  });
  const bindings = options.bindings ?? [];
  const services: TerminalServices = { ...base, loadBindings: async () => ({ bindings, persistence: "memory" }) };
  return { services, timers };
}

export function mountTerminal(services: TerminalServices, timers: FakeTimers): { readonly container: HTMLElement; unmount(): void } {
  const location = memoryLocation({ path: "/terminal" });
  const ui: ReactElement = (
    <QueryClientProvider client={createAppQueryClient()}>
      <ModeProvider mode="cockpit">
        <ClockProvider clock={{ now: timers.clock }}>
          <Router hook={location.hook}>
            <TerminalServicesProvider services={services}>
              <TerminalView />
            </TerminalServicesProvider>
          </Router>
        </ClockProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
  return render(ui);
}

// Let promises and zero-delay timers settle inside act. Fake timers do not advance by themselves.
export async function flush(rounds = 12): Promise<void> {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
  }
}

// Waits by wall-clock time, not by a count of ticks (TM-12): a cold dynamic import on a loaded machine takes as long as it takes.
export async function until(check: () => boolean, limitMs = 15_000): Promise<void> {
  const started = performance.now();
  while (performance.now() - started < limitMs) {
    if (check()) return;
    await flush(1);
  }
  throw new Error("condition not reached");
}
