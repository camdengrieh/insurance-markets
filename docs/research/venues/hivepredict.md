# HivePredict adapter spec (researched 2026-10-19)

Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict
Live, tiny, parimutuel, Hive-chain-only, no EVM/Solana path. Public unauthenticated read API is good (documented manifest, CORS, no key). Not tradable from a PayBox EVM wallet. Adapter priority: **skip for trading; P2 at most as a read-only signal** (and only if someone wants a Hive-community sentiment feed). Liquidity is roughly USD 5k lifetime volume and ~USD 40 across open pools. Parimutuel "price" is a pool share, not a tradable quote.

## Liveness (H)
- hivepredict.app returned HTTP 200 on 2026-10-19; /api/health returned `{"status":"ok","timestamp":"2026-10-19T07:22:22Z"}`. Markets auto-resolved on 2026-10-18 (e.g. auto-btc-2026-10-18, resolved NO, payouts on-chain listed on /transparency). Source: https://hivepredict.app/api/health, https://hivepredict.app/transparency
- Open beta announcement and SDK posts on PeakD by @beggars (M, search result titles only): https://peakd.com/@beggars/introducing-hivepredict-prediction-markets-on-the-hive-blockchain-open-beta
- npm `hivepredict` 0.1.0, last modified 2026-03-20, MIT, repo github.com/Vheissu/hivepredict-sdk (0 stars, last push 2026-03-20) (H): https://registry.npmjs.org/hivepredict

