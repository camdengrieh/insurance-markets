# Pythia Markets (pythia.markets, Solana + Arcium) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs of the public site and its static assets, `gh api` GET file reads of public GitHub repos, WebFetch of public pages, one WebSearch. No account, no wallet, no API key, nothing signed, no code cloned or run. No PayBox tool called.
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary or inferred; **L** = weak or stale (>6 months).
Third-party text (repo docs, directory listings, reviews) is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/pythia-markets/` (6 files, each < 2 KB; there is no API to sample, so these are evidence of status and account layout only).

## 0. Verdict

**adapter_priority: skip.** Revisit only if the site ever ships a real product (watch for pythia.markets changing from the placeholder, a mainnet program id, or a docs/API host).

1. **Not live (H).** `https://pythia.markets` serves a one-component React placeholder: `<title>Pythia Markets</title>`, meta description "Pythia Markets - coming soon", body "coming soon...". Every common path (`/docs`, `/app`, `/markets`, `/api`, `/api/markets`, `/terms`, `/whitepaper`, `/robots.txt`, `/sitemap.xml`) returns 404; `docs.`, `app.` and `api.` subdomains do not resolve. Deployed on Vercel, last-modified 2026-10-15 21:13 GMT. Source: fixtures `pythia.markets_home.html`, `pythia.markets_home_headers.txt`, and the JS bundle (`/assets/index-TgJKiFwA.js`, 142 KB, which is stock React plus a single "coming soon" component).
2. **The only code is a hackathon prototype, last pushed 2025-12-06 (H, 10.5 months stale).** It is a sponsor-run "opportunity market" for startup funding, not a general event venue, and contains no collateral handling (section 2).
3. **No read API, no trade path, no liquidity, no event overlap.** Nothing to build an adapter against; the model (sponsor-whitelisted markets, hidden prices in a private window) is also structurally unsuited to price comparison.
4. **Aggregator value is nil today.** If it ever launches, the best case is a P2 signal-only feed from public-window prices.

## 1. Liveness (2026)

