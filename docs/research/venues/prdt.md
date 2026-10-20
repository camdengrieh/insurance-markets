# PRDT (prdt.finance) - venue spec

Researched 2026-10-19. Read-only: public pages, docs `.md` mirrors, DefiLlama public API, Sourcify public API, static reading of the site's JS bundle. No accounts, no wallet connection, no POST, no calls to undocumented hosts (`api7.`, `demoapi.`, `ws.`).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- It is not an event-prediction market. It is a short-horizon crypto Up/Down game (binary-option style) with a fixed payout multiplier (Pro) or a pooled payout (Classic). There is no tradable outcome token, no order book, no market price to compare, no way to exit a position, and no documented API.
- The platform is still live (see Liveness), but liquidity is small (DefiLlama TVL about 476K USD), bets are capped at 100-500 USD, the counterparty is the house or an operator-managed pool, and withdrawals require wagering 100% of deposits first.
- Its only conceivable overlap is short-window BTC/ETH/SOL Up/Down against other venues' 5-15 minute crypto up/down markets. At 1.9x Pro (implied 52.6% per side, about 5.3% vig) plus a dynamic spread on the strike, a two-leg lock is very unlikely to exist, and the only automation path is an undocumented, cookie-authenticated backend.

## Liveness (still live in 2026?)

