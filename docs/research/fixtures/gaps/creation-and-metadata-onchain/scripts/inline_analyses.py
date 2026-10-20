"""Consolidated copy of the small analyses run inline during the session (all read from $SCRATCH/work/*.json produced by the scan scripts).
Run: SCRATCH=<dir> python3 -I inline_analyses.py   -> prints sections A..K"""
import json, os, collections, statistics, datetime, re, urllib.parse, random, email.utils, hashlib
S = os.environ["SCRATCH"]
ch = json.load(open(S + "/work/conviction_joined.json"))
created = [r for r in json.load(open(S + "/work/created_t2_t4.json"))]
t4 = [r for r in created if r["marketType"] == 4]
da = {r["conditionId"]: r for r in json.load(open(S + "/work/dataapi_t4.json"))}
fees = json.load(open(S + "/raw/fee_events.json"))["result"]
D = lambda t: datetime.datetime.fromtimestamp(t, datetime.UTC)
def q(a, p): a = sorted(a); return a[min(len(a) - 1, int(p * len(a)))]
def cls(u):
    h = urllib.parse.urlparse(u).netloc
    return "gcs" if h == "storage.googleapis.com" else ("s3" if "s3.eu-west-1" in h else "other:" + h)
print("== A. creations vs fee events"); print(len(t4), len({r["cond"] for r in t4}), {r["cond"] for r in t4} == {r["topics"][1] for r in fees})
print("== B. URI host/scheme distribution (type 4 and type 2)")
for name, grp in (("type4", t4), ("type2", [r for r in created if r["marketType"] == 2])):
    print(name, collections.Counter((urllib.parse.urlparse(r["uri"]).scheme, urllib.parse.urlparse(r["uri"]).netloc) for r in grp).most_common())
print("== C. host class with first/last use and outcomes")
g = collections.defaultdict(list)
for r in ch: g[cls(r["uri"])].append(r)
for k, v in g.items():
    ts = [r["created_ts"] for r in v]; n = len(v); c = collections.Counter(r["first_dec"] for r in v)
    ev = sum(1 for r in v if r["first_dec"] == "APPROVE" or (r["resp"] and r["resp"]["accepted"]))
    print(k, n, D(min(ts)), D(max(ts)), {a: (b, round(100 * b / n, 1)) for a, b in c.items()}, "eventual active", ev, round(100 * ev / n, 1))
print("== D. creator cadence")
per_tx = collections.Counter(r["tx"] for r in t4); print("creations per tx", collections.Counter(per_tx.values()))
byc = collections.defaultdict(list)
for r in t4: byc[r["creator"]].append(r["ts"])
n = [len(v) for v in byc.values()]
print("creators", len(byc), "1:", sum(1 for x in n if x == 1), "2-5:", sum(1 for x in n if 2 <= x <= 5), "6-20:", sum(1 for x in n if 6 <= x <= 20), ">20:", sum(1 for x in n if x > 20), "max", max(n))
wk = collections.Counter(); day = collections.Counter()
for c, v in byc.items():
    for t in v: wk[(c, D(t).isocalendar()[:2])] += 1; day[(c, D(t).date())] += 1
