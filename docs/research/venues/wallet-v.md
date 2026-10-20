# Wallet V (walletv.io): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch of public pages, unauthenticated GETs (User-Agent `insurance-markets-research/0.1`) to `data-api.polymarket.com` and `clob.polymarket.com`. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text was treated as untrusted data; no embedded instructions were seen.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that, not "no".

---

## 0. Verdict

**adapter_priority: skip** (as a venue or arbitrage leg). Keep a registry alias to Polymarket only; optionally use Polymarket's builder-attribution endpoints to tag Wallet V flow.

1. **Live, but it is not a venue.** Wallet V is a self-custody mobile/web wallet by Virgo Group whose main product is AI trading agents on Hyperliquid and Aster; Polymarket is a connected front-end destination. (H, walletv.io; M for "manual only", see 2)
2. **100% shared liquidity with Polymarket.** Orders go to Polymarket's CLOB with a Wallet V builder code. Every fill in the builder-trades feed is a Polymarket CLOB match (Polymarket `market` conditionIds, Polymarket `assetId` tokens). Not an independent leg. (H)
3. **No Wallet V API, docs, SDK or contracts.** The site lists no developer links; the only support link is a help-centre SPA. ToS bans crawlers/scraping. (H)
4. **Tiny.** Combined Polymarket builder-attributed volume is about $4.62M since 2025-12-02 and now about $1-3K per day. (H)

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://walletv.io/` | HTTP 200; page lists Hyperliquid, Aster, XStocks and Polymarket as connected venues; App Store/Google Play links; TGE/VPoints page | H |
| Press release 2026-06-15 (CryptoSlate/Chainwire, sponsored): Wallet V "incubation project of Virgo Group", self-custody, trades execute on Hyperliquid and Aster; says future releases will include "support for prediction markets" | H (company-sourced) |
| Polymarket `GET /v1/builders/volume?timePeriod=DAY`, builder "Wallet V" | rows every day 2026-09-09 to 2026-10-19 (33 rows), e.g. 2026-10-18 $1,465 / 44 users; 2026-10-19 $58 / 4 users (partial day) | H |
| Same endpoint, builder "walletv.io" | rows 2025-12-02 to 2026-10-16 (294 rows); only $129 in Oct 2026; last row 2026-10-16 | H |
| Polymarket `/v1/builders/leaderboard` | "walletv.io" rank 90 in ALL (volume $4.53M, 775 users, verified); "Wallet V" rank 112 in MONTH ($0.05M, 136 users), rank 117 WEEK ($1.5K, 45 users), rank 113 DAY ($58) | H |
| `clob.polymarket.com/builder/trades` | fills for the new code as recent as 2026-10-19T06:41Z | H |

**still_live = true**, but Polymarket attribution has moved from the "walletv.io" builder code (dead since about 2026-10-16) to a "Wallet V" code (since 2026-09-09). Note that the discovery hint ("Wallet V $0.09M, 147 users, active in monthly list") is a rolling-window figure; lifetime for the new code is $87.9K (H, fixture).

Staleness: the Terms of Service page shows no date and does not mention prediction markets or Polymarket at all (H) so it predates, or ignores, the Polymarket feature. Treat as L for Polymarket-specific rules.

## 2. Kind and market model

