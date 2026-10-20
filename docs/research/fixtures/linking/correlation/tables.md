## T1. Panel (41 relationships, 50 legs; snapshot 2026-10-18T18:10:00+00:00)

| id | type | x (first leg) | y (second leg) | venues | note |
|---|---|---|---|---|---|
| X01_senate_D | same-event | PM_SEN_D | K_SEN_D | K+PM | Senate control, Democratic. Rule text differs (VP tiebreak / independents / early call) - see 08-venues notes |
| X02_house_D | same-event | PM_HOU_D | K_HOU_D | K+PM | House control, Democratic |
| X03_fed_oct_hold | same-event | PM_FED_H0 | K_FED_H0 | K+PM | FOMC Oct 2026, no change |
| X04_fed_oct_hike25 | same-event | PM_FED_H25 | K_FED_H25 | K+PM | FOMC Oct 2026, +25bp |
| X05_bop_dem_sweep | same-event | PM_BOP_DD | K_BOP_DD | K+PM | Balance of power: Democrats sweep |
| X06_tx_senate_D | same-event | PM_TX_D | K_TX_D | K+PM | Texas Senate race, Democratic nominee wins |
| X07_vance_nominee | same-event | PM_VANCE_NOM | K_VANCE_NOM | K+PM | Vance GOP 2028 nomination |
| X08_newsom_nominee | same-event | PM_NEWSOM_NOM | K_NEWSOM_NOM | K+PM | Newsom Dem 2028 nomination |
| X09_vance_winner | same-event | PM_VANCE_WIN | K_VANCE_WIN | K+PM | Vance wins 2028 presidency |
| X10_okc_west | same-event | PM_NBA_OKC_W | K_NBA_OKC_W | K+PM | OKC wins 2027 West title (thin on PM) |
| X11_btc_100k_2026 | same-event | PM_BTC_100K | K_BTC_100K | K+PM | BTC reaches $100k in 2026. NOT the same contract: PM = Binance 1m high 'reach', Kalshi = max-in-year rule; treat as basis pair |
| XR1_fed_sep_hike25_resolved | same-event | PM_FEDSEP_H25 | K_FEDSEP_H25 | K+PM | RESOLVED control: FOMC Sep 2026 +25bp (resolved YES on both venues) |
| XR2_fed_sep_hold_resolved | same-event | PM_FEDSEP_H0 | K_FEDSEP_H0 | K+PM | RESOLVED control: FOMC Sep 2026 no change (resolved NO) |
| L01_pm_btc_100_110 | ladder | PM_BTC_100K | PM_BTC_110K | PM | P(reach 110k) <= P(reach 100k) |
| L02_pm_btc_110_120 | ladder | PM_BTC_110K | PM_BTC_120K | PM | P(reach 120k) <= P(reach 110k) |
| L03_pm_btc_90_100 | ladder | PM_BTC_90K | PM_BTC_100K | PM | P(reach 100k) <= P(reach 90k) |
| L04_k_btc_100_110 | ladder | K_BTC_100K | K_BTC_110K | K | Kalshi max-BTC-2026 rungs |
| L05_k_btc_110_120 | ladder | K_BTC_110K | K_BTC_120K | K | Kalshi max-BTC-2026 rungs |
| L06_pm_iran_oct31_nov15 | ladder | PM_IRAN_OCT31 | PM_IRAN_NOV15 | PM | ceasefire through later date <= earlier date |
| L07_pm_iran_nov15_nov30 | ladder | PM_IRAN_NOV15 | PM_IRAN_NOV30 | PM | date ladder |
| L08_pm_iran_nov30_dec31 | ladder | PM_IRAN_NOV30 | PM_IRAN_DEC31 | PM | date ladder |
| L09_pm_iran_oct22_oct31 | ladder | PM_IRAN_OCT22 | PM_IRAN_OCT31 | PM | date ladder |
| L10_pm_wti_105_110 | ladder | PM_WTI_H105 | PM_WTI_H110 | PM | WTI HIGH hit ladder, October |
| LR1_iran_oct9_oct12_resolved | ladder | PM_IRAN_OCT9 | PM_IRAN_OCT12 | PM | RESOLVED control: ceasefire date ladder (both resolved YES), analysed until 1 day before the earlier rung resolves |
| LR2_iran_oct12_oct15_resolved | ladder | PM_IRAN_OCT12 | PM_IRAN_OCT15 | PM | RESOLVED control: ceasefire date ladder |
| P01_pm_vance_win_le_nom | parent/child | PM_VANCE_NOM | PM_VANCE_WIN | PM | win presidency => nominee (ignores independent runs) |
| P02_pm_newsom_win_le_nom | parent/child | PM_NEWSOM_NOM | PM_NEWSOM_WIN | PM | win presidency => nominee |
| P03_k_vance_win_le_nom | parent/child | K_VANCE_NOM | K_VANCE_WIN | K | Kalshi version |
| P04_k_newsom_win_le_nom | parent/child | K_NEWSOM_NOM | K_NEWSOM_WIN | K | Kalshi version |
| P05_pm_okc_champ_le_west | parent/child | PM_NBA_OKC_W | PM_NBA_OKC_CH | PM | NBA champion => conference champion (PM, thin West market) |
| P06_xv_pm_vance_win_le_k_nom | parent/child | K_VANCE_NOM | PM_VANCE_WIN | K+PM | cross-venue implication |
| P07_xv_k_vance_win_le_pm_nom | parent/child | PM_VANCE_NOM | K_VANCE_WIN | K+PM | cross-venue implication |
| I01_pm_senateD_identity | identity | PM_SEN_D | PM_BOP_DD+PM_BOP_DSRH | PM | P(D Senate) = P(D sweep) + P(D Senate, R House) |
| I02_k_senateD_identity | identity | K_SEN_D | K_BOP_DD+K_BOP_RD | K | Kalshi: D Senate = DD + 'R-House, D-Senate' |
| I03_k_fed_hike_identity | identity | K_FED_T400 | K_FED_H25+K_FED_H26 | K | 'rate > 4.00% after Oct' = hike 25 + hike >25 (assuming upper bound is 4.00% now) |
| F01_btc100k_vs_fed_hike25 | factor | PM_BTC_100K | PM_FED_H25 | PM | crypto level vs rates (both PM) |
| F02_btc100k_vs_eth3500 | factor | PM_BTC_100K | PM_ETH_3500 | PM | crypto vs crypto (both PM) |
| F03_iran_oct31_vs_wti110 | factor | PM_IRAN_OCT31 | PM_WTI_H110 | PM | geopolitics vs oil (both PM) |
| F04_senateD_vs_fed_hike25 | factor | PM_SEN_D | PM_FED_H25 | PM | politics vs rates (both PM) |
| F05_k_btc100k_vs_k_fed_hike25 | factor | K_BTC_100K | K_FED_H25 | K | crypto vs rates (both Kalshi) |
| F06_pm_btc100k_vs_k_fed_hike25 | factor | PM_BTC_100K | K_FED_H25 | K+PM | cross-venue factor pair |

## T2. Return correlation of mid-price changes (probability points), 95% block-bootstrap CI

