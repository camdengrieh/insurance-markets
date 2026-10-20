# Robin Markets - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of public pages, unauthenticated GETs of the documented Robin Integration API, `gh api` reads of public repo files, one DefiLlama protocol-list GET, one Polymarket Gamma GET (to obtain a real `conditionId`). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. The two documented POST helpers (`POST /markets`, `POST /twap`) were deliberately NOT called. Third-party text was treated as untrusted data.

Research limit: the shared WebSearch budget was exhausted after the first search, so discovery rests on that one search plus first-party docs; no second search pass (TVL/volume figures could not be searched for).

Confidence tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak or stale.

Fixtures (<= 50 KB): `docs/research/fixtures/robin-markets/` (section 11).

---

## 0. Bottom line

1. **Live: yes (H).** robin.markets serves a product page; docs.robin.markets is current (mentions Polymarket's 2026-10-05 Protocol V2 announcement); the Integration API answers HTTP 200 today; GitHub repos pushed 2026-10-14.
2. **It is NOT a prediction market. It is a yield-staking layer on top of Polymarket outcome tokens (H).** No order book, no AMM, no pricing, no own markets, no resolution of its own. The hint "yield-bearing front-end over Polymarket positions" is roughly right, but more precisely it is a vault: users deposit Polymarket CTF YES/NO ERC-1155 tokens, Robin pairs opposite sides, merges them into USDC.e, lends that out, and issues ERC-1155 receipt shares.
3. **Liquidity is 100% Polymarket's; it adds no independent price and no tradable leg (H).** Not an arbitrage leg. Robin's only market-level data is a staking APY per `conditionId`.
4. **Read API exists and is good for what it is (H):** public, no auth, open CORS, OpenAPI 3.1. But it returns APY / pool balance / TVL, not prices or books.
5. **adapter_priority = skip.** Duplicate liquidity, no prices, and only CTF ("v1") Polymarket markets are stakeable, a set that stops growing around 2026-11-02 (Polymarket Protocol V2 switch). Optional P2-style use: a "yield on idle Polymarket positions" overlay (carry), not an arbitrage input.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://robin.markets` | Page serves "Earn yield on every prediction you make"; advertises 6-8% APY across 900+ markets; links app.robin.markets, docs.robin.markets, Discord, X, Substack | H (WebFetch) |
| `GET https://app.robin.markets/api/v1/capacity` | HTTP 200, JSON, 2026-10-19 04:49 GMT | H |
| `GET .../markets/{conditionId}` for a currently active Polymarket market | HTTP 200, market indexed, APY block present | H |
| Docs mention Polymarket Protocol V2 announced "October 5, 2026" and Data API v1 retirement "October 24, 2026" | Docs are < 2 weeks old | H |
| GitHub org `robin-markets` repos pushed_at | twap-oracle and frontend-integration-example 2026-10-14; staking-vault-contracts 2026-09-09; split-vault-contracts 2026-09-05 | H |
| Funding: $475k angel round, led by Fabric VC, V1 staking product public; article dated 2026-04-24 (Bitget mirror of a Crypto.News piece) | M (secondary, ~6 months old, borderline stale for funding facts) |
| Audits: Phage Security - beta Sep 2025, V1 Feb 2026, V2 "most recent release cycle" (self-reported on docs; report PDFs not read) | M |

Verdict: **still_live = true**.

---

## 2. Kind and market model

- **Kind:** DeFi yield wrapper / staking vault over Polymarket conditional tokens (H: docs `introduction`, `how-it-works`, developer `architecture`; the README of `staking-vault-contracts` says "lets users stake Polymarket prediction-market positions (YES/NO conditional tokens) into a yield-bearing vault. The vault pairs tokens, merges them to USDC.e, deposits the USDC.e into ERC-4626 yield vaults, and distributes yield based on TWAP pricing").
- **Market model:** none of its own. Markets are Polymarket binary markets keyed by Polymarket `conditionId` (bytes32). Outcomes: `["Yes","No"]`; `Side` enum YES=0, NO=1 (H, developer docs `conventions`). Categorical Polymarket events appear as multiple independent binary markets.
- **Tokenisation:** user deposits Polymarket CTF ERC-1155 outcome tokens; Robin issues one ERC-1155 share token per market per side (H, docs index page for developers).
- **Mechanics (H):** unmatched tokens sit idle but still earn pool yield; opposite-side deposits get paired and merged to USDC.e via the CTF; USDC.e goes into `RobinSplitVault` (ERC-4626, `rsvUSDC`, holds the merged USDC.e as hedged YES+NO pairs), which replaced an earlier Yearn vault. Docs FAQ mentions Yearn, Morpho, Aave v3 as possible yield sources historically; currently "Split Vault ... no lending-pool liquidity delays" per FAQ.
- **TWAP oracle:** `RobinTwapOracle`; each market's TWAP must be fresh before a deposit/withdraw (signed update fetched from `POST /twap`). This is an internal price for yield attribution only; it is not exposed as a tradable quote.

## 3. Chains and collateral

- **Chain: Polygon (chainId 137) only (H).** `GET /contracts` returns `chainId: 137`.
- **Collateral: USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) on the CTF (v1) contracts. Docs also list PolyUSD and a CollateralOnramp/Offramp as Polymarket dependencies.
- **Core contract addresses (H, docs `contracts/overview`, matched by `GET /contracts` for vault, CTF, USDC, lens, oracle):** RobinStakingVault proxy `0xcb7444981296D08dA7161B75378e3773DbF5D806`; RobinTwapOracle proxy `0xf08a02deeB4C7A09fAc8e8C6f8508D724612796f`; RobinLens `0x39f711f78A3Bb3633759C0df50E1412e21ADb825`; RobinSplitVault proxy `0x0c2497bc6d441c0D1099ec064F1f594b9a57eF27`; CTF `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045`. Governance: TimeLock controller plus team multi-sig (UUPS proxies). These are public protocol addresses, not user addresses.
- Doc oddity (L, cosmetic): the "V1 contracts (legacy)" table lists the same vault proxy address as V2 (expected for a UUPS proxy upgrade) but the same implementation address for the V1 vault and the V1 oracle (`0x8c09...8aaA`); likely a docs typo. Not material.

