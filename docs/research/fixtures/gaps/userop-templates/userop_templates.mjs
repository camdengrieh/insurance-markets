// UserOperation TEMPLATE BUILDER for XO chain 3223 (ERC-4337 v0.7, Kernel v3.1 account, ZeroDev ECDSA validator).
// Pure functions, no network, no signing: it produces the unsigned packed UserOp, its userOpHash and the bytes the owner must sign.
// Verified byte-for-byte against real on-chain operations by test_templates.mjs.
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const { concat, encodeAbiParameters, encodeFunctionData, encodePacked, keccak256, numberToHex, pad, parseAbi, toHex, hashMessage, getContractAddress, maxUint256 } = viem;

export const CHAIN_ID = 3223n;
export const ADDR = {
  entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',     // v0.7, code present on chain 3223 (eth_getCode 16,035 bytes)
  kernelFactory: '0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419',  // ZeroDev KernelFactory for Kernel 0.3.1
  kernelImpl: '0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D',     // Kernel 0.3.1 implementation (ERC-1967 proxies point here)
  ecdsaValidator: '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57', // ZeroDev ECDSAValidator (>= 0.3.1)
  paymaster: '0x2353b23d8F329fD3cec0D21652f14208248A439D',      // XO PolicyPaymaster (verified source)
  usdce: '0x80c12230ce677e6f304027a14780Edd2A829ab0c',
  conditionalTokens: '0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909',
  ctfExchange: '0x4bC5E872256D12E6017dfe466E04c867DC761B77',
  convictionManager: '0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307',
};
export const KERNEL_031_INIT_CODE_HASH = '0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6'; // zerodevapp/sdk constants
export const ZERO32 = '0x' + '00'.repeat(32);

// ---------- account ----------
const kernelInitAbi = parseAbi(['function initialize(bytes21 _rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)']);
const factoryAbi = parseAbi(['function createAccount(bytes data, bytes32 salt) payable returns (address)']);
export function kernelInitData(owner) {
  // rootValidator = 0x01 (VALIDATION_TYPE_VALIDATOR) || ecdsaValidator ; hook = address(0) (normalised to address(1) by Kernel) ; validatorData = 20-byte owner
  return encodeFunctionData({ abi: kernelInitAbi, functionName: 'initialize', args: [concat(['0x01', ADDR.ecdsaValidator]), '0x0000000000000000000000000000000000000000', owner, '0x', []] });
}
export function buildInitCode(owner, salt = ZERO32) {
  return concat([ADDR.kernelFactory, encodeFunctionData({ abi: factoryAbi, functionName: 'createAccount', args: [kernelInitData(owner), salt] })]);
}
export function counterfactualAddress(owner, salt = ZERO32) {
  const actualSalt = keccak256(encodePacked(['bytes', 'bytes32'], [kernelInitData(owner), salt]));
  return getContractAddress({ opcode: 'CREATE2', from: ADDR.kernelFactory, salt: actualSalt, bytecodeHash: KERNEL_031_INIT_CODE_HASH });
}

// ---------- nonce: 1B mode | 1B type | 20B identifier | 2B nonceKey | 8B sequence ----------
export function kernelNonce(sequence, { mode = 0, type = 0, identifier = ADDR.ecdsaValidator, nonceKey = 0 } = {}) {
  return (BigInt(mode) << 248n) | (BigInt(type) << 240n) | (BigInt(identifier) << 80n) | (BigInt(nonceKey) << 64n) | BigInt(sequence);
}
// EntryPoint.getNonce(sender, key) takes the upper 192 bits as `key`; the returned value is the full nonce to put in the UserOp.
export const nonceKeyOf = (nonce) => nonce >> 64n;

