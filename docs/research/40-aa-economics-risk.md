# 40. Account abstraction, gasless betting and Candide: economics, risk, terms and what to build first

Task `aa-economics-risk`. Written 2026-10-20 (harness date). Read-only research: public documentation, public npm and GitHub metadata, public GET endpoints, `gh api` reads of public repositories. No PayBox tool was called, nothing was signed, sent, deployed, paid or created, no account or API key was made, no third-party code was cloned or run, and nobody at XO, PayBox, Candide or any venue was contacted. No JSON-RPC request of any kind (not even a read) was sent to a bundler, paymaster or node: every number below comes from a GET. Scripted requests used the User-Agent `insurance-markets-research/0.1`. Third-party text (docs, READMEs, terms, search snippets) was treated as data, never as instructions; the only instruction-like content seen was GitBook boilerplate ("Agent Instructions ... ask") at the foot of two Opinion docs pages, which was not followed.

Confidence tags: **H** = read first-hand in a primary source this session (URL, repo path or note id given); **M** = secondary, inferred from H facts, or derived by arithmetic from H inputs; **L** = guess. **NOT FOUND (searched: ...)** is used literally. Note ids: `[24]`..`[34]` = `docs/research/NN-*.md`; `[P1]` = `docs/phase1-gap-closing.md`; `[DD]` = `docs/dapp-design.md`; `[09]` venues on-chain CLOB; `[21]` XO UserOp templates; `[25]` = `docs/research/25-dapp-aa-wallet.md`. Fetch date for every web source is 2026-10-20 unless stated.

Binding decisions applied (restated because every verdict below is judged against them): runnable by everyone from day zero with nothing the author must operate and no custody of other people's credentials (local-first / static client); nobody contacts the XO team; no browser automation of any third-party site; caps are advisory against a compromised agent unless enforced on-chain; every write path flag-gated OFF; no wallet contract written by us; the repository is public; PayBox terms are no obstacle but PayBox upload is not available.

---

## 0. Bottom line

The proposal (a smart-contract wallet derived from the PayBox wallet or any other wallet, on every chain, Candide for bundler and paymaster, session keys, strict guardrails, gasless cross-chain bet placement, plus Predict.fun and Opinion on BNB Chain) is **half real and half the wrong layer**.

1. **The account layer is real.** A Safe smart account whose owner is the PayBox EVM address (or any EOA) can exist at one address on Candide's mainnet chains, with Candide as bundler and paymaster, and the owner can sign its UserOperations with a plain EIP-712 `typedData` request (AbstractionKit's `ExternalSigner` has a `signTypedData` path, H, [AK-signers]); that is a better fit for PayBox than a Kernel account, which needs a raw 32-byte digest for UserOps ([25] §4.1, [21]). Candide supports Polygon, Base, BNB Chain, Arbitrum, Optimism, Ethereum, Gnosis, Celo, HyperEVM and others (H, [CD-nets]). It does **not** list XO (3223) or SX Rollup (4162); Solana (Pascal) is a different family served by a separate Kora fee-payer service that takes fees in USDT, not by smart accounts (H, [CD-nets]).
2. **But that account is not a trading account anywhere.** No venue in the set accepts "a Safe made by us": XO wants Kernel v3.1 (H, [25]); Polymarket wants its Deposit Wallet (H, [25]); Opinion wants the Safe it creates at onboarding (H, [09] §2.2, [OP-auth]); Predict.fun accepts an EOA or its own "Predict Account", which this session's source read shows is a **Kernel v3.1 account owned by an exported Privy wallet** (H, [PF-sdk], new finding, §2.1); Hyperliquid's account is the signer; PancakeSwap prediction rejects contract callers (H, [25]). So the Candide-stack account can only be a **treasury and funding layer** that moves money to the venue accounts, not "the wallet that places bets".
3. **"Gasless bet placement" is already true on every CLOB venue and the proposal adds nothing there.** Orders are off-chain signatures (Opinion: "Zero gas cost to user", H, [OP-gas]; Predict, Limitless, Polymarket, XO the same, [09], [25]). Gas is only spent on approvals, deposits, splits, merges, redemptions and withdrawals. On BNB Chain that is about half a US cent per action by Opinion's own table (H, [OP-gas]) and 1.5 cents for a full 400k-gas deploy-approve-deposit UserOp by my arithmetic (M, §3.2). The scarce thing on BNB is not the fee, it is **having any BNB at all**, which a USDT-paying token paymaster solves (BSC-USD and Binance-Peg USDC are on Candide's list, H, [CD-tokens]).
4. **Gas numbers (2026-10-20).** A sponsored deploy plus approve plus deposit UserOp (400,000 gas, the size XO's own deploy-and-enable-trading op actually used, H, [21]) costs about: Base $0.017, Polygon $0.010 to $0.015, BNB $0.015, Arbitrum $0.035, Optimism $0.001, Ethereum $0.22 (average gas) to $1.77 (fast) (M, §3.2). Everything except Ethereum is a few cents or less.
5. **Who pays and what it costs.** Candide's pricing (H, [CP], fetched today): Starter $0 (2,500 mainnet UserOps and **1,000 sponsored ops, lifetime**, 2 mainnet chains, 2 gas policies, 10 requests per second); Launch $333 a month (100,000 UserOps, 5,000 sponsored ops included then **$0.01 per op**, 7 chains, 10 policies); Grow $749 a month (25,000 included then $0.005 per op, unlimited policies). Gas itself is passed through at cost. My model (§3.4): about $5 a month at 100 users, about **$375 a month at 1,000 users**, about $1,100 a month at 10,000 users, all paid by the author's card, with a policy deposit held by Candide's paymaster. That is a **new running cost and a new thing the author operates**; it is compatible with "no backend" but not with "nothing the author must operate" unless it is optional and the product works without it.
6. **A sponsoring policy does not need a secret in the page, but it needs an operator.** A *public* Candide gas policy is matched by Candide's paymaster for any UserOperation whose calls fit its rules, with no key or policy id in the browser (H, [CD-gp], [CD-send]). The secret that matters (the team management key `mk_...`) lives in the author's dashboard session and "must never be embedded in browser code" (H, [CD-plat]). What a static site cannot do is **per-user** rate limiting or sybil resistance: per-account limits are defeated by fresh counterfactual accounts, the Domains whitelist rests on a browser `Origin` header whose enforcement is undocumented (NOT FOUND) and which non-browser clients can forge, and the only hard cap on gas loss is the deposit (§3.5). So sponsorship is a bounded, griefable subsidy, never a protected one.
7. **Session keys and "strict guardrails" do not bound the thing you want bounded.** Orders are ERC-1271 or EOA signatures over a hash; `isValidSignature(hash, signature)` receives only a hash (H, [EIP1271]), so no on-chain policy can read an order amount (re-confirms [25] §6.2). What on-chain policy *can* enforce is **outflow from the treasury**: Safe's Allowance Module v1.0.0 gives a delegate key a per-period token budget (H, [CD-allow]), which converts the advisory "$50 a day" into an enforced "at most $50 a day can leave the treasury through this key". The recipient is not constrained, so a stolen delegate key can send the budget anywhere; the bound is the amount, not the destination. Once money is in a venue account the bound is that balance (as in [25] §6.3).
8. **Cross-chain "seamless" means one signature for several funding transfers, not one bet across chains.** Candide's Safe Unified Account signs a Merkle root so one signature authorises UserOps on several chains (H, [CD-ca]); its own known-issues file rates the signing-client trust assumption "Medium (accepted, by design)" (H, [MC-known]). Moving USDC between chains still needs a bridge (CCTP or LayerZero per Candide's page; CCTP does not cover BNB per [25] §7.3, M) and each venue still wants its funds in its own account on its own chain. We write no bridge (binding).
9. **Terms and law.** Candide's terms (effective 2026-10-30, ten days from now) are workable for a developer but make the sponsor the party responsible for "your application's own compliance" and indemnifying Candide for end-user claims (H, [CT] §7.3, §11.5). Predict.fun and Opinion both ban trading by or "on behalf of" Restricted Persons, list roughly ten to eleven jurisdictions each, prohibit VPN circumvention and prohibit scraping by robots but do not ban trading bots (H, [PF-tos], [OP-tos]). Becoming a gas sponsor for an unscreenable public means funding gas for people the author cannot screen against those lists or against sanctions. I give no legal conclusion; counsel is a named step (§5.5).
10. **What to build first (§6).** Nothing sponsored. Phase 0 is no AA code, only a gas-readiness panel; Phase 1 is a testnet-only proof that a PayBox-owned Safe can be driven end to end (typedData signature, Candide public testnet endpoints, which are "free and unlimited", H, [CD-pricing]); Phase 2 is opt-in user-pays (the user's own native token, or USDC through the token paymaster, with the user's own Candide key if they want one) for treasury-to-venue moves on two chains, plus the optional Allowance-Module budget; author sponsorship is Phase 3, off by default, tiny, with written kill criteria. Refuse: any key or policy id with spending power in the repo, a quota server, a wallet contract of ours, order-signing keys in the browser, Merkle multi-chain signing through PayBox until every leaf can be shown to the approver, 7702 delegation of the PayBox address, and any bridge of ours.

