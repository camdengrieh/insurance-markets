# KuCoin Web3 Wallet (Polymarket integration): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: WebFetch of the press release, KuCoin blog and Polymarket docs pages, and unauthenticated GETs to `data-api.polymarket.com` (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE, PayBox call, payment or browser automation. Third-party text was treated as untrusted data; no embedded instructions were found.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary or inferred; **L** = weak or stale. "NOT FOUND (searched: ...)" means exactly that, not "no".

Limitations: the shared WebSearch budget was exhausted, so no web search was run. `x.com/KuCoin_Web3` returned HTTP 402 to WebFetch (recorded, not pursued). I did not find a KuCoin help-center or Terms page specific to the Web3 Wallet's Polymarket entry. The sibling note `docs/research/venues/kucoin-predictions.md` (same day) covers the separate custodial KuCoin Predictions product and was used for cross-checks only where marked.

Fixtures (3 files, each under 10 KB): `docs/research/fixtures/kucoin-web3-wallet-polymarket-integration/` (section 14).

---

## 0. Verdict

**adapter_priority: skip.** Keep a registry alias only.

1. **Live in 2026, but it is a wallet front end for Polymarket, not a venue.** Press release 2026-06-08 (H) and a KuCoin blog of 2026-08-26 describing the in-wallet Polymarket flow (H). Polymarket's own builder data shows a verified builder "KuCoin Web3" with trades since 2026-04-24 (H).
2. **Not an independent arbitrage leg.** Every market, price, book and settlement is Polymarket's (Polygon CLOB, USDC). The wallet is a user interface that signs and submits Polymarket orders. Any KuCoin-Web3 "price" is a Polymarket price.
3. **No API, no documented trade path for third parties.** KuCoin's API docs index has a "Web3 Wallet" section that covers only the browser-extension wallet provider (per the sibling note, H there). Nothing on prediction markets.
4. **Small.** Polymarket-attributed volume for builder "KuCoin Web3" is $1.58M all time (since 2026-04), 311 active users, ALL-window rank 129 on the bucketed volume list (rank 132 on the leaderboard call) (H, fixtures). It is unclear how much belongs to this wallet versus the custodial KuCoin Predictions launched 2026-10-12 (section 4 and 10).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Chainwire/PRNewswire release, dateline 2026-06-08: KuCoin Web3 Wallet announces its Polymarket integration; "view event-driven markets ... inside the wallet" covering crypto, sports and other topics | Announced. The release itself does not say whether users can trade (it says only view). It is a paid promotional release. https://chainwire.org/2026/06/08/kucoin-web3-wallet-expands-its-ecosystem-access-through-polymarket-integration/ | H (that it says this), L (as evidence of function) |
| KuCoin blog "What is Polymarket? How to trade it on KuCoin Web3", published 2026/08/26 15:57: step-by-step Polymarket trading inside the Web3 wallet in the KuCoin App | Function confirmed by KuCoin itself. https://www.kucoin.com/blog/what-is-polymarket-how-to-trade-it-on-kucoin-web3 | H |
| Polymarket `GET /v1/builders/leaderboard?timePeriod=ALL` offset=100: row `KuCoin Web3`, `verified: true`, volume $1,582,567, 311 active users | Real attributed trades. https://data-api.polymarket.com/v1/builders/leaderboard | H |
| Polymarket `GET /v1/builders/volume?timePeriod=DAY`: non-zero rows for KuCoin Web3 on most days since 2026-04-24; most recent row 2026-10-19 (partial) | Still trading today | H |

**still_live = true.** The oldest evidence (the press release) is 4.4 months old, under the 6-month staleness bar. Nothing is stale, but the function is only confirmed by KuCoin's blog and by Polymarket builder data, not by any docs or terms specific to the wallet.

## 2. Kind and market model

- **Kind (H/M):** `broker-or-frontend` in a non-custodial multichain wallet. KuCoin's blog calls it a "self-directed wallet interface" with a Web3 wallet "created or imported" inside the KuCoin App and says no separate browser extension is needed (H, blog 2026/08/26). Key control by the user is the article's framing (H for the claim, M for truth).
- **Market model:** Polymarket's. Binary Yes/No tokens on a central limit order book, with neg-risk multi-outcome events; "Browse by category, pick an event, choose Yes or No, enter an amount, and confirm" (H, blog). Categorical and scalar behaviour is not described by KuCoin (NOT FOUND on KuCoin; defer to the Polymarket venue note).
- **Tokenisation:** Polymarket conditional tokens (outcome shares). KuCoin does not describe its own tokens (NOT FOUND, searched: blog, press release).
- **Which markets:** the blog says availability "varies by region, product rules, and eligibility". No public list of the subset shown in the wallet (NOT FOUND, searched: blog, press release, KuCoin Web3 landing page).

