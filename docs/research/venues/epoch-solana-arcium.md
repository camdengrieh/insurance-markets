# Epoch (Solana, Arcium) - adapter spec

Researched 2026-10-19 (~01:50-02:00 UTC). READ-ONLY: public unauthenticated GETs with the generic User-Agent `insurance-markets-research/0.1`, WebFetch of public pages, `gh api` metadata reads. No account, no wallet, no signing, no POST/PUT/DELETE, no PayBox tools, no third-party code cloned or run (the site's JS bundle was downloaded and read as text only). The WebSearch budget was exhausted before my first search ran, so the search leg is NOT done; discovery rests on the rpcfast lead, the Arcium ecosystem page and the venue's own site.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/epoch-solana-arcium/` (5 files, each < 3 KB).

## 0. Verdict

**adapter_priority: skip.** (revisit only if a working public API and a market feed reappear)

1. **The backend is not deployed (H).** The site's only API host, `api.epoch.market`, answers every path I tried (`/`, `/health`, `/stats`, `/markets`, `/sports/feed`, `/sportsbook/feed`) with a Railway edge fallback `404 {"status":"error","code":404,"message":"Application not found"}` and header `x-railway-fallback: true`, on 3 separate probe rounds spread over several minutes. The front-end needs `/sportsbook/feed` for every market list and `/bet/quote` for every bet, so the product cannot list markets or take bets in this state. The marketing shell at `https://epoch.market` still returns 200 (a cached Vercel prerender with no visible text), which proves nothing about trading. Treat as **not live** (confidence medium: I could not see Solana-side activity because no program id is published; a one-moment API outage is possible but unlikely to be Railway's "Application not found" page).
2. **Not a prediction-market order book.** It is an operator-run sportsbook: "Odds sourced from external bookmaker-consensus data providers", "a house margin is incorporated into displayed odds", quotes are signed by an operator co-signer and expire in 60 s, payouts capped by per-market liquidity "set at the Company's discretion" (H, Terms). Prices therefore carry no independent information and always embed margin plus a 2% fee. It is not an independent arbitrage leg, and as a signal source it would only echo bookmaker consensus.
3. Product scope is narrow: 3-way match-winner (home / draw / away) on soccer and cricket per the client code (H), despite "football, basketball, soccer, and more" in the marketing copy.
4. Restricted jurisdictions include the US, UK, most of the EU, Australia, India, Singapore, Hong Kong; VPN use is a "material breach" (H, Terms). Automation that "disadvantages other users or disrupts service" is prohibited.
5. No docs, no public API documentation, no TVL/volume listing anywhere I could check (DefiLlama has no Epoch entry).

## 1. Identity and liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Lead | rpcfast blog: "Epoch shipped privacy-preserving prediction markets using Arcium's encrypted compute"; venue table row "Native Solana, Arcium TEEs"; takeaways: "Epoch ... all landed between December 2025 and February 2026"; no link to Epoch, no date, no source | M (https://rpcfast.com/blog/ai-agents-solana-prediction-markets via WebFetch) |
| Arcium ecosystem directory lists "Epoch - https://epoch.market - Confidential prediction market that hides bets until resolution", X `@epochdotm`; no status shown. The same page lists four siblings (Bench, Melee, Flew, Pythia) | M/H-listing (https://www.arcium.com/ecosystem via WebFetch, summarised) |
| Site identity | `https://epoch.market`, title "Epoch - Private Sportsbook on Solana"; operator "Epoch Labs"; manifest name "Epoch Sportsbook"; site metadata points to X `@epoch_market` (differs from the Arcium listing's `@epochdotm`; X returned HTTP 402 to my fetch, nothing paid, so I could not compare accounts) | H (site HTML, Terms) |
| Terms last updated | "Last updated: June 16, 2026" | H |
| Sitemap | only `/` and `/sports`, `lastmod` 2026-06-29 | H (fixture `epoch_market_sitemap.xml`) |
| Front-end HTTP | `/`, `/sports`, `/terms`, `/privacy` 200 (client-side-rendered shells; `x-vercel-cache: HIT`, `age` about 10-12 days on 2026-10-19); `/docs` 404 | H |
| API host | `api.epoch.market` resolves to Cloudflare and returns Railway fallback 404 "Application not found" for all paths | H (fixture `api_epoch_market_404_probes.txt`) |
| GitHub | No official repo found. `gh api search/repositories` for "epoch arcium sportsbook" and "epoch.market": the only hit named Epoch-Markets is an unrelated vending-machine site by an individual. Orgs `Epoch-labs`, `epoch-labs-ai`, `epoch-labss` exist by login but I did not tie any to this product | H (negative) |
| DefiLlama | `https://api.llama.fi/protocols` (8,758 entries): no Epoch prediction/sportsbook entry (only "Epoch Island", an unrelated Base/Ethereum farm) | H (negative) |
| Staleness flag | Everything about launch timing is from one unsourced blog (Dec 2025 - Feb 2026). Newest first-party datum is Terms 2026-06-16 / sitemap 2026-06-29 (about 4 months before today) | L/M |

## 2. What it is

- **Kind**: onchain-other (Solana). Self-described "non-custodial, privacy-preserving sports prediction platform built on the Solana blockchain and operated by Epoch Labs" (H, Terms s.1/5).
- **Market model (H for client code, M for chain side)**: per-fixture `match_winner` market with 3 outcomes `[home_team, "Draw", away_team]`, `market_kind: "match_winner"`, `num_outcomes: 3`. Not a CLOB and not a conventional AMM. Fields in the feed (`pools[]`, `vault_allocation`, `locked_liabilities[]`, `current_odds[]`, `queued_positions`, `total_pool`) and per-position `locked_odds_x10000` indicate a house-vault sportsbook: the bettor gets odds locked at quote time, payout reserved from a vault, with pools tracked per outcome. Exact accounting NOT FOUND (no docs, no program source, API down).
- **Tokenisation**: positions are on-chain records (`owner`, `stake`, `net_stake`, `locked_odds_x10000`, `status`, `revealed_outcome`, `computed_payout`), not transferable tokens (M, inferred from client types). No secondary market, no sell/hedge before resolution; "All positions are final once submitted on-chain. No cancellations or modifications" (H, Terms).
- **Privacy layer (H, Terms)**: "the selected outcome is encrypted client-side and is never readable by the Company or any third party prior to settlement" via "Arcium multi-party computation (MPC)"; wallet address and stake remain public; "MPC computation may fail or time out, triggering refund paths". The bet request carries `encrypted_outcome` + `nonce` (H, client code). Consequence for an aggregator: **the per-outcome position distribution is hidden by design**, so order-flow/position signals are unavailable, only odds and aggregate pool.
- **Collateral/chain**: Solana, SOL only ("users stake SOL", "All SOL is held in on-chain smart-contract vaults"; client hard-codes the wrapped-SOL mint `So111...112` as token mint). No USDC leg (H, Terms + bundle).
- **Categories**: soccer and cricket per client (`sport === "cricket" ? "cricket" : "soccer"`); marketing says football, basketball, soccer. Match-winner only. No politics, macro or crypto-price markets (M; I could not see a live feed).

## 3. Read API

| Surface | Status | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: `epoch.market/docs` 404, sitemap lists only `/` and `/sports`, no docs link in HTML/Terms; `docs.epoch.market` does not resolve in DNS; no GitHub repo) | H (negative) |
| REST `https://api.epoch.market` | Used by the site's own front-end. No auth header is attached by the client (H, bundle). **Currently dead**: Railway "Application not found" on all paths (H). Undocumented, so no stability promise even when up | H |
| Rate limits | NOT FOUND | - |
| WebSocket | NOT FOUND (no ws URL in the bundle; the client polls `/sportsbook/feed` with a 10 s cache) | H (negative) |
| On-chain | Program id / market accounts NOT FOUND (the bundle contains no program address; `market_pubkey` values come from the dead API). Without the program id and IDL there is no keyless on-chain read path | H (negative) |

Endpoints seen in the client (paths from the bundle; **response shapes NOT verified because the host is down**, see fixture `bundle_api_client_paths.txt`):
`GET /sportsbook/feed?status=all&limit=500` (the only list the UI uses), `GET /sports/feed?sport&horizon_hours&limit&live_only`, `GET /sports/fixture/{id}`, `GET /markets`, `GET /markets/{id}`, `GET /markets/{id}/resolution`, `GET /odds/quote?market=&amount=`, `GET /odds/source/{id}`, `GET /stats`, `GET /featured`, `GET /activity?limit=`, `GET /me?wallet=`, `GET /me/positions?wallet=`; writes `POST /bet/quote`, `POST /bet/admin-cosign`, `POST /users/onboard` (not called).

## 4. Trade path

- **Flow (M, reconstructed from client code and Terms)**: client encrypts the chosen outcome with Arcium, `POST /bet/quote {market_pubkey, bettor, encrypted_outcome, requested_stake, nonce}`; the server returns an operator-signed quote (`ed25519_ix_data_b64`, `message_hex`, `signature_hex`, `cosigner_pubkey`, `quote_odds`, `max_stake`, `max_payout`, `expires_at` 60 s); the user then submits a Solana transaction that includes the ed25519 verify instruction plus the bet instruction; payout is claimed on-chain after settlement.
- **Programmatic placement without the web UI**: possible only by re-implementing the Arcium encryption and the program instruction layout, neither of which is documented (NOT FOUND). Custom `bettor` + quote signing means the operator's co-signer gates every bet, so the operator can refuse a client at will.
- **Reachable through PayBox?** **No (practically)**. PayBox has a Solana credential family and `solanaTransaction` proposals (single signer = fee payer, <= 1,232 bytes; per `docs/research/06-paybox-platform.md`), so a Solana wallet could sign such a transaction in principle, but (a) the quote API is down, (b) the Arcium encryption + instruction format is undocumented, (c) the stake is native SOL (the PayBox x402 and swap rails are USDC-oriented), (d) Terms restrict the user's jurisdiction. An EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) cannot trade it at all: Solana-only, ed25519 signatures, SOL collateral.

## 5. Fees (H, Terms and bundle)

- Protocol fee 2% "deducted from gross stake" (`protocol_fee_bps: 200` hard-coded in the client; payer: bettor).
- Plus an undisclosed "house margin" built into displayed odds (the bettor pays through worse odds). Odds "may differ from those on other platforms".
- Solana network fees on top. No maker/taker concept.

## 6. Resolution and dispute risk

- Settlement is by "official results from our sports-data providers"; "In the event of data unavailability, error, or dispute, the Company may void and refund affected positions"; the Company may also void any position "suspected of being placed in error, in bad faith, through manipulation" (H, Terms). Fixtures expose `betting_end_ts`, `resolution_end_ts`, statuses `Open|Resolved|Closed|Voided` (H, client).
- Centralised, operator-controlled resolution with unilateral void rights; no on-chain dispute window, no oracle bond. High operator-discretion risk, plus smart-contract and MPC-failure risk (named in the Terms).

## 7. Geo, ToS, automation (H, https://epoch.market/terms, last updated 2026-06-16)

- Restricted: "The United States of America and its territories", "The United Kingdom, France, Germany, the Netherlands, Belgium, Spain, Italy, Austria, Portugal, Switzerland, and Australia", "India, Singapore, and Hong Kong", plus sanctioned countries; VPN/proxy use prohibited.
- Prohibited: "Use automated scripts, bots, or other tools to interact with the platform in a way that disadvantages other users or disrupts service." Bots are not banned outright, but this is a permission-by-conduct clause and the operator co-signs every bet.
- "You must not allow third parties to use your wallet in connection with Epoch."
- Site `robots.txt` (Cloudflare-managed) disallows a list of AI crawlers, sets `Content-Signal: search=yes, ai-train=no, use=reference`, and disallows `/api/` on the apex host. This was point-in-time research by a non-crawling client; no content was bulk-collected. Any future scanner should use no scraping of the apex and should not rely on the undocumented API host.
- The US and most major markets are Restricted Jurisdictions, so a PayBox plugin shipped to a general audience could not legitimately offer this venue to those users, regardless of tech. Treat as a **do-not-offer** venue for the plugin.

## 8. Liquidity (all NOT FOUND)

- Volume / OI / TVL: NOT FOUND (searched: DefiLlama protocol list, site HTML/Terms, Arcium ecosystem page; the feed that carries `total_pool` and `vault_allocation` is down). Do not assume anything; terms say payouts are capped per market at the operator's discretion, which implies thin, house-bankrolled liquidity.
- Overlap: soccer 1X2 match-winner overlaps soccer markets on Polymarket, Kalshi, Limitless and others (M), but Epoch's price is a bookmaker-consensus price plus margin, so any "edge" versus a prediction-market book would just be the margin showing up against a sharp price, not an inefficiency.
- Shared liquidity: not shared with another prediction venue (own vault), but it is **not an independent price source** because odds are imported from external bookmakers (H, Terms).

## 9. Adapter notes (only if it revives)

- Minimal read adapter would be: poll `GET /sportsbook/feed?status=all&limit=500` (client-side cache 10 s), map `current_odds[]` (x10000 fixed point per the position field `locked_odds_x10000`; unit UNVERIFIED) for `[home, Draw, away]`, key by `market_pubkey`; match to other venues by `home_team`, `away_team`, `starts_at`, `league`.
- Must first re-verify: API host up; response shapes; odds scale; whether 2% fee applies to payout or stake; program id and IDL.
- No trading adapter: skip.

## 10. Open questions

1. Is `api.epoch.market` retired, moved, or paused? (No status page, no official X access from this run.)
2. Which X handle is real: `@epoch_market` (site) vs `@epochdotm` (Arcium listing)? Same operator?
3. Solana program id, IDL, vault size, cumulative volume: unknown.
4. Whether Epoch is truly on Arcium mainnet or a demo (Arcium listing shows no status).
5. Do the sibling Arcium apps (Bench, Melee, Flew, Pythia) have working APIs? Out of scope here; `pythia.markets` and `bench.markets` returned 200, `flew.live` and `melee.markets` redirected (not examined).

## Sources

- https://rpcfast.com/blog/ai-agents-solana-prediction-markets - discovery lead; Epoch described as shipped (M, WebFetch summary; no link or date).
- https://www.arcium.com/ecosystem - Epoch listing in "Prediction Markets", `@epochdotm` (M/H, WebFetch summary).
- https://docs.arcium.com - no network-status or Epoch information (H, negative).
- https://epoch.market/ (title, description, JSON-LD, manifest, sitemap, robots.txt) - H; fixtures `epoch_market_home_meta.txt`, `epoch_market_sitemap.xml`, `epoch_market_manifest.webmanifest`.
- https://epoch.market/terms - H; fee, privacy, resolution, geo, automation clauses (last updated 2026-06-16).
- https://epoch.market/_next/static/chunks/497f1f51c6076e8e.js - front-end API client (read as text) - H for paths and field names; fixture `bundle_api_client_paths.txt`.
- https://api.epoch.market/{,health,stats,markets,sports/feed,sportsbook/feed} - Railway "Application not found" 404s (H); fixture `api_epoch_market_404_probes.txt`.
- https://api.llama.fi/protocols - no Epoch entry (H, negative).
- GitHub search via `gh api search/repositories` - no official repo (H, negative).
- https://x.com/epoch_market - HTTP 402 (X anti-bot), not read, nothing paid.
- WebSearch: not performed (session search budget exhausted).
