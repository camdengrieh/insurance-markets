"""Recall of the fuzzy linker against venue-declared mirrors (Limitless metadata.externalSlug -> Polymarket slug).

  python3 -I recall_check.py --raw RAW --out OUT.json

Limitless declares, per market, the Polymarket slug it mirrors. Those 496 declared links are not ground truth
(the venue could be wrong) but they are an independent reference for how many true mirrors the title-based
linker recovers at each similarity threshold.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import linking  # noqa: E402
from universe import load_all  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    U, extra, snaps = load_all(args.raw)
    res, docs = linking.link_venues(U)
    hints = linking.explicit_hint_links(U)
    cand = {}
    for r in res:
        if {r["va"], r["vb"]} == {"polymarket", "limitless"}:
            a, b = (r["a"], r["b"]) if r["va"] == "polymarket" else (r["b"], r["a"])
            cand[(a, b)] = r
    trad = {m["key"] for m in U["polymarket"] if m["tradable"]}
    inuni = [h for h in hints if h["a"] in trad and h["b"] in docs]
    sims = [cand[(h["a"], h["b"])]["sim"] for h in inuni if (h["a"], h["b"]) in cand]
    out = {"limitless_declared_mirrors_total": len(hints), "declared_mirrors_with_both_sides_in_linking_universe": len(inuni),
           "found_as_candidate_at_any_similarity": len(sims),
           "recall_at_sim_ge": {str(t): round(sum(1 for s in sims if s >= t) / len(inuni), 3) for t in (0.45, 0.55, 0.65, 0.75, 0.85)}}
    json.dump(out, open(args.out, "w"), indent=1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
