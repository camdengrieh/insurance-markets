import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { hashTypedData } from "viem";

import { verifyPreparedLocal } from "../src/xo/signing/rebuild.js";
import { FAKE_TRIPLET, OWNER_KEY, STRANGER_KEY, cleanupClob, prepareOk, signDigest, startClobRig, type ClobRig } from "./relay-clob-helpers.js";

// POST /v1/clob/auth/prepare and /submit against the scripted Polymarket fake. Nothing here touched a real venue.

const rigs: ClobRig[] = [];
after(() => cleanupClob(rigs));

async function rig(options: Parameters<typeof startClobRig>[0] = {}): Promise<ClobRig> {
  const started = await startClobRig({ credentials: { polymarket: false, limitless: false }, ...options });
  rigs.push(started);
  return started;
}

describe("the Polymarket login (against the scripted fake)", () => {
  it("prepares a ClobAuth typed-data item for the owner on chain 137 that rebuilds, lives about 90 s and reserves nothing", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "polymarket" });
    assert.equal(item.kind, "clob_auth");
    assert.equal(item.sign.digest_form, "eip712ClobAuth");
    if (item.sign.intent.op !== "typedData") throw new Error("typed data expected");
    const typed = item.sign.intent.typedData;
    assert.equal(typed.primaryType, "ClobAuth");
    assert.deepEqual(typed.domain, { name: "ClobAuthDomain", version: "1", chainId: 137 });
    assert.equal(typed.message["address"], OWNER_KEY.address);
    assert.equal(typed.message["message"], "This message attests that I control the given wallet");
    assert.equal(hashTypedData(typed as never), item.sign.expected_digest);
    assert.equal(item.caps.reserved_usd, "0");
    assert.ok(verifyPreparedLocal(item).ok);
    const ttl = (Date.parse(item.expires_at) - r.clock.now()) / 1000;
    assert.ok(ttl > 0 && ttl <= 90);
  });

  it("stores the derived credential after a good signature, records PM1, and answers only a key tag", async () => {
    const r = await rig();
    r.venues.derivable = true;
    const item = await prepareOk(r, "/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "polymarket" });
    const sent = await r.post("/v1/clob/auth/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest) });
    assert.ok(sent.ok, JSON.stringify(sent));
    if (!sent.ok) return;
    assert.deepEqual(Object.keys(sent.data).sort(), ["credentials", "key_tag", "venue"]);
    assert.equal(sent.data.credentials, "stored");
    assert.ok(!JSON.stringify(sent.data).includes(FAKE_TRIPLET.secret));
    assert.deepEqual(r.venues.logins.map((login) => login.path), ["/auth/derive-api-key"]);
    const login = r.venues.logins[0];
    assert.ok(login !== undefined);
    assert.equal(login.headers["poly_address"], OWNER_KEY.address);
    assert.equal(login.headers["poly_nonce"], "0");
    assert.equal(login.headers["poly_timestamp"], (item.decoded as { clob_auth: { timestamp: string } }).clob_auth.timestamp);
    const secrets = r.relay.services.secrets;
    assert.ok(secrets !== undefined);
    const stored = await secrets.get(OWNER_KEY.address.toLowerCase(), "clob_polymarket_l2");
    assert.ok(stored !== undefined);
    assert.deepEqual(JSON.parse(stored.reveal()), FAKE_TRIPLET);
    assert.equal(r.relay.services.capabilities.state("PM1"), "yes");
    assert.equal(r.relay.services.prepared.get(item.prepared_id)?.state, "accepted");
  });

  it("creates a key once when derive answers nothing, and refuses a second login once a credential is stored", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "polymarket" });
    const sent = await r.post("/v1/clob/auth/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest) });
    assert.ok(sent.ok);
    assert.deepEqual(r.venues.logins.map((login) => login.path), ["/auth/derive-api-key", "/auth/api-key"]);
    const again = await r.post("/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "polymarket" });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.error.details?.["reason"], "credentials_already_stored");
  });

  it("refuses a stranger's signature, a personal-message wrapping, and a venue that rejects the login; stores nothing", async () => {
    const r = await rig();
    const item = await prepareOk(r, "/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "polymarket" });
    const stranger = await r.post("/v1/clob/auth/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest, STRANGER_KEY) });
    assert.equal(stranger.ok, false);
    if (!stranger.ok) assert.equal(stranger.error.code, "owner_mismatch");
    const wrapped = await OWNER_KEY.signMessage({ message: { raw: item.sign.expected_digest as `0x${string}` } });
    const eip191 = await r.post("/v1/clob/auth/submit", { prepared_id: item.prepared_id, signature: wrapped });
    assert.equal(eip191.ok, false);
    if (!eip191.ok) assert.equal(eip191.error.code, "signature_invalid");
    assert.equal(r.venues.logins.length, 0);
    r.venues.loginRefused = true;
    const refused = await r.post("/v1/clob/auth/submit", { prepared_id: item.prepared_id, signature: await signDigest(item.sign.expected_digest) });
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.error.code, "upstream_rejected");
    const secrets = r.relay.services.secrets;
    assert.ok(secrets !== undefined);
    assert.equal(await secrets.has(OWNER_KEY.address.toLowerCase(), "clob_polymarket_l2"), false);
    assert.equal(r.relay.services.prepared.get(item.prepared_id)?.state, "rejected");
  });

  it("answers not_implemented for Limitless, whose tokens are minted in its own UI", async () => {
    const r = await rig();
    const result = await r.post("/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "limitless" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "not_implemented");
  });

  it("refuses with flag_off when ENABLE_CLOB_POLYMARKET is off", async () => {
    const r = await rig({ env: { ENABLE_CLOB_POLYMARKET: "0" } });
    const result = await r.post("/v1/clob/auth/prepare", { owner: OWNER_KEY.address, venue: "polymarket" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "flag_off");
  });
});
