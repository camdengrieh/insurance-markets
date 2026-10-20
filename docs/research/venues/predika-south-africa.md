# Predika (South Africa) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of the venue's own pages, its own same-origin JSON endpoints, its public JS bundles (grep only, nothing executed) and one Polymarket Gamma GET for identity confirmation. No account, wallet, key, signing, POST/PUT/DELETE, no browser automation, no PayBox money tools. Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. Confidence tags: **H** read first-hand this session, **M** inferred, **L** weak.

## 1. Verdict

- **Live (H)**: `https://predika.co.za/` and `https://app.predika.co.za/` served HTTP 200 on 2026-10-19; `/api/metro` returned live prices with `fetchedAt` = 2026-10-19; sitemap lastmod 2026-07-15 to 2026-08-24; the metro page counts "40 days to the vote" for the 4 November 2026 local elections. Launch date NOT FOUND (searched: site, WebSearch extended x2; zero independent press hits for "Predika").
- **It is a ZAR front-end / broker on top of Polymarket, not a venue.** Its own FAQ: "Orders are executed on Polymarket ... markets resolve under Polymarket's rules. Predika doesn't take the other side of your trades or set the odds." (H, https://predika.co.za/). Its `/api/markets` returns Polymarket Gamma market ids and `conditionId`s; market id 682705 matches Polymarket's Gamma record for the same question and conditionId (H, https://gamma-api.polymarket.com/markets/682705). The app bundle talks to `clob.polymarket.com`, `relayer-v2.polymarket.com`, `polymarket.com/api/geoblock` and builds Polymarket CTF-Exchange orders (H, grep of app JS chunks).
- **Adapter priority: skip.** Zero independent liquidity (100% shared with Polymarket), no documented API, no data that Polymarket's own API does not give better. The only residual value: (a) a ZAR/South-African-retail flow signal is NOT exposed anywhere; (b) the 1% fee is a builder fee on top of Polymarket, so it is strictly worse than trading Polymarket directly for a PayBox wallet. Model it as `polymarket` with an extra fee only if we ever want to emulate a ZAR user; do not scan it as a separate leg or you will double-count a "cross-venue" edge that is the same order book.
- **Name hazard**: "Predict SA" (predictsouthafrica.co.za, custodial, own book, see `predict-sa.md`) is a DIFFERENT product from Predika (predika.co.za). Also "Predicta Markets", "Zapex", "Betpoly" are unrelated. Use the full domain.

## 2. Kind and market model

- Kind: broker/front-end (ZAR on/off-ramp + order routing) for Polymarket (H).
- Market model inherited from Polymarket: binary and categorical (neg-risk multi-candidate events, e.g. "Next Mayor of Cape Town?" with one Yes/No market per candidate), CLOB order book, outcome tokens are Polymarket CTF ERC-1155 positions (M; bundle references `Polymarket CTF Exchange`, `NEG_RISK_ADAPTER_ADDRESS`, `NEG_RISK_CTF_EXCHANGE_V2_ADDRESS`, H that those identifiers exist in the bundle). Prices displayed 1%-99% (H, FAQ).
- Own listing surface: `/api/markets` (490 markets on 2026-10-19, H) is a filtered subset of Polymarket (fields only `id, question, conditionId, outcomes, outcomePrices, volume, endDate`). Sports (e.g. "Ningbo Open: Mertens vs Fernandez"), macro (Fed Oct 2026 meeting), world politics, and SA politics are all present. Whether it lists every Polymarket market or a curated set NOT FOUND.

## 3. Chains and collateral

- User-facing collateral is ZAR (EFT, min R50 deposit, min R100 cash-out, min trade R20; H, homepage). Under the hood the app has a Polymarket-style **derived Safe wallet per user EOA** (`derivedSafeAddressFromEoa`, `safeAddress`, `eoaAddress` in the bundle, H) on **Polygon (chain 137)**, holding **pUSD** (`PUSD_CONTRACT_ADDRESS`, `usdce wrap` helpers; H that the identifiers exist, M on meaning = Polymarket's wrapped collateral).
- Crypto funding path: `/fund` says "Fund with crypto - Send USDC from an exchange or wallet" to "your Predika deposit address (Arbitrum)" - "USDC on Arbitrum or Ethereum. Not the Polygon one." (H, https://app.predika.co.za/fund). The app POSTs to its own `/api/bridge` with the user's address to get an EVM deposit address (H that the call exists; response shape NOT FOUND, not probed because POST). This looks like a Polymarket bridge deposit address (M).
- Wallet/custody: login is by email ("Log in with your email", H) and the metro page says "No wallet, no seed phrase" (H) - an embedded wallet, so keys are likely held by a wallet provider rather than the user (M, provider NOT FOUND; bundle contains Magic, thirdweb and WalletConnect library strings, which may be only bundled library code, so no inference drawn). Whether withdrawals to an arbitrary external address are possible NOT FOUND (a `createWithdrawCalls` helper exists in the bundle, H).

## 4. Read API

- **No official or documented API (NOT FOUND: searched site, sitemap, robots.txt, footer links, app routes `/learn` `/fund`, WebSearch).** Homepage says nothing about an API or developer docs (H).
- **Undocumented same-origin JSON used by its own marketing pages** (H, responses fetched 2026-10-19; unauthenticated GET; no limit header seen; Apache/2.4.58; I stopped after one GET each):
  - `GET https://predika.co.za/api/markets` -> `{"success":true,"count":490,"markets":[{id, question, conditionId, outcomes (JSON-encoded string), outcomePrices (JSON-encoded string), volume (string USD, Polymarket lifetime volume), endDate}]}`. ~149 KB. Prices look like Polymarket last/mid, with extremes clamped (0.0005 / 0.9995).
  - `GET https://predika.co.za/api/metro` -> 8 South African metro mayor events with per-candidate `price`, `pct`, `liquidity`, `conditionId`; `Cache-Control: public, max-age=60`; `fetchedAt` epoch ms; flags `thin`, `cached`, `stale`.
  - `GET https://predika.co.za/api/rate` -> `{"rate":16.45,"source":"live"}` (USD/ZAR).
  - `/moves.json` (referenced by the homepage JS) returned 404.
  - App-side routes seen in the bundle (not probed): `/api/polymarket/markets`, `/api/polymarket/market-by-condition`, `/api/polymarket/market-by-token`, `/api/polymarket/positions`, `/api/track-user`, `/api/track-wallet`, `/api/time`, `/api/debug`, `/api/bridge` (H that referenced).
  - These are front-end plumbing, may change without notice, and add nothing beyond Polymarket's own Gamma/CLOB APIs. Use Polymarket's official API instead (covered by the Polymarket workflow).
- Prices/books, trades, resolution: NOT FOUND at Predika; all of it lives at Polymarket. WebSocket: NOT FOUND.
- Fixtures: `docs/research/fixtures/predika-south-africa/` - `api_markets_trimmed_2026-10-19.json` (6 of 490), `api_metro_trimmed_2026-10-19.json` (2 of 8), `api_rate_2026-10-19.json`, `moves_json_404_2026-10-19.html`.

## 5. Trade path

- Programmatic: **none offered** by Predika. The web app signs Polymarket CLOB orders client-side (bundle includes the Polymarket clob-client: `createOrDeriveApiKey`, `POST_ORDER`, `signatureType`, `builderCode`, `BUILDER_FEES_BPS`, H that identifiers exist), so the underlying scheme is the Polymarket one (EIP-712 signed orders + L2 API key). It is not an integration surface for us.
- **PayBox reachability: no (for Predika), but the underlying venue is the right target.** A PayBox EVM wallet cannot fund or log into Predika's email/ZAR flow, and there is nothing Predika-specific to propose. Anything Predika can reach, a PayBox Polygon wallet can reach more cheaply by trading Polymarket directly (subject to Polymarket's own geo rules, researched elsewhere). The crypto deposit route (USDC on Arbitrum/Ethereum to a bridge address) could technically be funded by a PayBox transfer, but would require the Predika account, is custodially opaque and fee-bearing, so not recommended (M).

## 6. Fees

- **Trades: 1% fee (H, homepage FAQ).** Formula, base (notional vs profit), and who receives it NOT FOUND. Bundle contains `BUILDER_FEES_BPS` and `builderCode` fields, which suggests it is a Polymarket builder fee on top of Polymarket's own fees (M; the constant's value is `1e4` which is not obviously 100 bps, so do not infer the rate from it).
- **Deposits and cash-outs carry a fee**, "always shown in rands before you confirm" (H); amount NOT FOUND (the `/fund` page shows "Fee" only after entering an amount in a client widget). FX spread on ZAR/USD: `/api/rate` 16.45 on 2026-10-19 vs the page's hard-coded fallback 16.3 (H); spread vs mid NOT FOUND.
- Polymarket's own fees additionally apply underneath (see Polymarket spec).

## 7. Resolution

- Entirely Polymarket's (UMA optimistic oracle / whatever Polymarket currently uses; see Polymarket spec): "markets resolve under Polymarket's rules" (H). Predika adds no resolution layer; dispute mechanics, if any, for its own users NOT FOUND. Counterparty risk: you are exposed to Predika's custody/ZAR rails AND to Polymarket.

## 8. Geo / ToS / automation

- Targets South African users (SA bank accounts only for ZAR flows, H). Regulatory status NOT stated anywhere on the site (H: no FSCA/licence statements). Independent coverage says SA has no dedicated prediction-market framework and the SA Bookmakers Association is lobbying against them (M, igamingexpert.com, see Sources) - legal risk for the operator and for SA users.
- The app runs Polymarket's geoblock check (`polymarket.com/api/geoblock`, H bundle) and shows a geoblock warning.
- Terms of service and privacy pages: NOT FOUND (`app.predika.co.za/terms` and `/privacy` return 404; homepage has no link). No automation rules available; treat automation as unsanctioned. robots.txt allows all (H).

## 9. Liquidity (shared, not independent)

- Source of all depth is Polymarket. `/api/markets` `volume` values are Polymarket lifetime market volumes: largest 74.6M USD, sum over the 490 markets about 1.109B USD (H, computed from the 2026-10-19 response; this is Polymarket volume, not Predika volume).
- Predika's own volume/user counts: NOT FOUND (homepage has empty "traded on the markets listed here" stats placeholders).
- Metro page admits thinness: Cape Town about R168k "behind" the price, Ekurhuleni about R8k "very thin", and "automated market-making" inflates long-shot liquidity (H, https://predika.co.za/metro-mayors/). `/api/metro` shows per-candidate book `liquidity` and `totalLiquidity` (e.g. Cape Town 258,411 on 2026-10-19; unit presumably USD, M).
- **Shared with: Polymarket (100%).** Not an independent arbitrage leg.

## 10. Event overlap (for cross-venue matching)

Everything overlaps Polymarket by construction. Notable categories where Polymarket itself overlaps other venues: SA metro mayor races (Kalshi also lists Johannesburg mayor, per search result), Fed decisions, world elections (Israel PM, Brazil president), tennis/sports, crypto. For the SA mayor markets the interesting cross-venue pair is Polymarket vs Kalshi, not Predika. Use Predika only as a UI reference for which SA questions retail sees.

## 11. Priority

**skip.** Duplicate liquidity (100% Polymarket), no documented API, no ToS, fee-bearing wrapper, regulatory status unclear.
Re-check triggers: Predika publishes its own order book or native (non-Polymarket) markets; documented API; ToS published; or the builder-fee/ZAR flow data becomes available as a retail-flow signal.

## Sources

- https://predika.co.za/ - homepage, FAQ, fees, "orders are executed on Polymarket" (H, read 2026-10-19; raw HTML plus WebFetch)
- https://predika.co.za/metro-mayors/ - metro odds page, thin-liquidity disclosure (H)
- https://predika.co.za/sitemap.xml , /robots.txt (H)
- https://predika.co.za/api/markets , /api/metro , /api/rate (H; undocumented same-origin endpoints; fixtures saved)
- https://app.predika.co.za/ , /learn , /fund (H); app JS chunks under `/_next/static/chunks/` grepped for Polymarket endpoints, Safe/pUSD/builder identifiers (H that strings exist; behaviour inferred, M)
- https://gamma-api.polymarket.com/markets/682705 - same id/question/conditionId as Predika's listing (H)
- https://igamingexpert.com/news/regulation/south-africa-betting-prediction-markets and https://igamingexpert.com/features/south-africa-warning-prediction-markets - SA regulatory context (M, via search snippet only, not opened)
- https://kalshi.com/markets/kxjohannesburgmayor/johannesburg-mayoral-election/kxjohannesburgmayor-26dec31 and https://polymarket.com/event/next-mayor-of-cape-town - overlapping SA mayor markets (M, search snippets only)

## NOT FOUND (searched: site, sitemap, app routes, WebSearch extended x2)

Official API/docs; terms of service; privacy policy; regulatory/licence statement; company/operator identity; launch date; independent press about Predika; exact deposit/withdrawal fee amounts; fee formula/base for the 1%; wallet/custody provider; whether external-address withdrawals are supported; Predika-specific volume or user numbers; rate limits; websocket.

## Suspicious content

None found. (The homepage footer exposes an operator contact mailbox; deliberately not copied or contacted.)
