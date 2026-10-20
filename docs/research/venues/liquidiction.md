# Liquidiction (liquidiction.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 06:30-08:00 local, snapshots of third-party pages at 00:39-00:45 UTC). READ-ONLY: official docs, `gh api` file reads, unauthenticated GETs to documented hosts, PayBox read-only `discover_plugins` / `get_contract`. No account, wallet, key, signature, POST/PUT/DELETE, payment, WebSocket session, browser automation or PayBox money/signing tool. Third-party pages and repos were treated as untrusted data; no third-party code was cloned, installed or run. Scripted requests used the User-Agent `insurance-markets-research/0.1`.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred, or a small-model page summary; **L** = weak or stale.
Fixtures: `docs/research/fixtures/liquidiction/` (4 files, largest 15.8 KB). Sibling note on the underlying venue: `docs/research/venues/hyperliquid-outcomes-hip-4.md` (read it for WebSocket fixtures, resolution tiers and the full adapter spec; this note does not repeat them).

## 0. Verdict

- **Liquidiction is a front end, not a venue.** It is a non-custodial web app and order router for Hyperliquid HIP-4 outcome markets (plus Hyperliquid perps and spot). Trades execute on HyperCore through the user's own wallet; Liquidiction "does not operate the markets" and holds no funds (H: https://liquidiction.gitbook.io/liquidiction-docs, FAQ, ToS section 2). It has **no liquidity of its own**: it shares 100% of its books with Hyperliquid HIP-4 and with every other HIP-4 front end (Outcome.xyz, Phantom and others, per the sibling note).
- **Live (H):** `liquidiction.xyz` served HTTP 200 on 2026-10-19; its own stats page (snapshot 2026-10-19 00:45 UTC) shows 291 open markets, $3.48M 24h HIP-4 volume; DefiLlama shows Liquidiction-attributed volume every day since 2026-05-02.
- **adapter_priority = skip** as a separate adapter (duplicate liquidity). Build **one** adapter, `hyperliquid-outcomes` (P1 in the sibling note), and treat Liquidiction as a label on that pool. Optional later use of Liquidiction as a **data/signal source** (deployer overdue-settlement counts, sports entity aliases): P2 at most.
- What is useful here that the sibling note lacks: (a) deployer-level volume split and overdue-settlement counts from Liquidiction's analytics (section 9), (b) a clear picture of builder-code attribution, (c) the fee-disclosure conflict (section 6), (d) the fact that the same fixture can be listed by more than one deployer (intra-Hyperliquid arbitrage candidates; section 10).

## 1. Is it still live? (2026)

| Evidence | Tag | Source |
|---|---|---|
| Site up, describes itself as "a non-custodial frontend for HIP-4 prediction markets and perps on Hyperliquid"; ~210 markets on the home page; mainnet quoted in USDC; testnet at testnet.liquidiction.xyz | M (page summary) | https://liquidiction.xyz/ |
| Stats page, snapshot "Oct 19 00:45 UTC", archive through Oct 18 23:59 UTC: 291 markets open, 12,667 deployed since 2026-05-02, 12,442 settled, 14 awaiting settlement | H (I parsed the page HTML) | https://liquidiction.xyz/hip4/stats |
| DefiLlama row "Liquidiction Outcome" (id 8137, category Interface, chain Hyperliquid L1, parent Liquidiction, tag "Hyperliquid HIP4 Builder", description "A frontend for Hyperliquid's prediction markets."); daily volume non-zero on 165 of 169 days from 2026-05-02 to 2026-10-17 | H | `GET https://api.llama.fi/protocol/liquidiction-outcome`, `GET https://api.llama.fi/summary/dexs/liquidiction-outcome` (fixtures) |
| Hosted MCP discovery doc served `version 1.1.0` | H | `GET https://liquidiction.xyz/.well-known/mcp.json` (fixture) |
| MCP repo `Liquidiction/liquidiction-mcp` created 2026-04-09, last push 2026-09-11, MIT, 6 stars, not archived | H | `gh api repos/Liquidiction/liquidiction-mcp` |
| Builder-fill archive for the Liquidiction builder address has fills on 2026-10-15 (255 rows) and 2026-10-16 (251 rows) | H | `GET stats-data.hyperliquid.xyz/Mainnet/builder_fills/{addr}/{date}.csv.lz4` (fixture sample) |
| `https://defillama.com/protocol/liquidiction-outcome` returned HTTP 403 to my fetch (bot block); I used the public `api.llama.fi` instead | H | WebFetch result |

