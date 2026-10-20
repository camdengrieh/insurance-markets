# Noly Market (nolymarket.com) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: official site pages read via WebFetch, the operator's public GitHub repo read via `gh api` (no clone, no install), 6 unauthenticated GETs to `nolymarket.com` / `www.nolymarket.com` with the generic User-Agent `insurance-markets-research/0.1`. No account, no Google login, no API key, no wallet, no signing, no POST/PUT/DELETE, no PayBox tool used. I did NOT query the site's Supabase backend (see section 4). Third-party text treated as untrusted data.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred from first-hand data; **L** = weak or stale.

Limitation: the shared WebSearch budget was exhausted before I could run any search (the one attempt returned "budget used up"), so there is no independent third-party corroboration (press, regulator, social). Everything below rests on the operator's own site and repo.

---

## 0. Bottom line

1. **Noly Market is a Turkish-language play-money prediction game, not a venue with real-money liquidity.** All trading is in "TP" (Noly Point / "Tahmin Puani"), which the Terms say "is not a real currency and cannot be converted to cash". The Terms also say "Noly Market is not a gambling or betting platform." (H, nolymarket.com/terms, nolymarket.com/docs)
2. **The advertised public API does not work.** The `/api-docs` page documents `GET /api/v1/markets` (public, 60 req/min). Live on 2026-10-19 that path returns HTTP 404 on both the apex (307 to www) and `www.nolymarket.com`; the operator's repo has no `src/app/api/` route at all; and `robots.txt` says `Disallow: /api/`. (H, curl + repo tree)
3. **No active markets visible.** The live home page renders "Piyasa Bulunamadi" (No Market Found) and the sitemap contains no `/market/<slug>` entries, only 11 static/category URLs. Cause is unconfirmed: either zero active markets or the backend read is failing (the repo's `getMarkets` swallows errors and returns `[]`). (H for what is rendered, M for cause)
4. **No chain, no wallet, no collateral.** Login is Google-only (Supabase Auth); trades are Supabase RPC calls (`place_prediction`) debiting an off-chain integer balance. A PayBox/EVM wallet cannot interact with it in any way. (H, repo source + Terms)
5. **adapter_priority = skip.** Play-money (prices are not tradable edge), its only "API" 404s, the one visible price source (the HTML site) is behind a robots disallow for `/api/` and shows no markets, and the question set is Turkey-local. The only residual value is as a curiosity "sentiment" signal, and there is nothing to read today.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://nolymarket.com/` (WebFetch) | Renders; title "Noly Market - Turkiye'nin Ilk ve En Buyuk Tahmin Pazari" ("Turkey's first and largest prediction market"); footer label "Sistem Aktif" (System Active) | H |
| `GET https://www.nolymarket.com/` | HTTP 200, 84,575 bytes, `lang="tr"`, hosted on Vercel, Next.js | H |
| Home feed | "Piyasa Bulunamadi" (No market found) in the "Tum Piyasalar" view | H |
| `https://nolymarket.com/sitemap.xml` | 200; `lastmod` = request time (dynamic); 11 URLs: home, `/leaderboard`, `/rewards`, `/help`, `/accuracy`, `/terms`, five `/category/<siyaset\|spor\|ekonomi\|kripto\|teknoloji>`; **zero `/market/<slug>` URLs**. The repo's `sitemap.ts` appends every `status = 'active'` market, so none were returned | H |
| Terms page | "last updated 26 March 2026" | H (WebFetch summary) |
| GitHub `ersozberk/noly-market` | created 2026-02-14, last push 2026-04-28 (README edit), 1 star, 1 fork, MIT-licensed per README but `license: null` in the GitHub API, not archived; last code commits 2026-03-26 | H |
| Operator | Page metadata and Contact page name "Noly Teknoloji A.S." (Izmir, Turkiye). No registration number, no regulator, no licence anywhere | H |

**still_live = true as a website, but effectively dormant as a market venue** (no visible active markets, repo inactive since April 2026). The site has been up on the date of research; I could not tell whether it ever had substantial users (see "liquidity").

Stale / unreliable claims on the site itself: "2.4M+ TP volume", "5.2K+ active predictors" and "84% accuracy" are **hard-coded literals** in the repo's `src/app/page.tsx` and `src/app/accuracy/page.tsx`, not computed from data. Treat as marketing copy. (H)

---

## 2. Kind and market model

- **kind: other (play-money prediction game / gamified poll).** Off-chain, centrally run, no real-money settlement. (H)
- **Market types in code:** `market_type` is `binary` (EVET/YES, HAYIR/NO) or multi-option (`market_options` rows with `name`, `color`, `probability`). So binary and categorical exist; no scalar. (H, repo `prediction-panel.tsx`, `market-actions.ts`)
- **Mechanism: NOT DOCUMENTED / NOT FOUND.** The `/docs` page says only that odds "change in real time based on other users' trades" and that winners "share all the TP collected in the pool in proportion to their odds" (a parimutuel-sounding description, M). The `/accuracy` page says an "OPY (Otomatik Piyasa Yapici)" algorithm, i.e. an automated market maker, drives prices, which conflicts with the pool description. The SQL (`place_prediction` function, `prices` table and triggers) is not in the public repo ("create the tables in the Supabase SQL Editor"). So the AMM-vs-parimutuel question stays open. (searched: /docs, /accuracy, README, repo tree, `market-actions.ts`, `prediction-panel.tsx`)
- **Tokenisation:** none. Positions are rows in a `predictions` table (`user_id`, `market_id`, `amount_tp`, side or option id). No transferable tokens. (H for the table name, from `rewards/page.tsx` queries)
- **Stake input:** integer TP only (decimals stripped client-side), `Math.floor(amount)`. (H)

---

## 3. Chains and collateral

None. Collateral is TP, an integer `tp_balance` on the `profiles` table. TP is earned by quests (first prediction +500, first comment +150, profile +300, bookmark +100, first win +1000, stake >= 1000 TP +1500) and winnings; Terms say it cannot be turned into cash. The rewards page source lists cosmetic/merch redemptions (avatar frame 50,000 TP, badge 150,000 TP, T-shirt 500,000 TP, a "request a market" right 1,000,000 TP); the live /rewards fetch showed only the earning side. (H terms + repo; M for live catalogue)

---

## 4. Read API

- **exists: `none` (documented but not served).** Classification: official-public on paper, none in practice.
- **Docs:** https://nolymarket.com/api-docs (page text: "API Durumu: Aktif", `v1.0.0`). (H)
- **Documented endpoint:** `GET /api/v1/markets` returning `{status:"success", data:[{id, slug, question, type:"binary", probabilities:{yes,no}, volume_tp}]}`. Base URL is not stated on the page (relative to the site). Auth: "currently public"; rate limit "60 requests per minute", "for higher limits create an API Key from your profile page". No other endpoints, no pagination/filter/error docs, no websocket. (H)
- **Reality check (2026-10-19):**
  - `GET https://nolymarket.com/api/v1/markets` -> 307 to `https://www.nolymarket.com/api/v1/markets` -> **404** HTML (Next.js `/_not-found`). Same 404 for `/api/markets`, `/api/v1`, `/api/health`. (H)
  - The repo has no `src/app/api/...` directory (only `src/app/auth/callback/route.ts` is a route handler) so the endpoint was never implemented in the open-source tree. (H, full tree listing)
  - `robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Disallow: /_next/`. (H)
- **Real data path:** the app reads Postgres tables via Supabase (`markets` joined to `market_options`, `prices`, `predictions`, `profiles`) using a browser-exposed anon key and RLS, per the README (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). A third party could in principle hit the Supabase PostgREST endpoint with that public anon key, but that is not a documented or sanctioned API, would require lifting a key out of the client bundle, and I did not do it. (H for the architecture, not tested)
- **Fixtures:** nothing real to save. Saved under `docs/research/fixtures/noly-market/`: `robots.txt`, `sitemap.xml`, `api-v1-markets-404.headers.txt` (the 404 evidence), and `api-docs-example-response.DOC-EXAMPLE-NOT-LIVE.json` (the documented example only; clearly labelled as not a live response).

---

## 5. Trade path

None usable. Trading is `supabase.rpc('place_prediction', {p_market_id, p_user_id, p_amount_tp, p_market_type, p_side, p_option_id})` from a logged-in browser session, authenticated by a Supabase session obtained through Google OAuth. No order book, no signed orders, no API trading endpoint, no API-key trading (the API key mentioned on `/api-docs` is described only for raising read limits). (H, repo `prediction-panel.tsx`, `auth-actions.ts` listing, Terms "Google account required")

**PayBox / EVM reachability: no.** There is no chain, no contract, no transaction proposal and no signed-order flow. TP cannot be bought with crypto or fiat per the Terms. The only login is a Google account, which a PayBox wallet cannot provide. (H)

---

## 6. Fees

NOT FOUND (searched: /docs, /terms, /accuracy, /rewards, README). No fee schedule is published and, being play-money, none would be economically meaningful. (H that it is absent)

---

## 7. Resolution mechanism and dispute risk

- Admin-resolved. "/docs": results are "approved transparently by platform management" using reliable news sources, official federations (e.g. TFF) and official government statements. Terms: admins resolve from "reliable and independent news sources"; if disputed, management "reserves the right to cancel the market and refund all deposited TP". (H)
- The repo has `src/actions/admin-actions.ts` and an `/admin` page, consistent with a single operator resolving by hand. No oracle, no dispute bond, no appeal process. (H for files, M for interpretation)
- Market states seen in code: `active`, `resolved`, and a cancelled/void state (UI text "Piyasa Iptal Edildi"). (H)
- Dispute risk: high (single discretionary operator), but irrelevant for arbitrage because there is no real money.

---

## 8. Geo / ToS / automation

- Terms (last updated 2026-03-26): no age limit, no geographic restriction, no bot/scraping/API rule found. The only anti-abuse clause is a ban on multiple fake accounts to manipulate TP balance. (H, WebFetch of /terms; absence of a rule is "NOT FOUND (searched: /terms, /privacy not read in full)")
- `robots.txt` disallows `/api/`. (H)
- Regulatory: "Noly Market is not a gambling or betting platform ... exists solely for entertainment and measuring the wisdom of crowds." No licence number, regulator or legal-entity registration disclosed beyond the name "Noly Teknoloji A.S." (H)
- Interesting adjacent risk: Turkey restricts online betting; the play-money, no-cash-out design is the evident reason the Terms insist it is not gambling. Not researched further. (M)

---

## 9. Liquidity

- Only figure: "2.4M+ TP" volume (home page) / "2.4M" TP volume and "5.2K+ active predictors" (accuracy page). Both are **hard-coded strings in the repo**, not live statistics (H). TP has no monetary value, so this is not USD liquidity. Date: undated (static copy, repo as of 2026-03/04).
- Live check 2026-10-19: no active markets rendered (H).
- API example uses `volume_tp: 1450000` for one market; that is a documentation example only (H).

**Liquidity shared with another venue: no.** It is a standalone off-chain game. Its Turkish questions are not backed by any other venue's liquidity.

---

## 10. Event coverage and overlap

Categories named on the site: siyaset (politics/elections), ekonomi/finans, spor (Super Lig, TFF), savunma, kripto, teknoloji/AI, otomotiv (e.g. "Togg Yeni Model"), emlak, egitim, turizm, eglence, bilim/uzay, dunya. Sitemap category pages: siyaset, spor, ekonomi, kripto, teknoloji. (H)

Overlap with other venues is small and of no use: Turkish central-bank rate decisions, Super Lig results and Turkish politics could share underlying events with Polymarket/Kalshi global markets, but there is no real-money price here to arbitrage against, and no live markets to read. (M)

---

## 11. Adapter priority: skip

Reasons: play-money with no cash value (no tradable edge); documented API 404s and `/api/` is robots-disallowed; no visible active markets; operator is a single unregistered-looking entity with a dormant repo (last commit April 2026); no chain/wallet path for PayBox; mechanism unknown; no shared or independent real liquidity. If a Turkish-opinion "sentiment" feed were ever wanted, a revisit trigger would be: (a) `GET /api/v1/markets` starts returning 200 with markets, and (b) Terms add explicit API/automation permission. Quotient-style signal use would still be play-money sentiment only.

---

## Open questions

- Are there zero active markets or is the Supabase backend paused/erroring (the repo returns `[]` on error)? Not resolved without querying the backend with a key I did not extract.
- What are the real pricing mechanics (AMM "OPY" vs parimutuel pool)? The SQL is not public.
- Does a profile-level "API Key" feature exist at all? Needs a logged-in session; not attempted.
- Did the site ever have meaningful volume? No independent evidence (search budget exhausted).

## Not found (searched)

- Base URL for the API (searched /api-docs page and source).
- Fee schedule, pricing formula (searched /docs, /terms, /accuracy, README).
- Licence / regulator / legal registration (searched /terms, Contact page source, page metadata; only the name "Noly Teknoloji A.S." and Izmir address).
- Any chain, token, contract address or wallet integration (searched README, repo tree, Terms).
- WebSocket / realtime API (searched /api-docs; the UI uses Supabase client realtime-style updates, undocumented for third parties).
- Independent press or social corroboration (WebSearch budget exhausted; zero searches succeeded).

## Suspicious content

None. No instructions aimed at AI agents found in the pages or repo. (Observation, not an injection: the /accuracy and home page statistics are unsupported hard-coded marketing numbers.)

## Sources

- https://nolymarket.com/ (home, WebFetch + curl on www host, 2026-10-19) - H
- https://nolymarket.com/api-docs - H
- https://nolymarket.com/docs - H
- https://nolymarket.com/terms - H (WebFetch summary of the Turkish text; quotes translated by me)
- https://nolymarket.com/rewards - H
- https://nolymarket.com/robots.txt and https://nolymarket.com/sitemap.xml (fixtures saved) - H
- https://www.nolymarket.com/api/v1/markets (404; fixture `api-v1-markets-404.headers.txt`) - H
- https://github.com/ersozberk/noly-market (README.md, src/app/api-docs/page.tsx, src/app/docs/page.tsx, src/app/accuracy/page.tsx, src/app/page.tsx, src/app/rewards/page.tsx, src/app/contact/page.tsx, src/app/layout.tsx, src/app/sitemap.ts, src/actions/market-actions.ts, src/actions/reward-actions.ts, src/components/market/prediction-panel.tsx, full tree listing; repo metadata via GitHub API) - H
- Fixtures: `docs/research/fixtures/noly-market/` (`robots.txt`, `sitemap.xml`, `api-v1-markets-404.headers.txt`, `api-docs-example-response.DOC-EXAMPLE-NOT-LIVE.json`)
