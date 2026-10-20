// @vitest-environment node
import { describe, expect, it } from "vitest";

import { getAddress } from "viem";

import { deriveAccount } from "@shared/xo/account/derive";

import { BINDING_PRIVACY_NOTICE, BINDINGS_STORE, BindingsStore, MAX_BINDINGS, createIdbRecordStore, createMemoryRecordStore, looksLikeSecret, openStores, suggestedVenues, type IdbLike, type RecordStore } from "./bindings";

const ANVIL_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ANVIL_0_ACCOUNT = "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d";
const ANVIL_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function newStore(): BindingsStore {
  return new BindingsStore(createMemoryRecordStore());
}

async function addOwner(store: BindingsStore) {
  const result = await store.add({ address: ANVIL_0, kind: "eoa", label: "PayBox" });
  if (!result.ok) throw new Error(`fixture failed: ${result.message}`);
  return result.binding;
}

describe("adding a pasted address", () => {
  it("validates, checksums, labels and stores it with no venue selected (M2-9)", async () => {
    const store = newStore();
    const result = await store.add({ address: ANVIL_0.toLowerCase(), kind: "eoa", label: "  My PayBox  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding).toEqual({
      id: `eoa:evm:${ANVIL_0.toLowerCase()}`,
      label: "My PayBox",
      kind: "eoa",
      chain: "evm",
      address: ANVIL_0,
      status: "derived",
      venues: [],
      source: "pasted",
    });
    expect((await store.list()).map((binding) => binding.address)).toEqual([ANVIL_0]);
    expect(BINDING_PRIVACY_NOTICE).toContain("sees your IP address");
  });

  it("refuses a bad address with the reason and stores nothing (M2-1)", async () => {
    const store = newStore();
    for (const address of ["", "vitalik.eth", `${ANVIL_0.slice(0, -1)}7`, `${ANVIL_0}​`, "0x0000000000000000000000000000000000000000"]) {
      const result = await store.add({ address, kind: "eoa" });
      expect(result, address).toMatchObject({ ok: false, error: "invalid_address" });
    }
    expect(await store.list()).toEqual([]);
  });

  it("refuses a duplicate", async () => {
    const store = newStore();
    await addOwner(store);
    expect(await store.add({ address: ANVIL_0.toLowerCase(), kind: "eoa" })).toMatchObject({ ok: false, error: "duplicate" });
    expect(await store.list()).toHaveLength(1);
  });

  it("asks for confirmation on a look-alike of a saved address and saves only after it", async () => {
    const store = newStore();
    await addOwner(store);
    const lookalike = `0x${ANVIL_0.slice(2, 6)}${"1".repeat(32)}${ANVIL_0.slice(-4)}`.toLowerCase();
    const refused = await store.add({ address: lookalike, kind: "venue_proxy" });
    expect(refused).toMatchObject({ ok: false, error: "confirmation_required" });
    expect(!refused.ok && refused.warnings?.some((warning) => warning.code === "lookalike")).toBe(true);
    expect(await store.list()).toHaveLength(1);
    const confirmed = await store.add({ address: lookalike, kind: "venue_proxy", confirm: true });
    expect(confirmed.ok).toBe(true);
    expect(await store.list()).toHaveLength(2);
  });

  it("stores a Solana address and never an EVM address as one", async () => {
    const store = newStore();
    const solana = await store.add({ address: TOKEN_PROGRAM, kind: "solana", label: "Pascal" });
    expect(solana).toMatchObject({ ok: true, binding: { kind: "solana", chain: "solana", address: TOKEN_PROGRAM } });
    expect(await store.add({ address: ANVIL_0, kind: "solana" })).toMatchObject({ ok: false, error: "invalid_address" });
    expect(await store.add({ address: TOKEN_PROGRAM, kind: "eoa" })).toMatchObject({ ok: false, error: "invalid_address" });
  });

  it("keeps hostile label text as inert plain text and bounded", async () => {
    const store = newStore();
    const result = await store.add({ address: ANVIL_0, kind: "eoa", label: `<img src=x onerror=alert(1)>‮${"x".repeat(200)}` });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binding.label.length).toBeLessThanOrEqual(48);
    expect(result.binding.label).not.toContain("‮");
    const blank = await store.add({ address: ANVIL_1, kind: "eoa", label: "​​" });
    expect(blank.ok && blank.binding.label).toBe("PayBox address");
  });

  it("refuses an unknown venue and too many bindings", async () => {
    const store = newStore();
    expect(await store.add({ address: ANVIL_0, kind: "eoa", venues: ["nonsense" as never] })).toMatchObject({ ok: false, error: "unknown_venue" });
    const records = createMemoryRecordStore();
    for (let index = 0; index < MAX_BINDINGS; index += 1) {
      const address = `0x${index.toString(16).padStart(40, "0")}`;
      await records.put({ id: `eoa:evm:${address}`, label: "x", kind: "eoa", chain: "evm", address: `0x${(index + 1).toString(16).padStart(40, "0")}`, status: "derived", venues: [], source: "pasted" });
    }
    expect(await new BindingsStore(records).add({ address: ANVIL_0, kind: "eoa" })).toMatchObject({ ok: false, error: "too_many" });
  });
});