print("creator-weeks", len(wk), "with >1:", sum(1 for x in wk.values() if x > 1), "max/week", max(wk.values()), "2nd+ in creator-week:", sum(x - 1 for x in wk.values()), "of", len(t4), "max/day", max(day.values()))
print("== E. timeline: DB createdAt vs chain, startsAt, horizon")
ts = lambda s: datetime.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
d = [ts(da[c]["createdAt"]) - ch_["created_ts"] for ch_ in ch for c in [ch_["cond"]] if c in da]
print("DB createdAt - chain ts (s): median %.1f p90 %.1f max %.1f" % (statistics.median(d), q(d, .9), max(d)))
sd = [r["startsAt"] - r["created_ts"] for r in ch]; print("startsAt - created: min", min(sd), "max", max(sd), "share<=60s", sum(1 for x in sd if x <= 60) / len(sd))
hz = [(r["expiresAt"] - r["created_ts"]) / 86400 for r in ch]; print("horizon days median %.2f p10 %.2f p90 %.2f max %.0f" % (statistics.median(hz), q(hz, .1), q(hz, .9), max(hz)))
print("== F. owner responses to UPDATE_REQUIRED")
upd = [r for r in ch if r["first_dec"] == "UPDATE_REQUIRED"]
acc = [r for r in upd if r["resp"]["accepted"]]; dec = [r for r in upd if not r["resp"]["accepted"]]
print("accepted", len(acc), "declined", len(dec), "accepted within window", sum(1 for r in acc if r["resp"]["ts"] < r["sugg_until"]), "declined after expiry", sum(1 for r in dec if r["resp"]["ts"] >= r["sugg_until"]))
lat = [(r["resp"]["ts"] - r["review_ts"]) / 60 for r in acc]; print("accept latency min median %.1f p90 %.1f max %.1f; <=5min %d <=60min %d" % (statistics.median(lat), q(lat, .9), max(lat), sum(1 for x in lat if x <= 5), sum(1 for x in lat if x <= 60)))
w = sorted((r["sugg_until"] - r["review_ts"]) / 3600 for r in upd); print("window h shortest", [round(x, 2) for x in w[:6]], "<6h", sum(1 for x in w if x < 6), "==48h", sum(1 for x in w if abs(x - 48) < .1))
cc = [(r["cancelled_ts"] - r["created_ts"]) / 60 for r in ch if r["cancelled_ts"]]; print("owner cancels", len(cc), "median min %.1f max %.1f" % (statistics.median(cc), max(cc)))
print("== G. reviewer regimes")
def reg(n):
    if n == "Market approved by admin": return "admin-stamp"
    if n.startswith("## MODRA"): return "MODRA-format"
    if n == "This market is clear and ready to resolve.": return "auto-summary"
    return "free-text"
t = collections.defaultdict(collections.Counter)
for r in ch:
    if r["first_dec"] == "APPROVE": t[D(r["review_ts"]).strftime("%Y-%m")][reg(r["notes"])] += 1
print({m: dict(v) for m, v in sorted(t.items())})
print("quality scores", collections.Counter((r["first_dec"], round(float(re.search(r"Quality score:\*\* ([0-9.]+)", r["notes"]).group(1)), 1)) for r in ch if r["notes"] and "Quality score" in r["notes"]))
print("== H. rejection categories")
def rcat(n):
    s = n.lower().strip()
    if re.fullmatch(r"(test( market)?|this was a test market|reject(ed)?|\.|was created before the seed fix)", s): return "junk/test/bare-reject"
    if re.search(r"dup|already (exists|live)|current market already|same event|identical markets", s): return "duplicate of a live market"
    if re.search(r"already (taken place|been played|concluded)|past event|has already|already concluded", s): return "event already happened"
    if re.search(r"not binary|binary format|draw|two binaries", s): return "not a clean binary"
    if re.search(r"api-football|playbook", s): return "automated checker: team names / playbook"
    if re.search(r"source|example\.com|opensea|does not display", s): return "unusable or invalid resolution source"
    if re.search(r"concerns xo|about the project|xo market metrics", s): return "about XO itself"
    if re.search(r"ambiguous|specify|not specify|vague|subjective|disputed|unambiguous|misleading|too far|unlikely to match", s): return "ambiguous / underspecified / subjective"
    return "other"
