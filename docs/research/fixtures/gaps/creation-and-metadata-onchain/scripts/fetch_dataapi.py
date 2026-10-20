import sys,json,os; sys.path.insert(0,os.environ['SCRATCH']+'/work')
from xoclient import get, used
S=os.environ['SCRATCH']
rows={}; page=1
while True:
    u=f'https://api-mainnet.xo.market/api/markets?marketType=4&take=50&page={page}&sortBy=createdAt&sortOrder=DESC'
    st,b,h=get(u)
    if st!=200: print('HTTP',st,b[:200]); break
    d=json.loads(b)
    for r in d['data']: rows[r['conditionId']]=r
    print(page,len(d['data']),d['meta']['itemCount'],d['meta']['hasNextPage'],len(rows),used('api-mainnet.xo.market'),flush=True)
    if not d['meta']['hasNextPage']: break
    page+=1
json.dump(list(rows.values()),open(S+'/work/dataapi_t4.json','w'))
