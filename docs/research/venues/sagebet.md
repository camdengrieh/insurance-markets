# SageBet - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ran 00:15-00:30 UTC). READ-ONLY: doc reads, `gh api` reads, unauthenticated GETs to the site, its docs and public data hosts, one read-only PayBox `discover_tokens` call. No account, wallet, key, signature, POST/PUT/DELETE, no browser automation, no JSON-RPC (JSON-RPC is POST, so no `eth_call` was made; see section 0 and 11). Third-party pages and API text were treated as untrusted data; nothing in them was followed. No personal identifier was sent anywhere (generic User-Agent `insurance-markets-research/0.1`).

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/sagebet/` (listed in section 12).

---

## 0. Bottom line

1. **Technically online, effectively dormant. Rank: skip.** The sage.bet front end is still served, the docs site is up and the factory contract is verified. But every freshness signal I could get points to a project abandoned around 2023-24: the home page HTML is byte-identical to a 2023-12-03 Wayback snapshot, the docs/X posts date from spring 2023, DefiLlama shows $2.92 of resting USDC across all active markets, and the GitHub org has no contract repo (sections 1, 9).
2. **The one thing I could not do is read live market state** (active-market list, order books) because that needs a JSON-RPC POST (`eth_call`) and the ground rules forbid POST. So "no live market" is a strong inference (M), not an observation. A one-minute `getAllActiveMarkets()` + `bestBid()` read would settle it (section 11).
3. **Architecture is clean and integrable if it ever matters**: binary markets, a fully on-chain limit order book per market (two bid books, one per outcome), Gnosis Conditional Tokens (ERC-1155) for outcome shares, USDC.e collateral on Arbitrum One, no API of any kind (reads and trades are direct contract calls). PayBox lists Arbitrum (42161) and the collateral token, so a PayBox EVM wallet could trade it with plain `evm` transaction proposals (section 6).
4. **Disqualifiers for an arbitrage leg**: no visible liquidity; admin-only resolution by a single owner key with no dispute window (document says multisig, not verifiable); owner can change fees (up to 10%), halt a market and cancel all orders; unaudited beta ("not been fully audited"); no ToS/geo text; docs promise (multi-outcome, audit, SAGE token) never shipped.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://sage.bet` | HTTP 200, Next.js on Vercel. Title "SageBet: Fully on-chain prediction market, built with love on the #EVM". Footer "SageBet, Inc. 2023". Tabs "Active"/"All Markets" present but server HTML has no listing (client-rendered from chain). Only links: docs, X `sage_bet`, Discord, `/#markets`. No terms/privacy/geo text. (fetched 2026-10-19) | H |
| Front end not rebuilt in ~3 years | SHA-1/base32 of today's `index.html` (16,387 bytes) = `5PL6W2RIBTWVOS6ORCCDMJUQ2CJ24YIA`. Wayback CDX shows that exact digest for snapshots 2023-12-03, 2024-04-24, 2024-08-07 and for **all five** snapshots between 2025-12-13 and 2026-05-19 (`https://web.archive.org/cdx/search/cdx?url=sage.bet&output=json&fl=timestamp,statuscode,digest`). The HTML embeds hashed asset names, so an unchanged digest means no new build. | H |
| `Last-Modified: Thu, 15 Oct 2026` on `/` and `Sat, 17 Oct 2026` on a hashed immutable chunk | CDN/cache artifacts, not rebuild evidence (the body hash above did not change). Do not read them as "recently deployed". | M |
| Docs site `sagebet.gitbook.io/sagebet-documentation` | Up. Content is the 2023 v1 beta text ("Coming soon: multi-outcome markets, stats page, full third-party audit, SAGE token"); three "Get Started" links are broken; "Tokenomics: Coming soon...". A web search summarised the docs as ~1,280 days old and X posts as May 2023. | H (content), M (age) |
| X `@sage_bet` | WebFetch of `https://x.com/sage_bet` returned **HTTP 402 Payment Required** (no body, no payment terms exposed). Stopped there per rules; nothing paid. Last post date NOT FOUND directly. | H (the 402) |
| DefiLlama `api.llama.fi/protocol/sagebet` | id 2943, category Prediction Market, chain Arbitrum, `listedAt` 1683539603 (2023-05-08), audits "0", hacks [], TVL **$2.92 on 2026-10-18**. Series: peak $1,267 (2023-05-13); about $750 flat from 2023-07 to 2026-05-28; then step-downs of $100 (2026-05-29), $100 (2026-06-01) and $548 (2026-06-11) to **$2 flat through 2026-10-18** (fixture). Interpretation: someone cancelled resting orders or closed markets in May-June 2026 (so the contracts are not frozen), and nothing has been posted since. | H (data), M (interpretation) |
| GitHub | org `sage-bet` (created 2023-02-15) has 1 repo, a DefiLlama-Adapters fork, last push 2023-05-07; user `SageBet` has 0 repos. No contract/SDK repo. | H |
| Contract verification | Current factory verified on Sourcify as exact match on 2024-08-08 (so some maintenance existed in Aug 2024); `deployment.blockNumber` 82397835. | H |

