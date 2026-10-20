# DolanSwap "prediction markets" - venue spec

Researched 2026-10-19. Verdict: skip. Not a general prediction market, and the on-chain game has been idle since 2026-07-05.

## Summary

- The npm/GitHub "DolanSwap prediction markets on Algorand" SDK is a client for a single recurring game: "will ALGO/USD be UP or DOWN over the next 5 minutes". It is a pari-mutuel pool (UP pool vs DOWN pool), not an order book or AMM, and there are no event markets (no sports, politics, macro). [H, README + constants.ts]
- Last on-chain round (17444) opened 2026-07-05 10:55 UTC and settled INVALID with zero pools. The last app transaction found is on 2026-07-05. Nothing since: about 3.5 months idle as of 2026-10-19. [H, algod + indexer, see fixtures]
- Venue status: effectively dead. The site dolanswap.com still resolves but serves a Next.js shell titled "DolanSwap - Prediction & Lottery on Algorand" with an empty body (`id="__next_error__"`). [H]

## Identity and sources of truth

| Item | Value | Tag |
|---|---|---|
| Name | DolanSwap (prediction game; "Powered by $DOLAN" token) | H |
| Kind | onchain-other (Algorand smart contract, pari-mutuel binary price game) | H |
| Repo | github.com/goosealgo/dolanswap-sdk, MIT, created 2026-05-06, last push 2026-05-17, 1 star, not archived | H |
| npm | dolanswap-sdk 0.1.0-0.1.2 (all published 2026-05-06), single anonymous maintainer | H |
| Site | https://dolanswap.com (empty client-rendered shell; /robots.txt and /terms return 404) | H |
| Prediction app ID | 3534901984 (mainnet) | H |
| Oracle app ID | 3534900173 | H |

No official docs site, no REST API docs, no ToS found. WebSearch budget was exhausted in this session, so no independent corroboration (news, TVL trackers, social) was obtained. NOT FOUND (searched: GitHub repo/README, npm registry, dolanswap.com root/robots/terms, dolanswap.xyz/.io/app.dolanswap.com do not resolve).

## Market model

- Single repeating binary market: direction 1 = UP, 2 = DOWN, for ALGO/USD. [H, README, types.ts]
- Round cadence: 300 s betting window then 300 s live window (round start to lock to end); a new round every 5 minutes. Observed: round 17444 start 10:55:00, lock 10:55:09, end 11:00:09. [H]
- Outcomes: PENDING 0, UP 1, DOWN 2, DRAW 3, INVALID 4. Draw or Invalid refunds all bets with no fee. [H]
- Pari-mutuel: payout = bet x rewardPool / winningPool, where rewardPool = total pool less 3% fee. No outcome tokens: a bet is a box-storage record keyed by (round, address) holding amount, direction, claimed flag. Not transferable or tradable. [H, payout.ts, encoding.ts]
- Bet limits: 1 to 1,000 ALGO per wallet per round, one direction per wallet per round. [H]
- Unrelated "lottery" product is mentioned in the site title only. Nothing found on it. [M]

## Chain and collateral

- Algorand mainnet only. Collateral is native ALGO (payment txn to the app escrow address). [H]
- No EVM or Solana component.

## Read API

- Official public REST API: none. NOT FOUND. Reads are on-chain via any Algorand node/indexer. [H]
- SDK defaults to public Algonode: algod `https://mainnet-api.algonode.cloud`, indexer `https://mainnet-idx.algonode.cloud`. [H, constants.ts]
- Key reads (all unauthenticated GET, confirmed live 2026-10-19):
  - `GET /v2/applications/3534901984` -> global state keys: `current_round`, `treasury_accrued_fees`, `dev_accrued_fees`, `total_reserved_user_funds`, `last_distribution_time`, `oracle_app_id`, `admin`, `dev`, `treasury`. Fixture: algod_application_3534901984.json. [H]
  - `GET /v2/applications/3534901984/box?name=b64:<'r'(0x72) + uint64be(roundId)>` -> 114-byte round record: lockPrice, closePrice (scaled 1e8), startTime, lockTime, endTime, upPool, downPool, up/down/total/reward pool snapshots (uint64 microALGO), status @112, outcome @113. Fixture: algod_box_round_17444.json. [H]
  - Bet box: name 'b'(0x62) + uint64be(round) + 32-byte pubkey -> amount, direction, claimed. [H, source only, not fetched]
  - Bet history: indexer `/v2/accounts/{addr}/transactions?application-id=3534901984`. [H, source]
  - Oracle: app 3534900173 on-chain ALGO/USD price (scale 1e8), staleness limit 600 s. [H, source]
- Live reference price: SDK reads Coinbase `ALGO-USD` ticker (REST `api.exchange.coinbase.com/products/ALGO-USD/ticker`, WS `wss://ws-feed.exchange.coinbase.com`). This is a Coinbase feed, not a DolanSwap API. [H, price.ts]
- Auth/limits: none from DolanSwap. Algonode public limits are undocumented here; SDK self-throttles at 10 req/s. [H for SDK default, L for node limits]
- Websocket: none from the venue; SDK "events" are 5 s polling of boxes. [H]

