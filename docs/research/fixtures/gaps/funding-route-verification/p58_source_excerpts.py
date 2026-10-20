"""Offline: print the load-bearing source excerpts from the Sourcify JSON saved by p28/p29 (router impl, Mailbox impl, MerkleTreeHook)."""
import json, re
def src(j, path):
    s = j["sources"][path]
    return s["content"] if isinstance(s, dict) else s
r = json.load(open("data/sourcify_router_impl.json"))
t = src(r, "contracts/token/libs/TokenRouter.sol")
i = t.index("function _transferRemote"); print(t[i:i + 1100]); print("-----")
i = t.index("function _calculateFeesAndCharge"); print(t[i:i + 1900]); print("-----")
print(src(r, "contracts/libs/TypeCasts.sol")[src(r, "contracts/libs/TypeCasts.sol").index("function bytes32ToAddress") - 40:][:260]); print("-----")
m = json.load(open("data/sourcify_mailbox_impl.json"))
mt = src(m, "contracts/Mailbox.sol")
for k in re.finditer(r"function dispatch\(", mt):
    seg = mt[k.start():k.start() + 220]
    if "IPostDispatchHook hook" in seg or "IPostDispatchHook" in seg:
        print(mt[k.start():k.start() + 1800]); break
print("-----")
h = json.load(open("data/sourcify_merkle_hook.json"))
ht = src(h, "contracts/hooks/MerkleTreeHook.sol")
i = ht.index("function _postDispatch"); print(ht[i - 60:i + 700])
