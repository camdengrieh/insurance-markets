# Good Judgment Open (gjopen.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public gjopen.com pages, three plain unauthenticated GETs of gjopen.com (`/robots.txt`, `/`, `/sitemap.xml`) with the generic User-Agent, two attempted GETs of goodjudgment.com (403), one `gh api` read of a third-party scraper. No account, sign-up, login, cookie, API key, wallet, signature or POST/PUT/DELETE. No PayBox tool used. The web search budget ran out after the first query, so one search pass only.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary (WebFetch returns summaries, so numbers read that way carry a "via WebFetch" note), or my inference; **L** = weak or stale (older than 6 months).
Third-party text was treated as untrusted data; nothing in it was followed.
Fixtures (all <= 4 KB): `docs/research/fixtures/good-judgment-open/` (section 13). There is no public API, so no API response could be captured.

---

## 0. Verdict

- **adapter_priority: skip.** Live and active, but it is not a market and there is nothing to trade. It has no documented API, and its Terms forbid "robots, spiders" and data extraction without written permission. It is also a reputation game, so it can never be an arbitrage leg. (H)
- **Role if ever wanted: human-curated probability signal only**, like Metaculus. Unlike Metaculus (gated official API) it has no official machine path at all. The only routes are (a) a written licence from Good Judgment Inc (then it could be a signal source), or (b) the paid FutureFirst product, which a search-result summary says has a REST API (M/L, could not be verified, goodjudgment.com returned 403 to scripted fetches).
- **Not reachable through PayBox.** No chain, token, escrow or payment surface. (H)
- Revisit only if Good Judgment publishes API terms or grants a data licence. Until then the aggregator should not scrape it.

---

## 1. Still live (2026)?

Yes. (H)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.gjopen.com/` 2026-10-19 | HTTP 200, text/html, 25,389 bytes. Featured items: Boeing 2026 deliveries, US pertussis cases "as of Week 52 of 2026", Bitcoin price on 15 July 2027; challenge cards "2026 World Elections", "The Economist: The World Ahead 2026", "Artificial Intelligence in 2026 and Beyond". Asset URL carries timestamp `20261019T021549Z`. | H |
| `GET https://www.gjopen.com/sitemap.xml` | HTTP 200, 5,421 URL entries: 5,397 question pages (ids 1 to 5842) and 21 challenge pages plus index pages. No `lastmod`. | H (fixture `sitemap_stats.txt`) |
| Challenges index (WebFetch, 2026-10-19) | 20 challenges on page 1 of 2, all with future closing dates (earliest: 2026 US Midterms closes Nov 03, 2026 08:01 UTC; latest: 2027-28 Sportsball closes Feb 13, 2028). | H via WebFetch |
| Recently launched questions | Q5552 (Bitcoin 15 Jul 2027) started Jul 16, 2026; Q5610 (Fed target range at 9 Dec 2026) started Jul 31, 2026; Q5629 (Iowa Senate) started Aug 07, 2026. Highest question id 5842. | H via WebFetch / sitemap |
| New 2026-27 sponsored challenge | SCOTUSblog 2026-27 Supreme Court challenge, in collaboration with SCOTUSblog, closes Jul 03, 2027. SCOTUSblog announced its first forecast contest in a September 2026 post (URL from search results, not opened). | H (challenge page) / M (post) |
| Operator | Privacy Policy names "Good Judgment, Inc.", 100 Park Avenue, FL 16, New York, NY 10017. Footer carries a Cultivate Labs logo (platform provider; relationship not stated in the text). | H via WebFetch |

Staleness flags: the Terms of Service and Privacy Policy both say "Last updated: October 1, 2021" (older than 6 months, but they are the live versions, so they apply). Everything else above is from October 2026.

---

## 2. Kind and market model