## 3. Chains and collateral

- **Chain: Polygon.** "Polymarket settles trades on Polygon" (H, blog 2026/08/26).
- **Collateral:** USDC on Polygon; blog says minimum "at least 20 USDC for trading" and about 1 POL recommended for deposit/withdraw gas, gas "roughly $0.01 or less per transaction" (H for what the blog says). Polymarket's current collateral token naming (pUSD in the sibling Bitget note) is not mentioned by KuCoin (M; see the Polymarket venue note).
- **Funding flow:** "Deposit USDC into your Polymarket trading account", i.e. the wallet first funds a Polymarket trading account (H, blog). Whether that account is an EOA, proxy or Safe-style wallet is NOT FOUND (searched: blog, press release).
- The wallet is described as multichain with a cross-chain DEX aggregator (H, press release boilerplate), so other-chain assets can be swapped to Polygon USDC, but KuCoin's Polymarket path itself is Polygon only (M).

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API for wallet-side prediction data | **None.** NOT FOUND (searched: press release, blog, KuCoin Web3 landing page https://www.kucoin.com/web3 which lists only Dashboard, Markets, Trade, DApps, Airdrops; the sibling note's read of `https://www.kucoin.com/docs-new/llms.txt` found zero lines for "predict"/"polymarket", H there) | H for page reads, NOT FOUND otherwise |
| KuCoin Web3 developer docs | Only a "Browser Extension Wallet" injected-provider page (EIP-1193 style: `enable`, `request` for `personal_sign` / `eth_sendTransaction`) per the sibling note, https://www.kucoin.com/docs-new/web3/browser-extension-wallet.md. I did not re-read it this session. | M |
| Canonical read path | **Polymarket's official APIs** (the Polymarket adapter): `https://gamma-api.polymarket.com`, `https://clob.polymarket.com`, `https://data-api.polymarket.com`. Docs https://docs.polymarket.com | M (not re-verified here; parallel workflow owns it) |
| Only first-party public footprint | Polymarket builder-attribution data for "KuCoin Web3" (below) | H |

Confirmed response shapes (public GET, 2026-10-19, fixtures saved):
- `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=100` returns a bare array of at most 50 rows `{rank:"132", builder:"KuCoin Web3", builderCode:"0xc67de09a...adb69", volume:1582567.38, activeUsers:311, verified:true, builderLogo}`. `limit` is capped at 50; `offset` pages through. The builder code is a public attribution id. Fixture `polymarket-builders-leaderboard-kucoin-web3-ALL.json`. (H)
- `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod={DAY|WEEK|MONTH|ALL}` returns every builder's series as rows `{dt, builder, builderCode, builderLogo, verified, volume, activeUsers, rank}`. File sizes today: DAY 17 MB, WEEK 3.2 MB, MONTH 0.9 MB, ALL 0.2 MB, so filter client-side. The ALL window is a single bucket stamped `2026-01-01T00:00:00Z` with the cumulative figure. Fixtures `polymarket-builders-volume-kucoin-web3-MONTH-WEEK-ALL.json` and `...-DAY-last40rows.json`. (H)
- Docs say matched volume "can take up to 24 hours to appear" (H, https://docs.polymarket.com/programs/builders/overview.md), so the latest day is partial.

**Attribution ambiguity (M):** one builder code "KuCoin Web3" covers both this wallet route and, very likely, the custodial KuCoin Predictions launched 2026-10-12 (the daily series jumps from a median of about $1.7k/day to $27k-$435k/day on that date with only 3-5 active users). Neither KuCoin nor Polymarket says the code is shared. The sibling note makes the same inference.

## 5. Trade path

- **User path (H, blog):** KuCoin App > Web3 wallet > Polymarket entry > deposit USDC into the Polymarket trading account > pick an outcome > confirm. Sell before resolution "if liquidity exists" or hold and claim.
- **Under the hood (M):** a Polymarket CLOB order signed by the user's wallet, carrying the builder code (the code is "serialized onchain as part of the signed order", H, https://docs.polymarket.com/programs/builders/overview.md). Polymarket's relayer covers gas for wallet deployment, approvals and order execution (H, same page), which fits the "gas $0.01 or less" claim only partly; I did not resolve that discrepancy (L).
- **Third-party programmatic path through KuCoin:** none. No SDK, REST, WebSocket or signing doc (NOT FOUND, section 4). Do not drive the app.
- **Correct agent route:** trade the same market on Polymarket directly via the Polymarket adapter. Reusing KuCoin's builder code from third-party software is not offered and would route any builder revenue to KuCoin; do not attempt it.

## 6. Reachable through PayBox? **no** (as a distinct venue)

- The wallet's signing happens inside the KuCoin App; no transaction-proposal or signed-order interface is exposed to outsiders.
- A PayBox EVM wallet on Polygon can trade the **same markets** by going to Polymarket directly (signed orders to the Polymarket CLOB; Polymarket adapter scope). Other PayBox chains (Base, Ethereum, BNB, Arbitrum, Solana) would need a bridge or swap to Polygon USDC first (M).
- Nothing about KuCoin Web3 adds a PayBox route that Polymarket does not already provide.

## 7. Fees

| Fee | Value | Payer | Tag |
|---|---|---|---|
| KuCoin wallet fee on Polymarket trades | **None listed.** The blog "lists no KuCoin trading, deposit, or wallet fees", only Polygon gas | n/a | H (absence on the blog page); true fee schedule NOT FOUND (searched: blog, press release) |
| Polygon gas | blog: roughly $0.01 or less per transaction, ~1 POL recommended | user | H (as stated) |
| Polymarket taker fee | `fee = C x feeRate x p x (1 - p)`, USDC, 5 dp; maker fee 0 in every category; only takers pay. Category rates: Crypto 0.07, Sports 0.05, Finance 0.04, Politics 0.04, Economics 0.05, Culture 0.05, Weather 0.05, Other 0.05, Mentions 0.04, Tech 0.04, Geopolitics 0 (free) | taker | H (https://docs.polymarket.com/trading/fees.md, read 2026-10-19) |
| Builder fee | Polymarket's builder page does not mention builder fees (H, absence). Whether KuCoin adds a hidden spread or builder fee is NOT FOUND. | | |

Contrast: the custodial KuCoin Predictions app charges a 1.5% "technical service fee" (sibling note, H there). Do not assume it applies to the Web3 wallet path; the blog says nothing on it.

## 8. Resolution mechanism and dispute risk

Resolution is Polymarket's (UMA-based optimistic oracle for most markets; Chainlink streams for short crypto Up/Down series per the sibling Bitget note). KuCoin's pages do not describe resolution for the wallet route (NOT FOUND, searched: blog, press release). Dispute, cancellation and 50/50 risks are exactly Polymarket's; defer to the Polymarket venue note. Added risk: wallet-app custody of keys is the user's, and the blog warns that "Blockchain transactions may be irreversible once they are signed" (H). (Resolution detail M, from other notes.)

## 9. Geo, ToS, automation

- Blog: "Polymarket availability varies by region, product rules, and eligibility requirements"; users are responsible for complying with their jurisdiction's laws; the entry point may vary by app version and region (H). No country list (NOT FOUND, searched: blog, press release).
- Polymarket's own geoblock applies to the underlying orders (M; owned by the Polymarket note).
- No KuCoin Web3 Wallet Terms page located (NOT FOUND, searched: blog, press release, `https://www.kucoin.com/web3`, a guessed `/web3/wallet` URL returned "Page Not Found"). Automation rules therefore unknown; with no API, automation would mean driving the app, which I treat as unsupported.
- Press release is a paid promotion (H as labelled by the page summary); treat its claims as company statements.

## 10. Liquidity

| Metric | Value | Tag | Source / date |
|---|---|---|---|
| Own book / TVL / OI | none (uses Polymarket's) | M | no KuCoin figures found; not checked on DefiLlama this session (the sibling note found no KuCoin Predictions listing, H there) |
| Polymarket-attributed volume, builder "KuCoin Web3", all time | $1,582,567; 311 active users | H | Polymarket Data API, 2026-10-19 (fixture) |
| Monthly | Apr $90 (1 user); May $36,142 (48); Jun $193,478 (142); Jul $131,904 (108); Aug $115,410 (102); Sep $113,697 (36); Oct 1-19 $991,847 (21 users, MONTH rank 47) | H | `/v1/builders/volume?timePeriod=MONTH`, 2026-10-19 (Oct figure includes the partial 10-19 day, $6.5K) |
| Daily since 2026-10-12 | 10-12 $92,282; 10-13 $167,360; 10-14 $45,801; 10-15 $27,098; 10-16 $65,917; 10-17 $127,803; 10-18 $434,878 (4 users); 10-19 $6,533 partial | H | `/v1/builders/volume?timePeriod=DAY` |
| Pre-launch run rate (Jun-Sep) | $114K-$193K a month, about 100-140 monthly active users until September | H | same |
| Scale | Total builder volume across all 694 builders in the ALL bucket is about $8.15B; KuCoin Web3 is about 0.02% of it | H | my computation on `/v1/builders/volume?timePeriod=ALL`, 2026-10-19 |

Caveats: "volume" is Polymarket's matched-trade definition; sides counted is not stated. From June to September (before the custodial app launched) the series is the cleanest view of the **wallet** route alone, and it was roughly $115-190K a month, i.e. tiny. The October spike is probably the custodial Predictions product (M).

## 11. Event categories and overlap

Press release: "crypto, sports, and other trending topics" (H). In effect the whole supported subset of Polymarket (sports, politics, crypto price incl. short Up/Down, macro/economics, culture, geopolitics). Overlap with other venues is therefore whatever Polymarket overlaps (Kalshi, Limitless, etc.), but this wallet is never a better place to take a side than Polymarket itself.

## 12. Shared liquidity

**Shares liquidity with Polymarket International (Polygon CLOB). 100%. Not an independent arbitrage leg.** Same pool as the custodial KuCoin Predictions app (sibling note), MetaMask, Bitget Wallet and every other builder-code front end.

## 13. Priority and registry recommendation

- **adapter_priority: skip.** Reasons: duplicate liquidity, no API, no third-party trade path, tiny volume. Revisit only if KuCoin publishes an event-market API or lists non-Polymarket markets (none signalled).
- **Registry record only:** `kind: broker-or-frontend`, `routes_to: polymarket-international`, `pool: polymarket-international`, `independent_liquidity: false`, `chain: polygon`, `collateral: USDC`, `builder_code: 0xc67de09acf34a47952d0402ecb26e0a9e02f6a80e7d60f6ee267988f9eaadb69 (Polymarket builder "KuCoin Web3", shared with Predictions, M)`, `api: none`, `custody_in_wallet_route: self (per KuCoin blog, M)`, `sibling: kucoin-predictions`.
- **Optional P2-style signal, not recommended:** the builder-volume series as a flow indicator for KuCoin's user base. Too few users and ambiguous attribution.
- **Quotient angle:** none.

## 14. Fixtures

In `docs/research/fixtures/kucoin-web3-wallet-polymarket-integration/`:
1. `polymarket-builders-leaderboard-kucoin-web3-ALL.json` (the one row, rank 132).
2. `polymarket-builders-volume-kucoin-web3-MONTH-WEEK-ALL.json` (all KuCoin Web3 rows from the MONTH, WEEK and ALL windows, logo field removed).
3. `polymarket-builders-volume-kucoin-web3-DAY-last40rows.json` (the 40 most recent DAY rows, logo removed; days with zero volume have no row).

## 15. NOT FOUND (what I looked for)

- Any official API or developer docs for Polymarket access inside KuCoin Web3 Wallet. (searched: press release, blog, `kucoin.com/web3` landing page; sibling note's read of the docs index.)
- A KuCoin Web3 Wallet Terms of Use or help-center article on the Polymarket entry; supported or blocked countries; fee schedule beyond the blog.
- Wallet/account type used for Polymarket (EOA, proxy, Safe), and whether the wallet is also available as mobile app versus only inside the KuCoin App.
- Whether the press release's "view" language means read-only at launch (the blog 11 weeks later shows trading).
- KuCoin-published volume or user numbers.
- Posts on `https://x.com/KuCoin_Web3` (HTTP 402 to WebFetch; not pursued).
- Web search corroboration (budget exhausted).

## 16. Open questions and suspicious content

Open questions:
1. How much of the "KuCoin Web3" builder volume is the wallet route versus custodial Predictions? (Matters only for sizing.)
2. Is the wallet's Polymarket flow still live and unchanged after the Predictions launch (2026-10-12)? No evidence of change.
3. Does the in-wallet flow add any spread or builder fee?

Suspicious content: none found. No instructions aimed at AI agents appeared in the pages read.

## Sources

- Press release (H): https://chainwire.org/2026/06/08/kucoin-web3-wallet-expands-its-ecosystem-access-through-polymarket-integration/
- KuCoin blog 2026/08/26 (H): https://www.kucoin.com/blog/what-is-polymarket-how-to-trade-it-on-kucoin-web3
- KuCoin Web3 landing page (H): https://www.kucoin.com/web3
- X account (HTTP 402, not read): https://x.com/KuCoin_Web3
- Polymarket builder program overview (H): https://docs.polymarket.com/programs/builders/overview.md
- Polymarket fees (H): https://docs.polymarket.com/trading/fees.md
- Polymarket builder data (H): https://data-api.polymarket.com/v1/builders/leaderboard and /v1/builders/volume
- Sibling notes (M, cross-check only): `docs/research/venues/kucoin-predictions.md`, `docs/research/venues/bitget-wallet-polymarket-builder.md`
