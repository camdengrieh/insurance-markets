// The orderbook's credentials surface: L1 (a ClobAuth signature by the account), L2 (an HMAC with an API key),
// and the four /auth routes.
//
//   GET    /auth/derive-api-key   L1   the oldest key of the account; 404 when there is none
//   POST   /auth/api-key          L1   mints a key (capped by auth.max_keys); registers the account under
//                                      registry.trigger = on-l1-create
//   GET    /auth/api-keys         L2   the account's key ids
//   DELETE /auth/api-key          L1 or L2 (auth.delete_level)
//
// What is checked, and where it comes from:
//   L1  the XO_* headers; the timestamp within 120 s of the mock clock (live: accepted at -110 and +120, rejected
//       at -125 and +150, error text "L1 timestamp too old or too far in future"); the ClobAuth digest
//       recomputed; plain ECDSA when the signature is 65 bytes, else ERC-1271 on the account, which here is the
//       REAL deployed Kernel on the local chain (live error text starts "L1 signature invalid (ECDSA failed;
//       EIP-1271: ...)"). An undeployed account fails ("no contract code") unless l1.undeployed = erc6492 and
//       the signature is an ERC-6492 wrapper by the owner of that counterfactual account. Basis: docs and one
//       live probe with a dummy signature (H for the texts quoted, M for the rest).
//   L2  the four XO_API_KEY / XO_TIMESTAMP / XO_PASSPHRASE / XO_SIGNATURE headers; the key and its passphrase;
//       the timestamp within 30 s (docs); XO_ADDRESS when l2.xo_address = required; the HMAC over
//       timestamp + METHOD + target + body, with the target and the key decoding picked by hmac.target and
//       hmac.decode. Basis: docs for the string, switches for what the docs leave open (M).
// Every error text that is not quoted above is synthetic (M).

import { createHash } from "node:crypto";

import { getAddress, hashMessage, keccak256, recoverAddress, size, toHex, type Address, type Hex } from "viem";

import { deriveAccount } from "../../src/xo/account/derive.js";
import { KERNEL_FACTORY, OPERATING_LIMITS } from "../../src/xo/chain/constants.js";
import type { MockEnv } from "./env.js";
import { orderbookErrors } from "./errors.js";
import type { MockListener, MockReply, MockRequest } from "./listener.js";
import { accountCode, clobAuthDigest, isValidSignature1271, kernelWrappedDigest, parseWireSignature, unwrapErc6492 } from "./verify.js";
import { accountKey, type AccountKey } from "./state.js";
import type { Credential } from "./write-state.js";
import { failure, hmacSignature, okJson, parseJsonObject, safeEqual, toBase64Url, xoHeader, type HmacDecode } from "./wire.js";

export type AuthResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reply: MockReply };

export interface L1Principal {
  readonly account: AccountKey;
  // kernel: an XO smart account (deployed, or counterfactual under erc6492). eoa: a plain ECDSA signer.
  readonly kind: "kernel" | "eoa";
}

