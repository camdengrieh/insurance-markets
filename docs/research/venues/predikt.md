# Predikt (predikt.gg) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official docs and site (WebFetch), the SDK repo and npm/PyPI/DefiLlama metadata (gh api and unauthenticated GETs with the generic User-Agent), no account, key, wallet, signature, order or PayBox money tool. Third-party pages were treated as untrusted data; nothing in them was followed. WebSearch hit the shared session budget after the first two searches, so no further press or analytics coverage was read.

Tags: **H** = read first-hand in a primary source this session (raw SDK source or README via `gh api`, or a direct probe); **M** = official docs read through a WebFetch extraction (small-model summary of the page), a secondary source, or my inference; **L** = weak, self-reported or stale (older than 6 months counts as stale; nothing here is that old, but the traction numbers are 4 months old and promotional).

Fixtures: `docs/research/fixtures/predikt/` (SDK type files, npm metadata, API-host probe). There are **no live API response samples**: the API is key-gated and its host is not reachable publicly (section 4).

---

## 0. Bottom line

1. **Live, beta, young.** Site, docs, and SDK are active (SDK 0.1.2 published 2026-10-08, repo created 2026-06-08). Operator is 4 Point O Ltd / 4PTO Labs (Sofia, Bulgaria). (H/M)
2. **It is a router and wrapper, not a venue.** It has no market creation, no order book of its own and no resolution of its own. It mirrors Polymarket, Kalshi and Limitless markets, groups "exact" matches, and executes through Polymarket (Polygon) and Limitless (Base) after bridging USDC from a Solana or Sui wallet. Kalshi is browse and simulate only, and its trading is currently flagged "paused". (H/M)
3. **Not an independent arbitrage leg.** All depth and all prices are the underlying venues'. Using it adds a bridge hop, a mandatory 2.5% minimum slippage, an integrator fee, and wrapper custody risk on top of venues the project already integrates directly.
4. **Not reachable with an EVM wallet.** Auth and funding accept only Solana and Sui wallets. A PayBox Solana-family wallet could in principle sign (see section 5), a PayBox EVM wallet cannot participate at all.
5. **adapter_priority = skip** for execution. Narrow optional use: its EXACT/RELATED match labels (with AI confidence and reasoning) could cross-check the project's own market linking, but that needs an API key requested by Telegram, and AGG (agg.market) already offers a documented matching feed per `docs/research/14-platform-of-platforms.md`.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://predikt.gg` | Fetched 2026-10-19. "Powering Prediction Economies", "Try Our Beta" -> `https://predikt.market`; "500k+ markets" across "3 platforms" (unnamed on the page), chains Solana and Sui "with more planned", "~8 s" transfers now, "sub-500ms gateway" coming soon, integrations "To be announced" | M |
| `https://predikt.market` | Fetch returned only the title "Predikt - Unified Trading Platform for Prediction Markets" (client-rendered); app content NOT read | M |
| `https://docs.predikt.gg/` | Live; sections Getting started, Market Scraping and Matching, Chains and Venues, API reference, SDK Reference. API-key requests go to Telegram (`t.me/prediktprotocol`) | M |
| SDK repo `4-point-0/predikt-sdk` | MIT, created 2026-06-08, last push 2026-10-08, 0 stars, not archived; org `4-point-0` ("Web3 Development Hub", created 2022) | H |
| npm `@prediktgg/sdk` | 0.1.0 2026-07-09, 0.1.1 and 0.1.2 both 2026-10-08, latest 0.1.2; 4 maintainers on the operator's domain | H |
| Terms of Service | `predikt.gg/legal/terms-of-service`, "last updated June 12, 2026" | M |
| Venue Status page | Polymarket live, Limitless live, **Kalshi "Paused (trading disabled)" - "Temporarily paused for maintenance"**; page undated, snapshot only | M |
| DefiLlama | `api.llama.fi/protocols` (8,758 protocols, 2026-10-19): no entry matching "predikt" or "4pto" | H (absence) |

Verdict: **still_live = true** (product and SDK actively shipping), but the API itself was not observed responding (section 4). Name collision: PyPI `predikt` 0.1.2 is an unrelated Polymarket trading-agent project (H).

---

## 2. Kind and market model

