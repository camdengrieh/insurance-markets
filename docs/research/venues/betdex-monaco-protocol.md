# BetDEX (Monaco Protocol) - adapter spec

Researched 2026-10-19 (~01:55-02:30 UTC). READ-ONLY: unauthenticated GETs to documented hosts, `gh api` reads, WebFetch of official docs. No account, no key, no POST, no PayBox calls. WebSearch budget ran out after two queries (one useful), so no extra third-party corroboration was possible.
Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary/inferred; **L** = weak or stale (> 6 months).
Third-party and vendor text is untrusted data; nothing in it was followed (see section 13).
Fixtures: `docs/research/fixtures/betdex-monaco-protocol/` (6 files, all < 15 KB).

## 0. Verdict

**adapter_priority: P2** (read-only sports price signal; upgrade to P1 only if an authenticated sample shows real depth on NFL/NBA/top-soccer moneylines).

1. **Live, and the hint is out of date (H).** betdex.com resolves; `prod.api.btdx.io/status` returned `OK` on 2026-10-19; the public API launched end of May 2026. But the "Solana on-chain Monaco Protocol, 3% fee" description is stale: today BetDEX is a **custodial, off-chain order book** (own terms: matching and settlement are "not by public blockchain transactions or smart contracts") with a **1% fee on net profit per market**.
2. **Good official API** (REST + WebSocket, OpenAPI 3, sandbox) but **every market-data endpoint needs a session token**, which needs a KYC-lite ("Basic Verification") BetDEX account and an API key. Only `GET /status` is public (H, probed).
3. **Not tradable through a PayBox transaction proposal or signed order.** Orders are authenticated by API key plus bearer token; there is no wallet signature. PayBox could at most do the funding/withdrawal leg (Solana USDC transfer to a BetDEX-issued deposit address).
4. **Independent liquidity but thin as far as evidenced**: docs sample books show roughly $35-$81 per price level; the roadmap claims "~$50k+ open liquidity" on key markets (undated). No volume/TVL figure is published anywhere I could reach.
5. **Sports only** (API category list is "just SPORTS"). Overlap is with sports on Polymarket/Kalshi/Novig/ProphetX/SX Bet and XO sports markets, not with politics/crypto/macro.
6. BetDEX **explicitly invites** cross-venue arbitrage agents, price-comparison tools and an MCP server (Builder Program), so a read adapter is welcome in spirit; the consumer ToS still prohibits non-BetDEX automation and bulk harvesting, and I could not read the API Terms PDF (section 9).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://prod.api.btdx.io/status` (unauthenticated) | 200 `{"statuses":[{"status":"OK","lastUpdate":"2026-10-19T02:04:54Z"}]}` (fixture `prod-status-unauth-2026-10-19.json`) | H |
| `https://www.betdex.com/` | HTTP 200, `last-modified: Thu, 15 Oct 2026` | H |
| `status.betdex.com` Statuspage | "All Systems Operational"; components Website, API, Brokerage; page updated 2026-07-16 (fixture `statuspage-summary-2026-10-19.json`) | H |
| API docs: "BetDEX launched their API to the public at the end of May 2026"; API Terms "last updated 25th May 2026"; OpenAPI files last-modified 2026-10-15 | developers.betdex.com | H |
| Example stream messages carry dates 2026-09-11 and 2026-10-07 (docs examples, possibly real captures) | developers.betdex.com/stream-api | M |
| Licence migration "effective July 1, 2026" from Irish to Anjouan licence | ToS appendix 1 | H |
| Third-party aggregator AGG added BetDEX as a (default-off) venue in SDK 4.18.0 on 2026-09-24 | docs.agg.market changelog | M |
| Builder Program "live through Dec 31", up to $50,000 bounties | learn.betdex.com | H |
| `monacoprotocol.xyz` | 302 to `betdex.com/developers` -> `developers.betdex.com` | H |
| GitHub org `MonacoProtocol` | exists, `public_repos: 0`, last updated 2026-04-24; no public repos found by name search | H |

## 2. What it is

