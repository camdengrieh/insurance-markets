# Octupus (Octupus Laboratories Inc) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = inferred / secondary, L = weak or stale.
Limits of this pass: WebSearch budget was exhausted, so no independent press or regulator searches were possible. Everything below comes from the App Store listing, the venue's own site, its public API and its public front-end JS bundle. No POST/auth calls were made (one unauthenticated GET /auth/challenge returned a nonce; nothing was signed).

## Verdict
- Live: yes (H). Site and API respond 2026-10-19; markets created 2026-10-16; App Store version 1.0.3 shipped 19 Aug 2026.
- Kind: custodial, Nigeria-focused, Naira-funded LMSR prediction market. Not a crypto-wallet venue from the user's point of view.
- adapter_priority: P2 (read-only signal source; no programmatic trade path reachable from PayBox; tiny liquidity).

## Identity and sources of truth
- App Store (NG storefront): "Octupus" by Octupus Laboratories (provider "Octupus Laboratories Inc"), Finance category, 18+, "Gambling" content flag, 4.8 from 5 ratings, v1.0 30 May, v1.0.1 17 Jun ("first official release"), v1.0.3 19 Aug. Copyright "(c) Octupus 2026". Developer links only a privacy policy at octupus.xyz. Tags: H. https://apps.apple.com/ng/app/octupus/id6763746768
- Official website: https://www.octupus.xyz (title "Octupus: Enter Nigeria's Largest Prediction Market"; App Store says "first"). Nuxt on Vercel. Tags: H. This resolves the hint's "official website NOT FOUND".
- NOT the same as octupus.com (that is an unrelated LatAm IT company, Octupus Cloud Ltd) (H).
- Legal entity is inconsistent: privacy policy says "Octupus Ltd ... incorporated under the laws of the Federal Republic of Nigeria", footer says "Octupus Inc.", App Store says "Octupus Laboratories Inc", Firebase project is named octupus-laboratories-inc. (H for each string; true entity unresolved.)
- Regulator: NOT FOUND (searched: site, privacy policy, App Store listing; no web search possible). Privacy policy cites only the Nigeria Data Protection Act 2023. No gambling/SEC/lottery licence mentioned anywhere I could read.

