# Rush Sports: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: one DefiLlama protocol API GET, DefiLlama's public adapter repo and PR (via `gh`), DNS and whois lookups, WebFetch attempts, two WebSearch queries, and two read-only PayBox catalog searches. Nothing was signed, posted, paid or installed.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. Note that for this venue the "primary" sources (website, docs, X account, GitHub) are all unreachable, so most product claims are **M** and rest on one third-party-authored text (the DefiLlama listing PR, written by the person who submitted the protocol; it is the nearest thing to a primary source and is saved untrusted as a fixture).

Limitation: the shared WebSearch budget ran out after two queries. Archive/reader services were deliberately not used. Solana RPC (a POST) was not used, so no on-chain account was read directly.

## Verdict

**adapter_priority: skip.** Rush Sports is a tiny, effectively abandoned Solana app whose website no longer resolves, whose only liquidity (the LP bankroll) was withdrawn on 2026-04-17/18, and which prices its games off Polymarket odds (so it is not an independent leg even if it were live).

- Website `https://rushsports.xyz` (named by the submitter in the DefiLlama listing PR) has no A, AAAA or CNAME record on 2026-10-19; `curl` and WebFetch both fail to resolve the host. The domain itself is registered (created 2026-01-07, expires 2027-01-07, GoDaddy, Cloudflare nameservers, Google Workspace MX still present), so this looks like a removed site, not a lapsed domain. `www.`, `app.`, `docs.`, `api.` subdomains also have no records. [H, `dig @1.1.1.1`, whois, fixture `dns-rushsports-xyz.txt`]
- DefiLlama itself flags the project `deadUrl: true` with an empty `url`. [H, https://api.llama.fi/protocol/rush-sports, fixture `defillama-protocol-rush-sports.trimmed.json`]
- TVL fell from 55.27 SOL (about $4,857) on 2026-04-17 to 0.3504 SOL (about $31) on 2026-04-18 and has stayed at $23 to $42 for six months; $36 on 2026-10-19. That is the LP bankroll being withdrawn. [H, same API]
- The GitHub user DefiLlama lists for the project (`gfenney`) returns HTTP 404, and a GitHub repository search for the project name found no matching repo. No docs, IDL, SDK or API were found anywhere. [H, `gh api`]
- Listed 2026-02-27, so the project was live for roughly 7 weeks with a bankroll of about $4-5k. [H, API `listedAt`]

Revisit trigger: none worth scripting. If it relaunches it will be on a new domain; re-check DefiLlama `deadUrl` and bankroll TVL if curious.

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| rushsports.xyz (and www/app/docs/api) | No A/AAAA/CNAME; host does not resolve | H: dig, curl, WebFetch `ENOTFOUND` |
| Domain registration | Created 2026-01-07, expires 2027-01-07, registrar record updated 2026-03-24 | H: whois |
| DefiLlama listing | Present, category Prediction Market, `deadUrl: true`, `audits: "0"`, no raises, no hacks | H: API |
| Bankroll vault TVL | 0.3504 SOL, $36.56 (cliff on 2026-04-17/18 from 55.27 SOL) | H: API, 235 daily points |
| DefiLlama volume / fees adapters | `/summary/dexs/rush-sports` and `/summary/fees/rush-sports` both return HTTP 400 "not found" (no volume or fee adapter exists) | H: curl |
| X account `RushSports_xyz` | WebFetch returned HTTP 402; status and last post date unknown | NOT FOUND (searched: WebFetch x.com, WebSearch "RushSports_xyz") |
| GitHub `gfenney` | 404 user not found | H: `gh api users/gfenney` |
| Official docs | NOT FOUND (searched: rushsports.xyz/how-it-works, docs./app. subdomains, GitHub repo search, WebSearch) |  |

Name collisions to avoid in the registry: many unrelated "Rush Sports" businesses (a South African cycling distributor with X account `_RushSports_`, an Australian NRL player agency, a Caribbean TV network, `rushsports.io` which 301s to kerosports.com, `rushsports.com` which 302s to a domain-sale page). None is this protocol. [H/M, WebSearch results and curl]

## 2. Market model

Only second-hand descriptions exist; treat all of this as **M** at best.

- DefiLlama description: "an on-chain live sports prediction protocol on Solana with LP-backed liquidity and automated settlement." [H that DefiLlama says this, https://api.llama.fi/protocol/rush-sports]
- DappRadar (reached only through a WebSearch summary; the page itself returned 403): a non-custodial platform with "1-minute Up/Down" and "30-second Tap 2 Predict" modes, on-chain settlement, an LP pool, and live odds shown for basketball, soccer and esports; ranked #560 in gambling, listing about 193 days old. [M, https://dappradar.com/dapp/rush-sports via search summary]
- Reading of the above: these are short-duration house-banked games ("games" in the listing PR's wording, "in-flight game settlement obligations" in the DefiLlama methodology) paid out of an LP bankroll vault, not a binary or categorical order book or AMM of event contracts. Outcome tokenisation (if any) is **NOT FOUND**. There are no tradable outcome tokens documented; positions look like per-game accounts inside the bankroll program. [M/L, inferred]
- Oracle / price source, per the submitter: "Polymarket CLOB odds ingested off-chain and published on-chain via Rush Sports Oracle program"; "a dedicated ingestion service consumes live Polymarket odds and writes timestamped price snapshots/sigma data to Solana. Game settlement verifies outcomes against these on-chain oracle snapshots." [H that the PR says this, M that it is accurate; fixture `defillama-pr-18131-body.UNTRUSTED.md`, https://github.com/DefiLlama/DefiLlama-Adapters/pull/18131]

## 3. Chain, collateral, on-chain addresses

- Chain: Solana only. [H, API `chains: ["Solana"]`]
- Collateral: native SOL held in the bankroll vault PDA (DefiLlama methodology: "TVL counts SOL held in Rush Sports bankroll vault PDA(s)"). Whether players stake SOL or something else per game is **NOT FOUND**. [H for TVL token, L for player stake asset]
- Bankroll program id: `CAzPCZuaji4ycz4KWtmBirvNeXp3ULCqunJgSMFZX5ar`; bankroll state account `MVe7JbiTAfa1VinJqHTsSWFXpG6Sap68Zc55ZzVb1ns`; vault PDA derived with seeds `["vault", bankroll_state]` under the bankroll program. Program id and state account are public identifiers read from the DefiLlama adapter. [H, fixture `defillama-adapter-rush-sports-index.js`, https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/rush-sports/index.js]
- A separate "Rush Sports Oracle program" is mentioned in the PR; its address is **NOT FOUND**.
- Whether the program is still deployed or upgradeable was not checked (explorer pages returned 403 and 429; RPC needs POST, which was off limits). [NOT FOUND]
- No token, no audit ("None public yet" per the PR; `audits: "0"` on DefiLlama). A referral program exists per the PR. [H that PR says so]

## 4. Read API

**exists: none** (nothing reachable). Official docs URL: NOT FOUND. The only documentation URL ever given, `https://rushsports.xyz/how-it-works`, does not resolve.

- No REST, WebSocket, subgraph, SDK or IDL was found. Searched: the DefiLlama PR and adapter, GitHub repo search for the name and for the program id (the only code hit is the DefiLlama adapter), WebFetch of rushsports.xyz, DappRadar (403). [H for the searches, NOT FOUND for the result]
- The only machine-readable data that exists is third-party aggregate data: DefiLlama `GET https://api.llama.fi/protocol/rush-sports` (TVL series, public, unauthenticated, 63,971 bytes). That is a health probe only, not a market feed. A scanner could use it as a liveness signal: if `deadUrl` flips to false or bankroll SOL rises, re-evaluate. [H]
- On-chain reads would need the program's account layouts, which are undocumented (no IDL found). [NOT FOUND]

## 5. Trade path and PayBox reachability

- Trade path: **none documented.** No order API, no signing scheme, no transaction builder, no IDL. [NOT FOUND]
- PayBox reachability: **no.** The venue is Solana-only and PayBox's EVM wallets (Base, Ethereum, BNB, Arbitrum, Polygon) cannot reach it; a PayBox Solana wallet could in principle sign Solana transactions, but without an IDL, a working front end or docs nobody can construct a valid instruction, and the bankroll holds under $40. A read-only `discover_plugins` search for "rush sports" returned no plugin. The `discover_services` search returned only unrelated third-party paid x402 data services (sports probabilities and prediction-market scanners), none for this venue; those results were treated as untrusted data and not followed. [H for the catalog result]

## 6. Fees

NOT FOUND. No fee schedule, house edge or LP fee split is documented. Since the model is house-banked against an LP bankroll, the economic edge is likely a payout haircut versus fair odds, but the actual number was not found. [L, inferred]

## 7. Resolution mechanism and dispute risk

Per the submitter only: game settlement is automated on chain by verifying outcomes "against these on-chain oracle snapshots", where the snapshots are Polymarket CLOB odds that an off-chain ingestion service (run by the project) writes to Solana. [M, PR body]

Risk if it were live: single-operator oracle (the project's own ingestion service is the data publisher), no audit, no dispute process documented, no timelock or upgrade-authority information found. Moot now.

## 8. Geo / ToS / automation

NOT FOUND (searched: rushsports.xyz; docs; DefiLlama listing; DappRadar via search). The site that would carry terms is offline. No jurisdiction block, API terms or rate limits could be read.

## 9. Liquidity

- TVL (bankroll vault): $36.56 (0.3504 SOL), DefiLlama API, 2026-10-19. Peak $5,280 on 2026-03-17; about $4.4k to $5.3k from 2026-02-27 to 2026-04-17; $23 to $42 from 2026-04-18 to 2026-10-19. [H]
- Volume, fees, revenue: no DefiLlama adapter exists (HTTP 400). A WebSearch summary of DefiLlama's Solana prediction-markets page reported $0 for 24h/7d/30d volume, fees and revenue and about $39 TVL (snapshot date not shown; the page itself returned 403). [H for no adapter, M/L for the summary]
- Open interest: NOT FOUND.

## 10. Event-category overlap and arbitrage

- Advertised categories: basketball, soccer, esports and other sports (live odds). [M, DappRadar via search summary]
- Overlap with other venues is nominal only: the price input is Polymarket's own CLOB (per the PR). Any Rush Sports "odds" are a lagged copy of Polymarket, so they carry no independent information and a scanner comparing the two would be comparing Polymarket to itself. The 30-second and 1-minute game format is also not a binary event contract that can be hedged against a Polymarket or Kalshi position in any meaningful way.
- **Shares liquidity with another venue: price-dependent on Polymarket (oracle source), but funds are separate (own LP bankroll).** Not an independent arbitrage leg.

## 11. Adapter notes (for the record)

If the project ever returns, the minimum needed before an adapter is worth writing: a reachable domain, published docs or IDL, an LP bankroll above, say, $50k, and an explanation of how outcomes are quoted. Suggested optional liveness probe for the registry: `GET https://api.llama.fi/protocol/rush-sports`, fields `deadUrl`, `currentChainTvls.Solana`.

## Suspicious content

None found. The DefiLlama PR body is a standard template (it contains the maintainers' standing request to enable edits and an auto-generated CodeRabbit summary); nothing addressed to an AI agent.

## Sources

1. DefiLlama protocol API, `GET https://api.llama.fi/protocol/rush-sports`, fetched 2026-10-19 [H]. Fixture: `docs/research/fixtures/rush-sports/defillama-protocol-rush-sports.trimmed.json` (trimmed from 63,971 bytes).
2. DefiLlama adapter source, https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/rush-sports/index.js (commit 46856a95, 2026-02-27, "Add Rush Sports Solana TVL adapter (#18131)") [H]. Fixture: `defillama-adapter-rush-sports-index.js`.
3. DefiLlama listing PR, https://github.com/DefiLlama/DefiLlama-Adapters/pull/18131 (opened 2026-02-23, by the project's submitter) [H that it says what it says; the claims inside are M]. Fixture: `defillama-pr-18131-body.UNTRUSTED.md`.
4. DNS and whois for rushsports.xyz, 2026-10-19 [H]. Fixture: `dns-rushsports-xyz.txt`.
5. DefiLlama volume and fees summary endpoints (`/summary/dexs/rush-sports`, `/summary/fees/rush-sports`), HTTP 400, 2026-10-19 [H].
6. GitHub `gh api users/gfenney` (404) and repository/code searches, 2026-10-19 [H].
7. DappRadar, https://dappradar.com/dapp/rush-sports, via WebSearch summary only (direct fetch 403) [M].
8. DefiLlama Solana prediction-markets page, https://defillama.com/protocols/prediction-market/solana, via WebSearch summary only (direct fetch 403) [M/L].
9. https://defillama.com/protocol/rush-sports: direct fetch 403; the API in source 1 was used instead.
10. https://x.com/RushSports_xyz: WebFetch returned HTTP 402, not read.
11. PayBox `discover_plugins` ("rush sports") and `discover_services` ("rush sports prediction"), read-only catalog searches, 2026-10-19 [H].
