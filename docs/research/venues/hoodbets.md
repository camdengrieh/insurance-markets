# HoodBets (hoodbets.xyz) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: only unauthenticated GETs (hoodbets.xyz, api.llama.fi, Chainlink's public feed directory) and public web pages; no accounts, wallets, keys, signing, POST/PUT/DELETE (so no JSON-RPC `eth_call` either), and no PayBox money tools (one read-only `discover_tokens mode=chains` call). Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** read first-hand in a primary source this session, **M** secondary or inferred, **L** weak or stale.

## 1. Verdict

- **Live: dormant. Site and API are up, but there has been no tradable market for 3+ months.** `GET /api/markets` returns exactly 4 markets (ids 0-3), all `settled:true`; `/api/markets/4` returns 404 `{"error":"market not found"}` (H, 2026-10-19). Last market cutoff was 2026-07-06 13:20 UTC (H, API). The newest transaction of any kind on the contract is a `Settle` at 2026-07-08 12:06:14 (H, robin.etherscan.io tx list; timezone not stated by Etherscan). That is 103 days with no activity. The front end polls `/api/markets` every 10 s and `livePrice` is still updating, so the stack is running (H).
- **What it is**: a ~300-line, unaudited, immutable parimutuel contract on Robinhood Chain (chain id 4663, Arbitrum Orbit L2) that takes native ETH bets on binary OVER/UNDER questions about Chainlink price feeds (tokenized stocks GME, TSLA, NVDA, plus LINK/USD). Operator-created markets only. Unaffiliated with Robinhood Markets (H, site text).
- **Launched**: contract creation 2026-07-02 08:55:28 (H, Etherscan), one day after Robinhood Chain mainnet launch on 2026-07-01 (H, L2BEAT; M, CoinDesk 2026-07-01). DefiLlama listed it 2026-07-03 (H, `listedAt` 1783045273).
- **Adapter priority: skip.** Lifetime volume is 0.44 ETH (about $1.0k), roughly 94% of which came from the operator and the disclosed house seed wallet (M, derived below). No open market, admin-only market creation, no websocket, parimutuel bets that cannot be cancelled or sold, and a settlement rule that does not equal a closing price. The API itself is fine and trivial to poll. Re-check trigger: `marketCount` / API list length above 4, or any market with `settled:false`. If it revives, it is a P2 signal-only leg (see section 13).
- **Name collisions to avoid**: `hoodbet.fun` (GitHub org `hoodbet-fun`, "HoodPot" dApp, fee harvester/RNG contracts, M), `hoodbets.live` ("Hood Bets - Trade the Future", relation to hoodbets.xyz unknown, L), `hoodpicks.fun` (a separate "prediction markets on Robinhood Chain" site, L), `hood.market` (L). None of these are HoodBets; the only GitHub account tied to hoodbets.xyz (`github.com/hoodbets`, created 2026-07-02, 0 followers) holds one repo, a fork of `DefiLlama-Adapters`, and no contract code (H, `gh api`).

## 2. Market model (H)

Sources: https://hoodbets.xyz/docs, https://hoodbets.xyz/llms.txt, https://hoodbets.xyz/api/markets.

- **Parimutuel**, not an order book and not an AMM. "There is no order book, no counterparty, no market maker. The crowd is the odds." Bets add ETH to one of two pools; winners split the losing pool pro rata after a 4% rake on the losing pool.
- **Binary only**: side `0 = OVER` (settle price strictly above strike), `1 = UNDER` (price at or below strike). One question per market: `symbol`, `strike`, `cutoffTime`, `settleTime`, `settleDeadline`.
- **No outcome tokens.** A position is a ledger entry in the contract, `stakeOf(marketId, bettor) -> (overStake, underStake)` (ABI in the front-end bundle). Positions are not transferable and bets cannot be cancelled or sold ("Bets cannot be cancelled", llms.txt). A bettor may hold both sides.
- **Odds**: `implied P(OVER) = pools[0] / (pools[0] + pools[1])`, moving with every bet until `cutoffTime`. The payout multiple is not locked at bet time; it depends on the final pools.
- **Question shapes seen** (all four markets, H): "GME above $22.50 at settle", "TSLA above $393.00", "NVDA above $195.00", "LINK above $7.80". Cutoff is 10 minutes before settle time (600 s), settle deadline is 96 h after settle time (345,600 s). Per-market `potCap` = 2 ETH in all four.
- **Strike/price units**: 8 decimals (e.g. `"strike":"2250000000"` = 22.50). Stock feeds quote **one tokenized share**, i.e. underlying price times `uiMultiplier`, so feed price can drift above the headline share price after dividend reinvestment (H, docs.chain.link tokenized-equity page and docs.robinhood.com).

