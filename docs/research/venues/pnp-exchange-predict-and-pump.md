# PNP Exchange (Predict and Pump, pnp.exchange) - venue adapter spec

Researched 2026-10-19. READ-ONLY: public docs pages, `gh api` file reads of the `pnp-protocol` GitHub org, npm registry metadata, unpkg file reads of published npm packages (text only, nothing installed or run), unauthenticated GETs to public hosts, WebFetch of Basescan and CoinGecko pages. No account, wallet, API key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or executed. Scripted requests used the User-Agent `insurance-markets-research/0.1`. One local helper (pure Python, no network) computed Solana PDAs from the SDK's published seeds.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (docs, READMEs, agent "skill" files, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/pnp-exchange-predict-and-pump/` (8 files, each <= 7 KB).
Search note: the shared WebSearch budget ran out after one extended search, so the last open questions (X posts, press) were not searched.

## 0. Verdict

**adapter_priority: skip.** `still_live`: **false for the prediction-market product** (the brand, site and docs are up; the product has changed).

1. **The site pivoted.** On 2026-10-19 `https://www.pnp.exchange/` is "Launch a coin on Solana. Run a Polymarket desk": a token launchpad whose coins fund a trading account that trades **on Polymarket**. There is no markets feed (`/markets`, `/market`, `/create`, `/app`, `/trade` all 404; nav is Explore / Mechanism / Tokenomics / Launch a coin). (H, homepage + route probes.) That product has no liquidity of its own, so it is not an independent venue (section 9).
2. **The original prediction markets are dormant.** The only market index I could reach lists 5 markets, newest created 2026-07-16, **none ever traded** (reserves and token supplies equal the seed). Three Base factory contracts show <= 28 direct transactions each, the last on 2026-03-22. The project token trades about $85/day. (H index; M for Basescan numbers read via WebFetch.)
3. **No usable data API.** The official docs publish an SDK, not an API. The only HTTP "indexer" is a per-market oracle-status service plus an undocumented list that holds 5 rows. Prices, reserves and trades are readable only from chain state (Solana accounts, Base contract calls), which needs JSON-RPC (POST), not available to this run.
4. **Resolution is centralized** (admin/protocol oracle/creator-chosen settler can settle and can move `endTime` into the past; "AI oracle" using Perplexity + Grok; DAO backstop; no on-chain dispute window found).
5. Revisit only if a markets UI returns or on-chain Solana activity shows real volume (section 11).

## 1. Is it live (2026)?

| Evidence | Value | Tag |
|---|---|---|
| Homepage `https://www.pnp.exchange/` | HTTP 200, title "PnP: Launch a coin on Solana. Run a Polymarket desk." Describes launchpad + Polymarket account. No mention of the old market feed. Fixture `site_home_text_2026-10-19.txt` | H |
| `https://pnp.exchange/` | redirects to `www.pnp.exchange` | H |
| Old-app routes `/markets /market /create /app /trade /leaderboard` | all HTTP 404; `/explore /launch /portfolio /fund/<id>` exist (client-rendered "board of funds") | H |
| Docs `https://docs.pnp.exchange/` (Mintlify) | HTTP 200; every page `lastmod` 2026-07-12 (fixture `docs_sitemap_2026-10-19.xml`). Docs still tell users to "Go to pnp.exchange and explore the Markets feed", which the site no longer has, so docs are stale relative to the site | H |
| `pnp-core` SDK on npm | v0.1.0 published 2026-07-12, repo `proxima424/pnp-sdk-v2` (not reachable via `gh api`, 404) | H (npm), M (repo) |
| Legacy `pnp-sdk` npm | latest 0.2.11, 2026-03-27 | H |
| `pnp-evm` npm | latest 0.1.4, 2026-02-12 | H |
| GitHub org `pnp-protocol` (10 repos) | newest push 2026-04-11 (`solana-skill`); `skills` 2026-02-10; `pnp-adapter-nextjs-template` 2026-01-29; `interaction-v1` is empty | H |
| Oracle-DB market list (`/api/markets`) | 5 rows, ids 8-13 (no 10); newest `created_at` 2026-07-16T12:15Z; `type` coin/youtube/dao; zero trades (section 9). Fixture `indexer_api_markets_2026-10-19.json` | H |
| Base `PNPFactory` contracts (3, section 3) | Basescan pages (WebFetch): 0xc2a4... 28 txs, last 2026-03-22 (Settle Market); 0x8747... 28 txs, last 2026-02-04; 0x6617... 1 tx, 2026-01-29 | M |
| Token `PNP` (Solana, `UVcu7kbVKW...pump`) | GeckoTerminal 2026-10-19: price $0.0000979, FDV $97.9K, reserve $14.0K, 24h volume $84.7; pump.fun graduation completed 2025-12-17. CoinGecko page (WebFetch): mcap $101K, 24h vol $87.44, pool "inactive". Fixture `geckoterminal_pnp_token_2026-10-19.json` | H (GeckoTerminal API), M (CoinGecko page) |
| `@predictandpump` on X, Telegram | not fetched (x.com not reachable by WebFetch; search budget used) | NOT FOUND |
| Solana program `8PyE2dizL52g...HuTb` transaction history | **not verified**: Solscan 403, solana.fm 502, no keyless GET explorer; JSON-RPC is POST (not used) | NOT FOUND |
| DefiLlama | no protocol with name/slug/url matching `pnp` among 8,758 protocols (`api.llama.fi/protocols`, 2026-10-19) | H |

