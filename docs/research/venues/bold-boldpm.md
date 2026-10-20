# Bold (BoldPM) - venue spec

Researched 2026-10-19. Verdict: skip. Not a real venue: a Nov 2025 hobby/prototype dApp (React + Supabase + SOL transfers to backend-held keypairs), devnet-configured, website dead, no commits since 2025-11-19. Not "decentralized" in any meaningful sense.

Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Liveness
- Official site predictwithbold.com (from GitHub profile blog field) returns HTTP 404 "Site Not Found | Framer" on apex and www (2026-10-19). Framer says the site is unpublished or not connected. [H]
- app.predictwithbold.com: TLS certificate expired (curl error 60), no content. [H]
- Repos BoldPM/Bold (created 2025-11-18, last push 2025-11-18, 4 stars, 0 issues) and BoldPM/bold-adapter-kit (created 2025-11-19, last push 2025-11-19). No commit in ~11 months. [H]
- Social links in repo: x.com/predictwithbold, t.me/PredictWithBold, support@predictwithbold.com. Not checked (no browser/login; web-search budget exhausted this session). [H that the links exist, NOT checked whether active]
- CoinGecko search for "bold" returns BOLD tokens (Liquity BOLD stablecoin `liquity-bold-2`, rank 546; `bold-2`, unranked; `sBOLD`). None is confirmed as related to BoldPM. The "category token BOLD" lead is likely a name collision. Details call for `bold-2` hit CoinGecko 429, so it is unresolved. [M]
- Conclusion: not live as a usable product. [M-H]

## Market model [H, from source]
- Binary YES/NO only (`outcome: boolean`, `pool_yes`, `pool_no`, `winning_outcome: boolean|null`). Categories are a free-text string.
- Parimutuel-like pools tracked in a Supabase table (`markets.pool_yes/pool_no/total_volume`). No order book, no AMM, no tokenised outcome shares (README says "buy and sell shares" but no code mints or trades shares).
- Anyone can create a market via a Supabase insert (creator_public_key, end_date, resolution_date, category).

## Chains and collateral [H]
- Solana, native SOL only (bet = `SystemProgram.transfer` of lamports to a per-market "vault" address). No USDC/SPL.
- Frontend wallet provider hardcodes `WalletAdapterNetwork.Devnet` (src/components/WalletProvider.tsx), i.e. likely devnet only. [H]
- "Vault" is a plain `Keypair.generate()` created by the backend engine; its secret key is written to a local `vault_keys.json` file (backend/src/key-manager.ts). No on-chain program. Custody is the operator's. [H]

## Read API
- Official public API: none. No docs site. No REST/WS. [H: not found in repo/README]
- The "adapter kit" (BoldPM/bold-adapter-kit, not on npm: registry returns Not found for @bold/adapter-kit) reads directly from a Supabase project using the anon key via supabase-js: tables `markets`, `bets`. The Supabase URL and anon key are NOT published in either repo (placeholders only), so there is nothing to query. [H]
- NOT FOUND (searched: both repos' full trees, README, source; predictwithbold.com; npm registry): base URL, rate limits, websocket, order book, prices, trades endpoint, resolution endpoint.
- Market shape from kit types (for reference only): id, title, description, image_url, creator_public_key, created_at, end_date, resolution_date, resolved, winning_outcome, total_volume, pool_yes, pool_no, category, vault_address. Bet: id, market_id, user_public_key, outcome, amount, status (pending|confirmed|failed), transaction_signature. [H]
- No fixtures saved: no public unauthenticated endpoint exists to sample.

## Trade path
- Send SOL to a market's vault address, then insert a `bets` row with the tx signature; backend polls every 10s, marks confirmed and bumps pools. The backend never verifies amount, recipient or sender of the tx, only that the signature exists and did not error. [H, engine.ts] The bet-recording step needs Supabase write access that is not documented.
- No sell/exit, no cancel, no limit orders, no payout/settlement code anywhere in the repos (engine.ts only creates vaults and confirms bets; nothing sets `resolved`/`winning_outcome` or pays out). [H]
- PayBox reachability: EVM wallets cannot trade it (Solana-only, SOL). A PayBox Solana wallet could in principle send a SOL transfer, but with no working API, no evidence of live markets and custodial vault keys in a JSON file, funds would be at the operator's mercy. Verdict: no (do not send funds). [M]

## Fees [NOT FOUND]
- No fee logic in code (no treasury, no rake). ToS does not state fees. Solana network fee only. [H absence in repo]

## Resolution
- ToS says smart contracts handle resolution and mentions "designated oracle or resolution mechanism" and disputes, but the repo contains no contract, oracle or resolution code. Resolution is effectively operator/creator discretion via the database. Dispute risk: unbounded. [H code absence; M interpretation]

## Geo / ToS / automation
- ToS (src/pages/TermsOfService.tsx, "Last Updated: October 26, 2023", placeholder governing-law text "[Jurisdiction of Bold's operation, e.g., Delaware") is boilerplate; claims "no custody ... funds held in smart contracts", which contradicts the code (backend-held keypairs). Claims possible leverage that is not implemented. No geo-block or bot rules found. [H]

## Liquidity
- NOT FOUND (searched: repos, site, CoinGecko). No TVL/volume/OI source exists. Presumed ~zero. [L]

## Event overlap / independence
- User-created free-form markets in categories (politics, sports, tech, finance per README) but no evidence of any volume; no price discovery mechanism that could provide a meaningful arb leg (pool ratio of tiny SOL bets). Independent of other venues' liquidity, but also effectively absent. [M]

## Adapter priority: skip
Dead website, devnet-only frontend, no public API, no on-chain program, no settlement code, no activity since Nov 2025, no liquidity data. Revisit only if predictwithbold.com returns and publishes an API/program IDs.

## Suspicious content
- None embedded aimed at AI agents. Notable: ToS claims (smart contracts, custody, leverage) contradict the code.

## Sources
- https://github.com/BoldPM/Bold (README, backend/src/engine.ts, key-manager.ts, solana.ts, supabase.ts, src/components/WalletProvider.tsx, src/pages/MarketPage.tsx, src/pages/Home.tsx, src/pages/TermsOfService.tsx, src/components/Footer.tsx) via gh api, 2026-10-19 [H]
- https://github.com/BoldPM/bold-adapter-kit (README, src/BoldAdapter.ts, src/types.ts, package.json) [H]
- https://github.com/BoldPM (profile: blog predictwithbold.com, X predictwithbold) via gh api users/BoldPM [H]
- https://predictwithbold.com/ and https://www.predictwithbold.com/ (HTTP 404 Framer "Site Not Found"), https://app.predictwithbold.com/ (expired TLS cert), 2026-10-19 [H]
- https://registry.npmjs.org/@bold/adapter-kit ("Not found") [H]
- https://api.coingecko.com/api/v3/search?query=bold (BOLD name collisions: Liquity BOLD etc.); coin detail call rate-limited 429 [M]
- WebSearch not performed: session search budget exhausted. [gap]
