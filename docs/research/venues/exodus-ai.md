# Exodus AI (EXO, exodusprotocol.ai) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock ~03:45-03:55 UTC). READ-ONLY: unauthenticated GETs, a Telegram public preview, `gh api` searches, DNS and whois lookups. No account, wallet, key, signature, on-chain call, POST, or PayBox tool. Third-party pages and API responses were treated as untrusted data; nothing in them was followed. **WebSearch was unavailable (session budget used up)**, so no press or analytics coverage was read; everything below comes from first-hand fetches of the project's own channels plus CoinGecko, Jupiter and DexScreener data endpoints.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/exodus-ai/` (listed in section 12). None of them is a market API response, because no market API exists.

---

## 0. Bottom line

1. **Not a prediction venue in any integrable sense.** There is no website (the homepage is a disabled Vercel deployment), no market data, no API, no contract/program addresses, no repo, and no evidence anywhere that a market was ever listed. What exists is a **pump.fun memecoin ($EXO)** wrapped in a marketing page and a 7-page whitepaper-style GitBook. (H)
2. **Dead / abandoned.** Homepage returns `402 DEPLOYMENT_DISABLED` (Vercel), docs were last edited 2025-01-04, the Telegram channel has 3 posts total (last one is a Telegram "owner inactive" notice), token has $2.43 24h volume and ~$9.7k market cap. (H)
3. **"Beta now live" is just the CoinGecko/X/Telegram bio text**, copied across channels since early 2025; no beta product is reachable. (H that the text exists; H that no product URL is reachable)
4. **adapter_priority = skip.** Nothing to read, nothing to trade, no liquidity, and the Telegram channel carries a phishing-pattern "verify you are human" banner (section 11).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Homepage `https://exodusprotocol.ai/` (and `www.`) | HTTP 402, body "Payment required / DEPLOYMENT_DISABLED", header `x-vercel-error: DEPLOYMENT_DISABLED`, `server: Vercel`. This is Vercel's response for a disabled deployment (account/billing/ToS pause), **not an x402 payment requirement**; no payment terms were returned, so nothing to record or pay. Fixture `exodusprotocol.ai_homepage_headers_2026-10-19.txt` | H |
| `app.exodusprotocol.ai` | no DNS record | H (`dig`) |
| `api.exodusprotocol.ai` | resolves to 212.34.140.194 but TCP/HTTPS connection timed out after 10 s (undocumented host; root path probed once only) | H |
| Docs `https://docs.exodusprotocol.ai/` (GitBook) | 200, 7 sections, only an overview/roadmap; sitemap `lastmod` values all 2025-01-04 (last edit 2025-01-04). Roadmap promised MVP in Q1 2025, beta Q2 2025, API Q2 2025, cross-chain Q4 2025; none of it is documented as delivered | H |
| X `https://x.com/AiExodus` | Profile page loads (200 via curl; WebFetch got a 402 from its own fetch layer). Meta description: "AI-powered prediction markets using crowd wisdom and analytics. $EXO beta is now live - predict and earn points." Post timeline not readable without JS/login, so last post date is **NOT FOUND** | H (bio) |
| Telegram `https://t.me/s/ExodusAiPortal` | 64 subscribers, 3 messages in total: "Channel created" (2025-01-20), a "protected by @Safeguard - click to verify you're human" post (2025-03-28), and a Telegram service notice (2026-07-07): "The owner of this channel has been inactive for the last 17 months..." | H |
| Token | pump.fun launch 2025-01-03, graduated same day; CoinGecko price/market data last updated 2026-10-17; 24h volume $2.43; DexScreener returns **no pairs** for the mint | H |
| Domain | `exodusprotocol.ai` created 2024-12-11, registry expiry **2026-12-11** (whois). Renewal looks unlikely given the disabled deployment (M) | H (dates) / M (inference) |

Verdict: **still_live = false** (token exists on-chain and is technically tradeable; the "platform" is not reachable and appears abandoned since early 2025).

---

## 2. Kind and market model

- **Kind (M):** `other` -> effectively a **memecoin with a prediction-market narrative**. The docs describe a Solana-based "AI + crowd wisdom" forecasting product: users "create prediction events, submit data, and validate forecasts through a consensus mechanism", with "staking and voting", "interactive prediction cards" and reward distribution (H, docs pages "Approach to Predictions", "Voting System", "User Interface"). That is a **reputation/staking-vote design, not a tradeable market**: no outcome tokens, no order book, no AMM, no parimutuel pool, no prices. (H that docs say this; H that no market-structure details are documented)
- Market model (binary/categorical/scalar), tokenisation of outcomes, identifiers: **NOT FOUND** (searched: docs.exodusprotocol.ai llms.txt / llms-full.txt / sitemap, X bio, Telegram, GitHub repo + code search for "exodusprotocol.ai", "Exodus AI prediction solana" and the mint).
- The docs claim the platform "utilizes Claude AI" for analysis and a "Bayesian probability model" (H as a claim; unverifiable and irrelevant for integration).