describe("derived Kernel accounts", () => {
  it("derives one binding per chain from the owner, the same address each time (M2-2, M2-8)", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    const results = await store.addDerivedKernel(owner.id);
    expect(results.every((result) => result.ok)).toBe(true);
    const kernels = (await store.list()).filter((binding) => binding.kind === "kernel");
    expect(kernels).toHaveLength(10);
    expect(new Set(kernels.map((binding) => binding.address))).toEqual(new Set([ANVIL_0_ACCOUNT]));
    expect(new Set(kernels.map((binding) => binding.chain)).size).toBe(10);
    for (const kernel of kernels) {
      expect(kernel.derivedFrom).toEqual({ bindingId: owner.id, method: "kernel_v3_1_create2" });
      expect(kernel.status).toBe("derived");
      expect(kernel.source).toBe("derived");
    }
    expect(kernels.find((binding) => binding.chain === "eip155:3223")?.venues).toEqual(["xo"]);
    expect(kernels.find((binding) => binding.chain === "eip155:8453")?.venues).toEqual([]);
  });

  it("derives only for requested, known chains and only from an EOA binding", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    const results = await store.addDerivedKernel(owner.id, [8453, 31337]);
    expect(results[0]).toMatchObject({ ok: true });
    expect(results[1]).toMatchObject({ ok: false, error: "unknown_chain" });
    expect(await store.addDerivedKernel("eoa:evm:0xdead")).toEqual([expect.objectContaining({ ok: false, error: "unknown_binding" })]);
    const proxy = await store.add({ address: ANVIL_1, kind: "venue_proxy" });
    if (!proxy.ok) throw new Error("fixture");
    expect(await store.addDerivedKernel(proxy.binding.id)).toEqual([expect.objectContaining({ ok: false, error: "wrong_kind" })]);
  });

  it("is idempotent", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    await store.addDerivedKernel(owner.id, [3223]);
    await store.addDerivedKernel(owner.id, [3223]);
    expect((await store.list()).filter((binding) => binding.kind === "kernel")).toHaveLength(1);
  });
});

