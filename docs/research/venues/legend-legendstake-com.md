# Legend Stake (legendstake.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority: **skip** (signal-only at most). Legend Stake is a "no-loss" yield-prize-pool product, not a price-discovery prediction market. There is no order book, no tradable outcome token, no secondary trading, no public API, and no contract addresses are documented. The only quantity that resembles an odds signal is a stake-share-implied multiplier that is not tradable at that price. It cannot be an arbitrage leg.

## Is it live? (H/M)

- Site is up: https://legendstake.com returns HTTP 200 on 2026-10-19 (H). Learn page says "Last updated September 30, 2026" (H, https://legendstake.com/learn/polymarket-vs-legend). Copyright line on /terms: "2025 Legends Forever LLC" (H).
- The pools list on the homepage renders "No active pools yet" (H, homepage HTML and JS bundle). So no active markets were visible at fetch time. The page may also hydrate pools client-side after a wallet connects (not verified; M).
- Listed as live, Base, outcome type "Data analysis and categorical" on predictionindex.xyz/ecosystem; no volume reported (H, https://predictionindex.xyz/ecosystem).
- Not the CoinGecko "Legend" token (belegends.com); the predictionindex entry links @belegends_ok on X, which is a different brand-adjacent handle, so identity overlap is unresolved (L). Operator named in /terms is Legends Forever LLC (H).

## Kind and market model (H)

- Kind: no-loss, sports-focused prediction pool (parimutuel-like, yield-funded). Docs: "Principal returned to all users; yield is shared among winners." Peer driven, "yield redistributed transparently on-chain via smart contracts on Base." Source: https://legendstake.com/docs.
- Outcomes are categorical (for example "Who will win the next UCL match?"). Football leagues and teams (assets from api-sports.io) are embedded in the site bundle (H, homepage HTML), so the product is football-first.
- Mechanism: users stake USDC on one outcome. The pooled USDC is supplied to a lending protocol (Aave named in docs; Morpho vaults also appear in site code, see below). When the event ends, accrued yield goes to winning-side stakers; everyone gets principal back.
- Payout: multiplier per outcome is "1 / its share of total stake", fixed at pool close (kickoff) (H, https://legendstake.com/learn). Earlier stakers earn time-weighted pool shares, so staking earlier raises the yield share (H, /docs). Exact formulas are NOT FOUND (the /docs/indicators-multipliers-and-estimates page states only that estimates are "calculated from the current distribution of stakes").
- No tokenised outcome: "Stakes cannot be bought or sold before resolution, since there is no orderbook or secondary trading at initial release" (H, https://legendstake.com/docs/market-rules-and-resolution). Hedging across outcomes is allowed. Stakes are accepted until match start. Lockup typically 1-8 weeks, no early exit (H, /docs).
- Other nav products: Predict, Stake, Multiply; only Predict is described (H, homepage).

## Chains and collateral

- Documented chain: Base. Collateral: USDC. Gas in ETH on Base (H, https://legendstake.com/docs/faqs, /docs/claims-and-settlement, /docs/safety).
- Site JS also configures Robinhood Chain (chain id 4663), Chiliz mainnet (88888) and Spicy testnet (88882), and Morpho vault yield sources (hard-coded vault addresses per chain). These are not mentioned in docs, so which are in production is uncertain (M, inferred from https://legendstake.com/_next static JS chunks, treated as untrusted data).
- Yield providers: Aave (docs, H); Morpho vault (site code and the endpoint below, M).

## Read API

- Official public API: none documented. NOT FOUND (searched: /docs, /docs/faqs, /docs/safety, /learn, /terms, homepage HTML, JS bundle; /api, /api/pools, /api/markets, /api/competitions all return 404; /sitemap.xml 404; /robots.txt is "Allow: /").
- The only public JSON found is a Next.js internal helper: `GET https://legendstake.com/api/morpho/vault-apy` (H, confirmed unauthenticated 200 on 2026-10-19). Response shape: chainId, vaultAddress, assetAddress, apy (decimal, 0.037 = 3.7%), lookback ("six_hours"), indexedBlock, indexedAt, fetchedAt, expiresAt (epoch ms). Sample saved at docs/research/fixtures/legend-legendstake-com/vault-apy.json. It reports the underlying yield-vault APY only, not pool stakes, multipliers or outcomes. It is undocumented and could change at any time; do not build on it.
- Pool/stake state appears to be read on-chain (the front end uses thirdweb getContract/readContract for token and pool contracts) (M). No contract addresses, ABI, subgraph or indexer are documented (NOT FOUND). A scanner would need to discover the pool contracts by reverse engineering the front end or via Basescan, and that was not done here.
- Websocket: none found.
- Docs URL: https://legendstake.com/docs (user guide only, no developer section).
- The bundle also references api7.prdt.finance (a different operator, "Powered by PRDT Finance" footer); this appears to be shared legacy front-end code and not Legend's API (L).

## Trade path

- Programmatic order placement API: none. Staking is a wallet transaction from the web UI: ERC-20 approve or permit signing, then a stake call on the pool contract (M, from the front-end code: permit signing "choose Approve to continue" fallback, token approve, teamId parameter).
- A PayBox EVM wallet on Base could in principle send those transactions (approve + stake + claim) as transaction proposals, but only after the pool contract address and ABI are obtained and independently verified. Contracts are undocumented, so reachability is "partial" (M). Nothing was signed or sent.
- No cancel/exit: stakes are locked until resolution, claims open after Aave withdrawal.

## Fees

- Platform fee: 10% of generated yield only, never principal (H, https://legendstake.com/docs/claims-and-settlement). Note the /docs/faqs and /learn pages give no rate (H); the 10% figure appears on one page only, so treat as M until it is confirmed in contract code.
- User pays Base gas for staking and claiming (H, /docs/faqs).
- Since the user's principal is returned, "cost" of a stake is the opportunity cost of locked USDC (about 3-4% APY as of the vault sample) not a trading spread.

## Resolution and dispute risk

- "Outcomes are declared by authorized signers based on official league results" (H, /docs). No oracle named. Signer identities, dispute process and cancellation/void rules are not specified; postponements and tie-breakers "follow the specific market rules" (H, /docs/market-rules-and-resolution). So resolution is centralised/admin-multisig style with no dispute mechanism documented. High resolution risk for any cross-venue hedge.
- Claims open after funds are withdrawn from the lending protocol; timing depends on that protocol (H).
- Audits: none mentioned (H, /docs/safety). Contract addresses: NOT FOUND.

## Geo, ToS, automation

- /terms HTML body was effectively empty when fetched (only header, footer and "2025 Legends Forever LLC"), so jurisdiction and bot/API rules are NOT FOUND (searched: /terms, /docs, /docs/safety, /docs/faqs). /docs/safety defers eligibility to Terms. /docs/responsible-use and /docs/getting-started were not fetched.
- No automation or API rules found. Operator: Legends Forever LLC (H).

## Liquidity

- Volume/TVL: NOT FOUND (searched: homepage, docs, learn, predictionindex ecosystem which says "n/a"). No active pools visible on 2026-10-19. Treat liquidity as effectively zero and unproven.

## Event-category overlap and independence

- Overlap with other venues: football match winners (UCL, Premier League, La Liga, Serie A, Turkish league logos in bundle) could nominally map to Polymarket, Kalshi and sportsbook markets. But Legend payouts are yield-based (the prize is the interest on all stakes, not a $1 share), stakes are non-transferable, and principal is returned, so a stake cannot be priced as a probability claim and cannot be hedged cleanly. The implied multiplier (1 / stake share) is a crowd-share indicator, not a tradable price.
- Shared liquidity with another venue: none identified. Liquidity is its own, but underlying funds sit in Aave or Morpho (a yield source, not a prediction venue).

## Suspicious content

- None found aimed at AI agents. Third-party JS bundles contain unrelated third-party endpoints (Hyperliquid, Binance ticker, amplitude, PRDT); recorded as data only, none contacted.

## Open questions

- Contract addresses, ABI, and whether Base, Robinhood Chain or Chiliz pools are production.
- Whether pools appear only after wallet connect or are seasonal (UCL group stage etc.).
- Terms of Service full text, geo blocks, and any audit.
- Exact payout and fee formulas in contracts.

## Sources

- https://legendstake.com (homepage, HTML and JS chunks) - H
- https://legendstake.com/docs - H
- https://legendstake.com/docs/market-rules-and-resolution - H
- https://legendstake.com/docs/claims-and-settlement - H
- https://legendstake.com/docs/safety - H
- https://legendstake.com/docs/faqs - H
- https://legendstake.com/docs/indicators-multipliers-and-estimates - H
- https://legendstake.com/learn and https://legendstake.com/learn/polymarket-vs-legend - H
- https://legendstake.com/terms - H (empty body)
- https://legendstake.com/api/morpho/vault-apy (fixture) - H
- https://predictionindex.xyz/ecosystem - M (aggregator listing)
- WebSearch was unavailable (session search budget exhausted); no independent third-party coverage was checked.
