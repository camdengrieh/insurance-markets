# MEMECAST.AI (formerly 4CAST) - venue spec

Researched 2026-10-19. Read-only, unauthenticated GETs only. Tags: H = read first-hand in primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

**Dead / defunct. adapter_priority = skip.** Not a real prediction-market venue even when it was alive: it was a Solana meme-launch + casino-style game platform (Meme Crash, lottery, UP/DOWN 5-minute-style price rounds). DefiLlama's "Prediction Market" tag is a mis-categorisation of the former 4CAST product. [H]

## Is it still live (2026)?

- memecast.ai now 307-redirects to a GoDaddy "for sale" page; DNS NS = ns3/ns4.afternic.com (domain parked/for sale). [H] (curl + WebFetch, 2026-10-19)
- 4cast.ai also resolves to a parked page (HTTP 200, A records in Afternic/GoDaddy ranges). [M]
- docs.memecast.ai and app.memecast.ai fail TLS handshake ("unrecognized name"), i.e. host no longer serves them. [H]
- DefiLlama entry (id 5027, "previousNames":["4cast"], category "Prediction Market") has `"deadUrl": true`, `"url": ""`, empty TVL arrays, module `dummy.js`, no mcap. [H] https://api.llama.fi/protocol/memecast.ai
- GeckoTerminal: MCAI token, FDV about $3.9K, pool reserve about $3.2K, 24h volume $0.0 (2026-10-19). [H] Fixture: `fixtures/memecast-ai/geckoterminal-mcai-token.json`. DexScreener returned `pairs: null` / `[]`. [H]
- Last known live docs snapshot: Wayback 2025-02-08 (docs "Last updated 23-24 days ago" => Jan 2025). Roadmap/terms dated 8 Jan 2025. Nothing newer found. [H]
- X handle `memecastdotai` returned 404 via curl (x.com is unreliable for unauthenticated fetch, treat as M).

## Kind and market model

- Kind: meme-coin launch layer + on-chain games on Solana; "MEMECAST Market" in the Terms of Use is described as "a decentralized prediction market platform built on the Solana blockchain" where users "create and participate in prediction markets for various digital assets". [H] (Wayback 2025-02-08 copy of docs.memecast.ai/resources/terms-of-use)
- Actual live products per docs: Meme Crash (crash game), UP or DOWN (crypto price up/down rounds), Lottery, AI agents ("later stage"). [H] (Wayback of docs home, 2025-02-08)
- UP/DOWN model: parimutuel-style rounds on crypto asset price, USDT/USDC base pair. Chart price from Pyth, settlement open/close price from Chainlink. [H] (Wayback of docs.memecast.ai/games/up-or-down). Not a CLOB/AMM, no tokenised outcome shares found. NOT FOUND (searched: docs home, up-or-down, fees pages) outcome-token mint design.
- Prediction made cannot be changed or cancelled; none after event close (ToU 10.3-10.5). [H]

## Chains and collateral

Solana only. Token MCAI is a pump.fun-style token (mint ends in `pump`): `BAGuqhFjHs2LP4WyG9xKUe2hhfaZDH8pciMMfp32pump`. [H] (DefiLlama). Game collateral: SOL (FAQ cap "50 SOL per user per round" for Meme Crash, via search snippet [M]). UP/DOWN stake token NOT FOUND.

## Read API

NOT FOUND (searched: docs home, FAQ, security, roadmap archive page list, DefiLlama, web search "memecast api"). No public/official API, no websocket, no SDK, no GitHub org found. Docs list only Solana program addresses for the old contracts (on-chain-only data). exists = none (on-chain only historically, now dead). No fixtures of venue data possible. Saved aggregator fixtures only: DefiLlama protocol entry and GeckoTerminal token response.

## Trade path

None programmatic (no API); only web-UI wallet-connect flow on a site that is now offline. PayBox reachability: a Solana wallet could technically sign a transaction to the old programs, but the front end and docs are gone and there is no meaningful market, so effectively **no**.

## Fees

ToU 10.4: on a win the smart contract deducts a fee from winnings and sends it to the platform; fee may change at the platform's sole discretion. [H] Exact rates are on `/fees-structure` (page body was image/accordion, not extractable). NOT FOUND for numeric rates.

## Resolution and dispute risk

Chainlink price at round open/close for settlement; Pyth for the displayed chart; docs warn chart vs settlement prices can differ. [H] No dispute process found. Operator can change terms unilaterally.

## Geo / ToS / automation

Prohibited jurisdictions include United States, United Kingdom, Singapore, Netherlands, China, Russia, Ontario and others (ToU 5.6). [H] ToU bans "robot, spider, algorithm, software, routine" use to defraud or interfere with the platform or gain unfair advantage. [H] Automation rule is broad, so bots are legally risky even if it were live.

## Liquidity

Effectively zero: FDV about $3.9K, pool about $3.2K, 24h volume $0 (GeckoTerminal, 2026-10-19). DefiLlama TVL empty. [H]

## Event overlap and shared liquidity

Only crypto up/down short-horizon price rounds (BTC/ETH/SOL etc.) overlapped anything, and those are house/pool-style games, not a hedgeable independent leg. Shares no liquidity with another venue that was found. No sports, politics, macro markets. Quotient-signal value: none.

## Open questions

- Whether the fee-structure numbers are worth archiving (not for the adapter; venue is dead).
- Wayback and DefiLlama are the only remaining sources; no way to verify on-chain program state without Solana RPC (not attempted).

## Sources

- https://api.llama.fi/protocols and https://api.llama.fi/protocol/memecast.ai [H]
- https://api.geckoterminal.com/api/v2/networks/solana/tokens/BAGuqhFjHs2LP4WyG9xKUe2hhfaZDH8pciMMfp32pump [H]
- https://memecast.ai (redirect to GoDaddy for-sale, 2026-10-19) [H]
- Wayback: https://web.archive.org/web/20250208125539/https://docs.memecast.ai/ , .../resources/terms-of-use (20250208134026), .../games/up-or-down, .../fees-structure [H, stale: Jan-Feb 2025]
- Web search summaries (docs FAQ/roadmap snippets, DappRadar listing) [M]

Fixtures: `docs/research/fixtures/memecast-ai/defillama-protocol-memecast-ai.json`, `docs/research/fixtures/memecast-ai/geckoterminal-mcai-token.json`.

Suspicious content: none found (no AI-directed instructions in pages read).
