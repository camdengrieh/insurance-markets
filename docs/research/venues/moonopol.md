# Moonopol - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. Moonopol is a Solana USDC binary CLOB (Anchor program "moonopol-alpha") whose only evidence is a Feb-Mar 2025 audit press release and sponsored posts. Its website returns Cloudflare 522 (origin down) on 2026-10-19. I found no docs, API, program address, volume figure or 2026 activity. Not integrable and no evidence it is live.

## Is it live?

- https://teaser.moonopol.com/ and https://moonopol.com/ both return **HTTP 522** (Cloudflare "connection timed out" to the origin) on 2026-10-19. `www.moonopol.com` 301s to `moonopol.com`. H - curl, WebFetch.
- DNS: `app.moonopol.com` and `api.moonopol.com` do not resolve; `docs.moonopol.com` timed out. H (curl)
- The domain still resolves to Cloudflare IPs, so the registration/DNS is alive, but the origin is not answering. This is consistent with a dead or abandoned project; it could also be a temporary outage. M
- `x.com/moonopolcom` returned HTTP 200 to curl, but X serves a shell page to any client, so this says nothing about the account's activity. L
- Newest dated evidence is **March 2025** (sponsored posts, below). Nothing from 2026 found. All evidence is >6 months old: L/stale.
- GitHub repo search (`moonopol`) and code search: nothing found (gh returned 404 for both search endpoints, so the search itself may have been blocked; treat as not conclusive). NOT FOUND (searched: gh search repositories/code).
- Mainnet status never stated by any source. NOT FOUND.

## Kind and market model

- kind: onchain-clob (Solana, Anchor/Rust). M (secondary sources only; code and docs not seen)
- Binary YES/NO markets; users "buy yes or no tokens"; limit and market orders matched through "PDA-based mechanisms". Programme handles market initialisation, matching, resolution, reward distribution. M - https://chainwire.org/2025/02/27/hashlock-finishes-a-security-audit-for-moonopol-an-exclusive-binary-prediction-market-on-solana/ ; https://hashlock.com/audits/moonopol ; https://web3.bitget.com/en/dapp/moonopol-24680
- Focus: Solana memecoins and trending crypto events ("Predict The Trenches"). L (sponsored/aggregator text)
- Outcome tokenisation details (SPL mint per outcome vs internal ledger): NOT FOUND (searched: Chainwire, Hashlock page, Bitget, Watcher.guru). The Hashlock PDF report was not readable.

## Chains and collateral

- Solana; collateral/settlement USDC. M (Chainwire, Hashlock, Bitget)
- Program ID / market accounts: NOT FOUND (searched: Chainwire, Hashlock page, Bitget, Alchemy dapp listing, GitHub).
- The project says it has no token. L (Instagram bio via search snippet)

## Read API

- exists: **none** found. No docs site, no REST/WebSocket, no SDK, no subgraph/indexer, no IDL published. NOT FOUND (searched: site (522), docs/api/app subdomains, GitHub, WebSearch).
- Only theoretical route: read Solana program accounts via RPC, which needs the program ID and IDL, neither of which is public as far as found.
- No fixtures saved (no API responded). `docs/research/fixtures/moonopol/` not created.

## Trade path

- None documented. Presumably signed Solana transactions by a wallet calling the Anchor program's order instructions. L (inference from "Anchor program" + limit/market orders)
- No programmatic order API or signing scheme is documented. NOT FOUND.

## PayBox reachability

- **Unknown, probably partial in theory.** PayBox has Solana credentials, so a Solana wallet could in principle sign transactions, but with no program ID, IDL, or live frontend there is nothing to propose. I did not call PayBox tools. Result: `unknown`, effectively unreachable today.

## Fees

- "Using Moonopol is not free" (sponsored post). No formula, rate or payer. NOT FOUND. L - https://watcher.guru/news/moonopol-predict-the-trenches-with-precision

## Resolution mechanism and dispute risk

- Bitget's dapp page (AI-generated per its own disclaimer) says an "AI-driven oracle" verifies outcomes. L - https://web3.bitget.com/en/dapp/moonopol-24680. Other sources only say "market resolution" exists. No dispute process documented. High unknown risk. Hashlock reported initial vulnerabilities that were fixed. M

## Geo / ToS / automation

NOT FOUND (searched: site down; no ToS reachable).

## Liquidity

- No volume, OI or TVL anywhere. Bitget lists all market data as unavailable ("-"). Alchemy and Bitget pages carry no usage data. H (Bitget page read 2026-10-19; figures absent). Effectively unknown and no sign of any.

## Event overlap and shared liquidity

- Would overlap only crypto/memecoin questions, mostly unlisted on bigger venues (the "trenches" niche), so little arbitrage use even if live.
- No indication it shares liquidity with another venue. If live it would be independent but with unknown, likely tiny depth.

## Sources

- https://teaser.moonopol.com/ , https://moonopol.com/ - HTTP 522 on 2026-10-19 (H)
- https://chainwire.org/2025/02/27/hashlock-finishes-a-security-audit-for-moonopol-an-exclusive-binary-prediction-market-on-solana/ - audit PR, 2025-02-27 (H for what it says; L stale). Says "moonopol-alpha", Anchor, limit/market orders, USDC; does not state network of deployment.
- https://hashlock.com/audits/moonopol - audit listing, Feb 2025, "Secure", Solana (H; PDF not read)
- https://watcher.guru/news/moonopol-predict-the-trenches-with-precision and https://cryptorank.io/news/feed/48f85-moonopol-predict-the-trenches-with-precision - sponsored posts, 2025-03-21 (L; cryptorank page itself not fetchable: 403; known only from search snippets)
- https://web3.bitget.com/en/dapp/moonopol-24680 - aggregator page, no dates, AI-generated disclaimer (L)
- https://www.alchemy.com/dapps/moonopol - listing (only seen in search results; fetch returned an unrelated page)
- WebSearch quota was exhausted partway through, so no further 2026 news searches were done. A later retry for X-account activity, Wayback snapshots (429 rate limited) and the Hashlock PDF could change this verdict only if the project turns out to be live.
