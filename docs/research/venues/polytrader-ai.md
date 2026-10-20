# Polytrader.ai (polytrader.ai) - venue spec

Researched 2026-10-19. Read-only: WebFetch of the operator site and docs, unauthenticated GETs (UA `insurance-markets-research/0.1`) to polytrader.ai, docs.polytrader.ai and api.llama.fi. No account, wallet, key, POST/PUT/DELETE, signing or payment; no PayBox tools. WebSearch was unavailable (session budget exhausted), so no news/social corroboration.
Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.
A parallel note, `docs/research/venues/polytrader.md`, covers the same entity in more depth (builder-code attribution, Virtuals token stats). Claims taken only from that note are tagged M here.

## Verdict

- adapter_priority: **skip**. Polytrader.ai is not a venue. It is an AI-assistant front-end with a custodial wallet that places bets on Polymarket (H, docs "Custodial Wallet"). It has no market model, order book, resolution or liquidity of its own, and no API (H).
- Not an independent arbitrage leg: 100% Polymarket liquidity (shared). The Polymarket adapter already captures everything it could show.
- Signal value: none usable. Its "insights" (Twitter/social sentiment, 7 technical indicators from Polymarket Gamma data) sit behind a 500,000 $POLY holding and a web UI, with no API (H).

## Liveness

- https://www.polytrader.ai/ returned HTTP 200 on 2026-10-19; title "Polytrader", meta "Your AI assistant for Polymarket success!"; nav Markets (/markets), Profile (/profile), Connect (H). /markets and /profile also 200 (H). /terms returns 404; no terms, privacy or geo text found on site (H).
- Footer links: docs (polytrader.gitbook.io, which 307-redirects to docs.polytrader.ai), X @polytraderai, Telegram t.me/polytraderai (H).
- Docs: 14 pages, vintage Nov 2024 to Jan 2025 per the sibling note (M). Treat as possibly stale (older than 6 months). Roadmap items (Cross-Markets Arbitrage, Market-Making Arbitrage) are plans only; no shipped feature found (H for text, NOT FOUND for delivery).
- Real usage in 2026 is unproven. Site is up; the $POLY token is near-dormant (24h volume about $1, per sibling note, M).
- DefiLlama lists it: id 7887, name "Polytrader", category Interface, tag "Polymarket Builder", chain Polygon, url polytrader.ai, twitter polytraderAI, description "Polytrader is a prediction platform powered by Polymarket", TVL empty (H, `api.llama.fi/protocol/polytrader`, fixture saved).
- Name-collision warning (M, from sibling note): DefiLlama's builder-volume attribution matches the Polymarket builder code of **polytrader.app**, a different site. Whether the two share an operator is NOT FOUND. Treat DefiLlama volume as possibly describing another product.

## Kind and market model

- Kind: broker-or-frontend / AI assistant over Polymarket (H: docs describe an AI assistant for Polymarket).
- Market model: inherited from Polymarket: binary plus multi-outcome events on a central limit order book; outcome tokens are Polymarket CTF ERC-1155 on Polygon (M; Polymarket itself is covered by a parallel workflow and not re-verified).
- Features (H, docs): market browsing/filters, sentiment analysis from Twitter and other social networks, technical analysis from Gamma API history, a chat "Terminal", positions view, a Telegram bot, and autonomous trading with user-set take profit, stop loss, shares per bet and frequency.

## Chains and collateral

- Execution: Polygon, USDC.e ("To place bets on Polymarket, you need USDC.e (USDC on the Polygon network)") (H, docs).
- Funding shortcut: load USDC on Base into the account holding $POLY, click "Fund Wallet", and an "auto-bridge" moves it (H). Bridge provider NOT FOUND.
- Token gate: 500,000 $POLY on Base must be held by the connecting wallet (H). There is also a Solana wrapped copy of the token (M).
- Polymarket collateral may have changed in 2026 (pUSD / V2 per the sibling note, M). Defer to the Polymarket spec.

## Read API

- exists: **none**. NOT FOUND (searched: homepage HTML, docs sitemap, llms-full.txt, /api, /openapi.json style paths per sibling note, DefiLlama). No API reference, OpenAPI, SDK, websocket, rate limits or auth scheme is documented.
- The web app talks to an undocumented internal backend; I did not probe it (undocumented host).
- Roadmap mentions agent-to-agent access and a GAME SDK integration; nothing shipped found (H for text).
- For market data use Polymarket's own Gamma, CLOB and Data APIs.
- Third-party public data about it: DefiLlama `https://api.llama.fi/protocol/polytrader` and `https://api.llama.fi/summary/dexs/Polytrader` (H, unauthenticated GET, fixtures saved). Slug is case-sensitive "Polytrader".

