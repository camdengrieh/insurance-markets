# Liquid (liquid.trade) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **adapter_priority: skip.** Liquid is a non-custodial broker/front end. Its prediction markets are Hyperliquid HIP-4 outcome markets sold through a Hyperliquid builder code. It has no order book of its own, so it is **not an independent arbitrage leg**: any price on Liquid is a Hyperliquid HIP-4 price plus a 0.45-0.90% Liquid fee. It has no public market-data or trading API, and its Terms bar scraping.
- Integrate **Hyperliquid HIP-4 directly** (see `docs/research/venues/hyperliquid-outcomes-hip-4.md` if the parallel workflow has written it; fixtures already in `docs/research/fixtures/hyperliquid-outcomes-hip-4/`). Liquid adds nothing as a leg.
- Only residual value: a DefiLlama-sourced "retail flow through front ends" signal (about 1% of HIP-4 volume). That is not worth an adapter.

## 1. Is it live? (H)

- liquid.trade is live and the docs are current (docs.liquid.trade fetched 2026-10-19; Terms "Last updated: 09/17/2026"; changelog has an entry dated 2026-07-01). [H: https://www.liquid.trade/, https://docs.liquid.trade/llms.txt, https://www.liquid.trade/termsofservice]
- Prediction-market activity is live: Liquid-tagged HIP-4 outcome fills exist for 2026-10-10 to 2026-10-17 in Hyperliquid's own builder-fill archive. [H: fixtures `hl_builder_fills_liquid_*`]
- DefiLlama lists "Liquid Outcome" (id 9009, category Interface, chain Hyperliquid L1, `listedAt` 1791497909 = 2026-10-08). Parent protocol Liquid, with Liquid Perps, Liquid Spot and Liquid Outcome children. [H: https://api.llama.fi/protocol/liquid-outcome]
- Not to be confused with Liquid Brokers, liquidmarkets.org, or the former Quoine "Liquid" exchange. Liquid says it is unaffiliated with them. [H: docs.liquid.trade/account/security]
- Operator: LiquidX AI, Inc., a Delaware C-corp. [H: Terms] Funding: seed $7.6M (Paradigm, General Catalyst) and Series A $18M (2026-04, Neo, Left Lane Capital). [M: DefiLlama parent protocol `raises`; coincodecap review]

## 2. Kind and market model

- **kind: broker / front end / aggregator app** (perps, spot, stocks and FX perps, pre-IPO perps, prediction markets, Earn vaults, AI "Co-Invest" assistant). The Terms say it "do[es] not operate any exchange ... or prediction-market venue". [H: Terms]
- Docs: "Liquid routes each market to deep on-chain liquidity ... prediction markets, each routed to specialist on-chain venues", unified into one balance and one price feed. The venues are **not named** in the docs. [H: https://docs.liquid.trade/about-liquid/what-is-liquid.md]
- Evidence that predictions route to **Hyperliquid HIP-4** (H):
  - DefiLlama methodology for Liquid Outcome: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code". The config is `"liquid-outcome": { builder: "liquid-perps", market: "outcome" }`, builder address `0x6d4e7f472e6a491b98cbeed327417e310ae8ce48`. [M for the address: third-party config in DefiLlama/dimension-adapters `factory/hyperliquid.ts`; not stated on liquid.trade]
  - That address's public builder-fill file for 2026-10-17 contains 166 fills on HIP-4 outcome coins (`#134411` style) from 17 distinct users across 37 distinct coins, each carrying a `builder_fee`. [H: stats-data.hyperliquid.xyz archive, fixture `hl_builder_fills_liquid_20261017_outcome_rows_redacted.csv`]
  - Liquid's market format matches HIP-4: YES/NO prices from 1c to 99c, "whole-share sizes", GTC/IOC/Post-Only limit orders, and rolling 15-minute "Up Down" markets (HIP-4 recurring `priceBucket ... period:15m`). [H: Liquid docs predictions pages; HL contract-specifications]
- Not verified: whether Liquid also routes any prediction category to a non-Hyperliquid venue (its docs list Politics/Elections, Sports, Economics, "Live Games"). NOT FOUND (searched: docs.liquid.trade llms.txt + predictions/fees/FAQ pages, Terms, changelog, DefiLlama, web search). A third-party review says "the docs don't name the venue behind them" for predictions. [M: https://coincodecap.com/liquid-trade-review, dated 2026-09-23]
- **Market model (via HIP-4):** binary Yes/No (and bucketed multi-outcome "questions") in a central limit order book; Yes and No order books are merged so a buy of Yes at p equals a sell of No at 1-p. Each side is a spot-like token. Fully collateralised, no leverage or liquidation. Settles to `settleFraction` quote tokens per Yes and `1 - settleFraction` per No. [H: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md]
- Tokenisation (H, HL asset-ids doc): `encoding = 10*outcome + side`; coin `#<encoding>`, token `+<encoding>`, asset id `100_000_000 + encoding`. [https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids.md]

## 3. Chains and collateral

- Execution and settlement: **Hyperliquid L1 (HyperCore)**, quote token **USDC** (the official `settledOutcome` doc example shows `"quoteToken": "USDC"`). [H: HL info-endpoint docs; DefiLlama chain "Hyperliquid L1"]
- Liquid account balance is USDC. Most accounts are "unified" (one balance backs spot, perps, predictions). Non-unified accounts have a separate prediction balance. [H: docs account/move-funds, account/withdraw]
- **Deposits** by crypto from Bitcoin, Ethereum (min $50), Base, Arbitrum, Solana, Hyperliquid (HyperCore and HyperEVM), BNB Chain, Optimism, Polygon and Abstract (min $10), converted to USDC. Card, Apple Pay, Cash App, wire/ACH/SEPA (via Bridge, KYC for bank rails) also work. [H: https://docs.liquid.trade/account/deposit.md]
- **Withdraw** USDC to Arbitrum: $1 fee, min $5 ($1 for prediction balance), about 10 minutes. Other chains on iOS only "where available". [H: docs account/withdraw]
- Custody: non-custodial. Liquid creates a wallet per user (email/Google/Apple/passkey or "existing crypto wallet" sign-in), private key exportable, orders run through an approved agent trading key that "can place orders but can't withdraw". [H: docs account/security]. Whether signing in with an external wallet means that wallet itself holds the Hyperliquid account (vs an embedded wallet): NOT FOUND (searched: security, create-account, deposit, FAQ pages).

## 4. Read API

- **exists: official-authenticated (and only a chat/agent one).** No public REST/WebSocket market-data API for Liquid. Docs index (`llms.txt`, 51 pages) has no API reference page; its only developer page is the MCP one. NOT FOUND (searched: docs.liquid.trade llms.txt, FAQ, Terms, site footer, web search "Liquid liquid.trade API"). [H]
- The only programmatic surface is the **Co-Invest MCP server**: `https://coinvest.liquid.trade/mcp` (and `https://coinvest-computer.liquid.trade/mcp` for autonomous agents). Streamable HTTP, **OAuth 2.1 authorization code + PKCE, interactive browser sign-in on app.liquid.trade, "no API keys"**, scopes `read` and `trade`. Tool catalog is only visible after OAuth; docs mention "market analysis and search, news, technical indicators, portfolio, open orders, order execution, TP/SL, position management, prediction market orders, deposits, leaderboard, and referrals". [H: https://docs.liquid.trade/co-invest/developers.md, co-invest/co-invest-computer.md]
- Unauthenticated discovery confirmed 2026-10-19: `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` return 200 JSON (dynamic client registration at `/oauth/register`, PKCE S256); `/mcp` without a token returns 401 with `WWW-Authenticate: Bearer realm="mcp"`. [H: fixture `coinvest_mcp_oauth_discovery_2026-10-19.json`]. The CORS allow-list also names `x-liquid-key`, `x-liquid-secret`, `x-liquid-address`, `x-liquid-user-id`, `x-proxy-token`, `x-target-url` headers. These are undocumented internal headers; not used or probed. [H observation, meaning unknown]
- Rate limits for the MCP server: NOT FOUND.
- **Where the data really is:** Hyperliquid's public API (covered by the HIP-4 venue note): `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book` for coin `#<n>`, `settledOutcome`), `wss://api.hyperliquid.xyz/ws`; 1200 REST weight/min, 30 new WS connections/min, 2000 WS messages/min. [H: HL docs info-endpoint/spot, rate-limits page]. I did not POST in this task (read-only GET rule), so no live `/info` capture here; see the sibling fixtures for WS-captured shapes.
- Liquid-attributed flow is observable from Hyperliquid's public builder-fill archive: `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/<lowercase builder address>/<YYYYMMDD>.csv.lz4` (unauthenticated GET, about 100-300 KB per day, columns `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`). [H: HL builder-codes doc; fetched for 2026-10-10/13/14/16/17]

## 5. Trade path

- Liquid itself: **none programmatic without a human in the loop.** The route is the app, or Co-Invest MCP after an interactive OAuth login. In "Co-Invest Computer" automated mode an agent can place orders without per-order confirmation, within a per-order notional cap and an expiry of at most 7 days. Orders go through the user's Liquid agent wallet. No raw signed-order API is exposed. [H: co-invest docs]
- Underlying venue: Hyperliquid `POST /exchange` with EIP-712 L1-action signing (agent/API wallet allowed; `ApproveBuilderFee` must be signed by the main wallet). Outcome order API "similar to spot"; asset id `100000000 + 10*outcome + side`. [H: HL asset-ids and builder-codes docs; signing page not read in depth]
- **PayBox reachability: no for Liquid; yes in principle for Hyperliquid directly.**
  - A PayBox EVM wallet could send crypto to a Liquid deposit address (Base/Ethereum/Arbitrum/BNB/Polygon/Optimism/Solana all accepted), but cannot place Liquid orders: Liquid owns the trading wallet and the only automation is OAuth-gated MCP. Whether a PayBox-controlled wallet could be the Liquid login wallet is NOT FOUND. [M]
  - Direct Hyperliquid: PayBox has an official `hyperliquid` plugin that is browse-only for spot markets and not enabled for this account; no Liquid plugin or x402 service found (`discover_plugins` "liquid"/"hyperliquid", `discover_services` "liquid.trade" on 2026-10-19). [H] Repo notes record that `request_wallet_sign` supports EIP-712 `typedData` and that Hyperliquid (999) and Arbitrum are in PayBox's chain catalog. [M: docs/research/06-paybox-platform.md]. Feasibility of signing HL L1 actions via PayBox is a sibling-note question.

## 6. Fees

- **Prediction markets: 0.90% on buys and on sells, paid in USDC; 0.81% with a referral code** (10% off). Min trade $10, higher for some markets. [H: https://docs.liquid.trade/trading/fees.md, predictions/how-predictions-work.md]
- First-hand check of what is actually charged (H, HL builder-fill archive, Liquid builder address, 2026-10-17 outcome fills): effective builder fee per fill is **0.90% (37 fills), 0.81% (20), 0.67-0.68% (102) and 0.45% (7)**, on both Bid (151 fills, 0.712% of notional overall) and Ask (15 fills, 0.858%). The 0.81% matches the referral rate. 0.67-0.68% and 0.45% look like affiliate or tier discounts (0.75x and 0.5x of 0.90%) [M, inferred]. So the buy side is charged too, which differs from HL's generic spot rule that builder codes "do not apply to the buying side of spot trades". [H: HL builder-codes doc]
- A third-party review dated 2026-09-23 said "Opening is free, but selling or settling costs 0.9%". Current docs say both sides. DefiLlama's Liquid Outcome fee series only starts 2026-10-08. Treat the both-sides fee as new in October 2026 [M/L].
- Hyperliquid's own fee is on top of or alongside this. The official HIP-4 page says outcome fees are "currently zero" and builder fees apply to sell orders [H: HL HIP-4 page], but DefiLlama's Hyperliquid Outcomes methodology says Hyperliquid has charged outcome fees since 2026-08-15 [M: sibling fixture `defillama_hyperliquid-outcomes_summary_trimmed.json`], so the HL doc page is probably stale. Exact HL outcome fee formula: see the HIP-4 note.
- Round-trip cost for an arbitrage leg closed before resolution through Liquid: about 1.8% (0.9% each side) before HL fees and the spread. Whether a fee is also charged when a winning position settles is not stated in the docs (the review says it is). That alone kills most cross-venue edges. Other: $1 USDC withdrawal to Arbitrum; deposit-provider fees vary. [H]

## 7. Resolution and dispute risk

- Liquid has no resolution role. Terms: "Third parties govern account eligibility, KYC, event resolution, and disputes for those venues"; users may not trade where they can influence the outcome. [H: Terms]
- HIP-4 recurring markets resolve by protocol rule: BTC mark price (HyperCore), linear interpolation between mark updates around the settlement time, compared with `targetPrice`; periods 1d (06:00 UTC) and 15m. [H: HL contract-specifications.md]
- Permissionless deployers (announced 2026-07-19/20, preliminary): 500,000 HYPE stake for at least 6 months, slashable for poorly defined, mis-settled or more-than-7-days-unresolved markets; validators resolve against a pre-specified data source, **no dispute window and no token vote**. [M: https://www.techtimes.com/articles/321058/20260720/hyperliquid-opens-prediction-markets-any-builder-30-million-stake.htm; not confirmed in HL docs this session]
- Dispute risk for a user: concentrated in Hyperliquid validators and deployer market definitions, not in Liquid. Liquid dispute channel is JAMS arbitration (Delaware), liability capped at the lesser of $1,000 or fees paid. [H: Terms]

## 8. Geo, ToS, automation

- Terms bar residents, nationals or agents of Crimea, Cuba, Iran, North Korea, Syria and any country under US/UK/EU embargo, SDN-listed persons, and VPN evasion. **The US is not named as restricted**; a third-party review says the app is listed on the US App Store [M]. FAQ: "available globally, except in jurisdictions restricted under the Terms". No KYC to trade; KYC only for bank deposit rails. [H]
- Automation: bots and scripts are barred "in ways that exceed reasonable usage, bypass rate limits, cause denial-of-service conditions", and users "may not 'screen scrape' or otherwise use any automated means to access the Services or collect any information from the services, except to index the public-facing portions ... for a search engine". The sanctioned automation path is the Co-Invest MCP (incl. Co-Invest Computer for agents). [H: Terms, quoted sparingly]
- Regulatory status: operator says it is not an exchange, broker-dealer, sportsbook or prediction-market venue; a review found no licence held. [H Terms / M review]

## 9. Liquidity (all M unless stated)

- **Liquid-attributed HIP-4 outcome volume (DefiLlama, builder-code tagged, series ends 2026-10-17):** 24h $29,649; 7d $74,610; 30d $374,910; all-time $1,301,810 since 2026-06-22 (first non-zero day). Monthly: Jun $42k, Jul $734k, Aug $15k, Sep $333k, Oct 1-17 $178k. Builder fees: 24h $216, 30d $808 (series starts 2026-10-08). [H as to DefiLlama's numbers: https://api.llama.fi/summary/dexs/liquid-outcome and /summary/fees/liquid-outcome; fixtures `defillama_liquid-outcome_*`]
- Cross-check against the builder-fill archive for the same address: px*sz outcome notional $1.4k (10-10), $17.8k (10-13), $0.8k (10-14), $3.6k (10-16), $3.4k (10-17) vs DefiLlama's $16.8k, $18.4k, $3.1k, $6.4k, $29.6k. Only 10-13 agrees within 5%. DefiLlama may include other attribution (or a different day alignment), so treat Liquid volume as roughly $1-30k/day. [H for archive numbers, M for interpretation]
- For scale, all of Hyperliquid HIP-4: 24h $2.85M, 30d $43.9M, all-time $258M (DefiLlama via sibling fixture, to 2026-10-17). Liquid is about 1.0% of 24h, 0.85% of 30d and 0.5% of all-time. [M]
- Whole-Liquid scale (all products): "over $5B in trades" (docs), over 60,000 traders (review), about $3B cumulative at the April 2026 round. Not prediction-specific. [M/L]
- TVL: none (DefiLlama TVL fields empty; non-custodial interface). Open interest: not reported by Liquid.

## 10. Event-category overlap (where an arbitrage would exist)

- Liquid's prediction categories: Crypto, Stocks, Indices, Commodities, FX, Sports, Economics, Politics, Other; plus 15-minute "Up Down" markets. [H: docs]
- What HIP-4 actually lists (M, from sibling notes and press): BTC daily/15m price markets (recurring), a US CPI print market, World Cup match and outright markets (about 420 active markets at 2026-06-17). Politics depth on HIP-4 is not confirmed. [M: QuickNode 2026-06-17; Chainstack; oakresearch]
- Overlap with other venues: crypto price (BTC daily/15m on Polymarket, Kalshi, Limitless), macro (CPI/Fed on Kalshi, Polymarket), sports (World Cup on Polymarket/Kalshi). All of these are reachable through the underlying Hyperliquid book without Liquid's 0.9% fee. Use HL HIP-4 as the leg.

## 11. Liquidity sharing

- **Shares 100% of its liquidity with Hyperliquid HIP-4** (same order books; Liquid is a builder-code front end). It is not an independent leg. Do not double-count Liquid and Hyperliquid as separate venues in the scanner. [H for HIP-4 routing evidence in section 2; M for "100%", since other prediction venues behind Liquid were not ruled out]
- Siblings on the same HIP-4 books (builder-code front ends): outcome.xyz and many others in DefiLlama's `factory/hyperliquid.ts` (about 40 `-outcome` listings). [H: file read via gh]

## 12. Suspicious content / injection check

- None aimed at AI agents. Mintlify boilerplate at the top of each docs page ("Documentation Index ... Fetch the complete documentation index at llms.txt") is a normal docs feature and was only used to find pages. Docs and the review page contain referral links; not followed.
- Note: the shared scratchpad is used by parallel agents; another agent overwrote a scratch `llms.txt`, which was re-fetched into the fixtures directory under a unique name.

## Sources

- https://www.liquid.trade/ [H, 2026-10-19; via WebFetch summary]
- https://docs.liquid.trade/llms.txt and pages `trading/fees.md`, `predictions/how-predictions-work.md`, `predictions/trade-predictions.md`, `markets/markets-overview.md`, `about-liquid/what-is-liquid.md`, `account/{security,deposit,withdraw,move-funds}.md`, `co-invest/{developers,co-invest-computer}.md`, `faq.md` [H, curl, 2026-10-19]
- https://www.liquid.trade/termsofservice (last updated 2026-09-17) [H, raw HTML parsed]
- https://www.liquid.trade/changelog [H via WebFetch summary; latest entry 2026-07-01]
- https://coinvest.liquid.trade/.well-known/oauth-protected-resource, `/oauth-authorization-server`, `/mcp` (401) [H, unauthenticated GET]
- https://api.llama.fi/protocol/liquid-outcome, `/protocol/liquid`, `/summary/dexs/liquid-outcome`, `/summary/fees/liquid-outcome` [H for the numbers, M for what they mean]
- https://github.com/DefiLlama/dimension-adapters (`factory/hyperliquid.ts`, `helpers/hyperliquid-v2.ts`) read via `gh api` [M: third-party config for the builder address and methodology]
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/0x6d4e...ce48/{20261010,20261013,20261014,20261016,20261017}.csv.lz4 [H]
- https://hyperliquid.gitbook.io/hyperliquid-docs/ pages: HIP-4 outcome markets, trading/builder-codes, trading/contract-specifications, for-developers/api/asset-ids, info-endpoint/spot, rate-limits-and-user-limits [H]
- https://coincodecap.com/liquid-trade-review (2026-09-23; has affiliate links) [M]
- https://www.techtimes.com/articles/321058/20260720/hyperliquid-opens-prediction-markets-any-builder-30-million-stake.htm (2026-07-20) [M]
- https://www.quicknode.com/blog/world-cup-prediction-markets-are-live-on-hyperliquid-research-stream-trade (2026-06-17) [M]
- PayBox discovery (`discover_plugins`, `discover_services`), 2026-10-19 [H]
- Repo: docs/research/06-paybox-platform.md, docs/research/fixtures/hyperliquid-outcomes-hip-4/ [M, sibling work]

## Fixtures (docs/research/fixtures/liquid-liquid-trade/)

- `defillama_liquid-outcome_dexs_2026-10-19_trimmed.json`, `defillama_liquid-outcome_fees_2026-10-19_trimmed.json`: identity, methodology, totals, last 60 daily points.
- `hl_builder_fills_liquid_20261017_outcome_rows_redacted.csv` (166 outcome fills, user and counterparty redacted) and `hl_builder_fills_liquid_outcome_scan_summary.json` (5-day tallies, fee-rate histogram).
- `coinvest_mcp_oauth_discovery_2026-10-19.json`: OAuth metadata and 401 for the Co-Invest MCP server.
- `docs_llms_index_2026-10-19.txt`, `docs_trading_fees_2026-10-19.md`, `docs_how_predictions_work_2026-10-19.md`: Liquid docs as fetched.
- `hl_docs_hip4_outcome_markets_2026-10-19.md`, `hl_docs_builder_codes_2026-10-19.md`: Hyperliquid docs as fetched.

## Open questions

1. Does Liquid route any prediction category to a venue other than Hyperliquid HIP-4 (Politics/Elections, "Live Games")? NOT FOUND.
2. Why does DefiLlama's daily Liquid Outcome volume differ from the builder-fill archive on 4 of 5 sampled days? Possible extra builder addresses or different day alignment.
3. Exact Hyperliquid outcome fee (zero per HL docs vs charged since 2026-08-15 per DefiLlama) and whether Liquid's 0.90% includes or sits on top of it.
4. Whether the Co-Invest MCP tool schema exposes order-book depth or prices for prediction markets (visible only after OAuth; not attempted).
5. Whether a Liquid account can be bound to an external EVM wallet that PayBox controls.
