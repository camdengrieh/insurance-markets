# FanDuel Predicts - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web reads, Apple's public iTunes Search API (unauthenticated GET), public Flutter investor-relations documents, `gh api` repository search and one raw README read. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation was used. Generic User-Agent `insurance-markets-research/0.1` only. Third-party pages and repos were treated as untrusted data; nothing in them was followed.

Limits of this research (read first):
- **fanduel.com is closed to scripted clients.** `www.fanduel.com/predicts`, `/predicts/legal`, `/predicts/fees`, `/predicts/faq` and `/legal` all returned HTTP 403 (CloudFront; the research egress was a non-US POP, so this is probably geo and bot filtering). I did not retry or work around it. Consequently **the official FanDuel Predicts terms, fee schedule, FAQ and rulebook were NOT read.** (H for the 403, fixture below.)
- **cmegroup.com blocks scripted access** and states that scraping is prohibited by its Data Terms of Use (H, fixture). I made no further requests after that notice (three earlier WebFetch attempts at CME press-release and event-contract URLs had only timed out).
- **The session's WebSearch budget was exhausted**, so no search-engine discovery was possible. Coverage of third-party news is therefore thin; the strongest sources are Apple's App Store record and Flutter's own Q2 2026 results.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/fanduel-predicts/` (section 14).

---

## 0. Bottom line

1. **Live, but it is a retail front end, not a venue.** The app is current (v1.10.1 released 2026-09-22, 6,742 ratings) and Flutter reported on 2026-08-05 that FanDuel Predicts is expanding (H). The operator of the account is **FanDuel Prediction Markets LLC, a registered futures commission merchant (FCM)**; the contracts are exchange-listed futures-style event contracts (H, App Store disclaimer).
2. **Liquidity is not independent.** The app says it is "powered by CME Group & CDNA markets" (H). Flutter's Q2 2026 shareholder letter says that "all FanDuel Predicts sports and novelties contracts will now be moved to Crypto.com, while continuing to provide our customers access to CME's financial markets" (H). Crypto.com here means CDNA (Crypto.com | Derivatives North America), inferred from the App Store's "CDNA markets" and the sibling notes (M). So: **sports and novelties = the CDNA book; financial/crypto/commodity = CME's book.** The NEXTPredict hint "possibly shares liquidity with CME Group" was right but incomplete, and (as of August 2026) the sports half moved to CDNA. An arbitrage scanner should model **CDNA and CME as the legs**, never FanDuel.
3. **No public API, no wallet path.** No FanDuel Predicts API or developer documentation was found (NOT FOUND; the official site is closed to me). Funding is fiat (debit card, online bank transfer) with a KYC'd US account (M/H). A PayBox EVM wallet cannot trade it.
4. **FanDuel is also a market maker elsewhere.** Flutter says its "market-making" is expected to produce about $50m revenue in 2026 (Q2: $6m) and that it is "Targeting significant share of combo liquidity provision" (slides) and positioned "to provide liquidity for combination markets across prediction market platforms" (letter) (H). That makes FanDuel a possible counterparty on the same books an aggregator scans, which matters for adverse selection.
5. **adapter_priority = skip.** Duplicate liquidity, no API, fiat-only. Build CDNA and CME event-contract adapters instead (separate tasks). Keep a registry entry for FanDuel Predicts with `kind = broker-frontend`, `routes_to = [cdna, cme]`, `independent = false`, `readable = false`, so that markets seen via FanDuel, DraftKings and Underdog collapse onto the same instrument.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Apple iTunes Search API (`itunes.apple.com/search?term=fanduel%20predicts&entity=software&country=us`) | "FanDuel Predicts", bundle `com.fanduel.futures`, seller FanDuel Limited, **version 1.10.1, currentVersionReleaseDate 2026-09-22T10:59:17Z**, first release 2025-12-22, **userRatingCount 6,742, average 4.78**, release notes "bug fixes and performance updates". Fetched 2026-10-19. | H |
| Flutter Q2 2026 results (published 2026-08-05) | Names FanDuel Predicts repeatedly: "further expanded our prediction market offering and capabilities"; "FanDuel Predicts product expanded with player props and customizable combos launched"; "One App" launched; market-making begun. Q3 results are scheduled for 2026-11-04. | H |
| NEXTPredict platform page (published 2026-08-25) | "launched in December 2025", "available across all 50 US states by mid-January 2026", Yes/No contracts, sports in 18 states. | M |
| Direct site | `fanduel.com/predicts` HTTP 403 (CloudFront), so not verifiable by direct read | H (403) |

