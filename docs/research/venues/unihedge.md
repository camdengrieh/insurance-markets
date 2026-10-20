# Unihedge - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: doc/site reads, `gh api` file reads, unauthenticated GETs (api.llama.fi, sourcify.dev, api.geckoterminal.com, archive.org, DNS), no account, wallet, key, signature, POST/PUT/DELETE or PayBox tool. Third-party pages were treated as untrusted data. A JSON-RPC `eth_call` would have been a POST, so on-chain state was NOT read (see section 10).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures: `docs/research/fixtures/unihedge/` (section 11).

---

## 0. Verdict

1. **Effectively dead.** The website and app domains are parked for sale, the docs are gone, and the contract's USDC balance has not moved since 2026-01-09 (H, sections 1 and 10). Only the on-chain contract still exists.
2. **Not an event-outcome market even when alive.** It is a price-band game on one pair (ETH/USDC, Polygon). Players pay a sunk "Reverse Harberger Tax" to hold a 100-USDC price band for a 24h frame; at settlement the holder of the winning band gets 10% of a shared tax pool. There are no probabilities, no $1 payoff, no outcome tokens and nothing to hedge against. "Unlimited liquidity" only means you can always buy in (H, README/FAQ).
3. **Tiny.** Contract holds about $29 USDC (DefiLlama, 2026-10-18); all-time peak $187.5 (2025-11-06). Max prize at the next settlement would be about $2.9.
4. **No read API, no trade API.** On-chain views and events only. Trade is `approve` + `tradeLot` on Polygon.
5. **adapter_priority = skip.** Do not build an adapter. Revisit only if the domain and keeper come back to life.

---

## 1. Is it still live? (2026)

| Check | Result | Tag |
|---|---|---|
| `GET https://unihedge.org` | HTTP 200 with a 114-byte page that JS-redirects to `/lander`, which 307-redirects to `forsale.godaddy.com/forsale/unihedge.org?...utm_campaign=x_corp_tdfs-daslnc_base` (domain-for-sale lander). Also `/docs` and `www`. 2026-10-19. | H |
| DNS | `unihedge.org` NS = `ns3/ns4.afternic.com`; A = 13.248.169.48, 76.223.54.146 (parking IPs). `app.unihedge.org` resolves to the same two IPs and fails TLS (`unrecognized name`). | H |
| DefiLlama flag | `deadUrl: true`, `url: ""` (that is why the discovery pass found no URL) | H |
| Last good captures | Internet Archive: `app.unihedge.org` last 200 on 2025-11-12; `unihedge.org/docs` and `/faq` last 200 on 2025-12-08. CDX queries from 2026-01-01 return nothing (weak evidence). | H (captures) / M (inference) |
| Code | `github.com/unihedge-org/core` last push 2025-10-28 ("updated readme"); 1 star; org has 4 repos, 3 are stubs from 2022. No commits in 2026. | H |
| Contract balance | Flat at 29.06716 USDC every day from 2026-01-09 to 2026-10-18 (details in section 10). Any trade adds tax; any settlement removes 10%. Neither has happened. | H (data) / M (inference) |
| Team channels | X `@UnihedgeOrg`, Discord, Telegram, Medium were linked by the 2025-12 site. Not fetched live (X 404 to curl, Medium 403 Cloudflare, not worked around). | L |

Verdict: **still_live = false** for any practical purpose. The Polygon contract is not self-destructing code, so it may still hold dust and accept calls.

---

## 2. Kind and market model

