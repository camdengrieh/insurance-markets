# Livara (livara.app) - venue spec

Researched 2026-10-19. Read-only: public site HTML and static JS bundle, unauthenticated GETs to livara.app/api, DefiLlama public API, Sourcify public API, Polygonscan page fetch, GitHub (DefiLlama-Adapters PRs). No accounts, no wallet connection, no signing, no POST. Only User-Agent used: `insurance-markets-research/0.1`.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- It is live, but only just. It is a small, operator-run parimutuel "pool" app (formerly branded PoolBet) on Polygon with a "custodial mirror" escrow contract. Lifetime volume visible in the public API is about 424 USDT over 11 bets in 18 events, TVL is 200 USDT (one stuck pool), the operator is also the main market creator, results are operator/creator-declared with an admin override, and the only read API is the undocumented backend of its own web app.
- Overlap with other venues exists on paper (football, Brazilian politics, F1), but with a 12-15 percent rake, no exit, no price discovery and about 2 bettors per pool there is no tradable edge, and no side of any pool is usable as an independent arbitrage leg.

## Liveness (still live in 2026?)

- **Site: live, H.** `https://livara.app/` returns 200 (index.html `last-modified` 2026-07-28); `GET https://livara.app/api/healthz` returns `{"status":"ok"}` on 2026-10-19 (https://livara.app/api/healthz).
- **Product is near-dormant, H/M.**
  - Newest event is id 18, created 2026-08-11; newest published pool is id 17 (F1 2026, created 2026-07-23, 0 bets, closes 2026-12-02) (https://livara.app/api/events).
  - Event 18 (Brazilian presidential election) closed to bets 2026-10-04 and is still `status: closed`, `finalizedAt: null` on 2026-10-19, i.e. 15 days without a result (https://livara.app/api/events, fixture `GET_api_events.json`).
  - Polygonscan for the escrow shows 54 transactions in total, latest a "Deposit Bet" on 2026-08-11 15:49 UTC, nothing since (M: WebFetch summary of https://polygonscan.com/address/0x2883C739871CE6900Bf4b60Ecc979354613148e2).
  - `GET /api/events?status=open` returns 0 events; only the F1 pool (status `published`, zero bets) is accepting predictions.
- **Marketing pages are stale, H:** sitemap lists only `/` and `/ajuda`, lastmod 2026-06-15 (https://livara.app/sitemap.xml).
- DefiLlama listing: `listedAt` 1782870218 = 2026-07-01; category "Prediction Market"; chain Polygon; `audits: "0"`; twitter `livaracripto` (https://api.llama.fi/protocol/livara). Matches the discovery hint.

## Kind and market model

- Kind: **parimutuel user-created event pools** with a centralized operator backend and an on-chain USDT escrow vault. H (site help text: "Livara is a parimutuel prediction pool platform", i18n in https://livara.app/assets/index-3d-qt2qd.js, key `ajuda.docs.0.content`).
- Creators ("partners/resellers") open a pool; bettors stake USDT on an outcome; winners split the pool net of fees pro rata to stake on the winning option. H. Worked example from the API (event 15, 2 x 50 USDT on opposite outcomes): total 100, prize pool 85, winner payout 85, `finalOdd` 1.7 (https://livara.app/api/events/15).
- Two market types (`marketType` in API), H:
  - `fixed_options`: creator defines 2+ named options (categorical; 13 options in the election pool). Count in public list: 5.
  - `exact_score`: bettors create their own score outcomes (e.g. "2 x 1"), max 3 scores per user (`exactScoreMaxPerUser: 3` in `/api/settings`); outcomes are `isDynamic: true`, `optionKey` like `"2-1"`. Winners of the same score split the prize. Count in public list: 13.
- No scalar markets, no order book, no AMM, no outcome tokens. An outcome choice is a row in the operator's database linked to an on-chain deposit by an opaque `ref` (see Trade path). A position cannot be sold or closed. H (contract source + bundle).
- No-winner case ("house_win"): if nobody picked the winning outcome, the net pool is split between platform and reseller by a configured ratio (help doc `ajuda.docs.5`); one event (id 4, 16.8 USDT) ended `house_win`. H.
- Odds mechanics H (`/api/settings`, help doc): max odd cap `maxOddCap: 100`; event auto-cancelled at bet close if any final odd is below 1.10 (help doc `ajuda.docs.6`; the settings notice writes "1:10" and a leaked translator note in `resellerNotices` asks whether that means 1.10 or 1:10, so the rule text is internally ambiguous). `currentOdd` is `null` for every option in every sample; `finalOdd` is set only for winners after settlement. An adapter must compute implied odds itself from option `totalAmount` and the pool fee split.

## Chains and collateral

- Chain: **Polygon PoS (chainId 137)** only. H (bundle default `chainId ?? 137`; JSON-LD "win USDT on the Polygon network"; DefiLlama `chains: ["Polygon"]`).
- Collateral: **USDT** on Polygon, 6 decimals; DefiLlama and Polygonscan label the token USDT0. The wallet code hard-codes the standard Polygon USDT token `0xc2132D05D31c914a87C6611C10748AEb04B58e8F` as fallback; the escrow's `token` is set at construction. H (bundle `wallet-picker-wQPMDrNQ.js`, contract source).
- Escrow contract **`LivaraPoolsEscrow`**: `0x2883C739871CE6900Bf4b60Ecc979354613148e2` on Polygon. H: DefiLlama-Adapters PR #19842 "update livara address" (merged 2026-06-29) switched the TVL owner to this address from `0xdC1359F9A5F80Feded5a7811e03148e773eAa2af` (https://github.com/DefiLlama/DefiLlama-Adapters/pull/19842); source is verified, exact match, on Sourcify (verifiedAt 2026-07-04, Solidity 0.8.24, not a proxy) (https://sourcify.dev/server/v2/contract/137/0x2883C739871CE6900Bf4b60Ecc979354613148e2) and on Polygonscan. Deployer `0x7B528B8573B14b6447bEEB5AeEBd8288167F10a7`, deploy tx `0x7d1056aab708f191f6004b05a1e1c34024d0d3f9f07805b344e6d49604141681`, block 89308056. The earlier `0xdC13...` address was the previous TVL owner; its role (legacy pass-through wallet vs earlier escrow) NOT FOUND.
- Site copy still says "Secure Custodial ... No smart contract" and "via BitcartCC" (legacy invoice flow) while the same bundle's help text says deposits go straight to the Polygon smart contract. The contract header comment explains the model: "custodial-espelho", replacing a custodial EOA wallet with the contract so TVL is verifiable. H (contract source + bundle strings).

## Read API

- **Official documented API: NOT FOUND** (searched: `/api/docs`, `/api/openapi.json` (404), robots.txt, sitemap, site JS bundle strings, `/ajuda` help text, GitHub code/PR search for Livara repos, DefiLlama listing). `exists` = unofficial-only: the first-party web app's own backend, unauthenticated GETs work, no docs, no stability promise.
- Base URL: `https://livara.app` (same origin, paths under `/api`, Cloudflare in front, JSON, `access-control-allow-credentials: true`, `etag` present). H.
- **Unauthenticated GET endpoints confirmed (H, fixtures saved under `docs/research/fixtures/livara/`):**
  - `GET /api/events` returns a JSON array of every listed event (18 on 2026-10-19; no pagination observed; `limit`, `category`, `resellerId` query params are ignored). Only `status` is honoured; allowed values: `open, closed, finalized, cancelled, postponed, preliminary_result, in_dispute, confirmed, settled, house_win` (from a 400 zod error; note that the list itself contains events with status `published`, which is not an allowed filter value). Fixture: `GET_api_events.json`, `GET_api_events_status_invalid_400.json`.
  - Event fields: `id, title, description, category (pt: Futebol/Política/Esporte/Outros), status, resellerId, resellerName, resellerLevel, feePercent, resellerCommissionPercent, winnerOption, betCount, totalAmount, prizePoolAmount, platformFeeAmount, resellerCommissionAmount, minimumTotalAmount, minimumFinalOdd, eventDate, betsCloseAt, createdAt, finalizedAt, cancellationReason, marketType, teamAName, teamBName, maxScoreA, maxScoreB, paymentType ("on_chain_custodial"), visibility, isListed, approvalStatus, pendingRefundCount, eventOptions[]`; option fields `id, eventId, name, optionKey, totalAmount, currentOdd, finalOdd, status (no_bets/active/winner/loser), scoreA, scoreB, isDynamic`.
  - `GET /api/events/{id}` adds `options[], prizePool, platformFee, resellerCommission, disputeWindowMinutes, creationFeeAmount, resultSubmittedAt, disputeWindowOpenAt, resellerReputationScore` and a `bets[]` array with per-bet `chosenOption, amount, isWinner, payout, createdAt`. It also exposes `clientName` (a truncated wallet label) and `receiptToken` per bet; the receipt token looks like a bearer secret for the receipts API. Fixture is redacted: `GET_api_events_15.redacted.json`. An adapter should not store or use those tokens.
  - `GET /api/settings` (fees, limits; fixture `GET_api_settings.json`, the exposed WalletConnect project id is redacted) and `GET /api/healthz`.
- **Auth required (HTTP 401 `{"error":"Não autorizado"}`), H:** `/api/events/{id}/payouts`, `/api/events/{id}/disputes`, `/api/dashboard/summary`, `/api/auth/me`, `/api/events/creation-eligibility`. `/api/receipts/slip/{id}` returned 404 for an invalid id.
- **Seen only in the static bundle, not called (M):** `POST /api/auth/wallet/login` (body `{address, signature, nonce, ref}`), `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/bet-cart/payment`, `POST /api/bet-cart/set-address`, `GET /api/my/carts`, `GET /api/my/payment-orders`, `GET /api/receipts/{token}`, many `/api/admin/*` and `/api/agency/*` routes. Session is cookie based (`credentials: "include"`).
- Websocket: NOT FOUND for market data. The bundle has SSE streams for support chat only (`/api/support/stream`).
- Rate limits: NOT FOUND (no `RateLimit-*` or `Retry-After` headers on about 20 requests; Cloudflare front, so expect WAF throttling).
- **On-chain read (H):** `getPool(poolId)` returns `(status, balance, totalIn, totalOut)`; events `PoolCreated, BetDeposited(poolId, from, ref, amount), PoolClosed, PoolSettled, PoolCancelled, PaidOut, Refunded, CreationFeePaid`. This gives pool totals and depositor addresses only; the per-outcome split is off-chain, so the REST API is the only source of option-level stakes. ABI fixture: `sourcify_LivaraPoolsEscrow_abi.json`. Pool ids in the contract are the app's event ids (the function takes the app `poolId`; mapping to `event.id` is M, from the bundle's `poolId` usage and `PoolCreated` doc comment "espelha o evento").
- Third-party: DefiLlama TVL only (`https://api.llama.fi/protocol/livara`), TVL = USDT balance of the escrow; fixture `defillama_protocol_livara.trimmed.json`.

## Trade path

- **No documented programmatic trading API. NOT FOUND.** The web flow, reconstructed from the bundle and verified ABI (M for the HTTP side, H for the contract side):
  1. Log in: wallet signature (`personal_sign` over a server nonce, message format NOT FOUND) to `POST /api/auth/wallet/login`, or username/password, giving a cookie session.
  2. Add predictions to a server-side cart, then `GET /api/bet-cart/payment`, which returns a payment descriptor: `contractAddress`, `poolId`, `ref`, `expectedAmount`, `chainId`.
  3. From the user's wallet on Polygon: `USDT.approve(escrow, MAX_UINT256)` once, then `escrow.depositBet(uint256 poolId, uint256 ref, uint256 amount)` (selector `0x9a61cf6c`; the ABI confirms the signature). Anyone may call it while the pool is `OPEN`.
  4. The backend watches `BetDeposited`, matches `ref` to the pending payment order, and credits the prediction. A deposit with no matching `ref` becomes "orphan balance" in the pool (contract comment), i.e. it is a donation to the pool, not a bet.
- Outcome selection is therefore **not on-chain**; it lives in the operator DB keyed by `ref`. Settlement is also off-chain: the single `operator` address calls `payout(poolId, recipients[], amounts[])` / `refund(...)`, limited only by the pool's balance. The contract does not verify winners. H (source).
- Order types, cancel, edit: none. Exits: none. Cart expiry exists (`expiresAt`, "expired" payment orders).
- Not exercised: nothing authenticated was called, no nonce was requested, no cart was created.

## PayBox reachability

- **paybox_reachable = partial.** The two on-chain legs (USDT `approve`, then `depositBet`) are plain EVM transactions on Polygon (a chain PayBox wallets support), so an EVM wallet could submit them as transaction proposals. But a bet is only valid if the `poolId`/`ref` come from an authenticated cart session created by a wallet-signature login, and there is no signed-order path. Without the session the deposit is an unrecoverable donation to the pool. This makes it an off-chain-session-gated flow, not a clean PayBox plugin target. There is also no way to hedge or exit afterwards. M.

## Fees

All H unless stated; `GET /api/settings` (2026-10-19) and per-event fields.

- Rake on every pool: platform fee 10 percent + reseller (creator) commission 5 percent = 15 percent; prize pool 85 percent (`platformFeePercent: 10`, `defaultCommissionPercent: 5`, `prizePoolPercent: 85`, `onchainPlatformFeePercent: 10`, `onchainCommissionPercent: 5`).
- Older events used lower rakes: 7+5 (prize 88 percent, e.g. event 4) and 7+4 (prize 89 percent, event 1); 10 events use 10+5, 7 use 7+5, 1 uses 7+4. So the fee is a per-event field (`feePercent`, `resellerCommissionPercent`) that the creator and platform set; an adapter must read it per event, not assume 15.
- Referral/agency: a reseller can pass part of its commission to another reseller who brings bettors ("Agency mode", `referralLabel`); not extra cost to bettors.
- Minimum prediction: 5 USDT (`minimumBetAmount: 5`). Max odd cap 100x. Min final odd 1.10 else the event is cancelled and refunded.
- Creator opening fee: exists, discounted by reseller level, paid on-chain via `payCreationFee` straight to `feeRecipient`, non-refundable even on cancellation; amount NOT FOUND.
- Gas: paid by the bettor on Polygon (approve + deposit; refunds/payouts are paid by the operator).
- Prize delivery: small prizes are paid automatically; larger ones must be requested within 30 days of settlement; "very large" prizes need admin approval; thresholds NOT FOUND. Expired unclaimed tickets can be swept to the admin (`sweepDust`, admin route `/api/admin/payouts/{id}/expire`). H (help doc `ajuda.docs.4`, source comments).

## Resolution mechanism and dispute risk

- Flow H (help docs, `/api/settings` notices): the creator submits a "preliminary result" after the event; a dispute window opens (default 180 minutes in settings, 240 minutes on settled event 15); predictors may contest, one vote each; if contests reach more than half of the event's predictors (50 percent + 1) the event goes to **admin review**, and the admin ("Livara") decides. If a dispute is upheld the event is cancelled and everyone is refunded and the creator is penalised. Otherwise the result stands and prizes are released.
- This is not "community-validated" in any strong sense (the site meta description says so): the creator proposes, voters can only veto with a majority of all bettors, the platform has the final word, and the operator key executes payouts. No oracle, no bond, no on-chain dispute. H.
- Concentrated trust: a single hot `operator` key can pay any addresses up to each pool's balance; the cold `owner` can pause, replace the operator, set a TVL cap and sweep leftover pool balance after settlement/cancellation. No timelock, no audit (DefiLlama `audits: "0"`; no audit found). H (source).
- Observed resolution quality: the 2 settled events (15, 16) resolved within about a day; event 18 has been unresolved 15 days after close. Its description asks "who will be the new President of Brazil in 2027?" yet it closed at 2026-10-04 11:00 UTC, so which round/definition applies is unclear. M. Real dispute and cancellation risk is high: 13 of 18 events are `cancelled` (almost all with zero bets).

## Geo, ToS and automation

- Terms of service, privacy policy, age or jurisdiction restrictions, KYC, bot/API usage rules: **NOT FOUND** (searched: homepage HTML, full JS bundle and all lazy chunks for terms/KYC/jurisdiction/age/VPN strings, `/ajuda` help text, sitemap, robots.txt, `/api/settings` notices). Marketing says "Global", "anonymous", "no banks", "any wallet can join with no prior signup". UI copy is Portuguese-first with English toggle; events are Brazil-centric. Regulatory status NOT FOUND. L for any inference about jurisdiction.
- robots.txt: `User-agent: *` / `Allow: /` (https://livara.app/robots.txt). No automation prohibition found, but also no sanction for it; the API is not offered to third parties.
- Bets are irreversible once on chain; events can be cancelled or postponed at any time by the creator or the system; duplicate payments are "reviewed by the administrator" (`/api/settings` `securityNotices`, help doc `ajuda.docs.8`). H.
- Contact/support: in-app chat plus Telegram (`poolbetcrypto`) and X (`livaracripto`) handles in the welcome message. The X profile returned HTTP 402 to WebFetch; no payment requirements were visible and I stopped. The Telegram page showed only a contact stub.

## Liquidity

- DefiLlama TVL: **200.04 USDT0 (about 200 USD) on 2026-10-18 20:25 UTC**; history since listing never exceeded 200 USD, with many zero days (early July 2026 between 0 and 17 USD, 200 USD on 2026-07-17 to 07-19 and 100 on 07-20, then 0 for about three weeks, then 200 flat from 2026-08-12 to date). Source: https://api.llama.fi/protocol/livara (H, fixture). A search snippet of DefiLlama's Polygon prediction-market table shows zero volume/fees/revenue for 24h/7d/30d (M, https://defillama.com/protocols/prediction-market/polygon; the page itself returned 403 to fetch).
- Escrow balance 200.25 USDT0 on Polygonscan (M, fetched 2026-10-19). The 200 USD is exactly event 18's pool (two bets of 100 USDT on Lula and Renan Santos); the other 0.25 is excess or dust.
- Lifetime from the public API (computed from fixture `GET_api_events.json`, 2026-10-19): 18 events, 11 bets, sum of `totalAmount` 423.80 USDT. 16 of 18 events were created by the operator's own reseller account "Livara"; two by other partners ("Cryptowolf" event 6, cancelled with 0 bets; "PrincBET" event 17, 0 bets). Event 15's two bets are equal 50 USDT stakes on opposite outcomes from one wallet label, consistent with testing (M).
- Typical pool: 0 to 4 bets, 0 to 200 USDT.

## Event categories and overlap

- Content so far (category field is Portuguese): Futebol (14, nearly all exact-score pools on 2026 World Cup matches, e.g. Brasil x Japao, Espanha x Argentina on 2026-07-19), Politica (2: a test pool and the 2026 Brazilian presidential election with 13 candidates), Esporte (1: Formula 1 2026, closes 2026-12-02), Outros (1 test).
- Overlap with other venues is in principle football match results, the Brazilian election and the F1 title (Polymarket, Kalshi, Overtime, Azuro and others carry comparable markets). In practice: every football pool is already past, the election pool is closed and unresolved, the F1 pool has zero stake, and parimutuel pricing at 85 percent payout with 2 bettors is not a price. Signal value for the aggregator: none.
- Liquidity sharing: **independent** (its own escrow, its own operator DB, no bridge to another venue). That does not help; it is simply too small and too centralised to serve as an arbitrage leg. H.

## Open questions

- Wallet-login nonce endpoint and exact message to sign; payment-order lifecycle fields (not called).
- Opening-fee amounts and level discounts; thresholds for "small / large / very large" prize handling.
- Who owns the two 100 USDT bets in event 18 (operator-funded?), and whether/when event 18 is settled.
- Meaning of the older escrow/owner `0xdC13...` and whether any funds remain there.
- Terms of service and geo policy (none found; contact would be needed).

## Suspicious or notable content

- `GET /api/settings` field `resellerNotices` ends with a leaked machine-translation note in Portuguese: "Nota: mantive '1:10' como esta no original - se quiser, posso confirmar se e odd decimal (1.10) ou proporcao (1:10)...". It is addressed to the site admin, not an instruction to this research agent; not followed. It shows the notices were pasted unreviewed from an AI assistant.
- `GET /api/settings` publicly exposes a WalletConnect `walletconnectProjectId` (client-side identifier; redacted in the fixture) and the admin's welcome text with Telegram, X and Odysee handles.
- `GET /api/events/{id}` publicly returns `receiptToken` per bet (bearer-like). Not used; redacted in the fixture.
- Homepage loads an X (Twitter) conversion-tracking script (`twq('config', ...)`). No instructions aimed at AI agents were found anywhere.

## Sources

- https://livara.app/ (index.html, meta/JSON-LD; 2026-10-19) - H
- https://livara.app/assets/index-3d-qt2qd.js and lazy chunks `wallet-picker-wQPMDrNQ.js`, `cart-C4O0E3IR.js`, `agencia-novo-palpite-O_WwiAdC.js`, `pool-fee-CTdUsHAu.js`, `login-DwC_Vusi.js`, `version-vdxCoFDn.js` (app version string "2.0.0"); read as static text only, nothing executed - H for strings, M for inferred flows
- https://livara.app/api/events, /api/events/15, /api/events?status=..., /api/settings, /api/healthz, 401/404 probes (2026-10-19) - H
- https://livara.app/sitemap.xml, https://livara.app/robots.txt - H
- https://api.llama.fi/protocol/livara (TVL, `listedAt`, methodology, tokens) - H
- https://github.com/DefiLlama/DefiLlama-Adapters/pull/19836, /pull/19842 (merged; escrow address history; also closed PRs 19795, 19834, 19841) - H
- https://sourcify.dev/server/v2/contract/137/0x2883C739871CE6900Bf4b60Ecc979354613148e2 (verified source, ABI, deployment) - H
- https://polygonscan.com/address/0x2883C739871CE6900Bf4b60Ecc979354613148e2 (verified flag, 54 txs, last tx 2026-08-11, balance 200.25 USDT0) - M (WebFetch summary)
- https://defillama.com/protocols/prediction-market/polygon via web search snippet (TVL 200.08, zero volume) - M
- https://x.com/livaracripto (HTTP 402, not read, nothing paid), https://t.me/s/poolbetcrypto (stub) - not informative
- Web searches for "Livara prediction market", "Livara PoolBet" returned no independent coverage, reviews or incidents - H (absence), L (as evidence of anything)

Fixtures (all under `docs/research/fixtures/livara/`): `GET_api_events.json`, `GET_api_events_15.redacted.json`, `GET_api_settings.json` (project id redacted), `GET_api_healthz.json`, `GET_api_events_status_invalid_400.json`, `defillama_protocol_livara.trimmed.json`, `sourcify_LivaraPoolsEscrow_abi.json`.