- **Kind (H):** wallet + AI-agent front end. The ToS describe "Quant", a rules-based automated trading framework (grid-bot style) and "AI Features" as third-party services (https://walletv.io/public_front/TermsOfService.html). The site's risk text says Wallet V "does not offer any trading services or AI automation tools directly or indirectly" (those are third-party). (H, WebFetch summary)
- **Polymarket scope (M):** Google Play snippet and search summary say Polymarket access is manual (not agent-driven). I could not read the Play page (WebFetch returned only a truncation placeholder) so this is secondary. The homepage body says prediction markets cover "elections, sports, crypto, culture, and more" (H).
- **Market model:** Polymarket's: binary and neg-risk categorical outcome tokens on an off-chain CLOB with onchain settlement. Wallet V adds nothing; the fixtures show Polymarket `outcome` labels ("Yes", "Pistons") and `outcomeIndex`. (H)
- **Tokenisation:** Polymarket conditional tokens (`assetId` is the CLOB token id; `market` is the conditionId). (H, fixture)

## 3. Chains and collateral

- Wallet V as a wallet supports many chains (Bitcoin, Solana, Ethereum, Base, BNB, Arbitrum, Avalanche, Polygon, Optimism, HyperEVM) (H, homepage), but the prediction leg settles wherever Polymarket does: **Polygon, chainId 137**, collateral per the Polymarket docs (not re-verified here; see the Polymarket adapter note). (H for 137 from https://docs.polymarket.com/trading/wallets-auth)
- How Wallet V funds/bridges the Polymarket account, and which Polymarket wallet type (Deposit Wallet default for accounts on or after 2026-05-04, legacy Proxy/Safe) it provisions: NOT FOUND (searched: homepage, ToS, press release, X search summary).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official Wallet V API / docs / SDK | **None.** NOT FOUND (searched: homepage links, `support.walletv.io` (client-rendered, returned only a loading shell), ToS "doesn't address API access", web search). | H |
| GitHub org / contracts | NOT FOUND (searched: web search; homepage links to X, Telegram, TikTok, Instagram, YouTube, app stores only). Not checked with `gh search` beyond that. | M |
| Market data | Not applicable: use Polymarket's Gamma/CLOB/WS APIs (documented in the Polymarket adapter note). | H |

**Useful public reads that name Wallet V (all Polymarket, unauthenticated, H, fixtures in `docs/research/fixtures/wallet-v/`):**

- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={DAY|WEEK|MONTH|ALL}&limit=50&offset=N` returns `[ {rank, builder, builderCode, volume, activeUsers, verified, builderLogo} ]`. **Gotcha:** `limit` is capped at 50 per page; "walletv.io" only appears with `offset=50` (ALL) and "Wallet V" with `offset=100` (MONTH). Page through with `offset`. (fixture `builders-leaderboard-rows.json`)
- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=DAY` returns one row per builder per UTC day since 2025-10-10 (about 53K rows, 17 MB, all builders). `timePeriod=ALL` returns yearly buckets. Compact Sept-Oct 2026 extract in `builders-volume-daily.json`.
- `GET https://clob.polymarket.com/builder/trades?builder_code=<0x..>` returns `{data:[...], next_cursor, limit:300, count}` with per-fill `market`, `assetId`, `side`, `size`, `sizeUsdc`, `price`, `outcome`, `fee`, `feeUsdc`, `builderFee`, `builderCode`, `transactionHash`, `matchTime`, `createdAt`. Unauthenticated at the time of fetch. (fixtures `builder-trades-*.sample.json`, first 5 of 300 rows each)

Builder codes (public leaderboard data, not secrets):
- "Wallet V" (new): `0x569d18dd9e5cc8758e66ed53f6ad41172997cd10317f4e07d67fe4e3ac6a2a04`
- "walletv.io" (old): `0x0c75c57b9e6516b232c80293ed5447c9edc405a5c533648fd7d8354e3e4c28a2`

Auth and limits: none needed for the reads above; rate limits not tested (one request each). Websocket: none from Wallet V; Polymarket's market WS applies.

## 5. Trade path

None via Wallet V. There is no public order API. An agent that wants the same exposure trades Polymarket directly (L1 `ClobAuth` EIP-712 signature on chainId 137 to derive L2 HMAC credentials, signed orders, Deposit Wallet batches; https://docs.polymarket.com/trading/wallets-auth, H) and may attach a builder code to orders. A builder code is "serialized onchain as part of the signed order" and credits volume to that builder (https://docs.polymarket.com/developers/builders/builder-intro, H). Using Wallet V's code from our own orders would only mis-attribute volume and is not something to do without being Wallet V; our adapter should use our own (or no) builder code.

## 6. PayBox reachability

Wallet V itself: **no** (nothing to call; the app is closed mobile/web UI with a seed-phrase wallet). The underlying liquidity is Polymarket on Polygon, which belongs to the Polymarket adapter: an EVM wallet on Polygon reachable through PayBox could sign Polymarket orders/transactions there, but that is out of scope for this venue and must not be credited to Wallet V.

## 7. Fees

- Wallet V platform fee: "currently free, but Virgo may introduce fees at any time" (ToS, H). No schedule on the homepage (H).
- **Builder fee on Polymarket orders (H, measured from fills):**
  - New "Wallet V" code: `builderFee / sizeUsdc` = 1.00% on both BUY and SELL in the 300 most recent fills (BUY: $12.07 on $1,207; SELL: $5.98 on $598), 2026-10-15 to 2026-10-19. Paid by the user on top of Polymarket's own `feeUsdc`.
  - Old "walletv.io" code: `builderFee` = 0 on all 300 most recent fills (2026-09-22 to 2026-10-16).
- Polymarket platform taker fee: `fee = C x feeRate x p x (1-p)`, makers pay nothing; rates by category 0 to 0.07 (crypto 0.07, sports 0.05, politics 0.04, geopolitics 0) (https://docs.polymarket.com/trading/fees, H). Max builder fee caps (taker 100 bps, maker 50 bps) are from sibling notes quoting docs.polymarket.com/programs/builders/fees (M here; the pages I fetched this session did not state them).
- Implication: if a scanner prices a "Wallet V route" it must add 1% to Polymarket cost. There is no reason to do so.

## 8. Resolution and dispute risk

Entirely Polymarket's (UMA optimistic-oracle based, per Polymarket docs; not re-verified in this note, M). Wallet V adds no resolution logic. Added risk: Wallet V is a third-party interface; the risk warning says access to some products "may be restricted in your jurisdiction". (H)

## 9. Geo / ToS / automation

- ToS (https://walletv.io/public_front/TermsOfService.html, H via WebFetch): usable only where lawful; "Restricted Territory" is defined by OFAC/UN/EU/HMT sanctions; Virgo may restrict or suspend access at any time; third-party services "may be unavailable in certain jurisdictions"; bans "robots, spiders, or crawlers" and scraping; silent on API access. No prediction-market-specific or US-persons clause was found (the ToS does not mention Polymarket). Polymarket's own geo rules apply to the underlying venue.
- Entity: Virgo Group (BVI-datelined press release; CEO named in release). Only mentioned for attribution; not relevant to integration.

## 10. Liquidity (all via Polymarket builder-attributed volume; fetched 2026-10-19)

| Code | First/last day | Volume | Notes |
|---|---|---|---|
| walletv.io (old) | 2025-12-02 / 2026-10-16 | $4,528,387 total | monthly: Dec-25 $189K, Jan $1.10M, Feb $468K, Mar $266K, Apr $151K, May $182K, Jun $751K, Jul $775K, Aug $382K, Sep $260K, Oct (3 days) $129 |
| Wallet V (new) | 2026-09-09 / 2026-10-19 | $87,940 total | Sep $38K, Oct (19 days) $49.5K; 25 to 59 daily active users peak |

Combined about $4.62M lifetime (H). Current run rate: about $0.9K to 3.3K per day (H, last week of daily rows). For scale, one top Polymarket event can do tens of millions. Wallet V's own TVL/AUM: NOT FOUND.

## 11. Event-category overlap and arbitrage

Identical to Polymarket (same markets, same books, same prices). Sample fills include sports (NBA team outcomes), crypto and other price-bracket markets (H, fixtures). No venue-unique markets. Not an independent leg: any arbitrage "against Wallet V" is arbitrage against Polymarket.

## 12. Shared liquidity

100% shared with Polymarket (H): `market` values are Polymarket conditionIds, matches are on the Polymarket CLOB (`tradeType: TAKER`, `transactionHash` onchain). Aggregator should alias `wallet-v -> polymarket` and never count it as a second price.

## 13. Open questions

- Which Polymarket wallet type and funding route does Wallet V provision? (NOT FOUND)
- Is the Polymarket feature manual-only or being added to agents? (M: manual per search summary and Google Play snippet; press release says prediction market support is a planned release.)
- Why did attribution switch from "walletv.io" (0% builder fee) to "Wallet V" (1%) on about 2026-09-09? (not documented)

## Sources

- https://walletv.io/ (H, 2026-10-19)
- https://walletv.io/public_front/TermsOfService.html (H)
- https://support.walletv.io (client-rendered shell, nothing readable)
- https://cryptoslate.com/press-releases/wallet-v-launches-public-performance-benchmark-for-ai-trading-agents-on-hyperliquid-and-aster/ (2026-06-15, sponsored; M)
- https://x.com/WalletV_io (WebFetch returned HTTP 402; search snippets only, M); Google Play `prod.walletv.virgo` (not readable via WebFetch, search snippet only, M)
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (H, fixtures)
- https://clob.polymarket.com/builder/trades?builder_code=... (H, fixtures)
- https://docs.polymarket.com/trading/fees, /trading/wallets-auth, /developers/builders/builder-intro (H via WebFetch)
- Sibling notes: `docs/research/venues/almanac-market.md`, `atomic-wallet.md`, `bitget-wallet-polymarket-builder.md` (builder-fee caps, same pattern of wallet front ends on Polymarket)

## Fixtures (`docs/research/fixtures/wallet-v/`)

- `builders-leaderboard-rows.json` (leaderboard rows with both builder codes)
- `builders-volume-daily.json` (compact Sept-Oct 2026 daily rows)
- `builder-trades-wallet-v-new.sample.json`, `builder-trades-walletv-io-old.sample.json` (5 fills each)
