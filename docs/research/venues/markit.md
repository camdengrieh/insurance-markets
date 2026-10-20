# MarkIt (markit.market) - venue spec

Researched 2026-10-19. Read-only: public pages, docs `llms-full.txt`, site JS bundle read as static text, unauthenticated GETs to documented hosts, DefiLlama and Sourcify public APIs, `gh api` reads. No account, wallet, key, signature, POST/PUT/DELETE, JSON-RPC call, PayBox tool or browser automation. Generic User-Agent only.

Tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale. Fixtures: `docs/research/fixtures/markit/`.

## Verdict

- Adapter priority: **skip** (revisit trigger at the bottom).
- Why: (1) tiny and intermittent: DefiLlama fees $6.65K all-time, $803 in the last 30 days, zero on each of the last 7 days (H), which at roughly 3% all-in fees implies about $220K lifetime and about $27K 30-day bet volume (M, my inference); (2) the venue's own public market-list API is **down** (`GET /api/markets` returns HTTP 500 on every try) and the Supabase host that backs it and the frontend **no longer resolves in DNS** (H); (3) mechanics hostile to arbitrage: no sell function (exit only by buying the opposite side), roughly 2.25% to 7% fee on every buy, centralised single-key resolution with no void outcome, per-market skew cap that limits one-sided size to a fraction of a small pool (H docs); (4) sports only (NBA, NCAAB), where Kalshi, Polymarket and others already give deeper, cheaper legs.
- Why not dead: contracts exist on Base mainnet and are Sourcify-verified (2026-04); DefiLlama recorded fees on 2026-10-03 to 2026-10-11, so bets were placed in the last three weeks; docs, site and the ESPN and Kalshi proxy endpoints respond. Status: **live but degraded / near-dormant** (M).

## Liveness (still live in 2026?)

- Site `https://markit.market` 200 and docs `https://docs.markit.market` 200 on 2026-10-19 (H). Docs home: "MarkIt is live on Base mainnet at markit.market with NBA game markets" (H).
- **Contradictory docs**: FAQ and Risk pages say "MarkIt is currently in testnet phase on Base Sepolia ... formal third-party audit has not yet been completed" while the Addresses page lists Base mainnet contracts (H). The mainnet claim is the one backed by chain evidence (Sourcify exact match on chain 8453: LpVault verified 2026-04-04, MarketFactory 2026-04-09; H). The testnet text is stale (M).
- DefiLlama (listed 2026-04-01, category Prediction Market, chain Base, no TVL series, fees only; H): daily fees begin 2026-03-06. Monthly fee USD (my sum of the daily series, H data): Mar 2,751; Apr 2,166; May 174; Jun 118; Jul 367; Aug 272; Sep 0; Oct 1-18 803 (all of it 2026-10-01 to 10-11, peaking at 157 on 10-07). Last 7 days: 0. 74% of lifetime fees came in the first two months.
- Backend breakage (H): `GET https://markit.market/api/markets?state=open|active|all` returns `500 {"error":"Failed to query markets","details":"TypeError: fetch failed"}` (3+ attempts, fixture `api_markets_http500_2026-10-19.json`). The site's own llms.txt and the JS bundle both reference Supabase project host `ocjlwdbpvxcvebbcmomb.supabase.co`, which is NXDOMAIN at 8.8.8.8 and empty at 1.1.1.1 (`supabase_host_dns_2026-10-19.txt`). Likely a deleted or lapsed Supabase project (M). Market creation (a cron using The Odds API) and the indexer may share that dependency; no fees since 10-11 is consistent with that (L, speculative).
- Team and socials: X handle differs across sources (`markit_markets` in DefiLlama and docs, `markitonbase` in HTML meta, `markitdotmarket` in the ToS), L. No news, funding or third-party coverage found (searched: WebSearch extended "MarkIt markit.market prediction market Base"). NOT FOUND: independent audit, press, TVL.

