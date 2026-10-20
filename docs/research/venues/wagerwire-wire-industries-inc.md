# WagerWire (Wire Industries Inc.) / Wire Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, public unauthenticated GETs of wagerwire.com, wiremarkets.co, docs.wagerwire.com (HEAD/GET of the landing only) and Polymarket Gamma (one cross-check). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Undocumented `/api/` paths on both sites are disallowed in their robots.txt and were NOT probed. The docs host is behind HTTP Basic auth; no credentials were tried or guessed. Third-party pages were treated as untrusted data.

Research limit: the shared WebSearch budget was exhausted before any search ran, so discovery rests on the supplied lead, WebFetch of the iGB article, and first-party probing. No second-source pass was possible.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary/inferred; **L** = weak/stale.

Fixtures (<= 50 KB): `docs/research/fixtures/wagerwire-wire-industries-inc/`.

---

## 0. Bottom line

1. **Two products under one company (H).** (a) **WagerWire** (wagerwire.com): a US secondary marketplace for already-placed sportsbook slips/parlays. (b) **Wire Markets** (wiremarkets.co, Wire Markets Ltd, Gibraltar): a separate, newer prediction-market front end. The "prediction market" in the lead is (b).
2. **Wire Markets is not an independent liquidity venue (H for the data match, M for the mechanism).** Its market pages show Polymarket's own volume and prices, use Polymarket-hosted images, and WagerWire's own press release says it is "aggregating available order books into a single marketplace and routing trades to the best available price". It is a router/white-label over other venues. Treat it as **zero independent edge**: any price there is Polymarket (or another covered venue) re-displayed.
3. **WagerWire secondary market is a different beast (H):** thin (10 listings in the sitemap), US-only, state-by-state, custodial, bids on individual slips. Not an arbitrage leg for a market-price scanner. Optional signal only.
4. **No public API (H).** `docs.wagerwire.com` exists and is titled "WagerWire API" but sits behind HTTP Basic auth (401). Wire Markets docs: none found. No chain, no contract, no GitHub presence found.
5. **Not tradable from a PayBox wallet (H/M).** Both are custodial accounts with KYC and a hosted deposit flow. No signed-order or transaction-proposal path.
6. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.wagerwire.com/sitemap.xml` | 200, lastmod 2026-10-19; 10 `/for-sale/ORD_...` listing URLs; many 2026 articles (e.g. playoffs, World Series context) | H |
| Listing page `/for-sale/ORD_c4ae3d93-...` | "Submitted: 07/20/2026, Resolves: 02/15/2027, Listed Price $210.00, Highest Bid --, Payout $3,570.00", copyright 2026 | H |
| `https://www.wiremarkets.co/` | 200, title "Wire Markets: The global prediction market", banner "Coming soon", early-access signup, free-to-play/paper mode | H |
| `https://www.wiremarkets.co/market/presidential-election-winner-2028` | 200, full market page with Yes/No cents quotes, "Log in to buy"; footer (c) 2026 Wire Markets Ltd | H |
| Wire Markets Terms | Effective Date July 6, 2026 | H |
| WagerWire press item (FairPlay investment) | Dated 23 Sep 2026: Wire Markets "has received approval in principle from HM Government of Gibraltar, the second company to receive such a designation" | H (company's own page) |
| iGB 7 Jul 2026 (supplied lead) | Only says WagerWire "received approval in principle" for a Gibraltar prediction market platform; gives no further detail | H |
| WagerWire `/terms` | "Last updated June 14, 2024" (stale, > 6 months; predates Wire Markets) | H / stale |

Tension to flag: the Wire Markets home page says "Coming soon" and "licensed by the Gibraltar Gambling Commissioner", while the Sep 2026 press item says only "approval in principle". The page claims a fuller status than the press release. Treat "licensed" as unverified (M). Whether real-money trading is open anywhere: NOT FOUND (market pages say "Log in to buy"; I did not sign up).

Verdict: **still_live = true** (site operating), but the prediction product is pre-launch / unclear.

---

## 2. Kind and market model

- **WagerWire (H):** secondary marketplace for existing sportsbook bets; listings show sportsbook (DraftKings, FanDuel, Fanatics, etc.), legs, original odds, asking price, payout, resolution date; users "Make Bid". Own listings book, price set by seller, bid/ask per slip. Not tokenised. JSON-LD on the listing page exposes `price` (21000 for a $210.00 listing, i.e. cents), `Potential Payout` and `Number of Legs`.
- **Wire Markets (H for UI, M for mechanics):** categorical event markets with a Yes/No pair per outcome in cents (e.g. 54 outcomes in "Presidential Election Winner 2028"; JD Vance Yes 20.4c / No 79.6c). Order book vs AMM: NOT FOUND on the site; the Sep 2026 press release (M) says it aggregates order books and routes to best price. Outcome tokenisation: none visible; positions sit in a Wire Markets account.

## 3. Chains and collateral

- **Chain: none published (M).** NOT FOUND (searched: wiremarkets.co home, market page, terms, safe-trading; wagerwire.com terms).
- **Collateral:** "Merchant of record, fiat and crypto" is listed as a partner service (H, wiremarkets.co home), but which assets/networks: NOT FOUND. Terms say deposits go through third-party payment providers and "may only be used with the Services provided through a designated derivatives exchange (the 'Exchange')" and the account "is NOT a CFTC-protected cleared swaps customer account" (H, Wire Markets Terms). The Exchange is unnamed.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official API | `https://docs.wagerwire.com` -> 302 `/api/v1`; HEAD returns **401 `WWW-Authenticate: Basic`**; GET returns a 3.7 KB shell titled "Introduction - WagerWire API" with no content. Contents unknown. See fixture `docs-wagerwire-com-headers.txt`. | H |
| Public docs for Wire Markets | NOT FOUND (home page lists "Market data feeds" as a partner service; no endpoint docs) | H |
| robots.txt | wagerwire.com disallows `/api/`, `/login`, `/signup`, `/embed/`; wiremarkets.co disallows `/api/`, `/admin`, `/checkout/`, `/onboard`, `/embed` | H |
| Scrapeable public pages | Wire Markets market pages and sitemap (96 market URLs in 100 locs) render quotes in HTML; WagerWire listing pages carry schema.org JSON-LD. Useful only for eyeballing. ToS bans scrapers (section 8). | H |
| Websocket | NOT FOUND | - |

Response shapes confirmed (HTML/JSON-LD, not an API): see `wiremarkets-market-page-text-excerpt.txt`, `wiremarkets-sitemap-locs.txt`, `wagerwire-listing-jsonld.json`.

## 5. Trade path

None programmatic. Account sign-up + KYC + hosted deposit; UI "Buy / Sell / Make Bid". Terms (WagerWire) forbid bots/scripts/scrapers and "a buying agent or purchasing agent"; Wire Markets terms were not found to address bots explicitly, but orders route through its account system. **PayBox reachability: no.** Reason: custodial account, no on-chain collateral or signed-order scheme published.

## 6. Fees

- WagerWire marketplace fees: NOT FOUND on the site (WebFetch of homepage found none; not stated in listing pages). Terms are the 2024 version.
- Wire Markets: "payout less applicable fees and other deductions" (H, terms) with no formula; third-party deposit/withdrawal fees are the user's. NOT FOUND otherwise.

## 7. Resolution and dispute risk

- Wire Markets market rules appear to copy Polymarket wording (H): "resolution source ... Associated Press, Fox News, and NBC ... resolves once all three call the race", inauguration-date fallback. Who adjudicates (Wire Markets vs the unnamed Exchange vs Polymarket's UMA): NOT FOUND. Dispute risk therefore includes basis risk vs the source market.
- WagerWire slips resolve per the original sportsbook's grading (M, inferred from the product).
- Wire Markets disputes: informal 90-day-ish meet-and-confer then binding arbitration (H, Wire Markets Terms section 16); WagerWire terms: ICAC (Brussels) arbitration, LA County courts (H).

## 8. Geo / ToS / automation

- WagerWire: "will only be accessible in jurisdictions where it has been approved", state-by-state, 21+ (H). Terms prohibit "any automated use of the system ... scripts ... data mining, robots" and any "buying agent or purchasing agent" (H, quoted sparingly, WagerWire `/terms`, June 2024 version).
- Wire Markets: age 18+ (21+ where required) (H, safe-trading). Country allow/deny list: NOT FOUND. Entity: Wire Markets Ltd, Gibraltar.

## 9. Liquidity

- WagerWire marketplace: 10 listings in the sitemap on 2026-10-19 (H); dollar volume NOT FOUND. Thin.
- Wire Markets: the displayed "$717.2M Volume" on the 2028 Presidential Election market equals Polymarket's own event volume `717241614.80` from Gamma on the same day (H, fixture `polymarket-gamma-comparison.json`); Wire's 20.4c Vance Yes vs Polymarket bid/ask 0.203/0.204 (H). So the numbers are Polymarket's, not Wire Markets' own. Wire's own volume: NOT FOUND.

## 10. Event overlap and shared liquidity

- Overlap: politics (2028/2026 US elections, Brazil, France), sports futures (NBA 2027, EPL/La Liga/UCL champions, NFL/MLB games), pop culture (Elon Musk tweet counts) (H, sitemap slugs). These slugs match Polymarket event slugs and Polymarket-hosted images.
- **Shares liquidity with Polymarket (M-H).** Not an independent leg. Polymarket is already covered by the parallel workflow; a Wire Markets adapter adds nothing.

## 11. Open questions

- What is in the Basic-auth `docs.wagerwire.com` (likely a partner/marketplace API)? Needs a partner credential; we have none.
- Which "designated derivatives exchange" backs Wire Markets (Polymarket US?), and is the router real-money live yet?
- Fee schedule for both products.

## 12. Sources

- https://www.wagerwire.com (WebFetch 2026-10-19), /sitemap.xml, /robots.txt, /terms, /for-sale, /for-sale/ORD_c4ae3d93-de14-4f42-a4b2-ed8c7410623a, /community/articles/fairplay-sports-media-strikes-landmark-deal-with-wire-markets-to-bring-prediction-markets-to-its (H)
- https://www.wiremarkets.co/, /robots.txt, /sitemap.xml, /terms, /safe-trading, /market/presidential-election-winner-2028 (H)
- https://docs.wagerwire.com (headers only; 401 Basic) (H)
- https://gamma-api.polymarket.com/events?slug=presidential-election-winner-2028 (H, cross-check)
- https://igamingbusiness.com/prediction-markets/esma-warning-europe-prediction-markets/ (H, 7 Jul 2026; WebFetch summary)
- GitHub search for wagerwire/wiremarkets repos: failed (HTTP 404 from the search endpoint); NOT FOUND.
