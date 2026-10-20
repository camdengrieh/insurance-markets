# Mite.market (Telegram mini-app on TON, trades Polymarket) - adapter spec

Researched 2026-10-19. READ-ONLY: WebFetch page reads, unauthenticated GETs to `mite.market` (home page and its three legal pages), `t.me/mite`, `t.me/mite_admin`, `t.me/s/mite_market`, `data-api.polymarket.com` (v2), `docs.polymarket.com`, `docs.turnkey.com`, `rdap.org` (domain registry record), `api.coingecko.com` (symbol lookup), `docs.ston.fi`, and two read-only PayBox `discover_tokens mode=chains` calls. Generic User-Agent `insurance-markets-research/0.1`. The session web-search budget was already used up when I started (my one WebSearch was refused), so there was no news or social search: anything that only a search would reveal is NOT FOUND. No account, wallet, Telegram login, key, signature, POST/PUT/DELETE, browser automation, or third-party code cloned or run. I did not open the Telegram mini-app (it needs a Telegram session and a TON wallet).

Tags: **H** = read first-hand this session in a primary source (cited; "via fetch summary" means a small-model summary of the page); **M** = secondary or my inference from first-hand data; **L** = weak or stale (older than 6 months). Nothing here is older than 6 months except where noted.

Fixtures (3 files, largest 48 KB): `docs/research/fixtures/mite-market/` (section 12).

---

## 0. Verdict

**adapter_priority: skip** as a venue or arbitrage leg. Keep a registry record only (section 13).

1. **Live, but a front end, not a venue.** A Telegram mini-app plus TON wallet wrapper around Polymarket. The site says it plainly: "Your orders land in Polymarket's live orderbook. Same markets, same fills as trading on Polymarket directly" and "Polymarket - Liquidity" (H, https://mite.market).
2. **Not an independent leg.** 100% shared with Polymarket International: its orders carry a Polymarket builder code and match on Polymarket's own CLOB (H for the builder entry, section 2).
3. **No API of its own.** No docs host, SDK, OpenAPI, WebSocket or developer terms (NOT FOUND, section 4). The Terms ban "bots or automated means except as expressly permitted" and nothing is permitted publicly.
4. **Tiny and fading.** Polymarket's builder board attributes 202,608 shares and 340 distinct users to it since May 2026, but only 9,697 shares in the last 30 complete days (0.0014% of all builders' volume; section 9). A share is worth at most $1, so this is at most about $0.2M of both-sided notional in 5 months.
5. **Not reachable from PayBox**: Telegram mini-app with a TON wallet; TON is not in PayBox's 11-chain catalogue (H, live check, section 3). The underlying exposure (Polymarket on Polygon) is the Polymarket adapter's job.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://mite.market` (2026-10-19) | HTTP 200, `last-modified: Mon, 17 Aug 2026 19:55:45 GMT`, server Caddy; title "Mite - Trade Polymarket, natively on TON"; one "Launch App" link to `https://t.me/mite` | H |
| Legal pages `terms.html`, `eula.html`, `privacy.html` | HTTP 200, each "Last updated: 17 August 2026" | H |
| Telegram public preview `https://t.me/mite` | Bot "Mite Market", description "Trade Polymarket Natively on TON with Non-custodial Wallet", "Start Bot". No user count shown | H |
| Domain registry record (RDAP, via rdap.org) | `mite.market` registered 2026-05-26, expires 2027-05-26, last changed 2026-08-12; nameservers `*.njalla.*` (a privacy-focused registrar/DNS), so the owner is not public | H |
| Polymarket builder board, builder "Mite.market" (`data-api.polymarket.com/v2/builders/volume`) | Attributed volume rows on 86 of the 90 days 2026-07-22 .. 2026-10-19; latest full day 2026-10-18: 1,279 shares, 12 distinct users | H |

**still_live = true** (site up, bot page up, orders still attributed on 2026-10-18), with volume near zero. The mini-app itself was not opened, so "the app works end to end" is M, inferred from the attributed orders.

Timing note (M): the first attributed volume is the week of 2026-05-17 (28 shares, 2 users), about nine days before the domain was registered (2026-05-26). That fits test orders placed before the site launched; the display name "Mite.market" may have been set later.

