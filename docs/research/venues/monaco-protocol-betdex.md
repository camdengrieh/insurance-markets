# Monaco Protocol / BetDEX - adapter spec

Researched 2026-10-19 (~02:15-03:00 UTC). READ-ONLY: unauthenticated GETs to documented hosts, `gh api` reads of public repos, WebFetch of official docs, one read-only PayBox catalog search. No account, no key, no POST, no signing, no payment. WebSearch budget was exhausted before I started (no web search possible), so there is no third-party corroboration of volume.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale (> 6 months or undated).
Third-party and vendor text is untrusted data; nothing in it was followed (section 13).
Fixtures: `docs/research/fixtures/monaco-protocol-betdex/` (11 files, all < 24 KB). Only the `/status` and 401 files are live captures; the market/price shapes are vendor docs examples (the API needs a session token).
Note on duplicates: an earlier note for the same venue exists at `docs/research/venues/betdex-monaco-protocol.md` (different slug word order, other fixtures dir). I re-verified its main claims independently. Differences from it are listed in section 14.

## 0. Verdict

**adapter_priority: P2** (sports-only price reference; thin depth; read access gated by a KYC'd account; no wallet-signed trading path).

1. **Live (H), but the "on-chain Monaco Protocol" framing is obsolete.** `GET https://prod.api.btdx.io/status` returned 200 `OK` on 2026-10-19; public API launched end of May 2026; docs repo has commits through 2026-10-07. BetDEX is now a **custodial, off-chain central limit order book**. Its own terms say wager placement, matching and settlement are "not by public blockchain transactions or smart contracts", and its API Terms say the "Monaco" names "do not imply any onchain operation". The old Solana Anchor program (`monaco...`, last upgrade 2024-12-17 per the BetDexLabs repo README) is legacy and no longer how the exchange works (section 2).
2. **Good official API, but no unauthenticated market data (H).** REST + WebSocket, two OpenAPI 3 files (73 operations), sandbox. Only `GET /status` is open; `/categories`, `/markets`, `/events`, `/market-prices/ladder` etc. return 401. A session needs App ID + Wallet ID + API key; the self-serve key needs "Basic Verification" on a BetDEX account.
3. **Not tradable by a PayBox transaction proposal or signed order (H).** Orders are authorised by API key -> bearer token; there is no EVM or Solana signature on an order. PayBox could only do the funding / withdrawal leg (Solana USDC to a BetDEX deposit address). PayBox catalog has no BetDEX plugin (H, searched).
4. **Independent liquidity, but thin as far as evidenced (M/L).** Own matching engine. Only depth data: one docs snapshot (2026-10-07) with about $35-$81 per price level and roughly $720 total resting on a two-outcome NHL market; undated roadmap claim of "~$50k+ open liquidity" on key markets. No volume / OI / TVL published anywhere I could reach; not on DefiLlama.
5. **Sports only (H).** Overlaps with sports markets on Polymarket, Kalshi, Novig, ProphetX and XO sports; no politics, crypto price or macro.
6. **BetDEX invites exactly this use case (H):** its Builder Program lists a "Cross-venue arbitrage agent - monitors BetDEX vs Betfair, Polymarket, Kalshi", a "Price Comparison tool" and an MCP server as paid bounties. But the API Terms (which I could read this time) bar redistributing API output and running a commercial service for third parties without written permission (section 7). Get written permission before showing BetDEX prices to other users.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://prod.api.btdx.io/status` (no auth) | HTTP 200 `{"statuses":[{"status":"OK","message":"","lastUpdate":"2026-10-19T02:20:55Z"}]}` (fixture `prod-status-unauth-2026-10-19.json`) | H |
| `GET https://sandbox.api.btdx.io/status` | HTTP 200 OK (fixture `sandbox-status-unauth-2026-10-19.json`) | H |
| `https://www.betdex.com/` | HTTP 200, `last-modified: Thu, 15 Oct 2026 15:57:03 GMT`, title "BetDEX - Betting Exchange - Best Odds - No Premium Fees" | H |
| `status.betdex.com/api/v2/summary.json` | "All Systems Operational"; components Website, API, Brokerage; page `updated_at` 2026-07-16 (fixture `statuspage-summary-2026-10-19.json`) | H |
| Dev FAQ: "BetDEX launched their API to the public at the end of May 2026." API Terms "Last Updated: May 25, 2026" | developers.betdex.com/faqs.md; terms.btdx.io/betdexApi/1.0.0.pdf | H |
| Docs repo `BetDexLabs/mintlify-docs` (public): 12 commits listed 2026-08-12 .. 2026-10-07 (stream-api, faqs, index, building-an-app) | `gh api repos/BetDexLabs/mintlify-docs/commits` | H |
| OpenAPI files `last-modified: Thu, 15 Oct 2026 08:51:36 GMT` | HTTP headers | H |
| Consumer ToS "Last updated: July 1, 2026"; accounts migrated to an Anjouan licence effective 2026-07-01 | learn.betdex.com terms-of-service | H |
| Weekly commission-rebate promo runs "Monday 12th October until Sunday 25th October" (year not printed; 12 Oct 2026 is a Monday) | learn.betdex.com promos/high-volume-commission-discount | M (year inferred) |
| Third-party aggregator AGG lists `betdex` as a trading venue (off by default, hosted account, Solana USDC) | docs.agg.market/venues/overview.md | M |
| `monacoprotocol.xyz` -> HTTP 302 -> `https://www.betdex.com/developers`; `docs.api.monacoprotocol.xyz` still serves the OpenAPI files | curl -I | H |
| GitHub org `MonacoProtocol`: `public_repos` 0, updated 2026-04-24, created 2022-08-04. Org `BetDexLabs`: 6 public repos, `protocol` last pushed 2024-12-19 | `gh api orgs/...` | H |

Conclusion: the venue is live and actively maintained in Oct 2026 (H). The SoK catalogue hint ("Active, CLOB, Solana, Centralized oracle, Operator governance") is directionally right about the operator and CLOB, wrong about on-chain operation.

## 2. What it is

- **Kind**: centralised peer-to-peer sports betting exchange (Betfair style), operated by Stucktaymore Limited, a subsidiary of BetDEX Labs, Inc.; Anjouan (Union of Comoros) licence No. ALSI-092404022-FI2 (H, ToS Appendix 1). Founders listed as Nigel Eccles, Varun Sudhakar, Stuart Tonner; "Betfair, BETDAQ, FanDuel" veterans (H, learn.betdex.com about-us/betdex-labs).
- **Hybrid design (H, learn.betdex.com how-does-betdex-utilise-blockchain-tech)**: each user gets a "Solana-based custodial wallet" whose keys BetDEX holds, used for funding and withdrawal only. "Betting is done off-chain, via a simple REST API call." Matching is FIFO price-time. "All markets are created & managed off-chain." Consumer ToS: "wager placement, matching, settlement, and record-keeping are governed by BetDEX's internal systems and records, not by public blockchain transactions or smart contracts." API Terms section 1: "Monaco" naming "do[es] not imply any onchain operation, DAO governance, or relationship with any foundation, token, or successor entity."
- **Legacy on-chain Monaco Protocol (L/M)**: `BetDexLabs/protocol` README (Apache-2.0, pushed 2024-12-19) lists a Solana mainnet-beta program `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih`, version 0.15.5 upgraded 2024-12-17, Sec3 audits. I did not query the chain (no GET-only RPC), so whether that program still holds live markets is **NOT VERIFIED**; the current exchange does not use it per BetDEX's own terms.
- **Market model (H)**:
  - Order book with back / lay semantics. Order `side` is `For` (back) or `Against` (lay) in the order request; price is **decimal odds** on a fixed ladder: min 1.01, max 1000, steps 0.01 to 2, 0.02 to 3, 0.05 to 4, 0.1 to 6, 0.2 to 10, 0.5 to 20, 1 to 30, 2 to 50, 5 to 100, 10 to 1000 (learn.betdex.com valid-decimal-and-american-odds).
  - `stake` is always the backer's stake; a lay risks `stake * (price - 1)`.
  - Binary and **categorical** (1X2, correct score) markets; each handicap or total line is its own market (`marketValue` / `marketDiscriminator`). No scalar markets. Two-outcome markets run **cross-matching** (back A at 1.50 appears as lay B at 3.00); 3-way and correct-score do not (learn.betdex.com cross-matching).
  - **No tokenisation**: positions are ledger entries (`GET /wallets/{id}/positions`), not tokens. Nothing is composable on-chain.
  - Pre-play and in-play. Bet delay: tennis 3 s, basketball and MLB 0 s, all else 5 s (dev FAQ). Learn page says 5 s except tennis 3 s (minor conflict).
  - Order flags: `matchBehavior` `RetainUnmatched | CancelUnmatched` (fill-and-kill), `keepWhenInPlay` (required), optional `reference`, `commissionRateId`. `POST /orders/batch` up to 50. Partial fills. Optional app-level heartbeat blocks new orders and cancels open ones if heartbeats stop.
- **Market status enum (H, OpenAPI)**: `Initializing | Open | Locking | Locked | Settling | Settled | Voiding | Voided | Closed`; plus `published`, `suspended`, `inPlayStatus` (`NotApplicable | PrePlay | InPlay`), `lockAt`, `settledAt`, `marketLockAction` / `eventStartAction` (`None | CancelUnmatchedLiquidity`).
- **Chains and collateral (H)**: ledger currency is USDC on Solana ("converted to USDC instantly"). Deposit: BTC, SOL, USDC, USDT to a per-currency/network temporary address; "Ethereum deposits are also coming very soon" (page undated, screenshots from 2025-01, possibly stale). Withdraw: USDC via Solana (SPL, no fee) or Ethereum (ERC-20); USDT via Tron, Solana or Ethereum; BTC; SOL. Non-Solana-USDC routes are converted via a third party with conversion fees and higher minimums. Fiat (MoonPay / Skrill / PayPal) is mentioned on some pages. `GET /currencies` (needs auth) rows carry `networkId` and `mint` so the exact list is unverified.

## 3. Read API

| Item | Value | Tag |
|---|---|---|
| Docs | `https://developers.betdex.com/` (Mintlify; `/llms.txt`, each page also at `.md`). User docs `https://learn.betdex.com/betdex-exchange/` (GitBook, `.md` suffix works) | H |
| OpenAPI | `https://docs.api.monacoprotocol.xyz/api/v1/exchange-openapi-general.json` (app-key API, 273,826 bytes, 73 method+path pairs, title "BetDEX General Integration API" v0.1) and `.../exchange-openapi-wallet-key.json` (241,412 bytes, 56 pairs: the wallet-key subset). Index in fixture `openapi-endpoint-index.json`, key schemas in `openapi-schema-excerpts.json` | H |
| REST base | prod `https://prod.api.btdx.io/`, sandbox `https://sandbox.api.btdx.io/` | H |
| WebSocket | prod `wss://prod.stream.btdx.io`, sandbox `wss://sandbox.stream.btdx.io` | H |
| Auth | `POST /sessions` `{appId, walletId, apiKey}` (walletId only if the key type is `WALLET`) -> access + refresh tokens; `Authorization: Bearer <accessToken>` on every call. Access token 30 min; refresh token 1 week, `POST /sessions/refresh` extends 30 min. | H |
| What is open | Only `GET /status`. `GET /categories`, `/markets`, `/events`, `/currencies`, `/market-types`, `/market-prices/ladder` all returned `401 {"title":"Unauthorized","details":["authorization header required"]}` on 2026-10-19 (fixtures `prod-categories-unauth-401-...json`, `prod-markets-unauth-401-...json`) | H |
| Getting a key | User-level (wallet) key: self-serve in the BetDEX account UI ("Generate API Key"), requires "Basic Verification" (personal details); "it cannot be retrieved again". App-level key (create wallets, deposits, withdrawals, commission rates, heartbeat): "contact us on api@betdex.com and we'll get an App set up". Sandbox key: create an account on `sandbox.betdex.com`. | H |
| User-Agent | CloudFront returns 403 without a User-Agent. The generic `insurance-markets-research/0.1` worked for `/status`. | H |
| Rate limits | REST 5000 requests/min. Stream: 10 active connections, 500 active subscriptions, 500 subscriptions/min; use wildcard `"*"` above 500 markets. Idle connection timeout 10 min (send PING or any message), max connection duration 2 h (reconnect), "hard limits with the implementation we have at the moment". | H (dev FAQ, stream-api) |
| Latency | Order confirmation ~0.08 s (excluding in-play delay); vendor claim | M |

**Key endpoints (all need the bearer token; names from OpenAPI, descriptions from docs):**
- Discovery: `GET /categories` ("Currently this is just SPORTS"), `/subcategories` (sports), `/event-groups` (leagues), `/events` (filters `eventGroupIds`, `starting` Live|Today|Later|Range, `active`, `fromDateTime`, `toDateTime`, paging), `/events/{id}/participants`, `/markets` (filters `ids, ownerAppIds, eventIds, marketTypeIds, currencyIds, statuses, inPlayStatuses, fromDateTime, toDateTime, published, page, size, sort`), `/market-types`.
- Books: `GET /market-prices?marketIds=[...]&includeEmpty&directOnly` (many markets per call), `GET /markets/{id}/prices` and `/prices-v2`. Rows `{side, outcomeId, price, amount, matched}`. **`side` is what is already resting**: `Against` at price P with `amount` A = A available to BACK at P; `For` at P = A available to LAY at P. `amount` is backer stake. Full depth is returned ("all market prices/liquidity will be available"). `directOnly=true` strips cross-matched derived liquidity. Best back = highest `Against` price; best lay = lowest `For` price.
- Trades/history: `GET /trades` (by market/wallet/order, paged), `/orders` (all orders visible with owner identifiers stripped), `/markets/{id}/orders`, `/markets/historical` (settled, offset paging), `/orders/historical`, `/trades/historical`, `/wallets/{id}/positions`.
- Resolution: market `status`, `settledAt`; REST `GET /markets/{id}`; stream `MarketStatusUpdate`, `MarketUpdate`, `OrderUpdate` (Won / Lost / Voided), `EventUpdate` (`active:false`).
- Cross-venue linking helpers: `GET /external-reference-sources` (returns `{code, description}`; contents need auth, NOT verified), `/markets/by-reference/{source}/{reference}`, `/events/by-reference/...`, `/participants/by-reference/...`, `/subcategories/by-reference/...`. Event `code` pattern in a docs example: `NHL-washington-capitals-v-pittsburgh-penguins-1791415800` (group-team slugs-unix start; 1791415800 = 2026-10-07T23:30:00Z = the example `expectedStartTime`) (M, one sample).
- Stream subscriptions: `EventUpdate`, `MarketUpdate`, `MarketPriceUpdate` (all prices incl. cross-matched), `MarketDirectPriceUpdate`, `MarketStatusUpdate`, `OrderUpdate`, `WalletUpdate`. Handshake: `{"action":"authenticate","accessToken":...}` then `{"action":"subscribe","subscriptionType":...,"subscriptionIds":["*"]}`. `MarketPriceUpdate` has `updateType` `Snapshot | Incremental`; rows `{side, outcomeId, price, liquidity, change, validAt}`. Docs do not define Snapshot vs Incremental or `change`.

**Response shapes I could confirm live: only `/status` and the 401 body.** Price and market shapes come from vendor docs examples (fixtures `docs-example-market-prices.json`, `docs-example-stream-price-snapshot.json`, `docs-example-stream-event-update.json`) and from the OpenAPI schemas (`Market`, `Event`, `Trade`, `MarketLiquidity`). Inconsistencies a parser must tolerate: REST price rows use `amount`, stream rows use `liquidity`; the `OrderUpdate` stream message uses a different outcome field name than the REST request (per docs); the incremental docs example looks illustrative.

## 4. Trade path

- **Programmatic: yes, official.** `POST /orders`, `POST /orders/batch` (max 50), `POST /orders/{id}/cancel-v2`, `POST /orders/cancel-v2`. Body `{walletId, marketId, side: For|Against, outcomeId, price, stake, keepWhenInPlay, matchBehavior?, reference?, commissionRateId?}` (required: `keepWhenInPlay, marketId, outcomeId, price, side, stake, walletId`).
- **Auth/signing: no cryptographic order signing.** Session bearer token from an API key. Keys can be deactivated and cannot be re-read.
- **Custody:** funds sit in BetDEX's custodial Solana wallet / internal ledger. Deposit address via `GET /wallets/{id}/deposits/addresses?currencyId=` (app-level key) or the website; withdraw via `POST /wallets/{id}/withdrawals` (app-level) or the website.
- **PayBox reachability: partial (funding leg only).**
  - Placing or cancelling an order from an EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) is impossible: there is no on-chain contract call to propose and no EIP-712 or ed25519 order to sign (H, API surface above).
  - What PayBox could do is move USDC on Solana to the per-user deposit address and receive withdrawals (Solana USDC, or ERC-20 USDC on Ethereum) (M: inferred from the funding pages; I did not call any PayBox money tool).
  - The BetDEX account must be created and verified by a human, and the API key would have to be held as a secret by whoever runs the adapter. Whether the plugin runtime can hold a per-user secret is a project question, not a BetDEX one.
  - `discover_plugins` query "betdex" returned an empty list (H, 2026-10-19). `discover_services` returned only unrelated third-party x402 sports-analytics services, none for BetDEX (H). AGG offers a hosted-BetDEX-account route (M), which implies BetDEX's app-level wallet creation is used commercially.
