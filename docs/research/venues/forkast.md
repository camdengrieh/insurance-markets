# Forkast (forkast.gg) - venue adapter spec

Researched 2026-10-19. Read-only: public unauthenticated GETs, public JSON-RPC reads, official docs. No account, key, signing, or POST. Tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale.

## 0. Verdict

- **Live: yes (H).** Event ids created up to 2026-10-18T01:24Z, 15 events ACTIVE, and on-chain `OrderFilled` logs on the CTF Exchange up to 2026-10-18T18:26Z (sources 1, 6, 9).
- **Kind:** hybrid CLOB prediction market. Off-chain operator matching, on-chain settlement on **Arbitrum One (chainId 42161)**. The Polymarket CTF Exchange design with Gnosis Conditional Tokens, redeployed against its own collateral token ("Trading Credits"). Operator Forkast Inc. (ToS) / Community Gaming (press, 2024-25).
- **Adapter priority: P2.** Best-in-class API for its size (public, no auth, REST + Socket.IO, OpenAPI), independent liquidity, but tiny: roughly $8-15k/day organic volume, order books of tens to low hundreds of shares per level, 15 live markets, US persons excluded, ToS wording against bots, and a 1-of-1 resolver. Worth a cheap read-only adapter and as a thin "signal and spot-check" leg. Not worth building a trading leg yet.
- Esports and a few EPL/MLB markets are explicitly mapped to Polymarket events through a `polymarketUrl` field on each event (H, section 9). That makes cross-venue linking trivial and is the main reason to keep the read adapter.

## 1. Market model (H unless noted)

| Item | Finding |
|---|---|
| Structure | Event (`id`, `slug`) contains 1+ Markets (`id`, `conditionId`, `questionId`). Every market is binary (two outcomes). Multi-candidate events ("Which team will win X?") are modelled as one market per candidate, each Yes/No (confirmed live: the resolved "LoL LCK 2026 winner" event has 6 markets, each with outcomes Yes/No; 4,164 of the 4,315 non-auto events have a single market). Match-winner events use team abbreviations as the two outcome titles instead of Yes/No. There is no native categorical or scalar market, so "exactly one candidate wins" sums across the per-candidate markets must be checked by the aggregator, not assumed. Docs: "A condition can have up to 256 outcomes, but Forkast markets are binary." |
| Venue type | Order book (CLOB, price-time priority). Not AMM, not parimutuel. Docs call it "Binary Limit Order Book (BLOB)". Market and limit orders in UI; API places **limit orders only** ("Places a single limit order"). |
| Matching | Off-chain operator. Normal match, plus **mint matching** (Yes bid + No bid >= 1) and **merge matching** (Yes ask + No ask <= 1). So the Yes and No books are mirrored complements; confirmed from live books (section 4). |
| Tokenisation | Gnosis ConditionalTokens ERC-1155. Each outcome has a `tokenId` (uint256) returned by the API. Winning share pays 1.00 TC, losing 0. |
| Price grid | Price strictly between 0 and 1, max 2 decimals (tick 0.01). Amount max 2 decimals, min 1 share, min order value 0.50, max holding about $5,000 per market per user (trading-errors FAQ). |
| Outcome ordering trap | In the live sample `outcomes[0]` ("GAL") has `outcomeType: 1` and `outcomes[1]` ("SOL") has `outcomeType: 0`. The order-book endpoint takes `outcomeType`, not array position. Adapters must key on `outcomeType`/`tokenId`. |
| Collateral unit | Trading Credit (TC), 6 decimals, symbol on-chain "PC", name "Platform Credits". 1 USDC converts to 1 TC. |

## 2. Chains and collateral