---

## 2. Kind and market model

- **Kind:** broker / front end (Telegram Mini App). Own words: "a non-custodial liquidity provider between the TON blockchain and Polymarket" (footer) and "Mite runs as a Mini App inside Telegram" (H, https://mite.market). The Terms add that Mite is "not a broker, dealer, exchange ... custodian" and is "a Telegram-native interface" to "prediction markets operated by independent third parties" (H, https://mite.market/terms.html).
- **Identity check (how I tied it to Polymarket)** (H for each observation, M for the conclusion):
  - Polymarket's builder leaderboard lists a **verified** builder named exactly **"Mite.market"**, builder code `0x508535af39a9b8cdc4ed6de87c25f6ff846a24f342fe818797a15c30ff0c8b4e`, all-time rank 241 of 592 builders (fixture 1).
  - The builder's profile image URL is its own upload; I did not compare it with Mite's logo. The name match is exact, the activity starts in May 2026 (the month the domain was registered), and the site says it trades on Polymarket. No Mite page states its builder code. So: strong but circumstantial (M, strong).
  - `verified: true` on the Data API row; Polymarket's tiers page says the Verified tier requires manual review after an application (H, https://docs.polymarket.com/programs/builders/tiers.md, via fetch summary). I take the flag to mean the Verified tier (M); it implies Polymarket knows who operates it.
- **Market scope:** "Same markets ... as trading on Polymarket directly." Whether the app shows all Polymarket markets or a subset is NOT FOUND (needs the mini-app).
- **Market model (inherited from Polymarket, M):** binary Yes/No conditional-token shares on a CLOB; multi-outcome events are neg-risk groups. Not re-verified here; see the Polymarket spec.
- **Tokenisation (inherited, M):** Polymarket outcome tokens on Polygon, held by a Polygon trading wallet that Mite provisions per user. The user holds nothing on TON except the funding coin.
- **"Intelligence layer":** "autonomous AI agents read live market activity and turn it into clear signal ... The agents don't trade for you and never touch your funds." (H, home page). No API, feed, or public output is documented (NOT FOUND). Not usable as a signal source.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| User-facing chain | TON, via a TON wallet connected inside Telegram | H (home page) |
| Funding asset | "GRAM converts straight from your wallet into a Polygon stablecoin when you open or close a position" | H (home page) |
| What GRAM is | CoinGecko's search API returns `the-open-network`, name "Gram (prev. Toncoin)", symbol GRAM, market-cap rank 31 on 2026-10-19: GRAM is the renamed Toncoin | H (fixture 3) |
| Conversion route, bridge, and which Polygon stablecoin | NOT FOUND (searched: home page, Terms, EULA, Privacy, `docs.ston.fi` front page, which does not mention Mite, GRAM or Polymarket). No evidence it uses STON.fi Omniston, as the sibling "Predict with Polymarket" app does | |
| Trading venue chain and collateral | Polygon (137); collateral is pUSD at `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` (Polymarket docs). Polymarket's own bridge lists Ethereum, Polygon, Arbitrum, Base, Optimism, BNB, Solana, Bitcoin, Tron, HyperEVM and others as deposit sources; **TON is not among them** (H, https://docs.polymarket.com/trading/wallets-auth.md and https://docs.polymarket.com/trading/bridge/supported-assets.md, via fetch summary), which is the gap Mite fills | H |
| Trading wallet | "Your Polygon trading wallet is stored on Turnkey's side and can't be accessed without a signature from your TON wallet." Footer lists "Turnkey - Wallet infrastructure" | H (home page) |
| Which Polymarket wallet type (EOA, Safe, Deposit Wallet) | NOT FOUND. Polymarket's default for accounts deployed since 2026-05-04 is the Deposit Wallet (type 3) (H, wallets-auth docs), but whether Mite uses it is unknown | |
| PayBox reach | **TON is not in PayBox's chain catalogue.** `discover_tokens mode=chains` (2026-10-19) returns 11 chains: Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid. A `TON` query returned only Newton (1012) and Redstone (690) by substring. The tool says the catalogue is "not a support allowlist" | H |

---

## 4. Read API

**Official read API: none found** (`exists: none`). NOT FOUND (searched: home page links and scripts, Terms/EULA/Privacy, `t.me/mite` preview). Probes: `docs.mite.market`, `api.mite.market`, `app.mite.market` do not resolve (DNS error); `https://mite.market/api`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` return 404 (H). The site is a static page (about 17 KB of text and markup plus embedded base64 images) with no data endpoints; the mini-app's backend hosts are unknown. No GitHub repository was found (`gh search repos` for "mite polymarket ton" etc. returned only unrelated repos; NOT FOUND). Auth, rate limits, WebSocket: none documented.

What exists is **Polymarket's public data, which is the real market data** (belongs to the Polymarket adapter), plus attribution-level data for this front end:

- Polymarket Data API v2 (H, OpenAPI `https://data-api.polymarket.com/v2/openapi.json`; auth none, `429` with `Retry-After` on heavy queries plus a per-client allowance, numbers unpublished):
  - `GET /v2/builders/leaderboard?time_period=day|week|month|all&limit<=1000` returns `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}`. Mite's row is found by `builder_name == "Mite.market"` or by code (fixture 1).
  - `GET /v2/builders/volume?interval=day|week|month&limit<=90` returns `{data:[{date, rank, builder_name, builder_code, profile_image, verified, volume, active_users}]}` for all builders per bucket (a day series is 5.9 MB; filter client-side by `builder_code`; rows are absent for buckets with no volume) (fixture 2).
  - **`volume` is in SHARES, not USDC**; `active_users` counts distinct makers in the window (H, OpenAPI text).
- No per-builder trade tape exists in the Data API, so a Mite-only fill history is NOT FOUND (the sibling Predict note searched the same OpenAPI; I did not repeat a full parameter scan beyond the builder endpoints, M).

---

## 5. Trade path

- **No programmatic path for Mite.** Orders are placed in a Telegram Mini App and authorised by a signature from a TON wallet (H, home page). Automating that would be UI/browser automation, which is out of scope and against the Terms (section 8).
- **Custody is only partly documented.** Terms: "We do not hold, control, or have access to your digital assets, funds, wallets, or private keys at any time" (H). Home page: the Polygon wallet sits "on Turnkey's side" and needs "a signature from your TON wallet". Turnkey's own definition of non-custodial: end-user sub-organizations where "only the end user can authorize a signature" with their own API key or passkey, and the page does not say whether the integrating organization's credentials could ever act on a sub-organization (H, https://docs.turnkey.com/security/non-custodial-key-mgmt.md, via fetch summary). Turnkey's API requests are signed with a P-256 API key by default (H, https://docs.turnkey.com/llms.txt) and TON wallets use ed25519, so how a TON signature maps to a Turnkey credential is not documented (NOT FOUND). The likely design is a Mite backend that verifies a TON signature and then drives a delegated Turnkey key (M, inference; "Delegated access" is a Turnkey feature). If so, Mite's backend is a trust point and "non-custodial" is a policy claim, not proven.
- **The underlying exposure is reachable only through Polymarket directly**: signed EIP-712 orders against Polymarket's CLOB on Polygon, with an optional builder code in the signed order (H, https://docs.polymarket.com/programs/builders/overview.md, via fetch summary; the field name is on the Place Orders page, which I did not read). A PayBox EVM wallet could in principle do that (Polygon is in the catalogue), but whether PayBox signs Polymarket typed data is untested here and belongs to the Polymarket adapter. Do **not** attach Mite's builder code to your own orders: that misattributes volume and fees.
- **PayBox cannot drive Mite** (TON not in catalogue; no API). `paybox_reachable = no` for Mite itself.

---

## 6. Fees

| Component | Formula | Payer | Tag |
|---|---|---|---|
| Mite commission | "0% additional commission"; "positions fill at Polymarket's native orderbook prices" | n/a | H (claim, home page) |
| Mite's actual builder fee rate on orders | consistent with 0 bps (Polymarket's default is 0 bps taker and maker, max 100 and 50 bps), but the rate is not exposed in the Data API, so the claim is unverifiable from outside | user | claim H; verification NOT FOUND |
| Polymarket platform fee | taker-only: `fee = C x feeRate x p x (1 - p)`, rounded to 5 decimals, minimum 0.00001; feeRate by category: Crypto 0.07; Sports, Economics, Culture, Weather, Other 0.05; Finance, Politics, Tech, Mentions 0.04; Geopolitics 0. Makers pay 0 and receive 15-25% rebates | taker | H (https://docs.polymarket.com/trading/fees.md, via fetch summary) |
| Polymarket builder fee (if a builder sets one) | `notional x builder_fee_rate_bps / 10000`, additive to the platform fee | user | H (https://docs.polymarket.com/programs/builders/fees.md, via fetch summary) |
| GRAM to Polygon-stablecoin conversion, both on open and on close | not stated; "0% additional commission" is about Mite's own commission and does not say the conversion layer is free | user | NOT FOUND (searched: home page, Terms, EULA, Privacy) |
| Network fees | "You are responsible for any network fees, gas, or third-party charges" | user | H (Terms s.6) |
| Polymarket deposit/withdraw | none charged by Polymarket itself | | H (fees page) |

Arbitrage consequence: a Mite leg costs Polymarket's fee plus an unknown conversion spread twice per round trip (open and close), plus TON/Polygon network costs; Polymarket direct dominates it.

---

## 7. Resolution and dispute risk

Mite adds no oracle. Orders match on Polymarket, so resolution is Polymarket's and perfectly correlated with the Polymarket leg (M, strong). Polymarket's mechanism (H, https://docs.polymarket.com/concepts/resolution.md, via fetch summary): UMA optimistic oracle, proposer bond typically $750 pUSD, 2-hour challenge period (about 2 hours if undisputed), a dispute triggers re-proposal, a second dispute leads to a 24-48 hour debate and a roughly 48-hour UMA token-holder vote (4-6 days disputed in total), 50/50 outcome possible; crypto "up/down" markets use a Chainlink TWAP rule instead.

Mite-specific risks (M, inference from first-hand text): the Terms let Mite "limit, modify, suspend, or withdraw" the Service "at any time" (s.2) and warn "Do not rely on the Service for any critical purpose"; unknown conversion-layer liquidity at close (you cannot exit to GRAM if the converter or backend is down); backend/key-custody trust point (section 5); Mite can screen wallets and restrict access (Terms s.7).

---

## 8. Geo, ToS, automation

All quotes from the Mite Terms of Use and EULA, both "Last updated: 17 August 2026" (H, https://mite.market/terms.html and https://mite.market/eula.html).

- **Restricted jurisdictions** (Terms s.3, EULA s.4): "the United States of America; the United Kingdom; France; the Netherlands; Germany; Australia; Curaçao; and any jurisdiction subject to comprehensive sanctions, including Iran, North Korea, Syria, Cuba, and the Crimea, Donetsk, and Luhansk regions of Ukraine". Age 18+. Mite "may implement ... geographic blocking, wallet screening, and identity verification". Mite's list differs from Polymarket's own geoblock list, which also blocks or close-only restricts many more countries (H, https://docs.polymarket.com/api-reference/geoblock.md, via fetch summary).
- **VPN ban:** users must not "circumvent eligibility or geographic restrictions, including via VPN or similar tools" (Terms s.8(c)).
- **Automation ban:** Terms s.8(e): "use bots or automated means except as expressly permitted"; EULA s.2(e): no "automated means to access the Service except as expressly permitted"; EULA s.2(f): no use of the Service "to build a competing product"; license is "personal, non-commercial". No express permission exists (NOT FOUND).
- **Operator:** unnamed ("the operator of the Service"); governing law Abu Dhabi Global Market, binding arbitration at the ADGM Arbitration Centre; liability capped at USD 100. Contacts on the site: `hello@mite.market`, Telegram `@mite_admin`. Operator identity and legal entity: NOT FOUND (the domain uses a privacy registrar).
- **Not affiliated** with Polymarket, Telegram or TON.org (footer and Terms s.4). The Polymarket builder program itself places no custody, geography or Telegram-bot rule on builders (H, builders overview/tiers pages, via fetch summary).

---

## 9. Liquidity

All figures are **Polymarket builder attribution, in SHARES (not USD)**; a share costs at most $1, so notional USD is at most the share figure (H for units, M for the bound). Source: `data-api.polymarket.com/v2/builders/leaderboard` and `/v2/builders/volume`, fetched 2026-10-19 (fixtures 1 and 2). Mite's month rows match its all-time row (369 + 36,368 + 86,811 + 59,087 + 13,923 + 6,050 = 202,608).

| Metric | Value | Tag |
|---|---|---|
| All-time (since May 2026) | 202,608 shares, 340 distinct users, rank 241 of 592 builders; all builders together 8.15 billion shares (my sum), so Mite is about 0.0025% | H / M |
| Monthly shares (users, rank in month) | May 369 (6, 233); Jun 36,368 (34, 147); Jul 86,811 (55, 146); Aug 59,087 (255, 137); Sep 13,923 (37, 182); Oct 1-19 6,050 (31, 175) | H |
| Peak week | week of 2026-07-26: 41,968 shares (13 users, rank 93) | H |
| August user spike | days 2026-08-26 .. 08-31 show 20, 25, 29, 54, 69, 96 distinct users but only 2.8k-6.2k shares per day: many small accounts, consistent with a promotion or campaign (the cause is my guess, L) | H for the numbers |
| Last 30 complete days (2026-09-19 .. 10-18) | 9,697 shares (my sum of daily buckets) vs 710.5M for all builders: about 0.0014% | M |
| Last 7 days (2026-10-12 .. 10-18) | 3,328 shares; daily 91-1,279 shares, 1-19 users | M |
| Trend | October pace about 9.5k shares per 30 days vs July's 86.8k: down about 89% | M (derived) |
| TVL / open interest | none published | NOT FOUND |
| Order-book depth | the Polymarket book | M |

---

## 10. Event coverage and overlap

Whatever Polymarket lists that the app shows. The site names "politics, crypto, sports and world events" only for its AI signal layer. Every category overlaps Kalshi, Polymarket US, Limitless, Predict.fun, Opinion, XO and others exactly as Polymarket does. **No category exists only on Mite.** (M)

## 11. Shared liquidity

**Shares 100% of its liquidity with Polymarket International** (M, strong: same CLOB matches builder-coded orders; the site itself names Polymarket as "Liquidity"). A Mite quote equals the Polymarket quote plus conversion friction. **Not an independent arbitrage leg.**

---

## 12. Fixtures

In `docs/research/fixtures/mite-market/` (all from unauthenticated GETs on 2026-10-19; request paths are recorded inside each file):

| File | Shows |
|---|---|
| `polymarket_data-api_v2_builders_leaderboard_mite_rows_2026-10-19.json` (6 KB) | Leaderboard response shape (top 2 rows, pagination block) for day/week/month/all windows, and Mite's row in each (absent from the partial `day` window) |
| `polymarket_data-api_v2_builders_volume_mite_series_2026-10-19.json` (48 KB) | Volume series shape; Mite's 6 monthly, 23 weekly and 86 daily buckets with builder code, plus the 30-day and 7-day sums and share of all builders |
| `mite_site_telegram_domain_identity_2026-10-19.json` (2 KB) | Home page title, meta description, links and headers subset; `t.me/mite` og meta; domain registry dates and nameservers; the GRAM = Toncoin symbol lookup |

---

## 13. Adapter recommendation

- **skip** for trading and for a market-data adapter (duplicate liquidity, no API of its own, tiny and shrinking, Terms ban automation, custody unclear).
- **Registry record only** (pool-graph rule in `docs/platform-registry-design.md`): `kind: broker`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `platform: telegram-mini-app`, `user_chain: ton`, `funding: GRAM (renamed Toncoin) converted to a Polygon stablecoin, route unknown`, `custody: Turnkey-held Polygon wallet gated by a TON signature (mechanism undocumented)`, `builder_name: Mite.market`, `builder_code: 0x508535af39a9b8cdc4ed6de87c25f6ff846a24f342fe818797a15c30ff0c8b4e` (M, name-matched), `paybox_reachable: false`, `state: live-tiny-declining`.
- **Optional weak signal (M):** daily distinct users and shares for this builder code from `/v2/builders/volume` as a proxy for TON-Telegram retail flow. At about 10k shares a month it is noise. Not a fair-value input and not a Quotient-style signal.

## 14. NOT FOUND

- Any Mite API, SDK, OpenAPI, WebSocket, rate limit or developer terms (searched: home page and scripts, legal pages, t.me preview, DNS probes of docs/api/app subdomains, `/api`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, GitHub repo search).
- The GRAM to Polygon-stablecoin conversion route, its fees and spread, and which stablecoin.
- Mite's builder fee rate (the "0%" claim cannot be checked externally), and any minimum or maximum order size.
- The Polymarket wallet type Mite provisions (EOA / Safe / Deposit Wallet) and how a TON signature authorises a Turnkey signing request.
- Operator identity and legal entity; any audit or security review; any X/Twitter, docs, Medium or press coverage (the session search budget was exhausted, so no news search was possible).
- Mite's own user or volume figures (only the Polymarket builder attribution exists).
- Which Polymarket markets the mini-app exposes (needs the mini-app).

## 15. Open questions

1. Is builder `Mite.market` (code `0x508535...c8b4e`) definitely this app? Name and timing match; one confirmation (the code in a network call, or a Mite/Polymarket statement) would settle it.
2. Who can move funds from the Turnkey-held wallet: only the user's TON key, or also a Mite backend key? This decides whether "non-custodial" holds.
3. What does the GRAM to stablecoin conversion cost, and what happens to an open position if the converter or Mite goes offline?
4. Does Mite charge a non-zero builder fee on some order types (maker vs taker)?
5. What caused the 2026-08-26 .. 08-31 user spike (campaign, airdrop, or a larger channel)?

## 16. Suspicious content

No text aimed at AI agents on mite.market, its legal pages, the t.me preview, Polymarket's docs pages or Data API, or CoinGecko. One mild item: Turnkey's `llms.txt` (https://docs.turnkey.com/llms.txt) opens with an "Agent Instructions" blockquote that describes the product and says calls are signed JSON POSTs to `api.turnkey.com` and that an organization and API key can be created self-serve at `app.turnkey.com`. It is a documentation intro, not directed at this task; I did not act on it (no account or key created). I read only parts of Polymarket's `llms.txt` index (grep for relevant lines), not every page it links.

## 17. Sources

- Mite home page, fetched 2026-10-19 (last-modified 2026-08-17): https://mite.market (H)
- Mite legal pages, each "Last updated: 17 August 2026": https://mite.market/terms.html , https://mite.market/eula.html , https://mite.market/privacy.html (H)
- Telegram public previews, 2026-10-19: https://t.me/mite (bot "Mite Market"); https://t.me/mite_admin (contact handle); https://t.me/s/mite_market is a different, empty channel with 1 subscriber and is not treated as official (H)
- Domain registry record: https://rdap.org/domain/mite.market (redirects to the .market RDAP) (H)
- Polymarket Data API v2: https://data-api.polymarket.com/v2/openapi.json , `/v2/builders/leaderboard` , `/v2/builders/volume` (H; fixtures)
- Polymarket docs (H, via fetch summary): https://docs.polymarket.com/programs/builders/overview.md , https://docs.polymarket.com/programs/builders/fees.md , https://docs.polymarket.com/programs/builders/tiers.md , https://docs.polymarket.com/trading/fees.md , https://docs.polymarket.com/trading/wallets-auth.md , https://docs.polymarket.com/trading/bridge/supported-assets.md , https://docs.polymarket.com/concepts/resolution.md , https://docs.polymarket.com/api-reference/geoblock.md , index https://docs.polymarket.com/llms.txt
- Turnkey docs (H, via fetch summary): https://docs.turnkey.com/security/non-custodial-key-mgmt.md , https://docs.turnkey.com/llms.txt , https://docs.turnkey.com/_llms/documentation.txt
- CoinGecko public search API (GRAM = Toncoin): https://api.coingecko.com/api/v3/search?query=gram (H)
- STON.fi docs front page (no Mite/GRAM/Polymarket mention): https://docs.ston.fi/ (H, via fetch summary)
- PayBox read-only `discover_tokens mode=chains` (2026-10-19, with and without a `TON` query) (H)
- Sibling note for the same pattern and cross-checks: `docs/research/venues/polymarket-on-telegram-mini-app-predict-with-polymarket-the-open-platform-ston-fi-ton.md` (M for anything not re-checked here)
