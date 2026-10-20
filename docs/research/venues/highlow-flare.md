# HighLow (Flare) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

Adapter priority: **skip**. HighLow is a pre-audit, pre-mainnet, Coston2 (Flare testnet) demo. It holds no real-money liquidity, has no API, and covers only a 100-second BTC/USD direction market. It cannot be an arbitrage leg today. Re-check only if a Flare mainnet (chain 14) deployment appears.

## Is it live?

- Website https://highlow.trade returns a page; the app at https://app.highlow.trade returns 200, title "HighLow | BTC in 100 Seconds", description "...on Flare Coston2" (H: curl 2026-10-19).
- Homepage status text: "pre-audit and pre-mainnet, currently running on Coston2" (H: WebFetch https://highlow.trade).
- Repo README: "The project is currently pre-audit and pre-mainnet" (H: https://github.com/a16k-lab/highlow-contracts README.md).
- Repo last pushed 2026-08-15 (H: gh api repos/a16k-lab/highlow-contracts, pushed_at 2026-08-15T02:09:46Z). Not archived.
- No mainnet address is published anywhere I found. NOT FOUND (searched: README, SECURITY.md, homepage, app HTML head). WebSearch was unavailable (session budget exhausted), so no independent news or volume coverage was checked.
- Verdict: the product is still live, but only as a testnet demo. As a real-money venue it is not live. (H)

## Kind and market model

- Kind: on-chain, single-contract, short-horizon binary market (HIGHER or LOWER vs an opening BTC/USD anchor). (H: README)
- Pricing: LMSR for entry and early exit, `C(H,L) = b*ln(exp(H/b)+exp(L/b))`. Buy cost = C(after)-C(before); sell proceeds = C(before)-C(after). `b` is frozen per round. (H: README)
- Settlement: parimutuel. Winners get `pool * userWinningShares / totalWinningShares`. VOID refunds are proportional to remaining cost basis. (H: README)
- Virtual liquidity is math-only; the real pool starts at zero and holds only trader funds net of sells. (H)
- Outcome tokenisation: NOT an ERC-20/1155. Positions are internal contract accounting keyed by round id and side (`buy(id,isHigher,amount,minShares)`). Whether shares are transferable: NOT FOUND (I did not read the Solidity source; only README and the interface listing). (M)
- Round cadence: 120s on-time period. 90s trading, 10s lockout, 10s FTSOv2 close window, then next-anchor registration. Each round is a fresh binary market. (H: README)
- Single series per deployment (default BTC/USD). More feeds and N-outcome markets are roadmap only. (H)

## Chains and collateral

- Flare mainnet (chain id 14) is supported by the deploy script behind `ALLOW_MAINNET=true`. Live deployment is on Coston2 (chain id 114) using C2FLR, a faucet token with no value. (H: README "Flare deployment")
- Collateral on mainnet would be native FLR (18 decimals). No ERC-20 approval is used. (H)
- Contract addresses: NOT FOUND (searched: README, SECURITY.md, homepage text; app JS bundle not decompiled).

## Read API

- Official API: none. NOT FOUND (searched: homepage, README, SECURITY.md; GET https://app.highlow.trade/api/rounds returned the Next.js 404 page; GET https://highlow.trade/api/markets returned 404 NOT_FOUND). (H)
- Data would have to come from on-chain reads against the HighLow contract on Flare (Coston2 for now). Quote functions in the interface: `quoteBuy(id,isHigher,amount)`, `quoteSellGross`, `quoteSellNet`. Round state getters were not enumerated. (H for function names, from README; ABI not read)
- Auth, rate limits, websocket: not applicable / none documented.
- Fixtures: none saved, since there is no public read API.

## Trade path

- Programmatic: direct EVM contract calls `buy(id,isHigher,amount,minShares) payable`, `sell(id,isHigher,shares,minOut)`, `claim(id)`. No order book, no signed off-chain orders. (H: README)
- Lifecycle functions (`startRound`, `finalizeFromFtso`, `finalizeWithManualPrice`, `startNextRound`) are oracle-only. (H)
- `sell` and `claim` pay only `msg.sender`; the wallet must accept native currency. (H: SECURITY.md L2)
- Buy limits on the Coston2 profile: 0.01 to 1 C2FLR per call. (H) Mainnet parameters are not published.
- PayBox reachability: **no**, for practical purposes. Flare (14) and Coston2 (114) are not in the EVM chain list named in the task (Base, Ethereum, BNB, Arbitrum, Polygon, Solana). I did not call PayBox tools, so Flare support is unverified (L). Even if raw tx proposals to Flare were supported, trades are 100-second rounds needing sub-minute signing and execution, which does not fit an approval-based flow, and there is no mainnet venue to trade.

## Fees

- Early sell fee 0.50% of gross proceeds (`SELL_FEE_BP = 50`), paid by the seller. (H: README)
- No buy fee, no claim fee is mentioned. Homepage "mentions" fees but does not quantify them. Owner can withdraw fees. (H/M)
- Gas on Flare plus MEV exposure (`minOut`/`minShares` needed). (H: SECURITY.md M2)

## Resolution and dispute risk

- Opening anchor and timely closing price both come from Flare FTSOv2 via one immutable `FtsoV2PriceSource`. The close must land in a 10s window after round end. (H)
- Trusted fallback: after the window, only the oracle address can call `finalizeWithManualPrice` with a typed price; it is flagged `MANUAL` on chain. The owner can rotate the oracle. (H: SECURITY.md H1, H3)
- Liveness risk: no permissionless timeout or auto-void. A missed oracle call locks the unsettled round and halts later rounds. (H: SECURITY.md H2)
- Opening-to-close deviation guard of 5% on the timely close (Coston2 profile). (H)
- No dispute process. Resolution is by contract logic plus a trusted operator fallback. Pre-audit; no independent audit published (the `audit/` directory holds only local scratch notes). (H)

## Geo, ToS, automation

- No terms of service, geo restrictions, or bot policy found on the homepage. NOT FOUND (searched: homepage text, README). Mainnet launch is gated on "legal and compliance clearance for the intended launch markets and jurisdictions" (H: README milestone 3), so restrictions are likely at launch (M).
- Contract-level access is permissionless for traders; nothing in the docs prohibits automation. (M)

## Liquidity

- Volume, OI, TVL: NOT FOUND (searched: homepage, README). Coston2 funds are faucet-issued with no monetary value, so any figure would be meaningless for arbitrage. Real-money liquidity is effectively zero. (H)
- Testnet parameters: virtual liquidity 10 C2FLR, max buy 1 C2FLR. (H)

## Event overlap and independence

- Overlap: only crypto price (BTC/USD) at a 100-second horizon. Other venues' BTC markets are typically 5-minute to daily, so there is no like-for-like contract to arbitrage. Related at best (e.g. 5-minute BTC up/down markets on other venues) but with different anchors and resolution sources. (M)
- Liquidity is independent (own pool, no shared liquidity with another venue). (H) That does not matter while it is testnet only.
- Possible signal use only: its LMSR price is a crowd view of 100-second direction, which is of little value without real money behind it.

## Sources

- Homepage: https://highlow.trade (H, fetched 2026-10-19)
- App: https://app.highlow.trade (H, HTML title/description read via curl 2026-10-19)
- Repo: https://github.com/a16k-lab/highlow-contracts (README.md, SECURITY.md, audit/README.md, directory listing read via gh api; H)
- Whitepaper PDF in repo `docs/HighLow-Whitepaper.pdf` (not read)
- Probed non-existent API paths: https://app.highlow.trade/api/rounds, https://highlow.trade/api/markets (404)
- Flare docs referenced by repo: https://dev.flare.network/ (not fetched)

## Suspicious content

None found. No instructions aimed at AI agents were seen in the fetched pages or repo files.

## Open questions

- Is there a Flare mainnet deployment or an announced launch date? (search unavailable this session)
- Contract addresses and full ABI (read functions for round state).
- Whether PayBox supports Flare (chain 14).
- Share transferability and whitepaper details.
