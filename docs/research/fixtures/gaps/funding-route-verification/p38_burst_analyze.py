import sys, json, time, collections
sys.path.insert(0, '.')
import lib
G = 1686789347
T_DID = lib.topic0("DispatchId(bytes32)"); T_DSP = lib.topic0("Dispatch(address,uint32,bytes32,bytes)"); T_SENT = lib.topic0("SentTransferRemote(uint32,bytes32,uint256)")
j = json.load(open("data/base_burst.json"))
xo_ids = {r["topics"][1] for r in json.load(open("data/xo_processid_all.json"))}
by_tx = collections.defaultdict(dict)
for r in j["logs"]:
    t0 = r["topics"][0]; tx = r["transactionHash"]; blk = int(r["blockNumber"], 16)
    d = by_tx[tx]; d["block"] = blk
    if t0 == T_DID: d["id"] = r["topics"][1]
    elif t0 == T_DSP:
        x = r["data"][2:]; off = int(x[:64], 16) * 2; ln = int(x[off:off+64], 16); m = bytes.fromhex(x[off+64:off+64+ln*2])
        d["nonce"] = int.from_bytes(m[1:5], "big"); d["dest"] = int.from_bytes(m[41:45], "big"); d["dispatch_sender"] = "0x" + r["topics"][1][-40:]
        d["body_recipient"] = "0x" + m[77:109].hex(); d["body_amount"] = int.from_bytes(m[109:141], "big")
    elif t0 == T_SENT:
        d["sent_dest"] = int(r["topics"][1], 16); d["sent_recipient"] = r["topics"][2]; d["amount"] = int(r["data"], 16)
msgs = sorted([dict(tx=k, **v) for k, v in by_tx.items() if "id" in v], key=lambda m: m["nonce"])
print("messages in burst window:", len(msgs), "nonce range", msgs[0]["nonce"], msgs[-1]["nonce"])
miss = [m for m in msgs if m["id"] not in xo_ids]
print("not in XO ProcessId set:", len(miss))
for m in miss:
    print(m["nonce"], time.strftime("%F %T", time.gmtime(G + 2 * m["block"])), m["tx"][:14], "amount_raw", m.get("amount"), "recipient", m.get("sent_recipient", "")[:22], "dest", m.get("sent_dest"))
print("--- all messages amount distribution in window: zero-amount count", sum(1 for m in msgs if m.get("amount") == 0), "of", len(msgs))
print("--- missing nonces list:", [m["nonce"] for m in miss])
json.dump({"msgs": msgs, "missing_ids": [m["id"] for m in miss]}, open("data/burst_analysis.json", "w"))
# time clustering
tsl = [G + 2 * m["block"] for m in msgs]
print("window span", time.strftime("%F %T", time.gmtime(tsl[0])), time.strftime("%F %T", time.gmtime(tsl[-1])))
# distinct sender / recipient counts
print("distinct tx senders in Dispatch event (should be router):", collections.Counter(m.get("dispatch_sender") for m in msgs))
print("distinct recipients:", len({m.get("sent_recipient") for m in msgs}), " top:", collections.Counter(m.get("sent_recipient")[:22] for m in msgs).most_common(3))
print("missing recipients distinct:", len({m.get("sent_recipient") for m in miss}))
