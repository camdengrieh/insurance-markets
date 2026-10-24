import assert from "node:assert/strict";
import { test } from "node:test";

import { BACKUP_MAX_BYTES, blobBytes, checkRecord, sameCredential } from "../../api/account-backup.js";
import { loadApiConfig } from "../../api/config.js";
import { closeHarness, codeOf, DAPP, fakeUpstream, nowSeconds, proof, raw, testKey, unifiedHarness, type UnifiedHarness } from "./unified-helpers.js";

// The account backup store (api/account-backup.ts): off by default; PUT carries the record
// { version, credentialId, address, iv, ciphertext } with an ownership proof for `address`, the body's credential id must
// be the path's, write-once (the same record again is fine, another is 409), at most 4 KiB; GET returns the record; CORS
// grants x-im-proof; the per-client limit; no id, address or ciphertext in a log line.

const E = testKey("backup-e");
const OTHER = testKey("backup-other");
const ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718";
const PATH = `/v1/account-backup/${ID}`;
const CIPHERTEXT = Buffer.from("ciphertext bytes the server cannot read, made up for this test").toString("base64");
const RECORD = { version: 1, credentialId: ID, address: E.address, iv: "0x00112233445566778899aabb", ciphertext: CIPHERTEXT };

async function put(u: UnifiedHarness, record: unknown, key = E, path = PATH): Promise<{ status: number; text: string; headers: Record<string, string | string[] | undefined> }> {
  const body = JSON.stringify(record);
  return raw(u.h.server.origin, "PUT", path, { ...DAPP, "content-type": "application/json", "x-im-proof": await proof(key, "PUT", path, body, nowSeconds(u.clock)) }, body);
}

test("record checks: the five fields, the credential id as hex or base64url of the path's bytes, 0x hex or base64 iv and ciphertext", () => {
  assert.equal(blobBytes("0xdeadbeef"), 4);
  assert.equal(blobBytes("deadbeef"), 6, "no 0x: base64");
  assert.equal(blobBytes("AAE="), 2);
  for (const bad of ["", "not base64!", "A", "0xabc", "AA===", "AB CD"]) assert.equal(blobBytes(bad), null, bad);
  assert.equal(sameCredential(ID, ID), true);
  assert.equal(sameCredential(`0x${ID.toUpperCase()}`, ID), true);
  assert.equal(sameCredential(Buffer.from(ID, "hex").toString("base64url"), ID), true);
  assert.equal(sameCredential(`${ID.slice(0, -2)}00`, ID), false);
  assert.ok(checkRecord(RECORD, ID).ok);
  assert.ok(checkRecord({ ...RECORD, version: "v1" }, ID).ok);
  for (const bad of [{ ...RECORD, extra: 1 }, { version: 1, credentialId: ID, address: E.address, iv: "0x00" }, { ...RECORD, credentialId: `${ID.slice(0, -2)}00` }, { ...RECORD, address: "0x12" }, { ...RECORD, iv: "" }, { ...RECORD, ciphertext: "not base64!" }, { ...RECORD, version: -1 }, { ...RECORD, version: "a b" }]) {
    assert.equal(checkRecord(bad, ID).ok, false, JSON.stringify(bad).slice(0, 80));
  }
});