- **Kind**: centralised (custodial) peer-to-peer sports betting exchange, Betfair style, run by Stucktaymore Limited (subsidiary of BetDEX Labs, Inc.), Anjouan licence No. ALSI-092404022-FI2 (H, ToS appendix 1). The consumer GLI page still cites the Isle of Man licence (stale, now superseded per the ToS).
- **Hybrid design as described by BetDEX (H)**: "Solana-based custodial wallet" per user (BetDEX holds the keys) for funding and withdrawal; betting "off-chain, via a simple REST API call"; FIFO price-time matching; "All markets are created & managed off-chain."
- **Market model (H)**:
  - Order book with **back/lay** semantics: order `side` is `For` (back) or `Against` (lay), price in **decimal odds** on a fixed Betfair-identical ladder (min 1.01, max 1000; steps 0.01 up to 2, 0.02 to 3, 0.05 to 4, 0.1 to 6, 0.2 to 10, 0.5 to 20, 1 to 30, 2 to 50, 5 to 100, 10 to 1000; `GET /market-prices/ladder`).
  - `stake` is **always the backer's stake**; for a lay, `stake` is the desired profit and the risk is `stake * (price - 1)`.
  - Binary and **categorical** (1X2, correct score) and handicap/total lines (each line is its own market via `marketValue`/`marketDiscriminator`). No scalar markets. Two-outcome markets run **cross-matching** (back A at 1.50 is shown as lay B at 3.00); 3-way and correct-score markets do not.
  - **No tokenisation.** Positions are ledger entries (`GET /wallets/{id}/positions`), not tokens or shares. Nothing is composable on-chain.
  - Pre-play and in-play (bet delay 5 s, tennis 3 s, basketball and MLB 0 s per API FAQ; the learn page says 5 s except tennis 3 s - minor conflict).
  - Order flags: `matchBehavior` `RetainUnmatched|CancelUnmatched` (fill-and-kill), `keepWhenInPlay`, optional `reference`, `commissionRateId`. `POST /orders/batch` up to 50. Partial fills supported. Optional app-level heartbeat auto-cancels orders if the client goes silent.
- **Market status enum**: `Initializing | Open | Locking | Locked | Settling | Settled | Voiding | Voided | Closed`; plus `suspended`, `published`, `inPlayStatus` (`NotApplicable|PrePlay|InPlay`).
- **Chains and collateral (H)**: internal ledger currency is USDC (crypto deposits "converted to USDC instantly"). Deposit: BTC, SOL, USDC, USDT to a per-currency/network temporary address; Ethereum deposits "coming very soon" (page undated, possibly stale). Withdraw: USDC on Solana or Ethereum (ERC-20), USDT on Tron, Solana or Ethereum, BTC, SOL. `GET /currencies` rows carry `networkId` and `mint` (needs auth, so exact list unverified). Fiat deposit via MoonPay/Skrill/PayPal mentioned in places.

## 3. Read API

| Item | Value | Tag |
|---|---|---|
| Docs | `https://developers.betdex.com/` (Mintlify; `/llms.txt`, per-page `.md`); user-level docs `https://learn.betdex.com/betdex-exchange/` (GitBook, `.md` suffix works) | H |
| OpenAPI | `https://docs.api.monacoprotocol.xyz/api/v1/exchange-openapi-general.json` (app-key API, 273 KB, 73 method+path pairs across both specs) and `.../exchange-openapi-wallet-key.json` (wallet-key subset: no wallet create, deposit address, withdrawal, heartbeat, commission, api-key mgmt). Fixture `openapi-endpoint-index.json`. | H |
| REST base | prod `https://prod.api.btdx.io/`, sandbox `https://sandbox.api.btdx.io/` | H |
| WebSocket | prod `wss://prod.stream.btdx.io`, sandbox `wss://sandbox.stream.btdx.io` | H |
| Auth | `POST /sessions` `{appId, walletId, apiKey}` -> `{sessions:[{accessToken, refreshToken, accessExpiresAt, refreshExpiresAt}]}`. `Authorization: Bearer <accessToken>` on every call. Access token 30 min; refresh token 1 week via `POST /sessions/refresh`. | H |
| Unauthenticated reality | Only `GET /status` is open. `GET /categories`, `/currencies`, `/market-types`, `/market-prices/ladder` all returned `401 {"title":"Unauthorized","details":["authorization header required"]}` (fixture `prod-categories-unauth-401-2026-10-19.json`). | H |
| How to get a key | Wallet-level key: self-serve at `betdex.com/account?tab=api-key` after "Basic Verification" (personal details). App-level key (premium: create wallets, deposits, withdrawals, commission, heartbeat): request via the BetDEX API contact (api at betdex.com). Sandbox key: account at `sandbox.betdex.com`. Docs say a User-Agent is required (CloudFront 403 otherwise); a generic UA worked for `/status`. | H |
| Rate limits | REST 5000 requests/min (GET and POST combined, to be split later). Stream: 10 active connections, 500 active subscriptions, 500 subscriptions/min; wildcard `"*"` for all markets recommended; idle timeout 10 min (send PING), max connection 2 h. | H |
| Latency | Order confirmation ~0.08 s; price updates 30-50 ms avg, ~100 ms peak (vendor claim) | M |