describe("editing", () => {
  it("selects venues per binding, rejects unknown ones, updates status and label, and removes", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    expect(await store.setVenues(owner.id, ["limitless", "trueo", "limitless"])).toMatchObject({ ok: true, binding: { venues: ["limitless", "trueo"] } });
    expect(await store.setVenues(owner.id, ["limitless", "nonsense"])).toMatchObject({ ok: false, error: "unknown_venue" });
    expect((await store.list())[0]?.venues).toEqual(["limitless", "trueo"]);
    expect(await store.setStatus(owner.id, "rpc-unreachable")).toMatchObject({ ok: true, binding: { status: "rpc-unreachable" } });
    expect(await store.rename(owner.id, "Main")).toMatchObject({ ok: true, binding: { label: "Main" } });
    expect(await store.rename(owner.id, "​")).toMatchObject({ ok: true, binding: { label: "Main" } });
    expect(await store.setVenues("missing", [])).toMatchObject({ ok: false, error: "unknown_binding" });
    await store.remove(owner.id);
    expect(await store.list()).toEqual([]);
  });

  it("suggests venues without applying them", () => {
    expect(suggestedVenues("kernel")).toEqual(["xo"]);
    expect(suggestedVenues("venue_account")).toEqual([]);
  });

  it("wipes everything on clear", async () => {
    const store = newStore();
    await addOwner(store);
    await store.clear();
    expect(await store.list()).toEqual([]);
  });

  it("skips stored records that no longer pass the schema", async () => {
    const records = createMemoryRecordStore();
    await records.put({ id: "junk", anything: 1 });
    await records.put({ id: "eoa:evm:0x1", label: "x", kind: "eoa", chain: "evm", address: ANVIL_0, status: "derived", venues: ["nonsense"], source: "pasted" });
    expect(await new BindingsStore(records).list()).toEqual([]);
  });
});

describe("export and import (round trip contains no keys)", () => {
  it("round-trips and the file holds only addresses and labels", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    await store.addDerivedKernel(owner.id, [3223, 8453]);
    await store.setVenues(owner.id, ["trueo"]);
    await store.add({ address: TOKEN_PROGRAM, kind: "solana", label: "Pascal" });
    const text = await store.exportJson();
    expect(looksLikeSecret(text)).toBe(false);
    expect(JSON.parse(text)).toMatchObject({ format: "xo-cockpit-bindings", version: 1 });

    // The file is never trusted for the venue selection: an import selects no venue (M2-9).
    const other = newStore();
    expect(await other.importJson(text)).toEqual({ ok: true, imported: 4, skipped: 0 });
    const original = await store.list();
    expect(await other.list()).toEqual(original.map((binding) => ({ ...binding, venues: [] })));
    expect((await other.list()).every((binding) => binding.status === "derived")).toBe(true);
  });

  it("refuses anything that looks like a secret before reading it", async () => {
    const store = newStore();
    const key = `0x${"ab".repeat(32)}`;
    for (const text of [
      JSON.stringify({ format: "xo-cockpit-bindings", version: 1, bindings: [], note: key }),
      `{"format":"xo-cockpit-bindings","version":1,"bindings":[],"mnemonic":"x"}`,
      `{"seed phrase": "abandon abandon"}`,
      `{"private_key": "x"}`,
      `xprv${"9".repeat(40)}`,
    ]) {
      expect(await store.importJson(text), text).toMatchObject({ ok: false, error: "import_rejected" });
    }
    expect(await store.list()).toEqual([]);
    expect(looksLikeSecret(key)).toBe(true);
    // A 40-hex address is not a secret.
    expect(looksLikeSecret(ANVIL_0)).toBe(false);
  });

  it("refuses a malformed, oversized, extended or tampered file, and imports nothing from it", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    await store.addDerivedKernel(owner.id, [3223]);
    const good = JSON.parse(await store.exportJson()) as { bindings: Array<Record<string, unknown>> };
    const attempts: Array<[string, unknown]> = [
      ["not json", "{"],
      ["empty", ""],
      ["wrong format", { format: "other", version: 1, bindings: [] }],
      ["wrong version", { format: "xo-cockpit-bindings", version: 2, bindings: [] }],
      ["extra field in file", { format: "xo-cockpit-bindings", version: 1, bindings: [], extra: true }],
      ["extra field in record", { format: "xo-cockpit-bindings", version: 1, bindings: [{ ...good.bindings[0], extra: 1 }] }],
      ["bad address", { format: "xo-cockpit-bindings", version: 1, bindings: [{ ...good.bindings[0], address: "0x1234" }] }],
      ["lowercase address", { format: "xo-cockpit-bindings", version: 1, bindings: [{ ...good.bindings[0], address: ANVIL_0.toLowerCase() }] }],
      ["unknown venue", { format: "xo-cockpit-bindings", version: 1, bindings: [{ ...good.bindings[0], venues: ["nonsense"] }] }],
      ["unknown status", { format: "xo-cockpit-bindings", version: 1, bindings: [{ ...good.bindings[0], status: "trusted" }] }],
    ];
    for (const [name, content] of attempts) {
      const text = typeof content === "string" ? content : JSON.stringify(content);
      const target = newStore();
      expect(await target.importJson(text), name).toMatchObject({ ok: false, error: "import_rejected" });
      expect(await target.list(), name).toEqual([]);
    }
    expect(await newStore().importJson(" ".repeat(300 * 1024))).toMatchObject({ ok: false, error: "import_rejected" });
  });

  it("refuses a derived account that does not match its owner, or has no owner", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    await store.addDerivedKernel(owner.id, [3223]);
    const good = JSON.parse(await store.exportJson()) as { bindings: Array<Record<string, unknown>> };
    const kernel = good.bindings.find((binding) => binding.kind === "kernel");
    const ownerRecord = good.bindings.find((binding) => binding.kind === "eoa");
    const forged = { ...kernel, address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" };
    const withOwner = (record: unknown) => JSON.stringify({ format: "xo-cockpit-bindings", version: 1, bindings: [ownerRecord, record] });
    expect(await newStore().importJson(withOwner(forged))).toMatchObject({ ok: false, error: "import_rejected" });
    expect(await newStore().importJson(withOwner(kernel))).toMatchObject({ ok: true, imported: 2 });
    expect(await newStore().importJson(JSON.stringify({ format: "xo-cockpit-bindings", version: 1, bindings: [kernel] }))).toMatchObject({ ok: false, error: "import_rejected" });
    expect(deriveAccount(ANVIL_0)).toBe(ANVIL_0_ACCOUNT);
  });

  it("an owner already in the store is enough for an imported derived account", async () => {
    const source = newStore();
    const owner = await addOwner(source);
    await source.addDerivedKernel(owner.id, [3223]);
    const kernelOnly = JSON.parse(await source.exportJson()) as { bindings: Array<Record<string, unknown>> };
    const target = newStore();
    await addOwner(target);
    const text = JSON.stringify({ format: "xo-cockpit-bindings", version: 1, bindings: kernelOnly.bindings.filter((binding) => binding.kind === "kernel") });
    expect(await target.importJson(text)).toEqual({ ok: true, imported: 1, skipped: 0 });
  });
});

