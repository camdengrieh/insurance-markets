# Pollo (pollo.lol, X @pollodotlol) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 03:45-03:55 UTC). READ-ONLY: web fetches, `gh api` reads, unauthenticated GETs to public price/metadata APIs, DNS and registry WHOIS lookups. No account, wallet, key, signature, on-chain call or PayBox tool. Third-party pages and API responses were treated as untrusted data; nothing in them was followed. WebSearch ran once successfully, then the shared session search budget ran out, so a few claims below rest on that one search's result snippets (tagged M).

Tags: **H** = read first-hand in a primary or authoritative source this session (cited); **M** = secondary source, search snippet, small-model page summary, or my inference; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/pollo/` (listed in section 12). They are liveness evidence only; Pollo has no API to fixture.

---

## 0. Bottom line

1. **Dead, or as good as dead.** The only site, `pollo.lol`, no longer resolves (NXDOMAIN from 1.1.1.1 and 8.8.8.8), and the .lol registry shows the domain expired 2026-08-12 and is now in `redemptionPeriod` + `pendingDelete` + `serverHold` (registry record updated 2026-09-23). (H)
2. **The token has stopped trading.** CoinGecko: "POLLO tokens have stopped trading" on all listed exchanges, no tickers, 24h volume $1.36, market cap $12.7k; all three Base DEX pools show zero transactions and zero volume in the last 24h; DexScreener returns `pairs: null`. (H)
3. **The product was never an order book or price-discovery venue.** The litepaper describes a lottery-like $1 pool: fixed $1 stake, odds hidden until close, 10% fee, winners picked by Chainlink VRF from the correct predictors. Even when live it offered no tradable price, no API and no way to sell. (H for the litepaper text; the live product itself was never observed)
4. **adapter_priority = skip.** Dead, no API, no prices to compare, no code (the linked GitHub repo 404s).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Website | `curl https://pollo.lol`, `https://www.pollo.lol`, `https://pollo.lol/en/about-us`: "Could not resolve host". WebFetch of the about-us page: `ENOTFOUND pollo.lol` | H |
| DNS | `dig pollo.lol @1.1.1.1` and `@8.8.8.8`: `status: NXDOMAIN`. `app.`, `api.`, `www.`, `docs.` subdomains: no answer | H |
| Registry (whois.nic.lol, last DB update 2026-10-19T03:46Z) | Created 2024-08-12; **Registry Expiry 2026-08-12**; status `serverHold`, `pendingDelete`, `redemptionPeriod`, `serverTransferProhibited`; record updated 2026-09-23; nameservers still point at the registrar's default DNS | H (`fixtures/pollo/whois_pollo.lol_2026-10-19.txt`) |
| CoinGecko | Page: "POLLO tokens have stopped trading"; API `last_updated` 2026-10-06; price $1.27e-5, market cap $12,727.98, 24h volume $1.36; `tickers: []`; ATL $9e-6 on 2026-09-16; ATH $0.00173 on 2025-01-04; 117 watchlist users | H (page fetch + `api.coingecko.com/api/v3/coins/pollo`; `fixtures/pollo/coingecko_coin_pollo_2026-10-19.json`). The page's "last traded" time was blank ("- ago") so the exact stop date is NOT FOUND |
| On-chain DEX | GeckoTerminal: 3 pools (Uniswap V2 POLLO/VIRTUAL reserve $13.2k, V4 POLLO/ETH reserve $0.006, V3 POLLO/WETH about $0); every pool has 0 buys/sells and $0 volume in 5m/15m/30m/1h/6h/24h. DexScreener `latest/dex/tokens/<token>`: `{"pairs":null}` | H (`fixtures/pollo/geckoterminal_token_pools_2026-10-19.json`, `dns_and_dexscreener_2026-10-19.txt`) |
| Virtuals agent registry | Agent "Pollo" (PolloPal, virtualId 759) still has `status: AVAILABLE`, 1,345 holders, `volume24h: 0`, launched 2024-12-30 | H (`api.virtuals.io`; `fixtures/pollo/virtuals_agent_759_2026-10-19.json`). "AVAILABLE" is a registry flag, not evidence the product runs |
| GitHub | CoinGecko links `github.com/nimbus-cloud-9/nimbus-contract`: `gh api repos/nimbus-cloud-9/nimbus-contract` -> HTTP 404. The org `nimbus-cloud-9` exists (created 2024-12-16) with 0 public repos. Two GitHub repo searches for the project returned nothing | H |
| X account | `x.com/pollodotlol` post and `medium.com/@pollodotlol/about` could not be read (WebFetch got HTTP 402 and 403). I did not pursue the 402 (no payment). Last-post date is therefore NOT FOUND. Search snippets show posts from 2024-2025 only | M |

