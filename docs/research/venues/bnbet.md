# BNBet (bnbet.app) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Skip. The official domain bnbet.app currently serves a Namecheap "Domain registration has expired" parking page, not a product (H). The documented design is a custodial, server-priced, AI-resolved BNB-denominated market with no public API and no published contract addresses (H). Its sole markets of overlap are mirrored Polymarket events, so it is not an independent leg (H). The token has a market cap of about $9.6K (H).

## Is it live?

- http://bnbet.app/ returned HTTP 200 on 2026-10-19 with a Namecheap parking page headed "Domain registration has expired." (H, saved as fixtures/bnbet/bnbet-app-parked-2026-10-19.html). The page's Last-Modified is 2026-07-30.
- https://bnbet.app and https://www.bnbet.app fail the TLS handshake (curl error 35, SSL_ERROR_SYSCALL) (H). This matches the discovery hint "TLS failed at fetch".
- DNS for bnbet.app, www and api.bnbet.app resolve to 104.219.250.37 and 2.59.170.20. The NS records are ns1/ns2.lander.d.parity.domains, which is a parking-lander service (H, dig).
- RDAP is inconsistent with the parking page: it lists registration 2025-10-08, expiration 2027-10-08, last changed 2026-10-08, status "auto renew period" and nameservers dns101/102.registrar-servers.com (H, https://rdap.org/domain/bnbet.app). Reading: the domain may have lapsed and been re-registered or renewed on 2026-10-08, but DNS still pointed at the parking lander when checked. Either way no app was reachable. Rechecking later is cheap; I did not re-test.
- CoinGecko still lists the token (id `bnbet`, categories "BNB Chain Ecosystem" and "Prediction Markets"), with homepage bnbet.app and X handle bnbetofficial. Last updated 2026-10-15 (H, https://api.coingecko.com/api/v3/coins/bnbet). A token listing is not evidence the app works.
- NOT related: https://bnbet.io (redirects to www.bnbet.io) is a "Decentralized Coinflip Betting on BNB Chain" site, 50/50 heads/tails, with no prediction markets (H). Nothing links it to bnbet.app or the BNBET token, so I treat it as a different project (M). It is a house-edge coinflip game, not a prediction market, and is irrelevant to the aggregator.
- NOT FOUND (searched: X/Twitter not fetched, no social-activity check; web search budget ran out before I could look for shutdown or rug reports): any evidence of recent activity on @bnbetofficial.

## Kind and market model

- kind: onchain-other, but the docs describe a hybrid. An FPMM-style AMM, with server-side price calculation and a "vault wallet" holding funds, makes it largely centralised and off-chain-priced (H, https://bnbet.gitbook.io/whitepaper/how-its-work/publish-your-docs-1.md and .../security-and-transparency.md).
- Binary YES/NO markets. "YES price + NO price = 0.01 BNB always"; each share pays 0.01 BNB if it wins (H). Prices come from pool balance ratios ("Fixed Product Market Maker"). Quotes are valid for 30 seconds.
- Outcomes are pool shares tracked by the platform. No outcome token (ERC-1155 or ERC-20) is documented (NOT FOUND, searched: all gitbook pages in llms.txt).
- Payout formula in the docs: "(Your Shares / Total Winning Shares) x Total Pool", with 10% fee deducted. This is parimutuel-style, which contradicts the fixed 0.01 BNB per share claim (H). The docs are internally inconsistent about which model settles.
- No cancellations or refunds on Polybets markets (H).
- Market creation: a user describes a prediction, and AI generates the title, deadline and category (H).

## Chains and collateral

- BNB Smart Chain only (H). Collateral is native BNB. "BNB or supported tokens" is mentioned in wallet funding, with no list (H). Using the $BNBET token to bet is a roadmap item.
- Wallet connection through Privy (H).
- $BNBET token: BEP-20, 1B supply, contract 0xcfafecd0b8e866a0626166667bb652bec9d14444 on BSC per CoinGecko (H). No prediction market contract address is published (NOT FOUND, searched: gitbook pages, CoinGecko links). The docs say the vault wallet address is deliberately not exposed.

## Read API

- exists: none (public docs). No API documentation, OpenAPI spec, subgraph, SDK or GitHub repo found (NOT FOUND, searched: gitbook llms.txt index of 19 pages, CoinGecko links; GitHub not searched because the web search budget ran out and no repo was linked).
- Docs: https://bnbet.gitbook.io/whitepaper (llms.txt index at /llms.txt) (H). These are marketing pages only.
- Base URLs: none verifiable. The app domain serves a parking page, so no unauthenticated endpoint could be probed. No fixtures of API responses exist. The saved fixtures are the CoinGecko coin record and the parking page.
- Fixtures saved: docs/research/fixtures/bnbet/coingecko-coin-bnbet.json (token record) and docs/research/fixtures/bnbet/bnbet-app-parked-2026-10-19.html (parking page).

## Trade path

- None programmatic. The flow is a web UI: Privy wallet connect, then bets whose prices are calculated "server-side" ("Zero client trust model"), with a "vault wallet" receiving funds and a claim step with a 30-second cooldown (H).
- PayBox reachability: **no**. A PayBox EVM wallet on BNB could in principle send BNB to a vault address via a transaction proposal, but that address is not published and no ABI or order schema is documented, and the app is currently unreachable. Not tradeable via signed orders (none exist) or documented contract calls.

## Fees

- 10% platform fee on winnings (deducted from payout; "You receive 90% of gross winnings in BNB") (H, .../claiming-your-winnings.md). Polybets markets "the standard 10% platform fee applies" (H).
- Fee use: fees go to buyback and burn while market cap is below 1M (H, .../tokenomics/quickstart.md). Creators earn a share of fees (H, .../ecosystem/creator-reward-bet-system.md). 2% of the "main pool wallet" seeds liquidity for each market (H, .../ecosystem/liquidity-bet-system.md).
- A 10% fee on winnings makes tight cross-venue arbitrage unprofitable against venues charging a few percent.

## Resolution and dispute risk

- Three-layer "AI-Powered Resolution": (1) price oracles and on-chain data for crypto bets, (2) category-specific APIs (weather, sports scores, news), (3) AI analysis making the "final determination" (H, .../ai-powered-resolution.md). Verification source endpoints are intentionally hidden.
- Polybets: resolutions are synced from Polymarket (H, .../polybets/quickstart.md).
- No dispute or appeal process documented (NOT FOUND, searched: all gitbook pages). High risk: opaque AI plus a single operator, with no on-chain resolution proof.

## Geo, ToS, automation

- NOT FOUND (searched: gitbook index, which lists no Terms or Privacy page; app unreachable). No stated geo-blocking, KYC or bot policy. The docs say "rate limiting on claims" only. Treat the ToS as unknown.

## Liquidity

- Token: market cap about $9,595 and 24h volume about $1.76 at price $9.59e-06 (H, CoinGecko API, last_updated 2026-10-15).
- Market volume, open interest and TVL: NOT FOUND (searched: gitbook, CoinGecko; the app is down so no stats page).
- Treat the venue as having effectively no liquidity.

## Event overlap and independence

- Categories claimed: sports, politics (elections), crypto price, weather, memecoin price oracle (roadmap) (H, whitepaper overview and oracle pages).
- Polybets mirrors the top 100 trending Polymarket markets, syncing every 30 seconds, including resolutions (H). So the overlap is with Polymarket, but BNBet's prices are its own tiny pool, not Polymarket's book. It is a copy with its own thin AMM; it is not an independent price discovery source. There is no shared order book, but outcomes are copied, so any edge is thin-liquidity noise.
- Shares liquidity with: none technically (separate pools), but its market set and resolutions depend on Polymarket (H).

## Adapter priority

skip. Dead or parked app, no API, no published contracts, custodial design, 10% fee, negligible liquidity. Revisit only if bnbet.app serves a real app again and publishes an API or verified contracts.

## Open questions

- Is the RDAP renewal on 2026-10-08 a recovery by the operators, with DNS about to be repointed?
- Is @bnbetofficial still posting? (not checked)
- Which BSC contract holds user funds, if any? Not published.

## Suspicious content

- None found. No instructions aimed at AI agents in the fetched pages. The Namecheap parking page includes third-party scripts (plausible analytics at lander.parity.domains); I did not execute anything.

## Sources

- http://bnbet.app/ (parking page, fetched 2026-10-19) - H
- https://rdap.org/domain/bnbet.app - H
- https://api.coingecko.com/api/v3/coins/bnbet and /search?query=bnbet - H
- https://bnbet.gitbook.io/whitepaper/llms.txt and the .md pages: readme, vision, getting-started/quickstart, how-its-work/{quickstart,publish-your-docs,publish-your-docs-1,ai-powered-resolution,claiming-your-winnings,security-and-transparency}, ecosystem/{oracle-integration,liquidity-bet-system,creator-reward-bet-system}, polybets/quickstart, tokenomics/quickstart, roadmap/quickstart..quickstart-3, final-word - H (project's own marketing docs; claims are unverified)
- https://www.bnbet.io/ (different coinflip project) - H
- Web search 2026-10-19 (one query; summary of third-party listing pages such as Coinbase, CryptoRank) - M
- Not checked: X @bnbetofficial, BscScan, GitHub.
