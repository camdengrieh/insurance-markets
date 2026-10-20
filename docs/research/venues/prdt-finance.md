# PRDT Finance (prdt.finance) - venue spec

Researched 2026-10-19. Read-only: public pages, gitbook `.md` mirrors, DefiLlama public API, Sourcify public API, GitHub read API, static reading of the site's own JS chunks (fetched as text, never executed). No accounts, no wallet connection, no POST, and no calls to the undocumented hosts (`api7.`, `demoapi.`, `apim.`, `ws.`).

Tags: H = read first-hand in a primary source this session (URL given); M = secondary or inferred; L = weak or stale.

WebSearch was unavailable (session search budget used up), so nothing below comes from search-engine results. Other-venue and news cross-checks are therefore missing, and are marked NOT FOUND where relevant.

Relationship to `docs/research/venues/prdt.md`: an earlier note on the same venue (listed there as "PRDT") already exists. This note was written independently and re-verified its main facts (liveness, docs, vault ABI, TVL). Differences are listed under "Delta vs prdt.md".

## Verdict

- Adapter priority: **skip**.
- PRDT is a short-horizon crypto/forex Up/Down game with a fixed payout multiplier (Pro) or a pooled payout (Classic), settled by an off-chain operator engine against a credited balance. It is not an event-prediction market. There is no outcome token, no order book, no exit and no price to compare, and the only trade API is an undocumented cookie-session backend.
- Still live (see Liveness) but small: DefiLlama TVL about 482K USD, bets capped at 100-500 USD, house or pool counterparty, 100% wagering lock before withdrawal.
- The only overlap with other venues is 1-30 minute BTC/ETH/SOL Up/Down against other venues' short crypto up/down markets. A two-leg lock needs the other leg to cost under about 0.474 per 1 USD payout at the 1.9x multiplier, on a strike that PRDT shifts by a dynamic spread, with a user-chosen start time that does not line up with any other venue's round.

## Liveness (still live in 2026?)