Verdict: **still_live = false** (site gone, domain lapsed, token untraded, no code). Confidence high that it is not operating as a service; medium on exactly when it stopped (somewhere between early 2025 and 2026-08-12).

---

## 2. Kind and market model

All from the project's litepaper (Google Doc linked from CoinGecko; summarised by WebFetch, so M for exact wording, but consistent with CoinGecko's description which is H):

- **Kind:** "prediction and opinion market" in name; structurally a **fixed-stake prize-pool game** (closer to a lottery/pari-mutuel hybrid than to a market). (M)
- **Stake:** exactly $1 per market per user, paid in USDC or USDT. (M)
- **Odds hidden until the market closes**; token holders could use the PolloPal AI agent to see which way a market leaned. (M)
- **Payout:** 10% platform fee off the pool; of the remaining 90%, 1st prize 25% of the pool, 2nd-6th prizes 10% each, and the remaining 15% split into $5 tranches handed out randomly among correct predictors. (M)
- **Winner selection:** Chainlink VRF picks winners among correct predictors; the paper does not say how this is verifiable. CoinGecko repeats the VRF claim. (CoinGecko H, details M)
- **Opinion markets:** same mechanics with subjective questions and "rewards go by popularity of the option". (M)
- **Outcome tokenisation:** none documented. There are no outcome tokens; positions are $1 entries, not tradable shares. (NOT FOUND for any tradable position token; searched: litepaper, CoinGecko, Virtuals listing)
- Not binary/categorical/scalar in the order-book sense, no AMM, no book.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Token chain | Base. POLLO ERC-20 at `0x10ac13e54218470eed360d13a38c2bbafacb6167`, 18 decimals, 1B supply; launched on Virtuals Protocol (bonding about 45 min, 2024-12-30) | H (CoinGecko API, GeckoTerminal, Virtuals API) |
| Market chain | Unclear. A search snippet quotes a project FAQ post: "All markets have their Solana PDA where pool sizes can be verified" (suggesting Solana accounts). The litepaper says it does not clearly say which chain markets run on and lists "Base expansion" for Q2 2025 | M (snippet) / M (litepaper) |
| Collateral | USDC or USDT, $1 per entry | M |
| Contracts for markets | NOT FOUND (searched: litepaper, CoinGecko links, GitHub org and repo, Virtuals listing). The `nimbus-contract` repo is gone | - |

---

## 4. Read API

**None.** No public developer API is described in the litepaper (M); `docs.`/`api.` hosts do not resolve; no GitHub code; no subgraph or SDK found. Market endpoints, price/book endpoints, trade history, resolution endpoints, rate limits and websockets: all NOT FOUND (searched: litepaper, CoinGecko links, DNS for api./docs./app., GitHub org, GitHub repo search). Pool sizes were said to be checkable on Solana PDAs (M, snippet), but the program id and account layout are not documented anywhere I could reach, and with odds hidden until close there is no live price to read anyway.

The only live data about "Pollo" is the POLLO token's DEX/CEX data (CoinGecko, GeckoTerminal, DexScreener), which is irrelevant to event probabilities.

---

## 5. Trade path

None. No documented programmatic entry (no API, no SDK, no contract ABI). Entries were placed through the pollo.lol web UI, which no longer exists. A "Telegram miniapp", "Solana Blinks for X trading", "gasless trades" and "agentic trading" appear only as 2025 roadmap items in the litepaper (M); none verified as shipped.

**PayBox reachability: no.** There is no contract address, program id or signed-order scheme to point a transaction proposal at. Even if the Solana PDA claim is right, there is nothing live to send a transaction to.

---

## 6. Fees

10% platform fee on each prize pool (litepaper, M). Creators of user-generated markets were to receive up to 50% of market revenue and had to hold $POLLO (M). "Low transaction fees" claimed, no figures. Gas: not documented. No taker/maker concept.

---

## 7. Resolution and dispute risk

Litepaper: after a market closes and "the correct outcome is verified", a "Randomizer Event" (Chainlink VRF) allocates rewards. It does not say who verifies outcomes or how disputes are handled (M). Effectively operator-resolved with no dispute path, plus a random lottery layer: even a correct predictor may receive nothing, so payouts are not 1:1 with outcome probability. Not usable as a probability source.

