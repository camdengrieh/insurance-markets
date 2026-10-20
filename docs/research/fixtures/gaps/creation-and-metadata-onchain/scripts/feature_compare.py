import sys, json, os, collections, statistics, re, datetime
sys.path.insert(0, os.environ["SCRATCH"] + "/work")
from xoclient import get
S = os.environ["SCRATCH"]
idx = json.load(open(S + "/work/meta_index.json"))
ch = {r["cond"]: r for r in json.load(open(S + "/work/conviction_joined.json"))}
orig = {}
for i in idx:
    if i["kind"] == "orig": orig[i["cond"]] = json.loads(get(i["url"])[1])
MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"
def feats(d, r):
    t = d["rules"]["description"]; ti = d["title"]
    return {
        "rule_chars": len(t),
        "n_sources": len(d["resolution_sources"]),
        "has_utc_or_tz": bool(re.search(r"\b(UTC|GMT|ET|EST|EDT|PT|PST|CEST|CET|BST|local time|time zone|timezone)\b", t)),
        "has_explicit_date": bool(re.search(r"\b(%s)\.? \d{1,2}\b|\b\d{1,2} (%s)\b|\b20\d\d-\d\d-\d\d\b|\b(%s) \d{1,2},? 20\d\d" % (MONTHS, MONTHS, MONTHS), t)),
        "has_void_clause": bool(re.search(r"\bvoid|resolve[s]? equally|cancel|postpone|abandon", t, re.I)),
        "has_fallback": bool(re.search(r"fall[s]? back|fallback|unavailable|backup|secondary source|if the primary", t, re.I)),
        "has_primary_source_phrase": bool(re.search(r"primary source", t, re.I)),
        "mentions_url_in_rules": bool(re.search(r"https?://", t)),
        "yes_no": tuple(o["title"] for o in d["outcomes"]) == ("Yes", "No"),
        "n_tags": len(d["tags"]),
        "title_q": ti.strip().endswith("?"),
        "title_eq_desc": ti == d["description"],
        "outcome_rule_chars": sum(len(x["rule"]) for x in d["rules"]["outcomeRules"]),
        "horizon_days": (r["expiresAt"] - r["created_ts"]) / 86400,
    }
groups = collections.defaultdict(list)
for c, d in orig.items():
    r = ch[c]
    if r["first_dec"] == "APPROVE": g = "APPROVE"
    elif r["first_dec"] == "UPDATE_REQUIRED": g = "UPDATE_REQUIRED"
    elif r["first_dec"] == "REJECT": g = "REJECT_substantive" if len(r["notes"]) >= 60 else "REJECT_junk"
    else: g = "CANCELLED_BY_OWNER"
    groups[g].append(feats(d, r))
print({g: len(v) for g, v in groups.items()})
keys = list(next(iter(groups.values()))[0].keys())
for k in keys:
    row = []
    for g in ("APPROVE", "UPDATE_REQUIRED", "REJECT_substantive", "REJECT_junk", "CANCELLED_BY_OWNER"):
        v = [f[k] for f in groups.get(g, [])]
        if not v: row.append(f"{g}:-"); continue
        if isinstance(v[0], bool): row.append(f"{g}:{100*sum(v)/len(v):.0f}%")
        else: row.append(f"{g}:{statistics.median(v):.1f}")
    print(f"{k:26s}", "  ".join(row))
json.dump({g: v for g, v in groups.items()}, open(S + "/work/feature_groups.json", "w"))
