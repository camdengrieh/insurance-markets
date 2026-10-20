# Futuur (futuur.com) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: official docs repo read via `gh api` raw (github.com/futuur/docs), live OpenAPI schema GET, ~20 unauthenticated GETs to `api.futuur.com` (generic User-Agent `insurance-markets-research/0.1`, which the docs require to be non-empty), WebFetch of futuur.com pages, one WebSearch (the session search budget then ran out, so no further searching). No account, no API key, no HMAC-signed call, no WebSocket connection, nothing signed, no POST/PUT/DELETE, no PayBox tool, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (URL in Sources); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/futuur/` (6 files dated 2026-10-19, each <= 16 KB).

## 0. Verdict

**adapter_priority: P2.** Cheap, high-quality read adapter (signal only); no practical execution leg today.

1. Live and independent (H): 551 real-money events, 549 open, newest resolution 2026-10-17; own matching engine (CLOB plus platform AMM backstop), no sign of routing to another venue.
2. Best-documented API of the small venues (H): official docs site, OpenAPI schema, unauthenticated reads of events, books and price history, HMAC-SHA512 for trading, Pusher WebSocket, 2,000 req/min.
3. But real-money liquidity is tiny (H, derived): about $233K cumulative real-money volume summed over all 549 open events, about $52K total book depth, the single biggest event at $32.9K cumulative. Recent resolved events add roughly $700/day (M). Spreads of 2 to 7 cents on headline markets plus a fee of about 5% x p(1-p) per share (M, fitted).
4. Trading today is a custodial ledger behind an account: HMAC keys come only from a logged-in Settings page, real money needs KYC and is country-restricted. On-chain CLOB (Safe plus EIP-712 `LimitOrderIntent`, conditional tokens) is documented as "coming soon" and is absent from the live schema. PayBox could not trade it today.
5. Revisit trigger: `POST /v2.0/orders/signing-context/` or `/api-keys/derive/` appearing in `https://api.futuur.com/docs/schema/` (today the live path list has neither). Then it could become P1 for a signing path.
6. Use as a signal: the play-money (OOM) book has $19.9M OOM volume, but OOM and USDC prices diverge on the same market (Senate control 0.19 vs 0.36), so treat OOM as a separate sentiment signal and never as an arbitrage leg.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET /v2.0/events/?currency_mode=real_money` | 200, `pagination.total` 551; 549 `open`, 2 `paused` | H |
| Resolved feed | newest `resolve_date` 2026-10-17T22:58Z (Botafogo vs Chapecoense) | H |
| Bet-end dates | earliest 2026-10-19T01:00Z, latest 2031-01-31 | H |
| Docs repo | `futuur/docs` last push 2026-10-15; commits 2026-10-14/15 "sync docs"; CHANGELOG newest 2026-09-18 | H |
| Live OpenAPI | v2.0, 21 paths, identical path set to the docs repo copy | H |
| Landing page | futuur.com resolves; trending Brazil election, crypto, Hyperliquid tags | H |
| Company blog | newest Substack post 2025-06-06 (stale, not evidence of activity) | L |

## 2. Kind and market model

- **Kind**: centralised (custodial-ledger) prediction market with play money (OOM) and real money (USDC / USDT / USD), run as an off-chain CLOB with a platform AMM as backup liquidity (H for the CLOB-first, AMM-backup wording on docs `concepts/on-chain-trading`; the how-it-works FAQ still describes pure AMM pricing and is undated, so M on the exact current split).
- **Structure**: `event` (question) has 1..N `markets` (outcomes). Each market is binary with `long_label`/`short_label` (yesno, updown, custom). `resolution_mode`: `exclusive` (162 of 551) or `non_exclusive` (389). `markets_correlation`: `independent` (463) or `linked` (88, prices sum to 1). There are no scalar markets; numeric questions are bucketed ladders ("Which price will Bitcoin hit in 2026?", Fed bps change). H, fixture stats.
- **Order model**: orders are `side` bid/ask x `position` long/short, `price` 0..1 (null means market order), by `shares` or `amount`, optional `expired_at`. H docs.
- **One book per market**: the short book is the mirror of the long book. Verified on market 574939: long bid 0.74 / 80.56 sh equals short ask 0.26 / 80.56 sh; long ask 0.81 / 98.72 sh equals short bid 0.19 / 98.72 sh. An adapter only needs `position=long`. H (fixtures).
- **Tokenisation**: none today; positions are `wagers` rows in Futuur's DB. ERC-1155 Yes/No conditional tokens are described as "coming soon" ("Nothing here is live"). H.
- **Price field**: `markets[].price` is a per-currency dict `{OOM, USDC}`, apparently the book mid (0.77 vs bid 0.74 / ask 0.81; 0.86 vs 0.85/0.88; 0.36 vs 0.35/0.37). M.
- **Book shape caution**: levels run in 1-cent steps from 0.01 to 0.99 with smoothly growing size (Brazil Flavio market: 74 bid and 19 ask levels, 4,780 USDC cumulative to sweep the ask side while the market's `depth_real_money` is 684.54). This looks like an AMM curve discretised into the book. Size any arbitrage against the top few levels and `depth_real_money`, and expect steep price impact. M inference.

## 3. Chains and collateral

- **Today (H)**: ledger balances (`GET /me/balances/`), currencies `OOM`, `USDC`, `USDT`, `USD` for orders; the event schema lists 18 enum currencies (BTC, ETH, SOL, BNB, EUR, BRL, ...) but every live real-money event offers only `["OOM","USDC"]`. No on-chain activity is needed to trade.
- **Funding / withdrawal route**: NOT FOUND in the API (no deposit or withdraw endpoint in the 21 live paths; only a `deposit-success` WebSocket event). Presumably done in the website UI.
- **Planned on-chain (docs, "coming soon")**: Safe smart account per user (`POST /me/safe/` is live and takes `safe_address` + `chain_id`, examples 1 and 137); EIP-712 domain examples use chainId 8453 (Base); collateral OOM or USDC moved by `transferFrom` at match from the Safe to a pool Safe; "Polymarket-shaped". The active chain is not stated. H for the docs text, nothing deployed to verify.

## 4. Read API

- **Docs**: https://docs.futuur.com (Mintlify; source github.com/futuur/docs). OpenAPI: https://api.futuur.com/docs/schema/ . Deprecated v1.0 docs exist. H.
- **Base URL**: `https://api.futuur.com/v2.0` . `next` links in paginated responses come back as `http://` (upgrade to https in the adapter). H.
- **Unauthenticated (confirmed with live GETs)**:
  - `GET /events/?currency_mode=real_money|play_money&limit&offset&search&tag&categories&resolved_only&live&ordering` -> `{pagination:{total,next,previous,page_size,offset}, results:[event...]}`. `limit=100` works. Event has `volume_*`, `liquidity_*`, `tax_*`, `available_currencies`, `order_book_enabled`, `bet_end_date`, `category[]`, and `markets[]` each with `price{OOM,USDC}`, `volume_*`, `liquidity_*`, `depth_*`.
  - `GET /events/{id}/` adds `description` (resolution text), `is_real_money_bets_forbidden`, `transactions_count`.
  - `GET /markets/{id}/book/?currency_mode=real_money&position=long` -> `{bid:[...], ask:[...]}`, each level `{price,total_shares,total_amount,total_fees,cumulative_shares,cumulative_amount,cumulative_fees}`. Full depth, about 14 KB per market.
  - `GET /events/{id}/get_tax/` -> `{tax_play_money,tax_real_money}`; `GET /events/{id}/price_history/?currency_mode=` -> `[{name,data:[{x,y}]}]` per market (y in percent, about 52 KB for a 9-market event).
