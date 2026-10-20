import sys, json, os, collections, statistics, difflib, re
sys.path.insert(0, os.environ["SCRATCH"] + "/work")
from xoclient import get
S = os.environ["SCRATCH"]
idx = json.load(open(S + "/work/meta_index.json"))
ch = {r["cond"]: r for r in json.load(open(S + "/work/conviction_joined.json"))}
by = collections.defaultdict(dict)
for i in idx: by[i["cond"]][i["kind"]] = i["url"]
def load(u): return json.loads(get(u)[1])
pairs = [(c, v["orig"], v["sugg"]) for c, v in by.items() if "orig" in v and "sugg" in v]
print("pairs", len(pairs))
chg = collections.Counter(); sizes = []; src_delta = []; out_changed = 0
detail = []
for c, o, s in pairs:
    a, b = load(o), load(s)
    fields = []
    for k in ("title", "description", "category", "tags", "subcategories", "image_url", "resolution_sources", "outcomes"):
        if a.get(k) != b.get(k): fields.append(k)
    if a["rules"]["description"] != b["rules"]["description"]: fields.append("rules.description")
    if a["rules"]["outcomeRules"] != b["rules"]["outcomeRules"]: fields.append("rules.outcomeRules")
    for f in fields: chg[f] += 1
    la, lb = len(a["rules"]["description"]), len(b["rules"]["description"])
    sizes.append((la, lb)); src_delta.append(len(b["resolution_sources"]) - len(a["resolution_sources"]))
    detail.append({"cond": c, "first_dec": ch[c]["first_dec"], "accepted": bool(ch[c]["resp"] and ch[c]["resp"]["accepted"]), "fields": fields, "len_before": la, "len_after": lb,
                   "src_before": len(a["resolution_sources"]), "src_after": len(b["resolution_sources"]), "exp_changed": bool(ch[c]["sugg_exp"] and ch[c]["sugg_exp"] != ch[c]["expiresAt"]),
                   "sugg_exp_minus_orig_days": round((ch[c]["sugg_exp"] - ch[c]["expiresAt"]) / 86400, 3) if ch[c]["sugg_exp"] else None,
                   "notes": ch[c]["notes"][:300]})
print("fields changed (count of pairs):", dict(chg))
print("rules.description chars before median %d after median %d ; ratio median %.2f" % (statistics.median([a for a, b in sizes]), statistics.median([b for a, b in sizes]), statistics.median([b / a for a, b in sizes])))
print("source count delta distribution", collections.Counter(src_delta))
print("suggested expiry differs from original:", sum(1 for d in detail if d["sugg_exp_minus_orig_days"] not in (0, None)), "of", len(detail))
print("suggested expiry equals original:", sum(1 for d in detail if d["sugg_exp_minus_orig_days"] == 0))
for d in detail[:4]: print(d["fields"], d["len_before"], d["len_after"], d["sugg_exp_minus_orig_days"], d["notes"][:150].replace("\n", " "))
json.dump(detail, open(S + "/work/pairs_detail.json", "w"))
# sample one pair diff of rules text (sentence-level) for exemplar
c, o, s = next(p for p in pairs if ch[p[0]]["first_dec"] == "UPDATE_REQUIRED" and len(ch[p[0]]["notes"]) > 150 and "MODRA" not in ch[p[0]]["notes"][:10])
a, b = load(o), load(s)
print("EXEMPLAR notes:", ch[c]["notes"][:400])
print("BEFORE:", a["rules"]["description"][:700]); print("AFTER:", b["rules"]["description"][:900])
