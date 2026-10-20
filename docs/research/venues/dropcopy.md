# DropCopy - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs, Internet Archive page reads, `gh api` file reads. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and bundles were treated as untrusted data; nothing in them was followed. Generic User-Agent `insurance-markets-research/0.1` only.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.

Fixtures (each <= 50 KB): `docs/research/fixtures/dropcopy/` (section 11).

---

## 0. Bottom line

1. **Dead as a prediction market. adapter_priority = skip.** The prediction game lived at `dropcopy.io/pari`. That path was already a 404 in an Internet Archive crawl dated 2025-01-19 (H), and it is a 404 on the live site on 2026-10-19 (H). The domain now serves a different business: a "Real-Time AI Compute Index" (GPU rental price benchmark) with a Sign In / Get API Key funnel (H).
2. The DefiLlama listing is a ghost: TVL $8.47 on 2026-10-18, never above $21 in 1,018 daily points since 2024-01-04, flagged `deadUrl: true`, empty `url` (H). That is dust sitting in a wallet, not game liquidity.
3. **It was never an outcome market in the first place.** It was a 10-player "closest price guess" contest with a custodial in-app balance, not a parimutuel pool over discrete outcomes, and not something with a price you could compare to another venue (H, archived front end, section 2).
4. There is **no public read API, no trade path, no on-chain program** that I could find for the game, and nothing to integrate. Nothing here would be worth even a signal-only adapter.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://dropcopy.io/pari` (2026-10-19 02:22 UTC) | HTTP 404 (nginx) | H |
| `GET https://dropcopy.io/reqrep` (the backend path compiled into the 2024 app) | HTTP 404 | H |
| `GET https://dropcopy.io/trade/` | 404; `/workstation/` 301 to `/` | H |
| Internet Archive CDX for `dropcopy.io/pari`, crawls from 2025 | one record: 2025-01-19 20:30 UTC, status 404. Earlier crawls (2024-02-23, 2024-05-24) were 200. | H |
| Archived homepage 2024-12-14 | nav: "Prediction Game", "GUI", "Workstation"; footer "Pricing Data #PoweredByPyth"; links to `twitter.com/dropcopy_io` and a Discord invite | H |
| Archived homepage 2025-01-20 | a React single-page shell titled "DropCopy" (no longer the Prediction Game nav) | H |
| Live homepage 2026-10-19 | title "DropCopy Index"; "The Real-Time AI Compute Index ... Track the live market price of renting AI compute"; "(c) 2026 DropCopy"; sign-in and "Get API Key". The live-stream widget is wired to a placeholder `WS_URL = "wss://your-compute-index-feed.example/ws"` and shows "Disconnected / $0.000". No mention of prediction, parimutuel, Solana or Pyth. | H |
| DefiLlama | `deadUrl: true`, `url: ""`, TVL $8.47 (2026-10-18), category "Prediction Market", chain Solana, `listedAt` 2024-01-05, `audits: "0"`, `hacks: []` (https://api.llama.fi/protocol/dropcopy) | H |
| DefiLlama TVL history | 1,018 daily points, min $5, max $21 (2025-01-19), $13 on 2024-06-01, $15 on 2025-01-01, $10 on 2026-01-01, $6 on 2026-06-01 | H |
| Jupiter token metadata for the DROP mint | name "DropCopy token", symbol $DROP, 9 decimals, mint and freeze authority disabled, `organicScore: 0` ("low"); no price (DexScreener `pairs: null`, DefiLlama coins price `{}`) | H |
| GitHub | no repository found for DropCopy / `dropcopy_io` (`gh api search/repositories`, two queries, 0 hits) | H |

Verdict: **still_live = false** for the prediction product. The brand and domain are alive but repurposed. (Whether the same operator runs both is unknown; the 2026 page has no link back to the old game.) Twitter/X and Discord were not checked: the shared web-search budget ran out and X returns only a JavaScript shell.

---

## 2. Kind and market model (historical, from the archived 2024 front end)

Source: strings in the React bundle `https://dropcopy.io/pari/static/js/main.aa75f888.js`, archived 2024-05-24 (text read only; extract saved as a fixture). Staleness: 17 months old, and the app is gone. Tag **H for what the bundle said, L for whether it ever worked as described**.

- **Kind:** small-room price-guessing contest, labelled "parimutuel" by DefiLlama ("a parimutuel prediction market that allows players to predict the future price of cryptocurrencies", H). That label is loose: payouts are by rank, not pro rata to stake on an outcome.
- **Mechanics (H):**
  - "Predict what the price of a given crypto asset will be in the next hour." Each game has exactly 10 players. If it does not fill within 30 minutes ("Last Call") it is cancelled and a new hourly game starts.
  - Each player submits a **point estimate** of the price (adjustable until close). The most accurate three win: 1st 50%, 2nd 30%, 3rd 20% of the pot. Tie-break: earlier prediction.
  - Entry fee games: **10% "tip" to the house**, 90% to the pot. Free games exist. Players also get DROP tokens (amount "still being decided").
- **Outcome tokenisation:** none. There are no outcome shares, no per-outcome price, no order book, no AMM. The only prices are a stake (`minbet`), a pot (`prizePot`) and fill count per room (column names in the bundle).
- **Scalar, not binary:** a point-estimate contest cannot be mapped to a YES/NO price. It has no implied probability, so it produces no cross-venue comparable quote.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Solana only | H (DefiLlama; bundle uses Solana wallet adapters, `api.mainnet-beta.solana.com`) |
| Collateral | GOOD$ stablecoin ("GUSD") for fee games; free games cost nothing | H (bundle FAQ) |
| System token | $DROP, mint `DropTpWcDmP7kVRUEoKSJaMVi62hGo9jp19Hz19JVsjh`, 9 decimals, no price or pairs | H (Jupiter metadata) |
| TVL wallet (per DefiLlama adapter in a third-party fork) | `DCa1Xir4zDEtz78beFcXCHUNXdeBnrxBiRuuapHrBE3F`, adapter sums that wallet's tokens and SOL, blacklisting DROP | M (fork copy of `projects/DropCopy/index.js`; main repo path returns 404 at HEAD) |
| Custody | The bundle has an email/password login and says winnings sit in "your account with us"; payouts are "batch processing ... 3 times a day directly to your crypto wallet". That is a custodial ledger, not a trustless program. | H |

No Solana program id for the game was found (NOT FOUND, searched: bundle base58 strings, DefiLlama adapter, GitHub code search).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API for the game | **None found.** The 2024 front end talked to a private backend at `https://dropcopy.io/reqrep`, which now returns 404. | H |
| API docs | NOT FOUND (searched: dropcopy.io, Wayback CDX path list, bundle strings, GitHub repo search). The 2026 homepage markets a *compute-index* API ("Get API Key"), with an "API Docs" nav link that is commented out in the HTML; unrelated to prediction markets and key-gated. | H |
| On-chain or subgraph route | Not viable: no program id; balances were held in a wallet plus an off-chain ledger. | M |
| WebSocket | None for the game. The 2026 page's WebSocket points at a placeholder host. | H |
| Rate limits / auth | n/a | - |

Only derived data exists: DefiLlama `https://api.llama.fi/protocol/dropcopy` (TVL only, no volume or per-market data).

---

## 5. Trade path

**none.** Placing a prediction required logging into the DropCopy web app (cookie `userinfo`, email/password) or connecting a Solana wallet to fund an in-app balance; entries were submitted to the private `/reqrep` backend (H, bundle). That backend is gone. No signed-order scheme, no public order endpoint, no program instructions exist for an agent to call.

PayBox reachability: **no.** Even historically it was a Solana-wallet plus off-chain-account product with GUSD collateral; an EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) could not touch it, and today there is nothing to touch.

