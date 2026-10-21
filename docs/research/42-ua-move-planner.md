# 42. The Move Planner: moving money between venues and chains, planned, approved and executed by the user's own agent

Task key `ua-move-planner`. Written 2026-10-20 (harness date). Part of the "unified account" design run; sibling notes 35 to 41 and `docs/dapp-aa-candide.md` did not exist when this was written and nothing here waits for them. Read-only research: public documentation, public GET endpoints, three read-only JSON-RPC `eth_call`/`eth_getCode` reads, `gh api` file reads of public repositories. Nothing was signed, sent, deployed, funded or created. No PayBox tool was called (tool schemas were loaded, never invoked). No account or key was made. Nobody at XO or PayBox was contacted.

Confidence tags: **H** = read first-hand in a primary source or reproduced by my own read/probe in this run (URL, repo path or note id given); **M** = secondary, summariser-mediated or inferred from H facts; **L** = guess or judgement without evidence. **NOT FOUND (searched: ...)** is used literally. Proof status of an *edge* uses four words: **verified-docs** (an official document describes it and I read it), **verified-chain** (code, state, events or a simulation I or a cited note read on chain), **unproven** (mechanism specified, a key link never observed), **impossible** (blocked by a fact, with the fact). No edge in this document has been *run by this project*; "verified" never means that.

---

## 0. Bottom line

1. **The user's goal is a planner, not a bridge.** The design below finds paths over *existing* mechanisms (Circle CCTP v2, XO's own Hyperlane route, Across, LI.FI, deBridge, Relay, Polymarket's Bridge API, Hyperliquid's own CCTP and `withdraw3` paths, PayBox's native `request_swap`/`request_transfer`), describes each as an *edge* with cost, time, risk, preconditions and proof status, and produces a **Move Plan** that the user's agent shows, the user approves, and the agent then executes **one step at a time with each step prepared just in time**. We write no bridge, no wallet contract, no router.
2. **The graph is hub-and-spoke, and the hub is the owner EOA's USDC on Base.** XO (chain 3223) is reachable from exactly one place: the Hyperlane warp route from Base USDC, and returns (in theory) to exactly one place: Base. **No aggregator lists chain 3223**: LI.FI (66 chains), Relay (60), Across (24) and deBridge (18) all answered a live chain-list GET on 2026-10-20 without it (H, section 5.1). So *every* XO move is a Base move plus one Hyperlane hop. BNB Chain is a second island: **CCTP lists BNB for USYC only, not USDC** (H, Circle supported-chains page), so BNB money moves only through intent bridges or Polymarket's Bridge.
3. **XO exit is the load-bearing unknown.** Entering XO has a verified mechanism (permissionless, zero fee, median 14 s; [20], re-confirmed in part this run: Base router `routers(3223)` still returns the XO route, H). Leaving XO has **no verified third-party path**: the paymaster refuses `transferRemote` ([20 §7], H), the XO app uses an unverified executor, and the only candidate is the unproven paymaster-less UserOp H1 (test T4). The planner therefore enforces a **no-one-way-door rule**: no plan may move more than the test amount into a node whose exit edge is not proven (section 6.6). That rule already exists for funding in code (`FU9`, $10 lifetime cap, `docs/tool-contract.md` "Caps"); the planner generalises it.
4. **A finding that changes the build: in local mode, our Base funding output is not executable.** `xo_fund_account` returns an `io.paybox/transactionProposal`, which "only the hosted plugin can return" (`docs/everyone-architecture.md` §2.4 line 73, H) and PayBox upload is not available. The runbook's local route is `request_wallet_sign` with `op: "transaction"` plus *the user's own broadcast* (`docs/runbook.md` line 33, H). PayBox's `request_wallet_sign` "returns the signed artifact without broadcasting" and needs every EIP-1559 field from the caller (live tool schema + `docs.paybox.sh/reference/mcp-tools`, H). So the planner needs a **transaction builder and local broadcaster** (a new Prepared kind `tx`, section 8). Where an ERC-20 plain transfer or a swap/bridge is all that is needed, PayBox's own `request_transfer` and `request_swap` (with `dst_chain` and `recipient`) can do it, but then PayBox, not us, builds the transaction and we can only pin the arguments and check the result afterwards.
5. **Provider calldata is untrusted and sometimes unsafe as delivered.** Across's live `swap/approval` response returned an **unlimited** `approve` (`0xffff…ffff`) to its SpokePool (H, 2026-10-20). deBridge's order needs native value (`0.001 ETH` fix fee on Base) (H). The planner re-encodes approvals with the exact amount, pins targets and selectors, decodes what it can, and treats aggregator-supplied opaque calldata (LI.FI, deBridge, Relay) as a separate, flag-gated, simulate-first class.
6. **Hyperliquid has two entry paths with different minimums.** The wallet-connected Bridge2 path is Arbitrum USDC only and "deposits below 5 USDC are lost" (H, HL FAQ); the Circle CCTP path to HyperCore has "no minimum deposit amount", a $0.20 forwarding fee when Circle forwards, and a one-time 1 USDC activation fee charged on the first outbound action (H, Circle docs). Withdrawals are user-signed typed data (`withdraw3`: $1 fee, about 5 minutes; `sendToEvmWithData` via CCTP), and **an API/agent wallet cannot withdraw** to another address. The planner must hard-block sub-minimum amounts and model the activation fee.
7. **Predict.fun's "smart wallet" is a ZeroDev Kernel account whose owner can call `execute` directly** (Predict's own wallet doc describes exactly that withdrawal route, H; Kernel v3.1 source: `execute` is `onlyEntryPointOrSelfOrRoot`, and a root validator that is a hook module is consulted by `preCheck`; the ECDSA validator implements `preCheck(msgSender == owner)`, H source on `master`; deployed-bytecode identity not verified, M). That gives a UserOp-free exit on BNB (needs BNB gas). The same mechanism on XO needs native XO for gas, which an outsider does not have (section 4.2).
8. **What is possible end to end** (full table in section 12). *Today*, with existing code and PayBox's documented primitives: the XO entry leg's mechanism, XO-internal actions (deploy, enable, redeem, orders) behind the four XO doors and flags, and own-wallet transfers/bridges *by the agent calling PayBox tools directly* with no planner, no verification and no caps. *After the planner is built* (no new unknowns beyond MT1 to MT6, section 13): own-wallet USDC moves among Base, Polygon, Arbitrum, Ethereum, OP via CCTP/Across, BNB via Across/deBridge/LI.FI, entry and exit of Polymarket (credential-gated), Hyperliquid, Predict.fun/Opinion owner-direct. *After T0 to T8*: Base to XO funding credited, XO orders and redeem, and, only if T4 passes, XO to Base. *Not possible at all*: XO to anywhere except via Base; a sponsored XO withdrawal; CCTP for BNB USDC; programmatic Kalshi/Polymarket US/Novig movement; moving an outcome position (ERC-1155) from one venue to another; atomic cross-venue legs; opening new positions from a close-only jurisdiction.
9. **Caps and allowlists are the plan's own checks, not on-chain bounds.** Recipients are only the user's own accounts (owner EOA, deterministic derived accounts, registered venue accounts, and one narrow exception: a provider-issued deposit address that is pinned to the plan and shown in full). Everything else is advisory against a compromised agent, as the repo already says (`docs/plan.md` decision 5, amendment A4). The only on-chain bound is what sits in the account whose key signs.

---

## 1. Scope, method, compliance

**Read in the repo**: `docs/plan.md` banner and decisions; `docs/phase1-gap-closing.md` §0, §3.4, §6, §9; `docs/aggregation-design.md` §3.5, §6, §9; `docs/dapp-design.md` §2.3 to §2.5, §5; `docs/everyone-architecture.md` §2; `docs/tool-contract.md` (tools, caps, switches); `docs/venue-census.md` P1 (Pascal, SX Bet, Hyperliquid); `src/relay/contract.ts` (Prepared, Summary, Decoded, digest forms, call templates); `src/tools/fund.ts` (proposal shape, budget); research notes 03, 08, 09, 19, 20, 25 (each with its Verification section). `docs/platform-registry-design.md` and `docs/market-linking-design.md` were not needed beyond the account/venue vocabulary.

**Fetched in this run** (public GET, `User-Agent: insurance-markets-research/0.1`, about 0.5 s apart, 2026-10-20 06:50 to 07:35 UTC): Circle CCTP docs (`supported-chains-and-domains`, `finality-and-block-confirmations`, `fees`, `forwarding-service`, `contract-addresses`, `cctp-on-hypercore`, HyperCore withdraw/deposit how-tos and contract addresses, `llms.txt`) and Circle Iris API (`/v2/burn/USDC/fees/{src}/{dst}`, `/v2/fastBurn/USDC/allowance`, `/v2/publicKeys`, `/v2/messages/...`); Hyperliquid docs (exchange endpoint, FAQ "Deposited USDC", sitemap); Polymarket docs (`llms.txt`, `trading/bridge/{deposit,withdraw,quote,status,supported-assets}`, `trading/wallets-auth`, `trading/positions/manage`, `concepts/resolution`) and `bridge.polymarket.com/supported-assets`; LI.FI (`llms.txt`, `/v1/chains`, three `/v1/quote` GETs, `/v1/status`), Across (`llms.txt`, `/api/swap/chains`, `/api/suggested-fees`, `/api/swap/approval`, `/api/deposit/status`), deBridge (`/v1.0/supported-chains-info`, one `/v1.0/dln/order/create-tx` GET), Relay (`/chains`, docs `llms.txt`, API-key and rate-limit pages); Predict.fun user docs (`llms.txt`, wallets page), Opinion docs (`llms.txt`, builder-mode split/merge/redeem page); PayBox docs `reference/mcp-tools.md`; XO explorer GETs (`/api/v2/tokens/...`, blocks, route logs). `gh api` reads (the call carries the local `gh` login, which GitHub can see, as in earlier notes) of `zerodevapp/kernel` `src/Kernel.sol` at tag `v3.1` and `zerodevapp/kernel-7579-plugins` `src/validators/ECDSAValidator.sol`. Read-only JSON-RPC (POST with `eth_call`/`eth_getCode`, three calls to the public Base RPC): Base router `routers(3223)` and `token()`, and code size of the CCTP TokenMessengerV2. This is a judgement call against "no POST": the calls are reads, earlier notes did the same, and no state could change.

