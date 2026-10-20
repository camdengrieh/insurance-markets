# PolyPort (polyport.app) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (DNS-over-HTTPS, registry RDAP, CoinGecko / GeckoTerminal / DexScreener public APIs, npm / PyPI / crates.io registries, Wayback Machine captures), `gh api` raw reads of the project's one public repo, WebFetch of public pages. No account, wallet, key, signature, POST/PUT/DELETE, or third-party code executed. No PayBox tools called. WebSearch budget ran out after 1 query (the Wayback reads below were all done before the budget notice and none were made after it), so third-party news coverage is thin.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months old). "(archived)" = read from a Wayback capture of the official site; anything dated before 2026-04-19 is stale by the 6-month rule and flagged.
All third-party text is untrusted data; nothing in it was followed. No text aimed at AI agents was found.

## 0. Verdict

**adapter_priority: skip.** still_live: **false**.

1. **The site and every documented host are gone.** `polyport.app`, `www.`, `api.`, `api-dev.`, `ws.`, `docs.`, `devnet.`, `app.` all fail DNS (NXDOMAIN) on 2026-10-19, and the `.app` registry's RDAP says "polyport.app not found", i.e. the domain is not currently registered (H; evidence file `docs/research/fixtures/polyport/liveness_evidence_2026-10-19.txt`). The "did not resolve" hint is confirmed and explained: the domain lapsed.
2. **There is no API to integrate.** The only API description is a docs-only GitHub repo that points at `https://api.polyport.app` (dead). The SDK packages it names do not exist on npm, PyPI or crates.io (H).
3. **Even when it was up it was effectively empty.** Archived market pages (Oct 2025) show vaults of 0 to 0.64 SOL and 1.4 to 6 "pending" receipt shares on settled markets; the site called itself "Solana devnet" in its Jan-Mar 2026 page metadata (H archived, stale). The POLYPORT token has about $123 of 24h volume and a ~$4.6K market cap (H).
4. Only value for the project: a cautionary pattern (SOL-collateralised bootstrapping CPMM markets on Solana). Nothing to scan or arbitrage.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| curl / WebFetch of `https://www.polyport.app/` and 7 other polyport.app hosts | curl exit 6 "Could not resolve host"; WebFetch ENOTFOUND | H |
| DoH (Cloudflare) NS/A/SOA for `polyport.app`; A for www/api/docs/devnet | `Status:3` (NXDOMAIN) for all | H |
| Registry RDAP `https://pubapi.registry.google/rdap/domain/polyport.app` | HTTP 404 `polyport.app not found` (domain not registered) | H |
| Wayback CDX for the domain (`web.archive.org/cdx/search/cdx?url=polyport.app&matchType=domain`) | Hosts captured: `www` (448 URLs), `devnet` (121), `docs` (63), `polyport.app` (8), `app` (2). Last HTML capture of the root page: 2026-03-11 (200, JS-rendered shell). No capture after 2026-03 was listed, but I did not exhaustively page the CDX | H, stale |
| Page metadata in archived root captures 2026-01-23 to 2026-03-11 | `<meta description>`: "Polyport Prediction Market - Lightning-fast prediction markets on Solana devnet"; page body is client-rendered so no further text was readable. Routes seen in 2026: `/faucet` (2026-01-17), `/lp-protection` (2026-01-31), `/deck/creators` (2026-02-11), `/create-creator-market` (2026-02-19) | H, stale |
| Metadata in archived Oct 2025 captures (`/markets`, market pages) | "Trade prediction markets with automated oracle settlements on Solana. Live on mainnet with Pyth Network price feeds and instant CPMM trading." | H, stale |
| CoinGecko API `coins/polyport`, record `last_updated` 2026-10-14 | Still lists homepage `https://www.polyport.app/`, X `@polyport_mart`, Telegram `polyport_mart`; no GitHub; 2026-era description pivots to "prediction markets for the attention economy" (creators / livestreams) | H (listing is stale vs DNS) |
| Telegram `https://t.me/s/polyport_mart` | 329 members, no posts rendered in the preview | H |
| X `@polyport_mart` | NOT FOUND (WebFetch returned HTTP 402; not read, nothing paid) | - |

Mismatch to note: the project's own README says "Solana Mainnet (Live since Q3 2025)", while the live site's 2026 metadata says devnet. Marketing claims are unverified (see section 11).

## 2. Kind, market model, tokenisation

