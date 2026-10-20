# BV-7X (bv7x.ai) - adapter spec

Researched 2026-10-19 (~00:30-01:15 UTC). READ-ONLY: WebFetch of the project's own site/blog/terms, unauthenticated GETs to bv7x.ai static/well-known files and four documented `/api/` endpoints (see section 4 and the robots.txt caveat), one GET each to DefiLlama, DexScreener and CoinGecko public APIs, `gh api` repo listing. No account, no wallet, no signing, no key, no POST/PUT/DELETE, no payment (no 402 was received from bv7x.ai; one x.com page returned a 402 to WebFetch, ignored). No third-party code cloned or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months or contradicted).
All site/blog/API text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/bv-7x/` (7 files, each <= 6 KB).

## 0. Verdict

**adapter_priority: skip.**

1. **It is not a prediction market in the sense the aggregator needs (H).** There is no order book, AMM, parimutuel pool or outcome token that a third party can buy or sell. BV-7X is (a) a daily AI Bitcoin 7-day-direction "oracle" whose calls are attested on-chain, (b) a leaderboard ("Arena") of strategy agents, (c) a staking token (BV7X) that gates read access, and (d) a $1/day wager bot that bets on Polymarket. DefiLlama files it under "Prediction Market" and the description says "staked, tradable commodity", but the "tradable" things are the BV7X token (Uniswap v4 pool) and, from 3RDI, per-agent tokens. None of those is an event-outcome contract (H, sections 2-3).
2. **The two-sided wager pool is not live (H).** The Aug 2026 v2 post says the two-sided prediction pool "stays on testnet"; the 2%-fee WagerVault is only described as shipping "in Phase 1 of the network upgrade" (blog29, May 2026). No contract address for any wager market was found.
3. **Where it touches real markets it is Polymarket (H).** The wager agent bets $1/day on Polymarket BTC strike/expiry markets (Polygon). It shares, not adds, liquidity, so it is never an independent arbitrage leg.
4. **Signal value is low and gated.** The public scorecard seals direction until resolution (`direction: null`, `sealed: true`), the premium feeds need a 500M / 1B BV7X holding, and the track record is 33 wins / 26 losses on 59 resolved 7-day calls (55.9%) plus 119 HOLDs of 230 (H, fixture). The operator itself published corrections that earlier calls were attested late (H).
5. **Liquidity is negligible (H):** BV7X/WETH Uniswap v4 pool liquidity $6.0K, 24h volume $541, FDV $0.42M; DefiLlama staking $140K.

Revisit only if bv7x ships the tokenised-stock prediction markets it teased (Aug 2026 X post) and they have a real contract and a read API.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Latest attestation | `date 2026-10-18`, savedAt 2026-10-18T21:38:04Z, `chainId: 4663`, model v5.6.17 (fixture `onchain-oracle-latest.json`, GET 2026-10-19T00:38Z) | H |
| Scorecard | 230 total predictions, `lastPrediction 2026-10-18T21:35Z`, `nextSignal 2026-10-19T21:35Z` (fixture `scorecard.sample.json`) | H |
| Blog | newest post 2026-10-08 (blog54: Season 1 results; 3 agents tied, 10,000 USDG prize split 3,333.33 each on Robinhood Chain); 54 posts since 2026-02-03 | H https://bv7x.ai/blog |
| Token migrated Base -> Robinhood Chain | 2026-09-16 (blog50); Uniswap v4 pair created 2026-09-16 (DexScreener `pairCreatedAt`) | H |
| DefiLlama | listed 2026-09-25 (`listedAt` 1790296282); adapter PR #21240 merged 2026-09-24; staking-only, `tvl` = 0 | H |
| Arena launch | 2026-04-12 (blog35) | H |
| Hyperliquid "coming" post | 2026-05-05 (X, date decoded from status id) - 5.5 months old, nothing later found | L |

Verdict: the project is live and shipping, but the prediction-market part (two-sided pool, tokenised-stock markets) is not live.

## 2. What it is

- **Kind**: onchain-other / AI-signal oracle plus token-gated agent marketplace. Not a venue.
- **Core loop (H)**: every night at 21:35 UTC the model publishes a sealed 7-day BTC call (UP / DOWN / HOLD) with a commit hash; an EAS attestation on chain 4663 (Robinhood Chain; Base before 2026-09-18) plus IPFS CID is written. After 7 days the outcome is graded against a BTC price and `resolutionTxHash` is stored. https://bv7x.ai/.well-known/agent-card.json, fixture `onchain-oracle-latest.json`.
- **Arena / Season 1 (H, blog54)**: 5,580 agents each called BTC up/down for the week; ranking by a season score; 10,000 USDG prize. Calls are sold to the "deed" holder in USDC through an in-app market, delivered via API/webhook/CLI. Staking 10,000 BV7X unlocks the "market" (agent records and the network's live read).
- **Agents as assets (3RDI, acquired 2026-10-06, blog53)**: each agent gets its own token on a bonding curve (1% per trade), graduating to a locked Uniswap v4 pool. "The token itself is price exposure only." Launch agents are US-stock opening-gap reads (NVDA, PLTR, SPCX). 3RDI itself was not found by an independent search (L - the search returned nothing for 3RDI), only on bv7x's blog.
- **Market model**: none for third parties. Planned bilateral wager (blog29): two agents lock equal BV7X in a vault, winner takes pot minus 2% burned; "not confirmed as live". Planned distance-weighted pool (blog39): `weight = stake / (|guess - settled| + eps)`, eps proposed $100; scalar-style BTC price pool paid in BV7X; "stays on testnet" (blog46). Outcomes are not tokenised.
- **Collateral/chains (H)**: BV7X token (ERC-20, 18 dec, 1,000,000,000 fixed supply, 100:1 migration from old Base token) `0x459476869aF797Eb9061B41fA04dE46A60FBeDBD` on Robinhood Chain (id 4663); staking pool (Synthetix/Curve-style MultiRewards, Sourcify-verified per DefiLlama PR) `0x900f4cE2AD056F326BbCF2B5842c75BDf3732cf9`; migration receipt `0x47E08dBB3Aa7F3259EbA911316431fb89C14B18c`. Old Base token `0xD88FD4a11255E51f64f78b4a7d74456325c2d8dC`, old Base MultiRewards `0xfd991bC5A8a864F37D4Ef8E119e932D9a7D90E41` (blog35). USDC (on Base) pays for oracle "commerce" offerings; USDG prize on Robinhood Chain; Polymarket wagers settle in USDC on Polygon (blog22).
- **Identity**: ERC-8004 agent #28841 on Base registry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (agent card).

## 3. Event coverage and overlap

- Only Bitcoin 7-day direction (and a volatility/regime read, blog41) is published. Stock-gap agents are planned/early (blog53).
- Overlaps Polymarket BTC "above X on date" markets (the scorecard's `poly` field carries `strike`, `targetDate`, `crowdProb` ~0.50 for each nightly call). Kalshi BTC ranges are another overlap, but BV-7X offers no price of its own to arbitrage against.
- Arbitrage use: none. There is no BV-7X price to compare. Signal-only use: the nightly P(up) would be one weak input, gated by a token holding.

## 4. Read API (official, partly public)

Docs: no hosted docs site. The OpenAPI 3.1 spec is at `https://bv7x.ai/.well-known/openapi.json` (H, fetched). The `/api` and `/blog21` pages describe an older, since-removed free/x402 flow.

