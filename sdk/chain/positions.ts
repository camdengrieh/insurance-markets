import { decodeFunctionResult, encodeFunctionData, getAddress, padHex } from "viem";

import { CTF_ABI, decodeTransfers, payoutsOf, TRANSFER_BATCH_TOPIC, TRANSFER_SINGLE_TOPIC, type Payouts } from "./ctf.js";
import type { ContractPin, PinCheck, PinGuard } from "./pins.js";
import { RpcError, type Address, type Hex, type RpcPort, type RpcRequestOptions } from "./rpc.js";
import { POLYMARKET_MODULE_ABI, POLYMARKET_RESULT_DENOMINATOR } from "./polymarket/abi.js";

// Positions read from the chain alone: ERC-1155 balances on a pinned ledger, and the result that decides what each is
// worth, for the token ids a caller names. Where the ids come from is the venue module's business (derived from a
// condition the page already knows, or found by a bounded scan of transfers to the holder, below); nothing here asks a
// venue. Every ledger and resolution contract is checked against its pin before anything is read from it.

export type ResolutionSource =
  // Conditional Tokens: payoutNumerators(conditionId, i) / payoutDenominator(conditionId).
  | { readonly kind: "ctf"; readonly ledger: ContractPin; readonly conditionId: Hex; readonly outcomeIndex: number }
  // Polymarket Protocol V2: getResult(conditionId) on the module the position id names, in parts per million.
  | { readonly kind: "module"; readonly module: ContractPin; readonly conditionId: Hex; readonly outcomeIndex: number; readonly denominator: bigint };

export interface PositionTarget {
  readonly tokenId: bigint;
  readonly ledger: ContractPin;
  // null: the chain gives no way to tell which condition this id belongs to.
  readonly resolution: ResolutionSource | null;
}

export type ResolutionRead =
  | { readonly state: "unresolved" }
  | { readonly state: "resolved"; readonly numerator: bigint; readonly denominator: bigint }
  // Fixed app words: why the result is not known.
  | { readonly state: "unknown"; readonly why: string };

export interface PositionRead {
  readonly target: PositionTarget;
  // Raw ledger units; null when the read failed (never 0 for "not read").
  readonly balance: bigint | null;
  readonly resolution: ResolutionRead;
}

export interface PositionsResult {
  readonly positions: readonly PositionRead[];
  // Contracts whose pin check failed, with the reason; nothing was read from them.
  readonly refused: readonly Extract<PinCheck, { ok: false }>[];
}

export const MAX_IDS_PER_CALL = 100;
export const MAX_TARGETS = 1_000;

function keyOf(address: string): string {
  return address.toLowerCase();
}

// balanceOfBatch([holder x n], ids) on one ledger, in calls of at most MAX_IDS_PER_CALL ids. A call that fails or
// answers a list of the wrong length leaves its ids null.
export async function readBalances(port: RpcPort, ledger: Address, holder: Address, ids: readonly bigint[], options?: RpcRequestOptions): Promise<Array<bigint | null>> {
  const owner = getAddress(holder);
  const chunks: bigint[][] = [];
  for (let from = 0; from < ids.length; from += MAX_IDS_PER_CALL) chunks.push(ids.slice(from, from + MAX_IDS_PER_CALL));
  const results = await port.callMany(
    chunks.map((chunk) => ({ to: ledger, data: encodeFunctionData({ abi: CTF_ABI, functionName: "balanceOfBatch", args: [chunk.map(() => owner), chunk] }) })),
    options,
  );
  const out: Array<bigint | null> = [];
  chunks.forEach((chunk, index) => {
    const result = results[index];
    let values: readonly bigint[] | null = null;
    if (result !== undefined && result.ok) {
      try {
        const decoded = decodeFunctionResult({ abi: CTF_ABI, functionName: "balanceOfBatch", data: result.data });
        if (decoded.length === chunk.length) values = decoded;
      } catch {
        values = null;
      }
    }
    for (let i = 0; i < chunk.length; i += 1) out.push(values === null ? null : (values[i] ?? null));
  });
  return out;
}

