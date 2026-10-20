"""Keyless fallback for the UserOp nonce: last UserOperationEvent(nonce) of the sender from Blockscout getLogs (GET) -> next nonce = last + 1."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x
B = "https://explorer-mainnet.xo.market"
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
T = "0x49628fd1471006c1482da88028e9ce4dbb080b815c9b0344d39e5a8e6ec1419f"
out = {}
for s in sys.argv[1:]:
    t2 = "0x" + s.lower()[2:].rjust(64, "0")
    q = "%s/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic2=%s&topic0_2_opr=and" % (B, EP, T, t2)
    r = x.get_json(q)
    res = r.get("result") if isinstance(r.get("result"), list) else []
    if not res:
        print(s, "no UserOperationEvent logs -> never-used sender: nonce = key<<64 | 0"); continue
    last = res[-1]
    nonce = int(last["data"][2:66], 16)
    out[s.lower()] = {"n_events": len(res), "last_block": int(last["blockNumber"], 16), "last_nonce_hex": hex(nonce), "next_nonce_hex": hex(nonce + 1)}
    print(s, json.dumps(out[s.lower()]), "(capped at 1000 rows)" if len(res) >= 1000 else "")
