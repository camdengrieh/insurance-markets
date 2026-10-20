# Yosoku (yosoku.fun) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

adapter_priority = skip. The main app (yosoku.fun) returns HTTP 402 `DEPLOYMENT_DISABLED` (Vercel deployment disabled) on 2026-10-19, so there is no working front end. The only public deployment evidence (official SDK README, last push 2026-02-12) says "Currently deployed on Solana Devnet", i.e. play-money USDC. No public read API, no mainnet program ID, no volume. The prediction-index "scalar / live" label is wrong on both counts (the docs describe binary only).

## Liveness (H)

- https://yosoku.fun, /docs, /api/markets: HTTP 402, body "Payment required / DEPLOYMENT_DISABLED", header `x-vercel-error: DEPLOYMENT_DISABLED` (curl, 2026-10-19). This is a Vercel account/billing-style disable; the app is down. (H)
- www.yosoku.fun and api.yosoku.fun do not resolve (H).
- https://docs.yosoku.fun (GitBook) is up, 200 (H). Docs contain no launch date, no dates at all except example text from 2025.
- predictionindex.xyz/ecosystem lists Yosoku: status live, Solana, outcomeTypes=scalar, mechanism n/a, website yosoku.fun, volume n/a, no last-updated (H, WebFetch + local fixture docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json). Contradicted by the above; the index's status label is self-reported (it also lists Dome as live after Dome ended).
- GitHub org YosokuSolana (created 2026-02-09): repos yosoku-sdk (last push 2026-02-12) and yosoku-twitter-agent (last push 2026-02-10). npm `yosoku` 0.1.0 published 2026-02-09, no later versions (H). Twitter agent README says it was "Built For Colosseum Agent Hackathon 2026". So it is a hackathon project, nothing newer than Feb 2026 found. (H)
- No independent news/coverage found. WebSearch (standard/extended) returned nothing about Yosoku other than the index; a second search was blocked by the session search budget. NOT FOUND (searched: "Yosoku Solana prediction market scalar"; "yosoku.fun" blocked by budget).

## Kind and market model (H, docs.yosoku.fun about/trading-guide)

- Binary Yes/No shares, price $0.01-$0.99, winner pays $1.00. Docs do not mention scalar markets; the "scalar" label is not supported. A "GDP growth" example uses multi-leg buckets (<0%, 0-2%, ...), i.e. categorical via legs.
- Two market structures: Regular (one Yes/No pair) and Multi-Leg (several independent Yes/No pairs, each with its own books; leg prices need not sum to 100%).
- Fully on-chain central limit order book (limit, market, covered bids), 512 orders max per side per book (FAQ). Yes and No have separate books; merge equal Yes+No for $1.00.
- SDK price system: integer ticks 1-999, 1 tick = $0.001, YES+NO = 1000 ticks; USDC 6 decimals (H, SDK docs/price.md). Docs say cents; SDK says 0.1c ticks (minor inconsistency).
- Outcome tokenisation: positions are program accounts (Position PDA per market/leg/user/side), not SPL tokens as far as docs say (M; "position account ... rent returned").

## Chains and collateral

