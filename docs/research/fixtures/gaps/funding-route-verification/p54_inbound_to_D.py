import sys, json
sys.path.insert(0, '.')
import lib
G = 1686789347
rows = json.load(open("data/base_tx_sample.json"))
j = json.load(open("data/base_winA.json"))
tx0 = rows[0]["tx"]
blk = [int(r["blockNumber"], 16) for r in j["logs"] if r["transactionHash"] == tx0][0]
print("executor tx block", blk, "ts", G + 2 * blk)
DA = [a for a, _ in json.load(open("data/deposit_accounts.json"))]   # written by p48; third-party addresses are not hard-coded here
D = DA[0]
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
T_TR = lib.topic0("Transfer(address,address,uint256)")
pad = "0x" + "0" * 24 + D[2:]
res = lib.rpc("https://base.gateway.tenderly.co", "eth_getLogs", [{"fromBlock": hex(blk - 999), "toBlock": hex(blk), "address": USDC, "topics": [T_TR, None, pad]}])
print("inbound transfers to D in the 1000 blocks before/at the executor tx:", [(int(r["blockNumber"], 16), int(r["data"], 16), "0x" + r["topics"][1][-40:][:8]) for r in res.get("result", [])], res.get("error"))
for r in res.get("result", []):
    print("  user->D at ts", G + 2 * int(r["blockNumber"], 16), "amount_raw", int(r["data"], 16), "| executor tx at ts", G + 2 * blk, "| lag s", G + 2 * blk - (G + 2 * int(r["blockNumber"], 16)), "| bridged raw 119987299 -> fee raw", int(r["data"], 16) - 119987299)
