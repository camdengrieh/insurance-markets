# SuiMarket - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probe clock about 01:50 UTC). READ-ONLY: unauthenticated GETs, `gh api` file reads, one DefiLlama API read, one read-only PayBox `discover_tokens` (chain catalog). No accounts, wallets, keys, signing or POST/PUT/DELETE. All scripted requests used the User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, search-result snippet, or my inference from first-hand data; **L** = weak or stale. Anything dated before 2026-04-19 is flagged possibly stale.

Fixtures (small, real responses): `docs/research/fixtures/suimarket/` (listed in section 11).

---

## 0. Bottom line

1. **Almost certainly dead or dormant. adapter_priority = skip.** The official site `suimarket.net` returns Cloudflare **HTTP 522** (origin not responding) on `/` and `/markets` on three probes today (H). The docs host `docs.suimarket.net` no longer resolves at all (H). DefiLlama flags the entry `deadUrl: true` with an empty `url` (H).
2. **No integrable surface exists today.** No API, no SDK, no docs, no official repo, no volume or fee data anywhere (all NOT FOUND, section 10).
3. **Only residual on-chain value is about $421** (425.793 SUI, unchanged for about 90 days) in the venue's `Event` objects (H, DefiLlama). Peak ever recorded was $4,523 on 2024-10-30 (H).
4. **Not reachable through PayBox.** Settlement chain is Sui; PayBox's live chain catalog has 11 chains and no Sui (H, section 5).
5. **No arbitrage value.** Nothing live to quote, and the only description of its categories (sports, finance, entertainment) is an unverified search snippet (M).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://suimarket.net/` | HTTP/2 **522**, `server: cloudflare`, body `error code: 522` (Cloudflare "connection timed out" to origin). Repeated 3 times between 01:49 and 01:52 UTC, plus again after a 5 s wait. | H |
| `GET https://suimarket.net/markets` | HTTP/2 **522**, same. WebFetch also got HTTP 522. | H |
| DNS `suimarket.net` | Resolves to Cloudflare anycast (104.21.71.54, 172.67.143.180); NS `blair.ns.cloudflare.com`, `rodrigo.ns.cloudflare.com`. So the domain is still registered and proxied, but the origin server is gone or down. | H |
| `docs.suimarket.net`, `www.suimarket.net`, `api.suimarket.net` | No DNS record ("Could not resolve host"; WebFetch ENOTFOUND). A search-engine result earlier today still listed `docs.suimarket.net` ("Welcome"), so docs existed once and have since been removed. | H (NXDOMAIN), M (docs once existed) |
| DefiLlama `GET https://api.llama.fi/protocol/suimarket` | id 5285, category "Prediction Market", chain Sui, `listedAt` 1730019464 (2024-10-27), `url: ""`, **`deadUrl: true`**, twitter `SuiMarketNet`, no github, no audits, `deadFrom` null. | H |
| DefiLlama TVL history | Non-zero only 2024-10-27..30 (2,081..2,196 SUI, $3,733..$4,523); **zero 2025-04-11..2025-12-18**; no points 2025-12-19..2026-07-20; then constant **425.793 SUI** from 2026-07-21 to 2026-10-18 (USD $279..$532 as SUI price moved; **$421.21 on 2026-10-18**). Constant token amount for about 90 days means no deposits or withdrawals (M, inference). | H data, M inference |
| DefiLlama adapter source | `projects/suimarket/index.js` contains a commented-out `// deadFrom: '2025-04-01'` and `timetravel: false`. Adapter commit history: added 2024-10-27, "fix broken adapters" 2025-04-11, bulk "migrate sui json-rpc to graphql" 2026-07-21 (a mass migration, not venue activity). | H |
| DefiLlama volume/fees/OI | `summary/dexs`, `summary/fees`, `summary/open-interest` for `suimarket` all return HTTP 400 "not found". No activity metrics are tracked. | H |
| Repo's own DefiLlama prediction-registry snapshot | SuiMarket row: tvl_usd 411.00 (2026-10-18), `dead_flags: {deadUrl: true}`, no dimension adapters. Agrees with the above. | H (local fixture) |
| X account `@SuiMarketNet` | `https://x.com/SuiMarketNet` returned **HTTP 402 Payment Required** to WebFetch; no payment requirements were visible; I stopped and paid nothing. Content not read first-hand. | H (402), account contents NOT FOUND |
| Search snippet (WebSearch, extended) | Says X account announced "officially live on the Sui mainnet" in a post "about 752 days old" (about late 2024) and a later undated partnership with the "SuiAIFun community". Snippet text, not read on X. | M (possibly stale: 2024) |
| Independent coverage | None found. A second WebSearch was refused (session search budget exhausted), so coverage search is limited to one extended query. | M |

