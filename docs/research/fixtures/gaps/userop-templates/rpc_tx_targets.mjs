// For a list of tx hashes: fetch eth_getTransactionByHash (keyless XO RPC, read) and print to + selector. Used to classify outbound transferRemote txs.
import { readFileSync } from 'node:fs';
import { rpc, result } from './rpcclient.mjs';
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const [file, key, n] = process.argv.slice(2);
const txs = JSON.parse(readFileSync(file, 'utf8'))[key].txs.slice(-Number(n || 8));
const EP = '0x0000000071727de22e5e9d8baf0edac6f37da032';
let viaEP = 0;
for (const h of txs) {
  const t = result(await rpc(U, 'eth_getTransactionByHash', [h]));
  const isEP = t.to?.toLowerCase() === EP; if (isEP) viaEP++;
  console.log(h.slice(0, 14), 'to', t.to, isEP ? '(EntryPoint)' : '', 'selector', t.input.slice(0, 10), 'block', parseInt(t.blockNumber, 16));
}
console.log(`${viaEP} of ${txs.length} via EntryPoint`);