- **Kind (M):** cross-venue aggregator with a backend (NestJS per the SDK guide, Postgres) that scrapes venues, normalises and embeds markets, matches them across venues, and routes execution. Marketing also says "DeFi protocol", "solver-based, intent-driven execution" and "tokenized, liquid positions"; the official docs never mention a solver and describe a conventional bridge-then-execute flow.
- **Market model (H, SDK types):** every market is a binary YES/NO market with `yesAsk/yesBid/noAsk/noBid`. Multi-outcome events appear as sets of binary markets linked by `eventKey`, `eventTitle`, `outcomeLabel`. There are no scalar or categorical markets of its own.
- **Order book vs AMM (M):** buy/sell simulate returns per-level `fills` and `levelsConsumed`, i.e. the venue's order book depth (Polymarket CLOB). Limitless is described as "on-chain markets". Predikt has no AMM.
- **Tokenisation (M):** on settlement "synthetic position tokens are minted on the user's source chain" (mainly Sui). The docs do not say who controls the real venue-side outcome tokens, but execution docs say batch buys "split by destination venue proxy wallet", so venue positions appear to sit in Predikt-controlled proxy wallets (inference, M). Sui package ids and token contracts are NOT published in anything I read.
- **Identifiers (H, types):** Predikt UUID `id`, plus `platform`, `platformMarketId`, `ticker` (used for execution), `matchedMarketId` for groups.
- **Matching (M, docs `/data-model`):** EXACT = "same question" with "equivalent resolution criteria" and forms tradable groups (needs at least 2 exact members, transitive links allowed with confidence = min along path); RELATED = thematically linked, not tradable. Candidates come from vector similarity, then "verified" with an AI `confidence`. The docs do not say who or what verifies, or how resolution-rule differences are checked.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| User source chains | Sui (`sourceChain "21"`, default) and Solana (`"1"`). Wallet sign-in accepts only `solana` or `sui` | H (SDK `WalletChain`, `SourceChain`) / M (docs) |
| Venue-side chains | Polymarket on Polygon (USDC.e wrapped to pUSD before fills), Limitless on Base (native USDC), Kalshi on Solana (simulate only) | M (docs `/chain-support`) |
| Collateral | USDC, 6-decimal integer strings everywhere | H (README) |
| Bridge | Mayan (named on docs intro page and SDK enum comment); chain-support page says only "a bridge" | M |
| EVM user wallets | Not stated as supported; Polygon and Base are destinations only | M |
| Planned chains | None listed in docs; site says "more chains planned" | M |

---

## 4. Read API

- **Existence:** official, **authenticated** (`official-authenticated`). Every route needs `x-api-key`; keys are requested via Telegram (not self-serve). Market data, matched groups and price history need only the API key; trading, orders, positions, favourites and referrals also need a wallet-signed JWT. (M docs `/authentication`; H SDK `HttpClient` sends `x-api-key` always and `Authorization: Bearer` when a token is set)
- **Docs:** `https://docs.predikt.gg/` (no OpenAPI/Swagger published; `llms.txt`, `sitemap.xml`, `openapi.json` all return the SPA shell, H probe).
- **Base URL: NOT documented.** Docs use relative paths and say hosts come with onboarding. The SDK README example is `https://api.predikt.xyz` and WS `wss://ws.predikt.xyz`. **Probe 2026-10-19 (H):** both hosts fail the TLS handshake with "unrecognized name" (no certificate for that SNI), and `predikt.xyz` itself is a parked domain that redirects to a GoDaddy "for sale" page. Treat the README host as a placeholder; do not send an API key or JWT to it (a parked domain that changes hands would receive them).
- **Prefix drift (H):** the SDK repo's internal `src/sdk-creation-guide.md` lists `/sdk/v1/...` routes and `wss://<host>/ws/markets`; the docs state "no global prefix and no version segment" and SDK 0.1.2 code calls unprefixed paths. Prefer the docs and the 0.1.2 code.
- **Key endpoints (M docs, H SDK paths):**
  - `GET /health` (public, `{status:"ok"}`), `GET /venues/status` (public per SDK comment; returns `[{platform,isTradingEnabled,statusMessage}]`)
  - `GET /markets` (params `search, sort=newest|volume|liquidity|closing, sortOrder, categories[], platforms[], onlyMatched, page, limit<=200`), `GET /markets/world-cup-2026`, `GET /markets/:id`, `GET /markets/:id/details`, `GET /markets/:id/matched-group`, `GET /matched-markets/:id`
  - `GET /price-history/market/:id`, `/price-history/matched-market/:id`, `/price-history/:id` (`interval` 1m|1h|6h|1d|1w|max, or `startTs/endTs`; points `{t seconds, p cents}`)
  - `GET /positions?userAddress=` (docs say no ownership check on `/positions/:id`; any address queryable), `GET /orders/buy|sell|redeem[/:id]`
