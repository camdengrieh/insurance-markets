"""Shared helpers for the funding-route verification (read-only).

- pure-Python keccak256 (validated against known vectors at import time)
- minimal ABI helpers for static types
- HTTP client: fixed User-Agent, >=0.3 s between calls per host, hard cap of 150
  requests per host (counter persisted next to this file), backoff on 429/5xx
- JSON-RPC wrapper with an explicit READ-ONLY method allowlist
No credentials, no keys, no personal identifiers anywhere.
"""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

UA = "insurance-markets-research/0.1"
HERE = os.path.dirname(os.path.abspath(__file__))
COUNTER = os.path.join(HERE, "request_counter.json")
LOGF = os.path.join(HERE, "request_log.txt")
CAP = 150
MIN_GAP = 0.3

# ---------------- keccak256 ----------------
_RC = [0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
       0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
       0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
       0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
       0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
       0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008]
_ROT = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
_M = (1 << 64) - 1


def _rol(x, n):
    n %= 64
    return ((x << n) | (x >> (64 - n))) & _M if n else x


def _f(a):
    for rnd in range(24):
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        a = [[a[x][y] ^ d[x] for y in range(5)] for x in range(5)]
        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = _rol(a[x][y], _ROT[x][y])
        a = [[b[x][y] ^ ((~b[(x + 1) % 5][y]) & b[(x + 2) % 5][y]) for y in range(5)] for x in range(5)]
        a[0][0] ^= _RC[rnd]
    return a


def keccak256(data: bytes) -> bytes:
    rate = 136
    p = bytearray(data)
    p.append(0x01)
    while len(p) % rate:
        p.append(0)
    p[-1] |= 0x80
    st = [[0] * 5 for _ in range(5)]
    for off in range(0, len(p), rate):
        blk = p[off:off + rate]
        for i in range(rate // 8):
            st[i % 5][i // 5] ^= int.from_bytes(blk[8 * i:8 * i + 8], "little")
        st = _f(st)
    out = b""
    for i in range(4):
        out += st[i % 5][i // 5].to_bytes(8, "little")
    return out


assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
assert keccak256(b"transfer(address,uint256)")[:4].hex() == "a9059cbb"
assert keccak256(b"balanceOf(address)")[:4].hex() == "70a08231"


def selector(sig: str) -> str:
    return "0x" + keccak256(sig.encode())[:4].hex()


def topic0(sig: str) -> str:
    return "0x" + keccak256(sig.encode()).hex()


def enc_uint(n: int) -> str:
    return format(n, "064x")


def enc_addr(a: str) -> str:
    return a.lower().replace("0x", "").rjust(64, "0")


def enc_b32(h: str) -> str:
    return h.lower().replace("0x", "").ljust(64, "0")


def dec_words(hexstr: str):
    h = hexstr[2:] if hexstr.startswith("0x") else hexstr
    return [h[i:i + 64] for i in range(0, len(h), 64)]


def dec_addr(w: str) -> str:
    return "0x" + w[-40:]


def dec_string(hexstr: str) -> str:
    h = hexstr[2:]
    off = int(h[0:64], 16) * 2
    ln = int(h[off:off + 64], 16)
    return bytes.fromhex(h[off + 64:off + 64 + ln * 2]).decode("utf-8", "replace")


def to_checksum(addr: str) -> str:
    a = addr.lower().replace("0x", "")
    hh = keccak256(a.encode()).hex()
    return "0x" + "".join(c.upper() if int(hh[i], 16) >= 8 else c for i, c in enumerate(a))


# ---------------- HTTP ----------------
def _load():
    try:
        with open(COUNTER) as f:
            return json.load(f)
    except Exception:
        return {}


def _save(d):
    with open(COUNTER, "w") as f:
        json.dump(d, f, indent=1)


_last = {}


def http(url, data=None, headers=None, timeout=30):
    """GET (data None) or POST (data bytes). Returns (status, body_text)."""
    host = urllib.parse.urlparse(url).netloc
    cnt = _load()
    if cnt.get(host, 0) >= CAP:
        raise RuntimeError("request cap reached for host " + host)
    gap = time.time() - _last.get(host, 0)
    if gap < MIN_GAP:
        time.sleep(MIN_GAP - gap)
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    backoff = 1.0
    for attempt in range(4):
        cnt = _load()
        if cnt.get(host, 0) >= CAP:
            raise RuntimeError("request cap reached for host " + host)
        cnt[host] = cnt.get(host, 0) + 1
        _save(cnt)
        _last[host] = time.time()
        req = urllib.request.Request(url, data=data, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read().decode("utf-8", "replace")
                st = r.status
        except urllib.error.HTTPError as e:
            st = e.code
            body = e.read().decode("utf-8", "replace")
        except Exception as e:  # network error
            st = -1
            body = "ERR " + repr(e)
        with open(LOGF, "a") as lf:
            # log host + path only (query strings can be long); never any secrets
            u = urllib.parse.urlparse(url)
            lf.write("%s %s %s %s\n" % (time.strftime("%H:%M:%S"), "POST" if data else "GET", st, u.netloc + u.path))
        if st in (429, 500, 502, 503, 504, -1) and attempt < 3:
            time.sleep(backoff)
            backoff *= 2
            continue
        return st, body
    return st, body


READ_ONLY = {"eth_chainId", "eth_blockNumber", "eth_call", "eth_getCode", "eth_getLogs",
             "eth_getStorageAt", "eth_getTransactionByHash", "eth_getTransactionReceipt",
             "eth_getBalance", "eth_supportedEntryPoints", "web3_clientVersion"}


def rpc(url, method, params=None):
    if method not in READ_ONLY:
        raise RuntimeError("method not allowed: " + method)
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    st, txt = http(url, data=body, headers={"Content-Type": "application/json"})
    try:
        j = json.loads(txt)
    except Exception:
        return {"_http": st, "_raw": txt[:300]}
    j["_http"] = st
    return j


def eth_call(url, to, data, block="latest"):
    j = rpc(url, "eth_call", [{"to": to, "data": data}, block])
    if "result" in j:
        return j["result"]
    return {"error": j.get("error") or j.get("_raw") or j}


def get_json(url):
    st, txt = http(url)
    try:
        return st, json.loads(txt)
    except Exception:
        return st, txt[:300]


# ---------------- Blockscout etherscan-style GET helpers ----------------
def bs_call(host, to, data, tag="latest"):
    """eth_call through the explorer's etherscan-style GET proxy (read-only)."""
    q = urllib.parse.urlencode({"module": "proxy", "action": "eth_call", "to": to, "data": data, "tag": tag})
    st, j = get_json(host + "/api?" + q)
    if isinstance(j, dict) and "result" in j:
        return j["result"]
    return {"error": j, "http": st}


def bs_logs(host, address, topic0, from_block, to_block, topic1=None, page=1, offset=1000):
    p = {"module": "logs", "action": "getLogs", "address": address, "topic0": topic0,
         "fromBlock": from_block, "toBlock": to_block, "page": page, "offset": offset}
    if topic1:
        p["topic0_1_opr"] = "and"
        p["topic1"] = topic1
    st, j = get_json(host + "/api?" + urllib.parse.urlencode(p))
    return st, j
