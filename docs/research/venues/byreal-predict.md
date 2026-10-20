# Byreal Predict: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (User-Agent `insurance-markets-research/0.1`) to `www.byreal.io` (HTML and its public JS read as text, never executed), `docs.byreal.io` (GitBook `.md` pages), `docs.polymarket.com`, `data-api.polymarket.com`; `gh api` reads of the public `byreal-git` GitHub org; one WebFetch of the launch press release. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. I did NOT call Byreal's own backend gateway (see section 3). Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference; **L** = weak or stale (older than 6 months). "NOT FOUND (searched: ...)" means exactly that, not "no".

Limitations: the shared WebSearch budget ran out during the session (one extended search succeeded, a second was refused), so there is no independent press or social corroboration beyond the first search results. Byreal's own trading-fee rate and live market list could not be read without calling its undocumented gateway.

---

## 0. Verdict

**adapter_priority: skip** (as an arbitrage leg or data source). Keep a registry record and an alias rule to Polymarket only.

1. **It is a front end, not a venue.** Byreal's own docs: "Markets are operated by Polymarket on Polygon. Byreal Predict provides the front-end interface and bridges your Solana funds directly into Polymarket's order book. All liquidity is shared across the full Polymarket ecosystem." Its T&C: "Predict is an interface and order-routing tool ... The Company does not act as your counterparty in any market, does not match orders". (H)
2. **100% shared liquidity with Polymarket International.** Same CLOB, same ERC-1155 outcome tokens, same UMA resolution. Any "Byreal price" is a Polymarket price. It is not an independent arbitrage leg. (H)
3. **Activity is essentially dead.** Polymarket's public builder volume series for Byreal's builder code shows a World Cup spike (peak week starting 2026-07-05: $2.02M, 28 active users) and then a collapse after the final on 2026-07-19. From 2026-07-20 to 2026-10-19 the total is about $6.7K, October so far is $12.82 from 1 user. All-time $6.81M, 92 active users, rank 79. (H, fixtures)
4. **No public Byreal prediction API.** The only published Byreal API docs (`byreal-git/byreal-api-docs`) cover the Solana DEX/CLMM/router, not Predict. The web app talks to an undocumented gateway that proxies Polymarket's Gamma and CLOB. (H for the docs repo, M for the gateway, from public JS)
5. **Automation is contractually discouraged and trading is gated** to a Byreal account with a Privy embedded wallet on Polygon; the T&C prohibits "frequent, intensive automated interactions using unauthorized tools, bots, or scripts". (H)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Press release 2026-06-09 (Chainwire/PR Newswire syndication), "Byreal Launches Byreal Predict: An Onchain Prediction Market" | Launch date 2026-06-09 ahead of FIFA World Cup (matches 2026-06-11 to 2026-07-19), NBA Finals, MLB; plans to add financial and macro events. https://chainwire.org/2026/06/09/byreal-launches-byreal-predict-an-onchain-prediction-market/ | H |
| `GET https://www.byreal.io/en/predict` | HTTP 200, title "Predict & Earn — World Cup 2026 & Beyond", description "On-chain prediction markets, powered by Byreal"; Next.js app served under `/predict/_next/...`; nav item "Predict" on the main site. The page is a client-rendered shell: no market data in the HTML. | H |
| `GET https://docs.byreal.io/trade/byreal-predict.md` and sub-pages | HTTP 200; Predict docs section exists (Getting Started, Managing Positions, Referral Program, FAQ, Terms). T&C "Effective Date: 9 June 2026". | H |
| Byreal GitHub org `byreal-git` | `byreal-agent-skills` pushed 2026-06-16, `byreal-clmm` 2026-06-17, `byreal-titan-integration` 2026-06-30: org is active, but nothing Predict-specific. | H |
| Polymarket builder volume for Byreal's code | Near-zero since 2026-07-20 (section 9). | H |
| Byreal X post (search result snippet) | A July 2026 poll asking "What prediction markets would you like to see on Byreal?" (crypto 63.2%, esports 21.1%, 19 votes). Tiny engagement. | M |
| Hint: homepage does not mention Predict | Not re-verified for the root page body, but the nav/product pages now link Predict and docs.byreal.io describes it ("prediction markets powered by Polymarket, with limit orders, leverage on supported markets"). | H |

Conclusion: the product is technically live (site, docs, terms), but trading activity ended with the World Cup. (H)

