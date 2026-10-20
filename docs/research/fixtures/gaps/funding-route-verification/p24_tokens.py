import sys, json, time
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"; XO = "https://rpc-mainnet-2.xo.market"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
XOUSDC = "0x80c12230ce677e6f304027a14780edd2a829ab0c"
ROUTE = "0x9090463546d725f6ece5d1a4b27beb929d5d1983"
def u(r): return int(r, 16) if isinstance(r, str) else r
def s(r):
    try: return lib.dec_string(r)
    except Exception: return r
def a(r): return lib.to_checksum(lib.dec_addr(lib.dec_words(r)[0])) if isinstance(r, str) else r
print("--- value conservation")
bal = u(lib.eth_call(BASE, USDC, lib.selector("balanceOf(address)") + lib.enc_addr(ROUTER)))
sup = u(lib.eth_call(XO, XOUSDC, lib.selector("totalSupply()")))
print("Base router USDC balance raw", bal, " XO USDC.e totalSupply raw", sup, " diff(bal-supply)", bal - sup)
print("base nonce now", u(lib.eth_call(BASE, "0xfdd96df1b2d4354dbb1070815819db47469ca470", lib.selector("nonce()"))), "xo nonce now", u(lib.eth_call(XO, "0xfdd96df1b2d4354dbb1070815819db47469ca470", lib.selector("nonce()"))))
print("--- Circle USDC on Base", USDC)
IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
ADM = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"
# Circle's FiatTokenProxy uses legacy slots
LEG_IMPL = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"
LEG_ADM = "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b"
for n, sl in (("eip1967 impl", IMPL), ("eip1967 admin", ADM), ("legacy impl", LEG_IMPL), ("legacy admin", LEG_ADM)):
    print(" slot", n, lib.rpc(BASE, "eth_getStorageAt", [USDC, sl, "latest"]).get("result"))
for fn, dec in (("name()", s), ("symbol()", s), ("decimals()", u), ("version()", s), ("currency()", s), ("paused()", u), ("totalSupply()", u),
                ("owner()", a), ("masterMinter()", a), ("pauser()", a), ("blacklister()", a), ("rescuer()", a), ("admin()", a)):
    r = lib.eth_call(BASE, USDC, lib.selector(fn))
    print(" USDC %-14s %s" % (fn, dec(r) if isinstance(r, str) else r))
for who, addr in (("router", ROUTER), ("mailbox", "0xfdd96df1b2d4354dbb1070815819db47469ca470")):
    r = lib.eth_call(BASE, USDC, lib.selector("isBlacklisted(address)") + lib.enc_addr(addr))
    print(" USDC.isBlacklisted(%s) = %s" % (who, u(r) if isinstance(r, str) else r))
print("--- XO USDC.e", XOUSDC)
for n, sl in (("eip1967 impl", IMPL), ("eip1967 admin", ADM), ("legacy impl", LEG_IMPL), ("legacy admin", LEG_ADM)):
    print(" slot", n, lib.rpc(XO, "eth_getStorageAt", [XOUSDC, sl, "latest"]).get("result"))
for fn, dec in (("name()", s), ("symbol()", s), ("decimals()", u), ("version()", s), ("currency()", s), ("paused()", u),
                ("owner()", a), ("masterMinter()", a), ("pauser()", a), ("blacklister()", a), ("rescuer()", a)):
    r = lib.eth_call(XO, XOUSDC, lib.selector(fn))
    print(" USDC.e %-14s %s" % (fn, dec(r) if isinstance(r, str) else r))
for fn in ("isMinter(address)", "minterAllowance(address)", "isBlacklisted(address)"):
    r = lib.eth_call(XO, XOUSDC, lib.selector(fn) + lib.enc_addr(ROUTE))
    print(" USDC.e %s(route) = %s" % (fn, r))
