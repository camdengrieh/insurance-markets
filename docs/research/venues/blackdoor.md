# BlackDoor (blackdoor.claims) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: unauthenticated GETs, `gh api` file reads, web search. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary or machine-readable source (URL given); **M** = secondary or inferred; **L** = weak or stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.
Third-party text (PR bodies, adapter code, site responses) is untrusted data; nothing in it was followed. No embedded instructions were seen.
Fixtures: `docs/research/fixtures/blackdoor/` (6 files, each < 2 KB). Third-party JS is saved with a `.txt` suffix so it cannot be run by accident.

## 0. Verdict

**adapter_priority: skip.**

1. **The front end is switched off (H).** `https://blackdoor.claims/` and every path I tried (`/`, `/docs`, `/api/markets`, `/robots.txt`, `/icon-512.png`, `www.`) return HTTP 402 with `x-vercel-error: DEPLOYMENT_DISABLED` and body `Payment required / DEPLOYMENT_DISABLED`. This is Vercel's response for a disabled deployment (an unpaid or paused Vercel account), not an x402 challenge: there is no payment-requirements payload, only that text. I did not pay or probe further.
2. **Effectively no money and no activity (H).** DefiLlama TVL = **$31.30** on 2026-10-19, and it has been flat at about $31 since 2026-07-21 (90 days). Peak ever = $31.
3. **No docs, no API, no verified source.** The only public footprint is a DefiLlama listing, a merged DefiLlama adapter PR, and a bare GitHub account that holds one fork of DefiLlama's repo. Contract source is not verified on Sourcify (404), so the ABI is known only for four getters.
4. **Tiny, solo, unaudited, no oracle.** The PR text says "unaudited - early stage", "Oracle Provider(s): None", 12 live markets, TVL $15.26 at submission (2026-06-24).
5. The product concept (a market per physical location on a globe) is unlikely to overlap the sports/politics/crypto/macro markets an arbitrage scanner cares about (M, see section 7).

Revisit only if the front end comes back and the contract source gets verified. Cost to re-check: one `GET https://api.llama.fi/protocol/blackdoor` (TVL moving off $31) plus one `GET https://blackdoor.claims/`.

