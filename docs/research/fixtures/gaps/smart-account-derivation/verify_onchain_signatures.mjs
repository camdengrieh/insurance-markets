// For real on-chain matchOrders txs: recompute each order's hash + Kernel wrap and recover the ECDSA signer from the 86-byte wire signature.
// Read-only: only recovers addresses, signs nothing.
// Usage: VIEM_ENTRY=... node verify_onchain_signatures.mjs <abi.json> <decoded.json> <tx.json> [<tx.json> ...]
import fs from "node:fs";
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { decodeFunctionData, hashTypedData, recoverAddress, hashMessage, slice, size, getAddress } = viem;
const abi = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const deployed = JSON.parse(fs.readFileSync(process.argv[3], "utf8")).filter(r => !r.decodeError);
const ownerOf = Object.fromEntries(deployed.map(r => [r.sender.toLowerCase(), r.owner]));
const EXCHANGE = "0x4bC5E872256D12E6017dfe466E04c867DC761B77";
const orderTypes = { Order: [
  { name: "salt", type: "uint256" }, { name: "maker", type: "address" }, { name: "signer", type: "address" }, { name: "beneficiary", type: "address" },
  { name: "tokenId", type: "uint256" }, { name: "makerAmount", type: "uint256" }, { name: "takerAmount", type: "uint256" }, { name: "expiration", type: "uint256" },
  { name: "nonce", type: "uint128" }, { name: "identifier", type: "bytes16" }, { name: "metadata", type: "bytes32" }, { name: "side", type: "uint8" }, { name: "signatureType", type: "uint8" } ] };
const rows = [];
for (const f of process.argv.slice(4)) {
  const tx = JSON.parse(fs.readFileSync(f, "utf8"));
  let dec;
  try { dec = decodeFunctionData({ abi, data: tx.raw_input }); }
  catch (e) { console.error("skip (selector not in ABI):", tx.hash, tx.raw_input.slice(0, 10)); continue; }
  const orders = [];
  for (const a of dec.args) {
    if (a && typeof a === "object" && !Array.isArray(a) && "maker" in a) orders.push(a);
    else if (Array.isArray(a) && a.length && typeof a[0] === "object" && "maker" in a[0]) orders.push(...a);
  }
  for (const o of orders) {
    const orderHash = hashTypedData({ domain: { name: "XO Market CLOB", version: "1", chainId: 3223, verifyingContract: EXCHANGE }, types: orderTypes, primaryType: "Order",
      message: { salt: o.salt, maker: o.maker, signer: o.signer, beneficiary: o.beneficiary, tokenId: o.tokenId, makerAmount: o.makerAmount, takerAmount: o.takerAmount,
        expiration: o.expiration, nonce: o.nonce, identifier: o.identifier, metadata: o.metadata, side: o.side, signatureType: o.signatureType } });
    const wrapped = hashTypedData({ domain: { name: "Kernel", version: "0.3.1", chainId: 3223, verifyingContract: o.maker }, types: { Kernel: [{ name: "hash", type: "bytes32" }] },
      primaryType: "Kernel", message: { hash: orderHash } });
    const sig = o.signature;
    const row = { tx: tx.hash, maker: o.maker, signatureType: o.signatureType, sigLen: size(sig), sigMode: slice(sig, 0, 1), sigValidator: size(sig) === 86 ? getAddress(slice(sig, 1, 21)) : null,
      nonce: o.nonce.toString(), expiration: o.expiration.toString() };
    try {
      // The deployed ECDSA validator accepts either (a) ECDSA over the digest itself or (b) ECDSA over its EIP-191 personal_sign hash.
      row.recoveredRaw = await recoverAddress({ hash: wrapped, signature: slice(sig, 21) });
      row.recoveredEip191 = await recoverAddress({ hash: hashMessage({ raw: wrapped }), signature: slice(sig, 21) });
      row.makerKnownInSample = Boolean(ownerOf[o.maker.toLowerCase()]);
      row.expectedOwner = ownerOf[o.maker.toLowerCase()] ?? null;
      const eq = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();
      row.rawEqualsOwner = eq(row.expectedOwner, row.recoveredRaw);
      row.eip191EqualsOwner = eq(row.expectedOwner, row.recoveredEip191);
    } catch (e) { row.err = String(e.message).slice(0, 100); }
    rows.push(row);
  }
}
console.log(JSON.stringify(rows, null, 1));
