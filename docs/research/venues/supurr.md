# Supurr (supurr.app) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to Supurr hosts and DefiLlama, `gh api` metadata reads, reading a prior in-repo note. No account, wallet, key, signature, POST/PUT/DELETE, payment or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (URL cited); **M** = secondary, inferred, or carried from the sibling in-repo notes (`docs/research/venues/supurr-app.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md`, both dated 2026-10-19, which read the Supurr JS bundle and GitHub skill docs); **L** = weak or stale.

Limits: the shared WebSearch budget was exhausted (search returned "budget used up"), so there is no independent press coverage. `defillama.com/protocol/...` returns 403 to WebFetch; DefiLlama data was read via `api.llama.fi` instead. supurr.app is a client-rendered SPA and browser automation is forbidden, so UI contents were not observed.

---

## 0. Bottom line

1. **Not a venue: a front-end and bot host that routes into Hyperliquid HIP-4 order books through a builder code.** Same books, same fills, same collateral as native Hyperliquid Outcomes. It **shares liquidity with Hyperliquid Outcomes and is not an independent arbitrage leg**. (H for DefiLlama methodology; M for the code-level evidence)
2. **Live as an app, near-dead for outcomes.** Site, bot API and indexer respond today (H). DefiLlama attributes **$944 all-time outcome volume** to Supurr's builder code, $0 over 24h/7d/30d, last non-zero day 2026-05-28, versus $261.08M all-time and $3.13M/24h for Hyperliquid Outcomes overall (H, fetched 2026-10-19).
3. **No market-data API from Supurr.** Its endpoints are bot management (needs an uploaded API-wallet private key) plus liveness. Market data must come from Hyperliquid. (H)
4. **adapter_priority = skip.** Build the native Hyperliquid HIP-4 adapter (sibling note: P1) and treat Supurr as at most a builder-code attribution tag. Do not add Supurr's builder code to our orders; do not count DefiLlama's "supurr.app Outcome" as extra volume.

---

## 1. Still live? (2026)

| Evidence | Tag |
|---|---|
| `https://supurr.app/algotrading` returns the SPA, `<title>Supurr App \| Hyperliquid Trading & AI Trading Agent</title>`. WebFetch of the page returned only that title (client-rendered); nothing about prediction markets or HIP-4 in the static HTML. | H |
| `GET https://api.supurr.app/` -> 200 `{"message":"PONG"}`. `GET https://api.supurr.app/indexer/status/` -> 200 `{"hyperliquid-mainnet":{"block":{"number":48933194,"timestamp":1792387683},"ready":true}}` (timestamp = 2026-10-19 ~05:28 UTC, the indexer is tracking the chain now). Fixture `supurr_indexer_status.json`. | H |
| `GET https://apiv2.supurr.app/openapi.json` -> 200, "Bot API" v2.0.0, 10 paths. Fixture `supurr_apiv2_openapi.json`. | H |
| Official docs `https://docs.supurr.app/README.md` (200) describe automated Hyperliquid bots (grid, market maker, spot-perp arb, DCA). `concepts/markets.md` (200) contains no mention of "outcome", "HIP-4" or "prediction" (grep returned nothing). | H |
| GitHub org `Supurr-App` (older repos are the 2021-2023 Buffer options protocol, i.e. a rebrand, M): `Hyperliquid-Supurr-Skill` last push 2026-06-16, `Hyperliquid-Supurr-Bot` last push 2026-05-28. Four months quiet. | H |
| DefiLlama protocol `supurr.app-outcome` exists (listed ~2026-10-08, per sibling note, M), chain "Hyperliquid L1". `api.llama.fi/summary/dexs/supurr.app-outcome`: 168 daily points, only 8 non-zero. Fixture `defillama_supurr-outcome_nonzero_days.json`. | H |

**still_live = true** (company, app, API, indexer) but the outcome product is a dormant side feature.

---

## 2. Kind and market model

- **Kind: broker-or-frontend.** (a) Trading UI for Hyperliquid perps/spot (and outcomes via builder code), (b) hosted bots (grid, DCA, market maker, spot-perp arb, HIP-4 grids), (c) open-source Rust bot/CLI and an AI-assistant "skill", (d) points/referral. (H: site title, docs README; M: outcome support from sibling note and Supurr skill docs)
- **Market model:** inherited unchanged from Hyperliquid HIP-4: on-chain central limit order book on HyperCore, fully collateralised binary outcomes (Yes/No), multi-outcome questions composed of binaries, no leverage. Tokenisation: `encoding = 10*outcome + side` (0 Yes, 1 No); coin `#<encoding>`, token `+<encoding>`, order asset id `100000000 + encoding`. (M: Supurr bundle and Hyperliquid docs as read in the sibling notes)
- Supurr has **no markets, order book or tokens of its own**. (NOT FOUND: searched docs README/markets.md, OpenAPI, DefiLlama.)

