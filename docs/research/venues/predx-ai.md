# Venue spec: PredX AI (predx.ai)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale. Where nothing was found the note says NOT FOUND with what was searched.

## Verdict

- **Adapter priority: skip.** The venue is dormant to dead: the web app and marketing site return a Firebase "Bandwidth Quota Exceeded" page (HTTP 509), the Base vault's last transaction was 2025-09-19 (about 13 months ago), the only public API route known from third-party code now returns 404, the docs were last edited 2024-11-19, and DefiLlama TVL is a flat $3.4K of idle stablecoins. There is no official public API, no documented programmatic trade path, and no documented resolution oracle. [H for each fact, M for the overall "effectively dead" conclusion]
- Even in its 2024-25 form it was a custodial, off-chain-ledger platform (user deposits to a vault, bets recorded in the operator's backend, withdrawals executed by an operator key) with an unusual "uncapped" share price model. It would never have been a clean arbitrage leg. [H docs, M inference on custody]
- Do not confuse it with other "PredX" names: `predx.io` is a white-label prediction-market vendor for casinos (twitter `predx_io`, separate company as far as shown); `predx.com` is an unrelated ML software firm ("Predictive Dynamix"); many GitHub repos called PredX / PreDx-AI are unrelated (health, IoT, copy-trading). [H, fetched pages]

## 1. Liveness [H]

| Check (2026-10-19) | Result |
|---|---|
| `GET https://predx.ai/` and `https://events.predx.ai/` (the app URL that ecosystem listings point at) | HTTP/2 509, Firebase Hosting page "Bandwidth Quota Exceeded ... must be upgraded via the Firebase console before it can begin serving traffic again". Both hostnames resolve to Firebase Hosting (199.36.158.100). Could in principle be a transient monthly quota, but see the rest of this table. |
| `GET https://api.predx.ai/` and `/v1/getAddressBalance?blockNumber=1` (endpoint used by zkLink's 2024 points adapter) | HTTP/2 404 "Error: Page not found" from a Google frontend. Host still resolves and answers; that route is gone. |
| Base vault `0x10dE7F398C76341B5a5C33693C930609863F692C` on Basescan | 812 transactions in total; the latest 25 shown are all `Withdraw` calls from one operator address, newest 2025-09-19 12:04 UTC (block 35747064), about 394 days ago. Holds 1,239.009185 USDC, 0 ETH. Source not verified. Contract created about 2024-09-27 ("2 yrs 22 days ago"). Page text read via WebFetch (summarizer); the USDC balance agrees with DefiLlama's $1,238.79. |
| Linea vault `0x3F8D22db689A9c6F0560baCE255cdD854Ab84Ca5` on Lineascan | 32 transactions in total; last = `Withdraw` 2025-03-06 (591 days ago); holds 540.86 USDC. Source not verified. |
| Gitbook user guide `predx.gitbook.io/guide.to.predx.com` | Still served, but page `updatedAt` = 2024-11-19T03:48:44Z (about 23 months old; stale). Screenshots in it are dated 2024-11-08. |
| DefiLlama (`api.llama.fi/protocol/predx-ai`, listing id 4949) | `deadUrl: true`, `url: ""`, listed 2024-08-05 (`listedAt` 1722886946). TVL $3,413 today; flat within $3.4K to $4.0K since 2025-10. Peak $20,661 on 2024-11-01. |
| Source repo | NOT FOUND (searched: GitHub repo/user/code search for predx, PredX_AI, the contract address, predx.ai, api.predx.ai; no official repo, only third-party adapters that mention it) |
| X account `x.com/PredX_AI` | WebFetch got HTTP 402 Payment Required; stopped there, nothing recorded from it. Last-post date and any shutdown/migration announcement: NOT FOUND (WebSearch budget was exhausted this session, so no news search was possible). |

## 2. Kind and market model

- Kind: custodial, operator-run web app with on-chain deposit/withdraw vaults on several chains (not an on-chain AMM, despite the discovery label "onchain-amm"). Vault contracts hold stablecoins; per-market state is not on-chain as far as anything shows. [M: inferred from Basescan showing only operator `Withdraw` calls, unverified source, and docs that describe an "account balance"]
- Docs self-description: "decentralized AI evaluation protocol"; "AI-generated events"; claims "190K+ users", "1K+ AI-generated events", "50+ partner projects" (undated, around 2024-11, marketing claims, L). [H that the docs say it; claims unverified]
- Outcomes: Yes/No shares for single-option events, plus "Multi Option" events in the portfolio view (so categorical exists). Not documented as tokenised; no ERC-1155 or conditional-token contract is referenced anywhere. [H docs, M on tokenisation]
- Pricing: docs describe an **"un-capped order book"**: Yes and No share prices are not capped at $1; probabilities are derived by rule: P(Yes)+P(No)=1 and the price ratio equals the probability ratio. So a displayed "47.27%" is a normalised ratio, not a $0.4727 redeemable-for-$1 price. Docs also say a winning payout = stake x odds at the time of the bet (fixed-odds style), and describe limit orders (buy/sell, "sits in the order book"). The three descriptions are not reconciled in the docs. [H: gitbook `trading/un-capped-order-book`, `get-started/what-is-predx`, `trading/limit-order`; exact matching engine: NOT FOUND]
- "Leverage": Parlay Leverage (win streak raises reward multiplier 1x, 2x, 4x) and Time Leverage (up to 2x for early trades; combined up to 8x). These are reward multipliers on winnings, not margin. [H: `trading/leverage`] A price on this venue therefore cannot be compared 1:1 with a Polymarket/Kalshi price without knowing the payout rule.
- Event creation: only members of a "Creator Program" can create events (question, start/end time, category, options); creators earn a commission on bets. Categories named: cryptocurrency (with subcategories e.g. Bitcoin, Meme Coins), sports, politics, entertainment. Example market: "Will BTC be above $69,600 on Tuesday at 5:00 PM ET?" (short-dated crypto price). [H docs]

## 3. Chains and collateral

- Chains named in docs: started on SEI, now "Base, Bitlayer, Linea, Bera, and other" networks (docs, 2024-11). DefiLlama lists Sei, Base, Linea, BNB Chain, Mantle, Bitlayer, zkLink Nova. [H]
- Vault ("owner") addresses used by DefiLlama's TVL adapter (adapter at commit 9d7a763f, 2024-10-31; the file `projects/predx/index.js` no longer exists on `main` as of 2026-10-19, last touched by a bulk refactor commit on 2026-06-22) [H]:
  - Base `0x10dE7F398C76341B5a5C33693C930609863F692C` (USDC)
  - Linea `0x3F8D22db689A9c6F0560baCE255cdD854Ab84Ca5` (USDC)
  - BNB Chain `0x2e8c67E73883e787A164cD9FeA592d0AcDbC61D4` (USDT)
  - Mantle `0x8D2DB5B86b7C079FF8F7190D788766EeB789F104` (USDC)
  - Bitlayer `0x8E4fb0169aECB4768220d97aA1D0106322716678` (token `0xf8C374CE88A3BE3d374e8888349C7768B607c755`)
  - Sei `0xACbd78769333697ebB2c859a8344d1507b45F044` (token `0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1`)
  - zkLink Nova `0x21855483F45ab1801CbE4248b9a2F178320c444B` (USDT `0x2F8A25ac62179B31D62D7F80884AE57464699059`); zkLink's own points adapter names a pool `0x986Ca3A4F05AA7EA5733d81Da6649043f43cB9A8`
- Source verification: Base, BNB, Linea and Mantle vaults unverified on Etherscan-family explorers and Sourcify (third-party dataset, fetched 2026-05-06; Basescan page 2026-10-19 agrees for Base). Sei and Bitlayer not checked. No audit listed (DefiLlama `audits: "0"`). [H for the data; M that it implies "no public ABI"]
- Collateral: USDC (Base, Linea, Mantle, Bitlayer), USDT (BNB, zkLink), docs also say "$USDT" for points deduction. Withdrawals "usually in stablecoins like USDC". [H]
- Wallets supported at sign-up (docs, 2024-11): Coinbase Smart Wallet (passkey, gas-free), generic EVM wallets (MetaMask), TON wallet. [H]

## 4. Read API

- **Official public API: NOT FOUND** (searched: gitbook llms.txt and all 18 pages, DefiLlama listing, zkLink / Bitlayer / Macaroni ecosystem listings, GitHub code search for `api.predx.ai`). No OpenAPI, no SDK, no websocket documented.
- Only trace of a backend: `https://api.predx.ai` with route `GET /v1/getAddressBalance?blockNumber=` returning `{data:[{id, usdc_in_micro}], time}` (per-user balances at a block), used by zkLink Nova's points adapter committed 2024-08-24 (`zkLinkProtocol/nova-point-v2`, `src/adapters/predx/execution/src/sdk/lib.ts`). It is a partner-facing helper, not a market-data API, and it returns 404 today. [H code; H 404]
- No endpoint for markets, prices, books, trades or resolution was found. Auth and rate limits: NOT FOUND.
- On-chain reads are the only fallback and they only show vault deposits/withdrawals, not per-market prices (unverified contracts, off-chain ledger). [M]
- Fixtures: no API response to sample. Saved the negative probes and the DefiLlama/gitbook evidence under `docs/research/fixtures/predx-ai/`.

## 5. Trade path

- Documented path = web UI only: connect wallet, deposit USDC or use "Direct trade without deposit" (wallet pops a "Spending Cap Approval" for USDC, then a "Transaction Request"), click Buy on Yes/No, withdraw from the balance menu. [H: gitbook, 2024-11]
- Programmatic order placement, API keys, signed orders (EIP-712 or otherwise): NOT FOUND (searched: all gitbook pages, llms.txt, GitHub). The ABI of the "direct trade" transaction target is unknown because the contracts are unverified. [H for absence in sources]
- App is currently not serving (509), so even the UI path is unavailable today. [H]

## 6. PayBox reachability: **no**

- No documented order API, no client-signed order format, no verified contract ABI, and the front end is down. A PayBox EVM wallet (Base, BNB, Linea etc.) could in theory send a USDC `approve` plus a raw transaction to an unverified vault, but nothing documents the function, the vault shows only operator withdrawals since 2025, and an off-chain ledger credit would be needed to place bets. Not safe and not integrable. [M]
- A plain USDC transfer to the vault would not be a trade. [M]

## 7. Fees [H, gitbook `trading/trading-fees`, page updated 2024-11-19, possibly stale]

- 1.2% commission on all trades in events (payer: trader). Formula and whether it is on stake or on payout: NOT FOUND.
- Creator commission per bet: rate NOT FOUND.
- PredX points can deduct up to 30% of a bet's value ("Points Deduction"; page also calls the token PRDX and denominates in $USDT). [H]
- Withdrawal fees: "network speeds and any transaction fees" only. [H]

## 8. Resolution and dispute risk

- Who resolves, from what data source, and on what timeline: NOT FOUND. Docs say only that predictions are "settled". "AI agents provide news" is the nearest statement. No oracle (UMA, Chainlink, etc.) is mentioned anywhere. [H for absence]
- Dispute stage: on a finished event a user clicks "Appeal Result", chooses the opposite result and gives a reason; "your appeal will be reviewed for fairness and accuracy" by an unnamed party. No bond, no deadline, no on-chain process. [H: `market/dispute-stages`]
- Risk: centralised, discretionary resolution by the operator or event creator, custodial funds, no audit, unverified contracts, and an apparently abandoned operator. Treat any open balance as at risk of being stranded. [M]

## 9. Geo, ToS, automation

- Terms of service, restricted jurisdictions, automation / bot rules: NOT FOUND (searched: gitbook llms.txt and pages, predx.ai root returned 509 so any in-app terms are unreachable). No KYC mentioned at sign-up (wallet connect only). [H for what the docs say]
- No robots.txt or API terms checked (site down).

## 10. Liquidity [dated]

| Metric | Value | Source and date |
|---|---|---|
| TVL (total, all chains) | $3,413 (USDC $2,867 + USDT $547) | `api.llama.fi/protocol/predx-ai`, 2026-10-19 [H] |
| TVL by chain | Base $1,239; Bitlayer $1,086; BNB $547; Linea $541; Mantle $1.8; Sei $0; zkLink $0 | same [H] |
| TVL history | $4.2K (2024-08), peak $20,661 (2024-11-01), $12.2K (2025-03), $4.1K (2025-09), flat $3.4K to $4.0K since 2025-10 | same [H] |
| Volume / open interest / trade count | NOT FOUND (searched: DefiLlama listing has no dexs/OI adapter; docs give no figures; Dune not searched) | |
| Users / events (claims) | "190K+ users", "1K+ events" | gitbook, c. 2024-11, marketing [L] |
| Open markets today | NOT FOUND (app not serving) | |

## 11. Event overlap for arbitrage

- Historically crypto price (short-dated BTC thresholds), sports, politics, entertainment and finance events, all creator-authored free-text. These categories overlap Polymarket / Kalshi in principle, but today there is no reachable market list and no price feed, so there is nothing to match. The uncapped-price model and fixed-odds payout also make price comparison unsound. [M]

## 12. Does it share liquidity with another venue?

- No evidence of it. Its pools are its own vaults (tiny). It names no hedging or routing partner. Whether its order book was ever seeded from another venue's prices: NOT FOUND. [M]

## 13. Suggested adapter scope

- None. If a signal is wanted from long-tail defunct venues, record only: DefiLlama protocol 4949 TVL series (daily, public GET) as a venue-health indicator. No market, price or trade ingestion.
- Revisit only if (a) the app and an `api.predx.ai` market-data surface come back, (b) contracts are verified, and (c) a resolution source is published.

## Not found (searched)

- Official site that serves content (predx.ai and events.predx.ai both 509).
- Public REST / GraphQL / websocket API; SDK; OpenAPI.
- Terms of service, jurisdiction list, automation policy.
- Fee formula detail; creator commission rate.
- Resolution authority, data source, dispute deadline and bond.
- Contract source or ABI for any vault; audit report.
- Volume, open interest, market count (no dashboard found).
- Latest X posts or shutdown / migration announcement (x.com returned 402; web search quota exhausted).
- BscScan page (HTTP 403) and Bitlayer explorer page (empty content) for the BNB and Bitlayer vaults.

## Open questions

- Is the Firebase quota error a billing lapse on an otherwise live service, or a sign the team stopped paying? On-chain silence since 2025-09-19 (Base) and 2025-03-06 (Linea) points to the latter. A check of the X account or Discord (`discord.com/invite/predx-949853427771535370`, listed by zkLink; not visited) would settle it.
- Did the team rebrand or move to another domain? Gitbook slug `guide.to.predx.com` suggests a planned `predx.com` custom domain, but `predx.com` today is an unrelated company and `guide.to.predx.com` does not resolve.
- Is `predx.io` (casino white-label) related to PredX AI? Nothing found links them; treat as separate.

## Suspicious or agent-directed content

- None found. The gitbook `llms.txt` is an ordinary page index. A third-party SEO page (`apacfinstab.com/agents/predx-ai`) carries an auto-generated "compliance score 68%"; ignored, not relied on. GitHub search surfaced many unrelated repos with similar names; nothing from them was used.

## Sources

- https://api.llama.fi/protocol/predx-ai (DefiLlama listing id 4949: chains, `deadUrl`, TVL history; fixture `docs/research/fixtures/predx-ai/defillama-protocol-summary.json`) [H]
- https://github.com/DefiLlama/DefiLlama-Adapters/pull/11192 (listing PR 2024-08-04: name "PredX.ai", website https://predx.ai/, twitter predx_ai) and commit 9d7a763f ("update predx #12118", 2024-10-31) with file `projects/predx/index.js` at that commit (vault addresses); commit ca9a0728 (2026-06-22 bulk refactor; file absent on `main`) [H]
- https://github.com/guil-lambert/defipunkd (`data/enrichment/predx-ai/adapter.json`, `sourcecode.json`, `control.json`; third-party dataset, 2026-04/05, contract verification status and Safe checks) [M]
- https://basescan.org/address/0x10dE7F398C76341B5a5C33693C930609863F692C (page text via WebFetch, 2026-10-19) and https://lineascan.build/address/0x3F8D22db689A9c6F0560baCE255cdD854Ab84Ca5 [H]
- https://predx.gitbook.io/guide.to.predx.com/ (user guide; `llms.txt` and 18 pages read; page `updatedAt` 2024-11-19; fixtures `docs/research/fixtures/predx-ai/gitbook-*`) [H]
- https://predx.ai/ , https://events.predx.ai/ , https://api.predx.ai/ (live probes; fixture `docs/research/fixtures/predx-ai/live-probes-2026-10-19.txt`) [H]
- https://github.com/zkLinkProtocol/nova-point-v2 (`src/adapters/predx/execution/src/sdk/lib.ts`, added 2024-08-24; the `api.predx.ai/v1/getAddressBalance` route) and https://github.com/zkLinkProtocol/zklink-nova-ecosystem (`src/jsonList/PredX.json`: app URL `events.predx.ai`, Discord and X links, type "DEX") [H for contents]
- https://github.com/she-protocol/she-doc (`src/data/appData.ts`: lists PredX as "Prediction Market" at events.predx.ai), https://github.com/Macaromswap/eco (`en.json`: "AI-powered prediction market that aims to become the world's most engaging and informative event exchange") [M]
- https://predx.io (different company, white-label vendor), http://predx.com (unrelated, "Predictive Dynamix") [H, disambiguation]
- https://x.com/PredX_AI (HTTP 402 to WebFetch; not read) [no data]
