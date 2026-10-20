# MagicMarkets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran 00:30-00:45 UTC). READ-ONLY: doc reads, `gh api` file reads, and unauthenticated GETs to documented hosts with the User-Agent `insurance-markets-research/0.1`. No account, key, wallet, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, docs and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/magicmarkets/` (section 12).

---

## 0. Bottom line

1. **Live and active, young.** `GET /v2/events/` returned 5,373 priced events with 63 in-play at 2026-10-19 00:35 UTC (H). DefiLlama has daily volume through 2026-10-17 (H). The API/CLI/MCP changelog has entries for September and October 2026 (H). It is only ~5 months old in data terms (first volume 2026-05-12, H) and says it left stealth in August 2026 (M).
2. **It is a custodial sports exchange with an aggregated book, not an on-chain prediction market.** USDT balances sit in an operator ledger (3-102-947650 SRL, Costa Rica, Anjouan Gaming licence). Orders match against other users **or against "liquidity aggregated from more than 25 sportsbooks, sports exchanges and prediction markets"**, and the user is "not told which source filled you" (H, docs). No chain, no outcome tokens, no smart contracts.
3. **Not an independent arbitrage leg.** Its own docs say the book is a composite of other venues' liquidity. The providers are not named anywhere I could read (NOT FOUND), so I cannot rule out that a MagicMarkets quote is literally a Polymarket, SX Bet or sportsbook price. Its own Thumper extension is built to sit beside Polymarket match-winner pages (H docs, M for the product page). Treat a MagicMarkets-vs-Polymarket gap as a possible stale or re-quoted price, not as two independent books.
4. **Liquidity is real by this universe's standards**: about $62.8M of taker-side matched stake over 2026-09-18..2026-10-17 (H, DefiLlama daily series, my sum) and $2.36M on 2026-10-17. Flat since June (~$60-73M per full month). Self-reported (team-maintained Dune table), TVL is $0 because it is custodial.
5. **API is good but gated.** Official OpenAPI 3.1 + REST + WebSocket + MIT CLI + hosted MCP. Every price endpoint needs an `X-Api-Key`, which needs a signed-in account with **at least 10 USDT deposited**. The one keyless endpoint, `GET /v2/events/`, lists events and runners but carries **no prices**.
6. **Not tradable from PayBox.** Orders are placed with an API key against a betslip; there is no wallet signature or on-chain transaction in the trade path. A PayBox wallet could at most fund the account by a plain USDT transfer to the deposit address, and the accepted networks are only visible after sign-in (NOT FOUND).
7. **adapter_priority = P2** (read-only reference price for sports, plus keyless event discovery for market linking). No trading adapter. Reasons: shared liquidity, custodial, US/UK/EU-major-state geo-block, ToS clauses on automation and commercial use.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Site | magicmarkets.com loads: "The prediction market for serious sports traders", sport menu incl. Politics and Specials, sign-up -> details -> deposit flow (fetched 2026-10-19) | H |
| Keyless event feed | `GET https://magicmarkets.com/v2/events/?limit=5000` (2 pages): 5,373 events, 63 `in_running`, 1,271 normal events start within 48 h, latest normal event starts 2026-12-26 (fixture) | H |
| Volume | DefiLlama daily series ends 2026-10-17 at $2,359,715; 159 daily points since 2026-05-12 (`api.llama.fi/summary/dexs/magicmarkets`) | H |
| Dev activity | Changelog: hosted MCP server and `DELETE /v2/betslips/{id}/` (Oct 2026), CLI published 16 Sep, REST market data shipped 29 Sep (docs). `magicmarkets/magicmarkets-cli` last push 2026-10-09, OAuth commit 2026-09-30; `magic-api` last push 2026-09-29; `brand` repo pushed 2026-10-16 (`gh api`) | H |
| Hosted MCP | `GET /.well-known/oauth-protected-resource` returns `resource: https://magicmarkets.com/mcp`, scope `mcp` | H |
| Public launch | Own X account posted "out of stealth" on Aug 18 (2026), founder named in a newsletter; previously "available only to institutional clients via API" (search result + PM Pulse #026 summary). The API repo was created 2026-05-12, the same day as the first volume point | M |
| Licence | Anjouan Gaming, number ALSI-202607031-FI1 (docs "Company and licence"). The number looks like a 2026-07-03 issue date (my inference); I did not check the registry | H (number) / L (date inference) |

Verdict: **still_live = true**.

---

## 2. Kind and market model

- **Kind (H):** custodial peer-to-peer sports exchange with an aggregated order book. "Not a sportsbook... Not a market maker. MagicMarkets aggregates prices rather than setting them against you." (docs what-is-magicmarkets). ToS 8.1: customers bet "with each other and/or with authorised liquidity providers... Magic Markets operates solely as a neutral facilitator... does not assume any risk or liability as a counterparty."
- **Order book, not AMM, not parimutuel (H).** Back/lay (the app says buy/sell) at decimal odds on a fixed tick grid (0.01 up to 2.00, then 0.02, 0.05, 0.10, 0.20, 0.50, 1, 2, 5, 10 up to 1000). Cents in the UI = `100 / decimal price`.
- **Make and take (H).** `exchange_mode`: `make_and_take` (default), `take_only`, `dark` (hidden remainder). No post-only. Orders can rest up to 72 h; partial fills; fills never worse than the limit; `accept_better_price` default true.
- **Outcome model.** No tokens. A position is a ledger entry on the account. Outcomes are identified by `(sport, event_id, bet_type)`; `bet_type` is a grammar string starting `for` (back) or `against` (lay), e.g. `for,h`, `for,over,2.5`, `for,ah,h,-4` (Asian handicap line is 4x the real line), `for,win,<team_id>` for outrights. Binary, 3-way, N-runner outright and quarter-line handicap markets exist; no scalar markets. Combos of 2-10 legs (`betslip_type: parlay`). Positions can be closed before settlement (trade-out / cashout) (H, docs sports-and-bet-types, concepts).
- **Prices are indicative until quoted.** Offers (book snapshots) "are indicative. A book can show prices that cross, and not every level can be traded. The price you can trade is the `pmm` quote for your betslip." (H, WebSocket doc). A betslip lives ~45 s unless refreshed. For a scanner this means a two-step executability check (create betslip, wait ~2 s for `pmm`).
- **Event identity.** `event_id = "YYYY-MM-DD,<homeTeamId>,<awayTeamId>"` with the operator's own numeric team ids; multirunner ids are `YYYY-MM-DD,multirunner,<n>`. "Treat the id as an opaque string. The date in it does not always match `start_time`." (H). Each football market family is a separate `sport` code (`fb`, `fb_ht`, `fb_htft`, `fb_corn`...), so one match appears as several events.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Venue chain | none ("Off Chain" on DefiLlama, `chains: ["Off Chain"]`, TVL arrays empty) | H |
| Stake currency | USDT only; stakes/balances are `["USDT", amount]` tuples in the API | H |
| Deposit | send USDT to a per-account address, one network per address; other assets via "other deposit options" on the deposit screen | H |
| Which networks | NOT FOUND (searched: docs deposits, first-deposit, deposit-not-showing, withdrawals, ToS, homepage text; the list is shown only on the signed-in deposit screen) | - |
| Limits | 10,000 USDT lifetime deposits without ID verification; above that, 30 days to verify or withdraw, then trading stops (docs) | H |
| Withdrawals | only on the website, with emailed 2-step confirmation; funds in open or closed-but-unsettled positions are not withdrawable | H |
| Custody | operator ledger, no interest. ToS 7.3.4 "Magic Markets is not a banking institution. You will not be paid interest on any outstanding account balances." EU addendum 33.2: "we are not acting as a custodian of those deposits... those deposits become the assets of us while granting you a right to place bets in a corresponding amount". Read this as an unsecured claim on the operator, not segregated client funds (my reading of the clause) | H (text) / M (reading) |

---

## 4. Read API

- **Docs (H):** https://docs.magicmarkets.com (Mintlify; `.md` per page; `llms.txt`), OpenAPI 3.1 at `https://magicmarkets.com/v2/openapi.json` / `.yaml` (info.version 0.1.0), full contract in one file at `https://magicmarkets.com/llms-full.txt`. Code: github.com/magicmarkets (CLI and MCP, MIT; `magic-api` Claude skill, MIT).
- **Base URLs (H):** REST `https://magicmarkets.com/v2/` (every path also works under `/magic-api`); WS `wss://magicmarkets.com/v2/stream?api_key=<key>[&lang=en|ko|zh-hans]`; hosted MCP `https://magicmarkets.com/mcp`. The retired `/magic-cpricefeed/v2` and `pro.magicmarkets.com` are stale (docs).
- **Auth (H):** `X-Api-Key` header on REST, `api_key` query parameter on the WS. "API access needs a minimum deposit of 10 USDT." Keys are created only in the website under Settings -> API, shown once. Hosted MCP also supports OAuth 2.1 + PKCE. A key can read, quote, place and close; it cannot deposit, withdraw or manage keys.
- **Live auth behaviour (H, probed):** `GET /v2/events/` works **with no key** (HTTP 200, `cache-control: public, max-age=60`, Cloudflare). `GET /v2/offers/`, `/v2/balance/`, `/v2/xrates/`, `/v2/sports/.../bet_types/...` return `401 {"status":"error","code":"auth_error",...}` with `www-authenticate: MollyAPIAuth`. The docs say every request needs a key, so the keyless events endpoint looks unintended; do not depend on it in production.

Key endpoints for an adapter:

| Need | Endpoint | Notes |
|---|---|---|
| Event discovery + runners | `GET /v2/events/` (keyless today) | Filters `sport`, `competition_id`, `event_id`, `start_time_from/to`, `ir_status`; `limit` max 5000; cursor `after="{sport},{event_id}"`. Returns only events that currently have prices. Shapes: `normal` (home/away) and `multirunner` (`teams[]`, `end_time`) |
| Book (prices + size) | `GET /v2/offers/?sport=&event_id=...` (key) | Up to 20 events per call, `bet_type`/`market_type`/`min_liquidity` filters, paged (`limit` max 5000). Each offer: `price_list[].effective {price, min, max}` sorted price descending; `max` = stake available in USDT. Empty/omitted = no liquidity |
| Live book | WS `["register_event", sport, event_id]` -> `offer` / `remove_offer` full replacements | Initial `event` snapshot then `sync`; `clear_events` = discard all state; `event_score`, `event_time`, `event_red_cards`, `event_exchange_dark_liquidity` (rough extra-depth estimate) |
| Firm quote | `POST /v2/betslips/` then `pmm` on WS or `GET /v2/betslips/{id}/` | Needed before any order; `exclude_danger` excludes sources holding bets in "danger" status |
| Trades (public) | NOT FOUND (no public trade tape; `bet` messages are only your own matches) | - |
| Resolution | NOT FOUND as an API (no market-status/outcome endpoint); results appear only on your own orders (`reconciled`, `profit_loss`, `partial_void`/`full_void`) | - |
| Separate feed | `https://data.magicmarkets.com/v1/` (REST login -> token, WS `/v1/stream`) with `events` and `sptmkt` (reference price per bet type) collections | credentials issued by MagicMarkets on request ("Feed credentials come from MagicMarkets... governed by your agreement"); `GET /v1/config` without token = 401 (H). Not self-serve |

- **Rate limits (H, docs):** per account, all keys share it. All endpoints 100 req/s burst, 1200 req/min sustained. `POST /v2/betslips/` 10 req/s and 2,000 per rolling 24 h (every create counts, even rejected). `POST /v2/orders/` 5 req/s. `GET /v2/offers/` max 4 in flight. WS has no message-rate limit but a registered-event cap across all connections (the number is NOT FOUND) and a slow-reader disconnect (code 1008). Higher limits by emailing support or as a partner. REST can be ~4 s behind the stream.
- **Data quality (H, measured):** 718 of 5,305 `normal` events (13.5%) are still `pre_event` although they started more than 6 hours ago; filter on `start_time`. Some multirunner events started in 2025 and are still listed.

---

## 5. Trade path and PayBox reachability

- **Programmatic trading (H):** yes, with an API key. Flow: `GET /v2/balance/` -> read offers -> `POST /v2/betslips/` -> `pmm` quote -> `POST /v2/orders/` with `request_uuid` (idempotent; recover with `GET /v2/orders/tracked/{uuid}/`) -> watch `order`/`bet`. Heartbeat (dead-man's switch, 10-300 s) closes all open orders if not refreshed. Close endpoints: single, `close_many` (500), `close_all`.
- **Signing scheme:** none. No EIP-712, no wallet signature, no on-chain transaction. The API key is the only credential.
- **PayBox (M, inference from the above):** `paybox_reachable = no` for trading. There is no unsigned-transaction or signable-order object to hand to `request_wallet_sign` or a transaction proposal. A PayBox EVM/Solana wallet can only act as a **funding source**: `request_transfer` of USDT to the account's deposit address, if that network is supported by PayBox (unknown, see section 3). Keys must be minted by a human in the web UI after sign-up and a 10 USDT deposit, so an agent cannot self-provision. Under the repo's executability classes this is a "manual instruction" leg (consistent with `docs/aggregation-design.md` E4).
- **Agent tooling (H):** MIT CLI with local MCP (11 read tools; 8 trading tools only with `MAGICMARKETS_ALLOW_TRADING=1`) and a hosted MCP with no read-only mode. Not used or installed.

---

## 6. Fees

- **Trading: zero commission** on placing, matching, winning, closing early or settling; "MagicMarkets adds no fee or markup to the price" (H, docs zero-commission; ToS 11.1 "Currently... does not charge any commission").
- **Reservations (H, ToS):** 11.1 "we reserve the right to introduce a commission in the future, calculated as a percentage of a user's net winnings per market", with advance notice. 7.1.9 "a handling charge of up to 5% on deposits and withdrawals". Docs currently say deposits and withdrawals are free except the blockchain network fee.
- **Who pays:** nobody at the point of trade. The price itself may embed the margin of whichever sportsbook supplied the liquidity (M, inference from the aggregation model; the docs only say the platform adds nothing). Model the venue as fee = 0 but treat quoted prices as not margin-free.
- **Other costs:** network fee on withdrawal; on-ramp fees at the sender.

---

## 7. Resolution and dispute risk

- **Mechanism (H, docs settlement + settlement-rules pages):** operator-run, centralized. No oracle, no on-chain dispute. Per-sport rules at `magicmarkets.com/settlement-rules/<sport>` (13 sports incl. politics and soccer); result verified "against the result source for that sport"; "Settlement is not adjusted per user."
- **Disputes (H):** email support with the event, market and position; ToS 8.12 requires notice within 30 days; 8.12 also makes the operator's transaction logs "final, conclusive and binding". 9.5 "We reserve the right to reverse the settlement of a market if a market is settled in error"; resettlement can move balances up or down (9.6). Governing law Anjouan; exclusive jurisdiction of Anjouan courts, no arbitration clause (ToS 32.2-32.3).
- **Rules that differ from other venues (H, soccer/politics pages):**
  - Soccer 1X2: full time plus stoppage, **extra time and penalties excluded**. Postponed match voids if not started by 23:59 local on its date (rearranged within 72 h keeps bets). Abandoned and not finished before midnight local: void.
  - **VAR/cancelled-goal rule:** MagicMarkets "will void all bets matched during any period of an event" when the displayed score included a goal later cancelled, during or after the match. A leg here can void after the other venue's leg has settled.
  - Politics: "official results as announced by the appropriate authorities"; US presidential market = majority of Electoral College votes and officially declared; no stated rule on media calls vs certification, voids, or replacement candidates (the page defers to the ToS).
  - Boxing/MMA: amendments within 24 h to correct a reporting error are applied.
- **Dispute/void risk for arbitrage: elevated.** Single operator discretion, 8.11 void rights (error, influence, criminal action, bets from a Prohibited Jurisdiction), 8.9 void for multi-account collusion, 5.7 void-and-block for "automated systems designed specifically to defeat the Magic Markets systems".

---

## 8. Geo, ToS and automation

- **Restricted territories (H, docs "Company and licence"; ToS 7.1.3):** Sanctioned: Cuba, Iran, Myanmar, North Korea, Syria, Crimea/Donetsk/Luhansk/Sevastopol. Restricted: Australia, Austria, China, Comoros, Costa Rica, Curacao, France, Germany, Hong Kong, Macau, Netherlands, Singapore, Spain, United Kingdom, United States and territories. Browsing is allowed in several; the docs say existing holders can still withdraw, but ToS 7.1.3 requires that you are not physically located in a listed country "at all times when using the Exchange, including making requests for withdrawal or transfers of funds" (the two statements conflict). Bets placed from a Prohibited Jurisdiction can be voided (ToS 8.11). No explicit VPN clause found.
- **One account** "per customer / IP / household" (ToS 7.1.11, H); breach can freeze accounts and funds.
- **Automation (H, ToS) - contradictory.** The company publishes a trading API, CLI, MCP server and "Getting started with an Agent" pages, and the docs say "The API is open to every individual account". But ToS 27.1: "You may not use any automated software and/or computer system in direct, or indirect conjunction with the services provided by Magic Markets, including... software and/or systems designed to provide you with an unfair advantage." ToS 5.7 bars automated systems "designed specifically to defeat the Magic Markets systems", with "all bets being void and accounts permanently blocked". I could not find an API-specific carve-out in the ToS. Ask support before running a bot with real money.
- **Commercial use (H):** ToS 26.3 "we only provide the Exchange for domestic and private use. You agree not to use the Exchange for any commercial or business purposes". Partners page: platforms that place trades must act "as an agent for each user, on that user's own account. It never trades as principal." A shared aggregator account trading house capital would breach this; a per-user key model would be the compliant shape.
- **Data redistribution (H):** ToS 29.1 bars copying/downloading material published on the Exchange without written permission. The partners page invites price-comparison sites and platforms to "display MagicMarkets prices" via the public API and mentions higher limits for partners; displaying prices to third parties should go through the partner programme ("Data partners should not sit between MagicMarkets and the user").
- **KYC:** none until 10,000 USDT lifetime deposits (docs); one-account rule and a third-party ID check apply after that.

---

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| Daily volume, last day | $2,359,715 (2026-10-17) | api.llama.fi `summary/dexs/magicmarkets`, fetched 2026-10-19 | H |
| 30-day volume | **$62,813,679** (my sum of daily points 2026-09-18..2026-10-17). The API's own `total30d` field says $60,824,046 (window offset) | same | H |
| 7-day volume | $21,329,878 (my sum, 2026-10-11..10-17); API field `total7d` $16,572,434 | same | H |
| All-time | $329,099,401 since 2026-05-12 (159 days) | same | H |
| Monthly (taker-side) | May (20 days) $39.8M, Jun $73.3M, Jul $72.3M, Aug $46.2M, Sep $59.7M, Oct (17 days) $37.7M | same, my sums | H |
| Dune cross-check | 30-day volume $63.5M, 267,852 matched trades (about $237 per trade); window end date not shown | dune.com/magicmarkets/magicmarkets, small-model page summary, fetched 2026-10-19 | M |
| TVL / OI | TVL $0 (off-chain, `tvl: []`); open interest NOT FOUND | api.llama.fi `protocol/magicmarkets` | H |
| Book depth | NOT FOUND (offers need a key; not sampled) | - | - |

- **Definition (H):** "USD value of stakes matched on the Magic Markets exchange each day, counted once per matched trade (taker side only). Sourced from the team-maintained public Dune dataset dune.magicmarkets.data, refreshed daily from production settlement records." Self-reported; a custodial ledger can't be audited on-chain. Notional = 2x. Docs say in-play carries most of the volume.
- **Rank (M):** per the 2026-10-18 DefiLlama snapshot already in `docs/research/fixtures/defillama/`, the 6th-largest prediction-market adapter by 30d volume, behind Kalshi, Polymarket US/International, Predict.fun and Opinion. Not growing since June.

---

## 10. Coverage, overlap and independence

Event mix from the keyless events feed, 2026-10-19 (fixture `events_counts_by_sport_2026-10-19.json`; counts are events, and each football match appears under several market-family codes):

| Category | What is priced now | Overlaps |
|---|---|---|
| Soccer | `fb` 1,586 events, plus `fb_ht` 1,306, `fb_htft` 728, `fb_corn` 246, `fb_corn_ht` 168; EPL, Champions League etc.; outrights (league winners, Champions League 26/27, Ballon d'Or 2026 winner, MLS Cup) | Polymarket sports, Kalshi sports, SX Bet, Overtime, Azuro, Predict.fun sports |
| Tennis | 330 events (ATP Challenger/ITF heavy) + Australian Open 2027 outrights | Polymarket/Kalshi (main tour only) |
| US sports | NCAA football 228, NFL 19, CFL 4; NBA 43 (+ Japan B1, CBA, Euroleague), NHL 50 + AHL; MLB 5; Super Bowl, AFC/NFC, NBA 26/27, NHL 2027 and World Series 2026 futures | Polymarket, Kalshi (sports futures and game markets) |
| Esports, MMA, boxing, darts, cricket, F1 (drivers + constructors 2026) | 110 / 16 / 35 / 22 / 25 / 2 | partial |
| **Politics** | 38 events: US 2026 midterms House control, Senate control, 33 gubernatorial races (all close 2026-11-03), US 2028 presidential winner (104 runners) and winning party | **Polymarket, Kalshi, PredictIt** - the highest-value overlap, and the midterms are 15 days away |
| Crypto price, macro, weather, entertainment | none seen (only Ballon d'Or and BBC Sports Personality of the Year as specials) | no overlap |

- **Liquidity sharing (H docs, providers NOT FOUND):** the book mixes MagicMarkets users with "more than 25 sportsbooks, sports exchanges and prediction markets", "authorised liquidity providers" per the ToS. No page I read names them. Evidence that Polymarket is at least a comparison target: the Thumper extension "sits beside Polymarket and other markets and shows the same position priced on MagicMarkets" and flags the better price (docs apps-and-tools H; magicmarkets.com/thumper, M, says it compares against Polymarket only, match-winner markets).
- **Consequence for the aggregator:** do not count MagicMarkets as independent depth against Polymarket, Kalshi, SX Bet or Predict.fun sports, and expect that part of any gap to Polymarket is latency or re-quoting of the same prices. It is useful as a **consensus reference price** (a proxy for 25+ books, with sharp-book prices likely among them) and as a tradable alternative only for a human with an account. For politics, the book may be thinner and more independent, but I could not measure it (needs a key).

---

## 11. Adapter spec (if built)

- **Priority P2.** Phase A (no key): poll `GET /v2/events/` (respect the 60 s cache; page by `after`; filter by `start_time_from/to`, `sport`) to populate the market-linking registry: competition name, home/away strings, `start_time`, outright runner names. Phase B (human-supplied key, funded >= 10 USDT, read-only usage): batch `GET /v2/offers/` (20 events per call, <= 4 in flight) or one WS with `register_event` for linked events only; normalise `for` price p -> P(outcome)=1/p, `against` price p -> P(outcome)=1-1/p; use `price_list[0]` and the summed `max` as indicative depth; mark every quote `indicative`, `liquidity_shared=true`, `custodial=true`.
- Never place orders; surface a "place manually on MagicMarkets" instruction card instead. No betslips from the scanner (2,000/day budget, and a betslip is a quote request).
- Normalisation traps: Asian handicap integers are 4x; `fb_*` codes are separate markets of the same match; the 1X2 market excludes extra time; period/handicap grammar is home-relative; duplicate/stale events; event ids are operator-internal.

---

## 12. Fixtures

In `docs/research/fixtures/magicmarkets/`:

| File | What |
|---|---|
| `events_sample_2026-10-19.json` | Hand-picked 9 events from the keyless `GET /v2/events/` (in-play soccer, EPL, first-half market, tennis, NFL, NBA, House control, 2028 winner, Super Bowl), runners truncated where noted |
| `events_counts_by_sport_2026-10-19.json` | Counts by sport code / event type / `ir_status`, and the list of futures and politics events, from the full 5,373-event paging |
| `offers_401_no_key_2026-10-19.json` | The live 401 body for `/v2/offers/` without a key |
| `offers_documented_example_openapi.json` | The OpenAPI example of an offers response (documented, not live) |
| `defillama_dexs_magicmarkets_2026-10-17_last45d.json` | Last 45 daily volume points and methodology |
| `events_fb_limit2_trimmed.json` | (pre-existing, from an earlier session) 2 football multirunner events |

---

## 13. NOT FOUND and open questions

- Names of the 25+ liquidity providers, and whether Polymarket, SX Bet or any other venue in this project's universe is one (searched: docs, ToS, homepage, about, learn, data-feed README, PROTOCOL.md, llms-full.txt, two web searches; the only provider-type words are "sportsbooks, sports exchanges and prediction markets").
- Order-book depth, spreads and fill quality (offers need a key).
- USDT deposit and withdrawal networks and minimums (signed-in screen only).
- Whether the ToS 27.1 automation clause is waived for API keys.
- The WS registered-event cap number; any published uptime or status page.
- An independent audit of volume, or of reserves backing the custodial USDT.
- Hosted MCP behaviour beyond the discovery document (no POST made).

---

## 14. Suspicious / agent-directed content

Nothing malicious found. Agent-oriented content seen, none followed: every docs page opens with a Mintlify banner telling readers to fetch `llms.txt` ("Use this file to discover all available pages"); a "Getting started with an Agent" page and a Claude-skill page; the data-feed README and docs tell users to `git clone` and `make install` the CLI/skill and to add an MCP server with `claude mcp add`; the CLI and hosted MCP docs encourage letting an agent place real-money orders. Nothing was cloned, installed or run.

---

## 15. Sources

All fetched 2026-10-19 unless noted.

- Site and legal (H): https://magicmarkets.com (home text), https://magicmarkets.com/terms-of-service (full text read via curl; clauses 1, 5.7, 7.1.3, 7.1.9, 7.1.11, 8.1, 8.9, 8.11, 8.12, 9.5, 9.6, 11.1, 26.3, 27.1, 29.1, 32.2-32.3, 33.2), https://magicmarkets.com/settlement-rules/soccer and `/politics` (WebFetch page summaries, M).
- Docs (H, `.md` pages via curl): https://docs.magicmarkets.com/llms.txt, `platform/{what-is-magicmarkets,how-the-exchange-works,zero-commission,settlement,company-and-licence,sports-and-markets,apps-and-tools}`, `traders/account/{deposits,withdrawals,verification}`, `developers/{overview,authentication,concepts,errors-and-rate-limits,websocket-stream,safety,changelog,sports-and-bet-types,prices-and-ticks,tools/mcp,api-reference/introduction}`, `partners/{overview,who-we-work-with}`.
- API contract (H): https://magicmarkets.com/v2/openapi.json, https://magicmarkets.com/llms-full.txt, `https://magicmarkets.com/.well-known/oauth-protected-resource`.
- Live probes (H): `GET https://magicmarkets.com/v2/events/` (200, no key), `/v2/offers/`, `/v2/balance/`, `/v2/xrates/`, `/v2/sports/fb/bet_types/for,ml,h/` (401, no key), `GET https://data.magicmarkets.com/v1/config` (401, no token).
- Volume (H): https://api.llama.fi/summary/dexs/magicmarkets?dataType=dailyVolume and https://api.llama.fi/protocol/magicmarkets. The DefiLlama web page itself returned HTTP 403 to my fetch (hint source defillama.com/protocol/magicmarkets not read directly). Dune: https://dune.com/magicmarkets/magicmarkets (M, summary).
- Code (H): github.com/magicmarkets (`gh api`: repo list, push dates; `magicmarkets-data-feed` README, CHANGELOG, PROTOCOL.md).
- Secondary (M): https://pmpulse.substack.com/p/the-pm-pulse-026 (launch item, summary), https://x.com/voidHL/status/2089824935833153837 (third-party post, seen only in search results), https://magicmarkets.com/thumper and https://magicmarkets.com/about (page summaries), https://magicmarkets.com/learn.
- Prior project notes used only as leads: `docs/research/09-venues-onchain-clob.md` section 2.8 (all claims re-verified above except where marked).
