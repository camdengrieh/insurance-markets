# PremiumBlock (premiumblock.org) - venue spec

Researched 2026-10-19. Verdict: SKIP. Domain and all known subdomains are NXDOMAIN; no docs, API, contracts or repo found.

## Liveness
- [H] premiumblock.org, www.premiumblock.org, rpc.premiumblock.org, scan.premiumblock.org all return DNS status NXDOMAIN on 2026-10-19 (dig). Sources: DNS queries run this session.
- [H] premiumblock.com resolves but only redirects to a GoDaddy "for sale" parked page (https://premiumblock.com/lander -> forsale.godaddy.com). Unrelated to the venue.
- [H] GitHub repo search for "premiumblock" returns 0 repositories (gh api search/repositories, 2026-10-19).
- Conclusion: not live / unreachable. still_live = false.

## What the venue claimed
- [H] Chainwire paid press release, 2026-06-19, Stockholm: "non-custodial risk hub" for user-created prediction markets (crypto, sports, politics, culture, macro, world news), "up to 2.5x leverage on selected markets", crypto perps, Web3 poker. Chain: not specified. Token: none mentioned. Fees: not disclosed. Collateral: "defined collateral framework", no detail. Company contact not listed; spokesperson named in PR (not recorded here). Names Polymarket and Kalshi as category context. Source: https://chainwire.org/2026/06/19/premiumblock-launches-non-custodial-risk-hub-for-user-created-prediction-markets-perps-and-web3-poker/
- [M] Press-release claims are marketing, unverified by any product page, docs or on-chain data.

## Name collision: PremiumBlock chain (PBLK, chainId 23023)
- [H] ethereum-lists/chains has eip155-23023.json: name "PremiumBlock", symbol PBLK, RPC https://rpc.premiumblock.org, explorer https://scan.premiumblock.org. viem defines it as "PremiumBlock Testnet" (testnet: true). Sources: gh api repos/ethereum-lists/chains/contents/_data/chains/eip155-23023.json ; repos/wevm/viem/contents/src/chains/definitions/premiumBlock.ts
- [M] Likely the same operator's earlier testnet chain on the same domain; the 2026 PR does not name a chain, so the link is inferred. Both RPC and explorer hostnames are now NXDOMAIN, so the chain is also dead/unreachable.

## Adapter spec fields
- Kind / market model: NOT FOUND (searched: chainwire PR, domain DNS, GitHub repo + code search). PR implies user-created markets with leverage, mechanism unknown (order book / AMM / parimutuel unspecified).
- Chains / collateral: NOT FOUND for the prediction product. Only a testnet chain 23023 (PBLK) exists in registries.
- Read API: none (no reachable host). No fixtures saved; nothing to GET.
- Trade path: none.
- PayBox reachability: no. Nothing to transact against.
- Fees: NOT FOUND. Resolution mechanism: NOT FOUND (PR mentions "market-resolution rules" only generically; user-created markets would imply high dispute risk).
- Geo/ToS/automation: NOT FOUND.
- Liquidity: NOT FOUND. No volume/TVL source. PR's "maximal liquidity" is unsupported.
- Category overlap: PR claims crypto/sports/politics/macro, but no live markets to map.
- Shared liquidity: unknown.

## Suspicious content
- None found embedded in fetched pages. Pattern note: paid wire-service PR with no reachable product, same pattern as other Stockholm-datelined launches (M).

## Not found / limits
- WebSearch budget was exhausted this session, so no independent news/social/Wayback corroboration was gathered beyond the PR and registries. A later retry with search could look for a renamed domain; low expected value.
- Fixtures: none (no API).

## Sources
1. https://chainwire.org/2026/06/19/premiumblock-launches-non-custodial-risk-hub-for-user-created-prediction-markets-perps-and-web3-poker/ [H]
2. DNS lookups (dig) of premiumblock.org, www./rpc./scan. subdomains, 2026-10-19 [H]
3. https://premiumblock.com/lander (GoDaddy parked) [H]
4. gh api: ethereum-lists/chains eip155-23023.json; wevm/viem premiumBlock.ts [H]
5. gh api search/repositories q=premiumblock (0 results) [H]
