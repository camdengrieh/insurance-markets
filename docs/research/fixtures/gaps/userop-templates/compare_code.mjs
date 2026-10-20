// Compare deployed runtime code of the ERC-4337/Kernel contracts on XO (3223) against the same addresses on Base (public RPC). eth_getCode only.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rpc, result } from './rpcclient.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const XO = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const BASE = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const T = [
  ['EntryPoint v0.7', '0x0000000071727De22E5E9d8BAf0edAc6f37da032'],
  ['KernelFactory 0.3.1', '0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419'],
  ['Kernel impl 0.3.1', '0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D'],
  ['ECDSAValidator', '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57'],
];
console.log('chainId XO', result(await rpc(XO, 'eth_chainId')), 'Base', result(await rpc(BASE, 'eth_chainId')));
for (const [n, a] of T) {
  const cx = result(await rpc(XO, 'eth_getCode', [a, 'latest']));
  const cb = result(await rpc(BASE, 'eth_getCode', [a, 'latest']));
  console.log(n.padEnd(22), a, 'XO bytes', (cx.length - 2) / 2, 'keccak', viem.keccak256(cx).slice(0, 18), '| Base bytes', (cb.length - 2) / 2, 'keccak', viem.keccak256(cb).slice(0, 18), cx === cb ? 'IDENTICAL' : 'DIFFERENT');
}
