# 39. A Safe smart account derived from an owner wallet (PayBox or any other): derivation spec, owner types, relation to the XO Kernel account, recovery, test plan

Task `aa-owner-derivation`. Written 2026-10-20 (harness date). Scope: only the "derive an account from a PayBox wallet or any other wallet" slice of the user proposal of 2026-10-20 ("a smart contract wallet using Account Abstraction that can be derived from a PayBox Wallet and any other wallet, that can then operate on any chain, and we use Candide.dev"). Venue-by-venue and bundler/paymaster questions belong to the sibling notes; here they appear only where they constrain derivation.

Read-only research. Public docs, public npm and GitHub metadata, read-only JSON-RPC (`eth_getCode`, `eth_call`, `eth_chainId`) against public RPC endpoints, one public GET per explorer or docs page, and **local** `anvil` forks of public chains in which transactions were sent to the local fork only. No PayBox tool was called, no Candide or XO bundler method was called, no account or API key was created, nothing was sent to any third party that changes state, nobody was contacted. Only the well-known public Anvil/Hardhat test accounts (the `test test ... junk` mnemonic) and throwaway keys generated in memory were used; no real person's address appears anywhere in this note.

Confidence tags: **H** = read first-hand in a primary source or reproduced by a probe I ran this session (source or script named); **M** = secondary, inferred from H facts, or a standard I did not re-read; **L** = guess. **NOT FOUND (searched: ...)**, **NOT TESTED** and **NOT ESTABLISHABLE** are used literally.

Note keys: `[09]` = `docs/research/09-venues-onchain-clob.md`, `[19]` = `19-smart-account-derivation.md`, `[20]` = `20-funding-route-verification.md`, `[21]` = `21-userop-templates.md`, `[24]` = `24-dapp-paybox-tie-in.md`, `[25]` = `25-dapp-aa-wallet.md`, `[29]` to `[34]` = the PayBox-web notes, `[DD]` = `docs/dapp-design.md`, `[DPW]` = `docs/dapp-paybox-web.md` (working-tree version, uncommitted edits included), `[P1]` = `docs/phase1-gap-closing.md`, `[AD]` = `docs/aggregation-design.md`. External sources are numbered S1.. in section 12.

Binding decisions applied: runnable by everyone from day zero with nothing the author operates and no custody of other people's credentials; nobody contacts the XO team; no browser automation of any third-party site; caps are advisory unless enforced on-chain; every write path flag-gated OFF; **no new wallet contracts written by us**; the repo is public.

---

## 0. Bottom line

1. **"Derived from a PayBox wallet and any other wallet" has exactly one sound meaning: an ERC-4337 Safe whose address is a pure CREATE2 function of (owner set, threshold, one pinned profile, one salt), with the PayBox EVM address (or any other EVM address, or a passkey public key) as an owner.** It is a *derived address*, not a derived key: PayBox has no HD or sub-key mechanism ([25] section 3, NOT FOUND) and the owner key never moves. Same owner set gives the same account address on every EVM chain where the deployment set exists (factory, singleton, 4337 module, setup helper, EntryPoint v0.7).
2. **Verified (H): the same owner derives the same Safe address on Ethereum, Polygon, Base, Arbitrum, BNB Chain and Optimism.** All 31 contracts I probed have code on all six chains with byte-identical runtime code per contract on every chain that has it (28 of 31 have one hash everywhere; the three that differ per chain, EntryPoint v0.8, v0.9 and the Kernel implementation, differ in a way consistent with chain-bound immutables, M, and [19] showed that for the Kernel implementation; Allowance Module v1.0.0 is absent on BNB, as Candide documents). For 7 golden vectors (owner sets, thresholds, salts) plus 2 passkey vectors, `SafeProxyFactory.createProxyWithNonce` simulated by `eth_call` on each of the six chains returns exactly the offline address (section 2.3). Three independent computations agree (viem script, `cast`-only recipe, and the constants and source of AbstractionKit 0.4.3). A live Safe at the derived address on Base is owned by the Anvil test account with the expected module, fallback handler and singleton (section 2.4).
3. **The address depends on SDK defaults, and the defaults disagree (H).** The same owner and the same salt give five different Safe addresses depending on whether the SDK uses the L2 or non-L2 singleton, a direct `SafeModuleSetup` call or a MultiSend wrapper, Safe 1.4.1 or 1.5.0, or Candide's newer "unified" module (section 2.5). A "Safe address" is therefore meaningless without a pinned profile. **Decision D1: profile `S1` (Safe L2 1.4.1 + Safe4337Module 0.3.0 + EntryPoint v0.7, direct SafeModuleSetup), pinned by address and by runtime code hash; D2: a dedicated `saltNonce` = `uint256(keccak256("insurance-markets/safe-aa/v1"))`; D3: derive in our own pure code (viem only), use AbstractionKit only as a test oracle.**
4. **PayBox can be an owner of this Safe through typed data alone.** The Safe UserOperation signature is an EIP-712 `SafeOp` signature (domain `{chainId, verifyingContract = module}`), the ERC-1271 signature is an EIP-712 `SafeMessage` signature, and neither needs a raw digest. PayBox's WalletConnect page signs `eth_signTypedData_v4` on ten EVM chains that include all six chains above ([DPW] section 0, H[B] there, M here). I executed the full path locally with a public test key: counterfactual deployment by the first UserOp, owner changes, 1-of-2 and 2-of-3 signing, removal of a "lost" owner, ERC-1271 over typed data: **24 of 24 checks pass on local forks of each of the six chains** (section 7.3). What remains unverified is PayBox's own behaviour (domain without `name`/`version`, the `v` byte it returns, the preview shown), which only a live test can settle (section 7.5). **This is the opposite of the Kernel account**, whose UserOp signature needs a raw 32-byte digest or a `personal_sign` over non-text bytes, both of which PayBox's WalletConnect page refuses ([DPW] section 0, [31]).
5. **A Safe cannot exist on chain 3223 (XO) and must not be proposed there (H).** The XO RPC returns empty code for the Safe factory, singleton, module, setup helper, MultiSend, the Safe deterministic deployer and EntryPoint v0.9, while EntryPoint v0.6/0.7/0.8 and the Kernel factory, implementation and validator are present (section 4.2). XO's bundler advertises only EntryPoint v0.6 and v0.7 ([21] section 6), PayBox's chain list has no 3223 ([06], [DPW]). **One owner therefore has two accounts: the Kernel account on 3223 (existing design, `src/xo/account/derive.ts`) and the Safe elsewhere.** Both derive from the same owner address and do not interfere (a Kernel and a Safe for the same owner coexisted in the fork test).
6. **Recovery is where the PayBox key matters most.** A PayBox MPC key cannot be exported (NOT FOUND, any export or recovery path in the docs read by [06], [25]). Safe owner changes work and keep the address (tested), so the safe pattern is: derive with the PayBox address as the single genesis owner, then before holding more than pocket money add a second independent owner or a guardian recovery module, and record the **genesis parameters** because the address cannot be re-derived from the current owner set (section 5). Owner state is **per chain**: replacing the PayBox key on Base does nothing on Arbitrum until it is repeated there, which is a real divergence risk (section 5.3).
7. **Cost and who bears it.** Derivation costs nothing (pure function). Deployment is lazy: the first UserOp on each chain deploys the Safe (474,685 gas bundle total on the Optimism fork, 424,697 for a second one; later operations 125,000 to 158,000 gas; fork numbers, no L1 data fee, section 7.3). Whoever funds that UserOp pays: the Safe's own native balance, an ERC-20 gas paymaster, or the owner of a Candide gas policy; none of these is free on mainnet and none is operated by the author (section 6).
8. **What to build first for this slice** (section 9): a pure `deriveSafe` function with the golden vectors of section 2.3 and a read-only status ladder (`derived`, `code-present`, `owner-verified`), shown in the account map as a read-only address; no write path, no new flag until the PayBox typed-data live test (section 7.5) has passed.

---

## 1. Method, compliance and limits

