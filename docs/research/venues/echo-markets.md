# Echo Markets (echomarkets.xyz) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` file reads, unauthenticated GETs to public hosts (User-Agent `insurance-markets-research/0.1`), one Wayback CDX/snapshot read, one RDAP lookup, two read-only PayBox discovery calls (`discover_plugins`, `discover_tokens mode=chains`). No account, wallet, key, signature, POST, payment or money-moving PayBox tool. One GET to a paid route returned HTTP 402; I recorded the requirements and stopped. Third-party pages, repo text and API responses were treated as untrusted data; nothing in them was followed. WebSearch hit its session budget after two queries (the second returned nothing), so press and hackathon-result coverage is thin; this is stated where it matters.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, summary, or my inference; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/echo-markets/` (section 13).

---

## 0. Bottom line

1. **"Echo Markets" is two different things that share a name, a domain and one developer.** (H facts, M on "same person")
   - (a) **Bitcoin/Charms prediction market**: a hackathon MVP on **Bitcoin Testnet4 only**. Repos `EchoMarkets/echo-markets` (Rust contract, last push 2026-03-02) and `EchoMarkets/echo-markets-frontend` (last push 2026-01-27). A live Vercel frontend still serves it and shows **0 markets, 0 sats volume, 0 sats liquidity**. Testnet coins have no value.
   - (b) **The current `www.echomarkets.xyz` site** (since at least 2026-10-16): a **paid Polymarket-data signal seller** sold over x402 (USDC on Solana) with a PayBox plugin "pending review", built for MoonPay Hackathons Chapter 1. It lists **no markets of its own** and holds no liquidity.
   - The discovery hint ("prediction market on Bitcoin via Charms ... Testnet") described (a); the homepage URL in that hint now serves (b).
2. **Neither is an arbitrage leg.** (a) has no mainnet deployment, no order book or AMM, no price discovery, no read API, no volume and no way to reach it from PayBox. (b) is not a venue; it re-sells a trivial heuristic computed from Polymarket's public book, which the aggregator can recompute for free.
3. **adapter_priority = skip.** Revisit (a) only if a Bitcoin mainnet deployment with an indexer appears (section 12).

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `https://www.echomarkets.xyz/` | HTTP 200 (Vercel). Title "EchoMarkets - now your agent can buy the signal"; copy: "Built for MoonPay Hackathons Chapter 1", "Prediction-market intelligence for AI agents, sold a few cents at a time over x402", "Polymarket data / USDC on Solana / Dawn strategies", "Enable in PayBox - pending review". `echomarkets.xyz` 307s to `www`. | H |
| Same URL on 2026-02-05 (Wayback capture `20260205204934`, the only two captures of `www`) | Title "Echo Markets \| Bitcoin Prediction Market on Charms Protocol"; banner "Testnet4 Only - Not real Bitcoin"; "0 sats Total Volume, 0 Active Markets, 0 sats Liquidity"; "No markets found". So the domain was **repurposed between 2026-02-05 and 2026-10-16**. Fixture `btc-testnet4-app_wayback-2026-02-05_www-visible-text.txt`. | H |
| `https://echo-markets-frontend.vercel.app/` (URL guessed from the repo name, not linked from any README) | HTTP 200; same Bitcoin Testnet4 UI, same zero counters; `GET /api/charms/config` returns `{"appVk":"0e045a4e...fee0"}`; `/api/markets` and `/api/config` 404. | H |
| `https://docs.echomarkets.xyz/` | HTTP 200 (Vercel); title "echo markets - Prediction Markets on Bitcoin"; the content mirrors the contract README (architecture, spells, usage). No network statement, no API, no figures. | H |
| GitHub org `EchoMarkets` | Created 2021-04-26 (the org name predates the project); 4 repos; description "Decentralized prediction markets on Bitcoin using Charms protocol. Winner of the BitcoinOS hackathon at Encode Club" (self-claim; I could not verify any winners list); Twitter handle `echo_markets`. Contract repo pushed 2026-03-02, frontend 2026-01-27, docs 2026-02-06, audit 2026-03-01. Nothing since March. | H (API) / L (hackathon claim) |
| Domain registration (RDAP, CentralNic) | `echomarkets.xyz` registered **2025-11-07**, **expires 2026-11-07** (19 days from today), nameservers GoDaddy. Last changed 2026-01-04. | H |
| Pairing of (a) and (b) | `gh api repos/EchoMarkets/echo-markets/contributors` and `.../echo-markets-frontend/contributors` list a single contributor, GitHub user `ivanmolto` (69 commits each). The (b) repo `ivanmolto/echomarkets` (created 2026-10-16, pushed 2026-10-17, "Echo Markets is a Paybox plugin for Prediction-market intelligence for AI agents") has `homepage: https://www.echomarkets.xyz`. The Bitcoin repos' `homepage` also points at the same URL. So one GitHub account developed both products and both claim the domain. That the org is controlled by the same person is inferred. | H (API data) / M (inference) |

