import json, os, re, sys, datetime
BASE=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d=json.load(open(BASE+'/raw/xo_nonsports_poly_search.json'))['results']
STOP=set('will the a an of in on by to for be is at before after or and does do it its than what which who this that'.split())
CUT={'cut','cuts','decrease','decreases','lower','lowers','reduce','reduces'}
HIKE={'hike','hikes','raise','raises','increase','increases'}
def toks(s):
    s=s.lower().replace(',','')
    return [t for t in re.findall(r"[a-z0-9\.\$%]+",s) if t not in STOP]
def nums(s):
    s=s.lower().replace(',','')
    out=set()
    for m in re.finditer(r"\$?(\d+(?:\.\d+)?)\s*([kmb%]?)",s):
        v=float(m.group(1)); suf=m.group(2)
        if 1990<=v<=2100 and not suf: continue   # years handled separately
        if suf=='k': v*=1e3
        if suf=='m': v*=1e6
        if suf=='b': v*=1e9
        out.add((v, '%' if suf=='%' else ''))
    return out
def direction(s):
    t=set(re.findall(r"[a-z]+",s.lower()))
    return (-1 if t&CUT else 0)+(1 if t&HIKE else 0)
def jacc(a,b):
    A,B=set(a),set(b); return len(A&B)/len(A|B) if A and B else 0
def pdate(x):
    try: return datetime.datetime.fromisoformat(x.replace('Z','+00:00'))
    except Exception: return None
rows=[]
for r in d:
    xt=r['xo_title']; xd=pdate(r['expires']); xn=nums(xt); xdir=direction(xt)
    best_plain=None; best_gate=None
    for e in r['events']:
        for m in e['markets']:
            if m.get('closed'): continue
            q=(m['q'] or '')+' '+(m['git'] or '')
            s=jacc(toks(xt),toks(q))
            cand=(s,e['title'],m['q'],m['git'],m['end'])
            if best_plain is None or s>best_plain[0]: best_plain=cand
            # gates
            pn=nums(m['q'] or '')|nums(m['git'] or '')
            g_num = (not xn and not pn) or (xn and xn<=pn) or (pn and pn<=xn) 
            g_dir = not (xdir and direction(m['q'] or '') and xdir*direction(m['q'] or '')<0)
            pd_=pdate(m['end']) if m['end'] else None
            g_date = (xd is not None and pd_ is not None and abs((xd-pd_).total_seconds())<=1.5*86400)
            if g_num and g_dir and g_date:
                if best_gate is None or s>best_gate[0]: best_gate=cand
    rows.append((r['xo_id'],xt,r['expires'][:10],best_plain,best_gate))
json.dump(rows,open(BASE+'/raw/xo_poly_gate_rows.json','w'))
print('XO markets',len(rows),'; with gated candidate',sum(1 for r in rows if r[4]),'; gated & jaccard>=0.3',sum(1 for r in rows if r[4] and r[4][0]>=0.3))
for r in rows:
    if r[4] and (not r[3] or r[4][2]!=r[3][2]):
        print('GATE-DIFF',f"{r[4][0]:.2f}",'| XO:',r[1][:60],r[2],'|| PM:',(r[4][2] or '')[:70],'[',r[4][3],']',(r[4][4] or '')[:10])
print('---- gated top-1 list (all)')
for r in sorted(rows,key=lambda r:-(r[4][0] if r[4] else 0)):
    if r[4]: print(f"{r[4][0]:.2f} | XO: {r[1][:58]} {r[2]} || PM: {(r[4][2] or '')[:66]} [{r[4][3]}] {(r[4][4] or '')[:10]}")
