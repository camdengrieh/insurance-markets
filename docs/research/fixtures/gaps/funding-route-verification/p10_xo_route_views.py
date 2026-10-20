import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://rpc-mainnet-2.xo.market"
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
def show(label, r):
    print("%-46s %s" % (label, r if isinstance(r, str) else json.dumps(r)[:300]))
def call(data, to=ROUTE):
    return lib.eth_call(RPC, to, data)
code = lib.rpc(RPC, "eth_getCode", [ROUTE, "latest"]).get("result", "")
print("route code bytes", (len(code)-2)//2, "codehash 0x"+lib.keccak256(bytes.fromhex(code[2:])).hex())
for s in ("0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103"):
    show("slot " + s[:10], lib.rpc(RPC, "eth_getStorageAt", [ROUTE, s, "latest"]).get("result"))
for v in ["localDomain()", "token()", "wrappedToken()", "mailbox()", "domains()", "owner()", "interchainSecurityModule()", "hook()",
          "feeHook()", "feeRecipient()", "feeToken()", "PACKAGE_VERSION()", "scaleNumerator()", "scaleDenominator()"]:
    show("route." + v, call(lib.selector(v)))
show("route.routers(8453)", call(lib.selector("routers(uint32)") + lib.enc_uint(8453)))
show("route.routers(3223)", call(lib.selector("routers(uint32)") + lib.enc_uint(3223)))
show("route.destinationGas(8453)", call(lib.selector("destinationGas(uint32)") + lib.enc_uint(8453)))
show("route.quoteGasPayment(8453)", call(lib.selector("quoteGasPayment(uint32)") + lib.enc_uint(8453)))
for amt in (1, 1_000_000, 100_000_000):
    d = lib.selector("quoteTransferRemote(uint32,bytes32,uint256)") + lib.enc_uint(8453) + lib.enc_uint(0xdead) + lib.enc_uint(amt)
    r = call(d)
    show("route.quoteTransferRemote(8453,dummy,%d)" % amt, r)
    if isinstance(r, str) and len(r) > 130:
        w = lib.dec_words(r); n = int(w[1], 16)
        for i in range(n):
            print("    quote[%d] token=%s amount=%d" % (i, lib.dec_addr(w[2+2*i]), int(w[3+2*i], 16)))