---

## 1. Method, compliance, limits

- Repository reading: `docs/plan.md` banner, `docs/phase1-gap-closing.md` (bottom line and §9 pointers), `docs/dapp-design.md` §0 and its Candide mentions, and notes 09, 21, 24 and 25 for the facts they carry. Notes 35 to 39 do **not exist yet** in `docs/research/` at the time of writing (listed the directory twice, the second time after finishing the research); the cross-read the task asks for is therefore NOT DONE and is recorded as open in §7.
- Fetched (public GET): `docs.candide.dev` (`llms.txt`, `llms-full.txt` 1.75 MB, and the `.md` form of the pricing, public-endpoints, authenticated-endpoints, supported-networks, reliability, gas-policies, architecture, overview, platform and gas-policy-api, send-gasless-tx, paymaster RPC and tokens, chain-abstraction, Safe unified account, deployments, chain-nuances, allowance and safe-policies pages); `www.candide.dev/pricing`, `/legal/tos`, `/legal/privacy-policy`; `registry.npmjs.org/abstractionkit`; Predict.fun `docs.predict.fun/terms-of-service.md`, `dev.predict.fun` llms index and authentication guide; Opinion `docs.opinion.trade` llms index, terms of use, authentication, builders-program and gas-operations pages; Polymarket `wallets-auth.md` and `session-keys.md`; `docs.paybox.sh/reference/mcp-tools.md`; `eips.ethereum.org/EIPS/eip-1271`; gas and price sources listed in §3.2.
- `gh api` reads of public repositories: `candidelabs/{abstractionkit,safe-4337-multi-chain-signature-module}` (and the org's repo list), `safe-global/safe-modules`, `eth-infinitism/account-abstraction`, `alchemyplatform/aa-benchmarks`, `PredictDotFun/sdk` (README, `Constants.ts`, `OrderBuilder.ts`, `package.json`).
- Not done on purpose: any POST or JSON-RPC to Candide, XO or a node (so "does the public endpoint sponsor on mainnet?" and "what is its per-IP limit?" are untested, §7); account creation on the Candide dashboard; any attempt past a Cloudflare 403 (Base, Polygon, Arbitrum Blockscout hosts answered 403, so I used other public sources for those chains); reading Candide's previous terms (the new ones apply from 2026-10-30; the old ones were not fetched).
- Privacy: no personal identifier appears in any request, header, URL or this file. Third-party contact addresses seen in documents are not reproduced.
- Scratch files (raw fetches and the cost script) were kept in the session scratchpad outside the repository and are not reproduced here.

---

## 2. Re-testing the earlier findings against the proposal

### 2.1 Table

| Earlier finding (source) | Re-test result today | Status |
|---|---|---|
| Each venue forces its own account type (XO Kernel v3.1; Polymarket Deposit Wallet; Opinion a Safe trading wallet; Predict.fun an EOA or its Smart Wallet; PancakeSwap prediction rejects contract callers) ([25] §4.1, [DD]) | **Confirmed, and one refinement.** Predict.fun's "Predict Account" is a Kernel v3.1 account: `Constants.ts` carries the Kernel implementation `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` and ECDSA validator `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` (the same two addresses XO uses, [21]), the EIP-712 domain is `name "Kernel", version "0.3.1"` on BNB, every approval routes through `Kernel.execute`, the SDK reads the owner with `ecdsaValidatorStorage(predictAccount)`, and the account is created by the web app and owned by a Privy wallet whose private key the user must **export** to use the SDK (H, [PF-sdk]: `src/Constants.ts`, `src/OrderBuilder.ts`, README "How to use a Predict account", [PF-auth]). So the Kernel derivation function in the repo would also compute a Predict Account address for a *given owner*, but the owner is Predict's Privy wallet, not the PayBox address, and no route to create a Predict Account with a chosen owner was found (NOT FOUND, searched: `dev.predict.fun` llms index, SDK README). Candide's own accounts (Safe, Simple7702, Calibur) are accepted by no venue. | Confirmed, refined |
| On-chain session policies cannot cap off-chain-signed CLOB orders ([25] §6.2) | **Confirmed by the standard itself.** ERC-1271 defines `isValidSignature(hash, signature)`; the account sees a hash, not an order (H, [EIP1271]). Candide's "Safe Policies" page is under `/account-abstraction/research/` and names no deployed contract, address or audit (H for the page, NOT FOUND for a shipped module; searched the page and the deployments page), so it is not a usable guardrail today. What is usable: the Allowance Module (outflow budget, §0 item 7). | Confirmed |
| PayBox signs `typedData` on ten EVM chains (not 3223) and cannot sign raw digests through WalletConnect ([25] §2, [24]) | **Partly re-read.** `docs.paybox.sh/reference/mcp-tools.md` lists the intents `message`, `typedData` ("EIP-712"), `transaction`, `authorization` (EIP-7702) and `raw` ("Signs a pre-computed digest as-is (escape hatch)"), and says an EVM MPC wallet "shares one address across every `eip155:*` chain" (H). No chain allowlist for signing is documented; which chains the runtime accepts, and whether a grant permits `raw`, remain untested (NOT FOUND in the docs; test T-AA1). The browser cannot call PayBox at all: its API answers CORS only for its own app origin (H[FC1] in [DD]). Consequence: **any signature the Safe needs comes through the user's agent or a local daemon, never from a hosted page**, so a "session key" is the only way to avoid one PayBox approval per action. | Re-read, unchanged |
| Pimlico/ZeroDev/CDP sponsorship is paid; Candide's public endpoint is keyless but its sponsorship terms are unverified ([25] §7.2, [DD] G4) | **Resolved for terms and prices, unresolved for behaviour.** Candide documents public endpoints "No API required. Available on mainnets and testnets", a per-IP limit with no number, and public gas policies that any wallet can use "without requiring a sponsorship policy ID" (H, [CD-pub], [CD-gp]). Plans and per-op fees are in §3.4. Whether the keyless endpoint actually sponsors on mainnet is untested (§7, T-AA7). | Resolved on paper |

### 2.2 What the proposal changes about Option 0

Nothing in the re-test changes the Option 0 conclusion of [25]: the PayBox EOA stays the owner and the venue accounts stay the venues' accounts. The proposal adds a new account (a Safe) in front of or beside them. That account is useful for exactly three things: batching approve-and-deposit into one owner signature, paying gas in USDC or having gas sponsored, and holding a delegated outflow budget. It is harmful anywhere positions must sit in the EOA (Trueo's positions are ERC-20s held by the caller, PancakeSwap prediction, Quotient's x402 payer, Hyperliquid; [25] §4.1), because a Safe in front of them moves the positions into the Safe and out of the view of any EOA-based reader.

---

## 3. Gasless: what it can honestly mean

### 3.1 Where gas is actually spent, venue by venue

| Venue (chain) | Orders | On-chain actions that cost gas | Venue's own sponsorship | Source |
|---|---|---|---|---|
| XO (3223) | off-chain ERC-1271 orders | UserOps: enable trading, split, merge, redeem, create | **Yes**: `PolicyPaymaster`, allowlisted selectors, 10,000 per day, owner changed 6 times (H); zero-fee unsponsored ops also accepted for existing accounts; native XO not obtainable by an outsider | H, [21] §6-7, [25] §6.3 |
| Polymarket (137) | off-chain, Deposit Wallet signature | wallet creation, approvals, deposit, redeem | **Yes, per account**: a Relayer API key "authorizes gasless wallet operations", created by the user in the polymarket.com UI | H, [PM-wallets] |
| Opinion (56) | off-chain EIP-712, "Zero gas cost to user"; settlement gas paid by the venue | `enable_trading` (about 100,000 gas), `split` 150,000, `merge` 120,000, `redeem` 180,000, all in BNB | **Builder programme only**: "Gasless smart contract interaction" via the SDK for approved builders (application form) | H, [OP-gas], [OP-build] |
| Predict.fun (56) | off-chain EIP-712, on-chain `matchOrders` by the venue | approvals, cancels; the SDK says to "fund your Privy Wallet with BNB to be able to set approvals and cancel orders" | None found (NOT FOUND, searched the SDK README and the dev docs index) | H, [PF-auth], [09] |
| Limitless (Base) | off-chain | USDC approvals | Smart-wallet mode exists (details NOT re-read) | M, [09] §2.3 |
| Hyperliquid HIP-4 | signed actions, no gas | USDC deposit via Arbitrum | n/a | M, [25] §4.1 |
| Trueo (Base) | none: every action is an on-chain call | all of them | None | H, [25] §4.1 |
| PancakeSwap prediction (56) | none: each bet is an on-chain call from an EOA | all of them; contract callers rejected | None | H, [25] §4.1 |

Reading. Of eight venue families, three (XO, Polymarket, Opinion for builders) already sponsor the actions that cost gas; two (Trueo, PancakeSwap prediction) are the only ones where per-bet gas exists, and one of those cannot use an account contract at all. So the population that a general paymaster helps is small: the user who holds stablecoins and no native token on Base, Polygon, Arbitrum or BNB, moving money into or out of a venue account.

### 3.2 Gas numbers per chain, dated

Inputs (all GET, 2026-10-20 unless stated):

| Input | Value | Source | Tag |
|---|---|---|---|
| ETH, POL, BNB prices | $2,395.84; $0.09253 (`polygon-ecosystem-token`); $729.05 | CoinGecko `api.coingecko.com/api/v3/simple/price`, about 07:04 UTC | H |
| Ethereum gas (average / fast) | 0.23 / 1.85 gwei at 2026-10-20T07:02:56Z (coin price shown $2,397.59) | `eth.blockscout.com/api/v2/stats` | H |
| Polygon PoS | `estimatedBaseFee` 167.25 gwei, `maxFee` 275.88 gwei (priority 25), block 95,848,497, block time 2026-10-20 06:35:14 UTC (response is about 30 minutes behind my fetch) | `gasstation.polygon.technology/v2` | H |
| Effective average gas price, 7 days to 2026-10-18 (includes priority fees and, on L2s, the L1 data fee) | Ethereum 0.38 to 0.90 gwei; Base 0.017 to 0.029 (last 0.0173); Arbitrum 0.034 to 0.038 (last 0.0360); Optimism 0.0011 to 0.0019 (last 0.00108); Polygon 396 to 453 gwei | derived: `fees_paid_usd / (gas_per_second x 1e6 x 86400) / coin price` from `api.growthepie.com/v1/fundamentals.json`; the `gas_per_second` unit is Mgas/s, which I confirmed only by checking Ethereum (3 Mgas/s at 48 % utilisation) | M |
| BNB Chain | 0.05 gwei minimum gas price; Opinion's docs table assumes 0.05 gwei and $600 per BNB | `docs.opinion.trade` gas-operations (H for what Opinion's docs say); news reports that all validators adopted 0.05 gwei on 2025-10-01 (M, web search; I found no official BNB Chain docs page, so the current live price is not verified) | M |
| Gas units, sponsored deploy op | **404,091** `actualGasUsed` for XO's real deploy-plus-enable-trading Kernel op (2 calls, paymaster, `verificationGasLimit` 297,342) | [21] §4 (H) | H |
| Gas units, account creation only (Optimism benchmark run 2025-01-30, execution gas) | Kernel v3.1 180,465; Safe v1.4.1 289,207; Nexus 210,309; Alchemy Modular Account v2 97,772 | `alchemyplatform/aa-benchmarks` `benchmarks/optimism.md` (H for the table, M for relevance: a 2025 simulation) | H/M |
| Safe-plus-4337-module deployment test log | 418,349 gas (M, search snippet of a CI log; not read first-hand) | web search | M |

