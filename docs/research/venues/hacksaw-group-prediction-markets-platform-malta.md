# Hacksaw Group B2B Prediction Markets platform (Malta) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official press-release page (raw HTML via curl and a page summary), Hacksaw corporate and investor pages, one unauthenticated HEAD/GET per candidate docs host, robots.txt. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The generic User-Agent `insurance-markets-research/0.1` was used for scripted requests. Third-party pages were treated as untrusted data; nothing in them was followed. No instructions aimed at AI agents were found on any page read.

Limits: the shared WebSearch budget was exhausted before my first search ran, so there was no independent press sweep. Everything below comes from direct fetches. Anything I could not confirm is marked NOT FOUND with what I tried.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, page-summariser output, or my inference from first-hand data; **L** = weak or stale.

Fixtures: **none saved**. There is no public read API to sample (section 4).

---

## 0. Bottom line

1. **This is a software product announcement, not a market you can see or trade.** On 2026-10-15 07:00 CET Hacksaw AB (publ) (Nasdaq Stockholm: HACK) announced a "B2B Prediction Markets platform" that lets licensed operators run peer-to-peer prediction markets under their own brands. (H, press release.) It has no name, no public site, no market list, no price feed and no public API.
2. **Live only in the sense that it was announced and licensed.** The release says "announces the launch", and the MGA has extended Hacksaw's B2B Critical Gaming Supply Licence to cover Type 3 Gaming Services. No launch operator is named, no event-contract supplier is named, and I found no operator-facing prediction product live anywhere (section 1). (H for the announcement, NOT FOUND for any live consumer market.)
3. **Not an independent liquidity leg, and not even one venue.** Its stated design is a "connected volume framework" that pools peer-to-peer participation across Hacksaw's operator network. For an aggregator that is one pooled book hidden behind many operator front ends, with no public endpoint. (H, press release.)
4. **Docs exist but are behind HTTP Basic auth.** `docs.hacksawgaming.com` answers 401 with `www-authenticate: Basic realm="docs.hacksawgaming.com"` (H). I did not try to authenticate. These are almost certainly operator-integration docs (M, inference from the host name and the OpenRGS model).
5. **adapter_priority = skip.** Re-check only if (a) an operator publicly launches a Hacksaw-powered prediction site, and (b) it exposes a public market/price feed. Until then there is nothing to adapt.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Press release, "Hacksaw Group Launches B2B Prediction Markets Platform, Expanding Technology and Distribution Ecosystem", 2026-10-15 07:00 (non-regulatory release) (https://www.hacksawgroup.com/en/hacksaw-group-launches-b2b-prediction-markets-platform-expanding-technology-and-distribution-ecosystem/, fetched 2026-10-19) | Announces launch of the platform and the MGA licence extension. Also published on MFN (storage.mfn.se PDF link in the page). | H |
| Hacksaw group IR front page lists the release as the second-newest item (Oct 16: Bally's Intralot UK deal; Oct 12: preliminary Q3 update) | Release is current. | H |
| Q3 2026 preliminary update, 2026-10-12 (https://www.hacksawgroup.com/en/hacksaw-ab-provides-preliminary-financial-and-operational-update-for-the-third-quarter-2026/) | Does not mention prediction markets; only says Hacksaw "is also exploring new verticals, including a recently launched crash game". So the product was not in the numbers or the narrative before 2026-10-15. | H (via summariser) |
| Hacksaw Gaming consumer/partner site (https://www.hacksawgaming.com) and its news page | No prediction-markets nav item or news item. `/prediction-markets` and `/prediction` return 404. News lists only slot/partner items (latest 2026-10-16). | H |
| Platform name / public site | NOT FOUND (searched: press release HTML, hacksawgaming.com nav and news, hacksawgroup.com IR page, nextpredict article). The nextpredict article also says the platform is unnamed. | H for "not in these pages" |
| Any operator live on it | NOT FOUND. The press release names no customer and nextpredict says "No launch customers named". An iGamingBusiness site search for "hacksaw prediction" returned no results (fetched 2026-10-19). | H/M |
| ESMA statement of 2026-07-03 on EU binary-option measures (from the discovery hint) | NOT FOUND. Neither the nextpredict article nor the first page of ESMA news/search shows it (searched: nextpredict article, esma.europa.eu news and search pages). Treat the hint as unverified. | L |

Verdict: **still_live = true** only as an announced and licensed B2B product (launched 2026-10-15, four days old). There is no consumer-visible market that I could find.

---

## 2. Kind and market model

- **Kind (H):** B2B white-label technology / "volume framework" for peer-to-peer prediction markets. Hacksaw supplies "technology, infrastructure and volume frameworks"; operators "maintain ownership of their brands, customer relationships and user experiences". Quote: "Unlike consumer-focused prediction market platforms that acquire and engage with users directly".
- **Regulatory frame (H):** The MGA extension covers "Type 3 Gaming Services", described in the release as authorising "B2B peer-to-peer prediction market services under the MGA regulatory framework". Type 3 in the Maltese framework is games played against other players with the operator taking a commission, not against the house (M, my background knowledge of the Malta gaming classes, not re-verified this session). That implies a parimutuel or matched P2P design with no house book.
- **Market model:** NOT FOUND. The release does not say whether it is an order book, parimutuel pool or matched P2P, nor whether contracts are binary, categorical or scalar. It says only that participation is "aggregated across Hacksaw's network of operators". Outcome tokenisation: none described; given the iGaming operator model it is most likely off-chain accounting (L, inference only).
- **Event-contract supplier:** NOT FOUND. nextpredict: "It also remains unclear who would supply the actual event contracts" (H that the article says so). The release does not say whether Hacksaw creates markets, operators do, or a third party feeds them.

---

## 3. Chains and collateral

NOT FOUND (searched: press release, Hacksaw sites). No indication of any blockchain, wallet or token. Hacksaw's business is licensed fiat iGaming (MGA, UKGC, Swedish Gambling Authority per the release footer, H), so the default assumption is operator-held fiat balances, not on-chain collateral (L, inference).

---

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Public API | **None found.** No developer portal or OpenAPI on hacksawgaming.com or hacksawgroup.com. | H (absence in pages read) |
| Docs host | `https://docs.hacksawgaming.com` -> HTTP 401, `www-authenticate: Basic realm="docs.hacksawgaming.com"`, behind Cloudflare (fetched 2026-10-19). Not accessed further. | H |
| `https://api.hacksawgaming.com` | HTTP 404 (root). | H |
| `developer.hacksawgaming.com`, `predictions.hacksawgaming.com` | no connection (DNS/refused). | H |
| GitHub | `gh api search/repositories` for "hacksaw gaming prediction" returned no result rows; org `hacksawgaming` does not exist (404). | H |
| `robots.txt` | `User-agent: *` plus a sitemap line, no disallow. `llms.txt` 404. | H |
| Rate limits, websocket | NOT FOUND. | - |

For an aggregator there is nothing to poll. Any data would have to come from a specific operator's front end, which is out of scope until one exists.

---

## 5. Trade path

None for an outside agent. Trading is intended to happen inside licensed operators' consumer products (H, press release). Those require operator accounts, KYC and jurisdictional licensing. There is no signed-order API, no on-chain contract and no transaction-proposal route that an EVM wallet could use.

**PayBox reachability: no.** No chain, no token, no contract and no public API. An EVM wallet reachable through PayBox (Base, Ethereum, BNB, Arbitrum, Polygon, Solana) has nothing to sign or send. I did not call any PayBox tool.

---

## 6. Fees

NOT FOUND. nextpredict: "Commercial pricing not disclosed" (M, summariser). The release gives no B2B revenue-share or user-fee figures. A Type 3 operator model normally takes a commission on P2P pools (M/L, general knowledge), but the size and who pays is unknown here.

---

## 7. Resolution mechanism and dispute risk

NOT FOUND. No oracle, resolution source, challenge window or dispute process is described. Risk is therefore unquantifiable; with an unknown contract supplier and per-operator branding, resolution would likely be set by each operator or the contract supplier under MGA rules (L, inference). If this ever becomes integrable, resolution rules per operator are the first thing to read.

---

## 8. Geo / ToS / automation

- Licensed in Malta under the MGA; Hacksaw's wider licences listed in the release footer: MGA (licence MGA/CRP/501/2018, held by subsidiary HGMT Ltd), UK Gambling Commission (54059), Swedish Gambling Authority (23Si638) "and more" (H). Which licences or jurisdictions the prediction product may be offered in is NOT FOUND; the release only mentions "multiple jurisdictions" for its operator relationships.
- No consumer ToS exists for the prediction product because there is no consumer product yet. Operator-run products will carry operator ToS; automated trading is normally barred in regulated iGaming (L, general expectation, not verified for this product).
- Contact routes (media and investor relations) are listed in the release; I did not use them.

---

## 9. Liquidity

- Volume / OI / TVL: **NOT FOUND**, and none can exist publicly as of 2026-10-19 (product announced four days earlier, no named customers).
- The claim of "broader capacity from launch" is a design intent, not a measured number (H for the quote, no data behind it).
- Bernstein's "$1 trillion by 2030" annual-volume estimate in the release is third-party market sizing, not Hacksaw volume.

---

## 10. Event categories and overlap

NOT FOUND. The release says only "a wide range of categories". With no supplier named, I cannot say whether it would carry sports, politics, crypto price or macro markets. Overlap with other venues is unknown; nothing to scan.

---

## 11. Shared liquidity

- **Pooled inside Hacksaw's network (H):** the platform is "designed around a connected volume framework intended to aggregate peer-to-peer participation across Hacksaw's network of operators". Treat all Hacksaw-powered operator sites as ONE liquidity source, never as separate arbitrage legs against each other.
- **Link to other venues:** NOT FOUND. No sign it routes to Polymarket, Kalshi or any exchange. nextpredict lists Plaee (via Crypto.com), Shift Markets and Matchbook B2B (supporting ADI PredictStreet) as competing B2B offers; I found nothing tying Hacksaw to any of them. Related sibling notes: `docs/research/venues/shift-markets.md`, `docs/research/venues/adi-predictstreet.md`.

---

## 12. Adapter recommendation

- **adapter_priority: skip.** No public data, no trade path, no liquidity yet, no named operator, and a P2P pool that is closed to outsiders by design. Nothing is worth coding.
- **Revisit triggers:** (1) a named operator goes live with a Hacksaw-powered product and publishes a public market/price endpoint or page that can be scraped legally; (2) docs.hacksawgaming.com contents become public; (3) the next Hacksaw interim report (Q3, date on https://www.hacksawgroup.com/en/investor-relations/financial-calendar/ , not read) or a customer press release gives volumes.
- **Open questions:** Who are launch operators? Who supplies the event contracts (Matchbook B2B? an exchange? Hacksaw itself)? Is it on-chain at all? Do operators expose any market API? Is the 2026-07-03 ESMA statement real and does it restrict this product in the EU (hint unverified)?

---

## Sources

1. Hacksaw Group press release, 2026-10-15 (raw HTML fetched with curl, plus page summary): https://www.hacksawgroup.com/en/hacksaw-group-launches-b2b-prediction-markets-platform-expanding-technology-and-distribution-ecosystem/ (H)
2. Hacksaw investor relations front page: https://www.hacksawgroup.com/en/ (H)
3. Hacksaw Q3 2026 preliminary update, 2026-10-12: https://www.hacksawgroup.com/en/hacksaw-ab-provides-preliminary-financial-and-operational-update-for-the-third-quarter-2026/ (H, via summariser)
4. Hacksaw Gaming site and news: https://www.hacksawgaming.com , https://www.hacksawgaming.com/news , https://www.hacksawgaming.com/robots.txt (H)
5. Docs host HEAD request, 401 Basic auth: https://docs.hacksawgaming.com (H)
6. NextPredict, "Hacksaw prediction markets B2B platform, Malta licence": https://nextpredict.io/market-news/industry/hacksaw-prediction-markets-b2b-platform-malta-license/ (M, secondary; says platform unnamed, no customers, supplier unclear, pricing undisclosed, and does not mention ESMA)
7. ESMA news and search pages, checked for the 2026-07-03 statement and not found: https://www.esma.europa.eu/press-news/esma-news (L for the hint)
8. iGamingBusiness site search for "hacksaw prediction" (no results): https://igamingbusiness.com/?s=hacksaw+prediction (H for "no results")
9. MGA licence directory (404 at the URL tried, so Type 3 not independently confirmed on the regulator's register): https://www.mga.org.mt/licensee-hub/license-directory/ (H for 404)
