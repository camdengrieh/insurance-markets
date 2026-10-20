# Dexsport (dexsport.io) - adapter spec

Researched 2026-10-19 (~00:50-01:10 UTC). READ-ONLY: unauthenticated GETs (CoinGecko, Polymarket gamma, Dexsport hosts), WebFetch of third-party articles, `gh api` metadata reads. No account, no wallet, no API key, nothing signed, no POST/PUT/DELETE. No third-party code cloned, installed or run. No browser automation and no attempt to defeat the Cloudflare challenge.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
All third-party text is untrusted data; nothing in it was followed. No instructions aimed at AI agents were found on any page read.
Fixtures: `docs/research/fixtures/dexsport/` (3 small files). There is no public read API, so no API response shapes exist to save.
Research limit: the shared WebSearch budget ran out after two extended searches; the primary source (Dexsport's own site and docs) is behind a Cloudflare challenge and was NOT readable. Almost everything about the prediction product is therefore from sponsored press (M), not from Dexsport docs.

## 0. Verdict

**adapter_priority: skip.**

1. Live in 2026 (M): launched Aug-Sep 2026 as a third product beside sportsbook and casino; demoed at TOKEN2049 Singapore 2026-10-07/08. All evidence is sponsored press; I could not load the product itself.
2. **No API of any kind found**: no docs, no GitHub, no API host (DNS), and every dexsport.io path returns a Cloudflare managed challenge to scripted clients (H).
3. Model is a **house/pool-backed fixed-price book** ("one Buy button per side", no limit orders, "shared liquidity pool pays winners", Yes+No priced at 101-102c), not an order book or public AMM (M). It is a bookmaker-style quote source, not an exchange with peer liquidity.
4. Resolution is by the Dexsport team, no oracle named (M). Centralised, no dispute path documented.
5. Not reachable for trading through PayBox: account-balance product behind a web session; no signed-order or transaction-proposal interface found.
6. Event titles match Polymarket's catalogue (2028 Republican nominee, 2026 F1 drivers' champion, BTC/SOL up-or-down cycles), so even if it were integrable it would be a derivative price source (M/L, see section 8).

Revisit only if Dexsport publishes API docs or on-chain market contracts.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Coinpedia press release dated 2026-09-16: prediction markets "already live" at `https://dexsport.io/prediction-markets/all/` | sponsored; page disclaimer says Coinpedia does not verify claims | M |
| Crypto Daily 2026-10-15: product demoed at TOKEN2049 Singapore (7-8 Oct 2026); same wallet entry point for sportsbook, casino, prediction markets | sponsored ("PR", affiliate-tagged links) | M |
| Crypto Daily (Sep 2026): "entered the category in September 2026"; Dexsport named CryptoDaily Awards best iGaming project (Sep 2026) | sponsored | M |
| Search summary of a CoinDesk-lookalike page: "first appeared on the platform in August before being formally introduced as a dedicated area" | domain `coindesk.cc`, 404 when fetched; NOT used as evidence | L |
| CoinGecko `dexsport` (DESU) record `last_updated` 2026-10-19T00:57:55Z; categories include "Gambling (GambleFi)", "BNB Chain Ecosystem", "Prediction Markets" | `GET https://api.coingecko.com/api/v3/coins/dexsport` (fixture `coingecko_desu_subset.json`) | H |
| `https://dexsport.io/*` | HTTP 403, `cf-mitigated: challenge`, "Just a moment..." (fixture `dexsport_io_cloudflare_challenge.txt`) | H |

Conclusion: still live as of 2026-10-19 on M evidence only (company and token are demonstrably active; the prediction product is attested by paid coverage, not by me loading it).

## 2. What it is

