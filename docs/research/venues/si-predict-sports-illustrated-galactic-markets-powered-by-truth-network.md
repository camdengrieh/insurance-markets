# SI Predict (Sports Illustrated / Galactic Markets, powered by Truth Network) - venue spec

Researched 2026-10-19 (probe clock about 04:50-05:00 UTC). READ-ONLY: WebFetch page reads, `gh api` file reads, unauthenticated GETs with User-Agent `insurance-markets-research/0.1`. No account, wallet, key, signature, POST or PayBox tool. Third-party pages and API responses were treated as untrusted data; no embedded instructions to AI agents were seen. WebSearch was unavailable (session budget used up), so no press, analytics or social coverage was read.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model page summary, or my inference; **L** = weak or stale.

Fixtures: `docs/research/fixtures/si-predict-sports-illustrated-galactic-markets-powered-by-truth-network/` (`markets_page1_2026-10-19.json`, `markets_status_ACTIVE_empty_2026-10-19.json`).

---

## 0. Bottom line

1. **The site is up but trading is paused and the venue is effectively dormant.** The home page shows a "THE PAUSE BEFORE THE BIG PLAY" notice: predictions "pause temporarily on the 29th July", "your account stays live", "faster, smarter platform ... 2.0 roadmap"; log in, deposit and withdraw still work. (H, https://sipredict.com/)
2. **Correction to the discovery hint: the pause date is 29 July 2025, not 2026 (M, inference).** The page text carries no year. The official API lists the venue's entire history as 92 markets, all `RESOLVED`, last created 2025-07-21 and last closing 2025-07-30; there is nothing UPCOMING, ACTIVE or CLOSED. So no market has been tradable for about 14.5 months. (H for API data, M for the inference)
3. **There is a real public, unauthenticated REST API** (`https://api.sipredict.com/markets`, `/markets/{id}`, `/tags`) with price, reserves, volume and resolution fields. But it has no trades, order book, history or websocket endpoint, and it currently returns only dead markets. (H)
4. **Lifetime volume was tiny:** sum of per-market `totalVolume` over all 92 markets = 166,601 (units not documented; `totalMonetaryVolume` sums to 92,333 USDC), reserve/liquidity per market 5-20 USDC. (H, my sum of the API data; two test markets named "TEST PROD ..." are in the list)
5. **Same stack as PRDCTR/Predictor, not an independent leg.** Truth Network = Aventus appchain, now rebranded PRDCTR Network (truth-network.io 301-redirects to prdctr.io). The prior PRDCTR note found zero market events on the new mainnet. Galactic Media Management Ltd operates SI Predict and (M) also the predictor.io app, which is a Kalshi re-skin. (H/M, section 8)
6. **adapter_priority = skip.** Dead market list, curated sports-lifestyle prop markets that overlap no other venue, 5-20 USDC pools, no trade path reachable from a PayBox EVM wallet. Cheap re-check: poll `GET https://api.sipredict.com/markets?status=ACTIVE` and skip until `pagination.total > 0`.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://sipredict.com/ | HTTP 200; pause notice (above); no volume stats, no market list | H |
| https://sipredict.com/faq | HTTP 200; 51 Q&A in JSON-LD, describes platform as if trading (FAQ is marketing copy, not updated for the pause) | H |
| https://api.sipredict.com/ | HTTP 200 body `API is running` | H |
| `GET /markets?status=ACTIVE` / `UPCOMING` / `CLOSED` / `CANCELLED` | each `{"data":[],"pagination":{"total":0}}` | H |
| `GET /markets` (no filter) | `total: 92`, all `RESOLVED`, all `BINARY`; createdAt 2025-05-28 .. 2025-07-21, closesAt 2025-05-28 .. 2025-07-30 | H |
| lift.truth-network.io | HTTP 200, last-modified 2025-12-10, still configured for the old "Truth Network" brand and TRUU token | H |
| truth-network.io | 301 to https://prdctr.io/ (rebrand) | H |
| Repo | `Truth-Protocol-Foundation/truth-network-node` pushed 2026-10-15 (chain node alive, not SI Predict specific) | H |

Verdict: **still_live = true only in the sense that the website and wallet deposit/withdraw are up; there is no live market and none for ~14 months.** No 2026 relaunch evidence found (NOT FOUND, searched: homepage, FAQ, API market list; press/social not searchable).

---

## 2. Kind and market model

- Kind: media-brand (Sports Illustrated, licensed from Authentic Brands Group, trademark ABG SI LLC) curated prediction market on a Polkadot-ecosystem appchain, non-custodial per its own terms. (H, FAQ + ToS)
- Market model: **binary YES/NO only** (all 92 markets `type: BINARY`), priced 0-1 USDC, FAQ says "Automated Market Maker ... same AMM design used by Zeitgeist" with `joinPool`, "Buy Complete Set", impermanent loss, and a 0.3% LP fee. Zeitgeist-style outcome tokens (fungible chain assets, not ERC-20). An order book is not mentioned in the FAQ (the hint's "order-book language" is only the generic phrase "matching engine or automated market maker"). (H)
- Markets are created only by the SI Predict team/"Compliance Board"; users cannot create markets. (H, FAQ)
- Content: "lifestyle moments and trends adjacent to live sports" (celebrity attends event, broadcast shows a graphic, stat thresholds in a final). FAQ also says politics and pop culture "may" appear; none seen in the API list. (H)
- API price fields per market: `currentPrice {YES,NO}` (decimal strings), `currentPriceChain {YES,NO}` (integer strings summing to 1e10, i.e. 10-decimal fixed point), `reserves {YES,NO}`, `liquidity`, `stats.{totalVolume,totalMonetaryVolume,totalParticipants,lastTradePrice,priceChanges}`, `resolvedOutcome`. (H, fixture)

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Truth Network, "an Aventus appchain in the Polkadot ecosystem" (ToS section 2); now PRDCTR Network (Substrate, Zeitgeist fork, per the prior PRDCTR note) | H (ToS) / M (identity of the successor) |
| Collateral | USDC only ("exclusive currency") | H (FAQ) |
| Funding | MoonPay fiat on-ramp (KYC via MoonPay mandatory), or transfer USDC from an external wallet "into SI Predict's network" via a bridge | H |
| Withdrawal | USDC from the SI Predict wallet to "any address on Ethereum", 12 hour delay | H (FAQ) |
| Wallet | Privy-created embedded wallet or user-connected wallet | H (FAQ + ToS) |
| Legacy bridge UI | lift.truth-network.io, Ethereum chain id 1, bridge contract in its public config `0x50c02710b06d6AdDb864D6b038010eF6fA1BCd92`, supports TRUU only in that config; not verified on-chain | M |

Base, Arbitrum, BNB, Polygon, Solana: NOT FOUND (only Ethereum bridging documented).

## 4. Read API

| Item | Detail | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: sipredict.com, learn.sipredict.com, FAQ, api.sipredict.com/docs and /openapi.json = 404, GitHub org Truth-Protocol-Foundation). API is undocumented but unauthenticated and public. | H |
| Base URL | `https://api.sipredict.com` (Express-style JSON, `access-control-allow-credentials: true`) | H |
| `GET /markets` | `{data:[...], pagination:{page,pageSize:20,total,totalPages}}`; query params accepted: `status` (UPCOMING, ACTIVE, RESOLVED, CANCELLED, CLOSED), `page`; `limit` is rejected ("property Limit should not exist"), so page size is fixed at 20 | H |
| `GET /markets/{uuid}` | single market `{data:{...}}` | H |
| `GET /tags` | tag list (Fans, Hot, Players, Stats, Teams, Top) | H |
| Trades, order book, price history, events, positions | `/trades`, `/orderbook`, `/events` = 404; `/users` = 401 "Missing authorization". Per-user routes need auth; scheme undocumented. | H |
| Websocket | NOT FOUND | - |
| Rate limits | no `RateLimit-*` headers seen; not documented | H (absence) |
| Chain-level read | Substrate RPC / explorer for the Truth Network mainnet are covered by the PRDCTR note (unofficial Subsquid GraphQL at explorer-api.prdctr.io) | M |

Sample response shape (resolved market, trimmed; full sample in fixture): `id, title, slug, status, type, closesAt (JS Date string), createdAt, stats{totalVolume,totalMonetaryVolume,totalParticipants,lastTradePrice,priceChanges{YES|NO:{daily,hourly}}}, currentPrice{YES,NO}, currentPriceChain{YES,NO}, liquidity, reserves{YES,NO}, resolvedOutcome, tags[], imageUrl, isHero, hidden, goLiveDate`. Note `closesAt`/`createdAt` are non-ISO strings ("Sun Jul 27 2025 15:00:00 GMT+0000 (Coordinated Universal Time)") that need custom parsing.

## 5. Trade path and PayBox reachability

- Programmatic order placement: **NOT FOUND** (no public order API, no SDK, no docs). Trades are Truth Network chain transactions (AMM `buy/sell/join_pool`) sent by the web app, which logs in through Privy; the signing scheme on the chain side is Substrate-style, with how a Privy EVM key controls a chain account not documented (same gap as noted for PRDCTR). (M)
- PayBox EVM wallet: could in principle send USDC on Ethereum to the bridge, but cannot place trades via transaction proposals or EIP-712 signed orders, and there is nothing to trade. **paybox_reachable = no.**

## 6. Fees

From Terms of Use section 3 (https://learn.sipredict.com/terms-and-conditions, WebFetch summary, M) and FAQ (H for the 0.3% LP fee):
- Trade fee 0.3% per completed trade, paid to liquidity providers.
- Winning fee 5% of net winnings at resolution (FAQ says shares redeem at $1.00 USDC minus fees).
- Truth Network fee 1% per transaction, minimum $0.10, cap $0.50.
- MoonPay fees and bridge fees on the user. Operator may change fees by email notice.
Round-trip cost for a small trade is dominated by the $0.10 floor plus the 5% winner fee, which kills arbitrage edges below about 6-8%.

## 7. Resolution mechanism and dispute risk

- Resolved by a **"Compliance Panel at Galactic Markets"**: panel fixes wording, sources and cut-off at creation, reviews after the event, decides Yes/No/Invalid by "unanimous (or supermajority)" vote, then submits the result on-chain, after which contracts settle ($1.00 per winning share minus fees, voids refund stakes). (H, FAQ "How are market outcomes decided")
- FAQ also claims Truth Network validators confirm outcomes by consensus, which conflicts with the Panel description. The FAQ says no formal dispute process is needed. ToS says oracles may be "delayed or inaccurate", disputes go to individual arbitration under LCIA rules in London, governing law Scotland, class actions waived. (H/M)
- Risk: centralised operator resolution, void ("Invalid") possible, no on-chain dispute game. High for a cross-venue leg, since the criteria are bespoke prop wording that rarely matches another venue's contract text.

## 8. Shared liquidity

- SI Predict's own pools are the only liquidity (AMM pools funded by SI Predict seed plus any LPs; 5-20 USDC reserves per market). (H)
- Technology and brand overlap: Truth Network -> PRDCTR Network (Predictor Foundation); Galactic Media Management / Galactic Markets also appears as the operator behind predictor.io (host `api.galacticmarkets.net`, per the PRDCTR note, M). predictor.io's liquidity is Kalshi's, so SI Predict is independent of that, but it is the same chain and operator family, so it adds no independent edge. (M)

## 9. Geo / ToS / automation

- Global in "jurisdictions where prediction markets and crypto trading are permitted"; 18+; KYC via MoonPay required before real-money trading; no countries listed; circumventing geoblocking prohibited (ToS section 6). (H FAQ / M ToS)
- ToS has no automation/bot/API clause (summary: "no rules on bots, automated trading, or API access"); it prohibits spoofing, wash trading, collusion. (M)
- Operator: Galactic Media Management Ltd, Glasgow, UK, under licence from Authentic Brands Group (owner of the SI brand). (M)
- Using the public read API is unrestricted by any stated rule, but the API is undocumented and may change.

## 10. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Markets ever listed | 92 (all resolved; 2 are "TEST PROD" markets) | api.sipredict.com/markets, 2026-10-19 | H |
| Open markets now | 0 | same | H |
| Sum of `totalVolume` over all markets | 166,601 (unit not documented) | my sum, 2026-10-19 | H |
| Sum of `totalMonetaryVolume` | 92,333 | my sum, 2026-10-19 | H |
| Largest market `totalVolume` | 9,457 (Gold Cup final drone shot prop) | API | H |
| Per-market pool | `liquidity` 5.00 or 20.00 | API | H |
| TVL / OI | NOT FOUND | - | - |

## 11. Event overlap with other venues

Markets were bespoke sports/event props (guest attendance, broadcast graphics, pass-completion thresholds in Women's Euro final, Wimbledon, Belgian GP, Hall of Fame game, Gold Cup, NBA graphics). No politics, crypto-price or macro markets in the API list. Essentially **no overlap** with Polymarket/Kalshi/XO contract wording. Arbitrage value: none; at best a signal that a niche prop was priced at X.

## 12. Open questions / re-check triggers

1. Does the "2.0" relaunch run on the PRDCTR Network mainnet (genesis 2026-07-28) and does it expose a new API host? Re-check `status=ACTIVE` count.
2. Is the pause date really 2025? (Inferred from market dates; the page gives no year.)
3. Whether `/markets/{id}` exposes history, and the auth scheme for user routes: NOT FOUND.
4. How a Privy-controlled wallet signs Truth Network transactions: NOT FOUND.

## Sources

- https://sipredict.com/ (pause notice, links; read 2026-10-19) - H
- https://sipredict.com/faq (51 Q&A in JSON-LD: AMM, USDC, fees, resolution Panel, KYC, withdrawal) - H
- https://learn.sipredict.com/ and https://learn.sipredict.com/terms-and-conditions (fees, geo, operator, arbitration; WebFetch summary) - M
- https://api.sipredict.com/ , /markets , /markets?status=..., /markets/{id}, /tags , /users (401) - H
- https://lift.truth-network.io/config/appConfig.js (legacy bridge config) - M
- https://truth-network.io (301 to prdctr.io) - H
- https://api.github.com repos/Truth-Protocol-Foundation/truth-network-node (pushed 2026-10-15; README is a generic template) - H
- Prior note `docs/research/venues/prdctr-predictor-io-ex-truth-network.md` (PRDCTR chain state, Galactic link) - M
