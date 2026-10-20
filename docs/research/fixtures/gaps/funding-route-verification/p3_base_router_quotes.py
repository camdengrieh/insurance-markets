import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://mainnet.base.org"
ROUTER = "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
MAILBOX = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
XO_DOMAIN = 3223
DUMMY = "0x000000000000000000000000000000000000dead"  # placeholder recipient for quotes only

def show(label, r):
    print("%-48s %s" % (label, r if isinstance(r, str) else json.dumps(r)[:300]))

show("routers(3223)", lib.eth_call(RPC, ROUTER, lib.selector("routers(uint32)") + lib.enc_uint(XO_DOMAIN)))
show("routers(8453)", lib.eth_call(RPC, ROUTER, lib.selector("routers(uint32)") + lib.enc_uint(8453)))
show("destinationGas(3223)", lib.eth_call(RPC, ROUTER, lib.selector("destinationGas(uint32)") + lib.enc_uint(XO_DOMAIN)))
show("quoteGasPayment(3223)", lib.eth_call(RPC, ROUTER, lib.selector("quoteGasPayment(uint32)") + lib.enc_uint(XO_DOMAIN)))
for amt in (1, 1_000_000, 100_000_000, 10_000_000_000, 30_000_000_000):
    d = lib.selector("quoteTransferRemote(uint32,bytes32,uint256)") + lib.enc_uint(XO_DOMAIN) + lib.enc_b32(DUMMY.replace("0x","").rjust(64,"0")) + lib.enc_uint(amt)
    r = lib.eth_call(RPC, ROUTER, d)
    show("quoteTransferRemote(3223,dummy,%d)" % amt, r)
    if isinstance(r, str):
        w = lib.dec_words(r)
        # expected: offset, length, then (address,uint256) pairs
        n = int(w[1], 16)
        for i in range(n):
            tok = lib.dec_addr(w[2 + 2*i]); a = int(w[3 + 2*i], 16)
            print("    quote[%d] token=%s amount=%d" % (i, tok, a))
# USDC held by the router (collateral)
bal = lib.eth_call(RPC, USDC, lib.selector("balanceOf(address)") + lib.enc_addr(ROUTER))
show("USDC.balanceOf(router)", bal)
if isinstance(bal, str): print("    =", int(bal, 16) / 1e6, "USDC")
# mailbox views
for v in ["localDomain()", "owner()", "defaultHook()", "requiredHook()", "defaultIsm()", "nonce()", "latestDispatchedId()", "PACKAGE_VERSION()", "paused()"]:
    show("mailbox." + v, lib.eth_call(RPC, MAILBOX, lib.selector(v)))