| id | 5m rho [CI] (n) | share bins with x/y change | 10m non-overlap rho | 1h rho [CI] (n) | 1d rho [CI] (n) |
|---|---|---|---|---|---|
| X01_senate_D | -0.00 [-0.06, 0.06] (8639) | 0.003 / 0.009 | 0.02 | 0.10 [0.01, 0.19] (2015) | 0.54 [0.12, 0.76] (83) |
| X02_house_D | 0.01 [-0.01, 0.02] (8639) | 0.002 / 0.063 | 0.01 | -0.00 [-0.03, 0.02] (2015) | 0.29 [-0.05, 0.52] (83) |
| X03_fed_oct_hold | 0.77 [0.51, 0.86] (8639) | 0.038 / 0.063 | 0.81 | 0.84 [0.58, 0.92] (2015) | 0.97 [0.89, 0.98] (83) |
| X04_fed_oct_hike25 | 0.75 [0.51, 0.84] (8639) | 0.040 / 0.056 | 0.81 | 0.85 [0.62, 0.93] (2015) | 0.97 [0.90, 0.99] (83) |
| X05_bop_dem_sweep | 0.02 [-0.00, 0.05] (8639) | 0.006 / 0.018 | 0.02 | 0.09 [-0.01, 0.22] (2015) | 0.59 [0.37, 0.70] (83) |
| X06_tx_senate_D | 0.01 [-0.00, 0.02] (8639) | 0.017 / 0.021 | 0.03 | 0.04 [-0.01, 0.08] (2015) | 0.29 [0.09, 0.46] (83) |
| X07_vance_nominee | -0.00 [-0.00, 0.00] (8639) | 0.021 / 0.005 | -0.00 | -0.00 [-0.01, 0.00] (2015) | 0.06 [-0.41, 0.36] (83) |
| X08_newsom_nominee | 0.00 [-0.00, 0.00] (8639) | 0.042 / 0.001 | 0.00 | 0.01 [-0.00, 0.03] (2015) | 0.23 [-0.03, 0.49] (83) |
| X09_vance_winner | -0.00 [-0.00, 0.00] (8639) | 0.019 / 0.012 | -0.00 | 0.01 [-0.03, 0.06] (2015) | 0.30 [0.09, 0.45] (83) |
| X10_okc_west | 0.00 [-0.00, 0.00] (8639) | 0.000 / 0.009 | -0.00 | 0.00 [-0.00, 0.00] (2015) | 0.00 [-0.06, 0.04] (83) |
| X11_btc_100k_2026 | 0.14 [0.06, 0.22] (8639) | 0.099 / 0.038 | 0.15 | 0.31 [0.20, 0.41] (2015) | 0.82 [0.68, 0.90] (83) |
| XR1_fed_sep_hike25_resolved | n/a (n=0) | n/a | n/a | 0.78 [0.54, 0.88] (1247) | 0.96 [0.91, 0.98] (51) |
| XR2_fed_sep_hold_resolved | n/a (n=0) | n/a | n/a | 0.79 [0.55, 0.89] (1247) | 0.96 [0.94, 0.98] (51) |
| L01_pm_btc_100_110 | 0.11 [0.07, 0.16] (16415) | 0.084 / 0.043 | 0.15 | 0.33 [0.23, 0.41] (2015) | 0.84 [0.66, 0.93] (83) |
| L02_pm_btc_110_120 | 0.08 [0.04, 0.13] (16415) | 0.043 / 0.023 | 0.10 | 0.24 [0.18, 0.30] (2015) | 0.72 [0.43, 0.84] (83) |
| L03_pm_btc_90_100 | 0.16 [0.12, 0.20] (16415) | 0.154 / 0.084 | 0.24 | 0.47 [0.35, 0.56] (2015) | 0.90 [0.74, 0.96] (83) |
| L04_k_btc_100_110 | 0.04 [0.00, 0.07] (8639) | 0.038 / 0.033 | 0.07 | 0.21 [0.12, 0.29] (2015) | 0.65 [0.35, 0.79] (83) |
| L05_k_btc_110_120 | 0.08 [0.03, 0.14] (8639) | 0.033 / 0.017 | 0.10 | 0.15 [0.08, 0.21] (2015) | 0.45 [0.01, 0.73] (83) |
| L06_pm_iran_oct31_nov15 | 0.16 [0.06, 0.26] (4812) | 0.062 / 0.111 | 0.29 | 0.39 [0.22, 0.56] (399) | n/a (n=15) |
| L07_pm_iran_nov15_nov30 | 0.14 [0.08, 0.23] (4812) | 0.111 / 0.046 | 0.21 | 0.21 [0.10, 0.42] (399) | n/a (n=15) |
| L08_pm_iran_nov30_dec31 | 0.32 [0.21, 0.44] (8496) | 0.079 / 0.076 | 0.49 | 0.56 [0.30, 0.71] (706) | n/a (n=28) |
| L09_pm_iran_oct22_oct31 | 0.06 [-0.18, 0.24] (1135) | 0.091 / 0.048 | 0.07 | 0.37 [0.25, 0.53] (93) | n/a (n=3) |
| L10_pm_wti_105_110 | -0.01 [-0.17, 0.24] (6568) | 0.148 / 0.086 | -0.01 | 0.33 [0.25, 0.58] (546) | n/a (n=22) |
| LR1_iran_oct9_oct12_resolved | 0.17 [0.07, 0.33] (1193) | 0.084 / 0.070 | 0.29 | 0.40 [0.36, 0.70] (99) | n/a (n=4) |
| LR2_iran_oct12_oct15_resolved | 0.30 [0.12, 0.51] (2057) | 0.172 / 0.083 | 0.38 | 0.41 [0.18, 0.62] (171) | n/a (n=7) |
| P01_pm_vance_win_le_nom | 0.01 [0.00, 0.05] (16415) | 0.024 / 0.020 | 0.01 | 0.08 [0.01, 0.16] (2015) | 0.18 [-0.07, 0.43] (83) |
| P02_pm_newsom_win_le_nom | 0.02 [-0.00, 0.06] (16415) | 0.038 / 0.027 | 0.02 | 0.04 [-0.01, 0.10] (2015) | 0.15 [-0.12, 0.40] (83) |
| P03_k_vance_win_le_nom | 0.02 [-0.00, 0.07] (8639) | 0.005 / 0.012 | 0.02 | 0.02 [-0.00, 0.07] (2015) | 0.11 [-0.02, 0.28] (83) |
| P04_k_newsom_win_le_nom | 0.00 [-0.00, 0.00] (8639) | 0.001 / 0.077 | 0.00 | 0.00 [-0.01, 0.02] (2015) | 0.04 [-0.04, 0.16] (83) |
| P05_pm_okc_champ_le_west | -0.00 [-0.00, 0.00] (16415) | 0.000 / 0.000 | -0.00 | -0.00 [-0.00, 0.00] (2015) | -0.02 [-0.06, 0.03] (83) |
| P06_xv_pm_vance_win_le_k_nom | -0.01 [-0.04, 0.00] (8639) | 0.005 / 0.019 | -0.01 | -0.02 [-0.05, 0.01] (2015) | 0.09 [-0.06, 0.30] (83) |
| P07_xv_k_vance_win_le_pm_nom | -0.00 [-0.00, 0.00] (8639) | 0.021 / 0.012 | -0.01 | -0.02 [-0.06, 0.03] (2015) | 0.05 [-0.05, 0.15] (83) |
| I01_pm_senateD_identity | 0.02 [-0.02, 0.06] (16415) | 0.004 / 0.035 | 0.10 | 0.20 [0.06, 0.32] (2015) | 0.57 [0.30, 0.75] (83) |
| I02_k_senateD_identity | 0.05 [0.01, 0.11] (8639) | 0.009 / 0.048 | 0.05 | 0.22 [0.09, 0.34] (2015) | 0.70 [0.48, 0.83] (83) |
| I03_k_fed_hike_identity | 0.47 [0.20, 0.68] (8639) | 0.164 / 0.056 | 0.58 | 0.75 [0.43, 0.87] (761) | 0.96 [0.84, 0.99] (31) |
| F01_btc100k_vs_fed_hike25 | -0.04 [-0.10, 0.01] (16415) | 0.084 / 0.028 | -0.07 | -0.12 [-0.20, -0.01] (2015) | -0.14 [-0.35, -0.02] (83) |
| F02_btc100k_vs_eth3500 | 0.06 [0.02, 0.11] (16415) | 0.084 / 0.069 | 0.12 | 0.24 [0.13, 0.33] (2015) | 0.78 [0.67, 0.87] (83) |
| F03_iran_oct31_vs_wti110 | -0.01 [-0.04, 0.02] (6721) | 0.083 / 0.085 | -0.03 | -0.05 [-0.24, 0.10] (559) | n/a (n=22) |
| F04_senateD_vs_fed_hike25 | 0.01 [-0.00, 0.02] (16415) | 0.004 / 0.028 | 0.01 | 0.01 [-0.03, 0.05] (2015) | -0.02 [-0.14, 0.05] (83) |
| F05_k_btc100k_vs_k_fed_hike25 | -0.04 [-0.07, -0.00] (8639) | 0.038 / 0.056 | -0.04 | -0.04 [-0.09, 0.02] (2015) | -0.07 [-0.31, 0.10] (83) |
| F06_pm_btc100k_vs_k_fed_hike25 | -0.07 [-0.16, -0.00] (8639) | 0.099 / 0.056 | -0.10 | -0.11 [-0.20, -0.01] (2015) | -0.15 [-0.40, 0.01] (83) |

## T3. Lead-lag: sign-aware asymmetry LAM (>0: x leads y), PRIMARY alignment; sensitivity alignment in last column

LAM = sgn * sum_k=1..K [rho(+k) - rho(-k)]; 95% CI by 2-hour block bootstrap (1m, 5m) / 1-day (1h); p = circular-shift permutation test; * = BH-significant (q=0.10) across all tests in this table.