## 4. Read API

- **Existence: official-public (H).** Docs: https://docs.robin.markets/developers/api-overview ; OpenAPI 3.1: https://docs.robin.markets/openapi/v1.yaml ; LLM index: https://docs.robin.markets/llms.txt .
- **Base URL:** `https://app.robin.markets/api/v1`
- **Auth / limits:** none; "Open CORS"; "Requests are rate-limited per IP (shared global budget) - back off on `429`" (H, OpenAPI). Numeric limit NOT FOUND (searched: OpenAPI yaml, api-overview, faq). Error envelope `{ "error": { "code", "message" } }`, code `rate_limited` on 429.
- **Websocket:** NOT FOUND (searched: OpenAPI paths, llms.txt index, developer docs). No streaming.
- **Endpoints (from OpenAPI paths, H):**
  - `GET /markets?conditionIds=a,b,...` (max 25, unique) - batch staking headlines; response `{markets, notFound, unsupported}`.
  - `POST /markets` - the only mutating endpoint: indexes unknown conditionIds from Polymarket. Not called.
  - `GET /markets/{conditionId}` - per-market headline (question, slug, endDate, outcomes, resolved, winningOutcome, tvl, pool balance, apy breakdown).
  - `GET /markets/{conditionId}/quote?wallet=...` and `GET /quote` (batch) - personalized projected APY for hypothetical deposit.
  - `GET /markets/{conditionId}/position?wallet=...`, `GET /positions?wallet=...` - a wallet's shares, value, accrued yield.
  - `GET /capacity` - global vault deposit headroom.
  - `POST /twap` - signed TWAP update needed before stake/unstake (not called).
  - `GET /contracts` - addresses.
