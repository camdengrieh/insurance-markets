# Purebet - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 02:20-02:25 UTC). READ-ONLY: WebFetch, `curl` GETs with the generic User-Agent `insurance-markets-research/0.1`, `gh api` file reads, npm/DefiLlama/Discord-invite GETs. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or browser was used. Third-party text was treated as untrusted data; nothing in it was followed or executed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (small, <= 50 KB each): `docs/research/fixtures/purebet/` (section 10).

Limitation: the shared WebSearch budget was exhausted before I could search, so there is no news or social confirmation of why or when Purebet went dormant. Every claim below comes from the venue's own site, its GitHub org, npm, its public docs and a few GETs.

---

## 0. Bottom line

1. **Purebet says it is dormant.** The only page on `purebet.io` (every route) reads "Purebet is hibernating. Join the discord server for more info" (H, section 1). The documented REST API host returns Cloudflare 526 on every path, and the Discord invite on that page is expired. `still_live = false`.
2. **While it ran, it was a Solana sports-betting protocol**: USDC bets escrowed in an on-chain bet account, matched against market-maker offers at decimal odds, with a free public REST API (`v3api.purebet.io`) and a TypeScript SDK. Sports only. No tokenised outcome shares. (H for the docs and SDK as published; M for how it behaved in production.)
3. **Not an independent arbitrage leg** even if it returns: `POST /betSlip` is documented as fetching odds "from every source venue", and the project has historically fronted other on-chain sports liquidity (section 9). Liquidity figures are NOT FOUND.
4. **adapter_priority = skip.** Dormant, no volume data, sports-only (all of which other covered venues already list), probably shared liquidity, no ToS to rely on.
5. Revisit only if the site stops saying "hibernating" and the API host recovers. A cheap health probe is in section 11.

---

## 1. Is it still live? (2026)

| Evidence | Result | Date | Tag |
|---|---|---|---|
| `https://purebet.io` (HTTP 200, `last-modified: Fri, 16 Oct 2026 03:18:10 GMT`, Vercel behind Cloudflare). `<title>` "Purebet - Decentralized Sports Betting on Solana"; the JS bundle `/assets/index-DDvo6AKX.js` has a single catch-all route (`path:"*"`) rendering: "Purebet is hibernating. Join the discord server for more info: discord.gg/V2W6SbFXSG" | Site is a static "hibernating" notice. No markets, no app, no links other than Discord. `beta.purebet.io` resolves and returns the identical 826-byte page. `www.purebet.io` returns Cloudflare 526. | fetched 2026-10-19 | H |
| `https://v3api.purebet.io/activeLeagues`, `/events`, `/` | **HTTP 526** (Cloudflare "invalid SSL certificate" at the origin) on all three; no JSON | 2026-10-19 02:21-02:23 | H |
| `https://api.purebet.io/` | HTTP 530 (origin unreachable) | 2026-10-19 | H |
| Discord invite `V2W6SbFXSG` (the one the site links) via `discord.com/api/v9/invites/V2W6SbFXSG?with_counts=true` | `{"message": "Invite is expired.", "code": 50270}` (HTTP 404). The older invite in the 2023 `purebet/api` README (`ZPgxx6zqNz`) was not tested. | 2026-10-19 | H |
| npm `@purebet/purebet-sdk` | latest 0.0.16, published 2025-11-20; created 2025-09-15; 16 versions in 10 weeks, none since. 384 downloads in the 30 days to 2026-10-16 (api.npmjs.org). | 2026-10-19 | H |
| GitHub `purebet/purebet-sdk` | last commit 2025-11-20 ("fixed display of negative handicap"); earlier commits include "add mainnet beta addresses" (2025-11-06) and "add esports" (2025-11-11). Org `purebet` (created 2021-09-03) has 10 public repos, none pushed after 2025-11-20. | 2026-10-19 | H |
| SoK catalogue (`admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials/protocol_catalogue.csv`) | `Purebet,—,Centralized,Bin/Cat,Hybrid,Solana,Operator,Stablecoin,Active,No,redundant/long-tail`. Status "Active" contradicts the site's own notice; the file has no verification URL or date. | undated | M (contradicted by H evidence) |
| DefiLlama | `api.llama.fi/protocol/{purebet,pure-bet,purebet-io}` -> "Protocol not found"; full `/protocols` list (8,758 entries) has no entry containing "purebet" | 2026-10-19 | H (negative) |
| Mainnet program activity (`9bB3TADcwZEweUUcrp46FEpwMfLbwkEFQnc4patHPApp`) | **NOT FOUND**: SolanaFM 502, Solscan public API 404/blocked, and a JSON-RPC check needs a POST, which this task forbids | | unknown |
| X account `x.com/purebet_io` (named in the 2023 `purebet/api` README) | WebFetch returned HTTP 402 with no body; no payment requirements were disclosed, so I stopped and read nothing | 2026-10-19 | H (blocked) |

