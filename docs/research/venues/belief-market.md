# Belief Market (belief.market) - venue adapter spec

Researched 2026-10-19. Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "NOT FOUND (searched: ...)" means I looked and found nothing; it does not mean it does not exist.

**Verdict: skip.** It is live, but it is not a prediction market in the sense the aggregator needs, and it fails every adapter test at once:

- Its own litepaper says "Belief Market is **not** a prediction market at all": a market resolves to whichever side has the most money staked, with no reference to real-world truth (H).
- Bets are hidden commit-reveal parimutuel bets. There is no public odds, order book, or price (H, contract + T&C).
- TVL is about $548 (H, DefiLlama, 2026-10-18), with a max bet of 2,000 stablecoin units.
- There is no public or documented API (NOT FOUND).
- Every bet needs a signature from Belief's own backend. A winner is decided by that same backend.

Nothing here can be an arbitrage leg, and the "sentiment" has no link to external events. Revisit only if the team ships the oracle-resolved "prediction markets" the litepaper says are planned (M) and real volume appears.

## 1. Is it still live? (H, with caveats)

- https://www.belief.market/ (Squarespace marketing site) and https://app.belief.market/ (Next.js app) both serve HTTP 200 on 2026-10-19. The footer still says "(c) 2025", so the pages are not freshly maintained (H).
- The app's public share page for market id 388889 ("Multiple alarms?") was created 2026-10-16 00:34 UTC, status `Open`, deadline 2026-10-21 19:19 UTC, round 20 of recurring market spec 10205, 118 free votes and 22 comments, but **totalVolume 0 and 0 participants** with money (H, fixture `app-share-page-market-ssr.json`). So markets are being auto-created and people interact, but that market had no staked volume.
- DefiLlama TVL updated through 2026-10-18; the BSC balance last changed on 2026-10-05 (H, `api.llama.fi/protocol/belief-market`, computed from the history).
- GitHub `SportsFI-UBet/upredict-contracts` last pushed 2025-12-15; `SportsFI-UBet/contract-tooling` last pushed 2026-01-19 (H, GitHub API).
- BNB Chain DappBay lists it with copyright 2026 but shows no usage statistics at all (users and tx "-") (H, DappBay page).
- Status: **alive but near-dormant**. DefiLlama listed it 2025-09-05 (H).

## 2. Kind and market model