| id | grid | events x/y | rho0 | LAM [CI] | p_shift | BH | peak lag (bins; unit) | sens. alignment LAM [CI] |
|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 1m | 1/5 | insufficient events (<20) | | | | | |
| X01_senate_D | 5m | 30/77 | -0.00 | 0.000 [-0.06, 0.07] | 0.824 |  | +1 (5 min) | -0.02 [-0.11, 0.09] |
| X01_senate_D | 1h | 59/112 | 0.10 | 0.052 [-0.20, 0.25] | 0.460 |  | +0 (1 h) | 0.05 [-0.20, 0.25] |
| X02_house_D | 1m | 0/67 | insufficient events (<20) | | | | | |
| X02_house_D | 5m | 18/546 | insufficient events (<20) | | | | | |
| X02_house_D | 1h | 70/200 | -0.00 | -0.020 [-0.15, 0.10] | 0.743 |  | +4 (1 h) | -0.02 [-0.15, 0.10] |
| X03_fed_oct_hold | 1m | 238/309 | 0.60 | 0.130 [-0.52, 0.59] | 0.020 |  | +0 (1 min) | -0.59 [-1.00, -0.21] |
| X03_fed_oct_hold | 5m | 328/548 | 0.77 | -0.003 [-0.16, 0.19] | 0.912 |  | +0 (5 min) | -0.73 [-0.91, -0.40] |
| X03_fed_oct_hold | 1h | 187/358 | 0.84 | 0.003 [-0.12, 0.29] | 0.911 |  | +0 (1 h) | 0.00 [-0.12, 0.29] |
| X04_fed_oct_hike25 | 1m | 225/285 | 0.57 | 0.176 [-0.54, 0.77] | 0.024 |  | +0 (1 min) | -0.64 [-1.32, -0.17] |
| X04_fed_oct_hike25 | 5m | 349/485 | 0.75 | 0.005 [-0.11, 0.18] | 0.821 |  | +0 (5 min) | -0.77 [-0.91, -0.45] |
| X04_fed_oct_hike25 | 1h | 212/355 | 0.85 | 0.031 [-0.13, 0.45] | 0.385 |  | +0 (1 h) | 0.03 [-0.13, 0.45] |
| X05_bop_dem_sweep | 1m | 1/5 | insufficient events (<20) | | | | | |
| X05_bop_dem_sweep | 5m | 49/153 | 0.02 | 0.078 [0.01, 0.16] | 0.013 | * | +1 (5 min) | 0.02 [-0.03, 0.08] |
| X05_bop_dem_sweep | 1h | 77/87 | 0.09 | -0.123 [-0.30, 0.05] | 0.079 |  | -1 (1 h) | -0.12 [-0.30, 0.05] |
| X06_tx_senate_D | 1m | 14/13 | insufficient events (<20) | | | | | |
| X06_tx_senate_D | 5m | 143/183 | 0.01 | 0.010 [-0.09, 0.09] | 0.740 |  | +4 (5 min) | 0.01 [-0.09, 0.09] |
| X06_tx_senate_D | 1h | 152/204 | 0.04 | -0.059 [-0.22, 0.12] | 0.343 |  | +1 (1 h) | -0.06 [-0.22, 0.12] |
| X07_vance_nominee | 1m | 312/0 | insufficient events (<20) | | | | | |
| X07_vance_nominee | 5m | 183/42 | -0.00 | 0.016 [-0.00, 0.04] | 0.410 |  | +6 (5 min) | 0.02 [-0.00, 0.05] |
| X07_vance_nominee | 1h | 301/32 | -0.00 | 0.063 [-0.14, 0.27] | 0.255 |  | +5 (1 h) | 0.06 [-0.14, 0.27] |
| X08_newsom_nominee | 1m | 115/14 | insufficient events (<20) | | | | | |
| X08_newsom_nominee | 5m | 367/12 | insufficient events (<20) | | | | | |
| X08_newsom_nominee | 1h | 322/115 | 0.01 | 0.028 [-0.13, 0.17] | 0.565 |  | +6 (1 h) | 0.03 [-0.13, 0.17] |
| X09_vance_winner | 1m | 164/29 | -0.00 | 0.021 [-0.00, 0.12] | 0.212 |  | +5 (1 min) | 0.01 [-0.00, 0.08] |
| X09_vance_winner | 5m | 160/105 | -0.00 | 0.003 [-0.00, 0.01] | 0.650 |  | -4 (5 min) | 0.00 [-0.01, 0.01] |
| X09_vance_winner | 1h | 213/125 | 0.01 | 0.054 [-0.02, 0.16] | 0.255 |  | +5 (1 h) | 0.05 [-0.02, 0.16] |
| X10_okc_west | 1m | 0/71 | insufficient events (<20) | | | | | |
| X10_okc_west | 5m | 4/77 | insufficient events (<20) | | | | | |
| X10_okc_west | 1h | 2/38 | insufficient events (<20) | | | | | |
| X11_btc_100k_2026 | 1m | 280/82 | 0.00 | 0.030 [-0.03, 0.08] | 0.391 |  | -9 (1 min) | -0.01 [-0.06, 0.04] |
| X11_btc_100k_2026 | 5m | 852/326 | 0.14 | 0.167 [0.07, 0.26] | 0.001 | * | +0 (5 min) | -0.02 [-0.13, 0.09] |
| X11_btc_100k_2026 | 1h | 540/369 | 0.31 | 0.163 [0.02, 0.31] | 0.032 |  | +0 (1 h) | 0.16 [0.02, 0.31] |
| XR1_fed_sep_hike25_resolved | 1m | 0/0 | insufficient events (<20) | | | | | |
| XR1_fed_sep_hike25_resolved | 5m | 0/0 | insufficient events (<20) | | | | | |
| XR1_fed_sep_hike25_resolved | 1h | 272/334 | 0.78 | -0.009 [-0.08, 0.11] | 0.934 |  | +0 (1 h) | -0.01 [-0.08, 0.11] |
| XR2_fed_sep_hold_resolved | 1m | 0/0 | insufficient events (<20) | | | | | |
| XR2_fed_sep_hold_resolved | 5m | 0/0 | insufficient events (<20) | | | | | |
| XR2_fed_sep_hold_resolved | 1h | 288/346 | 0.79 | -0.063 [-0.13, 0.03] | 0.433 |  | +0 (1 h) | -0.06 [-0.13, 0.03] |
| L01_pm_btc_100_110 | 1m | 280/163 | 0.00 | -0.003 [-0.06, 0.05] | 0.892 |  | +1 (1 min) | - |
| L01_pm_btc_100_110 | 5m | 1372/700 | 0.11 | 0.037 [-0.02, 0.09] | 0.083 |  | +0 (5 min) | - |
| L01_pm_btc_100_110 | 1h | 540/301 | 0.33 | 0.184 [-0.00, 0.34] | 0.024 |  | +0 (1 h) | 0.18 [-0.00, 0.34] |
| L02_pm_btc_110_120 | 1m | 163/61 | -0.00 | -0.027 [-0.09, 0.00] | 0.242 |  | +4 (1 min) | - |
| L02_pm_btc_110_120 | 5m | 700/378 | 0.08 | 0.019 [-0.06, 0.10] | 0.362 |  | +0 (5 min) | - |
| L02_pm_btc_110_120 | 1h | 301/196 | 0.24 | -0.114 [-0.40, 0.17] | 0.104 |  | +0 (1 h) | -0.11 [-0.40, 0.17] |
| L03_pm_btc_90_100 | 1m | 972/280 | 0.11 | -0.010 [-0.07, 0.07] | 0.717 |  | +0 (1 min) | - |
| L03_pm_btc_90_100 | 5m | 2532/1372 | 0.16 | 0.071 [0.00, 0.14] | 0.003 | * | +0 (5 min) | - |
| L03_pm_btc_90_100 | 1h | 756/540 | 0.48 | 0.194 [0.03, 0.35] | 0.013 | * | +0 (1 h) | 0.19 [0.03, 0.35] |
| L04_k_btc_100_110 | 1m | 82/114 | 0.02 | 0.085 [-0.05, 0.27] | 0.060 |  | +10 (1 min) | - |
| L04_k_btc_100_110 | 5m | 326/284 | 0.04 | 0.145 [-0.02, 0.34] | 0.001 | * | +1 (5 min) | - |
| L04_k_btc_100_110 | 1h | 369/302 | 0.21 | 0.096 [-0.10, 0.29] | 0.229 |  | +0 (1 h) | 0.10 [-0.10, 0.29] |
| L05_k_btc_110_120 | 1m | 114/29 | -0.00 | -0.070 [-0.22, 0.05] | 0.109 |  | +4 (1 min) | - |
| L05_k_btc_110_120 | 5m | 284/151 | 0.08 | 0.022 [-0.04, 0.09] | 0.545 |  | +0 (5 min) | - |
| L05_k_btc_110_120 | 1h | 302/164 | 0.15 | 0.087 [-0.04, 0.22] | 0.325 |  | +0 (1 h) | 0.09 [-0.04, 0.22] |
| L06_pm_iran_oct31_nov15 | 1m | 128/173 | 0.04 | -0.035 [-0.09, 0.03] | 0.274 |  | +4 (1 min) | - |
| L06_pm_iran_oct31_nov15 | 5m | 299/533 | 0.16 | 0.090 [-0.04, 0.18] | 0.035 |  | +0 (5 min) | - |
| L06_pm_iran_oct31_nov15 | 1h | 107/166 | insufficient events (<20) | | | | | |
| L07_pm_iran_nov15_nov30 | 1m | 173/89 | 0.02 | -0.020 [-0.17, 0.08] | 0.576 |  | -1 (1 min) | - |
| L07_pm_iran_nov15_nov30 | 5m | 533/221 | 0.14 | -0.122 [-0.26, 0.02] | 0.007 | * | +0 (5 min) | - |
| L07_pm_iran_nov15_nov30 | 1h | 166/99 | insufficient events (<20) | | | | | |
| L08_pm_iran_nov30_dec31 | 1m | 89/120 | 0.08 | 0.117 [0.04, 0.21] | 0.014 | * | +0 (1 min) | - |
| L08_pm_iran_nov30_dec31 | 5m | 673/647 | 0.32 | 0.141 [-0.04, 0.36] | 0.005 | * | +0 (5 min) | - |
| L08_pm_iran_nov30_dec31 | 1h | 255/240 | 0.56 | 0.194 [0.03, 0.28] | 0.050 |  | +0 (1 h) | 0.19 [0.03, 0.28] |
| L09_pm_iran_oct22_oct31 | 1m | 177/83 | -0.01 | -0.159 [-0.32, 0.08] | 0.002 | * | -1 (1 min) | - |
| L09_pm_iran_oct22_oct31 | 5m | 103/55 | 0.06 | -0.143 [-0.31, 0.10] | 0.103 |  | -1 (5 min) | - |
| L09_pm_iran_oct22_oct31 | 1h | 50/23 | insufficient events (<20) | | | | | |
| L10_pm_wti_105_110 | 1m | 762/441 | 0.06 | 0.193 [0.04, 0.37] | 0.001 | * | +0 (1 min) | - |
| L10_pm_wti_105_110 | 5m | 975/565 | -0.01 | -0.029 [-0.17, 0.08] | 0.185 |  | -1 (5 min) | - |
| L10_pm_wti_105_110 | 1h | 299/212 | 0.33 | -0.001 [-0.16, 0.30] | 0.992 |  | +0 (1 h) | -0.00 [-0.16, 0.30] |
| LR1_iran_oct9_oct12_resolved | 1m | 0/0 | insufficient events (<20) | | | | | |
| LR1_iran_oct9_oct12_resolved | 5m | 100/83 | 0.17 | -0.076 [-0.30, 0.17] | 0.159 |  | +0 (5 min) | - |
| LR1_iran_oct9_oct12_resolved | 1h | 39/37 | insufficient events (<20) | | | | | |
| LR2_iran_oct12_oct15_resolved | 1m | 0/0 | insufficient events (<20) | | | | | |
| LR2_iran_oct12_oct15_resolved | 5m | 353/170 | 0.30 | -0.144 [-0.27, 0.02] | 0.035 |  | +0 (5 min) | - |
| LR2_iran_oct12_oct15_resolved | 1h | 92/67 | insufficient events (<20) | | | | | |
| P01_pm_vance_win_le_nom | 1m | 312/164 | -0.00 | -0.000 [-0.00, 0.01] | 0.990 |  | -1 (1 min) | - |
| P01_pm_vance_win_le_nom | 5m | 402/330 | 0.01 | 0.037 [-0.01, 0.12] | 0.076 |  | +2 (5 min) | - |
| P01_pm_vance_win_le_nom | 1h | 301/213 | 0.08 | 0.051 [-0.11, 0.25] | 0.405 |  | +0 (1 h) | 0.05 [-0.11, 0.25] |
| P02_pm_newsom_win_le_nom | 1m | 115/13 | insufficient events (<20) | | | | | |
| P02_pm_newsom_win_le_nom | 5m | 629/440 | 0.02 | 0.025 [-0.03, 0.08] | 0.261 |  | +0 (5 min) | - |
| P02_pm_newsom_win_le_nom | 1h | 322/290 | 0.04 | 0.071 [-0.19, 0.38] | 0.341 |  | +4 (1 h) | 0.07 [-0.19, 0.38] |
| P03_k_vance_win_le_nom | 1m | 0/29 | insufficient events (<20) | | | | | |
| P03_k_vance_win_le_nom | 5m | 42/105 | 0.02 | 0.000 [-0.00, 0.00] | 1.000 |  | +0 (5 min) | - |
| P03_k_vance_win_le_nom | 1h | 32/125 | 0.02 | 0.019 [-0.07, 0.11] | 0.664 |  | +2 (1 h) | 0.02 [-0.07, 0.11] |
| P04_k_newsom_win_le_nom | 1m | 14/155 | insufficient events (<20) | | | | | |
| P04_k_newsom_win_le_nom | 5m | 12/663 | insufficient events (<20) | | | | | |
| P04_k_newsom_win_le_nom | 1h | 115/438 | 0.00 | 0.005 [-0.04, 0.05] | 0.913 |  | +6 (1 h) | 0.01 [-0.04, 0.05] |
| P05_pm_okc_champ_le_west | 1m | 0/1 | insufficient events (<20) | | | | | |
| P05_pm_okc_champ_le_west | 5m | 4/4 | insufficient events (<20) | | | | | |
| P05_pm_okc_champ_le_west | 1h | 2/4 | insufficient events (<20) | | | | | |
| P06_xv_pm_vance_win_le_k_nom | 1m | 0/164 | insufficient events (<20) | | | | | |
| P06_xv_pm_vance_win_le_k_nom | 5m | 42/160 | -0.01 | -0.010 [-0.04, 0.04] | 0.206 |  | -5 (5 min) | 0.00 [-0.03, 0.11] |
| P06_xv_pm_vance_win_le_k_nom | 1h | 32/213 | -0.02 | 0.167 [-0.05, 0.48] | 0.015 | * | +1 (1 h) | 0.17 [-0.05, 0.48] |
| P07_xv_k_vance_win_le_pm_nom | 1m | 312/29 | 0.00 | -0.000 [-0.00, 0.00] | 1.000 |  | -10 (1 min) | -0.00 [-0.00, 0.00] |
| P07_xv_k_vance_win_le_pm_nom | 5m | 183/105 | -0.00 | -0.015 [-0.08, 0.02] | 0.492 |  | -1 (5 min) | -0.01 [-0.08, 0.02] |
| P07_xv_k_vance_win_le_pm_nom | 1h | 301/125 | -0.02 | -0.135 [-0.31, 0.02] | 0.023 |  | -2 (1 h) | -0.13 [-0.31, 0.02] |
| I01_pm_senateD_identity | 1m | 1/64 | insufficient events (<20) | | | | | |
| I01_pm_senateD_identity | 5m | 63/578 | 0.02 | -0.017 [-0.12, 0.09] | 0.358 |  | -1 (5 min) | - |
| I01_pm_senateD_identity | 1h | 59/376 | 0.20 | -0.018 [-0.30, 0.26] | 0.799 |  | +0 (1 h) | -0.02 [-0.30, 0.26] |
| I02_k_senateD_identity | 1m | 8/26 | insufficient events (<20) | | | | | |
| I02_k_senateD_identity | 5m | 77/418 | 0.05 | 0.037 [-0.02, 0.10] | 0.181 |  | +0 (5 min) | - |
| I02_k_senateD_identity | 1h | 112/351 | 0.22 | 0.089 [-0.12, 0.28] | 0.118 |  | +0 (1 h) | 0.09 [-0.12, 0.28] |
| I03_k_fed_hike_identity | 1m | 465/285 | 0.25 | -0.236 [-0.44, 0.08] | 0.006 | * | +0 (1 min) | - |
| I03_k_fed_hike_identity | 5m | 1419/487 | 0.47 | -0.048 [-0.25, 0.08] | 0.091 |  | +0 (5 min) | - |
| I03_k_fed_hike_identity | 1h | 344/184 | 0.76 | -0.138 [-0.33, 0.06] | 0.280 |  | +0 (1 h) | -0.14 [-0.33, 0.06] |
| F01_btc100k_vs_fed_hike25 | 1m | 280/225 | -0.02 | -0.090 [-0.22, 0.05] | 0.086 |  | -2 (1 min) | - |
| F01_btc100k_vs_fed_hike25 | 5m | 1372/461 | -0.04 | -0.024 [-0.09, 0.03] | 0.311 |  | +0 (5 min) | - |
| F01_btc100k_vs_fed_hike25 | 1h | 540/212 | -0.12 | -0.013 [-0.15, 0.18] | 0.842 |  | +0 (1 h) | -0.01 [-0.15, 0.18] |
| F02_btc100k_vs_eth3500 | 1m | 280/368 | 0.02 | -0.103 [-0.18, -0.01] | 0.003 | * | -9 (1 min) | - |
| F02_btc100k_vs_eth3500 | 5m | 1372/1133 | 0.06 | -0.021 [-0.10, 0.07] | 0.280 |  | +2 (5 min) | - |
| F02_btc100k_vs_eth3500 | 1h | 540/454 | 0.24 | 0.046 [-0.15, 0.23] | 0.506 |  | +0 (1 h) | 0.05 [-0.15, 0.23] |
| F03_iran_oct31_vs_wti110 | 1m | 128/441 | -0.02 | 0.008 [-0.09, 0.12] | 0.716 |  | +0 (1 min) | - |
| F03_iran_oct31_vs_wti110 | 5m | 559/569 | -0.01 | 0.089 [0.02, 0.18] | 0.009 | * | +6 (5 min) | - |
| F03_iran_oct31_vs_wti110 | 1h | 198/215 | -0.05 | -0.111 [-0.33, 0.21] | 0.374 |  | -1 (1 h) | -0.11 [-0.33, 0.21] |
| F04_senateD_vs_fed_hike25 | 1m | 1/225 | insufficient events (<20) | | | | | |
| F04_senateD_vs_fed_hike25 | 5m | 63/461 | 0.01 | -0.041 [-0.12, 0.01] | 0.105 |  | -1 (5 min) | - |
| F04_senateD_vs_fed_hike25 | 1h | 59/212 | 0.01 | 0.050 [-0.12, 0.22] | 0.392 |  | -4 (1 h) | 0.05 [-0.12, 0.22] |
| F05_k_btc100k_vs_k_fed_hike25 | 1m | 82/285 | -0.00 | -0.020 [-0.09, 0.04] | 0.513 |  | -1 (1 min) | - |
| F05_k_btc100k_vs_k_fed_hike25 | 5m | 326/485 | -0.04 | -0.025 [-0.13, 0.04] | 0.408 |  | +0 (5 min) | - |
| F05_k_btc100k_vs_k_fed_hike25 | 1h | 369/355 | -0.04 | -0.035 [-0.16, 0.12] | 0.601 |  | +0 (1 h) | -0.04 [-0.16, 0.12] |
| F06_pm_btc100k_vs_k_fed_hike25 | 1m | 280/285 | -0.01 | -0.024 [-0.12, 0.10] | 0.462 |  | -2 (1 min) | -0.07 [-0.15, 0.02] |
| F06_pm_btc100k_vs_k_fed_hike25 | 5m | 852/485 | -0.07 | -0.047 [-0.16, 0.03] | 0.158 |  | +0 (5 min) | -0.14 [-0.24, -0.03] |
| F06_pm_btc100k_vs_k_fed_hike25 | 1h | 540/355 | -0.11 | -0.014 [-0.17, 0.24] | 0.837 |  | +0 (1 h) | -0.01 [-0.17, 0.24] |

