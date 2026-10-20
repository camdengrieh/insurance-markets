import json, sys
sys.path.insert(0, ".")
import xohttp
addr = sys.argv[1]; tag = sys.argv[2]
code, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/smart-contracts/" + addr)
print(addr, code, type(j).__name__)
if isinstance(j, dict):
    print({k: (v if not isinstance(v, (str, list, dict)) or (isinstance(v, str) and len(v) < 90) else "<%s len %d>" % (type(v).__name__, len(v))) for k, v in j.items()})
    json.dump(j, open("out/sc_%s.json" % tag, "w"))
