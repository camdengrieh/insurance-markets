# Oyrade (venue spec)

Researched 2026-10-19. Verdict: devnet-only, pre-mainnet, no public REST API, closed-source contracts. Adapter priority: skip (revisit if mainnet launches).

Tags: H = read first-hand in primary source this session; M = secondary/inferred; L = weak/stale.

## Summary
- Oyrade is a Solana prediction-market protocol with a "privacy-first" pitch (shielded/ZK predictions via ephemeral wallets). [H] https://docs.oyrade.com/
- The product is on Solana DEVNET. The main site oyrade.com 307-redirects to https://devnet.oyrade.com/ (checked 2026-10-19). [H]
- Mainnet program address "not yet published, pending the audit". [H] https://docs.oyrade.com/developers/overview
- The npm package `oyrade-mcp` (v0.1.0, created 2026-02-24, never updated) is a 2.7 KB stdio-to-HTTP bridge to https://mcp.oyrade.com/api/mcp. Not an SDK. [H] registry.npmjs.org/oyrade-mcp and tarball contents (read only, not executed).

## Still live?
- Yes as a devnet/beta product: docs site last-modified 2026-10-15 [H], devnet site and MCP site respond 2026-10-19 [H]. Changelog's last entry is 2026-02-19 (v0.4.0), and only "Public Beta Launch" 2026-01-29 is listed; no mainnet launch entry (STALE-ish, 8 months). [H] https://docs.oyrade.com/changelog
- No real money at stake on devnet: a Faucet page distributes devnet $OYRADE. [H changelog]
- Independent coverage: none found by WebSearch (extended). Treat marketing figures as placeholders (landing-page stats like "$42,500 market cap", "85.4%", "0ms" are demo values). [M]

## Kind and market model
- Binary Yes/No markets, each minting two SPL tokens (Yes and No). [H] https://docs.oyrade.com/developers/overview
- Pricing: "constant product AMM for price discovery" [H] https://docs.oyrade.com/developers/smart-contracts ; share price = implied probability, winning shares settle at $1, price moves with pool depth/inventory imbalance. [H] https://docs.oyrade.com/overview/architectural-overview . No formula or collateral token disclosed.
- Market categories listed: crypto prices (SOL/BTC/ETH), Pump.fun token market-cap thresholds, political/world events, sports. [H] https://docs.oyrade.com/markets/how-markets-are-created . Changelog frontend filters: Crypto, Sports, Pop Culture. [H]
- Only the core team creates markets; users cannot. [H] same page. (The MCP page advertises a paid `create_market` tool at $0.50, which conflicts; unverified. [M])

## Chains and collateral
- Solana only (devnet). Single Anchor program, 11 instructions, devnet program ID `2iwZ1MZctVHXYXa5xN8QE2zZaah3hevS6JWT7TB81Ki9`. [H] https://docs.oyrade.com/developers/overview
- Collateral asset: NOT FOUND (searched: docs overview, architectural-overview, smart-contracts, fees, markets pages). Docs say each market has a "collateral specification" without naming it; fee payouts to stakers are in USDC. [H]
- Gas paid in SOL (~0.001 SOL per prediction). [H] https://docs.oyrade.com/trade-on-oyrade/fees
- Token: $OYRADE (staking, fee discounts, governance via veOYRADE). [H]

## Read API
- exists: none (public REST). The API Reference page states the REST API "is currently under development and is not yet available for public use"; no base URLs, endpoints, auth or limits. [H] https://docs.oyrade.com/developers/api-reference
- Only documented alternative: read on-chain accounts via the Anchor IDL (PDAs for market state, user positions, global config). But the contracts are closed-source and the technical reference/IDL is withheld "until after our security audit"; integration details via Discord. [H] https://docs.oyrade.com/developers/smart-contracts . IDL availability: NOT FOUND.
- Hosted MCP server: https://mcp.oyrade.com/api/mcp (streamable HTTP, JSON-RPC; OAuth via an Auth0 tenant per `/.well-known/oauth-protected-resource`). Landing page lists 15 tools: 8 "free" read tools (list_markets, get_market, get_market_history, get_market_comments, check_positions, get_trade_history, health_check, discover_endpoints) and paid x402 tools (create_market $0.50, place_prediction "$0.01 + 3%", sell_position $0.01, claim_winnings $0.01, resolve_market $0.05, get_privacy_proof $0.10, get_market_news $0.01). [H] https://mcp.oyrade.com/ . Whether the read tools need OAuth and which network/chain the x402 payments settle on: NOT FOUND. Tool response schemas: NOT FOUND (MCP calls are POST; not made per read-only/no-POST rules).
- Probed GETs on devnet.oyrade.com (/api/health, /api/markets, /.well-known/x402): all 404. No `api.oyrade.com` DNS record. [H]
- WebSocket: NOT FOUND. Helius webhooks/RPC are used by their frontend (Solana-level, not an Oyrade feed). [H overview]
- Docs says "X402 API" appears in the site nav under Platform. [H devnet landing]

