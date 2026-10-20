"""Fetch a stratified set of metadata JSON files (public GET) from the XO buckets. Plan is deterministic (seeded)."""
import sys, json, random, datetime, os, collections
sys.path.insert(0, os.environ["SCRATCH"] + "/work")
from xoclient import get, used
S = os.environ["SCRATCH"]
ch = json.load(open(S + "/work/conviction_joined.json"))
random.seed(20261019)
def month(r): return datetime.datetime.fromtimestamp(r["created_ts"], datetime.UTC).strftime("%Y-%m")
def isgcs(u): return "storage.googleapis.com" in u
def isdeclined(r): return bool(r["resp"] and not r["resp"]["accepted"])
plan = []   # (group, cond, kind, url)
chosen = set()
def pick(pool, n_by_month, group):
    for m, n in n_by_month.items():
        cand = [r for r in pool if month(r) == m and r["cond"] not in chosen]
        for r in random.sample(cand, min(n, len(cand))):
            chosen.add(r["cond"]); yield r
gcs = [r for r in ch if isgcs(r["uri"])]
A_app = list(pick([r for r in gcs if r["first_dec"] == "APPROVE"], {"2026-08": 4, "2026-09": 5, "2026-10": 5}, "A"))
A_upd = list(pick([r for r in gcs if r["first_dec"] == "UPDATE_REQUIRED" and r["resp"] and r["resp"]["accepted"]], {"2026-08": 4, "2026-09": 5, "2026-10": 5}, "A"))
rej = [r for r in gcs if r["first_dec"] == "REJECT"]
subst = [r for r in rej if len(r["notes"]) >= 60]
junk = [r for r in rej if len(r["notes"]) < 60]
A_rej = random.sample(subst, 8) + random.sample(junk, 4)
for r in A_rej: chosen.add(r["cond"])
for r in A_app + A_upd + A_rej: plan.append(("A_sample", r["cond"], "orig", r["uri"]))
# B: suggested versions for the updated sample + 10 more pairs
for r in A_upd: plan.append(("B_pairs", r["cond"], "sugg", r["sugg_uri"]))
extra_upd = random.sample([r for r in gcs if r["first_dec"] == "UPDATE_REQUIRED" and r["resp"] and r["resp"]["accepted"] and r["cond"] not in chosen and "MODRA" not in r["notes"][:20] and len(r["notes"]) > 80], 10)
for r in extra_upd:
    chosen.add(r["cond"]); plan.append(("B_pairs", r["cond"], "orig", r["uri"])); plan.append(("B_pairs", r["cond"], "sugg", r["sugg_uri"]))
# C: remaining substantive rejected originals
for r in subst:
    if r["cond"] not in {x["cond"] for x in A_rej}: plan.append(("C_rejected", r["cond"], "orig", r["uri"]))
# D: declined updates (8 pairs)
decl = [r for r in gcs if isdeclined(r)]
for r in random.sample(decl, min(8, len(decl))):
    plan.append(("D_declined", r["cond"], "orig", r["uri"])); plan.append(("D_declined", r["cond"], "sugg", r["sugg_uri"]))
# E: owner-cancelled originals (6)
canc = [r for r in gcs if r["cancelled_ts"]]
for r in random.sample(canc, min(6, len(canc))): plan.append(("E_cancelled", r["cond"], "orig", r["uri"]))
# S3: all originals (21) + suggested of the UPDATE_REQUIRED ones
for r in ch:
    if not isgcs(r["uri"]):
        plan.append(("S3_all", r["cond"], "orig", r["uri"]))
        if r["first_dec"] == "UPDATE_REQUIRED": plan.append(("S3_all", r["cond"], "sugg", r["sugg_uri"]))
# dedupe by url
seen = set(); final = []
for p in plan:
    if p[3] in seen: continue
    seen.add(p[3]); final.append(p)
print("planned", len(final), collections.Counter(p[0] for p in final), "gcs", sum(1 for p in final if isgcs(p[3])), "s3", sum(1 for p in final if not isgcs(p[3])))
if "--dry" in sys.argv: sys.exit()
idx = []
for g, c, k, u in final:
    try:
        st, b, h = get(u)
    except Exception as e:
        print("ERR", u[-20:], e); continue
    idx.append({"group": g, "cond": c, "kind": k, "url": u, "http": st, "len": len(b), "last_modified": h.get("Last-Modified") or h.get("last-modified")})
    if st != 200: print("HTTP", st, u)
json.dump(idx, open(S + "/work/meta_index.json", "w"))
print("done", len(idx), "gcs used", used("storage.googleapis.com"), "s3 used", used("market-metadata-623756711122.s3.eu-west-1.amazonaws.com"))