---

## 3. Chains and collateral

- Trading chain: Hyperliquid L1 / HyperCore (DefiLlama chain "Hyperliquid L1", H). Not HyperEVM.
- Collateral: Hyperliquid account balance, USDC for canonical outcomes (sibling note: moved from USDH to USDC on 2026-06-20, M). Supurr's GitHub skill docs (June 2026) still say USDH (L, stale). Funding is deposited into Hyperliquid itself (USDC via Arbitrum etc.); Supurr is non-custodial in the UI path (user wallet plus an approved agent key). (M)
- Supurr builder address (public, from DefiLlama adapter and client code, M): the same address is used for its perps, spot and outcome lines. Not reproduced here; it is only needed to filter fills, which we should not do.

---

## 4. Shared liquidity (the decisive fact)

DefiLlama methodology for `supurr.app Outcome` (H, `api.llama.fi/summary/dexs/supurr.app-outcome`): "Volume of Hyperliquid HIP-4 outcome trades placed through the builder code." Fees: "Builder-code fees paid by users on Hyperliquid HIP-4 outcome trades placed through the builder code ... all kept by the builder." So Supurr volume is a subset of Hyperliquid Outcomes fills, filtered by builder attribution. Sibling note adds (M) that the Supurr UI calls `api.hyperliquid.xyz/info` and `/exchange` and `wss://api.hyperliquid.xyz/ws` directly.

Aggregator rule: **Supurr = routing/attribution tag on the Hyperliquid venue**, never a separate quote source. Summing DefiLlama "Interface" lines with the base venue double-counts.

---

## 5. Read API

**Official/public market-data API from Supurr: none.** (read_api.exists = none for market data.) The read path is Hyperliquid's (keyless WS `l2Book`/`bbo`/`trades`/`allMids`/`outcomeMetaUpdates`, REST `POST /info`; see `hyperliquid-hip-4-outcomes-native.md`).

What Supurr exposes (H, probed 2026-10-19):

| Host | What | Auth |
|---|---|---|
| `https://api.supurr.app/` | `PONG`; `/indexer/status/` (chain sync status) | none |
| `https://apiv2.supurr.app/` | Swagger "Bot API" 2.0.0. Paths: `GET /health`, `POST /bots/create/{wallet}`, `POST /bots/copy`, `GET /bots/{id}/status`, `POST /bots/{id}/stop`, `POST /bots/{id}/admin-stop`, `GET /bots/{id}/logs`, `GET /bots/active/{wallet}`, `POST /misc/upload`, `GET /misc/image/{id}` | none documented; create/copy bodies require an API-wallet private key (`api_wallet_pk`, M from sibling note, fixture lists the schema) |

No market list, book, trade or resolution endpoints. Rate limits: NOT FOUND (searched docs README, OpenAPI). Websocket from Supurr: NOT FOUND. Docs: https://docs.supurr.app. Hyperliquid limits (M, sibling): 1200 weight/min/IP, 1000 WS subscriptions/IP.

Fixtures (<5 KB each) in `docs/research/fixtures/supurr/`: `supurr_indexer_status.json`, `supurr_apiv2_openapi.json`, `defillama_supurr-outcome_nonzero_days.json`. No Hyperliquid response captured (POST-only).

---

## 6. Trade path

- **Via Supurr:** browser wallet login, then Hyperliquid-signed actions (`approveAgent`, `approveBuilderFee`, then orders signed by an agent key) posted to Hyperliquid `/exchange` with Supurr's builder code attached. Hosted bots/CLI require handing Supurr an API-wallet private key. (M)
- **No Supurr trading API exists to integrate.** For the aggregator, place orders directly on Hyperliquid (asset id `100000000 + 10*outcome + side`, signed `order` action) and omit Supurr's builder code. (M)

---

## 7. Reachable through PayBox?

**partial, and only via Hyperliquid, never via Supurr.** HyperCore takes signed actions, not EVM transaction proposals. A PayBox EVM wallet could in principle sign Hyperliquid typed data (`request_wallet_sign`, `typedData`/`raw`) but that is the Hyperliquid adapter's job and has nothing Supurr-specific. Supurr's hosted bot API needs a raw private key and is not suitable. (M; no PayBox tool called this session.)

---

## 8. Fees