- **Execution notes for a taker leg (if ever built outside PayBox):** `matchBehavior: CancelUnmatched` gives fill-and-kill; the 5 s in-play delay makes in-play arbitrage unsafe, so restrict to pre-play; markets cancel unmatched orders at transition to in-play and at lock unless `keepWhenInPlay` is set.

## 5. Fees

| Item | Value | Tag |
|---|---|---|
| Commission | **1% of net profit per market**, paid by the user who profits; "no additional charges to trading via our API"; no maker/taker difference ("may change in the future") | H (dev FAQ; learn commission page) |
| Arb-leg formula | Let c = 0.01, d = decimal odds. Back stake S at d: win S(d-1)(1-c), lose S, so effective odds `d_eff = 1 + (d-1)(1-c)` and cost per $1 payout `1/d_eff`. Lay at d with backer stake S: risk S(d-1), win S(1-c); cost per $1 of payout on "not outcome" = `(d-1)/(d-c)`. Commission nets across positions in the same BetDEX market only, never across venues. | derived from H rules |
| App commission | App builders pay the same 1% and may add a product commission, rate 0.0-1.0 per `commissionRateId`, charged to their end users | H (building-an-app) |
| Volume rebate | Weekly tiers: > $50k traded 0.8%, > $500k 0.5%, rebated early the following week; volume = backer stake or layer risk. The page says "for the next 2 weeks" and dates it Mon 12 Oct - Sun 25 Oct (year inferred 2026): a time-limited promo, not a standing schedule | M |
| Other promos | 0% commission promos tied to World Cup 2026, partners and community codes; time-limited | L/M (page titles only) |
| Deposit / withdrawal | Crypto deposits "NO FEES"; withdrawal of USDC on Solana has no fee; other currencies/networks incur third-party conversion plus network fees and higher minimums. Exact schedule NOT FOUND. | H / NOT FOUND |
| Builder rev-share (for builders, not traders) | 10% / 15% / 20% of fees back for $0-500k / $500k-5m / $5m+ volume, 12 months; 25% affiliate share for public tools that source traders | H (builder program page) |
| Hint correction | The "3% on net winnings" figure from older descriptions is outdated; every current vendor page says 1% | H |

