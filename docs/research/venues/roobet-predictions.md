# Roobet Predictions - venue spec (2026-10-19)

Verdict: **skip**. Custodial crypto-casino feature. No public API found, no on-chain component found, provider and liquidity source not named, US/UK/AU etc. restricted, ToS bans bots. Not integrable by an agent or PayBox wallet.

Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Is it live?
- [M] Launched 2026-05-06 per a Chainwire press release (paid PR distribution, Roobet-authored): "Players can participate instantly using their existing accounts and balances". Page: https://chainwire.org/2026/05/06/roobet-launches-prediction-markets-on-may-6-the-first-major-crypto-casino-to-integrate-the-format/ (about 5 months old; not stale by the 6-month rule but nothing newer was found).
- [H] https://roobet.com/predictions returns HTTP 200 but it is a client-rendered SPA shell titled "Roobet Crypto Casino | Best Bitcoin Casino & Online Slots". Every path I tried (/terms, /sports, /zzz-not-a-page) returns the same 18,854-byte shell, so the 200 does NOT prove the Predictions product is currently live. No server-rendered market data.
- Result: launch confirmed (M); current liveness NOT independently confirmed. Treat as "probably live, unverified".

## Kind and market model
- Kind: custodial centralised crypto casino/sportsbook with an embedded prediction-market product (kind=other).
- [M] Positions on "real-world outcomes across sports, culture, and major global events"; plans to expand into entertainment and internet culture (Chainwire).
- NOT FOUND: market model (binary/categorical/scalar), order book vs AMM vs parimutuel vs fixed-odds, outcome tokenisation. Searched: press release, roobet.com/predictions HTML, help.roobet.com (collections General, Sports Betting; no predictions article), ToS. Likely an internal ledger (no tokens), but that is inference only [L].

## Provider / liquidity
- NOT FOUND: provider or liquidity source. The press release does not name one. WebSearch was unavailable (session search budget exhausted), so no secondary reporting was checked. Open question whether it is a white-label feed from a regulated venue (e.g. Kalshi/Polymarket-style data) or a house book. If it is a mirror of another venue, it is NOT an independent arbitrage leg.

## Chains and collateral
- [M] "existing Roobet account balances" - one wallet for casino, sportsbook and predictions. Roobet is a crypto casino, so collateral is an internal balance funded by crypto deposits. NOT FOUND: which chains/tokens are credited to the prediction balance. No on-chain contracts found.

## Read API
- exists: none found (no official public API).
- [H] No developer docs host: docs.roobet.com and blog.roobet.com do not resolve; help.roobet.com has 7 collections (General, Account, Deposits, Games, Withdrawals, Rewards and Promotions, Sports Betting) with no API or predictions content.
- [H] Guessed paths on the main domain (/_api/predictions, /_api/prediction-markets) return 404 "Cannot GET"; api.roobet.com returns 403 (Cloudflare challenge). I did not probe further; the web app presumably uses private authenticated endpoints, which are out of scope (ToS bars robots, see below).
- Websocket: NOT FOUND.
- Fixtures: none saved (no public API response to capture).

## Trade path
- none. Account login on roobet.com, custodial balance. NOT FOUND: any API key, order endpoint or signing scheme.

## PayBox reachability
- no. A PayBox EVM/Solana wallet could at most make a crypto deposit to a Roobet-controlled address (a transfer, which needs account registration and KYC-style steps), but could not place or cancel orders programmatically. No transaction proposal or signed-order path exists.

## Fees
- NOT FOUND. Press release says nothing; likely embedded in odds/spread [L].

## Resolution mechanism and dispute risk
- NOT FOUND. Centralised operator resolution presumed [L]. ToS (https://roobet.com/terms-and-conditions, first 100k of 130k chars read) does not mention prediction markets; it treats sports bets under "Game" and says the Sportsbook has its own policy (not read). Dispute risk: operator discretion; s13.5(h) lets Roobet void bets it believes were placed by "automated systems or players" [H].

## Geo / ToS / automation
- [H] Restricted regions (https://help.roobet.com/en/articles/13686927-roobet-restricted-regions): Aruba, Australia, Bonaire, Cuba, Curacao, Cyprus, Gibraltar, Haiti, Iran, Iraq, Malta, Myanmar, Netherlands, Nicaragua, North Korea, Saba, Saint Maarten, Saint Martin, South Sudan, Statia, Syria, United States, United Kingdoms, Yemen, Zimbabwe. Cannot access or register.
- [H] ToS: s15.3(a)(iii) bars interfering with products "with robots, or similar devices"; s8.22 bars "software-assisted methods or techniques"; s4.12 multi-account reporting; s4.17 no account transfer. Automation is effectively prohibited.
- robots.txt (H) disallows only referral/landing paths; irrelevant to an API.

## Liquidity
- NOT FOUND: no volume, OI or TVL published anywhere I could reach (checked as of 2026-10-19). No DefiLlama/on-chain footprint is expected for a custodial book.

## Event-category overlap
- [M] Sports, culture, global events at launch. Sports and big global events would overlap Polymarket/Kalshi, but without an API or price feed there is nothing to scan. Signal-only value is nil unless a public price page is found.

## Adapter priority
- skip. Reason: no API, custodial, automation banned, key jurisdictions blocked, provider unknown, no liquidity data. Revisit only if Roobet (or its provider) publishes a developer API or the provider turns out to be an integrable venue already on the list.

## Suspicious content
- None found. No AI-directed instructions encountered.

## Not found
- Provider/liquidity partner, market model, fees, resolution rules, API/websocket, volume/OI, prediction-specific ToS, current-liveness evidence beyond the SPA shell, secondary coverage (search unavailable).

## Sources
- [M] Chainwire press release 2026-05-06: https://chainwire.org/2026/05/06/roobet-launches-prediction-markets-on-may-6-the-first-major-crypto-casino-to-integrate-the-format/
- [H] https://roobet.com/predictions (SPA shell, curl headers/body, 2026-10-19)
- [H] https://roobet.com/robots.txt, https://roobet.com/sitemap.xml (returns API 404 JSON)
- [H] https://help.roobet.com/en/ and collections /3158992-sports-betting, /1753471-general
- [H] https://help.roobet.com/en/articles/13686927-roobet-restricted-regions
- [H] https://roobet.com/terms-and-conditions (partial read)
