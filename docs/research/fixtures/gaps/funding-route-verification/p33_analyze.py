"""Pair Base Mailbox events with XO Mailbox events by Hyperlane messageId and compute delivery delays.
Base block timestamp = 1686789347 + 2*block (validated against Multicall3.getCurrentBlockTimestamp)."""
import sys, json, statistics, time
sys.path.insert(0, '.')
import lib
G = 1686789347
T_DID = lib.topic0("DispatchId(bytes32)"); T_PID = lib.topic0("ProcessId(bytes32)")
T_DSP = lib.topic0("Dispatch(address,uint32,bytes32,bytes)")
T_SENT = lib.topic0("SentTransferRemote(uint32,bytes32,uint256)"); T_RECV = lib.topic0("ReceivedTransferRemote(uint32,bytes32,uint256)")
def bts(block): return G + 2 * block
def pct(xs, p):
    xs = sorted(xs)
    if not xs: return None
    k = (len(xs) - 1) * p / 100.0
    f = int(k); c = min(f + 1, len(xs) - 1)
    return xs[f] + (xs[c] - xs[f]) * (k - f)
def summ(xs):
    if not xs: return {}
    return {"n": len(xs), "min": min(xs), "p10": round(pct(xs, 10), 1), "median": round(pct(xs, 50), 1), "mean": round(statistics.mean(xs), 1), "p90": round(pct(xs, 90), 1), "p95": round(pct(xs, 95), 1), "p99": round(pct(xs, 99), 1), "max": max(xs)}
def parse_dispatch(r):
    d = r["data"][2:]
    off = int(d[:64], 16) * 2; ln = int(d[off:off + 64], 16)
    m = bytes.fromhex(d[off + 64:off + 64 + ln * 2])
    return {"version": m[0], "nonce": int.from_bytes(m[1:5], "big"), "origin": int.from_bytes(m[5:9], "big"), "sender": "0x" + m[9:41].hex(),
            "dest": int.from_bytes(m[41:45], "big"), "recipient": "0x" + m[45:77].hex(), "body": m[77:]}
def load_base(name):
    j = json.load(open("data/base_%s.json" % name))
    ev = {"did": [], "pid": [], "dsp": [], "sent": [], "recv": []}
    for r in j["logs"]:
        t0 = r["topics"][0]; blk = int(r["blockNumber"], 16)
        rec = {"block": blk, "ts": bts(blk), "tx": r["transactionHash"], "li": int(r["logIndex"], 16), "topics": r["topics"], "data": r["data"]}
        if t0 == T_DID: ev["did"].append(dict(rec, id=r["topics"][1]))
        elif t0 == T_PID: ev["pid"].append(dict(rec, id=r["topics"][1]))
        elif t0 == T_DSP: ev["dsp"].append(dict(rec, **parse_dispatch(r)))
        elif t0 == T_SENT: ev["sent"].append(dict(rec, amount=int(r["data"], 16), recipient=r["topics"][2]))
        elif t0 == T_RECV: ev["recv"].append(dict(rec, amount=int(r["data"], 16), recipient=r["topics"][2]))
    return j, ev
def load_xo(w, kind):
    rows = json.load(open("data/xo_%s_%s.json" % (w, kind)))
    return [{"id": r["topics"][1], "ts": int(r["timeStamp"], 16), "block": int(r["blockNumber"], 16), "tx": r["transactionHash"]} for r in rows]
now = int(time.time())
report = {}
for w in ("A", "B"):
    j, ev = load_base("win" + w)
    bstart = bts(j["start"]); bend = bts(j["start"] + 1000 * j["n"] - 1)
    xp = {r["id"]: r for r in load_xo(w, "processid")}
    xd = {r["id"]: r for r in load_xo(w, "dispatchid")}
    sent_by_tx = {r["tx"]: r for r in ev["sent"]}
    nonce_by_tx = {r["tx"]: r for r in ev["dsp"]}
    out = {"base_window": [bstart, bend], "base_events": {k: len(v) for k, v in ev.items()}, "errors": j["errs"]}
    # ---- deposits: Base dispatch -> XO process
    dep = []
    for d in ev["did"]:
        x = xp.get(d["id"])
        rec = {"id": d["id"], "tx": d["tx"], "base_ts": d["ts"], "block": d["block"], "amount": sent_by_tx.get(d["tx"], {}).get("amount"), "nonce": nonce_by_tx.get(d["tx"], {}).get("nonce")}
        if x: rec["xo_ts"] = x["ts"]; rec["delay"] = x["ts"] - d["ts"]
        dep.append(rec)
    matched = [r for r in dep if "delay" in r]
    unmatched = [r for r in dep if "delay" not in r]
    out["deposits"] = {"dispatched_on_base": len(dep), "matched": len(matched), "unmatched": len(unmatched),
                       "delay_s": summ([r["delay"] for r in matched]),
                       "negative_delays": sum(1 for r in matched if r["delay"] < 0),
                       "unmatched_detail": [{"id": r["id"][:14], "age_s_at_fetch": now - r["base_ts"], "base_ts": r["base_ts"], "amount_usdc": (r["amount"] or 0) / 1e6, "nonce": r["nonce"]} for r in unmatched]}
    # in-order check among matched
    ms = sorted([r for r in matched if r["nonce"] is not None], key=lambda r: r["nonce"])
    inv = sum(1 for a, b in zip(ms, ms[1:]) if b["xo_ts"] < a["xo_ts"])
    out["deposits"]["nonce_order_inversions_in_xo_process_time"] = inv
    # XO process events with no Base dispatch in window (processed early in window, dispatched before window start)
    base_ids = {d["id"] for d in ev["did"]}
    out["xo_process_not_in_base_window"] = sum(1 for i in xp if i not in base_ids)
    # amounts vs delay
    big = [r for r in matched if r["amount"] and r["amount"] >= 1000e6]
    out["deposits"]["delay_s_amount_ge_1000usdc"] = summ([r["delay"] for r in big])
    out["deposits"]["amount_usdc"] = summ([r["amount"] / 1e6 for r in dep if r["amount"] is not None])
    # ---- withdrawals: XO dispatch -> Base process
    bp = {r["id"]: r for r in ev["pid"]}
    cutoff = bend - 6 * 3600
    wd = []
    for i, x in xd.items():
        if x["ts"] < bstart or x["ts"] > bend: continue
        b = bp.get(i)
        rec = {"id": i, "xo_ts": x["ts"]}
        if b: rec["base_ts"] = b["ts"]; rec["delay"] = b["ts"] - x["ts"]
        wd.append(rec)
    wm = [r for r in wd if "delay" in r]
    wu = [r for r in wd if "delay" not in r]
    wu_eligible = [r for r in wu if r["xo_ts"] <= cutoff]
    out["withdrawals"] = {"xo_dispatched_in_window": len(wd), "matched": len(wm), "unmatched": len(wu), "unmatched_older_than_6h_before_window_end": len(wu_eligible),
                          "delay_s_all_matched": summ([r["delay"] for r in wm]),
                          "delay_s_dispatched_before_cutoff": summ([r["delay"] for r in wm if r["xo_ts"] <= cutoff]),
                          "unmatched_detail_eligible": [{"id": r["id"][:14], "age_s_at_fetch": now - r["xo_ts"], "xo_ts": r["xo_ts"]} for r in wu_eligible]}
    report[w] = out
    json.dump({"dep": dep, "wd": wd}, open("data/pairs_%s.json" % w, "w"))
print(json.dumps(report, indent=1))
json.dump(report, open("data/latency_report.json", "w"), indent=1)
