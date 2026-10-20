# MetaDAO (Solana futarchy / decision markets) - adapter spec

Researched 2026-10-19 (~01:40-02:15 UTC). READ-ONLY: unauthenticated GETs to documented hosts (`market-api.metadao.fi`, `docs.metadao.fi`, `api-docs.metadao.fi`, `api.llama.fi`, `gamma-api.polymarket.com`) with the generic User-Agent `insurance-markets-research/0.1`; `gh api` raw file reads of public repos; WebFetch/WebSearch. No account, no API key, no wallet, nothing signed, no POST/PUT/DELETE, no PayBox tools called. No third-party code cloned, installed or run. **Not done:** Solana JSON-RPC reads (POST-only), so on-chain proposal enumeration was not exercised. The WebSearch budget ran out mid-session, so the news/ToS leg is thin.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months or undated).
Third-party text (docs, READMEs, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/metadao/` (7 files, each <= 8 KB).

## 0. Verdict

**adapter_priority: P2** (signal-only, thin; zero arbitrage legs; build only after P0/P1 venues).

1. **Live (H).** `market-api.metadao.fi` healthy and serving fresh data on 2026-10-19; `metaDAOproject/programs` last commit 2026-10-12; DefiLlama shows $490,852 24h volume and $13.68M TVL on 2026-10-19.
2. **It is mostly a spot-token DEX plus a launchpad; the "prediction market" part is episodic and small (H).** Of $164.1M FutarchyAMM volume from 2026-04-01 to 2026-10-18, only **$2.55M (1.55%)** was in conditional (decision) markets, about $12.7K/day, spiky and concentrated in a few DAOs (section 9).
3. **Market model is not an event-contract book.** A decision market is a pair of constant-product AMM pools (pass-conditional and fail-conditional token/USDC) priced in DAO-token terms; the "probability" of a proposal passing is not a price you can quote or arbitrage against another venue (section 2).
4. **No overlap with other venues' event categories (H for design, M for catalogue check).** One real adjacency: Polymarket has listed (all now closed) "Total commitments for the X public sale on MetaDAO" events, resolved from metadao.fi fundraise pages, with large volume (Ranger $23.6M). MetaDAO's `GET /v1/api/launches/live` is a free structured feed of exactly that quantity (section 10).
5. **Read API is good for spot/launch data, and absent for proposals/conditional markets** (those are on-chain only). Solana-only trading, so an EVM PayBox wallet cannot trade it (section 5).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://market-api.metadao.fi/health` | `{"status":"healthy","timestamp":"2026-10-19T01:54:22Z","uptime":858120}` (uptime about 9.9 days) | H |
| `/v1/api/launches/live` | `updatedAt 2026-10-19T01:50:40Z`, 3 open raises (Polybaskets INDEX, Soldex, Orendal) | H |
| `/v1/api/tickers` | 27 DAO spot pools, 24h volume non-zero for most; newest `startDate` 2026-10-11 (GANG, The Syndicate) | H |
| `/v1/api/market-data` | rows through 2026-10-18 | H |
| `github.com/metaDAOproject/programs` | pushed 2026-10-14; latest commits 2026-10-12 (UMBRA logo), 2026-09-22 (futarchy tests), 2026-09-09 (sdk fix) | H |
| `metaDAOproject/futarchy-external-api` | last commit 2026-10-09 (Bun upgrade, shared rate limits) | H |
| DefiLlama `api.llama.fi/summary/dexs/metadao` | 24h $490,852; 7d $4.88M; 30d $28.9M; all-time $565.4M (fetched 2026-10-19) | H |
| DefiLlama `api.llama.fi/protocol/metadao` | TVL $13,680,846 (latest point 2026-10-19), mcap $114.2M | H |
| Platform rename | Permissionless raise product Futardio renamed **Backable** on 2026-10-05 (new site backable.biz) | M (WebSearch summaries of Solana Compass / Crypto Briefing; pages themselves 403 to WebFetch) |
| Audits | 2026 audits by Accretion, Ackee, OtterSec listed in `programs/audits/` | H |
| Gnosis GIP-145 futarchy pilot (advisory, Snapshot, 2026-02-16) | external adoption signal | M/L |
| `www.metadao.fi` / `metadao.fi` | **HTTP 429 to curl and WebFetch** on every path tried (`/`, `/terms`, `/transparency`, `/robots.txt`); `v1.metadao.fi` 301 | H |

## 2. What it is

- **Kind**: onchain-other. MetaDAO LLC's product is "unruggable capital formation and market-driven governance": (a) an ICO launchpad with a USDC treasury governed by decision markets, (b) a per-DAO **FutarchyAMM** that serves both as the DAO token's spot market and as the host of conditional markets when a proposal is live, (c) a bid wall. Tokens ("ownership coins") are DAO tokens such as META, SOLO, UMBRA, AVICI, OMFG. (H: docs `docs.metadao.fi/llms.txt` index, programs README.)
- **Market model (H, program source + docs)**:
  - **Decision market = two conditional markets per proposal**: "pass" (value of the token if the proposal passes) and "fail". Anyone can create a proposal; holders must stake tokens (default 200K to 1.5M tokens, i.e. 1-15% of a 10M ICO supply) to make it go live; **one live proposal per DAO at a time**. When live, the DAO moves half its spot liquidity into the conditional pools; trading lasts about 3 days (`docs.metadao.fi/governance/markets`; code `MIN_PROPOSAL_DURATION_SECONDS` = 1 day).
  - **AMM, not order book, not parimutuel.** Constant-product pools held inside the DAO account (`dao.amm`: spot, pass, fail); `LP_TAKER_FEE_BPS = 0`, `PROTOCOL_TAKER_FEE_BPS = 50`. Program also auto-arbitrages spot vs conditional pools after each swap (`arbitrage_after_spot_swap`, `arbitrage_after_conditional_swap`), so the three prices are kept consistent on-chain.
  - **Tokenisation**: per proposal the `Proposal` account holds `pass_base_mint`, `pass_quote_mint`, `fail_base_mint`, `fail_quote_mint` (SPL mints) and two `conditional_vault` vaults (base = DAO token, quote = USDC). `split_tokens` mints pass+fail 1:1 from the underlying; after resolution the winning side redeems 1:1 and the losing side is worthless. Conditional tokens are transferable SPL tokens.
  - **Outcome space**: the vault `Question` account supports 2+ outcomes and scalar payouts (`payout_numerators: Vec<u32>`), but `finalize_proposal` only ever writes `[0,1]` (pass) or `[1,0]` (fail). Binary in practice.
  - **Not a $1 YES/NO contract.** Pass/fail tokens are priced in USDC per DAO token, not 0-1 probability. The implied "pass odds" are not directly observable; the protocol compares **TWAPs** (pass vs fail) to a threshold. An aggregator could report `pass_twap/fail_twap - 1` as a signal but cannot cross-quote it against a binary on another venue.
- **Spot markets** (the bulk of activity): same FutarchyAMM, `spot_swap` instruction; Meteora DAMM v2 pools also exist for some DAOs (API `meteora` rows).
- **Launchpad**: ICO "raises" with `totalCommitted`, `minimumRaise`, `closeTime` (live feed in section 4). Programs `launchpad` v0.6/v0.7/v0.8 deployed. Not a market.

## 3. Chains and collateral

- **Solana mainnet only (H).** Quote = native USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), base = each DAO's SPL token (6-9 decimals); conditional tokens are per-proposal SPL mints. Fees in SOL for the trader.
- **Program IDs (H, `Anchor.toml` and README deployment table of `metaDAOproject/programs`, branch `develop`)**:
  - `futarchy` v0.6.0 `FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq` (current; released 2025-11-06)
  - `conditional_vault` v0.4 `VLTX1ishMBbcX3rdBWGssxawAo1Q2X2qxYFYqiGodVg`
  - `launchpad` v0.8.0 `moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n` (also v0.7 `moontUzs...`, v0.6 `MooNyh4C...`)
  - `bid_wall` `WALL8ucBuUyL46QYxwYJjidaFYhdvxUFrgvBxPshERx`, `mint_governor` `gvnr27cV...`, `performance_package_v2`, `liquidation`, `gated_mint`
  - Legacy governance stack still deployed for older DAOs: `autocrat` v0.3-v0.5, `amm` v0.3-v0.5 (`AMMJdEiC...`), older vaults. META's own governance and Sanctum etc. historically ran on these (`v1.metadao.fi`). Which DAOs are on which version: NOT FOUND (needs on-chain reads).
