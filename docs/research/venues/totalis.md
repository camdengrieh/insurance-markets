# Totalis (totalis.trade) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 01:55-02:05 UTC). READ-ONLY: doc reads, `gh api` metadata/file reads, public unauthenticated GETs to documented API hosts. No account, key, wallet, signature, POST/PUT/DELETE, or payment. No PayBox tools used (PayBox facts below are quoted from `docs/research/06-paybox-platform.md`, marked M).

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

## 1. Verdict

- **Live: yes** (H). Docs sitemap `lastmod` 2026-10-19T01:44Z, `GET https://api.totalis.trade/health` returned `status: ok` (2026-10-19T01:57Z), the HyperEVM API returned live book data the same minute.
- **What it is** (H): a **synthetic RFQ derivatives layer** (operator: UCALLEDIT, Inc., Y Combinator-backed, SF) that sits on top of other venues' markets. It is not an order-book venue and does not route to Kalshi/Polymarket. Docs: "Totalis uses prediction market platforms as data and resolution layers, not as execution venues ... The position is synthetic: it exists only inside Totalis". Two separate products with separate APIs/keys:
  1. **Solana**: 1-5 leg "parlays" referencing **Kalshi + Polymarket** markets, USDC, settled in Solana vaults. Live since ~2026-05-25 (M, press).
  2. **Hyperliquid / HyperEVM (chain 999)**: singles or up to 50-leg "Combos" on **Hyperliquid HIP-4 outcome markets**, USDC, EIP-712 signed. App `hip4.totalis.trade`. Contracts self-report `audit_status: PRE_AUDIT`.
- **Arbitrage role: NOT an independent leg.** Pricing and resolution are derived from the venues it references (see section 11). Every position pays a 1% (Solana) / 1.5% (HyperEVM) up-front taker fee plus a profit fee, so a single-outcome Totalis position is worse than taking the same outcome on the underlying venue unless a maker quotes inside the underlying spread (not evidenced).
- **Adapter priority: P2 (signal-only).** Not worth a trade adapter. Worth at most a read-only adapter for (a) the free normalised Kalshi+Polymarket catalogue and (b) optionally RFQ quotes as a joint-probability signal for multi-leg combos.

## 2. Kind and market model

| Item | Finding | Tag |
| --- | --- | --- |
| Kind | Derivatives / parlay layer using RFQ (request-for-quote); market makers (MMs) quote payout odds; counterparty is the winning MM, backed by MM collateral in an on-chain vault | H |
| Not | Not CLOB, not AMM, not parimutuel | H |
| Outcome form | Binary legs only: `market_ticker` + `side` `yes`/`no` + `venue`. Parlay pays only if every leg wins. Categorical/scalar not offered as Totalis legs today; blog says scalar legs would be a future HIP-4 capability ("today's parlay legs all resolve to yes or no") | H (docs FAQ, blog 2026-08-18) |
| Tokenisation | No tradable outcome tokens. A position is a vault record (Solana: program-held vault + position id; HyperEVM: `position_id` = the accepted `quote_id`). Positions are not transferable on a secondary market; early exit is an MM auction ("cashout") | H |
| Solana leg limits | 1-5 legs, 1-1000 USDC per bet, payout odds >= 1.0001, legs with overlapping `exclusion_keys` rejected (correlated legs not allowed) | H |
| HyperEVM leg limits | 1-50 legs, strictly ascending `outcome_id`, net stake >= 0.9 USDC, max payout 1,000,000 USDC | H |
| Market eligibility (Solana) | Recurring markets with reliable underlying liquidity that settle within 15 days; 8 categories (politics, sports, crypto, finance, economics, entertainment, weather, tech) | H (FAQ) |
| Market eligibility (HyperEVM) | Per-market `combo.state` OPEN/CLOSED with `reason: OUTSIDE_WINDOW` and `opens_at`. First 200 of the catalogue on 2026-10-19: 119 OPEN, 81 CLOSED | H (live GET) |

