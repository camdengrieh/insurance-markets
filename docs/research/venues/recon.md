# Recon (recon.trade) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: static page/asset GETs with the generic User-Agent, no account, wallet, key, signature, POST or PayBox tool. WebSearch was unavailable (session search budget used up), so there is no third-party press, X, or analytics coverage; everything below is first-party site/bundle text. Third-party content was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = inference from first-hand data; **L** = weak or stale.

## 0. Bottom line

1. **Recon is not a venue. It is a Polymarket analytics / copy-trading front end** ("Powered by Polymarket"). It has no markets, order book, or resolution of its own. (H)
2. **Liquidity is 100% Polymarket's.** Its backend routes orders to the Polymarket CLOB through a Recon-provisioned **custodial** wallet. It is never an independent arbitrage leg. (H for the architecture; see section 3)
3. **No public API and no docs.** The site links only to the app, ToS and Privacy. The app's `/api/*` is a cookie-authenticated first-party backend for its own UI (Privy login), undocumented. The ToS forbids bots/scrapers in bulk. (H)
4. **Value to this project: signal only, and only if Recon exposes it** (Smart Scores, insider flags, copy-trade follower positions). None of it is publicly accessible. The same signal can be rebuilt from Polymarket's public Data API (wallet trades/positions) without touching Recon.
5. **adapter_priority = skip.** Duplicate liquidity, no API, ToS anti-scraping, custodial wallet that PayBox cannot meaningfully use.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://recon.trade` | HTTP 200, Framer-hosted marketing site; `last-modified: Wed, 17 Dec 2025`; footer "(c) 2025 Recon" | H |
| `https://app.recon.trade` | HTTP 200 (Next.js on Vercel behind Cloudflare), served 2026-10-19; unauthenticated HTML is an empty login shell (Privy auth) | H |
| Marketing site is partly Framer template filler | `sitemap.xml` lists template slugs (blog posts about "project automation", careers pages); `/pricing` returns the 404 page although the nav links "Pricing", "Changelog", "Join waitlist" | H |
| ToS | "Last updated: December 12th, 2025"; copy-trading described as "(when available)" | H |
| External confirmation of 2026 activity | NOT FOUND (searched: WebSearch unavailable this session) | - |

Verdict: **still_live = true** (app reachable and its bundle contains working order/wallet/copy-trade routes), but the public site has not been updated since Dec 2025 (about 10 months, possibly stale) and no 2026 usage figures are available. Confidence medium.

## 2. Kind and market model

- **Kind (H):** social/analytics platform and broker front end for Polymarket: "Trader Smart Scores" (proprietary 6-factor score), wallet tracking with Telegram alerts, "Insider Finder" (flags suspicious buys from new accounts), trader discovery by win rate/ROI/volume/category, portfolio view. Source: https://recon.trade
- **Market model:** inherited from Polymarket (binary and categorical conditional-token markets on a CLOB). The app addresses markets by Polymarket `conditionId` and `assetId` (token id) (H, bundle route schemas). No Recon-native markets.
- Dashboard numbers on the landing page (Smart Score 79.2, Sharpe 4.96, $19,060 portfolio) are illustrative mock-ups, not usage stats (M).

## 3. Chains, collateral and trade path

