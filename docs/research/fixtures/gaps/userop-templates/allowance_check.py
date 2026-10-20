"""USDC.e Approval(owner, spender) events for an account within a block range (GET getLogs). Used to show the operator account approved the Conditional Tokens contract before its first splitPosition.
Usage: python3 -I allowance_check.py <account> <spender> <fromBlock> <toBlock>   (keep the range narrow: full-history topic filters on USDC.e time out)"""
import sys, subprocess
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x
B = "https://explorer-mainnet.xo.market"; USDC = "0x80c12230ce677e6f304027a14780Edd2A829ab0c"
acct, spender, lo, hi = sys.argv[1:5]
t0 = subprocess.run(["cast", "keccak", "Approval(address,address,uint256)"], capture_output=True, text=True).stdout.strip()
pad = lambda a: "0x" + a.lower()[2:].rjust(64, "0")
q = "%s/api?module=logs&action=getLogs&fromBlock=%s&toBlock=%s&address=%s&topic0=%s&topic1=%s&topic2=%s&topic0_1_opr=and&topic0_2_opr=and&topic1_2_opr=and" % (B, lo, hi, USDC, t0, pad(acct), pad(spender))
r = x.get_json(q); res = r.get("result") if isinstance(r.get("result"), list) else []
print("Approval events:", len(res), [(int(l["blockNumber"], 16), l["data"][:20] + "..") for l in res[:3]])