Scenario sizes: **200,000** gas for an ordinary later op (approve or deposit or redeem alone; M, scaled from the 88k verification plus 75k call limits in [21]); **400,000** for a Kernel deploy-approve-deposit op (H as above); **520,000** for the same on a Safe (M: 404,091 plus the 109k difference between the Safe and Kernel creation figures above). The token-paymaster path adds an `approve` and a post-op; its extra gas is NOT FOUND (searched: Candide token paymaster docs).

Cost = gas x effective gas price x coin price (M, arithmetic):

| Chain and price basis | 200k gas | 400k gas | 520k gas |
|---|---|---|---|
| Base (0.0173 gwei, 2026-10-18) | $0.008 | $0.017 | $0.022 |
| Arbitrum One (0.0360) | $0.017 | $0.035 | $0.045 |
| Optimism (0.00108) | $0.001 | $0.001 | $0.001 |
| Polygon PoS (station maxFee 275.88) | $0.005 | $0.010 | $0.013 |
| Polygon PoS (derived 396) | $0.007 | $0.015 | $0.019 |
| BNB Chain (0.05 floor) | $0.007 | $0.015 | $0.019 |
| Ethereum (0.23 average) | $0.110 | $0.220 | $0.287 |
| Ethereum (1.85 fast) | $0.886 | $1.773 | $2.305 |

Caveats stated once: a single week whose last day (2026-10-18) is a Sunday, averages across all transactions on each chain (so a calldata-heavy UserOp on an L2 pays a larger data-fee share than the average), and no allowance for the 1.5x to 3x spikes Polygon in particular has. I treat 2.5x as a stress factor in §3.4. XO's chain is not in the table because XO's paymaster bears its cost and an outsider cannot buy XO ([21], [25]).

Direct comparison with the venue's own claim: Opinion's table puts `enable_trading` at about $0.003 at 0.05 gwei and $600 per BNB (H, [OP-gas]); my 200k-gas BNB figure is $0.007, consistent in order of magnitude.

### 3.3 The five meanings of "gasless"

| Model | Who pays | Needs a secret in the page? | Needs something the author operates? | Works for |
|---|---|---|---|---|
| **A. Author-sponsored paymaster** (Candide InstaGas public gas policy) | the author, by card (plan) plus deposited native gas | No for a public policy; yes for a private policy id or a keyed endpoint (both extractable from a public page) | Yes: a Candide dashboard account, a funded policy per chain per call-sequence, a plan | any ERC-4337 account Candide's bundler accepts, on its listed chains |
| **B. User-supplied provider key** (the user makes their own free Candide Starter key and pastes it into the local client) | the user | The user's key lives in the user's own browser or daemon only | No | same; Starter is 2 chains and 2,500 mainnet UserOps |
| **C. User pays in USDC or USDT** (Candide ERC-20 token paymaster) | the user, in a stablecoin at a rate Candide sets ("exchange rates ... are not guaranteed", H, [CT] §5.2); margin over network cost NOT FOUND | The docs say to "visit the dashboard to get an API key" for the token list and that availability "can vary by API key" (H, [CD-tokens]); whether the keyless public endpoint serves it is untested | No, if each user brings a key | Base, Polygon, Arbitrum, Optimism, Ethereum, BNB (BSC-USD and Binance-Peg USDC), Gnosis, Celo, others (H, [CD-tokens]); **not** Polymarket's pUSD |
| **D. The venue's own sponsorship** | the venue | Per-account keys made in the venue UI (Polymarket Relayer key), a builder application (Opinion), or the venue's paymaster (XO) | No (but a human step per user, or a builder application) | XO, Polymarket, Opinion (builders) |
| **E. Nobody: the user pays native gas** | the user | No | No | everything |