Staleness: nothing older than 6 months was relied on except the GitHub/npm pushes of Jan-Apr 2026, which are used only to show the Base/EVM line stopped at about March 2026 (L for "current").

## 2. What it is and the market model

Two different things share the brand. Do not mix them.

**A. Current product (site, 2026-10-19): "PnP" launchpad on Solana to Polymarket (H, homepage).**
- Coins launch on a Meteora DBC bonding curve (opens at $7,000; token supply 1B, mint authority revoked). Fee 3% per trade on the curve, 2% after graduation. Buys: 90% of fee bridged to the coin's own Polymarket wallet as trading capital, 10% protocol. Sells: fee buys back and burns. Winning close: 80% compounds, 20% buys back and burns. "Account withdrawals: none, ever." Creator trades the Polymarket account in public with a key that cannot withdraw; creator upside is their own first buy (capped at 5% of supply). "Built on Solana, Trades on Polymarket."
- The front-end bundle calls a backend `wow-capital-server-production.up.railway.app` (paths such as `/funds`, `/catalogue`, `/markets/<id>/book`, `/portfolio/<wallet>`), i.e. a catalogue/book proxy of Polymarket. I did one GET to `/health` (HTTP 200) and nothing else on that host because it is undocumented. The bundle also embeds a third-party RPC URL with an API key; not recorded here. (H for bundle content, M for interpretation.)
- This is a Polymarket front-end and meme-token wrapper. It adds no independent price for any event.

**B. Original PNP prediction markets (docs, SDKs; mostly dormant) (H, docs.pnp.exchange + SDK source).** Binary only (YES/NO). Four models:
| Model | Chain | Mechanism | Notes |
|---|---|---|---|
| V2 "Pythagorean" AMM | Solana | Bonding-curve AMM, creator seeds X collateral, split 50/50 into YES/NO supplies; mid-market sell back to curve; winners split the reserve | Docs `models/bonding-curve`. Min lifetime 2 days. Price formulas (SKILL.md of `pnp-protocol/solana-skill`): `yesPrice = R*Y/(Y^2+N^2)`, `noPrice = R*N/(Y^2+N^2)`, `yesMultiplier = 1+(N/Y)^2`. Docs prose says "Price(YES)^2 + Price(NO)^2 = 1, both about 0.707 at 50/50" while the SDK says a fresh market reads 0.5/0.5. **Docs conflict (open question 1).** |
| V3 parimutuel "P2P" | Solana | Creator backs one side, takers fill the other, winners split the pot; no mid-market exit; optional `oddsBps` 100-9900; markets id >= 79 are whitelist-gated (only creator on own side; opposite side gated) | Docs `models/parimutuel-p2p`, `NEW_RULES_FROM_MARKET_ID = 79` |
| Bubblegum | Solana | Each market also launches an SPL token on a bonding curve that graduates to an AMM; outcome odds from an internal CPMM | Docs `models/bubblegum`; no evidence of live markets |
| PAMM | EVM (docs: Base, Polygon, Monad testnet) | Constant-product on "virtual reserves": `V_YES=R-S_YES`, `V_NO=R-S_NO`, `price_YES=V_NO/(V_YES+V_NO)`; ERC-1155 outcome tokens issued by the factory itself | Docs `models/pamm-*`; `pnp-evm` ABI |