## 6. Resolution mechanism and dispute risk

- **Operator-settled, off-chain (H):** "BetDEX Markets are settled by the BetDEX Operations team", typically within 30 minutes of event end, using official sources, multiple reputable sources where appropriate, and the governing body's result if sources conflict.
- **No oracle, no challenge window.** Exchange rule 16: "In the case of any settlement disputes, BetDEX's decision is final." Rule 14: BetDEX may suspend any market at its sole discretion; rule 15: rules can change with immediate effect.
- **Void rules (H, exchange-rules page):** event not completed within three days of the original scheduled completion -> void (except unconditionally determined markets); venue moved to the opponent's ground -> void (neutral-venue exceptions for major tournaments); team/competitor DQ, withdrawal or forfeit after the start counts as a loss if another competitor completes; soccer = 90 minutes plus stoppage unless stated. ToS: a postponed match stands if rescheduled within 72 h of the original start, otherwise voided. Void returns stake to the wallet.
- **Programmatic status:** market `Settled | Voided | Closed`; `OrderUpdate` Won / Lost / Voided; cancelled or postponed-and-voided shows `Market Status = Voided, Event Active = False` (dev FAQ).
- **Risk summary:** custody and counterparty risk on a licensed-offshore operator (Anjouan licence, migrated from an Irish licence on 2026-07-01), sole-discretion settlement, instantaneous rule changes. Arbitrage consequence: rule mismatch with Polymarket / Kalshi on voids, overtime, postponement windows and "official result" definitions can turn a locked arb into a one-sided bet. Link by rules, never by titles.