Tests in family: 90; raw p<0.05: 22; BH(q=0.10) significant: 14.

- BH-significant: L04_k_btc_100_110 5m_primary LAM=0.145 [-0.02, 0.34] p=0.001 (x=K_BTC_100K -> y=K_BTC_110K) x leads
- BH-significant: L10_pm_wti_105_110 1m_primary LAM=0.193 [0.04, 0.37] p=0.001 (x=PM_WTI_H105 -> y=PM_WTI_H110) x leads
- BH-significant: X11_btc_100k_2026 5m_primary LAM=0.167 [0.07, 0.26] p=0.001 (x=PM_BTC_100K -> y=K_BTC_100K) x leads
- BH-significant: L09_pm_iran_oct22_oct31 1m_primary LAM=-0.159 [-0.32, 0.08] p=0.002 (x=PM_IRAN_OCT22 -> y=PM_IRAN_OCT31) y leads
- BH-significant: F02_btc100k_vs_eth3500 1m_primary LAM=-0.103 [-0.18, -0.01] p=0.003 (x=PM_BTC_100K -> y=PM_ETH_3500) y leads
- BH-significant: L03_pm_btc_90_100 5m_primary LAM=0.071 [0.00, 0.14] p=0.003 (x=PM_BTC_90K -> y=PM_BTC_100K) x leads
- BH-significant: L08_pm_iran_nov30_dec31 5m_primary LAM=0.141 [-0.04, 0.36] p=0.005 (x=PM_IRAN_NOV30 -> y=PM_IRAN_DEC31) x leads
- BH-significant: I03_k_fed_hike_identity 1m_primary LAM=-0.236 [-0.44, 0.08] p=0.006 (x=K_FED_T400 -> y=K_FED_H25+K_FED_H26) y leads
- BH-significant: L07_pm_iran_nov15_nov30 5m_primary LAM=-0.122 [-0.26, 0.02] p=0.007 (x=PM_IRAN_NOV15 -> y=PM_IRAN_NOV30) y leads
- BH-significant: F03_iran_oct31_vs_wti110 5m_primary LAM=0.089 [0.02, 0.18] p=0.009 (x=PM_IRAN_OCT31 -> y=PM_WTI_H110) x leads
- BH-significant: L03_pm_btc_90_100 1h LAM=0.194 [0.03, 0.35] p=0.013 (x=PM_BTC_90K -> y=PM_BTC_100K) x leads
- BH-significant: X05_bop_dem_sweep 5m_primary LAM=0.078 [0.01, 0.16] p=0.013 (x=PM_BOP_DD -> y=K_BOP_DD) x leads
- BH-significant: L08_pm_iran_nov30_dec31 1m_primary LAM=0.117 [0.04, 0.21] p=0.014 (x=PM_IRAN_NOV30 -> y=PM_IRAN_DEC31) x leads
- BH-significant: P06_xv_pm_vance_win_le_k_nom 1h LAM=0.167 [-0.05, 0.48] p=0.015 (x=K_VANCE_NOM -> y=PM_VANCE_WIN) x leads

## T3b. Event-response lead-lag (sparse mid moves). S>0: x leads y. PRIMARY alignment.

