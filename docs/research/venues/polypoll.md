# PolyPoll (polypoll.org) - venue spec

Researched 2026-10-19. Verdict: **skip**. The frontend is still served but both backends are suspended by their owner, no docs or public API exist, and the venue is a small LSMR (AMM) social-market app with no evidence of liquidity.

Tags: H = read first-hand this session, M = inferred/secondary, L = weak.

## Liveness
- polypoll.org and app.polypoll.org serve the same SPA, HTTP 200, last-modified 2026-10-19 (so the frontend is being redeployed/served today). H. https://polypoll.org/
- Backend `https://polypoll-backend-frg4.onrender.com` and paper-trading backend `https://poly-poll-paper-trading-backend.onrender.com` both return HTTP 503 with header `x-render-routing: suspend-by-user` and body "This service has been suspended by its owner." on 2026-10-19. H. Sample: fixtures/polypoll/backend-503-suspended.html
- So the app cannot load markets or prices server-side today; listing as "live" on predictionindex.xyz is stale or only reflects the static site. H for suspension, M for the inference "effectively dead".
- docs.polypoll.org: Vercel DEPLOYMENT_NOT_FOUND. H. No docs found anywhere.
- X account @0xpolypoll: fetch returned HTTP 402 (x.com paywall); not followed. NOT FOUND (could not read posts). WebSearch budget was exhausted this session so no news/volume search was possible.

## Kind and market model
- Site tagline: "Launch bets, earn money by filming street interviews to back your markets, and watch the crowd price them in real time." Manifest: "Create prediction markets instantly from any news. Fund what you believe, and earn rewards. Early funders always win." H. https://polypoll.org/ , https://polypoll.org/manifest.json
- Mechanism per bundle code (app JS `index-O9L5uXjo.js`): "LSMR" (logarithmic market scoring rule) automated market maker. Endpoints `/api/v1/markets-lsmr/...`, `/api/v1/paper-lsmr/...`; contract ABI has `createMarket(..., _bettingCloseTime, _eventTime, _resolutionDeadline, string[] _optionTitles)` so markets are multi-option (categorical), user-created. "Premarkets" phase where users commit funds before the market opens (`pre-market/{id}/committers`, `leaning`), plus content bounties for video interviews. Yes % clamped to 20-80 at creation (`MIN_YES_PERCENTAGE:20, MAX_YES_PERCENTAGE:80`). M (read from minified client code, not docs).
- predictionindex.xyz lists outcome types "binary, scalar, data analysis", chain "Polygon", volume "n/a", no mechanism/description. H (as a listing), but chain claim contradicted below. https://predictionindex.xyz/ecosystem
- A paper-trading variant ("paper-lsmr") exists alongside real-money; not relevant for aggregation. M.

## Chains and collateral
- Client code configures USDC at Base `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` as the default `USDC`, links to basescan.org/tx, uses base.org RPCs, and the HTML has a Base mini-app (Farcaster frame) embed. Many other chains are wired in generically (wagmi/Privy) incl. Polygon, PulseChain (PLS/USDC "libertyswap" swap routes). Current LSMR contracts (env default): markets `0xF2A746C157B6cf8e84bd7643E2ddbBfE2BAb28Da`, premarkets `0x5214118F1F03Afb2310Ec2f8ccfEbB97e0C2b402`; many earlier versions (some marked "BUGGY") listed. I did not verify the chain of these addresses on an explorer (no RPC POST allowed). M: **Base + USDC is the likely primary deployment, not Polygon.** The PI "Polygon" tag is probably wrong or refers to the unrelated GitHub repo CrazzyPhoton/PolyPoll.
- Wallets: Privy embedded wallets plus external wallets; Coinbase paymaster key var present (gas sponsorship). M.

## Read API
- No official/public API documented. Undocumented backend routes seen in the client bundle: `GET /api/v1/markets-lsmr/indexed/markets`, `/market/{id}`, `/market/{id}/prices`, `/market/{id}/all-prices`, `/pre-market/{id}`, `/api/database/markets`, `/markets/trending`, `/bets/market/{id}`; `/api/admin/*` (auth). All currently 503 (suspended). Classification: unofficial-only, currently dead. M/H as above.
- On-chain reads of the LSMR contract (`weightedSharesByUser` etc.) are possible in principle, but chain/address were unverified.
- Rate limits / websocket: NOT FOUND (searched: site, bundle strings).

## Trade path
- Browser app calls contract functions directly via the user's wallet (Privy/wagmi) after server quote endpoints (`quote-buy`/`quote-sell` exist only for paper trading). No order book, no signed-order API. An EVM wallet (e.g. PayBox on Base) could in principle send transaction proposals (USDC approve + contract buy) if the ABI is taken from a verified explorer entry, but with the backend down and no docs this is not a supportable integration. M.

## Fees
NOT FOUND (searched: site, bundle strings for fee constants; no docs). Do not assume.

## Resolution
- Contract exposes `_resolutionDeadline`; legacy `OPENORACLE_LEGACY` contract address in config hints at an oracle-based resolution at some stage; admin/creator `.../resolve` endpoint exists for paper markets. Actual mechanism for current markets unknown. High dispute risk (user-created markets, creator/admin-driven resolution likely). L/M.

## Geo / ToS / automation
NOT FOUND (no ToS page located; robots.txt allows all crawlers; `access-control-allow-origin: *` on static site). H for robots.

## Liquidity
NOT FOUND. predictionindex.xyz volume "n/a" (H, 2026-10-19). No TVL/OI source found. Treat as negligible.

## Event overlap / arbitrage
User-generated news/opinion markets (clamped 20-80% starting probability); little overlap with sports/politics/crypto/macro venues by design, and no price feed available. Signal value: none right now.

## Independent liquidity?
Self-contained AMM, so independent of other venues, but empty/unknown depth.

## Adapter priority
skip. Reasons: backends suspended, no docs/API, chain unverified (Base vs Polygon), no liquidity evidence, user-created long-tail markets. Revisit only if backend returns or a verified-contract indexer shows meaningful volume.

## Suspicious content
None found in fetched content. (Bundle contains a third-party Alchemy RPC URL with an embedded key; deliberately not copied here.)

## Sources
- https://polypoll.org/ (HTML, manifest.json, robots.txt, bundle /assets/index-O9L5uXjo.js) - H
- https://app.polypoll.org/ (same SPA) - H
- https://polypoll-backend-frg4.onrender.com/... and https://poly-poll-paper-trading-backend.onrender.com/... (503 suspended) - H
- https://docs.polypoll.org/ (Vercel 404) - H
- https://predictionindex.xyz/ecosystem - H (listing only)
- https://x.com/0xpolypoll - HTTP 402, not read
- GitHub repo search "polypoll": CrazzyPhoton/PolyPoll (Polygon poll app, last push 2025-09), YuxiangJiangCT/polypoll-public (Flow, 2026-03). Unrelated name collisions, not confirmed as this venue. L.