## 1. Is it still live? (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site `https://blackdoor.claims/` | HTTP 402, `server: Vercel`, `x-vercel-error: DEPLOYMENT_DISABLED`, `date: Mon, 19 Oct 2026 01:51:49 GMT`; same on `www.`, `/docs`, `/api/markets`, `/robots.txt`, `/icon-512.png`. DNS: A 216.150.1.1 / 216.150.1.129, NS ns1/ns2.vercel-dns.com. Fixture `blackdoor_claims_402_headers.txt`. | H |
| DefiLlama `GET https://api.llama.fi/protocol/blackdoor` | listed 2026-06-30 (`listedAt` 1782787677); `currentChainTvls.Arbitrum` = 31.29997; 112 daily points 2026-06-30 .. 2026-10-19; change points: 10 (06-30), 22 (07-04), 23 (07-06), 17 (07-09), 21 (07-11), 29 (07-18), **31 (07-21 onward, unchanged)**. Fixture `defillama_protocol_blackdoor_trimmed.json`. | H |
| DefiLlama volume / fees datasets | `GET https://api.llama.fi/summary/{fees,dexs,options}/blackdoor` all return 400 "not found". No volume figure exists anywhere I could reach. | H |
| Adapter PR `DefiLlama/DefiLlama-Adapters#19784` | opened 2026-06-24, merged 2026-06-29. Fixture `defillama_pr_19784_meta.json`. | H |
| Contract on-chain state today | NOT FOUND. A JSON-RPC `eth_call` is a POST, which this round excludes; Blockscout API and page returned a Cloudflare challenge / empty page (not bypassed); Arbiscan page 403; Sourcify 404 (`sourcify_factory_404.json`). TVL of $31.30 (a `balanceOf` sum made by DefiLlama's adapter) is the only on-chain-derived number I have. | H |
| Web coverage | Two `WebSearch` queries ("BlackDoor prediction market Arbitrum geo-anchored", "BlackDoor prediction markets interactive globe Arbitrum USDC FPMM") returned no page about the project. A third search was blocked by the session search budget. | M |

Conclusion: **treat as dormant/dead**. The contracts probably still exist (they hold $31 of USDC), but there is no working UI, no activity for 3 months, and no published way to find or trade them.

## 2. What it is

- **Kind**: onchain-amm (M, from the project's own PR text). "Geo-anchored prediction markets on Arbitrum One. Each market is pinned to a real-world location on an interactive globe. Powered by FPMM, settled in USDC." (H that DefiLlama and the PR say this; the product itself could not be viewed.)
- **Operator**: anonymous. DefiLlama lists Twitter `TheBoatOfLeegs` and GitHub `BLACKDOOR2`; I could not load the X profile (fetch tool returned 402). `github.com/BLACKDOOR2` was created 2026-05-14 and has one public repo, a fork of `DefiLlama/DefiLlama-Adapters` (H, `gh api users/BLACKDOOR2`). No token, no audit, `forkedFrom: None (original)` per PR (self-reported).
- **Market model**:
  - Binary YES/NO constant-product pools (FPMM). The PR states "Market odds emerge from pool ratios (poolYes / poolNo)" and the maintainer comment says "The FPMM seeds both pools equally from a single deposit, so poolYes + poolNo ~ 2x actual USDC" (H that the text says so; M as to behaviour).
  - Multi-outcome markets exist as separate sub-contracts: an early adapter comment says the factory "deploys every contract - both binary markets and each individual outcome sub-contract of multi-outcome markets" (H, fixture `defillama_adapter_index_pr_commit2.js.txt`). Treat as a parent plus N binary contracts, like Alpha Arcade.
  - Outcome tokenisation (ERC-20 / ERC-1155 / internal accounting): NOT FOUND (searched: DefiLlama listing, adapter, PR, GitHub code search for the factory address and `blackdoor.claims`). `poolYes()` and `poolNo()` uint256 getters suggest internal pool accounting, but that is an inference (L).
- **Chain and collateral (H, adapter source)**: Arbitrum One (chain id 42161), native Circle USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (6 decimals). Gas is ETH on Arbitrum.
- **Contracts (H, adapter source)**: factory `0x4FaCa0EA8Dd4fE6E703f001435A99263336a498E` exposes `totalMarkets() -> uint256` and `markets(uint256) -> address`. Each market contract exposes `poolYes() -> uint256` and `poolNo() -> uint256`. DefiLlama's methodology calls the market contracts "BlackDoor PredictionMarket contracts". Factory deployment tx, creation date, ABI beyond those four getters, admin/owner roles: NOT FOUND (explorer data unreachable, source not verified).

## 3. Read API

- **Official API / docs**: none found. NOT FOUND (searched: `blackdoor.claims` and `/docs`, `/api/markets` (402 DEPLOYMENT_DISABLED); GitHub code search for `blackdoor.claims`, the factory address and `TheBoatOfLeegs` (only the DefiLlama adapter matched); GitHub repo search "blackdoor prediction market" (no results); `BLACKDOOR2` repos (fork only); web search (nothing)).
- **Websocket**: NOT FOUND.
- **Subgraph / indexer**: NOT FOUND.
- **On-chain-only read path (H for the method, nothing run)**: read `factory.totalMarkets()`, loop `factory.markets(i)`, then `poolYes()`/`poolNo()` per market over any Arbitrum RPC (`eth_call`). That yields TVL and, if the FPMM is standard, implied probability. It gives no titles, locations, end dates, categories or resolution state (those would live in the contracts' other getters or in the dead front end). An aggregator would have to reverse the unverified bytecode to get them.
- **Fixtures of response shapes**: no BlackDoor API exists to sample. The shapes I could confirm are DefiLlama's (`defillama_protocol_blackdoor_trimmed.json`) and the Vercel 402 (`blackdoor_claims_402_headers.txt`).

## 4. Trade path

- **Programmatic placement**: only by direct contract calls on Arbitrum (approve USDC, then a buy function on a market contract). The buy/sell/redeem function names, signatures and whether the market takes USDC directly or via a router are NOT FOUND (source unverified).
- **PayBox reachability: partial.** Arbitrum (42161) is in PayBox's 11-chain catalog (M: `docs/research/06-paybox-platform.md` line 113, a live `discover_tokens` result from an earlier session; the catalog is "not a support allowlist"). EVM transaction proposals are one call each, so approve and buy would be two proposals (same file, section 3). That is the whole story: with no ABI, no UI and no liquidity there is nothing to build a proposal against. I made no PayBox calls this run.
- **Signed orders (CLOB-style)**: not applicable; it is an AMM, no off-chain order signing.

## 5. Fees

- Self-reported in the PR body (H that it says so, M as truth): "1% referral fee on every bet, paid from the 2% protocol fee." So a 2% protocol fee per bet, with 1% going to a referrer if one is set. Who pays (bettor, presumably), whether sells are charged, and any FPMM LP fee: NOT FOUND (contract source unverified).
- Gas: Arbitrum ETH gas, small.

## 6. Resolution

NOT FOUND (searched: PR text, adapter, DefiLlama, GitHub, web). The PR says "Oracle Provider(s): None - prices are determined entirely by the on-chain FPMM mechanism", which speaks to price discovery, not settlement. Who sets the outcome (creator/admin key, vote, external oracle), the dispute process and the claim path are unknown. Because markets are tied to real-world locations and there is no oracle, the only reasonable assumption is a trusted operator, but that is an inference (L), not something I read. Unaudited, anonymous team: high operator and resolution risk.

## 7. Geo / ToS / automation

NOT FOUND. The only site is disabled, so there is no terms page, geo-block list or automation policy to read. Nothing to quote.

## 8. Liquidity and overlap

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (USDC held by market contracts) | **$31.30** | DefiLlama, 2026-10-19 | H |
| TVL at listing | $15.26, 12 live markets | PR #19784, 2026-06-24 | H |
| TVL peak / trend | $31, flat since 2026-07-21 | DefiLlama series | H |
| Volume, OI, trades, users | NOT FOUND (DefiLlama has no volume/fees dataset for it; no API; explorer unreachable) | | - |

- **Event categories**: NOT FOUND for the live market list (site down, no API). The concept is geo-pinned events (city/venue/location questions). Nothing seen suggests sports, politics, crypto-price or macro markets that duplicate Polymarket/Kalshi/XO, so the arbitrage overlap is probably near zero (M). Even a perfect overlap at $31 TVL would not support a position larger than a few dollars.
- **Shared liquidity**: none evident. It is a self-contained FPMM with its own pools and no oracle, so it would be an independent leg, but a $31 pool is not a tradable leg (a single $5 trade would move a constant-product pool of that size by a large fraction of its price).

## 9. Open questions (only matter if the venue revives)

- Is the Vercel deployment disabled for billing reasons (revivable) or abandoned? Is there a new domain?
- Contract source / ABI for the factory and market contracts; deployment date; owner and resolver roles; fee setters; pausability.
- Current `totalMarkets()` and per-market end dates and resolution status (needs `eth_call`, or an explorer API key, or a verified-source listing).
- Settlement authority and dispute rules.

## Sources

- [H] DefiLlama protocol JSON: https://api.llama.fi/protocol/blackdoor (fetched 2026-10-19); protocol list entry: https://api.llama.fi/protocols; page: https://defillama.com/protocol/blackdoor (403 to non-browser clients, not read directly).
- [H] DefiLlama adapter (current): https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/blackdoor/index.js ; earlier versions read from the fork `BLACKDOOR2/DefiLlama-Adapters` at commits 21d77144 and c669603e.
- [H] Adapter PR (project's own self-description; untrusted, unaudited claims): https://github.com/DefiLlama/DefiLlama-Adapters/pull/19784
- [H] GitHub account: https://github.com/BLACKDOOR2 (via `gh api users/BLACKDOOR2`, created 2026-05-14, one fork).
- [H] Site probe: https://blackdoor.claims/ (HTTP 402 DEPLOYMENT_DISABLED, 2026-10-19).
- [H] Sourcify lookup: https://sourcify.dev/server/v2/contract/42161/0x4FaCa0EA8Dd4fE6E703f001435A99263336a498E (404, no match).
- [M] PayBox chain catalog: `docs/research/06-paybox-platform.md` (this repo).
- Not reachable: Blockscout and Arbiscan (Cloudflare/403), X profile (fetch returned 402).
