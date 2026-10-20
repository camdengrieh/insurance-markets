"""Shared helpers for the empirical constraint study (task 17).

Contents
  * Http: polite, GET-only, cached, per-host-capped JSON fetcher (stdlib only).
  * Decimal helpers, order-book normalisation for the four venues.
  * Fee models (Polymarket, Kalshi, XO, Limitless).
  * Multi-leg "buy every leg, collect a guaranteed minimum payoff" optimiser.

Everything here is read-only. There is deliberately no code path that issues
anything but HTTP GET, signs anything, or reads credentials.
"""
import gzip
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal, getcontext

getcontext().prec = 40

UA = "insurance-markets-research/0.1 (read-only public GET; research snapshot)"
HOST_CAP = 600          # hard cap per host per task (ground rules)
SOFT_CAP = 560          # scripts stop planning new requests above this
MIN_INTERVAL = 0.30     # seconds between calls to the same host (>= 250 ms required)

ZERO = Decimal(0)
ONE = Decimal(1)


def D(x):
    """Exact Decimal from str/int/float/Decimal; None/'' -> None."""
    if x is None or x == "":
        return None
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
class CapExceeded(RuntimeError):
    pass


class Http:
    """GET-only JSON client with an on-disk cache, per-host throttle and cap."""

    def __init__(self, raw_dir, offline=False, min_interval=MIN_INTERVAL, cap=HOST_CAP):
        self.raw_dir = raw_dir
        self.cache_dir = os.path.join(raw_dir, "cache")
        os.makedirs(self.cache_dir, exist_ok=True)
        self.log_path = os.path.join(raw_dir, "request_log.jsonl")
        self.offline = offline
        self.min_interval = max(min_interval, 0.25)
        self.cap = cap
        self.last_call = {}
        self.counts = {}
        if os.path.exists(self.log_path):
            with open(self.log_path) as f:
                for line in f:
                    try:
                        h = json.loads(line)["host"]
                    except Exception:
                        continue
                    self.counts[h] = self.counts.get(h, 0) + 1

    # -- bookkeeping -------------------------------------------------------
    def used(self, host):
        return self.counts.get(host, 0)

    def remaining(self, host, soft=True):
        return (SOFT_CAP if soft else self.cap) - self.used(host)

    def _log(self, host, url, status, nbytes):
        self.counts[host] = self.counts.get(host, 0) + 1
        with open(self.log_path, "a") as f:
            f.write(json.dumps({"ts": time.time(), "host": host, "url": url[:400],
                                "status": status, "bytes": nbytes}) + "\n")

    def _cache_path(self, url):
        host = urllib.parse.urlsplit(url).netloc
        h = hashlib.sha1(url.encode()).hexdigest()
        d = os.path.join(self.cache_dir, host)
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, h + ".json")

    # -- main call ---------------------------------------------------------
    def get(self, url, params=None, fresh=False, max_tries=5, timeout=60):
        """Returns (obj, meta). obj is None on a non-retryable HTTP error.
        meta = {url, status, fetched_at, cached}. Never raises on HTTP errors,
        raises CapExceeded if the per-host cap would be breached."""
        if params:
            q = urllib.parse.urlencode(params, doseq=True, safe=",")
            url = url + ("&" if "?" in url else "?") + q
        parts = urllib.parse.urlsplit(url)
        host = parts.netloc
        path = self._cache_path(url)
        if not fresh and os.path.exists(path):
            with open(path) as f:
                rec = json.load(f)
            meta = dict(rec["meta"])
            meta["cached"] = True
            return rec["body"], meta
        if self.offline:
            return None, {"url": url, "status": None, "fetched_at": None, "cached": False, "offline_miss": True}
        for attempt in range(max_tries):
            if self.used(host) >= self.cap:
                raise CapExceeded(f"per-host cap {self.cap} reached for {host}")
            wait = self.min_interval - (time.time() - self.last_call.get(host, 0))
            if wait > 0:
                time.sleep(wait)
            req = urllib.request.Request(url, method="GET", headers={
                "User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip"})
            self.last_call[host] = time.time()
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    raw = resp.read()
                    if resp.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                    status = resp.status
                self._log(host, url, status, len(raw))
                try:
                    body = json.loads(raw)
                except Exception:
                    body = {"_text": raw[:2000].decode("utf-8", "replace")}
                meta = {"url": url, "status": status, "fetched_at": time.time(), "cached": False}
                with open(path, "w") as f:
                    json.dump({"meta": meta, "body": body}, f)
                return body, meta
            except urllib.error.HTTPError as e:
                self._log(host, url, e.code, 0)
                if e.code in (429, 500, 502, 503, 504):
                    ra = e.headers.get("Retry-After") if e.headers else None
                    delay = float(ra) if ra and ra.replace(".", "", 1).isdigit() else 2 ** attempt
                    time.sleep(min(delay, 60))
                    continue
                try:
                    body = json.loads(e.read())
                except Exception:
                    body = None
                meta = {"url": url, "status": e.code, "fetched_at": time.time(), "cached": False}
                # cache definitive client errors so reruns do not re-hit
                with open(path, "w") as f:
                    json.dump({"meta": meta, "body": body}, f)
                return body, meta
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                self._log(host, url, -1, 0)
                time.sleep(min(2 ** attempt, 30))
        return None, {"url": url, "status": -1, "fetched_at": time.time(), "cached": False}


