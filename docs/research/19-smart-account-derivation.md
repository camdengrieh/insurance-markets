# 19. Smart-account derivation (Phase 0 gate 3)

Stream: `smart-account-derivation`. Date: 2026-10-19 (machine clock of the fetches read 2026-10-18 evening UTC for the XO hosts, so "today" in the data is one day behind the harness date). Author: research subagent, read-only. Nothing was signed, no account, key, order or UserOp was created, no PayBox tool was called, the xo-docs `submit_feedback` tool was not used, and XO was not contacted in any way (user decision).

Confidence tags: **H** = read first-hand in a primary source or reproduced by my own computation this session (script or tx hash cited); **M** = secondary or inferred; **L** = weak. "NOT FOUND (searched: ...)" and "NOT ESTABLISHABLE WITHOUT XO" are used literally.

Reference keys for other notes follow `docs/phase0-gate-results.md`: `[01]` = `01-xo-auth-signing.md`, `[03]` = `03-xo-lifecycle-funding-creation-policy.md`, `[07]` = `07-xo-bot-reference.md`.

---

## 0. Bottom line

**Gate 3 verdict: partial.** The part that can be proven read-only is now answered "go" with high confidence. The part that only XO can answer stays open.

Answered (H):

1. Every XO smart account I decoded is a canonical ZeroDev **Kernel v3.1** account created by `createAccount(initData, salt)` on the canonical `KernelFactory` `0xaac5D4240AF87249B3f71bC8E4A2cae074A3E419`, with implementation `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D`, root validator `0x01 || 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` (ECDSA), **no hook, empty hookData and initConfig, `validatorData` = the 20-byte owner EOA, salt = 0**. This holds for 34 of 34 decoded v3.1 deployment transactions from 34 different owners, and for **2,627 of 2,627** `OwnerRegistered` events in six windows between 2025-10-28 and 2026-10-18 (address recomputed offline).
2. The address is a pure function of the owner: `account = CREATE2(factory, keccak256(initData(owner) || salt), initCodeHashERC1967(impl))`. The claim "address = `factory.getAddress(initData, salt)`" is confirmed three ways: offline recomputation (2,627 of 2,627), the live canonical factory's own `getAddress` on Base (6 of 6 observed owners return the real XO account), and the XO-chain deployment events. The counterfactual address for the public Anvil account 0 (TEST key, address only) is `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d`.
3. **Any EOA can be the owner.** The deployed validator accepts any non-zero 20-byte owner; the 2,627 owners are all distinct, all different from their account, and 237 of 238 recent owners have never sent a transaction on Base or Ethereum (embedded-wallet-like, M).
4. **On-chain signature validation works for an arbitrary EOA owner.** I proved this without any private key by running the deployed validator and a real deployed Kernel through `eth_call` state-override probes on Base: both a raw-digest ECDSA signature and an EIP-191 (`personal_sign`) signature over the Kernel-wrapped digest validate, a wrong owner does not, and the recovery byte must be 27/28.
5. The exchange's signature-type-3 check is exactly `maker.code.length > 0 && SignatureCheckerLib.isValidSignatureNow(...)` (verified source). It has **no ERC-6492 unwrap** and no registry of XO accounts. An **undeployed** account fails.
6. `GET /balance-allowance?address=<owner EOA>` **never** resolves to the smart account (18 of 18 observed owners and the Anvil test address return `smart_account: null`). The field is a registry flag for the account address itself, not an owner-to-account lookup. The Data API's `creator.walletPublicKey` is the **smart account**, not the owner.
7. Deployment is lazy: the account is created by the **first UserOp (initCode)**, signed by the owner, sponsored by XO's `PolicyPaymaster`, typically the "Enable Trading" batch (22 of 34 sampled). XO does not deploy at sign-up.

Not answerable read-only (NOT ESTABLISHABLE WITHOUT XO): whether XO's bundler accepts a UserOp (with initCode) from an account XO did not provision; whether the orderbook registry (`smart_account`) and API-key issuance accept a self-derived account, and how it gets registered; whether the L1 ClobAuth ERC-1271 check works before deployment; deposit-address provisioning for a foreign account.

Recommendation: build a **derive-and-verify** account module (pure functions plus read-only checks) and treat "account registered by XO" as a runtime precondition that is checked, not assumed (section 11).

---

## 1. Method, compliance and request budget

- Read first: `docs/phase0-gate-results.md` (gate 3 is "partial"; open question = factory/salt/derivation and XO acceptance), then notes `[01]`, `[03]` for the lead facts.
- XO ToS automated-access clause (read via the xo-docs MCP, `/legal/terms-of-service`): "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system." and "You may not harvest or scrape data from the Platform for unauthorized purposes". I stayed far inside it: public unauthenticated GETs, >= 300 ms between calls to a host, per-host hard cap 150, a persisted counter (`request_counters.json`).
- Final request counts: `explorer-mainnet.xo.market` 121, `orderbooks.xo.market` 91, `api-mainnet.xo.market` 69, `mainnet.base.org` 21 (JSON-RPC read calls, several batched), `ethereum-rpc.publicnode.com` 7 (batched `eth_getTransactionCount`), `mainnet-bundler.xo.market` 2. No host answered 401/403/429 except one Base 429 (public RPC per-second limit on an oversized batch; re-run in batches of 20).
- Never called: `rpc-mainnet-2.xo.market` (docs say it needs a private `api_key`; I did not probe it), the explorer's `/api/eth-rpc`, any auth endpoint, any write method. User-Agent on every request: `insurance-markets-research/0.1`. All scripts were grepped for `@`, personal names and home paths before use and before saving; none found.
- Small deviations to disclose: (a) two probes of documented Blockscout routes that did not exist on this explorer (`?module=proxy&action=eth_getCode` answered "Unknown module"; `/api/v2/proxy/account-abstraction/...` returned no data); (b) one wrong event topic (0 results) and one rate-limited batch; (c) the first call to the XO bundler sent a JSON-RPC **batch**, which it rejected ("Expected object, received array"); the second was a single `eth_supportedEntryPoints`. (d) `eth_call` with a **state-override** object (third parameter) was used on Base; it is a read-only simulation and changes no state.
- No private key was used. The Anvil account 0 key was **not** used; only its well-known public address appears, labelled TEST.
- Third-party account addresses are truncated in the tables below (first 6 / last 4 hex digits). Transaction hashes are full in `deployments_decoded.json` so every row is reproducible.

---

## 2. Where smart accounts appear in XO's public surfaces

| Surface | What the address is | Evidence |
|---|---|---|
| Data API `GET /markets` -> `creator.walletPublicKey` | The creator's **smart account** (maker), not the owner EOA | 150 type-4 rows (3 pages) gave 55 distinct creator wallets; 46 of 55 appear as `sender` in an EntryPoint `AccountDeployed` event inside my deployment windows (all with factory `0xaac5...`); for 3 I confirmed `/balance-allowance` returns the same address as `smart_account` (H, `s02`, `s04`, local join) |
| Data API `GET /users/portfolio?user=` | Keyed by the smart account; owner EOA -> 404 `User not found` | account 200, owner 404, Anvil TEST 404 (H, `s12`) |
| Orderbook `GET /balance-allowance?address=` | Returns `smart_account` = the **queried** address (lower-case hex, no `0x`) if that address is a registered account, else `null` | section 6 |
| On-chain `matchOrders` calldata | `order.maker == order.signer` = smart account; 52 of 52 observed orders `signatureType 3`, 86-byte signature | section 7 |
| Docs (OpenAPI `OpenOrder.owner`) | "UUIDv5 of the authenticated owner (deterministic from `maker_address` via XO_WALLET_OWNER_NAMESPACE)." | So the "owner" UUID is derived from the **maker address**, not issued from an owner registry; the namespace is not documented (H, docs; M for implication) |

Note on the explorer: Blockscout reports `is_contract: false` and no `creation_transaction_hash` for deployed Kernel accounts (e.g. the first account below), although `GET /api/v2/smart-contracts/<account>` returns 61 bytes of ERC-1967 proxy code (`0x363d3d373d3d363d7f3608...`, `proxy_type eip1967`). Do not use `is_contract` to test for deployment on this explorer; use the `smart-contracts/<addr>` endpoint (404 = no code) or the `AccountDeployed` log (H, `s03`, `s38`).

