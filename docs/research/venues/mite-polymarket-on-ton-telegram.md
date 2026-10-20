# Mite (Polymarket on TON/Telegram) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Mite is a Telegram Mini App front-end and TON-to-Polygon funding bridge for Polymarket. Orders go into Polymarket's own CLOB, so it is NOT an independent liquidity leg. It has no public API of its own and a tiny footprint (about $203k lifetime builder-attributed volume). The only things worth taking from it are Polymarket's builder-attribution data (already part of the Polymarket adapter) and its fee-free, same-price property.

## Is it live?

- mite.market returns HTTP 200 on 2026-10-19; Last-Modified 2026-08-17; served by Caddy. H - https://mite.market/ (headers saved as a fixture)
- Terms of Use, EULA and Privacy Policy all say "Last updated: 17 August 2026". H - https://mite.market/terms.html
- Telegram handle `@mite` exists; public preview title "Mite Market", description "Trade Polymarket Natively on TON with Non-custodial Wallet". H - https://t.me/mite
- Polymarket lists "Mite.market" as a verified builder, with builder code 0x508535af...0c8b4e. Volume attributed (Polymarket builders leaderboard, fetched 2026-10-19): H - https://data-api.polymarket.com/v1/builders/leaderboard
  - MONTH (rank 175 today; the discovery hint said 177): $6,060, 31 active users
  - WEEK (rank 120): $1,289, 12 active users
  - ALL (rank 241): $202,619, 340 active users
