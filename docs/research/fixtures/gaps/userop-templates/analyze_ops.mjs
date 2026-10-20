// Offline analysis: decode every op in the given txs and print a compact human report.
// Usage: node analyze_ops.mjs [--json] <txhash> ...    (reads ./txs/<hash>.json; optional ./owners.json {sender:owner})
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTx, userOpHashV07, userOpHashViem } from './decode_handleops.mjs';
import { decodeKernelNonce, decodeKernelCallData, decodeFactoryData, recoverBoth, labelAddr } from './kernel.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const owners = existsSync(join(here, 'owners.json')) ? JSON.parse(readFileSync(join(here, 'owners.json'), 'utf8')) : {};
const J = (o) => JSON.stringify(o, (k, v) => typeof v === 'bigint' ? v.toString() : v);
const args = process.argv.slice(2); const asJson = args[0] === '--json'; const hashes = asJson ? args.slice(1) : args;
export async function analyzeTx(h) {
  const d = decodeTx(h);
  if (d.notEntryPoint) return { hash: h, notEntryPoint: true, to: d.to };
  const res = { hash: h, block: d.block, bundlerEOA: d.from, txGasUsed: d.gasUsed, txGasPrice: d.gasPrice, ops: [] };
  for (const op of d.ops) {
    const uh = userOpHashV07(op);
    const ev = d.events.find(e => e.userOpHash.toLowerCase() === uh.toLowerCase());
    const r = { sender: op.sender, userOpHash: uh, matchesEventLog: !!ev, viemHashAgrees: userOpHashViem(op).toLowerCase() === uh.toLowerCase(), eventSuccess: ev?.success, eventActualGasUsed: ev?.actualGasUsed, eventActualGasCost: ev?.actualGasCost, eventPaymaster: ev?.paymaster };
    r.nonceRaw = '0x' + op.nonce.toString(16); r.nonce = decodeKernelNonce(op.nonce);
    r.factory = op.factory || null;
    if (op.factory) { try { r.factoryData = decodeFactoryData(op.factoryData); } catch (e) { r.factoryDataErr = String(e.shortMessage || e); } }
    r.callData = decodeKernelCallData(op.callData);
    r.gas = { verificationGasLimit: op.verificationGasLimit, callGasLimit: op.callGasLimit, preVerificationGas: op.preVerificationGas, maxFeePerGas: op.maxFeePerGas, maxPriorityFeePerGas: op.maxPriorityFeePerGas, paymasterVerificationGasLimit: op.paymasterVerificationGasLimit, paymasterPostOpGasLimit: op.paymasterPostOpGasLimit };
    r.paymaster = op.paymaster || null; r.paymasterDataLen = op.paymasterData ? (op.paymasterData.length - 2) / 2 : null; r.paymasterAndDataLen = (op.paymasterAndData.length - 2) / 2;
    r.signatureLen = (op.signature.length - 2) / 2; r.signature = op.signature; r.sigV = op.signature.slice(-2);
    r.recovered = await recoverBoth(uh, op.signature);
    r.expectedOwner = r.factoryData?.owner || owners[op.sender.toLowerCase()] || null;
    if (r.expectedOwner) { r.recoversRawHashToOwner = r.recovered.rawHash?.toLowerCase() === r.expectedOwner.toLowerCase(); r.recoversEip191ToOwner = r.recovered.eip191?.toLowerCase() === r.expectedOwner.toLowerCase(); }
    r.initCodeLen = (op.initCode.length - 2) / 2; r.callDataLen = (op.callData.length - 2) / 2;
    res.ops.push(r);
  }
  return res;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const h of hashes) {
    const r = await analyzeTx(h);
    if (asJson) { console.log(J(r)); continue; }
    if (r.notEntryPoint) { console.log('TX', h, 'NOT via EntryPoint; to', r.to); continue; }
    console.log('TX', h, 'block', r.block, 'bundlerEOA', labelAddr(r.bundlerEOA), 'ops', r.ops.length);
    for (const o of r.ops) {
      console.log('  op sender', labelAddr(o.sender), 'hash', o.userOpHash.slice(0, 12), 'eventMatch', o.matchesEventLog, 'viemAgrees', o.viemHashAgrees, 'success', o.eventSuccess);
      console.log('    nonce', J(o.nonce), 'factory', o.factory && labelAddr(o.factory), o.factoryData ? J({ owner: o.factoryData.owner && labelAddr(o.factoryData.owner), rootValidator: o.factoryData.rootValidator, salt: o.factoryData.salt, hook: o.factoryData.hook }) : '');
      console.log('    callData', o.callData.callTypeName, o.callData.execTypeName, 'mode', o.callData.mode?.slice(0, 6) + '..');
      if ((o.callData.calls||[]).length > 3) console.log('      (batch of', o.callData.calls.length, 'calls; first 2 + last shown)');
      const _cs = o.callData.calls || []; for (const c of (_cs.length > 3 ? [_cs[0], _cs[1], _cs[_cs.length-1]] : _cs)) console.log('      -> ', c.targetLabel, 'value', c.value, c.fn || c.selector, c.args ? J(c.args).slice(0, 220) : '');
      console.log('    gas', J(o.gas), 'pm', o.paymaster && labelAddr(o.paymaster), 'pmDataLen', o.paymasterDataLen);
      console.log('    sigLen', o.signatureLen, 'v', o.sigV, 'owner', o.expectedOwner && labelAddr(o.expectedOwner), 'rawOK', o.recoversRawHashToOwner, 'eip191OK', o.recoversEip191ToOwner, 'recovered', J(o.recovered && { raw: labelAddr(o.recovered.rawHash), e191: labelAddr(o.recovered.eip191) }));
    }
  }
}
