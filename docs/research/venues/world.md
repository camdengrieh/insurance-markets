# World (world.xyz) - venue spec

Researched 2026-10-19. Read-only: public pages, the site's own JS assets (read statically, not executed), DefiLlama public API, `gh api` raw reads of two third-party research repos, and the read-only tools of PayBox's official `world` plugin (`discover_plugins`, `get_contract`, and `use_plugin` for `world_get_markets`, `world_get_events`, `world_search`, `world_orderbook` only; no credential, wallet address, signing or money tool was touched). No accounts, no wallet connection, no POST, no Turnstile solving, no `Origin` spoofing.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

"World" here is the Solana prediction market at world.xyz (not Worldcoin / world.org). It is the venue behind PayBox's official `world` plugin (H, below).

## Verdict

- Adapter priority: **P2** (thin liquidity, no public API, geo-restricted, Solana-only; useful mainly as a read-only signal and as the one venue a PayBox Solana wallet can already trade through the first-party plugin).
- It is live and real: standalone site live since 2026-09-09 (M), integrated in Phantom since 2026-06/07 (H), live quotes timestamped two minutes before this research (H).
- Liquidity is independent of Polymarket, Kalshi and XO (own program, own makers), so it is a valid separate arbitrage leg in principle. In practice it is very thin: platform TVL about 177K USD, sampled sports markets hold 0 to 30 USD of open interest and quote about 21 contracts (about 10 USD) per side, and the embedded maker spread is about 2.1% per side (H, computed below).
- No documented public API. Docs at docs.world.xyz are behind an access code. The web app's own backends require a Cloudflare Turnstile challenge to mint an anonymous JWT (H, bundle source), so a headless scanner cannot legitimately use them. The only read paths that work for us without a browser are on-chain reads (state, not prices) and PayBox's own `world_*` read tools.
- Reconsider upward only if depth grows and World publishes a partner API or relaxes the Turnstile gate.

## Liveness (still live in 2026?)

