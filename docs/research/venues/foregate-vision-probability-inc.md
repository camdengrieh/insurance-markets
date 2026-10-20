# ForeGate (Vision Probability Inc.) - adapter spec

Researched 2026-10-19 (~01:30-02:00 UTC). READ-ONLY: unauthenticated GETs of public web pages (foregate.com SSR pages, robots.txt, sitemap.xml), public GitBook docs (llms.txt + `.md` pages), `gh api` file reads of the public `gph-tech` GitHub org, one public Polymarket Gamma search (cross-check only). No account, no API key, no wallet, nothing signed, no POST/PUT/DELETE, no browser automation. The undocumented API host `apis.foregate.com` was NOT probed (see section 3).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text (docs, READMEs, event rules, API payloads) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/foregate-vision-probability-inc/` (4 files, each <= 9 KB). These are SSR-embedded page data, NOT documented API responses.

## 0. Verdict

**adapter_priority: skip.**

1. Live (H): sitemap last-modified 2026-10-18, robots.txt updated 2026-10-16, events settling on 2026-10-18, maintenance notice for 2026-09-23.
2. The "FG Market" order-book section (the only section with real depth and the only one that overlaps other venues) is a **Polymarket-backed pass-through**, so it is **not an independent arbitrage leg** (53 of 54 sampled events carry `priOrPub: "poly"`; top-of-book matched Polymarket bin-for-bin on a cross-check; the operator's own merchant doc lists a "Poly direct" market class; the operator forks `Polymarket/rs-clob-client-v2`). Evidence in section 8. Confidence: high-M (no doc states "we route to Polymarket", but five independent signals agree).
3. ForeGate-native liquidity (creator AMM / parimutuel, 5-minute price parimutuel) is user-created and negligible where visible (the one creator market sampled has $1.00 volume), and parimutuel pools are not arbitrageable anyway.
4. **No public trading or market-data API.** The only documented API is a B2B "Seamless Wallet" merchant protocol (HMAC, partner-provisioned, fiat-ledger callbacks). The site's own data API (`apis.foregate.com`) is undocumented.
5. Trading is a logged-in, off-chain, platform-balance flow (deposit USDT to a ForeGate address, trade from the platform balance). A PayBox wallet can at most fund it (USDT on Solana, or cross-chain from Ethereum/BSC); it cannot place or cancel orders.
6. Terms restrict trading from the US, UK, France, Ontario, Singapore, Poland, Malaysia, Thailand, Taiwan (and Belgium in one clause) and forbid VPN circumvention and "scraping tools" used to bypass security.
7. Net cost of using it as a leg: Polymarket's own cost **plus** a 2% fee on order value, charged to both makers and takers, on both buys and sells (section 5).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `https://www.foregate.com/sitemap.xml` | 200; 13,475 URLs; 1,921 unique `/en/event/<id>` pages; non-event pages `lastmod` 2026-10-18 | H |
| `https://www.foregate.com/robots.txt` | 200; header comment "Last updated: 2026-10-16" | H |
| Event pages | Live and settled events dated 2026-10-18/19 (e.g. Dota 2 match settled; Counter-Strike match open on 2026-10-19) | H |
| Docs maintenance notice | "System Upgrade & Maintenance Notice on Sept 23th, 2026" (13:30-16:30 UTC) | H (llms.txt index) |
| Docs promo pages | "Beginner Trade Protection, September 2026" (event period 2026-09-09 to 2026-09-29) | H (llms.txt index) |
| Docs product update | USDC delisted: USDC markets "settled without any outcomes at 00:00 (UTC) on May 29, 2026" | H |
| Third-party | lines.com affiliate review (Aug 2026): v1.0.0 launched 2026, founded 2025, no token, not CFTC DCM. Page has internal date inconsistencies (August and October 2026) and is promotional | M (`https://www.lines.com/prediction-market/foregate-review`) |
| GitHub org `gph-tech` created 2025-03-03; `fg-seamless-wallet-doc` pushed 2026-09-30; Polymarket client fork pushed 2026-08-13 | `gh api` | H |