Verdict: **still_live = false in the sense that matters (no evidence of any tradable market)**; the website and contracts still exist. Confidence medium because live on-chain state was not read.

---

## 2. Kind and market model

- **Kind (H, docs + source):** fully on-chain central limit order book (CLOB) prediction market, **binary only** ("Hardcoded binary outcome for MVP" in `MarketFactory.createMarket`; roadmap multi-outcome never shipped). Docs describe it as "v1", beta.
- **Structure (H, `fixtures/sagebet/MarketFactory.sol`, `Market.sol`):**
  - `MarketFactory` (owner-only `createMarket`) prepares a Gnosis ConditionalTokens condition with the **factory itself as oracle** and 2 outcome slots, then deploys one `Market` contract per question via `MarketCreator`. Factory keeps `activeMarkets[]`, `inactiveMarkets[]`, `marketQuestions[addr]` (a string), `marketIsResolved[addr]`.
  - Question string is JSON. The site only shows markets whose string parses and has `title`; it also reads `category`, `outcomes` and `resolutionDate` (unix seconds) (bundle `2613-17b25dacac876fbb.js`). Docs say the JSON holds title, subtitle and outcome names. Full schema: NOT FOUND (searched docs, bundle).
  - Outcome index 0 and 1 map to the ConditionalTokens index sets 1 and 2 (`outcomePositionIds[0/1]`). Outcome names are only in the JSON.