---

## 3. Deployment transactions decoded (36)

### 3.1 How they were found and decoded

1. `EntryPoint v0.7` (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) emits `AccountDeployed(bytes32 indexed userOpHash, address indexed sender, address factory, address paymaster)`, topic0 `0xd51a9c61267aa6196961883ecf5ff2da6619c37dac0fa92122513fb32c032d2d`. One `getLogs` call per block window returns up to 1000 rows (`s09`). Windows: `r0` blocks 0-12M (capped at 1000, covers 2025-10-28 to 2025-11-19), `m1` 2.0-3.0M (390 rows, 2026-01-16 to 02-19), `m2` 5.0-6.0M (411, 05-01 to 06-01), `m3` 8.0-9.0M (427, 07-21 to 08-10), `m4` 10.5-11.5M (162, 09-07 to 09-25), `r1` >= 12.0M (238, 2026-10-05 to 10-18). Total 2,628 deployment rows (a windowed sample, not a census).
2. For 36 deployments chosen across windows (all non-canonical-factory rows plus an even spread) I fetched `GET /api/v2/transactions/<hash>` and decoded `handleOps(PackedUserOperation[] ops, address beneficiary)` from `raw_input`; the op's `initCode` is `factory(20) || createAccount(bytes data, bytes32 salt)`; `data` is Kernel `initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)` (`decode_deploy.mjs`, viem 2.57.2). Output: `deployments_decoded.json`.

### 3.2 What is invariant across the 34 v3.1 deployments (all H)

| Field | Value | Count |
|---|---|---|
| Factory | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` | 34 of 34 |
| Factory call | `createAccount(bytes,bytes32)` selector `0xea6d13ac` | 34 of 34 |
| Salt / index | `0x000...000` (index 0) | 34 of 34 |
| initData selector | `0x3c3b752b` = `initialize(bytes21,address,bytes,bytes,bytes[])`; length 292 bytes | 34 of 34 |
| Root validator | `0x01` (VALIDATION_TYPE_VALIDATOR) `|| 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` (ECDSA validator) | 34 of 34 |
| Hook | `0x0000000000000000000000000000000000000000` | 34 of 34 |
| validatorData | exactly 20 bytes = owner EOA | 34 of 34 |
| hookData / initConfig | empty / empty array | 34 of 34 |
| Owner vs account | different in every case (the owner is not the account) | 34 of 34, 34 distinct owners |
| UserOp signature | 65 bytes | 34 of 34 |
| UserOp nonce key | `0x00 0x00 || 0x845A...cE57 || 0x0000` (mode 0, root type, validator, key 0), sequence 0 | 34 of 34 |
| Paymaster | XO `PolicyPaymaster` `0x2353B23D8F329fD3cEC0d21652F14208248A439d` (paymasterAndData length 52 = paymaster + two 16-byte gas limits, **no paymaster data**): 30; ZeroDev `0x777777777777AeC03fd955926DbF81597e66834C`: 4 | 30 / 4 |

The implementation address is not in the calldata. It is pinned by the CREATE2 recomputation (section 5): with `impl = 0xBAC849bB...4b4D` all 34 sampled and all 2,627 population addresses match, which cannot happen with another implementation (collision resistance). The ZeroDev SDK constants file lists the same triple for Kernel `0.3.1`: implementation `0xBAC849bB...`, factory `0xaac5D424...`, meta-factory `0xd703aaE7...` (`packages/core/constants.ts`), ECDSA validator `">=0.3.1": 0x845ADb2C...` (`plugins/ecdsa/constants.ts`) (H, `gh api` raw reads). XO's `initCode` calls the factory directly, not the meta-factory; the account address is the same either way because the factory is the CREATE2 deployer.

### 3.3 Two outliers (legacy Kernel v2 style)

2 of the 36 (one in `r0`, one in `m1`; both 2025-11 / 2026-02, ZeroDev paymaster) use a different factory `0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985` with selector `0x5fbfb9cf` = `createAccount(address owner, uint256 index)` (owner in the clear, index 0) and the Kernel v2 `execute(address,uint256,bytes,uint8)` selector `0xb61d27f6`. They are not v3.1 accounts and are not covered by the XO docs' `Kernel`/`0.3.1` wrapper (H on decoding; M on what they are). Frequency in the windows: 2 of 2,628.

### 3.4 The 36 rows

Legend: "first op" = the deploying UserOp's call: **ET** = Enable Trading batch (USDC.e `approve` + ConditionalTokens `setApprovalForAll`), **A1** = single USDC.e `approve`, **TR** = USDC.e `transfer`, **X** = `approve` (4 of 7 on a token other than USDC.e) plus selector `0x0a1c55e6` on a market-like contract (selector unidentified, L), **v2** = Kernel v2 execute (legacy factory, section 3.3). "Owner Base/ETH nonce" = `eth_getTransactionCount` of the owner on Base / Ethereum mainnet (`n/m` = not measured; the two legacy owners were not measured). Order = `deployments_decoded.json` order (by file name, not by date). Full tx hashes are in the fixture.

First-op classes over the 34 v3.1 rows: ET 22, A1 3, TR 2, X 7. All 34 owners: Base nonce 0 and Ethereum nonce 0.

| # | UTC date | Tx (first 14 hex) | Account | Owner (or legacy owner arg) | Salt/index | Paymaster | First op | Owner Base/ETH nonce |
|---|---|---|---|---|---|---|---|---|
| 1 | 2026-09-07 | `0x06a8440744268f` | `0x924963..44e4` | `0xa155b6..23a3` | 0 | XO | ET | 0 / 0 |
| 2 | 2026-10-08 | `0x087c3f792e87ad` | `0x3DdE77..8124` | `0xe3045C..35C1` | 0 | XO | ET | 0 / 0 |
| 3 | 2026-10-11 | `0x1c866ee8f33c91` | `0x48151F..EeB2` | `0xA2EF2d..B22B` | 0 | XO | ET | 0 / 0 |
| 4 | 2026-10-14 | `0x2f24a3b564de7f` | `0xf9f029..9b03` | `0x476d39..B540` | 0 | XO | A1 | 0 / 0 |
| 5 | 2026-10-07 | `0x3c1ba00e824fee` | `0xB9D108..8618` | `0x0455eB..64aE` | 0 | XO | ET | 0 / 0 |
| 6 | 2026-10-06 | `0x3f3d4f3adb1eb3` | `0xC4531B..7930` | `0xf8Cd9D..5416` | 0 | XO | ET | 0 / 0 |
| 7 | 2026-10-07 | `0x4433577cc202e6` | `0x82c9A7..A486` | `0x06368e..CC92` | 0 | XO | ET | 0 / 0 |
| 8 | 2025-11-14 | `0x51e388547dc431` | `0x72190B..C267` | `0x2ea84B..FfF9` | 0 | ZeroDev | X | 0 / 0 |
| 9 | 2026-07-26 | `0x5710c13985f8bf` | `0xdbB752..401F` | `0xe21366..86fe` | 0 | XO | ET | 0 / 0 |
| 10 | 2026-10-07 | `0x58784ca170d12a` | `0xc29C5B..3B5b` | `0xD4a63A..22C5` | 0 | XO | ET | 0 / 0 |
| 11 | 2026-10-06 | `0x5e5792d87a0572` | `0x7a8bFB..6D53` | `0x6F3427..c3d7` | 0 | XO | A1 | 0 / 0 |
| 12 | 2025-11-09 | `0x63a41631511092` | `0xb7b087..FF9F` | `0xC50E90..EC26` | 0 | ZeroDev | X | 0 / 0 |
| 13 | 2026-01-16 | `0x671dd4c086ad7e` | `0xee9286..e770` | `0xD819eB..0162` | 0 | ZeroDev | X | 0 / 0 |
| 14 | 2026-10-05 | `0x67bdf97771e54d` | `0x24c061..8237` | `0x79B53A..8a22` | 0 | XO | ET | 0 / 0 |
| 15 | 2026-10-08 | `0x70c4b95186cb44` | `0xE9b59D..785D` | `0xD1B7B9..3550` | 0 | XO | ET | 0 / 0 |
| 16 | 2026-01-22 | `0x8195ad9b854d6b` | `0x5EA9Bb..3168` | `0x183889..A1F4` | 0 | ZeroDev | X | 0 / 0 |
| 17 | 2026-10-14 | `0x824afaeb427e91` | `0x55DD88..9a4a` | `0x9138B3..fc98` | 0 | XO | ET | 0 / 0 |
| 18 | 2026-05-20 | `0x91285c29ade6f4` | `0x03E914..5Ec9` | `0xA41173..6861` | 0 | XO | X | 0 / 0 |
| 19 | 2026-10-09 | `0xa0ae5ab4b9fc4e` | `0x9209A5..0EC2` | `0xA0FD3a..6524` | 0 | XO | ET | 0 / 0 |
| 20 | 2026-10-06 | `0xa0b982766eec59` | `0x934b34..9900` | `0x258d6d..e4b7` | 0 | XO | A1 | 0 / 0 |
| 21 | 2026-02-02 | `0xabc91311333b64` | `0x43B4eC..0EBA` | `0xfadc68..44e2` | index 0 | ZeroDev | v2 | n/m |
| 22 | 2026-10-10 | `0xb2e64b926afcb9` | `0xc1Af4a..91Ee` | `0x713DEC..aBdC` | 0 | XO | ET | 0 / 0 |
| 23 | 2026-10-10 | `0xb30bda2c7b4a65` | `0xA97511..76AE` | `0xBad0f8..9Ab3` | 0 | XO | ET | 0 / 0 |
| 24 | 2026-10-12 | `0xb826a05ef164b9` | `0x643260..5c84` | `0x9343d6..E59e` | 0 | XO | ET | 0 / 0 |
| 25 | 2025-10-28 | `0xb91a194308ba40` | `0x9bE1B9..ba37` | `0x8fd379..7a03` | index 0 | ZeroDev | v2 | n/m |
| 26 | 2026-02-06 | `0xbd13dd392f8d9b` | `0x90f2d2..65CB` | `0xDB7c62..61f7` | 0 | XO | X | 0 / 0 |
| 27 | 2026-07-21 | `0xbff394019ecb60` | `0x525cd3..7cCf` | `0x0D3c36..e62D` | 0 | XO | ET | 0 / 0 |
| 28 | 2026-10-05 | `0xc6677e92823a0f` | `0x5A265c..2e12` | `0xEe333B..88e8` | 0 | XO | ET | 0 / 0 |
| 29 | 2026-10-13 | `0xd82eadee8351cc` | `0x4b61aF..9803` | `0x74DB1D..472d` | 0 | XO | ET | 0 / 0 |
| 30 | 2026-10-09 | `0xe031bbd3562cb2` | `0x138b52..Ec88` | `0x16aa9F..5edF` | 0 | XO | TR | 0 / 0 |
| 31 | 2026-10-06 | `0xecf02e428bedd0` | `0x79097b..426a` | `0xe162a1..e75D` | 0 | XO | ET | 0 / 0 |
| 32 | 2026-09-20 | `0xfaf11e0d985aae` | `0x61c858..58c8` | `0xD7E3EA..4167` | 0 | XO | ET | 0 / 0 |
| 33 | 2026-05-01 | `0xfd62198498007a` | `0x1182Eb..41a3` | `0xc9Fd31..8F5e` | 0 | XO | X | 0 / 0 |
| 34 | 2026-10-15 | `0xfe048ed0809062` | `0xa09B36..f625` | `0x9520cF..7F94` | 0 | XO | TR | 0 / 0 |
| 35 | 2026-10-06 | `0xff06955adc7c65` | `0x131793..6891` | `0xEfa987..92E9` | 0 | XO | ET | 0 / 0 |
| 36 | 2026-10-12 | `0xff6224b036a033` | `0x8B31FA..A60D` | `0x2cd830..2f5C` | 0 | XO | ET | 0 / 0 |

### 3.5 Population check: salt 0 for everyone (H)

`ECDSAValidator` emits `OwnerRegistered(address indexed kernel, address indexed owner)` (topic0 `0xa5e1f8b4009110f5525798d04ae2125421a12d0590aa52c13682ff1bd3c492ca`) on install. Pulling it for the same windows gives 2,627 (kernel, owner) pairs (`s32`, `s36`); every kernel has exactly one event, every owner has exactly one account, `owner == kernel` never occurs. `verify_population.mjs` recomputes the CREATE2 address from the owner with salt 0: **2,627 of 2,627 match**. So in this sample there is no non-zero salt/index, no second account per owner, and no owner-change event (a re-install would emit a second event; none seen; M because windows, not census, and `r0` was capped at 1000).

---

## 4. Owner type: embedded-wallet-like or external?

On-chain nothing marks a wallet as Privy-embedded. Proxy test: does the owner EOA have any history elsewhere?

| Sample | Base `nonce > 0` | Ethereum `nonce > 0` |
|---|---|---|
| 34 decoded owners | 0 | 0 |
| 238 distinct owners deployed 2026-10-05..18 | 1 (nonce 2) | 0 |

So 237 of 238 owners never sent a transaction on Base or Ethereum. External wallets (MetaMask-style) are usually active on at least Ethereum, so these owners look like fresh app-generated (embedded, Privy-style) EOAs, consistent with the OpenAPI wording "XO Privy/ZeroDev smart accounts" (M; the proxy cannot exclude a fresh external wallet). `scripts: s31, s32, s33`.

Consequence: the existence of arbitrary-EOA owners is proven (all of them are plain EOAs), but there is **no on-chain example of an externally controlled non-app wallet** that I can positively identify.

---

## 5. Derivation formula and its verification

### 5.1 Formula (H; contract source read from GitHub tag v3.1 and reproduced)

```
initData(owner) = initialize(
    _rootValidator = 0x01 || 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57,   // bytes21
    hook           = 0x0000...0000,
    validatorData  = owner (20 bytes),
    hookData       = 0x,
    initConfig     = [])                                                   // selector 0x3c3b752b, 292 bytes
