# Bettensor (Bittensor sports subnet) - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: `gh api` (public repo metadata and raw files), WebFetch of public pages, one unauthenticated HEAD-style GET of bettensor.com (redirect check). No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool used. Third-party pages treated as untrusted data.

Research limit: the shared WebSearch budget ran out after two searches, so the "is SN30 still Bettensor?" question rests on one search, two page fetches and a taostats header, not a full pass.

Confidence tags: **H** = read first-hand in a primary source this session; **M** = secondary or inferred; **L** = weak or stale.

---

## 0. Bottom line

1. **Not a market at all (H).** Bettensor is a Bittensor *mining* subnet: miners submit *simulated* wagers on sports games using sportsbook odds; validators score them; rewards are subnet emissions. The official README says: "miners receive upcoming games and odds, submit predictions as a simulated wager" and "Bettensor does not distribute payments nor collects money". There is no order book, no AMM, no counterparty, no outcome tokens, no settlement of user stakes.
2. **Probably not even live as Bettensor (M/L).** Official domain bettensor.com 301-redirects to an unrelated gambling domain (H, curl 2026-10-19). bettensor.io is a parked "may be for sale" page (H). The `Bettensor` GitHub org has a single repo (`data-sync`) last pushed 2024-11-04 (H). The main code repo `Nickel5-Inc/bettensor` returns 404 through the GitHub API and web (H) - renamed, private or removed; a search engine still listed it (M). Latest official Nickel5 substack posts seen are Sep 2024 (M). Taostats shows SN30 in its header as "Endure N..." (L, truncated) and subnetalpha.ai says SN30 is now **Endure Network** (formerly Wahoot), a TAO lending-market project that mentions Bettensor only as another sports subnet (M). A third aggregator (bittensor123.com) still labels SN30 "Bettensor" but its newest item is dated Sep 2025 and it says "no real money is wagered" (L, stale). Conclusion: treat Bettensor as dead or unverifiable; NETUID 30 appears to have been taken over by a different project.
3. **Nothing to integrate.** No public market-data API, no prices, no resolution oracle, no trade path. Even if live, its "odds" are copied from third-party sportsbooks, so it is not an independent price source.
4. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.bettensor.com/` | HTTP 301 -> `https://rejekibet.net/` (unrelated gambling site; not followed). Domain lost. | H |
| `https://bettensor.io` | Parked page, domain "may be for sale", no subnet info | H |
| GitHub org `Bettensor` | Created 2024-04-26; 1 public repo `data-sync` ("scoring database / state data from team validator"), last push 2024-11-04, README is one line | H |
| `Nickel5-Inc/bettensor` (referenced as main repo in README and aggregators) | 404 via `gh api` and via web | H |
| Forks of Bettensor (closeandclose, sparkrider, etc.) | Last pushes Jun-Aug 2025; third-party, not read beyond one README/docs raw file as untrusted data | H (existence), L (relevance) |
| SN30 current identity | subnetalpha.ai: "Endure Network (Subnet 30), previously Wahoot / WahooPredict"; Forge lending market not yet launched; "No external APIs are live yet". Taostats header for SN30 reads "Endure N...". | M / L |
| Opentensor deregistration rule | Registration/deregistration returned Oct 2025; lowest-performing non-immune subnet is replaced on new registration (search snippet only) | L |
| Alpha token price page (LBank, Apr 2026) | Lists "Bettensor (SN30)" at about $1.06 - a price aggregator, unreliable for project status and conflicts with the Endure/alpha 0.0033 header | L |

Verdict: **still_live = false** (cannot be confirmed live as a sports-prediction product in 2026; multiple signals say dormant or replaced). The conflicting signals are the reason confidence is medium, not high.

---

## 2. Kind and market model

