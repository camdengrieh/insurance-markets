# Rainbow Predictions - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: web page reads, `gh api` file reads of public Rainbow and DefiLlama source, DefiLlama and Polymarket public unauthenticated GETs (User-Agent `insurance-markets-research/0.1`). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, repos and API text were treated as untrusted data; none contained instructions to agents. The WebSearch budget for this session was exhausted before I could run a single query, so there is no news/launch-coverage corroboration; everything below comes from primary pages, repo source and the public APIs listed in Sources.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses or small excerpts, each <= 50 KB): `docs/research/fixtures/rainbow-predictions/` (section 11).

---

## 0. Bottom line

1. **Live, but it is a front end, not a venue.** "Predictions" is a tab inside the Rainbow wallet app (iOS/Android; Rainbow Studio Inc.). It is a client for **Polymarket's CLOB (V2, Polygon, pUSD collateral)**, with Rainbow's own trade fee added on top. It has no book, no oracle, no contracts of its own and no public API. (H)
2. **Not an independent arbitrage leg.** Same order book, same prices, same UMA resolution as Polymarket International; positions sit in the user's own Polymarket Safe or deposit wallet. DefiLlama tags it `Polymarket Builder`, category `Interface`, and flags its volume series `doublecounted: true`. (H)
3. **Strictly worse execution than Polymarket direct**: Rainbow adds `min(3%, 14% x (1 - price))` of notional on every buy and sell on top of Polymarket's taker fee; mobile-app only; hardware wallets unsupported. (H)
4. **Tiny and shrinking.** DefiLlama fees 30d $2,704 (to 2026-10-18), down from about $14-15k per month in Jan-Mar 2026. At the current fee schedule that implies roughly $0.1-0.4M of monthly volume (M, my derivation). Polymarket's own builder-volume endpoint shows Rainbow-coded volume of about $1-3.6M per month Dec 2025 - Jun 2026, then about $25k per month from July and about $65 in the last 30 days (H data; the collapse likely reflects Rainbow no longer attaching its builder code consistently after the fee model changed on 2026-06-29, M).
5. **adapter_priority = skip** for both trading and market data. Keep only a **registry / pool-membership record** (`routes_to: polymarket`, fee stack, no separate book) so the aggregator never counts Rainbow as a separate pool and can price a Rainbow-routed leg correctly if asked. A PayBox EVM wallet that wants this exposure should trade Polymarket's CLOB directly (cheaper, with a documented API).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Home page `https://rainbow.me/` fetched 2026-10-19 | "Predictions - You've seen Polymarket in the news. Now trade it from your pocket - sports, elections, rate cuts, and everything in between." Part of a "trade any market from your phone" pitch (Crypto, Predictions, Perps "Powered by Hyperliquid", Cash). Footer: Rainbow Studio Inc. | H |
| `rainbow-me/rainbow` (GPL-3.0 wallet repo) | Pushed 2026-10-18T19:20Z; release v2.0.46 on 2026-10-08, v2.0.45 on 2026-09-17; `src/features/polymarket/` actively changed (CHANGELOG 2.0.41: "Minimize Polymarket errors, update @polymarket/clob-client-v2"). Remote-config flag `polymarket_enabled: true` and `sponsored_polymarket_deposits_enabled: true` are the repo defaults. | H |
| DefiLlama `rainbow-predictions` (id 7559) | Category `Interface`, chain Polygon, tag `Polymarket Builder`, parent `Rainbow`. Fee series through 2026-10-18: 24h $171, 7d $497, 30d $2,704. No dead/deprecated flag. | H |
| Launch | Integration PR #6946 "Predictions - Polymarket integration" merged 2026-01-06; wallet release v2.0.17 on 2026-01-15. Builder-attributed volume and fees start earlier (first Polymarket builder row 2025-12-11, first DefiLlama fee day 2025-12-16), so there was an earlier staged/beta period. News coverage not checked (search budget exhausted). | H (dates), M (interpretation) |

