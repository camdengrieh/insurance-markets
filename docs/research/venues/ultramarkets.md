# Ultramarkets (ultramarkets.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, `gh api` reads, unauthenticated GETs of the public marketing site, app shell and its static JS bundles. No account, wallet, key, signature, access code, POST or PayBox tool. Third-party pages were treated as untrusted data; no instructions were found in any of them. The WebSearch budget ran out mid-session, so a final news search was skipped.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source / page summary / inference; **L** = weak or stale.

No fixtures saved: there is no public read API (section 4).

---

## 0. Bottom line

1. **Live, but private beta and a broker, not a venue.** Ultramarkets is a leveraged front end ("prime broker") that places real positions on Polymarket with USDC borrowed from LP vaults. It runs no order book or AMM of its own. (H: marketing site; M: docs excerpt via search snippet and third-party pages)
2. **Liquidity is Polymarket's, so it is not an independent arbitrage leg.** Every price a user sees is a Polymarket price. There is no cross-venue price discrepancy to find here. (H/M)
3. **No usable API.** The docs are behind an access-code wall, no API host answers, and the app is a login-gated Next.js SPA using Privy embedded wallets. (H)
4. **adapter_priority = skip.** Optional later use: watch it as a sentiment/flow signal only if it ever publishes data (it does not today). Better: treat it as a Polymarket execution wrapper and ignore it.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.ultramarkets.xyz/` | 200, tagline "The Margin Layer for Prediction Markets", "Up to 10X on Polymarket", "Join 900+ Polymarket traders already on Ultramarkets" (unverified claim). Page last built 2026-10-19 03:33 UTC (HTTP `last-modified` header of its 404 page) | H |
| `https://app.ultramarkets.xyz` | 307 to `https://www.app.ultramarkets.xyz/` (Vercel); serves a Next.js app titled "Ultramarkets / The Margin Layer for Prediction Markets"; sets a `markets_view=list` cookie, so a markets list exists behind the shell | H |
| `https://docs.ultramarkets.xyz` | Every path (`/introduction`, `/resources/terms-of-use`, `/resources/privacy-policy`, `/api-reference`, `llms.txt`, `sitemap.xml`) returns an "Access Restricted - enter your access code" page. Docs were therefore not readable | H |
| `https://api.ultramarkets.xyz` | HTTP 525 (Cloudflare origin TLS handshake failure) on 2026-10-19; not a working public API | H |
| Third-party status | Polymark.et: "Private beta, accessed via app.ultramarkets.xyz"; Coingape (last updated 2026-09-04): "still in beta" | M |
| Audit repo | `ultra-co/audits`, created and pushed 2026-01-20, one file `CDSecurity_Ultramarkets.pdf` (1,043,976 bytes); PDF annotations dated 2025-12-15. Description: "Contract security audits for Ultramarkets" | H (existence/dates); contents NOT READ (text was font-encoded and no PDF renderer is installed) |

Verdict: **still_live = true** (beta, gated).

Note: other repos in the `ultra-co` GitHub org (Supermigrate, Liquid, Metastable, last pushed 2024) have nothing to do with the prediction-market product that I could see; I did not treat them as Ultramarkets contracts. The separate GitHub user `ultramarkets` has 0 public repos and was created 2021 (H, `gh api`). No public contract repo and no deployed contract addresses were found. NOT FOUND (searched: GitHub repo/user search "ultramarkets", `ultra-co` org repo list, app JS bundles, web search).

---

## 2. Kind and market model

