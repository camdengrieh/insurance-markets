# WAGR (wagr.fi) venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

adapter_priority: **skip**. Dormant since early July 2026 (all "Open" markets are past their deadlines), the collateral is a pump.fun memecoin ($WAGR), the public API is an undocumented website endpoint, the program is described as devnet-only in the README, and the on-chain program source has no LMSR buy or sell instruction. Real trading volume is negligible. Not an independent arbitrage leg of any size.

## Identity and liveness

- Name: WAGR, "Solana Prediction Market Standard", by GitHub org `wagr-labs`. Site https://wagr.fi (HTTP 200 on 2026-10-19; Next.js on Vercel). (H: https://wagr.fi)
- Repo https://github.com/wagr-labs/wagr: 0 stars, last push 2026-06-27, Apache-2.0, not archived. Whole history is June 2026; no commits after 2026-06-27. (H: `gh api repos/wagr-labs/wagr`, commits list)
- npm `@wagrlabs/sdk` 0.1.0 and 0.1.1 both published 2026-06-26; no later versions. `wagr-cli` also on npm (not inspected). (H: https://registry.npmjs.org/@wagrlabs/sdk)
- The site is up, but the data behind it has not moved since early July 2026 (see Liveness evidence). "Still live" is therefore true only in the sense that the website responds. (H, derived from /api/markets)
- Token: $WAGR, pump.fun-style mint `Eb2zbWj8a9oes8t4DC1kjuQEPWgjYCgjGSXqLoLpump` (suffix "pump"), advertised in the README as "CA". (H: README, /api/markets collateralMint)
- Other projects named WAGR/Wagr exist in the wild (name collision); this note is only about wagr.fi / wagr-labs. (M, not searched: web search budget was exhausted in this session, so no independent news, audit or mainnet-launch confirmation was obtainable.)

### Liveness evidence (from GET https://wagr.fi/api/markets, fetched 2026-10-19)

- 386 markets total: 346 Open, 13 Proposed, 27 Resolved. (H)
- Newest `createdAt` = 2026-07-01 11:52 UTC; newest `proposedAt` = 2026-07-09 12:01 UTC. (H)
- Latest `resolutionDeadline` among Open markets = 2026-08-22. Zero Open markets have a deadline after today (2026-10-19). All 346 "Open" markets are expired and unresolved. (H)
- 374 of 386 markets still show price 0.5/0.5 with `sharesQ` [0,0], i.e. never traded. 12 markets show nonzero `sharesQ`. (H)

## Market model

- Binary and categorical (2..16 outcomes) in the spec; every one of the 386 live records is binary YES/NO. (H: docs/outcome-spec.md; /api/markets)
- Mechanism: LMSR AMM (Hanson 2003) with fixed per-market liquidity parameter `b`; `C(q) = b ln(sum exp(q_i/b))`, price `p_i = exp(q_i/b)/sum exp(q_j/b)`; maker loss bounded by `b ln N`. Docs also mention a later switch to CPMM above a depth threshold (not in the program source). No order book. (H: docs/outcome-spec.md, docs/architecture.md section 6)
- Tokenisation: one Token-2022 mint per outcome, mint authority = market PDA `["market", market_id u64 LE]`, decimals match collateral. Conditional-token-style `split` / `merge` / `redeem` (1 winning share = 1 unit collateral). (H: outcome-spec.md; src/sdk/src/client.ts)
- Market structure observed: almost entirely auto-generated "TOKEN above $X by DATE" crypto price-threshold markets (Solana 59+6, Ethereum 53, Bitcoin 51, Sui 33, Chainlink 32, XRP 27, BNB 26, Avalanche 25, Dogecoin 21, plus WAGR/ANSEM memecoin markets). Created by many distinct authority wallets (about 50). (H: /api/markets)
- Example record (fixture): `marketId`, `address` (market PDA), `authority`, `question`, `state` (Open / Proposed / Resolved), `resolutionDeadlineUnix`, `createdAt`, `proposedAt`, `challengeWindow` (seconds; 86400 or 0), `winningOutcome`, `outcomeCount`, `outcomes[{label, price, volume}]`, `collateralSymbol`, `collateralMint`, `vault`, `tokenProgram`, `bettable`, `oracle`, `lmsrB`, `sharesQ`, `totalVolume`. (H: docs/research/fixtures/wagr/api_markets_sample.json)

## Chains and collateral

- Solana only. Program id `GreSDUbtzBpDRgCYo9sXGZbFDM3HXFQWTdeAacF8HDEc` (Anchor 0.31). (H: README, src/anchor-program lib.rs)
- Network is contradictory: README says "live on Solana devnet (mainnet pending)" and the badge links to a devnet explorer URL; the SDK constants file comment says "Solana mainnet" and uses mainnet USDC as default collateral and the same program id. The site /guide and /docs pages do not name a network. I did not verify the program on-chain (a JSON-RPC lookup is a POST and was out of scope). Treat as devnet unless proven otherwise. (H for the contradiction; network itself unresolved)
- Collateral: any SPL / Token-2022 mint per market. In practice all 386 markets use $WAGR (the memecoin) as collateral, not USDC. Outcome shares are in $WAGR units. (H: /api/markets collateralSymbol counts; /guide: "any SPL / Token-2022 mint, e.g. $WAGR")
- Rule of thumb for any aggregator: prices are not USD-denominated payoffs. A "YES at 0.5" payoff is 1 $WAGR, a near-worthless memecoin unit. Cross-venue arbitrage maths against USDC-settled venues is invalid without hedging $WAGR price risk. (M, inferred)

## Read API

- exists: **unofficial-only**. There is no documented public API. The site front end consumes a Next.js route `GET https://wagr.fi/api/markets` that returns a JSON array of all markets with prices and volumes (about 297 KB, 386 rows, `content-type: application/json`, `cache-control: public, max-age=0, must-revalidate`, served by Vercel). No auth needed. (H: GET 2026-10-19)
- `GET /api/markets/{id}` returns 404; `/api/v1/markets` 404. No trades, order-book, resolution-history or websocket endpoints found. (H: probed)
- /guide and /docs pages do not describe any API; /docs is an index of four spec docs. (H: https://wagr.fi/guide, https://wagr.fi/docs)
- Architecture doc mentions an off-chain FastAPI "metadata + LMSR" service with Postgres/Redis, plus `/oracle/feeds` and a `/markets?state=Open` row count. Those paths are described, but I did not find a public host for them. (H for the doc statement; endpoints NOT FOUND publicly)
- Alternative read path: decode `OutcomeMarket` PDA accounts directly from Solana RPC (layout in outcome-spec.md; `shares_q` vector plus `lmsr_b` allows recomputing LMSR prices client-side; SDK helper `@wagrlabs/sdk/lmsr`). (H: docs, SDK exports; not exercised)
- Rate limits, websocket, API keys: NOT FOUND (searched: wagr.fi/docs, /guide, README, docs/*.md, response headers).

## Trade path

- On-chain only, signed by the trader's Solana wallet (Phantom or Solflare via the site). No order-signing or REST order API. (H: /guide; security.md "Trader wallets sign every state-changing instruction")
- SDK `WagrClient` exposes `splitIx` / `mergeIx` / `split` building Anchor instructions; the IDL is not bundled (caller passes it). (H: src/sdk/src/client.ts)
- Important gap: the Anchor program source in the repo (`wagr-executor`, ~16 KB) implements `create_market`, `split`, `merge`, `quote_buy` (read-only), `propose_resolution`, `confirm_resolution`, `redeem`. There is no instruction that buys or sells outcome shares against the LMSR curve, and no dispute / challenge instruction. The guide says users "pick YES or NO and a share count", so the deployed program or site may differ from the public source; unresolved. (H: lib.rs read; the discrepancy itself is M)
- The CLI `create` command is described as a dry-run preview only. Telegram bot and mobile app are "in development". (H: README)
- Reachable through PayBox? **No for EVM wallets** (Solana-only venue). A PayBox Solana wallet could in principle sign transaction proposals, but there is no verified, documented trade instruction, the collateral is a memecoin, and nothing is liquid. paybox_reachable = partial at best; set to "no" for practical purposes (see output).

## Fees

- Site guide: "Every $WAGR bet burns 1% of the trade and pays 1% to stakers." Makers fund a seed of about `b * ln2`. Position account rent (about 0.01 SOL) returned on close. (H: https://wagr.fi/guide)
- Program: per-market `fee_bps` field; `split` fee = `amount * fee_bps / 10000`; fee vault split 50% to $WAGR buyback-and-burn, 50% to treasury (outcome-spec.md). Docs and guide differ in detail (burn+stakers vs buyback+treasury). (H: outcome-spec.md section 5; guide)
- Payer: trader. Outcome-share Token-2022 transfer fee is off; on for $WAGR slashing flows. (H)

## Resolution and dispute risk

- Per-market `resolution_source`: UmaOptimistic (bonded proposer, matching challenger bond, default 24h window, 72h for slow data), PythAggregator, MultiSourceConsensus (M-of-N median of Pyth / Switchboard / in-house attestation), or Manual (single `authority` signer sets the winner with no challenge window). (H: oracle-spec.md; types.ts)
- Dispute escalation to a "Reputation DVM" voted by $WAGR stakers (stake x reputation weighted). Described in a spec; the on-chain program source has no challenge instruction. (H: spec; lib.rs read)
- Data shows `challengeWindow: 0` on 29 markets (Manual-style) and 86400 on 357. 27 resolved, 13 stuck in Proposed past their windows, 346 expired without resolution. (H: /api/markets)
- Risk assessment: HIGH. Single operator wallets create and (for Manual) resolve markets; resolvers and oracles are unproven; stale "Open" markets past deadline suggest the resolver stopped. Markets referencing "price of token at time T" have unspecified source/timezone. (M, inferred)
- Treat $WAGR-staker DVM as capturable: one memecoin governs disputes. (M)
- Upgrade authority "multisig" with signer set in `docs/governance.md` (TBD); bounty doc also TBD. Not audited per anything found. (H: security.md; NOT FOUND: audit report)

## Geo / ToS / automation

- No terms of service, privacy page, geoblock notice or API usage rules found: /terms and /privacy return 404; /guide and /docs say nothing. robots.txt is `User-agent: *  Allow: /`. (H: probed 2026-10-19)
- Anything beyond reading the public JSON: NOT FOUND. Because the endpoint is undocumented, it may change without notice. (M)

## Liquidity

- No official volume/TVL/OI figure published. (NOT FOUND: searched site, README, docs)
- `/api/markets` sum of `totalVolume` = about 23.7M $WAGR units across 386 markets (largest single market about 4.46M units); 10 markets have 0. These are cumulative counts in $WAGR units, and the `totalVolume` field increments on split/merge amounts, so it can include seeding. (H: fetched 2026-10-19)
- USD translation is uncertain: market question text sets WAGR strikes of about $0.00008 (approx $78k market cap) and about $0.00013 ($130k), which implies 23.7M $WAGR is on the order of low thousands of USD cumulative at July prices. (M/L: derived from market titles, stale July prices)
- DexScreener public API for the mint returned `pairs: null` on 2026-10-19, i.e. no indexed trading pair at that moment. (H: GET https://api.dexscreener.com/latest/dex/tokens/Eb2zbWj8a9oes8t4DC1kjuQEPWgjYCgjGSXqLoLpump) This makes it likely the $WAGR token itself is illiquid or dead; it might also reflect indexer coverage. (M)
- Open interest / depth: LMSR `b` is 100,000,000 raw units (100 $WAGR at 6 decimals) on the sampled markets, i.e. extremely shallow in USD. (H: lmsrB in fixture; M for the decimals assumption)

## Event coverage and overlap

- Crypto price thresholds on majors (BTC, ETH, SOL, XRP, BNB, DOGE, AVAX, LINK, SUI, LTC, DOT) overlap Polymarket, Kalshi, Limitless and others in theory, with different strikes/dates. Dates in the data are July–August 2026, all expired. (H: /api/markets)
- No sports, politics or macro markets. Memecoin self-referential markets (WAGR, ANSEM) are novelty. (H)
- Useful at most as a "signal" for LMSR-implied probabilities, which are almost all uninformative (0.5 untouched). (M)

## Shared liquidity

- Independent AMM; no evidence of shared liquidity with another venue. But also no liquidity of consequence. Mentions of UMA / Pyth / Switchboard are oracle inputs, not liquidity. (H: architecture.md; M for "no sharing")

## Suspicious content / injection notes

- None observed. The README embeds a "CA:" token address promotion and the site title says "Bet the truth"; treated as marketing only. The README has a "build passing" badge pointing to `#`, and `docs/security.md` describes a "live-claim parity" CI gate, which are self-descriptions that I did not verify. (H, informational)

## Fixtures

- `docs/research/fixtures/wagr/api_markets_sample.json` (about 5.7 KB): six rows from `GET https://wagr.fi/api/markets` covering an untraded Open market (2000002), a traded Open memecoin market (2000009), a traded Open Solana market (2100081), a Proposed market (2100009), a Resolved market with trades (1782625544775881), and a Resolved market (2000001). Full response was 296,694 bytes and is not saved.

## Open questions

1. Is program `GreSDUb...HDEc` deployed on mainnet, devnet, or both, and is the deployed program richer than the public `wagr-executor` source (does it have an LMSR buy/sell)? Needs an on-chain account lookup (JSON-RPC POST, outside this task's constraints) or Solscan.
2. Does `wagr.fi/api/markets` get refreshed at all? Data stops 2026-07-09 and may be a stale cache/seeded database.
3. Any real USD volume? $WAGR had no DexScreener pair on 2026-10-19.
4. Is a fuller docs site (the guide mentions Docs and GitHub links only) planned? Web search was unavailable (budget exhausted), so no outside news, audits or social-channel (x.com/wagrfi) status was checked.

## Sources

- https://wagr.fi (home, H), https://wagr.fi/guide (H), https://wagr.fi/docs (H), https://wagr.fi/api/markets (H, JSON), https://wagr.fi/robots.txt (H)
- https://github.com/wagr-labs/wagr: README.md, docs/architecture.md, docs/outcome-spec.md, docs/oracle-spec.md, docs/security.md, src/sdk/src/{client,constants,types}.ts, src/anchor-program/programs/wagr-executor/src/lib.rs (all H, read via `gh api` raw)
- https://registry.npmjs.org/@wagrlabs/sdk (H, publish dates 2026-06-26)
- https://api.dexscreener.com/latest/dex/tokens/Eb2zbWj8a9oes8t4DC1kjuQEPWgjYCgjGSXqLoLpump (H, `pairs: null`)
