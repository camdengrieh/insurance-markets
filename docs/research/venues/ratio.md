# Venue spec: Ratio (ratio.you)

Researched 2026-10-19. Read-only: public unauthenticated GETs, the vendor's own site/docs, DefiLlama's public API and adapter source (read with `gh api`), Apple's public lookup API, and Polymarket's public builder leaderboard. No account, wallet, key, signing, POST or PayBox tool was used. Fixtures: `docs/research/fixtures/ratio/`.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary/inferred; **L** = weak or stale (older than 6 months).

## 0. Verdict

- **Kind:** broker/front-end (mobile copy-trading and wallet-tracking app) on top of Polymarket's global CLOB. Not a market venue: it creates, matches and resolves nothing. [H] https://ratio.you/terms ("WE DO NOT CREATE, OPERATE, OR MANAGE ANY PREDICTION MARKETS")
- **Status: winding down. Trading is switched off.** Ratio's own page says "New trades and copy trading are turned off, and automatic copying is turned off." Only closing positions, claiming resolved markets and withdrawing cash still work. [H] https://ratio.you/migrate-to-polymarket (fetched 2026-10-19). The marketing homepage (https://ratio.you/) and docs (https://docs.ratio.you/) still describe the live product and were not updated, so a reader of those alone would be misled. [H]
- **Independent liquidity: none.** Every order goes to Polymarket's global order book. It is a distribution channel for Polymarket, so it can never be a separate arbitrage leg. [H] https://docs.ratio.you/ (copy trading FAQ)
- **Public API: none found.** [H, absence] see section 3.
- **adapter_priority: skip.** The only residual value is a copy-trader reputation signal, which the Polymarket Data API gives directly for any wallet (and Ratio's own leaderboard was derived from Polymarket wallets).

## 1. Is it still live? (2026)

| Evidence | Finding | Tag |
|---|---|---|
| https://ratio.you/migrate-to-polymarket | "Ratio is winding down trading." Reason given: "focusing on other things and can no longer support trading reliably". No date on the page. Meta description: "Ratio is winding down trading. Close your open positions, export your private key, and load your wallet into Polymarket." | H |
| Same page, FAQ | "Can I still trade on Ratio? No. New trades and copy trading are turned off, and automatic copying is turned off. You can still close open positions, claim resolved markets, and withdraw your cash in the app." | H |
| https://ratio.you/sitemap.xml | Every page, including `/migrate-to-polymarket`, has lastmod 2026-10-14T18:11Z. That looks like a site-wide deploy stamp, so the notice dates to on or before 2026-10-14 (not a per-page date). | M |
| Apple lookup API (`itunes.apple.com/lookup?id=6756633383&country=us`), fixture `itunes-lookup-ratio-2026-10-19.json` | v1.0.23 released 2026-10-15, release notes "Deprecated features". Seller Quad Innovations Inc., bundle `you.ratio.trade`, 106 ratings, avg 4.35, first release 2026-01-23. | H |
| DefiLlama fees series (`api.llama.fi/summary/fees/ratio`) | Fee-wallet inflows: $2,420 on 2026-10-12 (the largest day on record), then 89.62, 146, 55.59, 7.11, 30.07, 27.15 for 10-13 to 10-18. Consistent with a final burst of position closing then a trickle. Series starts 2026-02-17. | M |
| https://docs.ratio.you/sitemap.xml | Docs lastmod 2026-10-08, i.e. before the wind-down notice. | H |
| WebSearch (extended) for the wind-down | No independent press or social coverage found. The search tool surfaced only Ratio's own promotional blog (latest post 2026-10-08) and affiliate listicles. | M |

Conclusion: not a live trading venue as of 2026-10-19. Residual state is a "close and withdraw only" app. Whether the app/servers disappear entirely is NOT FOUND (searched: ratio.you, App Store, DefiLlama, web search).

Side finding: `https://ratio.you/docs` returns a Cloudflare 403 ("DNS points to prohibited IP | docs.ratio.you") while `https://docs.ratio.you/` itself returns 200. WebFetch of `/docs` therefore fails; use the docs host directly. [H]

## 2. Kind, market model, tokenisation

- **Kind:** social/copy-trading front end. Features per docs: follow any Polymarket wallet (needn't be a Ratio user), manual copy ("My Picks") or automatic copy, safety limits, XP/cashback, referrals, social posts. [H] https://docs.ratio.you/
- **Market model:** identical to Polymarket's global CLOB (binary/neg-risk outcomes, ERC-1155 conditional tokens, central limit order book). Ratio adds nothing. Automatic copies are **Fill-and-Kill market orders** on Polymarket's book ("Whatever can fill at the available prices fills right away, and any unfilled remainder is cancelled"). [H] https://docs.ratio.you/ (FAQ). For Polymarket's own market/outcome model see `docs/research/08-venues-polymarket-kalshi.md`; it is not re-researched here.
- **Not connected to Polymarket US:** "Ratio places orders on Polymarket's global exchange on Polygon. Polymarket US ... is not connected to Ratio." [H] https://docs.ratio.you/

## 3. Read API

`exists: none` (no official public API).

- NOT FOUND (searched: ratio.you, ratio.you/docs, docs.ratio.you pages and sitemap (a single page, no developer/API section), ratio.you/api (404), api.ratio.you (does not resolve), the blog index of 64 posts (no API/developer post), App Store listing, web search "Ratio API"). [H, absence]
- The app's backend (feeds, leaderboards, wallet P&L) is private and undocumented. Terms prohibit access "using any unauthorized or automated means, such as bots, crawlers, or data mining tools". [H] https://ratio.you/terms (dated Nov 22, 2025; stale by the 6-month rule, L for currency, but it is the only ToS)
- Nothing to fixture from Ratio itself. The saved fixtures are third-party views of Ratio: DefiLlama fee series and protocol record, Polymarket builder-leaderboard rows, Apple lookup record, and plain-text captures of Ratio's migration page and docs.
- Equivalent data for an aggregator comes from Polymarket (Gamma, CLOB, Data API) per `docs/research/08-venues-polymarket-kalshi.md`.

## 4. Trade path, wallets, PayBox reachability

- **Programmatic order placement through Ratio: none.** There is no API, and the product is now trade-disabled. [H]
- **Mechanism (for understanding only):** the app sizes a copy per follower, applies limits, and "sends each order to Polymarket's order book" from a wallet "handled for you" (wallet, signing and transactions). Login is Apple or Google; no invite code. [H] https://docs.ratio.you/ . The wallet is described as "a wallet on Polygon that only your private key controls", exportable at `ratio.you/export-private-key`. [H] https://ratio.you/migrate-to-polymarket . Which embedded-wallet provider holds the key, and whether the "Polymarket should recognize that wallet" statement means an EOA or a Polymarket proxy/Safe wallet: NOT FOUND (searched: terms, docs, migrate page, privacy-policy not read in full).
- **Builder attribution:** Polymarket's public builder leaderboard lists a verified builder "Ratio.you" (builder code `0xb47927b67cc69d0fab17a2555724f73967199b9a18bb7369893cac4d713f788e`). So Ratio orders carry a Polymarket builder code. [H] fixture `polymarket-builder-leaderboard-ratio-rows-2026-10-19.json` (GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL&limit=50&offset=50 etc.)
- **PayBox reachability: no, via Ratio.** An EVM wallet on Polygon reachable through PayBox could not "trade Ratio": Ratio exposes no signing endpoint or contract, and its wallet is Ratio-provisioned. The route to the same liquidity is Polymarket directly (signed EIP-712 orders to the CLOB), which belongs to the Polymarket spec, not this one.
- Funding routes the app offered, for completeness: card via Stripe (min $5), crypto deposits from Solana, Base, Ethereum, Arbitrum, Optimism, BNB Chain, Bitcoin, plus "Blink" passkey deposits (USDC/USDT from Ethereum, Base, Arbitrum, Polygon, BNB, Solana, Monad, HyperEVM); withdrawals in USDC to Base, Polygon, Ethereum, Arbitrum, Optimism or Solana (min $2, $5 on Ethereum). "Deposits are converted automatically into the dollar collateral Polymarket trades in." [H] https://docs.ratio.you/

## 5. Chains and collateral

- Trading and custody chain: **Polygon**. [H] migrate page; DefiLlama chain = Polygon [H] `api.llama.fi/protocol/ratio`
- Collateral: Polymarket's dollar collateral. DefiLlama's fee adapter counts "USDC and PUSD" arriving in the fee wallet, consistent with Polymarket's pUSD collateral described in `docs/research/08-venues-polymarket-kalshi.md` (see that file, not re-verified here). [M]
- Ratio's fee wallet on Polygon (third-party public address, from the adapter): `0x04F88Cf97d33F1Ec4659e7976607A64A85F05154`. [H] https://github.com/DefiLlama/dimension-adapters/blob/master/fees/ratio/index.ts

## 6. Fees

- **Ratio:** "Ratio's standard fee is 2.5% of each trade, before cashback", applied on buys and sells; cashback rises with XP level; a friend's referral code gives 10% off the fee. [H] https://docs.ratio.you/ (Fees, XP and cashback). Who pays: the trader/copier. Referral payouts: 20% / 10% / 5% of the fee across three referral levels, plus 20% for trades from a post and 10% when someone copies your trade. [H]
- **Polymarket:** its own taker fee on some categories is charged on top. [H] https://docs.ratio.you/ ("Polymarket's fee"); formulas are in `docs/research/08-venues-polymarket-kalshi.md`.
- Terms say Ratio "may charge fees" and may change them "at any time without notice". [H] https://ratio.you/terms section 6.
- Open reconciliation (M): Polymarket's leaderboard shows $6.86M all-time builder-attributed volume, and 2.5% of that would be about $171k, but DefiLlama counts only $34,181 of fee-wallet inflow. Cashback, referral payouts, partial attribution or other fee routing could explain it; not resolved.

## 7. Resolution and dispute risk

Ratio does not resolve anything. Outcomes follow the underlying Polymarket market's rules and oracle; see `docs/research/08-venues-polymarket-kalshi.md`. Ratio's added risks are operational, not oracular: it is closing, so positions "with no buyers" cannot be cashed out in-app and must be managed from Polymarket after exporting the key. [H] migrate page. Counterparty risk on Ratio itself is low per its claim that it never held funds ("Ratio never held your funds"), but that is the company's own statement. [H for text, M for truth]

## 8. Geo, ToS, automation

- Terms (dated Nov 22, 2025, so older than 6 months, L for currency): services "NOT OFFERED TO" persons in the United States or any Restricted Jurisdiction/sanctioned country; prohibit use "in or from any Restricted Jurisdiction"; prohibit bots/crawlers/data mining of the Services. [H] https://ratio.you/terms
- Migration page: Polymarket's global exchange "blocks restricted regions (including the United States)"; US users are told to withdraw cash instead. [H]
- App Store: US storefront listing, 18+, "Access and features vary by location and third-party service." [H] Apple listing via WebFetch; the lookup API record is in the fixture.
- Automation: no API, so none permitted by design; scraping the app/API is contrary to the terms. For an aggregator the correct move is to use Polymarket data, not Ratio.

## 9. Liquidity (with dates)

Ratio has no liquidity of its own; the figures below are order flow it routed to Polymarket.

| Metric | Value | Source | Tag |
|---|---|---|---|
| All-time builder-attributed Polymarket volume | $6,857,072; 1,295 active users; builder rank 76 | Polymarket builder leaderboard, `timePeriod=ALL`, fetched 2026-10-19 | H |
| Last-month window | $507,430; 108 active users; rank 60 | same, `timePeriod=MONTH`, 2026-10-19 | H |
| Last-week window | $6,806; 8 active users; rank 87 | same, `timePeriod=WEEK`, 2026-10-19 | H |
| Last-day window | Ratio not among the 50 rows returned | same, `timePeriod=DAY`, 2026-10-19 | M |
| Fees (DefiLlama) | 24h $27.15; 7d $2,776; 30d $5,953; all-time $34,181 (from 2026-02-17) | `api.llama.fi/summary/fees/ratio`, 2026-10-19 | H |
| TVL | none (DefiLlama lists no TVL; category "Prediction Market", chain Polygon) | `api.llama.fi/protocol/ratio` | H |

Window definitions of the leaderboard (rolling vs calendar) are not documented in what I read. Treat the DAY/WEEK/MONTH rows as approximate (M).

## 10. Event categories and overlap

Ratio offers no market catalogue of its own; its surface is "the best Polymarket wallets", so its categories are Polymarket's (sports, politics/elections, geopolitics, crypto price incl. 5-minute BTC markets, commodities, entertainment, per its blog titles). [M] https://ratio.you/blog. Those overlap Kalshi, Limitless, Predict.fun and others only through Polymarket. Ratio is never an arbitrage leg.

## 11. Shared liquidity

Shares 100% of its liquidity with Polymarket (global CLOB on Polygon). Not an independent leg; any scanner that lists both would double-count. [H] https://docs.ratio.you/

## 12. Priority

**skip.** Trading is off, there is no API, liquidity is a strict subset of Polymarket, and the product's remaining users are exiting. Revisit only if (a) Ratio relaunches, or (b) the aggregator wants a "copy-trader quality" feature, in which case compute it from Polymarket's Data API rather than from Ratio.

## 13. Open questions

1. Exact date of the wind-down notice (page is undated; sitemap lastmod 2026-10-14 is probably a deploy stamp).
2. Whether the app and servers go dark entirely, and by when (no sunset date published).
3. Which embedded-wallet provider and which Polymarket wallet type backed user wallets.
4. Why DefiLlama fee-wallet inflow (about $34k) is far below 2.5% of builder volume ($6.86M).
5. Whether Ratio had any API, partner or data-licensing program (none documented).

## Sources

1. https://ratio.you/ , https://ratio.you/migrate-to-polymarket , https://ratio.you/copy-modes , https://ratio.you/terms , https://ratio.you/sitemap.xml , https://ratio.you/blog (64 posts, latest 2026-10-08) , fetched 2026-10-19 [H]
2. https://docs.ratio.you/ and https://docs.ratio.you/sitemap.xml , fetched 2026-10-19 [H]
3. https://apps.apple.com/us/app/ratio-prediction-markets/id6756633383 and https://itunes.apple.com/lookup?id=6756633383&country=us , 2026-10-19 [H]
4. https://api.llama.fi/protocol/ratio , https://api.llama.fi/summary/fees/ratio , https://github.com/DefiLlama/dimension-adapters/blob/master/fees/ratio/index.ts (read via `gh api`) , 2026-10-19 [H]
5. https://data-api.polymarket.com/v1/builders/leaderboard (ALL, MONTH, WEEK, DAY windows) , 2026-10-19 [H]
6. WebSearch (extended) results: ratio.you/blog posts, polymart.app/ratio-you (third-party listing, not fetched), App Store; no independent wind-down coverage found [M]
7. Repo cross-reference: `docs/research/08-venues-polymarket-kalshi.md` for Polymarket mechanics [H, internal]

## Fixtures (docs/research/fixtures/ratio/)

- `defillama-fees-ratio-2026-10-19.json` (16 KB): DefiLlama fee series for Ratio.
- `defillama-protocol-ratio-2026-10-19.json`: DefiLlama protocol record.
- `itunes-lookup-ratio-2026-10-19.json` (10 KB): Apple listing record.
- `polymarket-builder-leaderboard-ratio-rows-2026-10-19.json`: Ratio.you rows (ALL/MONTH/WEEK/DAY) plus rank-1 rows.
- `ratio-migrate-page-text-2026-10-19.txt`, `ratio-docs-text-2026-10-19.txt`: plain-text captures of Ratio's own pages (tags stripped).

## Suspicious content

None aimed at AI agents. The migration page instructs end users to export their wallet private key and import it elsewhere; that is user-facing, was not followed, and is irrelevant to the task. The homepage and docs keep stale "live product" marketing after the wind-down notice. Ratio's blog is SEO-style promotional content (for example an "Honest Comparison" of rivals).
