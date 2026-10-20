"""Throttled read-only GET client. Fixed UA, per-host ledger, hard cap 150 req/host, >=300 ms spacing.
Usage: from xoclient import get ; status, body_bytes, headers = get(url)
Ledger + cache live in $SCRATCH (env var); nothing personal is sent. GET only."""
import os, json, time, hashlib, urllib.request, urllib.error, urllib.parse

UA = "insurance-markets-research/0.1"
SCRATCH = os.environ["SCRATCH"]
LEDGER = os.path.join(SCRATCH, "work", "ledger.json")
CACHE = os.path.join(SCRATCH, "raw")
CAP = 150
MIN_GAP = 0.3
_last = {}

def _load():
    try:
        return json.load(open(LEDGER))
    except Exception:
        return {}

def _save(d):
    json.dump(d, open(LEDGER, "w"), indent=1)

def used(host):
    return _load().get(host, 0)

def get(url, cache=True, timeout=100):
    p = urllib.parse.urlparse(url)
    if p.scheme != "https":
        raise ValueError("https only")
    host = p.netloc
    key = hashlib.sha256(url.encode()).hexdigest()[:24]
    cpath = os.path.join(CACHE, key + ".bin")
    mpath = os.path.join(CACHE, key + ".meta")
    if cache and os.path.exists(cpath):
        hp = os.path.join(CACHE, key + ".hdr")
        return int(open(mpath).read().split()[0]), open(cpath, "rb").read(), (json.load(open(hp)) if os.path.exists(hp) else {})
    for attempt in range(4):
        led = _load()
        if led.get(host, 0) >= CAP:
            raise RuntimeError("cap reached for " + host)
        gap = time.time() - _last.get(host, 0)
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        led[host] = led.get(host, 0) + 1
        _save(led)
        _last[host] = time.time()
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read(); st = r.status; hdr = dict(r.headers)
        except urllib.error.HTTPError as e:
            body = e.read(); st = e.code; hdr = dict(e.headers)
        except (TimeoutError, OSError) as e:
            raise RuntimeError('timeout/neterr: ' + type(e).__name__)
        if st == 429 or st >= 500:
            time.sleep(2 ** (attempt + 1))
            continue
        if cache and st == 200:
            open(cpath, "wb").write(body)
            open(mpath, "w").write(str(st) + " " + url + "\n")
            keep = {k: v for k, v in hdr.items() if k.lower() in ("last-modified", "content-type", "etag", "cache-control", "server", "access-control-allow-origin", "x-goog-generation")}
            json.dump(keep, open(os.path.join(CACHE, key + ".hdr"), "w"))
        return st, body, hdr
    return st, body, hdr