# --------------------------------------------------------------------------
# Order books
# --------------------------------------------------------------------------
class Book:
    """Executable view of one YES-instrument book.

    bids: [(price, size)] sorted DESCENDING (best first)
    asks: [(price, size)] sorted ASCENDING  (best first)
    sizes are in contracts/shares; prices in dollars per contract (0..1).
    The NO instrument is derived: NO ask = 1 - YES bid, NO bid = 1 - YES ask.
    """

    def __init__(self, bids, asks, ts=None, tick=None, min_size=None, src=None):
        self.bids = sorted([(D(p), D(s)) for p, s in bids if D(s) and D(s) > 0], key=lambda x: -x[0])
        self.asks = sorted([(D(p), D(s)) for p, s in asks if D(s) and D(s) > 0], key=lambda x: x[0])
        self.ts = ts            # epoch seconds of last book change, if the venue reports it
        self.tick = tick
        self.min_size = min_size
        self.src = src

    @property
    def best_bid(self):
        return self.bids[0][0] if self.bids else None

    @property
    def best_ask(self):
        return self.asks[0][0] if self.asks else None

    def yes_buy_levels(self):
        return list(self.asks)

    def no_buy_levels(self):
        """Buying NO = hitting YES bids; NO price = 1 - YES bid."""
        return [(ONE - p, s) for p, s in self.bids]

    def crossed(self):
        return bool(self.bids and self.asks and self.bids[0][0] >= self.asks[0][0])

    def depth_usd(self, side, within=Decimal("0.10")):
        """Dollar value of resting orders within `within` of the touch."""
        lv = self.bids if side == "bid" else self.asks
        if not lv:
            return ZERO
        top = lv[0][0]
        return sum(p * s for p, s in lv if abs(p - top) <= within)


def book_from_polylike(obj, ts_unit="ms"):
    """Polymarket CLOB and XO orderbook JSON: levels are {price,size} strings.
    Ordering differs by venue (Polymarket best-LAST, XO best-first) so we sort."""
    if not isinstance(obj, dict):
        return None
    bids = [(l["price"], l["size"]) for l in obj.get("bids", [])]
    asks = [(l["price"], l["size"]) for l in obj.get("asks", [])]
    ts = None
    if obj.get("timestamp"):
        try:
            ts = int(obj["timestamp"]) / (1000 if ts_unit == "ms" else 1)
        except Exception:
            ts = None
    return Book(bids, asks, ts=ts, tick=D(obj.get("tick_size")), min_size=D(obj.get("min_order_size")), src="polylike")


def book_from_kalshi(ob_fp):
    """Kalshi orderbook_fp: yes_dollars / no_dollars are BID ladders [[price,count],...].
    YES ask = 1 - NO bid price, same size (a NO bid at q is a YES ask at 1-q)."""
    if not isinstance(ob_fp, dict):
        return None
    yb = [(p, s) for p, s in ob_fp.get("yes_dollars", [])]
    ya = [(ONE - D(p), s) for p, s in ob_fp.get("no_dollars", [])]
    return Book(yb, ya, src="kalshi")


