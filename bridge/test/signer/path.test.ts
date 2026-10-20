import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Hex } from "viem";

import { PayboxSigningPath, vetForSigning, type SigningResult, type VettedForSigning } from "../../paybox-signer.js";
import { SECP256K1_N } from "../../../src/xo/signing/constants.js";
import { OTHER_KEY_ACCOUNT, OWNER, OWNER_KEY_ACCOUNT, FakeClient, authItem, deferred, deployItem, digestOfIntent, orderItem, signWith } from "./fixtures.js";

// The signing path (M5-3, M5-4): what it asks PayBox, what it will not ask, and what it lets out.

const NOW = Date.parse("2026-10-19T12:00:00Z");
const CRED = "cred-test-0001";
function vetted(item: unknown): VettedForSigning {
  const result = vetForSigning(item, { nowMs: NOW });
  assert.ok(result.ok, JSON.stringify(result));
  return result.vetted;
}
function setup(): { client: FakeClient; path: PayboxSigningPath } {
  const client = new FakeClient();
  return { client, path: new PayboxSigningPath(client) };
}
const options = (extra: Partial<Parameters<PayboxSigningPath["sign"]>[1]> = {}): Parameters<PayboxSigningPath["sign"]>[1] => ({ credentialId: CRED, timeoutMs: 60_000, signal: new AbortController().signal, ...extra });
function failed(result: SigningResult): { code: string; requested: boolean } {
  assert.equal(result.ok, false, JSON.stringify(result));
  if (result.ok) throw new Error("unreachable");
  return result;
}

describe("what PayBox is asked", () => {
  it("exactly the vetted intent for exactly the configured credential, once", async () => {
    for (const make of [deployItem, orderItem, authItem]) {
      const { client, path } = setup();
      const item = vetted(make());
      let requests = 0;
      const result = await path.sign(item, options({ onRequest: () => void (requests += 1) }));
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(requests, 1);
      assert.equal(client.signCalls.length, 1);
      assert.deepEqual(client.signCalls[0]?.intent, item.intent);
      assert.equal(client.signCalls[0]?.credentialId, CRED);
      assert.equal(client.signCalls[0]?.timeoutMs, 60_000);
    }
  });

  it("the signature that comes out recovers to the owner over the item's own digest", async () => {
    const { path } = setup();
    const item = vetted(orderItem());
    const result = await path.sign(item, options());
    assert.ok(result.ok);
    assert.match(result.signature, /^0x[0-9a-f]{130}$/);
    assert.equal(result.form, "raw");
    assert.equal(result.requestRef, "req_test_0001");
  });

  it("refuses an object it did not get from vetForSigning, and never calls PayBox for it", async () => {
    const { client, path } = setup();
    const real = vetted(deployItem());
    const forged = { ...real, intent: { op: "raw", rawSigningPayloadHex: `0x${"44".repeat(32)}` } } as VettedForSigning;
    const cloned = structuredClone(real);
    const message = { ...real, op: "message", intent: { op: "message", message: "hello" } } as unknown as VettedForSigning;
    for (const candidate of [forged, cloned, message, {} as VettedForSigning]) {
      assert.equal(failed(await path.sign(candidate, options())).code, "not_vetted");
    }
    assert.equal(client.credentialCalls, 0);
    assert.equal(client.signCalls.length, 0);
  });
});

