"""Cluster registry: which venue/market legs form each relationship cluster.

Resolves Polymarket token ids from a Gamma snapshot (out/poly_open_events.json) and Kalshi
series tickers from a Kalshi snapshot (out/kalshi_open_events.json); both snapshots were taken
2026-10-18/19 (see notes).  Output: out/registry.json.

Leg id convention:  PM_* = Polymarket YES token, K_* = Kalshi YES market.
"""
import json
import os
import re
import sys

OUT = os.environ.get("PM_OUT_DIR", "out")


def fl(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def load_snapshots():
    pm = json.load(open(os.path.join(OUT, "poly_open_events.json")))
    ka = json.load(open(os.path.join(OUT, "kalshi_open_events.json")))
    return pm, ka


def pm_find(pm, slug_prefix, qregex, include_closed=False):
    """Return the OPEN (closed==False) market matching qregex with the largest volume."""
    best = None
    for e in pm:
        if e["slug"].startswith(slug_prefix):
            for m in e["markets"]:
                if m.get("closed") and not include_closed:
                    continue
                if re.search(qregex, m["question"], re.I):
                    v = fl(m.get("volumeNum"))
                    if best is None or v > best[0]:
                        best = (v, e, m)
    if best is None:
        raise KeyError((slug_prefix, qregex))
    _, e, m = best
    toks = json.loads(m["clobTokenIds"])
    return {"venue": "PM", "event_slug": e["slug"], "question": m["question"], "token": toks[0],
            "condition": m["conditionId"], "end": (m["endDate"] or "")[:10],
            "fee_rate": (m.get("feeSchedule") or {}).get("rate"), "fees_enabled": m.get("feesEnabled"),
            "snap_bid": m.get("bestBid"), "snap_ask": m.get("bestAsk"), "snap_vol": m.get("volumeNum")}


def k_find(ka, ticker):
    for e in ka:
        for m in e["markets"]:
            if m["ticker"] == ticker:
                return {"venue": "K", "event": e["event_ticker"], "series": e["series_ticker"], "ticker": ticker,
                        "title": m["title"], "sub": m["yes_sub_title"], "close": (m["close_time"] or "")[:10],
                        "snap_bid": m["yes_bid_dollars"], "snap_ask": m["yes_ask_dollars"], "snap_vol": m["volume_fp"]}
    raise KeyError(ticker)


def pm_from_search(slug, qregex):
    """Resolved Polymarket market from a (cached) Gamma public-search result (closed events are not in the open-events snapshot)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import pmhttp as h
    d = h.get_json("https://gamma-api.polymarket.com/public-search", {"q": "Fed decision in September", "limit_per_type": 5, "events_status": "closed"})
    for e in d.get("events", []):
        if e["slug"] == slug:
            for m in e["markets"]:
                if re.search(qregex, m["question"], re.I):
                    toks = json.loads(m["clobTokenIds"])
                    return {"venue": "PM", "event_slug": e["slug"], "question": m["question"], "token": toks[0], "condition": m["conditionId"],
                            "end": (m["endDate"] or "")[:10], "fee_rate": (m.get("feeSchedule") or {}).get("rate"),
                            "fees_enabled": m.get("feesEnabled"), "snap_bid": m.get("bestBid"), "snap_ask": m.get("bestAsk"),
                            "snap_vol": m.get("volumeNum"), "resolved": True}
    raise KeyError((slug, qregex))


def k_from_api(event_ticker, ticker):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import pmhttp as h
    d = h.get_json("https://external-api.kalshi.com/trade-api/v2/events/%s" % event_ticker, {"with_nested_markets": "true"})
    for m in (d.get("markets") or d["event"].get("markets") or []):
        if m["ticker"] == ticker:
            return {"venue": "K", "event": event_ticker, "series": d["event"]["series_ticker"], "ticker": ticker, "title": m["title"],
                    "sub": m["yes_sub_title"], "close": (m["close_time"] or "")[:10], "snap_bid": m["yes_bid_dollars"],
                    "snap_ask": m["yes_ask_dollars"], "snap_vol": m["volume_fp"], "resolved": True}
    raise KeyError(ticker)


def build():
    pm, ka = load_snapshots()
    L = {}
    P = lambda name, slug, q: L.__setitem__(name, pm_find(pm, slug, q))
    K = lambda name, tk: L.__setitem__(name, k_find(ka, tk))
    # --- Polymarket legs
    P("PM_SEN_D", "which-party-will-win-the-senate-in-2026", r"Democratic Party control the Senate")
    P("PM_HOU_D", "which-party-will-win-the-house-in-2026", r"Democratic Party control the House")
    P("PM_FED_H0", "fed-decision-in-october", r"no change")
    P("PM_FED_H25", "fed-decision-in-october", r"increase interest rates by 25")
    P("PM_BOP_DD", "balance-of-power-2026-midterms", r"D Senate, D House")
    P("PM_BOP_DSRH", "balance-of-power-2026-midterms", r"D Senate, R House")
    P("PM_TX_D", "texas-senate-election-winner", r"Democrats win the Texas Senate")
    P("PM_VANCE_NOM", "republican-presidential-nominee-2028", r"J\.?D\.? Vance")
    P("PM_VANCE_WIN", "presidential-election-winner-2028", r"JD Vance")
    P("PM_NEWSOM_NOM", "democratic-presidential-nominee-2028", r"Gavin Newsom")
    P("PM_NEWSOM_WIN", "presidential-election-winner-2028", r"Gavin Newsom")
    P("PM_NBA_OKC_CH", "nba-2027-champion", r"Oklahoma City Thunder")
    P("PM_NBA_OKC_W", "nba-2027-western-conference-champion", r"Oklahoma City Thunder")
    P("PM_BTC_90K", "what-price-will-bitcoin-hit-before-2027", r"reach \$90,000")
    P("PM_BTC_100K", "what-price-will-bitcoin-hit-before-2027", r"reach \$100,000")
    P("PM_BTC_110K", "what-price-will-bitcoin-hit-before-2027", r"reach \$110,000")
    P("PM_BTC_120K", "what-price-will-bitcoin-hit-before-2027", r"reach \$120,000")
    P("PM_ETH_3500", "what-price-will-ethereum-hit-before-2027", r"reach \$3,500")
    P("PM_IRAN_OCT22", "us-iran-ceasefire-continues-throughptptpt", r"through October 22\?")
    P("PM_IRAN_OCT31", "us-iran-ceasefire-continues-throughptptpt", r"through October 31\?")
    P("PM_IRAN_NOV15", "us-iran-ceasefire-continues-throughptptpt", r"through November 15\?")
    P("PM_IRAN_NOV30", "us-iran-ceasefire-continues-throughptptpt", r"through November 30\?")
    P("PM_IRAN_DEC31", "us-iran-ceasefire-continues-throughptptpt", r"through December 31\?")
    P("PM_WTI_H110", "what-price-will-wti-hit-in-october-2026", r"\(HIGH\) \$110 in October")
    P("PM_WTI_H105", "what-price-will-wti-hit-in-october-2026", r"\(HIGH\) \$105 in October")
    P("PM_WTI_L85", "what-price-will-wti-hit-in-october-2026", r"\(LOW\) \$85 in October")
    # --- resolved (non-survivor) legs: used as a survivorship control
    L["PM_IRAN_OCT9"] = pm_find(pm, "us-iran-ceasefire-continues-throughptptpt", r"through October 9\?", include_closed=True)
    L["PM_IRAN_OCT12"] = pm_find(pm, "us-iran-ceasefire-continues-throughptptpt", r"through October 12\?", include_closed=True)
    L["PM_IRAN_OCT15"] = pm_find(pm, "us-iran-ceasefire-continues-throughptptpt", r"through October 15\?", include_closed=True)
    L["PM_FEDSEP_H25"] = pm_from_search("fed-decision-in-september-762", r"increase interest rates by 25")
    L["PM_FEDSEP_H0"] = pm_from_search("fed-decision-in-september-762", r"no change")
    L["K_FEDSEP_H25"] = k_from_api("KXFEDDECISION-26SEP", "KXFEDDECISION-26SEP-H25")
    L["K_FEDSEP_H0"] = k_from_api("KXFEDDECISION-26SEP", "KXFEDDECISION-26SEP-H0")
    # --- Kalshi legs
    K("K_SEN_D", "CONTROLS-2026-D")
    K("K_HOU_D", "CONTROLH-2026-D")
    K("K_FED_H0", "KXFEDDECISION-26OCT-H0")
    K("K_FED_H25", "KXFEDDECISION-26OCT-H25")
    K("K_FED_H26", "KXFEDDECISION-26OCT-H26")
    K("K_FED_T400", "KXFED-26OCT-T4.00")
    K("K_BOP_DD", "KXBALANCEPOWERCOMBO-27FEB-DD")
    K("K_BOP_RD", "KXBALANCEPOWERCOMBO-27FEB-RD")
    K("K_TX_D", "SENATETX-26-D")
    K("K_VANCE_NOM", "KXPRESNOMR-28-JDV")
    K("K_VANCE_WIN", "KXPRESPERSON-28-JVAN")
    K("K_NEWSOM_NOM", "KXPRESNOMD-28-GN")
    K("K_NEWSOM_WIN", "KXPRESPERSON-28-GNEWS")
    K("K_NBA_OKC_W", "KXNBAWEST-27-OKC")
    K("K_BTC_100K", "KXBTCMAXY-26DEC31-99999.99")
    K("K_BTC_110K", "KXBTCMAXY-26DEC31-109999.99")
    K("K_BTC_120K", "KXBTCMAXY-26DEC31-119999.99")
    return L


# ---- relationship clusters ------------------------------------------------------------------
# kind: XV = same event on two venues; LAD = threshold/date ladder; PC = parent/child implication
# or identity; FAC = correlated factor.  For XV pairs a is Polymarket, b is Kalshi (YES-equivalent).
# 'res' = approximate resolution date used for capital-lock annualisation (UTC date).
# For PC: 'child' <= 'parent' (P(child) <= P(parent)); for 'ident': parent = sum(children).
CLUSTERS = [
    # (i) same event, two venues
    dict(id="X01_senate_D", kind="XV", a="PM_SEN_D", b="K_SEN_D", res="2026-11-04", note="Senate control, Democratic. Rule text differs (VP tiebreak / independents / early call) - see 08-venues notes"),
    dict(id="X02_house_D", kind="XV", a="PM_HOU_D", b="K_HOU_D", res="2026-11-04", note="House control, Democratic"),
    dict(id="X03_fed_oct_hold", kind="XV", a="PM_FED_H0", b="K_FED_H0", res="2026-10-28", note="FOMC Oct 2026, no change"),
    dict(id="X04_fed_oct_hike25", kind="XV", a="PM_FED_H25", b="K_FED_H25", res="2026-10-28", note="FOMC Oct 2026, +25bp"),
    dict(id="X05_bop_dem_sweep", kind="XV", a="PM_BOP_DD", b="K_BOP_DD", res="2026-11-04", note="Balance of power: Democrats sweep"),
    dict(id="X06_tx_senate_D", kind="XV", a="PM_TX_D", b="K_TX_D", res="2026-11-04", note="Texas Senate race, Democratic nominee wins"),
    dict(id="X07_vance_nominee", kind="XV", a="PM_VANCE_NOM", b="K_VANCE_NOM", res="2028-08-31", note="Vance GOP 2028 nomination"),
    dict(id="X08_newsom_nominee", kind="XV", a="PM_NEWSOM_NOM", b="K_NEWSOM_NOM", res="2028-08-31", note="Newsom Dem 2028 nomination"),
    dict(id="X09_vance_winner", kind="XV", a="PM_VANCE_WIN", b="K_VANCE_WIN", res="2028-11-08", note="Vance wins 2028 presidency"),
    dict(id="X10_okc_west", kind="XV", a="PM_NBA_OKC_W", b="K_NBA_OKC_W", res="2027-06-01", note="OKC wins 2027 West title (thin on PM)"),
    dict(id="X11_btc_100k_2026", kind="XV", a="PM_BTC_100K", b="K_BTC_100K", res="2026-12-31", note="BTC reaches $100k in 2026. NOT the same contract: PM = Binance 1m high 'reach', Kalshi = max-in-year rule; treat as basis pair"),
    # (i-b) RESOLVED same-event pairs (non-survivor control; analysed up to 1h before the FOMC statement)
    dict(id="XR1_fed_sep_hike25_resolved", kind="XV", a="PM_FEDSEP_H25", b="K_FEDSEP_H25", res="2026-09-16", valid_to="2026-09-16T17:00", note="RESOLVED control: FOMC Sep 2026 +25bp (resolved YES on both venues)"),
    dict(id="XR2_fed_sep_hold_resolved", kind="XV", a="PM_FEDSEP_H0", b="K_FEDSEP_H0", res="2026-09-16", valid_to="2026-09-16T17:00", note="RESOLVED control: FOMC Sep 2026 no change (resolved NO)"),
    # (ii) ladders (adjacent rungs; lo = lower threshold/earlier date => higher probability)
    dict(id="L01_pm_btc_100_110", kind="LAD", hi="PM_BTC_100K", lo="PM_BTC_110K", note="P(reach 110k) <= P(reach 100k)"),
    dict(id="L02_pm_btc_110_120", kind="LAD", hi="PM_BTC_110K", lo="PM_BTC_120K", note="P(reach 120k) <= P(reach 110k)"),
    dict(id="L03_pm_btc_90_100", kind="LAD", hi="PM_BTC_90K", lo="PM_BTC_100K", note="P(reach 100k) <= P(reach 90k)"),
    dict(id="L04_k_btc_100_110", kind="LAD", hi="K_BTC_100K", lo="K_BTC_110K", note="Kalshi max-BTC-2026 rungs"),
    dict(id="L05_k_btc_110_120", kind="LAD", hi="K_BTC_110K", lo="K_BTC_120K", note="Kalshi max-BTC-2026 rungs"),
    dict(id="L06_pm_iran_oct31_nov15", kind="LAD", hi="PM_IRAN_OCT31", lo="PM_IRAN_NOV15", note="ceasefire through later date <= earlier date"),
    dict(id="L07_pm_iran_nov15_nov30", kind="LAD", hi="PM_IRAN_NOV15", lo="PM_IRAN_NOV30", note="date ladder"),
    dict(id="L08_pm_iran_nov30_dec31", kind="LAD", hi="PM_IRAN_NOV30", lo="PM_IRAN_DEC31", note="date ladder"),
    dict(id="L09_pm_iran_oct22_oct31", kind="LAD", hi="PM_IRAN_OCT22", lo="PM_IRAN_OCT31", note="date ladder"),
    dict(id="L10_pm_wti_105_110", kind="LAD", hi="PM_WTI_H105", lo="PM_WTI_H110", note="WTI HIGH hit ladder, October"),
    dict(id="LR1_iran_oct9_oct12_resolved", kind="LAD", hi="PM_IRAN_OCT9", lo="PM_IRAN_OCT12", valid_to="2026-10-08T00:00", note="RESOLVED control: ceasefire date ladder (both resolved YES), analysed until 1 day before the earlier rung resolves"),
    dict(id="LR2_iran_oct12_oct15_resolved", kind="LAD", hi="PM_IRAN_OCT12", lo="PM_IRAN_OCT15", valid_to="2026-10-11T00:00", note="RESOLVED control: ceasefire date ladder"),
    # (iii) parent / child
    dict(id="P01_pm_vance_win_le_nom", kind="PC", child="PM_VANCE_WIN", parent="PM_VANCE_NOM", note="win presidency => nominee (ignores independent runs)"),
    dict(id="P02_pm_newsom_win_le_nom", kind="PC", child="PM_NEWSOM_WIN", parent="PM_NEWSOM_NOM", note="win presidency => nominee"),
    dict(id="P03_k_vance_win_le_nom", kind="PC", child="K_VANCE_WIN", parent="K_VANCE_NOM", note="Kalshi version"),
    dict(id="P04_k_newsom_win_le_nom", kind="PC", child="K_NEWSOM_WIN", parent="K_NEWSOM_NOM", note="Kalshi version"),
    dict(id="P05_pm_okc_champ_le_west", kind="PC", child="PM_NBA_OKC_CH", parent="PM_NBA_OKC_W", note="NBA champion => conference champion (PM, thin West market)"),
    dict(id="P06_xv_pm_vance_win_le_k_nom", kind="PC", child="PM_VANCE_WIN", parent="K_VANCE_NOM", note="cross-venue implication"),
    dict(id="P07_xv_k_vance_win_le_pm_nom", kind="PC", child="K_VANCE_WIN", parent="PM_VANCE_NOM", note="cross-venue implication"),
    dict(id="I01_pm_senateD_identity", kind="IDENT", parent="PM_SEN_D", children=["PM_BOP_DD", "PM_BOP_DSRH"], note="P(D Senate) = P(D sweep) + P(D Senate, R House)"),
    dict(id="I02_k_senateD_identity", kind="IDENT", parent="K_SEN_D", children=["K_BOP_DD", "K_BOP_RD"], note="Kalshi: D Senate = DD + 'R-House, D-Senate'"),
    dict(id="I03_k_fed_hike_identity", kind="IDENT", parent="K_FED_T400", children=["K_FED_H25", "K_FED_H26"], valid_from="2026-09-17", note="'rate > 4.00% after Oct' = hike 25 + hike >25 (assuming upper bound is 4.00% now)"),
    # (iv) correlated factors
    dict(id="F01_btc100k_vs_fed_hike25", kind="FAC", a="PM_BTC_100K", b="PM_FED_H25", note="crypto level vs rates (both PM)"),
    dict(id="F02_btc100k_vs_eth3500", kind="FAC", a="PM_BTC_100K", b="PM_ETH_3500", note="crypto vs crypto (both PM)"),
    dict(id="F03_iran_oct31_vs_wti110", kind="FAC", a="PM_IRAN_OCT31", b="PM_WTI_H110", note="geopolitics vs oil (both PM)"),
    dict(id="F04_senateD_vs_fed_hike25", kind="FAC", a="PM_SEN_D", b="PM_FED_H25", note="politics vs rates (both PM)"),
    dict(id="F05_k_btc100k_vs_k_fed_hike25", kind="FAC", a="K_BTC_100K", b="K_FED_H25", note="crypto vs rates (both Kalshi)"),
    dict(id="F06_pm_btc100k_vs_k_fed_hike25", kind="FAC", a="PM_BTC_100K", b="K_FED_H25", note="cross-venue factor pair"),
]

if __name__ == "__main__":
    L = build()
    json.dump({"legs": L, "clusters": CLUSTERS}, open(os.path.join(OUT, "registry.json"), "w"), indent=1)
    print(len(L), "legs;", len(CLUSTERS), "relationships")
    for k, v in L.items():
        print(k, v.get("question") or v.get("title"), v.get("end") or v.get("close"), v.get("snap_bid"), v.get("snap_ask"))
