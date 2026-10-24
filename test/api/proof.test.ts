import assert from "node:assert/strict";
import { test } from "node:test";

import { candidateMessages, PROOF_WINDOW_S, proofMessage, sha256Hex, verifyProof } from "../../api/proof.js";
import { NOW, proof, testKey } from "./unified-helpers.js";

// The ownership proof (api/proof.ts, docs/unified-account-design.md section 3.3): valid, expired (both sides of the
// window), signed by another key, over another body, path, method or time, malformed, and for another account.

const E = testKey("proof-e");
const OTHER = testKey("proof-other");
const SECONDS = Math.floor(NOW / 1000);
const PATH = "/v1/relay/limitless/orders/cancel";
const BODY = JSON.stringify({ account: E.address, orderId: "6f52b6d2-6c9e-4a5c-8a4f-28ab4b7ff203" });

const check = (header: string, overrides: Partial<Parameters<typeof verifyProof>[0]> = {}) =>
  verifyProof({ header, method: "POST", path: PATH, search: "", body: Buffer.from(BODY), nowMs: NOW, account: E.address, ...overrides });

test("the signed text is the design's: prefix, method, path, seconds and the body's sha256 hex (or nothing)", () => {
  assert.equal(proofMessage("POST", PATH, SECONDS, sha256Hex(BODY)), `insurance-markets POST ${PATH} ${SECONDS} ${sha256Hex(BODY)}`);
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  // A body-less request may sign "", no trailing space, or the empty body's hash; a query route its path with or without it.
  assert.deepEqual(candidateMessages({ method: "GET", path: "/p", search: "?a=1", body: Buffer.alloc(0) }, 7), [
    "insurance-markets GET /p?a=1 7 ",
    "insurance-markets GET /p?a=1 7",
    `insurance-markets GET /p?a=1 7 ${sha256Hex("")}`,
    "insurance-markets GET /p 7 ",
    "insurance-markets GET /p 7",
    `insurance-markets GET /p 7 ${sha256Hex("")}`,
  ]);
});

test("a valid proof is accepted, at the edges of the window too", async () => {
  const header = await proof(E, "POST", PATH, BODY, SECONDS);
  const ok = await check(header);
  assert.deepEqual(ok, { ok: true, account: E.address });
  for (const skew of [-PROOF_WINDOW_S, PROOF_WINDOW_S]) {
    assert.equal((await check(await proof(E, "POST", PATH, BODY, SECONDS + skew))).ok, true, `skew ${skew}`);
  }
  // Lower-case account in the request is the same account.
  assert.equal((await check(header, { account: E.address.toLowerCase() })).ok, true);
});

test("an expired or future proof is refused", async () => {
  for (const skew of [-PROOF_WINDOW_S - 1, PROOF_WINDOW_S + 1, -86_400]) {
    const result = await check(await proof(E, "POST", PATH, BODY, SECONDS + skew));
    assert.deepEqual(result.ok ? null : result.code, "proof_invalid", `skew ${skew}`);
  }
});

test("a proof signed by another key, or over another body, path, method or time, is refused", async () => {
  // Another key signs but claims E's address.
  const forged = (await proof(OTHER, "POST", PATH, BODY, SECONDS)).replace(OTHER.address, E.address);
  assert.equal((await check(forged)).ok, false);
  // Another key's own proof, for a request that acts for E.
  const theirs = await check(await proof(OTHER, "POST", PATH, BODY, SECONDS));
  assert.equal(theirs.ok ? null : theirs.message, "The proof is for another account than the one this request acts for.");
  // Same signer, wrong body.
  const otherBody = await check(await proof(E, "POST", PATH, BODY.replace("6f52", "7f52"), SECONDS));
  assert.equal(otherBody.ok, false);
  // Wrong path, wrong method.
  assert.equal((await check(await proof(E, "POST", "/v1/relay/limitless/orders", BODY, SECONDS))).ok, false);
  assert.equal((await check(await proof(E, "GET", PATH, BODY, SECONDS))).ok, false);
  // The time in the header differs from the time signed.
  const signed = await proof(E, "POST", PATH, BODY, SECONDS);
  assert.equal((await check(signed.replace(`.${SECONDS}.`, `.${SECONDS + 1}.`))).ok, false);
});

test("a missing or malformed header is refused with the right code", async () => {
  const missing = await verifyProof({ header: undefined, method: "POST", path: PATH, search: "", body: Buffer.from(BODY), nowMs: NOW });
  assert.equal(missing.ok ? null : missing.code, "proof_required");
  for (const header of ["", "0x12.1.0x34", `${E.address}.${SECONDS}`, `${E.address}.${SECONDS}.0xzz`, `${E.address}.0${SECONDS}.0x${"11".repeat(65)}`]) {
    const result = await check(header);
    assert.equal(result.ok ? null : result.code, "proof_invalid", header);
  }
  const twice = await verifyProof({ header: ["a", "b"], method: "POST", path: PATH, search: "", body: Buffer.from(BODY), nowMs: NOW });
  assert.equal(twice.ok, false);
  // A signature of the right length that recovers to nobody's key over this text.
  const junk = await check(`${E.address}.${SECONDS}.0x${"11".repeat(64)}1b`);
  assert.equal(junk.ok, false);
});

test("a query route accepts the path with its query, or without it; a body-less request any of the empty forms", async () => {
  const path = "/v1/relay/limitless/orders";
  const search = `?account=${E.address}&marketSlug=m-1`;
  const run = (header: string) => verifyProof({ header, method: "GET", path, search, body: Buffer.alloc(0), nowMs: NOW, account: E.address });
  assert.equal((await run(await proof(E, "GET", `${path}${search}`, "", SECONDS))).ok, true);
  assert.equal((await run(await proof(E, "GET", path, "", SECONDS))).ok, true);
  const hashed = await E.signMessage({ message: proofMessage("GET", path, SECONDS, sha256Hex("")) });
  assert.equal((await run(`${E.address}.${SECONDS}.${hashed}`)).ok, true);
  const trimmed = await E.signMessage({ message: `insurance-markets GET ${path} ${SECONDS}` });
  assert.equal((await run(`${E.address}.${SECONDS}.${trimmed}`)).ok, true);
  assert.equal((await run(await proof(E, "GET", `${path}?account=${E.address}&marketSlug=m-2`, "", SECONDS))).ok, false);
});
