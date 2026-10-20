import json, sys
sys.path.insert(0, ".")
import xohttp
j = json.load(open("out/route_recv.json"))["result"]
r0 = j[0]
rcpt = "0x" + r0["topics"][2][-40:]
print("amount raw", int(r0["data"], 16), "tx", r0["transactionHash"])
base = "https://explorer-mainnet.xo.market"
VAL = "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T_OWN = "0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"
pad = "0x" + "0" * 24 + rcpt[2:]
for label, topicpos in (("as kernel (topic1)", "topic1"), ("as owner (topic2)", "topic2")):
    url = ("%s/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic0_%s_opr=and&%s=%s"
           % (base, VAL, T_OWN, topicpos[-1] if topicpos == "topic1" else "2", topicpos, pad))
    c, a = xohttp.get(url)
    print("OwnerRegistered", label, c, a.get("message"), len(a.get("result") or []))
c, tb = xohttp.get("%s/api/v2/addresses/%s/token-balances" % (base, rcpt))
print("token-balances", c, json.dumps(tb)[:600])
c, ad = xohttp.get("%s/api/v2/addresses/%s" % (base, rcpt))
print("address", c, {k: ad.get(k) for k in ("is_contract", "coin_balance", "has_token_transfers", "has_logs")} if isinstance(ad, dict) else ad)
