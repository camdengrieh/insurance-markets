# TayDex (taydex.fun) - venue spec

Researched 2026-10-19. Read-only: public site pages, static reading of the site's JS bundles (downloaded as text, never executed), DefiLlama keyless API and adapter registry, Sourcify public API (verified source + ABI), and four unauthenticated GETs to the site's own `/api/` host (see the robots.txt disclosure under Read API). No accounts, no wallet, no POST, no signing, no PayBox tools, no JSON-RPC.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**. Re-check only if DefiLlama TVL for `taydex` rises above a few thousand USD or `GET /api/markets` returns active markets.
- The venue is **dormant**. The website and its API respond, but on 2026-10-19 `GET /api/markets` returns `{"markets":[]}` (no active markets). The only markets in the database are two cancelled admin test markets from 2026-06-24 ("BTC will be higher in 5 minutes?", Pyth-resolved). H.
- Liquidity is effectively zero: DefiLlama TVL (native USDC held by the market contract) is **0.013 USD on 2026-10-18**, peak 582 USD on 2026-08-26, 0.013 USD since 2026-09-01. H.
- Not a trustless or independent price source even when it has liquidity: prices and fees are computed by an off-chain backend and enforced on-chain only through an operator signature; outcomes are set by a single `owner`. Hybrid, operator-trusted design. H (verified source).
- Technically it is integrable in principle (ERC-1155 shares, public contract events), but the trade path needs a logged-in backend session (POST endpoints) and the read API is undocumented and `robots.txt` disallows `/api/`. Not worth it for a venue with no markets.
- Geo: US, UK, France, Belgium, Singapore, Thailand, Taiwan, Poland, Australia plus sanctioned jurisdictions are restricted. H.

## Liveness (still live in 2026?)