print(collections.Counter(rcat(r["notes"]) for r in ch if r["first_dec"] == "REJECT").most_common())
print("== I. update-required reason keywords (substantive notes after Aug 18)")
cut = datetime.datetime(2026, 8, 19, tzinfo=datetime.UTC).timestamp()
sub = [r for r in upd if len(r["notes"]) >= 60 and r["review_ts"] >= cut]
cats = {"date/time/deadline/cutoff": r"\b(date|deadline|cut-?off|kick-?off|time|UTC|timezone|window|expir|by (?:the )?end|until)\b", "void/cancel/postpone/abandon": r"\b(void|voids|voided|cancel|postpon|abandon|suspend|interrupt|no contest|walkover|forfeit)",
        "source/fallback": r"\b(source|CoinGecko|CoinMarketCap|fallback|fall back|official site|ESPN|Binance|API)\b", "threshold/numeric": r"\b(threshold|at least|exceed|or more|or higher|above|below|price|closing|close|percent|%|\$)",
        "definition/ambiguity": r"\b(defin|clarif|specif|explicit|ambigu|vague|precise|unambiguous|exact)", "Yes/No or rewrite": r"\b(Yes/No|binary|restructur|rewritten|rewrote|reworded)",
        "draw/overtime/own goal": r"\b(draw|tie|overtime|extra time|penalt|own goal|stoppage|added time|regular time)", "title": r"\btitle\b", "conciseness only": r"\b(concise|simplif|smoother|wording|streamlin|reworded|tighten)",
        "resolve-No default": r"(otherwise (?:it )?resolves? No|resolves? No|defaults? to No|catch-all)"}
for k, p in cats.items():
    nn = sum(1 for r in sub if re.search(p, r["notes"], re.I)); print("%4d %5.1f%% %s" % (nn, 100 * nn / len(sub), k))
print("n substantive", len(sub), "of", len(upd))
print("== J. approval by creator experience / horizon / category since 2026-09-01")
post = [r for r in ch if r["created_ts"] >= datetime.datetime(2026, 9, 1, tzinfo=datetime.UTC).timestamp()]
def rate(g_, label):
    n_ = len(g_); c_ = collections.Counter(r["first_dec"] for r in g_)
    print("%-26s n=%3d approve=%5.1f%% update=%5.1f%% reject=%5.1f%%" % (label, n_, 100 * c_["APPROVE"] / n_, 100 * c_["UPDATE_REQUIRED"] / n_, 100 * c_["REJECT"] / n_))
rate(post, "all since Sep 1")
for lo, hi, l in ((0, 1, "<1d"), (1, 7, "1-7d"), (7, 30, "7-30d"), (30, 120, "30-120d"), (120, 1e9, ">120d")): rate([r for r in post if lo <= (r["expiresAt"] - r["created_ts"]) / 86400 < hi], "horizon " + l)
for catn in ("SPORTS", "CRYPTO"):
    g_ = [r for r in post if r["cond"] in da and da[r["cond"]]["categoryPath"] and da[r["cond"]]["categoryPath"][0]["name"] == catn]
    c_ = collections.Counter(r["first_dec"] for r in g_); a_ = c_["APPROVE"] + c_["UPDATE_REQUIRED"]
    print(catn, "DA-visible n", len(g_), "approve %.1f%% update %.1f%% (of approve+update)" % (100 * c_["APPROVE"] / a_, 100 * c_["UPDATE_REQUIRED"] / a_))
print("eventual ACTIVE since Sep 1:", sum(1 for r in post if r["first_dec"] == "APPROVE" or (r["resp"] and r["resp"]["accepted"])), "of", len(post))
print("== K. oracle rewrites that change numeric terms")
idx = json.load(open(S + "/work/meta_index.json"))
import sys; sys.path.insert(0, S + "/work")
from xoclient import get
by = collections.defaultdict(dict)
for i in idx: by[i["cond"]][i["kind"]] = i["url"]
nums = lambda s: set(x.replace(",", "").rstrip(".") for x in re.findall(r"\d[\d,]*\.?\d*", s))
lost_ct = 0; pairs = 0
for c, v in by.items():
    if "orig" in v and "sugg" in v:
        a = json.loads(get(v["orig"])[1]); b = json.loads(get(v["sugg"])[1]); pairs += 1
        ta = a["title"] + " " + a["rules"]["description"] + " " + " ".join(x["rule"] for x in a["rules"]["outcomeRules"]); tb = b["title"] + " " + b["rules"]["description"] + " " + " ".join(x["rule"] for x in b["rules"]["outcomeRules"])
        lost = sorted(x for x in nums(ta) - nums(tb) if len(x) >= 3 and x != "2026")
        if lost:
            lost_ct += 1; print("  numeric tokens dropped:", lost)
print("pairs", pairs, "with a dropped numeric token (excluding bare 2026):", lost_ct)
