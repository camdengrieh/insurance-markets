# PolyCop Predictions (polycop.fun) - venue spec

Researched 2026-10-19. Read-only: public web pages, the GitBook docs `.md` mirrors, DefiLlama public API and its adapter source via `gh api`, Polymarket's public Data API and CLOB builder-trades endpoint, Polymarket docs. No account, no wallet, no POST, no signing, no payments, no browser automation. Generic User-Agent only.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak, stale or ambiguous.

## Verdict

- Adapter priority: **skip**.
- PolyCop is **not a venue**. It is a Telegram copy-trading / auto-trading bot plus a web analytics site ("Smart Money" leaderboard, copy backtests) that routes orders to **Polymarket's CLOB** with its own Polymarket **builder code** attached (H: own docs "lets you automatically copy trades ... on Polymarket"; DefiLlama category `Interface`, tag `Polymarket Builder`, description "powered by Polymarket"). Every market, price, book and fill is Polymarket's. It has **no independent liquidity**, so it can never be an independent arbitrage leg.
- It has **no public or documented API** and no programmatic trade path of its own (Telegram-only; docs mention no API/SDK).
- It is **live and sizeable as a Polymarket order router** (about $0.3M to $0.6M USD per day, rank 4 all-time among Polymarket builders), but that volume is Polymarket volume, already covered by the Polymarket adapter.
- Residual value: (a) a labelled flow slice. Polymarket's public `GET /builder/trades?builder_code=...` returns every trade routed by PolyCop with size, price, side, market and wallet. That is a small copy-trader flow signal, not a new venue, and it is only reachable through Polymarket's API. (b) Confirms a typical builder fee of 0.5% on top of Polymarket's fees, which matters if the aggregator wants to compare routed vs direct costs.

## Liveness (still live in 2026?)

Live as of 2026-10-19 (H).

- Live order flow: `clob.polymarket.com/builder/trades?builder_code=0x4898df15...59df` returned 300 rows with `createdAt` from 2026-10-19T00:40:39Z to 2026-10-19T00:48:10Z, i.e. about 40 trades per minute, about $1,613 notional in 7.5 minutes (H, fixture `clob_builder_trades_polycop_sample3.json` holds 3 of the rows).
- Polymarket builder leaderboard (H, fetched 2026-10-19; unit is shares, see Liquidity): PolyCop is verified, rank 10 for DAY, rank 11 for WEEK, rank 14 for MONTH, **rank 4 for ALL**, 13,119 active users all-time, 264 on the latest day.
- DefiLlama (H, `api.llama.fi/summary/dexs/polycop-predictions`): daily USD volume present through 2026-10-17 (293,976); 7d 1,403,409; 30d 5,016,344; prior 30d about 6.13M (30d over 30d change -18.2%). Adapter start date 2025-12-01 (H, adapter source).
- polycop.fun/leaderboard, polycop.ai and docs.polycop.ai all return content; docs describe a "NEW" docs set with screenshots dated 2026-04-07 (H).
- Not a dead listing: DefiLlama has `url` https://polycop.fun/leaderboard, `twitter` PolyCop_Trader, no `deadUrl`.

## Kind and market model

