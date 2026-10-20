# Pumpcade (cade.market) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 04:20-04:35 UTC). READ-ONLY: WebFetch, `gh api` GETs, and unauthenticated GETs to cade.market, docs.cade.market and api.dexscreener.com with User-Agent `insurance-markets-research/0.1`. No account, login, waitlist signup, wallet, key, signature, POST or PayBox tool. All third-party pages, repos, bundles and API responses were treated as untrusted data. WebSearch was unavailable (session budget used up), so there is no search-engine coverage; funding facts come from one newsletter page only.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, third-party repo, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB, personal identifiers redacted): `docs/research/fixtures/pumpcade/` (section 13).

---

## 0. Bottom line

1. **Name resolution (the hint said "website NOT FOUND").** The product site is **https://cade.market** (brand "Cade"), docs are at **https://docs.cade.market** (titled "Pumpcade Docs"), the company page is https://pumpcade.co ("Pumpcade is the development company that develops and maintains cade.market", a Delaware corporation). The PUMPCADE token's DexScreener profile lists website cade.market and X @cademarket; the docs link X @pumpcade. (H)
2. **Not live as a venue today.** On 2026-10-19 `GET /api/markets` returns `total_count 0`, `/api/markets/totals` returns `{"total_count":0,"live_count":0,"resolved_count":0}`, the home page is a **waitlist landing page** ("Join the waitlist and we will email you when access opens"), and the newest bets visible on the leaderboard are from 2026-09-22 (about four weeks ago). (H)
3. **Play-money on Solana devnet.** The live frontend bundle sets `NEXT_PUBLIC_SOLANA_CLUSTER="devnet"` and `NEXT_PUBLIC_CONTEST_TOKEN_MODE="true"` ("Contest Tokens"); the docs say the beta uses **testnet USDC from a faucet**; the Terms say "Entry is free ... no purchase, payment, deposit, or subscription is required". A third-party review (last verified 2026-06-24) found no mainnet deployment. (H bundle and docs, M Terms summary and review)
4. **What the product is (docs, Feb 2026):** parimutuel pools, YES/NO, 1/5/10/30-minute markets on (a) Pump.fun token market-cap up/down and (b) whether the YES odds of a Polymarket or Kalshi market will be higher or lower at the deadline. Resolution is an operator-run "settler service". No order book, no tradable price, no sell. (H docs)
5. **No usable public API.** The docs' OpenAPI file is the stock Mintlify "OpenAPI Plant Store" template. The website's own backend (`https://cade.market/api/*`) answers anonymous GETs, but it is undocumented, empty, and for write actions needs a login (Privy / sign-in message). (H)
6. **adapter_priority = skip.** No live markets, play-money, parimutuel (no price to arbitrage), single-operator resolution, ToS bans automated account creation and may void "suspected automated activity". Revisit only if all three revisit triggers in section 12 fire.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://cade.market/` | 200, Next.js, Cloudflare; waitlist copy "Join the waitlist and we will email you when access opens" (meta description) | H |
| `GET https://cade.market/api/health` | `{"environment":"production","server_time_ms":1792384059986,"status":"ok"}` (=2026-10-19 04:27 UTC) | H |
| `GET /api/markets`, `/api/markets-page`, `/api/markets/totals`, `/api/markets?status=completed` | all empty / zero (fixtures) | H |
| `GET /api/meme-madness/home-slate` | `{"slate":null}` | H |
| `GET /api/tournaments` | 55 "Meme Madness" tournaments created 2026-09-08 to 2026-09-16: 23 finished, 23 scheduled, 9 cancelled; most recent update 2026-09-22T05:40Z; last finished update 2026-09-14 | H |
| `GET /api/leaderboard` (period all) | `total_ranked 25865`; top-10 `last_prediction_at` all between 2026-09-21 and 2026-09-22; `generated_at` 2026-10-19 (static ranking recomputed) | H |
| Feature flags `GET /api/feature-flags` | `credits_runtime:true`, `prize_withdrawals_enabled:true`, `meme_madness_wrapped_enabled:true` | H |
| Legacy backend `api-dev.cade.market` (named by a third party in June) | does not resolve any more | H |
| Docs freshness | `docs.cade.market/sitemap.xml` lastmod 2026-02-13 (parimutuel page 2025-12-22): **8 months old, treat as stale** | H |
| Token | PUMPCADE trades: 16 pairs, about $0.28M 24h DEX volume (DexScreener API, 2026-10-19) | H |
| Funding | "$5M seed ... announced April 14, 2026 ... led by Jump and Foundation Capital"; "live token on pump.fun already trading" (Crypto Integrated newsletter, a summary of the company's X post) | M (WebFetch summary of page) |
| X accounts | `x.com/pumpcade` returned HTTP 402 to WebFetch (no payment details given); stopped, not retried | H (the 402) |

Verdict: **company, website, API shell and token are alive; there are zero live prediction markets and the product is a devnet/contest-token game.** `still_live = false` for the purpose of a trading adapter.

Phishing note: `pumpcade.market` serves a Cloudflare "Suspected Phishing" interstitial; `pumpcade.app` is a for-sale parking page. Neither is official. (H)

---

## 2. Kind and market model

- **Kind:** on-chain (Solana, Anchor program) parimutuel pool bets with an off-chain Go backend, operator-created markets, short horizon. (H docs, M for Anchor/Go from third-party review)
- **Outcomes:** binary YES/NO. Not categorical, not scalar. (H docs)
- **Market types per docs (H, Feb 2026):** `Market Cap` (Pump.fun token market cap higher or lower at deadline; start value recorded at creation) and `Prediction Markets` (YES odds of a Polymarket/Kalshi binary market higher or lower than at creation). Durations 1, 5, 10, 30 minutes. "Custom markets exist but require manual resolution by administrators." One active market per token.
- **Types seen historically (M, third-party census of 7,493 markets on the old devnet backend, 2026-06-18):** market_cap 6671, sports_winner 495, stock_price 116, pyth_price 48, hyperliquid 42, polymarket_odds 38, custom 22, tomtom_congestion 18, coingecko 18, kalshi_odds 9, others 16. Current bundle also shows "Meme Madness" tournaments (token voting rounds, battles, daily results; route names only, no official description found - M).
- **Pricing:** there is **no price**. All stakes enter one pool per market. Payout = `Principal + (YourShares / TotalWinningShares) x LosingPool` (H docs). Shares = stake after fee x a **time multiplier**: 1.0x for the first 10% of the duration, then decaying to 0.2x at the deadline (H docs). The docs' worked table is not consistent with the exact curve a third party recovered from the old program's bytecode (`0.8*(ratio/0.9)^2+0.2`, M); the new program (below) was not analysed. Implied odds therefore depend on bet timing, not only pool sizes.
- **Principal protection (H docs):** winners always get their net deposit back plus a share of the losing pool; a market with no counter-side pays back principal (docs say production will require one participant per side; beta does not).
- **Tokenisation:** none. No outcome tokens, no shares you can transfer or sell: "It's final. You cannot cancel or modify a prediction." (H docs). Positions are per-market PDA accounts (M).
- **Ties:** "YES wins if final > starting, NO wins otherwise" so an unchanged value pays NO (H docs).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Solana. Production frontend cluster = **devnet** (`NEXT_PUBLIC_SOLANA_CLUSTER`) | H (live bundle) |
| Program id in current bundle | `Fdk13dh6CJQ29dgJqPQDdpn2Htrp9EJbfR8wYvn4pHp2` (`NEXT_PUBLIC_PUMPCADE_PROGRAM_ID`). Not verified on-chain (no JSON-RPC, which needs POST) | H (bundle string), not verified on-chain |
| Earlier program id (June 2026 review, devnet) | `8AELRdw1Y6fnj5GobEYFztifSNESN1RgAbPdx9DJdfxB`; a different id from the current bundle, so the program was redeployed | M |
| Settlement mint (devnet, Token-2022 program) | `2mx9rR43WGb8uXeUbQBDTY99uXtNQ3rnoejczWU5FqDr` (`NEXT_PUBLIC_SETTLEMENT_MINT` = `NEXT_PUBLIC_USDC_MINT`); UI label "Contest Tokens" | H (bundle) |
| Docs collateral | "testnet USDC", faucet 10,000 per click, "unlimited" in beta; third party saw a 24h per-wallet cooldown | H docs, M cooldown |
| PUMPCADE token (mainnet, not collateral) | mint `Eg2ymQ2aQqjMcibnmTt8erC6Tvk9PVpJZCxvVPJz2agu`, listed in the cade.market FAQ; main pair on PumpSwap created 2025-09-21 | H |
| Wallets | Login with Phantom (docs) / Phantom, Google, X (third party); **Privy embedded Solana wallet** per user; Pumpcade is a "session signer" so it can sign "transactions you initiate" without prompts | H docs |

No EVM presence. A third-party review says Privy also offers EVM wallets as login options (M), but all market actions are Solana.

---

## 4. Read API

| Field | Value | Tag |
|---|---|---|
| Official public API docs | **None.** `docs.cade.market/api-reference/openapi.json` is Mintlify's sample "OpenAPI Plant Store" (server `http://sandbox.mintlify.com`, paths `/plants`) | H |
| Website backend base | `https://cade.market` (`NEXT_PUBLIC_GO_API_URL`), paths under `/api/` | H (bundle) |
| WebSocket | `wss://cade.market/ws` (`NEXT_PUBLIC_GATEWAY_WS_URL`), plus `/api/meme-madness/realtime/{id}`; not probed | H (strings only) |
| Anonymous GETs that returned 200 | `/api/health`, `/api/markets`, `/api/markets-page`, `/api/markets/totals`, `/api/feature-flags`, `/api/tournaments`, `/api/leaderboard`, `/api/meme-madness/home-slate` | H |
| Other read routes present in the bundle (not called) | `/api/markets/{id}`, `/predictions`, `/prediction-history`, `/prediction-preview`, `/position-preview`, `/quote`, `/api/market-series/{id}`, `/api/sources/{a}/{b}/current` and `/series`, `/api/tournaments/{id}/leaderboard`, `/battles/current`, `/timeline`, `/api/meme-madness/markets`, `/api/transactions/{id}` | H (strings) |
| Routes that 404 now | `/api/extension/market-configs`, `/api/pumpfun/token/{mint}` (the latter with an arbitrary mint) | H |
| Response shapes | `/api/markets`: `{"markets":[],"count":0,"total_count":0,"has_more":false,"next_cursor":""}` (cursor pagination). `/api/markets-page`: `{list, totals, hot_market, always_live{series[]...}, external_values[]}`. `/api/leaderboard`: `{period,count,total_ranked,publication{...},entries[{rank,wallet_address,username,prediction_count,win_count,loss_count,volume_raw,score_raw,claimable_raw,...}]}`; amounts are raw integers (6 decimals implied) | H |
| Market object fields (June, old backend) | `id, onchain_market_id, market_pda, vault_pda, betting_mint, market_type, status (active/settling/completed/failed/cancelled), deadline, creator_address, starting_market_cap, final_market_cap, winning_side`, envelope `{data, request_id}` | M (third party; current backend has no markets to confirm) |
| Auth | Reads: none seen. Writes: login via `/api/auth/challenge` + `/api/auth/login` (June: sign-in-with-Solana message to JWT) plus Privy; `/api/transactions/submit` exists in the bundle | H (routes), M (flow) |
| Rate limits | NOT FOUND: no `x-ratelimit-*` or `retry-after` header on about a dozen GETs; no limits stated in docs | H (absence) |
| On-chain read | Anchor accounts Factory / Market / UserPosition / vault; no structured events, parse `Program log:` lines (June review of the old program) | M |

Because the backend is undocumented and currently holds zero markets, an adapter cannot be validated against real market data. Do not build against the June endpoint catalog without re-probing.

---

## 5. Trade path

- **Official paths (docs, H):** (1) cade.market web UI (click YES/NO, amount); (2) Pump.fun livestream chat command `predict 100 yes` (needs a linked Pump.fun wallet); (3) a Chrome extension widget on Pump.fun, Polymarket and Kalshi pages. All execute via the **Privy embedded wallet using the Pumpcade session signer**, so the user does not sign each bet.
- **Programmatic:** no documented API or SDK. Technically, the website backend has `predict`, `quote`, `transactions/submit` routes (bundle strings; `/predict` and a faucet are confirmed by a June third-party review, M), authenticated by login and Privy. A third party also reports that, on the old program, any wallet could call `place_bet` directly on-chain (M). Neither was exercised here.
- **Cancel/sell:** impossible after placing ("It's final") (H docs).
- **Deposits/withdrawals (docs):** tokens move from an external wallet to the embedded wallet and back (H docs); winnings are pulled by "claim" (M).

---

## 6. PayBox reachability

`paybox_reachable = no` today. Reasons: devnet contest tokens only (nothing of value to trade), zero markets, funds live in a Privy-managed embedded wallet rather than the user's own, and bets are placed with a session signer, not user-signed orders. A PayBox Solana wallet could in principle transfer SPL tokens to the embedded wallet or call the program directly (M, only if a mainnet program with real USDC ever exists), but no such deployment exists. No signing tool was called.

---

## 7. Fees

| Source | Fee | Tag |
|---|---|---|
| Docs (parimutuel page, 2025-12-22; creating-markets 2026-02-13) | **1% of each prediction, deducted before it enters the pool**: 0.45% protocol, 0.10% market creator, 0.45% "streamer" | H (docs, stale) |
| Third-party check of old program | 45/10/45 bps, `shares = floor(bet*0.99*multiplier)` | M |
| cade.market landing page FAQ (Oct 2026) | "3% fee on each prediction", plus an extra fee for joining the side already holding most of the pot, which "goes to player rewards"; "Cade does not keep it" | H (marketing copy; conflicts with docs) |
| Terms | no trading or transaction fees described; entry is free | M (summary) |

Docs and landing page disagree (1% vs 3% plus crowd fee); the current numbers are unknown. Payer is always the bettor. Solana network fees: not stated; prize withdrawals use "sponsored transactions" per a feature-flag description (H).

---

## 8. Resolution and dispute risk

- **Mechanism (docs, H):** at creation the start value is recorded from the Pump.fun / Polymarket / Kalshi API; a settlement job fires at the deadline, the "settler service" re-fetches the value, decides winner (`final > start` = YES), and "submits a transaction to the Solana program". Custom markets are resolved manually by administrators.
- **Trust model:** this is a **centralised oracle**. The June review of the old program found one key held upgrade authority, treasury and the `resolve_market` signer, and that `resolve_market` takes a single bool with no oracle account, proof, challenge window or refund path (M, old program only). The docs claim "no manual intervention".
- **Contractual:** Terms say the operator may designate data sources, "correct, recalculate, suspend, reverse, or invalidate results", its interpretation is "final and binding", and may void promotions, entries or prizes; disputes go to arbitration under Liberian law (H).
- **Data-source risk:** resolving off Pump.fun market cap and Polymarket/Kalshi *displayed odds* at a single instant is manipulable on thin books, and the start and end reads are 1 to 30 minutes apart. Ties pay NO. (my analysis, M)

---

## 9. Geo, ToS, automation

- Operator: Box Car Racer Holdings, Monrovia, Liberia; claims National Lottery Authority of Liberia licence no. 739/2026/OG (H on the site footer, M for the Terms). The licence certificate host `gaming.nla.gov.lr` did not resolve from here, so the licence is **unverified**.
- Age 21+ or majority. The Terms list **no restricted jurisdictions**; "individual promotions may impose stricter ... location, or residency rules". The footer warns that prediction markets may be prohibited in some places. (M, Terms via summary)
- Automation: "Using bots, scripts, macros, or automated systems to create accounts in any promotion is prohibited"; "Suspected automated activity can lead to voided entries, suspension, or termination". No explicit rule on trading bots or API access. (M, from a WebFetch summary of /terms)
- Legal shape: framed as free-entry promotions with prizes (sweepstakes/contest style), not a regulated derivatives venue. (my reading of the Terms, M)

---

## 10. Event categories and overlap

- Live now: **none** (0 markets).
- By design: very short-horizon direction bets on memecoin market cap (about 89% of historical markets, M), and direction of the YES price on Polymarket/Kalshi markets (about 0.6% of historical markets, M). Smaller sets: sports winners, stocks, Pyth/Hyperliquid/CoinGecko crypto prices (M).
- Overlap with other venues is at the *underlying* only (crypto and sports prices, other venues' odds). A parimutuel pool with a time-decaying multiplier cannot be hedged one-for-one against a fixed-price contract elsewhere, so there is no clean arbitrage leg. At most, pool imbalance could be a retail-sentiment signal, but the pools are play-money.

---

## 11. Liquidity (all with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Live markets | 0 | `/api/markets/totals`, 2026-10-19 | H |
| Real-money volume / OI / TVL | NOT FOUND (none; devnet) | - | H (absence) |
| Registered/ranked players | 25,865 ranked | `/api/leaderboard`, 2026-10-19 | H |
| Landing-page claims | "23.6K+ users", "5.03B betting volume" (currency not stated), "$225K+ in prizes" | cade.market, 2026-10-19 | M (unverified marketing) |
| Top contest-token volumes | top-10 players each 17.6M to 87.1M contest tokens (6 decimals) | `/api/leaderboard`, 2026-10-19 | H (play-money) |
| PUMPCADE token | FDV about $23M; liquidity about $1.11M summed over 16 pairs (PumpSwap about $0.65M); 24h DEX volume about $0.28M | DexScreener API, 2026-10-19 | H (not prediction-market liquidity) |
| Funding | $5M seed (Jump, Foundation Capital), 2026-04-14; "about $6M across two rounds" per unnamed commentary. "Pump.fun led an earlier pre-seed" came from the discovery hint and was NOT in the page I read | Crypto Integrated newsletter | M |

---

## 12. Independence, extras, risks

- **Shares liquidity with another venue? No.** Own pools. It *reads* Polymarket/Kalshi/Pump.fun prices for resolution, so it is a derivative of their prices, not a source of independent probability.
- **Signal value:** none today (empty, play-money). Even live, parimutuel pool ratios are not probabilities.
- **Revisit triggers (all three needed):** (a) a Solana **mainnet** program and a real-USDC settlement mint appear in `cade.market` config; (b) `/api/markets` returns live markets with non-trivial real-money pools; (c) a documented read API or stable public endpoints.
- **Risks:** operator-resolved outcomes, upgradable program under a single key (M), conflicting fee statements, devnet resets (the program id and backend host already changed between June and October), legal opacity (licence unverifiable), token-linked incentives (a team token trades on pump.fun).

---

## 13. Adapter spec (if built later despite the skip)

- Poll `GET https://cade.market/api/markets?...` (cursor `next_cursor`, `has_more`), `/api/markets/{id}`, `/api/markets/{id}/predictions`.
- Normalise as `kind=parimutuel`, outcomes YES/NO, `price = null`; expose `yes_pool`, `no_pool`, `shares`, `deadline`, `source` (`pumpfun|polymarket|kalshi|pyth|...`), `start_value`; never feed it into price-based arbitrage, only into a "signal" table.
- Skip any market whose settlement mint is not mainnet USDC. Do not use the faucet or any POST route.

---

## NOT FOUND (searched)

- Mainnet deployment: NOT FOUND (searched: bundle config shows devnet; `docs.cade.market` pages; third-party review says none as of 2026-06; could not query Solana RPC because it needs POST).
- Any official description of "Meme Madness" or "Cade Cup" rules and prizes: NOT FOUND (searched: cade.market home, `/terms`, bundle strings, `/api/tournaments`).
- Official API reference / rate limits / WebSocket schema: NOT FOUND (searched: docs.cade.market llms.txt, OpenAPI file, `/api`, `/docs` on cade.market).
- Verified licence certificate: NOT FOUND (`gaming.nla.gov.lr` did not resolve).
- Primary-source funding announcement: NOT FOUND (X returned HTTP 402; no web search available); only the newsletter summary.
- Smart-contract audit, security.txt, bug bounty: NOT FOUND (searched: `/.well-known/security.txt` 404 on cade.market, docs index).
- Public GitHub repo from the operator: NOT FOUND (GitHub repository search for "pumpcade" returned only third-party repos; code search for the current program id returned nothing).

## Open questions

1. Is the current program (`Fdk13...`) deployed on mainnet at all? (needs an RPC read, not done)
2. What is the actual fee today: docs 1%, landing page 3% plus crowd fee?
3. What are Meme Madness / Cade Cup, and are prizes paid in real USDC (admin routes mention "custom-usdc-payouts" and `prize_withdrawals_enabled:true`, M)?
4. Is the 5.03B "betting volume" contest tokens or a typo for a real-money figure?
5. Does the Apr 2026 raise relate to this same product team, and what is the roadmap to mainnet? (token linkage is H via the cade.market FAQ; roadmap NOT FOUND)

---

## Sources

H unless stated. All fetched 2026-10-19.

- https://cade.market/ (landing page text, FAQ, footer, links) - H
- https://cade.market/terms (operator, age, automation, disputes) - M (WebFetch page summary; quotes in section 9 come from that summary, not a raw-text read)
- https://cade.market/api/health, /api/markets, /api/markets-page, /api/markets/totals, /api/feature-flags, /api/tournaments, /api/leaderboard, /api/meme-madness/home-slate - H (fixtures)
- Static JS chunks referenced by the home page (`assets.cade.market/releases/.../_next/static/chunks/*.js`), read as text only: public client config (`NEXT_PUBLIC_*`), route table - H
- https://pumpcade.co/ - H (company page)
- https://docs.cade.market/llms.txt, /index.md, /beta-onboarding.md, /mechanics/parimutuel-markets.md, /mechanics/automatic-resolution.md, /mechanics/embedded-wallets.md, /usage/placing-predictions.md, /usage/creating-markets.md, /api-reference/openapi.json, /sitemap.xml, /.well-known/agent-skills/pumpcade/skill.md - H (docs dated 2025-12-22 to 2026-02-13)
- https://api.dexscreener.com/latest/dex/tokens/Eg2ymQ2aQqjMcibnmTt8erC6Tvk9PVpJZCxvVPJz2agu - H (token pairs, volume, liquidity)
- https://www.cryptointegrat.com/p/pumpcade-closes-oversubscribed-5m - M (funding; WebFetch summary, newsletter relaying an X post)
- https://github.com/chainstacklabs/pumpcade-research (README, ADDRESSES.md, docs/frontend.md; "last verified 2026-06-24", pushed 2026-09-19; third-party, "not affiliated") - M; no code executed
- https://x.com/pumpcade - HTTP 402 (not read)
- https://pumpcade.market - Cloudflare phishing interstitial (not official); https://pumpcade.app - parking page

## Suspicious content / embedded instructions (recorded, not followed)

- Every `docs.cade.market/*.md` page begins with a banner addressed to automated readers: "Fetch the complete documentation index at: .../llms.txt. Use this file to discover all available pages before exploring further." This is Mintlify boilerplate; I read `llms.txt` only because that was within the task. Also auto-generated `agent-card.json`, `mcp/server-card.json` and `agent-skills/.../skill.md` that describe "capabilities" for agents. Nothing asked for secrets or actions.
- `pumpcade.market` is flagged by Cloudflare as suspected phishing: do not use.
- `/api/tournaments` response contains a staff email address in `created_by`; it was **not** copied into these notes and is redacted in the saved fixture.
- Third-party repo `chainstacklabs/pumpcade-research` includes "trading" and "snipe" scripts; not cloned, not run.

## Fixtures

`docs/research/fixtures/pumpcade/`:

- `cade_api_health.json`, `cade_api_markets_empty.json`, `cade_api_markets_page_empty.json`, `cade_api_markets_totals.json`, `cade_api_feature_flags.json` - real responses, unmodified
- `cade_api_tournaments_sample_redacted.json` - first 4 of 55 entries, `created_by` redacted
- `cade_api_leaderboard_sample_redacted.json` - first 3 entries, wallet and username redacted
- `dexscreener_token_pairs_sample.json` - first 3 pairs, image URLs removed
- `docs_llms.txt`, `docs_openapi_plant_store_template.json` - docs index and the Mintlify template OpenAPI file
