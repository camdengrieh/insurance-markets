# Mentioned Market (mentioned.market) venue spec

Researched 2026-10-19. Read-only: public unauthenticated GETs and `gh api` file reads only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Summary

- Verdict: LIVE (H). Solana "mention market" venue: trade on whether specific words are said during live events (sports broadcasts, earnings calls, political rallies, esports). Real-money markets in USDC on Solana; free play-token markets also exist.
- Product tagline "Trade on what gets said" (H, https://mentioned.market). Android app for Solana Seeker submitted to the Solana dApp Store on Oct 4 2026 (H, mobile repo README).
- Very thin: sum of lifetime volume across the 17 paid YES/NO markets currently listed is about $1.66k USDC; 8 are open now (H, computed from the public API on 2026-10-19; see Liquidity).
- Public JSON read API exists on the website host but is NOT documented as a public API (it is the backend of their own web/mobile app). No official trade API: trades are Solana program instructions built client-side, with a website RPC proxy and an "integrity attestation" gate.
- Adapter priority: P2 (signal-only / thin). Interesting only as a niche price source for mention markets that overlap Kalshi (and possibly Polymarket) mention markets.

## Kind and market model

- Two real-money market types (H, mobile README "On Solana" and API):
  1. Paid YES/NO "mention" market: one event has ~5 words; each word is its own binary YES/NO market. Priced by an LMSR automated market maker (program `mention-market-usdc-amm`: buy, sell, redeem). Prices are decimals 0..1; yes+no about 1. (H: `/api/paid-markets/list` has `yesPrice`/`noPrice` per word; docs say winning share = $1 minus rake.)
  2. Paid "majority" market (`mention-majority-market`): pari-mutuel pool, "most said wins"; pool paid to top word or top three. Picks are final, no selling, odds = a word's share of the pool (H, docs overview/prices + API `poolUsdc`, `payoutWeights`).
- Outcome tokenisation: positions are program account state (yes/no shares per word in a position account), not fungible SPL tokens as far as the client code shows (M: client code reads "market, position and pool accounts" and decodes them on device; no outcome mint seen). Not tradable on other venues.
- Free markets: play tokens, off-chain, points only (H, docs). Ignore for arbitrage.
- Market account is raw base64 returned by `/api/paid-markets/market/{id}` and decoded client-side using `deserializeMarketAccount` (H, src/api/paidMarkets.ts); the decoder in `src/chain/amm.ts` exposes `liquidityParamB`, `tradeFeeBps`, `protocolFeeBps`, `redeemRakeBps`, per-word `yes`/`no` quantities (H).
- Pricing formula: LMSR, `cost = m + b*ln(e^((qYes-m)/b)+e^((qNo-m)/b))` with fixed-point log-sum-exp, upgraded Sept 2026 (H, src/chain/amm.ts and ENGINEERING.md). Docs pages do not state the formula or `b` (NOT FOUND in docs.mentioned.market/markets/prices/).
- A word can be frozen for trading while a possible mention is being checked (H, docs resolution page).

## Chains and collateral

- Solana mainnet only for real money (H, `/api/mobile/config` returns `"cluster":"mainnet"`). Devnet/staging flavours exist for testing.
- Collateral: native USDC, mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (H, src/config.ts in mentioned-mobile). SOL needed for network fees (H).
- Programs (H, README + src/config.ts):
  - YES/NO AMM: `7pL3oze39xX7NmGFtndTz3EjhkCP9AcoVtX6fVmxm9pn`
  - Majority: `F1AVzZe4oX2cNDTvJjNFGWyYz4uxXxMwEqvTnamA2j9r`
- Funds sit in on-chain market vaults, not a company account (H, docs trust/security). Audit status and upgrade authority: NOT FOUND in docs (docs say only "tested, but any smart contract can contain bugs"). The AMM program was upgraded in Sept 2026 (slot 449979571 per ENGINEERING.md, H), so it is upgradeable in practice. I did not query the chain for upgrade authority (would need a JSON-RPC POST).

## Read API

- Status: unofficial-only in the sense that no public developer API doc exists (searched docs.mentioned.market sitemap: 21 pages, none about API; FAQ and terms do not cover API). The endpoints below are the production backend of the first-party app, called with no auth and no key (H, curl 2026-10-19). Treat as unstable: the mobile repo has a daily "contract" CI job because the shapes change (H, README CI section).
- Base URL: `https://www.mentioned.market` (apex 301s to www) (H, src/config.ts).
- Docs URL: none for the API. Product docs: https://docs.mentioned.market (Docusaurus).
- Key endpoints (all GET, JSON, unauthenticated; H: field lists from src/api/*.ts zod schemas plus live responses):
  - `/api/paid-markets/list` -> `{markets:[{marketId, title, status, slug, category, wordCount, words:[{label,yesPrice,noPrice,outcome}], locksAt (unix s string), eventStartTime, traderCount, isFeatured, feeBps, rakeBps}]}`. Includes open (status 0) and resolved (status 2) markets. Status code meanings are not documented; observed 0 = open, 2 = resolved with `outcome` populated (M).
  - `/api/paid-markets/market/{marketId}` -> `{account (base64 raw program account), vaultAmount (micro-USDC string)}`.
  - `/api/paid-markets/metadata?id=` -> title, full rules text in `description`, `event_start_time`, `category`, `cluster`.
  - `/api/paid-markets/chart?id=` -> `{words:[{wordIndex, history:[{t,p}]}], totalVolume}`.
  - `/api/paid-markets/trades?id=` -> `{trades:[{signature, wordIndex, direction, isBuy, quantity, cost, impliedPrice, trader, username, blockTime}]}` (cost/quantity in micro units; includes trader wallet and username).
  - `/api/paid-majority/list`, `/api/paid-majority/market/{id}`, `/api/paid-majority/metadata` -> pool markets (`poolUsdc`, `payoutWeights`, `words[{word,wordHash,oddsPct,outcome,units}]`).
  - `/api/trades/recent` -> cross-market recent trade feed (paid and free).
  - `/api/mobile/config` -> feature flags and cluster.
  - Wallet-scoped GETs exist (`/api/paid-markets/user-positions?wallet=`, etc.) per client code; not called.
- Auth: none for the endpoints above (H). Rate limits: NOT FOUND (no documentation, no rate-limit headers seen; response was served via Cloudflare/Railway). Websocket: none documented; the mobile README says chat is "live over the website's event stream" (SSE-style), exact path NOT FOUND. Poll the list endpoint instead.
- Fixtures saved (trimmed, <=50KB each) in `docs/research/fixtures/mentioned-market/`: `paid-markets-list.sample.json`, `paid-markets-trades.sample.json`, `paid-markets-chart.sample.json`, `paid-markets-market-account.sample.json`, `paid-majority-list.sample.json`, `mobile-config.json`. The trades sample contains third-party public wallet addresses/usernames; strip them before any commit if undesired.
- Price caveat: list prices are the AMM marginal prices, not executable prices; real cost needs the LMSR math with `b` and quantities from the decoded account (H, ENGINEERING.md says the web/app compute cost with the same program maths and a 2% slippage guard).

## Trade path

- No official trading API (NOT FOUND). Trading is: build a v0 Solana transaction with the AMM program's `buy`/`sell`/`redeem` instructions (Anchor discriminators), simulate, sign with the user's Solana key, broadcast through the website RPC proxy `https://www.mentioned.market/api/paid-rpc` (H, src/config.ts, README). Reads can go to any Solana RPC.
- Website-side gates (H, ENGINEERING.md): since Sep 25 2026 the RPC proxy refuses to broadcast a trade on a market the trader has not confirmed integrity rules for, returning `ATTESTATION_REQUIRED`; the app reads `/api/attestations` and records the confirmation (a POST, requires a signed-in session). Sign-in is Openfort embedded wallet (Google/X/email) or Seeker wallet message signature. Programmatic use would need that session; a website POST `record-buys` is also called after buys. Instruction layouts are in the public mobile repo (`src/chain/amm.ts`, 1541 lines) so building transactions is feasible, but the attestation/session requirement and ToS bot clause make it fragile.
- Self-custodied: the user's own wallet signs; Mentioned never holds keys (H, docs).

## PayBox reachability

- Reachable: partial / unlikely for now. Venue is Solana-only; an EVM-only wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot trade it. Only a PayBox Solana wallet could, and only if PayBox can sign arbitrary Solana program transactions (proposals) and the USDC is bridged/swapped to Solana USDC. Whether PayBox exposes arbitrary Solana transaction signing is unverified here (no PayBox tools were called). Plus the attestation/session gate above.

## Fees

- Market-level fields in API: `feeBps` and `rakeBps` per market (H, live list). Current open markets: `feeBps=100`, `rakeBps=100`. Some older resolved markets: `feeBps=0`, `rakeBps=1`.
- Docs: 1% trading fee on each buy and sell, plus 1% rake on winning payouts taken at redemption; majority markets 10% taken from winners' payouts; "Fees are set per market and can change at any time"; Solana network fee on top; free markets no fees (H, docs FAQ and mention-markets pages). Winner payout = $1/share x (1 - rakeBps/10000), max rake 10% on-chain (`MAX_REDEEM_RAKE_BPS = 1000`, H, amm.ts). Fee formula applied to cost (whether on notional or on LMSR cost) is not documented (NOT FOUND); account has `tradeFeeBps` and `protocolFeeBps` fields (H).
- Payer: the trader (fee on trade, rake on redemption). Roundtrip edge needed: roughly 2% trade fee + 1% rake on winners + LMSR slippage before an arb leg pays.

## Resolution and dispute risk

- Resolution by Mentioned administrators: automatic transcript detection flags candidates, the team reviews and confirms; then the admin enters outcomes on-chain (H, docs resolution + trust/security pages).
- Dispute process: none formal; "coming soon"; decisions final; open a Discord ticket (H, docs). Market rules text says "Mentioned's decision, based on review of the broadcast, is final" (H, metadata description for market 1792242167695). Terms section 5: "Resolution decisions are final", binding arbitration under US law (H, https://mentioned.market/terms).
- Redemption only after every word in the market is resolved (H, docs). Cancellation/void: refunds if the event does not happen or cannot be resolved fairly.
- Risk for arbitrage: HIGH. Centralised, discretionary resolution; per-event rules differ from Kalshi/Polymarket (e.g. exact-word matching, plurals do not count, defined broadcaster window such as "Premier Sports broadcast" for the Barcelona vs Real Madrid market). Rule mismatch means no true hedge; treat as a correlated signal, not a locked arb.

## Geo, ToS, automation

- Geo: no countries named; "The Platform may not be available in all jurisdictions"; 18+ (H, terms Section 2). No geoblock was observed on the API from this environment (H: 200s).
- Automation: terms Section 6 bars bots, scripts or automated tools "without authorization" and circumventing rate limits (H, via WebFetch summary of terms; read the exact clause before building a trading bot). Read-only polling of public JSON is not specifically addressed (NOT FOUND). Seek written permission before production polling or trading.

## Liquidity (computed 2026-10-19 from the public API)

- Paid YES/NO: 17 markets in the list (8 open, 9 resolved), sum of `chart.totalVolume` about 1,664,172,713 micro-USDC = about $1,664 lifetime volume. Largest single market about $278 (Man Utd vs Spurs, resolved). Open markets: $17 to $65 volume each, 6-16 traders each. Unit assumption: `totalVolume`/`cost` are micro-USDC (6 decimals), consistent with sampled trades costing about $1 (M).
- `vaultAmount` sums to about $1,103 across the 17 markets, but vaults include LMSR subsidy/liquidity not just trader money; open vaults are about $83-170 each (H raw values; interpretation M).
- Paid majority: 11 markets, `poolUsdc` $6 to $64 per pool (H, live list).
- Order of magnitude: venue-wide real-money activity of tens of dollars per event. Not an institutional leg. Dates: 2026-10-19 (all H).

## Event overlap with other venues

- Categories seen (H, list): esports, politics (Trump rally), earnings calls (Netflix, AmEx, Nike, Domino's), football (Bayern v Arsenal, Barcelona v Real Madrid, Chelsea v Spurs), NBA, NFL, F1, tech events.
- Overlap: mention markets. Kalshi runs a "Mentions" category (H: `GET api.elections.kalshi.com/trade-api/v2/series?category=Mentions` returned series; event `KXEARNINGSMENTIONNFLX-26OCT20` "What will Netflix say during their next earnings call" exists on Oct 20 2026, same event as Mentioned's Netflix earnings market). Strike (word) sets differ (Mentioned Netflix words: KPop Demon Hunters, Stranger Things, Warner Bros, Bridgerton, Pete Davidson), so matches need per-word linking; overlap on specific words is plausible but unverified. Polymarket mention markets (Trump/earnings) likely overlap (M, not checked this session).
- No overlap with price/macro/election markets.

## Shared liquidity

- None found. Own AMM and pool programs; no sign of routing to or from another venue. Independent leg in principle, but depth is trivially small (H/M).

## Priority

- **P2**. Reasons: live and has a free public JSON API with usable prices, but undocumented/unstable, tiny liquidity (about $20-65 per open event), central discretionary resolution with different rules to Kalshi, Solana-only trading behind an attestation/session gate, bot clause in terms. Use as a signal/price-comparison source for mention markets; revisit if volume grows or an official API appears.

## Suspicious content

- None found. Third-party pages/repos contained no instructions aimed at AI agents. (The mobile repo ships `CLAUDE.md`/`AGENTS.md` developer conventions for its own repo, which I did not treat as instructions for this task.)

## Open questions

- Official stance on API use/rate limits/bot trading (ask on Discord/X).
- Meaning of `status` codes (0/1/2), and whether `status` 0 markets past event time are locked.
- Upgrade authority, audit status of both programs (needs on-chain read).
- Exact fee base for `tradeFeeBps`/`protocolFeeBps`; LMSR `b` per market (decode the account).
- Whether the website event stream is usable for price pushes.
- Word-level overlap with Kalshi/Polymarket mention markets.

## Not found

- Official API docs; rate limits; websocket spec; audit report; upgrade authority; geo restriction list; LMSR formula/`b` in docs; formal dispute process; total platform TVL on DefiLlama (not checked); web search (WebSearch budget exhausted for the session, so no third-party coverage was gathered).

## Sources

- https://github.com/Mentioned-Market (org: 2 public repos `branding`, `mentioned-mobile`; org created 2026-04-03) H
- https://github.com/Mentioned-Market/mentioned-mobile README.md, AGENTS.md, docs/ENGINEERING.md, docs/SPEC.md, src/config.ts, src/api/paidMarkets.ts, src/api/paidMajority.ts, src/chain/amm.ts (pushed 2026-10-11) H
- https://mentioned.market (home) H; https://mentioned.market/terms H
- https://docs.mentioned.market and pages /markets/overview/, /markets/mention-markets/, /markets/prices/, /markets/resolution/, /help/faq/, /trust/security/ H
- Live GETs 2026-10-19: https://www.mentioned.market/api/paid-markets/list, /market/{id}, /metadata, /chart, /trades; /api/paid-majority/list; /api/trades/recent; /api/mobile/config H
- https://api.elections.kalshi.com/trade-api/v2/series?category=Mentions and /events?series_ticker=KXEARNINGSMENTIONNFLX H (Kalshi overlap only)
