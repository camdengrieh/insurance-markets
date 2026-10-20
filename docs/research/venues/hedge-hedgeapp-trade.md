# Hedge (hedgeapp.trade, Robinhood Chain) - venue adapter spec

Researched 2026-10-19 (probes about 03:40-04:10 UTC). Tags: **H** = read first-hand in a primary source this session (cited), **M** = secondary, inferred, or computed by me from H data, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing.

Method and rule disclosure: unauthenticated GET of public pages, public JSON endpoints and static JS bundles (read as text, never executed), `gh api` raw reads of one public GitHub repo (no clone, no install), WebFetch/WebSearch, two read-only PayBox `discover_tokens` calls (chain catalog only). No POST/PUT/DELETE, no login, no wallet connect, no key, no signing, no PayBox money or signing tool. I did not read the repo's `.env.example`. I did not use the Blockscout address API (HTTP 403 from the first GET; not retried). Web-search budget ran out mid-pass, so the second search (X/press coverage) was not performed. Scripted requests used User-Agent `insurance-markets-research/0.1`; no personal identifier was sent anywhere. HTTP 402 was seen once (docs host) and is a Vercel `DEPLOYMENT_DISABLED` page, not an x402 payment challenge (no payment requirements to record).

## 0. Bottom line

**adapter_priority: skip.** Hedge is not an independent venue.

1. **1x spot is a Polymarket front end.** Every listed market uses Polymarket's own event id, slug and CLOB token ids (5/5 Yes and 5/5 No token ids of event 606422 are byte-identical to `gamma-api.polymarket.com`), Hedge's `/api/spot/quote` walks the live Polymarket CLOB book (entry 0.88 for 5 and for 1,000 USDG = Polymarket best ask 0.88, size 571,458.74), and the order that is actually sent is a Polymarket FAK buy carrying Hedge's builder code from a Polymarket deposit wallet on Polygon. Hedge's own roadmap says it: "We are still a thin layer on one upstream book for spot" and "There is no Hedge order book". So it is **not** an independent arbitrage leg (section 10).
2. **The parts that are Hedge's own are dust.** Vault leverage (synthetic 2x-4x on Polymarket YES prices, settled in USDG on Robinhood Chain): vault TVL **$48.45**, utilisation about 100%, `openingPaused: true`, `vaultLive: false`, **0 leverage markets** listed today. Native parimutuel pool on Robinhood meme tokens: 1,076 market rows, **every pool 0, 0 tickets, 0 resolved**, $1,000 desk cap (section 9).
3. **No programmatic 1x order path.** The only machine interface is a free, unauthenticated quote API plus a "ticket URL" that sends a human to log in on Hedge (Privy) and confirm the fill. Unsigned-calldata building exists only for the (currently paused) vault.
4. **Docs site is down today**: `docs.hedgeapp.trade` returns HTTP 402 `x-vercel-error: DEPLOYMENT_DISABLED` for every path I tried. The live site and APIs are up.
5. **Cheaper, equivalent route:** anything an aggregator wants from the 1x book it should read from Polymarket directly (covered by the parallel Polymarket workflow). Hedge adds an extra bridge hop and fees and no price information.

