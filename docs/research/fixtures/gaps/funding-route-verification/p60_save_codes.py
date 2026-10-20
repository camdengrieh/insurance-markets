"""Fetch and save runtime code used by the offline disassembly/selector scans (what two inline snippets did)."""
import sys, json
sys.path.insert(0, '.')
import lib
W = "0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9"       # executor on Base
DA = [a for a, _ in json.load(open("data/deposit_accounts.json"))]   # written by p48; third-party addresses are not hard-coded here
D = DA[0]
open("data/wrapper_runtime.hex", "w").write(lib.rpc("https://base.drpc.org", "eth_getCode", [W, "latest"])["result"])
open("data/deposit_account_code.hex", "w").write(lib.rpc("https://base.drpc.org", "eth_getCode", [D, "latest"])["result"])
print("saved")
