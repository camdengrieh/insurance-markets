# Kuest - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock on probes: 2026-10-19 02:50-03:05 UTC). READ-ONLY: doc reads, `gh api` raw file reads, unauthenticated GETs to documented Kuest hosts, 2 GETs to Polymarket public endpoints for a price comparison. No account, wallet, key, signature, POST/PUT/DELETE, WebSocket handshake or PayBox tool was used. No third-party code was cloned or run. Third-party pages and API text were treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/kuest/` (listed in section 13).

---

## 0. Bottom line

1. **Live, on Polygon mainnet, but economically empty.** Status page all green (H). Gamma lists 235 open events and the Kuest creator wallet had created one about 2 minutes before I looked (H). But the public Data API holds exactly **one fill ever** (2 shares at 0.62, $1.24, 2026-09-28), global open interest is **0**, and all leaderboards are empty (H, section 9). Across 486 open outcome tokens I found resting orders on **2 tokens, about $50 total** (H, 2026-10-19 ~03:00 UTC, a quiet hour).
2. **It is a Polymarket-style white-label stack, not a new market structure.** CTF (ERC-1155) outcome tokens, off-chain CLOB with on-chain Exchange settlement, Circle USDC on Polygon 137. The API surface is a near-clone of Polymarket's (Gamma / CLOB / Data / WS), so a Polymarket adapter is ~reusable (hosts, header prefix `KUEST_`, V2 order format). (H, migration repo.)
3. **~99.6% of the catalog is mirrors of Polymarket markets** (964 of 968 Gamma markets carry `mirrorConditionId`; 753 of 757 CLOB markets), all created by one Kuest-controlled wallet, all resolved through Kuest's own "Direct Resolution Oracle" (DRO), **not UMA** despite the marketing (H, section 8). Mirrors have **their own** conditionIds, token ids and order books; they are **not** Polymarket's liquidity (section 11).
4. **Useful to the aggregator as a free Polymarket<->Kuest link table, not as a liquidity leg.** The `mirrorConditionId` / `mirrorClobTokenIds` fields are an authoritative first-party market link (H). Prices: Kuest ladder 0.55/0.59 vs Polymarket 0.56/0.60 on the same Gold-up market in the same minute, i.e. quoted ~1c behind Polymarket, no arb (H).
5. **adapter_priority = P2** (thin, signal/link-only). Revisit if `GET data-api.kuest.com/oi` ever shows non-zero OI or `/v1/leaderboard?timePeriod=ALL` returns rows.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Status page https://kuest.instatus.com | "All systems operational"; 90-day uptime: Kuest.com 100%, Clob Server 99.77%, Clob Websocket 100%, Relayer 100%, Data Api 100%, Live Data WS 100% | H |
| GitHub `kuest/prediction-market` | pushed 2026-10-18T19:36Z, 1,106 stars, 808 forks (forks plausibly = operator deployments, M); last commits 2026-10-14/16; created 2025-07-29 | H |
| SDK packages | npm `@kuest/clob-client` 6.0.16 (modified 2026-10-13); PyPI `kuest-py-clob-client` 2.0.15 (2026-10-01) | H |
| Live API | `GET gamma-api.kuest.com/events` returned a BTC 15-minute market with `createdAt 2026-10-19T02:47:39Z` | H |
| Mainnet? | README roadmap ticks "Polygon mainnet support" and "Move matching engine to mainnet"; **in progress: "MVP - stress tests, security, and financial consistency checks"**. Homepage still says "100+ markets launched on testnet" and "100+ operators in early access". Protocol page says "MVP live. Protocol operational." The demo's runtime config has `chainId":137` and Kuest hosts. Migration repo: "Kuest runs on Polygon Mainnet (chainId 137)". | H |
| Independent confirmation | None. WebSearch (extended) found no third-party volume data or coverage; only Kuest's own pages. | M |

Verdict: **still_live = true**, in beta/MVP, mainnet contracts and services running, essentially no organic trading.

---

## 2. Kind and market model