Verdict: **still_live = true** (feature of an actively developed wallet app; usage small and declining).

---

## 2. Kind and market model

- **Kind (H):** broker / front end for Polymarket. DefiLlama: "Rainbow Predictions is a prediction platform built by Rainbow team", tag `Polymarket Builder`, category Interface (https://api.llama.fi/protocol/rainbow-predictions). The Rainbow client source constructs `@polymarket/clob-client-v2` and `@polymarket/builder-relayer-client` instances and points the data clients at `https://clob.polymarket.com`, `https://gamma-api.polymarket.com`, `https://data-api.polymarket.com`.
- **Market model (H, source):** binary Yes/No conditional-token shares on Polymarket's central limit order book; multi-outcome events are Polymarket negRisk groups (`POLYMARKET_NEG_RISK_CTF_EXCHANGE_ADDRESS`, `POLYMARKET_NEG_RISK_ADAPTER_ADDRESS` in constants). Sports markets rendered with Polymarket market types (moneyline, spreads, totals, first-half variants, BTTS, UFC method of victory, tennis set markets). No scalar markets.
- **Tokenisation (H, source `constants.ts`, quoted from Rainbow, verify against the Polymarket spec):** CTF `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` (ERC-1155); CTF exchange `0xE111180000d2663C0091e4f400237545B87B996B`; neg-risk exchange `0xe2222d279d744050d28e00520010520000310F59`; neg-risk adapter `0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296`; collateral pUSD `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` (6 decimals); onramp `0x93070a847efEf7F70739046A929D47a521F5B8ee`; offramp `0x2957922Eb93258b93368531d39fAcCA3B4dC5854`.
- **Subset shown:** the app exposes categories Trending, Sports, Politics, Finance, Crypto, Geopolitics, Earnings, Tech, Culture, World, Economy, Elections, Mentions (`CATEGORIES` in constants, H). Whether specific Polymarket markets are hidden by remote config was not observable.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading chain | Polygon (137) only. | H (source, DefiLlama chain) |
| Trading collateral | pUSD (Polymarket V2). The user-facing balance is USDC.e on Polygon `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`, wrapped to pUSD through Polymarket's collateral onramp inside a relayed batch (`utils/collateral.ts`). | H (source) |
| Deposit | Rainbow's generic funding flow swaps/bridges any supported token into USDC.e on Polygon and sends it to the user's Polymarket proxy address (`depositConfig.ts`: `feeBps: 0`, `directTransferEnabled: true`); gas can be sponsored behind a remote flag. | H (source) |
| Withdraw | Unwrap pUSD to USDC.e, then transfer or swap; default destination chain is Base (`defaultChain: ChainId.base`), mainnet USDC token as the nominal target. | H (source) |
| Account model | The user's Rainbow EOA derives a Polymarket **Safe** (`POLY_GNOSIS_SAFE`) if one is already deployed, otherwise a Polymarket **deposit wallet** (`POLY_1271`), deployed through the Polymarket relayer. Non-custodial: positions live in that wallet, so they are also visible in Polymarket itself. **Hardware wallets are not supported** (client logs "Hardware wallets are not supported"). | H (source) |

---

## 4. Read API

**Official public API: none.** NOT FOUND (searched: `https://rainbow.me/` and `/predictions` (a bare deep-link stub with no text), `https://rainbow.me/support` (only Getting Started, iOS & Android, Browser Extension guides), `https://rainbow.me/terms-of-use`, `docs.rainbow.me` (DNS does not resolve), GitHub org `rainbow-me` repo list, code search of `rainbow-me/rainbow` for an API/docs reference). Rainbow publishes RainbowKit docs and token lists, nothing for Predictions.

What exists:

- **Underlying data is Polymarket's public data**, fetched client-side by the app (H, `constants.ts`): Gamma `https://gamma-api.polymarket.com`, CLOB `https://clob.polymarket.com` (unauthenticated `polymarketClobDataClient` for order book, prices, price history, `getClobMarketInfo(conditionId)` which supplies `mos` and the fee fields `fd.r` / `fd.e`), Data API `https://data-api.polymarket.com`, sports WS `wss://sports-api.polymarket.com/ws`. These belong to the Polymarket spec.
- **Rainbow's private proxy:** authenticated calls go through `${PLATFORM_BASE_URL}/v1/polymarket/{clob,relayer,sign}` using a `PLATFORM_API_KEY` bearer token (builder-signing is remote: `BuilderConfig({remoteBuilderConfig: {url: .../sign, token}})`). The host value comes from an env variable and is not in the repo; I did not look for it. Authenticated, undocumented, not a read API. Do not integrate. (H, source)
- **Volume/fee telemetry:** DefiLlama only (`https://api.llama.fi/summary/fees/rainbow-predictions`, `https://api.llama.fi/summary/dexs/rainbow-predictions`), daily, no key. Plus Polymarket's public builder leaderboard `https://data-api.polymarket.com/v1/builders/volume` (17 MB response, daily rows per builder code; Rainbow code in section 5). (H, fixtures)
- **DefiLlama quirks:** `dexs` (volume) for Rainbow shows only $21.40 over 30d and $32.8k all-time, from 2026-07-05, which contradicts the Polymarket builder endpoint ($12.08M all-time Rainbow-coded). Treat the DefiLlama volume series as unreliable for this venue; the fee series is the better activity proxy. (H data, M interpretation)

Auth / limits / websocket: n/a for Rainbow. Polymarket's own limits apply to its hosts.

---

## 5. Trade path

- **Programmatic path for Rainbow Predictions: none.** It is a wallet-app UI. (H)
- **How the app trades (H, source `usePolymarketClients.ts`, `polymarketWallet.ts`, `relayExecution.ts`):**
  1. Load the user's EOA signer from the wallet keystore (software wallets only).
  2. Derive Polymarket CLOB API credentials (`deriveApiKey` / `createApiKey`, EIP-712 L1 auth) against Rainbow's CLOB **proxy**.
  3. Build a `ClobClient` with `signatureType` = `POLY_GNOSIS_SAFE` or `POLY_1271` and `funderAddress` = the Safe/deposit wallet, then post orders through the proxy.
  4. Approvals, wrap/unwrap, deposit-wallet deployment and fee collection go through Polymarket's **relayer** (also via Rainbow's proxy, with builder-signing headers added remotely).
  5. After a matched order, the app collects Rainbow's fee with a **separate relayed transaction** from the user's wallet: unwrap pUSD to USDC.e and transfer to Rainbow's fee wallet `0x757758506d6a4F8a433F8BECaFd52545f9Cb050a` (`collectPolymarketTradeFee.ts`, `POLYMARKET_RAINBOW_FEE_RECIPIENT_ADDRESS`; same address in DefiLlama's adapter). The fee is capped at the quoted reservation. Failure to collect is only logged (the trade still stands). (H)
