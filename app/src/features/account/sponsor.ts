// Sponsored calls from the trading key E on Polygon, Base and BNB Chain (docs/unified-account-design.md section 3.1; note
// 46 sections 3.1 and 5): E is delegated by EIP-7702 to viem's Simple7702Account (EntryPoint 0.8) and every action is an
// ERC-4337 user operation whose gas our paymaster pays. The bundler and the paymaster are both reached through one route
// on our markets API, `${MARKETS_API_ORIGIN}/v1/paymaster/<chainId>`, which adds the provider key and the sponsorship
// policy on the server and refuses calls outside its allowlist: the page holds no provider key.
//
// One call to sendCalls:
//   1. read E's code on the chain (the page's public RPC): none means E is not delegated yet; exactly the 7702 marker
//      0xef0100 followed by Simple7702Account's address means it is; anything else (another delegate, a contract) is
//      refused, because a user operation for Simple7702 would not validate there;
//   2. not delegated yet: E signs the EIP-7702 authorization (chain, implementation, E's current transaction nonce) and it
//      rides in this first user operation's authorization field (eip7702Auth on the wire), so the delegation costs E no
//      gas either;
//   3. viem's bundler client fills the operation (nonce from the EntryPoint, gas prices from the bundler's
//      pimlico_getUserOperationGasPrice, paymaster stub and data through ERC-7677 pm_* methods, gas limits from the
//      bundler), E signs its EIP-712 user-operation hash, and the bundler gets it;
//   4. wait for the receipt and return the transaction hash; an operation that ran and reverted is an error, with the
//      hash.
// XO 3223 is not here: XO's own bundler and paymaster keep serving the XO account. Calls on one chain are sent one after
// another (the EntryPoint nonce is sequential); different chains run independently.

import {
  createClient,
  isAddressEqual,
  type Address,
  type Chain,
  type Hex,
  type PrivateKeyAccount,
  type SignedAuthorization,
  type Transport,
} from "viem";
import { createBundlerClient, createPaymasterClient, toSimple7702SmartAccount, type SmartAccount } from "viem/account-abstraction";
import { getCode, getTransactionCount } from "viem/actions";

import { SPONSORED_CHAIN_IDS } from "./constants";

export interface SponsorCall {
  readonly to: Address;
  readonly data: Hex;
  readonly value?: bigint;
}

export interface Sponsor {
  // The hash of the transaction that carried the user operation, once it is mined and succeeded.
  sendCalls(chainId: number, calls: readonly SponsorCall[]): Promise<Hex>;
}

export type SponsorErrorCode =
  // The chain is not one the paymaster sponsors (XO, or any other).
  | "chain_not_sponsored"
  // No markets API or no public RPC for the chain in this build, or the paymaster route is not deployed.
  | "not_available"
  // E already has code that is not the Simple7702 delegation.
  | "delegated_elsewhere"
  // The paymaster or the bundler refused the operation (a call outside the allowlist, a spending cap, a bad signature).
  | "refused"
  // The operation was mined and reverted.
  | "reverted"
  // A request failed to reach the chain, the paymaster or the bundler.
  | "unreachable"
  // No receipt before the deadline: the operation may still land.
  | "timeout";

export class SponsorError extends Error {
  readonly code: SponsorErrorCode;
  // What the bundler, the paymaster or the node said, cut short. A stranger's text: rendered only as untrusted text.
  readonly detail: string | null;
  // The transaction hash, when one exists (a reverted operation).
  readonly transactionHash: Hex | null;

  constructor(code: SponsorErrorCode, message: string, options: { readonly detail?: string | null; readonly transactionHash?: Hex | null } = {}) {
    super(message);
    this.name = "SponsorError";
    this.code = code;
    this.detail = options.detail ?? null;
    this.transactionHash = options.transactionHash ?? null;
  }
}

export interface SponsorDeps {
  readonly owner: PrivateKeyAccount;
  // The chain as viem names it (id, native currency, public RPC); null when the page has none for it.
  readonly chain: (chainId: number) => Chain | null;
  // JSON-RPC to the chain's public node (code, transaction count, EntryPoint nonce); null when there is none.
  readonly rpcTransport: (chainId: number) => Transport | null;
  // JSON-RPC to our paymaster route for the chain (bundler and paymaster methods); null when the build has no markets API.
  readonly paymasterTransport: (chainId: number) => Transport | null;
  readonly receiptTimeoutMs?: number;
  readonly pollingIntervalMs?: number;
}

export const RECEIPT_TIMEOUT_MS = 120_000;
const DETAIL_CHARS = 240;

// The EIP-7702 delegation designator for an implementation: 0xef0100 followed by its 20 bytes.
export function delegationCode(implementation: Address): Hex {
  return `0xef0100${implementation.slice(2).toLowerCase()}`;
}

type CodeState = { readonly kind: "none" } | { readonly kind: "delegated" } | { readonly kind: "other" };

export function codeState(code: Hex | undefined, implementation: Address): CodeState {
  if (code === undefined || code === "0x") return { kind: "none" };
  return code.toLowerCase() === delegationCode(implementation) ? { kind: "delegated" } : { kind: "other" };
}

function detailOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const text = ("shortMessage" in error && typeof error.shortMessage === "string" ? error.shortMessage : error.message).replace(/\s+/g, " ").trim();
  return text === "" ? null : text.slice(0, DETAIL_CHARS);
}

function statusOf(error: unknown): number | null {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 8; current = current.cause, depth += 1) {
    if ("status" in current && typeof current.status === "number") return current.status;
  }
  return null;
}

function isTimeout(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 8; current = current.cause, depth += 1) {
    if (current.name === "WaitForUserOperationReceiptTimeoutError" || current.name === "TimeoutError") return true;
  }
  return false;
}

