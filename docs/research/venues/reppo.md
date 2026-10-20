# Reppo (reppo.xyz / reppo.ai) - venue spec

Researched 2026-10-19. Tags: H = read first-hand in a primary source this session, M = secondary/inferred, L = weak/stale.

## Verdict

Not a prediction market in the sense an arbitrage scanner needs. Skip as a trading venue (adapter_priority = skip). Reppo is a live AI training-data curation protocol on Base. It describes itself with "prediction market" language, but the thing being staked on is data/content quality, not real-world event outcomes. DefiLlama's "Prediction Market" category is a mis-categorisation for our purposes. [H]

One tangential point: a Reppo datanet hosts an AI-agent "ArAIstotle" that publishes probability estimates on Polymarket markets as pods. That is derived, third-party signal data, not Reppo liquidity. See "Signal-only angle". [H]

## Still live?

Yes. [H]
- Public pods API returned pods updated 2026-10-19 (today), pod validity epoch 166-169. https://reppo.ai/api/v1/public/pods
- GitHub Reppo-Labs: docs pushed 2026-10-16, orquestra 2026-09-18, reppo-cli 2026-08-12 (gh api orgs/Reppo-Labs/repos).
- DefiLlama listing id 7809, listedAt 2026-05-08, Base, category "Prediction Market" (https://api.llama.fi/protocols).

## Kind and market model

- Kind: AI/physical-AI training-data protocol with stake-weighted curation ("stake-assured human feedback"). Not an event-outcome market. [H] https://docs.reppo.ai/concepts/votes-curation.md , https://docs.reppo.ai/concepts/how-reppo-works.md
- Structure: "datanets" (domain markets, permissionless to create) contain "pods" (NFT content units). Voters lock REPPO for veREPPO, then allocate voting power for or against pods in 48-hour epochs. Voting power decays linearly through the epoch. Net tallies decide emissions to publishers and curation scores to voters. [H]
- Not binary/categorical/scalar event contracts, no order book, no AMM, no outcome tokens. Positions are veREPPO vote allocations on content. Pods are ERC-721-style NFTs (tokenId). [H]
- The homepage UI shows YES/NO staked amounts with a closing time, and calls Datanets "prediction markets" in marketing copy. Mechanics beyond that are not explained there. [H] https://reppo.xyz/
- A newer "Evaluation API" product (eval.reppo.xyz) has AI judges score agent output; settlement windows 10/15/30 minutes. This is an evaluation service, not a tradable market. [H] https://reppo.xyz/evaluation-api

## Chains and collateral

- Base (chainId 8453) mainnet is the primary chain. REPPO token on Base: 0xFf8104251E7761163faC3211eF5583FB3F8583d6 (public token address from DefiLlama). [H] https://api.llama.fi/protocols
- Robinhood Chain (chainId 4663) variant exists: fees paid in each datanet's own token, no staking, voting power mirrored from Base veREPPO. [H] https://github.com/Reppo-Labs/reppo-cli README
- Collateral: REPPO (lock for veREPPO), USDC or datanet-native ERC-20 for publishing/access fees (V2). [H] https://docs.reppo.ai/tokenomics/revenue-model.md
- Contract names from the CLI: PodManager V2, SubnetManager, veReppo (`veReppo.currentEpoch()`). Epoch length about 48h (172800 s). [H]

## Read API

Exists: partially official-public, partially authenticated. Documented but not a market-data API for outcomes.

- Docs: https://docs.reppo.ai (index: https://docs.reppo.ai/llms.txt , quickstart: https://docs.reppo.ai/quickstart.md). [H]
- Base URLs: https://reppo.ai/api/v1 (Platform API; Privy session cookie for authed routes); https://api.reppo.xyz (Agent/Chat API; wallet nonce + EIP-191 personal_sign flow, Bearer token 24h per CLI README); https://eval.reppo.xyz/api/v1/agents/eval-requests/ (Evaluation API, Bearer API key). [H]
- Public unauthenticated, confirmed live: `GET https://reppo.ai/api/v1/public/pods?page=&limit=&search=&filters[currentEpoch]=&filters[subnet]=` returns `{data:{pods:[{id,name,description,tokenId,privateSubnetId,url,creator{...,isAgent},createdAt,updatedAt,podValidityEpoch,chainId,cumulativeUpVotesVolume,cumulativeDownVotesVolume,isABTest,isEvalRequest}]}}`. [H] Fixture: docs/research/fixtures/reppo/public-pods-limit2.json (HTTP 200, 2026-10-19).
- Docs claim `GET https://reppo.ai/api/v1/stats` is public. NOT confirmed: returned HTTP 404 (HTML) on 2026-10-19. `https://api.reppo.xyz/stats` and `/api/v1/stats` also 404. Docs are stale on this point or the route moved. [H]
- CLI says `reppo list datanets` hits a public endpoint (path not read); not probed. On-chain reads via Base RPC (balances, voting power, epoch, pod owner). [H]
- No order book, price, trade-tape or resolution endpoints exist (there is nothing to price). Rate limits: NOT FOUND (searched: docs quickstart, authentication page, CLI README; CLI notes the public Base RPC rate-limits). Websocket: NOT FOUND.
- Web search budget was exhausted this session, so independent third-party coverage was not checked.

## Trade path

- On-chain via PodManager/veReppo on Base (lock, vote, mint-pod, claim-emissions, grant-access). Official CLI `@reppo/cli` v0.4.0 (npm) with `--json`, `--dry-run`, idempotency keys; needs a raw private key env var (REPPO_PRIVATE_KEY), which is not PayBox-compatible; the contract calls themselves are ordinary EOA transactions. [H] https://github.com/Reppo-Labs/reppo-cli
- Agent API: `POST /agents/{id}/pods`, `register-agent` returns apiKey. Pod minting then metadata publishing. [H]
- No signed-order model, no CLOB, no off-chain matching. Nothing resembling "buy YES at 0.40". [H]

## PayBox reachability

paybox_reachable: partial, but irrelevant. A Base EVM wallet could in principle submit plain contract-call transaction proposals (approve REPPO, lock, vote) since the CLI shows these are standard ERC-20 + contract calls. [M, inferred from CLI description; ABIs not read]. There is nothing worth trading from an arbitrage standpoint: voting is not a hedgeable position, and locks are time-locked (lock duration up to unknown max; NOT FOUND).

## Fees

- Publishing fee per pod (set per datanet, REPPO/USDC/native token); access fees; datanet spin-up requires 20k REPPO lock (50% stays locked, 50% to network); 15% emissions tax when seeding with a native token; Performance Pool funded by 50% of spin-up fees + 10% of publishing + 10% of access fees, distributed 5% every third epoch, split 80% stakers / 20% datanet owners (governance-adjustable). [H] https://docs.reppo.ai/tokenomics/revenue-model.md
- Evaluation API: 10 free evals, then $0.01/eval prepaid by card ($1 min), described as introductory. [H] https://reppo.xyz/evaluation-api
- No taker/maker fee formula (no order matching).

## Resolution and dispute risk

No external-event resolution. Outcome = net vote tally at epoch close (stake-weighted, time-decayed). Disputes are handled by adversarial opposing votes in-protocol. Manipulation risk is by design a capital contest. [H] https://docs.reppo.ai/concepts/votes-curation.md , https://docs.reppo.ai/trust-security/adversarial-robustness.md. Not an oracle of real-world events.

## Geo / ToS / automation

NOT FOUND (searched: homepage, docs index, evaluation-api page; no ToS or geo restriction page read). Automation is explicitly encouraged for agents (CLI "built for AI agents", Orquestra node, agent API). [H]

## Liquidity

- DefiLlama: TVL = REPPO staked in VeREPPO about $1.45M ("staking" series), mcap about $5.07M, fetched 2026-10-19 from https://api.llama.fi/protocols . Plain TVL 0. [H]
- Pod vote volumes are in REPPO-denominated vote units (e.g. 8,779,112 cumulative up-vote volume on a data pod; unit and USD value not documented). [H, units M]
- Docs quickstart sample stats (totalReppoLocked 830k, price $0.043) are illustrative and dated 2026-04; the real endpoint did not respond. [L]

## Event-category overlap and shared liquidity

- None as a trading venue: no sports, politics, crypto-price or macro contracts. Datanet topics are data domains (code review, medical reasoning, physical-AI teleop, finance, consumer behavioural data). [H]
- Shares no liquidity with other prediction venues. It is simply not an arbitrage leg.

## Signal-only angle (low value)

A pod from the "[AGENT] ArAIstotle Insight Agent" (pod id cmveihv8r0000lb06nhd41crw, created 2026-10-19) names a Polymarket-style market ("US-Iran ceasefire continues through the midterms?") with `ArAIstotle YES 0.2505 | mkt 0.795 | market_overpricing_yes`, linking to araistotle.facticity.ai. This is a third-party model's probability estimate published into a Reppo datanet. If wanted, the public pods endpoint filtered by `filters[subnet]=cmpw4j3vx0001jl04rqpa1d8c` could be scraped as an alternative feed, but the provider (ArAIstotle/facticity.ai) should be evaluated directly instead. Estimate quality unverified. [H on existence, L on usefulness]

## Suspicious content

- The pods API returns arbitrary user-submitted text and URLs (e.g. Google Sheets link, utm-tagged URLs). Treated as untrusted data; no AI-targeted instructions seen in the two samples. The ArAIstotle pod description is long free text with embedded citations; nothing instructing an AI agent.
- reppo.ai returned a robots.txt-like body for `/api/v1/stats` mentioning "roobet.com/sitemap.xml" (observed in the same curl, status 404). Odd cross-site content; unexplained, flagged only. [H]

## Not found

- Rate limits, websocket, ToS/geo rules, contract ABIs/addresses beyond the token (searched: docs index, quickstart, CLI README, DefiLlama).
- Independent 2026 news coverage (web search budget exhausted).
- Working `/api/v1/stats`.

## Sources

- https://reppo.xyz/ [H]
- https://reppo.xyz/evaluation-api [H]
- https://docs.reppo.ai (llms.txt, introduction, quickstart, concepts/how-reppo-works, concepts/votes-curation, concepts/datanets, tokenomics/revenue-model) [H]
- https://reppo.ai/api/v1/public/pods (live GET, 2026-10-19) [H]
- https://api.llama.fi/protocols (Reppo entry, id 7809) [H]
- https://github.com/Reppo-Labs/reppo-cli (README, repo list via gh api) [H]
- GitHub org listing Reppo-Labs via `gh api orgs/Reppo-Labs/repos` [H]

PRIVACY check: requests used only User-Agent insurance-markets-research/0.1; fixture contains public third-party usernames/handles from the API response (no user identifiers of ours).
