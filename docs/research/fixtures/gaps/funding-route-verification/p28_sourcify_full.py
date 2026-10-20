import sys, json
sys.path.insert(0, '.')
import lib
a = "0x5b3f32417d651d47ebaeb079e8cf28b479b0926a"
st, t = lib.http("https://sourcify.dev/server/v2/contract/8453/" + a + "?fields=all")
print(st, len(t))
try:
    j = json.loads(t)
except Exception:
    print(t[:400]); raise SystemExit
json.dump(j, open("data/sourcify_router_impl.json", "w"))
print("keys", list(j.keys()))
comp = j.get("compilation", {})
print("compilation", json.dumps({k: comp[k] for k in comp if k != "compilerSettings"})[:500])
print("name", j.get("compilation", {}).get("name"), "fullyQualifiedName", j.get("compilation", {}).get("fullyQualifiedName"))
srcs = j.get("sources", {})
print("sources", len(srcs), [p for p in srcs][:60])
for e in j.get("abi", []):
    if e["type"] in ("function", "event", "constructor", "error"):
        ins = ",".join(("indexed " if i.get("indexed") else "") + i["type"] + " " + i.get("name", "") for i in e.get("inputs", []))
        outs = ",".join(o["type"] for o in e.get("outputs", []))
        print("%-9s %s(%s) %s %s" % (e["type"], e.get("name", ""), ins, e.get("stateMutability", ""), ("-> " + outs) if outs else ""))
