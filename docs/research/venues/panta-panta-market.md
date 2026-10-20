# Panta (panta.market) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak, stale or untrusted third party. "NOT FOUND (searched: ...)" means I looked and found nothing, not that it does not exist.

**Verdict: P2 (signal-only / thin).** Live, Solana-only, binary USDC markets with a documented REST API, but every route needs an API key (account signup, which I did not do), the only documented trade path is a primary-phase bonding-curve buy (no documented sell or order-book API), a third party measured only about $205K of cumulative volume across 87 of 100 catalogue rows (largest single market about $13K), the catalogue has known defects, and resolution looks like one operator key. The API Terms require "Powered by Panta" attribution and restrict resale of raw data. Not an independent-liquidity arbitrage leg today. No fixture of a real API response was obtainable without a key.

## 1. Is it still live? (H)

- `https://panta.market` returns 200 (redirects to `/dashboard/user`; a client-rendered Next.js app, title "panta.market | Prediction Markets", meta description "Decentralized prediction markets on Solana. No bookies. No house. Just fans."). H, curl 2026-10-19.
- `https://docs.panta.market` (Mintlify) is live; Terms of Use effective **2026-09-07**; docs example timestamps are 2026-09-04. H.
- `https://live-api.panta.market/api/v1/markets/` answers `401 {"code":"UNAUTHORIZED","message":"authentication required or invalid"}` on 2026-10-19, so the API host is up. H (fixture `live_api_markets_unauth_probe_2026-10-19.txt`).
- Operator: **Balr Holdings Corporation** ("operator of Panta Market"), governing law British Virgin Islands. H (Terms of Use). The Panta front-end bundle is a Balr Market build: it references `production-api.balr.fun/api/v1`, `indexer.balr.fun`, `BalrMarketAPI`, and `balr_*` storage keys next to `panta_pending_invite_code`. H that the strings are in the public JS; M that Panta is a Balr deployment/rebrand. Those hosts are undocumented and I did not call them.
- Live evidence of activity (L, third party): the untrusted `bisale24-ops/settlement-check` repo reports 198 transactions and 32 settlements on the market program over two weeks to 2026-10-02 (hourly GitHub Action output `docs/live.json`). Slow but not dead.
- Not in DefiLlama protocol list (searched `api.llama.fi/protocols` for "panta"/"balr": no match; H absence).
- WebSearch was unavailable (session budget exhausted), so no press/news, X account, or independent volume source was checked. NOT FOUND (searched: panta.market, docs.panta.market, DefiLlama, GitHub; web search blocked).

## 2. Kind and market model

- **Kind:** on-chain (Solana) prediction market protocol with a partner/builder REST API. Documented as "Public API for Panta USDC prediction markets on Solana. Quote, build unsigned transactions, and attribute trades without holding user keys." H (`docs.panta.market/llms.txt`).
- **Market type:** binary YES/NO only (`side` = `yes`|`no`). Category list: sports, crypto, politics, entertainment, finance, science, world, other. `marketType` is `standard` or `breaking` (breaking markets may start while the event is in progress). H (docs: Create quote, Categories).
- **Pricing/phases:** `phase` = `primary` | `secondary` | `resolved` | `cancelled`. Primary-phase buys are "priced on the bonding curve"; "graduate" unlocks creator-fee claims. Market detail exposes `yesPrice`/`noPrice`, `primaryYesPrice`/`primaryNoPrice`, `secondaryYesPrice`/`secondaryNoPrice`. H (docs). What "secondary" is mechanically is **NOT FOUND in the docs** (searched: all pages in `llms.txt`). The front-end bundle contains secondary limit-order code (`secondary_limit_order ONCHAIN PAYLOAD`, `/api/v1/markets/{id}/orderbook`, `cancel-orders`), so M that secondary is an order book on the Balr backend, with no documented partner endpoint for it.
- **Tokenisation:** positions are on-chain share balances per wallet/market (the positions API returns `shares` per `side`; claim derives `positionPda`, `winClaim`, `vaultAuthority`). Whether shares are SPL tokens: NOT FOUND (searched: docs). Win payout is about 1 USDC per winning share. H (docs Positions, Claims).
- **Market creation is permissionless for any API account** (`canCreateMarkets` defaults true), with a USDC creation fee (docs example 50 USDC of which 10 liquidity injection and 40 platform revenue; the fee "comes from on-chain config", so the example is not a rate card). Creators need a 1h start delay except breaking markets. Duplicate question+creator is rejected. H (docs). Consequence: the catalogue contains many user-created, low-quality, sometimes test markets (see section 9).

