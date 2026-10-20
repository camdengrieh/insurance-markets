// For deployment txs: recompute the EntryPoint v0.7 userOpHash of each deploying UserOp and recover the 65-byte signature
// both as a raw-digest ECDSA and as an EIP-191 (personal_sign) ECDSA; compare with the owner decoded from initCode. Read-only.
// Usage: VIEM_ENTRY=... node verify_userop_sigs.mjs <tx.json> ...
import fs from "node:fs";
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { decodeFunctionData, encodeAbiParameters, parseAbiParameters, keccak256, recoverAddress, hashMessage, slice, size, getAddress } = viem;
const EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032", CHAIN = 3223n;
const handleOpsAbi = [{ type: "function", name: "handleOps", stateMutability: "nonpayable", inputs: [
  { name: "ops", type: "tuple[]", components: [{ name: "sender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" }, { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" }, { name: "signature", type: "bytes" }] },
  { name: "beneficiary", type: "address" }], outputs: [] }];
const initAbi = viem.parseAbi(["function createAccount(bytes data, bytes32 salt)", "function initialize(bytes21,address,bytes,bytes,bytes[])"]);
const rows = [];
for (const f of process.argv.slice(2)) {
  const tx = JSON.parse(fs.readFileSync(f, "utf8"));
  const ops = decodeFunctionData({ abi: handleOpsAbi, data: tx.raw_input }).args[0];
  for (const op of ops) {
    if (size(op.initCode) === 0) continue;
    let owner = null;
    try {
      const ca = decodeFunctionData({ abi: initAbi, data: slice(op.initCode, 20) });
      owner = getAddress(decodeFunctionData({ abi: initAbi, data: ca.args[0] }).args[2]);
    } catch { continue; }
    const inner = keccak256(encodeAbiParameters(parseAbiParameters("address,uint256,bytes32,bytes32,bytes32,uint256,bytes32,bytes32"),
      [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData), op.accountGasLimits, op.preVerificationGas, op.gasFees, keccak256(op.paymasterAndData)]));
    const userOpHash = keccak256(encodeAbiParameters(parseAbiParameters("bytes32,address,uint256"), [inner, EP, CHAIN]));
    const raw = await recoverAddress({ hash: userOpHash, signature: op.signature }).catch(() => null);
    const e191 = await recoverAddress({ hash: hashMessage({ raw: userOpHash }), signature: op.signature }).catch(() => null);
    rows.push({ tx: tx.hash, rawEqOwner: raw && raw.toLowerCase() === owner.toLowerCase(), eip191EqOwner: e191 && e191.toLowerCase() === owner.toLowerCase() });
  }
}
const c = (k) => rows.filter(r => r[k]).length;
console.log(JSON.stringify({ deployingOps: rows.length, signedAsRawDigest: c("rawEqOwner"), signedAsEip191: c("eip191EqOwner"), neither: rows.filter(r => !r.rawEqOwner && !r.eip191EqOwner).length }));
