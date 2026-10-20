# Pascal (pascal.trade) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: only unauthenticated GETs to `data.pascal.trade` and public docs; no accounts, keys, signing, POST/PUT/DELETE, or PayBox tool calls. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** read first-hand in a primary source this session, **M** secondary or inferred, **L** weak or stale.

## 1. Verdict

- **Live: yes** (H). `GET https://data.pascal.trade/api/v1/markets` returned 3,255 unresolved markets at seq 10,705,472,171, server time 2026-10-19 (HTTP `date` header and `server_time_ms` 1792368170502). Markets resolved in the last 72 h (NFL, EPL, CFB games; a World Series market on 2026-10-16) via `/api/v1/markets/resolved`. DefiLlama TVL is $2.116M on 2026-10-18.
- **Status: public beta** (H, www.pascal.trade "Now in Public Beta"). Press says private beta June 2026 (M, Yogonet 2026-07-17); DefiLlama listed it 2026-07-29 (H, `listedAt`); earliest market listing in the live feed is 2026-06-09 (H, derived from `listing_ts_ms`).
- **What it is**: noncustodial prediction-market exchange: **offchain central limit order book, onchain settlement/custody in a Solana program, USDC collateral**. Not an AMM. Operator in ToS is "Koganei Maru Ltd."; HQ New York per press (M).
- **Adapter priority: P1.** Excellent, fully public, unauthenticated read API (REST + WebSocket) with order books, and 3,084 of 3,255 markets carry a machine-readable Polymarket reference (`condition_id`, token ids) that makes cross-venue linking exact. Held back from P0 by thin real volume (~$33k taker notional in 24 h), Solana-only execution that needs a separate trading key, geo/ToS exclusions (US and others), and a ToS clause restricting "Platform Data" use by professional/fintech entities.
- Best use: independent price leg and linking oracle for Polymarket-mirrored markets (2026 US midterms, sports, Fed, geopolitics). Execution adapter should be deferred behind the read adapter.

## 2. Market model (H unless noted)

Source: https://docs.pascal.trade/llms/general.txt (generated from the public docs).

- **Instrument**: "bilateral, fully collateralized derivative contracts which settle to a price p in [$0, $1]". A position is either **long** (receives `p`) or **short** (receives `1-p`). "There are no separate outcome tokens (e.g. Yes/No)". No ERC-1155-style tokens, no mint/merge. Yes/No is a UI mapping: buy Yes = BID at p; buy No = ASK at `1-p`; sell Yes/No = reduce-only orders. Buying the opposite side nets against an existing position.
- **Binary vs categorical vs scalar**: each outcome is its own market symbol `EVENT.MARKET` (e.g. `HOUSE_2026_CTRL.DEM`, `TX_SEN_2026.DEM`). Multi-outcome events are sets of independent binary markets sharing the `EVENT` prefix; market rules say some events are **not MECE** ("This Pascal event omits an explicit `Other` market... both markets in this Pascal event settle to `0`" in the House-control rules, see fixture). **Scalar** markets exist (12 of 3,255 live; `display_attributes.scalar` with lower/upper/scale, e.g. `ANTH_IPO_MC_27DEC31_RNG.0_4T`, "[$0T - $4T]"). Settlement price is a value in [0,1], so ranges settle fractionally (M for how scalar ranges resolve; the rules text per market is the authority).
- **Matching**: single limit order book per market, price-time priority; orders batched into **50 ms rounds**, order of processing: cancels, then post-only, then other orders ("comparable to Hyperliquid's matching algorithm"). Self-trade prevention cancels the maker order. Order types: GTC, GTT, IOC; `post_only`, `reduce_only`, `MARKET` (must be IOC with a limit price). Max 50 resting orders per account per market.
- **Tick size**: per market `tick_sig_figs` and `tick_size_min`, symmetric about 0.50 (`tick = max(10^(p_sigs - sig_figs), tick_size_min)` where `p' = min(p,1-p)`). Live example: `tick_size_min=0.001`, `tick_sig_figs=3`. Prices have 6 decimal places; sizes are integer contracts; 1 contract pays up to $1.
- **Quasi-perp framing (M)**: press describes "perpetual futures-style mechanics" with positions able to stay open (Yogonet 2026-07-17). The docs describe settling contracts at resolution; I found no funding rate or perp mechanic in the docs (NOT FOUND: funding, perpetual).