- **Response shape (H, `fixtures/predikt/sdk-types-*.txt`):** `{data:{markets:[MarketGroupDto]}, pagination}`; group has `id, isGroupOfMultipleMarkets, title, description, category, totalVolume, totalLiquidity, markets[]`; market has `id, platform, platformMarketId, ticker, title, rules, status, category, startDate, endDate, yesAsk, yesBid, noAsk, noBid, volume, liquidity, eventKey, eventTitle, outcomeLabel, yesLabel, noLabel, metadata, createdAt, updatedAt`; detail adds `bestOdds{marketBestOddsForYes, marketBestOddsForNo}`. Categories: Sports, Politics, Crypto, Economics, Tech & Science, Other. Status: UNOPENED, OPEN, PAUSED, CLOSED, DETERMINED, SETTLED.
- **Doc/code conflicts to resolve with a real key:** price units (docs `/data-units`: integer cents 0-100; SDK README: "0-1 range"); pagination field names (docs `page,limit,total,hasNextPage`; SDK types `currentPage,itemsPerPage,totalItems,hasNext`); JWT needed for `/positions` (docs say yes, backend does not enforce).
- **Rate limits (M docs `/api-fundamentals`):** default 60 requests/minute per API key (per-key override possible), browser-embedded keys also 100/min per IP; headers `X-RateLimit-Limit/Remaining/Reset`, 429 with `Retry-After`; throttled calls still count. 60 rpm is too low to scan 500k markets by polling; use WebSocket plus `onlyMatched=true`.
- **WebSocket (M docs `/websocket`, H SDK):** `wss://ws.predikt.xyz` (README), described as unauthenticated but the docs also say the URL is "provided with your API key". Send `{"action":"set_subscriptions","marketIds":[...]}` (replaces the whole list), ping/pong, receive `market_update` with `changes[{field,oldValue,newValue}]` for `yesAsk, yesBid, noAsk, noBid, volume, liquidity, status`. Updates are batched at about 2 s, no replay, no new-market or order events. Data freshness is therefore about 2 s at best, and the scraper's own refresh cadence is not documented.

---

## 5. Trade path and PayBox reachability

**Flow (M docs `/execution`, H SDK):**
1. `POST /auth/challenge {walletAddress, chain: solana|sui}` -> `{nonce, message, isNewUser}`; user signs `message` (Solana: base64 ed25519 signature of the UTF-8 message); `POST /auth/verify` -> `{access_token}` (JWT; wallet taken from the token).
2. `POST /buy/simulate {platform, ticker, outcome 0|1, usdcAmount}` -> per-platform fill estimate for all open exact-matched venues plus `bestPlatform` and `feeBps`. Sell simulate does not expand across venues.
3. `POST /buy {ticker, source: polymarket|limitless, outcome, usdcAmount, sourceChain, slippagePercent>=2.5}` -> `{order, transaction:{bytes: base64 unsigned}, quote:{expectedOutput, bridgeFee, estimatedTime}}`. The caller picks the venue; `bestPlatform` is advisory only.
4. Wallet signs and broadcasts the bridge transaction; `POST /buy/:id/tx-hash {bridgeTxHash}`; poll `GET /orders/buy/:id` until `SETTLED` or `FAILED`.
5. Sell and redeem mirror this (`/sell`, `/redeem`, Solana needs `/solana-tx` link, Sui is event-detected). Batch buy/sell 2-10 items. `POST /buy` or `/sell` with `source:"kalshi"` is not implemented (error); disabled venues return `409 VENUE_TRADING_DISABLED`.