- Third-party snippet (a competitor's comparison page, one hit only) calls it invite-only closed beta with AI agents. L - not independently confirmed; the official site does not say invite-only.
- The "Polymarket on Telegram via TON" launch coverage (June 2026) is about a different product, "Predict" by the Getgems team with Top/Omniston. Not Mite. M - https://x.com/topdotco/status/2069764292249846114

Verdict: live but very small, and probably recently launched or in beta.

## What it is

- Mini App inside Telegram (launch link https://t.me/mite). "Trade Polymarket, natively on TON. 0% additional commission". H - https://mite.market/
- Footer: "A non-custodial liquidity provider between the TON blockchain and Polymarket". H - https://mite.market/
- Funding flow: "GRAM converts straight from your wallet into a Polygon stablecoin when you open or close a position." GRAM is the token named in the site copy. I did not verify whether it means TON or another asset; NOT FOUND (searched: site, terms, eula, privacy). H for the quote, L for interpretation.
- Custody: "Your Polygon trading wallet is stored on Turnkey's side and can't be accessed without a signature from your TON wallet." So it is a Turnkey-held Polygon wallet gated by TON wallet signatures. H - https://mite.market/ . Terms call it non-custodial, which is a marketing claim not verified by me. M.
- Orders: "Your orders land in Polymarket's live orderbook. Same markets, same fills as trading on Polymarket directly." H - https://mite.market/
- Extra layer: autonomous AI agents that read market activity and publish "signal"/predictions; they "don't trade for you". H - https://mite.market/ . No API, feed or endpoint for the agent output was found.

## Market model, chains, collateral

- Market model: identical to Polymarket (binary and negRisk categorical, CLOB, ERC-1155 conditional tokens, USDC-collateralised). Mite adds nothing. H for "same orderbook", M for details (covered by the Polymarket venue spec).
- Chains: TON (user wallet and entry), Polygon (the Turnkey-held trading wallet that actually trades on Polymarket). H - https://mite.market/
- Collateral: Polymarket's Polygon stablecoin. The page says only "a Polygon stablecoin". Exact token NOT FOUND on Mite's site.

## Read API

- exists: none (official). No docs, SDK, GitHub org or API host found. NOT FOUND (searched: mite.market page links, terms/eula/privacy, t.me/mite, web search "Mite Polymarket TON"). Site links are only #sections, t.me/mite, t.me/mite_admin, eula/privacy/terms, and a contact mailbox.
- Everything readable is Polymarket's: Gamma, CLOB, Data API (see the Polymarket spec). The one Mite-specific read is Polymarket's public builder leaderboard/volume (unauthenticated GET):
  - `GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=MONTH|WEEK|DAY|ALL&limit=50&offset=N` returns rows `{rank (string), builder, builderCode, volume, activeUsers, verified, builderLogo}`. H - fixtures `builders-leaderboard-{MONTH,WEEK,ALL}-around-mite.json`
  - `GET https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH` returns a daily/period time series per builder with the same fields plus `dt`. H (response head seen 2026-10-19, not saved).
- Rate limits: none documented by Mite; Polymarket's apply. No auth needed for the above.
- Websocket: none from Mite.

## Trade path

- None for an agent. Trading happens by a human inside the Telegram Mini App, with a TON wallet signing through TON Connect (inferred from the Turnkey/"signature from your TON wallet" wording). No programmatic order API exists. M.
- Terms of Use section 8 prohibits "use bots or automated means except as expressly permitted" and circumventing geo-restrictions via VPN. No automation permission was found. H - https://mite.market/terms.html
- PayBox reachability: **no** for Mite itself (no API; control sits with a TON wallet plus a Turnkey Polygon wallet). The same liquidity is reachable directly through the Polymarket adapter with a Polygon EOA via signed CLOB orders. Using Mite adds a layer and gains nothing.

## Fees

- "0% additional commission" on top of Polymarket's native prices. H - https://mite.market/
- Mite earns via Polymarket's builder-code program, whose rates are set by Polymarket, and perhaps via the conversion spread on the GRAM to Polygon-stablecoin step. Neither is documented by Mite. NOT FOUND (searched: site, terms, eula). Terms also say the user pays network fees, gas and third-party charges. H - https://mite.market/terms.html
- Polymarket's own taker/maker fee formulas apply: see the Polymarket spec.

## Resolution and dispute risk

- Identical to Polymarket (UMA optimistic oracle on the underlying markets). Mite does not resolve. Additional risks: Mite/Turnkey operational risk and an unaudited bridge/conversion step (no audit found). M.

## Geo / ToS / automation

- Not available to persons in or citizens of: the United States, United Kingdom, France, Netherlands, Germany, Australia, Curacao, plus comprehensively sanctioned jurisdictions (Iran, North Korea, Syria, Cuba, Crimea/Donetsk/Luhansk). Age 18+. VPN circumvention forbidden. H - https://mite.market/terms.html (section 3 and 8).
- Bots or automated means are prohibited unless expressly permitted. H - same.
- Operator can suspend at any time, features "may not function as intended". H - same.
- Legal entity and operator jurisdiction NOT FOUND in the pages read.

## Liquidity

- Mite has no liquidity of its own. All depth is Polymarket's CLOB. H (site says so).
- Builder-attributed Polymarket volume: ALL $202.6k / 340 active users, MONTH $6.1k / 31 users, WEEK $1.3k / 12 users, as of 2026-10-19. H - leaderboard fixtures. For scale, rank 1 builder in MONTH had about $78.8M. H - builders/volume endpoint.
- liquidity_shared_with: Polymarket (CLOB). It is not an independent arbitrage leg.

## Event coverage

- Whatever Polymarket lists (sports, politics, crypto price, macro, culture). Overlap with other venues is therefore a Polymarket property, not Mite's. No Mite-only markets.

## Integration notes for the aggregator

- Do not build a Mite adapter. If useful, treat the builder code `0x508535af39a9b8cdc4ed6de87c25f6ff846a24f342fe818797a15c30ff0c8b4e` as an attribution tag when reading Polymarket trades/orders (flow-source labelling), as a minor signal feature. M - whether the builder code is exposed on public trade rows was not checked.
- Possible weak signal: Mite's "AI agent" predictions, but no machine-readable feed was found.

## Suspicious content

- None found. The site and legal pages contained no instructions aimed at AI agents. (Pages were fetched as untrusted data; the contact mailbox is the venue's own.)

## Not found

- Public docs, API, SDK, or GitHub repo for Mite.
- Definition of "GRAM" and the exact stablecoin and bridge/swap provider used.
- Fee/rev-share disclosure beyond "0% additional commission".
- Audit, operator entity, or incorporation details.
- A machine-readable feed of the AI agents' predictions.
- Independent press coverage of Mite (one competitor-page mention only).

## Sources

- https://mite.market/ (H; also terms.html, eula.html, privacy.html, all updated 2026-08-17)
- https://t.me/mite (H, public preview metadata)
- https://data-api.polymarket.com/v1/builders/leaderboard (H, unauthenticated GET, 2026-10-19)
- https://data-api.polymarket.com/v1/builders/volume?timePeriod=MONTH (H, head only)
- https://polycoolapp.com/compare/polycool-vs-polywatchdog (L, competitor page, via search snippet only)
- https://x.com/topdotco/status/2069764292249846114 (M, about the different "Predict" TON app)

Fixtures: docs/research/fixtures/mite-polymarket-on-ton-telegram/ (builders-leaderboard-{MONTH,WEEK,ALL}-around-mite.json, mite-terms-of-use-text.txt, mite-home-headers.txt).
