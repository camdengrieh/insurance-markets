import sys, json
sys.path.insert(0, '.')
import lib
H = "https://explorer-mainnet.xo.market"
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
st, j = lib.get_json(H + "/api/v2/smart-contracts/" + ROUTE)
print("smart-contracts", st)
if isinstance(j, dict):
    for k in ("name", "is_verified", "is_fully_verified", "compiler_version", "proxy_type", "implementations", "creation_transaction_hash", "creator_address_hash", "is_vyper_contract"):
        if k in j: print("  ", k, "=", json.dumps(j[k])[:300])
    if j.get("abi"):
        print("  abi entries:", len(j["abi"]))
else:
    print(j)
st, j = lib.get_json(H + "/api/v2/stats")
print("stats", st, json.dumps(j)[:500] if isinstance(j, dict) else j)