- Repo reading: `docs/plan.md` banner, `docs/phase1-gap-closing.md` sections 0 and 9, `docs/aggregation-design.md`, `docs/dapp-design.md`, `docs/dapp-paybox-web.md`, notes `[09]`, `[19]`, `[21]`, `[25]`, `[31]` (signing surface lines), `src/xo/account/derive.ts` (derivation style and error codes to match), `git diff` of the working tree (read only).
- Public docs and metadata fetched (GET, User-Agent `insurance-markets-research/0.1`, at least 0.4 s apart): Candide `docs.candide.dev` `llms.txt` and 16 `.md` pages (S1 to S6), npm registry JSON and tarballs for `abstractionkit@0.4.3` and `permissionless@0.5.0` (read as text, **never executed**; the tarballs were extracted into scratch directories), GitHub raw files of `safe-global/safe-modules` (4337 README, CHANGELOG, `Safe4337Module.sol`, `SafeModuleSetup.sol`, passkey README), GitHub release lists (REST, unauthenticated), EIP/ERC source headers, Opinion SDK docs (three pages).
- Read-only JSON-RPC (`eth_getCode`, `eth_call`, `eth_chainId`; a wrapper script refused every other method) against `ethereum-rpc.publicnode.com`, `polygon-bor-rpc.publicnode.com`, `mainnet.base.org`, `arb1.arbitrum.io/rpc`, `bsc-dataseed.bnbchain.org`, `mainnet.optimism.io`, each on the order of 100 calls from my scripts (not counted exactly), plus the keyless XO RPC `rpc-mainnet-2.xo.market` (22 calls, the same host and rules as [21]). Chain ids were confirmed first (0x1, 0x89, 0x2105, 0xa4b1, 0x38, 0xa).
- **Local forks.** `anvil 0.2.0` forked each of the six chains on `127.0.0.1`; `anvil` itself issued read requests to those public RPCs (hundreds per run, not counted, and not carrying my User-Agent). All transactions of the fork test were sent to the local fork. This executes the public contracts' bytecode locally; it is the same class of act as `eth_call` simulation and is disclosed because the task forbids running third-party *code* (none was cloned or run) and forbids state changes on third parties (none occurred).
- **Deviations to disclose.** (a) One transient `-32005` rate-limit answer from the Polygon public RPC (retried with a longer pause, passed). (b) My first fork run sent the bundle from public Anvil account 9; that address carries an EIP-7702 delegation on mainnets (section 3.4) and the EntryPoint refused to pay it (`AA91`), so later runs used a fresh throwaway key for the local relayer. (c) A negative test (replay with chain id 8453) was vacuous when the fork itself was Base; I fixed the test and re-ran Base (section 7.3). (d) A tiny scratch file was briefly written outside the scratchpad (`/tmp`) while checking two EIP headers and deleted at once. (e) The npm registry JSON contains the package maintainer's contact address; it is not reproduced here.
- Not done on purpose: any PayBox call; any Candide bundler or paymaster POST (so Candide's endpoints are described from docs only); any XO bundler method; any use of a real owner address; reading credential files.
- Third-party content (docs, READMEs, SDK source) is untrusted data; nothing in it was followed as an instruction. No instruction-like text aimed at an AI agent was seen in the pages read, except that Candide's docs promote an installable "skills" bundle for coding agents; it was not fetched or followed.

---

## 2. The derivation specification

### 2.1 Profile S1: what is pinned

All addresses are EIP-55 as published; every one has code on all six chains, with the runtime-code hash below on every chain (H, `eth_getCode` on each chain, keccak computed locally).

| Role | Contract | Address | Code bytes | Runtime keccak (all six chains) |
|---|---|---|---|---|
| Factory | SafeProxyFactory v1.4.1 | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` | 3,054 | `0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317` |
| Singleton | **SafeL2** v1.4.1 | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` | 24,421 | `0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff` |
| 4337 module and fallback handler | Safe4337Module v0.3.0 (EntryPoint v0.7 only) | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | 8,373 | `0x2aea997c4e3cf0e2f333025372e219abcfde81c21fc2f8fb066414a5685dd3e0` |
| Setup helper | SafeModuleSetup v0.3.0 | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | 547 | `0xaf2d170bb766d2773c3fa88717f5b3599827478074d3767d1dee55e5c2f3fbcb` |
| Batch helper (delegatecall) | MultiSend v1.4.1 | `0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526` | 629 | `0x0e4f7fc66550a322d1e7688e181b75e217e662a4f3f4d6a29b22bc61217c4b77` |
| EntryPoint | v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16,035 | `0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58` |
| Deployed Safe proxy (runtime) | SafeProxy 1.4.1 | n/a (per account) | 171 | `0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c` |
| Proxy creation code | `factory.proxyCreationCode()` | n/a | 486 | `0x1856e0ee08399d74e0ea0b03adca210aeade6f748969ac023cdcb4dd62dcaf5f` (same on all six chains) |

Sources: addresses from Candide's deployments page (S1) and AbstractionKit 0.4.3 constants (S7), cross-checked by code reads; module and setup helper also in the Safe changelog ("Version 0.3.0 ... `SafeModuleSetup` at 0x2dd6..., `Safe4337Module` at 0x75cf...", S8). Audits named in the module README: version 0.3.0 by Ackee Blockchain (S8). The module's `SUPPORTED_ENTRYPOINT` is an immutable and the README warns that it "MUST only be used with Safe 1.4.1 or newer" and that use with another EntryPoint is "at your own risk" (H, S8, `Safe4337Module.sol` lines 109 to 125).

Why L2 and not the non-L2 singleton: AbstractionKit's default singleton is SafeL2 v1.4.1 on every chain (S7, `Safe_L2_V1_4_1`), SafeL2 additionally emits events for every state change, which indexers and recovery tooling read (M, Safe design, not re-read), and Candide's documentation lists SafeL2 first (S1). The cost is that the address differs from the one `permissionless` derives by default (section 2.5).

### 2.2 The algorithm (normative)

```
PROFILE_S1.id      = "safe-1.4.1-l2/4337-0.3.0/ep0.7/direct-setup/v1"
SALT_LABEL         = "insurance-markets/safe-aa/v1"
SALT_NONCE         = uint256(keccak256(utf8(SALT_LABEL)))
                   = 0x98fa572c760948ce1dca63c8e383c4db5332955bd5ef9da4cc088e5b16557d3b
                   = 69193866401451581044315082415170016874628850431625711354073741427079736819003

deriveSafe(owners[], threshold):
  1  parse every owner with the strict EIP-55 parser of src/xo/account/derive.ts (all-lowercase ok,
     mixed case must checksum); reject zero address, the sentinel 0x...0001, duplicates, the module,
     the factory, the singleton, and any pinned protocol contract
  2  owners := sort ascending by uint160 value            // order is part of the address (section 2.5)
  3  require 1 <= threshold <= len(owners)
  4  enable      := 0x8d0dc49f ++ abi.encode(address[] [MODULE])            // enableModules(address[])
  5  initializer := 0xb63e800d ++ abi.encode(                                // Safe.setup(...)
                      owners, threshold,
                      to              = MODULE_SETUP,
                      data            = enable,
                      fallbackHandler = MODULE,
                      paymentToken    = 0x0, payment = 0, paymentReceiver = 0x0)
  6  salt        := keccak256( keccak256(initializer) ++ bytes32(SALT_NONCE) )
  7  initCodeHash:= keccak256( PROXY_CREATION_CODE ++ bytes32(uint160(SINGLETON_L2)) )
                    // = 0xe298282cefe913ab5d282047161268a8222e4bd4ed106300c547894bbefd31ee
  8  account     := CREATE2(deployer = FACTORY, salt, initCodeHash)

first UserOperation (EntryPoint v0.7, unpacked form):
  sender = account;  factory = FACTORY
  factoryData = 0x1688f0b9 ++ abi.encode(SINGLETON_L2, initializer, SALT_NONCE)   // createProxyWithNonce
  callData    = 0x7bb37428 ++ abi.encode(to, value, data, operation)              // Safe4337Module.executeUserOp
  (0x541d63c8 = executeUserOpWithErrorString is the variant AbstractionKit uses by default)
```

`PROXY_CREATION_CODE` is the 486-byte constant returned by the factory (hash above); pin it in code and assert its hash, so derivation needs no network. The strict parser, error codes (`invalid_address`, `zero_owner`, `protocol_contract_owner`, `account_mismatch`, `account_is_owner`) and the rule "never accept an account address from outside without comparing it to the derivation" ([AD] AD1) carry over unchanged from the Kernel module. Index 0 only (one primary account per owner set), as for Kernel ([AD] AD9); an index scheme can be added later as `keccak256(SALT_LABEL ++ "/" ++ k)`.

Properties verified on-chain or by fork (section 7): the owner set and threshold are inside the salt (changing either changes the address); owners must be canonically ordered or two parties derive different addresses; `createProxyWithNonce` is permissionless but, because the owners are inside the hashed initializer, a third party can only ever deploy *your exact configuration*, never a variant at your address.

### 2.3 Golden vectors (public Anvil accounts only)

Owners: `A0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, `A1 = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, `A2 = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (mnemonic indexes 0 to 2 of the public `test test ... junk` phrase). "sim" = `eth_call` of `createProxyWithNonce(SINGLETON_L2, initializer, saltNonce)` from an arbitrary sender on each chain; it returned the offline address on **every** chain (Ethereum, Polygon, Base, Arbitrum, BNB, Optimism) unless marked.

| # | Owners | Threshold | saltNonce | Safe address | sim on 6 chains |
|---|---|---|---|---|---|
| V1 | [A0] | 1 | `SALT_NONCE` | `0x9A8980Ff99330c8410AfECc9A0E29ADdb61D9A4C` | 6 of 6 |
| V2 | [A1] | 1 | `SALT_NONCE` | `0x92A0E034402A0F9c2dcc86df571D47899Ab87868` | 6 of 6 |
| V3 | [A0, A1] | 1 | `SALT_NONCE` | `0xFd4F73f100fbC8695DFBaEaBA557798ea7e9A07C` | 6 of 6 |
| V4 | [A0, A1] | 2 | `SALT_NONCE` | `0x2cdbBce291F4eE7E48f9b518210a6E642A059bdd` | 6 of 6 |
| V5 | [A1, A0] (not sorted) | 2 | `SALT_NONCE` | `0x0fAfDc9697648781fD4F477A9160f60530A0201c` | 6 of 6; **must never be produced** (step 2 sorts) |
| V6 | [A0, A1, A2] | 2 | `SALT_NONCE` | `0x077c49cF87F948861A4db866D655C91cb60FdfD0` | 6 of 6 |
| V7 | [A0] | 1 | 0 (AbstractionKit default) | `0xFD8A78aE7924A1097C048672da0C131dC5e68C01` | 5 of 6; on Base the address **already has a deployed Safe** (`Create2 call failed`), see section 2.4 |
| V8 | passkey `G` only (profile S1-P, section 3.3) | 1 | `SALT_NONCE` | `0x878d9e5405236584457F3e1Ada3661F97Fe6a7bB` | 6 of 6 |
| V9 | passkey `G` + A0 | 1 | `SALT_NONCE` | `0x40bB3cb083D833451103d36585BBD90caa678541` | 6 of 6 |

`G` is the public P-256 base point (a stand-in public key whose private key is the public number 1: it has no security and must never receive funds). V1 to V6 and V7 were reproduced by three methods: my viem script, a `cast`-only recipe (section 7.1), and AbstractionKit's own constants (`singletonInitHash` for SafeL2 1.4.1 `0xe298282c...fd31ee` equals my computed `initCodeHash` exactly; for SafeL2 1.5.0 `0x1b94aebb...a881` also equals the computed value) (H, S7). The Kernel address of the same owner `A0` is `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` (matches [19]); `eth_call` of the canonical Kernel factory's `getAddress(initData, 0)` returned it on all six chains, and `implementation()` returned `0xBAC849bB...4b4D` on all six (H), which closes `T-AA3` of [25].

### 2.4 A live Safe at a derived address (on-chain proof, not only simulation)

On Base, V7 `0xFD8A78aE7924A1097C048672da0C131dC5e68C01` is deployed (someone deployed it for the public test key; proxy runtime 171 bytes, hash as in section 2.1). Reads (H, `eth_call`/`eth_getStorageAt`): `getOwners()` = `[0xf39F...2266]`, `getThreshold()` = 1, `VERSION()` = "1.4.1", `isModuleEnabled(0x75cf...c226)` = true, `getModulesPaginated` = exactly that one module, storage slot 0 (singleton) = `0x29fcB43b...C762` (SafeL2), fallback-handler slot `0x6c9a6c4a...18d5` = `0x75cf...c226`. On Polygon the `permissionless`-default address for the same owner (`0x124Ef647181eda69861b61596802129E3B018765`) is also deployed, owned by the same test key, singleton = the non-L2 Safe `0x41675C09...461a`. These accounts are controlled by a **publicly known private key**; anyone can move whatever they hold. Never fund them.

### 2.5 The same owner, five different Safe addresses (SDK-default divergence)

Owner `A0`, threshold 1, saltNonce 0 (H, offline computation, each one then confirmed by the factory simulation on six chains, except where the address is already deployed on that chain: Base for the first row, Polygon for the second):

| Variant | What differs | Address |
|---|---|---|
| AbstractionKit `SafeAccountV0_3_0` defaults (profile S1 except the salt) | baseline | `0xFD8A78aE7924A1097C048672da0C131dC5e68C01` |
| `permissionless@0.5.0` `toSafeSmartAccount` defaults | non-L2 singleton `0x41675C09...`, and the setup is wrapped in `MultiSend.multiSend(...)` (`useMultiSendForSetup = true`) so the `to`/`data` fields differ | `0x124Ef647181eda69861b61596802129E3B018765` |
| AbstractionKit initializer with the non-L2 singleton | singleton only | `0x08eA90D108291a05830B25E8eFaF027979dEb8D1` |
| AbstractionKit `SafeAccountV1_5_0_M_0_3_0` | SafeL2 1.5.0 `0xEdd160fE...C7e` via the 1.4.1 factory | `0x2E238397cc949440387524e0588828ffedFFfbDB` |
| AbstractionKit `SafeMultiChainSigAccountV1` ("unified", EntryPoint v0.9) | module and fallback handler `0x22939E83...EAd` | `0x97A67Fc283eA89f415e06b0b894B67A35AAb99a3` |

Sources for the defaults: `abstractionkit@0.4.3` `dist/index.mjs` (classes `SafeAccount`, `SafeAccountV0_3_0`, `SafeAccountV1_5_0_M_0_3_0`, `SafeMultiChainSigAccountV1`; S7) and `permissionless@0.5.0` `accounts/safe/toSafeSmartAccount.ts` (S9); both read as text, not executed. Sensitivity to the other inputs (AbstractionKit baseline, saltNonce 0): `[A0]`=`0xFD8A...8C01`, `[A1]`=`0xe7a9D4D8...259F`, `[A0]` with saltNonce 1 = `0x51C239Fa...520e`, `[A0,A1]` t1 = `0x8d5490dF...06CE`, `[A1,A0]` t1 = `0x044cE7bA...d3c2`, `[A0,A1]` t2 = `0xcCA8cC87...46E4` (H). Consequences: pin the profile in the registry row and in the UI ("this is a Safe L2 1.4.1 + 4337 module 0.3.0 account derived for these owners"); never let a library's default decide; never accept a pasted address that does not re-derive from stored genesis parameters unless it passes the import checks of section 5.5.

### 2.6 Pitfalls found, with evidence

| # | Pitfall | Evidence | Rule |
|---|---|---|---|
| P1 | SDK defaults change the address (section 2.5) | H, offline plus 6-chain simulation | Pin profile S1; test every release against the golden vectors |
| P2 | Owner order and threshold are in the address | H (V3 vs V5, V3 vs V4) | Sort ascending before hashing; store `threshold` with the genesis |
| P3 | **Genesis parameters are not recoverable from current state.** After `addOwner`/`removeOwner` the address is unchanged (fork test) but deriving from the *current* owners gives a different address | H (fork: Safe kept its address through three owner changes) | Persist `{profile, owners (sorted), threshold, saltNonce}` per account in the local registry; also recoverable from the deployment transaction's `setup` calldata (M, the `SafeSetup` event also exists in `Safe.sol`, not re-read) |
| P4 | A third party can deploy your Safe on any chain, at their gas cost, with exactly your configuration | H (`createProxyWithNonce` simulated from an unrelated sender) | Harmless; do not treat "is deployed" as "the user acted" |
| P5 | Counterfactual funding is safe only where all five contracts have code | H: present on all six chains; absent on 3223; Candide lists exceptions on some of its 14 chains (S1) | Never show a deposit address until `code-present` for the *factory, singleton, module, setup helper* on that chain **and** the account is derived (the rule of [25] section 5.3 and [P1] A11 extended); the funds stay recoverable because the initializer is in the salt (no Nexus-style pre-deployment hijack, M) |
| P6 | Module and EntryPoint are coupled: Safe4337Module 0.3.0 accepts only EntryPoint v0.7; module 0.2.0 only v0.6; the unified module only v0.9 | H (S8 changelog, `SUPPORTED_ENTRYPOINT` immutable, S1, S7) | One profile per EntryPoint; the unified module is not part of S1 |
| P7 | **Signature encoding.** `v` must be 27 or 28; a signature with `v` = 0 or 1 is rejected with `AA24` (Safe reads `v` 0 as a contract signature and 1 as an approved hash); with several owners the 65-byte signatures must be concatenated in **ascending owner address** order (descending was rejected with `AA24`); the 12-byte `validAfter/validUntil` prefix is mandatory | H (fork test, section 7.3) | Normalise `v` (add 27 when 0/1) before use; sort; recover the signer locally from each signature and compare to the intended owner before sending ([21] section 5 rule) |
| P8 | `eth_sign`-style signatures (`v` + 4) are a Safe feature but `personal_sign` over 32 raw bytes is exactly what PayBox's WalletConnect page refuses | H for Safe semantics (S8 source), M for PayBox ([DPW]) | Use typed data only |
| P9 | A signed `SafeOp` covers `initCode`, `callData`, gas, paymaster data, `validAfter/validUntil` and the EntryPoint address; the domain carries `chainId` and the module address, so a signature is not replayable across chains | H (S8 source: domain typehash `0x47e79534...9218` and `SAFE_OP_TYPEHASH 0xc03dfc11...ea7f`, both of which my type strings reproduce; fork test: cross-chain `SafeMessage` replay rejected) | Keep rule T8 of [25]: refuse any typed data whose domain lacks `chainId`. **The unified module's Merkle-root typed data deliberately has no `chainId`** (S5), so it conflicts with T8 and is excluded from S1 |
| P10 | Owner-changing and module-changing calls are ordinary UserOps that the owner key can sign | H (fork: `addOwnerWithThreshold` through `executeUserOp` with `to = the Safe`) | Classify as "dangerous": a prepared item whose `to` is the Safe itself, or whose `operation` is 1 (delegatecall) to anything but the pinned MultiSend, or whose selector is `enableModule`, `disableModule`, `setFallbackHandler`, `setGuard`, `setModuleGuard`, `changeThreshold`, `addOwnerWithThreshold`, `removeOwner`, `swapOwner`, must carry an explicit warning and never be auto-prepared by the agent (design D, not tested) |
| P11 | Undeployed Safes cannot satisfy venue ERC-1271 checks (same finding as [19] section 7.1 for XO: no ERC-6492 unwrap in such exchanges); the Safe module has no ERC-6492 handling either | H for XO, M for Safe | Deploy on first use before the first signed off-chain order on that chain |
| P12 | **The public Anvil accounts are live targets**: all three used here carry an EIP-7702 delegation indicator (`0xef0100...`, the same delegate address) on all six chains, and live Safes owned by them exist on Base and Polygon | H (`eth_getCode` on 6 chains) | Test plans use them only on local forks; never send mainnet funds to them or to accounts they own |
| P13 | AbstractionKit changes quickly (11 npm releases from 0.3.1, 2026-04-18, to 0.4.3, 2026-10-06, inclusive; latest is 14 days old at this writing; the registry record shows no provenance attestation for 0.4.3) | H (S7 registry JSON) | Do not make it a runtime dependency of derivation (D3) |
| P14 | The unified module repository is young and unlicensed: `candidelabs/safe-4337-multi-chain-signature-module` created 2026-01-16, 3 stars, license field null, one Nethermind audit report linked from Candide's docs (NM-0874) | H (S10 REST metadata, S5) | No dependency on it for S1; revisit after a licence and a longer track record |

### 2.7 Per-chain presence matrix (H)

Columns: code present with identical runtime hash (Y), absent (-). "L" = Ethereum, Polygon, Base, Arbitrum, BNB, Optimism (all six identical per row unless noted); "3223" = XO chain, probed with the keyless XO RPC.

| Contract | Six chains | 3223 |
|---|---|---|
| SafeProxyFactory 1.4.1, SafeL2 1.4.1, Safe 1.4.1, CompatibilityFallbackHandler 1.4.1, MultiSend 1.4.1, MultiSendCallOnly 1.4.1 | Y | - (factory, SafeL2, Safe, handler, MultiSend probed; MultiSendCallOnly not probed) |
| SafeProxyFactory 1.5.0, SafeL2 1.5.0, Safe 1.5.0 | Y | factory 1.5.0 `-`; singletons not probed |
| Safe4337Module 0.3.0, SafeModuleSetup 0.3.0, Safe4337Module 0.2.0 (EP v0.6) | Y | module 0.3.0 and setup helper `-`; module 0.2.0 not probed |
| Safe4337MultiChainSignatureModule (EP v0.9) | Y | - |
| Passkey: SafeWebAuthnSharedSigner v0.2.0 and v0.2.1, SignerFactory v0.2.1, DaimoP256Verifier | Y | shared signer 0.2.0 and Daimo `-`; others not probed |
| Candide Social Recovery Module (3, 7, 14 day variants: three different hashes, each identical across the six chains) | Y | 3-day variant `-` |
| Safe Allowance Module v1.0.0 | Y on five; **absent on BNB** (matches S1) | not probed |
| CandidePaymaster V3 for EP v0.7 | Y | not probed |
| EntryPoint v0.6, v0.7 | Y (identical) | Y (23,689 and 16,035 bytes) |
| EntryPoint v0.8 | Y (6 different hashes, same length 21,738) | Y (21,738 bytes) |
| EntryPoint v0.9 | Y (6 different hashes, same length 22,425) | **-** |
| Kernel v3.1 factory, ECDSA validator | Y (989 and 1,819 bytes, identical) | Y |
| Kernel v3.1 implementation | Y (22,784 bytes, 6 different hashes; per [19] the difference between two chains is the cached domain separator and chain id) | Y |
| Safe singleton factory `0x914d7Fec...43d7` (Safe's own deterministic deployer) and Arachnid deployer `0x4e59b448...956C` (both 69 bytes, same code) | Y | Arachnid Y; **Safe singleton factory `-`** |
| Safe family overall on 3223 | n/a | none of the 13 Safe-family probes (plus EntryPoint v0.9) had code |

The absent Safe singleton factory on 3223 matters beyond the missing contracts: Safe publishes its contracts through that deployer so that addresses are identical on every chain; deploying the Safe family on 3223 through the Arachnid deployer (which is present) would produce *different* factory and singleton addresses, hence different account addresses, and still require native XO that an outsider cannot obtain ([21] section 6).

---

## 3. Owner types the dApp can support, and what each can sign

### 3.1 What the Safe needs from an owner

| Use | What the owner signs | Primitive | Notes |
|---|---|---|---|
| UserOperation (any on-chain action, including deployment) | EIP-712 `SafeOp` | `eth_signTypedData_v4` | domain `{chainId, verifyingContract = module}` (no `name`, no `version`); message fields: `safe, nonce, initCode, callData, verificationGasLimit(uint128), callGasLimit(uint128), preVerificationGas, maxPriorityFeePerGas(uint128), maxFeePerGas(uint128), paymasterAndData, validAfter(uint48), validUntil(uint48), entryPoint`. Signature field = `validAfter(6) ++ validUntil(6) ++ 65-byte ECDSA` per owner, sorted. H (S7 `EIP712_SAFE_OPERATION_V7_TYPE`, S8 source, fork test) |
| Off-chain ERC-1271 message (a venue order digest, a login message) | EIP-712 `SafeMessage(bytes message)` where `message` is the 32-byte hash | `eth_signTypedData_v4` | domain `{chainId, verifyingContract = the Safe}`; `isValidSignature(bytes32,bytes)` returned `0x1626ba7e` for the owner, reverted for a non-owner and for a domain with another chain id. H (fork test; the module inherits the Compatibility Fallback Handler, S8 source line 24) |
| Owner management, module management | a `SafeOp` whose `callData` targets the Safe | same | tested for add, remove, threshold change |

Contrast with the Kernel account (H, [19] section 7, [21] section 5): a Kernel UserOp is signed over the raw 32-byte `userOpHash` (raw digest or EIP-191 over the 32 bytes); there is no typed-data path for UserOps, and the order signature wraps the order digest in `Kernel(bytes32)` with chain id 3223. So **a typed-data-only signer can drive a Safe fully, and can drive a Kernel account on other chains not at all.**

### 3.2 Owner kinds

| Owner kind | Reaches the dApp via | Can it sign `SafeOp` / `SafeMessage`? | Verdict and caveats |
|---|---|---|---|
| **PayBox EVM wallet, WalletConnect route** | the PayBox web app's WalletConnect page ([DPW] route F; shipped code, never run) | **Yes in principle**: `eth_signTypedData_v4` on ten chains (1, 10, 56, 137, 999, 4663, 5042, 8453, 42161, 43114), which includes every chain of this note; typed data whose `domain.chainId` differs from the session chain is refused (that is the same property as rule T8). Refused: raw digests, transactions, `personal_sign` of non-UTF-8 bytes, chain 3223 ([DPW], [31]) | M: **NOT TESTED** (never run for this project). Open points: does PayBox accept a domain with only `chainId` and `verifyingContract` (no `name`)? what `v` does it return? what does the approver see (the preview is "Typed data for <domain name>", [DPW]) when `name` is absent? The grant it creates is `autonomous` (H[B] in [DPW]), so see section 5.4 for the consequence |
| **PayBox, agent route** (`request_wallet_sign`, `typedData` intent) | the user's own PayBox-connected agent, or the Cockpit daemon as PayBox client ([DD] section 3.3) | Yes: the intent takes a viem `TypedDataDefinition`; no domain or chain allowlist was found in docs, schema or SDK ([25] section 2.2) | M; chain-id acceptance for the six chains is covered by the catalog (all six are PayBox chains) |
| **PayBox, OAuth/BFF route** | [DPW] route B1 | would carry everything the API accepts | NOT TESTED; not needed for Safe |
| **Injected EIP-1193 wallet** (MetaMask, Rabby, Coinbase Wallet, hardware wallets behind them), discovered through EIP-6963 | browser; EIP-6963 "Multi Injected Provider Discovery" and EIP-1193 are both Final (S11) | Yes: `eth_signTypedData_v4` is universal. Hardware wallets show hashed `bytes` fields, so the user sees hashes, not the call (M) | Standard path; recover the signer locally and compare to the selected owner; refuse if different |
| **WalletConnect (any wallet)** | pairing URI | Yes if the wallet supports `eth_signTypedData_v4` (all that the dApp needs) | Same checks; chains must be in the session |
| **Passkey (WebAuthn, P-256)** via the Safe passkey signer | browser WebAuthn | Yes through the shared-signer pattern: the owner address inside the Safe is `SafeWebAuthnSharedSigner` and the public key `(x, y)` plus the verifier configuration are written to the Safe's storage by a delegatecall in `setup` (S7 `createBaseInitializerCallData`, WebAuthn branch). The passkey vectors V8 and V9 deployed in simulation on all six chains (the `setup` ran against the real shared signer). **The P-256 precompile at `0x...0100` answers a valid signature with 1 and a corrupted one with empty output on all six chains** (H, `eth_call`), and the Daimo verifier contract exists as fallback | Signature verification itself was **not tested** (no browser). Pitfall: a WebAuthn credential is bound to its relying-party id (the page's registrable domain); a passkey created on one origin cannot sign on another (standard WebAuthn behaviour, M), so a static client served from a changeable origin or from `localhost` creates recovery risk. Only one passkey can be an owner in the `setup` call, and it must be first (S7 source) |
| **Locally held hot key** (the Cockpit daemon's session or recovery key) | the daemon | Yes (signs typed data or a hash) | Same as any ECDSA owner; custody is the user's own machine |
| **EIP-7702-delegated EOA as owner** | any | Yes: Safe verifies owners by `ecrecover`, not by `extcodesize`; in the fork test the three owner keys carry a 7702 delegation (copied from the real chain state) and everything passed | H. A PayBox wallet that the swap flow left delegated ([25] section 2.5) is therefore still a valid owner. Whether a PayBox address currently has code is `T-AA2`, not checkable without the address |
| **Contract wallet as owner** (a Safe, a Kernel, a Coinbase Smart Wallet) | n/a | Safe supports contract signatures (`v` = 0 with a dynamic part) but the 4337 module enforces a signature-length check (`_checkSignaturesLength`, S8 source) | Out of MVP; NOT TESTED |
| Solana wallets | n/a | No: different curve and a separate PayBox credential ([25] section 3 iv-c) | Not an owner type |

### 3.3 Passkey profile S1-P (optional, not part of the base profile)

Same factory, singleton, module and setup helper as S1, with the passkey as owner and these pins: shared signer v0.2.1 `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` (2,954 bytes), P-256 precompile `0x0100`, fallback verifier DaimoP256Verifier `0xc2b78104907F722DABAc4C69f826a522B2754De4`; the setup is `MultiSend[ delegatecall SafeModuleSetup.enableModules([module]), delegatecall sharedSigner.configure((x, y, uint176(precompileLow16 ++ verifier))) ]` (the `configure` selector `0x0dd9692f` matches S7). Vectors V8 and V9 above were computed this way. The `WebAuthn` module family had a critical bug fixed in an earlier signer version ([25] section 5.2 quotes ZeroDev's constants file for the Kernel WebAuthn signer; the Safe passkey module is a different code base, M), so a passkey owner should be a **second** owner next to the PayBox key, not the sole one, until the passkey path has been exercised in a browser.

### 3.4 One finding about "test" owners

The three public Anvil addresses carry the same EIP-7702 delegation indicator on all six chains (`0xef0100` followed by one delegate address ending `...e408a`; H, `eth_getCode`). I did not characterise the delegate. It is a reminder that anything sent to a well-known test key on mainnet is gone within moments, and that "owner has code" is a normal state that the derivation must not reject.

---

## 4. Relation to the existing Kernel account, to XO and to the local plugin

### 4.1 Two accounts per owner

```
owner E  (PayBox EVM address, or any EVM address)                    one address, every chain
  |- Kernel v3.1 account K(E)   = CREATE2(KernelFactory, keccak256(initData(E)||0), ...)    [19]
  |     same address on every chain where the factory exists (verified on the six chains above and 3223)
  |     USED ONLY ON 3223 (XO). On any other chain K(E) is a reserved address: do not display as a deposit target.
  '- Safe S(E, t) = CREATE2(SafeProxyFactory, keccak256(keccak256(init)||SALT_NONCE), ...)   (this note)
        same address on every chain where the five Safe contracts exist (verified on the six)
        NEVER on 3223.
```

Rules for the account map ([25] section 8.1 registry entry, extended):

- R1. A registry row is `{venue_or_role, chain, accountType: "kernel-3.1" | "safe-s1" | "safe-s1p" | ..., address, derivation: "factory-pure-function", genesis: {profile, owners, threshold, saltNonce}, status: "derived" | "code-present" | "owner-verified" | "unverified", evidence}`.
- R2. `K(E)` rows exist for chain 3223 only; `S` rows exist for EVM chains whose presence matrix (section 2.7) is green; a Safe row on 3223 is invalid.
- R3. A Safe is **never** the trading account of a venue that forces another type: XO needs the Kernel account ([19]); Polymarket new accounts need the Deposit Wallet ([25] section 4.1); PancakeSwap prediction rejects contract callers ([25]); Hyperliquid's account is the signer; Quotient's x402 payer must be a plain EOA. A Safe is an *optional smart wallet in front of EVM actions that do not care who the caller is*, and positions bought through it live in the Safe, invisible to EOA-based views ([25] section 4.1, Trueo row).
- R4. Opinion's SDK documentation (read this session, S12) describes `multi_sig_addr` as "Same as signer (EOA holds funds)" **or** a Gnosis Safe v1.3.0 created through `GnosisSafeProxyFactory` `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` on BNB Chain (3,774 bytes of code there, H), with signature type 2 for the Safe case. So Opinion's venue Safe is a **different Safe version and factory** from S1, and whether Opinion's backend or contracts accept an arbitrary 1.4.1 + 4337 Safe as its funder is **NOT FOUND**; by analogy with Polymarket's exchange design, in which the Safe signature type validates against a factory-derived address (M, [19] section 7.1 notes the `Registry` mixin), the answer is probably no. This refines [25] ("Opinion needs its Safe"): the docs also show an EOA configuration. Predict.fun accepts an EOA or its own "Predict account" (Kernel-based per [09] gate 3), not S1 (M).
- R5. **Where a Safe genuinely helps this project**: (a) the funding source on Base for the Hyperlane warp route to the Kernel account on 3223 ([20] section 0), because the Safe can batch approve + transfer in one signature and the route is permissionless at contract level (M, unverified for a contract sender; test on a fork before relying on it); (b) gas-sponsored or ERC-20-gas batches on Polygon/Base/Arbitrum/BNB for contract-call-only venues; (c) a second-owner or guardian policy that *is* enforced on-chain (section 5.4). It does not create cross-chain balance: the same address on six chains is six separate balances, and moving value between them is still CCTP, a bridge or the venue's route ([25] section 7.3: "the dApp sums per-chain read balances; it never moves value between chains on its own").

### 4.2 Why a Safe on 3223 is impossible (evidence)

H, keyless XO RPC `eth_getCode` at `latest`, run after `eth_chainId` returned `0xc97` (3223) and with positive controls in the same batch:

| Probe | Result |
|---|---|
| Positive controls: Arachnid CREATE2 deployer, EntryPoint v0.6, v0.7, v0.8, Kernel factory, Kernel implementation, Kernel ECDSA validator | code present (69; 23,689; 16,035; 21,738; 989; 22,784; 1,819 bytes) |
| Safe: SafeProxyFactory 1.4.1, SafeL2 1.4.1, Safe 1.4.1, CompatibilityFallbackHandler, MultiSend 1.4.1, SafeProxyFactory 1.5.0 | no code |
| Safe4337Module 0.3.0, SafeModuleSetup 0.3.0, Safe4337MultiChainSignatureModule | no code |
| Safe singleton factory `0x914d7Fec...`, EntryPoint v0.9 | no code |
| Passkey shared signer 0.2.0, DaimoP256Verifier, Social Recovery module (3-day) | no code |

Plus: XO's bundler advertises EntryPoint v0.6 and v0.7 only ([21] section 6); PayBox's chain catalog and its WalletConnect chain list do not contain 3223 ([06] section 5, [DPW]); native XO is needed to deploy anything and no way for an outsider to get it was found ([21] section 6); the XO orderbook registers *its* accounts ([19] section 6). A Safe on 3223 would need us to deploy third-party contracts at non-canonical addresses, which the binding decision "no new wallet contracts written by us" does not forbid in letter but which no bundler, PayBox signing path or XO door supports. **Verdict: not feasible; do not design for it.**

### 4.3 Relation to the local plugin, relay and Cockpit daemon

- The Safe path belongs to the **local mode and the static client only**. Nothing in it needs the author-operated relay, and nothing may be added there (no signing key, no bundler key, no Candide account of the author).
- Where it plugs in (design, not built, nothing in `src/` was touched): a pure module beside `src/xo/account/derive.ts` that exports the same shapes (`parseOwner`, `deriveSafe`, `describeSafe`, `requireDerivedSafe(owners, threshold, supplied?)` with the same error codes), plus a state function analogous to `src/xo/account/state.ts` (`derived` -> `code-present` -> `owner-verified`).
- Prepared-item invariants of [P1] section 5.4 carry over: the daemon builds the `SafeOp`, stores the digest tag, returns the typed-data intent for the owner to sign; `submit` takes only the prepared id and the signature, **recomputes the EIP-712 hash, recovers the signer for every signature, compares to the stored owner set, checks ascending order and `v` in {27, 28}, and only then calls a bundler**; one send per prepared item; ambiguity is reconciled, never resent.
- Flags: a Safe submit path is a new write path and gets its own flag, default OFF, **separate from** the seven existing flags; none of them is changed or armed by this note. Until the PayBox typed-data live test of section 7.5 passes, the Safe module ships read-only (derive, display, status).
- The Safe `owner-verified` check for a pasted or imported address (section 5.5) is a read-only function suitable for the static client (public RPC `eth_getCode`/`eth_call`/`eth_getStorageAt`, no key).

---

## 5. Recovery, owner change, multi-owner, and the non-exportable PayBox key

### 5.1 Owner changes keep the address (H, fork)

Sequence on a fork of each chain: deploy S(A0, t=1); `addOwnerWithThreshold(A1, 1)` signed by A0; A1 alone signs an action (accepted); `addOwnerWithThreshold(A2, 2)` signed by A1 (now 2-of-3); one signature rejected (`AA24`); two signatures in ascending order accepted, descending rejected; `removeOwner(A0)` (the "lost key") signed by A1 and A2; a signature by the removed A0 no longer counts. The account address never changed; `getOwners()` after the sequence was `[A2, A1]`. Gas (Optimism fork, whole bundle transaction): add owner 153,262 and 157,557; transfer with a different signer 124,958; two-signature transfer 132,054; remove owner 137,491.

### 5.2 Configurations, honestly compared

| Configuration | What it protects against | What it costs | Fit |
|---|---|---|---|
| 1-of-1 [PayBox] | nothing beyond PayBox's own controls | simplest; a lost or locked-out PayBox key strands the funds; **a compromised `autonomous` WalletConnect grant can sign anything** ([DPW]) | acceptable only for pocket-money balances, with the screen saying so |
| 1-of-2 [PayBox, second key] | loss of either key (liveness) | **security equals the weaker key**: either key alone can spend | recovery-oriented; do not call it protection |
| 2-of-2 [PayBox, local hot key in the daemon] | a compromised PayBox grant alone cannot spend; a stolen daemon key alone cannot spend | every action needs both; the agent can only act while the daemon is armed; losing either key strands funds unless a recovery module exists | the only configuration in this note with an **on-chain** guarantee (an attacker needs both keys). It is an ownership guarantee, not a spending cap: with both keys the attacker spends everything |
| 2-of-3 [PayBox, passkey/hardware, local key] | any one key lost or stolen | three custody points; needs the passkey path to be proven | best long-term default once proven |
| 1-of-1 [PayBox] + Social Recovery Module | lost PayBox key (guardians replace it after a grace period); a compromised key is *not* stopped (the attacker acts immediately; recovery can only replace the key afterwards) | guardians to find; module must be enabled **on every chain separately**; grace period 3, 7 or 14 days | good for loss, weak for theft |

### 5.3 State is per chain: replacing the PayBox key on one chain does nothing on the others (M, from Safe's design; H that the address is shared)

The same Safe address on Base and on Arbitrum are two independent contracts with independent owner lists. If the PayBox key is compromised and the user replaces it on Base but not yet on Arbitrum, the old key still controls the Arbitrum account. Requirements: the dApp lists `getOwners()`/`getThreshold()` for every chain where the address has code and flags divergence; "replace owner" is a per-chain checklist; the fastest first response to suspected compromise is to move funds, not to rotate ([25] T5: revocation races the key). Candide's "Safe Unified Account" signs one Merkle root that covers an owner change on every chain with one signature (S5, S6), which solves exactly this, but it uses EntryPoint v0.9, a chain-agnostic typed-data domain and a young unlicensed module (P9, P14), and shows the approver only a root hash. Not in S1.

### 5.4 What happens when the owner is a PayBox MPC key that cannot be exported

| Event | Effect on the Safe | Recoverable? |
|---|---|---|
| Normal operation | The Safe only sees ECDSA signatures from the PayBox address; no key export is needed | n/a |
| PayBox account lost (passkey lost, locked out) | the MPC key cannot sign | only if another owner or a guardian recovery path exists; otherwise funds are stranded. No documented PayBox key recovery or export was found (NOT FOUND, searched [06], [25] section 2.1, the docs pages cited there) |
| PayBox service unavailable or discontinued | same | same; PayBox is non-custodial MPC but depends on its own service to sign (M) |
| PayBox grant compromised (agent or WalletConnect `autonomous` session) | attacker can have typed data signed within the grant; caps are advisory ([25] T2) | only by a threshold above 1 with an independent second owner (section 5.2) |
| Migration off PayBox | `addOwner(new)` then `removeOwner(PayBox)`, signed by PayBox while it works, or by the remaining owners, or by guardians | yes if done before the loss |

The honest summary: **a non-exportable owner key is fine as one owner, wrong as the only owner.** The Safe lets a non-exportable key be one signer among several, which is something the Kernel account with its single ECDSA validator cannot do (the deployed validator has no `transferOwnership` and one validator slot per account, [19] section 7.2, [25] section 6.3).

### 5.5 Importing or re-attaching an existing Safe (read-only checks)

For a pasted address on chain C, status `owner-verified` requires all of: (1) `eth_getCode` hash equals the SafeProxy runtime hash of section 2.1; (2) storage slot 0 equals `SINGLETON_L2` (or another pinned singleton, shown as such); (3) fallback-handler slot `0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5` equals `MODULE`; (4) `isModuleEnabled(MODULE)` is true; (5) `getOwners()` contains the connected wallet; (6) `getThreshold()` and the owner list are shown to the user, with any module other than `MODULE` listed. Derivation from stored genesis is checked separately; a mismatch is shown as "imported, not derived". This is the same discipline as `requireDerivedAccount` for Kernel and catches accounts that were changed elsewhere (a Safe at salt 0 may already be used by other apps, which is why D2 uses a dedicated salt).

---

## 6. Candide, bundlers and gas as they touch derivation (short; the sibling notes carry the detail)

- Candide's public endpoints are `https://api.candide.dev/public/v3/{chainId}` for bundler and paymaster, no API key, per-IP rate limit, "available on mainnets and testnets" (H, docs S2, not probed by me). Its mainnet list includes all six chains of this note (Ethereum, Polygon, Base, Arbitrum, BNB Smart Chain, Optimism) plus Avalanche, Celo, Gnosis, HyperEVM, Plasma, Somnia, Tempo and Worldchain (S3). Chain 3223 and SX Rollup 4162 are not listed.
- **Gasless is not free and the author does not provide it.** Sponsorship comes from gas policies created in Candide's dashboard and funded with native tokens; a *public* policy is one that "dApps" set up for wallet use; a wallet without a matching public policy needs a private policy id from its own dashboard account (S4, S6). Candide's billing page: "Gas is passed through at cost", sponsored operations are paid from the policy's deposit, paid plans include a number of sponsored operations and charge a flat per-operation fee beyond that, the Starter plan needs no card and includes a limited number of mainnet UserOps, after which mainnet access pauses (S13). The ERC-20 gas paymaster lists, for BNB Smart Chain, DAI (Binance-Peg), BSC-USD and USDC (Binance-Peg); for Base, DAI, USDC, USDS and USDT; for Arbitrum, DAI, EURe, USDC, USDT and XAU0 (S14, "availability can vary by API key"). Who bears the cost therefore is: the user's own Safe balance, the user's own Candide account and policy, or a dApp operator with a funded policy; with "nothing the author operates", the first two are the only options.
- Candide currently recommends `SafeMultiChainSigAccountV1` (EntryPoint v0.9) for new examples (S5). S1 deliberately stays on `SafeAccountV0_3_0` (EntryPoint v0.7): same EntryPoint version and UserOp shape as the existing XO tooling, an audited module version (Ackee, S8) and the widest bundler support; the cost is that we are not on Candide's newest path. Revisit after P14 changes.
- AbstractionKit supply facts (S7): MIT, 0.4.3 published 2026-10-06, runtime dependencies `@noble/curves` and `@noble/hashes` only, no npm provenance attestation in the registry record, source map shipped. Its docs say typed-data-only external signers are accepted "since v0.3.8" by `SafeMultiChainSigAccountV1` and the 7702 account classes; for `SafeAccountV0_3_0` the docs page does not say, but its static `getUserOperationEip712Data` returns the domain, types and message that any typed-data signer needs (S7, S15), which maps one-to-one onto PayBox. Decision D3 keeps it out of the derivation path; it may be used as a pinned test oracle once a version at least three months old (0.3.8, 2026-05-17) is shown to reproduce the golden vectors.

---

## 7. Test plan (public Anvil keys only) and what I ran

### 7.1 Offline vector tests (no network)

- T-S1: `deriveSafe([A0],1)` etc. equals V1 to V6, V8, V9; `deriveSafe([A1,A0],2)` equals V4 (sorting), never V5.
- T-S2: asserts on pinned constants: `keccak256(PROXY_CREATION_CODE)` = `0x1856e0ee...caf5f`, `initCodeHash` = `0xe298282c...fd31ee`, selectors `0xb63e800d`, `0x8d0dc49f`, `0x1688f0b9`, `0x7bb37428`, EIP-712 type hashes `0x47e79534...9218` and `0xc03dfc11...ea7f` (recomputed from the type strings; I confirmed both equal the contract constants).
- T-S3: negative: zero owner, sentinel `0x...01`, duplicate, mixed-case bad checksum, owner = module/factory/singleton, threshold 0 or above n.
- T-S4 (independent cross-check anyone can run with Foundry only): the `cast` recipe I used: `cast calldata "enableModules(address[])" "[MODULE]"`, `cast calldata "setup(address[],uint256,address,bytes,address,address,uint256,address)" "[OWNERS]" T MODULE_SETUP ENABLE MODULE 0x0 0 0x0`, `cast keccak` of `keccak(initializer) ++ cast to-uint256 SALT`, `cast create2 --deployer FACTORY --salt S --init-code-hash 0xe298...` (it printed V1 to V7 exactly).

### 7.2 Read-only on-chain tests (public RPC)

- T-S5: for each chain, assert the presence matrix of section 2.7 and the pinned code hashes (a green/red table; any red blocks the chain).
- T-S6: for each golden vector, `eth_call` `createProxyWithNonce` from an arbitrary sender; result equals the offline address (this proves the initializer executes against the real contracts and the address is chain-independent). Expect `Create2 call failed` for addresses already deployed (V7 on Base): treat it as "deployed", then run the state checks of section 5.5.
- T-S7: Kernel cross-check: `getAddress(initData(A0), 0)` on each chain equals `0xB3729F7e...d30d`.
- T-S8: P-256 precompile probe (valid and corrupted signature) per chain, for the passkey option.

### 7.3 Local fork test (what I ran; 24 checks per chain)

Setup: `anvil --fork-url <public RPC> --chain-id <id>` on loopback; owners from the public mnemonic; a fresh throwaway key as local relayer; beneficiary a clean address; no paymaster (the Safe is funded with local test ether through `anvil_setBalance`). Checks, all passing on **Ethereum, Polygon, Base, Arbitrum, BNB Chain and Optimism forks (24 of 24 each; the Base run needed the vacuous-replay test fixed, section 1)**: derived address equals the offline value; not deployed beforehand; first UserOp (`initCode` deployment + 1 wei transfer) signed with EIP-712 `SafeOp` succeeds and the Safe appears with owners `[A0]` and threshold 1; the transfer happened; **negative:** `v` = 0/1 rejected (`AA24`), non-owner rejected (`AA24`); add owner; owner change keeps the address; second owner alone acts (1-of-2); raise to 2-of-3; **negative:** one signature rejected, descending signature order rejected (`AA24`); two ascending signatures accepted; remove the "lost" owner; **negative:** removed owner's signature rejected; a second Safe (another salt) deploys through its first UserOp; ERC-1271 `isValidSignature` accepts a `SafeMessage` typed-data signature (`0x1626ba7e`); **negative:** non-owner signature fails; **negative:** `SafeMessage` signed for another chain id fails; a Kernel v3.1 account for the same owner deploys at `0xB3729F7e...d30d`, a different address from the Safe. Gas per bundle transaction on the Optimism fork: first deployment + transfer 474,685; second deployment 424,697; steady-state operations 124,958 to 157,557 (no L1 data fee, no paymaster, fork pricing: costs on real chains scale with each chain's gas price and data fee, not measured).

