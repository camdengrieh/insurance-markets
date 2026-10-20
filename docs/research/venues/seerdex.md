# SeerDEX (seerdex.com) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. SeerDEX is a token-presale marketing site. No trading product, no contracts, no API and no on-chain presence were found. Revisit only if mainnet launches and contract addresses or an API appear.

## Is it live?

- seerdex.com returns HTTP 200: an Angular single-page app whose hero says "Presale is Now Live" and "the fastest binary options engine ever engineered" [H, https://seerdex.com/].
- The presale counters are empty or broken: "USD Raised: $0 / $0", blank price, "NaN% Left", all countdown timers 0 [H, same page].
- Whitepaper roadmap marks "Phase 2: Development & ICO Preparation" as the current phase. The mainnet launch is in Phase 4, and Phase 3 (beta platform, "initial prediction markets") has no dates [H, https://seerdex.gitbook.io/seerdex-whitepaper/seerdex-ico/roadmap.md]. So there is no evidence of a live trading product, even beta.
- The homepage "Global Pulse" feed (MARKET CREATED / PREDICTION RESOLVED / NEW POSITION) is hardcoded markup: truncated fake addresses (0x7F...3B92), fixed "2s/5s/12s ago" times, an aria-hidden marquee. It is not live data [H, page source; fixture docs/research/fixtures/seerdex/probe-2026-10-19.json]. The example market "ETH > $4,200 at 16:00 UTC" is the only market named anywhere.
- Pre-launch conclusion: not a live venue. "Presale live" is true only as a token sale page [H].

## Kind and market model

- Claimed: unified platform for prediction markets, binary options and (Phase 5) perpetuals [H, site FAQ and whitepaper].
- Architecture claim: Solana; hybrid AMM plus order book "Trading Engine"; modules Market Factory, Trading Engine, Collateral Vault, Settlement Module, Governance Module. Collateral is "stablecoins and other approved assets" [H, https://seerdex.gitbook.io/seerdex-whitepaper/platform-architecture.md]. No addresses, no outcome-token description, no status (mainnet/testnet) [H, NOT FOUND].
- Binary / categorical / scalar: NOT FOUND (searched: whitepaper llms.txt index pages, platform-architecture, key-innovations index). Outcome tokenisation: NOT FOUND.
- Permissionless market creation: creators stake $SEERX; an "AI validation engine" screens for ambiguity, oracle verifiability and duplicates [M, paid press release https://chainwire.org/2026/06/12/seerdex-opens-multi-stage-presale-as-polymarket-competitor-on-solana/; H on whitepaper audit page mentioning AI validation and creator staking].

## Chains and collateral

- Platform: Solana (claimed, not deployed) [H whitepaper; M press release].
- $SEERX token: ERC-20 on Ethereum, bridgeable to Solana [H, https://seerdex.gitbook.io/seerdex-whitepaper/seerdex-ico/token.md]. The homepage itself names no chain; presale payment options ETH, BNB, ARB, POL, SOL, stablecoins, cards via web3paymentsolutions [H, homepage]. No contract addresses were published on any page read (the only 0x string in the page is a DIA oracle signature, not a contract) [H].
- Trading collateral: stablecoins/"approved assets", unspecified [H].

## Read API

- exists: **none**. NOT FOUND (searched: homepage HTML links, whitepaper llms.txt index, gitbook platform-architecture; hosts api./app./docs.seerdex.com do not resolve; seerdex.com/api/markets returns the SPA HTML, not JSON) [H, fixture probe-2026-10-19.json].
- Whitepaper says "API/SDK: not mentioned" [H].
- No subgraph, program ID or IDL found. No websocket.

## Trade path

None. No contracts, no order endpoints. Any future Solana program would need a Solana-signing wallet; an EVM-only PayBox wallet could not trade it (only the ERC-20 presale on Ethereum is EVM-facing, and buying it is a token purchase, not a market trade) [M].

## PayBox reachability

Reachable: **no**. Reason: nothing to trade. Presale purchase of $SEERX is a speculative token buy, not a market leg, and out of scope. If a Solana program ships, a Solana credential would be needed, not an EVM one.

## Fees

- Claimed: 40% of trading fees go to $SEERX buybacks; staking tiers give up to 50% fee discounts [H, https://seerdex.gitbook.io/seerdex-whitepaper/seerdex-ico/tokenomics.md].
- Revenue model lists trading, market-creation, token-listing and liquidation fees with no percentages and no stated payer [H, https://seerdex.gitbook.io/seerdex-whitepaper/revenue-model.md]. Fee formulas: NOT FOUND.

## Resolution mechanism and dispute risk

- Multi-oracle: Chainlink, Pyth and UMA; "optimistic dispute resolution" mentioned with no windows, bonds or process [H, https://seerdex.gitbook.io/seerdex-whitepaper/oracle-infrastructure.md].
- Dispute risk: unquantifiable; mechanism is marketing-level only. Permissionless creation plus AI screening implies ambiguous-wording risk if it ever launches [M].

## Geo / ToS / automation

- Operator: SeerDEX Products LTD, Marshall Islands, registered at Ajeltake Island; terms and privacy policy dated 2026-04-30 [H, homepage embedded legal text].
- Terms: users must be 18+, not in jurisdictions where "token sales, digital assets, or derivatives trading is prohibited", not sanctioned; "Prohibited use" bans market manipulation, exploiting vulnerabilities, bypassing security. "non-custodial ... does not operate as a broker, dealer, exchange". Nothing explicit on bots/automation [H].
- Press release says purchases under $1,000 need no KYC [M, paid PR].

## Audit and trust signals

- CredShields audit covers the **$SEERX token contract only** (report URL https://seerdex.com/assets/documents/credshield_audit.pdf; not downloaded/read this session); trading contracts "will receive the same review before mainnet" [H, https://seerdex.gitbook.io/seerdex-whitepaper/seerdex-ico/audit.md]. The homepage badge says "Audit: LIVE" with no auditor name on the badge [H].
- Tokenomics: 20B supply, 12.2B circulating at launch; 40% marketing, 24% project development, 15% ecosystem, 15% liquidity, 6% staking [H]. A 40% marketing allocation plus bonus-for-larger-buys presale, a paid press release and a placeholder-quality site are characteristic of low-credibility presales. [M opinion].
- Footer reads "(c) 2026 SeerDEX KINETIC VOID" and the page includes a third-party iframe disclaimer on cloudfront [H]. Team: a single founder named in the paid PR [M]; not independently verified.

## Liquidity

NONE measurable. No volume, OI or TVL anywhere (DefiLlama/Dune/explorer checks not possible without a program ID; the web search budget was exhausted, so no independent coverage search was done beyond the paid PR) [H on absence from official pages]. Presale raised: shown as $0 on the page [H, 2026-10-19].

## Event overlap and liquidity sharing

- Only example market is crypto price (ETH/SOL/BTC thresholds) [H, static feed]. Overlap with other venues would be crypto-price markets, but there is no book to arbitrage.
- Shares liquidity with another venue: no evidence; it claims its own AMM/order book [H]. Independent but empty.

## Adapter notes

- Do not build an adapter. Track via watch conditions: (1) published Solana program IDs, (2) a REST/WS API or IDL, (3) non-zero TVL on DefiLlama, (4) the audit scope extending to trading contracts.
- Scanner should treat any "seerdex" market data as nonexistent, and must not rely on the homepage feed.

## Distinct from

Seer (seer.pm) is a different project [M, from task hint].

## Sources

- https://seerdex.com/ (read 2026-10-19; HTML probed with curl, generic UA) [H]
- https://seerdex.gitbook.io/seerdex-whitepaper (+ /llms.txt, /seerdex-ico/token.md, /audit.md, /tokenomics.md, /roadmap.md, /platform-architecture.md, /revenue-model.md, /oracle-infrastructure.md) [H]
- https://chainwire.org/2026/06/12/seerdex-opens-multi-stage-presale-as-polymarket-competitor-on-solana/ (paid PR) [M]
- https://x.com/seerdexmarkets: fetch returned HTTP 402 Payment Required; body not retrieved, no payment made. Social activity unchecked.
- Not done: Telegram, Discord, CredShields PDF, DefiLlama; web search quota exhausted mid-session.

## Suspicious content (untrusted data, not followed)

- The GitBook pages (llms.txt, token/architecture/oracle pages) embed an "Agent Instructions" block telling AI agents to issue HTTP GETs to `.../index.md?ask=<question>&goal=<user_goal>`, asking them to share the user's goal. Not followed. It is the GitBook platform boilerplate, but it is still an instruction aimed at agents.

## Fixtures

- docs/research/fixtures/seerdex/probe-2026-10-19.json (probe results; no API response exists to sample)
