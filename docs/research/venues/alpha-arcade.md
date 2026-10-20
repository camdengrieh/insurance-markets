# Alpha Arcade (Algorand) - adapter spec

Researched 2026-10-19 (~00:00-00:30 UTC). READ-ONLY: unauthenticated GETs, one public WebSocket read (query-string subscribe plus the documented `SUBSCRIBE` control message), `gh api` file reads, public Algorand indexer reads. No account, no API key, nothing signed, no POST/PUT/DELETE, no wallet, one read-only PayBox `discover_tokens` call. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (READMEs, market rules, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/alpha-arcade/` (13 files, each <= 10 KB).

## 0. Verdict

**adapter_priority: skip** (revisit only if the project ever adds Algorand signing).

1. Live and active (H): ~750 market apps created in the last 12.7 h; matcher app called within the last minutes; DefiLlama 24h volume $138K.
2. It is a **Polymarket mirror with Polymarket-anchored liquidity**, so it is not an independent arbitrage leg (H, section 6). Native YES/NO quotes sat inside Polymarket's spread on the one market I cross-checked, and the platform sells "routed Polymarket liquidity" through an RFQ API.
3. Thin: TVL ~$0.21M, 7d volume ~$0.57M (DefiLlama).
4. Chain is Algorand (ed25519 accounts, ASA USDC). PayBox's chain catalog has no Algorand, so a PayBox EVM wallet cannot trade or fund it (H).
5. The REST API is key-gated (key = account signup, which this run may not do). Keyless reads exist (public WebSocket + on-chain), and they are good enough for a price/book feed, but that feed mostly duplicates Polymarket.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Matcher app 3078581851 last call | 2026-10-19 00:04 UTC (indexer `/v2/transactions?application-id=3078581851`); >=107 calls 2026-10-18 02:14Z to 00:04Z (page truncated) | H |
| Market-creator account created 748 apps | 2026-10-18 11:22Z to 2026-10-19 00:07Z (fixture `onchain_recent_created_apps_sample.json`) | H |
| Public WS pushing market diffs | `markets_changed` every few seconds (fixture `ws_get-live-markets_sample.json`) | H |
| `@alpha-arcade/sdk` 0.5.2 published 2026-09-13; repo pushed 2026-10-01 | npm registry + `gh api` | H |
| `@alpha-arcade/mcp` 0.3.6 published 2026-05-07; MCP repo last merge 2026-07-16 (combo RFQ tools) | npm + `gh api` | H |
| Algorand Foundation blog 2026-02-06: "third-largest prediction market in daily transactions", $10M volume by 2026-01-23 | promotional | L/M |
| Site `https://www.alphaarcade.com/` | 403 Cloudflare to non-browser clients (WebFetch and curl) | H |

## 2. What it is

- **Kind**: onchain-other (Algorand). Operator per search summary of the site: Meadow Labs Inc (L, not re-verified). Token ALPHA (ASA 2726252423, 6 decimals). Listed on DefiLlama 2025-06-14. First markets Feb 2025 (on-chain `resolution_time` 1740182117 = 2025-02-22).
- **Market model (H, SDK README + on-chain state)**: central limit order book, four-sided (YES bids/asks, NO bids/asks; YES+NO = $1, so a YES bid at 0.30 == NO ask at 0.70).
  - Binary only. "Multi-choice" = a parent plus N child binary markets (title format `Parent : Option`), each its own market app with its own YES/NO ASAs. Child apps must be traded individually.
  - Tokenisation: each market is an Algorand smart contract (app). `split_shares` turns 1 USDC into 1 YES ASA + 1 NO ASA, `merge_shares` reverses it, `claim` redeems the winning ASA after resolution.
  - **Every limit order is its own escrow smart-contract app** (created by the market app, so `created-applications` of the market app's address lists the book). The order locks ~0.957 ALGO MBR (refunded on cancel/fill). Matching is via the matcher app `propose_match` (anyone can match an escrow).
  - Extras: combo/AND-OR parlay RFQ (auction between Alpha house and partner makers; `PARLAY_POOL` apps with `fee_base_percent` 100), ALGO/USD perps vault, ALPHA staking. None needed for the aggregator.
- **Collateral/chain (H)**: Algorand mainnet, USDC ASA 31566704. Needs ALGO for fees/MBR and an ASA opt-in. Algorand has ~3 s blocks, instant finality.
- **Categories seen on-chain today (H, sample of live apps)**: crypto up/down (BTC 5m, 15m, 1h - same series as Polymarket), lower-league soccer (O/U, spreads, BTTS, 1H totals), NFL games, US-Iran ceasefire / Hormuz / blockade, Fed decision. Native "community-created" markets are advertised (M, Algorand blog) but I could not enumerate them.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Docs site | NOT FOUND (searched: docs.alphaarcade.com does not resolve; www/api hosts 403; platform host 401 on every path). Best docs = SDK README at `github.com/phara23/alpha-sdk` and MCP agent guide in `github.com/phara23/alpha-mcp`. Both repos sit under an individual's GitHub account while the npm scope is `@alpha-arcade`; the Alpha-Arcade GitHub org exists but is empty. Treat as team-maintained (M). | H/M |
| REST `https://platform.alphaarcade.com/api` | **Key required** (`x-api-key` header). Every path, including `/docs` and `/openapi.json`, returns `401 {"message":"Unauthorized"}` without it (fixture `platform_api_unauthenticated_401.txt`). Key = signup on the site (email/Google) -> Account -> Partners -> "Create API key" (SDK README). I did not sign up. Rate limits NOT FOUND. | H |
| WebSocket `wss://platform-wss.alphaarcade.com` | **Public, no key** (SDK README). First subscription in the query string (`?stream=get-orderbook&slug=...`), more via `{"id","method":"SUBSCRIBE","params":[{"stream","slug"}]}`. Heartbeat 60 s, idle timeout 180 s, 5 messages/s/connection (SDK README). Confirmed live (fixtures). | H |
| On-chain (Algonode algod/indexer, any Algorand node) | Public; SDK reads markets and books with no key. | H |

**REST endpoints (all from SDK source, shapes NOT verified because key-gated)**: `GET /get-live-markets`, `GET /get-market?marketId=<uuid>`, `GET /get-live-markets-cached?limit=500&lastEvaluatedKey=` (reward markets), `GET /get-full-orderbook?marketId=<uuid>`, `GET /get-routed-orderbook?marketId=<uuid>`, `GET /get-wallet-orders?wallet=&limit=300&cursor=`, `GET /cross-venue-exec/config`, `POST /cross-venue-exec/quote`, `POST /cross-venue-exec/submit-for-wallet`, `GET /get-lp-reward-config`. Market rows (SDK `Market` type) carry `id` (ULID/UUID), `slug`, `marketAppId`, `yesAssetId`, `noAssetId`, `yesProb` (percent), `volume` (dollars), `categories`, `feeBase`, `endTs`, `clobYesTokenId`/`clobNoTokenId` (**Polymarket CLOB token ids**), `livePolyYesAsk`/`livePolyNoAsk`, `seriesId`, reward fields, `options[]`.

**Keyless WebSocket streams (confirmed)**:
- `get-live-markets`: diff messages `{"type":"markets_changed","ts":ms,"changes":[{"marketId","action":"upsert"|"delete","patch":{"yesProb":78.0831,"noProb":21.9169},"optionsPatch":{"<id>-yes":{"yesProb":780831,...}}}]}`. No titles or slugs, so it is only a change feed.
- `get-market&slug=`: `market_changed` with `livePolyYesAsk`, `livePolyNoAsk`, `parlayYesBid/Ask`, `strongestQualifiedNoBid` patches (micro-USDC).
- `get-orderbook&slug=`: `orderbook_changed` keyed by option `marketAppId`: aggregated `bids`/`asks` in cents plus per-order `yes`/`no` detail (`price`, `quantity` in micro, `escrowAppId`, `owner`). **The first message after subscribe can be an empty cold snapshot; the populated one followed ~2 s later** (my short 7-12 s listens on other slugs only saw the cold one, so do not treat an empty first message as an empty book).
- **Slug = last path segment of the on-chain `rules` URL** (e.g. `rules` = `https://alphaarcade-market-rules.s3.us-east-1.amazonaws.com/us-x-iran-ceasefire-october-31-2026` -> slug `us-x-iran-ceasefire-october-31-2026`). Verified on 8 markets. Not documented by Alpha (M).

**On-chain read recipe (H, keyless)**:
- Market creator account `5P5Y6HTWUNG2E3VXBQDZN3ENZD3JPAIR5PKT3LOYJAPAUKOLFD6KANYTRY` (default in SDK) created the matcher and all platform market apps. Market app global state (decoded, fixture `onchain_market_app_global_state_sample.json`): `title`, `rules` (URL to public S3 text), `resolution_time`, `is_activated`, `is_resolved`, `outcome`, `yes_asset_id`, `no_asset_id`, `yes_supply`, `no_supply`, `fee_base_percent` (70000 = 7%), `oracle_address`, `collateral_asset_id`.
- Enumerating *all* creator apps is impractical (`GET /v2/accounts/<creator>/created-applications` with `limit=2` times out on Algonode; `limit=100` returns ~1 MB per page, oldest first). **Practical discovery**: `GET /v2/accounts/<creator>/transactions?tx-type=appl&min-round=<n>&limit=200` returns newest first with `created-application-index`. Many apps are deleted shortly after resolution (46 of 70 randomly sampled ids returned 404).
- Book: `GET /v2/accounts/<applicationAddress(marketAppId)>/created-applications` lists escrow apps; open orders have `quantity - quantity_filled > 0`, fields `price` (micro), `position` (1 YES / 0 NO), `side`, `owner`, `asset_listed`, `fee_timer_start`. I enumerated two live markets this way and found 5 and 9 open orders from 3-4 repeat owners, re-quoted every few minutes (market makers).

## 4. Trade path (programmatic: yes, Algorand-native only)

- Auth/signing: ed25519 Algorand account (25-word mnemonic in SDK; any `algosdk.TransactionSigner` works). Orders are atomic transaction groups of ABI app calls (`create_escrow`, `propose_match`, `cancel`, `amend`, `split`, `merge`, `claim`), signed client-side and submitted to algod. No order-signing API; no off-chain orders.
- `buildFokOrder()` returns an **unsigned** group (fill-or-kill, up to 6 maker escrows) for an external signer; `createLimitOrder`, `createMarketOrder` (slippage in micro), `cancelOrder`, `amendOrder` also exist. Units: price/quantity/slippage in micro (500000 = $0.50, 1000000 = 1 share). Preconditions: USDC ASA opt-in, ~0.957 ALGO per resting order.
- Routed/cross-venue trades need an API key: `POST /cross-venue-exec/quote` then wallet-signed legs to `/submit-for-wallet`; Alpha's market maker signs the other leg and hedges on Polymarket.
- Official clients: `@alpha-arcade/sdk` (TypeScript, MIT), `@alpha-arcade/mcp` (MCP server; read tools work with no env), `@alpha-arcade/cli` (described in README; npm registry 404 at fetch time). Docs explicitly support bots.

## 5. PayBox reachability: **no**

- Alpha Arcade needs an ed25519 Algorand signature over msgpack transactions plus an Algorand USDC/ALGO balance. A PayBox EVM wallet cannot sign Algorand transactions.
- PayBox `discover_tokens(mode=chains, query="algorand")` returned `total_count: 0` on 2026-10-19 (H). The 11-entry chain list in `docs/research/06-paybox-platform.md` also lacks Algorand. No PayBox route (swap/bridge/transfer) delivers ALGO or Algorand USDC.
- Speculative, untested (L): an Algorand address is just a base32 ed25519 public key, so a PayBox *Solana* credential's key is also a valid Algorand account, and the `solanaMessage` intent might sign "TX"||msgpack bytes. I did not and may not test this (it needs `request_wallet_sign`), and funding would still be impossible. Do not plan on it.

## 6. Liquidity sharing with Polymarket: **not independent**

- Market rows carry Polymarket CLOB token ids and `livePolyYesAsk`/`livePolyNoAsk` (SDK types, H; WS `market_changed` shows them populated, fixture `ws_get-market_btc_hourly.json`).
- `getRoutedOrderbook` / MCP `get_routed_orderbook`: "native AA orderbook liquidity plus routed Polymarket liquidity ... source=polymarket, execution=crossVenue" (H). The backend "re-fetches Polymarket liquidity" at submit time.
- Rules text is lifted from Polymarket, including the phrase "source-market creation" (H, `rules` S3 object for the Iran market; also BTC up/down markets use the same Chainlink/Binance language and the Polymarket-style slug `btc-updown-5m-<ts>`).
- Price cross-check (fixture `cross_check_polymarket_vs_alpha_iran_ceasefire.json`, ~00:15 UTC): Alpha YES bid/ask 82.05/82.80c vs Polymarket gamma bid/ask 82/83c on the same question (H). Alpha book depth was ~937 shares of bids and ~7,857 shares of asks across the top four levels (~$0.8K / ~$6.5K).
- Hence Alpha prices follow Polymarket (M-H); its only edge-bearing role would be stale quotes after a fast Polymarket move, which an Algorand-only agent could not exploit through PayBox anyway.

## 7. Fees

- `fee = feeBase * quantity * price * (1 - price)` (SDK `calculateFee`, ceiling, micro units; H). `feeBase` = `fee_base_percent` from the market app: 70000 (7%) on normal markets, 100 (0.01%) on `PARLAY_POOL` apps (H, on-chain).
- Example: 1 share at 0.50 -> 1.75c; at 0.82 -> 1.03c (1.26% of cost). **Taker pays** ("The taker is the order placed last and pays the fee; the maker is the counterparty", SDK types comment, H). Makers pay no trading fee; makers can earn USDC and ALPHA liquidity rewards on selected markets (README, H).
- Extra costs: Algorand network fee (0.001 ALGO per txn), ~0.957 ALGO MBR lock per resting order (refundable), ASA opt-ins.
- Fee destination: SDK staking pools split 45/20/20/10/5 across ALPHA, two Tinyman LPs, Myth alphaALGO and a Pact LP (H); site says 100% of trading fees go to ALPHA holders (M, via search summary; 2025 sources said a buyback-and-burn share, so policy changed - unconfirmed).
- Oddity (M): DefiLlama reports 30d fees of $789 against 30d volume of $1.91M (0.04%), far below what a 7% p(1-p) taker fee implies. So DefiLlama's volume probably includes non-taker flow (splits/merges/maker legs) or the fee data is partial. Do not use DefiLlama volume for edge sizing.
- `fee_timer_threshold` (120) and `fee_timer_start` exist in state; semantics not documented (NOT FOUND).

## 8. Resolution and dispute risk

Observed mechanisms (H unless stated):
1. **Short-horizon crypto**: rules cite Chainlink BTC/USD data stream (5m/15m) or the Binance BTC/USDT 1H candle. A 5-minute market (app 3746527011) was created 23:52:40Z, resolved on-chain at ~00:01:32Z by a different single account (keeper; M on identity).
2. **Platform oracle**: market global `oracle_address` is a single account (older and platform markets).
3. **Oracle-Lite community resolution** (per-market oracle app): permissionless bonded proposal (base bond 25 USDC "on current markets", proposer reward 50 ALPHA), undisputed after the window -> finalize; a dispute needs 2x bond and goes **straight to an `arbiter` address** (single account in oracle state). Outcomes: NO / YES / 50-50 / KEEP_OPEN. (SDK README + `resolution.ts`.)
- Risk: resolution is Alpha's own and not tied to Polymarket's UMA outcome. Rule text is copied, but the arbiter is centralised and a 50-50 outcome exists. For an Alpha-vs-Polymarket pair, budget a **basis/resolution-divergence risk** and an Alpha-operator trust assumption. No external dispute court documented (NOT FOUND).

## 9. Geo / ToS / automation

- ToS, restricted-jurisdictions list: **NOT FOUND** (searched: site `/terms`, `/docs`, `/terms-of-service` all 403; WebSearch found no ToS text). Feb 2025 Algorand podcast summary says Alpha Arcade is "fully available to U.S. users" (L, 8 months old). A Cloudflare front end gates the website; the API/WS hosts did not geoblock this client (cookie showed a non-US region).
- Automation is first-class: official SDK, MCP, CLI, "Building a Trading Bot" section, API keys via the "Partners" tab, market-maker WebSocket for combo RFQs.
- `$ALPHA` staking docs carry a US-securities disclaimer; irrelevant to trading.

## 10. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Volume 24h / 7d / 30d / all-time | $138,413 / $568,227 / $1,906,980 / $25,782,080 | DefiLlama `summary/dexs/alpha-arcade`, daily row 2026-10-18 | H |
| Monthly volume | Oct-2026 (18 days) $1.41M; Sep $1.36M; Aug $1.96M; Jul $2.84M; Jun $2.97M | same | H |
| Peak day | $273,692 on 2026-06-28 | same | H |
| TVL | $208,897 | DefiLlama `protocol/alpha-arcade`, 2026-10-18 | H |
| Fees 30d | $789 | DefiLlama fees | H |
| Resting depth on a hot market | ~$0.8K bid / ~$6.5K ask (top 4 levels), spread 0.75c | WS, 2026-10-19 00:15Z | H |
| Algorand Foundation claim "daily $ volume record ($3.3M)" (2026-03) | does not appear in DefiLlama's chart (max $274K/day) | X post via search summary | L |

## 11. Overlap with other venues

Everything sampled is a Polymarket mirror: BTC up/down (5m/15m/1h), soccer totals/spreads/BTTS, NFL moneylines, US-Iran/Hormuz/blockade geopolitics, Fed decision. These overlap Polymarket, Kalshi (Fed, NFL, BTC), Limitless/Predict.fun (BTC up/down), but because liquidity is Polymarket-anchored they are not new price information.

## 12. Adapter sketch (only if ever built)

- Discovery: tail creator-account `appl` transactions (descending) -> `created-application-index` -> app global state; map to Polymarket via the `rules` slug and `title`; or use the key-gated `/get-live-markets` (`clobYesTokenId`).
- Prices/books: WS `get-orderbook` (ignore the cold first snapshot) or on-chain escrow enumeration. Normalise: cents -> probability; micro -> shares.
- Staleness: treat Alpha quotes older than the escrow's `fee_timer_start`-based age as stale; maker re-quote cadence was minutes.
- Never trade: PayBox cannot reach it.

## Open questions

1. REST response shapes (`get-live-markets`, `get-full-orderbook`, `get-routed-orderbook`) unverified: need an API key (signup).
2. Exact meaning of `fee_timer_threshold`/`fee_timer_start`.
3. Count of live markets and share of volume that is routed to Polymarket vs filled natively.
4. Terms of service / geo restrictions.
5. Whether DefiLlama volume includes split/merge or routed legs (fees/volume ratio suggests so).
6. Who operates the oracle/arbiter keys and whether a 50-50 outcome has ever been used on a mirrored market.

## Sources

- SDK README, source (`constants.ts`, `utils/fees.ts`, `modules/{markets,orderbook,crossVenue,resolution}.ts`, `types.ts`, `websocket.ts`): `gh api repos/phara23/alpha-sdk/contents/<path>` (H, fetched 2026-10-19; repo pushed 2026-10-01).
- MCP README, `src/index.ts` agent guide, `skills/alpha-arcade-mcp/SKILL.md`: `gh api repos/phara23/alpha-mcp/contents/<path>` (H).
- npm registry metadata: https://registry.npmjs.org/@alpha-arcade%2fsdk and `%2fmcp` (H); `@alpha-arcade/cli` returned 404.
- Live REST probe (401): https://platform.alphaarcade.com/ (H). Live WS: wss://platform-wss.alphaarcade.com (H).
- Algorand public indexer/algod: https://mainnet-idx.algonode.cloud/v2/... (H). Market rules objects: https://alphaarcade-market-rules.s3.us-east-1.amazonaws.com/<slug> (H, untrusted text).
- DefiLlama: https://api.llama.fi/summary/dexs/alpha-arcade , https://api.llama.fi/protocol/alpha-arcade , https://api.llama.fi/summary/fees/alpha-arcade (H); page https://defillama.com/protocol/alpha-arcade (listing only).
- Polymarket gamma (price cross-check only): https://gamma-api.polymarket.com/public-search (H).
- PayBox `discover_tokens` (chains, "algorand") and local `docs/research/06-paybox-platform.md` (H).
- Algorand Foundation blog (Super Bowl 2026 / $10M): https://algorand.co/blog/super-bowl-2026-on-alpha-arcade-prediction-market-1 (M, promotional). Algorand podcast 2025-02-25: https://algorand.co/blog/verifiably-random-s2e6-prediction-markets-algorand (L, stale: US availability).
- Algorand Foundation X post (daily record claim): https://x.com/AlgoFoundation/status/2030045859631734879 (L, not readable here; seen via search snippet).
- Token Terminal https://tokenterminal.com/explorer/projects/alphaarcade (listing only, no metrics readable).
- Not reachable: https://www.alphaarcade.com/ and subpaths (403), https://docs.alphaarcade.com (no DNS), npmjs.com package pages (403), web.archive.org (blocked by tool).

## Suspicious content

None that tried to redirect behaviour. The MCP `SKILL.md`/agent guide are addressed to AI agents ("read this first", "use when user asks about prediction markets") - ordinary product docs, not followed. Market rules text and titles are third-party data.
