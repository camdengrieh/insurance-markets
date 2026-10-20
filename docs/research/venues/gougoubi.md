# GouGouBi (ggb.ai) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.
Note: the WebSearch budget was exhausted for the session, so no independent third-party coverage was searched. The GitHub repo named in the lead (nicogougoubi/gougoubi) is 404 (H, `gh api`), so no contract source or the GGBIP-1 spec could be read. Contract behaviour below comes from the website and the published npm SDK only.

## Verdict
adapter_priority: **skip** (at most P2 signal-only). Live but tiny: BSC "pump" AMM markets denominated in a meme token, zero or near-zero liquidity, no USD pricing, newest proposal in the feed is 2026-06-22 (4 months old), and dozens of expired markets still show TRADING. Many markets are copies of Polymarket questions, so any price is not independent information.

## Identity and liveness
- Site https://ggb.ai (also https://gougoubi.ai, HTTP 200). Self-described as "a decentralized prediction market and community platform on BNB Chain", beta (H, WebFetch of gougoubi.ai and ggb.ai/faq).
- npm `@gougoubi-ai/agent-sdk` 0.1.0 published 2026-04-02, 0.2.0 published 2026-04-23, last modified 2026-04-23 (H, https://registry.npmjs.org/@gougoubi-ai%2Fagent-sdk). Nothing newer in six months (stale signal).
- API host is live today: feed `generatedAt` maps to 2026-10-19, `stale:false` (H).
- Product activity looks dormant: newest of 1524 proposals created 2026-06-22; page 0 holds items from 2026-04-15 to 2026-06-22 (H, feed sampling).
- The homepage's live stats showed zeros or "Loading" (M, WebFetch rendering may have missed JS data).

## Market model
- Binary YES/NO per "condition"; a "proposal" contains 1+ conditions (feed `conditionCount`). No categorical or scalar seen (H).
- Pricing: condition objects carry virtual reserves `x`, `y` (wei strings) and `stats.yesProbability`/`noProbability`; e.g. fresh market x=y=10000e18 gives 0.5/0.5, and a market with userBetAmount ~197 tokens gave 0.490/0.510 (H, feed). That is a constant-product style AMM (pump.fun-like virtual reserves); the exact curve is NOT FOUND (whitepaper page only mentions "initial pool" and "virtual reserves", does not name the model) (M).
- Outcome tokens: NOT FOUND (searched: ggb.ai/whitepaper, /faq, SDK d.ts). SDK skills `buy_yes/buy_no/sell_yes/sell_no/redeem` imply YES/NO positions held on-chain per condition (M).
- Three contract families in the SDK constants: "pump" (factory/market/condition), "pbft", "crypto" (H, SDK d.ts). Feed `source` values seen: `pump`, `pbft`.

## Chains and collateral
- BNB Smart Chain, chain id 56 (H, SDK `BSC_CHAIN_ID`).
- Collateral / "liquidityToken" in every sampled market: `0xb05678ed0c9559955559de864829a0c8af574444`, name/symbol "狗狗币" (Chinese for "Dogecoin"), 18 decimals; SDK comment calls it "DOGE on BSC" and uses it as governance token for staking, bonding and LP (H). This is NOT canonical Dogecoin or a stablecoin; it looks like a community meme token (address suffix 4444 suggests a four.meme launch - M, unverified on-chain). `priceUsd` is null, `volumeUsd`/`liquidityUsd` are null in the feed (H). So there is no reliable USD valuation; slippage and price risk of the collateral dominate any edge.
- Contract addresses (H, SDK 0.2.0 constants, BSC mainnet): pump factory 0x3488276c6F4E86f6275479638844efDE4dFdF881, pump market 0x0857F71cd09FB4C0aBEe62cf243A886469764744, pump condition (impl) 0x59C026b28242FFF002182F6fc960451885d78be7, pbft factory 0x4bDb188E0a752CB62800CE37DD93D4F5C347C334, pbft market 0xb85B25436136947AfAe1442fDD588a34e1AA81bc, pbft condition 0xEa7CE0029aFdbB5878946FeBe25bbF36266D9129, crypto factory 0xc3bA152d9d82b33dBA3752ac45ce0AE6610f2d2b, crypto market 0xEEAD1a1c6554b4842DFbad60104a8035B527c251. Not verified on a block explorer (M).
- Stake constants: creation stake 10 tokens, default settlement bond 100 tokens, "read on-chain for exact" (H, SDK).

## Read API
- Exists: **unofficial-ish / undocumented public** (site's own backend, no published docs found). The SDK `PremarketClient` (GGBIP-1) targets `https://ggb.ai` with an `apiKey` (`pmk_...`) for writes (H, npm readme). Docs URL: the GGBIP-1 spec link (github.com/nicogougoubi/gougoubi/blob/main/docs/standards/GGBIP-1-premarket.md) is dead (404 repo). No other docs found: NOT FOUND (searched: ggb.ai nav links /whitepaper /faq /product /terms, npm readme).
- Base URL: https://ggb.ai
- Unauthenticated, confirmed 200 JSON (H, 2026-10-19):
  - `GET /api/premarket/feed` params seen: `page` (0-based), `filter` (e.g. `trending`); response filters echo `category, filter, lang, locale, search, liquidityToken`; `pageSize` 40; `meta.total` 1524. Each proposal: `proposalAddress, source, title, category, tags, createdAt, deadline, conditions[{conditionAddress, liquidityToken, liquidityAmount, status (TRADING|SETTLED|ACTIVE), userBetAmount, x, y, deadline}], stats{yesProbability, noProbability, volumeUsd, liquidityUsd}`.
  - Caching: `cache-control: public, s-maxage=30` (H).
  - `GET /api/premarket/meta` returns 404 JSON `{"success":false,...}` (H).
- SDK-referenced paths (H, SDK source, not all called): `/api/premarket/predictions`, `/predictions/{id}`, `/predictions/{id}/promote|confirm-promoted|like|comments|share`, `/agents`, `/agents/{id}`. These are the off-chain "pre-market" social prediction feed (agents post AI probabilities), separate from on-chain markets.
- No order book, trades, or price history endpoints found. No websocket found. Rate limits: NOT FOUND. Per-market price history would need on-chain event indexing of BSC contracts (ABIs not found).
- Fixture: docs/research/fixtures/gougoubi/premarket-feed.sample.json (4 of 40 proposals, trimmed).

## Trade path
- On-chain only: SDK skills `buy_yes, buy_no, sell_yes, sell_no, create_market, submit_result, vote, dispute, redeem, claim_lp` (H, README). There is no off-chain signed order system; trades are direct BSC contract calls. Contract ABIs and function signatures: NOT FOUND (repo 404). SDK 0.2.0 dist might embed ABIs, but I only read type declarations; not pursued given the skip verdict.
- Pre-market (GGBIP-1) posts need a `pmk_` API key from a node; promotion to on-chain "returns pre-filled payload only - NEVER auto-signs" (H, README).

## PayBox reachability
- paybox_reachable: **partial**. Contract calls on BSC (chain 56) from an EVM wallet via transaction proposals are technically possible if PayBox supports BNB Chain and arbitrary contract calls, but (a) ABIs are unavailable, (b) the collateral is an illiquid meme token that must first be acquired by swap, (c) no signing scheme is involved besides tx signing. Not worth building.

## Fees
- Pump markets (H, ggb.ai/whitepaper as summarized by WebFetch): trading fee 0.30%, sell fee 1.00%, winner redeem fee 0.30%, committee redeem fee 1.00%; creator buy/sell fees accrue to the creator, claimable after final settlement. LP fee: NOT FOUND. PBFT and crypto families fees: NOT FOUND.

## Resolution
- Pump: committee of the top 21 stakers (governance seats) settle; timeout penalties for passive committees; "supreme review" for unreliable committees; dispute window set per condition; dispute bond equals the locked settlement bond (min 100 tokens); final ruling bond split 30% committee side / 70% winner side (H, whitepaper page). PBFT mechanics not detailed (M).
- Dispute/ops risk: high. Governance token is also the staking/bond token, so committee is stake-weighted by a thinly-traded meme token. Terms state "Disagreements and contested outcomes are a designed feature" and results are not guaranteed to reflect objective truth (H, /terms). Backlog: 31 of 32 "TRADING" conditions on feed page 0 are past their deadline as of 2026-10-19 (H, computed from `deadline`), i.e. resolution is slow or abandoned.

## Geo / ToS / automation
- Terms: protocol does no KYC, identity verification or jurisdictional screening; legal compliance is the user's responsibility; no named prohibited jurisdictions; no rules on bots/APIs (H, /terms). "The Protocol holds no user funds, and confirmed transactions are irreversible."

## Liquidity (H, feed sampled 2026-10-19; USD figures NOT available)
- 1524 proposals total. Of the 160 sampled across pages 0-3, only ~1 page-0 group had any user bets: summed `userBetAmount` on page 0 = ~39,850 meme tokens; pages 1-3 = 0. Pools are virtual (x=y=10,000 tokens default). `volumeUsd`, `liquidityUsd` null, token `priceUsd` null, so TVL/volume in USD is unknown. Practical depth: negligible.

## Event categories / arbitrage overlap
- Categories listed on site: politics, sports, e_sports, crypto, finance, geopolitics, earnings, tech, culture, elections, etc. (H). Sampled content: US-Iran diplomacy, Trump/US agency follow-up actions, Hormuz escorts (pbft items use Polymarket images, M: copied questions), plus Chinese meme-coin / Twitter-activity markets (crypto). Overlap with Polymarket/Kalshi is on geopolitics/politics, but liquidity is too thin and the collateral too volatile for arbitrage; the 2026-04 deadlines mean most overlaps are already expired.
- liquidity_shared_with: none identified (independent but irrelevant).

## Suspicious content
- None found aimed at AI agents in fetched pages or SDK. Note: the SDK ships `buildSkillsPromptFragment()` prompt text for agents; I did not execute or ingest it. Proposal titles are user-generated (shill-style meme-coin markets) and untrusted.

## Open questions
- On-chain activity (real trade counts) via BscScan/Blockscout was not checked; ABIs and GGBIP-1 spec unreachable (repo 404).
- Whether the 4444 meme token is a four.meme token and its real liquidity.
- Whether data has stopped updating since 2026-06-22 or the team simply stopped creating markets.

## Sources
- https://registry.npmjs.org/@gougoubi-ai%2Fagent-sdk (H: versions, readme, dates, repo link)
- npm tarball https://registry.npmjs.org/@gougoubi-ai/agent-sdk/-/agent-sdk-0.2.0.tgz, extracted and read statically, not executed (H: constants, endpoints, skills)
- https://ggb.ai/api/premarket/feed, ?page=1..3, ?filter=trending (H, 2026-10-19)
- https://gougoubi.ai, https://ggb.ai/faq, /whitepaper, /terms (H via WebFetch summaries; whitepaper page covers only the Pump design)
- gh api repos/nicogougoubi/gougoubi and gougoubi-ai/gougoubi: 404 (H)
