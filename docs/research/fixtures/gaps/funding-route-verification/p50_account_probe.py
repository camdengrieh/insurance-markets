import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
DA = [a for a, _ in json.load(open("data/deposit_accounts.json"))]   # written by p48; third-party addresses are not hard-coded here
A = DA[0]
for fn in ("accountId()", "rootValidator()", "entrypoint()"):
    r = lib.eth_call(XO, A, lib.selector(fn))
    print(fn, r if not isinstance(r, str) or len(r) < 100 else r[:200], end="  ")
    if isinstance(r, str) and fn == "accountId()":
        try: print("->", lib.dec_string(r), end="")
        except Exception: pass
    print()