Verdict: **still_live = false** for practical purposes (site origin down, docs gone, flagged dead by the indexer). Residual SUI sits in on-chain objects that were not shown to be reachable or tradable.

---

## 2. What it is (kind, market model, tokenisation)

- Kind: on-chain prediction market on **Sui** (`kind=onchain-other`).
- Self-description (search-result summary of the now-removed docs; M): "first market prediction platform built on the Sui Network"; users "can trade on events including sports, finance, or entertainment". DefiLlama description (H): "The first prediction market on Sui network".
- Market model: **NOT FOUND** (searched: official site (522), docs (NXDOMAIN), GitHub repo search `suimarket in:name,description`, DefiLlama metadata, adapter source). Cannot say binary vs categorical, order book vs AMM vs parimutuel, or how outcomes are tokenised.
- Only structural fact (H, adapter source `fixtures/suimarket/defillama_adapter_suimarket_index.js`): the package `0xb61e324fa43746f5c24b2db3362afb382b644b32bce39a53f1f796a0109828e0`, module `suimarket`, defines a generic object type `Event<T>` with a field **`total_base_coin`** denominated in coin type `T`. So each market ("Event") appears to be its own on-chain object holding a pool of a base coin, generic over collateral coin type (M, inference from names only; pool semantics unknown).
- I could not read the package or objects: Sui's public GraphQL host (`graphql.mainnet.sui.io/graphql`) answers GET with only the GraphiQL UI (H); real queries and JSON-RPC are POST, which this research forbids. See open questions.

## 3. Chains and collateral

- Chain: Sui mainnet (H, DefiLlama `chains: ["Sui"]`).
- Collateral: DefiLlama's accounting shows only **SUI** locked (H). The `Event<T>` generic suggests other coin types are possible (M), but none observed.
- Settlement/liquidity token: native SUI, no stablecoin observed. A SUI-denominated book also carries price risk against USD-quoted venues.

## 4. Read API

- exists: **none** (no documented or discoverable API; docs host gone; site down).
- Base URLs: none live. `suimarket.net` -> 522; `docs.suimarket.net`, `api.suimarket.net`, `www.suimarket.net` -> NXDOMAIN (H).
- Docs URL: none (formerly `https://docs.suimarket.net`, now NXDOMAIN; H).
- Official GitHub: NOT FOUND (searched: `gh api search/repositories?q=suimarket+in:name,description`; DefiLlama entry has `github: null`). Search hits `vitalspace/suiMarket` (Svelte/Vite template README) and `epiglottis-cartilage/SUImarket` (no README) are unrelated or unconfirmed; ignore. Other Sui prediction repos that surfaced (`nikoumba/delphi`, `Sui-Romanian-Hackathon/pythia`, `alilloig/mako`) are hackathon/prototype projects, not this venue.
- On-chain-only read path (theoretical, not exercised): enumerate objects of type `0xb61e...28e0::suimarket::Event<*>` and read `total_base_coin`, exactly as the DefiLlama adapter does (H). That yields pool size per event only; no prices, books, trades or resolution fields are documented.
- Auth/limits/websocket: not applicable (nothing to call).
- Endpoints for markets, prices/books, trades, resolution: NOT FOUND.

## 5. Trade path and PayBox reachability

- Programmatic trading: **none documented**. If it worked it would be Sui Move transactions signed with a Sui (Ed25519/secp256k1/secp256r1) key via Sui's programmable transaction blocks; no signed-order/off-chain-relayer scheme is documented (NOT FOUND).
- PayBox: live `discover_tokens mode=chains` (2026-10-19) lists **11 chains: Solana, Ethereum, Base, Arbitrum, OP Mainnet, Polygon, BNB Smart Chain, Avalanche, Robinhood, Arc, Hyperliquid**; a query for `sui` returns `total_count: 0` (H; the tool notes the catalog is "metadata, not a support allowlist", but there is no Sui entry at all). An EVM or Solana wallet cannot sign a Sui transaction or hold SUI collateral through PayBox. Bridging is not a workaround given a dead venue.
- **paybox_reachable = no.**

## 6. Fees

NOT FOUND (searched: docs host gone, site 522, DefiLlama fees dimension 400, no repo). No fee formula or payer known.

## 7. Resolution mechanism and dispute risk

NOT FOUND (searched: same sources). Oracle, resolver, challenge window and who can resolve are all unknown. Dispute risk: unquantifiable; with the operator's site and docs gone, a market that needs an operator-side resolution step may never resolve (M, inference). Funds sitting in `Event` objects may be stranded.

## 8. Geo / ToS / automation

NOT FOUND (terms pages unreachable: site 522). No statement on geofencing, KYC or bot/API use could be read.

## 9. Liquidity, categories, shared liquidity