| id | window | x events | x followed/preceded by y | y events | y followed/preceded by x | S | p_shift | BH |
|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 5m_W3 | 30 | 0.07 / 0.07 | 77 | 0.03 / 0.03 | 0.00 | 1.000 |  |
| X01_senate_D | 5m_W12 | 30 | 0.20 / 0.07 | 77 | 0.04 / 0.08 | 0.17 | 0.023 |  |
| X03_fed_oct_hold | 1m_W5 | 238 | 0.47 / 0.46 | 309 | 0.35 / 0.37 | 0.03 | 0.211 |  |
| X03_fed_oct_hold | 1m_W30 | 238 | 0.80 / 0.74 | 309 | 0.62 / 0.65 | 0.09 | 0.131 |  |
| X03_fed_oct_hold | 5m_W3 | 328 | 0.43 / 0.40 | 548 | 0.25 / 0.26 | 0.04 | 0.163 |  |
| X03_fed_oct_hold | 5m_W12 | 328 | 0.72 / 0.63 | 548 | 0.47 / 0.49 | 0.12 | 0.015 |  |
| X04_fed_oct_hike25 | 1m_W5 | 225 | 0.49 / 0.46 | 285 | 0.34 / 0.37 | 0.07 | 0.027 |  |
| X04_fed_oct_hike25 | 1m_W30 | 225 | 0.80 / 0.75 | 285 | 0.65 / 0.68 | 0.09 | 0.109 |  |
| X04_fed_oct_hike25 | 5m_W3 | 349 | 0.40 / 0.36 | 485 | 0.26 / 0.29 | 0.07 | 0.014 |  |
| X04_fed_oct_hike25 | 5m_W12 | 349 | 0.74 / 0.61 | 485 | 0.47 / 0.58 | 0.24 | 0.001 | * |
| X05_bop_dem_sweep | 5m_W3 | 49 | 0.08 / 0.04 | 153 | 0.01 / 0.03 | 0.05 | 0.202 |  |
| X05_bop_dem_sweep | 5m_W12 | 49 | 0.24 / 0.10 | 153 | 0.04 / 0.08 | 0.19 | 0.012 |  |
| X06_tx_senate_D | 5m_W3 | 143 | 0.03 / 0.02 | 183 | 0.02 / 0.03 | 0.02 | 0.488 |  |
| X06_tx_senate_D | 5m_W12 | 143 | 0.20 / 0.10 | 183 | 0.11 / 0.14 | 0.12 | 0.068 |  |
| X07_vance_nominee | 5m_W3 | 183 | 0.00 / 0.00 | 42 | 0.00 / 0.00 | 0.00 | 1.000 |  |
| X07_vance_nominee | 5m_W12 | 183 | 0.00 / 0.01 | 42 | 0.05 / 0.00 | -0.06 | 0.308 |  |
| X09_vance_winner | 1m_W5 | 164 | 0.01 / 0.00 | 29 | 0.00 / 0.07 | 0.08 | 0.163 |  |
| X09_vance_winner | 1m_W30 | 164 | 0.01 / 0.01 | 29 | 0.07 / 0.10 | 0.03 | 0.638 |  |
| X09_vance_winner | 5m_W3 | 160 | 0.01 / 0.01 | 105 | 0.01 / 0.02 | 0.02 | 0.664 |  |
| X09_vance_winner | 5m_W12 | 160 | 0.06 / 0.06 | 105 | 0.08 / 0.07 | -0.01 | 0.809 |  |
| X11_btc_100k_2026 | 1m_W5 | 280 | 0.04 / 0.03 | 82 | 0.09 / 0.11 | 0.04 | 0.424 |  |
| X11_btc_100k_2026 | 1m_W30 | 280 | 0.15 / 0.12 | 82 | 0.38 / 0.30 | -0.04 | 0.643 |  |
| X11_btc_100k_2026 | 5m_W3 | 852 | 0.12 / 0.09 | 326 | 0.23 / 0.30 | 0.10 | 0.004 |  |
| X11_btc_100k_2026 | 5m_W12 | 852 | 0.27 / 0.24 | 326 | 0.52 / 0.56 | 0.08 | 0.131 |  |
| L01_pm_btc_100_110 | 1m_W5 | 280 | 0.07 / 0.05 | 163 | 0.09 / 0.09 | 0.03 | 0.482 |  |
| L01_pm_btc_100_110 | 1m_W30 | 280 | 0.32 / 0.25 | 163 | 0.28 / 0.36 | 0.15 | 0.046 |  |
| L01_pm_btc_100_110 | 5m_W3 | 1372 | 0.12 / 0.12 | 700 | 0.21 / 0.21 | 0.00 | 0.975 |  |
| L01_pm_btc_100_110 | 5m_W12 | 1372 | 0.31 / 0.27 | 700 | 0.44 / 0.47 | 0.06 | 0.082 |  |
| L02_pm_btc_110_120 | 1m_W5 | 163 | 0.02 / 0.01 | 61 | 0.03 / 0.05 | 0.02 | 0.705 |  |
| L02_pm_btc_110_120 | 1m_W30 | 163 | 0.04 / 0.04 | 61 | 0.15 / 0.07 | -0.08 | 0.370 |  |
| L02_pm_btc_110_120 | 5m_W3 | 700 | 0.08 / 0.09 | 378 | 0.15 / 0.12 | -0.04 | 0.050 |  |
| L02_pm_btc_110_120 | 5m_W12 | 700 | 0.20 / 0.23 | 378 | 0.39 / 0.30 | -0.11 | 0.010 |  |
| L03_pm_btc_90_100 | 1m_W5 | 972 | 0.08 / 0.08 | 280 | 0.24 / 0.25 | 0.01 | 0.800 |  |
| L03_pm_btc_90_100 | 1m_W30 | 972 | 0.28 / 0.24 | 280 | 0.60 / 0.68 | 0.12 | 0.033 |  |
| L03_pm_btc_90_100 | 5m_W3 | 2532 | 0.17 / 0.15 | 1372 | 0.26 / 0.29 | 0.05 | 0.014 |  |
| L03_pm_btc_90_100 | 5m_W12 | 2532 | 0.40 / 0.36 | 1372 | 0.56 / 0.59 | 0.07 | 0.006 |  |
| L04_k_btc_100_110 | 1m_W5 | 82 | 0.09 / 0.01 | 114 | 0.02 / 0.08 | 0.13 | 0.005 |  |
| L04_k_btc_100_110 | 1m_W30 | 82 | 0.23 / 0.07 | 114 | 0.04 / 0.15 | 0.27 | 0.009 |  |
| L04_k_btc_100_110 | 5m_W3 | 326 | 0.11 / 0.08 | 284 | 0.09 / 0.12 | 0.05 | 0.110 |  |
| L04_k_btc_100_110 | 5m_W12 | 326 | 0.25 / 0.20 | 284 | 0.24 / 0.27 | 0.08 | 0.138 |  |
| L05_k_btc_110_120 | 1m_W5 | 114 | 0.03 / 0.04 | 29 | 0.10 / 0.10 | -0.01 | 0.520 |  |
| L05_k_btc_110_120 | 1m_W30 | 114 | 0.06 / 0.06 | 29 | 0.17 / 0.21 | 0.03 | 0.783 |  |
| L05_k_btc_110_120 | 5m_W3 | 284 | 0.05 / 0.06 | 151 | 0.11 / 0.09 | -0.03 | 0.388 |  |
| L05_k_btc_110_120 | 5m_W12 | 284 | 0.11 / 0.12 | 151 | 0.21 / 0.19 | -0.04 | 0.531 |  |
| L06_pm_iran_oct31_nov15 | 1m_W5 | 128 | 0.12 / 0.10 | 173 | 0.07 / 0.11 | 0.06 | 0.114 |  |
| L06_pm_iran_oct31_nov15 | 1m_W30 | 128 | 0.46 / 0.35 | 173 | 0.27 / 0.33 | 0.17 | 0.042 |  |
| L06_pm_iran_oct31_nov15 | 5m_W3 | 299 | 0.31 / 0.26 | 533 | 0.16 / 0.19 | 0.07 | 0.063 |  |
| L06_pm_iran_oct31_nov15 | 5m_W12 | 299 | 0.61 / 0.60 | 533 | 0.38 / 0.41 | 0.05 | 0.451 |  |
| L07_pm_iran_nov15_nov30 | 1m_W5 | 173 | 0.03 / 0.07 | 89 | 0.11 / 0.07 | -0.08 | 0.063 |  |
| L07_pm_iran_nov15_nov30 | 1m_W30 | 173 | 0.29 / 0.23 | 89 | 0.28 / 0.34 | 0.12 | 0.164 |  |
| L07_pm_iran_nov15_nov30 | 5m_W3 | 533 | 0.10 / 0.09 | 221 | 0.19 / 0.20 | 0.02 | 0.595 |  |
| L07_pm_iran_nov15_nov30 | 5m_W12 | 533 | 0.29 / 0.30 | 221 | 0.51 / 0.54 | 0.03 | 0.654 |  |
| L08_pm_iran_nov30_dec31 | 1m_W5 | 89 | 0.04 / 0.03 | 120 | 0.03 / 0.03 | 0.02 | 0.736 |  |
| L08_pm_iran_nov30_dec31 | 1m_W30 | 89 | 0.18 / 0.12 | 120 | 0.13 / 0.22 | 0.14 | 0.155 |  |
| L08_pm_iran_nov30_dec31 | 5m_W3 | 673 | 0.27 / 0.22 | 647 | 0.24 / 0.27 | 0.08 | 0.007 |  |
| L08_pm_iran_nov30_dec31 | 5m_W12 | 673 | 0.51 / 0.45 | 647 | 0.48 / 0.54 | 0.12 | 0.007 |  |
| L09_pm_iran_oct22_oct31 | 1m_W5 | 177 | 0.12 / 0.12 | 83 | 0.28 / 0.30 | 0.02 | 0.589 |  |
| L09_pm_iran_oct22_oct31 | 1m_W30 | 177 | 0.32 / 0.33 | 83 | 0.65 / 0.63 | -0.04 | 0.708 |  |
| L09_pm_iran_oct22_oct31 | 5m_W3 | 103 | 0.17 / 0.16 | 55 | 0.31 / 0.33 | 0.04 | 0.614 |  |
| L09_pm_iran_oct22_oct31 | 5m_W12 | 103 | 0.33 / 0.35 | 55 | 0.69 / 0.67 | -0.04 | 0.777 |  |
| L10_pm_wti_105_110 | 1m_W5 | 762 | 0.17 / 0.16 | 441 | 0.25 / 0.26 | 0.02 | 0.560 |  |
| L10_pm_wti_105_110 | 1m_W30 | 762 | 0.42 / 0.45 | 441 | 0.60 / 0.59 | -0.05 | 0.343 |  |
| L10_pm_wti_105_110 | 5m_W3 | 975 | 0.20 / 0.19 | 565 | 0.31 / 0.32 | 0.02 | 0.536 |  |
| L10_pm_wti_105_110 | 5m_W12 | 975 | 0.44 / 0.46 | 565 | 0.64 / 0.62 | -0.04 | 0.364 |  |
| LR1_iran_oct9_oct12_resolved | 5m_W3 | 100 | 0.11 / 0.12 | 83 | 0.13 / 0.14 | 0.00 | 0.971 |  |
| LR1_iran_oct9_oct12_resolved | 5m_W12 | 100 | 0.25 / 0.37 | 83 | 0.40 / 0.31 | -0.20 | 0.064 |  |
| LR2_iran_oct12_oct15_resolved | 5m_W3 | 353 | 0.20 / 0.21 | 170 | 0.33 / 0.32 | -0.01 | 0.819 |  |
| LR2_iran_oct12_oct15_resolved | 5m_W12 | 353 | 0.43 / 0.47 | 170 | 0.57 / 0.57 | -0.04 | 0.568 |  |
| P01_pm_vance_win_le_nom | 1m_W5 | 312 | 0.00 / 0.01 | 164 | 0.01 / 0.01 | -0.01 | 0.742 |  |
| P01_pm_vance_win_le_nom | 1m_W30 | 312 | 0.02 / 0.01 | 164 | 0.04 / 0.07 | 0.04 | 0.492 |  |
| P01_pm_vance_win_le_nom | 5m_W3 | 402 | 0.04 / 0.04 | 330 | 0.06 / 0.05 | -0.01 | 0.650 |  |
| P01_pm_vance_win_le_nom | 5m_W12 | 402 | 0.08 / 0.09 | 330 | 0.14 / 0.08 | -0.07 | 0.057 |  |
| P02_pm_newsom_win_le_nom | 5m_W3 | 629 | 0.06 / 0.07 | 440 | 0.08 / 0.08 | -0.01 | 0.478 |  |
| P02_pm_newsom_win_le_nom | 5m_W12 | 629 | 0.16 / 0.15 | 440 | 0.18 / 0.18 | 0.01 | 0.780 |  |
| P03_k_vance_win_le_nom | 5m_W3 | 42 | 0.00 / 0.00 | 105 | 0.00 / 0.00 | 0.00 | 1.000 |  |
| P03_k_vance_win_le_nom | 5m_W12 | 42 | 0.00 / 0.00 | 105 | 0.00 / 0.00 | 0.00 | 1.000 |  |
| P06_xv_pm_vance_win_le_k_nom | 5m_W3 | 42 | 0.07 / 0.05 | 160 | 0.02 / 0.01 | 0.02 | 0.572 |  |
| P06_xv_pm_vance_win_le_k_nom | 5m_W12 | 42 | 0.19 / 0.07 | 160 | 0.03 / 0.07 | 0.16 | 0.018 |  |
| P07_xv_k_vance_win_le_pm_nom | 1m_W5 | 312 | 0.00 / 0.00 | 29 | 0.00 / 0.00 | 0.00 | 1.000 |  |
| P07_xv_k_vance_win_le_pm_nom | 1m_W30 | 312 | 0.00 / 0.01 | 29 | 0.07 / 0.00 | -0.08 | 0.458 |  |
| P07_xv_k_vance_win_le_pm_nom | 5m_W3 | 183 | 0.00 / 0.01 | 105 | 0.02 / 0.00 | -0.03 | 0.337 |  |
| P07_xv_k_vance_win_le_pm_nom | 5m_W12 | 183 | 0.02 / 0.02 | 105 | 0.04 / 0.04 | 0.00 | 1.000 |  |
| I01_pm_senateD_identity | 5m_W3 | 63 | 0.13 / 0.17 | 578 | 0.02 / 0.02 | -0.05 | 0.213 |  |
| I01_pm_senateD_identity | 5m_W12 | 63 | 0.38 / 0.32 | 578 | 0.04 / 0.06 | 0.08 | 0.204 |  |
| I02_k_senateD_identity | 5m_W3 | 77 | 0.10 / 0.05 | 418 | 0.01 / 0.02 | 0.06 | 0.123 |  |
| I02_k_senateD_identity | 5m_W12 | 77 | 0.27 / 0.26 | 418 | 0.06 / 0.06 | 0.02 | 0.814 |  |
| I03_k_fed_hike_identity | 1m_W5 | 465 | 0.20 / 0.18 | 285 | 0.34 / 0.35 | 0.02 | 0.406 |  |
| I03_k_fed_hike_identity | 1m_W30 | 465 | 0.46 / 0.44 | 285 | 0.70 / 0.74 | 0.06 | 0.219 |  |
| I03_k_fed_hike_identity | 5m_W3 | 1419 | 0.14 / 0.14 | 487 | 0.37 / 0.39 | 0.02 | 0.387 |  |
| I03_k_fed_hike_identity | 5m_W12 | 1419 | 0.29 / 0.29 | 487 | 0.69 / 0.70 | 0.01 | 0.803 |  |
| F01_btc100k_vs_fed_hike25 | 1m_W5 | 280 | 0.05 / 0.07 | 225 | 0.08 / 0.08 | -0.02 | 0.573 |  |
| F01_btc100k_vs_fed_hike25 | 1m_W30 | 280 | 0.23 / 0.25 | 225 | 0.30 / 0.32 | 0.00 | 0.993 |  |
| F01_btc100k_vs_fed_hike25 | 5m_W3 | 1372 | 0.05 / 0.07 | 461 | 0.21 / 0.17 | -0.05 | 0.032 |  |
| F01_btc100k_vs_fed_hike25 | 5m_W12 | 1372 | 0.14 / 0.16 | 461 | 0.43 / 0.41 | -0.04 | 0.280 |  |
| F02_btc100k_vs_eth3500 | 1m_W5 | 280 | 0.15 / 0.17 | 368 | 0.11 / 0.11 | -0.02 | 0.554 |  |
| F02_btc100k_vs_eth3500 | 1m_W30 | 280 | 0.47 / 0.45 | 368 | 0.33 / 0.38 | 0.07 | 0.317 |  |
| F02_btc100k_vs_eth3500 | 5m_W3 | 1372 | 0.15 / 0.16 | 1133 | 0.19 / 0.18 | -0.02 | 0.227 |  |
| F02_btc100k_vs_eth3500 | 5m_W12 | 1372 | 0.36 / 0.36 | 1133 | 0.41 / 0.41 | 0.00 | 0.956 |  |
| F03_iran_oct31_vs_wti110 | 1m_W5 | 128 | 0.15 / 0.20 | 441 | 0.05 / 0.04 | -0.06 | 0.161 |  |
| F03_iran_oct31_vs_wti110 | 1m_W30 | 128 | 0.39 / 0.48 | 441 | 0.19 / 0.19 | -0.10 | 0.248 |  |
| F03_iran_oct31_vs_wti110 | 5m_W3 | 559 | 0.11 / 0.14 | 569 | 0.13 / 0.11 | -0.04 | 0.181 |  |
| F03_iran_oct31_vs_wti110 | 5m_W12 | 559 | 0.36 / 0.36 | 569 | 0.34 / 0.34 | 0.00 | 0.967 |  |
| F04_senateD_vs_fed_hike25 | 5m_W3 | 63 | 0.05 / 0.08 | 461 | 0.01 / 0.01 | -0.03 | 0.348 |  |
| F04_senateD_vs_fed_hike25 | 5m_W12 | 63 | 0.16 / 0.17 | 461 | 0.04 / 0.03 | -0.02 | 0.598 |  |
| F05_k_btc100k_vs_k_fed_hike25 | 1m_W5 | 82 | 0.15 / 0.07 | 285 | 0.02 / 0.03 | 0.08 | 0.049 |  |
| F05_k_btc100k_vs_k_fed_hike25 | 1m_W30 | 82 | 0.28 / 0.28 | 285 | 0.10 / 0.09 | -0.01 | 0.934 |  |
| F05_k_btc100k_vs_k_fed_hike25 | 5m_W3 | 326 | 0.09 / 0.06 | 485 | 0.04 / 0.07 | 0.05 | 0.057 |  |
| F05_k_btc100k_vs_k_fed_hike25 | 5m_W12 | 326 | 0.25 / 0.25 | 485 | 0.19 / 0.21 | 0.02 | 0.594 |  |
| F06_pm_btc100k_vs_k_fed_hike25 | 1m_W5 | 280 | 0.06 / 0.10 | 285 | 0.09 / 0.07 | -0.06 | 0.093 |  |
| F06_pm_btc100k_vs_k_fed_hike25 | 1m_W30 | 280 | 0.27 / 0.30 | 285 | 0.33 / 0.29 | -0.07 | 0.252 |  |
| F06_pm_btc100k_vs_k_fed_hike25 | 5m_W3 | 852 | 0.09 / 0.11 | 485 | 0.20 / 0.15 | -0.08 | 0.015 |  |
| F06_pm_btc100k_vs_k_fed_hike25 | 5m_W12 | 852 | 0.25 / 0.26 | 485 | 0.44 / 0.44 | -0.01 | 0.895 |  |