- Solana; USDC collateral held in a program vault (H). Resolution escalation goes through LayerZero to UMA on Ethereum (H, docs).
- Deployed network per SDK README: Solana Devnet. Program ID `8p6MKtMGGugZMy2HGXtL3uBb11y7xuzXmbMbQgNmWVUQ`, USDC mint `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr` (a devnet test mint, not Circle's mainnet USDC) (H, https://github.com/YosokuSolana/yosoku-sdk README). No mainnet program ID found anywhere. Not verified on-chain (would need a JSON-RPC POST; out of scope).

## Read API

exists = onchain-or-subgraph-only (and only on devnet).
- Docs FAQ "Is there an API?": no REST API; "The Yosoku program is open source on Solana. Developers can interact with it using the Anchor framework or raw Solana transactions." (H)
- SDK (npm `yosoku` 0.1.0; ISC licence): `PredMarketClient.readOnly(connection)`, `client.accounts.getMarket/getOrder/getPosition/getOrderBooks`, `client.events.onTrade/onOrderPlaced/onOrderCancelled/onPositionClaimed/onPositionUpdated/onSharesMerged` via Solana WebSocket log subscriptions (H).
- Base URLs: none official. Docs: https://docs.yosoku.fun (llms.txt, llms-full.txt available).
- Auth/limits: none documented (RPC provider limits apply).
- No fixtures saved: no REST endpoint exists and the app returns 402. Nothing to sample.

## Trade path

On-chain Anchor instructions signed by the user's Solana keypair: limitBid, limitAsk, coveredBid, marketBuy, marketSell, claim/merge/cancel/redeem, propose/finalize resolution (H, SDK README). No off-chain signed orders, no API keys. Only the SDK / raw Anchor tx on devnet is known.

PayBox reachability: partial in principle, no in practice. A PayBox Solana wallet could sign Anchor transactions in theory (instruction data from the SDK IDL), but only on devnet with a test USDC mint, and PayBox has no Yosoku plugin (not searched; no PayBox calls made). An EVM wallet (Base/Ethereum/BNB/Arbitrum/Polygon) cannot trade it. paybox_reachable = no.

## Fees (H, docs fees.md / faq.md)

- Taker fee on market buy/sell orders only: protocol 0.75% + creator 0.50% = 1.25% of trade value; optional referral 0.25% is carved out of the protocol fee (total unchanged). No fee on limit fills, cancels, merges, redemptions. Charged to the taker. Solana tx fees <$0.01 in SOL (claimed).
- Bonds: proposer 100 USDC, disputer 200 USDC (docs say 1000 USDC in one table row; internal inconsistency), 24h dispute window.

## Resolution (H)

- UMA mode: anyone proposes outcome (Yes/No/Split) with a bond, 24h dispute, dispute escalates to UMA on Ethereum via LayerZero.
- WalletVote mode: creator names 1-10 voter wallets; >50% majority resolves; otherwise 50/50 ($0.50 per share). Creator-controlled, so high manipulation/trust risk.
- Markets passing the event deadline with no proposal can be resolved 50/50 by anyone; "after this deadline passes market is automatically resolved to 50/50" (docs) - a big risk for arbitrage legs (hedge on another venue loses its pair).
- Any wallet can create markets; parameters immutable after creation; no curation except an optional "verified" flag.

## Geo / ToS / automation

NOT FOUND (searched: docs.yosoku.fun llms-full.txt; yosoku.fun unreachable). No terms page, no geoblock statement, no bot policy. The protocol is permissionless on-chain; the twitter-agent bot is evidence that automation is expected (M).

## Liquidity

NOT FOUND. No volume/OI/TVL published (PI lists volume n/a). Devnet deployment means any on-chain figures are test funds. Treat as zero real liquidity (L-confidence conclusion from absence).

## Event overlap and shared liquidity

Docs examples are crypto price, Fed cuts, World Cup, elections, GDP - categories that overlap Polymarket/Kalshi - but there are no known live markets. Liquidity is independent (own CLOB, no aggregation with another venue found), but with no real liquidity it is not a usable arbitrage leg. Markets would be unvetted user-created, with custom rules.

## Priority

skip: app down (402), devnet-only deployment, hackathon project with no commits after Feb 2026, no API, no liquidity. Revisit only if a mainnet program ID plus a working front end appear. If ever integrated: Solana RPC getProgramAccounts / SDK read-only client plus logsSubscribe; no REST.

## Suspicious content

None found. (Docs contain no AI-agent-directed instructions. Note the docs.yosoku.fun HTML includes a generic "For the complete documentation index, see llms.txt" banner, which is standard GitBook text.)

## Open questions

- Is there a mainnet deployment of the program (check Solana RPC/explorer for the program ID above, and for any other)?
- Why was yosoku.fun deployment disabled (billing vs shut-down)? Check @YosokuSolana on X (not accessible here).
- Bond table inconsistency 200 vs 1000 USDC.

## Sources

- https://predictionindex.xyz/ecosystem (H, listing; self-reported status)
- https://yosoku.fun (H, 402 DEPLOYMENT_DISABLED, 2026-10-19)
- https://docs.yosoku.fun/ , https://docs.yosoku.fun/llms.txt , https://docs.yosoku.fun/llms-full.txt (H; about, trading guide, market creation, resolution, fees, FAQ)
- https://github.com/YosokuSolana/yosoku-sdk (README, docs/events.md, docs/price.md; H; last push 2026-02-12; commit message co-authored by an AI assistant)
- https://github.com/YosokuSolana/yosoku-twitter-agent (README; H; last push 2026-02-10; Colosseum Agent Hackathon 2026)
- https://registry.npmjs.org/yosoku (H; v0.1.0, 2026-02-09)
- GitHub search for "yosoku": unrelated repos only (M).