## 7. Geo, ToS, automation

- **Geo (H, consumer ToS Appendix 3):** non-exhaustive prohibited list: Afghanistan, Belarus, Burundi, Central African Republic, Cote d'Ivoire, Cuba, DR Congo, Guinea, Guinea-Bissau, Iran, Iraq, North Korea, Libya, Mali, Myanmar, Russia, Sudan, Somalia, South Sudan, Syria, Tunisia, Venezuela, Yemen, Zimbabwe. "BetDEX is available only in jurisdictions shown as available during account registration." The US is not on the list but eligibility is decided at registration, so US availability is **NOT CONFIRMED** (AGG docs say each venue restricts its own countries and the AGG fill returns 403 for the US on Polymarket; AGG's BetDEX policy is behind an app id, not read).
- **KYC (H):** email verification (code), 18+, "Basic Verification" required to generate an API key, more documents (source of funds, wallet info) on request or before withdrawals. One account per person; the account must be for "your own personal use and ... not acting on behalf of any third party". Governing law UK (consumer ToS) / Delaware (API Terms).
- **API Terms of Use v1.0.0 (last updated May 25, 2026) - READ this time (H; `terms.btdx.io/betdexApi/1.0.0.pdf`, 8 pages, text extracted with macOS PDFKit).** Relevant clauses:
  - s5/s13: licence is "limited, non-exclusive, non-transferable, non-sublicensable, revocable ... solely for your internal business purposes and your approved Customer Applications"; "you may use API output solely as necessary to operate your approved Customer Application and internal business functions"; no "resell, redistribute, sublicense, publish, or commercially exploit API output as a standalone data feed, stream, database, analytics product".
  - s7 prohibits: making "any API output available to third parties on a standalone or independent basis"; using API output to "build, train, fine-tune, benchmark, or improve a competing product or service, or publish any performance comparison or test results ... without BetDEX's prior written consent"; circumventing or exceeding rate limits; "operat[ing] a commercial product or service for third parties that depends on the API Services, except as expressly permitted by BetDEX in writing".
  - s11: "If you are an individual using the API Services solely for your own personal or algorithmic trading activity ... references to Customer Applications and end users apply to your scripts, bots, and personal integrations". So personal bots are expressly contemplated.
  - s3/s10: BetDEX may change or discontinue endpoints, schemas, rate limits with or without notice; no uptime guarantee; s17 may suspend on suspicion. s12: API use "may be subject to fees" per a developer-portal fee schedule (none published that I found). Notices: `legal@betdex.com`.
  - Nothing mentions arbitrage explicitly (neither allowed nor banned). The Builder Program page lists a cross-venue arbitrage agent and a price-comparison tool as desired builds (H), which is informal evidence of intent, not a licence.
