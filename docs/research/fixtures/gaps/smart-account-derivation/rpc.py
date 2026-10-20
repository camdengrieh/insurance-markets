"""Read-only JSON-RPC helper (stdlib). Allowlisted methods only; shares the per-host cap/throttle of xohttp."""
import json, sys, time, urllib.request, urllib.error, urllib.parse
sys.path.insert(0, ".")
import xohttp

ALLOWED = {"eth_chainId", "eth_blockNumber", "eth_call", "eth_getCode", "eth_getLogs", "eth_getStorageAt",
           "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBalance", "eth_getTransactionCount",
           "web3_clientVersion", "eth_supportedEntryPoints"}

def call(url, calls, single=False):
    """calls: list of (method, params). Sent as ONE JSON-RPC batch (one HTTP request)."""
    for m, _ in calls:
        if m not in ALLOWED:
            raise RuntimeError("method not allowed: " + m)
    host = urllib.parse.urlparse(url).netloc
    st = xohttp._load()
    if st["blocked"].get(host):
        raise RuntimeError("host blocked: " + host)
    if st["count"].get(host, 0) >= xohttp.CAP:
        raise RuntimeError("cap reached for " + host)
    gap = time.time() - xohttp._last.get(host, 0)
    if gap < xohttp.MIN_GAP:
        time.sleep(xohttp.MIN_GAP - gap)
    st["count"][host] = st["count"].get(host, 0) + 1
    xohttp._save(st)
    payload = [{"jsonrpc": "2.0", "id": i, "method": m, "params": p} for i, (m, p) in enumerate(calls)]
    if single:
        payload = payload[0]
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"User-Agent": xohttp.UA, "Content-Type": "application/json", "Accept": "application/json"})
    xohttp._last[host] = time.time()
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            code, txt = r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        code, txt = e.code, e.read().decode("utf-8", "replace")
    if code in (401, 403):
        st = xohttp._load(); st["blocked"][host] = "requires key / forbidden HTTP %d" % code; xohttp._save(st)
        return code, txt
    try:
        j = json.loads(txt)
    except Exception:
        return code, txt
    if isinstance(j, list):
        j = sorted(j, key=lambda x: x.get("id", 0))
    return code, j