Verdict: **still_live = true.** Launch history (December 2025; app first released 2025-12-22) is consistent across the App Store record and NEXTPredict (older than 6 months, but only used as history).

---

## 2. Kind and market model

- **Kind (H):** an FCM-run retail app. App Store disclaimer: "All derivatives contracts are offered and accounts are carried by FanDuel Prediction Markets LLC, a registered futures commission merchant." Built "in collaboration with CME Group" and "powered by CME Group & CDNA markets". Flutter: "In coordination with CME, we have agreed that all FanDuel Predicts sports and novelties contracts will now be moved to Crypto.com". The "futures" bundle id (`com.fanduel.futures`) fits the same picture (L, inference).
- **Contract shape (H/M):** binary. App Store: "Choose 'Yes' if you think an event will happen, or 'No' if you don't. Then hold your position or sell early (if available)." (H). NEXTPredict: prices from $0.01 to $0.99, "correct contracts pay $1, while losing predictions pay $0" (M).
- **Market types seen (H/M):** game winners and spreads ("Will Atlanta cover against Miami?"), player props, award-show winners, Bitcoin, finance and commodities (App Store, H); **customizable combos / parlays** ("combination contracts"), live for the World Cup, extended to WNBA, tennis and MLB, "over 10% of volume since [14 June]" (Flutter slides, H). No scalar or categorical markets documented (NOT FOUND; categorical events appear to be sets of binaries, M).
- **Order book vs AMM vs parimutuel:** the retail UI is a simplified buy/sell. Underneath, the CME and CDNA contracts trade on those exchanges' central limit order books with market makers (M, inference; H that both exchanges are the listing venues). Whether FanDuel shows depth or only best bid/ask: NOT FOUND (site unreadable).
- **Tokenisation:** none. Positions are cleared futures-style contracts in an FCM account (M, inference). No outcome token exists to transfer or bridge.
- **Instrument identifiers:** NOT FOUND (neither the exchange contract symbols nor any FanDuel market id format could be read).

---

## 3. Chains and collateral

- **No chain.** Collateral is **US dollars in a FanDuel account**. Funding: "Debit cards, online bank transfer"; no separate deposit or withdrawal fees (M, NEXTPredict 2026-08-25). No crypto deposit path was found (NOT FOUND).
- Account holder must be 18+ (H, App Store; M, NEXTPredict).

---

## 4. Read API

`exists = none` (no public or authenticated developer API found). Confidence medium: the official site could not be read, so a private partner API cannot be ruled out.

| Item | Finding | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: App Store record, Flutter Q2 2026 documents, NEXTPredict page, GitHub repository search for "fanduel predicts"; fanduel.com blocked) | M |
| Base URLs | Only the consumer site `https://www.fanduel.com/predicts` (403 to scripts) | H |
| Private app backend | Not probed; not documented; undocumented endpoints must not be assumed | - |
| Websocket | NOT FOUND | M |
| Rate limits / auth | n/a | - |
| **Where real data is** | (a) the exchanges: **CDNA** for sports and novelties (sibling task; River Markets lists "Crypto.com (CDNA)" as a supported exchange per `docs/research/14-platform-of-platforms.md`), (b) **CME** event contracts via licensed CME market data or an FCM (CME says scripted web access is prohibited: fixture `cmegroup_403_scraping_notice.txt`) | M |

Sibling notes reach the same conclusion for another brand on the same exchanges: `docs/research/venues/draftkings-predictions.md` (DraftKings is an introducing broker with Wedbush as FCM, CME and CDNA as exchanges, H in that note) and `docs/research/venues/underdog-predict-underdog-exchange-udx.md` (Underdog's CDNA-routed contracts share CDNA's book). I did not re-verify those notes.

No public response to fixture. The fixtures are evidence of liveness and of the closed doors, not market data (section 14).

---

