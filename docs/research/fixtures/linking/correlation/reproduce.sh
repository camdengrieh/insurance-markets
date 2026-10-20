#!/bin/sh
# Reproduce the correlation / lead-lag study (doc 18).  Usage:  sh reproduce.sh frozen   |   sh reproduce.sh live
#   frozen : rebuild every number from the compact snapshot in ./snapshot (no network).  Takes ~5 min on 8+ cores.
#   live   : re-crawl the venues (public GETs only, >=0.3 s between calls per host, <=600 requests per host), re-pick legs,
#            re-download series.  Numbers WILL differ (market state moves; Polymarket 1-minute data is only kept ~7-10 days).
# Python 3 standard library only; every script is run isolated (-I).  Work files go to ./work (created next to where you run this).
set -e
export PYTHONDONTWRITEBYTECODE=1                                    # keep the repo tree clean
MODE="${1:-frozen}"
HERE="$(cd "$(dirname "$0")" && pwd)"
S="$HERE/scripts"
mkdir -p work/out/res && cd work
export PM_CACHE_DIR="$PWD/cache"
export PM_OUT_DIR="out"
if [ "$MODE" = "frozen" ]; then
  cp "$HERE/registry.json" "$HERE/t0.txt" out/
  python3 -I "$S/snapshot_tool.py" expand "$HERE/snapshot"          # -> out/series/*.json (50 legs)
else
  python3 -I "$S/crawl_kalshi.py"                                    # -> out/kalshi_open_events.json (large, ~65 MB, not stored in repo)
  python3 -I "$S/crawl_poly.py"                                      # -> out/poly_open_events.json   (large, ~30 MB, not stored in repo)
  python3 -I "$S/registry.py"                                        # -> out/registry.json (legs + 41 relationships)
  python3 -I "$S/fetch_series.py" pm
  python3 -I "$S/fetch_series.py" kalshi
fi
python3 -I "$S/selftest.py"                                          # 25 synthetic-data unit tests, must print ALL ... PASSED
cat "$HERE/cluster_ids.txt" | xargs -P 8 -I{} python3 -I "$S/run_study.py" {}     # -> out/res/<cluster>.json
python3 -I "$S/leg_diagnostics.py"                                   # -> out/leg_diag.json
python3 -I "$S/leadlag_econ.py"                                      # -> out/leadlag_econ.json
python3 -I "$S/identity_exec.py"                                     # -> out/identity_exec.json
python3 -I "$S/check_pm_tier_consistency.py"                         # -> out/check_pm_tier.json
python3 -I "$S/check_kalshi_locf.py"                                # -> out/check_kalshi_locf.json
python3 -I "$S/sensitivity_frictions.py"                             # -> out/sensitivity_frictions.json
python3 -I "$S/make_tables.py" > out/tables.md                       # all markdown tables + Benjamini-Hochberg summaries
# live-only extras (need out/poly_open_events.json and live endpoints):
#   python3 -I "$S/calib_pm_alignment.py" PM_FED_H25 4               # Polymarket bucket-alignment calibration from public trades
#   python3 -I "$S/limitless_pair.py"                                 # Limitless vs Polymarket clone markets (needs out/limitless_active.json from GET api.limitless.exchange/markets/active)
echo "done: see work/out/tables.md"
