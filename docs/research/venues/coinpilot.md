# Coinpilot - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server date of probes: 2026-10-19). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts. No accounts, no keys, no POST, nothing paid (one HTTP 402 from DefiLlama's paid API was recorded and not paid).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" means the thing is not documented.

Note on method: the WebSearch budget for the session ran out after the first query, so discovery of third-party coverage is thin. Everything below rests on Coinpilot's own docs/site, its GitHub org, DefiLlama's free `/protocol` endpoint and Polymarket's public builder leaderboard.

Fixtures (<= 50 KB each): `docs/research/fixtures/coinpilot/` (listed in section 12).

---

## 0. Bottom line

1. **Live, but it is a copy-trading frontend, not a market venue.** It has no markets, no order book, no settlement and no oracle of its own. Prediction-market execution is Polymarket's CLOB; perps/stocks are Hyperliquid. (H, docs FAQ + about page)
2. **Liquidity is 100% Polymarket (and Hyperliquid for perps).** It is NOT an independent arbitrage leg. Every Coinpilot prediction trade is a Polymarket trade carrying a Coinpilot builder code, so an arb scanner sees the same book through the Polymarket adapter.
3. **Polymarket flow through Coinpilot is tiny and fading.** Polymarket's public builder leaderboard (2026-10-19) shows Coinpilot at $3.83M all-time volume (474 users), $44.6K over the MONTH window (45 users), $288 over WEEK (20 users), $56 over DAY (5 users). (H data, M interpretation: assumes all Coinpilot orders carry the builder code.) The site's "$250M+ volume" claim (H as a claim, self-reported) must therefore be mostly Hyperliquid perps and Lite memecoins.
4. **No public read API, and the only API is Hyperliquid-only, authenticated and unsafe.** `api.coinpilot.bot` answers 401 to unauthenticated GETs; its documented routes cover Hyperliquid copy-trading only and require the wallet private key in an HTTP header. Do not integrate.
5. **adapter_priority = skip.** Duplicate liquidity, no useful public data, an extra 1% fee layer. The only value is conceptual: copy-trader flow is a (weak) sentiment signal on Polymarket, but it is better read directly from Polymarket's own public data and builder attribution than from Coinpilot.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://coinpilot.com/ fetched 2026-10-19 | HTTP 200, Netlify, product copy "Copy winning traders and strategies across Crypto, Memecoins, Stocks, and Prediction Markets"; claims 10,000+ users, $250M+ volume traded | H (claims self-reported) |
| Docs sitemap (https://docs.coinpilot.com/sitemap-pages.xml) | 73 pages, most recent `lastmod` 2026-10-06 | H |
| Docs mention Polymarket V2 upgrade | "Accounts set up before April 28, 2026 may hit an unexpected exchange error because Polymarket's V2 upgrade retired the old wallet system" (https://docs.coinpilot.com/resources/faqs/prediction-faq) | H |
| Terms of service | "Last updated February 28, 2026" (https://coinpilot.com/terms-of-service) | H (via page summary) |
| App Store listing | https://apps.apple.com/us/app/coinpilot/id6747697788 returns 200; version 3.0.2; seller "Coinpilot Limited"; release notes mention "Coinpilot Lite" memecoin copy trading | H |
| DefiLlama | https://api.llama.fi/protocol/coinpilot: id 7271, category "Interface", tag "Hyperliquid Builder", chain "Hyperliquid L1", dimensions `derivatives`/`fees` = `coinpilot-perps` only. No TVL. | H |
| Polymarket builder leaderboard | Coinpilot builder present, non-zero activity every window (see section 8) | H |
| Token / airdrop | A third-party tracker said no token confirmed as of March 2026 (https://airdrops.io/coinpilot/) | L (stale, not re-verified) |

Verdict: **still_live = true** as an app. The Polymarket copy-trading feature is live but its volume today is near zero.

---

## 2. Kind and market model

- **Kind (H):** non-custodial copy-trading app / broker-style frontend. Terms: "not a broker, custodian, or intermediary" (https://coinpilot.com/terms-of-service). Products: **Pro** (Hyperliquid perps, Hyperliquid stock perps, Polymarket prediction markets) and **Lite** (memecoin copy trading of FOMO and Pump.fun traders). Lite and Pro share a login but keep separate wallets and balances (https://docs.coinpilot.com/getting-started/welcome.md via llms.txt; wallet FAQ).
- **Market model (H):** none of its own. For prediction markets it mirrors positions of chosen Polymarket wallets; "All Polymarket markets are supported" (prediction FAQ). Outcome tokenisation, binary/categorical/neg-risk structure and the CLOB are Polymarket's. See the Polymarket venue spec (covered by a parallel workflow).
- **Copy mechanics (H, https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/pro-copy-trading/prediction-market/copy-trade-settings.md):** user picks a lead wallet, a budget (10/25/50/Max or custom amount), and a sizing mode, Fixed amount or Fixed ratio, with an optional per-trade cap. Min allocation per copy is $10, max 9 leaders in parallel (prediction FAQ). Execution is by a "Smart Execution Engine" that "optimizes for price and slippage"; no latency, order type (limit vs market/FOK) or slippage parameters are documented (NOT FOUND: searched prediction FAQ, copy-trade-settings, prediction-market overview).
- **Lead-trader universe (H):** public Polymarket wallets, "verified and indexed" by Coinpilot before they can be copied; tabs AI Picks / Category / All Traders / Watchlist. Ranking metrics are not documented (https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/discover-pro-traders/prediction-market.md).

---

## 3. Chains and collateral

| Leg | Chain / asset | Source | Tag |
|---|---|---|---|
| Prediction (Polymarket) | **Polygon**, **pUSD** held internally, withdrawn as **USDC.e on Polygon** | https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/deposit-and-withdraw.md; the prediction overview page still says "USDC.e on the Polygon network" (stale vs. pUSD) | H (inconsistent docs) |
| Crypto perps / stock perps (Hyperliquid) | **Arbitrum** USDC deposit and withdraw | same page; quickstart step 2 "Deposit USDC on Arbitrum" | H |
| Lite (memecoins) | Deposit networks: Solana, Base, BNB Chain, Ethereum, Arc, Robinhood Chain | https://docs.coinpilot.com/resources/faqs/wallet-faq.md | H |
| Funding rails | Relay (crypto deposits, automatic routing to pUSD / Arbitrum USDC) and Onramper (card/bank, Onramper does KYC) | deposit-and-withdraw page | H |

- Wallets: created via **Privy** at email sign-up; one Primary wallet plus up to 9 sub-wallets (index 1-9) that execute copy trades; private keys exportable (wallet FAQ, general FAQ, OpenClaw skill page). H
- Withdrawal minimum $10, about 5 minutes. Funds in open positions or copy allocations cannot be moved between Crypto and Prediction balances. H
- Polymarket US is NOT FOUND in Coinpilot docs (searched: general FAQ, prediction FAQ, deposit page).

---

## 4. Read API

**Verdict: none usable. `exists = official-authenticated` for a Hyperliquid-only API; nothing for prediction markets.**

- Official docs have no API/developer section ("No dedicated section" on the docs home; llms.txt index lists no API pages). H (https://docs.coinpilot.com/llms.txt, saved as fixture).
- The only API documentation is in the vendor's agent-skill repo: `coinpilot-labs/skills`, folder `coinpilot-hyperliquid-copy-trade`, file `references/coinpilot-api.md` (repo created 2026-02-07, last push 2026-03-11, 1 star; 7 months old, possibly stale). H via `gh api`.
  - Base URL `https://api.coinpilot.bot`; root returns `200 [production v0.0.1] OK` (H, probe).
  - **Auth for all routes:** headers `x-api-key`, `x-user-id` and **`x-wallet-private-key` (the primary wallet's raw private key)**; write routes also put follower/primary private keys in the JSON body. The `apiKey` is "experimental" and obtained "through Coinpilot support or by opening a ticket in the official Coinpilot Discord". Rate limit 1 request/second, 1 concurrent. H (as documented by the vendor)
  - Unauthenticated probe: `GET /lead-wallets/metrics/categories?limit=1` -> **HTTP 401 `{"error":"UNAUTHORIZED"}`** (H, fixture `unauth_probes_2026-10-19.txt`). No public response shape could be confirmed.
  - Documented routes (all Hyperliquid perps): `GET /lead-wallets/metrics/wallets/:wallet`, `/lead-wallets/metrics/categories[/:category]` (periods `perpDay|perpWeek|perpMonth|perpAllTime`), `GET /users/:userId/subscriptions`, `PATCH|POST /users/:userId/subscriptions/...`, `POST /experimental/:wallet/subscriptions/start|stop`. None covers Polymarket; the OpenClaw skill page says prediction-market copy trading is "available in the Coinpilot mobile app, with OpenClaw support coming later" (https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/pro-copy-trading/openclaw-coinpilot-skill.md). H
- No websocket. NOT FOUND (searched: docs llms.txt, skill repo references, SKILL.md).
- No prediction-market endpoints, no market/price/book/trade/resolution endpoints at all. Coinpilot does not host any of those.
- **What an aggregator should use instead:** Polymarket's own public APIs (Gamma, CLOB, data-api), including `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=DAY|WEEK|MONTH|ALL&limit=50&offset=N` (public, no key; H, response shape in fixtures) to track Coinpilot-attributed volume by builder code `0xb23e2d44...a3c`. Builder-code attribution is documented at https://docs.polymarket.com/programs/builders/overview.md.

---

## 5. Trade path

- **For users (H):** in-app only. Email sign-up (Privy), deposit, pick a lead wallet, set budget; Coinpilot's backend places the copied orders. Terms: "Users authorize Coinpilot to use API keys and API-based infrastructure to execute trades on their behalf" (https://coinpilot.com/terms-of-service). The exact signing delegation between the Privy wallet and Coinpilot's order service is NOT FOUND (searched: wallet FAQ, terms, prediction FAQ).
- **Programmatic (H):** none for prediction markets. The experimental Hyperliquid API needs a support-issued key and sends raw private keys in headers/bodies. This is not something to wire into a PayBox flow.
- **Order placement for an arb leg should go to Polymarket directly** (CLOB V2 signed orders), not through Coinpilot: Coinpilot adds a 1% fee, a "smart execution" layer with undocumented behaviour, and cannot be driven by a third-party agent.

---

## 6. Can a PayBox EVM wallet use it? (`paybox_reachable = no`)

- There is no contract or order-signing endpoint to point a PayBox wallet at. Coinpilot is an email/Privy-account app with server-side order execution; a PayBox wallet cannot create a copy subscription (the app UI is the only path for Polymarket).
- A PayBox wallet could technically send USDC to a Coinpilot deposit address (Arbitrum for Hyperliquid, Polygon via Relay for the prediction balance), which only funds the account; no trading follows from that and it would hand funds to a third-party-controlled order service. Pointless for arbitrage.
- Polymarket itself (Polygon, pUSD) is the reachable leg; see the Polymarket spec.

---

## 7. Fees (H, https://docs.coinpilot.com/resources/fees.md and terms)

| Venue | Coinpilot fee | Other |
|---|---|---|
| Prediction (Polymarket) | **1% of each successfully executed copied trade** (terms: "1.0% per transaction") | Polymarket's own fees are separate and additive. Whether the 1% is collected as a Polymarket builder fee is NOT FOUND (searched: Coinpilot fees page, terms); Polymarket builder fees are flat % of notional and stack on platform fees (https://docs.polymarket.com/programs/builders/fees.md). M |
| Hyperliquid perps / stock perps | 0.05% of trade size on open/increase/close/decrease; $1 one-time account activation (goes to Hyperliquid); Hyperliquid fee up to 0.045% | The page's own example ($1,000 trade -> about 0.08%) uses ~0.03% HL rate, inconsistent with the table. |
| Lite | $0.10 for $1-$49, $0.95 for $50-$200, 0.5% above $200; plus a separate "network fee" of unstated amount | |
| Performance / management fee | None ("you keep 100% of your gains") | |
| Gas | "Coinpilot currently pays blockchain gas fees for users" (terms) | Relay and Onramper charge small deposit fees. |

Arb implication: a copy-routed Polymarket fill costs 1% extra on top of Polymarket fees. That alone removes most cross-venue edges.

---

## 8. Liquidity (all as of 2026-10-19)

| Metric | Value | Source | Tag |
|---|---|---|---|
| Polymarket volume attributed to Coinpilot builder code, ALL | $3,827,221.65, 474 active users, leaderboard rank 96 | `data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL` (fixture) | H (data), M (assumes all orders carry the code) |
| MONTH window | $44,638.50, 45 users, rank 114 | same, `timePeriod=MONTH` | H |
| WEEK window | $287.51, 20 users, rank 148 | same | H |
| DAY window | $55.85, 5 users, rank 90 | same | H |
| Top builder for scale (betmoar) | ALL $2.34B (4,006 users); MONTH $78.5M | same | H |
| Self-reported total | "10,000+ users", "$250M+ volume traded" (all products, no date) | https://coinpilot.com/ | M (self-reported, undated) |
| DefiLlama TVL | none (empty arrays) | `api.llama.fi/protocol/coinpilot` | H |
| DefiLlama perps volume/fees for `coinpilot-perps` | NOT RETRIEVED: `api.llama.fi/summary/derivatives/...` returned **HTTP 402** "Upgrade to the paid API plan"; requirement recorded, not paid. Free `summary/fees/coinpilot-perps` returned 400 (not found). | probes (fixture) | H |

The MONTH vs WEEK ratio (about 155x) suggests Polymarket copy flow has all but stopped in the last week; window semantics (rolling vs calendar) are not documented by Polymarket in what I read, so treat as M.

---

## 9. Resolution mechanism and dispute risk

- Coinpilot resolves nothing. Outcomes resolve through Polymarket's oracle process (see the Polymarket spec). Coinpilot positions stay "Current" until settlement and redemption; after stopping a copy they can show "Pending Close" until Polymarket finalises (prediction FAQ, H).
- Coinpilot-specific risks (H unless noted):
  - Terms disclaim execution guarantees and liability for "execution errors or protocol failures"; Section 7 flags smart-contract and oracle risk for prediction markets. Governing law Hong Kong, binding English-language arbitration, class-action waiver.
  - The Polymarket V2 migration broke wallets created before 2026-04-28 until each user ran "Troubleshoot Polymarket Wallet" manually ("a one-time manual step that only the user can complete").
  - If the allocation is fully deployed, new copied trades "may be skipped" (so Coinpilot flow is not a clean mirror of the leader).

---

## 10. Geo, ToS, automation

- Prediction access follows Polymarket's regional rules: in restricted regions the app shows "Prediction Market is not available in your region"; crypto perp copy is unaffected (H, https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/pro-copy-trading/prediction-market.md). The prediction FAQ links Polymarket's geographic-restriction page (see Polymarket spec).
- ToS (Feb 28, 2026, H via page summary): 18+; "illegal use is prohibited"; no named prohibited-jurisdiction list; no rules on users' own bots, third-party API use or scraping; operating entity named only "Coinpilot" in the text, App Store seller "Coinpilot Limited"; two contact addresses shown inconsistently (text vs link), so verify before relying on either.
- Operating entity, regulatory status and KYC: NOT FOUND in docs (searched: general FAQ, about page, terms). Card/bank deposits go through Onramper, which does its own KYC.
- Automation: Coinpilot's only agent surface is an OpenClaw skill for Hyperliquid, which requires a credentials file containing wallet private keys. Not suitable for PayBox (which must never expose raw keys).

---

## 11. Event categories and overlap

- Coverage = all of Polymarket (politics, sports, crypto, finance/macro, culture), so overlap with Kalshi, Limitless, Predict.fun, Opinion etc. is exactly Polymarket's overlap. H (prediction FAQ) for "all Polymarket markets".
- **Shares liquidity with: Polymarket (prediction leg) and Hyperliquid (perp/stock-perp leg).** Not an independent arbitrage leg. The Hyperliquid leg is perpetual futures, not event contracts.
- Signal value: a copy-trading app aggregates the positions of top Polymarket wallets, but Coinpilot's rankings ("AI Picks") are in-app only and the lead-trader data it uses is public Polymarket wallet data (about page: "Polymarket wallets' trades, positions, and historical performance are publicly visible"). Better to read that straight from Polymarket's data API than to depend on Coinpilot.

---

## 12. Fixtures

In `docs/research/fixtures/coinpilot/`:

| File | What it is |
|---|---|
| `docs_llms_txt_2026-10-19.txt` | Coinpilot docs index (`https://docs.coinpilot.com/llms.txt`), 12.8 KB; shows there are no API pages |
| `defillama_protocol_coinpilot_2026-10-19.json` | `GET https://api.llama.fi/protocol/coinpilot` (category Interface, Hyperliquid Builder tag, no TVL) |
| `polymarket_builders_leaderboard_ALL_offset50_limit50_2026-10-19.json` | raw page of Polymarket's public builder leaderboard containing the Coinpilot row (rank 96) |
| `DERIVED_coinpilot_builder_volume_2026-10-19.json` | DERIVED: the Coinpilot row for DAY/WEEK/MONTH/ALL, plus the top builder for scale |
| `unauth_probes_2026-10-19.txt` | `api.coinpilot.bot` 401 and root 200, plus the DefiLlama 402 body (not paid) |

---

## 13. Adapter recommendation

**skip.** Reasons: (a) not a venue, no markets of its own; (b) liquidity fully shared with Polymarket (and Hyperliquid), so zero independent price discovery; (c) no public API for prediction data, the only API is Hyperliquid-only and requires private keys in headers; (d) 1% extra fee on the prediction leg; (e) Polymarket flow through it is about $44.6K/month and falling.

If ever revisited: do not build a Coinpilot adapter; instead add the Polymarket builder-leaderboard endpoint to the Polymarket adapter's "who routes flow" diagnostics, and treat copy-trader positions as a signal obtained from Polymarket's data API.

## 14. Open questions

1. Does Coinpilot attach its builder code to every Polymarket order, and is the 1% fee implemented as a Polymarket builder fee? (Not documented.)
2. Exact delegation scheme between the Privy wallet and Coinpilot's order service (server-held API creds vs. delegated signing). Not documented.
3. Coinpilot-side perps/stock-perps volume (DefiLlama dimensions are behind a paid API). Not retrieved.
4. Whether the sharp WEEK vs MONTH drop reflects seasonality, a feature outage after the V2 migration, or an app-level change. Unknown.
5. Terms and docs were summarised by a small model for several pages; the 1% prediction fee, pUSD routing and Privy statements were each cross-confirmed by at least two pages (terms + fees page; deposit page + prediction FAQ), but exact wording should be re-read before quoting.

---

## Sources

- https://coinpilot.com/ (H)
- https://coinpilot.com/terms-of-service (H via summary; last updated 2026-02-28)
- https://docs.coinpilot.com/llms.txt (H, fixture)
- https://docs.coinpilot.com/sitemap-pages.xml (H, lastmod 2026-10-06)
- https://docs.coinpilot.com/start-here/quickstart (H)
- https://docs.coinpilot.com/getting-started/about-coinpilot.md (H)
- https://docs.coinpilot.com/resources/faqs/prediction-faq (H)
- https://docs.coinpilot.com/resources/faqs/general.md (H)
- https://docs.coinpilot.com/resources/faqs/wallet-faq.md (H)
- https://docs.coinpilot.com/resources/fees.md (H)
- https://docs.coinpilot.com/resources/official-links.md (H)
- https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/deposit-and-withdraw.md (H)
- https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/pro-copy-trading/prediction-market.md (H)
- https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/pro-copy-trading/prediction-market/copy-trade-settings.md (H)
- https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/discover-pro-traders/prediction-market.md (H)
- https://docs.coinpilot.com/coinpilot-pro/coinpilot-pro/pro-copy-trading/openclaw-coinpilot-skill.md (H)
- https://github.com/coinpilot-labs/skills (README.md, coinpilot-hyperliquid-copy-trade/SKILL.md, references/coinpilot-api.md; read with `gh api`; repo metadata pushed_at 2026-03-11) (H)
- https://api.coinpilot.bot/ and /lead-wallets/metrics/categories (unauthenticated probes) (H)
- https://apps.apple.com/us/app/coinpilot/id6747697788 (H)
- https://api.llama.fi/protocol/coinpilot (H); https://defillama.com/protocol/coinpilot (403 to fetcher, not read directly); https://api.llama.fi/summary/derivatives/coinpilot-perps (HTTP 402, not paid)
- https://data-api.polymarket.com/v1/builders/leaderboard (public GET, H)
- https://docs.polymarket.com/programs/builders/overview.md and /fees.md (H)
- https://airdrops.io/coinpilot/ , https://play.google.com/store/apps/details?id=bot.coinpilot.app (search-result snippets only; Play page did not render) (L)