---

## 6. Fees

Historical (H, bundle): 10% of total entry fees retained by the house as a "tip", 90% to the pot, split 50/30/20 to the top three of ten. Free games have no fee. Plus normal Solana network fees. No fee on withdrawal was stated.

---

## 7. Resolution and dispute risk

Historical (H, bundle FAQ): settlement price = simple average of all prices over the last 2 minutes before game end, from the Pyth price service; fallback = average of Kraken, Coinbase and Binance trades over the same window; if all are down, the game is cancelled and refunded. Settlement automatic "within seconds", payouts to wallet batched three times a day. No dispute process is described: the operator ranks entries off-chain and the customer is told that "Yes!!" the customer is always right (joke FAQ). Risk: operator-controlled, off-chain, unauditable (`audits: "0"`).

---

## 8. Geo / ToS / automation

NOT FOUND for the game (searched: bundle strings for terms/jurisdiction/restricted/US, Wayback CDX path list, live site). The 2019-2022 crawls had `terms.html` and `privacy.html` paths, but those predate the Solana game and belong to an older site (L). The 2026 homepage links "Privacy / Terms / Contact" for the compute-index product. No statement on bots or automation. Real-money pay-to-enter games ranked by skill with a 10% house take may be regulated as gambling in several jurisdictions (M, my inference, no source).

