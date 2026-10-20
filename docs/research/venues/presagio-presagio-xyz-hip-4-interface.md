# Presagio (presagio.xyz, HIP-4 interface) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes ~02:15-02:20 UTC). READ-ONLY: unauthenticated GETs of public pages and static JS (read as text, nothing executed), one DefiLlama GET, one GET of the official HIP-4 doc page. No account, access code, email sign-up, wallet, key, signature, POST/PUT/DELETE, payment or PayBox money/signing tool was used. I did not fetch `/app`, `/en/app` or `/api/*` (robots.txt disallows them). WebSearch budget was exhausted mid-session, so no independent news/social search for Presagio was possible (recorded under NOT FOUND).

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary, inferred, or taken from a sibling note in this repo; **L** = weak or stale.

Name collision (do not merge): a different "Presagio" (Omen 2.0 on Gnosis Chain, Swapr) appears in the SoK catalogue. This note is only about presagio.xyz. I did not research the Gnosis project.

---

## 0. Bottom line

1. **Presagio is not a venue. It is an invite-only, Spanish-first front end over Hyperliquid HIP-4 outcome markets.** It has no order book, liquidity, contracts, tokens or API of its own. Everything it shows comes from Hyperliquid's public API (H: CSP `connect-src 'self' https://api.hyperliquid.xyz https://api.hyperliquid-testnet.xyz`; client code posts to `https://api.hyperliquid.xyz/info`).
2. **Liquidity is 100% shared with Hyperliquid HIP-4, so it is NOT an independent arbitrage leg.** Counting it would double-count the same books. The adapter for this ecosystem is the Hyperliquid HIP-4 adapter (see `docs/research/venues/hyperliquid-outcomes-hip-4.md`, rated P1 there), not a Presagio adapter.
3. **No public API, no docs, no terms page.** The only first-party backend routes are access-gate/login routes (`/api/gate`, `/api/request-access`, `/api/wallet/login`, `/api/wallet/nonce`), which robots.txt disallows and which I did not call. Nothing to integrate.
4. **The "0 live markets" in the discovery hint is a rendering artefact.** The landing page server-renders a count-up widget at 0; the page payload carries `to: 208` and the client eases 0 -> 208 over 1.2 s (H, fixture). So the page advertises 208 live markets (provenance of the 208 unknown: could be live or hard-coded, M).
5. **The mainnet client is read-only by build flag.** `TRADING_ENABLED` is set equal to `IS_TESTNET` in the shipped bundle, so order placement is only wired in testnet builds (H, fixture). Presagio's marketing also says "read-only interface" (H).
6. **adapter_priority = skip.** Reasons: front end only, duplicate liquidity, invite-gated, no API, no trade path of its own. Mine it only as a (weak) signal that Spanish-language HIP-4 distribution exists; the economics are on Hyperliquid.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://presagio.xyz/` | HTTP 200, Next.js on Vercel, dynamic (`cache-control: private, no-cache`), 2026-10-19 02:16 UTC. Title "Presagio - acceso por invitacion", BETA badge | H (fixture `landing_headers_and_live_counter.txt`) |
| Page-embedded live-market counter | SSR shows 0, payload `to:208`, count-up component confirmed in static chunk | H |
| Sitemap `lastmod` | newest 2026-07-20 (11 URLs: home, /en, /blog, 8 posts dated 2026-07-13 and 2026-07-20) | H (fixture `sitemap.xml`) |
| Privacy policy "Ultima actualizacion" | 2026-07-20 | H |
| Content since 2026-07-20 | None seen: ~3 months without a new post or policy change | H (absence in sitemap) |
| Listed on DefiLlama (`api.llama.fi/protocols`, 8,758 rows, fetched 2026-10-19) | **No row** whose name, slug, url or description contains "presagio" (35+ other HIP-4 "X Outcome" front ends are listed per `14-platform-of-platforms.md`) | H (my script) |

Verdict: **still_live = true** for the website (beta, invite-only), but nothing shows real usage: no DefiLlama attribution, no public volume, no post-July content. The underlying Hyperliquid HIP-4 venue is live (sibling note: live books on 2026-10-19 00:4x UTC, M here).

---

## 2. Kind and market model

