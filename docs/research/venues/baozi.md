# Baozi (baozi.bet) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs, `gh api` raw file reads, web search. No accounts, wallets, keys, signing, POST/PUT/DELETE. One unauthenticated GET returned HTTP 402 (x402-style intel endpoint); requirements recorded below and I stopped there.

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

**adapter_priority: skip.** The site, REST API and Solana program are reachable (H), but the venue is effectively dormant: on 2026-10-19 the API lists 86 markets, **zero** with betting open, the newest market closes 2026-06-25, and the sum of all reported pools across all 86 markets is **0.44 SOL (about 46 USD at 104.93 USD/SOL, CoinGecko GET 2026-10-19)**. Even if it were busy, the model is pari-mutuel with no exit and no price lock, so it is not a usable arbitrage leg. Revisit only if `GET /api/v4/agent/markets` shows markets with `isBettingOpen=true` and pools in the tens of SOL.

## Identity and liveness

- Name Baozi, site https://baozi.bet (title "Baozi - Prediction Markets on Solana"; legal pages say "(Beta)"). Mirror `baozi.ooo` 308-redirects to baozi.bet (H, curl headers). Operator is pseudonymous ("Baozi Protocol"); contact is X/Telegram. Support email appears in the site JSON-LD (not recorded here).
- Still reachable 2026-10-19: homepage 200, `/api/v4/agent/markets` 200 with `meta.timestamp` 2026-10-19 (H).
- Activity indicators (all H unless noted):
  - Markets API: 86 markets total (ids 0..110 with 25 ids absent), 0 race markets, 0 with `isBettingOpen=true`. Status counts: Cancelled 57, Active-flagged 15 (all past `closingTime`, nobody called the permissionless `close_market`), Closed 7, ResolvedPending 4, Resolved 3. Layers: Lab 61, Official 23, Private 2.
  - 13 markets have any pool; largest single pool 0.11 SOL; 5 are "[TEST] ... (auto-test)" markets (0.13 SOL). Pools shown for cancelled markets may be zeroed by refunds, so 0.44 SOL is the sum of reported current pools, not a clean lifetime-volume figure (M).
  - Latest `closingTime` in the list is 2026-06-25; most other recent markets close in March 2026. No market created after roughly March 2026 is evident (M, API has no created-at field).
  - Resolution proofs API: 11 proof batches, newest dated 2026-03-03 (`/api/agents/proofs`).
  - `agents.txt` says "Last updated: 2026-06-11"; GitHub `bolivian-peru/baozi-mcp` last push 2026-04-17; npm `@baozi.bet/mcp-server` latest 5.0.1 published 2026-04-17; `bolivian-peru/baozi-idl` last push 2026-05-22.
  - DefiLlama: no Baozi entry in `api.llama.fi/protocols` (8,758 protocols) - searched name, slug and url (H absence).
- pmxt (`pmxt-dev/pmxt`) still ships a `baozi` adapter and has open bot-style "spec drift" issues about it dated 2026-05 to 2026-10 (H, GitHub search). That shows the adapter is maintained, not that the venue is active.
- Chains: Solana mainnet-beta only in practice. The homepage JSON-LD says "Solana and Starknet support" but no docs, IDL or API mention Starknet (L, treat as stale SEO text).

## Kind and market model

- Parimutuel (H, `/llms.txt`, `/agents/docs`). No order book, no AMM, no secondary market: "bets are locked until resolution. no withdrawals, no position trading" (H, `/api/home`).
- Two market types (H):
  - Boolean (YES/NO): two pools `yes_pool`, `no_pool`; Anchor account `Market`. Outcome is a `bool` argument.
  - Race (2-10 outcomes): one pool per outcome; Anchor account `RaceMarket`. Outcome is a `u8` index. **None exist right now** (`/api/markets` `counts.race = 0`).
