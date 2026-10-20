# Euphoria Finance (euphoria.finance) - venue spec

Researched 2026-10-19. READ-ONLY: official docs (GitBook `.md` copies), the public web-app bundle (downloaded as data and grepped, nothing executed), unauthenticated GETs to DefiLlama, the public MegaETH Blockscout API and the project's own domains, `gh api` raw reads, one read-only PayBox `discover_tokens` catalog query. No account, wallet, key, signature, POST/PUT/DELETE or money-moving PayBox tool was used. Third-party text was treated as untrusted data; nothing in it was followed. WebSearch quota ran out after one search, so news coverage is thin (noted in section 13).

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## 1. Verdict

- **Live: yes (H).** `https://euphoria.finance` serves the app (HTML `last-modified` 2026-10-16), `docs.euphoria.finance` is up, and the exchange contract on MegaETH was still receiving transactions at 2026-10-19 02:33 UTC (~50 txs in the previous 7 minutes). Mainnet launched around 2026-05-14..16 (M, sources disagree by a day or two). Tap trading first ran as an invite-only testnet "Tapathon" 2026-02-16 to 2026-03-02.
- **It is not an event/prediction market.** It sells short-dated "box" (touch/barrier) options on ETH, BTC and SOL price, plus synthetic RNG series. There is no sports, politics or macro, so there is almost no event overlap with the other venues.
- **No public API (H).** The only API is the first-party tRPC backend behind a Privy session, Cloudflare Turnstile, a device fingerprint and a second "trade key" signature. The ToS prohibits automated tools and circumvention.
- **adapter_priority = skip.** Independent liquidity but tiny (TVL ~$178k, per-trade cap $5-$10), geo-gated, automation-hostile, MegaETH not reachable via PayBox. Re-check triggers are in section 12.

## 2. Kind and market model

| Item | Finding | Tag |
|---|---|---|
| Kind | Non-custodial on-chain derivatives venue, "Tap Trading" UI. Market-maker RFQ-style quotes per grid square, settled in smart contracts on MegaETH. Docs and DefiLlama say "CLOB market making", but the docs never describe a public order book (see below). | H (docs, ToS), M (CLOB wording) |
| Product | Box option / one-touch grid. A square = price range x time window. Win if the oracle price enters the square before the window passes; no need to stay. Lose the stake otherwise. "grid-based price-range trigger contracts" (ToS 4.1). | H |
| Timeframes | Docs/FAQ: 5 seconds per square. Client code also has 60 s and 300 s. | H (docs), M (client) |
| Underlyings | Docs FAQ: Ethereum live, "Bitcoin and Solana coming soon". Client enum: ETH=1, BTC=2, SOL=3 and ten `RNG_*` synthetic series (ids 240-249) with ids and grid steps defined. Which are enabled in production was not verified. | H (docs), M (client) |
| Outcome tokenisation | None found. Positions are keyed by `positionId` (bytes20) and recorded in the exchange contract; no ERC-20/1155 outcome token is documented. Not a binary YES/NO share market and the payout is `stake x multiplier`, not $1. | M |
| Quote model | Multiplier per square is "the best available quote" from third-party and in-house market makers. Pricing depends on distance, time remaining, volatility. Slippage tolerance applies to the multiplier. | H |
| Trade size | Default $0.10 per tap. | H |

CLOB wording: the manifesto says it merges "the efficiency of CLOB market making" with tap UX, and DefiLlama repeats it. The docs and ToS describe market makers streaming quotes and the user receiving "the best available multiplier at the time of execution". No order-book endpoint or order placement by third parties is documented. Treat it as a quote-driven (RFQ) venue with a hidden book (M).

## 3. Chain, collateral, contracts