## 3. Chains and collateral

- **Solana mainnet only; collateral USDC (6 decimals).** Create fees in base units (`"50000000"` = 50 USDC); order amounts as decimal strings (`"20.00"`). H (docs).
- Program ID, mint address and contract repo: NOT FOUND in official docs (searched: docs pages, front-end bundle chunks, GitHub). Third party names a settlement signer `664h8s...` (L, see section 7); do not rely on it.

## 4. Read API

- **Official, authenticated.** Docs `https://docs.panta.market` (H). Base URL `https://live-api.panta.market/api/v1` (H). **Trailing slashes required.**
- **Auth:** every product route needs `X-Api-Key: pk_test_...|pk_live_...` or `Authorization: Bearer <access JWT>`. Keys come from `POST /auth/register/` (email+password+name) then `POST /account/keys/`. Keys in query strings are rejected with 401. Both `pk_test_` and `pk_live_` work on the same production host. No unauthenticated route found. H. I did not register (read-only rule), so **no real 200 response was observed**; shapes below are from docs examples (M until verified).
- **Rate limits (H, Errors page), per account, optionally per IP:** read 120 / 60s; positions 60 / 60s; quote 30 / 60s; build 20 / 60s; register/submit/trade-report/auth 40 / 60s; upload 10 / 60s. Headers `X-RateLimit-Limit/Remaining/Reset`, `Retry-After` on 429. "Deployments may override."
- **Websocket / streaming:** NOT FOUND (searched: all docs pages in `llms.txt`). Poll only. (The Balr indexer host in the front-end bundle may stream, undocumented.)
- **Key endpoints (H, docs):**
  - `GET /markets/?category=&status=primary|secondary|resolved|cancelled&createdBy=me&cursor=&limit=` (max 50, default 20; cursor pagination via `nextCursor`). Row: `marketId` (event PDA, base58), `category`, `title`, `description`, `images[]`, `phase`, `marketType`, `startTime`/`endTime`/`resolutionTime` (unix s), `region`, `resolved`, `status`, `volumeUsdc` (decimal string), `campaignId`, `createdByPartner`, and `yesPrice`/`noPrice`/`primary*`/`secondary*` which are **null on list rows** ("List rows do not live-RPC for prices").
  - `GET /markets/{marketId}/` -> same shape with prices filled "from on-chain state when RPC is available" (one call per market, so a full scan is N+1 requests at 120/min).
  - `GET /markets/{marketId}/trades/?limit=` (max 200): `id, marketId, wallet, isPrimary, yesAmount, noAmount, feePaid, blockTime, signature, quoteAsset`. A trade tape (public, not attribution).
  - `GET /wallets/{wallet}/trades/`, `GET /categories/`, `GET /positions/?wallet=` (cap about 200 rows; `shares, side, phase, claimable, claimed, outcome`).
  - Account endpoints: `/account/`, `/whoami/`, `/account/metrics/`, `/account/trades/`, `/account/keys/`.
- **No order-book / depth endpoint is documented.** Price = bonding-curve spot (`yesPrice`/`noPrice`) plus an executable quote via `POST /primaryorderquote/` (returns `shares`, `avgPrice`, `feeUsdc`; needs `wallet`, 30/min).
- **Resolution data:** `resolved` flag, `phase`, and per-position `outcome` (yes/no). Third party says complete cards also carry `question`, `resolutionRule`, `sources`, `totalTrades`, `totalVolume`, `isResolved`, `oracleResultSubmitted`, `onChain` and that some cards come back "stripped" without them (L, see section 9). The docs list rows do **not** document `question`/`resolutionRule` in the list schema (title/description only).
- **Fixtures:** only `live_api_markets_unauth_probe_2026-10-19.txt` (the real 401), `docs_example_get_market.txt` (docs example, NOT a live response), `docs_llms_2026-10-19.txt` (docs index), and `thirdparty_settlement-check_catalogue_2026-09-27_UNTRUSTED.json` (third-party snapshot of 42 catalogue rows, 2026-09-27, 24 KB, labelled untrusted; it is the closest thing to a real response shape, with `marketId, question, resolutionRule, sources, phase, endTime, url`).
- Public site URL pattern for deep links: `https://panta.market/market/<marketId>` (L, third party; consistent with the front-end route).