## Kind and market model

- Kind: **onchain-other**. LP-underwritten, curve-priced binary markets; one `MarketEngine` contract per market. Not an order book, not a constant-product AMM, not parimutuel (docs: "no AMM, no order book, no sell function"). Closest description: a house-banked bonding-curve market maker whose bankroll is a shared vault (H, docs What is MarkIt / Overview).
- Outcomes: strictly **binary YES/NO**, each side a per-market **ERC-20, 18 decimals**, minted on buy by the engine, freely transferable but with no DEX liquidity; winners redeem 1.00 USDC per token via `redeem()`, losers can `sweepLosing()` (H). No categorical or scalar markets (Glossary: "exclusively supports binary markets"). Example question form: "Will the Rockets beat the Hornets?" with YES = the first-named team.
- **No sell.** The only exit before resolution is buying the opposite side to lock a payout (H). This breaks the usual arbitrage unwind: a cross-venue leg on MarkIt is held to resolution.
- Lifecycle (H): Created -> Funded (min LP 1,000 USDC) -> Open -> CloseOnly (last ~1 h, only skew-reducing buys) -> Resolved -> Withdrawable. Min bet 1 USDC.
- Pricing (H, docs Pricing and Skew): `x = (yesLiab - noLiab + seed) / (pool + virtualLiquidity)`, `pYes = clamp(0.01, 0.99, 0.5 + 0.5*x/(0.30 + |x|))`, `pNo = 1 - pYes`. A buy is split into 16 steps, each repriced, so large orders pay a rising price. Mark prices sum to exactly 1; fees are charged on top (see Fees). Operator can set a non-50/50 `seedImbalance` ("pre-game analytics"; markets created from The Odds API per llms.txt), so opening prices track sportsbook odds (H/M).
- Solvency rule: `USDC.balanceOf(engine) >= max(yesLiab, noLiab)` after every state change, plus a skew cap `|yesLiab - noLiab| <= totalLpDeposited * skewBps/10000` with skewBps in 3000-9000 (H). With a 1,000 USDC minimum seed, one-sided exposure per market can be as small as a few hundred USD (M inference); actual pool sizes unknown.

## Chains and collateral

- **Base only** (chain id 8453). Collateral native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 decimals; WAD 18 internally). Gas in ETH (H, Addresses).
- Mainnet contracts (H, docs Addresses; Sourcify exact match, runtime and creation): MarketFactory `0xB86d5c873daaD15817b424f6d55d7641DAbb00E9`, LpVault `0x86F5f2753dAB9a97CCAE9b6F4480eE07cad257d6`. Per-market `MarketEngine` addresses come from `MarketFactory.getMarkets()` / `marketCount()` / `isMarket()` (H). Base Sepolia test deployment also published (not relevant).
- Compiler 0.8.24, EVM paris, OpenZeppelin Ownable2Step + ReentrancyGuard (H, Sourcify metadata for LpVault).

## Read API