- **Chain/collateral (M):** Polymarket on Polygon, collateral USDC.e. The app has routes `convert-usdc` ("Convert USDC to USDC.e (repeatable)"), `swap-quote` ("estimated fees for USDC to USDC.e swap"), `pending-swaps`, `withdraw` ("Withdraw USDC.e to external address"), `approval-status`. (H for route names/summaries; chain = Polygon is M, inferred from Polymarket.)
- **Custodial wallet (H):** `POST /api/wallet/provision` is summarised in the bundle as "Create custodial wallet, fund with gas, bootstrap Polymarket L2". Users log in via Privy (CSP allows auth.privy.io, WalletConnect). So the trading wallet is held by Recon, not the user.
- **Order routes (H, first-party bundle `app.recon.trade/_next/static/chunks/2350-*.js`):** `/api/polymarket/status` (GET), `/open-orders` (GET), `/orders/create` (POST; body carries Polymarket-style signed-order fields incl. `takerAmount`, `expiration`, `nonce`, `feeRateBps`, `signatureType` 0/1/2), `/orders/market` (POST). Copy trade: `PUT /api/copy-trade/config`, `GET /api/copy-trade/configs/pnl`. Portfolio: `GET /api/portfolio/summary`, `/redeemable`. Follow/insider: `/api/follows`, `/api/insider-trades`, `/api/flagged-insiders`, `/api/insider-positions`, `/api/traders`, `/api/markets`, `/api/alpha`, `/api/situation-monitor`, `/api/telegram-user`. All use `credentials:"include"` (session cookie). Unauthenticated `GET https://app.recon.trade/api/markets` returned `{"status":"error","code":404,"message":"Application not found"}` (H); I did not probe further.
- **PayBox reachability: no.** There is no documented programmatic trade path into Recon, and the wallet is custodial (funds would be deposited to a Recon-controlled address, which is a counterparty-risk transfer, not a venue integration). To trade the same liquidity, go straight to Polymarket (covered by the parallel workflow).
- **Builder code / referral attribution:** NOT FOUND in the bundle (searched for "builder"; no hits). Whether Recon earns Polymarket builder fees is unknown.

## 4. Fees

- Recon fee schedule: NOT FOUND (landing page, ToS and bundle checked; ToS only says some features "may be offered on a paid or subscription basis", auto-renewing, non-refundable; the Pricing page 404s). Order schema includes `feeRateBps` as in Polymarket's signed-order format (that is the Polymarket protocol field, M). Swap fees for USDC to USDC.e are quoted by the app (`/swap-quote`) but amount unknown. (H/NOT FOUND)

## 5. Resolution

None of its own. Resolves via Polymarket (UMA optimistic oracle; see the Polymarket note). Dispute risk is Polymarket's. (M)

## 6. Geo / ToS / automation

- ToS (https://recon.trade/legal/terms-of-service, last updated 2025-12-12): users must be "legally permitted to use prediction markets and related services"; "You are solely responsible for complying with all laws"; prohibits "bots, scrapers, or similar tools to access or copy data from the Services in bulk" and reverse engineering; may suspend/modify the service at any time; analytics and tools only, not advice. No explicit geo-block list. (H)
- Polymarket's own geo restrictions apply downstream (M).
- robots.txt (marketing site): `Allow: /`. (H)

## 7. Liquidity

NOT FOUND. No volume, OI, TVL, or user count published (searched: landing page, ToS, bundle). All depth is Polymarket's CLOB depth. Not independent. (H for absence)

## 8. Event overlap / arbitrage

Everything it shows is Polymarket (politics, crypto, sports, finance categories per landing page). Overlap with other venues is identical to Polymarket's, and Recon adds no independent price. Not an arbitrage leg.

## 9. Possible use as a signal source (not an adapter)

Smart Scores, insider flags and "followers by conditionId" (`POST /api/markets/followers`, `/smart-scores`) would be interesting to the aggregation layer as a trader-quality overlay, but they are gated behind a login, undocumented and covered by an anti-scraping clause. Recommendation: re-derive from Polymarket's public wallet/trade data instead. Revisit only if Recon publishes an API.

## 10. Suspicious content

None. (The bundle contains a Linear webhook and Telegram bot webhook route definitions and third-party X handles in curated trader lists; nothing addressed to AI agents.)

## 11. Open questions

- Does Recon attach a Polymarket builder code or charge fees on orders? (not visible)
- Is copy-trading actually live or still "when available"/waitlist? (ToS wording suggests beta)
- Any 2026 user/volume stats or X/press updates (search was unavailable).

## Sources

- https://recon.trade (H; Framer, last-modified 2025-12-17)
- https://recon.trade/legal/terms-of-service (H; 2025-12-12)
- https://recon.trade/legal/privacy-policy (fetched; not analysed in depth)
- https://recon.trade/robots.txt, https://recon.trade/sitemap.xml (H; template filler)
- https://app.recon.trade (H; login shell, response headers/CSP) and its public static JS chunks under `/_next/static/chunks/` (route table in `2350-*.js`) (H as to what the client code contains; behaviour of the routes not tested)
- Fixtures: none saved (no public read API exists to sample).
