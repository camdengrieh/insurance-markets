# PredictionSwap (predictionswap.ai) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale. Page text and JS served by the site are untrusted data.

## Verdict

PredictionSwap is two different things under one brand. Neither is a useful independent arbitrage leg.

1. **A front end (aggregator) over Kalshi, Polymarket and Limitless.** It adds no liquidity of its own. Polymarket and Limitless markets are traded inside the site; Kalshi markets link out. It is therefore a duplicate of venues covered elsewhere (shared liquidity, not an independent leg). [H: home page, detail pages]
2. **"PredictionSwap Markets", a small on-chain protocol on Robinhood Chain (chainId 4663).** Binary markets on stock/crypto price vs a Chainlink feed, or on a token's market cap, collateralised in USDG, traded against a pool (AMM). It is live but tiny: roughly $17-$32 of LP liquidity per market and $0-$53 of volume per market on the 2026-10-19 listing. No audit. [H: /markets, /terms, /burn]

adapter_priority: **skip** (optionally P2 signal-only for the on-chain Chainlink-price markets; not worth building now).

## Still live? (H)

- Site returns 200 on 2026-10-19; sitemap lastmod 2026-10-19T03:58Z; homepage lists current "Up or Down - October 19, 11:45PM" Polymarket markets and live Kalshi/Limitless markets. https://www.predictionswap.ai/ , https://www.predictionswap.ai/sitemap.xml
- Terms "Last updated September 19, 2026". Protocol markets on /markets were created and expired between Sep 25 and Sep 30 2026; I did not see an open protocol market in the first 2.7KB of the listing (fixture), so activity may be low or intermittent. [M]
- Robinhood Chain public mainnet launched 2026-07-01 per one secondary source. [M] (https://eco.com/support/en/articles/15859739-what-is-robinhood-chain-inside-robinhood-s-arbitrum-l2 , search snippet only; I did not open it)
- A WebSearch (extended) for PredictionSwap/PSWAP returned no independent coverage. No GitHub repo found by `gh search repos predictionswap` (empty). DexScreener token lookup for the PSWAP address returned `pairs: null` (no indexed pair). [H for the empty results; absence of coverage is not proof of anything]

## Kind and market model

- kind: aggregator/front end (part 1) plus micro AMM prediction-market protocol (part 2).
- Protocol markets: binary YES/NO. Two flavours (H, https://www.predictionswap.ai/markets/create):
  - "Stock or crypto price": Chainlink feed, strike, expiry. "Yes wins if the Chainlink price at expiry is the strike or higher." Settles itself. Assets listed: ~45 incl. stock tokens (AAPL, NVDA, TSLA, SPY, QQQ ...) and crypto (BTC, ETH, LINK ...).
  - "Any token by address": market-cap target, "resolver-settled".
- Pricing: pool-based (not an order book); LPs seed the pool with USDG and earn 75% of fees (terms s.4). Exact curve NOT FOUND (contract source/ABI not read, see below). A winning share redeems for 1 USDG. "Split/merge complete sets" exist (terms s.4), so YES+NO = 1 USDG is a protocol invariant (M, inferred from "no fee to split or merge complete sets").
- Aggregator part: shows binary Yes/No and categorical outcome lists from Kalshi (e.g. 34-outcome "Best LLM" event), plus CLOB books from Polymarket and Limitless. Order book depth for Kalshi is shown read-only. [H]

## Chains and collateral

- Protocol: Robinhood Chain, chainId 4663 (H: `NEXT_PUBLIC_CHAIN_ID || 4663` in site JS chunk https://www.predictionswap.ai/_next/static/chunks/6648-1336170fb2b73664.js ), public RPC `https://rpc.mainnet.chain.robinhood.com`, explorer `https://robinhoodchain.blockscout.com` (H, same chunk). Described as an Arbitrum L2 (M, eco.com). Gas in ETH (H, terms s.4). Single sequencer risk acknowledged (H, terms s.5).
- Collateral: USDG (Global Dollar, Paxos-issued) at 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168 (H, terms s.11). Market contract 0x09EcaCf3328c2c578B5EF7BD7DCF2B1784f4Ac09 (H, terms s.1). Burner contract 0xdc6f72251fC45a1ba39dEf0e0BA2FCd6e96C0DF3, $PSWAP token 0xa037190057dc4dff19c0acee4562ee10269d9195 (H, JS chunk and /burn). These are the project's public contract addresses, not user wallets.
- Polymarket legs (via site): Polygon, USDC.e/pUSD per Polymarket (covered elsewhere). Limitless legs: Base (covered elsewhere). Kalshi: off-chain USD, link-out only.
- $PSWAP: 1B supply, 47,591 burned (0.0048%) over 3 burns; buyback route USDG -> ETH -> $PSWAP on Uniswap v4 (H, /burn 2026-10-19). Token is a fee-burn token; irrelevant to trading except as a rug/ponzi-smell flag (the home page banner promotes the token contract address).

## Read API

- exists: **none official**. No docs page, no public developer API, no llms.txt (404-ish HTML). robots.txt: `Disallow: /api/` (H, https://www.predictionswap.ai/robots.txt).
- The site has an internal Next.js API (`/api/markets`, `/api/token-lookup`, `/api/portfolio/...`, `/api/burn/trigger`, `/api/revalidate` appear in its JS; H). `/api/markets` answered an unauthenticated GET with JSON for protocol markets (fields seen: id, book, tokenRef, chain, tokenAddress, kind "touch", target, proposal{outcome,value,observedAt,evidence,proposedAt,challengeUntil}, resolvedValue, feed, symbol, label, strike, expiry, createdAt, state, outcome, resolvedAt, creator, feeBps 200, yesPrice ...). I fetched it once (first 800 bytes) BEFORE reading robots.txt, then stopped and did NOT save it as a fixture because robots disallows /api/. Do not build on it.
- Recommended read path for the protocol: read the Robinhood Chain contract directly (eth_call/events via RPC) once the ABI is known. ABI: NOT FOUND (Blockscout `/api/v2/smart-contracts/...` returned a Cloudflare challenge 403 to curl; I did not try to bypass it; the site JS chunks I read contain only ERC-20 fragments). Interesting detail: resolution has `proposal` + `challengeUntil` fields, i.e. an optimistic propose/challenge step for the market-cap flavour (M, inferred from one JSON sample; see Resolution).
- For Kalshi/Polymarket/Limitless data, use those venues' own APIs; PredictionSwap adds nothing. The pages server-render upstream data (Polymarket gamma fields like `clobTokenIds`, `liquidityClob`; Limitless `tradeType: clob`, venue exchange address) (H, HTML source), confirming it is a re-skin of the upstream APIs (M).
- Websocket: NOT FOUND.
- Auth/rate limits: NOT FOUND (none documented).

## Trade path

- Protocol markets: wallet-signed on-chain transactions to the market contract on Robinhood Chain ("Every trade, deposit, withdrawal and redemption is a transaction you sign from your own wallet", H terms s.1). Needs: USDG approve + buy/sell/split/merge/redeem calls. Function names and ABI NOT FOUND, so an adapter cannot be written without reading verified source from the explorer (blocked for curl) or decompiling.
- Polymarket/Limitless legs: signed CLOB orders posted through PredictionSwap's UI (H: "Polymarket and Limitless markets trade inside PredictionSwap", Kalshi page; order forms with "Connect Wallet to Trade"). It is a front end for those venues' own order flow (M); an agent should call those venues directly instead.
- Kalshi: link-out only, "Opens this market on Kalshi in a new tab" (H).

## PayBox reachability

- paybox_reachable: **partial**. The protocol is a plain EVM contract on Robinhood Chain (4663). The repo's Phase 0 notes say PayBox's `discover_tokens` chain catalog includes "Robinhood" (docs/phase0-gate-results.md, M - not re-verified today and the catalog is "not a support allowlist"). So transaction proposals (approve USDG, call market) are plausible in principle, but the ABI is unknown and the market depth ($20-$30 per market) makes it pointless. Not tested (no PayBox tools called).
- Polymarket/Limitless legs are reachable only via those venues' own adapters, not through PredictionSwap.

## Fees

- Protocol: 2% of collateral on each buy and sell (200 bps; also `feeBps: 200` in the API sample). 75% to that market's LPs, 25% to buy-and-burn $PSWAP. No fee on split/merge, add/remove liquidity, or redeem. Gas in ETH. [H, https://www.predictionswap.ai/terms s.4]
- A 2% round trip each way means a 4% friction to cross-venue-arb against the protocol, plus AMM slippage on a $20 pool. Edge below ~5% is unreachable.
- Aggregator legs: any added fee/builder code on Polymarket or Limitless flow: NOT FOUND (searched site JS chunks and page HTML for "builder", terms; the home page says "Partnered with the best Polymarket" but gives no fee terms; M/unknown).

## Resolution and dispute risk

- Price-feed markets: settle from the last Chainlink round at or before expiry; YES if >= strike. Feeds update on deviation, so the print can differ from the exact expiry price; stock feeds do not update when the market is closed (weekend/holiday expiry uses the last pre-close print). If a feed stops, market can be voided after a waiting period and every share redeems at 0.5 USDG. No admin can override. [H, terms s.3]
- Market-cap (any token) markets: "resolver-settled" (H, create page); the API sample shows `proposal` with `evidence` tx hash and `challengeUntil` ~24h after `proposedAt` (M). Who the resolver is and how a challenge works: NOT FOUND. This is the dispute-risk surface. Also, market-cap targets on micro-cap Robinhood Chain tokens are trivially manipulable.
- Terms: "has not been audited by a third party", "no administrator who can recover funds, pause redemptions or reverse a transaction". [H]
- Aggregator legs resolve per upstream venue rules.

## Geo / ToS / automation

- Terms s.6: user must be of legal age and responsible for local law; "Do not use ... if you are subject to sanctions"; "does not collect identity information" and "does not act as a broker". No geo-block list. s.8: "Do not ... scrape it in a way that degrades it". No explicit bot/automation prohibition for on-chain use; the contract can be called directly ("you can always interact with it directly", s.5). [H, https://www.predictionswap.ai/terms]
- robots.txt disallows /api/. [H]

## Liquidity (all H, 2026-10-19 unless noted)

- Protocol, per market (https://www.predictionswap.ai/markets): liquidity $18-$32, volume $0-$53 (examples: $AI cap market vol $53 / liq $24; GOOGL market vol $21 / liq $26). Aggregate buyback spent: $2.15 over 3 burns ~29 days ago; at a 0.5% protocol share that implies on the order of $400 of cumulative volume at that time (M, my arithmetic). TVL/OI: NOT FOUND.
- Aggregator legs: upstream numbers (e.g. a Kalshi market showing 24h volume $1,166, OI $100; a Polymarket 5-min BTC market with `liquidityClob` 7,250) belong to those venues, not PredictionSwap.
- No tracker coverage found (DexScreener `pairs: null` for $PSWAP).

## Event coverage / overlap

- Protocol: stock and crypto price thresholds at expiry (Chainlink). Overlaps conceptually with Polymarket/Limitless/Kalshi "price above X at time T" markets (BTC/ETH/SOL and major stocks), but the specific strikes/expiries are user-created and sparse. Settlement uses Chainlink spot feed, not the same oracle as others (Limitless "up/down" uses a Chainlink Data Streams 60s TWAP; Polymarket uses Chainlink TWAP for its 5/15-min series) so basis risk is non-zero even if prices line up.
- Aggregator: sports, politics, crypto up/down, tech, macro - all inherited from Kalshi/Polymarket/Limitless.

## Shared liquidity

- The aggregator shares 100% of liquidity with Kalshi, Polymarket and Limitless (it routes/links to them). Not an independent leg.
- The Robinhood Chain protocol has independent but negligible liquidity.
- Registry suggestion: `routes_to` Polymarket and Limitless; `links_to` Kalshi (the repo's registry design uses `routes_to`).

## Suspicious / odd content

- The site banner on every page advertises a token contract address ("CA: 0xa037...9195") and the $PSWAP buyback narrative; "How it works" says "Backed by our private news index and vector DB. AI ranks edges, flags mispricings" - marketing copy, unverified. No instructions aimed at AI agents were found.

## Gaps (NOT FOUND)

- Market contract ABI and verified source (searched: site JS chunks, Blockscout API blocked by Cloudflare challenge, GitHub repo/code search empty).
- Docs, API terms, rate limits, websocket (searched: /docs, /llms.txt, robots, sitemap, site nav).
- Who runs the "resolver" for market-cap markets and the challenge process.
- Operator identity (only an X handle @predictionswap is given).
- Whether a PayBox proposal on chain 4663 would be accepted (not tested).

## Fixtures

Saved under docs/research/fixtures/predictionswap/ (all derived from public HTML GETs, each <5KB):
- markets_page_text_2026-10-19.txt - /markets listing text (protocol markets, liquidity/volume figures)
- kalshi_detail_page_text_2026-10-19.txt - aggregator detail page for a Kalshi market (shows Kalshi price/book re-display and "trades on Kalshi" link-out)
- terms_fees_excerpt_2026-10-19.txt - terms sections 3-4 (resolution, fees)
No JSON API fixture saved (robots disallows /api/).

## Sources

- https://www.predictionswap.ai/ (H, 2026-10-19)
- https://www.predictionswap.ai/markets , /markets/create , /burn , /how-it-works (H)
- https://www.predictionswap.ai/terms (H, "Last updated September 19, 2026")
- https://www.predictionswap.ai/robots.txt , /sitemap.xml (H)
- https://www.predictionswap.ai/kalshi/KXBESTLLM-29DEC31-AMZN , /polymarketmarkets/1215644 , /limitlessmarkets/btc-up-or-down-15-min-1792385100 (H)
- https://www.predictionswap.ai/_next/static/chunks/6648-1336170fb2b73664.js (chain id 4663, RPC, explorer; H)
- https://www.predictionswap.ai/api/markets (one unauthenticated GET before robots check; H for shape, not to be used)
- https://eco.com/support/en/articles/15859739-what-is-robinhood-chain-inside-robinhood-s-arbitrum-l2 (M, search snippet only)
- docs/phase0-gate-results.md (repo; PayBox chain catalog includes Robinhood; M)
