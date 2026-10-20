import json, sys
sys.path.insert(0, ".")
import xohttp
h = "0x3f3d4f3adb1eb3d10f1c7ee4dc4b882edff6ce61e680713cf8f7d5243a929777"
code, j = xohttp.get("https://explorer-mainnet.xo.market/api/v2/transactions/" + h)
print(code)
json.dump(j, open("out/tx_first.json","w"))
for k in ["from","to","method","status","block_number","timestamp","gas_used","fee"]:
    print(k, j.get(k) if not isinstance(j.get(k), dict) else {kk: j[k].get(kk) for kk in ("hash","name","is_contract")})
print("decoded_input", json.dumps(j.get("decoded_input"))[:3000])
print("raw_input len", len(j.get("raw_input","")))
print(list(j.keys()))