- **Arbitrum One (42161) is the live chain (H).** EIP-712 domain in the signing guide uses `chainId 42161` (testnet 421614); FAQ "Which blockchain is Forkast built on? Arbitrum"; deposit page takes USDC on Arbitrum. `eth_getCode` returned non-empty bytecode for TC, CTFExchange, ConditionalTokens, Safe master copy and proxy factory at the addresses listed in the docs (fixture `onchain_checks_arbitrum_2026-10-19.json`).
- Contract addresses (docs smart-contracts page, verified to have code on Arbitrum): TC `0x4AC7b973fb4f10D94eda5Efa92fFABD6aDDFb65c`, CTFExchange `0x2D7aa09fe8a9Af205aD6E0Fef1441834c4250cdc`, ConditionalTokens `0x49598aae06f8ed6D82Cb9DFa503e731221fBf7E6`, GnosisSafe `0x3780D45DeD72BD3cfDD49D2e213E6a329E8e8Cfd`, Proxy factory `0x5c8789b886ADa0fF89Defebe27AAF954984350BF`. The same docs table links the Ronin explorer with *different* addresses; a CTFExchange at the Ronin-linked address `0x520fE655590e6feE13656590f1bE3eDf31fE099C` also has code (legacy Ronin deployment, activity not checked because the public Ronin RPC caps `eth_getLogs` at 200 blocks). Wallet-error FAQ still mentions "Ronin Waypoint". Treat Ronin as legacy and Arbitrum as current (M).
- Collateral: **TC**, a non-transferable ERC-20 (transfers only between whitelisted system contracts and from a user's EOA to their trading wallet). Deposit USDC on Arbitrum (also USDC from other chains and card via Meld/MoonPay/Stripe) converts 1:1 to TC. Withdraw TC to USDC (0.25% fee). Balance API also exposes USDT and "CGPC" fields.
- **Account wallet:** each user gets a Gnosis Safe proxy ("Trading Wallet"), 1-of-1, owned by their EOA, created via CREATE2 factory. Positions (ERC-1155) and TC sit in the Safe. A relayer pays gas; gas is only needed to move funds from the EOA to the Safe.
- TC supply on-chain: 1,624,589.6 PC at block 516182929 (2026-10-19). The TC contract itself holds only about $1,628 native USDC, so **TC supply is not provable TVL** from that contract (backing may sit elsewhere; promo and credit-code TC also exist). Do not use as TVL. (H for numbers, M for interpretation.)

## 3. Read API (official, public, unauthenticated)

- Docs: https://docs.forkast.gg (Knowledge Center + Developer Docs + API Reference). LLM index https://docs.forkast.gg/llms.txt. OpenAPI 3 at https://docs.forkast.gg/api-specs.zip (contains `openapi/forkast-api.yaml`, server `https://mgapi.forkast.gg/api/v1` "Mainnet"; only security scheme is Bearer JWT). SDKs: `@forkastgg/client` (TypeScript, MIT) and `forkast-py-client` (PyPI 0.1.0 2026-01-05, 0.2.0 2026-01-29, 0.3.0 2026-06-10; the npm registry lookup returned 404 for the scoped name).
- Base URL: `https://mgapi.forkast.gg/api/v1`. CORS `access-control-allow-origin: *`. Cloudflare in front, Express/NestJS behind.
- **Confirmed live with unauthenticated GET (H), fixtures in `docs/research/fixtures/forkast/`:**

| Need | Endpoint | Notes |
|---|---|---|
| Market list | `GET /markets?page&limit&status[]=ACTIVE` | Returns `{data:[event...], metadata:{total,totalCurrentPage,page,limit}}`. `limit=100` works (about 263 KB per page). Statuses seen: `ACTIVE`, `ENDED` (past end time, not yet resolved; meaning inferred, M), `RESOLVED`. `CANCELLED/PENDING/CLOSED` returned 0. Total 54,019 events (15 ACTIVE, 60 ENDED, 53,944 RESOLVED). Default order is newest first. |
| One event | `GET /markets/get-by-slug/{slug}` | Richer than the list: market `conditionId`, `resolvedAddress`, `outcomes[].tokenId`, `outcomeType`, `rules`, event `polymarketUrl`, `resolutionSource`, `chainlinkConfigId`. The list response omits `conditionId`, `tokenId`, `resolvedAddress`, per-market `status`/`volume`, although the docs list them. **Docs and live shape differ**; trust the fixtures. |
| Book | `GET /orderbook?marketId=&outcomeType=0|1` | `{asks:[{price,size}],bids:[{price,size}]}` strings, asks ascending, bids descending, full depth in one call. |
| Best prices | `GET /token-price?marketId=&side=` | `{data:[{outcomeId,price,side:"Sell"}], message}`. `side` "Sell" rows are the best ask per outcome. |
| Categories | `GET /category` | Active: RabbitHole(64), Esports(35), Football(39), MLB(59), Crypto(36), Gaming(43), LoL(54), CS2(55), Valorant(57), Dota 2(56). Note the response content-type is `text/html` though the body is JSON. |
| Trades | none public | No public trade-history endpoint in the OpenAPI spec (only per-user `/trades/volume`, `/activities/count-traded`). Trades come from the Socket.IO `market_trade_{marketId}` topic (includes `txHash`) or from on-chain `OrderFilled` logs. |
| Resolution | event/market fields `status`, `resolvedOn`, `resolvedOutcome`, `resolvedOutcomeId`, `resolvedAddress`, `resolutionSource`, `rules` | Plus `status_event` socket topic. |

- **Auth for reads: none.** The SDK constructor asks for an "API key" (`new ForkastSDK(Network.MAINNET, "YOUR_API_KEY")`) but unauthenticated REST calls work without one, and the OpenAPI has no key scheme. How a key is issued: **NOT FOUND** (searched: docs llms.txt index, SDK guide, API reference, OpenAPI).
- **Rate limits (docs, H):** 1,000 requests/min/IP global; place single order 30/s; cancel single 30/s; place bulk 8/s (max 5 orders per request); cancel-by-market 5/s; HTTP 429 with Retry-After. I made roughly 650 GETs to mgapi.forkast.gg (a 540-page crawl at about 1 req/s plus probes) without a 429.
- **Websocket:** Socket.IO at `wss://mgapi.forkast.gg` (handshake at `/socket.io/?EIO=4&transport=polling` returned `sid`, upgrades `["websocket"]`, pingInterval 25 s, maxPayload 1 MB; H). Guests get public events. Rooms: `event_{id}`, `market_{id}`, `outcome_{id}`; topics `orderbook_{marketId}_{outcomeType}`, `market_trade_{marketId}` / `market_trade`, `market_price_{marketId}_{outcomeId}_{outcomeType}`, `update_price_chart_{marketId}`, `update_volume`, `status_event`, `new_event_created`. The docs call the last orderbook path segment both `outcomeId` and `outcomeType`; the example `orderbook_1676_0` suggests outcomeType (M). I did not subscribe (no Socket.IO client run).
- Docs MCP server `https://mcp.forkast.gg/mcp` exists (docs only); not connected.

## 4. Live response shapes (2026-10-19 ~04:50Z)

- Book for market 54765 (Galions vs Solary, LoL EMEA Masters), `outcomeType=0` (SOL): asks 0.56x77, 0.57x131; bids 0.53x77, 0.52x131. `outcomeType=1` (GAL): asks 0.47x77, 0.48x131; bids 0.44x77, 0.43x131. Mirror check: SOL bid 0.53 = 1 - GAL ask 0.47; SOL ask 0.56 = 1 - GAL bid 0.44. Spread 3 cents, depth about 77 then 131 shares per side (about $35-75 per level). Identical 76/130-size ladders repeat across other markets, which looks like one in-house or incentivised market maker (M; the liquidity-rewards programme pays USDC for resting orders of 50-200+ shares).
- Event list item (abridged): `{id:"54148", title, status:"ACTIVE", volume:"478.860000", resolutionSource:"https://liquipedia.net/dota2/PARI_Universe/1", categoryIds:[35,43,56], slug, autoMarketId:null, markets:[{id:"54795", questionId:"0x..", rules, outcomes:[{id:"109589", title:"TY", price:0.87}, ...]}]}`.

## 5. Trade path

- **Programmatic trading exists (official SDK + REST).** Flow (H, docs):
  1. User signs up in the Forkast web UI with a self-managed EOA (MetaMask or Ronin wallet) and creates the Trading Wallet (Safe proxy). **"Bots cannot create wallets automatically"; "Social and Email Login methods are not allowed for automation"; keyless wallets not supported.**
  2. Login: `POST /auth` with `{address, signature, message:"Welcome to Forkast!"}` (EIP-191 style message signature by the EOA) returns `accessToken` (JWT), `refreshToken`, `walletSalt`, `proxyWallet`. Bearer token on later calls.
  3. One-time approval: a Safe `multisend` transaction (signature + `dataSign`) approving TC and Conditional Tokens, relayed by Forkast (no gas).
  4. Orders: `POST /order/place/v3` (single) or `/order/place/bulk/v1` (up to 5) carrying `tokenId, side(0 buy/1 sell), price, amount, type, expiredAt` plus the signed order. Cancel: `/order/cancel-order/{orderId}`, `.../{outcomeId}/all`, `.../market/all`. Also `/positions/redeem`, `/user/split-position`, `/user/merge-position` (Safe-signed), `/balance`, `/positions`, `/order` (list).
- **Order signing:** EIP-712, domain `{name:"CTF Exchange", version:"1", chainId:42161, verifyingContract:0x2D7a...0cdc}`, struct `Order(salt, maker, signer, taker, tokenId, makerAmount, takerAmount, expiration, nonce, feeRateBps, side, signatureType)`. `maker` = the Safe proxy, `signer` = the EOA, `signatureType = 3` (EOA signer, Safe maker), `taker = 0x0`, 6-decimal amounts. Docs tell clients to send `expiration = 0`, `nonce = 0`, `feeRateBps = 0`. **A signed order with expiration 0 never expires** (bearer-instrument risk; M, derived from the docs' own example; use `expiredAt` and cancel).
- Buy: `makerAmount = floor(amount*price*1e6)` TC, `takerAmount = floor(amount*1e6)` shares. Sell is the reverse.
- **PayBox reachability: partial.** Everything an agent must sign is an EOA `message` (login) or `typedData` (orders, Safe txs), which PayBox `request_wallet_sign` supports for any EVM domain per the project's own gate research (docs/research/06-paybox-platform.md; M, not re-tested here). The EOA is the same address on Arbitrum, which PayBox treats as one EVM address across eip155 chains (same doc, M). Funding is an ordinary USDC transfer on Arbitrum. Blockers: (a) onboarding needs a human to connect that EOA in the web UI and create the Safe; whether a PayBox MPC credential can be connected to forkast.gg (injected provider / WalletConnect) is NOT FOUND; (b) API key issuance NOT FOUND; (c) one `request_wallet_sign` per order makes ladders impractical and each order is signed typed data the signing window may not render readably; (d) US persons are excluded (section 8); (e) the USDC-to-TC convert call and ABI are not documented (NOT FOUND), so a transaction-proposal path to convert cannot be specified. Compared with Polymarket-style venues this is the same sign-then-submit pattern the plan already uses for XO, so the plugin machinery would carry over, but the account-bootstrapping step is manual.

## 6. Fees (H, docs "Fee Structure" + FAQ)

- **Trading fee 0.50% of proceeds, charged on a sell that matches (takes) liquidity; buys and makers pay no fee** ("Forkast covers all maker fees"). Example: sell 100 shares at 1 TC gives 99.50 TC.
- **Withdrawal fee 0.25%** when converting TC to USDC. Holding to resolution and redeeming 1.00 TC per winning share pays no trading fee, only the withdrawal fee later.
- Platform-wide zero-fee promotion ran Dec 2025 to Jul 2026 and has ended per the docs. Referral: referred user gets 25% off fees for 3 months; referrer earns 10% of fees for 6 months. A `positions/signature-discount` endpoint returns a signed fee-discount voucher.
- On-chain order field `feeRateBps` is 0; the fee is applied by the operator. Network gas: none for trading (relayer); gas only for EOA to Safe funding.
- Card on-ramps (MoonPay/Meld/Stripe) carry provider fees (not quantified). A per-account deposit cap exists ("You have reached the maximum amount allowed"), value NOT FOUND.

## 7. Resolution and dispute risk (H)

- Condition oracle for every market sampled is `0x896C590E30907450D6839fE10D42661A8e8C59Ca` (`resolvedAddress`, identical across all 15 active events). It is a **Gnosis Safe proxy with threshold 1 and a single owner** (eth_call `getThreshold`=1, `getOwners` length 1). So resolution is a single-key, operator-controlled `reportPayouts` with no on-chain dispute window or bond. No UMA-style or Kleros path (NOT FOUND in docs).
- Sources are named per event (`resolutionSource`): lolesports.com, valorantesports.com, Liquipedia, premierleague.com, mlb.com. Rules text is in `rules` with a Google Drive "full rules" link. Typical clause: postponed/cancelled with no reschedule within one week means "ended and shares refunded at cost".
- Cancellation/refund: Forkast may cancel or refund at its discretion (ambiguous wording, source unavailable, event not occurring, technical issue); "Redemptions may be paused"; credit-code TC is non-refundable; refunds aim for 3 business days. Docs state a refund path but no appeal; ToS has binding arbitration with Forkast Inc. only.
- **Resolution lag evidence (H, full crawl):** 14 non-auto markets are `ENDED` but unresolved, 12 of them older than 7 days, the oldest ended 2026-06-02. Plus 46 ENDED BTC/ETH up-down markets from the last week. Treat capital as potentially locked for months on edge cases.
- Auto crypto markets (BTC/ETH "Up or Down", 5 and 15 minute) resolve from a Chainlink Data Streams price per the market text ("Chainlink BTC/USD CEX Price Data Stream"; BTC 15m sample `priceFetchedValue`/`priceResolvedValue` fields present). The same stream family is used by Polymarket's equivalent markets (M, other workflow owns that fact), so these are the cleanest same-oracle arbitrage candidates. But **no new auto market has been created since 2026-10-17T09:45Z** and 46 are stuck ENDED, so the generator looks paused or broken right now.

## 8. Geo, ToS, automation

- Geo (docs FAQ, H): access restricted to "U.S. persons or individuals in the United States, Singapore, Brazil, France, Taiwan, China, Thailand, the Cayman Islands, Cuba, Iran, Syria, North Korea". Sign-up page and trading-errors FAQ list US, Singapore, France, Taiwan, China, Thailand, Cayman, Cuba, Iran, North Korea, Russia, Syria. The ToS "Restricted User" clause (extracted from the `/terms-of-service` page script, H) lists sanctioned regions, Cuba, parts of Russia/Ukraine, North Korea, Iran, Syria **and India**. The three lists disagree; the union is the safe reading. The `/user-agreement` link cited by the docs returns 404.
- Bots (ToS, H): prohibits use of "any robot, spider, or other automatic device, process, or means to access the Services for any purpose, including monitoring or copying any of the material on the Services", plus "Single Account Limitation" (one account per person; no extra wallets/emails), wash trading/spoofing/layering, and use that could "overburden ... or interfere with the Services" (a separate Agent clause bars deploying agents at a rate or volume "intended to degrade the Services"). This contradicts the public SDK/API docs that invite programmatic trading. The ToS also describes a Forkast-hosted "Agent" product (Privy-managed Agent Wallet) where the user's agent trades for them; third-party agents are not addressed. Expect enforcement discretion ("sole discretion to prohibit certain Digital Asset Wallet addresses"). Reading public market data at low rate is the only defensible use without written permission.
- Credit-code balances need "mission" completion and KYC before withdrawal.
- No contact was supplied in any request; generic User-Agent used.

## 9. Liquidity and overlap

- **API-reported cumulative volume** (field `volume`, "Total Trading Volume ($)"): sum over all 54,019 events since 2025-11-04 is $116.8M, but it is lumpy and almost certainly incentive-inflated (zero-fee promo Dec 2025 to Jul 2026, volume-based leaderboard and quest rewards; M inference). By event createdAt month: Mar 2026 $15.2M, May $18.5M, Jun $20.2M, Jul $24.9M, Aug $12.9M, **Sep $1.0M, Oct (to the 18th) $0.6M**. Largest single events: LoL LCK 2026 winner $4.5M, FIFA World Cup 2026 winner $4.3M, "Will Bitcoin hit $75,000 in 2026?" $2.6M, a single MLB game $1.9M. Aggregates in fixture `crawl_summary_2026-10-19.json`.
- **Recent run-rate:** events created in the last 7 / 14 / 30 days carry $104k / $373k / $814k of volume. On-chain check on the CTF Exchange (`OrderFilled` logs, maker-fill collateral, 2026-10-11 to 2026-10-19): about $61k in 7.8 days, daily $2.3k-17k, about $8k/day mean (M: my decoding, fixture `onchain_checks_arbitrum_2026-10-19.json`). The API figure runs about 1.9x the on-chain one for the same window, so state both. **Working estimate: $8-15k/day organic.** No settlement logs in the roughly 10 hours before the check (last log 2026-10-18T18:26Z, check at 2026-10-19T04:34Z).
- **Live inventory (15 ACTIVE):** 13 esports match markets (LoL, CS2, Valorant, Dota 2; per-market volume $0-$972), 1 EPL match (Tottenham v Coventry, $415), 1 stale MLB game. No politics, no macro currently. Sum of live event volumes about $5.2k.
- **Categories historically with overlap:** esports match winners and tournament winners (Polymarket lists these), EPL/Football and MLB game moneylines, FIFA World Cup winner, NBA Finals, BTC/ETH price-target and "price at 12:00pm ET" markets, BTC/ETH 5m and 15m up/down (49,704 auto events Mar-Oct 2026), and a few macro/tech items under "RabbitHole" (FOMC July hike $2.2M, "GPT-6 released by Dec 31" $1.6M).
- **Cross-venue link built in:** 14 of 15 active events carry `polymarketUrl` (e.g. `https://polymarket.com/esports/league-of-legends/emea-masters/lol-gal-sly-2026-10-22`). Map by that slug.
- **Independent liquidity? Yes, but weak price discovery.** Own order book, own TC collateral, own Safe-based accounts, nothing in the docs about shared liquidity (NOT FOUND). Prices look Polymarket-referenced, so Forkast is likely a price follower with a stale-quote risk, not a leader.
- **One cross-venue snapshot (H, both fetched within about 20 minutes on 2026-10-19; not executable size):** Forkast GAL (Galions) ask 0.47 x 77, SOL (Solary) ask 0.56 x 77. Polymarket "Galions vs Solary (BO5) - EMEA Masters Playoffs" moneyline: Galions bid 0.50 / ask 0.51 ($16.3k volume; event liquidity field $31.7k; series moneyline `outcomePrices` 0.505/0.495). Buy GAL on Forkast 0.47 plus SOL on Polymarket about 0.50 = 0.97, gross 3 cents per share locked if rules match, max about 77 shares (under $3 gross). Rules not compared line by line; Polymarket fees and TC conversion costs ignored.

## 10. Adapter spec (for the aggregator)

1. **Discovery:** poll `GET /markets?status[]=ACTIVE&limit=100` every 30-60 s (15 live events, tiny), then `get-by-slug` for new slugs to capture `conditionId`, `tokenId`, `outcomeType`, `polymarketUrl`, `resolutionSource`, `rules`. Canonical ids: venue `forkast`, market `marketId`, outcome `tokenId`.
2. **Quotes:** `GET /orderbook?marketId&outcomeType` for both outcomeTypes (or one and derive the complement); or Socket.IO `orderbook_{marketId}_{outcomeType}`. Prices are in dollars, sizes in shares, tick 0.01. Treat book depth below about 100 shares as non-executable at size.
3. **Staleness guard:** ignore markets with `status != ACTIVE`, with `endDate` in the past (the MLB sample is ACTIVE past its game), or with an empty/one-sided book (e.g. market 54614 shows only an ask at 0.01-0.02 on one side).
4. **Cost model:** buy 0%, sell-taking 0.50% of proceeds, TC to USDC 0.25%, $0.50 minimum order, $5,000 position cap per market, resolution risk premium: single-key resolver, discretionary refunds, unresolved backlog. Use a larger haircut for non-rule-identical markets.
5. **Resolution tracking:** poll the slug until `status=RESOLVED`; `resolvedOutcome`/`resolvedOutcomeId` give the winner. Flag `ENDED` for more than 24 h.
6. **Do not build a trade leg** until: written permission on bot use (ToS conflict), jurisdiction check, API key path, and confirmation a PayBox credential can own a Forkast Safe.

## 11. NOT FOUND / open questions

- How to obtain a Forkast API key (searched: llms.txt index, SDK guide, API reference, OpenAPI, Examples).
- Whether a PayBox MPC credential can onboard on forkast.gg (wallet-connect support), and the ABI/function for USDC to TC conversion (searched: smart-contracts page, trading-credits page, SDK guide).
- Written statement on third-party bots or arbitrage (searched: ToS script, docs). ToS text as extracted is undated.
- Deposit cap amount; fiat on-ramp fees.
- Why auto crypto markets stopped on 2026-10-17 and whether 46 ENDED auto markets will resolve.
- Whether a market maker mirrors Polymarket prices (inferred only).
- Current Ronin activity (public RPC limit).
- Live Socket.IO payloads were not subscribed to; shapes come from docs only (M).
- Press coverage found is from Dec 2024 to Jan 2025 and says Ronin plus CGX token (L, stale, more than 6 months old); a web search for 2026 news could not be run (search budget exhausted).

## Sources

1. https://forkast.gg/ and https://forkast.gg/manifest.json (H: live site; the page is a client-rendered Next.js shell, title "Prediction Market for Esports & Crypto"; manifest "Crypto, Pop Culture, and Esports").
2. https://docs.forkast.gg/llms.txt (H: full docs index) and the `.md` pages under it: introduction, platform-mechanics (+ trading-wallets, trading-credits-tc, markets-and-events, order-book, order-matching-mechanism, conditional-tokens-framework, smart-contracts, smart-contracts/security), fee-structure, faqs, faqs/trading-errors-faq, sign-up-on-forkast, refund-policy, cancelled-markets, platform-rewards/liquidity-incentives/*, developers/overview, sdk-guide (+ account/authenticate-with-key, account/approve-trading-credits, create-order-signature, rate-limits, order/*, market/*, balance), websockets (+ market-updates), api-reference/* (H, official, undated; mentions Dec 2025 to Jul 2026 promo so edited after Jul 2026).
3. https://docs.forkast.gg/api-specs.zip -> `openapi/forkast-api.yaml` (H).
4. https://forkast.gg/terms-of-service (H: text read from the page's JS chunk `/_next/static/chunks/app/terms-of-service/page-*.js`; undated).
5. https://mgapi.forkast.gg/api/v1/{category, markets, markets/get-by-slug/{slug}, orderbook, token-price} and `/socket.io/?EIO=4&transport=polling` (H, GET on 2026-10-19; fixtures saved). Full crawl of `/markets` (540 pages).
6. https://arb1.arbitrum.io/rpc (H: `eth_chainId`, `eth_getCode`, `eth_call` totalSupply/decimals/symbol/name/getThreshold/getOwners, `eth_getLogs` on the CTF Exchange) and https://api.roninchain.com/rpc (H: `eth_getCode`).
7. https://pypi.org/pypi/forkast-py-client/json (H: release dates), https://registry.npmjs.org/@forkastgg/client (404), https://api.github.com/orgs/ForkastGG (org exists; only a `.github` repo found, last push 2025-11-05).
8. https://gamma-api.polymarket.com/events?slug=lol-gal-sly-2026-10-22 (H: one public GET for the cross-venue snapshot; Polymarket itself is covered by another workflow).
9. Press, 2024-25 (L, stale): https://decrypt.co/298540/gaming-prediction-market-forkast-ethereum-ronin , https://www.blockchaingamer.biz/news/37331/forkast-prediction-market-and-its-cgx-token-launch-on-ronin/ (search snippets only, not fetched; Community Gaming, Ronin, CGX).
10. docs/research/06-paybox-platform.md in this repo (M for PayBox signing capabilities; not re-tested).

## Fixtures (docs/research/fixtures/forkast/)

`GET_category.json`, `GET_markets_page1_limit3.json`, `GET_markets_status-ACTIVE_first5.json`, `GET_markets_get-by-slug_galions-vs-solary.json`, `GET_orderbook_marketId54765_outcomeType0.json`, `GET_orderbook_marketId54765_outcomeType1.json`, `GET_token-price_marketId54765.json` (all raw API responses, trimmed only for the ACTIVE list); `crawl_summary_2026-10-19.json` and `onchain_checks_arbitrum_2026-10-19.json` (derived by the researcher, labelled as such).

## Suspicious or agent-directed content seen

- Every docs page begins with "For AI agents: the complete documentation index is at llms.txt. Append .md to any page URL for its markdown version." Benign pointer to a documentation index; I fetched `llms.txt` as a normal docs index and treated all contents as data. No other instruction was followed.
- The docs offer an MCP server (`https://mcp.forkast.gg/mcp`) for coding agents; not connected.
- A market `rules` field and descriptions contain only resolution text and a Google Drive link; no embedded instructions.