- **Needs HMAC (account)**: `/events/{id}/wagers/` (no public trade tape), `/wagers/`, `/orders/`, `/me/*`, `/wagers/rebates/`. No public historical-trades endpoint. H.
- **Resolution data**: `status` (open, stopped, resolved, cancelled, paused, reversed), `resolution`, `resolve_date`, market `resolution`; resolved-only filter `resolved_only=true` (54,665 rows in that feed). H.
- **Auth for private calls**: headers `Key`, `Timestamp`, `HMAC`; HMAC-SHA512 hexdigest over the case-sensitive-sorted, URL-encoded params (query for GET, body for POST) plus `Key` and `Timestamp`. A non-empty `User-Agent` is required even for public reads. H.
- **Rate limits**: 2,000 req/min and 1,000,000 req/day per authenticated key (not per IP); 429 with `Retry-After`; same POST twice within 1 s gives `wager_action_duplicated`; responses cached a few seconds server-side so poll at >= 1 s. The live schema says 1,000,000/day; the older JSON copy in the docs repo says 30,000/day (the live one wins). H. Rate limit for anonymous reads: NOT FOUND; none hit in about 20 GETs spaced 1 s.
- **WebSocket**: Pusher (hosted), app key and cluster published in the docs (`us2`). Public channels `event` (events `best-prices-change`, `price-change`, `new-market`, `market-status-change`, `live-data-update`) and `event-{id}` (`order-book-update` top-5 levels, `best-prices-change`). Private `private-user-{id}` (`order-update`, `position-update`, `balance-changed`, `deposit-success`) via `POST /pusher/auth/` with HMAC. Not connected in this research. H docs.
- **MCP**: an official-looking MCP server repo `futuur/Futuur-MCP` (last push 2026-05-22) and docs page `guides/mcp`. Not installed or run.