actualSalt = keccak256(initData || salt)           // abi.encodePacked(data, salt), salt = bytes32(0)
account    = CREATE2(deployer = KernelFactory 0xaac5...E419, salt = actualSalt,
                     initCodeHash = keccak256(
                       0x603d3d8160223d3973 || impl || 0x6009 ||
                       0x5155f3363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076 ||
                       0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3))
         // = LibClone.predictDeterministicAddressERC1967(impl, actualSalt, factory)
impl        = 0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D   -> initCodeHash 0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6
```

`KernelFactory.sol` at tag v3.1 (read via `gh api`): `createAccount` computes `actualSalt = keccak256(abi.encodePacked(data, salt))`, deploys the deterministic ERC-1967 clone and `call`s `data` on it; `getAddress` is the matching predict function (H). Because the owner is inside `data`, which is hashed into the salt, a third party cannot deploy "your" address with a different owner; `createAccount` is permissionless, so anyone could deploy the account for a given owner (the owner stays the one in `data`).

### 5.2 Checks (all H)

| Check | Result | Script |
|---|---|---|
| Rebuild `initData` from the decoded owner and compare bytes | identical for 34 of 34 | `derive_kernel.mjs verify` |
| Offline CREATE2 address vs real account | 34 of 34, then 2,627 of 2,627 across six eras | `derive_kernel.mjs`, `verify_population.mjs` |
| Live canonical factory `getAddress(initData, 0)` via `eth_call` on **Base** (factory `0xaac5...` exists there, 989 bytes; `implementation()` returns `0xBAC849bB...`) for 6 observed owners | returns the real XO account in 6 of 6; equals my offline value in 7 of 7 incl. Anvil | `s16` |
| Bytecode of factory / validator on chain 3223 vs Base | **identical** (989 B keccak `0xeecde6f4...3ca0`; 1,819 B keccak `0x2f8b585e...0708`) | `s19`, `s15` |
| Kernel implementation on 3223 vs Base | same length 22,784 B; differ in **34 bytes only**: a 32-byte cached EIP-712 domain separator and the 2-byte chainId (`0x0c97` vs `0x2105`). Recomputing `keccak(abi.encode(typehash, keccak("Kernel"), keccak("0.3.1"), chainId, impl))` gives `0x7adfec38...4409` for 3223 and `0xce0363f2...86ca` for 8453, exactly the differing bytes | `check_domain_sep.sh` |

The last row confirms on chain 3223, from the deployed bytecode, that the Kernel domain is `("Kernel", "0.3.1", 3223)` (this was only doc-derived in `[01]`) and that the Base factory/implementation can be used as an independent oracle for derivation.

### 5.3 Counterfactual addresses

| Owner | Salt | Counterfactual account | Status |
|---|---|---|---|
| Anvil/Hardhat account 0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (public TEST key; address only) | 0 | `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` | **Not deployed on chain 3223** (explorer `smart-contracts/<addr>` 404; no `AccountDeployed` for it). Deployed on Base (61-byte proxy code); there the validator's stored owner is `0xf39Fd6e5...2266` (read `ecdsaValidatorStorage(account)`), which shows the derived address really is a Kernel owned by that EOA. Orderbook and Data API do not know it (`smart_account` null, 404) |
| 6 observed owners (truncated) | 0 | equal to their real XO accounts | deployed |

A PayBox MPC EVM address was **not** looked up (no PayBox tool may be called). The derivation for it is one function call: `node derive_kernel.mjs addr <owner>` (`derive_kernel.mjs`).

---

## 6. XO API behaviour: does XO derive or look up the account from an owner?

Tests (orderbook `GET /balance-allowance?address=<a>&asset_type=COLLATERAL`, Data API `GET /users/portfolio?user=<a>`):

| Input address | `smart_account` | Data API |
|---|---|---|
| Observed **owner EOA** of an active account (18 owners) | **null** in 18 of 18 | 404 |
| Observed account (13 of 18 sampled) | = the same address | 200 (or 404, see below) |
| Observed account (5 of 18 sampled) | **null** | 200 |
| Anvil account 0 (TEST, the owner) | null | 404 |
| Anvil counterfactual **account** (not deployed on 3223) | null | n/a |
| USDC.e token, EntryPoint v0.7, Kernel v3.1 implementation (deployed contracts) | null | n/a |

H for all rows (`s04, s11, s12, s17, s34`). Conclusions:

- **XO does not compute the account from an owner.** The field is "is this address a registered smart account", keyed by the account address. The docs' "null for plain EOA users with no smart account" is correct in effect but does not mean owner lookup.
- It is **not** a code check ("any contract" -> null) and **not** "deployed" (5 of 18 deployed accounts are null).
- Pattern (M): the 5 deployed-but-null accounts all had a first UserOp that was **not** Enable Trading (class X: an `approve`, on a token other than USDC.e in 4 of the 5, plus selector `0x0a1c55e6` on a market-like contract; 4 of the 5 under the older ZeroDev paymaster), while 13 of 13 accounts whose first op was Enable Trading or a USDC.e `approve` are registered. This suggests the orderbook registers an account when it goes through **CLOB onboarding** (Enable Trading or L1 key derivation), not at deployment. The mechanism (L1 auth side effect vs backend indexer vs operator step) is not observable read-only.
- The orderbook registry is separate from the Data API user table: of 29 accounts with orders matched in the 26 most recent decodable `matchOrders` transactions on the market manager (52 orders), **29 of 29 are orderbook-registered** (balances 0.02 to 325 USDC) but only **4 have a Data API user** (25 return 404 `User not found`). So many active CLOB accounts exist that never went through the app's user-profile path (H on counts, `s35`; the cause - XO-provisioned market-maker accounts, bots, or API-only users - is unknown, L).

---

## 7. Signature validation on-chain, ERC-6492 and the undeployed case

### 7.1 What the exchange does for signature type 3 (H, verified source)

Verified `CTFExchange` implementation `0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED` behind proxy `0x4bC5E872256D12E6017dfe466E04c867DC761B77` (`GET /api/v2/smart-contracts/...`, files `Signatures.sol`, `Trading.sol`, `NonceManager.sol`). `SignatureType` enum value 3 is `POLY_1271`:

```
return (signer == maker) && maker.code.length > 0
    && SignatureCheckerLib.isValidSignatureNow(maker, hash, signature);
