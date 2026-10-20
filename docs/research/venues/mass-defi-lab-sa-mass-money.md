# Mass (DeFi Lab SA, mass.money) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the public site, docs.mass.money (public markdown pages and llms.txt via unauthenticated GET), App Store listing, one WebSearch (the shared search budget was then exhausted, so there was no second search pass). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Third-party pages treated as untrusted data.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

Fixtures (docs pages only, no API exists): `docs/research/fixtures/mass-defi-lab-sa-mass-money/` (`docs-llms.txt`, `docs-fees.md`, `docs-predict.md`).

## 0. Bottom line

1. Live (H). App Store listing shows version 1.59.0 released Oct 1 (2026), 4.5/5 from 51 ratings. Docs site is current and mentions pUSD, the new Polymarket collateral.
2. It is a self-custodial mobile front-end (perps via Hyperliquid, swaps, xStocks, fiat ramps) whose "Predict" tab is Polymarket. Its own docs say: "the same markets, the same order book, the same liquidity, and the same execution." (H, https://docs.mass.money/general/predict.md)
3. Therefore it is NOT an independent arbitrage leg. Liquidity is 100% shared with Polymarket (already covered by the parallel workflow).
4. No public developer API, no developer docs, no GitHub org found. The docs index (llms.txt) has no API section.
5. adapter_priority = skip. Only value: possible referral/builder-fee revenue model or a reference for how a non-custodial front-end onboards Polymarket users. Not a data source or a trading leg.

## 1. Still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| https://mass.money/ | Describes itself as "the all-in-one financial app"; products: Crypto, Perps, Stocks, Predict, spend/save. States "Mass never takes custody of your assets". "No MASS token" claim on the site, while docs fees page runs a "$MASS" liquidity-mining program (internal inconsistency, see open questions). | H |
| App Store id6465992490 | "Mass: Perps & Predictions", developer DeFi Lab SA, v1.59.0, latest release Oct 1 (year not printed in the fetch; page is the current listing so 2026), iOS 16.4+, 18+ | H |
| Google Play title seen in search: "Mass: Hyperliquid Polymarket" (money.mass.app) | search result title only, page not opened | M |
| docs.mass.money | Predict section present (Bet, Limit order, Exit, Claim) | H |

Verdict: still_live = true.

## 2. Kind and market model

- Kind: broker/front-end (non-custodial mobile app) over Polymarket. (H, docs: "Our Predict account is powered by Polymarket".)
- Market model: identical to Polymarket: binary Yes/No share pricing, "Prices always sum to $1", winning share redeems for exactly $1 (H, read-a-market page). Order book: same as Polymarket's CLOB (H, predict page). Categorical/neg-risk events presumably inherited from Polymarket but not documented by Mass (NOT FOUND).
- Tokenisation: Polymarket conditional tokens (CTF ERC-1155 on Polygon) - inferred from "same order book", Mass does not say (M).
- Order types in app: market buy, limit order (GTC-style, "stays open until you cancel it - free of charge"), sell/exit, claim after resolution (H).

## 3. Chains and collateral

- Predict account collateral: pUSD, "the native stablecoin used by Polymarket"; USDT sent to a Predict account is auto-converted to pUSD (H, top-up-with-stablecoins page). Balances display in USD.
- Funding: deposits from multiple networks consolidated into one balance; Mass crypto account supports Ethereum, Solana, Arbitrum One, Base, Optimism, Polygon, BNB Smart Chain, Avalanche (H, supported-networks page). Which chain Predict settles on is not stated; Polymarket itself is on Polygon (M).
- Wallet infra: ToS lists Privy among providers (embedded wallets) and Socket, Relay, KyberSwap, 0x, 1inch, Paraswap, Odos, OpenOcean, MoonPay, Iron, Hyperliquid, Dinari, xStocks, Morpho, USDai, Polymarket (H, other-providers ToS).
- Fiat: on/off-ramp via MoonPay/Iron; KYC only for bank transfers or debit card (H, homepage).

## 4. Read API

- exists: none (no official public API). Docs index lists no developer/API pages (H, https://docs.mass.money/llms.txt contents; fixture `docs-llms.txt`).
- NOT FOUND (searched: docs.mass.money/llms.txt, homepage, App Store page, GitHub orgs `mass-money`, GitHub repo search for "mass.money"; the GitHub org lookup returned 404).
- The host `api.mass.money` answers HTTP 200 at `/` (a single status-code check; undocumented, not probed further, body not read). It is the app's private backend (M).
- For market data use Polymarket's own APIs (Gamma / CLOB / Data), covered by the parallel workflow. Mass adds nothing.

## 5. Trade path

- None for an agent. Orders are placed only in the mobile app (Privy-style embedded wallet, tap-to-confirm). No documented API, SDK or signed-order interface (H: nothing in docs).
- PayBox reachability: no. An EVM/Solana wallet cannot trade "through" Mass. If the goal is Polymarket exposure, an agent should integrate Polymarket directly (CLOB signed orders on Polygon), not Mass.
- Funding a Mass account from a PayBox wallet by plain on-chain deposit to a Mass deposit address is possible in principle on the listed chains but is pointless for automation.

## 6. Fees

- Predict, "All operations": Mass fee = `C * p * 0.01%` (H, docs fees page, row "All operations / Predict"); protocol fees column links to Polymarket fees. C and p are not defined on the Mass page; reading them as C = shares, p = price gives 0.01% of notional (M, my inference).
- Polymarket protocol taker fee: `fee = C x feeRate x p x (1 - p)`, makers never charged; taker rates: Crypto 0.07; Sports/Economics/Culture/Weather/Other 0.05; Finance/Politics/Mentions/Tech 0.04; Geopolitics 0 (H, https://docs.polymarket.com/trading/fees; undated page).
- Other: perps 0.055% market / 0.085% limit Mass fee + Hyperliquid fees; swaps 0.10% + 0-0.30%; on/off-ramp 0.40% + banking fees; Mass pays out "$MASS" at 2 per $1 of Mass fees during a liquidity-mining program (H).
- Net: an aggregator should model Mass as Polymarket + ~0.01% - strictly worse than going direct.

## 7. Resolution

Polymarket's resolution process, UMA oracle; "If an outcome is disputed, settlement can take a bit longer"; claim via banner then claim button, winnings land in Predict balance in USDC (H, claim-your-gains page). Dispute risk = Polymarket's (UMA). Mass adds an app-layer claim step and no separate dispute process.

## 8. Geo / ToS / automation

- Available in 170+ countries supported by App Store/Google Play, except China (H, homepage). Per App Store release note 1.45.0, US virtual accounts available to US citizens except Florida, Louisiana, New York, Alaska (H, App Store). Feature availability "may depend on region"; prediction markets and tokenized assets subject to terms and regional availability (H, App Store).
- Mass ToS prohibits "data mining, robots, scraping, or similar data gathering or extraction methods of content or information from any of our Products" (H, https://docs.mass.money/other/terms-of-service/mass-terms-of-service.md section 4.1). Also all trades are "unsolicited", user-initiated; sanctions screening applies. Do not scrape Mass.
- Polymarket ToS (https://polymarket.com/tos) fetch returned only the banner: US trading blocked on polymarket.com (H); automation clauses not retrieved here (NOT FOUND; covered by Polymarket workflow). It is unknown whether Mass users in Polymarket-restricted countries are blocked (open question).

## 9. Liquidity

- No Mass-specific volume/OI/TVL published (NOT FOUND: homepage, docs, App Store). Mass says it routes to the same Polymarket order book, so its flow is a slice of Polymarket volume.
- App scale proxy: 51 App Store ratings (US store) as of 2026-10-19 (H) - small.

## 10. Event overlap and shared liquidity

Categories: politics, sports, crypto, macro, culture, world events - the full Polymarket set (H, predict page and App Store). All overlap with Kalshi, Limitless, Myriad etc., but only via Polymarket. Shares liquidity with: Polymarket (100%). Not an independent leg.

## 11. Open questions

- Whether Mass attaches a Polymarket builder code and what rate; whether its 0.01% is the whole Mass take. NOT FOUND.
- Whether the site's "no MASS token" statement and the docs' "$MASS rewards" program conflict (liquidity-mining page not read).
- Which chain/proxy-wallet model the Predict account uses (Safe/proxy on Polygon vs other).
- Predict region blocklist vs Polymarket's.

## Sources

- https://mass.money/ (H)
- https://apps.apple.com/us/app/mass-perps-predictions/id6465992490 (H)
- https://docs.mass.money/llms.txt (H)
- https://docs.mass.money/general/predict.md, .../predict/read-a-market-prices-odds-and-payouts.md, .../predict/bet.md, .../predict/place-a-limit-order.md, .../predict/exit-an-ongoing-bet.md, .../predict/claim-your-gains.md (H)
- https://docs.mass.money/general/fees.md (H)
- https://docs.mass.money/general/getting-started/fund-your-mass-account/top-up-your-cash-balances-with-stablecoins.md (H, via page summary)
- https://docs.mass.money/general/crypto/supported-networks.md (H)
- https://docs.mass.money/other/terms-of-service/mass-terms-of-service.md and .../other-providers-terms-of-service.md (H)
- https://docs.polymarket.com/trading/fees (H, undated)
- https://polymarket.com/tos (H, banner only)
- https://play.google.com/store/apps/details?id=money.mass.app (M, search-result title only)
