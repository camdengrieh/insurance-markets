// Decode ERC-4337 v0.7 handleOps calldata, extract initCode deployments, decode Kernel v3.x initialize()
// Usage: VIEM_ENTRY=<path to viem/_esm/index.js> node decode_deploy.mjs <tx-json> [<tx-json> ...]
// Each tx-json is a Blockscout /api/v2/transactions/<hash> response (we only use .raw_input and .hash).
import fs from "node:fs";
const viem = await import("file://" + process.env.VIEM_ENTRY);
const { decodeFunctionData, parseAbi, parseAbiParameters, decodeAbiParameters, slice, size, getAddress, keccak256, toHex } = viem;

const handleOpsAbi = [{
  type: "function", name: "handleOps", stateMutability: "nonpayable",
  inputs: [
    { name: "ops", type: "tuple[]", components: [
      { name: "sender", type: "address" }, { name: "nonce", type: "uint256" },
      { name: "initCode", type: "bytes" }, { name: "callData", type: "bytes" },
      { name: "accountGasLimits", type: "bytes32" }, { name: "preVerificationGas", type: "uint256" },
      { name: "gasFees", type: "bytes32" }, { name: "paymasterAndData", type: "bytes" },
      { name: "signature", type: "bytes" } ] },
    { name: "beneficiary", type: "address" } ],
  outputs: [] }];

const factoryAbi = parseAbi(["function createAccount(bytes data, bytes32 salt)"]);
// Kernel v3.1 initialize: (bytes21 rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)
const initAbi = parseAbi(["function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)"]);
const initAbiV30 = parseAbi(["function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData)"]);

// Decode ERC-7579 execute(bytes32 mode, bytes executionCalldata) from the deploying UserOp's callData
const execAbi = parseAbi(["function execute(bytes32 execMode, bytes executionCalldata)"]);
const batchParams = parseAbiParameters("(address target, uint256 value, bytes callData)[]");
function decodeInner(callData) {
  const res = { callDataLen: size(callData), selector: size(callData) >= 4 ? slice(callData, 0, 4) : null };
  try {
    const d = decodeFunctionData({ abi: execAbi, data: callData });
    const mode = d.args[0]; const ec = d.args[1];
    res.execMode = mode.slice(0, 4);               // 0x00 single, 0x01 batch (first byte)
    if (mode.slice(0, 4) === "0x01") {
      const [calls] = decodeAbiParameters(batchParams, ec);
      res.inner = calls.map(c => ({ target: getAddress(c.target), value: c.value.toString(), sel: size(c.callData) >= 4 ? slice(c.callData, 0, 4) : "0x" }));
    } else if (mode.slice(0, 4) === "0x00") {
      res.inner = [{ target: getAddress(slice(ec, 0, 20)), value: BigInt(slice(ec, 20, 52)).toString(), sel: size(ec) >= 56 ? slice(ec, 52, 56) : "0x" }];
    }
  } catch (e) { res.err = String(e.message || e).slice(0, 80); }
  return res;
}
const out = [];
for (const f of process.argv.slice(2)) {
  const tx = JSON.parse(fs.readFileSync(f, "utf8"));
  const dec = decodeFunctionData({ abi: handleOpsAbi, data: tx.raw_input });
  const ops = dec.args[0];
  ops.forEach((op, i) => {
    if (op.initCode === "0x" || size(op.initCode) === 0) return;
    const factory = getAddress(slice(op.initCode, 0, 20));
    const factoryData = slice(op.initCode, 20);
    const row = { tx: tx.hash, opIndex: i, sender: getAddress(op.sender), nonce: op.nonce.toString(), factory,
      factorySelector: slice(factoryData, 0, 4), paymasterAndDataLen: size(op.paymasterAndData),
      paymaster: size(op.paymasterAndData) >= 20 ? getAddress(slice(op.paymasterAndData, 0, 20)) : null,
      sigLen: size(op.signature), sigPrefix: slice(op.signature, 0, 1),
      nonceKeyHex: toHex(op.nonce >> 64n), call: decodeInner(op.callData) };
    try {
      const ca = decodeFunctionData({ abi: factoryAbi, data: factoryData });
      row.salt = ca.args[1];
      const data = ca.args[0];
      row.initDataLen = size(data);
      row.initSelector = slice(data, 0, 4);
      row.initDataKeccak = keccak256(data);
      let id;
      try { id = decodeFunctionData({ abi: initAbi, data }); row.initSig = "initialize(bytes21,address,bytes,bytes,bytes[])"; }
      catch { id = decodeFunctionData({ abi: initAbiV30, data }); row.initSig = "initialize(bytes21,address,bytes,bytes)"; }
      const [rootValidator, hook, validatorData, hookData, initConfig] = id.args;
      row.rootValidator = rootValidator;               // bytes21 = 1 byte type + 20 byte validator address
      row.rootType = slice(rootValidator, 0, 1);
      row.rootValidatorAddr = getAddress(slice(rootValidator, 1, 21));
      row.hook = getAddress(hook);
      row.validatorData = validatorData;
      row.validatorDataLen = size(validatorData);
      row.owner = size(validatorData) === 20 ? getAddress(validatorData) : null;
      row.hookDataLen = size(hookData);
      row.hookData = hookData;
      row.initConfigLen = initConfig ? initConfig.length : 0;
      row.initConfig = initConfig;
      row.initDataHex = data;
    } catch (e) {
      row.decodeError = String(e.message || e).slice(0, 200);
      row.factoryDataHex = factoryData;
    }
    out.push(row);
  });
}
console.log(JSON.stringify(out, null, 1));