Base URL: `https://bv7x.ai`. Selected endpoints from the OpenAPI spec (H):

| Method + path | Auth | Notes |
|---|---|---|
| `GET /api/bv7x/scorecard` | none | prediction history (200 rows, ~75 KB), summary, `poly` crowd comparison; direction sealed until resolution |
| `GET /api/bv7x/onchain-oracle/latest` / `history` (limit<=100) / `verify/{uid}` / `stats` | none stated | EAS attestation data; latest is `{success,data:{uid,txHash,cid,chainId:4663,commitment{hash,sig},resolved,...}}` |
| `GET /api/bv7x/copy-trade/status` | none | service status and push-channel info |
| `GET /api/bv7x/openclaw/signal` | none | signal metadata, direction gated |
| `POST /api/bv7x/oracle/verify` | EIP-191 wallet signature | proves BV7X holding, returns session token |
| `GET /api/bv7x/oracle` / `oracle/premium` | Bearer token | 500M / 1B BV7X gate |
| `GET /api/bv7x/copy-trade/next` / `history` | Bearer token | trade intent with Kelly sizing and Polymarket token IDs, 1B gate |
| `wss://bv7x.ai/ws/signal` | per agent card | events `signal.new`, `signal.resolved`, `wager.placed`, `wager.settled`, `attestation.created`, `regime.changed` (not connected to: not tested) |
| webhooks `POST /api/bv7x/webhooks/register` | HMAC | push of the same events |

