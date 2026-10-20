import sys,json,random,datetime,statistics,os,collections; sys.path.insert(0,os.environ['SCRATCH']+'/work')
from xoclient import get, used
S=os.environ['SCRATCH']
da={r['conditionId']:r for r in json.load(open(S+'/work/dataapi_t4.json'))}
ch={r['cond']:r for r in json.load(open(S+'/work/conviction_joined.json'))}
now=datetime.datetime.now(datetime.UTC).timestamp()
act=[c for c,r in da.items() if r['status']=='ACTIVE' and datetime.datetime.fromisoformat(r['expiresAt'].replace('Z','+00:00')).timestamp()>now]
random.seed(5)
sample=random.sample(act,25)
out=[]
for c in sample:
    r=da[c]; tok=r['outcomes'][0]['outcomeTokenId']
    st,b,h=get(f'https://orderbooks.xo.market/book?token_id={tok}')
    d=json.loads(b) if st==200 else {}
    bids=d.get('bids',[]); asks=d.get('asks',[])
    # stake estimate for each resting order: size*price for bids (buy YES), size*(1-price) for asks (buy NO)
    stakes=[float(x['size'])*float(x['price']) for x in bids]+[float(x['size'])*(1-float(x['price'])) for x in asks]
    out.append({'path':ch[c]['first_dec'],'vol':float(r['totalVolumeInUSD']),'nbids':len(bids),'nasks':len(asks),'stakes':[round(s,2) for s in stakes],'last_update_id':d.get('last_update_id'),'age_h':round((now-ch[c]['created_ts'])/3600,1)})
json.dump(out,open(S+'/work/seed_books.json','w'))
print('active unexpired total',len(act),'sampled',len(out),'used',used('orderbooks.xo.market'))
print('empty books:',sum(1 for x in out if not x['nbids'] and not x['nasks']))
print('with exactly one resting order:',sum(1 for x in out if x['nbids']+x['nasks']==1))
for x in out: print(x)
