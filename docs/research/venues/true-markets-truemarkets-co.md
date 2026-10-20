# True Markets (truemarkets.co) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: page and doc reads, `gh api` file reads of public repos, unauthenticated GETs to documented hosts (`api.truemarkets.co`, `api.truex.co/v1/cefi/health`, `api.llama.fi`, `api.coingecko.com`). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data; nothing in them was followed (see "Suspicious content").

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real unauthenticated responses, each <= 50 KB): `docs/research/fixtures/true-markets-truemarkets-co/` (section 11).

---

## 0. Bottom line

1. **True Markets (truemarkets.co) is a live company, but it has no live prediction market.** It is True Markets, Inc., a trading-infrastructure company ("One API for digital assets"): spot crypto, perps, tokenized stocks, wallet app, Gateway for fintechs, institutional REST/FIX on its own exchange. (H, site and docs)
2. **Its prediction product, "Outcomes", is announced but not launched.** The page says "Coming soon", "Outcome markets are coming", and, to "When do they launch?": "December 2026." It launches "API-only", BTC first. (H, https://truemarkets.co/outcomes, fetched 2026-10-19). No outcome/prediction/event instrument exists in any published API spec, the asset catalog, the FIX spec or the docs index (section 3).
3. **Dedupe: this is NOT the "Truemarkets" in the SoK / Gebele-Matthes catalogues.** That one is the Base/Ethereum Uniswap-based protocol that was renamed **Trueo** (trueo.com, token TRUE). `truemarkets.org` still 301-redirects to `https://trueo.com/` (H, `curl -I`, 2026-10-19) and DefiLlama lists protocol "Trueo", `previousNames: ["TrueMarkets"]`, symbol `TRUE`, category Prediction Market, chain Base (H, https://api.llama.fi/protocol/trueo). Trueo is covered by the parallel workflow and by `docs/research/11-trueo.md`. Neither site mentions the other (H: 0 hits for "trueo" in truemarkets.co home, outcomes and ToS HTML; 0 literal "truemarkets.co" in trueo.com home HTML). Any corporate relationship, or a trademark dispute behind the rename, is **UNVERIFIED** (search budget was exhausted before I could check).
4. **adapter_priority = skip for now.** Nothing to adapt today. Revisit once Outcomes ships (target December 2026): by design it would be an independent order book (own matching engine) on short-dated BTC up/down, with a public-API-first posture, which would be a useful arbitrage leg against the BTC up/down markets on other venues. Re-evaluate against the checklist in section 12.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| truemarkets.co home | Footer "(c) 2026 True Markets, Inc."; hero "One API for digital assets"; products: True Markets (app), Institutional, Gateway, Assets, Tokenized Stocks, Strategies, Outcomes. Chains listed: Bitcoin, Solana, Base, Robinhood Chain, Hyperliquid, Arbitrum. (https://truemarkets.co/) | H |
| Docs changelog | Entries up to 2026-10-13 (Trading REST v1.39.0). Cadence is several releases per week in Sept-Oct 2026. (https://docs.truemarkets.co/documentation/changelog) | H |
| Public API answers | `GET https://api.truemarkets.co/v1/defi/market/market-data/trending` -> 200; `GET https://api.truemarkets.co/v1/gateway/assets` -> 200, 359 assets (2026-10-19). | H |
| Exchange API | `GET https://api.truex.co/v1/cefi/health` -> 200 `{"status":"healthy",...}` (2026-10-19). | H |
| GitHub | org `true-markets`: repos `specification` (last push 2026-07-16), `tools` (2026-10-13), `cli` (2026-07-02), `examples` (2026-10-06), `homebrew-tap`. | H |
| Prediction product live? | **No.** "Coming soon" / "December 2026" (section 3). | H |

Verdict: **still_live = true** for the company; **prediction markets: not live**.

---

## 2. What it is (kind)

- Kind: trading infrastructure / brokerage-API company. Backers named on the home page: "Paxos, PayPal, Solana Foundation, and Aptos"; "Keys are generated inside a Trusted Execution Environment via Turnkey, with qualified custody through Paxos." (H, home page)
- Two venues behind one API (H, docs): `defi` = on-chain swaps (chains `solana`, `base`, `robinhood`, `hypercore-spot`, `hypercore-perp`), and `cefi` = the True Markets / TrueX central limit order book ("The True Markets exchange is a central limit order book ... price-time priority", spot only per the FIX spec: `SecurityType` enum has only `CSPOT`).
- Home page positions "Prediction markets" as a **Gateway use case for clients**: "List event contracts alongside everything else your clients trade. Cash-settled, collateralized in stablecoins, and settled against the same balance." The liquidity source for such contracts is not stated. (H quote, home page)

---

## 3. Market model (Outcomes, planned)

Everything below is from the marketing page, not from any API doc. (H, https://truemarkets.co/outcomes)

| Item | What the page says | Tag |
|---|---|---|
| Contract | "Up-or-down contracts on where a market's price closes. The right side pays $1.00 at close." Binary, cash-settled. | H |
| Horizons | 15 minutes, 1 hour, 1 day, 1 month. First market: "BTC, with more to follow." | H |
| Matching | "Orders match on our proprietary engine" = order book (CLOB) on the exchange. Opening auction: orders collected, then matched at one uniform clearing price ("Most markets open at 50/50. Ours open at a fair price"). Existing docs already have an `AUCTION` WebSocket channel (opening-auction indicative, added 2026-07-14, M that it is the same mechanism). | H / M |
| Resolution | "Our index blends prices from multiple oracles into one, so no single feed can move the result." "Every market settles as a committed message in the exchange's own sequence. No outside feed, no gap at the close." | H |
| Tokenisation | NOT STATED. "Settles as a committed message in the exchange's own sequence" suggests exchange-ledger positions, not ERC-20 outcome tokens (M, inference). | M |
| Collateral | "Your stablecoins stay in your own wallet until a trade settles." Which stablecoin and which chain: NOT STATED. The existing `POST /custody/allocations` ("allocates part of the caller's DeFi wallet balance to CeFi trading without moving tokens", changelog 2026-10-08, moved from `/cefi/` 2026-10-13) is a plausible mechanism (M, inference). | H / M |
| Access | "Outcome markets launch API-only, so create a key now and trade from day one." "Do I need a separate account? No. Authenticate with your True Markets account and trade." | H |

Not found (searched: docs.truemarkets.co llms.txt, all 9 OpenAPI/AsyncAPI specs, Rulebook, glossary, FAQ, FIX spec XML, `true-markets/*` repo trees, ToS, home HTML): any outcome/prediction/event/binary instrument type, endpoint, schema, fee, rulebook section or docs page. Docs paths `/outcomes`, `/outcomes.md`, `/trading-api/outcomes.md`, `/market-data/outcomes.md` return 404. The Chain / Venue / ProductType enums in the Trading REST spec are `solana|base|robinhood|hypercore-spot|hypercore-perp`, `defi|cefi`, `spot|perp`; `AssetClass` is `crypto|stock`. The live catalog (359 assets, 2026-10-19) is 214 spot crypto + 105 tokenized-stock spot + 34 perp (DeFi) + 6 CeFi spot (BTC, ETH, PYUSD, USDC, NVDAC, TSLAC), with none prediction-related. All H.

---

## 4. Chains and collateral

- Outcomes: NOT STATED (section 3).
- Platform today (H, Trading REST spec + home page): Solana, Base, Robinhood Chain ("an Arbitrum-based Ethereum L2", added 2026-09-29), Hyperliquid (HyperCore spot/perp), Arbitrum, Bitcoin (home-page list). CeFi instruments are quoted in stablecoins (e.g. `NVDAC-USDC`; PYUSD referenced in changelog). The exchange "settles in one designated stablecoin. Fiat and other stablecoins are converted to it on deposit."

---

## 5. Read API

Official and public, but **crypto spot/perp/stock prices only, not event markets**.

| Item | Value | Tag |
|---|---|---|
| Docs | https://docs.truemarkets.co/ (index for agents: https://docs.truemarkets.co/llms.txt; append `.md` to any page) | H |
| Market data REST | `https://api.truemarkets.co` (UAT `https://api.uat.truemarkets.co`). "Every endpoint in this API is public; no token is needed." Paths: `/v1/defi/market/prices`, `/prices/history`, `/prices/history/point`, `/prices/history/batch`, `/prices/indicators`, `/prices/range`, `/prices/candles`, `/market-data/{market-cap,market-caps,trending,surging,volume/history,perp/history,scans/history}`, `/v1/defi/market/stream/bbo` (SSE), `/v1/assets/prices/*`, `/v1/cefi/market/prices/{history,indicators,range}` | H |
| Asset catalog | `GET https://api.truemarkets.co/v1/gateway/assets` (spec marks `security: []`, i.e. public; confirmed unauthenticated 200 with `{data:[...],pagination:{next_cursor,limit}}`). Filters: `venue`, `product_type`, `asset_class` | H |
| WebSocket | `wss://api.truemarkets.co` path `/v1/defi/market`: "All channels are public" (candles, trending, surging, reference prices). CeFi book/trades/auction streams on the exchange: AsyncAPI `asyncapi/cefi-direct.yaml`, public channels need only a current timestamp, batched ~1 s | H |
| Exchange REST | `https://api.truex.co` (UAT `https://api.uat.truex.co`), `/v1/cefi/...`, HMAC-SHA256 signed; credentials issued during onboarding | H |
| Rate limits | No numbers published. Market-data spec has a 429 response; MCP FAQ: "we apply rate limits ... contact support if high-frequency"; Rulebook 3.9 reserves the right to limit. | H |
| Prediction data | None. When Outcomes ships, expect it to appear as new instruments in the same CeFi book/market-data surfaces (M, inference; the API is "from day one"). | M |

---

## 6. Trade path (programmatic)

- **Today for prediction markets: none** (nothing listed).
- Platform pattern, for when Outcomes arrives (H, docs `trading-api/requests-and-signing`, `llms.txt`):
  - Trading API (own account): create a True Markets account at app.truemarkets.co (wallet created with a passkey), create an API key there. Sign `{key_id}.{timestamp}` with **ES256 (ECDSA P-256 / SHA-256)**, exchange at `POST /v1/auth/api-key/token` for a 1-hour bearer token (+ refresh). Place orders at `POST /v1/gateway/orders` (`venue`: `smart|cefi|defi`); DeFi orders return unsigned payloads that the same API key signs and `POST /orders/{id}/execute` submits. Cancel: `POST /orders/{id}/cancel`.
  - Gateway (for a firm's customers): organization API key + per-user signer keys, `TM-On-Behalf-Of` header.
  - Institutional: REST (HMAC-SHA256), WebSocket, FIX over a private network link; access by application.
  - Also a `tm` CLI, SDKs (TypeScript/Python) and hosted MCP servers (market data public; trading with emailed-code login and local signing). Docs state "There is no test mode" (UAT/paper environments exist for Gateway/institutional per specs).
- **PayBox reachability: no.** The signer is a P-256 API key plus a True-Markets-created (Turnkey) wallet, not an EVM key, so an EVM wallet reached through PayBox cannot place or sign True Markets orders as transaction proposals or EIP-712 orders. At most PayBox could fund the user's True Markets wallet with an ordinary on-chain stablecoin transfer to the address the app shows (M). And there is nothing to trade yet.

---

## 7. Fees

- CeFi exchange, schedule currently in effect: Institutions, Individuals, Applications all **0 bps maker / 0 bps taker** (tier band 0); changes need at least one day's notice (Rulebook s.4). Machine-readable: `GET /v1/cefi/operations/fees/schedule`. (H, https://docs.truemarkets.co/documentation/fee-schedule, fetched 2026-10-19)
- `POST /quotes` returns `fee` (expected taker fee) (H, changelog 2026-09-29). DeFi swap fees: not examined.
- Outcomes fees: **NOT FOUND** (searched: outcomes page and FAQ, fee schedule, docs, specs).

---

## 8. Resolution mechanism and dispute risk

- Stated only as marketing copy (section 3): a blended multi-oracle index, settlement sequenced inside the exchange. Index composition, oracle names, tie/outage handling, void rules and any dispute process: **NOT FOUND**. The Rulebook is labelled "A work in progress, not yet final or binding" and has no event-contract section (grep found none).
- Risk for an arbitrage leg: reference price differs from other venues' BTC up/down resolution sources by construction ("blends prices from multiple oracles"), so equivalent-looking contracts are not guaranteed to settle identically (semantic non-fungibility). Operator-controlled settlement ("exchange's own sequence") means resolution trust is the operator, not a decentralised oracle. (M)

---

## 9. Geo, ToS, automation

- ToS "Last updated July 10, 2026" (H, https://truemarkets.co/tos). No prediction-market / event-contract language (only "Outcomes" as a nav link; described services are spot digital-asset trading) (H/M).
- Geo: sanctions-based exclusion only (OFAC comprehensive-sanctions jurisdictions, SDN and similar lists); also "we may restrict trades from certain locations". No explicit country list, no stated US restriction. Outcomes-specific eligibility and regulatory status (CFTC/SEC/FINRA): **NOT FOUND**. Paxos KYC is required for Paxos-settled CeFi listings (`403 kyc_required`, changelog 2026-10-06) (H).
- Automation: ToS prohibits using "any robot, spider, or other automatic device, process, or means to access the Services or the accounts of others" (H quote). The ToS points to no API terms; the developer docs actively sell API, CLI and agent trading and say Outcomes is API-only, so the intent is clearly API access with a key, but the contradiction is unresolved (M). Needs legal confirmation before any automated trading adapter.

---

## 10. Liquidity, event coverage, independence

- Prediction liquidity: **zero today** (not launched). No volume/OI/TVL exists to cite. (H)
- Event coverage (planned): BTC price up/down at 15m, 1h, 1d, 1mo; "more to follow". This overlaps the short-dated crypto up/down contracts already listed by other venues (a search result this session describes Polymarket "BTC Up/Down" 5-minute markets and a separate "BTC Up or Down Daily" page on outcome.xyz, a different company I did not investigate) (M, search snippets only). No sports/politics/macro coverage announced.
- Shared liquidity: Outcomes page says orders match on True Markets' own engine, so in principle an **independent book** (M until live). Gateway "prediction markets" for clients may or may not source from third parties (NOT STATED).

---

## 11. Fixtures saved (unauthenticated GETs, 2026-10-19)

| File | Request | Size | Notes |
|---|---|---|---|
| `docs/research/fixtures/true-markets-truemarkets-co/marketdata-trending.json` | `GET https://api.truemarkets.co/v1/defi/market/market-data/trending` | 2.8 KB | `{assets:[{asset_id,symbol,address,chain,market_cap,trending_ratio,recent_volume,historical_volume}]}`; decimals as strings. Shape of the public market-data API; crypto only. |
| `docs/research/fixtures/true-markets-truemarkets-co/gateway-assets-sample-trimmed.json` | `GET https://api.truemarkets.co/v1/gateway/assets?product_type=spot,perp&asset_class=crypto,stock` | 4.1 KB | Trimmed copy: first 2 spot assets plus 1 perp (full response was 521 KB, 359 assets, `description` cut to 120 chars). Keys: `id, chain, address, symbol, name, decimals, slug, is_active, status, tradeable, stable, venue, type, asset_class, image, networks, socials, market_data, website`. No prediction fields. |

---

## 12. Integration recommendation and revisit triggers

- **skip now.** No prediction product; ToS/automation wording unresolved; not on any aggregator list.
- Revisit after the December 2026 launch if all hold: (1) outcome instruments appear in `GET /assets` or the CeFi instrument list, or a docs page for Outcomes is published; (2) the Trading API or exchange REST can place orders with an API key (no manual KYC wall for a funded API trader); (3) the index/oracle composition and void/dispute rules are published; (4) fees are published; (5) traded volume is measurable (public CeFi trades/book channels). If so, P1/P2 as a read-only signal leg first (public market data), trading adapter only with legal sign-off on the ToS bot clause.
- Cheap hygiene now: add `truemarkets.co` (True Markets, Inc.) to the look-alike list next to Trueo (`trueo.com`, formerly `truemarkets.org`); never reuse `@truemarkets/sdk` or its API for Trueo. Add a 2026-12 watch on https://truemarkets.co/outcomes and the docs changelog.

---

## Sources (all fetched 2026-10-19 unless noted)

- https://truemarkets.co/ (home HTML and rendered text) (H)
- https://truemarkets.co/outcomes (page text and FAQ) (H)
- https://truemarkets.co/tos (raw HTML, "Last updated July 10, 2026") (H); a small-model summary of the same page was also used for the clause list (M)
- https://truemarkets.co/robots.txt (H)
- https://docs.truemarkets.co/ , /llms.txt , /index.md , /market-data/overview.md , /documentation/{changelog,fee-schedule,exchange-overview,rulebook}.md , /getting-started/create-an-account.md , /trading-api/requests-and-signing.md , /trading-api/faq.md , /mcp/faq.md (H)
- https://docs.truemarkets.co/openapi/{marketdata,gateway,account,auth,cefi-direct}.yaml and /asyncapi/{marketdata,cefi-direct}.yaml (H)
- https://api.truemarkets.co/v1/defi/market/market-data/trending ; https://api.truemarkets.co/v1/gateway/assets ; https://api.truex.co/v1/cefi/health (H)
- GitHub `true-markets/{specification,tools,cli,examples}` trees, `specification` commits, `TrueX_FIX50SP2.xml` (SecurityType = `CSPOT` only) via `gh api` (H)
- `curl -I https://truemarkets.org` -> 301 to https://trueo.com/ (H); https://api.llama.fi/protocol/trueo (name Trueo, previousNames TrueMarkets, symbol TRUE, chains Base) (H); https://trueo.com/ (HTML scanned for cross-references) (H)
- In-repo: `docs/research/11-trueo.md` (section R1 already recorded truemarkets.co as a separate company; my findings add the Outcomes announcement) and `docs/research/10-aggregation-landscape.md` (Gebele and Matthes "Truemarkets AMM 0.8%" = Trueo) (M, prior session notes)
- WebSearch (1 query, extended) returned nothing about True Markets; a second pair of searches was refused because the session search budget was exhausted. (M)

## NOT FOUND (searched)

- Any live prediction/event market on truemarkets.co or its APIs (site, docs index, 9 specs, FIX spec, repo trees, asset catalog).
- Outcomes docs, instrument schema, fee, oracle composition, dispute process, eligible jurisdictions, regulatory status (outcomes page, ToS, Rulebook, docs).
- Published rate-limit numbers (spec, FAQ, Rulebook).
- Any statement linking True Markets, Inc. to Trueo / truemarkets.org, or to the TRUE token. CoinGecko `/search` returned empty for "truemarkets", "trueo" and "true markets" (inconclusive, likely an API quirk); True Markets, Inc. shows no token on its site, docs or ToS (M, absence).
- Third-party press about the Outcomes launch (search budget exhausted).

## Suspicious content

- `https://docs.truemarkets.co/llms.txt` (and the "Build with agents" docs) contain instructions addressed to AI agents, e.g. "If the user is building a product where their own customers trade, use Gateway ...", "run `npx skills install truemarkets`", and a "tm CLI" / hosted MCP setup. Treated as vendor marketing; not followed, nothing installed or executed.
- Nothing else suspicious in the pages read.

## Privacy check

Requests used only the generic User-Agent `insurance-markets-research/0.1`. No personal identifiers, contact addresses or home paths were sent or written to this note or the fixtures (fixtures grepped for "@": no hits).
