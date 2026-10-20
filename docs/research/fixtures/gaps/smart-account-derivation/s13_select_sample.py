import json
def rows(tag):
    return json.load(open("out/ad_bulk_%s.json" % tag))["result"] or []
def parse(r):
    d = r["data"][2:]
    return dict(tx=r["transactionHash"], sender="0x"+r["topics"][2][-40:], factory="0x"+d[24:64], paymaster="0x"+d[88:128], block=int(r["blockNumber"],16), ts=int(r["timeStamp"],16))
sel = []
seen_tx = set()
def add(p, why):
    if p["tx"] in seen_tx: return
    seen_tx.add(p["tx"]); p["why"] = why; sel.append(p)
ODD = "0x91e60e0613810449d098b0b5ec8b51a0fe8c8985"
# every non-canonical factory row we know of
for tag in ("r0","m1","m2","m3","m4","r1"):
    for r in rows(tag):
        p = parse(r)
        if p["factory"] != "0xaac5d4240af87249b3f71bc8e4a2cae074a3e419":
            add(p, "non-canonical factory (%s)" % tag)
def evenly(tag, n, why, filt=lambda p: True):
    rs = [parse(r) for r in rows(tag)]
    rs = [p for p in rs if filt(p)]
    if not rs: return
    step = max(1, len(rs)//n)
    for p in rs[::step][:n]:
        add(p, why)
evenly("r1", 22, "recent window (Oct 2026), XO PolicyPaymaster")
evenly("r0", 3, "early window (Oct/Nov 2025)")
evenly("m1", 2, "Jan/Feb 2026, ZeroDev paymaster", lambda p: p["paymaster"].startswith("0x7777"))
evenly("m1", 1, "Jan/Feb 2026, XO paymaster", lambda p: p["paymaster"].startswith("0x2353"))
evenly("m2", 2, "May 2026")
evenly("m3", 2, "Jul/Aug 2026")
evenly("m4", 2, "Sep 2026")
print(len(sel))
json.dump(sel, open("out/sample_sel.json","w"), indent=1)
for s in sel: print(s["tx"][:12], s["factory"][:10], s["paymaster"][:10], s["why"])
