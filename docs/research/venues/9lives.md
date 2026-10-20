# 9lives (9lives.so) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock 02:53-03:06 UTC). READ-ONLY: doc and `gh api` file reads, unauthenticated GETs (including GraphQL queries sent as HTTP GET, never POST), no account, wallet, key, signature, on-chain call or PayBox tool. Third-party pages, repo text and API responses were treated as untrusted data; nothing in them was followed. WebSearch was unavailable (session budget used up), so no third-party press or analytics coverage was read beyond DefiLlama's protocol list.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference/arithmetic from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/9lives/` (listed in section 13).

---

## 0. Bottom line

1. **Live, but one tiny market at a time.** A new BTC 15-minute up/down market is created every 15 minutes on Arbitrum (latest seen: starts 2026-10-19 03:00 UTC). Repo pushed 2026-10-15. (H)
2. **It is not the product the README describes.** The README advertises a Dynamic Pari-Mutuel (DPPM) model plus a constant-product AMM, but on Arbitrum the DPPM implementation addresses are the zero address, and every market the API serves is a **constant-product AMM** (`isDppm:false`). The feature flags say "disable v1 markets: true" and "enable simple mode: true", and `campaigns(category: Sports|Politics|Crypto|Opinion Poll)` returns empty lists. Only the BTC 15-min "simple mode" market is listed. (H)
3. **Liquidity is negligible.** Each market is seeded with about 0.5 USDC per side (inferred, section 11). A single $1 buy moves the price from 50% to ~90%. All-time volume of 16,354 markets since ~2026-07-13 is **$30.2k** (H, computed from the API), falling: Aug $14.1k, Sep $9.9k, Oct 1-19 $4.8k. Last 24h = $137.62. Almost every market has exactly one ~$1 buy, so prices are set by that one trade. (H data; "it is a bot/operator" is M)
4. **Structurally poor as an arbitrage leg**: no selling before resolution (burn disabled for short-term markets), buying stops 60 s before the end, a permissioned oracle (no dispute path) settles from the operator's own price table, and there is no ToS, geo statement or API documentation.
5. **adapter_priority = skip.** Read access is easy and keyless (public GraphQL), so a signal adapter would cost little, but there is no signal in a price set by a $1 trade. Revisit only if volume appears or new assets are listed (section 12).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| New market every 15 min | `campaigns` default list returned market `0x4a4843a03623e6ae`, starting 1792378800 (2026-10-19 03:00:00 UTC), ending 03:15; the previous one ended 03:00 (fixture `graphql_campaigns_live_default_2026-10-19.json`) | H |
| History | 16,354 ended 15-min BTC markets, earliest ending ~2026-07-13 (page 163 of 164 at pageSize 100) | H |
| Repo | `fluidity-money/9lives.so` pushed 2026-10-15T18:20Z; MIT; not archived; 21 stars (`gh api repos/fluidity-money/9lives.so`) | H |
| Site | `https://9lives.so` -> 308 -> `www.9lives.so` -> 307 -> `/campaign/btc/15mins` (Vercel). `arb.9lives.so` -> 301 -> `www.9lives.so` | H |
| Status page | `status.9lives.so` (updated 2026-10-19 02:52 UTC per page): "Ingestor" operational, "9lives.so" degraded ~1h43m with note "Updating accounts, there may be downtime"; one listed incident dated 2026-09-09 (title not shown) | M (WebFetch summary) |
| Changelog | "16-06-2026 Arbitrum: Welcome to our sneaky Arbitrum deployment" (moved from Superposition chain 55244); "18-03-2026 Shortterm AMM" (`CHANGELOG.md`) | H |

Verdict: **still_live = true**, tiny and narrow.

---

## 2. Kind and market model