| Item | Finding | Tag |
|---|---|---|
| Chain | MegaETH mainnet, chain id 4326 (RPC `https://mainnet.megaeth.com/rpc`, explorer `https://megaeth.blockscout.com`) | H (bundle, CSP, Blockscout) |
| Collateral | USDM ("MegaUSD", 18 decimals) `0xFAfDdbb3FC7688494971a79cc65DCa3EF82079E7`. ToS 4.4: "you must hold and transact in USDM regardless of the charted asset". | H |
| Docs "Core trading Contract" | `0xdf8248fee58e791149e69f6c61129D471EaFC11E` (ERC1967 proxy, verified, impl `0x4225d1aB...`). Holds **176,198.64 USDM** on 2026-10-19 which matches DefiLlama TVL ($176,197); 0 direct txs, 7.2M token transfers. Acts as the vault (M, inferred). | H (balance), M (role) |
| Exchange contract | `0x12759afcA690637b425ffbA3265F0Dc2F6242A8D` (ERC1967 proxy, verified 2026-04-24, impl `0x95D2A2cB...`). It is the EIP-712 `verifyingContract` in the web app, emits `TradeExecuted(bytes20 orderId, address user, address vault)` and `PositionSettled(bytes20 positionId, address recipient, uint256 payout, uint256 fee)` (event ABIs from the DefiLlama dimension adapter). 6,332,235 txs and 9.6M token transfers lifetime. Not mentioned in the docs (docs list only the vault). | H |
| Implementation source | Both implementations are unverified on Blockscout (only the proxies). Function ABI of the exchange is NOT FOUND. Two selectors dominate recent txs (`0x21d5c9bb`, `0x93ca625d`), unknown in public signature DBs. | H |
| Audit | Sherlock; report linked on docs (PDF not read). DefiLlama shows audits "2". | M |
| Admin | Both are upgradeable ERC1967 proxies; owner/admin powers not inspected. | H (proxy), L (powers) |
| Funding | USDM on MegaETH direct, swaps/bridge via Relay, card/Apple/Google Pay (docs FAQ, CSP lists MoonPay/Halliday/Helio). Withdrawal to USDC on Ethereum/Arbitrum/Base/Solana via third-party bridge (docs). | H |
| Wallet model | Login via Privy creates an **embedded wallet**; "your connected wallet address is only used to log in", deposit/trade address is the embedded wallet (docs FAQ). | H |

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | **None.** `llms.txt` index lists 13 pages, none developer-facing. Bug-bounty scope mentions "API" only as an in-scope asset. No SDK or GitHub org found. | H |
| First-party API | tRPC (HTTP + WebSocket) at `https://api.mainnet.euphoria.finance` (WS `wss://api.mainnet.euphoria.finance/ws`, push `/_events`). Found in the app bundle and CSP. Cookie-credentialed (Privy session). | H (bundle) |
| Procedures seen | `trades.state`, `trades.reports`, `trades.aggregatedReports`, `trades.tradingStats`, `trades.subscribeTrades`, `trades.executeTrade` (subscription), `quotes.streamQuotes` (subscription), `markets.streamTickers` (subscription), `leaderboard.getLeaderboard`, `users.*`, `battles.*`. | H |
| Unauthenticated probe | `GET /leaderboard.getLeaderboard` -> **401** `UNAUTHORIZED` (tRPC JSON body). `GET /healthz` -> **403**. `GET /` -> 404. So even leaderboard data needs a session; no unauthenticated market or quote data exists. Fixture: `api-mainnet-trpc-unauth-401.json`. I did not try to bypass the 403 or send auth. | H |
| Rate limits | Not documented. Client error code `RATE_LIMITED` ("Too many trades"). | M |
| On-chain reads | Public and usable: MegaETH RPC and Blockscout v2 API. `TradeExecuted`/`PositionSettled` logs on `0x1275...` give trade and settlement feed (user, vault, payout, fee) but not the quoted multiplier or the square geometry, which are inside unverified calldata. | M |
| Third-party analytics | DefiLlama TVL (free), DefiLlama `derivatives` volume (paywalled: HTTP 402 "Upgrade to the paid API plan", not an x402 flow, stopped), Dune dashboard `euphoria-analytics-ddf0` (named in a DefiLlama adapter comment; not opened, needs Dune API key). | H |

