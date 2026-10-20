# Legend Stake (legendstake.com) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. Legend Stake is a yield-prize "no-loss" lottery-style product, not a price-discovery market. Payout is only the Aave yield on the pool (a few dollars per $1,000 over weeks), so there is no tradable price that can be compared with Polymarket/Kalshi, and no arbitrage leg. It also has no public API, no active pools as of today, and no secondary market. At most it is a weak "crowd distribution" signal for football outrights, and even that has no live data right now.

## Liveness (2026-10-19)

- Site is up (HTTP 200) but the home page renders "No active pools yet" and the embedded data has `active.pools = []` [H: https://legendstake.com/].
- Finished pools: pagination total 13 (3 pages); page 1 shows 5 pools, all Base (chainId 8453), season 2025, created 2025-10-20, ending 2026-05-13 to 2026-05-30 (Süper Lig, Premier League, Serie A, La Liga, UEFA Champions League outright winner) [H: embedded RSC payload of https://legendstake.com/, fixture docs/research/fixtures/legend-stake/home-rsc-pools-2026-10-19.json]. Pages 2-3 not retrieved (server action, not a public URL).
- So: product exists, last markets ended 2026-05-30, nothing for the 2026/27 season more than 4 months into it. Treat as dormant. Footer says (c) 2025 Legends Forever LLC [H].
- Prediction Index lists "Legend" on Base, status live, linked to legendstake.com and @belegends_ok, volume n/a, TVL none [H: https://predictionindex.xyz/ecosystem]. That listing is evidently not checked against actual activity.
- Relationship to the older LEGEND-token product: stake.belegends.com (Match Staking / Time-locked Staking with the $LEGEND token on Base, token listed 2025-01-15) shows the same company name "Legends Forever LLC" in its footer but does not mention legendstake.com or USDC no-loss pools [H: https://stake.belegends.com/docs/token]. In that older product most pools put a % of staked $LEGEND at risk (some pools have 0% contribution) [H: https://stake.belegends.com/docs/match-staking]. CoinGecko "Legend" token = that token, not this no-loss product [M]. Do not conflate them.

## Kind and market model [H unless noted]

- Kind: onchain-other. No-loss yield-redistribution pool ("no house").
- Market type: categorical, one pool per competition outright (e.g. "UEFA Champions League winner", 36 teams; league winner pools with 18-20 teams). Docs also mention single match pools (HOME/AWAY/DRAW) and "which team ranks first by end of September", but the only on-chain/DB pools seen are league-winner pools [H: https://legendstake.com/docs, fixture].
- Mechanism: parimutuel on yield only. Users stake USDC on one or more teams; the whole pool is supplied to Aave (docs); at resolution everyone gets principal back, and total net yield is split among winning-side stakers pro rata to time-weighted stake: `shareOfYield = yourTimeWeightedStake / totalWinningTimeWeightedStake * (grossYield - platformFees)`; `payout = principal + shareOfYield` [H: https://legendstake.com/docs/how-no-loss-works].
- Outcome tokenisation: none. A position is a per-user, per-team balance in the pool contract (`getUserPositionsAllTeams`), not a transferable token. No secondary trading, no early exit, "stakes cannot be bought/sold before resolution" [H: /docs/market-rules-and-resolution, /docs/faqs].
- "Odds"/multiplier shown in UI are derived from stake distribution only and are informational; the displayed multiplier is "the increase to the APR you would earn if you lent directly in Aave". Final multiplier snapshot at pool close (match start/pool end) [H: /docs/indicators-multipliers-and-estimates].
- Worked example from their own guide: 100,000 USDC pool for 7 days at 5% APR = ~95.89 USDC yield total; a 1,000 USDC winning stake on a 20% side earns ~4.79 USDC [H: https://legendstake.com/learn]. Docs say typical lockup 1-8 weeks [H: /docs]. The 2025/26 pools ran ~7 months (Oct 2025 to May 2026), so lockups were far longer than the docs imply [H, fixture dates].
- Implication for arbitrage: stake distribution is a poll of what depositors want to win a yield lottery, not a probability priced in dollars of payout. The "implied probability" is not at risk-neutral prices. A winner's edge is capped by yield (about 3.6-4% APR on Aave v3 USDC on Base in Sept 2026 per a third-party yield guide [L/M: eco.com USDC yield article surfaced by search, not opened]).

## Chains and collateral [H]

- Chain: Base (8453) only, in the pools seen. Docs: "Current Support Network: Base, Token: USDC, Markets: a limited set of soccer markets" [H: /docs/how-no-loss-works]. Home page copy says "Each competition shows its own network, asset, and yield provider", and the frontend code has branches for a second Aave data-provider address (another chain) and a Morpho vault APY endpoint (`/api/morpho/vault-apy`, `api.morpho.org/v1/vaults-v2/`), so multi-chain / Morpho-backed pools are planned or coded but not seen live [M: frontend JS inspection].
- Collateral: native USDC on Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (flagged `isAaveAsset: true`) [H: fixture]. Gas in ETH on Base.
- Yield: Aave (Base). Principal risk is smart-contract, Aave, USDC depeg and chain risk; docs say "not a guarantee" [H: /docs/safety].

## Read API

Exists: **none official/public** (on-chain plus an app-internal server action only).

- Docs index (legendstake.com/docs and sub-pages: how-no-loss-works, getting-started, market-rules-and-resolution, indicators-multipliers-and-estimates, place-a-stake, claims-and-settlement, safety, responsible-use, faqs, contact-support) contains no API, SDK, subgraph, websocket or rate-limit section [H: read all; the page-level fetch listed no API content]. NOT FOUND (searched: legendstake.com docs and learn pages, home HTML and JS bundle for REST/GraphQL hosts, web search "Legend Stake API"). There are no github.com links on the site.
- Pool list for the UI comes from a Next.js server action returning `{active:{pools,pagination}, finished:{pools,pagination}}` with fields id, chainId, address, feePercentage, end (unix), description, leagueName, season, token, teams[]. It is embedded in the home HTML (RSC payload) for page 1 only. This is an undocumented internal interface, must not be a dependency. Its backing service is not exposed (logo CDN `cdn.leverade.com` hints at a vendor, M).
- On-chain reads (the only robust source): per-pool contract on Base, e.g. UCL winner pool `0xb1b4aa7f4e1b6f41feed34ae9706fe8d1a7878e6`. Function signatures seen in the frontend bundle (UNVERIFIED against the deployed ABI; Blockscout API returned HTTP 403 to a scripted GET and I did not work around it): `getCompetitionSummary() -> (totalSupplied, totalYield, winningTeamId, isPoolFinalized, name)`, `getRegisteredTeamIds()`, `getTeam(id) -> (teamName, metadata, isRegistered, isWinner, teamTotalSupplied)`, `endTime()`, `feePercentage()`, `accumulatedFees()`, `getCurrentApr()`, `getCurrentApy()`, `getUserPositionsAllTeams(user)`, `getWithdrawalAmountsAllTeams(user)` [M]. Saved to fixtures/legend-stake/frontend-abi-signatures.json.
- No public prices/books (none exist), no trades feed other than chain logs, resolution = `winningTeamId_` + `isPoolFinalized_`.
- Auth/rate limits: n/a (RPC limits only).

## Trade path

Programmatic: **on-chain only**; no order API. Flow seen in frontend: `USDC.approve(pool, amount)` (or ERC-2612 `supplyWithPermit`), then `supply(pool, teamId, amount)`; after resolution `withdraw(pool, teamId)` returns principal plus yield share [M: frontend bundle signatures; dispatch via contract address given in the call appears to be a router/helper, ambiguous]. Docs describe the same steps in UI terms: connect wallet on Base, enter USDC stake, confirm, claim [H: /docs/how-no-loss-works, /docs/place-a-stake].

PayBox reachability: **partial**. A PayBox EVM wallet on Base could propose raw contract-call transactions (approve + supply + withdraw) if PayBox allows arbitrary contract calls, but this is a custom, unaudited-by-us contract with no verified ABI and no live pools. Not worth building. Any existing PayBox "use_plugin" support for this venue: not checked (read-only task, no PayBox tools called).

## Fees [H]

- Gas on Base paid by user. Platform fee: 10% of generated yield, never principal (`feePercentage: 10` in all five pools) [H: /docs/claims-and-settlement, fixture].
- No trading fee (no trading). No deposit/withdraw fee documented.

## Resolution and dispute risk [H unless noted]

- "Outcomes are declared by authorized signers based on official league results" [H: /docs]. Pool description cites official standings (e.g. uefa.com) [H: fixture]. Centralised admin/oracle key: the signer can set the winner; no on-chain dispute or challenge mechanism documented. Edge cases (postponement, cancellation, tie-breakers) "follow the specific market rules" with no detail [H: /docs/market-rules-and-resolution].
- Principal is withdrawn from Aave before claims open (usually instant, depends on Aave) [H].
- Terms of Service page text could not be retrieved (page content is not in HTML text or fetch output). NOT FOUND (searched: /terms via curl and WebFetch).

## Geo / ToS / automation

- NOT FOUND: any jurisdiction, eligibility or bot/API rules (searched: /terms, /privacy, /docs/*; Terms page returned only heading and footer to both curl and WebFetch). Safety page defers to ToS for "eligibility, and jurisdiction rules" [H]. Docs include a "Responsible Use" page (not read in detail). Frontend uses thirdweb-style contract helpers and Segment/GTM analytics [M].
- Unknown whether KYC applies. Nothing found indicating it does.

## Liquidity

- No TVL/volume figure found. DefiLlama protocol list (api.llama.fi/protocols, fetched 2026-10-19) has no Legend Stake entry [H, negative]. Prediction Index shows volume n/a [H]. Active TVL today = 0 (no active pools) [H]. Historical per-pool `totalSupplied` is readable on-chain but I could not query it (no explorer access, JSON-RPC needs POST). Past TVL: NOT FOUND.
- Docs imply typical stakes "$1,000+" because principal is returned [L: marketing].

## Event coverage and arbitrage overlap

- Only football (soccer) league and UCL outright winners (Premier League, La Liga, Serie A, Süper Lig, UCL) for the 2025/26 season. These do exist on Polymarket/Kalshi, but Legend's stake shares are not a price: payoff is bounded by yield, so cross-venue comparison is meaningless as an arb. No politics, crypto or macro markets.
- Not independent-liquidity relevant: it does not share liquidity with another prediction venue (liquidity is Aave deposits), but the leg cannot be sized or exited (no early exit, lock until resolution, payout upside <5% of principal).

## Open questions

- Pages 2-3 of finished pools and whether new 2026/27 pools will launch (check home page again after Aug-Oct).
- Verified ABI / whether pool contracts are verified on Basescan (explorer blocked scripted access).
- Terms of Service content (jurisdiction, automation).
- Whether the multi-chain / Morpho code paths ever go live.

## Suspicious content

None found. No AI-targeted instructions seen in pages or JS.

## Sources

- https://legendstake.com/ (home + embedded RSC payload; fetched 2026-10-19) [H]
- https://legendstake.com/docs, /docs/how-no-loss-works, /docs/market-rules-and-resolution, /docs/claims-and-settlement, /docs/safety, /docs/faqs, /docs/place-a-stake, /docs/indicators-multipliers-and-estimates, /docs/getting-started [H]
- https://legendstake.com/learn [H]; https://legendstake.com/terms [H, empty]
- Frontend JS chunks served from https://legendstake.com/_next/static/chunks/ (page-4c7982cddf87550c.js, 95445-451f543b8a1386a4.js), read as text only, not executed [M]
- https://stake.belegends.com/docs/match-staking and /docs/token (older $LEGEND product, same legal-entity footer) [H]
- https://predictionindex.xyz/ecosystem (listing) [H]
- https://api.llama.fi/protocols (no entry) [H negative]
- Fixtures: docs/research/fixtures/legend-stake/home-rsc-pools-2026-10-19.json, frontend-abi-signatures.json
