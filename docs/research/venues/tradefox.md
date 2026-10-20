# Tradefox (thetradefox.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = inferred, L = weak/stale.
Limitation: the shared WebSearch budget was exhausted, so no independent third-party sources (press, X, docs) were found. Everything below comes from the site's own HTML and its public JS bundles, plus the task hint.

## Verdict
Not a venue. It is a front-end / broker UI for Polymarket and Kalshi (copy-trading, portfolio, Privy embedded wallets). It has no market model, order book, resolution or liquidity of its own, and no public API or docs. Priority: skip (duplicate liquidity, no API).

## Summary
- Live: yes, site returns HTTP 200 (H, https://thetradefox.com). Root 307-redirects to /landing, which renders only the title "TradeFox" with no server-rendered text (H).
- Self-description: meta description "Prediction market aggregator and prime brokerage." (H, https://thetradefox.com/landing).
- Operator: assets are served from media.loch.one and the page loads Privy (auth), fun.xyz SDK, WalletConnect, PostHog (H, page HTML). Link to "Loch" is M (domain only).
- Not listed on predictionindex.xyz/ecosystem in the visible portion of the page (WebFetch truncated before the entry; T section visible without it). The "discovered via predictionindex" evidence is therefore unconfirmed by me (L).

## Kind and market model
- Kind: aggregator / broker front-end (M, inferred from JS).
- The bundle references exactly two underlying exchanges: `"polymarket"` and `"kalshi"` (H, https://thetradefox.com/_next/static/chunks/*.js). Orders are built as `{exchange: "kalshi"|"polymarket", type: "market", side: "buy", tokenId, marketId, amount, price}` (H, same bundles). Market pages use `/market/{exchange}/{slug}`.
- Market model, outcome tokenisation and book are inherited from Polymarket (CLOB, ERC-1155 CTF outcome tokens on Polygon) and Kalshi (binary contracts; the bundle calls proof.dflow.net and dflow.net/proof for KYC wallet verification, which suggests Kalshi markets are reached via DFlow tokenised markets on Solana: M).
- No Tradefox-native markets found. NOT FOUND (searched: site HTML, 46 JS chunks, /landing).

## Chains and collateral
- Polymarket leg: Polygon, USDC (M, inherited). Kalshi leg: Solana via DFlow, USDC (M; `kalshiBalance.usdcBalance` in bundle, H for the field name only).
- Auth/wallet: Privy embedded wallets with recovery options (H, bundle) plus WalletConnect. Bundle also contains a broad multi-chain RPC list (Base, Polygon, Avax, Linea, Sei, BNB explorers) but that is likely just library defaults (L).
- A separate backend `https://api7.prdt.finance` is referenced for `/api/v1/prediction/deposits`, `/withdraws`, `/deposits/nibi`, `/withdraws/prdt` (Nibiru "wager" bonus flow) (H, bundle). That is a different product (PRDT Finance on Nibiru) and not documented; I did not call it.

## Read API
- exists: none (no official public API). docs URL: NOT FOUND (searched: thetradefox.com/docs and /api both 307 to /landing; docs./api./app. subdomains do not resolve; robots.txt and sitemap.xml also redirect to /landing).
- Same-origin Next.js routes seen in the bundle are internal app helpers, not a documented API: `/api/kalshi/market?ticker=`, `/api/polymarket-position?userWallet=`, `/api/polymarket-pnl-vol`, `/api/polymarket-trade-history`, `/api/predexon-wallet-profile?wallet=`, `/api/markets/watchlist` (H, bundle). I did not call them (undocumented, user-wallet scoped). Note `predexon-wallet-profile` suggests Predexon as a data provider (M).
- No fixtures saved: no public documented API to sample. For market data, use the upstream venues' own APIs (covered by the parallel workflow).

## Trade path
- None for an agent. Trading happens inside the web app using Privy embedded wallet signing, forwarded to Polymarket / Kalshi(DFlow). No public order API, no API keys, no documented signing scheme (NOT FOUND, searched as above).
- Copy-trading exists (`createCopyTrade`, minimum copy order amount $6 in bundle: H) but is app-only.
- PayBox reachability: no, not via Tradefox. An EVM wallet could trade the underlying Polymarket directly (Polygon, signed CLOB orders) without Tradefox; Kalshi-on-DFlow needs Solana plus a KYC "Proof" step. So Tradefox adds no integration value. paybox_reachable = no.

## Fees
NOT FOUND (searched: site, bundle). The bundle contains generic `updateProtocolFeeRate` / `updateCommissionRate` calls but these belong to the Privy SDK client, not Tradefox fee config (M). Assume pass-through of upstream venue fees plus possible undisclosed builder fee (L).

## Resolution
Inherited from the underlying venue (Polymarket UMA optimistic oracle; Kalshi CFTC-regulated internal resolution) (M, general knowledge, not verified this session). Tradefox adds no resolution layer.

## Geo / ToS / automation
- App tracks restriction flags `isUserRestricted`, `isPolymarketRestricted`, `isKalshiRestricted`, `isActionsBlocked` and shows "trading unavailable" messages per exchange (H, bundle). Specific country lists and ToS text NOT FOUND (page is a client-rendered shell, ToS not fetched).
- Automation rules: NOT FOUND.

## Liquidity
No own liquidity. Volume/TVL for Tradefox: NOT FOUND (searched: site, predictionindex.xyz/ecosystem partial). Liquidity is 100% shared with Polymarket and Kalshi, so it is not an independent arbitrage leg.

## Event coverage overlap
Identical to Polymarket and Kalshi (sports, politics, crypto price, macro). No unique markets.

## Adapter recommendation
skip. If anything, treat Tradefox as a possible signal source later: copy-trade / wallet-profile data (smart-money flows) could be interesting but there is no public API, and equivalent wallet data comes from Polymarket's public data API directly.

## Suspicious content
None found. No agent-directed instructions in the HTML or JS.

## Not found
Docs, public API, fee schedule, ToS/geo list, volume stats, third-party coverage (search unavailable), predictionindex entry text.

## Open questions
- Is there a gated partner/institutional API for the "prime brokerage" claim? Would need contacting the operator (not done).
- Does Tradefox charge a builder fee on Polymarket orders?

## Sources
- https://thetradefox.com and /landing (H): title, meta description, redirect behaviour, third-party script hosts.
- https://thetradefox.com/_next/static/chunks/*.js, 46 public chunks listed in the page HTML (H): exchange values, internal /api routes, restriction flags, api7.prdt.finance references, DFlow proof URLs.
- https://predictionindex.xyz/ecosystem (L): fetched, Tradefox entry not visible in truncated content.