export interface L2Principal {
  readonly account: AccountKey;
  readonly credential: Credential;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const L1_WINDOW_S = OPERATING_LIMITS.l1TimestampWindowS;
const L2_WINDOW_S = OPERATING_LIMITS.l2TimestampWindowS;

const unauthorized = (text: string): MockReply => failure(401, text);

// ---- L1 -----------------------------------------------------------------------------------------------------------------

export async function verifyL1(env: MockEnv, request: MockRequest): Promise<AuthResult<L1Principal>> {
  const address = xoHeader(request, "address");
  const signature = xoHeader(request, "signature");
  const timestamp = xoHeader(request, "timestamp");
  if (address === undefined || signature === undefined || timestamp === undefined) return { ok: false, reply: orderbookErrors.l1Required() };
  if (!ADDRESS.test(address)) return { ok: false, reply: failure(400, "invalid XO_ADDRESS") };
  if (!/^[1-9][0-9]{0,11}$/.test(timestamp)) return { ok: false, reply: unauthorized("L1 timestamp invalid") };
  const nonceText = xoHeader(request, "nonce") ?? "0";
  if (!/^(0|[1-9][0-9]{0,77})$/.test(nonceText)) return { ok: false, reply: failure(400, "invalid XO_NONCE") };
  if (Math.abs(env.clock.nowSeconds() - Number(timestamp)) > L1_WINDOW_S) {
    return { ok: false, reply: unauthorized("L1 timestamp too old or too far in future") };
  }
  if (!/^0x([0-9a-fA-F]{2})+$/.test(signature)) return { ok: false, reply: unauthorized("L1 signature invalid (not hex)") };
  const account = getAddress(address);
  const digest = clobAuthDigest(account, timestamp, BigInt(nonceText));
  const sig = signature as Hex;

  // ECDSA first, as the live error text says: a 65-byte signature by the address itself.
  if (size(sig) === 65) {
    try {
      if (getAddress(await recoverAddress({ hash: digest, signature: sig })) === account) return { ok: true, value: { account: accountKey(account), kind: "eoa" } };
    } catch {
      // fall through to the reason below
    }
  }

  if (env.chains.xo === undefined) return { ok: false, reply: failure(503, "mock: the XO chain is not part of this mock, so ERC-1271 cannot be checked") };
  const code = await accountCode(env.chains, account);
  if (code === "0x") {
    if (env.switches.get("l1.undeployed") === "erc6492") {
      const wrapped = unwrapErc6492(sig);
      if (wrapped !== null && (await counterfactualSignatureValid(wrapped.factory, wrapped.inner, account, digest))) {
        return { ok: true, value: { account: accountKey(account), kind: "kernel" } };
      }
      if (wrapped !== null) return { ok: false, reply: unauthorized("L1 signature invalid (ERC-6492: the wrapped signature does not match this counterfactual account)") };
    }
    return { ok: false, reply: unauthorized("L1 signature invalid (ECDSA failed; EIP-1271: no contract code)") };
  }
  if (await isValidSignature1271(env.chains, account, digest, sig)) return { ok: true, value: { account: accountKey(account), kind: "kernel" } };
  return { ok: false, reply: unauthorized("L1 signature invalid (ECDSA failed; EIP-1271: the account rejected the signature)") };
}

// A counterfactual Kernel account has exactly one owner, the one it is derived from (AD1). An ERC-6492
// signature is therefore valid when the inner signature recovers to an owner whose derived account is the
// address, under either digest form.
async function counterfactualSignatureValid(factory: Address, inner: Hex, account: Address, digest: Hex): Promise<boolean> {
  if (factory !== KERNEL_FACTORY) return false;
  const parsed = parseWireSignature(inner);
  if ("error" in parsed) return false;
  const wrapped = kernelWrappedDigest(digest, account);
  for (const hash of [wrapped, hashMessage({ raw: wrapped })]) {
    try {
      const owner = await recoverAddress({ hash, signature: parsed.sig65 });
      if (deriveAccount(owner) === account) return true;
    } catch {
      // try the other form
    }
  }
  return false;
}

// ---- L2 -----------------------------------------------------------------------------------------------------------------

export function verifyL2(env: MockEnv, request: MockRequest, missingText: string = "HMAC L2 credentials required"): AuthResult<L2Principal> {
  const apiKey = xoHeader(request, "api_key");
  const timestamp = xoHeader(request, "timestamp");
  const passphrase = xoHeader(request, "passphrase");
  const signature = xoHeader(request, "signature");
  // POLY_* headers are not read at all (live), so a request that carries only those has no credentials.
  if (apiKey === undefined || timestamp === undefined || passphrase === undefined || signature === undefined) {
    return { ok: false, reply: unauthorized(missingText) };
  }
  const credential = env.write.credentialByKey(apiKey);
  if (credential === undefined || !safeEqual(credential.passphrase, passphrase)) return { ok: false, reply: unauthorized("invalid API key") };
  if (!/^[1-9][0-9]{0,11}$/.test(timestamp) || Math.abs(env.clock.nowSeconds() - Number(timestamp)) > L2_WINDOW_S) {
    return { ok: false, reply: unauthorized("L2 timestamp too old or too far in future") };
  }
  if (env.switches.get("l2.xo_address") === "required") {
    const address = xoHeader(request, "address");
    if (address === undefined) return { ok: false, reply: unauthorized("XO_ADDRESS header required") };
    if (!ADDRESS.test(address) || accountKey(address) !== credential.account) return { ok: false, reply: unauthorized("XO_ADDRESS does not match the API key") };
  }
  const target = env.switches.get("hmac.target") === "path-only" ? request.path : `${request.path}${request.search}`;
  const message = `${timestamp}${request.method}${target}${request.body}`;
  const expected = hmacSignature(credential.secret, env.switches.get("hmac.decode") as HmacDecode, message);
  if (!safeEqual(expected, signature)) return { ok: false, reply: unauthorized("invalid L2 signature") };
  return { ok: true, value: { account: credential.account, credential } };
}

// ---- keys ---------------------------------------------------------------------------------------------------------------

// Deterministic, so a run never depends on Math.random: the n-th key of an account is the same every run.
export function mintCredential(env: MockEnv, account: AccountKey): Credential {
  const n = env.write.nextKeyIndex(account);
  const seed = keccak256(toHex(`mock-api-key:${account}:${String(n)}`));
  const bytes = Buffer.from(seed.slice(2), "hex");
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const h = bytes.subarray(0, 16).toString("hex");
  const apiKey = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  const secretBytes = Buffer.from(createHash("sha256").update(`secret:${seed}`).digest());
  const secret = toBase64Url(secretBytes, true);
  const passphrase = createHash("sha256").update(`passphrase:${seed}`).digest("hex").slice(0, 40);
  const credential: Credential = { apiKey, secret, passphrase, account, createdMs: env.clock.nowMs() };
  env.write.credentials.push(credential);
  return credential;
}


// ---- routes --------------------------------------------------------------------------------------------------------------

export function registerAuth(listener: MockListener, env: MockEnv): void {
  listener.override("GET", "/auth/derive-api-key", async (request) => {
    const l1 = await verifyL1(env, request);
    if (!l1.ok) return l1.reply;
    const oldest = env.write.credentialsOf(l1.value.account)[0];
    if (oldest === undefined) return failure(404, "no API key found for this address");
    // Whether derive returns the secret again is NOT ESTABLISHABLE WITHOUT XO (AU2); the switch decides.
    if (env.switches.get("auth.derive_returns_secret") === "yes") return okJson({ apiKey: oldest.apiKey, secret: oldest.secret, passphrase: oldest.passphrase });
    return okJson({ apiKey: oldest.apiKey });
  });

  listener.override("POST", "/auth/api-key", async (request) => {
    const l1 = await verifyL1(env, request);
    if (!l1.ok) return l1.reply;
    const limit = Number(env.switches.get("auth.max_keys"));
    if (env.write.credentialsOf(l1.value.account).length >= limit) return failure(400, "api key limit reached");
    const credential = mintCredential(env, l1.value.account);
    // registry.trigger = on-l1-create reads this set.
    env.state.markL1Created(credential.account);
    return okJson({ apiKey: credential.apiKey, secret: credential.secret, passphrase: credential.passphrase });
  });

  listener.override("GET", "/auth/api-keys", (request) => {
    const l2 = verifyL2(env, request, "L2 auth required");
    if (!l2.ok) return l2.reply;
    return okJson({ apiKeys: env.write.credentialsOf(l2.value.account).map((entry) => entry.apiKey) });
  });

  listener.override("DELETE", "/auth/api-key", async (request) => {
    const body = parseJsonObject(request.body);
    const wanted = body?.["api_key"] ?? body?.["apiKey"];
    if (typeof wanted !== "string" || wanted === "") return failure(400, "api_key is required");
    let account: AccountKey;
    if (env.switches.get("auth.delete_level") === "L1") {
      const l1 = await verifyL1(env, request);
      if (!l1.ok) return l1.reply;
      account = l1.value.account;
    } else {
      const l2 = verifyL2(env, request);
      if (!l2.ok) return l2.reply;
      account = l2.value.account;
    }
    const credential = env.write.credentialByKey(wanted);
    if (credential === undefined || credential.account !== account) return failure(404, "api key not found");
    env.write.deleteCredential(wanted);
    return okJson({ success: true });
  });
}

