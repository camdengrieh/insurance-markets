# EL Predict (EL-Casino, elcas.app) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: unauthenticated GETs only (api.llama.fi, coins.llama.fi, sourcify.dev, api.geckoterminal.com, elcas.app, robin.etherscan.io via WebFetch, GitHub raw files via `gh api`), no accounts, wallets, keys, signing, POST/PUT/DELETE (so no JSON-RPC `eth_call` either) and no PayBox money tools (one read-only `discover_tokens mode=chains` call). Scripted requests used the generic User-Agent `insurance-markets-research/0.1`. The shared WebSearch budget was exhausted after the first query, so web/news/social coverage is thin (see section 13).

Confidence tags: **H** read first-hand in a primary source this session, **M** secondary or inferred (this includes everything read through the WebFetch summariser of the explorer), **L** weak or stale.

## 1. Verdict

- **Live but dormant: deployed and operator-tested on 2026-10-06, no outside user activity in the 13 days since.** The hub and three predict books exist on Robinhood Chain (chain id 4663), the front end is up (elcas.app, last build 2026-10-08), and DefiLlama lists the protocol (listed 2026-10-06 22:09 UTC). The only direct transactions to the three predict books are 22 calls by the deployer wallet and the hub's fee address, all on 2026-10-06, including exactly one `bet`. No transaction to any of the books or the hub after 2026-10-06 08:48 UTC (M, explorer, snapshot 2026-10-19 01:49 UTC).
- **What it is**: a permissionless factory of "UP / DOWN" parimutuel rounds on the price of any token that has a Uniswap v3 or Ramses v3 pool on Robinhood Chain, staked in any ERC-20 (one book contract per stake token), with an optional per-market LP "house vault" that takes the lighter side. Price is the pool's own on-chain 60-second tick average, so there is no external oracle. Built by "EL-Casino", a provably-fair casino on the same chain (roulette, crash, perps, predict). Team identity NOT FOUND; no third-party audit (self-published "Markets audit" page only).
- **Adapter priority: skip.** No off-chain API (reads need JSON-RPC against contracts), liquidity is effectively zero (DefiLlama TVL $0.26 on 2026-10-19; all-time fees $0; the ELCAS book's 951,400 ELCAS is worth about $3 at GeckoTerminal's price), the structure is a forward-start parimutuel that cannot be exited or matched cleanly against any other venue, and markets are created by the operator only so far. **Re-check trigger**: `predictTokenCount()` above 3, any `Bet` event from a wallet other than the deployer, or DefiLlama `summary/fees/el-predict` above 0. If it revives it is a P2 signal-only leg (player imbalance on a token's short-horizon direction), not an arbitrage leg.
- **Name hazards**: "El Casino" is a common Spanish phrase (the GitHub search for it returns unrelated sites such as a Vila-real casino web). Use the hub address, not the name. The DefiLlama brand family is EL-Casino (parent), EL Casino Rooms, EL Perps, EL Predict, all Robinhood Chain, all trivial TVL (section 10).

## 2. Market model (H unless tagged)

Sources: verified Solidity on Sourcify (`ElcasPredictBook`, `ElcasMarketsHub`), plus FAQ and audit-page text read from the deployed front-end bundle (github.com/elcasinos/elcasinos.github.io, served at elcas.app).

- **Parimutuel, binary, with an optional AMM-like house vault.** Not an order book, not an AMM curve. Two pools per round (`up`, `down`); winners split the losing side pro rata after a fee.
- **Hierarchy**: Hub -> Book (one EIP-1167 clone per stake token and product, CREATE2 from `keccak256(abi.encode(token, perps))`) -> Market (`id`, one per (pool, interval) in a book) -> Round (`epoch`).
- **Market definition** (`getMarket(id)`): `{pool, assetIs0, active, halted, interval, genesis, creator, limits{minBet, maxPot, maxMatch, matchBps, feeBps, bountyBps, creatorBps}}`. The question is implicit: "will the asset's pool price be higher at the round's close than at its lock". There is no title, category or resolution text.
- **Round timeline** for epoch `e` with interval `I` and `genesis`: bets accepted in `[genesis + e*I, genesis + (e+1)*I)`; **lock** boundary `genesis + (e+1)*I`; **close** boundary `genesis + (e+2)*I`. Outcome = direction of the pool's 60 s average tick at close versus at lock. Intervals allowed by default: 15 min, 1 h, 4 h, 1 d (owner can set 5 min to 7 d). Genesis aligns to the next clean boundary at least 2 min after creation.
- **Forward-start**: a bettor stakes before the reference (lock) price exists. So a position is "direction over the next-but-one interval", not "above strike X at time T". Consequence: it cannot be replicated statically on a strike-based venue (Polymarket/Kalshi "above $X", "up or down" markets with a fixed start). It can only be hedged by delta after the lock.
- **Outcomes are not tokenised.** A position is a ledger row `stakes[market][epoch][user] = {up, down, claimed}`; non-transferable, no cancel, no sell. One side per wallet per round (`OneSide` revert).
- **Round status** (`rounds(m,e).status`): 0 open or live, 1 UP won, 2 DOWN won, 3 refund. Refund when the round is one-sided (either total is zero), the tick averages tie, or a boundary price is still unreadable one hour after the boundary.
- **House vault** (per market, anyone can LP): after each bet it moves its stake to `|playersUp - playersDown|` on the lighter player side, limited by `matchBps` of vault value (max 50%), `maxMatch` per round, the pot cap and 8 concurrent rounds. So `up` and `down` totals are pushed toward equal whenever the vault has budget. **Do not read `up/(up+down)` as a probability**: use player-only pools `up - houseUp` vs `down - houseDown` and the counts `upCount`/`downCount`. With a funded vault the pool ratio carries almost no information.
- **Implied payout** (UP side, before the round settles): `mult_up = (up + down - down*feeBps/10000) / up`, using round-fixed fee bps (a round keeps the fees it had at its first bet). The UI shows the live multiplier. If the market has no LPs the fee remainder (after protocol, bounty, creator) goes back to winners.
- **Seeded markets (L)**: the explorer shows 8 `createMarket` calls in each of the ELCAS and USDG books plus 1 market from each `launchPredict` (so up to 9 per book; failed calls not distinguished). The site ships `predict/nvda.webp` and `predict/pons.webp`, which hints at NVDA (a tokenised stock) and PONS as the seeded underlyings with several intervals each. Actual market list NOT FOUND without `marketsPage` (JSON-RPC POST, not run).

## 3. Chains and collateral (H)

- **Robinhood Chain mainnet, chain id 4663** (Arbitrum Orbit L2, ETH gas). Registry: https://chainid.network/chains.json lists RPC `https://rpc.mainnet.chain.robinhood.com` plus public mirrors (publicnode, drpc, ordofi, others) and explorers `robinhoodchain.blockscout.com`, `hoodscan.co`, `stonkscan.io`; the Etherscan-family explorer `robin.etherscan.io` also works. Single chain only.
- **Collateral**: any ERC-20 the book is created for (the book holds only its own token). Fee-on-transfer tokens are accounted by amount received; rebasing tokens are unsupported (audit page). Featured stake tokens in the official `markets-hub.json`: ELCAS (`0xE73f12D9d81ff6b11c1d0261F440c2EA4C400E18`, the project's own elastic/decaying token, 18 dec) and USDG (`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, 6 dec, ~$1.0002 on DefiLlama 2026-10-19). A third book exists for PONS (`0x39dbed3a2bd333467115de45665cc57f813c4571`, ~$0.259).
- **Contracts** (all chain 4663; `markets-hub.json` fetched live from elcas.app, matches the DefiLlama adapter):
  - Hub `ElcasMarketsHub` `0xBd65EE837e57D5060013cbE8bAc8a6d0F8037f45` (created block 81353593, 2026-10-06; Sourcify exact_match, solc 0.8.28; the explorer still says "Unverified")
  - Predict implementation `0x5211022C92b0DC3DbeBCD0A8E206Fa4Ad688c1BB` (Sourcify exact_match), perps implementation `0x19Bf8018f73e605B8951806fe1086EC6263a2f3a`
  - Predict books (clones): ELCAS `0x3D9DDbe9ebF889C8bC28F6854803A07a094b6b86`, USDG `0x37605c7a2C03a63E29159d7FE1A3eEeD2bC94e6a`, PONS `0x7d48E27C9aA646bf8d387abC46b504d958Dd3B5F`. I derived the first two offline with CREATE2 (hub, salt, init-code hash) and they match the explorer's "created by hub" entries (H for the match).
- **Price source**: only pools from hub-allowed factories (`factoryKind` 1 = Uniswap v3 style `getPool(a,b,fee)`, 2 = Ramses style `getPool(a,b,tickSpacing)`) with oracle cardinality >= 60 and >= 1 h of readable history. **Uniswap v4 pools and other DEX types are not eligible** (no `observe`), and GeckoTerminal shows most brand-new Robinhood Chain tokens trading on v4 (fixture `geckoterminal_robinhood_top_pools_trimmed_2026-10-19.json`). The deep WETH/USDG v3 pool ($19.2M reserve, $157M 24h volume at fetch, M) is eligible in principle; whether any ETH market exists is NOT FOUND.

## 4. Read API: onchain-or-subgraph-only (H)

- **No official REST/WebSocket API.** The front end reads the chain directly with ethers via a same-origin `/rpc` proxy to `https://rpc.mainnet.chain.robinhood.com/` (site `_redirects` file), and uses GeckoTerminal for chart candles (`https://api.geckoterminal.com/api/v2/networks/robinhood`, throttled ~2.2 s/request in the app). Docs live only in the app (routes `/faq`, `/audit?tab=predict`, `/audit?tab=mkaudit`, `/legal`, `/keep`; the site uses hash routing, so URLs are `https://elcas.app/#/faq` etc., inferred). A Supabase backend (edge functions for casino keepers, live rooms, social features) exists but exposes no documented predict endpoint; the FAQ says an operator keeper also settles predict rounds "within a minute". No OpenAPI, llms.txt or developer docs page found (NOT FOUND: searched site repo tree, bundles, DefiLlama links).
- **Discovery (Hub)**: `allPredictTokens() -> address[]`, `predictTokenCount()`, `predictBook(token) -> book`, `booksPage(bool perps, from, n) -> (tokens[], books[], total)`, `bookAddress(token, perps)`, `halted(book)`, `predictProtocolBps()`, `intervalAllowed(uint32)`, `factoryKind(address)`.
- **Per book**: `marketCount()`, `marketsPage(from, n)`, `getMarket(m)`, `currentEpoch(m)`, `boundaryTime(m, b)`, `rounds(m, e)` -> `{up, down, houseUp, houseDown, upCount, downCount, status, feeBps, protocolBps, bountyBps, creatorBps, payout}`, `houses(m)` -> `{assets, locked, totalShares}`, `houseValue(m) -> (low, high)`, `liveTick(m)` (reverts `NotReady` if the pool cannot be read), `checkpoints(m, b)`, `stakes(m, e, user)`, `claimable(m, e, user)`, `limits(m)`, `token()`, `protocolOwed()`, `owedTotal()`.
- **Events** for history: `MarketCreated`, `LimitsSet`, `Bet(market, epoch, user, up, amount)`, `HouseMatched`, `Recorded`, `Settled(market, epoch, status, payout, toProtocol, toHouse, houseResult)`, `Bounty`, `Claimed`, `Deposited`, `Withdrawn`, `FeeAccrued`, `FeeClaimed`. The app itself scans `Bet` logs from the hub's creation block (81353593) with a 5M-block span. Full signatures in fixture `abi_signatures_hub_and_predict_book_2026-10-19.json`.
- **Auth / limits**: none from the venue. Limits are the chosen RPC provider's. Push: none from the venue; an RPC WebSocket (e.g. `wss://robinhood-rpc.publicnode.com` from the chain registry, M) could subscribe to book logs. Not exercised.
- **Third-party aggregates (GET, no key)**: DefiLlama `https://api.llama.fi/protocol/el-predict` (TVL by token), `https://api.llama.fi/summary/fees/el-predict` (fees, from the `Settled`/`Bounty`/`FeeAccrued` logs); GeckoTerminal for pool and token prices. No Dune dashboard, subgraph or indexer found (NOT FOUND: GitHub code search for `ElcasMarketsHub` returned only DefiLlama adapters; web search was unavailable for the rest).
- **Response shapes confirmed this session** (fixtures in `docs/research/fixtures/el-predict/`): DefiLlama protocol JSON (`defillama_protocol_el-predict_2026-10-19.json`, tvl series all 0, `currentChainTvls` `{"Robinhood Chain": 0.2602}`, `listedAt` 1791324583), DefiLlama fees summary (all zeros), official `markets-hub.json`, GeckoTerminal pools and token JSON. No venue-native JSON market response exists to sample; the on-chain structs above are the data model.

## 5. Trade path (H for functions, from verified source)

- **Plain EVM transactions from an EOA; no off-chain orders, no EIP-712, no API key.**
  1. `ERC20(stakeToken).approve(book, amount)`.
  2. `book.bet(uint256 market, uint256 epoch, bool up, uint256 amount)` (selector `0x10c538ab`): `epoch` must equal `currentEpoch(market)` (`WrongRound` otherwise), `amount >= minBet` and the player pot `<= maxPot`; reverts `OneSide` if the wallet already holds the other side, `Closed` if the market is inactive/halted/hub-paused.
  3. After close: `book.claim(market, uint256[] epochs)` (`0xb1b66652`); claiming also settles the round if nobody has. Refunds are paid through the same `claim`.
  4. Permissionless keepers: `settle(m, e)`, `settleMany(ms[], es[])` (`0x7371b7ac`), `record(m, boundary)`; the settler earns the round bounty (<= 1% of the losing side).
  5. LP: `deposit(m, amount)` / `withdraw(m, shares)` (24 h lock, only idle money can leave; deposits priced at the high value, withdrawals at the low).
  6. Creators: `createMarket(pool, asset, interval, Limits)` payable (0.01 ETH per extra market in a book), `hub.launchPredict(...)` payable (0.1 ETH for a new stake token's book); `setLimits`, `setActive`, `transferCreator`.
- No cancel, no early exit, no secondary market for positions. A `bet` is a one-way commitment until close + settle (up to 2*interval + settlement latency).
- All calls are `nonReentrant` (transient guard) and use `SafeERC20`.

## 6. PayBox reachability: partial

- Robinhood (`eip155:4663`, ETH native) is in PayBox's chain catalog (H, live `discover_tokens mode=chains`, 2026-10-19), but the tool says the catalog is "not a support allowlist" and "signing permissions are unchanged", and behaviour of plugin transaction proposals on 4663 is untested (docs/research/06-paybox-platform.md; sibling note venues/hoodbets.md reached the same conclusion for the same chain). `get_buy_link` lists Robinhood as a destination (docs/research/06-paybox-platform.md, H).
- If proposals on 4663 work: each step is one unsigned EVM call (`approve`, then `bet`), and PayBox allows one transaction per proposal with separate approval each (docs/research/06-paybox-platform.md section 3), so a bet is two sequential approvals; the wallet needs native ETH on Robinhood Chain for gas plus the stake token (USDG is the sane one; ELCAS has ~no market). Nothing here needs `request_wallet_sign` typed data.
- Wallets on Base/Ethereum/BNB/Arbitrum/Polygon/Solana cannot trade it without first bridging to Robinhood Chain (Arbitrum portal bridge listed in the chain registry; not tested). Not tested: any proposal, `check_operation_readiness`, swaps or bridges (money tools).

## 7. Fees (H, from verified source)

All fees are taken from the **losing side's** pot, never from stakes of winners beyond the implied haircut:

- `fee = L * feeBps / 10000`, with `feeBps <= 600` (`MAX_FEE_BP`), set per market by its creator and frozen into each round at its first bet.
- Split of `fee`: protocol `L * protocolBps / 10000` (hub `predictProtocolBps`, default **100 = 1%**, hub cap 300, also capped by `feeBps - bounty - creator`) to the hub's `feeTo`; settler bounty `L * bountyBps` (<= 1%) to whoever settles; creator share `L * creatorBps` (<= 2%); the remainder to the market's LP vault, or to winners when the vault has no shares.
- Winner payout `= W + L - fee` shared pro rata (`stake * payout / W`), and the house's own stake earns the same way.
- Entry cost: gas on Robinhood Chain only. Listing fees (ETH, to `feeTo`): 0.1 ETH new stake-token book (first market included), 0.01 ETH per further market; the deployer and one other wallet are fee-exempt (constructor list). Hub owner can change these within caps (<= 10 ETH, <= 1 ETH, protocol share <= 3%).
- Actual `feeBps` of the seeded markets: NOT FOUND (needs `getMarket`/`limits`, JSON-RPC). The DefiLlama methodology says "currently 1% of the losing side" for the protocol share.

## 8. Resolution and dispute risk (H)

- **Fully mechanical, on-chain, no dispute process.** `record(m, b)` stores the pool's cumulative-tick difference over a 60 s window ending at boundary `b` (via `pool.observe([ago+60, ago])` with a fixed 300,000 gas stipend so a starved call cannot fake "unreadable"). `settle` compares the lock and close averages (geometric mean price, since ticks are log price) and orients by `assetIs0`. Ties and unreadable boundaries (after a 1 h grace) refund everyone.
- **Risks**: (1) pool manipulation of a 60 s tick average in a thin pool (auditor-acknowledged; the front end warns on low-liquidity/unverified pools); (2) observation-cardinality exhaustion makes a boundary unreadable and forces a refund (the app has a "raise price memory" button); (3) direction is on the **DEX pool price**, not an index, so basis versus any CEX/oracle venue; (4) hub owner powers: set fees/`feeTo`, allow factories and intervals, halt a book or market, pause new activity. It **cannot** move funds, and halts never block claims, withdrawals or settlements. Books are fixed-implementation clones with no proxy upgrade (self-reported in the audit page, consistent with the source); (5) hostile stake tokens are confined to their own book; (6) creator can retune fees/limits or `setActive(false)` for future rounds only.
- **Owner**: constructor owner was the deployer EOA, then `transferOwnership` (04:36 UTC) and `acceptOwnership` by `0x149cF6b9...37e0A4Fa` at 06:22 UTC on 2026-10-06 (M, explorer); the audit page claims the hub owner is a Ledger hardware wallet (self-reported).
- **Audit status**: no independent audit found; DefiLlama `audits: "0"`. First-party "Markets audit" page lists two internal passes (second dated 6 Oct 2026) with fork tests (M, self-reported).

## 9. Geo, ToS, automation (M)

- Terms (in-app `#/legal`, read from the bundle `LegalPage-*.js`, undated): 18+; not a Restricted Jurisdiction resident; no sanctioned persons; "Restricted Jurisdictions are determined under our Compliance Policy, may change without notice, and are enforced by the Interface"; the list is "maintained internally" (not published); access is geolocated on load and blocked; "You must not use a VPN, proxy, anonymising service ... to disguise your location". The product is described throughout as "games of chance" / "wagers", so gambling rules, not securities/derivatives rules, are the likely regulatory frame.
- Prohibited conduct (quoted sparingly): "exploit bugs, manipulate outcomes, front-run settlements" and "use bots or scripts against the Interface in a way that degrades it for others". Direct contract calls are not "against the Interface", and the contracts themselves are permissionless with no geo check; keepers settling for a bounty are explicitly invited ("anyone can settle ... and earns its bounty"). The Terms never mention Predict by name (searched the bundle), so whether they bind direct contract users is a legal question, not a technical one.
- No published rate limits or API terms (there is no API).

## 10. Liquidity and activity (H unless tagged, 2026-10-19)

| Metric | Value | Source |
|---|---|---|
| DefiLlama TVL, EL Predict | **$0.26** (1 PONS), daily series 2026-10-05 to 2026-10-19 all $0 | api.llama.fi/protocol/el-predict, H. Adapter excludes ELCAS-staked books by design |
| DefiLlama fees, 24h / 7d / 30d / all-time | **$0 / $0 / $0 / $0** | api.llama.fi/summary/fees/el-predict, H. ELCAS has no DefiLlama price so ELCAS-denominated fees would also read $0 |
| Siblings (TVL) | EL-Casino parent $11, EL Perps $6.98, EL Casino Rooms $5.58 | api.llama.fi/protocol/{slug}, H |
| ELCAS book holdings | 951,400 ELCAS (shown $0.00 by the explorer) | robin.etherscan.io, M |
| ELCAS market value | price $0.0000035, FDV $3,484, 24h volume $0, token pool reserves about $3,021 total | GeckoTerminal, M (illiquid, unreliable). So the book is worth about $3 |
| Bets ever placed in the ELCAS book | 1 (deployer, 06:31 UTC 2026-10-06) | explorer tx list, M |
| USDG book | 8 `createMarket` txs, zero token balance, zero bets | explorer, M |
| PONS book | 1 `deposit` tx (1 PONS) | explorer, M |
| Hub | 11 txs total, last 2026-10-06 08:46 UTC | explorer, M |

Context: the Robinhood Chain DEX itself is busy (WETH/USDG v3 pool $19.2M reserve; PONS/USDG Ramses pool about $1.0M reserve, M, GeckoTerminal), so the venue's oracle layer is real even though the prediction layer is empty.

## 11. Event coverage and shared liquidity

- **Categories**: only "will token X's DEX pool price on Robinhood Chain be higher at close than at lock". Overlap with other venues is conceptual only: crypto up/down (Polymarket, Limitless, Kalshi short-horizon crypto), tokenised-equity up/down (Polymarket and Kalshi daily stock up/down, where NVDA is the likely seeded asset). No sports, politics or macro. Mismatches that kill arbitrage: forward-start reference price, DEX-pool-TWAP settlement, parimutuel odds that move until lock, no exit.
- **Independence**: liquidity is the venue's own (player pots plus per-market LP vaults); it shares no liquidity with another prediction venue. It does share the **price source** with the Uniswap v3 / Ramses pool it references, which anyone can trade (and move) directly. As a pure signal source, the player-only imbalance is the only informative field, and it is empty.

## 12. Adapter notes (only if the re-check trigger fires)

1. Poll `Hub.predictTokenCount()` and `allPredictTokens()`; resolve books with `predictBook(token)` or CREATE2 (`bookAddress`).
2. For each book page `marketsPage`; for active markets read `currentEpoch`, then `rounds(m, e)` and `rounds(m, e-1)` plus `houses(m)`. Emit `player_up = up - houseUp`, `player_down = down - houseDown`, counts, `mult_up/down` from section 2, lock and close timestamps from `boundaryTime`.
3. Normalise as: market_type `parimutuel_updown_forward_start`, tradable_exit `false`, resolution `dex_pool_tick_twap_60s`, settlement lag = `2*interval` plus settle time, venue-fee = round-fixed `feeBps` of losing side.
4. Use event logs (`Bet`, `Settled`) for volume; DefiLlama fees as a cross-check.
5. Treat any market whose pool has `reserve_usd` below a floor (e.g. $50k) as manipulable; GeckoTerminal gives reserve per pool.

## 13. Not found / open questions

- Live market list, per-market `feeBps`/limits, current round pools, house vault balances: NOT FOUND (requires JSON-RPC `eth_call`, a POST, which this run did not make). Do this with a read-only RPC call in a later pass: `marketCount()` on the three books and `marketsPage(0, 50)`.
- Whether any non-operator wallet has ever bet (only direct-call transactions were visible; contract-routed bets would show as internal transactions, which the explorer pages did not list): M.
- Team identity, Telegram/Discord, X account `@elcas_casino` (name from DefiLlama; X not fetched), any announcement or news coverage: NOT FOUND (searched: one WebSearch with 0 relevant hits, then the shared search budget ran out; GitHub search found `elcasinos/elcasinos.github.io` (front-end build only, no contract source, owner is an organisation) and `hahzterry/elcasino` (an earlier site version, same description, created 2026-09-18; relationship to the team is M and I did not read it)).
- Terms and Compliance last-updated dates and the restricted-jurisdiction list: NOT FOUND (not in the bundle).
- Whether the explorer's "Unverified" label versus Sourcify's exact_match matters: Sourcify's match is what I relied on (H).

## 14. Suspicious content

None found. The third-party material read (front-end bundles, explorer pages, Sourcify JSON, DefiLlama adapter code) contained no instructions aimed at an AI agent. The in-app audit page includes a code snippet for settling rounds; it is documentation and was not executed.

## 15. Sources

- DefiLlama protocol API https://api.llama.fi/protocol/el-predict (also `el-casino`, `el-perps`, `el-casino-rooms`), fetched 2026-10-19: H (the web page https://defillama.com/protocol/el-predict returned 403 to WebFetch).
- DefiLlama fees API https://api.llama.fi/summary/fees/el-predict, 2026-10-19: H. Adapter code: `gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/el-predict/index.js` and `repos/DefiLlama/dimension-adapters/contents/fees/el-predict.ts`: H.
- Sourcify verified source and ABI (v2 API): https://sourcify.dev/server/v2/contract/4663/0xBd65EE837e57D5060013cbE8bAc8a6d0F8037f45 and `.../0x5211022C92b0DC3DbeBCD0A8E206Fa4Ad688c1BB`, 2026-10-19: H. Constructor arguments and immutables decoded locally from the returned bytecode.
- Official front-end repo (GitHub Pages, CNAME `elcas.app`): `gh api repos/elcasinos/elcasinos.github.io/contents/...` (`markets-hub.json`, `_redirects`, `index.html`, bundles `predict-*.js`, `hub-*.js`, `MarketsHelp-*.js`, `MarketsAudit-*.js`, `AuditPage-*.js`, `Faq-*.js`, `LegalPage-*.js`, `App-*.js`), last commit "Site build 2026-10-08T05:04Z": H for what the bundles contain (minified; text extracted by pattern, so quoted wording is exact but section structure is inferred).
- Live site https://elcas.app/ (HTTP 200, `last-modified` 2026-10-08 05:05 GMT) and https://elcas.app/markets-hub.json: H.
- RobinScan explorer pages (via WebFetch summariser) for the hub and the three books, snapshot "Oct-19-2026 01:49:43 AM (UTC)": M. Blockscout and Hoodscan blocked (Cloudflare / 403).
- GeckoTerminal public API https://api.geckoterminal.com/api/v2/networks/robinhood/pools and `/tokens/{ELCAS}`, 2026-10-19: M (aggregator data on thin pools).
- DefiLlama coins API (USDG, PONS prices; ELCAS unpriced), 2026-10-19: H.
- Chain registry https://chainid.network/chains.json (RPC list, explorers, chain id 4663): M. https://docs.robinhood.com/chain/ (points to "Connecting to Robinhood Chain" for RPC details; no RPC URL on the fetched page): H.
- PayBox `discover_tokens mode=chains` (2026-10-19) and local notes docs/research/06-paybox-platform.md, docs/research/venues/hoodbets.md: H for the live call, M for the notes.
- Fixtures: `docs/research/fixtures/el-predict/` (defillama_protocol, defillama_fees_summary, defillama_el_family_tvl, defillama_coins_prices, markets-hub_official, abi_signatures, geckoterminal_robinhood_top_pools_trimmed, geckoterminal_token_elcas, onchain_activity_from_explorer.md).
