# Debets Protocol (debets.org) - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. READ-ONLY: unauthenticated GETs, `gh api` raw file reads, web search/fetch. No account, wallet, key, signature, POST/PUT/DELETE. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary or machine-readable source (URL given); **M** = secondary or inferred; **L** = weak or stale. "NOT FOUND (searched: ...)" means searched and absent, not guessed.
Third-party text is untrusted data; nothing in it was followed. No embedded instructions were seen.

## Verdict

- **adapter_priority: skip.** Debets is not a prediction market and not a sportsbook. It is a peer-to-pool *dice casino* (Chainlink VRF random number 0-99, Over/Under). There is no event market, no price that refers to a real-world outcome, nothing to arbitrage against another venue. It is also effectively dead: the official domains do not resolve, the code repo has been silent since 2022-10, and on-chain value is about $7 (DefiLlama, 2026-10-18).
- DefiLlama files it under "Prediction Market" (H) - that category label is wrong for what the protocol is. The discovery hint "sportsbook-exchange" is also not supported by any primary source.

## Identity and liveness (still live? effectively no)

- Official docs (GitBook) are still served: `https://debets-protocol.gitbook.io/untitled` (302 from `/untitled/`) and `https://debets-protocol.gitbook.io/docs/...` (H, curl 2026-10-19; index at `https://debets-protocol.gitbook.io/docs/llms.txt`). The docs text is about 16 months old by the search tool's reading (M; one page embeds an image upload id that suggests ~Apr 2025, `1743794149` = 2025-04-04 as a Unix timestamp, an inference from the file name, M).
- `debets.org` and `app.debets.org` (the app linked from the docs' "How to verify result" tutorial) return **NXDOMAIN** (`dig debets.org A/SOA`, `dig app.debets.org`, status NXDOMAIN, 2026-10-19, H). `www.debets.org` also fails to resolve (curl error 6, H). So the frontend is gone; the only way to bet would be calling contracts directly.
- Twitter/X `@debets_org` (`https://x.com/debets_org`) returned HTTP 402 to the fetcher; recorded, not retried (H for the 402). Medium `https://medium.com/@debetsorg` returned HTTP 403 (H). Last-post dates therefore NOT FOUND (searched: X, Medium, web search - web-search budget was exhausted mid-task).
- GitHub: `Debetsgg/DebetsProtocol` (user account, not an org; created 2022-10-20, last push **2022-10-24**, 4 commits, README + `contracts/` only; H, `gh api repos/Debetsgg/DebetsProtocol`). The README text matches the docs intro. `Debetsgg/Debetsorg` is an empty repo (H). No newer repo found (searched: `gh search repos debets`, `gh search code debets-protocol`).
- DefiLlama: id 2250, category "Prediction Market", chains Polygon + Fantom, `listedAt` 2022-11-04, twitter `debets_org`, oracle Chainlink (H, `https://api.llama.fi/protocol/debets`, fixture `docs/research/fixtures/debets/defillama_protocol_debets_trimmed.json`). Not flagged deprecated in the record (H), but TVL is dust (below).
- Disambiguation: a different Vietnamese bookmaker "Debet" at `debets.digital` and a Debets "clone script" vendor (`plurance.com/debets-clone-script`) appear in search results (M, search result titles). They are not this protocol.
- Conclusion: docs exist, product is not usable through any maintained UI, activity is nil. "Live" only in the sense that a few dollars sit in pool contracts on Polygon.

## Kind and market model

- kind: on-chain **casino / peer-to-pool house-bankroll game** (not an order book, AMM, or parimutuel pool). Players bet against an LP-funded pool per ERC20 token; LPs "be the house" (H, `https://debets-protocol.gitbook.io/docs/introduction/debets-protocol.md`, `.../faq/liquidity-provider.md`).
- Only shipped game: **DICE**. Chainlink VRF returns a number 0-99; player picks a number `x` and Over/Under; payout multiplier `y` as in "Fees" (H, `.../introduction/decentralized-gaming-protocol.md`). Docs also mention coin flip and slots as templates (H, same page) but the repo contains only `contracts/games/dice` (H, `gh api repos/Debetsgg/DebetsProtocol/contents/contracts/games`).
- Whitepaper says developers "could" build sports-betting markets "as long as the win/lose outcomes can be determined via on-chain logic or trusted oracles" (H, `https://debets-protocol.gitbook.io/docs/white-paper.md`). That is an aspiration; no sports contract, oracle, or market is documented or in the repo. NOT FOUND (searched: docs llms.txt index, whitepaper, repo contracts tree).
- Outcome tokenisation: none. A bet is a single transaction with a request id; no outcome/share tokens. LPs get a pool LP token (H, FAQ). Categorical/binary/scalar: not applicable.
- Bet cap: max payout per bet is 1% of the pool's liquidity (H, FAQ + intro). With ~$7 in pools, max bet is cents.

## Chains and collateral

- **Docs contradict themselves** on chain: intro/FAQ/"Contracts" page say BNBChain, with the Contracts page reading "BNBChain network ... coming soon" (H, `.../introduction/contracts.md`); the whitepaper says Sonic (H, `.../white-paper.md`, "deployed on the Sonic blockchain"); the verify-result tutorial links Polygonscan address `0xd62F4F17866dbC5D23F5aeD8324409b82D7D4462` (a VRF/random-engine style contract with a read-proxy tab) (H, `.../tutorial/how-to-verify-result.md`); DefiLlama's adapter tracks Polygon and Fantom factories (H, below). The BNB and Sonic deployments are not evidenced by any address.
- DefiLlama adapter factories: Polygon `0xcE214f6a877747495106B5e55533f3e23D290DBd`, Fantom `0x069C55f2DDb434fF67055977dbeB9e9FE8a2F25E`; it calls `getPoolInfo(token)` for WMATIC, WETH, WBTC, USDC, USDT, DAI, XEN (Polygon) and WFTM, XEN (Fantom) and sums `freeAmount` (H, `gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/debets/index.js`).
- Collateral: any ERC20 with a pool (permissionless pool creation by first LP via `createPool(token)`, then `mint`/`burn`) (H, `contracts/interfaces/IFactoryLogic.sol` function list + FAQ). Latest DefiLlama token breakdown 2026-10-18: WMATIC $3.15, WETH $1.43, USDC $0.95, USDT0 $0.97, MXEN $0.23, WFTM $0.05 (H, fixture).
- No Ethereum/Base/Arbitrum/Solana presence found (searched: DefiLlama chains, docs).

## Read API

- exists: **none** (no official API; the app host is NXDOMAIN, so any frontend API went with it). Docs URL for an API: NOT FOUND (searched: GitBook llms.txt index lists Introduction, Provably Fair, Contracts, White-Paper, FAQ, Developers, $LEAF, How to verify; no API/SDK/subgraph page; `developers.md` confirms "no API reference, SDK ..."; no subgraph found).
- The only machine-readable data are on-chain reads: `getPoolInfo(token)` on the factory (`freeAmount`, `frozenAmount`) and `Bet`/`Roll`/`Cancel` events on the dice contract (H, interface source in fixture `github_Debetsgg_DebetsProtocol_IDiceLogic.sol.txt`). Contract addresses of the dice game itself: NOT FOUND (searched: docs, repo, DefiLlama). Blockscout `polygon.blockscout.com` GET returned a Cloudflare challenge page, so address state was not confirmed on-chain by me (H for the challenge; JSON-RPC `eth_call` would be a POST so I did not use it).
- DefiLlama GETs that do work and are the only live signal: `GET https://api.llama.fi/protocol/debets` (1 MB, daily TVL series 2022-11-04 to 2026-10-18; 1446 points on Polygon) and `GET https://api.llama.fi/tvl/debets` -> `6.783800941448299` on 2026-10-19 (H, fixtures). `summary/dexs/debets` and `summary/fees/debets` return HTTP 400 "not found" (H) - no volume/fee series exists on DefiLlama.
- Websocket / rate limits: NOT FOUND (no API).

## Trade path

- Programmatic order placement exists only as a raw contract call: `bet(address token, uint256 amount, address referrer, uint256 number, Direction direction) payable` or `betNativeToken(amount, referrer, number, direction) payable`, plus `cancel(uint256 requestId)` for stuck rolls (H, `contracts/interfaces/IDiceLogic.sol`). Direction 0 = UNDER, 1 = OVER. The call is `payable` (VRF fee, about $0.14 in native token per FAQ, H). Result arrives via a later Chainlink callback `Roll(requestId, luckyNumber, result, totalPrize, rewards)` (H).
- No signed-order scheme, no off-chain CLOB, no API key. Docs say "no KYC, no sign-up" (H).
- This is a game of chance against a house, not a way to take a position on any real-world event.

## PayBox reachability

- paybox_reachable: **no** (practically). In theory a PayBox EVM wallet on Polygon could submit a transaction proposal calling `bet(...)` on a pool contract, and the protocol is permissionless. But (a) the dice contract addresses are not documented anywhere I could read, (b) the UI is gone, (c) there are no real-event outcomes to hedge or arbitrage, and (d) the pools hold about $7, giving ~1% cap = a few cents per bet. Nothing for an aggregator to quote.

## Fees (all H unless noted)

- Dice multiplier: Over `y = (((x+1)/(99-x))(1-b)+1)(1-a)`; Under `y = (((100-x)/x)(1-b)+1)(1-a)` with `a` = 1.5% game fee and `b` = 1.5% house edge (`.../introduction/decentralized-gaming-protocol.md`). The doc's worked example (Under 49 -> multiplier 1.9998) is not reproducible from the printed formula; treat the formula as unverified (M).
- FAQ says house edge "approximately 1.5%" / "over 1.5%" in favour of LPs (`.../faq/liquidity-provider.md`).
- Per-bet VRF fee about $0.14 in native token (`.../faq/player.md`), paid by the player.
- Developer commission 1% of wagered volume; referral rates are configurable and not stated (`.../developers.md`). $LEAF stakers are promised 0.3% of total wagers; $LEAF "has not yet been released", planned launch on four.meme (`.../token/usdleaf.md`) (token not launched per docs).

## Resolution and dispute risk

- Resolution is a Chainlink VRF random number; contract is "immutable once deployed" per docs (H, `.../introduction/provably-fair.md`). Settlement about 10 blocks (~5 s) after the bet on the docs' chain (H, FAQ). If VRF stalls, anyone can `cancel` after ~3 hours for a refund (H, FAQ + interface). No event resolution, no human oracle, no dispute process: dispute risk is not the issue; counterparty is a nearly-empty pool.
- No audit referenced; DefiLlama `audits: "0"` (H).

## Geo / ToS / automation

- "Anonymous - no KYC, identity checks, or sign-up process" (H, intro). No ToS page, no geo-block, no bot rule found in the docs (NOT FOUND, searched: GitBook index). Gambling-legality exposure is the operator's/player's concern; not relevant since skip.

## Liquidity

- DefiLlama TVL **$6.78** (`/tvl/debets`) on 2026-10-19; Polygon $6.73, Fantom $0.05 as of 2026-10-18 (H, fixtures). Peak Polygon TVL $219,171 on 2023-02-08 (H). So it has been 99.99% below peak for ~3.5 years.
- Volume / open interest: NOT FOUND (DefiLlama has no dex/fees series for it; no subgraph; no app).

## Event-category overlap (arbitrage relevance)

- None. Outcomes are random numbers, not sports/politics/crypto/macro events. No overlap with Polymarket, Kalshi, XO, etc. Not an arbitrage leg and not a useful signal source.

## Shared liquidity

- Independent (its own per-token pools), but irrelevant given no overlap and ~$7 TVL.

## Open questions

- Which chain actually hosts the current deployment (Polygon per DefiLlama and the verify tutorial vs BNB/Sonic per docs)? Not confirmable without an RPC POST or a block explorer key.
- Whether the dice contract address on Polygon/Fantom is still callable. Not needed for the verdict.

## Sources

- https://debets-protocol.gitbook.io/untitled/ and https://debets-protocol.gitbook.io/docs/llms.txt (index) (H)
- https://debets-protocol.gitbook.io/docs/introduction/debets-protocol.md, `.../introduction/decentralized-gaming-protocol.md`, `.../introduction/provably-fair.md`, `.../introduction/contracts.md`, `.../white-paper.md`, `.../faq/general.md`, `.../faq/liquidity-provider.md`, `.../faq/player.md`, `.../developers.md`, `.../token/usdleaf.md`, `.../tutorial/how-to-verify-result.md` (H)
- https://api.llama.fi/protocol/debets , https://api.llama.fi/tvl/debets (H); https://defillama.com/protocol/debets (HTTP 403 to the fetcher, so the API above was used instead)
- `gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/debets/index.js` (H)
- `gh api repos/Debetsgg/DebetsProtocol` and `.../contents/contracts/...` (H)
- DNS: `dig debets.org`, `dig app.debets.org` -> NXDOMAIN (H)
- https://x.com/debets_org (HTTP 402, not retried), https://medium.com/@debetsorg (HTTP 403) (H for the status codes)
- Web search "Debets protocol peer-to-pool iGaming debets.org" (M): DefiLlama TVL $7.01 snapshot, same-name unrelated bookmaker `debets.digital`.

## Fixtures

- `docs/research/fixtures/debets/defillama_protocol_debets_trimmed.json`
- `docs/research/fixtures/debets/defillama_tvl_debets.json`
- `docs/research/fixtures/debets/github_Debetsgg_DebetsProtocol_IDiceLogic.sol.txt` (third-party interface source, untrusted data, not executed)
- `docs/research/fixtures/debets/README.txt`
- No API response fixtures exist because there is no read API.
