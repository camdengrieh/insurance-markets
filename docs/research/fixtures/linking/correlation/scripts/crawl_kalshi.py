import sys, json, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import pmhttp as h
K="https://external-api.kalshi.com/trade-api/v2"
out=[]
cursor=None
pages=0
while pages<80:
    p={"status":"open","limit":200,"with_nested_markets":"true"}
    if cursor: p["cursor"]=cursor
    d=h.get_json(K+"/events",p)
    pages+=1
    for e in d.get('events',[]):
        ms=[]
        for m in e.get('markets',[]):
            ms.append({k:m.get(k) for k in ("ticker","title","yes_sub_title","status","close_time","expected_expiration_time","yes_bid_dollars","yes_ask_dollars","last_price_dollars","volume_24h_fp","volume_fp","open_interest_fp","market_type")})
        out.append({"event_ticker":e['event_ticker'],"series_ticker":e.get('series_ticker'),"title":e['title'],"category":e.get('category'),"mutually_exclusive":e.get('mutually_exclusive'),"markets":ms})
    cursor=d.get('cursor')
    if not cursor: break
print("pages",pages,"events",len(out), file=sys.stderr)
json.dump(out,open('out/kalshi_open_events.json','w'))
