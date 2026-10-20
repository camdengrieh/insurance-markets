# Hedgehog Markets (hedgehog.markets) - venue spec

Researched 2026-10-19. Read-only: public pages, GitBook `.md` mirrors, `gh api` raw reads of the Hedgehog-Markets GitHub org, DefiLlama public API, static reading of the site's public JS bundles. No accounts, no wallet connection, no POST, no Solana RPC calls, no calls to the site's undocumented backend (see Read API). Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- The website and GitBook are still served, but every liveness signal points to a dormant venue: last tweet 2025-04-30, last GitHub commit to a program repo 2024-12-13, DefiLlama TVL frozen at about 51.6K USD of USDC from Aug 2025 to Aug 2026, no volume/fee/OI adapters, and the docs are dated 2024.
- There is no public read API and no off-chain order API. Everything would have to be read from Solana program accounts and traded by building raw Solana transactions. The one interesting model (fixed-odds P2P "Versus") has an order-book-like shape, but there is no evidence of any live liquidity to scan.
- A 2026 review-site claim of a "V1 launch in January 2026", "2% fee" and "over 3 million USD volume" has no primary source and contradicts the primary docs and on-chain TVL. Treat as L (see Liveness).
- Revisit only if a primary source (official X/Discord/blog or on-chain signature history) shows new activity after 2025-08.

## Liveness (still live in 2026?)