- License of the programs: Business Source License 1.1, licensor MetaDAO LLC (H, LICENSE head read; Additional Use Grant / change date not read). Reading chain data is unaffected; forking/embedding the program code needs a licence check.

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official REST `https://market-api.metadao.fi` ("Futarchy External API" v2.0.0, CoinGecko/CMC/DexScreener-style) | **Public, no key.** Anonymous 60 req/min/IP (`RateLimit-*` headers; observed `ratelimit-limit: 60`); `X-API-Key` gives partners a higher bucket; responses `Cache-Control: private, max-age=30`; errors `{error,code,field?,requestId}`; 503 rather than empty data on dependency failure. CORS `*`. | H |
| Docs | `https://api-docs.metadao.fi/introduction` (Mintlify). **Partly stale**: lists `/api/volume/aggregate`, which is absent from the live OpenAPI; the live spec is `https://market-api.metadao.fi/openapi.json` (OpenAPI 3.1, 68 KB) and `https://market-api.metadao.fi/docs` (Redoc). Also note `https://docs.metadao.fi/api-reference/openapi.json` is Mintlify's placeholder "OpenAPI Plant Store", ignore it. | H |
| WebSocket / streaming | NOT FOUND (searched: live OpenAPI paths, `futarchy-external-api` README, api-docs `llms.txt`). DexScreener `events` endpoint is a block-range poll. | H |
| Proposals, conditional-market pools, TWAPs, per-proposal state | **Not in the REST API.** Only on-chain (Anchor accounts `Proposal`, `Dao` of program `FUTARELB...`; SDK `FutarchyClient.getProposal/getDao/fetchProposal`). Only aggregate hints exist: `has_conditional_volume` and `pending_open_proposals` columns in `/market-data`. An official indexer repo (`futarchy-indexer-v2`, last push 2026-07-07) has only a stub README. | H |
| On-chain | Any Solana RPC (`getProgramAccounts` with account-discriminator filter on the futarchy program; `getAccountInfo`). Not exercised here (JSON-RPC is POST). | M |

