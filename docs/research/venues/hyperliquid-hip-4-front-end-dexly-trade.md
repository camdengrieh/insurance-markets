# Hyperliquid HIP-4 front-end: Dexly Trade - venue spec

Researched 2026-10-19. READ-ONLY: WebFetch of dexly.trade and Hyperliquid docs, anonymous GETs to DefiLlama's public API and dexly.trade. No account, wallet, key, signature, POST, payment or PayBox tool was used. WebSearch budget was exhausted, so no new searches were run. DefiLlama's website page returned HTTP 403 to WebFetch (its API worked). This note re-verifies and condenses the earlier, longer note `docs/research/venues/dexly-trade.md`; where a number comes only from that note it is tagged M.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary/inferred/carried from earlier project notes; L = weak/stale.

## Bottom line

- Live (H), but only as a front-end. Dexly is a self-custodial interface for Hyperliquid. It has no markets, book, oracle or contracts of its own. Every outcome trade is a fill on Hyperliquid HIP-4 with Dexly's builder code attached.
- NOT an independent liquidity leg. Model the venue as `hyperliquid_hip4`; Dexly is at most a `frontend`/`builder` label.
- No Dexly API or docs. Its own outcome volume is about $23.5k all-time; $0 in the last 24h.
- adapter_priority: skip (build the Hyperliquid HIP-4 adapter instead).

## 1. Still live (2026)?