describe("the credential must be in always_approve (M5-4)", () => {
  for (const mode of ["autonomous", "iframe", "paybox", "ALWAYS_APPROVE", "always_approve ", "", null]) {
    it(`mode ${JSON.stringify(mode)} is refused before PayBox is asked to sign`, async () => {
      const { client, path } = setup();
      client.approvalMode = mode;
      const result = failed(await path.sign(vetted(deployItem()), options()));
      assert.equal(result.code, "credential_not_always_approve");
      assert.equal(result.requested, false);
      assert.equal(client.signCalls.length, 0);
    });
  }

  it("the credential's address has to be the item's owner; an unknown address is refused too", async () => {
    for (const address of [OTHER_KEY_ACCOUNT.address, null, "", "not an address"]) {
      const { client, path } = setup();
      client.address = address;
      assert.equal(failed(await path.sign(vetted(deployItem()), options())).code, "credential_owner_mismatch");
      assert.equal(client.signCalls.length, 0);
    }
    const { client, path } = setup();
    client.address = OWNER.toLowerCase();
    assert.equal((await path.sign(vetted(deployItem()), options())).ok, true, "case does not matter");
  });

  it("an unreadable credential refuses, and so does a client that throws", async () => {
    const { client, path } = setup();
    client.credentialFailure = { ok: false, code: "credential_unreadable" };
    assert.equal(failed(await path.sign(vetted(deployItem()), options())).code, "credential_unreadable");
    const throwing = new PayboxSigningPath({
      credential: async () => {
        throw new Error("pbxk1.SHOULD-NEVER-APPEAR");
      },
      sign: async () => ({ ok: false, code: "paybox_failed" }),
    });
    const result = failed(await throwing.sign(vetted(deployItem()), options()));
    assert.equal(result.code, "paybox_failed");
    assert.ok(!JSON.stringify(result).includes("pbxk1"), "the error text is not kept");
  });
});

describe("what comes back is checked before it is let out", () => {
  it("a signature by someone else is dropped", async () => {
    const { client, path } = setup();
    client.signer = async (call) => ({ ok: true, signature: await signWith(OTHER_KEY_ACCOUNT, digestOfIntent(call.intent)) });
    const result = failed(await path.sign(vetted(deployItem()), options()));
    assert.equal(result.code, "owner_mismatch");
    assert.equal(result.requested, true);
  });

  it("a signature over another digest is dropped", async () => {
    const { client, path } = setup();
    client.signer = async () => ({ ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, `0x${"55".repeat(32)}`) });
    assert.equal(failed(await path.sign(vetted(authItem()), options())).code, "owner_mismatch");
  });

  it("malformed answers are signature_invalid", async () => {
    for (const bad of [undefined, null, "", "0x", "0x1234", `0x${"00".repeat(65)}`, 5, [], { r: "0x1" }, `0x${"zz".repeat(65)}`]) {
      const { client, path } = setup();
      client.signer = async () => ({ ok: true, signature: bad });
      assert.equal(failed(await path.sign(vetted(deployItem()), options())).code, "signature_invalid", JSON.stringify(bad));
    }
  });

  it("accepts the three documented shapes and returns the canonical one", async () => {
    const item = vetted(deployItem());
    const sig = await signWith(OWNER_KEY_ACCOUNT, item.expectedDigest);
    const r = `0x${sig.slice(2, 66)}` as Hex;
    const s = `0x${sig.slice(66, 130)}` as Hex;
    const v = Number.parseInt(sig.slice(130, 132), 16);
    const shapes = [sig, { r, s, v }, { r, s, recovery_id: v - 27 }, sig.slice(0, 130) + (v - 27).toString(16).padStart(2, "0")];
    for (const shape of shapes) {
      const { client, path } = setup();
      client.signer = async () => ({ ok: true, signature: shape });
      const result = await path.sign(item, options());
      assert.ok(result.ok, JSON.stringify(shape));
      assert.equal(result.signature, sig, "canonical form: r || s || 27 or 28");
    }
  });

  it("flips a high-s signature to the canonical low-s form, still the owner's", async () => {
    const item = vetted(deployItem());
    const sig = await signWith(OWNER_KEY_ACCOUNT, item.expectedDigest);
    const r = BigInt(`0x${sig.slice(2, 66)}`);
    const s = BigInt(`0x${sig.slice(66, 130)}`);
    const v = Number.parseInt(sig.slice(130, 132), 16);
    const highS = SECP256K1_N - s;
    const flipped = v === 27 ? 28 : 27;
    const high = `0x${r.toString(16).padStart(64, "0")}${highS.toString(16).padStart(64, "0")}${flipped.toString(16)}`;
    assert.ok(highS > SECP256K1_N / 2n);
    const { client, path } = setup();
    client.signer = async () => ({ ok: true, signature: high });
    const result = await path.sign(item, options());
    assert.ok(result.ok);
    assert.equal(result.flippedHighS, true);
    assert.equal(result.signature, sig);
  });

  it("a typed-data intent needs a signature over the EIP-712 digest itself, not its EIP-191 wrapping", async () => {
    const item = vetted(orderItem());
    // sign the EIP-191 wrapping of the digest instead
    const wrapped = await OWNER_KEY_ACCOUNT.signMessage({ message: { raw: item.expectedDigest } });
    const { client, path } = setup();
    client.signer = async () => ({ ok: true, signature: wrapped });
    const result = failed(await path.sign(item, options()));
    assert.equal(result.code, "form_not_allowed");
    // for a raw intent the same answer is recognised and reported
    const raw = vetted(deployItem());
    const rawWrapped = await OWNER_KEY_ACCOUNT.signMessage({ message: { raw: raw.expectedDigest } });
    client.signer = async () => ({ ok: true, signature: rawWrapped });
    const ok = await path.sign(raw, options());
    assert.ok(ok.ok);
    assert.equal(ok.form, "eip191");
  });

  it("a request reference that looks like a key is not kept", async () => {
    for (const ref of ["pbxk1.abcdefgh", "pbx_live_abcdef", "sk-abcdefgh", "a b", "xx", 5, null]) {
      const { client, path } = setup();
      client.signer = async (call) => ({ ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)), requestRef: ref as string });
      const result = await path.sign(vetted(deployItem()), options());
      assert.ok(result.ok);
      assert.equal(result.requestRef, undefined, String(ref));
    }
  });
});

