#!/usr/bin/env python3
"""Throttled read-only GET helper for the order-semantics research task.

- GET only. UA fixed. >=250 ms between calls to one host. Hard cap 150 requests/host
  (counter persisted in a small json file next to the raw outputs).
- Backoff on 429/5xx. 401/403 are recorded as 'requires key' and the host is marked blocked.
Usage: fetch.py URL OUTFILE
"""
import json, os, sys, time, urllib.request, urllib.error
from urllib.parse import urlparse

UA = "insurance-markets-research/0.1"
BASE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(os.path.dirname(BASE), "raw", "_state.json")
CAP = 150
MIN_GAP = 0.3


def load():
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception:
        return {"count": {}, "last": {}, "blocked": {}}


def save(s):
    with open(STATE, "w") as f:
        json.dump(s, f)


def get(url, out=None, retries=3):
    host = urlparse(url).netloc
    s = load()
    if s["blocked"].get(host):
        print("BLOCKED host (requires key / refused):", host, s["blocked"][host])
        return None
    if s["count"].get(host, 0) >= CAP:
        print("CAP reached for host", host)
        return None
    for attempt in range(retries):
        wait = MIN_GAP - (time.time() - s["last"].get(host, 0))
        if wait > 0:
            time.sleep(wait)
        s["count"][host] = s["count"].get(host, 0) + 1
        s["last"][host] = time.time()
        save(s)
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                body = r.read()
                if out:
                    with open(out, "wb") as f:
                        f.write(body)
                return body
        except urllib.error.HTTPError as e:
            body = e.read()
            if e.code in (401, 403):
                s = load()
                s["blocked"][host] = e.code
                save(s)
                print("HTTP", e.code, "requires key / refused:", host, body[:200])
                return None
            if e.code == 429 or e.code >= 500:
                time.sleep(2 ** (attempt + 1))
                s = load()
                continue
            print("HTTP", e.code, body[:300])
            if out:
                with open(out, "wb") as f:
                    f.write(body)
            return body
        except Exception as e:
            print("ERR", e)
            time.sleep(2 ** (attempt + 1))
            s = load()
    return None


if __name__ == "__main__":
    b = get(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print("bytes:", None if b is None else len(b))
