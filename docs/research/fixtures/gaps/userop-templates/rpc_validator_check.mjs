// Read-only semantic test of the deployed ECDSA validator (0x845A...) via eth_call with a spoofed `from` = the Kernel account.
// No signature is created: we only re-use signatures that already exist on chain.
//  (a) validateUserOp(op, userOpHash)                       -> 0 expected (the signature is EIP-191-prefixed)
//  (b) validateUserOp(op, hashMessage(raw: userOpHash))     -> 0 iff the deployed code ALSO accepts a RAW (unprefixed) signature over the digest it is given
//  (c) validateUserOp(op, random hash)                      -> 1 expected (control)
//  (d) (a) but from = a different account                    -> 1 expected (control: owner is per-account)
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rpc, result } from './rpcclient.mjs';
import { decodeTx, userOpHashV07 } from './decode_handleops.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const viemDir = process.env.VIEM_DIR || join(here, '../../../../../node_modules/viem');
const viem = await import(pathToFileURL(join(viemDir, '_esm/index.js')).href);
const { encodeFunctionData, parseAbi, hashMessage, keccak256, toHex, hexToBigInt } = viem;
const U = process.env.XO_RPC_URL || 'https://rpc-mainnet-2.xo.market';
const VALIDATOR = '0x845ADb2C711129d4f3966735eD98a9F09fC4cE57';
const abi = parseAbi(['function validateUserOp((address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp, bytes32 userOpHash) payable returns (uint256)']);
const tx = process.argv[2];
const op = decodeTx(tx).ops[0];
const uh = userOpHashV07(op);
const packed = { sender: op.sender, nonce: op.nonce, initCode: op.initCode, callData: op.callData, accountGasLimits: op.accountGasLimits, preVerificationGas: op.preVerificationGas, gasFees: op.gasFees, paymasterAndData: op.paymasterAndData, signature: op.signature };
const run = async (from, hash) => {
  const o = await rpc(U, 'eth_call', [{ from, to: VALIDATOR, data: encodeFunctionData({ abi, functionName: 'validateUserOp', args: [packed, hash] }) }, 'latest']);
  if (o.body?.error) return 'ERR ' + JSON.stringify(o.body.error).slice(0, 160);
  return hexToBigInt(o.body.result).toString();
};
console.log('tx', tx.slice(0, 14), 'sender', op.sender.slice(0, 8) + '..');
console.log(' (a) correct userOpHash, from=sender            ->', await run(op.sender, uh), '(0 = valid, 1 = SIG_VALIDATION_FAILED)');
console.log(' (b) digest = hashMessage(raw:userOpHash)        ->', await run(op.sender, hashMessage({ raw: uh })), '(0 means the deployed validator also accepts a raw, unprefixed signature)');
console.log(' (c) random hash                                 ->', await run(op.sender, keccak256(toHex('xo-control-1'))));
console.log(' (d) from=other account (validator storage empty)->', await run('0x7777777777777777777777777777777777777777', uh));