// FS-1: an import must not be a way around the guards add() enforces.
describe("import is held to the same rules as a pasted address", () => {
  const file = (bindings: unknown[]) => JSON.stringify({ format: "xo-cockpit-bindings", version: 1, bindings });
  const record = (overrides: Record<string, unknown> = {}) => ({
    id: `eoa:evm:${ANVIL_1.toLowerCase()}`,
    label: "Friend",
    kind: "eoa",
    chain: "evm",
    address: ANVIL_1,
    status: "derived",
    venues: [],
    source: "pasted",
    ...overrides,
  });

  it("refuses an id that is not the id of its own kind, chain and address", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    const before = await store.list();
    // Same id as the saved PayBox address, different valid checksummed address.
    expect(await store.importJson(file([record({ id: owner.id })]))).toMatchObject({ ok: false, error: "import_rejected" });
    expect(await store.list()).toEqual(before);
    expect(await newStore().importJson(file([record({ id: "eoa:evm:anything-i-like" })]))).toMatchObject({ ok: false, error: "import_rejected" });
  });

  it("refuses a look-alike of a saved address, as add() does", async () => {
    const store = newStore();
    const owner = await addOwner(store);
    // Same first and last four hex digits as ANVIL_0, different middle.
    const lookalike = getAddress(`0x${ANVIL_0.slice(2, 6)}${"1".repeat(32)}${ANVIL_0.slice(-4)}`.toLowerCase());
    const pasted = await store.add({ address: lookalike, kind: "eoa" });
    expect(pasted).toMatchObject({ ok: false, error: "confirmation_required" });
    const forged = record({ id: `eoa:evm:${lookalike.toLowerCase()}`, address: lookalike, label: "mine", source: "derived", status: "trading-enabled" });
    expect(await store.importJson(file([forged]))).toMatchObject({ ok: false, error: "import_rejected" });
    expect((await store.list()).map((binding) => binding.id)).toEqual([owner.id]);
  });

  it("refuses a burn address and an address already saved under a different entry", async () => {
    const burn = "0x000000000000000000000000000000000000dEaD";
    const burnRecord = record({ id: `eoa:evm:${burn.toLowerCase()}`, address: burn });
    expect(await newStore().importJson(file([burnRecord]))).toMatchObject({ ok: false, error: "import_rejected" });
    const store = newStore();
    await store.add({ address: ANVIL_1, kind: "venue_proxy" });
    expect(await store.importJson(file([record()]))).toMatchObject({ ok: false, error: "import_rejected" });
  });

  it("does not trust the file's source, status, venues, derivation claim or label", async () => {
    const store = newStore();
    const forged = record({ source: "derived", status: "trading-enabled", venues: ["polymarket", "limitless"], label: "<img src=x> Mine\u202e", derivedFrom: { bindingId: "x", method: "venue_profile_lookup" } });
    expect(await store.importJson(file([forged]))).toEqual({ ok: true, imported: 1, skipped: 0 });
    const [saved] = await store.list();
    expect(saved).toMatchObject({ source: "pasted", status: "derived", venues: [] });
    expect(saved?.derivedFrom).toBeUndefined();
    expect(saved?.label).not.toContain("\u202e");
  });

  it("leaves an identical saved address untouched instead of replacing it", async () => {
    const store = newStore();
    const added = await store.add({ address: ANVIL_1, kind: "eoa", label: "Mine", venues: ["trueo"] });
    if (!added.ok) throw new Error("fixture");
    expect(await store.importJson(file([record({ label: "Renamed", venues: [] })]))).toEqual({ ok: true, imported: 0, skipped: 1 });
    expect(await store.list()).toEqual([added.binding]);
  });
});

