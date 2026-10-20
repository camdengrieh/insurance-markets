# Splash Sports / Splash Market LLC - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web pages only (splashsports.com, legal.splashsports.com, docs.polymarket.us, trade press), fetched with WebFetch (which returns a small-model summary of each page, so quotes below are as returned by that tool) and with plain unauthenticated GETs sent with the User-Agent `insurance-markets-research/0.1`. No account, no wallet, no login, no POST, no signing, no payments, no browser automation, no probing of any undocumented Splash backend. WebSearch had one successful call; the shared budget was then exhausted, so third-party coverage is limited to the pages listed under Sources.

Confidence tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source (trade press, review sites) or my inference from first-hand data; **L** = weak or stale.

Fixtures: none. Splash has no public API of any kind, so there is nothing to sample (section 4). `docs/research/fixtures/splash-sports-splash-market-llc/` was not created.

---

## 0. Bottom line

1. **Splash Market is a consumer front end (a tab inside the Splash Sports fantasy/pool app) run by a CFTC-registered introducing broker that routes event-contract orders to Polymarket US. It is not an independent venue.** The tracker says "routes event-contract orders to Polymarket US" (H, that the tracker says it; https://mickbransfield.com/cftc-regulated-pms/); a review article says "Splash Market, LLC is a CFTC-registered introducing broker that sends trades to Polymarket US" (M, fantasyalarm.com, 2026-10-18); the press release says the tab is "powered by Polymarket" (M, Yahoo-hosted Business Wire release, 2026-06-18). Polymarket's own partner docs say an IB is "a permissions and routing layer" and that Polymarket US "runs the order book and matches orders as the DCM" (H, https://docs.polymarket.us/partners/your-role.md). **Liquidity is Polymarket US liquidity: do not count Splash as a separate arbitrage leg.**
2. **No Splash API, no developer page, no Splash-specific market data.** Terms of Use section 14 bans "any robot, spider, scraper, sniping software or other automated means to access the Service" without express written permission (H). The Polymarket US partner API that Splash itself uses is for approved Firms only (signed IB Agreement, RSA keys, Polymarket review) and is not available to us (H).
3. **Not reachable from PayBox.** Fiat/KYC venue, US-state gated, no chain, no wallet address, no signed-order scheme exposed to third parties (M, from structure; section 6).
4. **Splash may add its own "vendor fee" on top of the Polymarket US exchange fee**, set by Splash per order, with no formula or cap imposed by Polymarket (H, vendor-fees doc). Splash's actual fee is NOT FOUND. So a Splash fill can only be equal to or worse than the same fill placed directly on Polymarket US.
5. **adapter_priority = skip.** If Polymarket US sports prices are wanted, use the Polymarket US adapter (public `gateway.polymarket.us`; covered by the parallel Polymarket workflow, see docs/research/08-venues-polymarket-kalshi.md section 3). Splash adds nothing except, at most, a distribution/availability signal.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://www.splashsports.com / https://splashsports.com | HTTP 200, "(c) 2026 Splash Sports"; presents Survivor, Daily Fantasy, Pick'Em, Confidence, Tiers, PGA One & Done, commissioner tools. **The homepage does not mention prediction markets, Splash Market, CFTC or Polymarket** | H |
| https://splashsports.com/where-can-you-play | The availability matrix has a fifth game column labelled **"Predictions"** (columns: Survivor, Pick'Em, Tiers / One & Done, QuickPicks, Predictions). For that column I parsed the page HTML: **32 of 51 jurisdictions marked available, 19 unavailable** (AZ, CO, CT, IL, KY, MD, MA, MI, MN, MO, MT, NV, NH, NJ, NY, OH, TN, UT, WA). The page never says "Splash Market" or "Polymarket", so that "Predictions" = Splash Market is my inference (the unavailable list matches states hostile to prediction markets) | H (page content), M (mapping) |
| https://mickbransfield.com/cftc-regulated-pms/ | Lists "Splash Sports" among front ends routing through QCX (Polymarket US), and under "Registered Introducing Brokers intermediating prediction-market contracts" the entry "Splash Market LLC (d/b/a Splash Sports) Betterpool, LLC - routes event-contract orders to Polymarket US", NFA ID 0572313 (per the fetch summary). Page says "Current as of May 2026" but describes events to Oct 2026, so the date label is stale. No registration date given | M (tracker is a secondary compilation) |
| https://www.fantasyalarm.com/articles/promotions/best-prediction-market-apps-sites-nfl-week-6-bonuses-promo-codes/197076 | Published and updated **2026-10-18**. Describes Splash Market as "the prediction market tab in the Splash app", live with promo code ALARM (50% deposit match up to $100), "Open the Splash Market tab and place a trade!", Week 6 contracts listed | M (affiliate/review content) |
| Business Wire release via https://finance.yahoo.com/markets/crypto/articles/polymarket-splash-sports-announce-strategic-130000373.html | 2026-06-18: Polymarket and Splash partnership; Splash Market "launching in July or August 2026" as "a licensed introducing broker" offering sports event contracts to verified customers; standalone tab in the Splash app "powered by Polymarket"; 2M+ active users | M (paid press release) |
| https://www.rotowire.com/article/polymarket-splash-nfl-survivor-pool-118668 | "Splash received federal clearance to operate as a licensed introductory broker in March" [2026]; Splash Market "will be a standalone tab ... powered by Polymarket"; no launch date | M |
| https://www.covers.com/industry/splash-sports-partners-with-polymarket-to-expand-survivor-contests-june-18-2026 | Same announcement; launch planned July or August; Splash in "more than 30" states (the co-founder quote says "35+") | M |
| https://github.com/SplashSports (GitHub org) | Exists, created 2026-05-28, 0 public repos, not verified; I cannot confirm it is the same company | L |

Verdict: **still_live = true** (company is live; Splash Market was reported live by a dated 2026-10-18 article, but I found no Splash-owned page that describes Splash Market, and I could not open the NFA BASIC record, which returned only a blank search template). Because Splash publishes nothing about it on the sites I could read, treat "live" as M, not H.

Gaps: NOT FOUND (searched: splashsports.com homepage, /company, /partnerships, /updates, /faq index, sitemap.xml (147 URLs, none about Splash Market), legal.splashsports.com index, Terms of Use v12 updated 2025-11-06 (full text, no mention of Splash Market, Polymarket, event contracts, Betterpool or Splash Market LLC), Entry Marketplace Terms (updated 2026-09-16; it governs resale of fantasy contest entries, unrelated)): any first-party Splash Market page, Splash Market-specific terms, fee page, FAQ or state list.

---

## 2. Kind and market model

- **Kind:** broker/front end for Polymarket US (M/H as in section 0). Splash Market LLC (d/b/a Splash Sports) is the IB entity per the tracker; Splash Inc. "owns and operates" Splash Sports per the 2026-04-27 knowledge article (H, https://splashsports.com/knowledge/who-owns-splash-sports, which does not mention Splash Market, Betterpool or prediction markets). The relationship between "Betterpool, LLC" and Splash is not established by any primary source (NOT FOUND; the tracker line is ambiguous between "parent", "formerly" or a second entity).
- **Market model (inherited from Polymarket US, H via the existing project note and the docs):** one binary YES contract per market (NO is a short of the same contract), central limit order book run by the DCM, USD $1/$0 settlement. See docs/research/08-venues-polymarket-kalshi.md section 3.
- **What Splash exposes:** sports event contracts first ("sports event contracts to verified customers", M, press release); "markets embedded throughout existing games" for hedging survivor picks (M). Whether Splash filters the Polymarket US catalogue to sports only: NOT FOUND (the app is not publicly browsable).
- **Tokenisation:** none. Positions are cleared-contract positions at Polymarket US; no on-chain token (M, by structure; the partner docs describe accounts and balances at the DCO, not wallets).
- **Not to be confused with:** Splash's fantasy/pool games (Survivor, Pick'Em, Tiers, QuickPicks, DFS): entry-fee contests with prizes, no order book, not tradable (H, splashsports.com). Polymarket sponsors a $21M guaranteed NFL Survivor contest (M, press release); that is a promotional prize pool, not a market.

## 3. Chains and collateral

- **Chain: none.** USD collateral held at the Polymarket US clearing organisation (DCO) (H, https://docs.polymarket.us/partners/platform-model.md: "DCO (clearing): Holds collateral, clears trades, and settles contracts").
- **Funding path:** IB participant accounts are funded "by the IB's funding entity through Partner Funding, which is in Beta" (H, https://docs.polymarket.us/partners/partner-types/ibs.md); "You never hold participant funds" (H, your-role doc). Splash's deposit methods and minimums: NOT FOUND (the Oct 18 review mentions a "deposit" match but names no methods).
- **Customer-funds statement:** the fantasyalarm article says Splash's Terms state customer funds are not covered by CEA section 4d segregation protections (M, secondhand; I could not find the Splash Market terms to verify). Do not rely on it, but treat it as a flag for counterparty/custody risk (see section 8).
- **Identity:** the IB collects KYC and submits it; Polymarket US performs the verification (Socure-backed) and creates the Participant and Account on approval (H, platform-model and partner docs). Press release says "verified customers" (M).
- No crypto deposit/withdrawal path appears anywhere (H by absence in the pages read).

## 4. Read API

**Official: none.**

| Surface | Result | Tag |
|---|---|---|
| Splash developer docs / API page | None linked from the homepage, none in the 147-URL sitemap; no "api" or "developer" URL | H |
| Splash GitHub | Org `SplashSports` has 0 public repos (created 2026-05-28) | H (that it is empty), L (that it is theirs) |
| splashsports.com/robots.txt | Returns `403 AccessDenied` XML | H |
| app.splashsports.com | HTTP 200 but a client-rendered shell; fetch tool saw only the title "Splash Sports". Not probed further (login-gated, undocumented backend) | H |
| Polymarket US partner API (what Splash uses) | REST (pre-prod host in the quickstart: `https://api.preprod.polymarketexchange.com`; production host not given), gRPC (`OrderFundingService.CreateVendorOrder`, `CashMovementService.CreateCashMovement`), Drop Copy and Balance Ledger streams, Private Key JWT (RS256, `client_credentials`) auth, `x-participant-id` header for participant-scoped calls. **Only for onboarded Firms**: signed partner agreement, RSA public keys, review by Polymarket US, applications to institutional@polymarket.us | H (https://docs.polymarket.us/partners/get-connected/quickstart.md, .../onboarding.md) |
| Prices / books / BBO for the same contracts | Public, unauthenticated: `https://gateway.polymarket.us/v1/events`, `/v1/markets`, `/v1/markets/{slug}/book`, `/bbo`, `/v1/sports`. I re-confirmed on 2026-10-19 that `GET /v1/events?limit=1&active=true&closed=false&seriesSlug=nfl` returned 200 with live data (example event `mlb-champ-2026-09-27`, updated 2026-10-19T02:12Z) and `GET /v1/sports` returned 200 | H (but belongs to the Polymarket US adapter; no fixture saved here) |

**Attribution:** nothing in the Polymarket US public docs or API tags orders as "Splash-originated" (NOT FOUND in the fee, partner and gateway pages read). Splash flow is therefore invisible in public Polymarket US data; Splash gets "intermediate customer transactions" (H, IB doc) but that is private to the IB.

## 5. Trade path

**None for an agent.** The only route is the Splash app after Splash + Polymarket KYC. Terms of Use section 14 prohibits robots, spiders, scrapers, sniping software and other automated means to access the Service without written permission, and says authorised scripts "will be made available through the Service before game entry" (H, https://legal.splashsports.com/legal/terms-of-use, v12, updated 2025-11-06; these Terms predate Splash Market and may not be the governing document for it). Splash exposes no order API or API keys. The IB-level order API (`CreateVendorOrder`) is for the Firm, not for the Firm's customers (M, from the partner docs; the docs do not state whether customers can also use the API directly).

For anyone wanting to trade the same contracts programmatically: apply as a Polymarket US individual/institution and use Polymarket US's own authenticated API (other workflow's scope).

## 6. PayBox reachability

**No.** No chain, no wallet address, no contract to propose a transaction against, no signed-order scheme that a PayBox EVM/Solana wallet could produce. USD fiat funding via the IB's funding entity, KYC, US-state gating, Terms that ban automation (M, from the structure and absence of any wallet path in everything read). A PayBox wallet could at most hold USDC that a human converts elsewhere; there is no direct integration.

## 7. Fees

- **Exchange fees are Polymarket US's** (H, https://docs.polymarket.us/fees, read 2026-10-19): taker `fee = Θ x C x p x (1 - p)`, Θ = 0.0695 for standard markets, 0.10 for table tennis; combos `C x p x [0.0695 x (1 - p) + 0.06 x (1 - p)^4]`; maker rebate Θ = -0.0125 (none on combos) until 1:00 PM ET 2026-10-19, then volume tiers (-0.0035 to -0.0104) and tiered taker rebates. Whether a Splash-routed account earns maker/taker rebates: NOT FOUND (the Polymarket US fee page does not mention partners or IBs).
- **Splash-specific fee: NOT FOUND.** The Polymarket US partner docs let the IB declare a `vendor_fee` per order: "what you charge a Retail Participant for an order, per your agreement with them"; Polymarket US applies no formula and the doc mentions no cap; the participant pays; it accrues as a receivable and is collected by a `VENDOR_FEES` transfer at most once per day per account (H, https://docs.polymarket.us/partners/funding/vendor-fees.md). Whether Splash uses it is NOT FOUND. The 2026-10-18 review article says fees are "not mentioned".
- Promo: 50% deposit match up to $100 with code ALARM (M, affiliate article). Promotions are not a fee but affect effective cost and may carry play-through terms (unknown).

## 8. Resolution and dispute risk

- **Resolution is Polymarket US's** (exchange determines the outcome from the sources in each contract's terms; final under the Polymarket US Rulebook; clarifications can cancel resting orders), documented in the Polymarket US rulebook and covered in docs/research/08 and docs/research/venues/betr.md section 8. I did not re-read the Rulebook this session.
- **Extra Splash layer: counterparty/custody risk.** The IB is a routing layer and "never holds participant funds" per Polymarket US's docs (H), but the secondhand report that Splash's Terms disclaim CEA 4d segregation (M) and the fact that funds flow through a Splash "funding entity" (H) mean Splash customers have an extra intermediary that direct Polymarket US customers do not. Splash Market-specific terms are NOT FOUND, so the exact allocation of loss, dispute handling and support responsibilities is unknown.
- Position limits: Polymarket US order-size and accountability limits apply (see the Betr note); Splash may impose extra limits (unknown).

## 9. Geo / ToS / automation

- **Age/location:** "requires users to be 18 or older and to live where Polymarket US event contracts are lawfully offered" (M, fantasyalarm, 2026-10-18). The Splash "Predictions" column is unavailable in 19 jurisdictions (list in section 1; M for the mapping). Min-age cells on that page (18+/19+/21+) are the general game ages, not confirmed as the Splash Market ages.
- **IB regulatory requirements:** IBs need current CFTC IB registration, NFA membership, CFTC Rule 1.17 financial resources, NFA Compliance Rule 2-9 policies, a signed IB Agreement; customers must clear through an FCM clearing member or a self-clearing member (H, IB doc). Splash Market LLC's NFA ID 0572313 comes from the tracker; I could not verify it (NFA BASIC returned a blank search template) (M).
- **Automation:** Terms of Use section 14 bans robots/scrapers/automated access (H, quoted above). Market-integrity rules (no trading on confidential information, source-agency prohibition) flow through from Polymarket US; customers must acknowledge the Rulebook and Source Agency Prohibition before ordering (H, IB doc).
- Arbitration: the general Terms have an arbitration agreement with a 30-day opt-out (H, section 25); not confirmed to cover Splash Market.

## 10. Liquidity

- **No Splash-specific volume, OI, TVL or user count for the prediction product is published.** NOT FOUND (searched: all pages above). The only scale figures are Splash's overall "2 million active users" and a "35+ states plus Canada" reach for the contest (M, press release, 2026-06-18), which describe the fantasy business, not market volume.
- **Liquidity is the Polymarket US order book** (single DCM book; IB "routes" and "does not match", H). Any Splash-originated flow shows up inside Polymarket US figures, not separately.
- For Polymarket US volume/OI use the Polymarket US adapter research (docs/research/08...), not this note.

## 11. Overlap with other venues (where arbitrage lives)

- Event categories are Polymarket US's. Splash's marketing is sports-first (NFL survivor hedging, per-game outcomes) (M), so the overlap that matters is NFL/NBA/MLB/college game winner/spread/total contracts vs Kalshi, DraftKings Predictions, Fanatics Markets, FanDuel Predicts, Polymarket global etc.
- **Shared liquidity:** Splash Market == Polymarket US. Model it as `routes_to: polymarket-us`, `independent_liquidity: false`. It can never be an independent leg: any apparent Splash-vs-Polymarket-US price gap is a display/fee artefact, not an arbitrage.
- Cross-venue arbitrage should be computed against Polymarket US directly; Splash's vendor fee (if any) makes it strictly no better.

## 12. Notes for the platform registry / UI

- Registry fields: `kind: broker-frontend`, `frontend_of: polymarket-us`, `ib: true` (NFA ID 0572313, unverified), `fee_schedule: polymarket-us` plus `vendor_fee: unknown`, `independent_liquidity: false`, `user_can_trade_via_api: false`, `paybox_reachable: no`, `adapter_priority: skip`.
- Same pattern as Betr (docs/research/venues/betr.md) and the other QCX front ends listed on the tracker. Difference: Splash is itself the registered IB, while Betr's help text says it is "not the exchange or a broker".
- Re-check triggers: if Splash starts publishing a developer page or Splash Market terms; if Polymarket US adds IB attribution fields to its public feeds; if Splash launches its own venue (nothing suggests it).
- The `Predictions` availability column on https://splashsports.com/where-can-you-play is the only first-party, machine-readable-ish Splash Market-adjacent signal found (static HTML; 32/51 jurisdictions). It is not worth an adapter.

---

## Sources

1. https://www.splashsports.com (redirects to https://splashsports.com) - homepage product list, no prediction-market mention, copyright 2026 (H)
2. https://splashsports.com/where-can-you-play - availability matrix with "Predictions" column, parsed from HTML (H content, M mapping)
3. https://splashsports.com/sitemap.xml - 147 URLs, none for Splash Market (H); https://splashsports.com/robots.txt returns 403 AccessDenied (H)
4. https://splashsports.com/company, /partnerships, /updates, /faq - no mention of Splash Market (H by absence; /partnerships article dated 2026-09-27)
5. https://splashsports.com/knowledge/who-owns-splash-sports - "owned and operated by Splash Inc.", dated 2026-04-27 (H)
6. https://legal.splashsports.com/ and https://legal.splashsports.com/legal/terms-of-use - legal index (no Splash Market document listed) and Terms of Use v12 (updated 2025-11-06; section 14 automation ban) (H)
7. https://legal.splashsports.com/legal/entry-marketplace-terms - updated 2026-09-16, contest-entry resale only (H, irrelevant to markets)
8. https://mickbransfield.com/cftc-regulated-pms/ - tracker; Splash in "front-ends routing through QCX" and in "Registered Introducing Brokers", NFA ID 0572313 (M)
9. https://www.fantasyalarm.com/articles/promotions/best-prediction-market-apps-sites-nfl-week-6-bonuses-promo-codes/197076 - 2026-10-18 review; live status, eligibility, IB statement, 4d statement (M)
10. https://finance.yahoo.com/markets/crypto/articles/polymarket-splash-sports-announce-strategic-130000373.html - Business Wire release 2026-06-18 as hosted by Yahoo (M); the businesswire.com original returned 403 to the fetch tool
11. https://www.rotowire.com/article/polymarket-splash-nfl-survivor-pool-118668 and https://www.covers.com/industry/splash-sports-partners-with-polymarket-to-expand-survivor-contests-june-18-2026 - trade press on the partnership (M); https://gamingamerica.com/news/1081744/splash-sports-polymarket-partnership returned 403
12. https://docs.polymarket.us/llms.txt - docs index listing the Partners section (H)
13. https://docs.polymarket.us/partners/overview.md, .../partner-types/ibs.md, .../platform-model.md, .../your-role.md, .../get-connected/quickstart.md, .../get-connected/onboarding.md, .../funding/vendor-fees.md - Polymarket US IB/ISV integration model, requirements, auth, vendor fees (H)
14. https://docs.polymarket.us/fees - fee schedule read 2026-10-19 (H)
15. https://gateway.polymarket.us/v1/events and /v1/sports - public GETs on 2026-10-19 confirming the underlying venue is live (H)
16. https://www.nfa.futures.org/BasicNet/basic-profile.aspx?nfaid=0572313 - returned a blank BASIC search template, registration NOT verified
17. https://github.com/SplashSports - GitHub org metadata via `gh api orgs/SplashSports` (H that it is empty; L that it is Splash's)
18. Local: docs/research/08-venues-polymarket-kalshi.md section 3 (Polymarket US hosts, endpoints, auth), docs/research/venues/betr.md (same front-end pattern)

## NOT FOUND

- Any Splash-owned page, FAQ, terms, risk disclosure or fee page for Splash Market (searched: homepage, sitemap.xml, legal index, Terms of Use, company/updates/partnerships/faq pages).
- Splash Market launch date (press said July or August 2026; first dated "live" evidence is the 2026-10-18 review).
- Splash Market states list (only the unlabelled "Predictions" column), deposit/withdrawal methods and minimums, vendor fee, trading limits.
- Splash-attributed volume, open interest or user counts for the prediction product.
- Verification of Splash Market LLC's CFTC IB registration and NFA ID 0572313 (NFA BASIC not readable by the fetch tool; CFTC register not checked).
- The relationship of "Betterpool, LLC" to Splash Market LLC / Splash Inc.
- Any Splash API, SDK or developer program; any Polymarket US feature that exposes IB-originated flow publicly.
- The Polymarket US Rulebook text (not read this session).

## Injection / suspicious content

None observed. `splashsports.com/robots.txt` returns an S3-style AccessDenied XML (access control, not an instruction). The Business Wire release (via Yahoo) contains media contact addresses, which I did not use.

## Privacy

All scripted requests used only the User-Agent `insurance-markets-research/0.1`. No personal identifier was placed in any request, URL or query. No scripts containing "@" or personal names were run.
