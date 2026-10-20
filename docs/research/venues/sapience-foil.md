# Venue spec: Sapience (Foil) (sapience.xyz, foil.xyz)

Researched 2026-10-19. Read-only: GET requests, official docs and site, public GitHub files via `gh api`, one `discover_tokens` PayBox read. No wallet, no signing, no accounts. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that.

## Verdict

| Item | Value |
|---|---|
| Adapter priority | **skip** |
| Still live (2026)? | **Not as described.** The Foil product (gas/blobspace resource markets) is gone from the app. The Sapience-on-Ethereal deployment has dead API and relayer hosts. What remains is a front end for Meridian's deployment of the same protocol on Robinhood Chain. [H] |
| Independent leg? | **No.** Same protocol, backend and liquidity as Meridian Predict, whose markets are mirrors of Polymarket and Kalshi events [H/M, see Shared liquidity] |
| Read API | Documented API (`api.sapience.xyz/graphql`) is **dead**. Live equivalent is Meridian's public GraphQL, whose schema no longer matches the Sapience docs [H] |
| Trade path | RFQ auction over WebSocket plus on-chain `mint()`; no plain order API [H] |
| PayBox reach | **No** for the documented Sapience/Ethereal chain (5064014 not in the PayBox catalog). The Robinhood deployment (4663) is partial and belongs to the Meridian spec [H] |

Why skip: the awesome-list entry the lead came from ("Sapience (Foil) ... AMM, Base, Ethereum, resource markets ... UMA-resolved ... Live") is stale on every field. Foil's gas/blobspace pages 404. Sapience then became an RFQ parlay venue on Ethereal, and by July to August 2026 the project moved its app to Robinhood Chain under Meridian. Build the Meridian adapter question from `docs/research/venues/meridian-predict.md` (itself "skip"); do not build a Sapience adapter.

## Lineage and liveness evidence

