# Poll.fun - venue spec (2026-10-19)

Verdict: live, official API exists, but it is a small social-betting app (friends-betting), not a deep prediction-market venue. Adapter priority **P2** (signal-only / thin). Tags: H = read first-hand in a primary source this session, M = secondary/inferred or derived by me from live data, L = weak/stale.

## 1. Identity and liveness
- Poll.fun is "a peer-to-peer betting app for friends" (tagline "Bet your mates. Get paid."); surfaces: web (app.poll.fun), iOS/iMessage, Telegram bot + MiniApp. Backers listed on the homepage: Alliance, Fabric VC, Animoca Brands, Founders Factory (company claims, no round size found). Footer company: Challenger Labs. [H] https://app.poll.fun/
- The predictionindex.xyz listing hint ("bot/market on Solana") is partly right: it IS a Solana USDC product, but it is a social betting app with an API/CLI/MCP, not an order-book market. The ecosystem page fetch did not show a Poll entry in the visible portion (truncated). [M]
- Still live 2026-10-19: app and API respond 200; dev docs sitemap lastmod up to 2026-09-24; npm `@solworks/poll-sdk` 1.8.0 modified 2026-09-27; 1104 open fixed-odds contracts and 173 pari-mutuel bets created in Oct 2026 so far. [H] (api.poll.fun, dev.poll.fun sitemap, npm view)

