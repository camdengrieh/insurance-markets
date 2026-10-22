import { tmpdir } from "node:os";
import { join } from "node:path";

import { hashTypedData, type Hex } from "viem";

import { digestTag, type PayboxSignIntent } from "../../../src/relay/contract.js";
import { deriveAccount } from "../../../src/xo/account/derive.js";
import { ANVIL_ACCOUNT_0_OWNER } from "../../../src/xo/chain/constants.js";
import { ORDER_CAP_FEE_BPS, computeOrderAmounts } from "../../../src/xo/signing/amounts.js";
import { clobAuthKernelDigest } from "../../../src/xo/signing/clobauth.js";
import { ZERO_ADDRESS, ZERO_BYTES16, ZERO_BYTES32 } from "../../../src/xo/signing/constants.js";
import type { XoOrder } from "../../../src/xo/signing/order.js";
import { prepareOrderSigning } from "../../../src/xo/signing/prepare.js";
import { buildDecodedAuth, buildDecodedOrder, innerHashSummaryFields, rebuildDecoded } from "../../../src/xo/signing/rebuild.js";
import { ANVIL_TEST_ACCOUNTS } from "../../../test/fixtures/userop/anvil-test-keys.js";
import { verifiedDeployItem } from "../../../test/tools-decoded-helpers.js";
import type { Obj } from "../../../test/tools-helpers.js";
import { ARMABLE_ENV } from "../tools/helpers.js";
import type { ClientCredential, ClientFailure, ClientSignRequest, ClientSigned, PayboxClient } from "../../paybox-signer.js";

// Items for the signer tests. Every one is built by the repo's own code for the public Anvil account 0 and really
// rebuilds to its digest, tags and summary lines (verifyPreparedLocal says "verified"). Signatures are made with the
// well-known public Anvil test key and nothing else. No PayBox, no network, no secret.

export const OWNER = ANVIL_ACCOUNT_0_OWNER;
export const ACCOUNT = deriveAccount(OWNER);
function anvil(index: number): (typeof ANVIL_TEST_ACCOUNTS)[number] {
  const found = ANVIL_TEST_ACCOUNTS[index];
  if (found === undefined) throw new Error("test setup: Anvil account");
  return found;
}
export const OWNER_KEY_ACCOUNT = anvil(0);
export const OTHER_KEY_ACCOUNT = anvil(1);

export const VALID_UNTIL = "2026-10-19T12:05:00Z";
export const ID_USEROP = "00112233445566778899aabbccddeeff";
export const ID_ORDER = "0123456789abcdef0123456789abcdef";
export const ID_AUTH = "fedcba9876543210fedcba9876543210";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function deployItem(id = ID_USEROP, options: { ttlS?: number } = {}): Obj {
  return verifiedDeployItem({ preparedId: id, ...(options.ttlS === undefined ? {} : { ttlS: options.ttlS }) });
}

// A real (condition, token) pair: the shared rebuild now refuses a condition id that does not derive the token.
const TOKEN_ID = 68215442288791572296498952759094916177229244750752613990844701608971303593663n;
const CONDITION_ID = "0xb63d8f77fc1437a804d5fdeedb4c00dc49e1d7c7738f6410c36f1f44e6cfd654";
const EXPIRATION = 1_792_411_500n;
const SALT = 987_654_321_012_345n;