- Kind: Bittensor subnet (incentive network), not a prediction market. Roles: miner (submits predictions), validator (scores). (H, README)
- Beta scope: baseball, football (soccer), American football; Bittensor v6.9.3 required; mainnet NETUID 30, testnet 181 (H, README in a fork; original repo unreachable, so this is the fork's copy - M for authenticity).
- "Market model": none. Users get a fixed simulated daily balance (README of miner docs: wager limit of $1000, "$100 default for Podos model") and bet on moneyline-style game outcomes at odds sourced from sportsbook APIs (H for the fork docs; M overall). Outcomes are rows in a validator database, not tokens.
- Scoring: rewards depend on simulated earnings over a rolling window (M, bittensor123; README points to a substack post "Sports prediction and betting models" for details, not read).

## 3. Chains and collateral

Bittensor (Subtensor, Substrate) with TAO/alpha. Miners/validators stake or register with TAO. No collateral backs a user position because there are no money positions. Not an EVM or Solana venue. (H/M)

## 4. Read API

- Official public market/odds API: NOT FOUND (searched: org repos, README, miner docs, substack tag page, bettensor.io/.com).
- A "web dashboard" (bettensor.com/dashboard) and "Central Server" miner interface existed in the beta (H, miner docs: login with a token signed by the miner hotkey). The domain is lost, so unusable.
- On-chain: subnet metagraph (weights, emissions) is readable from Subtensor but contains no event or price data.
- Websocket: NOT FOUND. Rate limits: NOT FOUND.
- Fixtures: none saved (no public data API to sample).

## 5. Trade path

None. Wagers are simulated and submitted by miners signed with a Bittensor hotkey (sr25519). No PayBox-reachable EVM wallet could trade it; a Bittensor/Substrate wallet is a different key type. There is nothing to place an order against.

## 6. Fees

No trading fees (no real trades). Cost is subnet registration/burn and validator/miner operating cost. NOT FOUND for anything else.

## 7. Resolution

Validators take game results from external sports-data APIs and score miners (README: validators need an API key for games data; M). No dispute mechanism; resolution only affects emissions.

## 8. Geo / ToS / automation

README disclaimer: "We are not a financial institution... Bettensor does not distribute payments nor collects money"; users are responsible for local betting laws (H, fork README). Automation of miners is the intended use. Not applicable to a trading adapter.

## 9. Liquidity and event overlap

- Liquidity: none (no stakes pool). Only a token market cap/price exists, which is not market liquidity. Volume/OI/TVL: NOT FOUND (not applicable).
- Event overlap: sports (soccer, baseball, American football) overlap with Polymarket/Kalshi/sportsbooks in event terms, but Bettensor offers no tradable price. Its odds are copied from sportsbooks, so as a *signal* it adds nothing over reading those sportsbooks directly.
- Shares liquidity: N/A. Not an independent arbitrage leg.

## 10. Suspicious content

None found aimed at AI agents. Note: bettensor.com now redirects to an unrelated gambling domain (rejekibet.net); not followed, avoid.

## 11. Open questions

- What project owns NETUID 30 now, and when did Bettensor deregister? (Needs a chain or explorer query; taostats pages were truncated.)
- Whether `Nickel5-Inc/bettensor` was renamed (e.g. to a new org) or deleted.

## Sources

- https://github.com/Bettensor (org, `gh api orgs/Bettensor`, `repos/Bettensor/data-sync`) - H
- https://github.com/Nickel5-Inc/bettensor - 404 (H for the 404; content seen only via search snippet and a fork)
- https://github.com/closeandclose/Bettensor (fork; README.md, docs/mining.md read raw) - M
- https://www.bettensor.com/ (301 to rejekibet.net) and https://bettensor.io (parked) - H
- https://subnetalpha.ai/subnet/bettensor/ - M (page is about Endure Network SN30)
- https://taostats.io/subnets/30 - L (truncated header "Endure N...")
- https://bittensor123.com/subnets/sn30/ - L (stale, 2025 items)
- https://nickel5.substack.com/t/bettensor - M (latest posts Sep 2024)
- WebSearch result list (Bitget/Gate 12-project articles, LBank price page) - L, snippets only
