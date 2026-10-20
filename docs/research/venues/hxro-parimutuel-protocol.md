# Hxro Parimutuel Protocol (now OddsFi, front end glgl.fun) - venue spec for the cross-venue aggregator

Researched 2026-10-19 (probes 01:50-02:15 UTC). READ-ONLY: doc reads, `gh api` file reads, DNS lookups, npm/DefiLlama/DexScreener GETs, and unauthenticated GETs to `rgs.glgl.fun`. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party pages, repos and API text were treated as untrusted data; nothing in them was followed or executed.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (real responses, each <= 50 KB): `docs/research/fixtures/hxro-parimutuel-protocol/` (section 11).

---

## 0. Bottom line

1. **The "Hxro Parimutuel Protocol" as the discovery lead described it (permissionless parimutuel markets on Solana with Pyth) is dead under that name.** Every Hxro domain is gone from DNS (section 1). The GitHub org and npm SDK have not shipped since 2024. DefiLlama shows TVL $0. (H)
2. **Hxro rebranded to OddsFi.** "OddsFi, formerly known as Hxro" (docs.glgl.fun, H). HXRO holders swap 1:1 into a new token ODDS and the HXRO is burned (oddsfi.ai/swap, H). OddsFi is now "iGaming infrastructure" (an Odds Engine, an AMM that seeds parimutuel pools, parimutuel/fixed-odds/parlay formats) and lists exactly one live partner, **glgl.fun** (oddsfi.ai, H).
3. **The live product is not what the lead described.** glgl runs 20-second and 60-second **BTC/USD Higher/Lower** rounds, staked in SOL, from a **custodial "glgl balance"**. Rounds are "recorded by the game server, not on-chain" (docs.glgl.fun/trust-and-risk/security, H). Pools are seeded by an in-house market maker (OddsMM). The US and 25 other countries are blocked.
4. **No arbitrage relevance.** One asset (BTC/USD), two durations (20s, 60s), no event contracts, no sports, no politics, no macro. No other covered venue lists a 20s or 60s contract, and the pool split is steered by the market maker, not by crowd belief (H, OddsMM doc). The sampled pools were 100% seed (section 8).
5. **adapter_priority = skip.** Nothing here is a tradeable edge leg or a useful signal. If the scanner ever wants a "tiny-horizon BTC pool" reference, the keyless read endpoints in section 4 are cheap, but I would not spend adapter effort.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `hxro.network` DNS (1.1.1.1 and 8.8.8.8, 2026-10-19) | NOERROR but **no A/AAAA record** at the apex; NS = Cloudflare; MX = Zoho still set. `www.hxro.network` and `docs.hxro.network`: **NXDOMAIN**. WebFetch of both: `getaddrinfo ENOTFOUND`. | H |
| `hxro.finance` / `app.hxro.finance` (the swap-app link on oddsfi.ai/swap) | **NXDOMAIN** on both resolvers. The official HXRO to ODDS swap app link is currently unreachable. | H |
| Web-archive index for `docs.hxro.network` | Real docs pages (21-35 KB) in snapshots from 2024-12-18 through 2025-12-04; then 1.1 KB stub snapshots on 2026-04-20 and 2026-05-10. `hxro.network` has the same 1.1 KB stub on 2026-04-22 and 2026-05-17. The two stubs I read are a "Click here to enter" page with a FingerprintJS redirect to a tracking URL, i.e. a parked or hijacked domain, not Hxro content. I did NOT read the Dec 2025 docs content (see "Method note"). | M |
| GitHub org `Hxro-Network` (16 repos) | Last real commits 2024: `agnostic-orderbook` 2024-06-12, `hxro-protocol-docs` 2024-05-04, `parimutuel-ui` 2024-01-17, `parimutuel-ts-project` 2023-02-25. The `solana` repo shows pushed_at 2026-10-06 but its last commit is a Solana fork commit from 2024-03-18 (not Hxro work). | H |
| npm `@hxronetwork/parimutuelsdk` | Latest 1.0.42, published 2024-04-05. Nothing since. | H |
| DefiLlama `hxro-network` (Derivatives, Solana) | TVL $0 on 2026-10-19; only HXRO token staking ($149.9k, `Solana-staking`). | H |
| HXRO token | Meteora pools; largest pool $3.5k liquidity, $194 24h volume, price $0.0030 (DexScreener, 2026-10-19). | H |
| Successor `oddsfi.ai` | Live, "(c) 2026 OddsFi". Docs at `oddsfi.gitbook.io/oddsfi-docs` hold one blog-style page and no API/SDK. | H |
| Successor product `launchpad.glgl.fun` | Live. Public API returns running 20s and 60s series with rounds rolling every 20s/60s (fixtures). 20 user-created markets since 2026-02-15, newest 2026-10-03. Terms "Last updated: 9 October 2026". | H |
| Old on-chain program `GUhB2ohrfqWspztgCrQpAmeVFBWmnWYhPcZuwY52WWRe` (listed in Hxro docs repo `PARIMUTUEL_CRANK.md`, last edited 2024-05-04) | Whether it still has activity: **NOT FOUND**. Solscan returned 403, SolanaFM 502, and a JSON-RPC check needs a POST, which this task forbids. | H (id) / unknown (activity) |