- **Consumer ToS s16 (H):** forbids "any non-BetDEX automation code ... (including any 'bot' or 'spider')" and bulk or systematic harvesting of information from the Site or Services; also forbids forging headers or manipulating identifiers to disguise identity. The API Terms are the separate governing document for API use and say the Exchange ToS "may apply in parallel" if you also use the exchange as an end user. Net: use the official API only, never scrape betdex.com, and do not copy the docs' suggested `BetMonitor/1.0` User-Agent.
- **Docs footer (H):** "BetDEX API is NOT a licensed gambling product/service offering." Third-party product use is legally ambiguous; flag for counsel before any commercial plugin.
- **Net for the project:** a read-only adapter for the project owner's own account and internal scanning looks permitted; surfacing BetDEX prices to other plugin users or trading on behalf of others needs written permission from `api@betdex.com` first.

## 8. Liquidity (no volume figure published)

| Evidence | Value | Date | Tag |
|---|---|---|---|
| Learn roadmap page: "Key betting markets now have ~$50k+ of open liquidity to be bet against" | vendor claim; page undated and partly stale (lists cross-matching as "in progress" while the cross-matching page, with a 2026-07-30 screenshot, says it is live) | undated | L |
| Docs stream snapshot, market 898792 (event 28282 NHL Capitals v Penguins, two outcomes), `MarketPriceUpdate` Snapshot | 15 price rows. Outcome 2067060: back-able at 1.97/2.00/2.06/2.08 ($40.61, $50, $38.77, $47.65), lay-able at 2.16/2.22/2.26 ($46.30, $81.39, $35.55). Outcome 2067061: best back 1.86, best lay 1.91. Sum of all resting liquidity about $720 (includes cross-matched derived rows). Spread on outcome 2067060 about 1.8 probability points (back 2.08 vs lay 2.16) | 2026-10-07 | M (docs example, looks real, unverified) |
| Docs REST example (building-an-app) | levels of $5-$38 | undated; image on the same page dated 2026-07-29 | M/L |
| DefiLlama | `api.llama.fi/protocols` (8758 entries, fetched 2026-10-19) has no entry whose name, slug, url or twitter contains betdex, monaco or purebet | 2026-10-19 | H (negative) |
| cleatz.com/prediction-market-revenue (venue table) | BetDEX / Monaco not listed | 2026-10-19 | H (negative) |
| Volume / OI / TVL | NOT FOUND (searched: dev docs, learn docs, roadmap, FAQs, status page, DefiLlama protocol list, cleatz; no public stats endpoint; web search unavailable) | | |
| Builder Program revenue tiers ($0-500k / $500k-5m / $5m+ volume) | per-builder tiers, no platform total | 2026 | L |
| BetDEX "Brokerage" for stakes above book liquidity | status component exists on the status page; mechanism and counterparty NOT FOUND; do not assume it adds public depth | 2026-07-16 | M |