When hibernation began is NOT FOUND (searched: site bundle, headers, GitHub org, npm; web search budget exhausted). The hibernation page's `last-modified` of 2026-10-16 is a deploy timestamp, not a shutdown date. Treat anything dated 2025 as stale.

---

## 2. Kind and market model

- Kind (H, docs): sportsbook-style on-chain peer-to-peer betting. A user places a **bet** (stake in USDC, minimum acceptable decimal odds, selections); the program matches it against **offers from market makers** ("matchers": `offer_id`, `addr`, `amount`, `odds`). The SoK file calls it "Hybrid" market creation and "Centralized" oracle (M).
- Pricing: **decimal odds**, stored as `odds * 10^6` (SDK `min_odds: 15000000` = 1.5x). Each market has two sides (`side` 0 or 1); the REST API returns `side0odds[]` and `side1odds[]` ladders of `{odds, stake, lastUpdated}`. For 1X2 soccer, `displayType 2` markets are "Back/lay markets which get grouped" and some (e.g. FT+BTTS) are "one-sided" (only side 0 bettable). (H, docs and SDK README)
- Structure: binary per market (two sides), grouped into 1X2 sets in the UI layer. Market ids are `SLEPMP` strings `sport-league-event-period-mkt-player` (e.g. `4-487-2564645-0-1441-`). Market types: ML, 1X2, AH, OU, TOU, BTTS, CS, HTFT, FT+BTTS, BTTS+OU, FT+OU, player props (`PP-...`). `mkt` codes: 0 moneyline; 1/2/3 home/draw/away; 100-300 spread (`line*2+200`); 1000-2000 totals (`line*2+1000`); >=11000 player props. Period 0 whole game, 1 regulation, 2 first half, 11+ quarters/sets/maps. (H, docs)
- Order semantics: `keep_open` false means the bet is closed automatically if it cannot be filled, "similar to a FAK/FOK order"; bet states PENDING, PARTIALLY_FILLED, FULLY_FILLED, SETTLED; results WON, LOST, VOID, PUSH, PENDING. Multi-element `selections[]` suggests parlays; the v2 notes say parlay support was "in the future" (L).
- **Outcome tokenisation: none.** The position is a **bet account (PDA)** holding `requester`, `requested_stake`, `requested_odds`, `matched_stake`, `matched_odds`, `matchers[]`, with its own USDC token account. No transferable outcome tokens, no secondary market for positions, no AMM, no parimutuel pool. (H, SDK types and `placeBet.ts`)
- Resolution input is sports scores keyed by event and period; there are no non-sports market types in the documented enum, but the Event type has `eventName?: string // used for non-sport events` (H); whether any non-sport market was ever listed is NOT FOUND.

---

## 3. Chains and collateral

| Item | Value | Tag |
|---|---|---|
| Chain | Solana mainnet (and devnet for testing). Marketing: "No deposits or withdrawals needed. Bet on sports with full control of your funds." (site meta description) | H |
| Collateral | **USDC only** (SPL). SDK: "Only USDC is accepted by the program"; `bet_token` must be 0 | H |
| Mainnet program | `9bB3TADcwZEweUUcrp46FEpwMfLbwkEFQnc4patHPApp` (devnet `8rtbc6yZ8fvDhQaK2nrxraUpVVQM6ySFuBpzkqXLYz24`) | H for the addresses (SDK `constants.ts`); the 2025-11-06 commit "add mainnet beta addresses" suggests mainnet may have been a beta (M) |
| Program authority PDA / fee account | `4ZYXmTcU7ndtQYQ8kstt7zZXJtFueCfXFiW6Fc8UJZg5` / `9bF33qdYyXtdzfJVjqTxXQzbiXXSqPShgtwZLKtnDrku` | H |
| USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (standard mainnet USDC) | H |
| SOL-free fee payer | `pBSFcwP9RdohjJxZ2BuNhTTp88QvjQ1U4zJEd5ydEuX`; freebet program `PBFb7DsfQvM1Qb49B3JWu5XSdyknUzprWJqdpCHHX6v` | H |
| Admin | `9B4dm1N1Ssn1Yukphpq8MCZcA8FiJagZTRRr5c4Vyv1Y` (the admin can cancel bets: `buildCancelBetInstruction(isAdmin ...)`, and the program has pause states `MMingPaused`, `PreBettingPaused`, `LiveBettingPaused`, `BettingPaused`, `Paused`) | H |