Note: hint said "sponsored gas"; the T&C says gas sponsorship "may be modified or revoked at any time" (section 9 of the T&C), and the docs list a ~3.5% bridge fee, so "zero cost" is only true of network gas. (H)

---

## 2. Kind and market model

- **Kind:** broker / front end for Polymarket (Polymarket "Builder Program" integrator), plus a Telegram-chat agent (RealClaw) that routes through it. (H: FAQ "Who runs the markets?", T&C section 4)
- **Model:** binary Yes/No shares priced $0.01-$0.99 (docs say "between $0.01 and $0.99"), pay $1.00 if correct, $0 otherwise. Central limit order book (Polymarket's CLOB, ~1 s matching delay on sports per T&C section 6). Outcomes are Polymarket conditional tokens (ERC-1155 "Outcome Tokens"). Categorical events are sets of binary markets (Polymarket's structure). No scalar, no AMM, no parimutuel. (H)
- **Invalid market payout:** FAQ says a cancelled/postponed match resolves "invalid" and shares return $0.50 each. (H)
- **Categories offered at launch:** football (all 104 World Cup matches, group/tournament markets), NBA Finals, MLB. Crypto/esports were polled for in July. Whether non-sports markets are listed now: NOT FOUND (searched: docs, press, page HTML; the market list is behind the gateway, not called).
- **Extras that are Byreal's own, not venue features:** server-side take-profit / stop-loss (best-effort, price polled "every few seconds"), RealClaw AI co-pilot ("Prediction Market Trading" doc), referral and fee rebate program. (H)

## 3. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public Predict API | NONE found. `docs.byreal.io/developer/smart-contracts-and-api-and-sdk.md` lists Solana mainnet program IDs (CLMM, Router, Launchpad, RFQ), the CLMM SDK, and `byreal-git/byreal-api-docs`. That repo has `router.md` and `swagger.json` (about 154 KB, ~56 paths under `/byreal/api/dex/v2/...`, server host is an internal test URL). No path contains "predict" or "poly". | H |
| Searched | docs `llms.txt` (full index), `developer/*`, `byreal-api-docs` (README, router.md, swagger.json), `byreal-git` org repo list. | H |
| Undocumented gateway | The Predict web app's public JS configures service paths on `https://api2.byreal.io`: `/byreal/api/gw/pm/gamma` (Polymarket Gamma proxy), `/byreal/api/gw/pm/clob` (Polymarket CLOB proxy), `/gw/pm/v1`, `/privy-proxy/v1`. I did not call it: it is undocumented, and the T&C bars reverse-engineering and unauthorized scripts. | M |
| Canonical read path | **Use Polymarket's official APIs**, which return identical markets and books: `https://gamma-api.polymarket.com`, `https://clob.polymarket.com` (`/book`, `/prices-history`), `https://data-api.polymarket.com`. Docs: https://docs.polymarket.com (index https://docs.polymarket.com/llms.txt). Covered by the Polymarket venue note. | H |
| Auth / limits / websocket for Byreal | NOT FOUND (searched: docs, swagger, repos). Polymarket's own limits and WebSocket streams apply to the canonical path. | H |
| Byreal-specific data worth reading | Polymarket Data API builder endpoints: `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL,MONTH,WEEK,DAY}&limit=50&offset=N` (rows `{rank, builder, builderCode, volume, activeUsers, verified}`; limit capped at 50, so Byreal at rank 79 needs `offset=50`) and `GET /v1/builders/volume?timePeriod={DAY,WEEK,MONTH}` (all builders, DAY file about 17 MB; filter by `builderCode`). | H |

Byreal builder code (public on the leaderboard): `0x0a054e48cdaa55a54b9af2d613994cb9d78e47ae90cb4cb392eb433cacbd8d21`. (H)