Verdict: **the Hxro-branded venue is not live; its successor (OddsFi powering glgl) is live but is a different, custodial, single-asset product.** `still_live = false` for the venue as named.

---

## 2. Kind and market model

**Legacy Hxro Parimutuel (on-chain, Solana) - M/H from SDK and docs repo, all 2023-2024:**
- Permissionless, parimutuel (long/short pools), crypto-pair markets with fixed durations (SDK constants `MIN_1`, `MIN_5`, `MIN_15`, `HR_1`, `DAY_1`), position accounts per trader, a "crank" process that locks and settles (`PARIMUTUEL_CRANK.md`). Collateral networks for USDC, GUAC and BONK are listed by network key. SDK fee parameters: protocol fee 10-150 bps, settlement fee 100-300 bps (defaults in `updateNetwork`, H, npm readme). Oracle: SDK takes "product" and "price" oracle pubkeys; Pyth per the lead and Hxro marketing (L/M, not re-verified).

**Current OddsFi / glgl (off-chain game server, SOL) - H:**
- **Binary, parimutuel, pooled.** One pool per round, two sides called `Moon` (Higher) and `Rekt` (Lower) in the API. Winners split the whole pool pro rata to stake. No order book, no AMM curve for bettors, no tradeable outcome token, no secondary market. Cancel is allowed until lock, then no exit (docs.glgl.fun).
- **Series:** `up_down_turbo_sol` (20s) and `up_down_sol` (60s), both `Crypto.BTC/USD`, `contestType: OverUnder`, `fixedOdds: false`, `minPlayers: 3` (API fixture). "BTC/USD is the only asset live today" (docs).
- **Rounds are staggered:** about 4-5 future rounds are `Opened` at once; entries go to the earliest open round and close at its start (`contestLiveTime`). Status flow seen: `Opened` -> `Live` -> `Closed`.
- **Pricing:** `moonOdds = prizePool / moonPool * 0.975` and `whitelabelMoonOdds = moonOdds * 0.975` (I reproduced this from the fixture to 4 decimals). Odds move until lock.
- **Seeding:** OddsMM puts a seed on both sides before and during the open phase. Docs: a 20s pool opens with 5 SOL and a 60s pool with 10 SOL. The Odds Engine weights the opening split and a hidden controller can add more to either side up to lock (docs.glgl.fun/under-the-hood/oddsmm). Inputs not published.
- **Ties** (closing price exactly equals lock price): stake returned minus the 2.5% entry fee. **Voided rounds** (price feed failure, MM fails to commit seed): "We're still confirming what you get back" (docs, H).
- **Ids:** Solana-style base58 strings (series, contest, game).

---

## 3. Chains and collateral