## 3. Chains and collateral (H)

- Chain: **Solana only**. Collateral: **USDC only** ("Pascal uses USDC as its sole collateral token. Only send USDC to your deposit address").
- Program-owned state accounts listed in the docs (Traders `B8FMkiV2fpLrkdHcvejTGaj4gcbYfW2vn5NULvowvCSB`, Positions `6NGtecwsNdvm3qT1F7ARruQ4eZpbBNfZcn4D33pj3dVv`, Markets `8hktgNpvPg72bqbDwNorJhGsz9D1Vo7cHMN9jKei1Cb1`) plus 8 buffer accounts. These are public venue accounts, not the user's. The Program ID itself and the USDC mint are NOT FOUND in the docs I read (searched: llms-full.txt for "program id", "mint", "EPjFWdd5"); it only says the "deployment's USD token mint".
- Deposit: each owner wallet has an **immutable per-account deposit address** (PDA-derived; "the deposit address PDA itself is never created", only its USDC ATA exists). Fund by sending USDC to it from a wallet, "or by withdrawing from Polymarket or another centralized exchange to your generated deposit address". Deposits credited to `collateral_usd`; pending ones show in `pending_deposits`.
- Withdrawal: wallet-signed; **flat $0.50 withdrawal fee** ("current signed withdrawal fee is $0.50"), sent to the owner-specified USDC ATA.
- Collateral accounting: opening a position reduces Free Collateral by the worst-case loss (long q at p locks `q*p`; short locks `q*(1-p)`), unlocked on settlement or when trading out.
- Custody/upgrade risk: upgrade authority is a Fordefi multisig (shown as a normal on-curve wallet); "In the future the Pascal program will also include timelocked upgrades" (H, docs). Program guarantees: funds move only with trader signatures; trades only at crossing prices; revoked trading keys cannot match. It does **not** enforce book state (offchain engine) or provide oracles. DefiLlama shows `audits: "0"`; a web search found no audit report (NOT FOUND: any third-party audit).

## 4. Read API (H) - official, public, unauthenticated

- Docs: https://docs.pascal.trade (JS-rendered; machine-readable index at https://docs.pascal.trade/llms.txt, sections `/llms/general.txt`, `/llms/api.txt`, `/llms/request-signing.txt`, full dump `/llms-full.txt`, about 250 KB).
- Base URLs: REST read `https://data.pascal.trade`; market-data WebSocket `wss://data.pascal.trade/ws`; write REST `https://trade.pascal.trade`; order-entry WebSocket `wss://trade.pascal.trade/ws`; web app `https://app.pascal.trade`. Matching engine in AWS ap-northeast-1.
- Auth: "Read requests are unauthenticated." CORS `access-control-allow-origin: *`; Cloudflare in front; response `cache-control: no-store`. No API key.
- Rate limits: "may change"; handle HTTP 429 `RATE_LIMITED`. Order endpoints 100 req/s, 50 orders/batch. Order-entry WS 1,000 req/s. Market-data WS: 10,000 concurrent connections, 5,000 subscriptions per connection. Text search: 60 req/min/IP. Some read endpoints have lower unspecified limits (NOT FOUND: a numeric limit for `/markets`, `/books`, `/trades`). No rate-limit headers were returned on my requests.
- Envelope: `{"status":"success|error","data":...,"seq":"<u64 str>","state_time_ms":...,"server_time_ms":...}`. All decimals are 6-dp strings, ids/sizes/timestamps are strings, timestamps are Unix ms. `seq` is a global monotonic counter, comparable across REST and WS.

Key endpoints (all GET unless noted):

