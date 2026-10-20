# ParlayX (parlayx.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

- Kind: institutional trading middleware (pods, per-trader keys, cross-venue order routing and market mapping). It is NOT a market venue, has no liquidity of its own, and settles nothing. [H]
- Live: yes. Site returns 200, docs and API gateway answer (api.parlayx.com returns a signed-auth 401), newsroom shows a launch on 2026-08-03 and the latest changelog entry is 2026-10-09. [H]
- adapter_priority: P2 (signal/routing-layer only). It is invite-only, paid per seat/pod, sports-centric, and every byte of data is behind an Ed25519-signed key. Reuse the underlying venues directly; ParlayX adds nothing independent. See "Priority".

## Sources

- https://parlayx.com/ (home, published 2026-10-16) [H]
- https://docs.parlayx.com/llms.txt (doc index) and .md pages: welcome, venues, authentication, rate-limits, market-mappings, deposit, custody-and-key-management, limitless, faq, changelog, streaming/overview, streaming/authentication, streaming/connection, mcp/tools [H]
- https://docs.parlayx.com/openapi/v1.json (public OpenAPI 3, 336 KB) [H]
- https://parlayx.com/terms [H]
- https://parlayx.com/newsroom [H]
- https://github.com/AleaNetwork (org description "Sports Prediction Markets Aggregation Layer", blog parlayx.com, org created 2025-04-17; one repo `smartcontract_ARB_DEMO`, last push 2026-03-08, an Arbitrum NBA parlay demo built with Hardhat) [H]
- WebSearch was unavailable (session budget exhausted), so there is no independent third-party confirmation of the funding/partnership claims. They are company-newsroom claims only [M].

## Kind and market model

- No markets of its own. It wraps four venues: Polymarket, Kalshi, ProphetX, Limitless (docs/venues). [H]
- DISCREPANCY: the marketing homepage lists "Polymarket, Limitless, Kalshi, Predict.fun"; the docs (newer, with a ProphetX guide and API) list Polymarket, Kalshi, ProphetX, Limitless. Predict.fun does not appear anywhere in the docs, OpenAPI or llms.txt. Treat Predict.fun as unsupported. ProphetX partnership announced 2026-09-14. [H]
- Normalised model: per-venue order books, price = implied probability in [0,1] dollars per share, size = outcome shares. Binary/over-under style sports markets; each venue keeps its native ids (Polymarket ERC-1155 tokenId, Kalshi ticker (YES book only), ProphetX strikeId, Limitless marketSlug+tokenId). [H]
- "Market Mappings": deterministic (not LLM) mapping of the same outcome across venues with normalised sides, via `GET /v1/sports`, `/v1/sports/competitions`, `/v1/sports/events`, `/v1/sports/events/{eventId}/markets`, `GET /v1/markets` (look up by tokenId, conditionId, slug, ticker or strikeId). Docs say coverage "currently focuses on sports". [H]
- Source of the mapping logic is not published. The mapping table itself is only available to key holders, so it cannot be consumed without an account.

## Chains and collateral

- Pods hold a per-pod EOA ("externally owned account"). Deposits are USDC only; capital is auto-bridged to venue deposit addresses. The supported networks for deposit are not named in the docs pages read (NOT FOUND in /deposit, /withdraw; searched: deposit.md, withdraw.md). [H]
- Limitless leg: native USDC on Base (limitless.md). [H] Polymarket leg is Polygon by nature of the venue (not stated on the ParlayX page I read) [M]. Kalshi is fiat/USD in a KYC'd entity account, funded directly at Kalshi, not via ParlayX. [H]
- Pod wallet keys sit with a custody provider; ParlayX signs only under an admin-granted delegation; withdrawals only to whitelisted addresses. [H]

## Read API

- exists: official-authenticated. Docs https://docs.parlayx.com ; OpenAPI https://docs.parlayx.com/openapi/v1.json (public, no auth). [H]
- REST base: https://api.parlayx.com ; WebSocket: wss://wss.parlayx.com/v1/orderbook ; SDKs: `@parlayx/sdk` (TypeScript) and Python `parlayx`; an MCP server with 30 read tools and 19 opt-in trading tools. [H]
- Key endpoints: GET /v1/whoami, /v1/time, /v1/sports, /v1/sports/competitions, /v1/sports/events, /v1/sports/events/{eventId}/markets, /v1/markets (lookup); per venue `/v1/{polymarket|kalshi|prophetx|limitless}/{orders,orders/{id},orders/{id}/fills,positions,balance}`; `/v1/limitless/markets`; `/v1/prophetx/ladder`; `/v1/kalshi/orders/queue-positions`. Note: there is NO REST endpoint for order books, prices or public trades. Book and trade tape come only from the WebSocket (BOOK snapshot+delta, TRADE channel; Limitless has no trade feed). There is no resolution endpoint. [H]
- Auth: every request signed with a per-trader-per-pod Ed25519 key; headers PX-Key-Id, PX-Timestamp (30s skew), PX-Content-Sha256, PX-Signature, plus Idempotency-Key on orders. Keys are issued by ParlayX to onboarded customers. No bearer tokens. [H]
- Rate limit: 10 req/s per organisation, burst 20, shared across keys; 429 with Retry-After. WS: 20 connections, 200 subscriptions each, control frames 10/s. [H]
- Unauthenticated check: `GET https://api.parlayx.com/v1/markets` and `/v1/sports` return HTTP 401 `{"error":{"code":"UNAUTHORIZED","message":"Request signature verification failed."}}`. So no real market-data response shape could be obtained; the OpenAPI schemas are the only shape evidence. [H]

