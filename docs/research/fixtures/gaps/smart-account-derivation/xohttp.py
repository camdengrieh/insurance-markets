"""Tiny throttled, capped, read-only GET helper (stdlib only).

Rules enforced: fixed User-Agent, >=300 ms between calls to one host,
hard cap of 150 requests per host (persisted across runs in counters.json),
only GET, backoff on 429/5xx, stop using a host after 401/403.
"""
import json, os, time, urllib.request, urllib.error, urllib.parse

UA = "insurance-markets-research/0.1"
HERE = os.path.dirname(os.path.abspath(__file__))
CNT = os.path.join(HERE, "counters.json")
CAP = 150
MIN_GAP = 0.3
_last = {}

def _load():
    try:
        return json.load(open(CNT))
    except Exception:
        return {"count": {}, "blocked": {}}

def _save(d):
    json.dump(d, open(CNT, "w"), indent=1)

def get(url, expect_json=True, tries=3):
    u = urllib.parse.urlparse(url)
    host = u.netloc
    st = _load()
    if st["blocked"].get(host):
        raise RuntimeError("host blocked (%s): %s" % (host, st["blocked"][host]))
    for attempt in range(tries):
        if st["count"].get(host, 0) >= CAP:
            raise RuntimeError("request cap reached for " + host)
        gap = time.time() - _last.get(host, 0)
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        st["count"][host] = st["count"].get(host, 0) + 1
        _save(st)
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA, "Accept": "application/json"})
        _last[host] = time.time()
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read()
                code = r.status
        except urllib.error.HTTPError as e:
            body = e.read()
            code = e.code
        except Exception as e:
            time.sleep(2 ** attempt)
            continue
        if code in (401, 403):
            st = _load()
            st["blocked"][host] = "requires key / forbidden (HTTP %d) on %s" % (code, u.path)
            _save(st)
            return code, body.decode("utf-8", "replace")
        if code == 429 or code >= 500:
            time.sleep(3 * (attempt + 1))
            continue
        txt = body.decode("utf-8", "replace")
        if expect_json:
            try:
                return code, json.loads(txt)
            except Exception:
                return code, txt
        return code, txt
    return None, None

def used():
    return _load()["count"]
