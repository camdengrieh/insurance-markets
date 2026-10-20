# ZEIT.FINANCE venue spec (researched 2026-10-19)

Verdict: skip as an arbitrage leg. ZEIT is a vault/derivative layer that trades on Polymarket, so it has no independent liquidity and no public read API. Its value to this project is as a thin signal (worldview heatmap, vault NAV). adapter_priority: skip (P2 at best, signal-only).

## Summary
- Live: yes (H). `https://app.zeit.finance` returns 200 with 2026 copyright, "priced 22:37 UTC" heatmap items, and vault performance stamps dated Sep 2026. Related host `https://prime.zeit.finance/` ("ZEIT Prime | Event ETF Terminal", Beta) returns 200 but is a thin shell. `https://pp.zeit.finance` (preconnected by the app, likely the price/pricing backend) returned 502 to an unauthenticated GET (H).
- Kind: non-custodial ERC-20 vault shares (BoringVault fork) that hold Polymarket positions (H, FAQ + ToS). Not a market venue.
- Home page: 38 worldviews ranked on paper, 2 community worldviews live. `/earn`: 2 live community worldviews (Internet child's War Chest, Q GeoEdge), 1 live algorithmic strategy (Autonomous Finance Arbitrage Vault V2), 7 closed vaults (H, WebFetch of /earn). Platform-wide claim "261,543 live markets, $1.1B addressable liquidity" is Polymarket's book, not ZEIT TVL (H as a claim, M as to meaning).

## Market model
- No ZEIT-native markets. A "worldview" is a user sentence turned into a basket of live Polymarket bets, tracked "on paper" (hint + homepage, H). Investable worldviews are vaults whose share token is ERC-20 (H, FAQ). Positions marked to "realizable bids rather than mid or last trade" (H, FAQ).
- Outcomes are not tokenised by ZEIT; the underlying outcome tokens are Polymarket's (Polygon CTF / negrisk). The ZEIT instrument is one fungible vault share per vault with a published unit price (NAV/PPS) from an Accountant contract.

## Chains and collateral
- Hub: Polygon (chainId 137). BoringVault, Teller, Accountant deployed there (H, vault page SSR JSON, deployedAt 2026-05-25). FAQ: "cross-chain deposits (7 chains, Polygon hub)".
- Spokes for the Arbitrage V2 vault: chainIds 1, 4663, 8453, 42161 with LayerZero OFT share tokens (H, SSR JSON `selectedChainIds`, `spokes[].layerZeroEid`). 4663 is Robinhood Chain per the local skill list (M).
- Collateral: not stated on pages. The vault config references a migration "pusdStackMigration" with source asset 0x2791...4174 (USDC.e on Polygon) to a "pUSD" stack (M: pUSD is believed to be Polymarket's newer collateral; not confirmed from a primary source). Idle cash buffer earns Sky Savings Rate (~3.7% per FAQ; USDS/sUSDS on Base chainId 8453 in config) (H).
- Vault contracts (public, from page JSON; see fixture): BoringVault 0x35976339d98dd7146128e8a6ae280ceb2bd118db, Teller 0x75f7b7855e5012e827ef71bee222f0cb6d013365, Accountant 0xbc2666a9bbf0de38471075c5056ebfc98564feda, StrategySafe 0x6ae0f4e8332073d7287358df214ccf968579b747 (all Polygon). Not verified on-chain this session.

## Read API
- Official public API: NOT FOUND (searched: homepage/FAQ/ToS/research/earn pages, links to docs/api; `docs.zeit.finance` does not resolve; `/api`, `/docs` 404; GET probes of `/api/vaults`, `/api/earn`, `/api/worldviews`, `/api/markets`, `/api/health`, `/api/vault/<slug>` all return the app's HTML 404 page). WebSearch budget was exhausted so no external search for GitHub/docs was possible. Google/GitHub org search for a ZEIT repo not done (open question).
- FAQ says algorithmic strategies "trade over the API around the clock" but the API is undocumented (H that the statement exists; API itself NOT FOUND).
- Next.js app; data is server-rendered into the HTML (vault config, fees, performance). Scraping is possible but is not an API and ToS has no automation grant.
- Practical read path: on-chain. Accountant contract publishes unit price; ERC-20 share totalSupply gives TVL. Underlying positions are visible via the Strategy Safe on Polymarket's public data API (Polymarket is covered by a parallel workflow).
- No websocket found. Rate limits NOT FOUND.
- Fixture: `docs/research/fixtures/zeit-finance/vault-config-excerpt.json` (config excerpt extracted from SSR HTML, not an API response; ~2KB).

## Trade path
- No order API. To "trade ZEIT" you deposit into a vault (Teller on Polygon or via spoke chain/LayerZero, card/bank/crypto onramp via UI) and receive ERC-20 shares; exit by selling shares on a DEX (FAQ mentions Morpho, Aave, Uniswap compatibility) or redeeming at the published unit price. Instant deposit cap $5,000/tx and instant withdraw $1,000/tx, batch cap $5,000, in the Arbitrage V2 config (H, SSR JSON). Documented exit windows: up to 7 days (worldview vaults), up to 30 days (Arbitrage V2) (H, /earn).
- This is a share subscription, not price-taking on an event. Shares price as NAV, not as an event probability, so it cannot be a hedge leg against another venue's contract.
- Signing: standard EVM transactions (approve + Teller deposit). Accounts via Privy or any wallet (H, FAQ). NOT FOUND: Teller ABI/function names on the pages (BoringVault Teller pattern suggests `deposit`, M).

## PayBox reachability
- partial. An EVM wallet in PayBox on Polygon/Ethereum/Base/Arbitrum could in principle send transaction proposals (approve + Teller deposit) or buy/sell the ERC-20 share on a DEX. But there is no event-level exposure to arbitrage and no documented programmatic interface, and ToS-level automation is unaddressed. Not worth building for the aggregator.

## Fees
- Arbitrage V2: performance fee 1% (PerformanceFeeBps=100) on new profits above a high-water mark; no deposit fee; management fee not stated (H, page + JSON). ToS: each vault states its own fees; venues/blockchains charge their own fees (H). Polymarket trading fees paid by vault, maker rebates flow back to vault (H, FAQ). Other vaults' fee schedules NOT FOUND.

## Resolution and risk
- Resolution is entirely Polymarket's (UMA optimistic oracle on Polymarket per general knowledge, M; not re-verified here). ZEIT adds: manager risk, smart-contract risk (BoringVault fork; "audited before it ships", self-described in-house plus LLM-assisted, so treat as unaudited by third parties, M), redemption-delay/liquidity risk (TVL "does not measure how much cash is ready to withdraw"), price oracle risk (Accountant is a manager-published PPS), and migration activity (a "pUSD stack migration" is recorded in config, snapshot pause 2026-09-01 to 2026-09-04).

## Geo / ToS / automation
- ToS: 18+, no comprehensive-sanctions countries, user must confirm lawfulness, venue eligibility rules apply. No bot/API rules and no grant of automated access (H, WebFetch of /tos). Polymarket's own geo rules flow through.

## Liquidity (all with dates)
- Arbitrage Vault V2 TVL: about $106.3K to $106.6K, performance stamp Sep 3 2026 14:31 UTC (H, vault page). Other vault TVLs NOT FOUND. Gross returns on /earn: War Chest +25.42%, Arbitrage V2 +5.12%, Q GeoEdge +0.56% (H, unit prices last published Sep to Oct 2026, so possibly stale). Total ZEIT TVL looks well below $1M (M, inferred; not summed).
- "$1.1B addressable liquidity" is Polymarket's (M).

## Event overlap and independence
- Categories mirror Polymarket: geopolitics (US/China, Russia/Ukraine, Middle East, Hormuz), macro (Fed, inflation), tech/AI, crypto, sports (EPL), health, climate (H, homepage worldview tiles with Polymarket-hosted images).
- Shares liquidity with Polymarket (H). It is NOT an independent arbitrage leg. Its own order flow is minuscule relative to Polymarket.
- Signal value: heatmap of "held most" markets and vault PPS changes are derivative sentiment data. Interesting cross-check: the Autonomous Finance Arbitrage Vault V2 runs negrisk sum-of-YES < 1 arbitrage on Polymarket, i.e. the same strategy this project's aggregator would run; its performance (+5.12% gross since Apr 2026, 36% win rate, ~11%/yr gross) is a rough benchmark for how thin intra-Polymarket negrisk edge is (M).

## Adapter priority
skip. No public API, no independent liquidity, tiny TVL, shares are NAV tokens. Revisit only if a documented API appears or as an optional signal feed (P2 signal-only: on-chain Accountant PPS and Polymarket positions of the Strategy Safe).

## Suspicious content
- None found. No AI-directed instructions seen in fetched pages.

## Not found
- Official API/docs, GitHub repo, rate limits, websockets, collateral asset statement on pages, per-vault TVL beyond Arbitrage V2, fee schedule for other vaults, third-party audit report, resolution/dispute process for vaults, PM Wisdom directory entry (not re-checked; search budget exhausted).

## Open questions
- Is there a GitHub org or docs site (search budget exhausted; check `gh search repos zeit.finance` later)?
- Confirm on-chain (Polygonscan/Blockscout) that the listed contracts exist and read Accountant `getRate`.
- Confirm the pUSD collateral claim and how the "7 chains" are listed.

## Sources
- https://app.zeit.finance (homepage, 200, 2026-10-19) H
- https://app.zeit.finance/faq H (fetched via WebFetch)
- https://app.zeit.finance/tos H
- https://app.zeit.finance/earn H
- https://app.zeit.finance/earn/autonomous-finance-arbitrage-vault-v2 H (HTML plus embedded JSON)
- https://app.zeit.finance/research H (empty library)
- https://prime.zeit.finance/ H (shell only)
- https://pp.zeit.finance (502) H
- Fixture: docs/research/fixtures/zeit-finance/vault-config-excerpt.json