**Arbitrage-hostile properties (M):** minimum slippage is 2.5%, asynchronous multi-hop settlement through a bridge, a bridge fee and an integrator fee on every leg, sells bridge proceeds back, and the 60 rpm limit. Two-sided arbitrage with a thin edge is not feasible here.

**PayBox reachability: `partial`.**
- EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon): **no**. Neither sign-in nor funding accepts an EVM address; Polygon and Base are venue-side destinations handled by Predikt's backend. (M)
- Solana wallet: **possible in principle, untested.** PayBox `request_wallet_sign` has `solanaMessage` and `solanaTransaction` ops (my notes `docs/research/06-paybox-platform.md`, H from the earlier session), enough for the nonce challenge and for signing the returned bridge transaction; PayBox does not broadcast wallet-sign output, so the agent must submit it and then call `/tx-hash`. The `solana` proposal kind is limited to 1,232 bytes, one signer who is also fee payer, no durable nonce; whether a Mayan transaction fits is unknown. API key (Telegram-issued) and JWT would have to live outside PayBox.
- Sui: not in PayBox's 11-chain catalog (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid), and Sui is Predikt's default and richest path. (H from the notes above, 2026-10-19)
- I called no PayBox tool for this note.

---

## 6. Fees

- **Documented:** `quote.bridgeFee` on buys (docs example: `"25000"` = 0.025 USDC on a 10 USDC buy, i.e. 0.25%, an example not a schedule); `feeBps` returned by buy simulate as "your integrator fee rate in basis points" (example 250 = 2.5%); integrators set their own fee with `PATCH /integrator-auth/me/fee` up to a Predikt-set `maxFeeBps`, and fees accrue per venue for the integrator to claim. (M)
- **Not documented (NOT FOUND, searched docs `/execution`, `/integrator-portal`, `/data-units`, `/authentication`, ToS):** the formula linking `feeBps` to what the end user pays, any Predikt platform fee on direct (non-integrator) use, sell/redeem fees, venue fees (Polymarket, Limitless) passed through, and withdrawal costs.
- Marketing "fees up to three times lower than competing platforms" comes via a third-party directory listing, no methodology. (L)

---

## 7. Resolution mechanism and dispute risk

