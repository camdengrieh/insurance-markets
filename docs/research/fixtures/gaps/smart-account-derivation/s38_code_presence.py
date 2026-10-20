import json, sys
sys.path.insert(0, ".")
import xohttp
for label, a in (("deployed XO account", "0xC4531B7f421F1cC6Efd83e5F426Bfb39Ff4F7930"), ("anvil0-TEST counterfactual", "0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d")):
    c, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/smart-contracts/" + a)
    if isinstance(j, dict):
        code = j.get("deployed_bytecode")
        print(label, c, "bytecode bytes:", (len(code) - 2) // 2 if code else None, "| head:", (code or "")[:40], "| proxy_type:", j.get("proxy_type"))
    else:
        print(label, c, str(j)[:120])
