# Mash (mash.fun) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand in a primary source this session, M = secondary or inferred, L = weak or stale.

## Verdict

Adapter priority: **skip** (revisit only as P2 signal source). Mash is a sports *perpetuals* DEX (a fork of the Drift v2 program on Solana) with scalar index markets (goals, corners, shirt-number sums). It is not a binary prediction market. Its outcomes are not YES/NO tokens, so there is no direct price-parity arbitrage against binary venues. Documentation is unreachable (docs.mash.fun does not resolve), the order-book API host presently fails TLS, and no public volume figure was found.

## Liveness (2026)

- https://mash.fun/ and https://app.mash.fun/ return HTTP 200 with title "MASH | Sports Perps on Solana" (H, fetched 2026-10-19). A live frontend does not prove active markets.
- Dec 2025 trade press: "Mash.fun adds new 'sports perps' markets" (European Gaming Industry News, 2025-12-04). The page returned 403 to my fetch, so I only saw the search snippet (M, about 10 months old, possibly stale). Snippet says soccer, American football, basketball, baseball and cricket; team indexes (points for goals, clean sheets, corners), a Shirts index, a "Mash Index" for game activity.
- AirdropBee (updated 2026-01-18) describes "Season 1" points program ongoing, planned $MASH token unconfirmed, listed funding $6M (L, aggregator, unverified).
- predictionindex.xyz/ecosystem lists Mashdotfun: status live, outcome type scalar, Solana, volume n/a (H for what the listing says, but the listing is unverified).
- No 2026 first-hand evidence of current markets or volume. I could not read live market lists (see API).

## Market model (kind: onchain-other, scalar sports perps)

