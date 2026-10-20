# Wolf of Dumb Street (WODS, wods.fun) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs, `WebFetch`, one WebSearch (the shared search budget then ran out), reading a public JS bundle as text and verified contract source from Sourcify. No account, wallet, key, signature, on-chain call, POST or PayBox tool was used. Third-party pages, the site's JS bundle and API responses were treated as untrusted data; nothing in them was followed. No JSON-RPC (POST) call was made, so **no on-chain state (market count, pool sizes, recent bets) was read** (see section 12).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference; **L** = weak or stale. Anything dated before 2026-04-19 is flagged stale.

---

## 0. Bottom line

1. **Effectively dormant.** The front-end is still served (HTTP 200) and the contracts exist on Base, but the only evidence of activity in 2026 is zero: the WODS token has 0 transactions and $0 volume in all three pools, DexScreener returns `pairs: null`, and CoinGecko says "WODS tokens have stopped trading". I could not read the market contracts themselves, so "no bets are being placed" is inferred, not proven. (H for token data, M for the inference)
2. **It is a creator-resolved parimutuel, not a price-discovering market.** Each market is its own contract; you stake once on one outcome, cannot exit, and the payout depends on pool totals at resolution. There is no price to quote and no order book. (H, verified contract source)
3. **Trust model is "trust the market creator".** The creator alone resolves the market, can change its end time and bet limits, can cancel it, and can drain the whole contract with `retrieveFunds()` at any time. The site itself says "Market creator can resolve markets they create. So verify the markets you participate on." (H)
4. **No API at all.** The front-end reads the chain over a public Base RPC and IPFS. No REST, subgraph or websocket. (H, bundle)
5. **adapter_priority = skip.** Dead liquidity, WODS-denominated (a ~$6k market-cap meme token), no API, no hedgeable price, rug-capable resolver.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://wods.fun` | 308 -> `https://www.wods.fun/` -> 200, a React single-page app (`<title>Wolf of Dumb Street ($WODS)</title>`, Webflow generator meta, `main.349be5af.js`). Response headers: `last-modified: Fri, 16 Oct 2026 17:22:05 GMT`, served from Vercel. The timestamp most likely marks a recent deployment of the static site (my inference), so the front-end is not abandoned hosting-wise | H (headers), M (meaning of the date) |
| CoinGecko coin page (fetched 2026-10-19) | Description "a permissionless prediction market on Base"; price $0.05625 shown, market cap $5,982.94, 24h volume $1.36; page states "WODS tokens have stopped trading" on all listed exchanges; no active pairs. Its all-time high/low figures are inconsistent (high below low), so treat the page's numbers as unreliable | H (page, small-model summary of it) |
| DexScreener `latest/dex/tokens/<WODS>` | `{"schemaVersion":"1.0.0","pairs":null}` | H |
| GeckoTerminal token + pools (2026-10-19) | Token `volume_usd.h24 = 0.0`, `price_usd = null`; three pools, every one with 0 buys/sells in 5m..24h windows | H |
| Factory contract | Verified on Sourcify 2025-02-13; contract code is immutable, so markets can still be created and joined by anyone who holds WODS | H |
| Project social (X `@wodsfun`) | WebFetch returned HTTP 402 with no body, so last-post date is unknown. Not retried. No payment was attempted | H (402), last post NOT FOUND |
| Docs site `wodsfun.hashnode.space` | HTTP 429 with an `x-vercel-challenge-token` header (a bot-challenge page) from both WebFetch and curl; not bypassed | H |
| Age of project material | Launch press release 2025-02-13 (Chainwire, a paid release service, so promotional); Phantom page market cap ~$27k as of Aug 2025 (from a search snippet). Both are older than 6 months: **stale** | M, stale |

Verdict: **still_live = false in practice** (UI up, contracts callable, zero observable trading; on-chain market activity not checked). Confidence medium.

---

## 2. Kind and market model

