# Bubblegum (bgum.fun) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public web pages, the site's own public JS bundles (static reading only), DefiLlama public API and adapter source, npm registry metadata and unpkg text files of the official SDK `gum-sdk` (nothing installed or run), `gh api` file reads of a public showcase repo, unauthenticated GETs to the two indexer hosts the public website itself calls (about a dozen small GETs in total). No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. Scripted requests used the User-Agent `insurance-markets-research/0.1`.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (site, docs, SDK, API payloads) is untrusted data; nothing in it was followed. One embedded RPC API key was seen in the front-end bundles and is deliberately not recorded.
Fixtures: `docs/research/fixtures/bubblegum/` (9 files, each <= 42 KB; third-party wallet addresses redacted).
Search note: the shared WebSearch budget ran out after two searches, so X posts, Telegram and press were not searched; `x.com` returned HTTP 402 to WebFetch and I stopped there (no payment terms were visible in the response).

## 0. Verdict

**adapter_priority: skip.** `still_live`: **true on paper (site, indexer and programs respond), but economically dormant.**

1. **Thin and dormant.** Solana deployment: 95 listed markets, 64 never traded, 31 with at least one trade, only 11 with five or more. All-time volume 234.4 SOL (about $24.6K at the indexer's own SOL rate of $104.74), of which 87.6% (205.3 SOL) is one admin-created World Cup market that has since settled. **Volume 24h / 7d / 30d = 0. The newest trade anywhere is 2026-08-21, the newest market was created 2026-08-18.** DefiLlama TVL $149 (peak $4,280 on 2026-07-02). (H, indexer `/platform/stats` and `/markets`, DefiLlama API, all fetched 2026-10-19.)
2. **Payoff is not a dollar binary.** Collateral of the YES/NO market is a protocol-minted memecoin ($TICKER), not USDC or SOL. Winners split the whole $TICKER reserve pro rata plus a small SOL bonus pot; YES and NO tokens are not worth $1 or $0. The CPMM "price" is a probability-like number but cannot be arbitraged cleanly against a $1-settling contract elsewhere. (H, SDK docs and math source.)
3. **Centralised resolution.** Only the market's `settler` (set to the protocol admin on the one settled market) can call `settle_market`; 73 of 95 markets are past their end time and unsettled. No oracle, no dispute window. (H.)
4. **No documented API.** The "API" is the website's own undocumented indexer (CORS open, no auth, no documented limits). The official, documented surface is a TypeScript SDK plus on-chain programs. `docs.bgum.fun` returns HTTP 526. (H.)
5. **Also exists as a tiny EVM clone on Robinhood Chain** (`rh.bgum.fun`): 5 markets, 0.41 ETH all-time volume, last trade 2026-07-31. Reachable by PayBox in principle (chain 4663) but not worth an adapter. (H.)
6. Revisit only if the stats show non-zero 7d volume again AND someone lists real-event markets with settlement (section 12).

## 1. Is it live (2026)?

| Evidence | Value | Tag |
|---|---|---|
| Homepage `https://www.bgum.fun/` | HTTP 200, title "bubblegum - coins with meaning", description "Launch a prediction market in one click. Bonding curves meet YES/NO markets. Every question gets a coin. On Solana."; nav shows "mainnet" | H |
| Indexer `/platform/stats` | `updatedAt` 2026-10-19T01:50:10Z (the stats job runs), `volumeSol24h/7d/30d` all "0", `trades24h` 0, `totalTrades` 275, `totalMarkets` 96 | H |
| Newest trade / newest market | lastTradeAt max 2026-08-21T18:05:03Z; createdAt max 2026-08-18T22:48:31Z; markets created per month: Jun 58, Jul 23, Aug 14, Sep 0, Oct 0 (fixture `sol_markets_all_summary_derived_...json`) | H (derived from 95 rows) |
| DefiLlama | protocol id 8055, category "Prediction Market", chain Solana, `listedAt` 1782186637 = 2026-06-23T03:50:37Z, twitter `gumdotfun`, TVL $149.16 on 2026-10-19 (daily series from 2026-06-23, peak $4,280 on 2026-07-02). No dexs/fees dimension page exists for it (HTTP 400 "not found"). | H |
| npm `gum-sdk` | 0.1.0 published 2026-07-25, 0.2.0 on 2026-08-17; nothing since | H |
| Founders' public showcase repo (hackathon) | last push 2026-05-11, says "near-mainnet", devnet only at that date | H |
| `docs.bgum.fun` | HTTP 526 (origin TLS error) on 2026-10-19 | H |
| Robinhood-chain site `rh.bgum.fun` | landing page "LIVE ON ROBINHOOD CHAIN", app at `/app`, indexer stats updated 2026-10-19 | H |
| X account `@gumdotfun`, Telegram, Discord | not read (x.com HTTP 402; no search budget) | NOT FOUND |

Conclusion: infrastructure is up, nobody is trading. Treat as live-but-dead for scanner purposes.

## 2. Kind and market model

- Kind: **on-chain launchpad + AMM**, "pump.fun for prediction markets". One transaction creates a Token-2022 `$TICKER` mint on a constant-product bonding curve and a binary YES/NO market whose collateral is `$TICKER`. (H: `https://www.bgum.fun/how-it-works`, `gum-sdk` DOCS.md.)
- **Binary only** (YES/NO). Question text up to 128 chars, ticker up to 10, duration at most 90 days on the CPMM program (SDK constant `MARKET_MAX_DURATION_SECONDS`), though the indexer lists end times as far as 2035 and year 3025, so the cap is evidently not enforced the way the SDK says or the data predates it (M; open question 3).
- **Two price axes** (H): (a) `$TICKER`/SOL on a bonding curve `V_SOL * V_TOK = k` (initial virtual 30 SOL / 700M tokens; 500M tokens sellable; 300M seeded into the CPMM; 200M reserved for the Meteora pool); (b) YES/NO prices from a virtual-liquidity CPMM.
- **YES/NO pricing** (H, SDK `cpmm.ts`, and checked numerically against the indexer): `V_YES = R - yesSupply`, `V_NO = R - noSupply`, `yesPrice = V_NO / (V_YES + V_NO)`, `noPrice = 1 - yesPrice`. On the settled World Cup market: R=620,910,146,669,008, yes=497,674,950,342,216, no=532,125,340,649,774 gives 0.41876, which equals the indexer's `yesPrice` 0.418757. Markets open at exactly 0.50/0.50.
- **Lifecycle** (H): Active -> GraduationPending -> Graduated (curve freezes at a per-market SOL threshold, 75 SOL on mainnet, liquidity moves to a Meteora DAMM v2 pool) -> Settled; or Active -> `refund_expired` if the deadline passes before graduation (permissionless).
- **Trading rules by stage** (H, SDK DOCS.md section 4): pre-graduation you buy YES/NO with **SOL**, routed SOL -> $TICKER (curve) -> YES/NO (CPMM) in one tx; direct CPMM trading is blocked until graduation. Post-graduation you pay **$TICKER** (bought on the Meteora pool) to mint YES/NO, and YES<->NO swaps cost 0%.
- **Tokenisation**: Token-2022 mints per market: `tickerMint`, `yesMint`, `noMint` (all in the indexer rows). EVM clone: separate ERC-20-style `ticker`, `yesToken`, `noToken` addresses per market.
- **Payout rule** (H, DOCS.md section 5.7 and FAQ): after settlement, winning-side holders get a pro-rata share of the entire `$TICKER` reserve plus a pro-rata share of a SOL bonus pot (funded by post-graduation Meteora fees). Losing tokens pay nothing. Consequence: payout per winning token is `reserve / winningSupply` in $TICKER (about 1.17 to 1.25 $TICKER per token on the one settled market, M), whose SOL and USD value floats with the $TICKER pool. After settlement the indexer still shows the pre-settlement `yesPrice`; a scanner must use `settled` and `winningSide` instead (H, WORLDCUP row: `settled: true`, `yesPrice: 0.4188`).

## 3. Chains and collateral

| Deployment | Chain | Collateral / payment | Programs / contracts | Tag |
|---|---|---|---|---|
| Main | Solana mainnet-beta | SOL in (pre-graduation); `$TICKER` as YES/NO collateral; SOL bonus pot | curve `71ywu6cFWETLyiz1KcuMwq2wfguYfra7b1bCPinVqKm3`, cpmm `Dyw8vChGKLMWkkuHZBKS8EdLj489dcVxgHyUWBuCVp3Y` (2026-06-13 redeploy; the older `6eLrwpk...` deploy is abandoned per DefiLlama adapter comments) | H (SDK README, IDL `address`, DefiLlama adapter) |
| Clone | Robinhood Chain (EVM, chainId 4663 per the PayBox catalog and this repo's earlier notes) | ETH in; `$TICKER` per market; graduates to Uniswap v4 per site meta | one factory/controller `0x692BA9113A771D3F89E0b714D30665078bDb92Ca` (deploy block 12327048), indexer `hoodgum-production-797b.up.railway.app` | H (site bundle), M (chain id from other notes; Blockscout is behind a Cloudflare challenge, so contract activity was not verified on-chain) |
| Devnet | Solana devnet | test | `En6VRZMM...` / `7g1LRg6N...` | H |

No USDC anywhere. External programs: Meteora DAMM v2 `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`, Token-2022. Mainnet is `permissioned` at config level in the SDK notes (only the admin may create markets on mainnet, devnet is open), yet the indexer shows user-created markets with `payer` set, so the flag may have been turned off (open question 4).

## 4. Read API

**Official/documented: none.** There is no API documentation (`/docs`, `/api`, `/llms.txt`, `/sitemap.xml` all 404; `docs.bgum.fun` 526). What exists:

1. **The site's own indexer (undocumented, public, unauthenticated)** - Solana: `https://bgum-mainnet-indexer-production.up.railway.app` (Fastify per the founders' README; response header `server: railway-hikari`, `access-control-allow-origin: *`, `cache-control: no-store`). Endpoints found in the bundle and confirmed with GET (H):
   - `GET /platform/stats` -> single object (totals, TVL in lamports, volume 24h/7d/30d, `solUsdRate`). Fixture `sol_platform_stats_2026-10-19.json`.
   - `GET /markets?limit=&offset=&sort=&status=` -> `{markets:[...], count}`. 59 fields per row incl. `conditionId` (64 hex), `question`, `ticker`, `tickerMint`, `yesMint`, `noMint`, `cpmmMarket`, `endTime`, `curveStatus`, `settled`, `winningSide`, `reserve`, `yesSupply`, `noSupply`, `yesPrice`/`noPrice` (decimal strings), `tickerPriceSol`, `volumeSol{1h,24h,7d,Total}`, `tradeCount`, `lastTradeAt`, Meteora pool fields. `limit=100` returned all 95 rows (188 KB). Fixture `sol_markets_sample_2026-10-19.json`; derived roll-up in `sol_markets_all_summary_derived_...json`.
   - `GET /markets/{conditionId}` -> one market (confirmed). `GET /markets/{conditionId}/trades?limit=&offset=` -> `{trades:[...]}` with `eventType` (e.g. `redeem`), `programSource`, `txSignature`, `slot`, `blockTime`, amounts in base units, fees, post-trade state fields. Fixture `sol_market_trades_sample_2026-10-19.json`.
   - `GET /platform/trending?limit=` and `GET /profile/{wallet}` exist in the bundle; not called. `GET /trades` (global) is 404.
   - **WebSocket** `wss://bgum-mainnet-indexer-production.up.railway.app/ws`; client sends `{"type":"subscribe","channels":[...]}` and receives `{channel, ...}`; channel names seen: `market:{conditionId}`, `market:{conditionId}:price`, `trending`. Not connected (no WS client used). (H for bundle code, untested.)
   - Auth/limits: none enforced on GETs that I saw; no rate-limit headers; CORS allows `X-Wallet`, `X-Wallet-Ts`, `X-Wallet-Sig` headers, so write endpoints (profiles, uploads) use a wallet-signature header scheme (M; not exercised). Stability: undocumented, can change without notice; hosted on a Railway project URL.
2. **Robinhood-chain indexer (undocumented)**: `https://hoodgum-production-797b.up.railway.app` with `/stats`, `/markets?limit=&sort=created`, `/markets/{id}`, `/markets/states?ids=`, `/markets/{id}/trades`, `/trades`, `/markets/{id}/holders`, `/users/{addr}/profile` (bundle). `/stats` and `/markets` confirmed by GET. Fixtures `rh_stats_2026-10-19.json`, `rh_markets_sample_2026-10-19.json`.
3. **On-chain** (the authoritative path): Anchor accounts `BondingCurve`, `Market`, `CurveGlobalConfig`, `GlobalConfig` decoded with the bundled IDLs; events in the IDL (`BuyDecisionExecuted`, `MarketGraduated`, `MarketSettled`, ...). Needs Solana JSON-RPC (POST) and a paid RPC for `getProgramAccounts` (the SDK README says public RPC rate-limits). Not exercised here.
4. **Official SDK**: npm `gum-sdk` 0.2.0, MIT, TypeScript, wraps both programs, includes pure quote math (`gum-sdk/math`) and PDA derivation (`gum-sdk/pdas`); README + DOCS.md are the closest thing to docs. Repo URL `github.com/proxima424/gum-sdk` returns 404 via `gh api` (private). Fixture `gum_sdk_npm_summary_2026-10-19.json`, `solana_idl_instructions_2026-10-19.json`.
5. **DefiLlama**: TVL only (native SOL in pre-graduation curves), adapter at `DefiLlama-Adapters/projects/bubblegum/index.js`. No volume/fees series.

Data quirks seen (H): `settlerAddress` on the settled market equals that market's `noMint` (indexer bug, ignore it; use `settler`); `winningSide` is 0 on unsettled rows (use `settled`); prices are strings; amounts are base units (SOL 1e9, tokens 1e6; ETH 1e18 on the clone); the clone's `imageUri` is an inline base64 image (a 5-market list is 86 KB).

## 5. Trade path and PayBox reachability

- **No order API.** Trading is Solana program instructions (Anchor): `buy_decision`, `sell_decision` (curve, SOL), `mint_decision_tokens`, `burn_decision_tokens`, `swap_decision` (cpmm, post-graduation, $TICKER), `claim_winner_bonus`, `redeem_position`, `refund_expired`. The SDK builders return unsigned instructions ("the SDK never signs or sends"); the high-level `Bubblegum.connect({rpc, privateKey})` signs locally. Slippage is passed as `minOut`, with a `deadline` argument. (H, README/DOCS.)
- **Admin-gated actions**: `settle_market` (settler = cpmm admin), `graduate` (graduator key), `finalize_market_bonus`, `sweep_*`. A regular wallet cannot resolve a market. (H.)
- **EVM clone**: factory functions `buy(bytes32,uint8,uint256) payable`, `sell`, `mintDecision`, `burnDecision`, `previewBuy`, `redeem(bytes32)`, `expire`, `graduate`, `settle(bytes32,uint8)`; plain EVM transactions. (H, ABI embedded in the app bundle.)
- **PayBox reachability: partial.**
  - Solana: PayBox accepts a `solana` transaction proposal (`transactionBase64`, <= 1,232 bytes, legacy or v0, one signer who is fee payer, no durable nonce) and has `request_wallet_sign` with `solanaTransaction` (signature only). A `buy_decision` tx with Token-2022 ATA creation has many accounts; whether it fits in 1,232 bytes without a lookup table is untested (M). A plugin also needs a Solana RPC to fetch a blockhash and account state, which depends on the plugin's configured network access (earlier notes: 06-paybox-platform.md).
  - EVM: an `evm` proposal with `value` (decimal wei) and ABI-encoded `buy(...)` to the factory on `eip155:4663` is expressible; Robinhood (4663) is in PayBox's live chain catalog (earlier notes, 2026-10-19). Not tested, and the clone has near-zero liquidity.
  - Base, Ethereum, BNB, Arbitrum and Polygon wallets cannot touch either deployment.
  - I did not call any PayBox tool in this run.

## 6. Fees

| Item | Value | Who pays | Tag |
|---|---|---|---|
| Curve fee | `curve_fee_bps` default 100 (1%), per-market snapshot, max 2000 bps; `applyFeeBps` peels the fee off the SOL input (buy) or output (sell), net rounded down | trader | H (SDK constants, math) |
| Creator share | `creator_fee_bps` default 50 (0.5%), carved out of the 1%; docs: 0.5% creator / 0.5% protocol | split from the same fee | H (PNP docs also state this; SDK constants) |
| CPMM fee | `protocol_fee_bps` taken from the collateral leg on mint/burn; creator slice is carved out of it, not added; value lives in `GlobalConfig` (not read). The EVM clone reports `cpmmFeeBps` 100 and `cpmmCreatorFeeBps` 50 | trader | H (clone), M (Solana value) |
| YES<->NO swap | 0% | - | H (DOCS.md 5.5) |
| Post-graduation | Meteora DAMM v2 pool fees; these fund the SOL bonus pot for winners | LPs / traders on the pool | H (DOCS FAQ) |
| Redemption | no fee stated | - | NOT FOUND (searched DOCS.md, README, math sources) |
| Gas | Solana tx fee + priority fee + ATA/Token-2022 rent | trader | M |

Effective round trip is therefore about 2% on the curve plus CPMM fees plus the curve's own price impact (a 30 SOL virtual start, so the first 1 SOL moves the curve price about 7%): far above the 0-2% on Polymarket or Kalshi. `feesSolAccumulated` on the settled market was 1.908 SOL on 205 SOL volume.

## 7. Resolution mechanism and dispute risk

- **Resolver**: the market's `settler` pubkey, set at creation (WORLDCUP row: settler equals the protocol admin that also created it). `settle_market(winningSide)` is gated to it; the SDK says "the protocol (cpmm admin / oracle) via `settle_market`. Users can't settle their own markets." No oracle integration, no evidence source, no dispute or challenge window, no bond. (H, DOCS.md section 5.6 and FAQ, IDL `Market.settler`.)
- **Track record**: 1 of 95 markets settled ever; 73 are past `endTime` and unsettled (they can only `refund_expired` if never graduated). A World Cup market ended 2026-07-20 and was settled 2026-07-22. (H, indexer rows.)
- **Question quality**: free text, creator-written, no rule template; `moderationStatus` field exists (all "approved"). Examples: "Do you agree that this will be Bubblegum's official token for the next 1,000 years?", "Will toly endorse Bubblegum?". Resolution rules for each market are not published beyond the question string. (H.)
- Admin keys are single-step transferable (`transfer_admin`), the programs can be paused (`set_paused`), and fee levels and the graduation threshold are admin-updatable. No audit: "a full audit pass is planned before mainnet" (founders' README, 2026-05); DefiLlama lists audits "0". (H.)
- Dispute risk: high. Treat any Bubblegum price as unresolvable-by-rule.

## 8. Geo, ToS and automation

- No terms of service, privacy page or geo notice found (`/terms` 404; the bundle strings I searched had none). No jurisdiction block seen in the HTML. NOT FOUND (searched: `/terms`, `/docs`, home, how-it-works, JS strings).
- `robots.txt` (Cloudflare managed) sets `Content-Signal: search=yes,ai-train=no,use=reference`, `Allow: /` for `*`, and disallows AI-training crawlers including ClaudeBot. This research reads pages for reference only. (H.)
- Automation is not prohibited anywhere I could read, and the SDK explicitly supports private-key bots. The indexer allows any origin. That is not a licence: the API is undocumented. The showcase repo is "All rights reserved"; the npm SDK is MIT. (H.)
- Regulatory posture is unknown: it is a permissionless launchpad for arbitrary-question markets with a memecoin per market, and US/other restrictions are NOT FOUND.

## 9. Liquidity (all fetched 2026-10-19 unless noted)

| Metric | Value | Source | Tag |
|---|---|---|---|
| All-time volume (Solana) | 234,426,045,462 lamports = 234.43 SOL (about $24.6K at $104.74/SOL) | indexer `/platform/stats` | H |
| 24h / 7d / 30d volume | 0 / 0 / 0 | same | H |
| Trades / users | 275 trades, 106 unique users | same | H |
| Markets | 96 total per stats (95 listed): 93 active, 3 graduated, 1 settled | same | H |
| Concentration | WORLDCUP 205.28 SOL (87.6%), next TRUMPTERM 7.10 SOL, BGTEST1 4.41 SOL, FRANCE 3.94 SOL | `/markets` | H |
| TVL | 3.275 SOL (indexer `tvlSol`, about $343); DefiLlama $149.16 (pre-graduation curve SOL only); peak DefiLlama $4,280 on 2026-07-02 | indexer; DefiLlama API | H |
| Robinhood clone | 5 markets, 5 trades, 3 traders, 0.4126 ETH all-time (about $999 at $2,420.87), 24h 0, TVL 0.0042 ETH; last trade 2026-07-31 | `hoodgum.../stats`, `/markets` | H |
| Markets with trades and future end date | 10 (e.g. TRUMPTERM 7.1 SOL / 5 trades, FREEDOM 2.0 SOL / 4 trades), all last traded 2026-07-19 to 2026-08-21 | `/markets` | H |

There is no order book and no standing two-sided quote: the "price" is a CPMM state with at most a few trades behind it.

## 10. Event categories and overlap

Markets are user-created novelties. Rough mix of the 95 (keyword count over titles, M): 52 football World Cup 2026 questions (one per nation plus the admin's WORLDCUP market; only 12 ever traded, 10 of them for under 0.5 SOL; the tournament ended 2026-07-19), 29 other, 12 crypto/price/stock, 2 US politics. Examples: US politics ("Will Trump win the midterms?", end 2026-11-16), crypto/price ("Bitcoin above $150k in 2026" test market, "Solana surpass Ethereum in market cap by 2030", "SpaceX stock above $500 by 2035"), celebrity/social ("Will toly endorse Bubblegum?", "...hit 50k followers"), and a self-referential token poll. Overlap with other venues exists on paper for World Cup, midterms and BTC price, but each Bubblegum market is a differently worded question with no resolution rule, almost no liquidity and a $TICKER-denominated payoff. There is no tradable arbitrage; at most a weak "sentiment" signal, and with 0 volume for 60 days not even that.

## 11. Shared liquidity

- Not shared with another prediction venue: its own curve + CPMM. Post-graduation `$TICKER/SOL` liquidity sits in a Meteora DAMM v2 pool (a DEX leg, not a prediction venue).
- **Related to PNP Exchange**: the same developer identity authored `pnp-sdk-v2` (PNP) and `gum-sdk`/the showcase repo (Bubblegum), and PNP's docs have a page `models/bubblegum` describing the same 1% fee split and curve-to-AMM design (see `docs/research/venues/pnp-exchange-predict-and-pump.md`). Same builder, separate liquidity. (H for the shared GitHub owner and the PNP docs page, M for any corporate relationship.)

## 12. Adapter notes (only if revisited)

- Revisit triggers: `/platform/stats.volumeSol7d` above, say, 50 SOL for two consecutive weeks; a published resolver/oracle; a USDC-denominated market.
- If built: poll `/markets?limit=100` (single call returns everything today), compute implied probability from `reserve`/`yesSupply`/`noSupply` or use `yesPrice`, skip rows with `curveStatus != "Active"|"Graduated"` or `settled`, never emit a "resolved at 1.0" without checking `settled` and `winningSide` (0 appears to mean Yes, the IDL enum is Yes then No, M), convert lamports with 1e9 and token units with 1e6, liquidity depth = CPMM virtual reserves not an order book.
- Execution cost model must include the $TICKER leg: payout in $TICKER, exit via the Meteora pool after graduation.

## 13. Open questions and NOT FOUND

1. NOT FOUND (searched: site, SDK docs, README, bundle): any official API documentation, rate limits, SLA, or terms of service.
2. NOT FOUND: Solana on-chain activity, program upgrade authority and live `GlobalConfig` values (fees, `permissioned`, `paused`); all need JSON-RPC POST or an explorer GET (the Robinhood Blockscout API returned a Cloudflare challenge; Solana explorers were not retried, an earlier note in this repo found Solscan 403). The indexer is the only activity evidence (could lag or be wrong).
3. Why do markets exist with end times in 2035 and 3025 when the SDK constant caps duration at 90 days? Possibly an older/different program build or an admin path (M).
4. Mainnet `permissioned` status: SDK says true, indexer shows user-created markets. Unresolved.
5. How `settle` chooses the winning side for the `winningSide` byte (0/1 encoding) is inferred from the IDL enum, not documented.
6. Whether the Robinhood deployment sits on chainId 4663 is taken from other notes in this repo; I did not read the chain id from the bundle.
7. `@gumdotfun` posts, Telegram and any sale or announcement of a token: not read.

## 14. Suspicious content

- None addressed to AI agents found. Note for hygiene: the front-end bundles embed third-party RPC API keys (Solana and Robinhood Alchemy/Helius URLs), which I did not copy or use. The `robots.txt` Cloudflare block is a standard crawler policy, not an instruction to this run. The npm package metadata lists a maintainer contact address, deliberately not recorded here.

## 15. Sources

Primary (H):
- Site: https://www.bgum.fun/ , https://www.bgum.fun/how-it-works , https://www.bgum.fun/worldcup (meta only), https://www.bgum.fun/robots.txt , https://www.bgum.fun/_next/static/chunks/ (public JS, files `05q5~do9z0sqf.js`, `12bkngauujn7b.js` for API client and WebSocket)
- Robinhood-chain site: https://rh.bgum.fun/ , https://rh.bgum.fun/app (public JS chunks `layout-aac4252e95e617aa.js`, `1465-135e5fbad015aa0e.js`)
- Solana indexer (undocumented, used by the site): https://bgum-mainnet-indexer-production.up.railway.app/platform/stats , `/markets?limit=3` , `/markets?limit=100` , `/markets/{conditionId}` , `/markets/{conditionId}/trades?limit=3`
- Robinhood indexer (undocumented): https://hoodgum-production-797b.up.railway.app/stats , `/markets?limit=100&sort=created`
- Official SDK on npm: https://registry.npmjs.org/gum-sdk ; text files via https://unpkg.com/gum-sdk@0.2.0/ : `DOCS.md`, `README.md`, `src/math/{constants,curve,cpmm,composite}.ts`, `src/config.ts`, `src/idl/mainnet/bubblegum_{curve,cpmm}.json`
- DefiLlama: https://api.llama.fi/protocols , https://api.llama.fi/protocol/bubblegum , adapter `https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/bubblegum/index.js` (read with `gh api`); page https://defillama.com/protocol/bubblegum returned HTTP 403 to WebFetch
- Founders' showcase repo (read with `gh api`): `proxima424/bubblegum-hackathon` README.md and docs/architecture.md, last push 2026-05-11 (staleness: more than 5 months old; used only for architecture and team context)
- PNP docs page (via WebFetch): https://docs.pnp.exchange/models/bubblegum
Blocked / not read: https://x.com/gumdotfun (HTTP 402), https://robinhoodchain.blockscout.com API (Cloudflare challenge 403), https://docs.bgum.fun (HTTP 526), `gum-sdk` GitHub repo (404, private).
Secondary (M): CoinGecko-like or press coverage: none read. One extended WebSearch surfaced the homepage only.

## 16. Fixtures saved (`docs/research/fixtures/bubblegum/`)

`sol_platform_stats_2026-10-19.json`, `sol_markets_sample_2026-10-19.json`, `sol_market_trades_sample_2026-10-19.json`, `sol_markets_all_summary_derived_2026-10-19.json` (derived, 42 KB), `rh_stats_2026-10-19.json`, `rh_markets_sample_2026-10-19.json`, `defillama_bubblegum_summary_2026-10-19.json`, `gum_sdk_npm_summary_2026-10-19.json`, `solana_idl_instructions_2026-10-19.json`.
