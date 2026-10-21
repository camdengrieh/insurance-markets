# 38. Cross-chain funding for a smart-account wallet: what "seamless" can honestly mean without writing a bridge

Task `aa-crosschain`. Written 2026-10-20 (harness date; the machine clock on the provider responses read about 2026-10-20 07:00 to 08:00 UTC). Read-only research: public documentation, public npm and GitHub metadata, public explorer reads, and unauthenticated GET probes. No PayBox tool was called. Nothing was signed, sent, deployed or created; no account or API key was made; no credential file was read; nobody at XO, PayBox, Candide or any bridge was contacted; no third-party code was cloned or run.

The question under test (user proposal of 2026-10-20): a smart-contract wallet using account abstraction, derivable from a PayBox wallet or any other wallet, that operates on any chain, built on Candide.dev, with session keys, strict guardrails, gasless transactions and "seamless cross-chain bet placement across all the chains where the prediction markets exist", plus Predict.fun and Opinion on BNB Chain. This note covers the cross-chain half: how value could reach each venue without us writing a bridge. The wallet half is in [25].

Confidence tags: **H** = read first-hand in a primary source this session (URL, repo path or note id given) or produced by a probe I ran; **M** = secondary, inferred from H facts, or from search-result summaries; **L** = guess. **NOT FOUND (searched: ...)** is used literally. Note ids: `[09]` = `docs/research/09-venues-onchain-clob.md`, `[19]` = `19-smart-account-derivation.md`, `[20]` = `20-funding-route-verification.md`, `[21]` = `21-userop-templates.md`, `[25]` = `25-dapp-aa-wallet.md`, `[P1]` = `docs/phase1-gap-closing.md`, `[census]` = `docs/venue-census.md`, `[dapp]` = `docs/dapp-design.md`, `[arch]` = `docs/everyone-architecture.md`. Venue notes are `docs/research/venues/<slug>.md`.

Binding decisions applied: runnable by everyone from day zero with nothing the author must operate and no custody of other people's credentials; nobody contacts the XO team; no browser automation of any third-party site; caps are advisory against a compromised agent unless enforced on-chain; every write path flag-gated OFF; no new wallet contracts written by us; PayBox upload is not available; the repo is public.

---

## 0. Bottom line

