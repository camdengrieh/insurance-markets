"""Join XO Champions League match groups to Kalshi KXUCLGAME events by team-name normalisation; compare top-of-book.
Data: raw/xo_active_list.json (all ACTIVE rows), raw/xo_active_full.json (first 50 full rows), raw/kalshi_KXUCLGAME.json.
"""
import json, os, re, sys, unicodedata, collections, itertools
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phttp as H
BASE = H.BASE
xo_rows = json.load(open(os.path.join(BASE, "raw", "xo_active_list.json")))["rows"]
kal = json.load(open(os.path.join(BASE, "raw", "kalshi_KXUCLGAME.json")))

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("/", " ").replace("-", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    toks = [t for t in s.split() if t not in ("fc", "kv", "cf", "sc", "ac", "as", "fk", "sk", "afc", "the", "de", "sporting")]
    return " ".join(toks)

def toks(s): return set(norm(s).split())

# XO groups: UCL rows, title patterns "X to win vs Y" / "Draw: A vs B"
groups = collections.defaultdict(dict)
for r in xo_rows:
    cp = [c["name"] for c in (r.get("categoryPath") or [])]
    if cp[:3] != ["SPORTS", "Football", "Champions League"]:
        continue
    t = r["title"]
    m = re.match(r"^Draw: (.+) vs (.+)$", t)
    if m:
        key = frozenset([norm(m.group(1)), norm(m.group(2))])
        groups[key]["draw"] = r; groups[key]["teams"] = (m.group(1), m.group(2)); continue
    m = re.match(r"^(.+) to win vs (.+)$", t)
    if m:
        key = frozenset([norm(m.group(1)), norm(m.group(2))])
        groups[key].setdefault("wins", []).append((m.group(1), r)); groups[key]["teams"] = groups[key].get("teams") or (m.group(1), m.group(2))
print("XO UCL rows:", sum(1 for r in xo_rows if [c['name'] for c in (r.get('categoryPath') or [])][:3] == ['SPORTS','Football','Champions League']), "groups:", len(groups))
print("groups with draw + 2 wins:", sum(1 for g in groups.values() if g.get("draw") and len(g.get("wins", [])) == 2))

# Kalshi events: title "A vs B"
kev = []
for e in kal:
    m = re.match(r"^(.+) vs (.+)$", e["title"])
    if not m: continue
    kev.append(dict(ev=e, a=m.group(1), b=m.group(2), ta=toks(m.group(1)), tb=toks(m.group(2))))

def team_sim(x, y):
    a, b = toks(x), toks(y)
    if not a or not b: return 0.0
    # token containment (handles 'Eindhoven' vs 'PSV Eindhoven', 'Porto' vs 'FC Porto'), plus prefix tolerance for spelling (bodo vs bodoe)
    inter = 0
    for t in a:
        if t in b or any((t.startswith(u) or u.startswith(t)) and min(len(t), len(u)) >= 4 for u in b): inter += 1
    return inter / min(len(a), len(b))

matches = []
for key, g in groups.items():
    t1, t2 = g["teams"]
    best = None
    for k in kev:
        s = max(team_sim(t1, k["a"]) + team_sim(t2, k["b"]), team_sim(t1, k["b"]) + team_sim(t2, k["a"])) / 2
        if best is None or s > best[0]: best = (s, k)
    matches.append((best[0], g, best[1]))
matches.sort(key=lambda x: -x[0])
print("XO groups matched to a Kalshi event, similarity (0-1):")
for s, g, k in matches:
    print(f"  {s:.2f}  XO {g['teams']}  <->  Kalshi {k['ev']['title']} ({k['ev']['event_ticker']})")
n_full = sum(1 for s, _, _ in matches if s >= 0.99)
print("exact-token-containment matches (>=0.99):", n_full, "of", len(matches), "; below 0.99:", len(matches) - n_full)
json.dump([(s, [g['teams'][0], g['teams'][1]], k['ev']['event_ticker']) for s, g, k in matches], open(os.path.join(BASE, "raw", "xo_kalshi_ucl_join.json"), "w"))
