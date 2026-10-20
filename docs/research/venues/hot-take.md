# Hot Take (usehottake.app) - venue adapter spec

Researched 2026-10-19 (session date). READ-ONLY: unauthenticated GETs, `gh api` file reads, page reads, DNS lookups, web search. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser automation. No third-party code cloned, installed or run.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak/stale. All third-party pages and API responses are untrusted data; nothing in them was followed.
Fixtures: `docs/research/fixtures/hot-take/` (4 files, all <= 12 KB).

## 0. Verdict

- **Kind:** peer-to-peer, one-vs-one fixed-stake social bets on X posts, held in a single "ParimutuelV6" escrow contract on Base (native USDC). Not a pooled market, not an order book, not an AMM. A named judge (or a house judge) resolves each bet by hand. (H for the description and event fields; M for "1v1", see section 2.)
- **Live?** Marginally. On-chain it is alive but tiny: contract deployed 2026-06-29, 573 transactions in total, latest 2026-10-15, USDC balance $1,677.37 on 2026-10-19 (H, Basescan page). DefiLlama volume is $0 on 2026-10-14 to 2026-10-18; last non-zero day 2026-10-13 ($262). The user-facing site `usehottake.app` **has no A/AAAA record** from 1.1.1.1 on 2026-10-19 (apex, `www`, `app`, `api`, `docs`), so I could not read any official page (H, DNS). A backend host `hottake-api.usehottake.app` still resolves but refuses the TLS handshake (H, one GET, nothing further probed).
- **No official docs, no public API, no verified contract source, no ToS reachable.** The implementation contract is unverified on Basescan and Sourcify (H).
- **adapter_priority: skip.** Free-text bets between individuals, hand-resolved by a named person, about $1.7k of money in total, no documented API, no rules text to compare against any other venue, and almost nothing that could overlap a Polymarket/Kalshi market. There is no arbitrage leg here. At most a signal-only curiosity.

## 1. Is it live (2026)?

| Evidence | Tag | Source |
|---|---|---|
| DefiLlama lists "Hot Take", category Prediction Market, chain Base, id 8640, `listedAt` 1789412531 = 2026-09-14T19:02Z | H | https://api.llama.fi/protocol/hot-take (`fixtures/hot-take/defillama_protocol_hot-take_2026-10-19.json`) |
| DefiLlama TVL series 2026-09-14 to 2026-10-18: $732 flat to 09-29, $1,422 on 09-30, $1,532 on 10-09, $1,677 from 10-14. Deposits were still arriving in mid-October. | H | same file |
| DefiLlama volume: non-zero on 2026-09-25 ($4), 09-28 ($10), 09-29 ($410), 09-30 ($4), 10-01 ($24), 10-03 ($10), 10-08 ($200), 10-13 ($262); all-time shown $924; 7d $262; 30d $924; 24h $0. The chart only starts 2026-09-25, so it is a partial backfill: the adapter PR author states 2026-09-03 = $420 and 2026-09-04 = $300 (author-reported, not independently seen). Realistic cumulative volume: low thousands of USD at most. | H (data), M (interpretation) | https://api.llama.fi/summary/dexs/hot-take (`fixtures/hot-take/defillama_summary_dexs_hot-take_2026-10-19.json`); PR below |
| DefiLlama fees: all zero (protocol fee 0 bps, judge fee optional) | H | https://api.llama.fi/summary/fees/hot-take |
| Basescan: proxy created 2026-06-29 04:54:09 (block 47959751), 573 tx total, latest tx 2026-10-15 02:30:05, USDC balance 1,677.372374 | H | https://basescan.org/address/0x64Be8f389E202a77b446C7E86B564F4122Cb5a66 |
| Certificate-transparency logs show the project kept issuing certs for `usehottake.app`, `www.` (2026-09-02) and an internal staging tool host (2026-10-07). Someone is still operating infrastructure in October. | H (CT entries), M (inference) | https://crt.sh/?q=%25.usehottake.app&output=json (`fixtures/hot-take/probe_log_2026-10-19.txt`) |
| Site `usehottake.app`: NS at Cloudflare, MX at Google Workspace, **no A/AAAA at apex or `www`**. WebFetch: `getaddrinfo ENOTFOUND`. Wayback has no snapshot. Website therefore appears down, un-launched or moved. | H (DNS), M (cause) | `dig` via 1.1.1.1 and 8.8.8.8; https://archive.org/wayback/available?url=usehottake.app |
| X account `x.com/UseHotTake`: WebFetch returned HTTP 402; not followed, not read. | H (that it failed) | WebFetch |

