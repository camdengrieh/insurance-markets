# OptionRoom (ROOM): venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs, GitHub via `gh api`, WebFetch. Nothing was signed, posted, paid or installed. No third-party code was executed.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" = read through the WebFetch summariser, not raw.

## Verdict

**adapter_priority: skip.** There is no live OptionRoom prediction-market venue to quote or trade on 2026-10-19.

- The official domain `www.optionroom.finance` still answers, but it is now a generic WordPress crypto-news blog. Its own Terms of Use (last updated June 2026) say: "OptionRoom is a cryptocurrency news and information platform". [H, https://www.optionroom.finance/wp-json/wp/v2/pages, fixture `optionroom-site-wp-pages-trimmed.json`]
- The homepage returns HTTP 200 with an empty body (content-length 0). [H, curl 2026-10-19, fixture `optionroom-home-response-summary.txt`]
- `app.optionroom.finance` and `docs.optionroom.finance` do not resolve; `optionroom.gitbook.io` returns 404. [H, curl 2026-10-19]
- The protocol code is frozen: last commit to the application repo is 2022-08-12, to the market contracts repo 2021-06-21. [H, GitHub]
- The ROOM token is effectively dead: about $1.4k of liquidity on BSC and about $1 of 24h volume. [H, section 6]
- No read API, no subgraph, no docs, no websocket were found. [H/NOT FOUND, section 4]

**Revisit trigger (cheap):** `https://www.optionroom.finance/wp-json/wp/v2/pages` listing a page that is not about crypto news, or the BSC controller `0x2C4794f31c5f60d614cEe5b6E2dfeA8D71FFCd57` showing new `MCBuy`/`MCSell` events. The second check needs a keyed BSC explorer or an RPC (see Open questions).

## 1. Is it still live?

| Piece | Status 2026-10-19 | Evidence |
|---|---|---|
| `www.optionroom.finance` | Live WordPress site (PHP 8.3, LiteSpeed/Hostinger), empty homepage body, hosts crypto-news posts dated 2026-07-22 and 2026-08-13 (Clarity Act, XRP, Solana). Not a prediction-market app. | H, curl + `/wp-json/` |
| Contact page on that site | Lists an email on an unrelated domain (`mydearquotes.com`); About/Contact are templated SEO-news boilerplate, pages created 2026-06-09 | H, wp-json pages. Reads like a brand/domain re-use by a third party (M). |
| App / docs hosts | `app.`, `docs.` NXDOMAIN; gitbook 404 | H |
| GitHub org `OptionRoom` (created 2020-12-12) | 4 public repos, none archived, last push 2022-11-20 | H, `gh api` |
| ROOM token | Alive as a token only (see section 6) | H |
| CoinMarketCap | In the prediction-markets view as slug `optionroom` with price shown as "--"; the coin page is a "preview page", carries a "Contract Address was swapped" banner and an About text that still says "built on Polkadot" | H (fetch-summarised), https://coinmarketcap.com/view/prediction-markets/ and https://coinmarketcap.com/currencies/optionroom/ |
| CoinGecko | `option-room`, categories "Oracle" and "BNB Chain Ecosystem" (not a prediction-market category), last_updated 2026-10-15 | H, https://api.coingecko.com/api/v3/coins/option-room, fixture `coingecko-option-room-trimmed.json` |

A web search for project announcements, Twitter/X, Medium or Telegram status was **not possible**: the session's WebSearch budget was exhausted. A shutdown notice may exist; none was found on the site or in the repos.

## 2. Kind and market model (from the 2021-2022 source, not from a running system)

- Kind: community-governed oracle plus "forecast markets". The earliest repo README says "OptionRoom is a user governed oracle and forecast protocol built on Polkadot." [H, https://github.com/OptionRoom/OptionRoom-Protocol] The later production contracts and UI target Ethereum (ROOM/COURT tokens) and **BNB Chain** (market contracts), with no Polkadot code. [H, section 3]
- Market model: **binary only**. `createMarketProposal` calls `ct.prepareCondition(address(this), questionId, 2)`, i.e. exactly 2 outcome slots; votes are `uint256[2]`. [H, `contracts/OR/ORMarketController.sol`, https://github.com/OptionRoom/OptionRoom-MarketPlaceProtocol]
- Pricing: **AMM**, a Gnosis/Omen-style fixed-product market maker (constant product over the outcome-token pool balances), one clone per market via `FixedProductMarketMakerFactoryOR`/`CloneFactory`. Buy path `buyTo(beneficiary, investmentAmount, outcomeIndex, minOutcomeTokensToBuy)`, sell path `sellTo(beneficiary, amount, index)`; `calcBuyAmount` and `calcSellReturnInv` are public views. [H, `contracts/OR/FixedProductMarketMakerOR.sol`]
- Tokenisation: outcome positions are **ERC-1155** Gnosis ConditionalTokens positions (`ORConditionalTokens`, `optionTokenV4`); LP shares are tracked inside the market contract. [H]
- Market creation is permissionless in code (`createMarketProposal(questionId string, participationEndTime, resolvingEndTime, collateralToken, initialLiq)` with a minimum initial liquidity of 100e18 and a collateral allow-list), but a market starts in a "Validating" state and is voted Active or Rejected by token stakers. [H, controller source + `src/shared/constants.js` market states in the application repo]

## 3. Chains and collateral

All addresses are from the official application repo `src/shared/contracts/contracts.helper.js` (last commit 2022-08-12). [H, https://github.com/OptionRoom/OptionRoom-Application] Whether these contracts still hold open markets was **not verified** (no keyless GET path to BSC state; see Open questions).

| Role | Chain | Address |
|---|---|---|
| ORMarketController (v4) | BNB Chain (56) | `0x2C4794f31c5f60d614cEe5b6E2dfeA8D71FFCd57` |
| ORMarketsQuery (v4, on-chain read helper) | BNB Chain | `0xFE88AC91438d07Ea6B2E3d52C85724F7Cc15c407` |
| ORConditionalTokens (`optionTokenV4`) | BNB Chain | `0x400315400188C3F1e2F476776414569617b9a6b8` |
| ORManager / market governance | BNB Chain | `0xC376EBc40470DF887714c8443B4edCa2E71903c3` / `0x4de4c3d1130366080D29bB050cb2D756dd017812` |
| Collateral (named `usdt` and `busd` in config, same address = BUSD) | BNB Chain | `0xe9e7cea3dedca5984780bafc599bd69add087d56` |
| ROOM token (current) | BNB Chain | `0x3C45A24d36Ab6fc1925533C1F57bC7e1b6fbA8a4` |
| ROOM token (original, swapped away) | Ethereum | `0xad4f86a25bbc20ffb751f2fac312a0b4d8f88c64` |

- Older v1/v2 controllers also exist on BNB Chain in the same config. Ethereum mainnet and Ropsten entries in the config are token/farming contracts and early test deployments; the v4 market stack is configured for BNB Chain (56), BSC testnet (97) and a local chain only. [H]
- Collateral is **BUSD** (Binance-USD). Binance wound BUSD down in 2023-2024, so even a surviving market would be denominated in a deprecated stablecoin (M, general knowledge, not checked this session; flag as stale).
- Market creation fee, if any, is paid in ROOM (`marketCreationFees`, default 0 in source). [H]

## 4. Read API

**exists: onchain-or-subgraph-only** (and even that is unverified as live). No official REST, GraphQL or websocket API, no docs site, no subgraph was found.

- The web app read markets straight from the chain via `ORMarketsQuery` plus a Firebase Cloud Functions/Firestore backend (collection name `markets-prod`) for metadata, and IPFS for question text. The Firebase backend is private and not a public API. [H, `cloud-functions/functions/index.js`, file list shows `firestore.service.js`, `ipfs.service.js`]
- Docs URL: none. NOT FOUND (searched: `optionroom.finance` wp-json pages, `docs.`/`app.` hosts, `optionroom.gitbook.io`, GitHub org repos' READMEs, DefiLlama protocols list). The only written docs are the whitepaper PDF in https://github.com/OptionRoom/OptionRoom-Whitepaper (not read) and a June 2021 audit PDF at `contracts/audit/OptionRoom-Audit-Report-061321.pdf` in the MarketPlaceProtocol repo (not read).
- Rate limits / auth: none documented.
- Fixtures: no market-data response shape could be confirmed because no public market-data API exists. Fixtures saved are liveness evidence only (section 8).
- Note: the application repo has a `.env` file committed. It was deliberately **not** read or recorded.

## 5. Trade path

- Legacy on-chain only. Buy: ERC-20 `approve(collateral -> ORMarketController)` then `ORMarketController.marketBuy(market, investmentAmount, outcomeIndex, minOutcomeTokensToBuy)`; the controller takes a 1% protocol fee, then calls the market's `buyTo`. Sell: ERC-1155 `setApprovalForAll(controller)` on the conditional-tokens contract, then `marketSell(market, amount, index)`. Both require the market to be in the `Active` state and emit `MCBuy` / `MCSell`. No signed-order, no off-chain book, no API-key scheme. [H, `ORMarketController.sol` lines 511-566]
- Slippage protection: `minOutcomeTokensToBuy` on buy; `marketSell` has no min-return argument (the internal guard is `amount * 105 / 100`), so sells are exposed to price movement within the transaction. [H]
- The protocol fee is swapped into ROOM (`buyRoom`) on every trade, which adds gas and a dependency on the ROOM/collateral pool, itself nearly empty. [M, `buyRoom` body not read]
- No front end to discover markets exists today (app host does not resolve), so an agent would have to enumerate markets via `ORMarketsQuery` itself.

**paybox_reachable: no.** A BNB Chain EVM wallet could in principle send `approve` + `marketBuy` transactions through PayBox transaction proposals, but there is no live venue, no discoverable market list, no indexer and the collateral (BUSD) is deprecated. Not worth building. [M]

## 6. Fees, liquidity

- Fees (source defaults, flagged `//todo` in the code; deployed values **not verified**): LP fee 2% (`feeMarketLP`), protocol fee 1% (`FeeProtocol`), proposer fee 1% (`FeeProposer`), so roughly 4% of the stake on a buy; sells charge the LP and proposer fees on the return amount and the protocol fee is netted in `calcSellReturnInvMinusMarketFees`. Paid by the trader. [H for the constants, M for the net effect]
- Liquidity of the ROOM token (the only measurable thing): GeckoTerminal BSC token page shows `total_reserve_in_usd` about $1,435.86, `volume_usd.h24` $0.0, price about $0.0000955, FDV about $9.5k (2026-10-19). [H, https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0x3C45A24d36Ab6fc1925533C1F57bC7e1b6fbA8a4, fixture `geckoterminal-room-bsc-token.json`] CoinGecko shows price about $0.0000939, 24h volume about $0.99, market cap reported as 0 (last_updated 2026-10-15). [H, fixture `coingecko-option-room-trimmed.json`]
- Old Ethereum ROOM token: 9,191 holders, supply 100,000,000, no exchange rate; Blockscout still lists ERC-20 transfers as recent as 2026-10-07 (unknown selector `0xd05c2c94`; likely DEX/dust activity, not market activity). [H, https://eth.blockscout.com/api/v2/tokens/0xad4f86a25bbc20ffb751f2fac312a0b4d8f88c64 and `/transfers`, fixtures `blockscout-eth-room-token.json`, `blockscout-eth-room-transfers-trimmed.json`]
- Prediction-market volume / OI / TVL: **NOT FOUND** (searched: DefiLlama `/protocols` for names or slugs containing "optionroom" or symbol ROOM: no entry; CoinGecko and CMC show only token data).

## 7. Resolution mechanism and dispute risk

- Oracle = token-holder vote, not an external oracle. Market state machine: Invalid, Validating, Rejected, Active, Inactive, Resolving, Resolved, DisputePeriod, ResolvingAfterDispute, plus "Force Resolved" in the UI. [H, `src/shared/constants.js`]
- Voting power comes from staking COURT (governance token) in `court_vote_stake`; reporting uses `reportPayouts` on the conditional-tokens contract. [H/M]
- Source defaults: validating period 1800 s, dispute and re-cast resolving periods 4 x 1800 s, dispute threshold 100e18 (all `//todo`). The UI constant `marketDisputePeriod` says 24 h, which disagrees with the contract default, so the real parameters are unknown. [H, with the inconsistency noted]
- The controller inherits `GnGOwnable` (owner/guardian) and the UI has a "Force Resolved" state, so an admin override likely exists (M, guardian contract not read).
- Dispute risk: high. Small staker set, token with about zero liquidity (cost to attack a vote is trivial), and no active operators evident. For any surviving market, resolution can stall or be captured.

## 8. Geo, ToS, automation

- The site Terms of Use (June 2026) describe a news site and contain no trading, API or automation terms, and no geo restrictions relevant to a prediction market. [H, fixture `optionroom-site-wp-pages-trimmed.json`] Any original product ToS is not available.
- Original app gating: a `NotWhitelisted` component and a `Whitelist.sol` contract exist in the repos, so the early app gated access by whitelist (M, file names only).

## 9. Arbitrage relevance

- Event categories / overlap: **NOT FOUND**. Markets were user-proposed binary questions with metadata in a private Firestore/IPFS; no category data, no live market list. No evidence of sports, politics, macro or crypto-price coverage that overlaps liquid venues.
- Liquidity sharing: none (independent AMM), but irrelevant because there is no liquidity.
- Role in the project: none as a trading leg. At most a historical curiosity for the "platform of platforms" registry (kind=other, status=dead/repurposed).

## Open questions

1. Are the BNB Chain v4 contracts still holding any open markets or liquidity? Not checked: BSC state needs JSON-RPC (HTTP POST) or a keyed explorer (Etherscan v2 returns "Free API access is not supported for this chain"; Routescan and Blockscout do not cover BSC keylessly). A read-only `eth_call`/`getLogs` check would settle it if the project later allows RPC POST for read-only queries.
2. Is there a formal shutdown notice? Web search budget exhausted; Twitter/X (`option_room`), Medium and Telegram were not checked.
3. Deployed (as opposed to source-default) fee and period parameters.
4. Who now controls `optionroom.finance`; the news-site content suggests a different operator from the protocol team (M).

## Sources

- Site (live, repurposed): https://www.optionroom.finance/ , https://www.optionroom.finance/wp-json/wp/v2/pages , /wp-json/wp/v2/posts , /robots.txt [H, curl 2026-10-19]
- GitHub org: https://github.com/OptionRoom ; repos `OptionRoom-Protocol` (README, tree), `OptionRoom-MarketPlaceProtocol` (`contracts/OR/*.sol`, `contracts/attributes-configurations.txt`), `OptionRoom-Application` (`src/shared/contracts/contracts.helper.js`, `src/shared/constants.js`, `src/shared/chains.js`, `cloud-functions/functions/index.js`), `OptionRoom-Whitepaper` [H, `gh api` raw contents, commit dates from the commits API]
- CoinMarketCap: https://coinmarketcap.com/view/prediction-markets/ , https://coinmarketcap.com/currencies/optionroom/ [H, fetch-summarised]
- CoinGecko: https://api.coingecko.com/api/v3/coins/option-room [H]
- GeckoTerminal: https://api.geckoterminal.com/api/v2/networks/bsc/tokens/0x3C45A24d36Ab6fc1925533C1F57bC7e1b6fbA8a4 ; `.../networks/eth/tokens/0xad4f...8c64` (no price, reserve about $12.8k, 24h volume 0) [H]
- Blockscout (Ethereum): https://eth.blockscout.com/api/v2/tokens/0xad4f86a25bbc20ffb751f2fac312a0b4d8f88c64 [H]
- DefiLlama: https://api.llama.fi/protocols (no OptionRoom entry) [H]
- Fixtures: `docs/research/fixtures/optionroom/` (`optionroom-home-response-summary.txt`, `optionroom-site-wp-pages-trimmed.json`, `coingecko-option-room-trimmed.json`, `geckoterminal-room-bsc-token.json`, `blockscout-eth-room-token.json`, `blockscout-eth-room-transfers-trimmed.json`, `github-optionroom-repos-meta.json`)