### 7.4 Why the tests use forks and not mainnet

No transaction is sent anywhere real, no key with value is used, and the contracts exercised are the real deployed bytecode with the real chain state. What a fork cannot show: real bundler behaviour, real paymaster policy, real P-256 signature verification from a browser, real PayBox behaviour.

### 7.5 Live tests that only the user can choose to run (none run; none require a third party to be contacted)

| ID | Test | Pass criterion |
|---|---|---|
| P-S1 | Through the PayBox WalletConnect page, sign `SafeMessage` typed data for chain 137 with a throwaway PayBox credential and a **zero-value** Safe that has no funds; recover the signer locally | recovered address equals the credential address; record the `v` byte, signature length and what the approval screen displays when the domain has no `name` |
| P-S2 | Same with a full `SafeOp` for a Safe on Base | PayBox accepts a domain `{chainId, verifyingContract}`; hash recomputed locally equals the digest PayBox signed |
| P-S3 | Counterfactual deployment on a **testnet** equivalent through Candide's public endpoint (testnets are free and unlimited per S13) with the PayBox-signed `SafeOp` | UserOp included; `getOwners()` = [PayBox address] |
| P-S4 | Owner rotation on two testnets to exercise the per-chain divergence checklist | divergence detected and flagged by the read-only status |
| P-S5 | Passkey owner in a browser on the intended origin; reload from a different origin to confirm the credential does not carry over | first signs, second cannot |

