# Stryke prediction markets (stryketrade.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch, unauthenticated GETs to the documented hosts, `gh api` file reads. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The documented MCP endpoint is Streamable HTTP and needs a JSON-RPC POST even for reads, so I deliberately did NOT call it. Everything below about response shapes comes from the vendor's published example fixtures, not from live responses. Third-party content was treated as untrusted data.

Research limit: the shared WebSearch budget was exhausted before my first query ran. No search was performed; discovery relies on the hint, the SDK repo, the vendor's published docs bundle and the web app bundle.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/stryke-prediction-markets/` (section 11).

---

## 0. Bottom line

1. **Two different "Stryke" products, one organisation (H/M).** `stryke.xyz` is the older crypto options protocol (token SYK on Arbitrum). The prediction-market product is a separate Solana app at `https://stryketrade.com` (API `api.stryketrade.com`). The dannydoritoeth GitHub account that owns `stryke-sdk` also owns `prediction-market-agent-skills`, whose README says the repo "is maintained by Stryke (stryke.xyz)" (H), so they are linked. The stryke.xyz homepage itself does not mention prediction markets (H, WebFetch).
2. **The CoinGecko SYK figures do not measure this venue (H/M).** CoinGecko (API, last_updated 2026-10-18) lists SYK with categories Derivatives, Options, Prediction Markets, Arbitrum Ecosystem; platform `arbitrum-one` contract `0xacc51ffdef63fb0c014c882267c3a17261a5ed50`; market cap about USD 2.14M; 24h volume about USD 485. That is token trading volume on Arbitrum. The stryketrade.com app text says its markets "are not investments and do not provide equity, tokens, ownership, revenue share" (H, app bundle), so SYK is not the PM product's token. No prediction-market volume/TVL figure was found anywhere.
3. **Live status: partly confirmed.** Web app serves (HTTP 200 from Cloudflare, `last-modified` 2026-09-14). SDK `@stryketrade/sdk` 0.1.28 published 2026-08-15 (H). The docs bundle says "status: live ... availability verified 2026-08-10" (H). BUT `api.stryketrade.com` fails the TLS handshake (alert 40, no certificate presented) from three clients on 2026-10-19 (curl/LibreSSL, Python/OpenSSL 3.5, `openssl s_client`, plus WebFetch). Its origin `stryke-prod-api.onrender.com` answers 404 on every path I tried. So I could NOT confirm the API is serving now. Could be transient, a misconfigured custom domain, or a shutdown. Treat as unknown.
4. **What the market is:** short-dated (1m/5m/15m/1h) BTC and SOL "up vs strike" binary pools on Solana, collateral native SOL, resolved by a Pyth price. 5m/15m/1h rounds are aligned to Polymarket's matching rounds (the Stryke strike is linked to the Polymarket round). Also Pump.fun memecoin market-cap markets exist in the web app (H, UI strings), but the API/MCP only exposes the Pyth BTC/SOL scope.
5. **Arbitrage value:** the only overlap is crypto short-interval price direction versus Polymarket's matching rounds. The vendor's own reference bot is literally a Polymarket-versus-Stryke relative-value bot, which means a scanner would be a second user of the same edge. Liquidity is unknown, minimum trade is 0.00001 SOL, and the only depth number I saw is a synthetic doc example (5 SOL). Not independent of Polymarket's price (it copies the reference), but the pool itself is independent (own SOL curve), so a Polymarket-vs-Stryke leg is mechanically possible.
6. **adapter_priority = P2** (signal-only/thin, API unreachable at test time). Reasons in section 10.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://stryketrade.com/` (and any path: /terms, /docs, /api-docs all return the same 448-byte SPA shell) | 200, title "Stryke", Cloudflare, `last-modified: Mon, 14 Sep 2026 18:38:11 UTC` | H |
| `https://stryketrade.com/api-docs/mcp-sdk/compatibility.json` | `status: live`, "Production availability and clean-consumer verification passed on 2026-08-10" | H |
| npm `@stryketrade/sdk` | latest 0.1.28, published 2026-08-15; description "Public TypeScript SDK for Stryke prediction markets" | H |
| GitHub `dannydoritoeth/stryke-sdk` | created 2026-07-21, last push 2026-08-15 (about 2 months before today), not archived. Last commits are fixes to the reference bot. | H |
| `dannydoritoeth/stryke-app` (the real app repo named in the manifest, commit 26c00415...) | 404 / private | H |
| `api.stryketrade.com` TLS | handshake failure (alert 40), no peer certificate, from curl, python, openssl, WebFetch, 2026-10-19 | H (observation); cause unknown |
| `stryke-prod-api.onrender.com` (DNS target of the API host, a different host than documented) | 404 text/plain on `/`, `/health`, `/v1/*`, `/mcp` (GET) | H (observation only; I made 8 GETs, nothing else) |
| Activity after 2026-08-15 | NOT FOUND (searched: GitHub commits, npm time, web app headers). The X handle `https://x.com/StrykeTrade` is linked from the app but I could not read it. | - |

