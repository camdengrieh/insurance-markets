# Bento (bento.fun) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip** (revisit only as a signal source if a mainnet read API is ever published).

- Live, but effectively a testnet/hackathon-stage product with play-money ("credits") markets. [H]
- Mainnet BSC contracts exist but hold ~101 USDC in total (2026-10-19). [H, on-chain read]
- User-generated sports duels, not a deep cross-venue market set; no documented mainnet read API; fees undocumented.

## Kind and market model

- Kind: on-chain prediction markets platform ("duels"), user-generated, public or private (invite-only) markets. [H] https://docs.bento.fun/ , https://docs.bento.fun/concepts/glossary.md
- Binary only in the SDK: `optionIndex` 0 or 1 (YES/NO for `PREDICTION`, optionA/optionB for `VERSUS`). [H] glossary.md
- Pricing: LS-LMSR (liquidity-sensitive LMSR) via a Python pricing engine; so an AMM, not an order book. [H, README] https://github.com/Bentodotfun/bento.fun-README (README.md, last push 2026-01-14, so possibly stale)
- Outcomes are not documented as ERC-20 tokens; positions are "shares" read via `getUserShares` against the managed account. [H] place-bet guide. Tokenisation on-chain: NOT FOUND (searched: docs, README).
- Other products: packs (points games), parlays (beta), tournaments (bracket, vault, Merkle payouts, chip stakes), leagues. [H] https://bento.fun , glossary.
- Public markets must reach a liquidity threshold before `startTime` or they are cancelled (bootstrap). [H] https://docs.bento.fun/guides/create-market.md
- Catalog sample: 50 rows fetched, all `collateralMode=credits`, status -1, categories Football 37 / Basketball 6 / Cricket 4 / Formula 1 3. [H] fixture below. `pagination.total` was 394 (testnet).
- Catalog rows carry `polymarketEventId/MarketId/ConditionId/Volume24h` fields; docs mention "canonical Polymarket-mirror credits duels". [H, OpenAPI + live row] Bento mirrors/pairs Polymarket markets with play-money credits markets and has a Polymarket onboarding/bridge flow. It is therefore a downstream consumer of Polymarket, not an independent price source. [M inference]

## Chains and collateral

- Chain: BNB Smart Chain (mainnet chain id 56, testnet 97). [H] https://docs.bento.fun/concepts/how-bento-works.md ; README.
- Mainnet Diamond (EIP-2535) `0x53A16B43703F0573c5518B3C1427083E1a381d3e`, collateral token `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` (symbol USDC, name "USD Coin", 18 decimals per docs). [H] README.md + eth_call on https://bsc-dataseed.binance.org/ (code present at Diamond; symbol/name read). The token README labels it "BENTO USDC"; address looks like Binance-Peg USDC [M].
- Docs also mention "6 for Base USDC" in a decimals note, so a Base deployment may exist; not documented further. [L] https://docs.bento.fun/guides/place-bet.md
- Collateral modes: `credits` (platform-managed play balance, not geo-gated) and `usdc` (real, geo-gated). [H] https://docs.bento.fun/concepts/money.md
- Funds and positions sit in a Bento-provisioned custodial-style "managed account" whose address differs from the signing EOA. [H] https://docs.bento.fun/concepts/accounts.md

## Read API

- Docs: https://docs.bento.fun/ ; llms.txt https://docs.bento.fun/llms.txt ; OpenAPI snapshot https://docs.bento.fun/openapi/markets.json (166 paths; admin paths stripped; pinned snapshot, may lag live). [H]
- Base URL (testnet only): `https://internal-server.bento.fun` (markets host); tournaments host `https://bento-fun-tournaments-backend-3nku.onrender.com`. [H] https://docs.bento.fun/concepts/environments.md
- Mainnet host: NOT FOUND (docs say mainnet host and builder keys are issued by Bento ops; "contact the team"). Searched docs, OpenAPI `servers` (empty), README.
- Public (no auth) GETs confirmed 2026-10-19 [H]:
  - `GET /bento/public/duels/all?limit=50` (no `offset` param: `offset` returns 400 "property offset should not exist")
  - `GET /bento/public/duels/get-duel-by-id/{duelId}`
  - `GET /bento/protocol-stats/summary`, `/bento/protocol-stats`
  - `GET /bento/analytics/platform`
  - `GET /bento/public/bets/yes-percentage-snapshots/{duelId}` (price history, documented, not called)
  - `POST /bento/public/bets/estimated-win`, `/estimate-sell` (quotes; POST, not called)
  - leaderboard, packs endpoints documented as public
- Price/book: no order book. Price from `estimateBuy` (user-authenticated) or snapshots. Market rows include `liquidityBreakdown.option0/1.{tokenAmount,usdcAmount}` and `totalBetAmount`. [H]
- Auth: docs say catalog reads need no builder key, though `createBentoSdk` forces one; builder key via `x-builder-api-key` is needed for login/register and user actions. [H] https://docs.bento.fun/concepts/builder-api-key.md
- Rate limits: per builder key, 300/min self-serve testnet, 120/min team-issued; 429 with Retry-After. [H] https://docs.bento.fun/reference/common-patterns.md . Limits for unauthenticated reads: NOT FOUND.
- Websocket: README says backend and pricing engine have WebSocket support [L/stale]; SDK 0.1.2 description mentions "realtime". Public docs advise polling. WS URL/schema: NOT FOUND.
- SDK: `@bento.fun/sdk` 0.7.2 (MIT), npm registry https://registry.npmjs.org/@bento.fun/sdk [H]. Source repo is not public under the name given in package.json (`bento-fun/bento` 404); public GitHub org is `Bentodotfun` with only README, sandbox and hackathon repos. [H]

