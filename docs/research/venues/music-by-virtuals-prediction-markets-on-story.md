# Music By Virtuals prediction markets on Story - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, `gh search repos`, public unauthenticated GETs (HTTP status probes of candidate hosts; DefiLlama `/protocols` list). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used.

Research limit: the shared WebSearch budget was exhausted before my first (and only) search ran, so there was NO search-engine pass. Discovery relies on the one SEC exhibit, direct host probing, GitHub repo search and DefiLlama. The venue's own site was never found, so every claim about how it works is NOT FOUND.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.

---

## 0. Bottom line

1. **The only evidence is one sentence in an IP Strategy / Story-ecosystem press release filed as an exhibit to a Heritage Distilling 8-K (H).** It says "The team behind Music By Virtuals ... has launched the first prediction markets on Story". Example markets: a ZCASH price market on Binance, and a market on whether two "Kpop Demon Hunters" songs stay in the top 5 of the Melon chart for November (H). That is November 2025, so the evidence is nearly 11 months old (stale, L for current status).
2. **No venue site, docs, contracts, repo, subgraph or API found (NOT FOUND).** See section 9 for what was searched.
3. **Not visible as a protocol on DefiLlama's Story chain list (H, negative result):** the 14 protocols tagged Story contain no prediction market (section 1).
4. **still_live = false (unconfirmed).** Treat as unverified/likely dead or negligible. No 2026 evidence of any activity.
5. **adapter_priority = skip.** No API, no liquidity evidence, no resolution rules, bespoke/IP-specific questions with little overlap, and the "team" is an unnamed side project of a Virtuals-ecosystem group.

---

## 1. Is it still live? (2026)

