import sys, json
sys.path.insert(0, '.')
import lib
RPC = "https://mainnet.base.org"
def show(label, r):
    print("%-44s %s" % (label, r if isinstance(r, str) else json.dumps(r)[:300]))
addrs = {
 "router_proxy": "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f",
 "router_impl": "0x5b3f32417d651d47ebaeb079e8cf28b479b0926a",
 "proxy_admin": "0x980d5952bfab70cf260718cba5c44072f0f3fc06",
 "owner(router+mailbox)": "0x9dc83f5947e5f86d9726d6484195f9dc4fdfc5d6",
 "mailbox": "0xfdd96df1b2d4354dbb1070815819db47469ca470",
 "ism": "0xb429f39836ec9bd6b0fedd999bf49991592bb8ff",
 "hook": "0xf9a84a5e63e7335d44e132775b1244462e08e449",
}
for k, a in addrs.items():
    c = lib.rpc(RPC, "eth_getCode", [a, "latest"]).get("result", "")
    n = (len(c) - 2) // 2
    print("%-24s %s code_bytes=%d codehash=%s" % (k, a, n, ("0x" + lib.keccak256(bytes.fromhex(c[2:])).hex()) if n else "-"))
# proxy admin owner, hook type, ism type
show("proxy_admin.owner()", lib.eth_call(RPC, addrs["proxy_admin"], lib.selector("owner()")))
show("hook.hookType()", lib.eth_call(RPC, addrs["hook"], lib.selector("hookType()")))
show("hook.PACKAGE_VERSION()", lib.eth_call(RPC, addrs["hook"], lib.selector("PACKAGE_VERSION()")))
show("ism.moduleType()", lib.eth_call(RPC, addrs["ism"], lib.selector("moduleType()")))
show("ism.owner()", lib.eth_call(RPC, addrs["ism"], lib.selector("owner()")))
show("ism.threshold()", lib.eth_call(RPC, addrs["ism"], lib.selector("threshold()")))
show("ism.validators()", lib.eth_call(RPC, addrs["ism"], lib.selector("validators()")))
show("ism.PACKAGE_VERSION()", lib.eth_call(RPC, addrs["ism"], lib.selector("PACKAGE_VERSION()")))
show("impl.PACKAGE_VERSION()", lib.eth_call(RPC, addrs["router_impl"], lib.selector("PACKAGE_VERSION()")))
# hook quoteDispatch with empty metadata/message not feasible without a message; try router's quoteGasPayment via hook handled above