### Fixtures (testnet, real responses)

Saved under `docs/research/fixtures/bento-bento-fun/`:
- `testnet_public_duels_all_limit2.json` (first 2 of 50 rows)
- `testnet_protocol_stats_summary.json`
- `testnet_analytics_platform.json`

## Trade path

- Not order-signed. Flow: SIWE-style message signed by an EOA (`eoaChallenge` -> `eoaLogin`/`eoaRegister`) returns a Bearer JWT; trades go through `POST` bet endpoints on the Bento backend, executed from the managed account, not from the user's wallet. [H] https://docs.bento.fun/concepts/authentication.md , place-bet.md
- Programmatic: `estimateBuy` -> `placeBetFromEstimate` (min stake 5 units, wei amounts, `idempotencyKey`). "Accepted is not settled": poll `getUserShares`. [H]
- Mainnet registration "also requires inviteCode". [H] authentication.md
- Funding the managed account on mainnet: deposit path NOT FOUND in docs (withdrawal-requests endpoints exist with daily limit; deposit flow not documented). Testnet uses a faucet.
- Programmatic access therefore needs a Builder API key issued by Bento ops for mainnet. Not self-serve.

## PayBox reachability

- paybox_reachable: **no** (practically). Chain is BSC (BNB is among PayBox networks), so an EVM wallet could sign the login message and, in principle, send USDC to the managed account, but there is no documented mainnet host, no self-serve key, an invite code is required, positions live in a custodial managed account, and bets are API calls rather than on-chain transaction proposals. Vault deposit / `sdk.onchain` flows do submit wallet transactions (tournaments only). [M]

## Fees

- NOT FOUND (searched: docs home, money, place-bet, common-patterns, FAQ, glossary, OpenAPI text). OpenAPI contains fee-earner/creator-fee endpoints, so creator/referral fees exist but rates are not documented. `protocol-stats.totalFees` was 0 on testnet. [H for the 0; rest NOT FOUND]

## Resolution mechanism and dispute risk

- Docs: "Automated settlement", bot-driven lifecycle, a contest period (`contestPeriodEndTime`, `initialWinningOption`, `finalWinningOption`, `hasContests`, `getContests` endpoint), curator role for leagues; settlement via `BentoSettlementFacet`. [M: README + live row fields + public methods; the resolution rules themselves are not documented in docs.bento.fun]
- Resolver identity (who sets the outcome): NOT FOUND. Treat as centralised/curator-or-creator driven with admin multisig governance and upgradeable Diamond proxies: high trust and dispute risk. [M]
- Cancellation path exists (`cancelReason`, refund statuses). [H live row]

## Geo, ToS, automation

- USDC stack is geo-gated: restricted regions get HTTP 403 `GEO_BLOCKED`. Credits are not. [H] money.md
- Terms: https://app.bento.fun/terms-of-service (JS-rendered; could not extract text, so jurisdiction list and bot rules NOT FOUND).
- Automation is explicitly supported for builders (SDK for "apps, bots, agents, and servers"), subject to builder-key rate limits. [H] https://docs.bento.fun/
- Developer entity per site: One Labs Inc., Panama. [H] https://bento.fun

## Liquidity (date-stamped)

- Testnet (credits + testnet USDC): protocol stats total volume 30, 37 duels, 8 users (updated 2026-04-29); platform analytics 2026-10-19: USDC stack volume snapshot 320 (testnet), credits stack 11,787 (play money). [H] fixtures
- Mainnet: Diamond holds ~100.9 USDC (balanceOf on BSC, block 128497521, 2026-10-19). [H, on-chain]. No volume/OI number found for mainnet.

## Event overlap (arbitrage relevance)

- Categories: Football, Basketball, Cricket (IPL), Formula 1, American Football, Tennis, Baseball, Hockey. [H] create-market guide; live catalog. Match-level sports markets overlap Polymarket/Kalshi/Limitless in principle, but Bento mirrors Polymarket (see above) and liquidity is negligible, so there is no executable edge.
- Liquidity shared with another venue: Polymarket pairing fields exist (`polymarketMarketId`, `polymarketVolume24h`), credits mirrors are play-money, and a Polymarket bridge/onboarding flow exists, so any price comparison against Polymarket is a signal-only mirror, not an independent leg. [M]

## Sources

- https://docs.bento.fun/ , /llms.txt , /concepts/{environments,how-bento-works,authentication,accounts,money,glossary,builder-api-key,two-hosts,mutations}.md , /guides/{place-bet,create-market}.md , /reference/{common-patterns,changelog,openapi,sdk-api/public}.md , /faq.md (all fetched 2026-10-19) [H]
- https://docs.bento.fun/openapi/markets.json [H]
- https://bento.fun (live site; Predictions/Leagues "Live", Parlays beta, no mainnet statement) [H]
- https://github.com/Bentodotfun/bento.fun-README (README.md; contract addresses, LS-LMSR, BSC) [H, last pushed 2026-01-14]
- https://github.com/Bentodotfun/build-on-bento , https://github.com/Bentodotfun/sdk-sandbox (listing only) [H]
- https://registry.npmjs.org/@bento.fun/sdk [H]
- https://internal-server.bento.fun (unauthenticated GETs, 2026-10-19) [H]
- https://bsc-dataseed.binance.org/ (eth_getCode, eth_call, read-only) [H]
- Web search was unavailable (session budget exhausted), so no third-party coverage, audits or TVL aggregator data checked. [gap]

## Open questions

- Mainnet markets-host URL and whether any mainnet read API is public.
- Fee schedule and who resolves outcomes / dispute process.
- Mainnet trade volume and active market count (no source found).
- Whether a Base deployment exists.
- Terms of service content (geo list, bot policy).
