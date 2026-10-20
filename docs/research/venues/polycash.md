# PolyCash (poly.cash) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.
Verdict: adapter_priority = skip. Live as a hobby/self-hosted PHP app, but no usable API, no meaningful volume, UTXO "colored coin" model on Datachain/Bitcoin-family chains, not reachable from an EVM wallet.

## 1. Liveness
- poly.cash serves HTTP 200 over TLS but the certificate expired 2026-10-13 (notAfter Oct 13 23:59:59 2026 GMT, Sectigo DV; notBefore 2026-03-29). Fetched with curl -k only to read public pages. [H] https://poly.cash
- Repo PolyCash/polycash: MIT, 49 stars, not archived, last push 2025-11-30 (Monster Duels fixes), created 2018-02-01. [H] https://github.com/PolyCash/polycash
- Site lists 2 running games: "Football Cents 2025" and "Forex 32"; directory categories: eSports, Financial Assets, Sports Betting, Strategy Games, Virtual Sports. [H] https://poly.cash/explorer/ , https://poly.cash/directory/
- Football Cents 2025 is finished: payouts for the Super Bowl on Feb 8, 2026; page shows "Footballcents in circulation: 0", pending bets 0. [H] https://poly.cash/football-cents-2025/
- Forex 32: all visible events "Running" with "0 mimecoins bet"; pending bets 0. [H] https://poly.cash/explorer/games/forex-32/events/
- Page footer says "PolyCash, 2026" (template year only). No 2026 blog/news fetched (web search budget exhausted; medium.com/polycash not read). [M]

