import { describe, expect, it } from "vitest";

import { challenge } from "./fixtures/pinned-challenge";
import { depsOf, fakeFetch, NOW } from "./fixtures/fake-fetch";
import { createQuotientClient, parseImportText, type QuotientClient, type QuotientGate } from "./client";
import { MAX_BODY_CHARS } from "./constants";

// Import mode: the user's own agent paid for a call and saved the JSON; the user drops it into the Signal Inbox
// (docs/dapp-design.md 4.7). It never makes a request. No Quotient response body is committed (restricted terms), so
// only the payload-free paths are tested here: refusals, and a saved 402 judged against the pinned tuple.

const GATE_ON: QuotientGate = { enabled: true, licenceAcknowledgedAtMs: NOW };

function importer(clock = { now: NOW }): { client: QuotientClient; calls: number } {
  const fake = fakeFetch({});
  const client = createQuotientClient(depsOf(fake, clock), { build: "standalone", gate: GATE_ON });
  return { client, get calls() { return fake.calls.length; } };
}

describe("importing a response the user's agent paid for", () => {

  it("refuses text that is not JSON or is too large, without parsing it", () => {
    const { client } = importer();
    expect(client.importJson("mispriced", "{nope")).toMatchObject({ status: "refused", reason: "not_json" });
    expect(client.importJson("mispriced", "")).toMatchObject({ status: "refused", reason: "not_json" });
    expect(client.importJson("mispriced", " ".repeat(MAX_BODY_CHARS + 1))).toMatchObject({ status: "refused", reason: "payload_too_large" });
    expect(parseImportText(42 as never)).toEqual({ refusal: "payload_too_large" });
  });

  it("does not run more than the gate allows", () => {
    const fake = fakeFetch({});
    const client = createQuotientClient(depsOf(fake), { build: "standalone" });
    expect(client.importJson("mispriced", "{}")).toMatchObject({ status: "refused", reason: "off_by_default" });
    expect(fake.calls).toHaveLength(0);
  });

  it("treats a saved 402 as 'payment required', not as data (M3-1)", () => {
    const { client } = importer();
    expect(client.importJson("mispriced", JSON.stringify(challenge))).toMatchObject({ status: "payment_required", verdict: { amountUsd: "0.02" } });
  });

  it("hard-stops on a doctored saved challenge, and latches paid calls", async () => {
    const fake = fakeFetch({});
    const client = createQuotientClient(depsOf(fake), { build: "standalone", gate: GATE_ON });
    const doctored = { ...challenge, accepts: [{ ...challenge.accepts[0], payTo: "0x1111111111111111111111111111111111111111" }] };
    expect(client.importJson("mispriced", JSON.stringify(doctored))).toMatchObject({ status: "hard_stop" });
    expect(await client.signals({})).toMatchObject({ status: "refused", reason: "halted_after_payment_mismatch" });
    expect(fake.calls).toHaveLength(0);
  });

});
