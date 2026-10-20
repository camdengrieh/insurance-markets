"""Unit tests of the statistics on SYNTHETIC data with known answers.  Run: python3 -I selftest.py
Prints PASS/FAIL lines and a JSON summary (selftest_results.json) for the notes."""
import json
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

R = {}
fails = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + "  " + detail)
    R[name] = {"pass": bool(cond), "detail": detail}
    if not cond:
        fails.append(name)


def jumps(n, p, rng, sizes=(0.005, 0.01, 0.02)):
    return [(rng.choice((-1, 1)) * rng.choice(sizes)) if rng.random() < p else 0.0 for _ in range(n)]


def lagged(x, L, noise_p, rng):
    n = len(x)
    y = [0.0] * n
    for t in range(n):
        if 0 <= t - L:
            y[t] += x[t - L]
    nz = jumps(n, noise_p, rng)
    return [a + b for a, b in zip(y, nz)]


# ---- T1: recover a known lead of +3 bins, both signs
rng = random.Random(11)
N = 12000
x = jumps(N, 0.15, rng)
y = lagged(x, 3, 0.05, rng)
bb = lib.block_bootstrap_ccf(x, y, 8, 60, B=400, seed=1)
peak_k = max(bb["rho"], key=lambda k: bb["rho"][k])
check("T1a peak lag recovered (x leads y by 3)", peak_k == 3, "peak=%d rho=%.3f" % (peak_k, bb["rho"][3]))
check("T1b rho(3) CI excludes 0", bb["ci"][3][0] > 0, "CI=(%.3f,%.3f)" % bb["ci"][3])
check("T1c lead-lag asymmetry CI > 0 (x leads)", bb["lam_ci"][0] > 0, "LAM=%.3f CI=(%.3f,%.3f)" % ((bb["lam"],) + bb["lam_ci"]))
check("T1d contemporaneous rho ~ 0 (no instantaneous link)", abs(bb["rho"][0]) < 0.05, "rho0=%.3f" % bb["rho"][0])
bb2 = lib.block_bootstrap_ccf(y, x, 8, 60, B=400, seed=1)
check("T1e swapping series flips sign of LAM", bb2["lam_ci"][1] < 0 and bb2["lam"] < 0, "LAM=%.3f" % bb2["lam"])
check("T1f peak lag mode in bootstrap = 3", max(bb["peak_dist"], key=bb["peak_dist"].get) == 3, str(bb["peak_dist"]))
# shift test: adding a further delay moves the peak by exactly one bin
y4 = [0.0] + y[:-1]
c4 = lib.ccf_all(x, y4, 8)
check("T1g extra 1-bin delay moves peak 3->4", max(c4, key=c4.get) == 4, "peak=%d" % max(c4, key=c4.get))
cs = lib.circular_shift_null(x, y, 8, B=200)
check("T1h circular-shift null rejects (lam_p<0.01)", cs["lam_p"] < 0.01, "p=%.4f" % cs["lam_p"])

# ---- T2: independence => false-positive rate of 95% CI near 5%
rngi = random.Random(5)
fp_boot = 0
fp_shift = 0
trials = 60
for tr in range(trials):
    xi = jumps(6000, 0.12, rngi)
    yi = jumps(6000, 0.12, rngi)
    b = lib.block_bootstrap_ccf(xi, yi, 5, 60, B=200, seed=tr)
    if not (b["lam_ci"][0] <= 0 <= b["lam_ci"][1]):
        fp_boot += 1
    c = lib.circular_shift_null(xi, yi, 5, B=100, seed=tr)
    if c["lam_p"] < 0.05:
        fp_shift += 1
check("T2a block-bootstrap LAM CI false-positive rate under independence <= 15%", fp_boot / trials <= 0.15,
      "fp=%d/%d" % (fp_boot, trials))
check("T2b circular-shift test false-positive rate <= 15%", fp_shift / trials <= 0.15, "fp=%d/%d" % (fp_shift, trials))

# ---- T3: autocorrelated (volatility-clustered) independent series -> test must not be fooled
rng3 = random.Random(8)
def clustered(n, rng):
    out = []
    vol = 0.1
    for _ in range(n):
        vol = 0.98 * vol + 0.02 * (0.4 if rng.random() < 0.05 else 0.05)
        out.append((rng.choice((-1, 1)) * 0.01) if rng.random() < vol else 0.0)
    return out
fp = 0
trials = 40
for tr in range(trials):
    a = clustered(6000, rng3)
    b = clustered(6000, rng3)
    r = lib.block_bootstrap_ccf(a, b, 5, 120, B=200, seed=tr)
    if not (r["lam_ci"][0] <= 0 <= r["lam_ci"][1]):
        fp += 1
check("T3 vol-clustered independent series: false-positive rate <= 20%", fp / trials <= 0.20, "fp=%d/%d" % (fp, trials))

# ---- T4: look-ahead guard in locf
obs = [(10, 1.0), (20, 2.0), (35, 3.0)]
g = lib.locf(obs, 0, 5, 9)   # grid times 0,5,...,40
exp = [None, None, 1.0, 1.0, 2.0, 2.0, 2.0, 3.0, 3.0]
check("T4 locf never uses an observation before it is known", g == exp, str(g))

# ---- T5: AR(1) / half-life on OU, DF test
rng5 = random.Random(21)
phi_true = 0.90
s = [0.0]
for _ in range(3000):
    s.append(phi_true * s[-1] + rng5.gauss(0, 0.01))
