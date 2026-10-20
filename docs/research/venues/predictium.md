# Predictium (predictium.xyz) - venue spec

Date researched: 2026-10-19. Verdict: **skip** (appears dead or never launched; no API, no docs, no contracts found).

## Liveness
- https://predictium.xyz returns HTTP 530 with body `error code: 1033` from Cloudflare on 2026-10-19 (H, curl). Cloudflare error 1033 means the DNS record points at a Cloudflare Tunnel that has no active connector, i.e. the origin is offline (M, my reading of the Cloudflare error code; not re-verified against Cloudflare docs this session).
- api.predictium.xyz also returns 530; www/app/docs subdomains do not resolve (H, curl). Nameservers are Cloudflare (H, dig).
- GitHub org `Predictium` was created 2025-06-04, has exactly 1 public repo (`.github`), 0 followers, last updated 2025-06-08 (H, gh api). Org profile README says only: "Smart contract security audits are pending." (H). Org email/twitter: team@predictium.xyz / @PredictiumXYZ (H, GitHub profile; X not fetched).
- No activity for ~16 months (L/M: stale).

## Kind / market model
NOT FOUND (searched: GitHub org, site, api subdomain). Only claim is GitHub bio "DEX-like decentralized prediction market protocol" (H as to the bio; says nothing about mechanism). No AMM vs order book, no outcome tokenisation, chains or collateral are documented.

## Read API
None found. No docs host, no OpenAPI, no subgraph, no contract addresses. Searched: predictium.xyz, api./docs./app./www. subdomains, GitHub org repos. WebSearch was unavailable (session budget exhausted), so third-party mentions (explorers, DefiLlama, X) were NOT checked. No fixtures saved.

## Trade path / PayBox
None documented. PayBox reachability: unknown/no, because chain and contract addresses are unknown; nothing to propose transactions against.

## Fees, resolution, geo/ToS, liquidity, overlap
All NOT FOUND. No TVL/volume source located (DefiLlama and explorers not checked). Overlap with other venues and shared liquidity: unknown.

## Sources
- https://predictium.xyz (HTTP 530 / CF 1033, 2026-10-19) H
- https://github.com/Predictium and `gh api users/Predictium`, repos `.github` (README, commits 2025-06-08) H
- DNS: dig NS predictium.xyz (lola/will.ns.cloudflare.com) H

## Open items (only if someone wants to revisit)
- Re-check site in a few weeks; search X (@PredictiumXYZ), DefiLlama, and chain explorers for a deployed contract when web search is available.
