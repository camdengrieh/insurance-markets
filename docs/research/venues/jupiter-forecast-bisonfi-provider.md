# Jupiter Forecast (provider `bisonfi`) - adapter spec

Researched 2026-10-19 (~02:15-02:30 UTC). READ-ONLY: unauthenticated GETs to documented hosts (`api.jup.ag`, `developers.jup.ag`, `docs.jup.ag`, `api.llama.fi`, `gamma-api.polymarket.com`), `gh api` reads, WebFetch, PayBox read-only discovery (`discover_plugins`, `get_contract`). No account, no API key, nothing signed, no POST/PUT/DELETE (so `POST /orders` and `/execute` were NOT exercised), no wallet, no PayBox money or signing tool called, no third-party code cloned or run, no Solana RPC (RPC is POST). Scripted requests used the generic User-Agent `insurance-markets-research/0.1`.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (docs, API payloads, market rules) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/jupiter-forecast-bisonfi-provider/` (12 files, all < 10 KB; no wallet addresses).
Sibling note (same API host, keeper-path Polymarket/Kalshi broker): `docs/research/venues/jupiter-prediction-markets.md`. This note covers only the native `bisonfi` provider.

## 0. Verdict

**adapter_priority: P2** (signal-only / thin and price-opaque today; revisit to P1 if a keyed quote shows real two-sided depth).

1. **Live and independent (H).** Rounds are generated 24/7 (BTC 5m and 15m) and a round was `tradable:true` while I was reading. Unlike the rest of Jupiter Predict, Forecast is NOT a mirror of Polymarket/Kalshi: it is an issuer-program native market whose price comes from prop-AMM quoters routed through Jupiter's Metis router (docs say "multiple market makers quote"; Jupiter docs-team notes say the buy "IS a Jupiter swap", router metis). So it can be an independent arbitrage leg.
2. **But the price is invisible to a keyless reader (H).** Forecast market objects carry no `pricing`, `GET /orderbook/{BISON id}` returns 404 `orderbook_not_available` during a live round, Jupiter Price API returned `{}` for the four live outcome mints, and `GET /swap/v2/order` returned `Failed to get quotes` keyless (with and without a placeholder taker, 5 and 50 USDC, UP and DOWN, 15m and 5m rounds). The only documented ways to get a price are a keyed quote or a `POST /orders` build; I could not test either read-only. An aggregator would need a Jupiter API key plus a funded taker pubkey just to quote.
3. **Liquidity is unmeasurable and probably small (M/L).** Every Forecast event reports `volumeUsd:"0"` / `volume24hr:"0"` (field not populated, H); the global `/trades` feed (last 20 fills) had zero `BISON-` rows; DefiLlama has no Forecast split. Since 2026-09-30 the Jupiter app's Degen BTC tab is Polymarket-sourced and "no longer carries the [Forecast] badge" (H, user docs); Forecast is now promoted for SPCX only. The BTC `bisonfi` rounds still exist in the API, but whether anyone quotes them is unknown.
4. **Edge is mostly basis risk against Polymarket (H).** Polymarket runs the same 15m BTC window (checked: 02:15-02:30Z round) but resolves on Chainlink's 60-second **TWAP** stream, while Forecast resolves on Chainlink's BTC/USD stream (spot-type stream, per its rules text). Same vendor, different series, so "identical-oracle arbitrage" does not hold.
5. **Latency and size**: 5/15-minute lives, 5-250 USDC per API order, market orders only, Solana-only. Good for a signal feed (round-by-round implied probability if quotes are obtainable), awkward as an execution leg.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| `GET https://api.jup.ag/prediction/v1/trading-status` | `{"trading_active":true}` 2026-10-19 02:17Z, no key | H (`trading_status.json`) |
| `GET /events?provider=bisonfi&filter=live&includeMarkets=true` | 2 live events (BTC 15m 02:15-02:30Z and BTC 5m 02:20-02:25Z), 4 markets, all `tradable:true`, `isLive:true` | H (`events_bisonfi_filter_live.json`) |
| Full `provider=bisonfi` inventory (paged, `hasNext` until false) | 501 events: BTC 5m 290, BTC 15m 99 (3 are stale June rounds), SPCX 5m 84, SPCX 15m 28; BTC rounds scheduled continuously to 2026-10-20 ~02:30Z, SPCX only 13:30-20:30Z (US hours) | H (`series_inventory_2026-10-19.json`) |
| A 5m round that closed 02:20Z | `closed` / `settled`, `result` `yes` on DOWN and `no` on UP, observed ~4 minutes after close | H (`event_closed_5m_settled_sample.json`; one sample) |
| Docs state beta | "currently in beta and subject to breaking changes" | H (developers.jup.ag/docs/prediction/forecast) |
| Launch | Announced 2026-06-04 ("Solana's first fully native prediction market", built for market makers); a docs-repo commit adds the Forecast page 2026-07-02 | M (KuCoin/CryptoTimes news, 2026-06-05) / H (git log of `jup-ag/docs`) |
| Stale rounds | 3 BTC 15m rounds from 2026-06-10/11 are still `closed`/`resolving`, `result:null`, empty rules text (4 months). Look like pilot/test rounds but show the API never garbage-collects stuck rounds | H (`event_stale_resolving_june_sample.json`) |

