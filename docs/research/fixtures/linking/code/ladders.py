"""Threshold-ladder and date-ladder family detection (stdlib only).

A *threshold ladder* is a set of markets with identical wording except one number K and a
direction (upper: "above/reach K", lower: "below/dip to K").
  upper: P(K) is non-increasing in K  -> easier leg = lower K
  lower: P(K) is non-decreasing in K  -> easier leg = higher K
A *date ladder* is a set of markets with identical wording except one date D and a
cumulative ("by/before/within") reading.
  P(D) is non-decreasing in D        -> easier leg = later date

Arbitrage test (always on executable prices): buy YES(easy) at its ask and sell YES(hard)
(= buy NO(hard) at 1 - bid(hard)).  The package pays >= 1 in every state, so it is
profitable iff bid(hard) > ask(easy).
"""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from textproc import template  # noqa: E402


def _num_key(m, tp):
    return tuple(round(n[0], 6) for n in tp["numbers"])


KALSHI_DIR = {"greater": "upper", "greater_or_equal": "upper", "less": "lower", "less_or_equal": "lower"}
STATS = {"kalshi_dir_agree": 0, "kalshi_dir_disagree": 0, "kalshi_dir_struct_only": 0, "kalshi_dir_text_only": 0}


def _direction(m, tp):
    d = tp["direction"]
    if d not in ("upper", "lower"):
        d = None
    if m.get("venue") == "kalshi":
        sd = KALSHI_DIR.get(m.get("strike_type"))
        if sd and d and sd != d:
            STATS["kalshi_dir_disagree"] += 1
            return "conflict"
        if sd and d:
            STATS["kalshi_dir_agree"] += 1
        elif sd:
            STATS["kalshi_dir_struct_only"] += 1
        elif d:
            STATS["kalshi_dir_text_only"] += 1
        return sd or d
    if d:
        return d
    yl = (m.get("yes_label") or "").strip().lower()
    if yl in ("over", "more"):
        return "upper"
    if yl in ("under", "less", "fewer"):
        return "lower"
    return None


def families_for_group(members, default_year, min_size=2, ref_epoch=None):
    """members: list of normalised markets in one candidate group (same event / pseudo-event).
    Returns list of ladder families (dicts)."""
    infos = []
    for m in members:
        if m.get("venue") == "kalshi" and m.get("mutually_exclusive"):
            continue      # exclusive events hold disjoint bins, never nested thresholds (e.g. "exactly N launches")
        txt = m.get("text") or m.get("title") or ""
        tp = template(txt, default_year=default_year, ref_epoch=ref_epoch)
        if tp["range"]:
            continue
        infos.append((m, tp))
    fams = []

    # ---- threshold ladders: same tmpl_nonum, same dates, exactly one varying number position
    buckets = defaultdict(list)
    for m, tp in infos:
        if not tp["numbers"]:
            continue
        dkey = tuple(d[0] for d in tp["dates"])
        buckets[(tp["tmpl_nonum"], dkey)].append((m, tp))
    for (tm, dkey), lst in buckets.items():
        if len(lst) < min_size:
            continue
        nk = [(_num_key(m, tp), m, tp) for m, tp in lst]
        k = len(nk[0][0])
        if any(len(x[0]) != k for x in nk):
            continue
        vary = [i for i in range(k) if len({x[0][i] for x in nk}) > 1]
        if len(vary) != 1:
            continue
        i = vary[0]
        if len({x[0][i] for x in nk}) != len(nk):
            continue         # duplicate thresholds (e.g. two different instruments)
        dirs = {_direction(m, tp) for _, m, tp in nk}
        dirs.discard(None)
        if len(dirs) != 1 or "conflict" in dirs:
            continue
        direction = dirs.pop()
        pct = {tp["numbers"][i][1] for _, _, tp in nk}
        def xval(x):
            m = x[1]
            if m.get("venue") == "kalshi" and m.get("strike_type") in KALSHI_DIR:
                v = m.get("floor_strike") if KALSHI_DIR[m["strike_type"]] == "upper" else m.get("cap_strike")
                if v is not None:
                    return float(v)
            return x[0][i]
        xs = [xval(x) for x in nk]
        if len(set(xs)) != len(xs):
            continue
        order = sorted(range(len(nk)), key=lambda j: xs[j])
        fams.append({"kind": "threshold", "direction": direction, "template": tm,
                     "members": [{"key": nk[j][1]["key"], "x": xs[j]} for j in order]})

    # ---- date ladders: same tmpl_datemasked, one date each, cumulative wording
    buckets = defaultdict(list)
    for m, tp in infos:
        if len(tp["dates"]) != 1 or tp["dates"][0][0] is None:
            continue
        if not tp["cumulative"]:
            continue
        buckets[tp["tmpl_datemasked"]].append((m, tp))
    for tm, lst in buckets.items():
        if len(lst) < min_size:
            continue
        eps = [tp["dates"][0][0] for _, tp in lst]
        if len(set(eps)) != len(eps):
            continue
        srt = sorted(lst, key=lambda x: x[1]["dates"][0][0])
        fams.append({"kind": "date", "direction": "cumulative", "template": tm,
                     "members": [{"key": m["key"], "x": tp["dates"][0][0]} for m, tp in srt]})
    return fams


def easy_hard_pairs(fam):
    """All ordered (easy_key, hard_key) pairs such that P(easy) >= P(hard) must hold."""
    mem = fam["members"]
    out = []
    n = len(mem)
    for i in range(n):
        for j in range(i + 1, n):
            lo, hi = mem[i]["key"], mem[j]["key"]       # x_i < x_j
            if fam["kind"] == "threshold":
                if fam["direction"] == "upper":
                    out.append((lo, hi))               # lower K is easier
                else:
                    out.append((hi, lo))               # higher K is easier
            else:
                out.append((hi, lo))                    # later date is easier
    return out


def all_families(universe_by_venue, kalshi_events, snap_epoch):
    """Group tradable markets into candidate groups and detect families.
    Returns list of families with venue/group metadata."""
    from datetime import datetime, timezone
    default_year = datetime.fromtimestamp(snap_epoch, timezone.utc).year
    fams = []
    for venue, ms in universe_by_venue.items():
        groups = defaultdict(list)
        for m in ms:
            if not m.get("tradable"):
                continue
            if venue == "kalshi" and not m.get("quoted"):
                continue
            g = m["event_key"]
            if venue == "xo":
                g = "xo:all"            # XO has no event endpoint: wording templates do the grouping
            if venue == "limitless" and not m.get("group_id"):
                g = "lm:all"
            groups[g].append(m)
        for g, members in groups.items():
            if len(members) < 2:
                continue
            if g in ("xo:all", "lm:all"):
                # sub-group by coarse first-3-token prefix to keep template buckets meaningful
                pass
            for f in families_for_group(members, default_year, ref_epoch=snap_epoch):
                f["venue"] = venue
                f["group"] = g
                fams.append(f)
    return fams