| Item | Detail | Tag |
|---|---|---|
| Chain | Solana only. | H |
| Collateral | SOL (`assetType: "SOL"`). Min stake 0.01 SOL, max 0.5 SOL per entry. | H |
| Where stakes sit | In a **platform-held shared wallet**; your "glgl balance" is "a record of your share". Rounds are not on-chain. | H |
| ODDS token | `oddsZv18fPRHUPvNmn64dBZPYKjMY98n9V1AJD6QscA`; not a bettor collateral. HXRO mint `HxhWkVpk5NS4Ltg5nij2G671CKXFRKPK8vy271Ub4uEK`. | H |
| Legacy collateral | USDC / GUAC / BONK networks on the old on-chain program. | M |

---

## 4. Read API

Official, public, partly keyless. Documented for bot builders at `https://docs.glgl.fun/bots-and-developers/build-a-bot.md` (H). Note this is the **glgl** API ("The API is young, so expect it to change"), not an OddsFi API. OddsFi itself publishes no API (NOT FOUND, section 12).

- **Base URL:** `https://rgs.glgl.fun` (nginx; JSON). No documented rate limit ("poll at a sensible pace"); no rate-limit headers seen.
- **Keyless GETs I confirmed (H, 2026-10-19):**
  - `GET /oddsfigame` -> `{games:[...]}`: 20 user-created markets (name, tokenSymbol, `uSubPath`, `mktMetaAddress`, button names, `createdAt`, per-market `subscriptionKey`). 14.5 KB.
  - `GET /contestseries/running` -> the two series (id, `gameCode`, `contestDuration` `00:00:20`/`00:01:00`, `rake` 0.3, `overround` 1.08, `minPlayers` 3, `fixedOdds` false).
  - `GET /contests/by-series/{seriesId}` -> 7 rounds each: `id`, `status`, `contestLiveTime`, `contestCloseTime`, `prizePool`, `moonPool`, `rektPool`, `moonOdds`, `rektOdds`, `whitelabelMoonOdds`, `whitelabelRektOdds`, `livePrice`/`closePrice` (`blendedPrice` BTC/USD), `rake` 3.0, `minFee` 0.1. 5.8 KB. The docs say this call needs no key and shows pools shared across all markets.
- **Needs keys:** `GET /stats/result/{seriesId}` -> **403 Forbidden** without `x-api-key` + `x-subscription-key` (fixture). Also `/contestentry/by-user`, `/history/bet`, `/oddsfi/balance` (docs, M: not probed). Keys come from logging in and creating a bot key in the app; I did not do that.
- **Market discovery:** the whole venue is two series on one asset, so "list markets" is trivial. History/resolution: only through the keyed `stats/result` (last 20 results) and `closePrice` on `Closed` rounds in `by-series`.
- **WebSocket / streaming:** NOT FOUND (searched docs.glgl.fun llms.txt and the bot page).
- **Legacy Hxro read path:** on-chain `getProgramAccounts` via `@hxronetwork/parimutuelsdk` against program `GUhB2...` (H, SDK readme: "Fetch all the accounts owned by the program id"). No Hxro REST API found. All Hxro docs/web hosts are NXDOMAIN, so the legacy docs are only reachable as archive copies I did not read.

---

## 5. Trade path (programmatic)

**glgl (current):** `POST /contestentry/add-contest-entry` with `{contestId, direction: "Moon"|"Rekt", wager (SOL), contestType: "OverUnder", assetType: "SOL"}`, headers `x-api-key: sk_...` (shown once, per-market, user-set caps and expiry) and `x-subscription-key` (public per-market key). Stake is debited from the glgl balance immediately. ToS section 10 allows bots (H). I did not call it.

**Prerequisite chain (all human steps):** log in via Privy (Solana wallet or email) -> read per-account deposit address -> send SOL -> create a bot key in the UI. Nothing here is signable by an agent alone.

**Legacy Hxro:** Solana transactions built by the SDK (`placePosition`, `settlePosition`, etc.), signed by the trader's Solana key. Not usable unless the program is still live (unknown).

**PayBox reachability: partial.**
- EVM chains (Base, Ethereum, BNB, Arbitrum, Polygon): no, this venue is Solana only.
- PayBox has a Solana wallet family and Solana transaction proposals (repo note `docs/research/06-paybox-platform.md`, H there). A plain SOL transfer to the glgl deposit address could fund the balance, but the deposit address exists only after a human Privy login, the bot key is created only in the UI, and the actual bets go over a keyed HTTP API, not through a wallet signature. So PayBox can fund the venue but cannot place or cancel orders.
- Funds in the glgl balance are platform-custodied until withdrawn.

