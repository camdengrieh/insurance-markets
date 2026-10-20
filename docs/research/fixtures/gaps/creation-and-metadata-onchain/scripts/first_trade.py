import sys,json,random,datetime,statistics,os; sys.path.insert(0,os.environ['SCRATCH']+'/work')
from xoclient import get, used
S=os.environ['SCRATCH']
da={r['conditionId']:r for r in json.load(open(S+'/work/dataapi_t4.json'))}
ch={r['cond']:r for r in json.load(open(S+'/work/conviction_joined.json'))}
act={}
for c,m in ch.items():
    if m['first_dec']=='APPROVE': act[c]=('approve',m['review_ts'])
    elif m['first_dec']=='UPDATE_REQUIRED' and m['resp'] and m['resp']['accepted']: act[c]=('update-accepted',m['resp']['ts'])
vol=[c for c in da if c in act and float(da[c]['totalVolumeInUSD'])>0]
random.seed(11)
byp={'approve':[c for c in vol if act[c][0]=='approve'],'update-accepted':[c for c in vol if act[c][0]=='update-accepted']}
sample=[]
for k,v in byp.items():
    v=sorted(v,key=lambda c:ch[c]['created_ts'])
    # stratify: split into 20 equal slices and take one random per slice
    n=20; step=len(v)/n
    for i in range(n): sample.append(v[int(i*step)+random.randrange(max(1,int(step)))])
res=[]
for c in sample:
    r=da[c]; tok=r['outcomes'][0]['outcomeTokenId']
    st,b,h=get(f'https://orderbooks.xo.market/prices-history?token_id={tok}&interval=6000000&fidelity=60')
    hist=json.loads(b).get('history',[]) if st==200 else None
    t0=min((x['t'] for x in hist),default=None) if hist else None
    # also the other outcome token
    res.append({'cond':c,'path':act[c][0],'activation_ts':act[c][1],'created_ts':ch[c]['created_ts'],'first_point_t':t0,'n_points':len(hist) if hist is not None else None,'http':st,'vol':r['totalVolumeInUSD'],'status':r['status']})
json.dump(res,open(S+'/work/first_trade.json','w'))
ok=[x for x in res if x['first_point_t']]
print('n',len(res),'with points',len(ok),'used',used('orderbooks.xo.market'))
d=[x['first_point_t']-x['activation_ts'] for x in ok]
print('first point - activation (s): min %d median %d max %d ; negatives %d'%(min(d),statistics.median(d),max(d),sum(1 for x in d if x<0)))
d2=[x['first_point_t']-x['created_ts'] for x in ok]
print('first point - creation (s): min %d median %d'%(min(d2),statistics.median(d2)))
for x in sorted(ok,key=lambda x:x['first_point_t']-x['activation_ts'])[:6]: print(x['path'],x['first_point_t']-x['activation_ts'],x['first_point_t']-x['created_ts'])
