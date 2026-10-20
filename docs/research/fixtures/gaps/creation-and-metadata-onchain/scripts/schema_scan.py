import sys, json, os, collections
sys.path.insert(0, os.environ["SCRATCH"] + "/work")
from xoclient import get
S = os.environ["SCRATCH"]
idx = json.load(open(S + "/work/meta_index.json"))
print(collections.Counter(i["http"] for i in idx))
docs = []
for i in idx:
    st, b, h = get(i["url"])
    try: d = json.loads(b)
    except Exception as e: print("bad json", i["url"][-20:], e); continue
    docs.append((i, d))
def typ(v):
    if isinstance(v, bool): return "bool"
    if isinstance(v, int): return "int"
    if isinstance(v, float): return "float"
    if isinstance(v, str): return "str"
    if v is None: return "null"
    if isinstance(v, list): return "list"
    if isinstance(v, dict): return "obj"
keys = collections.Counter(); types = collections.defaultdict(collections.Counter)
for i, d in docs:
    for k, v in d.items(): keys[k] += 1; types[k][typ(v)] += 1
print("n docs", len(docs))
for k, c in keys.most_common(): print(f"{k:22s} {c:4d} {dict(types[k])}")
# nested
rk = collections.Counter(); ork = collections.Counter(); oc = collections.Counter(); olen = collections.Counter(); ok_ = collections.Counter()
for i, d in docs:
    r = d.get("rules")
    if isinstance(r, dict):
        for k in r: rk[k] += 1
        for x in r.get("outcomeRules", []) or []:
            for k in x: ork[k] += 1
        olen[len(r.get("outcomeRules", []) or [])] += 1
    for x in d.get("outcomes", []) or []:
        for k in x: ok_[k] += 1
    oc[len(d.get("outcomes", []) or [])] += 1
print("rules keys", dict(rk)); print("outcomeRules keys", dict(ork)); print("outcomeRules count", dict(olen)); print("outcomes keys", dict(ok_)); print("outcomes count", dict(oc))
print("category", collections.Counter(d.get("category") for i, d in docs))
print("n subcategories", collections.Counter(len(d.get("subcategories", []) or []) for i, d in docs))
print("n tags", collections.Counter(len(d.get("tags", []) or []) for i, d in docs))
print("n sources", collections.Counter(len(d.get("resolution_sources", []) or []) for i, d in docs))
print("outcome titles", collections.Counter(tuple(x.get("title") for x in d.get("outcomes", [])) for i, d in docs).most_common(8))
print("outcome ids", collections.Counter(tuple(x.get("id") for x in d.get("outcomes", [])) for i, d in docs).most_common(4))
print("title==description", sum(1 for i, d in docs if d.get("title") == d.get("description")), "of", len(docs))
print("image_url hosts", collections.Counter(d.get("image_url", "")[:45] for i, d in docs).most_common(6))
print("sources schemes", collections.Counter(s.split("/")[0] + "//" + s.split("/")[2] if s.count("/") >= 2 else s for i, d in docs for s in d.get("resolution_sources", [])).most_common(15))