- **Builder code:** Rainbow's Polymarket builder code is `0xabce5abdc189cba6fb85edb9170e3e6e41607e946b06d112b7f87e2f2977020c` (public, from DefiLlama's adapter and the Polymarket builder endpoint). Between 2026-04-29 and 2026-06-29 Rainbow's fees were Polymarket builder fees (DefiLlama adapter); from 2026-06-29 they are collected on chain as above (PR #7635 "Reinstate custom Polymarket fees", merged 2026-06-26, in v2.0.37 on 2026-06-28). (H)

**Reachable through PayBox?** For Rainbow Predictions itself: **no** (no API; the proxy is authenticated with an app key; signing happens inside the wallet app). The underlying exposure **is** reachable by an EVM wallet on Polygon through **Polymarket's own CLOB** (EIP-712 signed V2 orders, pUSD approvals, funded Safe/deposit wallet), which avoids Rainbow's fee entirely. That belongs to the Polymarket adapter. I did not test any signing path.

---

## 6. Fees

Per executed trade, buys and sells (H, source `polymarketTradeFee.ts`, PR #7635 body):

| Component | Formula | Who pays / receives | Tag |
|---|---|---|---|
| Rainbow fee | `notional * min(0.03, 0.14 * (1 - price))`, `price` = average fill price (USD / tokens). So 3.0% for price up to about 0.786, then tapering linearly: 2.8% at 0.80, 1.4% at 0.90, 0.7% at 0.95, 0 at 1.00. | user -> Rainbow fee wallet (separate relayed transfer after the fill) | H |
| Polymarket platform fee | taker only, per-market `{r, e}` from CLOB `getClobMarketInfo(conditionId).fd`; Rainbow computes `shares * r * (price * (1 - price))^e` (`utils/fees.ts`). Live example 2026-10-19 (NFL game, Cowboys vs. Packers): `fd {r 0.03, e 1, to true}` | user -> Polymarket | H (fixture) |
| Rewards | Home page: Rainbow Black gives "up to 100% of your trading fees auto-compounded" and every trade earns $RNBW; mechanics undocumented | | H (page text), mechanics NOT FOUND |
| Gas | Deposits can be sponsored behind `sponsored_polymarket_deposits_enabled` (default true); relayer transactions are paid by Polymarket's relayer | | H (source, default) |
| Funding fee | `feeBps: 0` in deposit and withdrawal config (swap/bridge provider costs still apply) | | H (source) |

Arbitrage consequence: a Rainbow-routed leg costs up to about 3% of notional on entry and again on a sell (about 6% round trip for mid-priced contracts) on top of Polymarket's taker fee. Versus Polymarket direct it is dominated.

---

## 7. Resolution and dispute risk

- Resolution is Polymarket's UMA flow. The Rainbow client references the UMA adapter `0x6A9D222616C90FcA5754cd1333cFD9b7fb6a4F74` and UMA optimistic oracle `0xCB1822859cEF82Cd2Eb4E6276C7916e692995130` in `constants.ts`, displays a "resolvedBy" field and an "in review" market label (CHANGELOG 2.0.20). Rainbow cannot change outcomes. (H source; the contract roles themselves belong to the Polymarket spec)
- Dispute / ambiguity risk = Polymarket/UMA risk, identical to the Polymarket leg. Extra operational risk: the app is mobile-only, hardware wallets cannot trade, the proxy and fee collection depend on Rainbow's backend, and Rainbow could hide markets or stop the feature while the underlying market keeps trading. (M, inference)

---

## 8. Geo / ToS / automation

- Rainbow Terms of Use (`https://rainbow.me/terms-of-use`, read via a small-model summary, so M): requires residency in a supported country and age 18+; nothing specific to Predictions, Polymarket, fees for predictions, or bots/APIs. Appendix A prohibited activities include "sports forecasting or odds making" under gambling (M; a possible tension with the feature that I could not resolve), and "abusive activity" such as "unreasonable or disproportionately large load on our infrastructure".
- Prediction-specific eligibility, restricted countries, or a Polymarket-terms pass-through: **NOT FOUND** (searched: terms of use, privacy page link, support index, home page, client source for `geoblock`, `blockedCountries`, `isRestrictedRegion`, remote-config flag list). Polymarket's own jurisdiction rules apply to the underlying CLOB (see Polymarket spec); how Rainbow's proxy enforces them is unknown.
- Automation: there is no supported way to automate Rainbow Predictions and the Terms do not address bots. Not a candidate for automation. Trading Polymarket directly is governed by Polymarket's terms (see its spec).

---

## 9. Liquidity (all figures with source and date)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Fees, last 24h / 7d / 30d / 1y | $171 / $497 / $2,704 / $81.2k | `api.llama.fi/summary/fees/rainbow-predictions`, data through 2026-10-18 | H |
| Fees by calendar month | Dec 2025 $5.1k; Jan $14.6k; Feb $15.5k; Mar $13.9k; Apr $8.0k; May $6.1k; Jun $5.6k; Jul $3.9k; Aug $3.3k; Sep $3.2k; Oct 1-18 $2.0k | same, summed by me | H data |
| Rainbow-coded volume on Polymarket, by month | Dec $0.56M; Jan $1.57M; Feb $1.58M; Mar $1.71M; Apr $1.06M; May $1.90M; Jun $3.62M; Jul $25k; Aug $25k; Sep $28k; Oct 1-18 $65. All-time $12.08M. Last 30 days (2026-09-19..10-18) $64.54 against $710M for all builder codes. | `data-api.polymarket.com/v1/builders/volume`, fetched 2026-10-19 | H data, M interpretation |
| Peak daily active users (Rainbow-coded) | 184 (Feb 2026); 1-2 per day since Aug 2026 | same endpoint | H |
| Implied current monthly volume | about $0.1-0.4M (Sept fees $3.2k divided by an assumed 0.8-3% effective rate; the Q1 ratio of fees to Rainbow-coded volume was about 0.9%, the current formula is up to 3%) | my derivation | M/L |
| TVL / OI | none of its own (positions are in Polymarket) | DefiLlama TVL series empty | H |

Rainbow's own book depth: none. Market depth is Polymarket's.

---

## 10. Overlap and shared liquidity

- **Shares liquidity with: Polymarket International (CLOB V2, Polygon).** 100% duplicate: same books, same tokens, same resolution. It is **not** an independent arbitrage leg. (H)
- Event categories, all inherited from Polymarket: sports (largest), politics / elections, finance / economy / earnings, crypto price, geopolitics, tech, culture, mentions. These overlap every other venue the aggregator tracks, but the arbitrage counterparty should be Polymarket itself, not Rainbow.
- Related interface-class siblings routed through Polymarket and equally non-independent: MetaMask Predictions, Traderline, Gate, PolyCop, EVplus, Bullpen, others listed in `docs/research/14-platform-of-platforms.md`.

---

## 11. Adapter recommendation

- **adapter_priority: skip.** Dead-weight for trading and for market data: duplicate liquidity, no API, tiny and declining usage, strictly worse fees than the venue it fronts.
- Keep a **registry record** only: `{slug: rainbow-predictions, kind: front-end, routes_to: polymarket, chain: polygon, collateral: pUSD, rainbow_fee: min(0.03, 0.14*(1-p)) of notional on buy and sell, fee_wallet, builder_code, api: none, independent_liquidity: false}`.
- Optional cheap signal, low value: Polymarket's builder endpoint daily volume and active users for Rainbow's code is a (weak) proxy for retail wallet-app flow, but it has been near zero since July 2026, so not worth ingesting.
- If the aggregator ever needs to attribute on-chain fills to Rainbow: V2 orders carry the `builder` bytes32 in the signed order; the code above is the filter. Whether Rainbow still attaches it to every order after 2026-06-29 is doubtful (see section 0, point 4).

### Fixtures (`docs/research/fixtures/rainbow-predictions/`)

| File | What | Size |
|---|---|---|
| `defillama_protocol_rainbow-predictions_2026-10-19.json` | `GET https://api.llama.fi/protocol/rainbow-predictions` | 0.9 KB |
| `defillama_fees_rainbow-predictions_2026-10-19.json` | `GET https://api.llama.fi/summary/fees/rainbow-predictions` (daily series + methodology) | 25 KB |
| `defillama_dexs_rainbow-predictions_2026-10-19.json` | `GET https://api.llama.fi/summary/dexs/rainbow-predictions` (sparse, unreliable volume) | 5 KB |
| `defillama_adapter_fees_rainbow-predictions.ts.txt` | DefiLlama fee adapter source: fee wallet, builder code, 2026-04-29..06-29 builder-fee window | 3 KB |
| `polymarket_builders_volume_rainbow_rows_2026-10-19.json` | Excerpt (Rainbow rows only, 257 days) of the 17 MB `GET https://data-api.polymarket.com/v1/builders/volume` | 17 KB |
| `polymarket_clob_market_info_nfl_example_2026-10-19.json` | `GET https://clob.polymarket.com/clob-markets/{conditionId}` for a live NFL market: the `fd` fee fields Rainbow reads | 0.5 KB |

---

## 12. Not found, open questions, suspicious content

NOT FOUND:
- Any Rainbow-published API, SDK, OpenAPI spec or developer docs for Predictions (searched: rainbow.me, support index, docs.rainbow.me DNS, org repo list, repo code search).
- Prediction-specific terms, eligible / restricted jurisdictions, rate limits (searched: terms of use, support index, client source).
- An official statement in Rainbow's own docs naming the backing venue beyond the home-page marketing line ("You've seen Polymarket in the news...") and the client source, which uses Polymarket SDKs and hosts throughout.
- The Rainbow platform proxy host (`PLATFORM_BASE_URL`, env-supplied) and its auth beyond a bearer app key.
- Mechanics of the Rainbow Black / $RNBW fee rebate.
- News coverage of the launch (WebSearch budget exhausted, not run).

Open questions:
- Does Rainbow still attach its builder code to orders after 2026-06-29? (Builder-attributed volume collapsed while fees continue at about $3k per month.)
- Is the Polymarket geoblock enforced in Rainbow's proxy, in the client, or only at the CLOB?
- Production fee schedule may differ from the repo `develop` branch (no remote flag for it was seen, but the app ships from tagged releases).

Suspicious content / embedded instructions: none found in Rainbow pages, Rainbow source, DefiLlama responses or Polymarket responses.

---

## Sources

- Rainbow home page, fetched 2026-10-19: https://rainbow.me/ (H)
- Rainbow terms of use (summary): https://rainbow.me/terms-of-use (M); support index https://rainbow.me/support (H); https://rainbow.me/predictions (bare stub)
- Rainbow wallet source (GPL-3.0), `develop` as of 2026-10-18: https://github.com/rainbow-me/rainbow , files under `src/features/polymarket/` (`constants.ts`, `depositConfig.ts`, `withdrawalConfig.ts`, `utils/fees.ts`, `utils/polymarketTradeFee.ts`, `utils/collectPolymarketTradeFee.ts`, `utils/collateral.ts`, `utils/polymarketWallet.ts`, `utils/relayExecution.ts`, `stores/derived/usePolymarketClients.ts`, `stores/polymarketWalletKindStore.ts`, `stores/polymarketFeeInfoStore.ts`, `polymarket-clob-data-client.ts`), `src/features/config/stores/remoteConfig.ts`, `CHANGELOG.md`; PRs #6946 and #7635; releases v2.0.17 / v2.0.37 / v2.0.46 (H)
- DefiLlama: https://defillama.com/protocol/rainbow-predictions (HTTP 403 to my fetch; used the API instead), https://api.llama.fi/protocol/rainbow-predictions , https://api.llama.fi/summary/fees/rainbow-predictions , https://api.llama.fi/summary/dexs/rainbow-predictions (H)
- DefiLlama adapters: https://github.com/DefiLlama/dimension-adapters/blob/master/fees/rainbow-predictions.ts , https://github.com/DefiLlama/dimension-adapters/blob/master/factory/polymarket.ts (H)
- Polymarket builder fee docs: https://docs.polymarket.com/programs/builders/fees.md (H, caps 1% taker / 0.5% maker; builder fees defined on matched notional)
- Polymarket public data: https://data-api.polymarket.com/v1/builders/volume , https://gamma-api.polymarket.com/markets , https://clob.polymarket.com/clob-markets/{conditionId} (H)
- Sibling note: `docs/research/venues/metamask-predictions.md` (same Polymarket-builder front-end pattern) and `docs/research/14-platform-of-platforms.md` (registry context)
