// Offline derivation of the XO-style Kernel v3.1 account address from an owner EOA.
// Usage: VIEM_ENTRY=<path to viem/_esm/index.js> node derive_kernel.mjs verify <decoded.json>
//        VIEM_ENTRY=... node derive_kernel.mjs addr <ownerAddress> [salt=0]
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { encodeFunctionData, parseAbi, concat, keccak256, getAddress, getCreate2Address, pad, toHex } = viem;
import fs from "node:fs";

export const FACTORY = "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419";
export const IMPL = process.env.KERNEL_IMPL || "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D"; // candidate; confirmed by the match test
export const ECDSA_VALIDATOR = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";
const ZERO = "0x0000000000000000000000000000000000000000";
const initAbi = parseAbi(["function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)"]);

export function buildInitData(owner) {
  const rootValidator = concat(["0x01", ECDSA_VALIDATOR]); // VALIDATION_TYPE_VALIDATOR || validator
  return encodeFunctionData({ abi: initAbi, functionName: "initialize", args: [rootValidator, ZERO, owner, "0x", []] });
}
// Solady LibClone.initCodeHashERC1967(implementation)
export function erc1967InitCodeHash(impl) {
  const code = concat(["0x603d3d8160223d3973", impl, "0x6009",
    "0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076",
    "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3"]);
  return keccak256(code);
}
// KernelFactory.getAddress(data, salt): CREATE2(factory, keccak256(data || salt), initCodeHashERC1967(impl))
export function predict(initData, salt = "0x" + "00".repeat(32), impl = IMPL, factory = FACTORY) {
  const actualSalt = keccak256(concat([initData, salt]));
  return getCreate2Address({ from: factory, salt: actualSalt, bytecodeHash: erc1967InitCodeHash(impl) });
}
export function addressForOwner(owner, salt) { return predict(buildInitData(getAddress(owner)), salt); }

import { pathToFileURL } from "node:url";
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const [,, mode, arg, arg2] = process.argv;
if (!isMain) { /* imported as a library */ }
else if (mode === "verify") {
  const rows = JSON.parse(fs.readFileSync(arg, "utf8")).filter(r => !r.decodeError);
  let ok = 0, initOk = 0;
  for (const r of rows) {
    const rebuilt = buildInitData(r.owner);
    const sameInit = rebuilt.toLowerCase() === r.initDataHex.toLowerCase();
    if (sameInit) initOk++;
    const pred = predict(r.initDataHex, r.salt);
    const pred2 = addressForOwner(r.owner, r.salt);
    const m = pred.toLowerCase() === r.sender.toLowerCase() && pred2.toLowerCase() === r.sender.toLowerCase();
    if (m) ok++;
    else console.log("MISMATCH", r.tx, r.sender, pred, pred2);
  }
  console.log(JSON.stringify({ rows: rows.length, initDataRebuiltIdentical: initOk, addressMatches: ok, implUsed: IMPL, initCodeHash: erc1967InitCodeHash(IMPL) }));
} else if (mode === "addr") {
  const salt = arg2 ? pad(toHex(BigInt(arg2)), { size: 32 }) : "0x" + "00".repeat(32);
  console.log(addressForOwner(arg, salt));
}