- **Kind (H):** on-chain constant-product AMM prediction markets (Gnosis/Omen-FPMM style), written in Rust for Arbitrum Stylus (WASM), with Solidity helpers. Operator: Fluidity (repo org `fluidity-money`; `fees.rs` comment "Fluidity Labs operations").
- **Live product (H, GraphQL + contract source):** "BTC will end up above $X before <unix ts>", binary, 15-minute window. `priceMetadata = {baseAsset:"BTC", quoteAsset:"USD", priceTargetForUp:"X"}`. X is the BTC price at market start (strikes are within ~0.1% of Coinbase spot: strike 82516 vs spot 82559.5 at ~02:57 UTC, M). Outcomes array order is `[below, above]` (first = "No", second = "Yes", per `create-price-market.rc`).
- **Pricing (H, `src/trading_amm.rs`):** reserves `r_i` per outcome; invariant `prod(r_i) = L^n`, with `L` = seed liquidity (n = 2 here). Buy of net amount `a`: every reserve += a, then the bought outcome's reserve is reset to `L^n / prod(others)`, and the buyer receives the difference as shares. Price of outcome i = `prod_{j!=i} r_j / sum_k prod_{j!=k} r_j`; for two outcomes `p_yes = r_no / (r_yes + r_no)`. Each winning share pays exactly 1 USDC (6 decimals); losing shares pay 0.
- **Tokenisation (H):** one ERC-20 share token per outcome (`Share.sol`, CREATE2 clone, minted/burned only by the pool); share address exposed as `outcomes[].share.address`. 6 decimals.
- **Identifiers (H):** campaign `identifier` is 8 bytes (e.g. `0x4a4843a03623e6ae`), `poolAddress` is the per-market Trading proxy, outcome `identifier` is bytes8 (`keccak256("o"+name+"d"+description+"s"+seed)[:8]`). Pool address changes every 15 minutes, so an adapter must read it from the API each time.
- **No selling (H):** for short-term markets `burn` returns `Error::ShorttermAmm`; positions are held to resolution. **No LP deposits** for them either; liquidity comes from the protocol `Vault` and is returned or topped up at resolution (`vault.ammReceive/ammGift`).
- **Cutoff (H):** `mint` reverts `ShorttermTooLate` if `block_timestamp > time_ending - 60`.
- **Not scalar, not categorical** in the live product (the AMM supports n >= 2 outcomes in code; DPPM supports exactly 2, not deployed on Arbitrum).
- **Doc drift (H):** `agent-skills/adding-shortterm-markets.md` calls short-term markets "recurring DPPM"; the API says `isDppm:false`. Trust the API/contract source.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Arbitrum One (42161). Previously Superposition (chain id 55244); the README still ships a `build-mainnet-superposition.sh` | H |
| Collateral | Native USDC on Arbitrum `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, 6 decimals (called "fUSDC" in code/GraphQL: `NEXT_PUBLIC_FUSDC_ADDR` in the live bundle starts `0xaf88d065e77c8cC2239327C5`; README deployments list the same USDC) | H (prefix match for the bundle value) |
| Core contracts (README "Deployments / Arbitrum mainnet") | Factory proxy `0x90234c942f335df8c055b9c1a2e0babf060a31ad`; Vault `0xE45C182512e18982522B620EDfF0D9C56c294C08`; Trading beacon `0x5F2BD61Bb7e4a8008e0725F8AbB977cbe41FcfD5`; Oracle `0xA2cFa0E8dD8abD255343c9ab6D36f3306Ad3A6aB`; Buy helper `0xAa901219528e22aC1E3a3bDc40a34Eab7983d240`; Lenses `0xA28CCAf4E66276AA8e1635596cc9494107A0fDA9`; Paymaster `0xA19B3a76d5744825c3672a5FFE1F4F5Aee3F28dE`. DPPM mint/extras/quotes/price impls = `0x000...0` | H (README; not verified on-chain) |
| Buying from other chains | Frontend lists Ethereum, Optimism, Base, Polygon, BSC, Avalanche, MegaETH, HyperEVM, Tempo as source chains (Stargate/Camelot via BuyHelper2); destination is always Arbitrum. Feature flags: "enable relay buy: false", "enable lifi zaps: false" | H (`web/src/config/chains.ts`, `features.json`) |
| Frontend label "Base" | The "Base" shown on the BTC page is the base *asset* (BTC), not the Base chain | H (bundle: `baseAsset:"BTC"`) |

---

## 4. Read API

**Exists: unofficial-but-public.** There is no API documentation (the README says only "cmd/: Backend services (Go): GraphQL API, ingestor, paymaster"; `docs.9lives.so` is an mdBook of the README and contract docs, no endpoint list). The endpoints below are what the production web app calls.

| Item | Value | Tag |
|---|---|---|
| GraphQL (production, Arbitrum) | `https://9lives-arb.stellate.sh` (Stellate GraphQL CDN in front of the Go gqlgen server). Taken from the live JS bundle `NEXT_PUBLIC_GRAPHQL_URL`. Answers plain **HTTP GET** `?query=...` (verified); POST also allowed by CORS header (`access-control-allow-methods: POST, GET, HEAD, OPTIONS`, `access-control-allow-origin: *`). Response `cache-control: s-maxage=0, no-cache`. | H |
| Schema | `docs/research/fixtures/9lives/graphql_schema_from_repo_cmd_graphql.ethereum_2026-10-19.graphqls` (from repo `cmd/graphql.ethereum/graph/schema.graphqls`; introspection not tried on this host) | H |
| Auth / keys | None for queries. Mutations (comments, paymaster, campaign explain) need signatures or an admin secret. | H |
| Rate limits | NOT FOUND (searched: README, docs, response headers on the GraphQL host). I made ~230 GETs at 0.6-1 s spacing with no throttling; one `assetsDeltaHour` query timed out at 30 s. | M |
| Websocket | `wss://arb-websocket.9lives.so` (from bundle). Server is `cmd/websocket.database`: a Postgres CDC stream of table rows (`{table, content, snapshot}`), client sends `ask_for_snapshot`/`add` filter messages. A bare handshake returned HTTP 400; protocol not otherwise documented. Not subscribed. | H source / untested |
| Other hosts in bundle | `rfqhub.9lives.so` (GraphQL, section 12), `features.9lives.so/features.json` (feature flags), `arb-accounts.superposition.so` (accounts), `points-graph.superposition.so`, `events.9lives.so` (PostHog analytics) | H |

