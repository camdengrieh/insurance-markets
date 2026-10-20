"""Write anonymised derived tables for the repo. Usage: SCRATCH=<scratch dir> python3 -I export_fixtures.py <outdir>
No wallet addresses are written; creators become c001.. by first appearance. Notes are oracle text about markets (no creator data)."""
import json, os, sys, csv, datetime, collections, urllib.parse, re
def redact(t):
    t = re.sub(r"0x[0-9a-fA-F]{40}", "0x<addr>", t or "")
    return t.replace(chr(64), "(at)")
S = os.environ["SCRATCH"]; out = sys.argv[1]
ch = json.load(open(S + "/work/conviction_joined.json"))
ch.sort(key=lambda r: r["created_ts"])
cid = {}; nth = collections.Counter(); wk = collections.Counter()
def host(u):
    h = urllib.parse.urlparse(u).netloc
    return "gcs:storage.googleapis.com/market-metadata-mainnet" if h == "storage.googleapis.com" else ("s3:market-metadata-<acct>.s3.eu-west-1" if "s3.eu-west-1" in h else "other:" + h)
def regime(n):
    if not n: return ""
    if n == "Market approved by admin": return "admin-stamp"
    if n.startswith("## MODRA"): return "MODRA-format"
    if n == "This market is clear and ready to resolve.": return "auto-summary"
    return "free-text"
rows = []
for r in ch:
    c = cid.setdefault(r["creator"], "c%03d" % (len(cid) + 1)); nth[c] += 1
    d = datetime.datetime.fromtimestamp(r["created_ts"], datetime.UTC)
    k = (c, d.isocalendar()[:2]); wk[k] += 1
    act = None
    if r["first_dec"] == "APPROVE": act = r["review_ts"]
    elif r["first_dec"] == "UPDATE_REQUIRED" and r["resp"] and r["resp"]["accepted"]: act = r["resp"]["ts"]
    final = "ACTIVE" if act else "CANCELLED"
    rows.append({"cond12": r["cond"][2:14], "created_utc": d.strftime("%Y-%m-%dT%H:%M:%SZ"), "creator": c, "creator_nth": nth[c], "week_seq": wk[k],
                 "host_class": host(r["uri"]), "horizon_days": round((r["expiresAt"] - r["created_ts"]) / 86400, 3), "startsAt_minus_created_s": r["startsAt"] - r["created_ts"],
                 "first_review": r["first_dec"] or "NONE", "review_latency_s": (r["review_ts"] - r["created_ts"]) if r["review_ts"] else "", "notes_regime": regime(r["notes"]),
                 "owner_response": ("accepted" if r["resp"]["accepted"] else "declined") if r["resp"] else "", "response_latency_s": (r["resp"]["ts"] - r["review_ts"]) if r["resp"] else "",
                 "suggestion_window_h": round((r["sugg_until"] - r["review_ts"]) / 3600, 2) if r["sugg_until"] else "",
                 "owner_cancelled_after_s": (r["cancelled_ts"] - r["created_ts"]) if r["cancelled_ts"] else "", "creation_to_active_s": (act - r["created_ts"]) if act else "", "final": final})
with open(out + "/conviction_outcomes.csv", "w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
rej = [{"cond12": r["cond"][2:14], "created_utc": datetime.datetime.fromtimestamp(r["created_ts"], datetime.UTC).strftime("%Y-%m-%d"), "reason": redact(r["notes"])} for r in ch if r["first_dec"] == "REJECT"]
json.dump(rej, open(out + "/review_notes_reject.json", "w"), indent=0, ensure_ascii=False)
upd = [{"cond12": r["cond"][2:14], "reviewed_utc": datetime.datetime.fromtimestamp(r["review_ts"], datetime.UTC).strftime("%Y-%m-%d"), "accepted": r["resp"]["accepted"], "note": redact(r["notes"][:240])} for r in ch if r["first_dec"] == "UPDATE_REQUIRED"]
json.dump(upd, open(out + "/review_notes_update_required.json", "w"), indent=0, ensure_ascii=False)
for name in ("pairs_detail", "sample_userop_summary", "first_trade", "seed_books"):
    p = S + f"/work/{name}.json"
    if os.path.exists(p):
        txt = redact(json.dumps(json.load(open(p)), indent=0)) if name == "pairs_detail" else json.dumps(json.load(open(p)), indent=0)
        open(out + f"/{name}.json", "w").write(txt)
sd = json.load(open(S + "/work/seed_detail.json"))
for x in sd: x.pop("creator_id", None); x["catalyst_achievement_shown"] = "XO Catalyst" in (x.pop("achievements") or [])
json.dump(sd, open(out + "/seed_detail_sample.json", "w"), indent=0)
print("written", os.listdir(out))