// payoutDenominator and getOutcomeSlotCount for each condition, then the numerators of the resolved ones. Two rounds
// of reads, each one batch. A condition whose reads fail or disagree is null.
export async function readCtfPayouts(port: RpcPort, ledger: Address, conditionIds: readonly Hex[], options?: RpcRequestOptions): Promise<Map<Hex, Payouts | null>> {
  const unique = [...new Set(conditionIds.map((id) => id.toLowerCase() as Hex))];
  const out = new Map<Hex, Payouts | null>();
  if (unique.length === 0) return out;
  const first = await port.callMany(
    unique.flatMap((conditionId) => [
      { to: ledger, data: encodeFunctionData({ abi: CTF_ABI, functionName: "payoutDenominator", args: [conditionId] }) },
      { to: ledger, data: encodeFunctionData({ abi: CTF_ABI, functionName: "getOutcomeSlotCount", args: [conditionId] }) },
    ]),
    options,
  );
  const uint = (result: (typeof first)[number] | undefined): bigint | null => {
    if (result === undefined || !result.ok || !/^0x[0-9a-f]{64}$/.test(result.data)) return null;
    return BigInt(result.data);
  };
  const resolved: Array<{ conditionId: Hex; denominator: bigint; slots: bigint }> = [];
  unique.forEach((conditionId, index) => {
    const denominator = uint(first[index * 2]);
    const slots = uint(first[index * 2 + 1]);
    // A condition nobody prepared has no slots; a binary market has two. More than 256 is impossible by contract.
    if (denominator === null || slots === null || slots === 0n || slots > 256n) out.set(conditionId, null);
    else if (denominator === 0n) out.set(conditionId, { state: "unresolved" });
    else resolved.push({ conditionId, denominator, slots });
  });
  if (resolved.length > 0) {
    const calls = resolved.flatMap(({ conditionId, slots }) =>
      Array.from({ length: Number(slots) }, (_, i) => ({ to: ledger, data: encodeFunctionData({ abi: CTF_ABI, functionName: "payoutNumerators", args: [conditionId, BigInt(i)] }) })),
    );
    const second = await port.callMany(calls, options);
    let cursor = 0;
    for (const { conditionId, denominator, slots } of resolved) {
      const numerators: bigint[] = [];
      let ok = true;
      for (let i = 0; i < Number(slots); i += 1) {
        const value = uint(second[cursor]);
        cursor += 1;
        if (value === null) ok = false;
        else numerators.push(value);
      }
      out.set(conditionId, ok ? payoutsOf(denominator, numerators, slots) : null);
    }
  }
  return out;
}

// getResult(conditionId) on a Polymarket Protocol V2 module, for each 31-byte condition id: [] until resolved.
export async function readModuleResults(port: RpcPort, module: Address, conditionIds: readonly Hex[], options?: RpcRequestOptions): Promise<Map<Hex, readonly bigint[] | null>> {
  const unique = [...new Set(conditionIds.map((id) => id.toLowerCase() as Hex))];
  const out = new Map<Hex, readonly bigint[] | null>();
  if (unique.length === 0) return out;
  const results = await port.callMany(unique.map((conditionId) => ({ to: module, data: encodeFunctionData({ abi: POLYMARKET_MODULE_ABI, functionName: "getResult", args: [conditionId] }) })), options);
  unique.forEach((conditionId, index) => {
    const result = results[index];
    if (result === undefined || !result.ok) {
      out.set(conditionId, null);
      return;
    }
    try {
      out.set(conditionId, decodeFunctionResult({ abi: POLYMARKET_MODULE_ABI, functionName: "getResult", data: result.data }));
    } catch {
      out.set(conditionId, null);
    }
  });
  return out;
}

function ctfResolution(payouts: Payouts | null | undefined, outcomeIndex: number): ResolutionRead {
  if (payouts === null || payouts === undefined) return { state: "unknown", why: "The condition's payout could not be read from Conditional Tokens." };
  if (payouts.state === "unresolved") return { state: "unresolved" };
  const numerator = payouts.numerators[outcomeIndex];
  if (numerator === undefined) return { state: "unknown", why: "The condition has no such outcome." };
  return { state: "resolved", numerator, denominator: payouts.denominator };
}