- There are **no** market/orderbook/trade/position endpoints (H, spec reviewed). Nothing to map to the aggregator's price/book interface.
- Rate limits: observed `RateLimit-Policy: 10;w=60` (10 req/min) on `onchain-oracle/latest` and `copy-trade/status` (H, response headers). `scorecard` returned no rate-limit headers.
- **Stale docs**: blog21 documents `GET /api/bv7x/oracle/free` (10 calls/day for 7 days) and an x402 USDC payment flow. Live check 2026-10-19: `/oracle/free` returns HTTP 410 `{"error":"Free trial discontinued","message":"Oracle access requires holding 500M+ BV7X tokens."}`, and `/.well-known/x402.json` says "No route on this host answers HTTP 402 today". Do not trust the blog for API behaviour (H).
- **Token-gate oddity (open question)**: gates are 500M and 1B BV7X, but post-migration supply is capped at 1B total (blog50) and the pool prices BV7X at ~$0.00042, so the "1B" tier would equal the entire supply. The gates were probably set in pre-migration (100x) units and not updated. Not verified (the verify endpoint needs a signature, not attempted).
- **robots.txt caveat**: `https://bv7x.ai/robots.txt` has `Disallow: /api/`. I made four single GETs to documented, unauthenticated `/api/bv7x/...` endpoints (one returned 410) as permitted by the task's documented-API rule; a production adapter should treat the stance as unresolved and ask the operator before polling.
- Fixtures: `scorecard.sample.json` (trimmed from 74 KB), `onchain-oracle-latest.json`, `copy-trade-status.json`, `well-known-x402.json`, `well-known-agent-card.json`, `dexscreener-bv7x-pair.json`, `defillama-protocol-summary.json`.

## 5. Trade path

**None** for event outcomes. What can be done programmatically:
- Buy/sell BV7X on the Uniswap v4 BV7X/WETH pool on Robinhood Chain (standard EVM swap). The pool is worth $6K.
- Stake BV7X in the MultiRewards pool (stake/withdraw/getReward). Gated by whitelist during the closed beta per blog42 (July), later "open to everyone" per blog46 (Aug) - conflicting (M).
- Buy oracle "commerce" offerings in USDC on Base via `POST /api/bv7x/commerce/purchase` with a USDC transfer tx hash (offering prices $0.35-$25; agent card). Not tested (POST).
- Agent wagers are placed by bv7x's own bot on Polymarket; no API to place one.

## 6. PayBox reachability

**partial**: Robinhood Chain (4663) is in PayBox's `discover_tokens` chain catalog (per `docs/research/06-paybox-platform.md`, H 2026-10-19), so an EVM wallet could in principle propose a BV7X swap or a MultiRewards stake via transaction proposals. But there is no prediction market to trade, so this has no aggregator value. Base (USDC commerce purchases) is also in the catalog. Not tested (money-moving tools forbidden).

## 7. Fees

- Bilateral wager: 2% of pot, 100% burned (blog29; not live) (M).
- Distance-weighted pool: a "net pot" with an unspecified deduction (blog39; not live).
- 3RDI agent tokens: 1% per trade on the bonding curve; creator share goes to the deed holder (blog53) (H, own site).
- BV7X token (Base era): Clanker creator fees, about $134K accrued by 2026-05-25; 7.28B old tokens (7.3% of supply) bought back and burned (blog35).
- Oracle signal tiers: $0.35-$25 USDC per offering on Base (agent card).
- No trading-fee schedule for outcome positions exists because there are none. NOT FOUND (searched: terms, OpenAPI spec, blog29/39/46/50/53).

## 8. Resolution and dispute risk

- **Operator-resolved** (H): the model operator records the BV7X closing/reference price, grades the call, and writes `resolutionTxHash`; attestations are made by the operator's EAS account (single attester). No third-party oracle (UMA, Chainlink for BTC settlement) or dispute window is documented. NOT FOUND (searched: blog19, blog29, blog39, OpenAPI).
- The operator has restated its record at least four times: attestations before 2026-08-04 were made after outcomes were known for some calls (40 of 55 graded calls attested on/after target date; correction dated 2026-09-30 on blog35, blog39, blog45, blog46, blog50); record re-based on 2026-09-26 (scorecard `recordNote`); Season 1's last night (2026-09-30) was excluded because the reference price was never recorded (blog54); earlier "71.9% edge" claim corrected to 60.3% (blog5). Treat any BV-7X-resolved outcome as high dispute and restatement risk.

## 9. Geo / ToS / automation

