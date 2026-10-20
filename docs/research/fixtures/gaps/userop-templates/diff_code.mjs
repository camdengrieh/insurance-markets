import { rpc, result } from './rpcclient.mjs';
const XO = 'https://rpc-mainnet-2.xo.market', BASE = 'https://mainnet.base.org', A = '0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D';
const x = result(await rpc(XO, 'eth_getCode', [A, 'latest'])), b = result(await rpc(BASE, 'eth_getCode', [A, 'latest']));
const diffs = [];
for (let i = 2; i < x.length; i += 2) if (x.slice(i, i + 2) !== b.slice(i, i + 2)) diffs.push((i - 2) / 2);
console.log('bytes', (x.length - 2) / 2, 'differing byte count', diffs.length, 'offsets', diffs.slice(0, 60).join(','));
if (diffs.length) { const lo = diffs[0], hi = diffs[diffs.length - 1]; console.log('range', lo, hi, 'XO[', lo, '..', hi + 1, ']', '0x' + x.slice(2 + lo * 2, 2 + (hi + 1) * 2), '\nBase', '0x' + b.slice(2 + lo * 2, 2 + (hi + 1) * 2)); }
console.log('tail XO ', x.slice(-120)); console.log('tail Base', b.slice(-120));