## Trade path

- Programmatic: yes, via signed REST/SDK/MCP once an account exists. Orders: limit/market, GTC/FAK/FOK per venue, batch (15 Polymarket, 20 Kalshi, 20 ProphetX), amend/decrease on Kalshi, replace on Limitless. [H]
- ParlayX does not choose venues for you ("You decide where to trade"); it executes instructions. [H]
- PayBox reachability: partial at best (paybox_reachable = partial). ParlayX is non-custodial, but the pod wallet is a ParlayX-provisioned EOA held by a custody provider, not the user's wallet. You deposit USDC to the pod address (an ordinary USDC transfer a PayBox wallet could make, supported network not documented), then trade through ParlayX's signed API. The user's PayBox wallet never signs orders; the Ed25519 API key is a separate credential. Access requires an invite and a paid subscription, so it cannot be set up by an agent. Conclusion: no value over calling Polymarket/Limitless directly from the PayBox wallet. [M]

## Fees

- Platform: subscription priced per member and per pod, billed monthly in advance; exact prices not public ("Pricing and Fees Disclosure" referenced in Terms 8.1 but not published; FAQ says email sales). Per-trade fees: none stated by ParlayX; underlying venue fees pass through (e.g. docs mention fees reduce net shares on Limitless and `averagePrice` excludes venue fees on Polymarket). [H]

## Resolution

- None of its own. Resolution, oracle and dispute risk are those of each underlying venue (UMA on Polymarket, Kalshi rules, etc.). ParlayX disclaims responsibility for trade outcomes. [H]
- Cross-venue mapping risk: a bad mapping silently produces a non-arbitrage "arb" (different resolution rules for the same-looking market). Docs promise a 24h acknowledgement for reports. [H]

## Geo / ToS / automation

- Invitation only, professional/institutional users only, 18+; no named country list but export-control clause. API keys are personal, non-transferable, metered; no sharing/reselling, no circumventing rate limits; wash trading and evading underlying venue rules prohibited; using the platform "to build competing products or for competitive analysis" is barred. Venue-eligibility (e.g. Kalshi KYC, Polymarket US/geo) remains the customer's responsibility. Delaware law, AAA arbitration. [H]
- Implication: our aggregator should not depend on ParlayX data (could breach the competitive-analysis clause) and cannot onboard an agent without a sales contact.

## Liquidity

- Own liquidity: none. No volume/TVL/customer figures published (newsroom, 2026-10-19: "no trading volume, customer counts or user figures"). Funding claim: $1.25M pre-seed (Dreamcraft Ventures) on 2026-09-03, company claim [M]. Launch 2026-08-03; won SBC First Pitch 2026-06-16. [H as newsroom claims]
- liquidity_shared_with: Polymarket, Kalshi, ProphetX, Limitless (100%). It is not an independent arbitrage leg.

## Event coverage / arbitrage overlap

- Mapping focuses on sports (NBA/MLB etc. in OpenAPI examples); non-sports mapping "expands with demand". Overlap is therefore exactly the venues we already adapt directly: Polymarket vs Kalshi vs Limitless sports markets. ProphetX (regulated US sports exchange) is the only new venue it exposes and is a candidate for a separate venue-spec, not an adapter via ParlayX. [H]

## Priority

P2. Reasons: (1) no independent liquidity; (2) all data authenticated, invite-only, paid; (3) no REST book/price endpoint and no resolution data; (4) ToS bans competitive analysis; (5) mapping covers sports only. Useful as design reference: its "pods" and idempotent signed-order model, and its deterministic market mapping concept mirror what docs/market-linking-design.md needs. Follow-ups worth doing instead: a venue-spec for ProphetX; revisit ParlayX only if a partner key is offered.

## Suspicious content

- None found. Docs include an "llms.txt" index and a "Documentation Index" banner telling agents to fetch llms.txt; this is standard Mintlify boilerplate, was only used to find pages, and no agent-directed instructions were followed.

## Fixtures

- docs/research/fixtures/parlayx/openapi-v1-excerpt.json (paths + key schemas from the public OpenAPI, 6 KB)
- docs/research/fixtures/parlayx/unauth-401.txt (unauthenticated response)

## Open questions

- Which deposit networks are supported (not on pages read).
- Whether data-only ("data" permission) keys can be issued without a trading seat, and cost.
- Whether Predict.fun was dropped or never integrated (homepage vs docs disagree).
