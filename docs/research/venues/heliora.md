# Heliora (Solana prediction-market project) - venue spec

Researched 2026-10-19. Verdict: **skip**. No reachable site or API, one-person-looking npm publisher, ~1 download/week, code is partly mock. Not a live, liquid venue.

Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Liveness (H)
- Hints said heliora.xyz does not resolve. Confirmed also unresolvable (H, curl, DNS failure): heliora.xyz (hint), heliora.fi, www.heliora.fi, api.heliora.fi, www.heliora.xyz, app.heliora.xyz.
- api.heliora.fi is the only backend URL named by the packages, and it does not resolve (H). So every REST tool in the packages is dead.
- Unrelated domains: heliora.com is a GoDaddy for-sale redirect (H); heliora.app is a sun/moon terrain planner (H); heliora.ai is an unrelated Next.js site (H, not examined further). None is a prediction market.
- npm: @heliora/mcp-server 1.0.1 and @heliora/agent-kit-plugin 1.0.1, both published 2026-05-08, nothing since (H, registry.npmjs.org). npm search shows ~12 monthly / 1 weekly downloads, 0 dependents (H, search dated 2026-10-19). A copycat plugin by another publisher exists with ~15 monthly downloads (H).
- No GitHub repo, docs site, homepage or repository field in the package metadata (H). WebSearch was unavailable (session budget exhausted), so no independent press/social check was done: NOT FOUND (searched: npm registry, DNS probes, package metadata).
- Solscan page for the program returned 403, so deployment status on-chain is unverified. Not checked via Solana RPC because JSON-RPC requires POST (forbidden by ground rules).

## What the packages claim (H as to content; claims themselves L)
Sources: npm tarball of @heliora/mcp-server 1.0.1 (read statically, nothing executed), registry readmes.
- Name "heliora_prediction_market", Anchor program id `By5KbxUEFGs7NrQYLXcjmptft6yX2saVWvoA8sx7HzqT` (appears in src/idl.ts; no evidence of mainnet deployment; the TS server defaults RPC to devnet).
- Model: AMM pool per market (initializePool, addLiquidity, swap, splitTokens, setWinner, claimRewards). Up to 8 outcomes (`outcomesCount`, `outcomeMints[8]`), each outcome an SPL mint, collateral an SPL mint held in a vault; LP mint. UI/API talk binary YES/NO plus a "15-deep orderbook" and limit orders, which is inconsistent with a pure AMM program (M, likely mocked or off-chain).
- Resolution sources in the IDL: Authority, Pyth, Switchboard, AI, DAO; `setWinner` is authority-gated; README claims "5-agent AI oracle consensus" via an API call (L).
- Fees: GlobalConfig has protocolFeeBps, creatorFeeBps, lpFeeBps; no values published. NOT FOUND (searched: package source, readmes).
- Categories in tool enums: Crypto, DeFi, NFTs, Memes, Politics, AI, Sports, Social (H as enum values; no volume data).

## Read API
- Python server (server.py in the npm tarball) calls `https://api.heliora.fi` with paths `/api/markets`, `/api/markets/{id}`, `/api/markets/{id}/orderbook`, `/api/portfolio`, `/api/stats/protocol`, `/api/stats/leaderboard`, `/api/oracle/resolve/{id}` (POST) and sends an optional `X-Wallet` header as the only "auth" (H as to source). Host is dead, so no response shape could be confirmed.
- TS server: `list_markets` reads program accounts via Solana RPC; `get_market` returns the literal string "Market details fetched (Mock)"; two tools hit `/api/leaderboard` and `/api/agents/{id}/stats` (H). The two packages disagree on tool names and mechanics, and the npm README says `pip install` for an npm package.
- Docs URL: NOT FOUND. Rate limits, websocket: NOT FOUND.
- No fixtures saved (nothing live to fetch).

## Trade path
Per source: Anchor instructions `swap(marketId, outcomeIndex, amountIn)` etc. signed by a Solana keypair, or a REST `POST /api/trades` (dead). A PayBox Solana wallet could in principle sign an Anchor tx, but there is no verified live program or liquidity. EVM chains: not applicable (Solana only). paybox_reachable: no.

## Fees / geo / ToS
Fee values, geo restrictions, ToS and automation rules: NOT FOUND (no site).

## Liquidity
No volume, OI or TVL figure exists anywhere found. README example "Create a market ... $1000 seed" and `liquiditySeed` default 500 are defaults, not data. Treat as zero.

## Overlap / independence
Nominal categories (crypto price via Pyth, politics, sports) would overlap other venues, but with no liquidity there is no arbitrage leg. Shares liquidity with no other venue (self-contained AMM per its IDL).

## Suspicious content
- README example Claude Desktop config embeds an example Solana wallet string; harmless placeholder, not copied here.
- Package docs describe tools such as `heliora_create_market` / `place_trade` that an agent would call with a wallet; no prompt-injection text aimed at AI agents seen. Mismatch between packages (Python vs TS, mock handlers) is a quality red flag, not an injection.
- A second publisher republished the plugin as "Official Heliora ... plugin" (npm), so "official" labels are unreliable.

## Open questions
- Is the program deployed on Solana mainnet, and does it hold any funds? (needs explorer access)
- Did a real site ever exist under a domain not in the hints (e.g. a different TLD)?

## Sources
- https://www.npmjs.com/package/@heliora/mcp-server and https://registry.npmjs.org/@heliora/mcp-server (H)
- https://registry.npmjs.org/@heliora/mcp-server/-/mcp-server-1.0.1.tgz (H, static read: package.json, README.md, server.py, src/index.ts, src/idl.ts)
- https://registry.npmjs.org/@heliora/agent-kit-plugin (H)
- https://registry.npmjs.org/-/v1/search?text=heliora (H, 2026-10-19)
- DNS/HTTP probes listed under Liveness (H)
