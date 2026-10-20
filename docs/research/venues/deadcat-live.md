# Deadcat.live - venue spec (2026-10-19)

Verdict: adapter_priority = skip. Alpha desktop app on Liquid (Bitcoin sidechain, Simplicity covenants). Defaults to Liquid TESTNET, no HTTP API, discovery only via Nostr relays (one of three default relays requires NIP-42 auth, the other two returned zero market events), no evidence of any mainnet markets or liquidity, non-EVM so not reachable via PayBox.

Confidence tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## 1. Still live?

- Homepage https://deadcat.live returns HTTP 200 (Cloudflare + Next.js on Railway) but the served HTML is only a stub: title "Deadcat.live | Liquid Prediction Markets", body "Opening Deadcat...". No market list, stats, docs or links. /api/markets, /markets, /download, /robots.txt all 404. [H, curl 2026-10-19]
- GitHub Resolvr-io/deadcat: not archived, last push 2026-07-01 (about 3.5 months before today), 6 stars, no license set. Latest release tag alpha-b163565 published 2026-04-30 (version 0.1.0 installers: dmg x64/arm64, AppImage, deb, rpm). Last commits (2026-07-01) "use standard Liquid wallet derivation"; 2026-05-06 CI/test fixes. [H, gh api]
- Status: early alpha, actively developed until July 2026, quiet since. "Live" only in the sense of repo + stub site. [H/M]
- Simplicity docs list Deadcat (and Astrolabe, a reinsurance platform) as Resolvr projects built on Simplicity. [H, https://docs.simplicity-lang.org/use-cases/]

## 2. Kind and market model

- kind: onchain-other (Liquid/Elements UTXO covenants + Nostr for discovery). [H]
- Binary YES/NO markets (single event) via a binary Prediction Market covenant; also a Multi-Outcome market covenant (N mutually exclusive outcomes, each with YES/NO tokens, atomic cross-outcome split/swap). Spec describes these as the implementation target; legacy SDK source "still differs". Scalar: not found. [H, docs/contracts/contract-specification.md]
- Outcomes are tokenised as Liquid (Elements) issued assets: YES token, NO token, plus YES/NO "reissuance tokens" (RTs) held by the covenant. 1 YES + 1 NO is backed by `cp = base_payout x 2` of collateral; redeemable post-resolution. [H]
- Trading venues: (a) Maker Order covenant = fixed-price limit order against a market token, cancellable, fills partial with min_fill_lots; (b) LMSR Pool covenant = on-chain binary AMM (LMSR, deterministic lookup table, per-pool `fee_bps`, YES price in bps); multi-outcome markets compose N binary LMSR pools. So hybrid order book (off-chain announced on Nostr, filled on-chain) plus AMM. [H, contract-specification.md, lmsr-pool-design.md, discovery/mod.rs]
- Covenant states: 0 Dormant, 1 Unresolved, 2 ResolvedYes, 3 ResolvedNo, 4 Expired. [H, AGENTS.md]
- Anyone can create a market (creator picks oracle pubkey, collateral, expiry). Market metadata (question, category, description, resolution_source) lives in the Nostr announcement, not on-chain. [H, discovery/market.rs]

## 3. Chains and collateral

- Liquid Network (Elements sidechain of Bitcoin); code supports `liquid`, `liquid-testnet`, `liquid-regtest`. [H, network.rs]
- Collateral: any Elements asset in a "well-known set" (README/spec: L-BTC, USDt on Liquid, other). Units are smallest unit of the asset (sats for L-BTC). base_payout from a 1-2-5 table. [H]
- IMPORTANT: app defaults to testnet on first launch ("First launch detected - defaulting to Testnet network", src-tauri/src/lib.rs); SDK `NETWORK_TAG` constant = "liquid-testnet"; commands.rs hardcodes `network_tag: "liquid-testnet"` in two places. Mainnet code paths exist (Boltz mainnet URL, BIP84 path 1776 for mainnet, esplora `blockstream.info/liquid/api`) but no evidence mainnet markets are published. Whether Simplicity is active on Liquid mainnet: NOT FOUND (searched: simplicity-lang use-cases page does not say; web search budget exhausted before a dedicated search could be run). [H for code, unknown for mainnet]

## 4. Read API

- exists: onchain-or-subgraph-only (strictly: Nostr relay events + Liquid chain; no HTTP API). No docs site, no REST/WS API, no indexer, no SDK published for third parties (SDK crate `deadcat-sdk` lives inside the app repo, Rust, unpublished as far as seen). [H for repo; NOT FOUND (searched: deadcat.live paths, repo tree, README, GitHub org) for any public API]
- Discovery is Nostr: event kind 30078 (NIP-78 addressable). `d` tag = market_id hex; `t` tags: `deadcat-contract` (markets), `deadcat-order` (limit orders), `deadcat-pool` (LMSR pools), `deadcat-attestation` (oracle resolution); `network` tag (`liquid` / `liquid-testnet` / `liquid-regtest`); `client` tag "Deadcat.live". Content is JSON `ContractAnnouncement` incl. `creation_tx_hex`, anchor, contract params, metadata (question/category/description/resolution_source). Clients validate the creation tx before accepting the market. [H, discovery/mod.rs, discovery/market.rs]
- DiscoveredMarket fields (app view model): market_id, question, category, description, resolution_source, oracle_pubkey, expiry_height, cpt_sats, collateral_asset_id, yes/no_asset_id, reissuance tokens, creator_pubkey, state, `yes_price_bps`/`no_price_bps` (from pool reserves), lifecycle txids. [H]
- Default relays: wss://relay.astrolabe.finance, wss://relay.damus.io, wss://relay.primal.net. Optional author filter via `DEADCAT_SOURCE_NPUB` (default vanity npub `npub1deadcat0qanhns8rxp7tqz8h0vptf2a8d7cvkfjfnkwcflrkh8nq0p9tyj`, i.e. the app only shows markets from one "source" author by default). [H]
- Live probe 2026-10-19 (read-only REQ, kinds [30078], `#t` each of the four tags): damus and primal returned EOSE with 0 events for every tag. astrolabe relay (NIP-11: name "astrolabe-contracts", software github.com/Resolvr-io/relay v0.8.0, NIPs 1,9,11,40,42,70) answered the REQ with `["AUTH", challenge]` (NIP-42) and 0 events; not authenticated (would require signing). So: no market data publicly readable; all real data likely sits on the auth-gated relay. [H]
- Prices/books: not available over any API. Would have to be reconstructed from Nostr order events (`deadcat-order`: price, offered_amount, direction, covenant_address) and pool events/Liquid UTXO reserves (esplora `https://blockstream.info/liquid/api` or Electrum `ssl://blockstream.info:995`). Trades: derive from chain. Resolution: `deadcat-attestation` events and covenant state on chain. [M, inferred from code]
- Auth/limits/websocket: Nostr websocket is the only stream; astrolabe relay needs NIP-42 AUTH; relay limits: max_subscriptions 50, default_limit 500, max_message_length 131072. [H, NIP-11 fixture]

## 5. Trade path

- No server-side order API. Trading = building and signing Liquid/Elements PSETs locally (Rust SDK, LWK wallet) that spend Simplicity covenants (maker-order fill, LMSR pool swap, issuance/cancel/redeem), plus broadcasting Nostr events (orders/pools) signed with a Nostr key. Signing scheme: Elements transaction signatures from an LWK software signer (BIP39 mnemonic; BIP84 standard Liquid derivation) and Nostr BIP-340 events (NIP-01). Wallet mnemonic encrypted backups to Nostr (NIP-44/NIP-78). Desktop (Tauri) only; no headless/CLI mode seen. [H, README, sdk.rs, AGENTS.md]
- Programmatic access for an agent would require embedding the Rust `deadcat-sdk` (not published, no stability guarantee) or reimplementing Simplicity covenant witness construction. Not realistic. [M]

## 6. PayBox reachability

- paybox_reachable: no. Liquid/Elements UTXO chain with Simplicity covenants; no EVM or Solana contract, no signed-order endpoint. PayBox EVM/Solana wallets cannot propose transactions to it. Boltz swaps in the app bridge Lightning/Bitcoin/Liquid only (per README); no EVM bridge documented. [H/M]

## 7. Fees

- Network fees: Liquid tx fees (L-BTC), paid by the transactor. Boltz swap fees for Lightning/BTC on/off-ramp (Boltz schedule, not researched). [M]
- LMSR pool: per-pool `fee_bps` (u16, convention range 0..4095) = swap fee to the pool operator; `fee_c = FEE_DENOM(10000) - fee_bps` in the deterministic table spec. A test in sdk.rs uses 30 bps. No protocol/platform fee found in the code or docs. Maker orders: fixed price, filler pays tx fee. [H for pool fee_bps; NOT FOUND (searched: docs/contracts, sdk constants) for any protocol fee]

## 8. Resolution and dispute risk

- Single-oracle, creator-chosen: each market has an `oracle_public_key` (BIP-340 x-only). Resolution spend path requires a Schnorr signature over `tagged_hash("deadcat/oracle_attestation", market_id || outcome_byte)` (0x01 YES, 0x00 NO). Oracle authority is "narrow" (only picks outcome). Oracle signing is also published as a Nostr `deadcat-attestation` event. [H, docs/protocol/oracle-bip340-tagged-hash.md; note doc is titled "Proposed Change" so SDK may differ]
- Expiry: after `expiry_time` (block height, 60-block rounding) anyone can move collateral to Expired state; tokens redeem at HALF value (either side). Dormant (0 outstanding pairs) markets can be resolved/expired too. [H]
- Dispute: no dispute or bond mechanism found; trust is entirely in the market creator's oracle key (can be a human/service). Risk is high for aggregation: oracle can sign the wrong outcome or never sign (then 50% expiry payout). `resolution_source` is free-text. [H/M]

## 9. Geo / ToS / automation

- No ToS, geo-blocking or API usage rules found (NOT FOUND, searched: repo, homepage). Non-custodial desktop app; no API to rate-limit. Repo has no license file set (legal status of reuse unclear). AGENTS.md is contributor guidance for the repo's own agents, not a venue policy. [H]

## 10. Liquidity

- NOT FOUND (searched: homepage, README, docs, relays, GitHub). No volume/OI/TVL published anywhere; open relays hold zero market events as of 2026-10-19. App defaults to testnet, so any liquidity is likely test funds. Treat as zero. [H for absence on open relays; L otherwise]

## 11. Event categories and overlap

- App categories: Bitcoin, Politics, Sports, Culture, Weather, Macro (README). These are creator-supplied tags; no evidence of actual listed events. `mock-markets.md` in repo is mock data. Overlap with other venues is theoretical only. [H for categories, M otherwise]
- Liquidity shared with another venue: none (own covenants). Independent in principle, but with no liquidity it is not a usable arbitrage leg. [M]

## 12. Open questions

- Are there any mainnet markets/pools, and is Simplicity active on Liquid mainnet? (needs auth to relay.astrolabe.finance, or scanning Liquid chain; not done - signing prohibited)
- Does the astrolabe relay require auth for read, or only for REQ without a known pubkey? Only a NIP-42 AUTH challenge was seen.
- Is a hosted web app planned behind deadcat.live ("Opening Deadcat..." stub, possibly a deep link into the desktop app)?

## Sources

- https://deadcat.live (200, stub HTML, checked 2026-10-19) [H]
- https://github.com/Resolvr-io/deadcat (repo metadata, README, AGENTS.md, releases, commits via gh api) [H]
- docs/contracts/contract-specification.md, docs/contracts/lmsr-pool/lmsr-pool-design.md, docs/protocol/oracle-bip340-tagged-hash.md, docs/architecture/trade-routing-algorithm.md in that repo [H]
- src-tauri/crates/deadcat-sdk/src/{network.rs,discovery/mod.rs,discovery/market.rs,discovery/config.rs}, src-tauri/src/{lib.rs,commands.rs} in that repo [H]
- https://relay.astrolabe.finance (NIP-11 JSON, REQ -> AUTH challenge) [H]; wss://relay.damus.io and wss://relay.primal.net (REQ -> 0 events) [H]
- https://docs.simplicity-lang.org/use-cases/ (Resolvr/Deadcat/Astrolabe mention) [H]
- Fixtures: docs/research/fixtures/deadcat-live/relay-astrolabe-nip11.json, docs/research/fixtures/deadcat-live/nostr-req-results-2026-10-19.txt
