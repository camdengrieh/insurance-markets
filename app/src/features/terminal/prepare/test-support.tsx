// Builders for the prepare commands' tests: a scripted daemon with the terminal and trade services over it, the
// plugin's recorded answers (trade/fixtures, terminal/fixtures) and a mount helper. Pure code with no Node import
// (the boundary check treats every non-*.test file under app/src as bundled code); only test files import it.

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import { CAPABILITY_IDS, type CapabilityFacts } from "../../../core/capabilities";
import type { AddressBinding } from "../../../core/bindings";
import { FakeTimers } from "../../../core/fakes";
import { ClockProvider, ModeProvider, createAppQueryClient } from "../../../ui";
import { act, render } from "../../../ui/testing/dom";
import { createTradeServices, TradeServicesProvider, type TradeServices } from "../../trade/services";
import { FIXTURES, PAIR_CODE, binding, fakeServices, scriptedDaemon, toolEnvelope, type Daemon } from "../test-support";
import { TerminalServicesProvider, type TerminalServices } from "../services";
import { OWNER, TOKENS, accountWith, factsWith, installReads, prepareEnvelope, recordedAt } from "../../trade/test-support";
import { PrepareConsole, type ProposalInput } from "./PrepareConsole";
import { marketReaderOver, type RunDeps } from "./run";

export { OWNER, TOKENS, accountWith, answer, copyOf, factsWith, prepareEnvelope, recordedAt, REDEEM_IDS, FRESH_OWNER, FUND_ANSWERS, typeInto } from "../../trade/test-support";
export { flush, until, toolEnvelope, TOKEN } from "../test-support";

export const ALL_WRITE_FLAGS = ["ENABLE_USEROP_SUBMIT", "ENABLE_TRADING", "ENABLE_FUNDING", "ENABLE_WITHDRAW"] as const;
export const ALL_YES: CapabilityFacts = factsWith([...CAPABILITY_IDS]);

// The one tool each prepare command may reach, and the reads around it. Anything else is a failure of the module.
export const ALLOWED_TOOLS: readonly string[] = ["xo_account", "xo_list_orders", "xo_get_market", "xo_prepare_order", "xo_deploy_enable_trading", "xo_revoke_trading", "xo_redeem", "xo_fund_account"];

// The recorded market with the ids the recorded order answers were made for.
export function marketFor(verdict: "open_with_book" | "thin_book" | "not_open" | "unknown" = "open_with_book", conditionId: string = TOKENS.condition_id): Record<string, any> {
  const copy = structuredClone(FIXTURES.market) as Record<string, any>;
  copy["market"]["condition_id"] = conditionId;
  const slots: Record<string, string> = { yes: TOKENS.yes, no: TOKENS.no };
  for (const outcome of copy["market"]["outcomes"]) outcome["token_id"] = slots[outcome["slot"]];
  if (copy["quote"]["yes"] !== null) copy["quote"]["yes"]["token_id"] = TOKENS.yes;
  if (copy["quote"]["no"] !== null) copy["quote"]["no"]["token_id"] = TOKENS.no;
  copy["tradability"]["verdict"] = verdict;
  return copy;
}

export interface PrepareRig {
  readonly daemon: Daemon;
  readonly terminal: TerminalServices;
  readonly trade: TradeServices;
  readonly timers: FakeTimers;
  readonly deps: RunDeps;
}

export interface PrepareRigOptions {
  readonly facts?: CapabilityFacts;
  readonly owner?: string;
  readonly owners?: readonly string[];
  readonly code?: string | undefined;
  readonly startFrom?: string;
  readonly bindings?: readonly AddressBinding[];
}

export function makePrepareRig(options: PrepareRigOptions = {}): PrepareRig {
  const daemon = scriptedDaemon();
  const owners = options.owners ?? [options.owner ?? OWNER];
  const timers = new FakeTimers(recordedAt(options.startFrom ?? "prepare_order_buy") + 2_000);
  const { services: terminal } = fakeServices({
    daemon,
    code: "code" in options ? options.code : PAIR_CODE,
    bindings: options.bindings ?? owners.map((address, index) => binding({ id: `b${String(index + 1)}`, address })),
    timers,
  });
  const trade = createTradeServices(terminal, { facts: () => options.facts ?? ALL_YES });
  const deps: RunDeps = { client: trade.client, nowMs: trade.nowMs, facts: trade.facts, loadOwners: trade.loadOwners, readMarket: marketReaderOver(terminal.client) };
  return { daemon, terminal, trade, timers, deps };
}

export async function pairRig(rig: PrepareRig): Promise<void> {
  if (rig.terminal.session.token() === null) await rig.terminal.session.pair();
}

// Installs the reads a prepare command makes: the account (with the given switches on), the open orders and the market.
export function installPrepareReads(rig: PrepareRig, options: { readonly account?: string; readonly on?: readonly string[]; readonly extra?: Record<string, unknown>; readonly verdict?: "open_with_book" | "thin_book" | "not_open" | "unknown" } = {}): void {
  installReads(rig.daemon, accountWith(options.account ?? "account_trading", options.on ?? ALL_WRITE_FLAGS, options.extra ?? {}));
  rig.daemon.tools.set("xo_get_market", () => toolEnvelope("xo_get_market", marketFor(options.verdict ?? "open_with_book")));
}

export function serve(rig: PrepareRig, tool: string, structured: unknown): void {
  rig.daemon.tools.set(tool, () => prepareEnvelope(tool, structured));
}

export function mountConsole(rig: PrepareRig, proposal: ProposalInput | null = null): { readonly container: HTMLElement; unmount(): void; rerender(ui: ReactElement): void; readonly path: () => string } {
  const location = memoryLocation({ path: "/terminal", record: true });
  const ui: ReactElement = (
    <QueryClientProvider client={createAppQueryClient()}>
      <ModeProvider mode="cockpit">
        <ClockProvider clock={{ now: rig.timers.clock }}>
          <Router hook={location.hook}>
            <TerminalServicesProvider services={rig.terminal}>
              <TradeServicesProvider services={rig.trade}>
                <PrepareConsole terminal={rig.terminal} trade={rig.trade} proposal={proposal} />
              </TradeServicesProvider>
            </TerminalServicesProvider>
          </Router>
        </ClockProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
  return { ...render(ui), path: () => location.history?.at(-1) ?? "/terminal" };
}

// Fires a paste into an input the way a browser does: a clipboard event carrying text/plain.
export function pasteInto(input: HTMLInputElement, text: string): void {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as Event & { clipboardData?: { getData(type: string): string } };
  event.clipboardData = { getData: (type: string) => (type === "text/plain" ? text : "") };
  act(() => {
    input.dispatchEvent(event);
  });
}