- Kind: **broker / frontend / copy-trading bot** (H). Features per docs: copy trading of any Polymarket wallet (market or limit orders, price offsets, expiries, per-market caps, TP/SL, sub-wallet per target), "AFK Auto Trade" strategies (BTC, ETH, SOL, XRP short-term up/down markets with MACD / KDJ / ATR / CRSI filters, plus a "Non-Crypto Markets" page), manual trading from Telegram ("any market with a live order book"), AI wallet analysis, web leaderboard and backtests at polycop.fun.
- Market model: whatever Polymarket offers. Binary and multi-outcome (neg-risk) CLOB with ERC-1155 conditional tokens (M, Polymarket's design; covered by the Polymarket workflow). PolyCop adds no market type.
- Observed flow mix (sample of 300 trades, 2026-10-19 ~00:40 to 00:48Z, H but tiny and one time-of-day): about 75% of USD notional is "Up"/"Down" outcomes (short-term crypto price markets), the rest is a few sports and Yes/No markets (31 distinct markets in the sample).

## Chains and collateral

- Chain: **Polygon** only (H: DefiLlama `chains: ["Polygon"]`; docs say withdrawals go "to your personal external wallet address on the Polygon network").
- Deposit routes (H, docs FAQ): the **Deposit Address** accepts USDC / USDT from Polygon, Ethereum, Arbitrum, OP, Base, BSC through Polymarket's cross-chain bridge ($10 bridge minimum; $50 minimum to start copy trading). The **Trading Address** (Polymarket profile / gasless address) accepts USDC, USDC.e, USDT on Polygon only, zero fee. Sending other tokens (POL, BNB) is not credited.
- Collateral is inconsistent across PolyCop's own pages (L for any single claim): the wallet-setup page says the internal bridge converts USDC to **pUSD (Polymarket USD)**, while the FAQ and fees pages say USDC.e. polycop.fun also shows "pUSD" cash balances. This tracks Polymarket's V2 collateral change, and the docs lag in places (M; DefiLlama's helper also refers to "Polymarket v2").
- Wallet model (H, docs): the bot generates a wallet on `/wallet` (or imports a private key); the user can **export the private key** at any time and import it into MetaMask or log into polymarket.com with it. Polymarket derives three addresses (original wallet, trading/profile address, deposit address). Custody is therefore **bot-held, key exportable**; docs never state the custody model outright, and a third-party review calls it self-custodial hot wallet (L).
- Polymarket builder code: `0x4898df15ec6590495dc6c0fedf951ade3e64001d47f9caf44a64e86fc11959df`, builder name "PolyCop", verified (H, Polymarket builders leaderboard and DefiLlama adapter). This is a public attribution identifier, not a secret.
- A different builder named "polycopy" (polycopy.app, code `0x04b963ae...d09b`) appears on the same leaderboard. It is **not** PolyCop; do not conflate (H, leaderboard rows).

## Read API

- `exists`: **none** for PolyCop itself. NOT FOUND (searched: docs.polycop.ai llms.txt full index of 30+ pages, readme, wallet-setup, FAQs, fees, Q&A pages, polycop.fun/leaderboard hrefs, polycop.ai landing page, DefiLlama record (no `github`), web search for "PolyCop API"). A third-party guide also says PolyCop is Telegram-only with no direct API access (L).
- polycop.fun's leaderboard and backtest pages are served by an undocumented back end. I did not probe it. Do not depend on it.
- Usable indirect reads, all on Polymarket's hosts (not PolyCop's):
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<code>[&before=<unix>][&next_cursor=<cursor>]` : **public read, no auth headers** (H, Polymarket docs `trading/orders/attribution`: "Builder trades are a public read and do not require authentication headers"; confirmed with an unauthenticated GET, HTTP 200, 273 KB, 300 rows). Response `{data:[...], next_cursor, limit, count}`; row fields: `id, tradeType (TAKER|MAKER), takerOrderHash, builder, market (condition id), assetId (token id), side, size (shares), sizeUsdc, price, status, outcome, outcomeIndex, owner, maker (wallet), transactionHash, matchTime (unix s), bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Fixture: `clob_builder_trades_polycop_sample3.json` (maker and owner redacted).
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=day|week|month|all&limit<=50` : public, keyless (H, fetched). Response `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}`. Fixture: `polymarket_data_api_v2_builders_leaderboard_all_page1.json`.
  - **Deprecation warning (H, Polymarket migration doc):** Data API v1 (`/v1/builders/leaderboard`, `/v1/builders/volume`) is **retired on 2026-10-24**; v2 uses snake_case, a `data` envelope and cursor pagination. Per DefiLlama's helper comment, `/v2/builders/volume` serves only the latest 90 daily buckets (M).
  - DefiLlama: `GET https://api.llama.fi/summary/dexs/polycop-predictions` (H, fetched; fixture `defillama_summary_dexs_polycop_trimmed.json`). The `defillama.com/protocol/...` web page itself returned HTTP 403 to WebFetch; the API host worked.
- Auth, rate limits, WebSocket: NOT FOUND for PolyCop. Polymarket's rate limits for these endpoints are not documented in the pages I read (searched: attribution page, builder leaderboard reference, migration page).

## Trade path

- **None for an agent against PolyCop.** Orders go through the Telegram bot (`PolyCop_BOT`, and a second bot link `PolyCop_California_bot` is linked from polycop.fun, purpose unknown) or the web UI. Execution is by PolyCop's server using a bot-held key for the user's wallet (H, inferred from docs: copy trades execute "0 blocks / 1 block" after the target, no user signing per trade).
- The canonical write path for any order PolyCop could place is **Polymarket's own CLOB API** (EIP-712 signed orders, builder code in the signed order's `builder` field, H Polymarket docs). The aggregator should talk to Polymarket directly; the Polymarket adapter owns that.
- If the project wants builder revenue it can register its own Polymarket builder code (docs: code at polymarket.com/settings?tab=builder; max builder fee 100 bps taker / 50 bps maker, default 0; H) rather than routing through PolyCop.

