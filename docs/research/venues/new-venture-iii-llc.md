# New Venture III LLC (NFA 0576830, "FanDuel's second FCM") - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public GETs (generic User-Agent `insurance-markets-research/0.1`), no account, wallet, key, signature, POST or PayBox tool. Third-party pages treated as untrusted data.

Tags: H = read first-hand in a primary source this session; M = secondary / small-model page summary / inference; L = weak or stale.

Limits (read first):
- The WebSearch budget for the session was exhausted, so no news search was possible. Only the tracker, NFA BASIC, the CFTC FCM page and sibling notes were used.
- NFA BASIC fills in the firm name, status and principals client-side through an RPC client (a POST); I did not call it. So the registration is **not independently verified**.

## 0. Bottom line

1. **This is not a venue.** The only source that mentions the entity is a third-party tracker, and it lists "New Venture III LLC NFA ID 0576830 - Oct 2026 - FanDuel's second FCM" under "Registered FCMs intermediating prediction-market contracts" (M, tracker; page header "Current as of May 2026", entries run to Oct 2026, no methodology). The tracker gives no DCM, DCO or clearing role.
2. **Is it live?** NFA BASIC serves a profile page for NFA ID 0576830 with the "FCM Financial Data Reporting" section, which is consistent with the ID being an FCM registration (H: HTTP 200, 2026-10-19, fixture). It is **not** in the CFTC FCM financial data report as of 2026-08-31 (H, negative check, fixture), which fits a registration in Oct 2026. Whether it is trading customer money yet: NOT FOUND. Verdict: `still_live = true` only as a registrant (M); there is no product to be live.
3. **No market, no book, no API, no price.** It is a brokerage legal entity. Anything FanDuel customers trade resolves to exchange order books at CME and CDNA (see `docs/research/venues/fanduel-predicts.md`, `docs/research/venues/cme-group-event-contracts.md`, `docs/research/venues/og-crypto-com-predictions.md`).
4. **adapter_priority = skip.** Zero independent liquidity, nothing to read, no wallet path. At most keep a registry alias: `New Venture III LLC (NFA 0576830) -> brand FanDuel Predicts, kind broker-entity, independent=false, readable=false`.

## 1. What it probably is (M / L, inference)

- FanDuel Predicts is carried by FanDuel Prediction Markets LLC (an FCM; CFTC report 2026-08-31 lists it as registered FCM, H) and is a 51% CME / 49% FanDuel joint venture per the tracker (NFA 0550813, M). The tracker calls New Venture III "FanDuel's second FCM".
- Why a second FCM would exist is **NOT FOUND** (no filing, press release or Flutter statement located). Candidate reasons (L, speculation, do not use): carrying the CDNA-routed sports book separately from the CME-joint-venture FCM, or a Flutter-only entity after the move of sports and novelties to Crypto.com/CDNA that Flutter reported on 2026-08-05 (H in the FanDuel note). Treat as an open question.

## 2. Market model, chains, collateral

Not applicable. The entity has no contracts of its own. Customers of FanDuel Predicts hold US-dollar-collateralised, exchange-listed binary event contracts in an FCM account (H, from the FanDuel note: App Store disclaimer). No outcome token, no chain, no crypto collateral.

## 3. Read API

`exists = none`.

| Item | Finding | Tag |
|---|---|---|
| Official site / docs | NOT FOUND (searched: tracker page, NFA BASIC profile static HTML, CFTC FCM data page; fanduel.com returns 403 to scripts per sibling note) | M |
| Base URLs | None. Only the NFA registration page `https://www.nfa.futures.org/BasicNet/basic-profile.aspx?nfaid=0576830` (registry, not market data) | H |
| Markets, books, trades | none exist at this entity | M |
| Where real data is | CDNA and CME event contracts (sibling notes) | M |

Fixtures (no market data exists): `docs/research/fixtures/new-venture-iii-llc/` holds the tracker row excerpt, the NFA BASIC static text, and the CFTC August 2026 negative check.

