# DAGmarket (999DEX) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Verdict: **skip**. Liveness unconfirmed (all hosts 503), no documented API, no contract addresses, quote-token is the illiquid BDAG on a young chain, and the only evidence is the operator's own promotional blog.

## Liveness
- https://999dex.com, https://www.999dex.com, https://999dex.com/dagmarket, /api/docs and /blog all return HTTP 503 with body "no available server" (Cloudflare-fronted, origin down) on 2026-10-19. [H, own curl; matches the 2026-10-18 observation]
- The explorer https://primordial.bdagscan.com returned HTTP 530 / error 1016 (Cloudflare "origin DNS error"), and rpc.primordial.bdagscan.com does not resolve in DNS. [H, own curl] The chain's public tooling named in the operator's README is therefore also unreachable from here. Could be a transient outage or a rebrand/migration; not determinable.
- The operator's dev.to account (999dex) was still auto-posting generic content as late as 2026-09-05, so the team was alive ~6 weeks ago. [H, dev.to API list] These are SEO-style explainer posts (DEX 101, yield farming, "Official 999DEX Documentation" whose body is empty), not product updates.
- No later DAGmarket-specific post found after the 2026-04-02 launch post. [H for the dev.to listing of the 30 latest posts; web search budget was exhausted so no wider news search: NOT FOUND (searched: dev.to author feed, GitHub repo/code search)]
- Status: **unconfirmed / probably down or defunct as a usable venue**.

