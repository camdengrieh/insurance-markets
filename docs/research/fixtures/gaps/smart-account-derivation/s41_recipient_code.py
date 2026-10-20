import json, sys
sys.path.insert(0, ".")
import xohttp
j = json.load(open("out/route_recv.json"))["result"]
for r in j[:2]:
    a = "0x" + r["topics"][2][-40:]
    c, x = xohttp.get("https://explorer-mainnet.xo.market/api/v2/smart-contracts/" + a)
    code = x.get("deployed_bytecode") if isinstance(x, dict) else None
    print(a[:8] + ".." + a[-4:], "smart-contracts endpoint HTTP", c, "| bytecode bytes:", (len(code) - 2) // 2 if code else None)
