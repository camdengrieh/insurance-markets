# 20 - Funding route verification (Phase 0 gate 6)

Task key: `funding-route-verification`. Branch `build/xo-paybox-plugin`. Harness date 2026-10-19; the machine clock read 2026-10-18 19:50 to 20:25 UTC while this was run, so every "now" below means that evening. Read-only: no account, key, order or signature was created, nothing was signed or sent, no PayBox MCP tool was called, `submit_feedback` was not called, and nobody at XO was contacted (decision by the user).

Tags: **H** = read first-hand in a primary source or reproduced by my own computation this session (script id in brackets, scripts in `docs/research/fixtures/gaps/funding-route-verification/`); **M** = secondary or inferred; **L** = weak. "NOT FOUND (searched: ...)" and "NOT ESTABLISHABLE WITHOUT XO" are used literally.

## 0. Bottom line

**Gate 6 verdict: answered-go for the deposit leg, partial for withdrawal.**

1. **The Base-side router is identified and proven from both ends.** It is `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` on Base (8453), a TransparentUpgradeableProxy over a Hyperlane `HypERC20Collateral` v11.1.0. Base `routers(3223)` returns the XO route `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983`, and the XO route's `routers(8453)` returns the Base router. Both routes use the same Mailbox address and the same ISM address on both chains. [H: p2, p3, p10]
2. **It is a plain, permissionless warp route.** No fee (quote `[0, amount, 0]`), no gas payment (`quoteGasPayment` is 0), no minimum or maximum in code, no caller allowlist in the verified source. `msg.value` must be exactly 0: the Mailbox forwards it to a `MerkleTreeHook` that reverts on any value. I confirmed this by an `eth_call` simulation with injected state: value 0 returns a message id, value 1 wei reverts with "MerkleTreeHook: no value expected". [H: p46, source read p58]
3. **The delivery leg is fast and has shown no loss.** 253 Base-to-XO messages paired by Hyperlane message id: median 14 s, p90 24 s, max 27 s, 0 unmatched. 230 XO-to-Base messages: median 12 s, p90 14 s, max 18 s, 0 unmatched. Value conservation: Base escrow minus XO USDC.e supply is $0.96 on $342k. [H: p33, p55, p24]
4. **The XO app does not use the raw route.** All 72 sampled deposit transactions and all 22 sampled withdrawal transactions go through one unverified executor contract (`0x5D1d...9Ba9`), submitted by 4 relayer EOAs per chain, with the user paying no gas. Deposits mint to a per-user "deposit account" (a 217-byte proxy at the same address on both chains) and a second XO transaction sweeps the money into the user's Kernel account about 10 s later. A raw route transfer mints straight to the Kernel account instead. Whether the XO orderbook credits a direct mint is expected but untested. [H: p41-p54]
5. **Withdrawal has no verified third-party path.** The paymaster's own `checkPolicy` view says the route's `transferRemote` is "Contract/selector not allowed", so a UserOp calling it would not be sponsored, and PayBox cannot propose chain-3223 transactions. [H: p45]
6. **Governance is the real risk, not mechanics.** One externally owned key (`0xC0c8...4ca06`) owns the ProxyAdmin of both routes and is the USDC.e blacklister on XO, and can upgrade the router that escrows $342k. Messages are verified by a 2-of-3 validator multisig. [H: p25, p56]

## 1. Method, limits and disclosures

Scripts: `lib.py` (pure-Python keccak256 validated against `keccak256('') = c5d2...a470` and two selectors, fixed User-Agent `insurance-markets-research/0.1`, 0.3 s gap per host, hard cap 150 per host, backoff on 429/5xx, read-only JSON-RPC method allowlist) and `p1` to `p60`. Selectors and checksummed addresses were cross-checked against Foundry `cast` (offline use only). Every script was grepped for `@`, the user's name and home path before saving; none matched. Third-party sample account addresses are not hard-coded in the saved scripts (p48 writes them to a local data file that is not in the repo).

