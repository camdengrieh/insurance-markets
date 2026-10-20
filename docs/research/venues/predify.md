# Predify (predify.app, PREDIFY token on BNB Chain) - adapter spec

Researched 2026-10-19 (~01:00-01:30 UTC). READ-ONLY: unauthenticated GETs only (CoinGecko, GeckoTerminal, DexScreener, Google Registry RDAP, Telegram public preview, `gh api` reads). No account, no key, no wallet, nothing signed, no POST/PUT/DELETE. No third-party code cloned or run. Generic User-Agent `insurance-markets-research/0.1` only.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale.
Third-party text (parking page HTML, Telegram posts, token descriptions) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/predify/` (6 files, each <= 5 KB).

## 0. Verdict

**adapter_priority: skip. Venue is dead or never shipped.**

1. The official site `predify.app` is **an expired-domain parking page** ("Domain registration has expired", Namecheap) as of 2026-10-19 (H). HTTPS does not even complete a TLS handshake; only plain HTTP returns the parking template.
2. The only thing that ever demonstrably existed is a **BEP-20 memecoin on the four.meme launchpad** (PREDIFY, launched 2025-10-19) whose marketing blurb says "first hybrid oracle for large-scale on-chain prediction markets / first prediction market that rewards every outcome" (H for the blurb, as a claim). I found **no product, no docs, no API, no contracts, no repo, no market data of any prediction market**.
3. Token is functionally dormant: 24h volume $0, 0 trades in the last 24 h, market cap about $4.7-4.8K, top-10 holders own about 95.8% (H, GeckoTerminal 2026-10-19).
4. Nothing to read, nothing to trade, nothing that overlaps other venues. Not integrable.
5. Name collisions exist (see section 8); none is established as the same project. `predify.io` is a Polymarket/Kalshi tracker/front end, which by its own description would not be independent liquidity anyway.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `http://predify.app` | HTTP 200, nginx, Namecheap parking template: `<h2>Domain registration has expired.</h2>` + "Renew this domain" + auction ads; empty `<title>`/`<h1>`. Fixture `predify.app-parked-page.html` | H |
| `https://predify.app`, `https://www.predify.app`, direct-IP TLS | `curl: (35) SSL_ERROR_SYSCALL`; WebFetch "Socket is closed" | H |
| `.app` registry RDAP (Google Registry) | registered 2025-10-18T10:30Z via registrar "namecheap"; status `auto renew period` + `client transfer prohibited`; "expiration" event 2027-10-18; **last changed 2026-10-18T10:39Z**; nameservers `dns101/102.registrar-servers.com`. Reading (M): the 1-year registration lapsed on 2026-10-18 and the registry auto-renewed; the registrant may still be able to renew through the registrar, but the domain went to the "expired" parking page the same day. Fixture `rdap-predify.app.json` | H (data), M (interpretation) |
| Subdomains `docs.`, `app.`, `api.predify.app` | resolve to the same two parking IPs (wildcard); not evidence of services | H |
| Telegram `t.me/s/predifyapp` ("Predify Portal") | 209 subscribers; only 2 visible messages: "Channel created" (2025-10-18T09:23Z) and a Safeguard anti-bot verify prompt (2025-10-18T10:04Z). No announcements ever. Fixture `telegram-preview-summary.json` | H |
| X/Twitter `@predifyapp` (from CoinGecko links) | WebFetch to `https://x.com/predifyapp` returned **HTTP 402 Payment Required**; body not retrieved, no payment requirements disclosed, stopped as per rules. Account not verified. | H (the 402), account state NOT FOUND |
| GitHub | No repo linked from CoinGecko (`repos_url.github: []`). Repo search for `predify` finds only namesakes (section 8). `gh search code` for the token address hits only token lists / asset crawlers (cowprotocol/token-lists, Xellar-Protocol/xellar-assets, tuanhoang95/currency-crawler, openxcn/AI-Crypto-Wallet). | H |
| CoinGecko coin `predify` | `last_updated` 2026-09-24; categories `BNB Chain Ecosystem`, `Prediction Markets`; market cap $4.8K; 24h volume $2.27. Fixture `coingecko-coin.json` | H |
| GeckoTerminal token + pool (fresh 2026-10-19) | 0 buys/0 sells in every window up to 24 h; volume $0 | H |

Timeline (H): Telegram channel created 2025-10-18 -> domain registered 2025-10-18 -> PancakeSwap v2 PREDIFY/WBNB pool created 2025-10-19T15:20Z -> CoinGecko ATH 2025-10-20 ($0.000569) -> price about $0.0000049 now. Domain lapsed 2026-10-18. The entire public footprint is about one year old and consists of a token and a social handle.