Revisit trigger: Hedge-native markets (crypto-price/meme market-cap) with non-zero pools, vault TVL above a few thousand USD with leverage markets listed, or the promised public trade tape (roadmap "Next"). None of these exist today.

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://hedgeapp.trade/` | HTTP 200 on 2026-10-19 03:44 UTC; Vercel; React Router app with server-rendered market data | H |
| `GET /api/spot` capability card | `status: {live: true, markets: 591}` | H, fixture `api_spot_card.json` |
| `GET /api/agent` capability card | `status: {live: true, openingPaused: true, vaultLive: false, betting: true, markets: 590, leverageMarkets: 0}` | H, fixture `api_agent_card.json` |
| Terms page | "Effective date 27 August 2026" | H, https://hedgeapp.trade/terms |
| Roadmap page | "Published 5 September 2026"; lists spot, vault leverage, Earn, Pool, referrals as "live today" | H, https://hedgeapp.trade/roadmap |
| GitHub `noah-codesrh/hedge` | created 2026-08-26, last push 2026-10-10, 0 stars, TypeScript, private-licence README. README text matches `llms.txt` and the live endpoints, so it is almost certainly the app source, but nothing on the site links to it (ownership M) | H (`gh api`) / M (ownership) |
| HEDGE token pair (DexScreener) | Uniswap pair on Robinhood Chain, `pairCreatedAt` 1787856651000 ms = 2026-08-27 | H, fixture `dexscreener_hedge_token_pair.json` |
| CoinGecko | page `hedge-3` exists: "Robinhood Ecosystem", categories GambleFi + Prediction Markets, rank #8259 | H |
| `docs.hedgeapp.trade` (root, `/getting-started`, `/leverage/overview`, `/guides/placing-a-trade`, `/concepts/wallets`) | HTTP 402, `x-vercel-error: DEPLOYMENT_DISABLED`, body "Payment required / DEPLOYMENT_DISABLED" | H, fixture `docs_site_probe_2026-10-19.txt` |
| Activity | `GET /api/agent/bets` -> `{"bets":[]}` (no agent fills ever); `GET /api/referral/leaders` -> `{"tracked":true,"leaders":[]}` | H |

Verdict: **live but about 8 weeks old and essentially unused**. The "Up to 4x leverage" tagline on the homepage is not backed by any open leverage market right now (section 9). Self-reported figures seen in a web-search summary (X claims of 10x leverage, "13k" leverage-pool TVL) conflict with the live endpoints (vault TVL $48.45, max 2x agent cap) and are L.

## 2. Kind and market model

Kind: **onchain-other / front end plus synthetic leverage plus tiny parimutuel**. Three separate products behind one UI:

