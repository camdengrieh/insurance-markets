"""Stage E: draw the false-link audit sample and assemble both sides' rules text.

  python3 -I audit_prepare.py --raw RAW --out OUTDIR [--seed 20261019]

Population = candidate links that entered the edge calculation (both books fetched, orientation resolved).
Strata (by final similarity score): <0.55, 0.55-0.65, 0.65-0.75, 0.75-0.85, 0.85-0.95, >=0.95, plus a
'positive_edge' stratum (links whose best executable net edge is positive and sim >= 0.55).
Writes OUTDIR/audit_sample.json (compact) and RAW/audit_sheet.txt (human-readable, for labelling).
"""
import argparse
import json
import os
import random
import sys
import textwrap
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import CapExceeded, Http, jdump  # noqa: E402
from universe import load_all, strip_html  # noqa: E402

XO_DATA = "https://api-mainnet.xo.market/api"
BINS = [(0.0, 0.55, 12), (0.55, 0.65, 12), (0.65, 0.75, 12), (0.75, 0.85, 10), (0.85, 0.95, 10), (0.95, 1.01, 10)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=20261019)
    ap.add_argument("--edge-n", type=int, default=12)
    args = ap.parse_args()
    rnd = random.Random(args.seed)
    U, extra, snaps = load_all(args.raw)
    idx = {m["key"]: m for v in U.values() for m in v}
    links = json.load(open(os.path.join(args.raw, "screen", "links.json")))
    cross = json.load(open(os.path.join(args.raw, "cross_all.json")))
    best = defaultdict(lambda: None)
    for r in cross:
        k = (r["a"], r["b"])
        if best[k] is None or r["net"] > best[k]["net"]:
            best[k] = r
    pop = []
    seen = set()
    for l in links:
        k = (l["a"], l["b"])
        if k in seen or k not in best or l.get("sim") is None:
            continue
        seen.add(k)
        pop.append(l)
    sample, taken = [], set()
    strata_pop = {}
    for lo, hi, n in BINS:
        cand = [l for l in pop if lo <= l["sim"] < hi]
        strata_pop[f"{lo}-{hi}"] = len(cand)
        for l in rnd.sample(cand, min(n, len(cand))):
            sample.append({"stratum": f"{lo}-{hi}", "link": l})
            taken.add((l["a"], l["b"]))
    edge = [l for l in pop if l["sim"] >= 0.55 and (l["a"], l["b"]) not in taken and best[(l["a"], l["b"])]["net"] > 0]
    strata_pop["positive_edge(sim>=0.55, not already sampled)"] = len(edge)
    edge.sort(key=lambda l: -best[(l["a"], l["b"])]["net_bps"])
    # take a spread of edge sizes instead of only the top
    step = max(1, len(edge) // max(args.edge_n, 1))
    for l in edge[::step][:args.edge_n]:
        sample.append({"stratum": "positive_edge", "link": l})
    # XO rules need the detail endpoint
    http = Http(args.raw)
    xo_text = {}
    try:
        for s in sample:
            for k in (s["link"]["a"], s["link"]["b"]):
                m = idx[k]
                if m["venue"] == "xo" and k not in xo_text:
                    body, meta = http.get(f"{XO_DATA}/markets/contract/{m['cid']}")
                    if isinstance(body, dict):
                        rules = body.get("rules") or {}
                        txt = rules.get("description") if isinstance(rules, dict) else json.dumps(rules)
                        oc = rules.get("outcomeRules") if isinstance(rules, dict) else None
                        xo_text[k] = (txt or "") + (" | outcomeRules: " + json.dumps(oc)[:400] if oc else "") + \
                            " | resolutionSources: " + json.dumps(body.get("resolutionSources")) + " | type: " + str(body.get("resolutionType"))
    except CapExceeded:
        pass

    def side(k):
        m = idx[k]
        rules = xo_text.get(k) if m["venue"] == "xo" else m.get("rules")
        return {"key": k, "venue": m["venue"], "text": m["text"], "yes_label": m.get("yes_label"), "end": m.get("end"),
                "expected_end": m.get("expected_end"), "url": m.get("url"),
                "rules": (rules or "")[:1100], "n_rules_chars": len(rules or "")}

    out = []
    sheet = []
    for i, s in enumerate(sample):
        l = s["link"]
        b = best[(l["a"], l["b"])]
        rec = {"id": i + 1, "stratum": s["stratum"], "sim": l["sim"], "cos": l.get("cos"), "seq": l.get("seq"), "orient": l.get("orient"),
               "pm_side": l.get("pm_side"), "a": side(l["a"]), "b": side(l["b"]), "best_dir": b["dir"], "best_net_bps": b["net_bps"],
               "best_cost": b["cost"]}
        out.append(rec)
        a, bb = rec["a"], rec["b"]
        sheet.append(f"=== #{rec['id']} stratum={rec['stratum']} sim={rec['sim']} orient={rec['orient']} pm_side={rec['pm_side']} edge_bps={rec['best_net_bps']:.0f} cap={rec['best_cost']}")
        for tag, x in (("A", a), ("B", bb)):
            sheet.append(f"[{tag}] {x['venue']} | {x['text']} | yes_label={x['yes_label']} | end={x['end']}")
            sheet.append(textwrap.fill("    RULES: " + (x["rules"] or "(none)"), 160))
    json.dump(out, open(os.path.join(args.raw, "audit_sample_full.json"), "w"))
    with open(os.path.join(args.raw, "audit_sheet.txt"), "w") as f:
        f.write("\n".join(sheet))
    print("sample", len(out), "strata population", strata_pop)
    json.dump({"strata_population": strata_pop, "n_sample": len(out), "seed": args.seed},
              open(os.path.join(args.raw, "audit_meta.json"), "w"))


if __name__ == "__main__":
    main()
