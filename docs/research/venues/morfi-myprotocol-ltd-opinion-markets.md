# Morfi (opinion markets) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch and public unauthenticated GETs of morfi.markets and docs.morfi.markets (HTML, robots.txt, sitemap.xml, llms.txt, Mintlify .md pages), one GET to api.morfi.markets/ (404), `gh api` on the public Morfi-Markets org. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party/vendor pages were treated as untrusted data.

Research limit: the shared WebSearch budget was exhausted, so no independent press/news/search pass was possible. Everything below is from first-party pages. Tags: H = read first-hand in a primary source this session; M = summary/inference; L = weak.

## 0. Bottom line

1. **Live, but as a public devnet beta with free test funds (H).** There is no real money on it today. Mainnet has no date and is gated on an "independent security review" (H, docs `safety-and-risk`).
2. **It is not a prediction market in the arbitrage sense (H).** Markets are crowd-opinion contests ("Whose side will the crowd back?"). They do not resolve on any real-world event. "Morfi doesn't look at the real world." The winner is whichever outcome holds a dominant share of money long enough. So there is no external truth to arbitrage against another venue.
3. **No public API, no developer docs, no SDK (H: NOT FOUND).** The only machine-readable items are llms.txt files. A backend host `api.morfi.markets` is referenced by the app HTML but its root returns 404 and it is undocumented; I did not probe further.
4. **Not tradable via PayBox today (H for devnet).** Devnet funds have no value. Even on mainnet it would be Solana-only.
5. **adapter_priority = skip.** Devnet only, no API, resolution unrelated to real events (zero cross-venue overlap), thin by construction. Revisit only if mainnet launches and publishes an API; even then it is at best a sentiment/signal source (P2), never an arbitrage leg.

## 1. Is it still live? (2026)