**Live endpoints (from the live OpenAPI, H)**: `GET /v1/api/tickers`, `/v1/api/market-data?startDate&endDate[&tokens]` (range <= 366 days), `/v1/api/supply/{mint}[/total|/circulating|/jupiter/...]`, `/v1/api/launches/live`, `/v1/cmc/{summary,ticker,assets}`, `/v1/dexscreener/{latest-block,asset,pair,events}`, `/health`, `/api/health` (not under `/v1`; `GET /v1/api/health` is 404), `/metrics`. Unversioned paths are a frozen alias of v1.

**Confirmed response shapes (fixtures)**:
- `/v1/api/tickers` -> 27 rows (fixture keeps 3): `ticker_id` (`{BASE_MINT}_{USDC_MINT}`), `base_symbol`, `pool_id` (= DAO account), `last_price`, `bid`, `ask`, `base_volume`, `target_volume` (24h, USDC), `liquidity_in_usd`, `treasury_usdc_aum`, `treasury_vault_address`, `startDate`. Prices come from **spot** reserves only; the docs say so explicitly ("not conditional or futarchy markets").
- `/v1/api/launches/live` -> `{count, updatedAt, launches:[{launchAddress, version "v0.7", tokenAddress, quoteMint, quoteDecimals, committerCount, totalCommitted, totalCommittedRaw, minimumRaise, minimumRaiseRaw, closeTime (unix s), tokenName, tokenSymbol}]}`; cached 5 min.
- `/v1/api/market-data?startDate=2026-10-10&endDate=2026-10-18` -> `{filters, source "user-pool-etl", futarchyAMM:{count 214, data:[per token-day rows with spot_*, conditional_* (null when none), total_*, spot_protocol_fee_usd, conditional_reconciled, pending_open_proposals]}, meteora:{count 131, data:[...]}}`. Full 9-day response is 339 KB, so the fixture is trimmed to 4+2 rows.
- Fixture `derived_monthly_spot_vs_conditional_volume.json` is **derived by me** from `/market-data?startDate=2026-04-01&endDate=2026-10-18` (3,250 rows).