Requests per host (from `lib.py`'s counter, which includes retries): `mainnet.base.org` 135; `base.gateway.tenderly.co` 150 (cap reached exactly); `rpc-mainnet-2.xo.market` 149; `explorer-mainnet.xo.market` 147; `base.drpc.org` 128; `sourcify.dev` 11; `api.4byte.sourcify.dev` 3; `base-rpc.publicnode.com` 8; `base.blockscout.com` 3; one to four each on `1rpc.io`, `base-mainnet.public.blastapi.io`, `api.routescan.io`, `base-pokt.nodies.app`, `endpoints.omniatech.io`, `base.rpc.subquery.network`, `base.lava.build`, `base.meowrpc.com`, `developer.paybox.sh`. GitHub was reached with `gh api` (about 8 file reads and 3 code searches); those calls carry the local `gh` login, which GitHub can see (explicitly allowed by the task, disclosed here). Four queries went to the `xo-docs` MCP (terms of service, a deposit keyword search, and two OpenAPI searches, one of which dumped the whole spec).

Terms check: I read `/legal/terms-of-service` through the `xo-docs` MCP before probing. The only automation text is "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system" and a bar on harvesting data "for unauthorized purposes". All XO traffic here was GET or read-only JSON-RPC, 0.3 s or more apart, about 300 requests to XO hosts in total.

Judgement calls and incidents the user should know about:

- **Unkeyed XO RPC.** The docs say `rpc-mainnet-2.xo.market` needs a private `api_key`. It answered `eth_chainId` and then every read I sent without one (HTTP 200). I used it only for `eth_call`, `eth_getLogs`, `eth_getCode`, `eth_getStorageAt`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_blockNumber` (all on the allowed list), stopped at 149 requests, and never searched for a key. The plugin must not rely on this host being open.
- **Explorer proxy module.** The explorer's etherscan-style `module=proxy` returned "Unknown module", so I did not use any JSON-RPC proxy on the explorer.
- **Wasted requests.** `p20` had a bug: the explorer ignores the `page` parameter, so my loop fetched the same 1,000 rows 30 times per event type (about 120 identical GETs, spaced 0.3 s or more, before I noticed). It burned most of that host's cap. The saved script is the defective one; do not reuse it. `p23` hit XO RPC's 100,000-block range limit on its first call.
- **State-override simulation.** `p46` sends `eth_call` with a state override (synthetic sender, injected USDC balance and allowance) to `mainnet.base.org`. It is a local simulation; nothing was sent to the chain.
- **Hosts that said no, and I stopped:** `base.blockscout.com` (Cloudflare challenge, 403, 3 requests), `base-rpc.publicnode.com` for any non-latest range ("Archive requests require a personal token", 403), `api.routescan.io` ("chain not supported"), `mainnet.base.org` for `eth_getLogs` (429 "request limit reached" every time), `base.lava.build` (410 discontinued), `endpoints.omniatech.io` (521), `base.meowrpc.com` (`eth_getLogs` unsupported). `base.drpc.org` free tier answered transaction and code reads but rejected every historical log query I made with "ranges over 10000 blocks are not supported on free plan" (even 1,000-block ranges that were weeks old). The Tenderly public gateway allows log ranges of 1,000 blocks, which set the size of my samples (section 6).
- **Explorer logs are incomplete.** See section 6.3; this is the most important data-quality finding.

## 2. The pairing, proved from both ends

### 2.1 Where the router came from

- Phase 0 [03]: derived from the `sender` of Hyperlane `Process` events on the XO route (M).
- Hyperlane registry: **NOT FOUND (searched: `hyperlane-xyz/hyperlane-registry` at commit `cd1b8032`, 2026-10-16: `deployments/warp_routes/` directory listing, `warpRouteConfigs.yaml` grepped for the router, the XO route and USDC.e addresses and for `xomarket`; `chains/` listing of 351 chains, `chains/metadata.yaml` for `chainId`/`domainId` 3223).** The `warp_routes/XO` folder holds only `logo.png`. [H: `registry_search.sh`]
- GitHub code search for the router address: 3 hits, none from XO. `DefiLlama/DefiLlama-Adapters` `registries/sumTokens/data2.js` lists the router as owner of Base USDC under the key `xo-bridge` ("Counts the tokens locked in the XO Bridge contracts."). `Dedaub/monitoring-cli` (a third-party Hyperlane reference dated 2026-09-29) lists it as an active route "not in the registry" whose `token()` is Base USDC and whose Mailbox is "independent". Both are third-party (M), and both agree with my on-chain reads. The XO collateral address appears in `DefiLlama/dimension-adapters` `dexs/xo-market/index.ts`.
- Base explorers: `base.blockscout.com` blocked by a Cloudflare challenge. Source verification instead comes from Sourcify (section 3).

### 2.2 The two-sided proof (all H)

| Read | Result | Script |
|---|---|---|
| Base router `eth_getCode` | 2,882 bytes, codehash `0x536a9c24...bcb6d` (OZ transparent proxy) | p1 |
| XO route `eth_getCode` | 2,882 bytes, **identical codehash** | p10 |
| Base router `token()` and `wrappedToken()` | `0x833589fC...A02913` (Circle USDC) | p2 |
| XO route `token()` and `wrappedToken()` | `0x80c12230...29ab0c` (USDC.e) | p10 |
| Base router `localDomain()` | `0x2105` = 8453 | p2 |
| XO route `localDomain()` | `0xc97` = 3223 | p10 |
| Base router `domains()` | `[3223]` (one remote domain) | p2 |
| XO route `domains()` | `[8453]` | p10 |
| **Base `routers(3223)`** | `0x9090463546d725f6ece5d1a4b27beb929d5d1983` (the XO route) | p3 |
| **XO `routers(8453)`** | `0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f` (the Base router) | p10 |
| Base router `mailbox()` / XO route `mailbox()` | both `0xfDd96df1b2D4354dbB1070815819DB47469Ca470` | p2, p10 |
| Router `interchainSecurityModule()` on both | both `0xb429F39836eC9BD6b0fEDD999Bf49991592BB8Ff`, same 278-byte code on both chains | p2, p10, p25 |
| Mailbox `defaultHook()` and `requiredHook()` on both | both `0xf9a84A5e63e7335D44E132775B1244462e08E449` (`hookType()` 3 = Merkle tree on both) | p3, p4, p19, last check |
| Base escrow vs XO supply | 342,162.140419 USDC vs 342,161.179605 USDC.e | p24 |

One more bit of evidence on identity: 253 messages sent by this router on Base arrive as `Process` events at the XO Mailbox with matching message ids (section 6), and the XO route mints USDC.e on arrival.

## 3. Contract anatomy and trust

### 3.1 Router (Base) [H unless marked]

- Proxy `0x54716A53...cDF5F`, implementation `0x5b3F32417d651d47ebAEb079e8cf28B479b0926a` (EIP-1967 slot read). **Verified source: Sourcify `exact_match` for creation and runtime, verified 2026-06-20; `contracts/token/HypERC20Collateral.sol`, solc 0.8.22; `PACKAGE_VERSION()` "11.1.0".** [p26-p28]
- Constructor `(address erc20, uint256 _scaleNumerator, uint256 _scaleDenominator, address _mailbox)`; `scaleNumerator()` and `scaleDenominator()` both 1 on both chains, so the message amount equals the USDC amount (6 decimals both sides).
- `hook()` is 0 (the Mailbox default hook is used), `feeHook()`, `feeRecipient()`, `feeToken()` all 0. `destinationGas(3223)` = 0x109a0 = 68,000 gas (same value for the XO route to 8453).
- `transferRemote(uint32,bytes32,uint256) payable returns (bytes32)` is the `TokenRouter` default: `_calculateFeesAndCharge` pulls exactly `_amount` USDC with `safeTransferFrom(msg.sender, router, amount)`, builds a `TokenMessage(recipient, scaledAmount)`, emits `SentTransferRemote`, and calls `mailbox.dispatch{value: msg.value}`. There is no `msg.sender` check, no limit, no pause in this path. [p58 excerpt]
- Receiving side (`_handle`): `recipient.bytes32ToAddress()` where `bytes32ToAddress` requires `uint256(_buf) <= type(uint160).max` ("TypeCasts: bytes32ToAddress overflow"). The XO route has the identical function.
- Owner-only extras in the same ABI (`MovableCollateralRouter`): `addBridge`, `removeBridge`, `addRebalancer`, `rebalance(uint32,uint256,address) payable`, `setRecipient`, `approveTokenForBridge`, `enrollRemoteRouter(s)`, `setHook`, `setInterchainSecurityModule`, `setFeeHook`, `setFeeRecipient`, `setDestinationGas`. A fee or a rebalance can therefore be switched on by the owner at any time.

### 3.2 Mailbox, hook, ISM [H]

- Mailbox proxy `0xfDd96df1...Ca470` on both chains (same address, 2,882-byte proxy), implementation on Base `0xd58489d491e4B2F6872e3c0Cc7b88dd479B0b159`, Sourcify `exact_match` (2026-02-12), `PACKAGE_VERSION` "10.1.5". This is XO's own Mailbox, not Hyperlane's shared one. Base `nonce()` = 9,655 and XO `nonce()` = 8,825 at the time of reading.
- `Mailbox.dispatch` computes `requiredValue = requiredHook.quoteDispatch(...)`, calls `requiredHook.postDispatch{value: requiredValue}` and then `hook.postDispatch{value: msg.value - requiredValue}`. Both hooks are the same `MerkleTreeHook` (Sourcify `exact_match`), whose `_postDispatch` begins `require(msg.value == 0, "MerkleTreeHook: no value expected")` and whose `_quoteDispatch` returns 0. So the quote is 0 and any positive `msg.value` reverts. There is no IGP, so the relayer gas is paid by XO, which matches the 4 relayer wallets seen paying gas.
- ISM `0xb429...B8Ff`: a Hyperlane MetaProxy clone (54-byte prefix, logic `0xACC249b2de5792C8dEAB397Eaf7c947EA37095e0`, 4,494 bytes, not on Sourcify). Metadata decoded from the code: **threshold 2, three validators `0xafBd7650D0A47621e66dC005da466395CFc8B889`, `0x3D5dAEFB696DEd2e12847B5341Ea66eD77CaC7d4`, `0xA6c998F0DB2b56d7a63FAF30a9B677C8B9b6faab`**. `moduleType()` returns 4 (merkle-root multisig in Hyperlane's enum, from memory: M). [p56]

### 3.3 Who can change what [H]

| Power | Holder | Evidence |
|---|---|---|
| Upgrade the Base router implementation (ProxyAdmin `0x980D5952...3fc06`) | `owner()` = `0xC0c87622761d6c606851662708E7C7547B4bca06`, **no code (an externally owned key)** | p4, p25 |
| Upgrade the XO route (ProxyAdmin `0x354FE196...40aDa`) | the same `0xC0c8...4ca06` | p25 |
| Router owner functions and Mailbox owner on Base | `0x9dC83f5947E5F86D9726D6484195F9DC4FdfC5D6`, a 171-byte proxy with `getThreshold()` = 2 (Safe-style) | p4, p25 |
| Router, Mailbox, USDC.e owner and pauser on XO | `0xf08239F9575B30133Ee79a12df5b22238b554697`, 171-byte proxy, `getThreshold()` = 2 | p10, p24, p25 |
| Blacklist any address on XO USDC.e | `blacklister()` = `0xC0c8...4ca06` (the same key) | p24 |
| Validator set / ISM replacement | Each router's `setInterchainSecurityModule` is owner-only (source); the Mailbox default ISM is presumably owner-only too (not read) | p3, p10, p58 (M) |

Meaning: whoever holds the single `0xC0c8...` key can replace the router code that escrows the Base USDC, and whoever controls 2 of the 3 validators plus a relayer can forge deliveries. These are XO-controlled addresses (the same keys own the XO-side token). They are trust assumptions, not bugs. [M on the inference that XO controls them; H on the on-chain facts]

### 3.4 Tokens

| | Circle USDC on Base | XO USDC.e on chain 3223 |
|---|---|---|
| Address | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `0x80c12230ce677e6f304027a14780Edd2A829ab0c` |
| Name / symbol / decimals / version | USD Coin / USDC / 6 / 2 | Bridged USDC (XO) / USDC.e / 6 / 2 |
| Code | proxy (legacy admin slot) to `0x2Ce6311ddAE708829bc0784C967b7d77D19FD779`, FiatTokenV2_2, Sourcify `exact_match` (2024-08-08) | proxy (legacy slot) to `0xcDF9C40E0D0f48208b5275ff8E0FD2e70AA71e72`, FiatTokenV2_2 per the XO explorer (partially verified) |
| Proxy admin | `0x4fc7850364958d97B4d3f5A08f79db2493f8cA44` | `0xE10eB3b21F67b4E3EE606e69ac9d342F66cC177e` |
| owner | `0x3ABd6f64A422225E61E435baE41db12096106df7` | `0xf08239F9...4697` (XO Safe) |
| masterMinter / pauser / blacklister | `0x2230393E...52e1` / `0xD3571B3b...07b4` / `0x1f2e3A64...E277` | `0x6cB43F31...54bF` / `0xf08239F9...4697` / `0xC0c87622...ca06` (EOA) |
| rescuer | zero address | zero address |
| `paused()` | false | false |
| Supply read | 4,320,730,048,475,708 raw (about 4.32B) | 342,161,179,605 raw |
| Router status | router and Mailbox not blacklisted | route is a minter (`isMinter` true), `minterAllowance` 9999999999999998904052798093 raw (about 1e22 USDC.e, effectively unlimited), not blacklisted |

Powers that matter for the plugin (FiatToken source read on Sourcify): the blacklister can block any address from sending or receiving; the pauser can halt all transfers and mints; `mint` requires `_to != 0`, `_amount > 0` and `notBlacklisted(_to)`. Circle can therefore freeze USDC held in the Base router (every deposit and every withdrawal release would then revert), and XO's blacklister can make any XO-side recipient unmintable. Note: Sourcify's metadata for the Circle implementation embeds a Circle developer's local file path; I did not reproduce it.

## 4. The call sequence from a Base EVM wallet (the raw route)

Preconditions: the PayBox EVM wallet (the owner EOA) holds at least `amount` USDC and a little ETH on Base; `K` is the user's XO smart account address on chain 3223.

1. **Approve.** Target `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, `value` 0, calldata `approve(address,uint256)` with spender = router `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` and amount = the exact bridge amount in 6-decimal atomic units. The router pulls exactly `amount` (fee is 0), so an exact allowance is enough and nothing is left over. Circle USDC has no zero-first requirement.
2. **Transfer remote.** Target the router, `value` **"0"**, calldata `transferRemote(uint32,bytes32,uint256)` with destination **3223**, recipient `bytes32` = `K` **left-padded** with 12 zero bytes, and the same amount. Selector `0x81b4e8b4`.

Example with a synthetic recipient `0x3333...3333` and 5 USDC (my encoder, byte-identical to `cast calldata`):

```
approve        0x095ea7b3
               00000000000000000000000054716a535c3b5616e3f0d4d5005fc4bb660cdf5f
               00000000000000000000000000000000000000000000000000000000004c4b40
transferRemote 0x81b4e8b4
               0000000000000000000000000000000000000000000000000000000000000c97
               0000000000000000000000003333333333333333333333333333333333333333
               00000000000000000000000000000000000000000000000000000000004c4b40
```

Proof of the sequence: the `eth_call` simulation in p46 uses a synthetic sender with an injected USDC balance and an injected allowance of 5 USDC to the router, and `transferRemote(3223, recipient, 5000000)` returned a message id (`0x8990a53a...ce93`) with `value` 0. The override slots were validated first (storage slot 9 for the router's USDC balance matched `balanceOf` exactly, and `allowance` read back the injected value). [H]

Fees and limits (all H):

| Item | Value |
|---|---|
| Hyperlane gas payment | 0 (`quoteGasPayment(3223)` = 0; Mailbox hooks require value 0) |
| Warp fee | 0 (`feeHook`, `feeRecipient`, `feeToken` all zero; `quoteTransferRemote` returns `[(0x0, 0), (USDC, amount), (USDC, 0)]` for amounts 1 raw, 1, 100, 10,000 and 30,000 USDC) |
| Minimum | none on Base; the XO side needs `amount > 0` (FiatToken mint). Smallest observed deposit in my windows: 0.000029 USDC; Phase 0 [03 V] saw 0.00001 |
| Maximum | none in code. Largest in my 253 samples: $999.90; Phase 0 saw $30,000 |
| Base gas | not measured for the raw path (`eth_estimateGas` is not on the allowed list). The relayed executor transactions used 372,875 to 540,658 gas (22 receipts, median 389,621), at an effective price of 6,000,000 wei (0.006 gwei), about 0.0000023 ETH per transaction. The raw call should be cheaper, so treat that as an upper bound (M) |
| Gas payer | the PayBox wallet pays Base gas in ETH (the developer guide: "The wallet still needs native currency for network fees.") |

### 4.1 What is irrecoverable

The router has no refund path, no cancel and no way to return a dispatched message's funds to the sender. Hyperlane `process` is permissionless and idempotent, so a message that fails on XO stays retryable until the cause is removed, but the money is not returned to the sender. Cases (source-derived, M for the XO-side revert behaviour because I cannot simulate `process`; H for the code text):

| Mistake | What happens | Recoverable? |
|---|---|---|
| Recipient is a valid address that is not `K` (typo, wrong account) | USDC.e is minted to that address | Only if its owner cooperates |
| Recipient is the owner EOA | USDC.e is minted to the EOA on chain 3223 | In practice no: moving it needs an XO-chain transaction with native XO gas, and PayBox did not list chain 3223 (Phase 0 [06]) |
| Recipient bytes32 is not left-padded (any of the upper 12 bytes non-zero, e.g. a right-padded address) | Base accepts and escrows the USDC; the XO `handle` reverts on `bytes32ToAddress overflow`; the message can never be delivered | Not without XO changing contracts |
| Recipient is 0x0 | Base accepts; XO mint reverts ("FiatToken: mint to the zero address") | Same as above |
| Recipient blacklisted on XO USDC.e | Mint reverts until un-blacklisted, then anyone can deliver | Only if XO un-blacklists |
| Amount 0 | Base accepts; XO mint reverts (no money at stake) | n/a |
| `value` > 0 | The Base transaction reverts (H, simulated) | Nothing lost except gas |
| Allowance below amount | The Base transaction reverts | Nothing lost |

Hard rules for the plugin: pin K from a verified source, refuse the zero address and the owner EOA, build the recipient with a left-pad helper and re-decode the calldata before returning it, never retry `transferRemote` after an ambiguous result (check the balance and the Mailbox first).

## 5. ABI fragments proved on-chain

All of these returned the values shown above, from at least one chain. Items marked (sim) were exercised by `eth_call` simulation, items marked (src) only by verified source.

```json
[
 {"type":"function","name":"token","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"wrappedToken","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"mailbox","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"localDomain","stateMutability":"view","inputs":[],"outputs":[{"type":"uint32"}]},
 {"type":"function","name":"domains","stateMutability":"view","inputs":[],"outputs":[{"type":"uint32[]"}]},
 {"type":"function","name":"routers","stateMutability":"view","inputs":[{"name":"_domain","type":"uint32"}],"outputs":[{"type":"bytes32"}]},
 {"type":"function","name":"destinationGas","stateMutability":"view","inputs":[{"name":"destinationDomain","type":"uint32"}],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"quoteGasPayment","stateMutability":"view","inputs":[{"name":"_destinationDomain","type":"uint32"}],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"quoteTransferRemote","stateMutability":"view","inputs":[{"name":"_destination","type":"uint32"},{"name":"_recipient","type":"bytes32"},{"name":"_amount","type":"uint256"}],"outputs":[{"type":"tuple[]","components":[{"name":"token","type":"address"},{"name":"amount","type":"uint256"}]}]},
 {"type":"function","name":"transferRemote","stateMutability":"payable","inputs":[{"name":"_destination","type":"uint32"},{"name":"_recipient","type":"bytes32"},{"name":"_amount","type":"uint256"}],"outputs":[{"name":"messageId","type":"bytes32"}]},
 {"type":"function","name":"owner","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"interchainSecurityModule","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"hook","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"feeHook","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"feeRecipient","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"feeToken","stateMutability":"view","inputs":[],"outputs":[{"type":"address"}]},
 {"type":"function","name":"scaleNumerator","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"scaleDenominator","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},
 {"type":"function","name":"PACKAGE_VERSION","stateMutability":"view","inputs":[],"outputs":[{"type":"string"}]},
 {"type":"event","name":"SentTransferRemote","inputs":[{"name":"destination","type":"uint32","indexed":true},{"name":"recipient","type":"bytes32","indexed":true},{"name":"amountOrId","type":"uint256","indexed":false}]},
 {"type":"event","name":"ReceivedTransferRemote","inputs":[{"name":"origin","type":"uint32","indexed":true},{"name":"recipient","type":"bytes32","indexed":true},{"name":"amountOrId","type":"uint256","indexed":false}]}
]
```

`transferRemote` is (sim) on Base and (src, plus 22 relayed transactions) on XO. `quoteTransferRemote` returns an array of three `Quote{token, amount}` structs (native gas, token amount, external fee); the `scale()` and `paused()` getters do not exist on this version (calls reverted).

Mailbox (both chains; all H): `nonce() view returns (uint32)`, `latestDispatchedId() view returns (bytes32)`, `delivered(bytes32) view returns (bool)`, `localDomain()`, `defaultHook()`, `requiredHook()`, `defaultIsm()`; events `Dispatch(address indexed sender, uint32 indexed destination, bytes32 indexed recipient, bytes message)` (topic `0x769f711d...c814`), `DispatchId(bytes32 indexed messageId)` (`0x788dbc1b...353a`), `Process(uint32 indexed origin, bytes32 indexed sender, address indexed recipient)` (`0x0d381c2a...`), `ProcessId(bytes32 indexed messageId)` (`0x1cae38cd...73a9`). The route events have topics `SentTransferRemote` `0xd229aacb...` and `ReceivedTransferRemote` `0xba20947a...`.

USDC (Base): `approve(address,uint256)`, `allowance(address,address)`, `balanceOf(address)`, `decimals()`.

XO paymaster `0x2353B23D8F329fD3cEC0d21652F14208248A439d`: `checkPolicy(address account, address target, bytes4 selector) view returns (bool, string)`.

## 6. Latency and failure statistics

### 6.1 Method

Pairing key: the Hyperlane message id (`DispatchId` on the origin Mailbox, `ProcessId` on the destination Mailbox). Base logs come from the Tenderly public gateway in 1,000-block chunks (its limit), with Base block time taken as `1686789347 + 2 * block` seconds. I validated that formula: at block 52,782,009 it gave 1,792,353,365, exactly `Multicall3.getCurrentBlockTimestamp()` at that block (p11). XO event times come from the XO explorer's `getLogs` `timeStamp` field. Delay = destination block time minus origin block time, so it includes block quantisation (2 s on Base).

Two windows because of the 150-request caps:

- **Window A (recent):** Base blocks 52,722,322 to 52,782,321, 2026-10-17 10:46 to 2026-10-18 20:06 UTC. 29 deposits, 18 withdrawals.
- **Window B (peak traffic):** Base blocks 49,938,126 to 50,013,125, 2026-08-13 23:59 to 2026-08-15 17:39 UTC (traffic that month was about 173 messages per day). 224 deposits, 212 withdrawals.

### 6.2 Results (p33, p55)

| Direction | n | min | p10 | median | mean | p90 | p95 | p99 | max | unmatched |
|---|---|---|---|---|---|---|---|---|---|---|
| Base to XO (deposits), pooled | 253 | 7 s | 11 | **14** | 16.3 | **24** | 25 | 26.5 | **27 s** | 0 |
| window A only | 29 | 10 | 10.8 | 14 | 16.6 | 24 | 24 | 24.7 | 25 | 0 |
| window B only | 224 | 7 | 11 | 14 | 16.3 | 25 | 25.8 | 26.8 | 27 | 0 |
| XO to Base (withdrawals), pooled | 230 | 6 | 9 | **12** | 11.4 | **14** | 15 | 16 | **18 s** | 0 |
| window A only | 18 | 8 | 10 | 12 | 11.7 | 13.3 | 14.1 | 14.8 | 15 | 0 |
| window B only | 212 | 6 | 9 | 11 | 11.4 | 14 | 15 | 16 | 18 | 0 |

100% of both directions were delivered within 30 s. No negative delays. One nonce-order inversion in window B (processing order differs from dispatch order once). Deposit sizes in the samples: median $4.70, max $999.90, sum $7,467. Delay did not depend on size in this range (no deposit at or above $1,000 in the windows). The windows are 3.6 and 1.7 days of 7 months of operation, so tails beyond 27 s may exist outside them; that is a sample limit, not a finding of none. [H for the data, M for any extrapolation]

End-to-end for the app route adds a relayer pickup and a sweep: in the one sample I could trace, the user's USDC arrived at the Base deposit account at 1792312225, the relayed Base transaction was mined 8 s later, the XO mint was at XO block 12,584,672 and the sweep to the Kernel account 7 XO blocks after that (about 10 s). That is one sample (M); the total is roughly 30 to 45 s.

### 6.3 Stuck and unmatched messages

- In the sampled windows: 0 unmatched deposits, 0 unmatched withdrawals.
- **Value conservation (strongest global check).** Base router USDC balance 342,162.140419 minus XO USDC.e `totalSupply` 342,161.179605 = **$0.960814**. Any deposit stuck in transit, or any unminted escrow, would show up here, so at most about $1 is in flight or unbacked net. (H for the arithmetic; M for the inference, because withdrawals in flight would offset deposits in flight and early test mints from other routes could do the same.)
- **A false alarm that matters for method.** Base Mailbox `nonce()` was 9,655 while the XO explorer's index held only 9,581 `ProcessId` events, a gap of 74, and the gap appeared in steps (0 on 2026-06-01, 21 by 06-08, 36 by 07-01, 65 by 08-20, 74 by 10-01 and unchanged since). I bisected the first step to a 2026-06-06 03:24 to 03:52 UTC burst (Base nonces 990 to 1019; amounts $1.04 to $3.13) and fetched the Base logs for it. **All 21 messages in that burst are `delivered() == true` on the XO Mailbox** (checked one by one with `eth_call`). So the explorer's log index is missing `ProcessId` rows; the messages were delivered. The other 53 of the 74 were not individually checked (budget), but the value bound above and Phase 0's route-level count (9,645 `ReceivedTransferRemote` events at an earlier time, against a Base nonce of 9,655 now) both point to the same conclusion: delivered, but not indexed. (H for the 21, M for the 53.) [p35-p40, p57]
- **Consequence for the build:** never use the explorer's `getLogs` to prove or disprove a delivery. Use `Mailbox.delivered(messageId)` against a node, or check the recipient's balance.
- Age of the oldest unmatched message: none found, so no age to report. The only open question is the 53 unchecked gap items, which would have to be at least 17 days old (the gap has been constant at 74 since the 2026-10-01 reading).
- Failure modes that did not occur in the samples: reverted `process` calls, validator downtime, relayer downtime. I cannot see failed relayer attempts on-chain.

## 7. The withdrawal path (XO to Base)

What the code does (H):

- XO route `transferRemote(8453, bytes32 recipient, amount)`: `HypFiatToken._transferFromSender` pulls the tokens with `transferFrom` and calls `burn`; so the sender must first `USDC.e.approve(route, amount)`. The Base side then releases USDC from the escrow to `recipient`. Destination is limited to Base (`domains()` = [8453]); the recipient can be any Base address (no allowlist in code). Fees 0, quote 0, `value` must be 0 (the XO hook is the same Merkle-tree type).
- Observed latency 12 s median, 18 s max (section 6).

Who can call it today:

- **The XO app.** 22 of 22 sampled withdrawal transactions are calls to the executor `0x5D1d6FA733bfba0EC7B143de0d7E8a4afa9F9Ba9`, selector `0x3a022aa7`, `value` 0, from 4 relayer EOAs (counts 9, 6, 5, 2); gas used 399,749 to 408,732 (the 4 receipts I pulled); the `gasPrice` field is 0 for 15 of 22 and 5 gwei for 7 of 22. The event order is executor events, `Transfer`, `Approval`, `Transfer`, `Burn`, `SentTransferRemote`, `Dispatch`. Selector `0x3a022aa7` is not in the public 4-byte database and the executor is unverified on both the XO explorer and Sourcify. [p41, p44, p42]
- **A Kernel UserOp from the user's account.** `PolicyPaymaster.checkPolicy(account, route, transferRemote)` returns `(false, "Contract/selector not allowed")`; `USDC.e.approve` returns `(true, "Globally allowed selector")` and `USDC.e.transfer` `(true, "Allowed selector on contract")`. `whitelistedContracts(route)` and `globallyAllowedSelectors(0x81b4e8b4)` are false. The paymaster is not paused, `dailyTxLimit` is 10,000 and its deposit is 2,599.58 XO. So a withdrawal UserOp would need the account to hold native XO for gas, or XO would have to allowlist the selector. [H: p45]
- **PayBox proposals.** Not possible on chain 3223 (Phase 0 [06]: chain absent from the catalog). Only a signed UserOp through XO's bundler would work, and I did not touch the bundler.

NOT ESTABLISHABLE WITHOUT XO: the executor's interface for third-party accounts, whether a smart account with a PayBox owner can use it, and whether XO would allowlist `transferRemote` for sponsorship. Verdict for withdrawal: no verified third-party path today; the plugin should return "withdraw in the XO app" with the safe fallback (`USDC.e.transfer` to the owner EOA is sponsored, but the money is then stuck on a chain PayBox cannot sign for).

## 8. Circle USDC on Base and the app route versus the raw route

Circle USDC: section 3.4. In short: FiatTokenV2_2 behind a proxy whose admin, owner, pauser, blacklister and master minter are five separate addresses; it is not paused; neither the router nor the Mailbox is blacklisted.

### 8.1 How the XO app route differs [H: p41-p54]

| | Raw warp route (this note) | XO app deposit |
|---|---|---|
| Entry on Base | The user's wallet calls USDC `approve` then router `transferRemote` | The user sends USDC to a per-user deposit address `D`; a relayer EOA then calls the executor |
| Who pays Base gas | The user | XO's relayer (4 EOAs holding 0.019 to 0.060 ETH each) |
| `tx.to` and selector | Router, `0x81b4e8b4` | Executor `0x5D1d...9Ba9`, `0x3a022aa7` (72 of 72 sampled; 0 direct router calls) |
| Mint recipient on XO | The recipient you choose, e.g. the Kernel account `K` | `D` itself (the deposit address exists at the same address on XO) |
| XO-side follow-up | None | A second transaction sweeps the full amount from `D` to the user's Kernel account about 7 XO blocks later; seen once: 119.987299 USDC minted and 119.987299 swept, so no fee taken in that sample |
| Failure surface | The user must get recipient encoding right | XO's pipeline (screening, the "Tainted" state in the docs) is in the loop |

Details: `D` is a 217-byte proxy (codehash prefix `0xbab6360a...`) whose code `delegatecall`s into the executor (the executor address is an immutable in the proxy code; by the disassembly in `p48` and `disasm.py`, selector `0x8abf6077` returns it, which I did not call: M). The same bytecode sits at the same address on Base and XO. USDC moves from `D` to the router in the relayed transaction (the `Approval` and `Transfer` events are emitted by `D`'s token calls). The Kernel account on the other side is an ordinary Kernel v0.3.1 account: a 61-byte ERC-1967 proxy that answers `eip712Domain()` with name "Kernel", version "0.3.1", chain 3223 and `verifyingContract` equal to itself (checked on the sweep target and on an active market creator's account). By contrast `D` reverts on `accountId()`, `rootValidator()` and `eip712Domain()`, so `D` is not a Kernel account. [p49-p53]

Why this matters: the docs say "Copy your deposit address ... The provider watches the address and credits your smart wallet". `D` is that deposit address, and the "provider" is XO's own relayer fleet. The per-user derivation of `D` from `K` and any API that returns it are NOT FOUND (docs searched: `/openapi`, `/guides`, `/documentation`, `/product/accounts` for "deposit"; only the UI is described). If XO exposed `D`, funding would be a single ERC-20 `transfer` proposal on Base; as it is, the only documented-by-chain path is the raw route.

Unknown: whether the XO orderbook credits a balance that arrives by a mint straight into `K` rather than through the sweep. Both end as ERC-20 balance increases of `K`, so I expect yes (M), but no one has shown it.

The raw route also bypasses XO's screening pipeline. XO's blacklister key can still freeze the minted USDC.e (section 3.4).

## 9. The PayBox side: two sequential Base proposals

Sources: `developer.paybox.sh/requirements.md` lines 342 to 398 and 414 to 444 (re-read this session), `src/paybox.ts` as recorded in note 04 section 5. [H]

Proposal 1 (approve) and 2 (transfer) share this envelope, one call each:

| Field | Value |
|---|---|
| `version` | `"1"` |
| `kind` | `"evm"` |
| `chain` | `"eip155:8453"` |
| `expiresAt` | whole-second UTC RFC3339, in the future and at most 300 s ahead (helper default 240 s) |
| `transaction.to` | proposal 1: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; proposal 2: `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` |
| `transaction.value` | `"0"` in both |
| `transaction.data` | proposal 1: the 68-byte `approve(router, amount)` calldata; proposal 2: the 100-byte `transferRemote(3223, bytes32(K), amount)` calldata |

Questions answered:

- **Is native value allowed in an EVM proposal?** Yes. The guide: "`value` is the native currency amount in wei (ETH on Base), not an ERC-20 amount", a decimal string. We need it to be exactly `"0"`; any positive value would revert at the Mailbox hook, and PayBox's simulation would show that revert. No problem with the schema.
- **No `from` field**, no `description`, no `label`, no gas fields, no batch (unknown fields are rejected). Approvers see raw call data; "It does not provide a decoded ERC-20 transfer, allowance or swap asset-change summary." A tampered recipient is invisible to a human reading the window.
- **Order and timing.** The second proposal must come after the first is confirmed: "If an additional allowance transaction is needed, propose it separately, wait for confirmation". Each expires in 5 minutes, so the plugin should be a "next missing step" tool: read `allowance(owner, router)` and `balanceOf(owner)` from a public Base RPC on every call, return the approve proposal if the allowance is short, the transfer proposal if not, and nothing if the allowance is spent and the XO balance has risen.
- **Sender.** The plugin does not learn which wallet PayBox will use (`wallet_id` is not sent); the agent must pass the owner address, and PayBox does not document verifying an EVM sender, so a wrong sender yields a wrong "next step" but not a wrong payment (the simulation of proposal 2 fails without the allowance).
- **Network allowlist.** The plugin needs one Base RPC host for reads (`mainnet.base.org` answered `eth_call` throughout; it rejects `eth_getLogs`) and XO's public API for the account address. Both fit in the 16-host limit.
- **Approval mode.** Proposals are approval-gated by PayBox in practice ("plugin money tools always pause for the user's approval" is documented for first-party plugins; unverified for Open Plugins under an autonomous grant, Phase 0 gate 8). Keep funding on an approval-gated grant; that matches the user's note that approval mode is fine.

## 10. Verified constants

| Name | Value | Chain | How verified | Conf. |
|---|---|---|---|---|
| Base warp router (proxy) | `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` | Base 8453 | code, `token()`, `routers(3223)`, source (p1-p3) | H |
| Router implementation | `0x5b3F32417d651d47ebAEb079e8cf28B479b0926a` (HypERC20Collateral 11.1.0) | Base | EIP-1967 slot + Sourcify exact match | H |
| Router ProxyAdmin / owner | `0x980D5952BfaB70cf260718cBA5c44072F0f3fc06` / `0xC0c87622761d6c606851662708E7C7547B4bca06` (EOA) | Base | `owner()`, code size 0 (p4) | H |
| Router and Mailbox owner | `0x9dC83f5947E5F86D9726D6484195F9DC4FdfC5D6` (threshold 2) | Base | `owner()`, `getThreshold()` (p4, p25) | H |
| XO warp route (proxy) | `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983` (EIP-55 form; Phase 0 wrote it with different casing) | XO 3223 | code, `routers(8453)`, explorer (p10) | H |
| XO route implementation | `0xdc4b86B0f3Abfc461a9A03a94B347D6F5DA8D052` (HypFiatToken 11.1.0, fully verified) | XO | slot + explorer (p7, p10) | H |
| XO route ProxyAdmin / owner | `0x354FE196bD71629cDC637d17a414dDF5C2040aDa` / `0xC0c8...4ca06` | XO | p25 | H |
| XO owner (route, Mailbox, USDC.e) | `0xf08239F9575B30133Ee79a12df5b22238b554697` (threshold 2) | XO | p10, p24, p25 | H |
| Hyperlane domain ids | Base 8453 (0x2105), XO 3223 (0xc97) | both | `localDomain()` on router and Mailbox | H |
| Mailbox | `0xfDd96df1b2D4354dbB1070815819DB47469Ca470` | both | `mailbox()` on both routers, code | H |
| Mailbox implementation (Base) | `0xd58489d491e4B2F6872e3c0Cc7b88dd479B0b159` (10.1.5) | Base | slot + Sourcify | H |
| Default and required hook | `0xf9a84A5e63e7335D44E132775B1244462e08E449` (Merkle tree) | both | `defaultHook()`, `hookType()` 3 | H |
| ISM | `0xb429F39836eC9BD6b0fEDD999Bf49991592BB8Ff`, 2 of 3 validators (listed in 3.2) | both | code decode (p56) | H |
| Circle USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, 6 decimals | Base | `decimals()`, `name()`, Sourcify | H |
| XO USDC.e | `0x80c12230ce677e6f304027a14780Edd2A829ab0c`, 6 decimals, "Bridged USDC (XO)" | XO | `decimals()`, `name()` (p24) | H |
| `transferRemote` selector | `0x81b4e8b4` | both | keccak (lib.py) and `cast sig` | H |
| `approve` selector | `0x095ea7b3` | both | `cast calldata` | H |
| Required `msg.value` | 0 | both | source + simulation (p46) | H on Base, M on XO |
| Warp fee / gas payment / scale | 0 / 0 / 1:1 | both | views (p3, p10) | H |
| Destination gas | 68,000 (0x109a0) | both | `destinationGas` | H |
| Escrow balance | 342,162.140419 USDC | Base | `balanceOf(router)` | H |
| USDC.e supply | 342,161.179605 | XO | `totalSupply()` | H |
| Base block time formula | `1686789347 + 2 * block` s | Base | matches Multicall3 at block 52,782,009 | H |
| Base mailbox nonce / XO mailbox nonce | 9,655 / 8,825 (about 19:55 UTC 2026-10-18) | both | `nonce()` | H |
| Executor | `0x5D1d6FA733bfba0EC7B143de0d7E8a4afa9F9Ba9`, 21,535 bytes, same code on both chains, unverified | both | getCode (p42) | H |
| XO PolicyPaymaster | `0x2353B23D8F329fD3cEC0d21652F14208248A439d` | XO | `checkPolicy` (p45) | H |
| Delivery delay, Base to XO | median 14 s, p90 24 s, max 27 s (n=253) | | p33, p55 | H |
| Delivery delay, XO to Base | median 12 s, p90 14 s, max 18 s (n=230) | | p33, p55 | H |

## 11. Corrections and additions to earlier notes

1. Phase 0 [03] section 3.2: the Base router was "derived ... unverified". Now verified (section 2); the contract and fee questions in [03] are answered: no fee, no minimum, no value.
2. [03]/[phase0] option F1 said "any required `msg.value`". The required value is exactly 0.
3. Phase 0 gate 6 residual "whether a provider deposit address can be fetched programmatically": still NOT FOUND, but the provider is identified as XO's own relayer fleet and the deposit address as an account `D` at the same address on both chains.
4. [03] "Withdrawals look service-mediated": confirmed and identified (executor), and the paymaster refusal is now read from the paymaster itself.
5. Explorer `getLogs` is not complete: 74 `ProcessId` rows missing against the node (21 individually proven delivered). Counts derived only from explorer logs in [03] and its verifier (inbound 9,645, outbound 8,821, mints) should be treated as lower bounds of explorer-indexed rows, not as delivery counts. The Phase 0 text for the XO route address has different letter casing than EIP-55; pin the lowercase form or the EIP-55 form above.

## 12. Gate verdict, assumptions for build, open items

**Gate 6, deposit leg: answered-go.** The route exists, is third-party callable, is fully specified (addresses, ABI, zero fees, `value` 0, delivery in under 30 s in 483 samples), and the whole flow is two proposals that PayBox's schema supports. Conditions that remain with the user and not with XO:

- a first live low-value test (for example $1) is the only way to see the XO orderbook credit the minted balance;
- `K` must exist and be known (Phase 0 gate 3);
- the user accepts the governance risk in section 3.3 and the fact that this is not XO's own deposit flow.

**Gate 6, withdrawal leg: partial.** Mechanism known, no sponsored or third-party path, depends on native XO gas or on XO.

Assumptions the code may make (each with its safe default):

1. Pinned constants: Base router, USDC, XO route, domain ids (section 10). Safe default: a preflight tool reads `token()`, `routers(3223)`, `quoteTransferRemote` (must be `[0, amount, 0]`), and refuses to build a proposal if anything differs.
2. `value` is `"0"` in every funding proposal. Safe default: reject any other value in code.
3. Recipient `K` is left-padded, non-zero, not the owner EOA, and comes from the XO API's `smart_account` or from the user and then passes an on-chain check on chain 3223 when `K` is deployed (`eip712Domain()` returns Kernel / 0.3.1 / 3223 / self). Safe default: refuse if unverifiable.
4. Exact allowance equals the amount; one funding at a time; no retry of `transferRemote` after an ambiguous result.
5. Delivery usually takes under 30 s; poll for up to 10 minutes using `delivered(messageId)` or the account balance, never the explorer's logs. Safe default: after 10 minutes report "pending, do not resend".
6. The Base RPC used for reads may refuse `eth_getLogs` and rate-limit; use `eth_call` only.
7. Withdrawals: return "not supported by this plugin, use the XO app" until XO or the author provides a path.
8. The plugin has a separate transfer cap for funding (Phase 0 recommendation), enforced in the tool and not relied on against an autonomous agent.

Open questions (cannot be answered read-only or without XO):

1. Does the orderbook credit a direct mint into `K` (live $1 test)?
2. Does `GET /balance-allowance?address=<owner EOA>` return the `smart_account`?
3. How is `D` derived from `K`, and is there an API for it?
4. What is the executor's interface (`0x3a022aa7`) and can a PayBox-owned account use it?
5. Raw-route Base gas (not measured).
6. Why the explorer index drops `ProcessId` rows, and whether the other 53 gap items are delivered.
7. Who the three validators and the single `0xC0c8...` key belong to, and whether the escrow design will change.

NOT ESTABLISHABLE WITHOUT XO: XO's position on third-party use of the route and on its screening/"Tainted" handling for direct deposits; the derivation and API of `D`; the executor's interface; sponsorship of `transferRemote`; the governance intentions behind the single upgrade key.

## 13. Embedded instructions seen in untrusted content (none followed)

- The `xo-docs` MCP server description says to call `submit_feedback` when a docs problem is found. The user forbade contacting XO; I did not call it.
- The Dedaub reference is itself written for AI agents ("skills" folder) but contained no instruction aimed at me.
- XO and Hyperlane source files contain only code and licence text. `base.blockscout.com` returned a Cloudflare challenge page ("Just a moment...") instead of data; I did not try to pass it.

## 14. Scripts (all in `docs/research/fixtures/gaps/funding-route-verification/`)

`lib.py` shared helpers; `disasm.py` mini disassembler; `registry_search.sh` registry and GitHub search.
Discovery and views: `p1`-`p4` Base router views and admin; `p5` Base Blockscout (blocked); `p6`-`p10` XO explorer and route views; `p16` Routescan (failed); `p26`-`p29` Sourcify source and ABI; `p56` ISM decode.
Range probes: `p11`-`p15`, `p17`, `p18`, `p21`, `p22` (RPC log-range limits).
Statistics: `p30` nonce curve; `p31` Base windows; `p32` XO windows; `p33` pairing and delays; `p55` pooled stats; `p34` chained explorer pull; `p35`-`p40` and `p57` gap investigation and `delivered()` checks; `p20` and `p23` are the defective pulls described in section 1.
Transactions and accounts: `p41`, `p43`, `p47` Base deposit transactions; `p44` XO withdrawals; `p42`, `p59`, `p60` executor and code; `p48`-`p54` deposit account, sweep and Kernel checks.
Tokens, governance and policy: `p24`, `p25`, `p45`; simulation `p46`; source excerpts `p58`.

## Verification (2026-10-19)

Adversarial re-derivation by a second agent. Method: my own Python 3 stdlib JSON-RPC client (fixed User-Agent `insurance-markets-research/0.1`, 0.3 s gap per host, read-only method allowlist, per-host counter) plus Foundry `cast` used offline only (ABI encoding, keccak, EIP-55). I did not run or import any of the researcher's scripts. My scripts live in the session scratchpad (`.../scratchpad/funding-route-verification-verify/`, files `vlib.py`, `v1.py` to `v13.py`); per the task they are not copied into the repo. Requests I made: `mainnet.base.org` 98, `rpc-mainnet-2.xo.market` 127, `base.gateway.tenderly.co` 140, `explorer-mainnet.xo.market` about 85 (explorer REST and etherscan-style GET), `sourcify.dev` about 17, `developers.circle.com` 2, `developer.paybox.sh` 1, GitHub via `gh api` about 10, xo-docs MCP read queries 4 (no `submit_feedback`). No host asked for a key or a contact address. Overall reliability of the researcher's notes: **high**; one secondary finding is refuted (A), the rest re-derived.

### Refuted or corrected

**A. REFUTED: "The XO explorer getLogs index misses ProcessId rows; 74 apparent undelivered messages" (sections 6.3 and 11 item 5, the matching entries in the summary and in open question 6).** Evidence (H, own code, 2026-10-18 about 21:00 to 22:30 UTC):
- I pulled `Mailbox` `ProcessId` logs from the explorer over XO blocks 0 to 12,610,233 by adaptive range splitting (any answer of 1,000 rows is split in half until no answer is capped; 32 requests). Result: **9,655 rows, 9,655 unique message ids = Base `nonce()` 9,655**. The same for `DispatchId`: **8,825 unique ids = XO `nonce()` 8,825** (30 requests). There is no gap in either direction.
- The cited 2026-06-06 burst: I pulled Base `DispatchId` for blocks 46,963,000 to 46,964,999 (41 messages, blocks 46,963,228 to 46,964,301). **All 41 are `delivered() == true` on the XO Mailbox and all 41 are present in the explorer's ProcessId rows** (42 explorer rows in XO blocks 6,159,737 to 6,161,302, one neighbour extra).
- In my three latency windows the explorer matched 100% (133/133, 8/8, 16/16 deposits; 121/121, 5/5, 8/8 withdrawals).
Conclusion: the 9,581 count and the 74-message gap are **not reproduced**. The most likely cause is the first-pass pull (`p20` was admitted to be defective and `p34` resumed by block cursor, stopping after 11 calls); a later explorer re-index between the two readings (about an hour apart) cannot be excluded. Which of the two is not established. Corrected text: "As of 2026-10-18 evening the explorer's ProcessId and DispatchId indexes are complete (counts equal the Mailbox nonces on both chains). Every Base-dispatched message has a ProcessId on XO; the 53 'unchecked' gap messages do not exist as a separate population." Id-level identity was verified for 41 + 157 + 134 sampled messages; the all-9,655 conclusion rests on count parity (M-H). Consequences: (1) the advice "confirm delivery with `Mailbox.delivered(messageId)` or the balance" is still the right design (it needs no indexer) but the stated reason, an incomplete explorer, is wrong; (2) Phase 0's 9,645 inbound / 8,821 outbound counts are earlier snapshots, not lower bounds from a lossy index; (3) open question 6 is closed. Effect on the gate: none (it removes the only unexplained anomaly; no stuck message found).

**B. UPGRADED M to H: the XO-side `msg.value` requirement.** Notes mark it "M, source parity". I simulated on XO (`eth_call`, synthetic sender 0x1111..., injected USDC.e balance and allowance, slots validated by read-back): `transferRemote(8453, left-padded recipient, 5 USDC)` with value 0 returns a message id (0xd1083e49...9c9e); with value 1 wei it reverts "MerkleTreeHook: no value expected". XO `quoteTransferRemote` returns `[0, 5000000, 0]`. So value 0 is required on both chains (H). The withdrawal call is directly callable by a funded account on XO; only the paymaster and PayBox's chain list block it.

**C. UPGRADED M to H: XO-side failure modes for a bad recipient (section 4.1).** I simulated the delivery leg: `eth_call` of `handle(uint32,bytes32,bytes)` (selector 0x56d5d475) on the XO route with `from` = the Mailbox and origin 8453, sender = the Base router, 64-byte body (recipient, amount). Results: left-padded recipient and 5 USDC returns `0x` (success); right-padded recipient reverts "TypeCasts: bytes32ToAddress overflow"; a recipient with a non-zero byte in the upper 12 bytes reverts the same; zero recipient reverts "FiatToken: mint to the zero address"; amount 0 reverts "FiatToken: mint amount not greater than 0"; wrong enrolled sender reverts "Enrolled router does not match sender"; a caller other than the Mailbox reverts "MailboxClient: sender not mailbox". I also confirmed on Base that a right-padded recipient is accepted by `transferRemote` (returns a message id) and that missing allowance reverts "ERC20: transfer amount exceeds allowance". The "no refund path" half remains source-derived (no refund function in the Sourcify source of the router), so the overall "unrecoverable without XO" stays M-H.

**D. Minor correction: sweep delay.** Notes (6.2, 8.1): the sweep came "7 XO blocks after the mint (about 10 s)" from one traced deposit. My own trace of the latest delivery (explorer REST): mint to the deposit account at XO block 12,608,574 (19:43:54 UTC), sweep to a Kernel account at 12,608,585 (19:44:05 UTC): **11 blocks, 11 s**. So two samples give 7 to 11 blocks, 10 to 11 s (M, n=2). The "30 to 45 s end to end" estimate is untouched.

**E. Nuances, no change of verdict.**
- Circle USDC `totalSupply` reads 4,318,886,042,989,376 raw now against the notes' 4,320,730,048,475,708: a live value, not an error.
- The notes say the docs require an `api_key` for `rpc-mainnet-2.xo.market`. Confirmed (`/documentation/introduction` lines 39 to 43), but `/guides/smart-accounts` shows the same host without a key in a config example; the host answered all my reads without one (127 calls) and I did not look for a key.
- Latency: my pooled independent sample (157 deposits, 134 withdrawals) gives p90 25 s for deposits (notes pooled: 24) and median 11 s for withdrawals (notes pooled: 12). Window B alone in the notes is p90 25 and median 11, so these are sampling differences of one second, not disagreements.
- `p26_sourcify.py` requests `fields=match,...`; Sourcify rejects that selector ("Field selector match is not a valid field"). `p27` (plain call) is the working one, and the results quoted in the notes match what I got from the plain call. The router proxy itself is `match` (not `exact_match`) on Sourcify, verified 2026-03-22; the notes only claim exact match for the implementation, which is correct.
- Sourcify: the ISM and its logic contract `0xACC249b2...` are not verified (as the notes say).

### Re-derived and confirmed (own code, H unless stated)

1. **Pairing, both ends.** Base `routers(3223)` = `0x9090463546d725f6ece5d1a4b27beb929d5d1983`; XO `routers(8453)` = `0x54716a535c3b5616e3f0d4d5005fc4bb660cdf5f`; reverse lookups (`routers(8453)` on Base, `routers(3223)` on XO) are zero; `domains()` `[3223]` / `[8453]`; `token()` = Circle USDC / USDC.e; `localDomain()` 0x2105 / 0xc97; `PACKAGE_VERSION()` "11.1.0" on both; both proxies 2,882 bytes with the identical codehash `0x536a9c2400938a6a75cb3661f13e044171fd433531e5a502ba3fa145bf6bcb6d`; EIP-1967 implementation slots `0x5b3f3241...926a` (Base) and `0xdc4b86b0...d052` (XO); admin slots `0x980d5952...3fc06` and `0x354fe196...40ada`.
2. **Shared Mailbox, hook, ISM.** `mailbox()` `0xfDd96df1...Ca470` on both, 2,882 bytes, same codehash on both; `defaultHook()` = `requiredHook()` = `0xf9a84A5e...E449`, `hookType()` 3; `defaultIsm()` = router ISM `0xb429F398...B8Ff`; ISM code 278 bytes, identical hash on both chains; Mailbox impl on Base `PACKAGE_VERSION` "10.1.5". Nonces: Base 9,655 (0x25b7), XO 8,825 (0x2279), unchanged from the notes' reading.
3. **ISM decode.** Code = 54-byte MetaProxy prefix to logic `0xACC249b2...95e0` (4,494 bytes) + 224-byte metadata: offset 0x40, **threshold 2**, length 3, validators `0xafBd7650...B889`, `0x3D5dAEFB...C7d4`, `0xA6c998F0...faab`. `moduleType()` = 4, which is `MERKLE_ROOT_MULTISIG` in the `Types` enum of `IInterchainSecurityModule.sol` in the Sourcify source (index 4; this upgrades the notes' "from memory: M" to H).
4. **Selectors and calldata.** `cast sig`: `transferRemote(uint32,bytes32,uint256)` = 0x81b4e8b4, `approve(address,uint256)` = 0x095ea7b3. The notes' worked example (recipient 0x3333...3333, 5 USDC = 0x4c4b40) is byte-identical to `cast calldata` output for both calls; `transferRemote` calldata is 100 bytes. EIP-55 forms of the router, XO route, USDC and USDC.e match. Event topics: `DispatchId` 0x788dbc1b...353a, `ProcessId` 0x1cae38cd...73a9, `Dispatch` 0x769f711d...c814, `Process` 0x0d381c2a...6574, `SentTransferRemote` 0xd229aacb..., `ReceivedTransferRemote` 0xba20947a... all match.
5. **Base `msg.value` 0.** `eth_call` on `mainnet.base.org` with state override (synthetic sender, USDC balance slot 9 and allowance slot 10, validated by read-back): value 0 returns a message id; value 1 wei reverts "MerkleTreeHook: no value expected". `quoteGasPayment(3223)` 0; `quoteTransferRemote` = `[(0x0,0),(USDC,amount),(USDC,0)]` for amounts 1 raw, 5 USDC, 30,000 USDC and 1e18 raw. `scaleNumerator`/`scaleDenominator` 1/1 on both; `hook`, `feeHook`, `feeRecipient`, `feeToken` zero on both; `destinationGas` 68,000 in both directions.
6. **No allowlist, limit or pause in the router.** Sourcify source of the implementation (45 files): `TokenRouter.transferRemote` is `public payable` with no sender check; a grep of all `contracts/` files for pause, allowlist, whitelist, limit and max finds only gas-limit code; `TypeCasts.bytes32ToAddress` has the `<= type(uint160).max` require.
7. **Circle USDC on Base against Circle's own documentation.** `developers.circle.com/stablecoins/usdc-contract-addresses` lists "Base 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" (the only 0x8335... address on the page). On chain: name "USD Coin", symbol USDC, 6 decimals, version 2, not paused, implementation slot `0x2ce6311d...d779` (Sourcify `exact_match`, 2024-08-08), legacy admin `0x4fc78503...cA44`, router and Mailbox not blacklisted. USDC.e: "Bridged USDC (XO)", USDC.e, 6 decimals, not paused, `isMinter(route)` true, `minterAllowance` 9999999999999998904052798093.
8. **Escrow vs supply.** Base `balanceOf(router)` 342,162.140419 USDC, XO USDC.e `totalSupply` 342,161.179605, difference 0.960814 (identical to the notes; no traffic in between).
9. **Governance.** Both ProxyAdmins have `owner()` = `0xC0c87622...4ca06`, which has no code on Base or XO; it is also the USDC.e `blacklister()`. Router and Mailbox owners are `0x9dC83f59...C5D6` (Base) and `0xf08239F9...4697` (XO): 171-byte proxies with `getThreshold()` 2. USDC.e owner and pauser = `0xf08239F9...`. Circle USDC owner `0x3ABd6f64...`, pauser `0xD3571B3b...`, blacklister `0x1f2e3A64...`, masterMinter `0x2230393E...` as in the notes.
10. **Latency, independent fresh pull.** Base logs via the Tenderly gateway in 1,000-block chunks (`DispatchId` and `ProcessId` in one OR-filter request), XO logs via the explorer, Base time = `1686789347 + 2 * block` (the formula equals `Multicall3.getCurrentBlockTimestamp()` at blocks 51,000,000, 51,500,007 and 52,000,000, diff 0 each), XO time = explorer `timeStamp`. Windows: (i) Base blocks 49,940,000 to 49,999,999 (inside the notes' window B): 133 deposits, 121 withdrawals; (ii) 51,190,000 to 51,229,999 (2026-09-12, not used by the researcher): 8 and 5; (iii) 52,747,000 to 52,781,999 (inside window A): 16 and 8. Pooled: **157 deposits: min 7, median 14, p90 25, p95 26, max 27 s; 134 withdrawals: min 6, median 11, p90 14, p95 15, max 18 s; 0 unmatched, 0 negative.** Per window the numbers equal the notes' (for the August subset: deposits 14 / 25 / 27, withdrawals 11 / 14 / 18). The max of 27 s and 18 s reproduces exactly. The September window shows low traffic (13 messages in 27.8 h) against about 86 deposits per day in August, so the notes' "traffic that month" remark holds for August only.
11. **Deposit sizes.** `ReceivedTransferRemote` amounts for the 133 August deposits: min 0.026489, median 4.5, max 999.897428 USDC; the notes' "$999.90 maximum" reproduces. The notes' minimum of 0.000029 lies outside my windows (not re-derived).
12. **XO app executor.** Random samples: 24/24 Base deposit transactions and 10/10 XO withdrawal transactions go `to` `0x5D1d6FA7...9Ba9` with selector 0x3a022aa7 and value 0, from 4 distinct senders on each chain; executor code is 21,535 bytes and byte-identical on Base and XO. Five gas receipts: 380,198 to 401,788 gas at an effective price of 6,000,000 wei, inside the notes' range. None of my 34 sampled transactions called the router directly.
13. **Paymaster.** `0x2353B23D...439d` `checkPolicy(account, route, 0x81b4e8b4)` = `(false, "Contract/selector not allowed")`; `checkPolicy(account, USDC.e, 0x095ea7b3)` = `(true, "Globally allowed selector")`; `(.., USDC.e, 0xa9059cbb)` = `(true, "Allowed selector on contract")`; `paused()` false; `dailyTxLimit()` 10,000 (queried with a synthetic account, so the policy is not per-account in these cases).
14. **Deposit account and Kernel account.** For the latest delivery: the mint went to a 217-byte account `D` (`accountId()`, `rootValidator()`, `eip712Domain()` all revert) and the sweep went to a 61-byte account `K` whose `eip712Domain()` returns name "Kernel", version "0.3.1", chainId 3223, `verifyingContract` = itself; `rootValidator()` and `accountId()` answer. (I did not write the third-party addresses into this note.)
15. **Registry and search claims.** `hyperlane-xyz/hyperlane-registry` HEAD is still `cd1b8032` (2026-10-16); `chains/` has 351 entries and none is XO; `chains/metadata.yaml` has no 3223; `deployments/warp_routes/XO` contains only `logo.png`; `warpRouteConfigs.yaml` (809,621 bytes) has zero hits for the router, route or USDC.e addresses. GitHub code search for the router returns exactly 3 hits: `DefiLlama/DefiLlama-Adapters` `registries/sumTokens/data2.js` (key `xo-bridge`, owner = router, token = Base USDC; line 1069) and two files in `Dedaub/monitoring-cli` (their contents were not read; untrusted, and not needed).
16. **PayBox schema.** `developer.paybox.sh/requirements.md` (556 lines) says `value` is "unsigned decimal wei", "One call only", `expiresAt` "within five minutes", "unknown fields are rejected", "V1 accepts one transaction per proposal", the window shows no decoded ERC-20 summary, and the USDC example uses `value: "0"`. All as the notes state.
17. **XO terms.** `/legal/terms-of-service` line 57 contains the quoted automation sentence ("Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system").

### Not re-derived or not establishable (default: unverifiable)

- The smallest observed deposit (0.000029 USDC) and Phase 0's $30,000 maximum; the claim that no deposit at or above $1,000 occurred in the notes' windows.
- Log-range limits and refusals of hosts I did not touch (`drpc`, `1rpc`, `nodies`, `blast`, `publicnode`, `routescan`, `base.blockscout.com` Cloudflare challenge, `mainnet.base.org` `eth_getLogs` 429) and the XO RPC's 100,000-block limit. Tenderly accepted my 1,000-block ranges, which is consistent.
- Raw-route Base gas for `approve` plus `transferRemote` (no `eth_estimateGas` allowed).
- Whether any third party has ever used the raw route on-chain: none of 34 sampled transactions did. "Permissionless" therefore rests on verified source plus `eth_call` simulation on both chains (strong, but not an observed live transfer). The live low-value test stays a precondition, as the notes already say.
- Everything the notes list as NOT ESTABLISHABLE WITHOUT XO (orderbook crediting of a direct mint, derivation of `D` from `K`, executor interface, paymaster allowlisting, identity of validators and the upgrade EOA) stays unverified; I found no way to settle any of them read-only.
- One-sample items: the 119.987299 USDC no-fee sweep, the Base-gas 22-receipt median, the 4-relayer ETH balances, the 21,535-byte executor disassembly claims (`p48`, `disasm.py`).

### Gate and constants

- Gate 6: **no change** (deposit leg answered-go, withdrawal leg partial). Evidence for the deposit leg is stronger after A (no stuck messages at all), B and C (both chains' value rule and bad-recipient behaviour now simulated).
- Constants: **no value changed**. Reclassified: "Required msg.value" confidence H on both chains (was H Base / M XO); `moduleType` 4 = merkle-root multisig H (was M); XO-side bad-recipient reverts H (was M).
- Privacy and secrets scan of this note and all 63 saved scripts: no email-like strings, no personal names, no home or user paths, no keys or tokens; the only 40-hex address not listed in the tables (`0xE16548...b307`, constant `MGR` in `p51`) is a 130-byte XO contract, not a person. Nothing to scrub.