Event tests in family: 112; raw p<0.05: 22; BH significant: 1.


## T4. Same-event pairs: spread = Polymarket mid - Kalshi mid (probability points)

| id | hourly n | mean (c) | sd (c) | 5-95% (c) | AR(1) phi hourly [95% CI] | half-life 1h-grid (h) | phi 5m (30d) | half-life 5m-grid (h) | DF t (1h) | frac hours gap>entry fees | gap>2x fees | gap>all round-trip costs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 2016 | +1.81 | 1.91 | -2.0..5.0 | 0.987 [0.981, 0.994] | 54.7 | 0.994 | 9.0 | -3.6 | 0.37 | 0.00 | 0.00 |
| X02_house_D | 2016 | +2.05 | 1.25 | 0.4..4.0 | 0.985 [0.977, 0.993] | 45.8 | 0.994 | 9.5 | -3.9 | 0.80 | 0.36 | 0.04 |
| X03_fed_oct_hold | 2016 | -0.12 | 1.30 | -2.0..2.0 | 0.890 [0.870, 0.910] | 6.0 | 0.961 | 1.4 | -10.8 | 0.06 | 0.00 | 0.00 |
| X04_fed_oct_hike25 | 2016 | +0.14 | 1.54 | -2.0..2.5 | 0.922 [0.905, 0.939] | 8.5 | 0.961 | 1.5 | -9.1 | 0.12 | 0.01 | 0.00 |
| X05_bop_dem_sweep | 2016 | +1.73 | 1.44 | -1.0..4.0 | 0.976 [0.967, 0.985] | 28.6 | 0.993 | 7.9 | -5.0 | 0.27 | 0.01 | 0.00 |
| X06_tx_senate_D | 2016 | +0.86 | 1.58 | -2.0..3.0 | 0.964 [0.953, 0.976] | 19.1 | 0.994 | 9.5 | -6.0 | 0.20 | 0.00 | 0.00 |
| X07_vance_nominee | 2016 | +4.98 | 1.39 | 2.5..6.8 | 0.990 [0.984, 0.996] | 68.5 | 0.994 | 10.0 | -3.2 | 0.92 | 0.49 | 0.00 |
| X08_newsom_nominee | 2016 | +1.45 | 1.16 | -0.4..3.2 | 0.970 [0.960, 0.981] | 23.1 | 0.999 | 50.7 | -5.5 | 0.52 | 0.07 | 0.02 |
| X09_vance_winner | 2016 | +1.92 | 1.61 | -1.5..4.5 | 0.987 [0.980, 0.994] | 54.5 | 0.993 | 8.1 | -3.5 | 0.55 | 0.13 | 0.02 |
| X10_okc_west | 2016 | +0.11 | 1.06 | -2.0..1.0 | 0.993 [0.988, 0.998] | 103.1 | 0.998 | 27.3 | -2.6 | 0.01 | 0.00 | 0.00 |
| X11_btc_100k_2026 | 2016 | -2.51 | 2.11 | -6.0..1.0 | 0.925 [0.908, 0.942] | 8.9 | 0.987 | 4.6 | -8.9 | 0.51 | 0.29 | 0.12 |
| XR1_fed_sep_hike25_resolved | 1248 | -0.34 | 1.57 | -3.0..2.5 | 0.856 [0.827, 0.884] | 4.5 | n/a | n/a | -10.0 | 0.11 | 0.00 | 0.00 |
| XR2_fed_sep_hold_resolved | 1248 | +0.09 | 1.57 | -3.0..2.0 | 0.857 [0.828, 0.885] | 4.5 | n/a | n/a | -9.9 | 0.11 | 0.00 | 0.00 |

## T5. Edge attrition (hourly, dollar-weighted): share of the apparent mid gap that survives each friction

| id | mean gap (c) | median days to resolution | after spread | after taker fees | after 5% ann. hurdle | after 20% ann. hurdle | close-out trade | hours net>0 | hours net ann>5% | best net ann. |
|---|---|---|---|---|---|---|---|---|---|---|
| X01_senate_D | 2.25 | 58 | 59.2% | 5.3% | 3.3% | 0.0% | 0.0% | 23.4% | 6.1% | 18.1% |
| X02_house_D | 2.05 | 58 | 59.4% | 20.7% | 15.4% | 0.0% | 0.7% | 37.7% | 17.6% | 19.6% |
| X03_fed_oct_hold | 0.98 | 51 | 27.6% | 0.3% | 0.1% | 0.0% | 0.0% | 0.4% | 0.1% | 21.3% |
| X04_fed_oct_hike25 | 1.10 | 51 | 28.8% | 0.5% | 0.1% | 0.0% | 0.0% | 0.9% | 0.1% | 7.0% |
| X05_bop_dem_sweep | 1.84 | 58 | 52.9% | 3.9% | 2.7% | 0.0% | 0.0% | 11.5% | 3.2% | 19.6% |
| X06_tx_senate_D | 1.42 | 58 | 44.7% | 0.7% | 0.0% | 0.0% | 0.0% | 3.4% | 0.1% | 8.3% |
| X07_vance_nominee | 4.98 | 724 | 77.9% | 26.9% | 0.0% | 0.0% | 0.1% | 80.4% | 0.0% | 2.5% |
| X08_newsom_nominee | 1.52 | 724 | 68.1% | 16.4% | 0.0% | 0.0% | 0.8% | 39.3% | 0.0% | 2.2% |
| X09_vance_winner | 2.15 | 793 | 74.8% | 20.6% | 0.0% | 0.0% | 0.2% | 41.9% | 0.0% | 1.2% |
| X10_okc_west | 0.92 | 267 | 11.3% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | n/a |
| X11_btc_100k_2026 | 2.75 | 115 | 65.7% | 24.3% | 16.9% | 0.0% | 2.6% | 38.5% | 17.4% | 15.4% |
| XR1_fed_sep_hike25_resolved | 1.25 | 26 | 64.4% | 1.2% | 0.7% | 0.1% | 0.0% | 2.8% | 1.2% | 54.9% |
| XR2_fed_sep_hold_resolved | 1.22 | 26 | 22.8% | 0.2% | 0.1% | 0.0% | 0.0% | 0.4% | 0.2% | 18.1% |
| **mean over pairs** | | | 50.6% | 9.3% | 3.0% | 0.0% | 0.3% | | | |
| **median over pairs** | | | 59.2% | 3.9% | 0.1% | 0.0% | 0.0% | | | |

(Assumptions: Polymarket half-spread fixed at the T0 snapshot value; Kalshi bid/ask from candle closes; taker fees PM feeSchedule rate*p(1-p), Kalshi 0.07*p(1-p) [secondary source]; hold to resolution; capital = cost of both legs.)


## T5b. Mean-reversion (pairs) back-test on the hourly spread, trailing-168h z-score, entry |z|>2, exit |z|<0.5 or 48h

| id | trades | mean gross (c) | hit rate gross | mean hold (h) | assumed round-trip cost (c) | mean net (c) | share trades gross>cost |
|---|---|---|---|---|---|---|---|
| X01_senate_D | 17 | +1.29 | 0.76 | 28.9 | 7.36 | -6.06 | 0.00 |
| X02_house_D | 14 | +0.78 | 0.71 | 28.9 | 4.10 | -3.32 | 0.00 |
| X03_fed_oct_hold | 25 | +1.88 | 0.80 | 17.1 | 7.41 | -5.53 | 0.00 |
| X04_fed_oct_hike25 | 25 | +1.68 | 0.80 | 20.1 | 6.95 | -5.27 | 0.00 |
| X05_bop_dem_sweep | 13 | +0.77 | 0.62 | 39.5 | 7.38 | -6.61 | 0.00 |
| X06_tx_senate_D | 13 | +1.19 | 0.77 | 35.6 | 7.41 | -6.22 | 0.00 |
| X07_vance_nominee | 12 | +0.21 | 0.67 | 41.8 | 7.63 | -7.42 | 0.00 |
| X08_newsom_nominee | 18 | +0.66 | 0.72 | 35.2 | 3.93 | -3.27 | 0.00 |
| X09_vance_winner | 15 | +0.68 | 0.87 | 40.5 | 4.77 | -4.09 | 0.00 |
| X10_okc_west | 7 | -0.29 | 0.29 | 48.0 | 6.69 | -6.98 | 0.00 |
| X11_btc_100k_2026 | 33 | +3.06 | 1.00 | 12.5 | 6.86 | -3.79 | 0.03 |
| XR1_fed_sep_hike25_resolved | 20 | +2.25 | 0.95 | 12.8 | 6.55 | -4.30 | 0.00 |
| XR2_fed_sep_hold_resolved | 24 | +2.60 | 1.00 | 12.5 | 8.48 | -5.88 | 0.00 |

