import sys, json
sys.path.insert(0, '.')
import lib
XO = "https://rpc-mainnet-2.xo.market"
DA = [a for a, _ in json.load(open("data/deposit_accounts.json"))]   # written by p48; third-party addresses are not hard-coded here
for a in DA:
    c = lib.rpc(XO, "eth_getCode", [a, "latest"])["result"]
    n = (len(c) - 2) // 2
    print("XO code at", a[:10], "bytes", n, "codehash", ("0x" + lib.keccak256(bytes.fromhex(c[2:])).hex()[:16]) if n else "-")
    if n:
        print("   head:", c[:90])
        # ERC-1967 implementation slot on XO
        print("   impl slot:", lib.rpc(XO, "eth_getStorageAt", [a, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"])["result"])
        break
