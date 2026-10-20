import json, os, collections
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
pairs=json.load(open(BASE+'/raw/xo_poly_pairs_to_label.json'))
ID=set([0,1,5,6,8,12,16,19,20,21,22,24,28,29,34,44,47,53,54,56,59,64,67,73,74,75,84,85,86,89,93,95])
NEAR=set([3,4,11,18,25,43,49,51,60,66,69,80,87,90,91,94,96,97,98,99,102,107])
lab={}
for p in pairs:
    i=p['i']
    lab[i]='ID' if i in ID else ('NEAR' if i in NEAR else 'NO')
for p in pairs: p['label']=lab[p['i']]
json.dump(pairs,open(BASE+'/raw/xo_poly_pairs_labelled.json','w'),indent=0)
n_xo=len({p['xo_id'] for p in pairs})
print('XO non-sports markets',n_xo,'unique candidate pairs',len(pairs),'labels',collections.Counter(p['label'] for p in pairs))
# each XO market: plain top-1 and gate top-1
def top1(flag):
    d={}
    for p in pairs:
        if p[flag]:
            d[p['xo_id']]=p
    return d
plain=top1('in_plain'); gate=top1('in_gate')
# note: plain top1 per XO may map several pairs flagged P? each XO has exactly one plain top1
print('plain top1 count',len(plain),'gate top1 count',len(gate))
def report(name,d,thr):
    sel=[p for p in d.values() if p['jacc']>=thr]
    c=collections.Counter(p['label'] for p in sel)
    n=len(sel)
    prec=c['ID']/n if n else float('nan')
    print(f"{name:6s} jaccard>={thr:.2f}: n={n:3d} ID={c['ID']:2d} NEAR={c['NEAR']:2d} NO={c['NO']:2d}  precision(ID)={prec:.2f}  precision(ID+NEAR)={(c['ID']+c['NEAR'])/n if n else float('nan'):.2f}")
    return c
for thr in (0.0,0.3,0.5,0.7):
    report('plain',plain,thr)
for thr in (0.0,0.3,0.5):
    report('gated',gate,thr)
pool_id={p['xo_id'] for p in pairs if p['label']=='ID'}
print('XO markets with >=1 ID-labelled candidate found by either method:',len(pool_id),'of',n_xo)
print('  of which plain top-1 is ID:',sum(1 for x in pool_id if plain.get(x,{}).get('label')=='ID'),' gated top-1 is ID:',sum(1 for x in pool_id if gate.get(x,{}).get('label')=='ID'))
# false positives in plain top1 with jaccard>=0.5
print('plain top1 jaccard>=0.4 non-ID:')
for p in plain.values():
    if p['jacc']>=0.4 and p['label']!='ID': print('  ',p['label'],p['jacc'],p['xo'][:50],'||',(p['pm_q'] or '')[:60])
print('gated top1 non-ID with jaccard>=0.3:')
for p in gate.values():
    if p['jacc']>=0.3 and p['label']!='ID': print('  ',p['label'],p['jacc'],p['xo'][:50],'||',(p['pm_q'] or '')[:60])