Confirmed response shapes (2026-10-19):
- Protocol: `{id:"7887", name, url, description, chains:["Polygon"], category:"Interface", tags:["Polymarket Builder"], twitter, tvl:[], currentChainTvls:{}}` (trimmed to the fields kept in the fixture).
- Dex summary: `{name, total24h, total7d, total30d, totalAllTime, total1y, change_1d, chains, totalDataChart:[[unixSeconds, usdVolume],...]}`.

## Trade path

- Programmatic placement via Polytrader: **none**. Orders come from its web UI, Telegram bot, Terminal chat agent or autonomous agent, signed server-side with a custodial key generated per user after a $POLY-holding wallet connects (H, docs "Custodial Wallet"). The user can reveal the key from /profile after a proof-of-ownership prompt (H).
- Login/signing scheme (SIWE or similar): NOT FOUND.
- PayBox/EVM wallet reachable? **No** through Polytrader (no API, token gate, UI-only, custodial). Indirectly yes via Polymarket directly, where an EVM wallet on Polygon signs CLOB orders; that belongs in the Polymarket spec. paybox_reachable = no.
- Custody: custodial, so counterparty risk an aggregator should not take on (H docs; risk judgement mine).

## Fees

- Polytrader user-facing fees: NOT FOUND (searched: homepage, all docs pages via llms-full.txt, tokenomics page per sibling note). Only stated cost is the 500,000 $POLY holding. $POLY buy/sell tax 0% (M, sibling note).
- Possible Polymarket builder fee on routed orders: unknown; DefiLlama implies about 0.1% to 0.15% of notional if the attribution is right (M, derived by the sibling note). Underlying Polymarket fees: see Polymarket spec.

## Resolution and dispute risk

- None of its own; inherits Polymarket's (UMA-based oracle historically; not re-verified here). Added risk: custodial wallet key held by operator.

## Geo, ToS, automation

- No terms of service, privacy policy or geo text found on polytrader.ai (/terms 404; no footer links; docs silent). NOT FOUND.
- Underlying Polymarket geo restrictions apply.
- It advertises automation for its own users but offers no interface to third parties.

## Liquidity

- Own liquidity: none; TVL empty (H, DefiLlama).
- DefiLlama dexs volume, fetched 2026-10-19: 24h $201,117; 7d $626,770; 30d $2,792,484; all-time $9,139,688; series starts 2026-07-05 (H). Attribution to polytrader.ai is uncertain (see Liveness).
- Sibling note reports the matching Polymarket builder code had only about 6 active users in the month to 2026-10-18 (M).
- Either way it is a rounding error against Polymarket itself.

## Event categories and overlap

- Same events as Polymarket (sports, politics, crypto price, macro). No Polytrader-exclusive markets found (M). Overlap with other venues is Polymarket's overlap.

## Liquidity shared with

- **Polymarket (100%)**. Not an independent arbitrage leg.

## Suspicious content

- None found. Docs and site copy contain promotional language only; no instructions aimed at AI agents.

## Open questions

1. Is polytrader.ai the same operator as polytrader.app (the DefiLlama builder-code owner)?
2. Does it attach a builder code to its custodial orders? Not visible.
3. Is there real 2026 usage on polytrader.ai itself? No metric found.

## Sources

- https://www.polytrader.ai/ , /markets , /profile (H, fetched 2026-10-19)
- https://polytrader.gitbook.io/polytrader/ (307 to docs.polytrader.ai) (H)
- https://docs.polytrader.ai/llms-full.txt and https://docs.polytrader.ai/sitemap.md (H; docs vintage Nov 2024 to Jan 2025, possibly stale; fixtures saved)
- https://api.llama.fi/protocol/polytrader and https://api.llama.fi/summary/dexs/Polytrader (H, 2026-10-19; fixtures saved)
- docs/research/venues/polytrader.md (sibling note in this repo; source of the M-tagged builder-code, token and active-user claims)

Fixtures: `docs/research/fixtures/polytrader-ai/` (defillama_protocol_polytrader.json, defillama_dexs_summary_polytrader_trimmed.json, docs_llms_full.txt, docs_sitemap.md; all under 12 KB).