- Outcomes are not tokenised. A user holds a `UserPosition` PDA (seeds `position`, market_id, user) with `yes_amount`/`no_amount`; race uses `race_position` with `bets[10]` (H, IDL + pmxt `utils.ts`). Positions are not transferable.
- Market layers: Official (0), Lab (1, community-created), Private (2, invite-only). Layer-specific resolution and fee rules (below).
- "Price" is the pool share. Baozi's own API reports `yesPercent = yes_pool / total` (sample: pools 0.1 YES / 0.01 NO -> `yesPercent` 90.91). Payout per 1 SOL staked on YES is `total / yes_pool` (before fees), and it is only final at close because later bets change the pools (H).
- **Do not copy the pmxt price mapping**: pmxt's `mapBooleanToUnified` sets `yesPrice = noPool / totalPool` (the inverse of Baozi's own `yesPercent`) and returns a synthetic one-level "order book" sized to total pool (H, `core/src/exchanges/baozi/utils.ts`, `normalizer.ts`).
- Rule set "v7.2" bans price-prediction markets and "before [deadline]" markets and requires betting to close 24h before scheduled events (H, `/agents/rules.txt`), yet the live list contains "Will Bitcoin (BTC) increase in value by March 15, 2026?" style markets (H) - docs and data disagree.

## Chains and collateral

- Solana mainnet. Program ID `FWyTPzm5cfJwRKzfkscxozatSxF6Qu78JQovQUwKPruJ` ("baozi markets v4.7.6"); staking `STKN53sMpAVwX3ynhA1wv4wLw6eGFucsn5M4ipSKwvz` and vesting `3pBqv98g6s5VgL9oC6vay9qh6EDgVmy4r8zQcWRZcWpH` are "pending" (H, `/agents.txt`, `/agents/docs`).
- Collateral is native **SOL only**. IDL `CurrencyType` enum has a single variant `Sol` (H, fixture `idl_excerpt_2026-10-19.json`); all instructions are `*_sol`. The pmxt issue claiming USDC markets are mis-scaled looks like a false positive from a spec-drift bot (M); the on-chain struct has only a reserved USDC vault field (pmxt `parseMarket` comment `_reserved_usdc_vault`).
- Bet limits: 0.01 to 100 SOL per bet in `llms.txt`/`/agents/docs`; `/.well-known/agents.json` says `min_bet_sol: 0.001` (H, internal inconsistency; the program is authoritative and I could not read it).
- Upgrade authority key is published (`2hgph1xw...VWcER`) and the program is upgradeable by that key; a Squads 2-of-2 vault with "deployer-v2 + Trezor" is described as "new vault being configured" (H docs, status not verifiable).

## Read API

- **Official, public, unauthenticated, JSON over HTTPS** (H, manifest `/.well-known/agents.json`, `/agents.txt`). Docs: https://baozi.bet/agents/docs (plain text mirror `/agents/docs.txt` or `/skill.txt`), https://baozi.bet/llms.txt, https://baozi.bet/agents.txt. No OpenAPI file found (NOT FOUND, searched agents.json, llms.txt, agents.txt, `/openapi*`).
- Base URLs: `https://baozi.bet/api/v4/agent` (manifest v4.7.6) and `https://baozi.bet/api`.
- Endpoints confirmed with real GETs (H, 2026-10-19):
  - `GET /api/v4/agent/markets?status=&layer=&limit=&offset=` -> `{success, data:{count, filters, markets[]}, meta:{network, programId, timestamp, version}}`. Market fields: `publicKey, marketId, question, status, layer, outcome, yesPercent, noPercent, totalPoolSol, closingTime, isBettingOpen, platformFeeBps, creatorFeeBps`. Docs say limit max 100. **`offset` appears ignored** (offsets 0 to 600 all returned the same 86 rows).
  - `GET /api/v4/markets` -> richer binary list: adds `totalYesSol, totalNoSol, paused, snapshotTaken, marketType, resolutionReason` (24 KB).
  - `GET /api/markets` -> `{binary[], race[], counts}` with `creator`, `resolutionTime`, `eventTime`, `category`, `description` (45 KB).
  - `GET /api/v4/agent/quote?market=<pda>&side=Yes|No&amount=<SOL>` -> current pools, `quote{valid, expected_payout_sol, potential_profit_sol, fee_sol, implied_odds_percent, decimal_odds}`, `new_pools`. See fee caveat below.
  - `GET /api/v4/agent/positions?wallet=` documented in the manifest; not called (wallet-specific).
  - `GET /api/agents/proofs` (resolution proofs, 11 batches), `GET /api/markets/metadata?marketIds=a,b` (documented, not called), `GET /api/agent/idl` (Anchor IDL JSON, 99 KB, 72 instructions), `GET /api/oracle/status` is documented but returns 404 (H).