- **Tokenisation**: Solana = SPL mints per market (`v3-yes-token`/`v3-no-token` seeds; V2 mints appear after first buy); EVM = ERC-1155 ids from `getYesTokenId/getNoTokenId(conditionId)` on the factory (H, ABI).
- **Payout is not $1 per token.** Winners split the *entire reserve* (`payout = tokens/total_winning_supply * R`), so outcome-token prices are not probabilities and complete-set arbitrage math differs from Polymarket/Kalshi. An aggregator should convert to implied probability itself (inference: `1/yesMultiplier = Y^2/(Y^2+N^2)`; M, untested). (H for payout rule; M for conversion.)
- Docs also describe six market "types" (settlement providers): General, Coin, Twitter, DefiLlama, YouTube, Kalshi-derivative (second-order markets on Kalshi price paths via DFlow). (H, docs `market-types/*`.)

## 3. Chains and collateral

| Chain | Contract | Collateral | Status |
|---|---|---|---|
| Solana mainnet | program `8PyE2dizL52ga7ytqLtqRyjwWp4yXEx8M5Z4BAHgHuTb` (SDK constant `PNP_PROGRAM_ID`, same in `solana-skill`) | Default USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`; any SPL/Token-2022 mint allowed (H) | Activity unverified |
| Base (8453) | `PNPFactory` **three** deployments: `0xc2a4CCE465EB6013eb4B7Fdf6905fb6C836e2B15` (current in `pnp-evm` 0.1.4 constants and `pnp-protocol/skills`), `0x8747c9C8938E781e19e79Cf129099Ca02c54e655` (pnp-evm ARCHITECTURE doc), `0x66177AC64968b348393Dd05b1664935947832D9E` (pnp-evm README); FeeManager `0xA919362052CDeB14e88656A4Ae56A41416Fe4fc0` | USDC `0x833589fC...A02913`, WETH, cbETH or any ERC-20 | Dormant (section 1) |
| Polygon | claimed in docs; address NOT FOUND (searched: docs, pnp-evm package, skills repo) | - | unknown |
| Monad testnet | claimed in docs | - | irrelevant |
| Launchpad product | Solana (Meteora DBC) + Polymarket account (Polygon) | SOL/SPL; Polymarket USDC | live but a Polymarket wrapper |

Arena side-project (`pnp-protocol/arena`, `pnp-solana-toolkit`): "prediction market battlefield for AI agents", all markets collateralised in $PNP (the worthless-ish meme token), points-and-prize-pool gamification. Its API host `pnp-solana-toolkit-production.up.railway.app` now returns Railway "Application not found" (HTTP 404, 2026-10-19). Not integrable. (H.)

## 4. Read API

**exists: onchain-or-subgraph-only** (plus one thin undocumented HTTP service).

- **Official docs**: `https://docs.pnp.exchange/` (Mintlify; `llms.txt`, `sitemap.xml`, each page available as `.md`). SDK page `sdk/overview`, `sdk/api-reference`. No REST/WebSocket/subgraph reference page. (H; fixture `docs_llms_txt_2026-10-19.txt`.)
- **SDK reads (on-chain, need an RPC)**: `pnp-core` 0.1.0 (`PnpClient.mainnet()` read-only): `p2p.getMarket(id|pda)`, `p2p.nextMarketId()`, `amm.getMarket`, `amm.readPrice` -> `{yesPrice,noPrice}`, `amm.readMultiplier`, `p2p.fetchGlobalConfig`. Legacy `pnp-sdk` (readme in `solana-skill`): `fetchMarketAddresses()`, `fetchMarket`, `getMarketPriceV2`, `trading.getMarketInfo`. Market PDAs: seeds `market-v2` / `market-v3` + u64 LE id under the program (H, SDK source; I derived sample PDAs locally). No trade/volume history API.
- **EVM reads** (`eth_call` on the factory; H, ABI in fixture `pnp_evm_factory_abi_signatures.json`): `getMarketPrices(conditionId)` -> (yes, no) 18 decimals, `previewMint/previewBurn`, `marketQuestion`, `marketEndTime`, `marketReserve`, `marketSettled`, `winningTokenId`, `collateralToken`, `marketCreator`, `PROTOCOL_FEE`, `TAKE_FEE`; events `PNP_MarketCreated`, `PNP_DecisionTokensMinted/Burned`, `PNP_MarketSettled`, `PNP_PositionRedeemed`. Market enumeration = `eth_getLogs` on `PNP_MarketCreated`.
- **HTTP "oracle / userdb" service**, base `https://pnp-userdb-production-3846.up.railway.app/api` (SDK constant `DEFAULT_ORACLE_API_URL`; root returns "Hello World!" and errors look NestJS-style; docs name the constant but not the URL) (H, `pnp-core` source):
  - `GET /markets/{pda}/resolvable-status` -> `{"status":"checking"|"true"|"false"}`. For addresses it does not know it returns `{"status":"checking"}` (fixture), so it cannot be used to test market existence.
  - `GET /markets/{pda}/settlement-criteria` -> 404 `"Market with address ... not found in oracle database"` for unknown markets (fixture).
  - `GET /markets` (undocumented; found by probing) -> `{"results":5,"sortBy":"created_at DESC","data":[{id, market(pda), creator, question, initial_liquidity, market_reserves, yes_token_supply, no_token_supply, end_time, resolved, yes_token_mint, no_token_mint, signature, slot, timestamp, created_at, updated_at, category, creator_fees, type, market_volume}]}`. `?limit=100` still returns the same 5 rows; `?page=2` -> HTTP 500; `?offset=5` -> 400 "property offset should not exist". (H; fixture `indexer_api_markets_2026-10-19.json`.) Amounts are 6-decimal base units.
  - Rate limit header: `x-ratelimit-limit: 60`, `x-ratelimit-reset: 60` (60 requests per minute), no auth. (H.)
