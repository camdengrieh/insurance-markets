# Borsa (borsa.cc) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~04:00-04:30 UTC). READ-ONLY: unauthenticated GETs of public pages, DefiLlama public JSON, one public indexer host (hl-indexer.llama.rip, the host DefiLlama's own adapters read), and `gh api` raw reads. No account, sign-up, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. I did not call any Borsa `/api/*` route (robots.txt disallows it; the Execution API needs a partner key). Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, small-model summary, or my inference/computation from first-hand data; **L** = weak or stale.

Method notes: WebFetch page summaries were used for a first pass, then every number below that matters was re-read from the raw HTML (converted to text with the Python standard library, not executed) and the text is saved under `docs/research/fixtures/borsa/`. WebSearch budget ran out after one query (it returned nothing about Borsa), so there is no independent news or social check (see NOT FOUND).

---

## 0. Bottom line

1. **Borsa is not a venue. It is a Hyperliquid trading terminal (front end plus bot/strategy tooling) that routes orders into Hyperliquid's own order books through a builder code.** Its own words: "Borsa is a frontend on Hyperliquid. Orders route to the same order books, your collateral sits in your own Hyperliquid account" (H, https://www.borsa.cc FAQ, fixture `borsa_home_faq_excerpt.txt`).
2. **100% of its prediction-market liquidity is Hyperliquid HIP-4, so it is NOT an independent arbitrage leg.** Counting it would double-count the Hyperliquid books. The adapter for this ecosystem is the Hyperliquid HIP-4 adapter (`docs/research/venues/hyperliquid-outcomes-hip-4.md`, P1 there).
3. **Borsa's own HIP-4 usage is effectively zero.** The public indexer DefiLlama uses attributes **$49.90** of HIP-4 outcome volume to Borsa's builder code on 2026-05-02 and **$0** on every other UTC day I sampled through 2026-10-18 (and DefiLlama's 170-point daily series is $0 after the first point), while the same builder routed **$88.9M of perps on 2026-10-15** (H, fixtures). Hyperliquid-wide HIP-4 volume was **$3.13M on 2026-10-18**. Borsa's share of HIP-4 is about 0%.
4. **No public read API, no market-data API, no websocket documented.** The only developer surface is a partner-key Execution API (order "intents" for perps, HIP-3 perps and spot); it does not document outcome coins. Nothing to integrate.
5. **Borsa's outcome UI is narrow:** its docs describe only `priceBinary` contracts on perp underlyings (e.g. "BTC >= strike", periods 3m/15m/1d), shown in an Outcomes tab next to the selected perp. No sports, Fed or event markets are described.
6. **adapter_priority = skip.** Front end only, duplicate liquidity, ~0 attributed volume, no public API, no trade path of its own. Model `borsa.cc` as a registry alias `routes_to: hyperliquid-outcomes-hip-4` (mechanism: frontend / builder-code) so it is never counted as a venue. Optionally use the builder address for fill attribution.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.borsa.cc/` and `https://app.borsa.cc/docs/*` | HTTP 200 on 2026-10-19, Next.js behind Cloudflare; app sitemap `lastmod` 2026-10-19T02:13Z with 145 URLs (trade pages for ~25 coins, 40+ doc pages, blog) | H |
| Borsa blog "Guide to HIP-4 Markets for Systematic Traders" | dated 14 October 2026 (generic educational text, no product detail) | H |
| Execution API doc and fee page | fee-policy change effective **October 14, 2026** ("Accounts that approved Borsa's builder fee before October 14, 2026 keep a 0.01% base fee"); Execution API example intent timestamp decodes to 2026-10-14 | H |
| Real flow: Borsa builder code volume (public indexer, `/v2/data/builder/<builder>/daily/<date>`) | perps $14.8M (2026-10-18), $88.9M (2026-10-15), $73.9M (2026-10-14), $19.6M (2026-10-11); ramping from ~$1k/day mid-June 2026 | H |
| DefiLlama | three "Interface" rows under parent "Borsa": Borsa Perps (id 8945), **Borsa Outcome (id 8966)**, Borsa Spot (8967); `listedAt` 1791497866 = **2026-10-08T22:17:46Z**; twitter handle "Borsa_HL"; tag "Hyperliquid HIP4 Builder" | H (api.llama.fi/protocols, /protocol/borsa-outcome; fixture `llama_protocol_borsa_outcome.json`) |
| Borsa Terms of Service | "Last updated: March 13, 2026" (7 months old: **possibly stale**, predates HIP-4 mainnet traffic and the Oct 2026 fee change) | H |
| Hyperliquid HIP-4 underneath | live: DefiLlama `hyperliquid-outcomes` 24h $3.13M (2026-10-18), 7d $17.9M, 30d $47.0M, all-time $261M (fetched 2026-10-19) | H |

Verdict: **still_live = true** (the terminal is live and growing on perps). The *prediction-market* part of it is live in the sense that the UI says it lists HIP-4 contracts, but there is no evidence of usage (section 9).

---

## 2. Kind and market model

- **Kind: `broker-or-frontend`** (non-custodial trading terminal by "HYBRIDGE FOR COMPUTER SERVICES", brand HyBridge) (H: Terms; docs welcome page). Features: manual execution, order types (market, limit, scale, TWAP, burst), Strategy Studio (node-editor bots, backtests), Borsa Cloud (server-side strategies, unlocked by points), portfolio, alerts, HIP-3 market access, brsHYPE liquid staking, brsPoints, referrals (H, docs sitemap + homepage).
- **Market model for outcomes = Hyperliquid HIP-4's, not Borsa's:** fully collateralised binary Yes/No contracts on HyperCore's merged central limit order book; spot-like tokens, `encoding = 10*outcome + side`, read coin `#<encoding>`, order asset id `100_000_000 + encoding` (see sibling note section 2, H there). Borsa docs: "Outcomes are Hyperliquid HIP-4 binary contracts. Each contract pays 1 USDC if its condition resolves YES at expiry, or 0 if it resolves NO. Today the only deployed class is `priceBinary`, which settles YES if the underlying perp's mark price is greater than or equal to a strike price at the expiry time." (H, https://app.borsa.cc/docs/outcomes, fixture `borsa_docs_outcomes.txt`; page is undated, treat as M for "today".)
- **What the Borsa UI shows:** a row per binary with condition (`UNDERLYING >= strike` or `<=`), period badge (3m, 15m, 1d), countdown, move % to strike, "Implied" (= best YES ask clamped to [0.001, 0.999]), a heuristic "ref ~" probability (zero-drift log-normal with a one-sample vol proxy `|ln(markPx/prevDayPx)|` floored 0.5%/day, capped 50%/day), YES/NO pills that send a **market buy at the configured ticket size**, and suggestion chips (Hedge, Edge when |ref-implied| > 5%, Amplify) (H). The page itself says the reference is "deliberately rough" and must not drive sizing. **Not useful as a signal source** for the aggregator; it is a crude Black-Scholes-style heuristic.
- Scalar/categorical/question-style outcomes on Borsa: **NOT FOUND** (the docs page covers only `priceBinary`; the homepage FAQ says "plus HIP-4 outcome contracts that settle at 1 USDC or zero" without listing classes).

---

## 3. Chains and collateral

- **Execution venue: Hyperliquid HyperCore (L1).** Not an EVM chain. DefiLlama lists chain "Hyperliquid L1" (H). Collateral/settlement unit: **USDC** (Borsa: "pays 1 USDC", H; sibling note: official HIP-4 sample and docs use USDC, the older USDH retired, M).
- **Funding paths via Borsa (H, https://app.borsa.cc/docs/get-started-with-borsa, fixture `borsa_docs_get_started_funding_excerpt.txt`):** USDC from **Ethereum, Arbitrum, Base, Optimism, Polygon or Avalanche** via Circle CCTP, credited "in a few minutes, with no second step"; bridging USDC "from any chain using HyBridge" (Solana/BNB not named; M that they work via HyBridge); direct transfer from another wallet or a Hyperliquid-supporting CEX; card on-ramp delivering USDC on Arbitrum. Minimum deposit "at least $1 worth of tokens"; a new account "may require an initial activation step".
- **CSP `connect-src` of app.borsa.cc** also lists RPCs for Arbitrum, Base, Optimism, Polygon, BSC, Avalanche, Ethereum, Hyperliquid (api, rpc, testnet), Circle Iris (CCTP), LayerZero scan, Jupiter (`jupiter.borsa.cc`, i.e. a Solana swap path), Transak/MoonPay/Stripe on-ramps, Privy (embedded wallets), and Borsa's own `indexer.borsa.cc`, `ws.borsa.cc` (H, fixture `borsa_app_csp_connect_src.txt`; what the last two serve is NOT documented).

---

## 4. Read API

- **Official/public read API: none.** Docs, sitemap and homepage link no market-data API, OpenAPI, SDK or GitHub org (searched: docs sitemap, `/docs`, welcome page, homepage). DefiLlama lists `github: null`.
- **Borsa backends exist but are undocumented:** `indexer.borsa.cc`, `ws.borsa.cc`, `jupiter.borsa.cc`, `api.hybridge.xyz` appear only in the CSP. `app.borsa.cc/robots.txt` says `Disallow: /api/` and `Disallow: /docs-assets/` (H, fixture `borsa_app_robots.txt`). I did not probe them.
- **The only documented developer API is the Execution API (write-oriented, partner-key, no market data):** base `https://app.borsa.cc/api/exec/v1`; endpoints `GET /users/{address}`, `GET /delegations/typed-data`, `POST /delegations`, `DELETE /delegations/{address}`, `POST /intents`, `GET /intents`, `GET /intents/{id}`, `POST /intents/{id}/cancel`, `GET /intents/{id}/fills`, `GET /events`, `GET /events/stream` (SSE), `GET /revenue`. Auth `Authorization: Bearer bx_<id>_<secret>`; **20 requests/s per key**; up to **20 working intents per user per integrator**; events kept 7 days (H, https://app.borsa.cc/docs/execution-api, fixture `borsa_docs_execution_api.txt`). Docs: "Ask the Borsa team for an API key." I did not request one. It documents no read-only market-data endpoint (only a `no_market_data` 503 error code).
- **Data source to use instead: Hyperliquid directly.** REST `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, `settledOutcome`...), WebSocket `wss://api.hyperliquid.xyz/ws` (`l2Book`, `trades`, `bbo`, `activeAssetCtx`, `allMids`, `outcomeMetaUpdates`), keyless. Details and live-captured shapes: `docs/research/venues/hyperliquid-outcomes-hip-4.md` and fixtures in `docs/research/fixtures/hyperliquid-outcomes-hip-4/`. I did not recapture (POST is out of scope).
- **Response shapes confirmed by unauthenticated GET (saved to `docs/research/fixtures/borsa/`):**
  1. `GET https://api.llama.fi/protocol/borsa-outcome` -> `{"id":"8966","name":"Borsa Outcome","chain":"Hyperliquid L1","category":"Interface","tags":["Hyperliquid HIP4 Builder"],"dimensions":{"fees":"borsa-outcome","dexs":"borsa-outcome"},"parentProtocol":"parent#borsa","listedAt":1791497866,...}` (`llama_protocol_borsa_outcome.json`).
  2. `GET https://api.llama.fi/summary/dexs/borsa-outcome` -> `totalAllTime: 50`, `totalDataChart` of 170 `[unixTs, usd]` points, all 0 except `[2026-05-02, 50]`; methodology "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code" (`llama_summary_dexs_borsa_outcome.json`).
  3. `GET https://hl-indexer.llama.rip/v2/data/builder/<Borsa builder>/daily/<YYYY-MM-DD>` -> `{"date","timestamp","hours":24,"builder","builderFees":{"USDC":..},"builderPerpsFees","builderSpotFees","builderOutcomeFees":{},"builderVolumeUsd","builderPerpsVolumeUsd","builderSpotVolumeUsd","builderOutcomeVolumeUsd","builderOutcomeNotionalVolumeUsd"}` (`hl_indexer_builder_daily_2026-10-15.json`; 32-day sample in `hl_indexer_borsa_builder_daily_sample.json`; Hyperliquid-wide comparison in `hl_indexer_hyperliquid_wide_volume_trimmed.json`). This host is a DefiLlama service, not Borsa's; field docs at https://hl-indexer.llama.rip/llms.txt.

---

## 5. Trade path

- **Through Borsa's UI (consumer):** connect a wallet, or sign in by email/SMS/Google/X to get a "self-custodial embedded wallet" (CSP shows Privy), or "connect an API wallet" (H, homepage FAQ). Onboarding: fund the Hyperliquid account, then **Approve Trading Agent** ("link a device-specific trading agent so Borsa can sign orders and cancels without repeated wallet popups"), then apply referral code HYBRIDGE or approve the builder fee (H, get-started docs). The agent "cannot withdraw funds" (Hyperliquid agents can only trade, H). Outcome orders from the UI are clicks on YES/NO pills that send a market buy at the ticket size (H).
- **Programmatic via Borsa:** only the Execution API, which is **partner-only** (key issued by the Borsa team). Per-user prerequisites: `approveAgent` for a per-user Borsa execution agent, `approveBuilderFee` (maxFeeRate "0.025%"), and an EIP-712 `Delegation` message (`domain {name:"Borsa Execution", version:"1", chainId:<wallet chain>}`, fields `user`, `integrator`, `expiresAt` <= 366 days, `nonce`). Intents: `algo` market / chase (post-only, follows the touch) / twap; 1-4 legs; each leg `coin` ("BTC", `xyz:XYZ100` for HIP-3 perps, `HYPE/USDC` for spot), `side`, `size` or `notionalUsd`, optional `limitPx`, `reduceOnly`; min **$10 per leg**. **Whether outcome coins (`#...`) are accepted is NOT FOUND** (docs list only perps, HIP-3 perps and spot; error `unknown_market` exists). Response intent has `builderFeeBps` in **tenths of a basis point** (25 = 0.025%) despite the "Bps" name (H).
- **Real trade path = Hyperliquid directly** (signed L1 actions to `POST /exchange`, EIP-712 phantom-agent scheme, agent/API wallets, optional builder code). See the sibling note, section 5. Borsa adds nothing programmatic that a third party can use.

### Reachability from a PayBox wallet

**Verdict: no (via Borsa); partial (via Hyperliquid, which is a different adapter).**
- Via Borsa: no public API, Execution API is a partner-key program, UI-only otherwise. Nothing for a plugin to call.
- Via Hyperliquid (per the sibling note, M here, I did not re-verify the PayBox side): HyperCore is not an EVM chain, so no EVM transaction proposals can place orders; order signing needs an agent key or per-order typed-data signing; USDC funding from Arbitrum/Base/Ethereum/Polygon is reachable (and Borsa's own CCTP deposit list matches those chains); PayBox's official `hyperliquid` plugin was spot-browse only.
- Note for plugin design: Borsa's "device-specific trading agent" lives in the browser/Borsa Cloud, i.e. a trade-capable key outside the user's wallet. Do not copy that pattern.

---

## 6. Fees

All from https://app.borsa.cc/docs/fees-referrals-and-rewards (H, fixture `borsa_docs_fees.txt`) unless marked.

- **Layers an order pays:** Hyperliquid exchange fee (14-day weighted volume, assessed daily UTC; not reduced by Borsa) **plus** Borsa builder fee **plus** spread/slippage. For outcomes, Hyperliquid's own fee structure applies (fees only on close/settle, no maker rebates; rate not in the official docs; see sibling note section 7, M).
- **Borsa builder fee:** "0.025% builder fee, and 0.01% on HIP-3 markets". Accounts that approved before **October 14, 2026** keep 0.01% base. Approved separately by the user, revocable. Builder fees "do not apply to the buy side of spot trades" (H).
- **Outcomes/HIP-4:** the Borsa fee page and outcomes page **do not say** what builder fee applies to outcome orders (NOT FOUND). The official Hyperliquid HIP-4 page says builder fees on outcomes are on **sell** orders (sibling note, H there); a deployer-actions page suggests buys may also carry them (M). Net: unknown, assume 0.025% on whichever side Hyperliquid permits.
- **Volume reductions on the builder fee** (Borsa-only 14-day volume): $1M 5% (0.0238%), $5M 10%, $25M 20%, $100M 30%, $500M 50%, $2.5B 75% (0.0063%). **brsHYPE staking reductions:** 100 held 10%, 1,000 25%, 10,000 40%, 50,000 100%; the two stack, capped 100%. **They do not apply to Execution API orders** (H, execution-api page).
- **Referral:** 30% of referees' builder fees paid in USDC (H); HYBRIDGE code = 4% off Hyperliquid fees for the first $25M (H).
- **Conflict:** the homepage FAQ still says "A 0.01% builder fee" while the docs say 0.025% (0.01% only for legacy approvals and HIP-3). Docs are newer (references Oct 14, 2026); treat the homepage as stale (H for both texts, judgement M).
- **Implied effective rate (M, my computation):** DefiLlama Borsa Perps fees 24h $663 against $14.8M builder-attributed perps volume on 2026-10-18 is about 0.45 bps, far below 2.5 bps, so most volume pays reduced or 0.01% rates, or the two series differ in window/definition. Not used for anything.
- **Aggregation-relevant:** for edge calculations, model Borsa-routed HIP-4 as Hyperliquid fee + 0.025% (worst case) and prefer direct Hyperliquid routing with no builder code or your own.

---

## 7. Resolution mechanism and dispute risk

Entirely Hyperliquid's, Borsa adds no layer. Borsa docs: contracts "settle at expiry" on whether the underlying perp's **mark price** is >= (or <=) the strike; YES pays 1 USDC, NO pays 0 (H). Per the sibling note (H/M there): recurring `priceBinary` markets are protocol-settled by code from the HyperCore mark price (interpolated; daily series at 06:00 UTC), with no human oracle; other HIP-4 markets are validator-voted or deployer-settled with no trader dispute window. Because Borsa's UI only describes `priceBinary` contracts, its exposure is the *lowest-risk* settlement tier, but note the basis risk: HyperCore mark price is a Hyperliquid composite, not Binance/Chainlink/Coinbase spot, and 3m/15m/1d periods do not align with other venues' reference times. Borsa's Terms disclaim execution quality, data accuracy and availability ("as-is and as-available") (H). Front-end-specific risk: displayed "Implied"/"ref" numbers can differ from the book (the UI clamps and infers the missing leg as `1 - other side`).

---

## 8. Geo, ToS and automation

- **Borsa Terms (H, https://app.borsa.cc/terms, "Last updated: March 13, 2026", possibly stale):** operated by HYBRIDGE FOR COMPUTER SERVICES. No jurisdiction list: "You are responsible for determining whether access is lawful in your jurisdiction." No outcome/prediction-market clause. No bot/API clause beyond Acceptable Use, which bars "scrape the platform in a way that degrades service" and market manipulation; users are "solely responsible" for "trading agent approvals, API credentials, and any linked accounts". robots.txt disallows `/api/`.
- **No explicit US/Ontario block on Borsa pages** (searched: terms, homepage, docs welcome/get-started/outcomes/fees/execution-api). I did not test geo-blocking behaviour (no browser automation, no VPN). The underlying venue's terms still bind: Hyperliquid Interface Terms (last updated 2026-06-15, per sibling note, read there from the app bundle) bar residents of the **United States and Ontario**, and additionally bar "Excluded Persons" from outcome markets (list unpublished); VPN circumvention prohibited; bots allowed within "reasonable usage" (H in the sibling note, M here). Whether those bind a Borsa user is a legal question I did not resolve.
- Cloudflare Turnstile is present in the app CSP (`challenges.cloudflare.com`), so scripted use of the web UI is likely challenged (M, inferred); irrelevant since the UI should not be automated.

---

## 9. Liquidity (with dates)

| Quantity | Value | Date / source | Tag |
|---|---|---|---|
| Borsa-attributed HIP-4 outcome volume, all time | **$50** (single point, $49.90 on 2026-05-02; $76 face-value notional) | `api.llama.fi/summary/dexs/borsa-outcome` and `hl-indexer.llama.rip` builder daily, fetched 2026-10-19 | H |
| Same, 31 other sampled days 2026-05-09 .. 2026-10-18 | $0 every day; DefiLlama series is $0 for all 169 later days; fees all-time $0 | same | H |
| Borsa-attributed perps volume | $14.8M (10-18), $88.9M (10-15), $73.9M (10-14), $5.4M (10-03), weekly samples in Jul-Sep range $0.05M-$3.1M | indexer | H |
| Borsa Perps fees (DefiLlama) | 24h $663, 7d $12.4k, 30d $43.8k, all-time $58.0k | fetched 2026-10-19 | H |
| Borsa share of Hyperliquid | 2026-10-15: $88.9M of $13.48B perps = 0.66% (Borsa's own claim: "something in the region of 2% of all Hyperliquid volume" on a strong day) | indexer; homepage FAQ | H / L |
| Hyperliquid HIP-4 outcome volume (shared pool, not additive) | $1.90M (2026-10-15), **$3.13M (2026-10-18)**; DefiLlama 7d $17.9M, 30d $47.0M, all-time $261M | indexer; DefiLlama `hyperliquid-outcomes`, fetched 2026-10-19 | H |
| TVL | none (DefiLlama `tvl: null`, no contracts; collateral stays in the user's Hyperliquid account) | api.llama.fi | H |

Caveat on the zero: the indexer counts only fills tagged with Borsa's builder code. "Zero" means zero *attributed* outcome volume. It cannot distinguish "no one trades outcomes on Borsa" from "Borsa sends outcome orders without its builder code". Either way Borsa contributes no separate liquidity.

---

## 10. Event categories and arbitrage overlap

- Borsa's described outcome set: crypto price-threshold binaries on perp underlyings (BTC, ETH, SOL, HYPE etc., periods 3m/15m/1d) (H docs; M for completeness). Overlap with other venues: crypto price ladders on Polymarket/Kalshi/Limitless/Opinion-type venues, but with different reference prices and expiries.
- Sports, politics, Fed/macro: **not shown on Borsa** per its docs. Hyperliquid itself lists these (sibling note section 11); those are reached through the Hyperliquid adapter.
- Arbitrage consequence: model the Hyperliquid book once; do not add a Borsa leg.

## 11. Shared liquidity

**Shares 100% of its liquidity with Hyperliquid HIP-4 (HyperCore order books).** Same books as the other ~35 HIP-4 "Outcome" front ends in DefiLlama's Interface category (`docs/research/14-platform-of-platforms.md`; sibling notes `presagio-presagio-xyz-hip-4-interface.md`, `outcome-xyz.md`). Not an independent leg.

---

## 12. Adapter recommendation

- **skip** a Borsa adapter. Add a platform-registry alias: `borsa.cc -> routes_to: hyperliquid-outcomes-hip-4`, kind `frontend`, status `live (perps), negligible (outcomes)`.
- Builder-code attribution (optional, for fill analytics): Borsa's builder address `0x74c362cd3a141769f38c48d66ee51b1938ea4bd0` (public protocol address; H: DefiLlama adapter `factory/hyperliquid.ts` comment "address labelled Borsa on flowscan.xyz/builders"; the Borsa docs show the same address truncated as `0x74c3...4bd0`). Not a wallet of the user.
- Re-check only if: (a) outcome volume under this builder code becomes material (use the indexer URL in section 4, free), (b) the Execution API becomes public or documents outcome coins, (c) Borsa publishes a market-data API or a multi-venue router.
- Do not copy Borsa's "reference probability" as a signal; it is a one-line vol proxy by Borsa's own admission.

---

## NOT FOUND (searched)

- Any public Borsa read API, market-data endpoint, websocket, OpenAPI, SDK or GitHub repo (searched: docs sitemap, welcome page, homepage, robots, sitemap, CSP; DefiLlama `github: null`).
- What `indexer.borsa.cc` / `ws.borsa.cc` serve (CSP only; not probed because they are undocumented and `/api/` is robots-disallowed).
- Builder fee actually charged on HIP-4 outcome orders via Borsa (fee page and outcomes page silent).
- Whether the Execution API accepts outcome coins (`#<encoding>`); docs list perps, HIP-3 perps and spot only.
- Borsa-specific geo restrictions, prediction-market terms, bot policy beyond Acceptable Use (searched: terms, homepage, docs). Terms are dated March 13, 2026.
- Whether Borsa's Outcomes tab lists classes other than `priceBinary` or markets not tied to a perp underlying (docs say only `priceBinary` is deployed; undated page).
- Independent news, social posts, audits or funding of HyBridge/Borsa (one WebSearch returned nothing on Borsa; the second was refused because the shared WebSearch budget was exhausted).
- Why Borsa's attributed outcome volume is zero (no builder tag vs no usage).

## Suspicious content

None found. I grepped the homepage, docs pages (outcomes, fees, execution API, get-started, connect-wallet, trading-fundamentals), the HIP-4 blog post and the Terms for text addressed to AI agents or models (ignore/previous/system prompt/AI agent/language model/assistant) and found none.

## Open questions

1. Does the Borsa UI send outcome orders with its builder code? (Would explain the $0 attributed volume.)
2. Is the Execution API open to third-party integrators for outcome markets, and on what revenue share? (Docs say "an agreed share of the builder fees".)
3. Does Borsa geo-block US/Ontario IPs in practice? (Not tested.)
4. Which wallet provider backs the email/SMS/social embedded wallet (CSP suggests Privy; not stated in docs).

## Sources

- https://www.borsa.cc/ (homepage, FAQ) and https://www.borsa.cc/robots.txt, /sitemap.xml (H, fetched 2026-10-19)
- https://app.borsa.cc/docs (index), /docs/outcomes, /docs/fees-referrals-and-rewards, /docs/execution-api, /docs/get-started-with-borsa, /docs/connect-your-wallet (H, 2026-10-19)
- https://app.borsa.cc/terms (H, last updated March 13, 2026), https://app.borsa.cc/robots.txt, https://app.borsa.cc/sitemap.xml (H)
- https://app.borsa.cc/blog/guide-to-hip-4-markets (H, dated 14 October 2026; generic)
- https://defillama.com/protocol/borsa-outcome (WebFetch returned HTTP 403); data read instead from https://api.llama.fi/protocols, https://api.llama.fi/protocol/borsa-outcome, https://api.llama.fi/summary/dexs/borsa-outcome, /summary/fees/borsa-outcome, /summary/fees/borsa-perps, /summary/dexs/hyperliquid-outcomes (H, 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters `factory/hyperliquid.ts` (borsa-perps builder address; `borsa-outcome` listing) via `gh api` raw read (H)
- https://hl-indexer.llama.rip/llms.txt and `/v2/data/builder/<address>/daily/<date>`, `/v2/data/volume/daily/<date>` (H, public GET, 2026-10-19)
- Sibling notes in this repo for Hyperliquid mechanics (M here, H there): `docs/research/venues/hyperliquid-outcomes-hip-4.md`, `docs/research/venues/presagio-presagio-xyz-hip-4-interface.md`
- Fixtures: `docs/research/fixtures/borsa/` (12 small files; example wallet addresses in saved docs text redacted)

## Privacy

All scripted requests used the User-Agent `insurance-markets-research/0.1`. No email, name, username, home path or contact parameter was sent in any request, header, URL or search query. The helper scripts were grepped for "@" and the user's name before running (no hits in anything sent out); the saved fixtures were scanned for the same (only hit: an npm package scope `@nktkas/hyperliquid` quoted from Borsa's docs).