## PayBox reachability

- `no` for PolyCop itself. There is no endpoint to send signed orders to and no transaction-proposal flow. A PayBox EVM wallet on Polygon could only transfer USDC / USDC.e to a PolyCop-generated trading address, after which the funds are controlled by PolyCop's server-held key (exportable by the user), not by PayBox signing. Depositing from Base, Ethereum, Arbitrum or BSC would go through Polymarket's bridge deposit address (H, docs). That puts funds in a third party's hot wallet for no gain; not recommended.
- The correct target for PayBox-driven trading is Polymarket itself on Polygon (covered by the other workflow).

## Fees

- **PolyCop: flat 0.5% of notional** ("exactly half of the standard market rate", H, https://polycop.gitbook.io/docs/fees-and-referrals/fees-and-referrals.md). "Fees are deducted directly from your transaction. No fees are charged for redemption transactions." Gas for redeems covered; gasless trading via Polymarket's relayer; no internal transfer fees; bridge or swap costs for non-Polygon / non-USDC.e deposits are paid to the network (H, same page).
- Independently verified on-chain-attributed data (H, fixture sample, n=300): `builderFee / sizeUsdc` = 0.4998% to 0.5000% on every row, for **both** TAKER and MAKER rows. So 50 bps applies to makers as well as takers (at the documented maker cap of 50 bps).
- Polymarket's builder fee is added **on top of** the platform fee; the user pays it (H, https://docs.polymarket.com/builders/fees.md). The collected fee goes to the builder profile's wallet.
- Polymarket's own taker fee also applies. In the sample, `feeUsdc` runs from about equal to `builderFee` (near-resolved prices such as 0.99) to about 5% of notional (Up/Down crypto markets around price 0.3). `feeUsdc` appears to include `builderFee` (M, inferred; not documented in what I read). A third-party review also says "0.5% on copied trades" but with different gas claims (L, stale/inconsistent).
- Net: routing through PolyCop adds 0.5% to a round trip on each leg versus trading Polymarket directly. For arbitrage cost models PolyCop is strictly worse than direct CLOB access.

## Resolution mechanism and dispute risk

- Inherited entirely from Polymarket (UMA optimistic oracle, with disputes). PolyCop does not resolve anything. Docs mention "Auto Redeem" sells or redeems settled positions and PolyCop covers the redeem gas (H, fees page).
- Additional risk beyond Polymarket's: bot-key custody, Telegram account takeover (docs list a "Security: 2FA" page), and a closed-source execution server. No hack or incident found in the pages read (searched: review page, web search; absence is not proof).

## Geo, ToS and automation

- PolyCop terms of service, privacy policy or restricted-region text: **NOT FOUND** (searched: polycop.fun/leaderboard, polycop.ai, docs index and fees/FAQ/wallet pages, web search). The site has no ToS link.
- Polymarket's rules bind the underlying trading: 39 countries including the US are fully blocked, Singapore / Poland / Thailand / Taiwan are close-only, and VPN circumvention violates its ToS section 2.1.4 (H, https://help.polymarket.com/en/articles/13364163-geographic-restrictions, page dated 2026-08-14). The page does not address API/bot trading from restricted regions.
- Automation: PolyCop is itself an automation product. There is no PolyCop rule against programmatic reads of its docs. Anything in its web back end is undocumented.

## Liquidity

- Volume figures differ by unit, so keep them apart:
  - Polymarket builder leaderboard (H, fetched 2026-10-19 ~00:50Z): `volume` DAY 621,331 / WEEK 630,561 / MONTH 7,728,678 / ALL 372,698,607 with 13,119 all-time active users. Polymarket does not state the unit; DefiLlama's adapter comment says this feed is **in shares**, not USD (H, DefiLlama helper source). Treat as shares.
  - DefiLlama USD volume (H, derived from summed `sizeUsdc` of builder-attributed trades, same helper): 24h 293,976 (2026-10-17), 7d 1,403,409, 30d 5,016,344 USD. The chart in the response holds only about 105 daily points from 2026-07-05, which is why `total1y` and `totalAllTime` both equal 25,888,906 (it is a window artefact, not a true all-time figure).
  - The DAY and WEEK leaderboard values are almost identical, which suggests the "week" window had just rolled over when fetched (Monday 2026-10-19 UTC). I did not verify the window definitions (L).
- OI / TVL: NOT FOUND and not applicable (an order router holds no pooled liquidity; DefiLlama TVL arrays are empty).
- Share of Polymarket: the builder feed sums to about 30.1M (shares) on the top 50 for DAY; PolyCop is about 2%. All of this volume is Polymarket's own book.

## Event coverage and arbitrage overlap

- Everything on Polymarket is reachable: sports, politics, crypto price, macro. PolyCop's own emphasis is short-term crypto Up/Down (BTC, ETH, SOL, XRP) via AFK strategies and sports via a **World Cup 2026 hub** on the site (tournament dates Jun 11 to Jul 19, 2026, H site), so that content is now past.
- Overlap with other venues is exactly Polymarket's overlap. **Not independent** of Polymarket (same CLOB, same oracle, same collateral); the aggregator must dedupe PolyCop flow against the Polymarket adapter, not add a leg for it.
- Signal use: copy-bot flow is one-directional follow-the-leader flow into Polymarket books (target-wallet leaderboard ranks on "score, win rate, PnL, slippage", H site). A "Smart Money" signal could be derived from Polymarket's own public data; no PolyCop-only data is available through an API.

## Shared liquidity

- **Polymarket.** PolyCop uses Polymarket's matching engine, order books, fees and oracle; only the builder fee is its own.

## Open questions

- Exact unit and window definitions of the Polymarket builder leaderboard `volume` (shares vs USD) and of `day` / `week` (docs silent; adapter comment says shares).
- Whether `feeUsdc` in builder-trades rows includes the builder fee (looks like it does, undocumented).
- What the second bot (`PolyCop_California_bot`) is, and whether it implies a jurisdiction-specific product.
- PolyCop terms of service, custody terms and liability disclaimers (none published on any page I reached).

## Sources

- https://polycop.fun/leaderboard (WebFetch 2026-10-19): product, links, no ToS (H).
- https://polycop.ai (WebFetch 2026-10-19): landing page, no ToS/API links (H).
- https://polycop.gitbook.io/docs/ (redirect target of https://docs.polycop.ai) and `.md` mirrors read via curl: `readme.md`, `llms.txt`, `getting-started/wallet-setup.md`, `getting-started/faqs.md`, `fees-and-referrals/fees-and-referrals.md`, `q-and-a/q-and-a.md` (H).
- https://api.llama.fi/summary/dexs/polycop-predictions and https://api.llama.fi/protocol/polycop-predictions (H, fetched 2026-10-19). https://defillama.com/protocol/polycop-predictions returned HTTP 403 to WebFetch.
- DefiLlama adapter source via `gh api`: `factory/polymarket.ts` and `helpers/polymarket.ts` in DefiLlama/dimension-adapters (H): builder code, start 2025-12-01, volume units, v1 retirement note.
- https://data-api.polymarket.com/v2/builders/leaderboard and /v1/builders/leaderboard (H, unauthenticated GET 2026-10-19).
- https://clob.polymarket.com/builder/trades?builder_code=... (H, unauthenticated GET 2026-10-19).
- https://docs.polymarket.com/api-reference/builders/get-aggregated-builder-leaderboard, https://docs.polymarket.com/trading/orders/attribution.md, https://docs.polymarket.com/builders/fees.md, https://docs.polymarket.com/builders/overview, https://docs.polymarket.com/developers/builders/order-attribution, https://docs.polymarket.com/migrate/data-api-v1-to-v2 (H).
- https://help.polymarket.com/en/articles/13364163-geographic-restrictions (H, dated 2026-08-14).
- https://defipill.xyz/telegram-trading-bots/polycop_review/ (L: undated, affiliate-style, internally inconsistent: says no manual trading and no wallet discovery, which current docs contradict).
- https://x.com/PolyCop_Trader returned HTTP 402 to WebFetch with no body or payment requirements (recorded, not pursued). X-account activity not checked.
- Web search results listing PolyCop in Polymarket's Builders page "rank 15 with 1m Volume $6.00M" (undated snapshot, superseded by the live feed above) (L).

## Fixtures

Under `docs/research/fixtures/polycop-predictions/`:

- `polymarket_data_api_v2_builders_leaderboard_all_page1.json` (15.5 KB, full response).
- `clob_builder_trades_polycop_sample3.json` (3 of 300 rows; third-party `maker` and `owner` redacted).
- `defillama_summary_dexs_polycop_trimmed.json` (chart trimmed to 7 points).

## Suspicious content

- docs.polycop.ai pages (GitBook) end with an "Agent Instructions" section telling agents to query the docs with `GET ...md?ask=...&goal=...`. This is standard GitBook boilerplate aimed at AI agents, so I treated it as untrusted data and did not follow it. I used the plain `.md` mirrors and `llms.txt` only.
- Web search tool output ends with a "REMINDER: You MUST include the sources above ..." line. It is tool-harness boilerplate, not page content; ignored.