---

## 4. Read API (as documented; currently unreachable)

- Docs: `https://docs.purebet.io` -> HTTP 301 to a public Google Doc (`docs.google.com/document/d/11E_YgBJVIsCK0lVTNth7Oyppg5_uczTaNisIpO9hwIg`), text saved as `api-docs-v3api-google-doc.txt` (undated; the doc mentions "mainnet" and the SDK at 0.0.x, so it is 2025 vintage). Classification: **official-public** (no auth documented for reads) but **unreachable now** (526). (H)
- Base URL: `https://v3api.purebet.io`.
- Endpoints (H, docs):
  - `GET /activeLeagues?sport=` -> leagues with `activeEvents {live, prematch, total}`.
  - `GET /events?sport=&league=&event=&live=` -> events with top 1X2/ML odds; `startTime` in unix seconds; `homeTeam`, `awayTeam`.
  - `GET /markets?event=` (event required) -> markets with `side0odds[]` / `side1odds[]` ladders (`odds`, `stake`, `lastUpdated`), `marketType`, `marketValue`, `playerName`.
  - `POST /betSlip` (body `{selections:[{marketId, side}]}`; `?stream=true` for SSE) -> current executable odds "from every source venue". It is a POST, so I did not call it. SSE emits `expect: N` (number of expected venues), `data: {...}`, then `event: complete` or `event: error`.
  - `GET /user/bets?address=` -> bet history (stake and odds as strings scaled by 10^6; `matchers`, fills, settlement tx hashes, `settled_result`, `settled_return`); `POST /bets/updateData` re-indexes bets.
  - `GET /archive/get?events=&scores=&propScores=...` -> historical events, scores and prop scores "built by indexing data transmission instructions sent to our program ... so it is open and verifiable".
- On-chain reads via SDK: `getProgramConfig` (`operational_status`, `flat_fee`, `place_fee`, `win_fee`, `cancellation_delay`), `getBetAccount`, `getUserBetsOnchain`, `getAllBetAccounts`. Market-maker offer books are **not** exposed on-chain in the SDK; only the REST API shows ladders (M, from SDK surface).
- Auth / rate limits / websocket: NONE documented for reads (NOT FOUND, searched: the Google Doc, SDK README, org repos). No websocket; the only streaming is SSE on `POST /betSlip`. Rate limits NOT FOUND.
- Real response shapes: **could not be confirmed** (526). Fixtures hold the error evidence instead (section 10).

---

## 5. Trade path (documented; not executable now)

- Programmatic placement is by **building a Solana instruction with the SDK** (`@purebet/purebet-sdk`, MIT, uses `@solana/kit`): `buildPlaceBetInstruction(bettor, betData, network)` and `buildCancelBetInstruction(...)`. `betData` = `{bet_id (uuid bytes), amount (USDC*10^6), min_odds (odds*10^6), freebet_id 0, is_sol_free, frontend_id, referral, keep_open, bet_token 0, selections[]}`. There is **no signed-order / off-chain order API**: the user's wallet signs and submits a normal Solana transaction. (H)
- `PlaceBet` accounts (H, `instructions/placeBet.ts`): bettor (writable signer), bet PDA (seeds: bet_id + "bet"), bet PDA's USDC ATA, program authority PDA, fee account, bettor USDC ATA, token program, USDC mint, system program, associated-token program; plus the SOL-free signer if `is_sol_free`.
- Optional SOL-free path: `POST /tx/signSolFree` returns a transaction co-signed by Purebet's fee-payer so a wallet with 0 SOL can bet.
- Frontend/referral attribution: `frontend_id` and `referral` fields are logged on-chain (affiliate revenue share implied; terms NOT FOUND).
- **PayBox reachability**: `no` today because the venue is dormant. In principle (M, inference): PayBox has a Solana wallet and a `solana` transaction proposal kind (`chain: "solana:mainnet"`, `transactionBase64` <= 1,232 bytes, legacy/v0, **one signer who is also fee payer, no sponsor**; see `docs/research/06-paybox-platform.md`). A standard `PlaceBet` transaction (USDC ATA create-if-missing + one program instruction) would fit that shape, but the `signSolFree` sponsored route would not (second signer), so the wallet would need SOL for fees. No EVM wallet (Base, Ethereum, BNB, Arbitrum, Polygon) can trade it directly; USDC would first need to reach a Solana wallet.

