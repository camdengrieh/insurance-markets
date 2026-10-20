# Clutch Markets (Clutch DPP parlay platform; Arbitrum + ApeChain) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (project pages, DefiLlama API, Blockscout REST/Etherscan-compatible log GET on ApeChain, two GETs against the front end's own same-origin proxy route), `gh api` raw file reads, public JS bundles downloaded as text and grepped (never executed). No account, no key, no wallet, nothing signed, no POST/PUT/DELETE, no PayBox tool called, no third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months old).
Third-party text (pages, bundles, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/clutch-markets/` (6 files, each <= 5 KB).
Relationship to an earlier in-repo note: `docs/research/venues/clutch-markets-predictions.md` (+ `docs/research/fixtures/clutch-markets-predictions/`) already holds a deep on-chain read of the ApeChain contract (verified source, event counts). I did not repeat that work; I re-checked its headline claim independently (section 1) and add what it lacked: the official docs/site statements, the Arbitrum app, the front end's data feeds and the current dormancy evidence. Where I rely on that note and did not re-read the primary source, I tag it **M (earlier note)**.
WebSearch budget: one extended search worked, then the shared session budget ran out; the rest is direct fetches.

## 0. Verdict

**adapter_priority: skip.** `still_live: false` in the sense that matters for a scanner: the brand and websites are alive, the parlay product is **dormant / "migrating to Clutch V4"** and serves no markets.

1. **Dormant (H).** Both front ends say "Clutch is migrating to Clutch V4" (ApeChain app) or show an empty shell (Arbitrum app); the Arbitrum app's market feed returned `{"markets":[]}` and its sportsbook feed returned upstream 401 on 2026-10-19 (fixtures `app_api_odds_*`). The ApeChain contract has had **zero `BetPlaced` since 2025-11-04** (re-checked on-chain today, fixture `apechain_parlay_recheck_2026-10-19.json`).
2. **Tiny (H).** DefiLlama TVL 2026-10-19: ApeChain $12,743 + Arbitrum $4.5 = $12.7K total (peak $606K on ApeChain 2025-11-21; $62.9K on Arbitrum 2025-04-22).
3. **Not a market, a house book (H).** Bettors stake against an LP pool ("Be the Bank"). Odds are a free parameter of `placeBet`; a single owner key resolves. No order book, AMM, outcome tokens or quotable prices.
4. **Not an independent leg (H).** Every price shown is copied from The Odds API (DraftKings, then FanDuel) or Polymarket. Anything it quotes is a derivative of venues already covered.
5. **No official API (H).** No public docs for data, no OpenAPI, no SDK, no GitHub org. The only data surfaces are on-chain events and an undocumented HMAC-guarded backend.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Clutch Labs homepage `https://www.clutch.markets/` (HTTP 200, copyright 2026) lists DPP as "Currently migrating to Clutch V4." with links to the Arbitrum app and ApeChain app. Same page lists StonkBrokers launch 2026-07-17 and Aug 2026 items, so the company is active, just not on parlays | text on page | H |
| ApeChain app `https://ape.clutch.market/` (HTTP 200) visible text: "Clutch Markets Decentralized Parlay Platform / Clutch is migrating to Clutch V4 / More details coming soon / Check out our $APE Rebate Program!" No markets, no bet UI | 2026-10-19 | H |
| Arbitrum app `https://migrate.clutch.market/` (HTTP 200; the host name itself says "migrate") shows category tabs (Polymarket, Sports, Politics) and a USDC Rebate Program banner; client-rendered, markets loaded from `/api/odds` | 2026-10-19 | H |
| `GET https://migrate.clutch.market/api/odds?endpoint=/markets` | HTTP 200 after 31 s, body `{"markets":[]}` (the Polymarket-leg list is empty) | H |
| `GET https://migrate.clutch.market/api/odds?endpoint=/sports/` | HTTP 401 `{"error":"Failed to fetch data"}` (upstream sportsbook feed rejected the project's key/quota) | H |
| ApeChain contract `0x7F66d16A488Eae9e2B61BfB186fD94bBA3611416` (verified, `APENativeDecentralizedParlayPlatform`) logs since block 26,193,244 to latest (~52.44M): **1 BetPlaced (the 2025-11-04 one itself)**, 443 ParlayResolved (last 2026-04-25), 19 LiquidityDeposited (last 2026-08-06), 67 LiquidityWithdrawn (last 2026-07-16); balance 88,998.30 APE | Blockscout GET, 2026-10-19 | H |
| DefiLlama listing: `listedAt` 1743442083 (2025-03-31), `deadUrl: true`, `url` empty, category "Prediction Market", chains Arbitrum + ApeChain, parent `clutch-markets` (`url` pupcup.clutch.market, github field `Clutch-Markets`, twitter `clutchmarkets`) | `api.llama.fi/protocol/clutch-markets-predictions` and `/protocol/clutch-markets` | H |
| `https://clutch.market/` | TLS handshake failure (`tlsv1 alert internal error`) from curl and WebFetch; DNS 2.57.91.91 | H |
| Sibling products `apespredict.com`, `arbitrumpredicts.com` (permissionless prediction markets, see section 10) | DNS 92.113.31.25, TCP 443 refused/timeouts from curl and WebFetch | H |
| Third-party comparison page (polycatalog.io, "Last updated: August 2026") lists "Clutch" as "Active", "third-party / independent", says it "operates as a Telegram bot" and is "built around Polymarket markets". Likely thin or conflated listing; contradicted by the primary evidence above | secondary | L |

## 2. What it is

- **Kind**: onchain-other. A decentralized parlay platform ("DPP", formerly "Smoovie Phone" on Sanko chain) by Clutch Labs. Docs (`https://www.clutch-docs.market/`): "a fully on-chain, non-custodial betting system built on Arbitrum One ... allow users to create parlay bets by combining multiple selections into a single wager, increasing potential payouts based on compound odds" (H).
- **Market model (H)**: parlay of 2+ legs; legs are NOT separate on-chain markets. `placeBet(string id, uint256 odds, uint256 wager, string tokenURI)`: `id` is a backend UUID created by `POST /parlay-bets`, `odds` is the combined decimal odds (1e18 fixed point) computed **client-side** (the bundle multiplies the legs' prices), `tokenURI` points at backend metadata with the leg list. Outcome tokenisation: none; the only token is an ERC-721 receipt per bet ("Each bet mints a unique NFT"). Rules from docs: all legs must win; a lost leg loses the parlay; bets on players declared inactive are void and refunded; "correlated bets may be voided" (discretionary).
- **Liquidity model (H, docs)**: "Be The Bank": LPs deposit, bettors' wagers are matched against the pool, winners are paid from the pool, losing stakes accrue to LPs; liquidity locked 1 month. A single LP-pool book, so no price discovery by participants.
- **Chains and collateral**:
  - **Arbitrum One**: two instances read from the front-end bundle and the DefiLlama adapter (H): USDC instance `0xbBEa81aBd42e8804de0f7d167Cf8123206d55039` (native USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`, 6 dec) and CLUTCH-token instance `0x52070c2F7527822ccAEa77E46fb23754151e2793` (CLUTCH `0x05905af7933f89280aB258919F0dFA056CeD8e43`, 18 dec; CLUTCH supply stated as 35,383 and "fair launch"). Arbitrum TVL today: $4.5 (essentially empty).
  - **ApeChain (33139)**: the live-history contract is native-APE (`payable placeBet`), `0x7F66...1416` (earlier note: deployed 2025-05-16 by `0x605c...10c5`, owner `0xf956...2097` is an EOA, LP deposits gated to Clutch Puppies NFT holders; M earlier note, owner and balance re-read H today). An ERC-20 "ApeUSD" variant `0x812D...33C6` is referenced by the front end and DefiLlama but has never been used (M earlier note).
  - Sanko chain (1996) was the original deployment; bundles still reference it (M).
- **Operator**: Clutch Labs ("Clutch Markets"); X `@clutchmarkets`; Telegram `smooviephonehotline`; Discord invite on the docs. No official GitHub (`gh api orgs/Clutch-Markets` and `users/Clutch-Markets` both 404, H). Audits: none (DefiLlama `audits: "0"`, H).
- **Categories (H)**: Polymarket-sourced binary legs (politics, crypto price, misc.) and sportsbook games (NFL, NBA, MLB, soccer; "FanDuel odds" per ApeChain's directory page) through The Odds API.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official docs for developers / REST / GraphQL / WS | **NOT FOUND** (searched: `clutch-docs.market` single-page product docs with no API section; `migrate.clutch.market/how-it-works`; `clutch.markets`; ApeChain directory `apechain.com/apps/clutch-market`; GitHub `Clutch-Markets` 404; no OpenAPI link on any page) | H |
| Front-end proxy `https://migrate.clutch.market/api/odds?endpoint=<path>` | Same-origin Next.js route that forwards to Polymarket-leg list (`/markets` -> `{"markets":[{id, marketQuestion, marketDescription, marketLink, marketEndDate, ...}]}`) and The Odds API (`/sports/`, `/sports/<key>/odds/&regions=us`; prefers `draftkings`, then `fanduel`). Undocumented, 31 s latency, empty or 401 today. Not a stable integration surface | H |
| Backend `https://server.parlayplatform.com` (nginx + Express, HTTP 200 at `/`, `access-control-allow-origin: *`) | Routes seen in the bundle: `POST /parlay-bets` (create parlay, returns id), `GET /parlay-bets/<id>` (NFT metadata), `GET /game/image/<id>`, `/bank`, `/leaderboard`. The front end's axios instance adds an `X-HMAC` header derived client-side from the request body (anti-abuse; the shared secret ships in the public bundle, which I neither recorded nor used). I did not probe it beyond `/` | H |
| On-chain reads | `totalLiquidityPool()`, `totalLiability()`, `winningFee()`, `paused()`, `tokenIdToParlay(uint256)`, `getUnresolvedParlaysLength()` etc. (fixture `arbitrum_parlay_contract_abi_functions.txt`); events `BetPlaced(address indexed user,uint256 wager,uint256 tokenId)`, `ParlayResolved(address,uint256,bool,uint256)`, `ParlayVoided(uint256)`, `LiquidityDeposited/Withdrawn`. View calls need JSON-RPC (POST), not done this run. Event logs can be read with GET on ApeChain Blockscout (`https://apechain.calderaexplorer.xyz/api?module=logs&action=getLogs...`, confirmed). Arbitrum Blockscout sits behind a Cloudflare challenge (not bypassed), Arbiscan 403 per earlier note | H |
| Rate limits, auth for reads | NOT FOUND | - |
| WebSocket | NOT FOUND | - |

Verdict for the aggregator: nothing to ingest. Even a perfect indexer yields "parlay placed/resolved, pool size", not quotes. Real response samples are in `fixtures/clutch-markets/` (`app_api_odds_markets_raw_2026-10-19.json` = `{"markets":[]}`, `app_api_odds_sports_401_raw_2026-10-19.json`); there was no non-empty payload to capture.

## 4. Trade path

- **Mechanics (H, bundle ABI + earlier verified ApeChain source)**: (1) front end `POST /parlay-bets` with the legs, HMAC header, returns a bet `id`; (2) for ERC-20 instances, `approve(token -> parlay contract)`; (3) `placeBet(id, odds, wager, tokenURI)`; caller receives the ERC-721 receipt. Users onboard via an Alchemy Account Kit smart account (email/X login, ERC-4337 user operations, gas sponsored for first-time users per the Arbitrum blog), but any EOA can call the contract.
- **No on-chain check that `odds` is a real price** (earlier note, ApeChain source, M); settlement is discretionary (section 6). Not something to exploit; I called nothing.
- **Cancel/withdraw**: no bettor cancel; only owner `cancelParlay`/`resolveParlay`. LPs: `depositLiquidity`/`withdrawLiquidity`, 30-day lock (H docs: "locked for 1 month").
- **PayBox**: partial. Arbitrum One and ApeChain both exist in PayBox's chain catalog per the earlier note's `discover_tokens` read (M earlier note; I did not call PayBox), so an EVM `transactionProposal` for `approve` + `placeBet` is technically expressible. In practice step (1) needs the undocumented HMAC backend, the Arbitrum pool holds ~$4, ApeChain has no activity, and the resolver is a single key. Not recommended.

## 5. Fees

- Docs conflict (H): `clutch-docs.market` tokenomics: "Winning Bets Fee .42%" and "Each winning parlay incurs a 0.42% fee, burning $CLUTCH tokens and boosting liquidity"; `migrate.clutch.market/how-it-works`: "A 4% fee is applied to all winning payouts to support platform operations and development." Current page (2026) says 4%, the docs site is older-looking (M).
- Contract: `winningFee` (owner-settable via `setWinningFee`) and, on Arbitrum, `TAX_RATE()`/`taxableToken()`. ApeChain verified source: default `winningFee = 400000/10,000,000 = 4%` of payout to owner, payout = `wager * odds / 1e18`; losing stakes go to LPs (earlier note, M). Current on-chain value not read (needs JSON-RPC POST).
- Hidden cost: the house margin is whatever the front end bakes into `odds`; legs are priced from sportsbook odds which already contain bookmaker vig, compounded per leg (M). "Winnings are paid out in tokens, meaning the USD value may vary at settlement" (docs, H) on the CLUTCH-denominated instance.

## 6. Resolution and dispute risk

- Marketing (H): "AI-Powered Settlements with ORA ... Automated, trustless market resolution via smart contracts ... Currently live" (docs); "AI resolver using Ora's AI-powered settlements ... real-time data and news feeds" (how-it-works). Clutch Labs lists ORA Protocol as its "AI oracle".
- Contract reality: `resolveParlay(uint256 tokenId, bool outcome)` and `cancelParlay(uint256)` plus `owner()`, `pause()`, `setWinningFee` in the ABI (H, bundle). On the verified ApeChain source these are `onlyOwner` and the owner is an EOA (M earlier note). No dispute window, bond, evidence trail or timeout. Total key/counterparty risk plus discretionary voiding of "correlated" bets.
- Stale state: ~467 ApeChain parlays inferred unresolved as of the earlier note (M).

## 7. Geo / ToS / automation

- Terms of service, geo restrictions, bot/API rules: **NOT FOUND** (searched: `clutch-docs.market`, `migrate.clutch.market`, `ape.clutch.market`, `clutch.markets` HTML for terms/privacy/geo/KYC strings; none present; footers are "All rights reserved" only). The docs risk text says only "regulatory uncertainties that could impact the value and availability of your funds" (H).
- Sports parlays are regulated gambling in many jurisdictions and the operator publishes no compliance position; any real use needs a legal view. No code-level geo block known.
- Automation: no stated rule; the HMAC header and 18-minute axios timeout show the backend is built for its own front end only.

## 8. Liquidity (source, date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL total | $12,747 (ApeChain $12,743 APE-denominated; Arbitrum $4.5 USDC; staking $0) | `api.llama.fi/protocol/clutch-markets-predictions`, 2026-10-19 | H |
| TVL peaks | ApeChain $606,185 (2025-11-21); Arbitrum pool $62,891 (2025-04-22, to ~0 by 2025-04-27); CLUTCH staking $200,463 (2025-04-02, 0 since 2025-11-09) | DefiLlama history | H |
| ApeChain TVL trend | ~$430K (2026-01-18) -> $19K (2026-02-17) -> $11-15K flat Mar-Oct 2026 | DefiLlama | H |
| ApeChain contract balance | 88,998.30 APE at block 52,442,262 | Blockscout, 2026-10-19 | H |
| Project claims | "$60K+ Liquidity Pool, 1,000+ Total Bets, 99.9% Payout Rate" (homepage); docs stat strip "Number of Bets 1005, Liquidity Pool $60605"; "30,000+ transactions and $500,000+ in bets" across Clutch platforms during the ApeCoin Spotlight (July 2025) | clutch.markets, clutch-docs.market | L (stale, self-reported; contradicted by TVL and by 5,033 ApeChain bets / ~111K APE lifetime stake per earlier note) |
| Volume / OI / fees | none: DefiLlama dexs/fees/options endpoints return HTTP 400 "not found" for the slug; no bets for 11.5 months on ApeChain | 2026-10-19 | H |

## 9. Event overlap and shared liquidity

- **Overlap with other venues**: all legs are Polymarket markets (politics, crypto thresholds) or sportsbook games (NFL/NBA/MLB/soccer) that Polymarket, Kalshi and others already list. In principle a mispriced parlay could be hedged leg by leg, but a parlay is a bundled, discretionary-settlement product with a 15%-of-pool exposure cap (M earlier note), no markets are offered now, and a $13K pool cannot absorb size.
- **Shares liquidity with**: nothing in the order-routing sense (own LP pool), but **prices are slaved to Polymarket and DraftKings/FanDuel** (H, bundle code + docs: "Live odds are sourced from top sportsbooks and Polymarket"). So not an independent price signal and not an independent arbitrage leg. Settlement source (ORA / owner) differs from Polymarket's UMA, which adds basis risk rather than edge.
- Value as a Quotient signal: none (no flow, no quotes).

## 10. Sibling products (not Clutch DPP, flagged for the orchestrator)

- **Apes Predict** ("Decentralized prediction market on ApeChain. Users create their own markets, stake $APE, and earn rewards for accurate outcomes with onchain resolution", permissionless creation, creator fee royalty) and **ARB Predicts** ("USDC denominated prediction market on Arbitrum with community market creation, live leaderboard, and trustless onchain resolution"). Both are on `clutch.markets` (H) and were launched by Clutch Labs (ARB Predicts Jan 2025, Apes Predict mid-2025). Their sites refused connections from my vantage (section 1).
- The earlier note found an ApeChain contract `APEPredicts` at `0xF609394F0882B732b287db10d1b0F53211a09f75` with ~11.4K transactions and recent `claim`/`createElectionGame` calls (2026-07/08) and a different deployer (M earlier note). Worth its own discovery check; it may be the same product as Apes Predict.
- Clutch Perps (`dex.clutch.market` is a GitHub Pages 404), Anvil AMM, StonkBrokers (Robinhood Chain, chain 4663), Clutch Puppies/Pixel Pups NFTs, Super Squares: not prediction venues for this project.

## 11. If an adapter were ever built (not recommended)

An event indexer over `BetPlaced`/`ParlayResolved`/`ParlayVoided`/`LiquidityDeposited|Withdrawn` on the Arbitrum and ApeChain instances, plus leg recovery from `tokenURI` (backend `GET /parlay-bets/<id>` or inline base64). Produces a ledger, not prices. Revisit only if Clutch V4 ships documented, quotable markets.

## Sources

All fetched 2026-10-19 unless noted.

- Clutch Labs homepage (H): https://www.clutch.markets/ (WebFetch summary and raw HTML text; DPP "Currently migrating to Clutch V4", stats, roadmap, Apes Predict / ARB Predicts blurbs).
- DPP docs (H): https://www.clutch-docs.market/ (WebFetch summary and raw HTML; fees ".42%", ORA settlement, liquidity lock, Arbitrum One, stat strip).
- Arbitrum app and how-it-works (H): https://migrate.clutch.market/ , https://migrate.clutch.market/how-it-works (4% fee, ORA AI resolver, Polymarket + sportsbook odds). Public JS chunks `https://migrate.clutch.market/_next/static/chunks/2058-4677b01bdfd07861.js` and `.../app/page-30a9c852e6cb1051.js` read as text (routes, ABI, contract addresses).
- ApeChain app (H): https://ape.clutch.market/ and its chunk `.../chunks/9969-bcc9af5aa1dd8a0f.js` (read as text).
- Front-end proxy probes (H): `https://migrate.clutch.market/api/odds?endpoint=/markets` and `...?endpoint=/sports/` (fixtures); `https://server.parlayplatform.com/` (HTTP 200 headers).
- DefiLlama (H): https://api.llama.fi/protocol/clutch-markets-predictions , https://api.llama.fi/protocol/clutch-markets , `https://api.llama.fi/summary/{dexs,fees,options}/clutch-markets-predictions` (400); adapter `gh api -H "Accept: application/vnd.github.raw" repos/DefiLlama/DefiLlama-Adapters/contents/projects/clutch-market/index.js`. The HTML page https://defillama.com/protocol/clutch-markets-predictions returned 403 to WebFetch.
- ApeChain explorer (H): https://apechain.calderaexplorer.xyz/api/v2/addresses/0x7F66d16A488Eae9e2B61BfB186fD94bBA3611416 , `/api/v2/stats`, `/api?module=logs&action=getLogs&fromBlock=26193244&toBlock=latest&address=0x7F66...1416`.
- Arbitrum Foundation blog, 2025-03-04 (M/L, >6 months old): https://blog.arbitrum.io/clutch-expands-to-arbitrum-one/ (Polymarket as odds data source; no fee/contract detail).
- ApeChain directory (M): https://apechain.com/apps/clutch-market (describes Clutch Market as parlays on Polymarket + FanDuel-based sports odds, Apes Predict as single-leg sibling).
- Third-party (L): https://www.polycatalog.io/betstack-vs-clutch (Telegram-bot claim, "Active", probably conflated); unaffiliated GitHub stub `hubseer/Clutch-The-world-s-first-on-chain-decentralized-parlay-betting-platform-on-Polymarket.` (metadata only, not read, not an official repo).
- Earlier in-repo note (M): `docs/research/venues/clutch-markets-predictions.md` and `docs/research/fixtures/clutch-markets-predictions/` (verified ApeChain source, event totals, owner EOA).
- WebSearch (one extended query, 2026-10-19): results incl. https://x.com/ClutchMarkets/status/1887538707277689071 (Feb 2025 "Polymarket parlays are officially live"; snippet only, X page not fetched, L).

## Not found

- Official data API, OpenAPI, SDK, WebSocket, GitHub org, audit report, ToS, geo policy, rate limits.
- Any non-empty market payload (feeds empty/401 today).
- Current `paused()`, `winningFee()`, `totalLiquidityPool()` on the Arbitrum instances (needs JSON-RPC POST; Arbitrum explorers blocked by Cloudflare/403, not bypassed).
- Details of "Clutch V4" (the Q1-2026 roadmap item on `clutch.markets` is "v4 leveraged prediction markets", which may be a different product from the parlay migration).
- X account `@clutchmarkets` content (earlier note: HTTP 402 to WebFetch; not retried, no payment).

## Open questions

1. Will Clutch V4 relaunch parlays with documented, quotable markets? Unknown; no date given anywhere.
2. Are Apes Predict / ARB Predicts (permissionless, creator-defined markets) live and liquid? They look like the only Clutch products that could be real prediction markets; sites unreachable from here, ApeChain contract `0xF609...9f75` lead from the earlier note.
3. Which contract does the Arbitrum app currently write to, and is it paused? (Arbitrum TVL $4.5 suggests nobody can win anything meaningful.)
4. Is `odds` validated anywhere on-chain? (Earlier note says no on ApeChain; unverified for the Arbitrum ERC-20 variant.)

## Suspicious content and hygiene

- No text aimed at AI agents found on any page, bundle or API response read.
- The public JS bundles ship embedded third-party credentials (an Alchemy API key; per the earlier note also a sports-odds key and an HMAC secret). None was copied into these notes or fixtures, none was used, and the downloaded bundle copies were deleted from scratch. The `X-HMAC` header scheme was observed, not replicated.
- A scratch file from another run (Kalshi market data) was visible in the shared scratch directory and was displayed once by mistake; its content was ignored and is not used here. My first few downloads used generic file names in the shared scratch root (a few small generic files there may have been overwritten); I then switched to a private subfolder and deleted the bundle and HTML downloads.
- Privacy: all scripted requests used User-Agent `insurance-markets-research/0.1`; no contact details in any request; scripts and fixtures grepped for `@` and the user's name: the only `@` hits are the project's own public X handle; no personal identifiers. Addresses recorded are public contract/token addresses only (no user wallet).