## 2. Kind and market model
- Not a conventional market venue. PolyCash is a software protocol for "peer to peer betting currencies": layer-2 "colored coins" on Bitcoin-derived chains (Bitcoin, Litecoin, Dogecoin, Datachain). Anyone can run a node and define a game. [H] https://github.com/PolyCash/polycash README; https://poly.cash
- Betting is parimutuel-style: players vote/bet coins on event options, pot redistributed to winning side after the event, with a configurable fee burned. No order book, no AMM, no secondary trading of outcome shares at the protocol level (positions are UTXO "game IOs" owned by private keys). [M, inferred from README + game pages]
- Football Cents 2025: binary-ish sports events ("Team A vs Team B", pick winner; "No winner" outcome exists). 281 events. [H] https://poly.cash/explorer/games/football-cents-2025/events/
- Forex 32 ("mimecoins", MIME): scalar-bucket markets, e.g. "Troy ounce of gold between $4,100 and $4,400" (XAU/USD), "Japanese yen between $0.0061 and $0.0065", 32 currencies plus gold/silver; markets open ~6h, convert/pay out 3 days later; price outside bucket range yields payouts that differ from true asset value (site's own caveat). 86,016 events total. [H] https://poly.cash/forex-32/
- Prices come from configured oracles (default CoinDesk for BTC; fcsapi.com for forex; keyed by node operator config). [H] README

## 3. Chains and collateral
- Datachain (a Bitcoin-source-derived chain "launched by the PolyCash team", github.com/datachains/datachain) is the base for both live games; explorer also lists Bitcoin and Litecoin. [H] https://poly.cash/explorer/
- Game tokens: footballcents (FBC, 100k supply "backed by 100k USD"), mimecoins (MIME, 100M genesis, "1 mimecoin = 1 USD", "Backed by 99.7305M USD" - self-reported claim, unverifiable) [H the claim exists; L that backing is real]
- Buy-in: "for sale by node operators" by depositing BTC/LTC; sell-out back to BTC/LTC. Counterparty risk on the node operator. [H] game pages
- No EVM, no Solana, no stablecoin on a major chain.

## 4. Read API
- exists = none (for market data). Official API doc page /api/about documents only: `/api/<game>/status/` (chain status) and `?api_access_code=` variant; the API is aimed at sharing "voting recommendations" for automating bets, not market data. [H] https://poly.cash/api/about
- src/api.php also routes: `/api/card(s)/...` (prepaid card check/withdraw), `/api/block(s)/<blockchain>/<height or range>`. [H] https://github.com/PolyCash/polycash/blob/main/src/api.php
- Live check: GET https://poly.cash/api/forex-32/status/ returns `{"status_code":0,"message":"Error, URL not recognized"}` (HTTP 200, application/json) - documented example URL form does not work on the live node. [H] fixture api_status_forex-32.json
- Event data is only available as server-rendered HTML pages (/explorer/games/<game>/events/); parsing HTML would be needed. Odds/pot size per option are not exposed as JSON. [H]
- CORS `Access-Control-Allow-Origin: *` set in api.php. Rate limits: NOT FOUND. Websocket: NOT FOUND (searched: repo tree, api.php, API docs page).
- Terms of use prohibit "any automated use of the Site, the Service or the related systems" and non-personal/commercial use. [H] https://github.com/PolyCash/polycash/blob/main/src/terms-of-use.php (dated Oct 4, 2023; also reflected on poly.cash)

## 5. Trade path
- Bets are placed through the authenticated PHP web wallet (`src/ajax/place_bets.php`: requires a logged-in user session and synchronizer token; builds a Datachain/Bitcoin-style transaction from game IOs with option_ids and amounts). No public signed-order API. [H] repo file
- Programmatic trading would require running your own node and driving Bitcoin-style raw transactions; no documented SDK. [M]
- PayBox reachability: NO. PayBox wallets are EVM/Solana. Datachain/BTC/LTC UTXO chains are not supported, and there is no EVM contract. paybox_reachable = no.

## 6. Fees
- Football Cents 2025: 1% on every betting payout, destroyed (burned). [H] https://poly.cash/football-cents-2025/
- Forex 32: 0.01% betting fee. [H] https://poly.cash/forex-32/
- Chain transaction fees additionally paid by bettor; buy-in/sell-out spread set by node operator. [M]

## 7. Resolution
- Resolved by game definition/oracle logic run by every node (deterministic from chain data plus configured oracle feed or event outcome entered in the game definition). Dispute path: none documented; trust sits with the game definition author and oracle (CoinDesk/fcsapi, sports result source). [M]

## 8. Geo / ToS / automation
- Must be 18+; ToS bans automated use and commercial use of the Site/Service. [H] terms-of-use. No explicit geo list read. [NOT FOUND]

## 9. Liquidity
- Forex 32: 99.7305M MIME "in circulation" but pending bets 0 and every listed event shows 0 bet (2026-10-19). Circulation is a nominal supply figure, not betting volume. [H]
- Football Cents 2025: 0 in circulation, game concluded after Feb 8, 2026. [H]
- No volume/TVL/OI figure published. Effective liquidity: zero observed. [H]

## 10. Overlap with other venues
- Football Cents covered NFL game winners (overlap with sportsbooks/Kalshi/Polymarket) but is finished. Forex 32 / gold-silver bucket ranges are loosely comparable to macro/commodity range markets elsewhere but no liquidity. Does not share liquidity with any other venue (independent, but empty).

## 11. Suspicious content
- None found. Page contains mailto and Google Analytics tag only (ignored). Self-reported "backed by USD" figures noted as unverified.

## Sources
- https://poly.cash (home, /api/about, /directory/, /explorer/, /football-cents-2025/, /forex-32/, event explorer pages) - fetched 2026-10-19, cert expired so -k used
- https://github.com/PolyCash/polycash (README, src/api.php, src/routes/routes.php, src/ajax/place_bets.php, src/terms-of-use.php, commits)
- Fixtures: docs/research/fixtures/polycash/
- NOT FOUND (searched: repo, site, API docs): REST market/odds endpoints, rate limits, websocket, geo restrictions, verified volume. WebSearch unavailable (session budget exhausted).
