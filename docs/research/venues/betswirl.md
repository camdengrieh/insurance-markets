# BetSwirl - venue spec (2026-10-19)

Verdict: skip. Not a prediction market (house-banked casino/dice protocol), and the main domain now 301-redirects to riviera.gg. Activity on DefiLlama is near zero in H2 2026.

Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Summary

| Field | Finding | Tag |
|---|---|---|
| Kind | On-chain casino / gambling protocol (player vs house bankroll, randomised games). DefiLlama files it under "Prediction Market" only as a category label; no event markets found. | M |
| Still live? | Doubtful. `https://www.betswirl.com` and `https://docs.betswirl.com` both return HTTP 301 to `https://riviera.gg/?utm_source=betswirl&utm_medium=redirect`. DefiLlama flags `deadUrl: true`. Fees ~$0 since 2026-03-23 (one $0.02 print on 2026-05-11). | H (redirect, DefiLlama) |
| Rebrand? | The redirect target is "Riviera - Play. Win. Earn Forever." The page is a JS shell with no readable content. I could not confirm that Riviera is BetSwirl's successor beyond the redirect itself. | M |
| Market model | Not applicable: no order book, AMM or parimutuel event pools found. Games are coin-toss/dice style against a house bankroll, with outcomes decided by a randomness oracle (per Token Terminal's description, M). No outcome tokens. | M |
| Chains | DefiLlama lists Polygon, BNB, Avalanche, Arbitrum, Base, Unichain. The staking-contract adapter covers bsc, polygon, avax, arbitrum, base. | H (DefiLlama adapter source) |
| Collateral | Native gas tokens and ERC-20s per game (not verified; docs are unreachable). BETS token (`0x94025780a1aB58868D9B2dBBB775f44b32e8E6e5`) is the protocol token. | M |
| Read API | NONE found. No public REST/WS for markets, books or trades. NOT FOUND (searched: GitHub BetSwirl org repo list, betswirl.com, docs.betswirl.com redirect, web search). The old docs are only reachable via the redirect; the README of `BetSwirl/ui-react-demo` points to `https://docs.betswirl.com/developer-hub/...`, which no longer resolves to docs. | H/M |
| Trade path | Only through an SDK/UI package (`@betswirl/ui-react`, per demo repo package.json) that sends on-chain bet transactions. No order placement or signed-order API. | H |
| PayBox reachable | In principle yes (plain EVM transactions on Polygon/Base/Arbitrum/BNB/Avalanche), but pointless: there is no event market to take a side of. | M |
| Fees | House edge baked into payout multipliers. Revenue DefiLlama: $1.658M all-time fees; about $43.9K YTD 2026, almost all in Q1 (Mar 19-23 prints of 268, 538, 3756, 22, 26 USD). | H |
| Resolution | Instant, via randomness oracle (Chainlink VRF per BetSwirl's marketing, not verified this session). No dispute process. No event resolution. | L |
| Geo/ToS/automation | NOT FOUND (docs unreachable). Casino products are generally geo-restricted; assume restricted. | L |
| Liquidity | DefiLlama (fetched 2026-10-19): TVL $0 staking on all chains, $986 in the Unichain Gamma BETS pool (pool2). Historic peak of the staking series ~$2.47M. Token market cap ~$17K (Coinbase page, via search snippet, M). | H |
| Category overlap | None. No sports/politics/crypto-price/macro event markets, so no arbitrage leg. | M |
| Shared liquidity | Own house bankroll; nothing shared with other venues. | M |

## Why skip

1. It is a casino, not an event market. There is no probability to compare with other venues.
2. No read API and no trade API exist.
3. The brand is redirected, DefiLlama marks the URL dead, and fee volume has been zero since March 2026.
4. Total on-chain TVL is under $1K.

Only reason to revisit: if riviera.gg later launches real prediction markets. Re-check quarterly via DefiLlama (`https://api.llama.fi/protocol/betswirl`), cheap and unauthenticated.

## Evidence detail

- DefiLlama protocol record: id 1911, category "Prediction Market", chains Unichain/Avalanche/Polygon/Binance/Arbitrum/Base, `deadUrl: true`, listedAt 2022-07-18, current TVL 0 except Unichain pool2 $986.04. Fixture: `docs/research/fixtures/betswirl/defillama_protocol_2026-10-19.json`. (H)
- DefiLlama fees: totalAllTime $1,658,170.02; no 24h value; nonzero 2026 daily values listed in `docs/research/fixtures/betswirl/defillama_fees_2026-10-19.json`. (H)
- DefiLlama TVL adapter lists BETS staking contracts on BSC `0x20Df34eBe5dCB1082297A18BA8d387B55fB975a0`, Polygon `0xA0D5F23dc9131597975afF96d293E5a7d0516665`, Avalanche `0x9913EffA744B72385E537E092710072D21f8BC98`, Arbitrum `0xA7Dd05a6CFC6e5238f04FD6E53D4eFa859B492e4`, Base `0x585ae1667d83E93f77ebEb6BbC6d4c19A3879248`, and a Unichain Gamma vault `0xf9aDaa55014242c1005dB307C4e41c541f26bAAA`. These are staking/LP contracts, not game or market contracts. (H)
- GitHub org `BetSwirl`: 15 public repos; most are forks or tooling (DefiLlama-Adapters fork, goat, agentkit, token lists). Only own-product repos are `ui-react-demo` and `miniapp-ui-react-demo` (last push 2025-12-09) and `web` (last push 2024-12-05). No API/indexer/subgraph repo found. (H)
- Token Terminal describes it as a non-custodial betting platform on Polygon, BNB Chain and Avalanche with coin-toss/dice-style games (search-engine summary, M).
- Predictionindex.xyz lists it as "live" and DefiLlama as "Prediction Market"; both labels look stale relative to the redirect and zero fees. (M)

## Sources

- https://www.betswirl.com (HTTP 301 to riviera.gg, header read 2026-10-19) H
- https://docs.betswirl.com (HTTP 301 to riviera.gg, 2026-10-19) H
- https://riviera.gg/ (JS shell, title/tagline only; no AI-agent instructions) H
- https://api.llama.fi/protocol/betswirl and https://api.llama.fi/summary/fees/betswirl?dataType=dailyFees (fetched 2026-10-19) H
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/betswirl/index.js H
- https://github.com/BetSwirl (org repo list via gh api) and BetSwirl/ui-react-demo README/package.json H
- https://defillama.com/protocol/betswirl, https://tokenterminal.com/explorer/projects/betswirl/about, https://www.coinbase.com/price/betswirl (via web search snippets only) M
- https://predictionindex.xyz/ecosystem (discovery source, per task brief) M

## Gaps

- Could not read the original BetSwirl docs (redirected away); web search budget was exhausted, so game list, fee percentages, VRF provider, and geo rules are unverified.
- Relationship between BetSwirl and Riviera not confirmed.
- No suspicious or agent-directed content encountered.