| Product | Model | Outcome tokenisation | Venue-owned? |
|---|---|---|---|
| **1x "spot"** | Binary Yes/No (and neg-risk multi-outcome groups, e.g. Fed decision with 5 bins) on the **Polymarket CLOB** | Polymarket conditional-token (ERC-1155) positions on Polygon held in the user's Polymarket deposit wallet. Hedge's `yesTokenId`/`noTokenId` are Polymarket CLOB token ids | No (Polymarket's liquidity) |
| **2x-4x "vault leverage"** | Synthetic perp-like position on the Polymarket YES price; `HedgeVault` is the counterparty; price comes from `HedgeOracle`, fed by a Hedge keeper that relays the Polymarket price; tradeable only while Yes is in the 0.35-0.65 band; hand-maintained allowlist of at most about 10 markets | No tokens: positions are rows in `HedgeLeverageEngine` (USDG margin, size, shares, reserve) on Robinhood Chain | Yes, but $48 TVL, paused |
| **"Pool" (native)** | Parimutuel USDG pool, two sides (A/B); `kind: strike` ("Will PONS market cap sit above $400m?") or `kind: pvp` (token A vs token B); windows 15m to 1yr; $1-$25 stake, one ticket per wallet per market, $1,000 desk cap | No tokens: ticket mapping in `HedgePool` | Yes, 0 volume |

Sources: H for the endpoints and for contract/app source (`contracts/README.md`, `HedgeLeverageEngine.sol`, `HedgePool.sol`, `app/lib/server/spot.ts`, `app/lib/trade/live.ts`, `/assets/leverage-uWaiyDPg.js` on the live site). Repo ownership M (section 1).

Price representation: `/api/spot/markets` returns `yes`/`no` as decimals (0.875) and `yesCents` as a string ("88¢"). Prices are Polymarket mid/last values, not Hedge quotes.

## 3. Chains and collateral

- **Robinhood Chain**, chain id **4663**, RPC `https://rpc.mainnet.chain.robinhood.com` (fallback `https://rpc-robinhood.blockmachine.io`), explorer `https://robinhoodchain.blockscout.com`, native ETH. (H: `/assets/robinhood-BzdFcNNV.js` on hedgeapp.trade; PayBox chain catalog also lists `eip155:4663`.)
- **Collateral: USDG** (Global Dollar), `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 decimals, on chain 4663. The contracts hard-code it as the default on 4663. (H: bundle and `contracts/README.md`.)
- **Spot leg runs on Polygon**: USDG on Robinhood Chain is swapped/bridged through Relay (router `0xCcC88a9d1B4ED6b0EABA998850414b24f1c315bE`, H from bundle) into **pUSD** in a Polymarket deposit wallet on Polygon (137); then the CLOB order is signed on Polygon. The code comments "a $5 debit often lands 4.96 pUSD" (H: `app/lib/trade/live.ts`), about 0.8% round-trip friction on a small ticket (M, computed).
- Wallet model: Privy embedded/linked wallet login; Hedge sponsors some gas (`/api/rh/sponsor-send` with a client-signed authorization; likely EIP-7702, M; endpoint H from bundle). The Polymarket deposit wallet is derived by a CREATE2 factory `0x00000000000Fb5C9ADea0298D729A0CB3823Cc07` (M: appears to be Polymarket's deposit-wallet factory; not independently verified).
- Contracts on 4663 (addresses from the live bundle and `/earn`; I could not read them on chain, Blockscout API returned 403): vault `0xa60026C9f5a217730Bb647a5b8eA2aAEAb32a558` (H that `/earn` shows "Vault contract 0xa600…a558"), leverage engine `0xF29f50cf06ac63A834f68B8b0820D0d82f24B43A` (M: bundle constant `n`, matches `VITE_HEDGE_ENGINE_ADDRESS` role), legacy pool `0xf0D392e67904acE892A6024E0501AbfAD67A1c8c` (H: `hedge-pool.ts`; the current pool address is an env var and NOT FOUND in the public bundle), $HEDGE token `0x48DCA2206189013Fa50b9b2C38233B9363d72bD9` (H: `/token` page, CoinGecko).

## 4. Read API

Classification: **official-public (undocumented; docs host disabled)**. The API is advertised in `https://hedgeapp.trade/llms.txt` and by capability-card JSON; the docs URL it points to (`https://docs.hedgeapp.trade/developers`, `/guides/spot`) is currently HTTP 402.

- Base URL: `https://hedgeapp.trade`
- Auth: none for every GET below. An optional `Authorization: Bearer`/`X-Hedge-Agent-Key` header is "a label, not the signer" (H: `/api/agent` card). CORS: `access-control-allow-origin: *` on `/api/spot*` and `/api/agent*` (H, response headers).
- Rate limits: NOT FOUND (searched: response headers on `/api/spot`, `/api/agent/markets`; `llms.txt`; capability cards; repo README; docs host is down). No `ratelimit`/`retry-after` headers observed. `cache-control: public, max-age=0, must-revalidate`.
- WebSocket / streaming: NOT FOUND (searched: bundle, repo route list, `llms.txt`). The upstream Polymarket CLOB has its own WS.
- Docs URL: https://docs.hedgeapp.trade (HTTP 402 today).

| Endpoint | Purpose | Observed (2026-10-19) |
|---|---|---|
| `GET /api/spot` | capability card: limits `minAmount 1`, `maxAmount 10000`, USDG, orderType `FAK`; `status.markets 591` | 200, 1 KB |
| `GET /api/spot/markets?q=&limit=&offset=` | live 1x list: `marketSlug, marketId` (Polymarket Gamma id), `eventSlug, title, yes, no, yesCents, yesTokenId, noTokenId, live, ticketUrl`; `total`, `hasMore`; default 80, max 200 | 200, 44 KB for 80 |
| `GET /api/spot/quote?marketId=\|marketSlug=&side=yes\|no&amount=` | walks the Polymarket book for a buy: `quote{size,spent,shares,entryPrice,unfilled,fillable,source:"book"}` + `ticketUrl` | 200 |
| `GET /api/spot/ticket?...` | same as quote plus ticket URL | not called |
| `GET /api/agent`, `/api/agent/markets?desk=spot\|leverage`, `/api/agent/quote`, `/api/agent/bets`, `/api/agent/positions?wallet=0x...` | "Agent Wall": same markets with `band`, `desk`, `maxLeverage`, `openable` | 200 (positions not called: needs a wallet address) |
| `GET /api/events` | what the site renders: Gamma-shaped events with nested `markets[]` (`yes{label,price,tokenId}`, `no{...}`, `volume24hr`, `liquidity`, `spread`, `endDate`, `enableOrderBook`, `acceptingOrders`, `groupItemTitle`), tags; `nextOffset`, `hasMore` | 200, 562 KB for 76 events (Polymarket numbers) |
| `GET /api/vault` | vault TVL, tranches, utilisation, leverage tiers | 200 |
| `GET /api/native` | native pool markets (1.2 MB, no pagination seen; took over 20 s on first call, a few seconds on second) | 200 |
| `GET /llms.txt` | prose index incl. 40 live markets | 200 |

Real shapes (all saved): quote for market 2589812, 5 USDG: `{"quote":{"size":5,"spent":5,"shares":5.6818,"entryPrice":0.88,"unfilled":0,"fillable":true,"source":"book"}, ...}`; vault: `{"vault":{"tvl":48.450162,"senior":1.31853,"junior":47.131632,"locked":48.450161,"free":0.000001,"utilisation":0.99999998,"depositsPaused":false,...},"tiers":[{"minTvl":0,"leverage":2},{"minTvl":1000,"leverage":3},{"minTvl":5000,"leverage":4},{"minTvl":20000,"leverage":5}]}`.

Quirks an adapter would hit (all H, observed):
- `/api/spot/quote?marketId=<numeric Gamma id>` returned **404 "No live market with that slug or id"** for four ids that `/api/spot/markets` itself lists (2589812, 2589813, 5686979); passing the **slug in the `marketId` parameter works**. Another id returned 409 "not accepting orders".
- `/api/agent/quote` for a 1x market returns `entryPrice` = Polymarket mid (0.125) with `fee: 0` and does **not** walk the book; `/api/spot/quote` does. Do not use the agent quote as an executable price.
- The 591 "live" markets include Polymarket placeholder outcomes ("Will Person H be the next Prime Minister of Israel?", "Person V ... 2028 Republican nomination", all at 50¢). Filter on book depth.
- Hedge gives no depth beyond the walked quote; real depth/spread data are on `clob.polymarket.com/book`.

Fixtures: `docs/research/fixtures/hedge-hedgeapp-trade/` (15 files, largest 8.6 KB). Includes the identity check against Polymarket Gamma and the top-of-book comparison.

## 5. Trade path and PayBox reachability

- **1x spot: no programmatic path through Hedge.** The quote API ends with "Open ticketUrl. The user signs in on Hedge and confirms the 1x fill." (H: `/api/spot/quote`). Placement happens in the browser: Privy login -> Relay swap USDG -> pUSD on Polygon -> Polymarket SDK builds and signs the order with the user's deposit-wallet key -> Hedge's server only adds a builder HMAC via `POST /api/pm/builder-sign` (route file `api.pm.builder-sign.ts`), which requires a Privy session (H: `app/routes/api.pm.builder-sign.ts`). There is no endpoint that accepts a signed order from an outside signer. "No builder key" for third parties (H: `llms.txt`).
- **Vault leverage:** `POST /api/agent/bets` with `{action: open|close, from: <agent wallet>, marketSlug, side, margin, leverage}` returns unsigned `{to, data, value:"0x0", description}` calls for `HedgeLeverageEngine` on chain 4663; the agent signs and broadcasts from its own wallet, then `POST action=submit` with the tx hash (H: capability card + `agent-executor.ts`). Right now it refuses: "New leveraged positions are paused" (`openingPaused: true`), no market is listed (`leverageMarkets: 0`), and the card caps agents at margin 1-5 USDG, leverage 2, daily notional 250 USDG, Yes in 0.35-0.65 (H). I did not POST to test it.
- **Native pool:** on-chain `HedgePool.stake(id, side, amount)` after a USDG approve; the app uses `POST /api/native/prepare|stake` (not tested; session requirements unknown, M).
- **PayBox reachability: partial.** PayBox's chain catalog lists Robinhood (`eip155:4663`, native ETH) and Polygon (137) (H, `discover_tokens mode=chains`), but the tool states the catalog "is not a support allowlist" and I did not (and must not) test signing, so whether a PayBox wallet can send transactions on 4663 and hold USDG there is **unknown**. Even if it can, the only things it could transact with are the paused vault and the empty pool. For 1x, a PayBox Polygon wallet would trade the Polymarket CLOB directly, bypassing Hedge entirely.

## 6. Fees

| Item | Value | Who pays | Tag |
|---|---|---|---|
| Vault open fee | `openFeeBps = 150` (1.5% of notional = margin x leverage) | trader | H, `HedgeLeverageEngine.sol` source default |
| Vault close fee | `closeFeeBps = 150` (1.5% of closed size) | trader | H, source default |
| Entry spread | `spreadBps = 100` (1%) against the trader (`entry = p x 1.01` long, `p x 0.99` short in the web calc) | trader | H, source default + `leverage.js` |
| Borrow carry | `borrowRateBps = 1` per hour on `size - margin`, max 50 | trader | H, source default |
| Liquidation | `liquidationThresholdBps = 9000`; oracle jump guard `maxDeviationBps`; `maxPoolExposureBps = 3000`; hard leverage cap `maxLeverageBps = 50000`, tiered by TVL (2x at 0, 3x at $1k, 4x at $5k, 5x at $20k TVL, `/api/vault`) | trader / LPs | H (source defaults; admin can change all of them, so live values are M) |
| 1x spot | **No explicit Hedge fee found.** Costs are: Polymarket taker/maker fee schedule (the app reserves 15% cover because "sports/EPL fees are a function of shares and price x (1 - price)"), Relay swap/bridge friction (about 0.8% on a $5 ticket, M), and whatever Hedge's Polymarket **builder fee** is (rate NOT FOUND, searched: repo, site JS, roadmap, terms) | trader | H / M |
| Quote shown by agent API | `fee: 0` on 1x | n/a | H |
| Referral | 20% of "the 1.5% take" = 30 bps of referred USDG volume (README) | paid from Hedge's take | H |
| Token | "30% of fees goes straight to buyback and burn" ($HEDGE) | n/a | H, `/token`, `/roadmap` |
| Native pool | no rake in `HedgePool.sol` (winners split the pot; void refunds); API has a `protocolBoost` field (0 everywhere) | n/a | H (source), M (no off-chain rake) |

Terms page (section 12 "Fees and Transactions") only says fees may apply and may be non-refundable (H).

## 7. Resolution mechanism and dispute risk

- **1x spot:** resolution is Polymarket's (UMA-based, covered by the Polymarket workflow); Hedge adds nothing. Positions are Polymarket CTF tokens in the user's deposit wallet. Hedge-specific risk: if Hedge's site is down, the user must redeem through Polymarket's own interface using the Privy-derived wallet (M).
- **Vault leverage:** synthetic. `HedgeOracle` holds relayed prices; when Polymarket stops quoting a resolved market the engine marks it `resolved` with `finalPrice` 0 or 1e18 and positions settle at that (H: `HedgeLeverageEngine.sol` comments, `MarketResolved(marketId, finalPrice)`). The price relayer/keeper is a single Hedge-run process ("Keep its Robinhood ETH above 0.01 or prices and liquidations stop", H README); the admin can change every risk parameter (README says it should be a multisig; actual admin type NOT FOUND). No dispute mechanism.
- **Native pool:** `reporter` or admin calls `resolve(id, outcome)` after expiry; odds/market cap come from DexScreener off chain (H: `HedgePool.sol` header). Outcome 3 = void (refund). Single trusted reporter, no dispute path. Observed: 978 rows are `phase: locked` and **none** has a `resolved_side`, so settlement has not been exercised in the public data.
- Terms: Hedge "may modify, suspend, pause, or terminate markets" (H, terms section 14).

## 8. Geo, ToS and automation

- Terms (effective 2026-08-27): eligibility = "legally permitted to use Hedge ... under the laws applicable to you"; Hedge "may restrict, suspend, or terminate access to users or jurisdictions where participation is prohibited". No jurisdiction list, no US carve-out, no KYC mention. Governing-law clause still reads "[Insert Jurisdiction]" (template placeholder). Contact `admin@hedgeapp.trade`. (H, https://hedgeapp.trade/terms.)
- **Automation:** the Agent Wall explicitly invites outside agents to quote ("Outside agents quote every live Hedge market. ... The wall is free.", "Auth: none"). Terms have no automation/bot clause (NOT FOUND, searched: terms page). The repo README says "Private. Not an invitation to deposit or trade."
- Upstream: the 1x order is placed on Polymarket, so Polymarket's geoblock/ToS binds the order path (M, not re-verified here).
- Site-visible geo gate: none seen in the SSR HTML; not tested from other regions (L).

## 9. Liquidity (all dated 2026-10-19 unless noted)

| Venue-owned measure | Value | Tag |
|---|---|---|
| Vault TVL | **$48.45** (senior $1.32, junior $47.13), locked $48.45, free about $0, utilisation 99.99999% | H, `/api/vault`, `/earn` |
| Leverage markets listed | **0** | H, `/api/agent` |
| Native pool | 1,076 market rows (98 open, 978 locked), sum of pools **$0**, tickets **0**, `deskUsed` 0 of `deskCap` 1,000 | H, `/api/native`, computed |
| Public agent fills | 0 | H, `/api/agent/bets` |
| Referral leaders | none | H |
| $HEDGE token | DexScreener pair liquidity about $11.3K, 24h volume $406, market cap about $15.2K; CoinGecko page: market cap $16.0K, 24h volume $397 | H |
| Hedge's own spot volume / OI | NOT FOUND (searched: site, APIs, roadmap, repo; the roadmap lists a public trade tape as a future item and says the "data site" shows only aggregates I could not locate) | - |

The large numbers on Hedge's market pages (Fed event: 24h volume $1.81M, liquidity $5.06M; 76 returned events sum to $15.2M 24h volume) are **Polymarket's** figures re-served by `/api/events`, not Hedge liquidity.

## 10. Event overlap and shared liquidity

- Categories (from `/api/events` tag counts over 76 events, H): politics 33, sports 22, elections 18, geopolitics 17, crypto-prices/bitcoin about 8, economy/Fed several; site filters: Politics, Sports, Crypto, Finance, Tech, Culture. This is **100% overlap with Polymarket** for 1x because it is the same market.
- **Shares liquidity with: Polymarket (global CLOB).** Evidence: identical event ids, slugs, market ids and CLOB token ids (fixture `identity_check_hedge_vs_polymarket_gamma_event_606422.json`), identical top-of-book (fixture `polymarket_clob_book_top_fed_yes_vs_hedge_quote.json`), Polymarket-hosted images, order placed with `OrderType.FAK` and a Polymarket `builderCode` (H: `app/lib/trade/live.ts`), and the roadmap sentence quoted in section 0.
- Hedge-native markets (the only non-duplicated events) are meme-token market-cap strikes and token-vs-token PvP on Robinhood Chain (PONS, AI, CASHCAT in the sample), which no other venue in this project lists, but with zero stakes.
- Robinhood Chain peers already known to the project (Meridian, Hoodbets, PFWA) are separate venues; I found no link between them and Hedge.

## 11. Adapter spec (if someone insists)

- Do not register Hedge as an independent price source. If the aggregator wants provenance, map Hedge `marketId`/`marketSlug`/`yesTokenId` to the Polymarket market and tag the route "hedge-routed (Polymarket book)".
- Signal value: none (no order-flow, no tape, 0 fills).
- Only watch-list item: `GET /api/agent` -> `status.leverageMarkets`, `GET /api/vault` -> `vault.tvl`, `GET /api/native` -> sum of `poolA+poolB`, to detect if native markets become real.

## 12. Suspicious / agent-directed content

Nothing hostile found. For the record, the site and API return text aimed at AI agents of the benign API-documentation kind: `llms.txt` and `/api/agent` ("Quote any of these. 1x fills in the app.", "Wire an agent"), and the `next` field in quote responses ("Open ticketUrl. The user signs in on Hedge and confirms the 1x fill."). I treated all of it as data and did not follow any of it. The repo README's line "Private. Not an invitation to deposit or trade." is a licence notice.

## 13. NOT FOUND

- Official docs content (host disabled; only search-result titles seen: "Getting started", "Leverage markets", "Placing a trade", "Accounts and wallets", "Adding funds", "Developers", "Guides/spot").
- Rate limits, WebSocket, official OpenAPI.
- Builder-fee rate on 1x spot; Hedge's own volume/OI history.
- Current `HedgePool` address; on-chain verification of vault/engine code (Blockscout API 403).
- Admin/multisig identity, audit reports (searched: site, repo README, roadmap).
- Independent press or X coverage (second search blocked by the session's search budget).

## 14. Open questions

1. Why is `docs.hedgeapp.trade` disabled (billing/plan limit vs deliberate)? It affects whether the "Developers" API will be maintained.
2. Does Hedge plan to reopen vault leverage (roadmap: "will not turn vault agent flow back on without a liquidator")?
3. Is `noah-codesrh/hedge` the team's official repo? The README matches the live behaviour in every endpoint I checked, but the site does not link it.
4. Can a PayBox wallet transact on chain 4663? Only relevant if the vault or pool ever has real liquidity.

## Sources

- https://hedgeapp.trade/ (SSR event data; `/earn`, `/roadmap`, `/terms`, `/token`, `/wall`, `/app`) - H
- https://hedgeapp.trade/llms.txt - H
- https://hedgeapp.trade/api/spot, /api/spot/markets, /api/spot/quote - H
- https://hedgeapp.trade/api/agent, /api/agent/markets, /api/agent/quote, /api/agent/bets - H
- https://hedgeapp.trade/api/events, /api/vault, /api/native, /api/referral/leaders - H
- https://hedgeapp.trade/assets/leverage-uWaiyDPg.js, robinhood-BzdFcNNV.js, pm-funder-Lm0pU4bZ.js, polymarket-8vDrAWyO.js, swap-CgQOOIwc.js, site-links-CJcSAybp.js (static bundles read as text) - H
- https://docs.hedgeapp.trade/ and sub-paths - H for the HTTP 402 `DEPLOYMENT_DISABLED` result; page titles only via WebSearch results (M)
- https://github.com/noah-codesrh/hedge (README.md, contracts/README.md, contracts/src/HedgeLeverageEngine.sol, HedgePool.sol, HedgeVault.sol, HedgeOracle.sol, app/lib/server/spot.ts, app/lib/trade/live.ts, app/routes/api.pm.builder-sign.ts, app/lib/leverage.ts, app/lib/hedge-pool.ts, app/lib/hedge-token.ts) - H for contents, M for ownership
- https://gamma-api.polymarket.com/events/606422 and https://clob.polymarket.com/book?token_id=111061902544814266207267295505639408607400625795891618462682726460921782993748 - H (unauthenticated GET)
- https://www.coingecko.com/en/coins/hedge-3 - H (market data), via WebFetch
- https://api.dexscreener.com/latest/dex/tokens/0x48DCA2206189013Fa50b9b2C38233B9363d72bD9 - H
- PayBox `discover_tokens` (mode=chains) - H for catalog entries only
- WebSearch (extended) result summary for "Hedge hedgeapp.trade ..." - M/L (X claims of 10x and 13k TVL not reproduced)