## 5. Trade path

**None for an agent.** No documented order API, no API keys, no signing scheme (NOT FOUND). Orders are placed in the app by a logged-in, KYC'd FanDuel customer. The only programmatic routes to the same risk are institutional and belong to other venues: CME (FIX/iLink and market data through an FCM) and CDNA (via Crypto.com or an aggregator such as River) (M, same conclusion as the DraftKings sibling note). Out of scope here.

---

## 6. PayBox / EVM wallet reachability

**no.** Fiat USD only, US-resident KYC account at an FCM, debit card or ACH-style deposits. No wallet connect, no signed orders, no on-chain transaction proposal can place a trade or fund it. A PayBox card credential could in theory fund a human account manually; that is not an agent trade path, and automation terms are unread. (M, inference.)

---

## 7. Fees

- **FanDuel-side fee (M, low confidence, internally inconsistent source):** NEXTPredict (2026-08-25, small-model summary) quotes "Traders will incur a 2% transaction fee for every cash out" and "There are no separate deposit or withdrawal fees". The same page's FAQ says the fee "will only apply if the contract is sold early or following a cash out", while its body says it "applies the same way whether you hold a contract to settlement or exit early". Whether the 2% applies to the payout or the notional, and whether it applies at settlement, is **unresolved**.
- **Exchange and clearing fees:** NOT FOUND for FanDuel. For reference, the DraftKings sibling note records (M, via NEXTPredict) exchange fees of $0.01-$0.03 per contract on CDNA and $0.02 per contract per side on CME; FanDuel's schedule may differ and must not be assumed.
- **Payer:** the customer. FanDuel/Flutter earn fee revenue plus separate market-making revenue (H, Flutter: "Q2 revenue was not material" for FanDuel Predicts; market-making Q2 revenue $6m).
- For an arbitrage scanner the FanDuel fee is irrelevant once FanDuel is excluded as a leg; the exchange fee on CDNA/CME is what counts.

---

## 8. Resolution and dispute risk

- **Resolution is by the listing exchange's contract rules**, not by FanDuel and not by an on-chain oracle (M, inference from H that the contracts are CME/CDNA listings). The specific settlement source per contract: NOT FOUND (rulebook and contract specs unreadable; cmegroup.com blocked).
- Dispute/void risk is therefore exchange-rulebook risk: voids, corrections and delayed settlement are exchange decisions. The same real-world event can settle under different wording on Kalshi/Polymarket versus CDNA/CME; per-contract rule matching is required before pairing legs (see `docs/market-linking-design.md`).
- **Jurisdictional risk (M):** Wikipedia's "Prediction market" page (small-model summary, 2026) reports state suits and enforcement actions over sports event contracts in 2026, including Crypto.com v. Nevada (February 2026). FanDuel offers sports contracts only in 18 states (below), consistent with caution. A court or regulator action could pause the CDNA sports book for every front end at once.
- **Product change risk (H):** the venue mix itself changed in 2026 (sports moved to CDNA, novelties "to follow"). Instrument ids, contract wording and settlement sources may have changed as a result; a stored mapping from before August 2026 should be treated as stale.

---

## 9. Geo, ToS and automation

- **Sports contracts only in 18 states (H, App Store description):** AK, AL, CA, DE, FL, GA, HI, ID, MN, NE, NM, ND, OK, RI, SC, SD, TX, UT. All other products "available to trade in all 50 states". 18+ (H). NEXTPredict agrees on "18 states" (M).
- **Site access:** fanduel.com returns 403 to scripts and to my non-US egress (H); I did not try to bypass it.
- **Automation / API terms:** NOT FOUND (member agreement unreadable). CME: "Use of scripts, software, spiders, robots, avatars, agents, tools or other scraping mechanisms is strictly prohibited by CME Group's website Data Terms of Use" (H, fixture). Assume FanDuel's app terms also forbid scripted trading until read.
- Responsible-gaming tooling ("Consumer Protection tools", spending limits and deposit alerts) is present (H/M).

---

## 10. Liquidity