Price quoting is per request: creating a quote request "holds nothing"; MMs stream-price it within seconds (quote validity 5-60 s). There is **no standing public book** of Totalis parlay prices, so there is nothing to scan passively.

## 3. Chains and collateral

| | Solana product | HyperEVM product |
| --- | --- | --- |
| Chain | Solana mainnet | HyperEVM, chain id 999 (testnet 998 staging) |
| Collateral | Native Solana USDC, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | USDC on HyperEVM `0xb88339cb7199b77e23db6e890353e22632ba630f` (EIP-3009 `receiveWithAuthorization`, domain "USDC" v2) |
| Vault | Program `58LfwWEnq1aCG2R18voCBF7zzJNtVSWquQBvdaaDFhme` | Vault `0x0cbffe7b40b64d5fd04f1288f4c9fe0fc50e2f83` |
| Gas | Sponsored by Totalis; wallet needs no SOL (one rent exception on first withdrawal to a new address, charged in USDC, about 0.29 USDC on 2026-09-11) | Totalis pays gas for takers; makers pay their own in HYPE |
| Custody | "Non-custodial" vault, but signing is **delegated**: wallet is a Privy embedded wallet, key in a TEE, user grants Totalis permission to sign trades; withdrawals via API also go through that delegation | Wallet signs every bet/cash-out/withdraw itself (EIP-712); Totalis never holds the key |

Sources: H for all rows (docs.totalis.trade/solana/limits-and-fees, vault-architecture, funding; /hyperliquid/authentication, limits-and-fees; live `GET /v1/deployment`).

## 4. Read API

### 4a. Solana API (`https://api.totalis.trade`)

- Docs: https://docs.totalis.trade/solana/api-reference/introduction ; OpenAPI "Totalis RFQ API" v2.1.0 at https://docs.totalis.trade/api-reference/openapi.json (26 operations; covers markets, account, funds, parlays, webhooks, api-keys but NOT the quote-service/SSE or market-maker routes, which exist only as doc pages) ; index https://docs.totalis.trade/llms.txt. [H]
- **Official, partly public.** Public (no key, no account): `GET /markets` (events grouped, with nested markets), `GET /v1/markets/list` (flat, paginated, "for market makers and partners syncing the tradeable universe"), `GET /markets/{ticker}`. Everything else needs a key. [H]
- Auth for the rest: `X-API-Key: api_live_...` (scoped; created in the app by a logged-in user; no public test environment) or Privy JWT. [H]
- Public-endpoint fields (H, live): `ticker`, `event_ticker`, `venue` (`kalshi`|`polymarket`), `category`, `subcategory`, `status`, `yes_bid`, `yes_ask`, `no_bid`, `no_ask`, `last_price` (decimal probability 0-1), `volume`, `volume_24h`, `open_interest` (units NOT documented; underlying-venue stats, not Totalis stats), `venue_url`, `open_time`, `close_time`, `expiration_time`, `exclusion_keys`, `synced_at`. Kalshi ticker or Polymarket `condition_id` are the identifiers.
- `exclusion_keys` (H, live): intra-venue grouping tags (`fam:kalshi:...`, `kp:...`, `krankpair:...`, `grp:N`). In 500 sampled markets **no key was shared across Kalshi and Polymarket**, so it is not a cross-venue link, only a "these markets are mutually related on one venue" hint.
- Catalogue size 2026-10-19: `meta.total` = 3,227 active markets (flat list), `total_events` = 516 (grouped). First 500 rows: 296 Kalshi / 204 Polymarket; categories Sports 237, Crypto 108, Politics 53, Weather 43, Economics 39, Tech 13, Finance 5, Entertainment 2. [H]
- Private pre-trade price discovery: `POST /v1/quote-requests` then SSE `GET /v1/quote-requests/{id}/stream` -> `{book_seq, version, best_quote:{id, payout_odds, user_cost, total_payout, mm_cost, valid_until}}`. [H docs]
- Post-trade: WebSocket (first message `{"type":"auth","api_key":...}`), HMAC-signed webhooks, REST reads (`/v1/portfolio`, `/v1/rfqs`, `/v1/rfqs/{id}`, `/v1/pnl`, `/v1/vault`, `/v1/wallet`). [H docs]
- **Rate limits (H docs):** public market reads 100/min per IP; authenticated 300/min per account (100/min per IP without a valid key); quote service 300/min per IP; `POST /v1/wallet/withdraw` 5/min; vault deposit/withdraw 10/min each; submit-tx 10/min. Headers `X-RateLimit-Limit/Remaining/Reset`; `429` carries `Retry-After`. Live response headers confirmed `x-ratelimit-limit: 100` on `/markets`.
- Caching: `/markets` returns `cache-control: public, max-age=60, stale-while-revalidate=300` (H live) so prices are up to ~60 s old by design.
- Changelog starts 2026-07-18; last entry 2026-09-11 (H). API is still moving (renames, retirements), so pin to the OpenAPI version.

