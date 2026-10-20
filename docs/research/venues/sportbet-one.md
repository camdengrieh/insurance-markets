# SportBet.one - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs, `gh api` file reads, WebFetch. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. Third-party text was treated as untrusted data.

Tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each): `docs/research/fixtures/sportbet-one/` (section 11).

---

## 0. Bottom line

1. **Effectively dormant. adapter_priority = skip.** The EOS/Vaulta betting contract accepted its last bet on **2026-06-01 21:04:44 UTC** and settled its last bets on 2026-06-11. Zero `accept` actions in July, August, September and October 2026 (H, Hyperion, queried 2026-10-19). A CoinGape listicle "updated August 12, 2026" still describes it as operating (M); it is an affiliate-style page and conflicts with the chain data.
2. **It is a house-run, fixed-odds bookmaker, not a prediction market or exchange.** A central operator account sets odds and accepts or rejects every bet. Odds, events and market ids are not on-chain.
3. **No official API, no docs.** The website and `api.sportbet.one` return a Cloudflare "Sorry, you have been blocked" 403 to my scripted client (probe IP country TH, per the `s-ip-country` response header). I did not try to evade the block. Nothing official could be read. Public chain history is the only readable surface.
4. **Not reachable from a PayBox EVM/Solana wallet.** The only on-chain path is an Antelope (EOS/Vaulta) token transfer with a memo, signed by an EOS account key. No evidence PayBox signs Antelope transactions.
5. **Not an independent arbitrage leg and sports-only.** Odds are centrally managed (M), so they are a bookmaker feed rather than independent price discovery, and the book is closed anyway.

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| Last accepted bet | `accept` bet_id 2632280, 2026-06-01T21:04:44.500Z, by oracle account `sportbetmonk` (Hyperion `get_actions?account=sportbet1bet&filter=sportbet1bet:accept&sort=desc`) | H |
| Accepts per month | Jan 2025 through May 2026: each month >= 10,000 (query cap); 2026-06: 13 (all 06-01); 2026-07, 08, 09, 10: 0 | H |
| Last settlement activity | `complete` / `endbet` for bets 2537161, 2537188, 2629370 on 2026-06-11 (older bets); nothing from the contract itself after that | H |
| Bets placed but never answered | 3 bets (2632281-2632283) placed by account `box.mlt` on 2026-06-04 with notify "Placed"; no accept, reject or refund observed through 2026-10-19 | H |
| Contract account activity after June | Only token transfers: multi-asset "scatter-migration" deposits into `sportbet1bet` on 2026-09-08 and 2026-09-10, and SBET moves to `sportbetsafe` on 2026-09-14/15. Meaning unknown. | H (facts), L (meaning) |
| DefiLlama TVL | $1.74 on 2026-10-18 (peak $200,556 on 2024-07-30; fell from ~$30k to $11 between 2025-06-01 and 2025-06-15; ~$28 through May 2026; $1 since 2026-06-15). The 2025 drop looks like an adapter artefact (it only counts `eosio.token` EOS and pTokens, while the contract now holds Vaulta `A` via `core.vaulta`), so TVL alone is not a death signal. | H |
| Website | HTTP 403 Cloudflare block for `sportbet.one` and `api.sportbet.one` (curl and WebFetch); `www` 301 to apex; `docs.` and `app.` subdomains do not resolve. Front-end state unknown. | H |
| Third-party reviews | CoinGape (updated 2026-08-12) lists it as operating since 2018 with a Comoros (Mwali) licence #G20190045; several review pages (dappgambl, gamblersconnect, webopedia, cryptomaniaks, sigma.world) exist but returned 403 to WebFetch, so unread | M |
| X/Twitter @SportBetOne | WebFetch returned HTTP 402 Payment Required; no body, stopped. Last post date unknown. | H (402) |

Verdict: **still_live = false** (operationally dead on-chain since 2026-06-01; the contract account itself is not deleted and still receives transfers).

