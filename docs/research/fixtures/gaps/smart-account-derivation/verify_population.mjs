// For (kernel, owner) pairs taken from the ECDSA validator's OwnerRegistered events, check kernel == CREATE2(factory, impl, initData(owner), salt=0).
// Usage: VIEM_ENTRY=... node verify_population.mjs <pairs.json> [...]   pairs.json = [[kernel, owner, block], ...]
import fs from "node:fs";
const { addressForOwner } = await import("./derive_kernel.mjs");
const viem = await import("file://" + process.env.VIEM_ENTRY);
let total = 0, match = 0; const miss = [];
for (const f of process.argv.slice(2)) {
  for (const [kernel, owner] of JSON.parse(fs.readFileSync(f, "utf8"))) {
    total++;
    const pred = addressForOwner(viem.getAddress(owner), "0x" + "00".repeat(32));
    if (pred.toLowerCase() === kernel.toLowerCase()) match++; else miss.push(kernel);
  }
}
console.log(JSON.stringify({ total, matchWithSalt0: match, notMatching: miss.length, sampleNotMatching: miss.slice(0, 5) }));
