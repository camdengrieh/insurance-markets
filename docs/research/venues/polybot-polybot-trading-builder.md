# PolyBot (polybot.trading) builder - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page fetches and unauthenticated GETs only; no account, wallet, key, signature or PayBox tool used. Third-party pages treated as untrusted data.
Tags: **H** first-hand in a primary source this session; **M** secondary/inferred; **L** weak/stale.

## Verdict
- **Not a venue.** PolyBot is a Telegram bot / Mini App front end ("broker-or-frontend") that routes orders into **Polymarket** (H: https://docs.polybot.trading/docs/what-is-polybot - "self-custodial Telegram interface for Polymarket"). It has no markets, books or resolution of its own.
- **Liquidity is 100% Polymarket's** -> not an independent arbitrage leg. adapter_priority: **skip** (Polymarket is covered by a parallel workflow).
- Still live (H): polybot.trading HTTP 200, footer "(c) 2026 PolyBot", sitemap lastmod 2026-08-24, docs page "last updated Jul 20, 2026"; Polymarket builder leaderboard (ALL) lists it (H, below).

## Kind / market model
- Telegram bot + Mini App; market and GTC limit orders on Polymarket markets (binary/categorical as per Polymarket CLOB, outcome tokens are Polymarket CTF tokens) (H what-is-polybot; M for token model by inference from Polymarket).
- Extras: copy trading, auto-trader rules (crypto up/down triggers, TP/SL/trailing), stop loss, alerts, "parlays" (H docs sitemap + help-faqs mention parlays; mechanics NOT FOUND - not read; likely PolyBot-side product, unverified), referrals, "Robin Yield" (NOT FOUND detail).

## Chains / collateral
- Per-user **Polygon Safe** smart wallet created by PolyBot plus a PolyBot-held "signer key" the user can export (H https://docs.polybot.trading/docs/wallet-guide). Trading balance is **pUSD** on Polygon (H); deposits from other assets are converted to pUSD (H). Homepage claims deposits from Polygon, Solana, Base, Ethereum, Bitcoin, BNB, min $1 (H https://polybot.trading/). Bridge providers NOT FOUND.
- The wallet-guide says the signer key is held/managed so PolyBot can authorise transactions; custody "self-custodial" is a marketing claim with key export (M).

## Read API
- **exists: none** for PolyBot (docs "does not mention a public API"; only a Telegram Commands Reference) (H what-is-polybot; docs site has no API section in sitemap, H https://docs.polybot.trading/sitemap.xml). NOT FOUND (searched: homepage, docs sitemap, what-is-polybot, help-faqs, compare page; WebSearch budget was exhausted so no extra search).
- Only machine-readable trace: Polymarket Data API builder leaderboard, `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0` -> 200, JSON array of `{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}` (H). Fixture: `docs/research/fixtures/polybot-polybot-trading-builder/polymarket-builders-leaderboard-ALL-sample.json`.
- For market data/books/trades/resolution use Polymarket's own APIs (covered elsewhere).

## Trade path
- None for an agent via PolyBot (no API). The user trades by Telegram commands/Mini App. An aggregator should trade Polymarket directly (CLOB with EIP-712 signed orders from a Polygon wallet), not through PolyBot. PayBox: PolyBot's Safe is not reachable through PayBox (it is PolyBot's own Safe/signer); a PayBox EVM wallet could only reach Polymarket directly, not "via PolyBot". paybox_reachable = no.

## Fees
- "Currently 1% of volume"; promotions and account overrides can change it; who pays / buy-vs-sell NOT specified; confirmation screen authoritative (H https://docs.polybot.trading/docs/help-faqs, what-is-polybot). Homepage says "1% flat fee on successful trades" (H). Cross-network deposit routes may add provider/network costs; withdrawals use sponsored gas (H wallet-guide). Likely funded via Polymarket builder fee mechanism (M, inferred; docs do not mention a builder program). Polymarket's own fees are additional/separate (not researched here).

## Resolution
- Entirely Polymarket's (UMA optimistic oracle-based per Polymarket; not verified here, covered by other workflow). PolyBot adds no resolution layer; redeem/cash-out guide exists (H blog link on homepage, not read).

## Geo / ToS / automation
- "PolyBot is not available to U.S. persons or people located in the U.S." (H help-faqs). Footer: "Not available in certain jurisdictions." No ToS page found (https://polybot.trading/terms returns a 404 page, H). Automation rules: FAQ says bots must follow Polymarket terms/geo restrictions (H homepage).

## Liquidity
- Polymarket builder leaderboard (ALL time, fetched 2026-10-19, H): PolyBot rank 31, volume about $31.79M, 2,641 active users, verified true. Rank 1 (betmoar) about $2.34B for scale. All of this volume is Polymarket volume, already counted there.

## Event overlap / shared liquidity
- Same as Polymarket (sports, politics, crypto up/down, macro). **Shares liquidity with Polymarket** -> duplicate; not independent.

## Possible signal use (P2-ish, but skipped)
- Builder-attributed volume and "smart wallets"/copy-trading leaderboards on polybot.trading are marketing pages with no documented API (H none found). Not worth an adapter; Polymarket Data API wallet data is the primary source.

## Open questions
- Whether PolyBot reports builder-code fee share on orders (not needed).
- Parlays mechanics (PolyBot-side product vs Polymarket) not verified.

## Sources
- https://polybot.trading/ (H), https://polybot.trading/sitemap.xml (H), https://polybot.trading/terms (404, H)
- https://docs.polybot.trading/docs/what-is-polybot, /wallet-guide, /help-faqs, /sitemap.xml (H; page text via summarizer fetch, so quotes are M-H)
- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (H)
- Suspicious content: none found.