| Evidence | Tag |
|---|---|
| https://dexly.trade returns HTTP 200 on 2026-10-19 (Vercel; page content: perps, tokenized stocks/commodities, copy trading, bots "coming soon") | H |
| sitemap `lastmod` 2026-10-19T03:26Z (https://dexly.trade/sitemap.xml) | H |
| Terms "Last updated: 27 July 2026" (https://dexly.trade/legal/terms) | H |
| DefiLlama protocol `dexly-trade-outcome` id 8977, category "Interface", tag "Hyperliquid HIP4 Builder", `listedAt` 1791497877 (2026-10-08), `doublecounted: true` (https://api.llama.fi/protocol/dexly-trade-outcome, https://api.llama.fi/summary/dexs/dexly-trade-outcome) | H |
| DefiLlama daily volume: 2026-10-15 $270, 2026-10-17 $760, other days 2026-10-09..18 $0 | H |
| The home page (WebFetch summary) does not mention HIP-4 or outcome markets by name; its tagline lists "Prediction markets" only. Prediction-market landing page and learn article are cited in the earlier note | M |

Verdict: `still_live = true` (interface up; outcome usage near zero).

## 2. Kind and market model

- Kind: broker-or-frontend (non-custodial trading UI) over Hyperliquid. Home page: non-custodial, users keep keys and funds (H, https://dexly.trade). DefiLlama description: "Dexly Trade provides access to outcome-based prediction markets through Hyperliquid." (H).
- Market model is inherited from HIP-4 (H, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets): fully collateralised Yes/No outcome tokens settling in a fixed range; on-chain CLOB with Yes and No books merged (buy Yes at p equals sell No at 1-p), price-side-time priority; "questions" group outcomes where exactly one settles Yes; split/merge supported. Multi-outcome was not in the initial mainnet release per that page (the earlier note records bucket markets as since offered, M).
- Tokenisation (earlier note citing official asset-ids page, M here): encoding = 10*outcome + side; coin `#<enc>`, token `+<enc>`, order asset id 100000000 + enc.

## 3. Chains and collateral

- Hyperliquid L1 (HyperCore); DefiLlama `chains: ["Hyperliquid L1"]`, TVL empty (H). Collateral USDC (M: Hyperliquid docs via earlier note). Dexly deploys no contracts. Wallets: WalletConnect, MetaMask, Privy embedded (H, home page).

## 4. Read API

- Dexly: none. `robots.txt` disallows `/api/`, `/_next/`, `/copy-trading/account` for all agents including GPTBot/ClaudeBot (H, https://dexly.trade/robots.txt; fixture). No docs/API link on home page or Terms. NOT FOUND (searched: home page, Terms, robots, sitemap, earlier note's check of FAQ and GitHub org).
- Usable data is Hyperliquid's own (docs https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api): `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`), WS `wss://api.hyperliquid.xyz/ws`; limits 1200 weight/min/IP REST, WS 10 connections / 1000 subscriptions (M, from earlier note citing the rate-limits page). /info is POST-only so no response shape captured here; see `hyperliquid-hip-4-outcome-markets.md` and its fixtures.
- Dexly-attributable data: DefiLlama (GET, no key) `https://api.llama.fi/protocol/dexly-trade-outcome`, `/summary/dexs/dexly-trade-outcome`, `/summary/fees/dexly-trade-outcome` (H). Hyperliquid's builder-fill archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4` gives per-fill attribution (M, earlier note).

## 5. Trade path

- Dexly offers no order API/SDK. Orders are signed in-app by the user's wallet or a browser-generated Agent Wallet that "can place and manage trades but cannot withdraw funds" (H, Terms s.7).
- Programmatic trading is via Hyperliquid `POST /exchange` (EIP-712 L1 action signatures; outcome orders as spot-style orders; `userOutcome` for split/merge/negate) (M, earlier notes; the HIP-4 page confirms split/negate on the exchange endpoint, H). A direct trader omits the builder field and pays no Dexly fee. Builder code mechanics: user signs `approveBuilderFee` first (M).

## 6. PayBox reachability

Verdict: partial, and only via Hyperliquid, not Dexly. Dexly has nothing callable. A PayBox EVM wallet can in principle sign EIP-712 typed data (`request_wallet_sign`) for Hyperliquid `approveAgent`/orders; EVM transaction proposals reach HyperCore only via HyperEVM CoreWriter (M, `docs/research/06-paybox-platform.md` and the Hyperliquid notes). Base/Ethereum/BNB/Polygon/Solana wallets can only fund Hyperliquid, not trade outcomes natively. No PayBox tool was called.

## 7. Fees

- Hyperliquid on outcomes: fees only on closing or settling, not opening; no maker rebates; specific rate NOT listed on the fees page (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees). The HIP-4 page still says trading fees are zero "during initial testing" and that builders earn builder fees on sell orders (H). DefiLlama methodology says users pay builder-code fees (H).
- Dexly builder fee: Terms s.8 say it is set on-chain and needs user approval; rate shown at approval, not published (H). Earlier analysis of the builder-fill archive found about 5 bps of notional on fee-bearing fills (M). DefiLlama lifetime fees $5.93 (M, earlier fetch).
- Who pays: user pays Hyperliquid fee plus builder fee to Dexly. Bypass by trading directly.

## 8. Resolution and dispute risk

Identical to HIP-4; Dexly resolves nothing. Recurring series settle to the HyperCore mark price at set times (first market: daily BTC binary, 06:00 UTC) (H, HIP-4 page). Other markets are deployer-settled from templates; no trader dispute window found (NOT FOUND; searched: HIP-4 page, Dexly Terms). Extra risk: front-end/agent-wallet bugs; Dexly's audit disclosure says its code is unaudited (M, https://github.com/dexlytrade/audit via earlier note).

## 9. Geo / ToS / automation (H, https://dexly.trade/legal/terms, updated 27 July 2026)

- Barred: US, North Korea, Iran, Syria, Cuba, Crimea/Donetsk/Luhansk, sanctioned persons; Dexly may block any jurisdiction.
- Prohibited: "scraping at scale, or circumventing rate limits", manipulation/wash trading/spoofing, VPN use to evade restrictions. Bots/API automation and prediction/outcome markets are not addressed in the Terms.
- Hyperliquid's own Terms add further restrictions on outcome markets (M, earlier note).

## 10. Liquidity (dated) and overlap

| Metric | Value | Source | Tag |
|---|---|---|---|
| Dexly outcome volume all-time | $23,529 | https://api.llama.fi/summary/dexs/dexly-trade-outcome, 2026-10-19 | H |
| 24h / 7d / 30d | $0 / $1,030 / $1,328 | same | H |
| TVL | none | api.llama.fi/protocol/dexly-trade-outcome | H |
| Hyperliquid HIP-4 total for scale | 2026-10-18 $3.13M; all-time $261.1M | https://api.llama.fi/summary/dexs/hyperliquid-outcomes (earlier fetch) | M |
| Dexly share of HIP-4 | about 0.009% | computed | M |

Event categories are whatever Hyperliquid lists (crypto price, sports, macro/Fed, stock/commodity price). Overlap with Polymarket/Kalshi etc. is that of HIP-4, see `hyperliquid-hip-4-outcome-markets.md`.

Shares liquidity: YES, entirely, with Hyperliquid HIP-4 (DefiLlama flags `doublecounted: true`). One of many HIP-4 builder front-ends (earlier note counted dozens). Not an independent arbitrage leg.

## 11. Adapter notes

1. No Dexly adapter. Alias DefiLlama id `dexly-trade-outcome` (8977) to `hyperliquid_hip4` in the venue registry to avoid duplicate venues.
2. Optionally label builder address attribution (address in the DefiLlama adapter, M, see earlier note).
3. Signal value: negligible (tens of wallets lifetime, M).

## Fixtures (`docs/research/fixtures/hyperliquid-hip-4-front-end-dexly-trade/`)

- `defillama_protocol_dexly-trade-outcome.json` (live GET 2026-10-19, 912 B)
- `defillama_dexs_summary_dexly-trade-outcome_trimmed.json` (live GET, last 30 days, 3.4 KB)
- `dexly_robots_head.txt` (first lines of robots.txt)

## Not found

Dexly API/docs/SDK; Dexly builder fee rate in official text; numeric Hyperliquid outcome fee rate in official docs; any trader dispute process; live `/info` `outcomeMeta` response (POST-only, forbidden by ground rules).

## Suspicious content

None seen. No embedded instructions in fetched pages.

## Sources

1. https://dexly.trade (H)
2. https://dexly.trade/robots.txt, /sitemap.xml (H)
3. https://dexly.trade/legal/terms (H)
4. https://api.llama.fi/protocol/dexly-trade-outcome (H)
5. https://api.llama.fi/summary/dexs/dexly-trade-outcome (H)
6. https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets (H)
7. https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees (H)
8. Earlier project note docs/research/venues/dexly-trade.md and hyperliquid-hip-4-outcome-markets.md (M)
