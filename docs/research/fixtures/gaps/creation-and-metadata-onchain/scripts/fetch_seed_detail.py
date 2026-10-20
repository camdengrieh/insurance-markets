import sys,json,random,os,datetime; sys.path.insert(0,os.environ['SCRATCH']+'/work')
from xoclient import get, used
S=os.environ['SCRATCH']
da=[r for r in json.load(open(S+'/work/dataapi_t4.json'))]
ch={r['cond']:r for r in json.load(open(S+'/work/conviction_joined.json'))}
now=datetime.datetime.now(datetime.UTC).timestamp()
random.seed(99)
act=[r for r in da if r['status']=='ACTIVE' and datetime.datetime.fromisoformat(r['expiresAt'].replace('Z','+00:00')).timestamp()>now]
a=[r for r in act if ch[r['conditionId']]['first_dec']=='APPROVE']
u=[r for r in act if ch[r['conditionId']]['first_dec']=='UPDATE_REQUIRED']
print(len(act),len(a),len(u))
sample=random.sample(a,25)+random.sample(u,25)
out=[]
for r in sample:
    st,b,h=get('https://api-mainnet.xo.market/api/markets/slug/'+r['slug'])
    if st!=200: print('HTTP',st); continue
    d=json.loads(b); c=d['conditionId']
    seed=d.get('convictionSeed') or {}
    com=seed.get('commitment') or {}
    out.append({'cond':c,'first_dec':ch[c]['first_dec'],'created_ts':ch[c]['created_ts'],'review_ts':ch[c]['review_ts'],'resp_ts':(ch[c]['resp'] or {}).get('ts'),
                'orderId':com.get('orderId'),'seed_status':com.get('status'),'outcome':com.get('outcome'),'side':com.get('side'),'price':com.get('price'),'size':com.get('size'),'remaining':com.get('remaining'),
                'reviewStatus':d.get('reviewStatus'),'achievements':d['creator'].get('achievements'),'cp':d['creator'].get('cpPoints'),'tier':d['creator'].get('tier'),'creator_id':d['creator'].get('id'),'has_seed':bool(com)})
json.dump(out,open(S+'/work/seed_detail.json','w'))
print('done',len(out),'used',used('api-mainnet.xo.market'))
