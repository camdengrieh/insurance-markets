// Key-free probe of the deployed Kernel ECDSA validator's signature semantics.
// Builds eth_call payloads (with a storage-slot state override that fakes "owner" for a made-up kernel address S);
// no private key is used or needed: we choose (hash, r, s, v), RECOVER the signer X, and install X as owner of S.
// Whether the validator returns success tells us which message form it checks: raw digest vs EIP-191(personal_sign) hash.
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { keccak256, toHex, recoverAddress, hashMessage, encodeAbiParameters, parseAbiParameters, encodeFunctionData, parseAbi, pad, concat } = viem;
const VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";
const S = "0x00000000000000000000000000000000000a11ce"; // made-up stand-in for a Kernel account (msg.sender)
const H = keccak256(toHex("validator-semantics-probe-v1"));
const r = keccak256(toHex("probe-r")), s = "0x" + "11".repeat(32);
let sig, v;
for (v of ["1b", "1c"]) {
  sig = concat([r, s, "0x" + v]);
  try { await recoverAddress({ hash: H, signature: sig }); break; } catch {}
}
const slotFor = (kernel) => keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [kernel, 0n]));
const ovr = (owner) => ({ [VAL]: { stateDiff: { [slotFor(S)]: pad(owner, { size: 32 }) } } });
const abi = parseAbi([
  "function isValidSignatureWithSender(address sender, bytes32 hash, bytes sig) view returns (bytes4)",
  "function ecdsaValidatorStorage(address) view returns (address)" ]);
const uopAbi = [{ type: "function", name: "validateUserOp", stateMutability: "payable", outputs: [{ type: "uint256" }], inputs: [
  { name: "userOp", type: "tuple", components: [{ name: "sender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
    { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" }, { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" }, { name: "signature", type: "bytes" }] },
  { name: "userOpHash", type: "bytes32" }] }];
const Xraw = await recoverAddress({ hash: H, signature: sig });
const X191 = await recoverAddress({ hash: hashMessage({ raw: H }), signature: sig });
const Xother = "0x000000000000000000000000000000000000dead";
const op = { sender: S, nonce: 0n, initCode: "0x", callData: "0x", accountGasLimits: "0x" + "00".repeat(32), preVerificationGas: 0n, gasFees: "0x" + "00".repeat(32), paymasterAndData: "0x", signature: sig };
const cases = [];
for (const [label, owner] of [["owner=recover(raw digest)", Xraw], ["owner=recover(EIP-191 hash of digest)", X191], ["control: unrelated owner", Xother]]) {
  cases.push({ label: "1271 " + label, from: S, to: VAL, data: encodeFunctionData({ abi, functionName: "isValidSignatureWithSender", args: [S, H, sig] }), override: ovr(owner) });
  cases.push({ label: "userOp " + label, from: S, to: VAL, data: encodeFunctionData({ abi: uopAbi, functionName: "validateUserOp", args: [op, H] }), override: ovr(owner) });
}
cases.push({ label: "readback ecdsaValidatorStorage(S) with owner=Xraw", from: S, to: VAL, data: encodeFunctionData({ abi, functionName: "ecdsaValidatorStorage", args: [S] }), override: ovr(Xraw) });
console.log(JSON.stringify({ H, sig, Xraw, X191, cases }, null, 1));
