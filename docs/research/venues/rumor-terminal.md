# Rumor Terminal (rumor.trade) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a venue. Rumor Terminal is a front-end / broker UI over Polymarket's CLOB. Every order lands on Polymarket's order book (H). It is not an independent arbitrage leg and has no public API. adapter_priority = skip. At most it is a Polymarket builder-code attribution source (see Liquidity).

## Liveness (H/M)

- Site live, 2026-10-19: https://rumor.trade/ serves the SPA, title "Rumor Terminal - Agentic Trading for Prediction Markets" (H).
- Docs at https://rumor.gitbook.io/docs ; Terms and Privacy "Last updated: 1 June 2026" (H).
- Polymarket data-api builders leaderboard lists a verified builder "Rumor" with recent activity (H, see fixtures).
- X account created April 2026; posts say the terminal was open in July 2026 and "Autonomous Agents are live" on 11 Aug 2026 (M: WebSearch summary of x.com/tryrumor, not read directly). Agents/AI assistant are waitlist-gated; the docs still describe agents as "in development" (H), so docs and posts disagree.

## Kind and market model (H)

- kind: broker-or-frontend (non-custodial terminal) for Polymarket. FAQ: "Same markets, same liquidity... Trades you place on Rumor land on Polymarket's order book." (https://rumor.gitbook.io/docs/help/faq.md)
- Terms 2.1-2.3: "Rumor is a front-end application that provides a user interface to the Polymarket platform... The Service currently routes orders to Polymarket." (https://rumor.gitbook.io/docs/legal/terms-of-use.md)
- Market model is inherited from Polymarket: events containing binary markets, CLOB, Yes/No outcome tokens, split/merge of $1 into Yes+No (docs: markets/events-vs-markets, placing-orders/split-merge in llms.txt index). Order types: market/limit, FAK/FOK, limit expiry (H, llms.txt).
- Marketing says "more venues coming" (M, search summary). Terms 2.2 uses generic "External Platform" language. No second venue is live as of today (H: docs and Terms name only Polymarket).

## Chains and collateral (H)

- Polygon; collateral pUSD on Polygon (docs deposit page: "fund your wallet with pUSD on Polygon via Glide"). Terms 7: transactions executed on Polygon.
- Deposits/withdrawals bridged cross-chain by Glide (deposit.paywithglide.xyz); wallets via Privy (embedded or external). Bundle also references relayer-v2.polymarket.com/transaction (H, bundle).

## Read API

- exists: none (official). FAQ: "There's no public API at the moment. If you have a high-volume or institutional use case, reach out" (H).
- The front-end bundle (https://rumor.trade/assets/index-9ikhf8nQ.js) references first-party paths such as /api/trading/polymarket/order, /api/trading/orders, /api/user/open_positions, /api/user/trades, /api/ai/conversations (H: strings in bundle). These are undocumented, session-authenticated (Privy), and Terms 10 forbids robots/scrapers/automated access without written consent. I did not call them. Do not build on them.
- Market data should come from Polymarket directly (already covered by the parallel workflow).
- Only usable public data about Rumor itself is Polymarket's builder leaderboard: GET https://data-api.polymarket.com/v1/builders/leaderboard?timePeriod=ALL|MONTH|WEEK|DAY&limit=50&offset=N (H, unauthenticated, confirmed 2026-10-19). Row shape: rank (string), builder, builderCode (bytes32 hex), volume (USD number), activeUsers, verified, builderLogo. Also saw /v1/builders/volume (time series per builder, H, shape only).
- Fixture: docs/research/fixtures/rumor-terminal/polymarket-builders-leaderboard-rumor-2026-10-19.json ; docs index: docs/research/fixtures/rumor-terminal/gitbook-llms.txt.

## Trade path

- None for third parties. Rumor has no API; programmatic trading must go straight to Polymarket CLOB (separate spec). Rumor's own flow: one Privy sign-in signature creates a session signer which signs subsequent order place/cancel/split/merge without further prompts; deposits/withdrawals need explicit wallet signatures (H, custody page).
- Rumor attributes orders to Polymarket via builder code 0x44cd41c8...a32a2 (H, leaderboard). An agent trading Polymarket directly would not need Rumor.

## PayBox reachability

- paybox_reachable: no (as a distinct venue). An EVM wallet could only trade Polymarket on Polygon (via Polymarket's own signed-order flow), not "Rumor"; Rumor adds no new reachable liquidity. Attaching Rumor's builder code would only route fee/attribution, not change execution (M: inference from Polymarket builder-code model).

## Fees (H)

- Rumor charges nothing: "Nothing on Rumor's side - no surcharge in the trade panel". Trading fees follow Polymarket's schedule; deposits incur Glide bridge fee + source-chain gas (https://rumor.gitbook.io/docs/wallet-and-funds/fees.md). Terms 8.1 service fees section not quoted in detail. No fee formula is given (NOT FOUND in Rumor docs; defer to Polymarket).

## Resolution (H)

- Via Polymarket: Terms 7.4 "Markets are resolved by the UMA Optimistic Oracle in accordance with each market's pre-defined rules. Rumor is not responsible for any disputes". Dispute risk is identical to Polymarket's (UMA), and correlated, not diversified.

## Geo / ToS / automation (H)

- Restricted jurisdictions (Terms 3.2) include the United States, UK, Canada, Australia, Singapore, France, Germany, Italy, Belgium, Netherlands, Hungary, Poland, Slovakia, Thailand, Taiwan, plus a broad sanctions list. VPN circumvention is a material breach (3.4).
- Terms 10: no "robot, spider, scraper, crawler, or other automated means to access the Service ... without our prior written consent". Governing law Panama; ICDR arbitration.
- Operator identity: "Rumor Trade" (Panama law); no named entity beyond that (NOT FOUND).

## Liquidity (H, dated)

- None of its own (all on Polymarket CLOB).
- Attributed volume via Polymarket builder leaderboard, fetched 2026-10-19: ALL-time rank 100, volume $3.65M, 66 active users; MONTH rank 46, $1.01M, 26 users; WEEK rank 34, $131k, 3 users; absent from DAY top 300. For scale, rank 1 (betmoar) is $2.34B all-time. Rumor is tiny. Note leaderboard time-windows are Polymarket's definition (not verified exactly).

## Event coverage / overlap

- Identical to Polymarket (sports, politics, crypto, macro, etc.). Overlap with other venues is only through Polymarket. Not an independent leg.

## Shares liquidity with

- Polymarket (100%). Duplicate liquidity.

## Adapter priority: skip

Reasons: front-end over Polymarket, no API, ToS bans automated access, US-restricted, trivial volume. Revisit only if Rumor adds a second venue or a documented public/agent API (watch the waitlist/agents announcement and https://rumor.gitbook.io/docs/llms.txt). A possible low-value use: track the Rumor builder code's volume on Polymarket as a minor retail-flow signal (P2-signal at most, not worth building).

## Suspicious content

- None found. The JS bundle, docs and Terms contained no instructions aimed at AI agents.

## Not found

- Public/agent API or MCP; fee formulas; other live venues; liquidity/TVL figures from Rumor itself; independent audits or reviews; named company/legal entity details; direct read of the X posts (only via search summary).

## Sources

1. https://rumor.trade/ (H) - title/meta; SPA bundle https://rumor.trade/assets/index-9ikhf8nQ.js (H)
2. https://rumor.gitbook.io/docs and https://rumor.gitbook.io/docs/llms.txt (H)
3. https://rumor.gitbook.io/docs/help/faq.md (H)
4. https://rumor.gitbook.io/docs/wallet-and-funds/fees.md (H)
5. https://rumor.gitbook.io/docs/wallet-and-funds/custody.md (H)
6. https://rumor.gitbook.io/docs/legal/terms-of-use.md, last updated 1 June 2026 (H)
7. https://data-api.polymarket.com/v1/builders/leaderboard (H, 2026-10-19)
8. WebSearch (extended) summary referencing https://x.com/tryrumor and https://waitlist.rumor.trade/ (M)

Confidence: high that it is a Polymarket front-end with no API; medium on agents timeline.
