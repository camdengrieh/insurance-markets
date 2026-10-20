# wambo.fun - venue spec for the aggregator / arbitrage scanner

Researched 2026-10-19. Read-only: unauthenticated GETs (curl, UA `insurance-markets-research/0.1`), DefiLlama public API, `gh api` for the DefiLlama-Adapters PRs, WebFetch for docs pages. No account, wallet, key or signature; no POST; no PayBox money or signing tools. WebSearch was used twice, then the session search budget ran out; no further searching was done.

Confidence tags: H = read first-hand in a primary source this session; M = secondary or inferred; L = weak or stale.

## Verdict

- Adapter priority: **skip**.
- **The venue appears dead or abandoned.** Its website returns Vercel `DEPLOYMENT_NOT_FOUND` on `wambo.fun`, `www.wambo.fun` and `wambo-fun.vercel.app` (H, curl 2026-10-19; fixture `site_probe_2026-10-19.txt`). DefiLlama flags it `deadUrl: true` (H). Daily DefiLlama TVL is $0 on all 69 data points from 2026-08-12 to 2026-10-18 (H). No docs, API, repo or developer page exists (NOT FOUND, see below).
- Even if it were live it would not be an arbitrage leg: the product is a 10-minute five-memecoin race (parimutuel, one winner), not a binary event market. It does not overlap sports, politics, macro or ordinary crypto price markets. Gambling-adjacent, as the hint says.
- Only residual value: none for the scanner. Optionally keep the contract address below on a watch list in case the venue is redeployed.

## Liveness (still live in 2026?)

