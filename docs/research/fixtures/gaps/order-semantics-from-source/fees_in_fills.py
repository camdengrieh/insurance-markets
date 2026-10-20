import json, glob, collections
n=0; tf_nz=0; mf_nz=0; rows=[]
for f in sorted(glob.glob("raw/op_txs_p*.json")):
    for t in json.load(open(f))["items"]:
        di=t.get("decoded_input") or {}
        if not di.get("parameters"): continue
        P={p["name"]:p["value"] for p in di["parameters"]}
        n+=1
        tf=int(P["takerFee"]); mfs=[int(x) for x in P["makerFees"]]
        if tf: tf_nz+=1
        mf_nz+=sum(1 for x in mfs if x)
        if tf:
            o=P["takerOrder"]; side=int(o[11]); fill=int(P["takerFillAmount"])
            tk_amt=int(o[6]); mk_amt=int(o[5])
            # cash value for BUY taker: making (collateral) = fill
            cash = fill if side==0 else fill*tk_amt//mk_amt
            rows.append((tf, cash, tf*10000/max(cash,1)))
print("matches:", n, "takerFee>0:", tf_nz, "makerFee>0 legs:", mf_nz)
rs=sorted(rows, key=lambda r:-r[2])[:5]
print("max taker fee/cash bps:", [round(r[2],1) for r in rs])
