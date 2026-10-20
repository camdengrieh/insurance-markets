import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
def show(label, r):
    print("%-44s %s" % (label, r if isinstance(r, str) else json.dumps(r)[:300]))
r = lib.bs_call(H, ROUTE, lib.selector("localDomain()"))
show("route.localDomain()", r)
if isinstance(r, str) and r.startswith("0x"):
    for v in ["token()", "wrappedToken()", "mailbox()", "domains()", "owner()", "interchainSecurityModule()", "hook()",
              "feeHook()", "feeRecipient()", "feeToken()", "PACKAGE_VERSION()", "scaleNumerator()", "scaleDenominator()"]:
        show("route." + v, lib.bs_call(H, ROUTE, lib.selector(v)))
    show("route.routers(8453)", lib.bs_call(H, ROUTE, lib.selector("routers(uint32)") + lib.enc_uint(8453)))
    show("route.routers(3223)", lib.bs_call(H, ROUTE, lib.selector("routers(uint32)") + lib.enc_uint(3223)))
    show("route.destinationGas(8453)", lib.bs_call(H, ROUTE, lib.selector("destinationGas(uint32)") + lib.enc_uint(8453)))
    show("route.quoteGasPayment(8453)", lib.bs_call(H, ROUTE, lib.selector("quoteGasPayment(uint32)") + lib.enc_uint(8453)))
    for amt in (1, 1_000_000, 100_000_000):
        d = lib.selector("quoteTransferRemote(uint32,bytes32,uint256)") + lib.enc_uint(8453) + lib.enc_uint(0xdead) + lib.enc_uint(amt)
        r = lib.bs_call(H, ROUTE, d)
        show("route.quoteTransferRemote(8453,dummy,%d)" % amt, r)
        if isinstance(r, str) and len(r) > 130:
            w = lib.dec_words(r); n = int(w[1], 16)
            for i in range(n):
                print("    quote[%d] token=%s amount=%d" % (i, lib.dec_addr(w[2+2*i]), int(w[3+2*i], 16)))
