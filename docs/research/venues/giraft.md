# Giraft (bet.giraft.io) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 04:29-04:40 UTC). READ-ONLY: page and docs reads, public JS chunks read statically (downloaded, never executed), `gh api` file reads, unauthenticated GETs to documented hosts. No account, wallet, key, signature, POST/PUT/DELETE, PayBox tool or paid call was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source, small-model page summary, or my inference from first-hand data; **L** = weak or stale. Anything dated before 2026-04-19 is flagged STALE.

Fixtures (<= 50 KB each): `docs/research/fixtures/giraft/` (listed in section 12).
Sibling spec for the underlying protocol: `docs/research/venues/azuro.md` (same day, same facts re-checked here where Giraft depends on them).

---

## 0. Bottom line

1. **Giraft is a front-end, not a venue.** It is a Next.js web app ("Giraft Bets", operator "Giraft LLC") that reads Azuro's public API and bets on Azuro's shared liquidity pool. Its own bundle embeds the canonical Azuro V3 contract set (LP, Core, Relayer, AzuroBet, Cashout) and calls `api.onchainfeed.org`; no Giraft-owned backend, order book or pool was found. (H, section 2.)
2. **Live, but only on Polygon/USDT in practice.** The site loads with a 2026 footer and renders live Azuro games. The app config enables Polygon, Base and Gnosis, but the Azuro API returns **0 games for Base and Gnosis**; only Polygon has markets (975 prematch + 21 live today). (H.)
3. **Not an independent arbitrage leg.** Same LP, same odds feed, same resolution as every other Azuro front end. Treat it as an *alias* of the Azuro adapter, distinguished only by the `affiliate` address in the signed bet. (H.)
4. **Inherits Azuro's problems:** ~$14k of open turnover across ~997 games, TVL ~$210k, and a security incident on 2026-10-06 with no post-mortem found. (H, section 9.)
5. **adapter_priority = skip** (duplicate liquidity). Do not build a Giraft adapter. Build/keep the Azuro adapter (P2, signal-only) and let `affiliate` be a config value; record Giraft's affiliate address as a known alias.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://bet.giraft.io/` | HTTP 200, `server: Vercel`, `x-powered-by: Next.js`, `<title>Home | Giraft Bets</title>`, footer "(c) 2026 Giraft Sports" (headers fixture) | H |
| Content is current | SSR HTML contains Azuro avatar URLs for current game ids; sports pages show counts (e.g. Football 584, Tennis 140 on the FAQ page, fetched 2026-10-19) that track the API (Football 639, Tennis 133 a few minutes later) | H |
| Azuro lists it | https://azuro.org/ecosystem lists "Giraft - Smooth on-chain betting experience, combining best-in-class odds, zero friction, and a sleek interface." with a "Go to App" link, same status as bookmaker.XYZ, DexWin, DGBet, PinWin, GambleF*kkers, Gamblr.xyz, YezBet; Trendle is "Coming Soon" | H |
| Underlying protocol | Azuro API serves Polygon games with start times from 2026-10-19 06:30 UTC onward; toolkit/sdk released 2026-10-11 (per sibling spec) | H |
| Real bets accepted today? | NOT verifiable without a POST or an on-chain read. Giraft-specific volume: NOT FOUND (needs the bets subgraph, a POST). | - |
| Security incident at protocol level | Banner on https://azuro.org/app/liquidity (fetched 2026-10-19): "On October 6 2026, Azuro experienced a security incident." / "The team secured LP funds, and all operations have since been restored." | H |
| Giraft's social channels | X returned no readable body (blocked/402 in sibling run; not retried), Medium returned HTTP 403. Latest announcement found: Azuro V3 live on Polygon, Gnosis, Base (X post dated 2025-05-11 from its snowflake id; seen only as a search-result snippet). STALE. | M/L |

Verdict: **still_live = true** (front end up, feed live); depends on Azuro's post-incident state for real trading.

---

## 2. Kind and market model