- **Kind: forecasting-nonmoney.** A crowd-forecasting site run by Good Judgment Inc (the Tetlock/Superforecasting firm). Users enter probabilities; the site aggregates them. No trading, no order book, no AMM, no parimutuel pool, no tokens. (H: FAQ and Terms describe forecasting and Brier scoring; neither mentions money, stakes or odds.) Confirms the discovery hint "reputation-based, no real money".
- **Reward:** reputation, leaderboards, badges ("badges do not affect how we score your forecasts"), recognition by sponsors, and the pitch of "Superforecaster" status (home page links to "how to become a Superforecaster"). Some sponsored challenges name a prize (SCOTUSblog: top three "win a special prize"; the page does not say whether it is money). No cash payouts are described anywhere I read. (H via WebFetch)
- **Question types seen (H via WebFetch):**
  - Categorical with 3 answers (Fed target range: Lower / Same / Higher; Senate race: Democratic candidate / Republican candidate / Someone else).
  - Ordered range bins (Bitcoin price on 15 Jul 2027: 15 mutually exclusive USD ranges from "Less than $16,000" to "$230,000 or more").
  - Placement and numeric-style questions ("In what place will X finish", "What percentage of the vote will X win", Fed SEP median projections).
  - Historical scraper code (L, 2023) also lists binary (Yes/No), `NonExclusiveOpinionPoolQuestion` and `Forecast::MultiTimePeriodQuestion` types.
- **Outcome encoding:** each answer has a percentage; the crowd value for each answer is shown to two decimals and the answers appear to sum to 100% (Fed: 1.00 + 26.30 + 72.70 = 100; Iowa: 43 + 56 + 1 = 100). The 2023 scraper reads `answers[].normalized_probability`. There are no shares or prices. (M)
- **Crowd number:** the FAQ says the "Recent Consensus" graph is "the mean of the most recent 40% of active forecasts" (before 19 August 2022 it used the median). The question table is headed "Crowd Forecast" with 24h / week / month change columns; the FAQ does not state that the table equals the Recent Consensus. Treat as probably the same, unconfirmed. (H for the FAQ text via WebFetch; M for the equivalence)
- **No timestamp** is shown for the crowd values, and no forecaster or forecast counts appear on question pages (only on challenge cards). So staleness cannot be measured per question except via the "Change in last 24 hours" column (often 0 on thin questions). (H via WebFetch)
- **Scoring:** Brier score, 0 best / 2 worst, daily scores averaged over the question's life; rank by Relative Brier ("negative scores indicate you were more accurate than the crowd"). Not relevant to pricing. (H via WebFetch)

---

## 3. Chains and collateral

None. NOT FOUND (searched: home page, FAQ, Terms, Privacy, challenge pages, sitemap URLs, robots.txt) any mention of a chain, token, wallet, deposit, withdrawal or collateral. Sign-up is email + username + password (Privacy Policy 1A). (H via WebFetch)

---

## 4. Read API

- **Official API: none found.** NOT FOUND (searched: home page links and scripts, FAQ ("API, data access, or export: not mentioned" apart from a "Data Management" account-deletion page), Terms ("No API terms appear"), Privacy ("The page doesn't mention an API"), `/sitemap.xml` URL list, robots.txt, WebSearch extended). The only `api/` string in the home page HTML is a third-party support-widget loader (`widget.cluster.groovehq.com/api/loader`), not a GJ Open data endpoint. (H)
- **Third-party evidence there is no API (M/L):** a 2026 review site marks API access as unavailable (ChainPick page "last updated July 2026", M). A 2024 academic paper cited by the search summary said GJ Open data "are gathered via web scraping, since no API provides the full data we need" (L, not opened). The Metaforecast scraper (`apps/metaforecast`, file `goodjudgmentopen.ts`, last touched 2023-06-26, L) scraped HTML list pages `https://www.gjopen.com/questions?page=N` with a **logged-in session cookie** and parsed the embedded `data-react-props` JSON on `<question-url>/stats` pages (fields `question.name`, `description`, `answers[].normalized_probability`, `predictors_count`, `prediction_sets_count`, `comments_count`, `type`); it threw "Not logged in" when the page showed "Sign up or sign in to forecast". The Metaforecast project was shut down on 2026-07-09 (see `docs/research/venues/metaforecast.md`), so that scraper is also dead. This is code I read, not something I ran.
- **Public HTML:** question pages show crowd percentages to anonymous visitors (WebFetch of three pages, 2026-10-19, M: summaries). The forecast interface is locked behind sign-in. Reading those pages programmatically is what the Terms prohibit (section 8).
- **Websocket / streaming / RSS / webhooks:** NOT FOUND (same searches).
- **Rate limits:** NOT FOUND.
- **Related commercial product (M/L):** Good Judgment's subscription product **FutureFirst** (Superforecaster panel on selected questions). A search-result summary says it exposes a REST API (questions, forecasts, forecast distributions; JSON or CSV) and that the 2024 annual review mentions API access in channels. I could not open goodjudgment.com (HTTP 403 to both scripted GET and WebFetch, fixture `goodjudgment_com_403.txt`), so base URLs, auth, pricing and terms are NOT VERIFIED. FutureFirst is a separate paid product from GJ Open; it is not "the GJ Open API".
- **Honouring robots.txt:** `User-agent: *` allows `/` with `Content-Signal: search=yes, ai-input=yes, ai-train=no`; ClaudeBot, GPTBot, CCBot, Bytespider, Amazonbot, meta-externalagent, Applebot-Extended and Google-Extended are disallowed (H, fixture `robots.txt`). So even permitted retrieval is "live answers, not model training". I did not crawl; total gjopen.com requests by script were three.

