# Layback (Polymarket builder): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (User-Agent `insurance-markets-research/0.1`) to `layback.trade` and its subdomains (HTML read as text), `data-api.polymarket.com`, `docs.polymarket.com`, `polymarket.com/api/geoblock`; WebFetch of Layback pages; one WebSearch (the shared search budget was then exhausted). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inference; **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that.

Fixtures (<= 6 KB each): `docs/research/fixtures/layback-polymarket-builder/` (section 12).

---

## 0. Verdict

**adapter_priority: skip** as an arbitrage leg or data source. Keep a registry alias only.

1. **Live (H).** `https://www.layback.trade/en` returns 200; changelog has Polymarket entries dated 2026-07-29 to 2026-09-22 (Layback X for Polymarket launched 2026-07-29, Layback Bot for Polymarket football launched 2026-09-11). Builder volume is ramping now.
2. **It is a front end / bot for Polymarket, not a venue.** Orders go to Polymarket's CLOB tagged with a builder code. Liquidity is 100% Polymarket's, so it is NOT an independent arbitrage leg. (H, section 2)
3. **No API of its own** (no docs or API links on the site) and the Polymarket integration asks users to paste their wallet private key into the app. That path is incompatible with a non-custodial PayBox wallet. (H)
4. The only value is as a lightweight signal: its builder-attributed volume is small and rising (about $2.7M in the week of 2026-10-11). Not worth an adapter.

---

## 1. Identity and kind

