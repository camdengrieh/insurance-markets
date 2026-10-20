# BitNile.com (BNC, RiskOn International, Hyperscale Data) - venue spec

Researched 2026-10-19. Verdict: **skip**. Not live, pre-launch, no API, no docs, no liquidity.

## Liveness (H)
- `https://bitnile.com/` returned HTTP 503, title "Service Suspended", body "This service has been suspended by its owner."; header `x-render-routing: suspend-by-user` (Render.com hosting, behind Cloudflare). Probed 2026-10-19 (curl, first-hand).
- `https://api.bitnile.com/` also 503 with the same suspend header. `docs.bitnile.com` and `app.bitnile.com` do not resolve (H).
- Hyperscale Data's homepage (hyperscaledata.com, page dated 2026-10-06) does not mention BitNile.com or a predictions market (H).

## What the venue is (H, FY2025 10-K filed 2026-04-15)
Source: https://www.sec.gov/Archives/edgar/data/896493/000121465926004697/hdi32026010k.htm (read via WebFetch; direct curl was refused by SEC as "Undeclared Automated Tool" because no contact address is allowed - blocked: requires a contact address).
- Structure: Hyperscale Data -> RiskOn International, Inc. ("ROI") -> BitNile.com, Inc. ("BNC"), 100% owned.
- "BNC is engaged in the development of an online predictions market platform"; "BNC has discontinued its prior sweepstakes gaming operations".
- "The Platform is currently in alpha testing and is accessible only to a limited number of users"; "BNC intends to expand availability of the Platform upon completion of its technical build-out".
- Strategy: launch "to registered users in compliance with applicable regulatory requirements"; pursue "integrations with third-party data providers that supply verified real-world event outcomes" (resolution oracle intent only, nothing named).
- Competition section names Kalshi (CFTC-regulated DCM) and Polymarket (offshore). Says BNC "intends to implement a user verification process".
- No launch date, no named partners, no CFTC/DCM/state licence held or applied for, no blockchain or token mention for BNC, no capital figure in the passages read (parts of the filing, e.g. Risk Factors/MD&A beyond ~char 268k, not exhaustively read; the three 100k-char chunks were read).

## Adapter-relevant fields
- Kind / market model: NOT FOUND (searched: 10-K Item 1 BNC section, bitnile.com, api.bitnile.com). Described only as an "online predictions market platform"; likely a centralised, registered-user product (M, inferred from "registered users" and "user verification"), not an on-chain venue.
- Chains / collateral: NOT FOUND. No on-chain component is mentioned for BNC. (Sibling Ault Blockchain/AULT token is a different business unit; no link to BNC stated.)
- Read API: none found. No docs URL, no OpenAPI, no GitHub org found (WebSearch budget exhausted this session, so a GitHub/web search for "bitnile api" was not run; searched: bitnile.com, api./docs./app. subdomains, hyperscaledata.com, SEC 8-K list).
- Trade path: none. No programmatic order placement documented.
- PayBox reachability: no (nothing to transact against; no on-chain contract, no signed-order scheme).
- Fees: NOT FOUND.
- Resolution: only "third-party data providers that supply verified real-world event outcomes" (H, intent statement); no dispute process documented.
- Geo/ToS/automation: NOT FOUND (site down). Filing says jurisdictions may treat prediction markets as gambling; user verification planned.
- Liquidity: none evidenced. Alpha, limited users, site suspended (H).
- Category overlap: unknown; any future overlap would be with Kalshi/Polymarket-style sports/politics/crypto/macro, but nothing is listed.
- Shared liquidity: unknown/none.

## Priority: skip
Dead/suspended site, alpha-only, no docs, no API, no licence disclosed. Revisit only if (a) bitnile.com comes back, or (b) an 8-K/press release announces a launch with a CFTC-registered structure and a public API. Cheap re-check: `curl -I https://bitnile.com` and EDGAR 8-K Item 7.01 list for CIK 896493 (about 40 8-Ks since Nov 2025, none described as BitNile-related in the item list).

## Fixtures
None saved: the only responses were the 503 "Service Suspended" pages, which carry no API shape.

## Suspicious content
None found.

## Sources
- [H] https://bitnile.com/ and https://api.bitnile.com/ (curl 2026-10-19, 503 suspended)
- [H] https://www.sec.gov/Archives/edgar/data/896493/000121465926004697/hdi32026010k.htm (FY2025 10-K, filed 2026-04-15)
- [H] https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000896493&type=8-K (8-K item list through 2026-10-13)
- [H] https://www.hyperscaledata.com (no mention of BitNile)
- Not run: web searches (session WebSearch budget exhausted).