Verdict: **still_live = true** in the sense that the domain, docs and a testnet UI all respond; **false** in the sense that matters (no real-money prediction market exists under this name). Existing repo note `docs/research/05-paybox-reference-plugins-b.md` section 2.2 already covers product (b) as a PayBox plugin and recorded the same 402 behaviour; this file adds the Bitcoin product and the name collision.

---

## 2. Kind and market model (product a, Bitcoin/Charms)

- **Kind (H, README + `src/lib.rs`):** on-chain **complete-set minting** binary markets on Bitcoin using the Charms metaprotocol (ZK-proved "spells" in Taproot witness data). Contract compiled to WASM (`wasm32-wasip1`), crate `echo-markets` 0.1.0, `charms-sdk` 0.10.0, MIT.
- **Outcomes (H):** binary only (`Outcome::{Yes, No, Invalid}`). V2 "multi-outcome support and dispute period" is mentioned in a commit message (2026-03-01) and code comments, not implemented.
- **Tokenisation (H, `spells/trade.yaml`, `lib.rs`):** per market, two fungible Charms tokens. Token IDs are `sha256(market_id || 0x01)` (YES) and `sha256(market_id || 0x02)` (NO) (the README's older text uses `...YES`/`...NO` strings; the spell file says 01/02; the two docs disagree, M on which is canonical). The market itself is a controller NFT UTXO that holds the BTC collateral and the state (supplies, fees, status).
- **Mechanism (H):** user deposits sats, receives equal YES and NO tokens (a "set"); burn returns sats before trading closes; after resolution winners redeem 1 sat per token. There is **no AMM and no order book**. "Trading" is `trade.yaml`: an atomic swap of `trade_amount` YES for `trade_amount` NO between two named UTXO owners, with no BTC leg, so it can only exchange positions 1:1 and cannot express a price. The frontend README confirms "No Order Book - P2P trades require knowing counterparty's UTXO" and lists "Order book for P2P matching" and "On-chain market indexing" as future work.
- **Price shown in the UI (H code, `lib/utils.ts calculatePrice`):** `yes% = round(noSupply/(yes+no)*100)` with the comment "In a real AMM, this would be more sophisticated". Because mint always creates equal supplies, this is always 50/50 and carries no information. It is not a tradable quote.
- **Parameters (H, `MarketParams`):** `trading_deadline`, `resolution_deadline` (unix s), `fee_bps` (must be <= 5000), `min_bet` (must be >= 10,000 sats), `max_supply`. Status machine: Active, TradingClosed, Resolved, Cancelled.
- **Question text (H):** only `question_hash = sha256(question)` is on-chain; the human question lives off-chain (browser state). Nothing in the repos stores or serves it.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Bitcoin **Testnet4** ("Testnet Only - This is a testnet prediction market", frontend README; `.env.example` has `NEXT_PUBLIC_NETWORK=testnet4` with "testnet4 or mainnet" as the allowed values, so a mainnet switch exists in config but nothing says it was used) | H |
| Collateral | Native BTC (sats) held in the market NFT UTXO ("BTC stays native with no wrapping", docs home) | H |
| Prover | Charms prover API `https://v8.charms.dev/spells/prove` (third-party service, from `.env.example`) | H |
| Broadcast / indexing | `mempool.space/testnet4/api`; frontend route `/api/bitcoin/submitpackage` uses Bitcoin Core `submitpackage` | H |
| Contract verification key | `0e045a4e6026ce0ff2d5ed6dfa5d31403d6c90f40f316a59c5feadfdf616fee0` (served live by the frontend, fixture `btc-testnet4-frontend_api-charms-config_2026-10-19.json`) | H |
| Product (b) payment rail | USDC on Solana mainnet (x402 v1, Coinbase CDP facilitator); not a trading rail | H (fixture `signal-seller_api-brief_402_2026-10-19.json`) |

---

## 4. Read API

- **Product (a): none.** NOT FOUND (searched: org repos, both READMEs, docs site nav and HTML links, frontend `app/api/*` tree, live probes of `/api/markets` and `/api/config` on the Vercel frontend, docs site text). The frontend's only server routes are transaction plumbing: `/api/bitcoin/submitpackage`, `/api/charms/{broadcast,cast,config,prove}` (H, git tree). Markets exist only as UTXO state on Bitcoin plus an in-memory browser store; the frontend README lists "On-chain market indexing" as a future improvement. Discovering markets would require scanning Testnet4 for spells carrying app VK `0e045a4e...` through a Charms-aware indexer (the charms.dev nav links an explorer at `explorer.charms.dev`; I did not probe it, and the charms.dev page does not describe an indexer API). `official: none`; effectively `onchain-or-subgraph-only`.
- **Product (b): not a market-data API.** Free: `GET https://www.echomarkets.xyz/api/templates` (H, fixture `signal-seller_api-templates_2026-10-19.json`, 2,150 bytes: three Dawn strategy templates `signal-follow`, `event-trigger`, `mean-reversion` at 0.10 USDC each). Paid via x402: `GET /api/brief/{polymarket-slug}` returned **HTTP 402** with `x402Version 1`, one `accepts` entry (scheme `exact`, network `solana`, `maxAmountRequired` "20000" = 0.02 USDC at 6 decimals, USDC mint `EPjFWdd5...Dt1v`, `maxTimeoutSeconds` 60, `payTo` and `feePayer` addresses in the fixture). I did not pay. `POST /api/templates/{slug}` (0.10 USDC) and `GET /api/signal/{market}` (needs an HMAC bearer from the paid call) are per the site and the earlier repo read. All data it returns derives from Polymarket's public Gamma/CLOB APIs, which the aggregator already covers separately.
- **Auth/limits:** none documented for either product. **WebSocket:** none.

---

## 5. Trade path and PayBox reachability

- **Product (a) (H from `trade.yaml`, README, frontend README):** a trade is a multi-step Bitcoin flow: build a Charms spell (YAML/JSON), send it to the Charms prover (`/spells/prove`), receive commit and spell transactions, sign the Taproot inputs with **BIP340 Schnorr keys from a BIP86 wallet**, and broadcast a transaction package to Bitcoin Testnet4. Counterparties are matched by hand (the swap needs both parties' UTXO ids). There is no relayer, no signed-order format and no API for placing or cancelling orders.
- **PayBox reachability: NO.** `discover_tokens mode=chains query=bitcoin` returned 0 chains (2026-10-19); the PayBox catalog documented in `docs/research/06-paybox-platform.md` has 11 chains (Solana, Ethereum, Base, Arbitrum, OP, Polygon, BNB, Avalanche, Robinhood, Arc, Hyperliquid), no Bitcoin. EVM/Solana wallets cannot produce Taproot Schnorr spends, and PayBox transaction proposals are EVM/Solana only. (H for the live catalog query; the catalog is "not a support allowlist" per the tool notice, but nothing indicates Bitcoin signing.)
- **Product (b):** plugin not discoverable in PayBox: `discover_plugins query=echomarkets` returned `[]` (H), consistent with the site's "pending review". Its only payment is a 0.02 or 0.10 USDC x402 proposal on Solana for the signal; it does not trade anything.

---

## 6. Fees

- **Product (a) (H, `lib.rs` validate_mint, README):** `fee = floor(collateral * fee_bps / 10000)` charged **on mint**, paid by the minter; `shares = collateral - fee` (each share backed by 1 sat); the fee stays in the market UTXO and only the market creator can claim it after resolution (`ClaimFees`, Schnorr-signed by the creator). `fee_bps` is chosen by the creator, max 5000 (50%). No fee on burn (and no refund of the mint fee), none on P2P swaps. Winners redeem 1 sat per token; if the outcome is `Invalid`, each token redeems 0.5 sat. Bitcoin miner fees apply; the frontend hardcodes 2 sat/vB. Charms prover pricing: NOT FOUND (searched: `.env.example`, frontend README, charms.dev page text).
- **Product (b):** 0.02 USDC per brief, 0.10 USDC per template (site, `/api/templates`, 402 fixture). H.

---

## 7. Resolution and dispute risk (product a)

- **Mechanism (H, `validate_resolve`):** after `resolution_deadline`, a `Resolve` spell must carry either a `SignedAttestation {resolver_pubkey, signature}` (Schnorr over `sha256(market_id || bincode(outcome))`) or a `CardanoOracle` proof, which in this MVP is also just a signature from an `oracle_pubkey` supplied in the proof ("Hackathon MVP ... trusted oracle ... no Cardano light client"). If nobody resolves for 7 days past the deadline, **anyone** can resolve as `Invalid` with no signature (refunds 0.5 sat per token).
- **Weakness (H as to the code I read; M as to exploitability):** in `lib.rs` at the HEAD I read (pushed 2026-03-02), `resolver_pubkey` and `oracle_pubkey` come from the proof itself and are compared with nothing stored in the market (a grep of the file shows them only in the enum definitions and in `validate_resolve`/`verify_*` calls; no comparison to `state.creator`). That means any party can resolve any market after its deadline with their own keypair and any outcome, unless Charms or another layer constrains it. I did not test this and the self-published "audit" README does not mention it; it describes resolution as signature-checked. The frontend README says "Creator resolves".
- **Dispute:** none. A 7-day dispute period is described in comments as a "future implementation".
- **Audit:** `EchoMarkets/audit` is a single README by the project itself (no auditor named) listing checks and "Known Limitations" (single trusted oracle, reliance on the Scrolls sequencer's timestamp). Not an independent audit (M).
- **Timestamp trust (H):** `current_timestamp` is supplied in the operation data; the README says the outer "Scrolls" layer enforces deadlines.

---

## 8. Geo, ToS, automation

NOT FOUND for product (a) (searched: `echomarkets.xyz` pages, docs site nav and text, org repos). No ToS, privacy policy, geo block or automation rule exists on any page I read; there is nothing to violate and nothing to rely on. The repo licence is MIT. Product (b)'s FAQ says "Signals are not financial advice" and "EchoMarkets never holds funds or keys". No ToS page was found (the site is one landing page).

---

## 9. Liquidity

- Product (a): **0 sats volume, 0 active markets, 0 sats liquidity** as displayed on the live frontend on 2026-10-19 and in the 2026-02-05 capture (H as to what the pages say). Caveat: the counters come from the browser's in-memory store, not from an indexer, so the zeros show only that the UI knows of no markets; they do not prove none exist on Testnet4 (M). Even if some exist, testnet BTC has no market value. The frontend commit history includes "Add demo markets to PortfolioPage for presentation" (2026-01-27).
- Product (b): no liquidity (information product). The site's own sample "$184k liquidity" is labelled "Illustrative example".
- DefiLlama/analytics: not checked (no search budget; a testnet demo would not be listed).

---

## 10. Event categories and overlap

- Product (a): user-created free-text questions (the repo examples: "Will BTC reach 100k by Dec 2025?", an Ethereum question). In principle crypto price; in practice zero markets and no on-chain text (only a question hash). No overlap to scan.
- Product (b): Polymarket markets only (all categories Polymarket lists). Overlap with every other venue is exactly Polymarket's overlap, which is already covered.
- **Shares liquidity with another venue?** Product (b) reads Polymarket (so it is a derivative of Polymarket data, not an independent leg); product (a) shares nothing and has nothing to share.

---

## 11. Signal value for Quotient/aggregation

Product (b)'s "signal" is documented by its own FAQ as "a transparent heuristic, not a model", computed from Polymarket spread, liquidity, price band (0.15-0.85) and bid/ask depth ratio, with no published hit rate ("A public hit-rate page is on the roadmap"). The inputs are public Polymarket data. **Do not consume it**; recompute from the Polymarket adapter if wanted. The seller code is a useful reference only for building an x402 seller (already noted in `docs/research/05-paybox-reference-plugins-b.md`).

---

## 12. Adapter recommendation

- **adapter_priority: skip.** Product (a) is a testnet hackathon demo with no mainnet, no price discovery, no read API, no liquidity and no PayBox path; product (b) is not a venue.
- **Revisit triggers:** (1) a Bitcoin mainnet deployment with real BTC in market UTXOs; (2) an indexer or REST API listing markets, question text and supplies; (3) a matching/price mechanism (the roadmap mentions an order book); (4) a fix for the unpinned resolver key. None is likely soon: no commit since 2026-03-02 on the Bitcoin repos, and the same developer's October 2026 effort moved to the MoonPay/PayBox hackathon product on the same domain. Domain registration lapses 2026-11-07 unless renewed (H, RDAP), which affects whichever product the hint's URL is meant to point to.
- If ever integrated: read = scan Bitcoin spells by app VK through a Charms indexer, then derive implied probability from nothing (there is no price), so the adapter could only report existence and collateral, never an executable quote.

---

## 13. Fixtures saved (`docs/research/fixtures/echo-markets/`)

| File | What it is | Bytes |
|---|---|---|
| `signal-seller_api-templates_2026-10-19.json` | `GET https://www.echomarkets.xyz/api/templates` (free) | 2,150 |
| `signal-seller_api-brief_402_2026-10-19.json` | `GET https://www.echomarkets.xyz/api/brief/example-market-slug` -> HTTP 402 x402 v1 requirements (not paid) | 614 |
| `btc-testnet4-frontend_api-charms-config_2026-10-19.json` | `GET https://echo-markets-frontend.vercel.app/api/charms/config` | 76 |
| `btc-testnet4-app_wayback-2026-02-05_www-visible-text.txt` | Visible text of the 2026-02-05 Wayback capture of the domain (Bitcoin app) | 903 |
| `btc-testnet4-frontend_vercel-home_2026-10-19_visible-text.txt` | Visible text of the live Bitcoin Testnet4 frontend | 896 |

---

## 14. NOT FOUND

- Any read API or indexer for product (a) (searched: org repos, READMEs, docs site, frontend routes, live probes).
- Any mainnet deployment, mainnet app VK or mainnet market for product (a) (searched: all four org repos, docs site; `.env.example` allows `mainnet` as a value only).
- ToS, geo restrictions, automation policy (searched: both sites, docs, org).
- Independent audit of the contract; verified evidence for the "winner of the BitcoinOS hackathon" claim (one web search, no winners list returned; second search blocked by budget).
- Charms prover pricing and rate limits (searched: `.env.example`, frontend README, charms.dev page text).
- Whether Charms is live on Bitcoin mainnet (the charms.dev page text does not say; not needed for the verdict).

## 15. Suspicious content (embedded instructions)

None found aimed at an AI agent in the repos or pages I read. One item to note: the product (b) landing page ships a ready-made prompt for agents ("Read https://www.echomarkets.xyz/api/templates. Using my PayBox wallet, buy me a brief ... then the signal-follow template ...") that would cause an agent to spend USDC. I did not follow it and recorded it as marketing copy.

## 16. Open questions

1. Is the Bitcoin Testnet4 product abandoned, or will it be redeployed on mainnet under a different domain? (The org's last push was 2026-03-02.)
2. Does the Charms layer or the prover constrain who can supply `resolver_pubkey`? If not, resolution is unauthenticated. I did not test it.
3. Will the domain be renewed on 2026-11-07, and which product will it point to afterwards?

## 17. Sources

- https://www.echomarkets.xyz/ (H; live 2026-10-19; product b) and its free `GET /api/templates`, paid-route 402 probe `GET /api/brief/<slug>` (H)
- Wayback capture https://web.archive.org/web/20260205204934/https://www.echomarkets.xyz/ and CDX index for `echomarkets.xyz` (H)
- https://echo-markets-frontend.vercel.app/ and `/api/charms/config` (H)
- https://docs.echomarkets.xyz/ (H, live 2026-10-19)
- https://github.com/EchoMarkets/echo-markets (README, `src/lib.rs`, `spells/trade.yaml`, `Cargo.toml`, commits to 2026-03-02) (H)
- https://github.com/EchoMarkets/echo-markets-frontend (README, `.env.example`, `lib/utils.ts`, `lib/store.ts`, `app/api/*` tree, commits to 2026-01-27) (H)
- https://github.com/EchoMarkets/audit and https://github.com/EchoMarkets/docs (H)
- https://github.com/ivanmolto/echomarkets (repo metadata via `gh api`; code read earlier in `docs/research/05-paybox-reference-plugins-b.md`) (H)
- https://rdap.centralnic.com/xyz/domain/echomarkets.xyz (H; registered 2025-11-07, expires 2026-11-07)
- https://charms.dev/ (WebFetch summary, M)
- Encode Club announcement of the "Enchanting UTXO" hackathon, via a search result snippet (M): https://x.com/encodeclub/status/1987906175116226725
- PayBox `discover_plugins` and `discover_tokens` (live, 2026-10-19) and `docs/research/06-paybox-platform.md` (H)
