import sys,json,os,datetime; sys.path.insert(0,os.environ['SCRATCH']+'/work')
from xoclient import get, used
S=os.environ['SCRATCH']
da={r['conditionId']:r for r in json.load(open(S+'/work/dataapi_t4.json'))}
ch={r['cond']:r for r in json.load(open(S+'/work/conviction_joined.json'))}
have={x['cond']:x for x in json.load(open(S+'/work/seed_detail.json'))}
now=datetime.datetime.now(datetime.UTC).timestamp()
act={}
for c,r in da.items():
    if r['status']!='ACTIVE': continue
    if datetime.datetime.fromisoformat(r['expiresAt'].replace('Z','+00:00')).timestamp()<=now: continue
    m=ch[c]
    a=m['review_ts'] if m['first_dec']=='APPROVE' else (m['resp']['ts'] if m['resp'] and m['resp']['accepted'] else None)
    if a: act[c]=a
need=set()
for c in act:
    g=(act[c]-ch[c]['created_ts'])/3600
    if g<1.0: continue
    T0=ch[c]['created_ts']; T2=act[c]
    ys=[y for y in act if y!=c and T0<ch[y]['created_ts']<T2 and act[y]<T2]
    if ys:
        need.add(c); need.update(ys)
need-=set(have)
print('new fetches needed',len(need),'budget left',150-used('api-mainnet.xo.market'))
if len(need)>70: print('too many'); sys.exit()
for c in sorted(need):
    r=da[c]
    st,b,h=get('https://api-mainnet.xo.market/api/markets/slug/'+r['slug'])
    if st!=200: print('HTTP',st); continue
    d=json.loads(b); com=(d.get('convictionSeed') or {}).get('commitment') or {}
    have[c]={'cond':c,'first_dec':ch[c]['first_dec'],'created_ts':ch[c]['created_ts'],'review_ts':ch[c]['review_ts'],'resp_ts':(ch[c]['resp'] or {}).get('ts'),
        'orderId':com.get('orderId'),'seed_status':com.get('status'),'outcome':com.get('outcome'),'side':com.get('side'),'price':com.get('price'),'size':com.get('size'),'remaining':com.get('remaining'),
        'reviewStatus':d.get('reviewStatus'),'achievements':d['creator'].get('achievements'),'cp':d['creator'].get('cpPoints'),'tier':d['creator'].get('tier'),'creator_id':d['creator'].get('id'),'has_seed':bool(com)}
json.dump(list(have.values()),open(S+'/work/seed_detail.json','w'))
print('total detail rows',len(have),'used',used('api-mainnet.xo.market'))