- **Volume / OI / TVL: NOT FOUND.** Flutter gives no contract or notional volume. FanDuel Predicts "Q2 revenue was not material" (H, Q2 release outlook); market-making revenue was $6m in Q2 and is guided to about $50m for 2026 (H). Combination contracts were "over 10% of volume" since 14 June (H, slides) but the denominator is not given. The Flutter KPI pack contains no prediction-market metric (searched shared strings for "predict", "crypto.com", "CME": no hits).
- Social proof only: 6,742 App Store ratings, 2026-10-19 (H).
- Flutter's own words: "While operational progress in H1 has been slower than planned, we are gaining traction" (H, 2026-08-05) and the move of sports to CDNA is meant to give "deeper sports market availability and liquidity" (H, slides). Read together: FanDuel's own flow was thin enough in H1 that it chose to depend on CDNA's book. Next datapoint: Flutter Q3 results on 2026-11-04 (scheduled, M: page summary).
- Flutter's Q2 US adjusted EBITDA of $119m (-70%) was attributed in part to "prediction market investment" (H); this is cost, not volume.

---

## 11. Event categories and overlap (where arbitrage could exist)

All of these are **on the CDNA/CME books, not FanDuel-specific**:

| Category | On FanDuel Predicts | Overlap |
|---|---|---|
| Sports (game winners, spreads, player props, combos; World Cup, NFL, WNBA, MLB, tennis named) | yes, 18 states only (H) | Kalshi, Polymarket US, CDNA directly, Underdog UDX, Novig and others |
| Crypto price (Bitcoin) | yes (H, App Store) | Kalshi, Polymarket, Limitless and other crypto ladders |
| Finance, commodities, indices | yes via CME (H, App Store and Flutter) | Kalshi economics/indices |
| Macro (rates, jobs data) | not confirmed for FanDuel (NOT FOUND); CME lists such contracts (M, via DraftKings sibling note) | Kalshi, Polymarket |
| Culture (award shows, movies, music) | yes (H, App Store and M, NEXTPredict) | Kalshi, Polymarket |
| Politics | not mentioned in any FanDuel source (NOT FOUND) | - |

---

## 12. Shared liquidity

**Yes. Not an independent arbitrage leg.**
- Sports/novelties: CDNA (Crypto.com | Derivatives North America), per Flutter 2026-08-05 (H).
- Financial markets: CME Group (H).
- Other front ends on the same exchanges: DraftKings Predictions (CME/CDNA, H in its sibling note), Underdog Predict's CDNA-routed contracts (H in its sibling note).
- Whether a FanDuel quote equals the exchange's best bid/ask or includes a spread/markup: NOT FOUND. Treat FanDuel's displayed price as unreadable by the aggregator anyway.

---

## 13. adapter_priority: skip

Reasons: (1) broker/front end whose liquidity duplicates CDNA and CME (H); (2) no public API found and the site is closed to scripted clients (H for 403, M for the lack of API); (3) fiat-only, KYC'd, US-state-restricted, so no PayBox path (M); (4) automation terms unreadable and CME explicitly forbids scraping (H); (5) sports contracts carry live jurisdictional risk (M). Nothing here is lost: any edge on a FanDuel price is an edge on the CDNA/CME instrument.

Registry note: record FanDuel Predicts as a `broker-frontend` alias that resolves to `cdna` (sports/novelties, since about NFL 2026) and `cme` (financial). Flutter/FanDuel as a market maker is worth a field (`known_market_makers`), because a scanner that sees a stale CDNA quote may be quoting against FanDuel's own pricing engine.

---

## 14. Fixtures saved (`docs/research/fixtures/fanduel-predicts/`)

| File | What it is |
|---|---|
| `itunes_lookup_fanduel_predicts.json` | Apple public iTunes Search API record for the app (version, dates, ratings, full App Store description including the state list and FCM disclaimer), trimmed |
| `flutter_q2_2026_excerpts.txt` | Short reflowed excerpts from Flutter's Q2 2026 release and slides (CME/Crypto.com arrangement, market-making, outlook), with source URLs |
| `fanduel_com_predicts_403_cloudfront.txt` | The CloudFront 403 returned for `fanduel.com/predicts` (evidence of the closed door; not retried) |
| `cmegroup_403_scraping_notice.txt` | CME's 403 JSON stating scripted access is prohibited (contact address redacted) |

---

