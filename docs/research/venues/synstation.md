# SynStation: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: WebFetch, `gh api` (raw file reads, no clone), DefiLlama public API, the Astar forum (Discourse JSON), Soneium Blockscout public v2 API (GET only), DNS and whois. Nothing was signed, posted or paid. No wallet, account or API key was touched.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means the page was read through the WebFetch summariser.

Limitation: the shared WebSearch budget ran out part-way through this task, so there was no web search for third-party news after the first two searches. The project's X account returned HTTP 402 to WebFetch, and Discord and Telegram were not opened. Everything below comes from direct fetches.

## Verdict

**adapter_priority: skip.** SynStation is an effectively dead Soneium prediction market. Its domain is parked for sale, it has no API or docs, its last topic list ended with a market that resolved on 2025-10-01, its last market-contract transaction was 2026-01-28, and the founder said in 2025-11 the platform was being "revamped" with no relaunch seen since.

- `synstation.org` is not a product site. It returns a 114-byte stub that JS-redirects to `/lander`, and WebFetch of `www.synstation.org` is 307-redirected to `https://forsale.godaddy.com/forsale/www.synstation.org`. Nameservers are `ns1/ns2.afternic.com`, the whois record was updated 2026-10-09, and every subdomain I tried (staking., market., markets., portal., app., api., docs., beta., testnet.) resolves to the same two parking IPs and has no TLS cert for the host. [H, fixture `dns-whois-parked-domain.txt`]
- Founder wrote on the Astar forum on 2025-11-12: "we are in a process to revamp the platform now. Will update via our X account soon." On 2026-01-14 a community member wrote that "the discord is dead and prediction markets arn't being settled" (a user claim, not verified by me). No later team reply is in the thread. [H for the text, M for the claim, fixture `astar-forum-thread-7889.json`]
- The market contracts on Soneium last saw a transaction on 2026-01-28 (conditional-token-like proxy, 4,382 txs lifetime), the LP-position NFT last minted on 2025-12-08 and last transacted 2026-01-05. Nothing since. [H, fixture `soneium-blockscout-synstation-contracts.json`]
- The only on-chain activity in recent months is withdrawals from the old staking/"Autopilot" vaults (for example `finalizeWithdraw` on 2026-10-12 on the USDC.e vault). That is people leaving, not a venue trading. [H, same fixture]
- DefiLlama still lists it with `deadUrl: true`. [H, fixture `defillama-synstation-protocol-trimmed.json`]

Revisit trigger: if a new domain or a pinned X post announces a relaunch, or if DefiLlama's `deadUrl` flips to false and market contracts show transactions after 2026-01-28. Not worth scripting a watch.

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| Website (synstation.org) | Parked / for sale (GoDaddy Afternic lander) | H: curl, WebFetch redirect, dig, whois |
| Subdomains (staking., market. etc.) | Wildcard to parking IPs; TLS "unrecognized name" | H: dig, curl |
| Domain | Created 2024-08-11, registrar GoDaddy, expiry 2029-08-11, record updated 2026-10-09 | H: whois. The owner is not identified (WHOIS shows only registrar/NS lines in my filter). |
| X account (@SynStation) | Could not read (HTTP 402 from WebFetch). A Feb 2025 tweet by the account about the Astar Contribution Score campaign appears in search results. | L |
| Discord / Telegram | Not opened. Telegram `t.me/synstationfam` and a Discord invite were linked from the Oct 2024 Paragraph post. | M |
| Paragraph blog | 10 posts, <100 subscribers (fetch-summarised). Post dated 2024-10-26 read. Mainnet-launch post not readable through the summariser. | M |
| GitHub org `WASD3Rplay` ("Wasd3r", the parent team) | Staking contracts repo last pushed 2025-04-09; `synstation-topics` last pushed 2025-05-19. No market-contract source repo. | H: `gh api` |
| Soneium chain itself | Alive: ~360k txs "today", 2 s blocks | H: Blockscout `/stats` |
| Market contracts | Exist and are verified as proxies, but implementations are unverified and last tx is 2026-01-28 | H: Blockscout |
| Liquidity pools | Factory last used 2026-01-05 | H: Blockscout |

Timeline (all H unless noted):

