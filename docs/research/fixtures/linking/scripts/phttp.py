"""Polite public-GET helper. Python stdlib only. Run with python3 -I.
Throttle >=300 ms per host, exponential backoff on 429/5xx, hard cap 600 requests per host (counter in counts.json).
"""
import json, os, time, urllib.request, urllib.error, urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COUNTS = os.path.join(BASE, "counts.json")
_last = {}
CAP = 600
UA = "insurance-markets-research/0.1 (read-only public GET; contact repo owner)"


def _counts():
    try:
        return json.load(open(COUNTS))
    except Exception:
        return {}


def get(url, headers=None, retries=4, timeout=40):
    host = urllib.parse.urlparse(url).netloc
    c = _counts()
    if c.get(host, 0) >= CAP:
        raise RuntimeError("request cap reached for " + host)
    wait = 0.3 - (time.time() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    delay = 1.0
    for attempt in range(retries + 1):
        c = _counts()
        c[host] = c.get(host, 0) + 1
        json.dump(c, open(COUNTS, "w"))
        _last[host] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            return e.code, e.read()
        except Exception as e:  # network error
            if attempt < retries:
                time.sleep(delay)
                delay *= 2
                continue
            return -1, str(e).encode()
    return -1, b""


def get_json(url, **kw):
    s, b = get(url, **kw)
    try:
        return s, json.loads(b)
    except Exception:
        return s, None