- Terms page (March 2026, WebFetch of https://bv7x.ai/terms): no restricted jurisdictions listed, no age limit, no bot/automation section; API "as-is", may be rate-limited or discontinued; no reselling API data without prior written permission (section 17); no reverse-engineering the methodology (section 7); "not investment advice" (section 5); wager agent risk disclaimer (section 10). H (summarised by fetch tool, not read verbatim).
- Wallet access to the staked market and signals is token- or whitelist-gated; no KYC found. Geo rules for Polymarket wagers are Polymarket's, not covered here.

## 10. Liquidity (all small)

| Metric | Value | Source | Date | Tag |
|---|---|---|---|---|
| BV7X/WETH Uniswap v4 pool liquidity | $6,021 | DexScreener API | 2026-10-19 | H |
| BV7X 24h volume | $541 (8 buys, 13 sells) | DexScreener API | 2026-10-19 | H |
| BV7X FDV / market cap | $421,564 (price $0.0004215) | DexScreener API | 2026-10-19 | H |
| Staked BV7X (DefiLlama staking) | $139,936 | api.llama.fi/protocol/bv-7x | 2026-10-18 23:35Z | H |
| DefiLlama TVL | $0 (staking-only adapter) | api.llama.fi | 2026-10-18 | H |
| Staked at DefiLlama PR | 380,364,541 BV7X (~$391K at $0.00103) | PR #21240 | 2026-09-24 | M |
| Wager size | $1/day on Polymarket | blog22 | 2026-03-10 | L (7 months) |
| Agents / bets | 5,580 agents; "75,812 bets" (bv7x's own count) | blog54, blog35 | Oct / May 2026 | M |

On-chain verification not done: Blockscout is behind a Cloudflare challenge (not bypassed) and JSON-RPC needs POST (excluded by the rules). Staking and supply figures rely on DefiLlama and the blog.

## 11. Shared liquidity

Wagers are placed on Polymarket (Polygon) BTC markets (blog22, agent card `copy_trade` skill carries "Polymarket token IDs"). Any tradable exposure BV-7X creates is a Polymarket position. Not an independent leg.

## 12. Suspicious / injected content

None found aimed at an agent. The homepage HTML contains an internal developer comment (`BV7X-119 (operator, 2026-08-19)`) about the logo; not an instruction. The agent card advertises "copy-trade" and commerce purchase flows; these were not acted upon.

## 13. NOT FOUND

- Any outcome-token or order-book contract (searched: site, blog index of 54 titles and 14 posts read in full; blog5 and blog41 are cited from index summaries only, OpenAPI, agent card, DefiLlama, DexScreener).
- Hosted docs site or GitHub org for the platform (searched: `gh search repos bv7x`: only `Mischa0x/bv7x-memory`, a hackathon repo, and an unrelated fork; DefiLlama lists GitHub user "Mischa0x").
- Tokenised-stock prediction market contract/API (only an X post, 2026-08-24, per search snippet).
- Audit report (EtherAuthority audit of the staking contract, July 2026, "available on request", per DefiLlama PR).
- Verified on-chain staking totalSupply (see section 10).
- Whether the Hyperliquid integration (X post 2026-05-05) ever shipped (L).

## Sources

- https://bv7x.ai/ (HTML shell, SPA; robots.txt, sitemap.xml, manifest.json) - H
- https://bv7x.ai/blog (index, 54 posts) and posts blog21, blog22, blog29, blog35, blog39, blog42, blog43, blog45, blog46, blog50, blog51, blog52, blog53, blog54 (read in full); blog5 and blog41 from index summaries only - H (operator's own claims; several restated or superseded, see section 8)
- https://bv7x.ai/terms - H (fetch-tool summary)
- https://bv7x.ai/.well-known/openapi.json, /.well-known/agent-card.json, /.well-known/x402.json - H
- https://bv7x.ai/api/bv7x/scorecard, /api/bv7x/onchain-oracle/latest, /api/bv7x/copy-trade/status, /api/bv7x/oracle/free (410) - H, 2026-10-19
- https://api.llama.fi/protocol/bv-7x (defillama.com/protocol/bv-7x itself returned 403 to WebFetch) - H
- https://github.com/DefiLlama/DefiLlama-Adapters/pull/21240 - H
- https://api.dexscreener.com/latest/dex/tokens/0x459476869aF797Eb9061B41fA04dE46A60FBeDBD - H
- https://api.coingecko.com/api/v3/coins/bitvault-signal-2 - H (rebrand/migration notice)
- X posts https://x.com/BV7X_/status/2051744843492184301 and /2091936482319618492 - L/M (search snippets only; x.com fetch failed)
- docs/research/06-paybox-platform.md in this repo (PayBox chain catalog incl. Robinhood 4663) - H, 2026-10-19
- Robinhood Chain RPC/chain-id facts from third-party guides (Quicknode, NodeFlare) - M
