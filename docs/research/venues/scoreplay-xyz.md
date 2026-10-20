# ScorePlay.xyz: venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: public unauthenticated GETs (DefiLlama API, the venue's own hostnames, Sophon explorer front page), `gh api` raw reads of public repos, WebFetch of audit write-ups. Nothing was signed, posted, created or paid.

Confidence tags: **H** = read first-hand in a primary source this session, **M** = secondary or inferred, **L** = weak or stale. "(fetch-summarised)" means the page went through the WebFetch summariser rather than being read raw.

Search limits: the session's WebSearch budget was exhausted, so no web search was possible. Findings come only from direct fetches, so "not found" below means "not found in the sources I could reach", not "does not exist".

## Verdict

**adapter_priority: skip.** The venue looks dead as of 2026-10-19: no live front end, no docs, no API, and essentially zero on-chain liquidity.

- The only known front-end host `app.scoreplay.xyz` (the apex `scoreplay.xyz` and `www` 301 to it) answers every path with HTTP 404 and a Railway edge fallback body `{"status":"error","code":404,"message":"Application not found",...}` with header `x-railway-fallback: true`. The hostname still resolves through Cloudflare, but no application is attached behind it. Probed `/` three times over a few minutes and `/api/health`, `/health`, `/api/markets`, `/graphql` once each; all returned the same 404. [H, curl 2026-10-19; fixture `app-scoreplay-xyz-root-404.txt`, `scoreplay-xyz-apex-redirect.txt`] Inference that the app was taken down rather than briefly misrouted: [M].
- DefiLlama flags the protocol `deadUrl: true` with an empty `url`. [H, https://api.llama.fi/protocol/scoreplay.xyz; fixture `defillama-protocol-trimmed.json`]
- DefiLlama TVL: **$0 on both chains on 2026-10-19**. Sophon peaked at $3,562 on 2026-01-11 and the last non-zero reading was $39 on 2026-09-09; Base was last non-zero at $584 on 2024-07-15 (WETH only). [H, same fixture] This is TVL held by one contract per chain, not betting volume, but it shows there is nothing meaningful on chain.
- No `docs.` or `api.` hostname exists (`docs.scoreplay.xyz`, `api.scoreplay.xyz` do not resolve). [H, dig/curl 2026-10-19]
- No public API, no SDK, no official GitHub organisation found. [NOT FOUND, see below]

**Revisit trigger:** none worth scripting. If someone reports a relaunch, re-run `curl -sS https://app.scoreplay.xyz/` and look for anything other than the Railway "Application not found" JSON.

## 1. Identity

- Name: ScorePlay.xyz, "a sports prediction market tailored for sports fans". [H, DefiLlama `description`]
- Category on DefiLlama: Prediction Market; listed 2024-06-19 (`listedAt` 1718822663); chains Base, Sophon; twitter handle `ScorePlay_xyz`. [H, DefiLlama API]
- Name collision warning: **ScorePlay Inc / scoreplay.io** (a sports media-asset-management SaaS; GitHub org `ScorePlay-Inc`) is an unrelated company. Do not confuse it with this venue. [M: scoreplay.io/.com redirect to www.scoreplay.io (curl); the GitHub org was seen in a repo search, content not read]
- Website: DefiLlama has none; the one URL tied to the project is `https://app.scoreplay.xyz/`, given by Three Sigma's publications index. [H, https://github.com/threesigmaxyz/publications README, "Scoreplay | app.scoreplay.xyz | Apr 2025"]
- X/Twitter profile (`x.com/ScorePlay_xyz`): WebFetch got HTTP 402 Payment Required with no body; I stopped there and did not look for a workaround. So account activity in 2026 is **unknown**. [H for the 402]

## 2. Market model

Parimutuel pools, on chain. [M: derived from two audit write-ups, not from code or docs]

- A "condition" (for example a match) has a valid outcome range `minOutcome..maxOutcome`. Users stake on an outcome; stakes feed a `totalPool`, and the stakes on the eventual winner form the `winningPool`. After the prediction period an oracle calls `resolveCondition(conditionId, winningOutcome)`. A `houseCut` (percentage of the total pool) goes to the house. If nobody backed the winner, the house takes the whole pool. `claimRefund()` returns stakes for voided or unresolved outcomes. Contract names seen: `EnhancedSportsPrediction` / `EnhancedPredictionMarket.sol`. [M, https://www.octane.security/post/octane-smart-contract-security-for-scoreplay (published 2025-07-23, fetch-summarised); https://threesigma.xyz/case-studies/derivatives/scoreplay (audit dated 2025-04-03, fetch-summarised)]
- Outcomes are integers inside a contract, not tradable tokens: no ERC-1155/ERC-20 share tokens were mentioned. So there is no secondary market and no order book or AMM price; the implied odds are just pool ratios, and they move until resolution. [M/L: inferred from the descriptions; the audit PDF could not be read]
- Binary/categorical/scalar split: NOT FOUND. A `min..max` outcome range suggests it may also allow scalar-style score outcomes. [L]

Parimutuel pools are a poor arbitrage leg anyway: you cannot lock in a price, final payout depends on later stakes, and there is no way to exit early.

## 3. Chains and collateral

- Chains: Base and Sophon per DefiLlama. [H] Three Sigma's page says "built on Basecamp and Sophon" and lists "Chain: Basecamp, Sophon". "Basecamp" probably means Camp Network's Basecamp (testnet), which conflicts with DefiLlama's "Base"; not resolved. [M/L, fetch-summarised]
- Contracts the DefiLlama adapter reads (ownership of TVL tokens), from adapter commit `683d369` (the adapter was last updated 2025-08-05 per git log, "update scoreplay #15765"):
  - Base: `0xFcab8B765FB0BCB05407d16173941e2d1F09DE12` holding WETH (`0x4200...0006`). Not verified on Etherscan v2 per the DeFiPunk enrichment data. [H adapter source via `gh api`; M for the "unverified" fact, third-party dataset https://github.com/guil-lambert/defipunkd]
  - Sophon: `0x0f646ad0b32e2adacfa702d02e37aae26737d82d` holding USDC `0x9aa0f72392b5784ad86c6f3e899bcc053d00db4f`. [H adapter source; the "USDC" label is from DefiLlama coreAssets]
  - Whether these are the betting contracts or just treasuries is **not confirmed**: I could not read them (explorer API blocked or not found, see open questions).
- Collateral: USDC on Sophon, ETH/WETH on Base (from the TVL tokens). [M, inferred from the adapter]

## 4. Read API

**None.** `read_api.exists = none`.

- No official docs, OpenAPI, SDK, subgraph or websocket found. `api.scoreplay.xyz` / `docs.scoreplay.xyz` do not resolve; the app host returns Railway "Application not found" on all paths. [H]
- A GitHub search for ScorePlay found only unrelated repos for the media-asset company and one throwaway Next.js example (`thirdweb-sophon-account-scoreplay`, last pushed 2025-08-13) that shows ScorePlay used thirdweb connect wallets with Sophon in Aug 2025. It is not an API. [M/L]
- An on-chain-only integration would need the ABI of the (unverified) contracts, which is not available. [M]

## 5. Trade path

None. No documented order placement, no signing scheme, no relayer. Users presumably called the contracts directly from the web app (plain contract calls, approvals for USDC on Sophon). [L]

PayBox reachability: `no`. The venue is dead. Even if it were live, a Base contract would be just an EVM transaction proposal, but the unverified contract on Base and Sophon (not confirmed as a PayBox-supported chain) mean there is nothing safe to build on. [M]

## 6. Fees

- A "global house fee" (`houseCut`) as a percentage of the total pool, changeable by the owner; units/amount not stated in either write-up. [M, Three Sigma + Octane, fetch-summarised]
- Audit-found issues relevant to payouts: house fee changes applied to existing bets (inconsistent payouts); if every bet was on a losing outcome, funds were locked with no refund path; a double-counted fee in the no-winner case (Octane, reportedly fixed). [M]
- Gas: paid by the bettor. No other fees found. NOT FOUND (searched: DefiLlama fees/dexs/options dimensions return "not found" for this slug; audit write-ups; no docs).

## 7. Resolution and dispute risk

- A single `oracle` account calls `resolveCondition`. No decentralised oracle or dispute window described. Three Sigma flagged resolution front-running (recommended a separate step to close trading before setting the outcome). [M, Three Sigma + Octane, fetch-summarised]
- Resolution risk is therefore centralised and unaudited in operation; there is no data source or rulebook. NOT FOUND (searched: DefiLlama, audit write-ups, venue hostnames).

## 8. Geo / ToS / automation

NOT FOUND (searched: venue hostnames return Railway 404; no terms page reachable; no docs). No statement on geo-blocking or bots.

## 9. Liquidity

- DefiLlama TVL: **$0** on 2026-10-19 (Base $0, Sophon $0). Peak $3,562 (Sophon, 2026-01-11). Last non-zero $39 (Sophon, 2026-09-09). Earlier Base TVL peaked at $1,693 on 2024-06-19 and went to $0 by 2024-07-16. [H, fixture `defillama-protocol-trimmed.json`]
- Volume / OI: NOT FOUND (searched: DefiLlama dimensions endpoints for fees, dexs, options; none list this slug).

## 10. Event overlap and shared liquidity

- Category: sports (match outcomes). [M] Sports overlaps Polymarket, Kalshi, Azuro and others, but with no live markets and no price feed there is no arbitrage to scan.
- Shares liquidity with another venue: no evidence either way; its own pools were separate contracts. [M]

## 11. Security and audits (context only)

- Three Sigma: code audit dated 2025-04-03, 1 high, 2 medium, 2 low, 4 informational; PDF at `audits/scoreplay/SCOREPLAY.pdf` in https://github.com/threesigmaxyz/publications (7.5 MB, not machine-readable here, so not read). [H for existence/date from the README table, M for counts (fetch-summarised)]
- Octane: case study published 2025-07-23, with one critical (fee double count) and two best-practice findings. [M]

## 12. Suspicious / untrusted content

None containing instructions to agents was found in anything I read. Notes:

- x.com returned 402 to WebFetch (no body); recorded and stopped.
- An unrelated SEO page for "ScorePlay.xyz" on a third-party compliance site (apacfinstab.com, via GitHub) described the project as "Multi-Chain / infrastructure" with a "compliance score"; it looks auto-generated and has no value, so it was not used.
- A developer example repo README contained a local file path with a person's name; I did not record it.

## Open questions

- Whether the Sophon contract `0x0f64...d82d` is the betting contract, and whether any historical market list exists. Needs a Sophon explorer API or an RPC `eth_call`; I did not use JSON-RPC because it is a POST.
- Whether the "Basecamp" chain in the Three Sigma write-up is a different chain from DefiLlama's "Base".
- Whether the project relaunched under a different domain or name (no web search was available).

## Sources

1. https://api.llama.fi/protocol/scoreplay.xyz : metadata, chains, `deadUrl`, TVL history. [H]
2. https://github.com/DefiLlama/DefiLlama-Adapters (`projects/scoreplay/index.js` at commit 683d369; commit history via `gh api`) : contract addresses, adapter dates. [H]
3. https://github.com/guil-lambert/defipunkd (`data/enrichment/scoreplay.xyz/*.json`) : third-party extraction of the same addresses; verification status. [M]
4. https://app.scoreplay.xyz/ and https://scoreplay.xyz/ : live probes 2026-10-19 (Railway "Application not found" 404, 301 from apex). [H]
5. https://github.com/threesigmaxyz/publications (README and `audits/scoreplay/SCOREPLAY.pdf`) : audit index, Apr 2025. [H]
6. https://threesigma.xyz/case-studies/derivatives/scoreplay : audit summary, chains, findings. [M, fetch-summarised]
7. https://www.octane.security/post/octane-smart-contract-security-for-scoreplay : audit write-up, market mechanics, 2025-07-23. [M, fetch-summarised]
8. https://x.com/ScorePlay_xyz : HTTP 402, not read. [H for the 402]
9. https://explorer.sophon.xyz/ : front page only (SPA, no address data readable). base.blockscout.com returned a Cloudflare challenge. [H]

Fixtures: `docs/research/fixtures/scoreplay-xyz/defillama-protocol-trimmed.json`, `app-scoreplay-xyz-root-404.txt`, `scoreplay-xyz-apex-redirect.txt`.
