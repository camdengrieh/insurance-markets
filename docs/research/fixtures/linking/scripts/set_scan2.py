"""v2 within-venue consistency scan: set sums with fees, strict threshold ladders, date ladders. Gross and net-of-fee.
Fee model (research docs 08/10): Polymarket taker fee/share = feeSchedule.rate * p*(1-p) (per-market rate; 0 if feesEnabled false);
Kalshi taker fee/share ~= 0.07 * p*(1-p) * fee_multiplier (multiplier 1 assumed; coefficient 0.07 is MEDIUM confidence; ignores cent rounding).
All numbers are best bid/ask only (top of book, size ignored) from listing endpoints at snapshot time.
"""
import json, os, re, collections, datetime
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
poly = json.load(open(os.path.join(BASE, "raw", "poly_events.json")))
kal = json.load(open(os.path.join(BASE, "raw", "kalshi_events.json")))
def f(x):
    try: return float(x)
    except Exception: return None

def pm_rate(m):
    if m.get("feesEnabled") is False: return 0.0
    fs = m.get("feeSchedule") or {}
    return float(fs.get("rate", 0.0) or 0.0)

res = {"snapshot": {"polymarket": poly["fetched_at"], "kalshi": kal["fetched_at"]}}

# ---------- set sums ----------
def set_stats(rows, label):
    full = [r for r in rows if r["n_bid"] == r["n"] and r["n_ask"] == r["n"]]
    sell = [r for r in full if r["sum_bid"] > 1 + 1e-9]
    buy = [r for r in full if r["sum_ask"] < 1 - 1e-9]
    sell_net = [r for r in sell if r["sum_bid"] - 1 - r["fee_sell"] > 0]
    buy_net = [r for r in buy if 1 - r["sum_ask"] - r["fee_buy"] > 0]
    print(f"{label}: sets={len(rows)} fully-quoted={len(full)}")
    print(f"   sell-all-YES gross>0: {len(sell)} (net of fee >0: {len(sell_net)}), max gross {max([r['sum_bid']-1 for r in sell], default=0):.3f}")
    print(f"   buy-all-YES  gross>0: {len(buy)} (net of fee >0: {len(buy_net)}), max gross {max([1-r['sum_ask'] for r in buy], default=0):.3f}; of these augmented/has_other: {sum(1 for r in buy if r['aug'] or r['has_other'])}")
    return dict(n_sets=len(rows), n_fully_quoted=len(full), sell_gross_pos=len(sell), sell_net_pos=len(sell_net), buy_gross_pos=len(buy), buy_net_pos=len(buy_net),
                buy_gross_pos_augmented_or_other=sum(1 for r in buy if r['aug'] or r['has_other']),
                max_sell_gross=max([r['sum_bid']-1 for r in sell], default=0), max_buy_gross=max([1-r['sum_ask'] for r in buy], default=0),
                examples_sell=[(r['title'], round(r['sum_bid'],3), r['n'], round(r['fee_sell'],3)) for r in sorted(sell, key=lambda r: -(r['sum_bid']-1))[:4]],
                examples_buy=[(r['title'], round(r['sum_ask'],3), r['n'], r['aug'], r['has_other']) for r in sorted(buy, key=lambda r: r['sum_ask'])[:4]])

pm_rows = []
for e in poly["events"]:
    if not e.get("negRisk"): continue
    ms = [m for m in e["markets"] if m.get("active") and not m.get("closed") and m.get("acceptingOrders")]
    if len(ms) < 2: continue
    b = [f(m.get("bestBid")) for m in ms]; a = [f(m.get("bestAsk")) for m in ms]
    qb = [x if (x is not None and x > 0) else None for x in b]; qa = [x if (x is not None and x < 1) else None for x in a]
    fs = sum(pm_rate(m) * x * (1 - x) for m, x in zip(ms, qb) if x is not None)
    fb = sum(pm_rate(m) * x * (1 - x) for m, x in zip(ms, qa) if x is not None)
    pm_rows.append(dict(title=e["title"], n=len(ms), n_bid=sum(x is not None for x in qb), n_ask=sum(x is not None for x in qa), sum_bid=sum(x for x in qb if x is not None), sum_ask=sum(x for x in qa if x is not None), fee_sell=fs, fee_buy=fb, aug=bool(e.get("negRiskAugmented")), has_other=any(m.get("negRiskOther") for m in ms)))
res["polymarket_negrisk"] = set_stats(pm_rows, "Polymarket negRisk")

