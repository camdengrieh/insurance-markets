# Resolvium (venue spec for the aggregator / arbitrage scanner)

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session (URL cited), M = secondary, small-model page summary or my inference, L = weak or stale. "NOT FOUND (searched: ...)" means not documented where I looked. All requests were unauthenticated GETs; nothing was signed, posted, paid or connected. WebSearch was unavailable (session budget used up), so no independent press or social coverage was read.

## 0. Verdict

- **Resolvium is a front end, not a venue.** It is a Next.js site on Vercel that trades Hyperliquid HIP-4 outcome markets through one builder code. It runs no matching engine, holds no funds and has no market data API of its own (H: https://www.resolvium.xyz/docs/what-is-hip-4, /docs/what-is-resolvium, /terms; production JS bundle).
- **Liquidity is 100% shared** with Hyperliquid HIP-4 (HyperCore order books). It is not an independent arbitrage leg. The right integration is the single `hyperliquid-hip4` adapter already specified in `docs/research/venues/hyperliquid-outcomes-hip-4.md` and `docs/research/venues/outcome-xyz.md`.
- **Usage is effectively nil.** DefiLlama attributes **$195 of volume, all-time**, to Resolvium's builder code and zero since 2026-05-29. I confirmed this independently from Hyperliquid's builder-fill files: only 3 days have any fills (14 IOC fills from one wallet, 2026-05-27 to 05-29, looks like testing), and none from 2026-05-30 to 2026-10-18 (section 9). Same-day control: Outcome.xyz's builder file for 2026-10-17 is 3.06 MB.
- **Still live?** The site answers HTTP 200 and shows "v0.8.2 / mainnet" (H, fetched 2026-10-19 00:55 UTC), and the underlying HIP-4 exchange is live (about $2.85M/day network volume, H, DefiLlama). But the product looks dormant: all docs and legal pages were last updated 2026-05-16 to 2026-05-26, and no retail volume has passed through its builder code for about 4.5 months. `still_live` = true for the website, effectively false for usage.
- **adapter_priority: skip.** Record the builder code only as an attribution tag (section 12).

## 1. Kind and market model

- Kind (H): front end for HIP-4 outcome markets on Hyperliquid. "Resolvium is a dedicated frontend purpose-built for HIP-4 trading ... layered on top of the underlying protocol" (docs/what-is-hip-4). DefiLlama lists it as category "Interface", tag "Hyperliquid HIP4 Builder", `doublecounted: true`, listed 2026-09-05T00:19Z (H, https://api.llama.fi/protocol/resolvium).
- Market model (H, same docs page; consistent with the sibling HIP-4 note): fully collateralised binary outcome shares on HyperCore spot order books (CLOB, price-time priority, no AMM). Each side is its own spot token; the two prices sum to about $1. Site labels the sides UP/DOWN.
- Shapes named in the docs: `priceBinary` (e.g. spec `class:priceBinary|underlying:BTC|expiry:20260519-0600|targetPrice:78985|period:1d`), `priceBucket` (multi-outcome ranges), and "freeform" prose questions (CPI, Fed decision). Cadences named: hourly, daily, weekly on BTC, ETH, SOL, HYPE and others (H, docs/what-is-resolvium).
- Tokenisation, tick, min size, `#<10*outcome+side>` coin ids: not Resolvium-specific; see the HIP-4 note. Resolvium's own docs give "ticks down to 0.001 cent" (H, home page) which is marketing copy; the HIP-4 note has the measured tick (5 significant figures).
- Resolvium deploys no markets of its own that I could find: NOT FOUND (searched: docs, terms, disclaimers, home page, JS bundle for "deployer"). The disclaimers page says Resolvium "only tracks" protocol changes (M, WebFetch summary).

## 2. Chains and collateral

- Chain: Hyperliquid L1 (HyperCore) (H, DefiLlama `chains: ["Hyperliquid L1"]`; docs).
- Collateral: **USDC**. "Each market's settlement asset is named in the `quoteToken` field of Hyperliquid's `outcomeMeta` response. Every live HIP-4 outcome currently reports USDC" (H, docs/what-is-hip-4, page dated 2026-05-26). USDH is described as being phased out. Read `quoteToken` at runtime anyway.
- Account: the user's ordinary Hyperliquid account; funds stay on Hyperliquid (H, docs/what-is-resolvium: "outcome orders use Spot USDC"). Deposit chains: NOT FOUND on Resolvium pages; fees page says only that depositing USDC from Arbitrum costs Arbitrum ETH gas (H). Hyperliquid's own deposit rules are in the sibling notes.
- Wallets: any EIP-1193 wallet (MetaMask, Rabby, Phantom, Coinbase Wallet named); ownership proved with a free SIWE signature (H, docs/what-is-resolvium).

## 3. Read API

- **Resolvium has no public API, SDK or documented websocket.** NOT FOUND (searched: /docs, /docs/what-is-resolvium, /docs/what-is-hip-4, /terms, home page, GitHub `gh search repos resolvium` returned nothing, `gh search code resolvium.xyz` hit only the DefiLlama adapter).
- The front end reads Hyperliquid directly from the browser: the bundle contains the Hyperliquid info client (`outcomeMeta`, `approvedBuilders`, `maxBuilderFee`, ...) and subscribes to `outcomeMetaUpdates` (H, `/_next/static/chunks/*.js`, read as text only, nothing executed). Hosts referenced: `api.hyperliquid.xyz`, `wss://api.hyperliquid.xyz/ws`, `api.hyperliquid-testnet.xyz`, `rpc.hyperliquid.xyz`.
- Resolvium's own same-origin routes are a social/session backend, not market data: `/api/auth/{nonce,verify,me,logout}`, `/api/alerts`, `/api/follows`, `/api/watchlist`, `/api/notifications[/read]`, `/api/push/subscriptions` (H, string literals in the bundle). Auth is a SIWE session. Not documented, not probed, and Terms 7(d) forbids systematic extraction from the Site beyond Hyperliquid's public API (H, /terms).
- Practical read path for the scanner: Hyperliquid's official public API (`POST https://api.hyperliquid.xyz/info`, `wss://api.hyperliquid.xyz/ws`). Endpoints, weights and fixtures are in `hyperliquid-outcomes-hip-4.md` section 4. I made no POST request here, so there is no live HyperCore fixture in this folder.
- Third-party read for Resolvium-attributed activity only (H): `GET https://api.llama.fi/summary/dexs/resolvium`, `/summary/fees/resolvium`, `/protocol/resolvium`; `GET https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/0x90536b9d94d65c9fabd372002bdfc2ef012231b2/{YYYYMMDD}.csv.lz4` (403 = no fills that day). CSV columns: time, user, coin, side, px, sz, crossed, special_trade_type, tif, is_trigger, counterparty, closed_pnl, twap_id, builder_fee.

## 4. Trade path

- Same as any Hyperliquid account: `POST https://api.hyperliquid.xyz/exchange` with signed L1 actions (see the HIP-4 note section 5). Resolvium adds nothing programmatic.
- What the front end does (H, /terms section 3, bundle): the browser generates a session-local **agent key**, the user signs one `approveAgent`, and later orders are signed silently by that key. Terms: the agent "can place and cancel orders" but "cannot withdraw funds, transfer to another address, or change account settings" and can be revoked from the wallet. Order types shown: market and limit (GTC, ALO) (H, docs/what-is-resolvium).
- Builder code attached by the front end: `BUILDER_ADDRESS = 0x90536B9D94d65C9fabd372002bdfc2Ef012231b2`, `BUILDER_FEE_ENABLED = true`, `BUILDER_FEE_TENTH_BPS = 0`, `BUILDER_MAX_FEE_RATE = "1%"` (H, constants in the production bundle; also DefiLlama's adapter, `factory/hyperliquid.ts`, "verified from Resolvium's Hyperliquid Mainnet approveBuilderFee action"). The code is optional for direct API trading and is only needed for volume to be attributed to Resolvium.

## 5. Can a PayBox wallet trade it?

**partial**, and only via Hyperliquid, not via Resolvium. Any PayBox EVM address is a valid Hyperliquid account (M, per the sibling notes); funding is a normal USDC transfer on Arbitrum; trading is off-chain EIP-712 signed actions, not transaction proposals. No reason to route through Resolvium, which would add a builder code and a geo gate for no benefit. Details and caveats (chainId 1337 typed data, agent-key hot wallet) are in `outcome-xyz.md` section 5 and `docs/research/06-paybox-platform.md`.

## 6. Fees

Three sources disagree; treat all as stale and read live rates.
- Fees page (last updated 2026-05-26): 0% Hyperliquid and 0% Resolvium for open, close and settlement "while the protocol fee waiver is in effect"; after testing, open is free, close and settle of winning shares pay Hyperliquid fees, no maker rebates; Resolvium "may introduce a small builder fee" later, capped and opt-in (H, https://www.resolvium.xyz/fees).
- Terms of Service (last updated 2026-05-16) section 4 says "Resolvium charges a 0.05% builder fee on closing trades" (H, /terms). This contradicts the fees page and the bundle constant `BUILDER_FEE_TENTH_BPS = 0`. The bundle is the most current (H) so the builder fee today is 0, but a 0.05% fee is documented as the intended rate.
- The claim "Hyperliquid charges zero on outcome markets" is stale: the sibling note records that Hyperliquid's own fee on outcomes started 2026-08-15 (fee on close/settle, no maker rebate, scaled per market) (M, from `hyperliquid-outcomes-hip-4.md` section 7, citing DefiLlama's adapter and the Hyperliquid fees page). Use the Hyperliquid schedule and add `0` to `0.05%` builder fee depending on the front end.
- No gas on Hyperliquid orders/cancels; Arbitrum ETH gas for deposit (H, fees page). Whoever pays: the trader.

## 7. Resolution and dispute risk

- Resolvium states settlement is automatic with "no curator, no dispute window, no manual resolution"; price markets settle on HyperCore **mark price** at expiry, described as "a median across Hyperliquid's book, an oracle EMA, and major CEX perpetual mids"; macro markets on "the named official release" (BLS CPI, FOMC statement) (H, docs/what-is-hip-4). Disclaimers page: Resolvium "cannot influence or override how a market settles", and settlement could be hit by extreme exchange outages or manipulation (M, WebFetch summary of /disclaimers, last updated 2026-05-16).
- Caveats: (a) "no manual resolution" is true for price series but not for event/freeform markets, where the deployer resolves from prose rules and the only backstop is validator slashing of the deployer's stake (H/M in `outcome-xyz.md` section 7 and the HIP-4 note). Resolvium's page does not say who deploys. (b) Docs conflict on mark price method (TWAP versus interpolation) inside Outcome's docs; see `outcome-xyz.md` section 7. (c) Hyperliquid's team can change parameters or pause trading (M, disclaimers).
- Resolution is the same for every front end, because it happens on HyperCore.

## 8. Geo, ToS, automation

- Terms of Service (H, https://www.resolvium.xyz/terms, last updated 2026-05-16): users 18+; "The Service is not offered to residents of the United States, the United Kingdom, OFAC-sanctioned territories, or any other jurisdiction where prediction markets, perpetual derivatives, or HIP-4 outcome contracts are restricted by law."
- Automation: no clause about bots, arbitrage or algorithms (H, whole terms read, 10 short sections). Prohibited use includes market manipulation, wash trading, interfering with Hyperliquid's order books, and "scrape, or systematically extract data from the Site beyond what is offered by Hyperliquid's public API" (section 7). Liability capped at builder fees paid in the prior 12 months. No arbitration or governing-law clause. Non-custodial: Resolvium is "not a counterparty".
- No IP geo-block was observed on the HTML (served from Vercel edge, HTTP 200 to a generic client). Not tested from other regions.
- Hyperliquid's own terms apply on top (see HIP-4 note section 9: US and Ontario excluded, plus an "Excluded Persons" list for outcome markets).

## 9. Liquidity (dated)

- **Resolvium builder-attributed volume (H, DefiLlama, data through 2026-10-17, fetched 2026-10-19):** 24h $0, 7d $0, 30d $0, all-time **$195** (2026-05-27 $29, 05-28 $58, 05-29 $108, zero on every later day through 2026-10-17); builder fees all-time $0. `https://api.llama.fi/summary/dexs/resolvium`.
- **Independent check (H, Hyperliquid stats-data, probed 2026-05-25 to 2026-10-18, 147 daily files):** files exist only for 2026-05-27 (2 fills), 05-28 (4), 05-29 (8). Every row has `builder_fee` 0, tif `Ioc`, one wallet (address not recorded here), alternating buy/sell on coins #1041, #1100, #1160, sum of price x size = $195.96. That matches DefiLlama exactly. Zero-fee builder fills are logged, so absence of files is meaningful (M: assumes the front end attaches the builder code on every order, which its constants indicate).
- Control (H): the Outcome.xyz builder file for 2026-10-17 exists at 3,059,131 bytes.
- Network HIP-4 (shared pool, H, DefiLlama "Hyperliquid Outcomes", data through 2026-10-17): 24h $2.85M, 7d $14.77M, 30d $43.89M, all-time $257.96M. That is where the liquidity is; Resolvium accounts for none of it.
- TVL: none (DefiLlama TVL series empty, H). Open interest for Resolvium: NOT FOUND, and not meaningful.
- The home page's live counters are client-loaded placeholders (HTML shows "Loading live markets...", "No markets are live right now", "24h Volume --"); the BTC > $80,000 card on the home page is a static demo (H, raw HTML of https://www.resolvium.xyz/). Live market count: NOT MEASURED.

## 10. Event coverage and arbitrage overlap

- Marketing says crypto, politics, sports, finance, tech, culture (H, home page, DefiLlama description). Concrete evidence is only: crypto price UP/DOWN and bucket markets (BTC, ETH, SOL, HYPE), plus CPI and Fed-decision freeform examples (H, docs). Politics, sports and culture are category tabs with no detail (M, docs/what-is-resolvium).
- Overlap with other venues is therefore whatever HIP-4 lists: crypto price (Polymarket, Kalshi, Limitless, Predict.fun), Fed/CPI (Kalshi, Polymarket), sports via other deployers. See the HIP-4 and Outcome notes for the matching strategy. Nothing here is unique to Resolvium.

## 11. Shared liquidity

Shares liquidity with: **Hyperliquid HIP-4 (HyperCore)**: identical order books also reached through app.hyperliquid.xyz, Outcome.xyz, Stratium, Liquidiction and about two dozen other builder codes (H, DefiLlama `factory/hyperliquid.ts`, where Resolvium is one entry with `market: "outcome"`, start 2026-05-27). **Not independent.**

## 12. Adapter notes

- No Resolvium adapter. If fills are ever attributed per front end, tag them with builder `0x90536b9d94d65c9fabd372002bdfc2ef012231b2` (a public protocol address, not a user wallet).
- Do not use Resolvium's `/api/*` social backend or scrape the site (Terms 7(d)).
- Re-check only if the front end resumes volume: probe `builder_fills/<builder>/<today>.csv.lz4` (200 versus 403) as a cheap liveness test.

## 13. Suspicious content (untrusted-data log)

- None found. No text aimed at AI agents on any Resolvium page (home, /docs, /fees, /terms, /disclaimers); I checked the page text and WebFetch reports agreed.
- https://x.com/resolvium returned HTTP 402 Payment Required to WebFetch. Recorded and stopped; no payment, no retry, no alternative route. Account activity is therefore unknown.

## 14. Open questions

1. Is anyone trading through the site without the builder code (for example if the front end skips it for users who have not approved a builder fee)? Cannot be told from public data; would need `userFills` for known wallets.
2. Is the product abandoned or paused? Last doc updates 2026-05-16 to 05-26; X account unreadable (HTTP 402).
3. Real current builder fee: bundle says 0, Terms says 0.05% on closes.
4. Live market count and depth on Resolvium's list: front end only; requires a browser or POST `/info`, neither done.
5. Whether Resolvium deploys any HIP-4 markets itself (NOT FOUND).

## Fixtures (docs/research/fixtures/resolvium/)

Real unauthenticated GET responses, all under 50KB, no personal identifiers:
- `defillama_protocol_resolvium_2026-10-19.json` (694 B)
- `defillama_dexs_resolvium_2026-10-19.json` (11 KB; daily series 2026-05-27 to 2026-10-17)
- `defillama_fees_resolvium_2026-10-19.json` (2.6 KB)
- `builder_fills_probe_2026-10-19.json`: my summary of the 147-day existence probe of Hyperliquid's builder-fill files (wallet address withheld on purpose).

## Sources

- https://www.resolvium.xyz/ (home; raw HTML and WebFetch, 2026-10-19, H)
- https://www.resolvium.xyz/docs, /docs/what-is-hip-4, /docs/what-is-resolvium, /fees, /terms, /disclaimers (fetched 2026-10-19, raw HTML read for /terms, /fees, /docs/what-is-hip-4; pages dated 2026-05-16 to 2026-05-26, possibly stale, H)
- https://www.resolvium.xyz/_next/static/chunks/*.js (23 home-page chunks, read as text only, nothing executed; builder constants and API route strings, H)
- https://api.llama.fi/protocol/resolvium, /summary/dexs/resolvium, /summary/fees/resolvium, /summary/dexs/hyperliquid-outcomes (H)
- https://github.com/DefiLlama/dimension-adapters, file factory/hyperliquid.ts (read with `gh api`, H)
- https://stats-data.hyperliquid.xyz/Mainnet/builder_fills/{builder}/{date}.csv.lz4 (existence probe and decompression of three tiny files with a local lz4 binary; aggregates only, H)
- https://x.com/resolvium (HTTP 402, not read)
- Project notes: docs/research/venues/hyperliquid-outcomes-hip-4.md, docs/research/venues/outcome-xyz.md, docs/research/06-paybox-platform.md (prior research, tags as written there)