| Purpose | Endpoint | Notes |
|---|---|---|
| Server time | `/api/v1/time` | verified |
| All unresolved markets | `/api/v1/markets` | **5.9 MB, 3,255 markets**; includes spec, `mark_price`, `best_bid`, `best_ask`, `long_interest`/`short_interest`, 24h and all-time stats, `rules_url`, `display_attributes` (tags, topic, `reference`, `scalar`, `market_type` incl. sports typing) |
| Resolved markets | `/api/v1/markets/resolved?lookback=4h\|24h\|3d&order_by=...&limit=50\|100\|200` | verified; `resolution.price` is the final settlement price |
| Lookup by symbol/event/game | POST `/api/v1/markets/search` ; POST `/api/v1/markets/text-search` | read-only POST; I did **not** call these (rule: no POST) |
| Order books | `/api/v1/books?symbols=A,B,...` (max 50) | L2 `[price,size]` string tuples, may be up to 1 s stale; verified |
| Trades | `/api/v1/trades?symbols=...&limit&before_cursor` ; `/trades/batch` | public trades include `maker`/`taker` wallet pubkeys; verified |
| Candles | `/api/v1/trade-candles`, `/mark-price-candles`, `/mark-price-candles/batch` | |
| Top holders | `/api/v1/top-holders` | |
| Account state | `/api/v1/accounts/{owner}` (+ `/fills`, `/transfers`, `/history`, `/position-resolutions`, `/deposit-address`, `/trading-keys`) | unauthenticated by owner pubkey |
| Live book | WS `{"type":"subscribe","channels":[{"channel":"book","symbol":"..."}]}` | snapshot then price-level updates (size 0 = removal); also `trades`, `all_trades`, `candles`, `mark_price_candles`, `account`, `market_update`; ping/pong |

- **No pagination on `/markets`**: one 5.9 MB response. For the scanner, poll `/markets` at a low rate (it already contains best bid/ask per market) and stream `book` over WS for linked markets.
- Fixtures saved under `docs/research/fixtures/pascal/` (all from 2026-10-19):
  - `markets_list_sample.json` (5 unmodified market objects: politics, sports, policy, scalar, one without Polymarket reference)
  - `books_sample.json` (3 books, unmodified)
  - `trades_sample.json` (maker/taker wallet pubkeys replaced by `REDACTED`)
  - `market_rules_HOUSE_2026_CTRL.DEM.md` (rules text from the S3 `rules_url`)
  - `markets_aggregate_2026-10-19.json` (derived stats, see section 9)
  - `defillama_pascal_tvl_tail.json` (derived from api.llama.fi)
- Market-level fields worth normalising: `symbol` (`EVENT.MARKET`), `display_attributes.event_description` / `market_description`, `outcome_labels` (long/short names; default Yes/No), `expected_resolution_time_ms`, `reference` (see section 8), `tags`, `topic`, `taker_fee_rate`, `maker_rebate_share`.
- Live sample (book, `HOUSE_2026_CTRL.DEM`, 2026-10-19): best bid 0.905 / ask 0.907, with 50,000-contract resting tiers at 0.912 (ask) and 0.89/0.88/0.87 (bid). Polymarket CLOB (`clob.polymarket.com/book`, the referenced token) at the same minute: best bid 0.90 / ask 0.91. Pascal showed the tighter spread. This single pair is a spot check only, not a basis study.

## 5. Trade path (H from docs; nothing was sent)

Programmatic trading is officially supported and documented. Scheme:

1. **Owner wallet** = a Solana wallet; "Each Solana wallet address owns one Pascal account". Wallet-signed actions: register deposit address, create/revoke trading key, withdraw, set username/bio, referral codes. Wallet signs a **UTF-8 JSON array** (e.g. `["create_trading_key","<name>","<trading_key_b58>",<expiration_ms>,1,<deployment_id>,<recv_window_ms>,<client_ts_ms>,"<owner>","<owner>"]`) with plain Ed25519; signature sent base58 in `auth.signature`. `client_ts_ms` is a strictly increasing nonce for wallet-signed requests. `deployment_id` prod = 3.
2. **Trading key** = a separate Ed25519 key pair authorized by the wallet (max 10 unrevoked, expiry at most 365 days, name <= 16 bytes and public onchain). It can only place/cancel orders, not withdraw. Orders are signed over a **compact binary permit** (80-byte header + body: size, price*1e6, client_order_id, symbol, side, tif, flags, `offchain_fields_digest`), little-endian, Ed25519. Test vectors are published (https://docs.pascal.trade/llms/request-signing.txt).
3. `POST https://trade.pascal.trade/api/v1/orders` (array of up to 50 independently signed orders; `recv_window_ms` <= 60,000), `/cancels`, `/mass-cancels`, or the same payloads over the order-entry WebSocket (`type: place|cancel|mass_cancel`, 128 in flight, 60 s idle timeout). Responses carry order state plus fills.
4. Reference client: https://github.com/Pascal-Research-Inc/pascal-python-quickstart (created 2026-05-26, last push 2026-07-17, 4 stars, no license file listed (M)). It states it is not the SDK; an SDK is promised ("will eventually"). Includes an "agent-friendly CLI", a simple market-maker loop, and dry-run-by-default write examples.

Onboarding detail to resolve before building: the docs name an optional `referral_code`, but the quickstart onboarding doc and example 05 say "Register the account's deposit address with an invite code" and pass `invite_code` in the signed registration payload. That suggests beta invite gating (L; docs and quickstart disagree). See Open questions.

Error codes show server-side geo and compliance enforcement on writes: `GEO_RESTRICTED`, `INVALID_GEO_HEADERS` ("Required Cloudflare geo headers were missing..."), `ACCOUNT_RESTRICTED`, `NOT_FUNDED`, `DEPOSIT_ADDRESS_NOT_REGISTERED`, `POSITION_LIMIT_EXCEEDED` (H).

## 6. Reachable through PayBox? **partial** (M, reasoned; nothing was called)

- Pascal is **Solana-only**. EVM chains in the PayBox catalog (Base, Ethereum, BNB, Arbitrum, Polygon...) cannot trade it directly; they would need a cross-chain swap/bridge into Solana USDC first. PayBox has Solana credentials (`06-paybox-platform.md`: one `solana` family wallet on this account; chain catalog includes Solana) and Solana transaction proposals (`chain: solana:mainnet`, legacy/v0, <= 1,232 bytes).
- Funding: a plain SPL USDC transfer to the Pascal deposit address (PayBox `request_transfer`, or a plugin Solana proposal) fits what Pascal documents (M; the transfer tools were not exercised).
- Wallet-signed permits (register deposit address, create trading key, withdraw) are Ed25519 over UTF-8 JSON. PayBox exposes `request_wallet_sign` with intent `solanaMessage` (`{address, message}` -> hex signature) per https://docs.paybox.sh/reference/mcp-tools. That page does **not** state the signature scheme (plain Ed25519 over the message bytes vs any offchain-message prefix) or the message encoding (NOT FOUND). Needs an offline test: sign a known JSON string with a test credential and verify with the wallet pubkey locally; then convert hex to base58 for Pascal.
- Order signing: orders need many fast signatures from the **trading key**, not the wallet. Per-order `request_wallet_sign` approval is not workable (and the wallet key is not the trading key). The trading key must be a hot key held by a service or plugin backend, which reopens the secret-handling gate in `06-paybox-platform.md` (a sandboxed plugin has no persistence). The trading key cannot withdraw (H), so its blast radius is bounded to bad trades.
- NOT FOUND: whether the owner pubkey itself can be registered as a trading key (which would let a wallet sign orders directly); not documented.
- Net: **plausible for onboarding and funding/withdrawal via PayBox, but live order flow needs an out-of-PayBox trading-key signer.** Geo block applies to whichever host calls `trade.pascal.trade`.

## 7. Fees (H; defaults shown, per-market via `taker_fee_rate` / `maker_rebate_share`)

- Taker fee per fill: `size * price * (1 - price) * taker_fee_rate`, default `taker_fee_rate = 0.02` with `maker_rebate_share = 0.25`. Live feed 2026-10-19: 3,164 markets use 0.02/0.25 and **91 markets use 0.01/0.50** (39 midterms markets such as `AK_GOV_2026.*`, plus Variational, Sweden PM, Extended, F1, Pre-IPO, Clarity Act). So read the rate per market, never hard-code it. USD, rounded to 6 dp. Worked: p=0.50 -> $0.005/contract (1.0% of a $0.50 cost); p=0.90 -> $0.0018/contract (0.2% of the Yes cost but 1.8% of the $0.10 No cost). Fee is symmetric in `p`.
- Maker rebate: `size * price * (1-price) * taker_fee_rate * maker_rebate_share`, default share 0.25 (maker receives 25% of the taker fee). Exchange keeps the remaining 75%.
- Builder codes: permissionless; order owner pays `size*price*(1-price)*builder_fee_rate` to the builder, cap 10%; builder needs >= $100 free collateral. A scanner/bot front end could collect this.
- Referral: referrer gets 10% of referee's exchange fees (cap $10,000 per trader); referee gets 5% fee discount until $250 saved; code creation needs 2,000 weighted contracts lifetime.
- Withdrawal: $0.50 flat. Deposit: no Pascal fee documented (only Solana network fees; NOT FOUND: any deposit fee).
- No gas for trading (orders are offchain; only the engine broadcasts settlement transactions). Fee for cheap-side sniping is thus ~1.8% of capital at 90c Yes prices, so edge thresholds should be computed from the formula, not a flat bps.

## 8. Resolution and dispute risk (H docs; risk assessment M)

- "Contracts are settled directly by the exchange team. Pascal does not use an onchain oracle." Resolutions are immutable.
- **Contracts referencing another venue**: Pascal settles to that venue's published resolution, even "where the referenced venue's resolution is disputed or incorrect" (chosen "to preserve fungibility"). Exceptions reserved "in exceptional circumstances" (e.g. venue unwinds trades; Pascal cannot rewind). Currently the only reference kind in the schema is `"polymarket"`, with `market_slug`, `condition_id`, `market_outcome_token_id` and `reverse_outcome_token_id` ("If this token wins, the Pascal market resolves to 1.000000").
- Live: **3,084 of 3,255** markets (94.8%) carry a Polymarket reference; 171 do not (Premier League 85, midterms 16, AI Millennium Prize 15, Polymarket/Kalshi/prediction-market meta markets, Pre-IPO, etc.). Non-referenced markets have Pascal-written rules at `rules_url` (S3 markdown) and are settled by the team.
- Implications for the aggregator:
  - Pascal vs Polymarket on a referenced market is a near same-outcome pair: settlement basis risk is low by design. The `condition_id` / token id fields give an **exact** link without fuzzy matching.
  - Pascal's rules may differ from Polymarket's text in edge cases (the House rules mention a Speaker fallback and a `2027-07-31` deadline; the "not MECE / no Other" caveat applies to Pascal's event grouping). Compare `rules_url` before sizing.
  - Centralised settlement + opaque multisig upgrade authority = operator and trust risk, not oracle-dispute risk. No dispute window is documented (NOT FOUND: dispute process, challenge period, resolution SLA).
  - Pascal follows Polymarket's UMA outcome even if wrong; a Pascal position hedged on Polymarket therefore stays hedged in that case, but it is also exposed to Polymarket-side disputes that change timing.

## 9. Liquidity (dates and sources explicit)

All figures derived from live unauthenticated GETs on 2026-10-19 unless stated.

- **TVL**: $2.116M USDC on Solana (H, https://api.llama.fi/protocol/pascal, last point 2026-10-18). Series: $0.84M on 2026-07-29 (listing day) -> $1.87M on 2026-10-12 -> $2.12M on 2026-10-18 (steady growth). DefiLlama `/summary/dexs|fees|options/pascal` return "not found" (no volume or fees series).
- **Open interest (derived, M)**: sum of `long_interest` across live markets = **1,278,820 contracts**, i.e. about **$1.28M** of matched long/short pairs (each pair locks $1 total). Politics/elections about 0.93M, sports about 0.15M, finance/IPO about 0.07M, crypto-tagged (policy) about 0.05M, geopolitics about 0.03M, AI/tech about 0.03M.
- **Executed volume (derived)**: taker notional **$33.4k in the trailing 24 h** (buy plus sell taker notional; 121 of 3,255 markets traded), **$2.46M all-time** across currently unresolved markets (resolved markets excluded; the 50 largest recently resolved markets add about $50k lifetime volume). Largest 24 h markets: `HOUSE_2026_CTRL.DEM` $5.95k, `TX_GOV_2026.REP` $2.27k, `TX_SEN_2026.DEM` $2.24k. So real flow is **tens of thousands of dollars per day**, not millions.
- **Resting depth (derived)**: books for the 50 largest-OI markets show large resting tiers (50,000-contract levels): median cost-to-take within 5c of mid is about $25k on the ask side and about $50k on the bid-side (No) per market; several Senate markets exceed $100k per side. Median top-of-book spread across 2,613 two-sided markets is 1.8c; p90 is 11.1c. Depth is resting quotes, not demonstrated traded volume, and is probably market-maker quoted.
- **Subsidy risk (H docs)**: the "2026 Midterms Rewards" campaign runs **2026-09-17 to 2026-11-05 00:00 UTC** with a 304,000 USDC pool (105,000 weekly trading pools + up to 200,000 for VIPs/referrers). From week four (2026-10-08) open positions and all markets count toward score. Current volume and depth are likely inflated by this program and may fall after it ends. The midterms are 2026-11-03, so the data window of greatest overlap is also the end of the incentive window.
- **Press (M)**: Series A of $9M led by Union Square Ventures (mid July 2026), seed $6M (Aug 2025) from Wintermute Ventures and DBA (DefiLlama `raises` agrees: Seed 2025-08, Series A 2026-07-16; H for that API read). Volumes undisclosed per Yogonet; one aggregator claims "more than 2 million contracts processed" (L, unverified; cumulative taker volume in the feed is far smaller in notional, but contract counts are not summed here).

## 10. Event coverage and arbitrage overlap

Counts are unresolved markets on 2026-10-19; "ref" = carries a Polymarket reference. Bucketing is mine (tags), see `markets_aggregate_2026-10-19.json`.

| Bucket | Markets | ref | 2-sided books | ~OI $ | 24 h taker $ | Overlap |
|---|---:|---:|---:|---:|---:|---|
| Politics / elections (2026 midterms: House, Senate, Governor, balance of power, France 2027, Israel, Brazil) | 1,285 | 1,267 | 1,184 | 934k | 29.6k | **Highest**: Polymarket, Kalshi, XO, PredictIt, Manifold |
| Sports (soccer UCL/EPL/La Liga/Serie A/Bundesliga, NHL, NBA, NFL, MLB, CFB, esports, tennis) | 1,546 | 1,461 | 1,123 | 150k | 3.6k | High overlap in principle; thin real flow; games resolve same day |
| Finance / macro / IPO (Fed decisions and cuts, Pre-IPO, Anthropic IPO market cap scalar) | 168 | 147 | 139 | 73k | 0.2k | Fed overlaps Kalshi/Polymarket; Pre-IPO overlaps Polymarket |
| Geopolitics (US-Iran ceasefire, NATO-Russia) | 51 | 51 | 50 | 35k | 0.1k | Polymarket, Kalshi |
| Crypto-tagged (CLARITY Act etc.) | 48 | 42 | 47 | 52k | ~0 | Policy markets only |
| AI / tech (AI Millennium Prize etc.) | 118 | 98 | 53 | 25k | ~0 | Polymarket |
| Meta (prediction-market, uptime) | about 21 | 0 | about 12 | 11k | 0 | Own markets |
| Box office / culture, climate | 18 | 18 | about 5 | 0 | 0 | Polymarket only; empty |

- **Crypto price (BTC/ETH/SOL) markets: none found** in the feed (searched symbols and event descriptions for BTC, ETH, SOL, Bitcoin, Ethereum). **Macro**: Fed decision and cut-count markets exist (23 Fed-like symbols, e.g. `FED_DECISION_26OCT.NO_CHANGE`).

## 11. Shared liquidity

- **Independent book and collateral**: own matching engine, own Solana program, own USDC vault; no shared order book or liquidity pool with Polymarket (H, architecture docs). So it counts as a separate arbitrage leg.
- **Not independent information**: 94.8% of markets are designed to mirror Polymarket's resolution, deposits can be funded straight from Polymarket, and Wintermute (a major market maker) is a backer. It is likely (L/M, inferred, no direct evidence) that quoted prices are market-maker hedged against Polymarket, which would keep the spread tight and leave little persistent edge. Arbitrage should be tested by cross-venue spread statistics, not assumed.

## 12. Geo, ToS, automation (H, https://app.pascal.trade/terms.pdf, "Last Updated: June 16, 2026")

I extracted the PDF text locally (no extractor was installed; custom glyph decoding), so quotes are lightly cleaned.

- **Restricted jurisdictions** (resident, citizen, organised in, or located): "Australia, Belgium, France, Germany, Italy, the Netherlands, Ontario, Poland, Quebec, Russia, Singapore, Taiwan, Thailand, the United Kingdom, the United States", plus comprehensively sanctioned places (Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk). VPN or IP-masking to circumvent is prohibited. The write API enforces it with Cloudflare geo headers (`GEO_RESTRICTED`). Reads were not geo-blocked from the research environment (not a license to use).
- **Automation**: using "any robot, spider, crawler, scraper, or other automated means or interface *not provided by us*" is prohibited. Pascal does provide the public API and an API-trading quickstart, so API trading is evidently intended. Scraping the web app is not.
- **Platform Data clause (important for an aggregator)**: ToS prohibits accessing or using any "data, content, prices, or information contained in or derived from the Services, directly or through an API... in raw, derived, aggregated, or anonymized form" if you are a "non-retail, professional entity that engages in capital markets activities, including ... proprietary trading firms, financial technology companies, banks ... or an affiliate", or "a market data distributor"; and prohibits reselling Platform Data to such clients. A commercial aggregator or arbitrage operator that is a company could fall inside this. **Needs legal review or written permission before shipping a Pascal feed in a product** (L/M interpretation of the clause; text is H).
- Market abuse rules: spoofing, wash trading, front-running, collusion prohibited; campaign rules also prohibit self-trading between accounts controlled by one person.
- Other: arbitration seated via the BVI International Arbitration Centre under Delaware law; Company "does not operate a cryptoassets or derivatives exchange platform or offer trade execution or clearing services" (self-description, regulatory status unclear). Press notes no US regulatory approvals (M).
- Account requirement: "open an account with the Company, which is subject to review and approval" (ToS 4.i) and an `ACCOUNT_RESTRICTED` compliance code exist; web onboarding is wallet or email. KYC requirements: NOT FOUND in docs (searched: llms-full.txt for kyc).

## 13. Adapter design notes

- **Normalised model**: one Pascal market = one binary contract; YES price = contract price; YES ask = best ask, YES bid = best bid; NO bid = `1 - best_ask`, NO ask = `1 - best_bid`. Fee model per fill: `size*p*(1-p)*rate`. Min size 1 contract; integer sizes; 6-dp price.
- **Linking**: use `display_attributes.reference.{condition_id, market_outcome_token_id}` to join to Polymarket exactly; for 171 markets without it, fall back to fuzzy/semantic linking with `rules_url` text. Group by `symbol.split('.')[0]` to rebuild events (watch non-MECE events).
- **Polling plan**: `/markets` (5.9 MB) every 30-60 s for discovery and top-of-book; `/books?symbols=` (50 per call) or WS `book` for linked markets; WS `market_update` for listings and resolutions. Keep `seq` for staleness checks across REST/WS.
- **Resolution watch**: `/markets/resolved` with `lookback=4h` or WS `market_update` (`MarketUpdateType` documented). Mismatch alarm: Pascal resolution vs Polymarket resolution on referenced pairs.
- **Quirks**: trades expose counterparties' wallet pubkeys (privacy: do not store); `open_interest` is deprecated (= `long_interest`); `mark_price` is the median of bid/ask/last; server may serve books up to 1 s stale; cursor parameter is `before_cursor`, not `cursor`.

## 14. Open questions

1. Does PayBox `solanaMessage` produce a plain Ed25519 signature over the raw UTF-8 bytes (what Pascal verifies)? Offline test with a test credential.
2. Is registration invite-gated during beta (quickstart `invite_code`) or open (docs `referral_code`)? Is there any KYC for wallet accounts?
3. Can the owner pubkey be registered as a trading key? Can a trading key be generated and held safely in a PayBox plugin?
4. Written position on ToS "Platform Data" (professional/fintech/market-data-distributor exclusion) for an aggregator that republishes Pascal prices.
5. Whether volume and depth persist after the midterms rewards campaign ends (2026-11-05).
6. Program ID, USDC mint, any audit reports, and the timelock/upgrade timeline (not in docs read).
7. Rate-limit numbers for `/markets` and `/books`.

## NOT FOUND (searched)

- Third-party audit of the Pascal program (searched: web search, DefiLlama `audits: 0`).
- Program ID and USDC mint address (searched: llms-full.txt).
- Numeric rate limits for read endpoints (searched: api.txt).
- Dispute/challenge process for settlements (searched: general.txt, ToS).
- Funding rate / perp mechanics (searched: llms-full.txt for funding/perpetual).
- KYC rules (searched: docs, ToS).
- Crypto price markets (searched: market feed symbols/descriptions).

## Suspicious content

- None that tries to redirect an agent. Informational only: https://docs.pascal.trade/llms.txt has an "App Market Links" section addressed to AI agents (how to look up app market pages through GET `data.pascal.trade`); and the quickstart README advertises an "Agent-Friendly CLI". Both are ordinary documentation; I used them only as API docs and did not execute anything.

## Sources

Primary (H):
- https://www.pascal.trade (home: public beta, backers, links; fetched 2026-10-19)
- https://docs.pascal.trade (docs) and generated text at https://docs.pascal.trade/llms.txt, https://docs.pascal.trade/llms/general.txt, https://docs.pascal.trade/llms/api.txt, https://docs.pascal.trade/llms/request-signing.txt, https://docs.pascal.trade/llms-full.txt
- Live API (unauthenticated GET, 2026-10-19): https://data.pascal.trade/api/v1/markets, /api/v1/books, /api/v1/trades, /api/v1/markets/resolved, /api/v1/time
- Market rules text: `rules_url` of `HOUSE_2026_CTRL.DEM` (S3 bucket in `ap-northeast-1`, host `pascal-prod-market-metadata-...s3.ap-northeast-1.amazonaws.com`)
- https://app.pascal.trade/terms.pdf (ToS, last updated 2026-06-16)
- https://github.com/Pascal-Research-Inc/pascal-python-quickstart (README.md, docs/onboarding_solana_key.md, examples/05 via `gh api`)
- https://api.llama.fi/protocol/pascal (TVL, raises, listing time) and https://defillama.com/protocol/pascal (page returned 403 to WebFetch; data taken from the API)
- https://docs.paybox.sh/reference/mcp-tools (`solanaMessage`, `solanaTransaction`, `raw` intents)
- https://clob.polymarket.com/book?token_id=<referenced token> (single spot check of the mirrored Polymarket book, 2026-10-19)
- Local: `docs/research/06-paybox-platform.md`

Secondary (M/L):
- https://www.yogonet.com/international/news/2026/07/17/125438-new-prediction-market-entrant-pascal-closes-9-million-series-a (beta timing, founders, target customers, perp-style framing)
- Web search result set for "Pascal prediction market ... Series A" (Yahoo Finance, Dealroom, KuCoin news, Bettors Insider, Casino.org): consistent on $9M Series A led by USV, $6M seed, total about $15M; one item gives a conflicting seed year (2024 vs 2025) (L).
- Wintermute essay "the prediction market boom has an infrastructure problem" (search snippet only; not read).