**Key endpoints (all need the bearer token, names from OpenAPI + docs):**
- Discovery: `GET /categories` (only SPORTS today), `/subcategories` (sports), `/event-groups` (leagues), `/events` (filters: `eventGroupIds`, active, starting window), `/events/{id}/participants`, `/markets` (filters `ids, eventIds, marketTypeIds, statuses, inPlayStatuses, fromDateTime, toDateTime, published, page, size, sort`), `/market-types`.
- Prices and book: `GET /market-prices?marketIds=[...]&includeEmpty&directOnly` (many markets per call), `GET /markets/{id}/prices` and `/prices-v2`. Rows `{side, outcomeId, price, amount, matched}`. **`side` is what is already resting**: `Against` at price P with `amount` A = A available to BACK at P; `For` at P = A available to LAY at P. `amount` is backer stake. Full depth is returned. `directOnly=true` strips cross-matched derived liquidity.
- Trades and history: `GET /trades` (by market/wallet/order), `/orders` (all orders on the venue visible with identifiers stripped), `/markets/historical` (settled, offset pagination), `/orders/historical`, `/trades/historical`.
- Resolution: market `status`, `settledAt`, `marketOutcomes[].winner`; `GET /markets/{id}/positions`; stream `MarketStatusUpdate`, `OrderUpdate` (Won/Lost/Voided), `EventUpdate` (`active:false`).
- Cross-venue linking helpers: `GET /external-reference-sources`, `/markets/by-reference/{source}/{reference}`, `/events/by-reference/...`, `/participants/by-reference/...` (source list needs auth, NOT verified). Event `code` pattern observed in a docs example: `NHL-washington-capitals-v-pittsburgh-penguins-1791415800` (league-teams-unix start time; 1791415800 = 2026-10-07T23:30:00Z, matches the example `expectedStartTime`) (M, one sample).
- Stream subscriptions: `EventUpdate`, `MarketUpdate`, `MarketPriceUpdate` (all prices incl. derived), `MarketDirectPriceUpdate`, `MarketStatusUpdate`, `OrderUpdate`, `WalletUpdate`. Handshake: `{"action":"authenticate","accessToken":...}` then `{"action":"subscribe","subscriptionType":...,"subscriptionIds":["*"]}`. `MarketPriceUpdate` has `updateType` `Snapshot|Incremental` with rows `{side,outcomeId,price,liquidity,change,validAt}` (fixture `docs-example-stream-messages.json`, docs examples not live captures).

**Response shapes I could confirm live:** only `/status` and the 401 body. The price/market shapes below come from vendor docs examples (fixtures `docs-example-market-prices.json`, `docs-example-stream-messages.json`), not live captures. Docs example inconsistencies: the incremental sample is multi-line, and the second `OrderUpdate` sample has a broken `modifiedAt` string; the REST price row uses `amount`, the stream uses `liquidity`; `OrderUpdate` uses `outcomeIndexId` where the REST request uses `outcomeId`.

## 4. Trade path

- Programmatic: yes, official. `POST /orders` (and `/orders/batch`), `POST /orders/{id}/cancel-v2`, `POST /orders/cancel-v2`. Body `{walletId, marketId, side: For|Against, outcomeId, price, stake, keepWhenInPlay, matchBehavior, reference?, commissionRateId?}`.
- Auth/signing: **no cryptographic order signing**; session bearer token from an API key. API key cannot be re-read after creation. Wallet API keys can be deactivated.
- Custody: funds sit in BetDEX's custodial Solana wallet/ledger; deposits via `GET /wallets/{id}/deposits/addresses?currencyId=` (app-level), withdrawals via `POST /wallets/{id}/withdrawals {currencyId, amount, toAddress}` (app-level) or the website.
- **PayBox reachability: partial (leg-level only).** An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot place or sign a BetDEX order: there is nothing to propose on-chain and no EIP-712/ed25519 order. What PayBox could do is the money leg: send Solana USDC (SPL) from a Solana-capable PayBox wallet to the deposit address, and receive withdrawals (Solana, or USDC ERC-20 on Ethereum). The account itself must be created and KYC-verified by a human, and the API key held as a secret by whoever runs the plugin. Whether the plugin sandbox can hold a per-user API key is a project question, not a BetDEX one. AGG (third party) does the same thing via a "hosted venue account" and Solana USDC deposits (M).

