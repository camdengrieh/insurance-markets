"""Independent cross-check: decode raw logs with Foundry cast (ABI decoder) and compare with the hand-rolled decoder used in scan_created.py / analyze_chain.py."""
import json, glob, subprocess, random, os, sys
S = os.environ["SCRATCH"]
sys.path.insert(0, S + "/work")
T = json.load(open(S + "/work/event_topics.json"))
created_topic = T["CLOBMarketCreated"]["topic0"]
rows = {r["cond"]: r for r in json.load(open(S + "/work/created_t2_t4.json"))}
def cast_dec(sig, data):
    out = subprocess.check_output(["cast", "abi-decode", "--input", "--json", sig, data], text=True)
    return json.loads(out)
# raw created logs from cache
raw = []
for f in glob.glob(S + "/raw/*.bin"):
    try: d = json.load(open(f))
    except Exception: continue
    res = d.get("result") if isinstance(d, dict) else None
    if isinstance(res, list):
        for r in res:
            if r.get("topics") and r["topics"][0] == created_topic: raw.append(r)
print("raw created logs found in cache:", len(raw))
random.seed(1)
ok = bad = 0
raw = [r for r in raw if r['topics'][1] in rows]
print('raw created logs for kept rows (type 2/4):', len(raw))
for r in random.sample(raw, 80):
    v = cast_dec("f(bytes32,uint256,uint256,address,address,uint40,uint40,uint16,string,uint8)", r["data"])
    mine = rows.get(r["topics"][1])
    if mine is None:  # type 3 logs are not kept
        continue
    if v[8] == mine["uri"] and int(v[9]) == mine["marketType"] and int(v[5]) == mine["startsAt"] and int(v[6]) == mine["expiresAt"]: ok += 1
    else: bad += 1
print("CLOBMarketCreated cast-vs-hand decode: match", ok, "mismatch", bad)
rev = json.load(open(S + "/work/ev_MarketReviewed.json"))
ok = bad = 0
for r in random.sample(rev, 60):
    v = cast_dec("f(uint8,string,string,uint40,uint40)", r["data"])
    word = lambda h, i: h[2 + 64 * i: 2 + 64 * (i + 1)]
    dec_hand = int(word(r["data"], 0), 16)
    off = int(word(r["data"], 2), 16); base = 2 + 2 * off; ln = int(r["data"][base:base + 64], 16)
    notes_hand = bytes.fromhex(r["data"][base + 64: base + 64 + 2 * ln]).decode("utf-8", "replace")
    if int(v[0]) == dec_hand and v[2] == notes_hand: ok += 1
    else: bad += 1
print("MarketReviewed cast-vs-hand decode: match", ok, "mismatch", bad)
