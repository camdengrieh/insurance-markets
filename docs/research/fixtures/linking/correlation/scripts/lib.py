"""Statistics library for the prediction-market correlation / lead-lag study (stdlib only).

Conventions
-----------
* A *grid* is a list of floats (or None) at times g_i = start + i*step (UTC epoch seconds).
* ``locf`` builds a grid from irregular observations ``(t_known, value)``: value at g_i is the last observation
  whose *known time* is <= g_i  (no look-ahead: a value is never used before it was knowable).
* Returns are first differences of prices in probability points (e.g. 0.005 = half a cent).
* ``ccf(x, y, k)`` = corr(x_t, y_{t+k}):  k > 0  means x LEADS y by k bins.
"""
import bisect
import math
import random


# ----------------------------------------------------------------------------- grids
def locf(obs, start, step, n):
    """obs: list of (t_known, value) sorted by t. Returns list of n values (None before first obs)."""
    out = [None] * n
    j = 0
    cur = None
    m = len(obs)
    for i in range(n):
        g = start + i * step
        while j < m and obs[j][0] <= g:
            cur = obs[j][1]
            j += 1
        out[i] = cur
    return out


def diffs(v):
    """First differences; None where either side is None."""
    out = [None] * len(v)
    for i in range(1, len(v)):
        if v[i] is not None and v[i - 1] is not None:
            out[i] = v[i] - v[i - 1]
    return out


def pair_clean(x, y):
    """Keep indices where both are not None. Returns (xs, ys, idx)."""
    xs, ys, idx = [], [], []
    for i, (a, b) in enumerate(zip(x, y)):
        if a is not None and b is not None:
            xs.append(a)
            ys.append(b)
            idx.append(i)
    return xs, ys, idx


def resample_sum(r, k):
    """Non-overlapping k-bin sums of a diff series (None-safe: a block with any None -> None)."""
    out = []
    for i in range(0, len(r) - k + 1, k):
        blk = r[i:i + k]
        out.append(None if any(b is None for b in blk) else sum(blk))
    return out


# ----------------------------------------------------------------------------- basic stats
def mean(a):
    return sum(a) / len(a) if a else float("nan")


def var(a, ddof=1):
    n = len(a)
    if n <= ddof:
        return float("nan")
    m = mean(a)
    return sum((v - m) ** 2 for v in a) / (n - ddof)


def sd(a):
    v = var(a)
    return math.sqrt(v) if v == v else float("nan")


def pearson(x, y):
    n = len(x)
    if n < 3:
        return float("nan")
    mx, my = mean(x), mean(y)
    sxx = sum((a - mx) ** 2 for a in x)
    syy = sum((b - my) ** 2 for b in y)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    if sxx <= 0 or syy <= 0:
        return float("nan")
    return sxy / math.sqrt(sxx * syy)