Honest meaning for this project: **D where it exists, C or E elsewhere, B for users who want a bundler, and A only as an optional subsidy.** A is the only model in which a third party (the author) is on the hook for strangers' gas.

### 3.4 Candide plans and a monthly cost model

Plan facts (H, [CP] and [CD-pricing], fetched 2026-10-20):

| | Starter | Launch | Grow | Enterprise |
|---|---|---|---|---|
| Price | $0, no card | $333 per month ($3,330 a year, "two months free") | $749 per month | from $3,000 per month |
| Mainnet UserOps | 2,500 total, no time limit; then **mainnet pauses for the API and for gas policies** | 100,000 per month; beyond that requests are rejected with `Too Many Requests` | 500,000 per month | up to unlimited |
| Mainnet chains | 2 | 7 | all | all, plus your own |
| Sponsored ops included | 1,000 **total** | 5,000 per month, then **$0.01 per op** | 25,000 per month, then **$0.005 per op** | contract |
| Gas policies | 2 | 10 | unlimited, custom rules | unlimited |
| Throughput / API requests | 10 req/s; 25,000 total | 50 req/s; 1M per month | 200 req/s; 5M per month | custom |
| Bundler / SLA | public / none | shared / none | priority / none | dedicated / 99.9 % |

Gas is "passed through at cost" with "no markup" and is paid from deposits in the gas policies; a UserOp needs "about 10 API requests" (H, [CD-pricing]). Deposits: "non-refundable once consumed", unused ones "may be withdrawn", and after cancellation "Candide will refund it on request" (H, [CT] §5.3, §14). The deposit therefore sits in Candide's paymaster and the author carries counterparty risk on it.

Constraints that bite (H, [CD-gp], [CD-plat]): a policy is created **on a specific network**; a policy holds **one ordered list of call rules** and a UserOp is sponsored only if its calls match "exactly: the same calls, in the same order, with nothing extra". So one policy per chain per call-sequence: four chains times three sequences (onboard batch, redeem, withdraw) is 12 policies, which exceeds Launch's 10 and Starter's 2. Starter's two policies cover two chains and one sequence each.

Model (M, arithmetic). Assumptions, all mine: each new user creates 2 accounts (two chain-venue pairs) in the month they arrive, each active user does 4 ordinary sponsored ops a month, blended chain cost equals the Base-class figure ($0.0166 for a 400k-gas deploy op, $0.0083 for a 200k-gas op), stress case multiplies gas by 2.5.

| Monthly active users | New users | Sponsored ops | Gas (base / stress) | Candide fee | Plan | **Total (base / stress)** | Per active user |
|---|---|---|---|---|---|---|---|
| 100 | 50 | 500 | $5 / $12 | $0 | Starter $0 (the 1,000 lifetime sponsored ops last about 2 months, then Launch is required) | **$5 / $12** | $0.05 to $0.12 |
| 1,000 | 300 | 4,600 | $43 / $108 | $0 (inside 5,000 included) | Launch $333 | **$376 / $441** | $0.38 to $0.44 |
| 10,000 | 2,000 | 44,000 | $398 / $996 | $390 | Launch $333 | **$1,121 / $1,719** | $0.11 to $0.17 |
| 50,000 | 8,000 | 216,000 | $1,926 / $4,814 | $955 | Grow $749 | **$3,630 / $6,518** | $0.07 to $0.13 |

Reading. The plan fee dominates until about 10,000 users. A project with a few hundred users pays the Starter allowance and then a $333 step it cannot justify; this is the cost cliff behind the Phase 3 kill criteria.

### 3.5 Abuse and draining attacks, and rate limiting without a backend

What the policy engine offers (H, [CD-gp], [CD-arch]): general rules (date range, active, public or private); account rules (`totalMax` per account, `maxPerOp`, a rate per account and period); access rules (account allowlist, **Domains whitelist**, **IP whitelist**, each "empty allows all"); transaction rules (exact `to`, `selector`, decoded-parameter constraints with `$eq/$gt/$gte/$lt/$lte/$startsWith`). Candide describes the "Paymaster Verifier" as the defence against "draining attacks" by indiscriminate paymasters (H, [CD-arch]).

| # | Attack on an author-funded public policy | Why the policy rules only partly stop it | Bound on the author's loss |
|---|---|---|---|
| S1 | **Sybil accounts.** An attacker generates thousands of fresh keys; a counterfactual Safe has no cost. Each gets its own `totalMax` and rate window | Account rules are per account. The account allowlist would stop it only if the author enumerates every user, which is an operator | Gas: the policy deposit. Fees: plan caps (below) |
| S2 | **Origin spoofing.** The Domains whitelist names the dApp's HTTPS origin | Enforcement is undocumented (NOT FOUND, searched the gas-policies, platform and architecture pages); an `Origin` header is set by browsers and can be set to anything by a script outside a browser (M, HTTP semantics). Treat as a spam filter | same |
| S3 | **IP rotation.** The public endpoint rate-limits "from a single IP address" with no figure published (H, [CD-pub]; number NOT FOUND) | Residential proxies are cheap; the IP whitelist is unusable for a public dApp | same |
| S4 | **Quota exhaustion (denial of service).** Spend the plan's UserOp allowance so that the author's own users get `Too Many Requests` | Launch caps at 100,000 UserOps a month and 50 req/s, which is about 5 UserOps a second: the allowance can be burned in about 5.6 hours; Starter's 2,500 mainnet UserOps and 1,000 sponsored ops can be burned in minutes and then "mainnet access pauses for both the API ... and gas policies". Whether UserOps sent through the keyless public endpoint count against the policy owner's plan: NOT FOUND | no money beyond what was spent, but total loss of service until the next cycle |
| S5 | **Fee drain.** The per-op fee ($0.01 on Launch) is billed on the plan, not taken from the deposit; the document does not say how it is collected (NOT FOUND) | An attacker who makes the author sponsor 95,000 ops past the included 5,000 causes $950 of fees on Launch, plus gas | Launch worst case per month: $333 + $950 + min(deposit, about $830 of gas at $0.0083 per op for 100,000 ops) = **about $2,100** (M); Grow worst case about $749 + $2,375 + gas |
| S6 | **Cheap-call spam.** Rules that sponsor a bare `approve` (no value moved) are spammable at no cost to the attacker | Transaction rules can require a parameter such as `deposit(amount >= X)` (H, [CD-gp]); that forces the attacker to hold and recycle capital and to pay the un-sponsored withdrawal gas, so the drain is no longer free (M, design inference) | as above, with a worse attack economy for the attacker |
| S7 | **Replay of a signed UserOp elsewhere.** | UserOps commit to chain id and EntryPoint ([21] §8.3, H); a paymaster signature commits to the op and a validity window (Candide error AA32/AA22 pages, M). Low. | none |

**Rate limiting that fits a static site with no backend: there is none that a determined attacker cannot walk around.** The levers that exist without a server are the on-chain-visible ones: transaction rules that require real value, small `maxPerOp`, a short effective date range that the author renews by hand, a small deposit, and the plan's own hard stops. A per-user quota needs state keyed to a user, which is a backend (or a signed attestation issued by one); the binding decision rules that out.

**Why a sponsoring policy needs a secret, stated precisely.**
- *Creating or changing* a policy needs a team management key (`mk_...`), which Candide says "must never be embedded in browser code, mobile applications, public repositories, or logs" (H, [CD-plat]). That key stays in the author's hands, so the author is an operator of a Candide account.
- *Using* a public policy needs nothing in the page. That is the only variant that fits a public repository, and it is the variant Candide documents for apps such as PoolTogether and Revoke.cash (H, [CD-send]).
- A *private* policy id or an *authenticated endpoint* (key as a URL path segment: "Treat the full URL as a secret", H, [CD-auth]) put in a public page is public. Candide's own advice for frontends is to "scope what a key can sponsor with gas policies so a leaked key cannot drain your gas tank" (H, [CD-auth]); that is the same rule set as above, so a key in the page adds nothing a public policy does not already give, and costs a leak.

