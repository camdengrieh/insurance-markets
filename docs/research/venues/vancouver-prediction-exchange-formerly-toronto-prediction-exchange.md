# Vancouver Prediction Exchange (VPX, formerly Toronto Prediction Exchange / TPX)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

PLAY-MONEY venue. Not a real-money or on-chain venue. Adapter priority: **skip** (at most a P2 "Canadian-politics sentiment signal" if someone wants it; no arbitrage value because nothing can be won or cashed out).

## Is it live? (H)

- Site up 2026-10-19, HTTP 200, markets open with current dates (Toronto mayoral election 26 Oct 2026, BC 2026 election, Oct 2026 BoC decision). https://www.vancouverpx.ca/
- torontopx.ca returns 308 to https://www.vancouverpx.ca/ (curl -I, 2026-10-19). Note the blog says the original TPX site "will remain available as a free demo" (blog, 2026-03-25); the redirect suggests that changed (M).
- Blog dated up to 2026-10-12 shows active operation. https://www.vancouverpx.ca/blog

## Kind and market model (H)

- Central limit order book (price-time priority), operated by the company; "VPX never takes the other side of a trade". https://www.vancouverpx.ca/wiki/market-integrity
- Binary YES/NO shares priced 1-99 cents, pay $1.00 (T$1.00) on win. https://www.vancouverpx.ca/wiki
- YES and NO share ONE book: a NO bid at X is a YES ask at 100-X; YES buy + NO buy summing to >=100c are matched into a new share pair ("marriage"). https://www.vancouverpx.ca/wiki/order-book , https://www.vancouverpx.ca/docs/api/get-order-book
- Categorical events are modelled as "market groups" of independent binary markets (one per candidate), e.g. Toronto mayor: Chow 76%, Bradford 25%, others 1% each (sums > 100, so no no-arb coupling between legs). Homepage RSC payload, fixture below (H for the observation).
- Outcomes are database rows, not tokens. No on-chain representation found.

## Chains / collateral (H)

- None. Denominated in "T$" (T-Bucks) which "have no monetary value whatsoever", cannot be deposited, bought, sold or cashed out. https://www.vancouverpx.ca/wiki/regulation
- Blog 2026-03-25: "VPX runs on play money (T$). Nothing can be deposited, bought or cashed out, and VPX is not yet a licensed or regulated exchange." https://www.vancouverpx.ca/blog/the-future-of-vancouver-prediction-exchange
- Plans (not live): controlled pilot with CIRO-registered dealers, BCSC as lead regulator, seeking exemptive relief from BC Notice 2017/02 and MI 91-102, then application for Recognition as an Exchange. Same blog post. Nothing found showing the pilot started (NOT FOUND: searched site, blog, wiki as of 2026-10-19). Hint in the task about a banner "Regarding the future of VPX" is the link to that same March post.

## Read API (H, but authenticated)

- Docs: https://www.vancouverpx.ca/docs/api . Base URL https://www.vancouverpx.ca/api/v1 . Auth: `Authorization: Bearer <api key>` for ALL endpoints; key generated in a logged-in Developer Settings page (requires an account; I did not create one).
- Unauthenticated GET /api/v1/markets returns HTTP 401 `{"error":"Invalid API key"}` (verified 2026-10-19; fixture). So no public unauthenticated read API.
- Endpoints (docs): GET /markets?status=OPEN|CLOSED|RESOLVED|CANCELED ; GET /market?marketId= ; GET /market/order-book?marketId= (top 10 levels per side, both outcomes) ; GET /market/trades?marketId= (last 50) ; GET /positions ; POST /order ; POST /cancel-order ; POST /cancel-everything.
- Market object fields: id (UUID), url slug, question, description (resolution criteria), category, status, closesAt, resolvesAt, resolved, labelA/labelB, createdAt, updatedAt. Book: `orderBookYes/orderBookNo {bids[],asks[],lastTradePrice}` levels `{price, quantity, total}`.
- Rate limits: NOT FOUND (searched all /docs/api pages). Websocket: NOT FOUND. Resolution endpoint: only `status`/`resolved` fields on market; no separate resolution endpoint.
- Also an MCP server at https://www.vancouverpx.ca/api/mcp with the same bearer key (docs, H; not called).
- Shape confirmed from docs only; response samples could not be fetched without a key. Fixtures saved: 401 response and an excerpt of the homepage-embedded market-group JSON (HTML scrape, unofficial, fragile).

