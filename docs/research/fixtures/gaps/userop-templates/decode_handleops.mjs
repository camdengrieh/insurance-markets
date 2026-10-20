// Decode EntryPoint v0.7 handleOps transactions (from ./txs/<hash>.json, produced by fetch_txs.py).
// Offline: no network. Usage: node decode_handleops.mjs <txhash> [...]
// viem is loaded from $VIEM_DIR (the repo's installed viem; read-only use).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const aa = await import(pathToFileURL(join(viemDir, '_esm/account-abstraction/index.js')).href);
const { decodeFunctionData, keccak256, encodeAbiParameters, concat, slice, hexToBigInt, size } = viem;

export const ENTRYPOINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
export const CHAIN_ID = 3223n;
const TOPIC_USEROP = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
const TOPIC_DEPLOYED = '0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d';

export function unpackOp(op) {
  const vgl = hexToBigInt(slice(op.accountGasLimits, 0, 16));
  const cgl = hexToBigInt(slice(op.accountGasLimits, 16, 32));
  const mpf = hexToBigInt(slice(op.gasFees, 0, 16)); // maxPriorityFeePerGas
  const mf = hexToBigInt(slice(op.gasFees, 16, 32)); // maxFeePerGas
  const o = {
    sender: op.sender, nonce: op.nonce, callData: op.callData, signature: op.signature,
    preVerificationGas: op.preVerificationGas, verificationGasLimit: vgl, callGasLimit: cgl,
    maxPriorityFeePerGas: mpf, maxFeePerGas: mf,
    accountGasLimits: op.accountGasLimits, gasFees: op.gasFees,
    initCode: op.initCode, paymasterAndData: op.paymasterAndData,
  };
  if (size(op.initCode) >= 20) { o.factory = slice(op.initCode, 0, 20); o.factoryData = size(op.initCode) > 20 ? slice(op.initCode, 20) : '0x'; }
  if (size(op.paymasterAndData) >= 52) {
    o.paymaster = slice(op.paymasterAndData, 0, 20);
    o.paymasterVerificationGasLimit = hexToBigInt(slice(op.paymasterAndData, 20, 36));
    o.paymasterPostOpGasLimit = hexToBigInt(slice(op.paymasterAndData, 36, 52));
    o.paymasterData = size(op.paymasterAndData) > 52 ? slice(op.paymasterAndData, 52) : '0x';
  }
  return o;
}

// ERC-4337 v0.7 userOpHash, written out by hand from the spec (EntryPoint.getUserOpHash / UserOperationLib).
export function userOpHashV07(op, entryPoint = ENTRYPOINT, chainId = CHAIN_ID) {
  const inner = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }],
    [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData), op.accountGasLimits, op.preVerificationGas, op.gasFees, keccak256(op.paymasterAndData)]));
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }], [inner, entryPoint, chainId]));
}

// Same hash computed by viem's own implementation as an independent cross-check.
export function userOpHashViem(op) {
  const u = {
    sender: op.sender, nonce: op.nonce, callData: op.callData, signature: op.signature,
    callGasLimit: op.callGasLimit, verificationGasLimit: op.verificationGasLimit, preVerificationGas: op.preVerificationGas,
    maxFeePerGas: op.maxFeePerGas, maxPriorityFeePerGas: op.maxPriorityFeePerGas,
  };
  if (op.factory) { u.factory = op.factory; u.factoryData = op.factoryData; }
  if (op.paymaster) { u.paymaster = op.paymaster; u.paymasterData = op.paymasterData; u.paymasterVerificationGasLimit = op.paymasterVerificationGasLimit; u.paymasterPostOpGasLimit = op.paymasterPostOpGasLimit; }
  return aa.getUserOperationHash({ userOperation: u, entryPointAddress: ENTRYPOINT, entryPointVersion: '0.7', chainId: Number(CHAIN_ID) });
}

export function decodeTx(txhash) {
  const tx = JSON.parse(readFileSync(join(here, 'txs', txhash.toLowerCase() + '.json'), 'utf8'));
  if (tx.to.toLowerCase() !== ENTRYPOINT.toLowerCase()) return { hash: txhash, notEntryPoint: true, to: tx.to };
  const dec = decodeFunctionData({ abi: aa.entryPoint07Abi, data: tx.input });
  if (dec.functionName !== 'handleOps') return { hash: txhash, fn: dec.functionName };
  const [ops, beneficiary] = dec.args;
  const events = tx.logs.filter(l => l.address.toLowerCase() === ENTRYPOINT.toLowerCase() && l.topics[0] === TOPIC_USEROP).map(l => ({
    userOpHash: l.topics[1], sender: '0x' + l.topics[2].slice(26), paymaster: '0x' + l.topics[3].slice(26),
    nonce: hexToBigInt(slice(l.data, 0, 32)), success: hexToBigInt(slice(l.data, 32, 64)) === 1n,
    actualGasCost: hexToBigInt(slice(l.data, 64, 96)), actualGasUsed: hexToBigInt(slice(l.data, 96, 128)),
  }));
  const deployed = tx.logs.filter(l => l.topics[0] === TOPIC_DEPLOYED).map(l => ({
    userOpHash: l.topics[1], sender: '0x' + l.topics[2].slice(26), factory: '0x' + slice(l.data, 0, 32).slice(26), paymaster: '0x' + l.topics[3]?.slice(26),
  }));
  return { hash: txhash, block: tx.blockNumber, from: tx.from, gasUsed: tx.gasUsed, gasPrice: tx.gasPrice, success: tx.success, beneficiary, selector: tx.input.slice(0, 10), ops: ops.map(unpackOp), events, deployed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const h of process.argv.slice(2)) {
    const d = decodeTx(h);
    if (d.notEntryPoint) { console.log(h, 'NOT EntryPoint, to=', d.to); continue; }
    console.log('TX', h, 'block', d.block, 'from', d.from, 'selector', d.selector, 'ops', d.ops.length, 'events', d.events.length);
    d.ops.forEach((op, i) => {
      const mine = userOpHashV07(op), viemH = userOpHashViem(op);
      const ev = d.events.find(e => e.userOpHash.toLowerCase() === mine.toLowerCase());
      console.log(' op', i, 'sender', op.sender, 'nonce', '0x' + op.nonce.toString(16), 'sigLen', size(op.signature), 'hashMatchesEvent', !!ev, 'viemAgrees', viemH.toLowerCase() === mine.toLowerCase());
    });
  }
}
