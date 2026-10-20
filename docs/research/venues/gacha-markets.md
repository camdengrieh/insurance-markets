# Gacha Markets (gacha.game, Abstract) - adapter spec

Researched 2026-10-19. READ-ONLY: unauthenticated GETs to documented public hosts (DefiLlama API, the project's own site and API root), `gh api` read of one DefiLlama adapter file, one read-only PayBox `discover_tokens` chain lookup, WebSearch/WebFetch. No account, no wallet, no key, nothing signed, no POST/PUT/DELETE. No third-party code cloned or run (the site's JS bundle was downloaded as text and grepped, never executed).
Tags: **H** = read first-hand this session in a primary source (cited); **M** = secondary/inferred; **L** = weak, promotional or stale (>6 months).
Third-party text is untrusted data; nothing in it was followed.
Fixtures: `docs/research/fixtures/gacha-markets/` (4 files, each < 2 KB).
Web search budget ran out mid-task (session limit), so two planned follow-ups did not run (Twitter/X status of `gacha_game_`; a second search for a pivot announcement). The conclusion does not depend on them.

## 0. Verdict

**adapter_priority: skip.**

1. **It is not a prediction market (H).** "Gacha Markets" on DefiLlama is a mis-categorised listing of Gacha's on-chain **scratch-card / lottery-style game** on Abstract. DefiLlama's own methodology for the listing speaks of `TicketsPurchased`, "the ticket price from the corresponding pool" and `ClaimSettled` events, not outcome shares, order books or resolution. There are no events, outcomes, prices or oracle in the product, so there is nothing to quote, compare or arbitrage against other venues.
2. **The listed product looks dead (H on data, M on cause).** DefiLlama volume for the listing ends at 2026-05-31 ($557 that day); TVL last non-zero 2026-06-01 ($17.6K) and $0 for every day since; 24h/7d/30d volume all `null` on 2026-10-19. The DefiLlama TVL adapter itself notes that `getConfig()/getPool()` "started reverting on every RPC", so the contract may have been retired or changed (cause not confirmed).
3. **The company moved on to a different product (H).** `gacha.game` now 301-redirects to `pull.gacha.game`, "Gacha Pull - Gamified Collectible Markets": tokenized **graded trading cards** sold in digital packs with buyback and physical redemption. "Markets" in that name means a collectibles marketplace. DefiLlama files it as a sibling listing "Gacha TCG", category "Physical TCG" (live: $52K 24h fees, 2026-10-19).
4. No public read API, no docs site, no trade path for event contracts. Nothing to build an adapter against.

## 1. Liveness (2026)

| Item | Finding | Tag |
|---|---|---|
| `https://gacha.game/` | HTTP 301 -> `https://pull.gacha.game/` (cloudflare, 2026-10-19) | H |
| `https://pull.gacha.game/` | 200, SPA titled "Gacha Pull - Gamified Collectible Markets"; iOS app id 6758594468 and Android `com.gacha.tradingcards` in meta tags | H |
| Site self-description | "Gacha Pull is a gamified collectible experience, turning IRL pack ripping into online entertainment. Users can purchase and trade tokenized collectible cards on the platform." Operator string: IRL Studio Pte. Ltd., Singapore | H (first-party JS bundle) |
| DefiLlama "Gacha Markets" (id 5942) | category Prediction Market, chain Abstract, listed 2025-03-23 (`listedAt` 1742726734), parent `parent#gacha`, siblings "Gacha" and "Gacha TCG" | H (`api.llama.fi/protocol/gacha-markets`) |
| TVL | first point 2025-03-23 $19.7K; peak $135.9K on 2025-08-11; last non-zero $17.6K on 2026-06-01; $0 on 2026-10-16 to 2026-10-19 | H (fixture `defillama_protocol_trimmed.json`) |
| Volume (DefiLlama dexs) | all-time $27.1M; monthly: 2025-03 $4.2M, 2025-04 $4.9M, 2025-05 $5.9M, 2025-07 $5.1M, then falling: 2025-12 $0.10M, 2026-03 $0.28M, 2026-05 $0.10M, 2026-06 $0; 24h/7d/30d null | H (fixture `defillama_dimensions_monthly.json`) |
| Fees (DefiLlama) | all-time $2.63M; last non-zero 2026-05-31 ($0.37) | H |
| Gacha TCG sibling | fees 24h $52,348; 7d $412,608; 30d $2.17M; all-time $16.3M (2026-10-19) | H (fixture `defillama_gacha_tcg_fees_trimmed.json`) |