---

## 2. Kind and market model

- **Kind (H, ABI + actions):** centralised-odds fixed-odds sportsbook with an EOS wallet front door ("hybrid": reviews say users can bet from a custodial account or from an EOS wallet, M). Contract account `sportbet1bet` (created 2020-03-31, code last updated 2025-09-16).
- **Counterparty (M):** the house bankroll. Not P2P, no order book, no AMM, no outcome tokens, no secondary market.
- **ABI (H, `get_abi_snapshot`):** actions `accept, paccept (parlay), reject, complete, pcomplete, endbet, pendbet, sswap, pswap, makenodice, makevip, setbonus, newaffiliate, delaffiliate, updateacc, auth, migrate, fixl, initcontract, notify, preject`. Tables `sbets2` (single: id, account, amount, status, data u64, odd u16, options, extra), `pbets2` (parlay: datas u64[], odds u16[], statuses u8[]), `dicebets`, `globalvars`, `tokenstats`, `accountinfos`, `affiliates`, `refbonuses`. There is **no events, markets or odds table**.
- **Outcome tokenisation (H observed, L semantics):** a selection is an opaque `data` uint64 (e.g. 72861745588240897); the mapping to event/market/selection is off-chain. Odds are `uint16` decimal x100 (`odd: 204` = 2.04; reject message "Odds have changed: 1.94"). Parlays accept 2+ selections. Observed odds range 1.40 to 2.04 in the last 100 accepts.
- **Market types:** sports (reviews count ~14 sports, M) and dice/casino. No politics, crypto-price or macro markets found (NOT FOUND: any non-sports category).

## 3. Chains and collateral

- **Chain (H):** EOS mainnet (chain id `aca376f2...e906`, head block time 2026-10-19T02:33:16Z, so the chain itself is live). The contract's account now holds the rebranded Vaulta token `A` from `core.vaulta` (H); that EOS-to-Vaulta rebrand is background knowledge (M).
- **Collateral (H observed):** user bets are placed in `USDT`, `SUSD`, `A` and others. Bets in the last 100 accepts: 90 USDT (sum 18,266.91), 9 SUSD (1,630.98), 1 A (675). The `USDT`/`SUSD`/`BTC`/`ETH`/`SOL`/`SHIB`/... symbols are issued by internal token contracts (`sportbetcurr`, `sbetbonuscur`, ...) which the platform uses as custodial IOUs; the contract account holds round-number balances of them (~1,000,000 each), which suggests minted placeholders (L). Real external collateral on-chain is negligible: `tethertether` USDT 0, EOS 0, Vaulta `A` 140.53 (H, `get_account` 2026-10-19).
- Platform token **SBET** (contract `sportbetsbet`; DefiLlama address `eos:SBET-eos-sportbetsbet`). CoinGecko API `/coins/sbet` returned 404 "coin not found" (H); DefiLlama still lists `gecko_id: sbet`.

## 4. Read API

| Item | Finding | Tag |
|---|---|---|
| Official public API | NOT FOUND (searched: sportbet.one and api.sportbet.one blocked by Cloudflare; docs./app. subdomains do not resolve; GitHub user `sportbetone` repos list; WebSearch budget ran out after one query, so no further docs search was possible) | - |
| Official GitHub | `github.com/sportbetone` (4 repos; account created 2019-04-15). `eos-contracts` (last push 2024-10-30) holds only `bank.cpp`, `eosio.token.cpp`, `sale.cpp`; the betting contract source is not published. Affiliation of the account to the operator is the repo README's own claim ("Open source EOS contracts of decentralized crypto and bitcoin betting platform https://SportBet.one"). | H |
| On-chain history (third-party public) | Hyperion v2: `https://eos.hyperion.eosrio.io/v2/history/get_actions?account=sportbet1bet&filter=sportbet1bet:accept`, `.../get_abi_snapshot?contract=sportbet1bet&fetch=true`, `.../get_deltas?code=sportbet1bet&table=tokenstats`, `.../v2/state/get_account?account=sportbet1bet`, `.../v2/history/get_transaction?id=` | H |
| Node API | `https://eos.api.eosnation.io/v1/chain/get_info` (GET works). Table reads (`get_table_rows`) are POST and were not exercised. | H |
| Markets / prices / books | NOT FOUND on-chain (no odds or event tables). Would require the blocked web backend. | - |
| Trades / resolution | Bets and settlements are visible as `accept`, `complete`, `notify` ("#2537188 Win"), `endbet` actions and `sbets2`/`pbets2` rows | H |
| Auth, rate limits, WebSocket | NOT FOUND for the venue. Hyperion public node limits not documented in what I read. | - |