- **Kind (H):** user-created on-chain **parimutuel pools** on Base, one `WODS_Market` contract deployed per market by `Market_Factory.deployMarket(...)` (source: Sourcify-verified `src/WODS_Market.sol`, `src/Market_Factory.sol`, Solidity 0.8.28; fixtures in section 13).
- **Outcomes (H):** 2 or more named outcomes (`string[] _outcomes`, minimum 2), stored as `outcomes[i] = {name, totalAmount, totalBets, users[]}`. The UI presents YES/NO. Which index is YES: NOT FOUND (searched: bundle copy and ABI; not determinable without reading a market).
- **No outcome tokens (H):** a position is only the storage entries `userBets[addr] = outcomeIndex+1` and `userAmounts[addr] = stake`. Nothing is tokenised or transferable.
- **Betting rules (H, `participate`):** one bet per address per market (`notAParticipant`; no top-up, no second outcome); stake must be within creator-set `[minPrice, maxPrice]`; requires prior ERC-20 allowance; bets are accepted until `endTimestamp`; **no sell / cancel-bet function exists** (the intro modal says "Buy or sell positions in markets you believe in" and "moving the price", which the contract contradicts: there is no price and no selling).
- **Payout (H, `resolveMarket` + `calculateWinnings`):** at resolution fees are skimmed from `totalRewards` (stakes plus any sponsor top-ups); each winner receives `totalRewards_after_fees * userStake / winningOutcomeTotal`. Implied pool-share of outcome i before fees = `outcomes[i].totalAmount / sum(totalAmount)`. The final multiple is unknown at bet time because later bets change it.
- **Sponsors (H):** anyone can call `amplifyRewards(amount)` to add to the pool before resolution (refunded only on cancel).
- **Stuck-fund edge cases (H, from source):** if the creator resolves to an outcome with zero stake, fees are still transferred and winners cannot claim (`ZERO_OUTCOME_AMOUNT`); if the creator never resolves or calls `renounceOwnership()`, stakes are locked (no timeout, no refund path other than creator `cancelMarket`).
- **Metadata (H, bundle code):** the market's `description` string is JSON, `{name, description, category, "image-hash"}`, with the image on IPFS through a Pinata gateway.
- **Not categorical-scalar, not an AMM, not an order book.**

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Base mainnet (chainId 8453; `0x2105` in the bundle's chain config) | H |
| WODS token | `0x4398c398e5ac747e6d51bf1db1dac346ca90fee0`, 18 decimals, supply 1,000,000,000 | H (GeckoTerminal, bundle) |
| Market factory | `0x417d276e82152bfa4fce5ce6582cB28a5eaCDe2F` (Sourcify exact match, verified 2025-02-13; deployed in block 26328204) | H |
| TokenLocking | `0x8AbF4C0aAcDBff929BCd157a53f6845414551789` (named in the factory's constructor args and in the bundle) | H |
| Collateral | Per market, `_tokenAddress` is arbitrary (the factory does not restrict it) and `tokenDecimals` is creator-supplied and unchecked against the token. The shipped UI always passes WODS, and says "winners get paid in $WODS" | H |
| Creation lock | 100,000 WODS locked in `TokenLocking` per market, returned to the creator via `unlockTokens(market)` only after the market is **resolved** (a cancelled market never unlocks). Constructor arg = 100,000e18 (decoded from the creation bytecode); the UI hard-codes the same 100,000 and shows "Creating new market takes 100,000 $WODS". The bundle's config also has `TOKEN_LOCKING_AMOUNT:"200000"`, which conflicts (unused or stale; current on-chain `lockAmount` not read) | H (constructor), L (conflict unresolved) |
| Gas | ETH on Base, paid by the user | H |

---

## 4. Read API

- **Exists:** `onchain-or-subgraph-only`. In practice **on-chain only**: no official REST, no subgraph, no websocket, no API docs. The docs site (`wodsfun.hashnode.space`, Hashnode) was unreadable (bot challenge). (H for what the bundle calls)
- **What the front-end calls (H, bundle):** JSON-RPC to `https://base-rpc.publicnode.com` (ethers) and the IPFS gateway (`*.mypinata.cloud`); third-party: DexScreener, Uniswap subgraph URL (legacy, `api.thegraph.com`), Basescan API.
- **Key on-chain reads (H, verified ABI):**
  - Factory: `getAllMarkets() -> address[]`, `predictionCount()`, `getAllUserMarkets(addr)`, `lockAmount()`, `_platformFee()`, `_creatorFee()`, events `MarketDeployed(tokenAddress)` (note: it carries the **token** address, not the market address) and `UserPredictionsUpdated`.
  - Market: `market()` struct (`admin, tokenAddress, description, tokenDecimals, minPrice, maxPrice, fee, totalRewards, totalBets, totalSponsors, endTimestamp, outcomes, finalOutcome, resolved, cancelled`), `outcomes(i) -> (name, totalAmount, totalBets)`, `getParticipants(i)`, `userBets(addr)`, `userAmounts(addr)`, `calculateWinnings(addr)` (reverts unless resolved), `getContractBalance()`; events `BetPlaced`, `MarketResolved`, `MarketCancelled`, `WinningsWithdrawn`, `RewardsAmplified`, `MarketUpdated`.
- **Auth and rate limits:** none of its own; limited by whichever RPC you use. Keyless token data from GeckoTerminal returned HTTP 429 on a second request within seconds (H, observed once).
- **Adapter implication:** would need an eth_call/log indexer on Base plus IPFS JSON parsing. No normalised book or price exists to map to a common schema.

---

## 5. Trade path and PayBox reachability

- **Programmatic placement (H):** direct EOA contract calls only: `ERC20.approve(market, amount)` on the market's token, then `market.participate(outcomeIndex, amount)`; later `market.withdrawWinnings()`. No off-chain signed orders, no relayer, no gas sponsorship, no cancel/exit.
- **Auth/signing scheme:** plain Base transactions signed by the wallet; no EIP-712 flow.
- **Constraints that matter to an agent (H):** one bet per address per market (so you cannot scale in or hedge inside the same market from one wallet); stake bounded by creator's min/max; WODS must be acquired first (thin Uniswap V2 pool, ~$7k reserves, section 9).
- **PayBox (`paybox_reachable = partial`):** Base (8453) is in PayBox's chain catalog (H per `docs/research/06-paybox-platform.md`, 2026-10-19), and an EVM transaction proposal is one call (`to`, `value`, `data`), so `approve` and `participate` would be two separate proposals; the contracts are plain and need no signatures. Not verified: whether PayBox's token discovery/simulator handles WODS, and whether a swap into WODS can be routed (not tested; money tool). Moot given section 0.

---

## 6. Fees

| Fee | Value | Who pays | Tag |
|---|---|---|---|
| Platform fee | 150 bps (1.5%) of the whole pool (stakes + sponsor top-ups), at resolution | deducted from winners' pool | H (factory constructor args decoded from creation bytecode; admin can change it with `updatePlatformDetails`, so the current value is not confirmed) |
| Creator fee | 50 bps (0.5%) of the pool, at resolution, paid to the creator | deducted from winners' pool | H (same caveat; `updateCreatorFee`) |
| Entry/exit fee | none in code; no exit | - | H |
| Gas | Base gas in ETH | bettor | H |
| Creation cost | 100,000 WODS lock (refundable only after resolution) | creator | H |
| Fee control by the market owner | `market.updatePlatformDetails(addr, fee)` lets the market's owner change its platform fee recipient and rate before resolution, with no cap in code; a rate above 10,000 bps makes `resolveMarket` revert (underflow), and exactly 10,000 would take the whole pool | - | H (source) |

Formula: `fee = totalRewards * bps / 10000`, for both fees; `payout = (totalRewards - fees) * stake / winningOutcomeTotal`.

---

## 7. Resolution and dispute risk

- **Mechanism (H):** the market owner (the creator, `Ownable`) calls `resolveMarket(outcomeIndex)` after `endTimestamp`. No oracle, no bond, no dispute window, no timeout, no fallback. The owner can transfer ownership.
- **Owner powers while the market is open (H):** `updateMarket(description, endTimestamp, minPrice, maxPrice)` (can move the end time or rewrite the question), `cancelMarket()` (refunds stakes; the 100k lock then stays locked), `updatePlatformDetails`, and **`retrieveFunds()` transfers the whole contract token balance to the owner at any time, with no state check** (so stakes can be taken before or after resolution).
- **Audit/assurance:** the press release says contracts are verifiable, no third-party audit is mentioned (M, Chainwire 2025-02-13, promotional).
- **Dispute risk:** maximal (single trusted resolver, and the same party can withdraw the funds).

---

## 8. Geo, ToS, automation

- Terms and Conditions are linked to `wodsfun.hashnode.space/default-guide/terms/terms-and-conditions`; the page returned HTTP 429 (bot challenge) twice, so **NOT FOUND (searched: the terms URL via WebFetch and curl, the site bundle for geo/ban text)**. No geo-block or KYC text found in the app bundle apart from SDK constants (a timezone list belongs to the wallet-connect SDK block, M). The app says "By using wods.fun, you agree to these Terms and Conditions".
- Automation: nothing found either way. Contract-level access is permissionless; no API means no API terms.
- The project describes itself as anonymous with no named team (M, press release). Regulatory status is unknown and risk is nonzero (unlicensed prediction market).

---

## 9. Liquidity

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| WODS market cap | $5,982.94 | CoinGecko page, 2026-10-19 | H |
| WODS 24h volume | $1.36 (CoinGecko page) / $0.0 (GeckoTerminal, DexScreener none) | 2026-10-19 | H |
| Token pool reserves (GeckoTerminal) | WODS/WETH Uniswap V2 $7,211; WODS/ETH Uniswap v4 0.3% $12.98; WODS/WETH Maverick v2 $1.25; token-level `total_reserve_in_usd` $3,667 (the sources disagree; all tiny) | GeckoTerminal, 2026-10-19 | H |
| Open interest / TVL in market contracts | NOT READ (no GET-able source: Blockscout and Basescan sit behind a Cloudflare challenge, Sourcify has no state, the public RPC is POST-only). Searched: Blockscout v2 API, Basescan, Routescan (no Base support), Sourcify | - | not found |
| Earlier datapoint | Phantom: market cap ~$27k as of Aug 2025 | search snippet | L, stale |

---

## 10. Event coverage and arbitrage overlap

- Content is whatever creators post ("Will we see aliens by 2026?" is the UI's own example); the category field is free-form metadata. No evidence of sports, politics, crypto-price or macro markets with real liquidity. (M)
- Even if a matching market existed, it is not an arbitrage leg: creator-resolved, parimutuel (payout not knowable at bet time), no exit, one bet per wallet per market, WODS-denominated (exposes you to token price). It could not be hedged against a CLOB price.

## 11. Shared liquidity

None found. Each market is a standalone contract with its own pool; WODS is settled in the project's own token. It does not route to or wrap another venue (H, source). It is independent but irrelevant.

---

## 12. Not found / open questions

- On-chain market list, per-market state, recent `BetPlaced` activity, current `lockAmount`/fees: not read. A follow-up with an `eth_call` (JSON-RPC POST) or an authorised Blockscout/Basescan key would settle "any activity in 2026". Cheapest check: `Market_Factory.predictionCount()` and the newest market's `endTimestamp`/`BetPlaced` logs.
- Terms of service text and X account activity (402 / bot challenge).
- Which outcome index the UI treats as YES.

## 13. Fixtures (`docs/research/fixtures/wolf-of-dumb-street-wods/`)

- `wods-fun-index.html` - the real root document of www.wods.fun (1.9 KB).
- `geckoterminal-token.json`, `geckoterminal-token-pools.json` - token and 3 pools, 2026-10-19.
- `dexscreener-token.json` - `pairs: null`.
- `sourcify-market-factory-meta-abi.json` - verification metadata, factory ABI, constructor argument hex and my decoding.
- `Market_Factory.sol`, `WODS_Market.sol`, `TokenLocking.sol` - verified source (MIT, SPDX header) from Sourcify.

## 14. Suspicious / notable content

- The site's public JS bundle embeds what look like live credentials (a Basescan API key and a Pinata JWT). I did not use or record them; they should be treated as exposed (this is an observation, not an instruction I followed).
- Site copy ("buy or sell", "moving the price") misdescribes the contract (no selling, no price).
- No text aimed at AI agents was found.

## Sources

- https://www.coingecko.com/en/coins/wolf-of-dumb-street (WebFetch, 2026-10-19) - H
- https://wods.fun -> https://www.wods.fun/ and `/static/js/main.349be5af.js`, `/manifest.json` (curl, 2026-10-19) - H
- https://sourcify.dev/server/v2/contract/8453/0x417d276e82152bfa4fce5ce6582cB28a5eaCDe2F (sources, ABI, deployment, creation bytecode) - H
- https://api.geckoterminal.com/api/v2/networks/base/tokens/0x4398c398e5ac747e6d51bf1db1dac346ca90fee0 and `/pools` - H
- https://api.dexscreener.com/latest/dex/tokens/0x4398c398e5ac747e6d51bf1db1dac346ca90fee0 - H
- https://api.coingecko.com/api/v3/coins/base/contract/0x4398c398e5ac747e6d51bf1db1dac346ca90fee0 (description, categories) - H
- https://chainwire.org/2025/02/13/wods-fun-launches-first-permissionless-prediction-market-on-base-creating-a-new-generation-of-utility-memes/ (WebFetch summary) - M, stale
- https://wodsfun.hashnode.space (docs and terms; HTTP 429 challenge, unread), https://x.com/wodsfun (HTTP 402, unread)
- Internal: `docs/research/06-paybox-platform.md` (PayBox chain catalog and proposal contract) - H