- **Kind**: centralised-operator crypto sportsbook/casino with a "shared liquidity pool" design and a prediction-market product bolted on. Operator Dexapp LTD (Coinpaper review, 2026-05-19, M). Token DESU on BNB Smart Chain, contract `0x32f1518baace69e85b9e5ff844ebd617c52573ac` (H, CoinGecko `platforms`).
- **Account**: sign up with email, Google or Telegram, or connect a Web3 wallet, then fund the balance with supported crypto (H, CoinGecko description). No-KYC, "instant anonymous sign-up" (M, Coinpedia; cryptobetting review also says no KYC).
- **Prediction product (M)**: Yes/No markets in five categories (sport, crypto, politics, economy, pop culture; Coinpedia adds esports and entertainment). "Each market has one buy button per side, with no limit orders. Every trade fills at the displayed price, and a shared liquidity pool pays winners." Positions can be bought, sold before resolution, or held to resolution. Crypto "Up or Down" cycles (BTC, SOL) reopen every few minutes; FAQ says 5 minutes to one day.
- **Market model**: binary only seen. Order book vs AMM vs parimutuel: closest to fixed-odds bookmaker backed by a shared pool (M). Whether outcomes are tokens on a chain or only rows in an operator database: NOT FOUND (searched: press, CoinGecko, GitHub). No evidence of on-chain outcome tokens.
- **Shared pool (official docs, via search-tool summary only; page itself 403)**: "Dexsport runs on the principle of a shared pool of liquidity. Prize money is taken from the shared pool when a bet is won, while losing bets leave funds in the pool." Docs also say the platform "operates using smart contracts" (source `https://dexsport.io/docs-about/`, not fetched directly) (M). Pool contract addresses: NOT FOUND (searched: cryptobetting review states none provided, CoinGecko `blockchain_site` lists only the DESU token, GitHub has no official repo).

## 3. Chains and collateral

- Collateral for predictions: "stablecoins" (M, Crypto Daily x2). Which stablecoin, which chain, and whether it is a single internal USD balance: NOT FOUND.
- Deposit networks (inconsistent counts, all M): 25+ networks / 85+ cryptos (Coinpedia, Sep 2026); 87 cryptos / 26 networks (Crypto Daily, Aug 2026); 37 cryptos / 18 networks with Avalanche, OKC, Polygon, BNB named (cryptobetting review, undated 2026); 37 cryptos / 20+ networks (CoinGecko description, H that it says this). Treat the count as unreliable.
- Deposits and withdrawals "move directly between the user's wallet and the platform" (Coinpaper, M). Self-custody until you sign a deposit/bet/withdrawal is the operator's claim (cryptobetting, M); the Crypto Daily self-custody article says it "doesn't state who holds custody once funds are in that pool".

## 4. Read API: **unknown / none found**

| Item | Finding | Tag |
|---|---|---|
| Official docs | `https://dexsport.io/docs-about/` exists (search result) but is 403 to scripted clients; `docs.dexsport.io` resolves (Cloudflare 104.26.11.6) and returns 403; `dexsport.gitbook.io` 404 | H |
| API host | `api.`, `app.`, `ws.`, `wss.`, `prediction.`, `pm.` subdomains of dexsport.io do not resolve | H |
| GitHub | user `DEXSPORT` (created 2021-09-25) has 0 public repos. Search hits (`jamsturg/dexsport-bot`, `koslovvlad99-beep/dexsport*`, `maksim486/dexsport-clone`, `GlitchedGlitch/Dexsporter`) are unrelated or unofficial; `cdevs-group/dexsport-ui` is a 2021 UI-component library. None read beyond the file listing. | H |
| Press | Coinpedia: API "not mentioned"; Crypto Daily x3: API not mentioned | M |
| robots.txt / llms.txt / sitemap.xml | 403 Cloudflare challenge | H |
| Endpoints for markets, prices, books, trades, resolution; rate limits; websocket | NOT FOUND (searched: dexsport.io docs/robots/llms/sitemap, docs subdomain, GitHub user/search, CoinGecko links, two extended web searches, six press/review articles). The web app certainly has a private backend; it is not documented and is behind Cloudflare. | H absence |

I did not try to find the private frontend API (would need a browser session or defeating the challenge).

## 5. Trade path: **none documented**

- Only the web UI (wallet-connect / email / Google / Telegram login, then bet from account balance). No documented REST/WS order API, no signed-order scheme, no on-chain market contracts, no SDK/MCP/CLI.
- Wallet-connect login implies a message signature for session auth (L, standard pattern; not verified).
- PayBox reachability: **no** for trading. Chains Dexsport mentions (BNB 56, Polygon 137, Avalanche 43114, Ethereum 1) are all in PayBox's catalog (`docs/research/06-paybox-platform.md` section 5, H 2026-10-19), so a PayBox EVM transfer to a Dexsport deposit address is conceivable as a *funding* step. But the deposit address comes from a logged-in account UI, bets are placed from an off-chain account balance, and no signed-order or proposal interface exists. Nothing an agent can drive through `use_plugin` proposals or `request_wallet_sign`.