---

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| TVL | $8.47 | DefiLlama API, 2026-10-18 | H |
| TVL range since listing | $5 to $21 | DefiLlama API, 2024-01-04 to 2026-10-18 | H |
| Volume / fees / OI | NOT FOUND (searched: DefiLlama protocol API fields; `summary/dexs/dropcopy` returned 400). A secondary summary of DefiLlama's Solana prediction-market table reported $0 volume over 24h/7d/30d, undated. | M |
| Live games | none; `/pari` is a 404 | H |

---

## 10. Overlap with other venues and shared liquidity

- **Event categories:** only "price of a crypto asset one hour out", the same underlying that Polymarket, Kalshi, Limitless and Myriad list as hourly or daily up/down markets. But DropCopy offered no probability quote for any threshold, so there was never a price to arbitrage against them.
- **Shared liquidity:** none. It was self-contained (own pots, own GUSD ledger). Pricing input was Pyth.
- Independent leg? Moot; nothing is tradeable.

---

## 11. Open questions, not-found list and fixtures

NOT FOUND: official docs; API docs; GitHub org or repo; game program id; terms of service for the game; historical volume or user counts; reason for the shutdown; whether the 2026 "DropCopy" compute-index company is the same operator; Twitter/Discord status (not checked, search budget exhausted).

Name-collision warning: "drop copy" is a standard TradFi term (FIX trade-report feeds at CME, NSE and others), so web searches for it are dominated by unrelated results. Match on the domain `dropcopy.io`, the Twitter handle `dropcopy_io` and the mint above.

Fixtures in `docs/research/fixtures/dropcopy/`:
- `defillama_protocol_dropcopy_trimmed.json` - DefiLlama protocol metadata and last 30 TVL points (trimmed by me from 1,018).
- `jupiter_token_search_drop.json` - raw Jupiter token metadata for the DROP mint.
- `dropcopy_io_root_2026-10-19.html` - raw 2026 homepage (the compute-index page; includes the placeholder WebSocket URL).
- `pari_rules_extract_wayback_2024-05-24.txt` - rule/FAQ strings I extracted from the archived 2024 app bundle (not a raw API response).

No real game API response could be captured because none is reachable.

---

## Sources

- https://api.llama.fi/protocol/dropcopy - fetched 2026-10-19 (H; TVL, deadUrl, listedAt, oracle = Pyth, methodology)
- https://defillama.com/protocol/dropcopy - HTTP 403 to WebFetch, so the API above was used instead (H that it is the discovery evidence, not otherwise read)
- https://dropcopy.io/ and `/robots.txt`, `/pari`, `/reqrep`, `/trade/`, `/workstation/` - GET status checks 2026-10-19 (H)
- Internet Archive CDX index for `dropcopy.io` and `dropcopy.io/pari`, and archived copies dated 2024-04-19 and 2024-12-14 (homepage), 2024-02-23 (`/pari` shell), 2024-05-24 (`/pari` JS bundle), 2025-01-20 (homepage). Crawl dates are the archive's, not mine (H for contents, L for freshness; stale by 17+ months)
- https://lite-api.jup.ag/tokens/v2/search?query=DropTpWcDmP7kVRUEoKSJaMVi62hGo9jp19Hz19JVsjh - fetched 2026-10-19 (H)
- https://api.dexscreener.com/latest/dex/tokens/DropTpWcDmP7kVRUEoKSJaMVi62hGo9jp19Hz19JVsjh and https://coins.llama.fi/prices/current/solana:DropTpWc... - no pairs, no price (H)
- DefiLlama adapter source for `projects/DropCopy/index.js`: read from a third-party fork (`pamenarti/DefiLlama-Adapters`) via `gh api`; the main repo path returns 404 at HEAD (M)
- One WebSearch (extended) for "DropCopy parimutuel prediction market Solana dropcopy.io" - found only the DefiLlama pages as relevant results (M); a second search was refused (session search budget exhausted)
- `gh api search/repositories` for dropcopy / dropcopy_io - no results (H)

Suspicious content / embedded instructions: none found. The archived bundle contains joke FAQ copy only; the 2026 homepage contains a placeholder WebSocket URL on the reserved `.example` TLD, which I did not connect to.

Privacy: no personal identifier was sent in any request (generic User-Agent only) or written to any file; fixtures grepped for "@" and the user's name with zero hits.
