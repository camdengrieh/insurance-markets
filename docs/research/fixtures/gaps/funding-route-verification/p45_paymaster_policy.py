import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
PM = "0x2353b23d8f329fd3cec0d21652f14208248a439d"
ROUTE = "0x9090463546d725f6ece5d1a4b27beb929d5d1983"
USDCE = "0x80c12230ce677e6f304027a14780edd2a829ab0c"
WRAP = "0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9"
DUMMY = "0x1111111111111111111111111111111111111111"   # synthetic account for a pure view
def sel(s): return lib.selector(s)
def check(target, s):
    data = sel("checkPolicy(address,address,bytes4)") + lib.enc_addr(DUMMY) + lib.enc_addr(target) + lib.enc_b32(sel(s))
    r = lib.eth_call(XO, PM, data)
    if not isinstance(r, str): return r
    w = lib.dec_words(r)
    ok = int(w[0], 16)
    try: msg = bytes.fromhex(r[2:][int(w[1], 16) * 2 + 64: int(w[1], 16) * 2 + 64 + int(r[2:][int(w[1], 16) * 2: int(w[1], 16) * 2 + 64], 16) * 2]).decode()
    except Exception: msg = ""
    return (ok, msg)
tests = [("route.transferRemote(uint32,bytes32,uint256)", ROUTE, "transferRemote(uint32,bytes32,uint256)"),
         ("USDC.e.approve(address,uint256)", USDCE, "approve(address,uint256)"),
         ("USDC.e.transfer(address,uint256)", USDCE, "transfer(address,uint256)"),
         ("route.approve? (control: unknown selector)", ROUTE, "foo()"),
         ("executor.0x3a022aa7 (raw selector)", WRAP, None)]
for label, tgt, s in tests:
    if s is None:
        data = sel("checkPolicy(address,address,bytes4)") + lib.enc_addr(DUMMY) + lib.enc_addr(tgt) + lib.enc_b32("0x3a022aa7")
        r = lib.eth_call(XO, PM, data); print(label, r[:66] if isinstance(r, str) else r, "ok=", int(lib.dec_words(r)[0], 16) if isinstance(r, str) else None)
    else:
        print(label, check(tgt, s))
print("paused()", lib.eth_call(XO, PM, sel("paused()")))
print("dailyTxLimit()", int(lib.eth_call(XO, PM, sel("dailyTxLimit()")), 16))
print("getDeposit() wei", int(lib.eth_call(XO, PM, sel("getDeposit()")), 16))
print("whitelistedContracts(route)", lib.eth_call(XO, PM, sel("whitelistedContracts(address)") + lib.enc_addr(ROUTE)))
print("globallyAllowedSelectors(transferRemote)", lib.eth_call(XO, PM, sel("globallyAllowedSelectors(bytes4)") + lib.enc_b32(sel("transferRemote(uint32,bytes32,uint256)"))))
print("owner()", lib.eth_call(XO, PM, sel("owner()")))
