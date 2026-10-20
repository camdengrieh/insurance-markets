import json, os, collections, statistics, datetime
S = os.environ["SCRATCH"]
def word(h, i): return h[2 + 64 * i: 2 + 64 * (i + 1)]
def dstr(d, off_word):
    off = int(word(d, off_word), 16); base = 2 + 2 * off
    ln = int(d[base: base + 64], 16)
    return bytes.fromhex(d[base + 64: base + 64 + 2 * ln]).decode("utf-8", "replace")
created = [r for r in json.load(open(S + "/work/created_t2_t4.json")) if r["marketType"] == 4]
cset = {r["cond"]: r for r in created}
rev = {}
revs_all = collections.defaultdict(list)
for r in json.load(open(S + "/work/ev_MarketReviewed.json")):
    c = r["topics"][1]
    d = r["data"]
    x = {"decision": int(word(d, 0), 16), "sugg_uri": dstr(d, 1), "notes": dstr(d, 2),
         "sugg_exp": int(word(d, 3), 16), "sugg_until": int(word(d, 4), 16),
         "ts": int(r["timeStamp"], 16), "block": int(r["blockNumber"], 16), "tx": r["transactionHash"]}
    revs_all[c].append(x)
resp = collections.defaultdict(list)
for r in json.load(open(S + "/work/ev_UpdateRequestResponded.json")):
    d = r["data"]
    resp[r["topics"][1]].append({"accepted": bool(int(word(d, 1), 16)), "uri": dstr(d, 2), "ts": int(r["timeStamp"], 16)})
canc = {r["topics"][1]: int(r["timeStamp"], 16) for r in json.load(open(S + "/work/ev_MarketCancelledByOwner.json"))}
mdu = collections.defaultdict(list)
for r in json.load(open(S + "/work/ev_MetadataUpdated.json")):
    if r["topics"][1] in cset:
        mdu[r["topics"][1]].append({"ts": int(r["timeStamp"], 16), "uri": dstr(r["data"], 0)})
exp = collections.defaultdict(list)
for r in json.load(open(S + "/work/ev_MarketExpiryUpdated.json")):
    if r["topics"][1] in cset:
        exp[r["topics"][1]].append({"ts": int(r["timeStamp"], 16), "old": int(word(r["data"], 0), 16), "new": int(word(r["data"], 1), 16)})
DEC = {0: "APPROVE", 1: "REJECT", 2: "UPDATE_REQUIRED"}
# multi-review?
print("conditions with >1 review:", sum(1 for c in cset if len(revs_all.get(c, [])) > 1))
out = []
for c, m in cset.items():
    rv = sorted(revs_all.get(c, []), key=lambda z: z["ts"])
    first = rv[0] if rv else None
    rs = sorted(resp.get(c, []), key=lambda z: z["ts"])
    row = {"cond": c, "created_ts": m["ts"], "block": m["block"], "uri": m["uri"], "startsAt": m["startsAt"], "expiresAt": m["expiresAt"],
           "creator": m["creator"],
           "first_dec": DEC.get(first["decision"]) if first else None,
           "review_ts": first["ts"] if first else None, "notes": first["notes"] if first else None,
           "sugg_uri": first["sugg_uri"] if first else None, "sugg_exp": first["sugg_exp"] if first else None,
           "sugg_until": first["sugg_until"] if first else None,
           "resp": rs[0] if rs else None, "cancelled_ts": canc.get(c), "mdu": mdu.get(c, []), "exp_upd": exp.get(c, [])}
    out.append(row)
json.dump(out, open(S + "/work/conviction_joined.json", "w"))
cnt = collections.Counter(r["first_dec"] for r in out); print(cnt)
tot = len(out)
for k, v in cnt.items(): print(k, v, round(100 * v / tot, 1))
# outcomes after UPDATE_REQUIRED
upd = [r for r in out if r["first_dec"] == "UPDATE_REQUIRED"]
print("UPDATE_REQUIRED:", len(upd), "responded:", sum(1 for r in upd if r["resp"]), "accepted:", sum(1 for r in upd if r["resp"] and r["resp"]["accepted"]), "declined:", sum(1 for r in upd if r["resp"] and not r["resp"]["accepted"]), "unresponded:", sum(1 for r in upd if not r["resp"]))
print("owner-cancelled (conviction):", sum(1 for r in out if r["cancelled_ts"]))
print("cancelled by owner AFTER review?", sum(1 for r in out if r["cancelled_ts"] and r["review_ts"] and r["cancelled_ts"] > r["review_ts"]))
print("md updated events for conviction:", sum(1 for r in out if r["mdu"]), "n events", sum(len(r["mdu"]) for r in out))
print("expiry updated:", sum(1 for r in out if r["exp_upd"]))
# latencies
lat = [(r["review_ts"] - r["created_ts"]) / 60 for r in out if r["review_ts"]]
def q(a, p): a = sorted(a); return a[min(len(a) - 1, int(p * len(a)))]
print("review latency min: n=%d median=%.1f p75=%.1f p90=%.1f max=%.1f" % (len(lat), statistics.median(lat), q(lat, .75), q(lat, .9), max(lat)))
for dec in DEC.values():
    l = [(r["review_ts"] - r["created_ts"]) / 60 for r in out if r["first_dec"] == dec]
    if l: print(dec, len(l), "median %.1f p90 %.1f" % (statistics.median(l), q(l, .9)))
# response latency
rl = [(r["resp"]["ts"] - r["review_ts"]) / 60 for r in upd if r["resp"]]
print("owner response latency min after review: n=%d median=%.1f p75=%.1f p90=%.1f max=%.1f" % (len(rl), statistics.median(rl), q(rl, .75), q(rl, .9), max(rl)))
# suggestion window (sugg_until - review_ts)
sw = [(r["sugg_until"] - r["review_ts"]) / 3600 for r in upd if r["sugg_until"]]
print("suggestion window hours: median %.1f min %.1f max %.1f" % (statistics.median(sw), min(sw), max(sw)))
# sugg uri host / equals orig?
print("sugg_uri same as original:", sum(1 for r in upd if r["sugg_uri"] == r["uri"]), "empty:", sum(1 for r in upd if not r["sugg_uri"]))
import urllib.parse
print(collections.Counter(urllib.parse.urlparse(r["sugg_uri"]).netloc for r in upd))
# by month first_dec
bym = collections.defaultdict(collections.Counter)
for r in out: bym[datetime.datetime.fromtimestamp(r["created_ts"], datetime.UTC).strftime("%Y-%m")][r["first_dec"]] += 1
for k in sorted(bym): print(k, dict(bym[k]))
