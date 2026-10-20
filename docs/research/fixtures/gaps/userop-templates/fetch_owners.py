"""For each Kernel account, read the ECDSA validator's OwnerRegistered(kernel, owner) log (GET getLogs) -> owners.json."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x

B = "https://explorer-mainnet.xo.market"
VALIDATOR = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
TOPIC0 = "0xe0b9f9a3a5e4ad8a1e6ee3b2e9d5b9c4b3d3e6c8a3e2fd4d3a9ac0b1c2d3e4f5"  # replaced below by cast value
import subprocess
TOPIC0 = subprocess.run(["cast", "keccak", "OwnerRegistered(address,address)"], capture_output=True, text=True).stdout.strip()
p = Path(__file__).resolve().parent / "owners.json"
owners = json.loads(p.read_text()) if p.exists() else {}
for s in sys.argv[1:]:
    k = s.lower()
    if k in owners:
        continue
    t1 = "0x" + k[2:].rjust(64, "0")
    q = "%s/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic1=%s&topic0_1_opr=and" % (B, VALIDATOR, TOPIC0, t1)
    r = x.get_json(q)
    res = r.get("result")
    if not isinstance(res, list) or not res:
        print(s, "no OwnerRegistered log:", str(r)[:120]); continue
    last = res[-1]
    owners[k] = "0x" + last["topics"][2][-40:]
    print(s, "owner", owners[k], "regBlock", int(last["blockNumber"], 16), "nlogs", len(res), "tx", last["transactionHash"])
p.write_text(json.dumps(owners, indent=1))
