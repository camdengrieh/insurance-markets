# Klout.bet (Solana, pump.fun token) - adapter spec

Researched 2026-10-19 (~01:00-01:10 UTC). READ-ONLY: unauthenticated GETs to public aggregator APIs (CoinGecko, Jupiter token search, GeckoTerminal, DexScreener, DefiLlama, registry RDAP), DNS lookups, TLS/HTTP probes of the venue host, `gh api` search/file reads. No account, no wallet, no signing, no POST/PUT/DELETE, no payment. No third-party code cloned or run. No PayBox tool called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (CoinGecko description, token metadata) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/klout-bet/` (5 files, each <= 6 KB).
Web search budget was exhausted before this task started (WebSearch refused: session limit), so discovery relied on direct API fetches, not web search. I did not work around the limit.

## 0. Verdict

**adapter_priority: skip** (dead or abandoned; and even if alive, not a prediction-market venue an arbitrage scanner can use).

1. **Site is down (H).** `https://klout.bet/` resolves to a Google Cloud IP but the server closes the connection during the TLS handshake and serves no certificate; plain HTTP only returns a bare 301 to HTTPS (`fixtures/klout-bet/probe_klout.bet_2026-10-19.txt`). No `www`, `app`, `api` or `docs` subdomain exists in DNS. A `replit-verify` TXT record indicates it was a Replit-hosted app (M); the deployment appears to be stopped or deleted.
2. **Domain expires in 3 days (H).** Registered 2025-10-22, expires 2026-10-22, last changed 2026-08-11 (registry RDAP, `fixtures/klout-bet/rdap_klout.bet_2026-10-19.json`).
3. **The token is dead too (H).** The only on-chain footprint is a pump.fun memecoin `klout` (mint `CeFrV65BuLHSsa4XGjaJau1af8Jr8e6Kxqc1iixwpump`, launched 2025-10-22). On 2026-10-19 its main PumpSwap pool had 0 transactions and $0 volume in 24h, market cap about $2.6K, pool reserve about $4.7K, 149 holders (GeckoTerminal, Jupiter). CoinGecko stopped updating the page on 2026-06-10 and shows -99.7% from the ATH of 2025-10-26.
4. **Not a prediction market in the arbitrage sense (M).** Per the project's own description (CoinGecko), each tweet becomes a bonding-curve asset priced by engagement; there is no YES/NO share, no $1 payout, no resolution event, so no price that maps to a probability another venue also quotes. Nothing to arbitrage against Polymarket/Kalshi/etc.
5. **No API, docs, repo, contract address or program ID found anywhere (H absence).** Nothing to integrate.

Revisit only if the domain is renewed and a working site appears; even then expect P2 (signal-only) at best.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `curl https://klout.bet/` (3 attempts) and `openssl s_client -servername klout.bet` | TCP connects, server sends 0 bytes and closes during ClientHello: `SSL_ERROR_SYSCALL`, "unexpected eof", "no peer certificate available" | H |
| WebFetch `https://klout.bet/` (2 attempts) | "Socket is closed" | H |
| `http://klout.bet/` and `/api/markets` | `301` to `https://klout.bet:443/<path>`, empty body, `Cache-Control: private` (front-end LB redirect only) | H |
| DNS | A `34.111.179.208` (reverse: `*.bc.googleusercontent.com`); NS `ns1cny/ns2ckr/ns3jkl/ns4hny.name.com`; TXT contains a `replit-verify=` record; no AAAA; `www/app/api/docs.klout.bet` have no records | H (hosting inference M) |
| Registry RDAP (Identity Digital) | registration 2025-10-22T17:16Z, last changed 2026-08-11T21:39Z, expiration **2026-10-22T17:16Z**, status `client transfer prohibited` | H |
| Token launch | pump.fun, created 2025-10-22T18:06:24Z (about 50 min after domain registration); graduated to PumpSwap 18:32Z (Jupiter `graduatedAt`) | H |
| GeckoTerminal, main PumpSwap pool `CpoQ7EXt...ZLrH`, 2026-10-19 | `transactions` m5/m15/m30/h1/h6/h24 all 0 buys / 0 sells; `volume_usd` all 0.0; `reserve_in_usd` 4731.01; market cap 2637.62 USD | H |
| Jupiter tokens v2 (`updatedAt` 2026-10-17T19:34Z) | mcap 2640.19, liquidity 2423.82, holders 149, `organicScoreLabel: low`, mint and freeze authority disabled | H |
| DexScreener `/latest/dex/tokens/{mint}` and `/token-pairs/v1/solana/{mint}` | `pairs: null` / `[]` (no tracked pair) | H |
| CoinGecko `/coins/klout-bet` | `last_updated` 2026-06-10T01:56Z; price 1.77e-6 USD; market cap 1,704 USD; 24h volume 344.55 USD (all as of 2026-06-10, so L); ATH 6.30e-4 on 2025-10-26; `watchlist_portfolio_users` 58; `repos_url.github` empty | H (data stale) |
| X account | CoinGecko lists `klout_dot_bet`, Jupiter lists `x.com/kloutdotbet`. WebFetch of `x.com/klout_dot_bet` returned HTTP 402; nothing paid or retried. Last-post date NOT FOUND. | H (that it is unreadable) |