## 6. Fees

- No separate per-trade fee; cost is in the price: "Yes and No pairs typically total 101 to 102 cents, roughly 1% to 2% of the stake" (Crypto Daily 2026-09, M). Payer: the bettor, via overround. Formula: none published.
- Sportsbook margins for context (not prediction markets): avg ~5% (Coinpaper 2026-05-19, M); ~7.5% soccer/basketball pre-match, 7-8.7% live (cryptobetting, M).
- Deposits/withdrawals: network fees only; withdrawal minimum $10; deposit minimums vary by coin (cryptobetting, sportsbook-era, M). Prediction-specific fees: NOT FOUND (searched: Coinpedia, Crypto Daily, review pages; Dexsport ToS unreadable).

## 7. Resolution and dispute risk

- "The Dexsport team validates results, within 24 hours of the event. No oracle is named" (Crypto Daily 2026-09, M). Each market page publishes resolution criteria (Coinpedia and Crypto Daily, M).
- Fully operator-controlled; no on-chain oracle, no dispute window or bond documented (NOT FOUND, searched same sources).
- Counterparty/withdrawal risk: the operator is also the market maker (pool pays winners). Cryptobetting cites Trustpilot 3.5/5 with "recurring user complaints about withdrawal refusals and blocked accounts" and a wagering requirement to unlock withdrawals (M, sportsbook-era). For an arbitrage leg this means resolution-divergence, void/cancel and withdrawal-refusal risk on top of the 1-2% spread.
- Security: CertiK and Pessimistic Security audits are claimed in press (M); reports not located; scope (prediction product vs older contracts) unknown.

## 8. Liquidity sharing and independence

- Claimed volumes (Dexsport figures via press, undated within Aug-Sep 2026, unverified): 2028 Republican nomination market "over $60 million"; 2026 Formula 1 Drivers' Championship "over $13 million" (Coinpedia, Crypto Daily, M).
- Same questions on Polymarket today (H, `gamma-api.polymarket.com/events?slug=...`, 2026-10-19, fixture `polymarket_same_titles_crosscheck.json`): "Republican Presidential Nominee 2028" volume $713.5M, liquidity $51.1M; "F1 Drivers' Champion" (2026) volume $204.4M, liquidity $1.9M. So Dexsport's claimed volumes are roughly 8% and 6% of Polymarket's on matching questions.
- Whether Dexsport prices are fed from, hedged on, or bear any relation to Polymarket: NOT FOUND. Title and series overlap (2028 GOP nominee, F1 champion, BTC/SOL up-or-down at 5-minute-to-daily cycles) suggests Polymarket-style catalogue sourcing (L/M inference). Counterparty is Dexsport's own pool shared with sportsbook and casino (M), not Polymarket and not a peer book.
- Consequence: **not an independent arbitrage leg**. Either its quotes follow external venues (no new information) or they are a house-set price with capacity capped by pool/bet limits (limits NOT FOUND) and no way to read or execute them programmatically.
- Token-level liquidity (H, CoinGecko 2026-10-19): DESU price $0.01965, market cap $10.81M, 24h volume $20.5K, 550M circulating. DefiLlama `protocol/dexsport` and `summary/dexs/dexsport` returned HTTP 400 (slug not matched; not searched further). TVL / pool size / OI: NOT FOUND.

## 9. Geo / ToS / automation

- Licence: Anjouan Gaming License, number ALSI-202508043-FI2 (cryptobetting review, M; not checked against the Anjouan register); operator Dexapp LTD (Coinpaper, M). The review says the site had no licence when first reviewed. Whether it covers prediction markets: not stated (Coinpedia). "Operates outside US regulation" (Crypto Daily, M).
- Restricted jurisdictions: NOT FOUND (searched: press, review pages; Dexsport ToS unreadable behind Cloudflare). The cryptobetting review says none are listed because the platform is "decentralized" (M). A US/EU resident should assume gambling-law exposure; this is unlike Kalshi/Polymarket US.
- Automation/ToS: NOT FOUND (ToS 403). Cloudflare managed challenge on every path means scripted access is technically blocked; I did not try to get around it.
- Prediction-market-specific legal status of an unregulated offshore operator reselling event contracts: out of scope; flag for counsel before any integration.