Verdict: **still_live = true with caveat** (front end is up and recent; the documented API host was unreachable during my test; no post-August product activity found).

Hint correction: the hint says SDK "created 2026-08-09" and "BTC/SOL"; GitHub says created 2026-07-21 (H). Hint says status of PM product "not confirmed on the main site": confirmed, the PM product is on a different domain.

---

## 2. Kind and market model

- **Kind:** on-chain (Solana program), non-custodial, wallet-signed. (H: SDK builds unsigned transactions that the user's own keypair signs.)
- **Market type:** binary UP/DOWN (YES/NO) against a numeric strike. "YES wins only when the normalized resolved value is strictly greater than the strike. Equality resolves NO." (H, `docs/market-mechanics.md`). Web app labels sides YES/NO; MCP/SDK use `up`/`down` (and the REST SDK uses `yes`). Categorical and scalar: none seen.
- **Scope:** BTC/USD and SOL/USD, expiry families `one_minute`, `five_minute`, `fifteen_minute`, `hourly` (H, environment fixture + SDK). Web app also lists Pump.fun memecoin markets, FX, Equities, Metal filters in its discovery UI strings (H for the strings; whether they are live is NOT FOUND). The anonymous MCP only supports `symbol` in {BTC, SOL} (H).
- **Mechanism:** neither a CLOB nor a classic AMM. Two pools per market (yes/no); trades move along an "independent curve" (`mathVersion: independent_curve_v1` in the SDK; the published example fixture says `legacy_normalized_spot_v1`, so the maths has changed since the doc fixtures) and winners split a "Winning Payout". The quote example exposes `yesPool`, `noPool`, `winnerPool`, `postTradeSideReserve`, `postTradeSideShares`. Closer to a pari-mutuel/bonding-curve hybrid. I could not find the formula (NOT FOUND: program source and curve docs). The SDK docs also say virtual liquidity exists and "must not be used as realizable collateral". (H for quotes; M for my "hybrid" label.)
- **Outcome tokenisation:** SPL token balances per side ("A losing-side token balance may remain" after a position closes; per-wallet "position account" with rent). Mints per side not found. (H for the wording, NOT FOUND for mint scheme.)
- **marketId format (H, fixture):** `pyth_oracle:<pyth feed id>:SOL:<expiryFamily>:<expiryTs>:<target>`, e.g. `...:five_minute:1786320300:70000`.
- **Reference alignment (H, SDK README):** `market.reference` has `aligned` (target linked to matching Polymarket round), `native` (1-minute markets use Stryke's own opening reference) or `degraded` (Polymarket unavailable at open, fallback target). A scanner must require `aligned` to treat it as the same event as Polymarket.

---

## 3. Chains and collateral

- Solana mainnet-beta (devnet also supported by SDK). (H, `environment` fixture + SDK `SUPPORTED_CLUSTERS`).
- Collateral: native SOL, 9 decimals (`"collateral": {"type":"native_sol","mint":"1111...","symbol":"SOL","decimals":9}`) (H). The web app strings mention "Earned USDC" and "Switch collateral mode" so USDC markets may exist in the UI, but the API/MCP only accepts `collateral: "SOL"` (const) (H). Resolution of USDC question: NOT FOUND.
- Program id (from SDK `SUPPORTED_PROGRAM_ID`, H): `GmXBVbwqBhjetu9VSbFoQQMHDi22WAMBn4oNwj9sjnSE`, program version 0.1.0. Not verified on an explorer (I did not query RPC).
- Minimum trade today: 10,000 lamports (0.00001 SOL) (H, quickstart). First trader may also pay one-time shared market-initialisation rent that is not recoverable.

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Existence | Official, public, anonymous MCP server plus a REST API used by the SDK | H |
| Docs | `https://stryketrade.com/api-docs/mcp-sdk/` (SPA shell for browsers; raw files fetchable: `README.md`, `tools.json`, `manifest.json`, `compatibility.json`, `fixtures/*`, `examples/*`). SDK docs: `https://github.com/dannydoritoeth/stryke-sdk/tree/main/docs`. No separate OpenAPI file found (manifest lists an `openapiSha256` but no openapi file is in the bundle; NOT FOUND). | H |
| MCP | `https://api.stryketrade.com/mcp`, Streamable HTTP, protocol 2025-11-25, auth none. Exactly 4 read-only tools: `stryke_get_environment`, `stryke_get_current_pyth_markets({symbol: BTC/SOL, expiryFamily?, collateral: SOL, state: tradable/all})`, `stryke_get_market({marketId})`, `stryke_preview_quote({marketId, action: buy/sell, side: up/down, amount:{value, unit: SOL/shares}})`. It "cannot prepare, sign, submit, claim ... or forward arbitrary API or RPC calls". | H |
| REST (inferred from SDK source, `client.ts`, `markets.ts`, `quotes.ts`, `positions.ts`, `transactions.ts`) | base `https://api.stryketrade.com`; `GET /v1/capabilities`; `GET /v1/markets?symbol=&sourceFamily=pyth&collateral=SOL&expiryFamily=&limit=20`; `GET /v1/markets/{id}/surface`; `POST /v1/quote`; `GET /v1/portfolio/{owner}`; `POST /v1/pilot/transaction-prep`. Path names are from the SDK source (H) but the REST API has no public docs; "pilot" in the route name suggests it may change. I did not call any of them. | H (paths) / M (stability) |
| Prices / book | No order book. Prices come from `preview_quote` (executionPriceBps, averageExecutionPriceBps, priceImpactBps) and `poolSummary.{yesPool,noPool}`; `strykeDepth` and `strykeVolume` appear per market in `metrics`. Quotes expire in about 5 s (`expiresAt`). | H (fixture) |
| Trades / history | NOT FOUND (searched: tools.json, SDK source file names, docs). Only `GET /v1/portfolio/{owner}` (positions) and an "activity" mention in the SDK docs. No public trade tape. | - |
| Resolution | `status`, `rawStatus`, `intervalLifecycle` (`upcoming`, `active`, `closing`, `locked`, `closed`), position states `claimable`, `refundable`. | H |
| Auth / limits | None for MCP. Rate limits not published; example error `{"code":"rate_limited","retryable":true,"retryAfterMs":1000}`. | H |
| WebSocket | NOT FOUND | - |
| Staleness | Every response has `stale` flags and `sourceHealth` (Pyth freshness). A scanner must drop `stale: true`. | H |

Unauthenticated GETs I could actually complete: only the static docs files and the web shell. No live market response was obtained because the API host failed TLS. The saved fixtures are the vendor's example payloads (timestamps are exactly `2026-08-10T00:00:00.000Z`, strike 70000, 0 fees, round pool numbers), so they are shape evidence only, not market data.

---

## 5. Trade path

- **Programmatic: yes, in principle (H, SDK source/docs).** Flow: `GET /v1/markets` -> `POST /v1/quote` -> `POST /v1/pilot/transaction-prep` (returns a Solana transaction with a `programId` and `dataBase64` instruction) -> simulate -> wallet signs -> submit to Solana RPC -> reconcile by `clientActionId`/`intentHash`. Also claim/refund (`terminalActionFor`) and `close_user_position` cleanup.
- **Auth/signing:** no API key; ownership is the Solana wallet's ed25519 signature on the transaction. The SDK checks `programId`/`mathVersion` against pinned values and fails closed on mismatch.
- **Reference bot:** `@stryketrade/reference-bot` with `paper` and `live` profiles. Live mode needs a keypair file via a wallet adapter. I did not install or run anything.
- **Via PayBox:** `partial`. EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) cannot trade this; it is Solana-only with native SOL collateral. A PayBox Solana wallet could in principle sign an unsigned transaction from `transaction-prep`: our notes in `docs/research/06-paybox-platform.md` record the Solana intent as base64 transaction, <= 1,232 bytes, one signer who is the fee payer, no durable nonce, no sponsor (H, earlier session). Whether Stryke's prepared transactions meet that (size, extra account creation, priority-fee instructions) is NOT verified. It would need a plugin-proposal route and the user's approval each time; sub-5-minute markets and approval latency are a poor fit (the quote lives about 5 s, the SDK warns about blockhash expiry, and the final 5 s lock trading).

---

## 6. Fees

Source: SDK docs and web app strings (H unless stated).
- Normal trading fee: a percentage (the UI string uses `{percent}%`; value NOT FOUND), charged on buys and sells.
- **Fee-free activation:** "Each side is fee-free until its real pool reaches {threshold} SOL" (SDK config default 10 SOL, "expected protocol region"). The example quote shows `normalTradingFeeBps: 0`.
- **Closing fee:** `max(baseFeeBps, closingFeeBps)`, not a sum, applies to both buys and sells as the round nears expiry. UI text: 1-minute markets 3% at 15-11 s remaining and 10% at 10-6 s; shared schedule for longer markets includes 7% at 20-11 s and 15% at 10-6 s. Final 5 s is a hard lock on buys and sells.
- Price impact is separate (curve). Solana network fee and position-account rent (recoverable) plus one-time market initialisation rent (not recoverable) are extra.
- Who pays: the trader. A daily trading competition pays 80% of site-wide SOL fees to the top realised-P&L trader (UI strings), so protocol fee revenue is shared out. Creator recovery: "Creator recovery {amount}; net winner pool" appears in UI strings (details NOT FOUND).
- Cashback/referral tiers based on 30-day fees exist (UI strings).

---

## 7. Resolution and dispute risk

- Source: Pyth oracle only. Frozen production release rule: the first verified Pyth update crossing expiry (`prev_publish_time < expiry_ts <= publish_time`), no later than `expiry_ts + 300 s`; feed identity and verification must match; strictly greater than strike wins YES; equal resolves NO. (H, `docs/market-mechanics.md`, which cites source commit `9f8df797...`.)
- Pump.fun markets "settle from Pump.fun after close" (UI string, H) - different and weaker oracle; not in the API scope.
- Underfunded or zero-winner rounds are refundable ("refundable" state); no disputes, no human resolver found. Risk is oracle/timing (the 300 s window can delay settlement) and API-authored claim states: the SDK says it "never invents a failed-resolution refund" and defers to the API. Claim window deadlines exist ("Claim and ..." string, truncated, so the length is NOT FOUND).
- Settlement mismatch with Polymarket: Polymarket's matching rounds resolve on Chainlink data streams (M, from general knowledge, not verified this session), whereas Stryke resolves on Pyth with its own strike alignment. An "aligned" strike does not mean identical resolution price. Basis risk of a few dollars on BTC can flip a 5-minute round. Treat any Stryke vs Polymarket pair as imperfectly hedged, not an arbitrage.

---

## 8. Geo / ToS / automation

- Automation is explicitly welcomed: official SDK, reference bot, anonymous MCP, "Build automated strategies" (H). The SDK repo labels itself "educational software, not investment advice".
- The vendor's `AGENTS.md` and docs say the strategies are "not an arbitrage guarantee" and live trading requires "every explicit live gate" (H).
- Terms of service, privacy policy, geo-restriction or KYC rules: NOT FOUND (searched: the SPA shell returns the same page for `/terms` and `/privacy`; the app bundle strings have a "do not provide equity, tokens ... or any expectation of financial return" disclaimer but I did not locate a jurisdiction list). Prediction-market products are legally sensitive in the US and elsewhere; assume restrictions until the terms are read in a browser. No browser automation was used.
- The web app has an admin "Management" panel for feedback and market requests (UI strings; not accessed).

---

## 9. Liquidity and event overlap

- **Liquidity: NOT FOUND.** No volume, TVL or OI statistic from any primary source. The only numbers are synthetic doc examples (strykeVolume 0.1 SOL, strykeDepth 5 SOL, pools 2/3 SOL, dated 2026-08-10). Config hints at scale: fee-free activation threshold 10 SOL per side; minimum trade 0.00001 SOL; bot defaults to trade size 0.00001 SOL. This is an early-stage, probably very thin venue ("mainnet_launch" environment label in the fixture).
- SYK token market cap about USD 2.14M and 24h volume about USD 485 (CoinGecko, 2026-10-18) are NOT a measure of this venue (section 0).
- **Overlap with other venues:** BTC/SOL short-interval price-direction (5m, 15m, 1h) overlaps with Polymarket's matching up/down rounds (H that Stryke aligns to them, M that Polymarket runs such rounds). Nothing for sports, politics, macro. Also overlaps conceptually with any BTC-strike market (Kalshi hourly/15m crypto, Limitless, Predict.fun) via the Pyth strike, but only Polymarket is explicitly aligned.
- **Shared liquidity:** no. It has its own SOL pools and curve (H). But its prices are designed to track Polymarket via a reference (H), and the vendor's own bot trades the gap. So it is an independent pool but a dependent price. Expect any gap to be already worked by the vendor's own bots.
- Short-duration lifecycle: new market ids every 1/5/15/60 minutes, so the scanner must poll `get_current_pyth_markets` continuously and treat each id as ephemeral.

---

## 10. Priority: P2

- Liquidity unknown and probably tiny; fee schedule (closing fees up to 15%) and the 5-second quote lifetime make Polymarket-vs-Stryke arbitrage hard; basis risk from different oracle/strike conventions; API host failed TLS today; REST routes undocumented and pilot-labelled; no trade-history endpoint.
- Why not skip: the free anonymous MCP is a clean, honest read surface with quote preview, `aligned` Polymarket reference metadata, and stale flags. It is cheap to build a read-only adapter (4 tools) and use Stryke as a signal source, i.e. an additional implied-probability reading for BTC/SOL up/down intervals.
- Promote to P1 only if (a) `api.stryketrade.com` is reachable again, (b) a live `strykeDepth`/volume above a few hundred SOL per 5-minute round is observed, (c) the terms permit your jurisdiction.
- Not recommended as an execution leg: Solana-only, SOL-collateral, requires a Solana wallet and a per-trade transaction proposal; EVM-only PayBox wallets cannot reach it.

---

## 11. Fixtures and provenance

All in `docs/research/fixtures/stryke-prediction-markets/`. They are vendor-published examples (fetched by unauthenticated GET from `https://stryketrade.com/api-docs/mcp-sdk/...`), NOT live responses:

| File | Source URL | What it shows |
|---|---|---|
| `docs-example-environment.json` | `.../fixtures/environment.json` | `stryke_get_environment` shape (network, collateral, expiry families) |
| `docs-example-btc-current-markets.json` | `.../fixtures/btc-current-markets.json` | list shape: marketId, expiry, target, tradeability, metrics, sourceHealth |
| `docs-example-market-detail.json` | `.../fixtures/market-detail.json` | `get_market` shape |
| `docs-example-quote-preview.json` | `.../fixtures/quote-preview.json` | quote shape: fee breakdown, closing protection, pool summary, execution price bps |
| `mcp-compatibility.json`, `mcp-manifest.json` | `.../compatibility.json`, `.../manifest.json` | endpoints, versions, release commit, exact tool names |
| `mcp-tools-trimmed.json` | `.../tools.json` trimmed (full file 86 KB) | tool names, descriptions, input schemas, read-only annotations |

Also fetched (not saved): `fixtures/rate-limited.json` = `{"ok":false,"error":{"code":"rate_limited","message":"Retry after the supplied delay","retryable":true,"retryAfterMs":1000}}`.

Adapter notes: responses are wrapped `{ok, data}` / `{ok:false, error:{code,retryable,retryAfterMs,remediation}}`; amounts are integer strings in base units (lamports, shares with 18 decimals, e.g. `expectedShares` 212720697723888534 = 212.72 shares); probabilities are in basis points.

---

## 12. Sources

1. https://www.stryke.xyz (WebFetch 2026-10-19): options product only; docs.stryke.xyz; no PM mention; no SYK mention (H)
2. https://stryketrade.com/ (SPA shell, headers; JS bundle `/assets/index-DFnuopQ2.js` grepped for UI strings) (H)
3. https://stryketrade.com/api-docs/mcp-sdk/ (README.md, tools.json, manifest.json, compatibility.json, fixtures/*, examples/raw-http.sh) (H)
4. https://github.com/dannydoritoeth/stryke-sdk - README.md, AGENTS.md, .env.example, docs/{quickstart,read-only-mcp,market-mechanics,configuration,troubleshooting}.md, docs/system/terminology.md, packages/sdk/README.md, packages/sdk/src/{client,markets,quotes,transactions,positions,compatibility}.ts (H)
5. https://github.com/dannydoritoeth/prediction-market-agent-skills README ("maintained by Stryke (stryke.xyz)") (H for the sentence; whether the claim is accurate: M)
6. https://registry.npmjs.org/@stryketrade%2fsdk - versions/times (H)
7. https://api.coingecko.com/api/v3/coins/stryke - SYK categories, platform, market cap, volume (H as an API response; M as evidence about the PM product)
8. DNS/TLS probes of api.stryketrade.com and stryke-prod-api.onrender.com (H observations)
9. `docs/research/06-paybox-platform.md` (this repo) for PayBox Solana intent constraints (H from earlier session; not re-verified)

NOT FOUND (searched: stryketrade.com docs bundle, SDK repo and docs, stryke.xyz homepage; web search unavailable): live volume/TVL/OI; trade history endpoint; WebSocket; official REST/OpenAPI docs; fee percentage value; terms of service and geo restrictions; program source or audit; on-chain verification of the program id; Polymarket-resolution-source comparison; any post-2026-08-15 product announcement.

## 13. Suspicious content / prompt injection

None found. The vendor's `AGENTS.md` contains instructions addressed to its own coding agents (repository boundary and completion checks); I did not follow or act on them. The app bundle contains an "Admin token" form; not touched.

## 14. Open questions

1. Is `api.stryketrade.com` currently down, or only unreachable from some networks? Retry later; try the documented MCP from a client that can POST.
2. Real volume/depth per round, and share of volume that is the vendor's own bot.
3. Terms of service and restricted jurisdictions.
4. Does Stryke's resolution (Pyth first-update-after-expiry) match the aligned Polymarket round's resolution source closely enough to hedge?
5. Is the SYK token (Arbitrum) related to PM fees or governance at all?