function moduleResolution(result: readonly bigint[] | null | undefined, outcomeIndex: number, denominator: bigint): ResolutionRead {
  if (result === null || result === undefined) return { state: "unknown", why: "The module's result could not be read." };
  if (result.length === 0) return { state: "unresolved" };
  const numerator = result[outcomeIndex];
  // BaseModule stores exactly two values that sum to RESULT_DENOMINATOR.
  if (result.length !== 2 || numerator === undefined || result.reduce((sum, value) => sum + value, 0n) !== denominator) return { state: "unknown", why: "The module's result is not a two-outcome vector over its denominator." };
  return { state: "resolved", numerator, denominator };
}

// Balances and results for the targets, ledger by ledger. Each ledger and resolution contract is pin-checked first
// (once per guard); a contract that fails is listed in `refused` and its targets keep null balances or an unknown
// result. Throws only when the endpoint cannot be asked at all.
export async function readPositions(
  port: RpcPort,
  guard: PinGuard,
  args: { readonly holder: Address; readonly targets: readonly PositionTarget[] },
  options?: RpcRequestOptions,
): Promise<PositionsResult> {
  if (args.targets.length > MAX_TARGETS) throw new RpcError("invalid_input", "too_many_targets");
  const refused: Extract<PinCheck, { ok: false }>[] = [];
  const passed = new Map<string, boolean>();
  const allowed = async (pin: ContractPin): Promise<boolean> => {
    const key = keyOf(pin.address);
    const known = passed.get(key);
    if (known !== undefined) return known;
    const check = await guard.check(pin, options);
    if (!check.ok) refused.push(check);
    passed.set(key, check.ok);
    return check.ok;
  };

  // Balances, one ledger at a time.
  const balances = new Map<PositionTarget, bigint | null>();
  const byLedger = new Map<string, PositionTarget[]>();
  for (const target of args.targets) {
    const list = byLedger.get(keyOf(target.ledger.address)) ?? [];
    list.push(target);
    byLedger.set(keyOf(target.ledger.address), list);
  }
  for (const targets of byLedger.values()) {
    const ledger = (targets[0] as PositionTarget).ledger;
    if (!(await allowed(ledger))) {
      for (const target of targets) balances.set(target, null);
      continue;
    }
    const values = await readBalances(port, ledger.address, args.holder, targets.map((target) => target.tokenId), options);
    targets.forEach((target, index) => balances.set(target, values[index] ?? null));
  }

  // Results: Conditional Tokens payouts per ledger, module results per module.
  const ctf = new Map<string, { pin: ContractPin; conditions: Hex[] }>();
  const modules = new Map<string, { pin: ContractPin; conditions: Hex[] }>();
  for (const target of args.targets) {
    const source = target.resolution;
    if (source === null) continue;
    const table = source.kind === "ctf" ? ctf : modules;
    const pin = source.kind === "ctf" ? source.ledger : source.module;
    const entry = table.get(keyOf(pin.address)) ?? { pin, conditions: [] };
    entry.conditions.push(source.conditionId);
    table.set(keyOf(pin.address), entry);
  }
  const payouts = new Map<string, Map<Hex, Payouts | null> | null>();
  for (const [key, { pin, conditions }] of ctf) payouts.set(key, (await allowed(pin)) ? await readCtfPayouts(port, pin.address, conditions, options) : null);
  const results = new Map<string, Map<Hex, readonly bigint[] | null> | null>();
  for (const [key, { pin, conditions }] of modules) results.set(key, (await allowed(pin)) ? await readModuleResults(port, pin.address, conditions, options) : null);

  const positions = args.targets.map((target): PositionRead => {
    const source = target.resolution;
    let resolution: ResolutionRead;
    if (source === null) resolution = { state: "unknown", why: "The chain does not say which market this token belongs to." };
    else if (source.kind === "ctf") {
      const table = payouts.get(keyOf(source.ledger.address));
      resolution = table === null || table === undefined ? { state: "unknown", why: "Conditional Tokens failed its pin check; no result was read." } : ctfResolution(table.get(source.conditionId.toLowerCase() as Hex), source.outcomeIndex);
    } else {
      const table = results.get(keyOf(source.module.address));
      resolution = table === null || table === undefined ? { state: "unknown", why: "The module failed its pin check; no result was read." } : moduleResolution(table.get(source.conditionId.toLowerCase() as Hex), source.outcomeIndex, source.denominator);
    }
    return { target, balance: balances.get(target) ?? null, resolution };
  });
  return { positions, refused };
}

