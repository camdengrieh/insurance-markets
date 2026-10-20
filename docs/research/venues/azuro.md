# Azuro - venue spec for the cross-venue aggregator

Researched 2026-10-19 (server clock of probes: 2026-10-19 00:03-00:20 UTC). READ-ONLY: doc reads, `gh api` file reads, unauthenticated GETs to documented hosts, and one 12-second unauthenticated WebSocket subscribe (read-only). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages and API text were treated as untrusted data; nothing in them was followed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, a small-model page summary, or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/azuro/` (listed in section 12).

---

## 0. Bottom line

1. **Live, but small, sports-only, and recovering from a security incident.** Dev activity is current (Toolkit v7.2.0 and SDK v8.2.0 released 2026-10-11, H). The Polygon/USDT environment serves ~987 open games right now (H). But Azuro's own LP page says "On October 6 2026, Azuro experienced a security incident. The team secured LP funds, and all operations have since been restored." (H, azuro.org/app/liquidity, fetched 2026-10-19). I found **no** root cause, loss figure or post-mortem (section 9).
2. **Not parimutuel-p2p** (the discovery label was wrong). It is a **fixed-odds sportsbook protocol**: one shared LP pool is the counterparty, odds come from an off-chain Data Provider (sell side) shifted by a virtual AMM (buy side), and the odds contain a margin. There is no order book, no outcome token you can trade, and no secondary market. (H, docs.)
3. **Very thin liquidity.** TVL $216k on 2026-10-18 (peak $2.05M on 2026-06-17; it halved the day after the incident) (H, DefiLlama). Sum of turnover across all 987 open Polygon games = ~$14.0k (H, computed from the navigation endpoint). The single biggest game has $1.7k of turnover.
4. **Best-in-class read access for its size**: public REST + OpenAPI + WebSocket, no key needed. The write path is also keyless: an EIP-712 signature plus an ERC-20 approval, relayed by Azuro's backend. So a PayBox EVM wallet can reach it on Polygon. But the amounts are so small that it is a **signal-only / thin** venue, and the ToS and void rules make it a poor arbitrage leg.
5. **adapter_priority = P2.** Cheap read-only adapter as a sharp-line signal (the odds are a bookmaker feed, not a crowd), no trading adapter until liquidity and the incident are understood.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| azuro.org title / meta | "Azuro - The Predictions Layer"; meta: "Powerful tooling, oracle & liquidity solutions for any EVM predictions & gaming ecosystem". Nav: Home, Build, Explore, Apps, Go to Portal. (https://azuro.org, fetched 2026-10-19) | H |
| Ecosystem page | Lists bookmaker.XYZ, DexWin, DGBet, PinWin, Giraft, GambleF*kkers, Gamblr.xyz, YezBet as live apps, Trendle "coming soon"; footer "(c) 2026 AZURO" (https://azuro.org/ecosystem) | H |
| Release cadence | toolkit v7.0.0 2026-08-31, v7.1.0 2026-10-01, v7.2.0 2026-10-11; sdk v8.2.0 2026-10-11; gem-docs last commit 2026-10-11 (`gh api repos/Azuro-protocol/{toolkit,sdk,gem-docs}`) | H |
| Feed is live | `games-by-filters` PolygonUSDT: 956 Prematch + 31 Live games, start times from 2026-10-18 22:20 UTC to later in the week (fixtures) | H |
| Security incident | "On October 6 2026, Azuro experienced a security incident. The team secured LP funds, and all operations have since been restored." (https://azuro.org/app/liquidity) | H |
| Betting actually accepted after incident? | Not directly verifiable without POST. Indirect: games opened after 10-06 (e.g. NFL games opened days earlier) carry nonzero `turnover`; DefiLlama TVL doubled from $134k (10-12) to $280k (10-13). DefiLlama volume is 0 for 2026-10-07..10-17, but that adapter counts only **settled** bets via a Dune table (adapter source, H), so it is not proof of no betting. | M |
| Chains | Gnosis, Chiliz, BSC marked `@deprecated ... discontinued` in toolkit `src/envs.ts`; DefiLlama adapter has `deadFrom` for Gnosis (2025-12-01), Arbitrum, Linea, Chiliz. Base config is **not** marked deprecated but the API returns 0 games for `BaseWETH` and DefiLlama Base 30d volume is $5.9k. | H |

Verdict: **still_live = true**, but effectively a **single-chain (Polygon USDT)** product, post-incident.

---

## 2. Kind and market model

- **Kind (H):** pooled-liquidity fixed-odds betting protocol ("Predictions Layer"). Counterparty to every bet is the shared **Liquidity Pool** (LP) via the **LiquidityTree** segment-tree accounting (https://gem.azuro.org/knowledge-hub/how-azuro-works/liquidity-tree). Front ends (bookmaker.XYZ, DexWin, PinWin, ...) are third parties on the same pool.
- **Pricing (H, gem-docs source `how-azuro-works/components/{odds,vAMM,reinforcement}`):**
  - Data Provider sets, per **Condition**, a Reinforcement (max pool loss) split across outcomes and a margin. Initial implied probability p_i = R_i / sum(R_j).
  - Odds: `o_i = (F_0+...+F_n)/F_i` on Virtual Funds F, then reduced by a per-outcome spread so that `1 - 1/sum(1/o_i) = margin`. Payout `= o_i * (1 - s_i) * a`.
  - A bet adds to the chosen outcome's Virtual Fund and shifts the others (vAMM). Worst-case pool loss per Condition is capped at the Reinforcement.
  - The docs give no closed form for "how much does a bet of size X move odds" (NOT FOUND: searched vAMM, odds, pricing-mechanism pages). Use the POST `bet/calculation` endpoint for firm numbers.
  - Toolkit comment (H): the protocol prices on a **two-decimal odds grid**; since 2026-09-04 08:20 UTC (`SINGLE_MARGIN_REMOVED_AT = 1788510000`) single-leg bets pay the quoted odds, combos keep a "combo rule" (`ODDS_COMBO_FEE_MODIFIER = 0.99`). On-chain odds precision is 12 decimals (`ODDS_DECIMALS = 12`).
- **Market structure (H):** *Game* -> many *Conditions* (one market each, e.g. "Match Result", totals, handicaps) -> *Outcomes* (`outcomeId`, e.g. "3" = AS Monaco). Binary, 3-way (1X2) and N-way outcome sets all exist; all are sports/esports markets. No scalar markets. Outcome "tokenisation": none for trading. A bet mints a bet token ("azurobet", `AzuroBet` contract) to the bettor, redeemable after resolution via `LP.withdrawPayout(core, tokenId)` (H, https://gem.azuro.org/hub/blockchains/bet-functions). No order book, no AMM LP-share trading by bettors, no way to sell a position except **Cashout** (EIP-712 "Cash Out" order via backend, toolkit `cashout/*`; not tested).
- **IDs (H):** conditionId is a 46-48 digit decimal string; first digit 1-6 encodes the condition family (5 or 6 = "extended" per `isExtendedConditionId`), chars 2-4 encode the data provider id (`getProviderFromId`). Example live id: `600610060000000000916485300000000000000738450855` (provider 006, game 1006000000000091648530).
- **Combos:** supported (`/bet/orders/combo`, `predefined-combo` returns curated 3-leg combos). Not relevant to a single-leg arb scanner.

---

## 3. Chains and collateral

| Chain | Env id | Collateral | Status | Tag |
|---|---|---|---|---|
| **Polygon (137)** | `PolygonUSDT` | USDT `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`, 6 dec | **Live**, all the volume. Polygon TVL $182k (2026-10-18). | H |
| Base (8453) | `BaseWETH` | WETH `0x4200...0006`, 18 dec | Config present, **0 games served**, TVL $1.9k, 30d vol $5.9k | H |
| Gnosis, Chiliz, BSC | `GnosisXDAI`, `ChilizWCHZ`, `BscUSDT` | WXDAI / WCHZ / USDT | Discontinued (toolkit), 0 games served | H |
| Arbitrum, Linea | `ArbitrumUSDT`, `LineaUSDT` | USDT | V2 legacy, dead per DefiLlama adapter, 0 games served | H |
| PinWin "Solana" | n/a | n/a | PinWin's blurb says it brings Azuro liquidity to Solana; mechanism not documented. | L |

Protocol V3 production contracts, Polygon (H, https://gem.azuro.org/hub/blockchains/deployment-addresses, v3.0.13, cross-checked with toolkit `src/config.ts`):
LP `0x0FA7FB5407eA971694652E6E16C12A52625DE1b8`, Core (ClientCore) `0xF9548Be470A4e130c90ceA8b179FCD66D2972AC7`, Relayer `0x8dA05c0021e6b35865FDC959c54dCeF3A4AbBa9d`, PayMaster `0xeD5760fC2d2f6d363d73e576173e5e8Ca6A877e1`, AzuroBet `0x7A1c3FEf712753374C4DCe34254B96faF2B7265B`. Re-verify these on-chain before any trade (the deployed set may have changed after the 2026-10-06 incident; I did not read chain state).

Base (for completeness): LP `0x1eD7368bc515E928A4007cEa61FB8a6F8863Af87`, Core `0xF40cF1dD7d16C098cff5F8B5650A8FaEf1F4640d`, Relayer `0xD2D508d66dB4fCE4B384e4C3EA2fa53BA43e73b5`. (H, docs)

---

## 4. Read API

Docs: https://gem.azuro.org/hub/apps/APIs (page is titled "Azuro Protocol V3 APIs"). OpenAPI/Swagger: https://api.onchainfeed.org/api/v1/public/gateway/docs (UI) and `.../gateway/docs-json` / `.../gateway/docs-yaml` (spec, ~94 KB JSON, title "API Public Gateway" v1.0.0) (H, fetched).

- **Base URLs (H):** prod REST `https://api.onchainfeed.org/api/v1/public`; dev REST `https://dev-api.onchainfeed.org/api/v1/public`; prod WS `wss://streams.onchainfeed.org/v1/streams/feed`; dev WS `wss://dev-streams.onchainfeed.org/v1/streams/feed`; bets subgraph `https://thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-polygon-v3` (history of bets only; the feed subgraphs are `@deprecated, use REST` per toolkit `getEndpoints.ts`).
- **Auth (H):** "Most endpoints in the Backend API do not require authentication." All market-manager GETs and the betting endpoints worked or are documented without a key. Bearer JWT (SIWE login via `/auth/siwe/nonce` + `/auth/siwe/verify`) is declared only on `bonus/*`, `cashback/*` and `user/favorites` write routes.
- **Rate limits (NOT FOUND, searched: gem.azuro.org APIs pages, OpenAPI spec, response headers).** Responses sit behind Cloudflare, `cache-control: no-store`, no `x-ratelimit-*` headers seen. Be conservative (<= 1-2 req/s) and prefer the WebSocket for odds.
- **Key endpoints (H, from the OpenAPI spec; all take `environment`, e.g. `PolygonUSDT`):**

| Purpose | Endpoint | Notes |
|---|---|---|
| Sports tree + counts | `GET /market-manager/navigation?environment=` | sports -> countries -> leagues, with `turnover`, `activeGamesCount`. **Verified** (fixture, trimmed). |
| Games list | `GET /market-manager/games-by-filters?gameState=Prematch\|Live&environment=&orderBy=turnover\|startsAt&orderDirection=&page=&perPage=` (+ `sportId`, `sportSlug`, `leagueSlug`, `sportHub=sports\|esports`, `conditionState=Active\|Stopped`) | **Verified.** `perPage` must be >= 10 (400 otherwise). Returns `{games[], page, perPage, total, totalPages}`; each game has `gameId`, `title`, `startsAt` (unix s), `state`, `turnover` (decimal USDT string), `sport`, `league`, `country`, `participants[]`. |
| Sports | `GET /market-manager/sports?gameState=&environment=&orderBy=&orderDirection=` | not called |
| Search | `GET /market-manager/search` | not called |
| Games by id | `POST /market-manager/games-by-ids` | read-only POST, **not called** (task rule: no POST) |
| **All conditions + odds per game** | `POST /market-manager/conditions-by-game-ids` body `{gameIds:[...], environment}` | read-only POST, **not called**. Schema (H, spec): `conditions[]` each with `conditionId`, `state`, `title`, `margin` (number), `marketId`, `isExpressForbidden`, `isPrematchEnabled`, `isLiveEnabled`, `wonOutcomeIds[]` (resolution), `outcomes[]` {`outcomeId`, `title`, `odds` (string), `point`, `state`, `hidden`}, `game`. |
| Conditions by id | `POST /market-manager/condition-batch` body `{conditionIds:[...], environment}` | same, short form; **not called** |
| Curated combos (carries single-outcome odds) | `GET /market-manager/predefined-combo?environment=` | **Verified** (fixture): 3 conditions, each shows one outcome with `odds` like "2.22". Useful as the only GET that exposes live odds. |
| Firm quote + limits | `POST /bet/calculation` body `{environment, wallet?, bets:[{conditionId,outcomeId}]}` -> `{maxBet, minBet, maxPayout, odds, selections}` | **not called**. This is where max bet per selection comes from; I could not observe it. |
| Relayer fee | `GET /bet/gas-info?environment=` | **Verified**: PolygonUSDT returned `relayerFeeAmount:"0"`, `gasPrice:0`, `betTokenRate:1`, `slippage:0.05`, `symbol:"USDT"`. |
| Order status | `GET /bet/orders/{id}`, `GET /bet/orders/bettor/{id}` | order states Created -> Placed -> Sent -> Accepted/Rejected -> Settled; Cancel: PendingCancel/CancelFailed/Canceled (H, createBet docs) |

- **WebSocket (H, verified handshake):** connect to `wss://streams.onchainfeed.org/v1/streams/feed`, send `{"event":"SubscribeConditions","data":{"conditionIds":[...],"environment":"PolygonUSDT"}}` or `SubscribeGames` with `gameIds`. Server acks `{"event":"SubscribedToConditions","data":[ids]}` (observed, fixture). Updates arrive as `ConditionUpdated` (`conditionId`, `state`, `outcomes[{outcomeId,title,currentOdds}]`) and `GameUpdated` (`score`, `state`) per the docs (not observed, no line moved in 12 s). Docs say to reconnect after 5 s and resubscribe on `onopen`. Auth: none observed.
- **Shape gaps I could not close (POST rule):** a full multi-outcome condition with all `odds` and `margin`; `bet/calculation` limits. A production adapter needs `conditions-by-game-ids`; its body/response shape is from the OpenAPI spec (H for the spec, unverified live).
- **Resolution read path:** `wonOutcomeIds` and `state` in the conditions response; `getIsPendingResolution`/`isOutcomeSettled` helpers in the toolkit; settlement is also visible in the bets subgraph (POST GraphQL).

---

## 5. Trade path (programmatic)

Flow (H, https://gem.azuro.org/hub/apps/APIs/backend/betting plus toolkit source `src/utils/bet/{createBet,getBetTypedData}.ts` and `src/config.ts`, SDK `useBet.ts`):

1. `POST /bet/calculation` for odds and limits; `GET /bet/gas-info` for `relayerFeeAmount`.
2. **ERC-20 approve** of the bet token (USDT) to the **Relayer** contract for `amount + relayerFee` (SDK computes `betAmount + relayerFeeAmount`). This is a normal on-chain `transaction` from the bettor (needs a little POL for gas).
3. Sign **EIP-712** typed data:
   - domain `{name:"Live Betting", version:"1.0.0", chainId:137, verifyingContract:<Core address>}`
   - primaryType `ClientBetData` = `{clientData: ClientData, bets: SubBet[]}`
   - `ClientData` = `{attention:string, affiliate:address, core:address, expiresAt:uint256, chainId:uint256, relayerFeeAmount:uint256, isFeeSponsored:bool, isBetSponsored:bool, isSponsoredBetReturnable:bool}`
   - `SubBet` = `{conditionId:uint256, outcomeId:uint128, minOdds:uint64 (12-decimals), amount:uint128, nonce:uint256}` (SDK uses `nonce = Date.now()`, default `attention` text "By signing this transaction, I agree to place a bet for an event on Azuro Protocol").
4. `POST /bet/orders/ordinar` with `{environment, bettor, betOwner, clientBetData:{clientData, bet}, bettorSignature, bonusId?}` -> `{id, state}`. No API key, no JWT. Poll `GET /bet/orders/{id}`.
5. The backend "oracle" countersigns and an executor calls `Relayer.betFor(OrderData[])` on-chain; the bettor receives the bet token. The relayer pays gas and is reimbursed `relayerFeeAmount` in the bet token (currently 0 on Polygon).
6. After resolution: `LP.withdrawPayout(core, tokenId)` (or `withdrawPayouts`) as a normal `transaction` from the bet-token owner.

- **Slippage control:** `minOdds` in the signed message (SDK `calcMinOdds({odds, slippage})`). **Expiry:** `expiresAt`.
- **Not verified:** whether `affiliate` may be the zero address (type is `address`, required; the docs' raw example passes `""`; the SDK takes it as a required prop). Whether the backend enforces any allowlist on callers (NOT FOUND).
- **Cancel/sell:** pre-placement cancel states exist; post-placement exit only via Cashout (separate EIP-712 domain `{name:"Cash Out", version:"1.0.0"}`, type `CashOutOrder`).

### PayBox reachability: **yes (technically)**

Evidence (M, reasoned from sibling research `docs/research/06-paybox-platform.md`, H there): PayBox `request_wallet_sign` supports `typedData` (EIP-712) and `transaction` intents for an EVM MPC wallet whose address is shared across `eip155:*`, and its chain catalog (live `discover_tokens`, 2026-10-19) includes **Polygon (137)**. Azuro needs exactly: one `transaction` (USDT approve to Relayer), one `typedData` per bet, one `transaction` per redemption, plus an HTTPS POST to `api.onchainfeed.org` from the plugin or agent. No human-created API key and no account sign-up. Caveats: (a) USDT on Polygon must be fundable via PayBox (not checked; no PayBox tool was called); (b) POL for approve/redeem gas (no gasless path for the approve); (c) a plugin sandbox cannot sign itself, so use prepare -> `request_wallet_sign` -> submit; (d) the typedData is plain (not Kernel-wrapped), so readable fields are available to the signer, though how PayBox renders typedData is NOT FOUND (per `06-paybox-platform.md`); (e) geo/ToS and size (below).

---

## 6. Fees

- **Margin inside the odds (H):** each Condition has a `margin`; final odds are `o_i` reduced by spread `s_i` with `1 - 1/sum(1/o_i) = margin`. I could not measure a live margin (needs the POST conditions endpoint). Pinnacle-style 1X2 margins are typically a few percent (L, my assumption, not evidence).
- **Odds grid (H):** two-decimal grid makes tiny edges disappear (a 2.22 quote cannot express 2.225).
- **Relayer/gas fee (H):** `relayerFeeAmount = gasLimit * gasPrice * (1+slippage) * betTokenRate`, paid by the bettor in the bet token, signed into `clientData`, unless `isFeeSponsored`. Live Polygon value today = **0** (fixture).
- **No separate taker/maker fee** appears in the signed message (H). Protocol "rewards" come out of pool P&L, not out of bettors: LP 20% and Data Provider 10% of each Condition's pool P&L; apps get `min(70% x AppRevenue, 50% x spread x bet size)`; remainder to AzuroDAO (H, `reward-distribution` source). Apps may add their own cashback/affiliate economics.
- Polygon gas for the approve and redeem transactions is paid by the user (M).

---

## 7. Resolution mechanism and dispute risk

- **Who resolves (H, `protocol-actors/data-providers`, last modified 2026-03-13):** the permissioned Data Provider resolves Conditions "in good faith"; **AzuroDAO is the arbiter of last resort** (AZUR holders as Schelling point; the voting mechanism is "redacted" in the docs). The only provider named is Pinnacle ("one of Azuro's Data Providers"); who is the provider for current Polygon conditions is NOT FOUND (condition ids encode provider `006` in the sample, unmapped). Providers post collateral up to their Reinforcement.
- **Timing (H, FAQ source `knowledge-hub/faqs/betting`):** "on average within two hours of the event's end time"; report delays on Discord.
- **Settlement policy (H, gem-docs `rules-and-settlements-policy`):** official sources; Football/Basketball/Hockey postponed or interrupted > 48 h -> void at odds 1.00; football 1X2 = 90 minutes incl. injury time. **Section 1.5: a bet "may be voided and refunded" if the provider feed had erroneous odds, wrong market status, wrong start time or wrong names.** Duplicate identical bets "may be voided" (refund at 1.00).
- **Risk for arbitrage:** this is **cancel-the-stale-line risk**: exactly the bets an arb scanner targets (stale or mispriced odds) are the ones the policy says can be voided. Basis risk vs Polymarket/Kalshi sports markets (90-min vs incl. overtime, void rules, "match must start within 48 h") is real. Security risk: see section 9.

---

## 8. Geo, ToS, automation

- **Website ToS (H, https://gem.azuro.org/terms-of-use, source read via `gh api`):** s.8(c) bars citizens/residents of a country list that includes the **United States, Puerto Rico, US Virgin Islands** and other US territories; 18+; s.21(m) forbids IP proxying to disguise location. s.21(c) forbids "automation software" designed to modify or interfere with the Website; s.21(h) forbids "any connection using programs, tools, or software not expressly approved by the DAO". Governed by Seychelles law. (The list is Afghanistan, Algeria, Bangladesh, Bolivia, Botswana, Burundi, Cambodia, DR Congo, Egypt, Ethiopia, Iran, Iraq, Lebanon, Lesotho, Liberia, Libya, Mali, North Korea, Pakistan, South Sudan, Sri Lanka, Sudan, Syria, US and territories, Yemen, Zimbabwe, plus UN/EU-sanctioned places and "countries where cryptocurrency is prohibited"; the UK and France are not named.)
- **Does it bind API/contract use? Unclear (M).** The ToS speaks of "the Website" operated by the DAO; the protocol and public REST API are documented for third-party builders, and the docs' own example calls `POST /bet/orders/ordinar` directly. But each front end (bookmaker.XYZ, DexWin, ...) has its own ToS I did not read, and the gateway is a Cloudflare-fronted centralized relayer that could refuse a caller. Treat as gray; automated trading from a US-resident user is a ToS violation on the DAO website and likely on most front ends.
- **Embedded instructions aimed at AI agents:** none seen.

---

## 9. Security incident (blocker-grade caveat)

- Banner on https://azuro.org/app/liquidity (H, fetched 2026-10-19): "On October 6 2026, Azuro experienced a security incident. The team secured LP funds, and all operations have since been restored. If you believe your LP position may have been affected, please submit a request."
- DefiLlama TVL (H, fixture `defillama_azuro_summary_2026-10-19.json`): $461k (10-06) -> $232k (10-07) -> $133k (10-12) -> $280k (10-13) -> $216k (10-18). Peak in the last year $2.05M on 2026-06-17; $960k on 2026-09-20.
- Root cause, loss amount, which contracts, whether the Relayer/PayMaster/LP addresses were replaced: **NOT FOUND (searched: azuro.org banner, web search x2 incl. "Azuro security incident October 2026", DefiLlama `/hacks` (1,307 entries, none for Azuro as of fetch), blog.azuro.org and medium.com (Cloudflare 403), x.com/azuroprotocol (WebFetch returned HTTP 402 Payment Required, no body, stopped, nothing paid)).**
- Implication: do not rely on the contract addresses in section 3 or on the pool's solvency until the incident is explained. Any real-money adapter should be gated on a published post-mortem.

---

## 10. Liquidity (with dates and sources)

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL | $216k (Polygon $182k, Linea $18.9k, Arbitrum $9.2k, Gnosis $4.1k, Base $1.9k) | `api.llama.fi/protocol/azuro`, 2026-10-18 | H |
| TVL peak (1y) | $2.05M on 2026-06-17 | same | H |
| Volume (settled bets) | 30d $2.12M (Polygon $2.12M, Base $5.9k); 1y $9.43M; 7d and 24h = $0 | `api.llama.fi/summary/dexs/azuro`, 2026-10-19; zeros from 2026-10-07 (settled-bets-only Dune adapter, so may lag) | H |
| Daily volume before the incident | $23k-$295k/day through September; $42k on 2026-10-06 | same | H |
| Open turnover, all active Polygon games | ~$14,008 over 987 games (Football 639 games $8.1k; American Football 14 / $2.7k; Tennis 124 / $2.4k; Basketball 68 / $0.7k; others ~0) | computed from `navigation?environment=PolygonUSDT`, 2026-10-19 00:10 UTC | H (sum), M (turnover semantics = cumulative stake per game, not depth) |
| Biggest single game | NFL Packers-Cowboys $1,694; UEFA Conference League top matches $0.9-1.2k | `games-by-filters`, 2026-10-19 | H |
| Max stake per selection | NOT FOUND (requires `POST /bet/calculation`) | | |
| Live games | 31 (turnover $90-$203 each for the top five) | `games-by-filters gameState=Live` | H |

Vs. the P0 bar: far below it. Even before the incident, the trailing-year average was only ~$3.4M/month of settled volume on Polygon (DefiLlama `monthlyAverage1y`), small versus the leaders.

---

## 11. Event coverage and arbitrage relevance

- **Categories (H, navigation):** Sports hub: Football (soccer: UEFA Champions/Europa/Conference, domestic leagues, lower leagues), American Football (NFL), Basketball (NBA, LNBP), Tennis (ATP/WTA events), Ice Hockey, Volleyball, Boxing, MMA, Cricket, Snooker, Table Tennis, Formula 1, Handball, Rugby League; Esports hub: Counter-Strike 2, Dota 2. **No politics, crypto-price, macro, weather or entertainment markets.**
- **Overlap with other venues:** match-winner and totals markets for the same fixtures also trade on Polymarket (sports), Kalshi (sports), SX Bet, Overtime, Limitless/MagicMarkets (sports subsets) and Manifold-style play markets. The arb surface is **moneyline/1X2/totals on mainstream football, NFL, NBA, tennis**.
- **Price independence:** Azuro odds are the Data Provider's bookmaker feed (Pinnacle named in docs, M) shifted by the vAMM, so Azuro is best treated as a **sharp-bookmaker reference line** for sports contracts on prediction markets (useful signal), not as an independent crowd price.
- **Shared liquidity (important for the "independent leg" test):** all Azuro front ends (bookmaker.XYZ, DexWin, DGBet, PinWin, Giraft, GambleF*kkers, Gamblr.xyz, YezBet) sit on the **same LP pool** and the same odds feed. So Azuro is **one** venue, not many, and it does not share liquidity with Polymarket/Kalshi/XO. Within Azuro, the same game is one set of conditions regardless of front end; bonus/cashback programmes differ by front end.

---

## 12. Fixtures saved (all <= 50 KB, taken 2026-10-19 from unauthenticated GETs)

In `docs/research/fixtures/azuro/`:
- `games_by_filters_PolygonUSDT_prematch_p1_perPage10_2026-10-19.json` (8.7 KB, top-10 prematch by turnover)
- `games_by_filters_PolygonUSDT_live_p1_perPage10_2026-10-19.json` (8.8 KB)
- `games_by_filters_BaseWETH_prematch_empty_2026-10-19.json` (shows `total: 0`)
- `navigation_PolygonUSDT_TRIMMED_2026-10-19.json` (4.9 KB; the real response is 64 KB, trimmed to 5 sports x 3 countries)
- `predefined_combo_PolygonUSDT_2026-10-19.json` (12 KB; only GET that exposes live odds)
- `bet_gas_info_PolygonUSDT_2026-10-19.json`
- `ws_subscribe_ack_2026-10-19.json` (observed ack plus note)
- `openapi_index_and_selected_schemas_2026-10-19.json` (24 KB; path index and the request/response schemas used here; full spec 94 KB not stored)
- `defillama_azuro_summary_2026-10-19.json` (TVL/volume series used in sections 9-10)

---

## 13. Integration recommendation

- **P2, signal-only read adapter.** Poll `games-by-filters` (Prematch, `sportHub=sports`, a few pages) + `predefined-combo` (GET) now; add `conditions-by-game-ids` (POST, read-only) and the WS `SubscribeConditions` feed when POST reads are allowed. Map `participants`, `startsAt`, `league.slug` to the market-linking layer (sports fixtures). Price = 1/odds with margin removed per Condition using the returned `margin`.
- **Do not build a trade adapter yet.** Reasons: thin liquidity, unexplained 2026-10-06 incident, void-for-stale-odds clause, ToS (US excluded, automation language), no firm limit data, and a two-decimal odds grid that eats small edges.
- **If revisited**, gating checklist: (1) published post-mortem and verified contract addresses; (2) read `bet/calculation` max stake for the top 20 games (needs approval to POST); (3) confirm `affiliate` zero-address acceptance; (4) PayBox: confirm USDT-on-Polygon funding and a `typedData` signing dry-run with `check_operation_readiness`; (5) decide geo posture.

---

## Sources

- https://azuro.org (title/meta, H), https://azuro.org/ecosystem (apps, H), https://azuro.org/app/liquidity (incident banner, H)
- https://gem.azuro.org/ (docs index, M summary), https://gem.azuro.org/hub (nav, M), https://gem.azuro.org/hub/apps/APIs (+ `/backend`, `/backend/betting`, `/websocket`, `/websocket/use`) (H/M)
- https://api.onchainfeed.org/api/v1/public/gateway/docs , `.../docs-json`, `.../docs-yaml` (OpenAPI, H); live GETs under `/market-manager/*` and `/bet/gas-info` (H)
- `wss://streams.onchainfeed.org/v1/streams/feed` (subscribe/ack, H)
- https://gem.azuro.org/hub/blockchains/deployment-addresses , `/bet-functions` (M summaries) ; https://gem.azuro.org/terms-of-use (H, source read via `gh api`)
- gem-docs source (via `gh api`): `knowledge-hub/how-azuro-works/{liquidity-tree,components/odds,components/vAMM,components/reinforcement,reward-distribution,protocol-actors/data-providers}`, `knowledge-hub/introduction/*`, `knowledge-hub/additional/rules-and-settlements-policy`, `knowledge-hub/faqs/betting`, `hub/apps/APIs/backend/betting` (H)
- https://github.com/Azuro-protocol/toolkit (`src/config.ts`, `src/envs.ts`, `src/utils/getEndpoints.ts`, `src/utils/bet/{createBet,getBetTypedData}.ts`, release v7.2.0), https://github.com/Azuro-protocol/sdk (`src/hooks/write/useBet.ts`, releases) (H)
- https://api.llama.fi/protocol/azuro , https://api.llama.fi/summary/dexs/azuro , https://api.llama.fi/hacks , https://github.com/DefiLlama/dimension-adapters (`fees/azuro/index.ts`) (H)
- Sibling research for PayBox facts: `docs/research/06-paybox-platform.md`, `docs/research/09-venues-onchain-clob.md` (H there)
- Searches (extended): "Azuro protocol 2026 predictions layer"; "Azuro developer docs api.onchainfeed.org ..."; "Azuro security incident October 6 2026 ..." (x2); "Azuro ecosystem frontends ... 2026" (M/L, third-party blogs; used only for orientation)

## NOT FOUND (searched)

- Rate limits for the public REST/WS API (docs, OpenAPI, headers).
- Incident root cause / loss / post-mortem (see section 9).
- Live per-condition `margin`, full multi-outcome odds, `bet/calculation` max bet (needs POST; not performed).
- Identity of the Data Provider for current Polygon conditions (docs name only Pinnacle, page dated 2026-03-13).
- Whether the API or relayer refuses automated or US-origin callers (ToS covers "the Website"; no API terms found).
- Whether `affiliate` can be the zero address.
- Details of the "AzuroDAO" dispute voting mechanism ("redacted" in docs).

## Suspicious content

None observed. (ToS contains ordinary legal text; no AI-directed instructions. x.com returned HTTP 402 via WebFetch with no body: nothing paid, stopped.)

## Privacy check

Requests used only the User-Agent `insurance-markets-research/0.1` (curl); WebFetch/WebSearch and a Node WebSocket used their default agent strings. No personal identifier appeared in any request, URL, query or note; the one helper script (a 12-second WebSocket subscribe) was grepped for `@` and for the user's name before running.