## 5. Fees

| Item | Value | Tag |
|---|---|---|
| Commission | **1% of net profit per market**, paid by the user who profits; same for maker and taker, no premium charges, no discrimination against winners. "Users pay 1% of net profits in a given market." | H (learn commission page; API FAQ; building-an-app) |
| Formula for an arb leg | Back at decimal d, stake S: win = S(d-1)(1-c), loss = S. Effective decimal `d_eff = 1 + (d-1)(1-c)`. Lay at d: risk S(d-1), win S(1-c). Lay at d is equivalent to buying "not outcome" at gross price (d-1)/d. Commission nets across your positions inside the same market only, not across venues. c = 0.01 | derived from H rules |
| Volume rebate | Weekly tiers: > $50k traded 0.8%, > $500k 0.5%, rebated after the week; volume = backer stake or layer risk. Promo page said "for the next 2 weeks" and is undated: treat as NOT a standing schedule. | L/M |
| Promos | 0% commission promos tied to World Cup 2026 and community codes (time-limited) | M |
| App commission | App builders pay the same 1% and may add their own product commission 0-1.0 charged to their end users | H |
| Deposit/withdrawal | No deposit fees or limits; crypto converted to USDC without fee. Withdrawal fee schedule NOT FOUND (only "some currencies have higher minimums"; Solana USDC cheapest). | H / NOT FOUND |
| Hint correction | The "3% on net winnings" figure in the discovery hint is outdated: every current vendor page says 1% (an undated older press snippet in a search result says 3%). Do not use 3%. | H (1%) / L (3% source) |

## 6. Resolution mechanism and dispute risk

- Operator-settled, off-chain: "BetDEX Markets are settled by the BetDEX Operations team", typically within 30 minutes of event end, using official sources and multiple reputable sources; in a conflict, the governing body's result (H, market-settlement page; rules page "last updated 8 months ago").
- "In the case of any settlement disputes, BetDEX's decision is final." No external oracle, no challenge window (H, exchange rules). BetDEX may suspend markets at any time and amend rules with immediate effect.
- Void rules (H): event not completed within three days of scheduled completion -> void (except unconditionally determined markets); venue switch to the opponent's ground voids; walkover/DQ after start counts as loss if another competitor completes. ToS: a postponed match stands if rescheduled within 72 h of the original start. Soccer = 90 minutes plus stoppage unless stated.
- Programmatic status: stream/REST `Settled`, `Voided`, `Closed`; void returns stake to the wallet. Cancelled/postponed with void shows `Market Status = Voided, Event Active = False`.
- Risk summary: counterparty/custody risk on an Anjouan-licensed operator, sole-discretion settlement, ToS-level rule changes. Arbitrage consequence: rule mismatch against Polymarket/Kalshi (void/push handling, overtime, "postponed" windows) can turn a locked-in arb into a one-sided bet. Match on rules, never on titles.

## 7. Geo, ToS, automation

- Geo (H, ToS Appendix 3): prohibited jurisdictions list (non-exhaustive, "subject to frequent update"): Afghanistan, Belarus, Burundi, Central African Republic, Cote d'Ivoire, Cuba, DR Congo, Guinea, Guinea-Bissau, Iran, Iraq, North Korea, Libya, Mali, Myanmar, Russia, Sudan, Somalia, South Sudan, Syria, Tunisia, Venezuela, Yemen, Zimbabwe. "BetDEX is available only in jurisdictions shown as available during account registration." The US is not in the list, but eligibility is decided at registration, so US availability is **NOT CONFIRMED** (AGG states the US is blocked on every venue it routes, which it calls its own platform policy).
- KYC: email verification, 18+, "Basic Verification" required for API key; more documents (source of funds, wallet details) can be demanded for features, limits or withdrawals. One account per person; duplicate accounts risk voided winnings. Terms governed by UK law.
- Automation: consumer ToS section 16 forbids "any non-BetDEX automation code ... (including any 'bot' or 'spider')" and bulk or systematic harvesting; section 10 mentions measures against robots; it also forbids forging headers or manipulating identifiers to disguise identity. The official API is explicitly offered and governed by separate "BetDEX API Terms of Use" (PDF, v1.0.0, updated 2026-05-25), which **I could not read**: the PDF uses subset fonts that WebFetch and a plain-text extractor could not decode, and no PDF renderer is installed (NOT READ). No explicit arbitrage ban found in the consumer ToS ("Player collusion is expressly prohibited"). Market-data redistribution rights for an aggregator are therefore **unverified**: ask the BetDEX API contact before showing BetDEX prices to third parties.
- Docs footer: "BetDEX API is NOT a licensed gambling product/service offering." Legal status of third-party apps built on it is ambiguous; flag for counsel before any product use.

