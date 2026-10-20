# POTS (Pots Market, a Polymarket builder): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: official-site pages fetched through WebFetch (potsdefi.com, docs.polymarket.com), one WebSearch, and public unauthenticated GETs (User-Agent `insurance-markets-research/0.1`) to `data-api.polymarket.com`, `clob.polymarket.com`, `gamma-api.polymarket.com`. No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text was treated as untrusted data; none of it contained instructions aimed at AI agents (potsdefi.com/llms.txt was read as data only).

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or my inference from first-hand data; **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that, not "no". Page contents from potsdefi.com were obtained through a summarising fetch, so quotes are paraphrase-level; treat those as H for "the page says X" but not for the truth of X.

Fixtures (4 files, each <= 12 KB): `docs/research/fixtures/pots-polymarket-builder/` (section 14).

---

## 0. Verdict

**adapter_priority: skip** as an arbitrage leg or a data source. Keep a registry alias only.

1. **Live.** POTS is a verified Polymarket builder with trades matched minutes before the fetch (2026-10-19 07:27 UTC). The potsdefi.com site is up. (H)
2. **A front end, not a venue.** "Pots Market has no separate orderbook. Orders go to Polymarket's CLOB" (potsdefi.com/market/shared-liquidity/). Settlement is Polygon via Polymarket's CTF Exchange. (H)
3. **100% shared liquidity with Polymarket.** The first POTS-attributed trade in `/builder/trades` has a `conditionId` that resolves in Polymarket Gamma to a normal Polymarket market, and the CLOB book for its token is Polymarket's book. (H, fixture `polymarket-gamma-clob-crosscheck.json`)
4. **No POTS API for third parties that I could find.** The only programmatic surface is Polymarket's own. (H for the absence in what I read)
5. **Small and shrinking, and costs the user an extra 1% taker fee.** $60.0M all-time builder volume, about $10.0M in the last month, $11K on the current day. Observed builder fee on every sampled trade is 100 bps (the program maximum). (H)

It is not an independent leg. Any "POTS price" is a Polymarket price, with worse execution (extra fee). The scanner must treat it as an alias of Polymarket.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod={ALL,MONTH,WEEK,DAY}&limit=50&offset=0` | POTS present in all four windows, `verified: true`, builder code `0xdad44c161c17268f364ff55dc7045b61ae64809f7709473bc93bd4063f0ae48e` | H |
| `GET https://clob.polymarket.com/builder/trades?builder_code=<POTS code>` (no auth needed) | 300 confirmed taker trades between 2026-10-19 05:05:36 and 07:27:37 UTC | H |
| `https://potsdefi.com`, `/market/*`, `/terms/`, `/llms.txt` | all fetched OK on 2026-10-19 | H |
| Weekly series (`/v1/builders/volume?timePeriod=WEEK`) | non-zero weekly volume every week from the week of 2026-04-05, except a trough around 2026-08-30 to 2026-09-06 (about $20K and $6K) | H |

**still_live = true.** First builder volume in the weekly series is the week of 2026-04-05 ($955), so the product is about 6 months old; nothing here is stale. The potsdefi.com pages carry no dates; the blog posts were not dated in what I read (L for currency of marketing claims).

## 2. Kind and market model

- **Kind (H):** broker / front end ("Pots Market") plus a separate BNB-chain token/treasury project ("Pots Money", IBS and POTS tokens). The prediction part is only a Polymarket builder. Source: https://potsdefi.com and https://potsdefi.com/market/shared-liquidity/.
- **Market model:** Polymarket's. Binary Yes/No (and named-outcome) conditional tokens on a CLOB; multi-outcome events are neg-risk groups. Site: "Non-custodial binary prediction platform", "Yes/No tokens settle at $1.00". (H)
- **Tokenisation:** ERC1155 conditional tokens, same `conditionId` and `clobTokenIds` as Polymarket (fixture). Tick 0.01, min order 5 shares for the sampled market. (H)
- **Catalogue:** POTS claims the "Full Polymarket event catalogue... 60,000+ event contracts". Whether any markets are hidden is NOT FOUND (searched: shared-liquidity, trading, FAQ pages). (M)
- **What POTS users actually trade (M, from the 300-trade sample, about 2h20m, $1,538 total notional across 73 markets):** 244 of 300 trades are "Up"/"Down" outcomes (Polymarket crypto up/down short-horizon markets), the rest esports/tennis/MMA/NBA match markets. Median ticket is about $1 to $2, max about $20. Tiny retail flow.

## 3. Chains and collateral

