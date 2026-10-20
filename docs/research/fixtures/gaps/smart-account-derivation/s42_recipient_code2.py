import json, re, sys
sys.path.insert(0, ".")
import xohttp
j = json.load(open("out/route_recv.json"))["result"]
a = "0x" + j[0]["topics"][2][-40:]
c, x = xohttp.get("https://explorer-mainnet.xo.market/api/v2/smart-contracts/" + a)
code = x["deployed_bytecode"]
print(c, x.get("proxy_type"), x.get("creation_status"), x.get("is_verified"), (len(code) - 2) // 2, "bytes")
print(code[:120])
print("PUSH20 constants:", sorted(set(re.findall(r"73([0-9a-f]{40})", code[2:]))))
print("PUSH4 selectors:", sorted(set(re.findall(r"63([0-9a-f]{8})", code[2:]))))
json.dump(dict(addr=a, code=code), open("out/recipient1_code.json", "w"))
