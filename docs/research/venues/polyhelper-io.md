# PolyHelper.io - venue spec

Researched 2026-10-19. Read-only: polyhelper.io, its GitBook docs, privacy policy, Chrome Web Store listing, and unauthenticated GETs to Polymarket's Data API and CLOB builder-trades endpoint. No account, wallet, signing, POST or payment. Generic User-Agent `insurance-markets-research/0.1` only.

Tags: H = read first-hand this session (URL cited); M = secondary or inferred; L = weak or stale.

A deeper same-day note exists at `docs/research/venues/polyhelper.md` (sibling task; its 30-day volume, USD-notional and fee-rate statistics are carried here as M, not re-derived). A third file, `polyhelper-predictions.md`, covers the DefiLlama record. This file is the canonical one for the `polyhelper-io` slug.

## Verdict

- Adapter priority: **skip**. PolyHelper is **not a venue**. It is a free Chrome/Brave browser extension that overlays analytics panels on polymarket.com, plus a points programme. Its only trading footprint is orders routed to **Polymarket's CLOB** with PolyHelper's builder code attached. It has no market, book, oracle or collateral of its own, so it shares 100% of its liquidity with Polymarket and can never be an independent arbitrage leg (H: https://polyhelper.io/, privacy policy, Polymarket leaderboard).
- Residual value: (a) UI idea, the extension's "Bookmaker Odds" panel (Polymarket price vs sportsbook odds vs edge) is the same concept as this project's cross-venue edge view; (b) a labelled slice of Polymarket flow via the public builder-trades feed (weak signal, see Liquidity).

## Liveness

Live as of 2026-10-19 (H).

- polyhelper.io returned HTTP 200, `last-modified` 2026-09-29 (H, curl).
- Chrome Web Store listing "Polyhelper", id `mebiclnfcnknilfaoanimpaeimjlafmg`, version 1.0.13, updated 2026-09-30, 693 users, 5.0 from 18 ratings, "Works only on polymarket.com, minimum permissions" (H, WebFetch summary of https://chromewebstore.google.com/detail/polyhelper/mebiclnfcnknilfaoanimpaeimjlafmg). Landing page shows "0 traders installed" which looks like a placeholder (H).
- Polymarket builder-trades feed returned PolyHelper-attributed rows with `createdAt` 2026-10-19T05:15Z to 07:16Z (H, fixture).
- Name collision: a different extension "Polyhelper: Enhanced Polymarket Experience" (id `pjhioanepclmboeipijmldkdgbaipdpj`, top-holder PnL only, listing about 16 months old) exists and is not the same product (M, WebSearch result).

## Kind and market model

- Kind: broker/frontend/analytics overlay. Docs: 25+ panels (crypto, stocks, macro, X feed, top-holder PnL, sports/esports/UFC, Bookmaker Odds, trader tracker, LP rewards, bonds scanner, polls, weather). It says it works "without modifying or replacing any native features" (H, https://polyhelper.gitbook.io/polyhelper-docs).
- Market model: whatever Polymarket has (binary and multi-outcome CLOB, ERC-1155 conditional tokens). PolyHelper adds none (H by construction).
- Claims conflict (treat each as L): docs say read-only / cannot place orders; the landing page shows a "Polymarket Builders Badge - Supported & approved by Polymarket"; the privacy policy dated 2026-09-25 says the product includes "an API" and "a builder analytics panel", processes "trading and order status", and "Trading requests go to Polymarket's CLOB service" (H). Polymarket's feed does attribute real trades to the builder code (H), so order submission exists in some form even if docs deny it.

## Chains and collateral

- Polygon (Polymarket's settlement chain) (M; DefiLlama lists chain Polygon per sibling note). Collateral is Polymarket's, not re-verified here (M). PolyHelper holds no funds; "no wallet access" claims are third-party (L).
- Builder code (public attribution id): `0xb05677aa676cd5aeab7e8d85ef83836ee1bf4e3de5519d5bbb6594484b51a805`, name "PolyHelper.io", verified (H, https://data-api.polymarket.com/v2/builders/leaderboard?time_period=all).
- No PolyHelper token exists; the site promotes points toward a hoped-for share of a Polymarket token drop ("Up to 50% of the Polymarket drop that PolyHelper receives" to top 1,000 users) with the disclaimer "All drop mentions are just assumptions" (H, polyhelper.io).

## Read API

- `exists`: **none** (PolyHelper's own). NOT FOUND (searched: polyhelper.io landing page, GitBook docs and `llms.txt` index, privacy policy, Chrome listing; the docs state no API, order routing or permissions). The privacy policy confirms an undocumented backend API (per-install instance ID) and analytics at `analytics.polyhelper.io`; no host or schema is published. Do not depend on it.
- Docs: https://polyhelper.gitbook.io/polyhelper-docs (product docs only).
- Usable indirect reads, all on Polymarket hosts (public, keyless; H unauthenticated GET 2026-10-19):
  - `GET https://data-api.polymarket.com/v2/builders/leaderboard?time_period=all&limit=50` returns `{data:[{rank, builder_name, builder_code, profile_image, verified, volume, active_users}], pagination:{limit, offset, has_more, next_cursor}}`. PolyHelper.io: rank 7, volume 288,124,041 (units: shares per sibling note, M), 558 active users. Fixture: `docs/research/fixtures/polyhelper-io/data_api_v2_builders_leaderboard_all_2026-10-19.json`.
  - `GET https://clob.polymarket.com/builder/trades?builder_code=<code>` returns `{data:[...], next_cursor, limit:300, count}`; row fields `id, tradeType (TAKER|MAKER), takerOrderHash, builder, market (condition id), assetId (token id), side, size, sizeUsdc, price, status, outcome, outcomeIndex, owner, maker, transactionHash, matchTime, bucketIndex, fee, feeUsdc, builderFee, builderCode, createdAt, updatedAt`. Fixture (2 rows, wallets redacted): `docs/research/fixtures/polyhelper-io/clob_builder_trades_sample2_2026-10-19.json`. Both sample rows show `builderFee` "0".
  - Data API v1 builder endpoints are said to retire 2026-10-24 (M, sibling note citing Polymarket migration docs; not re-read). Use v2.
- Auth, rate limits, websocket for PolyHelper: NOT FOUND. Polymarket's own limits: not checked this session.

## Trade path

None against PolyHelper: no published order API, SDK or webhook. Orders from the extension are signed in the user's browser and sent to Polymarket's CLOB (M, from the privacy policy plus builder attribution). Canonical path for an agent is Polymarket's own CLOB (EIP-712 signed orders; builder code set in the order's `builder` field per https://docs.polymarket.com/trading/orders/attribution, M via sibling note). That belongs to the Polymarket adapter.

## PayBox reachability

`no` for PolyHelper itself: nothing to send signed orders or transaction proposals to. A PayBox EVM wallet on Polygon could only trade via Polymarket directly; PolyHelper adds nothing and should not be routed through.

## Fees

- PolyHelper builder fee: 0 bps observed (both fixture rows `builderFee` "0"; sibling note found 0 on all 1,500 sampled rows, M). No fee schedule published; the extension is free (H, docs FAQ per sibling note; WebFetch of site shows no pricing).
- Real cost is Polymarket's taker fee, `C x feeRate x p x (1 - p)`, taker-only, builder fee additive and paid by the user (M, https://docs.polymarket.com/builders/fees via sibling note). Builders can set up to 100 bps taker / 50 bps maker (M), so 0 could change.

## Resolution and dispute risk

Inherited from Polymarket (UMA optimistic oracle; covered by the Polymarket workflow). PolyHelper resolves nothing. Extra risk: closed-source extension handling wallet/proxy addresses and apparently order submission, with docs and privacy policy contradicting each other. No incident found (absence is not proof).

## Geo, ToS, automation

- PolyHelper terms of service: NOT FOUND (searched: site links, docs, Chrome listing). Only a short privacy policy exists (H, https://polyhelper.io/privacy-policy.txt).
- Polymarket's geoblocks and ToS bind the underlying trading (M, https://help.polymarket.com/en/articles/13364163-geographic-restrictions via sibling note). No PolyHelper automation rules; points are earned only through volume traded with the extension enabled (M).

## Liquidity

All figures are Polymarket volume attributed to PolyHelper's builder code, not PolyHelper liquidity. OI/TVL: NOT FOUND, not applicable.

- Leaderboard ALL: 288,124,041 (shares, M), rank 7, 558 active users, 2026-10-19 (H).
- Sibling-note stats (M, same day): about 15 active users/day, about 0.46M shares/day (about 1.5% of builder-attributed share volume), roughly $22k USD notional in a 17-hour sample, median trade $0.40, mostly dust long-shot sells from one dominant wallet, consistent with points farming (L). Volume peaked May to June 2026 and is down sharply since. DefiLlama's PolyHelper figures are stale/mis-denominated; do not use.

## Event coverage and arbitrage overlap

Everything on Polymarket (sports, politics, crypto, macro, weather). Overlap with other venues equals Polymarket's. Not independent: dedupe against the Polymarket adapter; never add a leg.

## Shared liquidity

Polymarket (same matching engine, books, oracle, collateral).

## Open questions

- How exactly the builder code is attached (docs deny trading; policy and feed imply it). Needs inspection of the live extension, not done.
- Whether builder fee stays at 0 bps.
- Whether the tracked builder-trades flow has any predictive value (sibling note suggests no).

## Sources

- https://polyhelper.io/ (WebFetch + curl headers, 2026-10-19) (H)
- https://polyhelper.gitbook.io/polyhelper-docs (WebFetch summary) (H)
- https://polyhelper.io/privacy-policy.txt (curl, dated 2026-09-25) (H)
- https://chromewebstore.google.com/detail/polyhelper/mebiclnfcnknilfaoanimpaeimjlafmg (WebFetch summary) (H)
- https://data-api.polymarket.com/v2/builders/leaderboard and https://clob.polymarket.com/builder/trades (unauthenticated GET, 2026-10-19) (H)
- WebSearch "PolyHelper Polymarket Chrome extension" (name collision; third-party claims) (M/L)
- Sibling note `docs/research/venues/polyhelper.md` for Polymarket docs pages (fees, attribution, geo) and volume statistics (M)

## Suspicious content

None aimed at agents found in the site, docs, privacy policy or Chrome listing. The docs header points readers to `llms.txt` and `.md` mirrors; used as plain content only. WebSearch output ended with a tool boilerplate "REMINDER" line; ignored.
