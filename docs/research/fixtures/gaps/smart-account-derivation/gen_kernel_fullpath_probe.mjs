// Key-free end-to-end probe of a real deployed Kernel v3.1 instance (the Anvil-account-0 counterfactual address, which happens to be deployed on Base).
// 1) read the validator's stored owner for that Kernel (no override)  2) full-path isValidSignature with the owner faked via a storage override.
// Nothing is signed: we pick (r,s,v), recover the signer X of the Kernel-wrapped digest, and install X as owner in the override only.
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { keccak256, toHex, recoverAddress, hashMessage, hashTypedData, encodeAbiParameters, parseAbiParameters, encodeFunctionData, parseAbi, pad, concat } = viem;
const K = process.argv[2];                  // Kernel account address (deployed on the chain we call)
const CHAIN = BigInt(process.argv[3]);      // chain id of the chain we call (Base = 8453)
const VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";
const slotFor = (kernel) => keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [kernel, 0n]));
const hashIn = keccak256(toHex("kernel-fullpath-probe-v1"));
const wrapped = hashTypedData({ domain: { name: "Kernel", version: "0.3.1", chainId: Number(CHAIN), verifyingContract: K }, types: { Kernel: [{ name: "hash", type: "bytes32" }] }, primaryType: "Kernel", message: { hash: hashIn } });
const r = keccak256(toHex("fullpath-r")), s = "0x" + "22".repeat(32);
let ecdsa, v;
for (v of ["1b", "1c"]) { ecdsa = concat([r, s, "0x" + v]); try { await recoverAddress({ hash: wrapped, signature: ecdsa }); break; } catch {} }
const Xraw = await recoverAddress({ hash: wrapped, signature: ecdsa });
const X191 = await recoverAddress({ hash: hashMessage({ raw: wrapped }), signature: ecdsa });
const wire = concat(["0x01", VAL, ecdsa]);
const kAbi = parseAbi(["function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)"]);
const vAbi = parseAbi(["function ecdsaValidatorStorage(address) view returns (address)"]);
const ovr = (owner) => ({ [VAL]: { stateDiff: { [slotFor(K)]: pad(owner, { size: 32 }) } } });
const cases = [
  { label: "read validator.ecdsaValidatorStorage(K) (no override)", to: VAL, data: encodeFunctionData({ abi: vAbi, functionName: "ecdsaValidatorStorage", args: [K] }), override: null },
  { label: "K.isValidSignature, owner := recover(raw wrapped digest)", to: K, data: encodeFunctionData({ abi: kAbi, functionName: "isValidSignature", args: [hashIn, wire] }), override: ovr(Xraw) },
  { label: "K.isValidSignature, owner := recover(EIP-191 of wrapped digest)", to: K, data: encodeFunctionData({ abi: kAbi, functionName: "isValidSignature", args: [hashIn, wire] }), override: ovr(X191) },
  { label: "control: unrelated owner", to: K, data: encodeFunctionData({ abi: kAbi, functionName: "isValidSignature", args: [hashIn, wire] }), override: ovr("0x000000000000000000000000000000000000dead") },
  { label: "control: wrong validator prefix (0x01 || other address)", to: K, data: encodeFunctionData({ abi: kAbi, functionName: "isValidSignature", args: [hashIn, concat(["0x01", "0x000000000000000000000000000000000000dead", ecdsa])] }), override: ovr(Xraw) },
];
console.log(JSON.stringify({ cases }, null, 1));
