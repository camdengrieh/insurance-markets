"""Human labels (by this agent, from the rules text) for the 'positive-edge census': every link pair with
final sim >= 0.65 whose best executable net edge is > 0, not only the random audit sample.

  python3 -I apply_census_labels.py --raw RAW

The rule table below is keyed by (substring of side A text, substring of side B text). Labels:
I = identical, Dm = looks identical but resolution differs (minor), X = different.
Anything NOT matched by a rule stops the script with an error, so the census cannot silently contain unlabeled pairs.
"""
import argparse
import json
import os
import sys

RULES = [
    # (A substring, B substring, label, note)
    ("Ron DeSantis", "Ron DeSantis", "I", "2028 GOP nominee, same template as audited Rubio pair"),
    ("Andy Beshear", "Andy Beshear", "I", "2028 Dem nominee, same template as audited pairs"),
    ("Marco Rubio", "Marco Rubio", "I", "audited"),
    ("Serie A Champion — Roma", "Roma", "I", "Serie A champion; same template as audited Como/Juventus/Napoli pairs"),
    ("criminal case be dismissed", "Before Jan 1, 2027", "X", "audited: Jul 1 2027 vs Jan 1 2027 deadline"),
    ("Nigerian Senate election winner? — APC", "Nigerian Senate Election Winner APC", "Dm",
     "same Senate-majority question; tie-break (government entry vs alphabetical), Other fallback and early-determination clause differ"),
    ("Lamine Yamal", "Lamine Yamal", "I", "audited"),
    ("Goldman Sachs", "Goldman Sachs", "X", "OpenAI IPO vs Anthropic IPO"),
    ("Marine Le Pen", "Marine Le Pen", "X", "ballot access vs win"),
    ("Jean-Luc", "Jean-Luc", "X", "ballot access vs win"),
    ("Morgan Stanley", "Morgan Stanley", "X", "OpenAI IPO vs Anthropic IPO"),
    ("be on the ballot? — Édouard Philippe", "Édouard Philippe", "X", "ballot access vs win"),
    ("María Corina", "María Corina", "Dm", "Venezuela head of state at end 2026: Kalshi pins Dec 31 10:00 ET, Limitless 'end of 2026' + later clarifications"),
    ("La Liga Golden Boot — Kylian Mbappe", "Champions League Golden Boot", "X", "La Liga vs Champions League golden boot"),
    ("Mark Cuban", "Mark Cuban", "I", "audited"),
    ("Michelle Obama", "Michelle Obama", "I", "2028 Dem nomination vs nominee, same text as audited Cuban/Mamdani pairs"),
    ("Europa League Champion — Juventus", "Juventus", "I", "Europa League champion; same template as audited Bournemouth pair"),
    ("Roy Cooper", "Roy Cooper", "I", "same template as audited Cuban pair"),
    ("Nicolás Maduro", "Nicolás Maduro", "Dm", "audited"),
    ("Stephen A. Smith", "Stephen A. Smith", "I", "same template as audited Cuban pair"),
    ("Chris Murphy", "Chris Murphy", "I", "same template as audited Cuban pair"),
    ("EPL Golden Boot — Erling Haaland", "Champions League Golden Boot", "X", "EPL vs Champions League golden boot"),
    ("La Liga Golden Boot — Raphinha", "Champions League Golden Boot", "X", "La Liga vs Champions League golden boot"),
    ("Will Édouard Philippe win the 2027 French", "Édouard Philippe", "Dm", "PM adds annulled-results contingency text; Kalshi plain; end dates differ"),
    ("Eric Trump", "Donald Trump", "X", "different person"),
    ("increase interest rates by 50+ bps", "cuts rates by 50+ bps", "X", "opposite direction"),
    ("increase interest rates by 50+ bps", "hikes rates by 50+ bps", "I", "same direction, same bracket, same rounding convention"),
    ("decrease interest rates by 50+ bps", "cuts rates by 50+ bps", "I", "same direction, same bracket, same rounding convention"),
    ("decrease interest rates by 50+ bps", "hikes rates by 50+ bps", "X", "opposite direction"),
    ("increase interest rates by 25 bps", "cuts rates by exactly 25 bps", "X", "opposite direction"),
]


def label_for(a, b):
    for sa, sb, lab, note in RULES:
        if sa in a and sb in b:
            return lab, note
    return None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    args = ap.parse_args()
    cross = json.load(open(os.path.join(args.raw, "cross_all.json")))
    best = {}
    for r in cross:
        k = (r["a"], r["b"])
        if k not in best or r["net"] > best[k]["net"]:
            best[k] = r
    out, missing = {}, []
    for k, r in best.items():
        if r["net"] > 0 and (r["sim"] or 0) >= 0.65:
            lab, note = label_for(r["a_text"], r["b_text"])
            if lab is None:
                missing.append((r["a_text"], r["b_text"]))
                continue
            out[r["a"] + "|" + r["b"]] = {"label": lab, "note": note, "sim": r["sim"], "a": r["a_text"], "b": r["b_text"]}
    if missing:
        print("UNLABELED", missing)
        sys.exit(1)
    json.dump(out, open(os.path.join(args.raw, "census_labels.json"), "w"))
    from collections import Counter
    print(len(out), Counter(v["label"] for v in out.values()))


if __name__ == "__main__":
    main()
