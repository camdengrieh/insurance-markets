// Re-verify, on real mainnet XO fills, the signature construction documented in /guides/smart-accounts:
//   orderHash = EIP-712(Order) under the "XO Market CLOB" domain
//   wrapped   = EIP-712(Kernel(bytes32 hash)) under domain {Kernel, 0.3.1, 3223, maker}
//   sig       = 0x01 || validator(20) || ecdsa65(wrapped)   (or 0x00 || ecdsa65(wrapped))
// and check that ecrecover(wrapped, ecdsa65) equals the owner registered in the ECDSA validator.
// Input: raw/pick.json (written by pick_orders.py). Prints booleans and counts only (no addresses).
// Usage: node verify_onchain_sigs.mjs <abs path to viem dir> <pick.json>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const viemDir = process.argv[2];
const viem = await import(pathToFileURL(viemDir + "/_esm/index.js").href);
const { hashTypedData, recoverAddress, getAddress, hashMessage } = viem;

const picked = JSON.parse(readFileSync(process.argv[3], "utf8"));
const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" }, { name: "maker", type: "address" }, { name: "signer", type: "address" },
    { name: "beneficiary", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" }, { name: "expiration", type: "uint256" }, { name: "nonce", type: "uint128" },
    { name: "identifier", type: "bytes16" }, { name: "metadata", type: "bytes32" }, { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};
const DOMAIN = { name: "XO Market CLOB", version: "1", chainId: 3223, verifyingContract: "0x4bC5E872256D12E6017dfe466E04c867DC761B77" };
const VALIDATOR = "0x845adb2c711129d4f3966735ed98a9f09fc4ce57";

let ok = 0, bad = 0;
const rows = [];
for (const p of picked) {
  const v = p.order;
  const order = {
    salt: BigInt(v[0]), maker: getAddress(v[1]), signer: getAddress(v[2]), beneficiary: getAddress(v[3]),
    tokenId: BigInt(v[4]), makerAmount: BigInt(v[5]), takerAmount: BigInt(v[6]), expiration: BigInt(v[7]),
    nonce: BigInt(v[8]), identifier: v[9], metadata: v[10], side: Number(v[11]), signatureType: Number(v[12]),
  };
  const orderHash = hashTypedData({ domain: DOMAIN, types: ORDER_TYPES, primaryType: "Order", message: order });
  const wrapped = hashTypedData({
    domain: { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: order.maker },
    types: { Kernel: [{ name: "hash", type: "bytes32" }] }, primaryType: "Kernel", message: { hash: orderHash },
  });
  const sig = v[13].toLowerCase();
  let inner, prefixOk;
  if (p.kind === "0x01") { prefixOk = sig.slice(2, 4) === "01" && ("0x" + sig.slice(4, 44)) === VALIDATOR; inner = "0x" + sig.slice(44); }
  else { prefixOk = sig.slice(2, 4) === "00"; inner = "0x" + sig.slice(4); }
  const owners = p.owners.map((o) => o.toLowerCase());
  let rawRec = null, ethRec = null;
  try { rawRec = await recoverAddress({ hash: wrapped, signature: inner }); } catch (e) { rawRec = null; }
  // EIP-191 personal_sign over the 32 raw bytes of the wrapped digest
  try { ethRec = await recoverAddress({ hash: hashMessage({ raw: wrapped }), signature: inner }); } catch (e) { ethRec = null; }
  const rawMatch = rawRec !== null && owners.includes(rawRec.toLowerCase());
  const ethMatch = ethRec !== null && owners.includes(ethRec.toLowerCase());
  const match = rawMatch || ethMatch;
  rows.push({ kind: p.kind, innerBytes: (inner.length - 2) / 2, prefixOk, nonce: String(order.nonce), rawEcdsaMatches: rawMatch, eip191OverWrappedMatches: ethMatch });
  match ? ok++ : bad++;
}
console.log(JSON.stringify(rows));
console.log(`recovered==registered owner: ${ok}/${ok + bad}`);