- **Kind:** "Reverse Harberger Tax" (RHTAX) price-band game on a DEX price (README: "Dynamic Parimutuel Model (DPM) for unlimited buy-in liquidity with a novel Reverse Harberger Tax"). Origin: 2021 arXiv paper "Unihedge - A decentralized market prediction platform" (arXiv 2108.11631v3, 2021-12-09). H.
- **Market:** one `Market` contract = one pair (deployed pair: WETH/USDC via the Polygon Uniswap V3 0.05% pool). Time is cut into **frames** of `period` = 86,400 s (default), aligned to `initTimestamp` 1,756,742,400 = 2025-09-01 16:00 UTC, so settlement is daily at 16:00 UTC. Each frame has **lots**: price bands 100 USDC wide (`DEFAULT_LOT_STEP_T = 100`). H (source, docs).
- **Not binary/categorical/scalar in the usual sense.** It is a scalar-bucket market where the only payoff is a pool share. There is no order book, no AMM curve, no tokenised outcome (lots are rows in contract storage `lots[lotId]`, not ERC-20/1155). A position cannot be sold to the market, only bought out by another player at the holder's self-declared price.
- **How you "trade" (H, `Market.sol`):**
  - `tradeLot(timestamp, rateQ96, acquisitionPriceQ96)`: pick a frame and a price band, declare an `acquisitionPrice` (your buyout price).
  - New lot: pay tax only. Own lot: re-declare, pay tax again. Someone else's lot: pay tax **plus** the previous holder's declared price (sent to them).
  - `acquisitionPrice` is a number the holder picks. It is **not a probability and not a market price**; it cannot feed an arbitrage comparison.
- **Payoff (H, `settleFrame`):** `pool = carried undischarged balance + taxes collected in the frame - 3% protocol fee`. 10% of the pool (`dischargeRateQ96`) is paid to the **single last holder** of the band containing the settlement rate. If no one holds that band, the 10% goes to the contract `owner`. The remaining 90% carries forward. The README says winners are paid "pro-rata by duration of ownership"; the deployed code does no such thing (it pays one address). The README and code disagree (H).
- **Hedging:** the FAQ pitches it as "decentralized insurance" but there is no fixed-payoff claim, so it cannot offset a position elsewhere.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Mainnet | Polygon PoS (137) | H |
| Market contract | `0x3C486b7178Eb71d50D060Dd02602aBfAcB88EA21` (Sourcify `match`/`match`, verified 2025-11-19; deployed in block 78,043,953; no proxy) | H |
| MarketGetter | `0xD8581Cc08E2afC75960DE0a304c540627Cf42D15` (batch view helper; NOT verified on Sourcify, source only on GitHub) | H |
| Collateral | native USDC on Polygon `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` (6 decimals) | H |
| Oracle pool | Uniswap V3 USDC.e/WETH 0.05% on Polygon `0x45dDa9cb7c25131DF268515131f647d726f50608`; GeckoTerminal 2026-10-19: reserve $662,899, 24h volume $152,618 | H |
| Testnet | Sepolia core `0x694AA1769357215DE4FAC081bf1f309aDC325306` (6-hour frames, 25-wide bands; prices oracled from the Polygon pool) | H (docs) |
| Earlier deployments | DefiLlama history shows DAI (2025-03) then USDC accounting; the current adapter and docs point only at the contract above. Older versions are not documented. | M |
| Verified source = GitHub source | Normalised diff of Sourcify's flattened `Market.sol` vs `unihedge-org/core` `contracts/Market.sol` = 0 differing lines. Constructor arguments (fee, discharge, tax anchor, lot step) were NOT read; the values in this note are the code defaults. | H / M |

---

## 4. Read API