- **Kind:** `broker-or-frontend`, consumer web UI (H: site text "interfaz de solo lectura sobre datos publicos de Hyperliquid"). Features advertised: live probabilities (World Cup, Fed, crypto), prices "directos de Hyperliquid, refrescados al segundo", Spanish-first UI with English toggle (/en), shareable "tarjetas" of winning predictions (H).
- **Market model = Hyperliquid HIP-4 (not Presagio's):** fully collateralised binary outcomes, Yes/No tokens on a merged CLOB on HyperCore; `encoding = 10*outcome + side`, read coin `#<encoding>`, order asset id `100_000_000 + encoding`; categorical via "questions"; scalar via fractional settlement (H on the official HIP-4 page for merged-book and settleFraction mechanics: https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets ; the encoding is from the sibling note, M here; Presagio's own blog gives the same encoding, H that the blog says so).
- Presagio's own catalogue, filters or curation logic: **NOT FOUND** (the app is behind the gate; `/app` is robots-disallowed and was not fetched).

---

## 3. Chains and collateral

- Inherited from Hyperliquid: trading on HyperCore (not an EVM chain), collateral USDC (official `settledOutcome` sample and the sibling note; Presagio's blog agrees: "el colateral migro a USDC", M since it is a third-party blog and dated 2026-07-13).
- Presagio's wallet layer: EIP-6963 browser-wallet discovery (`eth_requestAccounts`) and a sign-message login against its own backend (`/api/wallet/nonce`, `/api/wallet/login`) (H, bundle). Chains supported for deposits through Presagio: **NOT FOUND**; it does not appear to custody anything.
- Testnet build exists (`NEXT_PUBLIC_HL_TESTNET`, `api.hyperliquid-testnet.xyz`) (H, bundle).

---

## 4. Read API

- **Presagio's own read API: none (official or unofficial).** No docs link, no OpenAPI, no public endpoints. Sitemap, robots and the landing page expose none. The only `/api/*` routes in the shipped landing chunk are the access gate and wallet login (H, fixture). robots.txt: `Allow: /`, `Allow: /blog`, `Disallow: /app`, `Disallow: /en/app`, `Disallow: /api` (H, fixture). Do not scrape it.
- **Data source to use instead: Hyperliquid directly.** REST `POST https://api.hyperliquid.xyz/info` (`outcomeMeta`, `l2Book`, `allMids`, `candleSnapshot`, `settledOutcome`), WebSocket `wss://api.hyperliquid.xyz/ws` (`l2Book`, `trades`, `bbo`, `activeAssetCtx`, `allMids`, `outcomeMetaUpdates`), no auth, per-IP limits (1200 weight/min REST; WS 1000 subscriptions, 10 connections). Full detail, live-captured shapes and rate limits are in `docs/research/venues/hyperliquid-outcomes-hip-4.md` and its fixtures in `docs/research/fixtures/hyperliquid-outcomes-hip-4/` (`ws_l2Book_yes_no_pair.json`, `ws_trades_outcome_redacted.json`, `ws_activeSpotAssetCtx_sample.json`, `ws_allMids_outcome_keys.json`). I did not recapture them (Hyperliquid `/info` is POST-only; POST is forbidden for this task).
- **Fixtures saved for Presagio itself** (`docs/research/fixtures/presagio-presagio-xyz-hip-4-interface/`): `robots.txt`, `sitemap.xml`, `landing_visible_text_es_en.txt`, `landing_headers_and_live_counter.txt`, `client_bundle_config_excerpt.txt`. There is no Presagio JSON API response shape to confirm.
- Presagio's developer blog post (https://presagio.xyz/blog/api-hip-4-guia-desarrolladores, 2026-07-13) states Hyperliquid has no HIP-4-specific docs and that the author reverse-engineered the API. That is **stale/wrong as of now**: the official gitbook has HIP-4, asset-ids and exchange-endpoint pages (H, official HIP-4 page links the asset-ids page). Treat the blog as a lead only.

---

## 5. Trade path

- **Through Presagio: none on mainnet.** The shipped client sets `TRADING_ENABLED = IS_TESTNET` (H, bundle excerpt), and the site calls itself read-only. In the testnet build, the flow is: connect browser wallet -> `ExchangeClient.approveAgent({agentAddress, agentName:"presagio"})` signed by the user's wallet -> a **random agent private key is generated in the browser and stored in `localStorage`** under `presagio.agent.<t|m>.<address>` -> orders signed by that agent key (H, bundle). This is the standard Hyperliquid agent-wallet pattern (nothing Presagio-specific to integrate). Security note for our plugin design: do not copy the pattern of keeping an agent key in browser storage.
- **Real trade path = Hyperliquid directly** (signed L1 actions to `POST /exchange`, EIP-712 phantom-agent scheme, agent wallets, optional builder code). See the sibling note, section 5. Not duplicated here.
- **Access gating:** an invite code (`POST /api/gate`) or an email login; request-access form stores an email in Brevo (EU) (H: privacy policy). Not exercised.

### Reachability from a PayBox wallet

**partial, and only via Hyperliquid, not via Presagio.**
- Via Presagio: **no**. No API, no programmatic trade path, mainnet trading disabled, invite-gated.
- Via Hyperliquid: partial, per the sibling note (HyperCore is not an EVM chain; no EVM transaction-proposal path for orders; needs typed-data signing / an approved agent key; USDC funding via Arbitrum is reachable; PayBox has an official `hyperliquid` plugin that is spot-browse only). I did not re-verify the PayBox side this session.

---

## 6. Fees

- **Presagio platform fee: NOT FOUND** (no fee page, no terms page; sitemap lists none).
- **Builder code (Presagio's revenue mechanism):** the bundle reads `NEXT_PUBLIC_BUILDER_ADDRESS` (default empty) and `NEXT_PUBLIC_BUILDER_FEE_TENTH_BPS` with **code default "100" = 100 tenths of a basis point = 10 bps = 0.10%** (H, bundle excerpt). The deployed value is unknown (env-injected at build time). Presagio's blog says builder fees on HIP-4 are taken on **sell orders only** and that users must pre-approve a max fee (`approveBuilderFee` appears in the bundle) (blog: M; the sell-side rule is also stated on the official HIP-4 page: "builders earn builder fees on sell orders that specify their builder code", H).
- **Hyperliquid protocol fees:** the official HIP-4 page still says "Fees are currently zero for outcome markets for initial testing" (H, fetched 2026-10-19, undated and stale). Sibling note: DefiLlama indexer shows Hyperliquid's own outcome fee starting 2026-08-15, third-party guide says about half of spot rates, empirical all-in about 11-25 bps incl. builder fees, deployer fee scale can multiply the base (M). Presagio's July blog says zero fees (stale).

---

## 7. Resolution mechanism and dispute risk

Entirely Hyperliquid's: protocol-settled recurring crypto price markets (deterministic, HyperCore mark price, interpolated, daily 06:00 UTC); validator-voted "canonical" markets; deployer-settled template markets with slashing but no trader dispute window (sibling note section 8, M here). Presagio adds no resolution layer; it states in its footer it is not financial advice. Presagio's July blog says event markets are validator-voted and that "no UMA-style oracle" exists - that is **out of date** (permissionless deployer markets opened 2026-08-29 per sibling note, M). Add a Presagio-specific risk: none of its own beyond front-end display errors.

---

## 8. Geo, ToS and automation

- **Presagio terms of service: NOT FOUND.** The only legal page is a privacy policy (Spanish, mentions AEPD, Spain's data regulator, so the operator is probably Spain-based, M; operator identity not stated: "el operador de Presagio"). No geo-restriction text, no bot/automation clause (searched: homepage, /en, /blog, /privacidad, sitemap, 5 of the 8 blog posts).
- robots.txt disallows `/app`, `/en/app` and `/api` for all agents (H). An automated scraper of the app or its backend would breach the stated crawl rules; use Hyperliquid's public API.
- **Underlying Hyperliquid terms (sibling note, read there from the app bundle, last updated 2026-06-15):** US and Ontario residents barred from the Interface; outcome markets also barred for an open-ended "Excluded Persons" list; VPN circumvention prohibited; bots allowed only within reasonable usage (M here, H in the sibling note).
- Access friction: an invite code or email login is needed to see the app at all (H, landing page).

---

## 9. Liquidity (with dates)

- **Presagio's own volume / OI / TVL: none, nothing published.** Not on DefiLlama (checked 2026-10-19, H). No users, volume or revenue stated anywhere on the site.
- **Underlying Hyperliquid HIP-4 (shared, not additive):** DefiLlama about $2-3.5M/day, about $2.3M open-interest proxy, about 350 live outcomes, snapshot 2026-10-19 (sibling note, M here). The page's own "208 markets live" is a smaller number than the ~350 outcomes the sibling note counted, which is consistent with a curated subset or a different counting rule (M, unexplained).
- Presagio's July blog says "~23 outcomes in mainnet" (2026-07-13): stale by an order of magnitude (L).

---

## 10. Event categories and arbitrage overlap

Presagio advertises World Cup, Fed, CPI ("IPC"), crypto (H, landing page and blog index). Those are Hyperliquid's categories. Overlap with other venues (crypto price ladders, Fed decisions, World Cup winner) is described in the sibling note, section 11. Because Presagio only mirrors Hyperliquid, any cross-venue arbitrage against Polymarket/Kalshi/etc. should be modelled on the Hyperliquid book, once.

## 11. Shared liquidity

**Shares 100% of its liquidity with Hyperliquid HIP-4 (HyperCore order books).** It is not an independent leg. It is also one of dozens of HIP-4 front ends (DefiLlama "Interface" category lists 35 such "Outcome" rows, per `14-platform-of-platforms.md`).

---

## 12. Adapter recommendation

- **skip** for a Presagio adapter. Treat `presagio.xyz` as an alias/`routes_to: hyperliquid-outcomes-hip-4` entry in the platform registry (mechanism `broker`/frontend, status `beta`) so the aggregator does not count it as a venue.
- If the registry wants a front-end attribution field (e.g. builder-code attribution on fills), Presagio's builder address is not published (env-injected, empty in the bundle); NOT FOUND.
- Re-check only if (a) Presagio publishes an API or multi-venue aggregation, or (b) it appears in DefiLlama with volume.

---

## NOT FOUND (searched)

- Presagio terms of service, geo restrictions, bot policy (searched: /, /en, /blog, /privacidad, sitemap, 5 of the 8 blog posts).
- Presagio API, docs, changelog, OpenAPI, status page (searched: same pages, bundle, robots, sitemap).
- Presagio builder address, deployed builder fee, user count, volume (searched: bundle env defaults, DefiLlama protocols list).
- Operator identity, social accounts, GitHub org (no links on the pages; WebSearch budget exhausted, so no external search was possible).
- The app's market catalogue / filters (behind invite gate; `/app` robots-disallowed).
- Independent confirmation of what the "208" figure counts.

## Suspicious content

None found. I grepped the landing pages, blog pages and the two relevant JS chunks for text addressed to AI agents (ignore/previous/system prompt/AI agent/language model) and found nothing.

## Open questions

1. Is the 208 count live (queried per request) or hard-coded in the build?
2. What builder address / fee does the production build use, and does Presagio attribute fills on mainnet at all given `TRADING_ENABLED = IS_TESTNET`?
3. Does the app (post-gate) offer anything beyond the raw Hyperliquid feed (curation, Spanish market titles, social cards) that would be useful as a signal?

## Sources

- https://presagio.xyz/ and https://presagio.xyz/en (H, fetched 2026-10-19)
- https://presagio.xyz/robots.txt , https://presagio.xyz/sitemap.xml (H)
- https://presagio.xyz/privacidad (H, last updated 2026-07-20)
- https://presagio.xyz/blog and posts under /blog/ (api-hip-4-guia-desarrolladores, builder-codes-hyperliquid-monetizar-frontend, que-es-hip-4-mercados-prediccion-hyperliquid, hyperliquid-vs-polymarket-vs-kalshi, hyperliquid-hip-4-mercados-sin-permiso-500k-hype) (read as text, 2026-07-13/20, M/L: self-published, partly stale)
- https://presagio.xyz/_next/static/chunks/1-zjcpjq9fdrb.js and /0e0o14t9dfp4j.js (public static JS read as text, not executed; H)
- https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md (H, fetched 2026-10-19)
- https://api.llama.fi/protocols (H, 2026-10-19, no Presagio row)
- Repo notes: `docs/research/venues/hyperliquid-outcomes-hip-4.md` (sibling, researched 2026-10-19), `docs/research/14-platform-of-platforms.md`, `docs/research/09-venues-onchain-clob.md` (M)
- Fixtures: `docs/research/fixtures/presagio-presagio-xyz-hip-4-interface/`