## 8. Liquidity (no volume figure published)

| Evidence | Value | Date | Tag |
|---|---|---|---|
| Roadmap page: "Key betting markets now have ~$50k+ of open liquidity to be bet against" | vendor claim, page undated and stale in places (lists cross-matching as "in progress" while the cross-matching page, with a 2026-07-30 screenshot, says it is live) | undated | L |
| Docs stream snapshot, NHL moneyline-style market (market 898792) | 3-4 price levels per side, $35-$81 per level, best back 2.08 / best lay 2.16 on one outcome (implied probs sum ~101.9% on back sides) | 2026-10-07 | M (docs example) |
| Docs REST example (building-an-app) | levels of $5-$38 | undated; a screenshot on the same page is dated 2026-07-29 | M |
| DefiLlama | `api.llama.fi/protocol/betdex` and `/monaco-protocol` -> "Protocol not found" (slug guess; no listing found) | 2026-10-19 | H (negative) |
| Volume / OI / TVL | NOT FOUND (searched: roadmap, FAQs, API docs, status page, DefiLlama slugs; no public stats endpoint) | | |
| Builder Program revenue-share tiers ($0-500k, $500k-5m, $5m+ volume per builder) | per-builder tiers only; no platform volume stated | 2026 | L |
| Third-party review snippet (search result summary): "liquidity on BetDEX is lower than that of the more established exchanges" | | 2025-26 | L |

Brokerage: BetDEX advertises a bespoke "Brokerage" for stakes above book liquidity (status component exists). Mechanism and counterparty NOT FOUND; do not assume it adds depth to the public book.

## 9. Event categories and overlap (where arbitrage could exist)

- Categories (H): sports only (`GET /categories` "Currently this is just SPORTS"). Leagues listed: NFL, NCAAFB, MLB, NPB, NBA, college basketball, Euroleague, NHL, KHL, ATP/WTA 125+, UFC/PFL, League of Legends, and many football leagues (EPL, Championship, Serie A/B/C, La Liga 1/2, Ligue 1/2, Bundesliga 1/2/3, Brazil A/B/C, Argentina, Colombia, Mexico, Eredivisie and others; I read only the first part of the table), cricket "coming soon"; horse racing, golf, F1 "coming soon". The FAQ claims "100+ sports' leagues". Legacy 2024 US election rules pages remain but no politics, crypto, macro or weather markets are offered (H for sports list, M for absence of others).
- Market types: moneyline/1X2, totals, handicaps, half/period lines, BTTS, correct score, corners/cards (on request).
- Overlap with other venues: sports moneylines, spreads and totals on Polymarket, Kalshi (incl. NFL/NBA/MLB/NHL/soccer/UFC), Novig, ProphetX, SX Bet, Limitless/Predict.fun/Myriad sports, and XO sports markets. Not an overlap venue for politics or crypto price.
- Likely role: a sharp-ish reference price for sports (market makers quote near consensus lines; M, inferred, vendor claims "best odds") plus a possible executable leg for a human-operated, KYC'd account.

## 10. Shared liquidity

NOT FOUND any sign that BetDEX routes to or mirrors another venue; it runs its own matching engine, so its book is independent of Polymarket/Kalshi (H for "own engine", per ToS/learn). Caveats: market makers there almost certainly hedge on Betfair/Pinnacle-type books, so prices correlate with sportsbooks (M, inferred). The X profile for Monaco Protocol says it also powers Purebet (search summary, L): whether Purebet shares BetDEX's book is NOT FOUND and unlikely now that BetDEX matching is off-chain.

## 11. Adapter sketch (if built)