- **Website: serving, H.** `https://hedgehog.markets/` returns 308 to `https://www.hedgehog.markets/`, which returns 200 (Next.js on Vercel). Title "Hedgehog Markets", meta description "Hedgehog - building permissionless prediction markets on Solana and Eclipse". Nav: Versus, Classic, Create a Market. Pages `/versus`, `/markets`, `/create/custom` return 200. The served HTML is a client-rendered shell: the only visible market-table text is "No Results" with a placeholder link `/versus/solana/undefined`, so the shell cannot prove or disprove that markets exist. No shutdown or sunset notice found on the site or in the docs. (https://www.hedgehog.markets/)
- **Social: dormant, M.** Third-party tracker lists social activity "Dormant (536 days ago)", last tweet 2025-04-30 "Prediction market for two ai agent trading bots is live". (https://madeonsol.com/tools/hedgehog-markets, listing updated Oct 2026.) Another aggregator snippet showed "Dormant (444d ago)" at an earlier date. The official X account returned HTTP 402 to our fetcher; we stopped there (no payment attempted). Medium and Solana Compass returned 403.
- **Code: stale, H.** Org repo list (gh api): `hedgehog-program-library` last commit 2024-09-10; `hpl-parimutuel-eclipse` last commit 2024-12-13 ("Update security contact"); `oracle-be` last commit 2024-09-17; `hedgehog-escrow` (older P2P NFT programs) last commit 2022-09-20; newest push anywhere in the org 2025-01-16 (a DefiLlama-Adapters fork). Nothing in 2026. All older than 6 months, so stale. (https://github.com/Hedgehog-Markets)
- **TVL: frozen, H (aggregator).** DefiLlama protocol `hedgehog-markets` (id 5175, listed 2024-09-23): Solana TVL 71.7K USD on 2024-09-24, peak 110.1K USD on 2024-10-01, decline through 2025, then essentially flat at about 51.6K USD from late 2025 to 2026-08-24, one step down to about 46.0K USD on 2026-08-25, 46,007 USD on 2026-10-18 (all USDC). Eclipse TVL 0 for the entire history (first point 2025-01-17). A flat balance for a year with no volume means stranded or unclaimed escrow, not trading. `dimension_adapters` is null in our DefiLlama registry snapshot (docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json), i.e. no volume, fees or OI data. Fixture: docs/research/fixtures/hedgehog-markets/defillama_protocol_tvl_trimmed_2026-10-19.json. (https://api.llama.fi/protocol/hedgehog-markets)
- **Conflicting 2026 claims, L.** predictionmarketsreviews.com (page says "Updated Mar 2026", no primary sources cited, affiliate links) states Hedgehog "launched in V1 in January 2026", has "over $3 million in early trading volume", a flat "2% trading fee" (its own table says "2% fee on winnings"), and an "HHDG" governance token. Not corroborated by the GitBook (which says a token "may or may not" be released), by GitHub activity, by DefiLlama TVL, or by the tracker. Solana Compass (promotional page, 403 to us, seen only as a search snippet) claims TVL "surpassed $20M" and 3,500+ users, which is historical or inflated and contradicts DefiLlama. Do not rely on any of these.
- **Status call:** "web-up, product dormant" (M). Not confirmed closed, not confirmed live.

## Kind and market model

Kind: on-chain, non-custodial Solana programs (escrow, pool and AMM style), with a Next.js front end. The GitBook lists five product lines; three of them have shared on-chain program IDs in the program library (H, https://github.com/Hedgehog-Markets/hedgehog-program-library):

| Product | Program ID | Status per docs/repo | Model |
|---|---|---|---|
| Versus (P2P) | `P2PzLraW8YF87BxqZTZ5kgrfvzcrKGPnqUBNhqmcV9B` | current in README | Fixed-odds peer-to-peer bets, binary YES/NO |
| Pooled (Parimutuel) | `PARrVs6F5egaNuz8g6pKJyU4ze3eX5xGZCFb3GLiVvu` | "Eclipse Only" per docs; same ID in README | Parimutuel pool, `amounts` array (SmallU64Array), `outcome: u8`, so possibly more than 2 outcomes (M, not verified) |
| Parlay Pools | `PLYaNRbQs9GWyVQdcLrzPvvZu7NH4W2sneyHcEimLr7` | current in README | Entry-fee pot, most correct picks wins the pot; not a priced market |
| Classic (AMM) | `Hr4whNgXr3yZsJvx3TVSwfsFgXuSEPB1xKmvgrtLhsrM` | listed under "Legacy Programs" | Constant-product style YES/NO share AMM with LP tokens; instructions `initializeSwap, addLiquidity, buy, sell, removeLiquidity` (H, IDL) |

- **Versus (P2P).** "Versus markets are effectively peer-to-peer bets for any event ... create a Versus market by setting any desired bet size and odds ... take the other side." A creator posts a bet with odds and max size; takers fill it; an unfilled bet can be cancelled "as long as no one has taken the other side". Account layout (H, P2P IDL `hpl_p2p` v2.0.0): `MarketV1 { creator, index, nextPosition, resolver, mint, odds: Ratio{yes,no}, yesAmount, noAmount, state: Open|Yes|No|Invalid, creationTimestamp, closeTimestamp, resolveTimestamp, outcomeTimestamp, platformFee: Bps, uri }`, `UserPositionV1 { market, index, wallet, noAmount, claimed }`. Funds sit in on-chain escrow until resolution: "If you deposit funds into a Versus or Pooled market then those funds are locked in an on-chain escrow contract until the market is resolved." Positions are not tokenised (account rows, not SPL outcome tokens) and cannot be sold early. So there is no secondary price.
- **Classic (AMM).** "participants ... trade (buy/sell) YES and NO shares ... dynamically trade to reflect the current odds". Shares appear to be SPL token accounts (docs mention token accounts and reclaimable rent), M. Liquidity is single-pool, LP-funded; docs warn traders may be unable to exit if LPs withdraw. Docs title says "Solana Only".
- Binary only, in every documented product. No categorical-with-price or scalar markets documented.
- Market metadata (question text, categories) is off-chain: "Associated market data can be fetched off-chain using the URI stored in the on-chain account. For markets created by Hedgehog, the URI will usually be for IPFS." The front end uses a Pinata IPFS gateway and a Firestore database for indexing (see Read API). (H, program-library READMEs; M for the bundle details)
- Anyone can create markets via the UI or SDK: "Anyone can create a market via our User Interface (UI)." Markets created via SDK "may be excluded from Hedgehog Markets frontend".
- Frontend categories: Crypto, Politics, Tech, Sports, Other. The JS bundle references the ESPN sports API (sports.core.api.espn.com) for event metadata (M, static bundle read).

## Chains and collateral

- Chain: Solana mainnet (H, docs "Solana only"). Parimutuel was deployed on Eclipse (Solana-VM L2), docs: "Eclipse Only"; DefiLlama Eclipse TVL has been 0 throughout, so treat Eclipse as unused (H aggregator).
- Collateral: USDC ("USDC value" for holdings, H docs; DefiLlama token breakdown is USDC only, H). Each market stores a `mint`, so other SPL mints are possible in principle (H, IDL), but nothing shows any in use. Parimutuel idle funds could be routed through Lulo (IDL `SetupLuloV1`, `LuloPoolV1`; risks page names "the risks of Lulo") (H).
- Gas: SOL for transactions and rent (H, FAQ). Rent is reclaimable on close/claim.

## Read API

- **Official public API: NOT FOUND** (searched: hedgehog.markets pages and public JS bundles, GitBook llms.txt and all product/FAQ/risk/ToS pages, GitHub org repos and READMEs, DefiLlama protocol entry). `exists` = onchain-or-subgraph-only.
- **What exists instead:**
  - On-chain program accounts, readable by anyone with a Solana RPC (`getProgramAccounts` filtered by program ID and account discriminator). Anchor-style IDLs are public: https://github.com/Hedgehog-Markets/hedgehog-program-library (`p2p/idl.json`, `parimutuel/idl.json`, `parlay/idl.json`, `legacy/amm/idl.json`), each with a `js` client folder. Fixtures saved: `hpl_p2p_idl_8b663bf.json`, `hpl_parimutuel_idl_8b663bf.json` (program-library commit 8b663bf, 2024-09-10). We did NOT call an RPC (JSON-RPC is POST; out of scope for this pass).
  - Off-chain market text via the `uri` field (IPFS). Not fetched (needs a live market account first).
  - The web app's own index is a Firebase/Firestore project (project id `hedgehog-tools`, visible in the public JS bundle) plus a Pinata gateway. This is an undocumented internal backend; we did not query it and do not recommend an adapter depend on it. ToS also forbids automated access "not provided by us" (see Geo/ToS).
- Auth and rate limits: none documented (no API). WebSocket: NOT FOUND.
- Fixture note: because no venue API exists, the only "response shapes" confirmed are (a) the IDL account layouts above and (b) DefiLlama's third-party TVL series (docs/research/fixtures/hedgehog-markets/defillama_protocol_tvl_trimmed_2026-10-19.json, trimmed from 290KB). (c) GitBook index: gitbook_llms_2026-10-19.txt.

## Trade path

- No off-chain order book, REST order endpoint or signed-order scheme (NOT FOUND, same search as above). All actions are Solana transactions signed by the user's wallet; the docs say "Interacting with any programs requires a user to sign their own wallet's transaction".
- P2P instructions (H, IDL): `CreateUserV1`, `CreateMarketV1` (post a bet), `CreateUserPositionV1` (take a bet), `WithdrawUnmatchedV1` (cancel unmatched amount), `ResolveV1`, `ClaimUserV1`, `ClaimCreatorV1`, `WithdrawUserV1`, `CloseMarketV1`. AMM (legacy): `buy`, `sell`, `addLiquidity`, `removeLiquidity`.
- An agent would have to build the transactions itself from the IDL or the repo JS clients (install/run of third-party code was not done here) and sign with a Solana key. No hosted transaction builder was found; the front end builds transactions client-side with Metaplex Umi (M, bundle). The docs also mention "Blinks" (Solana Actions on X) for sharing markets (H, llms.txt entry); we did not read that page, and it is a UI convenience rather than a trading API.
- **PayBox reachability: partial.** Hedgehog is Solana-only, so none of the EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) can trade it. A PayBox Solana wallet could in principle sign a client-built transaction through `request_wallet_sign` with a `solanaTransaction` intent, or a `io.paybox/transactionProposal` of kind `solana` (legacy/v0, at most 1,232 bytes, single signer who is fee payer), per our own earlier PayBox notes (docs/research/06-paybox-platform.md, M here because not re-verified this session). Position and token accounts would need to be created first (rent), which may exceed or complicate the single-transaction limit. Moot given dormancy. No PayBox calls were made.

## Fees

- **Classic AMM:** 100 bps (1%) on buys and 1% on sells, paid by the trader, retained in the pool for LPs; "There are currently no other fees on the platform when a market is created using our User Interface" (H, https://hedgehogmarkets.gitbook.io/hedgehog-markets/getting-started/amm.md; docs undated, screenshots from 2024). Plus SOL gas and reclaimable rent.
- **Parimutuel:** fees "ONLY taken from the incorrect outcome deposits" (H). Both `creatorFee` and `platformFee` (Bps) are stored per market (IDL); the values are listed in each market's "Contract Details" tab and "may vary" (FAQ). Actual numbers: NOT FOUND.
- **Versus (P2P):** `platformFee: Bps` in the program `ConfigV1` and copied into each `MarketV1` (IDL). Value: NOT FOUND. Instruction `WithdrawPlatformFeesV1` implies fees accrue to the platform.
- **Parlay:** pot of entry fees "minus any creator or program fees" (H).
- Conflict: a 2026 review claims "2% trading fee"; the GitBook says 1% each side for AMM. Use the on-chain config, not the review (L vs H).

## Resolution mechanism and dispute risk

- **Manual, per-market resolver key.** Each market stores a `resolver` public key (H, IDL), and the front end has an `HH_RESOLVER` constant (M, bundle). Risks page: "All markets are currently resolved manually", "all markets are created and resolved manually by humans, therefore mistakes could occur." AMM markets: "24 hour resolution delay ... so that corrections can take place ... After this delay the outcome cannot be changed." (H, https://hedgehogmarkets.gitbook.io/hedgehog-markets/disclaimer/risks.md)
- Optimistic oracle: described as "diligently working on" (risks page). Repo `oracle-be` (program `DVM2j1a1AJ9hZuEXyMxA5vusKgMR2FcKJyCf3QE5R2ge`) implements request, bonded proposal, dispute window, bonded dispute; README warns "not formally audited". Last commit 2024-09-17. No evidence that any market uses it (M).
- Outcomes include `Invalid`/refund states (IDL), so mis-specified markets can be voided.
- Dispute risk: high. Single human resolver, no independent dispute path in use, unaudited programs ("Programs and clients may not have been formally audited. Use in production at your own risk."), and user-created markets of arbitrary quality. Anyone can create a market, so spec ambiguity is a real cross-venue basis risk.
- Resolution timing: resolver sets outcome after `resolveTimestamp`; no SLA found.

## Geo, ToS, automation

ToS (https://hedgehogmarkets.gitbook.io/hedgehog-markets/disclaimer/terms-of-service.md, undated, H):
- Restricted territories include the United States and its territories, Canada, Panama, France, the Netherlands (and Caribbean territories), the United Kingdom, EU-sanctioned/embargoed countries and a long list including Iran, Cuba, North Korea, Syria, Venezuela and others. Users must not use "VPN software or any other privacy or anonymization tools".
- Automation: prohibited use includes "any robot, spider, crawler, scraper, or other automated means or interface not provided by us, to access the service or to extract data" and "To scrape our odds". On-chain program interaction is described as permissionless ("Hedgehog cannot prevent or force anyone to interact with any on-chain programs") but the ToS still reads against bots using the service; reading chain state directly is arguably outside "the service" (M, not legal advice).
- Regulatory posture: entity terms refer to Panamanian sanctions lists (M, possible Panama entity). Not available in the US.
- A user who is geo-restricted (US) should not trade here; and the ToS explicitly bars VPN circumvention.

## Liquidity

- Latest hard figure: DefiLlama TVL 46,007 USD (USDC, Solana) on 2026-10-18; peak 110,082 USD on 2024-10-01 (H aggregator). Flat since ~Aug 2025, so effectively stranded balance rather than active order flow.
- Volume, fees, open interest: NOT FOUND (searched: DefiLlama dimension adapters for this protocol, site, docs). Registry snapshot shows `vol_24h_usd`, `vol_30d_usd`, `fees_30d_usd`, `oi_latest_usd` all null.
- Review-site volume claims (3M USD, "TVL > 20M") are L and unverified.

## Event coverage and cross-venue overlap

- Documented topics: elections, sporting events, crypto prices ("Market topics can cover any event where results can be objectively verified, e.g., elections, sporting events, crypto prices"). Front-end category filters: Crypto, Politics, Tech, Sports, Other. In principle overlaps with Polymarket, Kalshi and others on politics, sports and crypto thresholds.
- In practice: no evidence of any currently open market, so no live overlap. User-made markets would have bespoke resolution wording, adding basis risk to any hedge.
- The April 2025 tweet mentions a market between two AI trading bots (M); not relevant to cross-venue arbitrage.
- Liquidity sharing: none found. Hedgehog runs its own programs (own escrow, own AMM). So nominally an independent leg, but with essentially no liquidity.

## Adapter notes (if ever revisited)

- Read path: RPC `getProgramAccounts` on P2P program, decode `MarketV1` with the IDL, filter `state = Open`, `closeTimestamp` in the future, `mint` = USDC; implied probability from `odds: Ratio{yes,no}` and open `yesAmount/noAmount`; text from IPFS `uri`. Not a price book: each market is one bet with one odds ratio.
- Do not build on the Firestore backend or scrape the UI (ToS).
- Skip until a primary source shows new on-chain activity (e.g. signature history for the P2P and AMM program IDs after 2025-08), which requires an RPC call that this pass did not make.

## Not found

- Official REST/WebSocket API or SDK docs for data access (searched: site, GitBook llms.txt and pages, org repos, DefiLlama).
- Any 2026 announcement from Hedgehog itself (blog, X, Discord): Medium 403, X 402, Discord not opened.
- Actual fee values, currently open markets, per-market volume.
- Evidence for the "V1 launch January 2026" claim and for an HHDG token (searched: GitBook FAQ, GitHub, DefiLlama; only review sites).
- Security audit report (DefiLlama `audits` = "0"; repo READMEs say not formally audited).

## Open questions

- Is there any on-chain activity on `P2Pz...`, `Hr4wh...`, `PARrV...`, `PLYaN...` after 2025-08? (Needs Solana RPC `getSignaturesForAddress`; deliberately not done in this POST-free pass.)
- Does the Firestore-backed index still list markets, and are any open with non-trivial size?
- Is the January 2026 "V1" a real relaunch with new program IDs (not in the program-library README)?
- What are the platform fee values in each program's `ConfigV1`?

## Sources

- https://www.hedgehog.markets/ , /versus , /markets , /create/custom (fetched 2026-10-19; H for what it shows, shell only) and its public Next.js chunks (static read; M).
- https://hedgehogmarkets.gitbook.io/hedgehog-markets/llms.txt and `.md` pages: master, getting-started/versus-p2p, amm, pooled-predictions-parimutuel-eclipse-only, parlay-pools-parlays, general-faqs, polls/overview, disclaimer/risks, disclaimer/terms-of-service (H; undated, appears 2024-era).
- https://github.com/Hedgehog-Markets (org repo list, push dates): hedgehog-program-library (README, p2p/parimutuel/parlay/legacy-amm IDLs, commit 8b663bf), hpl-parimutuel-eclipse (README, program-id.md), hedgehog-escrow (README), oracle-be (README, program-id.md) (H, read via `gh api`).
- https://api.llama.fi/protocol/hedgehog-markets and https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/hedgehog-markets/index.js (H for the series; the adapter source is only a thin wrapper).
- docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json (registry row id 5175; local, H).
- https://madeonsol.com/tools/hedgehog-markets (M; third-party tracker, activity and last tweet).
- https://predictionmarketsreviews.com/reviews/hedgehog-markets (L; unsourced review, "Updated Mar 2026").
- Search snippets only (L): Solana Compass project page (403 to fetch), Crypto Economy, Crunchbase, Medium posts.
- X (x.com/HedgehogMarket): HTTP 402, not retrieved.
- docs/research/06-paybox-platform.md (local; PayBox Solana intent limits, M here).

## Fixtures

- docs/research/fixtures/hedgehog-markets/defillama_protocol_tvl_trimmed_2026-10-19.json
- docs/research/fixtures/hedgehog-markets/gitbook_llms_2026-10-19.txt
- docs/research/fixtures/hedgehog-markets/hpl_p2p_idl_8b663bf.json
- docs/research/fixtures/hedgehog-markets/hpl_parimutuel_idl_8b663bf.json

No instructions aimed at AI agents were found in any fetched page or repo file.