## Kind and market model
- Parimutuel pools, no order book, no AMM, no market makers (H): https://hivepredict.app/docs/overview/how-markets-work
- Binary YES/NO plus multi-outcome single-winner (outcome keys `O1..On` with `outcomeLabels` map; e.g. Brazil election has 8 outcomes) (H): market detail fixture.
- No outcome tokens: a position is a ledger entry in the indexer, created by a Hive transfer plus `custom_json`; not transferable or tradable (M, inferred from docs; no token/ERC-1155 mentioned anywhere).
- Implied probability = outcome pool / total pool (H, https://hivepredict.app/docs/predictions/understanding-odds). Payout depends on final pool, not odds when you bet. Cash-out exists on auto-resolved markets only, with 5% to 35% quadratic time penalty, min 10 tokens (H, https://hivepredict.app/docs/settlement/cash-out). There is no way to "sell" at a mid price.
- Crypto YES/NO markets apply a late-entry weight to the profit share (weight = stake x (1 - penaltyRate x timeFraction)^power; constants not published) (H, payout-formula doc).

## Chains and collateral
- Hive L1 (Graphene chain, no EVM). Collateral: HIVE, HBD (native), or a Hive Engine token (LEO, SPS, etc. via sidechain `ssc-mainnet-hive`). Each market has a single token. 3 decimal precision for native; min bet 1.000 (H): https://hivepredict.app/docs/api/place-predictions, https://hivepredict.app/api/public
- HIVE price USD 0.04877, HBD 2.74 at 2026-10-19T07:23Z (H): https://hivepredict.app/api/prices

## Read API (official, public, unauthenticated)
- Docs: https://hivepredict.app/docs/api/overview , /endpoints , /examples. Manifest (always-current endpoint list): `GET https://hivepredict.app/api/public` (H). Base URL `https://hivepredict.app/api`.
- Auth: none. CORS enabled. Read-only (GET/HEAD/OPTIONS). Rate limit per IP "typically 60 to 240 requests per minute"; observed headers `x-ratelimit-limit: 240` on /api/markets and `100` elsewhere, reset 60s (H). No WebSocket documented (NOT FOUND, searched docs overview/endpoints, manifest). Chain lag "a few seconds".
- Key endpoints (H, manifest): `/markets` (status, category, token, marketGroup, sort, page, limit), `/markets/open|new|trending|ending-soon|resolved|closed|featured`, `/markets/:id` (full detail incl. `outcomePools`, `participantCount`, `tradingCutoff`, `resolutionType`, `resolutionSource`, `resolutionCriteria`, `autoResolution` provenance), `/markets/:id/predictions`, `/payouts`, `/snapshots?range=`, `/holders`, `/proofs`, `/markets/:id/stake/:username`, `/users/:username[/positions|predictions|eligibility]`, `/stats`, `/tokens`, `/prices`, `/transparency`, `/sports/:league/events`, `/activity`.
- Pagination: `page` from 1, `limit`; responses carry `total,page,limit` (H, overview). `/api/markets` default page returned ~100 KB (H), so always pass `limit`.
- No separate "book" or "price" endpoint; price = `outcomePools[k] / totalPool`. Numbers are strings with 3 decimals. Fields `yesPool/noPool` are "0" on multi-outcome markets, so use `outcomePools`.
- Confirmed response shapes (H, unauthenticated GET 2026-10-19), saved to `docs/research/fixtures/hivepredict/`: `public-manifest.json`, `markets-open-limit3.json` (envelope `{markets:[...]}`), `market-detail-multi-outcome.json` (Brazil election, 8 outcomes), `market-predictions-limit2.json`, `stats.json`, `tokens.json` (trimmed to 4 of many Hive Engine tokens).
- Sample: Brazil Presidential Election outcomePools O2 (Flavio Bolsonaro) 350 of 423 HIVE (=82.7%), 15 participants, stakeCap 1000, tradingCutoff 2026-10-23, manual resolution.

## Trade path
- REST is read-only. Placing a bet = one signed Hive transaction containing (1) `transfer` from user to platform account (read from manifest `platformAccount`, currently `hivepredict`) with memo `{marketId}:{outcome}`, amount `X.XXX HIVE|HBD`, plus (2) `custom_json` id `hivepredict_place_prediction`, `required_auths=[user]` (ACTIVE authority), payload `{market_id,outcome,amount,tx_id:""}`. Hive Engine tokens use a `ssc-mainnet-hive` custom_json token transfer instead. Preflight: `/api/users/{u}/eligibility?action=predict`. Confirm by polling `/markets/{id}/predictions`. (H): https://hivepredict.app/docs/api/place-predictions
- Signing: secp256k1 Hive key (Keychain/HiveSigner). Funds are sent to a platform-controlled account (custodial pool, not a smart-contract escrow) and payouts are sent back by the platform (M, inferred from transfer+memo flow and /transparency "recent on-chain payouts"). Platform insolvency/admin-key risk applies.
- Eligibility gate (H): Hive account age >= 90 days, reputation >= 25, >= 5 posts; per-market per-account stake cap (e.g. 1,000 to 10,000 HIVE). A fresh bot account cannot bet.
- Cancel/modify: none. Only partial cash-out on auto markets, via on-chain op (op id not documented in pages read; NOT FOUND, searched docs cash-out and manifest).

## PayBox reachability
**No.** PayBox wallets are EVM/Solana (and per task list Base, Ethereum, BNB, Arbitrum, Polygon, Solana). Hive needs a Hive keypair and Hive ops (transfer + custom_json). EVM transaction proposals or signed orders cannot express this. Reachable only by a new Hive-native signer plugin and a Hive account that passes the 90-day/reputation/post gate, plus funding HIVE/HBD (HBD/HIVE are on Binance, Bitget etc. M). Not recommended.

## Fees (H)
- 3% of total pool, capped at the losing-side pool, taken at settlement from the losing side so principal is never touched. Creator commission (1% or 1.5%) and referral shares (25% to referrer and 25% rebate to referee for 90 days, then 20%) come out of the platform share, not on top. Community market creation has a flat fee. Cash-out penalty 5% to 35%. No gas (Hive is feeless, uses resource credits). https://hivepredict.app/docs/settlement/fees-and-rewards
- Payout: `winnerPayout = stake + profitPool x weight/totalWinnerWeight`; `profitPool = losing - min(3% x total, losing)`.

## Resolution and dispute risk (H unless noted)
- Auto: crypto spot via CoinGecko, commodities via Yahoo Finance futures, sports (listed leagues: NFL, NBA, NHL, MLB, EPL, MLS, UCL, FIFA World Cup, AFL, NRL etc.) via The Odds API final scores. Backend "suggests" outcome then resolves (sample shows `status: suggested` then resolved 17s later). Weekly house-seeded markets (1 HIVE each side) for BTC/ETH/SOL/XRP/DOGE/BNB/HIVE/gold/silver/Brent. https://hivepredict.app/docs/resolution/auto-resolution
- Manual: admins broadcast `resolve_market` after community proofs (source URLs, votes). Contested market (>=2 outcomes with support) held 48h; admins can void any time. Admin = single trusted party; no on-chain dispute bond or oracle. Markets under min participants (3) are auto-voided and refunded. https://hivepredict.app/docs/resolution/manual-resolution
- Resolution rules are user-written free text and differ from Polymarket/Kalshi wording, so cross-venue equivalence needs manual linking.

## Geo / ToS / automation
- NOT FOUND: Terms of service page (https://hivepredict.app/terms returns 404), explicit geo restrictions, bot policy (searched FAQ, docs safety/eligibility, site links). Site frames itself as having responsible-play controls (monthly limits, self-exclusion). Legal status in the user's jurisdiction unreviewed; real-money gambling-style product. API is explicitly offered for partner apps and bots reading data ("free read-only public API", SDK published), no key required.

## Liquidity (H, dated)
- All-time (as of 2026-10-19): `/api/stats` says 118 markets, 18 active, 102,190 HIVE volume (~USD 4.98k at 0.0488), 1,811 predictions, 186 users, 112,475 HIVE paid out (payout figure exceeds volume in stats, so the field likely double counts or includes other tokens; treat as unreliable). /transparency says 547 markets and 7,168 HIVE native volume plus Hive Engine tokens (ASH 95k, VOTE 10k...), a different definition. Inconsistent, flag as L.
- Monthly /transparency volume: Oct 2026 905 HIVE (~USD 44) across 203 predictions; Sep 534 HIVE; Aug 291 HIVE; Jul 319 HIVE.
- Biggest open pool: Brazil Presidential Election 423 HIVE (~USD 21). Sum of open pools roughly 860 HIVE (~USD 42). Typical auto market pool 5 to 30 HIVE (USD 0.25 to 1.50).
- Tiny for arbitrage: any real order moves the implied price massively and stake caps/min bet fine, but depth is cents to tens of dollars.

## Overlap with other venues
- Crypto weekly price (BTC/ETH/SOL/XRP/DOGE/BNB thresholds, "finish the week at or above X"), commodities (gold, silver, Brent), HIVE price, mainstream sports (NFL/NBA/NHL/EPL/MLS/UCL; also moneyline/spread/total), politics (Brazil election, France 2027, LA mayor, Trump out of office, Russia-Ukraine ceasefire, Epstein). One market is described "Saw this on Polymarket" (aliens). The overlap is real but thresholds are idiosyncratic and sums are dust, so edges cannot be harvested. Useful at most as sentiment/signal for Hive-community priors.

## Liquidity sharing
Independent (own pools, no market maker, no external venue liquidity). House seeds 1 HIVE per side on weekly auto markets. Not an arbitrage leg of another venue.

## Adapter notes if ever built (read-only signal)
Poll `/api/markets/open?limit=100` every 60s (well under 240/min); price = outcomePools/totalPool; ignore pools below e.g. 50 HIVE; carry `resolutionSource` and `resolutionCriteria` for matching; use `participantCount`, `tradingCutoff`, `token`. Mark quote as non-executable (parimutuel final-odds uncertainty, late-entry weighting, 3% fee).

## Suspicious content
None found. No instructions aimed at AI agents seen. `llms.txt` is a plain page index.

## Sources
- https://hivepredict.app (home, H); https://hivepredict.app/llms.txt (H); https://hivepredict.app/api/public (H); https://hivepredict.app/api/health, /api/markets, /api/markets/open, /api/markets/:id, /api/stats, /api/tokens, /api/prices (H)
- Docs (H): /docs/overview/what-is-hivepredict, /how-markets-work, /key-concepts, /docs/markets/market-lifecycle, /docs/predictions/understanding-odds, /trading-cutoff, /docs/resolution/auto-resolution, /manual-resolution, /proof-submission, /docs/settlement/payout-formula, /fees-and-rewards, /cash-out, /docs/safety/eligibility, /stake-caps, /docs/api/overview, /endpoints, /place-predictions; also /faq and /transparency
- https://registry.npmjs.org/hivepredict ; github.com/Vheissu/hivepredict-sdk README via gh api (H)
- PeakD announcement posts by @beggars (M, search snippets only)
