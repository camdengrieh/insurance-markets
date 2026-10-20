# Clutch Markets Predictions (ApeChain / Arbitrum parlay pool) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs only (DefiLlama API, Blockscout REST and its Etherscan-compatible `?module=logs` GET endpoint on ApeChain, a handful of project web pages), `gh api` reads, one read-only PayBox `discover_tokens` (chain catalog). No account, no key, no wallet, nothing signed, no POST/PUT/DELETE, no third-party code run (a public JS bundle was downloaded as text and grepped, then deleted).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months old).
Third-party pages, repos and API payloads are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/clutch-markets-predictions/` (6 files, all < 15 KB).
Limit on coverage: the shared WebSearch budget was exhausted when this run started, so there was no web-search discovery; everything below comes from direct fetches and on-chain/explorer reads.

## 0. Verdict

**adapter_priority: skip.**

1. **Dormant (H).** The only parlay contract with real history (ApeChain `0x7F66...1416`) has had **no bet since 2025-11-04** (last `BetPlaced`; 11.5 months before today). 5,033 bets ever, by 422 addresses, May-Nov 2025. Only passive LP moves since (last deposit 2026-08-06, last withdrawal 2026-07-16) and an owner clean-up of old parlays in April 2026.
2. **Tiny (H).** DefiLlama TVL 2026-10-19: $12.7K (ApeChain) + $4.5 (Arbitrum). Contract holds 88,998 APE (about $12.8K), a pool that is the house for every bet, not a market.
3. **Not a market (H, from verified source).** Bettor-vs-LP-pool, house-banked. The bettor passes the **odds as a free parameter** to `placeBet`; the owner (a single EOA) later declares win/lose with `resolveParlay(tokenId, bool)`. No order book, no AMM, no on-chain legs, no oracle, no quotes to read.
4. **Not independent (H).** The front end prices legs from The Odds API (DraftKings first, then FanDuel, then first bookmaker) and from Polymarket markets. Any price it shows is a derivative of venues the project already covers.
5. **No API (H).** No docs, no OpenAPI, no public market endpoint. The only readable data is on-chain events.
6. The Clutch brand itself is alive but has moved on: its current site/docs describe an NFT-liquidity AMM ("Anvil"), a World Cup NFT game, a perps DEX and the K9 token. **Parlays are not mentioned anywhere on the current docs** (H).

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Last `BetPlaced` on ApeChain parlay contract | 2025-11-04T16:59:34Z, block 26,193,244, tx `0x80aa5348...cf8983f` (fixture `placebet_calls_first_and_last.json`) | H |
| `BetPlaced` per month | 2025-05: 430, 06: 736, 07: 2235, 08: 490, 09: 383, 10: 736, 11: 23, then 0 for 2025-12 through 2026-10 (fixture `apechain_parlay_activity_summary_2026-10-19.json`) | H |
| `ParlayResolved` last event | 2026-04-25T22:45:22Z (391 resolved in 2026-04: owner clean-up of stale parlays); `ParlayVoided` 85 total, last 2026-04-25 | H |
| `LiquidityDeposited` last | 2026-08-06T17:28:41Z (200 APE); `LiquidityWithdrawn` of 12,473.66 APE on 2026-07-16 | H |
| Contract unresolved parlays now | about 467 inferred (5,033 bets - 4,481 resolved - 85 voided); `getUnresolvedParlaysLength()` itself could not be read (no GET view-call endpoint) | M |
| DefiLlama listing | listed 2025-03-31 (`listedAt` 1743442083), `deadUrl: true`, no `url` field, category "Prediction Market", description "The first fully on-chain decentralized parlay platform. Bet on sports , crypto and politics", chains Arbitrum + ApeChain | H |
| DefiLlama TVL, ApeChain | $14K (2025-05-23) -> $155K (2025-10-01) -> peak **$606,185 on 2025-11-21** (after bets stopped; capital was parked, not used) -> $23.6K (2026-02-01) -> $12.7K (2026-10-19) | H |
| DefiLlama TVL, Arbitrum | $40K at listing, peak $62.9K (about 2025-04-22), collapsed to $1.6K on 2025-04-23 and 0 from 2025-04-27; $4.5 now. Arbitrum CLUTCH-token staking TVL peaked $200K, last > $1K on 2025-11-09, 0 now | H |
| Current Clutch properties | `anvil.clutch.market` (HTTP 200, Next.js, title "Anvil AMM - Clutch Puppies DeFi", banner "Anvil AMM v2 is LIVE on Robinhood Chain"), `puphub.clutch.market` (200, Pixel Pups game hub), `pupcup.clutch.market` (200, "Pup Cup 2026" World Cup NFT game, pre-tournament countdown to 2026-06-11 still shown) | H |
| `clutch.market` / `www.clutch.market` | TLS handshake fails (`tlsv1 alert internal error`) from both curl and node; could not load | H |
| `parlayplatform.com` ("D.P.P - Decentralized Parlay Platform") | HTTP 200 SPA; `server.parlayplatform.com` returns `Server is running....`. The bundle I read (`main.f6aae1dd.js`) is configured for **Sanko (chainId 1996)**, not ApeChain, so I cannot show the current front end points at the ApeChain contract | H/M |
| X account `@clutchmarkets` | WebFetch returned **HTTP 402 Payment Required** (no body, so no payment requirements to record); stopped, not retried | H |

Conclusion: the venue (as a parlay product) is **not live in any meaningful sense** in 2026. The contract is unpaused-as-far-as-known and the pool still holds funds, so a transaction would not be rejected for lack of code, but no one is using it.

## 2. What it is

- **Kind**: onchain-other. A single-contract, house-vs-LP-pool parlay book. ERC-721 receipts.
- **Operator**: "Clutch Markets" (DefiLlama parent `clutch-markets`, GitHub field `Clutch-Markets` which resolves to no GitHub user/org, 404 for `Clutch-Markets` and `clutch-market`). Operator identity beyond that: NOT FOUND. The `server.parlayplatform.com` / "D.P.P" backend that issues the NFT metadata is linked to the contract by the on-chain `tokenURI` values (H); that its operator is the same team as Clutch is M (the contract is attributed to Clutch by DefiLlama's adapter, and LP deposits require a "Clutch Puppies" NFT).
- **Contract (H, Blockscout verified source, compiler 0.8.24, `verified_at` 2026-06-10)**: `APENativeDecentralizedParlayPlatform` at `0x7F66d16A488Eae9e2B61BfB186fD94bBA3611416` on ApeChain (chainId 33139). Deployed 2025-05-16 by `0x605c9076e50E58FF75eA451f7CAd7c6B919110c5`. Owner `0xf9565242aD9A71D57940a81b11a3723D5f1D2097` is an **EOA** (`is_contract: false`). Receipt NFT "ParlayNFT"/PLNFT (432 holders). LP-gating NFT = Clutch Puppies (`0x1B16c0B69D4a30c42c92C873C4873787AfCbEc5c`, ERC-721, 377 holders). Full source saved as `apechain_parlay_contract_source.sol`.
- **Sibling contracts by the same deployer (H)**: `APEDecentralizedParlayPlatform` `0x812D...33C6` (ERC-20 variant; 0 transactions ever, balance 0) and `DPPRebateContract` `0xAC98...5ac6` (0 transactions). DefiLlama's adapter labels the first as "ApeUSD", but it has never been used.
- **Arbitrum**: DefiLlama's adapter points at an "USDC TVL contract" `0xbBEa81aBd42e8804de0f7d167Cf8123206d55039` and a CLUTCH staking contract `0x52070c2f7527822ccaea77e46fb23754151e2793` (adapter source read via `gh api` from `DefiLlama/DefiLlama-Adapters/projects/clutch-market/index.js`, H). I could not read either contract (Arbitrum Blockscout is behind a Cloudflare challenge; Arbiscan 403; I did not bypass). NOT FOUND (searched: Blockscout, Routescan "chain not supported", Arbiscan). Its TVL fell to zero within 3 weeks of the ApeChain launch, so treat Arbitrum as a short-lived predecessor (M).
- **Market model (H)**: not binary/categorical/scalar in the usual sense. A "market" is a user-assembled **parlay** of 2+ legs. Legs are NOT on-chain: `placeBet(string id, uint256 odds, uint256 wager, string tokenURI)` stores a backend UUID `id`, the combined decimal odds (1e18 fixed point; e.g. `5290000000000000000` = 5.29x) and the stake (`msg.value`); the leg descriptions live in `tokenURI` (an off-chain URL `https://server.parlayplatform.com/parlay-bets/<id>` in 2025-05, an inline base64 JSON in the last bet). Example last bet: "2 legs: Bristol City @ 2.25x | Stoke City @ 2.35x. Total odds 5.29x. Stake 20 $APE." (2.25 x 2.35 = 5.29). Earlier sample (first bet) legs: "DraftKings - New York Knicks - Boston Celtics (NBA)" and "Will Solana dip to $140 in May? (polymarket.com/event/what-price-will-solana-hit-in-may)". Outcome tokenisation: none; the only token is the ERC-721 receipt of the whole parlay.
- **Chains and collateral (H)**: ApeChain, **native APE** only (both `placeBet` and `depositLiquidity` are `payable`; the `amount` argument of `depositLiquidity` is ignored in favour of `msg.value`). No USDC/stablecoin collateral on the live contract.

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official REST/GraphQL/WS API | **NOT FOUND** (searched: `anvil.clutch.market/docs` says "No public REST or API endpoints are documented"; `docs.clutch.market`, `api.clutch.market`, `app.clutch.market` do not resolve; `clutch.market` TLS fails; GitHub user/org `Clutch-Markets`/`clutch-market` 404; `server.parlayplatform.com` paths `/api/markets`, `/api/games`, `/games`, `/docs`, `/openapi.json` all 404, `/parlay-bets` 400; these are blind path guesses against a non-documented host, GET only) | H |
| Backend `server.parlayplatform.com` | Serves NFT metadata `GET /parlay-bets/<uuid>` (public, returns JSON with `name`, `description`, `image`, `attributes[]` of `Game` legs; fixture `placebet_calls_first_and_last.json`). The front end's POSTs to this server carry a client-side HMAC header (secret shipped in the public bundle; not recorded here, not used). Undocumented, not a data API | H |
| On-chain events (ApeChain `0x7F66...1416`) | `BetPlaced(address indexed user,uint256 wager,uint256 tokenId)`, `ParlayResolved(address indexed user,uint256 tokenId,bool outcome,uint256 payout)`, `ParlayVoided(uint256 tokenId)`, `LiquidityDeposited/Withdrawn(address indexed provider,uint256 amount)`. Topic0s: BetPlaced `0x001ecf1d...3105`, ParlayResolved `0xe7db757c...f9df`, ParlayVoided `0x1d85d635...be53`, LiquidityDeposited `0x7ff07ce9...fcdf`, LiquidityWithdrawn `0xb1cce868...4d25` | H |
| Explorer REST used | `https://apechain.calderaexplorer.xyz/api/v2/{addresses,smart-contracts,transactions}/...` and Etherscan-compatible `https://apechain.calderaexplorer.xyz/api?module=logs&action=getLogs&fromBlock=&toBlock=&address=&topic0=` (1000 logs per page, oldest first, paginate with `fromBlock`). `module=proxy&action=eth_call` is **not** supported ("Unknown module"), and the `methods-read` GET returns 404, so view functions (`getUnresolvedParlays`, `totalLiquidityPool`, `paused`, ...) need a JSON-RPC POST, which this run did not do. Rate limits: NOT FOUND | H |
| ABI view functions of interest | `totalLiquidityPool`, `totalLiability`, `winningFee`, `paused`, `nextTokenId`, `getUnresolvedParlays() -> Parlay[]` (tokenId, id, odds, wager, outcome, resolved, voided), `tokenIdToParlay(uint256)`, `getUserParlays`, `getLiquidityProviderDetails` | H |

