# World Prediction Markets (world.xyz) - venue spec

Researched 2026-10-19 (data timestamps 02:42 to 03:45 UTC). Read-only. What was touched: public pages and the site's own static JS (read as text, never executed); DefiLlama public API; `gh api` raw reads of public repos; one unauthenticated GET each to the site's REST host, its order host and its token-metadata host; and the read-only tools of PayBox's first-party `world` plugin (`discover_plugins`, `get_contract`, `use_plugin` with `world_get_events`, `world_get_markets`, `world_search`, `world_orderbook`, `world_market_prices` only). No account, wallet, signing, money tool, POST, Turnstile solving or header spoofing. The WebSearch budget ran out partway (shared session limit), so no further news searches were possible after the first two.

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

"World" here is the Solana prediction market at world.xyz run under the World Protocol Foundation. It is not Worldcoin / world.org.

A sibling note from an earlier run exists at `docs/research/venues/world.md`. This note was written independently and re-verified; where it differs, this one is newer (see "Differences from the earlier note").

## Verdict

- **Adapter priority: P2** (signal-only). Live and real, but thin (about 182K USD open interest in total), its public REST/WebSocket backend is Turnstile-gated, official API access is by request form only, it is Solana-only, and it excludes the US and many other countries.
- Liquidity is its own (own program, own makers), so in principle it is an independent leg. In practice it prices within about half a cent of Kalshi and Polymarket on matched outcomes (M, third party), and it embeds a flat 2.1 cent spread, so there is little to harvest and little independent information.
- The only read path that works for us today without a browser is PayBox's first-party `world_*` read tools (H) plus on-chain state (M). Our own PayBox Open Plugin cannot call another plugin's tools, so an agent has to pass `world_*` output into our tools.
- Reconsider upward only if World grants API access (form below), depth grows by an order of magnitude, or makers are shown to be independent of Kalshi/Polymarket.

## Liveness (still live in 2026?)

