# Synpath - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` raw file reads of `Synpath-ai/synpath`, WebFetch of synpath.dev pages, public unauthenticated GETs to `api.synpath.dev` (the host that the site and README name), PyPI JSON, one WebSearch. No account, Google sign-in, API key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Nothing from the repo was cloned, installed or run (`pip install synpath`, `synpath login`, `synpath keys create` were NOT run). Scripted requests used the User-Agent `insurance-markets-research/0.1` only.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (each <= 50 KB): `docs/research/fixtures/synpath/` (section 13).

---

## 0. Bottom line

1. **Live, but it is not a venue (H).** Synpath is an MIT-licensed Python/Rust SDK plus a self-hostable REST server for 8 venues, and a closed-source hosted service that does cross-venue matching, an arbitrage scan and Kalshi tick history. It holds no order book, no liquidity and no funds. It is a tool, a benchmark and a signal source, not a leg. Created 2026-09-28, 13 PyPI releases in 16 days, last push 2026-10-15.
2. **A real, working, public matching and arbitrage API exists (H, first-hand).** `https://api.synpath.dev` answered `/search`, `/events/{id}`, `/match/market`, `/match/event`, `/arbitrage`, `/venues`, `/health` and `/openapi.json` with HTTP 200 and **no key** on 2026-10-19. This contradicts its own README, docs and ToS ("Our hosted APIs require a Synpath API key"). So keyless use is undocumented and may be closed at any time, and arguably is outside the ToS.
3. **The matching is useful but visibly noisy (H data, M judgement).** The `/arbitrage` payload has 1,314 "positive" rows out of 43,062 matched pairs. Of the 265 with net profit >= 3 cents, 174 involve SX Bet and 63 have a "Tie" leg: soccer three-way outcomes paired as if they were complements. These are false positives. Treat the scan as a candidate generator that needs our own resolution-equivalence check, never as an edge.
4. **Quotes are minutes old (H data).** Median age of the leg prices in `/arbitrage` at `computed_at` was 24 s (Hyperliquid) to 233 s (Polymarket). Top of book only, no depth, no slippage (H, endpoint docstring).
5. **Does not cover XO or Trueo (H).** None of the 8 venues is XO or Trueo, and the repo tree has no such adapter.
6. **adapter_priority = P2 (signal-only / benchmark).** Do not depend on it at runtime. Borrow the schema ideas (`predicate`, `polarity`, `side_map`, `rules.hash`, `settlement_sources`) and use `/search` and `/arbitrage` offline to measure our own linker's recall. If ever used live, get a key (a human step) and stay inside the ToS.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| GitHub `Synpath-ai/synpath` | created 2026-09-28, pushed 2026-10-15T21:33Z, 180 stars, 21 forks, 4 open issues, MIT, not archived | H |
| PyPI `synpath` | 0.1.0 (2026-09-28) ... 0.8.1 (2026-10-14T23:52Z); 13 releases | H |
| `GET api.synpath.dev/health` | HTTP 200, `status: "ok"`, `stale_loops: []`; 15 background loops (per-venue `matched-*` every 30 s, `priority` 5 s, `prices` 300 s, `listings` 90 s) each with a `last_success_at` within ~90 s of 2026-10-19T02:57Z | H |
| `GET api.synpath.dev/venues` | 8 venues, `last_ingest_status: ok` for all; totals 31,820 events / 502,061 markets / 547,392 listings | H |
| Third-party coverage | one WebSearch (extended) returned only GitHub pages (repo, releases, PR #1); no independent article, review or incident report. NOT FOUND (searched: "Synpath prediction markets API open source Kalshi Polymarket smart order routing") | H (absence) |

Venue-list disagreement (H): GitHub repo description says "Kalshi, Polymarket, Polymarket US and Opinion" (stale); the README, changelog, `/venues` and the Arbitrage page say 8 venues; the synpath.dev home page (WebFetch) lists "Kalshi, Polymarket, Polymarket US, Hyperliquid, Novig (soon)" (M, small-model summary). Novig is not in the library or the API.

Verdict: **still_live = true**, very young (21 days old) and changing fast. 0.8.0 (2026-10-14) was a breaking release (`amount` renamed `quantity`; engine journal format 4 is not readable by older versions).

---

## 2. Kind and market model

- **Kind**: aggregator + data + execution library (ccxt-style). Three parts:
  1. `synpath` Python package (Rust core, PyO3), MIT, runs on the caller's machine: per-venue market data, order entry, streams, execution engine (stops, iceberg, OCO, bracket, TWAP, pegs, "buckets" = smart order routing across venues), journal so a crash never double-sends. (H, README, docs/engine.md)
  2. Self-hosted REST/WebSocket server (`synpath serve`, FastAPI). Read app ships **no authentication** by design; trading app has per-account keys, permissions and an append-only audit log. (H, docs/server.md)
  3. Hosted service (closed source; the repo has no `services/` tree; endpoint docstrings cite `services/api/*.py` and `db/migrations/*.sql` that are not public): matching, arbitrage scan, research search, Kalshi tick history, Polymarket builder signer. (H)
- **Normalised market model** (H, docs/api.md, docs/capabilities.md): every market is binary with `market.yes` and `market.no` (found by position, not label), prices are floats in `(0, face_value)`, `info` carries the venue's untouched payload. Ids are `venue:native` (`kalshi:KXELONMARS-99`, `polymarket:2252244`). Status vocabulary: `open`, `closed`, `settled`, `all`. Categorical venues are flattened: Opinion topics, Limitless groups and Hyperliquid questions become one binary market per option. NO books are mirrored from YES on shared-book venues (`derived=True`).
- **Underlying venues** (H, capabilities.md and exchanges page):

| id | Model | Book | Notes |
|---|---|---|---|
| `kalshi` | CFTC exchange, USD | one book per market | tick history hosted by Synpath |
| `polymarket` | on-chain CLOB, Polygon (chain 137), collateral pUSD | one book per outcome token | CLOB V2; neg-risk adapter |
| `polymarket_us` | CFTC exchange, separate from the on-chain CLOB ("share a brand and nothing else") | one book per market | retail API and exchange API |
| `opinion` | on-chain CLOB, BNB Chain (56), USDT | per outcome token | needs Opinion API key for every channel |
| `hyperliquid` | HIP-4 outcome markets on Hyperliquid L1, USDC | one book per market | fees on closing fills only |
| `predict_fun` | on-chain CLOB, BNB Chain, USDT | one book per market | mainnet needs API key; mirrors Polymarket markets |
| `limitless` | on-chain CLOB, Base (8453), USDC | one book per market | copies Polymarket markets; a few older AMM markets have no book |
| `sx_bet` | P2P sports exchange on its own chain, USDC | one book per market | voids return all bets |

- **Hosted event model** (H, `/events/{id}` fixture): an event has `outcomes[]`, each outcome has a machine `predicate_key` and `predicate` (e.g. `{"metric":"delta_bps","op":"<=","value":-50,"meeting":"2026-10-28"}`), and `contracts[]` (one per venue listing) with `polarity`, `predicate_side`, `selections[]` (bid/ask/price), `rules{text, hash, observed_at, settlement_sources[]}` and `parse{method, version, predicate, settlement}`. 47 `event_types` across domains fed, crypto, price, election, sports, econ, native (H, `/venues`).

---

## 3. Chains and collateral

Synpath itself has no chain and no collateral. Per underlying venue see the table in section 2. Trading keys it expects (H, `synpath/trading/credentials.py` docstring): Kalshi API key id + PEM private key (Ed25519 default, RSA-PSS supported); Polymarket EOA private key + funder (signature types 0-3, default type 3 Deposit Wallet for accounts created since 2026-05-04); Polymarket US Ed25519 key (retail) or participant credentials (exchange); Opinion private key + API key; Hyperliquid private key (or API wallet); predict.fun private key + API key; Limitless private key + API token id/secret; SX Bet private key + API key.

---

## 4. Read API

### 4.1 Hosted (Synpath's own)

| Item | Value | Tag |
|---|---|---|
| Hosts | `https://api.synpath.dev` (matching, research search, arbitrage, builder signer), `https://api2.synpath.dev` (Kalshi tick history, `/v1/*`) | H |
| Docs | `https://www.synpath.dev/docs` (54 REST endpoints in the sidebar; `/search`, `/arbitrage`, `/trending` are NOT in the API reference), repo `docs/*.md`, OpenAPI at `https://api.synpath.dev/openapi.json` ("Unified Market Research API" v1.0.0, 9 paths) | H |
| Auth (documented) | `Authorization: Bearer <key>`; key from `synpath login` (Google OAuth in a browser; "while the Google OAuth app is in testing, the account must be in Google's test-user audience") then `synpath keys create`. Keys look like `spk_...` (M). One key for both hosts. | H |
| Auth (observed) | **No key needed** for `api.synpath.dev` `GET /search`, `/events/{id}`, `/match/market`, `/match/event`, `/arbitrage`, `/venues`, `/health`, `/openapi.json` (all HTTP 200 on 2026-10-19, no Authorization header, no 401). `openapi.json` declares no `securitySchemes`. History on `api2` was NOT probed (documented as keyed). | H |
| Rate limits | NOT FOUND (searched: API reference page, authentication page, ToS, response headers). ToS section 5: "Hosted API usage is subject to rate limits and quotas, which may change." The SDK's own hosted client paces itself at 10 requests/s (`hosted.py`, M as guidance). No `X-RateLimit-*` headers seen. | H / M |
| Pricing | None published; README says key is "Free, no card". NOT FOUND (searched: home, docs, API reference, ToS). | H |
| WebSocket | None for the hosted service. NOT FOUND (searched: docs.md, api reference sidebar). | H (absence) |

Key hosted endpoints (H, `openapi.json` plus live GETs):

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /venues` | per-venue counts, ingest status, `event_types`, totals | fixture `venues.json` |
| `GET /health` | loop-level liveness (`status`: ok / degraded / unknown) | always HTTP 200 by design |
| `GET /search?q=&domain=&venue=&event_type=&sort=&cursor=&limit=&matched_only=` | live (still-trading) events, with `venues[]`, `matched_outcomes`, `volume` | fixture `search-q-fed.json`; `limit` default 20 |
| `GET /events/{event_id}?refresh=true|false` | one event with outcomes, per-venue contracts, quotes, rules text and hash, settlement sources | `refresh=true` (default) makes Synpath call the venues; `refresh=false` serves stored prices, which can be weeks old (fixture shows a Kalshi price from 2026-09-30) |
| `GET /match/market?id=venue:native[&venue=]` | `{anchor, event_id, matched: {id, venue, side_map} | null}`; 404 `{"detail":"market not found"}` if unknown | fixtures `match-market-*.json` |
| `GET /match/event?id=` | other venues' native event ids for the same event | not given a successful sample (my probe id 404'd) |
| `GET /arbitrage` | every matched market priced as YES on venue A + NO on venue B, net of taker fees, best asks only; ~2.1 MB, warm cache (`ttl_s: 30`) | fixture `arbitrage-sample.json` (truncated) |
| `GET /trending?limit=` | popular events | not sampled |
| `POST /v1/builder/sign` | Polymarket relayer builder-header signer (see section 6) | NOT called |
| `POST api2 /v1/order-book/at`, `/v1/order-book/range`, `/v1/trades/range` | Kalshi tick history, venue-time ms, <= 1 h per request | documented only; shape from repo test sample `history-order-book-at.repo-test-sample.json` (not a live response) |

### 4.2 Self-hosted server and SDK

`GET /venues`, `/venues/{venue}/markets`, `/markets/{id}`, `/events`, `/markets/{id}/book`, `/trades`, `/candles`, `/fee`, `/series/{id}`; cursor paging; `limit` capped at 100; errors in one envelope (`error.code`, `details.retryable`); `GET /openapi.json`. (H, docs/server.md) Rate limits are "only the venues' own limits, paced inside the server per venue" (API reference page via WebFetch, M). It is a thin pass-through to each venue; anything we can get from it we can get from the venue directly, and the underlying venue docs belong to those venues' own specs.

---

## 5. Trade path

- **Programmatic orders: yes, but only locally and with raw keys (H).** `KalshiTrading`, `PolymarketTrading`, ... take credentials from env vars or a git-ignored `.env`; `WalletSigner(private_key)` signs EIP-712 orders and digests in-process (`eth_account` or the Rust `Secp256k1Signer`). There is **no remote or external signer interface** in the code I read (`polymarket_signing.py`, `WalletSigner`). Hyperliquid, Opinion, predict.fun, Limitless and SX Bet reuse the same class.
- **Smart order routing ("buckets")**: merges listings of the same market across venues into one book net of fees, fills from the cheapest outward, **market orders only**, `price` is the worst accepted price, remainder re-routed as books move. The docs example: 500 YES costs about $206 across Kalshi + Polymarket vs $218 and $220 single-venue, before fees. Needs a self-hosted server running with credentials for **every** member venue. Settlement and void-policy differences between members are not discussed (buckets page via WebFetch, M). Marketing says "across Kalshi and Polymarket" and every doc example uses that pair, but `bucket.py` validates only "well-formed ids on known venues, no duplicates, at least two" members, so any of the 8 venues can be a member in code (H); which pairs are actually exercised in production is NOT FOUND.
- **Auth schemes per venue** (H, code and release notes): Kalshi `timestamp+METHOD+path` signature (Ed25519 or RSA-PSS-SHA256); Polymarket L1 `ClobAuth` EIP-712 + L2 HMAC + V2 `Order` EIP-712 (domain "Polymarket CTF Exchange" v2) or ERC-7739 wrapping for Deposit Wallets; Polymarket US Ed25519 over `timestamp+METHOD+path`; Opinion EIP-712 CTF `Order` on chain 56; Limitless EIP-712 on chain 8453 plus API token; predict.fun EIP-712 plus a login message that accepts predict.fun's ToS; SX Bet EIP-712 `Order` plus API key; Hyperliquid L1 action signature.
- **Can an EVM wallet reachable through PayBox trade it? (M, my inference)**
  - Through Synpath itself: **no**. The library wants the raw private key in an environment variable and offers no external-signer hook; a PayBox plugin runs only HTTPS GET/POST to allow-listed hosts and cannot host a Python process, so it cannot run Synpath. A Python subclass of `WalletSigner` that calls a remote signer would be a fork-level change, not a supported path.
  - Through the underlying venues: partly. EIP-712 order signing (Polymarket, Opinion, Limitless, predict.fun, SX Bet) is the kind of intent `request_wallet_sign` `typedData` takes, but each venue still needs its own API-credential handshake; Kalshi (PEM key) and Polymarket US (Ed25519 key) are not EVM-wallet venues at all. That analysis belongs in each venue's own spec, not here.
  - Read-only use of the hosted API from a plugin: **yes** in principle (plain HTTPS GET, no wallet, no x402/402 seen), provided `api.synpath.dev` is an allow-listed network host.

---

## 6. Fees (who pays, formulas)

**Synpath's own fee: none stated (H).** No pricing anywhere (home, docs, ToS). Hosted keys are free per the README.

**Hidden attribution (H, code): Polymarket builder code.** `SYNPATH_BUILDER_CODE = 0x3373b88f...5778c869` is attached to **every Polymarket order by default** unless the account sets `POLYMARKET_BUILDER_CODE` to its own code or `none`. The source comment says "Its builder fee rate is 0: it adds nothing to what an order costs." I did not verify that on chain or at Polymarket (M). It still gives Synpath volume attribution. Separately, for Polymarket relayer calls (Deposit Wallet approvals, split, merge, redeem) the SDK POSTs `{method, path, body}` to `https://api.synpath.dev/v1/builder/sign` so Synpath's builder key signs them (`SYNPATH_BUILDER_SIGNER_URL=none` disables it). That is wallet-transaction data reaching Synpath, which sits awkwardly with the privacy policy's "Synpath never receives these [order, trade, credential data]" (H for both texts; whether a relayer batch counts as "order or trade data" is a judgement).

**Venue taker fees as the hosted scan applies them (H, `fee_detail` strings in `/arbitrage`, 2026-10-19; `fee_source` = `venue` read from the venue vs `default` assumed):**

| Venue | Fee string | Source |
|---|---|---|
| kalshi | `quadratic ×1, rounded up to the cent per order` (page: 0.07 × P × (1 − P) per share, times the series multiplier); some series `quadratic_with_maker_fees` | venue |
| polymarket | per category: `politics_fees 0.04`, `sports_fees_v2 0.03`, `sports_fees_v3 0.05`, `economics_fees 0.05`, `crypto_fees_v2 0.07`, `weather_fees 0.05`, `tech_fees 0.04`, `finance_prices_fees 0.04`, `culture_fees 0.05`, `general_fees 0.05`, `fee-free` (rate × P × (1 − P)) | venue |
| polymarket_us | `taker theta 0.0695 × P × (1 − P); makers are rebated` | venue |
| predict_fun | `0.02 × min(P, 1 − P) a share, the rate on every market so far` (taker only) | default |
| limitless | `3% of the tokens bought up to 50c, falling to 0.4% near $1; makers pay nothing` | default |
| sx_bet | `1% of a winning taker bet's profit, at settlement; makers pay nothing` | default |
| opinion | `0.04 on notional, at least 0.25 USDT an order` (read from the fee contract on BNB Chain) | venue |
| hyperliquid | `14 bps on the settlement payout; none on the buy`; when the market is unread, "deployer scale 1 assumed" | venue / default |

Useful as a free cross-check of fee parameters per category (especially Polymarket's per-category rates), but each is Synpath's reading, tag M until confirmed on the venue.

---

## 7. Resolution and dispute risk

- Synpath resolves nothing. Resolution is each venue's own (Kalshi and Polymarket US are CFTC-regulated exchanges per Synpath's docs; the on-chain venues each run their own oracle or admin resolution, not read here). Those belong to the individual venue specs.
- **Matching risk is the real dispute risk.** A "match" is "a deterministic parse both listings land on, not a similarity score"; no confidence field exists (H, README and api.md). `side_map` (and `polarity`/`predicate_side` in event detail) says when venues ask the question the other way round. Crypto up-or-down markets are never matched ("each venue sets its own price to beat", H, README and changelog).
- The event-detail payload exposes the pieces our own linker needs: `rules.text`, `rules.hash`, `rules.settlement_sources[]` (e.g. `{"name":"Federal Reserve","url":"https://www.federalreserve.gov"}`), `parse.settlement` (e.g. `intermeeting: scheduled_meeting_only`). Void policy is only partly covered: SX Bet voids refund all bets and `info["void_condition"]` names them (H, capabilities.md); a cross-venue pair across a void-capable and a no-void venue is a settlement mismatch that the scan does not flag.
- **Observed matching defects (H data, M judgement), `/arbitrage` 2026-10-19:** (a) soccer: "Liverpool wins" Yes on SX Bet (priced 0.151, the Villarreal side) paired with "Will Liverpool win" No on predict.fun / Polymarket / Polymarket US / Kalshi at 0.36, reported net +47.3 cents; Yes on "Lecce wins" paired with No on SX Bet "Lecce vs Juventus - Tie". (b) implausible gaps on nominally identical thresholds: Kalshi "Will CPI rise more than 0.6% in October 2026?" Yes 0.01 vs Polymarket US "CPI MoM in October: Above 0.6%" No 0.77, i.e. an implied Yes of 0.23 (net +20.7 cents); this is a stale or wide quote, a different underlying statistic or a mapping error, not an edge on its face. (c) election margin-of-victory buckets are the largest non-sports cluster (603 election rows), with Polymarket "Will the X candidate win ..." titles paired to Polymarket US margin-bucket titles; bucket alignment could not be verified from the truncated titles (M). The ToS (section 8) disclaims accuracy of "MARKET DATA, MATCHES OR HISTORICAL DATA".
- Settlement-time risk across a pair: no timing or oracle-source comparison is performed by the scan beyond `close_at` and `event_time` fields.

---

## 8. Geo, ToS, automation

- **Synpath ToS** (https://www.synpath.dev/terms, "Last updated: September 2026", read in full via curl, H): no geographic restriction; operator is not named as a legal entity (a contact email appears in section 12). Section 3: "Our hosted APIs require a Synpath API key ... do not share it." Section 4 bans: unlawful use or breach of venue terms; unauthorised access; "an unreasonable load"; "Get around usage limits, for example by using several keys"; "Resell or redistribute our hosted data or API access without our written permission". Section 5: rate limits and quotas "may change"; may throttle or suspend a key. Section 6: "Synpath is software, not a broker or exchange. We do not hold your funds or positions"; the user is responsible for "orders placed by automated strategies or by software you run". Section 8: data and matches provided "AS IS" with no accuracy warranty. Section 10: access may be ended at any time.
- **Implications for us (M):** automation is explicitly contemplated; keyless scraping contradicts section 3; surfacing hosted matches to our end users or reselling them could trip the "redistribute" clause, so ask for written permission before building a product that re-serves Synpath data.
- **Privacy policy** (https://www.synpath.dev/privacy, "Last updated: September 2026", H): per hosted request Synpath logs time, IP address, requested address (including search text and market ids) and result; website has "no accounts, analytics, or cookies"; library and self-hosted server "send no telemetry"; "Venue keys are read from your own environment, and orders go from your machine or self-hosted server directly to the venues." No legal entity named.
- **Per-venue geo/ToS** (what Synpath says, M-H): Hyperliquid terms bar the US, Ontario and sanctioned places (H, 0.4.0 release notes); Opinion bars residents of several countries including the US and UK (M, exchanges page); predict.fun login accepts its ToS (H, 0.5.0 notes). Everything else is each venue's own spec.
- Security page on the site is "Content coming soon" for all three sections (H, WebFetch), so custody claims rest on the ToS, privacy policy and the code.

---

## 9. Liquidity (Synpath holds none)

Coverage and volume as reported (all 2026-10-19):

| Metric | Value | Source |
|---|---|---|
| Listings / markets / events ingested | 547,392 / 502,061 / 31,820 | `/venues` totals (H) |
| Active contracts by venue | polymarket 237,586; kalshi 111,407; polymarket_us 43,182; predict_fun 15,378; sx_bet 11,939; opinion 1,526; limitless 1,370; hyperliquid 360 | `/venues` (H) |
| Matched pairs scanned | 43,062 (5,083 excluded as "mismatched": priced > 50% on one venue and < 50% on the other); 1,314 with positive net edge | `/arbitrage` (H) |
| Example event volumes | "How many Fed rate cuts in 2026?" $87.1M across kalshi, polymarket, predict_fun; "Fed Decision in October?" $52.1M across 7 venues; "What price will Bitcoin hit in 2026?" $78.7M (kalshi, opinion, polymarket) | `/search` and `/events` (venue-reported, how summed unknown: M) |
| Adoption | 180 GitHub stars, 21 forks (2026-10-19); PyPI download count not read | GitHub API (H) |

Per-leg `volume_24h` and `liquidity` are mostly null in `/arbitrage`: only 331 of 1,314 rows have 24h volume for both legs and 188 have liquidity > 0 on both (H, my count). The page says "Prices, volume and liquidity are each venue's own figures."

---

## 10. Event-category overlap (where arbitrage exists)

`/arbitrage` positive rows by domain (H count, 1,314 rows): election 603, sports 564, econ 47, crypto 45, weather 25, fed 17, other 13. Rows with net >= 3 cents: sports 210, election 32, weather 12, econ 8, crypto 2, other 1.

- **Sports**: most rows, least trustworthy (three-way soccer, spreads, props; SX Bet appears in 174 of 265 rows with net >= 3 cents).
- **Politics/elections**: US House/Senate/governor races, margin of victory, turnout, vote share, next leader, mayoral races. Margin-bucket pairs are the usual false-positive source.
- **Macro**: Fed decision, cut/hike counts, CPI, central-bank decisions, gas price, recession, IPO market cap. Cleanest overlap (Kalshi / Polymarket / Polymarket US / Opinion / predict.fun / Limitless / Hyperliquid on FOMC), edges small (1 to 5 cents) and quotes minutes old.
- **Crypto**: price-reach/settle events matched; up-or-down never matched; FDV-after-launch (Polymarket vs predict.fun, Opinion) is a recurring cluster.
- Weather (Kalshi/Polymarket) matched with canonical `event_id`s like `weather:atlanta:temperature:max:at:2026-09-23` (H, README).

Ranked venue pairs in positive rows (H count): polymarket+polymarket_us 441, kalshi+polymarket 240, polymarket+predict_fun 221, kalshi+polymarket_us 99, polymarket+sx_bet 60, kalshi+sx_bet 52.

---

## 11. Shared liquidity

- **Synpath is not an independent arbitrage leg.** It is a read/route layer over the 8 venues; liquidity is theirs. Never count Synpath as a pool.
- Within its venue set, its own docs say predict.fun and Limitless markets copy or mirror Polymarket markets (`info["polymarket_condition_ids"]`, `info["polymarket_slug"]`; "Each market keeps the Polymarket market it mirrors"; changelog: cross-venue matching "puts a ... market on the card of the Polymarket market it copies") (H). Whether the books are shared or independent is NOT answered by Synpath; that is for the predict.fun, Limitless and Polymarket specs. The scan's 221 Polymarket+predict.fun rows are therefore suspect for independence.
- Polymarket and Polymarket US: Synpath says "the two share a brand and nothing else" (separate books, separate credentials) (H). The scan's largest pair is this one (441 rows).
- Resale/federation: Synpath ingests and re-serves other venues' public data; our registry already treats aggregators as "not pools" (docs/platform-registry-design.md).

---

## 12. Priority and recommended use

**adapter_priority: P2 (signal-only / benchmark).**

Why not higher: no liquidity of its own; no XO or Trueo coverage (so it cannot generate an XO leg); quotes 1-4 minutes old; matches have visible false positives and no confidence score; hosted API contract is unstable (keyless today, key required by ToS, breaking SDK releases weekly, no rate-limit statement, no named operator, no status page beyond `/health`); self-hosted routing needs raw private keys that a PayBox plugin cannot supply.

Why not skip: it is free, public today, machine-readable, and exposes exactly the metadata our linker needs to compare listings (predicate, polarity, rules hash, settlement sources). It is the only live source of a second opinion on cross-venue equivalence for Kalshi/Polymarket/Polymarket US/Opinion/Hyperliquid/predict.fun/Limitless/SX Bet.

Suggested use (M, design): (1) offline calibration of our own matcher against `/search?matched_only=true` and `/events/{id}`; (2) optional low-frequency `/arbitrage` poll as a candidate feed that must pass our resolution-equivalence and depth checks before anything is shown; (3) re-check `Last updated` of the ToS and whether `/arbitrage` starts returning 401 before any dependence.

---

## 13. Fixtures (`docs/research/fixtures/synpath/`)

| File | What | Size |
|---|---|---|
| `venues.json` | full `GET /venues` (2026-10-19) | 3.3 KB |
| `health.json` | full `GET /health` | 6.6 KB |
| `search-q-fed.json` | full `GET /search?q=fed` (20 events, `total` 80) | 10.7 KB |
| `match-market-kalshi-KXFEDDECISION-26OCT-C26.json` | `GET /match/market?id=kalshi:KXFEDDECISION-26OCT-C26` -> Polymarket `2589810`, `side_map` yes/yes | 0.2 KB |
| `match-market-kalshi-KXFEDDECISION-26OCT-C26-venue-polymarket_us.json` | same with `&venue=polymarket_us` | 0.2 KB |
| `openapi.json` | full `GET /openapi.json` | 9.3 KB |
| `arbitrage-sample.json` | TRUNCATED `GET /arbitrage` (2.1 MB original): top-level fields + 4 hand-picked rows (1 false positive, 1 Tie mismatch, 2 plausible); `_fixture_note` explains | 8.4 KB |
| `event-detail-trimmed.json` | TRUNCATED `GET /events/090ff982-...?refresh=false` (139 KB original): first outcome, Kalshi and Limitless contracts only; `_fixture_note` flags stale Kalshi price and an implausible Limitless price | 22.3 KB |
| `history-order-book-at.repo-test-sample.json` | repo `tests/samples/history/order-book-at.json` (NOT a live response; shape of `POST api2 /v1/order-book/at`) | 2 KB |

---

## 14. NOT FOUND (searched)

- Hosted rate limits, quotas, pricing, SLA (searched: home, docs, API reference, authentication page, ToS, privacy, response headers).
- Hosted WebSocket or streaming for matches/arbitrage (searched: docs, API reference sidebar, openapi).
- Legal entity / operator behind Synpath (searched: ToS, privacy, home).
- Public source of the hosted backend (searched: repo tree of 314 files).
- Documentation page for `/search`, `/arbitrage`, `/trending` (searched: API reference sidebar, docs index); they appear only in `openapi.json`.
- Independent third-party review, audit, benchmark or incident report on Synpath (searched: one extended WebSearch, GitHub pages only).
- Matching precision/recall figures or a confidence field (searched: README, api.md, site).
- Security page content (all three sections "coming soon").
- A live sample of `api2.synpath.dev` history or a keyed `/match/*` response (needs a key; deliberately not obtained).

---

## 15. Open questions

1. Will `api.synpath.dev` keep serving `/search`, `/arbitrage`, `/match/*` without a key, given the ToS says a key is required? (The website itself probably uses these endpoints.)
2. Real hosted rate limit and whether keyed access gives a materially better quota.
3. Is the Polymarket builder fee rate really 0, and does Polymarket attribute volume to Synpath's code? (Check Polymarket's builder docs / on-chain, out of scope here.)
4. Are predict.fun and Limitless books independent of Polymarket's, or routed to them? (Needed to decide whether the 221 Polymarket+predict.fun scan rows are real.)
5. Does the privacy statement hold for `/v1/builder/sign` payloads (relayer batches)?
6. Precision of the soccer/threshold/margin matching after 0.8.x; a calibration pass against our human-approved link set would answer it.

---

## 16. Suspicious / embedded-instruction content (recorded as data, not followed)

- README: repeated calls to "Star Synpath on GitHub" ("Stars are how we decide what to open up next"), and install/onboarding snippets (`pip install synpath`, `synpath login`, `synpath keys create`). Marketing/call-to-action text, not followed; none of the snippets were run.
- README "A home after Dome and pmxt ... pmxt hasn't shipped since July 2026": competitor claim (L). Consistent with other notes but not independently re-checked here.
- No text aimed at AI agents was seen in the README, docs, ToS, privacy policy or API responses I read.

---

## 17. Sources

Primary, all read 2026-10-19:
- https://github.com/Synpath-ai/synpath (README, `docs/api.md`, `docs/capabilities.md`, `docs/server.md`, `synpath/hosted.py`, `synpath/matching.py`, `synpath/trading/credentials.py`, `synpath/trading/polymarket.py`, `synpath/trading/polymarket_signing.py`, `synpath/trading/kalshi.py`, `synpath/trading/*_signing.py`, `tests/samples/history/*.json`, repo tree, releases v0.1.0 to v0.8.1, commits, issues)
- https://api.github.com/repos/Synpath-ai/synpath (metadata: created, pushed, stars, forks, license)
- https://pypi.org/pypi/synpath/json (release dates, version, license)
- https://api.synpath.dev/openapi.json, /health, /venues, /search?q=fed, /events/090ff982-8563-417c-96ea-5a85752953e6?refresh=false, /match/market, /arbitrage (public GETs, no key)
- https://www.synpath.dev/terms and https://www.synpath.dev/privacy (read in full)
- https://www.synpath.dev, /docs, /docs/authentication, /docs/concepts/exchanges, /docs/concepts/security, /docs/concepts/buckets, /docs/changelog, /docs/api-reference, /arbitrage, /research (WebFetch, small-model summaries: M)
- WebSearch (extended): "Synpath prediction markets API open source Kalshi Polymarket smart order routing" (returned GitHub pages only)

Internal cross-references (earlier project research, not re-opened except where marked above): `docs/research/14-platform-of-platforms.md` section 4.3 (README-level summary; its statement that matching "needs a Synpath key" is contradicted by the live probe in this note), `docs/platform-registry-design.md` (Synpath scored 3/5, WATCH).
