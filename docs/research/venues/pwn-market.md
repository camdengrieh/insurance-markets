# pwn.market venue spec

Researched 2026-10-19. Verdict: **skip**. Live website, but it is a one-vote-per-user Yes/No poll game with no money, no chain, no public API and admin resolution. It is not a tradable venue and not an arbitrage leg.

Tags: H = read first-hand this session in a primary source; M = inferred; L = weak/stale.

## Is it live
- https://pwn.market/ returned HTTP 200 on 2026-10-19 (Cloudflare-fronted, Vite/React SPA). [H] https://pwn.market/
- Title "pwn.market | The World's First Cybersecurity Prediction Market"; description "Trade on the probability of cyber events. Predict zero-days, breaches, and global outages". [H] https://pwn.market/
- "SYSTEM ONLINE" is a static string in the footer chunk, not a health check. [H] https://pwn.market/assets/Footer-CeJjVEPR.js
- Org github.com/pwnmarket created 2025-12-09 with 0 public repos; site is a Lovable/GPT-Engineer-generated app (favicon hosted on gpt-engineer-file-uploads, dated 2025-12). [H] gh api users/pwnmarket; page head. Site is under 11 months old, so the project is young, not stale.
- Not checked: Web search budget was exhausted, so I found no third-party coverage, volume figures or news. [NOT FOUND (searched: WebSearch blocked by session budget)]

## Kind and market model
- Not on-chain. Backend is Supabase (project host uvnyotarqcljuzdxnpgz.supabase.co) with tables `markets`, `bets`, `favorites`, `market_messages`, `profiles`, `user_roles`. [H] bundle https://pwn.market/assets/index-BvBOwKit.js and Index-Be2zQ7i5.js
- Binary Yes/No. A "bet" row is `{market_id, user_id, position, amount: 1}`: `amount` is hard-coded to 1 on insert, and a user can only hold, change or withdraw one position per market. There is no price, order book, AMM or share token. [H] Index-Be2zQ7i5.js
- "Probability" is a column on `markets` (`probability`, `volume` fields are read; chart derives a history from `bets` rows starting at 50). It is a vote tally, not a traded price. [H] Index-Be2zQ7i5.js; derivation of exact formula [M]
- Users can submit events (status `pending`) that an admin approves (`active`); admin resolves (`resolution` yes/no, `status: resolved`) or deletes markets. [H] Index-Be2zQ7i5.js
- Other UI: leaderboard (`/leaderboard`, ranks predictors by bets), live feed chat (`market_messages`), favorites. Routes are only `/`, `/leaderboard`, `*`. [H] bundle

## Chains and collateral
- None. The app has no wallet-connect, token, USDC or contract code of its own; the only wallet strings are the generic Supabase auth-js library (Sign-In-With-Ethereum/Solana helpers), unused by the app UI, which uses email + password sign-up. [H] bundle chunks
- No contract addresses found. [NOT FOUND (searched: site bundle chunks, github.com/pwnmarket, site head)]

## Read API
- Official public API: **none** documented. No docs site, no OpenAPI, robots.txt allows all, sitemap.xml and llms.txt return 404. [H] https://pwn.market/robots.txt
- The only data path is the app's own Supabase PostgREST backend, gated by an anon key shipped in the client and Row Level Security. That is an undocumented internal backend, not a supported API; I did not call it and did not save fixtures. Using it for an adapter would be unsupported scraping of a hobby backend and could break or be blocked at any time. [M]
- Fixtures saved: none (no documented public API).

## Trade path
- None. "Trading" is casting a free vote (requires email/password account) through the web UI. No order signing, no EIP-712, no transaction proposals. [H]
- PayBox reachable: **no**. There is nothing for an EVM or Solana wallet to sign or pay. Account creation is excluded by the ground rules anyway.

## Fees
- None; there is no money flow. [H] (no fee, price or payment code in bundles)

## Resolution and dispute risk
- Centralised admin sets `resolution` on the market row (role from `user_roles`). No oracle, no dispute window, no bond. Expiration date is stored but resolution is manual. [H] Index-Be2zQ7i5.js
- Very high resolution risk; criteria are free-text "Additional context or resolution criteria".

## Geo, ToS, automation
- No ToS found; only a Privacy link in the footer. [H] Footer chunk; ToS [NOT FOUND (searched: footer links, bundles)]
- Automated voting would violate the apparent one-human-one-vote design. Not suitable for automation.

## Liquidity
- No liquidity concept. `volume` is the number of votes on a market, each worth 1 unit of nothing. No volume figure was read (would need the Supabase call). Treat as zero real liquidity. [M]

## Event categories overlapping other venues
- Cybersecurity and outage events (zero-days, breaches, global outages). Some Polymarket/Kalshi markets touch major outages or breaches, but this site's markets are user-generated and unpriced, so no arbitrage is possible. [M]
- Possible weak use: a crowd-sentiment signal on cyber-event questions, but sample size and Sybil resistance are unknown (email signup only). [M]

## Shared liquidity
- None; it is standalone and has no liquidity. [H]

## Adapter priority: skip
- No money, no chain, no public API, admin resolution, tiny and young. Revisit only if the project adds a token/contracts or publishes an API.

## Suspicious content
- None observed. Bundles contained no AI-directed instructions.

## Open questions
- Whether the project plans real-money or on-chain settlement (no evidence found).
- Actual market count and vote volume (only readable through the undocumented Supabase backend, not accessed).

## Sources
- https://pwn.market/ (homepage HTML, 2026-10-19) [H]
- https://pwn.market/robots.txt, /sitemap.xml (404), /llms.txt (404) [H]
- https://pwn.market/assets/index-BvBOwKit.js, Index-Be2zQ7i5.js, Leaderboard-DTErxg3C.js, Footer-CeJjVEPR.js (client bundles, read as static text only, not executed) [H]
- https://github.com/pwnmarket (org exists, 0 public repos, created 2025-12-09; via gh api) [H]
- Links found in footer: https://x.com/pwnmarket (not fetched) [L]