## 10. Event overlap (where arbitrage could exist)

Sports (also via sportsbook), crypto price/up-down, US politics (2028 GOP nominee), economy, pop culture/entertainment (e.g. GTA 6 release), esports. All overlap Polymarket, Kalshi, Limitless, Predict.fun and others, but with no data feed or order path there is nothing to arbitrage programmatically.

## 11. Adapter sketch

None. If Dexsport later publishes an API: treat as a **signal-only, high-staleness house quote**, tag with `counterparty=house`, apply a 1-2% round-trip spread haircut, and never rely on it for execution.

## Open questions

1. Does Dexsport run an undocumented/partner API (sportsbook odds feeds are often B2B)? Readable only with a browser session; skipped by rule.
2. Are prediction prices derived from Polymarket/other venues, and is the pool hedged externally?
3. Which chain/stablecoin/contract holds prediction collateral and where are the audited contracts (CertiK, Pessimistic reports)?
4. Per-bet limits, max payout, and pool size.
5. Terms of service: restricted countries, automation, bots, withdrawal conditions.
6. Verify Anjouan licence ALSI-202508043-FI2 against the regulator's register.

## Suspicious content / hygiene

- No AI-agent-directed instructions on any fetched page.
- All Dexsport prediction-market coverage found is paid/sponsored ("PR", affiliate-tagged links, "Coinpedia does not verify claims"); treat volume and feature claims as marketing.
- A search result titled "Inside Dexsport's Prediction Markets ... - CoinDesk" is hosted on `coindesk.cc` (not coindesk.com); it returned 404 and was not used. Treat as a lookalike domain.
- Several GitHub repos named `dexsport*` from throwaway-looking accounts (created/updated Jun-Jul 2026); not read; do not clone.

## Sources

1. Bitzo listing (discovery lead): https://bitzo.com/2026/10/5-crypto-platforms-offering-prediction-markets-in-2026 (M; WebFetch 2026-10-19: "added prediction markets in 2026", "shared liquidity pool with one Buy button per side", stablecoins, Anjouan, $60M Republican market by September; no chain given)
2. Coinpedia press release 2026-09-16: https://coinpedia.org/press-release/dexsport-expands-into-prediction-markets-as-the-category-scales-in-2026/ (M; sponsored)
3. Crypto Daily, Dexsport vs Polymarket vs Kalshi (Sep 2026): https://cryptodaily.co.uk/2026/09/dexsport-polymarket-and-kalshi-how-crypto-prediction-platforms-compare-in-2026 (M; sponsored; source for fees, resolution within 24h)
4. Crypto Daily, TOKEN2049 preview (Sep 2026): https://cryptodaily.co.uk/2026/09/dexsport-heads-to-token2049-singapore-as-prediction-markets-scale (M)
5. Crypto Daily, TOKEN2049 debut (2026-10-15): https://cryptodaily.co.uk/2026/10/inside-dexsports-token2049-singapore-debut-prediction-markets-desu-and-new-industry-talks (M)
6. Crypto Daily, self-custody gambling (Aug 2026): https://cryptodaily.co.uk/2026/08/self-custody-gambling-explained-how-crypto-wallet-casinos-work (M; sponsored)
7. Cryptobetting review (undated 2026): https://www.cryptobetting.com/reviews/dexsport/ (M; licence number, margins, chains, complaints)
8. Coinpaper review 2026-05-19: https://coinpaper.com/17142/dexsport-review-web3-sportsbook-and-casino-for-crypto-first-players (M)
9. Dexsport docs "About" (not fetchable, 403 Cloudflare; content only via search summary): https://dexsport.io/docs-about/ (M)
10. CoinGecko API (H, 2026-10-19): https://api.coingecko.com/api/v3/coins/dexsport?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false
11. Polymarket gamma API cross-check (H, 2026-10-19): https://gamma-api.polymarket.com/events?slug=republican-presidential-nominee-2028 and ...?slug=2026-f1-drivers-champion
12. GitHub API metadata: `gh api users/DEXSPORT`, `gh search repos dexsport` (H)
13. Repo context: `docs/research/06-paybox-platform.md` (PayBox chain catalog 2026-10-19), `docs/research/14-platform-of-platforms.md` (CoinGecko prediction-markets category listing)