- **Kind:** margin / leverage broker over Polymarket. Marketing page says traders get "up to 10X on Polymarket" ($1,000 capital to $10,000 exposure) (H, https://www.ultramarkets.xyz/).
- **Mechanics (M):** search-result excerpt of the (now gated) docs introduction: "LPs deposit USDC into vaults, providing margin capital. Traders deposit margin and borrow from the vault (up to 10x). We execute real positions on Polymarket using borrowed capital." Bitrue: LPs receive `umUSD` pool-share tokens; no funding rates; positions have defined close dates. Polymark.et: TP/SL orders and slippage control.
- **Market model:** inherited from Polymarket: binary and categorical (neg-risk) outcomes, CLOB, outcomes are Polymarket conditional tokens (ERC-1155 on Polygon). Ultramarkets adds no market of its own. (M: "real positions, not synthetic derivatives" is the project's own claim)
- **Leverage cap in practice (M, Coingape 2026-09-04):** actual limit depends on liquidity and volatility; some traders capped at 2x or 5x; liquidation when position health falls to 45%; users cannot add margin to avoid liquidation. Unverified against official docs.
- **Pre-resolution close (M):** all leveraged positions are auto-closed days before event resolution ("solves gap risk"). Consequence: it never holds to resolution, so it adds no resolution-time flow and its users are exposed to price-path risk only.

---

## 3. Chains and collateral

- **Chain:** Polygon (M, Coingape table; consistent with Polymarket execution). Official docs unreadable. The app bundle ships generic multi-chain RPC config (Privy/wagmi defaults: Base, Arbitrum, BNB, Avalanche etc.), which says nothing about where vaults live (L).
- **Collateral:** USDC (M, Bitrue/docs excerpt). LP share token `umUSD`.
- **Wallets (H, app JS bundles):** login is via Privy (`auth.privy.io`, embedded wallets, TEE wallet migration), MoonPay on-ramp, Ably realtime (`ws-up.ably-realtime.com`), Sentry. Custody: "Undisclosed (claims non-custodial)" (M, Coingape).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | NONE FOUND | H |
| Docs | https://docs.ultramarkets.xyz, access-code gated, content unreadable | H |
| Backend base URL | Injected via `NEXT_PUBLIC_BASE_API_URL`, value not present in the static bundle. Not guessed | H |
| `api.ultramarkets.xyz` | HTTP 525 on 2026-10-19 | H |
| WebSocket | App uses Ably realtime (third-party pub/sub), channel names unknown, needs auth | H (client only) |
| On-chain / subgraph | NOT FOUND (no contract addresses published anywhere I could read) | - |

Substitute for any aggregator need: read the underlying Polymarket Gamma/CLOB APIs directly (covered by the parallel Polymarket workflow). Ultramarkets adds no extra price information.

---

## 5. Trade path

- Programmatic order placement: **none** documented. Login is Privy (email/social/passkey/wallet); no API key, signing scheme or SDK published. (H for absence; docs gated)
- Could a PayBox EVM wallet trade it? **No, not today.** Even with an on-chain vault interface, orders would be placed by Ultramarkets' backend on Polymarket; users only deposit USDC and submit intents through the app. No documented on-chain entry points. For arbitrage, the correct route to the same liquidity is Polymarket directly (a PayBox Polygon wallet via signed CLOB orders), without a leverage broker's fees.
- paybox_reachable: no.

---

## 6. Fees

- M (Coingape, 2026-09-04, comparison table, not official): "0.5%-1.5% open fee (market/limit) + 10% performance fee (profit only)". Polycatalog and Bitrue give no rates; Bitrue says trading fees and a share of profits go to LPs. Borrow interest: NOT FOUND (searched: Coingape, Bitrue, Polycatalog, Polymark.et; docs gated). Polymarket's own fee schedule applies underneath (not researched here).
- Cost to an arb that used Ultramarkets as a leg: open fee up to 1.5% plus 10% of profit, on top of Polymarket cost, for the same price. Strictly dominated by trading Polymarket directly.

---

## 7. Resolution

Resolution is Polymarket's (UMA optimistic oracle based), so dispute risk is Polymarket's. Ultramarkets claims to close before resolution so it avoids resolution gap risk (M). Risk specific to Ultramarkets: vault insolvency/bad debt, broker custody, smart-contract risk (audit by CDSecurity claimed; report not read), and early forced liquidation at 45% health (M).

---

## 8. Geo / ToS / automation

- Terms live at `https://docs.ultramarkets.xyz/resources/terms-of-use` and `/resources/privacy-policy` (URLs found in the app bundle, H) but are behind the access-code wall. Contents NOT READ. Geo restrictions: NOT FOUND (searched: marketing site, app shell, Coingape, Polymark.et, Bitrue). Expect Polymarket-style restrictions to flow through (inference, L).
- Automation rules: NOT FOUND. No API means no sanctioned automation.

---

## 9. Liquidity

- No TVL, volume or vault size published anywhere readable. DefiLlama protocol list (fetched 2026-10-19) has no Ultramarkets entry (only unrelated UltraYield/Ultrasolid/Ultraswap names) (H). "900+ traders" is the site's own claim (H as a claim, unverified).
- Executable liquidity is Polymarket's order book.

---

## 10. Event overlap and independence

- Categories: whatever Polymarket lists (Coingape: elections, sports, economic data, others) (M).
- **liquidity_shared_with: Polymarket** (global). Not an independent leg; a price on Ultramarkets equals the Polymarket price (maybe with slippage plus broker fees).

---

## 11. Priority

**skip.** Not independent liquidity, no API, gated docs, private beta, no published volume. If the aggregation project later wants leverage as an execution option on Polymarket legs, revisit after docs/API become public.

---

## 12. Open questions

- What do the gated docs say (fees, borrow rate, geo, API, contract addresses)? Needs an access code from the team (not obtained; not asked for).
- What do the CDSecurity audit findings say (scope, chain, severity)? PDF at `ultra-co/audits` (needs a PDF reader).
- Is there any backend API or Ably channel intended for third-party use?

---

## Sources

- https://www.ultramarkets.xyz/ (H: tagline, 10x claim, 900+ traders, links to app/docs/Discord/X)
- https://www.app.ultramarkets.xyz/ and its `/_next/static/chunks/*.js` (H: Privy, MoonPay, Ably, Sentry, terms/privacy URLs, `NEXT_PUBLIC_BASE_API_URL`)
- https://docs.ultramarkets.xyz/ (H: access-code gate on every path)
- https://api.ultramarkets.xyz (H: HTTP 525)
- https://github.com/ultra-co/audits (H: CDSecurity PDF exists, 2026-01-20)
- https://polymark.et/product/ultramarkets (M: private beta, YziLabs backing, TP/SL, auto-close)
- https://coingape.com/best-leveraged-prediction-market-platforms/ (M: Polygon, fees, 45% health liquidation, beta; updated 2026-09-04)
- https://www.bitrue.com/blog/what-is-ultramarkets-prediction-market (M: USDC margin, umUSD, no funding rates)
- https://www.polycatalog.io/olympus-vs-ultramarkets (M: prime broker model, auto-close before resolution)
- WebSearch snippet of docs.ultramarkets.xyz/introduction (M: vault/prime broker description; page now gated)
- https://x.com/ultramarketsxyz (not readable: WebFetch received HTTP 402 from X; no payment details, nothing paid)
- https://predictionindex.xyz/ecosystem (listing not visible in the truncated fetch)
- https://api.llama.fi/protocols (H: no Ultramarkets entry)