| Evidence | Value | Tag |
|---|---|---|
| Site body | "coming soon..." placeholder, no product UI | H (https://pythia.markets, bundle) |
| Site last-modified | 2026-10-15 21:13 GMT (a redeploy of the placeholder; not evidence of a product) | H |
| web3privacy explorer dataset | `project_status: live_status false, mainnet false, testnet false`; links web `https://pythia.markets/`, twitter `https://x.com/pythiamarkets`; description "Private Prediction market built on Arcium"; `have_token: false`; ecosystem solana | H (`github.com/web3privacy/explorer-data/src/projects/pythia/index.yaml`; commit date not retrieved, see section 11) |
| Buildermaps (chainbase-labs) record | description literally "Pythia Markets - coming soon", links pythia.markets and x.com/pythiamarkets | H (`github.com/chainbase-labs/buildermaps.io/public/data/projects/pythia.json`) |
| Arcium ecosystem page | lists "Pythia" - "Confidential prediction market with dark-pool confidential order books", category Prediction Markets, website pythia.markets; no X, no docs, no status | H (https://www.arcium.com/ecosystem) |
| TheGrid directory | "Pythia Markets", tagline "Prediction markets R&D lab", "privacy-first prediction market platform using encrypted computation... sponsors receive exclusive aggregated signals"; no website, chain or status field | H (https://thegrid.id/discovery/productType/prediction-markets, read via WebFetch; date unknown) |
| MadeOnSol listing (the discovery hint) | site online with valid SSL, health 71/100 (checked ~15 days ago); X @pythiamarkets ~857 followers, last post 2026-03-25 ("Dormant", 207 days); "Solana mainnet-alpha with a small set of node operators" (this describes **Arcium's** MPC network, not a Pythia deployment); a single 5-star review dated 2026-07-30 praising "fast market resolution, low fees, and trust in the data feeds" | M, and the review is **contradicted** by first-hand evidence (no product exists) - treat as unreliable |
| X profile `x.com/pythiamarkets` | WebFetch returned HTTP 402 from X itself (not a venue payment requirement); not read. Follower/post data above is MadeOnSol's | n/a |
| Arcium Solana Privacy Hack winners post (2026-02-17) | does **not** mention Pythia (winners: Bench, Crafts, Epoch, Undesk) | H (https://arcium.substack.com/p/winners-of-solana-privacy-hack) |
| rpcfast "AI agents for Solana prediction markets" (2026-05-20, updated 2026-09-07) | does **not** mention Pythia (lists Jupiter Predict, Phantom/DFlow, Hxro, Inframarkets, Epoch) | H (https://rpcfast.com/blog/ai-agents-solana-prediction-markets) |

A WebSearch snippet (M, secondary, ~120-320 days old per the search tool) says Pythia "received a university award at the Solana Cypherpunk Hackathon" and that Pythia and another project "integrate Arcium's technology to add encrypted order books". Not verified at the source.

## 2. What it is (code-level, H)

Source of truth: the public repo `https://github.com/Pythia-Markets/pythia-opportunity-markets` (org "Pythia Markets", created 2025-05-20; one public repo; repo created 2025-10-15, last push 2025-12-06, 2 stars, 7 forks, no license, no description, empty root README). Org-to-domain link is **inferred** (M): the repo has the same brand and logo file names, the org is named "Pythia Markets", the dataset entries tie pythia.markets to the same "privacy-first / Arcium" description, but no file in the repo states "pythia.markets" (GitHub code search for it: 0 hits) and the org lists no blog/twitter. Treat as probable, not proven.

Design (from `DEV-TEAM2-PLAN.md`, Anchor program, Arcis circuit):
- **Purpose**: "Opportunity Markets" (Paradigm concept): a whitelisted *sponsor* (e.g. an accelerator) posts a market "Will we fund startup X within the next 6 months?", seeds the NO side, and signal providers buy YES and send research notes. Prices are hidden from everyone except the sponsor during an "opportunity window", then public. Plan text says it is built for the Colosseum Cypherpunk hackathon and relies on "sponsors upholding their reputation" in v0.
- **Market model**: binary YES/NO only; no categorical, no scalar, no order book in code. Public window = constant-product AMM over `public_yes_pool` / `public_no_pool` (`k = yes*no`; `1 USDC = 1000 shares`; price in thousandths). Private window = the same AMM math run inside an Arcium MPC circuit with pools and user positions stored as 32-byte ciphertexts (`market_state: [[u8;32];4]`). The "dark-pool order book" wording on Arcium's page is not reflected in this code (M/H discrepancy).
- **Tokenisation**: none. Positions are per-user encrypted/plain accounts (`UserPosition`), not SPL tokens. Accounts: `Sponsor`, `Market` (fields: `question`, `resolution_date`, `window_state` Private|Public, `liquidity_cap`, `initial_liquidity_usdc`, `opp_window_duration`, `pub_window_duration`, `resolved`, `outcome: Option<bool>`), `UserPosition` (fixture `pythia-opportunity-markets_state.rs.txt`).
- **No collateral actually moves in the code**: `grep -i "transfer|token::|anchor_spl|spl_token|TokenAccount|Mint"` over `programs/pythia_op/src/lib.rs` returns nothing; `usdc_amount` is just a number multiplied by 1000; `claim_payout` is commented out; `whitelist_sponsor` has `// TODO: Add proper admin authority check` (anyone can whitelist a sponsor). The UI says "Trading is mocked in v1" (`app/INTEGRATION.md`). This is not a venue that can hold or pay out funds as written.
- **Chain**: Solana. Program ids in the repo disagree: `DNBCB9WzLruKzvdFYpoEXNr9bVTTJ8eCeNMzKHhZRP1m` (`Anchor.toml` `[programs.devnet]`, and `declare_id!`) vs `2qjYCKDKngH2rcnPwpxKgZTdbjvvxq71u7FVChU1541U` (`app/src/config/config.ts`, with `NETWORK = 'devnet'`); `scripts/setup-testnet.ts` points at `https://api.devnet.solana.com`. No mainnet id anywhere. I could not confirm on-chain existence (Solscan returned 403; Solana JSON-RPC is POST-only, which this run avoided). Arcium dependency: program built against Arcium 0.3.0/0.4.0 (Dec 2025), Cerberus backend.

**Name collision to avoid**: a different project "PYTHIA - private prediction markets" (`github.com/nisargpatel7042lva/pythia`, app `https://pythia-markets.vercel.app`) runs on **Avalanche Fuji testnet** with eERC (encrypted stake amounts); repo created 2026-10-15, status "testnet, unaudited". It never mentions Solana, Arcium or pythia.markets (H: title "PYTHIA: private prediction markets", keywords Avalanche/Fuji/testnet only). Not the same project; do not conflate. Also several unrelated "Pythia" hackathon repos exist (Sui, Russian-language bot idea, etc.).

## 3. Read API

NOT FOUND (searched: pythia.markets paths and subdomains above; the site bundle has no API URLs; org has 1 repo, no docs link; web3privacy entry has empty `docs`, `github`, `block_explorer`; Arcium page lists no docs; TheGrid lists no links).

- Official/public API: **none**. `read_api.exists = none`.
- Prototype backend (H, repo `backend/`): Express + MongoDB "price history" service, never deployed as far as found. `POST /api/price-points` (body `{price, market, source, timestamp, metadata}`) and `GET /api/price-points?market=&source=&from=&to=&limit=` (default 500, max 5000), `/healthz`; the GET only returns data when the market is in the public window. Plan doc `backend/NEW-ENDPOINTS.md` lists *unimplemented* `GET /api/markets`, `/api/sponsors`, `/api/markets/:id`. No live base URL exists, so none of this is callable.
- On-chain only (hypothetical): market and position accounts decode with the repo IDL (`backend/src/idl/pythia_op.json`); `WindowSwitchEvent` publishes pools and prices when a market flips to Public. During the Private window prices are encrypted on-chain, so an indexer cannot read them. No mainnet program, so no data.
- Auth, rate limits, websocket: NOT FOUND.

## 4. Trade path

None usable. Hypothetically (prototype program): Anchor instructions `trade_private` (queues an Arcium MPC computation; client must encrypt the trade with the MXE shared key via Arcium client libs), `trade_public(usdc_amount, is_buy_yes)`, `init_market`, `resolve_market`, `switch_to_public/private`. All require a Solana ed25519 signer; no REST order API, no signed-order scheme, no off-chain matching.

## 5. PayBox reachability

**no** (for now). PayBox does have a Solana wallet family and a `solana` proposal kind (<= 1,232 bytes, single signer; per project note `docs/research/06-paybox-platform.md`), so a deployed Solana program could in principle be hit with a `solanaTransaction` intent. But: no mainnet deployment found, no collateral flow in the code, the private-window path needs client-side Arcium encryption (bespoke client work), and sponsor-only market creation. An EVM-only wallet cannot interact with Solana at all.

## 6. Fees

NOT FOUND in docs. In code (H): no trading fee, no protocol fee, no payout logic. The only fee-like accounts are Arcium's `FeePool` (Arcium compute fees paid by the transaction sender for each MPC computation, per the `pool_account` constraints); amounts NOT FOUND.

## 7. Resolution

Sponsor-resolved (H, `resolve_market`): only `market.authority` (the sponsor who created the market) may call it, only after `resolution_date`, with a plain `outcome: bool`. No oracle, no dispute window, no bond. Dispute/counterparty risk = total (sponsor can also trade against the market: the plan itself lists "untrustworthy sponsors could exploit markets"). Payout claim not implemented.

## 8. Geo / ToS / automation

NOT FOUND (no terms page, no privacy policy; web3privacy entry `privacy_policy.defined: false`, `compliance: ""`, `kyc: false`). The prototype frontend uses Privy wallet login (H, `app/INTEGRATION.md`). Nothing on bots/automation.

## 9. Liquidity

NOT FOUND. No DefiLlama listing found, no explorer data, no volume or TVL anywhere; product is pre-launch. Treat as 0 (L, absence). Seed liquidity in the prototype is a sponsor-declared number (`initial_liquidity_usdc`, test value 100,000 in `setup-testnet.ts`), not real funds.

## 10. Event overlap and independence

- Categories: startup-funding / "opportunity" questions ("Will we fund startup X within 6 months?"), plus the author's speculative list (TikTok trends, artists, research papers). No sports, politics, crypto-price or macro markets. Mock UI logos are Amazon/Apple/Google/Microsoft/Nvidia (mock data only).
- Overlap with Polymarket/Kalshi/XO etc.: **none identified**. A single-sponsor question is by construction not listed elsewhere.
- Shared liquidity: none (self-contained AMM). Not a duplicate of another venue, but also not an arbitrage leg.
- Signal value: the intended product sells aggregated, delayed signals to sponsors; not a public price feed.

## 11. Open questions / what would change the verdict

1. Whether a mainnet program exists (needs an explorer or POST-free chain read; Solscan 403, JSON-RPC avoided).
2. Whether the Pythia team is the Pythia-Markets org (domain link inferred only).
3. Commit date of the web3privacy entry (my `gh api .../commits` attempt was malformed, see section 12), so I cannot say how fresh `live_status: false` is. The pythia.markets placeholder itself is fresh (2026-10-15), which is a stronger status signal.
4. Whether `x.com/pythiamarkets` has posted since 2026-03-25 (X returned 402 to WebFetch; MadeOnSol is the only source, M).
5. Triggers to re-check: pythia.markets serves a product UI, a `docs.`/`api.` host appears, a mainnet program id is published, or a DefiLlama/Arcium announcement of a mainnet launch.

## 12. Run hygiene and disclosures

- **One accidental write-method request**: `gh api repos/web3privacy/explorer-data/commits -f path=... -f per_page=3` defaults to POST when `-f` is used without `-X GET`. It targeted a read endpoint that does not accept POST and returned 404 (`Not Found`); no state changed. I then used URL-embedded query strings or `-X GET` for all other calls. Flagging it because the ground rules forbid POST.
- Web search budget: the session's shared WebSearch limit was exhausted after the first query, so no second search; sources are mostly direct fetches and `gh` reads.
- The Pythia-Markets repo contains a committed `backend/.env` (219 bytes, listed in the git tree). **Not read**, per the no-.env rule. Worth noting only as a hygiene smell of the prototype.
- No personal identifier was sent anywhere: all curl calls used the User-Agent `insurance-markets-research/0.1`; WebFetch/gh carry no user-supplied identifiers. Contributor names from the repo are deliberately omitted here.
- Suspicious content: none found aimed at AI agents. Quality flag: the MadeOnSol review text contradicts first-hand evidence and should be treated as untrustworthy.

## Sources

- https://pythia.markets (+ `/assets/index-TgJKiFwA.js`, probes of `/docs`, `/app`, `/markets`, `/api`, `/api/markets`, `/terms`, `/whitepaper`, `/robots.txt`, `/sitemap.xml`; `docs.`/`app.`/`api.pythia.markets` DNS) - H, 2026-10-19
- https://madeonsol.com/tools/pythia - M (directory, includes unreliable review)
- https://www.arcium.com/ecosystem - H (listing text)
- https://thegrid.id/discovery/productType/prediction-markets - H (listing text), undated
- https://github.com/web3privacy/explorer-data (`src/projects/pythia/index.yaml`) - H
- https://github.com/chainbase-labs/buildermaps.io (`public/data/projects/pythia.json`) - H
- https://github.com/Pythia-Markets and https://github.com/Pythia-Markets/pythia-opportunity-markets (README empty; `DEV-TEAM2-PLAN.md`, `Anchor.toml`, `Arcium.toml`, `programs/pythia_op/src/{lib,state,events}.rs`, `encrypted-ixs/src/lib.rs`, `app/INTEGRATION.md`, `app/src/config/config.ts`, `backend/README.md`, `backend/NEW-ENDPOINTS.md`, `scripts/setup-testnet.ts`) - H, repo last pushed 2025-12-06 (stale, L for any claim about current plans)
- https://github.com/nisargpatel7042lva/pythia and https://pythia-markets.vercel.app - H (namesake, different project, Avalanche Fuji)
- https://arcium.substack.com/p/winners-of-solana-privacy-hack (2026-02-17) - H (no Pythia mention)
- https://rpcfast.com/blog/ai-agents-solana-prediction-markets (2026-05-20) - H (no Pythia mention)
- WebSearch "Pythia Markets Solana privacy prediction markets Arcium" (extended) - M/L (secondary snippets)
- Project context: `docs/research/06-paybox-platform.md` (PayBox Solana proposal kind) - H