- **Kind (H):** "Shopify for prediction markets": white-label front-end + shared trading backend. Operators run a Next.js/Postgres site (Vercel/Supabase/Docker), Kuest runs CLOB, matching, relayer, Gamma/Data APIs, market-creation worker and resolution sync. Operators earn a share of the taker fee. (https://docs.kuest.com/concepts/architecture)
- **Order book (H):** off-chain CLOB, on-chain settlement through Polymarket-derived CTF Exchange contracts. Fills settle as transfer, **MINT** (two BUYs of complementary outcomes, prices sum >= $1, collateral split into a pair) or **MERGE** (two SELLs, prices sum <= $1). Tick 0.01, `min_order_size` 5 shares on the live CLOB (UI docs say 0.01 shares; trust the API) (H, `/book`, `/clob-markets`).
- **Outcome tokens (H):** Gnosis Conditional Tokens (ERC-1155) positions; binary markets with two outcome labels ("Yes/No", "Up/Down", team names). Event -> markets -> 2 tokens each. **NegRisk** multi-outcome events exist (3 of 954 events listed, e.g. "best AI model") via a NegRisk Exchange/Adapter. No scalar markets found.
- **Not AMM, not parimutuel.** No LP pools; liquidity is limit orders. Maker incentives exist: sponsored market-maker campaigns via an on-chain `MarketMakerEscrow` (operator pays USDC, an approved MM must keep depth/spread/availability) plus Kuest "Maker Rebates" and "Liquidity Rewards" (H, docs.kuest.com/admin/market-making, admin/affiliate).
- **IDs:** Kuest `conditionId` and `clobTokenIds` (uint256 decimal strings) are the trading identifiers. Optional `mirrorConditionId` / `mirrorClobTokenIds` (positional pairing) point at the source Polymarket market. Verified: Kuest `mirrorConditionId` for slug `btc-updown-15m-1792463400` equals Polymarket Gamma's `conditionId` for the same slug, and `mirrorClobTokenIds` equal Polymarket's `clobTokenIds` (H, both hosts, 2026-10-19).

---

## 3. Chains, collateral, contracts

- **Chain:** Polygon PoS mainnet, chainId **137** (H: migration repo, demo runtime config, EIP-712 ClobAuth domain in docs). Testnet Amoy 80002 is the default in `.env.example` and in docs code samples (H); the public hosts `*.kuest.com` serve mainnet (H: markets list Circle USDC `0x3c499c...3359` as reward asset).
- **Collateral:** **Circle native USDC on Polygon** `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` (H, `GET clob.kuest.com/clob-markets/{cid}` and migration repo). Note: Polymarket V2 uses pUSD per the same migration doc, so collateral is **not fungible with Polymarket** (H).
- **Contracts (H, https://github.com/kuest/polymarket-to-kuest/blob/main/MIGRATION.md):** CTF Exchange `0xaa1b8dE834E16eC69C044F5300041673C968c9eF`; Neg Risk CTF Exchange `0xe7FA09cA716FDf498d74AFF618d32AFeacc310aB`; NegRisk Adapter `0xd9416E904e1ab925ad72F03F6D6ce0Aa80fd2dC5`; DepositWallet Factory `0x2CcdC6C5dDcd895aFcCD259F291de9b618A5cA6c`. DRO oracle `0x57827d48Da09ba227aFda89C083b4E35972Aa741`, Resolution Rewards proxy `0x1EedF578442F4C52429BB2B6449Ff0872ae73Be1`, standard DRO CTF adapter `0xc97c5aa5180731c7bB741Fc9B3c293272ca8d33D` (H, docs.kuest.com/api/resolution/overview). I could not verify on-chain bytecode (Blockscout returned a Cloudflare challenge; no JSON-RPC POST made). Audit: "OpenZeppelin-validated architecture" is the only claim; no audit report link found (M).
- **Accounts:** trading account is a **Deposit Wallet** (ERC-1271 smart contract wallet, signature type 3), deployed by the relayer from the user's EOA; USDC must sit in the Deposit Wallet. Gas for trading/approvals is relayed (H, clients-sdks docs).

---

## 4. Read API (public, no key)

Hosts come from `kuest/custom-domain/services.json` and the demo site's runtime config (H). API reference (OpenAPI 3 in repo `docs/api-reference/schemas/*.json`, rendered at https://demo.kuest.com/docs/api-reference) and https://docs.kuest.com/llms.txt (owner docs only).

| Surface | Base URL | Key public GET endpoints (verified live unless noted) |
|---|---|---|
| Gamma (catalog) | `https://gamma-api.kuest.com` | `/events?limit=&offset=&active=&closed=&order=&ascending=`, `/events/slug/{slug}`, `/events/{id}`, `/markets?mirror=true|false`, `/public-search`, `/tags`, `/series`, `/events/creators` |
| CLOB | `https://clob.kuest.com` | `/book?token_id=`, `/price`, `/midpoint`, `/spread`, `/last-trade-price`, `/tick-size`, `/neg-risk`, `/fee-rate?token_id=`, `/clob-markets/{conditionId}`, `/markets-by-token/{token_id}`, `/markets` `/simplified-markets` `/sampling-markets` (cursor `next_cursor`, `LTE=` = end), `/prices-history`, `/rewards/markets/current`, `/time`, `/version` (=`{"version":2}`). POST batch variants `/books /prices /midpoints` exist (not called). |
| Data | `https://data-api.kuest.com` | `/trades?market=&user=&side=&takerOnly=&limit=&offset=`, `/oi?market=`, `/live-volume?market=`, `/holders`, `/positions`, `/activity`, `/v1/leaderboard`, `/v1/builders/leaderboard`, `/v1/builders/volume` |
| WebSocket (market) | `wss://ws-subscriptions-clob.kuest.com/ws/market` | Subscribe `{"type":"market","assets_ids":[...],"custom_feature_enabled":true}`; events `book`, `price_change`, `tick_size_change`, `last_trade_price`, `best_bid_ask`, `new_market`; text `ping` -> `PONG`. Spec: AsyncAPI (fixture). **Not handshaked by me.** |
| WebSocket (user) | `.../ws/user` | needs `auth{apikey,secret,passphrase}`; `order` and `trade` events (status MATCHED/MINED/CONFIRMED/FAILED) |
| Live data WS | `wss://ws-live-data.kuest.com` | activity, comments, Chainlink and Binance price topics |
| Geoblock | `https://geoblock.kuest.com` | returns `{"blocked":bool,"ip":..,"country":..,"region":..}` for the caller (H; I did not store the response because it contains the caller IP) |

**Auth/limits (H, repo docs/api-reference/rate-limits.mdx):** public discovery, books, prices and most analytics need no credentials. Limits: Gamma 4,000 req/10 s overall (`/events` 500, `/markets` 300, `/public-search` 350); CLOB reads 5,000/10 s overall (`/book` 200, `POST /books` 80, `/price` 200, `/prices-history` 100); `POST/DELETE /order` 2,400 per 10 s burst, 24,000 per 10 min. Docs warn limits "can change without an API version change". My 486 sequential `/book` GETs at ~14/s hit no throttling (20 returned 404, see below).

**Response shapes confirmed (fixtures):**
- Gamma event: `{id, slug, title, active, closed, acceptingOrders, endDate, seriesSlug, tags[], negRisk, markets:[{id, conditionId, mirrorConditionId, clobTokenIds:"[\"..\",\"..\"]" (JSON string), mirrorClobTokenIds, outcomes:"[\"Up\",\"Down\"]", mirrorProtocol:"ctf", creator, resolvedBy, resolutionSource, questionID, startDate, endDate}]}`. **No volume, liquidity or OI fields** in Kuest Gamma (Polymarket's Gamma has them, M from prior knowledge); volume/OI must come from Data API.
- CLOB `/book`: `{market, asset_id, timestamp(ms string), hash, bids[{price,size}], asks[...], min_order_size:"5", tick_size:"0.01", neg_risk, last_trade_price:"0"}`. **Ordering gotcha:** Kuest returns bids descending and asks ascending (best first); Polymarket's book on the same day returned best-last. Sort explicitly (H, both fixtures).
- `/clob-markets/{cid}` compact form: `{c, creator, mirror_condition_id, nr, t:[{t, mirror_token_id, o}], mts, mos, fd:{r,e,to}, r:{rates:[{asset_address,...}], min_size, max_spread}, ...}`.
- Data `/trades` rows are Polymarket-shaped (`proxyWallet, side, asset, conditionId, size, price, timestamp, transactionHash, usdcSize, eventSlug, outcome`). Fixture is redacted (third-party pseudonym/profile fields removed).
- Gamma lists events the CLOB does not know: 20 tokens (10 markets, e.g. "White House full lid", "best AI model on October 26") returned HTTP 404 on `/book` although Gamma marks them `active, acceptingOrders` (H). Treat 404 as "no book yet".
- Gamma `GET /events/{id}` 404s for ~1,940 of ids 1..2895: ids appear to be shared across operator sites and Gamma is "site-isolated" (README roadmap) (M). The CLOB `/simplified-markets` is network-wide and showed only two creator wallets (753 + 4 markets), so other operators mostly re-publish the same mirrored catalog (H count, M interpretation).

---

## 5. Trade path (programmatic)

Documented and open (H, repo docs `authentication.mdx`, `clients-sdks.mdx`, clob-client source, migration guide). Not exercised.

1. **L1 credential derivation:** `GET /auth/derive-api-key` or `POST /auth/api-key` with headers `KUEST_ADDRESS, KUEST_SIGNATURE, KUEST_TIMESTAMP, KUEST_NONCE`; signature is EIP-712 `ClobAuth{address,timestamp,nonce,message}` with domain `{name:"ClobAuthDomain", version:"1", chainId:137}` and message "This message attests that I control the given wallet". Returns `{apiKey, secret, passphrase}`.
2. **L2 request auth:** HMAC-SHA256 (url-safe base64) over `timestamp + METHOD + path(no query) + body`, headers `KUEST_ADDRESS, KUEST_SIGNATURE, KUEST_TIMESTAMP, KUEST_API_KEY, KUEST_PASSPHRASE`. Sync clock via `GET /time` first.
3. **Deposit Wallet:** derive address via factory `predictWalletAddress(bytes32(uint256(uint160(owner))))`; deploy (`WALLET-CREATE`) and approve USDC/CTF through the relayer (`relayer.kuest.com`: `/submit` needs a `KUEST-API-KEY` builder credential, `/submit/wallet` is declared without security; both documented, untested; `/operations/approve`, `/operations/set-approval`). Builder credentials are minted by an L2-authenticated `createBuilderApiKey` call (example file). Whether any gate (allow-list, KYC) applies to builder keys: NOT FOUND.
4. **Order (V2):** EIP-712 `Order(salt,maker,signer,tokenId,makerAmount,takerAmount,side,signatureType,timestamp(ms),metadata,builder)`, exchange domain `{name:"CTF Exchange", version:"2", chainId:137, verifyingContract: Exchange}`; `maker=signer=Deposit Wallet`, `signatureType=3`. The EOA signs a nested ERC-7739-style `TypedDataSign{contents:Order, name:"DepositWallet", version:"1", chainId, verifyingContract: depositWallet, salt:0x0}` and the wire signature is `innerSig || appDomainSeparator || contentsHash || orderTypeString || len(typeString)`. `owner` in the POST body is the CLOB API key. Fee amounts are computed by the CLOB; no `feeRateBps` is signed.
5. **Endpoints:** `POST /order`, `POST /orders`, `DELETE /order`, `DELETE /cancel-all`, `DELETE /cancel-market-orders`, `GET /data/orders`, `GET /data/trades`, `POST /heartbeats`; order types GTC, GTD and FOK (arbitrage docs) plus market and post-only orders (SDK example files). Official SDKs: TypeScript `@kuest/clob-client`, Python `kuest-py-clob-client`, Rust `kuest-client-sdk`. Market-maker example repos exist (`kuest/market-maker`, `py-`, `rs-`).
6. **Credential-creation caveat:** the hosted generator at auth.kuest.com writes to a `key_emails` table (kuest/auth README), i.e. the UI path may collect an email. The documented raw L1 `derive-api-key` route does not need one (M). For the PayBox plugin, use the raw route and never pass the user's email.

---

## 6. Could a PayBox EVM wallet trade it?

**partial** (technically plausible, nothing verified at tool level, and no reason to trade it yet).

- Everything the user must sign is off-chain EIP-712 `typedData` on **Polygon 137** (ClobAuth, the nested `TypedDataSign` order, Deposit Wallet batches for the relayer). PayBox `request_wallet_sign` has a `typedData` intent with no documented domain/chain filter, and Polygon (137) is in PayBox's chain catalog (H, per docs/research/06-paybox-platform.md, checked 2026-10-19). One MPC EOA address is shared across `eip155:*`.
- Funding is a plain USDC transfer on Polygon to the user's Deposit Wallet (`request_transfer` or an `evm` transaction proposal). Gas for trading is relayed.
- Blockers/unknowns: (a) the order signature is a composite (inner EIP-712 signature + appended hashes), so the plugin must rebuild it after PayBox returns the 65-byte signature; (b) L2 HMAC secret and builder credentials need custody (same state problem as XO); (c) whether autonomous grants auto-sign `typedData` is unresolved upstream; (d) a malicious market title could try to induce signing arbitrary typed data (see section 8, resolver trust). Not tested: no PayBox tool was called.

---

## 7. Fees

All from https://docs.kuest.com/admin/affiliate (H) unless noted.

- **Taker fee (paid by taker):** `Kuest fee base = shares x rate x [price x (1 - price)]^1` (5-decimal USDC, half-up). Rates: Crypto 0.0441 (maker rebate 20%); Sports 0.0315 (15%); Finance/Politics/Mentions/Tech/Geopolitics 0.0252 (25%); Economics/Culture/Weather/General 0.0315 (25%).
- **Operator gross-up:** `total = ceil_5(base x 10000 / (10000 - operatorShareBps))`; operator gets `floor(total x share)`; Kuest keeps the rest. Default share 30% (range 20-45%), so the trader pays base/0.70. Example in docs: 100 Crypto shares at 50c = $1.575 total (3.15% of the $50 notional); 100 Sports shares at 50c = $1.125 (2.25%) by the same formula (my arithmetic).
- **Maker fee:** flat on fill value, Kuest 0%, operator 0-1% (recommended 0%).
- **Live state today:** `GET /fee-rate?token_id=` for the BTC and Gold markets returns `rate 0.0, category "unclassified", source "local"`. Docs: "An unclassified market remains fee-free until reviewed." So today's mirrored markets trade at **0 fee** (H). Expect this to change; adapters must read `/fee-rate/{token_id}` (versioned schedule) per token instead of hard-coding.
- **Other costs:** market creation fee and a Polymarket-mirror import fee paid in USDC by sponsors (not by traders). No gas for traders (relayer). Funding: on-ramp/LI.FI fees are third-party.

---

## 8. Resolution mechanism and dispute risk

- **Homepage/enterprise copy says "UMA-based resolution"; the README says "UMA resolution (soon)"; the actual markets say otherwise (H):** every one of 968 listed markets has `resolvedBy = 0x57827d48...` = the **Direct Resolution Oracle (DRO)** (Gamma data + docs.kuest.com/api/resolution/overview). A UMA CTF adapter is listed in the contract table for NegRisk, but I observed no market that uses it.
- **DRO is a trusted-resolver design (H):** a proposer wallet that is whitelisted by the *market creator* calls `proposeAndResolve(...)` and the result is immediately final ("DRO resolution is final for approved proposers"); outcomes YES / NO / UNKNOWN(50-50). Users may post a bonded (300 USDC) YES/NO "report" for a reward, but "they cannot force the result"; the approved resolver decides. For the mirrored catalog the creator is the Kuest syncer wallet, so **Kuest effectively resolves every market it mirrors**.
- **Mirror divergence risk (H/M):** Kuest's blog states a mirror's resolution is not automatically the Polymarket outcome; makers are told to "reject a mapping if the resolution source is missing or different". Polymarket resolves via UMA/Chainlink with liveness; Kuest via its own proposer. A cross-venue pair can therefore **settle differently or at different times** (edge cases, 50-50, cancelled events). This is the main structural risk for any Kuest<->Polymarket arb.
- **Dispute window:** user docs describe "dispute window / disputed / final review" states "when supported" via an oracle flow; for DRO I found no challenge period or appeal path (NOT FOUND, searched: docs.kuest.com resolution pages, repo user docs).
- Resolution data syncs from a subgraph; claims are on-chain redemptions via the Exchange/CTF (H).

---

## 9. Geo / ToS / automation

- Operator entity: Kuest, Inc. (Delaware). Terms are on https://kuest.com/legal (anchors `#terms`, `#privacy`) (H via page summary, M for exact wording).
- Automation: "Bots and programmatic access are permitted only through authorized interfaces" (Terms section 8); "permitted automated trading tools" are acknowledged in section 5; spoofing and wash trading prohibited. Kuest publishes bot SDKs, market-maker examples and rate limits, so the documented API is an authorized interface (H for the SDK/docs, M for the legal conclusion).
- Geo: users must not be barred by law, sanctions or geographic restrictions and "must not circumvent access restrictions, including through VPNs" (Terms section 4). Each operator site configures its own blocked-country list (Admin -> General) and optional Sumsub KYC (disabled / observe / required, gating Deposit Wallet creation and trading in that site's UI). The page does **not** list prohibited countries and does not say whether the US is allowed (NOT FOUND, searched: kuest.com/legal). `geoblock.kuest.com` answered `blocked:false` for my (non-US) IP. Whether the CLOB itself, as opposed to the site UI, enforces geoblock/KYC: NOT FOUND.
- License: "Kuest MIT + Commons Clause": you may build frontends/agents on top, but may not host a competing orderbook service without the original contracts (H, repo LICENSE). Irrelevant to a read/trade client.
- Platform stance: "Polymarket-derived architecture" per the site footer; no sign of Polymarket endorsing or objecting (M).

---

## 10. Liquidity (measured, with dates)

| Metric | Value | Source / date |
|---|---|---|
| Cumulative fills in public Data API | 1 fill (taker+maker rows), 2 shares at 0.62, $1.24 | `data-api.kuest.com/trades?takerOnly=false&limit=500`, 2026-10-19 (H) |
| Global open interest | 0 | `data-api.kuest.com/oi`, 2026-10-19 (H) |
| `/v1/leaderboard?timePeriod=ALL`, `/v1/builders/*` | `[]` | 2026-10-19 (H) |
| Open events / markets | 235 events (226 recurring crypto + 9 other) | Gamma, 2026-10-19 (H) |
| Tokens scanned / with any resting order | 486 / 2 (both outcomes of "Gold up or down on Oct 19") | CLOB `/book` sweep, ~03:00 UTC 2026-10-19 (H) |
| Resting notional on those 2 tokens | ~$50 total, 5 shares per level x 5 levels each side | same (H) |
| Tokens with non-zero `last_trade_price` | 0 | same (H) |
| TVL | not applicable (CLOB, no pool) | - |
| Marketing claims | "100+ markets launched on testnet", "100+ operators in early access" (no date) | kuest.com (H that it is claimed; M that it is true) |

Caveat: one sweep at a quiet hour. Rewards endpoint `/rewards/markets/current` was empty (0 incentivised markets), and sponsored MM campaigns are advertised but I found no on-chain evidence of an active campaign (M). The ladder on the Gold market looks like a market-maker bot quoting ~1c behind Polymarket (M).

---

## 11. Event coverage, overlap, and shared liquidity

- **Catalog composition (H, 954 Gamma events created 2026-09-17..2026-10-19):** BTC 5-min and 15-min Up/Down (212 open), ETH/SOL 4-hour Up/Down (14), daily SPX / WTI / Gold Up/Down (3), "White House full lid" (2), "best AI model" NegRisk (2), two MLB Guardians-Rays games (the only non-mirrored markets, by a second creator wallet created 2026-10-16). Politics, macro and long-dated sports are essentially absent.
- **Overlap with other venues:** crypto short-horizon price markets (Polymarket mirrors; likely also listed on other venues, M, not checked here), index/commodity daily direction (Polymarket mirrors), MLB single games (Polymarket). Everything is a direct copy of a Polymarket question, so the "other leg" is Polymarket.
- **Liquidity sharing - what is actually shared (H):** (a) all Kuest operator sites share **one CLOB**: "Markets with the same outcome token IDs use the same Kuest order books" (docs architecture), so the 100+ white-label sites are **not independent legs**, they are one venue; (b) Polymarket **mirrors are not routed to Polymarket's book**: separate conditionId/token ids, separate Exchange contracts, separate USDC collateral. Kuest's own blog: the mirror "does not mean the frontend simply embeds another venue's order book". Market makers hedge on Polymarket by hand/bot. The homepage phrase "shared liquidity from Polymarket" is misleading; it means mirrored catalog, not a shared book (my reading, H for the facts).
- **Consequence for the scanner:** Kuest-vs-Polymarket gaps are real cross-book gaps (two settlement systems), but they are small (hedged MM), shallow ($50), and carry resolver-divergence risk. Kuest's own UI ships an "Arbitrage (Beta)" tab that buys A on Kuest and B on Polymarket with two fill-or-kill orders (non-atomic; H, user docs `arbitrage.mdx`), which confirms the intended use but also that the venue expects to be the *cheap* side only when MMs are lazy.

---

## 12. Adapter recommendation

**adapter_priority = P2** (thin; read-only link/signal adapter, trading deferred).

- Why not P1: ~$0 organic flow, ~$50 resting, a single historical fill, OI 0, centralised resolver, MVP still being stress-tested. Why not skip: live API with strong schema compatibility, official SDKs, and first-party mirror ids that give the aggregator a verified Polymarket link for free.
- Cheapest useful scope: (1) poll `GET gamma-api.kuest.com/events?active=true&closed=false` every few minutes, harvest `{conditionId, clobTokenIds, mirrorConditionId, mirrorClobTokenIds, slug, endDate, resolvedBy}` into the market-linking table with `source=kuest-first-party`; (2) optional `GET /book` for tokens of linked markets, flag only when both sides have size >= `min_order_size` (5); (3) watch `data-api /oi` and `/v1/leaderboard` as the "has this venue woken up" trigger.
- If trading is ever added, reuse the Polymarket adapter with: host swap, `KUEST_` headers, order domain `CTF Exchange` v2, Deposit Wallet signature type 3, Circle USDC, per-token `/fee-rate`, and sort the book yourself.
- Keep Kuest **out of independent-arbitrage-leg counting** with other Kuest-powered sites (same CLOB).

---

## 13. Fixtures saved (`docs/research/fixtures/kuest/`)

| File | What |
|---|---|
| `gamma_events_list_1.json` | `GET gamma-api.kuest.com/events?limit=1&active=true&closed=false` (BTC 15m market, mirror fields) |
| `gamma_event_by_slug_xauusd.json` | `GET /events/slug/xauusd-up-or-down-on-october-19-2026` |
| `clob_book_xauusd_up.json` | two-sided 5x5 book (best-first ordering) |
| `clob_book_empty_btc15m_up.json` | typical empty book, shows `min_order_size`, `tick_size` |
| `clob_clob_markets_xauusd.json` | compact `/clob-markets/{cid}` with `mirror_condition_id`, `mirror_token_id`, reward asset (Circle USDC) |
| `clob_fee_rate_xauusd_up.json` | `{"base_fee":0,"fee_schedule":{"category":"unclassified",...}}` |
| `clob_version.json` | `{"version":2}` |
| `data_api_oi_global.json` | `[{"market":"GLOBAL","value":0}]` |
| `data_api_trades_all_redacted.json` | the only fill ever (pseudonym, profile image, proxy wallet redacted) |
| `docs_clob_websocket_asyncapi.yaml` | official AsyncAPI 3 spec for the CLOB WebSocket |
| `catalog_and_book_survey_2026-10-19.json` | my aggregate counts and the two liquid tokens from the 486-token sweep |

---

## 14. NOT FOUND / open questions

- Mainnet volume or user counts from any independent source (searched: WebSearch extended x2, kuest.com blog/about/enterprise/protocol, DefiLlama not queried).
- A stated list of blocked countries or a US yes/no (searched: kuest.com/legal, docs.kuest.com, repo docs).
- Whether the CLOB (not just the site UI) enforces geoblock/KYC; whether builder API keys are permissionless.
- Any dispute/challenge window for DRO markets; the DRO proposer whitelist composition and any timelock (contract not read on-chain).
- WebSocket behaviour under load (handshake not performed).
- Audit report for the Kuest-modified contracts (only "OpenZeppelin-validated architecture").
- An unverified lead from a search snippet that Polymarket "announced it is leaving Polygon" (single source, L); Kuest's own migration doc says Polymarket V2 still uses Polygon with pUSD. Worth a check by the Polymarket workflow because Kuest's relevance is tied to it.

---

## 15. Suspicious content

- None aimed at me. `kuest/polymarket-to-kuest/AGENTS.md` is a migration checklist addressed to coding agents ("Recommended agent workflow ...: replace env vars, hosts, packages"); it is benign, unrelated to this task, and I did not act on it. Docs pages carry "documentation index" boilerplate pointing to llms.txt; harmless.

---

## 16. Sources

- Homepage https://kuest.com/ ; protocol https://kuest.com/protocol ; enterprise https://kuest.com/enterprise ; legal https://kuest.com/legal ; blog https://kuest.com/blog ; arbitrage post https://kuest.com/blog/prediction-market-arbitrage-polymarket-mirror-markets ; about https://kuest.com/about (page summaries, M for wording)
- Owner docs https://docs.kuest.com/llms.txt , /concepts/architecture , /admin/affiliate , /admin/market-making , /admin/integrations , /admin/general , /configuration/environment-variables , /configuration/custom-domain , /api/resolution/overview , /api/resolution/rewards , /api/create-market/overview , `/api-reference/websocket-asyncapi.yaml` (H, fetched raw as .md/.yaml)
- API reference (user-site docs, source in repo): https://demo.kuest.com/docs/api-reference ; `gh api repos/kuest/prediction-market/contents/docs/api-reference/{index,authentication,rate-limits,clients-sdks}.mdx` and `schemas/openapi-{clob,gamma,data-api,relayer}.json` (H)
- Repo https://github.com/kuest/prediction-market (README, LICENSE, `.env.example`, user docs `exploring-markets/arbitrage.mdx`, `resolution-settlement/*.mdx`) ; https://github.com/kuest/polymarket-to-kuest (README, MIGRATION.md, AGENTS.md) ; https://github.com/kuest/clob-client (`src/order-utils/exchange.order.builder.ts`, `exchange.order.const.ts`, `src/signing/hmac.ts`) ; https://github.com/kuest/custom-domain (`services.json`) ; https://github.com/kuest/auth (README) (H)
- Live endpoints: gamma-api.kuest.com, clob.kuest.com, data-api.kuest.com, geoblock.kuest.com, demo.kuest.com (runtime config in HTML), kuest.instatus.com; Polymarket comparison: gamma-api.polymarket.com `/markets?slug=`, clob.polymarket.com `/book` (H)
- Packages: https://registry.npmjs.org/@kuest%2fclob-client ; https://pypi.org/pypi/kuest-py-clob-client/json (H)
- Repo-internal: docs/research/06-paybox-platform.md (PayBox chain catalog and `request_wallet_sign` semantics), docs/research/08-venues-polymarket-kalshi.md (Polymarket reference) (H for what they record)
- Not accessible: Blockscout (Cloudflare challenge), crates.io (needs a contact address; skipped: "blocked: requires a contact address").
