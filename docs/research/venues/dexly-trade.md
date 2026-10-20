# Dexly Trade - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch of dexly.trade and Hyperliquid docs, `curl` GET of DefiLlama's public API, GitHub raw reads via `gh api`, and GET of Hyperliquid's public builder-fill archive. No account, wallet, key, signature, POST/PUT/DELETE, payment, or PayBox money/signing tool was used. Third-party text was treated as untrusted data. WebSearch budget ran out after the first query, so everything below comes from pages fetched directly.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary source, page summary by a small model, or my own computation; **L** = weak or stale.

---

## 0. Bottom line

1. **Live, but only as a front-end.** Dexly Trade (dexly.trade) is a self-custodial trading interface for Hyperliquid (perps, spot, tokenised stocks, copy trading, and a HIP-4 outcome tab). It has no markets, order book, oracle, or contracts of its own (H, sources 1, 2, 12).
2. **Not an independent liquidity venue.** Every Dexly outcome trade is a fill on Hyperliquid's HIP-4 books, tagged with Dexly's builder code. DefiLlama files it as category "Interface", tag "Hyperliquid HIP4 Builder", `doublecounted: true` (H, sources 3, 4). An aggregator must model the venue as **Hyperliquid HIP-4** and treat Dexly as at most a `routing_frontend` attribute.
3. **Almost no volume of its own.** First-hand from Hyperliquid's builder-fill archive: 683 outcome fills, 28 distinct wallets, $22.7k notional in 5.5 months (2026-05-02 to 2026-10-18); the last 30 days had 16 fills, 2 wallets, $1.3k. Hyperliquid HIP-4 overall did $3.13M on 2026-10-18 (DefiLlama). Dexly is about 0.01% of HIP-4 flow (H data, M ratio).
4. **No API, no docs, no SDK.** The site has no developer docs; the only Dexly GitHub repos are a DefiLlama fork and small curated lists / CLIs (H). The integrable surface is Hyperliquid's own free API, which is covered by project notes (section 9).
5. **adapter_priority = skip.** Duplicate liquidity, no API of its own, negligible volume. Build the Hyperliquid HIP-4 adapter instead; optionally record Dexly's builder address as a known `builder` label.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| dexly.trade home, `/market`, `/faq` and a prediction-markets landing page `https://dexly.trade/hyperliquid-prediction-markets` return content; sitemap `lastmod` 2026-10-19T03:26Z (https://dexly.trade/sitemap.xml) | H |
| Terms of Service "Last updated: 27 July 2026" (https://dexly.trade/legal/terms) | H |
| DefiLlama protocol `dexly-trade-outcome` (id 8977) listed 2026-10-08T22:17Z (`listedAt` 1791497877), category "Interface", chain "Hyperliquid L1" (https://api.llama.fi/protocol/dexly-trade-outcome) | H |
| Dexly outcome fills in Hyperliquid's builder-fill archive on 2026-10-06, 10-08, 10-15, 10-17 (most recent 2026-10-17; fixture `builder_fills_outcome_daily_aggregate.json`) | H |
| DefiLlama `dexly-trade-outcome` daily volume: 2026-10-15 $270, 2026-10-17 $760, every other day since 2026-10-09 $0 (earlier non-zero days in the last 30: 09-19 $200, 10-06 $77, 10-08 $21) | H |
| Dexly `/status` page rendered only "Systems Unknown / Loading..." in WebFetch (client-rendered) | L |

Verdict: **still_live = true**, in the sense that the interface exists and still occasionally routes outcome trades. Usage is near zero.

---

## 2. Kind and market model

- **Kind:** broker-or-frontend (interface / aggregator UI) over Hyperliquid. Dexly's own words: "Dexly is a trading interface for Hyperliquid"; "Dexly does not hold user funds, manage private keys or seed phrases" (https://dexly.trade, H). Its audit disclosure repo: "Dexly is a self-custodial interface for trading on Hyperliquid. We do not hold, custody, or have withdrawal access to user funds" (https://github.com/dexlytrade/audit, README, "Last updated: July 2026", H).
- **Market model (all inherited from HIP-4, H):**
  - Binary Yes/No share pairs, $0 to $1, fully collateralised in USDC, no leverage, no funding, no liquidation; price you pay is max loss (https://dexly.trade/learn/hip-4-outcome-markets-hyperliquid, updated 2026-06-22; and the official HIP-4 page).
  - On-chain central limit order book on HyperCore, with Yes and No books **merged** ("an order to buy Yes at price p is equivalent to an order to sell No at price 1-p") (https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets).
  - Multi-outcome "bucket" markets are also offered; categorical sets are "questions" where exactly one outcome settles to Yes.
- **Tokenisation (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids):** `encoding = 10*outcome + side`; coin `#<encoding>`, token `+<encoding>`, order asset id `100_000_000 + encoding`. Confirmed in the wild: Dexly's builder fills carry coins like `#250`, `#1020`, `#5340` (fixture `builder_fills_outcome_rows_sample_redacted.csv`).
- **Where Dexly shows them:** the landing page `/hyperliquid-prediction-markets` says users buy YES or NO shares priced $0-$1 with USDC and lists sports, crypto and macro examples; it does not use the term HIP-4 and sends "Start trading" to `/download` (the mobile app). The web `/market` page lists only Favorites / Perps / Stocks / Commodities / Indices / FX / AI / Spot, with no outcome tab (WebFetch, M: summary by a small model, client-rendered). Volumes printed on the landing page ($273.2K, $58.4K, ...) are Hyperliquid's 24h market volumes, not Dexly's (M, inference from the DefiLlama figures below).

---

## 3. Chains and collateral

- Settlement chain: Hyperliquid L1 (HyperCore); DefiLlama `chains: ["Hyperliquid L1"]` (H, source 3). Collateral and settlement currency USDC (H, Dexly learn article and Hyperliquid docs; "You do not need HYPE to open an outcome position").
- Funding is Hyperliquid's: USDC deposit via Arbitrum (wallet-connected accounts) or other routes for embedded accounts; see `hyperliquid-hip-4-outcome-markets.md` section 3 (H there).
- Two account types: bring-your-own wallet (MetaMask or any WalletConnect wallet) or an embedded account via Privy (keys split with Shamir's Secret Sharing, reassembled in a TEE) (H, https://github.com/dexlytrade/audit).
- Dexly deploys no contracts and holds no funds (H).

---

## 4. Read API

**Dexly has no public read API or docs.** `robots.txt` disallows `/api/` for all agents (H, https://dexly.trade/robots.txt). No docs or API link appears on the home page, FAQ, or Terms ("The Terms have no dedicated bot or API section"). `docs`, `developers`, `openapi` links: NOT FOUND (searched: home page link list, FAQ, sitemap, `/legal/terms`, GitHub org `dexlytrade`). The status page names a "Dexly API" component, which is an internal backend, not a documented interface (L).

Everything an aggregator can read comes from upstream (documented in `docs/research/venues/hyperliquid-hip-4-outcome-markets.md`, H there, re-checked here at the level of the official docs):

- REST `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `outcomeTemplates`, `settledOutcome`, `outcomeDeployerLimits`, `l2Book`, `allMids`, ...); WebSocket `wss://api.hyperliquid.xyz/ws` (`l2Book`, `bbo`, `trades`, `outcomeMetaUpdates`). Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api (H).
- Limits (H, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits): REST 1200 weight/min/IP (`l2Book`/`allMids` weight 2, other info 20); WS max 10 connections, 30 new connections/min, 1000 subscriptions, 2000 messages/min.
- **Not live-verified here:** `/info` is POST-only and the ground rules forbid POST, so I captured no `outcomeMeta` response. The earlier note captured live WS shapes; its fixtures sit in `docs/research/fixtures/hyperliquid-hip-4-outcome-markets/`.
- **Dexly-specific data that is public (H):** the builder-fill archive `https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder_address_lowercase}/{YYYYMMDD}.csv.lz4` (GET, LZ4-compressed CSV, anonymous). Columns confirmed live: `time,user,coin,side,px,sz,crossed,special_trade_type,tif,is_trigger,counterparty,closed_pnl,twap_id,builder_fee`. Dexly's builder address per the DefiLlama adapter is `0x22047776933bC123D0602ed17aaF0D2f5647DF0C` (key `dexly-trade` in https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts, `gh api` read). One missing day: 2026-07-08 returned HTTP 403. Useful only to attribute flow, not to price anything.
- **DefiLlama (H, GET, no key):** `https://api.llama.fi/protocol/dexly-trade-outcome`, `/summary/dexs/dexly-trade-outcome`, `/summary/fees/dexly-trade-outcome`. Shapes saved as fixtures (section 11).

---

## 5. Trade path (programmatic)

- **Dexly offers none.** No order API, SDK, or MCP. Orders go from the Dexly app (iOS / Android / web) to Hyperliquid, signed by the user's wallet or by a browser-generated **Agent Wallet** that "cannot withdraw funds and can be revoked" (Terms s.7, H).
- **The real path is Hyperliquid's** `POST https://api.hyperliquid.xyz/exchange`: outcome orders are normal spot-style `order` actions with asset id `100_000_000 + 10*outcome + side`; split/merge/negate are `{"type":"userOutcome", ...}` (H, official exchange-endpoint page and asset-ids page). Signing: L1 actions are EIP-712 phantom-agent signatures (domain `Exchange`, chainId 1337); user actions (`approveAgent`, `approveBuilderFee`, `withdraw3`) use `HyperliquidTransaction:*` typed data (H via the earlier note's read of the official Python SDK).
- **Builder code (the only Dexly-specific mechanism):** each order may carry `builder: {b: address, f: tenths-of-bp}`; the user must first sign `approveBuilderFee` (max rate) from the main wallet (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes). An aggregator that trades directly on Hyperliquid **omits the builder field** and pays no Dexly fee.

---

## 6. Reachability from a PayBox wallet

**Verdict: partial (via Hyperliquid, not via Dexly).**

- Dexly itself: no. Nothing to call; the app is a closed mobile/web UI and `/api/` is disallowed to crawlers.
- Hyperliquid HIP-4 via PayBox: signed orders are possible in principle. `request_wallet_sign` supports EIP-712 `typedData` and `raw`, one EVM address works on every `eip155:*` chain, and PayBox lists Hyperliquid (HyperEVM, `eip155:999`) in its chain catalog (`docs/research/06-paybox-platform.md`, H there). A PayBox EVM wallet could sign `approveAgent` and per-order `Agent` typed data; an agent-wallet key would be needed for speed. EVM transaction proposals reach HyperCore only through HyperEVM's CoreWriter (split/merge/negate documented; outcome limit orders not confirmed) (H in `hyperliquid-hip-4-outcome-markets.md` section 6).
- PayBox's own `hyperliquid` plugin is read-only spot browsing (H in the same note).
- Base, Ethereum, BNB, Polygon and Solana wallets can only **fund** Hyperliquid (Arbitrum USDC deposit / CCTP), not trade outcomes natively.

I did not call any PayBox tool for this venue; the above is carried over from existing project notes and flagged as such.

---

## 7. Fees

- **Hyperliquid base fee on outcomes (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees, section "Outcome tokens"):** fees are charged only when closing or settling a position, not when opening; no maker rebates on outcomes. The numeric base rate is **NOT FOUND in the official docs** (the HIP-4 page still says fees are zero "for initial testing", which DefiLlama's methodology contradicts: "Hyperliquid charged no outcome fee of its own before 15 Aug 2026"). All-in empirical band on HIP-4 is about 11-25 bps of volume (earlier note, M).
- **Dexly builder fee (H data, M inference):** Dexly's Terms s.8 say it "may charge a builder fee", set on-chain with a user-approved maximum, and the FAQ says "Hyperliquid's standard trading fees plus a small builder fee" without a rate (H). In the builder-fill archive, every outcome fill that carried a fee had `builder_fee / (px*sz)` of **0.0005** (median and maximum; min 0.00026 on a few rounding-limited tiny fills), i.e. **5 bps of notional**, charged on all 162 sells and on 79 of 521 buys; 442 buys paid zero. Total over 683 outcome fills: **$5.69 builder fees on $22.7k notional**, matching DefiLlama's $5.93 lifetime (H data, M reading).
- **Who pays:** the user pays Hyperliquid's fee plus the builder fee (the builder fee goes to Dexly). Direct API trading on Hyperliquid avoids the 5 bps.
- Dexly's headline "no platform fees" applies to copy trading only; its Terms still allow a builder fee (H).

---

## 8. Resolution mechanism and dispute risk

Identical to Hyperliquid HIP-4, because Dexly resolves nothing:

- Protocol-settled recurring series (e.g. daily BTC binary at 06:00 UTC) settle automatically to the interpolated HyperCore mark price: Yes iff `markPrice0 + (settlementTime - t0)/(t1 - t0) * (markPrice1 - markPrice0) >= targetPrice` (H, https://hyperliquid.gitbook.io/hyperliquid-docs/trading/contract-specifications, "Recurring outcomes"). Mainnet instances were seen to use a 60-second TWAP of the perp mark for some ladders (M, earlier note).
- Other markets are deployer-settled from validator-approved templates (deployer-actions page carries a "Testnet-only" banner, H). No trader-initiated dispute window is documented anywhere I read (NOT FOUND; searched: HIP-4 page, deployer-actions page, Dexly Terms, Dexly learn article). See `hyperliquid-hip-4-outcome-markets.md` section 8 for the sourced detail (M/H there).
- Dexly adds its own risk layer: front-end bugs. Its audit repo says "Our app shipping a bug ... is the risk our unaudited code carries, and it is real", and that nothing of Dexly's was audited (H, https://github.com/dexlytrade/audit).

---

## 9. Geo, ToS, automation (H, https://dexly.trade/legal/terms, "Last updated: 27 July 2026")

- **Restricted:** persons located in, resident in, or citizens of the **US**, North Korea, Iran, Syria, Cuba, and the Crimea, Donetsk and Luhansk regions; anyone on UN/UK/EU/OFAC sanctions lists; Dexly may add jurisdictions at any time (s.5). Minimum age 18 (s.4).
- **Prohibited (s.15):** market manipulation (wash trading, spoofing, layering), "scraping at scale and circumventing rate limits", misrepresenting location "including using a VPN or proxy to defeat a restriction".
- **Automation:** no bot/API section. Browser-generated agent wallet (s.7) and copy trading (s.14) are permitted. FAQ: no KYC; users are responsible for their own jurisdiction.
- Hyperliquid's own Terms add a US + Ontario bar and an unpublished "Excluded Persons" list for outcome markets (earlier note, H there).
- Note the Terms never mention outcome or prediction markets (H); the FAQ does ("Dexly lets you trade prediction markets alongside perpetuals, spot, and tokenized stocks", M, page summary).

---

## 10. Liquidity (dated) and overlap

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Dexly outcome volume, all-time (2026-05-02 to 2026-10-18) | **$23,529** (DefiLlama); $22,727 (my sum of `px*sz` over 683 fills; one day, 2026-07-08, missing) | https://api.llama.fi/summary/dexs/dexly-trade-outcome, fetched 2026-10-19; builder-fill archive | H |
| Dexly 7d / 30d / 24h | $1,030 / $1,328 / $0 (24h to 2026-10-18) | same | H |
| Dexly lifetime builder fees | $5.93 (DefiLlama) / $5.69 (mine) | https://api.llama.fi/summary/fees/dexly-trade-outcome | H |
| Dexly users | 28 distinct wallets all-time; 2 in the last 30 days (16 fills) | builder-fill archive, my count | H data |
| Monthly notional (mine) | May $540; Jun $13,637; Jul $3,947; Aug $851; Sep $2,667; Oct 1-18 $1,084 | fixture `builder_fills_outcome_daily_aggregate.json` | H data |
| TVL | none (non-custodial interface; DefiLlama `tvl: []`) | source 3 | H |
| Hyperliquid HIP-4 total, for scale | $3,128,093 on 2026-10-18; 7d $17.9M; 30d $47.0M; all-time $261.1M | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, fetched 2026-10-19 | H |
| Dexly share of HIP-4 | about 0.009% of all-time volume ($23.5k of $261.1M) | my division | M |

**Event categories** are whatever Hyperliquid lists (sports, crypto price, macro / Fed, stocks and commodities); Dexly's landing page cites a 2026 World Cup winner, a Spain vs Brazil match, Bitcoin above $100,000, an ETH weekly close, a Fed rate cut, and CPI versus forecast as examples (M, may not be live listings). Overlap with other venues (Polymarket, Kalshi, Limitless, etc.) is exactly that of Hyperliquid HIP-4: see `hyperliquid-hip-4-outcome-markets.md` section 11.

**Shares liquidity with another venue: YES, entirely.** Dexly's outcome flow *is* Hyperliquid HIP-4 flow, matched against Hyperliquid's resting orders (counterparties in the fill archive are ordinary Hyperliquid wallets). It is **not** an independent arbitrage leg. Dexly is one of dozens of HIP-4 front-ends with builder-coded flow in the DefiLlama adapter (35 `market: "outcome"` builder entries plus per-builder `-outcome` listings) (`dexly-trade-outcome`, `outcome-xyz`, `phantom-outcome`, `based-app-outcome`, `hyperdash-outcome`, ...), all of which should collapse into one adapter keyed on Hyperliquid (H, adapter source read via `gh api`).

---

## 11. Adapter notes for the aggregator

1. **Do not build a Dexly adapter.** Map `venue = hyperliquid_hip4`; optionally store `frontend = dexly-trade` and `builder_address = 0x2204...DF0C` as an attribution label if order flow is ever routed through it. A trader who uses the Hyperliquid API directly pays no Dexly fee.
2. Persist DefiLlama's id (`dexly-trade-outcome`, 8977) in the registry as an alias that maps to `hyperliquid_hip4`, so re-discovery by DefiLlama does not create a duplicate venue.
3. If someone wants front-end attribution, the builder-fill archive is the only per-fill source; it is daily and delayed, and its `user`/`counterparty` columns hold third-party wallet addresses (redacted in the fixtures).
4. Dexly as a signal source: negligible (28 wallets lifetime). Hyperliquid itself is the signal source.

### Fixtures saved (`docs/research/fixtures/dexly-trade/`)

| File | What | Live? |
|---|---|---|
| `defillama_protocol_dexly-trade-outcome.json` | raw 912-byte DefiLlama protocol record (category "Interface", tag "Hyperliquid HIP4 Builder", `listedAt` 1791497877) | live GET, 2026-10-19 |
| `defillama_dexs_summary_dexly-trade-outcome_trimmed.json` | methodology, totals, last 30 days of daily volume | live GET, trimmed |
| `defillama_fees_summary_dexly-trade-outcome_trimmed.json` | same for fees | live GET, trimmed |
| `defillama_dexs_summary_hyperliquid-outcomes_trimmed.json` | upstream venue totals + last 14 days, for scale | live GET, trimmed |
| `builder_fills_outcome_rows_sample_redacted.csv` | 50 of 683 Dexly outcome fills, wallets truncated to 8 chars | live GET + LZ4 decode, redacted |
| `builder_fills_outcome_daily_aggregate.json` | my daily aggregation of all 683 outcome fills | derived |

No `outcomeMeta` / `l2Book` fixture: Hyperliquid REST needs POST, which the ground rules forbid.

---

## 12. Suspicious content

None found. Pages fetched contained no instructions aimed at AI agents. `robots.txt` has explicit allow rules for several AI crawlers (ClaudeBot, GPTBot, etc.) while disallowing `/api/`; that is crawler policy, not an instruction to me.

## 13. Open questions

- Does the Dexly app show outcome markets to all users, or only some regions/builds? The web `/market` page shows none (client-rendered; WebFetch may miss it).
- Exact Hyperliquid base fee for outcomes on 2026-10-19 (the `userFees` info call is POST; not captured).
- Why one archive day (2026-07-08) returned HTTP 403.

## Sources

1. https://dexly.trade (home; WebFetch 2026-10-19) - H
2. https://dexly.trade/hyperliquid-prediction-markets, /market, /faq, /status, /learn/hip-4-outcome-markets-hyperliquid, /robots.txt, /sitemap.xml - H for raw files (robots, sitemap), M for WebFetch page summaries
3. https://api.llama.fi/protocol/dexly-trade-outcome - H
4. https://api.llama.fi/summary/dexs/dexly-trade-outcome and /summary/fees/dexly-trade-outcome - H
5. https://api.llama.fi/summary/dexs/hyperliquid-outcomes and /summary/fees/hyperliquid-outcomes - H
6. https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts (read with `gh api`; builder address, `dexly-trade-outcome` listing, start 2026-05-02) - H
7. https://dexly.trade/legal/terms (Last updated 27 July 2026) - H via WebFetch summary (M for exact wording, quoted phrases are from the tool output)
8. https://github.com/dexlytrade/audit (README, July 2026) and org repo list `https://api.github.com/orgs/dexlytrade/repos` - H
9. https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{YYYYMMDD}.csv.lz4 (2026-05-02..2026-10-18) - H
10. https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets(.md), .../for-developers/api/asset-ids, .../api/rate-limits-and-user-limits, .../api/exchange-endpoint(.md), .../api/websocket/subscriptions(.md), .../api/hip-4-deployer-actions(.md), .../trading/fees(.md), .../trading/builder-codes(.md), .../trading/contract-specifications(.md) - H
11. Existing project notes: `docs/research/venues/hyperliquid-hip-4-outcome-markets.md` (and its fixtures), `docs/research/06-paybox-platform.md` - H/M as tagged there
12. WebSearch "Dexly Trade Hyperliquid HIP-4 outcome markets" (one query; budget then exhausted) - M
