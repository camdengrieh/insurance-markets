"""Tiny EVM disassembler (stdlib) used to read a 217-byte proxy's control flow."""
import sys, json
OPS = {0x00:"STOP",0x01:"ADD",0x02:"MUL",0x03:"SUB",0x04:"DIV",0x10:"LT",0x11:"GT",0x14:"EQ",0x15:"ISZERO",0x16:"AND",0x17:"OR",0x18:"XOR",0x19:"NOT",0x1b:"SHL",0x1c:"SHR",0x20:"KECCAK256",
0x30:"ADDRESS",0x32:"ORIGIN",0x33:"CALLER",0x34:"CALLVALUE",0x35:"CALLDATALOAD",0x36:"CALLDATASIZE",0x37:"CALLDATACOPY",0x38:"CODESIZE",0x39:"CODECOPY",0x3d:"RETURNDATASIZE",0x3e:"RETURNDATACOPY",
0x50:"POP",0x51:"MLOAD",0x52:"MSTORE",0x54:"SLOAD",0x55:"SSTORE",0x56:"JUMP",0x57:"JUMPI",0x58:"PC",0x5b:"JUMPDEST",0x5f:"PUSH0",0xf3:"RETURN",0xf4:"DELEGATECALL",0xfa:"STATICCALL",0xf1:"CALL",0xfd:"REVERT",0xfe:"INVALID",0x5a:"GAS"}
for i in range(1, 33): OPS[0x5f + i] = "PUSH%d" % i
for i in range(1, 17): OPS[0x7f + i] = "DUP%d" % i; OPS[0x8f + i] = "SWAP%d" % i
code = bytes.fromhex(open(sys.argv[1]).read().strip()[2:])
i = 0
while i < len(code):
    op = code[i]; name = OPS.get(op, "OP_%02x" % op)
    if 0x60 <= op <= 0x7f:
        n = op - 0x5f; print("%04x %s 0x%s" % (i, name, code[i+1:i+1+n].hex())); i += 1 + n
    else:
        print("%04x %s" % (i, name)); i += 1
        if op in (0xfd, 0xf3, 0xfe) and i > 150: break