def book_from_limitless(obj):
    """Limitless /markets/{slug}/orderbook: YES-side only, price float, size in 1e6 units."""
    if not isinstance(obj, dict):
        return None
    scale = Decimal(10) ** 6
    bids = [(D(l["price"]), D(l["size"]) / scale) for l in obj.get("bids", [])]
    asks = [(D(l["price"]), D(l["size"]) / scale) for l in obj.get("asks", [])]
    return Book(bids, asks, min_size=(D(obj.get("minSize")) / scale) if obj.get("minSize") else None, src="limitless")


def take(levels, qty):
    """Walk ascending-price `levels` [(price,size)] for `qty` contracts.
    Returns list of fills [(price, size)] or None if depth is insufficient."""
    qty = D(qty)
    fills, left = [], qty
    for p, s in levels:
        if left <= 0:
            break
        t = s if s < left else left
        fills.append((p, t))
        left -= t
    return fills if left <= 0 else None


def total_depth(levels):
    return sum((s for _, s in levels), ZERO)


# --------------------------------------------------------------------------
# Fee models. Each takes fills [(price,size)] for ONE leg that BUYS an
# instrument at `price` (the instrument's own price: for a NO leg price is the
# NO price). Return USD fee. Taker fees only: every leg here crosses the book.
# --------------------------------------------------------------------------
def q_round(x, quantum, mode=ROUND_HALF_UP):
    return (x / quantum).to_integral_value(rounding=mode) * quantum


def fee_polymarket(fills, rate, exponent=1, enabled=True):
    """docs.polymarket.com/trading/fees: fee = C * feeRate * p * (1-p), taker only,
    rounded to 5 dp (minimum 0.00001) per match. `rate`/`exponent` come from the
    market's Gamma feeSchedule (exponent applied to the p(1-p) term, assumed)."""
    if not enabled or not rate:
        return ZERO
    rate = D(rate)
    tot = ZERO
    for p, c in fills:
        f = c * rate * (p * (ONE - p)) ** int(exponent)
        f = q_round(f, Decimal("0.00001"))
        if f == 0 and c > 0 and p not in (ZERO, ONE):
            f = Decimal("0.00001")
        tot += f
    return tot


KALSHI_COEF = Decimal("0.07")


def fee_kalshi(fills, multiplier=1, grid=Decimal("0.01"), coef=KALSHI_COEF):
    """Kalshi taker fee for a BUY order (docs.kalshi.com/getting_started/fee_rounding).
    model_fee = coef * multiplier * sum(C*P*(1-P)); trade_fee = ceil to $0.000001;
    the buyer's balance is then aligned DOWN to `grid` ($0.01 non-direct members,
    $0.0001 direct), so total cash paid = ceil_to_grid(sum(P*C) + trade_fee).
    Returns the net fee = cash paid - sum(P*C). Order-level accumulator rebates
    are ignored (they only ever reduce the fee), so this is slightly conservative."""
    if not fills:
        return ZERO
    mult = D(multiplier)
    model = sum((coef * mult * c * p * (ONE - p) for p, c in fills), ZERO)
    trade_fee = model.quantize(Decimal("0.000001"), rounding=ROUND_CEILING)
    notional = sum((p * c for p, c in fills), ZERO)
    paid = ((notional + trade_fee) / grid).to_integral_value(rounding=ROUND_CEILING) * grid
    return paid - notional


def fee_xo(fills, bps):
    """XO: fee = C * bps/10000 * p * (1-p), each fill rounded DOWN to 1e-6
    (docs.xo.market/guides/fees + product/trading/fees)."""
    if not bps:
        return ZERO
    b = D(bps) / Decimal(10000)
    tot = ZERO
    for p, c in fills:
        tot += q_round(c * b * p * (ONE - p), Decimal("0.000001"), ROUND_FLOOR)
    return tot


