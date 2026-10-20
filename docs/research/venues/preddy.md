# Preddy (preddy.trade) - venue spec

Researched 2026-10-19. Read-only: public GETs and web pages only, no account, no signing, no wallet connection, no POST.
Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict (one paragraph)

Preddy is **not a venue**. It is a retail trading front-end ("Polymarket Builder", category "Interface") that routes orders to Polymarket's CLOB v2 with its own builder code attached and takes a 0.5% taker builder fee on top. Its markets, order books, prices, collateral (pUSD on Polygon) and resolution (UMA / Chainlink) are 100% Polymarket's. It has no public API of its own. It is therefore **not an independent arbitrage leg and has nothing to adapt**: the correct integration is the Polymarket adapter (covered by another workflow). `adapter_priority = skip`.

## 1. Still live (2026)?

| Check | Evidence | Verdict | Tag |
|---|---|---|---|
| Web app | `GET https://preddy.trade/` 200, 2026-10-19; sitemap lists about 911 `/event/<id>` pages | live | H |
| Docs | `https://docs.preddy.trade/` 200; changelog latest entry **2026-10-13**, earliest entry 2026-03-10 | actively shipped | H |
| DefiLlama | protocol id 7886, "Preddy is a prediction platform powered by Polymarket", chain Polygon, tag "Polymarket Builder", category Interface, twitter `preddytrade`; daily volume series 2026-07-05 to 2026-10-18; fee series 2026-04-28 to 2026-10-19 | live and trading | H |
| Third-party mention | Predexon marketing lists "Preddy" among its users (see `docs/research/venues/predexon.md`) | consistent | M |
| Official GitHub | `gh search` for "preddy" repos/orgs found only unrelated personal accounts; no official org | none | H (absence) |

## 2. Kind and market model

