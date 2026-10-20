import { createInboxModule, inboxOf, type Inbox, type RelayRecordView } from "../../inbox.js";
import { bridgeErrorResponseSchema } from "../../contract.js";
import { createSignerModule, type SignerModuleOptions } from "../../paybox-signer.js";
import { postJson, bearer, type Reply } from "../server/helpers.js";
import { FakeSource, FakeTimers } from "../events/helpers.js";
import { startGateDaemon, type GateDaemon, type GateOptions } from "../tools/helpers.js";
import { S2_ENV, type Deferred } from "./fixtures.js";
import type { Obj } from "../../../test/tools-helpers.js";
import type { SubmitOutcome, SubmitPort, SubmitRequest } from "../../paybox-signer.js";

// A daemon with the real class table guard, ARM window, kill switch, inbox and signer, and a fake relay record
// source. Time is the test daemon's fake clock (2026-10-19T12:00:00Z, the instant the items are built at).

export class FakeSubmit implements SubmitPort {
  readonly requests: SubmitRequest[] = [];
  next: SubmitOutcome | (() => Promise<SubmitOutcome>) = { outcome: "submitted" };
  async submit(request: SubmitRequest): Promise<SubmitOutcome> {
    this.requests.push(request);
    return typeof this.next === "function" ? this.next() : this.next;
  }
}

export interface SignerRig {
  readonly d: GateDaemon;
  readonly inbox: Inbox;
  readonly source: FakeSource;
  readonly submit: FakeSubmit;
  readonly ui: string;
  readonly agent: string;
  stop(): Promise<void>;
  // Puts a relay item in the inbox and records that its card was shown, as the page would.
  show(item: Obj): void;
  ingestOnly(item: Obj): void;
  sign(id: string, token?: string): Promise<Reply>;
  armed(): Promise<void>;
}

export function viewOf(item: Obj): RelayRecordView {
  return {
    id: item["prepared_id"] as string,
    kind: item["kind"] as string,
    owner: item["owner"] as string,
    account: item["account"] as string,
    digest: (item["sign"] as { expected_digest: string }).expected_digest,
    state: "prepared",
    detail: null,
  };
}

export interface RigOptions {
  readonly env?: Record<string, string | undefined>;
  readonly signer?: SignerModuleOptions;
  readonly gate?: Omit<GateOptions, "env" | "extraModules">;
  // No class guard in front of the sign route: only the checks the route makes itself remain.
  readonly withoutClassGuard?: boolean;
  readonly withSource?: boolean;
}

export async function startSignerRig(options: RigOptions = {}): Promise<SignerRig> {
  const submit = new FakeSubmit();
  const timers = new FakeTimers();
  const env = Object.fromEntries(Object.entries(options.env ?? S2_ENV).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const d = await startGateDaemon({
    ...options.gate,
    ...(options.withoutClassGuard === true ? { withoutClassGuard: true } : {}),
    env,
    extraModules: [
      { name: "inbox", source: createInboxModule({ timers }) },
      { name: "paybox-signer", source: createSignerModule({ submit, ...options.signer }) },
    ],
  });
  const inbox = inboxOf(d.daemon.host);
  const source = new FakeSource();
  if (options.withSource !== false) inbox.attachSource(source);
  const ui = await d.uiToken();
  const rig: SignerRig = {
    d,
    inbox,
    source,
    submit,
    ui,
    agent: d.agentToken,
    stop: () => d.stop(),
    ingestOnly(item) {
      source.set(viewOf(item));
      const result = inbox.ingest(item, "agent:0a1b2c3d");
      if (!result.ok) throw new Error(`test setup: ingest refused (${JSON.stringify(result)})`);
    },
    show(item) {
      rig.ingestOnly(item);
      const summary = item["summary"] as { digest_tag: string; inner_hash_tag?: string };
      const shown = inbox.recordShown(item["prepared_id"] as string, { digest_tag: summary.digest_tag, inner_hash_tag: summary.inner_hash_tag ?? null, verification: "verified", failed_checks: [] });
      if (!shown.ok) throw new Error("test setup: card not shown");
    },
    sign: (id, token = d.agentToken) => postJson(d.port, "/ui/inbox/sign", { prepared_id: id }, bearer(token)),
    async armed() {
      const reply = await d.arm(ui, 5);
      if (reply.status !== 200) throw new Error(`test setup: arm failed (${reply.status})`);
    },
  };
  return rig;
}

export const errorOf = (reply: Reply): { code: string; details?: Record<string, unknown>; message: string } => bridgeErrorResponseSchema.parse(reply.json()).error;
export const waitUntil = async (check: () => boolean, ms = 3000): Promise<void> => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};
export type { Deferred };
