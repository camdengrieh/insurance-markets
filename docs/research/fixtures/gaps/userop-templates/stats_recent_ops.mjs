// Aggregate statistics over recent EntryPoint transactions (offline; reads recent_handleops.json).
import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { unpackOp } from './decode_handleops.mjs';
import { decodeKernelNonce, decodeKernelCallData, labelAddr } from './kernel.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const aa = await import(pathToFileURL(join(viemDir, '_esm/account-abstraction/index.js')).href);
const rows = JSON.parse(readFileSync(join(here, 'recent_handleops.json'), 'utf8'));
const PM = '0x2353b23d8f329fd3cec0d21652f14208248a439d';
const med = (a) => { const s = [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)); return s[Math.floor(s.length / 2)]; };
const classes = {}; const tot = { txs: 0, ops: 0, notHandleOps: 0, pmPolicy: 0, pmNone: 0, pmOther: 0, withFactory: 0, fee0: 0, sig65: 0, nonceRootType: 0, nonceIdent845A: 0, nonceIdentZero: 0, nonceKeyNonZero: 0, undecodable: 0 };
const bundlers = new Set(); const opsPerTx = [];
for (const r of rows) {
  tot.txs++;
  let dec; try { dec = viem.decodeFunctionData({ abi: aa.entryPoint07Abi, data: r.raw_input }); } catch { tot.notHandleOps++; continue; }
  if (dec.functionName !== 'handleOps') { tot.notHandleOps++; continue; }
  bundlers.add(r.from.toLowerCase()); opsPerTx.push(dec.args[0].length);
  for (const raw of dec.args[0]) {
    const op = unpackOp(raw); tot.ops++;
    const pm = op.paymaster ? op.paymaster.toLowerCase() : null;
    if (!pm) tot.pmNone++; else if (pm === PM) tot.pmPolicy++; else tot.pmOther++;
    if (op.factory) tot.withFactory++;
    if (op.maxFeePerGas === 0n && op.maxPriorityFeePerGas === 0n) tot.fee0++;
    if ((op.signature.length - 2) / 2 === 65) tot.sig65++;
    const n = decodeKernelNonce(op.nonce);
    if (n.type === '0x00' && n.mode === '0x00') tot.nonceRootType++;
    if (n.identifier === '0x845adb2c711129d4f3966735ed98a9f09fc4ce57') tot.nonceIdent845A++;
    if (/^0x0+$/.test(n.identifier)) tot.nonceIdentZero++;
    if (n.nonceKey !== 0) tot.nonceKeyNonZero++;
    let cls;
    try {
      const cd = decodeKernelCallData(op.callData);
      const names = [...new Set((cd.calls || []).map(c => `${c.targetLabel}.${c.fn || c.selector}`))];
      cls = (cd.callTypeName || '?') + ':' + (names.length > 3 ? names.slice(0, 3).join('+') + '+..' : names.join('+')) + (op.factory ? ' [+deploy]' : '');
    } catch { cls = 'undecodable'; tot.undecodable++; }
    (classes[cls] ||= []).push({ vgl: op.verificationGasLimit, cgl: op.callGasLimit, pvg: op.preVerificationGas, pmv: op.paymasterVerificationGasLimit, pmp: op.paymasterPostOpGasLimit, pm: !!pm });
  }
}
const J = (o) => JSON.stringify(o, (k, v) => typeof v === 'bigint' ? v.toString() : v);
console.log('TOTALS', J(tot), 'distinct bundler EOAs', bundlers.size, 'ops/tx median', med(opsPerTx), 'max', Math.max(...opsPerTx));
console.log('CLASSES (count; median/min/max callGasLimit; median verificationGasLimit; median preVerificationGas; paymaster used count)');
for (const [k, v] of Object.entries(classes).sort((a, b) => b[1].length - a[1].length).slice(0, 14)) {
  const cg = v.map(x => x.cgl), vg = v.map(x => x.vgl), pg = v.map(x => x.pvg);
  const mn = (a) => a.reduce((x, y) => (x < y ? x : y)), mx = (a) => a.reduce((x, y) => (x > y ? x : y));
  console.log(String(v.length).padStart(4), k.slice(0, 95).padEnd(95), 'cgl', J([med(cg), mn(cg), mx(cg)]), 'vgl', J(med(vg)), 'pvg', J(med(pg)), 'pm', v.filter(x => x.pm).length, 'pmV/pmP med', J([med(v.filter(x => x.pm).map(x => x.pmv).concat([0n])), med(v.filter(x => x.pm).map(x => x.pmp).concat([0n]))]));
}
