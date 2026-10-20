import sys, json, time
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
import pmhttp as h
G="https://gamma-api.polymarket.com"
out=[]
cursor=None
pages=0
while pages<40:
    p={"closed":"false","active":"true","limit":100,"order":"volume24hr","ascending":"false"}
    if cursor: p["after_cursor"]=cursor
    d=h.get_json(G+"/events/keyset",p)
    pages+=1
    if '_error' in d:
        print(d, file=sys.stderr); break
    for e in d.get('events',[]):
        ms=[]
        for m in e.get('markets',[]):
            ms.append({k:m.get(k) for k in ("id","conditionId","slug","question","groupItemTitle","outcomes","outcomePrices","clobTokenIds","endDate","volume24hr","volumeNum","liquidityNum","bestBid","bestAsk","lastTradePrice","negRisk","active","closed","acceptingOrders","feesEnabled","feeSchedule")})
        out.append({"id":e.get('id'),"slug":e.get('slug'),"title":e.get('title'),"endDate":e.get('endDate'),"volume24hr":e.get('volume24hr'),"volume":e.get('volume'),"liquidity":e.get('liquidity'),"negRisk":e.get('negRisk'),"tags":[t.get('slug') for t in e.get('tags',[])],"markets":ms})
    cursor=d.get('next_cursor')
    if not cursor: break
    if out and (out[-1].get('volume24hr') or 0) < 2000: break
print("pages",pages,"events",len(out), file=sys.stderr)
json.dump(out,open('out/poly_open_events.json','w'))