Fixtures (`docs/research/fixtures/byreal-predict/`):
- `polymarket-builders-leaderboard-byreal-row.json` (ALL window row and two neighbours; Byreal absent from MONTH/WEEK/DAY pages at offsets 0-150).
- `polymarket-builders-volume-byreal-series.json` (Byreal's DAY/WEEK/MONTH rows filtered from the volume endpoint, about 29 KB).

## 4. Trade path

- **Byreal's own path:** the user signs in (email / Google / Telegram per press release; docs also describe connecting a Solana wallet such as Phantom) and gets a **Privy embedded wallet on Polygon** (the "predict wallet") separate from the Solana wallet. Orders are "constructed by Predict as unsigned payloads and signed through your wallet" (T&C section 5) and posted to Polymarket's CLOB with a builder code attached. The bundled JS contains the Polymarket CLOB client order struct (salt, maker, signer, timestamp, metadata, builder, signature). (H docs, M bundle)
- **Programmatic access for third parties:** NONE offered. No API keys, no documented order endpoint. RealClaw (Telegram agent) is Byreal's only agent surface for Predict. (H)
- **Practical agent route:** skip Byreal and trade Polymarket directly (builder code is optional). Same books, no ~3.5% bridge fee, no extra builder fee, no Byreal ToS exposure.

## 5. Chains and collateral

- Settlement chain: **Polygon** (Polymarket). Collateral: **pUSD** (Polymarket USD), an ERC-20 on Polygon, 6 decimals, USDC-backed and wrapped/unwrapped onchain via `CollateralOnramp` / `CollateralOfframp`, "no current plans to list it on external exchanges". The hint's "Byreal's pUSD stablecoin" in the press release is wrong or loose: pUSD is Polymarket's. (H: https://docs.polymarket.com/concepts/pusd.md; Byreal FAQ "Polymarket's USDC-backed stablecoin on Polygon")
- Funding: USDC on Solana bridged to the Polygon predict wallet by fun.xyz (T&C also lists Relay.link and Circle CCTP as possible providers). Bridge fee about 3.5%, about 30 s, minimum $1; withdrawal back to Solana also charged. (H)
- Byreal itself is on Solana (DEX/CLMM); no Predict program exists on Solana. (H)

## 6. Can a PayBox EVM wallet reach it?

**paybox_reachable: no (for Byreal as a venue).** Reasons: (a) no public order API, (b) Byreal's trading identity is a Byreal-account-bound Privy wallet, not an external wallet you can point at it, (c) T&C bans unauthorized bots. The *underlying* Polymarket CLOB on Polygon is reachable by any EOA/proxy wallet through signed orders, so a PayBox EVM wallet could trade the same liquidity via Polymarket directly; that belongs to the Polymarket adapter, not this one. (M, inference)

## 7. Fees

| Fee | Detail | Tag |
|---|---|---|
| Byreal builder fee | "a markup fee ... expressed in basis points of order notional and disclosed in the user interface prior to order confirmation"; FAQ: charged on taker orders (market and immediately-filling limit orders), none on resting limit orders. Rate **NOT FOUND** (searched: docs, FAQ, T&C, referral page). May differ by surface (web, RealClaw, B2B API). Polymarket caps builder taker fee at 100 bps and maker at 50 bps, one change per 7 days with 3 days notice. | H |
| Polymarket platform fee | Taker only: `fee = C x feeRate x p x (1 - p)`; sports 0.05, crypto 0.07, finance/politics 0.04, economics/culture 0.05, geopolitics 0; makers never charged and get rebates. Builder fee is additive. https://docs.polymarket.com/trading/fees.md and `/programs/builders/fees.md` | H |
| Bridge | about 3.5% in, a fee out (amount not stated). | H |
| Gas | Sponsored at launch, "may be modified or revoked at any time". | H |
| RealClaw AI | Credit consumption for the co-pilot. | H |

For an arbitrage scanner: Byreal adds only cost over direct Polymarket access.

## 8. Resolution and dispute risk

Entirely Polymarket's: UMA optimistic oracle (T&C section 7 and risk list name UMA), with possible dispute/re-vote windows "typically 48 to 96 hours, or longer" during which tokens may not be redeemable. Payouts to the predict wallet "within a few hours of resolution". Byreal has "no authority to modify, override, reverse, or appeal" a resolution and offers no refunds. Invalid markets pay 50 cents per share. (H)

## 9. Liquidity (all figures builder-attributed Polymarket volume for Byreal's code, fetched 2026-10-19, source `data-api.polymarket.com/v1/builders/*`)

- All-time: $6,813,464, 92 active users, leaderboard rank 79 (ALL). (H)
- Monthly: May $7.5K (9 users); June $1.80M (68 users); July $4.99M (49 users); August $5.9K (10 users); September $28 (2 users); October $12.82 (1 user). (H)
- Peak week (starting Sunday 2026-07-05): $2.02M, 28 users. Final-day spike 2026-07-19: $883K. Since 2026-07-20 total about $6.7K. (H)
- Volume definition (one or both sides) is not documented. (M)
- Byreal is absent from the MONTH, WEEK and DAY top-200 pages. No TVL/OI concept: positions are ordinary Polymarket positions. (H)
- There is no separate Byreal liquidity: the depth traders see is Polymarket's.

## 10. Geo / ToS / automation

- Docs: trading blocked in the **United States, United Kingdom, France** (users can browse). T&C (effective 2026-06-09) lists a much longer Restricted Jurisdictions list that includes the US, UK, France, Germany, Italy, Belgium, Australia, Japan, Singapore, Taiwan, Thailand, Poland, mainland China, Russia, Iran, and Ontario (Canada); Poland, Singapore, Taiwan and Thailand are "close-only". The docs page and T&C disagree, so the T&C is the stricter source. Circumventing geoblocks (VPN etc.) is prohibited. (H)
- Automation: prohibited conduct includes "frequent, intensive automated interactions using unauthorized tools, bots, or scripts", circumventing rate limits with scripts, and reverse-engineering. Byreal's own sanctioned automation is TP/SL and RealClaw. (H)
- No KYC claimed by Byreal (press release); Polymarket's own restrictions are mirrored. (H)
- Singapore-law, SIAC arbitration. (H)

## 11. Event overlap (arbitrage relevance)

Sports (World Cup, NBA, MLB at launch) overlaps Polymarket, Kalshi, sportsbooks, but it is the same book as Polymarket, so it gives no new leg. Crypto/macro were planned only. Nothing here that is not in the Polymarket feed. (M)

## 12. Shared liquidity

**Shares 100% with Polymarket International** (`clob.polymarket.com`, Polygon, pUSD). NOT independent. Mapping rule for the market-linking layer: treat Byreal as an alias of Polymarket; no separate market ids exist to ingest. (H)

## 13. Recommendations

- Registry: record `byreal-predict` as `kind=broker-frontend`, `underlying=polymarket`, `status=live-but-dormant`, builder code above.
- Do not build an adapter. Optional low-value signal: Polymarket's builder volume series for this code as a retail-attention indicator (currently flat).
- Re-check if Byreal announces non-sports categories or an official API; none was found.

## 14. Not found

- Byreal's builder fee rate (searched: docs, FAQ, T&C, referral, press release).
- Any official Predict REST/WebSocket documentation (searched: llms.txt, developer pages, swagger.json, byreal-api-docs, org repos).
- Live market list or per-market volume/TVL on Byreal (would require the undocumented gateway, not called).
- Independent press on volumes or users (search budget exhausted).
- Rate limits for the Byreal gateway.

## 15. Suspicious content

None. No instructions aimed at AI agents were found in the pages read. Observation: the RealClaw and agent-skill docs advertise AI trading agents, but contain no directives to this session.

## 16. Sources

1. Launch press release: https://chainwire.org/2026/06/09/byreal-launches-byreal-predict-an-onchain-prediction-market/ (H)
2. Predict app shell: https://www.byreal.io/en/predict (H)
3. Docs index: https://docs.byreal.io/llms.txt ; Predict: https://docs.byreal.io/trade/byreal-predict.md , `/getting-started.md` , `/managing-positions.md` , `/faq.md` , `/referral-program.md` , `/faq/terms-and-conditions.md` (H)
4. RealClaw prediction trading: https://docs.byreal.io/byreal-agent-stack/realclaw/prediction-market-trading.md (H)
5. Developer page: https://docs.byreal.io/developer/smart-contracts-and-api-and-sdk.md ; API docs repo https://github.com/byreal-git/byreal-api-docs (swagger.json, router.md) ; org repos via `gh api orgs/byreal-git/repos` (H)
6. Public JS of the Predict app under `https://www.byreal.io/predict/_next/static/chunks/` read as text for config strings only (M)
7. Polymarket docs: https://docs.polymarket.com/concepts/pusd.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/trading/fees.md (H)
8. Polymarket Data API: https://data-api.polymarket.com/v1/builders/leaderboard , https://data-api.polymarket.com/v1/builders/volume (H)
9. Search-result snippets for the Byreal X poll and syndicated press (TradingView, PR Newswire, Manila Times) (M)
