// On-chain cross-checks via eth_call on XO's RPC host (keyless; read methods only).
//  1) EntryPoint.getUserOpHash(op) == locally recomputed userOpHash == UserOperationEvent hash
//  2) EntryPoint.getNonce(sender, key) vs the nonce used in the real op
//  3) KernelFactory.getAddress(data, salt) / CREATE2 derivation == real sender
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rpc, result } from './rpcclient.mjs';
import { decodeTx, userOpHashV07 } from './decode_handleops.mjs';
import { decodeFactoryData } from './kernel.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const aa = await import(pathToFileURL(join(viemDir, '_esm/account-abstraction/index.js')).href);
const { encodeFunctionData, decodeFunctionResult, parseAbi, keccak256, encodePacked, getContractAddress } = viem;
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const EP = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const call = async (to, abi, fn, args) => decodeFunctionResult({ abi, functionName: fn, data: result(await rpc(U, 'eth_call', [{ to, data: encodeFunctionData({ abi, functionName: fn, args }) }, 'latest'])) });

const tx = process.argv[2];
const d = decodeTx(tx);
const op = d.ops[0];
const local = userOpHashV07(op);
const onchain = await call(EP, aa.entryPoint07Abi, 'getUserOpHash', [{ sender: op.sender, nonce: op.nonce, initCode: op.initCode, callData: op.callData, accountGasLimits: op.accountGasLimits, preVerificationGas: op.preVerificationGas, gasFees: op.gasFees, paymasterAndData: op.paymasterAndData, signature: op.signature }]);
console.log('tx', tx);
console.log(' local userOpHash   ', local);
console.log(' EntryPoint.getUserOpHash', onchain, onchain.toLowerCase() === local.toLowerCase() ? 'MATCH' : 'MISMATCH');
console.log(' event userOpHash   ', d.events[0]?.userOpHash);
const key = op.nonce >> 64n;
const nextNonce = await call(EP, aa.entryPoint07Abi, 'getNonce', [op.sender, key]);
console.log(' op nonce', op.nonce.toString(16), ' EntryPoint.getNonce(sender,key) now =', nextNonce.toString(16), '(seq now', (nextNonce & ((1n << 64n) - 1n)).toString(), ')');
if (op.factory) {
  const fd = decodeFactoryData(op.factoryData);
  const factoryAbi = parseAbi(['function getAddress(bytes data, bytes32 salt) view returns (address)', 'function implementation() view returns (address)']);
  const data = viem.decodeFunctionData({ abi: parseAbi(['function createAccount(bytes data, bytes32 salt)']), data: op.factoryData }).args[0];
  const onchainAddr = await call(op.factory, factoryAbi, 'getAddress', [data, fd.salt]);
  const impl = await call(op.factory, factoryAbi, 'implementation', []);
  const actualSalt = keccak256(encodePacked(['bytes', 'bytes32'], [data, fd.salt]));
  const INIT_CODE_HASH = '0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6'; // zerodevapp/sdk constants, Kernel 0.3.1
  const create2 = getContractAddress({ opcode: 'CREATE2', from: op.factory, salt: actualSalt, bytecodeHash: INIT_CODE_HASH });
  console.log(' factory.getAddress(data,salt)', onchainAddr, '| CREATE2(initCodeHash) offline', create2, '| sender', op.sender, '| factory.implementation()', impl);
  console.log('  all equal:', [onchainAddr, create2, op.sender].every(a => a.toLowerCase() === op.sender.toLowerCase()));
}