1. **The cross-chain half of the proposal is feasible as a "funding valve", not as "bet placement".** Value can be moved from any of the user's accounts on Base, Polygon, Arbitrum, BNB or HyperEVM to the account each venue requires, using existing audited rails, with no bridge of ours. After the funds land, the bet is an instant off-chain signed order. What the user experiences is "fund (seconds to minutes, sometimes 15 to 19 minutes), then bet instantly", not "bet from chain A that settles on chain B". Section 9.
2. **Atomic cross-chain bet placement is impossible for every venue in scope.** Orders on XO, Polymarket, Opinion, Predict.fun and Hyperliquid are signed messages matched off-chain by the venue; no bridge or destination call can bind an order to the arrival of funds, and no session policy can see an order's size ([25] 6.2, re-derived in section 2). The on-chain controllable quantity is how much value reaches each venue account per day. That is the cap that can honestly be enforced; the per-order cap cannot.
3. **Circle CCTP v2 does not cover BNB Smart Chain USDC.** Circle's supported-chains page lists "BNB Smart Chain (USYC only)" and says USDC is "supported on all CCTP domains except BNB Smart Chain"; Circle's own USDC address list has no BNB row; the public attestation API answers HTTP 400 "Invalid source/destination domain id" for a Base to domain 17 fee query (H, section 4.2). It would not help anyway: the BNB venues settle in USDT with 18 decimals ([09] 2.1, 2.2), not USDC.
4. **XO chain 3223 is reachable only through XO's own Hyperlane warp route from Base.** LI.FI, Relay, Across, deBridge and the LayerZero Value Transfer API do not list chain 3223 (chain-list probes; LI.FI quote to chain 3223 rejected with code 1011), and the Hyperlane registry has no XO chain. There is no verified exit (withdrawal) path for an outsider ([20] 7, [P1] 0.4). Direct Mailbox transactions on XO in the last 14 days: 400 of 400 were sent by one address (H, section 4.3), so third-party delivery is still unobserved.
5. **Hyperliquid HyperCore is reachable from every other venue chain** through four independent rails that all use chain id 1337 (Circle CCTP forwarder, LI.FI, Relay, Across; also Polymarket's bridge lists it). The recipient must be the owner EOA (the Hyperliquid account is the signer), the minimum is 5 USDC, and a new HyperCore account costs 1 USDC to activate (H, section 5).
6. **There are two honest tiers of rail, and the minimal safe pattern uses only the first.** Tier 1 ("direct rails"): we build calldata locally from pinned ABIs for CCTP `TokenMessengerV2`, Hyperlane `transferRemote` (XO) and Across `SpokePool`; public quote APIs inform the page but never supply the calldata we sign. Tier 2 ("aggregator rails": LI.FI, Relay, deBridge, Socket): the API returns calldata for a router with struct arguments; we can only decode and compare it, not lock it on-chain. Tier 3 (deposit-address services run by Fun.xyz, Candide, Relay, Socket, Across): provider holds funds in transit; fallback only.
7. **Candide is useful infrastructure, not a cross-chain solution.** Its bundler and paymaster cover Base, Polygon, Arbitrum, BNB, HyperEVM and eleven other mainnets, not 3223 (H). Public keyless endpoints exist, but mainnet sponsorship needs a funded gas policy; the free Starter plan allows 2,500 mainnet UserOps in total with 1,000 sponsored, then mainnet pauses (H). Its cross-chain products do not fit our decisions: Forwarding Address needs a team API key and a Candide-run relayer; Safe Unified Account needs EntryPoint v0.9 and asks the signer to approve a Merkle root; EIL is explicitly not live (H, section 6).
8. **"Gasless" is only partly true.** It is true where the venue or a funded policy pays (XO's PolicyPaymaster, Polymarket's relayer for Deposit Wallet operations, Opinion paying settlement gas); it is "gas paid in USDC" where Candide's ERC-20 paymaster is used; it is false for the first bridge transaction on the source chain unless someone funded a gas policy or the user holds a little native gas (H, sections 6 and 10).
9. **The guardrail that can be enforced on-chain, and its limit.** With a Kernel account and ZeroDev permission policies (CallPolicy argument conditions EQUAL and LESS_THAN_OR_EQUAL, RateLimit with reset, Timestamp) a session key can be locked to: token = USDC, spender = one router, bridge function = one selector, destination = one chain, recipient = one of the user's own pinned accounts, amount at most the per-call cap, count at most N per day (H docs, section 7.3). That bounds theft by a compromised agent at N times the per-call cap per day, to the user's own accounts. It does not bound trading losses inside a venue, and it cannot be applied to aggregator calldata (struct arguments; M). Candide's shipped Safe primitives do not do this (the Allowance Module lets a delegate send a token to any address; Safe Policies is a research page; Calibur is an EIP-7702 account) (H docs). Kernel can use Candide's standard ERC-4337 endpoints (M, untested).
10. **Build first (all flags OFF):** a read-only Funding Card in the Cockpit that shows route, fee, time and the pinned recipient from public CORS-open GET quote endpoints; then direct-rail builders with a decode-and-compare verifier that emit approval-gated PayBox `transaction` proposals (exact approval, one call); then status trackers. The smart-account hub with Candide infrastructure is optional and comes last (section 11).

---

## 1. Method, compliance, limits

- **Repository reading:** `docs/plan.md` status banner, `docs/phase1-gap-closing.md` sections 0 and 9, `docs/aggregation-design.md` and `docs/market-linking-design.md` and `docs/platform-registry-design.md` (skimmed for funding and venue-account facts only), `docs/venue-census.md` P0/P1, `docs/dapp-design.md` 2.7, and notes [09], [19], [20], [21], [25] in full or by section.
- **Public documentation fetched** (GET, User-Agent `insurance-markets-research/0.1`, 0.3 to 1.2 s apart, plain `.md` or `llms.txt` pages where offered): docs.candide.dev (about 30 pages), developers.circle.com (CCTP concepts, fees, finality, forwarding, HyperCore, contract addresses and interfaces, technical guide, USDC addresses), docs.hyperlane.xyz (audits, relayer, ICA, transfer-and-call), docs.li.fi (`llms.txt`, security), docs.across.to (HTML, converted to text locally), docs.relay.link (API keys, fees, refunds, smart accounts, audits, calling guide, Hyperliquid), docs.debridge.com (authentication, security, cancelling, fees), docs.socket.tech (API access, destination payload, chain support), docs.layerzero.network (Value Transfer API, Stargate), docs.polymarket.com (pUSD, bridge, wallets, contracts), docs.predict.fun and dev.predict.fun, docs.opinion.trade, docs.zerodev.app (policies).
- **Public GET probes (no key, no account):** Circle attestation API fee, allowance and keys endpoints; LI.FI `/v1/chains`, `/v1/tokens`, `/v1/quote` (6 quotes); Across `/api/swap/chains`, `/api/available-routes`, `/api/suggested-fees` (about 12 queries); deBridge `/v1.0/supported-chains-info` and one `order/create-tx` quote; Relay `/chains`; LayerZero Value Transfer API `/v1/chains`; Stargate `/v1/metadata`; Polymarket `bridge.polymarket.com/supported-assets`; the XO explorer v2 API (addresses, transactions, tokens); Sourcify contract lookups; `registry.npmjs.org/abstractionkit`; `gh api` reads of `candidelabs/*` and `hyperlane-xyz/hyperlane-registry`. `gh api` calls carry the local `gh` login, which GitHub can see (disclosed, as in [20] and [25]).
- **Refused on purpose:** every POST, so no Candide bundler or paymaster call, no Relay `/quote/v2`, no LayerZero `/quotes`, no `eth_getCode` or `eth_call` (JSON-RPC is POST); creating any API key or dashboard account (Candide, Relay, Across, deBridge, Socket, LayerZero); any PayBox tool. Per-chain contract presence is therefore established by Sourcify and explorer GETs (a lower bound) and flagged where it matters.
- **Incidents and screening seen while probing:** my first deBridge quote used a placeholder recipient made of repeated `1` digits and was refused with `COMPLIANCE_ADDRESS_BLOCKED` ("liquidity at your address is flagged as high-risk"); a different synthetic address worked. The lesson is real: providers screen addresses, and a plugin must show that failure plainly. The LI.FI probes used a similar placeholder as `fromAddress` and were not refused. No placeholder address belongs to anyone I know; none appears in this file.
- **Instruction-like content in third-party pages** (treated as untrusted data, none followed): the Circle docs carry an "Agent Instructions" preamble advising installation of skills and an MCP server; the Opinion and Candide pages carry GitBook or Mintlify "ask" and "install skills" boilerplate; the LI.FI and Across indexes advertise MCP servers. None was installed or called.
- **Privacy:** the only identifier on any request was the fixed User-Agent. No personal identifier appears in this file or in the scratch files.
- **Scratch files** (raw probe JSON, converted pages, three small Python helpers) live outside the repository and are not part of the deliverable.

---

## 2. Re-testing the earlier findings the user's proposal challenges

| # | Earlier finding | Re-test this session | Result |
|---|---|---|---|
| E1 | Each venue forces its own account type ([25] 0.6, [dapp] 2.7). | Predict.fun docs: a "Predict Smart Wallet" built with Privy (owner EOA) and ZeroDev (Kernel-class contract wallet), BNB Chain, USDT only; plus a "Global Deposit Address" for USDC or USDT from Ethereum, Base and Arbitrum, powered by Fun.xyz (H, [wallets](https://docs.predict.fun/knowledge-base/wallets.md), [first purchase](https://docs.predict.fun/the-basics/making-your-first-purchase.md)). Polymarket: accounts deployed on or after 2026-05-04 use a Deposit Wallet ([wallets-auth](https://docs.polymarket.com/trading/wallets-auth.md), H). Opinion: Safe "trading wallet" ([09] 2.2, H). XO: Kernel v3.1 ([19], H). | **Holds.** New nuance: Predict.fun also accepts a plain EOA ([09] 2.1), so a user who wants an EOA flow can have one; the contract-wallet venues are XO, Polymarket (new accounts), Opinion and Predict's own smart wallet. A generic Candide Safe is the venue account of none of them. |
| E2 | PancakeSwap prediction rejects contract callers. | Not re-run; relies on the venue notes (`pancakeswap-prediction.md`, `tendieswap.md`, H source) cited in [25] 4.1. | Stands. Any bet there is an EOA transaction; a hub contract can only fund the EOA. |
| E3 | On-chain session policies cannot cap off-chain-signed CLOB orders. | Re-derived: a ZeroDev permission validates UserOperations (calls) against policies; an order is an EIP-712 message that the venue's backend matches and a venue contract settles from the venue account, so no UserOp of the session key exists to inspect. ZeroDev's Signature policy only lists which callers may validate signatures (docs index line, H); no policy decodes order amounts (M). | **Holds.** Venue-native scoped keys are the analogue: Polymarket Session Keys (beta, Deposit Wallet only, cannot withdraw), Hyperliquid agent wallets (signing only) ([25] 3 iv-b). The cap that can bind is the funding valve into each venue account. |
| E4 | PayBox signs typed data on ten EVM chains, not 3223, and cannot sign raw digests through WalletConnect. | Not re-testable (no PayBox call allowed). Taken as the premise stated by the user and recorded in [25] and [06]; tagged M. | Consequence found: Candide's Safe accounts sign UserOperations as EIP-712 typed data and AbstractionKit's `ExternalSigner` interface accepts a custom `signTypedData` backend "for HSM, MPC, hardware wallet, remote signer" (H, [external-signers](https://docs.candide.dev/wallet/abstractionkit/external-signers.md)), so a PayBox `typedData` intent can in principle sign a Safe UserOperation on 56, 137, 8453 and 42161. XO's Kernel v3.1 UserOp needs a raw 32-byte digest ([21] 5, [25] 4.1), which is the harder path. Whether PayBox renders and signs a `SafeOp` domain is untested (T-XC7). |
| E5 | Third-party delivery on XO's Hyperlane route is unobserved (door (e), [P1] 9 A6). | New read: first 400 direct transactions to XO's Mailbox, newest first (2026-10-06 to 2026-10-20): all 400 from one address, all method `0x7c39d130` (`process(bytes,bytes)`), 383 `ok`, 17 `error` (reason not shown by the explorer) (H, section 4.3). Executor-mediated deliveries would not appear in this list. | **Unchanged.** Still no observed delivery by anyone but XO's relayer. |
| E6 | BNB USDC is not on CCTP ([25] 7.1). | Circle supported-chains page, USDC address list, and a live fee query (section 4.2). | **Confirmed** (H). |
| E7 | Mainnet gas sponsorship is a paid service everywhere ([25] 7.2). | Candide: Starter $0 with 2,500 mainnet UserOps in total and 1,000 sponsored; Launch $333 per month (H, [pricing](https://candide.dev/pricing) via WebFetch, [billing](https://docs.candide.dev/wallet/pricing.md)). Candide also lists "public gas policies" set up by dApps; no public policy that sponsors strangers is documented (NOT FOUND, searched `instagas/*`, `wallet/guides/send-gasless-tx`). | **Confirmed.** Sponsorship needs a funded policy owned by someone. |

---

## 3. What has to arrive where (the targets)

"Receiving account" is the address that must hold the money before an order can be placed. Funding any other address is a loss or a recovery task.

| Venue | Chain | Collateral token | Receiving account | Min or friction | Source |
|---|---|---|---|---|---|
| XO | 3223 | USDC.e (6 dec) `0x80c12230...ab0c` | Kernel v3.1 account `K`, deployed and registered by XO's stack (four doors, [P1] 0) | none in code; undeployed `K` can only move funds by a UserOp | [20] 3.4, [P1] 0 |
| Polymarket | Polygon 137 | pUSD (6 dec) `0xC011a7E1...2DFB` | Deposit Wallet `W` (CREATE2 from the owner, [25] 3 i) | Bridge API minimum $2 per asset; wrap path takes USDC.e (doc) | [pusd](https://docs.polymarket.com/concepts/pusd.md), [supported-assets](https://bridge.polymarket.com/supported-assets), H |
| Predict.fun | BNB 56 | USDT (18 dec) | Predict Smart Wallet `P` (USDT only) or owner EOA | min order 1 USDT | [09] 2.1, wallets doc, H |
| Opinion | BNB 56 | USDT (18 dec) | Safe trading wallet `S` (venue-created) | min order $5 | [09] 2.2, H |
| PancakeSwap prediction | BNB 56 | BNB | owner EOA only (contract callers rejected) | | venue note, H |
| Hyperliquid HIP-4 | HyperCore | USDC | owner EOA (account = signer) | deposit below 5 USDC lost on the direct bridge; 1 USDC activation fee for a new HyperCore account | [census], [Circle HyperCore](https://developers.circle.com/cctp/concepts/cctp-on-hypercore.md), [Relay fees](https://docs.relay.link/references/api/api_core_concepts/fees.md), H |
| Limitless, Trueo | Base 8453 | USDC | owner EOA | | [09] 2.3, [25] 4.1 |

Two consequences. (a) The "recipient equals the user's own account on the destination chain" rule has to read "equals one of the user's pinned venue accounts for that chain", because the right recipient differs per venue and is rarely a generic hub address. (b) The BNB venues need USDT, so the USDC the user holds on Base or Polygon must change token on the way; only aggregator rails (LI.FI, Relay, deBridge, Socket, Stargate pools) do that in one transaction, or Across does it as two tokens' worth of direct routes (Base USDT to BNB USDT exists, Base USDC to BNB USDC does not help).

---

## 4. The rails

### 4.1 Comparison matrix

"Non-custodial" means the user's funds are never controlled by a key of the provider's team on the path, only by contracts and solvers that fill with their own capital (intent rails) or burn-and-mint (CCTP); it is **not** a statement that nobody can freeze or upgrade. "Smart-account caller" is whether the origin call can come from a contract account (all of the contract entry points below are ordinary functions; none restricts callers in the docs I read; stated M unless noted).

| Rail | Custody and trust (H unless tagged) | Audits named by the provider | Polygon, Base, Arbitrum, BNB, HyperCore, XO 3223 | Key or terms | Dest.-chain execution | Typical time | Fee at $20 (probe 2026-10-20) | Failure and refund | Incidents found |
|---|---|---|---|---|---|---|---|---|---|
| **Circle CCTP v2** (burn on source, Circle attestation, mint on destination) | Circle signs attestations; USDC issuer can blacklist ([20] 3.4); no pooled liquidity | ChainSecurity, OtterSec; ChainSecurity again for the fee-switch version ([technical guide](https://developers.circle.com/cctp/references/technical-guide.md)) | Polygon, Base, Arbitrum yes; BNB **no for USDC**; HyperEVM yes; HyperCore via forwarder hook; **XO no** | Attestation API needs no key (GET probes); the `destinationCaller` field can restrict who mints | Hooks; `depositForBurnWithHook`; Forwarding Service mints for you; HyperCore deposit hook | Base to Polygon fast: attestation about 8 s, plus the destination mint; standard from Base 15 to 19 min; Polygon to Base standard about 8 s (no Fast option needed) | Base to Polygon fast 1.3 bps, standard 0; forwarding fee 0.0591 USDC to Polygon, 0.0877 to HyperEVM (Iris GET) | A burn has no documented cancel; an unminted message can be minted by anyone if `destinationCaller` is zero; expired fast attestations can be re-attested | No exploit of CCTP found; scheduled attestation pauses of about 1 h on single chains reported by a third-party status aggregator (M); USDC freeze politics (M) |
| **Hyperlane warp route Base to 3223** (XO's own deployment, `0x54716A53...DF5F`) | 2-of-3 validator multisig; one EOA owns both ProxyAdmins and is the USDC.e blacklister ([20] 3.3) | Hyperlane core audited (Trail of Bits v3, ChainLight 2025, others, [audits](https://docs.hyperlane.xyz/docs/resources/audits.md)); the XO deployment itself: none known | Only Base to XO; not in the Hyperlane registry (351 chains, none XO, H) | no key; no fee; `msg.value` must be 0 ([20] 2) | Hyperlane ICA exists generally; **no ICA router on XO known** (NOT FOUND) | median 14 s, p90 24 s, max 27 s over 253 deliveries ([20] 6) | 0 | No refund or cancel; wrong recipient encoding strands funds ([20] 4.1) | None found for Hyperlane in general (searched); XO route: none known |
| **LI.FI** (aggregator over many bridges and DEXs; single diamond contract) | Non-custodial router; selects among bridges (probe selected LI.FI Intents, Mayan Swift, Polymer) | "Multiple independent audits", $1M bounty ([security](https://docs.li.fi/introduction/learn-more/security-and-audits.md)); reports in `lifinance/contracts` | all five chain families yes, incl. chain 1337; **3223 no** | Unauthenticated: 100 requests per window (response header `ratelimit-limit: 100`, reset 60); key for more | `POST /quote/contractCalls`, Composer (not probed) | 3 s (Mayan), 8 s (Intents), 18 min (Polymer standard) in my quotes | fixed fee $0.0501 (0.25%) plus route cost | status `DONE` with `REFUNDED`, `PARTIAL` substatus ([llms.txt](https://docs.li.fi/llms.txt)) | 2022-03 post-mortem (M, title only); **2024-07-16** diamond exploit via a new facet, roughly $8M to $11.6M (M, figures disagree) |
| **Socket / Bungee** (aggregator) | Non-custodial router | audits page is a GitHub listing (not parsed) | BSC, HyperEVM, Hypercore (1337) listed; others not checked individually; 3223 not listed | public endpoint, no auth, shared, "testing and prototyping"; domain-whitelist or key for production | "Destination Payload Execution" guide | not measured | not measured (public quote path 404 on `/v3/swap/chains` in my probe) | not read | **2024-01-16** SocketGateway, about $3.3M, a route added days earlier, drained token approvals (M) |
| **Across** (intents with relayers, optimistic settlement via UMA; BNB on the newer ZK-settled path) | Relayers front the money; users deposit into a SpokePool; refunds go through a settlement bundle | Across V2, V3, V3 incremental, UMA audits ([audits](https://docs.across.to/introduction/audits), names only) | Polygon, Base, Arbitrum, BNB (USDC, USDT, ETH), HyperEVM, HyperCore 1337; **3223 no** | Production wants API key plus integrator id; **unauthenticated GETs worked** (suggested-fees, available-routes) | Embedded actions via `MulticallHandler`; API key required for the Swap API | 0 to 2 s estimated fill (my probes) plus origin confirmation | Base to Arbitrum 0.053%, Base to Polygon 0.038%, Arbitrum to Base 0.031%, Base to BNB USDC 0.033%, BNB to Base 0.031%, Base USDT to BNB USDT 0.36% | Unfilled deposit: refund to `refundAddress` after bundle settlement, "several hours" ([refunds](https://docs.across.to/introduction/refunds)) | **2026-07-17** Solana relayer logic flaw, net loss under $4M, SpokePools not compromised (M); 2025-09 Lens SpokePool upgrade mistake, LP funds locked 3 to 4 days (M) |
| **Relay** (intents; non-upgradable Depository escrow) | Depository non-upgradable, withdrawals authorised by an MPC allocator under a Security Council (H) | Spearbit (Feb 2025), Certora (Jun 2025), Zellic (Nov 2025, Apr 2026) ([security](https://docs.relay.link/references/protocol/security.md)) | all five incl. chain 1337 and pUSD on Polygon; **3223 no** | **API key required on `POST /quote/v2` from 2026-10-02**; self-serve in a dashboard | `txs[]` calls on destination; ERC-4337 and 7702 documented | not measured (POST) | $0.02 flat plus destination gas, 0 to 0.15% platform fee by asset class ([fees](https://docs.relay.link/references/api/api_core_concepts/fees.md)) | refund to `refundTo` on origin chain minus gas; no `refundTo` means no automatic refund | none found (one search; a June 2026 "Relay Protocol" report on a single blog was disputed and appears to be another project, M) |
| **deBridge DLN** | Intent rail with validator-signed messaging | Halborn, Neodyme, Zokyo; "more than 25" in a third-party summary (M) | Polygon, Base, Arbitrum, BNB, HyperEVM (internal id 100000022); 3223 no | unauthenticated 50 requests per minute (H); key for 300 | hooks / external calls | not measured | 20 USDC in became 19.968 USDT out on Base to BNB: protocol fee 4 bps, operating expense $0.455 prepended, plus a flat native `fixFee` of 0.001 ETH | cancel on the **destination** chain by the order authority, funds return in full "including affiliate and protocol fees" ([cancelling](https://docs.debridge.com/dln-details/integration-guidelines/order-creation/cancelling-order.md)) | none found; a Lazarus phishing attempt reported (M) |
| **Stargate / LayerZero** | LayerZero DVN verification; Stargate pools hold liquidity | LayerZero audits general; Stargate-specific: NOT FOUND | pools: Base USDC, Arbitrum USDC and USD₮0, Polygon USDC and USDT0, BNB USDC (peg, 18 dec) and USDT (H, Stargate metadata); HyperEVM not in that metadata | Value Transfer API: chains public, **quotes need `x-api-key`**; old Stargate API returns 410 "deprecated" | Taxi mode only: `composeMsg` and `lzCompose`; Bus mode cannot compose | not measured | not measured | not measured | **2026-04-18/19** Kelp DAO rsETH mint, about $292M, a 1-of-1 DVN configuration; LayerZero has since ended support for 1-of-1 (M). The DVN setting of Stargate's own pools: NOT CHECKED |
| **Candide Forwarding Address** | Candide-run relayer; routes via Across, LayerZero OFT, CCTP; recipient can always withdraw from the deployed forwarder; a "custodial withdrawer" can after a timelock | Not stated on the pages read | Route list is behind the team key (`forwarding_getRoutes`) | team API key plus a policy bearer token from a dashboard; fee 50 bps in the example | n/a | not stated | `feeBps` 50 in the doc example | recovery frontend; TTL-based monitoring: deposits after expiry sit until reactivated | none found |
| **Polymarket Bridge** (provider Fun.xyz) | Per-wallet deposit addresses operated by the provider; compliance holds possible | not stated | deposits from Ethereum, Arbitrum, Base, BNB, HyperEVM, Hypercore 1337, Solana and others to pUSD on Polygon | no key; optional builder-code header | n/a | quote example `estCheckoutTimeMs` 45,000 | example fee 0.3% | stuck or held funds go to the provider's support | none found |

Everything in the matrix cells tagged "not measured" is NOT FOUND in the public docs I read or needs a POST to measure.

### 4.2 CCTP: the BNB question and the live numbers

- Supported blockchains (H, [supported chains](https://developers.circle.com/cctp/concepts/supported-chains-and-domains.md)): the table row reads "BNB Smart Chain (USYC only)"; the tokens section reads "USDC: Supported on all CCTP domains except BNB Smart Chain". Domain ids used here: Ethereum 0, Avalanche 1, OP 2, Arbitrum 3, Solana 5, Base 6, Polygon PoS 7, BNB Smart Chain 17, HyperEVM 19.
- Circle's USDC contract address list (H, [usdc-contract-addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses.md)) has Base `0x8335...2913`, HyperEVM `0xb883...630f`, Polygon `0x3c49...3359` and no BNB row (grep for bnb, bsc, binance returned nothing).
- Live: `GET https://iris-api.circle.com/v2/burn/USDC/fees/6/17` returned HTTP 400 `{"error":"Invalid source/destination domain id"}` while `6/7` and `3/6` returned 200 (H, 2026-10-20).
- `TokenMessengerV2` is `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` on every listed EVM mainnet domain except EDGE (H, [contract addresses](https://developers.circle.com/cctp/references/contract-addresses.md)); Sourcify reports an exact match for it on Base (verified 2025-03-11, H). Presence on Polygon and Arbitrum is not established by me (no JSON-RPC).
- Fee and speed probes (H, 2026-10-20 about 07:17 UTC): Base to Polygon (6/7) fast 1.3 bps, standard 0; Arbitrum to Base (3/6) fast 1.4 bps; Polygon to Base (7/6) fast 0 and standard 0; Base to HyperEVM (6/19) 1.3 bps fast, forward fee low/med/high 77,880 / 87,738 / 97,597 USDC subunits ($0.078 / $0.088 / $0.098); Base to Polygon forward fee 59,103 to 59,228 subunits (about $0.059). Fast Transfer allowance at that moment 54,050,923 USDC.
- Attestation times: Base and Arbitrum about 8 s fast and about 15 to 19 min standard; Polygon about 8 s standard (no Fast option listed because standard is already quick); HyperEVM about 5 s standard (H, [finality](https://developers.circle.com/cctp/concepts/finality-and-block-confirmations.md)). A destination mint still needs a transaction: either the user's own gas on Polygon, or the Forwarding Service (fee above).
- HyperCore: "The burn transaction includes a hook that calls the `CctpForwarder` contract on HyperEVM to forward the USDC to the recipient address on HyperCore"; HyperCore deposits from any CCTP chain are supported; forwarding is optional with a $0.20 service fee; Arbitrum to HyperCore has no Fast fee; a new HyperCore account pays a one-time 1 USDC activation fee set by Hyperliquid (H, [CCTP on HyperCore](https://developers.circle.com/cctp/concepts/cctp-on-hypercore.md), [forwarding](https://developers.circle.com/cctp/concepts/forwarding-service.md)).
- No cancel or refund for a burn: not found in the contract-interfaces page (no `replaceDepositForBurn` or `cancel`), the technical guide or the retry-failed-mint page (NOT FOUND, searched those three). Failed or missed mints are retried, not reversed.

### 4.3 The XO route, re-observed

- Still live (H, XO explorer GET 2026-10-20): the XO route `0x9090...1983` is a contract with implementation `0xdc4b86B0...D052` (unchanged from [20]); USDC.e total supply 343,858.91 across 3,112 holders (was 342,161.18 on 2026-10-18 per [20], so about $1,700 net inflow in two days).
- On-chain verification of the Base side that I could redo without JSON-RPC: Sourcify exact match for the router implementation `0x5b3F3241...926a` on Base (verified 2026-06-20, H).
- Delivery concentration: the XO explorer's transactions list for the Mailbox `0xfDd96df1...a470` (50 per page, 8 pages, 2026-10-06 to 2026-10-20) shows 400 transactions, one sender, one method (`process`), 17 failed. This does not show who could deliver, only who did (H). Third-party delivery needs native XO gas, which outsiders lack ([20] 1, 7).
- Hyperlane Interchain Accounts (ICA) would, in principle, let a Base-side account control an account on the destination (documented generally, EVM only, H) and so could carry a withdrawal; whether any ICA router exists on XO's independent Mailbox: NOT FOUND (no way to check without a code read); treat as a hypothesis (H2 below), not a path.
- **XO exit remains the one unproven leg.** The only candidates are XO's app executor ([20] 7) and hypothesis H1 of [P1] 3 (a paymaster-less, zero-fee UserOp `[USDC.e.approve, route.transferRemote(8453, owner, a)]`). Until test T4 of [P1] passes, XO funding is a one-way valve for an outsider and must be sized as a loss-tolerant amount.

### 4.4 Aggregator probes (what the APIs actually returned)

| Probe (2026-10-20) | Result |
|---|---|
| LI.FI chain list | 65 chains; contains 1, 10, 56, 137, 999, 8453, 42161, 4663 and 1337 ("Hyperliquid EVM"); **no 3223, no 4162** |
| LI.FI quote, 20 USDC Base to BNB USDT (`0x55d3...7955`) | tool LI.FI Intents, out 19.96127 USDT, estimated 8 s, fee $0.0501 + gas $0.0031, approval and transaction target `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE` on Base |
| LI.FI quote, 20 USDC Base to Polygon pUSD | tool Mayan Swift, out 19.909 pUSD (min 19.736), estimated 3 s, same target |
| LI.FI quote, 20 USDC Base to Arbitrum USDC | tool Polymer Standard, out 19.95 USDC, estimated 1,080 s (18 min), same target |
| LI.FI quote, 20 USDC Base to HyperCore "USDC (Perps)" (chain 1337) | tool Polymer Standard, out 19.95, estimated 1,080 s, same target |
| LI.FI quote to chain 3223 | HTTP 400, code 1011, "/toChain must be equal to one of the allowed values" |
| Across chain list (`/api/swap/chains`) | 24 chains; includes 56, 137, 999, 1337, 8453, 42161; no 3223 |
| Across `suggested-fees`, 20 USDC | Base to Arbitrum: out 19.989453, fill 1 s, SpokePool Base `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64`, Arbitrum `0xe35e9842fceaCA96570B734083f4a58e8F7C5f2A`, minimum deposit about $0.50; Base USDC to BNB USDC(peg) out 19.9935 in 0 s; Base USDC to BNB **USDT** returned `ROUTE_NOT_ENABLED`; Base USDT to BNB USDT out 19.928 |
| Relay chain list | 60 chains; includes 56, 137, 999, 8453, 42161, 1337; no 3223; Polygon solver currencies include pUSD |
| deBridge chain list | 18 chains; includes 56, 137, 8453, 42161, HyperEVM (id 100000022); no 3223; quote Base USDC to BNB USDT: in 20.454942, out 19.968016, fee detail above |
| LayerZero Value Transfer API `/v1/chains` | 97 entries; BNB Chain, Polygon, Base, Arbitrum, Hyperliquid (999); no 3223 |
| Stargate `/v1/metadata?version=v2` | pools for Base USDC `0x27a16dc7...5d26`, BNB USDT `0x138EB30f...bc63`, BNB USDC(peg) `0x962Bd449...6057`, Polygon USDC and USDT0, Arbitrum USDC and USD₮0; no Base USDT pool |
| CORS | `access-control-allow-origin: *` on the Circle attestation API, Across, LI.FI, deBridge, Polymarket Bridge, LayerZero chains, Stargate metadata, Relay chains, the XO explorer API and Sourcify (GET with an `Origin` header) |

All of the keyless quote endpoints above can be called from a static page with GET, which suits the local-first decision.

---

## 5. Venue by venue: the funding route I would specify

"Direct" = Tier 1 (calldata built by us). "Agg." = Tier 2 (API-built calldata, decoded and compared). The page always shows the pinned recipient and the provider's route; none of this is a recommendation to fund a geo-restricted venue (US, UK, France, Ontario, Singapore and others are barred by Predict.fun and Opinion terms, [09] 2.1 and 2.2, dated Nov and Oct 2025, possibly stale).

| Venue | Source (typical) | Rail | Recipient | Last mile | Time (H quote or doc) | Unknowns |
|---|---|---|---|---|---|---|
| **XO** | USDC on Base | Direct: `USDC.approve(router, a)` then `transferRemote(3223, bytes32(K), a)` on `0x54716A53...DF5F`, `value` 0 ([20] 4) | `K` (left-padded to 32 bytes; never the owner EOA) | none; `K` must be deployed and registered first | median 14 s, max 27 s (n=253) | Do XO's relayer and orderbook serve a non-app transfer (door (e), T3a); exit path |
| **Polymarket** | USDC on Base or Arbitrum, or on Polygon | Agg.: LI.FI to **pUSD** returned a quote via Mayan Swift (3 s); fallback Tier 3: Polymarket Bridge deposit address; direct alternative: CCTP to native USDC on Polygon, then swap to USDC.e and `CollateralOnramp.wrap` | `W` (Deposit Wallet) | Wrap takes USDC.e per the pUSD page; the deposit page says "USDC (native) or USDC.e". Conflict inside Polymarket's docs: NOT FOUND whether `wrap` accepts native USDC. `W` must be deployed (Builder or Relayer key made by the user in Polymarket's UI, [25] 4.1) | 3 s (quote) to about 45 s (bridge estimate) | `W` deployment; geoblock; whether LI.FI/Mayan pUSD delivery to a contract wallet succeeds |
| **Predict.fun** | USDC on Base or Arbitrum | Agg.: LI.FI Base USDC to BNB USDT, recipient `P` or the owner EOA; Tier 3 alternative: its Global Deposit Address (USDC or USDT from Ethereum, Base, Arbitrum) | `P` (Smart Wallet, USDT only) or EOA | none | 8 s (quote) | `P`'s address derivation: NOT FOUND (docs show a deposit address in the app); delivery to `P` by an aggregator is untested |
| **Opinion** | USDC on Base | Agg.: LI.FI to BNB USDT, recipient `S` | `S` (Safe trading wallet) | "Enable Trading" done once by the owner ([09] 2.2) | 8 s (quote) | `S` address comes from onboarding, not derivation |
| **Hyperliquid** | USDC on Base, Arbitrum, Polygon | Direct: CCTP `depositForBurnWithHook` with the `CctpForwarder` hook to HyperEVM then HyperCore (Circle's own flow); Agg. alternatives: LI.FI/Relay/Across with chain 1337 | owner EOA | at least 5 USDC; plus 1 USDC activation for a new account | LI.FI quote 18 min via Polymer; Circle fast from Arbitrum about 8 s attestation plus HyperEVM mint | The exact hook bytes need to be taken from Circle's HyperCore how-to and tested; `CctpForwarder` address list on the HyperCore references page (not read in full) |
| **BNB to elsewhere (exit)** | USDT on BNB | Agg. or direct: Across BNB to Base (USDT 0.028%, USDC-peg 0.031%, 2 s est.) | owner EOA or hub on Base | | 2 s estimated fill | Across BNB is on the newest settlement design (first chain with ZK settlement, [BNB guide](https://docs.across.to/guides/migration/bnb)) |
| **Limitless, Trueo (Base)** | USDC on Base | no cross-chain step if funds are already on Base | owner EOA | | n/a | |

---

## 6. What the AA layer adds, and what Candide specifically offers

### 6.1 Candide facts (all H from docs.candide.dev unless tagged)

| Item | Fact |
|---|---|
| Mainnets served by bundler and paymaster | Arbitrum 42161, Avalanche 43114, Base 8453, BNB 56, Celo 42220, Ethereum 1, Gnosis 100, HyperEVM 999, OP 10, Plasma 9745, Polygon 137, Somnia 5031, Tempo 4217, Worldchain 480; Solana paymaster (Kora). Extended on request: zkSync, Linea, Ink, Unichain, Mantle, Blast, Scroll, Sonic, and others. **Not 3223.** ([supported networks](https://docs.candide.dev/wallet/api/supported-networks.md)) |
| Keyless endpoints | `https://api.candide.dev/public/v3/{chainId}`, "No API required. Available on mainnets and testnets", rate-limited per IP ([public endpoints](https://docs.candide.dev/wallet/api/public-endpoints.md)). Not probed (JSON-RPC is POST). |
| Keyed endpoints | `https://api.candide.dev/api/v3/{chainId}/{API_KEY}`, key from a dashboard, "No sales call required" |
| Pricing | Starter $0: 2,500 mainnet UserOps in total, no time limit, then mainnet pauses; 1,000 sponsored total; 10 requests per second. Launch $333 per month: 100,000 UserOps, 5,000 sponsored, $0.01 per extra sponsored op, 50 rps. Grow $749. Enterprise $3,000+. Gas is passed through at cost; sponsored gas is paid from funds deposited in the policy ([billing](https://docs.candide.dev/wallet/pricing.md), pricing page via WebFetch) |
| Gas in ERC-20 | Paymaster accepts BSC-USD (USDT) and Binance-Peg USDC on BNB, USDC on Base and Polygon, others ([tokens supported](https://docs.candide.dev/wallet/paymaster/tokens-supported.md)); the paymaster's markup for this mode: NOT FOUND |
| Account classes in AbstractionKit 0.4.3 (MIT, published 2026-10-06; repo 36 stars, `pushed_at` 2026-10-06) | Safe v0.2 and v0.3 (EntryPoint v0.6 and v0.7), `SafeMultiChainSigAccountV1` (EntryPoint v0.9), Calibur (EIP-7702, Uniswap-built, audited by OpenZeppelin and Cantina), Simple7702 (v0.8, v0.9). No Kernel. A different account class yields a different address for the same owner ([safe unified](https://docs.candide.dev/wallet/abstractionkit/safe-unified-account.md)) |
| Address derivation | `SafeAccount.initializeNewAccount([owner])` returns `accountAddress` before deployment (docs example); with one owner it is a pure function of the owner list and parameters. "Derived from a PayBox wallet or any other wallet" is therefore literally true for owner addresses, with the cautions of [25] 5.3 (same address across chains only where the same singleton, factory and `saltNonce` exist; per-chain code check before showing it as fundable). |
| Safe Unified Account (chain abstraction) | One signature over a Merkle root of several per-chain UserOperations; EntryPoint v0.9; module audited by Nethermind (NM-0874); live demo only; consolidation "via CCTP or LayerZero" (H, [overview](https://docs.candide.dev/wallet/guides/chain-abstraction-overview.md)). Repo `candidelabs/safe-4337-multi-chain-signature-module` has no license field in the GitHub API response and 3 stars (H). The approver would see a Merkle root, which is the opaque-digest problem [P1] A4 warns about. |
| Forwarding Address | Section 4.1. Needs a team key and a bearer token; Candide's relayer moves funds; a custodial withdrawer role exists with a timelock. Not compatible with "nothing the author operates" unless every user creates their own Candide account. |
| EIL (Ethereum Interoperability Layer) | "Production releases planned following EIL's mainnet launch" (H, [eil](https://docs.candide.dev/account-abstraction/research/eil.md)): not available. |
| Session keys / policies | Allowance Module (Safe module, audited by Ackee 2024): per-delegate token allowance with reset, delegates can send to any `to`; Calibur: per-key expiry, hooks, admin flag; "Safe Policies" is a research page (role permissions, spending limits, address allowlists described as a design) (H). None of these is a shipped "target + argument + daily cap" session policy for arbitrary contract calls. |

### 6.2 What an AA hub buys for bridging, and what it costs

| Property the proposal wants | Without an AA hub (Option 0: PayBox EOA plus PayBox proposals) | With a hub (Safe via Candide, or Kernel) |
|---|---|---|
| One signature for approve plus bridge | No: two proposals, two approvals ([20] 9) | Yes: one UserOperation batching approve, call, approve(0) |
| Gas | Source-chain native token from the EOA | Paymaster: pay in USDC (Candide ERC-20 mode) or sponsored by a funded policy |
| On-chain guardrail for an agent key | None (PayBox grants are server-side; caps advisory) | Only with Kernel policies (section 7.3) or a Safe with an added role module; never with Candide's shipped Safe primitives alone |
| Where funds sit | In the EOA the venue accounts are owned by | In a second address that must also be funded and tracked; positions still live in venue accounts |
| PayBox signing | `transaction` intents on its supported chains | Safe: `typedData` (M, T-XC7); Kernel on XO: raw digest (blocked by the stated PayBox limit) |
| Cost to the user | Bridge fee plus ETH gas | Bridge fee plus gas in USDC or sponsored; plus Candide plan or own policy funding; plus first-deployment gas |
| Chains | Whatever PayBox signs transactions for (not 3223) | Candide lists 14 mainnets (not 3223); XO needs its own bundler |

The honest reading: for a funding step that happens a few times a day and tolerates minutes, the hub's main value is gas abstraction on the source chain and, with Kernel, an on-chain bound on a delegated agent key. Neither is needed to move money correctly. That is why section 11 puts the hub last.

---

## 7. The minimal safe pattern

### 7.1 Invariants (a transfer that violates one is refused before any signature is requested)

1. **Recipient is a pinned venue or owner account.** The destination address must be an entry of the account map ([25] 8.1) whose status is `code-present` or `venue-registered` for that chain, and its type must match the venue (K for XO, W for Polymarket, S for Opinion, P or the EOA for Predict.fun, the owner EOA for Hyperliquid, Limitless, Trueo and PancakeSwap). A counterfactual address is never a recipient ([P1] A11). The recipient is never read from a provider response.
2. **Source token and destination token are on a pinned list** per (chain, rail): Base USDC `0x8335...2913`, Polygon USDC `0x3c49...3359`, Arbitrum USDC `0xaf88...5831`, Base USDT `0xfde4...9bb2`, BNB USDT `0x55d3...7955`, Polygon pUSD `0xC011...2DFB`, XO USDC.e `0x80c1...ab0c`, with decimals (BNB USDT has 18, Base USDC has 6) compared on both sides. Anything else is refused.
3. **Spender and target are pinned** to the rail's contract: Hyperlane router `0x54716A53...DF5F` (XO), CCTP `TokenMessengerV2` `0x28b5...cf5d`, Across SpokePool per chain (Base `0x09ae...EC64`, Arbitrum `0xe35e...5f2A`; Polygon and BNB addresses to be read from Across's contract list and checked for code before pinning), LI.FI Diamond `0x1231DEB6...4EaE` for Tier 2. Each pin carries chain id, selector and an EIP-55 check ([P1] 2.3 found ten bad-checksum strings in earlier notes).
4. **Approval is exact and temporary:** `approve(spender, amount)` with `amount` equal to the transfer, then `approve(spender, 0)` after, ideally in the same batch. LI.FI's 2024 loss and Socket's 2024 loss both drained wallets that had left token approvals standing on the exploited contract (M, sources in section 4.1).
5. **Value:** native `value` is 0 for Hyperlane and CCTP; for deBridge it must equal the quoted `fixFee`; for LI.FI it must equal the quote. Anything else is refused.
6. **Caps:** amount at most the existing funding counter ([P1] defaults: $10 per funding, advisory; the daily $50 is the day cap and the creation fee and seeds count toward it). Cross-venue totals add up in one ledger. Caps are advisory against a compromised agent unless section 7.3 is in force, and every tool description says so.
7. **Minimums** from the rail and the venue are enforced: Hyperliquid 5 USDC (+1 activation), Polymarket bridge $2, Across about $0.50, Opinion order $5, Predict order 1 USDT.
8. **The page shows, before approval:** rail and provider, source and destination chain and token, input, minimum output, total fee in token and in percent, expected time (provider estimate and the pessimistic bound from section 9), the pinned recipient with its label, the refund address and the refund path in words, the contract and selector, the quote's age. If any field is unknown it prints `unknown`, not a guess.

### 7.2 Procedure (state machine)

`quote` (public GET, no signature) -> `verify` (decode the calldata we built, or the API's calldata for Tier 2, and compare every field with invariants 1 to 7) -> `prepare` (emit the PayBox `transaction` proposals: exact approve, then the bridge call; each expires in 300 s) -> `approve` (human) -> `submitted` -> `source_confirmed` -> `in_flight` -> `destination_credited` | `refund_pending` | `stuck`.

Rules, reusing existing relay rules ([P1] A2, A6): write the `sending` marker before the first proposal is handed out; never re-send after an ambiguous result (read the allowance, the source balance and the rail's status first); report `dispatched_not_delivered` after a rail-specific timeout (section 9) and never resend; ground truth for arrival is the destination token balance and, for Hyperlane, `Mailbox.delivered(messageId)` (never the explorer's log index, [20] 6.3); a funded venue account is not "ready" until the venue's own read (for XO, `smart_account` non-null; for Polymarket, the CLOB balance) shows it.

**Tier 1 builders (we write the calldata):**
- Hyperlane (XO): `transferRemote(uint32 3223, bytes32 K_padded, uint256 a)`, selector `0x81b4e8b4`, as specified in [20] 4. Re-decode and require upper 12 bytes zero.
- CCTP: `depositForBurn(amount, destinationDomain, mintRecipient, burnToken, destinationCaller, maxFee, minFinalityThreshold)` with `mintRecipient = bytes32(recipient)`, `destinationCaller = 0` (anyone may mint, so the user is never dependent on one relayer), `maxFee` taken from the attestation API plus a 20% buffer as Circle recommends, `minFinalityThreshold` 1000 only if the fee quote says Fast is available. Mint on the destination is a second transaction (user gas) or `depositForBurnWithHook` with the Forwarding hook (fee shown). Domain ids pinned from section 4.2.
- Across: `depositV3`-family call to the chain's SpokePool with `recipient` and `depositor` set by us, `inputToken` and `outputToken` from `available-routes`, `outputAmount` taken from `suggested-fees` and checked against the page's minimum-out, `exclusiveRelayer` zero, `fillDeadline` and `quoteTimestamp` from the quote, `message` empty. Exact function name for the BNB (V4) path: the BNB guide names `depositV3()` (H), but the ABI must be read from the verified SpokePool before coding (T-XC4).

**Tier 2 (aggregator) verifier:** decode LI.FI's returned `transactionRequest.data` against the Diamond's verified ABI (BridgeData: `receiver`, `destinationChainId`, `sendingAssetId`, `minAmount`, facet-specific data); require `to` = the pinned Diamond, `value` as quoted, `receiver` = pinned recipient, `destinationChainId` = chosen chain, `minAmount` <= amount, and restrict the allowed bridge list in the request (the LI.FI SDK supports allow and deny lists for chains, tokens and bridges, H). If the decode cannot be completed (unknown facet selector), refuse. Relay, deBridge and Socket get the same treatment only after their own verifier exists; until then they are quote-only references.

### 7.3 What can be enforced on-chain, and where

| Layer | Enforces | Does not enforce | Available where |
|---|---|---|---|
| Page and relay (advisory) | allowlists, recipient pin, caps, ledger, decode | anything against a compromised agent that holds an autonomous grant | everywhere |
| PayBox approval | a human sees the raw transaction | decoded meaning; a changed recipient is invisible in raw calldata ([20] 9) | PayBox-supported chains |
| Kernel session key (ZeroDev permissions) | CallPolicy: target contract, function, argument conditions `EQUAL`, `NOT_EQUAL`, `GREATER_THAN`, `LESS_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`, `valueLimit`; RateLimit: `count` UserOps per `interval` with reset; Timestamp window; Gas policy cap and optional `enforcePaymaster` (all H, docs.zerodev.app policy pages) | cumulative USD per day (derive it: per-call cap times `count` per day); dynamic `bytes` such as an Across `message` (M: enforcement of an empty message is unverified, T-XC4); struct arguments of aggregator diamonds (M) | Chains where Kernel v3.1 and the policy modules exist: policy modules Sourcify-verified on 1, 10, 137, 8453, 42161, 59144 but **not** 56 or 3223 ([25] 6.2, M) |
| Safe plus Candide modules | Allowance Module: token allowance per delegate, any destination | recipient, destination chain, function | Safe-supported chains |
| Venue-native keys | Polymarket Session Keys; Hyperliquid agent wallets; Pascal trading keys | funding movements | per venue |
| Balance bound | whatever sits in the hub and in each venue account | | everywhere |

Reading: with Kernel plus the direct rails, a locked session key can only do `approve(router, <=cap)` and one bridge function with `recipient` equal to a pinned own account and `amount <= cap`, at most `count` times per interval. A compromised agent can therefore not send funds to an attacker address through the valve. It can still (a) bridge to the user's own venue accounts and then lose the money by trading there, (b) burn fees by bridging back and forth (0.03% to 0.4% each way at $20, plus gas), (c) leave a route half-complete. The venue-account balance is the real loss bound, which is the sentence the Funding Card prints.

---

## 8. What is impossible, unproven, or unverified

| # | Statement | Status | Evidence |
|---|---|---|---|
| I1 | Atomic cross-chain bet placement for XO, Polymarket, Opinion, Predict.fun, Hyperliquid | **Impossible by construction** | Orders are signed messages matched off-chain by the venue; the funds are checked or settled by the venue; no bridge call or destination hook can create an order. Whether a venue accepts a pre-signed order before funds arrive is NOT FOUND and would not be atomic anyway. |
| I2 | CCTP for USDC to or from BNB Smart Chain | **Impossible today** | Section 4.2 (H). |
| I3 | Any aggregator or bridge listing XO chain 3223 | **Not available** | Probes in section 4.4; Hyperlane registry (351 chains) has no XO (H). Only XO's own route exists. |
| I4 | Exit from XO by an outsider | **Unproven** | [20] 7; H1 in [P1] 3 untested; ICA on XO NOT FOUND. |
| I5 | Delivery of a non-app Hyperlane transfer by XO's relayer | **Unproven** (door (e)) | Section 4.3; test T3a in [P1] 6. |
| I6 | One signature that authorises bridging on several chains | **Not available in a form we accept** | Candide Safe Unified Account signs a Merkle root and needs EntryPoint v0.9 on every chain; EIL is not live; our rule rejects chain-agnostic or opaque variants (T8, [25] 9). |
| I7 | An on-chain per-order or per-bet cap | **Impossible** | E3. |
| I8 | A cumulative USD per day cap enforced on-chain | **Not natively available**; derivable as `count x per-call cap` with Kernel policies | section 7.3 (M for the derivation, H for the policy semantics). |
| I9 | On-chain locking of LI.FI, Relay, deBridge or Socket routes | **Unverified, likely impossible** | Struct arguments; CallPolicy documentation shows flat argument conditions only (M). |
| I10 | Candide public endpoints sponsor mainnet UserOps for strangers | **Not documented** | NOT FOUND (searched `instagas/*`, `send-gasless-tx`). |
| I11 | PayBox signs a Safe `SafeOp` typed-data domain on 56, 137, 8453, 42161 | **Unverified** | Premise E4 only; test T-XC7. |
| I12 | Polymarket `CollateralOnramp.wrap` accepts native USDC | **Unverified** | The same Polymarket docs say both; section 5. |
| I13 | Stargate pools' DVN configuration | **Not checked** | Relevant after Kelp (section 4.1). |
| I14 | Relay, LayerZero VT and Stargate API timing and fees | **Not measured** | POST or key required. |
| I15 | Per-chain presence of CCTP `TokenMessengerV2`, Across SpokePools, the Kernel factory and the policy modules on Polygon, Arbitrum and BNB | **Not established by me** | No JSON-RPC; Sourcify is a lower bound. T-XC1. |

---

## 9. What "seamless" honestly means

Funding happens in two or three discrete steps with a wait in the middle; the bet that follows is as fast as the venue's order matching.

| Route | Source tx | Wait for destination credit | Extra step | Honest total to show |
|---|---|---|---|---|
| Base to XO (Hyperlane) | about 2 s block plus approvals | 14 s median, 27 s max in 253 samples ([20] 6) | `K` must already be deployed | 30 s typical, show "up to 2 minutes", flag after 10 min |
| Base to Polygon, Across | about 2 s | 0 to 2 s estimated fill | wrap or swap to pUSD for Polymarket | under 1 minute typical (M) |
| Base to BNB USDT, LI.FI Intents | about 2 s | 8 s quoted | none | under 1 minute typical (M) |
| Base to Arbitrum or HyperCore, Polymer standard (LI.FI's pick) | about 2 s | 18 min quoted | none | 18 to 19 min; the route picker should prefer a faster tool or CCTP Fast when the fee is small |
| Base to HyperCore, CCTP Fast with forwarding | about 2 s | about 8 s attestation plus HyperEVM mint plus forward | 1 USDC activation if new | about 1 minute (M) |
| Polygon to Base, CCTP standard | about 2 to 5 s | about 8 s attestation | destination mint tx unless forwarded | under 1 minute (M) |
| Across refund after expiry | | "several hours" (bundle about every 1.5 h plus challenge period) | | tell users not to expect immediate refunds |
| CCTP Base standard (no Fast) | | 15 to 19 min | | only if the fee saved matters |

A paying gas step precedes every row unless a paymaster covers it. "Seamless" in the interface therefore means: one screen, one decoded summary, one or two approvals, a progress bar that is honest about "up to N minutes", and a ready indicator that flips only when the destination balance and the venue both show the money. It does not mean a bet that executes on chain B from chain A.

---

## 10. Costs and who bears them

| Cost | Typical size (H quote unless tagged) | Who pays | Notes |
|---|---|---|---|
| Rail fee | CCTP 0 to 1.4 bps; Across 3 to 5 bps (stablecoin, same asset) and 36 bps for the USDT route; LI.FI 25 bps fixed plus route cost; Relay $0.02 plus 0 to 15 bps; deBridge 4 bps plus $0.455 operating expense at $20 plus 0.001 ETH flat | User | At $20, flat costs dominate (deBridge's total is about 2.4% of the input, LI.FI 0.25%, Across and CCTP well under 0.1%). Show fee in token and in percent. |
| Source gas | LI.FI's estimate $0.003 to $0.006 on Base | User, or a funded paymaster policy | Candide ERC-20 gas needs the user to hold the token; the markup is NOT FOUND |
| Destination mint gas | CCTP: user, or Forwarding Service $0.059 to $0.088 | User | Across, LI.FI, Relay, deBridge include destination gas in the quote |
| Account deployment | one-time, first UserOp (`initCode`) | User or sponsor | |
| Candide plan | $0 (2,500 mainnet UserOps lifetime) to $333 per month | Whoever owns the API key. **Not the author**: under our decision each user would need their own key and dashboard account (a human step); otherwise they use public endpoints with IP rate limits | |
| Aggregator API keys | Relay required (since 2026-10-02); LayerZero VT quotes required; Across wants a key and an integrator id for production; LI.FI, deBridge, Socket usable without a key at low limits | The user, if they want those rails | Tier 1 needs no key; this is a reason Tier 1 comes first |
| Hyperliquid activation | 1 USDC for a new HyperCore account | User | |
| Third-party deposit-address services | 0.3% example (Polymarket Bridge), 0.5% (Candide Forwarding Address example) | User | Provider holds funds in transit |
| Author-operated costs | none in the recommended build | n/a | Nothing in sections 7 and 11 requires a server, key or funded policy of the author |

---

## 11. Build order, tests, decisions

### 11.1 Build order (every write path flag-gated OFF; reuse `ENABLE_FUNDING`; add a per-rail allow flag, default empty)

| Step | Deliverable | Needs | Exit criterion |
|---|---|---|---|
| F0 | Funding Card, read-only: pinned recipients from the account map; quotes from the CORS-open GET endpoints (Circle attestation fees, Across suggested-fees, LI.FI quote, deBridge quote); decoded summary; provider failure messages shown verbatim (screening, 429, 410 deprecation) | no key, no signature | Fixtures are recorded live responses with dates (no invented data); table in section 4.4 reproducible by a script |
| F1 | Direct builders and the decode-and-compare verifier for Hyperlane (XO), CCTP, Across; `transaction` proposals for PayBox (exact approve, then call, then approve 0) | pinned ABIs from verified sources; per-chain code check by the local companion | Golden tests: right recipient, wrong recipient, unpadded bytes32, wrong decimals, over-cap, expired quote all refused |
| F2 | Status trackers: Circle messages/attestation endpoint, Across deposit status, LI.FI `/status`, Hyperlane `Mailbox.delivered` | public GETs / RPC reads | `dispatched_not_delivered` after the rail timeout; never a resend |
| F3 | LI.FI Diamond verifier for cross-token cases (USDC to BNB USDT, USDC to pUSD) | verified Diamond ABI | Refuses an unknown selector |
| F4 (optional) | Hub account with Candide infrastructure: Safe (typed-data signing) for gas-in-USDC and batching, or Kernel v3.1 with session policies for direct rails only | user-owned Candide key or public endpoints; T-XC7 passes | Section 7.3 policy reproduced on a fork or testnet first |
| Never in this design | own bridge or relayer; own paymaster; 7702 delegation of the owner EOA; Safe Unified Account until EntryPoint v0.9 is present on every chain, the approver can see decoded leaves, and the module has had more than three months in production; EIL until mainnet; any route that uses an API-supplied recipient | | |

### 11.2 Tests (cheap first; none run here)

| ID | Question | How | Cost |
|---|---|---|---|
| T-XC1 | Is `TokenMessengerV2`, the Across SpokePool, the Kernel factory and the Hyperlane router present on Polygon, Arbitrum and BNB? | `eth_getCode` from the local companion | $0 |
| T-XC2 | Do the keyless GET quote endpoints stay open and CORS-open for a static page, and what are their limits (Across, LI.FI 100 per window, deBridge 50 per minute)? | repeat the probes at intervals | $0 |
| T-XC3 | Does the Circle messages endpoint return status for a given burn hash without a key? | GET with a known public burn hash | $0 |
| T-XC4 | Across ABI for the BNB path; can `message` be forced empty by CallPolicy? | read verified SpokePool source; fork test | $0 |
| T-XC5 | Real fill time and fee for one small Across transfer Base to Polygon into the user's own EOA | user-run, $2 to $5, approval-gated | fees |
| T-XC6 | Real time for CCTP Polygon to Base (standard) with and without the forwarding hook | user-run, $2 | fees |
| T-XC7 | Does PayBox sign a Safe `SafeOp` typed-data domain and an `eth_sendTransaction` for approve+bridge on 8453? | throwaway credential ([P1] T0) | $0 plus gas |
| T-XC8 | XO raw route: does XO's relayer deliver a non-app transfer and does the orderbook credit it? | [P1] T3a, a $2 to $3 deposit | $2 to $3 |
| T-XC9 | HyperCore via CCTP forwarder: exact hook bytes, minimum, activation | user-run, at least 6 USDC | about $7 |

### 11.3 Decisions for the user

1. Accept funding-first (Option 0 plus direct rails) and treat the AA hub as optional and last? **Recommended: yes.**
2. If a hub is wanted: Safe via Candide (typed data, no on-chain argument policy) or Kernel v3.1 (policies, same account class as XO, Candide used only as bundler and paymaster, M untested)? **Recommended: Kernel for policy-bearing use, Safe only if on-chain policy is not needed.**
3. Allow Tier 2 aggregator rails (API calldata, decode-verified) at all, or only Tier 1? **Recommended: Tier 2 only for cross-token legs and only through LI.FI after F3.**
4. Are Tier 3 deposit-address services (Fun.xyz via Polymarket and Predict.fun, Candide Forwarding Address) acceptable as labelled fallbacks? **Recommended: allow, labelled "provider holds funds in transit".**
5. Funding cap per transfer and per day: keep the existing $10 per funding and $50 per day until T-XC8 and [P1] T4 pass (open item O2).
6. Geo handling: the page warns, never advises circumvention.

---

## 12. Threat notes specific to the valve

| # | Threat | Where | Mitigation in section 7 |
|---|---|---|---|
| V1 | API-supplied calldata swaps the recipient | Tier 2 | Tier 1 for primary rails; decode-and-compare for Tier 2; recipient never from a provider |
| V2 | Standing approvals on a router later exploited | LI.FI 2024, Socket 2024 | exact, temporary approvals |
| V3 | Provider deprecation or key requirement changes | Relay (2026-10-02), LayerZero old API 410 | quote-only adapters degrade to "unavailable", never to a guess |
| V4 | Wrong-encoding stranding | Hyperlane bytes32, Hyperliquid below minimum, Polymarket unsupported token | encoders with golden tests; minimums enforced |
| V5 | Stale counterfactual address | all smart-account recipients | code check first ([25] 5.3) |
| V6 | Sanctions or compliance block mid-route | deBridge screening, Relay screening, Polymarket bridge holds | show provider message; no workaround |
| V7 | Issuer or operator power | USDC blacklist, XO's single-key ProxyAdmin and blacklister, Across/LI.FI/Relay upgrade keys | label "operator-upgradable" per row ([25] T6) |
| V8 | Messaging-layer misconfiguration | LayerZero 1-of-1 DVN (Kelp), Hyperlane 2-of-3 on XO | do not use Stargate or OFT rails before their DVN set is read |
| V9 | Griefing by a compromised agent: repeated small bridges | any | RateLimit policy (if Kernel); relay ledger; minimum transfer size |
| V10 | Approver sees opaque calldata | PayBox raw transaction view | decoded summary on the page; digest recomputation ([P1] A4, [dapp] 7) |

---

## Verification

What I re-checked after drafting, and the result.

1. **CCTP and BNB.** Re-read the supported-chains table, the tokens line, the USDC address list and re-ran the live fee query (`6/17` returned 400, `6/7`, `3/6`, `7/6`, `6/19` returned 200). The earlier "no" stands (H).
2. **No aggregator lists chain 3223.** Chain lists of LI.FI, Relay, deBridge, Across and the LayerZero Value Transfer API contain no id 3223 (the script printed `False` in each); LI.FI's quote to chain 3223 was refused; the Hyperlane registry listing (351 entries) has no name containing "xo". The Stargate pool metadata lists no XO chain key (H).
3. **Quotes and fees quoted in this note** are copied from the saved probe JSON: LI.FI (5 quotes plus 2 refusals), Across (about 12 queries; the first cross-token BNB USDT route was refused with `ROUTE_NOT_ENABLED`), deBridge (one accepted quote after one compliance refusal), Circle fee endpoints. They are one-time samples on 2026-10-20 and will drift. Percentages were recomputed from the raw numbers (for example 10,547 / 20,000,000 = 0.0527%).
4. **XO route state.** Explorer GETs confirm the route is a live contract with the implementation recorded in [20] and a larger USDC.e supply; I did not re-verify the ISM, owners or router wiring (no JSON-RPC), so those remain as in [20].
5. **Mailbox sender concentration.** Eight pages of 50 transactions each; all `from` equal, all method `0x7c39d130`; 17 with status `error`. The explorer does not give revert reasons for them; executor-mediated deliveries are not in this list. This is evidence about who delivered in a 14-day window, not about who could.
6. **Candide.** Network list, public and keyed endpoint format, pricing numbers (docs page plus the pricing page), forwarding and unified-account pages, EIL status, ExternalSigner `signTypedData` support and the Allowance Module were read from the pages cited. npm metadata for `abstractionkit` (latest 0.4.3, MIT) and GitHub metadata for the Candide repositories were read directly. Not verified: any bundler or paymaster behaviour (POST), the mapping of the three EntryPoint addresses listed in Candide's example to versions, the paymaster's ERC-20 markup, and any "public" sponsorship policy.
7. **ZeroDev policy semantics** (CallPolicy conditions, RateLimit with reset, Gas policy `enforcePaymaster`) were read from docs.zerodev.app markdown. I did not read the policy contract source, so the claim that dynamic `bytes` and struct arguments cannot be constrained is M and is test T-XC4.
8. **Polymarket.** pUSD contract addresses, Bridge API, supported assets (live GET, minimums), Deposit Wallet facts were read; the wrap-asset conflict is reported, not resolved.
9. **Incidents** (LI.FI 2022 and 2024, Socket 2024, Across 2026-07 and 2025-09, Kelp/LayerZero 2026-04, CCTP maintenance pauses, deBridge phishing, Symbiosis 2026-09) come from search results, not from the providers' own post-mortems, and several loss figures disagree between outlets; all tagged M. The Symbiosis item was in a search summary and is not used in a conclusion. I found no incident for Hyperlane, Relay or CCTP contracts (one search each, so "none found" is weak).
10. **Corrections to earlier repo statements:** none overturned. Additions: Predict.fun's smart wallet is a ZeroDev/Privy account with a Fun.xyz-operated deposit address; Polymarket's bridge is Fun.xyz-operated; Relay's API key became mandatory on 2026-10-02; Candide's free tier is a lifetime allowance, not a monthly one; HyperCore is reachable by four independent rails and by CCTP's forwarder; the recent delivery history on XO's Mailbox is single-sender.
11. **Not done on purpose or not possible:** no PayBox call, no POST, no key or account, no JSON-RPC, no execution of third-party code, no contact with any provider. The Across, Relay, LayerZero, Socket and Circle documentation pages contain agent-directed boilerplate (skills, MCP servers); none was followed.
12. **Privacy scan:** this file contains no email address, personal name, GitHub login or home-directory path; the only request identifier used was the User-Agent `insurance-markets-research/0.1`. The only paths named are repository-relative.
13. **Scope:** only this file was written. No source, relay, test or package file was touched, nothing was installed or built, and git state was not touched.