## 5. Trade path and PayBox reachability

- **Programmatic trading: yes, Solana-native, on-chain only (H, source).** No off-chain order book, no signed-order API, no REST trade endpoint. To trade a decision market:
  1. `conditional_vault.split_tokens` (USDC -> pass-USDC + fail-USDC, or DAO token -> pass-token + fail-token),
  2. `futarchy.conditional_swap {market: Pass|Fail, swap_type: Buy|Sell, input_amount, min_output_amount}` (single signer `trader`; slippage via `min_output_amount`; ~30 accounts, so a v0 transaction with a lookup table is likely needed, size NOT verified),
  3. after finalisation, `conditional_vault.redeem_tokens`.
  Spot: `futarchy.spot_swap`. Governance actions: `stake_to_proposal`, `sponsor_proposal`, `launch_proposal`, `finalize_proposal` (permissionless once the duration has elapsed).
- Official TS SDK: package `@metadaoproject/programs` (`sdk/` in the programs repo, version 0.1.1-alpha.2, `FutarchyClient` with `spotSwapIx`, `conditionalSwapIx`, `stakeToProposalIx`, `finalizeProposal`, ...). A May-2026 third-party article (devrels.xyz) names `@metadaoproject/futarchy-sdk` / `fetchTwap` methods; the repo `futarchy-sdk` is archived (last push 2024-09) so treat those names as stale (L).
- Auth/signing: ordinary Solana ed25519 transaction signature from the trader's keypair. No API key, no off-chain signature scheme.
- **PayBox reachability: partial** (PayBox facts H from project note `docs/research/06-paybox-platform.md`).
  - **EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon, ...) cannot trade it**: no EVM contracts, no EIP-712 orders. They would have to bridge/swap to Solana USDC first (`request_swap` is a money tool, not called).
  - A PayBox **Solana** credential could in principle sign the built transaction via `request_wallet_sign` op `solanaTransaction`, or via an `io.paybox/transactionProposal` of kind `solana` (limits from the project note: <= 1,232 bytes, legacy/v0, exactly one signer who is the fee payer, no durable nonce). `conditional_swap` and `spot_swap` have one signer, so the shape fits; size under 1,232 bytes with lookup tables is NOT verified. No MetaDAO PayBox plugin exists (not searched in `discover_plugins`; project note lists only world, aave, hyperliquid, jupiter).
  - Dust/min sizes: none documented. Pool sizes are small (section 9), so slippage dominates.

## 6. Fees

- **0.5% protocol taker fee on the input amount, 0% LP fee, paid by the trader, on both spot and conditional swaps (H).** Evidence: `programs/futarchy/src/lib.rs` constants `PROTOCOL_TAKER_FEE_BPS = 50`, `LP_TAKER_FEE_BPS = 0`, `MAX_BPS = 10000`; `Pool::swap` takes `input * (10000-50)/10000` as protocol fee, then runs x*y=k on the remainder. API data confirms: `spot_protocol_fee_usd / spot volume = 0.0050000008` and `conditional_protocol_fee_usd / conditional volume = 0.0050000000` over 2026-04-01..2026-10-18, `lp_fee = 0`. DefiLlama adapter comment: "0.5% fee on SpotSwap" (H, repo `DefiLlama/dimension-adapters`, `fees/futarchy-amm`).
- **Conflict**: `docs.metadao.fi/protocol/analytics` says "Revenue generated from the 0.25% trade fee" (older figure, L/stale). Trust 0.5%.
- Round trip on a conditional market costs about 1% plus split/merge (no fee found in `conditional_vault`; not exhaustively read) plus Solana network fees.
- Launchpad/proposal staking: staking is "purely to prevent spam and doesn't have lockups or risk of slashing" (docs `governance/proposals`).

## 7. Resolution and dispute risk