- Launch: DefiLlama listing PR says "launched on mainnet 2026-08-12 and races run every ~12 minutes" (M: operator-authored, AI-assisted PR text, https://github.com/DefiLlama/DefiLlama-Adapters/pull/20466). DefiLlama `listedAt` = 1786557105 = 2026-08-12T17:51Z (H).
- Frontend: `https://wambo.fun/`, `https://www.wambo.fun/`, `https://wambo-fun.vercel.app/` all return HTTP 404 with header `x-vercel-error: DEPLOYMENT_NOT_FOUND` (H). The apex resolves to a Vercel IP, so the domain is still pointed at Vercel but no deployment is attached. `app.`, `api.` and `docs.` subdomains do not resolve (H, dig). Caveat: this proves the web UI is gone, not that the contract is empty or that races stopped; the chain state could not be read (see Open questions).
- DefiLlama: `deadUrl: true`, `url: ""` (empty), `tvl 0`, `currentChainTvls {"Robinhood Chain": 0}`; snapshot 2026-10-18T23:38Z (H, https://api.llama.fi/protocol/wambo.fun). The same flag is in the repo's prior registry snapshot `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` (H).
- No DefiLlama dimension data: `/summary/dexs|fees|open-interest/wambo.fun` all return 400 "not found" (H). So no published volume, fees or OI.
- X account `@Wambofun` (named in the DefiLlama listing). Not readable: WebFetch of `https://x.com/Wambofun` returned HTTP 402 from the fetch tool itself (not a venue payment requirement; not pursued). Last activity date NOT FOUND.
- Independent coverage: none found. A web search (extended) surfaced only the DefiLlama page for wambo.fun; Fortune/CoinDesk/Yahoo coverage of Robinhood Chain memecoins does not mention it (WebFetch of CoinDesk 2026-09-03 article: no wambo mention) (H for the null result on that article, M overall).
- Chain-level context: Robinhood Chain memecoin trading spiked in July-September 2026 and then fell sharply (Fortune headline 2026-10-06: "$443 million memecoin frenzy dissolves into nothing") (M, headline only). The product's demand depends on that activity.

## Kind and market model

- Kind: **parimutuel pool betting, single-winner race**, on-chain (M: DefiLlama description is the only source).
- Per DefiLlama: "five memecoins race for ten minutes, scored by Uniswap v3 TWAP, and backers of the winner split everyone else's stake. Settlement is fully on-chain via the RaceBook contract." (H that the text exists at https://api.llama.fi/protocol/wambo.fun; M that it is accurate, since it comes from the operator's listing request.)
- Categorical (5 outcomes), pool-based. Not an order book, not an AMM; there is no price, only pool shares, so implied odds are pool ratios at close. How a stake on a memecoin is recorded (mapping vs. token) is NOT FOUND (searched: DefiLlama, GitHub code and repo search, site). Outcomes are almost certainly not tokenised (no ERC-1155/ERC-20 mentioned) (L).
- Scoring metric (absolute TWAP price vs. percent change over the 10 minutes), how the five coins are chosen, TWAP window, tie handling and refund conditions: NOT FOUND. Methodology line mentions "refunds" and "the pot rolling into the next race", so a refund path and a rollover exist (H text, semantics unknown).

## Chains and collateral

- Chain: Robinhood Chain mainnet, chain ID 4663, an Arbitrum-stack L2 on Ethereum with ETH as gas; explorer `robinhoodchain.blockscout.com` (H, https://docs.robinhood.com/chain/connecting/ ... fetched page lists Chain ID 4663 mainnet / 46630 testnet).
- Collateral: **native ETH** (H: DefiLlama methodology "native ETH held by the RaceBook contract"; adapter reads `ADDRESSES.null`).
- Contract: RaceBook `0x6a8196b02d94e96366ace6f494fc46eae3c35e31` on chain 4663 (H: appears in the DefiLlama adapter PR #20466 and the merged registry entry in PR #20469; this is a public protocol contract, not a user address). Explorer page title confirms an address page exists for it (H, WebFetch title only). Contract verification status, ABI, owner, creation tx and balance: NOT FOUND (Blockscout API is behind a Cloudflare challenge; I did not bypass it).

## Read API

- `exists`: **none**. No docs site, no OpenAPI, no GitHub repo, no developer page (NOT FOUND, searched: DefiLlama listing, `docs.wambo.fun`/`api.wambo.fun`/`app.wambo.fun` DNS, `/llms.txt` and `/robots.txt` and `/sitemap.xml` on the apex (all DEPLOYMENT_NOT_FOUND), GitHub repo search for `wambo`, `RaceBook`, GitHub code search for the contract address and for "RaceBook memecoin race TWAP" (0 hits)).
- The only machine-readable data is on-chain: RaceBook state and events on chain 4663. Without the ABI or verified source, an event decoder cannot be written from what is documented. Subgraph/indexer: NOT FOUND.
- Rate limits, websocket: n/a. Robinhood Chain public RPC and sequencer feed are rate-limited; the docs recommend Alchemy and other providers for production (H, https://docs.robinhood.com/chain/connecting/).
- Fixtures saved (all small, from DefiLlama / GitHub / the site's own 404):
  - `docs/research/fixtures/wambo-fun/defillama_protocol_wambo-fun_2026-10-19.json` (DefiLlama protocol record with 69 daily TVL points, all 0, `deadUrl: true`)
  - `docs/research/fixtures/wambo-fun/site_probe_2026-10-19.txt` (Vercel DEPLOYMENT_NOT_FOUND headers and DNS)
  - `docs/research/fixtures/wambo-fun/defillama_registry_pr20469_patch_2026-10-19.json` (merged registry entry naming the RaceBook address)
  - `docs/research/fixtures/wambo-fun/defillama_pr20466_listing_request_2026-10-19.json` (listing request text)

## Trade path

- Programmatic order placement via an API: **none**. There is no order book to sign orders against.
- The only conceivable path is a direct on-chain transaction to RaceBook (sending native ETH with a race and outcome selector) and a later claim transaction. The function names, selectors and race-id scheme are NOT FOUND, so this cannot be specified. Do not guess selectors.

## PayBox reachability

- `paybox_reachable`: **partial** (theoretically), practically **no**.
- PayBox's chain catalog lists Robinhood (4663) (H: repo note `docs/research/06-paybox-platform.md`, live `discover_tokens` 2026-10-19, with the caveat that the catalog is "not a support allowlist"). A PayBox EVM wallet could in principle propose a native-ETH transaction to RaceBook on 4663. That would need the verified ABI, a working race-state read, and a live venue; none of these exist now. Not tested (no signing tools used).

## Fees

- Documented: an "accrued rake" is held in the contract (H, DefiLlama methodology). Rake percentage, who pays it, and whether it is skimmed from the losing pool or the total: NOT FOUND. Gas on Robinhood Chain is paid by the bettor in ETH.

## Resolution mechanism and dispute risk

- Resolution: automatic, on-chain, from **Uniswap v3 TWAP** of the five tokens at the end of the 10-minute race (M, DefiLlama description). No human resolver or dispute window is documented.
- Risks (analysis, L): TWAP-based scoring on newly launched memecoin pools is cheap to manipulate (thin liquidity, short 10-minute window, same-chain sequencer with first-come ordering); no audit is listed (`audits: "0"` on DefiLlama, H). Contract admin powers (pause, rake change, sweeping rollover) are NOT FOUND.

## Geo, ToS, automation

- NOT FOUND (searched: site down, no docs, no ToS page reachable). Parimutuel betting on random-ish outcomes is likely treated as gambling in many jurisdictions (L, analysis). No automation rule can be quoted.

## Liquidity

- TVL: $0 on every daily point 2026-08-12 to 2026-10-18; `currentChainTvls` 0 at 2026-10-18T23:38Z (H, https://api.llama.fi/protocol/wambo.fun). The listing PR explained zero TVL as expected "between stakes" because the balance is near zero between races (M); a continuous $0 across 69 daily snapshots plus a dead website is not consistent with meaningful activity.
- Volume, OI, fees: none published (DefiLlama dimension endpoints 400). Participant counts: NOT FOUND.

## Event coverage and overlap

- Categories: crypto memecoin relative performance over 10 minutes (five tokens on Robinhood Chain). Overlap with other venues: **none** found. No venue in this project lists "which of these five memecoins wins this 10-minute race". Nothing to arbitrage against; at most a crude signal source for short-horizon memecoin momentum, which is not a Quotient-style signal.
- Shares liquidity with another venue: no (its own contract pool), but the point is moot given zero liquidity.

## Suspicious content

- None found in fetched pages. The DefiLlama PR body contains a promotional footer ("Generated with Claude Code") which is not an instruction. The CodeRabbit auto-comment in PR #20466 is formatting noise. Nothing aimed at AI agents.

## Open questions

- Is RaceBook still holding funds or emitting events? Needs a chain-4663 read (Blockscout API is Cloudflare-gated; a public RPC read needs a JSON-RPC POST, which this research round did not do; a later round permitted to make JSON-RPC reads can check `eth_getBalance`, `eth_getCode` and recent logs on the address above).
- Was the site intentionally shut down, or is the Vercel project merely unlinked? No operator statement found; the X account was not readable.
- Scoring rule, rake rate and ABI: undocumented.

## Sources

- DefiLlama protocol API, fetched 2026-10-19: https://api.llama.fi/protocol/wambo.fun (H); human page https://defillama.com/protocol/wambo.fun (WebFetch got HTTP 403; the API gives the same record).
- DefiLlama TVL endpoint: https://api.llama.fi/tvl/wambo.fun returned `0` (H). Dimension endpoints `/summary/{dexs,fees,open-interest}/wambo.fun` returned 400 not found (H).
- DefiLlama-Adapters PR #20466 (listing request, closed): https://github.com/DefiLlama/DefiLlama-Adapters/pull/20466 (H for the text; M for its accuracy, operator-authored).
- DefiLlama-Adapters PR #20469 (merged 2026-08-12, adds the registry entry with the RaceBook owner address): https://github.com/DefiLlama/DefiLlama-Adapters/pull/20469 (H).
- Site probes: https://wambo.fun/ , https://www.wambo.fun/ , https://wambo-fun.vercel.app/ (all Vercel DEPLOYMENT_NOT_FOUND, 2026-10-19) (H).
- Robinhood Chain network details: https://docs.robinhood.com/chain/connecting/ (H for chain ID 4663, explorer, rate-limited public RPC); https://docs.robinhood.com/chain/ (H).
- Explorer address page title only: https://robinhoodchain.blockscout.com/address/0x6a8196b02d94e96366ace6f494fc46eae3c35e31 (H that the page exists; contents not retrievable).
- Context (headline level, M): https://fortune.com/2026/10/06/443-million-memecoin-frenzy-robinhood-circle-latest-memecoin-boom-bust/ , https://www.coindesk.com/tech/2026/09/03/a-memecoin-making-app-becomes-crypto-s-top-fee-generators-as-robinhood-chain-activity-explodes (no wambo mention).
- Repo cross-reference: `docs/research/06-paybox-platform.md` (PayBox chain catalog includes Robinhood 4663); `docs/research/fixtures/linking/pop_defillama_prediction_registry_2026-10-18.json` (wambo.fun row with `deadUrl`).
- Not accessible: https://x.com/Wambofun (HTTP 402 from the fetch tool), Blockscout API (Cloudflare challenge, not bypassed).
