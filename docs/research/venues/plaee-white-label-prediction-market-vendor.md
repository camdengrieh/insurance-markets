# Plaee (white-label prediction market vendor) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: public pages of plaee.com fetched once each with `curl` (generic User-Agent `insurance-markets-research/0.1`) and through the WebFetch summariser, press releases and news pages, `gh api` search and file reads of GitHub metadata/READMEs only, one public `api.llama.fi/protocols` GET, two read-only PayBox `discover_*` queries. No account, demo request, form, wallet, key, signature, POST/PUT/DELETE or payment. No third-party code cloned or run. Third-party text was treated as untrusted data; nothing in it was followed. The shared WebSearch budget ran out after three searches, so search-engine corroboration is thin.

Tags: **H** = read first-hand this session in a primary source (cited; raw HTML via curl unless marked `(wf)`); **M** = secondary source or my inference; **L** = weak, stale, or contradicted. `(wf)` = read through the WebFetch summariser, not as raw text.

Fixtures (< 3 KB each): `docs/research/fixtures/plaee-white-label-prediction-market-vendor/` (`sitemap.xml`, `robots.txt`, `site_claims_2026-10-19.json`). There is no API response to save because no public API exists.

---

## 0. Verdict

**adapter_priority: skip.** Plaee is not a venue. It is a B2B vendor (front end, player-account system, and exchange connectivity) that resells access to exchanges it does not run.

1. **Live, but as a vendor (H).** plaee.com serves 2026 content; latest dated post is 2026-10-15 (Paybis payments integration); ProphetX partnership PR is dated 2026-09-30 (wf).
2. **US side has no independent liquidity (H/M).** The US route is "via Crypto.com" = CDNA / OG.com (the CFTC DCM already specced in `og-crypto-com-nadex.md`), with ProphetX added in beta. Orders land in those exchanges' books. Counting a Plaee-powered brand (BitMart US, etc.) as a leg would double-count the OG.com/CDNA leg.
3. **The only Plaee-owned liquidity is the "DPM exchange" (H that it is claimed; nothing else verified).** The site says it is on-chain, on Polygon and Solana. I found no contract address, docs, API, subgraph, TVL listing, volume figure, public app or repo. It cannot be adapted from what is public.
4. **No public API (H absence).** "One API into thousands of event markets" is marketing copy for a private B2B integration under a signed Commercial Agreement. No docs, SDK, `llms.txt`, status page or developer link anywhere.
5. **Not reachable from a PayBox wallet (H/M).** US route: KYC'd DCM membership through an operator, USD. DPM route: contracts not published.

**Revisit only if** Plaee publishes DPM contract addresses/IDLs or a public market-data feed. Then: build a read adapter for the DPM only, flagged as a DPM-style (pool-based) market, and still dedupe the US side against OG.com and ProphetX.

Confidence: high that no public API/docs exist and that the US side is a distribution layer; medium on the DPM being unlaunched or tiny (absence of evidence only).

