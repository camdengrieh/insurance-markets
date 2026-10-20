# Verso (verso.trading) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict (one paragraph)

**Skip. Verso is dead and was never a venue.** It was a Kalshi-first, UI-only "Bloomberg-style" trading terminal (a front end over other venues' liquidity), not a market with its own order book, tokens, collateral or resolution. Its domain `verso.trading` expired 2026-08-06 and is now in registry "pending delete" with no nameservers (H). The Y Combinator record that used to be "Verso" is now named "fixa" and sells something unrelated (H). No public API ever existed (M). Nothing here is integrable, and it adds no independent liquidity, so it is not an arbitrage leg. Adapter priority: **skip**. Any spec that cites Verso as a data source or venue should be corrected.

## Liveness evidence (the part that matters)

| Check | Result | Tag |
|---|---|---|
| DNS, 2026-10-19: `verso.trading`, `www.`, `app.`, `api.` via system resolver, 1.1.1.1 and 8.8.8.8 | NXDOMAIN (curl error 6 "Could not resolve host"; `dig` status NXDOMAIN) | H |
| `.trading` registry RDAP (Identity Digital), 2026-10-19 | status `pending delete` + `inactive`; registered 2025-08-06; **expired 2026-08-06**; last changed 2026-10-18; `nameservers: []`; registrar Porkbun | H |
| Third-party scripted dossier, 2026-09-08 | site identity "porkbun.com \| domain for sale" (a registrar parking page one month after expiry) | M |
| Kairos tools list (updated 2026-10-12 push) | Verso row marked "Unreachable - 2026-08-27", venue column "Polymarket, Kalshi", API column "?" | M |
| Internet Archive CDX | `www.verso.trading/` first captured 2025-08-07, last HTTP 200 capture **2026-06-17**; `accounts.verso.trading` (Clerk sign-in) last captured 2026-02-09. So the site was up at least until mid-June 2026 and died between then and the 2026-08-06 expiry | H (archive index) |
| YC directory | `https://www.ycombinator.com/companies/verso` now redirects to `/companies/fixa` ("fixa: Fix your voice agents faster", Fall 2024, 2 people, NYC). The same record's X link is still `x.com/VersoTrading`. The yc-oss API record id 30014 now lists `former_names` including "verso", "Verso", "Clarus", "Apex", "pixa" and website `fixa.dev`; the stale `batches/fall-2024/verso.json` was last updated 2025-09-23 | H |
| `fixa.dev` homepage | "Fixa: The AI Software Engineer in the Cloud"; no mention of Verso, Kalshi, Polymarket or prediction markets | H |

Inference (M): the Verso team abandoned the prediction-market terminal and moved to an unrelated AI product; the domain was left to lapse. I did not find an announcement of this, so "pivoted" is inferred from the YC rename plus the lapsed domain, not read in a statement.

Prior repo notes (docs/research/10-aggregation-landscape.md 1.7, 14-platform-of-platforms.md 8.3) already marked Verso dead at M; this session upgrades that to H on the registry status.

## Kind and market model

- Kind: aggregator / trading-terminal front end (web UI). Not a venue. (M: directory and vendor-comparison descriptions; the live site is gone.)
- Market model: none of its own. It displayed Kalshi (and per a directory listing, "planned" Polymarket) contracts. The last archived homepage (2026-06-17, H via archive) has title "Verso | Prediction Market Data", meta description "Verso puts live Kalshi odds, depth, and alerts on one screen.", and copy "$2B+ Kalshi Volume / 24/7 Live Market Data / Pro Trading Tools" with Sign in / Get started / Go to app buttons. That is Kalshi-only marketing in mid-2026.
- Directories described it as "V0 Beta" with "smart order routing", an AI news engine mapping headlines to Kalshi contracts (self-reported "73% accuracy", unverified vendor claim, L), and "15,000+ active contracts" (L).
- A directory listing (polymark.et) says Kalshi is the current focus and Polymarket a "planned expansion"; other lists claim Polymarket + Kalshi. Treat Polymarket coverage as unconfirmed (L).

## Chains and collateral

NOT FOUND (searched: archived homepage text, polymark.et listing, simplefunctions comparison, Kairos list, GitHub code search for `verso.trading`). No chain, token, contract address, or collateral was ever documented. As a Kalshi front end it presumably relied on the user's Kalshi account (USD, CFTC-regulated, off-chain), which would make it unreachable from an EVM wallet anyway (L, inferred).

## Read API

- Exists: **none** (official). The simplefunctions provider comparison says (M): "UI-first product - no public REST or WebSocket data API", format "UI only", pricing "Seat-based SaaS" with no dollar amounts, and that Verso "does not expose a queryable calibration endpoint". The same page also contradictorily lists Verso among providers covering "both Kalshi and Polymarket from a single integration" (page is internally inconsistent; I trust the "no API" line, which matches all other sources).
- Docs URL: NOT FOUND (searched: web search, archived `www.verso.trading` robots/sitemap/.well-known - all 404 in archive, Wayback CDX host list shows only `www`, `accounts`, `clerk` subdomains, no `api` or `docs`).
- Base URLs, endpoints, auth, rate limits, websocket: NOT FOUND. The only auth infrastructure observed in the archive was Clerk (`clerk.verso.trading`, `accounts.verso.trading`) for user sign-in to the web app, i.e. no developer API keys (M).
- Fixtures: none possible (no public API; host does not resolve). Evidence files saved instead (see below).

## Trade path

None programmatic. Trading, if any, happened inside the web app against the underlying venue (M). No signing scheme, order endpoint or SDK documented. NOT FOUND (searched: as above).

## PayBox reachability

**no.** The host is dead, there is no API, and the product was a UI over Kalshi/Polymarket, so there is nothing for a PayBox EVM/Solana wallet to propose or sign. Venue-level reachability for Kalshi and Polymarket is covered by the parallel workflow.

## Fees

NOT FOUND. Pricing described as "seat-based SaaS" (M, simplefunctions), no figures. No trading-fee formula was published anywhere I could read.

## Resolution mechanism and dispute risk

Not applicable (no markets of its own). Resolution would be whatever the underlying venue does (Kalshi / Polymarket). Dispute risk for those is in the parallel workflow.

## Geo / ToS / automation

NOT FOUND. Site is down, no ToS archived in the sources I read. `robots.txt` was 404 in the archive (2025-08-07). A scripted dossier (2026-09-08) shows "Disallow: /" but that was captured from the registrar's parking page, not Verso (M, ignore).

## Liquidity

- Own liquidity: none (aggregator).
- The only figure is marketing: "$2B+ Kalshi Volume" on the homepage, which is Kalshi's volume, not Verso's (L, undated vendor claim, archived 2026-06-17).
- **Liquidity shared with:** Kalshi (and nominally Polymarket). It is 100% a mirror of those books, so it is **not an independent arbitrage leg**.

## Event-category overlap

All categories it showed were Kalshi's (sports, politics, macro, crypto price), but that is just Kalshi. No independent overlap value.

## Adapter priority: skip

- Dead (domain pending delete), no API ever, no own liquidity, no execution path.
- Registry guidance: keep a record with `status: dead`, `last_verified: 2026-10-19`, evidence = RDAP + DNS, so directory entries that still list it as live (Prediction Index lists it "live"; Kairos marks "Unreachable"; polymark.et and the Awesome-Prediction-Market-Tools README still link it) do not resurrect it.
- Watch-out: the domain will be released from pending delete within days. After release, someone else can register `verso.trading` and serve content. Do not trust anything that resolves there later, and never feed it into a pipeline (it is a lookalike-takeover risk for anything that cached the URL).

## Suspicious content

None found. No instructions aimed at AI agents in any page read (simplefunctions, polymark.et, YC, fixa.dev, archived Verso homepage). Third-party lists use affiliate `utm_source` tags (e.g. `?utm_source=polymark.et` on the Awesome list entry); not a safety issue, noted for completeness.

## Open questions

- Exact date the site went down (between 2026-06-17 last good capture and 2026-08-06 expiry). Not needed for the decision.
- Whether the team announced a wind-down or pivot (X account `x.com/VersoTrading` was not fetched: no browser automation, and search budget was exhausted mid-task).
- Whether the claimed Kalshi partnership (Sep 2025, from the X account, per earlier repo notes) was ever real. Irrelevant now.

## Fixtures saved (evidence only, no API shapes exist)

- `docs/research/fixtures/verso/rdap_verso_trading_2026-10-19.json` - trimmed RDAP: pending delete, expired 2026-08-06 (H).
- `docs/research/fixtures/verso/wayback_cdx_homepage_2026-10-19.json` - Internet Archive capture index for the homepage, last 200 on 2026-06-17 (H).
- `docs/research/fixtures/verso/yc_oss_record_30014_fixa.json` - YC directory record 30014 showing former name Verso and current name fixa (H).

## Sources

1. [H] `https://rdap.identitydigital.services/rdap/domain/verso.trading` (RDAP via rdap.org redirect), fetched 2026-10-19: pending delete / inactive, expiry 2026-08-06, no nameservers.
2. [H] Local DNS probes 2026-10-19 (curl, dig @1.1.1.1, dig @8.8.8.8): NXDOMAIN for `verso.trading`, `www.`, `app.`, `api.`.
3. [H] Internet Archive: `https://archive.org/wayback/available?url=verso.trading` and `https://web.archive.org/cdx/search/cdx?url=verso.trading&matchType=domain`; snapshot `https://web.archive.org/web/20260617101429/https://www.verso.trading/` (title, Kalshi-only meta description, "$2B+ Kalshi Volume").
4. [H] `https://www.ycombinator.com/companies/verso` redirecting to `https://www.ycombinator.com/companies/fixa`; `https://github.com/yc-oss/api` files `batches/fall-2024/verso.json` (updated 2025-09-23) and `batches/fall-2024/fixa.json` (updated 2026-09-27, `former_names` includes verso).
5. [H] `https://www.fixa.dev/` homepage (unrelated AI-software-engineer product).
6. [M] `https://simplefunctions.dev/compare/prediction-market-data-providers` (2026 vendor comparison; undated entry; says UI-only, no public API; internally inconsistent on coverage).
7. [M] `https://polymark.et/product/verso` (directory listing; "V0 Beta", YC-backed, Kalshi current focus / Polymarket planned; undated, footer 2025).
8. [M] `https://github.com/kairoslive/prediction-market-trading-tools-and-terminals` README, Verso row "Unreachable - 2026-08-27" (vendor-run list, repo pushed 2026-10-12).
9. [M] `https://github.com/Beexly/gse-competitive-intel` `dossiers/verso.trading.json` (scripted fetch 2026-09-08 saw a Porkbun "domain for sale" page).
10. [L] `https://github.com/aarora4/Awesome-Prediction-Market-Tools` README entry (stale link to a dead site; affiliate UTM).
11. [M] Repo notes: `docs/research/10-aggregation-landscape.md` section 1.7, `docs/research/14-platform-of-platforms.md` section 8.3.

Search budget note: the shared WebSearch budget ran out mid-task. One extended search succeeded (it surfaced the polymark.et listing and the then-cached homepage description); a second query for shutdown or pivot news was refused. I did not work around it. Direct first-party checks (RDAP, DNS, YC, archive index) were used instead.