Key queries (all H, run live):

| Need | Query |
|---|---|
| Current live market(s) | `{campaigns(pageSize:5){name identifier poolAddress starting ending winner totalVolume isDppm settlement categories odds shares{shares identifier} investmentAmounts{id usdc share} outcomes{name identifier share{address}} priceMetadata{baseAsset quoteAsset priceTargetForUp}}}` - default ordering excludes decided markets; only `shown` campaigns |
| Live market by asset/period | `campaignBySymbol(symbol:"BTC", category:"15mins")` and `timebasedCampaigns(categories:[..],tokens:[..])` (schema; the latter returned `[]` for ETH/OIL/SPY/QQQ/PAXG) |
| Resolved markets | `campaigns(orderBy:"ended", pageSize:100, page:N)` (valid orderBy: `ended`, `trending`, `newest`, `volume`, `ending`, `liquidity`; page is 0-based; `page:-1` disables paging) |
| Prices / book | No order book. `shares[]` = current outcome reserves (6 dp) per outcome identifier; price = formula in section 2. `shares` can lag `investmentAmounts` (live market showed `shares:[]` while `investmentAmounts` already held a buy; ingestor lag, M). `campaignPriceEvents(poolAddress)` = reserve history per trade. On-chain alternative below. |
| Trades | `userActivity(address, campaignId, page, pageSize)` needs an address; there is **no market-wide trade list** in the schema. Market volume only: `totalVolume` (micro-USDC) and `investmentAmounts{id usdc share}`. |
| Resolution | `campaigns[].winner` (bytes8 outcome id, null while open); `getFinalPrice(symbol:"BTC", ending:<unix>)` returns the oracle price used (e.g. `"82518"` for ending 1792377900) |
| Volume / assets | `assets{name totalSpent}` (24h sum of buys by base asset, micro-USDC), `leaderboards` |

On-chain read ABI (from repo `web/src/config/abi/trading.ts`, H; **no RPC call made**): per pool `priceA827ED27(bytes8)`, `quoteC0E17FC7(bytes8 outcome, uint256 usd) -> (uint256,uint256,uint256)`, `details(bytes8)`, `fees62DAA154()`, `timeStart()`, `timeEnding()`, `outcomeList()`, `shareAddr(bytes8)`, `oracle()`. Several are marked nonpayable in the ABI but are intended for `eth_call`. Lens contract `balancesForAll(address[])` for positions.

---

## 5. Trade path

**Programmatic, fully permissionless on-chain, no API key (H, source + ABI; not executed).**

1. `USDC.approve(pool, amount)` on Arbitrum (or approve `BuyHelper`/`BuyHelper2` and use their `mint(...)` for swap-in from another token).
2. `pool.mint8A059B6E(bytes8 outcome, uint256 value, address referrer, address recipient) -> shares`. Pulls `value` USDC from the sender (`take_from_sender`), deducts fees, mints shares to `recipient` (zero address = sender).
3. After the oracle decides: `pool.payoffCB6F2565(bytes8 outcome, uint256 shareAmt, address recipient)` (pass max to claim all); pays 1 USDC per winning share. `ClaimantHelper` batches claims.
4. No cancel, no limit orders, no sell/burn on short-term markets.