- Official docs: https://docs.markit.market (GitBook; machine-readable at `/llms.txt` and `/llms-full.txt`) and https://markit.market/llms.txt (site-level API description). Auth: none documented for the REST routes. Rate limits: NOT FOUND (only edge-cache TTLs: 30 s markets, 10 s quote, 25 s live-scores). WebSocket: NOT FOUND.
- Documented public REST routes on `https://markit.market` (H that they are documented; status as tested 2026-10-19):
  - `GET /api/markets?state=open|active|resolved|all`: market array with `address`, `question`, `slug`, `sport`, `state` (0-5), `outcome`, `bettingCloseTime`, `yesPriceCents`, `noPriceCents`, `poolSizeUsdc`, `yesLiabilityUsdc`, `noLiabilityUsdc`, `accumulatedFeesUsdc`, `yesLabel`/`noLabel`, team abbreviations/logos and **`polymarketSlug`** (a built-in cross-venue link hint). **FAILING (HTTP 500)**; shape therefore unconfirmed live. The docs example is illustrative only.
  - `GET /api/quote?market=0x..&side=yes|no&amount=<6-dec USDC>`: `sharesOut`, `avgPrice`, `priceImpact`, `lpFee`, `protocolFee`, `builderFee`, `totalFee`, `effectivePrice`. Probe with a zero address returned 500 `Cannot mix BigInt and other types` (inconclusive).
  - `GET /api/live-scores` (ESPN NBA/NCAAB, also returned MLB rows; 200, shape confirmed, fixture `live_scores_sample_2026-10-19.json`); `GET /api/kalshi-price` (array of `{title,lastPrice,yesSubTitle,eventTicker}`, 45 rows incl. 42 `KXNBAGAME`, 200, fixture `kalshi_price_sample_2026-10-19.json`; a Kalshi proxy, not MarkIt data); `GET /api/polymarket-price?slug=` (Gamma proxy, not called).
- Documented Supabase PostgREST read path (public `markets` table) exists in llms.txt, but its host is NXDOMAIN and it needs an `apikey` header; **not used** (a credential in third-party text; the key is redacted in the saved fixture).
- **On-chain reads are the only reliable path**: factory enumeration then per-engine `getMarkPrice() -> (pYes,pNo)`, `state()`, `outcome()`, `yesLiability()`, `noLiability()`, `engineUsdc()`, `bettingCloseTime()`, `question()`, `accumulatedFees()`, `getSkewRatio()` and params (`curveA`, `baseFeeBps`, `feeK`, `minFeeBps`, `maxSkewBps`, `seedImbalance`); events `BetPlaced(user, side, usdcIn, fee, protocolFee, sharesOut, markPrice)`, `MarketResolved`, `Redeemed`, `StateChanged` (H, docs MarketEngine). Public RPC documented: `https://mainnet.base.org`. I did **not** call it (JSON-RPC eth_call is a POST; out of bounds for this task), so no live on-chain values (vault NAV, market count, pool sizes) are verified. A multicall poll is cheap for a scanner.
- SDK: npm `@markit.market/sdk` 0.1.1 (published 2026-03-24, MIT, viem-based; markets, trade, vault, builder namespaces; H via registry metadata). Docs and llms.txt disagree on package name (`@markit/sdk` returns 404 on npm). Repo links (`github.com/markit-market/sdk`, `github.com/mattybcodes/markit`) return 404 for unauthenticated `gh api` (private or removed). Source is therefore only visible through Sourcify. Not installed or run.
- Analytics: Dune dashboard https://dune.com/0xmattyb/markit renders client-side only; no numbers retrievable (query ids shown by the page fetch: 6798902, 6799621, 6801233; M).
- Docs describe a `/api/builder/attribute` route and builder API keys (`mk_live_...`); not needed for reads or for unattributed trades.

## Trade path

- Fully on-chain, permissionless at contract level: `USDC.approve(engine, amount)` then `MarketEngine.placeBet(side {YES=0,NO=1}, usdcIn, minSharesOut)` (slippage guard in WAD shares), later `redeem(shares)` after `resolve`. No off-chain order, no API key, no EIP-712 order signing (H). Builder attribution is optional ("fire-and-forget").
- Each market is a separate approval target (docs: approve "once per market"); an approval to a market is a standard ERC-20 allowance.
- Selling is not possible; vault LP side is `LpVault.deposit()` / `requestWithdrawal()` (FIFO, 4-day anti-snipe holding on mainnet; H) and is irrelevant for edge.

## PayBox reachability: **partial** (M)