## 5. Trade path

- **Today**: `POST /orders/` (limit or market), `POST /orders/batch/` (1..20), `/orders/batch-update/`, `/orders/batch-cancel/`, `/orders/cancel-all/`, `PATCH /orders/{id}/cancel/`; all HMAC only. There is no wallet signature and no on-chain transaction. H.
- **Credentials**: HMAC keypair generated by the logged-in user in the website Settings, private key shown once. Real money must be switched on in the same dialog and "requires identity verification". Wallet-derived keys (`POST /api-keys/derive/`, EIP-712 `DeriveApiKey`, domain `FutuurApiAuth`) are "coming soon" and absent from the live schema. H.
- **Planned on-chain flow (not live)**: enable-trading approve via Safe UserOperation, then per-order `POST /orders/signing-context/`, sign EIP-712 `LimitOrderIntent` (domain `FutuurLimitOrder` v1, zero verifyingContract, fields orderId, chainId, safeAddress, marketId, side, position, priceRaw, sharesRaw, maxUsdcRaw, nonce, expiry) with the Safe **owner EOA**, then `POST /orders/` with `chain_id`, `order_intent_signature`, `order_intent_expiry`. "HMAC keys alone cannot create OOM or USDC orders once on-chain settlement is on." H docs text, unverifiable on the live API.

## 6. PayBox reachability: partial

- Today: no. A PayBox EVM wallet cannot place or sign anything here; the only thing it could do is fund an account, and that requires a deposit address from the website after account creation and KYC (not done, not documented in the API).
- After the on-chain cutover: plausible for the order leg. `request_wallet_sign` accepts `typedData` (see `docs/research/06-paybox-platform.md`), so a PayBox EOA that is the registered Safe owner could sign `LimitOrderIntent` with a plugin recomputing the digest first. The one-time enable-trading step is a Safe UserOperation, not a plain EOA transaction, so a proposal route is unclear. Also HMAC keys would still be needed from the website or the derive endpoint. Everything in this paragraph is design inference (M/L).
- Chains: Base (8453) appears in the signing examples; Ethereum (1) and Polygon (137) in the Safe registration example. Whether PayBox supports the Safe/4337 flow on those chains was not tested here.

## 7. Fees

- **Event "tax"** (`tax_real_money`, `tax_play_money`): values 0.06 (257 events), 0.08 (31), 0.04 (60), 0.02 (28), 0.05 (7), 0.01 (3), null (165). No formula or payer is documented. H for existence, formula NOT FOUND.
- **Book fees** (what an order actually pays): each level carries `total_fees`. Fitted on 3 live books (Brazil president, Senate control, Fed October): `fee = 0.05 x shares x p x (1-p)` to within rounding (ratio 0.0497 to 0.0511 on levels with >= 5 sh), including a Fed event whose `tax_real_money` is null and an event whose tax is 0.06. So the book coefficient does not equal the "tax" field. `total_amount` = shares x price + fee on asks and shares x price - fee on bids, so the taker crossing a level pays. At p = 0.5 that is 1.25 cents per share per leg (2.5% of notional); at p = 0.9 it is 0.45 cents. M (empirical fit, may change; the scanner should read `total_fees` per level instead of hard-coding it).
- **Maker rebate**: `GET /wagers/rebates/` returns `rebated_fee_usd`; `maker_rebate` fields on user and wager actions. Rebate rate NOT FOUND. H for existence.
- **Deposit / withdrawal fees, network fees**: NOT FOUND.

## 8. Resolution and dispute risk