Verdict for the aggregator: no prices, no books, no markets feed. Even a perfect indexer could only emit "parlays placed/resolved and pool size", which has no cross-venue use.

## 4. Trade path

- **Place**: a plain EVM transaction `placeBet(id, odds, wager, tokenURI)` with `value = stake` in APE; `msg.sender` receives the ERC-721 receipt. Constraints in the contract (H): `odds > 0`, pool > 0, potential profit `<= 15%` of `totalLiquidityPool`, and total liability `<= totalLiquidityPool`. **There is no on-chain check that `odds` corresponds to any real price.** The only guard is the owner's later decision to resolve/void.
- **Cancel/settle**: only the owner can `resolveParlay` or `cancelParlay` (void, refunds the stake). A bettor has no cancel and no way to force settlement; there is no time-out or claim path (H, source).
- **LP**: `depositLiquidity` requires holding at least one Clutch Puppies NFT; withdrawals are locked 30 days from the first deposit (`LOCK_PERIOD`) and blocked while liabilities exceed remaining liquidity (H).
- **Auth/signing**: standard EOA transaction on chain 33139; no off-chain signed orders, no API key.
- **PayBox (partial)**: ApeChain (`eip155:33139`) and Arbitrum One (`eip155:42161`) both appear in the PayBox chain catalog (`discover_tokens mode=chains`, 2026-10-19, H), with the catalog's own caveat "metadata catalog, not a support allowlist" (H). A PayBox `io.paybox/transactionProposal` of kind `evm` (`{chain, transaction:{to,value,data}}`, per `docs/research/06-paybox-platform.md`) would be the right shape, but whether PayBox can simulate/sign for chain 33139 is unverified (NOT FOUND). Technically one `placeBet` proposal would be enough; practically there is nothing worth trading (section 0), and the bettor would be taking the owner's discretion as the oracle. Not recommended.

