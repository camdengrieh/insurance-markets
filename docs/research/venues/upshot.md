# Upshot (upshot.cards) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: WebFetch, public unauthenticated GETs (upshot.cards root/robots/sitemap/docs, docs.upshot.cards GitBook `.md` pages), `gh api` / `gh search`. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Nothing from third-party pages was followed.

Research limits (be aware): (a) the shared WebSearch budget was exhausted, so there was NO web-search pass; (b) `upshot.cards` (the app and marketing site) sits behind a Vercel Security Checkpoint (HTTP 429, `x-vercel-mitigated: challenge`, JS challenge page) for every path I tried (`/`, `/robots.txt`, `/sitemap.xml`, `/docs`). I did not try to bypass it. So the app, ToS, geo rules, fees in the app, chain and wallet model were NOT read first-hand. The official GitBook docs (docs.upshot.cards) were readable.

Tags: H = read first-hand in a primary source this session; M = secondary/inferred; L = weak/stale.

---

## 0. Bottom line

1. **Live (M/H):** docs.upshot.cards is up and the site answers with a bot challenge (so something is hosted). Prediction Index lists it `live` (snapshot 2026-10-18, M). A drop-hunting tracker entry says it was in "Closed Alpha" with Base backing and a $50K reward pool (M, undated except file entry `lastUpdated` Jan-Feb 2026, so possibly stale ~8 months). Whether it has left alpha is NOT FOUND.
2. **It is not a prediction market in the sense an arbitrage scanner needs (H).** Its own docs call it "Mystery Packs of Prediction Cards, for Cash Prizes". You buy randomised packs; each card is tied to one outcome of an event; winning-card holders split a prize pool. Revenue from pack sales funds the pools. Secondary trading is against an "Automated Marketplace" at algorithmic prices in internal currencies (Gold / Shots), with a 10% round-trip spread. There is no tradable USD probability price per outcome. It is closer to a collectible-card sweepstakes/lottery with prediction themes.
3. **No API, no docs for developers, no contracts, no subgraph found (H for docs; NOT FOUND elsewhere).** Docs have no API section. GitHub org `upshot-cards` exists (created 2025-02-26) with 0 public repos and no profile link back to the site, so I cannot even confirm it is the project's org (L).
4. **Not reachable by a PayBox/EVM wallet trading path (H for docs, M inferred).** Docs describe a custodial in-app account ("Cash in your account", "withdrawn as cash USD"); third-party automation scripts show Google login (M, untrusted). No signed-order or tx-proposal path documented.
5. **adapter_priority = skip.** No API, no price-per-outcome, internal-currency trades, lottery-style pools, challenge-gated site. At most a P2 "signal-only" curiosity if an API ever appears; even then the card "Chance" is a starting number set by the venue.

---

## 1. Liveness (2026)

| Evidence | Tag |
|---|---|
| `GET https://docs.upshot.cards/llms.txt` -> 200, GitBook space with 29 pages (Welcome, Events, Prediction Cards, Contests, Leaderboard/XP, Referral Rewards, Prize Pools, Upshot Automated Marketplace, FAQs, Tier System "Ending Soon"). Page dates not shown. Marketplace page mentions Gold/Shots/XP, which looks like a recent (2026) addition. | H |
| `GET https://upshot.cards/` from this host -> 429 Vercel Security Checkpoint; `dig` shows www.upshot.cards on Vercel DNS, docs on GitBook. | H |
| Prediction Index ecosystem snapshot (stored in repo fixture `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`, snapshot 2026-10-18): `{"project":"Upshot","chain":["tbd"],"outcomeTypes":["binary"],"types":["prediction game"],"mechanism":["fixed-payout binary"],"topics":["crypto","culture","finance","gaming","politics","sports"],"status":"live"}`. The directory itself says chain "tbd". | M |
| Airdrop-hunter list in a third-party GitHub repo (Worklaf/Worklaf, `TestNet_Hub/projects.json`, entry created 2026-02-02): "Closed Alpha ... collect prediction cards and trade ... supported by Base ... confirmed rewards of $50K ... possible future airdrop". Twitter `@upshot_cards`. Third-party, untrusted, Russian-language. | M/L (stale-ish, >6 months for some details) |
| Phishing lookalikes `claim-upshot.cards`, `mint-upshot.cards`, `register-upshot.cards` are on public scam blocklists (Jan-Feb 2026), while `upshot.cards` is on an allowlist. Indicates the brand is an airdrop-phishing target; scanner must hard-pin the domain. | M |

