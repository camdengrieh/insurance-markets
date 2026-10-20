# PredMart (predmart.com) - venue spec

Researched 2026-10-19. Read-only: public pages, docs pages, site JS bundle (static text read only, not executed), DefiLlama keyless API, Sourcify public API, and a handful of unauthenticated GETs to the site's own API host `synth-api.predmart.com` (see Read API for why). No accounts, no wallet, no POST, no signing, no PayBox tools.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- PredMart is a **leveraged synthetic overlay on Polymarket**, not a market venue. Positions are USDC-margined YES/NO exposure against a single LP pool on Base. The "Mark" price is Polymarket's live CLOB best bid, and resolution is whatever Polymarket resolves to. It has no price discovery, no order book and no outcome tokens of its own. H (docs).
- It is **not an independent arbitrage leg**: every price and outcome it shows is derived from Polymarket. A "PredMart vs Polymarket" gap can only be fees, the 30 s oracle lag or the 5% slippage guard, not a market inefficiency. Verified: for the sampled market the `prices` value equals Polymarket best bid, with `best_asks` 0.001 above it. H (API sample).
- It is tiny: LP pool about 10.2K USD, open interest about 3.2K USD, hard cap 2,000 USD notional per market and 11% of pool per market (about 1.1K USD). H (API, 2026-10-19).
- It does have a real, unauthenticated JSON API and an EIP-712 intent-signing trade path, so it is technically integrable. It just is not worth integrating for arbitrage. The only conceivable use is **execution of leveraged Polymarket exposure**, which is out of scope for the aggregator and is geo-restricted (US, UK, France, etc.).

## Liveness (still live in 2026?)

