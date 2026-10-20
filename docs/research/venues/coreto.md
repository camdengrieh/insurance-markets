# Coreto (COR) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web page reads, DNS lookups, `gh api` reads of public GitHub metadata, and unauthenticated GETs to the public Blockscout and DefiLlama APIs. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (all tiny, real responses): `docs/research/fixtures/coreto/` (section 11). Note these are **token metadata and DNS evidence, not a venue API**, because no venue API exists.

---

## 0. Bottom line

1. **Not a prediction market.** Every first-hand and secondary description says Coreto is a **reputation / trust social platform** ("Coreto Platform" + "Decentralized Reputation System", DRS) whose COR token is a utility token for rewards, staking and content monetisation. The only link to "prediction markets" is a **category tag** on aggregator sites (CoinMarketCap, Bitget). I found no order book, AMM, market, outcome token, odds, or resolution mechanism anywhere in the official GitHub org or the third-party descriptions. The discovery label `kind=other` was the right instinct; the category tag looks like a misclassification (M).
2. **The venue is almost certainly dead as a product.** `coreto.io` (the only official domain, per the GitHub org and CMC) does **not resolve**: SERVFAIL from 1.1.1.1, 8.8.8.8 and 9.9.9.9, still SERVFAIL with DNSSEC checking disabled (`+cd`), while a control domain resolves. The `.io` TLD server still has a DS record for it, so the delegation exists but the authoritative side is not answering (H for the observation, M for the "dead" inference). The official GitHub org was last pushed **2022-12-14** (H). CMC's prediction-markets table shows COR with price "$--" and no market cap/volume (M). Only the ERC-20 still has occasional transfers (latest 2026-10-09, H) - that is a token, not a product.
3. **No read API, no trade path, no liquidity, no overlap.** Nothing to integrate.
4. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://coreto.io/` and `https://www.coreto.io/` via WebFetch | `getaddrinfo ENOTFOUND` for both hosts (fetched 2026-10-19) | H |
| DNS: `dig` A record for coreto.io at 1.1.1.1, 8.8.8.8, 9.9.9.9 | all `status: SERVFAIL`; with `+cd` still SERVFAIL; control `polymarket.com` resolves. Subdomains `app.`, `docs.`, `api.`, `www.` return no answer. Full output: `fixtures/coreto/dns-check.txt` | H |
| `.io` TLD server a0.nic.io | returns a DS record for coreto.io (delegation with DNSSEC exists) but SERVFAIL for NS, i.e. the zone is not being served. Cause (lapsed nameserver, expired hosting, broken zone) not determinable from here. | H (observation), M (interpretation) |
| WebSearch result list 2026-10-19 | Still indexes `https://www.coreto.io/` ("Coreto - Learn Earn Repeat, to trust blockchain technology!") and `https://www.coreto.io/tokenomics` ("Coreto token ($COR) - the fuel powering the platform"). An index entry is not evidence of liveness. A summary of the homepage said "Web app is live" and "token date TBA", and that the cached page was about 2,754 days old (roughly 2019). | L |
| GitHub org `coreto-io` (https://github.com/coreto-io, `gh api orgs/coreto-io`) | Created 2018-09-19; org `updated_at` 2022-11-29; 9 public repos (2 of them are unrelated forks: trustwallet-assets, contract-metadata); newest push to any repo **2022-12-14**; 2 followers; location Romania; blog = coreto.io; twitter = Coretoio. No archived flag, no recent activity. | H |
| CMC currency page `https://coinmarketcap.com/currencies/coreto/` (UCID 7398) | Describes COR as "a reputation-based social platform that connects projects, retail investors, and traders, built on a trust and performance system"; CMC shows a "preview page" with blank price fields; no inactive/delisted note. Tags: Prediction Markets, Communications & Social Media, Ethereum Ecosystem. | M |
| CMC prediction-markets category `https://coinmarketcap.com/view/prediction-markets/` | COR sits in the unranked tail with price "$--", no market cap, no volume | M |
| Bitget `https://www.bitget.com/price/coreto/what-is` | Lists COR under category "Prediction Markets" (a category link), no prediction-market product link, BEP20 contract shown truncated `0xa4b6...2557098` | M |
| Alphagrowth `https://alphagrowth.io/coreto` | Describes a reputation management tool; "founded 2022"; no prediction-market mention; live price/revenue/TVL all "-" ; chains listed BNB Chain, Ethereum, Near, Polygon | M |
| DefiLlama `api.llama.fi/protocol/coreto` and full `api.llama.fi/protocols` (8,758 protocols) | Not found / no protocol matching "coreto" (GET, 2026-10-19) | H |
| Token on-chain (Blockscout, `eth.blockscout.com/api/v2/tokens/0x9C2dc0c3CC2BADdE84B0025Cf4df1c5aF288D835`) | ERC-20 "Coreto" COR, 18 decimals, total supply 500,000,000, 1,401 holders, `exchange_rate` null, `volume_24h` null. Recent transfers include 2026-10-09 18:15 UTC (three transfers in one tx), 2026-08-02, 2026-07-30. So the token still moves occasionally; no market price is served. | H |

Verdict: **still_live = false** for any prediction-market product (there is no evidence one ever existed in a tradable form); the token contract is alive on chain but illiquid and priceless on the Blockscout index.

---

## 2. Kind and market model

- **Kind (H/M):** reputation platform + utility token. Official repos describe a "Decentralized Reputation System (DRS)": a Decentralized ID (DID) NEAR contract, a Decentralized Reputation Tracker (DRT) NEAR contract that stores per-action `trust` and `performance` scores, a REST API for the tracker, and PHP SDKs for the "Reputation Collection Service" (https://github.com/coreto-io/coreto-drt-smart-contract, `coreto-did-smart-contract`, `coreto-drt-api`, `coreto-rcs-sdk-php`, READMEs read 2026-10-19, H).
- **Market model:** NOT FOUND. No binary / categorical / scalar market, no order book, AMM or parimutuel pool, no outcome tokens. (searched: coreto-io GitHub org repo list and READMEs, `gh api search/code?q=prediction+org:coreto-io` returned 0 hits, CMC, Bitget, Alphagrowth, WebSearch "Coreto prediction market COR token platform".)
- Whether Coreto ever offered anything resembling a prediction/rating market is NOT FOUND in any source I could reach (see section 10).

---

## 3. Chains and collateral

- COR token: Ethereum ERC-20 `0x9C2dc0c3CC2BADdE84B0025Cf4df1c5aF288D835` (CMC + Blockscout, H); also a BEP20 on BNB Chain (Bitget, truncated address, M); Alphagrowth also lists Near and Polygon (M). The DRS contracts are on NEAR (repo READMEs, H).
- Collateral for markets: NOT APPLICABLE (no markets).

---

## 4. Read API

- **Exists: none** for markets, prices, books, trades or resolution. The only HTTP API in the org is `coreto-drt-api`, a self-hosted REST wrapper for the reputation tracker (README says to clone, `npm install`, configure `.env`, `npm start`; docs at `docs/swagger.md` in the repo). It is software to run yourself, not a hosted public endpoint, and unrelated to prediction markets. (H)
- Base URLs: none. Docs URL: none (domain unresolved). Rate limits / websocket: NOT FOUND.
- No fixtures of market responses are possible. Saved instead (token/DNS evidence only): `fixtures/coreto/blockscout-cor-token.json`, `blockscout-cor-transfers-trimmed.json`, `dns-check.txt`.

---

## 5. Trade path

- **None.** No order placement, no signing scheme, no market contract. An EVM wallet reachable through PayBox could only do plain ERC-20 transfers/swaps of COR, which is not trading a prediction market.
- PayBox reachable: **no** (nothing to reach).

---

## 6. Fees, resolution, geo/ToS

- Fees: NOT FOUND / not applicable (no markets).
- Resolution mechanism and dispute risk: NOT FOUND / not applicable.
- Geo/ToS/automation: NOT FOUND (site unreachable; no ToS retrievable).

---

## 7. Liquidity

- No venue volume/OI/TVL exists (DefiLlama has no entry, H, 2026-10-19).
- Token: 1,401 holders, no price on Blockscout (2026-10-19, H). CMC shows "$--" for COR (M). Third-party aggregators quote a market cap of about $14.6k (L, from a search-result summary of low-quality price pages, unverified, undated).

---

## 8. Event overlap and shared liquidity

- Overlapping event categories: **none** (no events).
- Shares liquidity with another venue: **no** (nothing to share).

---

## 9. Adapter recommendation

- `adapter_priority = skip`. Reasons: not a prediction market, product domain dead, no API, no liquidity.
- Action for the discovery pipeline: **remove COR from the venue backlog** and treat the CMC "Prediction Markets" tag as noisy; spot-check other unranked "$--" rows in that CMC category for the same kind of false positive.
- Re-check trigger (cheap): `dig coreto.io A` returning an answer, or a new push to github.com/coreto-io. Neither is expected.

---

## 10. Open questions

- Whether Coreto ever shipped a prediction or "rating" product in 2018-2021 (would need the Wayback Machine or the project's Medium/Telegram; I did not use archive services and could not search further because the shared WebSearch budget was exhausted mid-task).
- Why `coreto.io` serves SERVFAIL (lapsed zone vs. temporary outage). If it comes back, re-run this spec.
- Whether the BEP20 contract at `0xa4b6...2557098` (Bitget) is the same token (bridge) - irrelevant for the aggregator.

---

## 11. Fixtures

| File | What it is | Size |
|---|---|---|
| `docs/research/fixtures/coreto/blockscout-cor-token.json` | `GET https://eth.blockscout.com/api/v2/tokens/0x9C2dc0c3CC2BADdE84B0025Cf4df1c5aF288D835` (COR token metadata, third-party index, 2026-10-19) | 458 B |
| `docs/research/fixtures/coreto/blockscout-cor-transfers-trimmed.json` | first 10 of 50 items from `.../tokens/<COR>/transfers`, trimmed to timestamp/type/value | ~1.4 KB |
| `docs/research/fixtures/coreto/dns-check.txt` | `dig` output showing SERVFAIL for coreto.io on 3 resolvers (also with `+cd`) and the DS record at the .io TLD server | ~0.9 KB |

---

## 12. Sources

All fetched 2026-10-19 unless stated.

- https://github.com/coreto-io and `gh api orgs/coreto-io`, `gh api orgs/coreto-io/repos` (H): org metadata, repo list, push dates.
- https://github.com/coreto-io/coreto-drt-api, `coreto-drt-smart-contract`, `coreto-did-smart-contract`, `coreto-rcs-sdk-php` READMEs via `gh api .../readme` (H).
- https://eth.blockscout.com/api/v2/tokens/0x9C2dc0c3CC2BADdE84B0025Cf4df1c5aF288D835 and `/transfers` (H, third-party data).
- DNS: `dig` against 1.1.1.1, 8.8.8.8, 9.9.9.9 and a0.nic.io (H).
- https://coinmarketcap.com/currencies/coreto/ (M, page summarised by a small model; includes tags, contract, supply 500M max, 228.28M circulating).
- https://coinmarketcap.com/view/prediction-markets/ (M).
- https://www.bitget.com/price/coreto/what-is (M).
- https://alphagrowth.io/coreto (M).
- https://api.llama.fi/protocols and /protocol/coreto (H, absence).
- WebSearch "Coreto prediction market COR token platform" (L/M): result titles incl. https://www.coreto.io/ and https://www.coreto.io/tokenomics (could not fetch; domain does not resolve), https://www.coinbase.com/en-pt/price/coreto (HTTP 403 to fetch), BeInCrypto/CoinCodex/DigitalCoinPrice price-prediction pages (not used; low quality).
- Not reachable / not obtained: https://www.coingecko.com/en/coins/coreto (page returned homepage content only); CoinGecko API returned HTTP 429 (not retried); a second WebSearch was refused because the shared search budget was exhausted.

Injection / suspicious content: none observed. Privacy: no personal identifiers were sent in any request (generic User-Agent `insurance-markets-research/0.1` on scripted GETs); fixtures and this note contain none.