- **Order book mechanics (H, source):** each market stores a sorted linked list of **bids per outcome** (`bestBid[outcome]`, `outcomeBids[outcome][orderId]` = `BidData{price, amountShares, creator, nextBestOrderId, isConditionalTokenShares}`).
  - Price scale is **1e6 = 1.00 collateral per share** (`0 < price < 1e6`), not whole cents (docs say 1c-99c).
  - A buy of outcome X at price p is a bid on X. A **sell of X at p is posted as a bid on the opposite outcome at 1-p** (`limitOrderSell`, backed by the seller's shares, `isConditionalTokenShares = true`).
  - Complementary bids match by minting: `_splitConditionalTokens` calls `splitPosition` so both sides receive shares; share-backed bids match by `mergePositions`. So Yes bid + No bid >= 1.00 crosses.
  - Functions: `limitOrder`, `limitOrderCollateral`, `limitOrderSell`, `marketBuy(outcome, amountCollateral, maxPrice)`, `marketSell(outcome, amountShares, maxPrice)`, `cancelOrder(outcome, orderId, prevBestOrderId)`. Views: `bestBid`, `outcomeBids`, `getAllOutcomeBids(outcome)`, `outcomeBidCount`, `fee`, `minAmount`, `isMarketActive`, `conditionId`, `collateralToken`. A helper contract `MarketView` (`0x89Ad738b62C958991AF2E7279c7DBec20716eE84`, from the bundle, not verified on-chain by me) exposes `viewMarketBuy/viewMarketSell(outcome, amount, maxPrice, market)` -> `(uint, uint)` for quotes (M: meaning of the two outputs not documented).
  - Minimum order: per-market `minAmount` (docs: usually $1).
- **Source quirks (M, my reading of the code, not tested, not an audit):** (a) `marketBuy` compares the *opposite-side* bid price with `maxPrice` (`bestBidPrice > maxPrice` breaks), while the buyer's real cost is `1e6 - bestBidPrice`; the `maxPrice` semantics are therefore easy to get wrong - quote with `MarketView` first. (b) In `_fillOrders` (limit-order path) the remaining amount is reduced by `amountShares * maxPrice / bestBidPrice` rather than by the filled amount, which looks inconsistent. (c) Orders are keyed by `keccak256(outcome, sender, price, amount)`; an identical live order reverts. (d) Insertion is an O(n) linked-list walk (gas grows with book depth).
- **Tokenisation (H):** outcome shares are ERC-1155 positions in a Gnosis ConditionalTokens deployment (`0x4D47db23E76c529C0651646633eef69FCe202Ef1` per the bundle's config). Collateral behind filled positions sits in that CTF contract, not in the market contract.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Arbitrum One (42161) only | H (docs, DefiLlama) |
| Collateral | "USDC" at `0xff970a61a04b1ca14834a43f5de4533ebddb5cc8` (docs Architecture page). This is the **bridged USDC.e**, not native USDC (`0xaf88d065e77c8cC2239327C5EDb3A432268e5831`). PayBox `discover_tokens` names it "USD Coin (Arb1)", symbol USDC, 6 decimals, $1.9M DEX liquidity (2026-10-19). Collateral token is a per-market parameter; docs say only USDC is used. | H (address + PayBox listing), M (USDC.e identification is my background knowledge) |
| Factory (current, verified) | `0xd350c2B3D8EB1de65Cfa68928EA135EdA88326B6` (docs Contracts page; Sourcify exact match; solc 0.8.4, optimizer off; created in tx `0x0f5e466d296708401600e89553850b79d3087edae15abe38ad4f7c0647bd7596`, block 82397835) | H |
| Factory (old, "deprecated, unverified") | `0x893A890ac35F337f38dF271b18B05bb2722d14F0` | H (docs) |
| Oracle/owner Gnosis Safe named in docs | `0x35475f6661a911c1448048344B3597bA6B13f28A` (docs Architecture page). Whether it owns the *current* factory: NOT FOUND (needs `owner()` read). | H (docs claim), unverified |

---

## 4. Read API

**No official API, no subgraph, no WebSocket, no SDK.** Classification: `onchain-or-subgraph-only` (on-chain only).

- Docs: `https://sagebet.gitbook.io/sagebet-documentation/` (index `.../llms.txt`; any page as Markdown by appending `.md`). It has no API page (H). Searched: llms.txt, all pages in it, site bundle URLs, GitHub org, GitHub code search for the factory address (only DefiLlama adapter forks and a third-party enrichment repo). NOT FOUND: subgraph, REST, WS.
- The front end reads directly from chain via ethers/wagmi with a hard-coded Alchemy key, plus public RPC fallbacks (arb1.arbitrum.io/rpc, Infura, Ankr). The key is a third-party credential embedded in a public bundle; it was **not** used and is not recorded here. An adapter must bring its own Arbitrum RPC.
- Only site-hosted endpoint: `GET https://sage.bet/api/blocked` -> `{"blocked_markets":[<11 market contract addresses>]}`; the UI hides these markets (fixture `sage-bet-api-blocked.json`). Operator-maintained blocklist; date of last edit NOT FOUND. (H)
- Read recipe for an adapter (all `eth_call`; none executed by me):
  1. Markets: `factory.getAllActiveMarkets()` -> `(address[] markets, string[] questionsJson, bool[] isResolved)`; same for `getAllInactiveMarkets()`. (The bundle's ABI is stale for `resolveAndCloseMarket` but read functions match.)
  2. Book: `market.getAllOutcomeBids(0)` and `(1)` -> arrays of `{price(1e6), amountShares, creator, nextBestOrderId, isConditionalTokenShares}`, best first. Yes-ask = 1e6 - best No-bid price (and vice versa).
  3. Trades/fills: events `NewBid`, `NewBestBid` on the market contract; fills are visible via ConditionalTokens `TransferSingle`/`PositionSplit`/`PositionsMerge` and ERC-20 transfers (no dedicated fill event in `Market.sol` - H, source).
  4. Resolution: factory `marketIsResolved(market)`, CTF `payoutDenominator(conditionId)` / `payoutNumerators(conditionId, i)`, event `ConditionResolution`.
- Rate limits: none of its own; bounded by the RPC provider. Auth: none.
- Verified response shapes (real): `fixtures/sagebet/sage-bet-api-blocked.json`, `defillama-protocol-sagebet.trimmed.json`, `sourcify-marketfactory-meta.json`, `sagebet-bundle-abi.json` (ABIs only; no on-chain data was read).

---

## 5. Trade path

Direct on-chain transactions from an EOA; no signed off-chain orders, no relayer, no API key. (H, source.)

1. `USDC.e.approve(market, amount)` (per market, or a large allowance) - docs say about $0.10-$0.20 on Arbitrum.
2. Buy: `market.limitOrderCollateral(outcome, price, amountCollateral)` or `marketBuy(outcome, amountCollateral, maxPrice)`.
3. Sell: first `ConditionalTokens.setApprovalForAll(market, true)`, then `limitOrderSell` / `marketSell`.
4. Cancel: `cancelOrder(outcome, orderId, prevBestOrderId)` (caller must supply the predecessor id in the list; read the book first).
5. Redeem after resolution: `ConditionalTokens.redeemPositions(collateral, 0x0, conditionId, [1, 2])` (docs: "Claim" = one transaction).

Orders are visible to mempool-style front-running on Arbitrum only through the sequencer; no specific protection documented. Tx count per round trip is high (approve, order, approve-1155, sell/claim) because every action is its own transaction.

---

## 6. PayBox reachability: **yes (technically), but moot**

- PayBox chain catalog includes Arbitrum (42161) and PayBox `discover_tokens` returns the SageBet collateral token (`0xff97...5cc8`, "USD Coin (Arb1)", $1.9M liquidity, 2026-10-19). (H; chain list also in `docs/research/06-paybox-platform.md`, H, 2026-10-19.)
- PayBox `io.paybox/transactionProposal` `evm` kind takes **one call per proposal** (`{chain: eip155:42161, transaction: {to, value, data}}`); each step above is one proposal. There is no need for EIP-712 signing or any backend POST. (H in `06-paybox-platform.md`.)
- Caveats: (a) funding USDC.e on Arbitrum via PayBox swap/bridge routes not verified (I did not call `request_swap`); native USDC would need a swap to USDC.e; (b) ETH on Arbitrum for gas; (c) per-chain signing coverage for Arbitrum is "metadata catalog, not a support allowlist" per PayBox itself, so a `check_operation_readiness` dry run is still needed (not done: out of scope, it is an operation tool); (d) approve + order = 2 proposals, so atomic arb across venues is not possible; (e) the whole thing is pointless until a live market is shown.

---

## 7. Fees

- **Docs (H):** "All markets have a configurable fee of 0-10%, realized on all taker orders. No fees are taken for posting or cancelling limit orders." Fees accrue to a per-market `feeRecipient`.
- **Code (H text, M interpretation):** `fee` is in 1e6 units, `require(_fee <= 1e5)`. `_transferTokensWithFee` / `_transferConditionalTokensWithFee` take `amount * fee / 1e6` from **each payout leg of a fill, including the resting order's maker leg**, and fees on share legs are paid in outcome shares. So the code appears to charge both sides, which contradicts "taker only" in the docs. Not tested.
- Owner can change fee (`setMarketFee`, max 10%) and recipient (`setMarketFeeRecipient`) at any time. Current per-market fee values: NOT FOUND (needs `fee()` reads; the UI shows it in an (i) tooltip).
- Gas: Arbitrum L2 gas, paid in ETH, by the transacting wallet.

---

## 8. Resolution mechanism and dispute risk

- **Centralised, admin-only (H, source + docs):** the factory is the ConditionalTokens "oracle". `owner` calls `resolveAndCloseMarket(market, indexSets, limit)` or `resolveMarket(market, indexSets)`, which calls `reportPayouts(questionId, indexSets)` with whatever payout vector the owner chooses. Docs: resolved by "a lightning-fast multi-sig", "resolved as soon as their outcome is public"; "diminishes the decentralization... inevitably there are trust risks". No dispute window, no bond, no timelock, no on-chain rule text beyond the question JSON. (Whether the current factory owner is that Safe: NOT FOUND.)
- Owner powers: create markets, set fee/recipient, `toggleMarketStatus` (halts trading), `bulkCancelOrders` on a paused market. Funds in positions are held by the CTF contract, so the admin cannot seize them, but a wrong or malicious resolution pays out wrongly and cannot be disputed.
- Edge cases (void/invalid): the payout vector is arbitrary, so a 50/50 void is possible; no documented policy. NOT FOUND.
- Audit: none (docs: "contracts have not been fully audited"; DefiLlama `audits: "0"`). (H)

---

## 9. Geo, ToS, automation

- No Terms of Service, privacy policy, geo-restriction or API-usage text found on the site, bundle or docs (searched index HTML, three app chunks, all docs pages). The site only says "No registration, no deposits". (H absence.)
- The site does call `/api/blocked`, but that is a **market** blocklist, not an IP/geo block (H, bundle). No IP geo-gating observed.
- Automation: nothing prohibits it because nothing is stated; contracts are permissionless to call. Entity "SageBet, Inc." (2023); jurisdiction NOT FOUND. Treat as a US-person/unlicensed-venue legal risk like other unlicensed on-chain markets (M; not legal advice).
- Operator reachability: Discord invite and X account exist; both stale in my evidence. Not contacted.

---

## 10. Liquidity and overlap

- **Liquidity (H data, M interpretation):** DefiLlama TVL = USDC held by the *active* markets' contracts = resting collateral bids only. It was **$2.92 on 2026-10-18**. It excludes (a) collateral locked in the ConditionalTokens contract behind filled positions and (b) share-backed sell orders, so it understates open interest, but it is the right order of magnitude for *tradable resting depth*: effectively zero. Peak was $1,267 (2023-05-13). Volume/OI/fees: NOT FOUND (DefiLlama has no volume or fees adapter: `api.llama.fi/summary/fees/sagebet` -> "Fees for sagebet not found"; the dexs endpoint timed out).
- **Event categories (docs, H):** "Sports, World events, Crypto/DeFi" - binary only. No evidence that any category currently has live markets. In principle all three overlap Polymarket/Kalshi/XO, but with ~$0 depth there is nothing to arb.
- **Shared liquidity:** none. Independent order books and its own ConditionalTokens deployment on Arbitrum. (H, architecture)

---

## 11. Adapter spec (only if revisited)

Revisit trigger: a single `eth_call` pair shows non-trivial live depth. Do this first, outside the no-POST rule (needs human or explicit approval):
1. `factory.getAllActiveMarkets()` on `0xd350c2B3...88326B6` (Arbitrum). If empty, or all addresses are in `/api/blocked`, stop.
2. For each active market: `fee()`, `minAmount()`, `isMarketActive()`, `getAllOutcomeBids(0|1)`, JSON-parse the question for `resolutionDate`, `category`, `outcomes`.
3. Check `owner()` of the factory against the Safe in the docs, and read the Safe's last transaction time on an explorer.

If depth exists, adapter shape: poll `getAllActiveMarkets` + `getAllOutcomeBids` through an Arbitrum RPC (multicall), normalise price = best bid / 1e6, Yes ask = 1 - best No bid, fee from `fee()` (assume both sides pay), resolution risk = "single admin key, no dispute". Mark `liquidity_shared_with: none`. Trade via PayBox `evm` proposals as in sections 5-6.

Open questions (NOT FOUND without RPC): number and age of active markets; current order books; current `owner()`; per-market `fee`; whether any of the 11 blocked markets still hold funds; actual date of the May-June 2026 TVL drops' cause (cancelled orders vs market close vs withdrawal).

---

## 12. Fixtures and sources

Fixtures in `docs/research/fixtures/sagebet/`:
- `defillama-protocol-sagebet.trimmed.json` (DefiLlama protocol response, trimmed; full ~60 KB)
- `sourcify-marketfactory-meta.json` (Sourcify v2 contract metadata, sources omitted)
- `MarketFactory.sol`, `Market.sol` (verified sources from Sourcify, MIT)
- `sagebet-bundle-abi.json` (Market, MarketFactory, MarketView ABIs from the site bundle)
- `sage-bet-api-blocked.json` (site `/api/blocked` response)
- `wayback-cdx-sage-bet-recent.json` (Wayback snapshot digests 2025-12..2026-05)
- `gitbook-llms.txt` (docs index), `coins-llama-usdc-arb.json` (price check)

Sources (all fetched 2026-10-19):
- https://sage.bet (home page, HEAD, static chunks under `/_next/static/chunks/`, `/api/blocked`) - H
- https://sagebet.gitbook.io/sagebet-documentation/llms.txt and pages `sagebet/overview.md`, `sagebet/architecture.md`, `sagebet/architecture/contracts.md`, `sagebet/market-and-trading-basics/{orderbook-basics,fees,how-to-trade}.md`, `.../how-to-trade/{claiming,approvals}.md`, `sagebet/roadmap.md`, `sagebet/coming-soon....md`, `links/community-social.md` - H
- https://sourcify.dev/server/v2/contract/42161/0xd350c2B3D8EB1de65Cfa68928EA135EdA88326B6 - H
- https://api.llama.fi/protocol/sagebet; https://api.llama.fi/tvl/sagebet; https://coins.llama.fi/prices/current/arbitrum:0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8 - H
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/sagebet/index.js and its commit history (`gh api`) - H
- https://web.archive.org/cdx/search/cdx?url=sage.bet (digests) - H
- GitHub API: org `sage-bet`, user `SageBet`, code search for the factory address - H
- PayBox `discover_tokens` token_detail for `eip155:42161` `0xff97...5cc8` (read-only) - H
- https://defillama.com/protocol/sagebet (WebFetch HTTP 403; used the API instead), https://x.com/sage_bet (HTTP 402, stopped), WebSearch summary of the above (stale-docs/X dating) - L/M
- Arbiscan, Blockscout: blocked by Cloudflare challenge (not bypassed); Safe Transaction Service: 308 redirect, not followed; Routescan: Arbitrum "chain not supported".
- Sibling notes: `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md`.

Embedded/suspicious content: none aimed at AI agents. The docs page carries a standard GitBook "see llms.txt" banner (not an instruction). The site bundle embeds a third-party RPC API key (left unused, unrecorded). Two analytics tags (Google, Reddit pixel with placeholder `<EMAIL-HERE>` fields) are on the home page; irrelevant to the adapter.