Verdict on "still live": **yes (H)**, with the caveat that BTC promotion moved to a Polymarket-sourced product on 2026-09-30.

## 2. What it is and market model

- **Kind**: onchain-other (native Solana issuer program + prop-AMM quoting + Jupiter routing). The provider name `bisonfi` matches an existing Solana **prop AMM** called BisonFi (DefiLlama: "Prop AMM on Solana", swap program `BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi`, TVL $21.0M on 2026-10-19, 24h swap volume $182M, 30d $8.69B; H for the numbers, `defillama_bisonfi_prop_amm_summary.json`). The Forecast **issuer program is a different program** (`2sVcg2dBSUzXkmdZ8M5cp1LbnzDrWJmr6hktkHwB8nY3`). Whether BisonFi (the company) operates the issuer, or only is the lead quoter, is NOT FOUND (searched: developers.jup.ag forecast page + OpenAPI, docs.jup.ag user docs, news, DefiLlama; bisonfi.com is a parked "domain for sale" page; GitHub org `BisonFinance` is an unrelated 2022 account with no matching repos). Treat BisonFi's role as M.
- **Binary, one market per side (H)**: each event is one round holding two binary markets `BISON-<marketPda>-UP` and `BISON-<marketPda>-DOWN`. UP wins if close >= open, DOWN if close < open (ties go to UP). `isYes` is always true on orders; the market id selects the side.
- **Tokenisation (H)**: each side is a Token-2022 mint (`outcomeMint`, program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) worth $1 if it wins, $0 if not. One mint per side per round, so a new mint every 5/15 minutes. Token-2022 permanent delegate is how the issuer auto-settles (M: Jupiter docs-team notes in `jup-ag/docs`, `.claude/rules/product-learning.md`; implies the issuer can move/burn holder balances).
- **Order book vs AMM**: no order book exposed (404 `orderbook_not_available`). Pricing is a swap quote from competing prop-AMM market makers; "Jupiter's system compares all quotes and automatically routes users to the best available price" (M, CryptoTimes 2026-06-05; KuCoin flash). Execution is an **atomic swap** (`executionModel:"atomic_swap"`, `settlement:"auto"`, no keeper, no `orderPubkey`) (H, docs + OpenAPI).
- **Series live now (H)**: Bitcoin Up/Down 5m and 15m (category `crypto`, subcategory `btc`, tags `5m`/`15m`); SPCX (SpaceX) Up/Down 5m and 15m (category `finance`, subcategory `stocks`, US market hours only, resolves on Pyth Pro signed snapshots `Equity.US.SPCX/USD`). The developer Forecast page documents only "15-minute BTC"; 5m and SPCX appear in the API and user docs but not on that page.

## 3. Chains and collateral