```

Solady `isValidSignatureNow` (same bundle): "If `signer.code.length == 0`, then validate with `ecrecover`, else it will validate with ERC1271 on `signer`." Its ERC-6492 variants (`isValidERC6492SignatureNow`) exist in the library but are **not called** by the exchange. The exchange has no XO account registry (the `Registry` mixin only maps Polymarket proxy/safe factories). `_validateOrder` also requires `isValidNonce(maker, order.nonce)`, i.e. `nonces[maker] == order.nonce` (equality; all 52 observed on-chain orders carry nonce 0 and expiration 0) - this settles the open question in `[01]` V (missed 2): the order nonce is **not** free.

Consequence: an **undeployed** (counterfactual) account cannot settle an order. The EIP-712 order domain constants (`"XO Market CLOB"`, `"1"`) are in the verified source (`EIP712_NAME`/`EIP712_VERSION`) (H).

### 7.2 What Kernel v3.1 and the deployed validator do (H; GitHub source plus key-free probes)

- `Kernel.isValidSignature(hash, signature)`: decodes the first byte (`0x01` = validator type), takes the next 20 bytes as the validator, requires that validator to be installed with a non-zero hook slot, then calls `validator.isValidSignatureWithSender(msg.sender, _toWrappedHash(hash), sig)`.
- The deployed ECDSA validator bytecode (1,819 bytes, identical on 3223 and Base) contains `onInstall, onUninstall, isModuleType, validateUserOp, isValidSignatureWithSender, ecdsaValidatorStorage, isInitialized, preCheck, postCheck`; **no `transferOwnership`**, no stateless-validation functions (selector scan, `a1_validator_selector_scan.py`). So the owner cannot be changed in place; changing it needs installing another validator or changing the root validator through a UserOp signed by the current owner.
- **Probe 1 (validator, `gen_validator_probe.mjs` + `s30`)**: I chose an arbitrary hash and `(r, s, v)`, **recovered** the signer under two interpretations, and installed each as the owner of a made-up account only inside an `eth_call` storage override on Base's copy of the validator (slot = `keccak256(abi.encode(account, 0))`, read-back confirmed). Results: `isValidSignatureWithSender` returns `0x1626ba7e` for **both** (a) ECDSA over the raw 32-byte digest and (b) ECDSA over the EIP-191 `personal_sign` hash of the digest; an unrelated owner returns `0xffffffff`; `validateUserOp` returns 0 (success) for both and 1 for the control.
- **Probe 2 (full path on a real deployed Kernel, `gen_kernel_fullpath_probe.mjs` + `s39`)**: on the Anvil-account-0 Kernel deployed on Base, `K.isValidSignature(hash, 0x01 || 0x845A... || ecdsa)` with the owner overridden to the recovered signer of the Kernel-wrapped digest: success for both forms; wrong owner `0xffffffff`; a wrong validator prefix reverts `InvalidValidator()`.
- **Probe 3 (`gen_vbyte_probe.mjs` + `s40`)**: a signature with recovery byte 27/28 is accepted; the same signature with v = 0/1 **reverts** `InvalidSignature` (`0x8baa579f`). A signer that emits v in {0, 1} must be normalised by adding 27.

### 7.3 What XO's own signers actually produce (H; docs and production differ)

For the 52 orders in 26 recent `matchOrders` transactions on the market manager `0xE1654812...b307` (decoded with the verified manager ABI; `verify_onchain_signatures.mjs`): all are `signatureType 3`, 86 bytes, prefix `0x01 || 0x845A...cE57`, nonce 0, expiration 0. I recomputed each order hash (domain `XO Market CLOB`/`1`/3223/exchange proxy), wrapped it in `Kernel(bytes32 hash)` under `("Kernel", "0.3.1", 3223, maker)`, and recovered the signer from the trailing 65 bytes:

- Treated as a **raw-digest** signature, the recovered address matches the registered owner for **0 of 18** makers checked.
- Treated as an **EIP-191 `personal_sign` signature over the 32-byte wrapped digest**, it matches the validator-registered owner (from `OwnerRegistered`) for **18 of 18**.

The same holds for UserOps: for all 34 deploying UserOps I recomputed the EntryPoint v0.7 `userOpHash` (a check of my formula against real chain-3223 signatures) and recovered the 65-byte signature: **34 of 34 are EIP-191-over-userOpHash**, 0 raw (`verify_userop_sigs.mjs`).

So XO's production app signs digests with `personal_sign` semantics on the 32 raw bytes, whereas XO's docs/example (`owner.sign({ hash: wrapped })`) describe a raw-digest signature. The deployed validator accepts both (probes above), so a PayBox `typedData` (EIP-712 digest signed raw) or `raw` signature is valid on-chain. Whether the **off-chain gateway** applies extra checks that prefer one form is unknown (it ultimately calls ERC-1271 on the account per `[01]` and the docs).

### 7.4 ERC-6492 and undeployed accounts in the docs

- Docs: NOT FOUND (searched the whole docs tree with `rg -i "6492|undeployed|counterfactual|not.deployed|deploy|initcode|1271"` over all pages and both OpenAPI specs, plus a search-tool query). The only relevant sentences: "The signature passes `IERC1271(maker).isValidSignature(orderHash, signature)`" and "`order.maker.code.length > 0` (it must be a contract)" (`/guides/smart-accounts`), "Smart-wallet signatures are verified via ERC-1271 on `XO_ADDRESS`" (`/api-reference/authentication`), and "Create an XO smart account at beta.xo.market. That smart account is your maker address." (`/documentation/introduction`).
- Gateway behaviour for an undeployed account (L1 ClobAuth ERC-1271 check): NOT ESTABLISHABLE WITHOUT XO. `[01]` recorded the live error text "L1 signature invalid (ECDSA failed; EIP-1271: ...)", i.e. ECDSA first, then an ERC-1271 `eth_call`; an `eth_call` to an address with no code returns empty data, so unless the gateway wraps ERC-6492, an undeployed account would fail L1. I did not probe auth endpoints (that would be auth probing).

---

## 8. How deployment happens and what sponsors it

- **Trigger (H):** the deploying UserOp is the account's **first** UserOp; `sender` is the counterfactual address, `initCode` = factory call, and `callData` is the user's first action. In the 34 canonical rows: Enable Trading batch 22, single USDC.e approve 3, USDC.e transfer 2, other batches 7. All are signed by the owner (65-byte ECDSA, EIP-191 form). There is no XO-originated deployment: the signer of every deploying op is the owner (recovered, section 7.3). Bundles are submitted by 15 different bundler EOAs across the 36 transactions (e.g. `0x1994...5486` x6), all to the EntryPoint v0.7.
- **Who pays (H):** `PolicyPaymaster` `0x2353B23D8F329fD3cEC0d21652F14208248A439d` (verified source). `validatePaymasterUserOp` checks only: paused, `unlimitedAddresses[sender]` bypass, **callData policy** (every inner call must satisfy `_isAllowed(target, selector)`), and the daily per-sender limit. It does **not** inspect `initCode`, the factory, or whether the sender is known to XO. So on-chain, a deployment UserOp from a foreign owner is sponsored if its callData is allowlisted (e.g. USDC.e `approve`, ConditionalTokens `setApprovalForAll`). Re-read this session; consistent with `[03]` 4.3.
- **Owner-change selectors are not sponsored (H on 34 events):** the paymaster's currently allowed **global** selectors are 34 (`GlobalSelectorAllowed` log replay, `s37`); only `approve(address,uint256)` is identified, and none of Kernel's `installModule`, `uninstallModule`, `installValidations`, `uninstallValidation`, `changeRootValidator`, `execute*` selectors matched (33 selectors remain unidentified, so this is "not matched against my candidate list", M). With no hook for owner change and no in-place `transferOwnership`, an XO-provisioned account cannot be given a PayBox owner via a sponsored UserOp.
- **Bundler:** `https://mainnet-bundler.xo.market/` answers `eth_supportedEntryPoints` without any key: `["0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789","0x0000000071727De22E5E9d8BAf0edAc6f37da032"]` (EntryPoint v0.6 and v0.7) (H, `s25b`). It rejects JSON-RPC batch arrays. Whether `eth_sendUserOperation` accepts a sender XO has not provisioned: NOT ESTABLISHABLE WITHOUT XO (a write; not attempted).
- **Self-funded deployment:** anyone can call `KernelFactory.createAccount(data, 0)` directly, but that needs native XO gas on chain 3223 (RPC needs a private `api_key`; no acquisition route found, `[gate 4]`). All 2,628 observed deployments were paymaster-sponsored; none used a zero paymaster.