- **Mechanical, on-chain, no oracle (H, `finalize_proposal.rs`)**: after the proposal duration, anyone calls `finalize_proposal`. It computes `threshold = fail_twap * (10000 + threshold_bps) / 10000` and sets Passed iff `pass_twap > threshold`, writing `payout_numerators [0,1]` (pass: pass tokens redeem, fail tokens worthless) or `[1,0]`.
  - Thresholds: default `DEFAULT_PASS_THRESHOLD_BPS = 300` (3%); code allows per-DAO `pass_threshold_bps <= 1000` and `team_sponsored_pass_threshold_bps` in [-1000, +1000]. Docs: team-sponsored -3%, non-team-sponsored +3% ("We're actively tuning these parameters"; read the DAO account for the live values).
  - TWAP is "lagging": the observation fed to the TWAP can move only `twap_max_observation_change_per_update` per update; recording starts after a 24h delay (docs; code `twap_start_delay_seconds`).
- **Dispute/override risk**:
  - No dispute window or challenge game for pass/fail.
  - **Admin backdoors exist in the program**: `admin_cancel_proposal`, `admin_remove_proposal`, `admin_execute_multisig_proposal`, with a hard-coded admin key in `admin_cancel_proposal.rs` (`CWGawad...`). The cancel instruction takes the Squads multisig accounts and the vault `Question` (it imports `ResolveQuestion`); I did not read the full handler, so the exact payout it writes is NOT verified (M). Operationally, the protocol admin can cancel a live proposal.
  - **Optimistic proposals** (`initiate_vault_spend_optimistic_proposal`, `finalize_optimistic_proposal`, `dao.optimistic_proposal`) appear to let some treasury spends proceed without a market vote unless challenged (M, inferred from instruction names and the head of `finalize_optimistic_proposal.rs`; semantics not read).
  - Manipulation risk is real but market-checked: a secondary source (Solana Compass summary, M) says a "Proposal 6" push by a Solana Foundation representative of about $250K failed. Thin pools (section 9) make TWAP manipulation cheaper than on deep venues.
  - Each proposal's executable instruction is arbitrary Solana CPI by the DAO; "pass" can move the treasury. Not relevant to an aggregator's price feed, relevant to anyone holding tokens.

## 8. Geo, ToS, automation

- Site terms of use: **NOT FOUND** (searched: `metadao.fi/terms`, `www.metadao.fi/terms`, `metadao.fi/transparency`, `/robots.txt` all HTTP 429 from this host; docs.metadao.fi `llms.txt` has no terms page; WebSearch budget exhausted before a second attempt).
- Trading is permissionless on-chain; any frontend geoblock does not bind direct program calls (M, inference). The MiCA white paper (`docs.metadao.fi/mica.md`, H) says "Domicile of company: United States of America", disputes before courts of the Republic of the Marshall Islands, and that "Trading Platforms ... may impose restrictions ... including KYC". Nothing found about US-person bans for the app.
- Automation: the API is explicitly built for aggregators (CoinGecko, CMC, DexScreener, Jupiter); anonymous limit 60 req/min/IP; no anti-bot text read. `futarchy-external-api` repo is public.
- **Securities angle**: the launchpad sells tokens (ICOs); `/api/launches/live` is read-only data and unaffected, but trading raise tokens may need separate legal review. Out of scope here.

