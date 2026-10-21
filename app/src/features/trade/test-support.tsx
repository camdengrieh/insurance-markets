// Builders for the trade screens' tests: the plugin's recorded answers (fixtures/), a scripted daemon behind a fake
// raw fetch (the terminal's), a services record with an injected clock, and a mount helper. Pure code with no Node
// import (the boundary check treats every non-*.test file under app/src as bundled code); only test files import it.

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { FakeTimers } from "../../core/fakes";
import { NO_FACTS, type CapabilityFacts, type CapabilityId } from "../../core/capabilities";
import { ClockProvider, ModeProvider, createAppQueryClient } from "../../ui";
import { act, render } from "../../ui/testing/dom";
import { PAIR_CODE, TOKEN, binding, errorReply, fakeServices, flush, jsonReply, memoryStorage, scriptedDaemon, toolEnvelope, until, type Daemon } from "../terminal/test-support";
import fundFixture from "./fixtures/fund-answers.json";
import relayFixture from "./fixtures/relay-answers.json";
import quoteFixture from "./fixtures/ticket-quotes.json";
import { createTradeServices, TradeServicesProvider, type TradeServices } from "./services";
import { TradeDesk, type TradeDeskProps } from "./TradeDesk";

export { PAIR_CODE, TOKEN, flush, until, jsonReply, memoryStorage, toolEnvelope };
export { errorReply as errorReplyOf };
export type { Daemon };

export const OWNER = relayFixture.owner;
export const FRESH_OWNER = relayFixture.fresh_owner;
export const RELAY_ANSWERS = relayFixture.answers as unknown as Readonly<Record<string, { readonly tool: string; readonly args: Record<string, unknown>; readonly recorded_at_ms: number; readonly structured: Record<string, any> }>>;
export const FUND_ANSWERS = fundFixture.answers as unknown as Readonly<Record<string, { readonly tool: string; readonly args: Record<string, unknown>; readonly recorded_at_ms: number; readonly structured: Record<string, any> }>>;
export const TICKET_QUOTES = quoteFixture.tickets;
export const REDEEM_IDS: readonly string[] = (RELAY_ANSWERS["_redeem_ids"] as unknown as { ids: string[] }).ids;
export const TOKENS = RELAY_ANSWERS["_tokens"] as unknown as { yes: string; no: string; condition_id: string };

// Deep copy of a recorded structured answer, so a test can tamper with it.
export function copyOf<T>(value: T): T {
  return structuredClone(value);
}

export function answer(name: string): Record<string, any> {
  const found = RELAY_ANSWERS[name];
  if (found === undefined) throw new Error(`no recorded answer ${name}`);
  return copyOf(found.structured);
}

export function recordedAt(name: string): number {
  const found = RELAY_ANSWERS[name];
  if (found === undefined) throw new Error(`no recorded answer ${name}`);
  return found.recorded_at_ms;
}

// A fact record with the listed facts set to "yes" and the rest unknown.
export function factsWith(yes: readonly CapabilityId[], no: readonly CapabilityId[] = []): CapabilityFacts {
  const facts: Record<string, "yes" | "no" | "unknown"> = { ...NO_FACTS };
  for (const id of yes) facts[id] = "yes";
  for (const id of no) facts[id] = "no";
  return facts as CapabilityFacts;
}

// An account answer with the given switches on (both the plugin's and the relay's), taken from the recorded one.
export function accountWith(name: string, on: readonly string[] = [], extra: Record<string, unknown> = {}): Record<string, any> {
  const base = answer(name);
  for (const side of ["plugin", "relay"] as const) {
    for (const flag of on) base["flags"][side][flag] = true;
  }
  return { ...base, ...extra };
}

export interface TradeRig {
  readonly daemon: Daemon;
  readonly services: TradeServices;
  readonly timers: ReturnType<typeof fakeServices>["timers"];
}

export interface RigOptions {
  readonly facts?: CapabilityFacts;
  readonly owner?: string;
  readonly code?: string | undefined;
  readonly noOwners?: boolean;
  // The page clock at the start. The recorded items expire minutes after they were recorded, so a test sets it near that.
  readonly startMs?: number;
}

// Fake daemon: pairing works, the account is read from `account`, open orders from `orders`, and any prepare tool
// from the handlers a test installs on daemon.tools.
export function makeRig(options: RigOptions = {}): TradeRig {
  const daemon = scriptedDaemon();
  const owner = options.owner ?? OWNER;
  const { services: terminal, timers } = fakeServices({
    daemon,
    code: "code" in options ? options.code : PAIR_CODE,
    bindings: options.noOwners === true ? [] : [binding({ id: "b1", address: owner })],
    ...(options.startMs === undefined ? {} : { timers: new FakeTimers(options.startMs) }),
  });
  const services = createTradeServices(terminal, { facts: () => options.facts ?? NO_FACTS });
  return { daemon, services, timers };
}

export function installReads(daemon: Daemon, account: Record<string, unknown>, orders: Record<string, unknown> = answer("list_orders_one")): void {
  daemon.tools.set("xo_account", () => toolEnvelope("xo_account", account));
  daemon.tools.set("xo_list_orders", () => toolEnvelope("xo_list_orders", orders));
}

export function prepareEnvelope(tool: string, structured: unknown): Record<string, unknown> {
  return { ...toolEnvelope(tool, structured), tool_class: "prepare" };
}

export function mountTrade(rig: TradeRig, props: Omit<TradeDeskProps, "services"> = {}): { readonly container: HTMLElement; unmount(): void } {
  const location = memoryLocation({ path: "/" });
  const ui: ReactElement = (
    <QueryClientProvider client={createAppQueryClient()}>
      <ModeProvider mode="cockpit">
        <ClockProvider clock={{ now: rig.timers.clock }}>
          <Router hook={location.hook}>
            <TradeServicesProvider services={rig.services}>
              <TradeDesk {...props} />
            </TradeServicesProvider>
          </Router>
        </ClockProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
  return render(ui);
}

// Types into a text input the way a person does: through the value setter React watches, then an input event.
export function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