## T6. Logical constraints on MID prices (NOT executable). violation = child - parent > 0 (ladder/implication) or |sum(children) - parent| (identity)

| id | grid | n | mean child-parent (c) | frac >0.5c | >1c | >2c | >3c | runs >1c (count, median h, max h) | frac time >1c | frac > spreads+fees | snapshot exec edge (c) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| L01_pm_btc_100_110 | 1h | 2016 | -10.14 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -13.0 |
| L01_pm_btc_100_110 | 5m_pm | 16416 | -13.43 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L02_pm_btc_110_120 | 1h | 2016 | -4.33 | 0.001 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -5.0 |
| L02_pm_btc_110_120 | 5m_pm | 16416 | -5.67 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L03_pm_btc_90_100 | 1h | 2016 | -22.55 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -32.0 |
| L03_pm_btc_90_100 | 5m_pm | 16416 | -29.47 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L04_k_btc_100_110 | 1h | 2016 | -10.64 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -18.0 |
| L04_k_btc_100_110 | 5m_k | 8640 | -17.02 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L05_k_btc_110_120 | 1h | 2016 | -4.60 | 0.003 | 0.003 | 0.001 | 0.001 | 2,3.0,3 | 0.003 | 0.001 | -4.0 |
| L05_k_btc_110_120 | 5m_k | 8640 | -6.98 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L06_pm_iran_oct31_nov15 | 1h | 400 | -19.31 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -26.0 |
| L06_pm_iran_oct31_nov15 | 5m_pm | 4813 | -19.30 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L07_pm_iran_nov15_nov30 | 1h | 400 | -13.93 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -16.0 |
| L07_pm_iran_nov15_nov30 | 5m_pm | 4813 | -13.93 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L08_pm_iran_nov30_dec31 | 1h | 707 | -7.09 | 0.001 | 0.001 | 0.000 | 0.000 | 1,1.0,1 | 0.001 | 0.001 | -12.0 |
| L08_pm_iran_nov30_dec31 | 5m_pm | 8497 | -7.09 | 0.002 | 0.002 | 0.001 | 0.001 | 2,1.1,1 | 0.002 |  |  |
| L09_pm_iran_oct22_oct31 | 1h | 94 | -10.16 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -14.0 |
| L09_pm_iran_oct22_oct31 | 5m_pm | 1136 | -10.12 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| L10_pm_wti_105_110 | 1h | 547 | -13.36 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -25.0 |
| L10_pm_wti_105_110 | 5m_pm | 6569 | -13.31 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| LR1_iran_oct9_oct12_resolved | 1h | 100 | -4.06 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -0.1 |
| LR1_iran_oct9_oct12_resolved | 5m_pm | 1194 | -4.06 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| LR2_iran_oct12_oct15_resolved | 1h | 172 | -3.53 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -0.1 |
| LR2_iran_oct12_oct15_resolved | 5m_pm | 2058 | -3.51 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P01_pm_vance_win_le_nom | 1h | 2016 | -26.37 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -27.4 |
| P01_pm_vance_win_le_nom | 5m_pm | 16416 | -27.60 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P02_pm_newsom_win_le_nom | 1h | 2016 | -7.13 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -7.1 |
| P02_pm_newsom_win_le_nom | 5m_pm | 16416 | -6.96 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P03_k_vance_win_le_nom | 1h | 2016 | -23.31 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -23.0 |
| P03_k_vance_win_le_nom | 5m_k | 8640 | -23.64 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P04_k_newsom_win_le_nom | 1h | 2016 | -5.20 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -4.0 |
| P04_k_newsom_win_le_nom | 5m_k | 8640 | -4.67 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P05_pm_okc_champ_le_west | 1h | 2016 | -13.53 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -15.0 |
| P05_pm_okc_champ_le_west | 5m_pm | 16416 | -13.78 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P06_xv_pm_vance_win_le_k_nom | 1h | 2016 | -21.39 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -22.6 |
| P06_xv_pm_vance_win_le_k_nom | 5m_k | 8640 | -23.23 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| P07_xv_k_vance_win_le_pm_nom | 1h | 2016 | -28.29 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 | 0.000 | -27.8 |
| P07_xv_k_vance_win_le_pm_nom | 5m_k | 8640 | -29.58 | 0.000 | 0.000 | 0.000 | 0.000 | 0,0.0,0 | 0.000 |  |  |
| I01_pm_senateD_identity | 1h | 2016 | +0.12 | 0.795 | 0.597 | 0.152 | 0.031 | 37,12.0,384 | 0.597 | 0.032 | 0.0 |
| I01_pm_senateD_identity | 5m_pm | 16416 | +0.08 | 0.709 | 0.423 | 0.050 | 0.008 | 43,7.1,80 | 0.423 |  |  |
| I02_k_senateD_identity | 1h | 2016 | +0.30 | 0.628 | 0.265 | 0.042 | 0.000 | 39,3.0,147 | 0.265 | 0.000 | -0.8 |
| I02_k_senateD_identity | 5m_k | 8640 | +0.49 | 0.549 | 0.170 | 0.017 | 0.000 | 43,0.4,21 | 0.170 |  |  |
| I03_k_fed_hike_identity | 1h | 762 | -0.04 | 0.898 | 0.591 | 0.293 | 0.127 | 56,4.0,67 | 0.591 | 0.112 | 0.0 |
| I03_k_fed_hike_identity | 5m_k | 8640 | -0.17 | 0.906 | 0.596 | 0.297 | 0.120 | 206,0.5,39 | 0.596 |  |  |

## T7. Hedge ratio: regress y on x (first differences). beta in-sample; variance reduction out-of-sample (beta fitted on first 60%, evaluated on last 40%)

| id | 5m beta / OOS VR | 1h beta (train, test) / OOS VR | 1d beta (train, test) / OOS VR |
|---|---|---|---|
| X01_senate_D | -0.00 / -0.3% | 0.13 (0.09, 0.16) / 1.4% | 0.51 (0.46, 0.52) / 31.7% |
| X02_house_D | 0.01 / -0.0% | -0.00 (0.00, -0.00) / 0.0% | 0.21 (-0.05, 0.56) / -6.2% |
| X03_fed_oct_hold | 0.83 / 68.4% | 0.84 (0.02, 0.87) / 4.0% | 1.03 (0.99, 1.03) / 96.5% |
| X04_fed_oct_hike25 | 0.82 / 63.9% | 0.88 (0.25, 0.90) / 38.0% | 1.02 (0.98, 1.02) / 97.1% |
| X05_bop_dem_sweep | 0.02 / -0.0% | 0.10 (0.12, 0.08) / 0.3% | 0.63 (0.45, 0.74) / 36.1% |
| X06_tx_senate_D | 0.01 / -0.0% | 0.04 (0.01, 0.05) / 0.1% | 0.32 (0.27, 0.33) / 12.7% |
| X07_vance_nominee | -0.00 / -0.0% | -0.00 (-0.00, -0.02) / 0.0% | 0.03 (0.01, -0.06) / -0.1% |
| X08_newsom_nominee | 0.00 / 0.0% | 0.01 (0.06, 0.00) / -4.3% | 0.11 (0.25, 0.09) / -97.0% |
| X09_vance_winner | -0.00 / 0.0% | 0.01 (0.04, -0.01) / -0.1% | 0.25 (0.26, 0.21) / 8.2% |
| X10_okc_west | 0.00 / 0.0% | 0.00 (0.00, 0.00) / 0.0% | 0.00 (0.00, -0.03) / 0.0% |
| X11_btc_100k_2026 | 0.11 / -4.0% | 0.33 (0.41, 0.28) / 6.5% | 0.79 (0.89, 0.72) / 64.0% |
| XR1_fed_sep_hike25_resolved | n/a | 0.78 (0.61, 0.87) / 71.1% | n/a |
| XR2_fed_sep_hold_resolved | n/a | 0.78 (0.58, 0.87) / 68.7% | n/a |
| L01_pm_btc_100_110 | 0.07 / 0.0% | 0.19 (0.20, 0.19) / 12.3% | 0.51 (0.54, 0.49) / 72.9% |
| L02_pm_btc_110_120 | 0.06 / -1.7% | 0.16 (0.23, 0.09) / -3.0% | 0.51 (0.54, 0.47) / 54.2% |
| L03_pm_btc_90_100 | 0.11 / 3.4% | 0.29 (0.27, 0.31) / 24.6% | 0.52 (0.53, 0.52) / 75.3% |
| L04_k_btc_100_110 | 0.03 / 0.1% | 0.16 (0.10, 0.21) / 6.1% | 0.51 (0.49, 0.53) / 43.8% |
| L05_k_btc_110_120 | 0.05 / -1.8% | 0.09 (0.09, 0.09) / 2.6% | 0.29 (0.14, 0.43) / 21.4% |
| L06_pm_iran_oct31_nov15 | 0.17 / -0.6% | 0.49 (0.49, 0.48) / 5.5% | n/a |
| L07_pm_iran_nov15_nov30 | 0.08 / -2.7% | 0.10 (0.15, 0.04) / -4.7% | n/a |
| L08_pm_iran_nov30_dec31 | 0.36 / 8.3% | 0.60 (0.62, 0.40) / 8.2% | n/a |
| L09_pm_iran_oct22_oct31 | 0.05 / 0.4% | 0.25 (0.22, 0.35) / 14.4% | n/a |
| L10_pm_wti_105_110 | -0.00 / -1.3% | 0.17 (0.13, 0.33) / 23.2% | n/a |
| LR1_iran_oct9_oct12_resolved | 0.27 / 0.7% | 0.60 (0.61, 0.56) / 4.5% | n/a |
| LR2_iran_oct12_oct15_resolved | 0.49 / 10.2% | 0.54 (0.17, 0.84) / 12.4% | n/a |
| P01_pm_vance_win_le_nom | 0.03 / -0.0% | 0.08 (0.08, -0.01) / -0.1% | 0.16 (0.15, 0.09) / 0.2% |
| P02_pm_newsom_win_le_nom | 0.01 / -0.3% | 0.02 (0.13, 0.00) / -14.6% | 0.06 (0.01, 0.06) / 1.3% |
| P03_k_vance_win_le_nom | 0.03 / -0.6% | 0.03 (-0.00, 0.04) / -0.0% | 0.15 (0.05, 0.17) / 1.3% |
| P04_k_newsom_win_le_nom | 0.00 / 0.0% | 0.00 (0.00, -0.00) / -0.0% | 0.05 (0.03, -0.01) / -0.0% |
| P05_pm_okc_champ_le_west | -0.00 / 0.0% | -0.00 (0.00, -0.00) / 0.0% | -0.05 (0.00, -0.12) / 0.0% |
| P06_xv_pm_vance_win_le_k_nom | -0.01 / 0.0% | -0.02 (-0.01, -0.03) / 0.0% | 0.15 (0.23, -0.11) / -4.2% |
| P07_xv_k_vance_win_le_pm_nom | -0.00 / -0.0% | -0.03 (-0.03, -0.02) / 0.0% | 0.04 (0.02, -0.02) / -0.1% |
| I01_pm_senateD_identity | 0.03 / -0.1% | 0.24 (0.11, 0.34) / 4.7% | 0.57 (0.26, 0.71) / 34.2% |
| I02_k_senateD_identity | 0.06 / 0.4% | 0.21 (0.24, 0.18) / 2.6% | 0.78 (0.58, 0.87) / 54.0% |
| I03_k_fed_hike_identity | 0.36 / 26.5% | 0.68 (0.60, 0.79) / 61.9% | n/a |
| F01_btc100k_vs_fed_hike25 | -0.06 / 0.0% | -0.19 (-0.04, -0.30) / 0.5% | -0.16 (-0.07, -0.24) / 1.2% |
| F02_btc100k_vs_eth3500 | 0.06 / 0.6% | 0.20 (0.21, 0.20) / 7.5% | 0.65 (0.84, 0.52) / 34.5% |
| F03_iran_oct31_vs_wti110 | -0.01 / -0.0% | -0.06 (-0.02, -0.37) / 0.5% | n/a |
| F04_senateD_vs_fed_hike25 | 0.05 / 0.0% | 0.05 (-0.03, 0.12) / -0.0% | -0.08 (-0.13, -0.02) / -0.1% |
| F05_k_btc100k_vs_k_fed_hike25 | -0.08 / -0.1% | -0.06 (-0.02, -0.09) / 0.1% | -0.09 (-0.05, -0.13) / 0.3% |
| F06_pm_btc100k_vs_k_fed_hike25 | -0.14 / 0.4% | -0.19 (-0.01, -0.30) / 0.2% | -0.19 (-0.06, -0.27) / 1.3% |

