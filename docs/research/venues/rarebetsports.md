# RareBetSports (RareLink) - venue spec

Researched 2026-10-19. Read-only. Confidence tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a prediction market. RareBetSports ("RareLink") is a PrizePicks-style daily fantasy sports (DFS) pick'em product: the user picks Over/Under on 2-8 player stat lines and gets a fixed multiplier if all picks hit. Payout is fixed by the house/LP pools, not by a market price. No order book, no tradable outcome tokens, no public API found. Docs describe a public-testnet phase (TMON / RBSD test tokens). Adapter priority: skip (at most a P2 reference for sports prop lines, not an arbitrage leg).

## Liveness (2026-10-19)

- `rarelink.rarebetsports.io` (the URL discovered): DNS does not resolve from this machine (curl error 6, WebFetch ENOTFOUND). `app.rarebetsports.io`, `docs.`, `api.` subdomains also do not resolve. (H, own checks)
- `rarebetsports.io` / `www.`: resolves (13.248.213.45, 76.223.67.189 - AWS Global Accelerator-style IPs) but TLS handshake fails with "unrecognized name" (curl 35, WebFetch SSL alert). So the marketing site is not serving a valid certificate for that name; looks abandoned or misconfigured. (H, own checks)
- Docs on GitBook still serve: https://rarebetsports.gitbook.io/rarebetsports (H). Docs say deposits accept "TMON (Monad's Testnet Token) and RBSD (RBS Test Stable Token)" "during the Public Testnet phase" (H). No dated mainnet launch evidence found.
- predictionindex.xyz/ecosystem lists it as Chain: Monad, Status: Live, outcome types scalar and binary, volume n/a, X and website links only (H for what the listing says; the "live" status is unverified by the venue itself). That "scalar/binary" label looks like a loose classification; the product is DFS pick'em (M).
- Monad ecosystem listing JSON (third-party repo dev3Nigerian/monad-protocol-dashboard, folder `public/testnet/`) has `"live": true` and testnet addresses for "Oracle" and "SlipRepository" contracts; category Consumer::Betting. Date of the file unknown (L).
- NOT FOUND (searched: WebSearch). The WebSearch budget for the session was exhausted, so no 2026 news/launch/shutdown search was possible. X account https://x.com/RareBetSports was not read (no browser, X blocked). Treat "still live" as: docs up, app unreachable, status unknown leaning dead/testnet-only (M).

## Market model

- Product: "Select 2 to 8 games, win up to 100x your wager"; "PrizePicks meets Web3" (H, docs General Information). Third-party summaries say 2-7 picks (L); official docs say 2-8.
- Each pick is an athlete stat Over/Under (e.g. a points or three-pointers line); slip is called a "RareLink" and a "Link" per pick (H, docs Betting Rules).
- Parlay multipliers (all picks must win) (H, docs Payouts and Prizes): 2-link 2.5x, 3-link 4x, 4-link 8x, 5-link 14x, 6-link 25x, 7-link 50x, 8-link 100x of entry fee.
- Refund/push rules: slip refunded if all but one pick DNP'd and remaining link won, or all players DNP (H).
- Counterparty: "Each specific Play Token on RareLink has its own liquidity pool. The size of these liquidity pools dictate the maximum bet size" (H). So the house/LP pool is counterparty; no peer matching, no order book, no price discovery.
- Tokenisation: slips are recorded on chain in a "SlipRepository" contract (name from third-party listing, L); no outcome tokens documented. Not tradable or transferable per docs (NOT FOUND any secondary market).

## Chains and collateral

- Monad (testnet per docs; mainnet unconfirmed). Collateral: TMON and RBSD test tokens during the public-testnet phase (H). Third-party summary mentions Monad, Ethereum, USDC (L, unconfirmed). Fiat on-ramp via MoonPay / Fun.xyz (H, docs, internally inconsistent).
- Login via Privy wallet or email; email/Phantom sign-ups get a platform-created wallet (H). Deposits go into a RareBetSports account wallet (custodial-ish account balance), withdrawals take "less than 1 business day to up to 7 business days" with manual review (H).
- Contract addresses listed by third-party (monad-protocol-dashboard, testnet): Oracle `0xa2e3fBC6D97e75B178F6eF40b18709f5fE3d6A2c`, SlipRepository `0x7D1DB4E6Cd071b12F3a4Af6816eA0585B7B420Bf` (L, testnet; not verified on chain, no RPC calls made).

## Read API

