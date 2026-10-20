"""Polite read-only HTTP helper for the userop-templates research stream.

Rules enforced here (see task ground rules):
  * User-Agent is exactly 'insurance-markets-research/0.1' (no From/Referer, no contact data).
  * >= 250 ms between calls to one host, hard cap of 150 requests per host per task (persisted
    in a counter file so the cap holds across separate script runs).
  * backoff on 429/5xx; 401/403 are recorded and the host is marked 'requires key' (STOP).
  * only GET, plus JSON-RPC POST with an allowlist of READ methods.
  * responses are cached on disk (XO_CACHE_DIR, default ./.cache) so decode scripts re-run offline.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = "insurance-markets-research/0.1"
CAP_PER_HOST = 150
MIN_GAP = 0.3
CACHE = Path(os.environ.get("XO_CACHE_DIR", Path(__file__).resolve().parent / ".cache"))
CACHE.mkdir(parents=True, exist_ok=True)
COUNTER = CACHE / "_counter.json"
READ_METHODS = {
    "eth_chainId", "eth_blockNumber", "eth_call", "eth_getCode", "eth_getLogs",
    "eth_getStorageAt", "eth_getTransactionByHash", "eth_getTransactionReceipt",
    "eth_getBalance", "eth_supportedEntryPoints", "web3_clientVersion",
}
_last = {}


def _counter():
    if COUNTER.exists():
        return json.loads(COUNTER.read_text())
    return {"hosts": {}, "blocked": {}}


def _save(c):
    COUNTER.write_text(json.dumps(c, indent=1, sort_keys=True))


def _key(kind, url, body=""):
    return hashlib.sha256((kind + "|" + url + "|" + body).encode()).hexdigest()[:40]


def _do(req, host):
    c = _counter()
    if host in c["blocked"]:
        raise RuntimeError("host %s marked blocked (%s); not contacting it" % (host, c["blocked"][host]))
    n = c["hosts"].get(host, 0)
    if n >= CAP_PER_HOST:
        raise RuntimeError("per-host cap reached for %s" % host)
    wait = MIN_GAP - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    delay = 1.0
    last = (599, "retries exhausted")
    for attempt in range(4):
        c = _counter()
        c["hosts"][host] = c["hosts"].get(host, 0) + 1
        _save(c)
        _last[host] = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.status, r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            if e.code in (401, 403):
                c = _counter()
                c["blocked"][host] = "HTTP %d" % e.code
                _save(c)
                return e.code, body
            last = (e.code, body)
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(delay)
                delay *= 2
                continue
            return e.code, body
    return last


def get(url, use_cache=True):
    p = urllib.parse.urlparse(url)
    k = CACHE / ("g_" + _key("GET", url) + ".json")
    if use_cache and k.exists():
        return json.loads(k.read_text())["body"]
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"}, method="GET")
    status, body = _do(req, p.netloc)
    rec = {"url": url, "status": status, "body": body}
    if status == 200:
        k.write_text(json.dumps(rec))
    else:
        (CACHE / ("err_" + _key("GET", url) + ".json")).write_text(json.dumps(rec))
        raise RuntimeError("GET %s -> HTTP %s: %s" % (url, status, body[:200]))
    return body


def get_json(url, use_cache=True):
    return json.loads(get(url, use_cache))


def rpc(url, method, params=None, use_cache=True):
    """JSON-RPC POST restricted to read methods. Returns (status, parsed_or_text)."""
    if method not in READ_METHODS:
        raise ValueError("method %s not in read allowlist" % method)
    p = urllib.parse.urlparse(url)
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []})
    k = CACHE / ("r_" + _key("RPC", url, body) + ".json")
    if use_cache and k.exists():
        rec = json.loads(k.read_text())
        return rec["status"], rec["body"]
    req = urllib.request.Request(
        url, data=body.encode(), method="POST",
        headers={"User-Agent": UA, "Content-Type": "application/json", "Accept": "application/json"})
    status, text = _do(req, p.netloc)
    try:
        parsed = json.loads(text)
    except Exception:
        parsed = text
    k.write_text(json.dumps({"url": url, "method": method, "status": status, "body": parsed}))
    return status, parsed
