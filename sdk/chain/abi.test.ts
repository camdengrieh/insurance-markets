import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { toEventSelector, toFunctionSelector, type AbiEvent, type AbiFunction } from "viem";
import { describe, expect, it } from "vitest";

import { CTF_ABI } from "./ctf.js";
import { EXCHANGE_REGISTRY_ABI } from "./exchange.js";
import { LIMITLESS_EXCHANGE_ABI, XO_EXCHANGE_FILL_ABI } from "./fills.js";
import { POLYMARKET_EXCHANGE_ABI, POLYMARKET_MODULE_ABI } from "./polymarket/abi.js";

// Every ABI fragment the chain readers use, against the verified ABI it was copied from (Sourcify, read 2026-10-22;
// the XO exchange's explorer-verified ABI already in the repository). A fragment typed wrong would change its
// selector or topic, and would then not be found in the verified excerpt.

interface Excerpt {
  readonly chain_id: number;
  readonly address: string;
  readonly contract: string;
  readonly entries: ReadonlyArray<AbiEvent | AbiFunction>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const excerpts = (JSON.parse(readFileSync(join(HERE, "fixtures", "verified-abi-excerpts_2026-10-22.json"), "utf8")) as { contracts: Excerpt[] }).contracts;

function idOf(entry: AbiEvent | AbiFunction): string {
  return entry.type === "event" ? toEventSelector(entry) : toFunctionSelector(entry);
}

function verifiedIds(chainId: number, address: string): Set<string> {
  const excerpt = excerpts.find((entry) => entry.chain_id === chainId && entry.address.toLowerCase() === address.toLowerCase());
  if (excerpt === undefined) throw new Error(`no verified excerpt for ${address}`);
  return new Set(excerpt.entries.map(idOf));
}

function fragmentIds(abi: ReadonlyArray<{ type: string }>): string[] {
  return abi.filter((entry) => entry.type === "event" || entry.type === "function").map((entry) => idOf(entry as AbiEvent | AbiFunction));
}

const cases: ReadonlyArray<[string, ReadonlyArray<{ type: string }>, number, string]> = [
  ["Conditional Tokens (Polygon)", CTF_ABI, 137, "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045"],
  ["Conditional Tokens (Base)", CTF_ABI, 8453, "0xC9c98965297Bc527861c898329Ee280632B76e18"],
  ["Polymarket CTF Exchange", POLYMARKET_EXCHANGE_ABI, 137, "0xE111180000d2663C0091e4f400237545B87B996B"],
  ["Polymarket Neg Risk CTF Exchange", POLYMARKET_EXCHANGE_ABI, 137, "0xe2222d279d744050d28e00520010520000310F59"],
  ["Polymarket Exchange (Protocol V2)", POLYMARKET_EXCHANGE_ABI, 137, "0x641b40ec414a076b9e79E703Fc7BF4EBEC248Bb7"],
  ["Polymarket BinaryModule", POLYMARKET_MODULE_ABI, 137, "0xf6428c0B5fa9361c0708CDdb95468cf54C56e9A2"],
  ["Polymarket NegRiskModule", POLYMARKET_MODULE_ABI, 137, "0x39a5B01a100edF811f2748aa37B1313715Ded70e"],
  ["Limitless CTF Exchange v1", [...LIMITLESS_EXCHANGE_ABI, ...EXCHANGE_REGISTRY_ABI], 8453, "0xa4409D988CA2218d956BeEFD3874100F444f0DC3"],
  ["Limitless CTF Exchange v2", [...LIMITLESS_EXCHANGE_ABI, ...EXCHANGE_REGISTRY_ABI], 8453, "0xF1De958F8641448A5ba78c01f434085385Af096D"],
  ["Limitless CTF Exchange v3", [...LIMITLESS_EXCHANGE_ABI, ...EXCHANGE_REGISTRY_ABI], 8453, "0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5"],
  ["Limitless NegRisk CTF Exchange v3", [...LIMITLESS_EXCHANGE_ABI, ...EXCHANGE_REGISTRY_ABI], 8453, "0xe3E00BA3a9888d1DE4834269f62ac008b4BB5C47"],
  ["XO CTF Exchange implementation", [...XO_EXCHANGE_FILL_ABI, ...EXCHANGE_REGISTRY_ABI], 3223, "0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED"],
];

describe("chain reader ABI fragments match the verified ABIs", () => {
  it.each(cases)("%s", (_name, abi, chainId, address) => {
    const verified = verifiedIds(chainId, address);
    for (const id of fragmentIds(abi)) expect(verified.has(id), id).toBe(true);
  });

  it("calls only view or pure functions", () => {
    for (const abi of [CTF_ABI, POLYMARKET_MODULE_ABI, EXCHANGE_REGISTRY_ABI]) {
      for (const entry of abi as ReadonlyArray<{ type: string; stateMutability?: string }>) {
        if (entry.type === "function") expect(["view", "pure"]).toContain(entry.stateMutability);
      }
    }
  });
});