- **Official REST / GraphQL / WebSocket / subgraph: none.** The README says "multi-chain, API, and governance roadmap ahead". NOT FOUND (searched: unihedge.org docs and FAQ via Wayback, GitHub org repos, README, DefiLlama listing).
- **On-chain only.** A Polygon JSON-RPC node is needed (I did not call one: JSON-RPC is POST). Useful reads from the verified ABI:
  - Frames: `getFramesCount()`, `framesKeys(i)`, `getFrame(frameKey)`, `getFrameState(frameKey)` (NULL/OPENED/CLOSED/RATED/SETTLED).
  - Lots and trades: `getLotsCount()`, `lotsIds(i)`, `getLot(lotId)`, `getTradesCount()`, `getTrade(i)`; `unpackLotId` = `(frameKey = lotId & (2^64-1), lotKey = lotId >> 64)`.
  - Pricing: `getTaxRateQ96(frameKey)`, `previewTaxAndFee(frameKey, acqPriceQ96)`, `clcRateQ96()` (spot), `clcRateAvgQ96(ts)` (10-min TWAP).
  - Batch: `MarketGetter.getFramesByIndex/getLotsByIndex/getTradesByIndex(market, start, end)`, `clcAmountToApprove(...)`.
  - Events: `TradeUpdate(Trade)`, `FrameUpdate(Frame)`, `LotUpdate(Lot)` (full structs in the event, so a log scanner can rebuild state).
- Auth and rate limits: whatever the chosen RPC provider imposes. H for functions (source), nothing else applies.

---

## 5. Trade path (programmatic)

- Two EOA transactions on Polygon, no off-chain signing, no API, no order matching: (1) `USDC.approve(Market, taxT [+ previous price])` using `MarketGetter.clcAmountToApprove` to size it; (2) `Market.tradeLot(timestamp, rateQ96, acquisitionPriceQ96)`. After settlement the prize is pushed to the winner by `settleFrame` (no claim step). H (source).
- `settleFrame` and `setFrameRate` are permissionless but must be called in order (`settleFrame` reverts "Previous frame not settled." if the prior frame exists and is unsettled). So the venue depends on someone running a keeper. The balance data suggests nobody has since 2025-12-26. M.
- **PayBox reachability: yes, technically (M).** Both calls are plain EVM `transaction` proposals on Polygon, which sibling research `docs/research/06-paybox-platform.md` (H there) lists in PayBox's chain catalog (Polygon 137, 2026-10-19). No typed-data or API credential is needed. I called no PayBox tool, so funding native USDC on Polygon and POL for gas were not tested. This is moot: there is nothing worth trading.

---

## 6. Fees

All from `Market.sol` defaults (H for code, M that deployed constructor args equal defaults):

- **Tax (the real cost), paid by the acquirer on their own declared price:** `tax = acquisitionPrice * tau(t)`, `tau(t) = 1 / sqrt(1 + t / 5760 s)`, `t` = seconds until the frame ends. So about 25% at 24h before settlement, about 78% at 1h, about 95% at 10 min (my arithmetic; the FAQ example uses 50% at 6h, 25% at 24h, 12.5% at 4 days, which matches the 1/sqrt(t) shape).
- **Protocol fee:** 3% of the tax (`DEFAULT_FEE_PROTOCOL_Q96`), transferred to `owner` at `settleFrame`. The remaining 97% goes to the pool.
- **Buyout:** on a resale the buyer also pays the previous holder's declared price, no fee on that part.
- **The tax is never refunded.** Expected value to a trader is negative unless the pool is large relative to the tax paid. At the current $29 pool the winner prize is about $2.9.
- Gas: POL on Polygon, paid by the caller. Settlement and rate-setting are paid by whoever calls them.

---

## 7. Resolution mechanism and dispute risk

- **Rate source (H):** Uniswap V3 `observe()` TWAP over the **10 minutes ending at frame end** (`tSettle` = 600 s) on the pool above. `setFrameRate(frameKey)` is permissionless, but it only works while the pool's oracle history still covers the frame end (`observe` reverts on too-old timestamps). If nobody calls it in time, the only way to rate the frame is `overrideFrameRate`, which is **owner-only**.
- **Admin powers (H, source):** `owner` (the constructor caller) can `withdrawAccountingToken(amount)` (drain the pool at any time), `overrideFrameRate` (set any settlement price for a closed, unsettled frame), and `createFrameProtected`. There is no timelock, no multisig in the code, no pause. Owner address = the deploying EOA `0xb0EeAE686B7e68f7B15C4B4a48602dB2613a9a69` per Sourcify (M that nothing transferred it: the contract has no `transferOwnership`, so the owner cannot change).
- Also: if no one holds the winning band, the 10% discharge goes to the owner (H). So the owner is the structural residual winner of an under-subscribed pool.
- **Dispute process:** none. No audit (DefiLlama `audits: "0"`; no audit link in README or docs). The contract imports `hardhat/console.sol` (leftover debugging import in a mainnet contract).
- TWAP manipulation: a 10-minute TWAP on a $663k pool is expensive to move, but the prize is under $3, so no one has an incentive. Irrelevant in practice.

