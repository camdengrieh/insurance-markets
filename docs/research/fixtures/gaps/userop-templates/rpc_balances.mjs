// eth_getBalance (keyless XO RPC, read) for a few addresses: bundler EOA fleet sample, a sponsored Kernel account, the owner of a sample account.
import { rpc, result } from './rpcclient.mjs';
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
for (const [label, a] of process.argv.slice(2).map(s => s.split('='))) {
  const v = BigInt(result(await rpc(U, 'eth_getBalance', [a, 'latest'])));
  console.log(label.padEnd(26), a.slice(0, 8) + '..' + a.slice(-4), (Number(v) / 1e18).toFixed(6), 'XO');
}