def quantile(a, q):
    s = sorted(a)
    if not s:
        return float("nan")
    pos = q * (len(s) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def ols(x, y):
    """y = a + b x. Returns (a, b, r2, resid_var)."""
    n = len(x)
    mx, my = mean(x), mean(y)
    sxx = sum((a - mx) ** 2 for a in x)
    sxy = sum((a - mx) * (b - my) for a, b in zip(x, y))
    b = sxy / sxx if sxx > 0 else 0.0
    a = my - b * mx
    res = [yy - a - b * xx for xx, yy in zip(x, y)]
    sst = sum((yy - my) ** 2 for yy in y)
    sse = sum(e * e for e in res)
    r2 = 1 - sse / sst if sst > 0 else float("nan")
    return a, b, r2, sse / (n - 2) if n > 2 else float("nan")


def winsor(a, p=0.005):
    lo, hi = quantile(a, p), quantile(a, 1 - p)
    return [min(max(v, lo), hi) for v in a]


# ----------------------------------------------------------------------------- cross-correlation
def ccf_all(x, y, K):
    """Return dict k -> corr(x_t, y_{t+k}) for k in -K..K using full-sample demeaned moments.
    x, y are equal-length lists of floats (no None)."""
    n = len(x)
    mx, my = mean(x), mean(y)
    xd = [a - mx for a in x]
    yd = [b - my for b in y]
    sxx = sum(a * a for a in xd)
    syy = sum(b * b for b in yd)
    den = math.sqrt(sxx * syy) if sxx > 0 and syy > 0 else float("nan")
    nzx = [i for i, a in enumerate(xd) if a != 0.0]
    out = {}
    for k in range(-K, K + 1):
        s = 0.0
        for i in nzx:
            j = i + k
            if 0 <= j < n:
                s += xd[i] * yd[j]
        out[k] = s / den if den == den else float("nan")
    return out


def block_bootstrap_ccf(x, y, K, block, B=1000, seed=1, sgn=None):
    """Fixed (non-overlapping) block bootstrap of the CCF.  Blocks of `block` bins are resampled with replacement;
    numerator sums per block are precomputed so each replicate is O(J*K).
    Returns dict with point estimates, 95% CIs per lag, CI of the lead-lag asymmetry
      LAM = sgn * (sum_{k=1..K} rho(k) - sum_{k=1..K} rho(-k))   (> 0  <=> x leads y),
    where sgn = sign of the total cross-correlation (so negatively related pairs are handled too).
    and the bootstrap distribution of the peak lag k* = argmax_k rho(k) over k in -K..K."""
    n = len(x)
    mx, my = mean(x), mean(y)
    xd = [a - mx for a in x]
    yd = [b - my for b in y]
    J = n // block
    if J < 8:
        return None
    ks = list(range(-K, K + 1))
    S = {k: [0.0] * J for k in ks}
    A = [0.0] * J
    Bv = [0.0] * J
    for j in range(J):
        lo, hi = j * block, (j + 1) * block
        a = 0.0
        b = 0.0
        for i in range(lo, hi):
            a += xd[i] * xd[i]
            b += yd[i] * yd[i]
        A[j], Bv[j] = a, b
        nz = [i for i in range(lo, hi) if xd[i] != 0.0]
        for k in ks:
            s = 0.0
            for i in nz:
                t = i + k
                if 0 <= t < n:
                    s += xd[i] * yd[t]
            S[k][j] = s
    def stat(idx):
        sa = sum(A[j] for j in idx)
        sb = sum(Bv[j] for j in idx)
        den = math.sqrt(sa * sb) if sa > 0 and sb > 0 else float("nan")
        return {k: sum(S[k][j] for j in idx) / den for k in ks}
    full = stat(list(range(J)))
    if sgn is None:
        sgn = 1.0 if sum(full.values()) >= 0 else -1.0
    rng = random.Random(seed)
    boots = {k: [] for k in ks}
    lam = []
    peak = []
    for _ in range(B):
        idx = [rng.randrange(J) for _ in range(J)]
        r = stat(idx)
        if any(v != v for v in r.values()):
            continue
        for k in ks:
            boots[k].append(r[k])
        lam.append(sgn * sum(r[k] - r[-k] for k in range(1, K + 1)))
        peak.append(max(ks, key=lambda k: sgn * r[k]))
    ci = {k: (quantile(boots[k], 0.025), quantile(boots[k], 0.975)) for k in ks}
    lam_full = sgn * sum(full[k] - full[-k] for k in range(1, K + 1))
    return {"rho": full, "ci": ci, "lam": lam_full, "sgn": sgn, "lam_ci": (quantile(lam, 0.025), quantile(lam, 0.975)),
            "peak_dist": {k: peak.count(k) / len(peak) for k in ks if peak.count(k)}, "J": J, "B": len(lam)}


def circular_shift_null(x, y, K, B=300, seed=2, min_shift_frac=0.1):
    """Null distribution of rho(k) and LAM from circularly shifting y (keeps each series' autocorrelation,
    destroys cross-dependence). Returns dict with 2.5/97.5 percentiles per lag and for LAM, and p-value of observed LAM."""
    n = len(x)
    rng = random.Random(seed)
    obs = ccf_all(x, y, K)
    lam_obs = sum(obs[k] - obs[-k] for k in range(1, K + 1))
    lams = []
    per = {k: [] for k in range(-K, K + 1)}
    lo = int(n * min_shift_frac)
    hi = int(n * (1 - min_shift_frac))
    for _ in range(B):
        s = rng.randrange(lo, hi)
        ys = y[s:] + y[:s]
        r = ccf_all(x, ys, K)
        for k in r:
            per[k].append(r[k])
        lams.append(sum(r[k] - r[-k] for k in range(1, K + 1)))
    p = (1 + sum(1 for v in lams if abs(v) >= abs(lam_obs))) / (B + 1)
    return {"band": {k: (quantile(per[k], 0.025), quantile(per[k], 0.975)) for k in per}, "lam_p": p,
            "lam_band": (quantile(lams, 0.025), quantile(lams, 0.975))}


# ----------------------------------------------------------------------------- spreads / mean reversion
def ar1(s):
    """AR(1) with intercept: s_t = c + phi s_{t-1} + e.  Returns (phi, se_phi, c, sigma_e)."""
    x = s[:-1]
    y = s[1:]
    n = len(x)
    if n < 10:
        return (float("nan"),) * 4
    a, b, r2, rv = ols(x, y)
    sxx = sum((v - mean(x)) ** 2 for v in x)
    se = math.sqrt(rv / sxx) if sxx > 0 else float("nan")
    return b, se, a, math.sqrt(rv)


def half_life(phi, step_hours):
    if phi != phi or phi <= 0 or phi >= 1:
        return float("inf") if (phi == phi and phi >= 1) else float("nan")
    return -math.log(2) / math.log(phi) * step_hours


def df_tstat(s):
    """Dickey-Fuller t-stat (constant, no lags): ds_t = a + g s_{t-1} + e.  5% critical value ~ -2.86 (n large)."""
    x = s[:-1]
    y = [b - a for a, b in zip(s[:-1], s[1:])]
    a, g, r2, rv = ols(x, y)
    sxx = sum((v - mean(x)) ** 2 for v in x)
    se = math.sqrt(rv / sxx) if sxx > 0 else float("nan")
    return g / se if se == se and se > 0 else float("nan")


def block_bootstrap_stat(series, fn, block, B=500, seed=3):
    """Generic moving-block bootstrap CI for a scalar statistic fn(list)->float."""
    n = len(series)
    if n < 3 * block:
        return (float("nan"), float("nan"))
    rng = random.Random(seed)
    nb = n // block
    vals = []
    for _ in range(B):
        samp = []
        for _ in range(nb):
            st = rng.randrange(0, n - block + 1)
            samp += series[st:st + block]
        v = fn(samp)
        if v == v and abs(v) != float("inf"):
            vals.append(v)
    return (quantile(vals, 0.025), quantile(vals, 0.975)) if vals else (float("nan"), float("nan"))


# ----------------------------------------------------------------------------- fees (taker, per $1 contract)
def fee_quadratic(p, rate):
    """Quadratic taker fee per contract at price p: rate * p * (1-p)  (Polymarket feeSchedule / Kalshi quadratic)."""
    return rate * p * (1.0 - p)


def annualise(r, days):
    """Annualise a simple holding-period return r over `days` days (compound)."""
    if days <= 0:
        return float("inf") if r > 0 else float("-inf")
    if r <= -1:
        return -1.0
    try:
        return (1.0 + r) ** (365.0 / days) - 1.0
    except OverflowError:
        return float("inf")


# ----------------------------------------------------------------------------- event-response lead-lag (for sparse mid-price moves)
def event_response(dx, dy, W, B=300, seed=7, min_shift_frac=0.1):
    """Event-based lead-lag for series whose mid changes only rarely.

    An *event* is any bin with a non-zero change; its sign is the sign of the change.
    For every x-event at bin i we ask whether y has an event of the SAME sign
      - in (i, i+W]   ("followed"),   - in [i-W, i)   ("preceded"),   - exactly at i ("coincident").
    lead score  S = (F_xy - P_xy) - (F_yx - P_yx),   F/P = shares of events followed/preceded.
    S > 0  <=>  x leads y  (x-events tend to be followed by y-events more than preceded by them, and vice-versa).
    Null: circularly shift y by a random offset (>= min_shift_frac*n) and recompute S -> two-sided p-value."""
    n = len(dx)
    def prep(d):
        pos = [0] * (n + 1)
        neg = [0] * (n + 1)
        for i in range(n):
            pos[i + 1] = pos[i] + (1 if d[i] > 0 else 0)
            neg[i + 1] = neg[i] + (1 if d[i] < 0 else 0)
        return pos, neg
    def shares(da, db, pb, nb_):
        ev = [(i, 1 if da[i] > 0 else -1) for i in range(n) if da[i] != 0]
        if not ev:
            return None
        f = p = c = 0
        for i, sg in ev:
            cum = pb if sg > 0 else nb_
            hi = min(n, i + W + 1)
            lo = max(0, i - W)
            if cum[hi] - cum[i + 1] > 0:
                f += 1
            if cum[i] - cum[lo] > 0:
                p += 1
            if cum[i + 1] - cum[i] > 0:
                c += 1
        m = len(ev)
        return f / m, p / m, c / m, m
    def score(dyy):
        px, nx_ = prep(dx)
        py, ny_ = prep(dyy)
        a = shares(dx, dyy, py, ny_)
        b = shares(dyy, dx, px, nx_)
        if a is None or b is None:
            return None
        return (a[0] - a[1]) - (b[0] - b[1]), a, b
    obs = score(dy)
    if obs is None:
        return {"n_events_x": sum(1 for v in dx if v != 0), "n_events_y": sum(1 for v in dy if v != 0), "insufficient": True}
    S, a, b = obs
    rng = random.Random(seed)
    lo, hi = int(n * min_shift_frac), int(n * (1 - min_shift_frac))
    null = []
    for _ in range(B):
        sft = rng.randrange(lo, hi)
        r = score(dy[sft:] + dy[:sft])
        if r is not None:
            null.append(r[0])
    p = (1 + sum(1 for v in null if abs(v) >= abs(S))) / (len(null) + 1)
    return {"S": S, "p_shift": p, "null_band": [quantile(null, 0.025), quantile(null, 0.975)], "W": W,
            "x_followed": a[0], "x_preceded": a[1], "x_coincident": a[2], "n_events_x": a[3],
            "y_followed": b[0], "y_preceded": b[1], "y_coincident": b[2], "n_events_y": b[3]}