## 3. Chains and collateral

- **Chain: Solana** (docs: "Solana Integration moves from testnet to mainnet, including smart contracts to manage prediction registration, result validation, and reward distribution"). No program ID is published anywhere. (H claim; **program addresses NOT FOUND**)
- **Collateral:** NOT FOUND. Docs imply the $EXO token is used for staking/rewards; the X/Telegram text says "earn points" (points = off-chain, non-tradeable). (M)
- **Token:** `$EXO`, SPL mint `FqveHfaf96iTjA3KgX1W5LWPnLFYv8EfUf6TQSWPpump`, 6 decimals, supply 988,343,808 (CoinGecko `circulating = total`), mint and freeze authority disabled, launchpad pump.fun, graduated 2025-01-03T19:22:03Z to pool `24q4w6c4tssKnHrDcfZ7tgueT1WwFdfVRXYcmMEBrNRL`, 5,294 holders, top-holders share 8.94%, Jupiter organic score 0 ("low"). (H, Jupiter `lite-api.jup.ag/tokens/v2/search`, fixture `jupiter_tokens_v2_search_exo_2026-10-19.json`)

## 4. Read API

- **Exists: none.** No official, public or authenticated market API. Docs roadmap promised "comprehensive API development for external integrations ... detailed developer documentation" in Q2 2025; nothing was published. (H)
- Base URLs: none. `api.exodusprotocol.ai` resolves but did not answer (undocumented). Docs URL: `https://docs.exodusprotocol.ai/` (overview only; `llms.txt` index at `/llms.txt`).
- Key endpoints for markets / books / trades / resolution: **NOT FOUND**. WebSocket: **NOT FOUND**. Rate limits: n/a.
- Only readable data is token data from third parties (not venue data): CoinGecko `GET https://api.coingecko.com/api/v3/coins/exodus-ai` (200, last_updated 2026-10-17T17:01:22Z), Jupiter `GET https://lite-api.jup.ag/tokens/v2/search?query=<mint>` (200), DexScreener `GET https://api.dexscreener.com/latest/dex/search?q=<mint>` (200, `pairs: []`). GeckoTerminal's keyless API returned 429 and was not retried. (H)

## 5. Trade path

**None.** No orders, no signed-order scheme, no program/IDL, no SDK. The only on-chain action possible is swapping the $EXO memecoin on a DEX (pool above), which is not a prediction-market position and has no value to an arbitrage scanner. (H that nothing else is documented)

PayBox reachability: **no** - there is nothing to propose or sign. PayBox does support Solana, so a swap of the token would be technically possible, but that is out of scope and would be buying an illiquid memecoin. (M)

## 6. Fees

NOT FOUND. Docs describe no trading, staking or creation fees. (searched: all 7 docs sections via llms-full.txt)

## 7. Resolution mechanism and dispute risk

Described only in marketing terms: "decentralized consensus", community voting with staking and time locks to "prevent manipulation", automated reward distribution through voting smart contracts (H claim, docs "Voting System"). No oracle, resolver, dispute window or contract is named. Dispute risk cannot be assessed; effectively unbounded because there is no operating system to resolve against. (H that nothing more is documented)

## 8. Geo / ToS / automation

NOT FOUND: no terms of service, geo-restriction or automation policy exists on the docs or the (disabled) site. (searched: docs sitemap, llms.txt, homepage)

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Prediction-market volume / OI / TVL | none (no markets) | n/a | H |
| $EXO 24h volume | $2.43 | CoinGecko API, last_updated 2026-10-17T17:01Z | H |
| $EXO market cap | $9,741 (CoinGecko), $9,912 (Jupiter, 2026-10-19T02:26Z) | same | H |
| $EXO pool liquidity | ~$6,571 | Jupiter, 2026-10-19 | H |
| $EXO price | $9.86e-6 (ATH $0.00725 on 2025-01-06; ATL $6.43e-6 on 2026-06-06) | CoinGecko | H |
| Raydium pair | listed "inactive, no trades in last 3 hours" on the CoinGecko page; DexScreener has no pair indexed | CoinGecko page via WebFetch (M); DexScreener (H) | M/H |

Note: the CoinGecko web page summary showed "$0.0599" price, which is a mis-summary; the API price is $9.86e-6 and matches the $9.7k market cap. Use the API figure.