---

## 8. Verdict by layer (this slice only)

| Layer | Feasible? | Evidence | Unverified |
|---|---|---|---|
| Deterministic address from PayBox address or any EVM address | **Yes** | H, six chains, three independent computations, one live deployed Safe | none for the six chains; any other chain needs T-S5 first (Candide lists 14 mainnets; I did not probe the other eight) |
| Same address on every chain | **Yes on six verified chains; no on 3223** | H | other chains |
| PayBox as owner via typed data | **Plausible, not proven** | H for the Safe side (fork), M for PayBox side ([DPW]) | domain without `name`, `v` byte, preview, `autonomous` grant behaviour (P-S1, P-S2) |
| Injected, WalletConnect and hardware owners | **Yes** | H for Safe; M for the wallet side (standards Final) | per-wallet display of `SafeOp` |
| Passkey owner | **Derivable and deployable; signing untested** | H for deployment simulation and P-256 precompile on six chains | browser signature path, origin binding (P-S5) |
| Recovery and multi-owner | **Yes** | H (fork) | social recovery module not exercised; Candide Guardian email/SMS is a hosted third-party service and was not evaluated |
| Safe on XO 3223 | **No** | H, section 4.2 | none |
| Cheaper or faster than the Kernel account | **No claim** | Kernel first-op gas for XO is in [21]; chains differ | cost on real chains |