## Trade path

- Programmatic: yes, via algosdk atomic group: payment txn (sender -> app escrow) + ABI call `place_bet(uint64 round_id, uint8 direction)` with round and bet boxes referenced. Claim via `claimWinnings`/`batchClaim`. [H, betting.ts]
- Signing: Algorand ed25519 account (mnemonic-derived in examples). Not an order book; no off-chain signed orders.
- PayBox reachability: no. An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) or a Solana wallet cannot sign Algorand transactions or hold ALGO natively. Reaching it would need a separate Algorand key, which PayBox does not appear to offer. [M, no PayBox Algorand support seen in this repo's docs; not verified against PayBox]
- Moot anyway: no rounds have been created since 2026-07-05.

## Fees

- 3% of the reward pool on winning rounds only: 1.5% treasury plus 1.5% dev. Draw/Invalid: zero fee. Paid out of the losers' pool, effectively by winners. [H, README, constants.ts]
- Network fees: standard Algorand min fee (about 0.001 ALGO per txn). [M]

## Resolution and dispute risk

- Settled by comparing lock price vs close price from the on-chain oracle app (3534900173), which appears to be pushed by the operator from an off-chain feed (Coinbase ALGO/USD per the SDK). Oracle updates and round creation require an operator/keeper. [M, inferred from constants + staleness check; oracle contract not read]
- Admin, dev, treasury addresses are set in global state, so there is centralised operator and admin control. No dispute process. Contract source not published (approval program is only bytecode). [H for state, M for inference]
- The halt on 2026-07-05 left round 17444 as INVALID: consistent with the keeper stopping or the oracle going stale (> 600 s). [M]

## Geo / ToS / automation

- NOT FOUND (searched: dolanswap.com /terms 404, /robots.txt 404, README). SDK explicitly ships bot examples (simple-bot.ts, simple-bot-btc.ts), so automation appears to be intended. [H for examples, L for permissibility]
- Gambling-style game with no stated jurisdiction restrictions. Unknown legal posture. [L]

## Liquidity

- Current: zero. Round 17444 pools all 0 at 2026-07-05. [H]
- Per-round caps: max 1,000 ALGO per wallet. At 2026 ALGO price about 0.09 USD (lockPrice 8,950,000 at 1e8 scale on 2026-07-05, i.e. about 0.0895 USD), the cap is about 90 USD per wallet per round. [H]
- Global state: `total_reserved_user_funds` = 398,980,001 microALGO (about 399 ALGO, about 36 USD), accrued treasury and dev fees 1.95 ALGO each, as of 2026-10-19. Escrow account balance 904.88 ALGO against 904.86 ALGO min balance (box storage reserve), so no meaningful free funds. The reserved-funds figure is unexplained against the balance. [H for values, L for interpretation]
- Volume / TVL data from a third-party tracker: NOT FOUND (search budget exhausted). Operating history: round 1 on 2026-04-30, round 17444 on 2026-07-05 (about 66 days, 17.4k rounds). [H]

## Event overlap / arbitrage

- The only market is a 5-minute ALGO/USD up/down. It overlaps with no event contract on other venues (the nearest are crypto-price up/down contracts, but on BTC/ETH/SOL, not ALGO). Pari-mutuel settlement means no continuous price, so there is nothing to compare or hedge against with a book.
- Shares liquidity with another venue: no. It is independent, but also essentially empty.

## Adapter recommendation

- Priority: skip. Dead since 2026-07-05, pari-mutuel 5-minute game, Algorand-only, not reachable via PayBox, no event overlap, anonymous operator with admin keys.
- If revisited (only if rounds restart): a read-only signal adapter could poll `current_round` and the round box via algod, compute implied odds = totalPool / sidePool, and be treated as a retail-sentiment signal for ALGO direction. Nothing here fits the cross-venue event-arbitrage model.

## Suspicious content

None. The README is plain documentation with no AI-targeted instructions. The npm registry metadata contains a maintainer contact address, which is intentionally not copied here.

## Open questions

- What is the "lottery" product and does it have its own contract?
- Did the operator move to a new app ID after 2026-07-05? The site was an empty shell, so a successor could not be confirmed. The SDK's `predictionAppId` override suggests the ID can change.
- Is the oracle contract keeper-driven (operator key) or permissionless?

## Sources

- https://github.com/goosealgo/dolanswap-sdk (README, src/client.ts, constants.ts, types.ts, modules/rounds.ts, betting.ts, price.ts, utils/payout.ts, utils/encoding.ts) [H]
- https://www.npmjs.com/package/dolanswap-sdk and https://registry.npmjs.org/dolanswap-sdk (versions, dates) [H]
- https://dolanswap.com (title and meta description only) [H]
- https://mainnet-api.algonode.cloud/v2/applications/3534901984 and .../box (fixtures) [H]
- https://mainnet-idx.algonode.cloud/v2/transactions?application-id=3534901984 (last-activity bracketing: first tx at/after min-round 62,802,734 is 2026-07-05; none from min-round 63,000,000 onward) [H]
- Fixtures: docs/research/fixtures/dolanswap-prediction-markets/
