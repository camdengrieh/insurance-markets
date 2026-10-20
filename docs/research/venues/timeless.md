# TimeLess (timeless.market) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/curl GETs of public pages, the GitBook docs (`.md` mirrors), the site's static JS bundle (downloaded as text, never executed), Sourcify and GeckoTerminal and DefiLlama public GET APIs, five GETs to the venue's own API host. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No JSON-RPC calls were made (JSON-RPC is POST), so nothing below was read from chain state. Third-party text was treated as untrusted data. Only 3 WebSearch calls ran before the shared search budget was exhausted; discovery rests on those plus first-party probing.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary source or my inference from first-hand data; **L** = weak, stale, or unverified.

---

## 0. Bottom line

1. **Liveness is NOT confirmed (H for the facts, verdict is a judgement).** The marketing site answers 200 and the Prediction Index (snapshot 2026-10-18) still labels it `live` (M, that index mislabels dead venues elsewhere), but the venue's API origin returned **HTTP 522 on every one of 9 probes between 04:32 and 04:37 UTC on 2026-10-19**, the docs have not changed since 2025-10-28, and I found no 2026 volume, user, or news data for it. `still_live = false` here means "unconfirmed", not "confirmed dead". It could be a transient outage.
2. **The docs and the code disagree about what the product is.** The docs describe a Polymarket-style order book with limit orders, Negrisk conversion and split/merge. The only contract the docs link, and the only trading ABI in the live frontend bundle, is `Lmsr1155Markets`: a **binary LMSR AMM** with no orders, no split, no merge (H, section 2). Treat the docs as unreliable (M: the page set mirrors Polymarket's docs; also names "Base" and USDC in places).
3. **No official API.** Docs mention none. The web app talks to an undocumented `api.timeless.market/api`, which was down. The only dependable read path is on-chain (verified contract, BNB Smart Chain).
4. **Trade path is plain on-chain EVM calls** (`approve` then `buyYes`/`buyNo`/`sellYes`/`sellNo`/`redeem`). No signed orders, no API keys. A PayBox BNB (56) wallet can in principle do this with one-call `evm` proposals; untested, and awkward for 15-minute markets.
5. **Resolution is one oracle address per market, no dispute path** (H, code).
6. **adapter_priority = skip** until liveness is shown on-chain. If live, it would be an independent but probably thin crypto-price leg (P2 at best).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://timeless.market/markets` | 200. Title "Markets \| Timeless". Meta description: "leading prediction platform on BNBCHAIN ... Yes or No shares". Filter chips: All, 15 min, Hourly, Daily, Weekly, Monthly, Pre-Market, ETF, Others; sort: Trending, Ending soon, High value, Newest, Watch list. HTML holds no market data (client-rendered). | H |
| `GET https://api.timeless.market/api/...` (v2/market, token, setting, season, feed, root) | **522** (Cloudflare "origin connection timed out"), 19.4 s each, 9 of 9 probes over ~5 minutes | H |
| Docs sitemap | every page `lastmod` 2025-10-28 (latest 08:36 UTC). Older than 6 months: **possibly stale** | H |
| Privacy Policy | effective 2025-03-19 | H |
| Docs say Points Season 2 ran 2025-09-22 to 2026-01-26; no Season 3 mentioned | | H |
| Implementation contract `Lmsr1155Markets` verified on Sourcify 2026-05-26; proxy verified 2025-10-28 (deploy block 66161706) | consistent with activity into 2026, but verification date is not trading activity | H |
| Prediction Index (`predictionindex.xyz/ecosystem`, repo fixture 2026-10-18): chain BNB Smart Chain, binary, mechanism `clob` (wrong, see section 2), topics crypto + pre-tge, status `live` | self-labelled | M |
| AscendEX partnership article (blockchainreporter.net, 2025-10-29): "well-known prediction entity on BNB Chain"; no volume/users | >6 months old | M/stale |
| X account `@timelessmarketX` | WebFetch returned HTTP 402; not read, nothing paid | - |
| Shutdown/pause news | one search found none (the engine's results were mostly irrelevant) | L |

Name collisions to avoid: TIMELESS meme token on Four.meme (BNB) and DefiLlama "Timeless Finance" (yield, Ethereum, about $10K TVL, `timelessfi.com`) are different projects (M/H). A search snippet also mentioned an unrelated "Timeless" product at Kalshi (L, one low-authority source).

---

## 2. Kind and market model

- **Kind:** on-chain prediction market, curated (market creation needs `MARKET_CREATOR_ROLE`; H code). Operator: Timeless Technologies Inc., Panama (H, ToS).
- **Model:** **binary YES/NO only, LMSR AMM** (H: `contracts/Lmsr1155Markets.sol`, Sourcify exact match). Cost function `C(qYes,qNo) = b * ln(e^(qYes/b) + e^(qNo/b))`; buy cost = `C(q+d) - C(q)`; marginal `priceYes = e^(qYes/b)/(e^(qYes/b)+e^(qNo/b))`, `priceNo = 1 - priceYes`, clamped to (0,1). Liquidity is the per-market parameter `b` (wad), set at creation; max AMM loss is `b*ln2`.
- **Multi-outcome** (docs: "multiple voting pairs") = several binary markets grouped as an event (API has `/v2/market/{id}/chance` and `/holders` "MULTI_EVENT" routes; M). No categorical or scalar contract type exists in the ABI.
- **Tokenisation:** ERC-1155 inside the same contract; `yesId(marketId)` / `noId(marketId)` (pure functions), 18 decimals, 1 share redeems for 1 collateral unit. **Outcome tokens are non-transferable**: `_update` reverts unless mint or burn, and `setApprovalForAll` always reverts (H). So no secondary market, no use as collateral elsewhere, no OTC unwinding.
- **Docs claims that the contract does not support (H for both sides):** order book, limit orders, Negrisk "convert No into Yes of others", split/merge. None of these functions is in the ABI (fixture `lmsr1155markets_abi.json`). The docs' "winner takes the loser's stake" and "adaptive fee" prose also does not match the code.
- **Time structure:** each market has `closeTime`; trading reverts at/after it; the oracle resolves afterwards. 15-min/hourly/daily/weekly/monthly are just different `closeTime` buckets in the UI (M).
- **Per-market fields seen in the frontend** (M, bundle): `question`, `locales`, `image`, `tokenSymbol`, `rules` (shown in a "Resolution" tab), `endData.lastPrice` / `endData.pythPrice`, `contract`, `collateral`, `predictionType` (includes `pre-market` and `token`).

## 3. Chains and collateral

- **Chain: BNB Smart Chain (chainId 56)** (H: site meta "BNBCHAIN"; Sourcify `chainId 56`; bundle RPC `56.rpc.thirdweb.com`).
- **Contracts (H, Sourcify, docs page `docs.timeless.market/contract` links the proxy on BscScan):**
  - Proxy `0xe8DcBEefB9C601E10BD77847D45f6EBCcbe9C294` (OZ TransparentUpgradeableProxy, deployed 2025-10-28 at block 66161706).
  - Implementation `0xE2fECee58cbf68B01C62220097801f3C922573B2` = `Lmsr1155Markets`, solc 0.8.28, verified 2026-05-26.
  - Upgradeable by the proxy admin (H), so the logic can change.
- **Collateral: per market, any ERC-20** chosen at `createMarket` (H). Docs: "typically USD1" (H, docs). Bundle constants: USD1 `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` (GeckoTerminal: "World Liberty Financial USD", 18 dec), BSC-USD/USDT `0x55d398326f99059fF775485246999027B3197955`, Binance-Peg USDC `0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d` (all 18 dec; H for existence and decimals, M that markets actually use each). Which collateral each live market uses is NOT FOUND (needs the API or `marketStatus` reads).
- **Gas:** BNB. Docs claim "about $0.03 per tx" / "<0.01 USD1" (L, docs-only, conflicting).
- **Solvency note (M, my reading of the source, verify before relying):** `createMarket` does not pull any `b*ln2` subsidy, yet winners redeem 1:1. A market that ends lopsided (`q >> b`) can hold about `b*ln2` less collateral than outstanding winning shares unless the operator pre-funds the contract. Last redeemers could then fail. Check the contract's collateral balance against `sum(qWinner)` before trusting settlement.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public/authenticated API | **NONE documented.** Docs index (`llms.txt`, 17 pages) has no API page; fee/contract/ToS pages mention none | H |
| Unofficial backend | Base `https://api.timeless.market/api`, taken from the public JS bundle. Route constants incl. `GET /v2/market` (query: `pageIndex`, `pageSize`, `predictionType`, `sort`, `sortOrder`, `watchList`, `time`, `tokenSymbol`, `search`), `/v2/market/{slug}`, `/market/{network}/{marketId}`, `/market/{network}/{marketId}/chances`, `.../transactions`, `.../{type}-holders`, `/token`, `/feed`, `/season`, `/leaderboard`, `/user/{address}/portfolio`; auth via `/auth/signature-message` + `/auth/wallet` (wallet-signed login) for user routes | H (strings exist), nothing exercised |
| Status | **522 on all probes**; no response shape confirmed; **no API fixture could be saved** | H |
| WebSocket | Unofficial. The bundle opens a socket.io client to `wss://api.timeless.market/app` (transports websocket then polling) and listens for `market.created`, `market.bought`, `market.sold`. Payloads unseen; host down | H (strings), nothing exercised |
| Auth / rate limits | NOT FOUND (searched: docs, llms.txt, ToS, bundle) | - |
| **On-chain read path (the real one)** | Public proxy ABI: `nextMarketId()`, `markets(id)`, `marketStatus(id)` -> (outcome, b, qYes, qNo, collateral, closeTime, oracle), `priceYes/priceNo(id)`, `quoteBuyYes/No(WithFee)(id, deltaShares)`, `quoteSellYes/No(WithFee)`, `quoteBuyYes/NoForCost`, `feeBps()`, `feeRecipient()`, `marketMetadataURI(id)` (question text lives off-chain behind this URI), `balanceOf(user, yesId/noId)`. Events: `MarketCreated`, `Bought`, `Sold`, `Resolved`, `Redeemed`, `FeeCollected`. Any BSC RPC should work (WS `eth_subscribe` logs for push); the bundle's chain config references the canonical Multicall3 address | H (ABI), M (RPC/Multicall3), untested live |
| Discovery without the API | enumerate `1..nextMarketId` or scan `MarketCreated` logs; fetch `metadataURI` for the question and `rules` | M |

Fixtures: `docs/research/fixtures/timeless/` (section 12). `frontend_api_routes_unofficial.json` is route names only, not responses.

## 5. Trade path

- **Programmatic placement: yes, on-chain only.** Flow: `collateral.approve(proxy, amount)` once, then `buyYes(marketId, deltaSharesWad, maxCostWad)` / `buyNo` / `buyYesForCost(marketId, costWad, minSharesWad)` / `sellYes(marketId, deltaSharesWad, minPayoutWad)` / `redeem(marketId)` after resolution (H). Slippage guard is `maxCost`/`minPayout`; **there is no deadline parameter**. Reverts: market closed, already resolved, paused. `quote*WithFee` gives (cost, fee, total) for exact simulation.
- **No signed orders, no API key, no HMAC, no Permit2.** Auth = the sending EOA.
- **Orders/cancel:** n/a (AMM, atomic fills; no resting orders despite the docs).
- **Pause:** `PAUSER_ROLE` can pause trading and `resolve` (not `redeem`). Admin roles: DEFAULT_ADMIN, FEE_SETTER, MARKET_CREATOR, PAUSER (granted to the initial admin; current holders NOT FOUND, needs `getRoleMembers`).

## 6. Reachable through PayBox? -> **partial**

- BNB Smart Chain (56) is in PayBox's chain catalog (repo note `06-paybox-platform.md`, live `discover_tokens`, 2026-10-19; H there, "catalog, not a support allowlist").
- Mechanism: PayBox `evm` proposal = one call `{to, value, data}` per proposal (same note, section 3). So `approve` and `buyYes` are two proposals; raw calldata is what the human sees. This is the same E1-by-mechanism class as Trueo in `platform-registry-design.md`. Nothing needs off-chain typed-data signing.
- Frictions: (a) approval latency vs 15-minute markets unless the grant is autonomous; (b) no deadline param, so a stale signed/queued proposal can fill at a worse price within `maxCost`; (c) no atomic multi-call (cannot bundle approve+buy); (d) not tested on mainnet; (e) the venue's front door is geo-blocked for US users (section 9).

## 7. Fees

- **Code (H):** one global `feeBps` (admin-settable by `FEE_SETTER_ROLE`, max 10000), applied symmetrically. Buy: `fee = cost * feeBps / 10000`, trader pays `cost + fee`. Sell: `net = gross - fee`. Paid by the trader to `feeRecipient` (a treasury) in the same tx. `Bought`/`Sold` events report cost/payout **excluding** the fee; `FeeCollected` reports it. **Current `feeBps` value: NOT FOUND** (needs one `eth_call`; RPC is POST, not done).
- **Docs (H that it is claimed, L as to truth):** "Adaptive fee": maker 0%, taker 0.1% to 0.5% by spread/volume/event type (worked examples 0.02% and 0.15%), split 75% LPs / 25% $TIME holders in the examples but 85-90% LPs / 10-15% protocol in the table; curators get 10-20%; VIP rebate tiers by 30-day volume (VIP1 at 5,000 USD1 = 10% rebate up to VIP7 at 480,000 = 70%); gas about $0.03. None of this is visible in the verified contract. Page last modified 2025-10-28.
- Aggregator rule: use the on-chain `quote*WithFee`, not the docs.

## 8. Resolution mechanism and dispute risk

- **On-chain (H):** `resolve(marketId, outcome)` may be called only by `market.oracle`, a single address set per market at creation (Yes / No / Invalid). Once set it cannot be changed; no challenge window, no bond, no escalation. `Invalid` pays proportional refunds from the pool (`poolWad * userShares / totalShares`). `redeem` is permissionless after resolution.
- **Off-chain:** docs describe only "the timer ends, condition checked" and name no oracle or dispute process (H). ToS: the Company chooses the "Oracle Sources", discloses them per market at creation, and the determination is "final and binding"; it may cancel markets "impossible to resolve" (H). Frontend shows `endData.pythPrice` as a close price, which suggests Pyth for price markets (M; settlement source NOT FOUND). DappRadar's "AI-based consensus oracle" (from a search snippet, L) is not supported by the contract.
- **Risk: HIGH centralisation.** Expect ad hoc, operator-timed resolution; late or wrong resolution cannot be contested on-chain; the proxy is upgradeable. Hedged cross-venue positions carry basis risk against venues that settle on UMA, Chainlink or exchange prices.

## 9. Geo, ToS, automation

- Excluded jurisdictions (H, ToS section 1): **Vietnam, United States, Cuba, Iran, North Korea, Syria, Crimea/Donetsk/Luhansk**; OFAC/EU/UK sanctions lists; 18+. Enforcement method (IP block, wallet screening) NOT FOUND.
- No clause on bots or APIs (searched ToS and Privacy; zero hits for bot/automat/API). Relevant rules: wash trading, spoofing, layering and "coordinated trades" prohibited; one account per person, none on behalf of another; wagers final once on-chain; fees changeable at any time; Company may suspend accounts or cancel markets; ICC arbitration in Panama City with class-action waiver.
- Platform Content licence is "personal, non-commercial use only"; unauthorized copying of "data compilations" is prohibited (H). That bears on scraping the unofficial API commercially; reading public chain state is not covered by it.
- Contract address and a Brand Kit link are the only "developer" assets; no GitHub org found (searched `gh search` for the domain: no relevant repo).

## 10. Liquidity

- **Volume / OI / TVL: NOT FOUND for 2026** (searched: DefiLlama `/protocols` API (no TimeLess prediction entry, only the unrelated Timeless Finance), DappRadar (403), BscScan (403), keyless Etherscan v2 (needs key), one web search, docs).
- DappRadar snippet: "80K+ social members & 1K+ active users" (L, self-reported, undated, page not readable).
- Docs' "$400M+ total" is an illustrative example in the fee page, not a measurement (L).
- Depth per market is `b` (analytic), likely small for 15-minute markets; NOT FOUND.
- Dates: nothing newer than 2025-10-29 that quantifies activity.

## 11. Event categories, overlap, shared liquidity

- Categories: **crypto token price** across 15m/hourly/daily/weekly/monthly (H labels; docs examples: BTC thresholds, ETH $3,000 by Friday, BNB price), **pre-market** (pre-TGE token markets) and **ETF** (labels only, content unknown), "Others". Prediction Index topics: crypto, pre-tge (M). No evidence of sports, politics or macro.
- Arbitrage overlap: crypto up/down and threshold markets on Polymarket (short-horizon crypto), Limitless (hourly/daily crypto), Kalshi crypto, and BNB-chain venues (Predict.fun, Myriad, Opinion). Pre-TGE/FDV markets overlap Polymarket and Opinion where they exist. All unverified for lack of live market data.
- **Shared liquidity: none found.** Own LMSR pools funded by its own collateral; no CTF/Polymarket/UMA integration in the ABI. So it would count as an independent leg, but note the LMSR property `pYes + pNo = 1` exactly, so no intra-venue Yes+No mispricing; the only edge is cross-venue.
- Resolution-basis mismatch (oracle address vs other venues' sources) is the main hedge risk.

## 12. Adapter priority: **skip** (revisit trigger below)

Why skip now: liveness unproven (API origin down, docs frozen 2025-10-28); no official API; docs untrustworthy; liquidity unmeasured and probably small; single-oracle resolution; non-transferable positions; geo and ToS limits; PayBox path unproven for short-dated markets.

Upgrade to **P2** (signal/thin leg) if a human-approved JSON-RPC read shows: `nextMarketId` growing, `Bought` events within the last 7 days, and non-trivial `b`/collateral on open markets. A cheap adapter then needs only the saved ABI, a BSC RPC, `marketStatus` + `quoteBuy*WithFee` calls, and a metadata-URI fetch. Not P1/P0 unless depth and oracle practice prove out.

## 13. Not found / open questions

- Any 2026 volume, user, TVL or market-count figure; whether any market is open today.
- Current `feeBps`, `feeRecipient`, role holders, proxy admin, per-market `b`, collateral and `oracle` addresses (all one `eth_call` each).
- Whether the 522 is an outage or a shutdown; whether a v2 API or a different contract (CLOB) exists that the bundle does not use. The `/market/{network}/{marketId}` route hints at multi-network support; only BSC was seen.
- Settlement source for price markets (Pyth?) and the per-market `rules` text.
- Whether the geo block is enforced on the contract (it cannot be) or only in the web app.
- Official team contact, GitHub org, audit reports (none found).

## 14. Sources

Primary (H):
- https://timeless.market/markets (HTML, meta, footer links, 2026-10-19)
- https://docs.timeless.market/llms.txt and the `.md` mirrors of: getting-started/quickstart, getting-started/publish-your-docs, getting-started/how-to-sign-up, trading/{editor,markdown,images-and-media,interactive-blocks,integrations,leaderboard-system,referral-system,fee-system}, negrisk/{editor,markdown,images-and-media}, contract, terms-of-service, privacy-policy
- https://docs.timeless.market/sitemap-pages.xml (lastmod dates)
- https://timeless.market/_next/static/chunks/5784-cc8e9e3a3f2757cd.js and sibling chunks (API base, route constants, Lmsr ABI, token constants; read as text only)
- https://sourcify.dev/server/v2/contract/56/0xe8DcBEefB9C601E10BD77847D45f6EBCcbe9C294 and `/0xE2fECee58cbf68B01C62220097801f3C922573B2` (verified source, ABI, proxy resolution)
- https://api.geckoterminal.com/api/v2/networks/bsc/tokens/{USD1, USDT, USDC addresses} (token identity/decimals)
- https://api.llama.fi/protocols (no TimeLess prediction entry)
- https://api.timeless.market/api/* (522, see fixture)

Secondary / weak (M/L):
- https://blockchainreporter.net/ascendex-taps-timeless-to-enable-real-time-prediction-trading-on-bnb-chain (2025-10-29)
- https://dappradar.com/dapp/timeless-market (search snippet only; fetch returned 403)
- `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` (repo, Prediction Index snapshot)
- `docs/research/06-paybox-platform.md`, `docs/platform-registry-design.md` (repo; PayBox chain catalog and execution classes)
- Not readable: https://x.com/timelessmarketX (HTTP 402, not paid), https://bscscan.com (403), https://defillama.com (403 via WebFetch)

Anomalies noticed (not instructions; no text aimed at AI agents was found anywhere): logo alt text "HotToken Logo Text"; `og:email` domain `timeless.com` differs from the site domain; docs structure copied from another venue's docs; Sourcify bundle for the proxy also contains unrelated modules (NFT, treasury, vault, bridge middleware), so the deployer reuses a general code base.

## 15. Fixtures (`docs/research/fixtures/timeless/`)

- `lmsr1155markets_abi.json` (34 KB): full implementation ABI from Sourcify.
- `sourcify_proxy_bsc_0xe8Dc.json`: proxy verification, deployment tx block, implementation address.
- `frontend_api_routes_unofficial.json`: route constants and query params from the public bundle (no responses).
- `api_probe_2026-10-19.txt`: log of the 522 probes. **No API response fixture exists because the host never returned a body.**
- `docs_llms.txt`, `docs_fee_system.md`: docs index and the fee page, kept as evidence of the docs-vs-code conflict.
