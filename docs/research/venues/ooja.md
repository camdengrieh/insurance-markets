# Ooja (Stacks) - venue spec

Researched 2026-10-19. Verdict: **skip**. No live venue found; only a pre-launch hobby repo and an empty npm SDK.

## Summary

- Ooja is a Next.js + MongoDB prototype of a "prediction market / price bet" app for Stacks (Bitcoin L2) by a single GitHub user. [H] repo contents.
- Markets and orders are stored off-chain in MongoDB; admins resolve markets by hand with a shared admin token. No smart contract dependency. [H] BACKEND.md.
- The only contract (`stx-price-bet.clar`) is a peer-to-peer STX price bet (creator locks stake, one opponent matches, caller supplies settlement price). Its own README says "do not deploy to mainnet" until tests/review done; mainnet principal is "TBD"; `CONTRACT_ADDRESS` defaults to the all-zero placeholder `SP000...000`. [H] contract/README.md, constants/index.ts.
- No production site found. No public docs. No volume/TVL data exists.

## Liveness (2026)

- npm `ooja-sdk` 0.1.0, published 2026-06-22, only version, no README, description "Utility helpers for the Ooja prediction market platform on Stacks" (address/format/price helpers). [H] https://registry.npmjs.org/ooja-sdk
- GitHub `aabxtract/ooja` (created 2026-03-14, last push 2026-06-29, 1 star, no description/homepage). Last commits are frontend pages (markets grid, live activity) and a backend merge. [H] https://github.com/aabxtract/ooja
- Candidate domains: `ooja.xyz` redirects to a GoDaddy for-sale lander (access denied on the lander); `ooja.io` is an unrelated GoDaddy Website Builder site (author "Ooja", en-AU), no sign of a prediction market; `ooja.app`, `ooja.fun`, `ooja.market` do not resolve; `ooja.vercel.app`, `ooja-xi.vercel.app`, `ooja.netlify.app` return 404. [H] curl 2026-10-19. A deployment could exist under a URL I could not guess. [L]
- Other GitHub repos named "ooja" are unrelated or empty (`ooja-lab/ooja` empty 2024; several spam "content" repos). [M]
- Web search was unavailable this session (shared search budget exhausted), so no independent coverage/news/social check was done. NOT FOUND (searched: npm registry, GitHub repo search/code search, direct domain probes). Confidence that no live venue exists: medium.

## Market model

- Off-chain (MongoDB) markets with `outcomeId` such as `above`/`below`, category and status filters; admin-created. Order placement is an authenticated off-chain record, not an on-chain trade. [H] BACKEND.md, app/api/markets/route.ts.
- On-chain prototype: 1v1 binary escrow bet (direction up=u1/down=u0, target price in integer cents, expiry as Stacks block height, STX stake in micro-STX). No order book, AMM, or outcome tokens. [H] contract/README.md.

## Chains and collateral

Stacks, STX only. [H] Not reachable from PayBox EVM/Solana wallets (no Stacks support documented in PayBox for this task). paybox_reachable: no. [M]

## Read API

- Next.js route handlers (self-hosted per deployment, no known public base URL): `GET /api/markets` (status, category, limit), `GET /api/markets/:id`, `GET /api/activity`, `GET /api/portfolio/:wallet` (owner/admin only). No prices/book, trades, websocket, rate limits, or docs site. [H] BACKEND.md
- On-chain read-only fns: `get-bet`, `get-active-bets`, `get-user-bets` - but no deployed contract exists. [H]
- No unauthenticated GETs possible (no live host), so no fixtures saved.

## Trade path

Wallet-auth via `stx_signMessage` nonce -> Bearer session token for `POST /api/orders` (off-chain), or Stacks `openContractCall` for the escrow contract (undeployed). Not usable programmatically from PayBox. [H]

## Fees

NOT FOUND (searched: BACKEND.md, contract README). Contract README documents none; winner takes the full pot.

## Resolution

Off-chain: admin manually resolves (`POST /api/admin/markets/:id/resolve`, `x-admin-token`). On-chain: whoever calls `settle-bet` supplies `current-price`; README lists "confirm who is allowed to provide the settlement price" as open. Trust/dispute risk is total (centralised/unverified oracle). [H]

## Geo / ToS / automation

NOT FOUND (no site, no terms).

## Liquidity and overlap

No volume, OI or TVL found. Categories: STX price bets only, which is crypto price (overlaps nominally with Polymarket/Kalshi crypto-price markets on majors, but STX markets there are rare). Does not share liquidity with any other venue. Not an arbitrage leg.

## Adapter priority

**skip**: no live venue, no public API, no deployed contract, no liquidity, manual admin resolution.

## Suspicious content

None found in the repo or pages read. (npm metadata lists the publisher's email; not recorded here.)

## Sources

- [H] https://registry.npmjs.org/ooja-sdk (fetched 2026-10-19)
- [H] https://github.com/aabxtract/ooja (README.md, BACKEND.md, contract/README.md, constants/index.ts, lib/contract.ts, app/api/markets/route.ts, commit log) via `gh api`
- [H] curl probes of ooja.xyz, ooja.io, ooja.app, ooja.fun, ooja.market, ooja.vercel.app, ooja-xi.vercel.app, ooja.netlify.app (2026-10-19)