test("off by default; PUT once with the proof, GET the record back; the same record again is fine, another is 409", async () => {
  assert.equal(loadApiConfig({ API_DATA_DIR: "/data" }).config.accountBackup, false);
  const upstream = fakeUpstream();
  const off = await unifiedHarness({}, upstream);
  try {
    assert.equal(codeOf((await put(off, RECORD)).text), "relay_not_enabled");
  } finally {
    await closeHarness(off);
  }
  const u = await unifiedHarness({ API_ACCOUNT_BACKUP: "on" }, upstream);
  try {
    const missing = await raw(u.h.server.origin, "GET", PATH, DAPP);
    assert.deepEqual([missing.status, codeOf(missing.text)], [404, "not_found"]);
    const stored = await put(u, RECORD);
    assert.deepEqual([stored.status, JSON.parse(stored.text)], [201, { credentialId: ID, stored: true }]);
    assert.equal(stored.headers["access-control-allow-origin"], DAPP.origin);
    const read = await raw(u.h.server.origin, "GET", PATH, DAPP);
    assert.deepEqual(JSON.parse(read.text), RECORD);
    assert.equal((await put(u, RECORD)).status, 200, "a retry with the same record");
    const other = await put(u, { ...RECORD, ciphertext: `${CIPHERTEXT.slice(0, -4)}AAAA` });
    assert.deepEqual([other.status, codeOf(other.text)], [409, "already_stored"]);
    // Someone else with a good proof of their own cannot take the slot either.
    const theirs = await put(u, { ...RECORD, address: OTHER.address }, OTHER);
    assert.deepEqual([theirs.status, codeOf(theirs.text)], [409, "already_stored"]);
    assert.deepEqual(JSON.parse((await raw(u.h.server.origin, "GET", PATH, DAPP)).text), RECORD, "never replaced");
    assert.equal(upstream.seen.length, 0);
    for (const line of u.logs) assert.equal(line.includes(ID) || line.includes(CIPHERTEXT) || line.includes(E.address), false, line);
  } finally {
    await closeHarness(u);
  }
});

test("the proof must be the record's address over this body; the id, size, methods, origin and limit are checked", async () => {
  const u = await unifiedHarness({ API_ACCOUNT_BACKUP: "on" }, fakeUpstream());
  try {
    const body = JSON.stringify(RECORD);
    const noProof = await raw(u.h.server.origin, "PUT", PATH, { ...DAPP, "content-type": "application/json" }, body);
    assert.deepEqual([noProof.status, codeOf(noProof.text)], [401, "proof_required"]);
    const otherSigner = await put(u, RECORD, OTHER);
    assert.deepEqual([otherSigner.status, codeOf(otherSigner.text)], [401, "proof_invalid"]);
    const staleProof = await raw(u.h.server.origin, "PUT", PATH, { ...DAPP, "content-type": "application/json", "x-im-proof": await proof(E, "PUT", PATH, body, nowSeconds(u.clock) - 301) }, body);
    assert.equal(staleProof.status, 401);
    const otherBody = await raw(u.h.server.origin, "PUT", PATH, { ...DAPP, "content-type": "application/json", "x-im-proof": await proof(E, "PUT", PATH, JSON.stringify({ ...RECORD, version: 2 }), nowSeconds(u.clock)) }, body);
    assert.equal(otherBody.status, 401);
    // The body's credential id is not the path's.
    const otherPath = `/v1/account-backup/${"cd".repeat(20)}`;
    assert.equal((await put(u, RECORD, E, otherPath)).status, 400);
    for (const path of ["/v1/account-backup/ABCDEF0123456789ABCDEF0123456789", "/v1/account-backup/abc", "/v1/account-backup/zz00112233445566778899aabbccddeeff"]) {
      assert.equal((await put(u, RECORD, E, path)).status, 400, path);
    }
    assert.equal((await raw(u.h.server.origin, "GET", "/v1/account-backup", DAPP)).status, 404);
    const big = await put(u, { ...RECORD, ciphertext: `0x${"ab".repeat(BACKUP_MAX_BYTES)}` });
    assert.equal(big.status, 413);
    assert.equal((await raw(u.h.server.origin, "POST", PATH, { ...DAPP, "content-type": "application/json" }, "{}")).status, 405);
    assert.equal((await raw(u.h.server.origin, "GET", `${PATH}?x=1`, DAPP)).status, 400);
    assert.equal((await raw(u.h.server.origin, "GET", PATH, { origin: "https://evil.example" })).status, 403);
    const preflight = await raw(u.h.server.origin, "OPTIONS", PATH, { ...DAPP, "access-control-request-method": "PUT" });
    assert.deepEqual([preflight.headers["access-control-allow-methods"], preflight.headers["access-control-allow-headers"]], ["GET, PUT, OPTIONS", "content-type, x-im-proof"]);
    let limited = false;
    for (let i = 0; i < 12 && !limited; i += 1) limited = (await raw(u.h.server.origin, "GET", PATH, DAPP)).status === 429;
    assert.ok(limited, "10 at once per client");
  } finally {
    await closeHarness(u);
  }
});
