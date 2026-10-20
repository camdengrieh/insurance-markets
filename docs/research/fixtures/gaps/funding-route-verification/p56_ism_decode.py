"""Decode the MetaProxy ISM at 0xb429...b8ff: 54-byte clone prefix (impl address embedded), then abi.encode(address[] validators, uint8 threshold) and a 32-byte length trailer."""
import sys
sys.path.insert(0, '.')
import lib
code = lib.rpc("https://mainnet.base.org", "eth_getCode", ["0xb429f39836ec9bd6b0fedd999bf49991592bb8ff", "latest"])["result"]
b = bytes.fromhex(code[2:])
print("total bytes", len(b), "prefix length byte (PUSH1)", b[9])
impl = "0x" + b[21:41].hex()
print("logic (delegatecall target):", impl)
meta = b[54:-32]
w = [meta[k:k + 32] for k in range(0, len(meta), 32)]
off, thr, n = int.from_bytes(w[0], "big"), int.from_bytes(w[1], "big"), int.from_bytes(w[2], "big")
print("array offset", off, "threshold", thr, "validators", n, ["0x" + x[-20:].hex() for x in w[3:3 + n]], "trailer", int.from_bytes(b[-32:], "big"))
print("logic code bytes:", (len(lib.rpc("https://mainnet.base.org", "eth_getCode", [impl, "latest"])["result"]) - 2) // 2)
