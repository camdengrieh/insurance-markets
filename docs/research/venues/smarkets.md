# Smarkets - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- **adapter_priority: P2 (signal-only reference price).** Smarkets is a live, UK/Malta-licensed, fiat (GBP) sports-and-politics betting exchange. It is an independent order book, but (a) there are no crypto rails, so a PayBox EVM/Solana wallet cannot trade it; (b) trading needs a KYC'd human account and a username/password session token; (c) the official docs and the API host sat behind a Cloudflare managed challenge for every unauthenticated request this session, so no real response could be captured; (d) it is small (FY2024 commission revenue GBP 5.7m, exchange revenue falling) and is mostly a UK/Betfair-competitor book. Its value to the aggregator is as a sharp-ish reference price for sports and politics events that also trade on Polymarket/Kalshi, not as an arbitrage leg we can execute.
- Confidence: high on liveness, fees and regulatory facts (company filings); medium on the API surface (reconstructed from Smarkets' own 2021 sample bot plus 2026 third-party code); low on liquidity (no matched-volume figure found).

## Identity and liveness

- Operator: Smarkets Limited, England and Wales company no. 06475845, incorporated 2008-01-17, status **Active**; last confirmation statement made 2025-10-31 (filed 2025-11-08), next due 2026-11-14 (H, Companies House company page and filing history, fetched 2026-10-19). Consolidated FY2024 annual report filed 2025-10-02 (H).
- The FY2024 report (period to 2024-12-31) says the group "own and operate[s] an online betting exchange platform"; it also runs "SBK", a sportsbook-style app built on top of the exchange; the group holds licences in the UK, Malta (B2C Type 3 remote gaming), Sweden and Ireland, plus the US states of Colorado and Indiana (H, FY2024 accounts, strategic report p.3 and note on subsidiaries; scanned PDF, read by local OCR plus visual check of the key paragraphs).
- Post-balance-sheet note: "In August 2025, new US entities were incorporated in anticipation of re-entering the United States market" (H, FY2024 accounts note 31). The CEO review says "Next year, we look forward to re-entering the United States" (H). Whether a US exchange has launched by Oct 2026: NOT FOUND.
- Web properties: `smarkets.com`, `docs.smarkets.com`, `api.smarkets.com`, `help.smarkets.com` and `community.smarkets.com` all answer HTTP 403 with `cf-mitigated: challenge` (Cloudflare managed challenge, title "Smarkets - Security Check") to unauthenticated GETs with the mandated generic User-Agent, 2026-10-19 (H, fixture `docs/research/fixtures/smarkets/unauth_get_cloudflare_challenge_headers.txt`). Infrastructure is clearly up, but I did not see a live market page, so "markets currently trading" is not first-hand.
- Activity signals in 2026: the `smarkets` GitHub org pushed `marge-bot` on 2026-10-09 and `react-native-seon` on 2026-07-29 (H, GitHub API); a third-party Smarkets API client was last pushed 2026-07-31 (M).
- Verdict: **still live** (H for the company, M for the exchange product).
- Staleness flag: financial figures below are for FY2024 (to 2024-12-31), about 9.5 months old; treat as possibly stale.

## Kind and market model

- kind: sportsbook-exchange (fiat, centralised, off-chain). Central limit order book per contract; peer-to-peer matching, no AMM, no parimutuel (H, accounts: "enables users to set prices and bet against other traders, rather than against a bookmaker"; "the exchange offers both buy and sell prices").
- Hierarchy: event -> market -> contract (H, official sample bot `get_related_markets`, `get_related_contracts`). A market has `winner_count`, so one market can hold several mutually exclusive contracts (match winner, outright, etc.); each contract has its own bid/offer book (M, third-party types `Market.winner_count`, `Book{bids,offers}`).
- Each contract is effectively a binary claim paying 1 unit if it wins. Price is in units of 0.01% of the payout (1-10000, so 5000 = 50% = decimal 2.00); quantity is in units of 1e-4 GBP. Official sample: `price 50` is "0.5% / 200 decimal", `quantity 500000` is a GBP 50 payout, and the buy order "locks 0.25 GBP" (H, official tutorial comments; M for the decimal conversion `10000 / price`, third-party helper). `buy` = back, `sell` = lay; lay liability = (1 - price) x quantity is the standard exchange convention but I did not read it in Smarkets docs (M).
- Contract outcomes: `null | winner | loser | void | deadheat | reduce`; market states: `new | open | live | halted | settled | voided | unavailable`; event states: `upcoming | live | ended | settled | suspended` (M, third-party 2026 TypeScript types; likely mirror the API). `Market.bet_delay`, `inplay_enabled`, `cashout_enabled` also exist (M).
- Outcome tokenisation: N/A. Positions are rows in an internal ledger, not tokens. There is no on-chain representation (NOT FOUND, searched: accounts, GitHub org, sample code).
- Odds are matched on a discrete tick table; displayed decimal odds can differ from the underlying percentage price (H that the official bot README links a help article "Why can't I bet at specific odds"; article text itself unread, blocked).

## Chains and collateral

- None. Collateral is fiat held in segregated bank accounts: "segregated short-term bank accounts holding customer deposits for betting purposes ... GBP 27.6m" at 2024-12-31 (H, accounts p.5 financial review). A "customer funds trust" subsidiary exists (H, subsidiaries note). Principal currency is GBP (H via official sample comments; other currencies NOT FOUND). Deposits via Apple Pay / Google Pay are mentioned for SBK (H, accounts p.2); card/bank/PayPal-style funding assumed but not read (L).
- No crypto deposits found (searched: accounts, GitHub org repo list which includes `trustly-client-python`, `react-native-paypal`, `react-native-google-pay`, `react-native-payments`). A Trustly/PayPal/Google Pay integration list points at conventional fiat rails (M).

## Read API

- exists: **official-authenticated in practice, with unauthenticated read in older samples; docs not readable this session.** The official sample (2021) calls market-data endpoints with no credentials and uses a session token only for orders/accounts (H). A 2026 third-party client sends the session token on every request (M). Today every unauthenticated request from this environment is stopped by Cloudflare, so I cannot say which endpoints are still open.
- Docs URL: https://docs.smarkets.com/ (H that it is the canonical URL: linked from the official `smk_trading_bot` README and from the old `smarkets.github.com` redirect page). Content: NOT READ (Cloudflare challenge on `docs.smarkets.com` via WebFetch and curl; WebFetch and curl to the help centre and developer forum also challenged). Developer forum: https://community.smarkets.com/c/developers/20 (H, linked from the official README; unread).
- Base URL: `https://api.smarkets.com/v3/` (H, official `configuration_template.toml`; M, same base used by a 2026 third-party client via `/v3/...` paths). Legacy session logout on `/v0/sessions/current/` also appears (M).
- Key endpoints (H = in Smarkets' own sample bot `client.py`, last commit 2021-12-24; M = only in third-party 2026 code):
  - `GET /v3/events/?states=..&types=..&sort=id&limit=..&start_datetime_min/max=..` -> `{events:[...], pagination:{next_page}}` (H); `GET /v3/events/{id1,id2}/` (H); `GET /v3/popular/event_ids/?platform=exchange&limit=10` -> `{popular_event_ids:[...]}` (M).
  - `GET /v3/events/{ids}/markets/?sort=event_id,display_order&with_volumes=true` and `GET /v3/markets/{ids}/?with_volumes=true` (H); `limit_by_event` param (M).
  - `GET /v3/markets/{ids}/contracts/` -> `{contracts:[{id, market_id, name, outcome}]}` (H endpoint, M fields).
  - `GET /v3/markets/{ids}/quotes/` -> object keyed by contract id, each `{bids:[{price,quantity}], offers:[{price,quantity}]}` (H for keying by contract id, M for field names).
  - Trades/price history, settled-result and volume-time-series endpoints: NOT FOUND (docs unreadable; searched: sample bot, third-party code).
  - Event fields seen (M): `id, name, short_name, slug, full_slug, type, state, start_datetime, end_date, parent_id, bettable, inplay_enabled, hidden, description, special_rules, venue`. Market fields (M): `id, event_id, name, market_type{name,param}, category, state, winner_count, bet_delay, cashout_enabled, complete, info`.
- Auth and limits: session token via `POST /v3/sessions/` with `{username, password}` -> `{token, ...}`; header `Authorization: Session-Token <token>` (H, official sample). The 2026 client's response type also lists `stop, factor, verify, refresh_token`, suggesting 2FA/refresh flows, and its login body adds `create_social_member` and `remember` (M). API key or OAuth: NOT FOUND. Rate limits: NOT FOUND (docs unreadable). Practical limits seen: the official sample chunks id lists in groups of 20, and a third-party author hit URL-length limits when requesting quotes for every market of a large event (M).
- Websocket / streaming: the legacy Streaming API was a protobuf-over-TCP service (`stream.smarkets.com`) with an official Python SDK, now archived (last push 2019-01-08) (H, `smk_python_sdk` README and repo metadata). A 2026 third-party README says polling "can easily be replaced by the streaming API in the future", implying a current streaming API (M). Current streaming URL, protocol and whether the legacy endpoint still works: NOT FOUND.
- Fixtures: no real JSON could be saved. `docs/research/fixtures/smarkets/` holds only the sanitised challenge headers and a README. No bypass was attempted; the generic User-Agent may itself be what triggers the challenge, which I cannot test without breaking the User-Agent rule.

## Trade path

- Programmatic orders are supported over the HTTP API for a logged-in account (H, official sample): `POST /v3/orders/` with `{market_id, contract_id, price, quantity, reference_id, side: "buy"|"sell"}` returns `available_balance, total_executed_quantity, exposure`; `DELETE /v3/orders/{id}/`; `DELETE /v3/orders/?market_id=`; `GET /v3/orders/?states=created&states=filled&states=partial` with `pagination.next_page`; `GET /v3/accounts/`.
- Signing scheme: none on-chain. Auth is a bearer-style session token obtained with the account's username and password. There is no wallet signature, no EIP-712, no per-order signing.
- Prerequisite: a verified account (KYC, affordability/safer-gambling checks per accounts p.7) funded in GBP.

## PayBox reachability

- paybox_reachable: **no.** The venue is off-chain and fiat; there is no smart contract or signed-order interface to which a Base/Ethereum/BNB/Arbitrum/Polygon/Solana wallet could send a transaction proposal. Funding would need a card/bank path into a KYC'd personal account, and the only credential type is a password-derived session token. Storing that credential in a PayBox secret and calling the HTTP API from a plugin is mechanically conceivable but untested, outside the crypto-wallet model, and likely to run into the account/ToS terms (NOT FOUND, see Geo/ToS). Treat as read-only for the aggregator.

## Fees

- Exchange commission is charged on **net winnings per market**, not on volume: "Smarkets generates revenue primarily through commission, a transaction fee charged to customers based on their net winnings in individual markets ... industry-low flat commission rate of 2%. Additionally, customers introduced from some partners benefit from 0% commission." (H, FY2024 accounts p.3, strategic report; read from the page image.)
- Tiers: Pro Tier 1% commission "on winnings or losses from each individual trade that settles"; Select Tier is for accounts exceeding GBP 25,000 net profit over the previous 12 months, 3% "on winnings or losses" (H, same page; the tail of the Select sentence was cropped in the scan, so exact basis of the 3% is partly unread). Whether Pro requires a subscription or deposit: NOT FOUND.
- Payer: the winner of each market pays commission to Smarkets; the loser pays none. Maker/taker distinction: none found. Deposit/withdrawal fees: NOT FOUND. For arbitrage maths, haircut the winning leg by 2% of its net profit (standard tier).
- Group commission revenue: GBP 5.712m in FY2024 vs GBP 5.543m in FY2023 (H, accounts note 5).

## Resolution and dispute risk

- Resolver: Smarkets itself, against official event results, per market-specific rules. Events carry a `special_rules` field and contracts can settle as `winner/loser/void/deadheat/reduce` (M, third-party types). The market rules themselves were not readable (NOT FOUND, searched: docs, help centre blocked).
- Dispute/oracle risk: low for mainstream sports (operator-settled from official results, UK Gambling Commission/Malta Gaming Authority licensed, customer funds segregated, H); moderate basis risk against crypto venues because void, dead-heat and reduction-factor rules, abandonment/postponement timing and "winner declared by" wording differ from Polymarket/Kalshi rules for nominally identical events. Any cross-venue pairing must compare rule text per event (M).
- Counterparty risk is a regulated operator, not a smart contract. Smarkets had a GBP 9.8m tax provision reversed after a favourable tax-court ruling in April 2025 (H, accounts note 31); net assets GBP 17.6m at 2024-12-31 (H).

## Geo, ToS and automation

- Licences: UK, Malta, Sweden, Ireland, US states of Colorado and Indiana (H, accounts p.3). "The majority of our betting volume in 2024 was generated in the UK" (H). Account eligibility by country, restricted countries and whether non-UK retail can open exchange accounts: NOT FOUND (ToS and help centre blocked).
- Automation: the official sample bot and its README present API trading as supported for account holders and point to a Developers Forum (H). The accounts list "automation abuse" among technology risks (H) and say the group itself runs an algorithmic liquidity provider (Hanson Applied Sciences, below). API-specific terms, rate limits and any prohibition on bots/market-making/scraping: NOT FOUND (ToS unread).
- For this project: a read-only price feed from an authenticated personal session would be the lowest-risk use; placing orders from an automated agent needs a ToS read first.

## Liquidity

- All figures FY2024 (to 2024-12-31, filed 2025-10-02), possibly stale; H unless noted (FY2024 accounts):
  - Group revenue GBP 24.83m (+18%): commission GBP 5.712m, net revenue from betting activity GBP 20.292m (mostly SBK), customer bonuses -GBP 1.174m.
  - "exchange revenue declined by 9% year-on-year"; SBK revenue "nearly doubled". Average monthly active users 34,560 (-6.9% vs 37,108).
  - Customer deposits in segregated accounts GBP 27.6m (31 Dec 2024).
  - Core exchange cohort "Matched Bettors ... continues to be a shrinking market"; 28k new exchange users in 2024.
- Matched volume, open interest and per-market depth: NOT FOUND (docs/`with_volumes` endpoints unreadable; Smarkets does not publish volume in the accounts). Arithmetic only (L): if all commission were taken at the flat 2%, GBP 5.7m would imply about GBP 286m of net winnings; tier mix and 0% partner customers make this a rough order of magnitude, not a volume figure.
- Competitor context from the same accounts: UK volume faces "industry leader Betfair and other smaller exchange operators" (H), so Smarkets is a distant second/third exchange by liquidity in its main market.
- Group-owned market maker: "Hanson Applied Sciences I Limited ... provides liquidity on the exchange - and therefore SBK - through algorithmic trades" (H). Part of the book is house liquidity; expect quotes to track sharper external prices and to be pulled when stale.

## Event coverage and overlap

- Categories: sports (football/soccer, racing, tennis, US sports etc.), politics, current affairs (M: awesome-list entry "Politics, sports, current affairs", L; third-party client shows event types like `football_match`, M). Crypto-price and macro markets: NOT FOUND.
- Overlap with other venues, where arbitrage or reference pricing is plausible: football/soccer match and tournament outrights (2026 World Cup concluded, so club and league markets now), US sports (SBK/US push), UK and US politics (US midterms are 2026-11-03; M, general knowledge), current-affairs props. Polymarket and Kalshi list many of these; Betfair is the primary non-crypto overlap. Depth of Smarkets politics markets in 2026: NOT FOUND.

## Shared liquidity

- Internally shared: SBK (Smarkets sportsbook app) "has been built on top of the exchange, so users of both products enjoy the same odds and variety of markets" (H, accounts p.2), so SBK is not a second venue. Part of the book is the group's own market maker (H).
- Not found to share liquidity with any other external venue (NOT FOUND, searched: accounts, org repos). It is an independent leg relative to Polymarket, Kalshi and the other crypto venues, but not executable from PayBox.

## Adapter notes (if built later)

- Read adapter: authenticated session, poll `popular/event_ids` or `events` by `types/states`, then `events/{ids}/markets/`, `markets/{ids}/contracts/`, `markets/{ids}/quotes/` in chunks of about 20 ids; convert price p to probability p/10000 and decimal 10000/p. Respect Cloudflare: use a normal client identity registered with Smarkets rather than hammering from a datacentre IP; confirm rate limits from docs first.
- Normalise: contract = binary outcome, `winner_count` > 1 means non-exclusive sets, mark `void/deadheat/reduce` as resolution-basis risk, subtract 2% commission on the winning leg.

## NOT FOUND (searched)

- Current docs content, rate limits, streaming URL/protocol, API terms (docs.smarkets.com, help.smarkets.com, community.smarkets.com all challenged; WebSearch budget exhausted so no extra discovery; I did not use archive/proxy services).
- Matched volume / open interest, any 2025-26 volume statistics, US exchange launch status, restricted-country list, ToS automation clauses, trade/history endpoints.
- Politics-market rules and 2026 political market depth.

## Sources

- Companies House, Smarkets Limited company page https://find-and-update.company-information.service.gov.uk/company/06475845 , filing history `.../filing-history` and PSC page (H, fetched 2026-10-19).
- Smarkets Limited annual report and consolidated financial statements FY2024, filed 2025-10-02, Companies House document (scanned PDF, 70 pages) linked from the filing history. Cited pages: CEO review p.1, strategic report pp.2-8, notes 5, 31, subsidiaries (H; text via local OCR, key paragraphs verified against page images).
- Official sample bot https://github.com/smarkets/smk_trading_bot (`README.MD`, `client.py`, `tutorial.py`, `configuration_template.toml`; last commit 2021-12-24) (H; read with gh api; dated, so medium for current behaviour).
- Official legacy streaming SDK https://github.com/smarkets/smk_python_sdk (archived; last push 2019-01-08) and old API blog https://github.com/smarkets/smarkets.github.com (2011 posts; redirect page to docs.smarkets.com) (H, stale).
- Smarkets GitHub org repo list via `gh api orgs/smarkets/repos` (H; activity dates 2026-10-09 and 2026-07-29).
- Third-party client https://github.com/Gbollyhub/smarkets-exchange-viewer (`src/types.ts`, `src/api/*.ts`, `src/lib/misc.ts`, README; pushed 2026-07-31) (M; untrusted third-party code, read only, nothing executed; contained no instructions aimed at AI agents).
- awesome-prediction-markets entry for Smarkets "Politics, sports, current affairs | UK-regulated, GBP" https://github.com/aland4747/awesome-prediction-markets (L).
- Probes: unauthenticated GETs to smarkets.com, docs.smarkets.com, api.smarkets.com (`/v3/`, `/v3/events/`, `/v3/popular/event_ids/`, robots.txt), help.smarkets.com, community.smarkets.com, all Cloudflare challenge 403 (H, fixture `docs/research/fixtures/smarkets/unauth_get_cloudflare_challenge_headers.txt`).
- Not used: Wikipedia (404 for the page URL), WebSearch (session budget exhausted), archive/proxy services.