_LL_BUY = [("0.01", "0.03"), ("0.50", "0.03"), ("0.55", "0.0252"), ("0.60", "0.0213"), ("0.65", "0.018"),
           ("0.70", "0.0151"), ("0.75", "0.0126"), ("0.80", "0.0105"), ("0.85", "0.0085"),
           ("0.90", "0.0068"), ("0.95", "0.0053"), ("0.99", "0.0042"), ("0.999", "0.004")]


def _interp(table, p):
    pts = [(Decimal(a), Decimal(b)) for a, b in table]
    if p <= pts[0][0]:
        return pts[0][1]
    if p >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= p <= x1:
            return y0 + (y1 - y0) * (p - x0) / (x1 - x0)
    return pts[-1][1]


def fee_limitless_buy(fills, enabled=True):
    """Limitless CLOB taker BUY fee (docs.limitless.exchange/user-guide/fees): piecewise
    table 3.00% (<=0.50) falling to 0.40% (0.999). The docs give the table but no
    closed form, so we linearly interpolate and charge rate * notional (USD). The real
    fee is paid in outcome tokens; USD-equivalent charging is an approximation."""
    if not enabled:
        return ZERO
    return sum((_interp(_LL_BUY, p) * p * c for p, c in fills), ZERO)


# --------------------------------------------------------------------------
# Multi-leg optimiser
# --------------------------------------------------------------------------
class Leg:
    """One BUY leg: ascending executable `levels` [(price,size)], a fee function
    fills -> USD, a label, and the instrument's minimum order size (contracts)."""

    def __init__(self, label, levels, fee_fn, min_size=None, venue=None, meta=None):
        self.label = label
        self.levels = sorted([(D(p), D(s)) for p, s in levels if D(s) > 0], key=lambda x: x[0])
        self.fee_fn = fee_fn
        self.min_size = D(min_size) if min_size else ZERO
        self.venue = venue
        self.meta = meta or {}

    def depth(self):
        return total_depth(self.levels)

    def cost_fee(self, q):
        fills = take(self.levels, q)
        if fills is None:
            return None
        cost = sum((p * c for p, c in fills), ZERO)
        return cost, self.fee_fn(fills), fills


def evaluate(legs, q, payoff):
    """Net profit of buying `q` units of every leg and collecting `payoff` per unit
    (the guaranteed MINIMUM payoff of the whole package)."""
    cost = fee = ZERO
    for leg in legs:
        r = leg.cost_fee(q)
        if r is None:
            return None
        cost += r[0]
        fee += r[1]
    gross = payoff * q - cost
    return {"q": q, "cost": cost, "fees": fee, "gross": gross, "net": gross - fee}


def optimise(legs, payoff):
    """Find the size q (in units of the package) that maximises net profit, scanning
    every cumulative-depth breakpoint of every leg (profit is piecewise linear in q
    apart from the tiny fee curvature). Also returns the result at the touch size
    (largest q that only uses the first level of every leg).
    Returns dict with 'best' (max net, may be <=0), 'touch', 'max_depth'."""
    payoff = D(payoff)
    if not legs or any(not leg.levels for leg in legs):
        return None
    cap = min(leg.depth() for leg in legs)
    if cap <= 0:
        return None
    bps = set()
    for leg in legs:
        acc = ZERO
        for _, s in leg.levels:
            acc += s
            if acc <= cap:
                bps.add(acc)
    bps.add(cap)
    touch_q = min(leg.levels[0][1] for leg in legs)
    bps.add(touch_q)
    best = None
    for q in sorted(bps):
        r = evaluate(legs, q, payoff)
        if r is None:
            continue
        if best is None or r["net"] > best["net"]:
            best = r
    touch = evaluate(legs, touch_q, payoff)
    return {"best": best, "touch": touch, "max_depth": cap}


def bps_of(profit, base):
    if base is None or base == 0:
        return None
    return float(profit / base * 10000)


def fnum(x, nd=6):
    if x is None:
        return None
    return round(float(x), nd)


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def jdump(obj, path, indent=None, maxbytes=100_000):
    s = json.dumps(obj, indent=indent, ensure_ascii=False, default=str)
    if len(s.encode()) > maxbytes:
        raise RuntimeError(f"{path} would be {len(s)} bytes (> {maxbytes})")
    with open(path, "w") as f:
        f.write(s)
    return len(s)
