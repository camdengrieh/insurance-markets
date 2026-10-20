# Prophecy (white-label PM protocol) - venue spec

Researched 2026-10-19. Verdict: adapter_priority = skip. No evidence of a live, integrable prediction-market venue. The GitHub org exists but contains no prediction-market code.

## Summary
- [H] GitHub org `prophecy-dev` ("Prophecy"), created 2025-12-08, description "White-label prediction market protocol enabling third parties to launch branded, on-chain prediction markets.", no website/blog field, no public members, 2 public repos. (https://github.com/prophecy-dev ; gh api orgs/prophecy-dev)
- [H] Both repos are forks of unrelated upstream projects, neither is a prediction market:
  - `metamask-delegation-framework` - fork of MetaMask/delegation-framework (Apache-2.0), created 2026-02-26, last push 2026-02-26; recent commits are upstream merges (e.g. "deploy mega eth", 2026-01-20).
  - `htmlradar` - fork of gioelenanni/htmlradar (AGPL-3.0, "open-source DocSend for HTML"), created 2026-09-21, last push 2026-09-22; README banner says "Somnia internal fork".
- [H] The org's description is the only prediction-market content. No contracts, ABIs, SDK, docs, API or subgraph exist in the org.
- [M] The "Somnia internal fork" banner suggests the org may be a dev/staging account of a team building on Somnia (an EVM L1), possibly with a pre-launch product. This is inference only; nothing found names a product or chain.
- [H] Obvious domain guesses are not it: prophecy.dev is a "TopDomains domain showcase" parking page; prophecy.xyz is "for sale on Spaceship"; prophecy.fun returned no title; docs.prophecy.dev does not resolve; prophecy.markets timed out (curl, 2026-10-19). None is evidence of the venue.

## Still live?
Not demonstrably. The org is active (updated 2026-10-11 per GitHub API) but there is no deployed protocol, site, docs or market data that I could find. Treat as pre-launch / stealth / vapor.

## Market model, chains, collateral
NOT FOUND (searched: GitHub org page and API, org repos and their READMEs/file lists, guessed domains prophecy.dev/.xyz/.fun/.markets, docs.prophecy.dev). Description only says "white-label", "branded", "on-chain".

## Read API
NOT FOUND. No docs URL, base URL, subgraph, websocket or contract addresses. exists = none.

## Trade path / PayBox
NOT FOUND. No contracts or signing scheme to propose. paybox_reachable = unknown (nothing to reach).

## Fees, resolution, geo/ToS, liquidity, event overlap
NOT FOUND for all. No volume/TVL/OI data from any source. Cannot assess overlap with other venues or shared liquidity. A white-label model would likely share liquidity or oracle infra across brands, but that is speculation (L).

## Fixtures
None saved: no public API exists to sample.

## Limits of this research
- WebSearch budget for the session was exhausted (limit of 200 shared across agents), so no web-wide search for a product name, X/Twitter, Discord, DefiLlama, or Somnia ecosystem listings was possible. A re-check later could search "Prophecy prediction market Somnia" and DefiLlama/Somnia ecosystem pages. Only direct fetches and the GitHub API were used.
- Confidence that there is no integrable venue today: medium (could be a live product under a different brand name).

## Revisit triggers
Org gains a non-fork repo with contracts/SDK; a branded Prophecy-powered market appears on Somnia or another chain; DefiLlama lists a Prophecy protocol.

## Sources
- [H] https://github.com/prophecy-dev (WebFetch + `gh api orgs/prophecy-dev`, `orgs/prophecy-dev/repos`, 2026-10-19)
- [H] https://github.com/prophecy-dev/htmlradar (README header, repo metadata)
- [H] https://github.com/prophecy-dev/metamask-delegation-framework (commit list)
- [H] https://prophecy.dev , https://www.prophecy.xyz , https://prophecy.fun (title checks, 2026-10-19)
- Local: hint from the discovery workflow, [L] GitHub org (2025-12-08), unverified.