---

## 6. Fees

- **Entry fee 2.5%** of stake (charged win, lose or tie) and **settlement fee 2.5%** of winning payouts; "both are built into the multiplier" (docs.glgl.fun/fees/fees-at-a-glance, H). Fee-adjusted multiplier = `pool / side_pool * 0.975 * 0.975` = 0.9506 of the gross pari-mutuel payout (verified against the API fixture). A 50/50 pool pays 1.901x; expected value for a no-edge bet is about -4.9% per round.
- Where fees go: entry fee buys back ODDS and the market's builder coin (builder may direct up to 1.5%); settlement fee funds OddsMM's give-back through the pools. "Neither is kept as platform revenue."
- Other: builder-coin curve trades 1.25%, borrowing 3%, market creation 0.01 SOL plus about 0.047 SOL network/tip; Solana network fees (docs).
- API fields `rake` (0.3 on the series, 3.0 on each contest), `overround` 1.08 and `minFee` 0.1 are not explained in any doc I found (NOT FOUND), so I treat the documented 2.5%+2.5% as authoritative and the fields as unexplained.
- Legacy Hxro: protocol fee 10-150 bps (HXRO-holding dependent via `protocolTokenRequiredForMinFee`) and settlement fee 100-300 bps (SDK defaults, M).

---

## 7. Resolution mechanism and dispute risk

- **Oracle:** BTC/USD from **Pyth**; "The platform generates no randomness of its own, and the result of a round depends only on that price" (docs.glgl.fun, H). The API names the price field `blendedPrice`, which does not say "Pyth"; I could not reconcile the two (M).
- **Settlement:** automatic by the game server; winnings credited to the glgl balance. "The game server that runs and settles rounds: Certified" (security page; certifier not named). The on-chain programs (builder coins, curves, borrowing) are "Not yet independently audited."
- **Dispute process:** none documented. A server-side, off-chain ledger means a bettor cannot independently verify a round from chain data.
- **Edge cases:** exact ties lose the entry fee; voided-round refund terms are "still being confirmed."
- Legacy on-chain Hxro: price locked and settled by a crank against Pyth accounts (M).

---

## 8. Liquidity (with dates and sources)

- **Round pools are seed-sized.** Sample taken 2026-10-19 01:59-02:00 UTC (a Sunday evening in US time): every `Closed` or `Live` 20s round had `prizePool` exactly **5.0 SOL**, every 60s round **10.0 SOL**, with only the moon/rekt split varying (e.g. 1.734/3.266). Docs say a 20s pool opens with 5 SOL and a 60s pool with 10 SOL "before anyone enters." Four closed rounds, all exactly the seed, means I saw **no visible organic stake** (M, small sample, off-peak). Docs say not to read pool size as player volume.
- **No volume/OI/TVL series for the product** (NOT FOUND, searched DefiLlama protocol and fee APIs for `hxro-network`, oddsfi docs, glgl docs).
- DefiLlama (2026-10-19): `hxro-network` TVL $0; staking $149.9k (H).
- ODDS token (DexScreener, 2026-10-19): largest Raydium pool $20.5k liquidity, 24h volume $36; the pair was created 2026-09-11, two older tiny pools 2026-03-12 (H). Price $0.0033.
- Market count: 20 user-created glgl markets since 2026-02-15, all sharing the same two rounds (H).

---

## 9. Geo, ToS, automation

