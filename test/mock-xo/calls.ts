// Reading a Kernel UserOp's callData the way the mock needs it: which calls does it make? execute(bytes32,bytes) in
// single mode carries target (20) ++ value (32) ++ data; batch mode carries abi.encode((address,uint256,bytes)[]).
// Written here, with viem, and not taken from src/xo/userop, so the mock reads a UserOp independently of the
// code that builds it.

import { decodeAbiParameters, decodeFunctionData, getAddress, parseAbi, size, slice, type Address, type Hex } from "viem";

const EXECUTE_ABI = parseAbi(["function execute(bytes32 execMode, bytes executionCalldata)"]);

export interface DecodedCall {
  readonly target: Address;
  readonly value: bigint;
  readonly data: Hex;
}

export function decodeKernelCalls(callData: Hex): DecodedCall[] | null {
  try {
    const decoded = decodeFunctionData({ abi: EXECUTE_ABI, data: callData });
    const [mode, payload] = decoded.args as readonly [Hex, Hex];
    const kind = mode.slice(2, 4);
    if (kind === "00") {
      if (size(payload) < 52) return null;
      return [{ target: getAddress(slice(payload, 0, 20)), value: BigInt(slice(payload, 20, 52)), data: slice(payload, 52) }];
    }
    if (kind === "01") {
      const [tuples] = decodeAbiParameters(
        [{ type: "tuple[]", components: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "callData", type: "bytes" }] }],
        payload,
      );
      return tuples.map((tuple) => ({ target: getAddress(tuple.target), value: tuple.value, data: tuple.callData }));
    }
    return null;
  } catch {
    return null;
  }
}

export const selectorOf = (data: Hex): Hex => (size(data) >= 4 ? slice(data, 0, 4) : "0x");