## 5. Trade path

- **Documented: primary buy only, non-custodial, quote -> build -> sign -> broadcast -> submit** (H, docs How it works / Primary buy):
  1. `POST /primaryorderquote/` `{wallet, marketId, side, amountUsdc, userId?}` -> `quoteId` (about 90s TTL), `shares`, `avgPrice`, `feeUsdc`, `expiresAt`.
  2. `POST /primaryorderbuild/` (with `maxSlippageBps`; `QUOTE_STALE` if the curve moved) -> `orderId` (about 120s) and **Solana instructions + `recentBlockhash`** (not a full tx); the client compiles a `VersionedTransaction`, signs with the wallet and broadcasts on its own RPC (Panta never broadcasts).
  3. `POST /primaryordersubmit/` `{orderId, signature}` (idempotent) and/or `POST /primaryorderverify/`.
  4. After resolution: `POST /claim/build/` -> `claim_win_usdc` instructions; optional `POST /trades/` report for attribution.
- **No documented sell / exit / limit-order / cancel endpoint and no documented secondary-market order placement.** Exit before resolution is therefore not available through the public API as documented (NOT FOUND, searched: all `llms.txt` pages). `MARKET_NOT_IN_PRIMARY` is returned for buys outside the primary phase. So an arbitrage leg that must be unwound early cannot be built on this API; hold-to-resolution only.
- **Signing:** ordinary Solana transaction signature by the user's wallet; API auth is separate (API key). No EIP-712 or L2-style order signing.
- **Mutating calls I did not make:** register, key creation, quote, build (all POST; forbidden here).

## 6. PayBox reachability