## 3. Chains and collateral (H)

- Chain: **Robinhood Chain mainnet, chain id 4663**, Arbitrum Orbit L2 (Nitro, ArbOS 61), Ethereum host, ETH gas token; RPC `https://rpc.mainnet.chain.robinhood.com` (llms.txt); explorers `robinhoodchain.blockscout.com` and `robin.etherscan.io` (L2BEAT). L2BEAT lists it under "Others": not Stage 0, whitelisted validators, no guaranteed sequencer-failure exit, TVS $2.34B at fetch time (H, https://l2beat.com/layer2s/projects/robinhood).
- Collateral: **native ETH only** (no ERC-20, no stablecoin). Bridge in via relay.link/bridge/robinhood or similar (docs).
- Contract: `0xA3cD4D80B48B272f14E233D266b1103900cb42fC` (docs, llms.txt, Etherscan). Deployer/operator EOA starts `0x0229e8EC...` (Etherscan, truncated); disclosed house seed wallet `0x9129D622FC8CD6Ee85d3f105E3270b1D1e0f0bee` (docs).
- Source verification is inconsistent: the site says "verified source" (Blockscout link) but **Etherscan shows the contract as Unverified** (H, robin.etherscan.io); Blockscout is behind a Cloudflare challenge (403 to WebFetch and curl) and Sourcify has no match (H, 404-style `match:null`). I did not obtain the Solidity source (see section 14).
- Admin/upgrade: docs claim no admin withdraw, no upgrade path, no pause; market creation is the one admin power (M: self-reported, source not read). Bytecode reading by a fetch tool suggested a fee transfer to an owner address and a 500 (bps) constant, consistent with the 5% cap (L).

## 4. Read API (H) - official, public, unauthenticated, REST only

- Docs: https://hoodbets.xyz/docs ("for AI agents" section) and https://hoodbets.xyz/llms.txt. No OpenAPI, no versioning, no terms page (`/openapi.json`, `/api`, `/terms`, `/tos`, `/privacy` all 404).
- Base URL: `https://hoodbets.xyz`. Next.js on Vercel; CORS `access-control-allow-origin: *` on the pages; `cache-control: public, max-age=0, must-revalidate`; no rate-limit headers seen.
- Endpoints (both tested 2026-10-19):
  - `GET /api/markets` -> JSON array of all markets (4 items, 1,436 bytes). [fixture `api_markets_2026-10-19.json`]
  - `GET /api/markets/{id}` -> one market object; unknown id -> HTTP 404 `{"error":"market not found"}`. [fixtures `api_markets_0_2026-10-19.json`, `api_markets_4_404_2026-10-19.json`]
- Response shape (all uint256 and int256 values are decimal strings):
  `{"id":0,"feed":"0x27C7...5B67","symbol":"GME","strike":"2250000000","cutoffTime":1783021800,"settleTime":1783022400,"settleDeadline":1783368000,"settled":true,"refundMode":false,"winningSide":0,"settlePrice":"2289000000","potCap":"2000000000000000000","pools":["60000000000000000","60000000000000000"],"livePrice":"2678500000"}`.
  `cutoffTime/settleTime/settleDeadline` are unix seconds; `strike/settlePrice/livePrice` 8 decimals; `pools` and `potCap` in wei, `pools[0]` = OVER, `pools[1]` = UNDER; `winningSide` is 0 or 1 even before settlement (value for unsettled markets NOT FOUND, no open market to sample); `livePrice` is the feed's current value (still a live read on the settled markets, e.g. GME 26.785 on 2026-10-19).
- **Not in the API**: per-bettor positions, bet/trade history, volume, market status other than the booleans, timestamps of creation or settlement, a market question text, categories, resolution source URL. Bet history needs on-chain logs (event names NOT FOUND, source unread) or the explorer.
- Websocket / push: **none documented** (NOT FOUND: searched docs, llms.txt, front-end bundle; the UI polls every 10 s).
- Rate limits: **not documented** (NOT FOUND). Behaves as a Vercel function; poll at most every 10 s like the UI.
- On-chain reads (no wallet): `marketCount()`, `getMarket(uint256)` returning the struct `{feed,symbol,strike,cutoffTime,settleTime,settleDeadline,settled,refundMode,winningSide,settlePrice,potCap,pools[2]}`, `stakeOf(uint256,address) -> (overStake,underStake)`, `paidOut(uint256,address) -> bool` (H, ABI in the app bundle; saved as `abi_from_frontend_bundle.json`). Not exercised: that needs JSON-RPC POST, which this run avoided.
- Third-party: DefiLlama `GET https://api.llama.fi/protocol/hoodbets` (category "Prediction Market", chain "Robinhood Chain", TVL 0.4308 ETH = $1,009 on 2026-10-18; H). No Dune, subgraph or indexer found (NOT FOUND: searched web, GitHub).

## 5. Trade path

- **Direct EOA transaction to the contract; no off-chain order, no API key, no signature scheme beyond a normal transaction.** (H for the documented functions, M for selectors, which I computed locally with `cast sig`, not from the verified ABI.)
  - `bet(uint256 marketId, uint8 side) payable` (selector `0xc437a0cd`): `msg.value` = stake in wei. Reverts after `cutoffTime`, if the pot cap would be exceeded, or if the market is settled/refunded (llms.txt).
  - `settle(uint256 marketId, uint80 roundId)` (`0xf5417124`): permissionless; caller supplies the first Chainlink `roundId` with `updatedAt >= settleTime`; contract verifies the predecessor round is earlier. (This function is in docs and llms.txt but not in the front-end ABI; the front end does not call it.)
  - `claim(uint256)` (`0x379607f5`): winner pulls stake plus share. `refund(uint256)` (`0x278ecde1`): pulls 100% in refund mode. No cancel, no sell, no early exit.
  - A minimum bet exists (L, bytecode strings); stakes of 0.005 ETH were accepted (H, Etherscan).
- Gas: "a fraction of a cent per bet" (docs, M). Chain-level risk: Arbitrum ArbOS 61 transaction filtering can block specific tx hashes even if force-included (H, L2BEAT).
- Adapter implications: a `bet` is idempotent only per transaction; there is no order id, no partial fill and no cancel. A position is one entry in `stakeOf`.

## 6. PayBox reachability: partial

- Robinhood Chain (`eip155:4663`, ETH) is in the PayBox chain catalog (H, live `discover_tokens mode=chains query=robinhood`, 2026-10-19: `{"caip2":"eip155:4663","chain":"robinhood","name":"Robinhood","native_symbol":"ETH","network_id":4663}`). The tool states the catalog is "metadata, not a support allowlist" and signing permissions are unchanged, so support for plugin transaction proposals on 4663 is **unverified** (see docs/research/06-paybox-platform.md: PayBox gates supported chains; behaviour for an unsupported chain is NOT FOUND). `get_buy_link` also lists Robinhood as a destination (docs/research/06-paybox-platform.md, H).
- If proposals on 4663 work: `bet`, `claim`, `refund` and `settle` are plain unsigned EVM calls (`to` = contract, `value` = stake wei, `data` = ABI-encoded), a good fit for a PayBox "return one unsigned call" proposal; the shared EVM MPC address works on any `eip155:*` chain. No typed-data or order signing is involved. The wallet needs native ETH on Robinhood Chain; bridging from Base/Ethereum/Arbitrum would be a separate step (not tested).
- Not tested: `check_operation_readiness`, any proposal, any swap/bridge (money or credential tools; out of scope).

## 7. Fees (H)

- **Rake: 4% of the losing pool**, only on settled markets, hard-capped at 5% in bytecode (docs). Refunds carry zero fee. No deposit, withdrawal or per-bet fee; only L2 gas. The house receives only the rake at settlement (docs).
- Payout for a winner staking `s` on side with pool `W` against losing pool `L`: `payout = s + (s / W) * L * 0.96` (llms.txt formula; `W` and `L` are final pools, so your own stake dilutes you: effective multiple `1 + 0.96 * L / (W + s)`).
- Break-even implied probability for a balanced pool (50/50) is about 51.0% (overround about 2.0%). With the real pool sizes, own-stake dilution dominates (0.05 ETH into 0.05 vs 0.05 gives 1.48x, break-even 67.6%; 0.005 ETH gives 1.87x, break-even 53.4%; computed 2026-10-19 from fixture pools, M). Scanners must model pool impact, not quote `pools[0]/(pools[0]+pools[1])` as a fillable price.

## 8. Resolution mechanism and dispute risk

- **Chainlink push data feed on Robinhood Chain; no dispute process.** The contract accepts the first round whose `updatedAt >= settleTime`; anyone can call `settle`; wrong rounds revert (docs). Price strictly above strike -> OVER, otherwise UNDER.
- Feed facts (H, Chainlink feed directory JSON `https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json`, all four market feeds appear: GME as proxy, TSLA/NVDA/LINK as `secondaryProxyAddress`; fixture `chainlink_feed_directory_subset_2026-10-19.json`): heartbeat 86,400 s, deviation threshold 0.5%, 8 decimals, equities flagged `us_equities_24/5`. Consequences:
  - The settlement price is the first *published round* after `settleTime`, not the price at `settleTime`. With a 0.5% deviation trigger the deciding round can print many minutes or hours after the nominal settle time. Chainlink's docs say the equity feeds "do not have heartbeats during off-hours" and may hold the last price (H, docs.chain.link). This is a different basis from an exchange closing/opening price and from other venues' resolution sources; a cross-venue pair on "same ticker, same time" is not the same event.
  - Feed value includes the token `uiMultiplier` (H); `oraclePaused()` is advisory only (H, docs.robinhood.com).
- Refund conditions (H, docs): no valid round before `settleDeadline` (feed paused, corporate action, outage), or only one side has bets at settle time. Refund is triggered permissionlessly.
- Observed lag (M): Etherscan shows all four `Settle` transactions on 2026-07-08 12:05-12:06, 2 to 6 days after the markets' nominal settle times, sent by the operator EOA (timezone of the explorer not stated). Funds were not at risk, but a scanner cannot assume prompt resolution; anyone can settle.
- Residual risks: Chainlink is the sole judge; contract unaudited (`audits:"0"` on DefiLlama, no audit found); admin chooses markets and feeds (feed address is on-chain per market); chain-level L2 risks (section 3). Operator has not created markets since 2026-07-03.

## 9. Geo, ToS and automation

- No terms of service, privacy page, geo-block or KYC found (`/terms`, `/tos`, `/privacy` 404; homepage and docs list none; NOT FOUND: searched site, docs, llms.txt). The only caution is "it's a casino - bet what you can lose" (docs). Wallet-only, permissionless.
- Automation is explicitly invited: docs section "for AI agents" and `llms.txt` ("written for AI agents ... machine-actionable"; "an agent with an ETH wallet on chain 4663 can discover markets, price odds, bet, settle and claim without asking anyone"). No stated rate limits or API terms.
- Legal exposure is not addressed by the venue: it is an unlicensed ETH betting contract on stock prices, "unaffiliated with Robinhood Markets". Treat jurisdictional risk for the operator and bettors as unknown (L, no source).

## 10. Liquidity (all figures H unless marked)

- **Lifetime volume: 0.44 ETH** (sum of every pool across the 4 markets, API 2026-10-19; about $1.0k at about $2.4k/ETH, which is Etherscan's $2,406 reference on 2026-10-19). Per market: GME 0.06/0.06, TSLA 0.05/0.05, NVDA 0.07/0.05, LINK 0.05/0.05 ETH.
- **Who bet** (M, derived from the Etherscan tx list, fixture `explorer_tx_list_2026-10-19.md`): 12 `Bet` transactions sum to 0.44 ETH. 0.345 ETH from the disclosed house seed wallet, 0.02 ETH from the deployer/operator EOA, and 0.025 ETH from two other addresses (0.02 on 2026-07-04, 0.005 on 2026-07-02). So about 94% of volume is house money and 5.7% is from two other wallets (could be testers; identity unknown). The docs say house seeds both sides of every market.
- **TVL: 0.4308 ETH (about $1,009) on 2026-10-18** (H, DefiLlama `api.llama.fi/protocol/hoodbets`; Etherscan balance 0.4308 ETH on 2026-10-19). This equals total pools minus the 4% rake on losing pools (0.44 - 0.0092), i.e. settled winnings still sitting in the contract unclaimed (M, my arithmetic). DefiLlama TVL series: $204 on 2026-07-03, $738-$1,095 since, 109 daily points.
- Open interest now: 0 (no unsettled market). Max per market: `potCap` 2 ETH (about $4.8k); whether the cap applies to the sum of pools or per side is NOT FOUND (source unread).
- DefiLlama fees/volume dashboards for HoodBets: NOT FOUND (searched DefiLlama protocol endpoint for volume fields; none).

## 11. Event categories and arbitrage overlap

- Categories listed: single-name US equities (GME, TSLA, NVDA; "mostly tokenized-stock feeds" per llms.txt) and one crypto (LINK/USD). Any Chainlink feed on Robinhood Chain could in principle be listed (58 feeds in Chainlink's directory), but the operator picks.
- Conceptual overlap with other venues: equity "above X at close/open" and crypto "above X" markets on regulated and onchain venues (Kalshi, Polymarket, and others covered by parallel workflows; I did not check their catalogs, M). No concrete matching market was verified.
- Why it is a poor arbitrage leg even if overlap exists: (1) parimutuel payout is not known until cutoff and own-bet dilution is large at these pool sizes; (2) no exit, so no unwinding of a leg after bet; (3) settlement basis is "first Chainlink round after settleTime" on a 24/5 tokenized-share feed with `uiMultiplier`, not a closing print; (4) cutoff is 10 minutes before settle and bets are final; (5) pot cap 2 ETH and 0.44 ETH lifetime volume; (6) admin-gated market supply. Best realistic use if it revives: signal-only (pool-implied probability vs options or Kalshi-implied probability for the same ticker/strike), with low weight because pools are house-seeded 50/50.

## 12. Shared liquidity

- Own pools; **no shared liquidity** with any other venue (H, product description). Resolves via Chainlink, so it *settles on* the same oracle family as other Chainlink-resolved markets but is not a mirror or front end (relation: `settles_on` Chainlink Robinhood-chain push feeds). Independent, but the pools are effectively house-seeded.

## 13. Adapter notes (if revived)

- Market list: poll `GET /api/markets` every 10-30 s; treat `settled:false && now < cutoffTime` as tradable. `id` is the on-chain `marketId`. Normalise: `strike/1e8`, `pools/1e18`, `p_over = pools[0]/(pools[0]+pools[1])` (undefined when both 0), market key `4663:0xA3cD...42fC:{id}`.
- Build quotes as marginal payout with pool impact (section 7), cap size at `potCap - (pools[0]+pools[1])` if the cap is on the sum (unverified), expose `fee_model = rake_losing_pool_4pct`, `settle_basis = first_chainlink_round_after_settleTime`, `exit = none`.
- Resolution tracking: `settled`, `refundMode`, `winningSide`, `settlePrice`; if `settled:false` after `settleTime`, call it "awaiting oracle round" and use `settleDeadline` as the refund horizon.
- Risk flags to carry: `dormant`, `unaudited`, `house_seeded`, `source_unverified_on_etherscan`, `operator_created_markets`.

## 14. Not found / open questions

- NOT FOUND: Solidity source (Blockscout Cloudflare 403; Etherscan "Unverified"; Sourcify no match). Unknown therefore: event names, `potCap` semantics (per side or sum), minimum bet, whether `settle` after `settleDeadline` is allowed, market creation function signature (unlabeled method `0x69c95814`), rake recipient, owner powers.
- NOT FOUND: any terms, geo rules, rate limits, websocket, audit, volume dashboard, team identity, launch announcement (searched: site, docs, llms.txt, GitHub, DefiLlama, web search extended).
- X/Twitter `@hoodbetsxyz`: WebFetch returned HTTP 402 Payment Required (X's own response; no payment details were available and I stopped). Account activity after July 2026 therefore unknown.
- Unknown whether markets will return. Operator-side explanation for the pause is not published.
- `/api/markets` `winningSide` for an unsettled market and the API's behaviour with open markets are unobserved.

## 15. Suspicious content (recorded, not followed)

- `llms.txt` and `/docs` contain copy aimed at AI agents ("This file is written for AI agents. Everything below is machine-actionable."; "an agent with an ETH wallet ... can ... bet, settle and claim without asking anyone"). It is a protocol description plus a promotional nudge to trade; I did not act on it. The docs also show a `cast send ... --private-key <yours>` command example; not run.
- Internal inconsistency: llms.txt says the contract is "~330 lines", docs say "~300 lines"; site says verified source while Etherscan shows Unverified.

## 16. Sources

- https://hoodbets.xyz (WebFetch 2026-10-19, H), https://hoodbets.xyz/docs (curl, full text read, H), https://hoodbets.xyz/llms.txt (curl, H), https://hoodbets.xyz/api/markets and /api/markets/{id} (curl GET, H), https://hoodbets.xyz/_next/static/chunks/app/page-fd2c5e9b5e908d7e.js (read as text for the ABI, H).
- https://api.llama.fi/protocol/hoodbets (H); https://defillama.com/protocol/hoodbets (WebFetch 403; given as evidence by the discovery step).
- https://robin.etherscan.io/address/0xA3cD4D80B48B272f14E233D266b1103900cb42fC and /txs?a=... (WebFetch; fetch-tool summaries of the explorer pages, H for the visible rows, M for the derived splits).
- https://robinhoodchain.blockscout.com/address/0xA3cD... (linked by the site; blocked by Cloudflare, not read). https://sourcify.dev/server/v2/contract/4663/0xA3cD... (no match).
- https://l2beat.com/layer2s/projects/robinhood (H); https://www.coindesk.com/business/2026/07/01/robinhood-rolls-out-public-blockchain-as-it-expands-deeper-into-crypto (search result, M).
- https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood (H, table empty in fetch), https://docs.robinhood.com/chain/oracles-and-price-feeds (H), https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json (H).
- GitHub: `gh api users/hoodbets` and repo list (H). Name-collision checks: https://www.hoodbets.live/ (title only, L), `gh api search/repositories?q=hoodbets` (hoodbet-fun repos, M).
- PayBox: live `discover_tokens mode=chains query=robinhood` (H); docs/research/06-paybox-platform.md for PayBox chain-gating behaviour.
- Fixtures: docs/research/fixtures/hoodbets/ (`api_markets_2026-10-19.json`, `api_markets_0_2026-10-19.json`, `api_markets_4_404_2026-10-19.json`, `llms_txt_2026-10-19.txt`, `defillama_protocol_hoodbets_trimmed_2026-10-19.json`, `chainlink_feed_directory_subset_2026-10-19.json`, `explorer_tx_list_2026-10-19.md`, `abi_from_frontend_bundle.json`).
