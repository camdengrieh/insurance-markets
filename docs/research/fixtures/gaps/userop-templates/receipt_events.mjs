// Cross-check: eth_getTransactionReceipt (keyless XO RPC) -> UserOperationEvents; compare to locally recomputed userOpHash for every op in the tx.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rpc, result } from './rpcclient.mjs';
import { decodeTx, userOpHashV07 } from './decode_handleops.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const T_OP = '0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f';
for (const h of process.argv.slice(2)) {
  const d = decodeTx(h);
  const rc = result(await rpc(U, 'eth_getTransactionReceipt', [h]));
  const evs = rc.logs.filter(l => l.topics[0] === T_OP).map(l => ({ hash: l.topics[1], sender: '0x' + l.topics[2].slice(26), paymaster: '0x' + l.topics[3].slice(26), nonce: BigInt(viem.slice(l.data, 0, 32)), success: BigInt(viem.slice(l.data, 32, 64)) === 1n, gasCost: BigInt(viem.slice(l.data, 64, 96)), gasUsed: BigInt(viem.slice(l.data, 96, 128)) }));
  const locals = d.ops.map(o => userOpHashV07(o));
  const matched = locals.filter(x => evs.some(e => e.hash.toLowerCase() === x.toLowerCase())).length;
  const okCount = evs.filter(e => e.success).length;
  const pmCount = new Set(evs.map(e => e.paymaster.toLowerCase()));
  console.log(h.slice(0, 14), 'status', rc.status, 'ops', d.ops.length, 'events', evs.length, 'localHashesMatchingEvents', matched, 'opsSuccess', okCount, 'paymasters', [...pmCount].join(','), 'txGasUsed', parseInt(rc.gasUsed, 16), 'effectiveGasPrice', BigInt(rc.effectiveGasPrice).toString(), 'sumActualGasUsed', evs.reduce((a, e) => a + e.gasUsed, 0n).toString(), 'sumActualGasCost', evs.reduce((a, e) => a + e.gasCost, 0n).toString());
}