- Centralised: Futuur staff resolve using a stated Primary Designated Source and a Secondary Confirmation Mechanism of "credible national or international news organizations"; e.g. Brazil election market: TSE official results, and "Futuur may cancel this market with a public explanation" if no certified winner. H (event 233774 description).
- Statuses include `cancelled`, `paused` and `reversed` ("a previous resolution was reversed"); events carry `cancellation_reason`. Wager outcomes are credited to the ledger automatically. H docs.
- On-chain oracle or formal dispute/appeal process: NOT FOUND (docs site, event descriptions, OpenAPI). Counterparty risk is the operator; funds are custodial today.
- Resolution wording is bespoke per event, so cross-venue arbitrage needs the market-linking layer to compare rules, not just titles (e.g. the Brazil market is "exclusive" resolution but `independent` correlation, so prices need not sum to 1).

## 9. Geo / ToS / automation

- API use is explicitly supported and encouraged: "Scripts and servers, including clients running on cloud hosts, can call `/v2.0/`" (H). Official MCP integration documented.
- Real money "is not available in all countries"; orders from a restricted account or IP are rejected; play money is available everywhere (H docs `concepts/currencies`). Country list: NOT FOUND (the help centre `help.futuur.com` is a JavaScript-rendered Notion site that returned only a Notion shell; futuur.com legal pages are not in the sitemap and `/i/terms/` style URLs return the SPA shell). Per-event flag `is_real_money_bets_forbidden` exists (H).
- KYC: user object has `kyc_status` (no_need, requested, initialized, refused, approved, by_passed) and the key dialog says real money "requires identity verification". H.
- Operator, licence, jurisdiction of incorporation: NOT FOUND (landing page, how-it-works FAQ, docs). The word "XProject" appears only as an internal sync source in docs commit messages and says nothing about the operator (L).
- Terms of service on bots, multi-accounting, VPNs: NOT FOUND.

## 10. Liquidity (all from unauthenticated GETs on 2026-10-19; units assumed USDC; M for unit)

| Metric | Value |
|---|---|
| Real-money events listed / open | 551 / 549; 454 have any real-money volume |
| Cumulative real-money volume, all listed events | $232,916 (not 24h; not TVL) |
| Real-money `liquidity` field, all listed | $1.135M (meaning undefined; looks like AMM pool depth parameter, not deposited funds) |
| Sum of `depth_real_money`, open markets | $52,249 |
| Play-money volume (OOM, no value) | 19.9M OOM |
| Top events (cumulative real volume) | Brazil president elect $32.9K; "Which price will Bitcoin hit in 2026?" $30.8K; Lula wins $10.0K; Companies to IPO in 2026 $8.3K; Fed Oct decision $6.5K; Senate control $5.4K |
| Sports match events | 79 events, $235 total real volume |
| Latest 100 resolved events | $1,330 real volume over about 2 days |
| Typical top-of-book | Brazil Flavio 0.74 / 0.81 (7c); Fed "No change" 0.85 / 0.88 (3c); Senate 0.35 / 0.37 (2c) |

Source of the above: fixtures `derived_real_money_event_stats_2026-10-19.json`, `events_list_real_money_limit3_2026-10-19.json`, `market_574939_book_real_money_long_2026-10-19.json`. No independent source (DefiLlama etc.) checked for Futuur TVL/volume; not searched.

## 11. Event overlap with other venues (where arbitrage could exist)

By top category, real-money cumulative volume: Politics $112K (262 events), Finance $94K (139), Entertainment $9.7K, Sports $8.7K, Science $8.0K. (H, derived.)

- **Politics**: Brazil 2026 presidential (bet end 2026-10-25; Lula 0.22 vs Flavio Bolsonaro 0.77 on USDC at 2026-10-19), US 2026 midterms (Senate control, House, California governor, 48 midterm events), US 2028 nominee/winner, Trump impeachment/full term. Direct overlap with Polymarket and Kalshi; Brazil and Latin America coverage may be unusual (M). No price comparison was done here.
- **Macro / finance**: FOMC October decision (bet end 2026-10-28), number of 2026 cuts, Selic/COPOM, UK/Euro rates, S&P 500 year-end close, USD/BRL year-end, 10-year yield, Treasury. Overlaps Kalshi and Polymarket macro. H titles.
- **Crypto price**: "Which price will Bitcoin hit in 2026?" (touch ladder), "BTC price at end of 2026", monthly "price hit in October" for BTC/ETH/Hyperliquid. Overlaps Polymarket/Kalshi/Limitless/Predict.fun price markets. The landing page's "Bitcoin Daily" category: not found among real-money events (9 events with "bitcoin" in the title, none daily).
- **Sports**: 52 soccer plus 27 basketball match events (`event_type` set), Champions League, Ballon d'Or, F1 champions; almost no real volume, so no practical overlap.
- Edge must beat a 2 to 7 cent spread plus about 1 to 2.5% fees per leg, on books worth tens to hundreds of dollars. Realistic use is signalling (Futuur price vs consensus) rather than size.

