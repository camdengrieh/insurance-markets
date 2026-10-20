# Viral8 (viral8.vercel.app) - venue spec

Researched 2026-10-19. Verdict: **skip** (pre-launch / demo-stage; no markets, no API, no verified on-chain program).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Summary

- Viral8 is a SvelteKit front end on Vercel for a planned Solana "social media virality prediction market" (bet on whether YouTube/TikTok/Twitter/Instagram/Facebook content goes viral). [H]
- The site is up (HTTP 200, 2026-10-19), but it is a marketing page: the "Join Waitlist" button is disabled and labelled "Coming Soon"; the VR8 token is "Coming Soon". [H]
- The public dashboard in the front-end repo is populated with hard-coded `mockContent` (fake videos, fake odds), and the API base URL is `http://localhost:8080`. There is no deployed backend in the repo. [H]
- The "Deployed Contract" address on the homepage (`7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU`) is NOT a program. On Solana mainnet it is an SPL Token mint (owner = Token program, `executable:false`, 9 decimals, mint and freeze authority both null, supply 5,736,237,925,675,185,873 raw units, i.e. about 5.74B tokens). It also holds about 71.7 SOL in lamports, which is unusual for a mint. It had finalized transactions in the hour before the query. Whatever this token is, it is not a prediction-market contract. [H, Solana RPC getAccountInfo, fixture saved]
- Last commit to the only code repo: 2025-09-19 ("design overhaul"). Org has 2 repos, 0 stars. No activity in ~13 months. [H, GitHub API]

## Kind and market model

- kind: onchain-other (planned). Intended model: per-content "viral / not viral" binary with decimal odds (mock data shows `odds: { viral: 1.8, notViral: 2.1 }`, a `viralityScore`, and an "AI" analytics claim). [H for mock data in src/routes/dashboard/+page.svelte; the model is a UI mock, not a deployed mechanism]
- Order book vs AMM vs parimutuel: NOT FOUND (searched: homepage, org README, Frontend repo tree and dashboard source). The README says "Rust - Smart contract development" but no Rust program repo exists in the org. [H]
- Outcome tokenisation: NOT FOUND.

## Chains and collateral

- Solana (SOL, USDC, EURC) plus a "Gorbagana" alt-network (GOR, VR8) selectable in the UI. VR8 token "coming soon". [H, homepage and src/lib/config/networks.js]
- The repo's faucet links (Solana faucet, Circle USDC/EURC faucet) indicate devnet/testnet testing, not mainnet. [H, TestViral8.svelte]

## Read API

- exists: none. Base URLs: none public. The only configured API base is `http://localhost:8080`; `https://viral8.vercel.app/api/markets` returns 404. The repo's SvelteKit routes are `/api/login` and `/api/logout` (admin auth) only. [H]
- Docs: the homepage has a "Read Documentation" button, but `/docs` returns 404. NOT FOUND (searched: /docs, repo README is the stock `sv` template).
- Websocket: none. Rate limits: n/a.
- On-chain: no verified program to index.

## Trade path

- none. No program ID, IDL or SDK found. Cannot be reached from any wallet, PayBox or otherwise. [H]
- PayBox reachability: **no** (nothing to propose or sign; Solana would be the only relevant chain).

## Fees

NOT FOUND. Nothing documented.

## Resolution mechanism

NOT FOUND. Marketing copy says "actual performance metrics" and "smart contract automation" with an "AI" analytics layer; there is no oracle, metric threshold or dispute process documented. Resolution would depend on scraping platform view counts, so dispute risk would be high if it launched. [M for risk judgement]

## Geo / ToS / automation

NOT FOUND (no ToS or docs page located). Betting on third-party social content may raise gambling-law issues; not assessed.

## Liquidity

- No markets, volume, OI or TVL found (checked 2026-10-19). The 71.7 SOL in the token-mint account is not shown to be a market deposit. [H for balance; interpretation L]
- Shares liquidity with another venue: no (no liquidity at all).

## Event coverage / arbitrage overlap

Social-media virality only (views/likes thresholds). No overlap with sports, politics, crypto price or macro venues. No cross-venue arbitrage value. Not even a useful signal source since there are no live markets.

## Adapter priority: skip

Dead or never launched, no API, no verified contract, mock data only. Re-check only if the org publishes a program ID/IDL or an API host.

## Open questions

- What is the token at the "contract address", and why does it hold about 71.7 SOL? (Could be a placeholder or an unrelated token; do not treat as Viral8's contract.)
- The X account @Viral8_ is referenced in the org README; not checked (no browser automation, and the web search budget was exhausted so no independent 2026 coverage was searched).

## Suspicious content

None found. The homepage "Deployed Contract ... live on Solana mainnet" claim is misleading given the address is a token mint, not a program.

## Fixtures

- `docs/research/fixtures/viral8/solana-getAccountInfo-site-contract-address.json` (Solana public RPC `getAccountInfo`, jsonParsed, for the homepage contract address).

## Sources

- https://viral8.vercel.app/ (homepage, 200 on 2026-10-19) [H]
- https://viral8.vercel.app/dashboard (JS-rendered shell; content read from repo source) [H]
- https://github.com/ViralEight (org; repos: Frontend, .github) [H]
- https://github.com/ViralEight/Frontend (src/lib/config/api.js, networks.js, src/routes/dashboard/+page.svelte, TestViral8.svelte, routes tree; commits 2025-09-15 and 2025-09-19) [H]
- https://github.com/ViralEight/.github (profile/README.md, last push 2025-09-12) [H]
- https://api.mainnet-beta.solana.com (getAccountInfo, getSignaturesForAddress on the homepage address) [H]
- WebSearch for independent coverage: not performed (session search budget exhausted). [gap]
