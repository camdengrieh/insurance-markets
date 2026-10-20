import json,collections,statistics
d=json.load(open('work/seed_detail.json'))
def act(x): return x['review_ts'] if x['first_dec']=='APPROVE' else x['resp_ts']
rows=[x for x in d if x['orderId'] and int(x['orderId'])>2**60 and act(x)]
oid=[int(x['orderId']) for x in rows]; cr=[x['created_ts'] for x in rows]; ac=[act(x) for x in rows]
print('rows with orderId>2^60:',len(rows),'of',len(d))
def rank(v):
    s=sorted(range(len(v)),key=lambda i:v[i]); r=[0]*len(v)
    for k,i in enumerate(s): r[i]=k
    return r
def sp(a,b):
    ra,rb=rank(a),rank(b); n=len(a); ma=sum(ra)/n; mb=sum(rb)/n
    cov=sum((x-ma)*(y-mb) for x,y in zip(ra,rb)); va=sum((x-ma)**2 for x in ra); vb=sum((y-mb)**2 for y in rb)
    return cov/(va*vb)**.5
print('spearman vs creation %.4f vs activation %.4f'%(sp(oid,cr),sp(oid,ac)))
dis=0;fc=0;fa=0;rows_d=[]
for i in range(len(rows)):
    for j in range(i+1,len(rows)):
        if (cr[i]-cr[j])*(ac[i]-ac[j])<0:
            dis+=1
            c=(oid[i]-oid[j])*(cr[i]-cr[j])>0; a=(oid[i]-oid[j])*(ac[i]-ac[j])>0
            fc+=c; fa+=a
            rows_d.append((abs(cr[i]-cr[j])/60,abs(ac[i]-ac[j])/60,'creation' if c else 'activation'))
print('discordant pairs',dis,'orderId follows creation',fc,'follows activation',fa)
for x in sorted(rows_d)[:0]: print(x)
# time model: fit orderId = a*t + b on creation_ts then examine residual vs (activation - creation)
import math
n=len(rows); 
def fit(t):
    mt=sum(t)/n; mo=sum(oid)/n
    a=sum((ti-mt)*(oi-mo) for ti,oi in zip(t,oid))/sum((ti-mt)**2 for ti in t); b=mo-a*mt
    res=[oi-(a*ti+b) for ti,oi in zip(t,oid)]
    return a,(sum(r*r for r in res)/n)**.5
for name,t in (('creation',cr),('activation',ac)):
    a,rm=fit(t); print(name,'orders/sec slope %.1f rmse(orders) %.0f'%(a,rm), ' => rmse in minutes %.1f'%(rm/a/60))