- **Live. H.** `https://world.xyz/` returned HTTP 200 on 2026-10-19 (a 3 KB Vite SPA shell, which is why a text fetch shows only the word "world"). PayBox's plugin returned live quotes stamped 2026-10-19T03:20:32Z (`world_orderbook`, fixture below). DefiLlama has a TVL point for 2026-10-19 02:42 UTC of 187,530 USD (https://api.llama.fi/protocol/world).
- Timeline: Terms "Last Updated: June 17, 2026" (H, Terms page chunk `TermsPage-B1p_x_RX.js` of the world.xyz SPA). Press release "NEW YORK, July 1, 2026 - World launches today" (H, https://world.xyz/docs/announcing-world). Phantom disclosure dated 2026-07-01 says World powers Phantom's prediction markets for positions opened on or after 2026-06-01 (H, https://phantom.com/prediction-market-disclosures, read through a page summariser). DefiLlama volume adapter starts 2026-06-11 and the listing is dated 2026-07-02 (H). Standalone world.xyz opened to "more than 1 million waitlisted users" on 2026-09-09 and "has since featured more than 150,000 markets" (H, https://cryptobriefing.com/world-xyz-website-down-launch-traffic/; the 150,000 figure counts auto-generated markets, most with no trades).
- Team: the CoinDesk piece says the platform's "identity stayed hidden until late June, when a legal disclosure on Phantom's site surfaced on X" (H, https://www.coindesk.com/web3/2026/07/01/mysterious-solana-project-world-unveiled-as-fully-onchain-prediction-market). No individual is named in any World page I read. Legal entity: "World Protocol Foundation, a Cayman Islands foundation company" (H, Terms).
- Official accounts: https://x.com/world_xyz (H, linked from the site's docs footer and DefiLlama metadata).
- Self-description (H, https://world.xyz/about, rendered by the `AboutPage` chunk): "Self-custodial prediction markets on Solana. World is a Solana-native protocol for trading YES/NO contracts on real-world questions - sports, crypto, politics, culture. Every position is signed by your own wallet and settles onchain in seconds." Claims: markets run 24/7, World never custodies funds or takes positions against users, and YES/NO contracts are "standard tokens". The page still carries a stale "Back to waitlist" link.

## Kind and market model

- **Kind:** on-chain complete-set vault program plus maker-quoted prices. Not a central limit order book and not a pooled AMM curve. FAQ: "You trade against a live quote ... There are no resting limit orders." (H, FAQ page chunk `FaqPage-DOyYo30o.js` of the world.xyz SPA). The Terms call the counterparty an "automated market maker"; the quote data shows a maker-style bid/ask pair with sizes (H).
- **Outcomes:** binary YES/NO per market (`marketType:"binary"`, H). An event groups markets (a football match has Home / Draw / Away; "winner" events have one market per candidate). Rare scalar outcome: both tokens redeem a proportional share of 1 CASH (H, FAQ). Event objects carry `mutuallyExclusive:false` even for a Home/Draw/Away set (H, fixture), so do not rely on that flag to find sum-to-one groups.
- **Tokenisation:** YES and NO are "standard Solana (SPL) tokens held in your own wallet" (H, FAQ). Third-party decode (M, https://github.com/chainstacklabs/world-xyz-research, verified by them 2026-07-09 and 2026-09-11): Token-2022 mints with a permanent delegate, program `prediCtPZCttYMvm2W3PtxmMxLmT1dtN7riU6Cxh6tM` (id also in the DefiLlama adapter, H), `split(N)` locks N CASH for N YES + N NO, `merge` reverses, winners redeem 1:1. Every market publishes `accounts.<CASH mint>.{marketLedger, yesMint, noMint, isInitialized}` (H, fixtures). Token metadata is a public JSON at `https://m.world.xyz/<mint>` (H, fixture).
- **Price formation (M):** makers (JanusFI, run by World; BisonFI, independent) quote through DFlow's router and mint a set on demand. YES and NO prices sum above 1; the excess is the cost.
- **Market creation:** the Terms describe permissionless "Market Creators", but no creator UI, route or PayBox tool exists; market lifecycle is run by one operator key (M, Chainstack). Treat the catalog as World-curated.
- **Catalog today (H, PayBox `world_get_events`, status=active, 3 pages, 2026-10-19 ~03:25 UTC):** 274 active events: 213 sports, 18 politics, 18 crypto, 12 finance, 6 economics, 7 culture. About three quarters have zero open interest. See Liquidity.
- **Short-duration crypto Up/Down is live (H):** series `WXBTC5M`, `WXBTC15M`, `WXBTC60M` and the same for ETH, SOL, XRP, HYPE, one event per window (for example `WXBTC60M-26OCT190300`). Rule: "If the Chainlink BTC/USD 60-second time-weighted average price at {closeTime} is at least the ... price at {openTime}, then the market resolves to Yes" (fixture); no early close; `disputeWindowSeconds` 0. They exist but are empty (BTC 60-minute market had 0 trades 40 minutes after opening; BTC 5-minute market had about 180 USD of volume).
- **Ticker dates are not event dates (H):** `WXLIG-26SEP162130ABILLEVA` (Levante v Athletic Bilbao, ticker date 2026-09-16) is still active with `strikeDate` 2026-10-21T18:00Z and `closeTime` 2026-10-22T03:00Z, and the rules say a postponed game "remains open until the game has been completed". `WXMLS-26SEP051930DCUNFCCN` shows the same pattern (closeTime 2026-10-22T07:00Z). Use `strikeDate`/`closeTime`, not the ticker.

## Chains and collateral

- **Chain: Solana mainnet only.** H (FAQ, Terms "deployed on the Solana blockchain", DefiLlama `chains:["Solana"]`).
- **Collateral: CASH,** mint `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` (H, site bundle and every market's `accounts` key). The announcement boilerplate calls CASH "the first stablecoin built on Bridge and Stripe's Open Issuance platform" (H, world.xyz/docs/announcing-world). Issuer freeze/clawback authority over CASH accounts (M, Chainstack).
- Users can fund with SOL, USDC or CASH (H: the bundle lists those three mints; FAQ says network fees can be paid in SOL, USDC or CASH); the plugin's buy takes `size` in atomic USDC and routes to CASH.
- Wallets: World can create an embedded wallet from email/Google/passkey, or connect a Solana wallet (H, FAQ).

## Read API

- **`exists`: official-authenticated (access by request).** The official docs page lists "Request API Access - Reach out and tell us about your project" with a Google Form (H, https://world.xyz/docs/request-access; form https://forms.gle/zxPQooAU2DGUjYtT6; **not submitted**). The separate Mintlify site https://docs.world.xyz redirects to a login that says "Access Restricted. To gain access to this doc, provide your access code" (H); content not read. NOT FOUND (searched: world.xyz/docs, docs.world.xyz, world.xyz robots/sitemap/llms (all return the SPA shell), GitHub org/user `world-xyz` (404), `gh search repos "world.xyz prediction"` (one unrelated hackathon repo), DFlow docs, WebSearch): any public OpenAPI spec, API key portal, rate-limit statement or WebSocket channel list.
- **What the official web app calls (H, read statically from https://world.xyz/assets/api-CcCaG8Rc.js and sibling chunks; this is the frontend's private API, not documentation):**
  - Markets API: `https://markets-api-proxy.world-xyz.workers.dev/api/v1` with `GET /events` (params `withNestedMarkets, limit, cursor, status, category, tags, sortBy, sortOrder, updatedSince`), `GET /event/{ticker}`, `GET /search?q=`, `GET /categories`, `GET /tags`, `GET /event/{ticker}/live`, `GET /event/{ticker}/percentage-history?startTs&endTs&resolution&maxMarkets`; WebSocket `wss://markets-api-proxy.world-xyz.workers.dev/api/v1/ws` (message format not read).
  - Order host: `https://aggregator-api-proxy.world-xyz.workers.dev` with `GET /order`, `POST /submit`, `/filter_outcome_mints`.
  - Users API: `https://users-api.world.xyz/api/v1` (`/users/{wallet}/trade-and-earn`, `/tx-info?signature=`; a "Trade and Earn" rewards program tied to connecting an X account, so some volume may be incentive-driven, M).
  - Token metadata: `https://m.world.xyz/<mint>` (H probed, 200, `cache-control: max-age=300`).
- **Access gate (H, `client-DbnkBH7t.js`):** the app renders a Cloudflare Turnstile widget, `POST {base}/auth/token` with `x-turnstile-token`, and stores a JWT (default lifetime 3600 s) that it sends on later calls. How the WebSocket authenticates was not verified. A plain `GET .../api/v1/markets?limit=1` on 2026-10-19 returned **HTTP 403**, empty body, with `access-control-allow-origin: https://world.xyz` and `access-control-allow-headers: Content-Type, Authorization, x-turnstile-token` (H). A plain `GET /order?...` on the order host returned 404 with an empty body (H; path or gate, not investigated). Third party (M): "Since October 2026 World's router only answers its own web app, which passes a Cloudflare Turnstile browser check first" (https://github.com/chainstacklabs/world-xyz-limit-orders, pushed 2026-10-12). The same research repo's older text says the proxies were open with an `Origin: https://world.xyz` header; I did not test that because forging the Origin to pass an allowlist circumvents an access control (and the Terms' prohibited-conduct item (d) bans bypassing "access controls, rate limits, security measures"). Treat the "open proxy" finding as superseded.
- **Working read path: PayBox first-party plugin `world` (H).** Contract read from `paybox://plugins/world` on 2026-10-19; read tools (all `readOnlyHint:true`): `world_search` (q, status, series_ticker, cursor, limit), `world_get_events` (ticker or list; status default `active`; `cursor` is an integer offset), `world_get_markets` (ticker or `event_ticker`), `world_market_prices` (ticker, start_ts, end_ts, resolution), `world_orderbook` (ticker, or mint with `by_mint`), `world_positions` (wallet address), `world_filter_outcome_mints` (up to 200 mints). Page ordering is "by volume only within that page". The full active catalog (274 events) paged in three calls (8, 200 and 66 events; the 200-event page is about 51 KB without nested markets). `world_search` matches tags and series text ("bitcoin" matches; "up or down" returned zero events although such events exist), so list with `world_get_events` instead of relying on search.
- **Response shapes (H, fixtures):**
  - Market: `ticker, eventTicker, title, status (initialized|active|inactive|determined|finalized), yesBid/yesAsk/noBid/noAsk` (decimal strings in CASH per 1 contract, null when no quote), `volume, volumeFp, volume24hFp, openInterest, openInterestFp` (integers in 6-decimal CASH base units; unit inferred and confirmed because summed OI matches TVL), `tradesTotal, trades24h, uniqueTraders, openTime, closeTime, expirationTime` (placeholder 2100-01-01 on non-Up/Down markets), `canCloseEarly, earlyCloseCondition, disputeWindowSeconds, result, rulesPrimary/rulesSecondary` (template plus tokens), `metadata.chainlink_market_id, metadata.sportsdataio_global_participant_id`, `accounts.<CASH mint>.{marketLedger, yesMint, noMint}`.
  - Event: `ticker, seriesTicker, category, tags, title, subtitle, openInterest, volume, volume24h, liquidity, strikeDate, settlementSources, metadata.{chainlink_event_id, sportsdataio_global_event_id}, mutuallyExclusive`, nested `markets`.
  - Orderbook: one level per side, `{yes:{ask,askQty,bid,bidQty,slotId,ts}, no:{...}, yesMint, noMint, status}`. The ask-side size is about 10 USD of notional (377.9 contracts x 0.02647 = 10.0 in the sample). Depth beyond the top quote: NOT FOUND.
  - Quote history: `{yes:[{ask,askQty,bid,bidQty,slotId,ts}...], no:[...]}` at 60 s spacing (1450 points for 24 h). Over that 24 h the YES spread was a constant 0.0211 (ask minus bid), so quotes are a fixed-width band around a moving mid, not a revealed book.
  - Not documented anywhere I could read: pagination limits and cursor semantics at the REST host, rate limits, WebSocket channels, error codes for the markets API.
- **On-chain read (M, third party; layout H in DefiLlama adapter code):** `getProgramAccounts` on the prediCt program with `dataSize:320` lists market accounts; the vault pubkey is at byte offset 136 and a flag at offset 271 marks open markets. That gives collateral and supply, not prices. JSON-RPC is POST-only, so I did not call it.
- **Third-party data (H):** DefiLlama TVL and volume (fixtures). No Dune dashboard URL or subgraph verified.

## Trade path

- **Official, through PayBox (H):** `world_buy_outcome` (`credential_id, market_mint, size` exact-in in atomic USDC, optional `slippage_bps, value_cents`), `world_change_position` (`side` buy|sell), `world_redeem`. Solana wallet credentials only ("PayBox pins the buyer and sender from the credential"). "Approval follows the grant: autonomous returns `pending_signature`, while approval-gated returns `pending_approval`." Not called.
- **Web-app protocol (H, `ScrollRail` chunk):** `GET {order host}/order?inputMint&outputMint&amount&slippageBps&...&userPublicKey` returns `{inputMint, inAmount, outputMint, outAmount, slippageBps, lastValidBlockHeight, routePlan?, transaction (base64), orderToken, sponsorFee?{mint,amount}, platformFee?}`; the wallet signs the server-built Solana transaction (ed25519, no typed data); `POST /submit {transaction, orderToken}` returns `{signature}`. Error bodies are `{code,msg}`. There is no signed-order object and no off-chain order book. This path sits behind the Turnstile gate for anything but the official frontend.
- **Permissionless on-chain (M, third party):** `prediCt.split`/`merge` can be called by any wallet at a true 1.0 basis (the IDL is not published, so a client has to hand-encode), and third-party Manifest order books exist for World outcome tokens that DFlow/Jupiter route into (https://github.com/chainstacklabs/world-xyz-limit-orders). A DFlow Trading API route (`quote-api.dflow.net`, key by request form; keyless dev host "testing only") is described by the same third party (M); I did not verify it.
- Market creation, resolution and payout are operator-only (M).
- **EVM reachability through PayBox: no.** Base, Ethereum, BNB, Arbitrum and Polygon credentials cannot hold CASH or sign Solana transactions, so they cannot trade World. A Solana PayBox credential can, via the first-party plugin only. Funding a Solana wallet from EVM funds is a separate swap/bridge step that I did not test. Our own Open Plugin could in principle propose `kind:"solana"` transactions (single signer who is fee payer, no sponsor, at most 1232 bytes, `docs/research/04-paybox-reference-plugins-a.md` section 5.3), but World's order transaction comes from the gated order host and may use a sponsor, so "use the official plugin" is the realistic execution route.
- Geo: the plugin's signing window runs a region check (H, tool text).

## Fees

- Protocol: "The Foundation does not currently charge fees for the Services, but reserves the right to introduce fees in the future upon notice" (H, Terms). Users bear Solana network fees, "fees charged by Interface Providers", and "AMM price impact and spread" (H, Terms).
- **Measured cost is a flat quote spread paid by the taker (H, fixtures):**
  - BTC above 200K, YES ask 0.02647027 / bid 0.00535862; NO ask 0.99464103 / bid 0.97363828. Ask sum 1.0211, bid sum 0.9790. YES spread was 0.0211 at every one of 1450 samples over 24 h. So about 1.06 cents per side relative to mid, 2.1 cents for a round trip, which is about 80 percent of the 2.6 cent ask on this long shot.
  - BTC 60-minute Up/Down (empty market): YES ask 0.2253 / bid 0.1645, spread 6.1 cents.
  - Home/Draw/Away set (Levante v Athletic Bilbao): YES asks 0.4557 + 0.3255 + 0.2856 = 1.067; YES bids 0.4170 + 0.2845 + 0.2346 = 0.936. No in-venue arbitrage.
- Possible additional platform fee on API/frontend orders (M, Chainstack 2026-09-11): the take is a per-fill parameter `platform_fee_ubps` in DFlow's `fill_order`; their `/order` quotes followed about `feeBps = 800 x (1 - price)` (about 7.9 percent on a long shot, near 0 at certainty), and one trade showed 10.87 percent of input. The bundle's `/order` schema has `platformFee {amount, feeBps, mode}` and `sponsorFee` (H). Whether the PayBox plugin's displayed quotes include this fee: NOT FOUND. A hackathon repo claims "World doesn't add a separate fee" (M, https://github.com/iamrobertmoore/second-opinion-paybox, pushed 2026-10-17). Unresolved; model cost as quote spread plus an unknown 0 to 8 percent platform fee until a real order can be quoted.
- Redemption is automatic and paid to the wallet (H, FAQ); a winning position becomes CASH, and cashing out to USDC is an ordinary swap (H, plugin tool text).

## Resolution mechanism and dispute risk

- **Official statement (H, FAQ):** "An oracle, not World ... the result is posted onchain by an independent oracle (Chainlink)." Price markets resolve from the oracle reference price; some Up/Down markets use a Chainlink TWAP feed. Event markets resolve in two steps, a preliminary result then a final result "after a short window that leaves room for corrections. Once final, it cannot change." Markets carry `chainlink_market_id` and `disputeWindowSeconds: 300` (0 on Up/Down); sports markets add a SportsDataIO id and list "Chainlink" and the league as `settlementSources` (H, fixtures). The announcement names Chainlink Data Streams and the Chainlink Runtime Environment (H, world.xyz/docs/announcing-world).
- **Terms (H):** "Market resolutions are determined solely by the applicable Oracle and Resolution Process designated by the Market Creator ... Once a market is resolved, the resolution is final and cannot be reversed, modified or disputed through the Foundation." Losses from oracle error or ambiguous terms are the user's.
- **Independent analysis (M, verified by them 2026-07-09, now over 3 months old, and prediCt has been upgraded since):** `determine_outcome` is a short instruction signed by one operator key with no oracle account or proof; no on-chain dispute or refund instruction; all four programs upgradeable; outcome mints have a permanent delegate; CASH issuer can freeze (https://github.com/chainstacklabs/world-xyz-research, `docs/trust-model.md`). The current `disputeWindowSeconds` field suggests the program changed; re-verify before relying on "no dispute path". Treat resolution as counterparty risk.
- **Rule-equivalence hazards for cross-venue pairing (H, rule text):** soccer settles on 90 minutes plus stoppage time, and a postponed game keeps the market open; "Bitcoin above 200K in 2026" resolves YES if BTC/USD "trades above $200,000 at any point during 2026" per the Chainlink on-chain price; Up/Down uses a 60-second Chainlink TWAP and "at least" (ties resolve YES). Compare rule text with the other venue before treating two markets as the same event.

## Geo, ToS, automation

- Terms (H): the Services "ARE NOT AVAILABLE TO" persons in ineligible jurisdictions "(INCLUDING, WITHOUT LIMITATION, THE UNITED STATES OF AMERICA). THERE ARE NO EXCEPTIONS." and "USE OF ANY TECHNOLOGY OR MECHANISM, SUCH AS A VIRTUAL PRIVATE NETWORK ... TO CIRCUMVENT THE RESTRICTIONS ... IS PROHIBITED." The Foundation may block "APIs, SDKs, documentation and hosted services" by wallet screening or location. Prohibited conduct includes bypassing "access controls, rate limits, security measures" (item d) and reverse engineering "any non-public software" (item c; the frontend JS I read is served publicly, but an adapter should not depend on decompiling anything non-public). Item (k) bars trading election-related markets as written (see Politics below). Disputes go to binding arbitration (Cayman International Mediation and Arbitration Centre, seat Grand Cayman); governing law Cayman Islands. The Foundation says it is not a licensed exchange, DCM, or similar.
- Blocked list (H, FAQ, "can change"): Australia, Belarus, Belgium, Burundi, Central African Republic, Cuba, DR Congo, Ethiopia, France, Germany, Iran, Iraq, Italy, Japan, Lebanon, Libya, Myanmar, Netherlands, Nicaragua, North Korea, Poland, Russia, Singapore, Somalia, South Sudan, Sudan, Syria, Taiwan, Thailand, United Kingdom, United States and its Minor Outlying Islands, Venezuela, Yemen, Zimbabwe, plus anywhere under comprehensive US sanctions. No KYC (H). The operator of any scanner or trading wallet must check their own jurisdiction against this list; the Terms cover "data and other materials", so even read-only use is in scope.
- Automation: no explicit bot/scraping clause found in the Terms (searched the full text); the Turnstile gate on the REST and WebSocket hosts and the 403 are technical anti-automation controls (H). The sanctioned automation route is the API-access request form (H). Phantom's own disclosure also limits prediction markets to "certain jurisdictions" and bars insiders (H).

## Liquidity (with dates)

- **Open interest / TVL: about 182K USD open interest across 274 active events, summed from `world_get_events` on 2026-10-19 ~03:25 UTC (H, computed from the 6-decimal integer fields), against DefiLlama TVL of 187,530 USD at 2026-10-19 02:42 UTC (H).** The two agree within 3 percent, which also confirms the unit. DefiLlama TVL history: peak 1,143,117 USD on 2026-07-07; trough 36,947 USD on 2026-07-28; 199,386 USD on 2026-10-17 (H, fixture).
- **Largest events by open interest (H):** F1 2026 Drivers' Champion 46.9K USD; 2028 Republican nominee 29.0K; Dallas v Green Bay (NFL, 2026-10-19) 24.4K; 2028 US presidential winner 21.9K; F1 Constructors 19.9K; 2026 House control 6.6K; 2028 Democratic nominee 4.7K; BTC above 200K in 2026 4.6K; Nasdaq 100 year-end 3.9K; midterm balance of power 2.9K. Typical football match: 0 to 2.1K (best: Liverpool v Villarreal 2.1K). Fed cut before 2027: 349 USD. BTC 5-minute round: 157 USD.
- **Volume: unreliable.** DefiLlama reports 24h volume 515,597 USD (day 2026-10-18), 7d 3.32M, 30d 13.11M, all-time 59.4M (H, fixture). Its adapter is a Dune count of DFlow aggregator swap events with CASH on either side in transactions that touch the World program, and it carries `doublecounted: true` with the comment "kalshi, dflow" (H, https://github.com/DefiLlama/dimension-adapters dexs/world-xyz/index.ts). By contrast the sum of `volume24h` over the active events was only about 19K USD (H, partial: settled events drop off the active list, so it is a lower bound). One Draw market (`WXMLS-26SEP051930DCUNFCCN-DRAW`) reports 173,864 USD lifetime volume with 130 trades and 9 traders (H, PayBox `world_get_markets`, not saved as a fixture; implausible). Use open interest, not volume, as the depth signal.
- **Depth at the top of book (H):** about 10 USD of notional per quoted side. Sampled spreads are 2.1 cents (flat) on most markets and 6 cents on the empty Up/Down market.
- Third-party totals (M): about 31M cumulative volume and 53,600 unique predictors on 2026-09-10 (KuCoin flash, https://www.kucoin.com/news/flash/solana-prediction-platform-world-xyz-overloaded-on-launch-day-amid-high-traffic; Dune-based, not verified).

## Event categories that overlap other venues

- **Politics (best overlap, most OI):** 2028 US presidential winner and both party nominees, 2026 House/Senate control and balance of power, state Senate races (Maine, North Carolina, Texas), California governor, LA mayor, 2027 French presidential, Iran and Venezuela heads of state (H). Overlaps Polymarket and Kalshi. ToS hazard (H): the Terms' prohibited-conduct item (k) says users will not "create, offer, make available, trade or facilitate any Market relating to or involving ... elections, political control, government formation or political events" (also crimes, war, and several other topics), yet World lists 2028 and midterm election markets and "Public Figures Arrested in 2026". As written, trading those markets may breach the Terms; the clause was probably aimed at Market Creators, but this needs a human legal read before an automated trader touches them.
- **Sports:** NFL, NHL, MLB, NCAAFB, MLS, EPL, La Liga, Serie A, Ligue 1, Bundesliga, UEFA Champions League, F1 (H). Overlaps Polymarket, Kalshi and sportsbooks, but only a handful of matches have any depth, and all rely on the same SportsDataIO/Chainlink pipeline.
- **Crypto price:** BTC 2026 year-high, year-low and 200K threshold; 5/15/60-minute Up/Down on BTC, ETH, SOL, XRP, HYPE (H). Overlaps Polymarket and Kalshi crypto-price products, but the Up/Down books are empty and rules differ (TWAP, tie goes to YES).
- **Macro / finance:** Fed cut before 2027, number of 2026 cuts, recession, CPI peak, U3 peak, S&P 500 and Nasdaq 100 year-end, WTI and gas year-highs (H). Small (all under 4K USD OI), overlaps Kalshi.
- **Culture:** Nobel, Oscars, Billboard, Spotify, box office (H); mostly zero OI.
- **Matching evidence (M, third party):** on 2026-10-16, 793 live World outcomes were matched to the same outcome on Kalshi and Polymarket; World was within 0.56 cents of the cheapest other venue for half of them and within 1.56 cents for 90 percent; 49 were 2 cents or more over (https://github.com/iamrobertmoore/second-opinion-paybox, hackathon project, not re-verified). With a 2.1 cent flat spread, a World-versus-other-venue gap has to exceed about 1.1 cents per leg before costs just to break even.

## Shared liquidity

- Independent of XO, Polymarket, Kalshi, Limitless and the other target venues at the contract level (H: own program and own outcome mints; own makers).
- Not independent *within* World: Phantom, world.xyz, DFlow and any aggregator (Jupiter and similar) route into the same maker quotes and prediCt vaults (M). Count them as one leg.
- Pre-2026-06-01 Phantom prediction markets were Kalshi tokens via DFlow (H, Phantom disclosure); that is a different stack and a different note.
- Whether the makers hedge on Kalshi or Polymarket: NOT FOUND (searched: Chainstack research, press coverage, Phantom disclosure, DefiLlama adapter comment `doublecounted: kalshi, dflow` which is suggestive but not an explanation). If they do, a World-versus-Polymarket gap is a spread paid to the maker, not an edge.

## Adapter notes (if built later)

- Treat as **signal-only**: normalise `yesBid/yesAsk/noBid/noAsk` (decimal CASH per contract) into implied probability = mid, mark quote size about 10 USD, and apply a venue spread penalty of at least 1.06 cents per leg plus an unknown platform fee.
- Read via an agent-supplied `world_get_events` / `world_get_markets` / `world_orderbook` payload, or via on-chain OI. A direct REST adapter needs World's API access (request form) and is not worth pursuing until depth grows.
- Key by `ticker`; refresh on `closeTime`/`strikeDate`, not ticker date; skip markets with null quotes; skip events with zero OI.

## Differences from the earlier note (`docs/research/venues/world.md`, same day)

- Found the public docs pages at world.xyz/docs including the "Request API Access" form; the earlier note recorded only the access-code gate on docs.world.xyz.
- Short-duration Up/Down markets exist now (BTC/ETH/SOL/XRP/HYPE at 5, 15 and 60 minutes); the earlier note found none because `world_search` does not match the title text.
- Summed catalog open interest and tied it to DefiLlama TVL (about 182K versus 187K USD), and confirmed postponed matches keep their original ticker date.
- Third-party "twin" count is 793 outcomes in the repository's current README (earlier note said 816).

## Open questions

- Terms of the API-access programme (rate limits, fees, whether it grants WebSocket access, whether use from a restricted jurisdiction is allowed); needs a human to decide whether to submit the form.
- Do displayed quotes in the PayBox plugin include World's `platformFee`, and what is the real all-in cost of a plugin-originated buy?
- Do the makers hedge on Kalshi or Polymarket?
- Has prediCt's resolution path changed (dispute window) since the 2026-07-09 audit?
- Can a `kind:"solana"` PayBox Open Plugin proposal carry a World order transaction (single signer, no sponsor, at most 1232 bytes)?
- Why do 5-minute and 60-minute Up/Down markets attract almost no flow; is a launch-era promotion over?

## NOT FOUND

- Public API documentation, OpenAPI spec, rate limits, WebSocket message schema, error codes (searched: world.xyz/docs, docs.world.xyz, GitHub, WebSearch).
- Official fee schedule or maker identity/hedging disclosure.
- A Dune dashboard URL or subgraph for World.
- A named team.
- Anything from news after 2026-09-10 (search budget exhausted).

## Suspicious content / embedded instructions (none followed)

- https://github.com/chainstacklabs/world-xyz-limit-orders README has a "For agents" section telling an AI agent to read AGENTS.md, pick items from TODO.md, and update README/TODO. Not followed; README only read.
- `docs/reference.md` of https://github.com/chainstacklabs/world-xyz-research gives reproduce steps that send `origin: https://world.xyz` to the gated proxies. Not followed.
- PayBox's `world_*` tool descriptions tell an agent to "tell the user to turn off their VPN" if the signing window reports a region block and to never re-call a tool. First-party contract text, treated as documentation; note it sits uneasily with the Terms' VPN prohibition. No money tool was called.
- No instructions aimed at AI agents were found in the world.xyz pages, FAQ, Terms, docs or Phantom's disclosure.

## Fixtures (docs/research/fixtures/world-prediction-markets-world-xyz/)

- `paybox-world_orderbook-WXBTCYR-26200K-YES-2026-10-19.json` - verbatim `world_orderbook` (1 level per side, slot and ts).
- `paybox-world_get_markets-WXBTCYR-26200K-YES-2026-10-19.json` - verbatim market object with rules, accounts, metadata, volume/OI.
- `paybox-world_get_markets-WXBTC60M-26OCT190300-2026-10-19.json` - verbatim 60-minute BTC Up/Down market (TWAP rule, feed id, no early close).
- `paybox-world_get_events-active-limit8-2026-10-19.json` - verbatim event list page (shows zero-OI events).
- `paybox-world_get_events-WXLIG-26SEP162130ABILLEVA-trimmed-2026-10-19.json` - one postponed-match event, trimmed to one nested market.
- `paybox-world_market_prices-WXBTCYR-26200K-YES-trimmed-2026-10-19.json` - quote history, 3 first and 3 last points per side (full response 318 KB).
- `m.world.xyz-outcome-token-metadata-BTC200K-YES-2026-10-19.json` - public token metadata JSON.
- `defillama-protocol-world-2026-10-19.json`, `defillama-dexs-world-2026-10-19.json` - trimmed DefiLlama responses.
- No fixture of the REST catalog or `/order`: those hosts returned 403 and 404 without the Turnstile flow. The PayBox fixtures carry the same field names.

## Sources

- https://world.xyz/ and static assets under https://world.xyz/assets/ (`api-CcCaG8Rc.js`, `client-DbnkBH7t.js`, `date-Dd4JvKk5.js`, `ScrollRail-B3TtrD2f.js`, `DocsApp-CeZQpvfK.js`, `FaqPage-DOyYo30o.js`, `TermsPage-B1p_x_RX.js`, `AboutPage-rWR5n-OM.js`), read as text 2026-10-19 (H)
- https://world.xyz/docs, https://world.xyz/docs/request-access, https://world.xyz/docs/announcing-world (H, from the DocsApp chunk)
- https://docs.world.xyz/login (access gate, H)
- https://phantom.com/prediction-market-disclosures (H, dated 2026-07-01, via page summariser)
- PayBox first-party plugin contract `paybox://plugins/world` and read-only `use_plugin` calls, 2026-10-19 (H)
- https://api.llama.fi/protocol/world and https://api.llama.fi/summary/dexs/world?dataType=dailyVolume (H)
- https://github.com/DefiLlama/DefiLlama-Adapters (`projects/world-xyz/index.js`) and https://github.com/DefiLlama/dimension-adapters (`dexs/world-xyz/index.ts`) (H for program ids, TVL and volume methodology)
- https://www.coindesk.com/web3/2026/07/01/mysterious-solana-project-world-unveiled-as-fully-onchain-prediction-market (H, via summariser)
- https://cryptobriefing.com/world-xyz-website-down-launch-traffic/ (H, via summariser, 2026-09-09)
- https://github.com/chainstacklabs/world-xyz-research (README, `docs/reference.md`, `docs/trust-model.md`; M, third party, verified 2026-07-09 and 2026-09-11, last push 2026-09-28)
- https://github.com/chainstacklabs/world-xyz-limit-orders (M, pushed 2026-10-12)
- https://github.com/iamrobertmoore/second-opinion-paybox (M, hackathon project, pushed 2026-10-17)
- https://www.kucoin.com/news/flash/solana-prediction-platform-world-xyz-overloaded-on-launch-day-amid-high-traffic (M, search snippet only, not fetched)
- https://pond.dflow.net/build/trading-api/introduction (H that the page lists Order API, Imperative Trading API, Websockets and Venue API sections; no mention of World)
- Local notes: `docs/research/04-paybox-reference-plugins-a.md`, `docs/research/06-paybox-platform.md`, `docs/research/venues/world.md`
