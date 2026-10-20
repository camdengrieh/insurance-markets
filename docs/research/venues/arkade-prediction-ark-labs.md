# Arkade Prediction (Ark Labs) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip**. A very new (repo created 2026-10-08) BTC-collateralised binary market protocol on Arkade. The only live deployment is on **Mutinynet, a Bitcoin test network, with valueless test sats**. It is a mirror of Polymarket markets (Polymarket is the price/liquidity source and the oracle source), so it can never be an independent arbitrage leg. Total activity on the public deployment: 1 trade, 935 sats volume. No mainnet deployment exists as of today. It is worth re-checking only if a mainnet launch is announced, and even then it would be signal-duplicating.

## Is it live?

- Repo `ArkLabsHQ/arkade-prediction`: created 2026-10-08, last push 2026-10-12, 1 star, no license file, no releases, no homepage; description "BTC-collateralized prediction markets on Arkade". H - `gh api repos/ArkLabsHQ/arkade-prediction`
- README: "regtest proof of concept complete and tested; on Mutinynet ... all with funded test wallets; no hosted deployment yet. Test funds only." H - https://github.com/ArkLabsHQ/arkade-prediction/blob/main/README.md
- **But a hosted Mutinynet instance does answer** (README/STATUS say no hosted deployment, so they are slightly stale; docs/evidence/mutinynet-funded.txt names it): https://prediction.mutinynet.arkade.sh . `/api/health/ready` returned ok for db, arkd, emulator, writer, oracle (1 of 1 attestors) on 2026-10-19. H - https://prediction.mutinynet.arkade.sh/api/health/ready (fixture)
- `/api/config` says `"network":"mutinynet"`, `"testNetwork":true`, `"devFaucet":false`, `"admin":false`. H - fixture config.json
- Mutinynet is a signet-style Bitcoin test network; sats have no market value. M (general knowledge; the repo itself calls them "test funds").
- Staleness sign: newest market was imported 2026-10-14T18:00Z; 5 days of nothing new. 14 markets whose `closeAt` is in the past (e.g. the 4h BTC Up/Down closing 2026-10-15) still report `status: open`, and their vault `expiresAt` (2026-10-14) has passed. So the keeper/importer appears to have stopped or lagged after about 2026-10-14. H (API data) / M (the interpretation).
- The ArkLabsHQ/Arkade product site (https://arkadeos.com) does not mention prediction markets or a mainnet date. H (WebFetch, page text only). WebSearch was unavailable (session budget exhausted), so there was no independent news check. NOT FOUND (searched: arkadeos.com, GitHub repo; WebSearch unavailable).

## Kind and market model

- kind: onchain-other (Bitcoin L2 "Arkade" with covenant extensions, an Ark-protocol VTXO system). H
- **Binary only** (YES/NO). Categorical markets are "NOT RUN (not implemented)" (README row 21). H
- **Complete-set collateral model, hybrid order book.** Anyone can `mint(n)` YES+NO against `n x unit` sats in a per-market vault, `merge` back, or `redeem` after resolution. Unit is 1000 sats per set (config `unitSats`). Prices are in sats per claim in 1..999 (e.g. `priceSats: "500"`). H - docs/protocol.md, /api/config
- Trading is via **funded covenant "offer" UTXOs** (SellOffer / BuyOffer) that fill while the maker is offline; partial fills, min-fill, expiry, cancel. There is also an LP bootstrap (operator wallet posts asks, `LP_BOOTSTRAP_SETS=5`) and a keeper that matches crossing bids. Not an AMM, not parimutuel. H - docs/protocol.md; docs/evidence/mutinynet-funded.txt
- Outcomes are native **Arkade assets** (asset ids `ctrl`, `yes`, `no` per market in `terms.assets`). H - fixture markets-sample.json
- Market sources: Polymarket CTF v1 binary markets imported by the operator (all 258 listed markets have `kind: polymarket`); also user-created custom markets via API (not seen on the public instance). Neg-risk markets are ineligible (444 of 500 scanned were rejected for "neg-risk", 50 for "horizon" in the logged import). H

## Chains and collateral

- Arkade on Bitcoin (Mutinynet only today). Collateral and payout: BTC (sats). H
- EVM chains are touched only read-side: the attestor reads Polygon (Polymarket CTF `payoutDenominator`) through >= 2 RPC providers. M/H - docs/threat-model.md
- Arkade covenant opcodes are enforced by an "emulator" plus the arkd operator co-signature, **not Bitcoin consensus**. Anyone controlling both arkd signer and emulator can steal. Unilateral exit covers plain BTC only, not claims or vault collateral. H - docs/threat-model.md section 3

## Read API

- exists: **official-public** (the open-source app server exposes an unauthenticated JSON API). H
- Base URL: `https://prediction.mutinynet.arkade.sh` (Mutinynet only). H
- Docs: https://github.com/ArkLabsHQ/arkade-prediction/blob/main/docs/api.md ; types in `src/shared/api.ts`. H
- Key endpoints (all read ones confirmed unauthenticated GET, 200 OK):
  - `GET /api/markets?status=&kind=&q=&limit=&cursor=` returns `{markets: MarketJson[], next}`. Cursor is an ISO createdAt timestamp, newest first. 258 markets total. H
  - `GET /api/markets/:id` : `MarketJson` with question, rules, outcomes, category, closeAt, `source` (Polymarket sourceId, slug, referencePrices), `oracle`, `terms`, `vault`, `resolution`, `book {yes{bid,ask},no{bid,ask}}`, `stats {openInterestSets, collateralSats, volumeSats, trades}`. H
  - `GET /api/markets/:id/offers?status=open` : order-book entries (side, price in sats, remaining qty, maker script, expiry). H
  - `GET /api/markets/:id/trades?limit=` : fills (empty on the sample market). H
  - `GET /api/events` : Server-Sent Events stream with `Last-Event-ID` replay (not a websocket). H
  - `GET /api/config`, `GET /api/health/ready`, `GET /api/portfolio?script=`. H
- Auth/limits: none for public GETs; rate limits NOT FOUND (searched: docs/api.md, response headers; Cloudflare in front). Request bodies capped at 64 KiB. H
- Note: `source.referencePrices` is a snapshot of the **Polymarket** price taken at import (`asOf`), not an Arkade price. Do not treat it as a quote. H
- Fixtures: `docs/research/fixtures/arkade-prediction-ark-labs/` (config.json, health-ready.json, markets-sample.json, offers-sample.json).

## Trade path

- Clients (browser or CLI via `src/core/actions.ts`) **build and sign their own Arkade transactions** against arkd (`https://mutinynet.arkade.sh`) and the emulator (`https://emulator.mutinynet.arkade.sh`) with an Arkade/Bitcoin key (Taproot/Schnorr), then POST the new offer to the app server for listing. The server holds no user keys. H - docs/api.md
- Programmatic trading therefore needs the `@arkade-os/sdk` (TypeScript) and a Bitcoin/Arkade key, not an HTTP order endpoint. There is no REST "place order". H/M
- **PayBox reachability: no.** PayBox wallets are EVM/Solana style; this venue needs Arkade (Bitcoin Taproot) signing and sats funding on a test network. No tx-proposal or signed-order route from an EVM wallet. M (chain mismatch; PayBox tools were not called).

## Fees

- Covenants charge no fees. Takers pay the offer price; keeper match surplus `qty*(p_yes+p_no-unit)` goes to the keeper. Mutinynet intent (renewal) fees are 0; non-zero-fee renewal is not implemented/tested. Carrier sats (>= 330 per asset VTXO) are a separate dust-like cost. H - docs/protocol.md section 4, PLAN D4/DECISIONS item 4

## Resolution and dispute risk

- Imported markets: an attestor signs the outcome after reading the finalized Polymarket CTF payout on Polygon (UMA-settled) from >= 2 RPC providers; the signature is checked inside the vault covenant. 1-of-1 attestor by default (2-of-3 supported). Timeout (precommitted) settles INVALID 50/50. A BTC Up/Down market uses RedStone signed prices (3 of 5 signers) checked by the vault, which can differ from Polymarket's Chainlink-based resolution (the market's own rules text says so). H
- Risks: attestor key compromise, operator+emulator collusion, withheld certificates (50/50 at timeout), UMA/Polymarket dispute outcomes passed through, keeper must renew VTXOs before batch expiry (the stale markets above show this failing). Independent reviews listed in docs/reviews.md. H