- **No resolution of its own (M).** Markets carry the venue's status and `winningOutcome`; after the venue determines, the holder redeems through `POST /redeem`, which bridges proceeds back to the source chain. Resolution authority and dispute process are therefore each venue's (Polymarket, Limitless), covered by the parallel venue workflow; I did not verify them here.
- **Extra risks specific to Predikt (M):** (a) EXACT matches are AI/embedding-derived and the docs do not describe a resolution-criteria check, so cross-venue "same question" pairs can still resolve differently (use each market's `rules` text, available in the API, to re-verify); (b) synthetic position tokens on Sui/Solana versus real venue tokens held by Predikt proxy wallets (custody, redemption guarantee and what happens if Predikt stops operating are undocumented); (c) refund behaviour if the bridge succeeds but the venue fill fails is undocumented (`FAILED` status exists); (d) no audit or security review was found for the bridge, proxy-wallet or Sui contracts.

---

## 8. Geo, ToS and automation

- **Operator (M):** 4 Point O Ltd, Sofia, Bulgaria; governing law Bulgaria; liability capped at the amount paid or 100 USD; users represent they are not in an embargoed country or on U.S. restricted-party lists; 30 days' notice of material changes; "last updated June 12, 2026".
- **Automation, bots, API use, fees, custody, geo-blocking, age limits, market-resolution disclaimers: NOT FOUND** in the Terms (searched `predikt.gg/legal/terms-of-service`; the privacy policy was not read). The API requires a human-approved key, so automated use is possible only by invitation.
- **Downstream geo risk (not documented):** whether Polymarket's or Kalshi's regional restrictions apply to users who reach those venues through Predikt's proxy wallets is not addressed anywhere I read. Do not assume access.

---

## 9. Liquidity

- **No first-party volume, OI or TVL figure found** (searched: predikt.gg, docs intro, `/market-data-engine`, `/positions`, DefiLlama protocol list).
- Self-reported: "500k+ markets across 3 platforms" (site, M); "200K+ aggregated markets" (third-party directory, L); "3,000+ active wallets, 1,500+ executed transactions, $75K raised" from Predikt's own X posts dated 2026-06-22, relayed by that directory (L, stale by 4 months, promotional). A related token (`$DIK`) was mentioned as a conditional TGE on that raise; outcome unconfirmed (L).
- Group-level `totalVolume`/`totalLiquidity` are sums of the member venues' figures (M), so they are not additional depth.

---

## 10. Event coverage and overlap

- Categories: Sports, Politics, Crypto, Economics, Tech & Science, Other (H, SDK enum). Plus a curated World Cup 2026 endpoint (the tournament has ended, so likely stale).
- **100% overlap with Polymarket, Kalshi and Limitless by construction.** `onlyMatched=true` returns the cross-venue pairs, which is exactly the set the project's own linking should reproduce; there is no market on Predikt that does not exist on one of those three venues.

## 11. Shared liquidity (independence)

**Shares liquidity with Polymarket (CLOB on Polygon) and Limitless (Base); Kalshi is simulate-only.** It is NOT an independent arbitrage leg. Any price gap seen between Predikt and its own source venue is bridge/fee/slippage friction or scrape latency, not an opportunity.

---

## 12. Adapter recommendation

- **adapter_priority = skip.** Duplicate liquidity, key gated by Telegram, undocumented base host, beta, Kalshi paused, 2.5% minimum slippage, no EVM path.
- **If revisited (low value):** read-only signal adapter limited to `GET /markets?onlyMatched=true` and `GET /matched-markets/:id`, ingesting `matchType`, `confidence`, `reasoning` as a second opinion for market linking. Preconditions: an API key and real base URL from the operator, 60 rpm budget, and treat every pair as unverified until the project's own check passes.
- **Revisit trigger:** Predikt lists venues the project cannot reach directly, or publishes a keyless matched-pairs feed.

## 13. Open questions

1. Real production base URL and WS URL, and whether the WS needs the key in its URL.
2. Price units (cents vs 0-1) and pagination field names on the live API.
3. Fee formula end to end (bridge, integrator, platform, venue) and who pays on direct use.
4. Custody model for venue-side positions and the Sui synthetic tokens (package ids, redemption guarantee, audits).
5. How Kalshi trading will settle on Solana and when it re-opens.
6. Who or what verifies EXACT matches and how rule differences are handled.
7. Whether Polymarket/Kalshi geo rules apply to Predikt users.

---

## Sources

- https://predikt.gg/ (home), https://predikt.gg/legal/terms-of-service (ToS, updated 2026-06-12) - fetched 2026-10-19
- https://docs.predikt.gg/ plus `/authentication`, `/api-fundamentals`, `/chain-support`, `/venue-status`, `/data-model`, `/market-data-engine`, `/markets`, `/execution`, `/websocket`, `/quickstart`, `/integration-happy-path`, `/positions`, `/data-units`, `/price-history`, `/integrator-portal`, `/changelog-policy` - fetched 2026-10-19 (WebFetch extraction, tag M)
- https://github.com/4-point-0/predikt-sdk (README, CHANGELOG, `src/http-client.ts`, `src/modules/*.ts`, `src/types/*.ts`, `src/sdk-creation-guide.md`; main @ 68605246, pushed 2026-10-08), via `gh api` raw reads (tag H)
- https://registry.npmjs.org/@prediktgg%2fsdk (versions and dates), https://pypi.org/pypi/predikt/json (unrelated project), https://api.llama.fi/protocols (no Predikt entry) - 2026-10-19
- Host probes (DNS, TLS, `predikt.xyz` parked redirect): `docs/research/fixtures/predikt/api-host-probe-2026-10-19.txt`
- https://polymart.app/predikt (third-party directory, May 29 2026 listing, promotional/paid-placement; source of traction and "200K+" claims, tag L)
- `docs/research/06-paybox-platform.md` (PayBox signing ops, chain catalog, earlier session) and `docs/research/14-platform-of-platforms.md` (AGG, Predikt SDK mention)
- Searches: one WebSearch (extended) returned the SDK repo, a libraries.io PyPI result and directory pages; later searches were refused (session budget).
