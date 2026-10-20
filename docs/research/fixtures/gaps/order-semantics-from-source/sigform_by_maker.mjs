// For every on-chain order in raw/all_orders.json, recompute the Kernel-wrapped digest and recover the signer under
// (a) raw ECDSA over the wrapped digest and (b) EIP-191 personal_sign over the wrapped digest bytes.
// Per maker, the true form is the one whose recovered address is identical across that maker's orders.
// Prints only aggregate counts (no addresses).   Usage: node sigform_by_maker.mjs <viem dir> <all_orders.json>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const viem = await import(pathToFileURL(process.argv[2] + "/_esm/index.js").href);
const { hashTypedData, recoverAddress, getAddress, hashMessage } = viem;
const all = JSON.parse(readFileSync(process.argv[3], "utf8"));
const ORDER_TYPES = { Order: [
  { name: "salt", type: "uint256" }, { name: "maker", type: "address" }, { name: "signer", type: "address" },
  { name: "beneficiary", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "makerAmount", type: "uint256" },
  { name: "takerAmount", type: "uint256" }, { name: "expiration", type: "uint256" }, { name: "nonce", type: "uint128" },
  { name: "identifier", type: "bytes16" }, { name: "metadata", type: "bytes32" }, { name: "side", type: "uint8" },
  { name: "signatureType", type: "uint8" } ] };
const DOMAIN = { name: "XO Market CLOB", version: "1", chainId: 3223, verifyingContract: "0x4bC5E872256D12E6017dfe466E04c867DC761B77" };
const byMaker = new Map();
for (const { order: v } of all) {
  const sig = v[13].toLowerCase();
  const nbytes = (sig.length - 2) / 2;
  let mode, inner;
  if (nbytes === 86 && sig.slice(2, 4) === "01") { mode = "0x01"; inner = "0x" + sig.slice(44); }
  else if (nbytes === 66 && sig.slice(2, 4) === "00") { mode = "0x00"; inner = "0x" + sig.slice(4); }
  else continue;
  const order = { salt: BigInt(v[0]), maker: getAddress(v[1]), signer: getAddress(v[2]), beneficiary: getAddress(v[3]), tokenId: BigInt(v[4]),
    makerAmount: BigInt(v[5]), takerAmount: BigInt(v[6]), expiration: BigInt(v[7]), nonce: BigInt(v[8]), identifier: v[9], metadata: v[10],
    side: Number(v[11]), signatureType: Number(v[12]) };
  const oh = hashTypedData({ domain: DOMAIN, types: ORDER_TYPES, primaryType: "Order", message: order });
  const wrapped = hashTypedData({ domain: { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: order.maker },
    types: { Kernel: [{ name: "hash", type: "bytes32" }] }, primaryType: "Kernel", message: { hash: oh } });
  let raw = null, eth = null;
  try { raw = (await recoverAddress({ hash: wrapped, signature: inner })).toLowerCase(); } catch {}
  try { eth = (await recoverAddress({ hash: hashMessage({ raw: wrapped }), signature: inner })).toLowerCase(); } catch {}
  const k = order.maker.toLowerCase();
  if (!byMaker.has(k)) byMaker.set(k, { mode, raws: new Set(), eths: new Set(), n: 0 });
  const e = byMaker.get(k); e.n++; if (raw) e.raws.add(raw); if (eth) e.eths.add(eth);
}
const tally = {};
for (const [, e] of byMaker) {
  let form;
  if (e.n < 2) form = "single-order(ambiguous)";
  else if (e.raws.size === 1 && e.eths.size !== 1) form = "raw-ecdsa-over-wrapped";
  else if (e.eths.size === 1 && e.raws.size !== 1) form = "eip191-over-wrapped";
  else form = "unclassified";
  if (form === "unclassified") console.log("unclassified maker detail:", JSON.stringify({ n: e.n, raws: e.raws.size, eths: e.eths.size }));
  const key = `${e.mode}:${form}`;
  tally[key] = (tally[key] || 0) + 1;
}
console.log(JSON.stringify({ makersTotal: byMaker.size, tally }, null, 1));