---

## 8. Geo / ToS / automation

Litepaper: geo restrictions not mentioned (M). A search snippet of a project FAQ lists blocked regions "The US, UK, UAE, EU, and Singapore" (M, older post, unverified). No ToS reachable (site is down). Sybil controls relied on email/X/Telegram/Discord activity (M), i.e. anti-bot by design. Automation rules: NOT FOUND.

---

## 9. Liquidity

- Venue volume / OI / TVL: **NOT FOUND**, and none can exist for a dead service. No prediction-market volume was ever published that I could find.
- Token-level (not venue) numbers, for completeness: market cap $12,727.98, 24h volume $1.36 (CoinGecko, 2026-10-06 update, read 2026-10-19, H); Uniswap V2 POLLO/VIRTUAL pool reserve about $13.2k with zero trades in 24h (GeckoTerminal, 2026-10-19, H). Virtuals "totalValueLocked" 10,948 (Virtuals API, 2026-10-19, H; unit not stated).

---

## 10. Event-category overlap and independence

- Categories: the litepaper mentions generic "predictions" and "opinion" questions, with AI scouting of trends from Reddit, CoinMarketCap, NewsAPI, Alpha Vantage and X (M). No category list, no sports/politics/crypto-price/macro breakdown, no market catalogue found. Overlap with other venues: NOT FOUND.
- Liquidity sharing: none known. It had its own pools, but with hidden odds and a lottery payout there is no price to hedge against, so it is not an arbitrage leg regardless of independence.

---

## 11. Priority

**skip.** Dead (domain lapsed, token untraded, repo deleted), no API, no tradable positions, no comparable prices, no way for PayBox to act. Revisit only if a new domain or contract appears for the same team (re-check `x.com/pollodotlol` manually and the Virtuals agent page; neither is a reliable signal).

---

## 12. Open questions

- When did the service actually stop (the site was likely taken down before the domain lapsed on 2026-08-12)? The last X/Medium post date was unreadable (HTTP 402 / 403).
- Which chain did the markets really run on (Solana PDAs per FAQ snippet vs Base per roadmap)? No contract or program id was found.
- Did the team relaunch elsewhere (the registry shows a record update on 2026-09-23, which may only be a registrar action)?

---

## 13. Suspicious content

None found in the pages read. The litepaper and CoinGecko description are promotional ("3% minimum win rate", "30x Pump.fun" per snippets) and are unverified marketing claims, not instructions. No text aimed at AI agents was seen. The unreadable X/Medium pages were not retried.

---

## Sources

- CoinGecko coin page, read 2026-10-19: https://www.coingecko.com/en/coins/pollo (H: description, "stopped trading", market cap, volume, links to X / Telegram / Medium / TikTok / GitHub / whitepaper)
- CoinGecko API, 2026-10-19: https://api.coingecko.com/api/v3/coins/pollo (H: `last_updated` 2026-10-06, empty tickers, ATL date 2026-09-16, links incl. `homepage: https://pollo.lol/`)
- GeckoTerminal API, 2026-10-19: https://api.geckoterminal.com/api/v2/networks/base/tokens/0x10ac13e54218470eed360d13a38c2bbafacb6167 and `/pools` (H)
- DexScreener API, 2026-10-19: https://api.dexscreener.com/latest/dex/tokens/0x10ac13e54218470eed360d13a38c2bbafacb6167 (H, `pairs: null`)
- Virtuals API, 2026-10-19: https://api.virtuals.io/api/virtuals?filters[tokenAddress]=0x10ac13e54218470eed360d13a38c2bbafacb6167 (H)
- .lol registry WHOIS (whois.nic.lol) for pollo.lol, 2026-10-19 (H)
- DNS via public resolvers 1.1.1.1 and 8.8.8.8, 2026-10-19 (H)
- GitHub: `gh api` on nimbus-cloud-9 org and nimbus-contract repo, 2026-10-19 (H, 404 / empty org)
- Litepaper (Google Doc, summarised by WebFetch; undated): https://docs.google.com/document/d/18weADozyVgpTnMCLRRehfh8TJHjuOLpywbUpk6jmRsY/pub (M)
- One WebSearch (extended) result list, 2026-10-19, used only for snippets of: https://pollo.lol/en/about-us , https://x.com/pollodotlol/status/1874053096340435099 (FAQ post, Dec 2024 by status id), https://medium.com/@pollodotlol/about (M; the pages themselves could not be fetched: DNS failure, HTTP 402, HTTP 403)
