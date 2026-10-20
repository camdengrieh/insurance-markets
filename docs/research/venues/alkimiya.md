# Alkimiya (alkimiya.io) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch/WebSearch, `dig`/registry `whois`, raw Wayback Machine captures, `gh api` raw reads of the public Alkimiya repos, unauthenticated GETs to `api.llama.fi`. No account, wallet, key, signature, POST/PUT/DELETE, on-chain call or PayBox tool was used. Third-party pages were treated as untrusted data. The shared WebSearch budget ran out after one successful search, so press and social coverage is thin; no search engine was reached any other way.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, or my inference from first-hand data; **L** = weak or stale (older than 6 months is flagged).

---

## 0. Bottom line

1. **Not a prediction market, and not reachable today (H).** Alkimiya was an on-chain "markets for fundamentals" protocol: bounded, continuous-payoff long/short contracts on an index average (BTC fee rate, Base gas revenue, USDC total supply). There is no binary or categorical event contract. The PredictionIndex row ("binary, Base, amm + bonding curve, culture, live") does not describe the Alkimiya protocol.
2. **The whole domain is dead right now (H).** `alkimiya.io`, `www.`, `docs.`, `bazaar.`, `app.` all return DNS SERVFAIL from 8.8.8.8, 1.1.1.1 and from all four authoritative Route 53 nameservers named in the registry (the hosted zone appears to be gone). The domain is still registered (expires 2027-10-06; registry record last updated 2026-09-12). The user's note "site unreachable from here" is a real outage, not a local problem. Fixture: `dns_and_registry_probe_2026-10-19.txt`.
3. **The PredictionIndex row is probably a mis-keyed record for 42 (42.space) (M).** From the Wayback captures, `alkimiya.io` served the "Alkimiya - Markets for Fundamentals" Framer page through at least 2025-09-15, and by 2025-11-12 the same Framer site id (`nc2OnZwKMgvlWHHKNHY4z`) served "42: Trade on Trends & Moments" ("the prediction market for cultural moments", canonical `https://42.space/`) with zero mentions of Alkimiya. That page text explains PI's "culture" topic and "bonding curve" mechanism. 42 is already specced in `docs/research/venues/42-42-space.md` (P2). Who owns both brands is NOT FOUND (see section 9); same Framer project id is evidence of a shared site owner, not proof of a shared team or legal entity.
4. **What is left of Alkimiya itself is tiny.** DefiLlama lists it on Base with **$10.0k TVL on 2026-10-19** (peak $96.8k on 2025-07-19; flat around $10k for 6 months; `deadUrl: true`). By mid-2026 its docs listed one market (USDC Total Supply) instead of three.
5. **adapter_priority = skip.** Nothing to read, nothing to trade, wrong market type, no event overlap, ~$10k TVL. Re-key the PI row to 42 (or drop it) instead of building an Alkimiya adapter.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `dig @8.8.8.8 / @1.1.1.1 alkimiya.io A` (2026-10-19 04:47Z); same for www, docs, bazaar, app | status SERVFAIL for all | H |
| `dig @ns-1812.awsdns-34.co.uk` (and the other 3 registry NS) `alkimiya.io A` | SERVFAIL from all four authoritative servers | H |
| `whois -h whois.nic.io alkimiya.io` | registered via eNom, created 2020-10-06, expires 2027-10-06, updated 2026-09-12, NS = 4 AWS Route 53 servers, DNSSEC unsigned | H |
| `curl https://alkimiya.io/` | "Could not resolve host" | H |
| WebFetch `https://alkimiya.io/` | getaddrinfo ENOTFOUND | H |
| DefiLlama `/protocol/alkimiya` | listed, category Derivatives, chain Base, TVL $10,037 (2026-10-19), `deadUrl: true`, listed 2025-06-24 | H |
| Wayback: `docs.alkimiya.io/docs/getting-started` captured 2026-06-14, `/reference/architecture` 2026-07-18; `alkimiya.io/blog` captured 2026-07-18 as 404 | docs and some site still resolved in June-July 2026; outage began later (registry record touched 2026-09-12, cause NOT FOUND) | H (captures) / M (inference on timing) |
| Wayback: last 200 capture of the `alkimiya.io` root | 2025-12-09 (content = 42 landing page) | H |
| Crunchbase / PitchBook profile pages | HTTP 403 to WebFetch; a search snippet says PitchBook lists "Out of Business" (deal-table date 2026-04-24) while Crunchbase says Active | L (snippet only, unverified) |
| X account `@alkimiya_io` | WebFetch returned HTTP 402; stopped, nothing read | not read |

Verdict: **still_live = false** for Alkimiya as a venue. Contracts on Base may still hold ~$10k, but no front end, docs or orderbook host resolves.

---

## 2. Kind and market model

