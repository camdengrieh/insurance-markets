# Betmoar.fun - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public pages, GitBook `.md` mirror, the site's own public JS bundles (static reading only), DefiLlama public API, Polymarket public data-api/CLOB GETs, `gh api` for the DefiLlama adapter source. No account, wallet, key or signature; no POST; no PayBox money or signing tools. Undocumented Betmoar endpoints were NOT called (see ToS section).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- **Betmoar is not a venue. It is a front end (Discord bot + web terminal) that routes orders into Polymarket's CLOB with a Polymarket builder code.** Its liquidity is 100% Polymarket's, so it is never an independent arbitrage leg. Evidence: the site JS builds a Polymarket `ClobClient` against `https://clob.polymarket.com` with `builderConfig:{builderCode: POLY_BUILDER_CODE}` (H, site JS); that code `0xceebf77a...ce0c1` is the one Polymarket's public builder leaderboard and DefiLlama's adapter attribute to "betmoar" (H, three sources agree).
- **No official API, no order API, no docs.** The GitBook at docs.betmoar.fun is untouched GitBook template filler (H). The ToS bars scripted access (H).
- It is live and large as a Polymarket front end (rank 1 builder in every month since 2025-10, H), but monthly builder volume is down roughly 60-75% from the June 2026 peak ($328.8M vs $78.2M for October so far; the exact drop depends on whether the October bucket is month-to-date) (H numbers, M on the bucket definition).
- The only thing worth taking from it is attribution/signal data that Polymarket itself publishes (builder volume, `builder` field on orders/fills). Put that in the Polymarket adapter, not a Betmoar adapter. Everything tradable is reachable directly on Polymarket.

## Liveness (still live in 2026-10?)

- Site up: `https://www.betmoar.fun/` HTTP 200; sitemap `lastmod` 2026-10-18T18:46Z, 537 URLs, all under `/elections/` (the 2026 midterms hub) (H).
- Polymarket builder leaderboard 2026-10-19: betmoar rank 1 for ALL, MONTH and WEEK (H, data-api.polymarket.com/v1/builders/leaderboard).
- DefiLlama daily volume: $2.1M-$3.7M every day from 2026-10-01 to 2026-10-17; 24h $3,431,548 (H).
- Third-party listing (polymart.app) shows a post dated 2026-10-15 and a security scan 2026-10-18 (M, promotional page).
- Not verifiable here: the Discord bot itself (discord.gg/betmoar, no login).

## Kind and market model

