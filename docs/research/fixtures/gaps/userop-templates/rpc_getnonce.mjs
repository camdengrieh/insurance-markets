// EntryPoint.getNonce(sender, key) via keyless RPC for comparison with the explorer-log-derived nonce. Usage: node rpc_getnonce.mjs <sender> [validatorId]
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rpc, result } from './rpcclient.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const { encodeFunctionData, decodeFunctionResult, parseAbi } = viem;
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const abi = parseAbi(['function getNonce(address sender, uint192 key) view returns (uint256)']);
const [sender, ident = '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57'] = process.argv.slice(2);
const key = BigInt(ident) << 16n; // mode 0x00, type 0x00 (root), identifier, nonceKey 0
const n = decodeFunctionResult({ abi, functionName: 'getNonce', data: result(await rpc(U, 'eth_call', [{ to: '0x0000000071727De22E5E9d8BAf0edAc6f37da032', data: encodeFunctionData({ abi, functionName: 'getNonce', args: [sender, key] }) }, 'latest'])) });
console.log(sender.slice(0, 10), 'getNonce ->', '0x' + n.toString(16), '(sequence', (n & ((1n << 64n) - 1n)).toString() + ')');