## 2. What it is

- **Kind**: onchain-other in the discovery sense, but evidence supports only "launchpad memecoin with a prediction-market tagline" (M). GeckoTerminal categorises the token as `Fourmeme Launchpad` (H, `geckoterminal-token-info.json`).
- **Market model**: NOT FOUND (searched: CoinGecko description/links, GeckoTerminal info, parking page, Telegram preview, GitHub repo/code search, DNS). The only descriptive text is the 2-sentence blurb: "Pioneering the first hybrid oracle for large-scale on-chain prediction markets. The first prediction market that rewards every outcome." (H as quoted claim; unverified as to whether any product exists). "Rewards every outcome" suggests a pooled/parimutuel-like or consolation-reward design, but that is speculation and **not** documented anywhere I could read (L).
- **Token (H, CoinGecko + GeckoTerminal)**: BEP-20 `0xac5d77c76583a48d025ba1f01b0f544ea1294444` on BNB Smart Chain (chain id 56), 18 decimals, 1,000,000,000 max supply, about 982.4M circulating. Only DEX pool: PancakeSwap v2 PREDIFY/WBNB `0x822149ca0b397f9f9fc0853b2d9b1b9fd61f084c` (reserve about $8.0K per pool endpoint, about $4.6K total per token endpoint; the two GeckoTerminal figures disagree). 936 holders; top-10 hold 95.78%. DexScreener `/latest/dex/tokens/<addr>` returned `pairs: null` (H; it does not index the pool).
- **Collateral/chains for any prediction market**: NOT FOUND. No contract other than the token is identified.

## 3. Read API

NONE found. (`read_api.exists = none`)

- No docs site, no OpenAPI, no subgraph, no websocket, no market contracts located (searched: predify.app and subdomains by DNS/HTTP, CoinGecko links, GeckoTerminal info, Telegram preview, GitHub repo/code/user search for `predify`/`predifyapp`/the token address). WebSearch was unavailable late in the run (shared session budget exhausted), so the open-web search could not be extended; the negative result rests on the direct probes above.
- The only machine-readable data about "Predify" is **token price/volume** from CoinGecko / GeckoTerminal. That is a memecoin feed, not prediction-market prices, and has no place in an arbitrage scanner.

## 4. Trade path / PayBox reachability

- **Prediction-market trade path: none** (no market contracts, no order API, no signing scheme).
- **PayBox**: not reachable in any useful sense. BNB Chain is an EVM chain a PayBox wallet could in principle use, and the PREDIFY token could technically be swapped on PancakeSwap v2, but that is a speculative memecoin trade, not a prediction-market leg. I did not call any PayBox tool.

## 5. Fees

NOT FOUND (no product). Only fee-like fact: PancakeSwap v2 pool `pool_fee_percentage: null` in GeckoTerminal (pool fee is 0.25% by PancakeSwap v2 convention, M, not stated by the source).

## 6. Resolution mechanism / dispute risk

NOT FOUND. "Hybrid oracle" is an unverified marketing phrase (H as quote). No oracle contract, no UMA/Chainlink/other integration, no rules text located. If it ever existed, the dispute and rug risk would be very high given an anonymous launchpad token, 95.8% top-10 concentration and a lapsed domain (M).

## 7. Geo / ToS / automation

NOT FOUND. No ToS, no geo-block statement, no API terms. The site is unreachable over HTTPS. The 402 from x.com is an X access wall, not a Predify rule.

## 8. Liquidity, overlap, shared liquidity

- **Liquidity (H, 2026-10-19)**: token market cap about $4.7-4.8K (GeckoTerminal/CoinGecko); DEX pool reserve about $4.6-8.0K; 24h volume $0 (GeckoTerminal) / $2.27 (CoinGecko, `last_updated` 2026-09-24). **Prediction-market volume/OI/TVL: none exists in any source I could read.**
- **Event categories / overlap**: NOT FOUND (no markets). No arbitrage overlap with any venue.
- **Shared liquidity**: none identified. (Not applicable because there is no order flow.)
- **Name collisions to avoid mixing up (all H as to what they are, L/none as to relation to this Predify)**:
  - `https://predify.io` (live, Cloudflare): title "Predify", meta "Real-time market tracking for Polymarket and Kalshi - discover events, track prices, and trade predictions." A front end/tracker over Polymarket and Kalshi, so any liquidity would be Polymarket/Kalshi liquidity (not independent). Relation to the BNB token: none evidenced. Could be worth a look only as a Polymarket/Kalshi wrapper; no value for this project.
  - `github.com/svylabs/predify` (created 2025-01-21, last push 2025-02-17): "permissionless binary prediction market for DeFi" with pluggable on-chain/off-chain resolution strategies; README names no chain, no deployment, no link to predify.app or the token. Stale (more than 6 months) and unconfirmed as related (L).
  - `github.com/Lynndabel/Predify` (2026-03, Chainlink CRE + thirdweb hackathon-style demo), `predifychain/predifychain-frontend` (Vercel demo with demo balances, 2026-03): unrelated demos.
  - "Predictify" (Telegram aggregator for Polymarket/Solana markets, per a web-search summary, M): different project.