---

## 5. Trade path

None. There is nothing to place, cancel or settle. Entering a forecast is a signed-in browser action (email + password session) that records a probability for reputation scoring; no API, no order object, no signing scheme. (H via WebFetch)

**Reachable through PayBox? No.** No wallet address, chain, contract, escrow or payment rail exists, so there is no transaction proposal or signed order for any EVM or Solana wallet to make. A bot that auto-submitted forecasts would not use PayBox and would likely breach the "robots" clause (section 8).

---

## 6. Fees

None. Free to join and forecast (M: ChainPick "Free to participate"; H: no fee mentioned anywhere in FAQ or Terms). No trading fees because there is no trading. Sponsored challenges are paid for by sponsors, terms not published. Good Judgment's consulting and FutureFirst subscriptions are separate paid products, prices NOT FOUND. Any commercial data licence is a "written license from GJ" with no published price (Terms 7B). (H via WebFetch for the Terms quote)

---

## 7. Resolution and dispute risk

- **Mechanism (H via WebFetch, FAQ):** "Unless specified otherwise", outcomes are decided using "credible, open-source evidence and media reporting (e.g., Reuters, BBC, AP)". Some questions name a source (Bitcoin question: Coinbase price as reported by FRED series CBBTCUSD; Senate question: "the name of the person printed on the ballot who ultimately wins"). Questions close when the event occurs, not when it is reported. **GJ Open "reserves final resolution authority".**
- **Dispute process:** NOT FOUND (searched: FAQ, Terms). No bond, vote or oracle. Resolution is by site staff, final.
- **Risk to an aggregator:** because nothing is staked, nobody is harmed by an odd resolution, so GJ Open staff have little pressure to match how a market's rules read. Wording differs from venue contracts (for example, "upper limit of the Fed target range at close of business on date X vs. date Y" is a relative three-way question, not a market's "cut / hold / hike at the meeting" contract). Every cross-venue link would need a human or model-checked match. Question text can be changed or clarified by staff. (M: inferred from the examples read and Metaculus precedent)

---

## 8. Geo, ToS and automation

Quotes are from the live Terms of Service (page text says "Last updated: October 1, 2021", read via WebFetch, H):

- **Automation (7A):** the content licence excludes "any use of data mining, robots, spiders, or similar data gathering and extraction tools" unless GJ permits it in writing. 7B exempts only "general purpose internet search engines and non-commercial public archives" for hyperlinks, and not caching.
- **Reproduction (8A):** requires "the express written consent of GJ". **Commercial use (7B):** "you must first obtain a written license from GJ". Content is "provided for discussion and entertainment purposes only" (4C).
- **Eligibility (2):** users must be 18 or older and able to form a binding contract. No geographic restriction stated. Personal data is processed in the United States (9).
- **One account per person:** not addressed. **AI agents:** no AI-specific terms; the "robots" clause is the closest. Bots/scripted submissions: not mentioned in the FAQ either.
- **Privacy Policy** (last updated October 1, 2021): collects username, email, optional name/affiliation/location, IP and geolocation; may share personal information such as an email address with sponsors of challenges (section 2C).
- **Consequence for this project:** do not scrape gjopen.com or log in with a script. Do not republish crowd forecasts. A signal feed needs a written licence from Good Judgment Inc first.

---

## 9. Liquidity

