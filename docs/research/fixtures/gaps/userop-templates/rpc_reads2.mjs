// PolicyPaymaster state + policy dry-runs via its own view function checkPolicy(account,target,selector) (eth_call, keyless RPC).
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { rpc, result } from './rpcclient.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const aa = await import(pathToFileURL(join(viemDir, '_esm/account-abstraction/index.js')).href);
const { encodeFunctionData, decodeFunctionResult, toFunctionSelector, parseAbi } = viem;
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const EP = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const PM = '0x2353b23d8f329fd3cec0d21652f14208248a439d';
const pmAbi = JSON.parse(readFileSync(join(here, 'abi/paymaster.abi.json'), 'utf8'));
const call = async (to, abi, fn, args = []) => decodeFunctionResult({ abi, functionName: fn, data: result(await rpc(U, 'eth_call', [{ to, data: encodeFunctionData({ abi, functionName: fn, args }) }, 'latest'])) });
const out = {};
for (const fn of ['paused', 'dailyTxLimit', 'owner', 'entryPoint', 'SECONDS_PER_DAY', 'getDeposit']) out[fn] = String(await call(PM, pmAbi, fn));
const di = await call(EP, aa.entryPoint07Abi, 'getDepositInfo', [PM]);
out.entryPointDepositInfo = JSON.parse(JSON.stringify(di, (k, v) => typeof v === 'bigint' ? v.toString() : v));
console.log(JSON.stringify(out, null, 1));
const NEVER_SEEN = '0x7777777777777777777777777777777777777777'; // arbitrary address with no history
const USDC = '0x80c12230ce677e6f304027a14780Edd2A829ab0c', CTF = '0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909', MGR = '0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307', ROUTE = '0x9090463546d725F6eCE5D1A4B27beB929D5D1983', EXCH = '0x4bC5E872256D12E6017dfe466E04c867DC761B77';
const T = [
  ['USDC.e', USDC, 'approve(address,uint256)'], ['USDC.e', USDC, 'transfer(address,uint256)'], ['USDC.e', USDC, 'transferFrom(address,address,uint256)'],
  ['CTF', CTF, 'setApprovalForAll(address,bool)'], ['CTF', CTF, 'redeemPositions(address,bytes32,bytes32,uint256[])'], ['CTF', CTF, 'splitPosition(address,bytes32,bytes32,uint256[],uint256)'],
  ['CTF', CTF, 'mergePositions(address,bytes32,bytes32,uint256[],uint256)'], ['CTF', CTF, 'safeTransferFrom(address,address,uint256,uint256,bytes)'], ['CTF', CTF, 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)'],
  ['Manager', MGR, 'createConvictionMarket(uint40,uint40,address,string)'], ['Manager', MGR, 'respondToUpdateRequest(bytes32,bool)'], ['Manager', MGR, 'cancelMarket(bytes32)'],
  ['Manager', MGR, 'createConvictionMarketFor(address,uint40,uint40,address,string)'], ['Manager', MGR, 'updateMetadata(bytes32,string)'],
  ['HypRoute', ROUTE, 'transferRemote(uint32,bytes32,uint256)'], ['Exchange', EXCH, 'incrementNonce()'],
  ['(any)', '0x0000000000000000000000000000000000000001', 'approve(address,uint256)'], ['(any)', '0x0000000000000000000000000000000000000001', 'transfer(address,uint256)'],
];
console.log('checkPolicy(account=never-seen, target, selector) -> (allowed, reason)');
const rows = [];
for (const [lbl, tgt0, sig] of T) { const tgt = tgt0.toLowerCase();
  const sel = toFunctionSelector(sig);
  const [allowed, reason] = await call(PM, pmAbi, 'checkPolicy', [NEVER_SEEN, tgt, sel]);
  rows.push({ target: lbl, sig, selector: sel, allowed, reason });
  console.log(' ', lbl.padEnd(9), sel, String(allowed).padEnd(5), reason.padEnd(32), sig);
}
for (let [lbl, a] of [['never-seen', NEVER_SEEN.toLowerCase()], ['Enable-Trading acct (first-op example)', '0x70e71875088B5c5605EFdE7B416Cfb3B32552648'], ['bot 0x5939', '0x5939F5f9e7b9eD593F13BdE2e6F94736925Cf779'], ['bot 0x623c', '0x623cabbae9f6f5ada9d64751de53248d14d5afa5'], ['market-maker-like 0x92E4', '0x92E49120859e0Ec8e2B59281fC3aA2B0cCe14232']]) {
  a = a.toLowerCase(); const unl = await call(PM, pmAbi, 'unlimitedAddresses', [a]);
  const rem = await call(PM, pmAbi, 'getRemainingDailyTxs', [a]);
  const used = await call(PM, pmAbi, 'getDailyUsage', [a]);
  console.log(' acct', lbl.padEnd(40), 'unlimited', unl, 'remainingToday', rem > 10n ** 30n ? 'MAX' : rem.toString(), 'usedToday', used.toString());
}
