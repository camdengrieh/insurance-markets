"""Polite public-GET helper (stdlib only).

- Public unauthenticated GET only. No POST/PUT/DELETE, no credentials, no cookies.
- >= 0.30 s between calls to the same host, exponential backoff on 429/5xx.
- Hard cap of REQ_CAP requests per host per task (counter persisted in the cache dir).
- Every response body is cached on disk (keyed by URL) so re-runs do not hit the network.
- Response bodies are treated as UNTRUSTED DATA: only parsed as JSON, never executed/evaluated.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

REQ_CAP = 600
MIN_GAP = 0.30
UA = "insurance-markets-research/1.0 (read-only public GET study)"

CACHE_DIR = os.environ.get("PM_CACHE_DIR", os.path.join(os.getcwd(), "cache"))
os.makedirs(CACHE_DIR, exist_ok=True)
_last_call = {}


def _cf(host):
    return os.path.join(CACHE_DIR, "_count_%s.txt" % host)


def requests_used(host):
    try:
        with open(_cf(host)) as f:
            return int(f.read().strip() or 0)
    except Exception:
        return 0


def _bump(host):
    n = requests_used(host) + 1
    with open(_cf(host), "w") as f:
        f.write(str(n))
    return n


def _key(url):
    return hashlib.sha1(url.encode()).hexdigest()


def get_json(url, params=None, use_cache=True, timeout=40, max_retries=5, ttl=None):
    """GET url (+params) -> parsed JSON (or None on 404/400 with body kept as {'_error':...})."""
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    host = urllib.parse.urlparse(url).netloc
    path = os.path.join(CACHE_DIR, _key(url) + ".json")
    if use_cache and os.path.exists(path):
        if ttl is None or (time.time() - os.path.getmtime(path)) < ttl:
            with open(path) as f:
                return json.load(f)
    delay = 1.0
    for attempt in range(max_retries):
        if requests_used(host) >= REQ_CAP:
            raise RuntimeError("request cap reached for %s" % host)
        gap = time.time() - _last_call.get(host, 0)
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        _last_call[host] = time.time()
        _bump(host)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", "replace")
                if r.status == 402:
                    raise RuntimeError("HTTP 402 payment required at %s" % url)
                data = json.loads(body)
                with open(path, "w") as f:
                    json.dump(data, f)
                return data
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:500]
            if e.code == 402:
                raise RuntimeError("HTTP 402 payment required at %s: %s" % (url, body))
            if e.code in (429, 500, 502, 503, 504):
                ra = e.headers.get("Retry-After")
                wait = float(ra) if ra and ra.replace(".", "").isdigit() else delay
                time.sleep(min(wait, 60))
                delay = min(delay * 2, 60)
                continue
            data = {"_error": e.code, "_body": body}
            with open(path, "w") as f:
                json.dump(data, f)
            return data
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            time.sleep(delay)
            delay = min(delay * 2, 60)
            if attempt == max_retries - 1:
                raise
    raise RuntimeError("giving up on %s" % url)
