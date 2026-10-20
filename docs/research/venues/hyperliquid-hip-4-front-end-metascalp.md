# Hyperliquid HIP-4 front end: Metascalp (metascalp.io) - venue spec

Researched 2026-10-19. READ-ONLY: site and docs reads, public unauthenticated GETs (DefiLlama API, GitBook raw markdown). No account, wallet, key, signature, POST, payment or PayBox tool used. Third-party text treated as untrusted data; no embedded instructions found.

Tags: H = read first-hand in a primary source this session (URL cited); M = secondary or inferred; L = weak or stale. "NOT FOUND (searched: ...)" = searched and absent.

Method limits: WebSearch budget was exhausted (shared session cap), so no search-engine discovery was possible. The defillama.com web page returned HTTP 403 to the fetch tool; the DefiLlama API was used instead. This note re-verifies and condenses the earlier, more detailed note `docs/research/venues/metascalp.md` (same product; that note also holds the Hyperliquid builder-fills archive analysis).

## Bottom line

- Metascalp is NOT a prediction-market venue. It is a Windows-only desktop trading terminal (self-described "alpha testing") that connects to ~36 exchanges with the user's own credentials (H, https://metascalp.io/).
- The "outcome markets" are Hyperliquid HIP-4 markets, attributed to Metascalp only through a Hyperliquid builder code. DefiLlama lists "Metascalp Outcome" as category Interface, tag "Hyperliquid HIP4 Builder", `doublecounted: true` (H, https://api.llama.fi/protocol/metascalp-outcome, https://api.llama.fi/summary/dexs/metascalp-outcome).
- Same order books as native Hyperliquid: NOT an independent arbitrage leg.
- Outcome volume through it is negligible ($22.4k all-time). No public API.
- adapter_priority: skip. Use the native Hyperliquid HIP-4 adapter (`docs/research/venues/hyperliquid-hip-4-outcomes-native.md`).

Still live: yes as a product (site 200 OK 2026-10-19, DefiLlama Metascalp data through 2026-10-18; H). Marginal as an outcome channel.

## Kind and market model

- Desktop trading terminal / front end (H, https://metascalp.io/). Homepage lists "Hyperliquid (Spot and Futures)" among full integrations and does NOT mention HIP-4, outcomes or prediction markets (H, fetch of homepage 2026-10-19). The Hyperliquid connection page offers "Hyperliquid: Spot" and "Hyperliquid: Futures" and also does not mention outcomes or builder code (H, https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/hyperliquid.md).
- No market model of its own. Underlying HIP-4: fully collateralised binary outcomes on the HyperCore central limit order book (Yes/No sides, coins `#<id>`), per the native HIP-4 note (M here, not re-verified).
- Only evidence that outcome orders flow through Metascalp is DefiLlama's builder-code attribution (methodology: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code", H). The exact UI path is unverified.
- Side fact: Metascalp docs also list a Polymarket trading connection (H per earlier note; Polymarket is covered elsewhere).

## Chains and collateral

- Chain: Hyperliquid L1 / HyperCore (H, DefiLlama). Collateral: USDC held in the user's own Hyperliquid account; Metascalp says it does not hold funds (H per earlier note, faq pages).
- Credential model: the user enters a wallet seed phrase (H, hyperliquid.md above); a read-only mode works without keys (H). Seed-phrase entry is incompatible with a PayBox-style non-custodial signer.

## Read API

- Official API: none. Docs page "MetaScalp API" (https://metascalp.gitbook.io/metascalp/api.md, 786 bytes) is an empty stub that only promises that APIs "will be published here"; no endpoints, auth or limits (H, fixture `metascalp_docs_api_page_stub.md`).
- NOT FOUND (searched: homepage, docs api.md, docs index, hyperliquid.md): REST/WebSocket URL, SDK, OpenAPI, rate limits, market data feed, GitHub repo.
- Only third-party attribution data exists: `GET https://api.llama.fi/summary/dexs/metascalp-outcome` (fields `total24h`, `total7d`, `total30d`, `totalAllTime`, `totalDataChart [[unix_day, usd]]`, `methodology`, `doublecounted`) and `GET https://api.llama.fi/protocol/metascalp-outcome` (H, fixtures `defillama_dexs_metascalp-outcome_trimmed.json`, `defillama_protocol_metascalp-outcome.json`). No auth needed; limits not checked.
- For real markets, books, trades, resolution use the native Hyperliquid API (WS `l2Book`, `bbo`, `trades`, `outcomeMetaUpdates`; REST `POST /info`), see the native note.

## Trade path

- None for third parties. Orders are placed by a human in the desktop GUI, signed locally from the seed phrase, sent directly to Hyperliquid (M; faq/security per earlier note). Likely carries Metascalp's builder fee in the standard order `builder` field (M).
- Agents should sign HyperCore actions directly (agent wallet) via the native adapter.
- PayBox reachable: no for Metascalp (nothing to call). The underlying Hyperliquid is only partial (HyperCore signed actions, not EVM transaction proposals), per the native note.

## Fees

- Terminal fee 0.02% of trade volume on top of Hyperliquid fees; docs add that API trading on Hyperliquid costs more than the web UI (H, hyperliquid.md: "Дополнительно при торговле через терминал взимается 0.02% от объёма сделки"). Paid by the trader; collected via builder code / referral (M).
- DefiLlama fees for Metascalp Outcome: $4.38 all-time (H per earlier note, https://api.llama.fi/summary/fees/metascalp-outcome).
- Hyperliquid's own outcome fees: see native note.

## Resolution and dispute risk

Metascalp resolves nothing; resolution is Hyperliquid HIP-4's (see native note). Docs state it is "a trading terminal, not an exchange" (H per earlier note).

## Geo / ToS / automation

- Download gated behind a waiver of claims; Windows PC only (H, homepage). Terms of Service and Privacy links exist but their text could not be retrieved: NOT FOUND (searched: homepage). Docs state the user is responsible for legality in their jurisdiction; nothing on bots/automation (H per earlier note).
- Underlying Hyperliquid outcome-market terms (US and Ontario residents barred, per the native note) apply regardless of front end (M).

## Liquidity (DefiLlama, fetched 2026-10-19)

- Metascalp Outcome volume: all-time $22,441; 7d $21,872; 30d $22,189; last full day (2026-10-18) $88 (H, https://api.llama.fi/summary/dexs/metascalp-outcome).
- Spikes: 2026-10-15 $17,942 and 2026-10-16 $3,783; otherwise tens of dollars per day (H).
- Hyperliquid outcomes total for scale: 30d $47.0M, all-time $261.1M, 24h $3.13M (H, https://api.llama.fi/summary/dexs/hyperliquid-outcomes). Metascalp share ~0.05% of 30d.
- Context: Metascalp Spot volume $1.81M on 2026-10-18 (not outcomes; M from earlier note).

## Event categories and overlap

None of its own. Overlap is that of Hyperliquid HIP-4 (crypto price ladders, sports, macro), see native note.

## Shared liquidity

Fully shared with Hyperliquid HIP-4 native books (builder-code attribution, flagged `doublecounted: true`, H). Never count as a separate leg or add to Hyperliquid volume.

## Adapter recommendation

skip. No API, no markets, no independent liquidity, negligible volume, seed-phrase GUI. Optional: use builder-code attribution (DefiLlama) only as a flow-share metric. Revisit only if the "MetaScalp API" docs page gets real content or outcome volume rises by orders of magnitude.

## Open questions

- Which Metascalp UI path exposes outcome coins, and whether the 2026-10-15/16 volume was team or users.
- Metascalp ToS text and any automation clause.
- Whether the API stub will ever describe a local or hosted API.

## Sources

1. https://metascalp.io/ - product description, integrations, alpha, waiver (H, 2026-10-19)
2. https://metascalp.gitbook.io/metascalp/general-settings/connect/api-keys/hyperliquid.md - seed phrase, read-only, 0.02% fee (H)
3. https://metascalp.gitbook.io/metascalp/api.md - API stub (H)
4. https://api.llama.fi/protocol/metascalp-outcome and https://api.llama.fi/summary/dexs/metascalp-outcome (H, 2026-10-19); https://api.llama.fi/summary/dexs/hyperliquid-outcomes (H)
5. https://defillama.com/protocol/metascalp-outcome - HTTP 403 to fetch tool, not read
6. Earlier project note `docs/research/venues/metascalp.md` and native note `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (local, M for anything not re-verified above)

Fixtures: `docs/research/fixtures/hyperliquid-hip-4-front-end-metascalp/` (`defillama_protocol_metascalp-outcome.json`, `defillama_dexs_metascalp-outcome_trimmed.json`, `metascalp_docs_api_page_stub.md`).