- 2024-08-11 domain registered. 2024-09-25 staking repo created; a Verichains audit PDF of the **staking** contracts is in that repo.
- 2024-10-14 Soneium Spark incubation winners announced; 2024-10-26 SynStation post about it (funding "up to $100,000 per team"). 2024-10-16 DefiLlama listing.
- 2025-01-14 market proxies verified on Blockscout; `synstation-topics` repo created. 2025-01-29 founder forum post asking Astar for support.
- 2025-02 to 2025-06: DefiLlama TVL rose to a $3.49M peak (2025-02-23), $2.6M in mid-June, then fell to $264k by 2025-07-13 and ~$5.6k now. This TVL is staking/vault deposits, not prediction-market liquidity (section 5).
- 2025-04-16 Soneium "Assemble on Soneium" post lists SynStation ("Community-owned Prediction Markets for Entertainment"). [fetch-summarised]
- 2025-05-19 last commit to the topics repo (36 topic files, last market resolves 2025-10-01).
- 2025-11-12 "revamp" message. 2026-01-14 "not being settled" report. 2026-01-28 last market-contract tx.

## 2. Kind and market model

Kind: onchain-other (Soneium L2). Two different sources, both from the team:

**Whitepaper design** (PDF in `WASD3Rplay/synstation-staking-contract`, 17 pages, read via PDFKit text extraction). [H for what the paper says; M for how much of it shipped]

- Each market has **multiple concentrated-liquidity (CLMM) pools, one per outcome**: pool `O_i / $GM`. A router contract handles minting outcome tokens and swaps across pools. This is AMM (Uniswap-V3-style), not an order book. Market types: binary, 1-out-of-n (categorical), and "spectral" (scalar-like, token redeems on a vote share). Spectral was described as future work.
- Outcome tokens: ERC-20 per outcome (`O_i`), implied by the pool design. Example payout rule from the team's own topic text: winning option redeems 1 $GM per share, losers 0; if the event is cancelled, each option redeems evenly (0.125 $GM in an 8-outcome example). [H, fixture `synstation-topics-topic-1.md`]
- Market creation: Dutch auction (GDA/VRGDA) for the right to propose a topic, then a 3-7 day forum review and a 3-7 day vote. Rejected proposals forfeit 30% of the bid.
- Base currency **$GM** ("Good Money"), a team-minted over-collateralised stablecoin; users must buy $GM to trade. Yield-bearing wrapper $stGM (ERC-4626). The Astar forum post says deposits in ASTR/USDC/USDT/SONE are converted to $GM automatically. [H, forum post 2025-01-29]

**On-chain evidence that the CLMM design was actually deployed** [H unless noted]:

- `PlunderV3Factory` (a Uniswap-V3/Pancake-V3-style fork, verified) at `0x81B4029bfCb5302317fe5d35D54544EA3328e30f` on Soneium, the factory DefiLlama's adapter uses for SynStation. 163 `PoolCreated` events, last factory tx 2026-01-05. Deployer is the same EOA that deployed the vault proxies. Ownership by SynStation is M (inferred from the DefiLlama adapter and shared deployer).
- ERC-721 "Synstation Market Positions NFT-V1" (`SYN-POS`) at `0xc9b9DDEe50EA1842A36e4AA02d50211586b6eE63`: 188 LP positions ever minted, 10 holders, last mint 2025-12-08.
- A conditional-token-like proxy at `0xa546b3a3C71aD7ED2152551490049f85FE136B34` with `redeemConditions` calls: 4,382 txs and 96,147 token transfers lifetime, last 2026-01-28. Implementation `0x8999FC32...` is not verified.
- Router/market proxy `0x1ccAA0C6448CCd836A09f62B1C0b2Df76f910424` (selectors only, implementation unverified), last tx 2026-01-26.
- Related staking: "Autopilot" vaults (`AutopilotVault` implementation) for ASTR, USDC.e, USDT, WETH, nsASTR, nrETH, wstASTR on Soneium, plus a PreStaking contract on Ethereum and Astar. These are yield vaults feeding $GM/$stGM, not market contracts.

Topics actually published (36 files, `WASD3Rplay/synstation-topics`): 10 sports championships (EPL, Champions League, La Liga, NBA/MLB playoffs, KBO, NPB), GRAMMY/Oscar winners, a DXY value, BTC and ETH price brackets, Korean presidential election vote shares, Kaito leaderboard ranks, Trump memecoins, K-pop view-count and chart questions, and many Soneium/ETH-conference questions. [H, `gh api`]. Every topic's resolution date is on or before 2025-10-01 (the latest, topic 34/36, "ETH price on October 1, 2025"). Whether anything was published after the repo's last push is **NOT FOUND**.

## 3. Chains and collateral

