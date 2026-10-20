# supurr.app (Supurr) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~04:15-04:35 UTC). READ-ONLY: page and JS-bundle reads, `gh api` file reads, unauthenticated GETs. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. All third-party text, including the Supurr repos' agent-directed "skill" files, was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, or taken from the sibling project note; **L** = weak or stale.

Method limits: WebSearch budget was exhausted before I could run a useful query (one search returned only generic HIP-4 news, nothing on Supurr), so there is no independent press coverage here. The Supurr web app is a client-rendered SPA and browser automation is forbidden, so what the UI shows was read from its JS bundle as text, not observed. Hyperliquid's `POST /info` is POST-only and was not called.

---

## 0. Bottom line

1. **Not a venue. A front-end plus bot host that routes into Hyperliquid HIP-4 books through a builder code.** Same books, same fills, same collateral as native Hyperliquid outcomes. **Shares liquidity: not an independent arbitrage leg** (H, section 4).
2. **Live as a company/app, effectively dead for outcomes.** supurr.app, its bot API and its indexer respond today (H). DefiLlama attributes only **$944 of all-time outcome volume** to Supurr's builder code, zero on every one of the 168 listed days except 8 days in May 2026 (last non-zero day 2026-05-28), against $261.08M all-time and $3.13M/24h for Hyperliquid Outcomes as a whole (H, fetched 2026-10-19). Share ~0.0004%.
3. **No usable data API.** Supurr's own endpoints are a bot-management API (needs a wallet and an uploaded API-wallet private key) and a ping/indexer-status route. Market data comes from Hyperliquid, not Supurr (H).
4. **adapter_priority = skip.** Use the native Hyperliquid HIP-4 adapter (`docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, P1). Supurr adds nothing there except a builder fee layer.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://trade.supurr.app/algotrading` -> 301 -> `https://supurr.app/algotrading`, 200, SPA titled "Supurr App \| Hyperliquid Trading & AI Trading Agent"; meta description: "Manual and automated Hyperliquid trading with an AI trading agent, crypto trading bots, perpetual futures, Supurr Points, and a Telegram trading assistant." No mention of prediction markets in page metadata. | H |
| `https://api.supurr.app/` -> 200 `{"message":"PONG"}`; `https://api.supurr.app/indexer/status/` -> 200 `{"hyperliquid-mainnet":{"block":{"number":48929376,"timestamp":1792383928},"ready":true}}` (timestamp = 2026-10-19 04:25 UTC, i.e. the indexer is tracking the chain now). Fixtures `supurr_api_root_ping.json`, `supurr_indexer_status.json`. | H |
| `https://apiv2.supurr.app/` serves Swagger UI; `/openapi.json` (3.2 KB, "Bot API" v2.0.0) is public. Fixture `supurr_apiv2_openapi.json`. | H |
| GitHub org `Supurr-App` (formerly Buffer Finance repos, e.g. Buffer-Protocol v1-v3 2021-2023, i.e. a rebrand of an older options protocol, M): `Hyperliquid-Supurr-Skill` last push 2026-06-16, `Hyperliquid-Supurr-Bot` last push 2026-05-28 ("v0.1.0"). Four months quiet. | H (dates) |
| DefiLlama lists three Interface lines under parent `supurr.app`: Perps (id 7293, builder start 2025-09-19), Spot (id 9053) and **Outcome (id 9054, listed 2026-10-08, tag "Hyperliquid HIP4 Builder")**, chain "Hyperliquid L1". All three have `tvl: []`. `https://api.llama.fi/protocols` filtered on slug, fixture `defillama_protocols_supurr_entries.json`. | H |
| Official docs `https://docs.supurr.app` (Docsify, README) list "Supported Markets": Perpetuals, HIP-3 DEX, Spot. **HIP-4 outcomes are not listed in the official docs** (`concepts/markets.md` also silent). | H |
| Sitemap `https://supurr.app/sitemap.xml` has 10 URLs (home, /trade/BTC-USD, /algotrading, /points, /agent, /referral, /vs, /vs/hypx, /vs/dextrabot, /vs/minara); the crawl `lastmod` strings I saw (2026-06-15) are 4 months old. No outcome/prediction URL. | H / L (stale) |

Verdict: **still_live = true** (site, API, indexer) but the outcome-markets product is a dormant side feature (section 6).

---

## 2. Kind and market model

- **Kind:** broker-or-frontend. Supurr = (a) trading UI on top of Hyperliquid perps/spot/outcomes with wallet login via Privy (Privy appears in the bundle, M), (b) hosted algorithmic bots (grid, DCA, market maker, spot-perp arb, plus HIP-4 grids), (c) an open-source Rust bot/CLI and an AI-assistant "skill", (d) points/referral programme. (H: site, docs README, GitHub READMEs)
- **Market model:** inherited unchanged from Hyperliquid HIP-4: on-chain central limit order book on HyperCore, fully collateralised binary outcomes, Yes/No sides, no leverage. Tokenisation (H, Supurr's own code and skill docs, consistent with Hyperliquid docs per the sibling note): `encoding = 10*outcome + side`, side 0 = Yes, 1 = No; coin `#<encoding>`, token `+<encoding>`, order asset id `100000000 + encoding`. The site bundle contains exactly this mapping (`c2r=e=>{const t=e%10;return{outcomeId:Math.floor(e/10),side:t}}`, `a2r=1e8`) and a UI route form `outcome-<encoding>`. Fixture `site_bundle_builder_config_extract.txt`.
- Multi-outcome "questions" and the `class:priceBinary|underlying:...|expiry:...|targetPrice:...` description parser are handled in the UI (H, bundle). Supurr's UI hard-codes `tick_size 0.001, lot_size 1, min_qty 1, min_notional 10` for outcomes (H, bundle). That conflicts with live Hyperliquid books (5-significant-figure prices, one-tick spread 0.00001 in the sibling note), so treat Supurr's constants as UI defaults, not venue rules (M).
- No Supurr-specific markets, no own order book, no own tokens (NOT FOUND: searched docs README/markets, sitemap, bundle routes, DefiLlama).

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Trading chain | Hyperliquid L1 / HyperCore (DefiLlama chain "Hyperliquid L1"). | H |
| Collateral / quote | Supurr's UI default quote constant is `USDC` (`KA="USDC"`). Supurr's GitHub skill tutorial (updated 2026-06-16) and OUTCOME_CONTEXT.md (2026-03-10) say outcomes quote in **USDH**: stale against the sibling note's finding that canonical markets moved to USDC on 2026-06-20. | H (code) / L (stale docs) |
| Funding | User deposits into Hyperliquid itself (USDC via Arbitrum etc.); Supurr is non-custodial for funds in the UI path (user wallet + approved agent). Bundle also references Relay/Across bridge URLs and MoonPay (M). | M |
| Builder fee approval | `approveBuilderFee` typed-data signed by the user's wallet, `signatureChainId 0x3E7`, `maxFeeRate` = `builderFee/100 %` = **0.1%**, builder `0x36BE02A397e969E010cCBD7333f4169f66B8989F` (Supurr's public builder address; the same address DefiLlama uses for all three Supurr lines). | H (bundle + DefiLlama adapter `factory/hyperliquid.ts`) |

---

## 4. Shared liquidity (the decisive fact)

**Shares liquidity with Hyperliquid HIP-4 Outcomes. Not an independent leg.** Evidence (all H):
- DefiLlama methodology for `supurr.app Outcome`: "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code." The adapter entry is `"supurr-outcome": { builder: "supurr-perps", market: "outcome", start: "2026-05-02" }`, i.e. Supurr is a filter over Hyperliquid fills tagged with Supurr's builder address (`gh api repos/DefiLlama/dimension-adapters/contents/factory/hyperliquid.ts`).
- Supurr's UI calls `https://api.hyperliquid.xyz/info` with `type: "outcomeMeta"`, `l2Book`, `allMids`, `spotClearinghouseState`, `maxBuilderFee`, and `wss://api.hyperliquid.xyz/ws`, and posts orders to `https://api.hyperliquid.xyz/exchange` (bundle strings).
- Supurr's own bot code reads fills and quotes from Hyperliquid (OUTCOME_CONTEXT.md, `exchange-hyperliquid` crate).

Implication for the aggregator: model Supurr as a **routing/attribution tag** (builder code) on the Hyperliquid venue, never as a separate quote source. Summing DefiLlama's "Interface" lines with the base venue double counts.

---

## 5. Read API

**Official/public market-data API from Supurr: none.** The market-data read path is Hyperliquid's (see the sibling note: keyless WS `l2Book`/`bbo`/`trades`/`allMids`/`outcomeMetaUpdates`, REST `POST /info`, limits 1200 weight/min/IP and 1000 WS subscriptions/IP).

What Supurr itself exposes (H):

| Host | What | Auth | Verdict for us |
|---|---|---|---|
| `https://api.supurr.app/` | `{"message":"PONG"}`; `/indexer/status/` (chain-sync status); `/trades/` -> 404 `{"detail":"Not Found"}` on GET; `/health` -> 404 | none | Liveness only |
| `https://apiv2.supurr.app/` | Swagger "Bot API" 2.0.0, `servers[0].url = http://localhost:3002`. Paths: `GET /health`, `POST /bots/create/{wallet}` (body requires `config` and **`api_wallet_pk`**), `POST /bots/copy` (requires `api_wallet_pk`), `GET /bots/{id}/status`, `POST /bots/{id}/stop`, `POST /bots/{id}/admin-stop`, `GET /bots/{id}/logs`, `GET /bots/active/{wallet}`, `POST /misc/upload`, `GET /misc/image/{id}` | none documented | Bot control only. **Hosted bots receive the user's API-wallet private key**; not something an agent should send. No market, book, trade or resolution endpoints. |
| `https://bot.supurr.app/` | 404 `{"status":"error","code":404,"message":"Application not found"}` | - | n/a |
| `https://indexer.supurr.app/`, `https://oracle.supurr.app` | Named in bundle/skill (oracle: candles for backtests, `/v1/candles/day`, `/v1/presign`). Not probed beyond what is listed. | - | Perp backtest data; not outcome data (M) |

Docs: `https://docs.supurr.app` (Docsify; pages `strategies/*.md`, `concepts/markets.md`, `concepts/quote-currencies.md`, `api/bot-creation.md`); skill repo `https://github.com/Supurr-App/Hyperliquid-Supurr-Skill` (SKILL.md, STRATEGY_API.md, tutorials/prediction-markets.md). Rate limits for Supurr hosts: NOT FOUND (searched docs, OpenAPI, skill docs). Websocket from Supurr: NOT FOUND.

Fixtures saved (all < 5 KB) in `docs/research/fixtures/supurr-app/`: `supurr_api_root_ping.json`, `supurr_indexer_status.json`, `supurr_apiv2_openapi.json`, `defillama_supurr-outcome_trimmed.json`, `defillama_protocols_supurr_entries.json`, `defillama_hyperliquid-outcomes_totals_for_comparison.json`, `site_bundle_builder_config_extract.txt`. No Hyperliquid response was captured here (POST-only; see the sibling note's `fixtures/hyperliquid-hip-4-outcomes-native/`).

---

## 6. Trade path

- **Via Supurr UI:** browser wallet / Privy login; the page signs L1 `order` actions itself. It first signs `approveAgent` (agent name "SupurrAgent") and `approveBuilderFee`, then trades with an agent key, posting `{"action":..., "nonce", "signature", "isFrontend":true}` to `https://api.hyperliquid.xyz/exchange`. Perps orders carry `builder:{b:<Supurr builder>, f: builderCharge.perps*10}` = f 30 (tenths of a basis point) = 0.03%; the bundle defines `builderCharge:{perps:3, spot:8}` (spot 0.08%); **no separate outcome rate is defined and I could not tell which charge the outcome path applies** (H code, outcome rate NOT FOUND). (H)
- **Via Supurr bots / CLI:** `supurr init --address 0x... --api-wallet 0x...`, `supurr new grid --asset BTC --type outcome --outcome-id N --side yes ...`, `supurr deploy`. Hosted bots need the API-wallet private key uploaded to Supurr (`api_wallet_pk`). (H: SKILL.md, OpenAPI)
- **For an aggregator:** place orders on Hyperliquid directly (asset id `100_000_000 + 10*outcome + side`, signed `order` action to `/exchange`) and **omit the Supurr builder code**. There is no reason to route through Supurr. No Supurr trading API exists to integrate (H).

---

## 7. Reachability from a PayBox wallet

**Verdict: partial, and only through Hyperliquid, never through Supurr.**
- Supurr's trade path is a browser-signed Hyperliquid action, not an EVM transaction proposal. PayBox could in principle sign the same typed data (`approveAgent`, `approveBuilderFee`, orders via the phantom-agent digest) with `request_wallet_sign`, but that is the Hyperliquid adapter's job and has nothing Supurr-specific (see sibling note section 6, M here since I did not re-verify PayBox this session).
- Not reachable: Supurr's hosted bot API (needs a raw private key).
- No PayBox tool was called in this session.

---

## 8. Fees

- **Hyperliquid base outcome fee** (charged on close/settle only; numeric rate not in official docs): see sibling note section 7 (M here).
- **Supurr builder fee on top:** max approvable 0.1% (`approveBuilderFee maxFeeRate "0.1%"`); perps order charge 0.03%, spot 0.08% in the client config (H, bundle). Outcome charge: NOT FOUND (searched bundle, docs README/markets, skill docs). Whoever places the order pays; fee goes entirely to the builder (DefiLlama methodology: "all kept by the builder", H).
- DefiLlama fees for Supurr Outcome: 24h/7d/30d/all-time all 0 as of 2026-10-19 (H, `https://api.llama.fi/summary/fees/supurr.app-outcome`).
- Supurr Points / referral: exist (`/points`, `/referral` routes, H); terms NOT FOUND.

---

## 9. Resolution mechanism and dispute risk

Entirely Hyperliquid's: protocol auto-settle for recurring series, deployer-settled for the rest, no trader dispute window (sibling note section 8, M here). Supurr adds no resolution layer and no dispute path. Its own tutorial warns "Explain settlement/expiry risk" and notes prices snap to 0 or 1 near expiry (H, skill docs).

---

## 10. Geo, ToS, automation

- Supurr's own Terms/Privacy: **NOT FOUND** (searched: sitemap, `docs.supurr.app` `terms.md`/`privacy.md` -> 404, `supurr.app/terms` -> returns the SPA shell, bundle strings; the bundle only contains Privy's generic "By signing up, you agree to our terms and privacy policy"). No geo-block or restriction text found in the bundle (searched for sanction/OFAC/United States/region strings).
- Because the fills happen on Hyperliquid, Hyperliquid's Terms apply to trading outcome markets: US and Ontario residents barred plus an unpublished "Excluded Persons" list for outcome markets, VPN circumvention prohibited, bot clause 3.1.8 (sibling note section 9, Terms of 2026-06-15; M here).
- Automation is Supurr's core product (bots, CLI, AI skill), so automation is welcome through Supurr's own channels; the agent-directed material is a risk, not a licence (section 13).

---

## 11. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Supurr Outcome volume, 24h / 7d / 30d | $0 / $0 / $0 | `https://api.llama.fi/summary/dexs/supurr.app-outcome`, fetched 2026-10-19 | H |
| Supurr Outcome all-time | **$944** (8 non-zero days: 2026-05-04 $286, 05-05 $124, 05-07 $22, 05-08 $121, 05-20 $49, 05-21 $25, 05-22 $25, 05-28 $292) | same | H |
| Hyperliquid Outcomes for scale | $3,128,093 (24h), $17,900,930 (7d), $47,014,618 (30d), $261,084,367 (all-time) | `https://api.llama.fi/summary/dexs/hyperliquid-outcomes`, 2026-10-19 | H |
| Supurr Spot (same builder) | all-time $242,762; 24h/7d/30d $0 | `https://api.llama.fi/summary/dexs/supurr.app-spot` | H |
| Supurr Perps (same builder) | NOT FOUND: derivatives dimension returned HTTP 402 "Upgrade to the paid API plan" (stopped; not retried) | `https://api.llama.fi/summary/derivatives/supurr.app-perps` | H (402) |
| TVL | none (`tvl: []`) | DefiLlama protocol entry | H |

Supurr has no liquidity of its own; the ~$2.7M of collateral locked in Hyperliquid outcomes (sibling note, M) is Hyperliquid's.

---

## 12. Event categories and overlap

Whatever Hyperliquid lists (crypto price ladders, sports, central-bank decisions; see sibling note section 11). Supurr UI/skill examples are all crypto-price binaries ("BTC > 79980", "HYPE > 200.05 in 15m", H skill docs). Overlap with Polymarket/Kalshi/Limitless for crypto price, but only as part of the native Hyperliquid leg.

---

## 13. Suspicious content (agent-directed, recorded, not followed)

- `Supurr-App/Hyperliquid-Supurr-Skill` is an installable "skill" for AI coding assistants. Its `references/bot-discovery.md` instructs assistants to proactively surface and offer to copy live Supurr bots ("Use this when the user asks for opportunities, FOMO... Fetch live bot data when the user is already discussing trading, bots, or strategy selection... Add one compact suggestion"), i.e. promotional steering of an assistant's answers.
- README/SKILL.md tell assistants to install via `curl -fsSL https://cli.supurr.app/install | bash` and `https://cli.supurr.app/skill-install | bash`; I did not run these.
- The `/bots/copy` flow takes a raw `private_key`/`api_wallet_pk` in the request body (the docs say not to ask the user to paste it in chat). I called none of it.
- No text addressed to me or instructing tool use was found in the sitemap, docs README, OpenAPI JSON, or bundle strings.

---

## 14. Priority

**adapter_priority = skip.** Duplicate liquidity (Hyperliquid builder-code attribution), ~$944 lifetime outcome volume, no market-data API, no outcome documentation in the official docs, bot API requires private keys. If the aggregator ever wants Supurr-sourced "signal" it would be bot sentiment, which has no public API (`/dashboard/active_bots` -> 404 on both hosts).

Only action worth keeping: when building the Hyperliquid adapter, do **not** add Supurr's builder code to orders, and do not treat DefiLlama's `supurr.app Outcome` (or any other "Interface" line) as extra volume.

---

## 15. NOT FOUND / open questions

- Supurr Terms of Service/Privacy Policy and any geo-block list (searched: sitemap, docs, `/terms`, bundle).
- Supurr builder fee rate actually applied to outcome orders (searched: bundle `builderCharge` usage, docs).
- Any Supurr documentation of HIP-4 outcome support in the official docs site (searched: docs README, `concepts/markets.md`; only GitHub skill docs cover it, last updated 2026-06-16).
- Supurr perps volume (DefiLlama 402 paywall).
- Whether the UI at `/algotrading/:market` or `/trade/outcome-<n>` currently lists live outcomes (SPA; no browser automation allowed).
- Independent press/web coverage of Supurr (WebSearch budget exhausted; the single search made returned nothing about Supurr).

---

## 16. Sources

Primary (H):
- Site: https://supurr.app/algotrading (via 301 from https://trade.supurr.app/algotrading); https://supurr.app/sitemap.xml; client bundle https://supurr.app/assets/index-Ce8JL1cg.js (read as text, not executed)
- Docs: https://docs.supurr.app/README.md ; https://docs.supurr.app/concepts/markets.md ; https://docs.supurr.app/api/bot-creation.md
- APIs: https://api.supurr.app/ ; https://api.supurr.app/indexer/status/ ; https://apiv2.supurr.app/ ; https://apiv2.supurr.app/openapi.json ; https://bot.supurr.app/
- GitHub: https://github.com/Supurr-App/Hyperliquid-Supurr-Skill (README.md, SKILL.md, tutorials/prediction-markets.md, references/bot-discovery.md); https://github.com/Supurr-App/Hyperliquid-Supurr-Bot (OUTCOME_CONTEXT.md, commit log); `gh api orgs/Supurr-App/repos`
- DefiLlama: https://defillama.com/protocol/supurr.app-outcome (HTTP 403 to WebFetch; data read through the API instead); https://api.llama.fi/protocols ; https://api.llama.fi/summary/dexs/supurr.app-outcome ; https://api.llama.fi/summary/fees/supurr.app-outcome ; https://api.llama.fi/summary/dexs/supurr.app-spot ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes ; adapter https://github.com/DefiLlama/dimension-adapters/blob/master/factory/hyperliquid.ts
- Hyperliquid probe: `GET https://api.hyperliquid.xyz/info` -> 405 (POST-only; not called)

Secondary (M/L):
- Sibling project note for the underlying venue: `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (2026-10-19)
- Search results page on HIP-4 in general (CoinDesk, Across, Arrakis forensic on HIP-4 bots, 2026): none mention Supurr (L)

## 17. Privacy

All scripted requests used User-Agent `insurance-markets-research/0.1`. The one script I wrote was grepped for `@` and personal names before running (no hits). No wallet address of the user was read or written; the only address recorded is Supurr's public builder code address from public client code. Fixtures and this note were scanned afterwards for emails, names and home-directory paths (none).