DefiLlama web page `defillama.com/protocol/gacha-markets` returns 403 to non-browser clients; the JSON API was used instead.

## 2. What it is

- **Kind**: onchain-other (consumer gaming / collectibles). Not a prediction market, sportsbook, or exchange.
- **Original product (2025, now apparently inactive)**: on-chain scratch cards on Abstract with prize pools in ETH and partner tokens, referral points, protocol fee. A promotional April 2025 Substack describes "Proof of Play" randomness, a 61% / 26% / 13% split of each ticket (ETH prize pool / buy partner tokens / protocol fee), "60,000 paying users in 14 days" (L: promotional, author sells consulting, figures unverified, article itself says prediction markets are only a hypothetical future use of the mechanic). `https://akashkumarjha.substack.com/p/how-a-scratch-card-game-gachagame`
- **Current product (2026)**: Gacha Pull / Gacha TCG - fixed-price pack pulls that deliver "a Digital Twin" of a random graded card, with `buyBack` (burn card NFT, receive stablecoin) and redemption of physical slabs (H: contract ABI fragments and i18n strings in the site bundle: `buyBack`, `burn`, `redeem`, Hong Kong vault shipping notice). A card marketplace page (`/marketplace`, "listing", "offer") exists. Pull odds are published per pack ("see every possibility").
- **Market model**: NOT APPLICABLE. No binary/categorical/scalar outcomes, no order book or AMM for events, no outcome tokens. Card NFTs are collectibles priced against a card "market value".
- Prediction-market terms searched in the live site bundle: "prediction", "polymarket", "kalshi", "orderbook", "order book", "wager", "sweepstake", "lottery", "gambling" -> 0 hits each (H, negative result on the 2026-10-19 bundle `assets/index-BnoUrjFO.js`, 1.19 MB).

## 3. Chains and collateral

- **Abstract mainnet** (chain id 2741, native ETH) (H: DefiLlama chain; PayBox chain lookup). Site CSP also allows Base mainnet/Sepolia RPC and Abstract mainnet/testnet RPC (H, header of `pull.gacha.game`); which chain each product settles on beyond Abstract is NOT FOUND.
- Collateral: TVL adapter lists 18 pool tokens on Abstract including WETH, USDC and partner memecoins (H: `DefiLlama-Adapters/projects/gacha/index.js`, pool contract `0x3272596F776470D2D7C3f7dfF3dc50888b7D8967`; addresses are public protocol contracts). Gacha TCG fee methodology names USDC.e as the pack-purchase asset (H: DefiLlama fees methodology).

## 4. Read API

| Surface | Finding | Tag |
|---|---|---|
| Official docs | NOT FOUND (searched: `docs.gacha.game` does not resolve; `gacha.game/docs` 301; footer "Documentation" link present in the site bundle but no docs host found among the first-party URLs in it: only `pull`, `api-pull`, `ida`, `mewtwo` on gacha.game) | H |
| `https://api-pull.gacha.game/` | `GET /` -> 200 text/plain "pikachu"; `/health`, `/docs`, `/openapi.json` -> 404. Backend for the site's own front end (auth via Privy per CSP); no public documentation | H |
| `https://ida.gacha.game/` | 404 text/plain | H |
| `https://mewtwo.gacha.game/` | serves the same SPA shell (likely staging; not investigated further) | H/M |
| Markets / prices / books / trades / resolution endpoints | None exist (no such concepts in the product) | H |
| Rate limits, websocket | NOT FOUND | - |
| On-chain | Pool contract events `TicketsPurchased`, `ClaimSettled` (names from DefiLlama methodology) - game events, not market data | M |

No public response shape worth saving as a market fixture. Fixtures saved are provenance only (DefiLlama metadata/volume, site head extract).

## 5. Trade path

