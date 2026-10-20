import json, os, collections, re
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(BASE, "raw", "poly_events.json")))
evs = d["events"]
print("fetched_at", d["fetched_at"], "events", len(evs))
mk = [(e, m) for e in evs for m in e.get("markets", [])]
print("markets", len(mk))

# event-level field presence
def pres(items, key, nonempty=True):
    n = 0
    for x in items:
        v = x.get(key)
        if v not in (None, "", [], {}, False) if nonempty else key in x:
            n += 1
    return n

evkeys = collections.Counter(k for e in evs for k in e)
print("event keys sorted by presence:", [(k, c) for k, c in evkeys.most_common()][:80])
for k in ["negRisk", "negRiskAugmented", "enableNegRisk", "negRiskMarketID", "series", "seriesSlug", "tags", "eventMetadata", "cumulativeMarkets", "electionType", "countryName", "resolutionSource", "parentEvent", "ticker"]:
    print("event", k, "nonempty:", pres(evs, k), "of", len(evs))

# markets per event
sizes = collections.Counter(len(e.get("markets", [])) for e in evs)
multi = [e for e in evs if len(e.get("markets", [])) > 1]
print("events with >1 market:", len(multi), "; markets in those:", sum(len(e["markets"]) for e in multi), "of", len(mk))
print("size histogram (1,2,3,4-5,6-10,11-50,>50):",
      [sum(c for s, c in sizes.items() if lo <= s <= hi) for lo, hi in [(1,1),(2,2),(3,3),(4,5),(6,10),(11,50),(51,10**6)]])

# negRisk
nr_ev = [e for e in evs if e.get("negRisk")]
print("negRisk events:", len(nr_ev), "markets in them:", sum(len(e["markets"]) for e in nr_ev))
aug = [e for e in evs if e.get("negRiskAugmented")]
print("negRiskAugmented events:", len(aug))
print("neg-risk but single market event:", sum(1 for e in nr_ev if len(e["markets"]) == 1))
print("multi-market events NOT negRisk:", sum(1 for e in multi if not e.get("negRisk")))

# market-level
mkeys = collections.Counter(k for _, m in mk for k in m)
for k in ["groupItemTitle", "groupItemThreshold", "negRisk", "negRiskMarketID", "negRiskRequestID", "negRiskOther", "questionID", "comboStatus", "resolvedBy", "resolutionSource", "marketType", "sportsMarketType", "line", "gameId", "teamAID", "teamBID", "seriesColor", "fallbackResolutionType", "umaResolutionStatus"]:
    print("market", k, "present:", mkeys.get(k, 0), "nonempty:", sum(1 for _, m in mk if m.get(k) not in (None, "", [], {}, False)))
print("groupItemThreshold value samples:", collections.Counter(str(m.get("groupItemThreshold")) for _, m in mk).most_common(8))
print("comboStatus values:", collections.Counter(str(m.get("comboStatus")) for _, m in mk).most_common(5))
print("resolvedBy top:", collections.Counter(str(m.get("resolvedBy"))[:12] for _, m in mk).most_common(5))

# tags
tagc = collections.Counter()
for e in evs:
    for t in e.get("tags") or []:
        tagc[t.get("slug")] += 1
print("distinct tag slugs", len(tagc), tagc.most_common(25))
print("tag object keys", sorted((evs[0].get("tags") or [{}])[0].keys()))
print("events with >=1 tag:", sum(1 for e in evs if e.get("tags")))

# series
sr = [e for e in evs if e.get("series")]
print("events with series array:", len(sr))
if sr:
    print("series keys:", sorted(sr[0]["series"][0].keys()))
    print("series examples:", [(s["series"][0].get("slug"), s["series"][0].get("seriesType"), s["series"][0].get("recurrence")) for s in sr[:8]])

# eventMetadata
em = [e for e in evs if e.get("eventMetadata")]
print("eventMetadata nonempty:", len(em), [json.dumps(e["eventMetadata"])[:200] for e in em[:3]])

# threshold-like naming in groupItemTitle for events with groupItemThreshold
cnt = 0
for e in multi:
    if any(m.get("groupItemThreshold") not in (None, "", "0") for m in e["markets"]):
        cnt += 1
print("multi-market events with any non-zero groupItemThreshold:", cnt)
# distribution of regex patterns in questions (threshold-ladder-like)
pat = collections.Counter()
for e in multi:
    qs = [m.get("question", "") for m in e["markets"]]
    if all(re.search(r"\d", q) for q in qs):
        pat["all questions contain a digit"] += 1
    if all(re.search(r"(above|below|over|under|reach|dip|hit|<|>|at least|more than|less than)", q, re.I) for q in qs):
        pat["all questions have threshold-ish verb"] += 1
    if all(re.search(r"\b(by|before|on)\b .*(20\d\d|January|February|March|April|May|June|July|August|September|October|November|December)", q, re.I) for q in qs):
        pat["all questions have date-ish phrase"] += 1
print("multi-market event title patterns:", pat)
