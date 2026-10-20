# Robincast - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` raw file reads of the public repo, unauthenticated GETs of robincast.vercel.app / robincast.fun (HTML shell and three path probes), one extended WebSearch. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. No third-party code cloned or run. Repo/page content treated as untrusted data; no embedded instructions found.

Tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak or stale.

## 0. Bottom line

1. **It is a front-end simulation / "practice book", not a live market. (H)** The repo's own README says: "Trading is a practice book - every account starts at $1,000, positions live in `localStorage`, and connecting a wallet identifies an account rather than moving funds. No contracts are deployed." Source: https://github.com/shelbybrothers/robincast (README.md, final "Notes" section).
2. Prices, volume, price history and the "live tape" are generated from a string seed (`src/engine/markets.js`: "Everything is derived from one string seed"; `src/engine/sim.js`: "Nothing here talks to a chain - prices drift, trades print, markets resolve"; trader handles are a hard-coded list). (H)
3. `VENUE.hookAddress` and `VENUE.routerAddress` are `null` in `src/engine/chain.js`; the comment says "Set these when the pools are deployed". Only a `$ROBINCAST` memecoin address and a Pons launchpad buy link exist. (H)
4. No API of any kind: `GET https://robincast.vercel.app/api/markets` and `/markets.json` both return the SPA HTML shell (HTTP 200, text/html), i.e. no endpoint. (H)
5. **adapter_priority = skip.** Even if it later deploys contracts, current state is a hackathon demo with fake data; feeding its prices to an arbitrage scanner would produce false edges.

## 1. Still live?

- Site up: `https://robincast.vercel.app/` returns HTTP 200, Vercel, last-modified 2026-10-19 03:35 GMT; title "Markets - ROBINCAST"; canonical `https://robincast.fun/` (robincast.fun 308 -> www.robincast.fun, 200). (H)
- Repo: created 2026-08-04, last push 2026-08-06 (commit "README: verify count was stale at 231, it's 285"), 0 stars, not archived. About 2.5 months with no commits. (H)
- Marketing counts drift: repo description says "270 markets", README/page meta says "344 markets" (74 against a tokenised underlying, 32-market stock-pair book). These are entries in a hard-coded authored catalog (`catalog.js`, ~36 KB), not on-chain markets. (H)
- Credit line in `chain.js`: "2026 Pons Family Hackathon Project". (H)
- Web search (extended) found no independent coverage of ROBINCAST or robincast.fun. The only related hit is a different project, Chroma (chroma.markets), described as a prediction market on Robinhood Chain; not researched here (outside the task), flag it as a possible separate lead. (M)

Verdict: the website is live; the venue as a real market is **not** live.

## 2. Market model (as designed, H from README; not deployed)

- Binary and multi-outcome books, "pair" markets (which of two tokenised names returns more), ladders, parlays (max 8 legs, $250k payout cap, margin 2% at 2 legs rising to 6% cap).
- Pricing: LMSR, cost `b * ln(1 - p + p*e^(delta/b))`, depth `b = liquidity / 10`. Parlay pays `1/prod(p)` less house margin.
- Intended settlement: Uniswap V4 pool with an "outcome hook" minting YES/NO shares, routed by the Pons router; resolution "reads the tokenised reference price off the chain". None of this exists on-chain yet (hook/router addresses null).
- Outcome tokenisation: designed as hook-accounted YES/NO shares; currently just numbers in browser localStorage.

## 3. Chains and collateral

- Robinhood Chain, chainId 4663 (0x1237), native ETH, `rpcUrls: https://rpc.robinhood.chain`, explorer `https://explorer.robinhood.chain` (explorer hostname did not resolve from this machine on 2026-10-19). (H for the config in repo; the chain's own status not verified here.)
- Collateral per code comment: "denominated in USDC on the chain"; but actual balance is a practice $1,000. (H)

## 4. Read API

- exists: **none**. No docs site, no REST/WS, no subgraph, no contracts. The app has an optional Supabase backend (`supabase/schema.sql`: `launches`, `deeds`, `trades`, `share_outbox`, `x_accounts`) gated on env vars the deployed site may or may not set; its tables hold user/practice activity, not a market feed. Not probed (would need the project URL/anon key, which is a credential-like value and is not in the repo). (H for repo contents)
- Fixtures: none saved (nothing to sample).

## 5. Trade path

None. "Placing" is gated on a connected wallet on chain 4663, but the action only mutates localStorage (`store.js`: "No server, no custody - a wallet connection here identifies an account, it doesn't move funds"). No signed orders, no transaction proposals. (H)

## 6. PayBox reachability

`no`. There is nothing to send a transaction to (no deployed hook or router) and Robinhood Chain (4663) is not among the usual PayBox networks listed in the task. Not tested; PayBox tools were not called. (M)

## 7. Fees

Designed only: parlay house margin 2-6%; LMSR price impact; V4 pool fees unspecified. NOT FOUND (searched: README, chain.js, docs/) for any trading fee schedule. (H)

## 8. Resolution and dispute risk

Designed: on-chain read of tokenised reference price by the hook; no oracle or dispute process documented. Currently the simulator "resolves" markets randomly in `sim.js`. NOT FOUND: any real resolution source. (H)

## 9. Geo / ToS / automation

NOT FOUND (searched: README, site HTML, repo tree). Footer-style disclaimer in `chain.js`: "Independent. Not affiliated with Uniswap, Robinhood, or any listed issuer." (H)

## 10. Liquidity

Zero real liquidity. Displayed volumes and TVL-like numbers are seeded fakes. No on-chain pools (router/hook null). Pons launchpad token `$ROBINCAST` exists as a memecoin (address in README) but is not a market. (H)

## 11. Category overlap and shared liquidity

Catalog is authored stock/RWA/crypto/culture questions; any overlap with Polymarket/Kalshi is irrelevant since prices are synthetic. Intended design routes through Uniswap V4 / Pons liquidity (would be shared with those pools, not an independent order book). (M)

## 12. Open questions

- Will the project deploy the hook/router (watch `VENUE.hookAddress` in `src/engine/chain.js`)?
- Chroma (chroma.markets) is a separate prediction-market lead on Robinhood Chain, not evaluated.

## Sources

- https://github.com/shelbybrothers/robincast (README.md, src/engine/chain.js, markets.js, sim.js, store.js, commit list; read via `gh api`, 2026-10-19) - H
- https://robincast.vercel.app/ and https://robincast.fun/ (HTML head, headers; /api/markets and /markets.json probes) - H
- WebSearch "ROBINCAST robincast.fun prediction markets Robinhood Chain Pons" (no direct coverage; surfaced chroma.markets) - M