- Perpetual futures on sports statistics and indices, settled in USDC, leveraged long/short, liquidatable (M, trade press snippet + airdrop aggregator).
- Frontend bundle (https://app.mash.fun/assets/index.hUcflL4w.js, H) embeds the Drift v2 TypeScript SDK with `DRIFT_PROGRAM_ID = "MashGQTqcKDZAMevJKST9RYqJTL2Ae9NpcSuCE9WYqK"` (an on-chain program address; public). Mainnet perp market list in the bundle is empty (markets are loaded from chain at runtime). Devnet markets in the bundle are quoted in USDC with a custom `OracleSource.MashSource`: "US Electoral Votes for Trump" (US24EVTR), "Total Goals (1)", "Total Goals (2)" (H). These are devnet test markets, not evidence of mainnet listings.
- Matching engine: Drift-style DLOB (decentralised limit order book, off-chain keeper-matched with on-chain settlement) plus presumably a vAMM/JIT component inherited from Drift (M, inferred from the SDK; not documented by Mash).
- Outcome tokenisation: none. Positions are perp positions in a margin account (Drift "user" PDA), not tokens. Price is an index value (points), not a 0-1 probability.

## Chains and collateral

- Solana only. Collateral USDC (M). Bundle also references SOL/mSOL spot-collateral plumbing via Drift SDK (L).
- Wallet/auth in the frontend is via Dynamic (Dynamic.xyz) embedded/Turnkey wallets plus standard Solana wallets (H, bundle strings).

## Read API

- Official public docs: **NOT FOUND**. `https://docs.mash.fun/s/home` is linked from the site bundle but the hostname does not resolve (H, curl "Could not resolve host", 2026-10-19). `api.mash.fun` also does not resolve.
- Bundle-referenced hosts (H): `https://dlob.prod.mash.trade` (mainnet DLOB, Drift DLOB-server-style), `https://dlob.devnet.mash.trade`, `https://zeno.devnet.mash.trade` and `/ws` (devnet websocket). Resolve to Hetzner IPs behind a Traefik ingress.
- Probe results: `dlob.prod.mash.trade` fails TLS handshake for every path (`tlsv1 alert internal error`, both curl and Python), so it is either down, IP- or SNI-restricted, or serving a default certificate only. The devnet hosts serve a certificate that does not match the hostname. `mash.trade` apex refuses connections. No usable response shape could be confirmed. **No fixtures saved.**
- If the DLOB follows Drift's open-source dlob-server, expected routes would be `/l2`, `/l3`, `/topMakers`, `/health` with `marketName` or `marketIndex`+`marketType`. This is an inference from the SDK lineage, NOT verified against Mash.
- On-chain alternative: accounts of program `MashGQTq...WYqK` can be read via any Solana RPC (market/oracle/user accounts per Drift layout). Layout may deviate from Drift (the fork adds `MashSource` oracles), and no IDL was found published. M/L.
- Auth/rate limits: NOT FOUND.
- Websocket: devnet only referenced (`zeno.devnet.mash.trade/ws`); mainnet unknown.

## Trade path

- Programmatic trading would be Solana transactions to the Drift-fork program (place_perp_order etc.), signed by a Solana key, with a Mash user account initialised on-chain. No documented REST/order-signing API. NOT FOUND (searched: site bundle, docs host, web).
- PayBox reachability: **partial/unknown**. A Solana wallet reachable through PayBox could in principle sign program instructions, but only if the plugin can propose arbitrary Solana transactions with a custom (undocumented, IDL-less) program. EVM-only wallets cannot trade it (Solana only). Not worth building without published IDL or SDK. (M)

## Fees

NOT FOUND. Airdrop aggregator says referrers receive 50% of trading fees and referred users get a 10% discount (L). Drift-lineage implies maker/taker tiers plus funding payments, but Mash values are unverified.

## Resolution

Scalar index settlement driven by Mash-run oracles (`MashSource`, an oracle type specific to Mash). Likely centralised data feed from official sports statistics; no dispute process documented. Dispute and oracle-operator risk: high (single operator, undocumented). M/L.

## Geo / ToS / automation

NOT FOUND (docs unreachable). The frontend calls `http://ip-api.com/json` to obtain visitor country (that string appears in the bundle, but it may belong to the Dynamic SDK rather than Mash's own geofence; M/L). No robots.txt of its own (mash.fun returned a GitHub Pages 404 page for /robots.txt, hosting hint only).

## Liquidity

No volume, OI or TVL figure found from any source (DefiLlama perp listing not checked in a way that exposed Mash; search budget exhausted). Treat as thin and unproven (L).

## Event overlap and arbitrage relevance

- Overlap with binary venues: sports totals and game-level indices only conceptually overlap (e.g. total goals vs over/under markets). Perp index price != settlement-probability and has funding, so a clean hedge needs a model, not parity. Effectively no politics, crypto-price or macro overlap (devnet "US Electoral Votes for Trump" was a test market).
- Does not appear to share liquidity with other venues (own program and book), so it would be an independent leg if it had liquidity, but lack of data makes this academic.

## Priority rationale

skip: no public docs, mainnet API unreachable, no liquidity data, perp/scalar structure poorly aligned with binary parity scanning, custom undocumented Solana program. Revisit if Mash publishes docs or an IDL and shows volume. At most P2 signal-only (sports index prices as a soft signal).

## Open questions

- Does `dlob.prod.mash.trade` work from other networks or with a different TLS client (or was it retired)?
- Is the mainnet program IDL published (anchor IDL on-chain)? Reading it via Solana RPC would help (not done: would need an RPC call; only public GETs to documented hosts were attempted).
- Actual live mainnet market list, volume and OI.

## Sources

- https://mash.fun/ (H, 200 OK, title and links to app, docs, X, Telegram)
- https://app.mash.fun/ and bundle https://app.mash.fun/assets/index.hUcflL4w.js (H; hosts, program ID, devnet markets, Drift SDK)
- https://docs.mash.fun/s/home (H: DNS does not resolve)
- https://dlob.prod.mash.trade (H: TLS handshake failure)
- https://predictionindex.xyz/ecosystem (H for listing: live, scalar, Solana, volume n/a)
- https://airdropbee.com/mash-airdrop/ (L, aggregator, 2026-01-18)
- https://europeangaming.eu/portal/latest-news/2025/12/04/197836/mash-fun-adds-new-sports-perps-markets/ (M via search snippet only; page 403)
- https://x.com/mashdotfun , https://t.me/mashdotfun (links only; not read)