- **Kind:** on-chain social "opinion" game built on a custom hidden-bet **weighted parimutuel** contract. Operator is "UBET SPORTS EXCHANGE" (Costa Rica, company cert 1863024-2023, per site footer) - same team as the UBET sports-betting product (H footer, H audits page "same team").
- **Two market types in the client code (H, app JS):** `MarketTypeEnum { Belief: "belief", Prediction: "prediction" }`. The live sample is `isPredictionMarket: false`. The admin UI has "create prediction market" and "settle" screens and an API path `/markets/setPredictionResult` (H, app JS). So a manually settled "prediction" type exists in the code. I found **no** evidence of any listed prediction-type market and no public rules for it (NOT FOUND, searched: app pages, litepaper, T&C, search).
- **Outcomes:** categorical, up to 256 outcomes per market contract-side (bitmask), the live sample is binary (two named sides, e.g. "Team Snooze" / "One & Done"). Ties and explicit refund results are supported through the win mask (H, `WeightedParimutuelMarkets.sol`).
- **Tokenisation:** none. There are no outcome tokens, no ERC20/ERC1155 positions. A bet is a row of ERC20 collateral held by the contract plus an off-chain-held blob. Position identity on-chain is only an opaque `RequestCommitment` hash. The market id and chosen outcome are **hidden on-chain** until reveal (H, README + contract).
- **Price discovery:** none public. T&C: vote counts are visible, "pot volumes are hidden until closure to prevent manipulation" (H, T&C section 4/5). The live sample exposes `poolAmount` per outcome in the app JSON but it was "0" (H fixture); whether it is populated for live-staked markets: NOT FOUND (searched: share page only, since the authenticated feed is not reachable).
- **Resolution rule (belief type):** "the opinion with the highest total volume by the end of the market wins" (H, litepaper). The app UI says "Winners take ALL. Side with more BP wins!" (H, share page; "BP" here is the Belief Points token in the UI's pseudo-chain, and I could not confirm how money pots and BP interact).
- **Free "votes" and Belief Points:** markets also carry non-monetary votes (`totalVotes` per outcome) and a points-only pseudo chain (chainId 2147483647, `chainKind: BeliefPoints`, symbol BP, no contract) (H, fixture). Points feed a planned $BELIEF token airdrop (M, litepaper, no token found live: NOT FOUND, searched: DefiLlama `gecko_id/cmcId` null).

### Contract mechanics (H, repo `SportsFI-UBet/upredict-contracts`, read via `gh api`)

1. `placeBet(BetRequest, betSignature)`: `msg.sender` must equal `request.from`. The signature must come from an address with `BET_SIGNATURE_ROLE` (the Belief backend) over `keccak256(abi.encode(request))`. The request fixes token, amount, nonce, `submissionDeadlineBlock`, `refundStartBlock` and the commitment to the hidden bet. Contract pulls the ERC20 with `safeTransferFrom`, so the user must approve first.
2. `revealMarketResult(marketBlob, resultBlob, resultSignature)`: signature must come from `RESULT_SIGNATURE_ROLE` (backend). The backend picks `winningOutcomeMask`, `losingTotalPot` and `winningTotalWeight`; the contract only sanity-checks them (deadline passed, mask in range, weight > 0).
3. `revealBet(...)`: the user (or anyone, batched) submits the bet blob obtained from the backend and gets principal plus a share of the losing pot, `betWeight * losingTotalPot / winningTotalWeight`. `betWeight` is chosen by the backend ("to replicate parimutuel this weight would equal the bet amount"), so non-pure-parimutuel weighting is possible.
4. `requestRefund`: if no result is revealed by a per-user randomised `refundStartBlock`, the user can reclaim the full bet.
5. Roles: `DEFAULT_ADMIN_ROLE` can `setFees`, `setLimits`, and grant roles; `OPERATOR_FEE_DISTRIBUTOR_ROLE` pays out operator fees. No cap on fee values is enforced in `setFees` (uint16 over a 100000 divisor, up to 65.5% each).

## 3. Chains and collateral

| Chain | Collateral | Market contract | Evidence |
|---|---|---|---|
| BNB Smart Chain (56) | USDT `0x55d398326f99059ff775485246999027b3197955` (18 decimals), max bet `2000e18` | `0xab1fB9B0efA9235AFF385639611cB1BbbbCc3b40` (`WeightedParimutuelMarkets`) | H app config in fixture; H `/about-us` page; H repo `deployments/56` |
| Base (8453) | USDC `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (6 decimals), max bet `2000e6` | `0x5035608222e1C226781CAa22fe40D0DB6cc6c119` | same |
| "Belief Points" (2147483647) | BP, off-chain | none | H fixture |

- Only two money chains are live. Testnet deployments also exist on Base Sepolia, BSC testnet, Polygon Amoy and Monad testnet (chain 10143, deploy file dated 2025-09-12) (H, repo `deployments/`). No Monad mainnet deployment found.
- The April 2025 audit report lists "Deployment Chain(s): Polygon Mainnet", which does not match any mainnet in the repo (H, audit PDF); treat the audit scope line as a typo or an earlier plan.
- The litepaper says users may stake the planned $BELIEF token and "partner tokens"; none live (M).

## 4. Read API

- **Official/documented public API: none.** NOT FOUND (searched: belief.market footer and nav, `/about-us`, `/game-rules`, litepaper, GitHub org `SportsFI-UBet`, DappBay, DefiLlama, web search for "Belief Market API"). No docs site, no OpenAPI, no SDK, no Discord.
- **Undocumented app backend (H, from the public JS bundles, not called):** the web app talks to a separate backend whose base URL is a build-time variable (`NEXT_PUBLIC_BACKEND_API_URL`; value not visible in the static files I read). Requests use `credentials: include` (cookie session) and an **AWS WAF token fetch** (`awsWafFetch`, `NEXT_PUBLIC_AWS_WAF_INTEGRATION_URL`). Paths seen in the client: `GET /markets/home`, `/market/{id}`, `/market/{id}/outcomes/{outcomeId}/voters`, `/latestWinningBets/{chainId}`, `/marketsBySimilarityPaged/{id}`, `/leaderboard`, `/weeklyMarketLeaderboard`, `/auth/nonce/{address}`, `/auth/login`, `/betRequest`, `/voteOnMarketOutcome`, `/requestCreateMarket`, `/markets/setPredictionResult`. Method and auth need per request were not verified. I did **not** probe the backend (host not documented; WAF-protected; the app is built for authenticated sessions). Terms for scraping: NOT FOUND (see section 8).
- **What is actually reachable without auth (H):** a public **share page** `https://app.belief.market/share/<referralId>?lang=en-US` server-renders the full market object plus the chain/token config into Next.js flight data (`self.__next_f.push`). This needs a referral id from a shared link; ids are not enumerable (a `/markets/<id>` route returned 404). This is an HTML scrape, not an API; shape can change without notice. Sample saved.
- **On-chain reads:** the contracts expose `marketResults`, `bets`, `creatorFees`, `operatorFees`, `userNonces`, `creatorFeeDecimal`, `operatorFeeDecimal`, `betLowerLimit/UpperLimit`. But because outcome and market identity are committed hashes, on-chain data cannot give odds or per-market volume. Events: `MarketsBetPlacedV2(requestCommitment, request, creatorFeeDecimal, operatorFeeDecimal)` (amount and token visible), `MarketsResultRevealed`, `MarketsBetRevealed`, `MarketsRefundIssued`, `MarketsBetFeeCollectedV2`. I did not read any on-chain state: explorer APIs for these two contracts were paywalled or behind a Cloudflare challenge (not bypassed, see section 8), and a JSON-RPC `eth_call` is a POST, which this research round excludes.
- **Aggregate TVL only:** DefiLlama `GET https://api.llama.fi/protocol/belief-market` (H, fixture). Its adapter just sums the ERC20 balance held by each market contract (H, `DefiLlama-Adapters/projects/belief-market/index.js`).
- **Websocket / rate limits:** NOT FOUND.

### Fixtures saved (docs/research/fixtures/belief-market/)

- `defillama-protocol-belief-market.trimmed.json`: trimmed DefiLlama response (metadata, last 30 days of TVL, first-of-month samples).
- `app-share-page-market-ssr.json`: market object + chain/token config extracted from the share page's server-rendered data. `creatorUserId` and the referral id were removed.

## 5. Trade path and PayBox reachability

- **Programmatic path:** none documented. A bet needs (a) an authenticated session with the Belief backend (nonce + wallet-signature login, cookie, WAF token - inferred from the client paths above, M), (b) the backend's signed `BetRequest` and hidden commitment from `/betRequest` (M for the endpoint behaviour, H for the on-chain signature requirement), (c) an ERC20 `approve`, then (d) `placeBet` from the same address as `request.from`. After the result, claims need the market/result/bet blobs from the backend again (H, README: "User grabs all necessary Blobs from the backend").
- The first-party app signs with an Alchemy smart account (ERC-4337) with sponsored gas (H, app JS: `buildPerChainSmartAccountClient`, `/api/alchemy/mint-jwt`, gas policy ids). So its users are mostly smart-account holders, which does not matter for an EOA but shows the flow is built around the app.
- **PayBox reachability: partial.** An EVM wallet on Base or BNB could in principle send the `approve` and `placeBet`/`revealBet` transactions as proposals, and could sign a login nonce with `request_wallet_sign`. But it cannot obtain the backend's signed `BetRequest` without driving an undocumented, WAF-protected, cookie-authenticated API. No PayBox plugin or x402 service exists for it (H: `discover_plugins` for "belief market prediction" returned `[]`; `discover_services` for "belief market" returned only unrelated Polymarket data resellers). I did not call any signing or money-moving tool.
- **Because bets are hidden and the backend picks `betWeight` and the winner, a client cannot even verify what it bought.** An automated trader would be trusting the operator completely.

## 6. Fees

- **Contract formula (H, `MarketsBase.sol`):** on `revealBet`, for a winning bet only,
  `creatorFee = creatorFeeDecimal * losingPotShare / 100000`, `operatorFee = operatorFeeDecimal * losingPotShare / 100000`, both deducted from the winner's share of the **losing pot**, never from principal. Losers pay nothing extra; they just lose their stake. Fee rates are **locked into the bet at placement** (fixed after an April 2025 audit finding that fees applied retroactively).
- **Current on-chain fee values:** NOT FOUND (searched: docs, app JS, repo; would need an `eth_call` on `creatorFeeDecimal()`/`operatorFeeDecimal()`, which I did not make because a JSON-RPC call is a POST; the `MarketsBetPlacedV2` events also carry them).
- **Documented rates (official litepaper, M because it is a design doc and internally inconsistent):** creator gets 1% "of the winning pot / winners' payout" (H, https://www.belief.market/creator-bonus example: 5,000 USDC winner payout gives 50 USDC), a 5% operations fee "from the total winning payout pool", and a multi-level referral split of a 4% pool (50% / 20% / 5% of it, remainder to the platform). DappBay summarises "1% Creator Bonus and 2% Referral Bonus" (M). These do not reconcile (5% vs 4% vs 2%), so treat the true all-in take as roughly 5% of winners' profit, **unverified**.
- Gas: sponsored in the first-party app via Alchemy gas policy (H, app JS); a direct contract caller pays its own gas.
- Bet size: `betLowerLimit`/`betUpperLimit` are admin-set; app config shows max bet 2,000 USDT (BSC) / 2,000 USDC (Base) (H).

## 7. Resolution and dispute risk

- **Belief type:** deterministic rule "side with the highest total stake wins" (H, litepaper), computed by the **backend**, which submits the signed result. The contract does not recompute the pot; it only trusts `losingTotalPot`/`winningTotalWeight` within sanity limits (H). Hidden bets mean nobody can independently audit the tally before reveal.
- **Prediction type:** admin-settled via the app's admin console (H, app JS). The litepaper says a community-oracle model with staked $BELIEF "could" be added "down the line" (M). No UMA/Chainlink/Reality-style oracle exists today.
- **Operator discretion:** T&C section 5: Belief Market "reserves the right to void affected bets and refund all participants at our sole discretion" (H, T&C, short quote). Ties refund (H, app strings "It's a tie - Your amount was refunded").
- **Liveness failsafe:** user refund after `refundStartBlock` if no result was revealed (H).
- **Audits (H, https://www.belief.market/smart-contracts-audits):** the Belief contract audit is a single-reviewer review (handle "0x52") dated 2025-04-01 to 04-03, fixes reviewed 04-07, commits `06da56c` -> `40f6609`: 2 High (arbitrary refund via unvalidated betBlob; zero-amount bet could drain the losing pot) and 1 Medium (retroactive fee changes), all marked fixed. I did not verify that the deployed bytecode matches `40f6609` (the deployments JSON records different commit hashes: Base `5784581`, BSC `d9c4cc7`). Older audits listed (Resonance, 2023-2024) are for UBET sports contracts and the UBucks token, not these contracts.
- Overall resolution/trust risk: **high** (centralised signer for both bets and results; admin can change fees, limits and roles).

## 8. Geo, ToS and automation

- T&C (https://www.belief.market/terms-and-conditions, short): users must be 18+ ("Individuals under 18 are prohibited" in the footer); the service "is not meant to be a traditional gambling or prediction market"; results "are not controlled by Belief Market". **No prohibited-jurisdiction list found, and no clause about bots, automation or API use** (NOT FOUND, searched: T&C page, footer, game rules, about us).
- Operator: UBET SPORTS EXCHANGE, licensed in Costa Rica for sports betting (H footer; litepaper claims the licence "adds credibility", M). That licence covers sports betting, not obviously this product. Regulatory status of an "opinion betting" product: unknown.
- Technical anti-automation: the app backend is behind AWS WAF (H, app JS). The marketing site is Squarespace; the app is on CloudFront. Scripted access to the authenticated API is therefore likely to be challenged (M).
- Third-party Cloudflare challenge blocked the Base Blockscout API; I did not try to bypass it.

## 9. Liquidity (all tiny)

| Metric | Value | Source / date |
|---|---|---|
| TVL (USDT on BSC + USDC on Base held by the two contracts) | **$548** ($547 BSC, $1.64 Base) | H, DefiLlama `api.llama.fi/protocol/belief-market`, 2026-10-18 |
| Peak TVL since listing (BSC) | $754 | H, same, history to 2026-10-18 |
| Range | $33-$141 Sep 2025 - May 2026; $408-$688 Jun - Oct 2026 | H, same |
| Volume / OI | NOT FOUND (searched: DefiLlama dexs/fees/options summaries all "not found"; DappBay and DappRadar no data or 403) | |
| Sample live market | volume 0, 0 paying participants, 118 free votes | H, fixture, 2026-10-16 |

- Note TVL is the whole contract balance, so it includes stakes in unsettled markets, unrevealed winnings not yet claimed and unwithdrawn creator/operator fees. It is an upper bound on live stakes, not volume.
- Discarded: a homepage summary produced by my fetch tool claimed "534 markets, 235 participants, $7.5K volume". I grepped the raw 539KB HTML and those figures are not in it, so I treat them as unverified and did not use them.
- An alphagrowth.io search snippet showed about $33 over a 24h window with no date (L, not opened).

## 10. Event overlap and shared liquidity

- **Categories:** culture and social debates ("Multiple alarms?", "Pineapples on pizza?", GOAT debates, tribe-vs-tribe crypto communities such as "BNB lovers vs BASE preachers") (H, litepaper + site). **No** sports results, politics, macro, or crypto price outcomes are resolved against reality, so there is **no overlap with Polymarket/Kalshi/etc. and no arbitrage** (H by design: resolution is by stake majority).
- **Shared liquidity:** none found with another prediction venue. It has its own self-contained contracts on BSC and Base. The sister product UBET Sports Exchange uses separate contracts (UBucks token, AMM, parlay) (M, audits page). So independent, but too small to matter.
- **Signal value:** nil for event forecasting. At best a crowd-sentiment / meme-popularity feed with no way to fetch it programmatically.

## 11. Adapter recommendation

- **adapter_priority: skip.** No API, hidden bets, centralised resolver, ~$550 TVL, no event overlap.
- If revisited: (1) watch `MarketsBetPlacedV2` / `MarketsResultRevealed` events on `0x5035...` (Base) and `0xab1f...` (BSC) for a volume signal; (2) read `creatorFeeDecimal`/`operatorFeeDecimal` once via a normal RPC read to settle the fee question; (3) ask the team (Telegram `t.me/belief_market`, X `@BeliefMarket_`) whether a public API or the "prediction" market type exists. None of those are worth building before a real volume signal appears.

## 12. Open questions

- True current fee rates (on-chain `eth_call`; litepaper numbers conflict).
- Whether any "prediction"-type (admin-settled, event-based) market has ever been listed, and in what categories.
- Real cumulative volume and user count (no source; DefiLlama has no volume adapter).
- Whether the deployed bytecode equals the post-audit commit `40f6609`.
- What BP ("Side with more BP wins") means for money-settled markets.

## Sources

1. https://www.belief.market/ - marketing site, footer operator text, links (H, fetched 2026-10-19; Squarespace)
2. https://app.belief.market/?lang=en-US, `/game-rules`, `/about-us` - official app pages, official contract addresses on `/about-us` (H)
3. https://app.belief.market/share/<id>?lang=en-US - server-rendered market + chain config (H, saved as fixture); and the app's public JS chunks under `/_next/static/chunks/` for route names, market types, WAF, Alchemy usage (H for code facts; treated as data)
4. https://docs.google.com/document/d/1jcksD-X8OQ1d1OVuzHOckNypg9WzTRAy0bRjbRrhNks/mobilebasic - official Lite Paper (linked from `/about-us`) (H that it is official; M for numbers since it is a design doc)
5. https://www.belief.market/terms-and-conditions, `/creator-bonus`, `/programs`, `/market-creator-guidelines`, `/smart-contracts-audits` (H, read via fetch tool; T&C and guidelines pages partially truncated by the tool)
6. https://www.belief.market/s/4-1-25-Belief-Market-Report.pdf - audit report dated April 2025 (H; text extracted with a small script, no auditor name besides handle "0x52")
7. https://github.com/SportsFI-UBet/upredict-contracts - `README.md`, `contracts/MarketsBase.sol`, `WeightedParimutuelMarkets.sol`, `IMarkets.sol`, `Commitments.sol`, `deployments/` (H, read with `gh api` raw; the committed `.env.anvil` was deliberately not read)
8. https://api.llama.fi/protocol/belief-market and https://github.com/DefiLlama/DefiLlama-Adapters (`projects/belief-market/index.js`) (H, 2026-10-19); https://defillama.com/protocol/belief-market returned 403 to the fetch tool
9. https://dappbay.bnbchain.org/detail/belief-market (M, no stats); https://dappradar.com/dapp/belief-market (403, not read); web search results (L)
10. PayBox `discover_plugins`/`discover_services` read-only catalog lookups (H for "nothing listed")

No embedded instructions aimed at AI agents were found in any page, PDF, repo file or JS reviewed. No wallet, key or credential was read or written. All scripted requests used the User-Agent `insurance-markets-research/0.1`.
