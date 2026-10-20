# if.market (impact / "consequence" market) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.
Verdict: LIVE as an invite-only PAPER-MONEY beta. Not a real-money venue. Adapter priority: skip (revisit at mainnet / real-money launch).

## Summary
- [H] if.market is live (site, docs, API health all respond 2026-10-19). Tagline "Trade the impact. Before the outcome."; "the first consequence market". Source: https://if.market, https://beta.if.market
- [H] Product: for each real-world event it lists (a) a shared Yes/No prediction book (tokens pay $1/$0) and (b) per-asset synthetic "impact" order books inside the Yes world and inside the No world (e.g. Brent oil if US-Iran blockade ends vs if not). Source: https://eterna.gitbook.io/if.market/if.market/market-mechanics/market-structure.md
- [H] The current beta is INVITE-ONLY and uses PAPER funds: "Paper balance. No deposits or withdrawals." (frontend string) and "Paper funds have no monetary value and cannot be withdrawn". Source: https://eterna.gitbook.io/if.market/if.market/beta-program/beta-trial-and-competitions.md , https://eterna.gitbook.io/if.market/if.market/for-institutions/institutional-guide.md ("invite-only beta with paper funds")
- [H] Bots, scripts, API trading and other automation are explicitly prohibited in the beta trial rules. Same beta-trial page.
- [H] Only 2 events listed on 2026-10-19 (catalog fixture): "AI's Impact on Jobs & the Labor Market by 2027?" (market "10K AI horizon?", asset UNEMPLOYMENT RATE) and "US announces end of Iranian blockade by...?" (market "December 31", asset BRENTOIL). Source: GET https://api.alpha.if.market/api/v1/catalog (fixture).

## Kind and market model
- Kind: onchain-other per discovery, but evidence says it is a CENTRALIZED off-chain central-limit-order-book exchange with a central counterparty ("Every long is matched with a short ... accounting is closed: user balances, locked margin, and token collateral always sum to deposits"). NOT an on-chain protocol as far as any doc shows. [H] market-structure page.
- Hierarchy: Event > Market (variant/horizon/threshold, each resolves Yes/No/VOID independently, no fixed maturity) > Universe (YES / NO world) > per-asset CLOB; plus one shared prediction market (one Yes book + one No book) per market. [H]
- Impact assets are synthetic, cash-settled, linear exposure to spot at resolution, no funding rate, no delivery or custody. Orders: market/limit, GTC/IOC/ALO(post-only), reduce-only, attached TP/SL, slippage tolerance. [H] https://eterna.gitbook.io/if.market/if.market/using-the-exchange/trading-impact-markets.md
- Prediction tokens: Yes/No tokens pay $1 / $0; $1 mints a Yes+No pair, a pair merges back to $1; closing an impact position early converts P&L into prediction tokens (profit to same-side tokens, loss to opposite-side tokens). Tokens are internal account positions, not described as on-chain ERC-20s. [H] market-making + faq pages. [M] whether tokens are on-chain: NOT FOUND (searched: docs, llms.txt index, frontend bundle).
- Multi-outcome events are modelled as several binary markets under one event. [H]
- Assets enumerated by API 2026-10-19: BTC, BRENTOIL, UNEMPLOYMENT RATE (assetType "impact"); frontend also references ETH, SOL, GOLD, MSFT, GOOGL, HYPE, S&P500. [H] fixture assets.json; [M] frontend asset names.
- Pricing identity (the arbitrage hook): P(Yes)*price_if_Yes + P(No)*price_if_No = spot; platform does not pin prices, arbitrageurs do. [H] https://eterna.gitbook.io/if.market/if.market/market-mechanics/pricing-and-arbitrage.md