## T8. Economic test of lead-lag (follow leader's move for one bin; pay spread + 2 taker fees). n>=30 rows only

Rows with n>=30: 273; positive mean net: 2; positive mean gross: 190; gross t>3: 17; gross t>3 AND net>0: 0

| cluster | leader -> follower | grid | theta (c) | n | mean gross (c) | t gross | mean net (c) | OOS n | OOS gross (c) | OOS net (c) |
|---|---|---|---|---|---|---|---|---|---|---|
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 5m_pm | 0.5 | 2357 | +0.03 | 4.91 | -3.82 | 943 | +0.03 | -3.84 |
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 1h | 0.5 | 633 | +0.17 | 4.75 | -3.54 | 254 | +0.13 | -3.84 |
| L03_pm_btc_90_100 | PM_BTC_100K -> PM_BTC_90K | 5m_pm | 0.5 | 1147 | +0.06 | 4.39 | -5.08 | 459 | +0.08 | -4.94 |
| L01_pm_btc_100_110 | PM_BTC_100K -> PM_BTC_110K | 1h | 1.0 | 258 | +0.14 | 4.02 | -3.60 | 104 | +0.08 | -3.66 |
| L01_pm_btc_100_110 | PM_BTC_110K -> PM_BTC_100K | 5m_pm | 0.5 | 613 | +0.06 | 3.95 | -3.79 | 246 | +0.02 | -3.89 |
| X11_btc_100k_2026 | PM_BTC_100K -> K_BTC_100K | 1h | 1.0 | 252 | +0.25 | 3.89 | -3.73 | 101 | +0.25 | -3.90 |
| X11_btc_100k_2026 | PM_BTC_100K -> K_BTC_100K | 1h | 2.0 | 71 | +0.68 | 3.82 | -3.36 | 29 | +0.74 | -3.37 |
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 1h | 1.0 | 373 | +0.20 | 3.74 | -3.57 | 150 | +0.14 | -3.84 |
| L03_pm_btc_90_100 | PM_BTC_100K -> PM_BTC_90K | 1h | 1.0 | 201 | +0.37 | 3.59 | -4.76 | 81 | +0.17 | -4.83 |
| L01_pm_btc_100_110 | PM_BTC_100K -> PM_BTC_110K | 5m_pm | 0.5 | 1297 | +0.02 | 3.59 | -3.80 | 519 | +0.01 | -3.75 |
| L03_pm_btc_90_100 | PM_BTC_90K -> PM_BTC_100K | 5m_pm | 1.0 | 713 | +0.05 | 3.48 | -3.84 | 286 | +0.00 | -3.87 |
| F02_btc100k_vs_eth3500 | PM_BTC_100K -> PM_ETH_3500 | 1h | 0.5 | 469 | +0.11 | 3.48 | -4.58 | 188 | +0.04 | -4.72 |

Positive-net rows:
- LR2_iran_oct12_oct15_resolved PM_IRAN_OCT12->PM_IRAN_OCT15 1h theta=0.5c n=45 gross=+0.37c net=+0.27c (t_net=2.06)
- LR2_iran_oct12_oct15_resolved PM_IRAN_OCT15->PM_IRAN_OCT12 1h theta=1.0c n=45 gross=+0.17c net=+0.07c (t_net=0.52)

## T9. Leg diagnostics (5-minute grid, mid prices)

| leg | venue | bins | share bins with zero mid change | n changes | median |change| (c) | lag-1 autocorr of mid diffs | lag-1 autocorr of trade-price diffs (Kalshi) | mean spread (c) |
|---|---|---|---|---|---|---|---|---|
| PM_SEN_D | PM | 16415 | 0.996 | 63 | 1.00 | -0.027 | n/a | 1.00 |
| PM_HOU_D | PM | 16415 | 0.996 | 61 | 1.00 | -0.080 | n/a | 1.00 |
| PM_FED_H0 | PM | 16415 | 0.975 | 414 | 1.00 | 0.082 | n/a | 1.00 |
| PM_FED_H25 | PM | 16415 | 0.972 | 461 | 1.00 | 0.120 | n/a | 1.00 |
| PM_BOP_DD | PM | 16415 | 0.995 | 90 | 1.00 | -0.030 | n/a | 1.00 |
| PM_BOP_DSRH | PM | 16415 | 0.970 | 499 | 0.05 | 0.009 | n/a | 0.20 |
| PM_TX_D | PM | 16415 | 0.988 | 201 | 1.00 | -0.020 | n/a | 1.00 |
| PM_VANCE_NOM | PM | 16415 | 0.976 | 402 | 0.05 | 0.052 | n/a | 1.20 |
| PM_VANCE_WIN | PM | 16415 | 0.980 | 330 | 0.05 | 0.457 | n/a | 0.10 |
| PM_NEWSOM_NOM | PM | 16415 | 0.962 | 629 | 0.05 | 0.086 | n/a | 0.10 |
| PM_NEWSOM_WIN | PM | 16415 | 0.973 | 440 | 0.05 | 0.045 | n/a | 0.10 |
| PM_NBA_OKC_CH | PM | 16415 | 1.000 | 4 | 1.00 | -0.000 | n/a | 1.00 |
| PM_NBA_OKC_W | PM | 16415 | 1.000 | 4 | 0.50 | -0.250 | n/a | 1.00 |
| PM_BTC_90K | PM | 16415 | 0.846 | 2532 | 0.50 | -0.025 | n/a | 2.00 |
| PM_BTC_100K | PM | 16415 | 0.916 | 1372 | 0.50 | -0.111 | n/a | 1.00 |
| PM_BTC_110K | PM | 16415 | 0.957 | 700 | 0.50 | -0.120 | n/a | 2.00 |
| PM_BTC_120K | PM | 16415 | 0.977 | 378 | 0.50 | -0.130 | n/a | 1.00 |
| PM_ETH_3500 | PM | 16415 | 0.931 | 1133 | 0.50 | -0.164 | n/a | 2.00 |
| PM_IRAN_OCT22 | PM | 1135 | 0.909 | 103 | 0.50 | 0.006 | n/a | 1.00 |
| PM_IRAN_OCT31 | PM | 8883 | 0.909 | 810 | 1.00 | -0.312 | n/a | 1.00 |
| PM_IRAN_NOV15 | PM | 4812 | 0.889 | 533 | 0.50 | -0.017 | n/a | 3.00 |
| PM_IRAN_NOV30 | PM | 8496 | 0.921 | 673 | 0.50 | -0.098 | n/a | 1.00 |
| PM_IRAN_DEC31 | PM | 8496 | 0.924 | 647 | 0.50 | -0.162 | n/a | 1.00 |
| PM_WTI_H110 | PM | 6721 | 0.915 | 569 | 0.50 | -0.206 | n/a | 1.00 |
| PM_WTI_H105 | PM | 6568 | 0.852 | 975 | 0.50 | -0.092 | n/a | 1.00 |
| PM_WTI_L85 | PM | 6568 | 0.789 | 1385 | 0.50 | -0.256 | n/a | 1.00 |
| PM_IRAN_OCT9 | PM | 4290 | 0.939 | 261 | 0.10 | -0.106 | n/a | 0.10 |
| PM_IRAN_OCT12 | PM | 4290 | 0.882 | 506 | 0.10 | -0.055 | n/a | 0.10 |
| PM_IRAN_OCT15 | PM | 5420 | 0.874 | 684 | 0.50 | -0.081 | n/a | 0.10 |
| PM_FEDSEP_H25 | PM | 16415 | 0.978 | 368 | 1.00 | 0.043 | n/a | 0.10 |
| PM_FEDSEP_H0 | PM | 16415 | 0.974 | 435 | 1.00 | 0.051 | n/a | n/a |
| K_SEN_D | K | 8639 | 0.991 | 77 | 1.00 | -0.064 | -0.322 | 1.00 |
| K_HOU_D | K | 8639 | 0.937 | 546 | 0.05 | -0.159 | -0.349 | 0.27 |
| K_FED_H0 | K | 8639 | 0.937 | 548 | 1.00 | -0.023 | -0.175 | 1.09 |
| K_FED_H25 | K | 8639 | 0.944 | 485 | 1.00 | -0.021 | -0.114 | 1.08 |
| K_FED_H26 | K | 8639 | 1.000 | 4 | 0.75 | -0.000 | -0.000 | 1.02 |
| K_FED_T400 | K | 8639 | 0.836 | 1419 | 0.50 | -0.102 | -0.054 | 1.79 |
| K_BOP_DD | K | 8639 | 0.982 | 153 | 1.00 | -0.112 | -0.288 | 1.01 |
| K_BOP_RD | K | 8639 | 0.968 | 276 | 0.05 | -0.010 | -0.072 | 0.18 |
| K_TX_D | K | 8639 | 0.979 | 183 | 1.00 | -0.100 | -0.390 | 1.03 |
| K_VANCE_NOM | K | 8639 | 0.995 | 42 | 1.00 | -0.042 | -0.128 | 1.00 |
| K_VANCE_WIN | K | 8639 | 0.988 | 105 | 1.00 | -0.110 | -0.138 | 1.00 |
| K_NEWSOM_NOM | K | 8639 | 0.999 | 12 | 0.50 | -0.167 | -0.161 | 1.00 |
| K_NEWSOM_WIN | K | 8639 | 0.923 | 663 | 0.05 | -0.059 | -0.017 | 0.45 |
| K_NBA_OKC_W | K | 8639 | 0.991 | 77 | 0.50 | -0.540 | -0.000 | 1.08 |
| K_BTC_100K | K | 8639 | 0.962 | 326 | 1.00 | 0.034 | 0.001 | 1.05 |
| K_BTC_110K | K | 8639 | 0.967 | 284 | 0.50 | -0.012 | 0.012 | 1.21 |
| K_BTC_120K | K | 8639 | 0.983 | 151 | 0.50 | -0.048 | -0.035 | 1.22 |
