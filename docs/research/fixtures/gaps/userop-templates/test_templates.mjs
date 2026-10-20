// Golden test: rebuild REAL on-chain UserOps from semantic parameters with userop_templates.mjs and compare byte-for-byte.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTx, userOpHashV07 } from './decode_handleops.mjs';
import { decodeKernelCallData, decodeFactoryData } from './kernel.mjs';
import * as T from './userop_templates.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const ex = JSON.parse(readFileSync(join(here, 'examples.json'), 'utf8'));
let pass = 0, fail = 0;
const check = (label, a, b) => { const ok = String(a).toLowerCase() === String(b).toLowerCase(); ok ? pass++ : fail++; if (!ok) console.log('  MISMATCH', label, '\n   built', a, '\n   real ', b); return ok; };
for (const [action, hashes] of Object.entries(ex)) {
  if (action.includes('NOT_userop')) continue;
  for (const h of hashes) {
    const d = decodeTx(h); if (d.notEntryPoint) { console.log(h.slice(0, 12), 'skip: not EntryPoint'); continue; }
    const op = d.ops[0];
    const cd = decodeKernelCallData(op.callData);
    const innerCalls = cd.calls.map(c => ({ to: c.target, value: c.value, data: c.data }));
    // 1) generic ERC-7579 re-encoding of whatever the real op did
    check(h.slice(0, 10) + ' callData(generic encodeExecute)', T.encodeExecute(innerCalls), op.callData);
    // 2) action-specific builders
    let specific = null;
    if (action.startsWith('enableTrading')) specific = T.calls.enableTrading();
    else if (action.startsWith('redeemPositions')) specific = cd.calls.map(c => T.calls.redeem([c.args[2]], c.args[3])[0]);
    else if (action === 'mergePositions') specific = T.calls.merge(cd.calls[0].args[2], cd.calls[0].args[4], cd.calls[0].args[3]);
    else if (action === 'splitPosition') specific = T.calls.split(cd.calls[0].args[2], cd.calls[0].args[4], cd.calls[0].args[3]);
    else if (action === 'createConvictionMarket') specific = T.calls.createConvictionMarket({ startsAt: cd.calls[1].args[0], expiresAt: cd.calls[1].args[1], metaDataURI: cd.calls[1].args[3] });
    if (specific) check(h.slice(0, 10) + ' callData(action builder ' + action + ')', T.encodeExecute(specific), op.callData);
    // 3) nonce
    const key = op.nonce >> 64n; const seq = op.nonce & ((1n << 64n) - 1n);
    const identifier = '0x' + ((op.nonce >> 80n) & ((1n << 160n) - 1n)).toString(16).padStart(40, '0');
    check(h.slice(0, 10) + ' nonce', T.kernelNonce(seq, { identifier, nonceKey: Number(key & 0xffffn) }).toString(), op.nonce.toString());
    // 4) initCode (account deployment) from the owner
    if (op.factory) {
      const owner = decodeFactoryData(op.factoryData).owner;
      check(h.slice(0, 10) + ' initCode(buildInitCode(owner))', T.buildInitCode(owner), op.initCode);
      check(h.slice(0, 10) + ' sender == counterfactualAddress(owner)', T.counterfactualAddress(owner), op.sender);
    }
    // 5) gas/paymaster packing and the hash
    const built = T.packUserOp({ sender: op.sender, nonce: op.nonce, initCode: op.initCode, callData: op.callData, verificationGasLimit: op.verificationGasLimit, callGasLimit: op.callGasLimit, preVerificationGas: op.preVerificationGas, maxFeePerGas: op.maxFeePerGas, maxPriorityFeePerGas: op.maxPriorityFeePerGas, paymasterVerificationGasLimit: op.paymasterVerificationGasLimit, paymasterPostOpGasLimit: op.paymasterPostOpGasLimit, usePaymaster: !!op.paymaster });
    check(h.slice(0, 10) + ' accountGasLimits', built.accountGasLimits, op.accountGasLimits);
    check(h.slice(0, 10) + ' gasFees', built.gasFees, op.gasFees);
    check(h.slice(0, 10) + ' paymasterAndData', built.paymasterAndData, op.paymasterAndData);
    const ev = d.events.find(e => e.userOpHash.toLowerCase() === userOpHashV07(op).toLowerCase());
    check(h.slice(0, 10) + ' userOpHash(builder) == local == event', T.userOpHash(built), ev ? ev.userOpHash : userOpHashV07(op));
    console.log(h.slice(0, 14), action.padEnd(40), 'rebuilt OK so far; pass', pass, 'fail', fail);
  }
}
console.log('TOTAL pass', pass, 'fail', fail);
process.exit(fail ? 1 : 0);
