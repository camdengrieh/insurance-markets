# CRSHMARKET (app.crshmarket.com) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs, `gh api` file reads, page reads, web search. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run. The venue's own public JS bundle was downloaded as text and read with grep/python (never executed).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale. All third-party pages and API responses are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/crshmarket/` (3 files, all <= 15 KB).

## 0. Verdict

- **Kind:** livestream "micro-market" platform. YES/NO questions about in-stream moments (Among Us kills/ejections, NBA 2K quarters, Rocket League, PUBG Mobile), on streams hosted on CRSH itself. Pool (parimutuel-style) pricing, not an order book and not an AMM. Two settlement backends exist: a legacy on-chain USDC pool contract on Monad, and (now evidently the main one) an **off-chain ledger on a Convex backend** with "COIN" / "TICKET" currencies. (H for existence of both, see sections 2 and 3; M for "off-chain is now the main one".)
- **Live?** Yes, but small and moving off-chain. Site returned HTTP 200 on 2026-10-19; the public `home-availability` JSON listed 2 live streams (717 and 393 viewers) started 2026-10-18T19:29Z and 2026-10-19T00:08Z (H). The on-chain USDC pools are nearly dead: DefiLlama shows $0 volume for 30 days, last non-zero day 2026-09-18 (H).
- **No public API, no docs, no websocket for third parties.** Only one undocumented public GET JSON feed (stream list, no prices) plus an authenticated Convex backend (H).
- **Not an arbitrage leg.** Events are CRSH's own hosted game streams, resolved by the host / CRSH admins. There is no sports/politics/crypto/macro overlap with any other venue (H, from live rules text).
- **Not tradeable by an agent via PayBox:** auth is Privy login + KYC/geo gating; Monad (chain 143) is not in PayBox's chain catalog (see section 6).
- **adapter_priority: skip.** No overlap with other venues, no documented API, on-chain activity at zero, custodial off-chain ledger with sweepstakes-style play currencies, heavy geo-blocking, host-resolved markets.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| `GET https://app.crshmarket.com/` -> HTTP 200 (Vite SPA, Cloudflare); `crshmarket.com` and `www` 308 to `app.` | H | curl 2026-10-19 |
| `GET https://app.crshmarket.com/api/public/home-availability` -> 200 JSON: `liveCount: 2`; active streams "NBA 2k" (viewerCount 717, startedAt 2026-10-19T00:08:43Z) and "Among Us" (viewerCount 393, startedAt 2026-10-18T19:29:27Z), both `marketBackend: "offchain"`; one `scheduledShows` entry for 2026-10-19T01:15Z | H | `fixtures/crshmarket/home-availability.json` |
| Same payload: 8 `communityUpdates`, all `status: cancelled` (cancel or reschedule notices dated 2026-07), i.e. creators do cancel often | H | same file |
| `sitemap.xml` lists 13 creator profile pages, latest `lastmod` 2026-08-19 | H | https://app.crshmarket.com/sitemap.xml |
| DefiLlama id 8380, category Prediction Market, chain Monad, listing says "Livestreams you can predict on"; start 2026-07-31 | H | https://api.llama.fi/protocol/crshmarket |
| DefiLlama volume (BetPlaced events on 3 on-chain pool contracts): all-time/1y $8,353,899; Jul 2026 $142.6k, **Aug $8.09M**, Sep $117k, **Oct $0**; peak day 2026-08-13 $1.46M; 24h/7d/30d all $0; last non-zero day 2026-09-18 ($231), with sub-$11k days from 09-07 | H | https://api.llama.fi/summary/dexs/crshmarket (`fixtures/crshmarket/defillama-dexs-summary.json`) |
| DefiLlama fees (ProtocolFeeReleased): all-time $94,104.55, 30d $0. Realised fee about 1.1% of entry volume (derived, M) | H (data) | https://api.llama.fi/summary/fees/crshmarket |
| Monadscan "current" pool contract 0x8964...10F8: 131,484 tx, last tx 2026-10-14, USDC balance 38,771.51, not verified. Aggregation escrow 0x9373...dF82: 351,867 tx, last tx 2026-10-11, shows no token balance. Legacy promo escrow 0x370E...d4: last tx 2026-08-22, USDC 653.98. (Read through WebFetch's summariser, so numbers are M.) | M | https://monadscan.com/address/0x8964d7c989bf4b9bbd179ecd205544d3bb5b10f8 , .../0x93730D73516599C4cf81c967c54022dF3835dF82 , .../0x370E2eE6427D999D8eb1994cee0213bd0fBd63b4 |
| Press (Fast Company via Yahoo Tech, 2026-08-21; Futurism, 2026-08-23): launched "earlier this summer"; viral ad 2026-08-19; CEO claims $10M volume in 45 days (unverified; DefiLlama on-chain total is $8.35M). Futurism: CEO said in April that his earlier "KupidTV" rebranded to CRSHMARKET. At that time only video games (Among Us, Rocket League) were offered; freeform IRL streams had no date. | H (that articles say it), L (claims) | https://tech.yahoo.com/social-media/articles/crshmarket-goes-viral-now-bet-200000805.html ; https://futurism.com/future-society/new-prediction-market-livestreams |
| Frontrun profile: first flagged 2026-04-30, data updated 2026-10-12, X followers 7,352 | M | https://www.frontrun.vc/c/crshmarket/ |
| X account `x.com/crshmarket`: WebFetch returned HTTP 402 (no body, no payment requirements visible); stopped, not followed | H (that it failed) | WebFetch |

Conclusion: operating, low volume, and the on-chain leg has been idle since mid-September. Real activity (if any) is in an off-chain ledger that nothing public measures.

## 2. Market model

- **Questions:** YES/NO only. ToS: "Markets are generally framed as YES/NO questions about live moments, creator milestones, chat outcomes, or other stated events." (H, bundle ToS text, see Sources). The client code only handles two options (`YES`=0, `NO`=1). No categorical or scalar markets found.
- **Pricing = pools.** The client calls the type `parimutuel` (UI label "pool"; contract version tag `usdc_pool_v1`) and displays `pool_yes_usdc`, `pool_no_usdc`, "Pool split: YES x%, NO y%". There is also a second type `request_based` (off-chain only) with a `requestMarkets.quote` call and "multiplier" language ("Ticket entries from $5, with a 1.1x return or more", H UI string). So off-chain entries may be fixed-multiplier quotes against a house reserve rather than pure pool shares (M; the mechanics are not documented). The on-chain contract has both `bet` (pool) and `betWithQuote` (signed fixed-payout quote, `reserveLiability`), supporting the same reading (H for the ABI, M for use).
- **Payout weighting:** the pool is not plain pro-rata. Events/fields show an "early weight" (`weightBps`, `MAX_EARLY_WEIGHT_BPS`, `weightedAmount`) and an "impact reward pool" (`impactRewardPool`, `IMPACT_BONUS_CAP_BPS`) that gives early or minority-side stakers a bonus. Exact formula NOT FOUND (source unverified; reverse-engineering the client maths was out of scope). (H for fields, M for meaning.)
- **Tokenisation:** none. Positions are rows in the contract mapping `bets(marketId, user)` on-chain, and ledger rows off-chain. No ERC-20/1155 outcome tokens.
- **Currencies (off-chain markets):** `COIN` ("Gold Coins", play-for-fun, "no cash value", cannot be redeemed) and `TICKET` (promotional / sweepstakes currency; redeeming needs KYC; claimable free daily, with an "AMOE" (alternate method of entry) playthrough) plus USDC "dollar balance" funded from Monad deposits. UI string: "No purchase necessary. Free TICKET and paid COIN have equal odds in offchain markets." This is a sweepstakes-casino structure layered on a prediction-market skin. (H, UI strings in bundle.)
- **Market lifecycle (host-driven):** hosts open / close / cancel / resolve each market from the stream (`hostMarkets.openYesNoMarket`, `startActiveYesNoMarketCloseCountdown`, `closeActiveYesNoMarket`, `resolveActiveYesNoMarket`, `finalizeActiveYesNoMarketResolution`, `cancelActiveYesNoMarket`). Markets are short-lived (minutes). (H, function names in client bundle.)

## 3. Chains and collateral

- **Chain:** Monad mainnet, chain id 143 (H, bundle: `id 143`, explorer monadvision.com). Client config says `VITE_ENVIRONMENT=mainnet`.
- **Collateral:** native USDC on Monad, 6 decimals, `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` (H, bundle `VITE_USDC_ADDRESS`; same address in the DefiLlama adapter, https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/crshmarket/index.ts).
- **On-chain contracts** (all unverified on Sourcify, 404 "match: null"; Monadscan shows no verified source; ABI taken from the venue's own client bundle, so the interface is H but behaviour is not audited). DefiLlama says audits: 0.
  - Pool market "current" `0x8964d7C989bF4B9bbd179ecd205544d3bb5B10F8` (named by DefiLlama adapter commit of 2026-08-22 after the old contract's adapter "went to zeros on 08-17") (H).
  - Pool market legacy `0x968279784D780C02A79b1c58aD69aaA832F09342` and `0x7B9256Fd345b6Dfa78017094caE64B153dE21fb2` (H, adapter). The shipped web bundle still points `VITE_USDC_POOL_MARKET_ADDRESS` at the legacy `0x7B92...`, which suggests the front end no longer routes new entries on-chain (M, inference).
  - Aggregation escrow `0x93730D73516599C4cf81c967c54022dF3835dF82` (`VITE_TRADE_AGGREGATION_ESCROW_ADDRESS`) and promo escrow `0x370E2eE6427D999D8eb1994cee0213bd0fBd63b4` (H for addresses, M for roles: deposits swept into an escrow that backs the off-chain "dollar balance").
- **ABI highlights (`UsdcPoolPredictionMarket`)** (H, bundle): `bet(marketId, option, amount)`, `betWithPermit(...)`, `betWithQuote(marketId, option, stake, multiplierBps, payout, expiresAt, quoteKey, signature)` (EIP-712 quote signed by `QUOTE_SIGNER_ROLE`), `claim(marketId, user)`, `getMarket`, `getBet`, `createMarket(metadataHash, lockTime, impactRewardPool)`, `closeBetting`, `proposeResolution` / `resolve` with `RESOLUTION_DELAY_SECONDS`, `cancel`, `pause`; roles `MARKET_CREATOR_ROLE`, `MARKET_RESOLVER_ROLE`, `EMERGENCY_ROLE`, `RESERVE_WITHDRAWER_ROLE`; events `BetPlaced`, `MarketResolved`, `MarketCancelled`, `Claimed`, `ProtocolFeeReleased`. Constant values (`RESOLUTION_DELAY_SECONDS`, fee tiers) were not read: that needs `eth_call` (a POST), which this research does not do.

## 4. Read API

`exists: unofficial-only` (one public undocumented feed; everything else is an authenticated Convex backend).

- **Docs:** NOT FOUND (searched: app root, `/docs`, `docs.crshmarket.com` (no DNS), `api.crshmarket.com` (404 "No matching routes found"), `llms.txt` (302 empty), GitHub/DefiLlama/web search for CRSH repos, X not readable). Only `support.crshmarket.com` ("CRSH Customer Support" SPA) exists.
- **Public unauthenticated GETs that work (H, 2026-10-19):**
  - `GET https://app.crshmarket.com/api/public/home-availability` -> JSON `{activeStreams[], communityUpdates[], firstLiveShowId, liveCount, scheduledShows[]}`. Each active stream has `id` (Convex id), `title`, `hostId`, `hostUsername`, `viewerCount`, `marketBackend` ("offchain"), `playbackStatus`, `recastPlayback{embedUrl, originalUrl}` (a Kick or YouTube restream), `sourceKind`, `startedAt` (ms) and `viewerInfoText` (the market rules text). **No prices, pools, markets or outcomes in this feed.** The same path on `api.crshmarket.com` returns 401. (fixture: `home-availability.json`)
  - `GET https://app.crshmarket.com/api/geofence/can-bet` -> `{allowed, reason, country, region, checkedAtMs, geoToken}`; for the research host it returned `allowed:false, reason:"region_not_allowed"`. (sanitised fixture: `geofence-can-bet.sanitized.json`; the country, region and signed token were redacted because they identify the caller.)
  - `GET /sitemap.xml`, `/manifest.webmanifest`, `/robots.txt` (`Allow: /`).
- **Market data lives behind Convex** (`https://convex.crshmarket.com`, HTTP actions at `https://api.crshmarket.com`; a sync websocket/`/api/query` style transport). Function names visible in the client include `predictionMarket.getMarket`, `getMarketQuote`, `getMarketActivityFeed`, `getHistory`, `requestMarkets.publicOdds`, `requestMarkets.quote`, `offchainMarketEntries.getOffchainMarketPublicState`, `getOffchainMarketEconomics`, `marketActivity.listResolved`, `hostMarkets.listActiveMarketStates` (H for names). Whether any of these answer without a Privy session was **not tested** (it needs POST or a websocket, outside this read-only brief). Convex function names are not a stable public contract either. (M)
- **On-chain reads:** the on-chain pool contracts are readable by any Monad RPC (`getMarket`, events). Public Monad RPC was not called (POST). Event logs are the only independent data (that is how DefiLlama gets volume).
- **Rate limits:** NOT FOUND. Cloudflare in front; `/api/public/home-availability` is polled by the web app every 10 s (`uvi=1e4` in the bundle), which is a hint of what is tolerated, not a stated limit (M).
- **Websocket:** NOT FOUND for third parties. The app uses the Convex websocket and Ably (`wss://ws-up.ably-realtime.com`) for chat (M).

## 5. Trade path

`none` for an agent. What exists is a human web-app flow:

- **Login:** Privy (email, SMS, social, passkey, external wallet; app/client ids are public in the bundle, not recorded here). After Privy, the client obtains a venue session from `POST https://api.crshmarket.com/api/auth/wallet/session/v2` (H for URL; body/contract NOT FOUND). Sumsub (KYC SDK) and Cloudflare Turnstile are loaded by the client (H). Terms acceptance gate (`/api/v1/users/me/accept_terms` on Privy) precedes use.
- **Off-chain entry:** Convex mutation `offchainMarketEntries.submitEntry` (and `requestMarkets.mutate/quote`) with the user's session; no signed order, no on-chain tx per bet. Gas for on-chain legs is sponsored by `gasSponsor.sponsorBetGas` / "Privy sponsored trade" (H names).
- **On-chain entry (legacy, idle):** ERC-20 `approve` or EIP-2612 permit, then `bet` / `betWithPermit` / `betWithQuote` on the pool contract. Directly callable by any EOA on Monad **in principle** (M: no allowlist seen in the ABI for `bet`, but the front end is geo-gated and an operator can `pause`).
- **Cash out:** `aggregateTrade.submitCashWithdrawal` to a wallet; TICKET redemption requires identity verification and possibly tax documents (H, UI strings).

## 6. PayBox reachability

`paybox_reachable: no`.

- Monad (eip155:143) is **not** in PayBox's chain catalog: `discover_tokens mode=chains` on 2026-10-19 returned Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid (H, recorded in `docs/research/06-paybox-platform.md` section 5; not re-queried here). That file's tests of unsupported chains for proposals are unresolved, and the catalog is "not a support allowlist".
- No bridge to Monad via PayBox `request_swap` is documented (M). The EOA would also need MON for gas on the on-chain path.
- Even if an on-chain `bet` proposal were accepted on 143, it would hit a pool that has had no volume since mid-September, with an unverified contract, and the front end is geo-gated.
- The main (off-chain) path needs a Privy session, KYC for any withdrawal, and works only from allowed regions. An agent cannot hold that session through PayBox, and the bonus terms ban "automated" accounts for promotions (see section 9).

## 7. Fees

- **Nominal entry fee: 800 bps (8%)** (H as a client constant: `JXe=800`, policy tag `entry_fee_v2`; also contract constants `ENTRY_FEE_BPS`, `PROTOCOL_FEE_BPS`, `HIGH_PROTOCOL_FEE_BPS`, `PROTOCOL_FEE_TIER_THRESHOLD_UNITS` (client: tier threshold 150 USDC pool size, both tiers 800 bps today)). The on-chain values were not read, so this is "what the client assumes" (M for the contract).
- **How the client computes it (v2):** each entry's net stake = stake minus 8%. At resolution the collectible fee = min(8% of the gross pool, losing stake), held until resolution and then "released" to the protocol; cancelled markets refund one-to-one without fee (ToS section 6, H). `ProtocolFeeSettled` / `ProtocolFeeWaived` events show fees can be waived.
- **Realised take:** $94.1k fees on $8.35M entries = about 1.13% (derived from DefiLlama, M). It is much lower than 8% because of the cap at losing stake, waivers and cancelled or one-sided pools.
- **Who pays:** bettors (all of it flows to the protocol per DefiLlama methodology: "All ProtocolFeeReleased USDC is retained by the CRSH protocol"). The ToS also reserves "protocol, platform, creator, referral, rakeback, payment, or network-related fees". Creators get "revenue share" from "eligible collected rake" (UI string). Gas is sponsored for users (H names).
- **Deposit/ramp costs:** Meld / Coinbase / MoonPay card ramps exist (H names); costs not read.

## 8. Resolution and dispute risk

- **Who resolves:** the stream host plus CRSH. Off-chain rules (NBA 2K, Among Us, taken from the live feed, H): "Official live NBA 2K gameplay recorded and verified by CRSHMARKET administrators is the resolution source"; Among Us uses the in-game Victory/Defeat screen and "clear, visible in-game evidence"; "The Host reserves the right to lock or close any market at any time". On-chain: a `MARKET_RESOLVER_ROLE` account calls `proposeResolution` then `resolve` after `RESOLUTION_DELAY_SECONDS`.
- **Dispute window:** "Initial resolutions are provisional for 24 hours. Disputes must include clear, verifiable evidence submitted within 24 hours" (H, live rules text); disputes go through `hostMarketDisputes.submitDispute`, decided by CRSH. "CRSHMARKET reserves the right to interpret, apply, amend, or clarify these rules at its discretion" and may settle forfeited NBA 2K games by "probability-based analysis" (H). No oracle, bond or on-chain challenge.
- **Integrity risk is high:** the person who creates the question can be the person who plays the game; critics and press raised insider-trading and streamer-collusion concerns (H that articles say so); CRSH answered only "We got that covered :)" (Futurism). Admin keys can pause, cancel, withdraw reserve (ABI roles).
- **Cancel/refund rules:** refunds for impossible or invalid markets; stream lag lets the host lock instantly (H).

## 9. Geo, ToS and automation

- **Geo gate `CAN_BET`** (H, client logic + live endpoint): about 95 blocked ISO country/territory codes, including most EU states (IE and LU are not in the list), UK, Switzerland, Norway, Russia/Belarus/Ukraine/Turkey, China, Japan, Korea, Singapore, Vietnam, Indonesia and other Asian jurisdictions, most of the Middle East, Australia, South Africa, Ghana, Kenya, Uganda, and Latin America (AR, BR, CL, CO, MX, PE), plus several overseas territories. **US is allowed only in 29 states**: AL, AK, AR, CO, FL, GA, HI, KS, MA, MN, MS, MO, NE, NH, NM, NC, ND, OH, OR, PA, RI, SC, SD, TX, UT, VT, VA, WI, WY. Unknown region and Tor ("T1") are denied. Message: "We can't confirm your location while a VPN or proxy is active." Signed `geoToken` is issued by the endpoint and checked server-side.
- **ToS** (static text, version 2026-06-04, in the bundle; /legal/terms is an SPA route with no server-rendered text): 18+, "not available in sanctioned jurisdictions"; one-account rule ("You may not create or use multiple accounts to avoid limits ... evade restrictions, or hide identity or location"); may require "age, identity, location, sanctions, wallet, source-of-funds" checks; Delaware law; operator is "CRSHTV". Bonus Terms: "You may not use more than one account, shared account, automated account, borrowed account, or misleading identity to collect promotions." No explicit API or bot clause for plain trading was found (NOT FOUND, searched bundle for bot/scrap/API terms).
- **Self-description conflict:** the signup gate says "CRSH is a decentralized, non-custodial prediction market built on Monad", but the live flow is a custodial off-chain ledger with admin-held escrow and withdrawal review ("We may delay, limit, reverse, or block claims ... withdrawals"). Treat "non-custodial" as marketing (M).
- **Sweepstakes angle:** COIN/TICKET, AMOE, "No purchase necessary", "Tickets aren't Available in Your Location ... You can still purchase Gold Coins and play for fun" (H UI strings). Whether real-money markets are legal where an aggregator's users sit is a compliance question this note does not answer.

## 10. Liquidity

- **On-chain USDC entry volume (DefiLlama, 2026-10-19):** $8.35M all-time, essentially August ($8.09M); $0 over the last 30 days; the last non-zero day was 2026-09-18 (H). Monadscan balance of the current pool contract about $38.8k (M).
- **Off-chain volume:** NOT FOUND. No public metric; the CEO's "$10M in 45 days" (LinkedIn, via press) is unverified and larger than the entire on-chain total.
- **Depth per market:** NOT FOUND. Pools are small and short-lived; "We're refilling liquidity, so this balance can't be used for new entries right now" (H, UI string) implies a house reserve that sometimes runs dry.

## 11. Event overlap and shared liquidity

- **Categories:** esports/video-game micro-events (Among Us, NBA 2K, Rocket League, PUBG Mobile) and IRL stunts, hosted by CRSH creators (H: live rules text, community updates, press). **None overlap with Polymarket, Kalshi or any other covered venue.** There is nothing to arbitrage against; at most a "creator streams game X now" signal.
- **Shared liquidity:** none with another venue. It is a closed pool/house-reserve system (M). So it would be an independent leg if there were anything to match, but there is nothing to match.

## 12. Adapter notes (if ever revisited)

- A read-only "signal" adapter could poll `GET /api/public/home-availability` every 30 to 60 s for live stream count and viewer counts and track `contract.getMarket` via Monad events. That gives liveness and rough activity, not prices.
- A trading adapter would need a Privy-authenticated Convex session, KYC and geo eligibility, none of which fit the PayBox agent model. Do not build one.
- Revisit only if CRSH publishes a public API/docs or adds mainstream markets (sports, politics) that other venues also list. Triggers to check: docs subdomain appears, `api.crshmarket.com` serves a REST schema, or DefiLlama volume resumes above $100k per day.

## NOT FOUND (searched)

- Official docs / API reference / OpenAPI / GitHub org / audit report (searched: site paths, subdomains, web search, GitHub via DefiLlama adapter, X unreadable (HTTP 402)).
- Rate limits, websocket spec for third parties.
- Verified contract source on Sourcify or Monadscan; on-chain constants (fee tiers, resolution delay).
- Off-chain volume or open interest (no public metric).
- Pricing formula for `request_based` markets and the early-weight / impact-bonus maths.
- A bot/API clause for trading in the ToS (only the promotions clause).
- Any regulator action against CRSH in search results (none found; not proof of none).

## Suspicious content

None found. No text addressed to AI agents in the HTML, the 9.6 MB JS bundle, or the JSON feed (grep for "ignore previous", "system prompt", "AI agent", "LLM" found only React lifecycle false positives).

## Privacy / hygiene

All scripted requests used the User-Agent `insurance-markets-research/0.1`. No personal identifier was sent. The geofence response and Set-Cookie region values of the research host were not stored; the sanitised geofence fixture has them redacted. The bundle contains a publishable Stripe test key and Privy client ids; they were deliberately not copied into these notes.

## Sources

1. https://app.crshmarket.com/ (H; HTML 200 on 2026-10-19; `description`: "Livestreams you can predict on")
2. https://app.crshmarket.com/api/public/home-availability (H; fixture)
3. https://app.crshmarket.com/api/geofence/can-bet (H; sanitised fixture)
4. https://app.crshmarket.com/assets/index-BAI97hZj-mvd7iemu.js (H for what the client contains: ABI, constants, ToS and bonus-terms text, geo lists, API paths, Convex function names; read as text only, not run)
5. https://app.crshmarket.com/sitemap.xml , /robots.txt , /manifest.webmanifest (H)
6. https://api.llama.fi/protocol/crshmarket , https://api.llama.fi/summary/dexs/crshmarket , https://api.llama.fi/summary/fees/crshmarket (H; fixture for dexs)
7. https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/crshmarket/index.ts and fees/crshmarket/index.ts (H; contract list, events, commit dates 2026-08-10, 2026-08-22, 2026-09-15)
8. https://sourcify.dev/server/v2/contract/143/<address> for the three pool contracts, the promo escrow and the aggregation escrow (H; all `match: null`)
9. https://monadscan.com/address/0x8964d7c989bf4b9bbd179ecd205544d3bb5b10f8 , .../0x93730D73516599C4cf81c967c54022dF3835dF82 , .../0x370E2eE6427D999D8eb1994cee0213bd0fBd63b4 (M; via WebFetch summariser)
10. https://tech.yahoo.com/social-media/articles/crshmarket-goes-viral-now-bet-200000805.html (2026-08-21) and https://futurism.com/future-society/new-prediction-market-livestreams (2026-08-23) (H for what they report; L for the venue's own claims)
11. https://www.frontrun.vc/c/crshmarket/ (M); https://dangertesting.com/crshmarket (L, tagline only)
12. https://support.crshmarket.com/ (H; support SPA only, no content)
13. https://x.com/crshmarket (WebFetch: HTTP 402, not read, nothing paid)
14. In-repo: `docs/research/06-paybox-platform.md` section 5 for PayBox chain catalog dated 2026-10-19 (H as recorded there)