Adapter consequence: a read-only price/book adapter is **not possible** from public endpoints. The only live signal is the on-chain event feed.

## 5. Trade path

Reverse-engineered from the public bundle; unofficial and unsupported (M for completeness, H that each item is in the bundle):

1. User logs in with Privy (email/social/wallet) and gets an embedded wallet. Deposit USDM to it.
2. Client streams quotes (`quotes.streamQuotes`), picks a square, then signs EIP-712 `TakerOrder` { takerAmount uint128, underlying uint8, nonce uint8, startTime uint64, timeInterval uint32, startPrice uint64 (1e8), priceInterval uint64 (1e8) } with domain `{name:"Euphoria", version:"1", chainId:4326, verifyingContract:0x1275...}`.
3. Client also signs an ERC-2612 `Permit` on USDM (spender = exchange contract) if allowance is missing, plus a `botSignature` from a locally held "trade key", and sends a device fingerprint and an opaque `blob`.
4. `trades.executeTrade` subscription carries order, quote (multiplier), slippageTolerance, cell coordinates, signatures. Server answers `rejected` with a reason or accepts; an operator/market-maker address then submits the on-chain tx (gas sponsored, ToS section on fees). Recent exchange txs are from a few non-user callers.
5. Settlement: oracle-driven; payout via `PositionSettled`; "Users may also trigger the settlement transaction themselves" (ToS 4.7).

Programmatic access therefore needs a Privy-authenticated session, Turnstile, a registered trade key and a device fingerprint. That is bot-resistance by design. **No supported programmatic trade path** (H).

## 6. PayBox reachability

- **paybox_reachable = no.** MegaETH is not in PayBox's chain catalog: `discover_tokens mode=chains query="megaeth"` and `query="4326"` both returned `total_count: 0` on 2026-10-19 (H; the tool says the catalog is "not a support allowlist", so this is evidence, not proof). The same result is recorded in `docs/research/venues/evently.md`.
- Even with a signing path, trades are signed by the **Privy embedded wallet** that the app creates for the account, not by an arbitrary external EVM wallet, and require the app session plus bot checks (section 5). ToS forbids "Use a wallet other than your own".
- Funding only: a PayBox wallet could in principle send supported assets to the embedded address through the app's own Relay/bridge flow, but that is app-mediated and not an integration.

## 7. Fees

- **Trading fee: 0 currently** (H, docs "Fees & Trading Limits" and FAQ). DefiLlama's adapter comment: "Euphoria seems to have 0 fees starting from 2026-05-08" (H, GitHub). The `PositionSettled` event still carries a `fee` field, and ToS says fees "may include fees charged on user transactions, fees charged to market makers" and can change "without prior notice" (H).
- **Implicit cost is the multiplier spread**: payout multiplier is set by market makers, not by a formula in the docs (H: "Euphoria does not create or manipulate market prices"). Expected edge cost cannot be computed without the quote stream.
- Gas: sponsored by the company at present, may be passed through in USDM (ToS) (H).
- Deposits: no Euphoria fee on USDM; third-party swap/bridge/fiat fees apply. Withdrawals: small USDM gas fee to MegaETH, bridge fees for other chains (H).
- Limits (docs): new accounts max trade $5, max stake per square $25; standard $10 / $50; VIP later. Tapathon (testnet) limits were $1-$50 per tap. Abuse controls can reduce limits (H).

## 8. Resolution and dispute risk

- Settlement by **RedStone** oracle (docs say "custom Redstone oracle"; press says RedStone Bolt, ~2.4 ms updates) (H docs, M press). The contract decides on expiry whether the oracle price "passed through" the box (ToS 4.5).
- No UMA-style dispute or human resolution. ToS: the Company "has no control over the accuracy, timeliness, or availability of oracle data" and disclaims liability; all fees non-refundable (H).
- Risk shape: oracle path dependence (what counts as touching a box, tick granularity), proxy upgradeability, unverified implementations, centralised quote and submission layer, accounts can be limited for "oracle manipulation" patterns (H docs).
- Trader-selectable event semantics (what "touch" means exactly, edge inclusion, which feed per asset) are NOT FOUND in docs.