- **Geo (H, docs.glgl.fun/trust-and-risk/availability + ToS section 4):** blocked by IP check: United States and Bosnia and Herzegovina, Central African Republic, Costa Rica, Croatia, Cuba, DR Congo, Iran, Iraq, Ivory Coast, Kosovo, Lebanon, Liberia, Libya, Moldova, Myanmar, North Korea, North Macedonia, Serbia, Somalia, South Sudan, Sudan, Syria, Venezuela, Yemen, Zimbabwe. ToS: "Don't use a VPN or anything else to get around that check." Age 18+.
- **Automation:** allowed. "You can enter rounds through the API with keys you create in the app" and "A bot acts without asking you each time. You're responsible for everything it does." Warning: "Don't overload it or use it to get around limits. We may limit or revoke keys..." (ToS section 10, H; ToS last updated 9 October 2026).
- Legacy Hxro Dexterity (perps) carried a US ban notice in its repos (`dexterity-mm` description, H); the parimutuel product's own rules are not retrievable.

---

## 10. Event coverage and arbitrage relevance

- Only **BTC/USD up/down over 20s and 60s**. No sports, politics, macro, or longer-horizon crypto.
- Other covered venues list crypto up/down at 5-minute and 15-minute horizons (repo notes `08-venues-polymarket-kalshi.md`, `09-venues-onchain-clob.md`, H there). There is no 20s/60s equivalent, so no matchable market for a cross-venue scan. A 60s Moon/Rekt leg cannot be hedged against a 5-minute contract without taking path risk.
- **Not an independent price signal:** the pool split is "steering towards a target, not a forecast" (OddsMM doc), and pools are mostly MM seed.
- **Shared liquidity:** every glgl market shares the same two rounds and the same pools ("every market sees the same rounds", docs), so the 20 markets are one leg, not 20. It is not shared with any covered external venue.

---

## 11. Fixtures saved (all <= 50 KB, 2026-10-19, unauthenticated GETs to `rgs.glgl.fun`)

In `docs/research/fixtures/hxro-parimutuel-protocol/`:
- `rgs_oddsfigame.sample.json` (2.4 KB; 3 of 20 games; `subscriptionKey` and creator `user` fields redacted by me)
- `rgs_contestseries_running.json` (1.2 KB; full)
- `rgs_contests_by_series_20s.json` (7.1 KB; full, 7 rounds)
- `rgs_contests_by_series_60s.json` (7.1 KB; full, 7 rounds)
- `rgs_stats_result_unauthenticated_403.json` (0.3 KB; the 403 body)

---

## 12. Integration recommendation

- **skip.** Dead brand, single-asset 20s/60s product, custodial and server-side, US-blocked, MM-seeded pools with no visible organic liquidity, 5% round-trip fee drag, and no event overlap.
- If a future "ultra-short BTC pool" reference is wanted anyway: poll `GET /contests/by-series/{id}` (keyless) every few seconds; implied P(Moon) = `moonPool / prizePool`; use `Closed` rounds' `closePrice` vs `livePrice` as the outcome record. Treat all pool figures as MM-steered.
- Gating questions if revisited: (1) is anything left on-chain under program `GUhB2...` (needs an RPC read, i.e. a POST, so someone must approve it); (2) what do `rake`, `overround`, `minFee` mean; (3) who certified the "game server"; (4) a real volume figure for organic stake.

---

## Method note and disclosure

- WebSearch: one extended search ("Hxro Network parimutuel protocol 2026") succeeded. A second search was refused because the shared session search budget was used up. I did not work around it.
- Before that refusal, and only to check whether the dead Hxro domains were ever replaced, I queried the Wayback Machine index (`archive.org/wayback/available` and the CDX API) and fetched the two 1 KB snapshots of the `hxro.network` and `docs.hxro.network` home pages (April-May 2026). After the budget notice I fetched nothing further from any archive. That is why the Dec 2025 Hxro docs content is unread and the docs claims about the legacy product rely on the SDK readme and GitHub repos.
- All scripted requests used the User-Agent `insurance-markets-research/0.1`. `gh api` and WebFetch used their own default clients.

## Sources