- Prices/books: none beyond pool sizes. Trades/volume history: NOT FOUND (searched agents docs, llms.txt, MCP `tools.ts`; pmxt also says "no historical price/trade API without a custom indexer"). Websocket market data: NOT FOUND; only a NATS subject `market.{id}.comment` for comments (H docs). pmxt `watchOrderBook` subscribes via Solana RPC (H, `index.ts`; websocket.ts not read).
- Resolution data: `status` (Active/Closed/Resolved/Cancelled/Paused/ResolvedPending/Disputed per IDL), `outcome`, proofs API with `txSignature`, source URLs and evidence text (H).
- Auth and limits: none for reads. Manifest self-declares 60 requests/minute and 10,000/day (H). Other cooldowns are for writes (comments 5 min, lab market creation 30 min).
- On-chain read path (Tier 1 in docs, also what pmxt uses): `getProgramAccounts` filtered by Anchor discriminators (`Market` `[219,190,213,55,0,227,198,154]`, `RaceMarket` `[235,196,111,75,230,113,118,238]`, positions `[251,248,209,245,83,234,17,27]` / `[44,182,16,1,230,14,174,46]`) with Borsh layouts in pmxt `utils.ts` (H). I did **not** cross-check the REST data against chain state because Solana JSON-RPC is POST-only, which this task forbids. That cross-check is the main residual uncertainty about "dormant".
- Paid intel endpoints (x402-style): `GET /api/intel/{sentiment|whale-moves|resolution-forecast|market-alpha}?market=<pda>`. Unauthenticated GET returned **HTTP 402**: `{"error":"Payment required","price":0.001,"priceLamports":1000000,"currency":"SOL","paymentAddress":"<platform treasury>","instructions":"Send 0.001 SOL ... via SystemProgram.transfer, then retry ... with the transaction signature in the X-Payment-Tx header","protocol":"x402"}` (H). This is a bespoke SOL-transfer + `X-Payment-Tx` scheme, not the USDC facilitator flow, so PayBox `pay_x402` is unlikely to fit (M). Prices per MCP tool descriptions: 0.001 / 0.002 / 0.005 / 0.003 SOL (H, `src/tools.ts`). Not paid; low value given zero activity.

## Trade path

- Programmatic, non-custodial, **on-chain only**; there is no order API and no API key. Flow: build a Solana transaction that calls the program, sign with the bettor's Solana key, submit via any RPC (H).
  - Boolean bet: instruction `place_bet_sol(outcome: bool, amount: u64 lamports)` (variant `place_bet_sol_with_affiliate` exists). Accounts: `config` PDA, `market` PDA, `position` PDA (created on first bet), optional `whitelist` (Private markets), `user` (signer, writable, fee payer), `system_program`. Discriminator `[137,137,247,253,233,243,48,170]` (H, IDL excerpt fixture).
  - Race bet: `bet_on_race_outcome_sol(outcome_index: u8, amount: u64)`.
  - Claim after resolution: `claim_winnings_sol` / `claim_race_winnings_sol` / `claim_refund_sol`; claims are blocked until status is `Resolved` (not `ResolvedPending`/`Disputed`) (H, IDL docs). A separate claim step means a second signed transaction per market; pmxt has an open issue that its adapter has no claim capability (H, issue titles).
  - There is no cancel and no sell: bets are irrevocable (pmxt `cancelOrder` throws "Pari-mutuel bets are irrevocable"; H).
- Helper layers: MCP server `@baozi.bet/mcp-server` (76 tools in `llms.txt`/npm 5.0.x; "68 tools" on the homepage and repo description is stale), MIT, builds unsigned base64 transactions; writes disabled unless `BAOZI_LIVE=1` (H). Env knobs `BAOZI_MAX_BET_SOL`, `BAOZI_DAILY_LIMIT_SOL`. I did not install or run it.
- pmxt `BaoziExchange.createOrder` signs and sends a `place_bet_sol` / `bet_on_race_outcome_sol` transaction with a local Solana keypair (`BAOZI_PRIVATE_KEY`), `fetchOrder` parses the transaction by signature, `cancelOrder` always throws (H, `index.ts`). Rate limit set to 500 ms in the adapter.

### Reachable through PayBox?