- Kind: broker-or-frontend (trading ladder + automation bot) on top of Polymarket. Brand "Layback", Brazil-origin (Portuguese-first site, sitemap uses `ptBR`, products also cover Bolsa de Apostas and Betfair exchanges, i.e. betting-exchange tooling extended to Polymarket). Legal operating entity: NOT FOUND (searched: site footer, bot terms page; the bot terms page says product terms "will be published before public opening"). (H) https://www.layback.trade/en , https://bot-polymarket.layback.trade/termos
- Products (H, https://www.layback.trade/en): Layback Backtest, Layback Bot (cloud automation), Layback X (manual ladder desk, "back/lay" and one-click cash out), Marketplace (beta; strategies for Bolsa de Apostas and Betfair). Claims 15,000+ users and 5 products (marketing claim, whole ecosystem, not Polymarket-specific; M).
- Polymarket surfaces: Layback X for Polymarket (https://polymarket.layback.trade/en, free, browser or desktop app for Windows/macOS/Linux; soccer, basketball, politics, crypto and other markets) and Layback Bot for Polymarket (https://bot-polymarket.layback.trade/, football markets only, UI currently Portuguese only). (H)
- Builder codes on Polymarket (H, fixture `builders-leaderboard-layback-rows.json`):
  - `Layback`, verified, rank 93 all-time, volume $4,351,967, 169 active users, code `0x5512c70e...6963`.
  - `LaybackBot`, verified, rank 272, volume $135,590, 43 active users, code `0x32e29c85...0420`.
  - Discovery hint said "#275" for LaybackBot; today's leaderboard says 272 (rank moves daily).

## 2. Market model, chains, collateral (inherited from Polymarket)

- Layback adds no markets. It lists Polymarket markets (binary YES/NO outcome tokens and negative-risk categorical groups), shows them as a sports-exchange style ladder (back = buy YES, lay = sell YES or buy NO; M, my inference from "back and lay" wording), and sends orders to Polymarket's CLOB. (H for ladder/back/lay wording at https://polymarket.layback.trade/en ; M for the mapping.)
- Funds stay in the user's Polymarket account: "custodies nothing"; deposits and withdrawals happen on Polymarket. (H, https://polymarket.layback.trade/en , https://bot-polymarket.layback.trade/)
- Chain and collateral: Polymarket's (Polygon; the current Polymarket docs name the collateral "pUSD" and describe CLOB V2 with CTF and "Polymarket Protocol V2" exchanges). Covered by the Polymarket workflow; not re-verified here. (M, https://docs.polymarket.com/programs/builders/fees.md)
- Attribution is on-chain: the builder code is the `builder` bytes32 field of the signed order and every settlement contract emits it in `OrderFilled`. (H, https://docs.polymarket.com/programs/builders/fees.md)

## 3. Read API

- Layback itself: **none found**. NOT FOUND (searched: layback.trade nav and all links on the home page, polymarket.layback.trade, bot-polymarket.layback.trade, sitemap.xml, robots.txt, fetched changelog; no docs or API link anywhere).
- Layback-related data is only available through Polymarket's public builder endpoints (H, public, unauthenticated, 200 on 2026-10-19):
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=N` (limit capped at 50; paginate by offset) returns `[{rank, builder, builderCode, volume, activeUsers, verified, builderLogo}]`.
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=WEEK|MONTH|ALL` returns daily/weekly bucket rows `{dt, builder, builderCode, volume, activeUsers, rank, verified}` (ALL returns one aggregate row per builder at dt 2026-01-01; WEEK returns weekly buckets starting Sundays).
  - Market data (markets, books, trades) is Polymarket's own Gamma/CLOB/Data API, covered by the Polymarket workflow. Rate limits there: Gamma `/events` 500 req/10s, `/markets` 300 req/10s, Data API v1 general 1,000 req/10s (H, https://docs.polymarket.com/api-reference/rate-limits.md).

## 4. Trade path

- For an agent: **none via Layback** (no API). Programmatic trading should go directly to Polymarket's CLOB with its own signing scheme (EIP-712 order with optional `builder` field), which is the Polymarket adapter's job. (H for builder field, https://docs.polymarket.com/programs/builders/fees.md)
- Layback's own connection method (H): the user exports their Polymarket (Magic) wallet private key and pastes it into the app; X keeps it only in the browser tab, Bot stores it encrypted on Layback servers and deletes it on disconnect. (https://polymarket.layback.trade/en , https://bot-polymarket.layback.trade/ , https://www.layback.trade/en/layback-x/polymarket)
- Docs do not mention proxy wallets, deposit wallets or API credentials. NOT FOUND (searched: the three pages above).

## 5. PayBox reachability

**paybox_reachable: no.** Layback requires a raw private key from a Polymarket Magic (email) wallet; a PayBox non-custodial EVM wallet cannot and should not export one. The same wallet could place Polymarket orders directly (signed orders / transaction proposals), but that is the Polymarket adapter, with no need for Layback and no builder fee. (M)

## 6. Fees

- Layback: no subscription, "free" for X and Bot; "Trades may carry fees from Polymarket and from Builder Layback". Builder fee amounts: NOT FOUND (searched: all Layback pages above; terms page empty). (H)
- Polymarket builder fee rules (H, https://docs.polymarket.com/programs/builders/fees.md): flat percent of notional, `fee = notional x bps / 10000`, taker max 100 bps and maker max 50 bps, default 0, additive to platform fees, rate changes at most once per 7 days with 3 days notice. Whether Layback currently charges any rate is unknown; assume up to 1% taker / 0.5% maker as the worst case for modelling. (M)
- Polymarket platform fee: `fee = C x feeRate x p x (1-p)` taker-only (Sports 0.05, Crypto 0.07, Politics/Finance 0.04, Geopolitics 0), makers pay none. (H, https://docs.polymarket.com/trading/fees)

## 7. Resolution and dispute risk

Identical to Polymarket (UMA-based per Polymarket docs; not re-verified here, covered by the Polymarket workflow). Layback adds counterparty risk of its own: Bot holds users' private keys on its servers, and the bot terms are not yet published. (H for key storage, M for the risk framing)

## 8. Geo, ToS, automation

- Layback: no regions listed; says use "depends on your account's eligibility and Polymarket's rules", and the 2026-08-14 changelog mentions "clearer login messages for unsupported regions". Bot is 18+, no profit guarantee. (H, https://bot-polymarket.layback.trade/ , https://www.layback.trade/en/novidades)
- Terms: the bot terms page states that product-specific terms "serão publicados antes da abertura ao público" (will be published before public opening). So no usable ToS. (H, https://bot-polymarket.layback.trade/termos)
- Polymarket enforces geoblocking (`polymarket.com/api/geoblock` returned `blocked: true` for my IP's country); automation rules are Polymarket's. (H)
- Polymarket reserves the right to revoke builder fees for "automated, self-referred" or non-bona fide activity. (H, builder fees doc)

## 9. Liquidity

- Layback-attributed Polymarket volume (H, fixtures, data-api 2026-10-19): all-time $4.35M (Layback) + $0.14M (LaybackBot) = about $4.49M since the first trade in the week of 2026-08-09. Weekly: 08-30 $5K, 09-06 $17K, 09-13 $71K, 09-20 $107K, 09-27 $252K, 10-04 $1.08M, 10-11 $2.67M (Layback); the 10-18 bucket is partial ($150K on one day). Active users in the 10-11 week: 133 (+40 on Bot).
- Venue-level liquidity is Polymarket's, not Layback's. No separate OI/TVL (it holds no funds).

## 10. Event overlap and shared liquidity

- Categories: soccer (core), tennis and basketball, politics, crypto, others (H, Layback X page and 2026-07-29 changelog). All are Polymarket markets, so they overlap Kalshi, Limitless, etc. only via Polymarket.
- **Shares 100% of liquidity with Polymarket** (orders hit the Polymarket CLOB). Not an independent arbitrage leg. Any cross-venue scan should use the Polymarket adapter once.

## 11. Open questions

- Actual Layback builder fee rate (visible only through on-chain `OrderFilled` + builder profile, or the in-app UI).
- Whether Layback's public "Backtest" or "Marketplace" data has an API (none found).

## 12. Fixtures

- `docs/research/fixtures/layback-polymarket-builder/builders-leaderboard-layback-rows.json` (leaderboard rows for `Layback`, `LaybackBot`).
- `docs/research/fixtures/layback-polymarket-builder/builders-volume-weekly-layback-rows.json` (weekly volume series rows).

## Suspicious content

None. No embedded instructions were seen in any fetched page. (The home page contains a Cloudflare email-protection link; no address was read or recorded.)

## Sources

- https://www.layback.trade/en (H) , https://www.layback.trade/en/novidades (H) , https://www.layback.trade/sitemap.xml (H) , https://www.layback.trade/en/layback-x/polymarket (H)
- https://polymarket.layback.trade/en (H) , https://bot-polymarket.layback.trade/ (H) , https://bot-polymarket.layback.trade/termos (H)
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (H)
- https://docs.polymarket.com/programs/builders/fees.md , /programs/builders/tiers , /trading/fees , /api-reference/rate-limits.md , /llms.txt (H)
- https://polymarket.com/api/geoblock (H)
- WebSearch result summarising Layback's own site only; no independent coverage, reviews or user numbers found (L).