## 12. Shared liquidity

Not found. Futuur matches its own users and its own platform AMM against a Futuur ledger; no market-data or routing partnership is documented (searched docs site, OpenAPI, landing page). Independent leg in principle, but too thin to matter. NOT FOUND is not proof of absence for any hidden market-maker on the platform side.

## 13. Adapter notes

- Poll `GET /events/?currency_mode=real_money&limit=100&offset=N` (6 pages for the whole universe, roughly 1.5 MB) every minute at most; fetch `/markets/{id}/book/?position=long` only for markets with `depth_real_money > 0` and a cross-venue match. Use Pusher `event-{id}` / `event` `best-prices-change` for live top-of-book instead of polling books.
- Always request `currency_mode=real_money` and read `price.USDC`, never `price.OOM`; OOM books are a different market.
- Model `exclusive` vs `non_exclusive` and `linked` vs `independent` explicitly; prices on `independent` exclusive events need not sum to 1, and `non_exclusive` ladders ("price hit") are touch markets, not terminal-price markets.
- Convert fees from the book's `total_fees` per level; `total_amount` already includes the fee.

## 14. Open questions

- Operator, licence, restricted-country list, ToS rules on automation (help centre is Notion, JS-rendered; needs a browser read, which was out of scope).
- Deposit and withdrawal methods and fees; what chain USDC deposits use.
- Exact meaning of `liquidity_real_money` and whether book levels far from the top are real orders or AMM-synthesised.
- When the on-chain CLOB ships, which chain, and whether the owner EOA can be a PayBox wallet.
- Why the book fee coefficient (about 0.05) differs from `tax_real_money` (0.01 to 0.08 or null).
- Cross-venue price comparison on the Brazil and Senate markets was not run.

## Sources (accessed 2026-10-19)

- H: docs repo raw files via `gh api -H "Accept: application/vnd.github.raw" repos/futuur/docs/contents/PATH` for `introduction.mdx`, `index.mdx`, `authentication.mdx`, `rate-limits.mdx`, `concepts/{currencies,events-and-markets,orders,wagers,on-chain-trading,conditional-tokens}.mdx`, `guides/{get-api-keys,on-chain-first-order,mcp}.mdx`, `api-reference/{events/list,events/get-tax,events/wagers,markets/order-book,me/safe,wagers/rebates,websocket/*}.mdx`, `CHANGELOG.md`, `WS-CHANGELOG.md`, and the commit list. Rendered site: https://docs.futuur.com/ (WebFetch summary, M).
- H: live OpenAPI https://api.futuur.com/docs/schema/ (path list and rate-limit text).
- H: live GETs on https://api.futuur.com/v2.0/ : `events/` (6 pages real money, 1 page play money, resolved_only), `events/233774/`, `events/233774/get_tax/`, `events/245727/get_tax/`, `events/233774/price_history/`, `markets/{574939,599774,523403}/book/`. Fixtures in `docs/research/fixtures/futuur/`.
- M: https://futuur.com/ (WebFetch), https://futuur.com/i/how-it-works/ (AMM wording, undated, play money "Ooms" or crypto), https://futuur.com/sitemap.xml and robots.txt (no legal pages listed).
- NOT READABLE: https://help.futuur.com/ (Notion JS shell only). Also https://futuur.com/i/about/ and `/i/terms/`-style URLs return the SPA shell.
- L: https://futuur.substack.com/archive (newest post 2025-06-06). One WebSearch result list (github.com/futuur org: repos `docs` 2026-10-15, `Futuur-MCP` 2026-05-22, `prediction_markets` 2025-01-23; a ~2023 third-party platform review and an awesome-list entry were listed but not opened).

## Suspicious / agent-directed content

- `introduction.mdx` contains a note "For AI agents and automated integrations, access the OpenAPI schema directly at ..." and `guides/mcp.mdx` / `AGENTS.md` / `.cursor/skills/` contain agent setup instructions (install an MCP server with API keys). These were treated as data; the schema URL is a plain public GET I would have fetched anyway; MCP install and key creation were not followed.