Official domain (H): `https://www.foregate.com` (apex 301s to www). The lines.com review does not state it; it was found by probing `foregate.com`, and confirmed by the site footer ("(c) 2026 Vision Probability Inc"), the docs site (`https://foregate.gitbook.io/foregate-docs/`), and the docs' own links to `www.foregate.com`. Socials per site footer: X `@fore_gate`, Telegram `ForeGateOfficia`, Discord invite, support mailbox `help@foregate.com` (not contacted).

## 2. What it is

- **Kind**: onchain-other (Solana), but operationally a **web platform with an internal balance ledger**. Operator: Vision Probability Inc., described in the Terms as a Samoa-incorporated entity; governing law and arbitration are Panamanian (H, Terms of Use).
- **Sign-up (H, docs "How To Sign Up?")**: email, Google, X or Telegram (each "will generate your wallet, which requires no management on your behalf"), or "Connect your compatible Web3 wallet" via WalletConnect (Solana network). "No KYC required."
- **Custody (H/M)**: docs FAQ and Terms say non-custodial ("Your linked wallet controls your assets"; the Company "does not hold user assets"). But the funding flow is "deposit address -> balance visible in Overview" and the merchant protocol runs a fiat ledger plus a USDT "merchant margin" account at Foregate. Treat as custodial-in-practice (M; inferred from flow, not from a contract audit).
- **Three market classes (H, docs "Trading Basics")**:
  1. **Main Market / "FG Market"** - order book (limit and market orders; Yes/No shares priced $0-$1; docs mention merge/split). USDT only. This is the Polymarket-backed class (section 8).
  2. **Creator Market** - user-created markets, two mechanisms: constant-product AMM (x*y=k, split collateral into YES+NO, swap) and pari-mutuel pool. Trade in USDT or FGUSD.
  3. **Price Market** - short-window crypto up/down parimutuel pools (e.g. 5-minute rounds, BTC/USDT). USDT only.
