import json, os, re, sys, time, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import phttp as H, unicodedata
BASE=H.BASE
rows=json.load(open(BASE+'/raw/xo_active_list.json'))['rows']
kal=json.load(open(BASE+'/raw/kalshi_KXUCLGAME.json'))
join=json.load(open(BASE+'/raw/xo_kalshi_ucl_join.json'))  # [sim, [teamA, teamB], kalshi_event_ticker]
kev={e['event_ticker']:e for e in kal}
def norm(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower().replace('/',' ')
    return ' '.join(t for t in re.sub(r'[^a-z0-9 ]',' ',s).split() if t not in('fc','kv','cf','sc','ac','as','fk','sk','afc','the','de','sporting'))
def sim(a,b):
    A=set(norm(a).split()); B=set(norm(b).split())
    if not A or not B: return 0
    n=sum(1 for t in A if t in B or any((t.startswith(u) or u.startswith(t)) and min(len(t),len(u))>=4 for u in B))
    return n/min(len(A),len(B))
# xo rows by title
by_title={r['title']:r for r in rows}
def book(token):
    s,j=H.get_json('https://orderbooks.xo.market/book?token_id='+token)
    if s!=200 or not j: return None
    return j
def best(b):
    bids=sorted([(float(x['price']),float(x['size'])) for x in b.get('bids',[])],reverse=True)
    asks=sorted([(float(x['price']),float(x['size'])) for x in b.get('asks',[])])
    return (bids[0] if bids else None, asks[0] if asks else None)
out=[]
for s,(ta,tb),kt in join:
    e=kev[kt]
    # outcomes: XO titles
    cand={}
    for t,r in by_title.items():
        if t==f'Draw: {ta} vs {tb}' or t==f'Draw: {tb} vs {ta}': cand['draw']=r
        m=re.match(r'^(.+) to win vs (.+)$',t)
        if m and {m.group(1),m.group(2)}=={ta,tb}: cand[m.group(1)]=r
    kmk={}
    for m in e['markets']:
        if m['yes_sub_title']=='Tie': kmk['draw']=m
        else: kmk[m['yes_sub_title']]=m
    for key,r in cand.items():
        if key=='draw': km=kmk['draw']
        else:
            km=max([m for k,m in kmk.items() if k!='draw'], key=lambda m: sim(key,m['yes_sub_title']))
            if sim(key,km['yes_sub_title'])<0.5: continue
        tok=[o['outcomeTokenId'] for o in r['outcomes'] if o['title']=='Yes'][0]
        b=book(tok)
        if not b: out.append(dict(xo=r['title'],err='nobook')); continue
        bb,ba=best(b)
        out.append(dict(xo=r['title'],kalshi=km['ticker'],xo_bid=bb,xo_ask=ba,k_bid=float(km['yes_bid_dollars']),k_ask=float(km['yes_ask_dollars']),k_bid_sz=float(km['yes_bid_size_fp']),k_ask_sz=float(km['yes_ask_size_fp'])))
json.dump({'fetched_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'pairs':out},open(BASE+'/raw/xo_kalshi_ucl_prices.json','w'),indent=0)
print(len(out))