- Normalisation: outcome price in probability terms `p_back = 1/d` (buy outcome), `p_lay = (d-1)/d` (buy complement); apply c = 0.01 per leg via `d_eff`. Convert the "resting side" naming carefully (resting `Against` = liquidity for backers).
- Poll `GET /market-prices?marketIds=` in batches under 5000 req/min, or one wildcard `MarketPriceUpdate` subscription (500-subscription cap). Rebuild books from Snapshot then Incremental; re-subscribe every < 2 h and PING < 10 min; refresh token every 30 min.
- Linking: use event `code` (league slug + team slugs + start unix time) and `/events/by-reference/{source}/{reference}`; hash-pin rules per the project's linking design. Never link on titles.
- Execution (out of scope for PayBox): orders are fill-and-kill capable, so a non-resting taker leg is possible with `matchBehavior: CancelUnmatched`.

## 12. Open questions (need an authenticated session or a human contact)

1. Real depth and spread on NFL/NBA/EPL moneylines (needs a key; run `GET /market-prices` on 20 markets).
2. API Terms of Use content: data redistribution, arbitrage, rate rules (PDF unreadable here).
3. `GET /currencies` and `/external-reference-sources` actual contents (is Ethereum deposit live? which sources map to Polymarket/Kalshi/Betfair ids?).
4. US eligibility and which countries the registration flow offers.
5. Whether a free wallet-level key can read all markets or only markets owned by app `ownerAppId`.
6. Existence and status of the legacy on-chain Monaco Protocol program on Solana (no program id verified from a primary source this session; GitHub org has no public repos).
7. Claim in the discovery hint that BetDEX was "founded by FanDuel co-founders": not verified (L).

## 13. Suspicious / embedded-instruction content

- `developers.betdex.com/faqs`: suggests setting `CURLOPT_USERAGENT => 'BetMonitor/1.0 (client)'` to avoid CloudFront 403. Not followed (the consumer ToS bars manipulating identifiers to disguise identity and the research User-Agent `insurance-markets-research/0.1` worked fine).
- `docs.agg.market/*.md` pages open with an "Agent Instructions" block telling AI agents how to integrate AGG. Not followed; used only as a data source for BetDEX facts.
- Builder Program page solicits agents/bots for bounties and revenue share. Marketing, not acted on.

## Sources (all fetched 2026-10-19 unless stated)

- BetDEX site: https://www.betdex.com/ (200; JS app, no readable body); https://status.betdex.com/api/v2/summary.json
- API docs: https://developers.betdex.com/ (index.md, llms.txt, faqs.md, how-to-get-my-api-key.md, how-to-get.md, building-an-app.md, rest-api/overview.md, stream-api.md)
- OpenAPI: https://docs.api.monacoprotocol.xyz/api/v1/exchange-openapi-general.json ; https://docs.api.monacoprotocol.xyz/api/v1/exchange-openapi-wallet-key.json
- Live probes: https://prod.api.btdx.io/status (200), https://prod.api.btdx.io/categories (401), /currencies (401), /market-types (401), /market-prices/ladder (401)
- Learn site: https://learn.betdex.com/betdex-exchange/ (llms.txt; how-does-betdex-utilise-blockchain-tech.md; betdex-roadmap.md; overview/faqs.md; using-the-betdex-exchange/betting-on-the-betdex-exchange/commission, market-settlement, cross-matching; betdex-offering/exchange-rules-and-regulations, sports-and-competitions, available-markets, in-play; funding pages: deposit-via-crypto, withdrawing-from-your-betdex-account; useful-information/terms-of-service; useful-information/gli-audit-report; promos/the-betdex-builder-program, high-volume-commission-discount)
- API Terms PDF (NOT READ): https://terms.btdx.io/betdexApi/1.0.0.pdf
- Aggregator corroboration (M): https://docs.agg.market/venues/overview.md ; https://docs.agg.market/recipes/hosted-venue-accounts.md ; https://docs.agg.market/concepts/market-resolution.md ; https://docs.agg.market/recipes/venue-geo-availability.md ; https://docs.agg.market/changelog.md (2026-09-24 v4.18.0/4.18.1 entries)
- GitHub: `gh api orgs/MonacoProtocol` and `users/MonacoProtocol/repos` (0 public repos); repo search for "monaco-protocol" (only unrelated results). A third-party repo `api-evangelist/betdex` appeared in search and was NOT read.
- DefiLlama: https://api.llama.fi/protocol/betdex (not found)
- Search (L): one WebSearch summary 2026-10-19 (CoinGape, FreeTips, Solana Compass snippets) used only for the "lower liquidity" remark and the Purebet mention; those pages were not opened.