- **Outcome tokenisation**: binary Yes/No shares; a winning share settles at $1. For FG Market the shares are platform-ledger positions (no public token addresses found). For Creator AMM/parimutuel the repos show Anchor programs on Solana (section 9) (M: repo configs, not verified on-chain).
- **Categorical events** appear as a parent event with many binary child markets (e.g. per-bin temperature markets, game-winner and O/U markets inside one match event), mirroring Polymarket's event structure (H, fixtures).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Public docs | GitBook `https://foregate.gitbook.io/foregate-docs/` (index `.../llms.txt`; every page available as `.md`). **No API/developer section for trading or market data.** NOT FOUND (searched: llms.txt full index, grep of the ~18 docs pages I downloaded for "API", "SDK", "websocket", "developer", "OpenAPI", "program id", "audit") | H |
| Official public REST/WS for markets, books, trades | **NOT FOUND.** `foregate.com` event/listing pages load markets client-side. The page head has `dns-prefetch` for `https://apis.foregate.com` and `wss://apis.foregate.com/socket` (the site's own backend/socket host). Paths, auth and limits for market data are undocumented. Not probed, because the ToS bar reverse engineering/"scraping tools" and the task rules allow GETs only to documented API hosts | H (host exists in page source) / unknown (everything else) |
| Documented B2B API (partners only) | `fg-seamless-wallet-doc` v1.2, updated 2026-09-30, in public repo `gph-tech/fg-seamless-wallet-doc` (`docs/merchant-integration.md`, Chinese). `FG_API_BASE` prod `https://apis.foregate.com`, test `https://devtssapis.foregate.com`. Merchant-callable: `POST /api/user/partner/session/launch`, `POST /api/user/partner/users/status`, `GET /api/orderv2/partner/orders[/{orderId}[/detail]]`, `GET /api/orderv2/partner/merchant/balance`, `GET /api/orderv2/partner/merchant/ledger`. Merchant must host `/wallet/{balance,freeze,debit,unfreeze,credit,transaction-sync}` callbacks. Auth: `sign = hex(HMAC-SHA256(secret, merchantId + requestTime + nonce + action))`, 120 s clock skew, merchant-specific secrets and IP allow-lists. Users trade inside a Foregate page opened via `launchUrl`; "merchants do not place orders on behalf of users." Not usable by an anonymous aggregator | H |
| SSR event pages | Each `https://www.foregate.com/en/event/<marketId>` embeds the full event object in its Next.js flight data: `marketId, title, category, marketType, creatorType, priOrPub, status, volume, liquidity, makerFee, takerFee, endTime, rules, dataResource, poolAddress` and `outcomes[].options[]{optionId, title, price, priceBuy, priceSell}`. Event ids are enumerable from `sitemap.xml`. This is the only public price source I found; it is a page render (likely cached, not documented, not stable) and gives top-of-book only (no depth, no trades) | H (fixtures) |
| Rate limits / auth for public data | NOT FOUND | - |
| WebSocket | `wss://apis.foregate.com/socket` referenced in page head only; protocol undocumented | H (existence) |
| On-chain / subgraph | Anchor programs for Creator/Price markets exist (section 9); FG Market is off-chain | M |

Open data hazard: `sitemap.xml` is 2.4 MB; do not poll it.

## 4. Trade path and PayBox reachability

- **Programmatic order placement**: none documented for end users. The order API behind the site is undocumented; the documented partner API explicitly excludes order placement by merchants. No signing scheme for orders is published (NOT FOUND, searched: docs, `gph-tech` repos, llms.txt).
- **Login**: email / Google / X / Telegram session, or WalletConnect on Solana with a wallet-signed login prompt ("Sign the transaction prompt(s)") (H, docs). Optional Google Authenticator MFA.
- **Funding (H, docs "How To Deposit?" and Essential FAQ)**: send **USDT on Solana** to the per-account deposit address shown after login; or "cross-chain deposit" from Tron, BSC, Ethereum (and TON per the FAQ) via a one-time time-limited MPC escrow address with quoted bridge, gas and service fees; or local fiat QR rails (VN, PH). Only USDT is credited ("Do not deposit anything other than USDT").
- **PayBox (verdict: no)**: PayBox's chain catalog includes Solana, Ethereum, BNB Smart Chain (H, `docs/research/06-paybox-platform.md`), so a PayBox wallet could *transfer* USDT to a ForeGate deposit address, but the address is only revealed inside a logged-in session, and nothing can then place, cancel or read orders without a browser session. There is no transaction-proposal or signed-order path. Any scripted use of the private site API would run into the ToS (section 7) and, for FG Market, would trade the same liquidity as Polymarket at a worse price. Trade Polymarket directly instead.

## 5. Fees

All H unless noted (docs "Fee Structure", `https://foregate.gitbook.io/foregate-docs/market-types-and-mechanisms/events-and-matches/fee-structure`; event JSON fields `makerFee/takerFee/buyFee/sellFee`).

| Class | Fee |
|---|---|
| FG Market (order book) | Maker **2%** and taker **2%** of order value (`shares x average price`), charged to the trader on both buy and sell. Claim fee 0%. Event JSON confirms `makerFee = takerFee = buyFee = sellFee = 0.02`; also `platformFees: 0.3` (meaning undocumented) |
| Creator AMM | 2% trading fee on buys and sells (already netted from proceeds); **2% claim fee** |
| Creator pari-mutuel | no wager fee; **10% claim fee** on winnings (the sampled creator pari-mutuel event JSON shows `fee 0.01`, `buyFee 0`; conflicts with the docs, unresolved) |
| Price Market | no wager fee; **10% claim fee** |
| Chain / deposit | Solana network fee ("a fraction of one cent" per lines.com, M); cross-chain deposits quote bridge + gas + platform service fees. Challenge bond 500 USDT/USDC (section 6) |

Note for edge math: "2% of order value" at price p means 0.02p per share, per side. A round trip (buy then sell before resolution) costs about 0.02(p_buy + p_sell). Buy-and-hold to settlement costs 0.02 p_buy only. This is charged on top of whatever the Polymarket-side market costs the platform (unknown to users).

## 6. Resolution and dispute risk

- **FG Market (H, docs "How the Resolution Process Works?")**: after close, "ForeGate provides the outcome via the oracle" (the platform proposes), then a **2-hour challenge period** (holders may dispute with evidence and a **500 USDT** bond, refunded if they win, forfeited to the "platform's risk control fund" if they lose), then **24 hours of "operation team" verification**, then claims. The oracle is not named; for Polymarket-backed events the settlement source is presumably Polymarket's (UMA) result (M/L - not stated).
- **Creator markets**: creator settles within 24 h of close; challenge window and bond as above; if the creator does not settle, the pool is paid out at closing marginal share prices (e.g. 0.3/0.7 -> 30%/70% of the pool). Automatic settlements "cannot be challenged" (Terms).
- **Rules text**: Polymarket-backed events carry Polymarket's rule text and resolution sources (e.g. dotabuff.com, with a 2-hour fallback to "a consensus of credible reporting") (H, fixture).
- **Risk (M)**: centralized final say by the operator team; settlement can diverge in timing and, in edge cases, in outcome from the upstream venue; ForeGate also has its own `endTime` (e.g. 2026-12-31 vs Polymarket's 2027-01-15 on one LoL event), so deadlines are not identical across the two venues. Liability cap in Terms: USD $100 (H).
- **Smart-contract trust (M)**: parimutuel docs show `resolve_pool` signed by the pool creator and operator-only `emergency_withdraw`, `update_deadline`, `system_claim_pool`; the binary price program's `execute_round` takes operator-supplied prices and bet totals. These are operator-controlled ledgers, not trust-minimized.

## 7. Geo, ToS and automation

(H, `https://foregate.gitbook.io/foregate-docs/legal/terms-of-use`, fetched 2026-10-19.)

- Restricted Persons barred from trading: those in or incorporated in "United States, United Kingdom, France, Ontario (Canada), Singapore, Poland, Malaysia, Thailand, Belgium, Taiwan" (section 1; section 4.1 lists the same minus Belgium) plus sanctioned regions (Iran, Syria, Cuba, North Korea, Crimea, Donetsk, Luhansk). Restricted persons may use "Content Features" only. "VPNs or similar circumvention tools are strictly prohibited."
- Section 4.2 prohibits bypassing security measures "(e.g., VPNs, scraping tools)", overloading the site, and reverse engineering or redistributing the Site/Features. There is **no dedicated bot/API policy**, so automated trading via the site is at best undefined, and use of the private API is arguably barred.
- Not a CFTC-registered venue (lines.com, M). Terms say neither the Company nor Vision Probability "operates a cryptoasset or derivatives exchange, offers trade execution/clearing services, or controls user transactions."
- Implication: the project's operator must check their own jurisdiction against this list; a US operator cannot use it.

## 8. Liquidity, independence and event overlap

**Liquidity numbers**
- Platform volume / TVL / OI: **NOT FOUND** (searched: docs, lines.com review, DefiLlama protocol page returned HTTP 403, site stats absent from SSR pages). No ForeGate-native figure can be given.
- Event count: 1,921 unique event pages in the sitemap (2026-10-19) (H). Event-level `volume` on the SSR pages is Polymarket-scale (see below), so it says nothing about ForeGate-native depth.
- Creator markets: one sampled live creator pari-mutuel market ("Can XAUT Hold Above $5,555 Before 2027?", Binance XAUT/USDT settlement) shows `volume = 1.00` (H, fixture). One sample, not a statistic.

**Shared liquidity with Polymarket (the key finding)**

| Signal | Observation | Tag |
|---|---|---|
| Source flag in event JSON | 53 of 54 sampled sitemap events: `priOrPub: "poly"`, `marketType/modelType: "orderbook"`, `creatorType: "Operation"`; the other was a user-created `PARIMUTUEL`/`Creator` market (sample biased to newest ids; may undercount native markets) | H (fixtures `sitemap-and-sample-stats.json`) |
| Operator's own doc | Merchant protocol lists test scenarios for "ordinary order book, periodic market, **Poly direct** (Poly 直连)" and says each must be tested separately | H (`gph-tech/fg-seamless-wallet-doc`) |
| Same events, rules and images | Titles, rule text and logos (`polymarket-upload.s3.us-east-2.amazonaws.com/...`) are identical to Polymarket's, e.g. event `dota2-gorgc-sbt-2026-10-18` | H |
| Same top of book | London "Highest temperature ... October 20" (ForeGate event 469297798794187426 vs Polymarket slug `highest-temperature-in-london-on-october-20-2026`): ForeGate Yes `priceBuy/priceSell` equal Polymarket `bestAsk/bestBid` exactly on 8 of 11 bins (7C-12C, 16C, 17C; e.g. 10C 0.009/0.001, 11C 0.017/0.004, 12C 0.09/0.07, 16C 0.019/0.005); 13C and 15C match on one side only and 14C differs by 2-4 ticks, consistent with page-cache lag (fixture `topofbook-compare-foregate-vs-polymarket-london-temp.json`). Single event, single moment | H |
| Same volume scale | Settled Dota event: ForeGate `volume` 442,426.99 vs Polymarket event volume 442,755.44. LoL ranking event 171,307.98 vs 172,307.99. A live CS event differs more (34,099 vs 44,650; ForeGate lists only 4 of ~14 child markets). Not exact, but not ForeGate-native volume | H/M |
| Client library | The operator org `gph-tech` holds an unmodified fork of `Polymarket/rs-clob-client-v2` (created 2026-08-13, MIT) | H |

Conclusion: for the FG Market class, treat ForeGate as a **re-skin of Polymarket liquidity with an extra 2% fee**, not an independent leg. Whether orders physically route into Polymarket's CLOB is not documented (M); either way the price information duplicates Polymarket.

**Event categories on FG Market (all duplicated from Polymarket)**: sports (soccer, NHL, MLB, NFL, tennis challengers, basketball), esports (Dota 2, CS, LoL, Valorant), politics (e.g. 2028 US presidential winner), weather (daily highest temperature by city), futures/season markets. Macro and crypto-price series are not seen in the sample (crypto price lives in the separate parimutuel Price Market).

## 9. On-chain components (from the operator's GitHub repos; M, not verified on-chain)

Repos under `https://github.com/gph-tech` (linked from foregate.com schema.org `sameAs`: `gph-tech/fg-frontend-user`, which is not publicly readable):
- `contract` / `cfmm-prediction-market`: Anchor CFMM program; Anchor.toml mainnet id `BAVbwU5n3cgRuutnqYkZ6SV1qzjmpDdnHKamE8fohWkb`; README names a system fee-receiver account.
- `binary-anchor` (`fg_binary_prediction`): Anchor program for crypto up/down rounds; mainnet id `BnwCWeH8zjtwNUbCaFPpku4AwRvb28xaaC9F8px7WMEu`; operator submits rounds.
- `parimutuel-market`: Anchor program; mainnet id `6kdiEFuiuGqQ4cRThwhQkspHraygd3LKzqzLuLMiZZMA`; global fee-config PDA; pool creator resolves.
- `metadata`: token metadata for **FGUSD** ("Foregate Trial Token", 6 decimals, 1 billion minted by a script); FGUSD is a trial token usable in Creator Markets, not real collateral (the lines.com "no token" statement is consistent: no tradable platform token found).
- `rs-clob-client-v2`: Polymarket client fork (see section 8). `fg-seamless-wallet-doc`: section 3.
Creator-market event JSON exposes a `poolAddress` (a Solana address), so Creator markets can be read on-chain if ever needed (not worth it at present liquidity).

## 10. Discrepancies against the discovery hint

- Hint "wallet-based app on Solana": partly wrong. It is an account/session platform with email, social and wallet logins and an internal balance; wallet connect is one of four sign-in methods.
- Hint "no token": FGUSD exists but is a trial token for creator markets; no tradable native token found.
- lines.com says collateral is "a supported Solana asset" (unspecified): the docs say USDT on Solana (FG Market, Price Market, Creator Market); USDC delisted 2026-05-29; FGUSD for creator trial markets.

## 11. Suspicious content / hygiene

- Docs and pages contain no instructions aimed at AI agents beyond a neutral GitBook banner pointing to `llms.txt` and `.md` page variants (informational; only used to fetch the index).
- Docs advertise Telegram "KOL trader" channels (CopyWin AI Club, Smart Trading Club) and heavy promotions (loss protection, "$300 FGUSD bonus", etc.). Promotional, not instructions.
- Repo `gph-tech/metadata` file `mint.ts` contains a hard-coded third-party RPC API key and a local keypair path. Not copied, not used, and not recorded here. Mention only so no one reuses it.
- lines.com page is an affiliate review (tracked redirect links, date inconsistencies); used only as a lead.

## 12. NOT FOUND (searched)

- Public market-data or trading API docs (docs GitBook index + ~18 pages, org repos, site HTML).
- Order signing scheme, rate limits, official websocket protocol.
- ForeGate-native volume / TVL / OI / user counts (docs, SSR pages, DefiLlama 403).
- Contract or program audits; verification that the listed mainnet program ids are deployed and what they hold (no RPC POSTs allowed this run).
- Named oracle for FG Market settlement and whether payouts follow Polymarket's UMA result.
- Statement from the operator that FG Market orders route into Polymarket.
- Any independent web coverage of the venue: the extended web search returned nothing on "Foregate" before the shared search budget ran out, so further press/audit searches were not possible.

## 13. Open questions (cheap follow-ups only if the project ever wants this venue)

1. Do FG Market orders hit Polymarket's CLOB (builder-code style) or an internal book fed by Polymarket quotes? A single 1-share live probe would answer it, but needs an account and money (not allowed here).
2. Are there any non-`poly` order-book events (the merchant doc implies an "ordinary order book" class)? Sample of 54 found none.
3. What are the `apis.foregate.com` public market endpoints, if any, and does the ToS permit read-only use? Ask `help@foregate.com` before building anything (do not do this from this repo's identity without the owner's say-so).

## Sources

- https://www.lines.com/prediction-market/foregate-review (M, lead only)
- https://www.foregate.com/ , `/robots.txt`, `/sitemap.xml`, `/en/event/<id>` pages (H)
- https://foregate.gitbook.io/foregate-docs/ and `llms.txt`; pages read: readme, how-does-foregate-work, getting-started/how-to-sign-up, getting-started/how-to-deposit, market-types-and-mechanisms/events-and-matches/{trading-basics,fee-structure,understanding-the-orderbook,event-market-details,creator-market-details,creator-market-details/{amm-market,pari-mutuel-market,how-the-resolution-process-works}}, announcement-center/product-updates/notice-of-delisting-usdc-on-may-29th-2026, affiliate-program/foregate-faq-or-essential-guide, legal/terms-of-use (H)
- https://github.com/gph-tech (repos `metadata`, `contract`, `binary-anchor`, `parimutuel-market`, `rs-clob-client-v2`, `fg-seamless-wallet-doc`) via `gh api` (H)
- https://gamma-api.polymarket.com/public-search (cross-check only, H)
- `docs/research/06-paybox-platform.md` for PayBox chain catalog and proposal kinds (H, 2026-10-19)