- Soneium mainnet (OP Stack L2 by Sony Block Solutions Labs). Chain id 1868 [M, from memory, not read this session]. Staking also on Ethereum and Astar (EVM).
- Collateral: $GM (team stablecoin, address NOT FOUND, searched: Blockscout token search for "SynStation"/"stGM", whitepaper, forum). Deposits converted from ASTR, USDC.e, USDT, SONE, WETH, LSTs. [H for the claim in forum post]
- $SYN token: described as "to be" in the site snippet and whitepaper (airdrop / points). I found no deployed $SYN address. **NOT FOUND**.

## 4. Read API

**NONE FOUND** (searched: synstation.org and subdomains, DefiLlama protocol record, GitHub org `WASD3Rplay` repos list, Paragraph, Astar forum, Soneium blog). exists = `onchain-or-subgraph-only`.

- No public REST/GraphQL/WebSocket, no docs site, no OpenAPI, no SDK. The only repos are staking contracts and the markdown topics. [H, `gh api repos` listing of 12 repos]
- Any integration would be pure RPC and event indexing on Soneium: `PoolCreated` on the factory, pool `Swap`/`Mint`/`Burn`/`slot0`, `redeemConditions` events on the conditional-token proxy. Market-to-pool mapping lives in unverified contracts and an off-chain backend that is gone, so market metadata is only in `synstation-topics` markdown (title, rules, resolution date) with no link to contract addresses. That mapping is **NOT FOUND**.
- Usable public read surface today: Soneium Blockscout v2 (`https://soneium.blockscout.com/api/v2`), documented by Blockscout, no key. Fixtures saved from it. No rate-limit values were read; I made about 20 requests with no throttling. [H for the host working, L for limits]

Fixtures (real responses fetched 2026-10-19) in `docs/research/fixtures/synstation/`:

- `defillama-synstation-protocol-trimmed.json` (shape of `https://api.llama.fi/protocol/synstation`, trimmed from ~800KB)
- `soneium-blockscout-synstation-contracts.json` (counters + newest-first tx rows for four contracts, SYN-POS token info)
- `astar-forum-thread-7889.json` (founder's own description and the 2025-11 / 2026-01 posts, usernames dropped)
- `dns-whois-parked-domain.txt`, `synstation-topics-topic-1.md`, `synstation-topics-topic-36.md`

## 5. Liquidity

- DefiLlama TVL **$5,608 on 2026-10-19** (Soneium $5,035, Ethereum $503, Astar $70). Peak $3.49M on 2025-02-23. [H, https://api.llama.fi/protocol/synstation]
- That TVL is the DefiLlama adapter summing staking vault `totalAssets()` and PreStaking pool deposits plus Uniswap-V3-style pool balances; it is **not** prediction-market open interest. Dominant tokens now: ASTR (256,528 tokens) and WETH. [H, adapter source `projects/synstation/index.js` and `tokens` field]
- Market volume / OI: **NOT FOUND**. No dashboard, no Dune, no DefiLlama dimensions entry found. The best proxy is on-chain counts above (4,382 txs on the conditional-token proxy lifetime; 188 LP position NFTs ever).
- Founder claimed up to $1.3M TVL during the staking campaign on Astar + Ethereum. [H that he said it; DefiLlama's Ethereum peak $1.21M on 2024-12-07 is consistent, M]

## 6. Trade path

None usable. Historically: wallet-signed EVM transactions to the router/pool contracts on Soneium (no off-chain order signing, no matching engine, since it is AMM-based). Router ABI and addresses for current markets are not public (implementations unverified, no docs, frontend gone). **NOT FOUND**: any SDK, ABI, or integration guide. No programmatic trade path I would put in an adapter.

Even for a hypothetical revival, an agent would need to: buy $GM (itself a team stablecoin of unknown peg health), find the market's pools via the factory, and swap `O_i/$GM`. Markets would need an operator to settle (see 8). Not recommended.

## 7. PayBox reachability

**no.** The venue is dead, and there is no maintained contract interface. Technically any EVM wallet could call Soneium contracts if PayBox supported Soneium (chain id 1868); I did not check PayBox's supported-chain list because the venue fails every other test. If it is ever revived, transaction proposals (not signed orders) would be the only route.

## 8. Fees and resolution

- Fees: pool swap fees in the CLMM pools, split between market proposer, veSYN voters and LPs in a 1 : 4 : 5 ratio "at the beginning" (provisional, governance-adjustable). Pool fee tier values are **NOT FOUND** in the whitepaper; `PlunderV3Factory` has `enableFeeAmount` (5 `FeeAmountEnabled` events in the log) but I did not decode the tiers. [H whitepaper §5.5.1] Traders pay the swap fee; proposers pay the Dutch-auction bid. There is also a $GM mint/redeem path whose fees are not described.
- Resolution: "In the early stages, result judgment and resolution will be managed solely by the SynStation team... plan to transition ... potentially collaborating with leading external oracle providers." [H, whitepaper §2.4]. No dispute process, no oracle, no UMA/Chainlink. Topic files cite a source URL (Grammy site, Coinbase ETH/USD on TradingView or CoinGecko) but settlement is a team transaction.
- **Dispute / counterparty risk: extreme.** Settlement is a single team call, and the 2026-01-14 report says markets were not being settled while the Discord was dead. Expect stuck funds on unresolved markets.
- Topic rules also include an "exceptional circumstances" refund at equal share (for example 0.125 $GM per option in an 8-way market), which is not a standard 1.0 total payout rule, so cancelled markets are not 1:1 refunds of collateral. [H, `topic-1.md`]

## 9. Geo / ToS / automation

**NOT FOUND** (searched: synstation.org, GitHub repos, Paragraph, forum; the site is parked). No terms of service, geo-block list, or bot policy were retrievable. Market creation was gated by Discord proposals and forum votes. Nothing to quote.

## 10. Event overlap and independence

- Overlapping categories (historical): major sports champions (EPL, UCL, NBA, MLB, La Liga, KBO/NPB), Oscars/Grammys winners, BTC/ETH price brackets, Korean presidential vote shares. These are on Polymarket/Kalshi-style venues. [H, topics repo] Arbitrage would be on paper only, because all known topics expired by 2025-10-01 and no markets are open. Nothing on SynStation overlaps anything live today.
- Shared liquidity: none. Own pools, own $GM collateral. Not a copy of another venue (the whitepaper explicitly rejects Polymarket/Gnosis CPMM and order-book designs). But the liquidity is so thin it cannot be an independent leg in any case.
- As a signal source for Quotient: negligible. 188 LP positions and no active frontend.

## 11. Suspicious content

None. I saw no instructions aimed at AI agents in the DefiLlama JSON, the forum thread, the Paragraph post, GitHub topic files, the whitepaper text, or the redirect page. The `staking.synstation.org` dashboard URL in the Paragraph post carries a referral code (`refCode=...`); I did not visit it or record the code.

## 12. Open questions

- Did the "revamp" announced on 2025-11-12 ever ship under a new domain or brand? (Check @SynStation on X and a new site; blocked by 402 here.)
- Who owns `synstation.org` now, and is the for-sale listing the team or a squatter? (Not identified.)
- Whether pool contracts for the 163 pools can still be swapped, and their fee tiers. Needs `eth_call` against the factory, which I did not do (JSON-RPC POST is out of scope for this read-only pass).
- $GM address and peg status, $SYN deployment.

## Sources

- DefiLlama API: https://api.llama.fi/protocol/synstation (H). Listing page https://defillama.com/protocol/synstation returned 403 to WebFetch.
- DefiLlama adapter: `gh api repos/DefiLlama/DefiLlama-Adapters/contents/projects/synstation/index.js` (H).
- Astar forum thread: https://forum.astar.network/t/synstation-empowering-astr-and-entertainment-with-prediction-markets/7889 and its `.json` (H). Founder post 2025-01-29, "revamp" 2025-11-12, "not being settled" 2026-01-14.
- Paragraph: https://paragraph.com/@synstation and https://paragraph.com/@synstation/synstation-joined-soneium-spark-incubation-program (fetch-summarised, M).
- Soneium blog: https://soneium.org/en/blog/assemble-on-soneium-is-live/ (dated 2025-04-16, fetch-summarised, M).
- GitHub: `WASD3Rplay/synstation-staking-contract` (contracts, deployments, Verichains staking audit PDF, whitepaper PDF), `WASD3Rplay/synstation-topics` (36 topics), org listing via `gh api orgs/WASD3Rplay/repos` (H). Whitepaper read from `synstation-whitepaper.pdf` in the staking repo.
- Soneium Blockscout v2: https://soneium.blockscout.com/api/v2 (stats, addresses, counters, transactions, tokens, logs, search, smart-contracts) (H).
- DNS / whois / curl of synstation.org and subdomains (H).
- Search-engine results (WebSearch, not fetched pages): dappradar.com/dapp/synstation, cryptorank.io/price/syn-station, x.com/SynStation, lfgm.astar.network/synstation (host did not resolve). Used only as pointers (L).
- Not reachable or not read: x.com/SynStation (402), dappradar.com (403), defillama.com (403), Discord, Telegram, any $GM/$SYN token page.
