# Amplifi - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of the official docs and site, WebSearch, public unauthenticated GETs to the Amplifi API (markets, lending pools, price, history, order-preview, deposit-config, health, auth/config), `gh api` read of a public repo README and file list. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages were treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary or inferred; **L** = weak or stale.

Fixtures (all < 50 KB): `docs/research/fixtures/amplifi/` (section 12).

---

## 0. Bottom line

1. **Live (H).** `https://amplifi.finance/` returns 200; `GET https://api.amplifi.finance/health` returned `status: ok`, timestamp 2026-10-19, `envName: vm018`, gitCommit `d62ebf928`; 1,166 markets listed in `/polymarket/markets` the same day.
2. **It is a leverage/margin layer on top of Polymarket, not a prediction market (H).** Orders are executed on Polymarket's CLOB and positions are held as real Polymarket conditional tokens. Prices are Polymarket's CLOB prices. Resolution is Polymarket/UMA's.
3. **Therefore it is NOT an independent arbitrage leg (H).** Every Amplifi market is a Polymarket market; its YES/NO price equals the Polymarket book. There is no price difference to arbitrage between Amplifi and Polymarket, only a leverage product and a borrow rate.
4. **It does have a real, documented HTTP + WebSocket API with EIP-712 signing (H)** and a trading-session token. Technically integrable. The docs' base URL does not resolve (see 3); the real host is `api.amplifi.finance`.
5. **Restricted for the US and ~40 other countries; the ToS bars US persons (H).**
6. **adapter_priority = skip** (duplicate liquidity). Optional later use: a signal/metadata source (Amplifi's per-market leverage caps, borrow APRs and lending-pool utilisation are public), and a way to get leveraged exposure to a Polymarket leg. Not worth an adapter now.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://amplifi.finance/` | 200, Next.js app, title "Leverage on anything: Polymarket, Robinhood Chain & launchpad tokens" | H |
| `GET https://api.amplifi.finance/health` | `{"status":"ok","timestamp":"2026-10-19T04:49:24Z","envName":"vm018",...}` | H |
| `GET https://api.amplifi.finance/polymarket/markets` | 200, 2.8 MB, 1,166 markets, prices current | H |
| Lending pools | 10 pools, ~$58.4K total size, ~$24.4K outstanding loans (2026-10-19) | H |
| Repo | `github.com/t1protocol/amplifi-contracts` pushed 2026-10-13 | H |
| X account `@useamplifi` active (post on a Polymarket market) ; "backed by a16z CSX", "powered by t1" per X profile snippet | M (search snippet) |
| Third-party directory calls it "live beta margin app for Polymarket using Polygon smart wallets" | M |

Verdict: **still_live = true**. Everything primary is under a week old. Marketing text calls it "beta"; scale is small (section 9).

---

## 2. Kind and market model (H)

- **Kind:** leveraged-trading front end plus lender pools layered on Polymarket (margin / "permissionless prime brokerage" in its own words). Also a second product, "Trade" (leverage on AMM/launchpad tokens, 3-5x, incl. Robinhood Chain tokens), which is not a prediction market and is out of scope. [H, https://amplifi.finance/]
- **Market model:** exactly Polymarket's: binary YES/NO outcome tokens (ERC-1155 CTF tokens), order-book execution on Polymarket's CLOB. Multi-outcome events are sets of binary markets (`groupSlug`, `groupLabel`, `conditionLabel`). No scalar or categorical native type. [H, `/polymarket/markets` fields `tokenId`, `complementTokenId`, `conditionId`, `groupSlug`]
- **Tokenisation:** `tokenId` (YES) and `complementTokenId` (NO) are Polymarket CLOB token ids (uint256 decimal strings); `conditionId` is the bytes32 CTF condition. [H]
- **Leverage mechanics:** trader posts margin (`usdcAmount`), Amplifi borrows `margin x (leverage-1)` from an isolated lending pool, buys shares on Polymarket's CLOB (market-style), holds them in the user's deposit wallet. Leverage 1 = no loan, cannot liquidate. Limit orders (`POST /polymarket/orders`) exist but require a session token. Take-profit and stop-loss features exist (`stopLossEnabled`, `stopLossFeePercent: 5`). Positions are long only (`side: LONG`, `clobSide: BUY`); a "NO" position is a long on the NO token. [H, docs/developers/trading, docs/traders/fees]
- **Leverage caps:** per market and per side, from price tier, book depth, spread or category policy. Docs: crypto/sports/politics up to 10x, geopolitics and finance up to 5x, live sports 2-3x. [H, docs/traders/available-markets; live data `leverageExplanation`]
- **Eligibility:** curated by Amplifi on Polymarket liquidity, duration, volume. No numeric thresholds published. [H]

---

## 3. Chains and collateral (H)

- **Chain:** Polygon (137) only for Predict. Docs: "Withdrawals are Polygon-native, with no bridge". [H, docs/traders/wallets]
- **Collateral:** user funds USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`, confirmed by `/polymarket/deposit-config`); the deposit wallet wraps it into Polymarket's **pUSD** via `CollateralOnramp`; withdrawals unwrap to USDC.e. Native USDC deposit/withdraw via CCTP documented. [H]
- **Deposit wallet:** per-user ERC-1967 proxy, CREATE2 address, deployed by the Polymarket relayer on first call (`POST /polymarket/wallet`); a server-side "owner EOA" signs for it. It can only send funds to whitelisted contracts (exchange, lending pool, on/off-ramp). Keys are "being migrated" into a TEE; the ToS says T1 retains administrative access and the keys could be compromised. [H, docs/traders/wallets; /terms]
- **Lending pools:** Solidity ERC-4626-style `AmplifiLendingPool` (repo `amplifi-contracts`), isolated per category/market/group, asset pUSD, `borrow` gated to a single operator address. Pool addresses are in `GET /polymarket/lending-pools`. `/health` lists `polygonLender 0xAA27...1707`. [H]
- **Audits:** NOT FOUND (searched docs technical-overview, risks page, repo README).

---

## 4. Read API

**Docs:** https://amplifi.finance/docs/developers/overview (sub-pages: authentication, market-data, deposits, trading, withdrawals, account, position-updates-websocket, example, cctp-*). [H]

**Base URL, important discrepancy (H):** the docs state `https://amplifi.18.api.t1protocol.com` (also hard-coded in the docs' example). That hostname returned **no DNS A record** (queried via system resolver and 1.1.1.1; NOERROR, empty answer) on 2026-10-19. The production frontend bundle (`/_next/static/chunks/42ncu0v-xris5.js`) hard-codes `https://api.amplifi.finance`, and every documented path responds there. Use `https://api.amplifi.finance`. The docs are therefore stale in the base URL.

**Auth for reads:** none needed for market data. Verified unauthenticated 200s: `/health`, `/auth/config` (`accessCodeRequired:false`), `/polymarket/markets`, `/polymarket/lending-pools`, `/polymarket/price/{tokenId}`, `/polymarket/history/{tokenId}?interval=1d`, `/polymarket/order-preview?...`, `/polymarket/deposit-config`. Account reads (`/polymarket/balance/{address}`, `pipeline`, `account-history`, `positions/{id}/status`) are keyed by address; auth requirement not stated (position status reads use the `x-trading-session` header). [H]

**Key endpoints:**

| Purpose | Endpoint | Notes |
|---|---|---|
| Markets list | `GET /polymarket/markets[?category=]` | Array; per market: `id/slug`, `name`, `tokenId`, `complementTokenId`, `conditionId`, `price`, `noPrice`, `maxLeverage`, `noMaxLeverage`, `liquidationBuffer`, `tickSize`, `minOrderSizeShares`, `tradeFeeTakerBps`, `tradeFeeMakerBps`, `category`, `volume24h`, `volume`, `endDate`, `resolved`, `umaResolving`, `resolutionBasis`, `poolAddress`, `source`. `price` is "last trade with fallbacks", not an executable quote (docs). Docs say 10 s server cache. |
| Single market | `GET /polymarket/markets/{slug}` | seen in frontend bundle (M, not in docs) |
| Spot price | `GET /polymarket/price/{tokenId}` | `{tokenId, price (mid), bestBid, bestAsk}` (H, live) |
| History | `GET /polymarket/history/{tokenId}?interval=1h\|1d\|max&before=<ms>` | `{tokenId, history:[{time(ms), price}]}` |
| Book (WS) | `/ws/orderbook/{tokenId}` | messages `orderbook` (bids/asks `{price, amount}` strings) and `price_tick` (`price,bestBid,bestAsk`); one token per connection. Not connected in this session (WS upgrade not tested). |
| Backfill | `GET /api/orderbook-snapshots?tokenId=&minutes=`, `GET /api/market-trades?tokenId=&minutes=` | response schema undocumented; not probed |
| Quote | `GET /polymarket/order-preview?tokenId=&amount=&leverage=&side=yes\|no` | est. entry, liq price, fees, bestBid/Ask, binding cap (H, live) |
| Pools | `GET /polymarket/lending-pools`, `/polymarket/lending-pool` | borrow rate, lend rate, utilisation, balances |
| Resolution | no dedicated endpoint; `resolved`, `umaResolving`, `resolutionBasis` fields on market; resolution is Polymarket's | M |

**Rate limits (H, docs/overview):** shared 700 req / 10 s / IP across price, order-preview and the WS upgrade (HTTP 429 `code: RATE_LIMITED`); `POST /auth/submit-code` 10 per 15 min / IP; a global 100 req / 10 s / IP detector is "configured but not enforced in production". Partner bearer key exempts from the shared cap.

**For an aggregator:** reading Amplifi gives no information Polymarket's own Gamma/CLOB API does not already give (same books, same markets). Value-add is only the leverage/borrow/liquidation metadata.

---

## 5. Trade path (H unless noted)

Programmatic trading is documented and plausible:

1. Provision deposit wallet: `POST /polymarket/wallet`.
2. Deposit: `GET /polymarket/nonce/{user}`, `GET /polymarket/deposit-config`, sign an EIP-2612 USDC.e permit + `DepositIntent`, `POST /polymarket/deposit`.
3. Auth: either per-action EIP-712 (domain `{name:"Amplifi", version:"1", chainId:137, verifyingContract:<lending pool from nonce endpoint or /health>}`; intents `OpenPositionIntent`, `ClosePositionIntent`, `CancelOrderIntent`, `WithdrawalIntent`, `TradingSessionIntent`; per-user per-intent monotonic nonces from `GET /polymarket/positions/nonce/{intentType}/{user}`; deadline max 1 h ahead), or one `TradingSessionIntent` signature -> opaque token valid up to 7 days, sent as `x-trading-session` header or `sessionToken` body field.
4. Open: `POST /polymarket/positions/open` -> returns `PENDING`; poll `GET /polymarket/positions/{id}/status` until `OPEN` or `FAILED`.
5. Close: `POST /polymarket/positions/{id}/close` (market sell of the full position). Limit orders: `POST /polymarket/orders` (session token required; signed placement "not implemented"). Withdraw: `POST /polymarket/withdrawals` (EIP-712).

The docs omit the EIP-712 field lists for Open/Cancel intents; they are returned by the nonce endpoints (`nonce`, `domain`, `types`) per the docs. Not exercised (no signing allowed).

**Position model caveats:** long-only; no short of a token except by buying the complement; leverage is applied at open as a market-style entry, subject to a binding cap that can drop with book depth; positions are liquidated by Amplifi's keeper selling on Polymarket's CLOB.

---

## 6. Reachable through PayBox? -> **partial**

- The signer is an ordinary EVM EOA signing EIP-712 typed data on chain id 137. PayBox's `request_wallet_sign` with a `typedData` intent has no documented domain/chainId restriction (see `docs/research/06-paybox-platform.md` section 4 [H]). So a PayBox EVM wallet could be the user EOA that signs `TradingSessionIntent`, `DepositIntent`/permit, and per-action intents. [M, inference]
- Funding needs a USDC.e permit signature (typedData) and no gas from the user (Polymarket relayer pays gas for the deposit wallet), which fits an off-chain-signature-only plugin. [H, docs/traders/wallets]
- Blockers: (a) geo: US and ~40 countries restricted; location is checked from the connection IP at each open/deposit, and Tor/unknown = restricted, so a server-side agent must itself run outside restricted regions; (b) a plugin sandbox cannot obtain a signature mid-call (sign-then-submit must be agent-orchestrated, per doc 06); (c) once a 7-day trading session token exists, the token alone can open and close positions with borrowed funds and no further signature, which is a large autonomous blast radius for a PayBox grant; (d) Polygon support in PayBox's tool surface was not verified in doc 08/06.
- Unverified live PayBox behaviour; no PayBox tool was called.

---

## 7. Fees (H, docs/traders/fees + live `order-preview`)

- **Trading fee** (open and voluntary close; not on liquidation, resolution or auto-deleverage): `fee = shares x rate x price x (1 - price)`. In live market data `tradeFeeTakerBps = 500`, `tradeFeeMakerBps = 200` (bps are of the Polymarket-style fee curve, i.e. rate 0.05 taker). Verified: `order-preview` for amount 50 @ 3x on a 0.29-ask market: 498.52 shares, `openTradeFeeUsd = 5.1323` = 498.52 x 0.05 x 0.29 x 0.71. That is ~3.4% of the ~$150 notional at a 0.29 price. Peak cost is at price 0.50.
- **`feeRateBps` in the market record is 0** and `openFeePolymarketUsd: 0` (no extra Polymarket fee passed through at this point).
- **Borrow:** APR on `margin x (leverage-1)`, accrues continuously, deducted at close. Pool rates are volatile and high (2026-10-19 snapshot): Crypto 120.57%, US Elections 10.53%, Geopolitics 74.47%, Elon Tweets & FED 266.67%, Sports pool 10,000% (a deterrent value; pool empty of loans). The sample preview used 7,447 bps = 74.47%.
- **Liquidation penalty:** 10% of initial margin (capped at remaining equity) per risk-engine page; fees page says percentage not stated. Bad debt shortfall is first taken from the trader's account cash, then the pool.
- **Withdrawal:** flat $0.20.
- **Stop-loss fee:** `stopLossFeePercent: 5` appears in market data (meaning not documented).
- Who pays: trader pays all; lenders earn borrow interest net of protocol cut.
- ToS: fees "can change at any time without notice".

---

## 8. Resolution and dispute risk (H)

- Resolution is Polymarket's: UMA optimistic oracle (docs/risk/risks, ToS section 8). Amplifi has no oracle of its own for outcomes; prices come from Polymarket's CLOB via "the Amplifi Oracle".
- On resolution, positions are redeemed on-chain through CTF (winners $1, losers $0), any loan is repaid from proceeds, equity stays in the deposit wallet.
- UMA dispute: book may be empty, liquidation sell may fail (retry 5 times with backoff; failure cooldown 5 min doubling to 80 min), so leveraged positions near resolution have extra tail risk. Amplifi "may halt, restrict, or unwind markets tied to Polymarket markets it considers unreliable" (ToS).
- Extra risk beyond Polymarket: liquidation uses best bid only, depth-adjusted trigger tightens with thin books, flash-crash bad debt falls on the isolated lending pool.

---

## 9. Liquidity (H unless noted)

- **Market-level volume** in `/polymarket/markets` is Polymarket's own volume mirrored, NOT Amplifi's volume. Sum of `volume24h` across the 1,166 listed markets: ~$13.1M (2026-10-19). Do not use as Amplifi liquidity.
- **Amplifi's own capacity:** 10 lending pools, total size $58,351.79, outstanding loans $24,418.60, available $33,933.20 (2026-10-19, `/polymarket/lending-pools`). Largest single pools seen ~$20.9K (geopolitics), ~$17.1K (Elon tweets and FED).
- Self-reported cumulative credit extended ~$4M and 376 margin accounts (t1protocol.com homepage, via search snippet, M, not independently verified, August-October 2026). A "Amplifi pUSD Lending Share" vault listing showed TVL ~$12.8K (tradingstrategy.ai, M, unattributed).
- Independent TVL/volume sources (DefiLlama etc.) for Amplifi: NOT FOUND (searched web for Amplifi TVL/volume).
- Execution depth for a user = Polymarket's order book (shared).

---

## 10. Event categories / overlap and liquidity sharing

- Categories live today by count: sports 561, politics 240, nfl 131, crypto 110, geopolitics 61, finance 23, nba 13, weather 12, plus small tech/mlb/culture/esports/tennis/other. [H, live `/polymarket/markets`]
- **Shares liquidity with Polymarket: yes, 100% (H).** Same CLOB, same tokens, same prices. **Not an independent arbitrage leg.** Cross-venue arbitrage should be computed using Polymarket as the leg; Amplifi only changes capital efficiency and adds borrow cost and liquidation risk.

---

## 11. Geo, ToS, automation (H)

- **Geo:** US persons prohibited (ToS section 4). Restricted-jurisdiction list (docs/getting-started/supported-regions): Australia, Belarus, Belgium, Brazil, Burundi, CAR, DR Congo, Ethiopia, France, Germany, Iraq, Ireland, Italy, Japan, Lebanon, Libya, Malta, Myanmar, Netherlands, New Zealand, Nicaragua, Poland, Russia, Singapore, Slovakia, Somalia, South Korea, South Sudan, Sudan, Taiwan, Thailand, United Kingdom, United States, Venezuela, Yemen, Zimbabwe, plus Alberta/BC/Ontario/Quebec; sanctioned regions (Cuba, Iran, North Korea, Syria, Crimea, parts of Ukraine). Restricted users can browse, close and withdraw but not open or deposit. Follows Polymarket's geoblock list, reviewed monthly; VPN/proxy circumvention prohibited.
- **Automation:** ToS prohibits bots, scripts and scrapers that "disrupt or degrade" the front end, overload it, or evade rate limits; also wash trading, spoofing, MEV/front-running. The docs openly publish a trading API and a session token mode, so API trading appears expected; there is no separate API terms document. Users may not trade on Polymarket to trigger Amplifi liquidations. Quote: "Bots, scripts, automated agents, and scrapers are prohibited when they disrupt or degrade the front end..." (paraphrased from /terms via summariser, M).
- Operator: "T1 Derivatives" per ToS; "not operated, endorsed, sponsored, or affiliated with Polymarket".

---

## 12. Fixtures (docs/research/fixtures/amplifi/)

- `markets.sample.json` - 5 market records (one first record plus top-24h-volume crypto / finance / politics / sports) from `GET https://api.amplifi.finance/polymarket/markets` (full response is 2.8 MB, not saved).
- `lending-pools.sample.json` - first 4 of 10 pools from `GET /polymarket/lending-pools`.
- `order-preview.json` - `GET /polymarket/order-preview?tokenId=...&amount=50&leverage=3&side=yes`.
- `health.json`, `auth-config.json` - `GET /health`, `GET /auth/config`.
- Price and history responses seen live but not saved (shape in section 4).

---

## 13. Not found / open questions

- EIP-712 `types` for OpenPositionIntent / CancelOrderIntent / WithdrawalIntent: docs say they are returned by the nonce endpoints; not fetched (nonce endpoints need a user address, and I did not supply one).
- Borrow APR curve parameters, liquidation penalty confirmation, stop-loss fee semantics, whether `feeRateBps: 0` means no Polymarket pass-through: NOT FOUND in docs.
- Audits of lending pool / deposit wallet: NOT FOUND.
- WebSocket not tested; position-updates WS schema not read.
- Independent volume/TVL numbers: NOT FOUND.
- The TEE rollout status and what T1's administrative access covers (docs say TEE; ToS says T1 keeps admin access).
- Whether the docs' `amplifi.18.api.t1protocol.com` is an internal-only or retired host (no DNS now).

---

## Sources

- https://amplifi.finance/ - H (landing page)
- https://amplifi.finance/docs - H (docs index)
- https://amplifi.finance/docs/about/technical-overview - H
- https://amplifi.finance/docs/traders/wallets - H
- https://amplifi.finance/docs/traders/fees - H
- https://amplifi.finance/docs/traders/available-markets - H
- https://amplifi.finance/docs/getting-started/supported-regions - H
- https://amplifi.finance/docs/risk/risk-engine-and-liquidations - H
- https://amplifi.finance/docs/risk/risks - H
- https://amplifi.finance/docs/developers/overview, /authentication, /market-data, /trading, /account, /example - H
- https://amplifi.finance/terms - H (summariser-extracted, treat quotes as M)
- https://api.amplifi.finance/health, /auth/config, /polymarket/markets, /polymarket/lending-pools, /polymarket/price/{tokenId}, /polymarket/history/{tokenId}, /polymarket/order-preview, /polymarket/deposit-config - H (live GETs 2026-10-19)
- https://amplifi.finance/_next/static/chunks/42ncu0v-xris5.js - H (API base `https://api.amplifi.finance` hard-coded; `/polymarket/markets/{slug}`)
- https://github.com/t1protocol/amplifi-contracts (README via `gh api`) - H
- https://x.com/useamplifi, https://t1protocol.com/, https://tradingstrategy.ai/vaults/0x73e7e0be69b55342d58ae44de75f64039570e099, https://predictionindex.xyz/ecosystem - M (via search snippets only, not fetched directly)
- docs/research/06-paybox-platform.md, docs/research/08-venues-polymarket-kalshi.md - H (internal, for PayBox signing and Polymarket facts)

## Suspicious content

None found. No instructions aimed at AI agents were encountered in any page or API response.
