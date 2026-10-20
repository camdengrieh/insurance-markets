# Prophex (PPX): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: WebFetch, DNS/WHOIS, curl GETs to public documented hosts (DexScreener API, Bluesky public API, Substack RSS, GitHub search via `gh api`). Nothing was signed, posted, connected or paid. No PayBox tools were called.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means the page was read through the WebFetch summariser.

Limitation: the shared WebSearch budget ran out partway through this task (two extended searches succeeded; a third was refused). No archive, reader or proxy service was used to work around it. Prophex's own X account could not be read.

## Verdict

**adapter_priority: skip. still_live: false (not confirmed live; strongest evidence says it never reached mainnet and is now abandoned).**

- The official domain `prophex.io` no longer serves a site. It now redirects to a GoDaddy/Afternic "for sale" lander, and its nameservers moved to Afternic on 2026-10-15, four days before this research. [H, DNS/curl/WHOIS, fixture `prophex-io-parking-evidence.txt`]
- The product was only ever announced as **testnet**: "Prophex Testnet is here" (Bluesky, 2025-12-08) and "a sneak peek into Prophex's Private Testnet" (2025-12-05). No post, article or page found announces a mainnet launch, a program ID, a market list or an app URL. [H, fixture `bluesky-feed-trimmed.json`]
- The last official-account activity found is 2025-12-12 (Bluesky, 3 followers). Substack's last post is 2025-11-16. [H]
- No docs, no API, no SDK, no repo, no contract/program address for the protocol itself (the only address found is the PPX token mint). [H for absence of what was searched; see section 9]
- No market data exists: DexScreener returns no pairs for the PPX mint, CMC shows no price or volume. [H]

Revisit trigger: none worth scripting. Only revisit if a new domain and a Solana program ID appear.

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| prophex.io (also www., app., docs.) | TLS handshake fails (`tlsv1 unrecognized name`). All four names resolve to GoDaddy/Afternic parking IPs (13.248.169.48, 76.223.54.146). `http://prophex.io/` redirects via `/lander` (307) to `https://forsale.godaddy.com/forsale/prophex.io`. | H: curl, dig. Fixture `prophex-io-parking-evidence.txt` |
| WHOIS | Created 2025-08-29, **updated 2026-10-15**, expires 2028-08-29, GoDaddy registrar, privacy-proxied registrant, nameservers `ns1/ns2.afternic.com`. DNS has null MX and SPF `-all`. | H: `whois -h whois.nic.io` |
| Search-engine cache | The extended web search showed a cached prophex.io title "Prophex - Trade Outcomes, Train Intelligence" and a summary saying wallet connection (MetaMask) and no KYC. That cache pre-dates the domain going to Afternic; it is not current and the MetaMask mention does not fit a Solana-only product. | M/L: search-tool summary, not independently readable now |
| X account `prophex_io` | Not readable this session. Substack says the account was hijacked by a phishing attacker on 2025-11-01 with scam posts, locked 2025-11-04, recovery "in progress". Current status unknown. | H for the Substack statement; X itself NOT FOUND (searched: WebFetch not attempted on x.com, search budget exhausted) |
| Bluesky `prophex-io.bsky.social` | Created 2025-11-19, 3 followers, 17 posts, **last post 2025-12-12**. | H: public API, fixtures `bluesky-profile.json`, `bluesky-feed-trimmed.json` |
| Substack `tryprophex.substack.com` | 4 posts, last 2025-11-16 ("Redefining Prediction Markets as we know it"). Earlier: 2025-11-15 market-structure explainer, 2025-11-07 phishing incident notice, 2025-11-07 "Coming soon". | H: RSS, fixture `substack-feed-titles.json` |
| Telegram `t.me/prophex_io` | Public preview shows 2 posts: "Channel created" and a welcome/verification post, 341 subscribers. No project announcements. | H (fetch-summarised), https://t.me/s/prophex_io |
| PPX token | CMC "preview page", price blank, CertiK score 2.8 listed. Coinbase and OpenSea list the mint. DexScreener API: no pairs (see section 7). | H (CMC fetch-summarised) |