What this does **not** establish, and the sibling notes must not borrow from it: that any venue accepts a Safe as its trading account (Opinion: NOT FOUND; Predict.fun, Polymarket, XO: no per [09], [19], [25]); that Candide's public bundler or paymaster behaves as documented (no POST made); that sponsorship exists for our traffic (it requires a funded policy).

## 9. What to build first (for this slice)

1. `deriveSafe` + parser + golden-vector tests (pure, viem only, no network), then the read-only status ladder with the presence matrix as data; account-map row types for `safe-s1`. No flag, no write path.
2. Registry persistence of genesis parameters, and the per-chain owner/threshold display with divergence warning (read-only).
3. Only after P-S1 and P-S2 pass: the `SafeOp` prepared item and verify-before-submit, behind a new flag default OFF; bundler URL supplied by the user.
4. Last: guardian recovery module enablement and passkey as second owner.

## 10. Open items and NOT FOUND

- PayBox: behaviour for `SafeOp`/`SafeMessage` typed data (section 3.2); whether the PayBox address currently has code (`T-AA2`); documented key export or recovery (NOT FOUND).
- Candide: live behaviour of the public bundler/paymaster on the six chains (not probed); which public gas policies exist (none known); price of plans (the pricing page returned a JS shell that I did not parse; billing mechanics are from S13).
- Opinion: acceptance of an S1 Safe as `multi_sig_addr` (NOT FOUND); Predict.fun: acceptance of a non-Predict smart wallet (M, no).
- Whether the `SafeSetup` event is emitted by the L2 and non-L2 singletons alike (M; relevant to genesis recovery from logs).
- Safe on chains outside the six (Avalanche, Celo, Gnosis, HyperEVM, Plasma, Somnia, Tempo, Worldchain per Candide; not probed).
- The unified module's audit contents and licence (P14).