Gasless alternative (H, GraphQL schema + feature flags): sign an EIP-2612 USDC permit and call the `requestPaymaster(operation: MINT|SELL|..., permit v/r/s, market, amountToSpend, minimumBack, maximumFee, ...)` mutation; the Paymaster submits the tx and takes a USDC fee (`main.go` comment: minimum fee 200000 = 20 cents). Flags show "enable paymaster buy: true". That is a POST mutation, so it was not exercised. A 20-cent fee on a ~$1 trade is not workable.

Signing scheme: plain EVM transactions (EOA) or EIP-2612 permit typed data. No order-signing/CLOB.

---

## 6. PayBox reachability

- **Chain:** Arbitrum (42161) is in PayBox's 11-entry chain catalog (earlier research `docs/research/06-paybox-platform.md`, H 2026-10-19). Both calls (approve, mint) are ordinary single-call EVM transactions, so each can be a `io.paybox/transactionProposal` (one call per proposal, EOA pays ETH gas on Arbitrum). So: **yes in principle, as 2 proposals per trade (1 if allowance exists)**.
- **Not tested:** whether PayBox simulates and approves arbitrary-contract Stylus calls (the pool is a Stylus WASM beacon proxy; simulation behaviour unknown).
- **Practical blockers:** pool address and strike change every 15 minutes; buying stops 60 s before the end; PayBox proposal expiry <= 300 s plus approval latency; positions cannot be exited. For a 15-minute binary that is a poor fit even before liquidity is considered.
- Signed-order route: none (no off-chain order book). `request_wallet_sign` typedData could only supply the paymaster permit (see section 5).

---

## 7. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Protocol | 0.8% of each buy (`FEE_SPN_MINT_PCT = 8 / FEE_SCALING 1000`) | buyer, deducted before minting | H |
| Creator, LP, referrer | per market, each < 10%; the market-creation script defaults to `3` each = 0.3% (`create-price-market.rc`) | buyer | H (script defaults) |
| Observed total | 1.7%: every sampled market has a net buy of exactly 983,000 micro-USDC (= $1.00 gross x 0.983) and the live market's 983,000 buy returned 1,314,422 shares, which matches the CPMM formula with seed 500,000 exactly | M (inferred) |
| Sell fee | n/a (no sells in short-term markets) | | H |
| Payout | 1:1, no fee in `internal_amm_payoff` | | H |
| Referrer | the referrer share goes to the DAO when `referrer = 0x0`; self-referral rebate is not blocked in code I read ("referrer needs to verify: false") | | M |
| Gas | Arbitrum gas (EOA) or ~$0.20 paymaster fee | trader | M/L |

Round-trip cost is just the 1.7% entry, but since you cannot exit, the trade is "buy and hold to expiry".

---

## 8. Resolution and dispute risk

- Short-term markets are created with `oracle == ORACLE_ADDR`; only that address can call `decide(outcome)` (`internal_decide` asserts `msg_sender == oracle`). GraphQL reports `settlement: "CONTRACT"`. (H, source + API)
- The script header says these use a "permissioned user using one of the private oracle types (ie, the PRICE_ORACLE oracle type)" with an admin secret (H). I could not tell whether `0xA2cF...` is an EOA or a contract (explorer behind a Cloudflare challenge; no RPC POST made).
- The settlement price comes from the operator's own table `oracles_ninelives_prices_2` (GraphQL `getFinalPrice` reads it; the websocket README says the feed covers "1000+ bases"). The upstream exchange/index behind it is **NOT FOUND** (searched: resolvers, websocket README, repo tree). Example: ending 1792377900 -> final price 82518, winner "above $82342" (consistent). (H)
- **No dispute window** for these markets. The call/whinge/bond mechanism ($2 call bond, $7 whinge bond, 2% pot fee) belongs to "infrastructure markets" (`INFRA_MARKETS.md` is an empty stub), which are not what is listed now. Dispute risk is therefore replaced by **operator/oracle trust risk**; basis risk vs other venues' sources (Chainlink-style streams, CF Benchmarks, etc.) is high for a 15-min direction bet.
- Audits: Dadekuma (2024-12, DPM and infra contracts) and OpenZeppelin (README says 2025-11, `audits/README.md` says 11 Sept 2025; "AMM implementation"). Both predate the short-term AMM (changelog 2026-03-18) and the Arbitrum launch (2026-06-16); whether the short-term variant was in scope is **NOT FOUND**. (M)

