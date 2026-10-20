import sys, json
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"; XO = "https://rpc-mainnet-2.xo.market"
def code(url, a):
    c = lib.rpc(url, "eth_getCode", [a, "latest"]).get("result", "0x")
    return c
ISM = "0xb429f39836ec9bd6b0fedd999bf49991592bb8ff"
c = code(BASE, ISM)
print("ISM(Base) code bytes", (len(c) - 2) // 2)
print("ISM code hex:", c)
cx = code(XO, ISM)
print("ISM(XO) code identical to Base:", cx == c)
# governance addresses
for chain, url, addrs in (("Base", BASE, {"router/mailbox owner": "0x9dc83f5947e5f86d9726d6484195f9dc4fdfc5d6", "router proxyadmin owner": "0xc0c87622761d6c606851662708e7c7547b4bca06"}),
                          ("XO", XO, {"route/mailbox/USDC.e owner": "0xf08239f9575b30133ee79a12df5b22238b554697", "USDC.e blacklister": "0xc0c87622761d6c606851662708e7c7547b4bca06", "route proxyadmin": "0x354fe196bd71629cdc637d17a414ddf5c2040ada"})):
    for k, a in addrs.items():
        cc = code(url, a)
        n = (len(cc) - 2) // 2
        line = "%s %-30s %s code_bytes=%d" % (chain, k, a, n)
        if n:
            line += " codehash=0x" + lib.keccak256(bytes.fromhex(cc[2:])).hex()[:16]
            for fn in ("getThreshold()", "VERSION()", "owner()"):
                r = lib.eth_call(url, a, lib.selector(fn))
                line += " | %s=%s" % (fn, r if isinstance(r, str) and len(r) < 140 else str(r)[:60])
        print(line)
