import json, collections, datetime, statistics, re
S = __import__("os").environ["SCRATCH"]
ch = json.load(open(S + "/work/conviction_joined.json"))
da = {r["conditionId"]: r for r in json.load(open(S + "/work/dataapi_t4.json"))}
def D(t): return datetime.datetime.fromtimestamp(t, datetime.UTC)
def rate(g, label):
    n = len(g); c = collections.Counter(r["first_dec"] for r in g)
    a = c["APPROVE"]; u = c["UPDATE_REQUIRED"]; x = c["REJECT"]; z = c[None]
    print(f"{label:28s} n={n:4d} approve={a/n*100:5.1f}% update={u/n*100:5.1f}% reject={x/n*100:5.1f}% pending/cancelled={z/n*100:4.1f}%")
# reviewer regimes by note format
def regime(n):
    if n is None: return None
    if n.startswith("## MODRA Review"): return "MODRA-format"
    if n == "Market approved by admin": return "admin-stamp"
    if n == "This market is clear and ready to resolve.": return "clear-ready"
    return "free-text"
reg = collections.defaultdict(list)
for r in ch:
    if r["first_dec"]: reg[(r["first_dec"], regime(r["notes"]))].append(r)
print("--- notes regimes with first/last review date")
for k, v in sorted(reg.items(), key=lambda z: (z[0][0], str(z[0][1]))):
    ts = [r["review_ts"] for r in v]
    print(k, len(v), D(min(ts)).strftime("%m-%d"), D(max(ts)).strftime("%m-%d"))
print("--- by month of creation"); 
bym = collections.defaultdict(list)
for r in ch: bym[D(r["created_ts"]).strftime("%Y-%m")].append(r)
for k in sorted(bym): rate(bym[k], k)
print("--- by week"); byw = collections.defaultdict(list)
for r in ch: byw[D(r["created_ts"]).strftime("%G-W%V")].append(r)
for k in sorted(byw): rate(byw[k], k)
# creator experience: n-th creation of that creator (by time)
cnt = collections.Counter(); exp = {}
for r in sorted(ch, key=lambda r: r["created_ts"]):
    cnt[r["creator"]] += 1; exp[r["cond"]] = cnt[r["creator"]]
for lo, hi in ((1, 1), (2, 3), (4, 10), (11, 30), (31, 999)):
    rate([r for r in ch if lo <= exp[r["cond"]] <= hi], f"creator #{lo}-{hi}")
# restrict to after 2026-09-01 (steady-state reviewer)
post = [r for r in ch if r["created_ts"] >= datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC).timestamp()]
print("--- since 2026-09-01"); rate(post, "all since Sep 1")
for lo, hi in ((1, 1), (2, 3), (4, 10), (11, 30), (31, 999)):
    rate([r for r in post if lo <= exp[r["cond"]] <= hi], f"  creator #{lo}-{hi}")
# weekly sequence
wk = collections.Counter(); wseq = {}
for r in sorted(ch, key=lambda r: r["created_ts"]):
    k = (r["creator"], D(r["created_ts"]).isocalendar()[:2]); wk[k] += 1; wseq[r["cond"]] = wk[k]
rate([r for r in post if wseq[r["cond"]] == 1], "  1st in ISO week")
rate([r for r in post if wseq[r["cond"]] >= 2], "  2nd+ in ISO week")
# horizon
def hz(r): return (r["expiresAt"] - r["created_ts"]) / 86400
for lo, hi, l in ((0, 1, "<1d"), (1, 7, "1-7d"), (7, 30, "7-30d"), (30, 120, "30-120d"), (120, 1e9, ">120d")):
    rate([r for r in post if lo <= hz(r) < hi], f"  horizon {l}")
# hour of day UTC
for lo, hi in ((0, 6), (6, 12), (12, 18), (18, 24)):
    rate([r for r in post if lo <= D(r["created_ts"]).hour < hi], f"  created hour {lo}-{hi} UTC")
# category via DA (active-ever only: cannot see rejected)
cat = collections.defaultdict(collections.Counter)
for r in ch:
    d = da.get(r["cond"])
    if d and r["created_ts"] >= datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC).timestamp():
        cat[d["categoryPath"][0]["name"]][r["first_dec"]] += 1
print("--- category (DA-visible, since Sep 1; excludes rejects/cancelled so reads approve vs update only)")
for k, c in sorted(cat.items(), key=lambda z: -sum(z[1].values())):
    n = sum(c.values()); print(f"{k:12s} n={n:4d} approve={c['APPROVE']/n*100:5.1f}% update={c['UPDATE_REQUIRED']/n*100:5.1f}%")
# number of sources via DA
ns = collections.defaultdict(collections.Counter)
for r in ch:
    d = da.get(r["cond"])
    if d and r["created_ts"] >= datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC).timestamp():
        k = min(len(d.get("resolutionSources") or []), 4)
        ns[k][r["first_dec"]] += 1
print("--- resolution source count in FINAL metadata (updated version for accepted updates; not original) -- skip interpretation")
# time to activation (creation to ACTIVE) for ever-active
act = []
for r in ch:
    if r["first_dec"] == "APPROVE": act.append((r["review_ts"] - r["created_ts"]) / 60)
    elif r["first_dec"] == "UPDATE_REQUIRED" and r["resp"] and r["resp"]["accepted"]: act.append((r["resp"]["ts"] - r["created_ts"]) / 60)
def q(a, p): a = sorted(a); return a[min(len(a)-1, int(p*len(a)))]
print("creation->ACTIVE minutes, ever-active n=%d: median %.1f p75 %.1f p90 %.1f max %.1f" % (len(act), statistics.median(act), q(act, .75), q(act, .9), max(act)))
for path in ("APPROVE", "UPDATE_REQUIRED"):
    a = []
    for r in post:
        if r["first_dec"] == path == "APPROVE": a.append((r["review_ts"] - r["created_ts"]) / 60)
        elif r["first_dec"] == path == "UPDATE_REQUIRED" and r["resp"] and r["resp"]["accepted"]: a.append((r["resp"]["ts"] - r["created_ts"]) / 60)
    print(" since Sep 1", path, "n=%d median %.1f p90 %.1f" % (len(a), statistics.median(a), q(a, .9)))
# first-review latency since Sep 1 by regime
lat = [(r["review_ts"] - r["created_ts"]) / 60 for r in post if r["review_ts"]]
print("first review latency since Sep 1: n=%d median %.1f p90 %.1f max %.1f" % (len(lat), statistics.median(lat), q(lat, .9), max(lat)))
# accepted vs declined
upd = [r for r in ch if r["first_dec"] == "UPDATE_REQUIRED"]
print("update accepted %d declined %d" % (sum(1 for r in upd if r["resp"]["accepted"]), sum(1 for r in upd if not r["resp"]["accepted"])))
updp = [r for r in upd if r in post]
print("since Sep 1: accepted %d declined %d" % (sum(1 for r in updp if r["resp"]["accepted"]), sum(1 for r in updp if not r["resp"]["accepted"])))
# time-to-suggestion window
w = [(r["sugg_until"] - r["review_ts"]) / 3600 for r in upd]
print("suggestion window hours distribution", collections.Counter(round(x) for x in w).most_common(5))
# suggested expiry set?
print("suggested expiry set (nonzero):", sum(1 for r in upd if r["sugg_exp"]), "of", len(upd))