describe("storage backends", () => {
  it("memory store clones what it keeps", async () => {
    const records = createMemoryRecordStore();
    const record = { id: "a", nested: { n: 1 } };
    await records.put(record);
    record.nested.n = 2;
    expect(await records.getAll()).toEqual([{ id: "a", nested: { n: 1 } }]);
    expect(records.persistence).toBe("memory");
  });

  it("the IndexedDB adapter talks to one named store", async () => {
    const calls: string[] = [];
    const data = new Map<string, unknown>();
    const db: IdbLike = {
      getAll: async (store) => {
        calls.push(`getAll ${store}`);
        return [...data.values()];
      },
      put: async (store, value) => {
        calls.push(`put ${store}`);
        data.set((value as { id: string }).id, value);
        return undefined;
      },
      delete: async (store, key) => {
        calls.push(`delete ${store} ${key}`);
        data.delete(key);
      },
      clear: async (store) => {
        calls.push(`clear ${store}`);
        data.clear();
      },
    };
    const records: RecordStore = createIdbRecordStore(db, BINDINGS_STORE);
    expect(records.persistence).toBe("indexeddb");
    const store = new BindingsStore(records);
    expect(store.persistence).toBe("indexeddb");
    await addOwner(store);
    await store.remove(`eoa:evm:${ANVIL_0.toLowerCase()}`);
    await store.clear();
    expect(calls).toContain("put bindings");
    expect(calls).toContain(`delete bindings eoa:evm:${ANVIL_0.toLowerCase()}`);
    expect(calls).toContain("clear bindings");
    expect(calls.every((call) => call.includes("bindings"))).toBe(true);
  });

  it("falls back to memory when IndexedDB is not available (the page renders without it)", async () => {
    const opened = await openStores();
    expect(opened.persistence).toBe("memory");
    expect(opened.bindings.persistence).toBe("memory");
    expect(opened.settings.persistence).toBe("memory");
    const store = new BindingsStore(opened.bindings);
    expect((await addOwner(store)).address).toBe(ANVIL_0);
  });
});
