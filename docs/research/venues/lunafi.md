# LunaFi - venue spec for the cross-venue aggregator

Researched 2026-10-19. READ-ONLY: public unauthenticated GETs (DefiLlama API, GitHub via `gh api`, lunafi.io and docs.lunafi.io, CoinGecko, Polygon Blockscout), WebFetch of two URLs. No account, wallet, key, signature, POST/PUT/DELETE or PayBox tool was used. `.env.example` and `Upgrades.md`-referenced key material in the project's GitHub repo were deliberately NOT read. Third-party content was treated as untrusted data; nothing in it was followed.

Research limit: the shared WebSearch budget was exhausted before my first search ran (the single call returned "budget used up"). Discovery therefore relies on the hint, DefiLlama's API, GitHub, and direct probes of the project's own hosts. No Wayback/archive or search-engine workaround was used.

Confidence tags: **H** = read first-hand in a primary source this session (cited); **M** = secondary source or my inference from first-hand data; **L** = weak or stale.

Fixtures (<= 50 KB each, trimmed where noted): `docs/research/fixtures/lunafi/` (section 11). They are DefiLlama metadata only; there is no LunaFi market API to sample.

---

## 0. Bottom line

1. **Dead (H).** The website returns a Cloudflare origin error, the docs site is an empty GitBook shell, DefiLlama flags the project `deadUrl: true` with a TVL of $8.89, TVL fell from about $256k to $6 in November 2023 after a recorded exploit in May 2023, the GitHub org has had no code push since June 2022, and CoinGecko no longer has the token.
2. **It never had a public prediction-market integration surface.** The only public code is an LFI ERC-20, a vLFI staking pool, farms, a fund distributor and LP "claim" tokens. There is no betting, market, odds, oracle or resolution contract in any branch (H).
3. **No read API, no docs, no subgraph found** (searched: GitHub repo tree on all 5 branches, docs.lunafi.io, lunafi.io, DefiLlama). Nothing to build an adapter against.
4. **adapter_priority = skip.**

---

## 1. Is it still live? (2026)

| Evidence | Result | Tag |
|---|---|---|
| `GET https://www.lunafi.io/` and `https://lunafi.io/` (2026-10-19) | HTTP 530, body `error code: 1016` (Cloudflare "Origin DNS error": the origin hostname no longer resolves). The domain still points at Cloudflare IPs, so someone is still paying for the zone, but nothing serves behind it. `app.lunafi.io` does not resolve at all. | H |
| `GET https://docs.lunafi.io/` | 307 -> `https://app.gitbook.com/o/-Mk1hilVtE65fRriw5mO/sites/site_K0d57/` (GitBook application shell, 12 KB, `<title>GitBook</title>`; WebFetch of that URL returned the single word "GitBook"). No published documentation content is reachable. | H (shell) / M (reading: docs unpublished) |
| DefiLlama `GET https://api.llama.fi/protocols` entry `slug: lunafi` | `deadUrl: true`, `url: ""`, category "Prediction Market", chain Polygon, twitter `LunaFi_Project`, github `Luna-Fi`, `tvl: 8.891`, `listedAt: 1673451772` (2023-01-11), audit link `https://hacken.io/audits/#lunafi`. | H |
| DefiLlama `GET https://api.llama.fi/protocol/lunafi` TVL series | 1,440 daily points 2022-11-10 -> 2026-10-18. $0 on 2022-11-10; about $51.5k Dec 2022; $337k Apr 2023; **peak $370,232 on 2023-05-21**; $256k Oct 2023; **$6 in Nov 2023**; $5 to $16 every month since; last point 2026-10-18 = **$8 (0.00372 WETH)**. That is dust, not users. | H (data) / M (dust reading) |
| DefiLlama `GET https://api.llama.fi/hacks` | `LunaFi`, date 1684800000 (2023-05-23), **$35,000**, classification "Protocol Logic", technique "Reward Logic Flaw", chain Polygon, `source: ""`, `returnedFunds: null`. The TVL collapse follows 5 months later, not immediately. I have no primary write-up of the exploit. | H (listing) / NOT FOUND (details) |
| CoinGecko `GET /api/v3/coins/lunafi` | `{"error":"coin not found"}` | H |
| DefiLlama coins `GET https://coins.llama.fi/prices/current/polygon:0x77d97db5615dfe8a2d16b38eaa3f8f34524a0a74` | `{"coins":{}}` (no price) | H |
| GitHub org `Luna-Fi` (`gh api orgs/Luna-Fi`) | Created 2021-10-04, `updated_at` 2023-12-15, 0 followers, 2 public repos, blog `https://www.LunaFi.io/`. `lunafi-smart-contracts` last push **2022-06-10**; `DefiLlama-Adapters` (fork) last push 2023-01-11. | H |
| X account `@LunaFi_Project` | WebFetch returned HTTP 402 (page body not retrieved; no payment requirements shown, nothing paid). X's syndication timeline endpoint returned 429. **Last-post date NOT CONFIRMED.** | H (blocked) |
| DefiLlama adapter `projects/lunafi` in `DefiLlama/DefiLlama-Adapters` main | Direct path returns 404; the directory listing is truncated by the API so a name search is inconclusive. | M |