## 5. Fees (H, source)

- `winningFee = 400000` of a `10,000,000` denominator = **4%** by default (owner-settable via `setWinningFee`, current on-chain value not read).
- On a win: `payout = wager * odds / 1e18`; `fee = payout * winningFee / 1e7` goes to the owner; the bettor receives `payout - fee`; LPs are debited `payout - wager`, pro-rata to their deposit. On a loss the stake is credited to LPs pro-rata.
- LP exit: 4% of the prorated net profit (earnings - losses) to the owner on withdrawal; no fee if net loss.
- There is no on-chain trading fee beyond that; the house margin is whatever the off-chain odds builder bakes into `odds` (the free parameter).

## 6. Resolution and dispute risk

- Mechanism (H, source): the **owner EOA** calls `resolveParlay(tokenId, outcome)` with a single boolean for the whole parlay, or `cancelParlay(tokenId)`. No oracle, no UMA, no on-chain evidence of leg results, no dispute window, no bonding. The owner is also the fee recipient and the only party who can resolve (`onlyOwner`), and `pause()` stops bets/resolution (but `cancelParlay` is not `whenNotPaused`).
- Risk: **total counterparty/key risk on one EOA**, plus the free `odds` parameter (a bettor or a buggy front end can submit any odds; correctness depends on the owner noticing). I treat this as a defect of the venue, not something to exploit; I did not call anything.
- Stale state: about 467 parlays are inferred unresolved (M), some almost 12 months old; a bettor with a stuck parlay depends entirely on the owner.
- Audit: none found. DefiLlama says `audits: "0"` (H). The Anvil docs' Hashlock audit covers 14 AMM-family contracts, not this parlay contract (H, docs say so for "Clutch.AMM"; parlay not listed).

