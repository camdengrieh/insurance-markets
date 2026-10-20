import json, sys, datetime
sys.path.insert(0, ".")
import xohttp
EP = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
T0 = "0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d"
j = json.load(open("out/route_recv.json"))["result"]
first_seen = {}
for r in j:
    rcpt = "0x" + r["topics"][2][-40:]
    first_seen.setdefault(rcpt, int(r["timeStamp"], 16))
rcpts = list(first_seen.items())
print(len(j), "events;", len(rcpts), "distinct recipients")
N = int(sys.argv[1])
rows = []
for rcpt, ts in rcpts[:N]:
    u = ("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest"
         "&address=%s&topic0=%s&topic0_2_opr=and&topic2=%s" % (EP, T0, "0x" + "0" * 24 + rcpt[2:]))
    c1, a = xohttp.get(u)
    deployed = len(a.get("result") or []) if isinstance(a, dict) else None
    dep_ts = int(a["result"][0]["timeStamp"], 16) if deployed else None
    c2, b = xohttp.get("https://orderbooks.xo.market/balance-allowance?address=%s&asset_type=COLLATERAL" % rcpt)
    sa = b.get("smart_account") if isinstance(b, dict) else None
    c3, d = xohttp.get("https://api-mainnet.xo.market/api/users/portfolio?user=%s" % rcpt)
    rows.append(dict(recipient_short=rcpt[:8] + ".." + rcpt[-4:], first_inbound_ts=ts, deployed_events=deployed, deployed_ts=dep_ts,
                     orderbook_smart_account_nonnull=bool(sa), orderbook_balance=b.get("balance") if isinstance(b, dict) else None,
                     dataapi_portfolio_status=c3))
    print(rows[-1])
json.dump(rows, open("out/recipient_status.json", "w"), indent=1)
print(xohttp.used())
