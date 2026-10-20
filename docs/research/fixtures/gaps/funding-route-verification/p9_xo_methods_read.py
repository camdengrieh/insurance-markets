import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
for suffix in ("methods-read-proxy?is_custom_abi=false", "methods-read?is_custom_abi=false"):
    st, j = lib.get_json(H + "/api/v2/smart-contracts/" + ROUTE + "/" + suffix)
    print("==", suffix, st)
    if isinstance(j, list):
        for m in j:
            outs = []
            for o in m.get("outputs", []):
                outs.append("%s=%s" % (o.get("type"), json.dumps(o.get("value"))[:200]))
            print("  %-28s inputs=%s -> %s" % (m.get("name"), [i["type"] for i in m.get("inputs", [])], outs))
    else:
        print(j if isinstance(j, str) else json.dumps(j)[:400])