- **Kind: broker-or-frontend** (builder-attributed front-end for Polymarket), plus convenience layers: copytrading, stop losses, alerts, portfolio/PnL, "Large Buys" and trader leaderboards. (H, https://docs.preddy.trade/docs - "It connects to Polymarket and gives you a faster, more powerful way to trade".)
- **Market model: identical to Polymarket.** Binary and categorical (neg-risk) outcome tokens on Polymarket's CLOB v2 order book. Preddy shows "real-time orderbook data" over WebSocket (changelog 2026-03-27: "All prices ... update in real-time from the orderbook via WebSocket"). (H)
- **Same market universe, same ids.** `preddy.trade/event/<n>` uses Polymarket's Gamma event id: sampled 3 ids (1204514, 192962, 1209505) all resolve at `GET https://gamma-api.polymarket.com/events/<id>` to live Polymarket events. Fixture `docs/research/fixtures/preddy/event-id-crosscheck.json`. (H)
- Site category pages (from homepage and sitemap): politics, elections, midterms, sports, esports, crypto, weather, finance, economy, tech, science, geopolitics, world, pop-culture, mentions-markets, tweets-markets, earnings-hub. These are Polymarket's tag taxonomy. (H, https://preddy.trade/sitemap.xml)
- **Two add-on products, both still Polymarket-dependent:**
  - **Combos** ("combine picks from different markets into one position with a multiplied payout", 2-50 legs per Polymarket docs): Polymarket's own Combos product accessed through Polymarket's "Builder Gateway" RFQ/quote competition, https://docs.polymarket.com/trading/combos/builders.md (H that Polymarket exposes this to approved builders; M that Preddy Combos use it, since Preddy docs do not name the backend).
  - **Leverage**: "powered by Dimes"; margin posted by user, Dimes lends the rest, "the full position is opened on the real Polymarket order book"; sports and crypto markets only, 2x up to per-market max (docs example 5x); open-only (buy to open); Dimes sets opening, daily funding and liquidation fees. (H, https://docs.preddy.trade/docs/leverage). Leveraged flow adds a third party (Dimes) but no new price venue.

## 3. Chains and collateral

- **Polygon**, collateral **pUSD** (Polymarket CLOB v2 collateral; replaced USDC.e on 2026-04-28; USDC.e can be wrapped). (H, https://docs.preddy.trade/docs/changelog, entries 2026-04-28 and 2026-05-01; DefiLlama chain = Polygon.)
- Deposits are accepted from other chains and auto-bridged/swapped into the Preddy balance: Solana (USDC, USDT), "any supported EVM chain", Arbitrum One (USDC/USDT), Polygon USDC/USDT; direct pUSD deposit; misdirected deposits recoverable via UI. (H, same changelog.) This is funding convenience, not multi-chain trading.
- Wallet types (H, https://docs.preddy.trade/docs/wallets/wallet-types): native "Preddy" wallet (as of 2026-05-04 new Preddy wallets are Polymarket **deposit wallets**; earlier docs describe an EIP-7702 single-address account), plus imported Polymarket "Poly" (proxy) and "Safe" wallets. All keys held in **Privy embedded wallets** (TEE / key splitting). Import path is "paste owner private key" in the Preddy UI. Docs wording is inconsistent between the EIP-7702 description and the later deposit-wallet default; treat the exact account contract as unverified.

## 4. Read API

**NOT FOUND: no official or public Preddy API.**
Searched: docs.preddy.trade `llms.txt` and `llms-full.txt` (full docs, about 17 English pages, no API/REST/SDK/WebSocket reference page), `docs.preddy.trade/openapi.json` (serves the HTML app shell, not a spec), sitemap, preddy.trade footer/nav (no developer or API link), GitHub (no official org). `https://api.preddy.trade/` answers `404 application/json` at the root (one probe, nothing further touched). `https://preddy.trade/robots.txt` says `Allow: /` but `Disallow: /api/` and `Disallow: /proxy/`, so any internal JSON endpoints behind the app are explicitly off-limits for crawlers. (H)

Consequence for the aggregator: read all market data from Polymarket directly (Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com`, Data API; documented at https://docs.polymarket.com, covered by the Polymarket workflow). Preddy adds no price information.

Public Preddy-related data that does exist (all H, all second-hand to Polymarket):
- Builder-fee config for Preddy's builder code, public and unauthenticated: `GET https://clob.polymarket.com/fees/builder-fees/0x25d56a25be81b183908e80ccc522e72d4187480a4aa29fa7e4dd1112546fabef` returned `{"code":"0x25d5...fabef","builder_maker_fee_rate_bps":0,"builder_taker_fee_rate_bps":50,"enabled":true}` (200, 2026-10-19). Fixture `fixtures/preddy/builder-fees.json`. The URL is linked from https://docs.preddy.trade/docs/fees.
- On-chain attribution: Polymarket docs say the `builder` bytes32 is part of the signed order and every settlement contract emits `OrderFilled` with it, so Preddy-routed fills can be isolated on-chain by that code (H, https://docs.polymarket.com/programs/builders/fees.md). Useful only if someone wants a "Preddy flow" signal; not needed for pricing.
- DefiLlama adapter slug `preddy` (module `preddy-trade`): `GET https://api.llama.fi/summary/dexs/preddy` and `/summary/fees/preddy` (public, no key). Fixtures `fixtures/preddy/defillama-dexs-summary.json`, `defillama-fees-summary.json`, `defillama-protocol.json`. Methodology string: "Builder fees received by Preddy.trade from trades on Polymarket v2". (H)

Auth and limits: not applicable (no API). Preddy docs mention Polymarket builder-tier rate limits only indirectly; Polymarket's tier table (Unverified 100 relayer tx/day, Verified 10,000, Partner unlimited) is in https://docs.polymarket.com/programs/builders/tiers.md (H) and is Polymarket's, not Preddy's.

## 5. Trade path

**None for third parties.** Preddy exposes no order-placement API, SDK or contract of its own. Trading is only through the logged-in web/mobile app against a Privy-managed wallet. (H by absence, see section 4.)

How an order actually flows (H, Polymarket builder docs + Preddy docs): user signs a Polymarket CLOB v2 order whose signed struct includes the `builder` field = Preddy's code -> submitted to `clob.polymarket.com` -> matched on Polymarket exchange contracts (CTF Exchange, Neg Risk CTF Exchange, Polymarket Protocol V2 Exchange) on Polygon. "Offline signing" (opt-in, policy-restricted via Privy + Alchemy to place orders, approve pUSD for the exchange, split/merge) powers copytrading and stop losses.

**Could a PayBox-reachable EVM wallet trade it?**
- Via Preddy: no. There is no signed-order or transaction-proposal interface to submit to; the only entry is the Preddy UI and Privy login. The only PayBox-style action that touches Preddy is a **deposit transfer** to the user's Preddy deposit address (EVM or Solana), which is funding, not trading, and moves funds into a Privy-held wallet outside PayBox policy control. Not recommended. (M, inferred from docs.)
- Via Polymarket directly: that is the real route (a wallet signs Polymarket CLOB v2 orders, optionally with the aggregator's own builder code), assessed in the Polymarket spec, not here.

## 6. Fees

- **Preddy: flat 0.5% taker fee on notional, added on top of the order, charged in USD; no maker fee.** Applies to market buy, market sell, copytrade buy/sell and stop loss. No fee for limit buy, limit sell, merge, split. (H, https://docs.preddy.trade/docs/fees; matches on-chain config `builder_taker_fee_rate_bps: 50`, `builder_maker_fee_rate_bps: 0` from the live Polymarket endpoint, H.)
- Formula (H, Polymarket): `builder_fee = notional * builder_fee_rate_bps / 10000`, additive to Polymarket's platform fee `platform_fee = C * feeRate * p * (1-p)` (taker-only, per-market `feeRate`). Builder cap: taker 100 bps, maker 50 bps; rate changes need 3 days notice and a 7-day cooldown. (https://docs.polymarket.com/programs/builders/fees.md)
- Leverage: Dimes opening fee, daily funding fee, liquidation fee; rates not stated by Preddy ("see their docs"). (H, https://docs.preddy.trade/docs/leverage)
- Net effect for arbitrage: trading Polymarket through Preddy costs 0.5% more than trading Polymarket directly (limit orders excepted). It is strictly dominated as an execution route.
- Observed take rate: DefiLlama 30d fees USD 4,229 vs 30d volume USD 1.98M = about 0.21%, consistent with a mix of fee-free limit orders and 0.5% taker flow (M, derived).

## 7. Resolution and dispute risk

Inherited entirely from Polymarket. Preddy's market "About" tab shows "market rules, dates, and resolution source alongside the UMA timeline", and crypto Up/Down markets "settle on a Chainlink TWAP" (changelog entries, H). So: UMA Optimistic Oracle for general markets, Chainlink for crypto price series. Winning tokens pay 1.00, losing 0.00; positions auto-redeem via Polymarket's on-chain auto-redeem (H, docs copy-trading reference). Dispute risk = Polymarket's UMA dispute risk; no separate Preddy arbitration. Combos (multi-leg) and Dimes leverage add settlement mechanics Preddy does not document (NOT FOUND: combo settlement/void rules, Dimes liquidation specifics beyond the Preddy page). Section on dispute risk for the base markets belongs in the Polymarket spec.

## 8. Geo, ToS and automation

- **NOT FOUND** in Preddy materials: any terms of service, privacy policy, restricted-jurisdiction list, KYC statement or bot/automation clause. Searched: homepage nav and links (no footer content), docs `llms-full.txt` (grep for terms, KYC, sanction, restricted, prohibited, license, jurisdiction, geo returned nothing relevant), `/terms`, `/terms-of-service`, `/tos`, `/privacy`, `/legal`, `/terms-and-conditions` on preddy.trade and `/docs/terms` (all 404 on 2026-10-19). (H for absence)
- The underlying venue's geoblock and terms apply to the CLOB (Polymarket; see that spec). Polymarket also reserves the right to revoke a builder's fee ability for "automated, self-referred, or other non-bona fide trading activity" (H, builder fees page). That is a risk for a builder, not for an aggregator reading data.
- Preddy states it never has access to keys, offline signing is opt-in, and sessions require explicit approval by default (H, wallet security page). Not a statement about third-party automation.
- robots.txt disallows `/api/` and `/proxy/`. Do not scrape those paths. (H)

## 9. Liquidity (all second-hand; Preddy has no order book of its own)

Preddy-routed flow, DefiLlama, fetched 2026-10-19 (H as to the figures, M as to their accuracy: modeled adapter, not audited):
- Volume 24h USD 97,878; 7d USD 529,724; 30d USD 1,982,832; all-time USD 8,365,686. Series starts 2026-07-05 (first day USD 74,193).
- Monthly sums from the daily series: Jul 1.99M, Aug 3.39M, Sep 1.73M, Oct (to the 18th) 1.26M, i.e. flat-to-declining since August.
- Fees (builder fees) 24h USD 147; 30d USD 4,229; all-time USD 28,389; series since 2026-04-28.
- TVL: none reported (chainTvls empty). OI: NOT FOUND.
- The "$7.48M sports / $1.74M weather / $1.16M midterms" figures on the Preddy homepage are Polymarket market volumes shown in the UI (M, not Preddy's own flow; page does not label them).

Preddy's flow is a rounding error against Polymarket's total, and it adds nothing to book depth: every order lands in the same Polymarket book.

## 10. Event-category overlap and independence

- Categories on the site: sports (incl. esports), politics/elections/midterms, crypto price (Up/Down, BTC/ETH/SOL/XRP/HYPE/DOGE/BNB), macro/economy/finance/earnings, weather, tech/science/geopolitics, mentions/tweets, pop culture. Overlap with Kalshi, Limitless, Predict.fun, Opinion, XO etc. is wherever Polymarket overlaps them.
- **Shares liquidity with: Polymarket (100%).** Preddy has no separate book, market maker or oracle (Combos use Polymarket RFQ makers, Leverage uses Dimes credit but executes on the Polymarket book). **It is NOT an independent arbitrage leg**, and a scanner that polled both would see identical prices and double-count depth. (H)

## 11. Adapter recommendation

- `adapter_priority`: **skip**. Duplicate liquidity, no API, 0.5% worse execution than going direct.
- Do instead: (1) Polymarket adapter is the single leg for this liquidity; (2) optionally register an aggregator builder code on Polymarket (Settings -> Builders; free, unverified tier = 100 relayer tx/day) if attribution or fee capture is wanted; (3) if "Preddy flow" is ever wanted as a signal, derive it from `OrderFilled.builder == 0x25d56a...fabef` on Polygon, not from Preddy; (4) treat Preddy copytrade/leaderboard pages as a UI over public Polymarket wallet activity, which the Polymarket Data API already provides (M).
- Revisit only if Preddy announces a public API, its own matching engine, or non-Polymarket venues (none seen in docs as of the 2026-10-13 changelog).

## Suspicious or notable embedded content

- Hidden anchor on both `preddy.trade` and `docs.preddy.trade` pages: `href=".../cdn-cgi/content?id=..."` with `display:none` (Cloudflare bot-trap pattern). Not followed. No instructions aimed at AI agents were found in any Preddy page, docs text or API response.
- Note: the shared scratchpad was being written by other agents concurrently (a file named `llms.txt` was overwritten with another site's content). Fixtures were re-fetched directly into `docs/research/fixtures/preddy/` and verified; use unique scratch file names.

## Sources

1. https://preddy.trade/ - homepage (categories, Combos, Leverage, Copytrade, Traders, Affiliate). H
2. https://preddy.trade/robots.txt and https://preddy.trade/sitemap.xml - disallow rules, URL structure (`/event/<gamma id>`, `/combos`, `/leverage`). H
3. https://docs.preddy.trade/docs (Introduction), /docs/getting-started, /docs/fees, /docs/leverage, /docs/wallets/wallet-types, /docs/wallets/security, /docs/wallets/import-polymarket-account, /docs/changelog (via https://docs.preddy.trade/llms.txt and /llms-full.txt, fetched 2026-10-19). H
4. https://defillama.com/protocol/preddy (page returns 403 to WebFetch) and API: https://api.llama.fi/protocol/preddy, https://api.llama.fi/summary/dexs/preddy, https://api.llama.fi/summary/fees/preddy, https://api.llama.fi/overview/dexs and /overview/fees (slug lookup). H
5. https://clob.polymarket.com/fees/builder-fees/0x25d56a25be81b183908e80ccc522e72d4187480a4aa29fa7e4dd1112546fabef - live builder fee config. H
6. https://docs.polymarket.com/programs/builders/overview.md, /fees.md, /tiers.md, https://docs.polymarket.com/trading/combos/builders.md, https://docs.polymarket.com/llms.txt - builder program, fee formulas, tiers, Combos. H
7. https://gamma-api.polymarket.com/events/<id> for ids 1204514, 192962, 1209505 - event id cross-check. H
8. `docs/research/venues/predexon.md` (in repo) - lists Preddy as a Predexon user. M
9. GitHub search API (`gh api search/repositories?q=preddy`, `search/users`) - no official repo. H (absence)
10. WebSearch (extended) for press/background on Preddy was attempted but the session search budget was exhausted; no press, funding or team information gathered. Not needed for the verdict.

Fixtures (all under `docs/research/fixtures/preddy/`): `builder-fees.json`, `defillama-protocol.json`, `defillama-dexs-summary.json`, `defillama-fees-summary.json`, `docs-llms.txt`, `event-id-crosscheck.json`.

## Open questions

- Exact native-wallet account type (EIP-7702 account vs Polymarket deposit wallet) after the 2026-05-04 migration; docs conflict.
- Whether Preddy Combos use Polymarket's Builder Gateway (very likely, but Preddy does not say).
- Preddy ToS / geo terms (no page found); only matters if someone were to route through the Preddy app.
- Preddy Pro (private beta) features are not documented beyond the changelog; no API mentioned.