## 7. Geo / ToS / automation

- Terms of service, geo restrictions, bot rules: **NOT FOUND** (searched: `anvil.clutch.market` and `docs` list only a risk disclosure for the AMM, "No GitHub or terms-of-service link is visible"; `parlayplatform.com` is a wallet-connect SPA with no static ToS text; `pupcup.clutch.market` lists none).
- Sports parlays are regulated gambling in many jurisdictions, and the operator publishes no compliance framework; any real use would need a legal view. No code-level geo block exists in the contract (H).

## 8. Liquidity (all with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (DefiLlama) | ApeChain $12,743 (APE only); Arbitrum $4.5 (USDC); staking $0 | `api.llama.fi/protocol/clutch-markets-predictions`, 2026-10-19 | H |
| Contract native balance | 88,998.30 APE at block 52,032,635 (about $12.8K at $0.1443/APE) | Blockscout, 2026-10-19; price `coins.llama.fi` coingecko:apecoin | H |
| Peak TVL | $606,185 (ApeChain, 2025-11-21) | DefiLlama | H |
| Lifetime LP flows | 748 deposits = 2,384,499.6 APE; 455 withdrawals = 2,295,376.2 APE; net 89,123 APE (consistent with balance) | computed from logs, 2026-10-19 | H |
| Lifetime stake volume | 111,044 APE over 5,033 bets by 422 addresses (2025-05-16 to 2025-11-04); about $55-70K at the then APE price of roughly $0.53-0.63 (two spot samples only) | computed from logs; prices from `coins.llama.fi` | H (APE) / M (USD) |
| Max single-bet profit now | 15% of pool = about 13,350 APE (about $1.9K) | source constant, pool balance | H/M |
| Daily volume / OI | zero (no bets for 11.5 months). DefiLlama has no dex/fees/options adapter for the slug (HTTP 400 for `summary/dexs`, `summary/fees`, `summary/options`) | 2026-10-19 | H |