### 4b. HyperEVM API (`https://hip4-api.totalis.trade`, staging `https://hip4-api-staging.totalis.trade`)

- Docs: https://docs.totalis.trade/hyperliquid/api-reference/introduction ; OpenAPI "Totalis Hyperliquid API" 160.0.0-quote-lease at https://docs.totalis.trade/hyperliquid/openapi.json (about 1 MB, 59 operations). [H]
- **Public (no key):** `GET /v1/markets`, `GET /v1/markets/{outcome_id}` (with parent `question`), `GET /v1/markets/{outcome_id}/history` (up to 24 h of 1-minute prices), `GET /v1/discovery` (questions with nested markets), `GET /v1/deployment`. [H docs + live GET of markets, markets/{id}, discovery, deployment]
- Market item (H live): `outcome_id`, `native_question_id`, `title`, `state`, `category`, `subcategory`, `deployer` (`Outcome`, `trade[XYZ]`, `Skew` in sample), `combo{state,reason,opens_at}`, `sides[YES|NO]{coin "#NNNN0/1", reference{best_bid, best_ask, last_trade, mark, chance, scale 1e18, freshness}}`. Reference prices are **Hyperliquid HIP-4 book mid**, i.e. a mirror of the native venue (see `hyperliquid-hip-4-outcomes-native.md`), not a Totalis price.
- Catalogue 2026-10-19: first 200 rows: Sports 84, Finance 63, Crypto 44, Economics 6, Esports 3; deployers Outcome 86, trade[XYZ] 62, Skew 52; `has_more: true`. [H]
- Public WebSocket `wss://hip4-api.totalis.trade/v1/market-stream` (subprotocol `totalis.market.v2`) needs an allowed browser `Origin`; docs tell server integrations to use REST and "price from their own Hyperliquid feed". [H docs]
- Account/maker WebSocket `wss://hip4-api.totalis.trade/v1/stream` (subprotocol `totalis.realtime.v2`), Bearer key. [H docs]
- Auth for everything else: `Authorization: Bearer ttk_v1_prd_...`; the key is **issued only after the account's wallet signs a Sign-In-with-Ethereum message** (app UI, or SDK from a wallet session). [H docs]
- Rate limits (H docs): create RFQ + cash-out 30/min/account shared; accept 30/min; create/cancel quote 3,600/min each; position reads 120/min; anonymous reads best effort, `429`/`503` with `Retry-After`. Request body 64 KiB.
- SDK `@totalistrading/hip4-client` 0.60.1 is **private** (GitHub Packages, access by emailing the founders). Official public GitHub org `totalistrading` has only `docs` and a fork of `hyperliquid-dex/order_book_server` (M: they run a Hyperliquid node and local l2/l4 book feed). No contracts or backend source published. [H gh api]