---

## 6. Fees

- The program config has `flat_fee` (USD*10^6), `place_fee` (percent*10^6) and `win_fee` (percent*10^6), plus `cancellation_delay` (seconds). **Values NOT FOUND**: reading them needs an RPC call (JSON-RPC is POST) and the docs give none. Who pays (bettor vs matcher) NOT FOUND. A Solana network fee applies (or Purebet sponsors it via `signSolFree`). (H for field names, nothing on magnitudes)
- Affiliate/frontend attribution exists (`frontend_id`, `referral`), implying a revenue share; terms NOT FOUND.

---

## 7. Resolution mechanism and dispute risk

- Settlement is **on-chain per bet** (`settled_result`, `settled_return`, `settled_tx_hash`), but the **result inputs come from the operator**: scores are written by "data transmission instructions sent to our program" (docs, H), indexed by Purebet into `/archive/get`. SoK classifies the oracle as "Centralized" and governance as "Operator" (M). Admin can cancel bets and pause the program (H, SDK).
- Dispute process, evidence sources and void rules: NOT FOUND (searched: Google Doc, SDK README, org repos; no ToS or rules page exists on the site now). Resolution risk is operator trust, as with a centralised sportsbook, not an optimistic-oracle dispute. VOID and PUSH are first-class results (H).

---

## 8. Geo, ToS and automation

- No Terms of Service, rules page, or geo statement is reachable: the site shows only the hibernation notice and the docs never mention restrictions. NOT FOUND (searched: purebet.io pages and bundle, Google Doc, SDK README, org repos).
- Automation: the API and SDK are published for third-party frontends (the 2023 `purebet/api` README says "We built an API that makes betting on Solana super easy"), so automation was intended (L, 2023 text). No explicit rate or redistribution terms. No rule found either way on arbitrage.

---

## 9. Liquidity, event coverage and shared liquidity

- **Liquidity: NOT FOUND.** No volume, OI or TVL from any source: no DefiLlama entry (checked three slugs and the full protocol list on 2026-10-19), no stats endpoint, no ladder sizes (API down). The only usage hint is 384 npm SDK downloads in 30 days (api.npmjs.org, to 2026-10-16), which is weak evidence of a small developer footprint (L). SoK labels it "redundant/long-tail" and left it out of its Table 4 (M).
- **Event categories** (H, docs and SDK): sports only: soccer (1X2, Asian handicap, totals, BTTS, correct score, HT/FT), US-style moneyline/spread/totals (period codes cover quarters), player props, and esports (SDK commit 2025-11-11). No politics, crypto-price or macro market type exists. Overlap with other venues is therefore sports game lines and props on Polymarket, Kalshi, SX Bet, BetDEX and XO sports, which are all separately covered.
- **Shared liquidity (M, probably not independent):**
  - `POST /betSlip` is documented as "Fetch the latest odds from every source venue to show the user exactly the odds they can execute at", and the SSE stream starts with `expect: {number of expected venues}`. That reads as an aggregation layer over several liquidity sources (names not given). (H for the quote, M for the inference)
  - The 2023 `purebet/api` README says the API "guarantees the highest profit of any on-chain sports betting venue", and the team has a "Monacode hackathon project" repo built on Monaco Protocol (H for the repos, M for what it means). The BetDEX note in this repo records an L claim from Monaco Protocol's X profile that it "also powers Purebet" (`docs/research/venues/betdex-monaco-protocol.md` section 10). Whether v3 sits on BetDEX/Monaco liquidity is **NOT FOUND**.

---

## 10. Sources and fixtures