Not to be confused with `upshot.xyz` (an older NFT-appraisal project, different product). I did not research it; mentioned only to avoid a name collision (L, from background knowledge).

Verdict: **still_live = true (medium confidence)**, possibly still in alpha/limited access.

---

## 2. Kind and market model

- Kind: prediction "card game"/collectible sweepstakes with cash prizes (H, docs). Not an order-book or AMM exchange.
- Structure (H, https://docs.upshot.cards/events.md , /prediction-cards.md): an *event* is one round, like "Who will be the world's first trillionaire?". Each *card* = one possible outcome; a *Wildcard* wins if no listed outcome occurs. So events are **categorical with a catch-all**, resolved on a set date by Upshot against written "Rules".
- Card fields: Prediction, Chance ("starting odds ... real-world news and time may flip the true odds"), Potential Winnings (holder's share of the pool, "calculated from the total cash in the prize pool as well as the number of individuals holding similar cards"), Rules (H). I.e. payout is **parimutuel-style share of a pool, not fixed $1/share**, and card supply is bounded.
- Packs (H, /welcome-to-upshot/card-packs.md): 5 cards, 4 Gold cards from Gold Events (weighted by supply) + 1 Bonus card (65% cash, 30% instant win, 5% sweepstakes "Shots"). Randomised purchase, so a user cannot choose the outcome they buy at pack time.
- Currencies (H, /welcome-to-upshot/cash-shots-and-gold.md): Cash (USD, withdrawable, buys packs), Gold (contest currency), Shots (sweepstake currency). Contests: players build lineups from Gold cards; skill-based, weekly to yearly.
- Secondary market (H, /upshot-automated-marketplace.md): "Automated Marketplace" = house AMM-like pricing, no counterparties. Only Gold-contest, Cash, and Shots card types are tradable, priced in GOLD or SHOTS, not USD. Formulas: Gold `basePrice = pointsValue x supplyMultiplier / 100` (multipliers 0.3 to 0.7 by max supply); Shots `basePrice = pointsValue`; Cash `basePrice = actualPrize x 10`; demand adjustment by `netDemand = totalBuys - totalSells` on a square-root curve, price capped at base price above and floored at 50% of base below. Not a probability price.
- Tokenisation: docs say cards are "tamper-proof digital memento, stored on a distributed web storage system" (H, /faqs.md) and prize pools are held in "distributed, trust-minimized ... escrow" (H, /prize-pools.md). The chain, contract type (NFT? ledger rows?) and escrow contract are NOT FOUND (searched: all 29 docs index entries read selectively, GitHub `gh search code "upshot.cards"` , predictionindex entry says chain "tbd").

---

## 3. Chains and collateral

- Chain: NOT FOUND in official docs. M/L: third-party tracker says "supported by Base" (a backer or deployment chain; unclear which).
- Collateral: USD "Cash" balance inside the Upshot account (H docs). Deposit method (card, crypto, stablecoin) NOT FOUND (site is challenge-gated).

---

## 4. Read API

- Official public API: **NOT FOUND** (searched: docs llms.txt index, all key doc pages, `docs.upshot.cards` has no API page, `gh search repos/code upshot.cards`, `upshot-cards` GitHub org has 0 repos).
- `api.upshot.cards` and `app.upshot.cards` do not resolve (DNS empty) (H).
- The app is behind a Vercel bot challenge; any private endpoints it uses are undocumented and were not probed.
- Docs expose an LLM query endpoint `GET https://docs.upshot.cards/index.md?ask=...` (GitBook feature); documentation Q&A only, not market data. Not used.
- Websocket: NOT FOUND.
- Fixtures: none saved (no data API). Docs text is not a response shape of use.

---

## 5. Trade path

- Programmatic order placement: **none** documented. Pack purchase and Automated Marketplace buy/sell are in-app actions inside a custodial account (H for "in your account" wording; auth method M/L: third-party automation script indicates Google sign-in at `https://upshot.cards/claim`).
- PayBox/EVM reachability: **no** on current evidence. No contract address, ABI, or signed-order scheme found. If Cash deposits can be made on-chain (Base?) to a deposit address, that would be a transfer, not a market trade, and the pack outcome is randomised so there is nothing to arbitrage with. paybox_reachable = no.

---

## 6. Fees

- Automated Marketplace: 5% commission each way (buy pays price +5%, sell receives price -5%) = 10% spread (H, /upshot-automated-marketplace.md).
- Pack economics (H, /prize-pools.md): pack revenue split 18% monthly leaderboard payouts, 25% contests, 45% cards with cash prizes, 7% instant wins, 5% growth/referrals/team discretionary. So the house keeps at most the 5% discretionary share plus whatever is not distributed; payout to players is stated as 95% of revenue (arithmetic from the stated split, M).
- Deposit/withdraw fees: NOT FOUND.

---

## 7. Resolution and dispute risk

- Resolution: on the card's resolution date, "real world results are checked against the rules of an event" (H). Resolver is Upshot itself (centralised, rule text per card). No oracle, no dispute window documented. Dispute process: NOT FOUND. Risk high for arbitrage: ambiguous wildcard semantics, the platform can decide.
- Prize escrow described as trust-minimised/distributed; no contract to verify (NOT FOUND).

---

## 8. Geo / ToS / automation

- ToS, geo restrictions, KYC, age limits, bot policy: **NOT FOUND** (site challenge-gated; docs do not cover them). Sweepstakes language ("Shots") suggests US sweepstakes-style geo rules (L, inference only).
- Referral and XP program exists; third-party GitHub scripts automate the daily claim page with Selenium (untrusted), suggesting incentive for bots and probable anti-bot protection (hence the Vercel checkpoint). An aggregator should not scrape.

---

## 9. Liquidity

- No volume/OI/TVL published in sources read. Prediction Index lists no volume figure for Upshot in the stored fixture (the project record has no volume field). Prize pool sizes: only "$50K confirmed rewards" from a third-party tracker (Jan-Feb 2026, L). Liquidity: effectively NOT FOUND.

## 10. Category overlap and independence

- Topics claimed: sports, internet culture, politics, crypto, finance (M). Events are novelty-style ("first trillionaire", culture), mostly not matching liquid listed markets one-to-one; and because payout is a pool share rather than a $1 contract, prices are not directly comparable to Polymarket/Kalshi probabilities.
- Shares liquidity with another venue: no evidence (independent, but closed pool). Not a usable arbitrage leg because you cannot take a defined-price position or exit at a market price.

---

## 11. Suspicious content / injection notes

- docs.upshot.cards pages end with an "Agent Instructions" boilerplate (GitBook standard) telling agents to use an `?ask=` GET endpoint. It is platform boilerplate, not followed (no action needed).
- Third-party GitHub files read (Worklaf projects.json, a Selenium script) are untrusted data; no instructions in them acted on. The Selenium script targets `https://upshot.cards/claim` and uses Google login; I did not run or copy it.
- Phishing lookalike domains for the brand exist (section 1).

---

## 12. Open questions

1. Which chain and what contract holds cards/escrow (Base?) and is there an on-chain deposit route.
2. Has the closed alpha ended; is the app available in the US/EU.
3. Does the app expose any unauthenticated JSON for event/card data (can only be answered by reading the site normally, which requires passing the bot challenge).
4. ToS stance on automation/arbitrage.

---

## Sources

- https://docs.upshot.cards/llms.txt (H, 2026-10-19)
- https://docs.upshot.cards/welcome-to-upshot.md , /events.md , /prediction-cards.md , /upshot-automated-marketplace.md , /prize-pools.md , /faqs.md , /welcome-to-upshot/card-packs.md , /welcome-to-upshot/claiming-prizes.md , /welcome-to-upshot/cash-shots-and-gold.md , /quickstart-guide.md (all H, fetched 2026-10-19)
- https://upshot.cards/ (H: HTTP 429 Vercel Security Checkpoint; content unread)
- https://predictionindex.xyz/ecosystem via repo fixture `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` (M; snapshot 2026-10-18)
- GitHub: `Worklaf/Worklaf` `TestNet_Hub/projects.json` (untrusted third-party airdrop tracker; M/L), `luxiaofengok/PythonAutomation` `web/web_upshot.py` (untrusted; read only for URL/login method; L), blocklist repos `phishdestroy/destroylist`, `scamsniffer/scam-database` (code-search hits only; M)
- GitHub API `users/upshot-cards` (org exists, 0 repos; unverified link to project; L)