## Market model (H)
- Pricing: LMSR (logarithmic market scoring rule) automated market maker, one per binary leaf. Each API leaf has `b`=1442695040, `risk`=1000000000, `sold_yes_shares`, `sold_no_shares`. `b` = risk/ln2, so max loss per leaf = `risk` (raw units; if 6 decimals that is 1,000 units of the settlement currency per leaf). I verified `p_yes = 1/(1+exp((q_no-q_yes)/b))` reproduces the API's `odds.p_yes` on all 53 leaves that have odds (0 mismatches). Subsidy is house-funded, i.e. not literally "peer-to-peer" despite the marketing (M: App Store says P2P / no house edge; fee schedule not found).
- Structure: `kind=parent_market` (event; `children` = outcomes) or `kind=market` (standalone binary). 37 top-level items = 22 parents + 15 standalone, 89 tradable leaves (2026-10-19).
- Multi-outcome parents are NOT coherent categoricals: each child is an independent binary YES/NO LMSR with its own `b`, so child p_yes do not sum to 100 (Ballon d'Or children: 50.0, 46.44, 54.87, 37.89 = 189%). Untouched leaves have `odds: null` (implied 50%). A scanner must normalise or treat each leaf as its own binary.
- Tokenisation: each leaf has an on-chain `pub_key` (base58, Solana style) and `metadata_yes` / `metadata_no` ("Yes Token"/"No Token" with `symbol`). Site config references a Solana program and a USDC-like mint on devnet RPC (see Chains). Users do not hold these tokens directly (custodial; M).
- Resolution/lifecycle fields: `end_time` (unix s), `lifecycle_config.close_date/resolution_date`, `locked`, `settled`, `outcome`, `winning_child_pub_key`, `proposed_outcome`, `auto_resolved_outcome`.

## Chains and collateral
- User-facing collateral: Nigerian Naira. Deposit = bank transfer to a generated bank account (bank_name/account_number/account_name returned by POST /user/deposit); Paystack option present in UI but disabled; withdrawals via POST /user/withdraw to saved Nigerian bank accounts (`/banks`, `/banks/resolve`, `/user/accounts`). `/utils/rate` converts currencies. UI: "Pay with Naira Wallet". Tags: H (read in first-party JS bundle chunks CbVJNWPk.js and DuIcovya.js, not executed).
- On-chain: public site config exposes `programId` 6RuchKVL8DULiykMhYH7ehkppVYBiZDzXmK9JfzaynoW, `usdcMint` Gh9ZwEmd...KtJr and `rpcUrl` https://api.devnet.solana.com/ (H that these strings are in the served config; they are public config, not secrets). That is Solana DEVNET. So either the production site is still settling on devnet test tokens, or the config is stale. I did not verify on-chain state (would require JSON-RPC POST). Treat the on-chain layer as unverified and likely not real-value (L/M).
- Auth: email+password signup (+ phone), email OTP, Google sign-in (flag disabled), Phantom sign-in (flag disabled); bearer token; `/auth/challenge` issues a "Sign this to authenticate" nonce (H) so a wallet-signature login exists in code but is disabled in config.

## Read API (unofficial-but-public, undocumented)
- exists: no official docs found (searched site nav, blog index, App Store). The site's own front-end calls a public REST API; market reads work unauthenticated. Classification: unofficial-only (no published docs/ToS for third-party use), but unauthenticated GETs return JSON.
- Base: https://api.octupus.xyz/api/v1 (Rust-style service on Render behind Cloudflare; headers `server: cloudflare`, `x-render-origin-server: Render`). Tags: H.
- Public GET (H, tested 2026-10-19):
  - `GET /market` -> `{error:false, data:{items:[...], total:37, page:1, limit:40, pages:1}}`. Query params `page`, `limit`, `search` work (`?search=bitcoin` -> 2 hits; `?page=1&limit=2` -> 2 items). Whole list was ~470KB (parents embed children, odds, rules, resolution config).
  - `GET /market/pub_key/{pub_key}` -> `{error:false, data:{markets:{...leaf...}}}`.
  - `GET /auth/challenge` -> nonce + message + expires_at (not used further).
  - 401 without token: `/market/portfolio`, `/user/me`.
- From front-end bundle only (NOT called, M): `POST /market/quote`, `POST /market/buy` ({pub_key, amount, is_yes, expiration}), `POST /market/sell`, `GET /market/shares/{pub_key}`, `GET /market/txn/{id}` (buy returns `txn_id`), `GET /market/portfolio`, `GET /user/balances`, `GET /user/transactions`, `GET /user/notifications/stream`, `POST /user/deposit`, `POST /user/withdraw`.
- Not found: order book / depth endpoint (none needed; AMM), trades history endpoint, websocket (only a notifications stream for logged-in users), volume (`volume` is null in every leaf), rate limits (no rate-limit headers seen; undocumented).
- Pricing for scanner: use `odds.p_yes/p_no` (percent, already post-LMSR spot) or recompute from q's; real execution price requires `POST /market/quote` (needs auth) because LMSR cost has size-dependent slippage. Fees unknown, so quoted prices may differ.
- Fixtures: docs/research/fixtures/octupus-octupus-laboratories-inc/market-list-sample.json (3 of 37 items, trimmed), market-by-pub-key.json.

## Trade path
- Programmatic: yes in principle (REST buy/sell with a bearer token from email/password login), but there is no API key scheme, no documented programmatic access, and the account is KYC-lite custodial email login. Creating an account was out of scope and not attempted. Automation/ToS: NOT FOUND (no ToS page linked; only privacy policy).
- Wallet signing: none for users. No transaction proposals or signed orders; funds enter via Nigerian bank transfer to a custodial Naira wallet.

## PayBox reachability: no
EVM/Solana wallets in PayBox cannot fund or trade this venue: collateral is NGN bank transfer, access is a custodial email account, and the Solana layer is devnet config the user never signs against. At best a human could fund via bank transfer, outside PayBox.

## Fees
NOT FOUND. Leaves carry `fee: null`; no fee text on site/blog index/App Store beyond "no house edge". Deposit response includes `charges` (`net_amount`, `total_charges`) so deposits are charged (H that fields exist; amounts unseen). Treat trading cost as unknown; LMSR slippage with b ~= 1,442 shares-units is large for any meaningful size.

## Resolution and dispute risk (H, from API fields)
- Operator-resolved: `resolution_config.authority = "Market Resolver"`, `is_auto_resolve=false`, `trusted_sources=["Custom"]`, `fallback_method="committee"`, `tie_handling="committee_review"`; primary source named per market (e.g. Premier League result page), `oracle_api` null. `moderation_config.community_dispute_enabled=true` on parents (mechanism undocumented).
- Rules: EPL-style markets settle on 90 min plus stoppage; cancelled/no-result -> "no winning party" (void-like but unspecified refund path). Postponed events stay unresolved (capital locked).
- Stale-state risk: of 37 items, 13 had `end_time` already past on 2026-10-19 yet are still listed, and 4 leaves locked / 3 settled. Scanner must filter on `end_time`, `locked`, `settled`, `visibility_status`.
- Counterparty risk: single custodial operator, unlicensed as far as can be seen. High.

## Geo / ToS
- `participation_rules.allowed_regions` = ["GB","US","CA","AU","NG","KE"] on markets seen (H), `min_kyc_level` null. App Store listing is NG storefront, markets are `country: NG`. Privacy policy says it does not collect government ID/BVN. No ToS found. Quote: policy covers users who access via "API integration" (generic definition, not an API grant).

## Liquidity (all H, 2026-10-19, derived from API)
- Per-leaf LMSR subsidy cap: `risk`=1,000,000,000 raw units for all 89 leaves.
- Activity: 42 of 89 leaves have any shares sold; sum of sold shares across leaves = 23,125,189,209 raw units (if 6 dp ~ 23k shares; M). `volume` null everywhere. No TVL/OI/volume figure published. Effective depth is tiny: b ~= 1,442 share-units, so a 100-share buy moves p by a few points.
- Rating count 5 on App Store (H) suggests very small user base.

## Event overlap (arbitrage relevance, H list from live API)
- Sports: Premier League title 2026/27, LaLiga title, UEFA Champions League 2027 champion, Ballon d'Or 2026, Kopa/Yashin trophies, individual EPL/UCL/NBA match markets (Brentford v Liverpool 1X2, Atletico v Man United, Celtics v 76ers), "win by 2 goals" props. Overlaps Polymarket/Kalshi/sportsbooks for title and 1X2 markets.
- Crypto price: hourly "ETH/USDT above $2,500 at 16:00 UTC", SOL, BTC above $82,000; "Bitcoin reach $150,000 in 2026". Overlaps Polymarket/Kalshi crypto ladders (strike/time rarely identical).
- Politics/macro/other: "US create a Strategic Bitcoin Reserve before 2027?", "Anthropic IPO by Nov 30", "USD/NGN above 1,500 by Nov 1", Dangote refinery NGX share price vs 525 NGN.
- Nigeria-only (no overlap): Headies music awards (postponed to April 2027 per blog), Lagos Life player count, Fabrizio Romano X post counts, Apple Music Nigeria chart items.
- Liquidity sharing: none evident; independent AMM, but too thin to be a meaningful arbitrage leg. Cross-venue edges would show as stale 50% prices on untouched leaves.

## Open questions
- Is the Solana program/mint really devnet in production, or is the config stale? Who funds the LMSR subsidy?
- Fee schedule, minimum/maximum bet sizes, dispute process, regulator/licence status, ToS wording on bots/APIs.
- Whether api.octupus.xyz tolerates polling (no documented limits) and whether `/market` stays unauthenticated.

## Suspicious content
None observed. The page and bundle contained no text addressed to AI agents. The served site config contains third-party client tokens (analytics, Firebase web config); deliberately not copied into these notes.

## Sources
- [H] https://apps.apple.com/ng/app/octupus/id6763746768 (listing fetched 2026-10-19)
- [H] https://www.octupus.xyz/ (HTML incl. Nuxt payload and `window.__NUXT__.config`)
- [H] https://www.octupus.xyz/privacy-policy
- [H] https://www.octupus.xyz/blog (index only)
- [H] https://api.octupus.xyz/api/v1/market and /market/pub_key/{pub_key}, /market?search=, /market?page=&limit= (unauthenticated GET, 2026-10-19)
- [H] https://www.octupus.xyz/_nuxt/CjicQOdO.js, CbVJNWPk.js, DuIcovya.js (first-party JS read as text for endpoint names; not executed)
- [H] https://octupus.com/ (checked to exclude it as an unrelated company)