- Liquidity: **$421.21 TVL** (425.793 SUI) on 2026-10-18 (H, `api.llama.fi/protocol/suimarket`, current value 421.21106961718436). All-time recorded peak $4,523 (2,195.9 SUI) on 2024-10-30 (H; possibly stale, 2024). Volume, OI, fees: no data anywhere (H: DefiLlama dimension endpoints 400).
- Categories: claimed sports, finance, entertainment (M, snippet). No market list obtainable, so overlap with other venues cannot be evaluated. At $421 total, any overlap would be unusable as an arbitrage leg anyway.
- Shared liquidity: no evidence of shared liquidity with another venue (H that DefiLlama lists it standalone, no parent; actual contract-level independence not verified). Independent but effectively zero.

## 10. NOT FOUND list (what was searched)

- Market model / tokenisation: official site, docs host, GitHub search, adapter source.
- API (REST, GraphQL, websocket, SDK): site, docs host, GitHub search, DefiLlama metadata.
- Fee schedule, resolution/oracle design, ToS/geo rules: site and docs unreachable.
- Official repo/contracts beyond the package id above: `gh` repo search, DefiLlama `github: null`.
- Live market list, volume, open interest, trades: DefiLlama dexs/fees/open-interest endpoints return 400.
- Independent news/audit/exploit coverage: one extended WebSearch; the second was refused by the session search budget.
- X account contents: HTTP 402 (not paid).
- Archive copies of the docs: deliberately not fetched (session instruction not to work around the search limit via archive/proxy services).

## 11. Fixtures and sources

Fixtures in `docs/research/fixtures/suimarket/`:
- `defillama_protocol_suimarket_2026-10-19.json` - `GET https://api.llama.fi/protocol/suimarket`, metadata verbatim, per-day series run-length-encoded (about 9 KB).
- `defillama_adapter_suimarket_index.js` - `gh api -H "Accept: application/vnd.github.raw" repos/DefiLlama/DefiLlama-Adapters/contents/projects/suimarket/index.js` (513 bytes; untrusted third-party text, not executed).
- `site_probe_2026-10-19.txt` - raw 522 headers/body and DNS results for the venue hosts, plus the WebFetch outcomes (403 DefiLlama page, ENOTFOUND docs, 402 X).

Sources:
1. https://api.llama.fi/protocol/suimarket - H (TVL, deadUrl, listing date, token series)
2. https://api.llama.fi/protocols - H (current tvl 421.21, `deadFrom` null)
3. https://api.llama.fi/summary/dexs/suimarket, /summary/fees/suimarket, /summary/open-interest/suimarket - H (all 400 not found)
4. https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/suimarket/index.js and its commit history via `gh api` - H (package id, `Event` type, `total_base_coin`, commented `deadFrom: '2025-04-01'`)
5. https://suimarket.net/ and https://suimarket.net/markets - H (HTTP 522)
6. https://docs.suimarket.net - H (NXDOMAIN now); earlier search listing of it - M
7. https://defillama.com/protocol/suimarket - WebFetch HTTP 403 (page unread; snippet via WebSearch: $352 TVL, rank #53 of prediction-market protocols at some earlier snapshot) - M
8. https://x.com/SuiMarketNet - HTTP 402 (unread; launch/partnership claims via search snippet only) - M
9. https://graphql.mainnet.sui.io/graphql (GET returns GraphiQL UI only) - H
10. PayBox `discover_tokens mode=chains` (read-only), 2026-10-19 - H
11. Repo cross-reference: `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` (SuiMarket row) and `docs/research/venues/suibets.md` (sibling Sui venue, same PayBox no-Sui finding) - H (local)

## 12. Open questions (only if someone wants to close the "dormant vs dead" gap)

1. Read the package and the `Event<T>` objects through Sui GraphQL/JSON-RPC (POST read queries, barred in this research): last transaction timestamp for the package, count of `Event` objects, their status fields. This would settle whether anything is still tradable or claimable.
2. Is `@SuiMarketNet` still posting (X returned 402 to the fetch tool)? Last post date would date the shutdown.
3. Was the `suimarket.net` origin intentionally taken down or is it a transient 522? (Three probes over a few minutes all failed; DNS for the docs host is gone, which points to intentional removal, M.)

## 13. Adapter spec (for completeness)

None to build. If SuiMarket is revived: chain Sui; discovery by enumerating `0xb61e...28e0::suimarket::Event<*>` objects; no off-chain API known; execution needs a Sui signer that PayBox does not provide, so it would be signal-only (P2) at best. Revisit triggers: `suimarket.net` returns 200 with a market list, a docs host reappears, or TVL grows above a few thousand USD with changing token amounts.

Privacy note: no personal identifiers appear in any outbound request, query or fixture; the third-party commit-author address in the adapter history was deliberately not recorded.