- **Kind:** on-chain derivatives on "fundamental" indices (blockspace fees, onchain revenue, stablecoin supply); peer-to-peer via an off-chain order book plus pool contracts. Self-description: "a market protocol for fundamental metrics ... Forecast ... turns these fundamental metrics into live, liquid, tradable markets" (H, docs.alkimiya.io getting-started, archived 2026-06-14). Launched August 2024 (H, same page).
- **Outcome model: scalar/continuous with cap and floor, not binary.** Docs: "Continuous Payoffs. No more binary wins/losses." and "Bounded Risk. Markets have built-in caps and floors" (H). Payouts per docs "Fill available orders" (H, archived 2026-06-14):
  - Long: `Payout = (min(Cap, max(avg(index in pool period), Floor)) - Floor) x Size`
  - Short: `Payout = (Cap - min(Cap, max(avg(index in pool period), Floor))) x Size`
  A pool is "the set of all buy and sell positions within the same period" (H, core-concepts). The UI shows "Implied Total Gas" with "Less than / More than" order sides (H, bazaar capture 2025-06-02, L: stale).
- **Mechanism:** order book (orders posted to a GraphQL "Orderbook Service", filled on chain) - not an AMM, no bonding curve (H, architecture page, archived 2026-07-18). PI's "amm, bonding curve" does not match Alkimiya.
- **Tokenisation:** positions are ERC-1155 tokens in a `SilicaPools` contract; `SilicaIndex` contract "behaves like an Oracle" and settles pools (H, architecture page). Open-source V2.1 contracts (Aug 2023) are a different, older design (`SilicaV2_1`, ETH-staking oracles) (H, github.com/Alkimiya/V2.1-contracts).
- **Markets over time (H, docs table of contents):** 2025-08 capture lists handbooks for BTC Fee, Base Fee (revenue) and USDC Total Supply; the 2026-06 capture lists only USDC Total Supply ("The current market, USDC total supply ... data is pulled directly from Circle's public API", index-types page).

## 3. Chains and collateral

- **Chain: Base (M).** DefiLlama: `chains: ["Base"]`; PI: Base. Contract addresses: NOT FOUND (the public `Alkimiya` GitHub org holds only 2023-era repos: `v1-core-contracts`, `V2.1-contracts`, `vault-subgraph`; the SilicaPools/SilicaIndex deployment is not published there, and `docs.alkimiya.io/reference/silicapools` was not readable).
- **Collateral/payment (M/L):** the 2025-06 bazaar UI quotes sizes and payments in **wETH** (L, stale); DefiLlama's current TVL token mix is USDC $4.2k, cbBTC 0.054 (~$4.45k), WETH 0.566 (~$1.37k) (H, API read 2026-10-19; classification of those balances as trader collateral is M).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Existence | Orderbook Service = "a GraphQL server where Alkimiya users can post their orders or retrieve orders from other Alkimiya users" | H (architecture page, archived 2026-07-18) |
| Base URL | NOT FOUND (searched: archived docs pages, archived bazaar app HTML, GitHub org). Not reachable anyway: every alkimiya.io host fails DNS. | H |
| Docs | `https://docs.alkimiya.io/` (ReadMe/GitBook, "API Reference v1.0 / v2.0 / v2.1"); now unresolvable | H |
| Auth, rate limits, websocket | NOT FOUND | - |
| Subgraph | `Alkimiya/vault-subgraph` repo exists (2023); no live endpoint known | H (repo listing) |
| Dune | `dune.com/alkimiya` showed "No dashboards yet" to WebFetch; a `base-gas-econ` dashboard URL is referenced from old pages | L |
| Aggregators | DefiLlama TVL only (`/protocol/alkimiya`); its fees/volume summary endpoints are paywalled ("Upgrade to the paid API plan") | H |

Fixture: `defillama_protocol_alkimiya_trimmed_2026-10-19.json` (the only live machine-readable source).

## 5. Trade path and PayBox reachability

- **Trade path (documented, historic):** off-chain signed orders posted to the GraphQL orderbook, filled via on-chain `SilicaPools` calls; positions claimed after maturity. Signing scheme, order struct, endpoints: NOT FOUND.
- **PayBox reachable: no.** An EVM wallet on Base could in principle call the contracts, but there is no known address, no ABI, no working orderbook host, and the market type (average of an index) has no counterpart on other venues. Nothing was signed or sent.

## 6. Fees (L: stale, unconfirmed for 2026)

- "Taker fees (50 bps)" shown in the bazaar order ticket, captured 2025-06-02 (L, >6 months old). Maker fee, settlement fee, and who receives them: NOT FOUND. DefiLlama has a `fees: alkimiya` adapter but the data is behind a paid plan.

## 7. Resolution and dispute risk

- **Mechanism (H, index-types and core-concepts pages):** index-based settlement. The USDC market averages Circle's public supply API over the pool period; docs warn "Index construction relies on third-party platforms ... may introduce external trust or data lag". "Onchain events" shown beside the charts are submitted by whitelisted projects/community and vetted by Alkimiya, but are informational ("not guaranteed" to affect the index).
- **Dispute process:** NOT FOUND. Admin/oracle trust is concentrated in Alkimiya (the Silica Index is a protocol-controlled oracle). The Zellic audit (May 2024, "3 critical findings" per a search snippet, L) was not readable (HTTP 403).

