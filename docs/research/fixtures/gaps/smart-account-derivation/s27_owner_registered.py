import json, sys
sys.path.insert(0, ".")
import xohttp
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T_OWN = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"
def reg(kernel):
    url = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic0_1_opr=and&topic1=%s"
           % (VAL, T_OWN, "0x" + "0" * 24 + kernel[2:].lower()))
    c, j = xohttp.get(url)
    return [("0x" + r["topics"][2][-40:], int(r["blockNumber"], 16), r["transactionHash"][:12]) for r in (j.get("result") or [])]
for k in sys.argv[1:]:
    print(k[:8] + ".." + k[-4:], reg(k))