## 11. Corrections to earlier repo statements

- [25] section 5.3 and test `T-AA3`: "factory not Sourcify-verified on 137 or 42161, so a per-chain code check is needed". Done: the Kernel factory, implementation and ECDSA validator have code on Ethereum, Polygon, Base, Arbitrum, BNB and Optimism with identical factory and validator code (the implementation differs per chain by embedded chain id), and the factory's `getAddress` returns the same account on all six.
- [25] section 7.2 listed Candide's public bundler as "unverified first-hand": its public endpoint format, chain list and rate-limit statement are now read from Candide's own docs (S2, S3); behaviour is still unprobed.
- [25] section 5.2 (Safe row): "same address only if deployed through the same singleton factory with the same `saltNonce` and `setup` data" is confirmed and sharpened: two mainstream SDKs differ in singleton and in `setup` data, so "same SDK" is not enough (section 2.5).
- [25] and [DD] say "Opinion needs its Safe": Opinion's SDK docs also show an EOA configuration (R4).

## 12. Sources

- S1 Candide, Contract Deployments: https://docs.candide.dev/wallet/technical-reference/deployments.md (read 2026-10-20) H.
- S2 Candide, Public Endpoints: https://docs.candide.dev/wallet/api/public-endpoints.md H. S3 Supported Networks: https://docs.candide.dev/wallet/api/supported-networks.md H.
- S4 Candide, Gas Sponsorship with Paymaster: https://docs.candide.dev/wallet/guides/send-gasless-tx.md ; InstaGas overview and gas policies: https://docs.candide.dev/instagas/overview.md , https://docs.candide.dev/instagas/gas-policies.md H.
- S5 Candide, Safe Unified Account: https://docs.candide.dev/wallet/abstractionkit/safe-unified-account.md ; overview: https://docs.candide.dev/wallet/guides/chain-abstraction-overview.md H.
- S6 Candide, Account Recovery: https://docs.candide.dev/wallet/plugins/recovery-with-guardians.md ; Authenticated endpoints: https://docs.candide.dev/wallet/api/authenticated-endpoints.md H.
- S7 npm `abstractionkit@0.4.3` (registry JSON and tarball, read as text): https://registry.npmjs.org/abstractionkit H. Repository metadata: https://github.com/candidelabs/abstractionkit (MIT, last push 2026-10-06) H.
- S8 `safe-global/safe-modules` 4337 README, CHANGELOG, `Safe4337Module.sol`, `SafeModuleSetup.sol`, passkey README via raw.githubusercontent.com (main), and release list (4337/v0.3.0 2024-03-19, passkey/v0.2.1 2024-08-19) H.
- S9 npm `permissionless@0.5.0`, file `accounts/safe/toSafeSmartAccount.ts`: https://registry.npmjs.org/permissionless H.
- S10 `candidelabs/safe-4337-multi-chain-signature-module` REST metadata (created 2026-01-16, license null) H.
- S11 EIP-6963 and EIP-1193 (status Final), ERC-4337, ERC-1271, EIP-712, EIP-7702 (Final), EIP-7951 (secp256r1 precompile, Final) via raw EIP/ERC sources on GitHub (headers read) H; `eth-infinitism/account-abstraction` v0.9.0 released 2025-11-16 H.
- S12 Opinion SDK docs: https://docs.opinion.trade/developer-guide/opinion-clob-python-sdk/core-concepts/architecture.md and `.../getting-started/configuration.md` H.
- S13 Candide, Billing and usage: https://docs.candide.dev/wallet/pricing.md H.
- S14 Candide, Supported Gas Payment Tokens: https://docs.candide.dev/wallet/paymaster/tokens-supported.md H.
- S15 Candide, External Signers: https://docs.candide.dev/wallet/abstractionkit/external-signers.md H.
- Repo: `src/xo/account/derive.ts`, notes listed at the top.