Conclusion: contract live and funded with $1.7k; product surface not reachable; activity is a handful of bets per month. Treat as "barely live".

An earlier incarnation exists on **Initia**: a MiniEVM rollup `hotake-1` (EVM chain id 3012404628290843) was registered in the Initia registry on 2026-05-06 with the blurb "A social wagering app on Initia where opinions are settled onchain" / "Opinions are free. This gets settled." (H, https://github.com/initia-labs/initia-registry/blob/main/profiles/hotake.json). Its registry profile status is still `upcoming`, and a 2026-08-04 commit removed `chain_id` and `l2` from the profile and added the website/X links (H). Its RPC `rpc-hotake-1.anvil.asia-southeast.initia.xyz/status` returned `catching_up:false`, latest block 14,475,439 at 2026-10-19T00:17:30Z (H, `fixtures/hot-take/initia_hotake-1_rpc_status_2026-10-19.json`), but Minity reports only 5 accounts and about 7.2M transactions (H, https://minity.xyz/rollup/hotake-1), i.e. a running chain with essentially no users. The Base deployment came after (2026-06-29) and is the one DefiLlama tracks. That the project pivoted from Initia to Base is my inference (M).

## 2. Market model

Everything in this section comes from the project-authored DefiLlama adapter and its two listing PRs, not from official docs (none reachable). The contract ABI is not verified, so field lists are as-reported (H for "the adapter reads this event", M for "the contract emits exactly this").

- **Market = one bet between two people.** Description: "Peer-to-peer betting on X. Challenge anyone with a take, both sides stake USDC on Base, and a named judge settles it." (H, DefiLlama protocol description, same text in PR #21016). Adapter comment: "Two users stake native USDC on opposite sides of a take; a market is created on-chain **only once BOTH stakes are locked**, and a judge (or the house judge) resolves it." (H, https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/hot-take/index.ts).
- **On-chain market record** (event `MarketCreated`, H as read in the adapter): `marketId (uint64, indexed)`, `creator (address, indexed)`, `title (string)`, `creatorOutcome (uint8)`, `creatorAmount (uint256)`, `takerAmount (uint256)`, `arbiter (address)`, `arbiterFee (uint256)`, `bettingDeadline (uint64)`, `resolutionDeadline (uint64)`.
  - Binary: creator takes one outcome (`creatorOutcome`), the taker takes the opposite. A third outcome (draw/void) is not documented (NOT FOUND).
  - **Stakes can be asymmetric** (`creatorAmount` vs `takerAmount`), so a bet is a fixed-odds wager, not a share priced 0 to 1. Implied probability for the creator's side would be `creatorAmount / (creatorAmount + takerAmount)` before fees (M, my arithmetic on the fields).
  - `title` is free text. There is no structured event key, no category, no resolution-source field and no tokenised outcome. Cross-venue matching would have to be done by parsing English titles about X posts (M).
- **Tokenisation:** none. No ERC-20/1155 outcome tokens are mentioned anywhere; positions are rows in the escrow contract. Winner calls claim (`Claimed(marketId, winner, payout, protocolFee, arbiterFee)`, H in adapter).
- **Funds model:** users deposit USDC to a per-user "protocol balance" inside the contract and bets lock from that balance ("user protocol balances plus stakes locked in active bets", H, PR #21016 methodology). A Basescan-labelled method "Withdraw For" appears in the contract's transactions, suggesting a relayer can withdraw on a user's behalf (M, label only; method ids `0x64e4db07`, `0x9e134e1a`, `0xe701b5e9` unresolved).
- **Order book / AMM / pricing:** none. There are no quotes to read. The "price" of a bet is whatever stake split two people agreed to.
- **Pending (unmatched) challenges are not on-chain.** The adapter says a market only reaches the chain once both sides are matched. Open challenges therefore live in the backend/X, which is not public (M).

## 3. Chains and collateral

- Base mainnet (chain id 8453) only for the Base deployment. (H, DefiLlama `chains:["Base"]`)
- Collateral: native Circle USDC on Base, `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (H, DefiLlama helper `coreAssets.json`; the adapter counts volume in that token). 6 decimals.
- Contract (EIP-1967 proxy): `0x64Be8f389E202a77b446C7E86B564F4122Cb5a66`. Implementation `0x0A0600656466167eEBe08038F937F614286fa5d2`, **unverified**; proxy init selector `0xfe4b84df` = `initialize(uint256)` (H, Basescan + openchain). Upgradeable, so admin can change logic (M, ERC-1967 proxy; admin/owner not read).
- No token ("There is no token", H, adapter methodology). No audit published ("None to link publicly at this time", H, PR #21016; DefiLlama `audits: "0"`).
- Initia rollup `hotake-1` (MiniEVM) exists separately; fee token and any wagering contracts there are NOT FOUND (searched: Initia registry files, Minity page).

## 4. Read API

- **Official public read API: NOT FOUND.** Searched: usehottake.app (no DNS), `docs.`, `api.`, `app.` subdomains (no DNS), GitHub repo/code search for `usehottake`, `ParimutuelV6`, the contract address (only DefiLlama adapters match), web search extended for "Hot Take" + Base/USDC/X (nothing from the project), X account (HTTP 402).
- `exists`: **onchain-or-subgraph-only** in practice. The only machine-readable sources are:
  1. **Base chain events** on the proxy (`MarketCreated`, `Claimed`; the DefiLlama adapter consumes them with `getLogs`). Reading them needs JSON-RPC/`eth_getLogs`, which is a POST and was out of scope here. Event signatures are as-reported in the adapter, not verified from source.
  2. **DefiLlama aggregates** (public GET, no key): `https://api.llama.fi/protocol/hot-take` (TVL by day), `https://api.llama.fi/summary/dexs/hot-take` (daily volume), `https://api.llama.fi/summary/fees/hot-take`. Shapes confirmed and saved as fixtures. These give daily totals only, no per-bet data.
  3. A backend host `hottake-api.usehottake.app` (found only via CT logs, not documented). One GET to `/` ended in a TLS handshake failure; I did not guess paths or probe further. Testnet and staging variants also exist in CT/DNS (`hottake-api.testnet.`, `hottake-api-mainnet.staging.`). Treat as private.
- Auth and rate limits: NOT FOUND. WebSocket: NOT FOUND.
- Aggregator consequence: there is nothing to poll for prices, and bets are not discoverable until they are matched and on-chain.

### Fixture shapes (H, unauthenticated GET 2026-10-19)

- `GET https://api.llama.fi/protocol/hot-take` returns `{id:"8640", name, address:null, url:"", description, chain:"Base", category:"Prediction Market", chains:["Base"], listedAt, dimensions:{fees:"hot-take", dexs:"hot-take"}, methodology, chainTvls:{Base:{tvl:[{date, totalLiquidityUSD}, ...]}}, currentChainTvls:{Base:1677.05284}, ...}`. Note `url` is empty and `twitter` null, which is why the venue was discovered without a website.
- `GET https://api.llama.fi/summary/dexs/hot-take` returns `{total24h:0, total7d:262, total30d:924, totalAllTime:924, totalDataChart:[[unixSec, usd], ...], chainBreakdown:{Base:{...}}}`.
- `GET https://rpc-hotake-1.anvil.asia-southeast.initia.xyz/status` (Initia rollup, documented in the Initia registry) returns a CometBFT status with `sync_info.latest_block_height` and `latest_block_time`.

## 5. Trade path

- **Programmatic placement: NONE documented.** There is no order API, no signing scheme, no SDK and no contract ABI. Challenges appear to be created and accepted through the X-linked app (M: "bets on X posts", user-balance model, relayer-style "Withdraw For"), and the on-chain `MarketCreated` is emitted only after both sides are locked, which suggests the backend (or a relayer) submits the creation transaction (M).
- Whether a user EOA can call `deposit`/`createMarket`/`takeMarket`/`claim` directly is **unknown**: implementation unverified, selectors unresolved (searched: openchain and 4byte for `0x64e4db07`, `0x9e134e1a`, `0xe701b5e9`).
- A transaction in principle would be a plain Base contract call with USDC `approve` plus a custom call. Nothing to build calldata from.

## 6. PayBox reachability

- `paybox_reachable`: **unknown**.
- Chain and token fit: Base (8453) is in PayBox's chain catalog and the collateral is native Base USDC (H, `docs/research/06-paybox-platform.md` section on the chain catalog). A PayBox EVM proposal (`to`, `value`, `data`, one call) on `eip155:8453` could carry any call to the proxy.
- Blocking gaps: no verified ABI or docs to construct safe calldata, the entry points a normal user is meant to call are unknown, matching/creation is probably backend-mediated, and the front-end is unreachable. PayBox shows only raw calldata for approval, so blind-signing an undocumented, upgradeable, unaudited contract is a poor idea.
- Gas: the PayBox EOA pays gas in ETH on Base (no sponsor field in the strict proposal schema, H from the platform note).

## 7. Fees

- **Protocol fee: 0 bps at deployment and never changed** (PR author's statement that the on-chain rate "is 0 bps since deployment ... never been raised", H as quoted from https://github.com/DefiLlama/dimension-adapters/pull/9432; adapter note "reads 0 until it is raised"). DefiLlama fee dimension is 0 throughout (H).
- **Judge fee:** per bet, set by the creator (`arbiterFee`), "0 when the bet uses the house judge or names no fee" (H, adapter `breakdownMethodology`). Charged **on the pot when the winner claims**; both protocol and judge fee come out of the pot at claim (H, adapter "Fees: Protocol fee plus judge fee, both charged on the pot when the winner claims"). Whether `arbiterFee` is bps or absolute is not stated (NOT FOUND).
- No gas sponsorship mentioned. Gas on Base is paid by whoever sends the tx (M).

## 8. Resolution and dispute risk

- Resolution: a **named judge** (`arbiter` address, which may be the house judge account) calls `resolveMarket` on the contract (H, PR #21016: "Settlement is a judge calling `resolveMarket` on the contract"). No oracle: "Oracle Provider(s): None. Bets are settled by the judge named in the bet, or by the protocol's house judge account." (H, same PR).
- Deadlines: each market has `bettingDeadline` and `resolutionDeadline` (H, event fields). What happens if the judge never resolves (refund, auto-void, escalation) is NOT FOUND (searched: DefiLlama adapters and PRs; no docs reachable). The adapter comment mentions "Cancelled markets refund the stakes", so cancellation exists (H, adapter methodology), but who may cancel and when is NOT FOUND.
- Dispute/appeal process: NOT FOUND.
- Risk assessment (M): single-person resolution, no rules text, judge can be a counterparty's friend, upgradeable proxy with unverified implementation, no audit. For any cross-venue use this is the opposite of an oracle-backed market. Resolution terms cannot be matched to Polymarket/Kalshi rules.

## 9. Geo, ToS, automation

- ToS, geo-restrictions and automation rules: **NOT FOUND** (searched: usehottake.app and common paths via DNS/HTTP: unreachable; web search; GitHub). Nothing to quote.
- Regulatory context: peer-to-peer wagers on social-media posts settled by a private judge are plausibly gambling in many jurisdictions (M, general knowledge, not project text).

## 10. Liquidity

- TVL (USDC held by the contract): **$1,677.05** on 2026-10-18 (H, DefiLlama `currentChainTvls`); Basescan balance 1,677.372374 USDC on 2026-10-19 (H). It includes user deposits not yet bet plus active stakes, so deployed liquidity is lower.
- Volume: $262 in the last 7 days (to 2026-10-18), $924 over the 30 days / all time shown by DefiLlama (H, partial backfill; see section 1). OI: not published; NOT FOUND.
- Per-bet sizes in the reported daily numbers: a few dollars to a few hundred dollars (H data, e.g. $4, $10, $200, $262).
- Money in the Initia rollup: Minity shows TVL "-" (H).

## 11. Event categories and overlap

- Content is user-generated claims about what people will post or do on X (the example given is bets "on X posts"). No structured categories (H, absence in `MarketCreated`).
- Overlap with other venues: **effectively none**. A Polymarket "Elon Musk # of tweets" market is a different instrument than a one-off personal wager with a named judge, and Hot Take titles are free text. No sports/politics/crypto/macro feed. (M)
- Liquidity sharing: independent of every other venue (own contract, no routing or hedging), but also too small to be a useful leg. (H for contract independence, M for no shared liquidity: nothing mentions a router.)

## 12. Suspicious content

None found. The WebFetch of `x.com/UseHotTake` returned an HTTP 402 payment-required style response, recorded and not followed. No text aimed at AI agents was seen in any page read.

## 13. Open questions

1. Where is the live app? `usehottake.app` has no A record today; is there a different domain, or is the app paused?
2. Verified ABI and admin: who owns/admins the proxy, and can the implementation be swapped? (Needs verified source or a bytecode read.)
3. Are open challenges stored off-chain, and could they be read from the app (needs an API that is not documented)?
4. What is the judge's liability if they never rule (refund, void, house judge override)?
5. Is `arbiterFee` in bps or USDC wei, and is there a cap?
6. Is the Initia `hotake-1` rollup still intended to host wagers, or abandoned?

## 14. Recommendation for the aggregation layer

- **Skip.** Do not build an adapter. If a generic "social wager" source is ever wanted, DefiLlama's `/summary/dexs/hot-take` gives a free liveness heartbeat, but that is the only integrable surface.
- Revisit only if: the project publishes docs/API and a verified contract, volume exceeds roughly $50k/month, and it starts listing structured, rule-bound events that match other venues.

## Sources

Primary or project-authored:
- DefiLlama protocol API (H): https://api.llama.fi/protocol/hot-take
- DefiLlama volume summary (H): https://api.llama.fi/summary/dexs/hot-take
- DefiLlama fee summary (H): https://api.llama.fi/summary/fees/hot-take
- DefiLlama volume/fees adapter, written by the project (H for what it says): https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/hot-take/index.ts (read via `gh api`)
- DefiLlama TVL listing PR with methodology, oracle and audit answers (H): https://github.com/DefiLlama/DefiLlama-Adapters/pull/21016
- DefiLlama volume/fees PR with fee statements and example days (H, author-reported): https://github.com/DefiLlama/dimension-adapters/pull/9432
- Base contract page, proxy (H): https://basescan.org/address/0x64Be8f389E202a77b446C7E86B564F4122Cb5a66
- Base contract page, implementation, unverified (H): https://basescan.org/address/0x0A0600656466167eEBe08038F937F614286fa5d2
- Initia registry profile and chain files (H): https://github.com/initia-labs/initia-registry/blob/main/profiles/hotake.json , https://github.com/initia-labs/initia-registry/blob/main/mainnets/hotake/chain.json
- Initia rollup RPC (H): https://rpc-hotake-1.anvil.asia-southeast.initia.xyz/status

Secondary:
- Minity rollup analytics (M): https://minity.xyz/rollup/hotake-1
- Certificate-transparency hostnames (M): https://crt.sh/?q=%25.usehottake.app&output=json
- Signature lookups (no match): https://api.openchain.xyz/signature-database/v1/lookup , https://www.4byte.directory/api/v1/signatures/

Unreachable (recorded): usehottake.app (no DNS), x.com/UseHotTake (HTTP 402), base.blockscout.com (Cloudflare challenge, not bypassed), DefiLlama web page (HTTP 403; the API worked).

## NOT FOUND (searched)

- Official site/docs/ToS/FAQ (usehottake.app and subdomains no DNS; Wayback empty; web search)
- Public API, SDK, GitHub org/repo (GitHub repo and code search for the name, contract, `ParimutuelV6`)
- Verified contract source/ABI (Basescan impl page, Sourcify v2 404)
- Dispute/appeal process, void/refund rules for unresponsive judges
- Geo restrictions, KYC, automation policy
- Audit report
- Rate limits, WebSocket
- Open interest or per-bet public listing