## 8. Geo / ToS / automation

- Terms of Service v1.1 (Aug 13 2023; Wayback capture 2025-07-13) (H): products "ARE NOT OFFERED TO PERSONS OR ENTITIES WHO RESIDE IN, ARE CITIZENS OF ... THE UNITED STATES OF AMERICA", plus sanctioned territories; VPNs and anonymisation tools banned; prohibited: "any robot, spider, crawler, scraper or other automated means or interface not provided by us". Moot while the site is down; relevant only if it returns.

## 9. Liquidity

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL | **$10,037** (Base) | DefiLlama `/protocol/alkimiya`, 2026-10-19 | H |
| TVL 30 d / 90 d / 180 d ago | $10,063 / $8,891 / $9,736 | same series | H |
| TVL peak | $96,800 | 2025-07-19 | H |
| Volume / OI | NOT FOUND (DefiLlama derivatives and fees endpoints need a paid plan; Dune empty) | - | - |
| Raise | $7.2M, Jan 2023 (1kx, Castle Island lead) | DefiLlama `raises` (and a search snippet) | M |

Flat TVL for six months implies little to no active trading (M, inference).

## 10. Event categories and overlap

None. Indices are BTC fee rate, Base gas revenue, USDC total supply. No sports, politics, macro-event or crypto-price-threshold overlap with Polymarket/Kalshi/etc. Not an arbitrage leg and not even a clean signal source.

## 11. Shared liquidity

None known for Alkimiya's own pools. The domain's brand/site continuity with 42 (42.space, BNB Chain, parimutuel eventcoins) is covered in `42-42-space.md`; do not count the two as separate venues.

## 12. Priority

**skip.** Dead hosts, no API, wrong market type, no overlap, ~$10k TVL. If anything: fix the PredictionIndex-derived registry row (`alkimiya` -> point to 42, or mark defunct).

---

## Not found / open questions

- Contract addresses and ABIs for SilicaPools/SilicaIndex on Base; orderbook GraphQL URL; maker/taker fee schedule in 2026.
- Whether Alkimiya's team is the 42 team (same Framer project id is the only link; docs.42.space does not mention Alkimiya); why DNS died between 2026-07-18 and 2026-10-19 (registry record updated 2026-09-12).
- Whether the protocol formally sunset (no announcement found; blog/X not readable).

## Suspicious content (untrusted data, not followed)

- `docs.alkimiya.io` pages (archived 2026-06/07) carry a banner aimed at AI agents: "For AI agents: visit https://docs.alkimiya.io/llms.txt for an index of all pages ..." I did not fetch it (host is dead; the instruction came from a third-party page).
- WebFetch to `x.com` returned HTTP 402 Payment Required; no payment details were available and nothing was paid.

## Sources

- PredictionIndex ecosystem page (row: Alkimiya, binary, Base, "amm, bonding curve", live, website alkimiya.io): https://predictionindex.xyz/ecosystem (H, read 2026-10-19; also saved in the existing `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`)
- DNS/registry probe: fixture `dns_and_registry_probe_2026-10-19.txt` (H)
- DefiLlama: https://api.llama.fi/protocol/alkimiya and https://api.llama.fi/protocols (H, 2026-10-19)
- Wayback captures (raw `id_` GETs, web.archive.org): `alkimiya.io/` 2025-08-27, 2025-09-15, 2025-11-12, 2025-12-07, 2025-12-09; `docs.alkimiya.io/docs/getting-started` 2026-06-14; `/docs/core-concepts`, `/docs/index-types`, `/docs/fill-available-orders` 2026-06-14; `/reference/architecture` 2026-07-18; `/reference/introduction` 2025-05-16; `bazaar.alkimiya.io` 2025-06-02; `alkimiya.io/legal/terms-of-service` 2025-07-13 (H as captures)
- GitHub: https://github.com/Alkimiya (org, repos last pushed 2023; `.github` profile 2025-02-20), https://github.com/Alkimiya/V2.1-contracts (H)
- Search snippets (L): PitchBook https://pitchbook.com/profiles/company/467922-70 (403 to fetch), Crunchbase https://www.crunchbase.com/organization/alkimiya-protocol (403), Zellic https://reports.zellic.io/publications/alkimiya/ (403), https://cryptojobslist.com/companies/alkimiya-technologies
- Related existing note: `docs/research/venues/42-42-space.md`

Fixtures (`docs/research/fixtures/alkimiya/`): `dns_and_registry_probe_2026-10-19.txt`, `defillama_protocol_alkimiya_trimmed_2026-10-19.json`, `predictionindex_alkimiya_entry_2026-10-18.json`, `wayback_alkimiya_io_homepage_switch_evidence.json`.