// ---------- callData: Kernel.execute(bytes32 execMode, bytes executionCalldata)  (ERC-7579) ----------
export const EXEC_SELECTOR = '0xe9ae5c53';
export const MODE_SINGLE = '0x' + '00'.repeat(32);                 // callType 0x00 | execType 0x00 | 4B unused | 4B modeSelector | 22B payload
export const MODE_BATCH = '0x01' + '00'.repeat(31);                 // callType 0x01
const execAbi = parseAbi(['function execute(bytes32 execMode, bytes executionCalldata)']);
export function encodeExecuteSingle({ to, value = 0n, data = '0x' }) {
  return encodeFunctionData({ abi: execAbi, functionName: 'execute', args: [MODE_SINGLE, encodePacked(['address', 'uint256', 'bytes'], [to, value, data])] });
}
export function encodeExecuteBatch(calls) {
  const exec = encodeAbiParameters([{ type: 'tuple[]', components: [{ name: 'target', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'callData', type: 'bytes' }] }], [calls.map(c => ({ target: c.to, value: c.value ?? 0n, callData: c.data ?? '0x' }))]);
  return encodeFunctionData({ abi: execAbi, functionName: 'execute', args: [MODE_BATCH, exec] });
}
export const encodeExecute = (calls) => (calls.length === 1 ? encodeExecuteSingle(calls[0]) : encodeExecuteBatch(calls));

// ---------- inner calls per action ----------
const erc20 = parseAbi(['function approve(address spender, uint256 amount)', 'function transfer(address to, uint256 amount)']);
const ctf = parseAbi([
  'function setApprovalForAll(address operator, bool approved)',
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
]);
const mgr = parseAbi(['function createConvictionMarket(uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI)', 'function respondToUpdateRequest(bytes32 conditionId, bool acceptUpdate)', 'function cancelMarket(bytes32 conditionId)']);
export const calls = {
  // Enable Trading exactly as XO's app does it: unlimited USDC.e approval + ERC-1155 operator approval, both to the CTF Exchange.
  enableTrading: ({ allowance = maxUint256 } = {}) => [
    { to: ADDR.usdce, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [ADDR.ctfExchange, allowance] }) },
    { to: ADDR.conditionalTokens, data: encodeFunctionData({ abi: ctf, functionName: 'setApprovalForAll', args: [ADDR.ctfExchange, true] }) },
  ],
  redeem: (conditionIds, indexSets = [1n, 2n]) => conditionIds.map(id => ({ to: ADDR.conditionalTokens, data: encodeFunctionData({ abi: ctf, functionName: 'redeemPositions', args: [ADDR.usdce, ZERO32, id, indexSets] }) })),
  split: (conditionId, amount, partition = [1n, 2n]) => [{ to: ADDR.conditionalTokens, data: encodeFunctionData({ abi: ctf, functionName: 'splitPosition', args: [ADDR.usdce, ZERO32, conditionId, partition, amount] }) }],
  merge: (conditionId, amount, partition = [1n, 2n]) => [{ to: ADDR.conditionalTokens, data: encodeFunctionData({ abi: ctf, functionName: 'mergePositions', args: [ADDR.usdce, ZERO32, conditionId, partition, amount] }) }],
  // Creation: fee approval to the manager (XO uses unlimited; the fee is 1_000_000 raw = $1.00) then the public createConvictionMarket.
  createConvictionMarket: ({ startsAt, expiresAt, metaDataURI, allowance = maxUint256 }) => [
    { to: ADDR.usdce, data: encodeFunctionData({ abi: erc20, functionName: 'approve', args: [ADDR.convictionManager, allowance] }) },
    { to: ADDR.convictionManager, data: encodeFunctionData({ abi: mgr, functionName: 'createConvictionMarket', args: [startsAt, expiresAt, ADDR.usdce, metaDataURI] }) },
  ],
  respondToUpdateRequest: (conditionId, accept) => [{ to: ADDR.convictionManager, data: encodeFunctionData({ abi: mgr, functionName: 'respondToUpdateRequest', args: [conditionId, accept] }) }],
  cancelMarket: (conditionId) => [{ to: ADDR.convictionManager, data: encodeFunctionData({ abi: mgr, functionName: 'cancelMarket', args: [conditionId] }) }],
  usdcTransfer: (to, amount) => [{ to: ADDR.usdce, data: encodeFunctionData({ abi: erc20, functionName: 'transfer', args: [to, amount] }) }],
};

