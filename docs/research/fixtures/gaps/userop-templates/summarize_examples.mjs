// Produce decoded_examples.json (+ console table) for every example in examples.json. Offline except cached RPC receipts for ops whose explorer log page was truncated.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeTx } from './analyze_ops.mjs';
import { labelAddr } from './kernel.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const ex = JSON.parse(readFileSync(join(here, 'examples.json'), 'utf8'));
const owners = existsSync(join(here, 'owners.json')) ? JSON.parse(readFileSync(join(here, 'owners.json'), 'utf8')) : {};
const J = (o) => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'bigint' ? v.toString() : v));
const out = []; const agg = { opsWithKnownOwner: 0, eip191Match: 0, rawMatch: 0, neither: 0, byAccountType: {} };
const rawSigners = {};
for (const [action, hashes] of Object.entries(ex)) {
  for (const h of hashes) {
    if (!existsSync(join(here, 'txs', h + '.json'))) { console.log('missing tx file', h); continue; }
    const r = await analyzeTx(h);
    if (r.notEntryPoint) { out.push({ action, tx: h, viaEntryPoint: false, to: r.to }); continue; }
    for (const o of r.ops) {
      const rec = {
        action, tx: h, block: r.block, bundlerEOA: labelAddr(r.bundlerEOA), sender: labelAddr(o.sender), userOpHash: o.userOpHash,
        hashMatchesUserOperationEventLog: o.matchesEventLog, viemHashAgrees: o.viemHashAgrees, opSuccessInEventLog: o.eventSuccess ?? 'log page truncated; see RPC receipt',
        nonce: { raw: o.nonceRaw, ...o.nonce }, factory: o.factory ? labelAddr(o.factory) : null, deploysAccount: !!o.factory,
        factoryOwnerInInitCode: o.factoryData?.owner ? labelAddr(o.factoryData.owner) : null, salt: o.factoryData?.salt ?? null,
        callType: o.callData.callTypeName, execType: o.callData.execTypeName, execMode: o.callData.mode, nCalls: o.callData.calls.length,
        calls: o.callData.calls.slice(0, 3).map(c => ({ target: c.targetLabel, fn: c.fn, value: c.value, args: c.args && c.args.map(a => typeof a === 'string' && a.length > 70 ? a.slice(0, 20) + '..' : a) })),
        gas: o.gas, paymaster: o.paymaster ? labelAddr(o.paymaster) : null, paymasterDataBytes: o.paymasterDataLen, paymasterAndDataBytes: o.paymasterAndDataLen,
        signatureBytes: o.signatureLen, sigV: o.sigV, initCodeBytes: o.initCodeLen, callDataBytes: o.callDataLen,
        recoveredSignerRawHash: labelAddr(o.recovered.rawHash), recoveredSignerEip191: labelAddr(o.recovered.eip191),
        knownOwner: o.expectedOwner ? labelAddr(o.expectedOwner) : null, rawHashRecoversToOwner: o.recoversRawHashToOwner ?? null, eip191RecoversToOwner: o.recoversEip191ToOwner ?? null,
      };
      if (o.expectedOwner) { agg.opsWithKnownOwner++; if (o.recoversEip191ToOwner) agg.eip191Match++; else if (o.recoversRawHashToOwner) agg.rawMatch++; else agg.neither++; }
      else { (rawSigners[o.sender.toLowerCase()] ||= []).push({ raw: o.recovered.rawHash, e191: o.recovered.eip191 }); }
      out.push(rec);
    }
  }
}
// operator-account (no 0x845A OwnerRegistered log): is the RAW-recovered signer stable across distinct userOpHashes?
const stability = {};
for (const [s, arr] of Object.entries(rawSigners)) { const raws = new Set(arr.map(a => a.raw)); const e191 = new Set(arr.map(a => a.e191)); stability[labelAddr(s)] = { ops: arr.length, distinctRawRecoveredSigners: raws.size, distinctEip191RecoveredSigners: e191.size, rawSigners: [...raws].map(labelAddr) }; }
writeFileSync(join(here, 'decoded_examples.json'), JSON.stringify({ aggregate: agg, operatorAccountSignerStability: stability, examples: J(out) }, null, 1));
console.log(JSON.stringify({ aggregate: agg, operatorAccountSignerStability: stability }, null, 1));
for (const r of out) console.log(r.action.padEnd(40), r.tx.slice(0, 14), r.viaEntryPoint === false ? 'NOT EntryPoint' : `blk ${r.block} sender ${r.sender} nonceSeq ${r.nonce.sequence} deploy ${r.deploysAccount} ${r.callType}x${r.nCalls} pm ${r.paymaster ? 'yes' : 'NO'} sig${r.signatureBytes} rawOK ${r.rawHashRecoversToOwner} eip191OK ${r.eip191RecoversToOwner}`);
