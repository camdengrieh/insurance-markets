import { createContext, useContext, useMemo, type ReactNode } from "react";

import { NO_FACTS, type CapabilityFacts } from "../../core/capabilities";
import { useAppMode, type AppMode } from "../../ui";
import { useTerminalServices, type TerminalServices } from "../terminal/services";
import type { StreamDeps } from "../terminal/stream";
import type { PageSession } from "../terminal/session";
import type { ApprovalMode } from "./card";
import { SigningClient } from "./client";

// Everything the signing screen needs from the outside, in one record, so a test can inject a fake daemon and a
// fake clock. The session and the event-stream plumbing are the terminal screen's shared ones: the pairing code
// can be exchanged only once per page load, so there must be exactly one place that does it.

export interface SigningServices {
  readonly mode: AppMode;
  readonly nowMs: () => number;
  readonly session: Pick<PageSession, "token" | "pair" | "forget">;
  readonly stream: StreamDeps;
  readonly client: Pick<SigningClient, "inbox" | "decide" | "reconcile">;
  // Recorded capability facts. All "unknown" until the operator records a live test (everything shows "unproven").
  readonly facts: CapabilityFacts;
  // The PayBox credential's approval mode, when something connected knows it. Nothing does yet.
  readonly approvalMode: ApprovalMode;
  // Puts text on the clipboard (the "Copy intent" button). Resolves when it worked, rejects when the browser says no.
  // The only text ever passed is the intent the card re-derived and re-checked.
  readonly copyText: (text: string) => Promise<void>;
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) throw new Error("no clipboard");
  await navigator.clipboard.writeText(text);
}

export interface SigningServicesOptions {
  readonly copyText?: (text: string) => Promise<void>;
  readonly facts?: CapabilityFacts;
  readonly approvalMode?: ApprovalMode;
}

export function createSigningServices(terminal: TerminalServices, options: SigningServicesOptions = {}): SigningServices {
  return {
    mode: terminal.mode,
    nowMs: terminal.nowMs,
    session: terminal.session,
    stream: terminal.stream,
    client: new SigningClient({ rawFetch: terminal.stream.rawFetch, timers: terminal.stream.timers, getToken: terminal.stream.getToken }),
    facts: options.facts ?? NO_FACTS,
    approvalMode: options.approvalMode ?? "unknown",
    copyText: options.copyText ?? copyToClipboard,
  };
}

const ServicesContext = createContext<SigningServices | null>(null);

export function SigningServicesProvider({ services, children }: { readonly services: SigningServices; readonly children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useSigningServices(): SigningServices {
  const provided = useContext(ServicesContext);
  const mode = useAppMode();
  const terminal = useTerminalServices(mode);
  return useMemo(() => provided ?? createSigningServices(terminal), [provided, terminal]);
}