Verdict: **still_live = false.**

---

## 2. Kind and market model

- **Self-description (H, DefiLlama):** "The decentralized betting protocol where you can become the house." Repo README (H): "In LunaFi, we have a variety of products, from ERC20 Tokens, Yield Farms and Liquidity Pools (HousePools)." Smart contracts "will initially be launched on Polygon".
- **What the repo actually contains (H, `gh api repos/Luna-Fi/lunafi-smart-contracts/git/trees/{main,dev,publicWork,operational-info,operational-post-live}?recursive=1`):**
  - `LFIToken.sol` - governance/utility ERC-20 (pausable, blacklist, bot-protection hook).
  - `VLFI.sol` - "DAO staking pool": stake LFI, receive vLFI, earn LFI rewards per second, cooldown plus unstake window.
  - `claimToken.sol` - generic ERC-20 LP receipt token ("claim token") for house pools.
  - `LFiFarms.sol`, `FundDistributor.sol` (post-live branches only).
  - `docs/Front_End_Helper.md` references **three house pools (USDC, WBTC, WETH)** and a `getLiquidityStatus` method, but **the house-pool contracts, any bet/odds/market contract and any oracle are not in any branch** (only referenced by name in `Upgrades.md` as testnet deployments and as artifact paths).
  - README: "claim tokens are part of Phase 2 functionality and the remaining phase 2 functionality will be built with house pools and audited again."
- **Inferred market model (M, from the tagline plus house pools plus LP claim tokens):** a house-banked bookmaker where LPs fund pools that take the other side of bettors. That would be neither an order book nor an AMM over outcome tokens, and there is no evidence of tokenised outcomes. **I found no document that states the bet type (binary/categorical/scalar), odds mechanism, or event list. NOT FOUND (searched: repo all branches, docs.lunafi.io, lunafi.io, DefiLlama).** Whether a betting product ever shipped to Polygon mainnet is NOT FOUND.

---

## 3. Chains and collateral

- **Chain: Polygon (H, README and DefiLlama).** Test deployments on Mumbai, Goerli, Rinkeby, Ropsten (H, `deployments/` folders and `Upgrades.md`).
- **Collateral: planned USDC, WBTC, WETH house pools (H, `docs/Front_End_Helper.md`); the only live balance DefiLlama sees is 0.00372 WETH (H).** DefiLlama also shows $41.93 in a "pool2" bucket (H) which usually means LP-token staking (M).
- **DefiLlama tracks address `polygon:0x77d97db5615dfe8a2d16b38eaa3f8f34524a0a74` (H).** I could not identify what this contract is: Polygon Blockscout returned a Cloudflare challenge page to scripted GETs and I did not try to bypass it. It is probably the LFI token (symbol `LFI` in DefiLlama) but that is unverified (L).

---

## 4. Read API

- **exists: none (NOT FOUND).** No REST/GraphQL API, no subgraph, no websocket, no public docs. Searched: `docs.lunafi.io` (empty GitBook shell), `lunafi.io` (origin down), the 2 GitHub repos in the `Luna-Fi` org across all 5 branches (no server code; `docs/images/*architecture*.png` suggest an AWS backend but the images were not read and no endpoint names appear in text docs), and a GitHub repository search for "lunafi" (hits were unrelated projects, not read).
- **On-chain read:** the vLFI/LFI ABIs are in `artifacts/contracts/*/` of the repo, but they cover staking and token functions, not markets.
- **Fixtures saved are DefiLlama metadata only** (the only live machine-readable source touching LunaFi). They are not an adapter source.

---

## 5. Trade path

**None.** There is no live, identifiable betting contract and no off-chain order API. A PayBox EVM wallet on Polygon could in principle propose a transaction to any verified Polygon contract, but there is no LunaFi market contract address, ABI or front end to target, so nothing can be placed (M).

---

## 6. Fees

NOT FOUND (searched: repo contracts for fee logic, docs.lunafi.io, lunafi.io). The only reward mechanics in public code are LFI staking emissions (`rewardPerSecond`) in `VLFI.sol` and `LFiFarms.sol` (H); there is no bet-fee or house-edge formula.