Conclusion: a live, tradable Prophex product is **unconfirmed and unlikely**. Domain on sale 2026-10-15 is the strongest recent signal; absence of any mainnet announcement since the Dec 2025 testnet posts is the second.

## 2. Kind and market model

Design claims below are marketing/explainer text from the project's own Substack and Bluesky (no docs or code to verify them). [M]

- Kind: on-chain "perpetual prediction market" on Solana: leveraged long/short positions on the *probability* of an outcome, not YES/NO share purchase. Substack: "expresses them as perpetual trading markets, enabling participants to take long or short positions on the probability that an outcome resolves to true or false." [H that this is what the project says, https://tryprophex.substack.com/p/prophex-redefining-prediction-markets and the 2025-11-15 post]
- Pricing: a **virtual AMM (vAMM)**: "generates a consistent pricing curve based on open interest ... does not require large capital reserves". Plus an **insurance fund** as a solvency backstop. [H as claim, M as fact]
- Leverage: "Up to 20x" (Bluesky 2025-12-02, Bitget/Foresight News 2025-11-13). Margin posted instead of full collateralisation. [H as claim]
- Outcomes: binary true/false per market implied; categorical/scalar not described. "Modular outcome layers" is mentioned with no detail (Bluesky 2025-12-07). Position tokenisation (SPL token vs internal account state): **NOT FOUND**.
- Settlement: "instant ... Winning positions pay out automatically" at event resolution. Whether positions are perpetual with funding (no expiry) or expire at resolution is contradictory/unspecified. The phrase "transparent funding rates" appeared only in the web-search tool's summary of the CMC blurb; the Bitget article, Substack and Bluesky do not describe any funding mechanism. [M/L]
- Funding-rate formula, liquidation rule, margin ratio: **NOT FOUND** (searched: Substack posts, Bluesky, Bitget, DeGen Times, CMC; no docs exist).

## 3. Chains and collateral

- Chain: Solana (CMC, Bluesky "On Solana. For everyone."). [H]
- Token: PPX, SPL mint `AkbvXVZPzrHSpcxNADQ7Uxk6nvjHtpHn4nqNQZY8TJBn`, total supply 99.99M, circulating 70.05M per CMC; Coinbase lists max 100M. [H (CMC, fetch-summarised), M (Coinbase via search summary)]
- Trading collateral (USDC? SOL? PPX?): **NOT FOUND**. DeGen Times and Substack do not say.
- Token sale: Caplight lists one round, "Token Sale, November 1, 2025", **$16.2K raised**; company "private", 1 employee, founded 2025, HQ United States. [H (fetch-summarised), https://www.caplight.com/company/prophex]

## 4. Read API

**exists: none.** No official API, docs, OpenAPI, SDK, subgraph or program IDL was found.

- Docs URL: NOT FOUND (searched: CMC links, Substack, Bluesky, Telegram, GitHub search, prophex.io which is parked).
- Base URLs: none. The only hosts ever referenced are prophex.io (parked), tryprophex.substack.com, and social accounts.
- Key endpoints (markets, books, trades, resolution): none.
- Websocket: none found.
- Auth/rate limits: n/a.
- On-chain read path: would require the Solana program ID, which was never published in anything found. NOT FOUND.
- Public third-party market data for the token only (DexScreener `GET https://api.dexscreener.com/latest/dex/tokens/{mint}` and `GET https://api.dexscreener.com/token-pairs/v1/solana/{mint}`): both returned empty (`{"pairs":null}` and `[]`) on 2026-10-19. [H, fixture `dexscreener-empty-responses.txt`]
- Fixtures saved are therefore evidence of absence/deadness, not response shapes of a venue API: `docs/research/fixtures/prophex/`.

## 5. Trade path

**none.** No program ID, order format, signing scheme or SDK is published. The only user flow described is a front end: "1. Connect wallet 2. Select Market 3. Select trade, amount, and leverage. 4. Place trade and manage position." (Bluesky 2025-12-03). That front end is gone with the domain. Marketing claims "Seamless integration for AI agents & strategies" (Bluesky 2025-12-02, 2025-12-07) with no API behind it. [H as claim]

PayBox reachability: **no**. A Solana wallet could in principle sign program instructions as transaction proposals, but there is no known program to target, no IDL, and no live front end. EVM chains (Base, Ethereum, BNB, Arbitrum, Polygon) are irrelevant: the venue is Solana-only per its own statements.

## 6. Fees

NOT FOUND. No fee schedule, funding formula, or who-pays statement exists in any source read. The Substack mentions Solana's low network fees in general terms only.

## 7. Liquidity

- Venue TVL / OI / volume: **NOT FOUND**; likely zero. The project describes only a private testnet.
- PPX token: CMC shows no price or volume (preview page), the search tool reported CMC "$0 price, $0 24h volume". [M, search summary]
- An earlier DexScreener listing surfaced in search (title "PPX $0.0007082 - Prophex / SOL on Solana / Meteora", pair `9kc2x2nxxvqavkf3tv8zn76ijsjdx5w38gyb1i8xbyev`) with market cap roughly $70K per the search summary, but the DexScreener web page returns 403 to fetch and the API returns `pair: null` today, so no current number. [L, stale]
- OneBullEx auto page (via search summary): market cap about $6.8K and 24h volume about $97. Undated, auto-generated. [L]
- Foresight News/Bitget 2025-11-13 quoted "approximately $9 million" market cap at launch of the announcement; that is 11 months stale. [L]
- Liquidity is the token's, not a prediction-market book. Nothing here is arbitrageable.

## 8. Resolution mechanism and dispute risk

NOT FOUND. Substack says "Settle on facts" and "instant settlement" with no oracle, resolver, or dispute design named. Insurance fund is the only named safety mechanism. Treat dispute risk as unbounded because there is no specification. [H for absence]

## 9. Geo / ToS / automation

- ToS, geo-blocking, API terms: NOT FOUND (site is parked; nothing archived or readable). Pre-parking cache snippet says non-custodial, no KYC/registration (L, search summary).
- Team claims on Substack/DeGen Times are unverifiable first names only (Maria, Alina, Brian) with employer claims (Bybit, Binance, Wintermute...). No surnames, no profiles. Caplight lists 1 employee. [M]
- The DeGen Times "Redefining Prediction Markets" piece is a promotional repost of the project's own Substack (same title, same date window, "Coinmonks" byline) with no sponsorship disclosure. [H]
- Founder-style red flags worth noting for risk scoring: tiny token sale ($16.2K), an X account hijack about five weeks before the Dec 2025 testnet posts, a Telegram channel whose only content is a third-party "verify" bot, domain listed for sale. These are not accusations; they only lower the weight of any future claim.
- GitHub: no official repo found. `gh api search/repositories?q=prophex` returned unrelated projects (a bioinformatics BWT k-mer index, a Jito-bundle tool, a Python-scripts repo, a take-home exercise, etc.), none referencing the PPX mint; code search for the PPX mint hit unrelated token-list/crawler repos. The `Prophex-Technologies` org is a 2019 student-lab account, unrelated. [H for what was searched; not proof no private repo exists]

## 10. Event coverage and overlap

NOT FOUND. No market list was ever published (searched: Substack, Bluesky, Telegram, Bitget, DeGen Times). The pitch is generic ("Every domain: governance, economics, technology, culture"). Nothing to compare with sports/politics/crypto-price/macro markets elsewhere.

## 11. Independence of liquidity

N/A. With no live book, there is no shared-liquidity question. A vAMM design would be independent of other venues' books if it existed, but would price off its own curve and was never observed.

## 12. Adapter recommendation

- **skip**. No live market, no API, no program ID, no liquidity.
- For the aggregator's venue registry: record Prophex as `status: dead/unlaunched`, `evidence: domain parked at Afternic 2026-10-15`, and exclude it from scans. If a future crawl wants a cheap re-check: `dig +short prophex.io NS` (expect `afternic.com` while dead) and `GET https://api.dexscreener.com/token-pairs/v1/solana/AkbvXVZPzrHSpcxNADQ7Uxk6nvjHtpHn4nqNQZY8TJBn` (expect `[]`).
- Do not confuse with **ProphetX** (a sports-prediction exchange; coverage of its Agg Market/Solana tie-in appeared in the same search results) or with unrelated GitHub projects named "PROPHEX". Different products, different spelling.

## Suspicious content / injection notes

- `t.me/s/prophex_io`: the only call to action is a "Tap to verify" button routing to a third-party bot (@Safeguard) to "verify you're human". Not followed. Common verification-bot pattern, but also a vector for wallet-drain/phishing flows. [H, fetch-summarised]
- Substack 2025-11-07 post documents an X-account hijack with scam posts promoting a counterfeit offering. Any "Prophex" token/airdrop/claim link seen on social media should be treated as hostile. [H]
- The WebSearch tool's own summaries contained claims (MetaMask support, "no registration or KYC") that I could not verify against any readable primary page; they are tagged L.
- No embedded instructions aimed at AI agents were found in the pages read. Marketing lines about "seamless integration for AI agents" were treated as marketing text only.

## Sources

- https://coinmarketcap.com/currencies/prophex/ (fetch-summarised; description, mint, Solscan link, socials prophex.io / twitter.com/prophex_io / t.me/prophex_io, supply, CertiK 2.8, no price/volume/docs link)
- https://www.bitget.com/news/detail/12560605061529 (Foresight News repost 2025-11-13; 20x leverage, dynamic odds, virtual liquidity + insurance fund, ~$9M mcap then)
- https://www.degentimes.org/2025/11/prophex-redefining-prediction-markets.html (2025-11-16, promotional; team first names)
- https://tryprophex.substack.com/feed (RSS read 2026-10-19; posts 2025-11-07 x2, 2025-11-15, 2025-11-16)
- https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=prophex-io.bsky.social and `.../app.bsky.feed.getAuthorFeed?actor=prophex-io.bsky.social` (public GETs, 2026-10-19)
- https://t.me/s/prophex_io (fetch-summarised)
- https://www.caplight.com/company/prophex (fetch-summarised; token sale 2025-11-01, $16.2K)
- http://prophex.io/ -> http://prophex.io/lander -> https://forsale.godaddy.com/forsale/prophex.io (curl redirect chain); `dig` A/NS/MX/TXT for prophex.io and subdomains; `whois -h whois.nic.io prophex.io`
- https://api.dexscreener.com/latest/dex/pairs/solana/9kc2x2nxxvqavkf3tv8zn76ijsjdx5w38gyb1i8xbyev, `/latest/dex/tokens/{mint}`, `/token-pairs/v1/solana/{mint}`, `/latest/dex/search?q=prophex` (all empty)
- WebSearch (extended) 2026-10-19 result list: DexScreener, Coinbase (`coinbase.com/en-gb/price/prophex-solana-24247396`, HTTP 403 on fetch), OpenSea token page, OneBullEx, WEEX, BTCC (low-quality auto pages; not relied on)
- `gh api search/repositories?q=prophex...`, `search/users?q=prophex`, `search/code?q=<mint>` (no official repo found)

Fixtures: `docs/research/fixtures/prophex/` (`prophex-io-parking-evidence.txt`, `bluesky-profile.json`, `bluesky-feed-trimmed.json`, `substack-feed-titles.json`, `dexscreener-empty-responses.txt`).

## NOT FOUND (searched)

- Official docs / API / SDK / OpenAPI (CMC, Substack, Bluesky, Telegram, GitHub search; prophex.io parked)
- Solana program ID / IDL / contract audit (CertiK "score 2.8" on CMC is a token-level score, not an audit report: M)
- Mainnet launch announcement (Substack, Bluesky through 2025-12-12, Telegram)
- Collateral asset, fee schedule, funding and liquidation formulas, oracle/resolver, ToS and geo rules
- Any volume / OI / TVL for the prediction market itself
- Current status of the X account `prophex_io` (not readable; search budget exhausted)

## Open questions

- Did a mainnet ever ship between 2025-12-12 and 2026-10-15 under a different domain? Nothing found; a PPX mint holder-activity check on Solscan (not attempted, as it needs a non-documented endpoint or JSON-RPC POST) would settle token liveness but not product liveness.
- Why did the domain move to Afternic on 2026-10-15 (expiry is 2028; the move looks like a deliberate sale listing)?
