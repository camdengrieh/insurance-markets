import sys, json
sys.path.insert(0, '.')
import lib
BASE = "https://mainnet.base.org"
IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
MB = "0xfdd96df1b2d4354dbb1070815819db47469ca470"
mb_impl = lib.rpc(BASE, "eth_getStorageAt", [MB, IMPL_SLOT, "latest"]).get("result")
print("mailbox impl slot", mb_impl)
for label, a in (("router impl", "0x5b3f32417d651d47ebaeb079e8cf28b479b0926a"), ("router proxy", "0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f")):
    st, t = lib.http("https://sourcify.dev/server/v2/contract/8453/" + a + "?fields=match,creationMatch,runtimeMatch,compilation,verifiedAt")
    print(label, st, t[:600])