- **Platform live, H (partial).** `https://prdt.finance` returns 200; `/pro`, `/classic`, `/liquidity` return 200 and show a "(c) 2026 PRDT" footer with "Live - Solana & EVM". Docs: "The PRDT prediction platform itself remains operational. This migration only concerns the $PRDT token." (https://prdt-finance.gitbook.io/prdt-finance-gitbook/usdprdt-token-migration.md). DefiLlama TVL has a point at 2026-10-19 02:27 UTC (https://api.llama.fi/protocol/prdt). I did not place a bet or see a settled round, so "operational" rests on self-reported docs, a rendered 2026 UI and TVL movement.
- The `/pro` and `/classic` pages as fetched are client-rendered shells ("No Ongoing Trade", "0 trades"); the homepage figures (BTC 104,318 USD, ETH 3,942, "56% UP / 44% DOWN", "312 in 11.3k pool") are a scripted showcase, not live data. H (page text) / M (interpretation).
- Blog (SEO content on liquidations and BTC price): newest sitemap lastmod 2025-11-26 (https://prdt.finance/blogsitemap/sitemap.xml). No 2026 product news found. L / possibly stale.
- **$PRDT token: migration in progress, H.** Docs: holder snapshot done, platform purchases and new staking disabled, stakes unbinding, official liquidity removed; "There is currently no official migration link or new token contract." Cause given: more than 90% of supply stuck in a Team.Finance lock. Docs are undated.
- Origin: Classic launched on BSC October 2021; Pro launched on Polygon 2022-11-15 (https://prdt-finance.gitbook.io/prdt-finance-gitbook/roadmap.md). DefiLlama `listedAt` = 2022-10-20, which matches the discovery hint.

## Kind and market model

- Kind: on-chain deposit vault plus off-chain game engine ("DeFi price prediction", binary-option style Up/Down rounds). H.
- Outcomes: binary UP or DOWN per round, on crypto and forex pairs only. No categorical, no scalar. H.
- **Pro**: the user opens their own round with any window from 1 to 30 minutes (bundle enforces `interval` 1..1800 s), fixed multiplier. Docs (https://prdt-finance.gitbook.io/prdt-finance-gitbook/smart-contracts/pro-version-rules/multipliers-and-bet-sizes.md): BTC, ETH, BNB 1.9x-1.85x; SOL, DOGE, XRP, PEPE, ARB 1.7x; USD/JPY, GBP/USD (typo "GPB"), EUR/USD 1.8x. Min bet 2.5 USD; max 500 (BTC, ETH), 300 (BNB, SOL), 100 (others and forex). H.
- **Classic**: shared 5-minute BTC rounds (docs: "5min BTC"; intro page says 1 and 5 minute rounds), "dynamic multipliers and 5% entry fee", min 2.5 / max 250 USD; winners split the losing pool (parimutuel). Pool is shared with the Pro balance system. H (rules page), M (pool mechanics from the site's own copy).
- Dynamic spread: for Up the opening (strike) price is set slightly above market, for Down slightly below; built from Pyth prices and the Garman-Klass volatility estimator (https://prdt-finance.gitbook.io/prdt-finance-gitbook/smart-contracts/pro-version-rules.md). H. The size of the spread is not published (NOT FOUND).
- Positions cannot be changed, added to or removed once opened (FAQ). So there is no secondary price and no exit liquidity. H.
- Tokenisation: none. A bet is a row in the operator's balance system (see Trade path). The legacy epoch-based contract family (below) tracked bets in contract storage, but the current vault ABI has no bet functions. H (ABI) / M (inference).

## Chains and collateral

- Chains per docs: BSC, Ethereum, Polygon, Arbitrum, Base, Nibiru, Solana. H (https://prdt-finance.gitbook.io/prdt-finance-gitbook/smart-contracts.md). DefiLlama TVL covers Ethereum, Binance, Polygon, Arbitrum, Solana, Nibiru, not Base. H.
- Deposit assets: USDT, USDC, BNB, POL, ETH, NIBI, SOL; balance is in USD and shared by Classic and Pro. Fiat top-up also mentioned (getting-started page). H.
- Vault ("Classic and Pro") addresses from docs, H: BSC `0x49eFb44831aD88A9cFFB183d48C0c60bF4028da8`; Polygon `0x0b9c8c0a04354f41b985c10daf7db30bc66998f5`; Ethereum `0x792b18ec0d39093f10f8b34676e2f8669a495e9b`; Arbitrum `0xe2ca0a434effea151d5b2c649b754acd3c8a20f0`; Base `0xc4a3cd4157fdc2da052bffdd93f4bd56a4716ad8`; Nibiru `0x062EB9830D1f1f0C64ac598eC7921f0cbD6d4841`; Solana program `4mtdvZoV3bccQzx6HgGG3XYfffxMaTrHRPL8KqnTM243`. Stability Vault `0xd9632d09518D940E307580Dd1D7B4abd22A77dd4` (BSC and Ethereum). Legacy token (BSC) `0x854b5f2bFcC5B7cd05d6259cf5D035aF57CFa301`. Polygon "legacy version" `0x9f9564BE7b566dfE4B091a83a591752102aF3F33`.
- Sourcify has exact-match verified source for the vault on BSC, Ethereum, Polygon, Arbitrum and Base (verifiedAt 2024-08-08 to 2026-06-17); the Stability Vault is not on Sourcify (404). H (https://sourcify.dev/server/v2/contract/{chainId}/{address}).
- Inconsistency, L: the DefiLlama adapter lists `0x062EB...` (the docs' Nibiru address) as "predictionPROV2" on Ethereum and Arbitrum too (https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/prdt/index.js). Not resolved without RPC calls.

## Read API

- **Official public API: NOT FOUND** (searched: gitbook `llms.txt` and 14 pages, `prdt.finance/llms.txt`, sitemaps, robots.txt, site nav and footer, GitHub org `PRDT-Finance` (2 unrelated repos: a DefiLlama-Adapters fork and an assets list, last pushed 2023), GitHub repo search). `/api`, `/docs`, `/terms`, `/privacy` on prdt.finance return 404. `read_api.exists` = none (documented).
- **Undocumented frontend backend (M; read statically from first-party JS, never called).** Saved in `docs/research/fixtures/prdt-finance/frontend_bundle_endpoints.txt`.
  - REST host `https://api7.prdt.finance`. Read-looking routes: `GET /api/v1/time`, `/paused`, `/settings`, `/spreads`, `/sentiment`, `/volume`, `/price/latest` (POST `{token}`), `/price/kline`, `/price/klineHistory`, `/price/change`, `/prediction/bets{query}` (user history, cookie), `/prediction/balances/`, `/staking`. Write routes: `POST /api/v1/prediction/bets`, `/deposits/check`, `/withdraws`, `/withdraws/cancel`, autoPlay, rewards, chests and gifts.
  - Auth routes: `POST /auth/request-message`, `POST /auth/verify`, `GET /auth/authenticate`, `GET /auth/logout`.
  - Other hosts in the bundle: `demoapi.prdt.finance` (demo mode), `apim.prdt.finance`, `mining.prdt.finance`.
  - WebSocket: socket.io client; events handled include `spread`, `spread10M`, `tokenPrice`, `classicRoundUpdate`, `classicNewBet`, `classicBetUpdate`, `traditionalRoundUpdate`, `traditionalNewBet`, `traditionalBetUpdate`, `statusUpdate_traditionalPaused`, `prdt_daily_limit_update`, `rewardPool`, `jackpotWinner`. WS URL string in the bundle: `wss://ws.prdt.finance` (not connected).
  - Whether `settings`, `spreads`, `paused`, `volume` and `price/*` answer unauthenticated GETs: NOT TESTED. The host is undocumented, so it falls outside the "documented API hosts" allowance. No fixture of a live market response was saved for that reason.
- **On-chain read:** the current vault ABI has no round, bet or price functions (see Trade path), so there is no on-chain or subgraph read of markets. A legacy epoch-based contract family (PancakeSwap-Prediction-like: `currentEpoch`, `getRound`, `getUserRounds`, `betBull`, `betBear`, `hostedBetBull`, `claim`, `executeRound`, `cancelRound`) is embedded in the site's JS bundle and still referenced by DefiLlama as `predictionBNB/ETH/BTC/PRO/PROV2/classicV3` on BSC and similar on Polygon. Whether those are still live and used: NOT FOUND (needs RPC or explorer reads). M.
- Third-party read: DefiLlama `GET https://api.llama.fi/protocol/prdt` gives TVL by chain and token only (H, fixture saved). `summary/fees|dexs|options/prdt` return "not found" (HTTP 400, H); `summary/derivatives/prdt` returns HTTP 402 "Upgrade to the paid API plan" (payment requirements not applicable; stopped).
- Rate limits, pagination, API keys: NOT FOUND. Price source: docs say Pyth; the homepage copy says "your entry locked at the live Binance feed" and the bundle polls `api.binance.com/api/v3/ticker/price`; the exact settlement feed is therefore ambiguous. H (each quote) / M (resolution).

## Trade path

- **Programmatic trading API documented: NOT FOUND** (searched: gitbook, llms.txt, site, GitHub). No SDK, no signed-order scheme, no partner docs.
- Architecture, H (ABI) plus M (inference): Sourcify's verified BSC vault ABI (48 entries, fixture saved) exposes `addBalance`, `addBalanceWithSwap`, `addTokenBalance`, `addTokenBalanceForUser`, `addTokenBalanceWithSwap`, `addTokenBalanceWithMultihop`, and operator-gated `sendBalance`, `sendBalanceAmount` (withdrawals), plus `canSend`, `maxSingleWithdraw`, `withdrawBufferPeriod`, `setOperator`, `setRelayer`, `setProtectedBalance`, `recoverToken`, `recoverAmount`, `injectTreasury`, `owner`. The Ethereum, Polygon, Arbitrum and Base vaults expose 33 functions each, none containing "bet" or "round". So deposits are on-chain, bets and settlement are off-chain, and payouts are withdrawals authorised by the operator or relayer key. The docs' phrase "non-custodial round completion" does not match this design.
- Bet flow seen in the bundle (M, not executed): Pro bet = `POST api7/api/v1/prediction/bets` with `{network, token, target, interval, position, amount, partnerName, source, host}` under a cookie session. Login = `POST /auth/request-message {address, chain, network: evm|svm}` returning `{message, nonce}`, wallet signs the message (EVM personal_sign; Solana ed25519 signMessage), then `POST /auth/verify {message, nonce, signature, address[, partnerName, referralCode]}`. A reCAPTCHA-backed `POST /api/v1/proof` also exists (used with an `epoch`, i.e. the legacy on-chain flow). A partner program (`partnerName`, `hostedBetBull(epoch, host)`, `addHostedPartnerAddress`, `hostedPartnerTreasuryRate`) exists in the code, but no public partner or API docs: NOT FOUND.
- Docs FAQ text still talks about collecting winnings with BNB gas and internal transactions. That reads like legacy per-round contracts, and is inconsistent with the V3 balance vault. L (docs undated, partly BSC-era).

## PayBox reachability

- **no** for trading; funding only is technically possible.
- An EVM wallet could send a plain deposit tx (`addTokenBalance` or `addBalance`) to a vault through PayBox transaction proposals, and could in principle sign the login message. But betting needs a cookie session against an undocumented backend with bot checks, there is no signed-order or order-book path to propose, and withdrawals require wagering 100% of deposits and operator payout. An adapter would be a browser-session or private-API client, which this project's rules do not allow.
- Putting funds in a closed-source, operator-controlled vault with a wagering lock is a counterparty-risk decision, not just an integration task.

## Fees

- Pro: no explicit fee on the site; the cost is the sub-2x multiplier (1.9x is 52.6% implied per side, about 5.3% total margin; 1.7x is 58.8% per side, about 17.6% margin) plus the dynamic spread on the strike. H (docs, https://prdt.finance/en FAQ) / M (my arithmetic).
- Classic: 5% entry fee per prediction, paid by the user; winners split the remaining pool. H.
- Withdrawal fees (docs, old text, "Matic" naming): Ethereum 0.0002 ETH or 0.5 USDT/USDC; BSC 0.0008 BNB (or equivalents); Polygon 2.5 Matic; Arbitrum 0.0002 ETH or 0.5 USDT/USDC; Solana 0.0035 SOL or 0.5 USDT/USDC. Base and Nibiru not listed. L for current values.
- Wagering requirement: wager 100% of total deposits before withdrawing (stated reasons: not becoming a bridge, AML). H (https://prdt-finance.gitbook.io/prdt-finance-gitbook/wagering-system-and-withdrawal-policy.md).
- Tie (lock == close): refund minus fee. One-sided Classic round: the lone side loses to treasury. H (FAQ).
- LP side: "Pure Pools" pay LPs a share of trade fees plus "counterparty yield" for taking the other side of trades (https://prdt-finance.gitbook.io/prdt-finance-gitbook/staking.md). H (claim by project).

## Resolution mechanism and dispute risk

- Price from Pyth for crypto and forex, with a timestamp; "execution time of a round does not have an impact on the price fetched" (https://prdt-finance.gitbook.io/prdt-finance-gitbook/security-and-audit.md). H (project claim); the homepage and bundle also mention Binance prices, so the effective feed is unclear. M.
- Rounds settle with a 15-block buffer (up to about 45 s on BSC); a round's displayed result can flip after it ends ("congestion"), and the FAQ gives timestamps as the only transparency (FAQ). H.
- Pausing: the market pauses if the price cannot be fetched or a tx is stuck over 15 blocks; an admin or operator resumes it manually; open positions in paused rounds are refundable at the user's gas cost (FAQ). H.
- No dispute process, no on-chain oracle assertion, no DAO resolution. Dispute risk is centralised-operator risk. Admin, operator and relayer key holders are unknown (NOT FOUND; would need RPC reads).
- Audits, L / possibly stale: CertiK requested 2022-02-17, delivered 2022-04-11, scope `PRDTPrediction.sol`, 6 findings (1 Major centralisation/privilege, acknowledged), Skynet score 64.70 (BB), not team-verified, no KYC (https://skynet.certik.com/projects/prdt-finance). Vibranium audit PDFs (Solidity and Rust), repo last pushed 2024-06-20 (https://github.com/VibraniumAudits/VibraniumAudits-PRDT); PDFs not read. Both predate the V3 balance vault.

## Geo, ToS, automation

- Site footer: "Prediction trading involves risk and may not be available in your jurisdiction." Homepage FAQ: "accessible globally, however, local regulations ... may apply". Docs: "No sign-up or KYC required". H.
- Terms of Service and privacy policy: NOT FOUND (searched: `/terms`, `/privacy`, `/terms-of-service`, `/tos` all 404; no footer link; gitbook index has none). Geo-blocking list: NOT FOUND.
- Bot or API-use policy: NOT FOUND. robots.txt allows `/` and disallows only `/landing/`, `/niob/`, `/venus/`. The bundle loads reCAPTCHA v3 and has a `/proof` endpoint, which points to anti-bot controls. H (robots) / M (reCAPTCHA).
- Rewards layer (gift-card vouchers, lottery tickets, jackpot, chests) sits on top of trading volume: a consumer gambling product. Regulatory status: NOT FOUND. M.

## Liquidity

- DefiLlama TVL **481,874 USD at 2026-10-19 02:27 UTC**: Ethereum 336.9K, Binance 96.2K, Polygon 22.7K, Arbitrum 14.8K, Solana 11.1K, Nibiru 0.1K. WETH is about 327K of it; which contract holds it is not broken out. Peak in series 690,924 USD on 2026-01-15; first point 126,946 USD on 2022-10-20. H (https://api.llama.fi/protocol/prdt, fixture trimmed). TVL is vault balances (user deposits plus house funds), not tradable depth.
- Volume or open interest: no independent figure. Site claims "$200M+ paid out" and "14M+ rounds settled" (undated marketing, L). No fee or volume series on DefiLlama. NOT FOUND.
- `/liquidity` page shows six single-asset Pure Pools (ETH, USDT, USDC, SOL, POL, BNB) with 0.00% APR, TVL "--", 0 active positions (as fetched; data may render client-side); docs say the team bootstraps counterparty liquidity during the DAO transition. H (page text) / M (client rendering).
- Per-bet depth is capped by the max bet: 100-500 USD Pro, 250 USD Classic. H.
- DefiLlama also shows `mcap` 2,387,080 USD for the legacy token (stale; liquidity removed). L.

## Event coverage / overlap (arbitrage relevance)

- Covered: BTC, ETH, BNB, SOL, DOGE, XRP, PEPE, ARB Up/Down; USD/JPY, GBP/USD, EUR/USD Up/Down; windows 1-30 min (Pro), 5 min BTC (Classic). H.
- Not covered: sports, politics, macro event markets. Docs mention future forex and commodities only. H.
- Overlap candidates: short-window crypto up/down listings elsewhere (NOT CHECKED here; other venue notes should confirm). A PRDT leg is a fixed-odds bet with a spread-shifted strike and a start time chosen by the user, so it does not match another venue's round boundary or reference price. For a lock: PRDT cost 0.526 per 1 USD payout at 1.9x, so the other leg must cost under 0.474. No exit before expiry, 100-500 USD cap, and the 100% wagering lock before withdrawal make it impractical.
- Signal value: none beyond Pyth prices. The `spread` and `sentiment` feeds are internal quote and positioning data from an undocumented backend, not market consensus.

## Shared liquidity

- Independent of other prediction venues: own vault and pool, counterparty is the platform or its Pure Pool LPs. H/M. Not CLOB depth, so not a clean arbitrage leg.
- Pyth (and possibly Binance) are shared price sources, not liquidity dependencies.

## Adapter spec (only if ever forced)

Not recommended. A signal-only adapter could poll DefiLlama `protocol/prdt` for TVL as a health check. A trading or quoting adapter would need the undocumented `api7` backend, a cookie session from a wallet-signed login, and a bot-check, so it should wait for operator permission or published docs. If modelled at all: `{asset, window_s, side, multiplier, strike_spread, min_bet, max_bet}`, venue-specific, mapped to a [0,1] price only as implied probability = 1 / multiplier (0.526 at 1.9x).

## Delta vs prdt.md

- Same verdict (skip) and same core facts. Agrees on vault ABI, chain list, fees and multipliers.
- TVL now 481,874 USD (2026-10-19) vs 476,318 (2026-10-18) in prdt.md; both from the same DefiLlama endpoint.
- Newest blog sitemap lastmod is 2025-11-26, not 2025-10-12.
- Fuller endpoint catalogue from the bundle (bet, auth, settings, spreads, volume, paused, sentiment, price routes; reCAPTCHA `/proof`; partner/hosted-bet code); prdt.md listed only a subset.
- Found a legacy epoch-based contract family in the bundle's ABI and checked Sourcify for five vaults (prdt.md checked BSC only).
- Notes the Binance-vs-Pyth feed ambiguity.

## Open questions

- Do `GET api7.prdt.finance/api/v1/{settings,spreads,paused,volume}` answer without a session, and is use permitted? Not tested (undocumented host).
- Is any bet transaction still on-chain (legacy epoch contracts on BSC and Polygon), or is everything off-chain now? Needs RPC or explorer reads.
- Who holds owner, operator and relayer keys per vault (multisig or EOA)?
- Real daily volume and number of active users: no source.
- Terms of use and restricted-jurisdiction list: none found.
- Is there a partner or white-label API behind `partnerName`?
- Real new-token contract once the migration completes; treat `prdttoken.com`-style lookalikes as unverified.

## Suspicious content

- None found: no text aimed at AI agents on prdt.finance pages, the gitbook, CertiK, or the JS chunks read. The gitbook pages carry a generic "append .md to page URLs" note, which I used (benign).
- Docs themselves warn users to ignore unofficial migration links and DMs.

## Sources

- https://prdt.finance (`/en`, `/pro`, `/classic`, `/liquidity`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/blogsitemap/sitemap.xml`, `/learnsitemap/sitemap.xml`), fetched 2026-10-19. H.
- https://prdt-finance.gitbook.io/prdt-finance-gitbook/llms.txt and `.md` pages: introduction-to-prdt, getting-started, getting-started/prdt-classic-pro-how-to-top-up-balance-and-open-a-position, smart-contracts, smart-contracts/classic-version-rules, smart-contracts/pro-version-rules, smart-contracts/pro-version-rules/multipliers-and-bet-sizes, wagering-system-and-withdrawal-policy, usdprdt-token-migration, staking, security-and-audit, faq-and-help, roadmap, loyalty-center. Undated; H for content, M for age.
- First-party Next.js chunks under https://prdt.finance/_next/static/chunks/ (41 files; static text only). M for endpoint semantics.
- https://api.llama.fi/protocol/prdt, https://api.llama.fi/summary/{fees,dexs,options,derivatives}/prdt, https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/prdt/index.js. H, 2026-10-19.
- https://sourcify.dev/server/v2/contract/{56,1,137,42161,8453}/{vault address}?fields=abi,matchId,verifiedAt. H.
- https://skynet.certik.com/projects/prdt-finance (audit 2022-04-11). H content, L freshness.
- https://github.com/VibraniumAudits/VibraniumAudits-PRDT (listing only, pushed 2024-06-20); https://github.com/PRDT-Finance (org listing). M.
- `docs/research/venues/prdt.md` (earlier local note on the same venue) used only as a cross-check; its CoinGecko and press-release items were not re-verified here. L.

## Fixtures (docs/research/fixtures/prdt-finance/)

- `defillama_protocol_prdt_trimmed.json`: metadata, current chain TVLs, last 14 daily points, quarterly snapshots, peak, token mix (GET 2026-10-19).
- `sourcify_bsc_0x49eFb448_vault_abi.json`: verified ABI of the BSC Classic/Pro vault.
- `frontend_bundle_endpoints.txt`: route strings, socket event names and call shapes read from the site's JS chunks (hosts not called).
- `gitbook_smart_contracts.md`, `gitbook_multipliers_and_bet_sizes.md`, `gitbook_token_migration.md`, `gitbook_llms.txt`: official docs snapshots (2026-10-19).
- No fixture of a live market or quote response: no documented public read API, and undocumented hosts were not called.
