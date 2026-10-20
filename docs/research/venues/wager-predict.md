# Wager Predict (BNB Smart Chain) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs (curl with the generic research User-Agent), WebFetch/WebSearch, `gh api` raw file reads, PayBox `discover_tokens` (metadata only). No wallet connection, no signing, no POST/PUT/DELETE, no JSON-RPC (it is an HTTP POST, so on-chain state was NOT read directly; see section 9).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party and venue text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/wager-predict/` (6 files, each <= 4 KB).

## 0. Verdict

**adapter_priority: skip** (revisit when a public API ships and DefiLlama TVL is sustainably > $50K).

1. **Deployed but dormant (M/H).** The whitepaper says the contracts went live on BSC mainnet on 2026-10-05 as an invite-only beta with markets listed by the team's Safe. DefiLlama shows the only trading burst on 2026-10-09..12 (all-time platform fees $657.04) and **TVL = $0 and fees = $0 every day since 2026-10-13**, so no market holds collateral right now. The public marketing pages (how-it-works, roadmap, token, app text) still say "BSC Testnet (Ch. 97), mainnet Q3 2026".
2. **No API.** Official docs: "public REST + WebSocket API" is a Q4 2026 roadmap item. Only an on-chain reader (events + view calls on verified contracts) is possible today, and the ABI could not be fetched here.
3. **Structurally unattractive for arbitrage**: 2.0% fee on every buy and every sell (gross), tiny creator-funded LMSR depth (default b = 866, about $600 seed), permissioned resolution (the team's 2-of-3 Safe is proposer and arbiter), and no external oracle.
4. Independent liquidity (own LMSR per market), but there is effectively none. Not a duplicate of any other venue.
5. A PayBox EVM wallet on BNB Smart Chain could in principle send the approve/buy/claim transactions (BSC is in the PayBox catalog), but the function ABI and the USDC to USDW deposit path are unverified.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site up, docs up | `https://wagerpredict.com/` and `https://docs.wagerpredict.com/` return 200 on 2026-10-19; sitemap lastmod 2026-10-14 | H |
| Whitepaper header | "LAST REVISED 5 OCT 2026 V1.0" (table of contents banner reads "TECHNICAL V0.9") | H |
| Mainnet deployment claim | "BSC Mainnet (chainId 56), deployed 5 October 2026"; "invite-only beta"; "markets listed by the governance Safe" (docs roadmap + Appendix B) | H (claim), M (truth) |
| DefiLlama listing | slug `wager-predict`, id 8895, category Prediction Market, listedAt 2026-10-06 17:39 UTC; adapters start 2026-10-05 | H (`api.llama.fi/protocol/wager-predict`) |
| DefiLlama TVL series (USDW in SpotEngine + Vault + ResolutionModule) | 2026-10-10 $11.4K; 10-11 $11.4K; 10-12 **$123.4K** (122,684 USDW); 10-13 through 10-18: **$0**, `tokens: {}` | H (data), M (interpretation) |
| DefiLlama fees (increase in `FeeRouter.totalPlatformFees()`) | 10-09 $0.13; 10-10 $6.91; 10-11 **$636**; 10-12 $14; 10-13..18 $0. All-time $657.04; 7d $14; 24h $0 | H (data) |
| USDW token on BSC (`0xe5eB...0D43`) | created 2026-10-09 (PayBox `created_at` 1791574360), 304 holders, pool USDW/USDC liquidity about $4.6K, 24h volume $0 | H (PayBox discover_tokens, GeckoTerminal) |
| Medium blog | last post 2026-10-06 "USDW: one dollar for the whole Wager Predict ecosystem" ("Every market on Wager Predict is now denominated in USDW") | H |
| Public marketing pages still say testnet | `/how-it-works` (live GET 2026-10-19): "Auto-switches to BSC Testnet... Currently live on Testnet (Ch. 97). Mainnet beta is scheduled for Q3 2026 after audit."; `/roadmap`: "LAST UPDATED JUNE 2026", mainnet beta still PLANNED; `/token`: "Trade the testnet now" | H |
| App bundle | public JS has a network dropdown with the text "Separate testnet. Switching reloads with that chain's markets." (mainnet + separate testnet) | H |
| `/markets` and `/app` | render "0 MARKETS ... LOADING" server-side (client-fetched); homepage stats show "N/A" volume / trades / markets | H |
| Homepage demo content | Spain vs Saudi Arabia World Cup card, "BTC above $90K by Friday?", top traders `0xA4...3F1 +$48.2K`: static marketing mock content, not market data | M |
| Self-reported scale (X, via search summary) | "40K+ wallets, $380M+ volume", renamed from Predict Protocol ($PRED to $WP); TGE "August 2026" not confirmed to have happened. Testnet airdrop farming makes these testnet numbers | L |

Conclusion: contracts exist on BSC mainnet and saw a few days of trading in 2026-10-09..12; since 2026-10-13 nothing is deposited. Treat as **brand-new, invite-only, effectively idle**. The marketing site and the whitepaper disagree about whether mainnet exists at all.

## 2. What it is

- **Kind**: onchain-other (BNB Smart Chain). Non-custodial LMSR automated market maker, no order book. Chain id 56.
- **Market model (H, whitepaper sections 5-9, 19)**: binary YES/NO only today. Multi-outcome, scalar and conditional "will be deployed as separate contracts" (not live). Per market: question hash (keccak256, text off-chain), `endDate`, creator, `templateId`, `resolutionSourceId`, liquidity parameter `b` (500 to 100,000; self-serve default 866).
- **Pricing (H)**: LMSR cost `C(q) = b ln(e^{qA/b} + e^{qB/b})`; price is the softmax, YES + NO = 1 exactly. Each side's shares redeem for 1 USDW if it wins. Seed `b ln 2` USDW paid by the creator (max subsidy loss; about $347 at b=500, about $600 at b=866). Buy/sell both go through the curve. Shares are 18-decimal, USD amounts 6-decimal.
- **Tokenisation**: per-user shares are stored in `SpotEngine` ("curve reserves and per-user shares live in SpotEngine"). An `OutcomeToken` contract is deployed (`0x3D0f...68cB`) but the docs do not say whether shares are ERC-20/ERC-1155 transferable. The stale how-it-works page says "tradeable BEP-20 share balances". Unverified. (H for storage claim, NOT FOUND for token standard.)
- **Lifecycle (H)**: Submitted -> InReview -> Listed (team Safe approves) -> optional Graduated -> Resolving (permissionless after end date) -> Resolved or Void -> Closed. Trading stops at `endDate`; `claimWinnings` always works even when paused.
- **Not live (H, docs)**: leverage (`NoLeverage` gate wired), $WP token/TGE/buyback, order-book tier (`ExchangeSettlement`, `LmsrAsMaker`; migration blocked by `MigrationDisabledGate`), multi-chain, permissionless resolution, public API.
- **Contracts are not upgradeable** (no proxy). Pause guardian = governance Safe can stop `buyShares`/`sellShares` instantly.

## 3. Chains and collateral

- Chain: BNB Smart Chain mainnet (56). Gas in BNB. (A separate BSC testnet, id 97, v1 contracts retired.)
- Collateral: **USDW** `0xe5eBE2AE0a036C955bfF58291826C50F7d670D43`, 6 decimals, "wrapper pegged 1:1 to USDC". Deposit asset is Binance-Peg USDC `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` (18 decimals). (H, docs section 20 + Medium 2026-10-06.)
- **Collateral trust caveat (H/M)**: the site's `/transparency` page and its JSON feed show USDW supply 202,545.41 vs "USDC held in reserve wallets" 203,772.52 (backing 100.61%, snapshot 2026-10-18 14:48 UTC). The reserve is two wallets (`0x255e...d397` holds essentially all of it), and the page says "Reserve figures are provided by the USDW issuer". The docs speak of "the USDW issuer" and "the ecosystem's wrapper", and the issuer service sits behind a bearer-token API (`public.wagerpredict.com/usd/api`, 401 `missing_bearer_token`). So USDW appears to be an **issuer-run IOU backed by USDC in team-controlled reserve wallets**, not a trustless on-chain wrapper. That conflicts with "non-custodial in the strict sense" (whitepaper section 36), and it means deposit/withdraw (USDC <-> USDW) may depend on the issuer. Whether the reserve wallets are EOAs or contracts was not checked (no RPC). Rated M.
- Other tokens named `USDW` exist on BSC (at least four, found via PayBox search); always pin the address.

## 4. Read API

| Surface | Status | Tag |
|---|---|---|
| Official public market API (REST/WebSocket) | **NOT FOUND**. Docs: "A public API is listed as a Q4 2026 roadmap item" (roadmap: "Public REST + WebSocket API, embedded-market widget SDK" in "Cross-chain & API Q4 2026"). | H |
| Docs | `https://docs.wagerpredict.com/` is a single-page whitepaper (no OpenAPI, no `/llms.txt`: 404). Sitemap lists only the marketing pages. | H |
| Indexer behind the frontend | Backend "Express/TypeScript" writes to Supabase (Postgres); the Next.js frontend reads it through "a REST API layer that mirrors the event model". Described as an internal cache, not a product API. The endpoint was not called or reverse-engineered (undocumented, would be unauthorised use). | H (doc), not tested |
| Only public JSON feed | `GET https://public.wagerpredict.com/usd/api/chains/56/transparency` (linked from `/transparency` as "Transparency feed (JSON)"). Returns USDW supply + reserve balances. Rate-limit headers: `x-ratelimit-limit: 600` (window not stated), CORS credentials allowed. Other paths under that host: `/` 404, `/usd/api` 401 bearer required. Fixture `public_transparency_feed_2026-10-19.json`. No market data. | H |
| GitHub / SDK / subgraph | NOT FOUND (searched: wagerpredict.com and docs footers/links - no GitHub link; `gh api search/repositories` returned nothing relevant; Terms say "on-chain contracts are released under a permissive open-source licence" but no repo is linked). | M |
| On-chain | Contracts "verified on BscScan"; ABIs there. Events documented in Appendix A (below). BscScan returned 403 to WebFetch; Etherscan v2 free tier rejects chain 56 ("Free API access is not supported for this chain"), so the ABI was not retrieved. | H (events), NOT FOUND (function ABI) |
| Websocket | NOT FOUND (planned with the Q4 API). On-chain `eth_subscribe` logs would be the substitute. | M |

**Events documented (H, Appendix A)**: `MarketRegistry.MarketSubmitted(id, creator, templateId, resolutionSourceId, questionHash, endDate, b, seed, validityBond)`, `MarketListed(id, featured)`, `MarketResolving`, `MarketResolved`, `MarketVoid`, `MarketClosed`; `SpotEngine.MarketInitialized(id, b, seed, endDate)`, `SharesBought(id, buyer, side, usdcIn, shares, newPriceYes)`, `SharesSold(id, seller, side, sharesIn, netOut, newPriceYes)`, `Claimed(id, user, paid6)`; `ResolutionModule.Proposed/Disputed/Finalized/DisputeResolved`; `FeeRouter.FeesRouted/PlatformFeeBooked`. The frontend reads `getOdds`, shares and `netSpent` straight from contracts via multicall3.

**Practical read recipe if ever built (M)**: index `MarketSubmitted`/`MarketListed` to enumerate, `SharesBought/Sold.newPriceYes` for price history, and call the SpotEngine view for odds/reserves; question text exists only off-chain (hash on-chain), so cross-venue linking needs the team's market text from the frontend/indexer, which has no public contract.

## 5. Trade path

- **No signed-order / CLOB path.** Every trade is a direct on-chain transaction from the user's wallet ("all chain writes are signed in the user's wallet"): (1) `USDC.approve(<wrapper/USDW>)`, (2) deposit USDC to mint USDW ("single transaction after a one-time approval"), (3) presumably `USDW.approve(SpotEngine)` (not documented), (4) `SpotEngine.buyShares(...)`, later `sellShares(...)` / `claimWinnings(...)`. Function names `buyShares`, `sellShares`, `claimWinnings`, `createMarketSelfServe`, `propose`, `dispute`, `finalize` are named in the docs; **argument lists, slippage parameters (min shares out) and the deposit/wrapper entry point are NOT FOUND** (docs give events only; ABI on BscScan not retrievable here).
- No gasless/meta-transaction or sponsor path is documented. Gas is BNB.
- Leverage via `LeverageVault`/`BetProxy` is not live.
- Pausable: `buyShares`/`sellShares` can be paused by the Safe at any time; `claimWinnings` cannot.
- MEV: docs concede sandwich risk; no private-mempool route mentioned.

**PayBox reachability: partial.**
- BNB Smart Chain (eip155:56) is in PayBox's chain catalog (H, `discover_tokens mode=chains`, 2026-10-19, 11 chains incl. Ethereum, Base, Arbitrum, OP, Polygon, BSC, Solana). The tool notice says the catalog is "metadata, not a support allowlist".
- A granted EVM wallet could submit `io.paybox/transactionProposal` EVM calls (one call per proposal per earlier repo research `06-paybox-platform.md`): approve, deposit, approve, buy, claim = several sequential, non-atomic proposals, each needing BNB for gas. That is workable for a manual/low-frequency flow, poor for fast arbitrage.
- Blockers: unverified ABI, unverified USDC to USDW mint/redeem route (may need the issuer service), uncertain geo/eligibility, and no liquidity to justify the work. No signed-order route exists, so `request_wallet_sign` is not the mechanism here.

## 6. Fees (H, whitepaper section 10, revised 2026-10-05)

- **2.0% of gross USD on every buy and every sell**, split: 1.0% platform (Safe treasury), 0.1% creator (lifetime), 0.8% "depth" (stays in the market, grows `b`), 0.1% LP. For a buy of `x`: `0.98 x` goes into the LMSR cost function. Governance cap: total at most 5%, changeable only through the 3-hour timelock.
- Claim of winnings: no fee stated (silence, not confirmed).
- **Conflicting numbers on the marketing site (stale)**: `/how-it-works` shows 0.6% platform / 0.4% creator / 0.8% depth / 0.2% LP (still 2%); homepage and `/markets` say "creator earns 0.4% of volume" and "Your fee on every trade 0.50%". The whitepaper is newer (2026-10-05) and is used here. Exact on-chain values live in `ProtocolConfig` (`0x3Ea6...685c`), unread.
- Implied lifetime volume from DefiLlama fees: $657.04 / 1.0% is about $65.7K (or about $110K if the platform slice were 0.6%). (M)
- Arbitrage cost: buying here costs about 2.04% over mid (price/0.98) plus LMSR slippage, and exiting early another 2%; a hold-to-resolution leg pays the fee once. Edge must exceed that plus the resolver basis risk.
- Depth: moving the YES price from 50% to 60% on a default b = 866 market costs about `b ln(0.5/0.4)` = about $193 of net USDW (M, derived from the docs' cost function), i.e. a few hundred dollars of depth per market at most.

## 7. Resolution and dispute risk (H, sections 14, 24, 25)

- No external oracle. **Propose -> dispute -> finalize** in `ResolutionModule`. After `endDate` the resolver (role held by the **2-of-3 governance Safe during the beta**; permissionless resolution is off) proposes with a bond of at least $20 or 0.05% of stake. Anyone may dispute within 12h (small) to 48h (large stake) by posting 50x the bond. **A disputed proposal is arbitrated by the resolver role itself** - the same Safe - so the dispute layer is not independent. If nobody disputes, a false outcome finalises.
- Unresolvable markets are **voided; each share redeems at the YES/NO price at the moment of void** (the docs' how-it-works says traders "reclaim exactly what they net-spent"; the whitepaper's price-at-void rule is the newer one). Void-at-price is not a refund at cost and creates asymmetric P&L.
- Market text is off-chain (on-chain only `questionHash`), resolution sources are referenced by id; market creation is currently reviewed and listed by the Safe, so the market set is curated by the team.
- Contract risk: Whitepaper section 32 says mainnet "is gated on a third-party audit" (Trail of Bits / OZ / Spearbit / ChainSecurity named as candidates) and a bounty "post-audit"; the docs roadmap marks "Audit complete" with a check; the Terms (updated 2026-04-20) say "audited smart contracts"; DefiLlama lists `audits: "0"`; the June 2026 roadmap lists the audit as planned. **No audit report found** (searched docs, site, Medium RSS). Treat as unaudited. (H for each statement, conflict unresolved.)
- Arbitrage consequence: high basis risk versus venues that resolve via UMA/CFTC-regulated sources; do not hold a paired position through resolution unless the question text is identical and the Safe's resolution is trusted.

## 8. Geo, ToS, automation

- Terms of Service (last updated **2026-04-20**, so over 5 months old, aging): users must not be "a resident of, or located in, any country or territory where the use of prediction markets, on-chain derivatives, or similar products is restricted or prohibited"; "We may, at our discretion, block access from specific jurisdictions." Conduct clause bars wash trading, spoofing, "coordinated behaviour", and attempts "to probe, scan, or exploit vulnerabilities outside of our public bug bounty". Liability capped at USD $100. No explicit bot/API/automation clause (none found).
- Whitepaper section 37: protocol "does not target residents of jurisdictions where prediction markets are classified as regulated instruments"; "each user is responsible". No geo-block mechanism documented. Medium (2026-06-14): "no geographic restrictions". The contracts themselves are permissionless; the frontend may geo-block.
- `robots.txt` on the main site disallows `/admin`, `/api-admin`, `/r/`, `/app/market/`, `/app/u/` for generic agents.
- Outside counsel review "will be published in a companion memo" (not found).
- Risk disclosure and contract immutability: no upgrade proxy, but the Safe can pause trading.

## 9. Liquidity (dated)

| Metric | Value | Source | Tag |
|---|---|---|---|
| DefiLlama TVL | $0 on each day 2026-10-13..18 (last point 2026-10-18 20:54 UTC); peak $123.4K on 2026-10-12 | `api.llama.fi/protocol/wager-predict` | H |
| DefiLlama all-time platform fees | $657.04 (24h $0, 7d $14, peak day $636 on 2026-10-11) | `api.llama.fi/summary/fees/wager-predict` | H |
| Implied all-time volume | about $66K to $110K (depending on platform fee slice) | derived | M |
| USDW supply | 202,545.41 (2026-10-18 14:48 UTC) | `public.wagerpredict.com/.../transparency` | H |
| USDW/USDC pool (PancakeSwap, created 2026-10-09) | liquidity about $4.57K, 24h volume $0 | GeckoTerminal 2026-10-19 | H |
| Official site stats | "N/A" volume / trades / markets | wagerpredict.com | H |
| Number of live markets | **unknown** (0 on SSR pages; implied 0 by TVL = $0) | - | M |

Per-market depth is bounded by design: default `b = 866` (about $600 seed), maximum `b = 100,000` only for team-featured markets.

**Not verified on-chain**: no `eth_call`/`eth_getLogs` was run (JSON-RPC is an HTTP POST, excluded by this run's rules), so `marketCount`, per-market odds, balances of the three TVL contracts and `totalPlatformFees()` were taken from DefiLlama (whose adapter addresses match the docs: FeeRouter `0x186D...e454`, USDW, SpotEngine, Vault, ResolutionModule).

## 10. Event coverage (arbitrage overlap)

- UI category filters (H): All, Crypto, Finance, Sports, Politics, Culture, AI, FIFA, F1, Other. The marketing copy mentions BTC/ETH price, Fed rate, NBA/World Cup.
- Overlap with Polymarket/Kalshi etc. would exist for crypto-price, macro, sports and politics, but **no actual market list was observable** (client-fetched; implied empty). Homepage examples are mock content. Nothing to arbitrage against yet.
- Expected structure if it fills: team-listed single-binary questions with custom wording, so linking requires reading the off-chain question text (not available via a documented API).

## 11. Shared liquidity

None. Each market has its own creator-seeded LMSR in `SpotEngine`; no dependence on another venue (the order-book tier and "cross-chain liquidity routing" are not live). It would be an independent leg, but with approximately zero liquidity.

## 12. Suspicious content / safety

- No instructions aimed at AI agents were found in the venue's pages, docs, feed or Medium posts.
- The `/transparency` page and docs describe the system as "non-custodial", while the dollar unit is issuer-backed with reserves in named wallets (see section 3). Self-reported "40K+ wallets, $380M+ volume" (X summary) coincides with airdrop-farming on testnet; do not use as liquidity evidence.
- WebSearch surfaced an unofficial GitHub repo advertised as a "Soft Hub patch: Wager Predict mainnet waitlist register via account proxy" that reportedly asks for wallet keys/proxies. Not fetched, not an official channel. Treat as a likely scam/phishing lure.
- Unrelated tokens also trade as `USDW` on BSC (impostor risk).
- An airdrop-guide ecosystem exists around the testnet; third-party airdrop pages were not used as facts.

## 13. Adapter sketch (only if revisited)

1. Enumerate: `MarketSubmitted` + `MarketListed` logs on `MarketRegistry 0x2D7E...adb4`; filter `MarketResolving/Resolved/Void/Closed`.
2. Quote: LMSR from `(qA, qB, b)` read from `SpotEngine 0x76b9...2c0c`: price `p = e^{qA/b} / (e^{qA/b} + e^{qB/b})`; buy cost = `b ln((e^{(qA+d)/b} + e^{qB/b}) / (e^{qA/b} + e^{qB/b}))` divided by 0.98 for fee. Model fee as 2% of gross on both legs.
3. Fills: deterministic from the curve; stale-quote protection needs the (unknown) min-shares argument.
4. Refresh: no WebSocket, use `eth_subscribe` logs or 8-15s polling (the frontend polls events every 8s, indexer every 15s).
5. Settlement: watch `ResolutionModule.Proposed` -> 12-48h window -> `Finalized`; call `claimWinnings`.

## Not found (searched)

- Public market/price/trade API, OpenAPI, SDK, subgraph, WebSocket, rate limits for market data (searched: docs, sitemap, llms.txt, site footer links, `gh api search`).
- Function ABI (`buyShares` etc. argument lists) and the USDC to USDW mint/redeem contract (docs list events only; BscScan 403, Etherscan v2 free plan excludes BSC).
- Any listed live market with price/volume; official volume/OI; audit report; companion legal memo; GitHub repo for the contracts; Discord (none linked).
- Direct on-chain state (no JSON-RPC by rule).
- DefiLlama's own page `https://defillama.com/protocol/wager-predict` returned HTTP 403 to WebFetch; the underlying `api.llama.fi` JSON was used instead.

## Open questions

1. Is any market currently listed on mainnet? An `eth_call`/`eth_getLogs` read-only pass on `MarketRegistry`/`SpotEngine` (needs permission for JSON-RPC POST) would settle it and tell whether the TVL drop on 2026-10-13 was withdrawals, a redeploy or a DefiLlama gap.
2. What are the `buyShares`/`sellShares`/`claimWinnings` signatures and slippage parameters, and is `OutcomeToken` transferable?
3. How exactly does USDC become USDW (contract call vs issuer API), who controls the reserve wallets, and can anyone redeem USDW trustlessly?
4. Is the app's Supabase-backed REST layer intended for third-party use before the Q4 public API?
5. Audit status (docs contradict each other).
6. Final fee split in `ProtocolConfig` (0.6/0.4/0.8/0.2 stale site vs 1.0/0.1/0.8/0.1 whitepaper).

## Sources

- https://wagerpredict.com/ (home, markets, app, how-it-works, roadmap, token, transparency, terms, blog; fetched 2026-10-19) - H
- https://wagerpredict.com/robots.txt and /sitemap.xml - H
- https://docs.wagerpredict.com/ (whitepaper v1.0, revised 5 Oct 2026; sections 5-25, 32-41, Appendices A-B) - H (project's own claims)
- https://public.wagerpredict.com/usd/api/chains/56/transparency (JSON feed, captured 2026-10-18 14:48 UTC) - H
- https://wagerpredict.medium.com/ via RSS `https://medium.com/feed/@wagerpredict` (posts 2026-06-11 to 2026-10-06) - H
- https://api.llama.fi/protocol/wager-predict and https://api.llama.fi/summary/fees/wager-predict (fetched 2026-10-19) - H
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/wager-predict.ts and registries/sumTokens/data3.js in DefiLlama/DefiLlama-Adapters (addresses cross-check) - H
- https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0xe5eBE2AE0a036C955bfF58291826C50F7d670D43 (+ `/pools`) - H
- PayBox `discover_tokens` (chains list; USDW search on eip155:56), 2026-10-19 - H
- https://x.com/Wager_predict and https://x.com/UXLINKofficial/status/2080502835230216667 (2026-07-24 partnership; via WebSearch summary only), https://cryptorank.io/price/wager-predict, airdrop review pages (airdrops.com, airdrops.io, usethebitcoin.com), https://blockchainreporter.net/... (Manadia) - L/M (search-result summaries, not opened first-hand; testnet-era)
- Repo notes: `docs/research/06-paybox-platform.md` (PayBox proposal shape, chain catalog) - M

## Confidence

Overall **medium**. High confidence that the site and docs exist, that no public API exists, and on the fee/resolution design as stated by the project. Medium on "contracts live but idle" (DefiLlama-derived, no direct on-chain read). Low on any claim about live markets or volume. Docs vs marketing-site contradictions (testnet vs mainnet, fee split, audit) are unresolved.