## 9. Geo, ToS, automation (quotes kept short)

- Entity: Euphoria Panama Operations Inc.; Panama law; three-arbitrator CECAP arbitration in Panama City (H, ToS in app bundle `terms-*.js`).
- Restricted jurisdictions include Crimea, Cuba, DPR/LPR, Iran, North Korea, Russia, South Sudan, Sudan (North), Syria and "any other country in which Canada, the United States, the United Kingdom, the European Union, the Republic of Panama, the UN..." imposes embargoes or sanctions, or where crypto is restricted (H). The app has a geo-block page keyed on `blockedCountry` (H, bundle). Whether US/UK users are blocked in practice is NOT FOUND; ToS wording is sanctions-based, not an explicit US-person ban.
- Age 18+. Verification clauses exist (KYC may be required at the Company's discretion).
- Automation: prohibited uses include "Attempt to access or search the Services using any automated tool, including spiders, robots, crawlers, or data mining tools", "circumvent any technological measure", "Disguise or interfere with the IP address", "wash trading, spoofing", and "Use a wallet other than your own" (H). The Tapathon and Euphoric Mondays terms also exclude "risk-free or hedged trading strategies designed solely to game rankings" and abuse (H). Hedged or arbitrage trading is not explicitly banned for normal accounts, but bot access is.
- Conclusion: an automated arbitrage adapter would breach the ToS and would have to defeat Turnstile and fingerprinting. Do not build trading support.

## 10. Liquidity (as of 2026-10-19)

| Metric | Value | Source | Tag |
|---|---|---|---|
| TVL (USDM in vault) | **$178,008** (series low $72.6k on 2026-05-15, series high $179.0k on 2026-10-17; roughly flat ~$176-179k for the last week) | DefiLlama `api.llama.fi/protocol/euphoria-finance`; matches vault balance 176,198.64 USDM on Blockscout | H |
| Lifetime activity | 6.33M txs to exchange contract; 7.2M token transfers into/out of vault; 28.6k USDM holders on MegaETH overall | Blockscout counters 2026-10-19 | H |
| Recent rate | 50 USDM transfers into the vault in 8.5 min (02:23-02:32 UTC) totalling ~$213, max single $14.8, many under $1. Extrapolates to tens of $k/day, but one off-peak sample, includes non-trade flows. | Blockscout | L |
| Volume | NOT FOUND publicly: DefiLlama volume is behind a paid plan; not in the free `dexs`/`fees` overviews for MegaETH. | | H (absence) |
| Raise | $7.5M pre-seed/seed (Karatage, Figment, Robot Ventures lead) | DefiLlama `raises` | M |

Depth is capped by design: $5-$10 per trade. Market-maker capital behind the quotes is unknown.

## 11. Event overlap and independence

- Categories: **crypto price only**, and only as seconds-to-minutes touch options on ETH/BTC/SOL. No sports, politics or macro. (H)
- Overlap with other venues is only conceptual: a touch-before-expiry probability could be compared to the short-dated crypto price markets on Polymarket/Kalshi/Limitless/Predict.fun (already covered elsewhere). Contract shapes differ (touch within a box vs. close above/below), horizons differ (5 s-5 min vs. 5 min to days), and the quote stream is not accessible, so a clean arbitrage leg cannot be built. A "fair touch probability from realised vol" model would be a signal, not an arb.
- Liquidity sharing: **independent**; the quoting market makers are Euphoria-specific plus in-house MM (ToS 4.3). Nothing indicates shared liquidity with another venue. Market makers hedge elsewhere on spot/perps (M, inferred; not documented).

## 12. Adapter priority and revisit triggers

**skip.** Reasons: not an event market; no public read API (401/403); trade path is a bot-hardened first-party flow and the ToS bans automation; $5-$10 trade caps and $178k TVL; MegaETH absent from PayBox catalog. Independent liquidity is the only plus.

Revisit if: (a) docs add a developer/API or market-maker section, (b) per-trade limits and TVL rise by an order of magnitude, (c) PayBox adds chain 4326, (d) Euphoria launches event or sports markets (the Euphoria "battles" PvP feature and RNG series suggest product breadth, not event markets), (e) verified implementation source or ABI appears so the on-chain event feed can be decoded for signals.

Possible P2 signal use only if free: decode `TradeExecuted`/`PositionSettled` for MegaETH retail-flow intensity. Low value.

## 13. Not found / gaps

- Public API or SDK docs; rate limits; quote/book/ticker schema (needs auth). Real response shape could only be confirmed for DefiLlama, Blockscout and the 401 body.
- Exchange/vault function ABI (implementations unverified), owner/admin and upgrade-timelock details.
- Trading volume, fees collected (DefiLlama paywalled; Dune dashboard not opened).
- Exact RedStone feed ids, tick rules, edge-touch semantics, expiry handling.
- Which underlyings are enabled in production (docs FAQ says only Ethereum live; client has BTC/SOL/RNG).
- Recent news and incident history: WebSearch quota was exhausted after one query. One press piece (OurCryptoTalk, 2026-05-15) and a 2025-07 Blocmates piece (stale, L) were read. No hack listed on DefiLlama (`hacks: []`).
- Audit report content (Sherlock PDF not read).

## 14. Sources

Primary (H):
- https://euphoria.finance (HTML 200, `last-modified` 2026-10-16) and JS bundles `/assets/index-Cp3uiBKS.js`, `chart-context-DWp_i48C.js`, `trpc-runtime-C4IqsEeh.js`, `terms-DGDoQT6m.js` (read as static data)
- https://docs.euphoria.finance/llms.txt and `.md` pages: how-to-tap-trade, about-the-platform, fees-and-trading-limits, architecture-and-technology, smart-contract-audit, bug-bounty, faq, tapathon, tapathon-terms-and-conditions, euphoric-mondays, quickstart (manifesto)
- https://api.mainnet.euphoria.finance/leaderboard.getLeaderboard (401) and /healthz (403), 2026-10-19
- https://api.llama.fi/protocol/euphoria-finance, https://api.llama.fi/protocols, https://api.llama.fi/overview/dexs/megaeth, https://api.llama.fi/overview/fees/megaeth, https://api.llama.fi/summary/derivatives/euphoria-finance (402)
- https://defillama.com/protocol/euphoria-finance
- https://github.com/DefiLlama/dimension-adapters/blob/master/dexs/euphoria-fi/index.ts (via `gh api`)
- https://megaeth.blockscout.com/api/v2 (addresses, counters, token-balances, transactions, smart-contracts, tokens; 2026-10-19)
- PayBox `discover_tokens` mode=chains, queries "megaeth" and "4326", 2026-10-19

Secondary (M/L):
- https://ourcryptotalk.com/news/euphoria-mainnet-tap-trading-megaeth (2026-05-15, M)
- https://www.blocmates.com/articles/euphoria-speculation-simplified-to-a-single-tap (2025-07-07, L stale)
- Single WebSearch results page (titles only): theblock.com video, medium overview, bitget web3 guide, coinlaunch (conflicting audit status; not relied on)
- `docs/research/venues/evently.md` (sibling note, PayBox catalog result for MegaETH)

Fixtures: `docs/research/fixtures/euphoria-finance/` (DefiLlama protocol, Blockscout contract/balances/tx sample, tRPC 401 body, docs pages, bundle excerpts).

Suspicious content: none aimed at AI agents. The only agent-directed text is GitBook boilerplate ("For the complete documentation index, see llms.txt ... append `.md`"), which is benign and was only used to find page URLs.
