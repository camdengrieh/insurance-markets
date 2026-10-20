# CalledIt (app.calledit.ai) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session, M = secondary/inferred, L = weak/stale.

## Verdict

**skip.** The only official host we have (`app.calledit.ai`) does not resolve in DNS, and the apex `calledit.ai` is a registrar parking page. There is no documented API, no contracts, no docs and no volume figure. Nothing is integrable, so the depth below is deliberately thin. Confidence that it is dead or not a usable venue: medium.

## Is it live? (H unless noted)

- `dig +short app.calledit.ai` returns nothing; `curl` fails with "Could not resolve host: app.calledit.ai" (H, 2026-10-19). The task's WebFetch ENOTFOUND observation matches.
- `calledit.ai` apex resolves to 162.255.119.209 and `curl -I` to https timed out (H). `www.calledit.ai` is a CNAME to `parkingpage.namecheap.com` (H). Nameservers are `dns1/dns2.registrar-servers.com` (Namecheap default) (H). Fetching `http://calledit.ai/` returned an HTML shell that loads a "parked domain" landing script (`lander.parity.domains`) and has an empty `<title>` (H). So the domain is parked, not serving a dApp.
- `calledit.io` and `calledit.fun` resolve to AWS Global Accelerator-style IPs (76.223.105.230, 13.248.243.5), which is typical of domain-marketplace landers; not verified further, and not linked to this project (L).
- X account `@CalledIt_AI` (per PredictionIndex): WebFetch of x.com returned HTTP 402, so last-post date and any shutdown notice are NOT FOUND.
- PredictionIndex ecosystem page (H, https://predictionindex.xyz/ecosystem, fetched today) lists: URL https://app.calledit.ai/, chain Arbitrum, outcome binary, mechanism **parimutuel**, topic sports (from our saved fixture), status "live", Volume "n/a", no description. The "live" flag is the aggregator's own and is contradicted by DNS (the listing is stale or unmaintained). Our fixture of that page (`docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json`) also shows topic = sports, status = live (H).
- DefiLlama protocols list (api.llama.fi/protocols, 200 OK, H): no protocol named CalledIt/Called It. So no TVL/volume tracking.
- WebSearch was unavailable (session search budget exhausted), so no press, docs, audit, or shutdown announcements could be searched. NOT FOUND (searched: PredictionIndex, DNS, DefiLlama, GitHub search, X fetch).

### Name collisions (do not confuse)
- GitHub repos named "calledit" exist but are unrelated or unverified: `mcaliboso/CalledIt` (play-money group markets, Next.js + Supabase, pushed 2026-03), `MajorAaron/calledit` ("track every prediction ... AI auto-resolves your calls", 2026-04), `StefanAbrudan/calledit` (landing page, 2026-10), `baf6100/calledit` (rebrand of knewit.pro, Polymarket-inspired design, 2026-10). Their READMEs returned 404; only the search-result descriptions were read (L). None is tied to app.calledit.ai or Arbitrum.
- Totalis (see `docs/research/venues/totalis.md`) names its operator "UCALLEDIT, Inc." (H, per that note). A corporate relationship to this CalledIt is possible but unverified (L); Totalis is a synthetic RFQ layer, not a parimutuel Arbitrum pool.

## Spec fields

- **kind / market model**: PredictionIndex says binary, parimutuel, Arbitrum, sports (M, secondary). Outcome tokenisation unknown. NOT FOUND (no docs/contracts).
- **chains / collateral**: Arbitrum per PredictionIndex (M). Collateral token NOT FOUND.
- **read API**: none found. Base URLs: none. Docs URL: none. Contracts/subgraph: NOT FOUND (searched: PredictionIndex, DefiLlama, GitHub repo search by name).
- **trade path**: none known. An EVM wallet on Arbitrum reached through PayBox could in principle send contract txs, but no contract address or ABI is known, so PayBox reachability is "no" in practice until a live app and verified contract appear.
- **fees**: NOT FOUND.
- **resolution mechanism / dispute risk**: NOT FOUND. Parimutuel sports pools normally resolve via an operator or oracle (M, generic inference only); treat as centralised/unknown.
- **geo / ToS / automation**: NOT FOUND (site unreachable).
- **liquidity**: PredictionIndex "Volume: n/a" (H, fetched 2026-10-19). No TVL on DefiLlama. Treat as zero/unknown.
- **event categories overlapping other venues**: sports (M, from PredictionIndex topic). Parimutuel pools pay on final pool ratios, so they are poor fits for price-based arbitrage anyway.
- **shared liquidity**: unknown; parimutuel pools would be self-contained, so independent in principle (L).
- **fixtures**: none saved (no public API to sample).

## Adapter priority: skip

Dead or parked front-end, no API, no docs, no volume, parimutuel (no continuous price). Revisit only if `app.calledit.ai` starts resolving or a verified Arbitrum contract is found. Cheap re-check: `dig +short app.calledit.ai`.

## Open questions
- Is there a rebrand or successor domain (e.g., via the @CalledIt_AI X profile)?
- Was there ever a deployed Arbitrum contract, and does it hold funds?
- Any relation to UCALLEDIT, Inc. (Totalis operator)?

## Suspicious content
None observed. (The parked page includes an HTML comment about sending the referrer to attribute visits to the parked TLD; it is parking-lander boilerplate, not an instruction aimed at an agent.)

## Sources
- https://predictionindex.xyz/ecosystem (H, 2026-10-19)
- `docs/research/fixtures/linking/pop_prediction_index_projects_2026-10-18.json` (H, local fixture)
- DNS/HTTP probes of app.calledit.ai, calledit.ai, www.calledit.ai, calledit.io, calledit.fun (H, 2026-10-19)
- https://api.llama.fi/protocols (H, 2026-10-19, no CalledIt entry)
- GitHub repository search results for "calledit" (L, descriptions only)
- https://x.com/CalledIt_AI (HTTP 402, unreadable)
- `docs/research/venues/totalis.md` (H, local note, for the UCALLEDIT, Inc. mention)