## 10. Event-category overlap and independence

- Categories: none live. Docs mention generic "real-world events", social-media-driven forecasts and "near-future outcomes"; no sports/politics/crypto-price/macro market list exists. **Overlap with other venues: none.**
- Shared liquidity: none (no liquidity at all). Not an independent arbitrage leg because it has no tradeable market.
- Signal value: the "AI prediction" output is not published anywhere, so it is not usable as a signal source either.

## 11. Suspicious content / risk notes

- Telegram channel post (2025-03-28): "Exodus AI is being protected by @Safeguard - Click below to verify you're human." The "Safeguard" verification-bot pattern is widely used in Telegram wallet-drainer/phishing flows (M, my knowledge; not verified here). Do not click through. Not an instruction aimed at the agent, recorded as a safety flag.
- Marketing claims are unverifiable and inflated ("unprecedented accuracy", "consistently outperform traditional forecasting methods", "utilizes Claude AI") with no model, data, track record or code published.
- Homepage 402 is Vercel `DEPLOYMENT_DISABLED`, not an x402 challenge.
- No embedded instructions aimed at AI agents were found in the docs, `llms.txt` or CoinGecko text. (The docs' `llms.txt` is a plain page index.)

## 12. Fixtures saved

All under `docs/research/fixtures/exodus-ai/`:

- `coingecko_coin_exodus-ai_2026-10-19.json` (2.3 KB; trimmed from the full API response: id, platforms, categories, description, links, scalar market data)
- `jupiter_tokens_v2_search_exo_2026-10-19.json` (1.2 KB; raw)
- `dexscreener_search_exo_mint_2026-10-19.json` (37 B; `{"schemaVersion":"1.0.0","pairs":[]}`)
- `docs_llms.txt_2026-10-19.txt` (3.9 KB; docs page index)
- `exodusprotocol.ai_homepage_headers_2026-10-19.txt` (305 B; the 402 DEPLOYMENT_DISABLED response headers)

## 13. Adapter recommendation

**skip.** If anything, add the domain/mint to a "known dead" list so discovery does not re-surface it. Revisit only if `exodusprotocol.ai` returns a working app with market data (check that homepage once per quarter, domain registration expires 2026-12-11).

## 14. Open questions / NOT FOUND

- Whether any prediction market was ever live on a Solana program (no program ID, no repo, no explorer link).
- Date of the last X post (timeline not readable without login/JS).
- Whether `api.exodusprotocol.ai` (212.34.140.194) hosts anything; it timed out.
- Telegram "Safeguard" bot intent (not clicked).
- Any 2026 press or on-chain analytics coverage (WebSearch unavailable this session).

## Sources

- CoinGecko coin page (WebFetch) https://www.coingecko.com/en/coins/exodus-ai - description, links, Raydium pair status (M, small-model summary)
- CoinGecko API https://api.coingecko.com/api/v3/coins/exodus-ai - price, market cap, volume, homepage link, last_updated 2026-10-17 (H)
- Jupiter tokens API https://lite-api.jup.ag/tokens/v2/search?query=FqveHfaf96iTjA3KgX1W5LWPnLFYv8EfUf6TQSWPpump - launch/graduation dates, liquidity, holders (H)
- DexScreener API https://api.dexscreener.com/latest/dex/search?q=FqveHfaf96iTjA3KgX1W5LWPnLFYv8EfUf6TQSWPpump and /token-pairs/v1/solana/<mint> - empty pairs (H)
- Homepage probe https://exodusprotocol.ai/ and https://www.exodusprotocol.ai/ - 402 DEPLOYMENT_DISABLED (H)
- Docs https://docs.exodusprotocol.ai/ , /llms.txt , /llms-full.txt , /sitemap.xml , /sitemap-pages.xml - product description, roadmap, last-modified 2025-01-04 (H)
- X profile https://x.com/AiExodus - bio meta description (H)
- Telegram https://t.me/s/ExodusAiPortal and https://t.me/ExodusAiPortal - 64 subscribers, 3 posts (H)
- pump.fun page https://pump.fun/coin/FqveHfaf96iTjA3KgX1W5LWPnLFYv8EfUf6TQSWPpump - returned only a generic landing page (no data); pump.fun frontend API returned 404 for the mint
- GitHub search (`gh api search/repositories`, `search/code`) - no repo for the project; code-search hits for the mint were unrelated repos (token lists)
- DNS/whois (`dig`, `whois`) for exodusprotocol.ai - created 2024-12-11, expires 2026-12-11 (H)
- GeckoTerminal API - 429 rate limited, not used
