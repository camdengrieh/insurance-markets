# BlinkMarkets (blinkmarkets.xyz) - venue spec

Researched 2026-10-19. Read-only. Tags: H = read first-hand this session, M = secondary/inferred, L = weak.

## Verdict

adapter_priority: skip. The venue is live, but it is a free paper-trading game. Trading balances are virtual and reset daily, no real money moves on any trade, the one real-money element (weekly $50 prize) is currently paused, and the rules ban bots and scripts. There is no documented API (robots.txt disallows /api/). It cannot be an arbitrage leg. At most it is a toy signal source (a 60s up/down book on BTC/ETH/SOL), and there are better such signals elsewhere.

## Live status (H)

- Site up 2026-10-19; round data in the public bootstrap response carries timestamps matching today (venueTs 1792394589463 ms = 2026-10-19). [H] https://blinkmarkets.xyz/api/blink/bootstrap?public=1
- Show HN threads: "Show HN: BlinkMarkets" 2026-09-05, "Show HN: Blink" 2026-09-06, "Show HN: I wrote a matching engine for 60-second prediction markets" 2026-10-12 (1 point, 0 comments). [H] via https://hn.algolia.com/api/v1/search?query=blinkmarkets&tags=story (object IDs 49574970, 49582751, 50056026)
- Very young (first posted Sept 2026), tiny HN traction. Homepage says "© 2026 BlinkMarkets". [H] https://blinkmarkets.xyz/

## Market model (H)

- Binary 60-second "price above strike?" contract on BTC-USDT, ETH-USDT, SOL-USDT. A round opens every minute (1,440/day), strike stamped at the open, trading locks 3 seconds before the bell, winner pays $1.00 per contract. YES = closes above strike, NO = closes at or below. [H] https://blinkmarkets.xyz/
- Central limit order book with a custom matching engine; prices in "ticks" 0-100 (cents). Venue claims to take neither side, but a "house maker" account exists ("The house maker is not ranked"). So much of the depth is likely venue-provided market-making. [H] homepage; the house-maker inference about depth is M.
- Outcomes are internal ledger entries (no tokens, no on-chain representation). [M: nothing on-chain found]
- Settlement price source: homepage shows pairs as "SOL-USDT", spot feed likely a CEX; exact oracle NOT FOUND (searched: homepage, rules, roadmap, invest pages).

## Chains and collateral (H)

- Trading collateral: virtual "credits", $1,000 paper start, reset to $1,000 daily at 00:00 UTC, free top-ups, never withdrawable. [H] https://blinkmarkets.xyz/rules , https://blinkmarkets.xyz/roadmap
- Real value only in weekly prizes: top 10 split $50 in SOL-USDC on Solana, paid via a custodial "BlinkWallet" with $0.50 withdrawal fee. Currently PAUSED "while PvP is built". [H] https://blinkmarkets.xyz/roadmap
- Planned: real-money "diamonds" bought with USDC, only where licensed. Not live. [H] roadmap
- No EVM/Solana contract, no on-chain order flow. NOT FOUND (searched: site pages, bundle strings; found no venue contracts).

## Read API

exists: none officially (unofficial first-party app endpoints only).

- No docs page: /docs, /faq, /terms return 404. [H]
- robots.txt: `Allow: /` and `Disallow: /api/`. [H] https://blinkmarkets.xyz/robots.txt . Note: I made one unauthenticated GET to /api/blink/bootstrap?public=1 to confirm response shape, before checking robots.txt; I did no further /api/ calls. An adapter should not scrape /api/ in violation of robots.txt.
- Endpoints seen in the site's own JS bundle (M, unverified, internal, undocumented): GET /api/blink/bootstrap?market_id=N[&public=1]; POST /api/blink/orders (session-cookie authenticated); /api/blink/balance; /api/blink/positions; a WebSocket used by the trade page for live book updates (URL not extracted). Not exercised.
- Verified response shape (H), saved as fixture: `docs/research/fixtures/blinkmarkets/bootstrap-public.trimmed.json` (arrays truncated to 3 items). Keys: `live`, `spotSeries[{t,spot}]` (~1 Hz, ~1500 pts), `round{marketId,roundNumber,status,strike,spot,openedAt,endsAt,freezeAt,secondsLeft,yesOdds,noOdds,prevStrike,pastStrikes,winner,settle}`, `yesBook[{tick,size}]`, `noBook[{tick,size}]`, `tape[{id,outcome,tick,qty,ts,side}]`, `venueTs`. Example: yes top 55.8 / no top 44.1, size 16,000,000 units per level (unit scaling unknown, looks like a synthetic maker quote).
- Rate limits: NOT FOUND.

## Trade path

none for an agent. Orders go via POST /api/blink/orders with a logged-in session (email/Privy-style login; created accounts are out of scope for this research), body fields seen in bundle: outcome, qty, market_id, type, max_cost, worst_tick, cancel_on_pause, client id [M]. Orders are paper-only. Rules section 04 states "No bots, scripts, auto-clickers or any software placing or timing orders for you." [H] https://blinkmarkets.xyz/rules

PayBox reachability: no. No wallet signing, no on-chain transaction, nothing to propose. Paper credits cannot be funded or withdrawn.

## Fees

NOT FOUND for trading (paper; no fee schedule published). Prize withdrawal: $0.50 network fee per withdrawal. [H] roadmap. Planned business model: cut of each pot in future diamond contests. [H] https://blinkmarkets.xyz/invest

## Resolution

Venue-run, automated at the bell: book freezes with 3s left, settlement price published, winners credited $1.00. Settlement source and dispute process NOT FOUND. Single-operator centralised resolution; "BlinkMarkets decides, and the decision is final" (contest rules). [H]

## Geo / ToS / automation

- Free to play worldwide as far as stated; real-money features "only where licensed, never where prohibited". [H] roadmap
- Bots explicitly prohibited for the contest and described as against the rules; one person one account. [H] rules
- Separate Terms page: NOT FOUND (/terms 404).

## Liquidity

No volume/OI/TVL published (NOT FOUND). Liquidity is paper; economic value of the book is zero. Prize pool $50/week (paused). [H]

## Event overlap

Only 60-second BTC/ETH/SOL up/down. Conceptually the same underlying as crypto-price binaries on Polymarket/Kalshi 15-minute or hourly markets, but with paper money and no settlement guarantee, there is no arbitrage. The only possible use is as an (unneeded) sentiment/odds signal; tick prices are mostly maker quotes around 50.

## Liquidity sharing

Independent (own matching engine), but irrelevant because it is not real money. [H homepage/Show HN title]

## Open questions

- Exact oracle/spot source for settlement.
- Whether BlinkGauntlets/duels/diamonds ever launch with real money and a public API (re-check in 6-12 months).
- WebSocket URL and message format (not extracted; not needed).

## Suspicious content

None observed (no AI-agent-directed instructions in pages or API output).

## Sources

- https://blinkmarkets.xyz/ [H]
- https://blinkmarkets.xyz/rules [H]
- https://blinkmarkets.xyz/roadmap [H]
- https://blinkmarkets.xyz/invest [H]
- https://blinkmarkets.xyz/robots.txt [H]
- https://blinkmarkets.xyz/api/blink/bootstrap?public=1 [H] (one GET)
- https://blinkmarkets.xyz/_next/static/chunks/*.js (site bundles, read as text only, not executed) [M]
- https://hn.algolia.com/api/v1/search?query=blinkmarkets&tags=story [H]
- WebSearch: not performed (session search budget exhausted at the time).