k_rows = []
for e in kal["events"]:
    if not e.get("mutually_exclusive"): continue
    ms = [m for m in (e.get("markets") or []) if m.get("status") == "active"]
    if len(ms) < 2: continue
    b = [f(m.get("yes_bid_dollars")) for m in ms]; a = [f(m.get("yes_ask_dollars")) for m in ms]
    qb = [x if (x is not None and x > 0) else None for x in b]; qa = [x if (x is not None and x < 1) else None for x in a]
    fs = sum(0.07 * x * (1 - x) for x in qb if x is not None); fb = sum(0.07 * x * (1 - x) for x in qa if x is not None)
    k_rows.append(dict(title=e["title"], n=len(ms), n_bid=sum(x is not None for x in qb), n_ask=sum(x is not None for x in qa), sum_bid=sum(x for x in qb if x is not None), sum_ask=sum(x for x in qa if x is not None), fee_sell=fs, fee_buy=fb, aug=False, has_other=False))
res["kalshi_mutually_exclusive"] = set_stats(k_rows, "Kalshi mutually_exclusive")

# ---------- Kalshi strict threshold ladders (distinct floor_strike within same event, same strike_type family) ----------
def kalshi_rungs(e):
    ms = [m for m in (e.get("markets") or []) if m.get("status") == "active" and m.get("strike_type") in ("greater", "greater_or_equal") and m.get("floor_strike") is not None]
    groups = collections.defaultdict(list)
    for m in ms:
        key = (json.dumps(m.get("custom_strike"), sort_keys=True) if False else m.get("close_time"), json.dumps({k: v for k, v in (m.get("custom_strike") or {}).items() if k not in ("Date", "Policy")}, sort_keys=True))
        groups[key].append(m)
    return [g for g in groups.values() if len({m["floor_strike"] for m in g}) >= 3]

n_lad = 0; n_pairs = 0; gross = []; net = []
for e in kal["events"]:
    for g in kalshi_rungs(e):
        g = sorted(g, key=lambda m: float(m["floor_strike"]))
        n_lad += 1
        for i in range(len(g)):
            for j in range(i + 1, len(g)):
                lo, hi = g[i], g[j]
                if float(lo["floor_strike"]) == float(hi["floor_strike"]): continue
                n_pairs += 1
                bh = f(hi["yes_bid_dollars"]); al = f(lo["yes_ask_dollars"])
                if bh is None or al is None or bh <= 0 or al >= 1: continue
                if bh > al + 1e-9:
                    fee = 0.07 * al * (1 - al) + 0.07 * bh * (1 - bh)
                    gross.append((bh - al, e["event_ticker"], lo["ticker"], hi["ticker"]))
                    if bh - al - fee > 0: net.append((bh - al - fee, e["event_ticker"], lo["ticker"], hi["ticker"]))
print(f"Kalshi strict threshold ladders (>=3 distinct strikes, same close_time): {n_lad}; pairs {n_pairs}; gross-violating pairs {len(gross)}; net-of-fee>0 {len(net)}")
for x in sorted(gross, reverse=True)[:4]: print("   ", x)
res["kalshi_threshold_ladders"] = dict(n_ladders=n_lad, pairs=n_pairs, gross_violating_pairs=len(gross), net_positive_pairs=len(net), top_gross=sorted(gross, reverse=True)[:5])

# ---------- Kalshi date ladders: equal floor_strike (or none), 'Before ...' style, ordered by close_time ----------
dl = 0; dpairs = 0; dgross = []; dnet = []
for e in kal["events"]:
    ms = [m for m in (e.get("markets") or []) if m.get("status") == "active" and "early if the event occurs" in (m.get("early_close_condition") or "") and re.match(r"^(Before|By)\b", m.get("yes_sub_title") or "")]
    if len(ms) < 3: continue
    ms = sorted(ms, key=lambda m: m["close_time"])
    if len({m["close_time"] for m in ms}) < 3: continue
    dl += 1
    for i in range(len(ms)):
        for j in range(i + 1, len(ms)):
            ea, la = ms[i], ms[j]
            dpairs += 1
            be = f(ea["yes_bid_dollars"]); al = f(la["yes_ask_dollars"])
            if be is None or al is None or be <= 0 or al >= 1: continue
            if be > al + 1e-9:
                fee = 0.07 * al * (1 - al) + 0.07 * be * (1 - be)
                dgross.append((be - al, e["event_ticker"], ea["ticker"], la["ticker"]))
                if be - al - fee > 0: dnet.append((be - al - fee, e["event_ticker"], ea["ticker"], la["ticker"]))
