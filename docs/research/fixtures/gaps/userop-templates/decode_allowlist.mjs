// Net PolicyPaymaster allowlist reconstructed from event logs (offline; reads paymaster_logs.json + abi/*.json).
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const { toFunctionSelector, formatAbiItem, parseAbi } = viem;
const dict = {};
const add = (item, src) => { if (item.type !== 'function') return; try { const sel = toFunctionSelector(item); (dict[sel] ||= new Set()).add(`${item.name}(${item.inputs.map(i => i.type).join(',')}) [${src}]`); } catch {} };
for (const f of readdirSync(join(here, 'abi')).filter(f => f.endsWith('.json'))) for (const it of JSON.parse(readFileSync(join(here, 'abi', f), 'utf8'))) add(it, f.replace('.abi.json', ''));
// Gnosis ConditionalTokens (unverified on the explorer): standard ERC-1155 + CTF functions, written out by hand.
for (const s of ['prepareCondition(address,bytes32,uint256)', 'reportPayouts(bytes32,uint256[])', 'splitPosition(address,bytes32,bytes32,uint256[],uint256)', 'mergePositions(address,bytes32,bytes32,uint256[],uint256)', 'redeemPositions(address,bytes32,bytes32,uint256[])', 'setApprovalForAll(address,bool)', 'safeTransferFrom(address,address,uint256,uint256,bytes)', 'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)']) (dict[toFunctionSelector(s)] ||= new Set()).add(s + ' [CTF std]');
for (const s of ['approve(address,uint256)', 'transfer(address,uint256)', 'transferFrom(address,address,uint256)', 'permit(address,address,uint256,uint256,uint8,bytes32,bytes32)', 'increaseAllowance(address,uint256)', 'decreaseAllowance(address,uint256)']) (dict[toFunctionSelector(s)] ||= new Set()).add(s + ' [ERC20 std]');
const L = JSON.parse(readFileSync(join(here, 'paymaster_logs.json'), 'utf8'));
const name = (sel) => dict[sel] ? [...dict[sel]].join(' | ') : '(unidentified)';
const global = new Map();
for (const l of L.GlobalSelectorAllowed) global.set(l.topics[1].slice(0, 10), { status: BigInt(l.data) === 1n, block: l.block });
const per = new Map();
for (const l of L.SelectorAllowed) per.set(('0x' + l.topics[1].slice(26)) + ' ' + l.topics[2].slice(0, 10), { status: BigInt(l.data) === 1n, block: l.block });
console.log('GLOBAL selectors currently allowed (any target):');
for (const [s, v] of [...global].sort((a, b) => a[1].block - b[1].block)) console.log(' ', v.status ? 'ALLOW' : 'deny ', s, 'block', v.block, name(s));
console.log('PER-TARGET selectors currently allowed:');
const byT = {};
for (const [k, v] of per) { const [t, s] = k.split(' '); (byT[t] ||= []).push([s, v]); }
for (const [t, arr] of Object.entries(byT)) { console.log(' target', t); for (const [s, v] of arr) console.log('   ', v.status ? 'ALLOW' : 'deny ', s, 'block', v.block, name(s)); }
console.log('DailyTxLimitUpdated:', L.DailyTxLimitUpdated.map(l => `block ${l.block}: ${BigInt('0x' + l.data.slice(2, 66))} -> ${BigInt('0x' + l.data.slice(66, 130))}`));
console.log('OwnershipTransferred:', L.OwnershipTransferred.map(l => `block ${l.block}: ${'0x' + l.topics[1].slice(26)} -> ${'0x' + l.topics[2].slice(26)}`));
console.log('ContractWhitelisted events:', L.ContractWhitelisted.length, ' UnlimitedAddressSet events:', L.UnlimitedAddressSet.length, ' Paused events:', L.Paused.length, ' Unpaused events:', L.Unpaused.length);