**paybox_reachable: partial.**
- An **EVM wallet cannot trade it**: Solana-only.
- A **PayBox Solana-family credential could** in principle sign the built transaction: per the repo's PayBox notes, `io.paybox/transactionProposal` supports `chain: "solana:mainnet"`, `transaction:{transactionBase64}` with limits "<= 1,232 bytes, legacy/v0, one signer who is fee payer, no durable nonce, no sponsor" (docs/research/06-paybox-platform.md, H there), and the `request_wallet_sign` intent includes `solanaTransaction`. Panta's build returns instructions the plugin/agent must compile (fee payer = the user's wallet, matching "one signer"), so it likely fits if the instruction set is small (M, untested; transaction size and any ATA-creation/compute-budget instructions are unknown).
- The plugin would need an API key supplied by the user (a secret; PayBox has `request_secret`, not used here) and calls `live-api.panta.market` from plugin code (network allowlist requirement unknown).
- Practical value is low given section 5 (buy-only, thin liquidity).

## 7. Resolution mechanism and dispute risk

- **Official docs: NOT FOUND (searched: all `llms.txt` pages).** The docs only say creators supply `resolutionRule` (max 2048 chars) and `sourcesOfTruth` (list), `oracle` defaults to the sources joined by `,`, and "Oracle feed identifiers: derived server-side from resolution metadata". No resolution process, dispute window, bond, or oracle provider is documented. H (absence).
- **Untrusted third-party analysis (L, `bisale24-ops/settlement-check`, measured 2026-09-26 to 10-02):** the `oracle` field names the creator wallet rather than the resolver; settlement runs `GraduateMarket -> SubmitOracleResult -> ResolveEvent -> ClaimWin`, and on 9 settled markets inspected both settlement instructions were signed by the **same single keypair**; 85 of 100 cards carry `claims_uma`/`sentToUma` but "no UMA program appears in that transaction"; Panta's site describes "agent resolution" with a confidence score, written rationale and a dispute window. I could not verify any of this on chain (no RPC POST) or on the Panta site (client-rendered). The hint in the task (UMA-linked resolution) is therefore M/L: UMA is claimed in card metadata, not demonstrated on-chain.
- **Risk assessment (M):** centralised resolver (single key), user-created markets with free-text rules, many with vague `sources` (the third party classified 34 of 100 as "named nothing" and 36 "editorial"). Wording differs from big venues; treat any cross-venue link as unresolved-risk until rules are compared. Cancelled markets exist (7 of 100 in the sample).

## 8. Fees (H unless noted)

- **Primary trading fee:** docs example quote: 20.00 USDC buy -> `feeUsdc` 0.40 (2%); "estimate primary fees as `volume x primaryFeeBps / 10_000` using on-chain `MarketConfig` (often 200 bps = 2%)". Charged to the buyer (quote returns it). Exact current bps: read from chain `MarketConfig`, not from the API (NOT FOUND in API).
- **Secondary fee:** NOT FOUND.
- **Creation fee:** quoted per market by `POST /markets/create/quote/` (docs example 50 USDC = 10 liquidity + 40 platform). Creators get fee withdrawals after "graduation".
- **API access fee:** none stated; Terms s12 allow "free and paid API access, usage-based pricing, enterprise plans, revenue-share ... or other commercial terms" and prospective changes.
- **Network cost:** user pays Solana fees (broadcast on own RPC).

## 9. Geo, ToS and automation

- **API Terms of Use (H, effective 2026-09-07, `docs.panta.market/guides/terms-of-use`):**
  - API credentials required; "Panta may require registration, identity or business verification, use-case information" (s1). Keys may not be shared or embedded in public code (s3).
  - Automation is allowed within "documentation, rate limits ... endpoint rules"; may not "bypass ... rate limits" (s4). "Panta may version, modify, deprecate or discontinue endpoints" with no availability guarantee (s4, s14).
  - **Mandatory "Powered by Panta" attribution** for any product displaying Panta markets/data/trading (s6); removal only under a white-label agreement. An internal scanner that does not display Panta data publicly is a grey area; a product UI showing Panta prices must carry the badge.
  - Prohibited: wash trading, artificial volume, spoofing; scraping "where an API ... is required"; **"resell raw API access, credentials or substantially unmodified Panta data"** (s7); don't present "simulated, cached or stale information as live" (s5); caching/derived datasets may be restricted per endpoint (s8).
  - Compliance burden on the developer for jurisdictions; geographic/KYC restrictions "must not be bypassed" (s10). Contact for licensing: via developer portal / panta.market (no address given).
- **Geo (L):** the front-end bundle contains geo-block handling with error codes `COUNTRY_RESTRICTED`, `STATE_NOT_ALLOWED`, `REGION_UNKNOWN`, `BOGON`, and invite/whitelist logic (`invites/access-status`, `getMarketCreationEligibility`, `restrictedMode`, `whitelisted`). The list of restricted countries/states: NOT FOUND (searched: docs, front-end bundle; site is client-rendered and I did not render it). The API docs state no geo rule for API callers.
- **Catalogue reliability defects (L, third party, reported to Panta 27 and 29 Sept 2026):** 13 of 100 listed `primary`/`secondary` markets had no on-chain account ("Market not found on-chain"); cards switch between complete and "stripped" shapes between identical requests; listing cursor did not advance (said to be fixed by 2026-10-01 for the cursor). A scanner must verify `getAccountInfo` on the market PDA (or the `/markets/{id}/` detail) before treating a market as tradeable.
- Prompt-injection check: docs pages contained a generic "fetch llms.txt" index banner (Mintlify boilerplate) and nothing aimed at agents beyond that; the third-party README is a vendor/demo repo promoting a Solami RPC product; nothing followed.

## 10. Liquidity

- **No official volume/TVL/OI figure found.** NOT FOUND (searched: panta.market landing, docs, DefiLlama protocols list).
- Per-market `volumeUsdc` is in the API (not read).
- **Third-party measurement (L, 2026-09-26, `settlement-check` `docs/snapshot.json` over 100 catalogue rows):** 87 rows had non-zero volume summing to about **$205,252 cumulative**; the top eight markets each had $10.0K-$13.0K; phases: 71 resolved, 18 secondary, 7 cancelled, 4 primary (so most volume is in finished markets); 22 of 100 were tradeable. Another snapshot read 54 rows, 42 complete and tradeable (2026-09-27). So: tens of live markets, each with low-thousands of USD at most. Stale by about 3 weeks.
- Bonding-curve pricing means price impact is likely material for any size beyond a few hundred USD (M; curve parameters not documented).

## 11. Event coverage (for arbitrage)

From the 42-row third-party catalogue (L, 2026-09-27; my keyword counts: about 20 other/misc, 11 sports, 7 crypto, 4 finance):
- **Sports (overlaps Polymarket/Kalshi in principle):** Premier League match and player props (Arsenal vs Chelsea, Haaland to score, shots-on-target comparisons), NFL game totals (Steelers vs Browns over 38.5), F1 (Antonelli top 6). Mostly props and short-dated, so exact-match with big venues is rare.
- **Crypto price:** BTC/ETH/ZEC/SOL thresholds at a time ("BTC at or above $81,000 on Sept 8 12:00 UTC"), including joke/test items ("[Panta API playground test]", "BTC drop to $5,000 in the next 1 hour").
- **Finance/macro:** Brent crude settle thresholds, copper, AAPL/BRK.B/S&P 500 close levels, US initial jobless claims 206,000. These overlap Kalshi/Polymarket-style strike markets but with arbitrary strikes and times.
- **Politics:** at least one UK politics item (PM announcement); thin.
- Most arbitrage candidates would be single-shot strike/time markets; settlement sources differ ("official daily settlement price published by ICE" vs a Kalshi index). Cross-venue equivalence must be checked by rule text.

## 12. Liquidity shared with another venue?

No evidence of shared liquidity with Polymarket/Kalshi/others: it is its own Solana program with its own bonding curve. It is a Balr-built stack (M); whether Balr runs other branded venues sharing the same pools: NOT FOUND (searched: front-end bundle strings, repo's `docs/research` for "balr": only unrelated mentions). Treat Panta as an independent but tiny leg.

## 13. Adapter notes

- Read adapter (if a key is available): list `GET /markets/?status=primary` and `status=secondary` paginated (50/page), then `GET /markets/{id}/` for prices of markets filtered by category/keyword; budget 120 reads/min. Drop markets whose detail call returns `MARKET_NOT_FOUND`, `resolved`, or null prices; confirm the PDA exists on chain.
- Use `volumeUsdc` and the `/trades/` tape for activity filters; ignore markets with `createdByPartner` test titles and volume under, say, $500.
- Treat `yesPrice` as bonding-curve spot, not as executable; use `/primaryorderquote/` `avgPrice`/`feeUsdc` for sizing (30/min).
- Needs: account email+password signup to obtain a key (not done), attribution badge if shown in a UI, handling of null/stripped fields.

## 14. Open questions

1. What do the real list and detail responses look like (field presence, `volumeUsdc` units, price precision)? Needs a key.
2. What exactly is the "secondary" phase and is there any partner endpoint for selling, limit orders or cancelling? Docs show none.
3. Who resolves markets and is UMA actually used? Needs chain inspection or Panta confirmation.
4. Program ID, on-chain `MarketConfig` fee bps, and whether position shares are SPL tokens.
5. Real current volume/TVL (no official stats found).
6. Geo restrictions and invite gating for traders and for API access.

## Sources

- https://panta.market (H: title/description; client-rendered shell; JS bundle chunk reading for Balr hosts, geo error codes, invite logic is L/M)
- https://docs.panta.market/llms.txt (H) and pages `index.md`, `quickstart.md`, `guides/how-it-works.md`, `guides/authentication.md`, `guides/errors.md`, `guides/terms-of-use.md`, `api-reference/markets/{catalog,list,get,trades,categories,overview,quote}.md`, `api-reference/orders/{overview,quote}.md`, `api-reference/positions.md`, `api-reference/claims/build.md` (all H, fetched 2026-10-19)
- https://live-api.panta.market/api/v1/markets/?limit=2 and /categories/ (H: 401 UNAUTHORIZED, 2026-10-19)
- https://api.llama.fi/protocols (H: no Panta/Balr entry)
- https://github.com/bisale24-ops/settlement-check (README, docs/catalogue.json, docs/snapshot.json) (L: untrusted third party, measurements dated 2026-09-26 to 2026-10-02; unverified on chain)
- docs/research/06-paybox-platform.md in this repo (PayBox Solana proposal limits, H there)