For scale only: peer sports venue Novig reports about $1.4B monthly notional in the sibling note (`docs/research/venues/novig.md`, cited there to Cleatz). BetDEX publishes nothing comparable and the sample depth is three orders of magnitude smaller per market. Treat BetDEX as thin until an authenticated sample proves otherwise.

## 9. Event categories and overlap

- **Categories (H):** SPORTS only. Sports and leagues listed (learn sports-and-competitions, undated): NFL, NCAAFB, MLB, NPB, NBA / NBA Cup, college basketball, Euroleague, German BBL, FIBA, NHL, KHL, IIHF, ATP and WTA tennis, plus about 80 football leagues and cups (EPL, Championship, Serie A/B/C, La Liga 1/2, Ligue 1/2, Bundesliga 1/2/3, MLS, Liga MX, Brasileirao, Eredivisie, UCL / UEL / UECL and others). Learn rules pages also list cricket, golf, boxing, MMA, esports, racing, rugby, darts, snooker, chess but the availability table shows only partial coverage. Outright markets "Coming soon". FAQ claims "100+ sports' leagues". Legacy 2024 US-election rules pages remain but no politics, crypto, macro or weather markets are offered (H for the sports list; M for the absence of other categories).
- **Market types (H):** football full-time result, totals, goal handicaps, correct score, BTTS, half-time result / goals; tennis match winner, set 1 winner; NFL / MLB / NBA moneyline, totals, handicaps plus half variants; NHL moneyline / period lines. Corners / cards on request.
- **Overlap with other venues:** sports moneyline, spread and total contracts on Polymarket (global and US), Kalshi, Novig, ProphetX, SX Bet and sports markets on XO Market. Not an overlap venue for politics, crypto price or macro.
- **Likely role:** a reference sports price (market makers there quote near consensus; BetDEX advertises "best odds", M) and, only for a human-operated KYC'd account, an executable leg.

