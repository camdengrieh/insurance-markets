import { describe, expect, it } from "vitest";

import { FakeRaw, FakeTimers } from "../../core/fakes";
import { jsonReply, errorReply, TOKEN, inboxBody } from "../terminal/test-support";
import { SigningClient } from "./client";
import { NOW_MS, deployItem, orderItem, recordOf } from "./testkit";

const ID = "0123456789abcdef0123456789abcdef";

function client(handler: (url: string, init: { method: string; body?: string | undefined; headers: Record<string, string> }) => ReturnType<typeof jsonReply>, token: string | null = TOKEN) {
  const raw = new FakeRaw((url, init) => handler(url, init as never));
  const timers = new FakeTimers(NOW_MS);
  return { raw, client: new SigningClient({ rawFetch: raw.fetch, timers, getToken: () => token }) };
}

describe("the signing client", () => {
  it("reads the inbox with only the bearer token", async () => {
    const record = recordOf(deployItem());
    const { client: c, raw } = client(() => jsonReply(200, inboxBody(3, [record, { junk: true }])));
    const snapshot = await c.inbox();
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.invalid).toBe(1);
    expect(snapshot.eventId).toBe(3);
    const init = raw.calls[0]?.init;
    expect(raw.calls[0]?.url).toBe("/ui/inbox");
    expect(init?.method).toBe("GET");
    expect(init?.headers["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("manual");
  });

  it("sends nothing without a token", async () => {
    const { client: c, raw } = client(() => jsonReply(200, {}), null);
    await expect(c.inbox()).rejects.toMatchObject({ code: "not_paired" });
    await expect(c.decide({ decision: "reject", prepared_id: ID })).rejects.toMatchObject({ code: "not_paired" });
    expect(raw.calls).toHaveLength(0);
  });

  it("posts a shown decision and a reject, and returns the daemon's record", async () => {
    const record = recordOf(deployItem(), { state: "shown" });
    const { client: c, raw } = client(() => jsonReply(200, record));
    const shown = await c.decide({ decision: "shown", prepared_id: ID, digest_tag: "0123456789abcdef", inner_hash_tag: null, verification: "viewer_only", failed_checks: [] });
    expect(shown.state).toBe("shown");
    await c.decide({ decision: "reject", prepared_id: ID });
    expect(raw.calls.map((call) => `${call.init.method} ${call.url}`)).toEqual(["POST /ui/inbox/decision", "POST /ui/inbox/decision"]);
    expect(JSON.parse(raw.calls[1]?.init.body ?? "{}")).toEqual({ decision: "reject", prepared_id: ID });
  });

  it("refuses to send a decision body the contract does not know (no 'sign', no extra field)", async () => {
    const { client: c, raw } = client(() => jsonReply(200, recordOf(deployItem())));
    await expect(c.decide({ decision: "sign", prepared_id: ID } as never)).rejects.toThrow();
    await expect(c.decide({ decision: "reject", prepared_id: ID, signature: `0x${"11".repeat(65)}` } as never)).rejects.toThrow();
    await expect(c.decide({ decision: "reject", prepared_id: "not-an-id" } as never)).rejects.toThrow();
    expect(raw.calls).toHaveLength(0);
  });

  it("refuses an answer about another item or in another shape", async () => {
    const other = recordOf(deployItem({ preparedId: "f".repeat(32) }));
    await expect(client(() => jsonReply(200, other)).client.decide({ decision: "reject", prepared_id: ID })).rejects.toMatchObject({ code: "bad_response" });
    await expect(client(() => jsonReply(200, { ok: true })).client.decide({ decision: "reject", prepared_id: ID })).rejects.toMatchObject({ code: "bad_response" });
  });

  it("maps the daemon's refusals to fixed codes and never carries its words", async () => {
    const unauthorized = await client(() => errorReply(401, "unauthorized")).client.decide({ decision: "reject", prepared_id: ID }).catch((e: unknown) => e);
    expect(unauthorized).toMatchObject({ code: "unauthorized" });
    const denied = await client(() => errorReply(403, "scope_denied")).client.decide({ decision: "reject", prepared_id: ID }).catch((e: unknown) => e);
    expect(denied).toMatchObject({ code: "refused", bridgeCode: "scope_denied" });
    expect((denied as Error).message).toBe("refused");
  });

  it("reconciles by hash with a read, for an operation and for an order", async () => {
    const opHash = `0x${"ab".repeat(32)}`;
    const orderHash = `0x${"cd".repeat(32)}`;
    const { client: c, raw } = client((url) =>
      url.startsWith("/ui/userop/") ? jsonReply(200, { user_op_hash: opHash, state: "submitted", detail: "waiting" }) : jsonReply(200, { order_hash: orderHash, state: "open" }),
    );
    expect(await c.reconcile("userop", opHash)).toMatchObject({ kind: "userop", state: "submitted", detail: "waiting" });
    expect(await c.reconcile("order", orderHash)).toMatchObject({ kind: "order", state: "open", detail: null });
    expect(raw.calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([`GET /ui/userop/${opHash}`, `GET /ui/order/${orderHash}`]);
    // An answer for another hash is refused.
    await expect(client(() => jsonReply(200, { user_op_hash: `0x${"11".repeat(32)}`, state: "submitted" })).client.reconcile("userop", opHash)).rejects.toMatchObject({ code: "bad_response" });
    // Likewise an order: another order's status must never be shown as this one's (TM-08).
    await expect(client(() => jsonReply(200, { order_hash: `0x${"11".repeat(32)}`, state: "filled" })).client.reconcile("order", orderHash)).rejects.toMatchObject({ code: "bad_response" });
    expect(await client(() => jsonReply(200, { order_hash: orderHash.toUpperCase().replace("0X", "0x"), state: "open" })).client.reconcile("order", orderHash)).toMatchObject({ kind: "order", state: "open" });
    await expect(c.reconcile("order", "not-a-hash")).rejects.toThrow();
  });

  it("the order item used here is contract-valid (sanity for the kit)", () => {
    expect(recordOf(orderItem()).prepared.kind).toBe("order");
  });
});