---

## 7. Resolution mechanism and dispute risk

NOT FOUND. No oracle, resolver or dispute contract exists in the public repo. Risk for any hypothetical integration: unknown resolution plus a recorded 2023 "reward logic flaw" exploit ($35k) and a dormant team (H for the exploit listing, M for the inference).

Audit: a Hacken report dated 2022-02-23 is committed to the repo (`docs/LunaFi_Technologies_Ltd_23022022SCAudit_Report_3.pdf`) and an "addressing audit comments" PDF; the README's Hacken URL returned 404 via WebFetch on 2026-10-19. I did not read the repo copies of the PDFs, so audit scope is unconfirmed; the README ties it to the LFI token, staking and claim-token contracts, not to a betting engine (M).

---

## 8. Geo, ToS and automation

NOT FOUND. No terms, privacy policy or geo-restriction text is reachable (site down, docs empty). The repo `LunaFi_Technologies_Ltd` audit filename suggests a company entity name (L); jurisdiction not established.

---

## 9. Liquidity

- **TVL $8.89 (DefiLlama `/protocols`, fetched 2026-10-19; last series point 2026-10-18 = $8).** Peak $370,232 on 2023-05-21. No volume, OI or user counts found.

---

## 10. Event coverage and overlap

NOT FOUND. No event list is recoverable, so there is no verified overlap with sports, politics, crypto-price or macro markets on other venues. Shared liquidity: none known; LunaFi appears to have been a standalone house-pool design, but it is moot because it has no liquidity.

---

## 11. Fixtures

In `docs/research/fixtures/lunafi/`:
- `defillama-protocols-entry-lunafi.json` - the single LunaFi entry from `GET https://api.llama.fi/protocols` (2026-10-19, unmodified apart from an added `_note`).
- `defillama-protocol-lunafi.trimmed.json` - `GET https://api.llama.fi/protocol/lunafi`, TRIMMED by me (metadata, first-of-month TVL samples, last 5 points, last token balance); the full response has 1,440 daily points.
- `defillama-hacks-entry-lunafi.json` - the LunaFi entry from `GET https://api.llama.fi/hacks`.

---

## 12. Adapter priority: skip

Dead frontend, no API, no market contract in public code, no liquidity ($9 TVL), no resolution mechanism, a historical exploit, and no tradable path. Nothing here is worth an adapter or a signal feed. Revisit only if a new LunaFi deployment announces a market contract with documented read access.

---

## 13. Suspicious content

None found. No embedded instructions were present in any fetched page, repo file or API response I read.

---

## 14. Open questions

1. Identity of `polygon:0x77d97db5615dfe8a2d16b38eaa3f8f34524a0a74` (blocked explorer).
2. Whether `@LunaFi_Project` is still posting (X blocked scripted access).
3. Whether a betting product ever launched on Polygon mainnet (no public evidence either way).
4. Primary write-up of the 2023-05-23 "Reward Logic Flaw" exploit.
5. Hacken report scope (PDF not read).

---

## Sources

- DefiLlama protocols list (entry `lunafi`): https://api.llama.fi/protocols - H
- DefiLlama protocol detail: https://api.llama.fi/protocol/lunafi - H
- DefiLlama hacks: https://api.llama.fi/hacks - H
- DefiLlama coins price probe: https://coins.llama.fi/prices/current/polygon:0x77d97db5615dfe8a2d16b38eaa3f8f34524a0a74 - H
- CoinGecko coin probe: https://api.coingecko.com/api/v3/coins/lunafi - H
- Website probes: https://www.lunafi.io/ (HTTP 530 / 1016), https://docs.lunafi.io/ (307 to GitBook shell) - H
- GitBook shell: https://app.gitbook.com/o/-Mk1hilVtE65fRriw5mO/sites/site_K0d57/ - H (no content)
- GitHub org: https://github.com/Luna-Fi (API: `orgs/Luna-Fi`) - H
- GitHub repo: https://github.com/Luna-Fi/lunafi-smart-contracts (ReadMe.md, Upgrades.md, docs/Front_End_Helper.md, docs/DAO_Staking_Pool.md, contracts/*.sol, branch trees and commit dates via `gh api`) - H
- X profile https://x.com/LunaFi_Project - blocked (HTTP 402 via WebFetch), not read
- Hacken audit URL from README (404): https://hacken.io/wp-content/uploads/2022/04/LunaFi_Technologies_Ltd_23022022SCAudit_Report_3.pdf - H (404)
- Polygon Blockscout probe (Cloudflare challenge, not read): https://polygon.blockscout.com/api/v2/addresses/0x77d97db5615dfe8a2d16b38eaa3f8f34524a0a74
