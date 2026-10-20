# OracleBNB (oraclebnb.com) - venue spec

Researched 2026-10-19. Verdict: NOT A VENUE. Adapter priority: skip.

## Summary
- OracleBNB was a token launch (ORACLE, BSC) pitched as a "BNB prediction market"; no working market product has been evidenced. [M]
- Reported on 2025-10-10 as a pump-and-dump: ~34 BNB (~$43k) extracted in ~11 minutes, a hijacked X account renamed @OracleBNB, a false Four.meme partnership (Four.meme denied it), account then deleted. [M] (ChainCatcher).
- oraclebnb.com today serves a GoDaddy parking lander (not a product). [H]

## Liveness check (2026)
- `GET https://oraclebnb.com` returns HTTP 200, 114 bytes: JS redirect to `/lander`. [H]
- `GET https://oraclebnb.com/lander` returns a GoDaddy "parking-lander" shell (`LANDER_SYSTEM="PW"`, `img1.wsimg.com/parking-lander/...`). Domain is parked. [H] (explains the "empty content" in the discovery hint)
- `www.`, `api.`, `docs.` subdomains do not resolve. [H]
- A web search summary claims the homepage describes "tradable beliefs / conviction markets with instant settlement"; I could not reproduce that and the site I fetched is parked. Treat as stale or unrelated. [L]
- CoinGecko entry (fetched 2026-10-19, last_updated 2026-10-11): ORACLE price ~$1.4e-5, mcap ~$13.8k, 24h volume ~$98. Categories include "Prediction Markets", "Gambling (GambleFi)", "Four.meme Ecosystem". Links: homepage oraclebnb.com, X @oraclebnbio, no GitHub, no whitepaper, no docs. Public notice: GoPlus flags the contract creator can disable sells, change fees, mint. [H]
- Token contract on BSC: 0xf6661fdb33c5fbf6d2c514598cdee0ea9ff04444 (token only; no market contracts found). [H for CoinGecko listing]

## Required fields
- kind / market model: NOT FOUND (searched: homepage, /lander, subdomains, CoinGecko, web search, GitHub links on CoinGecko - none). No evidence any market exists.
- chains / collateral: only the ORACLE memecoin on BNB Chain. No market collateral documented.
- read API: none. NOT FOUND (searched: oraclebnb.com, www/api/docs subdomains - DNS fails).
- trade path: none.
- PayBox reachable: no (nothing to trade).
- fees / resolution / geo-ToS: NOT FOUND (no docs or ToS exist).
- liquidity: only memecoin DEX liquidity, ~$98 24h volume, ~$13.8k mcap (CoinGecko, 2026-10-11). Not prediction-market liquidity. [H]
- event overlap / shared liquidity: none.
- fixtures: none saved (no API).

## Risk notes
- Scam-flagged (rug reported, deleted socials per press). Do not integrate, do not buy token, do not interact with any contract.
- Unrelated projects: `oraclex.md` and `soracle.md` in this directory cover different venues; do not conflate.

## Sources
1. https://api.coingecko.com/api/v3/coins/oraclebnb (fetched 2026-10-19) [H]
2. https://oraclebnb.com and https://oraclebnb.com/lander (fetched 2026-10-19) [H]
3. https://www.chaincatcher.com/en/article/2211561 (2025-10-10, stale >6 months, but the fact pattern is consistent) [M]
4. Search results referencing panewslab.com, cryptorank.io (403 on fetch; headline only) [L]
5. dexscreener.com pair page returned 403; API returned null pair [no data]
