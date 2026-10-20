import json, sys
sys.path.insert(0, ".")
import rpc
RPC = "https://mainnet.base.org"
FACTORY = "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419"
IMPL = "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D"
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
calls = [("eth_chainId", []), ("eth_getCode", [FACTORY, "latest"]), ("eth_getCode", [IMPL, "latest"]), ("eth_getCode", [VAL, "latest"]),
         ("eth_call", [{"to": FACTORY, "data": "0x5c60da1b"}, "latest"]),   # implementation()? (selector computed below if differs)
        ]
code, j = rpc.call(RPC, calls)
print(code)
for r in (j if isinstance(j, list) else [j]):
    res = r.get("result") if isinstance(r, dict) else r
    print(r.get("id"), (len(res)//2 - 1) if isinstance(res, str) and res.startswith("0x") and len(res) > 66 else res, r.get("error"))
json.dump(j, open("out/base_codes.json", "w"))