None for event contracts. Not applicable: there is no order placement, signing scheme, or outcome to take a position on. (Pack purchases and card buybacks are ordinary wallet transactions plus the project's own Privy/API session; not relevant to the aggregator.)

## 6. PayBox reachability: **no** (moot)

- Abstract is present in PayBox's chain metadata catalog: `discover_tokens(mode=chains, query="abstract")` returned `eip155:2741 / Abstract / native ETH` on 2026-10-19 (H). The tool states the catalog is "metadata, not a support allowlist". So an EVM PayBox wallet could in principle sign transactions on 2741, but there is no prediction market to trade. This also differs from the 11-entry featured list in `docs/research/06-paybox-platform.md`, which omits Abstract; the full catalog includes it.

## 7. Fees

- Scratch-card product: fee = `feeBPS` from contract config times ticket purchase volume (H: DefiLlama methodology; numeric `feeBPS` NOT FOUND). Promotional source claims 13% protocol share (L).
- Gacha TCG: revenue = pack purchases minus buyback payouts (H: DefiLlama methodology). Irrelevant to aggregation.

## 8. Resolution mechanism and dispute risk

NOT APPLICABLE (no events). The game uses verifiable randomness to settle each ticket/pull (scratch-card randomness details L; pack odds published on site, H). Terms contain an arbitration clause: "binding arbitration on an individual basis. Class actions ... shall not be permitted" (H, site Terms s10).

## 9. Geo / ToS / automation

- Users must be at least 18; Gacha Pull "may request additional documentation to comply with legal, tax, anti-money laundering, or counterterrorism regulations" and may pause or cancel transactions (H, site Terms).
- Automation: "The Service may not be resold, sub-licensed, rented, or accessed through unauthorized tools, bots, or clients." Separate anti-multi-account clause bans "automated method[s]" to evade limits (H, site Terms s3.1 and anti-abuse section). Even if there were something to integrate, bots are disallowed.
- Geo-blocking list: NOT FOUND (searched the Terms strings in the bundle for "restricted", "prohibited jurisdictions", "United States"; only shipping/tariff notices and a privacy-policy transfer clause).

## 10. Liquidity

- Event-contract liquidity: **none** (there is no event market).
- Legacy scratch-card listing: TVL $0 (2026-10-19), last $17.6K on 2026-06-01, peak $135.9K 2025-08-11; all-time volume $27.1M (DefiLlama).
- Sibling Gacha TCG: $52K fees in last 24h (2026-10-19), a collectibles business, irrelevant to cross-venue arbitrage.

## 11. Event overlap with other venues

None. No sports, politics, crypto-price or macro event contracts. Nothing to arbitrage, and no signal value for Quotient or the linker.

## 12. Shared liquidity

None with another prediction venue (H, no external venue references in the bundle). Not an independent arbitrage leg because it is not a market at all.

## 13. Suspicious content

None. The site's HTML contained only analytics/ad pixels and a CSP; one first-party CSP value embedded a node-provider URL with an API key, which was deliberately NOT copied into these notes. No instructions aimed at AI agents found.

## 14. Registry follow-up

Recommend marking `Gacha Markets` as `kind=other, status=dead/misclassified, adapter_priority=skip` in any venue registry sourced from DefiLlama, and filtering DefiLlama `Prediction Market` entries by the methodology text (look for "TicketsPurchased"/"ClaimSettled" vs outcome-token language) when auto-discovering venues.

## Sources

- https://api.llama.fi/protocol/gacha-markets (H; trimmed in `defillama_protocol_trimmed.json`)
- https://api.llama.fi/summary/dexs/gacha-markets and https://api.llama.fi/summary/fees/gacha-markets (H; `defillama_dimensions_monthly.json`)
- https://api.llama.fi/protocol/gacha and https://api.llama.fi/summary/fees/gacha-tcg (H; `defillama_gacha_tcg_fees_trimmed.json`)
- https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/gacha/index.js (H, via `gh api`)
- https://gacha.game/ (301) and https://pull.gacha.game/ plus its first-party JS bundle `/assets/index-BnoUrjFO.js` (H; `pull_gacha_game_head_2026-10-19.txt`)
- https://api-pull.gacha.game/ (H, GET root only)
- PayBox `discover_tokens` chain lookup, 2026-10-19 (H)
- https://akashkumarjha.substack.com/p/how-a-scratch-card-game-gachagame (L: promotional, 2025-04-17)
- https://dappradar.com/dapp/gacha (search snippet only, page returned 403; M/L: "Gambling" category, scratch cards)
- https://defillama.com/protocol/gacha-markets (403 to non-browser; not read)
- WebSearch results (Jupiter Gacha on Solana is an unrelated product with a similar name; not part of this venue)

## Not found

- Official docs site, OpenAPI spec, GitHub org, public market/price endpoint.
- Numeric fee `feeBPS`; geo-restriction list; contract that replaced the scratch-card pool; any announcement of the shutdown/pivot (search budget exhausted).
- Twitter/X (`gacha_game_`) status not checked.