## Geo / ToS / automation

- No ToS, geo-block or API usage rules found in the repo or on the instance. NOT FOUND (searched: README, docs/api.md, DECISIONS.md, site root text). The app is explicitly test-funds-only. Admin port is unauthenticated by design and "must be reachable only through an access-controlled edge" (not exposed on the public host: `admin:false`). H

## Liquidity (as of 2026-10-19, from the public API)

- 258 markets ever listed (158 resolved, 93 open, 6 halted, 1 closed). H
- Collateral in the 100 non-resolved markets: 560,000 sats (about 0.0056 test BTC, no real value). All-market collateral 718,000 sats. H
- Total volume across all markets: **935 sats, 1 trade** (a single market had a trade). Only 1 of 93 open markets showed any bid/ask. Open interest is mostly the operator's seed sets. H
- Liquidity is test-network play liquidity; effectively zero real liquidity.

## Event categories (overlap with other venues)

- Mirrors Polymarket: 128 of 258 are crypto Up/Down (BTC/ETH/SOL/XRP 4-hour), the rest sports, entertainment, geopolitics (e.g. "US x Iran ceasefire", "Russia target Kyiv"), awards, AI etc. H
- All of these overlap Polymarket exactly and are **copies of Polymarket markets** - useful only as a duplicate mirror, not as an arbitrage counterparty.

## Shared liquidity

- **Shares nothing in a trading sense but is derivative of Polymarket**: its market list, its reference prices and its resolution all come from Polymarket. It is NOT an independent arbitrage leg or independent price signal. liquidity_shared_with: Polymarket (market import + oracle source only; no order flow is routed to Polymarket). H

## Adapter notes (if ever revisited)

- Only revisit on a mainnet announcement. Then a read-only adapter could poll `/api/markets?status=open` and `/api/markets/:id/offers`, map `source.sourceId` to the Polymarket market (the market-linking layer gets a free exact link), and treat Arkade offers as thin quotes. Bid/ask: price in sats of 1000 sat unit => probability = priceSats/1000.
- Today: do not build.

## Sources

- https://github.com/ArkLabsHQ/arkade-prediction (repo metadata, README, STATUS.md, docs/api.md, docs/protocol.md, docs/threat-model.md, docs/compatibility.md, docs/evidence/mutinynet-funded.txt) - H
- https://prediction.mutinynet.arkade.sh/api/config, /api/health/ready, /api/markets, /api/markets/:id/offers, /api/markets/:id/trades, /api/events - H (fetched 2026-10-19)
- https://arkadeos.com - H (no mention of prediction markets or mainnet)

## Not found / open questions

- Mainnet deployment, token, funding, team announcements: NOT FOUND (WebSearch unavailable this session).
- Rate limits, ToS, geo rules: NOT FOUND.
- Whether the Mutinynet instance is being maintained after 2026-10-14: unclear.
- Suspicious content (embedded instructions): none seen.
