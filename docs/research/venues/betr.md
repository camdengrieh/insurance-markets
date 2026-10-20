# Betr (betr.app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public web pages only (betr.app, help.betr.app, docs.polymarket.us, covers.com), fetched with the WebFetch tool, which returns a small-model summary of each page rather than raw HTML; short quotes below are as returned by that tool. No account, no wallet, no login, no POST, no signing, no payments, no browser automation, no API probing. WebSearch budget was already exhausted at the start of this task (the one search I tried returned "budget used up"), so third-party news coverage is thin and limited to what covers.com pages said.

Confidence tags: **H** = read first-hand on a primary (Betr / Polymarket US) page this session, cited; **M** = secondary source (covers.com) or my inference from first-hand data; **L** = weak or stale.

Fixtures: none. Betr has no public or partner API, so there is nothing to sample (see section 4). The sibling `docs/research/fixtures/betr/` directory was created and removed empty.

---

## 0. Bottom line

1. **Betr is a consumer app that fronts Polymarket US; it is not an independent venue.** Every Betr Predictions price "comes from the Polymarket US order book"; contracts are listed on Polymarket US (QCX LLC, "a CFTC-designated contract market") and cleared by Polymarket Clearing (QC Clearing LLC); "Betr is not the exchange or a broker" (H, https://help.betr.app/en/articles/16704783-predictions-on-betr-how-are-prices-calculated, https://help.betr.app/en/articles/16708624-predictions-on-betr-how-are-prediction-markets-resolved). **Liquidity is shared with Polymarket US, so it is not an independent arbitrage leg.**
2. **No Betr API of any kind** is documented; the Terms prohibit scripts/bots/automated access for Picks (H), the sitemap has no developer/API page (H), robots.txt disallows API paths and blocks AI crawlers (H). Any data an aggregator wants is available straight from Polymarket US (already covered by the parallel Polymarket workflow; see docs/research/08-venues-polymarket-kalshi.md section 3).
3. **Not reachable from PayBox**: fiat funding (PayPal, cards, bank), KYC via Polymarket's verification system, US-state-restricted, no chain or wallet (H/M, section 3, 8).
4. **The Betr "Picks" product (the original betr.app business) is a DFS pick'em fantasy game, not a market**: fixed multipliers on over/under player-stat lines, no order book, no contracts (H). At most a signal source for player-prop lines; no adapter value.
5. **adapter_priority = skip.** If Polymarket US sports prices are wanted, build/use the Polymarket US adapter; Betr adds nothing except a possible distribution/volume signal.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://betr.app | HTTP 200, "(c) Betr 2026, Miami, FL"; presents Picks, Social Sportsbook, Social Casino, Arcade; **Predictions is marked "Coming Soon" on the homepage** | H |
| https://help.betr.app/en/collections/19731054-prediction-markets | Help-center collection "Prediction Markets" with 10 "Predictions on Betr" articles (what is a prediction market, prices, resolution, clarifications, limit orders, fees, trading limits, combos, sell early, ID verification). Article ids are in the 167xxxxx-168xxxxx range, newer than the Arcade (11750321) and social sportsbook (12020515) articles. Publication dates are not shown | H (existence), M (recency inference) |
| https://www.covers.com/betting/bonuses/betr-promo-code | "Last Updated Oct 16, 2026", "Verified on Oct. 19, 2026". Says Betr Predictions is "Betr's live prediction market product, powered by Polymarket", in "phased rollout to eligible users in select states" | M |
| https://www.covers.com/industry/betr-super-app-launches-with-prediction-integration-star-studded-promotion-sept-8-2026 | Betr 2.0 "super app" launched 2026-09-08; Predictions in "phased beta, not a full release"; "full release is planned for later in the football season"; states not named; no volume figures | M |
| https://www.covers.com/industry/betr-partners-with-polymarket-to-enter-prediction-market-industry-march-4-2026 | 2026-03-04 announcement of a "multi-year partnership" with Polymarket; says Betr has "1 million paying users"; Picks in 34 states, social sportsbook 32, Arcade 38 | M |
| Covers nav | Covers lists "Betr Promo Code" under its Prediction Markets menu, which is the link that triggered discovery | H (nav) |

Verdict: **still_live = true** (company and app are live; the Predictions product is in a restricted phased beta as of 2026-10-19). The betr.app homepage still says "Coming Soon" while the help center and Covers describe it as live in select states: either the homepage is stale or the rollout is gated per user. Not resolved (NOT FOUND: a dated Betr announcement of Predictions going live; searched: betr.app, help.betr.app collection, covers.com pages).

---

## 2. Kind and market model

- **Kind:** consumer front end / app-level distribution for Polymarket US (H). Betr says it "provides the app for accessing Polymarket US" (H).
- **Regulatory role discrepancy:** Covers states "through the Ascent Capital Management acquisition, Betr became a CFTC-registered introducing broker" with no date and no primary source (M, covers.com betr-promo-code page). Betr's own help articles say "Betr is not the exchange or a broker" and do not call Betr an IB (H). These are reconcilable (an IB affiliate may exist while the help text disclaims being a broker) but I could not verify the registration: NOT FOUND (searched: betr.app, help.betr.app, covers.com; NFA BASIC and CFTC registers not checked).
- **Market model (inherited from Polymarket US):** each market is a single contract; "Buying it takes the YES side. The NO side is recorded by the exchange as a short position in the same contract" (H). Contracts settle $1.00 / $0.00 (H, what-is-a-prediction-market article). Central limit order book (H). Limit and market orders both exist (H, limit-orders article). Binary only; no categorical or scalar markets mentioned (NOT FOUND in the articles read).
- **Displayed price:** midpoint of best bid and ask; if the spread widens beyond 10 cents the display switches to last trade; "The displayed price is not necessarily the price at which your order will fill" (H). An aggregator must therefore read Polymarket US bid/ask, not scrape Betr's displayed probability.
- **Combos:** 2 to 10 legs on sports winner/spread/total markets, priced by RFQ to Polymarket US market makers, separate max order size and fee curve (H, combos article). Quotes can expire or be declined after acceptance.
- **Tokenisation:** none. Positions are cleared-contract positions at Polymarket Clearing; no on-chain token (H by absence; the help articles describe no wallet or chain).
- **Categories shown in the help copy:** the "what is a prediction market" article talks only about sporting events (H); Covers says sports, politics, entertainment and other real-world outcomes (M). Betr's fee article (per Covers) mentions sports, politics, finance, geopolitical markets (M). Exact market set offered in the Betr UI: NOT FOUND (the app is not publicly browsable).
- **Picks (separate product):** "fantasy sports contests ... designed and intended to be contests of skill", entry fees, "Betr Picks Group Play", scoring via third-party data providers (H, https://betr.app/terms-and-conditions/picks, first 100k of 136k characters read). Operator "Betr Holdings, Inc.", Miami FL (H). Not an order book, not a contract, not tradable.

## 3. Chains and collateral

- **Chain: none.** USD collateral at Polymarket Clearing (H by the structure described: CFTC DCM + clearing house).
- **Funding:** Betr's Predictions deposit method is NOT FOUND in the Predictions articles read. Covers lists PayPal, Visa, Mastercard and bank transfer with a $5 minimum for the Betr Picks product and says it does not state whether these apply to Predictions (M). Betr's fee article says "Polymarket US does not charge a fee to deposit or withdraw" (H).
- **Identity:** Prediction Markets require a separate KYC "completed through Polymarket's verification system"; Betr verification "doesn't carry over" (H, https://help.betr.app/en/articles/16760672-why-do-i-need-to-verify-my-identity-for-prediction-markets).
- No crypto deposit/withdrawal path appears anywhere (H by absence).

## 4. Read API

**Official: none.**

| Surface | Result | Tag |
|---|---|---|
| Developer docs / API page | None linked from the homepage nav or footer; `https://www.betr.app/sitemap.xml` has 11 URLs and none contain "predict", "api", "developer" or "polymarket" | H |
| help.betr.app articles | None mention an API (price, resolution, fees, limits, combos, sell-early articles read) | H |
| robots.txt | General crawlers allowed on public pages but search, utility, admin, **API** and error pages disallowed; GPTBot, ChatGPT-User, CCBot, Anthropic-ai, Google-Extended, Bytespider fully blocked | H |
| picks.betr.app (login host) | Not probed (login-gated; undocumented backend) | - |
| GitHub | `gh search repos "betr picks api"` returned nothing; "betr.app" returned only unrelated repos (one named Betr/BetrApp last updated 2016) | M |

For the same price data, use Polymarket US directly: public REST `https://gateway.polymarket.us` (no key), authenticated `https://api.polymarket.us` and WebSockets, docs `https://docs.polymarket.us/` (H, per the existing project note docs/research/08-venues-polymarket-kalshi.md section 3; I re-read only the docs landing page this session, which gave no endpoint list). That is the other workflow's scope.

## 5. Trade path

**None for an agent.** Betr exposes no order API. The only route is the Betr mobile/web app after Betr + Polymarket KYC. The Picks Terms (section 20) forbid "software-assisted methods", automated access, and "scripts, bots, or other mechanisms" (H). The Prediction Markets Terms and Conditions themselves were not located (NOT FOUND: not in the sitemap; searched: betr.app sitemap, help.betr.app collection). Order flow ends up at Polymarket US, which has its own authenticated API for account holders; a Betr account does not give API keys (inference, M).

## 6. PayBox reachability

**No.** No chain, no wallet address, no contract to propose a transaction against, no signed-order scheme. Fiat funding, SSN-style KYC via Polymarket, US-state gating. A PayBox EVM/Solana wallet cannot trade this (M, from the absence of any wallet path in the help articles and the fiat/KYC structure).

## 7. Fees

All fees are Polymarket US exchange fees; none from Betr are mentioned (H, https://help.betr.app/en/articles/16727714-predictions-on-betr-trading-fees).

- Taker fee: `fee = Θ x C x p x (1 - p)`, C = contracts, p = price; Θ = 0.0695 for most markets (H, Betr fee article and https://docs.polymarket.us/fees). Table Tennis Θ = 0.10 (H, docs.polymarket.us/fees).
- Makers pay no trading fee; docs.polymarket.us/fees shows a flat maker rebate Θ = -0.0125 until 2026-10-19 13:00 ET, then volume tiers (Tier 1 none; Tiers 2-4: -0.0035, -0.0070, -0.0104); taker rebates 10-50% of taker fees by prior-month volume, moving to six tiers of 3-30% on the same date (H, docs.polymarket.us/fees). Whether a Betr-routed retail account earns these rebates: NOT FOUND.
- Combos: `Fee = C x p x [0.0695 x (1 - p) + 0.06 x (1 - p)^4]`, no maker rebate (H, docs.polymarket.us/fees).
- Fees round to the nearest cent with banker's rounding, so tiny trades or prices near 1c/99c can round to $0.00 (H). Deposits and withdrawals free (H).
- **Conflict:** Covers says "Sports markets currently carry a 0.05 taker fee rate", politics and finance 0.04, geopolitical none (M, covers.com). That does not match the first-party 0.0695 flat coefficient. Treat the Covers numbers as wrong or stale (L) and use the Polymarket US schedule.

## 8. Resolution and dispute risk

- Polymarket US, as the exchange, determines each outcome "using the sources listed in the contract terms"; resolves when the outcome is "publicly known and Polymarket US confirms it"; winners pay $1.00 (H, resolution article).
- Non-standard cases (cancelled game, tie) can settle at a value like $0.50 or a fair price set by Polymarket US that "may differ from the last traded price" (H).
- If an outcome is ambiguous or disputed Polymarket US "may use its Contract Outcome Review Process" and "Settlement may be delayed while an official result is under review"; settlement is final under the Polymarket US Rulebook (H). Rulebook: https://polymarketexchange.com/files/legal/latest/rulebook (linked by Betr, not read).
- Clarifications: Polymarket US can clarify or modify contract terms, including resolution sources, before settlement; **a clarification can cancel your open limit orders without a separate notice** (H, https://help.betr.app/en/articles/16727685-predictions-on-betr-how-are-markets-clarified). Real risk for a resting-order arbitrageur.
- Limits: Polymarket US sets a max order size per account (combos have their own max) and position accountability levels, "generally $25,000 notional" for sports contracts; Betr may add its own account limits (H, trading-limits article).
- Betr's own role in disputes: none stated beyond providing the app. (The Picks Terms give Betr "final discretion" over fantasy contest winners, which is a different product.)

## 9. Geo / ToS / automation

- Predictions are available only to "eligible users in select states" in a "phased rollout" (M, covers.com; H that the help articles never list states). The eligible-states list is NOT FOUND. Picks Terms say the state list is published in Betr's help center (H) and require US legal residency plus physical location in a "Gaming Jurisdiction", checked via IP and Wi-Fi signals (H, Picks Terms section 6.A, 10.C).
- Automation: Picks Terms prohibit automated access and bots (H). The Prediction Markets T&Cs were not found; assume the same (L).
- Restricted persons: the "what is a prediction market" article restricts "current and former players, coaches, and staff of the relevant organizations" (H).
- Age: homepage says 18+ for real-money products (H); Predictions-specific age NOT FOUND.
- Arbitration with a class waiver and a 30-day opt-out in the Picks Terms (H, not specific to Predictions).

## 10. Liquidity

- **No Betr-specific volume, OI or TVL published** (NOT FOUND; Covers explicitly reports "no volume figures", M, 2026-09-08 article).
- Betr claims 1 million paying users on its other products (M, covers.com 2026-03-04) which says nothing about prediction-market volume.
- **Liquidity is Polymarket US liquidity.** Betr users trade against the same order book as direct Polymarket US users (H, "Every price ... comes from the Polymarket US order book"). Any Betr-originated flow shows up in Polymarket US figures, not separately.

## 11. Overlap with other venues (where arbitrage lives)

- Event categories are Polymarket US's: sports (NFL, NBA etc.; winner/spread/total plus combos), politics, finance, geopolitics, entertainment, crypto (docs.polymarket.us/fees mentions crypto maker rebates) (M/H mixed). Overlap with Kalshi, Polymarket global, DraftKings Predictions, Fanatics Markets, etc. is therefore Polymarket US's overlap.
- **Shared liquidity:** Betr == Polymarket US. Do not count Betr as a separate leg. In the registry, model Betr as `routes_to: polymarket-us` with `independent_liquidity: false`.
- The Picks product publishes over/under player-stat lines that overlap sportsbook player props; they are not tradable and Betr offers no feed, so no value.

## 12. Notes for the platform registry / UI

- Treat "Betr" as a frontend alias of Polymarket US (flag: `frontend_of`, `fee_schedule: polymarket-us`, `user_can_trade_via_api: false`).
- Attribution/routing tags such as "Betr-originated volume" are not visible in any public data; do not expect them in Polymarket US feeds.
- If Betr later launches its own exchange, header/Terms would change; re-check Betr's legal pages. Fanatics Markets shows this pattern (docs/research/venues/fanatics-markets.md).

---

## Sources

1. https://betr.app - product list, Predictions "Coming Soon", footer/legal links, Miami FL (H)
2. https://betr.app/terms-and-conditions/picks - Picks Terms: Betr Holdings, Inc., fantasy contests, automation ban, geo checks, dispute process (H; first 100,000 of 136,063 characters read)
3. https://betr.app/robots.txt and https://www.betr.app/sitemap.xml - API disallowed, AI crawlers blocked, 11 URLs (H)
4. https://help.betr.app/en/ and https://help.betr.app/en/collections/19731054-prediction-markets - collection of 10 Predictions articles (H)
5. https://help.betr.app/en/articles/16704783-predictions-on-betr-how-are-prices-calculated - price source Polymarket US, entities (H)
6. https://help.betr.app/en/articles/16708624-predictions-on-betr-how-are-prediction-markets-resolved - resolution (H)
7. https://help.betr.app/en/articles/16727685-predictions-on-betr-how-are-markets-clarified - clarifications (H)
8. https://help.betr.app/en/articles/16727714-predictions-on-betr-trading-fees - fee formula (H)
9. https://help.betr.app/en/articles/16727734-predictions-on-betr-does-betr-have-trading-limits - limits (H)
10. https://help.betr.app/en/articles/16727692-predictions-on-betr-what-are-limit-orders, .../16728886-predictions-on-betr-can-i-sell-early, .../16728758-predictions-on-betr-what-are-combos, .../16701601-predictions-on-betr-what-is-a-prediction-market, .../16760672-why-do-i-need-to-verify-my-identity-for-prediction-markets (H)
11. https://docs.polymarket.us/fees and https://docs.polymarket.us - Polymarket US fee schedule, API docs landing (H)
12. https://www.covers.com/prediction-markets - discovery source; lists Betr in a Prediction Markets menu (H for nav, M for classification)
13. https://www.covers.com/betting/bonuses/betr-promo-code (Oct 16/19, 2026), https://www.covers.com/industry/betr-super-app-launches-with-prediction-integration-star-studded-promotion-sept-8-2026, https://www.covers.com/industry/betr-partners-with-polymarket-to-enter-prediction-market-industry-march-4-2026 - affiliate/trade-press, secondary (M)
14. docs/research/08-venues-polymarket-kalshi.md section 3 (project note on Polymarket US hosts and API) (H, local)

## NOT FOUND

- Betr Prediction Markets Terms and Conditions text; eligible-states list for Predictions (searched: betr.app sitemap/footer, help.betr.app collection and articles).
- Any Betr-published API, SDK, GitHub org, or developer page (searched: homepage nav/footer, sitemap, robots, gh repo search).
- Date and primary source for Betr's claimed CFTC-registered introducing-broker status and the Ascent Capital Management acquisition (searched: betr.app, help center; WebSearch unavailable).
- Betr-specific prediction volume / user counts for Predictions.
- Betr's Predictions deposit/withdrawal methods and minimums.
- Polymarket US Rulebook text (linked, not read).

## Injection / suspicious content

None observed. robots.txt blocks AI crawlers; this is a crawler policy, not an instruction to this agent, and all fetches were single user-directed page reads.