- Kind: `onchain-other` (Solana program, constant-product AMM, SOL collateral). Not an order book, not parimutuel (M, from docs; H that docs say so).
- Binary YES/NO only ("Binary markets only" in `contracts/README.md`; the README's "binary & categorical" is aspirational) (H docs, M as to reality).
- Mechanism ("Auto-Bootstrapping Markets", archived homepage 2025-10-10 / 2025-11-18, stale): a market "activates with just 3 SOL total". Before activation, deposits mint 1:1 "pending YES/NO" receipt tokens (refundable if the activation target is not met by cutoff). After activation, tradable "share YES/NO" tokens trade on a CPMM (`x*y=k`). The homepage calls this a "Quad-Token Architecture" (H archived).
- Tokenisation: SPL tokens, 9 decimals, Metaplex metadata, burnable for redemption (documented in `contracts/README.md`, H as documentation). Market ids in the live app were 64-hex strings (`/markets/<64hex>`), not the `market_123` style in the API doc (H archived).
- Planned, never confirmed as shipped: Meteora YES/wSOL and NO/wSOL pool mirroring, Kamino yield, Jupiter any-token deposits, Wormhole bridges to Ethereum/Base (README / CHANGELOG, Oct 2025 roadmap; M, unshipped as far as evidence goes).
- 2026 pivot: creator-launched markets on livestream moments and news (CoinGecko description). No documentation of the new design found.

## 3. Chains and collateral

- Solana only. Collateral is native SOL (lamports), wrapped SOL handled in the UI ("Unwrap Wrapped SOL" panel), i.e. SOL-denominated, not USD-denominated (H archived market page 2025-10-29, stale).
- Claimed program id (mainnet and devnet, same id): `FT3tQxWs7Z428ALt4EVwyyrKE1DYdsd1kcXWcBuKnmdM` (H that the repo says so). I could not verify it on-chain: Solscan returned 403 and a Solana JSON-RPC lookup needs a POST, which this task forbids. Treat as unverified.
- POLYPORT token (not market collateral): Solana SPL `2k5o37XM59vQRmnnVnJAEspqfEG9VfoFNTywH49Jpump`, pump.fun launch graduated to PumpSwap 2025-10-07T13:33Z (H, GeckoTerminal), the same day the repo was created.

## 4. Read API

| Item | Result | Tag |
|---|---|---|
| Official public API | NONE reachable. Documented (not live) in the repo: REST `https://api.polyport.app` (prod), `https://api-dev.polyport.app`, WebSocket `wss://ws.polyport.app`. All NXDOMAIN | H |
| Docs | Repo `docs/api-reference.md` (https://github.com/polyport-dev/polyport/blob/main/docs/api-reference.md). The archived `docs.polyport.app` (2025-10-07) was a non-technical "PolyPort Guide" for creators / LPs with no API section | H |
| Documented endpoints (unverified, no live host) | `GET /markets` (status, category, sort, limit<=100, offset), `GET /markets/:id`, `POST /trade/buy`, `POST /trade/sell` (return a base64 unsigned tx), `GET /users/:wallet/positions`, `GET /users/:wallet/history`, `GET /oracle/prices`; WS `{type:"subscribe",channel:"market",marketId}` | H as documentation; shapes NOT confirmed against any live response |
| Auth / limits (documented) | `Authorization: Bearer <API key>`; 100 req/min public, 1000 req/min authenticated; WS 10 connections per IP | H as documentation |
| Order book / trades / resolution feeds | NOT FOUND (searched: repo docs, archived docs site, archived app pages). Docs list no trades endpoint and no book (it is an AMM; price = reserve ratio) | H |
| On-chain read path | Would be Solana RPC `getProgramAccounts` on the claimed program id decoding the documented `Market` struct (`yes_shares_supply`, `no_shares_supply`, `liquidity_pool`, `volume_traded`, `fee_bps`, `status`, `outcome`, `cutoff_ts`). No IDL published, program not verified | M |
| Subgraph / indexer | NOT FOUND (searched: repo, CoinGecko links, GeckoTerminal) | - |
| Backend stack (docs) | Next.js API routes, Supabase (Postgres + realtime), Inngest workers: market data lived in a private Supabase DB behind the app, not a public API | M |

Fixtures: no PolyPort API response could be sampled. Saved under `docs/research/fixtures/polyport/`: `github_docs_api-reference.md.DOCUMENTED_NOT_VERIFIED.md` (documented shapes only), `coingecko_polyport_2026-10-19.json`, `geckoterminal_token_2026-10-19.json`, `geckoterminal_token_pools_2026-10-19.json`, `github_repo_meta_2026-10-19.json`, `liveness_evidence_2026-10-19.txt`.

## 5. Trade path

- Documented flow: `POST /trade/buy` returns a base64 unsigned transaction that the user's Solana wallet signs; SDK `@polyport/sdk` builds `buyShares / sellShares / swap / addLiquidity / redeemWinnings` transactions (docs). No order signing scheme beyond normal Solana transaction signatures. Solana Actions / Blinks for one-tap bets (archived site, H).
- The API host is dead, `@polyport/sdk` and `@polyport/actions` do not exist on npm (404), `polyport` does not exist on PyPI or crates.io (H). No IDL, so a transaction cannot be built from public material.
- Programmatic trading today: **none**.

**paybox_reachable: no.** The venue is Solana-only and SOL-collateralised, so an EVM PayBox wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot touch it. A Solana PayBox wallet could in principle sign a transaction for the program, but there is no live front end, no API, no SDK, no IDL, and no evidence of any liquid market.

## 6. Fees

| Source | Value | Tag |
|---|---|---|
| Archived market pages (2025-10-23 to 2025-10-29), all 7 captured | "Trading fees: 2.00% total (1.50% protocol / 0.50% LP)", on the Milan v Pisa page the protocol and LP wallets showed the same truncated address | H, stale |
| Archived homepage (2025-10-10, 2025-11-18) | "Fees 0.25% -> as low as 0.10% with $POLYPORT" | H, stale; conflicts with 2.00% above |
| `contracts/README.md` | `fee = amount_out * FEE_BPS / 10000` applied to the CPMM output (value of `FEE_BPS` not given); "Fixed fee structure"; Market struct has `fee_bps: u16` | H as docs |
| `examples/market-creation.ts` | `creatorFee: 200` (2%), `platformFee: 100` (1%) | H as docs; a third inconsistent set |
| Planned | "4-way fee distribution" (traders / admin / LP / Meteora partner); fee splits fixed at activation; hourly auto-claim worker (archived FAQ) | H archived, stale |

Who pays: the trader, deducted from the swap output. Net cost for an arbitrage leg cannot be stated reliably (0.10% to 3% across sources). Also network fees; "Pending" receipts redeem 1:1 only before activation.

## 7. Resolution mechanism and dispute risk

- Price markets: Pyth feed with a target (archived market pages, e.g. "Pyth Price ... ABOVE 230 - Feed 0xef...b56d"); sports markets: "Sports Result" with source `www.espn.com` shown on the page; docs claim automated settlement from "SportMonks + API-SPORTS dual-oracle consensus" (H archived page, H docs claim).
- Contract docs: "Only market creator can settle (for now)", "Single oracle source per market", "Creator-based settlement" (`settle_market(ctx, outcome)`), which is a trusted-operator model (H docs). The SDK docs mention `DISPUTED` status, a 24h `disputePeriod`, and `voteOnDispute`, but no evidence these exist on-chain (L).
- Archived settled markets show a "Winner" label and a redeem-from-vault flow (`redeem_winner`) (H archived).
- Dispute / resolution risk: high. Operator-settled, tiny vaults, no published audit report ("External audit completed (Q3 2025)" is a bare claim, unverified).

## 8. Geo / ToS / automation

- Terms, Privacy, Risk & Disclosures, Cookies, Developers, Status footer links were all "Coming soon" in Oct 2025 captures (H archived, stale). No geofence or eligibility text found.
- Repo licence is proprietary: "Unauthorized copying, modification, distribution, or use of this Software ... is strictly prohibited" (applies to the SDK/docs, not obviously to on-chain use).
- No automation / API terms exist. Moot because the service is offline.

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Per-market vault balance, 7 markets | 0, 0, 0, 0, 0, 0.094, 0.642 SOL; pending receipts of 1.4 to 6 shares on the 5 settled markets; 2 markets were still `pending` (not yet activated) when captured | archived market pages 2025-10-23 to 2025-10-29 | H, stale |
| Activation threshold | 3 SOL total | archived homepage 2025-10-10 | H, stale |
| Prediction-market volume / OI / TVL in 2026 | NOT FOUND (no live site, no indexer, DefiLlama and Dune were not checked; searched: CoinGecko, GeckoTerminal, DexScreener, repo, archived site) | - | - |
| POLYPORT token market cap | $4,650 (price 4.65e-6 USD, circulating 999.7M) | CoinGecko API, record updated 2026-10-14, fetched 2026-10-19 | H |
| POLYPORT token 24h volume | $123.50 (CoinGecko) / $0.0 on all 11 DEX pools (GeckoTerminal) | 2026-10-19 | H |
| Token pool reserves | $7,189 total reserve (GeckoTerminal token record) | 2026-10-19 | H |
| CoinGecko web page text vs API | The WebFetch summary of the page showed price $0.054652 and a self-contradictory ATH/ATL; the API gives 4.65e-6. Used the API | 2026-10-19 | H |

Token liquidity is not prediction-market liquidity; neither is meaningful.

## 10. Event coverage and liquidity sharing

- Categories seen: crypto price (SOL, BTC, ASTER, via Pyth), sports match results (Serie A, Premier League), one equity (AAPL). All overlap Polymarket / Kalshi / Limitless in principle, so an arbitrage mapping would be possible, but there is no depth to trade, and the only such markets seen were a handful of short-dated Oct 2025 markets.
- Shared liquidity: none. PolyPort's own CPMM vaults; the planned Meteora mirroring would have routed to Meteora pools, never shipped as far as evidence shows. As a signal source it is worthless (no volume).

## 11. Credibility flags (so nobody builds on the repo's claims)

1. Repo `polyport-dev/polyport` was created 2025-10-07, has 1 star, GitHub language stats `{}` (no source code, docs and TypeScript snippets only), 0 releases, and commits author-dated back to 2025-08-10 while the account was created 2025-10-07 (H, GitHub API).
2. The README tells readers to clone `polyport-dev/polyport-showcase`; that repo does not exist (404). SDK packages named in the docs do not exist in any registry (H).
3. Docs contradict each other and the live site: fees 0.25% / 2% / 2%+1%; market ids `market_123` vs 64-hex; "Binary markets only" vs "binary & categorical"; "mainnet live July 2025" vs site metadata "devnet" in 2026 (H).
4. Token: pump.fun launch graduated 2025-10-07 13:33Z; the repo commit renaming `$PORT` to `$POLYPORT` is dated 12:45Z the same day (M that the team launched it).
5. No source of truth for on-chain state could be read (program unverified).

## 12. Open questions

- Is program `FT3tQxWs7Z428ALt4EVwyyrKE1DYdsd1kcXWcBuKnmdM` deployed on mainnet at all, and when was it last invoked? (Needs a Solana RPC read; a JSON-RPC POST was out of scope here.)
- What did the 2026 creator-market product (`/create-creator-market`, `/deck/creators`) actually do? Page bodies were client-rendered and unreadable.
- Why did the domain lapse (abandoned vs. moved)? No new domain was found; the CoinGecko record and X/Telegram still point at the dead one.

## Sources

- https://www.coingecko.com/en/coins/polyport (WebFetch; page figures internally inconsistent) and API `https://api.coingecko.com/api/v3/coins/polyport?...` (H, 2026-10-19; record updated 2026-10-14)
- https://api.geckoterminal.com/api/v2/networks/solana/tokens/2k5o37XM59vQRmnnVnJAEspqfEG9VfoFNTywH49Jpump and `/pools` (H, 2026-10-19)
- https://api.dexscreener.com/latest/dex/tokens/2k5o37XM59vQRmnnVnJAEspqfEG9VfoFNTywH49Jpump and `/latest/dex/search?q=polyport` -> no pairs (H)
- https://github.com/polyport-dev/polyport (README.md, CHANGELOG.md, LICENSE, contracts/README.md, docs/api-reference.md, docs/architecture.md, docs/integration.md, examples/market-creation.ts, examples/trading.ts), read with `gh api` raw (H docs; claims unverified)
- https://cloudflare-dns.com/dns-query (DoH, NXDOMAIN) and https://pubapi.registry.google/rdap/domain/polyport.app (404) (H)
- https://registry.npmjs.org/@polyport%2fsdk, https://pypi.org/pypi/polyport/json, https://crates.io/api/v1/crates/polyport (all 404) (H)
- Wayback Machine (read before the search-budget notice; stale, 2025-10 to 2026-03): CDX `https://web.archive.org/cdx/search/cdx?url=polyport.app&matchType=domain`; captures `https://web.archive.org/web/20251118001604id_/https://www.polyport.app/`, `.../20251027083430id_/https://www.polyport.app/markets`, `.../20251023154355id_/https://www.polyport.app/markets/43ed3663712d159eba215f43cf3601b05c8490260a01990fdf0a2e3bfe17c4eb`, `.../20251029100700id_/https://www.polyport.app/markets/c9ef798a503e9ad98aa449230d197dc2fc9c20b95a5d0c3031fc04310f7ced55`, `.../20251007143506id_/https://docs.polyport.app/docs/faq`, `.../20260311192729id_/https://www.polyport.app/` (H as to what the archive holds)
- https://t.me/s/polyport_mart (329 members, no posts rendered) (H); https://x.com/polyport_mart and https://solscan.io/account/FT3tQxWs7Z428ALt4EVwyyrKE1DYdsd1kcXWcBuKnmdM not readable (HTTP 402 / 403)
- WebSearch (1 query, "PolyPort prediction market Solana polyport.app"): secondary listings (Coinbase, CoinStats, BeInCrypto price pages; GitHub repo); search result snippets described the site as devnet and showed inconsistent market caps (M). Not otherwise relied on.
