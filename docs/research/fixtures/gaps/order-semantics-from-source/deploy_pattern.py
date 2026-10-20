"""For a few accounts, look at the tx where the ECDSA validator registered the owner (== account initialisation) and report
whether it is a UserOp that also deploys the account and what else it did (approve / setApprovalForAll / etc.). Aggregate output only."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch
VAL="0x845ADb2C711129d4f3966735eD98a9F09fC4cE57"
T="0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca"
picked=json.load(open("raw/pick.json"))
accts=[]
for x in picked[:6]:
    accts.append(x["order"][1])
TOP={"d51a9c6126":"AccountDeployed","49628fd147":"UserOperationEvent","8c5be1e5eb":"ERC20.Approval","17307eab39":"ERC1155.ApprovalForAll"}
for a in accts:
    url=("https://explorer-mainnet.xo.market/api?module=logs&action=getLogs&fromBlock=0&toBlock=latest&address=%s&topic0=%s&topic1=0x%s&topic0_1_opr=and"%(VAL,T,a[2:].lower().rjust(64,"0")))
    d=json.loads(fetch.get(url))
    r=(d.get("result") or [None])[0]
    if not r: print("no OwnerRegistered"); continue
    txh=r["transactionHash"]
    b=fetch.get("https://explorer-mainnet.xo.market/api/v2/transactions/%s/logs"%txh)
    lg=json.loads(b)
    kinds=[]
    for it in lg["items"]:
        t0=(it["topics"][0] or "")[2:12]
        kinds.append(TOP.get(t0, t0))
    print("block",int(r["blockNumber"],16),"kinds:",kinds)