- The flow is two ordinary single-call EVM transactions on Base (8453), which fits the PayBox `evm` transaction-proposal kind (one call per proposal, approve and `placeBet` as two separate proposals, EOA pays ETH gas; see `docs/research/06-paybox-platform.md` section 3, H there). No typed-data or sign-then-submit machinery is needed, and no wallet/API-key onboarding. Calldata can be built by hand from the verified ABI (the SDK's `buildPlaceBetCalls` returns exactly `[{to,data}]` for approve + placeBet).
- Why only "partial": PayBox raw-calldata display, autonomy and approval behaviour are unresolved per doc 06; PayBox's view of Base is from the earlier project check, not re-tested; and the venue's data plane is currently broken, so an agent would have to discover markets and read quotes on-chain itself. Not tested (no money tools allowed).

## Fees (taker pays; deducted from `usdcIn` before tokens are minted, H docs)

- LP fee, dynamic: crowded side `baseFeeBps + feeK*ratio` (base 100 bps, feeK 400, capped at ~5%), contrarian side `max(minFeeBps=25, base - feeK*ratio)` where `ratio = |imbalance| / (pool + virtualLiquidity)`. Stays in the pool for LPs.
- Protocol fee: flat **2% (200 bps)** to treasury; ToS says fee parameters "may be updated by the protocol admin" (H, ToS in JS bundle, last updated 2026-03-10).
- Builder fee 0.25% is carved out of the 2%, no extra to the user. Referral 0.25% likewise (llms.txt).
- All-in per buy: about 2.25% (contrarian) to 7% (crowded) of spend, about 3% when balanced. Effective cost per share is roughly `mark / (1 - fee)`: a 0.50 mark costs about 0.515 balanced. The docs' "YES 0.57 + NO 0.44 = 1.01" worked example understates this (it treats the spread as 1 cent); I believe the parameter table and the DefiLlama methodology over the example (M). Gas on Base is negligible. No fee on redeem.
- Arbitrage implication: a MarkIt leg needs roughly a 3%+ gross edge before the other venue's fee and the 16-step price impact, and cannot be unwound early.

## Resolution and dispute risk: HIGH centralisation

- Resolver: the contract `owner` calls `resolve(Outcome)` (YES or NO only; `Outcome` enum has no void/invalid value), after close time, final, no dispute window, no timelock (H, docs Resolution + MarketEngine). Operator is the MarkIt team; the project's own Claude Code review lists admin as a "single EOA" and finding H-1 "centralized resolution with no oracle, dispute period, or timelock" - the later re-audit's fix table lists eight other items as fixed and does not list H-1, so it stands as a design trust assumption (H, M on the reading). Owner address type on mainnet: NOT FOUND (no explorer or RPC access).
- Source of truth: ESPN public scoreboard API, with an auto-resolve script (H). Typical latency minutes to a few hours.
- Edge cases: postponed games stay open; cancelled games "handled case by case"; **there is no refund/void state**, so a cancelled game must be forced to YES or NO or funds stay locked, while Kalshi and Polymarket void or follow their own rules (H docs; the mismatch is my inference). If the operator never resolves, funds are locked.
- Assurance caveat: the three "audits" on the audit page (2026-02-21 and 2026-02-23) are self-published reviews labelled "Claude Code (Anthropic)"; DefiLlama shows `audits: 2` from them. The FAQ admits no third-party audit. Treat as no independent audit (H on what is published; I cannot verify who ran them).

## Geo, ToS, automation

- ToS (in the site bundle, SPA not server-rendered; last updated 2026-03-10; H): eligibility requires the user is not in "any jurisdiction where participation in prediction markets is prohibited or restricted by law"; prohibited conduct includes "Use bots or automated systems to gain unfair advantage over other users" and "Circumvent geographic restrictions or eligibility requirements"; resolution is "final and not subject to appeal". FAQ on US availability: "Access is determined by local regulations." No IP geoblock list found in the bundle (searched: restricted/prohibited jurisdiction, OFAC, geoblock). Contract-level trading is permissionless, so enforcement is by ToS only (M). The bots clause is aimed at "unfair advantage over other users"; an arbitrage bot's status is ambiguous (M). Sports event contracts carry the user's own regulatory exposure.

## Liquidity

- DefiLlama (H, 2026-10-19): fees 24h 0, 7d 0, 30d $803.38, all-time $6,651; no TVL series and no volume or open-interest dimension. Volume is only inferable (about $220K lifetime, about $27K 30d, M).
- Vault TVL, number of open markets, per-market pool size: NOT FOUND (searched: DefiLlama, Dune page, docs; chain reads not allowed). The docs' pool numbers (15,000 USDC etc.) are examples.
- Min LP to open a market is 1,000 USDC and the skew cap scales with LP capital, so per-market one-sided capacity is plausibly hundreds to low thousands of USD (M).

## Event coverage and overlap

- Categories: NBA game winners and NCAAB game winners (docs, SDK `sport: 'nba' | 'ncaab'`); a `/madness` route exists in the app (March Madness, L); MLB appears in the venue's ESPN and Kalshi proxy endpoints but is not a documented MarkIt sport (M). No politics, macro or crypto.
- Overlap for arbitrage: NBA/NCAAB moneyline exists on Kalshi (`KXNBAGAME-*`, `KXNCAAMBGAME-*`; 45 open rows seen in the proxy), Polymarket, PRED, Limitless and others. Because MarkIt prices from an operator seed plus a flow-driven curve, its quote is a weak signal (sportsbook-seeded, then flow-skewed) and a lagging, expensive tradable leg.
- **Shared liquidity: none.** Each engine holds its own USDC; the vault is MarkIt-only. It is an independent leg (H), just not a good one.
- Built-in linking hints if the API recovers: `polymarketSlug` per market and the `/api/kalshi-price` proxy.

## Revisit trigger

Re-check if (a) `GET /api/markets` returns 200 again or a new data host is published, and (b) DefiLlama 30-day fees exceed about $3K (about $100K bets) during the 2026-27 NBA season, and (c) resolution gets a timelock, multisig or void path. Even then only a read-only on-chain adapter (factory enumeration + `getMarkPrice`) is worth building; do not plan execution.

## Open questions

- Is `owner` an EOA or a multisig, and who is the treasury? (needs explorer or RPC read)
- Current vault NAV, active market count and pool sizes. (needs RPC multicall; excluded here)
- Does the production frontend still list markets with the Supabase host gone, and are 2026-27 season markets being created?
- Exact in-contract fee and piecewise rounding: only LpVault source was read from Sourcify; the MarketEngine source (verifiable per engine address) was not.

## Sources

- https://markit.market (H; noscript block lists the public API, contract addresses)
- https://markit.market/llms.txt (H; API, parameters, Supabase note; anon key not reproduced)
- https://markit.market/.well-known/ai-plugin.json (H)
- https://docs.markit.market/llms.txt and https://docs.markit.market/llms-full.txt (H; all doc pages, 2026-10-19 fetch)
- https://markit.market/assets/index-CMpEKH4F.js (H; static text for ToS, route list, Supabase host)
- https://api.llama.fi/protocol/markit and https://api.llama.fi/summary/fees/markit (H; fees series, methodology)
- https://sourcify.dev/server/v2/contract/8453/0xB86d5c873daaD15817b424f6d55d7641DAbb00E9 and `.../0x86F5f2753dAB9a97CCAE9b6F4480eE07cad257d6` (H)
- https://registry.npmjs.org/@markit.market%2Fsdk (H; publish dates)
- https://dune.com/0xmattyb/markit (H that it is not server-rendered)
- WebSearch extended, "MarkIt markit.market prediction market Base LP vault NBA" (M; only the venue's own pages surfaced)
- Blocked or unavailable: Blockscout and BaseScan (Cloudflare challenge), GitHub repos `mattybcodes/markit` and `markit-market/sdk` (404), Supabase host (NXDOMAIN).