## 9. Event overlap and shared liquidity

- Categories seen in actual bets (H, fixtures): soccer (English lower leagues, spreads/winners), NBA and other US sports via The Odds API (the bundle iterates `sports/<key>/odds` with `regions=us`, preferring DraftKings, then FanDuel, then the first bookmaker; player props listed for NBA/NFL/WNBA/EPL), and Polymarket-sourced binary legs (crypto price thresholds such as "Will Solana dip to $140 in May?"; the DefiLlama blurb also says politics).
- **Not an independent leg**: prices are copies of sportsbook odds (DraftKings/FanDuel) and Polymarket prices (H, code and metadata); the counterparty is a thin APE LP pool with a 15% cap. For arbitrage this is at best a place where a stale, owner-set parlay could be mispriced against Polymarket; at $13K TVL, with no bets in 11.5 months and a discretionary resolver, it is not worth building.
- Shares liquidity with: DraftKings/FanDuel (reference prices) and Polymarket (reference legs). Neither is actually "routed"; it is a pricing dependency, but it kills independence.

## 10. What an adapter would do if it were ever built (not recommended)

An indexer over the five events above (ApeChain, `getLogs` by topic0, paginate by `fromBlock`) plus `GET server.parlayplatform.com/parlay-bets/<id>` or base64 `tokenURI` decoding to recover legs. This produces a ledger of parlays, not a price feed. Estimated value to Quotient as a signal source: none (activity stopped 2025-11-04).

## Sources

All fetched 2026-10-19 unless noted.