## 5. Trade path

### Solana
1. A human creates the account in the app (Privy login) [H].
2. Human grants a one-time **"Enable trading"** delegation in the app; "The REST API cannot grant it" [H].
3. Human creates a scoped API key in the app (`trading:write`, optionally `funds:deposit`; high-risk scopes `funds:withdraw`, `tx:sign`, `keys:manage` exist) [H].
4. Bot: `POST /v1/quote-requests` -> SSE best_quote -> `POST /v1/quote-requests/{id}/commit` (with `expected_version`, `displayed_quote_id`, `displayed_quote_book_seq`, `min_payout_odds_seen`) -> maker confirms within 5-8 s -> stake and MM collateral lock in one atomic Solana tx. **No user-side signature per order**; Totalis signs in the TEE. [H docs]
5. Early exit: cashout auction (~10 s, fixed), then commit. Settlement is automatic. [H docs]

### HyperEVM
1. Account wallet signs a SIWE challenge to mint a `ttk_` API key (or the app-embedded wallet does it in the UI). [H]
2. `POST /v1/rfqs` (legs, stake) -> quotes arrive on the account WebSocket -> sign EIP-712 `TakerAccept` with the account wallet -> `POST /v1/quotes/{quote_id}/accept` (+ optional USDC `ReceiveWithAuthorization` funding signature) -> maker confirms within 2 s -> Totalis relays the tx and pays gas. [H]
3. EIP-712 domains: `{name:"TotalisParlay", version:"1", chainId:999, verifyingContract: vault}` for `Quote/TakerAccept/SellBack/CashoutTransfer/Exit`; USDC domain for `ReceiveWithAuthorization/TransferWithAuthorization`; Hyperliquid `SendAsset` for the HyperCore bridge. EOA and ERC-1271 signatures accepted. [H]

## 6. Can a PayBox EVM/Solana wallet trade it?

**Verdict: partial (funding only on Solana; HyperEVM blocked by onboarding, not by signing).**

