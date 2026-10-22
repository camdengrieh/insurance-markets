import type { Address, Hex } from "viem";

import { clobAuthKernelDigest, buildClobAuthKernelTypedData, hashClobAuth, type ClobAuthFields } from "./clobauth.js";
import { buildKernelTypedData, kernelWrapDigest, type KernelSignTypedData } from "./kernel.js";
import { SigningError } from "./errors.js";
import { assertGtdExpiration, type GtdOptions } from "./expiry.js";
import { assertOrder, hashOrder, type AssertOrderOptions, type XoOrder } from "./order.js";

// What a prepare step hands to the agent: the typedData for request_wallet_sign plus the digests
// the submit step will recompute and compare against. Everything is derived from the order, so
// the digests in a quote cannot drift from the typed data.
export type SigningRequest = {
  // Digest the exchange passes to isValidSignature (order hash, or ClobAuth digest).
  innerHash: Hex;
  // Kernel-wrapped digest the owner key signs (use as `raw` payload if typedData is refused).
  wrappedDigest: Hex;
  // Smart account the Kernel domain is bound to.
  smartAccount: Address;
  typedData: KernelSignTypedData;
};

export type PrepareOrderOptions = AssertOrderOptions & {
  // Required: a signed order is a bearer instrument, so its lifetime is never implicit. The
  // order's expiration must be in the future and no further out than maxTtlSeconds (default one
  // hour). A never-expiring order cannot be prepared here at all.
  expiry: { nowSeconds: number | bigint } & Pick<GtdOptions, "minTtlSeconds" | "maxTtlSeconds">;
  // Only nonce 0 is known to be accepted: the exchange may require the maker's on-chain counter
  // (docs/research/22), so any other value is refused unless the caller names it.
  allowNonZeroNonce?: boolean;
};

export function prepareOrderSigning(order: XoOrder, options: PrepareOrderOptions): SigningRequest {
  const checked = assertOrder(order, options);
  // A caller outside the type system may omit `expiry`; that must fail closed, not mean "no limit".
  const expiry: Partial<PrepareOrderOptions["expiry"]> | undefined = options.expiry;
  if (expiry === undefined || expiry.nowSeconds === undefined) {
    throw new SigningError("invalid_expiration", "prepareOrderSigning needs an expiry window with nowSeconds");
  }
  assertGtdExpiration(checked.expiration, expiry.nowSeconds, {
    ...(expiry.minTtlSeconds === undefined ? {} : { minTtlSeconds: expiry.minTtlSeconds }),
    ...(expiry.maxTtlSeconds === undefined ? {} : { maxTtlSeconds: expiry.maxTtlSeconds }),
  });
  if (checked.nonce !== 0n && options.allowNonZeroNonce !== true) {
    throw new SigningError("invalid_order", "order.nonce must be 0 unless allowNonZeroNonce is set");
  }
  const innerHash = hashOrder(checked, options);
  return {
    innerHash,
    wrappedDigest: kernelWrapDigest(innerHash, checked.maker),
    smartAccount: checked.maker,
    typedData: buildKernelTypedData(innerHash, checked.maker),
  };
}

export function prepareClobAuthSigning(fields: ClobAuthFields): SigningRequest {
  const typedData = buildClobAuthKernelTypedData(fields);
  return {
    innerHash: hashClobAuth(fields),
    wrappedDigest: clobAuthKernelDigest(fields),
    smartAccount: typedData.domain.verifyingContract,
    typedData,
  };
}
