"""Lossless-for-this-study compaction of the downloaded price series, so every number can be reproduced offline.

compact: out/series/<leg>.json  ->  <dir>/<leg>.json   (change-points only; each file < 100 KB)
expand : <dir>/<leg>.json       ->  out/series/<leg>.json (dense grids / candle rows rebuilt)
Polymarket tiers are dense LOCF grids server-side, so only value CHANGES (plus the first point) are stored.
Kalshi candle rows are kept only when (bid_close, ask_close, trade_close) differ from the previous kept row (all uses are LOCF).
usage: python3 -I src/snapshot_tool.py compact|expand DIR
"""
import gzip, json, os, sys

def compact(src, dst):
    os.makedirs(dst, exist_ok=True)
    for fn in sorted(os.listdir(src)):
        if not fn.endswith(".json"): continue
        d = json.load(open(os.path.join(src, fn)))
        out = {k: d[k] for k in d if k not in ("1m", "5m", "30m", "60m")}
        for tier in ("1m", "5m", "30m", "60m"):
            rows = d.get(tier)
            if rows is None: continue
            if "token" in d:      # Polymarket: (t, price, res)
                if not rows: out[tier] = {"step": None, "first": None, "n": 0, "chg": []}; continue
                grid = [r for r in rows if r[2] > 0]
                term = [r for r in rows if r[2] == 0]
                step = grid[0][2] if grid else 0
                chg, prev = [], None
                for t, p, res in grid:
                    if p != prev: chg.append([t, p]); prev = p
                gaps = sum(1 for a, b in zip(grid, grid[1:]) if b[0] - a[0] != step)
                out[tier] = {"step": step, "first": grid[0][0] if grid else None, "n": len(grid), "gaps": gaps, "chg": chg,
                             "grid_t": None if gaps == 0 else [r[0] for r in grid], "terminal": term}
            else:                 # Kalshi candle rows
                keep, prev = [], None
                for r in rows:
                    key = (r[1], r[2], r[3])
                    if key != prev: keep.append([r[0], r[1], r[2], r[3]]); prev = key
                out[tier] = {"rows": keep, "n_original": len(rows)}
        with gzip.open(os.path.join(dst, fn + ".gz"), "wt", compresslevel=9) as fh:
            json.dump(out, fh, separators=(",", ":"))

def expand(src, dst):
    os.makedirs(dst, exist_ok=True)
    for fn in sorted(os.listdir(src)):
        if not fn.endswith(".json.gz"): continue
        d = json.load(gzip.open(os.path.join(src, fn), "rt"))
        fn = fn[:-3]
        out = {k: d[k] for k in d if k not in ("1m", "5m", "30m", "60m")}
        for tier in ("1m", "5m", "30m", "60m"):
            c = d.get(tier)
            if c is None: continue
            if "token" in d:
                if c["n"] == 0: out[tier] = []; continue
                step = c["step"]
                ts = c["grid_t"] if c.get("grid_t") else [c["first"] + i * step for i in range(c["n"])]
                chg = c["chg"]; j = 0; cur = None; rows = []
                for t in ts:
                    while j < len(chg) and chg[j][0] <= t:
                        cur = chg[j][1]; j += 1
                    rows.append([t, cur, step])
                rows += [list(x) for x in c.get("terminal", [])]
                out[tier] = rows
            else:
                out[tier] = [r + [None, None, None] for r in c["rows"]]    # volume / open fields are not used by the analysis
        json.dump(out, open(os.path.join(dst, fn), "w"))

if __name__ == "__main__":
    mode, d = sys.argv[1], sys.argv[2]
    out_dir = os.environ.get("PM_OUT_DIR", "out")
    if mode == "compact": compact(os.path.join(out_dir, "series"), d)
    else: expand(d, os.path.join(out_dir, "series"))