- DefiLlama protocol API (H): `https://api.llama.fi/protocol/clutch-markets-predictions` and parent `https://api.llama.fi/protocol/clutch-markets`; `https://api.llama.fi/summary/{dexs,fees,options}/clutch-markets-predictions` (HTTP 400). The HTML page `https://defillama.com/protocol/clutch-markets-predictions` returned 403 to WebFetch.
- DefiLlama TVL adapter (H): `gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/clutch-market/index.js`.
- ApeChain explorer (Blockscout, H): `https://apechain.calderaexplorer.xyz/api/v2/addresses/0x7F66d16A488Eae9e2B61BfB186fD94bBA3611416`, `.../smart-contracts/0x7F66...1416`, `.../transactions/<hash>`, `.../addresses/0x605c9076e50E58FF75eA451f7CAd7c6B919110c5/transactions`, `https://apechain.calderaexplorer.xyz/api?module=logs&action=getLogs...`.
- DeFi price reference (H): `https://coins.llama.fi/prices/current/coingecko:apecoin` (0.1443 USD, 2026-10-19) and `.../historical/1752580800/...` (0.629), `.../1759276800/...` (0.532).
- Clutch properties (H): `https://anvil.clutch.market/`, `https://anvil.clutch.market/docs` (via WebFetch summary), `https://pupcup.clutch.market/`, `https://puphub.clutch.market/`.
- `https://parlayplatform.com/` (SPA + bundle `static/js/main.f6aae1dd.js`, read as text), `https://server.parlayplatform.com/` and `/parlay-bets/<uuid>`.
- PayBox chain catalog (H): `discover_tokens mode=chains` queries "ape" -> ApeChain `eip155:33139`; "arbitrum" -> Arbitrum One `eip155:42161`, Nova `eip155:42170`. Plus `docs/research/06-paybox-platform.md` for the proposal shape.
- Unaffiliated GitHub stub, M/L, not used for facts: `hubseer/Clutch-The-world-s-first-on-chain-decentralized-parlay-betting-platform-on-Polymarket.` (created 2025-12-19, 0 stars, README is one sentence plus a link to `hubseer.com`; claims the product "spans Polymarket prediction markets"; not an official repo).

## Not found

- Official docs, API, OpenAPI, SDK, GitHub org or ToS for any Clutch parlay product.
- Reading the Arbitrum contracts (`0xbBEa...5039`, `0x5207...e793`): Blockscout Cloudflare challenge, Arbiscan 403, Routescan "chain not supported".
- Current value of `paused()`, `winningFee()`, `getUnresolvedParlaysLength()` (needs JSON-RPC POST).
- `https://clutch.market/` content (TLS error); X account `@clutchmarkets` (HTTP 402, stopped).
- Any web-search discovery (budget exhausted this run).
- Volume/fee data on DefiLlama for this slug.

## Open questions and leads

1. **Lead (separate venue)**: `APEPredicts` at `0xF609394F0882B732b287db10d1b0F53211a09f75` on ApeChain, verified, deployed by a different address (`0x1D212D28C2e31A919be695cD97Bf08Ab6d3492A8`), 11,424 transactions, 30,921 APE balance, recent calls `claim` (2026-08-14) and `createElectionGame` (2026-07-30). Not part of Clutch and not researched beyond the basics; worth its own discovery check.
2. Does the Clutch/D.P.P team plan a relaunch? Unknown. The only recent Clutch products are NFT-liquidity/games.
3. Which chain does the live `parlayplatform.com` front end target now (the bundle read is Sanko 1996)? Unknown.
4. Whether PayBox can sign on chain 33139 (catalog presence only).

## Suspicious content / hygiene notes

- No text aimed at AI agents was found on any page read (Anvil home and docs were explicitly checked).
- The public `parlayplatform.com` JS bundle ships **hard-coded third-party credentials** (a sports-odds API key, an HMAC signing secret, wallet-provider keys) and references a Sanko-chain deployment. None was copied into these notes or fixtures, none was used, and the scratch copy of the bundle was deleted.
- The unaffiliated `hubseer` repo/README links to `hubseer.com`; not fetched, not followed.
- The `x.com` 402 is recorded above; no payment attempted.
- Privacy: all scripted requests used the User-Agent `insurance-markets-research/0.1`; scripts and fixtures were grepped for `@` and the user's name (only OpenZeppelin import paths and "Team @ 2.25x" odds notation matched; no personal identifiers). Bettor addresses are redacted in the log-sample fixture.