// ---------- packing (EntryPoint v0.7 PackedUserOperation) ----------
export const packU128Pair = (hi, lo) => concat([pad(numberToHex(hi), { size: 16 }), pad(numberToHex(lo), { size: 16 })]);
export function paymasterAndData({ paymaster = ADDR.paymaster, verificationGasLimit, postOpGasLimit, data = '0x' }) {
  return concat([paymaster, pad(numberToHex(verificationGasLimit), { size: 16 }), pad(numberToHex(postOpGasLimit), { size: 16 }), data]);
}
// Observed defaults (see notes 21): fee fields are zero; XO's bundler accepts maxFeePerGas = maxPriorityFeePerGas = 0.
export const GAS_DEFAULTS = {
  enableTradingFirstOp: { verificationGasLimit: 297342n, callGasLimit: 74916n, preVerificationGas: 56214n, paymasterVerificationGasLimit: 40262n, paymasterPostOpGasLimit: 26478n },
  redeemSingle: { verificationGasLimit: 87869n, callGasLimit: 126186n, preVerificationGas: 51195n, paymasterVerificationGasLimit: 40262n, paymasterPostOpGasLimit: 26478n },
  createConviction: { verificationGasLimit: 105442n, callGasLimit: 1056696n, preVerificationGas: 55814n, paymasterVerificationGasLimit: 40262n, paymasterPostOpGasLimit: 26478n },
};
export function packUserOp({ sender, nonce, initCode = '0x', callData, verificationGasLimit, callGasLimit, preVerificationGas, maxPriorityFeePerGas = 0n, maxFeePerGas = 0n, paymasterVerificationGasLimit, paymasterPostOpGasLimit, usePaymaster = true, signature = '0x' }) {
  return {
    sender, nonce, initCode, callData,
    accountGasLimits: packU128Pair(verificationGasLimit, callGasLimit),
    preVerificationGas,
    gasFees: packU128Pair(maxPriorityFeePerGas, maxFeePerGas),
    paymasterAndData: usePaymaster ? paymasterAndData({ verificationGasLimit: paymasterVerificationGasLimit, postOpGasLimit: paymasterPostOpGasLimit }) : '0x',
    signature,
  };
}
// userOpHash for EntryPoint v0.7 = keccak256(abi.encode(keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData), accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData))), entryPoint, chainId))
export function userOpHash(op, entryPoint = ADDR.entryPoint, chainId = CHAIN_ID) {
  const inner = keccak256(encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes32' }, { type: 'bytes32' }],
    [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData), op.accountGasLimits, op.preVerificationGas, op.gasFees, keccak256(op.paymasterAndData)]));
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }], [inner, entryPoint, chainId]));
}
// What the owner signs. Both are accepted by the deployed validator (see rpc_validator_check.mjs):
//   rawDigest  -> PayBox `raw` intent (sign the 32-byte digest as-is), recovered directly against userOpHash
//   eip191     -> what XO's own app does (personal_sign over the 32 raw bytes): digest = hashMessage({raw: userOpHash})
export const signingDigests = (hash) => ({ rawDigest: hash, eip191Digest: hashMessage({ raw: hash }) });
// 65-byte signature = r || s || v with v in {27, 28}; no mode prefix (Kernel v3 takes the mode from the nonce, not the signature).
export const assembleSignature = ({ r, s, recoveryId }) => concat([r, s, toHex(27 + Number(recoveryId), { size: 1 })]);

// ---------- JSON-RPC (eth_sendUserOperation, EntryPoint v0.7 "unpacked" shape) ----------
export function toRpcUserOperation(op, parts) {
  const hex = (v) => numberToHex(v);
  const o = {
    sender: op.sender, nonce: hex(op.nonce), callData: op.callData,
    callGasLimit: hex(parts.callGasLimit), verificationGasLimit: hex(parts.verificationGasLimit), preVerificationGas: hex(op.preVerificationGas),
    maxFeePerGas: hex(parts.maxFeePerGas ?? 0n), maxPriorityFeePerGas: hex(parts.maxPriorityFeePerGas ?? 0n), signature: op.signature,
  };
  if (op.initCode !== '0x') { o.factory = op.initCode.slice(0, 42); o.factoryData = '0x' + op.initCode.slice(42); }
  if (op.paymasterAndData !== '0x') {
    o.paymaster = op.paymasterAndData.slice(0, 42);
    o.paymasterVerificationGasLimit = hex(BigInt('0x' + op.paymasterAndData.slice(42, 74)));
    o.paymasterPostOpGasLimit = hex(BigInt('0x' + op.paymasterAndData.slice(74, 106)));
    o.paymasterData = '0x' + op.paymasterAndData.slice(106);
  }
  return o;
}
