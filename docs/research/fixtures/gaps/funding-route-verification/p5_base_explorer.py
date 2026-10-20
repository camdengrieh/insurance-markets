import sys, json
sys.path.insert(0, '.')
import lib
H = "https://base.blockscout.com"
for path in ["/api/v2/smart-contracts/0x5b3f32417d651d47ebaeb079e8cf28b479b0926a",
             "/api/v2/smart-contracts/0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f",
             "/api/v2/addresses/0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f"]:
    st, j = lib.get_json(H + path)
    print(path, st)
    if isinstance(j, dict):
        keys = list(j.keys())
        print("  keys:", keys[:40])
        for k in ("name", "is_verified", "is_fully_verified", "compiler_version", "is_partially_verified", "proxy_type", "creation_transaction_hash", "creator_address_hash", "implementations", "is_contract", "coin_balance", "token"):
            if k in j: print("  ", k, "=", json.dumps(j[k])[:300])
        if "abi" in j and j["abi"]:
            print("  abi entries:", len(j["abi"]))
            for e in j["abi"]:
                if e.get("type") == "function":
                    print("    fn", e["name"], "(" + ",".join(i["type"] for i in e.get("inputs", [])) + ")", e.get("stateMutability"))
    else:
        print("  ", j)