---

## 8. Geo, ToS, automation

- Site footer (2025-10 capture) listed "Disclaimer" and "Privacy policy" pages; neither is retrievable now. ToS/geo text: NOT FOUND (searched: Wayback captures of home, docs and FAQ; the live domain is parked).
- The contract has no allowlist, KYC or geo gate. Anyone with USDC and POL can call it (H, source). No automation prohibition could be read.
- README licence: GPL-3.0, while the Solidity files carry `SPDX: MIT`. Cosmetic.

---

## 9. Event coverage and arbitrage relevance

- **Category:** crypto price only, one pair (ETH/USDC), daily 16:00 UTC TWAP, 100-USDC bands. The home page claims "a prediction market for every trading pair on a decentralized exchange"; only the ETH/USDC market was ever deployed (H, docs; no other Market address found).
- **Overlap with other venues:** nominally with daily ETH price-range markets on Polymarket and Kalshi. In practice **none usable**: Unihedge prices are self-declared buyout prices, the payoff is a share of a tax pool, the tax is sunk, and the pool is tiny. You cannot construct a locked-in hedge from it. M (reasoned from the mechanism).
- **Shared liquidity:** none with another prediction venue. The only dependency is read-only: the settlement price comes from the Uniswap V3 Polygon pool (H). So it is not a duplicate of another venue, but it is not an arbitrage leg either.
- **Signal value:** the declared buyout prices could be read as a "crowd belief about where ETH settles", but with a $29 pool and no trades in nine months there is no signal. Do not use as a Quotient input.

---

## 10. Liquidity (with dates)

| Measure | Value | Source | Tag |
|---|---|---|---|
| Contract USDC balance ("TVL") | 29.06 USDC on 2026-10-18 | https://api.llama.fi/protocol/unihedge (fixture) | H |
| Peak balance | 187.54 USDC on 2025-11-06 | same | H |
| Decay | 187.5 on 2025-11-06 -> 29.0 on 2025-12-26. In the last stretch it falls exactly 10% per day (54.58 -> 49.12 -> 44.21 -> 39.79 -> 35.81 -> 32.23 -> 29.01 on 2025-12-17..26), matching the 10% daily discharge with no new inflows | same | H (data) / M (reading) |
| Last balance change | 29.00757 -> 29.06716 on 2026-01-09 (+0.06 USDC, about one tiny tax payment). Flat for the roughly nine months since (to 2026-10-18). | same | H / M |
| Volume, OI, trade count | NOT FOUND (searched: DefiLlama protocol page and API, registry `dimension_adapters` = null, no subgraph, Polygonscan/Blockscout blocked by Cloudflare challenge and not worked around; JSON-RPC needs POST) | - | - |
| DefiLlama listing | listed 2025-03-07, category "Prediction Market", chain Polygon, oracle "Uniswap V3" | same | H |

Note: DefiLlama's history before 2025-10 may belong to earlier contract versions; its current adapter points only at `0x3C48...` (H, adapter source `projects/unihedge/index.js`).

---

## 11. Fixtures saved (all small, 2026-10-19)