---

## Verification

What I re-checked after drafting, and the result.

1. **Three independent derivations agree.** (a) viem script (`derive.cjs`, `derive3.cjs`), (b) a `cast`-only recipe (`castcheck.sh`: `cast calldata`, `cast keccak`, `cast create2`) which printed V1, V3, V4, V5, V6, V7 and V2 identically, (c) AbstractionKit 0.4.3's hard-coded `singletonInitHash` for SafeL2 1.4.1 and 1.5.0 equal my computed `initCodeHash` values. The EIP-712 type hashes recomputed from my type strings equal the constants in `Safe4337Module.sol`.
2. **Factory simulation on six chains.** `createProxyWithNonce` by `eth_call`: V1 to V6, V8, V9 returned the offline address on all six chains; V7 on five (Base already deployed); the `permissionless`-default variant matched on five (Polygon already deployed); the non-L2, 1.5.0 and unified variants matched on all six chains, and so did both passkey vectors (a later pass; the unified and passkey simulations also ran with a throwaway random P-256 key before the fixed point `G` was used).
3. **Code presence and hashes.** 31 contracts x 6 chains = 186 `eth_getCode` reads: 0 errors; 28 contracts one hash everywhere (Allowance Module absent on BNB only), 3 contracts six hashes. XO chain: 22 reads including positive controls.
4. **Live account state** read on Base (owners, threshold, version, module, singleton and handler slots, module list, runtime hash) and the Polygon `permissionless` variant (owners, module, singleton).
5. **Local fork tests:** 24 of 24 on each of Ethereum, Polygon, Base, Arbitrum, BNB and Optimism forks; all negative tests failed as they must (`AA24`); the one initial Base failure was a test defect (vacuous replay), fixed and re-run.
6. **P-256 precompile** answered correctly for a valid and a corrupted signature on all six chains.
7. **Docs and registry facts re-read** from the saved copies: Candide deployments (addresses, exceptions), supported networks, public endpoints, billing, Unified Account page, recovery page; npm `abstractionkit` latest 0.4.3 (2026-10-06), `permissionless` latest 0.5.0; GitHub release dates; module changelog and README audit list.
8. **Not verified (tagged above):** any PayBox behaviour; Candide live endpoints; real browser WebAuthn signature verification; audit report contents (only names and links); Opinion's acceptance of a foreign Safe; chains beyond the six; the pricing page; `SafeSetup` event parity between singletons.
9. **Earlier findings re-tested:** "each venue forces its own account type" holds for XO, Polymarket and PancakeSwap, with one nuance for Opinion (an EOA configuration is documented); "PayBox signs typed data on ten EVM chains and cannot sign raw digests through WalletConnect" is taken from [DPW] (secondary here, not re-read from PayBox's code); "on-chain session policies cannot cap off-chain-signed CLOB orders" was not re-tested and is unaffected by this note; the Safe-specific on-chain guarantee that does exist is threshold > 1 (section 5.2).
10. **Privacy scan.** This note contains no email address, personal name, GitHub login or home-directory path (the grep for `@`, the account name and `/Users` over this file was run before finishing; the only `@` matches are npm package specifiers such as `abstractionkit@0.4.3`; the only `0x...` strings are public contract addresses and public test addresses). The npm maintainer contact seen in registry JSON and Candide contact addresses seen in docs are deliberately not reproduced. Every scripted request used the User-Agent `insurance-markets-research/0.1`; `gh` was not used (REST GETs and raw files only, so no local GitHub login was sent); `anvil` fork reads went to public RPCs without that header (disclosed in section 1).
11. **Scope.** Only this file was written. No source, relay, test or package file was touched, nothing was installed (existing `node_modules` viem was used by scratch scripts; tarballs were downloaded and extracted into scratch directories), no build or test was run, git state was only read (`git diff`), and background `anvil` processes were stopped.
