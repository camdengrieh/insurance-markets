"""Writes schema_summary.json and exemplars.json (public market content only) from fetched metadata. Usage: SCRATCH=<dir> python3 -I export_schema.py <outdir>"""
import sys, json, os, collections, re
sys.path.insert(0, os.environ["SCRATCH"] + "/work")
from xoclient import get
S = os.environ["SCRATCH"]; out = sys.argv[1]
idx = json.load(open(S + "/work/meta_index.json"))
ch = {r["cond"]: r for r in json.load(open(S + "/work/conviction_joined.json"))}
docs = [(i, json.loads(get(i["url"])[1])) for i in idx]
orig = [(i, d) for i, d in docs if i["kind"] == "orig"]; sugg = [(i, d) for i, d in docs if i["kind"] == "sugg"]
def typ(v): return type(v).__name__
summary = {"n_files": len(docs), "n_original_versions": len(orig), "n_oracle_suggested_versions": len(sugg),
           "top_level_keys": {k: {"present": sum(1 for _, d in docs if k in d), "types": dict(collections.Counter(typ(d[k]) for _, d in docs if k in d))} for k in sorted({k for _, d in docs for k in d})},
           "rules_keys": dict(collections.Counter(k for _, d in docs for k in d["rules"])),
           "outcomeRules_item_keys": dict(collections.Counter(k for _, d in docs for x in d["rules"]["outcomeRules"] for k in x)),
           "outcomes_item_keys": dict(collections.Counter(k for _, d in docs for x in d["outcomes"] for k in x)),
           "outcome_count": dict(collections.Counter(len(d["outcomes"]) for _, d in docs)), "outcome_ids": dict(collections.Counter(str(tuple(x["id"] for x in d["outcomes"])) for _, d in docs)),
           "outcomeRules_outcomeIndex": dict(collections.Counter(str(tuple(x["outcomeIndex"] for x in d["rules"]["outcomeRules"])) for _, d in docs)),
           "category_values_in_sample": dict(collections.Counter(d["category"] for _, d in docs)),
           "tags_count_original": dict(collections.Counter(len(d["tags"]) for _, d in orig)), "tags_count_oracle_version": dict(collections.Counter(len(d["tags"]) for _, d in sugg)),
           "subcategories_count": dict(collections.Counter(len(d["subcategories"]) for _, d in docs)),
           "resolution_sources_count": dict(collections.Counter(len(d["resolution_sources"]) for _, d in docs)),
           "outcome_title_pairs_top": collections.Counter(str(tuple(x["title"] for x in d["outcomes"])) for _, d in docs).most_common(6),
           "title_equals_description": sum(1 for _, d in docs if d["title"] == d["description"]),
           "image_url_hosts": dict(collections.Counter(re.sub(r"/[^/]+$", "/", d["image_url"].split("?")[0]) for _, d in docs)),
           "rules_description_chars_original": {"min": min(len(d["rules"]["description"]) for _, d in orig), "max": max(len(d["rules"]["description"]) for _, d in orig)},
           "creator_fields": "none: no creator, wallet, user or seed field in any of the files"}
json.dump(summary, open(out + "/schema_summary.json", "w"), indent=1)
def pick(first_dec, host_sub, minlen=0, maxlen=2500, kind="orig"):
    for i, d in docs:
        c = ch[i["cond"]]
        if i["kind"] == kind and c["first_dec"] == first_dec and host_sub in i["url"] and minlen < len(json.dumps(d)) < maxlen: return i, d
ex = {}
for label, args in (("approved_gcs", ("APPROVE", "googleapis")), ("approved_s3", ("APPROVE", "s3.eu-west-1")), ("rejected_substantive", ("REJECT", "googleapis", 900))):
    r = pick(*args)
    if r: ex[label] = {"first_review_note": ch[r[0]["cond"]]["notes"][:300], "metadata": r[1]}
# an update pair
by = collections.defaultdict(dict)
for i, d in docs: by[i["cond"]][i["kind"]] = (i, d)
for c, v in by.items():
    if "orig" in v and "sugg" in v and len(json.dumps(v["orig"][1])) < 1800 and len(ch[c]["notes"]) > 80 and not ch[c]["notes"].startswith("##"):
        ex["update_required_pair"] = {"oracle_note": ch[c]["notes"][:400], "original": v["orig"][1], "oracle_suggested": v["sugg"][1]}; break
json.dump(ex, open(out + "/exemplars.json", "w"), indent=1, ensure_ascii=False)
print(os.listdir(out))