- https://rpcfast.com/blog/ai-agents-solana-prediction-markets (the discovery lead; one table row "Hxro Parimutuel Protocol ... Native Solana, Pyth oracles"; no status, no links; a vendor guide, L)
- https://oddsfi.ai (home; "(c) 2026 OddsFi"; Odds Engine, OddsFi AMM, one partner glgl.fun; H), https://oddsfi.ai/swap ("Swap HXRO for $ODDS", 1:1, HXRO burned, token contracts; H)
- https://oddsfi.gitbook.io/oddsfi-docs (+ `/llms.txt` and the single blog-style page; H)
- https://docs.glgl.fun/llms.txt and pages `start-here/how-glgl-fits-together` ("OddsFi, formerly known as Hxro"), `play/how-a-round-works`, `play/pools-multipliers-and-payouts`, `play/your-glgl-balance`, `play/ties-and-voided-rounds`, `fees/fees-at-a-glance`, `under-the-hood/oddsmm`, `bots-and-developers/build-a-bot`, `trust-and-risk/{availability,security,risks}`, `reference/{faq,links-and-addresses}`, `legal/terms` (all H, `.md` versions)
- https://rgs.glgl.fun/oddsfigame , `/contestseries/running` , `/contests/by-series/{id}` , `/stats/result/{id}` (live GETs, H)
- https://launchpad.glgl.fun (HTML head only; H)
- GitHub via `gh api` (read-only): `Hxro-Network` org repo list; `Hxro-Network/hxro-protocol-docs` (`README.md`, `PARIMUTUEL_CRANK.md`); repo file trees of `parimutuel-ts-project`, `parimutuel-ui`; `Hxro-Network/solana` (commit dates) (H)
- https://registry.npmjs.org/@hxronetwork/parimutuelsdk (readme, versions, dates; H)
- https://api.llama.fi/protocols and https://api.llama.fi/protocol/hxro-network (H)
- https://api.dexscreener.com/latest/dex/tokens/{ODDS mint} and `/{HXRO mint}` (H)
- DNS: `dig` against 1.1.1.1 and 8.8.8.8 for hxro.network, www/docs.hxro.network, hxro.finance, app.hxro.finance (H)
- Web-archive index for hxro.network and docs.hxro.network (M; see Method note)
- WebSearch result list (Solana Compass, QuickNode builders guide, Messari "now ODDSFi", Blocmates "Iconic Markets", Bitget): snippets only, none opened (solanacompass.com returned 403, messari.io 429); the "Hxro Network, now ODDSFi" line is M, confirmed independently by the first-party pages above.
- Repo note for PayBox facts: `docs/research/06-paybox-platform.md`

## NOT FOUND (searched)

- Any live Hxro-branded site, docs, REST API or app (searched: DNS, WebFetch, GitHub org, npm, DefiLlama).
- Whether the legacy on-chain program `GUhB2ohrfqWspztgCrQpAmeVFBWmnWYhPcZuwY52WWRe` still has activity (Solscan 403, SolanaFM 502, RPC needs POST).
- An OddsFi developer API, SDK, program id, or operator integration docs for the Odds Engine ("Talk to us on Telegram" only).
- WebSocket or streaming feed; documented rate limits.
- Product volume / OI / TVL time series (only token liquidity and the seed-sized pools).
- Meaning of API fields `rake`, `overround`, `minFee`; refund rule for voided rounds; who certified the game server.
- An official statement or date of the Hxro to OddsFi rebrand (I have the swap page and the glgl docs line only; X accounts were not readable).

## Suspicious content

- The `hxro.network` and `docs.hxro.network` web-archive snapshots from April-May 2026 are 1 KB stubs that run FingerprintJS and redirect to a tracking URL ("Click here to enter"): consistent with a lapsed domain taken over for traffic distribution. Not followed; do not link users to any `hxro.network` URL.
- The official swap link on oddsfi.ai/swap points at `app.hxro.finance/esHXRO`, a domain that does not resolve. A typo-squatter could register it; the page itself warns "only use the official swap app linked above."
- `Hxro-Network/openhxro` has a committed `.env` file in its tree. I listed the path only and did not read it.
- No text aimed at AI agents found. HTML comments in oddsfi.ai are developer notes about the burn dashboard.

## Privacy check

No email, real name, username or home-directory path was sent in any request, header, URL or query. The notes and fixtures were grepped for `@`, the user's name and the home-directory path before finishing; the only `@` hits are the npm package scope `@hxronetwork`, and there are no hits in the fixtures. Creator wallet addresses and per-market subscription keys in the `/oddsfigame` fixture were redacted.