// ---- bounded transfer scans --------------------------------------------------------------------------------------------

export interface TransferScanOptions {
  // Blocks per eth_getLogs request (the public RPCs refuse more than 10,000) and how many requests at most.
  readonly windowBlocks: bigint;
  readonly windows: number;
  // The newest block to scan; the caller reads eth_blockNumber once.
  readonly toBlock: bigint;
}

export interface TransferScan {
  readonly tokenIds: readonly bigint[];
  // The range actually scanned, inclusive. When `complete` is false a window failed and the scan stopped there.
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
  readonly complete: boolean;
  readonly requests: number;
}

export const MAX_SCAN_WINDOWS = 12;

// Token ids that moved TO the holder on one ledger (TransferSingle and TransferBatch with topic3 = holder) in the
// newest `windows` x `windowBlocks` blocks, newest window first. Never an open range: each request names both ends.
// An id found here is only a candidate; its balance is read like any other.
export async function scanTransfersTo(port: RpcPort, ledger: ContractPin, holder: Address, scan: TransferScanOptions, options?: RpcRequestOptions): Promise<TransferScan> {
  if (scan.windows < 1 || scan.windows > MAX_SCAN_WINDOWS || scan.windowBlocks < 1n) throw new RpcError("invalid_input", "bad_scan");
  const topic = padHex(getAddress(holder).toLowerCase() as Hex, { size: 32 });
  const ids = new Set<bigint>();
  let to = scan.toBlock;
  let scannedFrom = scan.toBlock + 1n;
  let requests = 0;
  let complete = true;
  for (let i = 0; i < scan.windows && to >= 0n; i += 1) {
    const from = to - scan.windowBlocks + 1n < 0n ? 0n : to - scan.windowBlocks + 1n;
    requests += 1;
    let read;
    try {
      read = await port.getLogs({ address: ledger.address, topics: [[TRANSFER_SINGLE_TOPIC, TRANSFER_BATCH_TOPIC], null, null, topic], fromBlock: from, toBlock: to }, options);
    } catch (error) {
      if (error instanceof RpcError && (error.code === "upstream_error" || error.code === "too_large" || error.code === "invalid_response")) {
        complete = false;
        break;
      }
      throw error;
    }
    if (read.droppedMalformed > 0) complete = false;
    for (const log of read.logs) {
      const rows = decodeTransfers(log, ledger.address);
      if (rows === null) {
        complete = false;
        continue;
      }
      for (const row of rows) if (row.to === holder.toLowerCase()) ids.add(row.id);
    }
    scannedFrom = from;
    to = from - 1n;
  }
  return { tokenIds: [...ids], fromBlock: scannedFrom, toBlock: scan.toBlock, complete, requests };
}

// The pin of a ledger as a resolution source for Conditional Tokens.
export function ctfSource(ledger: ContractPin, conditionId: Hex, outcomeIndex: number): ResolutionSource {
  return { kind: "ctf", ledger, conditionId: conditionId.toLowerCase() as Hex, outcomeIndex };
}

export function moduleSource(module: ContractPin, conditionId: Hex, outcomeIndex: number): ResolutionSource {
  return { kind: "module", module, conditionId: conditionId.toLowerCase() as Hex, outcomeIndex, denominator: POLYMARKET_RESULT_DENOMINATOR };
}