## 4. Trade path

None. No order API, auth or signing scheme (NOT FOUND). Orders for FanDuel customers are placed in the FanDuel app by a KYC'd US customer. Institutional access goes to the exchanges directly (CME via an FCM, CDNA via OG/Crypto.com), not through this entity.

## 5. PayBox / EVM reachability

**no.** Fiat USD, FCM account, KYC. No wallet connect, no signed orders, no transaction proposal can place or fund a trade here.

## 6. Fees

NOT FOUND for this entity. FanDuel Predicts fee reading is in the FanDuel note (M, low confidence: "2% transaction fee for every cash out" from NEXTPredict, internally inconsistent). Not usable as an aggregator input.

## 7. Resolution and dispute risk

Resolution is by the underlying exchange's rulebook (CME or CDNA), not by this FCM (M, inference). No venue-specific dispute mechanism. Regulatory risk: state challenges to sports event contracts (see the FanDuel and OG notes) could pause the CDNA sports book for every front end at once.

## 8. Geo, ToS, automation

NOT FOUND for this entity (no site). FanDuel Predicts: sports contracts only in 18 states, 18+ (H, FanDuel note). Assume scripted trading is forbidden until a member agreement is read.

## 9. Liquidity

NOT FOUND (no volume, OI or TVL anywhere for this entity). CFTC FCM data as of 2026-08-31 does not list it (H). For scale only, FanDuel Prediction Markets LLC showed a $3.4M segregation requirement on that date (H, from the Underdog note fixture). New Venture III has no comparable data yet.

## 10. Event categories and overlap

None of its own. Whatever it carries overlaps CME/CDNA categories (sports, crypto price, finance/commodities, culture) which in turn overlap Kalshi and Polymarket; arbitrage belongs on the CME and CDNA legs.

## 11. Shared liquidity

Fully shared: it is a front-end entity for FanDuel flow routed to CME and CDNA (M). It must never be counted as an independent leg. Scanner rule: put it in the existing group "NADEX/CDNA/OG" (for the CDNA-routed part) and in "CME" (for the CME-routed part) as an alias of FanDuel Predicts.

## 12. adapter_priority: skip

Registrant only; no product, API or liquidity. Revisit only if (a) FanDuel or Flutter publish a distinct product under this entity, or (b) NFA BASIC (via its RPC, if allowed for scripted reads) shows the firm name and start date, which would settle what it is.

## 13. Open questions

1. What is the entity's NFA registration date, status, and principals? Requires the NFA BASIC RPC or a browser read (not done: POST / no browser).
2. Does it carry customer accounts for the CDNA sports book or for a new FanDuel product?
3. Does Flutter's Q3 2026 release (scheduled 2026-11-04, M per FanDuel note) mention a second FCM?
4. The tracker's own dating is unreliable ("Current as of May 2026" with Oct 2026 entries). It also lists DraftKings with conflicting approval dates (M).

## Sources

- https://mickbransfield.com/cftc-regulated-pms/ (tracker; WebFetch summaries 2026-10-19; M)
- https://www.nfa.futures.org/BasicNet/basic-profile.aspx?nfaid=0576830 (HTTP 200, static shell with FCM Financial Data section; H for existence of page, name not shown)
- https://www.cftc.gov/MarketReports/financialfcmdata/index.htm (latest report listed 2026-08-31; H)
- https://www.cftc.gov/sites/default/files/2026-10/01%20-%20FCM%20Webpage%20Update%20-%20August%202026.xlsx (no "New Venture" hit; only FANDUEL PREDICTION MARKETS LLC; H)
- Sibling notes: `docs/research/venues/fanduel-predicts.md`, `docs/research/venues/cme-group-event-contracts.md`, `docs/research/venues/og-crypto-com-predictions.md`, `docs/research/venues/underdog-predict-udm-llc-fcm.md`
- Fixtures: `docs/research/fixtures/new-venture-iii-llc/`