- **Kind (H):** sports-betting front end ("broker-or-frontend") on a pooled-liquidity fixed-odds protocol. Evidence it is only a front end:
  - Footer "Powered By" links to azuro.org (H, page fetch).
  - T&C s. "Event and Odds Information": "Bets are based on pre-match information and odds from the Azuro protocol." and "The DAO's data providers determine the outcome of such postponements." (H, https://bet.giraft.io/terms-conditions, last updated 7 August 2024, STALE).
  - Bundle (`/_next/static/chunks/f13d7001-*.js`) embeds, for Polygon, `lp 0x0FA7...E1b8`, `core 0xF954...2AC7`, `relayer 0x8dA0...Ba9d`, `azuroBet 0x7A1c...265B`, `cashout 0x4a2B...9095`, identical to the Azuro docs' V3 deployment addresses recorded in `azuro.md`; also the Base set (`lp 0x1eD7...Af87`). API host `https://api.onchainfeed.org/api/v1/public`, WS `wss://streams.onchainfeed.org/v1/streams`, bets subgraph `thegraph.onchainfeed.org/subgraphs/name/azuro-protocol/azuro-api-<chain>-v3`. (H, static read.)
  - No Giraft-owned API host found in the chunks read (only `api.relay.link` for bridging/funding and Privy for wallets). (H absence over 38 chunks; M overall.)
- **Market model (H, via Azuro):** Game -> Conditions (markets) -> Outcomes. Binary, 3-way (1X2) and N-way outcome sets; sports/esports only. Fixed odds with margin, pool is the counterparty. No order book, no tradable outcome token (a bet mints an `AzuroBet` NFT-like bet token, redeemable after resolution), no secondary market except Cashout. Combos ("express") supported. Full detail: `azuro.md` section 2.
- **Giraft UI specifics:** odds display switch (EU/US/UK, cosmetic; `oddsSelected` default "EU"), "My Bets", Connect (Privy embedded wallets, MetaMask/Rabby), Cashout. A "Politics" nav item exists (`/sports/politics`) but the page renders "No Events"; the Azuro navigation feed has no politics sport. (H)

---

## 3. Chains and collateral

| Chain | Giraft app config | Azuro API games today | Collateral | Tag |
|---|---|---|---|---|
| **Polygon (137)** | enabled, **default chain** (`initialChainId: 137` in SSR HTML) | **975 prematch + 21 live** | USDT `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`, 6 dec | H |
| Base (8453) | enabled (WETH) | **0** | WETH `0x4200...0006`, 18 dec | H |
| Gnosis (100) | enabled (WXDAI) | **0** | WXDAI `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d`, 18 dec | H |
| Polygon Amoy | dev only (`NEXT_PUBLIC_USE_AZURO_DEV`) | n/a | AZUSD | M |

- FAQ (https://bet.giraft.io/faqs, JSON-LD) says "Currently, we operate on Polygon, with many more chains to come soon." and "All bets placed are placed and redeemed in USDT." (H as a statement; the FAQ cites "As of July 2024", STALE). It is consistent with the API probe.
- The T&C min/max are quoted in "xDAI/USDt" (Gnosis-era wording, STALE).
- The bundle's Privy wallet config lists more chains than the three betting chains (the token map also carries an Arbitrum USDT entry), but those are wallet/token config, not betting markets; the Azuro API serves no Arbitrum games. (M)

---

## 4. Read API

**There is no Giraft API.** Use Azuro's public gateway (details and the full path list in `azuro.md` section 4; re-verified this session).

- Docs: https://gem.azuro.org/hub/apps/APIs ; OpenAPI UI https://api.onchainfeed.org/api/v1/public/gateway/docs ; spec JSON `.../gateway/docs-json` (94,291 bytes, "API Public Gateway" v1.0.0, fetched). (H)
- Base URLs: REST `https://api.onchainfeed.org/api/v1/public`; WS `wss://streams.onchainfeed.org/v1/streams/feed` (path used by Azuro's docs; the Giraft bundle uses the `.../v1/streams` prefix); bets subgraph (GraphQL = POST, not used). (H)
- Auth: none for `market-manager/*`, `bet/gas-info`, `bet/orders/*` GETs. Bearer JWT only for `bonus/*`, `cashback/*`, `user/favorites`. (H)
- Rate limits: NOT FOUND (searched: OpenAPI spec, response headers - Cloudflare, no `x-ratelimit-*`, docs pages). Be conservative.
- Environment strings (`environment=`): `PolygonUSDT` (live), `BaseWETH`, `GnosisXDAI` (empty). The enum in the spec also lists legacy `ArbitrumUSDT`, `LineaUSDT`, `ChilizWCHZ`, `BscUSDT`, `PolygonDGEN` and testnets. (H)
- Verified GETs (saved as fixtures):

| Purpose | Endpoint | Observed |
|---|---|---|
| Games list | `GET /market-manager/games-by-filters?gameState=Prematch\|Live&environment=&orderBy=turnover\|startsAt&orderDirection=&page=&perPage=` (+ `sportSlug`, `leagueSlug`, `sportHub`, `conditionState`) | `{games[], page, perPage, total, totalPages}`; Polygon prematch total 975, live total 21; Base/Gnosis `total: 0`. Game fields: `gameId`, `slug`, `title` ("A - B"), `startsAt` (unix s, string), `state`, `turnover` (decimal USDT string), `sport{sportId,slug,name,sporthub}`, `league`, `country`, `participants[{name,image}]`. `orderBy=turnover` is only valid with `turnover` or `startsAt` (400 otherwise). |
| Sports tree | `GET /market-manager/navigation?environment=` | 66 KB; sports -> countries -> leagues with `turnover`, `activeGamesCount`. Derived summary saved. |
| Free-text search | `GET /market-manager/search?environment=&request=&page=&perPage=` | Returns `games[]` only (no odds). New vs. the sibling spec. |
| Odds (only GET that exposes them) | `GET /market-manager/predefined-combo?environment=` | `{comboData:[{conditions:[{conditionId,state,title,outcomes:{title,outcomeId,odds:"2.22",...},game}]}]}`. Outcome odds come as 2-decimal strings. |
| Full condition book | `POST /market-manager/conditions-by-game-ids`, `condition-batch` | Read-only POSTs; **not called** (task rule). Schema from spec only. |
| Relayer fee | `GET /bet/gas-info?environment=` | Polygon, Base, Gnosis all `relayerFeeAmount:"0"`, `gasPrice:0`, `slippage:0.05`; symbols USDT / WETH / WXDAI. |
| Order status | `GET /bet/orders/{id}`, `/bet/orders/bettor/{id}` | not called |

- WebSocket: `SubscribeConditions {conditionIds, environment}` / `SubscribeGames`, per the sibling run's verified handshake (not repeated here).
- Resolution fields: `wonOutcomeIds`, condition `state` in the conditions response (spec). (H spec / unverified live)

---

## 5. Trade path (programmatic)

Same as Azuro (H; sources in `azuro.md` section 5), with Giraft-specific parameters taken from the Giraft bundle (H):

1. `POST /bet/calculation` -> `{maxBet, minBet, maxPayout, odds}` (not called). `GET /bet/gas-info`.
2. ERC-20 `approve(USDT -> Relayer 0x8dA0...Ba9d)` for `amount + relayerFee` (normal transaction, needs POL gas).
3. Sign EIP-712 `ClientBetData` (domain `Live Betting` v1.0.0, chainId 137, verifyingContract = Core) with `clientData.affiliate` and `attention` text. Giraft's values: **affiliate `0xE7A7981CF818e84BB6bEd7EABd0c7D69AD78C9Bd`**, attention "By signing this transaction, I agree to place a bet for an event on Giraft.io.", UI slippage 5%.
4. `POST /bet/orders/ordinar` (no key, no JWT). Backend countersigns; executor calls `Relayer.betFor`. Poll `GET /bet/orders/{id}`.
5. Redeem: `LP.withdrawPayout(core, tokenId)`.

**Affiliate semantics (H, gem-docs `hub/apps/guides/affiliate-wallet`):** "include [your wallet] as the `affiliate` parameter"; a wrong address cannot be fixed or moved. The affiliate is any address, so an aggregator does not need Giraft at all; it can use its own affiliate (or a Giraft one only with permission).

**There is no separate Giraft order API, key or allowlist.** Going "through Giraft" only means signing with its affiliate address.

### PayBox reachability: **yes for Polygon (partial), via the Azuro path**

(M, reasoned from `docs/research/06-paybox-platform.md`, which is H there: `request_wallet_sign` supports `typedData` and `transaction` for an EVM wallet; live `discover_tokens` chain catalog 2026-10-19 = Solana, Ethereum 1, Base 8453, Arbitrum 42161, OP 10, **Polygon 137**, BNB 56, Avalanche, Robinhood, Arc, Hyperliquid.) Polygon and Base are in the catalog; **Gnosis (100) is not**, but Gnosis has no markets anyway. A plugin sandbox cannot sign by itself; the working pattern is prepare -> agent calls `request_wallet_sign` -> submit. USDT-on-Polygon funding via PayBox was not checked (no PayBox tool used). Not worth doing for Giraft separately.

---

## 6. Fees

- **Margin in the odds** (from Azuro, H): per-Condition `margin`; two-decimal odds grid; since 2026-09-04 single bets pay quoted odds (combo modifier 0.99) per toolkit constants (sibling spec).
- **Giraft platform fee: none stated.** T&C: blockchain fees "are imposed by the blockchain ..., not by Giraft LLC"; no platform or service fee on the page. (H) No fee field in the signed message beyond `relayerFeeAmount`, which is 0 on all three envs today. (H)
- **Giraft's revenue is a protocol rebate, not a bettor charge** (H, gem-docs `reward-distribution`, last changed 2026-03-13): app reward = lower of `70% x AppRevenue` and `SRCt` where `SRCb = 50% x Spread x BetSize`; paid monthly per chain; apps only get >= 0. So bets tagged with Giraft's affiliate cost the bettor nothing extra.
- User pays Polygon gas for approve and redeem (POL). (M)

---

## 7. Resolution mechanism and dispute risk

- Resolved by Azuro's Data Provider; AzuroDAO is arbiter of last resort (see `azuro.md` section 7; docs page dated 2026-03-13). (H)
- Giraft T&C adds (H, quotes from https://bet.giraft.io/terms-conditions, updated 2024-08-07, STALE): "Bets are refundable if errors due to human or software issues occur, including obvious odds mistakes." ; "Bets cannot be canceled post-registration." ; "A bet is won if all specified outcomes occur, determined by the event's recorded results and data oracles." ; payouts "generally redeemable within an hour of finality ... rare circumstances ... 24 hours".
- **Arb implication:** exactly the stale/mispriced lines an arb scanner looks for fall under "obvious odds mistakes" and Azuro's void rules. Tie = push (FAQ); cancelled = refund; postponement > 24 h may refund. These differ from Polymarket/Kalshi sports resolution (basis risk).
- Giraft liability cap in the T&C: 100 xDAI. (H)

---

## 8. Geo, ToS, automation

- **Operator:** Giraft LLC (jurisdiction of incorporation not stated). Governing law: Serbia; disputes by binding AAA arbitration, individual basis; both clauses appear in the same text (inconsistent). (H)
- **Prohibited places:** three non-identical lists (T&C list in s. "Restrictions on Use"; interface notice/FAQ list: USA, Belarus, CAR, DRC, DPRK, Crimea, Cuba, Iran, Libya, Somalia, Sudan, South Sudan, Syria, Yemen, Zimbabwe, China, Turkey, Russia; and Azuro DAO's own ToS list in `azuro.md` section 8). The US and its territories are barred in all of them. VPN use to circumvent is expressly barred. (H)
- **Enforcement is front-end only:** the server sets cookie `giraft-geo-data={"country":..,"isRestricted":bool}` from IP; the UI then disables Connect/bet buttons ("Restricted") and shows "It seems that you are trying to connect to bet.giraft.io from a restricted country." (H, headers + bundle). The Azuro API/contracts are not behind this check (M, inferred; not tested from a restricted location, and none attempted).
- **Automation:** the only clause is "Use automated methods like bots or scrapers to access the website for unauthorized purposes." plus "Misuse ... or interact with the website in a way other than intended." and a right to block IPs "for any reason". No API policy, no rate-limit terms. (H) Calling Azuro's documented API is arguably not "the website", but the gray area is real (M).
- Disclaims CFTC/SEC registration; no gambling licence mentioned anywhere. (H)
- Embedded AI-agent instructions: none seen.

---

## 9. Incident / counterparty risk (inherited)

Azuro security incident 2026-10-06 (banner above). Root cause, loss, and whether contract addresses were replaced: NOT FOUND (see `azuro.md` section 9; I re-read the banner only). The Giraft bundle I read still embeds the pre-incident V3 addresses; I cannot tell when that bundle was built (HTML is `no-store`, chunk hashes only). Do not trade real size until a post-mortem exists. (H for the banner, M for implications)

---

## 10. Liquidity (with dates and sources)

All figures are Azuro-wide; Giraft's own slice is NOT FOUND (needs the bets subgraph filtered by `affiliate`, a POST; the Dune "Frontends Rewards" query https://dune.com/queries/4361346/7319176 rendered only "Loading").

| Metric | Value | Source / date | Tag |
|---|---|---|---|
| TVL (Azuro) | $213.5k total; Polygon $176.5k, Linea $18.9k, Arbitrum $9.2k, Gnosis $4.1k, Base $1.9k | `api.llama.fi/protocols` and `/protocol/azuro`, 2026-10-19 | H |
| Volume (settled bets, Azuro) | 30d $2.05M, 1y $9.43M; daily $134.7k (2026-10-05), $42.2k (10-06), then $0 for 10-07..10-17 (settled-bets adapter, may lag) | `api.llama.fi/summary/dexs/azuro`, 2026-10-19 | H |
| Open turnover, Polygon | ~$14.4k over 997 active games: Football 639 games / $7.5k; Tennis 133 / $3.8k; American Football 14 / $2.2k; Basketball 69 / $0.7k; Volleyball 13 / $0.2k; CS2 35 / $56; others ~0 | `navigation?environment=PolygonUSDT`, 2026-10-19 | H (sums); M (turnover = cumulative stake per game, not depth) |
| Largest game | NFL 49ers - Commanders $2,178; AS Monaco - SC Freiburg $1,205 | `games-by-filters`, 2026-10-19 | H |
| Live games | 21 (top: tennis, $169, $125, $80) | `games-by-filters gameState=Live`, 2026-10-19 | H |
| Min bet / cap | "smallest bet 1 xDAI/USDt"; express bets capped at 250,000 xDAI/USDt (T&C, 2024-08, STALE). Current per-selection max: NOT FOUND (needs `POST /bet/calculation`) | | L |
| Giraft token | none mentioned on site or FAQ | | M |

Far below the P0 bar and not Giraft-specific.

---

## 11. Event coverage and arbitrage relevance

- **Categories with actual markets (H):** Football (soccer), Tennis, American Football (NFL), Basketball, Volleyball, Ice Hockey, CS2, Dota 2, MMA, Boxing, Cricket, Baseball, Snooker, Handball, Rugby League, Formula 1, Table Tennis. Giraft's nav also shows "Politics" but with no events. **No crypto-price, macro, weather or election markets.**
- **Overlap:** moneyline/1X2/totals on mainstream football, NFL, NBA, tennis overlaps Polymarket sports, Kalshi sports, SX Bet, Overtime, Limitless. Game titles are "Home - Away" strings with `startsAt` and league slugs, enough for fixture matching.
- **Price independence:** odds are the Data Provider's bookmaker feed with a vAMM shift; useful as a sharp-line reference (see `azuro.md` section 11), not an independent crowd price.

## 11b. Shared liquidity

**Giraft shares 100% of its liquidity, odds, resolution and risk with Azuro and every other Azuro front end** (bookmaker.XYZ, DexWin, DGBet, PinWin, GambleF*kkers, Gamblr.xyz, YezBet). A scanner must dedupe: one Azuro Condition = one price, regardless of front end. (H, section 2.)

---

## 12. Fixtures saved (taken 2026-10-19, all <= 50 KB)

In `docs/research/fixtures/giraft/`:
- `games_by_filters_PolygonUSDT_prematch_p1_perPage10_2026-10-19.json` (8.8 KB; total 975)
- `games_by_filters_PolygonUSDT_live_p1_perPage10_2026-10-19.json` (8.4 KB; total 21)
- `games_by_filters_BaseWETH_prematch_empty_2026-10-19.json`, `games_by_filters_GnosisXDAI_prematch_empty_2026-10-19.json` (59 B each; `total: 0`)
- `search_PolygonUSDT_request-Monaco_2026-10-19.json` (1.7 KB)
- `predefined_combo_PolygonUSDT_2026-10-19.json` (12 KB; only GET exposing odds)
- `bet_gas_info_3envs_2026-10-19.json` (Polygon, Base, Gnosis)
- `navigation_PolygonUSDT_SUMMARY_2026-10-19.json` (DERIVED per-sport sums; the raw response is 66 KB)
- `giraft_frontend_config_extract_2026-10-19.json` (DERIVED from static reading of the public JS: chains, tokens, affiliate, hosts)
- `giraft_faq_jsonld_2026-10-19.json` (FAQ text, partly STALE)
- `giraft_home_headers_REDACTED_2026-10-19.txt` (country in geo cookie redacted)

---

## 13. Integration recommendation

- **skip** as a standalone adapter. Reasons: front end only; 100% shared liquidity with Azuro; no Giraft API; thin liquidity; unexplained 2026-10-06 incident; void-on-obvious-error clause; US excluded and "bots or scrapers" language.
- **Do instead:** in the Azuro adapter (P2, signal-only), (a) take `affiliate` and `environment` from config, (b) register `giraft` as a known front-end alias with affiliate `0xE7A7981CF818e84BB6bEd7EABd0c7D69AD78C9Bd` so that bets and `bets` subgraph rows can be attributed, (c) treat `BaseWETH` and `GnosisXDAI` as dormant (0 games) and alert if they come back.
- If the project ever wants Giraft-specific value, it is only the affiliate rebate (section 6) and Giraft's bonus/freebet campaigns, neither of which is documented publicly (NOT FOUND).

---

## Sources

- https://bet.giraft.io/ (page, headers, SSR payload, `/_next/static/chunks/*.js` read statically: `f13d7001-*`, `layout-*`, `9070-*`, `3990-*`) - H
- https://bet.giraft.io/faqs (JSON-LD FAQ), https://bet.giraft.io/terms-conditions (raw text checked, "Last Updated: 7 August 2024"), https://bet.giraft.io/sports/politics ("No Events"), https://bet.giraft.io/privacy-policy (not read) - H
- https://giraft.io/ (tagline "Redefining the Game, Sports On-Chain."; "any evm blockchain"; no team/token/licence/Azuro mention) - M (page summary)
- https://azuro.org/ecosystem (Giraft listed) - H ; https://azuro.org/app/liquidity (incident banner) - H
- https://api.onchainfeed.org/api/v1/public/gateway/docs-json (OpenAPI), live GETs under `/market-manager/*` and `/bet/gas-info` - H
- https://github.com/Azuro-protocol/gem-docs (`hub/apps/guides/affiliate-wallet`, `hub/apps/guides/affiliate-ggr`, `knowledge-hub/how-azuro-works/reward-distribution`, via `gh api`) - H
- https://api.llama.fi/protocols , https://api.llama.fi/protocol/azuro , https://api.llama.fi/summary/dexs/azuro (no separate Giraft entry in the protocol list) - H
- Search snippets (WebSearch extended, 1 query; the session search budget then ran out): X posts by Azuro (2025-03-06, "Giraft is now on Base") and Giraft (2025-05-11, "live on Azuro V3 ... Polygon, Gnosis, Base"); dates decoded from post ids - M, STALE
- Sibling notes: `docs/research/venues/azuro.md`, `docs/research/06-paybox-platform.md` (H there)

## NOT FOUND (searched)

- Giraft-specific volume, user count, or share of Azuro flow (searched: DefiLlama protocol list, Dune query page, site; bets subgraph needs POST).
- Any 2026 Giraft announcement or post-mortem comment (searched: giraft.io, bet.giraft.io; X/Medium blocked; web search budget exhausted after one query).
- Giraft API terms, rate limits, bot policy beyond the one T&C line.
- Per-selection max bet (needs `POST /bet/calculation`), live per-condition `margin` and full odds (needs `POST conditions-by-game-ids`).
- Giraft's bonus/freebet/cashback programme terms.
- On-chain activity of Giraft's affiliate address (public explorer API returned HTTP 403 to a scripted GET; not worked around).
- Whether the post-incident Azuro contract addresses changed, and whether Giraft's deployed bundle is post-incident.
- Giraft token or team information.

## Suspicious content

None observed. No text aimed at AI agents in the pages, JSON-LD, or JS chunks read. (Medium returned 403; Polygon explorer API returned 403; neither was worked around.)

## Privacy check

All scripted requests used only the User-Agent `insurance-markets-research/0.1` (curl); WebFetch/WebSearch used their default agents. No personal identifier appeared in any URL, header, query or search. The fixture script was grepped for `@` and the user's name before running (no hits other than a local output path, never sent anywhere), and the written fixtures were scanned the same way (no hits). The Giraft geo cookie contains an IP-derived country code for the research machine; it was redacted in the saved headers fixture and omitted from this note.