export function orderItem(id = ID_ORDER): Obj {
  const sideCode = 0;
  const amounts = computeOrderAmounts({ side: sideCode, price: "0.55", shares: "10" });
  const order: XoOrder = {
    salt: SALT,
    maker: ACCOUNT,
    signer: ACCOUNT,
    beneficiary: ZERO_ADDRESS,
    tokenId: TOKEN_ID,
    makerAmount: amounts.makerAmount,
    takerAmount: amounts.takerAmount,
    expiration: EXPIRATION,
    nonce: 0n,
    identifier: ZERO_BYTES16,
    metadata: ZERO_BYTES32,
    side: sideCode,
    signatureType: 3,
  };
  const signing = prepareOrderSigning(order, { expiry: { nowSeconds: EXPIRATION - 300n } });
  const decoded = buildDecodedOrder({ owner: OWNER, order, feeBps: ORDER_CAP_FEE_BPS, tif: "GTD", postOnly: false, purpose: "trade", ttlS: 300, conditionId: CONDITION_ID });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the order did not rebuild (${rebuilt.field})`);
  if (decoded.kind !== "order") throw new Error("test setup: not an order");
  return {
    prepared_id: id,
    kind: "order",
    owner: OWNER,
    account: ACCOUNT,
    expires_at: VALID_UNTIL,
    sign: { intent: { op: "typedData", typedData: clone(signing.typedData) }, expected_digest: signing.wrappedDigest, digest_form: "kernelWrappedOrderHash" },
    summary: { lines: [...rebuilt.lines], digest_tag: digestTag(signing.wrappedDigest), ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: decoded.terms.cap_usd, day_remaining_usd: "40" },
    capabilities: {},
    warnings: [],
    decoded,
    quote: { price: "0.55", shares: "10", max_outlay_usd: decoded.terms.max_outlay_usd ?? "0", fee_bound_bps: ORDER_CAP_FEE_BPS, expires_at: decoded.terms.expires_at },
  };
}

export function authItem(id = ID_AUTH): Obj {
  const timestamp = "1792410000";
  const decoded = buildDecodedAuth({ owner: OWNER, account: ACCOUNT, timestamp, wrapped: true });
  const rebuilt = rebuildDecoded(decoded);
  if (!rebuilt.ok) throw new Error(`test setup: the login did not rebuild (${rebuilt.field})`);
  const signed = clobAuthKernelDigest({ address: ACCOUNT, timestamp, nonce: 0n });
  return {
    prepared_id: id,
    kind: "auth",
    owner: OWNER,
    account: ACCOUNT,
    expires_at: VALID_UNTIL,
    sign: { intent: { op: "raw", rawSigningPayloadHex: signed }, expected_digest: signed, digest_form: "kernelWrappedClobAuth" },
    summary: { lines: [...rebuilt.lines], digest_tag: digestTag(signed), ...innerHashSummaryFields(decoded, rebuilt.inner_hash) },
    caps: { reserved_usd: "0", day_remaining_usd: "50" },
    capabilities: {},
    warnings: [],
    decoded,
  };
}

// ---- editing a plain item ----------------------------------------------------------------------------------------------------------

export function edit(item: Obj, change: (copy: Obj) => void): Obj {
  const copy = clone(item);
  change(copy);
  return copy;
}

export function child(parent: Obj, key: string): Obj {
  const value = parent[key];
  if (typeof value !== "object" || value === null) throw new Error(`test setup: ${key} is not an object`);
  return value as Obj;
}

export function digestOf(item: Obj): Hex {
  return child(item, "sign")["expected_digest"] as Hex;
}

// ---- signing with the public test key ------------------------------------------------------------------------------------------

export function digestOfIntent(intent: PayboxSignIntent): Hex {
  if (intent.op === "raw") return intent.rawSigningPayloadHex as Hex;
  return hashTypedData({ domain: intent.typedData.domain, types: intent.typedData.types, primaryType: intent.typedData.primaryType, message: intent.typedData.message } as Parameters<typeof hashTypedData>[0]);
}

export async function signWith(account: typeof OWNER_KEY_ACCOUNT, hash: Hex): Promise<Hex> {
  return account.sign({ hash });
}

// ---- a PayBox client that does what the test says -------------------------------------------------------------------------------

export type SignCall = ClientSignRequest;

export class FakeClient implements PayboxClient {
  approvalMode: string | null = "always_approve";
  address: string | null = OWNER;
  credentialFailure: ClientFailure | undefined;
  credentialCalls = 0;
  readonly signCalls: SignCall[] = [];
  // Replace to script a result. The default signs the intent's own digest with the public Anvil account 0 key.
  signer: (call: SignCall, signal: AbortSignal) => Promise<ClientSigned | ClientFailure> = async (call) => ({ ok: true, signature: await signWith(OWNER_KEY_ACCOUNT, digestOfIntent(call.intent)), requestRef: "req_test_0001" });

  async credential(): Promise<ClientCredential | ClientFailure> {
    this.credentialCalls += 1;
    if (this.credentialFailure !== undefined) return this.credentialFailure;
    return { ok: true, approvalMode: this.approvalMode, address: this.address };
  }

  async sign(request: SignCall, signal: AbortSignal): Promise<ClientSigned | ClientFailure> {
    this.signCalls.push(request);
    return this.signer(request, signal);
  }
}

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}
export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// ---- environment ------------------------------------------------------------------------------------------------------------------

// A directory name that does not exist and is never created: the fake client never reads it.
export const CONFIG_DIR = join(tmpdir(), "cockpit-signer-test-config-unused");
// A credential id has the form the PayBox CLI requires (a UUID). This one is made up and names nothing.
export const CREDENTIAL = "0b7e4c2a-5d1f-4a3b-8c9d-0e1f2a3b4c5d";

export const S2_ENV: Readonly<Record<string, string>> = Object.freeze({
  ...ARMABLE_ENV,
  ENABLE_PAYBOX_SIGNER: "1",
  PAYBOX_SIGNER_ACK_DT: "DT1,DT3",
  PAYBOX_CONFIG_DIR: CONFIG_DIR,
  PAYBOX_SIGNER_CREDENTIAL: CREDENTIAL,
});