---

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site | https://plaee.com (www redirects 308 to apex), Framer-built, "(c) 2026 PLAEE ALONG LTD", tagline "Powering the Prediction Economy." | H |
| Latest post | "Plaee Integrates Paybis ..." dated Tel Aviv, 2026-10-15 (https://plaee.com/resources/blog/plaee-integrates-paybis-to-power-deposits-and-withdrawals-for-prediction-market-operators) | H |
| ProphetX partnership | PR Newswire dateline 2026-09-30 "integration is currently in Beta" (https://www.prnewswire.com/news-releases/prophetx-partners-with-plaee-to-increase-scale-and-speed-of-operator-onboarding-to-its-regulated-prediction-market-302893700.html). The Plaee blog copy shows conflicting dates (dateline 2026-09-30, metadata 2026-10-18, a "Mar. 28, 2026" label on a related-article tag) | wf, date conflict flagged |
| Optimove distribution deal | 2026-09-24 (https://www.manilatimes.net/2026/09/24/tmt-newswire/globenewswire/optimove-partners-with-plaee-to-bring-prediction-markets-to-its-global-operator-network/2432244) | wf |
| Axcera (prop-firm SimTrader) | Plaee post 2026-10-18 metadata | wf |
| Crypto.com / CDNA partnership | 2026-01-20 (https://crypto.com/en/company-news/plaee-partners-with-cryptocom-to-launch-cftc-compliant-prediction-market-technology-infrastructure-in-the-us; same text on https://plaee.com/resources/blog/cftc-regulated-partnership) | wf, H for the Plaee-hosted copy |
| First customer launch | BitMart US launched Plaee-powered event contracts 2026-06-12 (Covers, 2026-06-16): 405 markets, 48 states (https://www.covers.com/industry/crypto-exchange-bitmart-us-launches-prediction-markets-june-16-2026) | wf |
| Simulated tournament | Tradeify, 2026-06-28 to 2026-07-19, 30,000+ participants, virtual $2,000 balance, "powered by Plaee's SimTrader" (https://www.financemagnates.com/fintech/prediction-market-tournaments-reach-prop-trading-as-tradeify-attracts-30000-participants/, dated 2026-07-21) | wf |

Entity: the site footer says PLAEE ALONG LTD. The site Terms (section 1.1) say "Plaee Along Ltd., a company incorporated in Israel under company number 517151981", registered office in Bnei Brak, Israel (H, https://plaee.com/terms-conditions). A paid MarketersMedia release (2026-05-15) calls it "based in Limassol, Cyprus" (wf, https://aijourn.com/plaee-launches-turnkey-platform-for-prediction-markets-operators/): conflict, probably an operating office vs the registered entity (M). CEO and founder: Leon Okun (wf, several releases).

`sitemap.xml` also lists template residue (`/customers/focalpoint`, `/resources/changelog/sola-v2-8-0-...`, `/integrations/pagerduty`): leftover Framer template pages for an unrelated uptime-monitoring product. Ignore them (M).

---

## 2. What it is and the market model

- **Kind**: `broker-or-frontend` / B2B white-label vendor. Components named on its pages and releases:
  - **Prediction Trader**: white-label trading UI, deployable as widgets or a full branded site, "via API & iFrame Integrations" (H, https://plaee.com/solutions/trading; https://plaee.com/resources/blog/the-infrastructure-powering-prediction-markets).
  - **PlaeeOS**: player account / CRM / segmentation / promotions engine (H, same blog).
  - **SimTrader**: simulated YES/NO markets for prop firms, API and iFrame options, "real-time pricing designed to mirror live markets", feed source not named (wf, https://plaee.com/resources/blog/axcera-and-plaee-partner-on-simulated-prediction-markets).
  - **Exchange connectivity**: US via Crypto.com (CDNA), also ProphetX (beta); "global" via the DPM exchange.
- **Launch modes (H, https://plaee.com/)**: "Integration" (inside an operator's product, shared wallet) or "Standalone" (new brand, own ring-fenced wallet and funding).
- **Market model**:
  - US-routed markets: whatever the exchange lists. CDNA and ProphetX are central limit order books with binary YES/NO contracts (CDNA) or buy-only per-selection instruments (ProphetX); see `og-crypto-com-nadex.md` and `prophetx.md`. Plaee adds no market model of its own here (M).
  - DPM exchange: Plaee calls it "an on-chain, decentralized prediction market powered by smart contracts on Polygon & Solana" (H, https://plaee.com/platform). **Plaee never defines "DPM" on any page I read** (NOT FOUND; searched home, platform, prediction-economy, trading, five blog posts). Third-party summarisers and I both read it as "dynamic parimutuel market" (Pennock 2004 / Paradigm 2024 design); that expansion is inference (L). If it is a dynamic parimutuel, outcomes are shares in a pool priced by an automated rule, there is no order book, and the payout per share is not a fixed $1, so cross-venue arbitrage maths differs from binary CLOB venues. Outcome tokenisation (SPL tokens / ERC-1155 / internal ledger): NOT FOUND.
- Plaee's own explainer calls markets "peer-to-peer ... No house" and "YES/NO event contract" (H, https://plaee.com/prediction-economy). That is generic; the page gives no explanation under "Resolution & Oracles".
- A competitor blog (TRUEPREDiCT, which lists Plaee as a rival) calls DPM Plaee's "liquidity layer" and marks Plaee's blockchain/Web3 support "No" (wf, https://www.truepredictsoftware.com/blog/prediction-market-platform-providers/). That contradicts Plaee's own Polygon and Solana claim; treat as L and as evidence only that the DPM is not a prominent product.
- One search-engine summary of the Plaee homepage said the DeFi platform lets users "deposit fiat or crypto into self-custodial wallets" with "settlement ... by Oracle Decisions". I could **not** find those words in the current homepage, platform, prediction-economy, trading or blog HTML (grep for "self-custod" and "oracle" returned 0 outside the generic heading above). L: possibly an older page version or a paraphrase.

---

## 3. Chains and collateral

- **DPM**: Polygon and Solana (H, claim only, https://plaee.com/platform). Collateral token: NOT FOUND (searched: all plaee.com pages for USDC/USDT; none). Contract addresses, program IDs, ABIs/IDLs: NOT FOUND (searched: plaee.com, GitHub search "plaee", DefiLlama `api.llama.fi/protocols` for "plaee" in name/slug/url/description across 8,758 entries: no hit on 2026-10-19).
- **US route**: USD at a US-regulated DCM/FCM; operator-side funding via payment providers. Paybis (crypto-fiat on-ramp) was integrated 2026-10-15 for operator deposits and withdrawals (H). No on-chain collateral for US customers is documented.

---

## 4. Read API

- **exists: none (public).** Marketing says "One API into thousands of event markets" (H), but:
  - no docs, reference, SDK, OpenAPI, `llms.txt` (404), status page or developer link on any page; `/api`, `/docs`, `/developers` return 404; `sitemap.xml` has none (H, fixtures `sitemap.xml`, `site_claims_2026-10-19.json`)
  - the Terms say the site "is not a platform through which any product or service is delivered" and that product specs, integration details and service levels are "exclusively those set out in the applicable Commercial Agreement" (H, sections 1.3 and 4.3)
  - the CDNA release names "API-first" but no endpoint (wf)
- Base URLs: none. Docs URL: none (https://plaee.com/demo is a contact form).
- Rate limits, websocket, auth: NOT FOUND. Any private API would sit behind an operator contract (M).
- GitHub: no official Plaee org or repo found (`gh api search/repositories?q=plaee`, 2026-10-19). Hits were unrelated personal repos; four look like job take-home assignments ("Plaee Frontend Assignment", a Polymarket-Gamma-API UI clone; a sweepstakes wallet service) (L, READMEs only; relationship to Plaee unverified; not Plaee code). Not used as evidence of Plaee's API.
- **Practical read path for the scanner**: read the underlying exchanges directly (OG.com/CDNA keyless FCM API; ProphetX keyed API). Plaee adds no price data of its own.

---

## 5. Trade path and PayBox reachability

- **Programmatic trading**: none available to us. Operators trade via a B2B integration; end users trade inside the operator's brand after onboarding as direct customers/members of the DCM (H: "all customers become members of the DCM", Plaee-hosted release text). Under the CFTC's Sept 17 2026 staff no-action letter 26-25 (as described in a Plaee-hosted article), a "passive software provider" cannot hold customer assets or control routing (M, article text read raw at https://plaee.com/resources/blog/plaee-expands-prediction-markets-access-igaming; I did not read the CFTC letter itself).
- **EVM/Solana wallet via PayBox**: **no** for the US route (USD, KYC, membership). **Unknown** for the DPM (Polygon is EVM and Solana is supported by PayBox, so signing would be technically possible if contracts were published, but none are). PayBox catalogs: `discover_plugins "plaee prediction market"` returned no plugins; `discover_services` returned unrelated Polymarket data proxies (H, absence).
- Plaee's Terms say it has no relationship with end users and tells them to contact the operator (H, section 2.2 and 5.5).

---

## 6. Fees

- Plaee's own fees: NOT FOUND (searched: all pages, five releases; the ProphetX release says "Fees: not disclosed", wf). White-label pitch says operators control "your economics" (H). The CFTC letter allows software providers to take "transaction-based fees or revenue sharing" (M, via Plaee-hosted article).
- Underlying exchange fees (from sibling notes, not re-verified here): OG.com/CDNA US taker about `0.07 x P x (1-P)` per contract, maker lower (`og-crypto-com-nadex.md` section 7); ProphetX 2% on net gains for straight trades (`prophetx.md` section 6). A Plaee-powered operator can add its own markup, so the all-in fee on a Plaee front end is unknowable from public data.
- DPM fees: NOT FOUND.

---

## 7. Resolution and dispute risk

- US-routed contracts resolve under the exchange's rulebook (CDNA / ProphetX), not Plaee's (M). Dispute risk is that of those exchanges; see sibling notes (CDNA has a 48-hour cancel rule and discretion; ProphetX Rulebook v3.0).
- DPM resolution: NOT FOUND. Only a generic "Resolution & Oracles" heading with no text (H) and the unconfirmed "Oracle Decisions" snippet (L). The oracle, dispute window, and who can resolve are unknown, so a DPM leg carries unquantifiable resolution risk.

---

## 8. Geo, ToS, automation

- The site is "directed exclusively at businesses" (Terms 2.2, H). Plaee has no consumer ToS to read, because consumers contract with the operator.
- Terms 8.1(d) forbids "any robot, spider, scraper, crawler or other automated means to access, copy, extract or monitor the Site ... other than indexing by general-purpose search engines in accordance with our robots.txt file" (H). `robots.txt` is `Allow: /` (H, fixture). My once-per-page `curl` of about 15 pages is arguably within that clause's reach; I will not recommend any scheduled fetching of plaee.com, and the adapter should not scrape the site.
- US availability is whatever the operator/exchange offers: BitMart US launched in 48 states with plans to add all except New York and Arizona (wf, Covers). The Terms bar sanctioned countries from the site (18.6).
- DPM geo/KYC: NOT FOUND. Plaee positions it for "Operators outside of the US" (H), so US persons are presumably excluded (M).

---

## 9. Liquidity

- Plaee-owned: no volume, OI or TVL figure published anywhere I could read. NOT FOUND (searched: plaee.com, releases, DefiLlama protocol list 2026-10-19: no Plaee entry).
- Claims only: "thousands of event markets", "institutional-grade liquidity and market-making built in" (H, marketing). The homepage market figures ($64B 2025 volume, $300B+ 2026 projected) are unsourced industry claims, not Plaee volume (H that they are unsourced).
- Proxy sizes of the exchanges behind it (from sibling notes, dated): CDNA/OG.com weekly notional $230,038,044 for the week to 2026-10-12 per The Block (M, `og-crypto-com-nadex.md`); ProphetX board about $7.0M "Activity" across 369 events on 2026-10-19 (M, `prophetx.md`). Plaee's share of those: NOT FOUND.
- Simulated-only volume: Tradeify tournament 30,000+ participants (virtual money, so not liquidity).

---

## 10. Event categories and overlap

- Plaee's materials list sports (BitMart: moneylines, point spreads), politics, economics/macro and "digital asset trading, including short-term crypto price movements" (wf, Covers; CDNA release says sports, politics and macroeconomics). The trading page shows sample questions (Fed cuts, CPI above 3.0%, BTC above $120k, Nvidia earnings, oil above $90); these are marketing copy, not live markets (L).
- Overlap with Kalshi, Polymarket US and the other legs is therefore the overlap of OG.com/CDNA and ProphetX with them (large for NFL/NBA/MLB/NHL/soccer, US politics, Fed, crypto price ladders). It is not a Plaee-specific edge.

---

## 11. Liquidity sharing (independent leg?)

**No, not independent.**

- **CDNA / OG.com**: Plaee describes an "exclusive partnership with Crypto.com" with "direct integration into CDNA's liquidity pools" (wf, release 2026-01-20); "most common option" is the third-party-service-provider route to CDNA contracts (M, Plaee-hosted article). Same matching engine as OG.com, DraftKings Predictions, Fanatics Markets, FanDuel Predicts, Robinhood and the other CDNA distributors (per `og-crypto-com-nadex.md` section 12). BitMart US is a Plaee-powered front end with exchange not named by Covers (wf); Plaee's own article places it in the CDNA-powered model (M).
- **ProphetX**: a distribution partnership; ProphetX "handles clearing, custody, market operations", Plaee supplies connectivity, Prediction Trader and PlaeeOS (wf, PR Newswire). The release does not discuss liquidity terms; operators trade ProphetX's own book (M, inferred). Count as ProphetX's leg.
- **DPM**: appears to be Plaee's own, but is unobservable (see section 0).
- Plaee-hosted pages list no link to Kalshi or Polymarket liquidity. A Plaee article describes Kalshi and Polymarket as competing B2B paths (H).

---

## 12. Adapter recommendation

**skip.** Rationale: no API, duplicate US liquidity (OG.com/CDNA, ProphetX), unverifiable DPM. Build the OG.com/CDNA and ProphetX adapters and tag Plaee, BitMart US and similar as "front end of CDNA/ProphetX" in the platform registry so the scanner never treats them as separate legs. Use Plaee press as a signal source: new operator launches (Optimove's network, prop firms) widen CDNA/ProphetX distribution, not the set of independent venues.

If revisited: ask Plaee through its demo form for (a) DPM contract addresses and docs, (b) whether any market-data feed exists for non-operators. (Not done: filling forms is out of scope.)

---

## 13. Open questions

- Is the DPM live to the public, on which chain first, and what is the collateral token?
- Does "DPM" mean dynamic parimutuel, and how are payouts computed?
- Who resolves DPM markets, and with which oracle?
- Does a Plaee-routed ProphetX order enter ProphetX's public book or a Plaee-specific pool?
- Is the Plaee entity Israeli (Terms) or Cypriot (press release) for the DPM operator?

## Not found

Public API or docs; DPM contracts, volume, TVL; DPM fee model; Plaee's own fee schedule; resolution oracle; DPM geo rules; the underlying exchange behind BitMart US stated by BitMart or Covers; any official GitHub org.

## Suspicious content

None. No instructions aimed at AI agents were found in the pages read.

## Sources

1. https://plaee.com/ , /platform , /prediction-economy , /solutions/trading , /terms-conditions , /demo , /robots.txt , /sitemap.xml (curl, 2026-10-19) (H)
2. https://plaee.com/resources/blog/the-infrastructure-powering-prediction-markets , /cftc-regulated-partnership , /plaee-expands-prediction-markets-access-igaming , /plaee-integrates-paybis-to-power-deposits-and-withdrawals-for-prediction-market-operators , /axcera-and-plaee-partner-on-simulated-prediction-markets , /prophetx-partners-plaee-increase-scale (curl for the first four, wf for the last two) (H / wf)
3. https://www.prnewswire.com/news-releases/prophetx-partners-with-plaee-to-increase-scale-and-speed-of-operator-onboarding-to-its-regulated-prediction-market-302893700.html (wf)
4. https://crypto.com/en/company-news/plaee-partners-with-cryptocom-to-launch-cftc-compliant-prediction-market-technology-infrastructure-in-the-us (wf)
5. https://finance.yahoo.com/news/gaming-firm-plaee-taps-crypto-123225597.html (wf, Coinspeaker syndication, 2026-01-20)
6. https://www.manilatimes.net/2026/09/24/tmt-newswire/globenewswire/optimove-partners-with-plaee-to-bring-prediction-markets-to-its-global-operator-network/2432244 (wf, sponsored release)
7. https://aijourn.com/plaee-launches-turnkey-platform-for-prediction-markets-operators/ (wf, paid release 2026-05-15)
8. https://www.covers.com/industry/crypto-exchange-bitmart-us-launches-prediction-markets-june-16-2026 (wf)
9. https://www.financemagnates.com/fintech/prediction-market-tournaments-reach-prop-trading-as-tradeify-attracts-30000-participants/ (wf)
10. https://www.truepredictsoftware.com/blog/prediction-market-platform-providers/ (wf, competitor blog, L)
11. https://www.globenewswire.com/news-release/2026/04/20/3276726/0/en/Plaee-Expands-Its-Focus-as-Prediction-Markets-Gain-Momentum.html (found by search; WebFetch and curl got HTTP 403, NOT READ)
12. https://api.llama.fi/protocols (2026-10-19, no Plaee entry) (H)
13. GitHub search `search/repositories?q=plaee` and READMEs of four unrelated repos (L)
14. Sibling notes: `docs/research/venues/og-crypto-com-nadex.md`, `docs/research/venues/prophetx.md`, `docs/research/venues/crypto-com-predict-pro.md`, `docs/research/venues/hacksaw-group-prediction-markets-platform-malta.md` (mentions Plaee as a competing B2B offer)
15. `crt.sh` certificate-transparency lookup returned HTTP 502 twice; subdomain list NOT obtained.