## Trade path
- Documented path is a browser wallet UI (Reown AppKit: Phantom, Solflare). [H overview]
- Programmatic: only via the paid x402 MCP tools (unverified, see above) or raw Solana transactions to the devnet program, which requires the unpublished IDL. No signed-order/CLOB scheme (it is an AMM).
- Shielded mode uses "Solnado-based mixing"/Groth16 proofs and ephemeral session wallets; Shielded requires "Tier 3+" per changelog. [H]

## PayBox reachability
- paybox_reachable: no (for now). Venue is Solana devnet only; PayBox EVM wallets cannot trade a Solana program. Even a Solana PayBox wallet would only get devnet funds (no value) and there is no mainnet program, no public IDL, and no REST API. [M inference from H facts]
- If mainnet launches: would need Solana transaction proposals plus the IDL. Not EVM.

## Fees
- Trade fee = trade value x rate: Public 0.20%, Shielded 0.30%. Staking tier discounts on base fee: Bronze 1,000 OYRADE 10%, Silver 10,000 20%, Gold 50,000 30%, Diamond 100,000 40%. [H] https://docs.oyrade.com/trade-on-oyrade/fees
- Fee distribution: stakers 30% (weekly USDC), buyback and burn 12%, operations 58%. Gas ~0.001 SOL paid by user. [H]
- Conflict: MCP landing page says `place_prediction` costs "$0.01 + 3%" (x402), far above the docs' 0.20%. Unreconciled. [H both, conflict]
- AMM slippage is additional; formula undisclosed.

## Resolution and dispute
- Crypto price and Pump.fun market-cap markets: Switchboard V3 feeds (Helius indexing for Pump.fun). Political/sports/custom events: UMA Optimistic Oracle (propose and challenge). [H] https://docs.oyrade.com/markets/how-markets-are-created , https://docs.oyrade.com/developers/overview
- Dispute window/bond parameters: NOT FOUND (docs index lists a "How Are Markets Resolved?" page that was not located in the sidebar; not fetched). Note the MCP landing lists a paid `resolve_market` ("Oracle resolution") tool, implying resolution may be triggered by callers. [M]
- Risks: unaudited (audit "planned" per smart-contracts page; changelog v0.4.0 mentions a smart contract audit, status unclear), closed source, small team-curated market set. [H/M]

## Geo / ToS / automation
- Claims "zero KYC, zero tracking". No geo restrictions, ToS or API usage policy found in docs. NOT FOUND (searched: docs sidebar, landing page, MCP page). Privacy-mixer feature (Solnado) raises regulatory/compliance risk for any institutional integration. [M]
- Automation: the vendor itself promotes AI-agent access via MCP/x402. [H]

## Liquidity
- Volume/OI/TVL: NOT FOUND anywhere (no stats on docs or site; landing numbers are placeholders). Devnet means no real liquidity. [H/M] Date checked 2026-10-19.

## Event overlap
- Nominally overlaps crypto price (SOL/BTC/ETH), politics, sports, pop culture, but on devnet with no real liquidity there is no usable arbitrage. Pump.fun token market-cap markets are unique to this venue (no overlap). [M]

## Shared liquidity
- Own constant-product AMM per market; no sharing with another venue documented. Independent. [H architectural-overview]

## Adapter priority: skip
- Reason: devnet only, no public REST API, closed-source contracts and withheld IDL, no volume, unreconciled fee statements, Solana-only (not PayBox/EVM reachable). Re-check if the mainnet program address is published and the REST API ships. Signal-only use is pointless without real trading.

## Fixtures
- docs/research/fixtures/oyrade/mcp-oauth-protected-resource.json : GET https://mcp.oyrade.com/.well-known/oauth-protected-resource (shows MCP resource URL and Auth0 authorization server).
- docs/research/fixtures/oyrade/oyrade-mcp-0.1.0-package.json : package.json from the npm tarball (read, not executed).
- No market/price response fixtures: no public market GET endpoint exists.

## Suspicious content
- None found targeting AI agents. Note: the MCP landing page and package push agents toward paid x402 tools and OAuth sign-in; treated as marketing data, not followed.

## Sources
- https://www.npmjs.com/package/oyrade-mcp and https://registry.npmjs.org/oyrade-mcp (created and last modified 2026-02-24, single version 0.1.0, no README) [H]
- https://oyrade.com (307 to https://devnet.oyrade.com/) [H]
- https://devnet.oyrade.com/ (landing: "Devnet", X: x.com/OyradeXHQ, Discord, Telegram; GitHub/Whitepaper "SOON") [H]
- https://docs.oyrade.com/ , /developers/overview , /developers/api-reference , /developers/smart-contracts , /trade-on-oyrade/fees , /markets/how-markets-are-created , /overview/architectural-overview , /changelog [H]
- https://mcp.oyrade.com/ and /.well-known/oauth-protected-resource [H]
- WebSearch "Oyrade prediction markets Solana": no independent coverage found [M]

## Open questions
- Mainnet launch date and program address; collateral token; IDL publication; REST API ship date.
- Which network the x402 payments use and whether MCP read tools are free without OAuth.
- Resolution dispute parameters (UMA bond/liveness).
- Which fee figure applies via the agent/MCP path (0.20% vs "$0.01 + 3%").