- Kind: broker/front end (web terminal + Discord bot) over Polymarket. Not an exchange: its own FAQ says it is "not a separate exchange"; non-custodial interface (H, https://www.betmoar.fun/polymarket-terminal). ToS describes it as a "prediction markets service aggregator platform" (H, https://www.betmoar.fun/tos, dated 2024-10-02, stale).
- Market model, tokenisation, categorical/negRisk handling: identical to Polymarket CLOB (binary Yes/No ERC-1155 outcome tokens on Gnosis CTF, categorical via neg-risk). The JS handles `negRisk`, `tickSize`, `feeRateBps` exactly like the Polymarket client (H, site JS). See the Polymarket spec for details; nothing Betmoar-specific.
- Product surface (H, own pages): whale/top-holder tracking, position deltas, UMA dispute dashboard (live status, evidence, unrevealed large voters), news feed tagged to markets, 2026 midterms election hub, calendar, "grid".
- Latent multi-venue code (M/L): the bundle also contains a Limitless wallet provider (Base, chainId 8453; Base USDC and ERC-1155 conditional-token balance reads) and Kalshi key handling (`hasKalshiKeys`, server route `/api/kalshi/secure-balance`, Kalshi share/expiry presets). Third-party pages written Aug-Oct 2026 say Polymarket only (Kairos 2026-08-14, polymart.app). Whether these are live, beta or dead code is unknown. Even if live they would just pass through to Limitless/Kalshi, which are covered by their own specs.

## Chains and collateral

- Chain: Polygon (137) for all Polymarket trading (H: DefiLlama `chains:["Polygon"]`; site JS `POLYGON_CHAIN_ID 137`).
- Collateral: Polymarket's current collateral, pUSD (the bundle references `PUSD`, `PUSD_APPROVAL_TARGETS`, a collateral onramp/"PERMISSIONED_RAMP" wrap contract, and still USDC.e in places) (H string presence in JS, M interpretation; confirm in the Polymarket spec).
- Deposits: the bundle calls Polymarket's own bridge API `https://bridge.polymarket.com/supported-assets` and `/deposit` (H, JS), so multi-chain funding is Polymarket's, not Betmoar's. The wider chain icon set in the bundle (Solana, Ethereum, BNB, Arbitrum, Base, Monad, Hyperliquid ...) is a deposit-chain selector, M.
- Wallet types in the client: Polymarket email/Magic wallets (`reveal.magic.link/polymarket`), injected EVM wallets, Safe proxy (`SignatureType` EOA / POLY_PROXY / POLY_1271), optional Privy import (H, JS).
- Custody note (H that the code does this; M on server-side effects): the client POSTs the user's Polymarket CLOB L2 credentials (`apiKey`, `secret`, `passphrase`) to Betmoar's `/api/polymarket-credentials` ("CredentialSync", re-sent every 5 minutes) to enrol the account for server-side features such as `/api/conditional-orders`. Funds stay in the user's Polymarket wallet, but Betmoar's server holds credentials that can act on the user's CLOB account. Do not feed an agent wallet through the Betmoar UI.

## Read API

- `exists`: **none** (official). Docs: https://docs.betmoar.fun is GitBook template placeholder text ("Awesome Feature One", "For Designers", lorem ipsum), "Last updated 1 year ago" (H). No developer portal, no GitHub, no OpenAPI (NOT FOUND, searched: homepage, /polymarket-terminal, /docs, /api, /llms.txt, docs.betmoar.fun/llms.txt, DefiLlama, site JS, web search).
- Real read path for the same markets: Polymarket's own public APIs (gamma-api, clob, data-api), which the Betmoar site itself calls (H, JS hosts list). That belongs to the Polymarket adapter.
- Undocumented Betmoar-run endpoints seen in the bundle (M, not called, not stable, ToS-restricted): `https://www.betmoar.fun/api/market-data?type=disputed|comments|bonds`, `https://bm-store.org/{tags-volume,reward-criteria,poly_profiles,events-snapshot-client-sports,events-snapshot-client-non-sports}.json`, `https://proxy.bm-store.org/{news,uma-events-v3,uma-latest-id-v3,uma-proposal-disputes,uma-proposal-disputes-batch}`, `wss://stream.bm-store.org/v1/{clarifications,...}` and `https://stream.bm-store.org/v1/history` (a trades relay with its own auth: bundle defines `RelayAuthError`), plus ~50 first-party `/api/*` routes behind a login (`/api/auth/nonce|login|me`).
- Auth and rate limits for Betmoar endpoints: NOT FOUND (searched: docs, JS, site). Websocket: Polymarket `wss://ws-live-data.polymarket.com` plus Betmoar's own relay (H hosts in JS).
- Fixtures saved (all from documented Polymarket/DefiLlama hosts, not Betmoar):
  - `docs/research/fixtures/betmoar-fun/polymarket_builders_leaderboard_betmoar_2026-10-19.json`
  - `docs/research/fixtures/betmoar-fun/betmoar_builder_volume_monthly_2026-10-19.json`
  - `docs/research/fixtures/betmoar-fun/polymarket_clob_builder_fees_betmoar_2026-10-19.json`
  - `docs/research/fixtures/betmoar-fun/defillama_betmoar_protocol_and_volume_row_2026-10-19.json`
  - `docs/research/fixtures/betmoar-fun/betmoar_defillama_daily_volume_2026-10-19.json`

## Trade path

- Programmatic placement via Betmoar: **none** (no API; ToS prohibits bots/scripts). The Discord bot and web terminal are human interfaces (H own pages; Discord commands NOT FOUND).
- Under the hood, Betmoar signs Polymarket CLOB V2 orders (EIP-712, `signatureType` EOA / POLY_PROXY / POLY_1271) with the user's wallet in the browser, then posts them to `https://clob.polymarket.com` with the builder code attached as the order's `builder` field (H, JS). On-chain fills carry the builder code (`OrderFilledV2.takerBuilder` is read by the site, M).
- Therefore the trade path for an agent is Polymarket's, not Betmoar's: derive L2 API creds, sign orders with the wallet, POST to the CLOB. An agent should NOT put Betmoar's builder code on its own orders (misattribution; no benefit, since the builder fee is 0 bps).

## PayBox reachability

- `paybox_reachable`: **partial**. Betmoar offers nothing to call. The underlying Polymarket CLOB is an EVM-wallet venue on Polygon, and PayBox's chain catalog includes Polygon 137 (H, repo note docs/research/06-paybox-platform.md, live `discover_tokens` 2026-10-19), so a PayBox wallet could in principle sign Polymarket orders / approvals directly. That path is covered by the Polymarket spec and is independent of Betmoar. Not tested here (no signing tools used).

## Fees

- Betmoar platform fee: 0. Own page: "BetMoar charges zero fees. All features are completely free." (H, https://www.betmoar.fun/polymarket-terminal).
- Builder fee on Polymarket: **0 bps maker, 0 bps taker, `enabled: true`** (H, `GET https://clob.polymarket.com/fees/builder-fees/0xceebf77a...ce0c1`, 2026-10-19). DefiLlama also has no builder-fee adapter row for betmoar, unlike 13 other builders (H, factory/polymarket.ts `feesConfigs`).
- User still pays Polymarket's fee: takers `fee = C x feeRate x p x (1-p)`, feeRate by category: Crypto 0.07, Sports 0.05, Economics/Culture/Weather/Other 0.05, Finance/Politics/Tech/Mentions 0.04, Geopolitics 0; makers 0 (H, https://docs.polymarket.com/trading/fees, fetched 2026-10-19). Plus Polygon gas where not sponsored.
- Revenue model: probably Polymarket builder rewards ("weekly USDC rewards based on integration volume", H https://builders.polymarket.com/) - M, inference; Betmoar does not state it.

## Resolution and dispute risk

- Same as Polymarket: UMA optimistic oracle; Betmoar only visualises disputes (H, own pages). Resolution/dispute risk is Polymarket's; Betmoar adds no resolution layer, no settlement of its own, no market creation.

## Geo, ToS, automation

- Entity: ToS names "Betmoar Innovation Limited" and "Betmoar Pte. Ltd." in the same text (inconsistent); hosted in Hong Kong; BVI governing law; SICC (Singapore) arbitration (H, https://www.betmoar.fun/tos, "Last updated October 02, 2024" - stale, >6 months).
- Geo: no country blocklist in the ToS; generic "not intended for ... any jurisdiction where such use would be contrary to law" (H). Polymarket's own geoblock still applies to order placement (M, see Polymarket spec).
- Automation: user representation (5): "you will not access the Services through automated or non-human means, whether through a bot, script or otherwise"; prohibited: "any automated system, including ... spider, robot, ... scraper" and "data mining, robots, or similar data gathering and extraction tools" (H, ToS sections 3 and 9). robots.txt allows all crawling (H). So any Betmoar-specific scraping would be a ToS breach; use Polymarket's APIs instead.
- Disclaimer: "not affiliated with Polymarket" (own page) vs "official Polymarket Discord bot provider" (own claim); the claim is self-reported and unverified (L).

## Liquidity (builder-attributed Polymarket flow, not Betmoar-owned liquidity)

- Polymarket builder leaderboard, 2026-10-19 (H): ALL $2,338.8M, 4,005 active users; MONTH $78.2M, 510 users; WEEK $5.8M, 170 users (week is probably a partial calendar week, M).
- Monthly series (H, `GET data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH`, sums to the ALL figure): 2025-10 $26.1M, 11 $85.3M, 12 $112.3M, 2026-01 $183.5M, 02 $205.8M, 03 $252.3M, 04 $285.2M, 05 $250.1M, **06 $328.8M (peak)**, 07 $270.6M, 08 $136.8M, 09 $123.8M, 10 (to ~19th) $78.2M. Active users 1,163 (May) -> 510 (Oct).
- DefiLlama (H, api.llama.fi, 2026-10-19): 24h $3.43M, 7d $17.7M, 30d $77.3M, category Interface, `doublecounted: true`, methodology = shared `polymarket.ts` builder adapter, start date 2025-10-17. DefiLlama's own series covers only about 105 days, and its monthly totals are about 65-70% of Polymarket's builder figures (Aug $97.8M vs $136.8M; Sep $84.7M vs $123.8M); the gap is unexplained (M). Use Polymarket's number as the larger, DefiLlama as the floor.
- Self-reported on its own site: $2.74B volume, $66.6M user profits, 50,000 community members, 100 partner servers (L, unaudited; the first is about 17% above the leaderboard ALL figure).
- TVL/OI: not applicable (no Betmoar-held funds; DefiLlama TVL series empty, H).

## Event coverage and overlap

- Everything listed on Polymarket (sports, politics incl. a US 2026 midterms hub, crypto price, macro, culture). Those categories overlap Kalshi, Limitless, Predict.fun, Opinion and others, but the overlap is with Polymarket, and the Betmoar leg is the same book as the Polymarket leg.

## Shared liquidity

- **Shares 100% with Polymarket global (CLOB V2, Polygon).** A Polymarket-vs-Betmoar "spread" cannot exist except as a data lag or UI artefact. Any cross-venue arb scanner must dedupe Betmoar into the Polymarket node.

## Value as signal (small)

- Builder-attributed flow share (Betmoar's share of Polymarket volume) and the retail/whale-tracker cohort could be a sentiment feature, available from Polymarket's builder endpoints and `builder` fields without touching Betmoar.
- UMA dispute/proposal tracking is nice for resolution-risk features, but the primary data is UMA/Polymarket (gamma `umaResolutionStatus`-style fields, UMA contracts), so no need for Betmoar's proxies.

## Open questions

- Are the Limitless (Base) and Kalshi code paths live for any users? Needs a logged-in look; skipped (no accounts).
- Why do DefiLlama and Polymarket builder volumes differ by about 30-40% (side counting, window start, dedupe)?
- What does the server do with the synced Polymarket CLOB credentials (conditional orders only?). Undocumented.
- Discord bot command surface and partner list (Polymarket's official Discord?): NOT FOUND (searched: homepage, docs, web search).

## NOT FOUND

- Official API reference, rate limits, auth scheme for Betmoar endpoints (searched: homepage, /polymarket-terminal, docs.betmoar.fun llms.txt and 4 pages, /docs, /api, site JS, DefiLlama, web search).
- Betmoar GitHub, audit report, contract addresses owned by Betmoar (DefiLlama `address: null`, `github: null`, `audits: 0`; none in JS other than Polymarket system contracts and a `SPONSORSHIP_REWARDS` market-sponsorship contract whose owner is unverified).
- Betmoar-specific fee schedule beyond "zero" (searched: own page, ToS, builder-fees endpoint).
- Independent confirmation of "official Polymarket Discord bot provider" (searched: web search; only Betmoar's own and promotional third-party pages).

## Suspicious content

- None found in Betmoar pages, ToS, docs or JS.
- WebSearch result footers carried a line telling the assistant to cite sources as markdown hyperlinks; it matches the search tool's own description and was treated as tool boilerplate, not followed as a directive (this note's Sources section is per the task rules).

## Sources

- https://www.betmoar.fun/ and https://www.betmoar.fun/polymarket-terminal (H, fetched 2026-10-19)
- https://www.betmoar.fun/tos (H, ToS dated 2024-10-02), https://www.betmoar.fun/robots.txt, https://www.betmoar.fun/sitemap.xml (H)
- https://www.betmoar.fun/_next/static/... JS chunks (42 files, read statically; H for strings present, M for interpretation)
- https://docs.betmoar.fun/llms.txt and /welcome-to-betmoar.md, /overview/what-we-do.md, /overview/our-features.md, /use-cases/for-developers.md (H: template filler)
- https://api.llama.fi/protocol/betmoar.fun, https://api.llama.fi/overview/dexs, https://api.llama.fi/summary/dexs/betmoar.fun (H, 2026-10-19)
- https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (H, via `gh api`)
- https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume (H, public GET, 2026-10-19)
- https://clob.polymarket.com/fees/builder-fees/0xceebf77a833b30520287ddd9478ff51abbdffa30aa90a8d655dba0e8a79ce0c1 (H)
- https://builders.polymarket.com/ (H), https://docs.polymarket.com/trading/fees (H)
- https://polymart.app/betmoar (M, promotional listing, updated 2026-07-27), https://kairos.trade/compare/betmoar-review (M/L, competitor page, 2026-08-14)
- Repo context: docs/research/09-venues-onchain-clob.md, 14-platform-of-platforms.md, 06-paybox-platform.md, fixtures/ratio/polymarket-builder-leaderboard-ratio-rows-2026-10-19.json