Sources (all fetched 2026-10-19 unless noted):
- Venue site: https://purebet.io (HTML + `/assets/index-DDvo6AKX.js`), https://beta.purebet.io, https://purebet.io/robots.txt (`Allow: /`), https://www.purebet.io (526)
- API docs: https://docs.purebet.io -> 301 -> Google Doc `11E_YgBJVIsCK0lVTNth7Oyppg5_uczTaNisIpO9hwIg` (exported as text via `docs.google.com/.../export?format=txt`)
- API host probes: https://v3api.purebet.io/activeLeagues, /events, / (all 526); https://api.purebet.io/ (530)
- GitHub (via `gh api`): `purebet/purebet-sdk` (README.md, constants.ts, instructions/placeBet.ts, commit list, tree), `orgs/purebet` and its repo list, `purebet/api` README, `purebet/monacode` README, `purebet/v2site` (betExplanation.txt, afterBetExplanation.txt)
- npm: https://registry.npmjs.org/@purebet%2fpurebet-sdk ; https://api.npmjs.org/downloads/point/last-month/@purebet/purebet-sdk
- Discord: https://discord.com/api/v9/invites/V2W6SbFXSG?with_counts=true (expired)
- DefiLlama: https://api.llama.fi/protocol/purebet (+2 slug variants), https://api.llama.fi/protocols
- SoK catalogue: https://github.com/admnov38/SoK-Onchain_Prediction_Markets-Supplementary_Materials (`protocol_catalogue.csv`; `protocol_catalogue_verification.csv` has no Purebet row)
- Internal cross-references: `docs/research/06-paybox-platform.md`, `docs/research/venues/betdex-monaco-protocol.md`
- Not read: x.com/purebet_io (HTTP 402), the Discord server, any ToS, mainnet program data (needs POST RPC or blocked explorers)

Fixtures in `docs/research/fixtures/purebet/`:
- `landing-purebet.io.html` (826 B): the site's HTML shell.
- `hibernation-component-excerpt.txt`: the "Purebet is hibernating" component text from the bundle, plus header dates.
- `api-v3api-activeLeagues-526.txt`, `api-api.purebet.io-530-headers.txt`: the API failure evidence.
- `discord-invite-V2W6SbFXSG-response.json`: the expired-invite response.
- `api-docs-v3api-google-doc.txt` (17.9 KB): the full published API + SDK documentation text, which is the only schema source (no live response shape could be captured).
- `npm-purebet-sdk-metadata-trimmed.json`: version and publish times (maintainer contact fields deliberately dropped).
- `sdk-constants-excerpt.ts`: program/mint/PDA addresses from the SDK.

---

## 11. Adapter sketch (only if it comes back)

1. Health gate: `GET https://purebet.io` must not contain "hibernating" AND `GET https://v3api.purebet.io/activeLeagues` must return 200 JSON.
2. Poll `activeLeagues` -> `events?league=` -> `markets?event=` (one call per event). Implied probability from decimal odds `p = 1/odds`; side1 is the opposite side of side0 (lay-style), so a binary book is `{back: side0odds, lay: side1odds}`. Treat any ladder level as indicative until `POST /betSlip` (a POST, needs separate approval) confirms the executable odds.
3. Linking: key on `startTime` + normalised `homeTeam`/`awayTeam` and the `SLEPMP` id; never on titles. Spread/total lines decode from `mkt` (`(mkt-200)/2`, `(mkt-1000)/2`).
4. Execution is out of scope for the scanner; it would need a Solana wallet, USDC, SOL for fees, and the SDK instruction builder.

---

## 12. Open questions

1. When did hibernation start and is a relaunch planned? (Discord invite is dead; X account unreadable; web search unavailable.)
2. Did the mainnet program ever carry meaningful volume? (needs RPC/explorer data; `getProgramConfig` also gives fees and `operational_status`.)
3. Which "source venues" does `/betSlip` aggregate, and does any of it come from BetDEX/Monaco or other books?
4. ToS, geo rules and redistribution rights: none found.
5. Is the SoK "Active" status stale, or does something other than `purebet.io` still operate on the program?

---

## 13. Suspicious or embedded-instruction content

None found aimed at agents. Notes:
- `purebet.io` invites visitors to a Discord server; not followed (and the invite is expired).
- `docs.purebet.io` redirected to Google Docs, and WebFetch's first redirect went to a `googleusercontent.com` export host (Google's own). I read the document with `curl` from `docs.google.com` instead; the doc contains only API and SDK documentation.
- The npm registry metadata lists a maintainer contact address; I did not copy it into any note or fixture.
- x.com returned HTTP 402 with no payment terms; I stopped there.
