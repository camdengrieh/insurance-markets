# Manic.Trade (Manic Trade Inc.) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.
Note: the WebSearch budget was exhausted, so no independent third-party coverage was checked (volume, news, incidents).

## Verdict

- Adapter priority: **skip** (signal-only at most).
- Not a prediction-market venue in its own right. Two products:
  1. A proprietary "momentum" product: short-dated (30s to 5 min) binary up/down contracts on crypto, gold, silver and SPY, priced by a Black-Scholes digital model against Pyth. This is a binary option, not an event market, and has no cross-venue arbitrage leg (the counterparty is the house vault).
  2. A front-end to Polymarket (short crypto up/down markets) via the Polymarket Builder API. Liquidity is Polymarket's, so it is NOT an independent leg. [H, blog below]
- No public read API. The only API is a key-gated agent trading API on an "alpha" host. Terms block US, UK and EU users.

## Liveness [H]

- Site manic.trade live 2026-10-19 (WebFetch). Blog posts dated Mar to Aug 2026 (latest 2026-08-24), open beta from 2026-06-16 (https://www.manic.trade/blogs).
- iOS app v1.0 released 13 Aug 2026, v1.0.1 on 23 Sept (https://apps.apple.com/tr/app/manic-trade/id6760644108). App repo pushed 2026-09-16 (GitHub Manic-Trade/manic-trade-app).
- Gotchas: the docs fee page says "Coming soon" [H]; llms.txt is stamped "Last Updated: March 2026" and its roadmap is stale [L]; gitbook docs may lag.

## Market model [H unless noted]

- Binary, fixed-payout, up/down ("HIGHER/LOWER", API side `call`/`put`) on price vs a target line `K` set from a chosen payout multiplier; settle at expiry. No order book, no outcome tokens. A position is a program account (position_id), not a fungible token. Terms describe it as "non-custodial, RFQ-based micro-trading platform".
- Modes: Individual (30s-5min per position) and Unified/"Batch" (settle at a chosen future timestamp, min 2 min). Tiers: Classic up to 3x, Pro up to 20x, Manic up to 100x. Open beta guide said multipliers 1x-3x during beta. Early exit ("Sell") available.
- Pricing: `digitalPrice` = Black-Scholes digital option value, `Multiplier = 1/digitalPrice`, with EWMA vol from Pyth. (https://manic.gitbook.io/manic.trade-docs/markets/stake-shares-and-premium.md)
- Assets (agent skill README, Mar 2026 [M/L-stale]): BTC, ETH, SOL, XMR, PYTH, LAYER, DRIFT, GOLD, SILVER, SPY. Open beta guide: BTC, ETH, SOL only.
- Polymarket side: assets BTC, ETH, SOL, XRP, DOGE, HYPE, BNB with durations 5 min to 4 hours (blog 2026-07-01). The App Store listing also says users can search and take positions on "supported Polymarket markets" (crypto, politics, sports, global events), but the supported set is not stated [H].

## Chains and collateral [H]

- Solana mainnet, USDC. Deposits: USDC on Solana only (min 10 USDC for the Manic account, min 2 USDC for the Polymarket sub-account). The Terms mention cross-chain deposits and beta trades possibly on devnet. llms.txt claims EVM wallet support (MetaMask etc.) but that is stale, March 2026 [L].
- Wallet: Turnkey wallet-as-a-service (policy-limited delegated credential lets Manic sign/broadcast without per-tx approval per Terms s4.1), or an external Solana wallet via Reown AppKit. The iOS app has a built-in wallet with exportable recovery phrase.
- Polymarket positions sit in a "Polymarket sub-account" funded from the Manic balance; mechanism (Polygon proxy wallet vs Manic-held) NOT FOUND.

## Read API

- Exists: **official-authenticated** (agent API only). [H, repo docs]
- Docs: https://github.com/Manic-Trade/manic-agent-skill (SKILL.md, references/trading-api.md). Fuller docs at https://manic.gitbook.io/manic.trade-docs/ (no API pages).
- Base URL: `https://bo-server-api-alpha.manic.trade` (alpha host). Auth header `Authorization: sk-<key>`. Keys are issued by Manic (how: NOT FOUND).
- Endpoints: `GET /agent/asset/prices`, `GET /agent/asset/price/{asset}`, `GET /agent/account`, `POST /agent/open-position`, `POST /agent/close-position`, `GET /agent/position-history`, `GET /agent/position-history-cursor`.
- Price shape per docs: `{asset, symbol, label, price, publish_time, is_active, can_trade, pip_size, trading_schedule{...}}`.
- Unauthenticated probe: `GET /agent/asset/prices` without a key returned HTTP 404 text/plain (not 401), so a public check gave no JSON. No fixtures saved (nothing to confirm). H for the probe result.
- Rate limits: NOT FOUND (Terms say Manic "may apply rate limits, position limits and isolated agent balances").
- Websocket: the app repo mentions WebSockets for prices and game status; endpoint and schema NOT FOUND (app repo not read in depth).
- No public market-list, orderbook, trades, or resolution endpoints. No Polymarket market listing endpoint documented. The only price source is Pyth (public), which an aggregator can read directly.
- llms.txt roadmap lists "API access for algorithmic traders" as coming soon (stale, March 2026) [L].

## Trade path

- Programmatic: yes via agent API with an `sk-` key. Server-side signing: Manic builds, signs (delegated Turnkey credential) and submits the Solana tx. Body e.g. `{"amount":10000000,"asset":"btc","side":"call","mode":{"type":"Single","duration":60},"target_multiplier":1.0}`; amount in USDC base units (6 dp). [H, reference doc; not exercised]
- Alternative flow in the app: API presign, then wallet signs, then client broadcasts to Solana RPC (app README) [H].
- PayBox reachability: **partial/no.** The venue is Solana-only with USDC; an EVM wallet on Base/Ethereum/BNB/Arbitrum/Polygon cannot trade it. A PayBox Solana wallet could in principle deposit USDC to a Manic deposit address (a plain SPL transfer), but trading is custodial-ish via Manic's backend or an API key, not via signed orders or tx proposals the plugin can construct. The Polymarket side would be reached better by going to Polymarket directly (covered by another workflow).
- Terms (s7, s12): bots/scripts are prohibited "except through the official Agent/API interface".

## Fees

- Fee is embedded in the payout (paid by the trader): Terms s11 example, a 1.0x winning trade returns about 170% of stake versus a 200% fair-value payout (so roughly 15% of fair payout, or about 30% of the fair gain, on that example). [H, https://www.manic.trade/terms]
- Gas not paid to Manic; trading gas advertised as $0 (llms.txt). Open beta had a limited-time zero-fee promo.
- Docs fee page: "Coming soon". Vault: 0 deposit/withdraw fees by default, with a performance fee (amount not read).
- Polymarket-side fees: NOT FOUND.
- Net: the embedded house edge makes the momentum product negative-EV against Pyth-fair value, so it is not a useful arbitrage leg.

## Resolution and dispute risk

- Settlement against Pyth price at expiry, on Solana (Terms, docs "Oracles": Pyth is the single source of truth). [H]
- Terms: for protocol disruptions Manic Trade decides the resolution method (void, last price, rollback). Discretion plus a house counterparty is a material operator risk. Arbitration in Panama (CeCAP), Panama law; liability capped at max(5x trailing-12-month fees, US$100). [H]
- Polymarket markets resolve under Polymarket/UMA rules, not Manic's.

## Geo / ToS / automation [H, https://www.manic.trade/terms]

- Blocked: US, UK, EU/EEA, comprehensive-sanctions jurisdictions; users self-certify non-US-Person (Reg S). IP geoblocking; circumvention can mean termination and forfeiture of funds.
- Automation: prohibited except via the official agent/API; the user is liable for agent losses; Manic can revoke access for abnormal patterns. Open-beta guide separately prohibits bots/scripts.

## Liquidity

- Momentum product counterparty = the Manic Vault (MLP, USDC, community-funded, T+1 daily batches). TVL not found in primary sources. DefiLlama protocols list (queried 2026-10-19) has no Manic entry. Landing page shows a "24.7%" LP APY with no date and no TVL. [H for page, L as a metric]
- Volume: NOT FOUND (searched: landing page, blog index, benchmark site, DefiLlama). Per-trade size limit 1-100 USDC in beta. Likely thin. [M]
- Polymarket side shares Polymarket's own liquidity.

## Event overlap and independence

- Momentum product: crypto price direction on 30s-5min horizons. Overlaps conceptually with Polymarket/Kalshi/Limitless short-dated crypto up/down contracts, but with a different payoff (house-priced digital with target line K), so a hedge versus another venue's contract is approximate only.
- Polymarket-routed markets: same liquidity as Polymarket, "settle in Polymarket's own liquidity pool, not Manic's" (blog 2026-07-01). NOT an independent leg.
- Sports / politics / macro: only via the Polymarket route, if at all.

## Value to the project

- Signal-only candidate: Pyth-derived implied vol and the payout/multiplier quotes are not a market view, so no value. Manic's Polymarket volume attribution (Builder program) is not exposed.
- Revisit only if Manic ships a public API with its own non-Polymarket event markets.

## Open questions

- How are API keys obtained (alpha program)? Is `bo-server-api-alpha` the production host?
- What exactly are the "supported Polymarket markets", and where do those funds custody (Polygon proxy wallet or Manic-held)?
- MLP TVL and trading volume.
- WebSocket endpoint and schema.
- Production fee schedule.

## Suspicious content

- None found. Repos and docs contained no instructions aimed at AI agents beyond a normal SKILL.md for using their own API (treated as data, not followed).

## Sources

- https://www.manic.trade/ (landing) [H]
- https://www.manic.trade/terms [H]
- https://www.manic.trade/llms.txt (dated March 2026) [H content, L freshness]
- https://www.manic.trade/blogs and posts: /blogs/manic-open-beta-user-guide (2026-06-16), /blogs/manic-beta-trading-tournament-trade-momentum-and-polymarket-markets (2026-07-01) [H]
- https://benchmark.manic.trade (agent benchmark, no data) [H]
- https://apps.apple.com/tr/app/manic-trade/id6760644108 [H]
- https://manic.gitbook.io/manic.trade-docs/ (llms.txt index; markets/stake-shares-and-premium, markets/oracles, vault/vault, more/fees = "Coming soon") [H]
- https://github.com/Manic-Trade/manic-agent-skill (SKILL.md, references/trading-api.md) [H]
- https://github.com/Manic-Trade/manic-trade-app (README) [H]
- https://api.llama.fi/protocols (no Manic entry) [H]