describe("PayBox failures pass through as fixed codes", () => {
  for (const code of ["paybox_missing", "paybox_timeout", "paybox_failed", "paybox_declined", "paybox_output_invalid", "aborted"] as const) {
    it(code, async () => {
      const { client, path } = setup();
      client.signer = async () => ({ ok: false, code });
      const result = failed(await path.sign(vetted(deployItem()), options()));
      assert.equal(result.code, code);
      assert.equal(result.requested, true);
    });
  }

  it("a client that throws while signing is paybox_failed, and the text is dropped", async () => {
    const { client, path } = setup();
    client.signer = async () => {
      throw new Error("token pbxk1.LEAK");
    };
    const result = failed(await path.sign(vetted(deployItem()), options()));
    assert.equal(result.code, "paybox_failed");
    assert.ok(!JSON.stringify(result).includes("LEAK"));
  });

  it("an aborted signal stops before PayBox is asked", async () => {
    const { client, path } = setup();
    const controller = new AbortController();
    controller.abort();
    assert.equal(failed(await path.sign(vetted(deployItem()), options({ signal: controller.signal }))).code, "aborted");
    assert.equal(client.credentialCalls, 0);
  });
});

describe("one use of the PayBox client at a time", () => {
  it("serialises overlapping signs (its token rotates on every use)", async () => {
    const { client, path } = setup();
    const gate = deferred<void>();
    let running = 0;
    let peak = 0;
    client.signer = async (call) => {
      running += 1;
      peak = Math.max(peak, running);
      await gate.promise;
      running -= 1;
      return { ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)) };
    };
    const first = path.sign(vetted(deployItem()), options());
    const second = path.sign(vetted(authItem()), options());
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(client.signCalls.length, 1, "the second waits for the first");
    gate.resolve();
    assert.ok((await first).ok);
    assert.ok((await second).ok);
    assert.equal(peak, 1);
    assert.equal(client.signCalls.length, 2);
  });
});