## 5. Trade path

- **Placing (H observed, L semantics):** the bettor signs a token `transfer` to `sportbet1bet` with a pipe-delimited memo. Example from tx `5b58f5f0...a255` (2026-06-04): `core.vaulta::transfer from box.mlt to sportbet1bet 779.7835 A memo "b|sbet1845|0|1022437037fea00|193"`. The memo fields are undocumented; I infer front-end/site tag, a flag, a selection id and the odds the user saw (193 = 1.93), but this is unverified (L). The contract then emits `notify Placed`.
- **Acceptance (H):** an operator account (`sportbetmonk`, active permission) calls `accept` / `reject` ("Rejected: #1 Odds have changed") after a short delay (about 6 seconds in the one example checked, bet 2632280), so every bet is last-look. No limit-order or cancel path exists.
- **Settlement (H):** the same operator calls `complete` with status (6 = Win, 2 = Lose in observed examples) and then `endbet`.
- **PayBox reachability: no.** Signing needs an EOS/Vaulta account key and Antelope transaction serialisation; the project PayBox notes list EVM and Solana only (M, `docs/research/06-paybox-platform.md`). Any "transaction proposal" or "signed order" from a Base/Ethereum/BNB/Arbitrum/Polygon/Solana wallet cannot touch this contract. The multi-chain deposit symbols (BTC, ETH, SOL, BNB, TRX ...) are custodial-gateway balances on EOS, not bets from those chains (L).

## 6. Fees

- **Margin:** not published anywhere I could read. CoinGape lists fees as "Variable" with no vig figure (M). Rough implied hold from lifetime `tokenstats` USDT (2026-06-11): betted 44,270,935.67; rejected 11,014,573.18; refunded 905,661.56; won 30,120,133.47. If won/(betted - rejected - refunded) = 30.12M / 32.35M, the hold is about 6.9% (L: the semantics of these counters are my guess).
- **Operator revenue share (M/L):** a search snippet says 3% of every graded bet goes to the SBET dividend pool, split weekly among stakers. Unverified (page not opened).
- **Chain costs:** EOS/Vaulta needs CPU/NET/RAM (the contract pays via `powerup` for `sportbetdivs`; H).

## 7. Resolution and dispute risk

- Resolution is by the operator (`complete` actions by the operator account). There is no on-chain oracle, no dispute window and no appeal path in the ABI (H). Dispute risk is bookmaker risk, not oracle risk. Contract admin keys are one operator-held key plus `eosio.code` (H).
- Open counterparty risk today: bets 2632281-2632283 sat unanswered for 4+ months (H).

## 8. Geo, ToS, automation

- Terms of service: NOT FOUND (site blocked; searched sportbet.one). Reviews say a KYC-free crypto book under a Mwali (Comoros) licence #G20190045, with no country list given by CoinGape (M). Automation or bot rules: NOT FOUND. The Cloudflare block of my scripted client suggests the site actively filters automated or some-country traffic (M).
- The final-week activity is almost one account: 99 of the last 100 accepts came from `sbet1ns21s2y` (H), so the book had little organic flow.

## 9. Liquidity and volume