---

## 9. Geo, ToS, automation

- Terms & Conditions: footer link is a placeholder `href="#"` (H, bundle and HTML). Privacy policy: `static.9lives.so/privacy.pdf` (PDF created 2024-09-04; its text could not be extracted here, so contents unread).
- Geo-blocking / restricted jurisdictions: NOT FOUND (searched: site HTML and JS chunks, repo tree for middleware/geo/block files, docs). No KYC step exists in the flow I read. A Reown wallet-connect library constant lists restricted timezones, but that is library code, not a 9lives policy (L).
- Automation: no rule found either way. API is open (CORS `*`, no key). Absence of terms is not permission; treat legal status as unreviewed.

---

## 10. Event categories and overlap

| Category | 9lives | Overlap |
|---|---|---|
| Crypto price, BTC 15-minute up/down | The only live market | Same shape as 15-minute BTC up/down contracts on other venues (e.g. Polymarket, Kalshi, Limitless per their own specs; I did not verify those here, L) - with different strike and settlement sources |
| Sports, politics, macro, opinion polls | Not served (v1 markets disabled; category filters empty) | none |
| Configured but unlisted | `xyzcbrs`, `xyzspcx`, `xyzibm`, `xyzdram`, `paxg`, `qqq` (daily), `cvx`, `spy`, `xyzcl` all `listed:false` in `web/src/config/app.ts`; `timebasedCampaigns` returns nothing for them | Would be stock/commodity direction markets if ever enabled |

---

## 11. Liquidity (all with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| All-time volume (16,354 markets, 2026-07-13 to 2026-10-19) | $30,158.17 | summed `totalVolume` over `campaigns(orderBy:"ended")` pages 0-163, 2026-10-19 (`volume_by_month_all_ended_markets_2026-10-19.json`) | H (units micro-USDC per schema comment "6 decimals fusdc" on `InvestmentAmounts`; `totalVolume` is documented as "usd", M) |
| By month | Jul $1.4k, Aug $14.1k, Sep $9.9k, Oct 1-19 $4.8k | same | H |
| Last 24h | $137.62 (BTC) | `assets{name totalSpent}` = sum of buys in last 24h (resolver source), 2026-10-19 | H |
| Largest single market in last 100 | $3.93 | page 0 sample | H |
| Per-market pool | seed about 0.5 USDC per outcome (reserves 500,000 each). Derived: after one 983,000 net buy, reserves were 1,483,000 / 168,578 = 500,000 + 983,000 and 500,000^2 / 1,483,000 | ended-market sample 2026-10-19 | M (arithmetic, matches exactly) |
| Price impact, two-outcome market, fresh pool, 1.7% fee | $0.10 buy -> 58.9%; $0.50 -> 79.7%; $1 -> 89.8% (avg fill 0.748 net of fee, 0.761 gross); $5 -> 99.2%; $10 -> 99.8% | my computation from the contract formula | M |
| Typical activity | one buy of $1.00 gross about 10-13 min after the market starts, in nearly every market (checked the 6 latest ended: 1-2 price events each, at +610...+819 s) | `campaignPriceEvents` | H data, "operator/bot" = L |
| TVL / OI | NOT FOUND. 9lives is not in DefiLlama's `/protocols` list (searched names/slugs for "9lives", "ninelives"); Vault balance not read (no explorer/RPC access) | | H (absence) |

---

## 12. Independence, extras, risks

- **Shared liquidity:** none found. Liquidity is the 9lives Vault plus whatever the one ~$1 buyer does. It is an independent venue, but with essentially no depth, so "independent" has little value.
- **rfqhub** (`https://rfqhub.9lives.so`, GraphQL; H): a separate request-for-quote auction hub for price-target bets (queries `balance(addr)`, `openAuctions`; mutations onramp/offramp/createAuction/cancel/submitBundleMakerServerSig). `openAuctions` returned `[]` on 2026-10-19 and the feature flag "feature enable rfqhub in navbar" is false. Its source repo is not public (404). Watch item only.
- **Operational:** status page shows a degraded `9lives.so` component and a 2026-09-09 incident (M). `features.json` reveals "admin features are enabled: true" and DPPM markets must be created by an admin.
- **Stability of the API:** the GraphQL endpoint is the app's internal API with no versioning or contract; fields (for example `isDpm` vs `isDppm`) are legacy-laden. Use the schema fixture as the pin.

