import json, os, re, collections
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def L(n): return json.load(open(os.path.join(BASE,'raw',n)))
poly=L('poly_events.json'); kal=L('kalshi_events.json'); lim=L('limitless_active.json'); xo=L('xo_active_list.json'); xofull=L('xo_active_full.json'); mil=L('kalshi_milestones.json')
out={}
# Polymarket
ev=poly['events']; mk=[(e,m) for e in ev for m in e['markets']]
ne=lambda v: v not in (None,'',[],{},False)
sport=lambda e: any(t.get('slug')=='sports' for t in e.get('tags',[]))
out['polymarket']=dict(snapshot=poly['fetched_at'],sample='first 800 open events by volume24hr desc (events/keyset, limit 100 x 8); heavy in sports',
  events=len(ev),markets=len(mk),sports_events=sum(sport(e) for e in ev),
  multi_market_events=sum(len(e['markets'])>1 for e in ev),
  negRisk_events=sum(bool(e.get('negRisk')) for e in ev),negRisk_markets=sum(bool(m.get('negRisk')) for _,m in mk),negRiskAugmented_events=sum(bool(e.get('negRiskAugmented')) for e in ev),
  negRiskOther_markets=sum(bool(m.get('negRiskOther')) for _,m in mk),
  events_with_series=sum(ne(e.get('series')) for e in ev),events_with_parentEventId=sum(ne(e.get('parentEventId')) for e in ev),
  events_with_eventMetadata=sum(ne(e.get('eventMetadata')) for e in ev),events_with_gameId=sum(ne(e.get('gameId')) for e in ev),
  distinct_tag_slugs=len({t.get('slug') for e in ev for t in e.get('tags',[])}),mean_tags_per_event=round(sum(len(e.get('tags',[])) for e in ev)/len(ev),2),
  markets_with_groupItemTitle=sum(ne(m.get('groupItemTitle')) for _,m in mk),markets_with_groupItemThreshold=sum(ne(m.get('groupItemThreshold')) for _,m in mk),
  markets_with_sportsMarketType=sum(ne(m.get('sportsMarketType')) for _,m in mk),markets_with_line=sum(ne(m.get('line')) for _,m in mk),
  markets_comboStatus_enabled=sum(m.get('comboStatus')=='enabled' for _,m in mk),
  note='groupItemThreshold is an ordinal display index (values 0,1,2.. repeat across events), not a numeric threshold')
ns=[e for e in ev if not sport(e)]
out['polymarket']['non_sports']=dict(events=len(ns),markets=sum(len(e['markets']) for e in ns),multi_market=sum(len(e['markets'])>1 for e in ns),negRisk=sum(bool(e.get('negRisk')) for e in ns),augmented=sum(bool(e.get('negRiskAugmented')) for e in ns))
# Kalshi
ke=kal['events']; km=[(e,m) for e in ke for m in (e.get('markets') or [])]
out['kalshi']=dict(snapshot=kal['fetched_at'],sample='first 2400 open events (events?status=open&with_nested_markets=true, 12 pages x 200; cursor still non-empty); 46% of events are two series KXMIDTERMMOV/KXMIDTERMVOTETURN',
  events=len(ke),markets=len(km),distinct_series=len({e['series_ticker'] for e in ke}),
  mutually_exclusive_events=sum(bool(e.get('mutually_exclusive')) for e in ke),collateral_return_type=dict(collections.Counter(e.get('collateral_return_type') for e in ke)),
  multi_market_events=sum(len(e.get('markets') or [])>1 for e in ke),
  strike_type=dict(collections.Counter(str(m.get('strike_type')) for _,m in km)),markets_with_floor_strike=sum(m.get('floor_strike') is not None for _,m in km),markets_with_cap_strike=sum(m.get('cap_strike') is not None for _,m in km),markets_with_custom_strike=sum(ne(m.get('custom_strike')) for _,m in km),
  events_with_strike_date=sum(ne(e.get('strike_date')) for e in ke),events_with_strike_period=sum(ne(e.get('strike_period')) for e in ke),events_with_product_metadata=sum(ne(e.get('product_metadata')) for e in ke),
  events_with_settlement_sources=sum(ne(e.get('settlement_sources')) for e in ke),markets_with_rules_secondary=sum(ne(m.get('rules_secondary')) for _,m in km),markets_with_early_close_condition=sum(ne(m.get('early_close_condition')) for _,m in km),
  markets_market_type=dict(collections.Counter(m.get('market_type') for _,m in km)))
ms=mil['milestones']
out['kalshi']['milestones']=dict(snapshot=mil['fetched_at'],sample='8 pages x 500 with minimum_start_date=2026-09-01 (cursor still non-empty)',n=len(ms),by_category=dict(collections.Counter(m['category'] for m in ms)),with_related_gt1=sum(len(m['related_event_tickers'])>1 for m in ms),spanning_multiple_series=sum(len({t.split('-')[0] for t in m['related_event_tickers']})>1 for m in ms),with_sportradar_source_id=sum(str(m.get('source_id','')).startswith('sr:') for m in ms))
# Limitless
rows=lim['rows']; md=lambda r: r.get('metadata') or {}
out['limitless']=dict(snapshot=lim['fetched_at'],sample='top 100 of ~501 active markets, sortBy=high_value (4 pages x 25)',n=len(rows),marketType=dict(collections.Counter(r.get('marketType') for r in rows)),
  with_externalSlug=sum(bool(md(r).get('externalSlug')) for r in rows),externalProvider=dict(collections.Counter(md(r).get('externalProvider') for r in rows)),isPolyArbitrage=sum(bool(md(r).get('isPolyArbitrage')) for r in rows),
  with_externalRulesWatch=sum(bool(md(r).get('externalRulesWatch')) for r in rows),metadata_type_ladder=sum(md(r).get('type')=='ladder' for r in rows),with_eventId=sum(bool(md(r).get('eventId')) for r in rows))
# XO
rs=xo['rows']
out['xo']=dict(snapshot=xo['fetched_at'],sample='all ACTIVE rows with marketScope=withClob (6 pages x 50)',n=len(rs),types=dict(collections.Counter(r['type'] for r in rs)),sports=sum(r['categoryPath'][0]['name']=='SPORTS' for r in rs if r.get('categoryPath')),
  top_creator_account_market_count=collections.Counter(r['creator']['id'] for r in rs if r.get('creator')).most_common(1)[0][1],distinct_creator_accounts=len({r['creator']['id'] for r in rs if r.get('creator')}),
  list_rows_have_rootEventSlug=any('rootEventSlug' in r for r in rs),full_rows_fetched=len(xofull['markets']),full_rows_with_rootEventSlug=sum(bool(m.get('rootEventSlug')) for m in xofull['markets']),full_rows_tags_nonnull=sum(bool(m.get('tags')) for m in xofull['markets']),
  ucl_matches_as_triples=18)
json.dump(out,open(os.path.join(BASE,'raw','native_grouping_coverage.json'),'w'),indent=1)
print(json.dumps(out,indent=1)[:6000])