## 9. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (all MetaDAO, Solana) | $13.68M | DefiLlama `/protocol/metadao`, 2026-10-19 | H |
| Sum of `liquidity_in_usd` over 27 DAO spot pools | $13.12M | `/v1/api/tickers`, 2026-10-19 01:54Z | H |
| Sum of `treasury_usdc_aum` | $13.78M | same call | H |
| Spot 24h volume (SpotSwap only) | $490,852 (DefiLlama); sum of ticker `target_volume` $396.7K | 2026-10-19 | H |
| 7d / 30d / all-time spot volume | $4.88M / $28.9M / $565.4M | DefiLlama dexs | H |
| Spot volume 2026-04-01..10-18 | $161.5M (monthly $11.2M Apr, $18.5M May, $18.7M Jun, $37.5M Jul, $32.9M Aug, $31.3M Sep) | `/v1/api/market-data` derived | H |
| **Decision-market (conditional) volume 2026-04-01..10-18** | **$2.55M total (1.55% of volume)**: Apr $1.29M, May $34K, Jun $635K, Jul $67K, Aug $349K, Sep $139K, Oct 1-18 $34K; 2026-10-10..18 only $26K | same, derived (fixture) | H |
| Largest conditional days | 2026-04-22 SOLO $913K (880 trades); 2026-04-21 SOLO $274K; 2026-06-14 ZKFG $239K; 2026-08-01 PRVT $163K | same | H |
| DAOs with any conditional volume per month | 4,4,4,4,6,15,7 (Apr..Oct) | same | H |
| Per-pool depth in tickers | META $2.35M, SOLO $2.50M, CRED $2.06M, AVICI $1.20M, UMBRA $0.71M, OMFG $0.61M, many pools < $0.25M (TSET $4.2K) | tickers, 2026-10-19 | H |
| Docs count of historic proposals | "96 proposals for 14 organizations" since 2023-11 (page undated) | `docs.metadao.fi/governance/overview` | M/L |
| Live proposals now | NOT FOUND (needs on-chain read); `pending_open_proposals` was 0 on all 214 rows for 2026-10-10..18, M | market-data | M |

Conditional depth is roughly half of one DAO's spot pool while its proposal is open, i.e. low six figures at best for most DAOs.

**Shared liquidity:** conditional liquidity is **carved out of the same DAO's spot pool** (half moved while a proposal is live), so decision-market and spot are not independent legs. Meteora DAMM pools carry extra DAO-token liquidity for some tokens. No liquidity is shared with any other prediction venue.

## 10. Event categories and overlap with other venues

- **Categories**: DAO-token value conditional on a DAO governance proposal (treasury spend, token issuance, emission/fee changes, liquidity changes). Tokens are META, SOLO, UMBRA, AVICI, OMFG, ZKFG, PRVT and others. No sports, politics, macro or generic crypto-price contracts.
- **Arbitrage overlap with other prediction venues: none identified (M).** Pass/fail tokens are unit-of-account instruments, not binary events. DAO-token spot price could be arbitraged against Meteora/Jupiter spot pools, but that is DEX arbitrage, not prediction-market arbitrage.
- **One real adjacency (H on Polymarket side, fetched via unauthenticated `gamma-api.polymarket.com/public-search`, fixture `polymarket_metadao_events_digest.json`)**: Polymarket has listed events on MetaDAO ICO totals, e.g. "Total commitments for the Ranger public sale on MetaDAO" (volume $23.6M, end 2026-02-01), Solomon ($12.2M, end 2026-01-01), Hurupay ($6.2M, 2026-05-01), P2P Protocol ($5.2M, 2026-07-01), Avici ">$100M committed" ($1.0M). **All five are closed; a follow-up query with `events_status=active` found no open MetaDAO-related event on 2026-10-19.** The event description names the MetaDAO fundraise page as resolution source. MetaDAO's `launches/live` feed gives `totalCommitted`, `minimumRaise`, `closeTime`, `committerCount` for open raises (right now Polybaskets INDEX $1,355 committed of $40K minimum, Soldex $0 of $111K, Orendal $2,400 of $20K), so it is a ready **signal/resolution-source feed** if Polymarket (or another venue) lists new raise-commitment markets. Note ICO commitments can include points-holder and reserved allocations, per the Polymarket rules text.

## 11. Adapter recommendation

- **Do not build a trading adapter.** No overlapping contracts, tiny and spiky decision-market volume, Solana-only, on-chain-only state, 0.5% per leg.
- **Cheap optional signal adapters (P2)** if the aggregator wants them:
  1. `launches/live` poller (1 call per 5 min) as a resolution/signal feed for any venue's "MetaDAO raise commitment" markets. About 20 lines.
  2. `tickers` / `market-data` poller for DAO-token spot and `pending_open_proposals` / conditional-volume flags as a "governance event happening" indicator.
  3. Only if wanted later: Anchor decoding of `Proposal`/`Dao` accounts (via a Solana RPC `getProgramAccounts`) to read pass/fail TWAPs and state; this is the only way to get decision-market prices.