## 10. Shared liquidity

NOT FOUND any sign that BetDEX routes to or mirrors another venue; it runs its own matching engine and operator-created markets, so its book is **independent** of Polymarket and Kalshi (H for "own engine" per ToS and how-it-works page). Caveats: (a) AGG (a third-party aggregator) trades on BetDEX through a hosted account, but that adds order flow, not shared liquidity (M); (b) market makers quoting BetDEX almost certainly hedge on Betfair / Pinnacle-style books, so prices correlate with traditional sportsbooks (M, inferred); (c) whether Purebet (another app that used the on-chain Monaco Protocol) shares BetDEX's book is NOT FOUND and unlikely now that matching is off-chain.

## 11. Adapter sketch (if built)

- **Auth:** App ID + Wallet ID + wallet API key held as a secret; `POST /sessions`; refresh every <30 min with the refresh token (1 week, then recreate the session). Send the generic User-Agent.
- **Normalise to probability:** buy-outcome cost `1/d_eff_back` and sell-outcome (lay) proceeds from `(d-1)/(d-c)` with c = 0.01. Careful with the resting-side naming: resting `Against` rows = liquidity for backers; resting `For` rows = liquidity for layers.
- **Fetch:** `GET /events?starting=Later&active=true&eventGroupIds=...` -> `GET /markets?eventIds=...&statuses=Open` -> `GET /market-prices?marketIds=[...]` in batches, well under 5000 req/min; or one wildcard `MarketPriceUpdate` subscription. Rebuild books from `Snapshot` then apply `Incremental` (semantics not documented, so verify on sandbox); PING < 10 min; reconnect < 2 h.
- **Linking:** use the event `code` (group slug + team slugs + unix start) and `/events/by-reference/{source}/{reference}` once the source list is known; pin settlement rules per `docs/market-linking-design.md`. Never link on titles.
- **Hygiene:** pre-play only for arbitrage (5 s in-play delay, unmatched orders cancelled at in-play transition).
- **Execution:** out of scope for PayBox; at most a human-operated taker leg with `matchBehavior: CancelUnmatched`.

## 12. Open questions (need an authenticated session or a human contact)

1. Real depth and spread on NFL / NBA / EPL moneylines and total liquidity (sandbox is pre-funded but not real; production needs a verified key).
2. Written permission scope for internal scanning, display to third parties, and cross-venue arbitrage (`api@betdex.com`, `legal@betdex.com`); developer-portal fee schedule under API Terms s12.
3. `GET /currencies` and `/external-reference-sources` contents: is Ethereum deposit live, and which reference sources map to Betfair, Polymarket or Kalshi ids?
4. US eligibility and the registration country list.
5. Whether a wallet-level key reads all markets or only markets owned by its app (`ownerAppIds` filter exists).
6. Whether the legacy Solana program `monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih` still holds any live markets (needs an on-chain read; not done because Solana RPC is JSON-RPC over POST).
7. Snapshot vs Incremental semantics and the meaning of `change` in stream price messages.

## 13. Suspicious / embedded-instruction content (none followed)