**Verdict on A.** Technically possible with no server; economically a bounded, griefable subsidy; operationally a Candide account the author must keep funded, renewed and monitored. It is not wrong, but it does not meet "nothing the author must operate" and should never be on by default.

---

## 4. Threat model for the smart-account layer in a public repository with a hosted dApp

Trust base the user accepts if they use a Candide-stack Safe: the PayBox MPC key (or whatever wallet owns the Safe); the Safe singleton and proxy factory; the Safe4337 module (v0.3.0 for EntryPoint v0.7, audited by Ackee per its README, H, [SM-readme]) or Candide's multi-chain-signature module (EntryPoint v0.9); the EntryPoint; Candide's bundler and paymaster (liveness and fairness, not custody: "Candide never holds user keys or funds", H, [CP]; but see the deposit note above); AbstractionKit as built into the client; the host that serves the dApp; and, for any session key, the machine it lives on.

| # | Threat | How it plays out here | Evidence | Mitigation in this design | Residual |
|---|---|---|---|---|---|
| R1 | **Owner key compromise** | The PayBox credential owns the Safe; whoever can get it to sign can reconfigure the Safe (add owner, enable module, `delegatecall`). `raw` and an `autonomous` grant widen this ([P1] A4) | [25] T1, T2; Safe owners can `delegatecall` (M, Safe design) | Dedicated PayBox credential for the treasury, approval-gated grants, `typedData` only, never `raw`; Safe `delegatecall` guard or Zodiac-style restriction is not in the Candide stack's default (M) | High. The owner key is the root; every policy sits below it |
| R2 | **Session-key theft from the browser** | A delegate or order-signing key in page memory, `localStorage` or IndexedDB is readable by any script in the origin (XSS, extension, compromised dependency, malicious update). `secp256k1` is not a WebCrypto curve, so a non-extractable browser key cannot be an Ethereum signer (M, platform knowledge); passkeys (P-256) need an on-chain verifier and the WebAuthn signer in ZeroDev had a critical fix ([25] T5) | [25] T4; Polymarket and Hyperliquid delegates are plain keys ([PM-wallets], [25] §3) | Keep any hot key in the local daemon (0600 file, expiry always set), never in the hosted page; budget it with the Allowance Module so theft is bounded by the allowance | Medium: the allowance is lost, and a delegate key can send it anywhere |
| R3 | **Malicious dApp update (supply chain)** | A tampered bundle can show a harmless action while the signer approves another. This is how the 2025 Bybit loss happened: JavaScript served by Safe{Wallet}'s own cloud storage was altered to rewrite a transaction that the hardware wallet then signed, and the Safe was upgraded to a malicious implementation (M: SlowMist and BleepingComputer, summarised by search; no primary Safe post-mortem read) | [SlowMist](https://slowmist.medium.com/bybits-1-5-billion-theft-unveiled-safe-wallet-front-end-code-tampered-84b78f0fa9c2) (M) | Local-first daemon serving the static app from `127.0.0.1` ([DD] §0) instead of a hosted origin; reproducible build with a published hash (the repo already builds twice to the same sha256, plan banner, H); decode what is signed locally and show it on the PayBox approval screen, not only in the page | Medium for a hosted deployment; low for local-first |
| R4 | **Phishing look-alike dApps** | A public repo makes cloning trivial; a look-alike asks the user to sign a Safe owner-change or a Merkle root | general; `typedData` approval screens show structure, not intent (M) | Hosted domain only as a convenience; print the build hash; never ask for a signature whose purpose cannot be decoded locally | Medium |
| R5 | **Paymaster abuse and dependency** | §3.5. Also: Candide can pause, reprice, change terms (30 days' notice, H, [CT] §15) or refuse a use ("Reselling Candide API access to third parties without written authorization" and "Attempting to circumvent rate limits" are named abuses, H, [CT] §7.1) | [CT] | Optional, off by default, tiny deposit, no dependency for core flows | Medium |
| R6 | **Module and upgrade risk** | Modules are trusted code with Safe-level power. Evidence of churn: Allowance Module v1.0.0 is "a security fix release ... updated with three security fixes" over v0.1.1 (H, [CD-allow-mig]); Candide's multi-chain module repo was created 2026-01-16, has no release tag, no licence file, one audit (Nethermind NM-0874, committed 2026-04-04) and a `KNOWN_ISSUES.md` with an accepted Medium item (H, [MC-repo]); ZeroDev's WebAuthn signer had a critical fix ([25] T5); Kernel v4's repo removed its audit folder ([25] §5.2) | cited | Pin by address and code hash; only the versions named in this document; prefer Safe4337Module v0.3.0 (EntryPoint v0.7, Ackee audits, older) over the v0.9 multi-chain module for any funded use until the latter has a tag, a licence and a second audit | Medium |
| R7 | **EntryPoint risk** | One contract holds all deposits and validates all ops. v0.7 (2024-02-22) is the deployed standard that XO and Predict's Kernel use; v0.8 (2025-03-26) and v0.9 (2025-11-16) are newer, with Spearbit (Mar 2025) and Cantina (v0.9) reviews listed in the repo (H, [EP-repo]). Candide's `SafeMultiChainSigAccountV1` uses v0.9 and "Your bundler and paymaster must serve EntryPoint v0.9" (H, [CD-sua]) | cited | Use v0.7 accounts; treat v0.9 as young | Low to medium |
| R8 | **Cross-chain replay of same-address accounts** | (a) Counterfactual-address squatting needs a nonce-based factory; Safe's proxy address includes the initializer (owners, modules) so an attacker cannot deploy "your" address with other owners (M, Safe design; the Wintermute case is [25] T9). (b) **By design, the multi-chain module lets one signature authorise ops on several chains**, and the module "does not validate other leaves in the tree" so "Signing clients MUST verify ALL leaves in the merkle tree before the root is signed" (H, [MC-known] K-02, severity "Medium (accepted, by design)"). A PayBox approval of `typedData` shows a root hash, not its leaves (M: Candide describes the signed object as "the EIP-712 hash of the Merkle tree root", H, [CD-sua]) | cited | Single-chain signing only until a local verifier can decode every leaf and show it to the approver; reject any intent whose chain id is 0 or whose domain lacks `chainId` ([25] T8); never send funds to a counterfactual address before deployment is proven | Medium (high if Merkle signing is enabled blind) |
| R9 | **Signature malleability** | ECDSA `s`-malleability changes signature bytes, not the UserOp hash or an order hash, so op identity and CLOB cancel-by-hash are unaffected (M). Safe checks signatures through its own `checkSignatures`; I did not read the code | not verified | Identify ops by hash, never by signature; never use a signature as a nonce or an id | Low |
| R10 | **Counterfactual funding hazard** | Funds sent to an undeployed address are stranded if the factory is missing on that chain; Nexus disclosed an issue for accounts holding funds before deployment ([25] §5.2) | [25] §5.3 | Never display a counterfactual address as a deposit target until code is proven present (rule already in [P1] A11) | Low once enforced |
| R11 | **Candide as bundler: censorship and visibility** | Candide sees every UserOp, the sender, and the requester IP at the edge; it can delay or drop; it cannot alter a signed op | [CT] §10.2: usage data "associated with your API key, not with individual end-users"; end-user IP handling for the public endpoint: NOT FOUND | Fall back to another bundler or self-host Voltaire (LGPL-3.0 Python bundler, `candidelabs/voltaire`, pushed 2026-10-19, H, org listing) | Low |
| R12 | **Sponsor funds custody** | The author's gas deposit is held by Candide's paymaster; refund on request | [CT] §14 | Keep it small | Low |
| R13 | **Account-type mismatch loses assets** | Moving venue positions into a Safe that the venue cannot read, or sending to a contract account on PancakeSwap prediction | [25] §4 | Never route EOA-only venues through the Safe; venue registry marks each account type | Low once enforced |
| R14 | **Dependency risk of AbstractionKit itself** | `abstractionkit` is MIT, 0.x, 80 versions since 2023, latest 0.4.3 published 2026-10-06 (14 days old), two runtime dependencies (`@noble/curves`, `@noble/hashes`), no install scripts, npm signatures present, no provenance attestation shown (H, [NPM]) | [NPM] | Pin an exact version at least a few weeks old (for example 0.4.0, 2026-06-10, or 0.4.1, 2026-07-30), review the diff to the next, install with scripts disabled | Low to medium |

---

## 5. Terms, legal and non-custodial status

All of §5 is documentation reading, not legal advice. Fragments are quoted short.

### 5.1 Candide terms and privacy (H, [CT], [CPriv])

- **Version and timing.** Terms "Last modified: September 29, 2026. Effective October 30, 2026"; the previous terms apply until then and were not read. Prices and allowances can change on 30 days' written notice (§4.1, §15).
- **Who it is for.** "designed for software companies, developers, and enterprises"; you "represent that you are using them for business or development purposes" (§3). A hobby project run by an individual is outside the literal target audience; whether that matters in practice: NOT FOUND.
- **Sponsorship.** Zero gas markup; flat per-op fee after the included ops; deposits non-refundable once consumed (§5.1, §5.3).
- **Compliance falls on the application.** "Candide does not monitor the end users of your application. You are responsible for your application's own compliance, and gas policies let you set the rules for what you sponsor" (§7.3). Sanctions: you confirm you are not sanctioned and "will not use Candide's hosted services to breach sanctions or other applicable law".
- **Fair use.** Throttling or suspension for "Sustained API requests exceeding the rate limits", "intentionally failing UserOperations", "Attempting to circumvent rate limits", and "Reselling Candide API access to third parties without written authorization" (§7.1). A shared key baked into a public dApp is not obviously reselling, but it is exactly what a reader could argue; the safe form is one key per user (model B) or a public policy (no key).
- **Indemnity.** "You will defend and indemnify Candide against third-party claims arising from your application, your end users' use of it, or your breach of these Terms or applicable law" (§11.5); liability is capped at 12 months of fees paid (§11.3), so on the free plan the cap is effectively zero.
- **No SLA** below Enterprise (§6.1); status is public at `status.candide.dev`.
- **Data.** Account data: name, email, billing address, payment information via a third-party processor (§10.1; the privacy policy names Mollie and GitHub or Gmail sign-in); API usage data tied to the API key; usage logs kept 90 days; account data 24 months after cancellation (§10.4). The terms are silent on what the **keyless public endpoint** logs about end-user IPs: NOT FOUND (searched the terms, privacy policy, public-endpoints and reliability pages). Using the public endpoint therefore sends every user's IP and every UserOp to a French company with no stated retention for that path. Candide's governing law is French (Paris courts, §16).
- **Open source.** AbstractionKit is MIT (H, [NPM]); the terms say its use is under its own licence, separate from the hosted service (§7.3).

### 5.2 Does the author become a gas sponsor with obligations?

Sources say: the author becomes the **customer** of a hosted sponsorship service and the party that decides "what you sponsor" (H, [CT] §7.3); Candide places end-user compliance on that customer, and indemnity too. Beyond that:

- *Sanctions screening.* Paying gas for an address on a sanctions list is a payment benefiting that address; a public policy cannot screen, and the client-side screen that would exist is bypassable. Whether strict-liability rules attach to a small gas subsidy: NOT FOUND in a primary source I could read; counsel. (L)
- *Restricted-person funding.* Predict.fun bars trading by persons "DIRECTED, COORDINATED OR CONTROLLED BY ANY RESTRICTED PERSON" and "on behalf of" them; Opinion's text is the same (H, [PF-tos], [OP-tos]). A sponsor in a restricted jurisdiction, or one who knowingly sponsors users in one, is near that line. I make no finding about any individual's location. (M)
- *Money-transmission or "custody" characterisation.* The author never holds user funds in this design (the Safe is user-owned; the paymaster pays gas to the network, not value to the user). Candide's own line is "Candide never holds user keys or funds" (H, [CP]). Whether a gas subsidy is anything other than a promotional cost: NOT FOUND in a primary source; counsel. (L)
- *Tax:* Candide "does not currently charge VAT" and expects the customer to account for reverse charge where required (H, [CT] §4.6).

### 5.3 Non-custodial status

The Safe is a contract the user owns; Candide's bundler cannot move funds; the PayBox key never leaves PayBox's MPC; the dApp holds no owner key and (in the recommended design) no session key either. The weak points are *custody by the author through convenience*: a keyed endpoint or policy id shipped in the repo, or any server that holds a delegate key. Both are refused in §6.4. Status is therefore non-custodial **only if** the design stays within §6. (M)

### 5.4 What changes if Predict.fun and Opinion are added

| | Predict.fun | Opinion |
|---|---|---|
| Terms date | Last Updated 2025-11-18 (11 months old) | Last Updated 2025-10-19 (12 months old) |
| Restricted persons | "UNITED STATES OF AMERICA, UNITED KINGDOM, FRANCE, ONTARIO, SINGAPORE, POLAND, THAILAND, AUSTRALIA, BELGIUM, TAIWAN" | a "Restricted Jurisdictions" list defined further down the page (the earlier read, [09] §2.2, lists US, UK, France, Ontario, Singapore, Poland, Thailand, South Korea, PRC, Taiwan, Hong Kong); I did not re-extract the definition text |
| "On behalf of" / "directed ... by" | prohibited | prohibited |
| VPN | "STRICTLY PROHIBITED"; consequence "close-only mode" | same wording |
| Bots | no ban found; prohibits "data mining tools, robots, crawlers, or similar data gathering and extraction tools to scrape or otherwise remove data from the Site" (scraping, not trading) | same clause; the docs also sponsor bot-style access: a self-service API key via EIP-712, a CLOB SDK, and a Builders Programme for "routers" |
| API | key from the self-service Developer Console, 240 requests per minute per key (H, [09]); the terms prohibit "Sublicense, sell, or otherwise distribute the Interfaces or Features" | public data without a key (5 rps); trading calls need a key created through an EIP-712 signature, but "Your wallet must be a registered Opinion account with a trading wallet enabled" (H, [OP-auth]) |
| Account type for a user | EOA, or a Predict Account (Kernel v3.1, owner = exported Privy wallet) | the Safe trading wallet Opinion creates at onboarding (human step on opinion.trade) |
| Gas | orders free; approvals and cancels need BNB | orders free; `enable_trading`, `split`, `merge`, `redeem` need BNB; builders get gasless SDK calls |
| Effect on this proposal | An AA account of ours cannot be the maker. The PayBox EOA can (EOA mode); Predict Account mode needs the user to export a Privy key, which the project should never ask for | Same: our Safe is not Opinion's Safe; the owner EOA signs; the funding move into Opinion's Safe is an ordinary USDT transfer |
| What it adds to the project's exposure | Geo and "directed ... by" clauses apply to anyone the project helps; the project is a front-end that never holds funds | same, plus a Builder application if gasless is wanted (that is contact with Opinion; not required for any core flow) |

Net effect of adding both: **two venues whose gas is trivially small (BNB, 0.05 gwei), whose orders are already free, whose accounts are theirs, and whose terms add jurisdiction exposure for the project and any sponsor.** They reduce, not increase, the case for a paymaster.

### 5.5 Needs counsel before any sponsorship goes live

(1) Whether sponsoring gas for the public creates any obligation in the author's jurisdiction; (2) whether an author located in a Restricted Person jurisdiction can run a sponsoring policy that funds trading on Predict.fun or Opinion; (3) sanctions screening duties; (4) whether a hosted dApp that links to these venues needs geo-blocking by the author. None of these has been decided here.

---

## 6. Recommendation

### 6.1 Verdict by layer

| Layer | Verdict | Why |
|---|---|---|
| Safe account owned by the PayBox address or any EOA, same address on Candide chains | **Feasible; test first** | `typedData` signing fits PayBox; Candide docs say the Safe contracts are deployed "at the same address on every supported EVM network" (H, [CD-dep]; the on-chain check is untested) |
| That account as the trading account on XO, Polymarket, Opinion, Predict, Limitless, Hyperliquid, PancakeSwap | **Not feasible** | each forces its own account; PancakeSwap forbids contracts (§2.1) |
| Gasless bets | **Already true for orders; the paymaster only matters for approvals, deposits, redeems, withdrawals** | §3.1 |
| Author-sponsored paymaster | **Feasible, bounded, griefable, an operator burden; optional** | §3.4, §3.5 |
| User-pays-in-USDC paymaster | **Feasible; the best "gasless" for a stablecoin-only user; margin and keyless access unverified** | §3.3 |
| Venue sponsorship | **Use where it exists** | XO, Polymarket (per-account Relayer key), Opinion builders |
| Session keys with strict on-chain guardrails | **Only for treasury outflow (Allowance Module); not for orders** | ERC-1271 sees a hash |
| Seamless cross-chain betting | **Not feasible as stated; one-signature multi-chain funding is feasible but young** | Merkle module, bridges, venue-specific accounts |
| XO chain 3223, SX Rollup | **Out of Candide's reach** | not in its list; "on demand" extended networks require contact (H, [CD-nets]) |
| Predict.fun and Opinion on BNB | **Add as EOA/own-account venues with read-only gas help (balance checks, cost estimates)** | §5.4 |

### 6.2 Phases

| Phase | Content | Money | Flags | Gate to proceed |
|---|---|---|---|---|
| **0** (now) | No AA code. Keep the account map ([25] §8.1). Add "gas readiness": per-chain native balance check, an estimate of approve/deposit cost from §3.2's method with the source date shown, a warning when a venue needs native gas the account lacks (BNB for Opinion and Predict), and a pointer to venue sponsorship (Polymarket Relayer key, XO). | $0 | none | n/a |
| **1** (test only) | **T-AA9**: testnet proof that a Safe owned by a throwaway PayBox credential can be created and used: UserOp typed data (`SafeOp`) signed through `typedData`, Candide public endpoints, a test chain ("Testnet is free and unlimited on every plan", H, [CD-pricing]). Then **T-AA10**: the same on one mainnet chain with a few cents. | under $1 | all write flags OFF | PayBox signs the `SafeOp` typed data and Candide's endpoint accepts the op |
| **2** (opt-in, user pays) | Treasury Safe on two chains (suggest Base and BNB, or Base and Polygon) for batched approve-and-deposit and USDC-paid gas, **user-supplied provider key or public endpoint**, single-chain signing only, `ENABLE_USEROP_SUBMIT`-style flag OFF. Optional Allowance Module budget for a daemon-held delegate, with the recipient set shown at approval. | the user's own gas | flags OFF | T-AA9/T-AA10 pass; PayBox grant behaviour known; local decoder shows every call |
| **3** (conditional, optional) | One public Candide gas policy on a chain the plan covers, funded with a deposit the author can afford to lose (suggest at most $50 to $100 per chain), transaction rules requiring a real-value deposit, short date range renewed by hand, Starter plan first. | the author's, by choice | a clearly marked "sponsored by the author" setting, OFF by default | counsel steps in §5.5 done; kill criteria below not tripped |
| **4** (research only) | Candide Safe Unified Account (Merkle multi-chain signing) after a local leaf verifier exists and the module has a release tag, a licence and a second audit | none | OFF | all three conditions |

### 6.3 Kill criteria (any one ends the item named)

- PayBox cannot sign the Safe's EIP-712 typed data on a target chain, or the approval screen cannot show the call (ends Phases 1 to 4).
- Candide's public mainnet endpoint rejects, throttles below about one op a minute per IP, or refuses to sponsor/estimate for a Safe owned by an external signer (ends B/C via the public endpoint; users must bring a key).
- Sponsored cost per active user above $0.50 a month at 1,000 users, or more than 25 % of a deposit consumed in a week by ops the project cannot attribute to real users, or the plan step to $333 is reached without at least 1,000 monthly active users (ends Phase 3).
- Candide changes its terms to restrict frontend or public use, or suspends the key under §7.1 (ends the Candide dependency; fall back to self-hosted Voltaire or another bundler).
- Counsel's opinion on §5.5 is negative, or the author is a Restricted Person under either BNB venue and cannot separate sponsorship from trading there (ends Phase 3 for those venues).
- A venue's terms are amended to bar contract wallets or relayed traffic (ends the Safe for that venue).
- Any report of a critical bug in the Safe module, the Allowance Module or the multi-chain module (stop, move funds out first; R6).

### 6.4 What to refuse

1. Any Candide API key, policy id, management key or authenticated URL in the repository, a build artifact, a public page or CI logs.
2. Any server that issues quotas, attestations, captchas, session tokens or paymaster signatures (it makes the author an operator and a custodian of other people's access).
3. Any wallet, module, paymaster, bridge or relayer contract written by us.
4. Any order-signing key, delegate key or provider key persisted in a hosted page (the local daemon holds them if at all).
5. Asking users to export a Privy key or any private key (the Predict Account SDK path).
6. Merkle/multi-chain signatures approved blind through PayBox; any `authorization` (EIP-7702) intent, in particular chain id 0; any `raw` digest where `typedData` is possible.
7. Routing EOA-only venues (PancakeSwap prediction, Quotient x402, Hyperliquid, Trueo positions) through any contract account.
8. Presenting any cap as enforced unless it is: the Allowance Module budget (enforced for treasury outflow), a funded balance, or a venue-native delegate limit. Everything else stays "advisory".
9. Sponsoring any action whose beneficiary the project cannot show is outside a venue's restricted list, until counsel says otherwise.

---

## 7. Unverified items and cheap tests

| ID | Question | How | Cost |
|---|---|---|---|
| T-AA7 | Does Candide's keyless public endpoint serve mainnet, sponsor under a public policy, serve the token paymaster, and what is the per-IP limit? | A single read-only `eth_supportedEntryPoints` plus `pm_supportedERC20Tokens` POST from the local client (not done here: no POST allowed) | $0 |
| T-AA9 | Does PayBox sign `SafeOp` typed data (domain `chainId` of the target chain, `verifyingContract` the Safe module) and does Candide accept the op? | Throwaway credential, test chain, zero value | $0 |
| T-AA10 | Same on one mainnet chain | a few cents of gas | under $1 |
| T-AA11 | Is the Safe singleton, factory and Safe4337 module present at the same addresses on Base, Polygon, BNB and Arbitrum? | read-only `eth_getCode` (the repo's own companion) | $0 |
| T-AA12 | Do UserOps through the keyless endpoint count against any plan? How is the per-op fee collected relative to the deposit? | Candide's dashboard or a written answer; both require an account or contact | decision for the author |
| T-AA13 | Token paymaster margin over network gas and extra gas units | `pm_supportedERC20Tokens` `exchangeRate` against the gas price | $0 |
| T-AA14 | Real `actualGasUsed` of a Safe deploy-approve-deposit op on each chain | one op each | cents |
| T-AA15 | Live BNB Chain gas price and its official source | public BNB Chain docs or a node (this session had only news) | $0 |
| — | Notes 35 to 39 (other angles) | cross-read when they exist: NOT DONE | $0 |
| — | Candide's terms before 2026-10-30; Opinion's current "Restricted Jurisdictions" extract | re-read | $0 |
| — | Whether the Domains whitelist is verified server-side beyond the `Origin` header | Candide documentation or support; not tested | decision |

Open decisions for the author: (1) accept that Phases 0 and 1 add no sponsored component; (2) whether Phase 2 is wanted at all given the venues' own accounts; (3) whether Phase 3 is ever wanted, and who bears it; (4) who consults counsel on §5.5.

---

## Verification

Re-checked this session, with the result.

1. **Candide pricing and terms read first-hand today.** `www.candide.dev/pricing` (Starter $0 / 2,500 mainnet UserOps / 1,000 sponsored lifetime / 2 chains / 2 policies / 10 req/s; Launch $333 / 100,000 / 5,000 sponsored then $0.01 / 7 chains / 10 policies / 50 req/s; Grow $749 / 500,000 / 25,000 then $0.005 / all chains / unlimited policies / 200 req/s; Enterprise from $3,000), `/legal/tos` (last modified 2026-09-29, effective 2026-10-30; §3, §4.1, §5.1-5.3, §6.1, §7.1-7.3, §10.2-10.4, §11.3, §11.5, §13-§16), `/legal/privacy-policy`. All figures and quoted fragments above were copied from those fetches.
2. **Candide docs read as `.md`:** public endpoints ("No API required", per-IP limit, no number), authenticated endpoints (key as URL path, "Treat the full URL as a secret", key-safety advice), supported networks (14 mainnets including Polygon 137, Base 8453, BNB 56, Arbitrum 42161; Solana via Kora; extended list on request; XO 3223 and SX 4162 absent), reliability (SLA Enterprise only), gas policies and architecture (rules, public vs private, Paymaster Verifier), platform API (management key must stay server-side), gasless guide (public first, private fallback), token list (BNB: BSC-USD, Binance-Peg USDC; Polygon native USDC; Base native USDC), chain-abstraction and Safe Unified Account (EntryPoint v0.9, Merkle root, Nethermind audit NM-0874), deployments (same address on every supported network; EntryPoints v0.6 to v0.9), allowance module (v1.0.0 "security fix release ... three security fixes", Certora and Ackee), safe-policies (a `research` path page).
3. **`candidelabs/safe-4337-multi-chain-signature-module` read via `gh api`:** created 2026-01-16, last push 2026-07-24, no licence field, no releases, `audit/NM_0874_Candide_safe.pdf`, `KNOWN_ISSUES.md` K-02 (Medium, accepted, by design), `AUDIT_SCOPE.md` (one contract, 205 nSLOC, EntryPoint v0.9). The PDF text was not read (no PDF tooling used); only its file name and size.
4. **npm `abstractionkit`:** latest 0.4.3 published 2026-10-06, MIT, deps `@noble/curves`, `@noble/hashes`, 80 versions, no install scripts, registry signatures present, no attestation shown.
5. **Predict.fun source read:** `PredictDotFun/sdk` `src/Constants.ts` (Kernel domain "Kernel"/"0.3.1" on BNB, KERNEL `0xBAC849bB...4b4D`, ECDSA_VALIDATOR `0x845ADb2C...cE57`), `src/OrderBuilder.ts` (`kernel.execute` for approvals, `ecdsaValidatorStorage(predictAccount)`, signature prefix `0x01 || validator`), README and `dev.predict.fun` auth guide (Privy wallet key exported from account settings; BNB needed for approvals). Terms read in full for the quoted clauses (jurisdiction list, VPN, robots/crawlers, sublicense).
6. **Opinion read:** terms of use (last updated 2025-10-19; Restricted Person clause; VPN; robots/crawlers), authentication (trading wallet prerequisite), gas-operations (gas-free orders; gas-required operations table at 0.05 gwei and $600 per BNB), builders programme ("Gasless smart contract interaction"). The Restricted Jurisdictions definition itself was not re-extracted (flagged in §5.4).
7. **Gas inputs fetched with dates:** Ethereum Blockscout stats (2026-10-20T07:02:56Z), Polygon gas station (block time 06:35:14 UTC), CoinGecko prices (about 07:04 UTC), growthepie fundamentals for 2026-10-12 to 2026-10-18 (derived effective prices; the Mgas/s unit confirmed only against Ethereum), Alchemy `aa-benchmarks` Optimism run of 2025-01-30, XO explorer stats (reports 5 gwei; XO's paymaster pays regardless), and [21]'s 404,091 `actualGasUsed`. Base, Polygon and Arbitrum Blockscout hosts answered 403 and were not worked around. BNB gas is the weakest input (news plus Opinion's own table, M).
8. **Arithmetic re-run:** every row of the §3.2 cost table and the §3.4 model was computed by a script from the stated inputs (scratchpad), not by hand. The §3.5 S5 worst case is 95,000 x $0.01 = $950 plus 100,000 x $0.0083 = $830 plus $333 = $2,113.
9. **ERC-1271** text read at `eips.ethereum.org/EIPS/eip-1271` (function takes `hash` and `signature`).
10. **Polymarket docs** re-read: Relayer API key "authorizes gasless wallet operations"; Session Keys in beta, scoped, 180 days, "cannot withdraw", Builder key and a rollout request needed.
11. **PayBox docs** re-read: intents `message`, `typedData`, `transaction`, `authorization`, `raw` ("escape hatch"); one EVM address across `eip155:*`. Runtime chain acceptance and `raw` under a grant remain untested.
12. **Not re-checked, carried from earlier notes at their tags:** XO paymaster policy details and the 404,091 figure ([21]), PancakeSwap prediction's contract-caller rejection, Polymarket Deposit Wallet derivation, the ZeroDev policy-module deployment gaps, PayBox CORS behaviour ([DD] H[FC1]), Hyperliquid and Limitless account facts.
13. **Cross-read of notes 35 to 39:** listed `docs/research/` twice (start and end of the task); no file numbered 35 or higher existed. NOT DONE.
14. **Scan for personal identifiers:** a grep of this file for the user's name, username, email domain, home path and temp-directory prefix returned nothing after one scratchpad path was removed; all repo paths are relative.

### Source keys

- [CP] https://www.candide.dev/pricing ; [CT] https://www.candide.dev/legal/tos ; [CPriv] https://www.candide.dev/legal/privacy-policy
- [CD-pricing] https://docs.candide.dev/wallet/pricing.md ; [CD-pub] https://docs.candide.dev/wallet/api/public-endpoints.md ; [CD-auth] https://docs.candide.dev/wallet/api/authenticated-endpoints.md ; [CD-nets] https://docs.candide.dev/wallet/api/supported-networks.md ; [CD-gp] https://docs.candide.dev/instagas/gas-policies.md ; [CD-arch] https://docs.candide.dev/instagas/architecture.md ; [CD-plat] https://docs.candide.dev/platform/overview.md ; [CD-send] https://docs.candide.dev/wallet/guides/send-gasless-tx.md ; [CD-tokens] https://docs.candide.dev/wallet/paymaster/tokens-supported.md ; [CD-ca] https://docs.candide.dev/wallet/guides/chain-abstraction-overview.md ; [CD-sua] https://docs.candide.dev/wallet/abstractionkit/safe-unified-account.md ; [CD-dep] https://docs.candide.dev/wallet/technical-reference/deployments.md ; [CD-allow] https://docs.candide.dev/wallet/plugins/allowance.md ; [CD-allow-mig] https://docs.candide.dev/wallet/plugins/allowance-migration.md ; [AK-signers] https://docs.candide.dev/wallet/abstractionkit/external-signers.md (read through `llms-full.txt`)
- [MC-repo] https://github.com/candidelabs/safe-4337-multi-chain-signature-module ; [MC-known] its `KNOWN_ISSUES.md` ; [NPM] https://registry.npmjs.org/abstractionkit ; [SM-readme] https://github.com/safe-global/safe-modules (`modules/4337/README.md`) ; [EP-repo] https://github.com/eth-infinitism/account-abstraction
- [PF-tos] https://docs.predict.fun/terms-of-service.md ; [PF-sdk] https://github.com/PredictDotFun/sdk ; [PF-auth] https://dev.predict.fun/ts-how-to-authenticate-your-api-requests-663127m0.md
- [OP-tos] https://docs.opinion.trade/legal/terms-of-use.md ; [OP-auth] https://docs.opinion.trade/developer-guide/opinion-open-api/authentication.md ; [OP-gas] https://docs.opinion.trade/developer-guide/opinion-clob-python-sdk/core-concepts/gas-operations.md ; [OP-build] https://docs.opinion.trade/developer-guide/opinion-builders-program.md
- [PM-wallets] https://docs.polymarket.com/trading/wallets-auth.md ; [EIP1271] https://eips.ethereum.org/EIPS/eip-1271 ; PayBox tools https://docs.paybox.sh/reference/mcp-tools.md
- Gas and price data: https://eth.blockscout.com/api/v2/stats , https://gasstation.polygon.technology/v2 , https://api.coingecko.com/api/v3/simple/price , https://api.growthepie.com/v1/fundamentals.json , https://github.com/alchemyplatform/aa-benchmarks (`benchmarks/optimism.md`)