- **Settlement: Polygon (chain 137)** via the Polymarket CTF Exchange (potsdefi.com terms and builder page: "chain_id=137"). (H)
- **Collateral:** USDC/pUSD on Polygon ("Polygon USDC/pUSD is the cheapest route"). POTS says users can bridge USDC from Ethereum, BSC, Arbitrum and Base with auto-conversion; the bridge provider is NOT FOUND (searched: trading page, FAQ). (H for the claim, NOT FOUND for the mechanism)
- **Wallet type:** the builder page sample uses `signature_type=3` labelled "POLY_1271 (Deposit Wallet)" with a `funder` address, i.e. Polymarket's deposit-wallet flow. Which wallet type real users get is NOT FOUND. (H for the sample, M for implications)
- **BSC side:** IBS, POTS and gIBS tokens, bonding, staking and treasury contracts are on BNB Smart Chain (https://potsdefi.com/resources/contracts/). Irrelevant to trading; it is where fee revenue is said to go (H that the site says so; the on-chain flow is not verified). The contracts page lists no Polygon-side contract and no builder code.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official POTS API / docs | **None found.** NOT FOUND (searched: homepage, /market/*, /resources/ index through homepage links, /llms.txt, /resources/faq, /resources/contracts, WebSearch). The homepage "Builder" section mentions "API credentials, sub-accounts, trading agents" but no docs URL; /market/trading says sub accounts provide "API trading" but gives no endpoints. | H |
| Canonical read path | **Polymarket's official APIs**: Gamma `https://gamma-api.polymarket.com` (events, markets), CLOB `https://clob.polymarket.com` (`/book`, `/prices-history`), Data `https://data-api.polymarket.com`. Docs https://docs.polymarket.com (index https://docs.polymarket.com/llms.txt). Owned by the Polymarket adapter. | H |
| POTS-specific flow data | `GET https://clob.polymarket.com/builder/trades?builder_code=<code>`: public and unauthenticated (confirmed with a plain GET), cursor-paginated (`next_cursor`, `limit` 300). Docs: https://docs.polymarket.com/trading/orders/attribution ("A public, unauthenticated GET /builder/trades?builder_code=<code>"). Matched trades only. | H |
| Builder volume | `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=...&limit=50&offset=0` (bare array, max 50 rows) and `/v1/builders/volume?timePeriod=...` (series rows `{dt, builder, builderCode, volume, activeUsers, rank}`; the WEEK file is 3.2 MB for all builders, so filter client-side). Not documented on docs.polymarket.com (the builder overview says only that the leaderboard is at builders.polymarket.com). | H |
| Rate limits / WebSocket | POTS: NOT FOUND. Polymarket builder rate limits depend on tier (https://docs.polymarket.com/programs/builders/tiers, not read in detail); public market WebSocket belongs to the Polymarket adapter. | M |

Confirmed response shapes (public GET, fixtures):
- Leaderboard row: `{rank:"19", builder:"POTS", builderCode:"0xdad4...e48e", volume:60035777.56, activeUsers:4532, verified:true, builderLogo}`. (H)
- Builder trade row: `{id, tradeType:"TAKER", takerOrderHash, builder:"", market:<conditionId>, assetId:<tokenId>, side, size, sizeUsdc, price, status:"TRADE_STATUS_CONFIRMED", outcome, outcomeIndex, owner, maker, transactionHash, matchTime(unix s), bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt}`. Note the row's `builder` field is empty while `builderCode` holds the code; `owner` is an opaque id and was dropped from the fixture. (H)

## 5. Trade path

- **POTS:** web app, wallet connect (MetaMask or WalletConnect-compatible per FAQ). Every order is EIP-712 signed by the user's key; the operator "cannot access funds or execute trades on your behalf". No public order API. (H, potsdefi.com FAQ/trading/terms)
- **Under the hood (H):** the builder page sample is a Polymarket `ClobClient` (`chain_id=137`) calling `create_order(... builder_code=...)`. The page prints the code as `"POTS_MARKET"`, but the on-chain attribution value is the bytes32 above (Polymarket docs: the order struct's `builder` field is a `bytes32` in the EIP-712 `Order` type, https://docs.polymarket.com/trading/orders/attribution). The string is likely a display alias (M).
- **"Sub accounts" for AI agents/API trading:** mentioned on /market/trading as "required for AI agents, copy trading, and strategy subscriptions"; no documentation found. (H for the mention, NOT FOUND for details)
- **Agent path:** to trade these markets, use the Polymarket adapter directly. Attaching POTS's builder code from our own software is not offered and would send builder fees to POTS; do not do it.

## 6. Reachable through PayBox? **no** (as a distinct venue)

- There is no POTS contract or order API to target. A PayBox EVM wallet could only trade the underlying markets through the Polymarket route (Polygon, EIP-712 typed-data orders, pUSD approvals), which the Polymarket adapter owns; see `docs/research/08-venues-polymarket-kalshi.md` section 9 (Polygon support in PayBox is unverified at the tool level there). No PayBox tool was called here. (M)

## 7. Fees

- **POTS builder fee: observed 100 bps (1.00%) of notional on taker trades.** In all 40 trades I inspected programmatically, `builderFee / sizeUsdc` was 99.9 to 100.0 bps (e.g. `sizeUsdc 10.165`, `builderFee 0.10165`). The user pays it. (H, fixture `clob-builder-trades-pots-sample.json`; rate not stated anywhere on potsdefi.com, which says only "No hidden charges", "maker rebates")
- **Polymarket cap and formula (H):** `builder_fee = notional x bps / 10000`, taker cap 100 bps, default 0, 1 bp granularity, added on top of any platform fee; rate changes once per 7 days, effective 3 days later (https://docs.polymarket.com/programs/builders/fees). POTS is at the cap. The sibling Bitget note records a maker cap of 50 bps (M; the page I fetched covered only taker).
- **Polymarket platform fee (H, https://docs.polymarket.com/trading/fees.md):** taker only, `fee = C x feeRate x p x (1 - p)`; rates Crypto 0.07, Sports 0.05, Finance/Politics/Mentions/Tech 0.04, Economics/Culture/Weather/Other 0.05, Geopolitics 0. Makers never pay.
- **Reconciliation (M):** the trade row's `feeUsdc` equals platform fee plus builder fee. Example: 20.33 shares at 0.50, sports rate 0.05: 20.33 x 0.05 x 0.25 = 0.2541, plus builder 0.10165 = 0.35577 = `feeUsdc`. The `fee` field was "0" on all rows. So `feeUsdc` is the all-in taker cost on a POTS order.
- **Net:** a POTS taker pays Polymarket's fee plus 1% of notional. That is $0.05 extra per $5 of notional; for an arbitrage this is a flat 1% handicap, so POTS is never better than Polymarket direct. Limit (maker) orders: POTS says "no maker fee" and daily USDC rebates (H for the claim); a maker builder fee was not observed because the endpoint lists the taker side.
- **Deposit/bridge:** Polygon USDC/pUSD zero fee; other chains "near-zero" for stablecoins, variable for other assets (H for the claim).

## 8. Resolution mechanism and dispute risk

Entirely Polymarket's: UMA Optimistic Oracle for prediction markets, Chainlink TWAP for up/down markets (https://docs.polymarket.com/concepts/resolution.md, H). POTS terms: "Market outcomes are determined by Polymarket's oracle infrastructure, and POTS doesn't control resolution or accept liability for outcomes" (potsdefi.com/terms, H). Extra POTS-specific risk: front-end/availability and treasury-token risk (POTS's own Risk Disclosures page lists smart contract, liquidity, market and governance risks; not read in full). Third-party review claims named founders are absent and audits are by CertiK and Bitlabs (M, polymart.app via search snippet; not verified).

## 9. Geo, ToS and automation

- **Terms (H, https://potsdefi.com/terms/):** 18+; no residents of places "where crypto, DeFi or prediction markets are restricted or prohibited, including sanctioned regions"; POTS "may restrict or block access based on location"; VPN circumvention prohibited where restricted. No specific country list found. Polymarket's own geoblock applies on top (details in the sibling Polymarket note).
- **Automation (H):** terms prohibit "bots, scrapers, or automated tools that interfere with normal operations". It is silent on non-interfering automation. Do not scrape potsdefi.com; there is nothing there that Polymarket's APIs do not give us.
- **Builder program (H):** "availability may vary by jurisdiction" and "Polymarket's event policies apply" (potsdefi.com builder page). Polymarket can disable a builder code at its discretion (fees page).

## 10. Liquidity

All figures are **builder-attributed Polymarket volume** for POTS's code, from Polymarket's Data API, fetched 2026-10-19. There is no separate TVL or OI: positions are ordinary Polymarket positions. Whether `volume` counts one or both sides of a trade is not documented (M).

| Window | Volume (USD) | Active users | Rank | Tag |
|---|---|---|---|---|
| ALL | 60.04M | 4,532 | 19 | H |
| MONTH (trailing, as labelled by the endpoint) | 10.03M | 1,234 | 10 | H |
| WEEK (matches the weekly bucket starting Sun 2026-10-18, so partial) | 0.134M | 258 | 33 | H |
| DAY | 0.011M | 64 | 35 | H |
| Weekly series (week starting) | 06-14: 7.41M; 07-26: 4.49M; 08-02: 4.86M; 09-27: 7.52M (peak); 10-04: 3.51M; 10-11: 1.08M | 646 to 1,208 | n/a | H |

Reading: volume was lumpy ($2M to $7.5M a week from mid-June to early October, with a collapse around 2026-08-30) and has fallen to about $1.1M last full week. The sample's average ticket of about $5 suggests micro-bets on 5-minute crypto up/down markets. For scale, the same builder leaderboard shows rank 1 (betmoar) at $2.34B all time, about 39x POTS. (H for the numbers, M for the interpretation.) The 24h and per-market Polymarket totals belong to the Polymarket note.

## 11. Event coverage (where arbitrage could exist)

Whatever Polymarket lists: sports (match markets, esports, MMA, tennis, NBA seen in the sample), crypto up/down and price markets, politics, finance, culture. All of it overlaps other venues (Kalshi, Limitless, Predict.fun and so on), but each market is simply the Polymarket market. (H for the sample categories, M for "all of it")

## 12. Shared liquidity

**Shares 100% with Polymarket International** (same CLOB, same conditional tokens, same UMA/Chainlink resolution), and with every other builder on the leaderboard (MetaMask, Gate, Bullpen and others). **NOT an independent arbitrage leg.** Mapping rule for the market-linking layer: POTS market identity == Polymarket `conditionId`; no separate slug scheme was found (potsdefi.com market URLs were not enumerated). The POTS roadmap lists "multi-protocol routing" and "cross-chain liquidity" as future items (H that the site says so); re-check if that ships.

## 13. Recommendation

- **adapter_priority: skip.** Duplicate liquidity, no API, 1% extra taker fee, ToU against interfering automation, small and declining volume.
- Registry entry: `kind: frontend-of`, `upstream: polymarket`, `independent_liquidity: false`, `builder_code: 0xdad44c161c17268f364ff55dc7045b61ae64809f7709473bc93bd4063f0ae48e`.
- Optional, low value: `/builder/trades?builder_code=...` is a public stream of retail-sized, attributed taker fills (side, price, size, outcome). It could serve as a weak "uninformed retail flow" signal for the Polymarket adapter, but it covers only about $1.5K per 2h20m; not worth a dedicated adapter. A generic "builder flow" signal across all builders would be a better single investment.

## 14. Fixtures (`docs/research/fixtures/pots-polymarket-builder/`)

| File | What |
|---|---|
| `polymarket-builders-leaderboard-pots-rows.json` | POTS row from each of the four leaderboard windows |
| `polymarket-builders-volume-week-pots-series.json` | POTS rows from the WEEK volume series (29 weeks) |
| `clob-builder-trades-pots-sample.json` | first 4 of 300 rows from `/builder/trades` (owner id dropped), with envelope fields |
| `polymarket-gamma-clob-crosscheck.json` | Gamma market and top CLOB book levels for the market of the first sampled trade |

## 15. Open questions

- Which wallet type (EOA, proxy, deposit wallet) POTS users get, and whether the same account is usable on polymarket.com. NOT FOUND.
- What "sub accounts / API trading" actually exposes; no docs found.
- Whether any Polymarket markets are hidden in POTS.
- Maker-side builder fee (the `/builder/trades` sample showed only taker rows).
- Polymarket builder-tier rate limits (tiers page not read in detail).

## Sources

- https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=0 (also MONTH, WEEK, DAY) (H)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=WEEK (H)
- https://clob.polymarket.com/builder/trades?builder_code=0xdad44c16...e48e (H)
- https://gamma-api.polymarket.com/markets?condition_ids=0xfe5ed516... and https://clob.polymarket.com/book?token_id=6935... (H)
- https://docs.polymarket.com/builders/overview and /programs/builders/overview, /programs/builders/fees, /trading/orders/attribution, /trading/fees.md, /concepts/resolution.md (H)
- https://potsdefi.com, /market/shared-liquidity/, /market/trading/, /market/polymarket-builder/, /resources/faq/, /resources/contracts/, /terms/, /llms.txt, /blog/what-is-a-polymarket-builder/ (H for what the pages say)
- WebSearch snippet citing https://polymart.app/pots and https://polymart.app/blog/polymarket-builders-program (M/L, third-party review, not opened)
- Sibling notes: `docs/research/08-venues-polymarket-kalshi.md`, `docs/research/venues/bitget-wallet-polymarket-builder.md`