**partial / not worth it.**
- An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot sign a Solana transaction; Baozi has no EVM deployment and no EIP-712 signed-order path (H).
- The account's Solana-family PayBox credential could in principle be used: this project's earlier PayBox notes (`docs/research/06-paybox-platform.md`, M here because not re-verified this session) record a `solana` transaction-proposal kind (`chain: solana:mainnet`, `transaction.transactionBase64`, at most 1,232 bytes, legacy or v0, single signer who is also fee payer, no durable nonce, no sponsor) and `request_wallet_sign` ops `solanaTransaction`/`solanaMessage`. A one-instruction `place_bet_sol` transaction with about six accounts fits that envelope.
- But it would need a purpose-built plugin that builds the instruction, and the venue has no liquidity. `discover_plugins("baozi prediction market")` returned an empty list on 2026-10-19 (H). Funding is SOL only, so an EVM-funded account would need a swap or bridge to SOL first (PayBox `request_swap` / `get_buy_link` cover Solana; not exercised).

## Fees

- Platform fee is charged **at claim time on gross winnings (stake + profit)**; losers pay nothing (H, `llms.txt`, `/agents/docs`):

| Layer | Platform fee | Creation fee | Creator share cap |
|---|---|---|---|
| Official | 2.5% | 0.01 SOL | none |
| Lab | 3.0% | 0.01 SOL | 2.0% |
| Private | 2.0% | 0.01 SOL | 1.0% |

- Split: affiliate 1% (if referred) + creator up to 2% + remainder to the protocol / "$BAOZI stakers" (staking program listed as pending). Invariant `creator_fee_bps + affiliate_fee_bps <= platform_fee_bps` (H).
- Each market carries `platformFeeBps` (sample Lab market 300) and `creatorFeeBps` (200) in the API; cancelled markets show 0 (H, fixture).
- Payout formula (H, docs): `payout = (your_bet / winning_pool) * total_pool * (1 - fee)`. Example from docs: pools 10 YES / 5 NO, bet 1 on YES -> 1.32 SOL.
- **Doc/API mismatch (M, my arithmetic):** the quote sample (pools YES 0.1 / NO 0.01, bet 0.1 YES, 3% fee) returns `expected_payout_sol 0.105`, `fee_sol 0.0002`, `potential_profit_sol 0.0049`. That is a 3% fee on the 0.005 *profit*, not on the 0.105 gross payout the docs describe (which would be about 0.0032). Treat the quote endpoint as unreliable for fee-exact EV; compute from pool state plus the documented formula and verify against the IDL claim logic before any real use.
- Network cost: Solana transaction fee plus rent for the new position account (not measured). No deposit or withdrawal fees (non-custodial).
- Referral link format `https://baozi.bet/?ref=CODE` exists; not relevant to us.

## Resolution mechanism and dispute risk

- Three on-chain resolution modes (H, `/agents/docs`, IDL `ResolutionMode`): `BaoziTvs` (Official: admin OR oracle resolves), `HostOracle` (Lab: oracle/admin only; Private: creator or oracle), `CouncilOracle` (community council vote, used for disputes).
- Flow: close at `closing_time` (permissionless `close_market`) -> propose outcome at/after `resolution_time` -> 6-hour dispute window (`ResolvedPending`) -> permissionless `finalize_resolution` if undisputed -> claims. Admin can `flag_dispute`, then `admin_resolve_dispute` (affirm, override or cancel). Admin can also cancel, pause or extend markets and pause the whole protocol (IDL instruction list, H).
- The oracle "Grandma Mei" is an AI agent plus operator process: Tier 1 Pyth price feeds (auto, on-chain), Tier 2 official APIs (ESPN, Billboard etc.) with a Squads 2-of-2 multisig approval, Tier 3 "claude ai reasoning + multi-source web research" with 2-of-2 approval. Proofs are published (`/api/agents/proofs`, IPFS links) (H).
- Risk assessment (my judgement, M): resolution is centralised on one operator team and one oracle key; there is an admin override and a kill switch; the program is upgradeable. 57 of 86 markets (66%) ended Cancelled. ResolvedPending markets from February 2026 are still in that state in the API (4 markets), suggesting finalisation is not being kept up (H observation, cause unknown).
- Conflicting statements: Terms say Labs markets are "resolved by their creators who may act dishonestly", while the agent docs say creators cannot resolve Lab markets (oracle/admin only) (H both).
- Audit: Terms of Service state "The Protocol has not been formally audited"; X/Twitter meta says "Audited pari-mutuel betting"; IDL description says "Security Audit Fixes"; no auditor or report is named anywhere I could find (NOT FOUND, searched site, docs, repos, web search).