- **Platform: live, H (partial).** `https://prdt.finance` returns 200 with a "(c) 2026 PRDT. Built on Solana & EVM." footer; `/pro` and `/classic` return 200; `llms.txt` is served. Docs say "The PRDT prediction platform itself remains operational. This migration only concerns the $PRDT token." (https://prdt-finance.gitbook.io/prdt-finance-gitbook/usdprdt-token-migration.md). DefiLlama TVL series has a point dated 2026-10-18 (https://api.llama.fi/protocol/prdt). I did not run a bet or observe a settled round, so "operational" rests on self-reported docs plus TVL movement.
- **Blog: stale, H.** Newest sitemap lastmod is 2025-10-12 (https://prdt.finance/blogsitemap/sitemap.xml); no 2026 posts.
- **$PRDT token: effectively dead/migrating, H.** Docs: token migration underway, purchases through the platform disabled, staking disabled, stakes unbound, official liquidity removed; "There is currently no official migration link or new token contract." CoinGecko says PRDT "stopped trading" on all listed exchanges, 24h volume 5.81 USD, mcap 2.39M USD (stale).
- Origin: Classic launched on BSC Oct 2021; Pro launched on Polygon 2022-11-15 (H, roadmap page). Hint from the discovery list ("listed 2022-10") matches DefiLlama `listedAt` 1666274834 (2022-10-20).

## Kind and market model

- Kind: on-chain deposit vault plus off-chain game engine; "crypto/forex price Up/Down rounds". H (docs, ABI).
- Outcomes: binary UP / DOWN per round. No categorical or scalar markets. H.
- Two products (H, https://prdt.finance/en and gitbook rules pages):
  - **Pro**: user opens own round, 1 to 30 minute window, fixed multiplier. Multipliers per docs: BTC/ETH/BNB 1.9x-1.85x, SOL/DOGE/XRP/PEPE/ARB 1.7x, forex (USD/JPY, GBP/USD (typo "GPB/USD" in docs), EUR/USD) 1.8x. Bet min 2.5 USD, max 500 (BTC/ETH), 300 (BNB/SOL), 100 (others/forex). Site says "no fee"; the fee is in the sub-2x multiplier and in the dynamic spread applied to the strike (UP strike set slightly above spot, DOWN strike slightly below), using Garman-Klass volatility on Pyth prices.
  - **Classic**: shared 5-minute rounds on BTC (docs list BTC only; site says "1- and 5-minute rounds"), parimutuel-style pool: winners split the losing pool, dynamic multipliers, 5% entry fee, min 2.5 / max 250 USD. If one side is empty the lone side loses and funds go to the treasury (FAQ).
- Positions cannot be changed, added to, or closed once opened (FAQ). So there is no secondary price and no exit liquidity. H.
- Tokenisation: none visible. A position is a row in the operator's balance system, not a token. See Trade path. H (ABI) / M (inference).

## Chains and collateral

- Chains (docs): BSC, Ethereum, Polygon, Arbitrum, Base, Nibiru, Solana. H (https://prdt-finance.gitbook.io/prdt-finance-gitbook/smart-contracts.md). DefiLlama TVL covers Ethereum, Arbitrum, BSC, Polygon, Solana, Nibiru (not Base).
- Deposit assets: USDT, USDC, BNB, POL, ETH, NIBI, SOL (docs, getting-started). Balance is shown in USD and "can be used in both trading modes". Deposits via Aarc swap/bridge integration also exist (JS bundle references `bridge-swap.aarc.xyz`; blog "Introducing Aarc integration", 2025-01-20). H/M.
- Contract addresses (docs, H): "Classic and Pro" on BSC `0x49eFb44831aD88A9cFFB183d48C0c60bF4028da8`, Polygon `0x0b9c8c0a04354f41b985c10daf7db30bc66998f5`, Ethereum `0x792b18ec0d39093f10f8b34676e2f8669a495e9b`, Arbitrum `0xe2ca0a434effea151d5b2c649b754acd3c8a20f0`, Base `0xc4a3cd4157fdc2da052bffdd93f4bd56a4716ad8`, Nibiru `0x062EB9830D1f1f0C64ac598eC7921f0cbD6d4841`; Solana program `4mtdvZoV3bccQzx6HgGG3XYfffxMaTrHRPL8KqnTM243`, Solana "master" accounts for USDC/USDT listed. Stability Vault `0xd9632d09518D940E307580Dd1D7B4abd22A77dd4` (BSC and ETH). Legacy token `0x854b5f2bFcC5B7cd05d6259cf5D035aF57CFa301` (BSC).
- Note: DefiLlama's adapter labels the Ethereum `0x062EB...` address as "predictionPROV2" and the Nibiru address in docs is the same string, so the docs/adapter mapping is inconsistent. L (not resolved).

## Read API

- **Official public API: NOT FOUND** (searched: gitbook llms.txt and all 17 pages, prdt.finance/llms.txt, sitemap, robots.txt, site footer, GitHub org search by name, DefiLlama). `exists` = none (documented).
- **Undocumented frontend backend (M, static bundle read only, not called):**
  - REST host `https://api7.prdt.finance`; routes seen in the layout chunk: `/api/v1/time`, `/api/v1/prediction/deposits`, `/api/v1/prediction/deposits/check` (POST with `{txHash, network}`), `/api/v1/prediction/deposits/nibi`, `/api/v1/prediction/withdraws`, `/api/v1/prediction/withdraws/addresses`, `/api/v1/prediction/withdraws/prdt`, `/api/v1/staking`, `/api/v1/gifts`, `/api/v1/gifts/brands`. All called with `withCredentials: true` (cookie session). A `/price/change` route is also used.
  - WebSocket (socket.io client) at `wss://ws.prdt.finance` (demo mode uses `https://demoapi.prdt.finance`); events handled in the client: `spread`, `spread10M`, `tokenPrice`, `statusUpdate_traditionalPaused`, `prdt_daily_limit_update`, `userLotteryTicket`. Connect query carries `userAddress`.
  - I did not call these hosts: they are not documented, so they fall outside the "documented API hosts" allowance. Treat all of this as an internal API that can change without notice.
- **Round/market state is not on-chain.** The verified ABI has no round, bet or price functions (see Trade path), so there is no on-chain or subgraph read for markets either.
- Third-party read: DefiLlama `https://api.llama.fi/protocol/prdt` gives only TVL by chain (H, fixture saved). `summary/fees|dexs|options/prdt` return "not found" (H); `summary/derivatives` is paywalled (HTTP 402, requirements not applicable, stopped).
- Pricing source: Pyth feeds (docs); the front end also polls `api.binance.com/api/v3/ticker/price` (bundle string). H/M.
- Rate limits, auth model for read endpoints, pagination: NOT FOUND.

## Trade path

- **No programmatic trading API is documented.** NOT FOUND (searched: gitbook, llms.txt, site, GitHub).
- **Architecture (H, from verified ABI + docs + M inference):** the per-chain "Classic and Pro" contract is a deposit/withdraw vault. Verified source ABI on Sourcify for BSC `0x49eF...8da8` (48 entries, fixture saved): `addBalance`, `addTokenBalance`, `addTokenBalanceWithSwap`, `addTokenBalanceWithMultihop`, `addTokenBalanceForUser`, and operator-gated `sendBalance` / `sendBalanceAmount` (withdrawals paid out by operator/relayer), `canSend`, `maxSingleWithdraw`, `withdrawBufferPeriod`, `setOperator`, `setRelayer`, `setProtectedBalance`, `recoverToken`, `recoverAmount`, `injectTreasury`, `owner`. There are no functions to open a position, settle a round, or read a price. Events: `BalanceAdded`, `TokenBalanceAdded`, `InjectTreasury`, `OwnershipTransferred`.
- Therefore bets and settlement are off-chain (operator backend) against a credited balance; the website posts the deposit `txHash` to `/api/v1/prediction/deposits/check` so the backend can credit it (M, bundle). The docs' phrase "non-custodial round completion" is not supported by this design: funds sit in an owner/operator-controlled vault and payouts are authorised by the operator key. M (inference from ABI), H for the ABI itself.
- The FAQ also says a user "need[s] a little BNB to trigger the smart contract" to collect winnings and that winnings show as internal transactions; this contradicts or predates the V3 balance design (older per-asset prediction contracts in the DefiLlama adapter: predictionBNB, predictionETH, predictionBTC, predictionPRO, predictionclassicV3). L (docs may be legacy text).
- Auth: wallet login with cookie session (`withCredentials`, `profile.isAuthenticated` in bundle). Exact signing scheme (SIWE / personal_sign / Solana message sign): NOT FOUND (not called).

## PayBox reachability

- **paybox_reachable = no (for trading); partial for funding only.** An EVM wallet could make a plain deposit via an on-chain tx to the vault (`addTokenBalance` / `addBalance`) through PayBox transaction proposals, but betting needs a logged-in session against an undocumented backend, and withdrawals need a 100% wager and operator approval. There is no signed-order or order-book path to propose. An adapter would be a browser-session scraper, which conflicts with the project rules and is fragile.
- Sending funds to a closed-source, operator-controlled vault with a wagering lock is a counterparty-risk call, not just an integration task. Not recommended.

## Fees

- Pro: no explicit fee (site FAQ, H); economic cost is the fixed sub-2x multiplier (1.9x BTC/ETH => 5.26% total implied probability margin; 1.7x on small caps => 17.6% margin) plus the dynamic spread on the strike. H (docs) / M (my arithmetic).
- Classic: 5% entry fee on each prediction (site FAQ, docs), borne by the user; winners split the remaining pool. H.
- Withdrawal fees: ETH 0.0002 ETH or 0.5 USDT/USDC; BSC 0.0008 BNB (or equivalents); Polygon 2.5 POL; Arbitrum 0.0002 ETH or 0.5 USDT/USDC; Solana 0.0035 SOL or 0.5 USDT/USDC. Base and Nibiru not listed. Docs page is old ("Matic"), L for current values.
- Wagering requirement: must wager 100% of total deposits before withdrawing. H.
- Tie (lock price == close price): refund minus fee. H (FAQ).

## Resolution mechanism and dispute risk

- Prices: Pyth feeds for crypto and forex; closing price fetched with a timestamp; "execution time of a round does not have an impact on the price fetched" (Security & Audit page). H (claim by project).
- Rounds settle with a 15-block buffer, up to about 45 s delay (FAQ, BSC-era text). Results can change after round end ("The round's result changed after the round ended" FAQ entry exists; text truncated in my fetch). M.
- Pausing: markets pause if price/oracle fetch fails or a tx is stuck over 15 blocks; resumed manually by an admin/operator; positions in paused rounds are refundable. H (FAQ).
- No dispute process, no UMA/DAO resolution. Operator discretion. Dispute risk is centralised-operator risk, not oracle ambiguity.
- Audits (H): CertiK, requested 2022-02-17, delivered 2022-04-11, scope `PRDTPrediction.sol`, 6 findings (1 major "Centralization/Privilege" acknowledged); CertiK Skynet score 64.70 (BB), project not team-verified (https://skynet.certik.com/projects/prdt-finance). Vibranium audit PDFs (Solidity and Rust), repo last pushed 2024-06-20 (https://github.com/VibraniumAudits/VibraniumAudits-PRDT). Both are older than 6 months and pre-date the V3 balance vault: **L / possibly stale.** I did not read the Vibranium PDFs.

## Geo, ToS, automation

- Site: "Prediction trading involves risk and may not be available in your jurisdiction." No KYC ("no sign-up or KYC", docs). H.
- Terms of Service / privacy policy: NOT FOUND (searched: footer links, llms.txt, sitemap; `/terms` is 404).
- Bot or API-use policy: NOT FOUND. robots.txt allows `/` and disallows `/landing/`, `/niob/`, `/venus/`. H.
- Gift-card/voucher rewards and a "loyalty/lottery ticket" system run on top of trading volume (docs, JS events); that points to a consumer gambling product. Regulatory status unknown. M.
- Contact on site: a generic info email (not copied here).

## Liquidity

- DefiLlama TVL: **476,318 USD at 2026-10-18** (Ethereum 332.5K, BSC 95.4K, Polygon 22.4K, Arbitrum 14.8K, Solana 11.0K, Nibiru 0.1K); peak in series 690,924 USD on 2026-01-15; first point 126,946 USD on 2022-10-20. H (https://api.llama.fi/protocol/prdt, fixture trimmed). TVL = balances of the vault contracts, which are user deposits plus house funds, not tradable depth.
- Volume / OI: no independent figure. Site claims "$200M+ paid out" and "14M+ rounds settled" (undated marketing, L). DefiLlama has no fees/volume series for PRDT. NOT FOUND (searched: DefiLlama dimensions endpoints).
- Pools: `/liquidity` page shows six single-asset pools (ETH, USDT, USDC, SOL, POL, BNB) with 0.00% APR, total staked 0.00 USD, 0 active positions at fetch time; docs say the team bootstraps counterparty liquidity during the DAO transition. H (page as fetched by a text reader; may render live data client-side).
- Per-bet depth is capped by the max bet (100-500 USD Pro, 250 Classic).
- Token: mcap 2.39M USD, 24h volume 5.81 USD, no trading pairs (CoinGecko, stale). L.

## Event coverage / overlap (arbitrage relevance)

- Covered: BTC, ETH, BNB, SOL, DOGE, XRP, PEPE, ARB crypto Up/Down; USD/JPY, GBP/USD, EUR/USD forex Up/Down; windows 1-30 min (Pro), 5 min BTC (Classic). H.
- No sports, politics, macro event markets. H.
- Overlap candidates: short-window crypto up/down listings on other venues (M; other venue notes should confirm). A PRDT leg is a fixed-odds house bet with a spread-adjusted strike and an arbitrary round start chosen by the user, so it is not aligned to another venue's round boundaries, and a two-leg lock would need combined cost below 1.0 (PRDT 0.526 per side at 1.9x leaves the other leg needing a price under 0.474). Not a practical arbitrage leg.
- Signal value: none beyond Pyth prices the project already uses. The `spread` / `spread10M` socket events are internal quote data, not market consensus.

## Shared liquidity

- Independent of other prediction venues (own vault and pool). But it is not "market liquidity" in the CLOB sense: the counterparty is the platform or its Pure Pool LPs. H/M.
- Pyth is the price source, shared with many protocols but not a liquidity dependency.

## Adapter spec (if ever needed)

Not recommended. If a read-only signal adapter were forced: poll DefiLlama TVL for health only; do not hit `api7.prdt.finance` without permission from the operator. Market shape if modelled: `{asset, window_s, side, multiplier, strike_spread, min_bet, max_bet}`, venue-specific, not mappable to a binary market with a price in [0,1] except as implied probability = 1/multiplier (0.526 for 1.9x).

## Open questions

- Actual bet flow: confirm whether any bet transaction touches the chain (needs on-chain tx inspection of the vault, or a manual UI session; not done).
- Who holds `owner`, `operator`, `relayer` keys on each vault (multisig or EOA)? Not read (needs RPC calls).
- Current state of the $PRDT migration and the real official new token contract (a separate site, `prdttoken.com`, appeared in search describing a Solana-based "PRDT Token"; affiliation unconfirmed, possible lookalike, not fetched).
- Terms of use and jurisdiction list (none found).
- Whether Base and Nibiru contracts hold funds (not in DefiLlama TVL for Base).

## Suspicious content

- None found: no text aimed at AI agents on prdt.finance, the gitbook, CertiK page, or CoinGecko. Gitbook pages carry a generic "append .md to page URLs" tooling note, which I used (benign, not an instruction to act).
- Warning only: the docs themselves tell users to ignore unofficial migration links/DMs; `prdttoken.com` is an unverified third-party site.

## Sources

- https://prdt.finance (home, `/en`, `/pro`, `/classic`, `/liquidity`, `/llms.txt`, `/robots.txt`, `/sitemap.xml`, `/sitemapstatic.xml`, `/blogsitemap/sitemap.xml`) - fetched 2026-10-19, H.
- https://prdt-finance.gitbook.io/prdt-finance-gitbook/llms.txt and `.md` pages: introduction-to-prdt, getting-started, smart-contracts, smart-contracts/classic-version-rules, smart-contracts/pro-version-rules, smart-contracts/pro-version-rules/multipliers-and-bet-sizes, wagering-system-and-withdrawal-policy, usdprdt-token-migration, staking, security-and-audit, faq-and-help, roadmap - H. Docs undated; migration text is recent-looking but not date-stamped (M on age).
- Site JS bundle chunk `/_next/static/chunks/app/[lang]/(apps)/layout-049b817180e9adb2.js` (static text read only, not executed) - M for endpoint list.
- https://api.llama.fi/protocol/prdt, https://api.llama.fi/summary/{fees,dexs,options,derivatives}/prdt, https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/prdt/index.js - H, 2026-10-19 (defillama.com/protocol/prdt page itself returned 403 to the fetch tool).
- https://sourcify.dev/server/v2/contract/56/0x49eFb44831aD88A9cFFB183d48C0c60bF4028da8?fields=abi - H.
- https://skynet.certik.com/projects/prdt-finance (audit 2022-04-11) - H, L for freshness.
- https://github.com/VibraniumAudits/VibraniumAudits-PRDT (pushed 2024-06-20; PDFs not read) - M.
- https://www.coingecko.com/en/coins/predictions - M/L (undated price data).
- Search results (WebSearch, extended): GlobeNewswire press releases 2025-09-29 and 2025-10-31 on the token launch, Bitget academy page, LBank price page (stamped 2026-07-05) - L, promotional, claims not relied on. Press-release claims of "80% revenue to stakers" and multi-chain list are marketing; the staking page now says staking is disabled.
- https://defillama.com/protocol/prdt (given as discovery evidence; page not readable via fetch tool, API used instead).

## Fixtures (docs/research/fixtures/prdt/)

- `defillama_protocol_prdt_trimmed.json` - trimmed DefiLlama protocol summary (current chain TVLs, last 10 TVL points).
- `sourcify_bsc_0x49eFb448_abi.json` - Sourcify verified ABI of the BSC Classic/Pro vault.
- `gitbook_smart_contracts.md`, `gitbook_llms.txt` - official docs snapshots (2026-10-19).
- No fixture of a live market/quote response: no documented public read API; undocumented hosts were not called.