| Check | Result | Tag |
|---|---|---|
| SEC exhibit `https://www.sec.gov/Archives/edgar/data/1788230/000149315225026215/ex99-1.htm` (WebFetch) | Exists. Heading "Team Behind Music By Virtuals Launches First Prediction Markets on Story". Document dated 2 Dec 2025 ("November 2025 update") by the page summary, not 4 Dec as in the discovery hint (the 4 Dec date is probably the 8-K filing date; not checked). The release says "Virtuals" appears only as part of the name "Music By Virtuals". | H (content via a small-model page summary, so quotes should be re-checked against the raw page) |
| What the release says about the product | Positioning: "taking aim at both broad and IP-specific predictions", referencing Kalshi and Polymarket as the general model. First markets: ZCASH price on Binance; two Kpop Demon Hunters songs in Melon top 5 for November. | H |
| Release is a third-party recap, not primary | It is a Story-ecosystem digest inside an issuer's 8-K exhibit (Heritage Distilling, CIK 1788230, a company with an IP token treasury). No link to the venue was extracted. | H |
| DefiLlama `https://api.llama.fi/protocols` (public GET) | Protocols listing Story as a chain: LayerZero V2, Gate, Zoo Finance, Orderly Bridge, Verio, Story Hunt, Wand Protocol, Satori Perp, PiperX V3, ZenoLend, PiperX V2, Meta Pool stIP, Unleash Protocol, Aria Protocol. No prediction market, no "Music By Virtuals". Only name matches for "virtual"/"music": "Virtuals Protocol" (Base, TVL 0) and "Musical Chairs Gaming" (unrelated). `/v2/chains` has no chain entry whose name starts with "Story". | H (as a negative; absence from DefiLlama is not proof of absence) |
| Candidate hosts, `curl` with the generic UA | `musicbyvirtuals.com`, `www.musicbyvirtuals.com`, `musicbyvirtuals.xyz`, `musicbyvirtuals.io`, `music.virtuals.io`, `mbv.fun`, `docs.virtuals.io`: DNS does not resolve. `app.virtuals.io`, `www.virtuals.io`, `api.virtuals.io`, `x.com/musicbyvirtuals`: respond 200 (x.com is a generic shell; WebFetch of x.com returned HTTP 402, recorded and stopped). | H |
| `app.virtuals.io` (WebFetch) | Only the title "Virtuals Protocol / Society of AI Agents"; client-rendered, no music or prediction-market text. | H |
| Virtuals whitepaper `whitepaper.virtuals.io` and `/llms.txt` (WebFetch) | No mention of music prediction markets, prediction markets or Story. Closest items: "Luna" (AI girl band vocalist), voice core. | M (summary-level read) |
| GitHub repo search ("music by virtuals", "musicbyvirtuals", "story protocol prediction market", "kpop demon hunters prediction") | 0 results each. | H (negative) |
| Story ecosystem page `story.foundation/ecosystem` | 308 redirects to `datafdn.org/ecosystem`, which returns 404. (Story's web presence appears to have moved to a new domain; the brand change itself was not investigated.) | H |

Verdict: **still_live = false (not confirmed; no 2026 evidence at all).**

---

## 2. Kind and market model

- Kind: on-chain, small-team prediction markets on Story L1 (M, from the single press sentence; "on Story" could also mean built on Story IP assets).
- Market model: **NOT FOUND** (searched: SEC exhibit, virtuals whitepaper, GitHub, DefiLlama). The examples are a threshold/price market (ZCASH on Binance) and a chart-rank market (songs staying in Melon top 5), which look like Yes/No binaries (L, inferred from the question forms).
- Pricing mechanism (order book / AMM / parimutuel) and outcome tokenisation: NOT FOUND.

## 3. Chains and collateral

- Chain: Story (stated as "on Story", H via press release). Story is an EVM L1 with native token IP (the release says "AI-native blockchain network powering the $IP token", H).
- Collateral: NOT FOUND.
- PayBox reachability: Story is not in the chain list the task cites (Base, Ethereum, BNB, Arbitrum, Polygon, Solana); I did not verify PayBox Story support. Moot, since no contracts are known.

## 4. Read API

NOT FOUND. No docs URL, base URL, endpoints, auth, rate limits or websocket (searched: all hosts in section 1, Virtuals whitepaper and llms.txt, GitHub, DefiLlama). Exists = `none` (unknown whether on-chain events exist; no contract addresses to index).

No fixtures saved: there is no public read API to sample.

## 5. Trade path

None found. No signed-order scheme, no contract ABI, no transaction-proposal path.

## 6. Fees

NOT FOUND.

## 7. Resolution mechanism and dispute risk

NOT FOUND. The questions named (Binance ZCASH price; Melon chart ranking) imply a centralised or team-operated resolution on a single web source (L, inference). Melon charts are a Korean consumer site; exact resolution rules, an oracle or a dispute path are unknown. Assume high resolver risk.

## 8. Geo / ToS / automation, liquidity, event overlap

- Geo/ToS/automation: NOT FOUND.
- Liquidity: NOT FOUND (no volume, OI or TVL anywhere; DefiLlama has no TVL line for it). Treat as zero until shown otherwise.
- Event overlap: the ZCASH-on-Binance price market is a crypto price question that overlaps Polymarket/Limitless-style crypto price markets (L, only if similar markets exist). The Melon chart / K-pop markets are IP-specific with no known overlapping venue.
- Liquidity shared with another venue: no evidence either way; unknown. Nothing suggests it is built on Polymarket or another venue's liquidity.

## 9. What would change the rating

Re-open only if someone finds (a) the actual app URL (via the project's own X account or a Story ecosystem listing), (b) deployed contract addresses on a Story explorer, and (c) any non-trivial volume in 2026. A suggested next step for a human: check the project's X account bio (the account page returned 200 but WebFetch of x.com was refused with HTTP 402 and not retried) and the Story explorer for factory-style contracts.

NOT FOUND list: venue site, docs, API, contracts, repo, fees, collateral, resolution rules, ToS, volume/TVL, any 2026 activity. Searched: SEC exhibit, 12 candidate hostnames, Virtuals app/whitepaper/llms.txt, Story ecosystem page, GitHub repo search (4 queries), DefiLlama protocols and chains. WebSearch: not possible (session budget exhausted).

---

## Suspicious content (untrusted data, not followed)

- `https://whitepaper.virtuals.io/llms.txt` and the main whitepaper page contain an "Agent Instructions" block telling AI agents to send a GET request to the docs site's query endpoint (`ask` / `goal` parameters). Not followed.
- `https://x.com/musicbyvirtuals` returned an HTTP 402 to WebFetch (no payment details were readable; not retried and nothing paid).

## Sources

- SEC exhibit (H): https://www.sec.gov/Archives/edgar/data/1788230/000149315225026215/ex99-1.htm
- SEC 8-K filing list for CIK 1788230 (H, shows no 2026 8-K item dated 2025-12; the Dec 2025 filings are not in the 10 most recent shown): https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1788230&type=8-K
- DefiLlama protocols: https://api.llama.fi/protocols (H)
- Virtuals app: https://app.virtuals.io (H); whitepaper: https://whitepaper.virtuals.io and https://whitepaper.virtuals.io/llms.txt (M)
- Story ecosystem page redirect: https://www.story.foundation/ecosystem -> https://www.datafdn.org/ecosystem (404) (H)