print(f"Kalshi 'Before <date>' hit-by-date ladders (>=3 close times): {dl}; pairs {dpairs}; gross-violating {len(dgross)}; net>0 {len(dnet)}")
for x in sorted(dgross, reverse=True)[:4]: print("   ", x)
res["kalshi_date_ladders"] = dict(n_ladders=dl, pairs=dpairs, gross_violating_pairs=len(dgross), net_positive_pairs=len(dnet), top_gross=sorted(dgross, reverse=True)[:5])

# ---------- Polymarket numeric touch ladders (arrows) ----------
def pm_threshold(m):
    t = (m.get("groupItemTitle") or "")
    mt = re.match(r"^\s*([↑↓])\s*\$?([\d,]+(?:\.\d+)?)\s*([kKmMbB]?)\s*$", t)
    if not mt: return None
    v = float(mt.group(2).replace(",", "")) * {"": 1, "k": 1e3, "m": 1e6, "b": 1e9}[mt.group(3).lower()]
    return ("up" if mt.group(1) == "↑" else "down", v)
tl = 0; tp = 0; tg = []; tn = []
for e in poly["events"]:
    if e.get("negRisk"): continue
    ms = [m for m in e["markets"] if m.get("active") and not m.get("closed") and m.get("acceptingOrders")]
    parsed = [(pm_threshold(m), m) for m in ms]; parsed = [(p, m) for p, m in parsed if p]
    for d in ("up", "down"):
        sel = sorted([(p[1], m) for p, m in parsed if p[0] == d], key=lambda x: x[0])
        if len(sel) < 3: continue
        tl += 1
        for i in range(len(sel)):
            for j in range(i + 1, len(sel)):
                less, more = (sel[i][1], sel[j][1]) if d == "up" else (sel[j][1], sel[i][1])
                tp += 1
                bm = f(more.get("bestBid")); al = f(less.get("bestAsk"))
                if bm is None or al is None or bm <= 0 or al >= 1: continue
                if bm > al + 1e-9:
                    fee = pm_rate(less) * al * (1 - al) + pm_rate(more) * bm * (1 - bm)
                    tg.append((bm - al, e["title"]));
                    if bm - al - fee > 0: tn.append((bm - al - fee, e["title"]))
print(f"Polymarket touch ladders (arrow titles, >=3 rungs): {tl}; pairs {tp}; gross-violating {len(tg)}; net>0 {len(tn)}")
res["polymarket_touch_ladders"] = dict(n_ladders=tl, pairs=tp, gross_violating_pairs=len(tg), net_positive_pairs=len(tn))

# ---------- Polymarket 'by <date>' cumulative ladders (non-negRisk, >=3 markets, all questions contain 'by' or 'before', distinct endDate) ----------
dl2 = 0; dp2 = 0; dg2 = []; dn2 = []
for e in poly["events"]:
    if e.get("negRisk"): continue
    ms = [m for m in e["markets"] if m.get("active") and not m.get("closed") and m.get("acceptingOrders") and m.get("endDate")]
    if len(ms) < 3: continue
    if not all(re.search(r"\b(by|before)\b", m.get("question", ""), re.I) for m in ms): continue
    if any(re.search(r"\b(through|remain|continue|still|stay)", m.get("question", ""), re.I) for m in ms): continue
    ms = sorted(ms, key=lambda m: m["endDate"])
    if len({m["endDate"] for m in ms}) < 3: continue
    dl2 += 1
    for i in range(len(ms)):
        for j in range(i + 1, len(ms)):
            ea, la = ms[i], ms[j]
            dp2 += 1
            be = f(ea.get("bestBid")); al = f(la.get("bestAsk"))
            if be is None or al is None or be <= 0 or al >= 1: continue
            if be > al + 1e-9:
                fee = pm_rate(la) * al * (1 - al) + pm_rate(ea) * be * (1 - be)
                dg2.append((be - al, e["title"], ea["question"][:70], la["question"][:70]))
                if be - al - fee > 0: dn2.append((be - al - fee, e["title"]))
print(f"Polymarket 'by/before <date>' ladders: {dl2}; pairs {dp2}; gross-violating {len(dg2)}; net>0 {len(dn2)}")
for x in sorted(dg2, reverse=True)[:4]: print("   ", x)
res["polymarket_date_ladders"] = dict(n_ladders=dl2, pairs=dp2, gross_violating_pairs=len(dg2), net_positive_pairs=len(dn2), top_gross=sorted(dg2, reverse=True)[:4])
json.dump(res, open(os.path.join(BASE, "raw", "set_scan2_result.json"), "w"), indent=1, default=str)