## Trade path (H docs)

Off-chain REST only: POST /order with {marketId, side BUY|SELL, outcome YES|NO, price 1-99, quantity}; GTC limit only; funded with unlocked T$ wallet. No signing scheme, no wallet, no transaction proposals. A PayBox wallet (any chain) has nothing to do here: **paybox_reachable = no** (nothing to fund or settle). An API-key bot is possible but would trade fake money.

## Fees (H, partial)

No fee schedule found in docs, wiki or terms (NOT FOUND: searched terms, wiki pages, API docs). Irrelevant while play money.

## Resolution (H)

VPX staff resolve public markets after close against criteria in the description, with a note; users can email an integrity address to dispute; VPX reserves the right to void trades, suspend accounts, delay resolution, adjust rules. Centralised discretion, no oracle or on-chain dispute. Example rule text: Toronto mayor market resolves on consensus of credible reporting, falls to "Other" if unknown by 2027-06-30. https://www.vancouverpx.ca/wiki/market-integrity

## Geo / ToS / automation (H)

Terms (effective 2026-01-22): contractual capacity under Ontario law required; Ontario governing law/courts; prohibits "automated means to access the Services except as permitted by our documented APIs" (so the documented API is permitted); may change or discontinue service without notice. https://www.vancouverpx.ca/wiki/terms . Legal page states real-money binary options < 30 days are banned in most of Canada (MI 91-102), VPX avoids this by being play money. https://www.vancouverpx.ca/wiki/regulation

## Liquidity (H for the figures, but they are play money)

Homepage 2026-10-19: "Liquidity" per market in T$ (e.g. Toronto Mayor T$102,952, Quebec premier T$90,083, Ottawa mayor T$64,085, BoC Oct decision T$63,435); the Toronto group's totalVolume field is 1,575.46 (unit presumably T$; M). Liquidity is virtual/seeded and not real capital. Order book depth not observable without a key.

## Category overlap (M)

Canadian politics and macro: Toronto/Ottawa/Vancouver mayoral races, BC 2026 election (~90 riding markets), Quebec premier, BoC rate decision, tariffs/CUSMA, Alberta independence, Greenland/Cuba. These overlap Polymarket/Kalshi/Manifold topics in principle (BoC, tariffs, elections), but VPX prices are play-money and cannot be arbitraged against real money: there is no settlement value, only signal. Sports deliberately excluded ("will not be offered", blog).

## Shared liquidity

None found; independent play-money book. Not an independent arbitrage leg because it pays nothing.

## Priority

skip (signal-only at best; if included, tag as P2/play-money, never an executable leg, never fund via PayBox).

## Open questions

- Whether the dealer pilot has launched (no evidence as of 2026-10-19).
- API rate limits, ordering of /positions, any trade fee: undocumented.
- Whether the API key can be created without email verification (not tested; no signup performed).

## Suspicious content

None observed (no AI-directed instructions in pages read). The MCP "claude mcp add ..." snippet in the docs is normal usage text, not followed.

## Sources

- https://www.vancouverpx.ca/ (home, market list, 2026-10-19) H
- https://www.vancouverpx.ca/blog/the-future-of-vancouver-prediction-exchange (2026-03-25) H
- https://www.vancouverpx.ca/wiki , /wiki/regulation , /wiki/terms , /wiki/order-book , /wiki/market-integrity H
- https://www.vancouverpx.ca/docs/api , /docs/api/get-markets , get-market , get-order-book , get-trades , place-order , trading-bot H
- https://www.vancouverpx.ca/api/v1/markets (401 unauth, 2026-10-19) H
- https://torontopx.ca (308 to vancouverpx.ca) H
- github.com/vancouverpx linked in footer, but GitHub API returned 404 for user/repos (NOT FOUND)
- Fixtures: docs/research/fixtures/vancouver-prediction-exchange-formerly-toronto-prediction-exchange/