Conclusion: not live as a product (H); domain lapses 2026-10-22 unless renewed.

## 2. What it is

- **Kind**: onchain-other (Solana). A pump.fun launchpad token with a "social-finance" pitch. Operator, team, legal entity: NOT FOUND (searched: CoinGecko, Jupiter metadata, RDAP (registrant redacted), `gh api search/repositories` for "klout.bet" and "klout_dot_bet", `gh api search/code` for "klout.bet").
- **Project description (CoinGecko, verbatim substance, M because it is the project's own marketing and the product could not be observed)**: tokenises tweets into "dynamic markets"; "Each tweet becomes a tradeable asset powered by a bonding-curve mechanism that reacts to real-time engagement - likes, reposts, views, and comments"; users "buy and sell positions based on the virality potential of content". URL: https://api.coingecko.com/api/v3/coins/klout-bet (fixture `coingecko_coin_klout-bet_trimmed_2026-10-19.json`).
- **Market model (M, inferred from the description only)**: per-post tokens on a bonding curve, i.e. an AMM-like curve rather than an order book, with no binary or categorical outcome and no documented settlement. Closer to a "attention memecoin" than a parimutuel or CLOB prediction market. How the per-tweet tokens are minted, what collateral they use, and whether any contract exists beyond the pump.fun launch token: NOT FOUND.
- **Chain/collateral**: Solana mainnet (H for the token, CoinGecko `asset_platform_id: solana`). Collateral for the post markets: NOT FOUND (SOL would be the natural guess; not asserted).
- **Name collisions to avoid**: Jupiter search for "klout" also returns `klout.gg` (a different project, mint `HCZwDt3i...LoutGG`, launchpad "forge", created 2025-06-10) and an unrelated pump.fun token named "Klout" (mint `3E8rMYFg...Compump`, created 2026-10-14, no website). Neither is Klout.bet.

## 3. Read API

**NOT FOUND (searched: klout.bet homepage and `/api/markets` (site down); DNS for `api.`/`docs.`/`app.` subdomains (no records); CoinGecko `links` (only homepage, X, explorers; `repos_url.github` empty, no whitepaper, no docs); Jupiter token metadata (website and X only); `gh api` repo and code search for "klout.bet" / "klout_dot_bet" (only third-party coin-list snapshots: `Xellar-Protocol/xellar-assets`, `tuanhoang95/currency-crawler`, `NikolayMetchev/money-manager`); DefiLlama `/protocols` (8,758 entries, no Klout) and DEX overview (no Klout)).** exists = none.

Only token-level price data is available, from generic aggregators (not from the venue): GeckoTerminal `https://api.geckoterminal.com/api/v2/networks/solana/tokens/{mint}/pools`, Jupiter `https://lite-api.jup.ag/tokens/v2/search?query={mint}`, CoinGecko `/api/v3/coins/klout-bet`. These describe one memecoin, not markets. Observed rate limits: CoinGecko public API returned 429 after a few calls (H); GeckoTerminal returned 429 once (shared egress).

## 4. Trade path

**none.** No documented order API, program ID, IDL, SDK or contract. The only tradeable thing found on-chain is the `klout` memecoin itself via PumpSwap/Meteora pools, which is not a prediction-market instrument.

## 5. PayBox reachability: **no**

PayBox in general reaches Solana (chain catalog includes Solana; `solanaTransaction` signing and `solana:mainnet` transaction proposals exist - see `docs/research/06-paybox-platform.md`, H from an earlier session). But there is no live venue, no program to target, and no signed-order scheme, so an agent has nothing to propose. (An EVM wallet cannot trade a Solana venue either way.)

## 6. Liquidity sharing

Not applicable. No evidence it routes to or mirrors another venue; it is not an independent arbitrage leg because it has no comparable outcome contracts at all.

## 7. Fees

NOT FOUND. pump.fun / PumpSwap protocol fees apply to the memecoin pool (not researched; irrelevant to the post markets). No fee schedule for the tweet markets.

## 8. Resolution and dispute risk

NOT FOUND. Per the description there is no resolution event: price follows a bonding curve driven by engagement metrics (likes/reposts/views/comments, source of those metrics not documented). If it ever worked, the data source would be X engagement counts pulled by the operator (M, inferred), which is a centralised, manipulable input and X's API terms are a further risk. Not verified.

## 9. Geo / ToS / automation

NOT FOUND (site down; no ToS page reachable). Note for later: markets on third-party social content raise X platform-terms issues and, for a bonding-curve trading product marketed as speculation, probable gambling/securities exposure in several jurisdictions (M, general, not venue-specific).

## 10. Liquidity (dated)

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Market cap of `klout` token | about $2,640 | Jupiter tokens v2 (`updatedAt` 2026-10-17), GeckoTerminal 2026-10-19 | H |
| Main pool reserve (PumpSwap) | $4,731 | GeckoTerminal 2026-10-19 | H |
| 24h volume / transactions (main pool) | $0 / 0 | GeckoTerminal 2026-10-19 | H |
| Holders | 149 | Jupiter 2026-10-17 | H |
| Other pools | 8 Meteora DAMM v2 pools created within 7 minutes on 2025-10-22, each $0 reserve to $20, all with 0 trades in 24h; the original pump.fun curve pool has $0 reserve (graduated) | GeckoTerminal 2026-10-19 | H |
| CoinGecko 24h volume | $344.55 | CoinGecko, as of 2026-06-10 (stale) | L |
| Volume / OI / TVL of the tweet markets | NOT FOUND (not on DefiLlama; no venue API) | - | - |

## 11. Overlap with other venues

None. Engagement-on-a-tweet positions are not outcome contracts on sports, politics, crypto price or macro, so there is no cross-venue pair to scan. At most a weak "social attention" signal for a Quotient-style signal layer, and only if the product comes back and exposes data.

## 12. Adapter sketch

None. Do not build. If the site returns: re-check for (a) a documented API or public program ID/IDL, (b) real per-post market count and volume, (c) a resolution rule, before spending any effort. Cheap tripwire: poll `https://klout.bet/` TLS and GeckoTerminal pool transactions weekly (or just check after the 2026-10-22 domain expiry).

## Open questions

1. Was there ever a working product beyond the token launch? (No archive checked; archive services deliberately not used. X timeline unreadable via WebFetch, HTTP 402.)
2. Is the tweet-market contract a Solana program separate from the pump.fun mint? Reading it would need Solana JSON-RPC (POST), which this run's rules exclude.
3. Does the registrant renew on 2026-10-22? (Check RDAP `expiration` after that date.)

## Not found (searched)

- Official docs, API, OpenAPI, websocket, SDK, GitHub repo, program ID/IDL: none (see section 3 for searches).
- Fee schedule, resolution rules, ToS, geo restrictions: none (site down).
- Venue-level volume/OI/TVL: none (not on DefiLlama; only memecoin pool stats exist).
- Team/operator identity: none (RDAP registrant redacted).

## Sources

- https://api.coingecko.com/api/v3/coins/klout-bet - description, contract, links, stale market data (H; fetched 2026-10-19; data `last_updated` 2026-06-10)
- https://lite-api.jup.ag/tokens/v2/search?query=CeFrV65BuLHSsa4XGjaJau1af8Jr8e6Kxqc1iixwpump and `?query=klout` - launchpad, graduation time, mcap, liquidity, holders, website/X links, name-collision tokens (H; 2026-10-19)
- https://api.geckoterminal.com/api/v2/networks/solana/tokens/CeFrV65BuLHSsa4XGjaJau1af8Jr8e6Kxqc1iixwpump/pools - pool list, 24h transactions and volume (H; 2026-10-19)
- https://api.dexscreener.com/latest/dex/tokens/{mint}, https://api.dexscreener.com/token-pairs/v1/solana/{mint}, https://api.dexscreener.com/latest/dex/search?q=klout - no pairs (H; 2026-10-19)
- https://rdap.identitydigital.services/rdap/domain/klout.bet - registration, last-changed, expiry (H; 2026-10-19)
- https://api.llama.fi/protocols and https://api.llama.fi/overview/dexs - no Klout entry (H; 2026-10-19)
- DNS (`dig`) and TLS/HTTP probes of klout.bet, 2026-10-19 (H; `fixtures/klout-bet/probe_klout.bet_2026-10-19.txt`)
- `gh api search/repositories` and `search/code` for "klout.bet" / "klout_dot_bet": https://github.com/Xellar-Protocol/xellar-assets (assets/klout-bet_solana/info.json, a copy of the CoinGecko description with an undated market cap of 5,655 USD, L), https://github.com/tuanhoang95/currency-crawler, https://github.com/NikolayMetchev/money-manager - coin-list mirrors only (M/L)
- https://x.com/klout_dot_bet - WebFetch returned HTTP 402; no content, nothing paid (H that it is unreadable)
- `docs/research/06-paybox-platform.md` (this repo) - PayBox chain catalog and Solana signing surface (H in that note, 2026-10-19)
- `docs/plan.md` - skimmed for context; it contains no claims about Klout.bet

## Suspicious content

None found. The only third-party prose read was the CoinGecko project description (promotional, no instructions to AI agents). The `x.com` fetch returned a bare HTTP 402 (recorded, not acted on).