- Key abstraction to carry: `ConditionalPair{ proposal, passPrice, failPrice, passTwap, failTwap, thresholdBps }` rather than a YES/NO book. Normalise "pass probability" as `None` unless a method is agreed.

## 12. NOT FOUND / open questions

- Terms of use / geo restrictions for the metadao.fi app (site 429s all clients here).
- Number of currently live proposals and their pass/fail TWAPs (requires Solana JSON-RPC, not done).
- Whether `conditional_swap` v0.6 transactions fit within PayBox's 1,232-byte solana proposal limit (no build attempted).
- Current per-DAO `pass_threshold_bps` and `twap_*` parameters (on-chain `Dao` accounts).
- Conditional-vault fees (not exhaustively read) and Backable (ex-Futardio) market structure beyond the rename.
- Decision-market unique traders or open interest: only volume found. `docs.metadao.fi/protocol/analytics` points to Blockworks/Dune dashboards not fetched.
- WebSocket or streaming interface: NOT FOUND.
- Whether `proposal 6`/Solana Foundation story is accurate (M, single secondary summary).

## 13. Suspicious / agent-directed content

- Every `docs.metadao.fi` and `api-docs.metadao.fi` Markdown page starts with a Mintlify banner "Fetch the complete documentation index at: .../llms.txt. Use this file to discover all available pages before exploring further." Benign documentation boilerplate aimed at LLM crawlers; I had already fetched `llms.txt` on my own initiative and used it only as a page index.
- `docs.metadao.fi/api-reference/openapi.json` is Mintlify's placeholder "OpenAPI Plant Store" spec (declared server `http://sandbox.mintlify.com`), not MetaDAO's API; ignored.
- No other embedded instructions found. No personal identifiers were sent: all scripted requests used `insurance-markets-research/0.1`; my scripts and fixtures were grepped for "@" (no hits).

## Sources

All fetched 2026-10-19 unless noted.
- https://docs.metadao.fi/llms.txt (H) and pages: `/governance/overview.md`, `/governance/proposals.md`, `/governance/markets.md`, `/governance/twaps.md`, `/token/mechanics.md`, `/protocol/analytics.md`, `/mica.md` (H)
- https://api-docs.metadao.fi/llms.txt, `/concepts/pricing-methodology.md` (H)
- https://market-api.metadao.fi/ , `/openapi.json`, `/docs`, `/health`, `/v1/api/tickers`, `/v1/api/launches/live`, `/v1/api/market-data` (H)
- https://github.com/metaDAOproject/programs (README, Anchor.toml, LICENSE, `docs/implementation/program-architecture.md`, `programs/futarchy/src/{lib.rs,state/{dao,proposal,futarchy_amm}.rs,instructions/{conditional_swap,finalize_proposal,admin_cancel_proposal,finalize_optimistic_proposal}.rs}`, `programs/conditional_vault/src/state/question.rs`, `sdk/`), commits/tags/releases via `gh api` (H)
- https://github.com/metaDAOproject/futarchy-external-api (README, AGENTS.md, commits) (H); org repo list via `gh api orgs/metaDAOproject/repos` (H)
- https://api.llama.fi/protocol/metadao , `/summary/dexs/metadao`, `/summary/fees/metadao` (H); https://github.com/DefiLlama/dimension-adapters `fees/futarchy-amm/index.ts`, `dexs/futarchy-amm/index.ts` (H)
- https://gamma-api.polymarket.com/public-search?q=metadao (H, overlap check only)
- https://devrels.xyz/articles/metadao-futarchy-technical-reference (May 2026, M via WebFetch summary; SDK names L)
- WebSearch summaries (M): https://solanacompass.com/projects/metadao (page itself 403), https://solanacompass.com/news/metadao-renames-futardio-as-backable-its-permissionless-fundraising-platform-on-solana , https://cryptobriefing.com/metadao-launches-backable-solana-fundraising/ , https://www.futard.io/ , https://www.backable.biz/docs/whats-new
- Project notes: `docs/research/06-paybox-platform.md` (PayBox Solana proposal limits and chain catalog), `docs/research/venues/jupiter-predict.md` (format and Solana-reachability precedent)
- Hint source (not re-verified): https://madeonsol.com/tools/metadao