There is no money, so no volume, open interest or TVL (H). The only size measures are participation counts on the challenges index, as displayed 2026-10-19 (H via WebFetch; counts are cumulative per challenge, not additive across challenges because users overlap):

| Challenge | Active questions | Forecasters | Forecasts |
|---|---|---|---|
| In the News 2026 (closes Jan 01, 2027) | 356 | 3,409 | 129,629 |
| In the News 2027 (closes Jan 01, 2028) | 248 | 895 | 10,198 |
| Foxes Ask (closes Jan 02, 2027) | 62 | 11,360 | 188,102 |
| Superforecasting Workshops (closes Jan 03, 2027) | 16 | 8,361 | 109,939 |
| Global Armed Conflict in 2026 | 31 | 1,749 | 24,607 |
| 2026 World Elections | 19 | 1,116 | 10,170 |
| 2026 US Midterms (closes Nov 03, 2026) | 67 | 668 | 7,792 |
| A Challenge of Interest! (interest rates) | 23 | 269 | 7,776 |
| Iran & Energy | 26 | 608 | 11,535 |
| AI in 2026 and Beyond | 32 | 730 | 7,976 |
| SCOTUSblog 2026-27 | 12 | 113 | 765 |

So a typical hot question has hundreds to low thousands of forecasts; a niche question may have a few dozen. Crowd values on thin questions can sit unchanged for days (Fed question: 0% change in 24h). The site as a whole has 5,397 indexed question pages (ids to 5842). Source dates: challenges page 2026-10-19; sitemap 2026-10-19.

---

## 10. Event-category overlap (where a signal could be compared to markets)

Crowd values here are probabilities, not tradable prices. The overlap below is where a probability could be compared with a market price as a sanity or signal check, never as an executable edge:

- **US politics:** 2026 midterms (Senate races for Kansas, Florida, Iowa, Texas, South Carolina primary, Maine nominee replacement, ballot measures, California governor vote share), 2028 nomination announcement questions ("before 18 September 2027 will X announce..."), presidential approval via a Nate Silver aggregate. Overlaps Polymarket and Kalshi politics markets.
- **Macro:** Fed target range after FOMC dates (Q5474, Q5610), Fed SEP median projections for 2027 (GDP, unemployment, PCE, fed funds), purchasing managers' indices, AAA gas prices. Overlaps Kalshi and Polymarket Fed and macro markets, but contract wording differs.
- **Crypto price:** BTC and ETH price bins for 15 July 2027 (Q5552, Q5553). Long-dated; overlaps price-ladder markets only loosely.
- **Sports and culture:** "Sportsball" challenge (2026-27, 2027-28), awards ("Red Carpet"), FIFA presidency. Thin overlap with sportsbook-style markets.
- **Geopolitics and other:** Putin ceasing to be president, armed conflict, Iran and energy, AI developments, SCOTUS cases, French 2027 presidential first-round placings. Some overlap with political markets.

Observed example values (via WebFetch, 2026-10-19, M; fixture `observed_crowd_forecasts_2026-10-19.json`): Fed target range at 9 Dec 2026 vs 28 Oct 2026: Lower 1.00%, Same 26.30%, Higher 72.70%. Iowa Senate 2026: Democratic 43.00%, Republican 56.00%, Someone else 1.00%. I did not compare these with live market prices (out of scope; those venues are covered elsewhere).

---

## 11. Shared liquidity

None, because there is no liquidity. GJ Open is not an independent arbitrage leg and does not share liquidity with another venue. The only relationship to other venues is informational: forecasts may correlate with market prices; Good Judgment Inc also runs the commercial Superforecaster products (FutureFirst), which are a separate paid channel. (H/M)

---

## 12. Adapter priority

**skip.** Reasons: not a market (no price, book or settlement), no official API or documented data access, ToS prohibits automated extraction and commercial reuse without a written licence, robots.txt discourages AI crawlers, crowd numbers carry no timestamp or counts, and resolution rules do not map one-to-one to market contracts. Observed value: a human could consult it manually as a second opinion on US politics and Fed questions.

If a licence or the FutureFirst API ever becomes available, model it as `kind: signal` (no order book, no PayBox path) with fields: `question_id`, `name`, `type`, `closes_at`, `answers[{name, probability}]`, `fetched_at`, `challenge`, `resolution_text`. Link to market contracts with the same human-checked mapping used for Quotient and Metaculus.