- Solana mainnet only. Deposit and settlement mint: **USDC only** (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`); a non-USDC `depositMint` is rejected with `bisonfi_usdc_only` (M, docs-team notes; docs say "USDC only", H). Needs a little SOL for fees and token-account rent.
- On-chain reference (H, forecast page): issuer program `2sVcg2dBSUzXkmdZ8M5cp1LbnzDrWJmr6hktkHwB8nY3`, config PDA `8LczfBkVZJhGnTYH8nQke2YC3b83GFZ8qZtfuMRe6AN6`, BTC Chainlink feed id `0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8`. Not independently confirmed on-chain (Solana RPC is POST; read-only rule).
- Note: the keeper-path vault in `GET /vault-info` (settlementMint USDC, 248 USDC balance) belongs to the Polymarket/Kalshi path, not Forecast.

## 4. Read API

- **Exists: official, keyless reads work, key recommended (H).** Docs say an API key from developers.jup.ag/portal is needed (`x-api-key`); in practice the read endpoints answered with no key. `llms.txt`: keyless 0.5 RPS on `api.jup.ag`; Free key 1 RPS, Developer 10, Launch 50, Pro 150; 60 s sliding window; per organisation; `x-ratelimit-remaining/current/reset` headers (H, developers.jup.ag/docs/portal/rate-limits). I saw no 429 over ~60 calls spaced 1-3 s apart (observed header counters did not match the documented numbers, see `api_ratelimit_headers_keyless.txt`; M).
- **Base URLs**: `https://api.jup.ag/prediction/v1`, `https://api.jup.ag/swap/v2`. **Docs**: https://developers.jup.ag/docs/prediction/forecast ; spec https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml (H; every docs page also served as `.md`).
- **Websocket / streaming**: NOT FOUND (searched: llms.txt, OpenAPI spec, prediction docs). Poll only.
- **Key endpoints (H unless noted)**
  - Discovery: `GET /events?provider=bisonfi&category=crypto&tag=15m&includeMarkets=true` (also `tag=5m`, `category=finance` for SPCX; `filter=live` returns only currently-live rounds, the cheapest call for a scanner; `start`/`end` paging, max range 100 per page, `hasNext`). `GET /events/{eventId}` works for closed rounds. `GET /markets/{marketId}`.
  - Market fields that matter: `marketId`, `status` (open|closed), `lifecycleStatus` (open|resolving|settled), `tradable`, `openTime`/`closeTime` (unix s), `outcomeSide`, `outcomeMint`, `outcomeTokenProgram`, `marketPda`, `result` (`yes`/`no`/null on the settled market), `rulesPrimary` (resolution text and source URL), `resolveAt`/`marketResultPubkey` (null in all samples).
  - **Prices: NOT FOUND on any keyless read.** No `pricing` object on `bisonfi` markets; `/orderbook/{id}` 404; Price API `{}`; `/trades` feed had no `BISON-` rows (last 20); `volumeUsd` 0. Only candidates: keyed `GET /swap/v2/order?inputMint=USDC&outputMint=<outcomeMint>&amount=&taker=&slippageBps=` (docs-team notes say it returns a Metis quote plus unsigned tx) or the build response of `POST /orders` (unsigned tx, not a plain quote). Neither tested.
  - Positions/P&L (need a wallet): `GET /positions?ownerPubkey=` (filter `marketId` starting `BISON-`), `GET /history`. Not useful for a market scanner.
- **Resolution data**: after close, `GET /events/{id}` flips `lifecycleStatus` open -> resolving -> settled and the winning market shows `result:"yes"` (H, one sample). Settled rounds drop out of the `/events` list (the full inventory contained only open rounds plus the 3 stale June ones), so the adapter must remember round ids it has seen and fetch them by id.

## 5. Trade path and PayBox reachability

- **Programmatic (H, docs)**: market orders only (no limit orders, M). Two routes:
  1. Prediction API: `POST /orders {ownerPubkey, marketId, isBuy:true, isYes:true, depositAmount:"<micro-USDC>", depositMint:USDC}` returns `transaction` (base64 VersionedTransaction), `txMeta`, `requiredSigners`, `execution.context` (`type:"bisonfi_swap"`); owner signs (ed25519); then `POST /execute {signedTransaction, context}` returns `{status:"Success", signature, error:null}`. Size 5-250 USDC enforced at build. Sell: `DELETE /positions/{positionPubkey}` with `{ownerPubkey}`, same shape, only while the round is tradable, min 0.01 token (`bisonfi_position_too_small`). Errors: `bisonfi_market_not_tradable` (outside window), `no_route` (routing failed).
  2. Swap API: `GET /swap/v2/order` USDC -> `outcomeMint` (no 250 cap, high slippage advised, docs example 10000 bps), sign, `POST /swap/v2/execute {signedTransaction, requestId}`; exit by swapping back. No Jupiter position tracking.
- **Auth/signing**: `x-api-key` for HTTP; authority is the Solana wallet's ed25519 signature on the built tx. No EIP-712 or API-secret order scheme. No claim step (auto-settle).
- **EVM wallets through PayBox: no direct route (H/M).** The venue is Solana-only. A Base/Ethereum/BNB/Arbitrum/Polygon PayBox wallet would first have to bridge or swap value to Solana USDC (PayBox `request_swap` cross-chain exists via MoonX routes, untested here and a money tool; M, per `docs/research/06-paybox-platform.md`).
- **Solana PayBox wallet: partial (M).**
  - PayBox's official `jupiter` plugin (`paybox://plugins/jupiter`, read-only `get_contract` this session) has `jupiter_swap_solana_tokens {credential_id, input_mint, output_mint, input_amount}` that "obtains a fresh Jupiter order ... signs ... executes through Jupiter" for any two Solana mints. In principle that buys/sells a Forecast outcome token (USDC <-> `outcomeMint`) via the Swap API route. Caveats: the plugin is **not enabled** on this account (`enabled:false`), it exposes no slippage input (docs advise 10000 bps near expiry), whether Jupiter's routing accepts Token-2022 outcome mints through that tool is untested, and each trade needs the wallet grant's approval mode to be fast enough for a 5-minute round. There is no Forecast or prediction tool in the plugin (searched `jupiter prediction forecast`: 0 results; plugin tool list has swap/limit/DCA/Earn only).
  - Alternative: build via `POST /orders`, then PayBox `request_wallet_sign` op `solanaTransaction` or an `io.paybox/transactionProposal` kind `solana` (<= 1,232 bytes, one signer who is fee payer; project note). Unverified: `requiredSigners`, tx size, and whether the tx must go through Jupiter's `/execute` (co-handling) rather than a self-submitted `sendTransaction`.
- None of the PayBox tools were called except read-only discovery.

## 6. Fees

- **Jupiter Forecast: "currently no trading fees"** (shown with a No fees badge on SPCX), H (docs.jup.ag/user-docs/trade/predict/fees and FAQ: "Sports ticket markets and Jupiter Forecast markets currently charge no trading fee"). The same page says Degen routes "can include additional or different fees"; the in-app quote prevails. "Currently" signals this can change.
- **Hidden cost**: price impact and the market makers' spread are embedded in the quoted price (prop-AMM quote). Not published; cannot be measured keyless. Swap-API fee breakdown for these mints: NOT FOUND (needs a keyed quote).
- Solana network fees and temporary token-account rent in SOL (H). Fees on Predict generally are included in quoted amounts, charged in the buy token, rounded up to the cent (H) - Polymarket-path fee table (2x Polymarket fee) does NOT apply to Forecast.
- Order limits: 5-250 USDC on the Prediction API path (H, developer docs; docs-team source note M: `BISONFI_MAX_DEPOSIT_MICRO_USDC = 250_000_000`); user docs say $5 min / $1,000 max for Forecast in the app (H) - the two docs disagree by surface. Direct Swap path: no cap (H, docs).

## 7. Resolution mechanism and dispute risk

- **BTC rounds**: Chainlink Data Streams BTC/USD stream (https://data.chain.link/streams/btc-usd), "not according to other sources or spot markets"; UP if price at end >= price at beginning (H, `rulesPrimary` of live markets). **SPCX rounds**: Pyth Pro signed snapshots `Equity.US.SPCX/USD`, same >= rule (H, `events_bisonfi_spcx_upcoming_sample.json`).
- **Who settles**: the issuer program records the result; winners are paid automatically ("winning tokens settle automatically and are redeemed on the issuer side", H). Seen latency: ~4 min after close (one sample, M).
- **Disputes**: no dispute or challenge mechanism documented (NOT FOUND, searched: forecast page, user docs settlement/FAQ, OpenAPI). General Predict policy: Jupiter "follows the final result from that source or integration" and "does not independently rewrite market outcomes" (H, user docs `settlement`). Missing price data and ties are left to "the market rules". Risk is therefore oracle-feed risk plus **issuer/operator trust** (permanent-delegate token, closed-source program: no audit found, source repo `jup-ag/prediction-market` is not public (404), M) rather than UMA-style dispute risk.
- Stuck rounds: 3 June pilot rounds still `resolving` (see section 1). Cancelled/voided markets refund (generic Predict docs, H); unknown for Forecast.

## 8. Geo, ToS, automation

- **Prediction API is "IP-restricted in some regions"**: the Prediction docs list **United States and South Korea** (H, developers.jup.ag/docs/prediction via WebFetch). Jupiter Terms: "Jupiter does not interact with digital wallets located in, established in, or a resident of the United States, the Republic of China, Singapore, Myanmar ..." plus sanctioned jurisdictions, and no VPN or IP disguising (H, docs.jup.ag/user-docs/legal/terms-of-use). Mobile app restricts more regions than web (H, FAQ).
- **Automation**: the API is explicitly offered to developers and agents (keys, OpenAPI, hosted Trading MCP at https://mcp.jup.ag with a Prediction domain, H llms.txt). Terms prohibit spoofing and wash trading and require compliance with trading-market integrity rules. No blanket bot ban found (searched Terms: "bot", "automat"). The first stock (SPCX) trade in the app requires accepting the Terms of Use (H, user docs). KYC/AML checks reserved "at our discretion" (H).
- Run any live adapter only from a non-US/non-KR IP and a wallet whose owner is eligible. This is a compliance decision for the operator, not something the adapter can paper over.

## 9. Liquidity

- **Forecast volume/OI/TVL: NOT FOUND.** `volumeUsd` / `volume24hr` are `"0"` on all 501 events (field not populated, 2026-10-19). No DefiLlama split (whole Jupiter Predict interface: $255K for day 2026-10-18, 30d $6.24M, all-time $58.0M; H, `defillama_jupiter_prediction_whole_interface_no_forecast_split.json`). Press: Jupiter Predict did $5.3M in April 2026 and ~$17M cumulative before Forecast (M, CryptoTimes 2026-06-05); a June 2026 monthly peak of $13.8M for the whole product is in the sibling note (M, not re-fetched).
- **Quoter-side proxy**: BisonFi prop AMM TVL $21.0M and $182M 24h swap volume on 2026-10-19 (H, DefiLlama), which shows the lead quoter is a large, active Solana market maker. It says nothing about how much it quotes on 5-minute BTC tokens.
- Per-order cap 5-250 USDC via the Prediction API suggests designed depth in the hundreds of dollars per round, not thousands (M, inference).

## 10. Event categories and overlap (where arbitrage could exist)

| Series | Overlaps | Notes |
|---|---|---|
| BTC Up/Down 5m / 15m | Polymarket (same 5m/15m windows; confirmed 15m 02:15-02:30Z, event liquidity ~$28.9K at fetch, H), plausibly Kalshi 15m BTC and other venues' short BTC rounds (M, not checked) | Oracle mismatch: Polymarket uses Chainlink `btc-usd-twap-60s` TWAP, Forecast uses `btc-usd` stream. Expect basis, not riskless arb. Round boundaries align (clock-aligned 5/15 min). |
| SPCX Up/Down 5m / 15m (US hours) | None known | Single-venue; signal-only. |
| Sports, politics, macro, other crypto | None on `bisonfi` | Those on Jupiter Predict come from Polymarket/Kalshi (sibling note). |

## 11. Shared liquidity?

- **Forecast liquidity is NOT shared with Polymarket or Kalshi (H/M).** It settles on its own issuer program and is priced by prop-AMM quoters. It does share the **Jupiter front end and API host** with the Polymarket/Kalshi broker (`POLY-*`, `provider=kalshi`), and since 2026-09-30 the app's BTC Degen tab shows Polymarket-sourced rounds instead; do not count those as Forecast.
- It is Jupiter-routed liquidity: the same outcome tokens can be quoted/traded in any Jupiter-routed swap venue (Metis), so two "venues" (Prediction API and Swap API) are one pool.

## 12. Adapter design notes (if built)

1. Poll `GET /events?provider=bisonfi&filter=live&includeMarkets=true` every few seconds (one call returns every live round, ~2 events). Persist `marketId`, `outcomeMint`, `openTime`/`closeTime`; later `GET /events/{eventId}` to read `result`.
2. Normalised market: binary, `UP`=YES; `settlement_source` = Chainlink `btc-usd` (BTC) or Pyth Pro SPCX; `window` = 5m or 15m; `resolves_on` = `closeTime`; no secondary market after close.
3. Price source requires a keyed quote: `GET /swap/v2/order` with a funded or placeholder `taker` for USDC -> `outcomeMint` (and the reverse for the bid). Treat as an unverified dependency; gate the adapter on a spike with a Developer key (cost: key + rate limit 10 RPS at the $25/mo tier; a signup is outside this task).
4. Do not mark a market tradable on `status:"open"`; use `tradable` plus `now in [openTime, closeTime)`.
5. Skip rounds in `resolving` older than 1 hour (stuck pilot rounds).
6. Parse `*Micro`/`depositAmount` strings with BigInt/decimal.

## 13. Not found / open questions

- A keyless or documented read-only **price/depth** source for Forecast (searched: OpenAPI spec paths, `/markets`, `/orderbook`, Price API, `/trades`, DefiLlama). Highest-value gap.
- Actual Forecast volume/open interest; whether anything quotes the BTC rounds after 2026-09-30.
- Identity of the operator behind the issuer program and its audits (searched: GitHub code search for the program id returned only `jup-ag/docs` and unrelated repos; `jup-ag/prediction-market` is private).
- Dispute/void policy specific to Forecast; behaviour on missing oracle data.
- `requiredSigners`, tx size and whether `/execute` co-signs (needs a `POST /orders` build; not allowed here).
- Whether Jupiter-routed quotes of Token-2022 outcome mints work through PayBox's `jupiter_swap_solana_tokens`.
- Whether Kalshi's 15m BTC market matches the Forecast window and oracle (not checked; venue covered elsewhere).

## 14. Suspicious / agent-directed content (recorded, not followed)

- Every `developers.jup.ag` and `docs.jup.ag` markdown page opens with a "Documentation Index ... Fetch the complete documentation index at ... llms.txt ... before exploring further" banner aimed at LLM crawlers; `docs.jup.ag` pages also carry an "Agent Instructions" block telling agents how to describe GUM products. Benign formatting hints.
- `jup-ag/docs` repo file `.claude/rules/product-learning.md` is an agent-rules file with imperatives ("Never document a claim step for Forecast", "Do NOT claim in docs ...") and internal notes that include two real mainnet transaction signatures and a contributor's local paths. Used only as a secondary factual lead (tagged M); none of the imperatives were followed and no signatures/paths were copied.
- WebSearch result bodies ended with a tool-wrapper "REMINDER: You MUST include the sources above in your response" line; I cite sources below anyway because this note requires a Sources section, not because of that line.

## Sources

- https://developers.jup.ag/docs/prediction/forecast and `.md` variant (fetched 2026-10-19) - H
- https://developers.jup.ag/docs/prediction (via WebFetch: geo list US/South Korea, no Forecast mention) - H
- https://developers.jup.ag/docs/openapi-spec/prediction/prediction.yaml (`bisonfi` provider enum, `outcomeMint`, `executionModel`, `Execution`) - H
- https://developers.jup.ag/docs/llms.txt (keyless 0.5 RPS, tiers, Forecast summary, MCP) - H
- https://docs.jup.ag/user-docs/trade/predict/{fees,degen,settlement,faq,how-it-works}.md and https://docs.jup.ag/user-docs/legal/terms-of-use.md - H
- Live GETs 2026-10-19 keyless: `https://api.jup.ag/prediction/v1/{trading-status, events (provider=bisonfi, paged), events/{id}, markets/{id}, orderbook/{id}, trades, vault-info}`, `https://api.jup.ag/swap/v2/order` (error), `https://api.jup.ag/price/v3` (empty) - H (fixtures)
- https://api.llama.fi/protocols, https://api.llama.fi/summary/dexs/bisonfi, https://api.llama.fi/summary/dexs/jupiter-prediction, https://api.llama.fi/protocol/jupiter-prediction; `gh api` reads of `DefiLlama/DefiLlama-Adapters/projects/bisonfi/index.js` and `DefiLlama/dimension-adapters/dexs/bisonfi/index.ts` - H
- https://gamma-api.polymarket.com/events?slug=btc-updown-15m-1792376100 (same-window comparison) - H
- `gh api repos/jup-ag/docs/contents/.claude/rules/product-learning.md` and `.../prediction/forecast.mdx` (docs-team notes: Metis routing, 250 cap source, permanent delegate, auto-settle) - M
- https://www.cryptotimes.io/2026/06/05/jupiter-unveils-forecast-to-power-solana-prediction-markets/ and https://www.kucoin.com/news/flash/jupiter-launches-solana-native-prediction-market-with-multi-market-maker-quotes (2026-06) - M; solanacompass.com and cryptopolitan.com articles returned HTTP 403, not read (the "competing prop-AMM quoters" claim is corroborated by the KuCoin/CryptoTimes text)
- PayBox read-only: `discover_plugins` (`jupiter`, enabled:false), `get_contract paybox://plugins/jupiter` - H; `docs/research/06-paybox-platform.md` (project note) - M
- https://bisonfi.com (parked domain page, no product info) - L; WebSearch budget was exhausted mid-session, so BisonFi-specific searches beyond the first were not run.