| Metric | Value | Source and date | Tag |
|---|---|---|---|
| TVL | $1.74 | DefiLlama `/protocol/sportbet`, 2026-10-18 | H |
| TVL peak | $200,556 | DefiLlama, 2024-07-30 | H |
| Lifetime bets | 2,632,283 | `globalvars` delta, 2026-06-04 | H |
| Lifetime USDT-denominated turnover | 44.27M betted, 30.12M won | `tokenstats` delta, 2026-06-11 | H |
| Open liabilities (USDT) | 2,152.85 | `tokenstats` delta, 2026-06-11 | H |
| Last week of accepts | 479 accepts 2026-05-25..05-31 plus 13 on 06-01; last 100 accepts sum ~$18.3k USDT-equivalent plus 1,631 SUSD and 675 A | Hyperion, 2026-10-19 | H |
| Current 24h volume | 0 (no accepts since 2026-06-01) | Hyperion | H |

## 10. Overlap with other venues, shared liquidity

- **Categories:** sports only (fixed-odds, soccer and others, M). Overlap with Polymarket, Kalshi, Azuro etc. would exist only on sports outcomes, but the book is closed and has no machine-readable odds.
- **Shared liquidity:** it uses its own house bankroll (M). Its odds appear to be centrally managed from external sports data (CoinGape: "central odds management", M), so it is not independent price discovery.
- **Signal value:** none today. If it revived, it would be a signal-only bookmaker line at best.

## 11. Fixtures saved

All under `docs/research/fixtures/sportbet-one/` (fetched 2026-10-19, unauthenticated GETs):

- `defillama_protocol_sportbet.json` - trimmed `api.llama.fi/protocol/sportbet` (metadata, peak, last 10 TVL points).
- `hyperion_abi_snapshot_sportbet1bet.json` - contract ABI.
- `hyperion_accept_actions_sample.json` - 3 `accept` + 1 `paccept` actions (last ones before the stop).
- `hyperion_tokenstats_delta_sample.json` - 2 `tokenstats` table deltas (lifetime USDT and SOL counters).

## 12. Open questions

- Is the centralised sportsbook still taking bets? The site was unreadable (Cloudflare block), so only on-chain evidence was available.
- What do the September 2026 "scatter-migration" transfers and SBET moves to `sportbetsafe` mean (platform migration, wind-down, or token consolidation)?
- What is the bet memo grammar, and where does the `data` selection id map to events?
- Official terms and any geo-block list.

## 13. Suspicious content

None found. No instructions aimed at AI agents appeared in any fetched page or response.

## Sources

- DefiLlama protocol API: https://api.llama.fi/protocol/sportbet (H, 2026-10-19); page https://defillama.com/protocol/sportbet (403 to WebFetch).
- DefiLlama adapter: https://github.com/DefiLlama/DefiLlama-Adapters/blob/main/projects/sportbet/index.js (H; account `sportbet1bet`, tokens eosio.token EOS + pTokens).
- Hyperion (EOS Rio) public history API: https://eos.hyperion.eosrio.io/v2/history/get_actions, /get_abi_snapshot, /get_deltas, /get_transaction, and /v2/state/get_account (H, 2026-10-19).
- EOS Nation public node: https://eos.api.eosnation.io/v1/chain/get_info (H).
- GitHub: https://github.com/sportbetone/eos-contracts and https://github.com/sportbetone (H).
- https://sportbet.one/ and https://api.sportbet.one/ (Cloudflare 403 block, H).
- https://coingape.com/decentralized-sports-betting/ (M; "updated August 12, 2026", affiliate-style list).
- https://x.com/SportBetOne (HTTP 402 to WebFetch, not read).
- Search overview (M/L, snippet-level): dappradar.com/dapp/sportbet-one, sigma.world, gamblersconnect.com, webopedia.com, cryptomaniaks.com, dappgambl.com, publish0x.com (none opened successfully).
- Not available: further WebSearch calls (session budget exhausted), so no news or announcement search beyond the first query.