- **Live, H.** `https://predmart.com` returns 200; sitemap `lastmod` 2026-10-11 for blog posts (https://predmart.com/sitemap.xml); blog article dated 2026-10-11 (https://predmart.com/blog/polymarket-margin-trading-fcm-filing); `GET /vault/stats` returns `"paused": false` with non-zero margin held (1,329.74 USD) and open interest (3,235.35 USD) on 2026-10-19. I did not observe an actual trade or an on-chain transaction; "live" rests on the API state plus site updates.
- **Product pivot (important, H):** the discovery hint (DefiLlama, listed 2026-02) is **stale**. Three generations of text coexist:
  1. Legacy: **Polygon borrow/lend** against Polymarket CTF shares (ERC-1155 collateral, up to 80% LTV, 85% liquidation threshold, utilisation-based interest around 10% APR, ERC-4626 lender vault, Hashlock audit, live since March 2026 per Hashlock). Still described by the homepage meta/JSON-LD ("up to 5x", "borrow USDC against shares"), `/about`, `/tos` (Last Updated July 4th 2026), `/docs/borrowing`, `/docs/lending`, and DefiLlama.
  2. Current main product: **"Synthetic Vault" on Base** (docs overview, getting-started, FAQ, smart-contract, fees, security; API constants; blog dated 2026-10-11 calls it "synthetic leverage"). Max leverage **4x**, not 5x. Contract verified on Sourcify 2026-07-10.
  3. Docs FAQ states plainly: "You never hold actual prediction market shares; you hold a position that tracks the outcome."
- DefiLlama (https://api.llama.fi/protocol/predmart, H) tracks **only the Polygon lending pool**: TVL 6,250.62 USD at 2026-10-18, borrowed 0, Base 0. Its chain list says Base and Polygon but the Base TVL series is a flat placeholder (6,000 then 0). The Base synthetic vault (10.2K USD) is invisible to DefiLlama. DefiLlama shows no volume or fees for it.

## Kind and market model

- Kind: **leverage / margin layer (synthetic perp-like positions) on top of Polymarket**. H.
- Counterparty: a shared USDC LP pool. "A shared USDC pool is the only counterparty. PredMart does not match traders against each other or hedge elsewhere." (https://predmart.com/docs). So trades do not touch Polymarket's order book. H.
- Outcomes: binary only per position (back YES or NO of one Polymarket outcome market). Multi-outcome Polymarket events appear as one binary market per outcome (`group_id`, `position_in_group`, `neg_risk: true`). Scalar not supported. H (API sample).
- Pricing: **Mark = best bid in Polymarket's CLOB** for the token being traded, used to open, close, mark and liquidate. Refresh about 30 s (docs overview), operator-signed, max age 30 s, 5% slippage guard. H.
- Outcome "tokenisation": none. A position is a record in the vault contract (`positions`, `getOpenPositionId`, events `SyntheticOpened/Increased/Closed/Liquidated/Settled`). Not transferable shares. M (ABI function names from bundle, contract source not read).
- Payout: winning shares pay 1 USD, losing 0; position PnL = shares x (exit - entry). Example in docs: 200 USD margin, 2x, YES at 0.40 gives 1,000 shares (https://predmart.com/docs/how-positions-work). H.
- Per-market identifiers are Polymarket's: `id` is a 0x + 64-hex value (Polymarket conditionId format), `yes_token_id`/`no_token_id` are the 77-digit decimal Polymarket CLOB token ids. This makes cross-linking to the Polymarket adapter trivial. M (format match; Polymarket side not re-verified here).

## Chains and collateral

- Current: **Base (chain 8453)**, collateral/margin **USDC** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals). H (docs smart-contract page, `GET /vault/constants`).
- Vault: `0xadFe4055f7Bc231287bED441fD213565D1BC06D2`, an **ERC1967 proxy** (UUPS-style: `upgradeToAndCall`, `proposeUpgrade`) pointing at implementation `0x289e8aca038b733498aD238aB4E6CF35dF8eaeb2` named `SyntheticVault`; Sourcify runtime match, verified 2026-07-10, compiled solc 0.8.22; deployed in Base block 48459315. H (https://sourcify.dev/server/v2/contract/8453/0xadFe4055f7Bc231287bED441fD213565D1BC06D2, fixture saved). Deployment date is later than ~June 2026 by block number, M (not converted via RPC).
- LP side: the same vault is an ERC-4626-style share vault (`deposit/mint/withdraw/redeem/convertToAssets`) for LPs. M (bundle ABI) / H (docs "Vault Shares").
- Legacy Polygon lending contracts: address NOT FOUND in docs (searched: smart-contract, lending, borrowing pages). Not pursued.
- Gas: users need a little ETH on Base for the one-time USDC approval; trade authorisation is a signature and the relayer submits the transaction. H (docs getting-started), M (relayer detail from bundle).

## Read API

- **Official documented API: NOT FOUND** (searched: /docs and all 15 doc pages, /llms.txt, /sitemap.xml, robots.txt, site footer, GitHub org name search via web search). `exists = unofficial-only`: an undocumented but first-party, unauthenticated REST API.
- Why I called it: the homepage HTML itself `<link rel="preload" as="fetch">`es `https://synth-api.predmart.com/markets/?limit=50&offset=0` and `/groups/` for every anonymous visitor, so it is the site's own public read host. I made 10 unauthenticated GETs total with the generic User-Agent, no cookies, no auth, none to the `/position`, `/auth`, `/admin`, `/users` or `/support` routes. Treat the API as internal; it can change without notice. H (page source) / M (stability).
- Base URL: `https://synth-api.predmart.com` (FastAPI-style JSON errors `{"detail": ...}`; nginx; `cache-control: public, max-age=60, stale-while-revalidate=30` on `/markets/`). H.
- Public read routes confirmed or seen in the bundle (bundle = M; GET-tested ones = H):
  - `GET /markets/?limit&offset&status&category&group_id` list (H, tested; limit 500 accepted, returned 762 KB and the page was full, so the catalogue exceeds 500 markets; no total count field seen).
  - `GET /markets/{id}`, `GET /groups/?limit&offset&category`, `GET /groups/{id}`, `GET /group-prices/{id}`, `GET /lookup/{slug}`, `GET /markets/series/{id}/siblings`, `GET /search`, `GET /categories/` (H tested), `GET /trending-tags`, `GET /leagues/catalog`. M.
  - `GET /vault/oracle-prices?token_ids=a,b` (H tested): returns `prices` (best bid used as Mark), `best_asks`, `tob_asks`, `errors`, `max_notional`, `cap_headroom` per token id. `GET /vault/oracle-price?market_id=` (M). `GET /vault/depth-status?token_ids=` (H tested): `status` (full/limited) and `effective_cap_usd`.
  - `GET /orders/book-aggregated/{a}/{b}?levels=50` (M; argument meaning not confirmed, presumably the Polymarket book proxied), `GET /price-history/{id}?interval=1D` (M).
  - `GET /vault/stats` (H tested), `GET /vault/constants` (H tested), `GET /synthetic/constants` (H tested), `GET /lending/constants`, `GET /lending/pool-stats` (M, legacy Polygon). `GET /vault/history?range=...` returns 404 `{"detail":"Not Found"}` for `range=1m` and `range=all` (H), so the bundle route is dead or needs another range value.
  - Per-wallet public reads (no token in the bundle code): `GET /position/user/{addr}?status_filter=open`, `/position/value/{addr}`, `/position/status/{id}`, `/vault/lp-position/{addr}`, `/users/{addr}/activity`. M, not called (they take a user's address).
- Auth for reads: none. Rate limits: NOT FOUND (no `X-RateLimit-*` headers seen on the one response whose headers I dumped). WebSocket: none found in the bundle (searched `new WebSocket`, `wss://`). Polling at 60 s matches the server cache.
- Sample shapes (fixtures in `docs/research/fixtures/predmart/`):
  - Market row (H): `id`, `slug`, `event_slug`, `title`, `category`, `status` ("ACTIVE"), `is_tradable`, `yes_token_id`, `no_token_id`, `yes_prob`/`no_prob` (strings, 4 dp), `last_yes_price`, `last_no_price`, `last_yes_bid`, `last_no_bid`, `tick_size`, `neg_risk`, `group_id`, `position_in_group`, `winning_side`, `event_end_date`, `volume_24h`, `volume_total`, `fee_rate_pct`, `yes_eligibility`/`no_eligibility` `{status, effective_cap_usd}`, `policy_class`, `tags`, plus `strike_price`, `underlying_symbol`, `price_feed`, `candle_minutes`, `feed_symbol` on crypto up/down rows.
  - `volume_24h`/`volume_total` look like **Polymarket-side** market volume (a 0.1%-probability Fed 50 bp market shows 1.2M 24 h volume, inconsistent with a 10K USD pool). M. `fee_rate_pct` meaning NOT FOUND (probably Polymarket fee rate; unverified).
  - `GET /vault/stats`: `{"total_assets":"10234728136","total_margin_held":"1329744648","net_exposure":"3235350642","open_interest":"3235350642","available_liquidity":"8904983488","holding_fee_rate":"1756194204134288","paused":false}` (USDC 6 dp; rate is a 1e18 WAD fraction). H.
- Third-party read: DefiLlama keyless API, legacy Polygon pool TVL only. H.
- On-chain read: Sourcify verified proxy; function and event names (`openPositionsBatch`, `getHealthFactor`, `getUnrealizedPnL`, `getUtilization`, `openInterestPerToken`, `netExposurePerToken`, `marketResolutions`, `totalAssets`) suggest per-token OI is readable on-chain with a free RPC. Not called (JSON-RPC is POST; I stayed within the no-POST rule). M.

## Trade path

- **Programmatic path exists but is undocumented**, reconstructed from the site bundle (static read; request bodies for `/auth/verify` not read). M.
  1. Login: `GET /auth/nonce?address=<wallet>` then the wallet signs a SIWE-style message (RainbowKit `createMessage`, chainId, nonce; `signMessage`) and `POST /auth/verify` returns a bearer token (stored in browser localStorage). Authenticated routes use `Authorization: Bearer <token>`.
  2. One-time ERC-20 `approve` of USDC to the vault on Base (docs). The only on-chain user transaction.
  3. `GET /position/open-auth?token_id&side&margin&leverage` (bearer) returns the intent fields plus operator-signed price data `{token_id, price, timestamp, max_size, signature}`.
  4. The wallet signs an **EIP-712 `Intent`**: domain `{name: "Synthetic Vault", version: "1.0.0", chainId: 8453, verifyingContract: 0xadFe...06D2}`; type `Intent(address owner, uint256 tokenId, uint256 margin, uint256 leverage, uint256 side(uint8), uint256 entryFee, uint256 deadline, uint256 nonce, uint256 maxEntryPrice)`. Side: YES = 0, NO = 1. H (literal in bundle).
  5. `POST /position/open` with `{intent, intent_signature, price_data_*}`; the operator/relayer submits `openPosition` on Base. M.
  - Close: `GET /position/close-auth?position_id` then EIP-712 `CloseAuth(bytes32 positionId, uint256 nonce, uint256 deadline, uint256 limitPrice)` same domain, then `POST /position/close`. H (types) / M (flow).
- Cancel/replace: not applicable (market-style fills at the signed Mark with a slippage guard `maxEntryPrice` / `limitPrice`; no resting orders). Nonce bitmap (`nonceBitmap`, `isNonceUsed`) gives replay protection. M.
- Units: margin in USDC 6 dp; leverage, fees and rates as 1e18 WAD. H (constants).
- Admin/relayer controls (ABI names, M): `pause`, `proposeOperator/executeOperator`, `proposeFees`, `proposeUpgrade/executeUpgrade`, `setCap`, `resolveMarket`, `liquidatePosition`, `withdrawTreasury`, timelock functions. See Resolution and risk.

## PayBox reachability

- **paybox_reachable = partial.** Everything needed is an EVM-wallet action on **Base**: one `approve` tx (transaction proposal) plus two off-chain signatures (SIWE message, EIP-712 `typedData`). The repo's PayBox notes (docs/research/06-paybox-platform.md) say `request_wallet_sign` handles `typedData` and `raw` with no domain/chain allowlist, and that a plugin cannot hold a signature request open, so the pattern would be plugin `prepare` -> agent `request_wallet_sign` -> plugin `submit`. Whether PayBox can sign a plain SIWE `personal_sign` message is NOT FOUND in those notes (only `typedData`/`raw` listed). Not tested here (no signing allowed).
- Blockers: undocumented API with a centralised operator and bearer-token session; ToS geo restrictions (below); tiny capacity; and the payoff is only leveraged Polymarket exposure, which the aggregator does not need.

## Fees

All H unless noted; sources: https://predmart.com/docs/fees, https://predmart.com/docs/protocol-constants, `GET /vault/constants` (fixture).

- **Entry fee**: docs say 0.1% of notional (margin x leverage), deducted from margin. The live API constants are **per category**: 0.2% for crypto (incl. 5 m/15 m/1 h), soccer (incl. draw/spread/totals/btts/corners/advance/first-to-score), mma, boxing; 0.3% weather; 0.1% politics, geopolitics, tennis, basketball, baseball, hockey, cricket, esports, tech, finance, culture, economics, tweets, other; default 0.1%; cap 10%. So the docs page is stale on this point.
- **Profit fee**: 10% of profit on winning closes/settlements, split 7% to LPs and 3% to the protocol.
- **Holding fee**: accrues on open positions, taken from margin at close. Curve (API, WAD): base 0, kink at 90% utilisation, 0.005 at the kink, max 1.2 at 100%. Current `holding_fee_rate` 0.001756 equals 0.005 x (OI/total_assets 0.3161)/0.9, so the curve is linear below the kink. **Time unit (per hour/day/year) NOT FOUND** (docs: "does not give the rate"). If per day this is about 0.18% of notional per day, which would dominate any arbitrage edge; unverified.
- **Liquidation**: at margin ratio <= 20% of position value; the whole remaining margin is lost; the pool keeps it minus a 5% protocol cut (`liquidation_fee` 0.05). Max leverage 4x = 1 / (20% + 5% entry buffer); min leverage 1.1x; min margin 1 USDC.
- **Operation fee**: up to 0.01 USDC per action (open, close, margin change, settlement).
- No funding rates, no withdrawal fee beyond network cost for LPs. Interest on the legacy Polygon borrow product: utilisation-based from about 10% APR, 5% liquidation fee (docs/borrowing). Legacy; not relevant to the Base product.
- Polymarket-side costs are not charged by PredMart because it never trades on Polymarket for synthetic positions. M (inferred from "does not hedge elsewhere").

## Resolution mechanism and dispute risk

- Outcome source: "PredMart gets its final results from Polymarket." Settlement is automatic, all-or-nothing (https://predmart.com/docs/market-resolution). H.
- On-chain: `resolveMarket`, `marketResolutions`, constant `MAX_RESOLUTION_AGE` = 1 hour (API: "RESOLUTION_MAX_AGE": "1 hour"), then `settlePosition(s)`. So an operator-posted, time-bounded resolution record feeds settlement. M (names only; who may call `resolveMarket` not verified).
- Dispute risk: **inherits Polymarket's UMA Optimistic Oracle risk** (disputes, delayed resolution, reversals). Docs do not cover UMA, disputes or redemption timing ("Not covered on this page"). Legacy ToS (Polygon) explicitly disclaims Polymarket/UMA outcomes. A position in a disputed market is marked at the Polymarket best bid, which may be thin or absent; empty-book/failed-price handling NOT FOUND.
- Counterparty/operator risk (stronger than usual):
  - Docs: the operator "cannot take money from the contract, change a trade after confirmation, or close a healthy trade without permission"; "rule changes require approval from multiple team members and a waiting period." H (claims).
  - But the API reports `TIMELOCK: "1 minute"` and the ABI shows UUPS `upgradeToAndCall` with `proposeUpgrade`, `MIN_TIMELOCK_DELAY`, `activateTimelock`, `increaseTimelock`. A 1-minute delay would not give users time to exit. H (API value) / M (on-chain value not read; the `timelockDelay` getter exists but needs an RPC call). Admin/operator key holders (multisig vs EOA) NOT FOUND.
  - Price integrity depends on a single operator signing prices (30 s staleness limit), so a compromised operator key could sign bad marks within the per-market cap.
  - LPs are exposed to correlated trader wins; per-market loss cap 11% of pool.
- Audit: Hashlock page lists Polygon/Polymarket lending protocol, "Secure", last audit April 2026, report https://hashlock.com/wp-content/uploads/2026/05/Predmart-Smart-Contract-Audit-Report-Final-Report-v4.pdf (5.6 MB PDF). I could not extract the PDF text here (no PDF tooling), so **whether the Base SyntheticVault is in scope is unknown**. The Base vault was verified on Sourcify in July 2026, after the May 2026 report upload, so it is probably not covered. L/M. Docs security page lists no audit for the Base contract (searched: security, smart-contract pages).

## Geo, ToS, automation

- ToS https://predmart.com/tos (Last Updated July 4th, 2026; text read from the site's route chunk `TosPage-D5YOAx5R.js`, H) is written for the **legacy Polygon lending protocol** and says the protocol is "BETA" and "experimental". It prohibits persons located, resident or incorporated in "the United States of America, United Kingdom, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan" or comprehensively sanctioned regions (Iran, Syria, Cuba, North Korea, Crimea/Donetsk/Luhansk), and forbids VPNs or other tools to circumvent. The API also has `GET /users/geo-status?wallet=` (bundle, M), so geo-gating is enforced per wallet, probably IP-based.
- ToS describes itself as independent of Polymarket: "not affiliated with, endorsed by, or partnered with Polymarket". Governing law Delaware, binding arbitration and class waiver. Operator legal entity and team: NOT FOUND (`/about` names none; searched: about, tos).
- KYC: none stated (getting-started describes wallet connect only). Automation/bot/API terms: **NOT FOUND** (searched: ToS chunk strings for bot/scrape/API/automat; docs FAQ says "Bots: Not mentioned"). robots.txt: `User-agent: *` / `Allow: /`, sitemap listed. Whether the ToS covers the Base synthetic product is unclear because it predates or ignores it.
- Practical consequence for this project: a PayBox user in a restricted jurisdiction must not trade it; the aggregator can read public data but should not present it as a bookable venue by default.

## Liquidity

- **Base synthetic vault (2026-10-19, `GET /vault/stats`, H)**: total assets 10,234.73 USD; margin held 1,329.74 USD; open interest / net exposure 3,235.35 USD; available liquidity 8,904.98 USD; utilisation about 31.6%. Per-market exposure cap 11% (`cap_headroom` 1,125.82 for the sampled market, = 11% x pool); hard per-trade max notional 2,000 USD (`max_notional`, `effective_cap_usd`).
- **Volume / fees**: no figure published. DefiLlama shows volume 0 and fees 0 (its adapter only reads the Polygon pool). NOT FOUND (searched: DefiLlama, site, docs, web search). The `volume_*` fields in market rows are Polymarket-side (M).
- **Legacy Polygon lending (DefiLlama, 2026-10-18, H)**: TVL 6,250.62 USD, borrowed 0; Polygon TVL series first point 11,009 USD (2026-03-27), peak 12,019 USD (2026-04-14), borrowed peak 1,495 USD (2026-07-02).
- Catalogue: more than 500 active markets mirrored from Polymarket; the site claims "more than 10,000" (marketing, L, from a search snippet). Category mix in the first 500: politics 138, geopolitics 95, soccer 66 (+ totals 16, spread 13, draw 4, btts 1), other 29, tech 21, crypto 17, basketball 17, LoL 14, culture 12, hockey 11, finance 11, tennis 9, weather 8, baseball 7, economics 5, CS2 3, tweets 2, crypto_15min 1. H (fixture counts). `eligibility` flags show where Polymarket depth is too thin to allow full-size trades.

## Event coverage / overlap (arbitrage relevance)

- Overlaps everything Polymarket lists: politics, geopolitics, sports (soccer, NBA, MLB, NHL, tennis, esports), crypto price and up/down, macro (Fed, GDP), tech/AI, culture, weather. H (categories), all mirrored.
- Because prices are Polymarket best bids, PredMart adds **no new price information** against Polymarket, Kalshi, Limitless, XO or others. A cross-venue scanner comparing "PredMart vs X" is equivalent to comparing "Polymarket vs X" with an added 0.1-0.3% entry fee, profit fee and holding fee, so it can only look worse.
- Fills at the bid for both opening and closing: a YES long opened and closed at the bid pays no half-spread, but the PredMart long hedged on Polymarket at the bid nets zero before fees, and the complementary hedge (YES on PredMart at bid plus NO on Polymarket at ask) costs about 1.00 when the books mirror. I found no structural lock. M (arithmetic from the documented pricing rule; not tested against live books).
- Signal value: PredMart-specific positioning (per-token open interest, `netExposurePerToken` on-chain) is a leveraged-retail positioning signal but at about 3.2K USD it is noise. P2 at most.

## Shared liquidity

- **Fully dependent on Polymarket**: price (CLOB best bid), outcome (Polymarket resolution/UMA), market ids and token ids, even market art (avatar URLs on Polymarket's S3). There is no independent order flow; the LP pool is a separate small bankroll but its payoffs are slaves to Polymarket marks. H (docs, API sample).
- So `liquidity_shared_with = Polymarket`; not an independent arbitrage leg. Legacy Polygon product is also on Polymarket CTF collateral/CLOB.

## Adapter spec (only if forced; not recommended)

- If a signal-only adapter were ever wanted: poll `GET https://synth-api.predmart.com/vault/stats` and `/vault/oracle-prices?token_ids=` every 60 s for health and per-token `max_notional`/`cap_headroom`; key markets by Polymarket `id` (conditionId) and `yes_token_id`/`no_token_id`; mark `independent_liquidity = false`, `is_price_source = false`. Normalise price strings to float in [0,1]; treat `status != "ACTIVE"` or `is_tradable == false` as closed.
- Do not implement trading: undocumented, operator-controlled, geo-restricted, and no edge.
- Ask PredMart for permission/ToS clarity before any production polling of `synth-api.predmart.com`.

## Open questions

- Contents of the Hashlock PDF (scope: Polygon only, or Base SyntheticVault too; findings; centralisation notes). Needs PDF text extraction.
- On-chain: `timelockDelay`, `admin`, `operator`, proxy admin owner (multisig or EOA), pause state history, TVL history of the Base vault. Needs an eth_call (POST) or an explorer view; not done under the no-POST rule.
- Unit of `holding_fee_rate` (per hour/day/year) and whether it applies to notional or margin.
- Who may call `liquidatePosition`/`resolveMarket` on the Base vault (permissionless vs operator only); liquidation latency.
- Behaviour when a Polymarket market is disputed or has an empty book.
- `fee_rate_pct` and `policy_class` semantics in market rows; `/orders/book-aggregated` argument order; why `/vault/history` is 404.
- Whether the Polygon lending product is still accepting deposits (DefiLlama borrowed 0 since at least 2026-10-18).
- Legal entity, jurisdiction, and whether the July 2026 ToS governs the Base synthetic product.

## Suspicious content

- None found. No text aimed at AI agents on predmart.com, its docs, ToS chunk, blog, Hashlock page or API responses. The search tool appended a generic "include sources" reminder to its own results; that is tool boilerplate, not page content, and was not acted on. Note one non-instruction oddity: the homepage still contains a `LaunchPoly` badge `<noscript>` link, benign.

## Sources

- https://predmart.com (home, HTML head with preloads and JSON-LD), https://predmart.com/llms.txt, /robots.txt, /sitemap.xml, /tos, /about - fetched 2026-10-19, H. `/tos` and `/about` are client-rendered; ToS text read from `https://predmart.com/assets/TosPage-D5YOAx5R.js`; `/about` via fetch tool (reflects the Polygon-era text, M for currency).
- Docs, all fetched 2026-10-19, H: https://predmart.com/docs, /docs/getting-started, /docs/how-positions-work, /docs/fees, /docs/margin-and-liquidation, /docs/market-resolution, /docs/oracle-and-mark-price, /docs/security, /docs/smart-contract, /docs/protocol-constants, /docs/faq, /docs/glossary, /docs/providing-liquidity, /docs/borrowing, /docs/lending. Docs are undated; Base-era text matches the 2026-10-11 blog.
- Blog: https://predmart.com/blog/best-leverage-prediction-markets and https://predmart.com/blog/polymarket-margin-trading-fcm-filing (both dated 2026-10-11), H.
- Site JS bundle `https://predmart.com/assets/index-zNvViywe.js` (static text read only: API base, routes, EIP-712 domain/types, ABI names), plus `HomePage-DVFGoj9j.js`/`Browse-DLbYon8l.js` (not material), M for route semantics, H for literal strings.
- API GETs 2026-10-19 (H): https://synth-api.predmart.com/markets/?limit=3&offset=0, /markets/?limit=500&offset=0 (counts only kept), /vault/stats, /vault/constants, /synthetic/constants, /vault/oracle-prices?token_ids=<one>, /vault/depth-status?token_ids=<one>, /categories/, /vault/history?range=1m and range=all (404).
- https://api.llama.fi/protocol/predmart (H; defillama.com/protocol/predmart itself returned 403 to the fetch tool) and the local registry fixture `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` (listed_at 2026-02-17, chains Polygon+Base, UMA oracle tag, TVL 6,249.78). The "UMA" oracle tag reflects the Polymarket dependency, M.
- https://sourcify.dev/server/v2/contract/8453/0xadFe4055f7Bc231287bED441fD213565D1BC06D2 (+ `fields=` variant), H.
- https://hashlock.com/audits/predmart (page read, H; PDF not machine-readable here).
- WebSearch extended (2 queries): Hashlock page, Coingape and review-site snippets (L; third-party claims such as "7% entry fee, 10-317% borrow APR" conflict with PredMart's own docs and were not relied on), TRM/predscope industry reports (not PredMart-specific).
- Local context: docs/research/06-paybox-platform.md (`request_wallet_sign` semantics), docs/research/14-platform-of-platforms.md.

## Fixtures (docs/research/fixtures/predmart/)

- `synth_api_markets_limit3.json` - 3 market rows (5 KB).
- `synth_api_markets_limit500_category_counts.json` - category counts and field names from the 500-row page (rows not kept).
- `synth_api_vault_stats_2026-10-19.json`, `synth_api_vault_constants.json`, `synth_api_synthetic_constants.json`.
- `synth_api_vault_oracle_prices_one_token.json`, `synth_api_vault_depth_status_one_token.json`, `synth_api_categories.json`.
- `sourcify_base_vault_proxy.json` - proxy/implementation/deployment info for the vault.
- `defillama_protocol_predmart_trimmed.json` - trimmed DefiLlama protocol summary (legacy Polygon pool).

## Privacy note

Scripted requests used only the User-Agent `insurance-markets-research/0.1`; no email, name, username or home path was sent anywhere. Fixtures were grepped for "@" (only hit: the `@openzeppelin` package path inside the Sourcify fixture) and for the user's name (none).