`docs/research/fixtures/unihedge/`:
- `defillama_protocol_unihedge_trimmed_2026-10-19.json` - trimmed `GET https://api.llama.fi/protocol/unihedge` (meta, monthly TVL, 2025-11 to 2026-01 balance series, last points).
- `sourcify_market_verification_2026-10-19.json` - Sourcify v2 verification record and deployment tx for the Market contract (sources dropped).
- `uniswap_oracle_pool_geckoterminal_2026-10-19.json` - oracle pool size and volume.
- `liveness_probe_2026-10-19.txt` - HTTP/DNS probes showing the parked domain.
- `docs_page_text_wayback_2025-12-08.txt` - archived visible text of the last docs page (untrusted, stored as data).

There is no venue API, so there is no venue response shape to save.

---

## 12. Integration recommendation

**Skip.** No liquidity, no API, abandoned front end, owner can drain or override, and the instrument is structurally unhedgeable. Do not spend adapter effort. If someone wants a cheap watch, poll `balanceOf(Market)` of USDC once a day and re-evaluate if it moves above about $1,000 or the domain is back.

---

## Open questions

1. Any on-chain activity after 2026-01-09 beyond what the balance shows (needs a JSON-RPC read or a block-explorer API with a key).
2. Constructor arguments actually used at deployment (fee, discharge rate, tax anchor, lot step, period).
3. Whether `owner` is still the deployer EOA and whether it is a hot key.
4. Whether `app.unihedge.org` ever exposed a hidden API (Wayback capture is a bare React shell).

---

## Sources

H unless marked.
- GitHub org and repo metadata: https://github.com/unihedge-org (`gh api orgs/unihedge-org`, `repos/unihedge-org/core` commits and contents)
- README (deployments, mechanism, "Currently live in testing on Polygon"): https://github.com/unihedge-org/core/blob/main/README.md
- Contract source: https://github.com/unihedge-org/core/blob/main/contracts/Market.sol and `MarketGetter.sol`
- Sourcify verification and deployment tx: https://sourcify.dev/server/v2/contract/137/0x3C486b7178Eb71d50D060Dd02602aBfAcB88EA21
- DefiLlama protocol page (403 to WebFetch) and API: https://defillama.com/protocol/unihedge ; https://api.llama.fi/protocol/unihedge
- DefiLlama TVL adapter: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/unihedge/index.js
- Oracle pool: https://api.geckoterminal.com/api/v2/networks/polygon_pos/pools/0x45dDa9cb7c25131DF268515131f647d726f50608
- Parked domain: `curl https://unihedge.org`, `dig unihedge.org` (fixture `liveness_probe_2026-10-19.txt`)
- Archived docs (2025-12-08): https://web.archive.org/web/20251208102927id_/https://unihedge.org/docs ; FAQ: https://web.archive.org/web/20251208101716id_/https://unihedge.org/faq ; home 2025-10-14: https://web.archive.org/web/20251014065930id_/https://unihedge.org/ ; app shell 2025-11-12: https://web.archive.org/web/20251112055711id_/https://app.unihedge.org/
- arXiv paper: https://arxiv.org/abs/2108.11631 (v3 2021-12-09)
- Sibling research on PayBox chain catalog: `docs/research/06-paybox-platform.md`
- M: Medium explainer (403, not fetched; seen only as a search-result snippet): https://medium.com/@marko.corn/how-unihedge-uses-harberger-tax-to-rethink-prediction-markets-d72f01f18945
- L: X account https://x.com/UnihedgeOrg (search snippet only)

## NOT FOUND (searched)

- Official URL for the product today (searched: DefiLlama, README, Wayback; domain is parked).
- Any REST, GraphQL, WebSocket or subgraph API (searched: docs, FAQ, README, GitHub org).
- Volume, open interest, trade count (searched: DefiLlama, GitHub, explorers blocked).
- ToS, geo restrictions, audit report.
- Any 2026 news, announcement or activity from the team.

## Suspicious content

None found in the pages read (the GoDaddy lander is a plain for-sale redirect).

## Privacy check

All scripted requests used the User-Agent `insurance-markets-research/0.1`. No email, name, username or home path was sent in any request, header, URL or query string, and none is in this file or the fixtures (grepped).
