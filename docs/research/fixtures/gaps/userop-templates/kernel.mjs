// Kernel v3.x helpers + generic decoding of the call targets seen in XO UserOps. Offline.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const { decodeAbiParameters, decodeFunctionData, parseAbi, slice, size, hexToBigInt, toFunctionSelector, recoverAddress, hashMessage, getAddress } = viem;

export const KNOWN = {
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
  ctfExchange: '0x4bC5E872256D12E6017dfe466E04c867DC761B77',
  conditionalTokens: '0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909',
  usdce: '0x80c12230ce677e6f304027a14780Edd2A829ab0c',
  manager: '0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307',
  paymaster: '0x2353b23d8f329fd3cec0d21652f14208248a439d',
  ecdsaValidator: '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57',
  kernelFactory: '0xaac5d4240af87249b3f71bc8e4a2cae074a3e419',
  hyperlaneRoute: '0x9090463546d725F6eCE5D1A4B27beB929D5D1983',
};
const nameOf = (a) => { const l = a.toLowerCase(); for (const [k, v] of Object.entries(KNOWN)) if (v.toLowerCase() === l) return k; return null; };
export const labelAddr = (a) => { const n = nameOf(a); return n ? n : a.slice(0, 8) + '..' + a.slice(-4); };

export const CALL_ABI = parseAbi([
  'function approve(address spender, uint256 amount)',
  'function transfer(address to, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function createConvictionMarket(uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI)',
  'function respondToUpdateRequest(bytes32 conditionId, bool acceptUpdate)',
  'function cancelMarket(bytes32 conditionId)',
  'function transferRemote(uint32 destination, bytes32 recipient, uint256 amount) payable returns (bytes32)',
]);

// ---- Kernel v3 nonce: 1B mode | 1B validation type | 20B validator-or-permission id | 2B nonceKey | 8B sequence
export function decodeKernelNonce(n) {
  const seq = n & ((1n << 64n) - 1n);
  const key = (n >> 64n) & 0xffffn;
  const id = (n >> 80n) & ((1n << 160n) - 1n);
  const type = (n >> 240n) & 0xffn;
  const mode = (n >> 248n) & 0xffn;
  return { mode: '0x' + mode.toString(16).padStart(2, '0'), type: '0x' + type.toString(16).padStart(2, '0'), identifier: '0x' + id.toString(16).padStart(40, '0'), nonceKey: Number(key), sequence: seq };
}

function decodeInner(target, value, data) {
  const o = { target, data, targetLabel: labelAddr(target), value, selector: data.length >= 10 ? data.slice(0, 10) : '0x', dataLen: (data.length - 2) / 2 };
  try { const d = decodeFunctionData({ abi: CALL_ABI, data }); o.fn = d.functionName; o.args = d.args; } catch { o.fn = null; }
  return o;
}

// ---- Kernel callData = execute(bytes32 execMode, bytes executionCalldata) [ERC-7579]
export function decodeKernelCallData(cd) {
  const sel = cd.slice(0, 10);
  if (sel !== '0xe9ae5c53') return { selector: sel, note: 'not execute(bytes32,bytes)' };
  const [mode, exec] = decodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes' }], '0x' + cd.slice(10));
  const callType = slice(mode, 0, 1), execType = slice(mode, 1, 2), unused = slice(mode, 2, 6), modeSel = slice(mode, 6, 10), modePayload = slice(mode, 10, 32);
  const out = { selector: sel, mode, callType, execType, unused, modeSelector: modeSel, modePayload, calls: [] };
  if (callType === '0x00') {
    out.callTypeName = 'single';
    out.calls.push(decodeInner(slice(exec, 0, 20), hexToBigInt(slice(exec, 20, 52)), slice(exec, 52)));
  } else if (callType === '0x01') {
    out.callTypeName = 'batch';
    const [arr] = decodeAbiParameters([{ type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'callData', type: 'bytes' }] }], exec);
    for (const e of arr) out.calls.push(decodeInner(e.target, e.value, e.callData));
  } else if (callType === '0xff') {
    out.callTypeName = 'delegatecall';
    out.calls.push(decodeInner(slice(exec, 0, 20), 0n, slice(exec, 20)));
  } else out.callTypeName = 'unknown';
  out.execTypeName = execType === '0x00' ? 'default(revert)' : execType === '0x01' ? 'try' : 'unknown';
  return out;
}

// ---- KernelFactory.createAccount(bytes data, bytes32 salt); data = Kernel.initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)
export function decodeFactoryData(fd) {
  const f = parseAbi(['function createAccount(bytes data, bytes32 salt)']);
  const d = decodeFunctionData({ abi: f, data: fd });
  const [data, salt] = d.args;
  const init = parseAbi(['function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)']);
  const i = decodeFunctionData({ abi: init, data });
  const [rootValidator, hook, validatorData, hookData, initConfig] = i.args;
  return { factorySelector: fd.slice(0, 10), salt, initializeSelector: data.slice(0, 10), rootValidator, rootValidatorType: slice(rootValidator, 0, 1), rootValidatorAddress: '0x' + rootValidator.slice(4, 44), hook, validatorData, owner: size(validatorData) === 20 ? getAddress(validatorData) : null, hookData, initConfigLen: initConfig.length };
}

// ---- signature recovery: both candidate digests
export async function recoverBoth(userOpHash, signature) {
  const r = {};
  try { r.rawHash = await recoverAddress({ hash: userOpHash, signature }); } catch (e) { r.rawHash = 'ERR ' + e.shortMessage; }
  try { r.eip191 = await recoverAddress({ hash: hashMessage({ raw: userOpHash }), signature }); } catch (e) { r.eip191 = 'ERR ' + e.shortMessage; }
  return r;
}
