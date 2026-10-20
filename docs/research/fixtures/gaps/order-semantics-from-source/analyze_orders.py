"""Analyse on-chain matchOrders inputs (public chain data) to see what XO orders actually look like at fill time:
nonce, expiration, signatureType, signature prefix/length, tick-price rounding, smallest sizes."""
import json, glob, collections
orders=[]  # (role, side, maker, makerAmt, takerAmt, exp, nonce, sigtype, sig, tokenId, txhash, ts)
for f in sorted(glob.glob("raw/op_txs_p*.json")):
    d=json.load(open(f))
    for t in d["items"]:
        di=t.get("decoded_input") or {}
        if not di.get("parameters") or t.get("status")!="ok": continue
        P={p["name"]:p["value"] for p in di["parameters"]}
        def o(v,role):
            return dict(role=role, salt=v[0], maker=v[1], signer=v[2], bene=v[3], token=v[4], mk=int(v[5]), tk=int(v[6]), exp=int(v[7]), nonce=int(v[8]), ident=v[9], meta=v[10], side=int(v[11]), st=int(v[12]), sig=v[13], tx=t["hash"], ts=t["timestamp"])
        orders.append(o(P["takerOrder"],"taker"))
        for m in P["makerOrders"]: orders.append(o(m,"maker"))
print("txs-with-orders orders:", len(orders), "ts range:", min(x['ts'] for x in orders), max(x['ts'] for x in orders))
C=collections.Counter
print("nonce:", C(x["nonce"] for x in orders))
print("sigtype:", C(x["st"] for x in orders))
print("sig len bytes:", C((len(x["sig"])-2)//2 for x in orders))
print("sig prefix byte0:", C(x["sig"][2:4] for x in orders))
print("sig validator (bytes1-21):", C(x["sig"][4:44] for x in orders if x["sig"][2:4]=="01"))
print("maker==signer:", C(x["maker"]==x["signer"] for x in orders))
print("beneficiary zero:", C(int(x["bene"],16)==0 for x in orders))
print("identifier nonzero:", C(int(x["ident"],16)!=0 for x in orders), "metadata nonzero:", C(int(x["meta"],16)!=0 for x in orders))
print("expiration zero:", C(x["exp"]==0 for x in orders))
exps=[x for x in orders if x["exp"]!=0]
print("n GTD-style orders:", len(exps))
import datetime
for x in exps[:5]:
    print("  exp", x["exp"], datetime.datetime.utcfromtimestamp(x["exp"]).isoformat(), "fill ts", x["ts"], x["role"], x["tx"][:12])
# tick analysis
def price_ticks(x):
    # BUY: price = mk/tk ; SELL: price = tk/mk
    if x["side"]==0: num,den=x["mk"],x["tk"]
    else: num,den=x["tk"],x["mk"]
    return num, den
rows=collections.Counter()
examples=[]
for x in orders:
    num,den=price_ticks(x)
    if den==0: rows["den0"]+=1; continue
    # nearest tick t in 1..999 minimizing |num*1000 - t*den|
    t=round(num*1000/den)
    exact = (num*1000 == t*den)
    if exact: rows[(x["side"],"exact")]+=1
    else:
        # rounding direction: shares S = (BUY? tk : mk); collateral C = (BUY? mk : tk)
        S = x["tk"] if x["side"]==0 else x["mk"]
        Cc = x["mk"] if x["side"]==0 else x["tk"]
        floorC = S*t//1000
        ceilC = -(-S*t//1000)
        kind = "floor" if Cc==floorC else ("ceil" if Cc==ceilC else "other")
        rows[(x["side"],"inexact",kind)]+=1
        if len(examples)<8: examples.append((x["side"],S,Cc,t,floorC,ceilC,kind))
print("tick-exactness / rounding by side (0=BUY,1=SELL):")
for k,v in sorted(rows.items(), key=str): print("  ",k,v)
print("examples (side,S,C,t,floorC,ceilC,kind):", examples)
# distribution of S mod 1000 and mod 10000
Sm=collections.Counter()
for x in orders:
    S = x["tk"] if x["side"]==0 else x["mk"]
    Sm["S%1000==0" if S%1000==0 else "S%1000!=0"]+=1
print("share-amount granularity:", Sm)
# smallest sizes
def S_of(x): return x["tk"] if x["side"]==0 else x["mk"]
def C_of(x): return x["mk"] if x["side"]==0 else x["tk"]
mins=sorted(orders, key=lambda x:C_of(x))[:5]
print("smallest collateral in an order:", [(x['role'],x['side'],S_of(x),C_of(x)) for x in mins])
mins=sorted(orders, key=lambda x:S_of(x))[:5]
print("smallest shares in an order:", [(x['role'],x['side'],S_of(x),C_of(x)) for x in mins])
# Fill-level minima: look at fill amounts from txs
fills=[]
for f in sorted(glob.glob("raw/op_txs_p*.json")):
    for t in json.load(open(f))["items"]:
        di=t.get("decoded_input") or {}
        if not di.get("parameters"): continue
        P={p["name"]:p["value"] for p in di["parameters"]}
        fills.append((int(P["takerFillAmount"]), [int(a) for a in P["makerFillAmounts"]]))
print("n matches:", len(fills), "min takerFillAmount:", min(f[0] for f in fills), "min maker fill:", min(min(f[1]) for f in fills if f[1]))