Verdict: **still_live = true.** Nothing relied on is older than 6 months except the gitbook Terms of Service (dated 2026-03-27, superseded by the liquidiction.xyz/terms version dated 2026-09-03) and the official Hyperliquid HIP-4 page (undated, stale on fees and on "BTC only").

## 2. Kind and market model

- **Kind:** non-custodial UI + order router + analytics + hosted read-only MCP, built on Hyperliquid builder codes. Not an exchange, not a market maker, not a market creator (H: ToS section 16 of liquidiction.xyz/terms: it does not "Deploy markets, define outcomes, set resolution criteria, choose oracles, or determine settlement").
- **Underlying market model (HIP-4, H):** fully collateralised outcome tokens on HyperCore's spot-style order book. Each outcome has `sideSpecs` (normally Yes/No) with one token per side; Yes and No books are merged ("a buy of Yes at price p is equivalent to a sell of No at 1-p"); priority price-side-time (https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets). Binary, categorical (via "questions": exactly one named outcome settles Yes, plus an automatic fallback "other") and scalar-capable (standalone outcomes may settle to any fraction in [0,1]; question outcomes only 0 or 1) (H: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions, page carries a "Testnet-only" banner). Operations: split (quote -> Yes+No), merge, mergeQuestion, negate (H: exchange-endpoint docs, `userOutcome` action).
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** `encoding = 10*outcome + side`; spot coin `#<encoding>` (books, WS), token name `+<encoding>` (balances), order asset id `100_000_000 + encoding`. Liquidiction's own docs add: use `#N` in `l2Book` / `candleSnapshot` / `recentTrades` / WS, legacy `@N` "can return null" (H: https://liquidiction.gitbook.io/liquidiction-docs/developers/api-reference).
- **Recurring and template markets (H):** protocol-run recurring price markets (15m / 1h / 1d) and deployer-run template markets (sports, rate decisions, awards, etc.). Per Liquidiction's stats page, 286 of 291 open markets are deployer-settled; open-market "shape" labels seen: `Custom event`, `Price threshold` (H, stats page HTML).
- Order types in the Liquidiction UI: market (IOC with up to 15 retries), limit (post-only), ladder, TWAP (client-side, tab must stay open) (H: https://liquidiction.gitbook.io/liquidiction-docs/trading/order-types.md). These are UI features, not venue features.

## 3. Chains and collateral

- **Chain:** Hyperliquid L1 / HyperCore (not the EVM; "All prediction market operations ... happen natively on L1, not on the EVM") (H: Liquidiction FAQ). DefiLlama chain "Hyperliquid L1" (H).
- **Collateral:** USDC. USDC replaced USDH as the HIP-4 quote asset on mainnet on 2026-05-28 (H as a Liquidiction doc claim: https://liquidiction.gitbook.io/liquidiction-docs/hip-4-prediction-markets/how-it-works; M for the date, not independently confirmed in Hyperliquid's own docs). Read `quoteToken` from `outcomeMeta`, do not hard-code it.
- **Funding:** bridge USDC to the Hyperliquid L1 balance. Liquidiction's `/funds` and `/bridge` pages route via LI.FI with a 0.05% integrator fee (M: ToS summary of liquidiction.xyz/terms). Direct Hyperliquid deposit from Arbitrum is the standard route (sibling note section 6; exact bridge call not verified).
- **Wallets in the Liquidiction UI:** MetaMask, Rabby, Coinbase Wallet, WalletConnect wallets and Privy email wallets (H: FAQ). Privy also generates and custodies the "automation agent wallet" used for Triggers / auto-cancel (H: ToS section 7 via page summary, M).

## 4. Read API

- **Existence:** `official-public` for the underlying data, but it is **Hyperliquid's** API, not Liquidiction's. Liquidiction says it has no private market-data protocol: "Liquidiction reads public Hyperliquid surfaces" (H: https://liquidiction.gitbook.io/liquidiction-docs/developers/developers.md).
- **Docs:** https://liquidiction.gitbook.io/liquidiction-docs/developers/api-reference (request shapes), https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (official). Note: Hyperliquid's own info-endpoint page does **not** document `outcomeMeta` or any outcome type (grep of the 55 KB page: no hit), so Liquidiction's API-reference page is currently the best public description of the shapes (M, third party).
- **Base URLs:**
  - REST (POST only): `https://api.hyperliquid.xyz/info`; testnet `https://api.hyperliquid-testnet.xyz/info`.
  - WebSocket: `wss://api.hyperliquid.xyz/ws`.
  - Liquidiction hosted read-only MCP (Streamable HTTP, JSON-RPC over POST, batch arrays rejected with -32600): `https://liquidiction.xyz/api/mcp`; sports MCP `https://liquidiction.xyz/api/mcp/sports` (H docs; not called, POST).
  - Public builder-fill archive (GET, lz4 CSV): `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{lowercase_builder}/{YYYYMMDD}.csv.lz4` (H: fetched; see below).
- **Key endpoints (H, Liquidiction API reference):** `{"type":"outcomeMeta"}` (outcomes, questions, sides, `quoteToken`, `venue`, settlement state; the MCP code also reads `deployers[]` and `settledNamedOutcomes`); `allMids` (keys `#N`); `l2Book` (`coin:"#N"`; `levels[0]` bids, `levels[1]` asks, each `{px, sz, n}`); `candleSnapshot` (`req:{coin, interval, startTime, endTime}`); `recentTrades` (`coin`); wallet reads `userFillsByTime`, `spotClearinghouseState`, `openOrders`. Resolution state: `outcomeMeta.questions[].settledNamedOutcomes`; per-outcome `settledOutcome` and template data via `outcomeTemplates` are in the sibling note.
- **WebSocket subscriptions (H, Hyperliquid docs and Liquidiction API reference):** `allMids`, `l2Book`, `trades`, `candle`, `bbo`, plus user streams (`orderUpdates`, `userEvents`, `userFills`, `webData3`).
- **Auth and limits:**
  - Hyperliquid reads: no key. Per IP 1200 REST weight per minute; `l2Book`, `allMids`, `spotClearinghouseState` weight 2; most other info types weight 20; WS max 10 connections, 1000 subscriptions, 2000 messages per minute (H: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).
  - Liquidiction hosted MCP: no auth, 60 requests/min per IP, 30/min for wallet and market-data calls, responses cached 15-30 s (H: `/.well-known/mcp.json` fixture; MCP docs page).
  - Liquidiction x402 premium endpoint `GET https://liquidiction.xyz/api/premium/analytics`: $0.001 per request, **Base Sepolia test USDC only** ("Base mainnet payments are not currently advertised as active") (H docs). I did not call it (robots.txt disallows `/api/`, and it is a payment endpoint); no 402 payload recorded. Not useful: it repackages Hyperliquid data.
  - Liquidiction cached public JSON, e.g. `/api/sports-entities` (teams/players, verified aliases, market counts) documented in https://liquidiction.xyz/llms.txt as public; **but** `https://liquidiction.xyz/robots.txt` says `Disallow: /api/` for all agents, so I did not fetch it (conflict recorded in open questions).
- **Local MCP (open source):** `Liquidiction/liquidiction-mcp`, TypeScript, MIT, 10 read-only tools (`list_markets`, `get_market_detail`, `get_market_summary`, `get_orderbook`, `get_prices`, `get_candles`, `get_recent_trades`, `get_user_fills`, `get_open_orders`, `get_user_positions`), talks to `api.hyperliquid.xyz` directly, "never submits trades" (H: I read `mcp-server.ts` and `outcomes.ts` via `gh api`; code only calls `POST /info`). The hosted version lists 8 tools (`get_markets` instead of `list_markets` / `get_market_detail`; no `get_user_positions`) (H: mcp.json). Useful as a reference for parsing `description` strings (`key:value|key:value`) and the `participantA/B`, `competition`, `scheduledStart`, `resolutionDeadline`, `officialSource`, `countedPlay` fields (H: `outcomes.ts`).

### Response shapes confirmed this session (unauthenticated GET only)

Hyperliquid `/info` is POST-only and POST is forbidden by this task's rules, so I did **not** capture `outcomeMeta`, `l2Book` or any REST shape (the sibling note captured WS shapes instead). Shapes below are the ones I could GET:

- `GET https://liquidiction.xyz/.well-known/mcp.json` -> `{name, version, description, url, transport:"streamable-http", authentication:{type:"none"}, readOnly:true, rateLimit:{requestsPerMinute:60, walletAndMarketDataCallsPerMinute:30, scope:"ip"}, jsonRpcBatch:false, capabilities:{tools,resources,prompts}, tools:[...8 names], localInstall, homepage}`. Fixture `liquidiction_well-known_mcp_2026-10-19.json`.
- `GET https://api.llama.fi/summary/dexs/liquidiction-outcome` -> `{id, name, ..., total24h:355113, total7d:569311, total30d:1095900, total1y:2058830.74, totalAllTime:2058830.74, totalDataChart:[[unixSec, usd]x169], methodology:{Volume,...}, doublecounted:true, linkedProtocols:[...]}`. Fixtures `defillama_dexs_liquidiction-outcome_2026-10-19.json`, `defillama_protocol_liquidiction-outcome_2026-10-19.json`. Methodology (H): "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code"; `doublecounted: true` confirms it is a subset of the Hyperliquid total.
- `GET .../builder_fills/{liquidiction_builder_lowercase}/20261016.csv.lz4` (8.8 KB, HTTP 200; `20261018` returned HTTP 403 AccessDenied, probably not yet published) -> after `lz4 -d`: CSV `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`; coins are `#<encoding>` (e.g. `#114461`), `side` Bid/Ask, `tif` empty/`Ioc`/`Alo`. Fixture `hl_builder_fills_liquidiction_20261016_first40_addresses_redacted.csv` (first 40 of 251 rows; wallet and counterparty addresses replaced by `addrN` pseudonyms because they belong to third parties). Quick stats (mine, M): 251 fills, 44 distinct coins, 8 distinct users, notional about $7.1k, 245 of 251 rows had `builder_fee` 0, total fee $0.083, data runs 00:00-12:07 UTC. The 2026-10-15 file: 255 rows, notional about $9.8k, fee $0.0095.

## 5. Trade path and PayBox reach

- **Programmatic trading: yes, but via Hyperliquid, not Liquidiction.** Liquidiction offers no order API (its MCP "never submits trades"). Orders are signed actions posted to `POST https://api.hyperliquid.xyz/exchange`: `type:"order"` with asset id `100_000_000 + encoding`, optional `builder:{b, f}`; outcome ops are `type:"userOutcome"` with `splitOutcome` / `mergeOutcome` / `mergeQuestion` / `negateOutcome` (H: exchange-endpoint docs). Order sizes are whole shares in observed books (sibling note).
- **Signing (H, read in the official Python SDK `hyperliquid/utils/signing.py`, last pushed 2026-06-04):** L1 actions (orders, cancels, outcome ops): msgpack hash -> "phantom agent" `{source:"a"|"b", connectionId:bytes32}` signed as EIP-712 with domain `{name:"Exchange", version:"1", chainId:1337, verifyingContract:0x000...0}`. User-signed actions (`approveAgent`, `approveBuilderFee`, `spotSend`, withdrawals): EIP-712 domain `HyperliquidSignTransaction`, `signatureChainId` e.g. `0x66eee` / `0xa4b1`. An approved API ("agent") wallet can sign orders for the master account (`approveAgent`; 1 unnamed + 3 named; expiry <= 180 days) (H: exchange docs). The official SDK has **no** outcome-specific helper (`grep outcome` in `exchange.py`: no hit), so a client must build the `userOutcome` / `#N` asset-id actions by hand (M: only that file was checked).
- **Builder code / partner route (H: Liquidiction API reference, "Builder Attribution for Partners"):** Liquidiction offers a zero-fee "exempt partner" setup: builder `0x0fdd59414989f52989973fef8995b7d10248cc18` (docs say "current as of 28 August 2026", may rotate), partner's **main wallet** signs `approveBuilderFee` with `maxFeeRate "0%"`, each order carries `builder:{b, f:0}`, and Liquidiction adds the partner wallet to a fee-waiver list. It only buys attribution (volume shows up under Liquidiction in DefiLlama); there is no rebate, API access or priority. **We do not need it.** An aggregator can trade Hyperliquid directly with no builder (or its own).
- **Reachable from a PayBox EVM wallet? Partial (M), same as the sibling note.**
  - Transaction proposals: no, for order flow. HyperCore actions are signed messages, not EVM transactions. PayBox's official `hyperliquid` plugin (id `hyperliquid`, **not enabled** for this account) only exposes three read-only tools: `hyperliquid_markets`, `hyperliquid_prices`, `hyperliquid_token`; the tool text says it "helps discover markets before a Hyperliquid trade tool exists" (H: `discover_plugins` query "hyperliquid" and `get_contract paybox://plugins/hyperliquid`, 2026-10-19). No trade tool.
  - Signed orders: `request_wallet_sign` accepts `op: "typedData"` (H: tool schema read, not called), so a PayBox-held EVM key could in principle sign the EIP-712 `Exchange`/`Agent` struct and the user-signed actions (M, untested; PayBox may restrict domains or require per-request approval, which cannot meet arbitrage latency). The `connectionId` (keccak of msgpack action + nonce + vault + expiry) must be computed by our plugin, and our plugin must POST to `/exchange`. Practical design: one `approveAgent` signed once through PayBox, then a locally-held agent key signs orders (cannot withdraw, M).
  - Funding: USDC on Arbitrum to the Hyperliquid bridge is an ordinary EVM transfer a PayBox wallet can propose (M; exact bridge call and minimum deposit not verified by me).
  - Geo is a separate gate (section 8).

## 6. Fees

Three layers; the first two are Hyperliquid's, the third is Liquidiction's.

1. **Hyperliquid outcome fee (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, "Outcome tokens"):** charged **only when closing or settling**, not when opening; no maker rebates (would-be rebate makers pay zero); only fee-paying volume counts. Six cases: mint = nobody pays; normal trade = one side pays; burn = both or only taker; settlement = on `settle_fraction * sz`. **No numeric rate is given in the official docs.**
2. **Deployer fee scale (H, deployer-actions page):** rate = base * (scale + max(scale, 1)), `scale` in [0, 10], set per market by the deployer (deployer receives the `scale` part). Liquidiction's docs say the base is "roughly 0.035%" (approximate, M, not an official constant) and that **no mainnet market currently publishes a scale** in the data Liquidiction can see (H as a claim on https://liquidiction.gitbook.io/liquidiction-docs/hip-4-prediction-markets/fees; so the rate for a given market cannot be derived from public data). DefiLlama says Hyperliquid charged no outcome fee of its own before 2026-08-15 (H: adapter methodology text in the `hyperliquid-outcomes` summary).
3. **Liquidiction builder fee - sources conflict:**
   - Gitbook fees page (undated): **0.10% (10 bp) on immediately executing taker orders, buys and sells** (`f: 100`), 0% on resting post-only limit orders; "Hypurr holders" waived (H as a doc claim).
   - `https://liquidiction.xyz/terms` (updated 2026-09-03): "We do not separately charge users transaction fees, commissions, custodial fees, or platform fees"; it "may receive a builder-tag fee paid by the Hyperliquid protocol" (H, read from the page HTML).
   - DefiLlama: Liquidiction builder fees were **$27.3 over 30 days** on $1.10M attributed volume (about 0.25 bp), $479 all time on $2.06M (0.023%) (H, fixture). The builder-fill sample shows 245 of 251 fills with `builder_fee` 0.
   - Reading: the 10 bp is either rarely charged (maker orders, waivers, `f:0` routing, Hyperliquid's "best effort" builder collection on outcomes) or no longer applied. **Treat Liquidiction's fee as unknown and irrelevant if we trade Hyperliquid directly.**
4. Other: Hyperliquid minimum order is $10 notional (legacy) and is documented as dropping to $1 on a network upgrade that was "live on testnet, not mainnet yet" when the page was written (undated, L); read `outcomeDeployerLimits` live. Builder fee cap 1% on spot (H: builder-codes page).

## 7. Resolution mechanism and dispute risk

Resolution is **Hyperliquid's and the deployer's, never Liquidiction's** (H: ToS).

- **Who settles (H, Liquidiction `/hip4` page; consistent with Hyperliquid's deployer-actions page):** protocol auto-settle (code reads a price observation at expiry), protocol validator vote (custom markets, written resolution clause), or template/permissionless markets where "each deployer is also the settlement authority for the markets they create" (the deployer or an authorised sub-deployer submits `settleOutcome`). "The documented deployer settlement flow does not include an escrowed challenge window." The only remedy is validator slashing of a deployer whose market is malformed against its template's `semanticRestriction` (H: deployer-actions page).
- **Concentration (H, stats page HTML, snapshot 2026-10-19 00:45 UTC):** "Of the 291 markets open right now, 286 are settled by a third-party deployer rather than by the protocol, and 14 markets are past their settlement moment with nothing signed yet." "On a deployer-settled market there is no dispute window: the deployer signs the final result and nobody can sign it in their place." Mainnet has 3 registered deployers and 28 approved templates (testnet: 98 and 68).
- **Finality:** settlement on HyperCore is atomic and irreversible (H: Liquidiction settlement page). That page still describes a `VoteGlobalAction` operator and oracle wallet design, which looks like the phase-1 protocol-market design and does not describe deployer settlement (L, stale; use the `/hip4` page instead).
- **Risk for the aggregator:** (a) late or missing deployer settlement ties up capital (14 overdue markets at snapshot); (b) the same real-world fixture can be listed with different participant order or different counting rules (the MCP README warns "Outcome and trade.xyz can list a fixture in opposite participant order", H); (c) resolution wording differs from Polymarket/Kalshi, so cross-venue matching must compare the template description, `officialSource` and `countedPlay`, never just the title.

## 8. Geo, ToS and automation

- **Hyperliquid Terms of Use (H, re-read this session from the static chunk `TermsOfUse-BA9TOAx9.js` of app.hyperliquid.xyz, "Last updated on June 15, 2026"):** 1.6 the Interface is not available to "Restricted Persons", including residents or entities in "the United States of America or Ontario, Canada" and sanctioned territories; 1.7 "outcome markets accessible via the Interface are not available to 'Excluded Persons'", i.e. persons in "certain jurisdictions that we designate from time to time" or where use "would require us or any third party to obtain any license"; 1.8 geo-blocking of the outcome-markets tab and a ban on circumvention; 3.1.8 bans bots or scripts that "exceed reasonable usage, bypass rate limits, cause denial-of-service conditions". Not a blanket bot ban; it governs the web Interface, and whether it binds direct API use is a legal question I did not resolve. The Excluded Persons list is not published, so it cannot be hard-coded.
- **Liquidiction Terms (H, https://liquidiction.xyz/terms, updated 2026-09-03):** eligibility is self-certified ("You will not use the Platform ... from a jurisdiction where that use is prohibited or restricted"); "Product availability can differ by location"; sanctions-screened wallets are blocked from wallet-backed actions (M, summary). Section 15 prohibited activities include "Abuse API endpoints or interfere with the Platform's operation" and "Use automated tools to scrape data beyond reasonable personal use". The ToS names no legal entity (M). No country list.
- The older gitbook ToS (2026-03-27, domain `liquidiction.com`, calls the app "open-source") is superseded (L). The app repo is **not public**: `gh api repos/Liquidiction/liquidiction` returns 404, and the org has one public repo (the MCP). The "open-source frontend" claim covers the MCP only (H).
- **Automation stance in practice:** Liquidiction publishes an MCP server, a Claude Code skill, an x402 endpoint and a partner builder program for agents, so machine reads are invited; `robots.txt` still disallows `/api/`. Our adapter should not need any Liquidiction endpoint: read Hyperliquid directly.

## 9. Liquidity (with dates)

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| HIP-4 volume, 24h / 7d / 30d / all time | $3,483,976 / $22,037,193 / $59,890,944 / $350,617,183 (executed buys before fees, both buyers counted; 189,555 / 1,110,371 / 2,034,650 / 6,052,368 trades; 1,935 / 3,561 / 6,195 / 21,938 unique traders) | https://liquidiction.xyz/hip4/stats, snapshot 2026-10-19 00:45 UTC | H |
| Same market, DefiLlama basis (halved: each trade counted once) | 24h (2026-10-17) $2.85M; 7d $14.77M; 30d $43.89M; all time $257.96M since 2026-05-02 | `GET https://api.llama.fi/summary/dexs/hyperliquid-outcomes` 2026-10-19 | H |
| **Liquidiction-attributed volume** (builder-code subset) | 24h (2026-10-17) $355,113; 7d $569,311; 30d $1,095,900; all time $2,058,831 | `GET https://api.llama.fi/summary/dexs/liquidiction-outcome` 2026-10-19 | H |
| Liquidiction share of HIP-4 volume (mine, DefiLlama basis) | 0.80% all time; month shares 0.55% (May), 0.20%, 0.08%, 0.21% (Aug), 1.97% (Sep), 2.95% (Oct to 17th); 2.5% over 30d; 12.5% on 2026-10-17 | computed from the two series above | M |
| Open interest | no platform total published; per market, e.g. $116,822 (2026/2027 Premier League winner) and $95,920-$97,583 (BTC above $81,697) | stats page, 2026-10-19 00:45 UTC | H |
| TVL | none (non-custodial, DefiLlama TVL series empty) | DefiLlama protocol JSON | H |
| Open markets | 291 (about 350 outcomes per the sibling note's `allMids` count) | stats page | H |

## 10. Category overlap (where arbitrage can exist)

- **Mix over the last 7 calendar days to 2026-10-18 22:59 UTC (H, https://liquidiction.xyz/data, snapshot 2026-10-18T23:25Z):** Sports 77.0% ($16.9M of $22M), Crypto 11.4% ($2.5M), Stocks & Commodities 8.5% ($1.9M), Economy 3.2% ($0.70M), Other 0.0%. **No volume** in Politics, Culture, Weather or Tech. By deployer: Outcome (`0x0c46...819e`) 91.6%, Hyperliquid Team (`0x0000...0001`) 5.7%, Trade.xyz 2.5%, Skew 0.1%; 4 active deployers.
- **Overlap with the target venues (M, by title; resolution wording unverified):**
  - Macro: "FOMC October 2026 rate decision" (top market, $693.5K buy volume in 7 days): overlaps Kalshi and Polymarket Fed-decision markets.
  - Crypto price: "BTC above $81,697" daily threshold markets (protocol auto-settle, 06:00 UTC): overlaps Polymarket / Kalshi / Limitless daily BTC ladders and Hyperliquid perps as a hedge.
  - Sports: NBA / NFL game winners (e.g. "NBA: NY v PHI", "NFL: SF v WSH", deployer-settled), and futures "2026/2027 Champions League winner", "2026/2027 Premier League winner", "2026 Ballon d'Or winner", "2027 NFL winner", "2026/2027 NBA winner": overlap Polymarket, Kalshi and SX Bet. Sports is the biggest category and the one with the most counterparties, but also the most resolution-wording risk.
  - Politics: effectively none.
- **Intra-Hyperliquid candidates:** the same fixture can be listed by more than one deployer (Outcome and Trade.xyz) as separate contracts with possibly opposite side order (H: MCP README). That is a spread between two Hyperliquid contracts, not a cross-venue leg; only valid if both resolve identically.

## 11. Does it share liquidity with another venue?

**Yes, completely.** Liquidiction routes every order into the same HyperCore books that Hyperliquid's own app and every other front end use; DefiLlama marks the row `doublecounted: true` and defines its volume as the builder-code subset of Hyperliquid's (H). It must **not** be modelled as an independent arbitrage leg or even as a separate book. Pool id for the registry: `hyperliquid-outcomes`; front-end label: `liquidiction`.

## 12. What to take from Liquidiction (if anything)

- Use the `hyperliquid-outcomes` adapter for all quotes and trades (sibling note section 13).
- Optional cross-checks: Liquidiction's stats / deployers pages for "markets past settlement with nothing signed" per deployer, a risk feature for the aggregator (HTML, no API; not worth scraping given the ToS scraping clause; compute the same from `outcomeMeta` + expiry instead).
- Optional: `find_sports_entities` / `/api/sports-entities` verified aliases could help team-name matching for sports linking; unverified and robots-disallowed, so defer.
- Do **not** depend on the hosted MCP (60 rpm, cached 15-30 s, third-party uptime).

## 13. Priority

**adapter_priority = skip** (for a standalone Liquidiction adapter). Reason: it is a front end with 0% independent liquidity, no order API, and every useful datum is available from Hyperliquid directly. Revisit only if Liquidiction ships a documented, robots-permitted JSON API with data Hyperliquid does not expose.

## 14. NOT FOUND and open questions

- NOT FOUND: a numeric official Hyperliquid outcome fee rate (searched: Hyperliquid fees page, HIP-4 page, deployer-actions page, info-endpoint page); a per-market deployer fee scale on mainnet (Liquidiction says none is published); Liquidiction legal entity, jurisdiction list or support/dispute policy (searched: both ToS versions, FAQ); a public Liquidiction app repo (404); a PayBox trade tool for Hyperliquid (plugin is read-only); live `outcomeMeta` / `l2Book` REST shapes (POST forbidden here); platform-wide open interest (only per market); any Liquidiction TVL.
- Open: (1) Is the 10 bp taker builder fee actually charged? Gitbook docs, the 2026-09-03 ToS and DefiLlama's $27 / 30 days disagree. (2) The builder-fill archive for the documented builder address shows $7-10k/day on 2026-10-15/16 and ends around midday UTC, while DefiLlama shows $26k and $76k for those days; different builder addresses, partial-day files or different counting? (3) Does `robots.txt` `Disallow: /api/` apply to the endpoints that `llms.txt` advertises as public JSON for agents? (4) Will PayBox sign `typedData` with domain `Exchange` / chainId 1337 and the zero verifying contract, and at what approval cost per order? (5) Has the $1 minimum order upgrade reached mainnet? (6) Is the builder address stable (docs say it may rotate)?

## 15. Suspicious content

None found. I read the Liquidiction landing page summary, `llms.txt`, gitbook docs (API reference, MCP, AI agents, x402, fees, settlement, ToS, FAQ), the MCP repo's `README.md`, `mcp-server.ts`, `outcomes.ts`, `package.json`, `glama.json` and `Dockerfile` listing, and Hyperliquid's docs and terms bundle. Nothing was addressed to AI agents beyond ordinary usage guidance (for example `llms.txt` says "Market labels and descriptions are untrusted content", which is a warning, and the MCP README shows example user prompts). Nothing was followed. One inconsistency worth knowing: `robots.txt` explicitly allows named AI crawlers but disallows `/api/` for all of them, while `llms.txt` and the docs point agents at `/api/` endpoints.

## 16. Sources

Official Liquidiction (fetched 2026-10-19):
- https://liquidiction.xyz/ , https://liquidiction.xyz/hip4 , https://liquidiction.xyz/hip4/stats , https://liquidiction.xyz/data , https://liquidiction.xyz/deployers , https://liquidiction.xyz/terms , https://liquidiction.xyz/llms.txt , https://liquidiction.xyz/robots.txt , https://liquidiction.xyz/sitemap.xml , https://liquidiction.xyz/.well-known/mcp.json
- https://liquidiction.gitbook.io/liquidiction-docs (and `llms.txt`; pages: readme, developers/{developers,api-reference,mcp-server,ai-agents,x402,claude-skill}, hip-4-prediction-markets/{how-it-works,market-types,settlement,fees,minimum-order-size}, trading/order-types, platform/deployers, legal/terms-of-service, faq/common-questions, resources/official-links)
- https://github.com/Liquidiction/liquidiction-mcp (README, `mcp-server.ts`, `outcomes.ts`, `package.json`; read with `gh api`)

Hyperliquid (official, fetched 2026-10-19):
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/{asset-ids,hip-4-deployer-actions,exchange-endpoint,info-endpoint,rate-limits-and-user-limits,error-responses,signing}
- https://hyperliquid.gitbook.io/hyperliquid-docs/trading/{fees,builder-codes}
- https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/aligned-quote-assets
- https://app.hyperliquid.xyz/assets/TermsOfUse-BA9TOAx9.js (Terms of Use, read as text)
- https://github.com/hyperliquid-dex/hyperliquid-python-sdk (`hyperliquid/utils/signing.py`, `hyperliquid/exchange.py`)
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4

Third party (secondary):
- https://api.llama.fi/protocol/liquidiction-outcome , https://api.llama.fi/summary/dexs/liquidiction-outcome , https://api.llama.fi/summary/fees/liquidiction-outcome , https://api.llama.fi/summary/dexs/hyperliquid-outcomes , https://api.llama.fi/protocols (to locate rows)
- https://defillama.com/protocol/liquidiction-outcome (HTTP 403 to my fetch)
- Web search (extended) for "Liquidiction Hyperliquid HIP-4 outcome markets": results were marketing/news pieces; the only claim I kept is that HIP-4 went live on mainnet on 2026-05-02 (M, consistent with DefiLlama's first datapoint). The session's WebSearch budget was then exhausted, so no further searches were run.

PayBox (read-only): `discover_plugins` query "hyperliquid"; `get_contract paybox://plugins/hyperliquid`; schema of `request_wallet_sign` (not called).

Sibling note: `docs/research/venues/hyperliquid-outcomes-hip-4.md` (parallel workflow, same date).

## 17. Privacy

No personal identifier was sent anywhere. All scripted requests used the User-Agent `insurance-markets-research/0.1`; no email, name, username or home path appeared in any URL, header, query or search string. Inline scripts were checked for "@" and the user's name before running (no hits), and the saved fixtures were grepped for "@" (no hits). Third-party wallet addresses in the builder-fill sample were replaced by `addrN` pseudonyms. The only addresses in this note are public protocol identifiers published in official docs (the Liquidiction builder address) or truncated deployer addresses from Liquidiction's public analytics.
