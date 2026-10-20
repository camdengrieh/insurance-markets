import json, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phttp as H
BASE=H.BASE
rows=json.load(open(BASE+'/raw/xo_active_list.json'))['rows']
ns=[r for r in rows if (r.get('categoryPath') or [{}])[0].get('name') not in ('SPORTS','PULSE') and r['type']!=3]
print('XO non-sports non-pulse ACTIVE:',len(ns))
def clean(t):
    t=re.sub(r'\?','',t)
    t=re.sub(r'\b(Will|will)\b','',t)
    return ' '.join(t.split())[:90]
out=[]
for r in ns:
    q=clean(r['title'])
    s,j=H.get_json('https://gamma-api.polymarket.com/public-search?q='+urllib.parse.quote(q)+'&limit_per_type=3&events_status=active&search_tags=false&search_profiles=false')
    evs=[]
    if s==200 and j:
        for e in j.get('events',[])[:3]:
            evs.append(dict(title=e.get('title'),slug=e.get('slug'),endDate=e.get('endDate'),negRisk=e.get('negRisk'),n_markets=len(e.get('markets',[])),
                markets=[dict(q=m.get('question'),git=m.get('groupItemTitle'),end=m.get('endDate'),bid=m.get('bestBid'),ask=m.get('bestAsk'),closed=m.get('closed')) for m in e.get('markets',[])[:60]]))
    out.append(dict(xo_id=r['id'],xo_title=r['title'],expires=r['expiresAt'],cat=[c['name'] for c in r['categoryPath']],status=s,events=evs))
json.dump({'fetched_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'results':out},open(BASE+'/raw/xo_nonsports_poly_search.json','w'))
print('done',len(out),'with>=1 event',sum(1 for o in out if o['events']))
