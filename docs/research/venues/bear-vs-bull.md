# Bear Vs Bull (bvb_matic) - venue spec

Researched 2026-10-19. Verdict: **dead / inactive. adapter_priority = skip.**

Confidence tags: H = read first-hand this session in a primary source; M = secondary/inferred; L = weak/stale.

## Status

- DefiLlama lists it as "Prediction Market", chain Polygon, twitter `bvb_matic`, description "a platform that allows players to make predictions on the price of bitcoin" [H, https://api.llama.fi/protocol/bear-vs-bull]. The record has `url: ""` and `deadUrl: true` (DefiLlama has flagged the website as dead) [H, same].
- DefiLlama fees series (adapter `fees/up-vs-down-game.ts`): first non-zero day 2023-08-13, last non-zero day **2024-06-24** (23 USD-equivalent units), and zero every day since, through 2026-10-18. 24h, 7d, 30d and 1y totals are all 0; all-time total 14,028,648 (the unit is "native gas token" amounts; it counts raw `amount * 0.05` summed across events, so the USD interpretation is unverified) [H, https://api.llama.fi/summary/fees/bear-vs-bull, fixture saved].
- No official site found. Guessed domains bearvsbull.io and bvb.finance do not resolve; bearvsbull.com gave a TLS error [H, curl, 2026-10-19]. Not a confirmed owner of these domains, so ignore.
- The X account page returned HTTP 200 but is JS-rendered so no content could be read [H for the 200, nothing learned].
- WebSearch was unavailable (session budget exhausted), so no independent confirmation of shutdown, team statements or a rebrand. Treat "dead" as strongly supported by on-chain-derived volume (zero for 16 months) but not announced anywhere I could read [M].

## Market model

- Short-interval "up vs down" BTC price game: players pick a side ("prediction" string) in time-bounded rounds (`roundStartTime`), pooled by `poolId` with a running `newTotal` [M, inferred from event ABI in the DefiLlama adapter].
- Looks parimutuel (pool-based, 5% of each stake taken as fee in DefiLlama's formula) rather than order book or AMM. Outcomes are not tokenised: a `TradePlaced` event records sender, amount and prediction string; no outcome tokens [M, inferred from ABI only; contract source not read].
- Event ABI also carries `avatarUrl`, `countryCode`, `whiteLabelId`, which suggests a white-label game backend (the same contract may serve other front ends) [M].

## Chain / collateral

- Polygon. Contract used by DefiLlama: `0xFAc9D58Cc823f75E0B275208FE69077e7a4CacaB` (public contract address, not a user wallet). `eth_getCode` on a public Polygon RPC (drpc) returned non-empty bytecode, so the contract still exists, which says nothing about being operated [H, https://github.com/DefiLlama/dimension-adapters/blob/master/fees/up-vs-down-game.ts and RPC call 2026-10-19].
- Collateral: DefiLlama adds fees via `addGasToken`, so stakes appear to be native POL/MATIC (payable), not an ERC-20 [M, inferred].

## Read API

- Official API: NOT FOUND (searched: DefiLlama record, guessed domains, no site/docs link available; web search unavailable).
- Only on-chain: `TradePlaced(bytes poolId,address sender,uint256 amount,string prediction,uint256 newTotal,bytes indexed indexedPoolId,address indexed indexedSender,string avatarUrl,string countryCode,int64 roundStartTime,string whiteLabelId)` on the contract above [H, DefiLlama adapter source]. No resolution/claim event or ABI was read.
- Unauthenticated sample shapes saved (only DefiLlama, not the venue): `docs/research/fixtures/bear-vs-bull/defillama-protocol.json`, `docs/research/fixtures/bear-vs-bull/defillama-fees-summary-trimmed.json`.

## Trade path / PayBox

- Programmatic trade path: NOT FOUND. A Polygon EVM wallet could in principle send a payable tx to the contract (transaction proposal), but the function ABI is unknown (source/verification not read), the front end is dead, and there is no activity. paybox_reachable = no (chain reachable in principle, venue not usable) [M].

## Fees

- DefiLlama models fees as 5% of each stake, all revenue to protocol [M, adapter source; the true on-chain fee was not verified].

## Resolution

- NOT FOUND. Probably a price oracle or backend-settled round; unknown, so dispute and manipulation risk cannot be assessed.

## Geo / ToS / automation

- NOT FOUND (no site reachable). Event field `countryCode` hints at geo tracking [M].

## Liquidity

- Current: zero. 24h, 7d, 30d and 1y fees all 0 as of 2026-10-19; last activity 2024-06-24 [H, DefiLlama fees API]. Peak was ~2023-08 to 2023-09 with ~50k units/day of fee-adapter "fees" on the series, noting those figures are in an unverified unit [H for the series, unit M].

## Event overlap / arbitrage

- Only BTC short-term up/down. Conceptually overlaps Polymarket/Kalshi BTC up/down contracts, but there is no live liquidity, and a parimutuel pool with no tokenised exit is not hedgeable as an arb leg. Independent of other venues, but irrelevant while dead.

## Adapter recommendation

- skip. Dead since mid-2024, dead website, no API, no tradable outcome tokens. Revisit only if a DefiLlama fee series restarts.

## Sources

- https://api.llama.fi/protocol/bear-vs-bull (H)
- https://api.llama.fi/summary/fees/bear-vs-bull (H)
- https://github.com/DefiLlama/dimension-adapters/blob/master/fees/up-vs-down-game.ts (H, via gh api)
- https://defillama.com/protocol/bear-vs-bull (WebFetch returned 403; not read)
- Polygon public RPC eth_getCode (polygon.drpc.org), 2026-10-19 (H). polygon-rpc.com refused (tenant disabled).
- Not done: WebSearch (budget exhausted), contract source on Polygonscan, X timeline (JS-rendered).