**Not done on purpose**: no POST of any state-changing kind; no Polymarket/Relay/Hyperliquid `/quote`, `/withdraw`, `/deposit`, `/info` or `/exchange` call (all POST); no account or API key (Relay's quote path is key-gated, so its keyless behaviour is **unproven** here); no PayBox call; no signing; no clone or run of third-party code.

**Sample inputs**: LI.FI/Across/deBridge quote GETs used the public Anvil account 0 address as the sender (a documented public test address, no relation to any person) and $100 amounts. Nothing was sent.

**Third-party content is untrusted data.** Several fetched pages carry blocks addressed to AI agents (Circle's pages open with "Agent Instructions" to install Circle skills/plugins and an MCP server URL; GitBook pages end with "Agent Instructions" about an `?ask=` query interface). None was followed or used. They are recorded here because the same pattern will appear in provider responses the planner reads at run time (section 11).

**Source keys**: `[P1]` `docs/phase1-gap-closing.md`; `[AD]` `docs/aggregation-design.md`; `[DD]` `docs/dapp-design.md`; `[TC]` `docs/tool-contract.md`; `[EA]` `docs/everyone-architecture.md`; `[RC]` `src/relay/contract.ts`; `[03] [08] [09] [19] [20] [25]` research notes; `[census]` `docs/venue-census.md`. Web sources are listed in section 16 as `[W-…]`.

---

## 2. Model: nodes, edges, proof, executability

### 2.1 Nodes

A **node** is a place where money or a position sits and who can move it: `(account, chain, asset)`. The account graph (sibling task) supplies the accounts and balances; the planner needs only the following per node: address, chain, asset (with decimals pinned from a local token registry, never from a provider), spendable balance, and the *controller* (who can authorise a move).

| Node id (example) | Account | Chain | Asset | Controller | Notes |
|---|---|---|---|---|---|
| `owner@base:USDC` | owner EOA (PayBox credential) | Base 8453 | USDC `0x833589fC…A02913` (6 dp) | owner signature | The hub. Limitless EOA mode and Trueo live here too ([25 §4.1]). |
| `owner@polygon:USDC` / `:USDC.e` | owner EOA | Polygon 137 | USDC `0x3c499c54…3359`, USDC.e `0x2791Bca1…4174` | owner | |
| `owner@arb:USDC` | owner EOA | Arbitrum 42161 | USDC `0xaf88d065…5831` | owner | HL Bridge2 entry. |
| `owner@bnb:USDT` | owner EOA | BNB 56 | USDT `0x55d39832…7955` (**18 dp**), USDC `0x8AC76a51…580d` (18 dp) | owner | CCTP has no USDC here. |
| `xo:kernel@3223:USDC.e` | XO Kernel v3.1 account (pure function of owner, [19]) | XO 3223 | USDC.e `0x80c12230…ab0c` (6 dp) | owner via UserOp | Positions are ERC-1155 here. |
| `poly:depositwallet@137:pUSD` | Polymarket Deposit Wallet (CREATE2 from signer, [25 §3]) | Polygon | pUSD `0xC011…2DFB` (6 dp) | owner signature + a **Relayer/Builder API key** for gasless batches | New accounts since 2026-05-04 ([08 V E4]). |
| `predict:kernel@56:USDT` | Predict smart wallet (ZeroDev Kernel via Privy, [W-predict]) | BNB | USDT (18 dp) | the Privy/Web3 owner key | |
| `opinion:safe@56:USDT` | Opinion Gnosis Safe "trading wallet" ([09 §2.2]) | BNB | USDT (18 dp) | Safe owner signature | |
| `hl:core@hypercore:USDC` | Hyperliquid account = signer address | HyperCore | USDC | owner EIP-712 for withdrawals; agent wallet for orders only | |
| `sol:owner@solana:USDC` | PayBox Solana credential (separate key family, [25 §3]) | Solana | USDC mint `EPjF…Dt1v` | Solana key | Pascal owner. |
| `pascal:deposit@solana:USDC` | Pascal PDA deposit address | Solana | USDC | owner wallet-signed JSON | [census] M |
| `kalshi:*`, `polyus:*`, `novig:*` | custodial USD accounts | none | USD | venue login | Not wallet-controlled; manual only. |

Positions (ERC-1155 or venue-internal) are also nodes but have **no edges to other venues**: the only exits are *sell* or *redeem/merge* into the venue's own collateral node (section 4.3). This is the most common misunderstanding of "moving between venues" and the planner says it first.

### 2.2 Edge fields (every edge in section 4 fills all of them)

`id`, `from`, `to`, `mechanism` (contract call or venue API), `signer`, `gas_payer`, `fee` (formula and live source), `time_typ` / `time_worst`, `failure_and_refund`, `geo_tos`, `preconditions`, `proof` (verified-docs / verified-chain / unproven / impossible, with the missing link named), `class` (executability, below), `reversible` (yes / no / partly), `exposure` (what is in third-party hands while it runs).

### 2.3 Executability classes (extends `[AD §6.1]`)

| Class | Meaning in this design | Who builds, who signs, who broadcasts |
|---|---|---|
| **E1** proposal | `io.paybox/transactionProposal` from a plugin | Only valid when the hosted plugin runs (PayBox upload is not available). **Not usable in local mode.** Kept for the day B0 closes. |
| **E2** prepare-sign-submit | Existing `Prepared` items: `userop`, `order`, `auth`, `create` ([RC]) | Local relay builds; PayBox `request_wallet_sign` (`raw`/`typedData`) signs; relay submits to XO's bundler/gateway. |
| **E2t** *(new)* prepared EVM transaction | New `Prepared` kind `tx`: an unsigned EIP-1559 transaction built from a closed list of call templates | Local relay builds every field; PayBox `request_wallet_sign` `op:"transaction"` signs and returns `serializedTransaction`; **the relay verifies and broadcasts** to the user's configured RPC. |
| **E2v** *(new)* prepared venue action | Typed data a venue API accepts as authorisation: Hyperliquid `withdraw3`/`sendToEvmWithData`/`approveAgent`; Polymarket Deposit Wallet `Batch`; Opinion Safe transaction | Relay builds typed data; PayBox `typedData` signs; relay POSTs to the venue host (allowlisted). HL needs no API key (the signature is the authorisation); Polymarket needs a user-made Relayer/Builder key; Opinion Builder Mode needs builder access. |
| **E3** PayBox-native | `request_transfer` (ERC-20/native transfer; PayBox builds and broadcasts) or `request_swap` (swap or bridge via MoonX; `dst_chain`, `recipient`, `value_cents`) | The agent calls PayBox directly with arguments the plan pins; PayBox policy and approval apply; we can only *check the result afterwards* (balance deltas), we cannot verify what PayBox built. |
| **E4** manual | The human acts in a venue UI (XO app withdrawal, Predict Settings, Kalshi deposit, Fun.xyz checkout) | Plan shows instructions; no signing by us; completion is detected by balance reads. |
| **E5** impossible | Named in the graph with its reason, never planned | n/a |

Two properties the existing code gives and the planner keeps: **single use, short-lived prepared items** (`PREPARED_TTL_S = 300`) and **no resend after an ambiguous result** (`docs/tool-contract.md` "How the write tools work").

---

## 3. The map

```
                         Ethereum / OP / Avalanche / Linea ... (CCTP v2: USDC burn-and-mint)
                                      |
 Solana ---- CCTP (fast ~8 s, 1 bp) --+--- Arbitrum ---CCTP--- Polygon ---CCTP--- Base  <== HUB: owner EOA USDC
   |  PayBox request_swap cross-VM?       |  (Bridge2 >= 5 USDC)   |                |
 Pascal (PDA)                       Hyperliquid (HyperCore)   Polymarket          |  Hyperlane warp route
                                      ^  CCTP-forwarder (no min) Deposit Wallet   |  (permissionless, 0 fee, ~14 s in; exit unproven)
                                      |   pUSD <-> Bridge API (min $2)            v
 BNB 56: USDT/USDC 18 dp  <-- Across / deBridge / LI.FI / Relay / Polymarket Bridge --  XO 3223: Kernel account, USDC.e
   |-- Predict.fun (Kernel, Privy owner)                                   (no aggregator lists 3223)
   '-- Opinion (Safe)
 Custodial USD venues (Kalshi, Polymarket US, Novig, ...): manual, E4 only
```

**Chain coverage, read live 2026-10-20** (H, chain-list GETs): LI.FI 66 chains, Relay 60, Across 24, deBridge 18. All four include Ethereum, OP, BNB (56), Polygon, Base, Arbitrum; LI.FI, Relay, Across list HyperEVM 999, deBridge's list did not; **none lists 3223**. The Hyperlane registry also has no XO entry (`warp_routes/XO` holds only a logo; [20 §2.1], H). Circle CCTP: Base, Arbitrum, OP, Ethereum, Polygon, Avalanche, Solana, HyperEVM and others support USDC; **BNB Smart Chain is listed "USYC only"** and "USDC: supported on all CCTP domains except BNB Smart Chain" ([W-cctp-chains], H).

---

## 4. Edge catalogue

Numbers marked "live" were read on 2026-10-20 between 07:00 and 07:20 UTC for a $100 sample and are quotes, not guarantees (section 5).

### 4.1 Transport edges (money from one chain or account to another)

#### T-CCTP: Circle CCTP v2 (USDC burn-and-mint), owner EOA to owner EOA (or any EVM recipient)

| Field | Content |
|---|---|
| Mechanism | `approve(TokenMessengerV2, amount)` then `TokenMessengerV2.depositForBurn(amount, destinationDomain, mintRecipient(bytes32), burnToken, destinationCaller, maxFee, minFinalityThreshold)`; Circle's Iris attests the burn; `receiveMessage(message, attestation)` on the destination MessageTransmitterV2 mints. `TokenMessengerV2` is `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` on Ethereum, Avalanche, OP, Arbitrum, Base, Polygon, HyperEVM and others (EIP-55 strict check passed; code present on Base, 2,175 bytes, `eth_getCode` this run). Domains: Ethereum 0, Avalanche 1, OP 2, Arbitrum 3, Solana 5, Base 6, Polygon 7, HyperEVM 19. [W-cctp-addr], [W-cctp-chains] (H; chain read H) |
| Signer | owner (approve and burn). Mint: **anyone**, unless `destinationCaller` is set (then only that caller). With the Forwarding Service the mint is broadcast by Circle. |
| Gas | Source-chain native gas by the owner. Destination native gas for the mint **unless forwarded**. This is the "gas bootstrap" trap: an EOA with USDC but no POL/ETH on the destination cannot self-mint; forwarding or an intent bridge (Across) avoids it. |
| Fees | Standard transfer **0 bps** on every listed source. Fast transfer, live and doc: Ethereum 1 bp, Arbitrum 1.4, Base 1.3, OP 1.3, Solana 1 bp; Polygon has no Fast column ("N/A": standard is already ~8 s). Iris live: Base to Polygon `minimumFee 1.3` bps, Arbitrum to Polygon 1.4, Polygon to Base/Arbitrum 0. **Forwarding Service**: an extra fee; live `forwardFee` Base to Polygon 58,792 (low/med) and 59,126 (high) base units (interpreted as USDC, about $0.059; M on the unit), Polygon to Arbitrum 72,583 / 74,734 / 76,885; the docs say a $0.05 service fee plus destination gas, $0.20 for HyperCore deposits. The fee is deducted from the transferred amount unless paid upfront. The fee API is keyless (live GET 200). [W-cctp-fees], [W-cctp-fwd], [W-iris] (H) |
| Time | Fast attestation: Base, Arbitrum, OP ~8 s, Ethereum ~20 s, Solana ~8 s. Standard: Base, Arbitrum, OP, Ethereum ~15 to 19 min; Polygon ~8 s; Solana ~25 s. Worst: Linea 6 to 32 h, Starknet 2 to 4 h (not on any route here). Fast transfer depends on a global allowance (live: 53.8M USDC at 07:08Z); below it, a Fast request **degrades to standard** when `maxFee` is too low. [W-cctp-final], [W-iris] (H) |
| Failure and refund | If the actual fast fee exceeds `maxFee` the *burn transaction reverts* and nothing is burned (H, fees page). **A confirmed burn cannot be undone by the user**; value is recovered only by minting. A wrong `mintRecipient` mints to the wrong address; a wrong `destinationCaller` blocks the forwarder (H, HyperCore how-to). Solana `mintRecipient` must be the recipient's **ATA**, not the wallet (H). Attestation expiry/mint deadline: **NOT FOUND** (searched `llms.txt` and the fees, finality and forwarding pages for "expir"/"deadline"). Circle can blacklist USDC (FiatToken). |
| Geo/ToS | No protocol-level geo rule found (NOT FOUND, searched CCTP docs). Venue rules apply at the endpoints. |
| Coverage | **Not BNB for USDC. Not 3223.** |
| Proof | verified-docs + verified-chain (contracts present, fee API live). Not run by us. Needs MT1/MT3. |
| Reversible | No after the burn. Exposure: none to a third party except Circle's attestation. |

Planner notes: prefer **Polygon as the source** for speed (8 s, 0 fee, no fast allowance risk) and **Base/Arbitrum fast** (about 1.3 to 1.4 bps) when a quick arrival matters; use **forwarding** whenever the destination EOA may lack native gas.

#### T-HYP-IN: Base USDC to XO (Hyperlane warp route, XO's own)

Mechanism, signer, gas, fee, time, failure: exactly as in `[20 §4, §6, §4.1]` and `[TC] xo_fund_account` (H, [20]): Base router `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` (`HypERC20Collateral`) paired with XO route `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983`; sequence `USDC.approve(router, amount)` then `transferRemote(3223, bytes32(left-padded XO Kernel account), amount)` with `msg.value` exactly 0; zero fee, no code-level min/max; delivery median 14 s, p90 24 s, max 27 s (n = 253); wrong recipient encodings strand funds irrecoverably. **Re-checked this run**: `routers(3223)` on the Base router returns the XO route (`0x…9090463546d725f6ece5d1a4b27beb929d5d1983`) and `token()` returns Circle USDC (H); the XO explorer shows USDC.e supply 343,858.91 and fresh `ReceivedTransferRemote` logs about 1.6 hours before the read, so the route is live (H).
Proof: **verified-chain for the mechanism** (source, simulation, 483 deliveries through XO's *own executor*); **unproven** for a third-party raw transfer (door (e) and FU6/FU7, tests T3a). One EOA owns both ProxyAdmins and the USDC.e blacklist ([20 §0.6]); validators 2-of-3. Needs the XO account **deployed** first (`docs/phase1-gap-closing.md` A11), i.e. after T1.

#### T-HYP-OUT: XO to Base (the unproven exit)

Three candidates, all unproven:

| Id | Mechanism | Blocker |
|---|---|---|
| `XO.EXIT.H1` | Paymaster-less zero-fee UserOp `[USDC.e.approve(route, a), route.transferRemote(8453, owner, a)]`, signed `raw` by the owner, sent to XO's bundler ([P1] FU9, tool `xo_withdraw`). XO-side `transferRemote` simulates for a funded account (H, [20 V B]). | Bundler admission for this sender and delivery of a third-party message by XO's relayer are unobserved; test T4. |
| `XO.EXIT.APP` | The user withdraws in the XO web app ("Supported networks, minimum and maximum amounts, fees and expected delivery times are shown in the withdrawal flow itself"; USDC only; free balance only; irreversible) ([03 §3.1], H). | E4 manual. Whether a PayBox-owned account can sign into the app is unknown (Plan B of T1). |
| `XO.EXIT.DIRECT` | Owner EOA calls `account.execute(...)` itself (Kernel v3.1 `onlyEntryPointOrSelfOrRoot`, ECDSA validator `preCheck` requires `msgSender == owner`, H source), with the same two calls. | The EOA pays gas in **native XO**, which no outsider has; acquisition NOT FOUND ([03 §4.1]); chain 3223 is not in PayBox's catalog ([25 §2.1]). |

Known refusal: `PolicyPaymaster.checkPolicy(account, route, transferRemote)` returns `(false, "Contract/selector not allowed")`, so a *sponsored* withdrawal UserOp is impossible today ([20 §7], H). `USDC.e.transfer` *is* sponsored but only moves the money to another 3223 address (stuck unless it is itself an XO account).
Time if it works: 12 s median, 18 s max (230 samples, XO's own executor). Failure: the same strand cases as entry.

#### T-ACROSS: Across (intent bridge; fillers front the money)

Mechanism: `GET /api/swap/approval` returns `approvalTxns` and a `swapTx` to the origin SpokePool (Base: `0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64`, Polygon SpokePool seen in `suggested-fees` as `0x9295ee1d8C5b022Be115A2AD3c30C72E34e7F096`; both returned by the API, not independently pinned yet, M); keyless GET worked. Signer: owner; gas on the origin chain only (the recipient gets funds without destination gas, which solves the gas-bootstrap trap).
Live, $100 Base USDC to Polygon USDC: total fee **$0.0156** (1.56 bps: relayer capital 1 bp + destination gas 0.56 bp + LP 0), `estimatedFillTimeSec 1`, `minDeposit` $0.50, instant fills up to about $14,186; larger amounts take a longer path (limits object, H). **The returned approval transaction was an unlimited approve** (`ffff…`) (H). Status: `GET /api/deposit/status` keyless (404 `DepositNotFoundException` for an unknown tx). Refunds: the docs index lists a "Refunds" page for transfers that expire unfilled, but its body was not retrievable (client-rendered); the `deposit-address` API documentation says a refund address is strongly advised and otherwise recovery is manual and slow (M). Geo/ToS: NOT FOUND (not searched beyond the API docs).
Proof: verified-docs + live quote. Needs MT2.

#### T-LIFI: LI.FI aggregator (routes over many bridges and DEXs)

Keyless `GET /v1/quote`; keyless limit **200 requests / 2 hours**, 200/min with a key (H, LI.FI `llms.txt`). Live quotes ($100, all keyless):

| Route | Tool chosen | Output | Est. time | Fees shown |
|---|---|---|---|---|
| Base USDC to BNB USDT | `lifiIntents` | 99.832 USDT (18 dp) | 8 s | LI.FI fixed fee $0.2504 (0.25%), source gas ~$0.003 |
| Base USDC to Polygon USDC | `polymerStandard` | 99.75 USDC | **1,080 s** | same fixed fee |
| Arbitrum USDC to BNB USDT | `okx` swap + `across` | 99.846 (min 98.967) | 1 s | fixed fee + relayer fees |

Every `transactionRequest.to` was the LI.FI Diamond `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE` (strict checksum OK; same on Base and Arbitrum). The calldata is *opaque to a simple decoder* (facet-specific bridge data). Lesson for ranking: LI.FI's default pick for Base to Polygon was a slow route; the planner ranks with its own time weight, not the aggregator's order.
Proof: verified-docs + live quote. Planner class: **opaque calldata** (E2t with simulation, flag `ENABLE_MOVE_OPAQUE_ROUTES`).

#### T-DEBRIDGE: deBridge DLN

Keyless `GET /v1.0/dln/order/create-tx` returned (Base USDC to BNB USDT, $100): output 99.383 USDT (usd price impact −0.617%), protocol fee 4 bps, taker margin 4 bps, estimated operating expenses ~0.457 USDC, **`fixFee` 1,000,000,000,000,000 wei (0.001 ETH) required as `tx.value`**, `approximateFulfillmentDelay` 3 s; `tx.to` `0xeF4fB24aD0916217251F553c0596F8Edc630EB66` (DlnSource; strict checksum OK; M that it is the canonical source contract, pin from deBridge docs before use). Coverage 18 chains, no HyperEVM, no 3223. Proof: verified-docs + live quote. Class: opaque calldata **with native value** (a cap on `value` is needed).

#### T-RELAY: Relay

60 chains listed keyless (`GET /chains`). `/quote` is a POST and the docs describe API keys as self-serve from a dashboard with default 50 quotes/minute; whether quoting works keyless is **unproven** here (not tested: POST, and creating a key is an account). Relay documents local **input validation** (recompute the order id from `includeProtocolData` and check recipient, minimum output, currencies and deadline) which fits the planner's verify-before-sign rule ([W-relay-validation], H docs). Class: opaque calldata but verifiable; optional, user-supplied key; default off.

#### T-PMBRIDGE: Polymarket Bridge API (both directions)

| Field | Content |
|---|---|
| Mechanism | **Deposit**: `POST /deposit {address}` returns one bridge address per family (`evm`, `svm`, `btc`, `tron`); the user sends supported assets from the matching chain to it; they are swapped and wrapped to **pUSD on Polygon** and credited to the Polymarket wallet. **Withdraw**: `POST /withdraw {address, toChainId, toTokenAddress, recipientAddr}` returns addresses; the user sends **pUSD** from the Polymarket wallet to the `evm` address; funds are unwrapped (Collateral Offramp), swapped through a Uniswap v3 pool and bridged. `POST /quote`, `GET /status/{bridgeAddress}`, `GET /supported-assets`. (H, docs; `supported-assets` GET live) |
| Coverage (live) | Deposit sources include USDC/USDT on Ethereum (min $3), Optimism, Arbitrum, Polygon, Base, **BNB (USDT, two USDC, USD1; min $2)**, HyperEVM, **Hypercore USDC (chain 1337)**, Solana, Bitcoin, Tron, Monad, Ink, Robinhood. Minimum $2 for the USDC/USDT rows I checked on Base, Arbitrum, Polygon and BNB (Ethereum $3). |
| Signer / gas | The send is a plain ERC-20 `transfer` to the provider-issued address (E3 `request_transfer`, or E2t). From a Deposit Wallet the send is a gasless relayed `transferErc20` batch (needs the Relayer/Builder key, section 4.2). |
| Fees / time | "Withdrawals are instant and free — Polymarket does not charge withdrawal fees"; the quote example shows an app fee (0.3%) plus fill cost and swap impact (total 0.6% in the **example** payload, not a live quote, M), `estCheckoutTimeMs 45000`; "typically within a few minutes". The unwrap swap "enforces less than 10bp" in the UI and "at times this pool may be exhausted"; for very large amounts (> $50,000) use a third-party bridge. (H docs) |
| Failure | Failed or stuck transfers or compliance holds are handled by the bridge provider's support (Fun.xyz, per the status page link, H); wrong-token deposits via `recovery.polymarket.com` (H). Do not pre-generate withdrawal addresses: "Each address is configured for a specific destination" (H). |
| Geo/ToS | Polymarket global: OFAC jurisdictions blocked; close-only on frontend and API for a long list including the US, UK, France, Germany, Italy, Poland, Singapore, Taiwan, Thailand, Australia, Belgium, Ontario (and others); attestation forbids VPN circumvention; third-party apps must not execute for users in restricted places ([08 §2.11, §8], H). **Withdrawing/closing is allowed in close-only; depositing is not meaningful.** |
| Proof | verified-docs + live asset list. **The deposit/withdraw addresses are provider-issued**, so the planner's recipient class R3 applies (section 9). Needs MT4. |

#### T-PBX-SWAP and T-PBX-TRANSFER: PayBox-native (E3)

`request_swap`: `src_chain`, `dst_chain` ("Set a different chain to bridge"; `pending_settlement` until delivered), `recipient` (defaults to the wallet's own address; "across VMs pass a destination-chain recipient"), `slippage_bps` default 50, `value_cents` "for policy", routed by MoonX (live tool schema + docs, H). `request_transfer`: native or ERC-20 transfer, PayBox builds and broadcasts, `to`, `amount`, `value_cents` (live schema, H). Fees, route set, pair coverage and time for any pair: **NOT FOUND / unverified** (the live tool text says to let the live quote decide). Chain 3223 absent from the catalog ([25 §2.1]). The planner treats these as available edges with `proof: unproven (pair-level)` and uses them for (a) own-wallet bridging when no better edge exists, (b) the Solana to EVM cross-VM move, (c) plain sends to provider-issued or own addresses. Their weakness is verification: we cannot rebuild what PayBox builds; we pin arguments and reconcile with balance reads.

### 4.2 Venue edges (enter, leave, enable, redeem)

#### XO (chain 3223; Kernel v3.1 account; USDC.e)

| Edge | Mechanism | Signer / gas | Cost / time | Proof |
|---|---|---|---|---|
| `XO.DEPLOY_ENABLE` | One UserOp: `USDC.e.approve(exchange, max)` + `CTF.setApprovalForAll(exchange, true)`, with `initCode` on first use ([TC] `xo_deploy_enable_trading`) | owner `raw` signature; XO PolicyPaymaster sponsors (allowlisted selectors) | $0; block time ~1.5 s ([03 §4.1]), inclusion latency not measured | verified-chain for the bytes; **unproven** that XO's bundler/orderbook admit a self-derived account (doors a, b; test T1) |
| `XO.ENABLE_CAPPED` | Capped allowance instead of unlimited ([P1] T8) | same | $0 | unproven (T8) |
| `XO.ORDER_SELL` / `XO.ORDER_BUY` | EIP-712 order, Kernel-wrapped; `POST /order` with L2 HMAC credentials ([TC] `xo_prepare_order`, `xo_submit_order`) | owner `typedData`/`raw`; no gas | taker fee `base × p × (1−p)` on eligible markets, `/fee-rate` is advisory ([03 §6]); taker orders hold 500 ms to 3 s | verified at contract level; gateway acceptance **unproven** (doors b, c; T2, T3b) |
| `XO.REDEEM` | UserOp `redeemPositions(USDC.e, 0x00..00, conditionId, [1,2])`, up to 50 per op; precondition `payoutDenominator > 0` (CLOSED ≠ "nothing to claim"; `VOIDED` pays 0.5 per share) | owner `raw`; sponsored | $0; payout to the account | mechanism verified-docs; first-time success **unproven** (T5) |
| `XO.EXIT.*` | section 4.1 | | | unproven |
| `XO.APP_DEPOSIT` | The XO app's deposit address / provider checkout ([03 §3.1]) | human | provider fees NOT FOUND | E4, documented; PayBox-owned account use unknown |
| `XO.REVOKE` | `approve(exchange, 0)` + `setApprovalForAll(false)` ([TC] `xo_revoke_trading`) | owner | $0 | pre-test in T1/T8 |

Geo/ToS (H, XO ToS via [08 §8]): restricted regions include US, UK, France, Singapore, Ontario; bots allowed if they "comply with these Terms and not overwhelm or misuse the system". Exposure statement already accepted by the user for creation (O5 is *not* accepted for creation); for plain trading and funding no extra clause is known.

#### Polymarket (Polygon; Deposit Wallet; pUSD) — credential-gated

New accounts (deployed since 2026-05-04) are **Deposit Wallets** (`signatureType 3`). Creating one, approving, transferring, redeeming and perps funding all go through the **Relayer** with a **Relayer API key or Builder API key made by the user in polymarket.com → Settings → API Keys** ([W-pm-wallets], H). That is a human UI step ("no browser automation" applies: the user does it). The planner models the key as a *credential precondition*: stored only in the local relay's encrypted store (user-supplied, never by us), absent means the edge is unavailable, not failed.

| Edge | Mechanism | Notes | Proof |
|---|---|---|---|
| `PM.DEPOSIT` | T-PMBRIDGE deposit (send to provider address from any supported chain) | min $2; few minutes | verified-docs |
| `PM.APPROVALS` | `setupTradingApprovals()` relayed batch (owner signs an EIP-712 `Batch` typed data; Relayer submits; gasless) | needs Relayer/Builder key | verified-docs |
| `PM.ORDER` | EIP-712 order wrapped for the Deposit Wallet (ERC-7739 `TypedDataSign`, [25 §4.1]); `POST` to CLOB with L2 credentials | geoblock by request IP | verified-docs; unexercised |
| `PM.REDEEM` | `redeemPositions` as a Deposit Wallet batch (V2 uses one call per outcome; CTF both in one); "no redemption deadline"; no amount parameter | relayer key | verified-docs |
| `PM.WITHDRAW` | `transferErc20(pUSD, bridgeAddress, amount)` batch, then T-PMBRIDGE withdraw; or a direct pUSD `transferErc20` to the owner EOA ("some exchanges no longer accept pUSD directly", H) | relayer key; **pUSD is not USDC**: unwrapping costs the Uniswap-pool step | verified-docs |
| `PM.DW_DIRECT` | Calling the Deposit Wallet without the Relayer | **NOT FOUND** (searched `wallets-auth`, `positions/manage`) | unproven |

Resolution risk that matters to timing: UMA optimistic oracle, undisputed ~2 h, disputed 4 to 6 days; a "50/50" outcome pays $0.50 per token ([08 §2.10], H).

#### Predict.fun (BNB; Kernel account via Privy/ZeroDev; USDT 18 dp)

Deposits and withdrawals "are powered by Fun.xyz" (checkout UI); sign-up by email/social/Web3 wallet generates a **ZeroDev smart wallet**; "if you sign into Predict using a Web3 wallet, we'll default to that as a withdrawal option"; and the wallet page documents a **contract-level withdrawal**: from the exported owner key, call the helper `encodeUSDTTransfer(to, amount)` (`0xf4aa30b537882eca7e69defb68d6f631cda77b00`, shown lower-case in the doc; checksum not applied, verify before pinning) and then `execute(0, 0x00…00, payload)` on the user's smart-wallet address (H doc) ([W-predict]). By Kernel v3.1 source an owner-EOA `execute` call passes `onlyEntryPointOrSelfOrRoot` when the root validator is the ECDSA validator hook (H source on `master`; the deployed Predict validator bytecode not read, M).
Edges: `PREDICT.DEPOSIT` (E4 checkout, or a direct USDT `transfer` to the smart-wallet address, M), `PREDICT.WITHDRAW.UI` (E4), `PREDICT.WITHDRAW.DIRECT` (E2t: owner `execute` with BNB gas; applies **only if the PayBox EOA is the wallet's owner**, i.e. the user signed up with that wallet; otherwise the owner is a Privy-held key PayBox does not control: **impossible** for us). Orders: EIP-712 per market with per-market `feeRateBps` signed in; mainnet API needs a user-made key and JWT login; takers 0.018% to 2%, min order 1 USDT ([09 §2.1], H). ToS: trading not permitted in the US, UK, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan; VPN prohibited; ToS dated 2025-11-18 (stale risk) ([09 V A4], H).

#### Opinion (BNB; Gnosis Safe trading wallet; USDT 18 dp)

Funds sit in a **Safe**; one-time "Enable Trading" is a Safe transaction ([09 §2.2]). Builder Mode (SDK) builds Safe transactions (`build_split_tx`, `build_merge_tx`, `build_redeem_tx`, `build_withdraw_tx(safe_address, token_address, amount, to_address)`), the user signs the EIP-712 Safe data, and `submit_safe_tx` has the backend relay it ("no gas is needed from the user", 30 to 60 s) ([W-opinion-builder], H docs; Builder access conditions not read, M). Without the builder path, a Safe owner can execute a Safe transaction themselves (standard Safe `execTransaction`, owner signature + BNB gas; generic Safe behaviour, M, not read here). Deposit: USDT to the Safe on BNB (M). Fees: taker 0 to 1%, **$5 minimum order, $0.25 minimum fee** (5% at the minimum) ([09 V E3]). ToS: restricted jurisdictions include the US, UK, France, Ontario, Singapore, Poland, Thailand, South Korea, China, Taiwan, Hong Kong; VPN prohibited ([09 §2.2]). Edges: `OPINION.WITHDRAW.SAFE` (E2v builder or E2t Safe `execTransaction`), `OPINION.REDEEM` (same). Proof: verified-docs (builder), unproven (our use, PayBox signing of the Safe typed data on chain 56).

#### Limitless (Base; EOA mode)

In **EOA trading mode** funds are in the owner EOA on Base ("smart-wallet 1-click mode makes the API reject EOA-signed orders") ([09 §2.3], H). So there is *no deposit or withdraw edge*: only approvals (`USDC.approve(venue.exchange)`, plus `feeModule` on the new venues) and `redeem`. The HMAC token is made in the UI or by a headless Privy-identity-token route that an agent EOA may not complete ([09 V B3]). ToS: US, China, Ontario, Alberta excluded; bots explicitly allowed, wash trading and multi-account evasion prohibited; do not cancel on-chain (can get the address blocked) ([09 §2.3]). Liquidity is near zero ($15.6K/24h), so moves *to* Limitless are rarely useful. Proof: verified-docs.

#### Hyperliquid (HyperCore; USDC)

| Edge | Mechanism | Signer / fee / time | Proof |
|---|---|---|---|
| `HL.IN.BRIDGE2` | Wallet-connected deposit: Arbitrum USDC to Hyperliquid's bridge | Fee: Arbitrum gas. "Deposits below 5 USDC are lost" ([W-hl-faq], H); email-login accounts instead use an Across-managed flow with auto-redirect below 5 USDC and loss below 1 USDC | verified-docs |
| `HL.IN.CCTP` | `depositForBurnWithHook` on `TokenMessengerV2` (or Arbitrum `CctpExtension` `0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE`) with `destinationDomain 19`, `mintRecipient = destinationCaller = CctpForwarder 0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757` (HyperEVM) and hook data carrying the **HyperCore recipient**; optional Circle forwarding to HyperCore costs $0.20; **no minimum**; Arbitrum fast to HyperCore has no fast fee ([W-hc-concept], [W-hc-addr], H docs) | owner signs approve + burn; time: fast ~8 s + HyperEVM mint | verified-docs; the hook data is the recipient, so it must be decoded and checked (section 9) |
| `HL.ACTIVATE` | A new HyperCore account is charged **1 USDC** on its first outbound action (withdraw/`sendAsset`); that action needs ≥ 1 USDC balance ([W-hc-concept], H) | | verified-docs |
| `HL.OUT.W3` | `withdraw3 {hyperliquidChain, signatureChainId, amount, time, destination}`, user-signed EIP-712 (`HyperliquidSignTransaction`, chainId = `signatureChainId`, e.g. `0xa4b1`) to `POST /exchange`; validators sign and send to the bridge; **$1 fee, ~5 minutes** ([W-hl-exchange], H) | PayBox `typedData`; chain-id acceptance untested | verified-docs |
| `HL.OUT.CCTP` | `sendToEvmWithData {…, destinationRecipient, addressEncoding, destinationChainId (CCTP domain), gasLimit, data, sourceDex "spot" or ""}` signed EIP-712; with `data: "0x"` automatic forwarding; forwarding fee initially 0.2 USDC to Arbitrum, more to Ethereum ($1.20) and Solana ($0.50); amount must exceed fees or the HyperEVM tx reverts; passing custom `data` means "anyone can receive" ([W-hc-withdraw], [W-cctp-fwd], H) | PayBox `typedData` | verified-docs |
| `HL.AGENT` | `approveAgent` (≤ 3 named + 1 unnamed per account, ≤ 180 days); agent wallets "are only used to sign" orders; `agentSendAsset` requires destination = source (internal spot/perp transfer only) ([W-hl-exchange], H) | | **an agent wallet cannot withdraw to an arbitrary address**: good for order flow, irrelevant for moves |
| `HL.MERGE`/`SELL` | Outcome positions convert back with `userOutcome` merge/negate actions or are sold on the book | | M |

Geo/ToS: Interface unavailable to the US and Ontario; outcome markets additionally to "Excluded Persons" in jurisdictions Hyperliquid designates from time to time (open-ended, a plugin cannot hard-code it) ([09 V C1], H). Nonce hygiene: do not reuse agent addresses ([25 §4.1]).

#### Solana venues (Pascal) and Solana to EVM

Pascal: each owner wallet has an immutable deposit address (a PDA); funding is an SPL USDC transfer; withdrawals are wallet-signed Ed25519 JSON with a flat $0.50 fee; trading keys cannot withdraw ([census] Pascal entry, M: single-pass research). Solana to Base money: CCTP (Solana supported, fast ~8 s, 1 bp, forwarding supported except for HyperCore→Solana; `mintRecipient` must be an ATA when Solana is the *destination*) or PayBox `request_swap` cross-VM (documented, pair coverage unverified). `solanaMessage` signature scheme/encoding is undocumented ([25 §2.2]). Priority: low (volume ~$33K/day).

#### SX Bet, Kalshi, Polymarket US, Novig, OG, ProphetX, Gemini, UDX

SX Bet: EOA signs orders on SX Rollup 4162 (not in PayBox's catalog); capital sits in a per-user proxy; funding via a Glide deposit address from Ethereum, Arbitrum, OP, Base, Avalanche or Polygon (UI) ([census], M). Withdrawal mechanics: **NOT FOUND** (the census text is truncated; no first-hand read). The regulated USD venues use KYC'd accounts and API-key request signing; a wallet can at most fund them through the venue's own deposit flow ([08 §9], [25 §4.2]). All are **E4 manual** in the planner.

### 4.3 Position-level edges (cash out, redeem)

The only ways a position leaves a venue:

| Venue | Sell/close | Redeem after resolution | Merge | Who signs / gas | Notes |
|---|---|---|---|---|---|
| XO | `XO.ORDER_SELL` (fee withheld from proceeds) | `XO.REDEEM` (UserOp, sponsored) | `mergePositions` is paymaster-allowlisted ([03 §4.3]) | owner | `GET /claimable` is a hint; the gate is `payoutDenominator > 0`. Resolution period median ~16 min after resolve (max 2.06 h, n=70, [03 §8.3]). |
| Polymarket | CLOB SELL from the Deposit Wallet | `PM.REDEEM` batch | `mergePositions` via `Manage Positions` | owner + Relayer key | UMA proposal then ~2 h challenge ([08 §2.10]). |
| Predict.fun | order sell (API key + JWT) | on-chain via CTF Exchange contracts / UI (M) | | owner / Predict key | UMA since 2026-03 (conflicting older text) ([09 §2.1]). |
| Opinion | order sell | `build_redeem_tx` (Safe, redeems all eligible) | `build_merge_tx` | Safe owner | "Opinion AI" is the primary oracle ([09 §2.2]). |
| Limitless | order sell (EOA) | CTF redeem from EOA (M) | | EOA | Pyth/Chainlink/"external venue parity". |
| Hyperliquid | order sell; or `mergeOutcome` | protocol-native auto-settlement | `userOutcome` | owner/agent | Deployer-settled markets, no dispute path ([census]). |
| Pascal | order (reduce-only sells) | exchange-settled | n/a | trading key | |
| Kalshi etc. | venue UI/API | venue | | human | E4. |

### 4.4 Preconditions that recur (the planner evaluates these against live reads)

`native_gas(chain) ≥ estimate`; `allowance == 0 or == exact`; `account_deployed(chain)` (code present, never an explorer flag, [DD §2.3]); `venue_registered`; `trading_enabled` (read `allowance()`/`isApprovedForAll()`, not only logs, [P1] A8); `credential_present(venue)`; `jurisdiction_attested(venue)`; `amount ≥ min(edge)` (e.g. HL Bridge2 5, Polymarket bridge 2, Across 0.50, XO first order floors); `amount > fees` (HyperCore forwarding, Pascal $0.50); `destination_not_close_only`; `no_funding_in_flight` (XO one funding at a time); `kill_switch_off`; `flag_on`.

---

## 5. Live snapshot (what the planner's quoters returned)

### 5.1 Coverage and limits

| Source | Observation (2026-10-20) | Tag |
|---|---|---|
| LI.FI `/v1/chains` | 66 chains; 3223 absent | H |
| Relay `/chains` | 60; 3223 absent | H |
| Across `/api/swap/chains` | 24; 3223 absent | H |
| deBridge supported chains | 18; 3223 and 999 absent | H |
| Circle Iris `fastBurn/USDC/allowance` | 53,814,684 USDC at 07:08Z | H |
| Polymarket `supported-assets` | includes BNB USDT/USDC/USD1, Hypercore USDC, min $2 (most) | H |

### 5.2 $100 quotes

| Route | Fee (all-in as returned) | Time | Class | Note |
|---|---|---|---|---|
| CCTP fast, Base to Polygon | 1.3 bps ($0.013) + destination gas or forward $0.059 | ~8 s + mint | decodable | |
| CCTP standard, Polygon to Arbitrum | 0 + forward ~$0.073 to $0.077 | ~8 s + mint | decodable | fast not needed from Polygon; Polygon to Base forward fee not read |
| CCTP fast, Arbitrum to Polygon | 1.4 bps + forward ~$0.07 | ~8 s | decodable | |
| Across, Base to Polygon | $0.0156 (1.56 bps) | est. 1 s | decodable (SpokePool ABI) | approval returned unlimited |
| LI.FI, Base to BNB USDT | $0.25 fixed + route | est. 8 s | opaque | |
| deBridge, Base to BNB USDT | 0.617% impact + 0.001 ETH | ~3 s | opaque + value | |
| Hyperlane, Base to XO | 0 | 14 s median, 27 s max | decodable | [20] |
| Polymarket Bridge, any to pUSD | example 0.3% app fee + fill cost | ~45 s est. | provider address | docs example, not live |
| HL CCTP deposit | $0.20 forward (optional) + $1 activation (first outbound) | ~8 s + mint | decodable hook | |
| HL `withdraw3` | $1 | ~5 min | typed data | |

---

## 6. The planner

### 6.1 What it is

A **pure, read-only function** `plan(intent, world) → ranked MovePlans`, run inside the user's own process (local relay/daemon; `docs/everyone-architecture.md` option 2.1). `world` is: the account graph (balances, addresses, deployment state), the edge registry (static facts and proof status, below), per-user *edge facts* (what this user has already observed working, below), live quotes from keyless GETs, flags/caps/kill state, and the user's jurisdiction attestations. It sends nothing, reserves nothing (reservations belong to `prepare`, otherwise a prompt-injected loop of `plan` calls would starve the day cap, the denial-of-budget vector in `[DD §5.4]`).

### 6.2 The edge registry and the edge-fact ladder

Static registry (data, versioned, schema-validated like `pm/registry`): the edge cards of section 4 as records with `proof`, `valid_from`, `source_urls`, `last_verified`, `ttl` (a stale record downgrades to `unproven`). Per-user **edge facts** in the relay's durable store (amendment A2): `edge_id → {state: unproven | observed | trusted, last_ok_at, max_amount_ok_usd}`. The ladder: `unproven` (default) → `observed` (this user ran it with the test amount and the arrival was verified by balance/receipt reads) → `trusted` (≥ N successful runs of ≥ test size; N = 2 is a judgement call, L). A fact is recorded only by the operator/user or by the relay's own verification, never by an agent call (`mv_record_edge_fact` is an admin tool, like the flags). This mirrors FU6/FU7/FU9 ("a fact the relay only learned from a probe never lifts it on its own", `[TC]` Caps).

### 6.3 Weights and search

Edge cost is a function of the amount `a`, not a constant: `cost(a) = fixed + a × bps + gas`, e.g. HL `withdraw3` $1 fixed, Pascal $0.50, HyperCore forwarding $0.20 to $1.20, Hyperlane 0, Across 1.56 bps + $0, CCTP fast 1.3 bps. Each edge exposes: `quote(a) → {out_amount, fee_usd, gas_usd, time_p50_s, time_p90_s, time_worst_s, valid_until}` from its adapter (CCTP: Iris fee GET; Across: `suggested-fees` + `limits`; deBridge: `create-tx` GET; LI.FI: `quote` GET, budgeted at 200/2 h; Hyperlane: static zero + route preflight; Polymarket: `/quote` POST; HL: static fees). A quote also carries `min_out`.

Because the graph is tiny (under 60 nodes, under 150 edges) and amounts change along a path, the search is **bounded enumeration of simple paths, depth ≤ 5**, evaluating `quote(a_i)` along each path, then a **lexicographic ranking**:

1. **Hard filters** (a path that fails any is dropped, and its reason is kept for "why not"): kill switch / required flag off; edge `proof = impossible`; precondition unmet and *not repairable by a step in the same plan*; credential missing; jurisdiction not attested for a node entered; amount below an edge minimum; amount above a per-step cap; **no-one-way-door** (6.6); a cap in 9; destination not close-only-safe.
2. **Proof class**: by default only `verified-*` edges (`proven_only`). `allow_unproven` (explicit, per call) admits `unproven` edges **capped at the test amount** and marks the plan `experimental`.
3. **Objective**: `cheapest` (min total friction USD at p90), `fastest` (min p90 time), or `safest` (min number of third-party-custody seconds, then cost). Default is `cheapest` subject to a time ceiling (default 30 min, a parameter).
4. **Tie-break**: fewer hops, then fewer signatures, then fewer opaque-calldata steps.

Output is the top 3 plans plus the best rejected path with its reason (so the agent can answer "why can't I go XO to Polygon directly?" truthfully: "no edge exists; XO exits only to Base, and that exit is unproven").

Pseudo-code (shape, not an implementation):

```
paths = simplePaths(graph, from, to, depthMax=5)
for p in paths:
   a = amountIn; steps = []
   for e in p: q = e.adapter.quote(a); a = q.min_out; steps.push(e,q)
   violations = hardFilters(p, steps, world)
   if violations: rejected.push(p, violations); continue
   candidates.push(rank(p, steps, objective))
return top(candidates, 3), best(rejected)
```

### 6.4 State-dependent repair steps

Preconditions are repaired by inserting steps rather than failing: `allowance < amount` → insert `APPROVE_EXACT`; `account undeployed` → insert `XO.DEPLOY_ENABLE` (sponsored, $0) for XO nodes; `no native gas on destination` → prefer forwarding/Across, else insert a manual step "obtain gas" (E4; the planner does not buy gas by itself); `HL new account` → require `amount ≥ 1 USDC + fees` or warn that the first withdraw will cost the activation fee; `Polymarket credential missing` → insert an E4 step "create a Relayer API key in Polymarket settings" and mark the plan `blocked_on_user`.

### 6.5 Just-in-time preparation (the central execution rule)

A plan is a **list**, not a bundle of signatures. Only step 1 is prepared when the user approves. Each later step is prepared **after the previous step is settled and re-quoted**, because digests commit to nonces, deadlines and gas, quotes expire, and a signed order or transaction is a bearer instrument (`[AD §6.2]`, `[P1]` signed orders have no timestamp). Between steps the executor re-runs the remaining plan's hard filters and quotes; if the remaining net outcome is worse than the plan's `min_out` for that step, or a precondition changed, it **pauses and re-plans from the current node** instead of continuing. The agent never holds a chain of pre-signed transactions.

### 6.6 The no-one-way-door rule

For any plan that ends in node `N` (or passes through it), define `exit_proven(N)` = exists an edge sequence from `N` to the owner EOA, each edge `verified-*` **and** an `observed` user edge fact at ≥ the amount, or the amount ≤ the test amount. If not `exit_proven(N)` for the planned amount, the plan is **refused** (or, with explicit second confirmation, capped at the test amount). Today this blocks XO beyond $3 per transfer and $10 lifetime (the existing counters), keeps Hyperliquid ($1 + $5 minimum issues) honest, and flags provider-issued transit addresses. The rule is cheap to compute and is the strongest single protection against "I can get in but not out".

### 6.7 Failure and unwind semantics

Every plan ends in, or can fall back to, a **rest node**: an account the owner controls with a proven exit (usually `owner@<chain>:USDC`). Each step declares: `abort_if` (conditions under which the executor stops before preparing), `on_failure` (what the user holds if this step fails: unchanged / in transit / stranded), `point_of_no_return` (true after a CCTP burn confirms, after `transferRemote`, after a provider address receives funds), and `unwind` (the reverse edge if one exists and is proven, with its cost). The catalogue is in section 14. Hard rule inherited from the repo: **after an `ambiguous` or `pending` result never re-issue the write; read the status; resume from the observed state.** Idempotency key for a step: `plan_id + step_index + attempt`; the relay's `sending` marker (A2) is written before every upstream POST or broadcast.

---

## 7. The Move Plan object

### 7.1 Relationship to existing objects

* **Leg Plan** (`[AD §6.3]`): ordered legs with executability class, size, limit price, GTD expiry, preconditions, unwind cost, abort conditions, `valid_until`. A Move Plan **generalises** it: a Leg Plan leg is a Move Plan step of `kind: "order"`; a plan may embed a `leg_plan_ref` so an arbitrage leg and its funding moves are one reviewable object. The "least liquid or riskiest leg first" and "size to what the second leg can fill" rules stay in the Leg Plan; moves are inserted *before* the leg they fund and re-quoted between legs.
* **Prepared** (`[RC]`): each signable step *contains or references* a Prepared item. Existing kinds `userop`, `order`, `auth`, `create` are reused unchanged for XO steps. Two kinds are added (section 8): `tx` (EVM transaction) and `venue` (typed-data venue action). Each Prepared keeps `sign.intent`, `expected_digest`, `digest_form`, `summary` with `digest_tag` and `inner_hash_tag`, `caps`, `capabilities`, `warnings`, `decoded`. The Move Plan never re-describes what a Prepared already commits to; it **adds** the plan-level fields.

### 7.2 Schema (TypeScript shape; strict zod in the real implementation, string amounts only)

```ts
interface MovePlan {
  v: 1;
  plan_id: string;                  // 128-bit hex, single plan
  plan_digest: Hex;                 // keccak256(canonical JSON of everything below except status/volatile fields)
  plan_tag: string;                 // first 16 hex of plan_digest, anti-accident only (RC A4 caveat)
  created_at: string; valid_until: string;       // min over step quotes; default 120 s; re-plan after
  owner: Address;
  intent: { from: NodeRef; to: NodeRef; amount_in: Usd; objective: "cheapest"|"fastest"|"safest"; max_total_friction_pct: string; deadline_s: number };
  mode: "proven_only" | "experimental";
  jurisdiction_attested: string[];  // venue ids the user attested for; planner never infers location
  steps: MoveStep[];                // ordered; step i+1 is not prepared until step i is settled
  totals: { in_usd: Usd; expected_out_usd: Usd; min_out_usd: Usd; fees_usd: Usd; gas_usd: Usd; friction_pct: string;
            time_p50_s: number; time_p90_s: number; time_worst_s: number; signatures: number; opaque_steps: number };
  exposure: { third_party_seconds_p90: number; nodes_without_proven_exit: NodeRef[]; one_way_doors: string[] };
  rejected_alternatives: { path: string[]; reason_codes: string[] }[];   // at most 3, for "why not"
  caps: { per_step_usd: Usd; per_plan_usd: Usd; day_remaining_usd: Usd; reserved_usd: Usd | null };   // reserved only after prepare
  warnings: string[];               // untrusted text never copied in; only fixed wording and slotted titles
  status: "planned"|"approved"|"executing"|"paused"|"settled"|"aborted"|"failed"|"ambiguous";
}

interface MoveStep {
  index: number;
  edge_id: string;                  // registry id, e.g. "CCTP.FAST", "HYP.BASE_XO", "PM.WITHDRAW"
  kind: "approve"|"transfer"|"bridge"|"deposit"|"withdraw"|"redeem"|"setup"|"order"|"wait"|"manual";
  class: "E2"|"E2t"|"E2v"|"E3"|"E4";
  from: NodeRef; to: NodeRef;
  amount_in: Usd; expected_out: Usd; min_out: Usd;     // base units + decimals carried separately in decoded
  fee_usd: Usd; gas_usd: Usd; native_value_wei: string | null;   // non-null only for allowlisted native-value edges
  time: { p50_s: number; p90_s: number; worst_s: number };
  proof: "verified-docs"|"verified-chain"|"unproven";  // never "impossible" in a plan
  edge_fact: "unproven"|"observed"|"trusted";          // this user's ladder state
  preconditions: Precondition[];    // each with last_checked_at and result
  recipient: { class: "R0"|"R1"|"R2"|"R3"; address: Address; label: string };   // section 9
  executor: { tool: string; args: Record<string, unknown> };   // "xo_redeem" | "mv_prepare_step" | PayBox-native args (class E3)
  prepared_ref: { prepared_id: string; digest_tag: string; inner_hash_tag?: string; expires_at: string } | null;  // set at prepare time only
  settle_when: SettleCondition;     // e.g. {balance_increase:{node, min}} | {status_api:{provider,id}} | {receipt:{chain,txHash}} | {delivered:{mailbox,messageId}}
  settle_timeout_s: number;
  abort_if: string[];               // machine codes, e.g. "quote_min_out_breached", "precondition_changed", "kill_switch"
  on_failure: "unchanged"|"in_transit"|"stranded"|"unknown";
  point_of_no_return: boolean;
  unwind: { edge_id: string; est_cost_usd: Usd; proof: string } | null;
  status: "planned"|"prepared"|"signed"|"submitted"|"confirming"|"settled"|"failed"|"ambiguous"|"skipped";
  evidence: { tx_hash?: string; request_id?: string; message_id?: string; balance_before?: string; balance_after?: string }[];
}
```

`digest_tags` for a step come from its Prepared (`summary.digest_tag`, `summary.inner_hash_tag`, `inner_hash_kind`); for an E3 step (PayBox builds the transaction) there is **no digest**, and the Plan Card says so ("PayBox builds this transaction; compare the amount, chain and recipient in PayBox's own window").

### 7.3 Example (illustrative, not the output of any run)

Intent: "move $40 from my Polymarket balance to XO and be ready to trade". Account graph: owner EOA with Base ETH; Deposit Wallet on Polygon holding $40 pUSD; XO account derived but undeployed. The shape the planner would produce (amounts and fees are placeholders drawn from the section 5 snapshot; addresses are the repo's public test vector `0xf39Fd6e5…2266` / `0xB3729F7e…d30d`):

| # | Edge | Class | Step | In to out | Fee | Time p50 / worst | Proof | Rest state if it stops here |
|---|---|---|---|---|---|---|---|---|
| 1 | `PM.WITHDRAW` | E2v then E3/E2t | Relayer `transferErc20(pUSD → provider address R3)` batch; Bridge `toChainId 8453`, token Base USDC, `recipientAddr` = owner EOA (R0) | 40.00 → ~39.9 | provider fee (quote) | ~1 to 5 min | verified-docs | funds at provider (in transit) |
| 2 | `XO.DEPLOY_ENABLE` | E2 | sponsored deploy + enable UserOp | n/a | $0 | seconds (not measured) | unproven (T1) | account deployed, $0 at risk |
| 3 | `APPROVE_EXACT` | E2t | `USDC.approve(router, 39.9)` on Base | | Base gas | ~2 s | verified-chain | allowance only |
| 4 | `HYP.BASE_XO` | E2t | `transferRemote(3223, bytes32(0xB3729F…), 39.9)` | 39.9 → 39.9 | 0 | 14 s / 27 s | verified-chain mech; unproven credit (T3a) | **point of no return**; exit unproven (T4) |

The planner would **refuse this plan at 40** until T3a and T4 are recorded (no-one-way-door), propose it capped at the funding test amount ($3 per transfer, $10 lifetime) with the experimental banner, and show the rejected alternative "Polygon USDC via CCTP" with its reason.

---

## 8. Executors: what exists, what is new

### 8.1 What the plugin can prepare today (all behind flags, all OFF)

| Step | Existing tool | Status |
|---|---|---|
| Deploy + enable trading | `xo_deploy_enable_trading` (`prepare`/`submit`, E2) | built; doors a, b unproven (T1) |
| Revoke trading | `xo_revoke_trading` | built |
| Redeem | `xo_redeem` (≤ 50 conditions) | built; first success unproven (T5) |
| Order buy/sell, cancel, status | `xo_prepare_order`, `xo_submit_order`, `xo_cancel_order`, `xo_order_status`, `xo_list_orders` | built; gateway acceptance unproven (T2, T3b) |
| Connect (credentials) | `xo_connect` | built; T2 |
| Fund (Base to XO) | `xo_fund_account` returns **one `io.paybox/transactionProposal` per call** | built, **not consumable in local mode** (section 0 item 4); follow-up reads (`delivery`, caps, ledger) are reusable |
| Withdraw (XO to Base) | `xo_withdraw` (H1, prepares only, `ENABLE_WITHDRAW`) | built; T4 |
| Reads | `xo_account`, `xo_positions`, `xo_orderbook`, `pm_*` (read-only comparison tools) | built |

### 8.2 New tools needed (names follow `<family>_<verb>`; classes per `bridge/tool-classes.ts`)

| Tool | Class | Purpose |
|---|---|---|
| `mv_list_edges` | read | The edge registry with proof status, per-user edge facts, current flags. Answers "what routes exist and which are proven". |
| `mv_quote_edge` | read | One edge's live quote for an amount (adapter call, rate-limited, no side effect). |
| `mv_plan_move` | read | Intent in, ranked MovePlans out (6.3). Pure; reserves nothing; writes a plan record for later reference. |
| `mv_get_plan`, `mv_plan_status` | read | Re-read a stored plan and each step's state/evidence; also reports `ambiguous`. |
| `mv_prepare_step` | prepare | Prepares step *i* only if steps < i are settled: re-quotes, re-checks preconditions and caps, **reserves** against the move counters, builds the Prepared item (`tx`, `venue`, or delegates to the existing XO preparers), or returns pinned PayBox-native arguments (E3) or manual instructions (E4). |
| `mv_submit_step` | submit | Takes `prepared_id` + the signed artifact (`serializedTransaction`, `signature`); verifies (6.5, 9.4); broadcasts or POSTs to the allowlisted venue host; never resends after ambiguity. XO steps delegate to the existing submit paths. |
| `mv_abort_plan` | prepare | Cancels remaining steps, releases reservations whose items have expired unsent. Always available (it can only reduce risk). |
| `mv_record_edge_fact` | admin (never given to agent tokens) | Moves an edge up the ladder after a verified small run; like the flag setters it exists only at the operator surface. |

Adapters (code units, one per transport): `cctp` (fees GET, `depositForBurn[WithHook]` calldata builder, Iris attestation poll, forwarding hook builder, mint builder), `hyperlane-xo` (reuses `src/xo` funding code), `across` (SpokePool ABI decoder; re-encode approve exact), `lifi` / `debridge` / `relay` (quote, simulate, verify target/selectors/value/recipient), `polymarket-bridge` (quote/deposit/withdraw/status, relayer-batch builder), `hyperliquid` (typed-data builders for `withdraw3`, `sendToEvmWithData`, hook-data builder for CCTP in), `safe` (Opinion Safe tx), `kernel-direct` (owner `execute` builder for Predict-type accounts).

### 8.3 Contract changes asked of `relay-core` (`src/relay/contract.ts` is frozen; a change goes through its owner)

* `PREPARED_KINDS` gains `"tx"` and `"venue"`.
* `DIGEST_FORMS` gains `"evmTxHash"` (keccak of the EIP-2718 signing payload) and `"venueTypedData"`.
* `payboxIntentSchema` gains `{ op: "transaction", transaction: <strict EIP-1559 object: chainId, nonce, to, value, data, gas, maxFeePerGas, maxPriorityFeePerGas, accessList [] > }`, strict (no extra keys), mirroring the live tool schema.
* `CALL_TEMPLATES` gains: `erc20_approve_exact`, `erc20_transfer`, `cctp_deposit_for_burn`, `cctp_deposit_for_burn_with_hook`, `cctp_receive_message`, `hyperlane_transfer_remote` (already used in `xo_fund_account`; reused), `across_deposit`, `kernel_execute_direct`, `safe_exec_transaction`, `opaque_route_call` (carries `target`, `selector`, `value`, and `simulated_effects`).
* `decodedTxSchema` (parallel to `decodedUserOpSchema`) so `verifyPrepared` can rebuild the transaction hash, the call list and the summary lines from decoded fields.
* `summary.inner_hash_kind` stays `"call_data"` for `tx`; a swapped call changes it.

### 8.4 New flags (all OFF; none can be set by an agent or the page)

`ENABLE_MOVE_TX` (any plugin-built EVM transaction, E2t), `ENABLE_MOVE_VENUE_API` (E2v POSTs to Hyperliquid, Polymarket Relayer/Bridge, Opinion), `ENABLE_MOVE_OPAQUE_ROUTES` (LI.FI/deBridge/Relay calldata), `ENABLE_MOVE_NATIVE_PAYBOX` (hand out pinned `request_transfer`/`request_swap` arguments). XO steps keep the seven existing flags. A flag that needs a live fact stays held until the fact is recorded, as `docs/phase1-gap-closing.md` A11 already specifies.

---

## 9. Caps, allowlists and recipients (per step, per plan, per day)

### 9.1 Recipient classes (a recipient not in a class is refused)

| Class | Who | Verification | Allowed for |
|---|---|---|---|
| **R0** | The owner EOA (the dedicated PayBox credential, `[P1]` O1) | equals the credential address | every bridge and withdraw destination |
| **R1** | A deterministic account derived from the owner: XO Kernel account, Polymarket Deposit Wallet candidate | recomputed locally by the pure derivation code; for funding, **positive proof of deployment** (`eth_getCode`/`AccountDeployed` logs) | XO entry (`HYP.BASE_XO`), Polymarket wallet entry only when `code-present` |
| **R2** | A registered venue account the user confirmed once (Opinion Safe, Predict wallet, HyperCore address = owner, Pascal PDA) | evidence recorded in the account graph (source, date); confirmation by the user, not by an agent | the venue's own deposit edge only |
| **R3** | A **provider-issued transit address** (Polymarket Bridge) | host allowlist (`bridge.polymarket.com`), issued for *this* plan (not pre-generated), shown in full on the Plan Card and the Signature Card, **cannot be cross-checked on chain before use** (the provider is the only source), amount capped at the test amount until `edge_fact = observed` | the single send in `PM.DEPOSIT`/`PM.WITHDRAW` |
| *(refused)* | Anything an agent, a market, a webpage or a provider message names | | never |

HL hook data and Circle forwarding make the recipient a *field inside bytes*; the decoder must extract it and require R0/R1/R2 (a CCTP `mintRecipient`, `destinationCaller`, a HyperCore recipient in hook data).

### 9.2 Contract, selector and token allowlists (pinned in code per chain; strict EIP-55; each pin carries its source and a code-hash check where the code is stable)

* **Tokens** (address, decimals, symbol): Base USDC `0x833589fC…A02913` (6), Polygon USDC / USDC.e, Arbitrum USDC, Ethereum/OP USDC, BNB USDT `0x55d39832…7955` (18) and the two BNB USDCs, XO USDC.e `0x80c12230…ab0c` (6), pUSD. Decimals are **never** taken from a provider response (BNB USDT is 18 decimals while USDC is 6; a 10^12 error is otherwise one field away).
* **Spenders** for `approve`: CCTP TokenMessengerV2 `0x28b5a0e9…cf5d` (and the Arbitrum HyperCore extension if used), the Hyperlane Base router `0x54716A53…DF5F`, the Across SpokePool for that chain (pin from Across docs; the API value is only a cross-check), the LI.FI Diamond `0x1231DEB6…EaE` and the deBridge `DlnSource` only when `ENABLE_MOVE_OPAQUE_ROUTES` is on.
* **Selectors**: `approve(address,uint256)` with `amount == step.amount_in` exactly (never `max`), `transfer`, `depositForBurn`, `depositForBurnWithHook`, `receiveMessage`, `transferRemote(uint32,bytes32,uint256)` with `destination ∈ {3223, 8453}` per direction and the `bytes32` left-padded and non-zero, SpokePool `deposit*`, `execute` (kernel-direct, only on accounts R1/R2), Safe `execTransaction`. Anything else is `opaque_route_call` and needs the opaque flag and simulation.
* **Native value**: 0 everywhere except a per-edge allowlisted maximum (deBridge `fixFee` as quoted, ≤ a cap in USD); Hyperlane requires exactly 0 (non-zero reverts, [20]).
* **Provider calldata**: recomputed or decoded; an unlimited approval returned by a provider is **replaced** by an exact one (observed live with Across).
* **Hosts** (https only, allowlisted, 4 req/s bucket like the relay): Circle Iris, Across, LI.FI, deBridge, Relay (if keyed), `bridge.polymarket.com`, `relayer-v2.polymarket.com`, `api.hyperliquid.xyz`, the user's RPC hosts.

### 9.3 Limits (proposed defaults, **L**; env-configurable *downwards* only, like the existing caps)

| Limit | Default | Counts |
|---|---|---|
| Per step | $50 | `amount_in` of one signable step |
| Per plan | $100 | sum of steps that leave a node the plan started in |
| Per day (moves) | $100 | UTC day, separate from the $10 order / $50 day trade caps; durable ledger, restart cannot reset |
| First use of an edge family | $5 | until `edge_fact = observed` (the ladder in 6.2) |
| Into XO | existing: $3 per transfer, $10 lifetime until FU6/FU7/FU9, then $50/day | existing relay funding ledger; the planner calls it, never bypasses it |
| Friction ceiling | 1.0% of amount plus $1.00 absolute | beyond it the plan needs an explicit extra confirmation line |
| Fee ceiling per tx | `maxFeePerGas ≤ 2 × current estimate`, gas cost ≤ $2 | prevents a fee-burn construction |
| Quote age at prepare | ≤ 60 s | re-quote otherwise |
| Opaque-route native value | ≤ $5 equivalent | |

Honest scope (inherited, `docs/plan.md` decision 5 and amendment A4): these limits bound what **our relay will prepare**. They do not bound what an agent with a signing grant asks PayBox to sign directly, and `raw` or `transaction` approvals show the approver a digest or a raw call. Therefore: a dedicated credential holding only what the user will move, approval-gated PayBox grants for any funded use, `typedData` preferred where the venue accepts it, and every tool description that prepares or hands out signing material states that the caps are advisory.

### 9.4 Checks at submit (not only at prepare)

`mv_submit_step` for a `tx` item: decode the returned `serializedTransaction`; require chain id, nonce, `to`, `value`, `data`, gas and fee fields to equal the prepared item byte for byte; recover the signer and require it equals the owner; re-run the allowlist and cap checks against the *decoded* transaction; check the kill switch and flags again; check the nonce is still the account's next nonce; only then broadcast. A mismatch refuses and records `signature_mismatch` (the signed artifact is then a loose bearer instrument in the agent's context, which the audit log notes). For `venue` items the same applies to the typed data hash.

---

## 10. Showing a plan for approval

### 10.1 The Plan Card (whole plan, shown once, by deterministic code)

Generated from the structured `MovePlan` by per-field renderers, never by an LLM and never from agent-written text (`[DD §5.3]` rule). It shows:

1. Header: `Plan <plan_tag>`, owner (short) and credential approval mode, `valid_until` countdown, mode badge (`proven only` or `EXPERIMENTAL`).
2. The path as a strip of nodes and edges with chain names, and for each step: edge name, class badge (E2/E2t/E2v/E3/E4), `amount_in → min_out`, fee, p50/p90/worst time, proof badge (verified-docs / verified-chain / unproven), and this user's edge-fact (`unproven`, `observed`, `trusted`).
3. Totals: friction %, number of signatures, total time p90 and worst, `exposure` (seconds in third-party hands, nodes without a proven exit, one-way doors) in plain words: "After step 4 this money can enter XO and no verified way back exists. Test amount only."
4. Recipients in full (R0/R1/R2/R3 labels). R3 is highlighted.
5. What the plan **cannot** do: "not atomic", "positions are not moved", "caps are advisory against a compromised agent".
6. Rejected alternative with reason.
7. Two buttons: **Approve plan** (authorises *preparation* of step 1 and the just-in-time continuation, nothing is signed) and **Reject**. Approving the plan does not sign anything.

### 10.2 The Signature Card (each signable step; extends `[DD §5.3]`)

For every `Prepared` item the existing checks run (`preparedSchema`, `checkPreparedSign`, owner derivation, freshness). For `tx`: the card rebuilds the transaction hash from `decoded`, renders the call from the closed template (`approve USDC 39.900000 to CCTP TokenMessengerV2`, `depositForBurn to domain 7 recipient <R0> (forwarding on)`), shows chain, `to`, `value`, nonce, fee ceiling in USD, **both tags** (`digest_tag` of the signing hash, `inner_hash_tag` of the calldata) and the plan header (`Plan 9f2c…a1 step 2/4`). For `venue` items: the typed-data domain, primary type, message fields. For E3: the exact `request_transfer`/`request_swap` argument object with chain, token, amount, recipient and `value_cents`, and the notice that PayBox builds the transaction. For E4: instructions plus the expected balance change that will mark the step settled.

### 10.3 Who signs what

| Step type | Prepared by | Signed by | Broadcast / submitted by |
|---|---|---|---|
| XO deploy/enable/redeem/withdraw | local relay (E2) | owner via PayBox `raw` | relay to XO bundler |
| XO order / connect | local relay | owner via PayBox `typedData` (or `raw`) | relay to XO gateway |
| EVM approve / burn / transferRemote / SpokePool deposit | local relay (E2t) | owner via PayBox `transaction` intent (returns `serializedTransaction`) | **local relay to the user's RPC** |
| Mint on destination (CCTP, not forwarded) | local relay (E2t) | owner (needs destination gas) or **anyone** | relay, or Circle's forwarder |
| Hyperliquid withdraw / CCTP out / approveAgent | local relay (E2v) | owner via PayBox `typedData` (chain id from `signatureChainId`) | relay POST to `api.hyperliquid.xyz/exchange` |
| Polymarket batch (transfer, redeem, approvals) | local relay (E2v) | owner `typedData` (Deposit Wallet `Batch`) | relay POST to Polymarket Relayer with the user's key |
| Plain transfer / PayBox bridge | plan pins arguments (E3) | PayBox (builds, signs in window, broadcasts) | PayBox |
| Manual venue steps | instructions (E4) | the human in the venue UI | the human |

---

## 11. Natural-language operation of moves (move-specific; the general terminal and agent design is in the sibling tasks and `[DD §5]`)

### 11.1 The loop

**Understand → Plan → Present → Approve → Execute (step by step) → Reconcile → Report.**

1. *Understand*: map "get my Polymarket money into XO and buy that market" to an `intent` with explicit `from`, `to`, `amount_in`. 2. *Plan*: `mv_plan_move` (read-only). 3. *Present*: the Plan Card (the agent may add prose but the card is authoritative). 4. *Approve*: the user approves the plan in the Cockpit or by the host's confirmation (`requiresUserInteraction` on prepare/submit tools, `[DD §5.5]` R3/R4). 5. *Execute*: `mv_prepare_step i` → Signature Card → `request_wallet_sign` → poll `get_request` (same id, never re-call) → `mv_submit_step` → wait for `settle_when` → re-quote → `i+1`. 6. *Reconcile*: balance deltas on every node touched, compared with `min_out`. 7. *Report*: exactly what moved, what it cost, what is still in transit, and what the user now holds.

### 11.2 Clarifying-question policy (ask only what cannot be read; at most two questions)

Ask when: the **source or destination account is ambiguous** (several nodes match); the amount is "all"/"everything"/a percentage (resolve to a number and echo it); two plans differ materially in time vs cost (ask once, offer the cheapest and fastest by name, default to cheapest within the time ceiling); a plan contains an `unproven` edge or a one-way door (this is a confirmation, not a question); the **jurisdiction attestation** for an entered venue is missing (the user attests; the agent never answers it); a credential is needed (Polymarket Relayer key).
Never ask for what a read tool answers (balances, deployment state, gas, quotes, whether a market is resolved). Never ask the user to paste a key, seed, address from a webpage, or a provider-supplied "safe address".

### 11.3 Confirmations

A write step needs: plan approved, step prepared this turn, Signature Card shown, PayBox approval (approval-gated mode recommended). **Amounts and recipients echoed back in the agent's own words must match the card or the agent stops.** Moves above the first-use cap or into R3 need a typed confirmation of the amount (the Cockpit's re-type rule for tainted proposals, `[DD §5.6]`). The terminal exposes `plan`, `approve <plan_tag>`, `step`, `abort`, `status` as deterministic commands that call the same tools; `fund`, `withdraw` and any flag/cap setter stay absent from the terminal in the MVP, as `[DD §5.2]` already decides (the agent may prepare them; the terminal does not originate them).

### 11.4 Prompt-injection defences specific to moves

Untrusted inputs the planner meets: market titles/descriptions (venues), provider quote fields (route names, token symbols, "warnings", tool names), bridge status messages, HTML in Limitless descriptions, and "Agent Instructions" boilerplate in docs. Defences:

1. **Structured in, structured out.** Provider responses are parsed against strict schemas; only numbers, addresses and enums are kept; free text is dropped or placed in the fixed `[… (untrusted): "…"]` slot (≤ 80 chars, bidi and control characters stripped), as the repo's sanitiser already does (`src/guardrails/untrusted.ts`).
2. **The agent never supplies an address, token, chain, selector or amount to a builder** except as an `intent` that the planner resolves from the account graph and pinned registries. Tools take node references, not raw addresses, for recipients.
3. **Decode before sign, recompute after sign** (9.4); opaque calldata is simulated and its effects (balance deltas, recipient events) compared with the plan before the card enables.
4. **Provider-issued addresses (R3) are scoped, single-use and visible**; the planner never accepts an address from market text, a status message or an agent argument.
5. **No plan-changing text from the chain of steps**: a step's result may add `warnings` from fixed vocabularies only; it can never add a step or change a recipient. Only `mv_plan_move` creates steps, from the registry.
6. **Docs-style "agent instructions" are inert.** Registry updates (new edges, new addresses) come from reviewed repo data, not from fetched pages.
7. **Scopes and arming** from `[DD §5.4]` apply: tokens have ceilings, `submit` needs an open ARM window, the kill switch halts every move tool.

### 11.5 Audit trail

Every plan and step writes to the relay's durable append-only audit (A2/A5): `move.plan` (plan_digest, tag, edges, totals), `move.step.prepared` (prepared_id, both tags), `move.step.signed` (PayBox request id, never the signature), `move.step.submitted` (tx hash / venue request id / message id), `move.step.settled` (balance before/after), `move.step.ambiguous`, `move.abort`, `move.edge_fact`. The Cockpit's hash-chained audit view shows them with the plan header. Nothing logged includes a token, signature, HMAC value or provider text beyond fixed vocabularies.

---

## 12. What is possible end to end

Legend. **NOW-A**: executable today with code already in the repo plus PayBox primitives as documented, with the relevant flags switched on by the operator, and no unproven XO door in the path. **NOW-P**: executable today only by the user's agent calling PayBox tools directly, with no planner, no verification and no caps, pair coverage unverified. **BUILD**: needs the tools in section 8 and the planner live tests MT1 to MT6 (section 13) but no unknown XO fact. **T-n**: unlocked only after the named live test. **NO**: not possible, with the fact.

"After the live tests" means T0 to T8 in `docs/phase1-gap-closing.md` §6 (T0 PayBox signing, T1 deploy + enable, T2 credentials and gateway, T3a $1 deposit, T4 exit, T3b first order, T5 redeem, T8 capped allowance and kill, T6 creation) plus MT1 to MT6.

| # | Move | Today | After planner build | After T0 to T8 and MT | Not possible / limit |
|---|---|---|---|---|---|
| 1 | Owner EOA USDC among Base, Polygon, Arbitrum, Ethereum, OP | NOW-P (`request_swap` with `dst_chain`, pair coverage unverified; or user's own CCTP/Across UI) | BUILD: CCTP/Across plans, exact approvals, forwarding, status polling (MT1, MT2, MT3) | same, with edge facts `observed` | none in principle |
| 2 | Owner EOA to/from BNB (USDT/USDC 18 dp) | NOW-P (`request_swap`; manual aggregator UI) | BUILD: Across / deBridge / LI.FI / Polymarket Bridge; opaque routes flag-gated (MT2, MT5) | same | **CCTP cannot do BNB USDC** |
| 3 | Base USDC to XO account (fund) | Code exists (`xo_fund_account`); the proposal is **not consumable locally**; agent can do the two txs via `request_wallet_sign transaction` + own broadcast (runbook) | BUILD: `tx` builder replaces the proposal in local mode (MT1) | T1 (account deployed), T3a (credit), then amounts above $3/$10 need T3a + T4 | XO deposit address `D` of the app is not exposed (NOT FOUND) |
| 4 | XO account to Base (exit) | **No verified path** | `xo_withdraw` (H1) exists; planner refuses beyond test amount | T4 decides; else E4 via the XO app (if PayBox-owned account can sign in, Plan B) | **Sponsored withdrawal is impossible** (paymaster refuses `transferRemote`); direct `execute` needs native XO nobody outside has |
| 5 | Inside XO: enable, buy, sell, cancel, redeem | Code exists; all flags OFF | same | T0 to T3b, T5, T8 | needs the four XO doors; caps advisory |
| 6 | Polymarket wallet to owner EOA (cash out) | Not by our tools; user can use the Polymarket UI (E4) | BUILD: `PM.WITHDRAW` (E2v + Bridge), **needs a user-made Relayer/Builder API key** | MT4, MT6 | geo: close-only users can exit; new Deposit Wallets need a Builder key to create |
| 7 | Owner EOA to Polymarket wallet | NOW-P: `request_transfer` to a provider-issued address (user fetches it) | BUILD: `PM.DEPOSIT` with R3 handling | MT4 | not for restricted jurisdictions |
| 8 | Polymarket to XO | Not as one move | BUILD: #6 + #3 chained | needs T1, T3a, T4, MT4 | the no-one-way-door rule caps it at test amounts |
| 9 | XO to Polymarket | NO (needs #4) | BUILD of #4's successor + #7 | needs T4 pass | |
| 10 | Hyperliquid in/out (USDC) | NOW-P (user UI; `request_swap` to HyperEVM is the wrong layer) | BUILD: `HL.IN.CCTP`, `HL.IN.BRIDGE2`, `HL.OUT.W3`, `HL.OUT.CCTP` (MT6 + PayBox typed data on chain ids 42161 / 1337) | | sub-5 USDC Bridge2 deposits lose funds; 1 USDC activation |
| 11 | Predict.fun / Opinion in/out | E4 (UIs) | BUILD owner-direct for Predict **only if the PayBox EOA is the wallet owner**; Opinion via Safe/builder | | Privy-owned Predict wallets: PayBox does not control the owner |
| 12 | Solana (Pascal) to/from EVM | NOW-P (`request_swap` cross-VM) | BUILD later (CCTP Solana adapter) | | `solanaMessage` encoding unverified |
| 13 | Kalshi, Polymarket US, Novig, OG, ProphetX, Gemini, UDX | E4 only | E4 only | E4 only | **NO** programmatic movement; KYC'd USD accounts |
| 14 | Move an outcome position to another venue | NO | NO | NO | **No venue accepts a foreign position token.** Close or redeem, move cash, re-enter |
| 15 | Atomic cross-venue leg pair | NO | NO | NO | Cross-venue legs are never atomic; the plan prices the legging reserve (`[AD §6.3]`) |
| 16 | XO to anything except Base; anything to XO except from Base | NO | NO | NO | No aggregator lists 3223; one warp route |
| 17 | Open new positions from a close-only jurisdiction | NO | NO | NO | Polymarket close-only; ToS lists elsewhere; no VPN, no masked-egress routing |
| 18 | Consolidate "everything to the owner EOA" | partial by hand | BUILD: the planner enumerates every node with a proven exit and emits one plan per node | | skips nodes without a proven exit and says so |

---

## 13. Planner live tests (all opt-in, none run; same discipline as `[P1] §6`)

| Id | Settles | Procedure (minimal) | Worst-case cost | Stop rule |
|---|---|---|---|---|
| **MT1** | PayBox `request_wallet_sign` `op:"transaction"` on Base: acceptance of the plugin-built EIP-1559 object, the signature artifact shape, and local broadcast | Throwaway credential. Build `USDC.approve(<own second address>, 1 unit)`-style harmless call (or a 0-value self-transfer), sign, verify locally, broadcast via the user's RPC | Base gas (cents) | Any refusal: record `transaction_intent: no`; E2t closed, fall back to E3 |
| **MT2** | Across: exact-approve + `deposit*` calldata decoding equals API calldata semantics; arrival and status | $2 Base to Polygon own address | $2 + gas | Decoder mismatch: never sign provider calldata |
| **MT3** | CCTP: `depositForBurn` standard from Polygon, then Base; mint via forwarding and by self-mint; Iris status | $2 | $2 + gas, forwarding fee ~$0.06 | Attestation not available in 30 min: wait, never re-burn |
| **MT4** | Polymarket Bridge: deposit and withdraw round trip with R3 addresses | $2 minimum; needs the user's Deposit Wallet + Relayer key for the withdraw leg | $2 + provider fees | Address mismatch between calls or a non-`COMPLETED` status after 30 min: stop |
| **MT5** | deBridge/LI.FI opaque route simulation: balance-delta check before sign | $5 Base to BNB | $5 + 0.001 ETH fix fee | Simulation disagrees with quote: drop the route |
| **MT6** | Hyperliquid: PayBox `typedData` with `signatureChainId 0xa4b1`; CCTP deposit with hook data; `withdraw3` round trip | $6 (above the 5 USDC Bridge2 floor, above the 1 USDC activation) | $6 + $1 withdraw fee | Any "lost below minimum" doubt: do not retry |

Composite acceptance for the planner itself: with all external calls mocked by recorded fixtures (like the XO mock), the 18 moves in section 12 produce the expected plans, refusals and reasons; property tests: no plan contains a recipient outside R0 to R3, no `approve` with amount other than `amount_in`, no step prepared before its predecessor settled, restart mid-step never resets a counter or re-sends.

---

## 14. Failure and unwind catalogue

| Failure | Where | What the user holds | Planner behaviour |
|---|---|---|---|
| Quote expired / `min_out` breached | before prepare | unchanged | re-quote once; if worse than plan, pause and re-plan |
| Approve confirmed, action not sent | E2t | exact allowance only | continue or revoke (insert `approve(spender, 0)` step, offered not forced) |
| CCTP burn reverts (fee > `maxFee`) | source | unchanged (no burn) | raise `maxFee` within the friction ceiling or switch to standard |
| CCTP burned, attestation slow | source done | in transit (Circle-attested) | wait; show Iris status; never re-burn; mint when ready |
| CCTP mint needs gas the EOA lacks | destination | in transit | switch to forwarded plan next time; now: E4 "obtain gas" or use any funded address to call `receiveMessage` (anyone can, unless `destinationCaller` set) |
| Wrong `mintRecipient` / hook recipient | source | **lost to that address** | prevented by decode-check (R0/R1/R2); if it happens, report, do not retry |
| Fast allowance exhausted | source | standard path | plan shows the slower time; no extra cost |
| Hyperlane: dispatched, not delivered in 10 min | Base to XO | in the warp route | report `dispatched_not_delivered`; **never resend**; check `Mailbox.delivered(messageId)`, not explorer logs ([20 §6.3]); no third party is known to be able to deliver |
| Hyperlane: wrong recipient encoding | Base | stranded | prevented by left-pad + re-decode ([20 §4.1]) |
| XO exit fails (H1) | XO | still in XO | stays one-way; hence the cap |
| Across: unfilled / expired | intent | refund path exists per docs index (body unread) | wait for refund; do not re-send; if no refund address was set, recovery is manual and slow (M) |
| LI.FI/deBridge route fails or partial | opaque | depends on route | provider status endpoints (keyless: LI.FI `/v1/status`, Across `/deposit/status`); no automatic retry; report |
| Polymarket bridge `FAILED` / compliance hold | provider | at provider | direct user to the provider's support (per Polymarket docs); no retry; recovery tool for wrong tokens |
| pUSD unwrap pool exhausted | Polymarket withdraw | pUSD in wallet | split the amount or withdraw pUSD directly (docs); planner offers both |
| Hyperliquid below-minimum deposit | Bridge2 | **lost** | prevented: hard block under 5 USDC for Bridge2; CCTP path has no minimum |
| HL first withdraw below 1 USDC after activation | HyperCore | stuck until balance ≥ 1 | prevented by precondition; warn on first outbound |
| `withdraw3` lost in validators' queue | HL | in transit ~5 min | status via HL info (POST) or balance; no resend |
| Provider returns different address on second call | R3 | n/a | refuse (single issuance per plan) |
| PayBox signature differs from prepared tx | submit | signed bearer instrument exists | refuse to broadcast; audit; tell user to revoke the grant if unexpected |
| Ambiguous broadcast (RPC timeout after send) | E2t | unknown | read receipt by tx hash; resume from observed state; never rebroadcast with a new nonce blindly |
| Kill switch or flag off mid-plan | any | wherever it stopped | plan becomes `paused`; steps not prepared; user decides |
| Geo status changes (close-only) | venue | existing positions | exits allowed, entries refused |

---

## 15. Risks, NOT FOUND, decisions for the user

**Risks that remain** (beyond those inherited from `docs/plan.md`):

1. **XO exit may never exist for outsiders** (T4 fails and the XO app cannot be used with the PayBox credential). The planner's no-one-way-door rule makes XO a capped, one-way spoke in that case; this is the correct honest outcome.
2. **Aggregator and bridge governance and honesty**: LI.FI, deBridge, Relay, Across, Polymarket's Bridge and Circle are third parties; provider-issued addresses cannot be cross-verified on chain. The mitigation is amount caps by edge-fact ladder, exact approvals, decode-and-simulate, and routing preference for the least-trust edges (CCTP, Hyperlane) when costs are close.
3. **PayBox `transaction` intent untested**; if it fails, E2t closes and every non-trivial EVM step falls back to E3 (PayBox-built) or manual.
4. **Single-source venue facts**: Pascal, SX Bet, Opinion Builder access, Predict deposit path are M-grade (census, docs read once). They are marked so in the registry and default to E4.
5. **Dedicated credential discipline** ([P1] O1/A4): moves are the most "blind approval"-prone flow (many small signatures). `raw` for XO UserOps stays opaque; this is the standing risk.
6. **Rate limits**: LI.FI keyless 200/2 h and Relay keys cap the quoting budget; the planner caches within a quote's validity only and prefers keyless adapters.

**NOT FOUND (searched)**: CCTP attestation/mint expiry (Circle `llms.txt`, fees, finality, forwarding pages); a CCTP-specific geo rule; Across refund page body (client-rendered; only the index entry read); Relay keyless `/quote` behaviour; a Polymarket Deposit Wallet call path without the Relayer (`wallets-auth`, `positions/manage`); SX Bet withdrawal mechanics; Opinion builder-mode access conditions and deposit mechanics; XO's deposit-address API; native XO acquisition for an outsider.

**Decisions for the user (defaults in brackets, all conservative)**:

| ID | Decision | Default until answered |
|---|---|---|
| DM1 | Allow opaque aggregator calldata (LI.FI, deBridge, Relay) at all | Off (`ENABLE_MOVE_OPAQUE_ROUTES`) |
| DM2 | Move limits (per step $50, plan $100, day $100, first-use $5) and friction ceiling (1% + $1) | As stated (L-grade judgement) |
| DM3 | Store a user-made Polymarket Relayer/Builder key in the local encrypted store | Not stored; Polymarket edges unavailable |
| DM4 | Accept LI.FI keyless quoting (200/2 h) as the only aggregator quote source | Yes, quote only on explicit request |
| DM5 | Ask the contract owner (relay-core) to extend `src/relay/contract.ts` as in 8.3 | Required before any `tx` step is built |
| DM6 | Whether the planner may insert the manual "obtain gas" step or must stop | Stop and ask |

---

## 16. Sources

Repo: `docs/plan.md`; `docs/phase1-gap-closing.md`; `docs/aggregation-design.md`; `docs/dapp-design.md`; `docs/everyone-architecture.md`; `docs/tool-contract.md`; `docs/runbook.md`; `docs/venue-census.md`; `src/relay/contract.ts`; `src/tools/fund.ts`; `docs/research/03`, `08`, `09`, `19`, `20`, `25`.

Web (all fetched 2026-10-20 unless stated; public, untrusted data):
* `[W-cctp-chains]` https://developers.circle.com/cctp/concepts/supported-chains-and-domains(.md)
* `[W-cctp-final]` https://developers.circle.com/cctp/concepts/finality-and-block-confirmations(.md)
* `[W-cctp-fees]` https://developers.circle.com/cctp/concepts/fees(.md)
* `[W-cctp-fwd]` https://developers.circle.com/cctp/concepts/forwarding-service(.md)
* `[W-cctp-addr]` https://developers.circle.com/cctp/references/contract-addresses(.md)
* `[W-hc-concept]` https://developers.circle.com/cctp/concepts/cctp-on-hypercore.md; `[W-hc-withdraw]` .../cctp/howtos/withdraw-usdc-from-hypercore-to-evm.md; `[W-hc-addr]` .../cctp/references/hypercore-contract-addresses.md
* `[W-iris]` https://iris-api.circle.com/v2/burn/USDC/fees/{src}/{dst}, `/v2/fastBurn/USDC/allowance`
* `[W-hl-exchange]` https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint.md; `[W-hl-faq]` .../support/faq/deposit-or-transfer-issues-missing-lost/deposited-usdc.md
* `[W-pm-*]` https://docs.polymarket.com/llms.txt, `/trading/bridge/{deposit,withdraw,quote,status,supported-assets}.md`, `/trading/wallets-auth.md`, `/trading/positions/manage.md`, `/concepts/resolution.md`; https://bridge.polymarket.com/supported-assets
* `[W-lifi]` https://docs.li.fi/llms.txt, https://li.quest/v1/chains, https://li.quest/v1/quote, https://li.quest/v1/status
* `[W-across]` https://docs.across.to/llms.txt, https://app.across.to/api/{swap/chains, suggested-fees, swap/approval, deposit/status}
* `[W-debridge]` https://dln.debridge.finance/v1.0/{supported-chains-info, dln/order/create-tx}
* `[W-relay]` https://api.relay.link/chains; https://docs.relay.link/llms.txt, /references/api/api-keys.md, /references/api/api_core_concepts/input-validation.md (`[W-relay-validation]`)
* `[W-predict]` https://docs.predict.fun/llms.txt, /knowledge-base/wallets.md
* `[W-opinion-builder]` https://docs.opinion.trade/llms.txt, /developer-guide/opinion-clob-python-sdk/builder-mode/split-merge-redeem.md
* PayBox: https://docs.paybox.sh/reference/mcp-tools.md; live tool schemas of `request_transfer`, `request_swap`, `request_wallet_sign`, `check_operation_readiness` (loaded, not called)
* `[W-kernel]` https://github.com/zerodevapp/kernel (`src/Kernel.sol` @ `v3.1`); https://github.com/zerodevapp/kernel-7579-plugins (`src/validators/ECDSAValidator.sol`)
* XO explorer GETs: https://explorer-mainnet.xo.market/api/v2/{tokens/…, main-page/blocks, addresses/…/logs}
* Public Base RPC (read-only `eth_call`, `eth_getCode`): https://mainnet.base.org

---

## Verification

Re-checked in this run (2026-10-20 06:50 to 07:35 UTC machine clock; `date -u` read 07:13 UTC), with results:

1. **Circle CCTP supported chains** re-fetched as Markdown: BNB Smart Chain is "USDC: Supported on all CCTP domains except BNB Smart Chain; USYC only Ethereum and BNB"; Polygon PoS standard source, Fast "N/A"; domain ids 0, 1, 2, 3, 5, 6, 7, 19 as stated. Finality and fees pages re-read; Fast fees Arbitrum 1.4, Base 1.3, Ethereum 1, OP 1.3, Solana 1 bp; Standard 0 bp everywhere. **Match with the document.**
2. **Iris live GETs**: `/v2/burn/USDC/fees/6/3` and `6/7`: `minimumFee 1.3` (finality 1000) and 0 (2000); `3/6` and `3/7`: 1.4; `7/6`, `7/3`: 0. With `forward=true`: 6/7 `forwardFee` 58792 / 58792 / 59126; 7/3 72583 / 74734 / 76885. `/v2/fastBurn/USDC/allowance`: 53,814,684.49 at 2026-10-20T07:08Z. `/v2/messages/6?transactionHash=<dummy>`: 404 "Message not found". Keyless in every case. **Unit of `forwardFee` is my interpretation (M).**
3. **TokenMessengerV2** `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d`: strict EIP-55 passed (`cast to-check-sum-address` returned the same string); `eth_getCode` on Base returned 2,175 bytes (non-empty). **Base warp router**: `routers(3223)` (selector `0x2ead72f6`) returned `0x…9090463546d725f6ece5d1a4b27beb929d5d1983`; `token()` returned Circle Base USDC. XO explorer: USDC.e total supply 343,858.910649 (6 dp), 3,112 holders; latest block 12,687,525 at 07:13:27Z; route logs show `ReceivedTransferRemote` (topic `0xba20947a…`) at blocks 12,683,703 down to 12,678,518. **Confirms the route is live and paired as in [20]; does not re-prove the 2-of-3 ISM or the governance facts.**
4. **Aggregator chain lists**: LI.FI 66, Relay 60, Across 24, deBridge 18; checked ids 1, 10, 56, 137, 8453, 42161, 3223, 999 (and Solana where applicable). 3223 absent in all four; 999 absent only in deBridge. **Match.**
5. **Quotes ($100)**: LI.FI Base→BNB (`lifiIntents`, 99.832145563 USDT, 8 s), Base→Polygon (`polymerStandard`, 99.75, 1,080 s), Arbitrum→BNB (`okx`+`across`, 99.846, min 98.967, 1 s); fixed fee ~$0.25 each; every `transactionRequest.to` = `0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE`. Across `suggested-fees` Base→Polygon: `relayFeeTotal` 15646 on 100,000,000, `estimatedFillTimeSec 1`, limits `minDeposit 500012`, `maxDepositInstant 14186094370`; `swap/approval`: `approvalTxns[0].data` ends `ffff…ffff` (unlimited approve) to spender `0x09aea4b2…EC64`. deBridge `create-tx` Base→BNB: out 99.383220343 USDT, `protocolFee 40000`, `fixFee 1000000000000000`, `tx.value 1000000000000000`, delay 3. Status endpoints keyless (LI.FI `/v1/status`, Across `/deposit/status` returned a 404 error body for an unknown tx; the LI.FI call with a dummy hash returned data about an unrelated third-party transaction, which is not recorded). **All quote numbers are one-off samples.**
6. **Polymarket**: `trading/bridge/withdraw.md` ("Withdrawals are instant and free", unwrap via Collateral Offramp and Uniswap v3 pool, "Do not pre-generate withdrawal addresses"), `deposit.md`, `status.md` (statuses and polling), `quote.md` (example only). `bridge.polymarket.com/supported-assets` parsed: chains incl. Ethereum, Optimism, Arbitrum, Polygon, Base, BNB, HyperEVM, Hypercore (1337), Solana, Tron, Bitcoin; `minCheckoutUsd` 2 for the USDC/USDT rows on Base, Arbitrum, Polygon, BNB; 3 on Ethereum. `wallets-auth.md`: Deposit Wallet batches need a Relayer or Builder API key made in the Polymarket UI; `transferErc20`, `approveErc20`, redeem and position methods run through the Relayer. **No POST was made.**
7. **Hyperliquid**: `exchange-endpoint.md` withdraw text ("$1 fee ... approximately 5 minutes"), `sendAsset`, `usdSend`, `agentSendAsset` (destination must equal source), `approveAgent` (≤ 3 named + 1 unnamed, ≤ 180 days); FAQ "Connected via a wallet: Arbitrum only. Deposits below 5 USDC are lost"; Circle HyperCore pages: no minimum on the CCTP path, $1 activation fee on first outbound action, forwarding fee $0.20 for HyperCore deposits, addresses `CctpForwarder 0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757`, `CoreDepositWallet 0x6B9E7731…0A24`, Arbitrum `CctpExtension 0xA95d9c1F…4fcE`. **The 5 USDC floor belongs to the wallet-connected Bridge2 path; the CCTP path has none; the document keeps both and the planner picks by amount.**
8. **Kernel v3.1 source** (`Kernel.sol` @ `v3.1`, lines 79 to 95 and 314): `execute` is `onlyEntryPointOrSelfOrRoot`; a non-EntryPoint, non-self caller passes only if the root validator `isModuleType(4)` (hook) and its `preCheck` succeeds. `ECDSAValidator.sol` on `master` implements `IHook`, `isModuleType` includes `MODULE_TYPE_HOOK`, and `preCheck` requires `msgSender == owner`. **The deployed validator at `0x845A…cE57` was not compared with this source (M).**
9. **PayBox**: the four tool schemas were loaded (not called); `request_wallet_sign` description: "returns the signed artifact without broadcasting a wallet-sign transaction"; `request_transfer`: "PayBox builds and broadcasts"; `request_swap`: `dst_chain`, `recipient`, `value_cents`, "let its live quote determine whether the exact token route is available". `docs.paybox.sh/reference/mcp-tools.md` re-read for `transaction` intent output (`serializedTransaction`).
10. **Repo cross-checks**: `docs/everyone-architecture.md` line 73 (proposals only from the hosted plugin); `docs/runbook.md` line 33 (local route is `request_wallet_sign transaction` plus own broadcast); `docs/tool-contract.md` Caps table (funding $3 / $10 / $50, FU6/FU7/FU9); `src/relay/contract.ts` (`PREPARED_KINDS`, `DIGEST_FORMS`, `payboxIntentSchema` has only `raw` and `typedData`). No file in `src/`, `relay/`, `test/` or `package.json` was touched. Sibling files `docs/research/35` to `41` and `docs/dapp-aa-candide.md` did not exist.
11. **Privacy**: all requests used `User-Agent: insurance-markets-research/0.1`; the only addresses in queries were the public Anvil account 0 and public protocol/token contracts; no personal identifier, email, login or home path appears in this file; no scratch path from the session is reproduced; no `.env` or credential file was read.

**Not re-checked / still open**: Hyperlane ISM and governance facts (taken from [20], not re-derived); Across and deBridge contract pins against their own docs; Relay keyless quoting; PayBox acceptance of `transaction`, `typedData` for chains 42161/1337 and `raw` (T0, MT1, MT6); every XO off-chain door; Opinion/Predict/SX/Pascal mechanics beyond the cited docs; any unit interpretation marked M; all "proposed defaults" in section 9.3 (L).