- **Live, H.** `https://world.xyz/` returns 200 (a ~3 KB Vite SPA shell; that is why WebFetch showed only the word "world"). PayBox's official plugin returned live markets with `updatedAt` 2026-10-17 and an orderbook with `ts` 1792368774 = 2026-10-19 00:12:54 UTC (PayBox official plugin contract `paybox://plugins/world`, calls made 2026-10-19 00:13 UTC).
- DefiLlama: listed 2026-07-02, last TVL point 2026-10-18 (https://api.llama.fi/protocol/world, H).
- Timeline (M): on-chain activity from 2026-06-20; Phantom disclosure says World powers positions opened on or after 2026-06-01 (H, https://phantom.com/prediction-market-disclosures, dated 2026-07-01); public launch announcement 2026-07-01 (H, press text embedded in the site bundle); standalone site opened to a 1M+ waitlist on 2026-09-09 and went down briefly from traffic (M, https://www.kucoin.com/news/flash/solana-prediction-platform-world-xyz-overloaded-on-launch-day-amid-high-traffic).
- Team: anonymous (M, https://genfinity.io/2026/07/01/world-solana-prediction-market-chainlink-phantom/). Terms name "World Protocol Foundation, a Cayman Islands foundation company" as the protocol provider (H, site Terms page) and say the Foundation operates no website or API front end; interfaces are third-party "Interface Providers".

## Kind and market model

- Kind: on-chain complete-set (Gnosis-CTF-style) vault program plus off-chain RFQ market makers; no order book, no resting limit orders (H: site FAQ "There are no resting limit orders").
- Outcomes: binary YES/NO per market (H: `marketType":"binary"` in live data). Events group several binary markets (e.g. a football match has Home / Draw / Away markets, H). Rare scalar resolution: both tokens redeem a proportional share of 1 CASH (H, site FAQ).
- Tokenisation (M, third-party decode of program, https://github.com/chainstacklabs/world-xyz-research): each market is a 320-byte account in program `prediCtPZCttYMvm2W3PtxmMxLmT1dtN7riU6Cxh6tM` (the program id is also in H DefiLlama adapter code), with Token-2022 YES and NO mints (6 decimals) and a CASH vault. `split(N)` locks N CASH and mints N YES + N NO; `merge(N)` reverses; winners redeem 1:1. The live data publishes `accounts.<CASH mint>.{marketLedger, yesMint, noMint, isInitialized}` per market (H, fixtures). Outcome tokens carry a permanent delegate (protocol can burn or move them, M).
- Price formation (M): market makers (JanusFI, World's own; BisonFI, independent) quote off-chain through the DFlow RFQ router and fill by minting a set and keeping the other leg. Quote is the market probability; YES and NO prices sum above 1, the excess is the cost.
- Market creation: operator key only (M); Terms describe permissionless "Market Creators" but no creator path is exposed (H absence: no such tool or UI route found in the bundle).
- Market sizes seen today (H, PayBox read tools): sports (EPL, La Liga, Serie A, Ligue 1, Bundesliga, MLS, NFL, NHL, NCAAFB, plus NFL and MLB champion futures), politics (2028 US presidential winner and party nominees, 2027 French presidential), economics (Fed cut before 2027, number of cuts in 2026), crypto (Bitcoin 2026 year-high, year-low, above 200K). Short-duration BTC Up/Down rounds existed at launch (M) but searches for "BTC", "Up", "minute", "crypto", "ethereum", "Solana" returned no events on 2026-10-19 (the search may match titles only; unresolved).

## Chains and collateral

- Chain: Solana only (H: DefiLlama `chains:["Solana"]`; site and Terms say "deployed on the Solana blockchain").
- Collateral: **CASH**, mint `CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH` (H: in the site bundle and in live market data). Described as "the first stablecoin built on Bridge and Stripe's Open Issuance platform" (H, press text in the site bundle). Issuer has freeze and clawback authority (M, third-party analysis).
- Users can pay in SOL, USDC or CASH; routing converts to CASH in the same transaction (M; H that the plugin's buy takes `size` in atomic USDC units).
- Address list (M, third-party; not independently verified on-chain by me): prediCt above; JanusFI `JanusXpm3gsW3c9ErNoUgHppL8dGLvZKB7uekkJEYFP`; BisonFI `2DNbzPochEcyCcWMbL4d9S3u9QqQEj5bbe6cSZFvKsbh`; DFlow orchestrator `DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH` (H for prediCt and DFlow ids: both appear in DefiLlama adapter code).

## Read API

- `exists`: **official-authenticated** (low confidence). No public documentation: https://docs.world.xyz redirects to a login page that says "Access Restricted ... provide your access code" (H); content NOT READ. NOT FOUND (searched: docs.world.xyz, world.xyz/llms.txt and robots.txt and sitemap.xml (all return the SPA shell), `gh api orgs/world-xyz`, `gh search repos world-xyz`, WebSearch).
- What the official web app actually calls (H, read statically from https://world.xyz/assets/api-CcCaG8Rc.js and sibling chunks):
  - `https://markets-api-proxy.world-xyz.workers.dev/api/v1` (catalog; REST) and `wss://markets-api-proxy.world-xyz.workers.dev/api/v1/ws` (WebSocket; message format not read).
  - `https://aggregator-api-proxy.world-xyz.workers.dev` (`GET /order`, `POST /submit`).
  - `https://users-api.world.xyz/api/v1` (per-user data; not probed).
  - `https://m.world.xyz/<mint>` outcome-token metadata JSON (M; 404 on the root, per-mint paths not probed; 404s after a market closes per third party).
  - RPC `https://orb.helius.dev` (the app's Solana RPC).
- **Access gate (H, `client-DbnkBH7t.js`):** requests to the first three hosts go through a wrapper that obtains an anonymous bearer JWT by rendering a Cloudflare Turnstile widget and `POST {base}/auth/token` with `x-turnstile-token`; the WebSocket takes `?token=<jwt>`. A plain unauthenticated `GET https://markets-api-proxy.world-xyz.workers.dev/api/v1/markets?limit=3` on 2026-10-19 00:11 UTC returned HTTP 403, empty body, with `access-control-allow-origin: https://world.xyz` and `access-control-allow-headers: Content-Type, Authorization, x-turnstile-token` (H). A third-party repo (M, https://github.com/chainstacklabs/world-xyz-limit-orders, pushed 2026-10-12) says "Since October 2026 World's router only answers its own web app, which passes a Cloudflare Turnstile browser check first". An earlier third-party survey (2026-09-11) described the same hosts as "open, no key" when called with an `Origin: https://world.xyz` header; I did **not** replicate that because forging the Origin to pass an allowlist is circumventing an access control. Treat the "open proxy" finding as superseded.
- Catalog response shape (M for the REST proxy via third party; H for the identical fields through the PayBox tool, see fixtures): per market `ticker`, `eventTicker`, `title`, `status` (initialized/active/determined/finalized), `yesBid/yesAsk/noBid/noAsk` (decimal strings in CASH), `volume`, `volumeFp`, `volume24hFp`, `openInterest(Fp)`, `tradesTotal`, `trades24h`, `uniqueTraders`, `openTime`, `closeTime`, `expirationTime` (placeholder 2100-01-01), `canCloseEarly`, `disputeWindowSeconds` (300 in samples), `rulesPrimary/rulesSecondary` (template plus tokens), `metadata.chainlink_market_id`, `metadata.sportsdataio_global_participant_id` (sports), and `accounts` with `marketLedger/yesMint/noMint`. Field naming is Kalshi / DFlow-metadata style (event, series ticker, `*_fp`). Event objects: `ticker`, `seriesTicker`, `category` (sports/politics/economics/crypto), `tags`, `openInterest`, `volume`, `volume24h`.
- **Working read path for us: PayBox official plugin `world` (H).** Tools (contract read via `get_contract paybox://plugins/world` on 2026-10-19): `world_search`, `world_get_events`, `world_get_markets` (list or by `ticker`, filters `event_ticker`, `status`, `cursor`, `limit`), `world_market_prices` (YES/NO quote history, `start_ts`/`end_ts`/`resolution`), `world_orderbook` (best bid/ask and sizes by ticker or `by_mint`), `world_positions` (address), `world_filter_outcome_mints` (up to 200 mints). All read tools are annotated `readOnlyHint:true`; no credential needed. Constraint: a PayBox Open Plugin cannot call another plugin; the agent has to pass `world_*` output into our tools (see docs/research/05-paybox-reference-plugins-b.md pattern P20).
- Orderbook depth (H, one sample): single level per side, e.g. YES bid 0.44449599 x 21.489377, ask 0.4655141 x 21.489377 (slot 458629636, ts 1792368774). Real depth beyond the top quote: NOT FOUND (quotes are RFQ; third party says no live quote is posted on-chain, M).
- On-chain read (M, third party; DefiLlama adapter is H for the first row): `getProgramAccounts` on prediCt with `dataSize:320` lists market accounts; vault pubkey at byte offset 136 (YES/NO mints at 72/104); a flag at offset 271 marks open markets. This gives collateral and supply, not prices. I did not call Solana JSON-RPC (it is POST-only).
- Third-party market data (H): DefiLlama TVL and volume (fixtures). Nothing else found (no Dune dashboard URL verified, no subgraph).
- Auth, rate limits, pagination limits, WebSocket channels: NOT FOUND for the official hosts (gated). PayBox tool pagination is `cursor` (integer offset) with `limit`; the first page is ordered by volume only within the page (H, tool text).

## Trade path

- **Official, via PayBox (H).** `world_buy_outcome` (`credential_id`, `market_mint`, `size` exact-in in atomic USDC units, optional `slippage_bps`, `value_cents`), `world_change_position` (`side` buy|sell), `world_redeem` (only needed for settled positions). Solana wallet credentials only; "PayBox pins the buyer and sender from the credential". "Approval follows the grant: autonomous returns `pending_signature`, while approval-gated returns `pending_approval`", then poll `get_request`. The tool text includes a region-block step in the signing window. These are state-changing tools; I did not call them.
- **Web app protocol (H, read from `ScrollRail-B3TtrD2f.js`):**
  1. `GET {aggregator}/order?inputMint&outputMint&amount&slippageBps&prioritizationFeeLamports=auto&dynamicComputeUnitLimit=true[&userPublicKey]` returns `{executionMode: "sync"|"async", inputMint, inAmount, outputMint, outAmount, slippageBps, lastValidBlockHeight, routePlan?[{venue,...}], transaction (base64), orderToken, sponsorFee?{mint,amount}, platformFee?{amount,feeBps,mode}|null}`. Error body `{code, msg}`; codes seen: `simulation_failed`, `invalid_order_token`, `sponsorship_unavailable`, `send_failed`, `simulation_unavailable`.
  2. The wallet signs the returned transaction (Solana `signTransaction`, ed25519; no EIP-712).
  3. `POST {aggregator}/submit {transaction: <signed base64>, orderToken}` returns `{signature}`; World's backend submits (gas can be sponsored).
  There is no signed-order or order-book object; the signed artifact is a Solana transaction built by the server, bound to an `orderToken`.
- **Permissionless on-chain (M, third party, mainnet-verified by them):** `prediCt.split` / `merge` are callable by any wallet at a true 1.0 basis (IDL is withheld, so a client must hand-encode instructions); buys and sells via DFlow `swap` / `swap_with_destination`; third-party Manifest order books exist for World outcome tokens and DFlow/Jupiter route to them (M, limit-orders repo). Market creation, resolution and payout are operator-only.
- No resting limit orders on World itself (H).

## PayBox reachability

- **paybox_reachable = partial.**
  - Reads: yes, through the first-party `world_*` tools, with the caveat that our plugin cannot call them itself.
  - Trades: only on a **Solana** wallet through the first-party plugin. An EVM-only PayBox wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot hold CASH or sign Solana transactions, so it cannot trade World. Funding a Solana wallet from EVM funds would be a separate swap/bridge step (not tested).
  - Our own Open Plugin: PayBox proposals support `kind:"solana"` (`transactionBase64` <= 1232 bytes, exactly one required signer who is also fee payer, no sponsor, no durable nonce, per docs/research/04-paybox-reference-plugins-a.md section 5.3, H in that note). A World order needs a Turnstile-gated quote for a server-built transaction (which may use a sponsor), or hand-encoded `split` plus a separate sale of the unwanted leg. Neither is a clean fit. Treat World execution as "use the official plugin", not "build it".
- Geo: PayBox's signing window runs a region check for World trades (H, tool text).

## Fees

- Protocol: prediCt `split`/`merge` conserve value 1:1 with no fee (M). Terms: "The Foundation does not currently charge fees for the Services, but reserves the right to introduce fees in the future upon notice" and lists AMM price impact and spread, interface-provider fees and Solana fees as the user's costs (H, site Terms).
- Trading cost is the maker spread, paid by the taker and embedded in the quote (yes+no sums above 1).
  - Measured today (H, computed from the live Liverpool-win market): YES ask 0.4655141 + NO ask 0.55550302 = 1.0210; YES bid 0.44449599 + NO bid 0.53448857 = 0.9790. So about 2.1% over par on the buy side and 2.1% under par on the sell side; buying at the ask and selling at the bid loses about 2.1 cents per contract, about 4.5% of the 0.4655 price.
  - Third-party (M, https://chainstack.com/world-xyz-vs-polymarket/, dated 2026-07-22): maker spread 2-3%. Later (M, 2026-09-11, n=37 legs): the take is a per-fill parameter (`platform_fee_ubps` in DFlow `fill_order`); `/order` quotes followed `feeBps ~ 800 x (1 - price)` (about 7.9% on a long shot, about 0.03% near certainty); one trade showed 10.87% of input. Whether the quotes above include that platform fee is NOT FOUND.
- Network: Solana fees (a fraction of a cent, H site FAQ); gasless sponsorship appears in the order schema (`sponsorFee`). Redemption is automatic and operator-paid (M). Cash-out CASH to USDC is an ordinary swap.
- Unresolved: exact fee for an API/plugin-originated order; the plugin's `value_cents` and `slippage_bps` semantics.

## Resolution mechanism and dispute risk

- Official description (H, site FAQ): "An oracle, not World ... the result is posted onchain by an independent oracle (Chainlink)". Price markets resolve from the oracle reference price (some Up/Down markets use a Chainlink TWAP feed). Event markets resolve in two steps: a preliminary result, then a final result after a short window; "Once final, it cannot change". Live data: `disputeWindowSeconds: 300` and `chainlink_market_id` on each market (H). Sports markets carry a SportsDataIO participant id (H, so the data source is likely SportsDataIO; M).
- Terms (H): "Market resolutions are determined solely by the applicable Oracle and Resolution Process designated by the Market Creator ... Once a market is resolved, the resolution is final and cannot be reversed, modified or disputed through the Foundation."
- Independent analysis (M, verified 2026-07-09 and 2026-09-11, stale risk because prediCt was upgraded since): `determine_outcome` is a 10-byte instruction signed by one operator key with no oracle account or proof; no on-chain dispute or refund instruction; all four programs upgradeable; token mints have a permanent delegate; CASH issuer can freeze. Source: https://github.com/chainstacklabs/world-xyz-research (docs/trust-model.md). Treat as counterparty risk, not trustless.
- Rule-equivalence hazards for arbitrage: soccer markets settle on 90 minutes plus stoppage, "if postponed, remains open until completed" (H, rules text); political markets resolve on "a consensus of media calls ... or whoever is inaugurated" with early determination possible (H, 2028 winner rules); all differ in wording and edge cases from Polymarket and Kalshi. Compare rule text before pairing.

## Geo, ToS, automation

- Terms (H): the Protocol "WERE NOT DEVELOPED FOR, MAY NOT BE USED BY, AND ARE NOT AVAILABLE TO" persons in ineligible jurisdictions "(INCLUDING, WITHOUT LIMITATION, THE UNITED STATES OF AMERICA). THERE ARE NO EXCEPTIONS." and "USE OF ANY TECHNOLOGY OR MECHANISM, SUCH AS A VIRTUAL PRIVATE NETWORK ... TO CIRCUMVENT THE RESTRICTIONS ... IS PROHIBITED". Operating from inside a restricted territory is itself prohibited. The Foundation may block "APIs, SDKs, documentation and hosted services" by wallet screening or location. Disputes: binding arbitration, Cayman International Mediation and Arbitration Centre, seat Grand Cayman, one-year limit.
- Blocked list (H, site FAQ, may change): Australia, Belarus, Belgium, Burundi, Central African Republic, Cuba, DR Congo, Ethiopia, France, Germany, Iran, Iraq, Italy, Japan, Lebanon, Libya, Myanmar, Netherlands, Nicaragua, North Korea, Poland, Russia, Singapore, Somalia, South Sudan, Sudan, Syria, Taiwan, Thailand, United Kingdom, United States (and Minor Outlying Islands), Venezuela, Yemen, Zimbabwe; plus anywhere under comprehensive US sanctions. No KYC (H). Whoever operates the scanner or trades must check their own jurisdiction against this list.
- Automation: no explicit bot/API clause found in the Terms (searched the full Terms text for "bot", "automated", "scrap", "API"); but the Turnstile gate and the Cloudflare 403 on `api.world.xyz` are technical anti-automation controls (H). Phantom's disclosure says prediction markets are "only available ... in certain jurisdictions" and bars insiders (H).

## Liquidity (with dates)

- TVL (CASH held in market vaults): **177,491 USD on 2026-10-18** (H, DefiLlama; peak 1.14M on 2026-07-07, trough 36.9K on 2026-07-28, 199K on 2026-10-17, 190K at 2026-10-18 00:00). Trend since July is down from the peak and up from the late-July low.
- Reported volume: DefiLlama 24h 493,988 USD (day 2026-10-17), 7d 3.18M, 30d 13.06M, all-time 58.9M (H, https://api.llama.fi/summary/dexs/world). **Treat as an upper bound (M):** it is a Dune count of DFlow swap events with CASH as an input or output in transactions that touch the World program, so on-ramp and cash-out legs and any multi-leg route can be counted along with the trade. It does not reconcile with the catalog: sampled event lifetime volumes today are tiny (NFL Champion about 26 USD, Bitcoin above 200K about 3.4K USD, 2028 Republican nominee about 6.4K USD, if volume is 6-decimal CASH; unit is inferred, M, but it ties to TVL). Third-party Dune figure (M, KuCoin 2026-09-10): about 31M total volume and about 53.6K unique predictors; on-chain user-settings accounts 29,674 on 2026-09-11 (M).
- Depth (H, 2026-10-19): sampled markets quote about 18-21 contracts per side (about 10 USD). Sampled open interest: Liverpool v Brighton 29 USD (one market), NFL Champion 150 USD (event), 2028 US presidential winner 21.9K USD (event), 2028 Republican nominee 29.0K USD (event), Fed cut before 2027 349 USD (event). Most of the 52 events I paged through (soccer, NHL, NFL match markets) had zero volume and zero open interest.
- Spread (H): 2.0-3.1 cents on sports samples; much wider on political long shots (Donald Trump Jr. 2028 winner YES bid 0.0034 / ask 0.0156, record `updatedAt` 2026-07-20, so possibly stale).

## Event categories that overlap other venues

- Sports: EPL, La Liga, Serie A, Ligue 1, Bundesliga, MLS, NFL, NHL, NCAAFB, plus NFL and MLB champion futures (H). Strong overlap with Polymarket, Kalshi and Overtime-style books, but the markets have near-zero depth.
- Politics: 2028 US presidential winner and nominees (H, 2027 French presidential has no volume). Overlaps Polymarket and Kalshi; most liquid World category by open interest.
- Crypto price: Bitcoin 2026 year-high, year-low, 200K threshold (H); launch-era short Up/Down rounds not found today.
- Macro: Fed cut before 2027, number of 2026 cuts (H), small.
- Matching evidence (M): a third-party PayBox plugin reports 816 World outcomes matched to Kalshi and Polymarket twins (snapshot 2026-10-16) and a median World premium of 0.56 cents (p90 1.6 cents) over those venues (docs/research/05-paybox-reference-plugins-b.md, from https://github.com/iamrobertmoore/second-opinion-paybox; not re-verified). That implies World tracks the larger venues' prices and offers little independent information; any gap has to clear the 2.1% per side spread above.

## Shared liquidity

- Independent of XO, Polymarket, Kalshi, Limitless and the others (H: own program and own outcome mints; own makers).
- World's own liquidity is shared across its access paths: Phantom, world.xyz, DFlow, Jupiter-style aggregators and any Manifest books all route into the same JanusFI / BisonFI quotes and prediCt vaults (M). Do not count those as separate legs.
- Pre-2026-06-01 Phantom prediction markets were Kalshi tokenised through DFlow (H, Phantom disclosure); that stack is separate from World and not part of this venue.
- Whether the makers hedge on Kalshi or Polymarket: NOT FOUND (searched: Chainstack research, press coverage, Phantom disclosure). If they do, World's price is a derivative of those venues and a World-vs-Polymarket "arb" would be a spread paid to the maker.

## Open questions

- Is there a partner or API-key route behind docs.world.xyz? Contact needed; the page is access-code gated.
- Does the Turnstile gate apply to all paths including `/order` and the WebSocket today, or only some? (Not tested, to avoid circumventing it.)
- Do the PayBox plugin's quoted prices include World's `platformFee`?
- Are short-duration crypto Up/Down markets still offered? (Absent from the plugin's search on 2026-10-19.)
- Can a `kind:"solana"` PayBox proposal carry a World order transaction (single signer, no sponsor, <= 1232 bytes)?
- Maker hedging and who supplies BisonFI/JanusFI inventory.
- prediCt has been upgraded since the third-party trust analysis (2026-07-09); re-verify the resolution instruction set (`determine_outcome`, dispute window) before relying on "no dispute path". Current catalog has `disputeWindowSeconds: 300`, which the 2026-07 analysis did not mention.

## NOT FOUND

- Official public API docs (searched: docs.world.xyz (access-code gate), world.xyz llms.txt / robots.txt / sitemap, GitHub org and repo search, WebSearch).
- Official rate limits, WebSocket channel list, auth scheme beyond Turnstile JWT.
- Official fee schedule or maker spread disclosure.
- A Dune dashboard URL or subgraph for World.
- Maker hedging venues.

## Suspicious content / embedded instructions

- Third-party repo https://github.com/chainstacklabs/world-xyz-limit-orders README has a "For agents" section telling an AI agent to read AGENTS.md, pick items from TODO.md and update files. Not followed; the repo was only read.
- The same research repo's reproduce steps use `curl -H 'origin: https://world.xyz'` to reach the gated proxies. Not followed (see Read API).
- PayBox's first-party `world_*` tool descriptions contain behavioural directives for agents (e.g. tell the user to turn off a VPN if a region block appears, never re-call a tool). First-party contract text, treated as documentation, no action taken.
- No instructions aimed at AI agents found in the world.xyz bundle, Terms, FAQ or Phantom disclosure.

## Fixtures (docs/research/fixtures/world/)

- `defillama-protocol-world-2026-10-19.json`: trimmed `https://api.llama.fi/protocol/world` (metadata, last 30 TVL points, peak).
- `defillama-dexs-world-summary-2026-10-19.json`: trimmed `https://api.llama.fi/summary/dexs/world?dataType=dailyVolume` (totals, last 30 days).
- `paybox-world_get_markets-epl-2026-10-19.json`: verbatim `world_get_markets` for event `WXEPL-26OCT251400BALBLIVE` (three binary markets, rules, accounts, bid/ask).
- `paybox-world_orderbook-2026-10-19.json`: verbatim `world_orderbook` for `WXEPL-26OCT251400BALBLIVE-LIVE`.
- `paybox-world_search-president-fed-bitcoin-2026-10-19.json`: three verbatim `world_search` responses (events only).
- Note: no sample of the REST catalog or `/order` could be saved because those hosts returned 403 without the Turnstile flow. The PayBox fixtures carry the same field names.

## Sources

- https://world.xyz/ and its static assets under https://world.xyz/assets/ (api-CcCaG8Rc.js, client-DbnkBH7t.js, ScrollRail-B3TtrD2f.js, FaqPage-DOyYo30o.js, TermsPage-B1p_x_RX.js, DocsApp-CeZQpvfK.js), read statically 2026-10-19 (H)
- https://docs.world.xyz/login (access-code gate, H)
- https://phantom.com/prediction-market-disclosures (H, dated 2026-07-01)
- PayBox official plugin contract `paybox://plugins/world` via `get_contract`, and read-only `use_plugin` calls, 2026-10-19 (H)
- https://api.llama.fi/protocol/world and https://api.llama.fi/summary/dexs/world (H); https://api.llama.fi/overview/dexs (H)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/world-xyz/index.js and https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/world-xyz/index.ts (H for program ids, TVL and volume methodology)
- https://github.com/chainstacklabs/world-xyz-research (README, docs/reference.md, docs/trust-model.md; M, third party, verified 2026-07-09 / 2026-09-11)
- https://github.com/chainstacklabs/world-xyz-limit-orders (M, pushed 2026-10-12)
- https://chainstack.com/world-xyz-vs-polymarket/ (M, 2026-07-22)
- https://genfinity.io/2026/07/01/world-solana-prediction-market-chainlink-phantom/ (M, 2026-07-01)
- https://www.kucoin.com/news/flash/solana-prediction-platform-world-xyz-overloaded-on-launch-day-amid-high-traffic (M, 2026-09-10)
- https://thedefiant.io/news/markets/world-xyz-opens-solana-prediction-market-to-1m-person-waitlist-with-chainlink-powering-resolution (M, search snippet only, not fetched)
- Local notes: docs/research/05-paybox-reference-plugins-b.md, docs/research/04-paybox-reference-plugins-a.md, docs/research/06-paybox-platform.md (M)
