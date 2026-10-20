// Emit eth_call payloads for KernelFactory.getAddress(bytes data, bytes32 salt).
// Usage: VIEM_ENTRY=... node make_getaddress_calls.mjs <decoded.json> <nObserved> [<extraOwner>:<label> ...]
import fs from "node:fs";
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { encodeFunctionData, parseAbi, getAddress } = viem;
const { buildInitData, FACTORY, addressForOwner } = await import("./derive_kernel.mjs");
const abi = parseAbi(["function getAddress(bytes data, bytes32 salt) view returns (address)"]);
const rows = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).filter(r => !r.decodeError);
const n = Number(process.argv[3]);
const step = Math.max(1, Math.floor(rows.length / n));
const items = [];
for (const r of rows.filter((_, i) => i % step === 0).slice(0, n))
  items.push({ label: "observed", owner: r.owner, account: r.sender, tx: r.tx, salt: r.salt });
for (const x of process.argv.slice(4)) { const [o, l] = x.split(":"); items.push({ label: l, owner: getAddress(o), account: null, tx: null, salt: "0x" + "00".repeat(32) }); }
for (const it of items) {
  it.local = addressForOwner(it.owner, it.salt);
  it.call = { to: FACTORY, data: encodeFunctionData({ abi, functionName: "getAddress", args: [buildInitData(it.owner), it.salt] }) };
}
console.log(JSON.stringify(items, null, 1));
