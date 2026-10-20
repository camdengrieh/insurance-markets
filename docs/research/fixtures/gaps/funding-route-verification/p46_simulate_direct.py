"""eth_call SIMULATION (state override, nothing is sent) of a direct Base transferRemote by a synthetic sender.
Proves: (1) the raw route is callable by any address with USDC + allowance, (2) msg.value must be 0.
Circle USDC FiatTokenV2_2 layout: balanceAndBlacklistStates at slot 9, allowed at slot 10."""
import sys, json
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
S = "0x2222222222222222222222222222222222222222"      # synthetic sender
RECIP_ADDR = "0x3333333333333333333333333333333333333333"  # synthetic XO-side recipient
def slot_map(addr, slot): return "0x" + lib.keccak256(bytes.fromhex(lib.enc_addr(addr) + lib.enc_uint(slot))).hex()
def slot_nested(owner, spender, slot):
    inner = lib.keccak256(bytes.fromhex(lib.enc_addr(owner) + lib.enc_uint(slot)))
    return "0x" + lib.keccak256(bytes.fromhex(lib.enc_addr(spender)) .rjust(32, b"\x00") + inner).hex()
# 1. validate slot 9 on a known holder (the router): storage word must equal its balance
w = lib.rpc(BASE, "eth_getStorageAt", [USDC, slot_map(ROUTER, 9), "latest"])["result"]
bal = int(lib.eth_call(BASE, USDC, lib.selector("balanceOf(address)") + lib.enc_addr(ROUTER)), 16)
print("slot9 check: storage", int(w, 16), "balanceOf", bal, "match", int(w, 16) == bal)
AMT = 5_000_000
bal_slot = slot_map(S, 9); alw_slot = slot_nested(S, ROUTER, 10)
ov = {USDC: {"stateDiff": {bal_slot: "0x" + lib.enc_uint(100_000_000), alw_slot: "0x" + lib.enc_uint(AMT)}}, S: {"balance": hex(10**18)}}
# 2. validate the override took effect via view calls
def call(to, data, value=None, override=ov):
    tx = {"from": S, "to": to, "data": data}
    if value is not None: tx["value"] = hex(value)
    j = lib.rpc(BASE, "eth_call", [tx, "latest", override])
    return j.get("result") if "result" in j else ("ERR", j.get("error") or j.get("_raw"))
print("allowance(S,router) with override:", call(USDC, lib.selector("allowance(address,address)") + lib.enc_addr(S) + lib.enc_addr(ROUTER)))
cd = lib.selector("transferRemote(uint32,bytes32,uint256)") + lib.enc_uint(3223) + lib.enc_addr(RECIP_ADDR) + lib.enc_uint(AMT)
print("transferRemote value=0   ->", call(ROUTER, cd, 0))
print("transferRemote value=1wei->", call(ROUTER, cd, 1))