- exists: none found (NOT FOUND; searched: docs llms.txt index (14 pages), GitBook pages, GitHub code search for rarebetsports, predictionindex listing). No developer docs, OpenAPI, subgraph or websocket documented. Only GitHub repo hit under the name is an unrelated personal test repo.
- The "RBS Oracle" is described as built "in partnership with SportsData.io" (H, docs) and as using "10,000+ data points" (L); it is an internal data oracle, not a public feed.
- Fixtures: none saved (no reachable public API).

## Trade path

None documented. Entry is via web UI login (Privy). Automation is expressly restricted (see below). There is no signed-order or API trading scheme. Contract-level interaction (SlipRepository) is on Monad testnet only and undocumented, so an agent could not construct a proposal from documentation.

## PayBox reachability

No. Monad is not in the PayBox chain set listed in the task (Base, Ethereum, BNB, Arbitrum, Polygon, Solana ...); the venue uses its own account wallet; no API or documented ABI. (M)

## Fees

No fee formula documented. Economic take is embedded in the fixed multiplier table versus true parlay odds (e.g. a 2-pick at 2.5x vs fair 4x for two 50% legs implies a large house edge). Entry fees fixed per contest and non-refundable except under stated rules; five-minute cancel window under conditions in the Terms (H). Account inactivity fee after 18 months (H). Gas not documented.

## Resolution and dispute risk

- Stats resolved by the RBS Oracle sourced from SportsData.io (H, docs). Operator discretion is broad: "RareBetSports, in its sole discretion, may disqualify you... refuse to award Prizes" and may cancel contests for any reason (H, Terms). High operator and dispute risk; no on-chain dispute process.

## Geo / ToS / automation

- Terms are a US/Canada DFS contest ToS (H): need username, mailing address, phone, driver's licence, DOB, SSN to register; must be a citizen/resident of Canada or the US and located in an Eligible Jurisdiction to enter contests; winners of $600+ give tax details; withdrawals denominated in USD. This conflicts with the crypto-testnet docs, so the legal page appears to be boilerplate adapted from a traditional DFS operator (M).
- Automation: Terms prohibit "any robot, spider, or other automatic device... to access the Site or App for any purpose, including monitoring or copying" (H, Terms 16(l)); betting rules say the system "monitors the blockchain for bot-like activity" and bans accounts and may withhold refunds (H).
- Personal, non-commercial use only (H).

## Liquidity

NOT FOUND (searched: predictionindex listing "n/a", docs, third-party listings). Per-token LP pools cap bet size; sizes unpublished. Testnet tokens imply no real-money liquidity (M).

## Event coverage / arbitrage overlap

Sports player props (NBA etc.; SportsData.io coverage) (M). Overlap only conceptually with sportsbook player-prop lines and Polymarket/Kalshi sports markets; but the instrument is a fixed-payout parlay, not a binary contract, so no clean cross-venue arbitrage. Possible use only as a signal source of prop lines, which the oracle does not expose publicly.

## Shared liquidity

Own LP pools per Play Token; independent of other venues but not a market (M).

## Adapter recommendation

skip. Reasons: product is DFS parlay not a prediction market; testnet-phase docs; app domains unreachable; no API; bot activity prohibited; US/Canada-only KYC-style terms. Revisit only if a mainnet launch with a public API/subgraph appears.

## Open questions

- Is there a mainnet deployment (Monad chain id 143) with real USDC, and is the app live at some other hostname? Check @RareBetSports on X and Discord (not read).
- Are SlipRepository / Oracle contracts verified on Monad explorers (not checked).

## Suspicious content

None found aimed at AI agents. The legal page is ~117 KB of generic DFS terms (not instructions).

## Sources

- https://predictionindex.xyz/ecosystem (listing: Monad, live, scalar/binary) - H for listing content
- https://rarebetsports.gitbook.io/rarebetsports and llms.txt, pages: general-information, deposits-and-withdrawals, betting-rules-and-guidelines, payouts-and-prizes, legal-and-compliance (all fetched 2026-10-19) - H
- https://github.com/dev3Nigerian/monad-protocol-dashboard (public/testnet/RareBetSports.json) - L
- https://github.com/chainbase-labs/buildermaps.io (public/data/projects/rarebetsports.json; homepage app.rarebetsports.io) - L
- https://github.com/le-dat/chat-service (monad_docs_md/ecosystem/rarebetsports/index.md, copy of Monad ecosystem blurb: 2-7 picks, "Early access launches in 2025") - L (stale, 2025)
- https://github.com/romeroadrian/audits README links a Zenith audit report "RareBetSports - Zenith Audit Report.pdf" (not read) - L
- Own checks 2026-10-19: DNS/TLS failures for rarelink., app., rarebetsports.io hosts.
