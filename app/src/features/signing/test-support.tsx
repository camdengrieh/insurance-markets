// Builders for the signing screen's component tests: the terminal's scripted daemon (pairing, inbox, event stream),
// extended with the decision route, a services record with an injected clock and a clipboard double, and a mount
// helper. Pure code with no Node import (the boundary check treats every non-test file under app/src as bundled
// code); only test files import it.

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

import type { InboxItem } from "@bridge/contract";

import { FakeTimers } from "../../core/fakes";
import { ClockProvider, ModeProvider, createAppQueryClient } from "../../ui";
import { AnnouncerProvider } from "../../ui/a11y";
import { render } from "../../ui/testing/dom";
import { PAIR_CODE, errorReply, fakeServices, jsonReply, memoryStorage, scriptedDaemon, LiveStream, inboxBody, frame, NOW, TOKEN, flush, until, statusBody, type Daemon } from "../terminal/test-support";
import { SigningView } from "./SigningView";
import { createSigningServices, SigningServicesProvider, type SigningServices, type SigningServicesOptions } from "./services";

export { PAIR_CODE, TOKEN, NOW, LiveStream, errorReply, jsonReply, memoryStorage, inboxBody, frame, flush, until, statusBody };
export type { Daemon };

export interface DecisionLog {
  readonly bodies: Record<string, unknown>[];
}

export interface SigningRig {
  readonly daemon: Daemon;
  readonly stream: LiveStream;
  readonly services: SigningServices;
  readonly timers: FakeTimers;
  readonly decisions: Record<string, unknown>[];
  readonly copied: string[];
  // The current inbox the scripted daemon answers with.
  records: InboxItem[];
}

export interface RigOptions extends SigningServicesOptions {
  readonly records?: readonly InboxItem[];
  readonly code?: string | undefined;
  readonly storage?: ReturnType<typeof memoryStorage> | null;
  // Fails the clipboard.
  readonly clipboardFails?: boolean;
  // The daemon refuses a reject decision (it answers 409), as it does for an item that has already moved on.
  readonly refuseReject?: boolean;
}

// The daemon answers the decision route the way the real one does: it applies the move and returns the record.
export function makeRig(options: RigOptions = {}): SigningRig {
  const daemon = scriptedDaemon();
  const stream = new LiveStream();
  daemon.events = () => stream.response;
  const records = [...(options.records ?? [])];
  const decisions: Record<string, unknown>[] = [];
  const copied: string[] = [];
  const rig: SigningRig = { daemon, stream, services: undefined as never, timers: undefined as never, decisions, copied, records };
  daemon.inbox = () => jsonReply(200, inboxBody(0, rig.records));
  const base = daemon.raw.handler;
  daemon.raw.handler = async (url, init) => {
    if (url === "/ui/inbox/decision") {
      const body = JSON.parse(init.body ?? "null") as Record<string, unknown>;
      decisions.push(body);
      if (options.refuseReject === true && body["decision"] === "reject") return errorReply(409, "conflict");
      const index = rig.records.findIndex((record) => record.prepared_id === body["prepared_id"]);
      if (index === -1) return errorReply(404, "not_found");
      const current = rig.records[index] as InboxItem;
      const next: InboxItem = { ...current, state: body["decision"] === "reject" ? "rejected" : "shown" };
      rig.records[index] = next;
      return jsonReply(200, next);
    }
    return base(url, init);
  };
  const { services: terminal, timers } = fakeServices({
    daemon,
    code: "code" in options ? options.code : PAIR_CODE,
    ...(options.storage === undefined ? {} : { storage: options.storage }),
  });
  const services = createSigningServices(terminal, {
    ...options,
    copyText:
      options.copyText ??
      (async (text) => {
        if (options.clipboardFails === true) throw new Error("denied");
        copied.push(text);
      }),
  });
  return Object.assign(rig, { services, timers });
}

export function mountSigning(rig: SigningRig): { readonly container: HTMLElement; unmount(): void } {
  const location = memoryLocation({ path: "/signing" });
  const ui: ReactElement = (
    <QueryClientProvider client={createAppQueryClient()}>
      <ModeProvider mode="cockpit">
        <ClockProvider clock={{ now: rig.timers.clock }}>
          <AnnouncerProvider>
            <Router hook={location.hook}>
              <SigningServicesProvider services={rig.services}>
                <SigningView />
              </SigningServicesProvider>
            </Router>
          </AnnouncerProvider>
        </ClockProvider>
      </ModeProvider>
    </QueryClientProvider>
  );
  return render(ui);
}