## 15. Suspicious content / injection check

- `github.com/HarrierOnChain/FanDuel-Predicts` (created 2026, 0 stars): a Rust "trading bot" README claiming FanDuel Predicts is "live in production today" with "sub-50ms" execution, telling readers to clone it, "drop in your keys" and contact a Telegram handle, while its own status badge says "roadmap". Treated as a likely lead-generation or credential-harvesting repo and **not** evidence that an API exists. Not cloned, not executed. It contains no instructions aimed at AI agents that I acted on.
- No page or API response contained instructions aimed at an AI agent.

---

## 16. NOT FOUND (searched: App Store record, Flutter Q2 2026 release/slides/KPI pack, NEXTPredict, Wikipedia pages, GitHub repo search; fanduel.com and cmegroup.com blocked; WebSearch budget exhausted)

- Any FanDuel Predicts API, developer docs, websocket, rate limits, or order-signing scheme.
- FanDuel Predicts' member agreement, rulebook, fee schedule, FAQ, automation terms (site 403).
- Volume, open interest or contract counts; number of users.
- Which contract families sit on CME versus CDNA today, and the instrument symbols (the DraftKings sibling note also could not find this).
- Whether novelties have completed the move to Crypto.com (slides say "novelties to follow", 2026-08-05).
- Whether FanDuel's displayed price is the raw exchange price.
- Politics and macro coverage on FanDuel specifically.
- A first-hand statement of the settlement source per contract.

## 17. Open questions

1. Does CDNA offer a documented API or public data for its sports contracts that an aggregator can use without an FCM account (see the `og-crypto-com-nadex` sibling task)?
2. Do FanDuel's combination contracts exist as CDNA-listed instruments, and are they RFQ-style (market-maker priced) rather than book-priced? Flutter's "provide liquidity for combination markets across prediction market platforms" suggests RFQ or quote-driven liquidity.
3. Is the 2% FanDuel fee charged at settlement as well as on early exit? (Resolve by reading the member agreement from a US browser, manually.)
4. What does Flutter disclose in its Q3 2026 results (2026-11-04) about FanDuel Predicts volume?
5. Would a legal shock to CDNA sports contracts (state actions) take all front ends offline at once, and how should the scanner mark a venue as halted?

---

## 18. Sources

- https://apps.apple.com/us/app/fanduel-predicts/id6747883721 and the Apple iTunes Search API record (`https://itunes.apple.com/search?term=fanduel%20predicts&entity=software&country=us&limit=5`) - description, FCM disclaimer, state list, version 1.10.1, 2026-09-22, 6,742 ratings (H, fetched 2026-10-19)
- https://flutter.com/media/g23an0ae/flutter-q2-2026-earnings-release.pdf - Q2 2026 release, 2026-08-05 (H; text extracted locally from the PDF)
- https://flutter.com/media/x1pbxug4/flutter-q2-2026-presentation.pdf - Q2 2026 slides, PDF p.6-7 (H)
- https://flutter.com/media/xvyhhnya/flutter-q2-2026-kpi-pack.xlsx - searched, no prediction-market metrics (H, negative)
- https://www.flutter.com/investors/ - document index and Q3 date 2026-11-04 (M, page summary)
- https://nextpredict.io/platforms/fanduel/ - published 2026-08-25; launch date, states, 2% fee, payment methods (M; small-model summary; internally inconsistent on the fee)
- https://www.fanduel.com/predicts (and `/predicts/legal`, `/predicts/fees`, `/predicts/faq`, `/legal`) - HTTP 403, unreadable (H, 403)
- https://www.cmegroup.com/markets/event-contracts.html - HTTP 403 with scraping-prohibited notice (H)
- https://en.wikipedia.org/wiki/FanDuel and https://en.wikipedia.org/wiki/Prediction_market - FanDuel launch mention (Nov 2025) and 2026 state-litigation context (M/L; page summaries)
- https://github.com/HarrierOnChain/FanDuel-Predicts - README read as untrusted data (section 15)
- Sibling notes in this repo (not re-verified): `docs/research/venues/draftkings-predictions.md`, `docs/research/venues/underdog-predict-underdog-exchange-udx.md`, `docs/research/14-platform-of-platforms.md`