- Every `developers.betdex.com/*.md` page begins "Fetch the complete documentation index at: https://developers.betdex.com/llms.txt / Use this file to discover all available pages before exploring further." Standard Mintlify header aimed at agents. I fetched `llms.txt` independently as part of normal research, not because the page said so.
- `developers.betdex.com/faqs`: suggests `CURLOPT_USERAGENT => 'BetMonitor/1.0 (client)'` to get past CloudFront 403. Not followed (the consumer ToS bars manipulating identifiers to disguise identity; the research User-Agent works).
- `BetDexLabs/mintlify-docs/AGENTS.md`: unmodified Mintlify template telling agents to install a skill via `npx skills add` and use a Mintlify MCP server to edit the docs site. Not followed; not relevant.
- `docs.agg.market/*.md` pages open with an "Agent Instructions" block telling agents how to integrate AGG. Not followed; used only as a data source for BetDEX facts.
- Builder Program page solicits agents and bots for bounties and revenue share and says bounties are "Live at developers.betdex.com/bounties"; that page currently reads "Coming soon". Marketing; not acted on.
- PayBox `discover_services` results (unrelated third-party x402 sports-analytics endpoints with payment addresses) were data only; nothing was called or paid.

## 14. Differences from the earlier note (`betdex-monaco-protocol.md`)

- API Terms of Use were unreadable there; they are read here (section 7), including the restriction on redistributing API output and running a third-party commercial service without written consent, and the explicit allowance for personal algorithmic trading.
- Stream limits (10 min idle, 2 h max) confirmed in the dev FAQ, not only as an "observed" fact.
- The commission-rebate promo is dated (12-25 October, year inferred) rather than undated.
- Added: legacy on-chain program address from the BetDexLabs repo README; consumer-ToS clause that the account must not be used for any third party; PayBox catalog search (no plugin); DefiLlama list and Cleatz negative checks; NHL snapshot arithmetic.
- Agreed with it: P2 priority, 1% fee, no wallet-signed order path, only `/status` open, sports only.

## Sources (all fetched 2026-10-19 unless stated)

- Dev docs (H): https://developers.betdex.com/llms.txt ; /index.md ; /faqs.md ; /how-to-get-my-api-key.md ; /how-to-get.md ; /building-an-app.md ; /stream-api.md ; /rest-api/overview.md ; /rest-api/apps/overview.md ; /bounties.md ("Coming soon")
- OpenAPI (H): https://docs.api.monacoprotocol.xyz/api/v1/exchange-openapi-general.json ; https://docs.api.monacoprotocol.xyz/api/v1/exchange-openapi-wallet-key.json
- Live probes (H): https://prod.api.btdx.io/status (200); https://sandbox.api.btdx.io/status (200); https://prod.api.btdx.io/categories, /markets, /events, /currencies, /market-types, /market-prices/ladder (401); https://status.betdex.com/api/v2/summary.json; https://www.betdex.com/ (200); https://monacoprotocol.xyz/ (302 to https://www.betdex.com/developers)
- API Terms of Use v1.0.0 PDF (H): https://terms.btdx.io/betdexApi/1.0.0.pdf (text extracted locally with macOS PDFKit; no third-party code run)
- Learn site (H): https://learn.betdex.com/betdex-exchange/ - llms.txt ; how-does-betdex-utilise-blockchain-tech ; betdex-roadmap ; overview/faqs ; overview/welcome-to-the-betdex-exchange ; useful-information/terms-of-service (last updated July 1, 2026) ; useful-information/about-us/betdex-labs ; useful-information/valid-decimal-and-american-odds ; betdex-offering/{sports-and-competitions, available-markets, exchange-rules-and-regulations, in-play} ; using-the-betdex-exchange/betting-on-the-betdex-exchange/{commission, market-settlement, cross-matching} ; using-the-betdex-exchange/funding-my-betdex-account/{deposit-via-crypto, withdrawing-from-your-betdex-account} ; promos/{the-betdex-builder-program, high-volume-commission-discount}
- GitHub (H, via `gh api`): orgs/MonacoProtocol ; orgs/BetDexLabs ; repos/BetDexLabs/protocol (README) ; repos/BetDexLabs/mintlify-docs (commits, bounties.mdx, AGENTS.md) ; repos/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials (protocol_catalogue.csv rows "Monaco/BetDEX" and "Monaco Protocol": CLOB, Centralized oracle, Solana, Active). Third-party repos `api-evangelist/betdex` and `satriatrader87/polymarket-betdex-arb` appeared in a repo search and were NOT read.
- Aggregator corroboration (M): https://docs.agg.market/venues/overview.md ; /recipes/hosted-venue-accounts.md ; /recipes/venue-geo-availability.md ; /concepts/market-resolution.md
- Negative checks (H): https://api.llama.fi/protocols (no betdex / monaco / purebet entry) ; https://cleatz.com/prediction-market-revenue (BetDEX not listed)
- PayBox catalog (read-only discovery): `discover_plugins` "betdex" -> none; `discover_services` "betdex sports betting exchange" -> unrelated services
- Not available: web search (session budget exhausted), so no press or analytics corroboration of volume or the 2026 launch