- **Solana:** the trading wallet is a **Totalis-owned Privy embedded wallet** (`GET /v1/wallet` returns its address). A PayBox Solana wallet cannot sign Totalis orders; it can only **fund** the Totalis wallet by an SPL USDC transfer (`request_transfer`/proposal) and receive withdrawals (`POST /v1/wallet/withdraw` needs a key with `funds:withdraw`). Transaction proposals never touch Totalis's program. [H docs for Totalis side; M for PayBox side]
- **HyperEVM:** technically the best fit. Everything is EIP-712 / EIP-3009 / personal_sign and PayBox's chain catalog lists Hyperliquid (999) with `request_wallet_sign` supporting `typedData` and `message` (M, `docs/research/06-paybox-platform.md`, "Hyperliquid (999)" in live `discover_tokens`, 2026-10-19). Totalis pays gas, so the wallet needs no HYPE. **But** an external wallet becomes a Totalis account only via (a) the app's own embedded wallet (key export needed to sign from code - incompatible with a non-custodial PayBox wallet) or (b) **partner admission**: a partner with a server key (`tpk_`, issued by email, "no self-serve signup") must call `POST /v1/partner/wallet-admissions` for that wallet. So a PayBox wallet cannot self-onboard. [H docs for Totalis side]
- Funding USDC to HyperEVM (token `0xb883...630f`) from PayBox: whether PayBox swap/bridge routes reach HyperEVM USDC is NOT FOUND/unverified here (needs a PayBox readiness check; not run, it is outside this task's read-only rule).
- Prompt-injection note: signing EIP-712 on behalf of an agent is exactly where PayBox's `request_wallet_sign` has no `value_cents` policy field (M, same PayBox note). If a trade path were ever built, the stake must be bound in plugin code, not trusted from market text.

## 7. Fees (who pays)

| Fee | Solana | HyperEVM | Tag |
| --- | --- | --- | --- |
| Taker fee, on gross stake, paid at entry, refunded if a leg voids | 1% (100 bps): `taker_fee = floor(bet_micro*100/10000)`; odds apply to the net stake `bet - taker_fee` | `taker_fee_bps` = **150** (live `GET /v1/deployment` 2026-10-19) | H |
| Profit fee, on the winning side's profit, at settlement or closing cashout | 1% | `fee_bps` = **100**; also on `SELL_BACK` price above net stake (`floor((price-net_stake)*fee_bps/10000)`); none on a transfer to another maker | H |
| Worked example (H docs) | 25 USDC at 4.0 odds: fee 0.25, net stake 24.75, payout 99, profit 74.25, profit fee 0.7425, receive 98.2575 | n/a | H |
| Gas | sponsored | sponsored for takers | H |
| Spread | implicit in MM odds, not published | same | H |
| Referral | 20% of trading fees to referrer; HyperEVM up to 53% of Combo fees | | H docs |

Fee rate is stamped on the position at creation. Early cashout bid is one all-in price with the profit fee already deducted.

## 8. Resolution and dispute risk

- Legs resolve to the **underlying venue's published outcome** (Kalshi market result, Polymarket market result, or Hyperliquid HyperCore result for HIP-4). Settlement is automatic once the deciding leg resolves (HyperEVM: starts within about 10 s of resolving on HyperCore). Any leg that loses settles the parlay early as a loss. [H docs]
- Voided/cancelled/delisted underlying market: whole position cancelled, collateral released, taker fee refunded. [H docs FAQ]
- **Dispute risk compounds.** Polymarket legs inherit Polymarket's resolution (UMA) risk and Kalshi legs inherit Kalshi determinations; Totalis ToS adds that it "may rely conclusively on an Underlying Venue's published ... outcomes", "may determine, in its sole discretion, how to map or translate" them, and may "suspend, delay, reject, cancel, void, reprice, unwind, reverse, partially settle or otherwise modify any RFQ, quote, leg, position, payout or settlement". Totalis determinations are "final and binding"; disputes go to binding AAA arbitration with class-action waiver. [H, ToS]
- HyperEVM contracts report `audit_status: PRE_AUDIT` (H live). Solana program audit status: NOT FOUND (searched docs index, FAQ, vault-architecture, About).

## 9. Geo / ToS / automation

- **Not available to U.S. persons** (H: docs intro, FAQ, ToS). ToS defines U.S. Person broadly (resident, citizen, physically located, US entity, or anyone acting for such a person's benefit) and bars VPN/proxy/location-masking as "a material breach". Totalis "intends to pursue" CFTC registrations later. The project owner's eligibility is an open question for them, not decided here.
- Automation is allowed by design ("Everything the app does, the API does"), but the ToS says automation is permitted "only to the extent permitted by the Service", APIs are "as is", and Totalis may throttle/revoke credentials at any time. Prohibited conduct includes "data mining, robots, scraping, or similar data gathering or extraction methods" and "unauthorized scraping or crawling" - read this as: use the documented endpoints at the documented rate limits, do not scrape the web app. [H, ToS]
- Account keys non-transferable; you may not make API key or wallet access available to third parties. Relevant if PayBox agents act for end users. [H, ToS]
- Market makers accept "API, connectivity, performance, quoting, monitoring, collateral, throttling" requirements; Totalis may reject or reorder quotes. [H, ToS]

## 10. Liquidity

| Metric | Value | Tag |
| --- | --- | --- |
| Totalis cumulative volume / OI / TVL | **NOT FOUND** (searched: docs index and all linked pages, About, blog index, api.totalis.trade public endpoints documented in OpenAPI, DefiLlama `api.llama.fi/protocol/totalis` -> "Protocol not found", press coverage) | - |
| Funding | $500K seed, YC, paid in USDC, announced about 2026-04-13 | M (cryptobriefing 2026-05-25, KuCoin flash 2026-05-26; blog headline "Totalis Takes $500K in Stablecoins From YC") |
| Yield claim | "3.1% on locked capital" (press) - source mechanism not documented | L |
| Public volume leaderboard | SDK 0.50.0 notes `getVolumeLeaderboard` requires a signed-in session | H docs (existence only) |
| Pricing liquidity available | Depends entirely on MMs responding to RFQs; MM names not published | H (absence) |
| Underlying liquidity mirrored in the feed | Kalshi/Polymarket volume and OI fields in `/markets` belong to those venues (units undocumented) - do not count as Totalis liquidity | H |

Interpretation: no evidence Totalis has meaningful volume; treat as thin until a source says otherwise. (The Kalshi-vs-Totalis blog cites Kalshi Combos' "roughly half of Kalshi's total volume during the World Cup" via Sacra, that is Kalshi's figure, not Totalis's.)

## 11. Event categories and overlap (where arbitrage might exist)

- Solana: Sports (largest, NFL/NBA/soccer etc.), Crypto price (BTC/ETH thresholds), Politics, Weather, Economics/macro (Fed rates), Tech, Finance, Entertainment. All are **mirrors of Kalshi/Polymarket markets**, so each overlaps whatever those venues list (which the aggregator already covers directly).
- HyperEVM: Sports (NBA/NFL/UCL/EPL...), Finance (stocks, indices, commodities), Crypto (BTC/ETH/HYPE), Economics (rates), Esports. All are **HIP-4 outcomes** from deployers `Outcome`, `trade[XYZ]`, `Skew`.
- Only unique edge type: **multi-leg joint pricing** (compare an MM's quoted parlay odds against the product of leg probabilities hedged on the underlying venues; correlated legs are blocked by `exclusion_keys`, which removes the easiest mispricing). Edge is net of 1-1.5% entry fee + 1% profit fee and 5-90 s quote windows. Not evidenced to exist.

## 12. Shared liquidity (is it an independent leg?)

**No.**
- Solana: "Your parlay does not route to any underlying platform", but prices come from Kalshi/Polymarket data and resolution comes from them; hedging by MMs is NOT documented (the collateral blog explicitly does not discuss hedging). Treat as the same event risk as the referenced venues; a Totalis position plus an offsetting Kalshi/Polymarket position is a hedge, not an arbitrage, because Totalis charges more than the underlying spread.
- HyperEVM: reference prices are the HyperCore HIP-4 order-book mid; settlement is the HyperCore result. Duplicate of `hyperliquid-hip-4-outcomes-native` for event coverage.

## 13. Adapter priority: **P2**

Reasons: good, documented API (OpenAPI, SSE, WS, webhooks) but (1) no independent liquidity, (2) parlay/RFQ only, no standing book to scan, (3) US-person exclusion, (4) trade path needs human app onboarding and delegated TEE signing (Solana) or partner admission (HyperEVM), (5) no volume evidence, (6) HyperEVM contract PRE_AUDIT, (7) fees 2-2.5% round trip vs underlying. Suggested minimal use: optional read-only "Totalis catalogue" source for normalising Kalshi/Polymarket market metadata and category tags; do not build a trade adapter.

## 14. Fixtures saved (`docs/research/fixtures/totalis/`)

| File | Source request (2026-10-19) | Size |
| --- | --- | --- |
| `solana_GET_markets_limit3.json` | `GET https://api.totalis.trade/markets?limit=3` (3 events, compact JSON as served) | 40.9 KB |
| `solana_GET_v1_markets_list_limit2.json` | `GET https://api.totalis.trade/v1/markets/list?limit=2` | 5.3 KB |
| `hyperliquid_GET_v1_markets_limit3.json` | `GET https://hip4-api.totalis.trade/v1/markets?limit=3` | 5.9 KB |
| `hyperliquid_GET_v1_deployment.json` | `GET https://hip4-api.totalis.trade/v1/deployment` | 0.5 KB |

No credentials sent; User-Agent `insurance-markets-research/0.1`. Responses contain no personal data.

## 15. Not found / open questions

- NOT FOUND: Totalis own volume, OI, TVL, user count (searched: docs, About, blogs, DefiLlama, press). A direct on-chain read of the Solana vault program or the HyperEVM vault USDC balance would answer TVL but needs JSON-RPC POSTs, which this task forbids; a public explorer GET attempt redirected to an unrelated domain and was dropped.
- NOT FOUND: MM identities, whether MMs hedge on Kalshi/Polymarket/HIP-4, quote fill rates, typical spread vs underlying.
- NOT FOUND: Solana vault program audit report or source (searched docs index, FAQ, vault-architecture; GitHub org has no contract repo).
- NOT FOUND: HyperEVM mainnet launch date (blog 2026-08-18 says permissionless HIP-4 deployment is live; Totalis GitHub fork created 2026-08-26).
- OPEN: could a partner admit a PayBox wallet at all (needs a founders conversation)? Is the project owner a "U.S. Person" under the ToS definition?
- OPEN: units of Kalshi `volume`/`open_interest` in the Totalis feed (contracts vs cents) are undocumented.
- Press on yield (3.1%) and Ramp custody (one KuCoin flash item) are single-source secondary claims, L.

## 16. Suspicious content

None found. Docs pages are Mintlify-hosted and contain no agent-directed instructions. Two benign agent-oriented hints exist (`llms.txt` index; "Documentation Index: fetch the complete documentation index at ..." banner on every page) - informational only, not followed beyond reading public docs. The third-party GitHub profile `api-evangelist/totalis` is an independent profile ("not our API"), used only as a lead.

## Sources

Primary (H):
- https://totalis.trade , https://www.totalis.trade/about , https://www.totalis.trade/sitemap.xml (blog slugs and lastmods), https://www.totalis.trade/robots.txt
- https://docs.totalis.trade/llms.txt and pages (.md form): /solana/{index,quickstart,authentication,limits-and-fees,faq,changelog,api-reference/introduction,guides/lifecycle,guides/vault-architecture,guides/funding,guides/realtime,guides/quote-requests} ; /hyperliquid/{index,quickstart,authentication,limits-and-fees,sdk,guides/trading,build/overview,build/partner-frontend,api-reference/introduction,api-reference/websocket/market-data}
- https://docs.totalis.trade/terms-of-service.md
- OpenAPI: https://docs.totalis.trade/api-reference/openapi.json ; https://docs.totalis.trade/hyperliquid/openapi.json
- Live GETs: https://api.totalis.trade/markets , /v1/markets/list , /health ; https://hip4-api.totalis.trade/v1/markets , /v1/markets/{id} , /v1/discovery , /v1/deployment
- Totalis blog posts (company-authored, self-reported): https://www.totalis.trade/blogs/kalshi-combos-vs-totalis-parlays (2026-08-27) , /hip4-scalar-markets-bounded-options (2026-08-18) , /parlay-collateral-efficiency-ilp
- GitHub (gh api): totalistrading org (`docs`, fork of `hyperliquid-dex/order_book_server`)

Secondary (M/L):
- https://cryptobriefing.com/totalis-prediction-market-parlays-solana/ (2026-05-25)
- https://www.kucoin.com/news/flash/prediction-market-derivatives-layer-totalis-launches-expands-to-structured-products (2026-05-26)
- https://github.com/api-evangelist/totalis (third-party profile, not endorsed)
- https://madeonsol.com/tools/totalis (discovery hint only, not re-fetched)
- `docs/research/06-paybox-platform.md` (internal, for PayBox chain catalog and `request_wallet_sign` semantics)
- `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (internal, HIP-4 native venue)

Tool note: WebSearch budget was exhausted mid-task (one extended search succeeded; two later ones were refused), so liquidity/volume lookups relied on docs, press fetches and DefiLlama only.