Timeline (all [H] unless marked):
- **Foil era (2024 to early 2025).** Repo `sapiencexyz/sapience` created 2024-01-12; early commits are Foil contracts (`FoilNFT`, epochs, account/position renames) and a UMA package from 2024-07/08 [H, GitHub commit list]. `docs.foil.xyz` still serves 200 and describes "a fully decentralized marketplace connecting producers of onchain computing resources with consumers" (gas and blobspace; L1 plus an unnamed L2), with no shutdown notice [H, https://docs.foil.xyz/].
- **Pivot to prediction markets (April 2025).** Commits "sapience" (2025-04-07) and "Mainnet prediction markets" (2025-04-10) [H].
- **Sapience on Ethereal (2025 to mid 2026).** RFQ auctions, USDe collateral, Ethereal appchain (chain 5064014) [H, docs.sapience.xyz].
- **Move to Robinhood Chain / Meridian (2026-06-26 to 2026-09-08).** Commits: "Pin the app to the Robinhood (Meridian) deployment" (2026-08-03), "Remove forecast UI, which the Meridian API cannot serve" (2026-08-05), "Flatten the monorepo into a single Next.js app on the Robinhood deployment" (2026-09-08, latest push). One-time migration of Ethereal sessions to Robinhood defaults (2026-07-02) [H]. Commit volume per month: 942 (2026-03), 346 (05), 95 (07), 22 (08), 1 (09) [H, computed from the commit list].
- App README today: "A Next.js client for the Sapience prediction market on the Robinhood (Meridian) deployment. ... Only the vault page transacts" [H, fixture `sapience-app_README_head_2026-10-19.txt`]. Default endpoints are `https://api.predict.meridian.xyz/graphql` and `https://relayer.predict.meridian.xyz/auction`; Ethereal endpoints survive only as an opt-in Settings preset [H, fixture `sapience-app_networkDefaults.ts_2026-10-19.txt`].

Live checks on 2026-10-19:
- `www.sapience.xyz` serves a nav shell with Markets, Vaults, Leaderboard, Analytics, Feed, Settings and a "Trade on Meridian" link to meridian.xyz; no banner about migration [H, WebFetch].
- `www.sapience.xyz/vaults` 200. `/terminal`, `/bots`, `/subscribe`, `/earn/ethereum-gas`, and the Foil trade link `/markets/8453:0x20ba...f3205/periods/1/trade` (linked from foil.xyz) all **404** [H, curl].
- `foil.xyz` 308 to `www.foil.xyz`, which still advertises "Gas and Blobspace with Stable Pricing" with Subscribe/Trade/Earn links into sapience.xyz, i.e. a stale marketing page whose three links 404 [H, WebFetch + curl].
- `api.sapience.xyz` and `relayer.sapience.xyz` are CNAMEs to Railway hosts. Both serve a `*.up.railway.app` wildcard certificate (strict TLS fails: hostname mismatch) and, with verification off, return HTTP 404 `{"status":"error","code":404,"message":"Application not found"}` with `x-railway-fallback: true`. The backend service is gone [H, fixture `dead_hosts_api_relayer_2026-10-19.txt`].
- `docs.sapience.xyz` still documents Ethereal and the dead hosts. Its ToS page says "Last Updated: February 1, 2025" (**stale**, over 6 months) [H].
- npm `@sapience/sdk`: latest 0.2.0 published 2026-01-05, two versions ever. The docs call the SDK "the source of truth", but the repo now vendors it, so the npm package is stale [H, registry.npmjs.org].
- The Sapience blog (`blog.sapience.xyz`) rendered no posts to the fetcher, so no announcement was found. NOT FOUND (searched: blog.sapience.xyz, docs, README, app). The X account was not fetched; the web search budget was exhausted mid-task, so announcements on X/Discord are unchecked.

Whether the Ethereal escrow still holds open positions is NOT verified (would need JSON-RPC, which is a POST; skipped under the read-only rules).

## Market model [H, docs.sapience.xyz as of the Ethereal era]

- **Not an order book, not an AMM.** RFQ auction: a requester broadcasts picks plus a position size, responders return EIP-712-signed bids (their stake, expiry), the requester picks one, and `PredictionMarketEscrow.mint()` pulls both stakes and mints the position [H, /user-guide/trading/auctions, /builder-guide/api/auction-relayer].
- **Binary conditions only** (Yes/No questions). A prediction is 1..N "picks" (condition + predicted outcome); **all picks must hit** (parlay). Pick wire format: `{conditionResolver, conditionId, predictedOutcome: 0|1}` [H].
- **Tokenisation.** Docs: "mints NFTs representing each position" (predictor and counterparty). Meridian's deployment exposes `predictorToken` / `counterpartyToken` ERC-20s [H on each statement; the difference is probably a contract revision, M]. Winner burns the token to claim the pooled stake. Odds are fixed at mint; implied probability = counterparty stake / total stake.
- Secondary market: atomic OTC swap of position tokens over the same WebSocket (`secondary.*`) [H]. Liquidity vaults: pooled USDe deposited, manager bids on auctions, request-based deposit/withdraw, ERC-20 shares [H, /user-guide/liquidity-vaults].
- The original Foil model (Uniswap-based resource-price markets, UMA settled) is no longer reachable in the app [H, 404s above]; details of its AMM design: NOT FOUND (searched: docs.foil.xyz home page only).

## Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Documented mainnet | Ethereal, chain **5064014** (appchain). Escrow `0xe7e515FC1DF93565A47770a4110f4366E26a2D3F`; collateral wUSDe `0xB6fC4B1BFF391e5F6b4a3D2C7Bda1FeE3524692D` (18 decimals) | H |
| Other chains in the address table | Arbitrum 42161 (wUSDe + `PredictionMarketBridgeRemote`: position-token bridging), Polygon 137 (`ConditionalTokensReader` contracts) | H |
| Live deployment now | Robinhood Chain 4663, collateral USDe (ERC-20), same protocol; see `meridian-predict.md` | H |
| Collateral | Ethena USDe (Ethereal used it as native gas and, wrapped, as collateral) | H |
| Foil-era chains | Base (8453) appears only in the stale foil.xyz trade link; Ethereum/L2 in docs.foil.xyz. Not live | M |

## Read API

| Item | Detail |
|---|---|
| Documented | Official-public GraphQL `https://api.sapience.xyz/graphql` (sandbox at the same URL), "currently public; please be considerate and cache" [H, /builder-guide/api/graphql]. **Dead on 2026-10-19** (see above). |
| Relayer (WebSocket) | Documented `wss://relayer.sapience.xyz/auction`. **Dead.** Protocol (still valid on Meridian's host): `identify`, `auction.start`, `auction.started`, `bid.submit`, `bid.ack`, `auction.bids`, `secondary.*`, `vault_quote.subscribe`; limits 100 msgs per 10 s per connection, 64 KB messages, 50 connections per IP, 5 min idle (send `{type:'ping'}`) [H docs]. |
| Live equivalent | `https://api.predict.meridian.xyz/graphql` (testnet `api.predict.meridiantest.net`) and `wss://relayer.predict.meridian.xyz/auction`, listed in docs.meridian.xyz/protocol-reference/api-hosts [H]. No auth; rate-limit and pagination details are in `meridian-predict.md`. |
| Schema drift | The Sapience docs' example query (`questions(take:, sortField:, sortDirection:)` selecting `questionType`, `predictionCount`, `condition`, `group`) **fails validation** on the Meridian host (`Unknown argument "take"`, `Cannot query field "questionType" on type "QuestionConnection"`). Sapience's older docs and the live schema are not interchangeable [H, fixture `sapience_docs_example_query_vs_meridian_host_response_2026-10-19.json`]. |
| Confirmed shape | Meridian `conditions(first, orderBy, filter)` returns `conditionId, question, endTime, chainId, settled, estimatedPrice, openInterest (18-decimal wei string), marketType, outcomes, similarMarket{markets}` [H, fixture `meridian_graphql_conditions_top2_2026-10-19.json`]. Example row: "Clarity Act (H.R.3633) signed into law in 2026?" `estimatedPrice 0.0505`, `similarMarket.markets` = a Polymarket event URL. |
| SDK | `@sapience/sdk` on npm, last release 2026-01-05 (stale) [H]. |
| Docs | https://docs.sapience.xyz/llms.txt (index; fixture saved), https://docs.sapience.xyz/builder-guide/api/auction-relayer , https://docs.sapience.xyz/builder-guide/api/graphql |

## Trade path

Only on-chain, and only via the auction flow (documented; the relayer host is dead, but a client could run its own relayer or use Meridian's) [H]:
1. Predictor signs EIP-712 `AuctionIntent` (picks, predictor, collateral, nonce, deadline; verifying contract = escrow; max deadline 7200 s) and sends `auction.start`.
2. Counterparty (vault bot) signs EIP-712 `MintApproval` and sends `bid.submit` (quotes live seconds).
3. Predictor picks a bid and calls `PredictionMarketEscrow.mint()` on chain with both signatures. Smart-account and session-key signatures are supported (ZeroDev or escrow-native).
Requires USDe approval plus a gas-paying transaction on the deployment's chain. No limit-order API, no cancel API (bids simply expire).

The Sapience app itself no longer trades: "Only the vault page transacts" (deposits and withdrawals) [H].

## PayBox reachability: no (for Sapience/Ethereal)

- PayBox chain catalog on 2026-10-19 (`discover_tokens mode=chains`): Solana, Ethereum 1, Base 8453, Arbitrum 42161, OP 10, Polygon 137, BNB 56, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999. A search for "ethereal" returns 0 chains. Ethereal 5064014 is absent [H]. The catalog is "not a support allowlist" (tool notice), so absence is strong but not conclusive.
- `mint()` is a normal EVM call on the deployment's chain; PayBox transaction proposals need the network "available in PayBox" (`docs/research/06-paybox-platform.md`) [H via that note]. Ethereal fails this test.
- The two EIP-712 signatures are `typedData` intents that `request_wallet_sign` can in principle produce, but the flow needs a persistent WebSocket and several steps inside a few seconds, which a plugin sandbox cannot hold (same note) [M].
- Arbitrum and Polygon appear in the address table but only for bridging and Polymarket-CTF reading, not trading [H].
- The Robinhood deployment is the only realistic target; assess it under Meridian (`meridian-predict.md`: "partial").

## Fees

- Sapience docs have no fee schedule. ToS 16.2: "We may, in our sole discretion and at any time, set or modify the fees" and 16.3: blockchain fees are borne by the user [H]. NOT FOUND (searched: llms-full.txt for "fee", the Auctions/Market Making/Vault pages).
- Meridian Predict: no trading fee, protocol takes no cut (docs /fees-and-collateral, per `meridian-predict.md`); DefiLlama: "Fees are set to 0 at the moment" [H, fixture `defillama_summary_dexs_meridian-predict_2026-10-19.json`]. Cost to a taker is the maker's spread plus gas.
- Foil-era fee formulas: NOT FOUND (searched: docs.foil.xyz home page only).

## Resolution mechanism and dispute risk

- Docs: "Prediction markets are settled using UMA. Additional resolver contracts are under development." Process: deployer submits an assertion with a bond, liveness window, anyone may dispute with an equal bond, disputes go to UMA tokenholder vote [H, /user-guide/trading/resolution].
- The address table lists **no UMA resolver**. It lists `PythConditionResolver`, `ConditionalTokensConditionResolver` and `ManualConditionResolver` (Ethereal), plus `ConditionalTokensReader` contracts on Polygon [H]. Reading Polymarket's conditional-tokens contract from Polygon is the likely purpose of the last two (M, inferred from names). So the docs text and the deployed resolvers disagree; treat the UMA claim as stale (M).
- On the live deployment, outcomes follow the mirrored Polymarket/Kalshi market; non-decisive results count against the predictor and a combo loses if one leg is non-decisive (per `meridian-predict.md`, H there). Polymarket normally refunds voids 50/50, so payoffs can differ on the same event.
- Dispute risk: oracle-by-mirror (inherits the source venue's disputes, then adds its own settlement lag), manual resolver (centralised trust), and a vault manager who "can participate in prediction markets with these funds as they see fit" [H].

## Geo, ToS, automation

- Entity: Oxide Service Corp. ("Sapience," "Foil"). ToS dated 2025-02-01 (**stale**) [H].
- Restricted Users include anyone "located in or under the control of any individual or organization located in, the United States," plus comprehensively sanctioned jurisdictions; "You are prohibited from using ... a Virtual Private Network"; geo-blocking reserved [H, ToS 1.2]. Eligibility also requires "using the Services solely for your own benefit and not on behalf of, or for the benefit of, any third party" (1.1(e)), which would constrain a service trading for others [H].
- Automation is encouraged: "Any strategy you can express in code can participate in Sapience auctions"; docs ship market-making, trading and forecasting agent guides [H]. Rate limits above.
- Meridian's own geoblock names the US and Australia (per `meridian-predict.md`).

## Liquidity

| Metric | Value | Source | Tag |
|---|---|---|---|
| Sapience on Ethereal volume/OI/TVL | NOT FOUND (searched: DefiLlama protocols list for "sapience"/"foil"; no listing; API dead) | | |
| Foil gas/blobspace TVL | NOT FOUND (same search) | | |
| Meridian Predict volume (the live deployment) 24h / 7d / 30d / all-time | $3.3k / $48.5k / $190.4k / $563.4k (since 2026-06-26) | DefiLlama `summary/dexs/meridian-predict`, fetched 2026-10-19 | H |
| Meridian Predict TVL | about $1.03M | DefiLlama `/protocols`, fetched 2026-10-19 | H |
| Open interest | about $21k to $33k | `meridian-predict.md`, 2026-10-19 | H there |

All thin. Compare a single mirrored Polymarket market at $24M volume.

## Event categories and overlap

- Sapience's own category list: Weather, Crypto, Economy & Finance, Tech & Science, Geopolitics, Culture, Sports [H, brand-assets page].
- On the live deployment 115 of 125 scanned conditions mirror Polymarket and 10 mirror Kalshi (sports moneyline/totals, crypto up/down, Fed, geopolitics) (`meridian-predict.md`, H there). Everything overlaps; nothing is independent.
- The only non-overlapping niche (gas/blobspace price markets) is the Foil product, which is no longer offered in the app.
- Quotient-style signal: Meridian's `similarMarket.markets` is a venue-authored link from each condition to its Polymarket/Kalshi URL. That is a free cross-venue link table worth a one-off pull for `docs/market-linking-design.md`; it does not justify a live Sapience adapter.

## Shared liquidity

Shares everything with **Meridian Predict**: the Sapience app points at `api.predict.meridian.xyz`, uses the same vaults and relayer, and its repo says it is "a client ... on the Robinhood (Meridian) deployment" [H]. Meridian's prices are copies of Polymarket and Kalshi prices (`meridian-predict.md`). So Sapience is not an independent arbitrage leg and not independent price discovery.

## If this ever needs revisiting

Revisit only if the Ethereal deployment is relaunched with a working relayer and non-mirrored markets, or the Foil resource markets return. Watch: repo `sapiencexyz/sapience` pushes, `api.sapience.xyz` returning anything other than Railway "Application not found", and Meridian's 30d volume passing about $5M (same threshold as the Meridian note).

## Open questions

- Do open positions or unclaimed winnings remain on the Ethereal escrow, and can they still be settled? (Needs JSON-RPC; not done.)
- Was the move to Meridian announced anywhere (X, Discord, Substack)? Blog and docs show nothing; X and Discord unchecked (search budget exhausted).
- Is the NFT (docs) vs ERC-20 (Meridian) position token difference a contract revision?

## Suspicious content

- docs.sapience.xyz agent pages (Claude Code / Codex / OpenClaw) tell the reader to give an agent the prompt "Learn this skill https://sapience.xyz/skill" (and the docs describe a `SKILL.md`). Not fetched or followed; recorded as an embedded instruction aimed at AI agents. `sapience.xyz/skill` returns a 308 redirect to `www.sapience.xyz/skill` (status of the target not read).
- `blog.sapience.xyz`: the fetch summariser reported page text containing formatting rules addressed to an AI reader and said it ignored them. Not independently reproduced; ignored.

## Fixtures (`docs/research/fixtures/sapience-foil/`)

- `dead_hosts_api_relayer_2026-10-19.txt` : DNS, certificate, and 404 bodies for `api.` and `relayer.sapience.xyz`.
- `docs-sapience-xyz_llms.txt_2026-10-19.txt` : docs index (5 KB).
- `meridian_graphql_conditions_top2.query.graphql` + `meridian_graphql_conditions_top2_2026-10-19.json` : live read shape.
- `sapience_docs_example_query_vs_meridian_host.query.graphql` + `..._response_2026-10-19.json` : schema-drift proof.
- `defillama_summary_dexs_meridian-predict_2026-10-19.json` : volume.
- `sapience-app_networkDefaults.ts_2026-10-19.txt`, `sapience-app_README_head_2026-10-19.txt` : app pinned to Meridian.

## Sources

- https://www.sapience.xyz , https://www.sapience.xyz/vaults (200), /terminal /bots /subscribe (404) [H]
- https://docs.sapience.xyz/llms.txt and /llms-full.txt (all docs pages incl. Auctions, Resolution, Contracts & Addresses, Auction Relayer API, GraphQL API, Terms of Service, Glossary, Brand Assets) [H]
- https://github.com/sapiencexyz/sapience : README, AGENTS.md, `.env.sample`, `src/lib/config/networkDefaults.ts`, commit history via `gh api` [H]
- https://www.foil.xyz/ , https://docs.foil.xyz/ [H]
- https://docs.meridian.xyz/protocol-reference/api-hosts , https://docs.meridian.xyz/llms-full.txt (Migrate from Ethereal, perps only) [H]
- https://api.predict.meridian.xyz/graphql (unauthenticated GET) [H]
- https://api.llama.fi/protocols , https://api.llama.fi/summary/dexs/meridian-predict [H]
- https://registry.npmjs.org/@sapience%2fsdk [H]
- PayBox `discover_tokens mode=chains`, 2026-10-19 [H]
- https://github.com/dexlytrade/awesome-onchain-prediction-markets (README row "Sapience (Foil) ... Live") [H that the row says this; stale]
- Repo notes: `docs/research/venues/meridian-predict.md`, `docs/research/06-paybox-platform.md` [H as written by earlier sessions; not re-verified except the chain list]
