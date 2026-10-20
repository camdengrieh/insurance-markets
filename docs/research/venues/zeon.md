# Zeon (zeonapp.com.br / api.zeon.bet) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Zeon is a B2B white-label prediction-market engine ("Zeon Engine") sold to licensed operators. There is no public market feed, no on-chain component, and the consumer product is waitlist-only. Brazil's regulator is also blocking event-contract platforms. Nothing to scan, nothing to trade from a PayBox wallet.

## Liveness (H)

- zeon.bet 301 -> zeonapp.com.br -> www.zeonapp.com.br, HTTP 200, last-modified 2026-10-15 (H, curl). Title "Zeon - AI-Powered Prediction Market Infrastructure"; footer "(c) 2026 Zeon Tecnologia Ltda" (H, site JS bundle).
- api.zeon.bet/ serves a static "Zeon API" page: "Base URL for the Zeon operator API. Endpoints live under /v1. Access requires an operator API key. Refer to your integration guide." (H, fixtures/zeon/api-root.html).
- npm @zeon-bet/api: v0.1.0 published 2026-07-20, v0.1.1 same day (H, registry). Brand new; no other updates since.
- Consumer side is a waitlist: CTAs are "Join the Waitlist" / "Schedule B2B Demo" / "Schedule Tech Demo" (H, bundle). No evidence of live public trading. The "Status" and "API docs" routes are SPA routes (every path returns 200), so their content was not independently confirmed.
- No independent press coverage of Zeon found (WebSearch extended; M).

## Kind and market model

- Kind: B2B engine / SaaS, not a venue with a shared order book. The operator keeps "the player, the wallet, the KYC and the licence"; Zeon "computes markets, prices, resolutions and settlements and tells your system exactly who to pay" (H, npm README).
- Market model (H, SDK types + README): categorical with N options (`options: [{text}]`, create example is Yes/No), `odds: Record<optionId, number>`, `totalPool`, per-option `totalStaked`. Site says odds "initialize via AMM and adjust with volume" (H, bundle) and `buyShares` returns `shares`, `entryPrice`, `multiplier`. There is also a secondary limit order book: `placeOrder` with `side BUY|SELL`, `pricePerShare` 0.01-0.99, `getOrderbook` (H, types). So AMM primary plus peer order book of share resale. Pool-style payouts also appear (`lockedOdds`, gross payout then `payout * (1 - feeRateAtCreation)`), so it is partly parimutuel-like. Exact pricing formula: NOT FOUND (searched: SDK types, bundle, site; guide is "request from your Zeon contact").
- Markets are user-created per operator tenant ("any user can create a market", AI duplicate check via "Semantic Fingerprint"), so each operator's book is separate and isolated ("Multi-Tenant Isolation", H bundle).
- Outcomes are NOT tokenised. Positions are rows in Zeon's database (bet IDs, share counts); settlement is a ledger the operator pays out in its own wallet system (H, README).
- Site also advertises 5/10/15-minute up/down crypto markets on 30+ coins, plus indices (S&P 500, Nikkei), commodities and forex (H, bundle copy, marketing claim).

## Chains and collateral

- None. Currency is BRL (pricing in R$, "Show in R$/USD" toggle) with operator-side "player mirror balances" (`wallet.deposit/withdraw` are ledger mirrors) (H). The bundle mentions "Descentralizado ... peer-to-peer infrastructure with no central point of failure" as marketing, but no chain, token, contract or address is documented anywhere (NOT FOUND: searched bundle, README, SDK, npm metadata). Treat as M/L marketing only.

## Read API

- exists: **official-authenticated** (operator API key only).
- Base URL: https://api.zeon.bet (H). Docs: "request from your Zeon contact"; no public docs URL (H, README). Site has /api-docs and /operators/guide SPA routes, content not confirmed public.
- Auth: `Authorization: Bearer sk_test_...|sk_live_...`. Unauth GET /v1/markets returns 401 `{"error":{"code":"MISSING_API_KEY","message":"Authorization header required. Use: Authorization: Bearer sk_..."}}` (H, fixtures/zeon/api-v1-markets-unauth.json). /openapi.json, /v1/openapi.json, /docs return 404 (H).
- Endpoints seen in SDK 0.1.1 (H): GET/POST /v1/markets, /v1/markets/{id}, /v1/markets/{id}/orderbook, /bets, /settlements, /contest, /v1/trades, /v1/orders, /v1/oracle/resolve, /v1/categories, /v1/trends, /v1/users, /v1/treasury, /v1/usage, webhooks. All scoped to the operator's own tenant.
- Rate limits (H, pricing page in bundle): 60 req/min (Oracle tier), 200 req/min (Starter), 500 req/min (Pro). Pricing tiers $499 / $1,997 / $4,997 per month plus per-use fees.
- WebSocket: NOT FOUND (searched SDK, README). Webhooks (HMAC-SHA256, `X-Zeon-Signature`) are push to the operator, not a market-data stream.
- A public aggregator cannot read any market data without becoming a paying Zeon operator, and even then would only see its own tenant. The consumer web app calls a Firebase function (`us-central1-trendwager-69038.cloudfunctions.net/zeonApi`, H bundle) which is undocumented and was NOT probed.
- Fixtures saved: docs/research/fixtures/zeon/ (api-root.html, api-v1-markets-unauth.json/.headers, npm-package-meta.json, sdk-0.1.1-types.d.ts). No successful market response sample exists because there is no unauthenticated data endpoint.