## Geo / ToS / automation

- Terms page (https://baozi.bet/terms, client-rendered; text read from its JS chunk) (H): users must be 18+, not in a jurisdiction where prediction markets or crypto are restricted, not OFAC/UN/EU sanctioned; "It is your sole responsibility to determine whether your use of this Protocol is legal"; "We are not a gambling service, financial institution, or investment advisor"; operator may restrict UI access at any time; contracts cannot be terminated; governing law is the operators' (unnamed) jurisdiction with binding arbitration and class-action waiver.
- Automation: the Terms prohibit "Use bots or automated systems to gain unfair advantages" and market manipulation or wash trading; the venue otherwise explicitly courts AI agents (MCP, REST, bounties up to 1.25 SOL in the repo README, "Agent Arena"). No geo-block observed at the HTTP layer from my vantage point, and the JSON-LD says `areaServed: Worldwide` (H). No US-specific exclusion text found (NOT FOUND, searched terms, disclaimer, docs).
- Disclaimer page: Lab markets are not timing-validated; "we cannot refund bets on labs markets with timing issues" (H).

## Liquidity (with dates)

- Sum of all reported pools across all 86 markets: **0.44 SOL** on 2026-10-19 (H, fixture `markets_v4_agent_all_2026-10-19.json`); about 46 USD at 104.93 USD/SOL (CoinGecko simple price GET, 2026-10-19). Active-flagged pool total 0.05 SOL. Largest pool 0.11 SOL.
- TVL / open interest: no DefiLlama listing; no volume stat in docs. Homepage and docs make no volume claim. A January 2026 article says "8,200+ line audited smart contract" and gives no volume (L, sponsored, stale, and says devnet).
- Pari-mutuel means liquidity is "the pool"; there is no depth to hit, and a bet moves the odds. With pools of cents, one 0.01 SOL minimum bet changes the implied probability materially.

## Event coverage overlap (arbitrage relevance)

- Claimed categories: sports (NBA, NFL, UFC, soccer, tennis, F1, Olympics), crypto (BTC/ETH/SOL price snapshots resolved from Pyth), politics (elections, geopolitics), macro (Fed, CPI, NFP), culture (Oscars, Grammys, Netflix/Billboard), esports, tech (H, `/api/home`, docs). Observed list: Six Nations, Winter Olympics, Super Bowl LX, Daytona 500, Bangladesh election, NFP January 2026, BTC/ETH/SOL "increase by <date>", token listing questions, "will X be covered by a major news outlet" questions (H, fixture and proofs).
- In principle these overlap Polymarket, Kalshi and others, but all observed pools are at most 0.11 SOL, the questions are idiosyncratic Lab-style wordings, and there is no exit, so no realistic hedged arbitrage exists. At best Baozi `yesPercent` is a weak crowd-signal on a handful of already-closed markets.

## Liquidity sharing

- Independent: pools live in Baozi's own program; no routing or shared liquidity with another venue (H, docs). Independence is moot because there is almost no liquidity.

## Open questions

1. What is the real on-chain state? 25 ids in 0..110 are absent from the REST list (24-27, 31, 32, 37, 52-56, 64-73, 80, 82, 84): race markets the API does not expose, accounts that fail to parse (pmxt reports Type B accounts being dropped), or closed accounts. Needs a Solana RPC `getProgramAccounts` (POST), which this task disallowed.
2. Is anyone betting at all (positions, transactions in the last 30 days)? Not visible without chain access or an indexer.
3. Does `offset` pagination work once there are more than 100 markets? Observed ignored.
4. Why are four February 2026 markets still `ResolvedPending`? Is the oracle cron still running (`/api/oracle/status` 404)?
5. Real minimum bet (0.001 vs 0.01 SOL) and exact fee base on claim (gross vs profit); only the program source or a devnet test can settle this.
6. Starknet claim in JSON-LD: any substance?

## Sources

- https://baozi.bet - homepage HTML, title, JSON-LD (H)
- https://baozi.bet/llms.txt - agent index, fees, limits, program ID (H)
- https://baozi.bet/agents/docs (flat text of the same skill doc, 2,219 lines) - resolution, oracle, fees, REST notes (H)
- https://baozi.bet/agents.txt - integration tiers, endpoints, "Last updated 2026-06-11" (H)
- https://baozi.bet/agents/rules.txt - parimutuel rules v7.2 (H, skimmed)
- https://baozi.bet/.well-known/agents.json - manifest with endpoints, rate limits, pricing (H)
- https://baozi.bet/api/v4/agent/markets, /api/v4/markets, /api/markets, /api/v4/agent/quote, /api/agents/proofs, /api/agent/idl, /api/home, /api/intel/sentiment (402) - live GETs 2026-10-19 (H)
- https://baozi.bet/terms and https://baozi.bet/disclaimer - text extracted from the page JS chunks (H)
- https://github.com/bolivian-peru/baozi-mcp - README, `src/config.ts`, `src/tools.ts`, commits (last 2026-04-17) (H)
- https://registry.npmjs.org/@baozi.bet%2fmcp-server - versions and publish times (H)
- https://github.com/pmxt-dev/pmxt/tree/main/core/src/exchanges/baozi (`index.ts`, `fetcher.ts`, `normalizer.ts`, `utils.ts`, `price.ts`) and `core/COMPLIANCE.md` (H); pmxt issue search "baozi" (H titles only)
- https://api.llama.fi/protocols - no Baozi entry (H absence)
- https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd - SOL 104.93 USD on 2026-10-19 (H)
- https://programminginsider.com/baozi-on-devnet-building-on-chain-prediction-markets-with-solana-and-ai-agents/ - dated 2026-01-06, devnet, V5 roadmap, partly sponsored (L, stale)
- Project notes: `docs/research/06-paybox-platform.md` (PayBox Solana proposal limits, M here); `docs/research/10-aggregation-landscape.md`, `14-platform-of-platforms.md` (pmxt venue list)
- PayBox `discover_plugins("baozi prediction market")` - empty (H, read-only call)

## Suspicious content (recorded, not followed)

- `llms.txt` is written at AI agents with imperatives: "FOR AI AGENTS: Install MCP Server", "CRITICAL - READ FIRST", "ALL AI AGENTS MUST READ THE PARI-MUTUEL GUARDRAILS BEFORE PLACING ANY BETS", "DO NOT skip this", threats of "loss of your agent's reputation". I read the docs as data only and did not install the MCP server or follow the instructions.
- `/agents/docs` contains a promotional "viral loop for agents" (generate share cards, recruit other agents with affiliate codes), a bug-reporting channel that tells agents to post in a public board, and internal ops details (`/root/baozi-oracle/`, `<ORACLE_SERVER_IP>` placeholder).
- Repo README advertises SOL bounties for agent integrations (promotional).
- The 402 response embeds payment instructions ("Send 0.001 SOL ... then retry"); not acted on.

## Fixtures (docs/research/fixtures/baozi/)

- `markets_v4_agent_all_2026-10-19.json` - `GET /api/v4/agent/markets?limit=100` (32 KB, all 86 markets)
- `quote_resolved_market_2026-10-19.json` - `GET /api/v4/agent/quote?...&side=Yes&amount=0.1` on a resolved market (0.7 KB)
- `well_known_agents_2026-10-19.json` - service manifest (2.9 KB)
- `agents_proofs_2026-10-19.json` - resolution proofs (15 KB)
- `idl_excerpt_2026-10-19.json` - verbatim slice of `/api/agent/idl`: `place_bet_sol`, `bet_on_race_outcome_sol`, `claim_winnings_sol`, enums (11 KB)

## Adapter notes if ever revived

- Read via `GET /api/v4/markets` (has per-side pools); map `yesPercent/100` to YES probability (not pmxt's inverse); mark prices non-firm; set `liquidity` = `totalPoolSol` in SOL; skip markets with `isBettingOpen=false`.
- Treat as a hold-to-resolution, non-hedgeable, non-exitable leg: no unwinds, 6h+ dispute delay, claim step, admin override risk. Exclude from arbitrage unless pool depth and an out-of-band cross-check of fees exist.