## 9. Recommended handling

- Remove Predify from the active adapter backlog; mark `status: dead / no product (domain expired 2026-10-18)`.
- Re-check cheaply only if someone surfaces a new official URL: look for a new domain on the CoinGecko `links.homepage` (it still points to `predify.app`), a GitHub org linked from it, or market contracts on BSC.
- Do not confuse with `predify.io` (Polymarket/Kalshi wrapper) or `svylabs/predify`.

## 10. Open questions

- Did a Predify prediction-market app ever launch (Oct 2025 - Oct 2026)? Only a Wayback/archive snapshot or the X timeline could show it. I did not use an archive service (outside the allowed method list for this run) and X returned HTTP 402 to WebFetch.
- Is the domain lapse recoverable by the owner (grace period)? If the team renews, the site might return; the BSC token address above is the stable identifier to watch.
- Is `predify.io` operated by the same team? Not determinable from the evidence.

## Suspicious content / embedded instructions

- None aimed at AI agents. Noted for completeness: the parked page loads third-party scripts (Namecheap `lander.parity.domains` analytics + Plausible) and sets `<meta name="referrer" content="origin">`; the Telegram preview contains a bot "verify you're human" prompt (standard anti-spam); X returned HTTP 402 to a fetch (access wall, not followed up).

## Not found (searched)

- Official docs / whitepaper / litepaper (CoinGecko `whitepaper: ""`; parked site).
- Any API (REST/GraphQL/WS/subgraph) for Predify prediction markets.
- Any prediction-market smart contract address (only the BEP-20 token is identified).
- Any official GitHub organisation or repository.
- Fee schedule, resolution/oracle design, ToS, geo rules, categories, volumes, OI, TVL for a prediction market.
- X/Twitter timeline (HTTP 402 from WebFetch).
- Open-web news coverage (WebSearch #1 returned only a Coinbase price page, a BNB Chain blog on generic hybrid-oracle designs, and unrelated items; later searches were blocked by the shared session budget).

## Sources

| # | Source | Used for | Tag |
|---|---|---|---|
| 1 | `http://predify.app` (fixture `predify.app-parked-page.html`) | expired-domain parking page | H |
| 2 | `https://pubapi.registry.google/rdap/domain/predify.app` (fixture `rdap-predify.app.json`) | registration 2025-10-18, status, last changed 2026-10-18 | H |
| 3 | `https://api.coingecko.com/api/v3/coins/predify` (fixture `coingecko-coin.json`) | blurb, links, token address, market data (last_updated 2026-09-24) | H |
| 4 | `https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0xac5d...4444/info` (fixture `geckoterminal-token-info.json`) | four.meme category, holders, socials, holder concentration (2026-10-19) | H |
| 5 | `https://api.geckoterminal.com/api/v2/networks/bsc/pools/0x8221...084c` (fixture `geckoterminal-pool.json`) | PancakeSwap v2 pool, zero trades, pool creation 2025-10-19 | H |
| 6 | `https://api.dexscreener.com/latest/dex/tokens/0xac5d...4444` | `pairs: null` | H |
| 7 | `https://t.me/s/predifyapp` (fixture `telegram-preview-summary.json`) | 209 subscribers, 2 messages | H |
| 8 | `https://x.com/predifyapp` | HTTP 402 (no content) | H |
| 9 | `https://predify.io`, `https://predifychain-frontend.vercel.app` | namesakes | H |
| 10 | `gh api` repo/code/user search + `repos/svylabs/predify`, `Lynndabel/Predify`, `predifychain/predifychain-frontend` | namesakes, no official repo | H |
| 11 | WebSearch "Predify hybrid oracle on-chain prediction markets" (Coinbase price page, BNB Chain blog) | corroboration that no technical docs surface; mcap in low thousands | M |
