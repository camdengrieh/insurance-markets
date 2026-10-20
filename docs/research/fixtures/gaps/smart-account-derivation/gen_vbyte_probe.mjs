// Does the deployed ECDSA validator accept a signature whose recovery byte is 0/1 (as some signers emit) instead of 27/28? Key-free, like gen_validator_probe.mjs.
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { keccak256, toHex, recoverAddress, encodeAbiParameters, parseAbiParameters, encodeFunctionData, parseAbi, pad, concat, slice } = viem;
const VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57";
const S = "0x00000000000000000000000000000000000a11ce";
const H = keccak256(toHex("v-byte-probe-v1"));
const r = keccak256(toHex("probe-r")), s = "0x" + "11".repeat(32);
let sig27;
for (const v of ["1b", "1c"]) { sig27 = concat([r, s, "0x" + v]); try { await recoverAddress({ hash: H, signature: sig27 }); break; } catch {} }
const vb = parseInt(sig27.slice(-2), 16);
const sig01 = concat([r, s, "0x" + (vb - 27).toString(16).padStart(2, "0")]);
const X = await recoverAddress({ hash: H, signature: sig27 });
const slot = keccak256(encodeAbiParameters(parseAbiParameters("address, uint256"), [S, 0n]));
const ovr = { [VAL]: { stateDiff: { [slot]: pad(X, { size: 32 }) } } };
const abi = parseAbi(["function isValidSignatureWithSender(address sender, bytes32 hash, bytes sig) view returns (bytes4)"]);
const mk = (label, sig) => ({ label, from: S, to: VAL, data: encodeFunctionData({ abi, functionName: "isValidSignatureWithSender", args: [S, H, sig] }), override: ovr });
console.log(JSON.stringify({ cases: [mk("sig with v=27/28", sig27), mk("same sig with v=0/1", sig01)] }, null, 1));