phi, se, c, sig = lib.ar1(s)
hl = lib.half_life(phi, 1.0)
hl_true = -math.log(2) / math.log(phi_true)
check("T5a AR(1) phi within 3 se of truth", abs(phi - phi_true) < 3 * se, "phi=%.3f se=%.3f" % (phi, se))
check("T5b half-life within 25%% of %.2f h" % hl_true, abs(hl - hl_true) / hl_true < 0.25, "hl=%.2f" % hl)
check("T5c DF rejects unit root for OU (t<-2.86)", lib.df_tstat(s) < -2.86, "t=%.2f" % lib.df_tstat(s))
rw = [0.0]
for _ in range(3000):
    rw.append(rw[-1] + rng5.gauss(0, 0.01))
rej = 0
for tr in range(50):
    w = [0.0]
    for _ in range(1500):
        w.append(w[-1] + rng5.gauss(0, 0.01))
    if lib.df_tstat(w) < -2.86:
        rej += 1
check("T5d DF false-rejection rate on random walks <= 12%", rej / 50 <= 0.12, "rej=%d/50" % rej)

# ---- T6: hedge ratio with chronological OOS split
rng6 = random.Random(31)
n = 4000
xx = [rng6.gauss(0, 0.01) for _ in range(n)]
yy = [0.7 * a + rng6.gauss(0, 0.007) for a in xx]
cut = int(0.6 * n)
a_, b_, r2_, _ = lib.ols(xx[:cut], yy[:cut])
resid = [y_ - b_ * x_ for x_, y_ in zip(xx[cut:], yy[cut:])]
vr = 1 - lib.var(resid) / lib.var(yy[cut:])
r2_true = 0.49 * 1e-4 / (0.49e-4 + 0.49e-4)
check("T6a OLS beta ~0.7", abs(b_ - 0.7) < 0.03, "beta=%.3f" % b_)
check("T6b out-of-sample variance reduction ~ R2 (%.2f)" % r2_true, abs(vr - r2_true) < 0.05, "VR=%.3f" % vr)

# ---- T7: stale quoting makes the faster venue look like a leader (documented bias) - quantify
rng7 = random.Random(41)
N7 = 12000
F = jumps(N7, 0.15, rng7)                     # common latent price changes
# venue A sees F immediately; venue B sees it with delay uniform in {0,1,2,3} bins (stale quotes)
B_ = [0.0] * N7
for t in range(N7):
    d = rng7.randrange(0, 4)
    if t + d < N7:
        B_[t + d] += F[t]
rr = lib.block_bootstrap_ccf(F, B_, 6, 60, B=200, seed=2)
check("T7 stale-quote venue looks like a lagger (LAM>0 for the fast venue) - bias is real", rr["lam_ci"][0] > 0,
      "LAM=%.3f CI=(%.3f,%.3f)" % ((rr["lam"],) + rr["lam_ci"]))

# ---- T8: pair_clean / diffs None handling
v = [1.0, None, 3.0, 4.0]
d = lib.diffs(v)
check("T8 diffs yields None across gaps", d == [None, None, None, 1.0], str(d))

# ---- T9: negatively related pair (y = -x lagged by 2): sign-aware asymmetry must still say "x leads"
rng9 = random.Random(51)
x9 = jumps(10000, 0.15, rng9)
y9 = [-v for v in lagged(x9, 2, 0.0, rng9)]
y9 = [a + b for a, b in zip(y9, jumps(10000, 0.05, rng9))]
b9 = lib.block_bootstrap_ccf(x9, y9, 6, 60, B=300, seed=1)
check("T9a negative relation: sgn=-1 and LAM CI > 0 (x leads)", b9["sgn"] == -1.0 and b9["lam_ci"][0] > 0,
      "sgn=%s LAM=%.3f CI=(%.3f,%.3f)" % ((b9["sgn"], b9["lam"]) + b9["lam_ci"]))
check("T9b negative relation: sign-aware peak lag = 2", max(b9["peak_dist"], key=b9["peak_dist"].get) == 2, str(b9["peak_dist"]))

# ---- T10: event-response lead-lag for sparse series (x leads y by 3 bins with 80% pass-through)
rng10 = random.Random(61)
n10 = 6000
x10 = [(rng10.choice((-1, 1)) * 0.005) if rng10.random() < 0.03 else 0.0 for _ in range(n10)]
y10 = [0.0] * n10
for i in range(n10 - 3):
    if x10[i] != 0 and rng10.random() < 0.8:
        y10[i + 3] += x10[i]
for i in range(n10):
    if rng10.random() < 0.01:
        y10[i] += rng10.choice((-1, 1)) * 0.005
e10 = lib.event_response(x10, y10, 5, B=200)
check("T10a event-response: S>0 and p<0.01 when x leads", e10["S"] > 0.5 and e10["p_shift"] < 0.01, "S=%.2f p=%.3f" % (e10["S"], e10["p_shift"]))
e10s = lib.event_response(y10, x10, 5, B=200)
check("T10b event-response flips sign when swapped", e10s["S"] < -0.5, "S=%.2f" % e10s["S"])
fp10 = 0
for tr in range(30):
    a_ = [(rng10.choice((-1, 1)) * 0.005) if rng10.random() < 0.03 else 0.0 for _ in range(n10)]
    b_ = [(rng10.choice((-1, 1)) * 0.005) if rng10.random() < 0.03 else 0.0 for _ in range(n10)]
    if lib.event_response(a_, b_, 5, B=100, seed=tr)["p_shift"] < 0.05:
        fp10 += 1
check("T10c event-response false-positive rate under independence <= 15%", fp10 / 30 <= 0.15, "fp=%d/30" % fp10)

_od = os.environ.get("PM_OUT_DIR", "out")
json.dump(R, open(os.path.join(_od if os.path.isdir(_od) else os.path.dirname(os.path.abspath(__file__)), "selftest_results.json"), "w"), indent=1)
print("\nFAILED: %s" % fails if fails else "\nALL %d TESTS PASSED" % len(R))
sys.exit(1 if fails else 0)
