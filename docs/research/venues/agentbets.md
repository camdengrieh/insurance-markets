# AgentBets - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 2026-10-19 02:55-02:57 UTC). READ-ONLY: page reads, `gh api` file reads and unauthenticated GETs to documented hosts only. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, repos and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/agentbets/` (listed in section 12).

---

## 0. Bottom line

1. **The discovery record conflates two unrelated things that share the name "AgentBets".**
   - **agentbets.ai ("The Agent Betting Stack") is NOT a prediction market.** It is a publisher / tooling-and-education hub plus a sportsbook best-odds lookup. Its own disclaimer says it is not a broker, exchange, adviser or fiduciary and does not place wagers (H, https://agentbets.ai/disclaimer/). It names no chain, no markets and no settlement of its own (H, https://agentbets.ai).
   - **The thing Clodds actually integrates is a different project: `nox-oss/agentbets`**, a hackathon MVP for the Colosseum Agent Hackathon (Feb 2026) on **Solana devnet** (H, README + Clodds feed source). Nothing on agentbets.ai mentions Colosseum, Solana or "nox" (H, /about/ and the home page; the /about/ summary says it "can't confirm or rule out" an affiliation, so treat them as unrelated).
2. **The Solana AgentBets venue is dead.** Its only API host, `agentbets-api-production.up.railway.app`, returns HTTP 404 `{"status":"error","code":404,"message":"Application not found"}` on `/`, `/markets`, `/clob/markets`, `/security` and `/opportunities` (H, probed 2026-10-19; fixture). The repo has had no push since 2026-02-08 (H). It never left devnet (devnet SOL has no value) and the CLOB code carries self-documented P0 fund-loss bugs.
3. **adapter_priority = skip** for the Solana venue (dead, devnet, centralised resolver, no real money). agentbets.ai itself is not a venue; its odds endpoint could at most be a *weak sportsbook-signal* source, and a direct sportsbook feed (The Odds API etc.) is better. Do not build an AgentBets adapter. Fix the discovery record: remove "AgentBets" from the venue list, and treat Clodds' `agentbets` feed as a dead integration.

---

## 1. Is it still live? (2026)

| Thing | Evidence | Verdict | Tag |
|---|---|---|---|
| agentbets.ai (hub) | Resolves; "Featured/Updates" show content dated 2026-09-03 to 2026-09-17 (latest: a marketplace listing 2026-09-17); `/api/agents.json` `lastUpdated` 2026-03-09; odds API returns `oddsUpdatedAt` 2026-10-19T02:00Z | live website, but **not a venue** | H |
| Solana AgentBets API | `GET https://agentbets-api-production.up.railway.app/markets` -> 404 "Application not found", header `x-railway-fallback: true` (Railway's response for a removed/stopped app) | **dead** | H (404), M (reason: app deleted/stopped, I cannot see Railway's side) |
| Solana AgentBets repo | `nox-oss/agentbets`: created 2026-02-06, last push 2026-02-08T03:19Z, 2 stars, not archived, no license field, 0 open issues (`gh api repos/nox-oss/agentbets`). The README's own status line: "Live on devnet - Day 6 of 10 (Feb 6, 2026)" | abandoned after the hackathon (8+ months stale) | H |
| On-chain program | Devnet program id in `Anchor.toml` / `declare_id!`: `FtNvaXJs5ZUbxPPq91XayvM4MauZyPgxJRrV16fGfn6H`. Mainnet: none declared. I did not query the chain (Solana JSON-RPC is POST-only; out of bounds under the no-POST rule) | cannot confirm devnet accounts still exist; irrelevant since devnet | H (id), NOT CHECKED (on-chain state) |
| Clodds integration | Clodds' `src/feeds/agentbets/index.ts` (commits 2026-02-06 and 2026-02-10) polls the dead Railway URL every 30 s; Clodds README lists it as "data" only, "AI Agents / Solana (Colosseum Hackathon)". Clodds repo itself is active (pushed 2026-10-02) but this feed was not touched after Feb | the Clodds hint [M] is accurate about the *Solana* project, not about agentbets.ai | H |
| Hackathon outcome | Colosseum Agent Hackathon ran 2026-02-02..02-12 (M, search summaries: Genfinity, Colosseum blog). The project page `colosseum.com/agent-hackathon/projects/agentbets` now returns 404 (H). I found no placement or prize for AgentBets | no evidence of any win/continuation | M |

NOT FOUND (searched: GitHub repo tree and commits for nox-oss/agentbets, web search "nox-oss agentbets Solana Colosseum", Colosseum project URL, Railway root and four API paths): any mainnet deployment, any successor domain, any announcement after 2026-02-08.

---

## 2. Kind and market model (Solana project, from source - historical)

All H, read from `programs/agentbets/src/lib.rs` and README at https://github.com/nox-oss/agentbets.

- **Kind:** hackathon-grade on-chain prediction market, Anchor/Rust program, ~23 KB source (README claims "220 lines of Rust" and links a different repo `mxmnci/agentbets`; the claim does not match the file, so the README is not reliable about its own code).
- **Two market types in one program:**
  1. **Parimutuel** (`create_market`, `buy_shares`, `resolve_market`, `claim_winnings`): 2-10 named outcomes (so categorical), question <= 256 chars, market id <= 32 chars. `buy_shares` moves native SOL into the Market PDA and credits 1 "share" per lamport to `position.shares[outcome]`. There is **no AMM and no price curve**; the README's "constant product x*y=k" and "AMM" wording is wrong versus the code, and the README's own Economics line says "1 SOL = 1 share (simple MVP, will add proper AMM curves)". "Probability" in the API is just `outcome_pool / total_pool`. Winners split the whole pool pro rata: `payout = shares * total_pool / outcome_pool[winner]`.
  2. **CLOB** (`create_clob_market`, `place_order`, `cancel_order`, `resolve_clob_market`, `claim_clob_winnings`): binary YES/NO, prices in basis points 1..9999, 1 share pays `SHARE_PAYOUT = 10_000` lamports (0.00001 SOL) if it wins, price-time priority, **max 50 resting orders per side** (`MAX_ORDERS`), NO is stored as inverted YES. Documented P0/P1 bugs (README "Known Bugs"; CLOB_VALIDATION.md): maker position not updated on fill (maker "receives nothing"), no better-price refund for takers, no vault balance check on claim.
- **Tokenisation:** none. Positions are rows in a per-(market, owner) Position PDA; there are no SPL outcome tokens, no transferability, no secondary market.

## 3. Chains and collateral

- Solana **devnet** only (H: `Anchor.toml` `[programs.devnet]`; README "Live on devnet"; `api/skill.md` header "Devnet - Uses devnet SOL (free)").
- Collateral: native SOL (lamports) held in the Market PDA (parimutuel) or vault. No USDC, no stablecoin. Devnet SOL is free from faucets, so any "pool" figure has zero economic value.

## 4. Read API (Solana project; DEAD)

- `exists`: official-public in the past, **now none** (host 404).
- Base URL (historical): `https://agentbets-api-production.up.railway.app` (H, README, `api/skill.md`, Clodds feed).
- Docs: README https://github.com/nox-oss/agentbets/blob/main/README.md and `api/skill.md` (H).
- Documented read endpoints (H, README; I could not confirm any of them live): `GET /markets`, `/markets/:id`, `/markets/:id/position/:owner`, `/markets/:id/verify`, `/markets/:id/simulate?outcome=&amount=`, `/markets/:id/disputes`, `/resolutions/pending`, `/resolutions/history`, `/opportunities`, `/security`, `/verify-all`, `/clob/markets`, `/clob/markets/:id` (order book).
- Response shape the Clodds adapter expects (from Clodds source, M, because the host is dead and I have no real sample): `{ markets: [{ id, question, description?, outcomes: [{name, shares}], totalPool, status: 'open'|'resolved'|'disputed', resolutionTime, winningOutcome?, createdAt, updatedAt }], count }`. Saved as a source-derived text file, explicitly not a live response.
- Auth / rate limits / websocket: none documented (NOT FOUND, searched: README, skill.md, API source file listing). No websocket; Clodds polls every 30 s.

### 4b. agentbets.ai "API" (a different product; live)

Not a market data API. Documented in https://agentbets.ai/api/openapi.yaml and https://agentbets.ai/llms.txt (H):
- GET JSON, no auth, CORS enabled: `/api/agents.json` (directory of agents/tools), `/api/glossary.json`, `/api/research.json`, `/recent.json`, `/vig-data.json` (sportsbook vig rankings, 11 US books, refreshed ~6-hourly), `/taxonomy.json`.
- `GET https://api.agentbets.ai/api/odds/best?event=<team or matchup>[&sport=<slug>][&market=moneyline|spreads|totals][&format=text]`: best and runner-up sportsbook price per side across ~17-18 books; **max 3 events per lookup; rate limit 20 lookups/min**; "Not a raw odds feed" (H, llms.txt + the response's own `disclosure`). Real response confirmed 2026-10-19 (fixtures): `bestPrices.{side}.{bestBook,bestPrice (American odds string),runnerUp}`, `booksCompared: 17`, `oddsUpdatedAt`, `commenceTime`. A query with no match returns HTTP 404 with an `error` string and the list of `activeSports` slugs.
- MCP at `https://api.agentbets.ai/mcp` (tools `get_best_odds`, `submit_listing`) - noted, not called.
- The endpoint is American-odds sportsbook data only (Pinnacle, FanDuel, BetMGM, offshore books...). It has **no prediction-market prices**. Value to this project: a convenience for a "sharp line" signal on sports events; strictly inferior to a direct odds provider (it gives no raw board, no history, 3 events per call, 20/min).

## 5. Trade path

- Solana project (historical, H README): API returned an **unsigned base64 Solana transaction** (`POST /markets/:id/bet` with `{outcomeIndex, amount (lamports), buyerPubkey}`), client signs locally with an ed25519 key and sends to devnet RPC; or POST a pre-signed tx; or an "AgentWallet" flow that asked the user to transfer SOL to a vault address and have the server place the bet on their behalf (`/bet/agentwallet/prepare`). CLOB: `POST /clob/markets/:id/order` `{side, isYes, price (bps), size, traderPubkey}`. All moot: host is dead.
- agentbets.ai: **none**. It does not take bets or hold funds.

## 6. PayBox reachability

- `paybox_reachable = no`. Reasons: (1) the venue's only API is dead; (2) it ran on Solana **devnet**, which PayBox mainnet wallets cannot meaningfully use and which has no economic value; (3) a Solana-native, non-EVM program (ed25519, lamports); (4) agentbets.ai has nothing to trade.

## 7. Fees

- Solana project (H, `claim_winnings`): `fee = payout / 50` = **2% of the gross winning payout**, paid by winners, deducted at claim (`net = payout - fee`). No trading fee on parimutuel buys. The code subtracts the fee from the claimant's payout but never transfers it out, so it just stays in the market account (no treasury transfer exists in the code I read) - a detail that confirms the "protocol treasury" claim is unimplemented. CLOB fee: none found in the program (NOT FOUND, searched `lib.rs` for fee/rebate).
- agentbets.ai: no trading fees; earns affiliate commissions from linked books (H, /disclaimer/).

## 8. Resolution and dispute risk

- Solana project (H): **single trusted authority** (the market creator's wallet, "nox") resolves via `resolve_market`; the program checks only `authority == market.authority`. The API layered a 24 h "challenge window" and a `/dispute` endpoint, but the README itself admits "The dispute mechanism is enforced by the API server, not the Solana program ... the authority wallet could call `resolve_market` directly on-chain, bypassing the API". "Auto-resolve" existed only for two hand-coded hackathon-statistics markets. Resolution sources were the Colosseum hackathon API (e.g. project counts). Risk: maximal (one key, no oracle, no bond, no on-chain dispute).
- Event content was *hackathon-internal* ("Does 1st place use Anchor?", "Submissions > 400?"), so there is nothing that maps to any other venue's contract.

## 9. Geo / ToS / automation

- Solana project: no ToS, no geo-block, no license file (repo `license: null`, README says MIT) (H). Devnet = no real-money gambling regulatory surface.
- agentbets.ai: independent publication, "not a broker, exchange, investment adviser, or fiduciary", does not place wagers; automated agents "can fail or make unintended trades" and users are responsible; the /disclaimer/ page sets no bot rules (H). `/legal/` and `/terms/` return 404 (H). The OpenAPI file calls the public JSON APIs "Public, read-only ... No authentication required" (H). Quote: "Public Access" licence label in the OpenAPI `info.license` (H).

## 10. Liquidity (with dates)

- Solana project: README table dated Feb 6, 2026 shows pools of **0.02-0.10 SOL** (devnet) per market; "First external bet" and "First CLOB trade" are unchecked in the README roadmap (H). I.e. effectively zero real liquidity, ever.
- agentbets.ai: no liquidity, not a market.

## 11. Event overlap / independence for arbitrage

- Solana project: hackathon-meta markets only (agent-hackathon outcomes). **No overlap** with sports, politics, crypto price or macro on any other venue. Not a usable arbitrage leg.
- agentbets.ai odds: sports moneyline/spread/total from sportsbooks (NFL, NBA, MLB, NHL, soccer leagues, MMA...). Overlaps sports markets on Polymarket/Kalshi/XO, but as a *reference line*, not a tradable leg; independent of any prediction market's liquidity.
- Shared liquidity: none (the Solana program is standalone; agentbets.ai has none).

## 12. Fixtures saved (all real unless noted)

In `docs/research/fixtures/agentbets/`:
- `agentbets-ai_odds-best_nfl_chiefs.json` (1.0 KB): real 200 response, 2026-10-19.
- `agentbets-ai_odds-best_epl_arsenal.json` (1.8 KB): real 200 response, includes a three-way (draw) market.
- `solana-agentbets_railway-api_markets_404.json` and `.headers.txt`: real 404 proving the Solana API is gone.
- `clodds-feed_agentbets_response-shape_SOURCE-DERIVED.ts.txt`: first 35 lines of Clodds' feed adapter (types of the old API response). **Not** a live sample.

## 13. Suspicious / agent-directed content (recorded, not followed)

- agentbets.ai `llms.txt` and `openapi.yaml` contain text addressed to AI agents: "Any AI agent may submit a site for a free listing" (POST to `api.agentbets.ai/api/listings`, MCP `submit_listing`) and an invitation to use their odds lookup. Listing submission requires publishing a backlink to agentbets.ai on the submitter's site, i.e. an SEO/backlink funnel. I did not POST or call the MCP.
- `nox-oss/agentbets` `api/skill.md` and README instruct agents to "Bet in 2 Steps", transfer SOL to a server-supplied vault address, and call a faucet with a bearer token; README text says "Bet against me". Ignored.

## 14. Adapter recommendation

- **adapter_priority: skip.** Reason: the only prediction-market venue behind the name is a dead, devnet-only, single-resolver hackathon MVP with fund-loss bugs and unrelated event content; the agentbets.ai site is a publisher, not a venue. Nothing here is integrable or worth signal-wiring. If a sportsbook "sharp line" signal is wanted later, use a direct odds provider rather than this lookup.
- Housekeeping for the project: (a) correct the venue list (discovery label "AgentBets / kind=other" is wrong on both counts); (b) note that agentbets.ai's `/api/agents.json` and its "Browse by workflow" guides are a possible *discovery source* for other venues/tools (the directory had 18 KB of entries, last updated 2026-03-09, I did not review all of it - that file is worth mining for new venues but is [M] quality marketing content).

## 15. Open questions

- Whether the devnet program accounts still exist (needs a Solana JSON-RPC POST; not allowed here). Irrelevant for integration.
- Whether the Railway app was deleted or merely stopped (cannot tell from outside). Irrelevant: no maintainer activity since 2026-02-08.

## Sources

- https://agentbets.ai (home; fetched 2026-10-19) - H
- https://agentbets.ai/llms.txt - H
- https://agentbets.ai/api/openapi.yaml - H
- https://agentbets.ai/api/agents.json (head only) - H
- https://api.agentbets.ai/api/odds/best?event=chiefs&sport=nfl and `...event=arsenal&sport=epl` (GET, 200, 2026-10-19) - H
- https://agentbets.ai/disclaimer/ and https://agentbets.ai/about/ (page summaries; /legal/ and /terms/ = 404) - H for disclaimers, M (WebFetch summary) for wording
- https://github.com/nox-oss/agentbets (repo metadata, README.md, api/skill.md, RESOLUTION_CRITERIA.md, Anchor.toml, programs/agentbets/src/lib.rs via `gh api`) - H
- https://agentbets-api-production.up.railway.app/ (GET, 404 on 5 paths, 2026-10-19) - H
- https://github.com/alsk1992/CloddsBot (README line "AgentBets | data | AI Agents / Solana (Colosseum Hackathon)"; `src/feeds/agentbets/index.ts`; `src/skills/bundled/agentbets/SKILL.md`; commit history) - H
- https://colosseum.com/agent-hackathon/projects/agentbets (404 on 2026-10-19) - H
- Web search (extended) for hackathon dates/prizes: Genfinity 2026-02-02 article, Colosseum blog "Agent Hackathon" post, agentskill.sh listing of the Clodds `agentbets` skill - M