## 2. Kind and market model
Three distinct products share one Solana program ("Poll Anchor program", repo name in package scripts: betmore-core-program) [H https://dev.poll.fun/sdk/concepts]:
1. **Pari-mutuel binary bets (program v2/v3)**: user-created yes/no ("For"/"Against") questions. Everyone's USDC goes in one pool; winners split the pot pro rata. No order book, no limit price; the implied probability is just `shareBps` of pot. User holds one wager per bet. Min wager 1 USDC in sampled data (`minimumWagerAmount: 1000000`). [H docs + live sample]
2. **Pari-mutuel multi-outcome bets (v4)**: up to 64 named outcomes, same pool model, wager/vote by `outcomeIndex`. All 3,924 public bets in the all-time list were v2/v3 (none v4 present). [H docs; M count]
3. **Fixed-odds "Offers" (V5)**: Poll publishes two-sided "contracts" on real events (currently football only: Serie A, Premier League, Champions League, Liga, Bundesliga, Ligue 1, Nations League; markets such as team-to-win-or-draw, over/under 0.5/1.5 goals). A creator locks `creatorTotalMicros` on one side and asks `takerTargetMicros` on the other; ratio = price, fixed; takers fill in slices >= `minimumTakeMicros`. It is peer-to-peer matched at creator-chosen odds, effectively a single-price resting order per offer, partially fillable. Odds range 1:10 to 10:1; max 500 USDC per creator stake and per taker position; min 1 USDC. [H https://dev.poll.fun/api/offers, /sdk/offers]

Tokenisation: no outcome tokens. Positions are program accounts (bet/wager accounts; offer/position PDAs), settled in USDC. Not transferable/tradeable as tokens, no secondary market. [H]

## 3. Chain and collateral
- Solana mainnet, USDC (SPL). Amounts in micro-USDC (1 USDC = 1,000,000), always decimal strings in V5 REST. [H]
- Users hold one in-app USDC balance ("Poll wallet"); deposits claimed from Ethereum, Base, Arbitrum, Bitcoin, Solana and Apple Pay, converted to USDC on Solana; withdrawal to a Solana wallet or exchange. [H https://app.poll.fun/features (via WebFetch summary)]
- Custody: the REST API signs with the user's Poll wallet ("Poll builds the transaction, signs it with your Poll wallet, and submits it"). Custody model (embedded/MPC/custodial) NOT FOUND (searched: terms, features, dev docs). Terms say the company may confiscate "funds, winnings, or balances held in your account", which suggests operator control. [H terms; M inference]

## 4. Read API
- Official, partially public. Docs https://dev.poll.fun ; machine-readable https://dev.poll.fun/llms.txt and /llms-full.txt. Base URL `https://api.poll.fun`. [H]
- **Public, no token** (confirmed with unauthenticated GETs 2026-10-19, UA `insurance-markets-research/0.1`):
  - `GET /api/bets-usdc/offers/contracts` -> `{contracts[], feeBps, offersEnabled, limits{}}`. 1104 open contracts, ~758KB (fields: address, templateId, eventId, title, event, sport, competition, startsAt, cutoffAt, resolutionDeadline, status, outcomes[{side,label}], visuals). [H]
  - `GET /api/bets-usdc/offers?page&pageSize<=50&sport&query&status=Open|Filled|Closed|Settled&view=browse|results` -> `{offers[], pagination, feeBps, offersEnabled, limits}`; each offer has creatorOutcome, creatorTotalMicros, creatorAllocatedMicros, takerTargetMicros, takerFilledMicros, remainingTakerMicros, minimumTakeMicros, feeBps, termsGuardrail, status, revision, fillCount. [H]
  - `GET /api/bets-usdc/offers/:offerAddress`, `/:offerAddress/fills` (documented, not individually called). [H docs]
  - `GET /api/embed/v1/polls/{slug|betAddress}` -> `{data{schemaVersion,id,slug,question,version,state,outcomes[{outcomeIndex,label,totalOiMicros,shareBps,wagerCount,isResolved}],totalOiMicros,participantCount,closesAt,resolutionAt,resolutionCriteria,canonicalUrl,revision},error}`; cached `max-age=5, s-maxage=15`; docs say poll no faster than 10-15 s; no CORS for third-party origins. [H]
  - `GET /api/bets-usdc/all/public?limit<=50&offset&betStatus&excludeResolved&category` -> `{data[],pagination{total,limit,offset,hasMore},error,request}`; full bet objects incl. wagers[] with per-wager amountMicros, outcome, status; `/all/public/trending`, `/all/public/new`, `/all/public/single/:id`, `/all/public/single/:addr/probability-history`. **Not in the dev docs**: found in the official `@solworks/poll-api-client@0.1.24` source (dist/client.js on unpkg) and verified live. Treat as undocumented/unstable. [H live; M stability]
- **Authenticated** (PAT `Authorization: Bearer polld_...`, created in poll.fun settings; scopes read, bet:write, user:write, social:write, wallet:read): account, balances, my bets/wagers, leaderboard, notifications, `/offers/mine`. [H https://dev.poll.fun/auth via llms-full]
- Websocket / streaming: NOT FOUND (searched: llms-full.txt, sitemap, API, embed, client source). Poll REST.
- Rate limits: NOT DOCUMENTED (only guidance: embed JSON every 10-15 s; offers-write track-poll every 2-3 s). I made ~85 sequential GETs at 0.4 s spacing with no 429. [H]
- On-chain read: `@solworks/poll-sdk` 1.8.0 exposes `sdk.accounts.{contractV5,offerV5,positionV5,offerConfigV5,betV2,betV4}.all()` (needs a Solana RPC). Program ID: NOT FOUND in SDK constants.js (searched dist/constants.js, docs); it is inside the packaged IDL, not fetched. [H/M]
- Real-event data: sports contracts carry `eventId` and team names (football-data.org crest URLs), so event matching to other venues is feasible via teams + kickoff time (`startsAt`). Pari-mutuel bets are free text questions; the recurring ones are templated ("Will BTC be above $X at 8AM UTC Nth Oct?") and need parsing. [H]

Fixtures saved in `docs/research/fixtures/poll-fun/`: `offers-contracts.sample.json` (first 3 of 1104 contracts), `offers-browse.sample.json` (all 6 open offers), `embed-poll.sample.json`, `public-bets.sample.json` (2 bets, creator/user identifiers removed).

## 5. Trade path
- **REST (Poll signs for you)**: offers `POST /api/bets-usdc/offers` (create), `/:offer/take`, `/:offer/close` with PAT scope bet:write; body fields `expectedFeeBps`, `expectedRevision`, `idempotencyKey` (8-128 chars). Writes return `{signature, status:"pending", offerAddress}`. 409 on stale fee/revision. PATs cannot withdraw or move funds out. Pari-mutuel: `POST /api/bets-usdc/wager`, `/wager/cancel`, `/join`, `/vote`, `/settle` (client source). [H]
- **Self-signed on-chain**: `sdk.instructions.v5.{initializeOffer,takeOffer,closeOffer,settlePosition,closeOfferPool,timeoutContract}` return Solana instructions you sign and send yourself; requires an on-chain Poll "Program User" account and USDC. [H]
- Account creation and PAT issuance need a Poll account via the app (not done here, by rule). Whether a PAT can be obtained without Poll's embedded wallet: NOT FOUND.
- Atomicity: none across venues; one take per tx. No cancel of a taken position (offers: creator can close the unmatched part only). Pari-mutuel `cancel_wager` exists as an MCP tool (conditions NOT FOUND).
- Also: MCP server `@solworks/poll-mcp` v0.1.32 (28 tools), CLI `@solworks/poll-cli`. [H]

## 6. PayBox reachability: partial
- Poll is Solana-only for settlement; PayBox has a Solana wallet family and a `solanaTransaction` proposal (legacy/v0, <=1232 bytes, single signer = fee payer; per local notes `docs/research/06-paybox-platform.md`). In principle the SDK-built V5 instructions (take/create/close/settle) could be packed into a Solana proposal for a PayBox Solana wallet. Not tested (money-moving tools forbidden). Needs a one-time Program User account init tx and a USDC ATA. [M]
- The easier route (REST + PAT) trades from the Poll in-app wallet, which must be funded by an ordinary USDC deposit; PayBox could fund it via a Solana USDC transfer, but this is a transfer to a Poll deposit address (mechanism NOT FOUND in docs). EVM wallets (Base/Ethereum/Arbitrum) can fund via Poll's multi-chain deposit (conversion to Solana USDC), but not trade directly. [M]

## 7. Fees
- Offers (V5): `feeBps` = 1000 (10%) live from `GET /contracts` on 2026-10-19; fee is charged **only on the winner's profit** (rounded down), void refunds with no fee; payer: winner; on-chain max 2500 bps. Fee is read from config and must be echoed as `expectedFeeBps`. [H]
- Pari-mutuel bets: `feeBps` field on each bet. From the all-time public list (n=3,924): 0 bps for all bets created Aug 2025 - Jun 2026; 1000 bps on bets created from July 2026 (most; a minority still 0). Fee base for pari-mutuel (profit vs pot) NOT FOUND (searched: concepts doc says "minus protocol fees"). [H field; M interpretation]
- Gas/rent: Poll's settler pays; fee payer covers rent and gas for settle. Deposit/withdrawal fees NOT FOUND. [H/M]
- Consequence for arbitrage: a 10% fee on profit raises the break-even a lot (e.g. even-money offer needs >52.6% true probability for a taker); a cross-venue edge must exceed that, which usually exceeds typical Polymarket/Kalshi vs Pinnacle-style spreads. [M calc from fee formula]

## 8. Resolution and dispute risk
- Offers: Poll creates and resolves contracts (sideA, sideB, or void); resolver is a single Poll authority; resolution window between event start and `resolutionDeadline`; if the resolver misses the deadline anyone can `timeoutContract` -> void, full refunds. Source of truth for sports is "the final score" (data provider NOT FOUND). Centralised-operator risk, no dispute process documented. [H]
- Pari-mutuel bets: resolver chosen by creator: group vote (participants vote; min vote count), creator-resolver (`isCreatorResolver`), or live scores for sports; "Tied" outcome -> refunds; auto-refund date (`autoRefundAt`, default one year out) [H]. Recurring crypto price bets in the sample had `isCreatorResolver: true` and `resolutionCriteria: null` in the embed sample: price source NOT FOUND, so resolution can differ from Polymarket/Kalshi oracles. Dispute/appeal process: NOT FOUND (a help page "When a friend won't pay" is linked from /features, not read). ToS: abuse determinations are "final and binding". [H/M]
- Basis risk is therefore high for any cross-venue pairing.

## 9. Geo / ToS / automation
- ToS v1.1 (updated 2025-12-04) at https://poll.fun/terms: no restricted-jurisdiction list found; no age limit found; governing law "the jurisdiction in which our company is registered" (not stated). It lists use of "automated tools or bots" as platform abuse (Section 4) and bars overburdening servers, yet Poll publishes an official REST API, PATs, CLI and MCP aimed at automation. Read this as: automation via official PAT/API is intended, scraping/bots on the consumer app is not. Interpretation is mine; no explicit statement on trading bots or arbitrage. [H terms via WebFetch summary; M interpretation]
- Compliance gating: the offers API returns 403 when "Your account, or the offer creator's, is blocked from wagering by compliance" (Close still works) - so some KYC/geo blocking exists in practice; criteria NOT FOUND. [H]
- Regulatory status NOT FOUND (searched: homepage, terms, features, web search).

## 10. Liquidity (all derived by me from live public endpoints on 2026-10-19; treat as M)
- Offers: 1,104 open contracts but only **6 open offers**; remaining taker-side capacity about $33 total, each offer $1-$10 remaining. Max $500 per position by rule. Effectively no depth. [H live; M conclusion]
- Pari-mutuel public bets (n=3,924 since 2025-08-24): sum of `totalOiFor+totalOiAgainst` ≈ $1.63M all-time, ≈ $258k for bets created in the last 30 days (315 bets), ≈ $63k for the last 7 days; 89 Pending bets with ≈ $4.9k total OI now. Per-bet pots are small (median a few USDC; max ≈ $5.8k). Very lopsided pots are common on the templated crypto-price bets (e.g. "For" 3 vs "Against" 1,435), which suggests a single large (possibly house/market-maker-like) account on one side; I did not verify who. Since pari-mutuel, price moves with each wager and cannot be hit at a fixed price. [M]
- No TVL/volume stat published by Poll. NOT FOUND (searched: homepage, features, docs). The leaderboard page tracks amount wagered but was not summed.
- Independent sources on size: none found (web search returned only Poll's own pages).

## 11. Event categories and arbitrage overlap
- **Sports (football)**: 1,104 open contracts across top-5 leagues + UCL + Nations League; overlaps Polymarket, Kalshi (limited football), Limitless, Azuro-style books and sportsbooks. Fixed odds are chosen by creator, so they can be stale vs sharp lines; but depth is ~nil and fee is 10% of profit. [H]
- **Crypto price**: ~55% of pari-mutuel bets are recurring "BTC/ETH/SOL (also Gold) above $X at 2AM/8AM/2PM/8PM UTC" bets, overlapping Polymarket/Kalshi/Limitless crypto-price markets; strikes are arbitrary and rolling, so only a few will line up with another venue's strike/time. Resolution price source undocumented. [M]
- Politics/macro: occasional user-made questions (e.g. "Will Putin meet with Zelenskyy in 2025?") but no systematic coverage. Pop-culture/personal bets are noise. [M]
- Value as a **signal source**: pari-mutuel pot share per outcome, plus offer odds, are retail-friend sentiment; low information, thin.

## 12. Shared liquidity
Independent of every other venue: own Solana program and own USDC pools; no sign of routing to or from Polymarket, Kalshi or others. [H] Because liquidity is tiny, it is independent but not useful as a leg.

## 13. Adapter priority: P2
Reasons: (1) liveness and a documented, token-free read API with clean sports contract metadata make a read-only adapter cheap (offers/contracts, offers, embed JSON) - hence not "skip"; (2) executable depth is about $33 across 6 offers, caps $500 per position; (3) 10% profit fee; (4) centralised operator resolution with undocumented sources and no stated dispute process; (5) pari-mutuel pricing is not executable-limit; (6) Terms discourage bots on the consumer app. Revisit if offers volume grows (watch `pagination.total` of open offers) or if a sports book adapter needs a cheap soft-odds signal.

## 14. Open questions
- Program ID and IDL (parse once for on-chain reads without Poll's REST).
- Who creates and resolves the recurring crypto-price bets; price source and the large single-side wagers.
- Whether PATs are available to users who funded from outside the Poll embedded wallet, and rate limits.
- Fee base for pari-mutuel (profit vs pot) and why some Aug-Oct 2026 bets still show 0 bps.
- Geo restriction list and compliance-blocking rules.
- Whether the one-year `autoRefundAt` default can strand capital in unresolved bets.

## Not found (searched)
- Websocket/streaming (llms-full.txt, docs sitemap, client source). Rate-limit numbers (docs, headers). Program ID (SDK constants). Fee base for pari-mutuel (concepts doc). Geo/age/regulatory (terms, features, search). Independent volume/TVL (homepage, search, predictionindex entry not visible). Sports data provider for settlement. Custody model.

## Suspicious content
- None found. Docs contain a machine-readable llms.txt, written for AI agents but containing only reference material; no embedded instructions followed.

## Sources
- https://app.poll.fun/ (homepage, WebFetch) [H]
- https://app.poll.fun/features (WebFetch summary) [H, summary by fetch model]
- https://poll.fun/terms (ToS v1.1, 2025-12-04; WebFetch summary) [H]
- https://dev.poll.fun/llms.txt, /llms-full.txt, /sitemap.xml [H]
- https://dev.poll.fun/api, /api/offers, /api/typescript, /embed/api, /sdk/concepts, /sdk/offers, /sdk/multi-outcome-bets [H]
- https://api.poll.fun/api/bets-usdc/offers/contracts, /api/bets-usdc/offers, /api/embed/v1/polls/will-psg-be-the-ligue1-2027-champions, /api/bets-usdc/all/public (unauthenticated GETs, 2026-10-19) [H]
- https://unpkg.com/@solworks/poll-api-client@0.1.24/dist/client.js and @solworks/poll-sdk@1.8.0 (files read only, not installed) [H]
- npm registry metadata for @solworks/poll-api-client (0.1.24, modified 2026-06-23) and @solworks/poll-sdk (1.8.0, modified 2026-09-27) [H]
- https://predictionindex.xyz/ecosystem (discovery hint; Poll entry not visible in fetched part) [M]
- Local: docs/research/06-paybox-platform.md (PayBox Solana proposal limits) [M]
