import json, os, collections
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(BASE, "raw", "kalshi_events.json")))
evs = d["events"]
print("fetched_at", d["fetched_at"], "events", len(evs))
mk = [(e, m) for e in evs for m in (e.get("markets") or [])]
print("markets", len(mk))
print("event keys:", collections.Counter(k for e in evs for k in e).most_common(40))
print("market keys:", collections.Counter(k for _, m in mk for k in m).most_common(90))
sizes = collections.Counter(len(e.get("markets") or []) for e in evs)
print("markets/event hist (1,2,3,4-5,6-10,11-50,>50):", [sum(c for s, c in sizes.items() if lo <= s <= hi) for lo, hi in [(1,1),(2,2),(3,3),(4,5),(6,10),(11,50),(51,10**6)]])
print("mutually_exclusive:", collections.Counter(str(e.get("mutually_exclusive")) for e in evs))
multi = [e for e in evs if len(e.get("markets") or []) > 1]
print("multi-market events", len(multi), "mutually_exclusive among multi:", collections.Counter(str(e.get("mutually_exclusive")) for e in multi))
print("collateral_return_type", collections.Counter(str(e.get("collateral_return_type")) for e in evs))
print("category", collections.Counter(str(e.get("category")) for e in evs).most_common(15))
print("strike_period / strike_date nonnull:", sum(1 for e in evs if e.get("strike_period")), sum(1 for e in evs if e.get("strike_date")))
print("market_type", collections.Counter(str(m.get("market_type")) for _, m in mk))
print("strike_type", collections.Counter(str(m.get("strike_type")) for _, m in mk))
for k in ["floor_strike", "cap_strike", "functional_strike", "custom_strike", "mve_collection_ticker", "mve_selected_legs", "rules_primary", "rules_secondary", "settlement_sources", "can_close_early", "early_close_condition", "primary_participant_key", "is_provisional", "settlement_bounds_type", "yes_sub_title", "response_price_units"]:
    print("market", k, "nonempty", sum(1 for _, m in mk if m.get(k) not in (None, "", [], {}, False)))
print("custom_strike samples:", [json.dumps(m.get("custom_strike"))[:100] for _, m in mk if m.get("custom_strike")][:6])
print("settlement_sources on event?", sum(1 for e in evs if e.get("settlement_sources")))
# series_ticker
print("series_ticker distinct", len(set(e.get("series_ticker") for e in evs)))
sc = collections.Counter(e.get("series_ticker") for e in evs)
print("events per series top:", sc.most_common(15))
print("series with >1 event in sample:", sum(1 for s, c in sc.items() if c > 1), "of", len(sc))
# strike_type for multi-market events
mm = collections.Counter()
for e in multi:
    ms = e["markets"]
    st = tuple(sorted(set(str(m.get("strike_type")) for m in ms)))
    mm[(st, str(e.get("mutually_exclusive")))] += 1
print("multi-market (strike_type set, ME):", mm.most_common(12))
# Example
for e in multi[:0]:
    pass