---

## 13. Fixtures (`docs/research/fixtures/good-judgment-open/`)

| File | What | Tag |
|---|---|---|
| `robots.txt` | Raw GET of `https://www.gjopen.com/robots.txt`, 2026-10-19, HTTP 200 (440 bytes). AI-crawler policy. | H |
| `sitemap_stats.txt` | Counts, id range, challenge URLs and a few question slugs derived from the raw 1.2 MB sitemap (not stored). | H |
| `observed_crowd_forecasts_2026-10-19.json` | Three questions' answer tables as transcribed from WebFetch summaries. Not a raw payload. | M |
| `goodjudgment_com_403.txt` | Records the HTTP 403 for goodjudgment.com product pages. | H |

No real API response was captured because no API exists and no sign-in was made.

---

## 14. NOT FOUND

- Any official API, developer docs, rate limits or websocket (searched: home page, FAQ, Terms, Privacy, sitemap, robots.txt, WebSearch extended).
- Any chain, contract, token or wallet integration.
- Any dispute or appeal process for resolutions.
- Number of forecasters or forecasts per question on the public question pages; a timestamp for crowd values.
- Prize amounts for sponsored challenges (SCOTUSblog "special prize", The Economist publication) and whether any are cash.
- FutureFirst API base URL, auth, rate limits, price and terms (goodjudgment.com blocked scripted access, HTTP 403).
- Whether the question-page "Crowd Forecast" equals the FAQ's "Recent Consensus" (mean of the most recent 40% of active forecasts).
- Whether Cultivate Labs operates, hosts or merely licenses the platform (footer logo only; the Privacy Policy names only Good Judgment Inc).
- A page-2 listing of challenges beyond the first 20.

---

## Sources

1. https://www.gjopen.com/ (GET 2026-10-19, H)
2. https://www.gjopen.com/robots.txt (GET 2026-10-19, H)
3. https://www.gjopen.com/sitemap.xml (GET 2026-10-19, H)
4. https://www.gjopen.com/faq (WebFetch 2026-10-19, H via summary)
5. https://www.gjopen.com/terms (WebFetch 2026-10-19, H via summary; page dated October 1, 2021)
6. https://www.gjopen.com/privacy (WebFetch 2026-10-19, H via summary; page dated October 1, 2021)
7. https://www.gjopen.com/challenges (WebFetch 2026-10-19, H via summary)
8. https://www.gjopen.com/challenges/134-2026-us-midterms-challenge (WebFetch 2026-10-19, H via summary)
9. https://www.gjopen.com/challenges/146-scotusblog-2026-27-supreme-court-prediction-challenge (WebFetch 2026-10-19, H via summary)
10. https://www.gjopen.com/questions/5552-what-will-be-the-price-of-bitcoin-on-15-july-2027 (WebFetch, H via summary)
11. https://www.gjopen.com/questions/5610-at-close-of-business-on-9-december-2026-will-the-upper-limit-of-the-federal-reserve-s-target-range-for-the-federal-funds-rate-be-lower-the-same-or-higher-than-it-was-at-close-of-business-on-28-october-2026 (WebFetch, H via summary)
12. https://www.gjopen.com/questions/5629-who-will-win-the-us-senate-election-for-iowa-in-2026 (WebFetch, H via summary)
13. https://www.chainpick.io/prediction-markets/good-judgment-open (WebFetch 2026-10-19, M; review page dated July 2026)
14. WebSearch results 2026-10-19 (M): https://www.gjopen.com/challenges/130-the-economist-the-world-ahead-2026 , https://www.scotusblog.com/2026/09/announcing-our-first-scotus-forecast-contest/ , https://goodjudgment.com/services/futurefirst/ (blocked, 403) , https://goodjudgment.com/good-judgment-2024-in-review/ (blocked, 403)
15. https://github.com/quantified-uncertainty/metaforecast (archived; file `src/backend/platforms/goodjudgmentopen.ts`, last commit 2023-06-26, read via `gh api` raw, L) and `docs/research/venues/metaforecast.md` (Metaforecast shutdown 2026-07-09)
16. `docs/research/venues/metaculus.md` (comparison for the signal-only role)
