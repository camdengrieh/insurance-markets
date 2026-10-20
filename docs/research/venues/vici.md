# Vici (vici.market) - adapter spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Vici is live (2026) but is a **free-to-play, play-money** social prediction game. Users stake VXP, an app-minted ICRC points token that the Terms say has "no monetary value" and cannot be purchased, sold, withdrawn or redeemed. Prices therefore carry no information about real-money odds and there is nothing to arbitrage into or out of. **adapter_priority: skip** (at most P2 as a crowd-sentiment signal, and even that is weak because the order book is seeded by the operator's own market maker). Probably not worth an adapter; revisit only if the "Settlement" (real ckUSDC/ICP) domain is opened to users.

## Liveness

- Site vici.market returns 200; sitemap lists 1267 `/m/...` market URLs, lastmod 2026-09-27 (H, https://vici.market/sitemap.xml). Fixture: `docs/research/fixtures/vici/sitemap-sample.xml`.
- GitHub org ViciApp created 2026-03-08, vici-app last pushed 2026-10-18, latest commit seen 2026-10-14 (H, https://github.com/ViciApp, gh api). Active development. App repo created 2026-02-21.
- Operator: Wholesome Capital Limited, Hong Kong SAR (H, Terms in https://github.com/ViciApp/vici-app/blob/main/src/lib/constants/legal-docs.constants.ts).
- Org description: "Social prediction markets. Veni. Vidi. Vici." Org README: "Play-money today, built from day one on money-grade market infrastructure: a real order book, real settlement, and an on-chain audit trail." (H, https://github.com/ViciApp/.github/blob/main/profile/README.md)

## Kind and market model

- Kind: onchain-other (Internet Computer), consumer social app (SvelteKit front end + Juno satellite, with a Supabase migration under way) over a third-party on-chain clearing engine. (H, vici-app README and docs/migration-juno-to-supabase.md)
- Binary YES/NO markets only ("Binary Outcome Markets", swipe right = YES, left = NO). (H, vici-app README, VICI_ROADMAP.md)
- Pricing: central limit order book (CLOB) in the `icdc-core` clearing canister; displayed probability = best-bid/ask midpoint. Thin books are seeded with resting liquidity by an off-chain market maker registered as engine `eng_0` (repo `vici-maker`, not public in the org). (H, docs/ai/spec-driven-development/specs/2026-06-20-feat-maker-liquidity-disclosure.md)
- Outcomes are not tokenised. icdc-core is a central-counterparty (CCP) model that keeps positions internal to the clearing canister; "unlike ERC20 options" positions are not tokens and are portable only by a controlled novation protocol. (H, https://github.com/AntonioVentilii/icdc-core README)
- Series (markets) carry title, expiry_ns, optional start_ns, payoff_type, underlying, price precision, engine_id, oracle. Candid in registry.did / clearing.did. (H, vici-app `backend/src/declarations/*`)

## Chains and collateral

- Chain: Internet Computer only. No EVM, no Solana. (H)
- Production clearing canister `g2or7-caaaa-aaaaj-qqhoa-cai`, registry `g5pxl-pyaaa-aaaaj-qqhoq-cai` (H, `src/lib/constants/canisters.constants.ts`). VXP ledger `s7ux4-yyaaa-aaaam-qidha-cai`, index `swx4a-oqaaa-aaaam-qidgq-cai`, minter `syvri-vaaaa-aaaam-qidhq-cai` (H, vici-points canister_ids.json).
- The clearing engine supports four balance domains: `ViciXp` (loyalty points), `Social`, `Playground` (test assets), `Settlement` (real ckUSDC/ICP). (H, clearing.did `BalanceDomain`.) Vici's product stakes VXP: "Users make predictions on binary markets by staking VXP". (H, docs/ai/PRODUCT.md). The README line "collateral management for ICP and ckUSDC" is generic and is contradicted by the Terms and PRODUCT.md for the live product (M, possibly stale text).
- VXP: ICRC-1/2/3 token, 4 decimals, target max supply 1,000,000,000, minted into reserve wallets and handed out for onboarding, streaks, referrals, predictions. "Not money... not listed, not traded, not redeemable." (H, https://github.com/ViciApp/vici-points TLDR.md, TOKENOMICS.md). A second token VICI (vici-icrc repo) is a scarce reward/coordination token; not a settlement asset. TOKENOMICS says a stablecoin "settlement" layer for real-money markets is "a separate, future concern".

## Read API

- **Official public HTTP/REST API: NOT FOUND** (searched: vici.market sitemap/robots, /.well-known, GitHub org repos, README/PRODUCT/engine docs). The site is a JS single-page app; the HTML shell only carries per-market meta description and JSON-LD WebPage/Breadcrumb (no odds). Fixture: `fixtures/vici/market-page-jsonld.json`. (H)
- vici-app has a `backend/` (Bun/Postgres, routes `markets.ts`, `leaderboard.ts` etc.) for the "web2 backend mode"; no public docs, no base URL published, auth is Internet Identity / OAuth sessions. (M, repo tree only; routes not read, host not found.)
- On-chain read: the clearing and registry canisters expose public Candid query methods (any caller), e.g. clearing `list_series`, `list_orders({series_id})`, `aggregate_lean` (price history/volume), `stats`, `list_settled_series`, `list_leaderboard`, `list_collateral_assets`, `config`; registry `list_series_with`, `get_series`, `get_series_status`, `list_engines`, `get_oracle`. (H, method lists in `fixtures/vici/clearing-query-methods.txt` and `registry-query-methods.txt`, from vici-app's checked-in .did files; a deployed-interface mismatch is possible.) Reading needs an IC agent (CBOR over `https://icp-api.io/api/v3/canister/<id>/query` or ic-agent/agent-js), not a plain GET, so no unauthenticated GET sample was captured. Some methods such as `get_orders`, `get_positions` are caller-scoped (M).
- `GET https://g2or7-caaaa-aaaaj-qqhoa-cai.raw.icp0.io/metrics` returned `403 Forbidden: Controller only` (H, 2026-10-19). Certified `icp0.io/metrics` returned 503 (no certification).
- Websocket / streaming: NOT FOUND. Rate limits: NOT FOUND (IC query calls are subject to boundary-node throttling only).

## Trade path

- Trading is by authenticated IC principal calls to the clearing canister (the browser signs with an Internet Identity delegation; the canister checks `is_trading_authorized` in registry). (H, docs/migration-juno-to-supabase.md, registry.did). There is no REST order API and no signed-order scheme.
- A PayBox EVM/Solana wallet cannot trade this: no EVM contract, no tx proposals, no signed-order relay, and VXP cannot be bought or bridged. **paybox_reachable: no.**
- Even a hypothetical IC-agent integration would need an Internet Identity account (account creation is out of scope) and would breach the Terms' ban on bots (below).

## Fees

- Clearing engine has configurable `protocol_fee_ratio` (bps, treasury) and `insurance_fund_fee_ratio` (bps), with per-asset and per-domain overrides (H, clearing.did). Actual values for the VXP domain: NOT FOUND (could be read from the `config` query). The Terms say nothing is charged in VXP: "there are no VXP sinks... a stake is clearing collateral, not a fee" (H, docs/ai/economy.md). Win payout formula for the UI: `stake / p_win - stake` with a floor on `p_win` (H, economy.md; server is authoritative).

## Resolution

- Oracle-based settlement through icdc-core: oracle `VICI_ORACLE_V1`, with principals authorised by Vici roles ADMIN/SOLVER who call `settle_series`. i.e. centralised, operator-resolved. (H, docs/engine-integration.md.) Resolution criteria are written in each market's description (example: "YES if any G7 central bank announces a policy-rate change... per the bank's official statement"). Dispute process: NOT FOUND; operator may adjust or reset Virtual Items at any time without liability (H, Terms section 5).

## Geo / ToS / automation

- 18+, "available globally to eligible users", "void where prohibited". (H, Terms.) For US users: "free-to-play game with no monetary value... not a licensed gambling operator, a sweepstakes, or a regulated prediction or derivatives market".
- Acceptable use bans: "use bots, scripts or automated means to interact with the Service" and "reverse engineer, scrape, copy, resell or commercially exploit the Service". (H, Terms section 6.) robots.txt allows all and points to the sitemap (H).

## Liquidity

- No volume/OI/TVL figures published. Not measured: needs the clearing `stats` query (`open_interest`, `total_trades`, `total_users`). Marked NOT FOUND (searched: site, repos, docs). Any figure would be in VXP (valueless) anyway. 1267 listed markets as of 2026-09-27 (H, sitemap), many auto-generated/novelty (e.g. "Will a coach get sent to the stands?").

## Event coverage (rough, by sitemap slug keyword, 2026-09-27)

Sports / World Cup-style match markets dominate (about 324 slugs mention final/goal/World Cup terms), then crypto (about 35), politics (about 7), macro/central bank (about 8) (M, keyword counts of slugs). Topics nominally overlap Polymarket/Kalshi (World Cup, G7 rates, crypto, elections) but are mostly bespoke props with no matching contract elsewhere and no real-money price signal.

## Shared liquidity

Own order book on icdc-core, seeded by Vici's own market maker. Not shared with another venue, but also not an independent real-money leg since it is play money. icdc-core is a generic clearing layer ("neutral, non-monopolistic", Vici is engine `eng_0`) so other apps could use it; none identified (M).

## Adapter priority: skip

Play-money VXP, no public API, no EVM/Solana path, Terms forbid bots/scraping, operator-seeded prices and operator-run oracle. Only reason to keep an eye on it: the `Settlement` balance domain (ckUSDC/ICP) exists in the engine and the org describes a future real-money layer. Re-check in 6 months (watch vici-app PRODUCT.md and TOKENOMICS "settlement layer").

## Open questions

- Actual `config` fee values and `stats` (OI/volume) for the production clearing canister (needs an IC agent query).
- Is any public web2 backend host for vici-app/backend exposed, and is it documented?
- Whether the `Settlement` domain is live for any production market.

## Suspicious content

None seen. Read-only files fetched: README, PRODUCT.md, economy.md, engine-integration.md, specs, tokenomics, .did files, legal constants. I did not open the repos' AGENTS.md/CLAUDE.md agent-instruction files and followed nothing from them.

## Sources

- https://vici.market (H; HTML shell, sitemap.xml, robots.txt, a /m/ market page)
- https://github.com/ViciApp (org; H), https://github.com/ViciApp/vici-app (H), https://github.com/ViciApp/vici-points (H), https://github.com/ViciApp/vici-icrc (listed only), https://github.com/ViciApp/.github (H)
- https://github.com/AntonioVentilii/icdc-core README (H)
- Terms: vici-app `src/lib/constants/legal-docs.constants.ts` (H; the live /terms route is a JS app and was not rendered)
- Canister IDs: vici-app `src/lib/constants/canisters.constants.ts`; vici-points `canister_ids.json` (H)
- Fixtures: `docs/research/fixtures/vici/` (sitemap-sample.xml, market-page-jsonld.json, clearing-query-methods.txt, registry-query-methods.txt)