---

## 9. Funding recipients observed (side finding for gate 6, M)

16 of the 40 inbound bridge messages since block 12.5M (route `0x9090...D1983`, origin domain 8453) were checked: **none** of the 16 recipients has an `AccountDeployed` event, an orderbook registration, a Data API user or a token balance. One traced recipient is a **217-byte contract** (a delegatecall forwarder with an immutable target, selectors `0x8abf6077`, `0x088c8679`, `0x4300081c`, `0x7ae14ae7`) that received USDC.e by mint and forwarded it onward 15 seconds later via selector `0x3a022aa7`; another sampled recipient has no code. `[03]` states that recipients are XO smart accounts; in this sample they are not Kernel v3.1 accounts created through the EntryPoint. I did not follow the funds further. Treat "bridge recipient = user's smart account" as unverified (M) until gate 6 resolves how XO's deposit addresses work (`s20-s23`, `s41`, `s42`).

---

## 10. Established, plausible, not establishable

### 10.1 Established (H)

1. Account family, factory, implementation, validator, initData shape, salt and the derivation function (sections 3, 5).
2. Arbitrary EOAs are valid owners; the account address is determined by the owner alone (index 0 in XO's usage).
3. Signature validation at the contract level works for any such EOA owner, raw or EIP-191, v in {27, 28}, once the account is **deployed** (section 7).
4. The exchange demands a deployed contract and plain ERC-1271; there is no ERC-6492 path in the exchange (section 7.1).
5. Deployment is a sponsored first UserOp and the paymaster's on-chain policy does not gate by sender or factory (section 8).
6. Owner EOA -> account is **not** resolved by XO's API (section 6).
7. Order nonce must equal the on-chain per-maker counter (section 7.1).

### 10.2 Plausible (M)

1. A self-derived PayBox-owned account can be deployed through XO's bundler with a sponsored Enable-Trading-style first UserOp, because on-chain policy admits it and the bundler answers without a key. Untested.
2. The orderbook registers an account when it first does CLOB onboarding (Enable Trading / L1 key derivation); if L1 key derivation is what creates the record, the flow could be self-service for any deployed account. Untested.
3. Many registered CLOB accounts are not Data API users, so the Privy-profile record is probably not required for trading.
4. Owners are mostly Privy-style embedded wallets.

### 10.3 NOT ESTABLISHABLE WITHOUT XO

1. Bundler acceptance (sender, factory, initCode) for a non-XO-provisioned account.
2. Orderbook registry rules (`smart_account`), API-key issuance for a foreign account, L1 ClobAuth behaviour for an undeployed account (ERC-6492 or not).
3. Per-account deposit-address provisioning (the funding provider) for a foreign account.
4. Whether the geo/identity checks at login (IP, XO account profile) apply to a registry entry that never logged in via the app.
5. Whether XO would object to accounts that skip the app (ToS: one account per user; automated access allowed only if it does not "misuse the system").

### 10.4 Gate verdict

**Gate 3: partial.** Sub-question A (derive a deterministic Kernel v3.1 address for an arbitrary EOA and be valid for signature checks): **answered-go (H)**. Sub-question B (XO's off-chain stack accepting a self-created account): **unanswered, NOT ESTABLISHABLE WITHOUT XO** by read-only means. Overall verdict stays `partial`, but the risk shifts from "can an EOA own it" (yes) to "will XO's bundler/registry/funding path treat it as a user" (unknown).

---

## 11. Build implications (answered with evidence; recommended defaults)

1. **Pure module** `kernelAccount.ts`: constants (factory, implementation, validator, EntryPoint), `buildInitData(owner)`, `predictAddress(owner, index = 0n)`; unit-test against `deployments_decoded.json`-style vectors (any 3 of the verified owner/account pairs from the explorer) and against the Base factory `getAddress` as an optional online oracle. Include the TEST vector owner `0xf39F...2266` -> `0xB3729F7e...d30d`.
2. **Never trust an account address supplied by the model.** Derive from the PayBox owner address and compare; refuse if the supplied maker differs.
3. **Check state read-only before any write:** (a) code present? explorer `GET /api/v2/smart-contracts/<account>` (200 with `deployed_bytecode` of 61 bytes = deployed; 404 = undeployed) rather than `is_contract`; (b) registered? orderbook `/balance-allowance` returns `smart_account` equal to the account; (c) trading enabled: see gate 9 note (approval logs).
4. **Signing:** order and ClobAuth: sign the Kernel-wrapped digest. The validator accepts raw and EIP-191; XO's own app uses EIP-191 over the 32-byte digest. Locally recover both forms before submit and require that one of them equals the owner. Normalise v to 27/28. Wire format `0x01 || validator || sig65` is correct (52 of 52 real orders).
5. **Order fields:** nonce must equal the exchange's `nonces(maker)` (0 in all observed cases); expiration 0 was observed for app orders but short GTD is still the safer policy for a plugin.
6. **Deployment** (if ever allowed): the first UserOp carries `initCode = factory(20) || createAccount(initData, 0x00..00)`, `nonce` key `0x00 00 || 0x845A..cE57 || 0000`, `paymasterAndData` = paymaster (20) + verificationGasLimit (16) + postOpGasLimit (16) with **no** paymasterData, signature 65 bytes over `userOpHash` (EntryPoint v0.7, chain 3223), callData = ERC-7579 `execute(mode, ...)` with mode first byte `0x01` for batch. The call set must be inside the paymaster allowlist (approve, setApprovalForAll).
7. **Approval mode (user decision: "fine if it makes sense"):** it makes sense here. The deploying UserOp and Enable Trading are one-time, high-consequence signatures over an opaque digest, so they should go through an approval-gated PayBox grant. Per-order signatures are the part that does not scale with approvals (one signature per order, blind `Kernel(hash)` payload). This note cannot say how PayBox renders or gates `typedData`/`raw` (gates 4 and 8).
8. The plugin should surface four account states to the user: **no account** (derived address shown, funding blocked), **undeployed** (needs a first UserOp), **deployed but not registered** (cannot trade; may be a bundler/registry matter), **registered** (trading allowed). Do not offer to "create" the account through any route not listed here.

---

## 12. Corrections and additions to earlier notes

| Earlier statement | Now |
|---|---|
| `[01]`/gate 3: "NOT FOUND: factory, implementation, initData, salt, who deploys" | Found: sections 3 and 5; deployed by the owner's first sponsored UserOp |
| `[01] e`: `smart_account` lookup "plausible" owner -> account | Refuted: owner EOA returns null in 18 of 18; the field flags registered accounts by their own address |
| `[01] V12`: validator and implementation on 3223 unverified | Bytecode compared with Base: validator identical, factory identical, implementation differs only in chain-dependent immutables |
| `[01]`: validator "tries raw then EIP-191" (source, M) | Confirmed on the deployed bytecode by key-free probes (H); production app uses EIP-191 |
| `[01] V missed 2`: "order nonce probably not free" | H: `isValidNonce` equality in the verified exchange |
| `[01] c`/docs: sign `ecdsa(wrappedDigest)` | The app signs `personal_sign(wrappedDigest)`; both validate |
| `[03 V]`: bridge recipient = XO smart account | In a 16-recipient sample none is a Kernel account; one is a 217-byte forwarder contract (M) |
| gate-results 3: "owner UUID suggests a backend registry" | The OpenAPI says the owner UUID is UUIDv5 derived from the maker address; the real registry signal is `smart_account` (orderbook) and it is separate from the Data API users table |
| Explorer `is_contract` | Unreliable for Kernel proxies on this explorer |

---

## 13. Docs-versus-code discrepancies found in this stream

1. Docs: owner "signs the wrapped digest ... `ecdsa(wrappedDigest)`"; production signatures are EIP-191 over the wrapped digest (52 of 52 orders, 34 of 34 UserOps); validator accepts both.
2. Docs: `order.signature` "65-byte hex" (OpenAPI) vs the 86-byte wire form (guide and chain data: 86 in 52 of 52).
3. Docs claim "`smart_account` null for plain EOA users with no smart account" implies EOA lookup works; owners always return null.
4. Data API field `creator.walletPublicKey` sounds like an owner key; it is the smart account.
5. Docs say the XO app creates accounts at beta.xo.market; the chain shows creation happens at the first sponsored UserOp, not at sign-up.

---

## 14. Open questions (for a human run or for later, not for XO contact by me)

1. Does `eth_sendUserOperation` to `mainnet-bundler.xo.market` accept a first UserOp (initCode) for an account XO never provisioned? (Needs a signed UserOp; a write.)
2. What registers an account in the orderbook (`smart_account`)? Is it API-key derivation (L1 ClobAuth) or Enable Trading indexing?
3. Does the L1 gateway accept a counterfactual (undeployed) account via ERC-6492?
4. Which PayBox operation can sign the raw 32-byte digest with `personal_sign` semantics, and does PayBox return v in {27, 28}?
5. How are the per-account funding deposit addresses created, and are they tied to the Data API user record?
6. What is the unidentified selector `0x0a1c55e6` (class X first op), and who are the 25 registered CLOB makers with no Data API user?

---

## 15. Suspicious / embedded-instruction content

None found in the sources I read this session. (Docs sentences such as "Ask your XO contact" and the xo-docs server's feedback prompt are addressed to integrators/agents in general; I did not act on them. No contact with XO was made.)

---

## 16. Sources and scripts

Primary sources read this session:

- xo-docs MCP: `/legal/terms-of-service` (automated-access clause), `/guides/smart-accounts`, `/product/accounts/wallets`, `/product/accounts/deposit`, `/documentation/introduction`, `/guides/redeem-positions`, `/api-reference/openapi.yaml` (`CTFOrder`, `BalanceAllowanceResponse.smart_account`, `OpenOrder.owner`), plus `rg` sweeps for 6492/undeployed/deploy.
- XO explorer (Blockscout) GET: `/api?module=logs&action=getLogs` for EntryPoint `AccountDeployed`, validator `OwnerRegistered`, route `ReceivedTransferRemote`, paymaster `GlobalSelectorAllowed`; `/api/v2/transactions/<hash>`, `/api/v2/smart-contracts/<addr>` (exchange proxy and implementation, market manager implementation, `PolicyPaymaster`, factory, Kernel implementation, validator), `/api/v2/addresses/<addr>[/token-transfers|/token-balances|/transactions]`.
- XO orderbook and Data API GETs: `/balance-allowance`, `/markets`, `/users/portfolio`.
- XO bundler: `eth_supportedEntryPoints` (one read call).
- Base mainnet public RPC (`mainnet.base.org`): `eth_chainId`, `eth_getCode`, `eth_call` (factory `getAddress`, `implementation()`, validator probes with state override, Kernel `isValidSignature`), `eth_getTransactionCount`. Ethereum public RPC (`ethereum-rpc.publicnode.com`): `eth_getTransactionCount`.
- GitHub (raw reads via `gh api`): `zerodevapp/kernel` tag v3.1 `src/factory/KernelFactory.sol`, `src/Kernel.sol`; `zerodevapp/kernel-7579-plugins` ECDSAValidator (HEAD source, differs from the deployed bytecode: HEAD has no `transferOwnership` either; deployed behaviour was tested by probes); `zerodevapp/sdk` `packages/core/constants.ts`, `plugins/ecdsa/constants.ts`.

Short verbatim quotes (<= 25 words):

- "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system." (ToS)
- "Funding only the owner wallet does not make the smart account tradable." (`/guides/smart-accounts`)
- "The owner key must be the one registered on that account." (`/guides/smart-accounts`, troubleshooting)
- "UUIDv5 of the authenticated owner (deterministic from `maker_address` via XO_WALLET_OWNER_NAMESPACE)." (OpenAPI `OpenOrder.owner`)
- "If `signer.code.length == 0`, then validate with `ecrecover`, else it will validate with ERC1271 on `signer`." (Solady, in the verified exchange bundle)
- `return (signer == maker) && maker.code.length > 0 && SignatureCheckerLib.isValidSignatureNow(maker, hash, signature);` (`Signatures.sol`)

Scripts and fixtures saved under `docs/research/fixtures/gaps/smart-account-derivation/` (all <= 100 KB, no secrets, no home paths; JS scripts need `VIEM_ENTRY` set to the project's `node_modules/viem/_esm/index.js`; run from a directory that has an `out/` subfolder):

- Helpers: `xohttp.py` (throttled capped GET), `rpc.py` (read-only JSON-RPC allowlist).
- Discovery and decoding: `s01-s02` (Data API creators), `s07-s10` (AccountDeployed windows), `s13-s14` (sample and fetch), `decode_deploy.mjs` (handleOps/initCode/initialize decoder), `s32`, `s36` (OwnerRegistered windows).
- Derivation and verification: `derive_kernel.mjs`, `verify_population.mjs`, `make_getaddress_calls.mjs`, `s15`, `s16`, `s19`, `check_domain_sep.sh`.
- API behaviour: `s04`, `s11`, `s12`, `s17`, `s34`, `s35`.
- Signature validation: `verify_onchain_signatures.mjs`, `verify_userop_sigs.mjs`, `s26`-`s29`, `gen_validator_probe.mjs` + `s30`, `gen_kernel_fullpath_probe.mjs` + `s39`, `gen_vbyte_probe.mjs` + `s40`.
- Owner type and paymaster: `s31`, `s33`, `s37`, `s25b`, `s38`, `s20`-`s24`, `s41`, `s42`.
- Local analysis (no network): `a1_validator_selector_scan.py`, `a2_creators_vs_windows.py`, `a3_paymaster_selector_match.py`, `a4_registry_vs_first_op.py`, `a5_population_reconcile.py`, `a6_build_fixtures.py` (builds the fixtures and the table above); `s31b_owner_activity_fix.py` re-measures the 9 Base nonces that the first batch in `s31` could not read (public RPC per-second limit).
- Fixtures: `deployments_decoded.json` (36 rows), `results_summary.json`, `request_counters.json`.
- Exploratory scripts that returned nothing useful are kept for completeness: `s03`, `s05`, `s06`, `s18`, `s25`.

Limitations: windows are samples (`r0` capped at 1000 rows, so its first and last blocks are an artefact of the cap); the order/signature sample is the 50 most recent transactions to the market manager (half used a different `matchOrders` selector `0xe60f0c05` that I did not decode); `smart_account` registry observations are a point-in-time snapshot; the Base probes assume Base's validator and factory behave like XO's, which I support with identical bytecode (validator, factory) and a 34-byte immutable-only difference (implementation).


---

## Verification (2026-10-19)

Adversarial verifier pass, read-only, own code (pure-Python keccak256 and secp256k1 written and validated against known vectors; manual ABI decoding; no reuse of the researcher's scripts). Verifier scripts were kept in the session scratchpad and are not saved in the repo. Request counts for the verifier: `explorer-mainnet.xo.market` 127, `orderbooks.xo.market` 67, `api-mainnet.xo.market` 29, `mainnet.base.org` 4 (one JSON-RPC batch per call), `ethereum-rpc.publicnode.com` 2, `mainnet-bundler.xo.market` 1 (`eth_supportedEntryPoints`); no 401/403/429; User-Agent `insurance-markets-research/0.1`; ToS automated-access clause re-read before probing. `gh api` raw reads: `zerodevapp/kernel` (v3.1 `KernelFactory.sol`, `Kernel.sol`) and `zerodevapp/sdk` constants. Gate 3 verdict is unchanged: **partial**.

### V1. Reproduced independently (confirmed)

| Claim | Independent evidence (H) |
|---|---|
| Deployment layout (factory, `createAccount(bytes,bytes32)` `0xea6d13ac`, salt 0, `initialize` `0x3c3b752b`, 292 bytes, root `0x01 \|\| 0x845A..cE57`, hook 0, 20-byte validatorData, empty hookData/initConfig, 65-byte sig, nonce key `0x00 00 \|\| validator \|\| 0x0000`, XO paymasterAndData = 52 bytes) | Raw `handleOps` input of 21 transactions decoded by hand: 10 from the fixture list (rows 1, 4, 6, 8, 9, 13, 16, 18, 30, 33) plus 9 further canonical-factory deployments plus the 2 legacy rows 21 and 25. All 19 canonical rows: initData rebuilt byte-identical from the owner, CREATE2 prediction equals the UserOp sender, owner differs from account. Selectors and event topics recomputed with my keccak. |
| Legacy factory `0x91E60e06...8985`, `createAccount(address,uint256)` `0x5fbfb9cf`, index 0 | 2 of 2 decoded; address checksum valid |
| Derivation formula and `0x85d96aa1...03e6` | Reproduced from Solady ERC-1967 layout and, separately, from the live 61-byte proxy runtime of a deployed account (`603d3d8160223d3973 \|\| impl \|\| 6009 51 55 f3 \|\| runtime`); both hash to `0x85d96aa1...03e6`. Factory source (tag v3.1) read: `actualSalt = keccak256(abi.encodePacked(data, salt))`, `createDeterministicERC1967`, `account.call(data)`. |
| Factory, implementation, validator addresses | ZeroDev SDK constants (`0.3.1`: impl `0xBAC849bB...`, factory `0xaac5D424...`, meta-factory `0xd703aaE7...`; ECDSA validator `>=0.3.1` `0x845ADb2C...`). Base `factory.implementation()` returns `0xBAC849bB...`. The impl address is also embedded in the factory's runtime bytecode (immutable) on both chains. |
| 2,627 of 2,627 `OwnerRegistered` pairs match salt-0 CREATE2 | Re-fetched all six windows (r0 1000, m1 389, m2 411, m3 427, m4 162, r1 238), recomputed: 2,627 match, 0 mismatch, 2,627 distinct owners, 2,627 distinct kernels, 0 owner==kernel. `AccountDeployed`: 2,628 rows, factories 2,626 canonical / 2 legacy, paymasters 1,331 ZeroDev (`0x7777...`; 1000 of 1000 in r0, 331 of 390 in m1, last on 2026-02-06) / 1,297 XO. |
| Anvil account 0 counterfactual `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` | My offline value equals Base `getAddress` (7 of 7 owners incl. Anvil; 6 of 6 observed XO accounts); Base code 61 bytes; validator storage on Base for it returns the Anvil EOA; on chain 3223 there is no `OwnerRegistered` and no `AccountDeployed` log for it. |
| Bytecode facts | Factory 989 B keccak `0xeecde6f4...3ca0` and validator 1,819 B keccak `0x2f8b585e...0708` identical on 3223 and Base; implementation 22,784 B, exactly 34 bytes differ (`7adfec38...4409` vs `ce0363f2...86ca`, and `0c97` vs `2105`); both separators recomputed by me match. Validator PUSH4 scan: no `transferOwnership`. |
| Exchange rule | Verified source re-read: `verifyPoly1271Signature` is `(signer == maker) && maker.code.length > 0 && SignatureCheckerLib.isValidSignatureNow(...)`; the only call site of any Solady signature check outside the library is that line (no ERC-6492 call); `Trading._validateOrder` calls `isValidNonce(maker, nonce)` which is equality with `nonces[maker]`; domain `"XO Market CLOB"`/`"1"`. |
| Validator and Kernel signature semantics | Own key-free `eth_call` state-override probes on Base: raw-digest and EIP-191 forms both return `0x1626ba7e` at validator level and through a real deployed Kernel; unrelated owner `0xffffffff`; v=0 and v=1 revert `0x8baa579f` (= `InvalidSignature()`); wrong validator prefix reverts `0x682a6e7c` (= `InvalidValidator()`); an owner set to the signer of the UNWRAPPED hash fails, which proves the Kernel(bytes32) wrapping is applied. |
| XO production signs EIP-191 over the wrapped digest | 19 of 19 deploying UserOps recover to the owner under EIP-191 of my own `userOpHash` (0 raw). On-chain orders: I decoded 24 `matchOrders` (selector `0x4dc33615`) transactions = 48 orders, all `signatureType 3`, 86-byte signatures, nonce 0, expiration 0, maker == signer, v in {27, 28}. My order hash equals the indexed order hash of the `OrderFilled`/`OrdersMatched` logs (checked on one transaction; the 25 of 25 recovery match below is the stronger check). For 14 makers with a registered owner (25 orders) recovery equals the owner under EIP-191 in 25 of 25 and under raw in 0 of 25. |
| PolicyPaymaster | Source: pause, unlimited list, callData policy, daily limit only; no initCode/factory/sender check. `GlobalSelectorAllowed` replay: 34 allowed; of a candidate list only `approve` is identified; no Kernel install/uninstall/changeRoot selector. |
| `balance-allowance` never maps owner to account | Owner EOA returned `smart_account` null for 19 of 19 owners and Anvil 0; accounts: 5 of 19 non-null (value is the queried address, lower-case hex without `0x`). Data API `/users/portfolio`: account 200, owner 404, Anvil 404. |
| Data API `creator.walletPublicKey` is the smart account | 27 distinct creators on one page: 20 are `AccountDeployed` senders in my windows, 0 are owners |
| Bundler | `eth_supportedEntryPoints` returns both `0x5FF137D4...2789` (v0.6) and `0x0000000071727De2...a032` (v0.7), no key. Upgrade of that sentence to H; whether EP v0.6 is usable is still untested. |
| Docs NOT FOUND | `rg -i "6492\|counterfactual\|undeployed\|not deployed\|initCode"` over the whole docs tree returns nothing. Docs still say `ecdsa(wrappedDigest)` and a 65-byte `order.signature`; OpenAPI `OpenOrder.owner` is a UUIDv5 from `maker_address`. |
| Owner activity (M) | 40 sampled recent owners: Ethereum nonce 0 for 40 of 40, Base nonce 0 for the 25 that answered. Consistent with 237 of 238. |
| Bridge recipients (M) | 40 inbound messages, 40 distinct recipients reproduced; 5 of 5 checked have neither an `AccountDeployed` nor an `OwnerRegistered` event (so none is a Kernel account by any deployment path). |

### V2. Refuted or corrected

1. **REFUTED (operationally important): explorer `smart-contracts/<account>` 404 is not a deployment test.** Notes sections 2, 11 item 3(a), 12 (last row), and the assumption "check code presence ... 404 = undeployed" are unreliable. Of 12 deployed accounts sampled across the r1 window (all have `OwnerRegistered` and `AccountDeployed`), 10 returned 404 on `/api/v2/smart-contracts/<account>`; three recent ones stayed 404 on repeated queries; one (`0x924963..44e4`) returned 404 and `is_contract: false`, then 200 with 61-byte code a few minutes later. `/api/v2/addresses/<account>` `is_contract` flips the same way (it read `true` for the account the notes call `false`). The explorer fills these fields lazily. **Corrected rule:** treat an account as deployed iff the EntryPoint emitted `AccountDeployed` with `topic2 = sender` (found for 8 of 8 in my check) or the ECDSA validator emitted `OwnerRegistered` with `topic1 = account` (covers deployments outside the EntryPoint); treat "no such log" as undeployed, never a bare 404. The conclusion that the Anvil 0 counterfactual is undeployed on 3223 stands, but on the log evidence above, not the 404.
2. **Section 9 sub-claim "another sampled recipient has no code" is unverifiable** (it used the same lazily-filled endpoint). Keep: "no sampled recipient is a Kernel account"; drop: "has no code".
3. **Typo, checksum-invalid constant:** section 0 item 1 prints the factory as `0xaac5D4240AF87249B3f71bC8E4A2cae074A3E419` (lower-case `b` in `71bC8`). The checksum-correct value is `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` (used everywhere else and in the summary). A mixed-case address with a bad checksum is rejected by strict address parsers (for example viem `getAddress`), so do not copy it from that line.
4. **Count error, section 3.4 legend:** "X = approve (4 of 7 on a token other than USDC.e)". The notes' own fixture gives 6 of 7 (`0xCf6573..` in rows 8, 12, 13, 16, 26, 33; only row 18 approves USDC.e `0x80c12230..`).
5. **Section 6 pattern is weaker than stated (M stays M).** In my 19-account sample, ET or single-USDC.e-approve first op: 4 of 4 registered (agrees). But class X is not uniformly unregistered (1 of 9 X-class accounts, a Nov 2025 one, is registered), and the USDC.e-`transfer` account is also null. So first-op class does not determine registration; "registered tied to CLOB onboarding that may happen later" remains the better reading.
6. **Counts that differ by snapshot, same direction:** 25 of 25 recently active makers (24 decodable `matchOrders` txs, 48 orders) are orderbook-registered and 0 of 25 are Data API users, versus the notes' 29 of 29 and 4 of 29. The statement "trading does not require a Data API user" is reproduced; the "4" is not.
7. **Unexplained set mismatch in section 3.5:** `AccountDeployed` canonical senders vs `OwnerRegistered` kernels differ in window r0 (4 AD senders without an OR event, 5 OR kernels without an AD event, all at blocks 469k-506k). I decoded all 9 transactions: each is a canonical-form deployment (salt 0, ECDSA root, 20-byte owner) whose CREATE2 prediction matches. So no counterexample; the cause is the explorer's 1000-row cap returning a non-contiguous subset. It also means the r0 window is not a contiguous range.

### V3. Not verified / agreed as not establishable

- Bundler acceptance of a foreign sender, orderbook registration mechanism, L1 ClobAuth behaviour for an undeployed account (ERC-6492), deposit-address provisioning, XO's attitude to non-app accounts: all need a write or XO's answer. I agree with NOT ESTABLISHABLE WITHOUT XO and found no read-only way to narrow them further.
- The 33 unidentified paymaster selectors remain unidentified (I replayed the same 34; same single hit, `approve`).
- Section 7.2 statement that the off-chain gateway might prefer one signature form: untestable here.

### V4. Additions the build may need (found while verifying)

- `incrementNonceFor(address)` on the exchange is admin-only (no self-service); there are zero `NonceIncremented(address,uint128,uint128,address)` logs on the exchange, so every maker's nonce is currently 0. A keyless way to confirm "nonce still 0" is `getLogs` for that topic (topic0 `0xc3ab8769...cca0`, filter topic1 = maker); the RPC with `nonces(maker)` needs a key.
- PolicyPaymaster policy replay: `approve` is sponsored on any target (global), `setApprovalForAll` only for the ConditionalTokens contract (`0xCcf1b2C6..`), USDC.e `transfer` is allowed, no contract is fully whitelisted, no unlimited address, `dailyTxLimit` is 10,000 per account per day (raised 50 -> 5,000 -> 10,000). Admin-editable at any time.
- Kernel `initialize` has a root-validator-only guard (`already initialized`), and `changeRootValidator` / `installModule` are `onlyEntryPointOrSelfOrRoot`, consistent with section 8.

### V5. Identifier and secret scan

- Notes and all saved fixtures/scripts: no email-like strings, personal names, home-directory paths, tokens or keys found (the only `@` is prose in section 1). The 64-hex values in scripts are keccak constants and public transaction hashes. Two scripts (`s11`, `s26`) hold full third-party public on-chain addresses; these are chain data, not personal identifiers, and were left as is. No edit was needed.
- Disclosure about the verifier's own scripts: they reference the local scratchpad directory and read the fixture by local path (home-directory strings), only in local file operations, never in any URL, header, query or request body; I ran them before the explicit `@`/name grep and ran that grep afterwards (no `@`, no personal strings outside local path lines). They are not stored in the repo.