## Chains and collateral
- Collateral: "cash"/dollars single balance; stablecoin identity and chain NOT FOUND in docs (searched: all gitbook pages in llms.txt incl. collateral-and-margin, faq, account page; Galaxy article also says not named). In the beta it is paper money, no deposits/withdrawals. [H]
- Accounts: email + one-time code login (Privy-based per frontend API paths /auth/privy/session [M]); each user gets an auto-generated embedded "wallet address" and a "Safe address" smart account "that holds your funds". [H] https://eterna.gitbook.io/if.market/if.market/account-security-and-notifications.md
- Chain: NOT FOUND. Frontend contains an EIP-712 domain {name "IfMarket", version "1", chainId 998, verifyingContract 0x0} used for a signed-login/issuedAt message; chainId 998 is a login-domain constant and likely not a real settlement chain (zero verifying contract). [M] frontend chunk (assets/*.js on beta.if.market), not an official statement.
- Contracts / audits / TVL on any chain: NOT FOUND (searched: gitbook llms.txt, site bundle, Galaxy article). No GitHub org found.

## Read API
- Official public documented API: NONE FOUND (searched gitbook llms.txt full index: no API reference; institutional page says "contact the team"). [H]
- Undocumented frontend API, unauthenticated reads work: base https://api.alpha.if.market (the beta.if.market and alpha frontend both resolve their API origin to api.alpha.if.market per origins chunk; api.beta.if.market does NOT resolve; beta.if.market/api/* returns a Cloudflare 307). WebSocket path `/ws` on the same host (and `/realtime/health`). Cookie sessions (credentials: include), `/api/v1/auth/refresh`, `/api/v1/auth/privy/session`. [H for responses; M for intent: this is the website's own backend, unsupported]
- Public GETs confirmed (HTTP 200, JSON, CORS credentials on):
  - /api/v1/health -> {"status":"ok","writer_active":true,"blocked_reason":null}
  - /api/v1/status -> {"tradingMaintenance":{"enabled":false,...}}
  - /api/v1/catalog -> {items:[event{id,title,status,resolved,markets:[{id,title,criteria,status,resolution,resolved, assets:[{assetId,name,assetType,yesOutcomeId,noOutcomeId,listingPriceYes,listingPriceNo,settlementPriceYes,settlementPriceNo,nativeTickSize,allowedTickSizes,...}]}]}], nextCursor}
  - /api/v1/events, /api/v1/assets, /api/v1/volumes/24h, /api/v1/volumes/all-time
- Seen in frontend but NOT probed (likely need auth or are per-id): /api/v1/events/{id}, /api/v1/outcomes/{id} (probably the per-outcome book/price), /api/v1/events/{id}/messages, /api/v1/user/* (auth), /api/v1/orders/history (auth). Order-book / trades / candle endpoints: only inferred from chunk names (candleHistory, orders); exact paths NOT CONFIRMED.
- Auth/rate limits: NOT FOUND (no rate-limit headers seen on the 5 GETs). 
- Fixtures saved: docs/research/fixtures/if-market/{catalog,assets,volumes_24h,volumes_all-time,health}.json
- Note: prices in catalog are listingPrice (initial) only; live prices come from outcome books (not confirmed).

## Trade path
- Programmatic trading: NONE sanctioned. Automation/API trading prohibited in beta rules. [H] Trading goes through the web terminal with email login and an embedded wallet; no documented order-signing scheme. An unofficial session-cookie API exists but using it to trade would violate the stated rules.
- PayBox reachability: NO. Funds are paper; no deposit address, no chain, no on-chain order or transaction-proposal flow documented. A PayBox EVM wallet cannot deposit (there is nothing to deposit; "No deposits or withdrawals") and the account is custodied by an embedded Privy wallet + Safe created at email signup, not a user-supplied wallet. Revisit only if a real-money launch documents a deposit contract/chain.

## Fees
- Fees exist ("charged on the order, shown up front", per-order disclosure on the ticket); formula, maker/taker rates and who pays: NOT FOUND (searched: collateral page, trading-impact-markets, faq, institutional guide). Referral rebates "planned for the full release". Maker programs: "contact the team". [H]

## Resolution and dispute risk
- Two inputs: event outcome from per-market published Rules (criteria, named sources, timezone, void conditions), and resolve price from oracles (crypto composite indexes, commodity benchmark prints, official equity close, FX composite mids; staleness + outlier rejection; short TWAP window where timing is predictable). [H] https://eterna.gitbook.io/if.market/if.market/oracles-and-market-rules.md
- Who decides the event outcome: the team ("assessed against the published rules only" in a short verification window between announcement and settlement). No on-chain oracle/UMA-style dispute: centralized resolver risk. [H/M]
- Outcomes Yes / No / VOID. VOID pays every token $0.50; impact positions marked at void reference price. Winning universe settles in cash at spot; losing universe reverts margin. [H] settlement-and-resolution page.
- Doc inconsistency: docs state "No leverage, fully collateralized" (collateral, FAQ), while the Galaxy report (2026-10-15) says leverage up to 10x went live September 2026 on select markets with isolated margin and tiered caps. Treat leverage status as unresolved; likely docs lag. [H docs, M Galaxy]
- Example rule text, Iran blockade market: resolves Yes only if the US government publicly and officially announces end/suspension of the naval blockade between creation and the date, 11:59 PM ET; partial/limited announcements excluded. [H] catalog fixture.

## Geo / ToS / automation
- Invite-only (single-use codes via email/DM, waitlist form); team may limit/revoke at will. Jurisdictional restrictions "communicated during onboarding" - NOT FOUND publicly. [H]
- Beta rules: "Bots, scripts, API trading, and other automated trading are prohibited" (applies "unless otherwise announced"); manual terminal only; one account per person; legitimate arbitrage "from the pricing identity" is encouraged. [H] beta-trial page.
- Not financial advice / no securities offer; paper only. [H]

## Liquidity
- Real liquidity: none (paper money). Paper volumes from the unauthenticated API as of asOf 1792393200000 (= 2026-10-19T07:00Z): 24h total 6,420,884.87; all-time 27,051,697.62 (paper USD). Competition: 2,000+ traders, 6M+ trades, ended 2026-09-30, winners announced 2026-10-02; $20,000 cash prizes. [H API + docs; M Galaxy 2026-10-15 for trader/trade counts]
- No TVL/OI figures published. Books are described as thin in the unlikely universe. [H risk-guide]

## Event overlap (arbitrage relevance)
- Geopolitics (US-Iran blockade, overlaps Polymarket/Kalshi style Iran markets), macro (US unemployment, Fed/FOMC examples in Galaxy), crypto and commodities as the conditioned assets (BTC, Brent, gold, indices, MSFT/GOOGL). The prediction (Yes/No) book is the only leg directly comparable to other venues' binary prices; impact books are conditional-price instruments with no direct counterpart elsewhere (a Brent-futures basket would be the hedge). [M]
- Because the money is paper and trading is manual-only, there is no realisable cross-venue arbitrage today.
- Shares liquidity with another venue? No evidence; internal CLOB with its own CCP. Independent but paper. [M]

## Adapter notes (if it ever goes real-money)
- Signal value: the conditional-price spread (price_if_Yes - price_if_No) x odds = market-implied event impact on an asset; unique signal for the aggregator, "Quotient"-style cross-asset linking. Could be used as a read-only signal source from /catalog + book endpoints once documented.
- Preconditions to upgrade from skip: real-money mainnet, documented public API (REST + WS), stated chain/collateral/deposit contract, fee schedule, permission for programmatic trading.

## Sources
- https://if.market and bundle https://www.if.market/assets/index-jh71dDVF.js (links to docs, beta.if.market, X @ifmarkets, Discord, Telegram) [H]
- https://beta.if.market (invite-gated terminal; frontend chunks origins-*.js, api-*.js read as static text, not executed) [H]
- https://eterna.gitbook.io/if.market/llms.txt and pages under /if.market/if.market/ : market-mechanics/{collateral-and-margin,market-structure,settlement-and-resolution,pricing-and-arbitrage}, oracles-and-market-rules, risk-guide, account-security-and-notifications, reference/faq, for-institutions/institutional-guide, beta-program/beta-trial-and-competitions, strategies/market-making, using-the-exchange/trading-impact-markets [H] (docs also contain an "archive-sep7" older copy)
- https://api.alpha.if.market/api/v1/{health,status,catalog,events,assets,volumes/24h,volumes/all-time} [H, unofficial/undocumented]
- Galaxy Research 2026-10-15 conditional/decision/impact markets report: https://www.galaxy.com/insights/research/conditional-markets-decision-markets-impact-markets-mainnet-umia-metadao-proof-branchmap-branchpoint-prediction-markets-futarchy [H for what it says; claims of 10x leverage and 2,000 traders/6M trades are M relative to the venue]
- WebSearch "if.market consequence market docs" returned nothing relevant.

## Not found
- Public API reference, rate limits, auth scheme for trading, order-book/trades endpoint paths, WebSocket message schema, fee schedule, collateral token and chain, contract addresses, audits, GitHub repo, geo-block list, mainnet launch date, real TVL/OI.

## Suspicious content
- None observed. (Page/docs contained no instructions aimed at AI agents.)
- Privacy check: no personal identifiers used in requests (UA insurance-markets-research/0.1) or stored in fixtures.