- **Criteria server**, `https://settlement-criteria-server-production.up.railway.app`: `GET /v1/criteria/{market}?cluster=mainnet` (public read), `POST /v1/criteria` (signed with the creator's ed25519 wallet; not called). (H, SDK source.)
- **WebSocket / streaming**: NOT FOUND (searched: docs, llms.txt, SDK bundles, READMEs).
- **Official rate limits for RPC**: none documented; SDK default RPC is the public `api.mainnet-beta.solana.com` (H).

## 5. Trade path and PayBox reachability

- **Programmatic trade: yes, but only by building and signing on-chain transactions** (no order API, no signed-order scheme):
  - Solana V3 parimutuel: `pnp-core` `client.p2p.buy({market, side, amount, minTokensOut, computeUnitLimit})` (H, docs `sdk/trading`). Solana V2 AMM: docs say "AMM markets are create + read in pnp-core today; on-chain AMM buy/sell are not yet exposed"; the legacy `pnp-sdk` has `trading.buyTokensUsdc({market, buyYesToken, amountUsdc, minimumOut})` and `trading.sellTokensBase({market, burnYesToken, amountBaseUnits})` (H, `solana-skill` SKILL.md). Whether legacy `pnp-sdk` instructions still match the deployed program: unverified.
  - EVM: `approve(factory)` on collateral, then `mintDecisionTokens(conditionId, amount, tokenId, minTokensOut, deadline)`; sell via `burnDecisionTokens(conditionId, tokenId, amount, minCollateralOut, deadline)`; redeem `redeemPosition(conditionId)`; ERC-1155 so no approval to burn (H, `pnp-evm` source).
  - New markets (id >= 79, V3) are whitelist-gated for takers (H); a taker needs the creator's gate entry.
- **PayBox**: **partial**. PayBox's chain catalog (live `discover_tokens`, 2026-10-19, from `docs/research/06-paybox-platform.md`) includes Solana, Base, Polygon, Ethereum, Arbitrum, BNB, so the chains are reachable. A Solana `transactionBase64` proposal (<= 1,232 bytes, single signer) or two sequential Base EVM proposals (approve then mint) could in principle carry a PNP trade, with the plugin building instructions by hand from the IDL (no off-chain signed orders exist here). I did not call any PayBox tool. Because markets are dormant, the engineering is not worth it. (M.)
- Settlement or `setEndTime` require an authorized settler key; an aggregator should never be a settler.

## 6. Fees

| Item | Value | Source | Tag |
|---|---|---|---|
| Trading fee, all models | 1% on every buy and sell; split 30% creator / 20% DAO / 50% protocol | docs `platform/fees-and-rewards`, `core-features` | H (docs) |
| Redemption fee | 2% of gross payout (`REDEEM_FEE_BPS = 200`); 60% creator treasury / 40% protocol admin | docs + SDK constants | H |
| Bubblegum | 1% fee, 0.5% creator / 0.5% protocol | docs `models/bubblegum` | H |
| PAMM (EVM) | 1% protocol fee on every buy and sell (to FeeManager; split 50/50 creator/protocol after `endTime`) + 1% "take fee" on buys that stays in reserve; docs: round trip about 3% | docs `models/pamm-economics`; ABI exposes `PROTOCOL_FEE`, `TAKE_FEE` | H |
| Launchpad coin | 3% per trade on the curve, 2% after graduation | homepage | H |
| Gas/rent | Solana tx fee + ATA rent; Base gas | - | M |

Effective round trip on Solana V2/V3: 1% in + 1% out + 2% on redemption of winners. Fee levels on-chain may differ from docs; the Solana program's fee fields were not read (no RPC).

## 7. Resolution and dispute risk

- **Claimed mechanism**: "LLM oracle". Step 1 (before trading): a resolvability gate that builds an authoritative-source list and a locked rubric; Step 2 (after deadline): for General markets Perplexity and Grok are queried independently (source list breaks ties); Coin = Birdeye/CoinGecko, Twitter = Twitter API, DefiLlama = DefiLlama API, YouTube = YouTube API, Kalshi-derivative = Kalshi API. Ambiguous markets escalate to a "PNP DAO" (funded by 20% of fees) that votes; "DAO's decision is final". (H, docs `platform/oracle-settlement`.)
- **What the code says (H, `pnp-core` docs + source)**: `settle()` must be signed by an authorized settler: the market's custom `oracle` pubkey, the protocol oracle, the hard-coded `P2P_ADMIN_KEY` (`9joX7eXbU5N9t3ksw5Aj5mdoPvcjVcVvkzdiestDqbwf`), or the global admin. A settler can also call `setEndTime`, "may be in the past" (settle early). Docs elsewhere say "permissionless settlement calls mean anyone can trigger the resolution process" (`core-features`); that conflicts with the SDK text (open question 2).
- **EVM**: only the **market creator** can settle (`pnp-protocol/skills` SKILL.md: "Only the creator wallet can settle the market"). Fully creator-resolved. (H.)
- **Custom oracle markets**: creator picks any settler pubkey; coded as an agent-friendly feature.
- **Dispute window / challenge**: NOT FOUND (searched docs, SDK, ABI: no dispute or bond functions).
- **Non-resolvable**: creator can reclaim unmatched collateral (`creatorWithdraw`); docs say refunds for fully matched positions on unresolvable markets are "enforced on-chain and not exposed as an SDK method" (H) - trader-side refund behaviour unverified.
- **Risk grade: high.** Centralized admin/creator control, LLM judgement, no dispute, plus the documented Solana "locked liquidity" whitelist rules.

## 8. Geo, ToS, automation

- Terms/privacy/legal pages: `/terms /tos /privacy /legal /disclaimer` on the site and `/terms /legal` on docs all HTTP 404. Geo restrictions: NOT FOUND (searched: site, docs, GitHub readmes). Homepage footer only has a generic risk line ("Trading involves risk; tokens and positions can lose all value. Not financial advice.").
- Automation: the vendor itself publishes agent "skills" (`pnp-protocol/skills`, `solana-skill`) encouraging agents to create and settle markets, so bots are tolerated in practice (M). Nothing forbids or permits it in writing.
- The new Polymarket-wrapper product inherits Polymarket's geo rules for the trading account (M; not covered here).

## 9. Liquidity

- **Markets**: the oracle-DB list (fixture, 2026-10-19) has 5 markets; `market_reserves == initial_liquidity` and `yes/no_token_supply == initial_liquidity` (or 0) in every row, so **no trades since creation**. Seed sizes (6-decimal units, collateral mint not shown): 50, 200, 500, 400 and 4,000 (the last a `dao` market that never opened, `signature: "dao-approved"`). Nominal total 5,150 units. `market_volume` equals the seed in each row, so it is not trading volume. (H.)
- **Base**: three factories; the newest (0xc2a4...) has 28 direct txs lifetime (25 visible rows: 16 creates, 6 settles, 3 mints; the 3 oldest rows were not shown), last 2026-03-22; token holdings $0 on 0xc2a4. (M, Basescan via WebFetch.)
- **TVL/volume of the venue**: NOT FOUND (searched: DefiLlama protocols list, docs, CoinGecko, GeckoTerminal). Nothing to cite beyond the above.
- **Project token**: PNP mcap ~$98-101K, 24h volume ~$85 (2026-10-19). Token metrics are not market metrics.
- **Launchpad product**: sample "fund" pages are shown on the homepage with account balances in the low hundreds of dollars (marketing example, M); the live board is client-rendered and not read.

## 10. Event coverage and shared liquidity

- Docs list General (politics, sports, tech, culture; Perplexity+Grok), Coin (Solana token market cap/price via Birdeye), Twitter metrics, DefiLlama TVL, YouTube views, and Kalshi-derivative (second-order). (H.)
- Actually indexed (5 rows): two Solana-ecosystem token market-cap markets (the question text embeds token contract addresses on another chain, e.g. `robinhood:0x...`), two YouTube view-count markets, one "Will MBappe win ballon d or" (expired 2026-07-14, unresolved). Only the Ballon d'Or question could overlap another venue, and it is stale. Arbitrage overlap is therefore nil in practice; theoretically General sports/politics could overlap Polymarket/Kalshi.
- **Shared liquidity**: the original AMM/parimutuel markets are self-contained (independent, but empty). The launchpad product trades **on Polymarket** and shows Polymarket catalogue/books, so it shares (is) Polymarket liquidity: not an independent leg. Kalshi-derivative markets are derived from Kalshi prices (docs; DFlow feed) and are correlated with, not equal to, Kalshi contracts.

## 11. Priority and revisit triggers

**skip.** Dead/dormant AMM markets, no data API, centralized resolution, and a successor product that duplicates Polymarket.
Revisit if: (a) `pnp.exchange` regains a markets feed or docs get a REST/WS API; (b) a keyless check of the Solana program shows sustained recent transactions (the one thing I could not confirm); (c) the `oracle-DB` list shows markets with `market_reserves != initial_liquidity`; (d) a Polygon PAMM factory address with real activity appears.
Cheap watcher if ever wanted: poll `GET .../api/markets` (60 req/min limit) and alert on new rows or changed reserves. Do not build a trading leg.

## 12. Suspicious or agent-aimed content (recorded, not followed)

- `pnp-protocol/skills` SKILL.md and `solana-skill` SKILL.md are written for AI agents ("Always install the latest `pnp-evm` before running any scripts"; "You MUST save its details to the `markets/` directory"; instructions to export a wallet private key into env vars). Not followed.
- `pnp-protocol/arena` REGISTRATION.md ("PNP Arena - Agent Skill") tells agents to register, create markets and trade for reputation points and a "2,000,000 $PNP prize pool"; it references a trading-allowance service that spends 2,000 PNP per call. Not followed; its API is gone (Railway 404).
- The public site bundle embeds an RPC URL with an API key and a hard-coded backend URL (not recorded or used).
- CoinGecko notice (third-party, M): token contract migrated from an old Solana contract to `UVcu7...pump` (post dated 2025-12-17); Rugcheck flags manipulation risk from concentrated holders.
- npm package metadata lists an individual maintainer email; not copied into these notes.

## 13. NOT FOUND and open questions

1. Price convention: docs say Price(YES)^2 + Price(NO)^2 = 1 with about 0.707 at 50/50 and elsewhere "YES + NO = 1"; the SDK says 0.5/0.5 at launch with `yesPrice = R*Y/(Y^2+N^2)`. Which does the deployed program use? Needs an on-chain read.
2. Is settlement permissionless (docs `core-features`) or authorized-only (SDK docs, EVM creator-only)? Treat as authorized-only.
3. Solana program activity, number of markets, and volume: NOT FOUND (searched: Solscan 403, solana.fm 502, DefiLlama none, docs none; JSON-RPC not used because it is POST).
4. Polygon PAMM address: NOT FOUND.
5. ToS/geo/automation terms: NOT FOUND.
6. WebSocket, subgraph, OpenAPI: NOT FOUND.
7. Whether the 5-row `/markets` list is "all markets" or the oracle DB's recent subset (older Solana markets with id < 79 probably exist on-chain but are not in this DB).
8. X/Telegram announcements about the pivot date: not read (x.com blocked; search budget used). Pivot is dated only to "after 2026-07-16 and before 2026-10-19" (M, from index and docs dates; the homepage example that mentions an NFL fixture is marketing copy and only weak (L) evidence of timing).

## 14. Sources

Primary (H):
- https://www.pnp.exchange/ and `/explore`, `/launch`, `/portfolio` (read 2026-10-19; route probes)
- https://docs.pnp.exchange/llms.txt, `/sitemap.xml`, pages `introduction`, `why-pnp`, `core-features`, `platform/{creating-markets,trading,fees-and-rewards,oracle-settlement}`, `market-types/{overview,general,coin,kalshi-derivative}`, `models/{bonding-curve,parimutuel-p2p,bubblegum,pamm-overview,pamm-mechanics,pamm-economics}`, `sdk/{overview,create-market,trading,custom-oracles,refunds,api-reference}`
- https://github.com/pnp-protocol (org repos list; `skills/{README.md,SKILL.md,references/api-reference.md}`, `solana-skill/SKILL.md`, `pnp-solana-toolkit/README.md`, `arena/REGISTRATION.md`) via `gh api`
- https://registry.npmjs.org/{pnp-core,pnp-evm,pnp-sdk}; unpkg file reads: `pnp-core@0.1.0/dist/index.js`, `pnp-evm@0.1.4/{src/constants.ts,src/modules/*.ts,src/abi/pnpFactory.json,README.md,docs/ARCHITECTURE.md}`, `pnp-sdk@0.2.11` readme
- https://pnp-userdb-production-3846.up.railway.app/api/markets (GET, 2026-10-19; plus `/markets/{pda}/resolvable-status` and `/settlement-criteria`)
- https://api.geckoterminal.com/api/v2/networks/solana/tokens/UVcu7kbVKW6Rs5PKzuwVSbm8ukvrWByS3hBXqHapump (token metrics)
- https://api.llama.fi/protocols (no PNP entry)
- https://api.coingecko.com/api/v3/coins/pnp-exchange (first call returned token metadata and links; later calls rate-limited, so no fixture saved)

Secondary (M):
- https://basescan.org/address/0xc2a4CCE465EB6013eb4B7Fdf6905fb6C836e2B15, `.../0x8747c9C8938E781e19e79Cf129099Ca02c54e655`, `.../0x66177AC64968b348393Dd05b1664935947832D9E` (WebFetch summaries of the address pages; transaction counts and dates are as the page showed them, `base.blockscout.com` and Routescan were not usable)
- https://www.coingecko.com/en/coins/pnp-exchange (WebFetch summary)
- WebSearch (extended) on "PNP Exchange predictandpump bonding curve docs" (surfaced `docs.pnp.exchange/bonding` and MEXC auto-aggregated pages, which I did not rely on)
- `docs/research/06-paybox-platform.md` (this repo) for PayBox chain catalog and proposal limits

## 15. Fixtures (`docs/research/fixtures/pnp-exchange-predict-and-pump/`)

| File | What |
|---|---|
| `indexer_api_markets_2026-10-19.json` | Full `GET /api/markets` response (5 rows) |
| `indexer_api_resolvable_status_unknown_market_2026-10-19.json` | `{"status":"checking"}` for an unknown market PDA |
| `indexer_api_settlement_criteria_404_2026-10-19.json` | 404 body for an unknown market |
| `geckoterminal_pnp_token_2026-10-19.json` | PNP token metrics |
| `docs_llms_txt_2026-10-19.txt`, `docs_sitemap_2026-10-19.xml` | Docs index and lastmod dates |
| `site_home_text_2026-10-19.txt` | Text extracted from the homepage (shows the pivot) |
| `pnp_evm_factory_abi_signatures.json` | 39 functions, 14 events from the pnp-evm ABI |