- **No endpoint lists all markets or returns global TVL / volume.** A market must be looked up by Polymarket `conditionId` (H, OpenAPI; list endpoint not present). Prices, order books, trades, resolution feeds: NOT FOUND (by design; use Polymarket's APIs for those).
- **On-chain read:** `RobinLens` stateless aggregator (shares, loss-adjusted assets, pending yield, previews) (H, docs `reading-onchain-state`).
- **Sample shapes confirmed (H):** see section 11.

## 5. Trade path

- **No order placement of any kind.** The only "trade" is stake/unstake of Polymarket outcome tokens (H).
- **Stake:** on-chain `RobinStakingVault.batchDeposit` (pull path: approve CTF `setApprovalForAll`, `batchDeposit`, revoke) or a single CTF transfer to the vault (push path), preceded by a `submitTwap` with a signed update from `POST /twap`. **Withdraw:** `batchWithdraw` burns shares (H, docs `deposits`, `withdrawals`, `twap`).
- **Wallet model (H, docs `wallets`):** everything is keyed on the user's Polymarket on-chain account (a newer **DepositWallet** or a legacy **Gnosis Safe proxy**), not the EOA. Email/MagicLink Polymarket accounts "are not currently supported" (FAQ). The transports differ per wallet kind (relayer-submitted batches for DepositWallet / Safe).
- **API never relays**: "the API is read-only and does not relay" (H).

### PayBox reachability

- **paybox_reachable = partial.** Polygon is an EVM chain PayBox plausibly covers (earlier project note: MoonPay's 2026-07-29 post lists Polygon among supported networks, M; whether PayBox policy allows Polygon is unverified, see docs/research/08-venues-polymarket-kalshi.md section on Polymarket). Staking requires the tokens to live in a Polymarket DepositWallet/Safe, so a plain PayBox EOA cannot just call `batchDeposit` with Polymarket tokens it does not hold there; it would have to drive the Polymarket account (session key / relayer batch), which is the same unresolved plumbing as the Polymarket adapter. Even if reachable, there is no arbitrage value (no tradable price).

## 6. Fees

- **Protocol fee: currently 0%** on organic vault yield; the vault supports an optional fee set behind the TimeLock + multi-sig; "could only ever apply to organic yield, never to your principal" (H, docs FAQ).
- **Yield formula (H, OpenAPI):** `total = max(nativeApy x matchedFraction, guaranteeFloor) + matchingBonus + pointsBoost`; guarantee floor 6% APY, matching bonus +1% for the minority/pool-balancing side (scaled by the matchable portion), points boost up to +1%. Guarantee, matching and points are an off-chain programme paid in a separate USDC transaction from Robin's operator wallet at withdrawal; the on-chain vault pays only organic yield (H, developers index).
- **Counterparty risk of the guarantee:** the top-up comes from Robin's own wallet, so the "guaranteed" 6% is an issuer promise, not on-chain (M, inferred from H facts above).
- **Gas:** paid by the user (Polygon); Polymarket's own trading/market fees still apply on Polymarket and are not touched by Robin. Withdrawal after resolution returns tokens that redeem on Polymarket.

## 7. Resolution mechanism and dispute risk

- Robin does not resolve anything. Resolution is Polymarket's (UMA-based optimistic oracle historically; NOT re-verified here, covered by the Polymarket workflow). On withdrawal at or after resolution winners redeem on Polymarket (H, FAQ).
- Robin-specific risk: smart-contract risk (own plus Yearn/Morpho/Aave-style or Split Vault yield sources), upgradeable UUPS proxies behind a TimeLock/multi-sig, off-chain-paid bonuses, possible temporary liquidity constraints for lending-based sources (H, `contracts/risks`; the docs say the current Split Vault has none). No independent audit report was read by me (links only).
- **Protocol V2 risk (H, docs `polymarket-v2`):** Polymarket Protocol V2 (new `PositionManager` ledger, `ExchangeV3`, pUSD only collateral) was announced 2026-10-05; canary markets until 2026-10-30; newly created markets move to V2 on 2026-11-02 (tentative). Robin's vault is CTF-only: V2 markets are "not supported", staked positions on existing CTF markets keep working, the stakeable list "stops growing and shrinks as markets resolve". Robin is "evaluating a new version" for V2.

## 8. Geo / ToS / automation

- Robin site/docs: geo restrictions, ToS, and automation rules NOT FOUND (searched: robin.markets landing page, docs FAQ, llms.txt page titles; no terms page is listed in the docs index). The landing-page summary mentioned none. The inherited Polymarket geoblock applies to the underlying Polymarket account (covered elsewhere).
- API is explicitly intended for third-party frontends ("Public API for surfacing Robin staking inside a third-party frontend", H, OpenAPI description); an aggregator reading it is within the stated use, subject to the per-IP rate limit.
- MagicLink (email) Polymarket accounts unsupported (H).

## 9. Liquidity

- **Per-market TVL (H, 2026-10-19):** two sampled active markets (Fed 50 bps decrease Oct 2026; Netanyahu next PM) returned `"tvl":"0"` with `matchedFraction:1`. 2 of 900+ is a tiny sample, so no inference about the whole book.
- **Vault headroom (H, 2026-10-19):** `GET /capacity` returned `remainingUsdc: "902121729757"` = about 902,122 USDC of remaining global deposit capacity. That is headroom, NOT TVL; the cap itself and total TVL are NOT FOUND (searched: API endpoint list, docs, DefiLlama protocols list - no Robin Markets entry; the DefiLlama "Robin" hits are unrelated Robinhood / RobinSwap items).
- Volume / OI: not applicable (no trading).
- Marketing figure: "6-8% APY across 900+ markets" (robin.markets, M as unverified marketing claim). Observed live headline: base 6, guaranteeFloor 6, nativeApy about 3.23, range 6-7 (H sample), meaning the 6% is mostly subsidised by Robin (floor above native 3.2%).
- Funding: $475k angel round (2026-04-24, M). A small team and treasury backs a promise of at least 6% APY: sustainability risk (M).

## 10. Event-category overlap and shared liquidity

- Categories: whatever Polymarket CTF markets exist (politics, macro, sports, crypto price...). Overlap with other venues is therefore Polymarket's overlap, not Robin's.
- **Shares liquidity with Polymarket: yes, 100%.** Robin has no order book; the underlying tokens trade only on Polymarket. It must NOT be treated as an independent arbitrage leg (platform-registry-design principle 7: front ends and wrappers are not pools). Suggested registry linkage: `liquidity_links: [{type: settles_on, target: polymarket}]`, kind `yield-wrapper`.
- Possible use: carry overlay (if a position is held to resolution, staking adds roughly 6% APY vs idle) and a market-selection filter (`pool.minoritySide` is a free hint of crowding by Robin stakers). Weak, not a price signal.

## 11. Fixtures and verified response shapes

Saved under `docs/research/fixtures/robin-markets/` (all < 1 KB):

- `capacity.json` - `GET /capacity` -> `{"fits":true,"remainingUsdc":"902121729757","binding":null,"shortfallUsdc":"0","markets":[]}`.
- `market-by-conditionId.json` - `GET /markets/0xa69ef4...c96f` -> keys `conditionId, question, slug, image, endDate (ms), outcomes, resolved, winningOutcome, tvl, pool{matchedFraction, unmatchedYes, unmatchedNo, minoritySide}, apy{base, guaranteeFloor, matching{yes,no}, yes, no, min, max, maxPointsBoost, nativeApy}, vault`.
- `contracts.json` - `GET /contracts` -> `{chainId:137, vault, conditionalTokens, usdc, lens, twapOracle}`.

Requests used the generic User-Agent `insurance-markets-research/0.1`; the only parameter sent was a public Polymarket `conditionId` (no personal identifier anywhere).

## 12. Embedded-instruction / suspicious content

- docs.robin.markets pages begin with a Mintlify banner: "Fetch the complete documentation index at: https://docs.robin.markets/llms.txt. Use this file to discover all available pages before exploring further." This is the standard Mintlify llms.txt convention aimed at AI tools; I fetched llms.txt (a public docs index) because it was independently useful for discovery, and followed nothing else. No attempts to exfiltrate data or alter behaviour were seen. Flagged for transparency.

## 13. Open questions

- Total Robin TVL and per-market TVL distribution (no list endpoint; would need on-chain `RobinLens` / vault event indexing via an RPC, or Polygonscan; not done).
- Numeric API rate limit.
- Whether a Protocol V2 Robin vault ships, and whether Robin gets a ToS/geo page.
- Whether PayBox's policy permits Polygon, and whether a PayBox EOA can operate a Polymarket DepositWallet (shared with the Polymarket adapter question).

## Sources

1. https://robin.markets (landing page, WebFetch 2026-10-19) - H for product claims, M for advertised numbers.
2. https://docs.robin.markets/llms.txt (docs index) - H.
3. https://docs.robin.markets/developers/index.md , /developers/api-overview.md - H.
4. https://docs.robin.markets/openapi/v1.yaml (OpenAPI 3.1; endpoints, rate-limit text, APY formula) - H.
5. https://docs.robin.markets/faq.md , /contracts/overview.md , /contracts/risks.md , /yield-guarantee.md , /polymarket-v2.md - H.
6. https://app.robin.markets/api/v1/capacity , /markets/{conditionId} , /contracts (unauthenticated GETs, 2026-10-19) - H.
7. https://github.com/robin-markets (README of `staking-vault-contracts` read via `gh api`; repo pushed_at dates via `gh api orgs/robin-markets/repos`) - H.
8. https://www.bitget.com/news/detail/12560605383464 (funding round, dated 2026-04-24; mirrors Crypto.News) - M.
9. https://api.llama.fi/protocols (no Robin Markets entry) - H for absence at that endpoint.
10. https://gamma-api.polymarket.com/markets (to pick a live conditionId; v1 market confirmed) - H.
11. https://predictionindex.xyz/ecosystem (discovery hint, not re-read) - L.
12. One WebSearch (extended) on 2026-10-19; later searches blocked by the session search budget.