- Site: **up** (HTTP 200 on `/`, `/how-it-works`, `/resolution`, `/legal/*`, 2026-10-19). Copyright line 2026. H (https://taydex.fun).
- Contract: deployed in Base block 45302047 (about 2026-04-28 by block arithmetic, M), Sourcify exact-match verified 2026-04-28T16:24:10Z. H (https://sourcify.dev/server/v2/contract/8453/0x3ade22Fa1EF5ac75437A3734D91bA588E54875dd).
- Activity: DefiLlama listed it 2026-08-11 (TVL 249 USD first day, 582 USD peak 2026-08-26, then withdrawn to 50 USD on 2026-08-28 and 0.013 USD from 2026-09-01). H (https://api.llama.fi/protocol/taydex).
- Chainquiry (page reviewed 2026-07-25): "Live", launched June 2026, 7 markets total / 3 active, "0 verified independent $1+ traders", no audit, low liquidity. M (https://chainquiry.com/exchanges/taydex/).
- The homepage "Resolution record" section says "No public resolution record yet" and `/resolution` lists no entries, i.e. no market has ever been publicly resolved through the product. H.
- The database holds only 2 markets (both `CANCELLED`, on-chain ids 7 and 8). On-chain ids 1 to 6 are not in the DB; whether they were test markets is unknown (NOT FOUND). H for the 2, M for the inference.
- Verdict: **site live, venue dormant, no tradable market.** `still_live` is true only in the sense that the site, API and contract exist.

## Kind and market model

- Kind: on-chain, creator-launched binary (and grouped) prediction markets with an LMSR automated market maker whose price is computed off-chain ("Hybrid LMSR prediction market on Base" in the contract NatSpec). H (verified source).
- Market types seen in client code: `BINARY`, `GROUPED_PARENT` (multi-option; "Multi-option markets price each option separately", every option is its own YES/NO pool, up to `MAX_OPTIONS` = 32). Scalar: not supported. H (source, `/how-it-works`).
- Pricing (client formula, M for the server): `b = max(virtualLiquidity, 50) / ln 2`; `P(yes) = e^(qYes/b) / (e^(qYes/b) + e^(qNo/b))`, rounded to 4 dp, using DB fields `reserveYes`/`reserveNo`. UI label: "Funding (b x ln2)". The client also has an on-chain-derivable analogue: `getOption(marketId, i)` returns `funding`, `pool`, `outstandingYes`, `outstandingNo`, so a price could be recomputed from chain state (M, assumes the DB reserves mirror outstanding shares; not verified because there are no live markets).
- Tokenisation: **ERC-1155** on the market contract. `tokenId = (marketId << 16) | (optionIndex << 1) | outcome`, outcome 0 = YES, 1 = NO. 1 winning share redeems for 1 USDC (1e6 units). H (source: `encodeTokenId`, `claim`).
- Token metadata URI is `https://taydex.app/token/{id}.json`; `taydex.app` does not resolve (curl error 6). Wallets will show no metadata. H.
- Pool invariant on-chain: `pool >= outstandingYes` and `>= outstandingNo`; creator funding is the maker's worst-case loss. H.

## Chains and collateral

- Base mainnet (8453) only. Collateral native USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 dp, immutable `usdc`). H (client bundle + DefiLlama methodology + source).
- Market contract `TaydexMarket`: `0x3ade22Fa1EF5ac75437A3734D91bA588E54875dd`, Solidity 0.8.25, OpenZeppelin ERC1155 + Ownable + ReentrancyGuard + EIP712, not a proxy (no upgrade path in source; `owner` can still change signer, fee recipient, fees, URI). Deployer/initial owner `0xEF869234Bb919bBde0F44d98912E87d1cE0463F8` (tx `0x1a54...0df7`). Current `owner()` and `signer()` values: NOT FOUND (need an `eth_call`, which is JSON-RPC POST; skipped). H for the above, see fixtures.
- Users log in with a thirdweb wallet (in-app/smart wallet or external EOA); the client has a gas-top-up call (`/api/wallet/ensure-gas`). Exact gas sponsorship rules: NOT FOUND. M.

## Read API

- **Official documented API: NONE.** NOT FOUND (searched: homepage, /how-it-works, /legal/*, footer, /docs, /llms.txt, /openapi.json, /api/docs, sitemap.xml, WebSearch). `exists = unofficial-only` (plus on-chain events). No developer docs, no SDK, no GitHub org for the venue (DefiLlama `github: null`; the `TayDex` GitHub user and taydex.com are an unrelated developer, M).
- **robots.txt disclosure.** `https://taydex.fun/robots.txt` says `User-agent: *`, `Disallow: /api/`. I read robots.txt only after making four GETs to `/api/` (markets default, markets with `includeCancelled=true`, `categories`, one `markets/{id}`), each with the generic User-Agent `insurance-markets-research/0.1`, no cookies, no auth. I made no further `/api/` calls after reading it. A production adapter should not scrape `/api/` unless the operator grants permission; the on-chain contract is the permitted alternative.
- Base URL (first-party, used by the site's own client): `https://taydex.fun`. Server header `Google Frontend` (Google Cloud), Next.js. H.
- Public GET routes (H = tested; M = seen in bundle, not called):
  - `GET /api/markets` (H): `{"markets":[]}` today. Default excludes cancelled markets.
  - `GET /api/markets?includeCancelled=true` (H): array of market objects.
  - `GET /api/markets/{uuid}` (H): `{"market":{...}}` same shape plus `options[]`.
  - `GET /api/categories` (H): 13 categories (Politics, Sports, Crypto, Esports, Iran, Finance, Geopolitics, Tech, Culture, Economy, Weather, Mentions, Elections) with uuid, slug, sortOrder.
  - `GET /api/markets/{id}/events` (M): Server-Sent Events with `trade`, `market`, `resolution` events. `GET /api/series/{id}/current` (M, recurring/perpetual series). `GET /api/positions?userId=&marketId=` (M, user id is an internal uuid). `GET /api/comments`, `/api/btc-price?symbol=` (M).
- Market object fields (H): `id` (uuid), `onChainMarketId` (string), `marketType`, `title`, `description`, `rules`, `category`, `endDate`, `resolutionDeadline`, `status` (`ACTIVE`, `PENDING_RESOLUTION`, `CANCELLED`, ... per client), `virtualLiquidity`, `reserveYes`, `reserveNo`, `creatorFunding`, `creatorFeeShareBps`, `creationTxHash`, `resolveTxHash`, `winningOptionIndex`, `proposedOutcome`, `resolutionPhase`, `autoResolveSource` (`PYTH`), `pythPriceId`, `baselinePrice`, `comparisonOp`, `perpetualSeriesId`, `volume`, and `options[]` with `initialOdds`, `currentOdds`, `reserveYes`, `reserveNo`.
- Auth for reads: none. Rate limits: NOT FOUND (no rate-limit headers; responses were `cache-control: no-store`). WebSocket: none seen; SSE per market only.
- On-chain read: the verified contract exposes `getMarket`, `getOption`, `markets`, `marketOptions`, `userShares`, `balanceOf`, `nextMarketId`, `disputeFee`, `marketCreationFee`, `minLiquidityPerOption`, plus events `MarketCreated`, `TradeExecuted(marketId, optionIndex, user, isBuy, outcome, usdcAmount, shares, fee, nonce)`, `MarketResolved`, `MarketCancelled`, `Disputed`, `DisputeResolved`, `Claimed`, `RefundClaimed`. A chain-only adapter could be built from `nextMarketId`, `getOption` and `TradeExecuted` logs. Not exercised (JSON-RPC is POST; Blockscout returned a Cloudflare challenge 403 to curl and WebFetch, not circumvented). H (ABI) / NOT TESTED (calls).
- Third-party: DefiLlama TVL only (no volume, fees or open-interest adapters; `vol_24h`, `fees_30d`, `oi` are null). H.
- Fixtures (`docs/research/fixtures/taydex/`): `api_markets_default_2026-10-19.json`, `api_markets_includeCancelled_2026-10-19.json`, `api_market_by_id_cancelled_2026-10-19.json`, `api_categories_2026-10-19.json`, `sourcify_TaydexMarket_trimmed.json` (ABI, deployment, compiler), `TaydexMarket.sol.txt` (verified source), `defillama_protocol_taydex_trimmed.json`.

## Trade path

- Not a plain on-chain AMM. Every buy/sell/market creation/refund requires an **EIP-712 signature from the backend `signer`** over the exact trade numbers. The user only sends a transaction. H (source: `buy(p, signature)`, `sell(p, signature)`).
  - EIP-712 domain: name `TaydexMarket`, version `1`, chainId 8453, verifyingContract the market contract.
  - `Buy(address user,uint256 marketId,uint8 optionIndex,uint8 outcome,uint256 usdcIn,uint256 sharesOut,uint256 fee,uint256 nonce,uint256 deadline)`; `Sell(address user,uint256 marketId,uint8 optionIndex,uint8 outcome,uint256 sharesIn,uint256 usdcOut,uint256 fee,uint256 nonce,uint256 deadline)`. The signature is bound to `msg.sender`, a per-address `nonces[user]` counter (so one outstanding quote per wallet) and a `deadline`.
  - The contract only checks the signer, the nonce, `fee <= usdcIn`, market open (`block.timestamp < endDate`, not resolved) and the pool invariant. It does **not** compute the LMSR price or the 2% fee; the operator can sign any `sharesOut`/`fee` that satisfies the invariant.
- Client flow (static read of the bundle, M): `POST /api/auth/nonce {walletAddress}` returns `{nonce, message}`; wallet `signMessage` (personal_sign) of that message; `POST /api/auth/thirdweb-login {walletAddress, signature, nonce, message, referralCode}` creates the session and the user record (username step follows). Then `POST /api/trade/quote {marketId, optionId, type, outcome, amount}` (preview), `POST /api/trade/sign` (returns `params` + signature), wallet sends USDC approve if needed and `buy(...)`, then `POST /api/trade/confirm {..., txHash}`. All POST; none were called.
- Reachable from an EVM wallet through PayBox: **partial**. A PayBox EVM wallet on Base could in principle (a) obtain the login signature through `request_wallet_sign`, (b) send `USDC.approve` and `buy(...)` as single-call `evm` proposals (PayBox supports Base and one call per proposal; see docs/research/06-paybox-platform.md). Blockers: it needs a stateful, authenticated session against an undocumented POST API that robots.txt disallows, the quote signature is tied to one `msg.sender` and one nonce, the approver sees raw calldata only, and there is nothing to trade. Not attempted. M.

## Fees

- Stated: "A 2% protocol fee applies to each trade" (homepage, H). ToS section 6: "A protocol fee is taken from every trade ... Fee rates are always visible on the platform and may change." H.
- Mechanics (H, source): `fee` is a backend-signed argument. On buy the trader pays `usdcIn` and the pool receives `usdcIn - fee`. On sell the pool is debited `usdcOut + fee` and the trader receives `usdcOut`. Each fee is split `creatorCut = fee * creatorFeeShareBps / 10000` (accrued per market, claimable by the creator only after resolution with no pending dispute) and the remainder is sent to `feeRecipient`. Observed `creatorFeeShareBps` = 2500 (25%) on both sample markets; Chainquiry says creators get 50% (M, conflicting; per-market and signed by the backend).
- Market creation: `marketCreationFee` (to `feeRecipient`) plus funding of at least `minLiquidityPerOption` per option. Current on-chain values: NOT FOUND. Chainquiry: 5 USDC creation fee, 50 USDC minimum funding (M). Sample markets had 100 USDC funding.
- Disputes: fixed `disputeFee` (docs: 20 USDC). Valid dispute: stake returned plus 50% of the creator fee pot (the other 50% to platform). Invalid: stake split 50% creator / 50% platform. H (source).
- Claim of winnings: no fee in the contract; gas on Base. Leftover pool after winners are paid can be swept to `feeRecipient` by anyone (`sweepLeftover`). H.

## Resolution and dispute risk

- Documented flow: creator proposes an outcome with a public source after the deadline; a 24-hour review window; any eligible user may dispute once per market with a 20 USDC stake; "A dispute does not automatically change the winning outcome"; the admin/contract owner finalises on-chain. H (https://taydex.fun/how-it-works, /legal/terms section 5).
- Reality in code (H): resolution is `onlyOwner` (`resolveMarket`, `resolveSingleBinary`); the creator proposal and the 24 h window exist only off-chain; the contract does not enforce the window, does not require `endDate` to have passed, and does not look at pending disputes when resolving. `dispute()` is permissionless and callable any time before resolution; only the owner can `resolveDispute`. Crypto up/down markets are labelled `autoResolveSource: PYTH` in the DB but on-chain resolution is still an owner transaction.
- Cancellation: owner `cancelMarket` sets the market resolved with index -1; refunds are paid by `claimRefund` for an **arbitrary `refundAmount` signed by the backend signer**, drawn from the contract's single USDC balance (no per-market accounting check). A compromised or malicious signer/owner can drain all markets' funds. No audit mentioned anywhere (risk page lists none; DefiLlama `audits: "0"`). The risk page says nothing about admin powers or upgradeability, which the source shows to be broad.
- Dispute risk for an arbitrageur: high (single operator decides, no objective oracle, no precedent because no market has ever finalised publicly).

## Geo, ToS and automation

- Restricted (https://taydex.fun/legal/restrictions, H): United States, France, Belgium, Singapore, Thailand, Taiwan, Poland, United Kingdom, Australia; sanctioned: Cuba, Iran, North Korea, Syria, Russia, Belarus, Myanmar. Enforcement is by IP country: "We do not block VPN traffic specifically - only the country reported by the connecting IP." Age 18+.
- ToS (https://taydex.fun/legal/terms, H): prohibits manipulative markets, multiple accounts in one dispute, insider trading, attacking the platform. No clause on bots, API use or automation: NOT FOUND (searched: terms, restrictions, risk). The only automation-related rule found is `robots.txt` `Disallow: /api/`.
- Operator anonymity: the manifesto is signed only "taydex.fun"; no team named. H.

## Liquidity

- TVL 0.013 USD, 2026-10-18 (DefiLlama, native Base USDC held by the contract). Peak 582.14 USD on 2026-08-26. H (https://api.llama.fi/protocol/taydex).
- Volume / open interest: no DefiLlama adapter; API `volume` is 0 on the two cancelled markets. Total historical volume: NOT FOUND.
- Per-market scale when it did run: 100 USDC creator funding per sample market, i.e. LMSR depth of order 100 USD. H.

## Event coverage and overlap

- Category list is generic (Politics, Sports, Crypto, Esports, Iran, Finance, Geopolitics, Tech, Culture, Economy, Weather, Mentions, Elections), but markets are free-form creator questions; there is no curated catalogue.
- Only content ever seen: BTC 5-minute up/down on a Pyth price (overlaps Polymarket/Limitless/Predict.fun short-horizon crypto), cancelled 2026-06-24. Today nothing overlaps because nothing is listed. Any future overlap would be with crypto price and politics markets on larger venues, but with 2%+ fee, operator resolution and no depth, no scanner edge is realistic.

## Shared liquidity

- Independent: own contract and own LMSR pools funded by creators. No evidence of routing to or from another venue. H (source) / M (absence of evidence).

## Suspicious content

- None found in the site's raw HTML (grepped all fetched pages for "AI agent", "assistant", "LLM" and style-rule phrases).
- The WebFetch summariser output for `/resolution` and `/legal/risk` listed "instructions aimed at AI agents" (quote-length limits, "You are not a lawyer", song-lyrics rule). They are not present in the raw HTML of those pages, so I treat them as an artefact of the fetch tool and ignored them.

## Open questions

- Current `owner()`, `signer()`, `feeRecipient()`, `marketCreationFee`, `minLiquidityPerOption`, `disputeFee` on-chain values and `nextMarketId` (needs `eth_call`; JSON-RPC POST was out of scope).
- Whether the product will relaunch markets (the DB currently holds only two cancelled test markets) or has been abandoned since 2026-09.
- Whether the operator permits automated access to `/api/` (robots.txt disallows it; no ToS clause).

## Sources

- https://taydex.fun/ , /how-it-works , /resolution , /legal/terms , /legal/risk , /legal/restrictions , /legal/manifesto , /robots.txt , /sitemap.xml (H, fetched 2026-10-19)
- https://taydex.fun/_next/static/chunks/ (page, layout, market page, auth chunks; static text only) (H for what the code says, M for server behaviour)
- https://taydex.fun/api/markets , /api/markets?includeCancelled=true , /api/markets/{id} , /api/categories (H, 2026-10-19; robots.txt disallow noted above)
- https://sourcify.dev/server/v2/contract/8453/0x3ade22Fa1EF5ac75437A3734D91bA588E54875dd (H: verified source, ABI, deployment block)
- https://api.llama.fi/protocol/taydex (H: TVL series, methodology, listedAt 2026-08-11)
- https://github.com/DefiLlama/DefiLlama-Adapters registries/sumTokens.js entry `taydex` (H, via gh api)
- https://chainquiry.com/exchanges/taydex/ (M, third party, reviewed 2026-07-25)
- https://www.alchemy.com/dapps/alternatives/taydex (L, directory listing only)
- https://pm.wiki/projects/taydex (redirects to an X profile; not readable, no data)
- https://base.blockscout.com/address/0x3ade22Fa1EF5ac75437A3734D91bA588E54875dd (linked from site; Cloudflare 403 to automated fetch, not circumvented)
- docs/research/06-paybox-platform.md in this repo (PayBox proposal and signing capabilities)