function isTransport(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 8; current = current.cause, depth += 1) {
    if (current.name === "HttpRequestError" || current.name === "TypeError") return true;
  }
  return false;
}

// What the bundler's gas price method answers (Pimlico's slow / standard / fast tiers).
function gasPriceOf(raw: unknown): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } | null {
  const fast = typeof raw === "object" && raw !== null ? (raw as { fast?: { maxFeePerGas?: unknown; maxPriorityFeePerGas?: unknown } }).fast : undefined;
  const fee = fast?.maxFeePerGas;
  const tip = fast?.maxPriorityFeePerGas;
  if (typeof fee !== "string" || typeof tip !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(fee) || !/^0x[0-9a-fA-F]{1,64}$/.test(tip)) return null;
  return { maxFeePerGas: BigInt(fee), maxPriorityFeePerGas: BigInt(tip) };
}

export function createSponsor(deps: SponsorDeps): Sponsor {
  const queues = new Map<number, Promise<unknown>>();
  const timeout = deps.receiptTimeoutMs ?? RECEIPT_TIMEOUT_MS;

  async function send(chainId: number, calls: readonly SponsorCall[]): Promise<Hex> {
    const chain = deps.chain(chainId);
    const rpc = deps.rpcTransport(chainId);
    const paymasterTransport = deps.paymasterTransport(chainId);
    if (chain === null || rpc === null || paymasterTransport === null) {
      throw new SponsorError("not_available", "Gas sponsorship is not available for this chain in this build. Nothing was sent.");
    }
    // A bare client: the public actions decorator would bring ENS avatar code (and its gateway hosts) into the page.
    const client = createClient({ chain, transport: rpc });
    const account: SmartAccount = await toSimple7702SmartAccount({ client, owner: deps.owner });
    const implementation = account.authorization?.address;
    if (implementation === undefined) throw new SponsorError("not_available", "The smart account has no delegation target. Nothing was sent.");

    let authorization: SignedAuthorization | undefined;
    try {
      const state = codeState(await getCode(client, { address: deps.owner.address }), implementation);
      if (state.kind === "other") {
        throw new SponsorError("delegated_elsewhere", "Your trading account already runs other code on this chain, so the sponsor cannot act for it. Nothing was sent.");
      }
      if (state.kind === "none") {
        const nonce = await getTransactionCount(client, { address: deps.owner.address, blockTag: "pending" });
        authorization = await deps.owner.signAuthorization({ chainId, address: implementation, nonce });
      }
    } catch (error) {
      if (error instanceof SponsorError) throw error;
      throw new SponsorError("unreachable", "The chain could not be read, so nothing was sent.", { detail: detailOf(error) });
    }

    const paymaster = createPaymasterClient({ transport: paymasterTransport });
    const bundler = createBundlerClient({
      client,
      chain,
      transport: paymasterTransport,
      paymaster,
      userOperation: {
        async estimateFeesPerGas() {
          const raw = await (bundler.request as (args: { method: string; params: readonly unknown[] }) => Promise<unknown>)({ method: "pimlico_getUserOperationGasPrice", params: [] });
          const price = gasPriceOf(raw);
          if (price === null) throw new SponsorError("refused", "The sponsor did not quote a gas price. Nothing was sent.");
          return price;
        },
      },
    });

    let hash: Hex;
    try {
      hash = await bundler.sendUserOperation({
        account,
        calls: calls.map((call) => ({ to: call.to, data: call.data, value: call.value ?? 0n })),
        ...(authorization === undefined ? {} : { authorization }),
      });
    } catch (error) {
      if (error instanceof SponsorError) throw error;
      const status = statusOf(error);
      if (status === 404 || status === 405 || status === 501 || status === 503) {
        throw new SponsorError("not_available", "Gas sponsorship is not switched on yet. Nothing was sent.", { detail: detailOf(error) });
      }
      if (isTransport(error) && status === null) throw new SponsorError("unreachable", "The gas sponsor could not be reached. Nothing was sent.", { detail: detailOf(error) });
      throw new SponsorError("refused", "The gas sponsor refused this action. Nothing was sent.", { detail: detailOf(error) });
    }

    let receipt;
    try {
      receipt = await bundler.waitForUserOperationReceipt({ hash, timeout, ...(deps.pollingIntervalMs === undefined ? {} : { pollingInterval: deps.pollingIntervalMs }) });
    } catch (error) {
      if (isTimeout(error)) throw new SponsorError("timeout", "The action was sent but no receipt came back in time. It may still go through; check your balance before trying again.", { detail: detailOf(error) });
      throw new SponsorError("unreachable", "The action was sent but its receipt could not be read. It may still go through; check your balance before trying again.", { detail: detailOf(error) });
    }
    const transactionHash = receipt.receipt.transactionHash;
    if (!receipt.success) throw new SponsorError("reverted", "The action was mined but failed on chain. No funds moved.", { detail: receipt.reason ?? null, transactionHash });
    if (!isAddressEqual(receipt.sender, deps.owner.address)) throw new SponsorError("refused", "The receipt is for another account.", { transactionHash });
    return transactionHash;
  }

  return {
    sendCalls(chainId, calls) {
      if (!SPONSORED_CHAIN_IDS.includes(chainId)) {
        return Promise.reject(new SponsorError("chain_not_sponsored", "Gas is sponsored on Polygon, Base and BNB Chain only. Nothing was sent."));
      }
      if (calls.length === 0) return Promise.reject(new SponsorError("refused", "There is nothing to send."));
      const previous = queues.get(chainId) ?? Promise.resolve();
      const next = previous.catch(() => undefined).then(() => send(chainId, calls));
      queues.set(chainId, next);
      return next;
    },
  };
}