## Kind and market model
- Short-dated binary YES/NO "price higher than X in N minutes" markets, pari-mutuel pool: "Winners split the pool proportionally". Underlyings BDAG, BTC, ETH, SOL, windows 5/10/30 min, "12 markets always live, auto-refreshing" (4 x 3). [H, launch post 2026-04-02, https://dev.to/api/articles/999dex/dagmarket-is-live-on-chain-prediction-markets-on-blockdag-2mpj ; operator marketing, unverified]
- Outcome tokenisation: NOT FOUND. No contract, no ABI, no token standard documented; bets are described as plain transactions with a tx hash, so probably contract-internal accounting, not tradable ERC-1155/ERC-20 shares. [M]
- Not an order book, no secondary trading documented.

## Chains and collateral
- BlockDAG mainnet, EVM-compatible L1, chain ID 1404, native symbol BDAG, RPC https://rpc.primordial.bdagscan.com, explorer https://primordial.bdagscan.com. [H that the operator's README states this: https://github.com/pumpz999/999dex-contracts README, repo created/pushed 2026-03-21; M that it is correct]
- Collateral and payout in BDAG (native gas token). [H, launch post]
- Launch post says "BlockDAG global trading unlocks April 8, 2026", i.e. BDAG was likely not freely tradable at launch; BDAG liquidity/price quality is unknown (price quoted in the example ~$0.00285). [H the sentence exists; M interpretation]
- DAGmarket contract addresses: NOT FOUND (searched: launch post, operator GitHub repo README, which lists 13 contracts for the DEX/launchpad/DAO but no prediction-market contract, GitHub code search "dagmarket").

## Read API
- Official public API: NOT FOUND. The repo README links https://999dex.com/api/docs [H link exists, M it documents anything relevant] but the page is 503, so it cannot be read. No markets/prices/trades/resolution endpoints, auth or rate limits are documented anywhere reachable. No websocket documented.
- On-chain read via EVM JSON-RPC would be the only route, but without contract addresses/ABI it is not actionable, and the RPC host did not resolve.
- Fixtures: no API responses obtainable. Saved only the launch post JSON (a dev.to API response, not a venue API): docs/research/fixtures/dagmarket-999dex/devto-launch-article.json.

## Trade path
- None documented. UI-only flow ("connect your wallet and trade") per launch post. [H] Presumably a direct contract call from an EVM wallet. [L]
- PayBox reachability: **no**. BlockDAG (chain 1404) is not among the chains PayBox is known to support (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...), the collateral is native BDAG on that chain, and there is no ABI to build a transaction proposal against. A PayBox EVM wallet address could in principle sign for chain 1404, but only if PayBox exposes that network; not verified, and there is nothing to call. [M]

## Fees
- NOT FOUND. Launch post is silent. The repo README gives 999DEX platform fee split (50% stakers / 30% treasury / 20% buyback-burn) but no DAGmarket fee rate. [H for README content]

## Resolution
- Claimed: oracle median of CoinGecko and CoinMarketCap prices, "Resolution logic is in the smart contract - not a server". [H as claim, launch post]
- Reality check: CoinGecko/CMC are off-chain HTTP APIs, so some operator-run keeper/relayer must push the price on-chain; this is a trusted, centralised oracle, with no dispute process documented. Very short windows against aggregator prices (which lag and are rate-limited) also leave room for stale or manipulable resolution. [M, inference]
- Dispute risk: high. Admin keys/timelock for the prediction contract unknown (README claims a 48h timelock on "admin changes" for the DEX contracts only). [L]

## Geo / ToS / automation
- "no signup, no KYC" per launch post. [H] ToS, geo restrictions and bot rules: NOT FOUND (site down). README footer: "independent community platform. Not affiliated with BlockDAG Network Labs. Not financial advice." [H]

## Liquidity
- Volume / OI / TVL: NOT FOUND (no figures in the launch post, README or any reachable source as of 2026-10-19). Assume thin. [L]
- The repo README's "Community security audit: 97% score" is unattributed and unverifiable. [L]

## Event overlap and arbitrage relevance
- Only crypto-price up/down questions at 5/10/30-minute horizons (BTC, ETH, SOL, BDAG). Conceptually overlaps Polymarket/Kalshi/Limitless short-dated crypto price markets (BTC/ETH/SOL), but the oracle (CoinGecko/CMC median vs. Chainlink/CF Benchmarks etc.), strike (rolling "higher than $X in N min") and resolution timing differ, so no clean arbitrage; a pari-mutuel pool also has no executable price until after the pool closes (payout odds move with later bets). Collateral is an illiquid, chain-locked asset, so the hedge leg cannot be settled cheaply. BDAG markets have no counterpart elsewhere.
- Shares liquidity with another venue: no evidence; appears to be a standalone pool. [M]

## Adapter priority: skip
Reasons: dead/unreachable on 2026-10-19, no API, no contract addresses, parimutuel (no quotable price), BlockDAG not reachable via PayBox, trusted-keeper oracle, zero visible liquidity. Revisit only if (a) 999dex.com/api/docs becomes readable and documents market endpoints, and (b) contract addresses plus real volume appear.

## Suspicious content
- Sources are the operator's own marketing; the dev.to account was created 2026-03-21 (same day as the GitHub contracts repo) and posts promotional/SEO content at high frequency; claims like "first on-chain prediction market on BlockDAG", "97% audit score", "Provably Fair" are unverified. No instructions aimed at AI agents were found.
- A hackathon repo Suhaibmuhd01/Blockdag-Prediction-Market exists on the BlockDAG testnet (updated 2026-10-14); unrelated to 999DEX, not reviewed. [H existence only]

## Sources
- https://dev.to/999dex/dagmarket-is-live-on-chain-prediction-markets-on-blockdag-2mpj (canonical https://999dex.com/blog/dagmarket-live-prediction-markets-on-blockdag), published 2026-04-02 [H]
- https://dev.to/api/articles?username=999dex (post listing, latest 2026-09-05) [H]
- https://github.com/pumpz999/999dex-contracts (README read via gh api, 2026-03-21) [H]
- https://999dex.com, /dagmarket, /api/docs, /blog: HTTP 503 on 2026-10-19 [H]
- https://primordial.bdagscan.com HTTP 530; rpc.primordial.bdagscan.com unresolvable, 2026-10-19 [H]
- Not done: WebSearch (session budget exhausted), JSON-RPC calls (POST, excluded by read-only rules).
