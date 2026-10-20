// Outbound route (withdraw) cost check via view calls on the Hyperlane warp route (keyless RPC, read-only).
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { rpc, result } from './rpcclient.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const { encodeFunctionData, decodeFunctionResult, pad } = viem;
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const ROUTE = '0x9090463546d725f6ece5d1a4b27beb929d5d1983';
const abi = JSON.parse(readFileSync(join(here, 'abi/route_impl.abi.json'), 'utf8'));
const call = async (fn, args = []) => decodeFunctionResult({ abi, functionName: fn, data: result(await rpc(U, 'eth_call', [{ to: ROUTE, data: encodeFunctionData({ abi, functionName: fn, args }) }, 'latest'])) });
const show = (v) => JSON.stringify(v, (k, x) => typeof x === 'bigint' ? x.toString() : x);
console.log('localDomain', show(await call('localDomain')), 'domains', show(await call('domains')), 'token', show(await call('token')), 'feeHook', show(await call('feeHook')), 'hook', show(await call('hook')), 'owner', show(await call('owner')));
const recipient = pad('0x00000000000000000000000000000000000000a1', { size: 32 }); // dummy bytes32 recipient (only used to ask for a quote)
console.log('quoteTransferRemote(8453, dummy, 10 USDC.e) =', show(await call('quoteTransferRemote', [8453, recipient, 10_000_000n])));