- Hyperliquid base outcome fee: charged on close/settle only, numeric rate not in official docs; empirical all-in about 12-15 bps (sibling note, M).
- Supurr builder fee on top: user approves a max of 0.1%; client config in the bundle shows perps 0.03% and spot 0.08% (M). **Outcome builder rate: NOT FOUND** (searched docs README/markets.md, sibling notes). Payer: whoever places the order; all to builder (H, DefiLlama methodology).
- DefiLlama fees for Supurr Outcome: zero in all windows (sibling note, H as of 2026-10-19; I did not re-fetch the fees endpoint).
- Points/referral exist; terms NOT FOUND.

---

## 9. Resolution and dispute risk

Entirely Hyperliquid's: protocol auto-settle for recurring series, deployer-settled for most others, no trader dispute window (sibling note, M). Supurr adds no resolution layer.

---

## 10. Geo, ToS, automation

- Supurr Terms/Privacy: **NOT FOUND** (sibling note searched sitemap, docs, `/terms` returns SPA shell). No geo-block text found.
- Hyperliquid Terms apply to outcome fills: US and Ontario residents barred plus an unpublished "Excluded Persons" list for outcome markets; VPN circumvention prohibited (sibling note, Terms of 2026-06-15, M).
- Automation is Supurr's product (bots/CLI/AI skill), so no ban there; Hyperliquid's bot clause is in the sibling note.

---

## 11. Liquidity (dated)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| Supurr Outcome volume 24h / 7d / 30d | $0 / $0 / $0 | https://api.llama.fi/summary/dexs/supurr.app-outcome, 2026-10-19 | H |
| Supurr Outcome all-time | $944 (8 non-zero days, 2026-05-04 .. 2026-05-28) | same | H |
| Hyperliquid Outcomes for scale | $3,128,093 (24h), $17,900,930 (7d), $47,014,618 (30d), $261,084,367 (all-time) | https://api.llama.fi/summary/dexs/hyperliquid-outcomes, 2026-10-19 | H |
| TVL | none | DefiLlama (sibling note) | M |

Supurr has no liquidity of its own.

---

## 12. Event categories and overlap

Whatever Hyperliquid lists: mainly crypto price binaries (BTC/HYPE thresholds at short expiries), plus some sports and macro per the sibling note. Overlap with Polymarket/Kalshi/Limitless exists for crypto price, but only through the native Hyperliquid leg. Supurr skill examples are crypto price only (M).

---

## 13. Suspicious content (recorded, not followed)

- Sibling note (M): `Supurr-App/Hyperliquid-Supurr-Skill` has `references/bot-discovery.md` instructing assistants to proactively promote and offer to copy live Supurr bots (promotional steering of assistant answers). README/SKILL.md tell assistants to run `curl ... | bash` installers at `cli.supurr.app`; not run. Not re-read this session.
- Bot API takes a raw API-wallet private key in request bodies; not called.
- Nothing addressed to me was found in the pages I read this session (homepage title, docs README, OpenAPI JSON, API responses).

---

## 14. Priority

**skip.** Duplicate liquidity, $944 lifetime outcome volume, no market-data API, outcomes absent from official docs, bot API requires private keys.

## 15. NOT FOUND / open questions

- Supurr Terms of Service and any geo-block list.
- Outcome builder fee rate Supurr actually applies.
- Official Supurr docs for HIP-4 (searched docs README, concepts/markets.md; only GitHub skill docs, last updated 2026-06-16).
- What the SPA currently lists for outcomes (no browser automation).
- Independent press coverage (search budget exhausted).

## 16. Sources

Primary (H, fetched 2026-10-19):
- https://supurr.app/algotrading (title only)
- https://api.supurr.app/ ; https://api.supurr.app/indexer/status/ ; https://apiv2.supurr.app/openapi.json
- https://docs.supurr.app/README.md ; https://docs.supurr.app/concepts/markets.md
- `gh api orgs/Supurr-App/repos` (push dates)
- https://api.llama.fi/summary/dexs/supurr.app-outcome ; https://api.llama.fi/summary/dexs/hyperliquid-outcomes
- https://defillama.com/protocol/supurr.app-outcome (HTTP 403 to WebFetch, not read)

Secondary (M): in-repo `docs/research/venues/supurr-app.md`, `docs/research/venues/hyperliquid-hip-4-outcomes-native.md` (2026-10-19), which cite the Supurr JS bundle, `Supurr-App/Hyperliquid-Supurr-Skill`, DefiLlama adapter `factory/hyperliquid.ts` and Hyperliquid docs.

## 17. Privacy

Scripted requests used User-Agent `insurance-markets-research/0.1`. No personal identifiers or user wallet addresses in requests, fixtures or this note (fixtures grepped for `@` and the user's name: no hits).