| Evidence | Tag |
|---|---|
| morfi.markets returns 200, footer "(c) 2026 Morfi", sitemap lastmod 2026-10-19T04:57Z, changefreq hourly for /markets. Home page says "Explore live opinion markets on public devnet. No access code required." Copy shows "$2.5M raised - Pharsalus, Yellow.vc, Solana". | H (https://morfi.markets, https://morfi.markets/sitemap.xml) |
| Docs: "Morfi is in public beta on a test network ... You trade with free test funds, so nothing you put in is real money today. Markets reset from time to time." | H (https://docs.morfi.markets/safety-and-risk.md) |
| Terms: test assets "have no monetary value", cannot be redeemed, do not move to mainnet; "Mainnet launch isn't guaranteed". The site is in "demo mode". | H via WebFetch summary (https://morfi.markets/terms) |
| Mobile apps exist: App Store id6767833271 and Play `com.myprotocol.morfi` (linked from the home page). Not opened. | H (links only) |
| Org GitHub `Morfi-Markets` created 2026-04-20; 3 public repos, all forks (Raydium cp-swap, surfpool, carbon); pushed 2026-04 to 2026-10. No Morfi program source published. | H (`gh api orgs/Morfi-Markets/repos`) |

Verdict: still_live = true (devnet beta, not real-money).

## 2. Kind and market model

- **Kind: on-chain (Solana) "opinion market" consumer app.** Not an event-resolved prediction market. (H)
- **Operator naming:** the task hint says "myProtocol Ltd". The Play package ID contains "myprotocol" (H) but the Terms name the operator only as "Morfi" (Cayman Islands law, ICC arbitration seated there; H via WebFetch). "myProtocol Ltd" is therefore M, not confirmed.
- **Outcomes:** each market is a "debate" with a few (2 to 3 seen) outcomes, each with its own live price, not required to sum to 100%. Home page examples show e.g. 44% / 33% for two outcomes of a debate with a third, so outcome prices are not a normalised probability (H, home page demo cards; they are marketing mock-ups).
- **Pricing: bonding curve per outcome, graduating to an AMM at scale (M).** llms.txt says "a bonding curve graduates to an AMM at scale" and "classic SPL Token outcome tokens"; "tokens pay out 1:1 in USDC if the corresponding outcome wins" (H as a statement in https://morfi.markets/llms.txt, but it contradicts the docs payout model below, see section 6). Docs say: price rises on buys and falls on sells, early money moves price more, a "heavy penalty fee" applies to selling losing sides once one outcome nears the win (H). Curve formula, graduation threshold and AMM details: NOT FOUND (searched: docs.morfi.markets concept pages, /learn/bonding-curves, llms.txt). The fork of Raydium CP-swap in their GitHub org (H) suggests a constant-product AMM for post-graduation tokens (M).
- **Payout (docs):** a prize pool is filled by a trade fee plus the stakes behind losing outcomes; winners split it pro rata to their holdings of the winning side at resolution; holding duration is irrelevant (H, `concepts/claims.md`, `faq.md`). After resolution the winning side "graduates" into a standalone tradable token (H, `concepts/graduation.md`).
- **Market creation:** anyone proposes a debate in a "Launchpad"; once enough backers pledge, it goes live. Early backers earn a share of trading fees (H, `faq.md`).

## 3. Chains and collateral

- **Chain: Solana (M).** The docs never state the chain (WebFetch summary: "Not specified"); llms.txt says "Opinion-market platform built on Solana" with "classic SPL Token outcome tokens" (H, https://morfi.markets/llms.txt). Team bios and a Solana Labs logo are consistent.
- **Collateral: USDC per llms.txt (M)**; docs do not specify. Currently free devnet test funds (H). Program IDs / mint addresses: NOT FOUND.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | NONE. Docs index (https://docs.morfi.markets/llms.txt) lists 19 user-guide pages, no API/developer/SDK section. | H |
| Docs URL | https://docs.morfi.markets/ (Mintlify user docs only) | H |
| Backend host | `https://api.morfi.markets` appears in the app HTML; GET `/` = 404 text/plain. Endpoints undocumented and deliberately not probed. | H |
| Next.js app routes | `https://morfi.markets/api` returns the app's HTML shell (200 text/html), not JSON. `/api/admin/` is disallowed in robots. | H |
| On-chain/subgraph | No program IDs, IDL, indexer or subgraph published. The org uses Carbon (Solana indexing framework fork), which implies an internal indexer (M). | H/M |
| Auth, rate limits, websocket | NOT FOUND. Terms mention "multiple accounts to get around rate limits", so limits exist (M). | - |

Fixtures: none saved. There is no public data API and nothing worth fixturing (llms.txt is a plain doc index).

## 5. Trade path

- Programmatic order placement: **none documented.** Sign-in is app-style (Morfi/X handle, gifting by handle "no wallet address needed"; H, `faq.md`). Wallet/signing scheme: NOT FOUND.
- **PayBox reachability: no today.** Devnet funds are valueless (H). If mainnet launches it would be Solana-only (M), so only a PayBox Solana wallet could ever participate, and only via transaction proposals against undocumented programs. EVM chains (Base/Ethereum/BNB/Arbitrum/Polygon) are not applicable.

## 6. Fees

- Docs: "A small fee on every trade fills the market's prize pool and supports the platform ... Fees are described qualitatively because they can change." (H, `faq.md`)
- Terms: fees are dynamic by market lifecycle stage, outcome dominance and market cap, each with a configurable maximum, split among the prize pool, backer rewards and the platform treasury (H via WebFetch of /terms). Also a "small fee" to withdraw backing from a proposal, referral fee shares in two tiers, and a heavy sell penalty on losing sides near resolution (H).
- Marketing claim "no house edge / Morfi takes no cut of the prize pool" (H, `claims.md`) coexists with a treasury share of fees (H, Terms): both are the operator's own statements. Numeric rates: NOT FOUND.
- Inconsistency to flag: llms.txt says tokens "pay out 1:1 in USDC"; docs say winners split a pro-rata prize pool. These are different payoff models; treat the docs page and Terms as authoritative and the llms.txt line as unreliable (M).

## 7. Resolution and dispute risk

- Rule: an outcome that holds a dominant share of money (measured on a smoothed market-share series) long enough is locked in automatically on-chain; no oracle, referee or admin; "Resolution is final", no re-run (H, `concepts/resolution.md`, `concepts/market-integrity.md`). Dominance threshold and hold duration: "a platform setting that can change"; values NOT FOUND.
- Edge cases: a market can in theory never resolve; cancelled markets are mentioned in llms.txt ("live, resolved, and cancelled") but the rules are NOT FOUND (H/-).
- Risk for an aggregator: resolution has no connection to real-world truth ("It doesn't matter ... Morfi doesn't look at the real world"), so a question like "Did X win the election?" can resolve opposite to reality. Prices are not probabilities of an event. Also whale-influence and thin-market manipulation are acknowledged (H, market-integrity warning).

## 8. Geo, ToS, automation

- Terms: 18+; no restricted-jurisdiction list now, but "may add geographic restrictions ... including for the mainnet release" (H via WebFetch). Cayman law; ICC arbitration.
- Automation: no bot/API rules; prohibited: unauthorised scraping/harvesting, interfering with the backend, wash trading/manipulation, multiple accounts to dodge rate limits (H via WebFetch). robots.txt allows `/` but disallows `/demo-mode/`, `/admin/`, `/api/admin/`, `/auth/` etc. (H). The live app currently runs under `/demo-mode/`, which robots disallows, so crawling market data is not permitted by robots.

## 9. Liquidity

- Real-money volume/OI/TVL: **none** (devnet, test funds; H). The site's demo cards show "$5K prize pool, 15 traders" but these are labelled illustrative mock-ups on the marketing page (M). Raise: $2.5M (company claim, H as a site statement, undated).

## 10. Event-category overlap and shared liquidity

- Categories: sports, politics, crypto, culture, taste/brand debates (H, home page). Titles are subjective debates ("Kendrick or Drake?", "Was the 2020 election stolen?") not date-bound factual questions.
- Overlap with real-event venues exists only at the topic level; no price is comparable because resolution is not event-based. **No arbitrage leg.**
- Shared liquidity: none known. Graduated winner tokens may trade "on other apps" (H, graduation doc), meaning on Solana DEXs; that is token-market data, not a prediction price.

## 11. Not found

- API, SDK, rate limits, websocket: none published.
- Program IDs, IDL, audit report, security-review firm, mainnet date.
- Bonding-curve formula, graduation threshold, numeric fees, resolution thresholds.
- Confirmation that "myProtocol Ltd" is the legal operator (Terms name only "Morfi").
- Any independent press, volume, or TVL source (web search budget exhausted).

## Suspicious content

None. Docs pages include "Documentation Index ... Fetch the complete documentation index at llms.txt" boilerplate banners (Mintlify) which are not instructions to act on and were only used as a page index.

## Sources

- https://morfi.markets (home, FAQ questions only visible; H)
- https://morfi.markets/llms.txt (H)
- https://morfi.markets/robots.txt, https://morfi.markets/sitemap.xml (H)
- https://morfi.markets/terms (H via WebFetch summary)
- https://morfi.markets/learn/bonding-curves, https://morfi.markets/learn/how-morfi-resolves (H, thin)
- https://docs.morfi.markets/llms.txt, /faq.md, /safety-and-risk.md, /concepts/resolution.md, /concepts/how-prices-work.md, /concepts/market-integrity.md, /concepts/claims.md, /concepts/graduation.md, /concepts/winners.md, /guides/trading.md (H)
- https://github.com/Morfi-Markets (3 forked repos; H)
- GET https://api.morfi.markets/ -> 404 (H)