## Trade path

Operator REST: `POST /v1/markets/{id}/buy-shares` (optionId, amount, externalUserId, idempotencyKey), `POST /v1/orders`, cancel order (H, SDK). It requires an operator API key and acts on behalf of operator-managed "players". No wallet signing, no on-chain transactions.

## PayBox reachability: no

An EVM/Solana wallet cannot trade Zeon via transaction proposals or signed orders; there is no contract or signature scheme. Only conceivable route is PayBox x402/service payments to Zeon for API access, and Zeon documents no x402 or crypto billing (invoices are monthly, BRL/USD; NOT FOUND for crypto). paybox_reachable = no.

## Fees

- Per-market `feeRate` stamped at creation, operator-configurable 0 to 0.5; winners paid `payout * (1 - feeRateAtCreation)`; `creationFee` 0-10000; creator revenue share 10/20/30% of platform fees by tier (H, SDK types + bundle). Default rate value: NOT FOUND.
- Operator pays Zeon: R$0.25/bet (Starter, 100k free) or R$0.20/bet (Pro, 250k free), R$7.50/R$6.00/R$4.95 per oracle resolution (H, bundle pricing).

## Resolution and dispute

AI "Oracle" with multi-layer, multi-source verification and "adversarial validation"; claims resolution in under 5 seconds (marketing, H bundle copy). Two `market.resolved` webhooks: announce (`PENDING_PAYOUT`, `payoutReleaseAt`) then settlement after a contestation window of 1-168 h (operator-configurable) (H, README + SDK). Void/contest flows exist. Risk: AI-resolved outcomes on operator-created ad-hoc markets, and the operator, not Zeon, pays winners ("asset-light", Zeon "does not take market risk"). Counterparty risk is on whichever operator you deposit with.

## Geo / ToS / automation

- Brazil: on 2026-04-24 the government declared prediction markets outside Law 14.790; CMN Resolution 5298 bars sports, political, electoral, entertainment and similar events as derivative underlyings; Anatel had blocked 28 event-contract platforms and promised more (H, igamingbusiness.com article, https://igamingbusiness.com/legal-compliance/compliance/brazil-prediction-markets-illegal/; the article does not mention Zeon). Zeon says its engine is for "licensed operators" and "region-agnostic" (H, bundle). Zeon's own regulatory status: NOT FOUND.
- ToS / automation rules: NOT FOUND (searched site bundle, README). API use is by definition automated but contract-gated.

## Liquidity

NOT FOUND. No volume, OI or TVL published anywhere (searched site bundle, README, WebSearch). Bundle has only pricing numbers (e.g. 100k-250k free bets/month tiers) which are plan allowances, not volume. Treat as ~zero public liquidity (M).

## Category overlap and independence

Marketing claims sports, politics, technology, entertainment, finance and 5-15 min crypto up/down. Overlap with other venues is theoretically broad (crypto price, sports), but each operator tenant has its own isolated liquidity, there is no public price feed, and prices come from an AMM of unknown depth. Shares liquidity with no other venue (not evidenced); not a usable independent arbitrage leg either.

## Open questions

- Does the consumer app (via the Firebase `zeonApi` function) expose any public market list? Not probed (undocumented host).
- Is there a live consumer product at all, or only the waitlist?
- Is "decentralized" real (any chain) or marketing?

## Sources

- https://www.zeonapp.com.br/ and its JS bundle /assets/index-CaNHSQkK.js (H, fetched 2026-10-19)
- https://api.zeon.bet/ , https://api.zeon.bet/v1/markets (401) (H)
- https://registry.npmjs.org/@zeon-bet%2fapi (README, versions 0.1.0/0.1.1, tarball types) (H)
- https://igamingbusiness.com/legal-compliance/compliance/brazil-prediction-markets-illegal/ (H, 2026-04-24)
- WebSearch "Zeon zeonapp.com.br prediction market Brazil" (extended): no independent coverage (M)
- GitHub: no zeon-bet org found (gh api users/zeon-bet 404).
- Privacy: all requests used User-Agent insurance-markets-research/0.1; npm maintainer contact details present in registry JSON were deliberately not copied into notes or fixtures.