---

## 13. Adapter spec (if built despite the skip)

- Discover: poll `campaigns(pageSize:5)` every ~30 s; key = `campaign.identifier`; skip when `settlement != "CONTRACT"` or `priceMetadata == null`.
- Normalise: event = BTC/USD price over [starting, ending], strike = `priceTargetForUp`; yes token = outcome whose name starts "BTC will end up above"; `p_yes = r_no/(r_yes + r_no)` from `shares[]` (treat `[]` as 0.5/0.5 only if `investmentAmounts` is empty).
- Executable price: compute with the quote formula and 1.7% fee; max sensible size < $1.
- Resolution: `winner` (outcome id); cross-check `getFinalPrice`.
- Do not model a sell leg. Expect no fills after `ending - 60 s`.

---

## NOT FOUND (searched)

- Official API documentation, rate limits, API versioning (README, docs.9lives.so, headers).
- Terms of service, jurisdiction restrictions, automation/bot policy (site HTML, JS, docs, repo tree; privacy PDF unreadable).
- Upstream source for the oracle price table (resolvers, websocket README).
- Whether the oracle address is an EOA or contract; Vault/TVL balances (explorer behind Cloudflare challenge; no JSON-RPC POST by rule).
- Third-party volume/TVL tracking (DefiLlama list only; WebSearch budget exhausted).
- Market-wide trade feed or order book (not in schema).
- Settlement latency after `ending` (not exposed).

## Open questions

1. Who makes the ~$1 buy in each market (operator seed bot vs real user)? Needs an address-level activity read or explorer access.
2. Is the oracle a multisig/contract, and what feed does it use?
3. Will `xyz*`/stock/commodity markets, hourly/5-min periods or rfqhub go live?
4. Does PayBox's transaction simulator handle Stylus pool calls on Arbitrum?
5. Was the short-term AMM in the OpenZeppelin audit scope?

## Sources

- Repo and README: https://github.com/fluidity-money/9lives.so (README.md, CHANGELOG.md, SECURITY.md, INFRA_MARKETS.md, audits/README.md, src/trading_amm.rs, src/trading_private.rs, src/contract_trading_mint.rs, src/fees.rs, cmd/graphql.ethereum/main.go and graph/schema.graphqls and graph/schema.resolvers.go, cmd/websocket.database/main.go and README.md, agent-skills/*.md, create-price-market.rc, web/src/config/{app,chains,clientEnv,contracts}.ts, web/src/config/abi/trading.ts, web/next.config.mjs), read with `gh api -H "Accept: application/vnd.github.raw"` on 2026-10-19 (H)
- Site: https://www.9lives.so/campaign/btc/15mins and its `_next/static` JS chunks, fetched 2026-10-19 (H; GraphQL, RFQ hub, websocket and feature URLs taken from the bundle)
- GraphQL: https://9lives-arb.stellate.sh (GET queries, 2026-10-19) (H)
- Feature flags: https://features.9lives.so/features.json (H)
- RFQ hub: https://rfqhub.9lives.so (GET queries, 2026-10-19) (H)
- Docs: https://docs.9lives.so (WebFetch summary, M); status: https://status.9lives.so (WebFetch summary, M); privacy: https://static.9lives.so/privacy.pdf (metadata only)
- Spot cross-check: https://api.coinbase.com/v2/prices/BTC-USD/spot (82559.535 at ~02:57 UTC) (H)
- DefiLlama protocol list https://api.llama.fi/protocols (no 9lives entry) (H)
- PayBox chain catalog: `docs/research/06-paybox-platform.md` (earlier research in this repo)

## Fixtures

All in `docs/research/fixtures/9lives/` (suffix `_2026-10-19`):
`graphql_campaigns_live_default`, `graphql_campaignById_live`, `graphql_campaignPriceEvents_live` (empty: market had just opened), `graphql_campaigns_ended_page0_size3`, `graphql_campaigns_ended_page0_size100_slim`, `graphql_assets_24h_volume`, `graphql_getFinalPrice_BTC_1792377900`, `graphql_campaigns_category_Sports_empty`, `graphql_schema_from_repo_cmd_graphql.ethereum` (.graphqls), `features_json`, `rfqhub_openAuctions_empty`, `rfqhub_introspection_type_names`, `volume_by_month_all_ended_markets`.
