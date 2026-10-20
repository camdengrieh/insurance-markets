"""Find candidate handleOps transactions per action type via Blockscout etherscan-style getLogs (GET only)."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import xofetch as x

B = "https://explorer-mainnet.xo.market"
HEAD = int(sys.argv[1]) if len(sys.argv) > 1 else 12608921
WINDOW = int(sys.argv[2]) if len(sys.argv) > 2 else 40000
CTF = "0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909"
USDC = "0x80c12230ce677e6f304027a14780Edd2A829ab0c"
EXCH = "0x4bC5E872256D12E6017dfe466E04c867DC761B77"
MGR = "0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307"
ROUTE = "0x9090463546d725F6eCE5D1A4B27beB929D5D1983"
T = {
 "redeem": (CTF, "0x2682012a4a4f1973119f1c9b90745d1bd91fa2bab387344f044cb3586864d18d", None),
 "split": (CTF, "0x2e6bb91f8cbcda0c93623c54d0403a43514fabc40084ec96b6d5379a74786298", None),
 "merge": (CTF, "0x6f13ca62553fcc2bcd2372180a43949c1e4cebba603901ede2f4e14f36b282ca", None),
 "setApprovalForAll": (CTF, "0x17307eab39ab6107e8899845ad3d59bd9653f200f220920489ca2b5937696c31", "0x" + EXCH[2:].lower().rjust(64, "0")),
 "usdc_approve_exchange": (USDC, "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", None),
 "creation_fee": (MGR, "0xe9927345bdffcfbc768aecc0c516a76565447079fc0dab2b1e5f2c28e91dcf2e", None),
 "sent_transfer_remote": (ROUTE, "0xd229aacb94204188fe8042965fa6b269c62dc5818b21238779ab64bdd17efeec", None),
}
which = sys.argv[3].split(",") if len(sys.argv) > 3 else list(T)
out = {}
for name in which:
    addr, t0, t2 = T[name]
    q = "%s/api?module=logs&action=getLogs&fromBlock=%d&toBlock=%d&address=%s&topic0=%s" % (B, HEAD - WINDOW, HEAD, addr, t0)
    if t2:
        q += "&topic2=%s&topic0_2_opr=and" % t2
    try:
        r = x.get_json(q)
    except Exception as e:
        print(name, "ERR", e); continue
    res = r.get("result") if isinstance(r, dict) else None
    if not isinstance(res, list):
        print(name, "no list:", str(r)[:200]); continue
    txs = []
    for l in res:
        h = l["transactionHash"]
        if h not in txs: txs.append(h)
    out[name] = {"n_logs": len(res), "n_txs": len(txs), "txs": txs[-12:], "blocks": [int(res[0]["blockNumber"], 16), int(res[-1]["blockNumber"], 16)] if res else None}
    print(name, out[name]["n_logs"], "logs", out[name]["n_txs"], "txs; blocks", out[name]["blocks"])
p = Path(__file__).resolve().parent / "candidates.json"
old = json.loads(p.read_text()) if p.exists() else {}
old.update(out)
p.write_text(json.dumps(old, indent=1))
