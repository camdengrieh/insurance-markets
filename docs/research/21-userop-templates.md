# 21. UserOperation templates for XO chain 3223 (Phase 0 gate 4 and the on-chain actions)

Stream `userop-templates`, run on machine clock 2026-10-18/19 UTC (Blockscout head at start: block 12,608,921, 2026-10-18T19:53:05Z). Author decisions applied: no contact with XO or PayBox of any kind (`submit_feedback` not called), PayBox terms not treated as an obstacle, build and test locally, no creation cadence. Everything here is read-only: no signature was created, no UserOperation or transaction was sent, no account or key was created, no PayBox tool was called.

Tags: H = read first-hand in a primary source or reproduced by my own computation this session (script and transcript cited); M = secondary or inferred; L = weak. Scripts are in `docs/research/fixtures/gaps/userop-templates/` (called `F/` below); transcripts of every run are in `F/transcripts/`.

---

## 0. Bottom line

1. **Every UserOperation XO's app sends was decoded and reproduced.** Across 22 real operations (Enable Trading with account deployment x3, redeem x5 single plus x3 large batches plus x2 from the operator account, merge x3, split x3, createConvictionMarket x3) the hash I compute from the packed fields equals the hash in the EntryPoint `UserOperationEvent` log and equals what the on-chain `EntryPoint.getUserOpHash()` returns (H, `F/transcripts/01`, `03`). A template builder (`F/userop_templates.mjs`) rebuilds those operations byte for byte from semantic parameters: 158 of 158 golden checks pass (H, `F/transcripts/02`).
2. **What the owner signs.** The 32-byte `userOpHash`. XO's own app signs it EIP-191-prefixed (`personal_sign` over the 32 raw bytes): 14 of 14 operations with a known owner verify that way and 0 of 14 verify as a raw-hash signature (H). The deployed ECDSA validator also accepts a raw, unprefixed ECDSA signature over the hash: shown by a read-only `eth_call` of `validateUserOp` against two real accounts (H, `F/transcripts/06`) and by the validator source (H). So PayBox's `raw` intent (sign a 32-byte digest as-is) is a valid way to sign UserOps. No typed data, no Kernel `Kernel(bytes32)` wrapper, no mode prefix: the signature is 65 bytes `r || s || v` with `v` in {27, 28} (161 of 161 recent operations have 65-byte signatures).
3. **No XO-issued key was needed for anything in this stream.** `mainnet-bundler.xo.market` answers `eth_chainId` and `eth_supportedEntryPoints` with no key. `rpc-mainnet-2.xo.market` also answered `eth_chainId`, `eth_blockNumber`, `eth_call`, `eth_getCode`, `eth_getBalance`, `eth_getTransactionByHash`, `eth_getTransactionReceipt` and `web3_clientVersion` with no `api_key` and every response was HTTP 200 (99 requests; the single JSON-RPC error is `Method not found` for `eth_supportedEntryPoints`, expected on a node) (H). This contradicts the docs, which say the mainnet RPC "requires an `api_key` query parameter" issued privately (H, docs quote in section 6). The public chain registry lists the RPC with no key (H). I cannot say whether the keyless access is intended or stable (L).
4. **Nonce and gas do not need the keyed RPC.** Nonce: `EntryPoint.getNonce` via the keyless RPC, or the last `UserOperationEvent.nonce` of the sender from the explorer's `getLogs` plus one (equal in 2 of 2 tests; a never-used sender is sequence 0). Gas: XO's bundler takes zero fees (161 of 161 recent operations have `maxFeePerGas = maxPriorityFeePerGas = 0`), so only the three gas limits and the paymaster limits matter; observed values per action are in section 8.
5. **The paymaster would sponsor a foreign sender and does not care who bundles.** From the verified `PolicyPaymaster` source: no signature check, no `paymasterData`, no `tx.origin`/bundler check, no sender allowlist (only the `unlimitedAddresses` bypass, 0 entries ever set). It checks (a) not paused (currently false), (b) every call in `execute` is on the selector allowlist, (c) a per-sender daily counter below 10,000. `checkPolicy` for a never-seen address returns allowed with 10,000 remaining for all action selectors in this stream except outbound `transferRemote` (H). 21 of 21 account deployments in the last ~83k blocks were sponsored by it (H). Sponsorship is also **optional**: 38 of 161 recent operations carry no paymaster at all and are included with zero fees (H, receipts in `F/transcripts/11`).
6. **Hard limits of this stream (NOT ESTABLISHABLE WITHOUT XO or a write):** whether the bundler accepts `eth_sendUserOperation` for an account whose owner is not an XO-app owner; whether XO's orderbook backend recognises such an account (gate 3); whether the keyless RPC and the paymaster policy stay as they are (the paymaster owner changed 6 times and can pause or narrow the allowlist at will); how withdrawals are executed (11 of 11 sampled outbound transfers are not UserOperations; the target contract is unverified and the calldata undecoded).
7. **Gate 4 verdict: answered-go at build level** (section 11). Effect on gate 8: stays `partial`, narrowed to PayBox-side unknowns; UserOps need only `raw`.

---

## 1. Method and compliance

- Hosts and request counts (helper counters, cap 150 per host per task): `explorer-mainnet.xo.market` 103 (GET only: Blockscout REST `/api/v2/...` and etherscan-style `/api?module=logs|transaction`), `rpc-mainnet-2.xo.market` 99 (JSON-RPC POST, read methods only), `mainnet-bundler.xo.market` 3 (`eth_chainId`, `eth_supportedEntryPoints`, `web3_clientVersion`), `mainnet.base.org` 5 (`eth_chainId` plus four `eth_getCode`). Throttle at least 300 ms per host, backoff on 429/5xx, 401/403 marks a host blocked (never triggered). User-Agent exactly `insurance-markets-research/0.1`, no other identifying header. Counters: `F/transcripts/16`.
- No POST to the explorer. Two explorer features were probed and are unavailable: `/api/v2/proxy/account-abstraction/*` answers HTTP 501 `{"message":"Service is disabled"}` (the Blockscout user-ops indexer is off), and `/api?module=proxy&...` answers `{"message":"Unknown module"}` (H). So UserOperations had to be found from `handleOps` transactions and EntryPoint logs.
- One `eth_call` technique worth stating plainly: `rpc_validator_check.mjs` and the `checkPolicy`/`getNonce` reads use `eth_call` (a simulation; no state change). The validator test sets the `from` field to the Kernel account so that `msg.sender` is the account, and re-uses signatures that already exist on chain; I did not produce any signature, including no malleated one.
- XO ToS clauses read before probing (`/legal/terms-of-service`, H): "You will not engage in any activity that interferes with or disrupts the Platform ... not executing denial-of-service attacks, and not attempting to hack or gain unauthorized access" and "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system." No numeric limit on automated access is given. About 210 requests were spent in total over several hours, each host far below any plausible limit. One full-history topic query on USDC.e timed out client-side (30 s) before I narrowed the block range; it was not retried in a loop.
- Third-party Kernel and ZeroDev source was read through `gh api` raw GETs and never executed (list in `F/upstream/SOURCES.txt`).
- Third-party account addresses (smart accounts, owners, bundler EOAs) are abbreviated in this file as `0xAAAAAA..ZZZZ`; protocol contracts are in full. Full public data is in the fixtures.

---

## 2. Contracts on chain 3223 and code identity

| Contract | Address | Evidence |
|---|---|---|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | 16,035 bytes of code; byte-identical to the same address on Base; `getUserOpHash` agrees with v0.7 packing; bundler advertises it (H, `F/transcripts/09`, `03`, `08`) |
| KernelFactory 0.3.1 | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` | 989 bytes, byte-identical to Base; matches ZeroDev SDK constants for Kernel 0.3.1 (H) |
| Kernel implementation 0.3.1 | `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` | 22,784 bytes; differs from Base only in 34 bytes: the cached EIP-712 domain separator and the chain id (`0x0c97` vs `0x2105`) (H, `F/transcripts/10`). `KernelFactory.implementation()` returns it, and the XO-app account I looked up (`0x812d..e7B5`) is an ERC-1967 proxy to it (H, explorer `proxy_type: eip1967`); the operator account of 4.3 points to a different implementation |
| ECDSAValidator | `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` | 1,819 bytes, byte-identical to Base; SDK constants name it for Kernel `>=0.3.1`; emits `OwnerRegistered(kernel, owner)` (H) |
| PolicyPaymaster | `0x2353b23d8f329fd3cec0d21652f14208248a439d` | verified source on the explorer (H) |
| USDC.e | `0x80c12230ce677e6f304027a14780Edd2A829ab0c` | FiatTokenProxy to FiatTokenV2_2, verified |
| Conditional Tokens | `0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909` | not verified on the explorer; standard Gnosis CTF selectors match |
| CTF Exchange | `0x4bC5E872256D12E6017dfe466E04c867DC761B77` | ERC-1967 proxy to `0x24BB...52ED` (verified) |
| Conviction manager (proxy) | `0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307` | implementation `0x60a10A0C0885628e413afFA4F62F3e942f11fcda` (verified); ABI saved in `F/abi/` |

Consequence (H): the XO accounts are stock ZeroDev Kernel v3.1 accounts with the stock ECDSA validator; anything true of Kernel v3.1's source is true here. Kernel v3.1 source checked: `validateUserOp` decodes the nonce, takes the root validator, and calls `validator.validateUserOp(userOp, userOpHash)` with the signature unmodified in default mode (`F/upstream/v3.1_src_Kernel.sol`, `v3.1_src_core_ValidationManager.sol`). The KernelFactory is permissionless: `createAccount(bytes data, bytes32 salt)` derives `actualSalt = keccak256(abi.encodePacked(data, salt))` and deploys an ERC-1967 proxy deterministically (`F/upstream/v3.1_src_factory_KernelFactory.sol`).

---

## 3. Anatomy of a real XO UserOperation (all fields)

Packed form as submitted in `handleOps(PackedUserOperation[] ops, address beneficiary)`, selector `0x765e827f` (decoded with viem's `entryPoint07Abi`; 161 of 161 recent operations decode).

Worked example: Enable Trading with account deployment, tx `0xc9ef8950c7c5f9489261ed9c65a7e6f8cedbfe4e5c3e213708dc5fc0f704013a`, block 12,589,192 (H, `F/transcripts/01`, `03`, `06`, `11`):

| Field | Value | Meaning |
|---|---|---|
| `sender` | `0x70e7..2648` | Kernel proxy; equals `KernelFactory.getAddress(data, salt)` read on chain and equals offline CREATE2 (factory, `keccak256(data || salt)`, initCodeHash `0x85d96aa1...03e6` from the ZeroDev SDK constants) |
| `nonce` | `0x845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000` | Kernel v3 layout, see below; sequence 0 |
| `initCode` | `0xaac5D424...A419` (factory) `||` `0xea6d13ac` `createAccount(bytes,bytes32)`, salt `0x00..00`, data = `initialize(bytes21 rootValidator, address hook, bytes validatorData, bytes hookData, bytes[] initConfig)` (`0x3c3b752b`) with `rootValidator = 0x01 || 0x845ADb2C...4cE57`, `hook = address(0)` (Kernel normalises it to `address(1)`, no hook), `validatorData = the 20-byte owner`, `hookData = 0x`, `initConfig = []` | the first operation deploys the account (also emits `AccountDeployed`, which the validator answers with `OwnerRegistered(kernel, owner)`) |
| `callData` | `execute(bytes32,bytes)` `0xe9ae5c53`, batch mode, 2 calls | see below |
| `accountGasLimits` | `0x...0004897e ...000124a4` | `verificationGasLimit` (high 16 bytes) 297,342, `callGasLimit` (low 16 bytes) 74,916 |
| `preVerificationGas` | 56,214 | |
| `gasFees` | `0x00..00` | `maxPriorityFeePerGas` (high 16) 0, `maxFeePerGas` (low 16) 0 |
| `paymasterAndData` | `0x2353b23d...439d` `||` `0x...9d46` `||` `0x...676e` (52 bytes) | paymaster, `paymasterVerificationGasLimit` 40,262, `paymasterPostOpGasLimit` 26,478, `paymasterData` empty |
| `signature` | 65 bytes, `v = 0x1b` | owner ECDSA, no prefix |

Event and receipt: `UserOperationEvent(userOpHash 0xbd0dcbef...6f86, sender, paymaster = PolicyPaymaster, nonce, success = true, actualGasCost = 0, actualGasUsed = 404,091)`; the bundle transaction used 392,704 gas at an effective gas price of 5 gwei, paid by the bundler EOA (H, receipt via RPC).

**Nonce layout (H, Kernel `ValidatorLib.decodeNonce`, confirmed on all 161 operations):** `1 byte mode | 1 byte validation type | 20 bytes identifier | 2 bytes nonceKey | 8 bytes sequence`.
- Mode `0x00` = default (the other value is enable mode). Type `0x00` = root (Kernel substitutes its stored root validator and ignores the identifier), `0x01` = validator, `0x02` = permission.
- Every observed operation uses mode `0x00`, type `0x00`, nonceKey 0 (161 of 161). The identifier is the ECDSA validator address `0x845A...4cE57` in 140 and all zeros in 21 (the operator account decoded in 4.3 uses zeros; I did not individually attribute all 21). Leading zero bytes drop out of the integer, so a sequence-0 nonce prints as `0x845a...ce57` followed by 20 zero hex digits.
- `EntryPoint.getNonce(sender, key)` takes the upper 192 bits (`nonce >> 64`) as `key` and returns the full next nonce.

**callData layout (H, ERC-7579 as implemented by Kernel's ExecLib; golden-tested):**
```
execute(bytes32 execMode, bytes executionCalldata)           selector 0xe9ae5c53
execMode  = callType(1) | execType(1) | unused(4) | modeSelector(4) | modePayload(22)
  single : 0x00 00 00000000 00000000 000...0   executionCalldata = abi.encodePacked(target(20), value(32), data)
  batch  : 0x01 00 00000000 00000000 000...0   executionCalldata = abi.encode(Execution[]{address target, uint256 value, bytes callData})
  execType 0x00 = revert on failure (every observed op); 0x01 = try; callType 0xff = delegatecall (the paymaster rejects it)
```
XO's app uses batch for Enable Trading (approve plus setApprovalForAll) and for creation (approve plus create), single for one redeem/split/merge.

**Bundle transaction:** `from` = a bundler EOA (13 distinct EOAs in 150 transactions; the two I checked hold about 17 XO each), `to` = EntryPoint, selector `0x765e827f`, 1 to 4 operations per bundle (median 1) (H, `F/transcripts/07`, `17`).

---

## 4. Decoded examples per action (tx hash, key fields)

Source of the lists: `F/examples.json`; full machine-readable decode: `F/decoded_examples.json`; reproducible with `F/fetch_txs.py` then `F/summarize_examples.mjs`. Gas columns are `verificationGasLimit / callGasLimit / preVerificationGas`; paymaster limits `pmVerif / pmPostOp`. All use `maxFeePerGas = 0`.

### 4.1 Enable Trading (account deployment in the same operation) - 3 examples, all identical in shape

| Tx | Block | Sender | Nonce seq | Owner in `initCode` | Gas | Paymaster limits |
|---|---|---|---|---|---|---|
| `0xc9ef8950c7c5f9489261ed9c65a7e6f8cedbfe4e5c3e213708dc5fc0f704013a` | 12,589,192 | `0x70e7..2648` | 0 | `0x5e325B..7c3b` | 297,342 / 74,916 / 56,214 | 40,262 / 26,478 |
| `0x0999a02198426d2f324bd4cb5e4308d26eb67a2d088c03eecf7b57d1c3e0690f` | 12,589,787 | `0x9b97..9fB5` | 0 | `0xD20DcE..1c79` | same | same |
| `0xc097b149544c980afb98bf6b949edc6a3cfb39cc620d093f251cead4fbfe17f2` | 12,604,908 | `0x2938..CcAa` | 0 | `0xbfDCB3..C38c` | same | same |

Inner calls (H): batch of `USDC.e.approve(CTF Exchange, 2^256-1)` and `ConditionalTokens.setApprovalForAll(CTF Exchange, true)`. Salt `0x00..00` in all three. Signature recovers to the owner under EIP-191 (3 of 3), not under raw. Whether the app also sends Enable Trading as a later operation for an already-deployed account was not observed in this sample; the call data is the same minus `initCode` (M).

Fleet context (H, `F/transcripts/15`): 21 `AccountDeployed` events between blocks 12,521,836 and 12,604,908, all from factory `0xaac5...A419`, all with paymaster `0x2353...439d`. In a window of 150 recent bundle transactions only 1 of 161 operations carried a factory.

### 4.2 redeemPositions

Single call, `redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2])` (selector `0x01b7037c`), mode `0x00`:

| Tx | Block | Sender | Seq | Gas | pmVerif / pmPostOp |
|---|---|---|---|---|---|
| `0x2a544e2adfb356ee1a1e16448494002bdbdd991c794f984f84b0333a43faab79` | 12,601,956 | `0x812d..e7B5` | 130 | 87,869 / 126,186 / 51,195 | 40,262 / 26,478 |
| `0xe3abd2b178d8f9925b9b0c76777da6885845dee3f0c6c83376a0db2f13aac410` | 12,602,053 | `0xe05e..E301` | 438 | 87,869 / 126,186 / 51,208 | 40,262 / 5,958 |
| `0x8ddd70241d25d83fe0b5d39f0d78e753e909eedad469bdf112f4403f8588a5a8` | 12,603,923 | `0xF712..7999` | 8 | 87,869 / 89,564 / 51,195 | 40,262 / 26,478 |
| `0x113e9348d488ed101a68335ceddf285a644bce70308be10483538d64377488a6` | 12,603,120 | `0xdc43..C3BD` | 11,564 | 200,000 / 600,000 / 100,000 | 100,000 / 150,000 (round numbers: an integrator-style client) |
| `0xf1d762974d59520bd9fa8c2791768c12bf3034b1d0c20d9ff21527faca48822d` | 12,600,993 | `0x5D02..6a4E` | 1,194 | 109,837 / 130,267 / 64,010 | 50,328 / 7,448 |

All five: owner known, signature verifies under EIP-191, not raw. The repeated `pmPostOp` 26,478 versus 5,958: the paymaster's `postOp` increments `dailyUsage[sender][day]`, a storage write that costs about 20k more when the counter is 0 (first sponsored operation of the UTC day for that sender). The first operations of the day use 26,478, later ones 5,958 (consistent with creation examples 4.5; M, inferred from the source and from ordering). Using 26,478 (or more) always is safe.

Batch of many redeems, **no paymaster** (zero fees, self-paid at price 0): `0x89ede19a1517a89bb9f7211cb50ddd0e5d18952b7315e87b5255eb60aacddb55` (62 calls, gas 221,170 / 1,862,026 / 228,195, bundle gas 2,177,985, success true), `0x8b5a58228ce273c1cbcbbe895d06dab4115c37e7e715d600938574e15dba69c1` (62 calls), `0x2ad969f42f33a07606633de2d6f2c947969916638fa3f3cebbb5553f4e584b8b` (73 calls, 240,214 / 2,345,424 / 260,114, bundle gas 2,694,278). `UserOperationEvent.paymaster = 0x00..00`, `success = true`, `actualGasCost = 0` for all three (H, RPC receipts, `F/transcripts/11`). The calls in a batch use different index sets (`[1]`, `[2]`) as needed.

### 4.3 splitPosition and mergePositions (operator account only)

I found no split or merge UserOperation from an ordinary XO-app account. In the last 60,000 blocks all 859 `PositionSplit` events came from the CTF Exchange itself (matching-time minting, not UserOps), and of 91 `PositionsMerge` events 15 came from the exchange and 76 from one account, `0x92E4..4232` (searched: `getLogs` on the Conditional Tokens contract, `F/collect_candidates.py`). That account is an ERC-1967 proxy to a different, unverified implementation (`0x1d0a45f6...`), created by an address (`0x30e8..8cf93`) that was once the paymaster's owner (H); I therefore treat it as XO-operated infrastructure (M, inference). Its operations are structurally the same as redeem (single mode, ERC-7579 `execute`), sponsored by the same paymaster (8 of 8 here), but it signs the **raw** hash (section 5). Before its first split it had approved USDC.e to the Conditional Tokens contract (unlimited, block 5,390,034, `F/transcripts/19`), as `splitPosition` pulls the collateral with `transferFrom`.

| Tx | Action | Block | Seq | Call | Gas | pmVerif / pmPostOp |
|---|---|---|---|---|---|---|
| `0xf80507d3da7ade09ad239e28e4682fda0858260548f91ccbf6d0cb5ad3a58ea3` | merge | 12,607,678 | 71,154 | `mergePositions(USDC.e, 0x00..00, 0x01c9457b..., [1,2], 317383)` | 46,111 / 145,333 / 76,741 | 150,000 / 8,937 |
| `0x42db6d37ff9d59de83c2274db55c0298f7c4a20d5c4d5a04489466b2dc0e7a6c` | merge | 12,607,747 | 71,156 | same shape, amount 320,000 | 46,111 / 134,346 / 76,720 | 150,000 / 8,937 |
| `0x03218f49a39a3d2423d21bf8de0b024d916062d9184850df1a07afac930db699` | merge | 12,608,777 | 71,161 | amount 5,549,382 | 46,111 / 167,305 / 76,741 | 150,000 / 8,937 |
| `0x15bb7450b4a632a4aa4a41f4001349adecf491cc51f8d98d6354bdf248393166` | split | 5,399,909 | 1 | `splitPosition(USDC.e, 0x00..00, cond, [1,2], 2500000000)` selector `0x72ce4275` | 30,741 / 155,483 / 51,134 | 40,262 / 5,958 |
| `0x97ade4c892095ca08009dd4d341fc1cd5666b016329f934bd3495e6b79fbc025` | split | 5,783,066 | 3,243 | amount 2,500,000,000 (2,500 USDC.e) | 30,741 / 133,510 / 51,147 | 40,262 / 5,958 |
| `0xe8b9f8faf42fda4c611f40906796a060d86d9bcb3ee33b8757638cb211379c18` | split | 5,783,160 | 3,246 | amount 2,500,000,000 | 30,741 / 140,834 / 51,134 | 40,262 / 5,958 |

`mergePositions` selector `0x9e7212ad`. Partition is `[1, 2]` for binary markets, amount in 6-decimal units.

### 4.4 Outbound `transferRemote` (withdrawal): not a UserOperation

All 11 sampled `SentTransferRemote` transactions (the 3 in `F/examples.json` plus 8 more, `F/transcripts/12`) are direct transactions from a relayer-like EOA to `0x5d1d6fa733bfba0ec7b143de0d7e8a4afa9f9ba9` with selector `0x3a022aa7`, about 2.5 KB of calldata that contains the chain id 3223 and two 65-byte signatures; none goes through the EntryPoint (H on shape). The target is not verified and I could not decode the argument layout (NOT FOUND; no ABI). Each such transaction emits USDC.e `Transfer`/`Approval`/`Burn` logs, the route's `SentTransferRemote`, and events from an account contract (not decoded). Withdrawals are therefore service-mediated and cannot be templated from data.

What the chain does say about a hypothetical direct UserOp to the route (all H, `F/transcripts/04`, `13`): `HypFiatToken` route `0x9090463546d725F6eCE5D1A4B27beB929D5D1983` has `localDomain 3223`, `domains [8453]` (Base only), `feeHook` and `hook` zero, and `quoteTransferRemote(8453, recipient, 10 USDC.e)` returns native 0, token amount 10,000,000, token fee 0. `transferRemote(uint32,bytes32,uint256)` (selector `0x81b4e8b4`) is **not** on the paymaster allowlist, so such an operation would need to carry no paymaster (allowed, see 4.2) and would need `approve(route, amount)` first. Whether Hyperlane delivers an unpaid message from a third-party sender on the Base side depends on XO's relayer and is NOT ESTABLISHABLE WITHOUT XO; a wrong recipient is irrecoverable. I do not recommend this path.

### 4.5 createConvictionMarket (with the $1 fee approval)

Batch of `USDC.e.approve(manager, 2^256-1)` then `createConvictionMarket(uint40 startsAt, uint40 expiresAt, address collateralToken, string metaDataURI)` (selector `0x7f54a7a2`), mode batch. Metadata URI observed: `https://market-metadata-623756711122.s3.eu-west-1.amazonaws.com/<uuid>.json` (an XO-owned bucket; creator-hosted URIs untested).

| Tx | Block | Sender | Seq | startsAt / expiresAt | Gas | pmVerif / pmPostOp |
|---|---|---|---|---|---|---|
| `0xbcc79750f764a7c34c6270fccc15494d98949cebfe40abc3142934b190c757da` | 12,551,478 | `0x0cC8..A5B8` | 10 | 1792237026 / 1792443600 | 105,442 / 977,594 / 55,800 | 40,262 / 26,478 |
| `0xec8d1956f04e18366d9fd86732091c6a35a3ec549fa0cc826187cfde9118b5ab` | 12,552,471 | `0x488A..9315` | 872 | 1792239159 / 1794873540 | 105,442 / 1,056,696 / 55,814 | 40,262 / 26,478 |
| `0xcaed7961d6dc52ba9cafd911d8078cd30441c72dded0de4cdf5a0a0963de49ba` | 12,553,083 | `0x488A..9315` | 873 | 1792240465 / 1793520000 | 105,442 / 995,173 / 55,814 | 40,262 / 5,958 |

The second and third operations are from the same account about 15 minutes apart (first sponsored op of the day uses 26,478, the next 5,958). `callGasLimit` is large (about 1M) because the manager mints NFTs and registers tokens. The fee is a 1,000,000-raw USDC.e transfer inside `createConvictionMarket`; XO's app approves the unlimited amount, but the paymaster passes any `approve` arguments (see section 7), so a capped approval of exactly the fee is also within policy (the manager only needs an allowance of at least the fee, M; a capped creation approval was not observed).

---

## 5. userOpHash preimage and the signature (task item 2)

**Preimage, EntryPoint v0.7 (H; verified by hand-written code, by viem's `getUserOperationHash`, by the event logs and by the on-chain `getUserOpHash`):**
```
inner      = keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
                                  accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData)))
userOpHash = keccak256(abi.encode(inner, entryPoint, chainId))        chainId = 3223
```
`paymasterAndData` is hashed in full (including paymaster address and the two gas limits). `signature` is not hashed. The EntryPoint on chain 3223 answered `getUserOpHash(op)` with the same value as my computation for 7 operations (`F/transcripts/03`).

**What recovers to the owner (H, `F/transcripts/01`):**
- XO-app accounts (validator `0x845A...`): 14 of 14 operations whose owner is known (3 owners from `initCode`, 11 from `OwnerRegistered` logs) verify as `ecrecover(keccak256("\x19Ethereum Signed Message:\n32" || userOpHash), sig) == owner`; 0 of 14 verify as `ecrecover(userOpHash, sig)`. This is viem's `signMessage({ message: { raw: userOpHash } })`.
- The deployed validator accepts both forms (H): Kernel v3.1 `ECDSAValidator.validateUserOp` tries the raw hash first, then the EIP-191-prefixed hash (`F/upstream/v3.1_src_validator_ECDSAValidator.sol`), and I confirmed the deployed bytecode behaves that way by simulation: calling `validateUserOp(op, D)` with `from` = the account, where `D = hashMessage(raw: userOpHash)`, so that the existing (prefixed) signature is a valid RAW signature over `D`, returns 0 (success) for both accounts tested; the correct hash returns 0; a random hash returns 1; another account returns 1 (`F/transcripts/06`). The deployed validator is byte-identical to Base's canonical one (section 2).
- The XO-operated account `0x92E4..4232` signs the raw hash: across 8 operations the raw-recovered signer is stable (2 distinct addresses: one per era, 4 and 4 operations) while the EIP-191-recovered address changes every time (8 distinct) (H on the pattern; the account is a different, unverified implementation, so I cannot name its owner; M).
- XO's doc text "raw ECDSA ... same key that signs orders" is compatible with both (the validator accepts raw); the app in practice signs the prefixed form.

**Signature bytes (H):** 65 bytes `r || s || v`, `v` = 27 or 28 (`0x1b`/`0x1c` seen), no leading mode byte and no validator address, unlike the order/ClobAuth wire format (`0x01 || validator || sig`). Kernel v3 puts the validation mode in the nonce, not in the signature. First operations (with `initCode`) also carry a plain 65-byte signature. Normalise to low `s` before sending (M, caution only; not tested).

**Mapping to PayBox (M, from note 06):** the `raw` intent ("signs a pre-computed digest as-is") returns `{r, s, recovery_id}` per the SDK description; assemble `v = 27 + recovery_id`. `assembleSignature` in `F/userop_templates.mjs` does this. A `message` intent is the wrong tool unless PayBox signs the 32 raw bytes with the `\x19Ethereum Signed Message:\n32` prefix (a hex string treated as text would get the wrong length prefix and fail).

Pre-submit self-check the relay can run without any XO call to the bundler: recompute `userOpHash` from the packed fields, `ecrecover` the signature against the expected owner (raw digest or EIP-191 digest), and for an already-deployed account additionally simulate `validator.validateUserOp(op, userOpHash)` with `from` = account via the keyless RPC (0 means valid). For a first operation the account is not deployed, so only the `ecrecover` check applies.

---

## 6. Who may call the bundler and the RPC (task item 3)

**Probes with no key (H, `F/transcripts/08`):**
- `mainnet-bundler.xo.market`: `eth_chainId` -> `0xc97` (3223); `eth_supportedEntryPoints` -> `["0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "0x0000000071727De22E5E9d8BAf0edAc6f37da032"]` (v0.6 and v0.7); `web3_clientVersion` -> JSON-RPC error whose text enumerates the accepted methods: `eth_chainId | eth_supportedEntryPoints | eth_estimateUserOperationGas | eth_sendUserOperation | boost_sendUserOperation | eth_getUserOperationByHash | eth_getUserOperationReceipt | debug_bundler_clearState | ... debug_bundler_* | pimlico_getUserOperationStatus | pimlico_getUserOperationGasPrice | pimlico_sendUserOperationNow | pimlico_simulateAssetChange`. That method set is the schema of Pimlico's open-source Alto bundler (M, by fingerprint). I did not call any method outside my permitted read list (so no `eth_estimateUserOperationGas`, no `eth_getUserOperation*`, no `debug_*`, no `pimlico_*`, no `eth_sendUserOperation`). Whether the `debug_bundler_*` methods are actually enabled on the public host is unknown (L); they must not be called.
- `rpc-mainnet-2.xo.market`: `eth_chainId` -> `0xc97`; `web3_clientVersion` -> `reth/v2.0.0-eb4c15e/x86_64-unknown-linux-gnu`; `eth_supportedEntryPoints` -> `Method not found` (expected on a node). No 401 or 403 at any point, so the stop rule never fired.

**What the docs say about the key (H, `xo-docs` MCP):**
- `/documentation/introduction`: "The mainnet RPC requires an `api_key` query parameter (e.g. `https://rpc-mainnet-2.xo.market?api_key=abcd1234`). The XO team issues the key privately during onboarding. Treat it as a credential and do not commit it to source control." and "For credentials, the mainnet RPC `api_key`, paymaster details, and rollout questions, use the XO onboarding channel provided to your team." Also: "Your `XO_SMART_ACCOUNT_ADDRESS`, the owner `XO_PRIVATE_KEY`, the paymaster address ... Ask your XO contact for these during onboarding."
- `/guides/redeem-positions`: "Attach the XO paymaster (address from onboarding) with empty `paymasterData`", "`eth_sendUserOperation` to `https://mainnet-bundler.xo.market/`", "The XO bundler accepts zero EIP-1559 fees", sample `RPC_URL = "https://rpc-mainnet-2.xo.market?api_key=<API_KEY>"` used for one `payoutDenominator` read. The bundler URL carries no key in any doc.
- `/guides/smart-accounts` sample script sets `rpcUrl: "https://rpc-mainnet-2.xo.market"` without a key.
- Nothing documents how a non-onboarded integrator obtains a key. That is the whole of what the docs say; the only route they name is the private onboarding channel.
- `ethereum-lists/chains` `eip155-3223.json` lists `"rpc": ["https://rpc-mainnet-2.xo.market/"]`, no key, `faucets: []` (H, `gh api`).

**Conclusion.** A key is **not required in practice today** for the read calls this task needs, on either host (H). Whether `eth_sendUserOperation` needs a key, an allowlisted origin or IP, or any account registration is NOT ESTABLISHABLE WITHOUT XO or a write (not tested; the docs show the bundler URL without a key and the XO sample sends to it keylessly, M).

**Keyless fallbacks and what they cover (all H unless marked):**

| Need | Keyless route | Test |
|---|---|---|
| Find a UserOp / receipt by hash | RPC `eth_getTransactionReceipt` of the bundle (tested); `getLogs` on the EntryPoint with `topic1 = userOpHash` (the event's indexed topics are hash, sender, paymaster; a hash-keyed query was not run, M) | receipts reproduced |
| Next nonce | RPC `EntryPoint.getNonce(sender, key)`; or explorer `getLogs` (EntryPoint, `UserOperationEvent`, `topic2 = sender`), last `nonce` + 1; never-used sender = key `<< 64` plus 0 | equal in 2 of 2, plus the never-used case (`F/transcripts/14`) |
| Account owner | `getLogs` on the validator, `OwnerRegistered(kernel, owner)`, `topic1 = kernel` | 10 accounts returned an owner; the operator account returned none |
| Trading-enabled flag | `getLogs` `ApprovalForAll(account, exchange, true)` on Conditional Tokens and `Approval(account, exchange, value)` on USDC.e (needs `topic0`, `topic1`, `topic2` plus all three `*_opr=and` parameters) | enabled account: 1 and 1 events (value `2^256-1`); fresh address: 0 and 0 (`F/transcripts/18`) |
| `payoutDenominator > 0` | `getLogs` `ConditionResolution(conditionId, ...)` on Conditional Tokens (`topic1 = conditionId`) | resolved condition returns 1 event with payouts `[0, 1]` (`F/transcripts/18`); the event-based test was run once (M for generality) |
| Paymaster state | RPC `eth_call` (views `paused`, `dailyTxLimit`, `checkPolicy`, `getRemainingDailyTxs`); or `getLogs` for config events | section 7 |
| Gas price | Blockscout `/api/v2/stats` shows 5 gwei; UserOps use 0 | |
| Submit | only the bundler (`eth_sendUserOperation`), or `handleOps` by any funded EOA (next section) | not testable |

Blockscout's `module=proxy` and its user-ops indexer are off (section 1), so there is no explorer-side `eth_call` or UserOp lookup.

**Can someone other than XO's bundler land the operation?**
- *Contract level (H from source plus code identity, M for deployed-code behaviour beyond the compared bytes):* `EntryPoint.handleOps` is public; the deployed code is byte-identical to the canonical v0.7 EntryPoint, whose `handleOps` has no caller restriction. The paymaster ignores `msg.sender`/`tx.origin`/beneficiary entirely (it only requires `msg.sender == entryPoint`). With zero fees the prefund is zero, so neither the paymaster deposit (2,599.58 XO, unstaked) nor any account balance is consumed; the bundle's gas (5 gwei) is paid by whoever sends the `handleOps` transaction. So any EOA holding native XO can include a correctly signed operation, sponsored or not.
- *What blocks it in practice:* (1) the sender needs native XO for transaction gas (bundle gas 0.4M to 2.7M at 5 gwei = about 0.002 to 0.014 XO); the 13 bundler EOAs hold about 17 XO each; accounts and owners hold 0 (H, `F/transcripts/17`); no faucet is listed and no way to acquire XO for an outsider was found (NOT FOUND, searched: chain registry `faucets`, docs/llms keyword search from earlier streams, explorer stats `coin_price: null`); (2) a broadcast path: `eth_sendRawTransaction` through `rpc-mainnet-2.xo.market` (not called; unknown whether it is open); (3) whether the chain restricts who may submit transactions is unknown.
- *Another public bundler service:* no evidence that Pimlico, ZeroDev, Alchemy, Biconomy or any other hosted bundler supports chain 3223 (NOT FOUND; searched: Pimlico endpoints doc URL returned 404 on my fetch, one web search returned nothing for chain 3223; weak negative, L). A self-hosted open-source bundler pointed at the keyless RPC is technically possible but untested and needs the native-XO funding in (1). The only supported path is XO's bundler.

---

## 7. PolicyPaymaster: source, allowlist, limits, never-seen sender (task item 4)

Verified source: `F/abi/PolicyPaymaster.sol` (Solidity 0.8.28, `Ownable`, `Pausable`, constructor `(IEntryPoint, uint256 dailyTxLimit)`). `validatePaymasterUserOp(userOp, userOpHash, maxCost)`:
1. `onlyEntryPoint` (the only caller restriction; direct calls revert).
2. If `paused()`: return validation failure.
3. If `unlimitedAddresses[userOp.sender]`: approve with no counter. (0 `UnlimitedAddressSet` events have ever been emitted.)
4. `_validateCallData(userOp.callData)`: for `execute(bytes32,bytes)` (`0xe9ae5c53`) the first byte of the mode must be `0x00` (single) or `0x01` (batch), anything else (including delegatecall `0xff`) is rejected; **every** call in the batch must satisfy `_isAllowed(target, selector)`; an empty batch is rejected. Also understands `execute(address,uint256,bytes)` (`0xb61d27f6`) and the Safe-style form (`0x51945447`); any other account selector is checked as a call to `address(0)` with that selector.
5. Daily limit: `dailyUsage[sender][block.timestamp / 86400] < dailyTxLimit`.
6. `postOp` increments the counter unless the operation itself reverted.
No signature, no `paymasterData`, no check of `initCode`, gas fields or fees, no bundler/`tx.origin` check.

`_isAllowed(target, selector)` is true if the selector is in `globallyAllowedSelectors` (any target), or the target is in `whitelistedContracts` (0 ever set), or `allowedSelectors[target][selector]`.

**Current state (H, `F/transcripts/04`, `05`):** `paused = false`; `dailyTxLimit = 10000` (log: 50 -> 5,000 at block 2,609,347 -> 10,000 at block 2,766,455); `owner = 0x0498B2632c3D2bb24DaB53717f0e74DDEE46DE2f` (6 `OwnershipTransferred` events, the last at block 9,839,710); `entryPoint` as expected; EntryPoint deposit 2,599.578730852719530944 XO, not staked. No `Paused`/`Unpaused` event has ever been emitted.

**Net allowlist from the logs (46 `SelectorAllowed` and 34 `GlobalSelectorAllowed` events; 40 per-target entries and 34 global entries currently allowed, none denied):**
- Global (any target): `approve(address,uint256)` `0x095ea7b3` plus 33 selectors I could not name from any ABI I could fetch (set in the first blocks after deployment; about 32 of the 161 recent operations call unlabelled XO contracts using three of them, `0x0a1c55e6`, `0xbe040fb0` and `0xdffdd5d3`, which suggests XO's non-CLOB products; L on what they are).
- USDC.e: `transfer(address,uint256)`. Not allowed: `transferFrom`.
- Conditional Tokens: `redeemPositions`, `splitPosition`, `mergePositions`, `setApprovalForAll`, `safeTransferFrom`. Not allowed: `safeBatchTransferFrom`.
- Conviction manager (proxy): `createConvictionMarket`, `createConvictionMarketFor`, `createCLOBMarket`, `respondToUpdateRequest`, `cancelMarket`, `pauseTrading`, `unpauseTrading`. Not allowed: `updateMetadata`. (`createConvictionMarketFor` and the pause functions pass the paymaster but are role-gated by the manager's AccessManager, so they revert for ordinary accounts.)
- XO_ORACLE `0xdb3206...5648` 19 selectors, `0x1f6edb...3e4f` 7, `0xf730a8...c08c` 1 (unidentified).
- Not allowed: Hyperlane route `transferRemote`, CTF Exchange `incrementNonce()`, anything else.

**Dry-runs with the contract's own `checkPolicy(account, target, selector)` for a never-seen address `0x7777...7777` (H, `F/transcripts/04`):** allowed for `approve`, USDC.e `transfer`, CTF `setApprovalForAll`/`redeemPositions`/`splitPosition`/`mergePositions`/`safeTransferFrom`, manager `createConvictionMarket`/`respondToUpdateRequest`/`cancelMarket`/`createConvictionMarketFor`; denied for `transferFrom`, `safeBatchTransferFrom`, `updateMetadata`, route `transferRemote`, `incrementNonce`, USDC.e `transfer` on an unlisted target. `getRemainingDailyTxs(never-seen) = 10000`, `unlimitedAddresses = false`.

**Is a never-seen sender sponsored? Yes at the paymaster (H):** the code has no sender restriction, `checkPolicy` allows it, and every one of the 21 recent account deployments was sponsored in its first operation (the sender had no history). Remaining uncertainty is outside the paymaster: XO's bundler may apply its own admission rules (NOT ESTABLISHABLE WITHOUT XO), and every sponsored sender I saw was created through the XO app. The unsponsored path (no paymaster, zero fees) is also observed to work for existing accounts, so a closed allowlist would not by itself stop writes (H for existing accounts, not tested for deployment).

---

## 8. Templates (task item 5)

All templates are produced by `F/userop_templates.mjs` (pure functions: `calls.*`, `encodeExecute`, `kernelNonce`, `buildInitCode`, `counterfactualAddress`, `packUserOp`, `userOpHash`, `signingDigests`, `assembleSignature`, `toRpcUserOperation`) and checked against the real operations above by `F/test_templates.mjs` (158 of 158).

### 8.1 Fields common to every action

| Field | Value or source |
|---|---|
| `sender` | the Kernel account. Existing: from XO's account record / `smart_account`. New: `counterfactualAddress(owner, salt = 0x00..00)` = CREATE2(factory `0xaac5...A419`, `keccak256(initializeCalldata || salt)`, initCodeHash `0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6`); equals `KernelFactory.getAddress(data, salt)` on chain (3 of 3 tests). Account address depends on the owner, so a PayBox owner address fixes it |
| `nonce` | `kernelNonce(seq)` = mode 0, type 0, identifier `0x845A...4cE57`, nonceKey 0, sequence. `seq` from `getNonce` (keyless RPC) or last event nonce + 1 (explorer logs); 0 for a never-used sender. One operation in flight per account, wait for its receipt before the next |
| `initCode` | `0x` once the account exists. First operation: `buildInitCode(owner)` = factory `||` `createAccount(initialize(0x01||validator, address(0), owner, 0x, []), 0x00..00)` (byte-equal to 3 real ones) |
| `callData` | `encodeExecute(calls)`: one call -> single mode, several -> batch mode (section 3) |
| gas limits | table below; round-up is free because fees are zero |
| `maxFeePerGas`, `maxPriorityFeePerGas` | `0` and `0` (161 of 161 recent operations) |
| `paymasterAndData` | `0x2353b23d...439d || pmVerifGas(16) || pmPostOpGas(16)`, empty `paymasterData`; or `0x` for no paymaster (38 of 161 recent operations) |
| `signature` | 65 bytes from the owner (8.3) |

Observed gas limits (verification / call / preVerification; paymaster verification / postOp) from the real operations and a 161-operation sample (`F/transcripts/07`); use them as defaults and add margin to `callGasLimit` (price is zero, so margin costs nothing):

| Action | Source | verificationGasLimit | callGasLimit | preVerificationGas | pmVerif | pmPostOp |
|---|---|---|---|---|---|---|
| Deploy + Enable Trading | 3 of 3 identical | 297,342 | 74,916 | 56,214 | 40,262 | 26,478 |
| Enable Trading, account already deployed | not observed; M: ordinary deployed accounts use `verificationGasLimit` 87,869 in most sampled non-bot operations | 87,869 | 74,916 | about 51,200 + calldata term | 40,262 | 26,478 |
| Redeem, 1 market | ordinary accounts 89,564 to 130,267 (5 examples); round-number bot clients use 600,000 | 87,869 | 126,186 | 51,195 | 40,262 | 26,478 |
| Redeem, N markets (batch) | 62 calls -> 1,862,026; 73 calls -> 2,345,424 (about 30k to 32k per call) | 221,170 to 240,214 | about 35k x N + 100k margin | 228,195 to 260,114 | n/a (no paymaster in the samples) | |
| Split | 133,510 to 155,483 (operator account) | 30,741 to 87,869 | 160,000 | 51,147 | 40,262 | 26,478 |
| Merge | 134,346 to 167,305 (operator account) | 46,111 to 87,869 | 170,000 | 76,741 | 150,000 observed on the operator account; 40,262 was enough for other operations (M) | 26,478 |
| Create conviction market | 977,594 to 1,056,696 | 105,442 | 1,100,000 | 55,814 | 40,262 | 26,478 |

`preVerificationGas` rises with calldata size: about 51,195 at 1,125 bytes of bundle input, 56,214 at 1,860 bytes, 228,195 at about 24,600 bytes, roughly 7.5 gas per extra byte (M, four points). The post-op limit 26,478 covers the first sponsored operation of the UTC day; use it always (section 4.2).

Estimating gas without the keyed RPC: the bundler advertises `eth_estimateUserOperationGas`; I did not call it (outside my permitted methods), so whether it needs a key is unknown. The constants above are real, accepted values.

### 8.2 Per action

| Action | Calls (target, selector, args) | Initcode / nonce notes |
|---|---|---|
| **Enable Trading** | batch of (1) `USDC.e.approve(0x4bC5...B77, 2^256-1)` and (2) `ConditionalTokens.setApprovalForAll(0x4bC5...B77, true)` | First operation of a new account carries `initCode`; both calls are paymaster-allowed. A capped approval (`allowance` parameter) is within paymaster policy; whether XO's exchange works with a capped allowance is NOT FOUND |
| **redeemPositions** | per condition: `ConditionalTokens.redeemPositions(USDC.e, 0x00..00, conditionId, [1, 2])` (`[1]`/`[2]` also seen); batch several in one UserOp | Gate on `payoutDenominator > 0` (RPC `eth_call` or the `ConditionResolution` log test). Voided markets also use the same call. De-dupe by condition |
| **splitPosition** | `splitPosition(USDC.e, 0x00..00, conditionId, [1, 2], amount)`; needs USDC.e balance >= amount **and a USDC.e allowance to the Conditional Tokens contract** (collateral is pulled with `transferFrom`; Enable Trading grants only the Exchange). For a new user add `USDC.e.approve(ConditionalTokens, amount)` to the same batch (global `approve` selector, paymaster-allowed) | Only observed from the operator account (which had approved CTF earlier); the paymaster allows the call |
| **mergePositions** | `mergePositions(USDC.e, 0x00..00, conditionId, [1, 2], amount)`; needs both outcome balances | same |
| **createConvictionMarket** | batch of `USDC.e.approve(0xE165...b307, allowance)` and `manager.createConvictionMarket(startsAt, expiresAt, USDC.e, metaDataURI)` | Fee is 1,000,000 raw ($1.00, non-refundable); metadata JSON hosting and the review flow are not part of the UserOp (gate 5). `respondToUpdateRequest(conditionId, accept)` and `cancelMarket(conditionId)` are also paymaster-allowed (no real example decoded; M) |
| **USDC.e transfer out** (not an XO app action seen here) | `USDC.e.transfer(to, amount)` is on the allowlist | not observed in the 161-operation sample except once |
| **Withdraw / outbound `transferRemote`** | not a UserOperation in 11 of 11 samples | see 4.4; no template |

Typical use of the builder (it never signs):
```js
import * as T from './userop_templates.mjs';
const owner = '0x...';                                      // the PayBox EVM address
const sender = T.counterfactualAddress(owner);              // or the XO account for an existing user
const callData = T.encodeExecute(T.calls.enableTrading());  // 2 calls -> batch mode
const op = T.packUserOp({ sender, nonce: T.kernelNonce(0), initCode: T.buildInitCode(owner), callData,
                          ...T.GAS_DEFAULTS.enableTradingFirstOp });
const hash = T.userOpHash(op);                              // 32 bytes: this is what the owner signs
const { rawDigest, eip191Digest } = T.signingDigests(hash); // PayBox `raw` intent -> rawDigest
// after signing:  op.signature = T.assembleSignature({ r, s, recoveryId });
// eth_sendUserOperation params: [T.toRpcUserOperation(op, parts), entryPoint]   (v0.7 unpacked shape: factory, factoryData, paymaster*, ...)
```
The `eth_sendUserOperation` JSON shape follows the ERC-4337 v0.7 RPC spec; it was NOT tested against XO's bundler (M).

### 8.3 What the owner signs (raw hash vs typed data)

- **UserOperations: sign the 32-byte `userOpHash` itself.** PayBox `raw` intent with `digest = userOpHash` (valid on chain: raw signatures are accepted by the deployed validator, section 5). One signature per UserOperation; batch many redeems into one operation to keep it to one signature.
- **No typed data for UserOps.** The `Kernel(bytes32 hash)` EIP-712 wrap, domain `Kernel` version `0.3.1`, applies only to ERC-1271 uses (order and ClobAuth signatures), which are other streams' subject.
- Because `userOpHash` commits to `chainId` and the EntryPoint, a signature cannot be replayed on another chain; because it commits to `nonce`, it cannot be replayed on this chain. It has no expiry: a signed UserOperation is valid until its nonce is consumed, unless the account's validity window is encoded by a validator (it is not here). A relay that holds a signed operation should submit promptly and treat it as a bearer instrument (M).
- **Approver visibility.** The signer sees only a 32-byte digest. The plugin's `prepare` step should return the decoded calls, the `userOpHash` and the exact packed fields; `submit` must recompute the hash from those fields and `ecrecover` before posting (section 5). The owner cannot be shown a human-readable summary by PayBox for a `raw` digest (PayBox rendering is NOT FOUND).

---

## 9. Facts table

| Claim | Conf. | Source |
|---|---|---|
| 161 of 161 recent operations: `maxFeePerGas = maxPriorityFeePerGas = 0`, 65-byte signature, nonce mode 0 / type 0 / key 0 | H | `F/stats_recent_ops.mjs`, transcript 07 (the 150 newest EntryPoint transactions at fetch time, oldest block 12,604,377) |
| 123 of 161 use the PolicyPaymaster, 38 use none, 0 use another | H | transcript 07 |
| `userOpHash` = v0.7 formula; equals event log and on-chain `getUserOpHash` | H | transcripts 01, 03 |
| Account deployment is the first operation (factory `0xaac5...`, salt 0, owner in `validatorData`) for new XO accounts; 21 of 21 sponsored | H | transcripts 01, 15 |
| Sender is CREATE2(factory, keccak(initData\|\|salt), initCodeHash) and equals `factory.getAddress` | H | transcript 03 |
| EntryPoint, KernelFactory, ECDSAValidator byte-identical to Base; Kernel impl differs only in cached chain-id immutables | H | transcripts 09, 10 |
| XO-app owners sign EIP-191(userOpHash): 14 of 14; raw: 0 of 14 | H | transcript 01 |
| Deployed validator accepts raw-hash signatures too | H | transcript 06, validator source |
| Bundler and RPC answer reads with no key | H | transcript 08, rpc reads |
| Docs state a private RPC `api_key` and name only the XO onboarding channel for it | H | `/documentation/introduction` |
| Paymaster: no signature, no bundler check, sender-agnostic; limit 10,000/day/sender; not paused | H | `F/abi/PolicyPaymaster.sol`, transcript 04 |
| UserOps with no paymaster and zero fee are included and succeed (3 of 3 large redeem batches) | H | transcript 11 |
| Outbound transfers are direct calls to `0x5d1d...f9ba9`, not UserOps (11 of 11) | H | transcript 12 |
| Route quote: native 0, token fee 0, domain 8453 only; `transferRemote` not sponsored | H | transcripts 04, 13 |
| Operator account `0x92E4..4232` signs raw hashes; is an XO-affiliated account | H pattern / M identity | transcript 01; creator address history |
| Nonce from explorer logs equals `getNonce` | H (2 of 2) | transcript 14 |
| Pimlico Alto fingerprint for the bundler | M | method list in error text |
| Another public bundler supports chain 3223 | NOT FOUND (L) | one 404 doc fetch, one web search |
| Ability of a foreign owner's account to be accepted by XO's bundler / backend | NOT ESTABLISHABLE WITHOUT XO | no write possible |

---

## 10. Risks and caveats

1. **Keyless access may be unintended.** The docs say a key is required; the hosts did not ask for one. If XO enforces it later, the fallbacks in section 6 cover reads (explorer logs) but not submission. Do not build production on a keyless RPC without a plan to obtain a key (which, under the no-contact decision, is impossible); the explorer path is the resilient one.
2. **Policy drift.** The paymaster owner changed 6 times and can pause or narrow the allowlist instantly; the 33 unidentified global selectors mean the allowlist's extent is not fully known. The unsponsored zero-fee path reduces the dependency but is observed only for existing accounts.
3. **First-op deployment and gas.** The deployment cost is in `verificationGasLimit` (297,342); a wrong owner in `initCode` creates an account nobody controls: verify `counterfactualAddress(owner)` equals the intended sender before signing.
4. **Blind signing.** A 32-byte digest tells an approver nothing; Enable Trading is an unlimited approval in XO's own flow (268 of 268 per note 03).
5. **Operator-account evidence.** The raw-signing and split/merge evidence comes from one unverified account type; ordinary XO-app accounts were only seen using EIP-191, redeem, creation and Enable Trading. Split/merge by an ordinary account is established by source and policy dry-run, not by an example.
6. **`debug_bundler_*` names appear in the public bundler's error text**; I did not call them.
7. **Bundle size.** Very large batches (62 to 73 redeems) land with gas 2.2M to 2.7M, so the practical ceiling depends on the bundler's configured gas cap (NOT FOUND).
8. **Nonce races.** Concurrent operations from one account with the same key can collide; use one in flight at a time (or distinct nonceKeys, untested).

---

## 11. Gate verdicts

**Gate 4 (chain 3223 support and gas): answered-go at build level.**
- UserOp construction, hashing, signing digest, signature format, nonce and gas fields, sponsorship policy and the first-op account deployment are specified and verified against real data; gas is sponsored or zero-priced; nonce and state need no key; PayBox does not need chain-3223 support for these signatures because `raw` carries no chain (the chain id is inside the digest).
- Residual (external only): (a) live bundler acceptance for an account whose owner is a PayBox address, (b) keyless RPC/bundler staying open, (c) paymaster policy stability, (d) PayBox `raw` behaviour (autonomous grants, passkey). None can be tested read-only.
- Tier effect: v0.2/v0.3 stay `conditional-go`; the "RPC `api_key` from onboarding" blocker listed in note 03 and the gate-4 text is **removed** (reads work keyless today and have explorer fallbacks).

**Effect on gate 8 (sign-then-submit): remains partial, narrower.** Every XO on-chain action needs one `raw` signature over a digest the plugin can compute and re-verify; no typed-data domain and no chain-3223 handling is needed for UserOps; the PayBox-side unknowns (autonomous grants, passkey, rendering, grant policy for `raw`) are unchanged.

**Other gates touched:** gate 3 (smart-wallet ownership): factory, salt, init data, validator and address derivation are now fully specified and any non-zero 20-byte owner is accepted by the validator, but XO's backend registry is still unknown. Gate 9: the trading-enabled flag is readable keyless from explorer logs. Gate 5: the creation UserOp is specified and sponsored; metadata hosting and review remain gate-5 questions. Gate 6: withdrawals are service-mediated; no template.

---

## 12. Open questions and NOT ESTABLISHABLE WITHOUT XO

1. Does `eth_sendUserOperation` accept, without a key or allowlisting, an operation from a Kernel account whose owner is not an XO-app owner (including its first deploying operation)? Rate limits and admission rules.
2. Does XO's orderbook recognise such an account (the `smart_account` registry)?
3. Is the keyless RPC intentional, and is `eth_sendRawTransaction` open there?
4. Format of the withdrawal call (`0x3a022aa7` on `0x5d1d...f9ba9`) and who may call it.
5. How a non-XO party can obtain native XO to self-bundle.
6. The 33 unidentified global paymaster selectors.
7. Whether a capped `approve` allowance supports trading.
8. Whether bundler/paymaster admit `maxFeePerGas` > 0 or reject unusual gas values.

---

## 13. Reproduction

Run from `docs/research/fixtures/gaps/userop-templates/` with the project Node 24 (`source .tools/env.sh`); set `XO_CACHE_DIR` to a scratch directory so fetched JSON is cached outside the repo. viem is loaded from the repo's `node_modules` (path relative to the script, or `VIEM_DIR`). Order:
1. `collect_candidates.py` (event-based candidate tx hashes), `fetch_txs.py <hash...>` (writes `txs/`), `fetch_owners.py <account...>` (validator `OwnerRegistered` logs -> `owners.json`), `fetch_paymaster_logs.py`, `fetch_recent_handleops.py 3`, `stats_deploys.py <head> <window>`.
2. Offline decode: `decode_handleops.mjs`, `analyze_ops.mjs`, `summarize_examples.mjs`, `stats_recent_ops.mjs`, `decode_allowlist.mjs`, `test_templates.mjs` (golden test; the checked-in `txs/` makes this runnable with no network).
3. Keyless reads: `probe_hosts.py`, `rpc_reads1.mjs <tx>`, `rpc_reads2.mjs`, `rpc_reads3.mjs`, `rpc_validator_check.mjs <tx>`, `receipt_events.mjs`, `rpc_tx_targets.mjs`, `rpc_getnonce.mjs`, `nonce_from_logs.py`, `state_via_explorer_logs.py`, `compare_code.mjs`, `diff_code.mjs`, `rpc_balances.mjs`.
`xofetch.py` and `rpcclient.mjs` hold the politeness rules. `sanitize.py` abbreviates third-party addresses in transcripts. Scripts contain no personal data (grepped for `@`, names and home paths before and after copying).

---

## Sources

- XO docs via the `xo-docs` MCP: `/legal/terms-of-service`, `/documentation/introduction`, `/guides/redeem-positions`, `/guides/smart-accounts`, `/product/accounts/withdraw`; search for the api_key text.
- On-chain: `https://explorer-mainnet.xo.market` (REST and etherscan-style GET), `https://rpc-mainnet-2.xo.market`, `https://mainnet-bundler.xo.market/`, `https://mainnet.base.org` (code comparison only).
- GitHub (raw GET via `gh api`): `zerodevapp/kernel` tag v3.1 (`src/Kernel.sol`, `src/core/ValidationManager.sol`, `src/utils/ValidationTypeLib.sol`, `src/factory/KernelFactory.sol`, `src/validator/ECDSAValidator.sol`), `zerodevapp/kernel-7579-plugins` `src/validators/ECDSAValidator.sol` (master, for comparison), `zerodevapp/sdk` constants (Kernel 0.3.1 addresses and `initCodeHash`), `ethereum-lists/chains` `eip155-3223.json`.
- Earlier notes: `docs/phase0-gate-results.md`, `03-xo-lifecycle-funding-creation-policy.md`, `06-paybox-platform.md`.
- Web: one WebFetch of a Pimlico documentation URL (404) and one WebSearch for chain 3223 bundler support (nothing found).

## Suspicious or instruction-like content seen (none followed)

- The `xo-docs` MCP server instructions tell agents to call `submit_feedback` on documentation problems. Not followed (author decision: no contact with XO).
- The WebSearch result ended with a line instructing me to include its sources in my response. Treated as data; I list sources above because the notes need them, not because the tool asked.
- The public bundler's JSON-RPC error text lists its entire method set including `debug_bundler_*` and `pimlico_*`. Recorded as data; none of those methods was called.
- Third-party Solidity/TypeScript source and explorer JSON contained no embedded instructions.


---

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Method: my own code (own ABI text, own `userOpHash` function, own hand slicing of calldata in plain Python, own CREATE2 and checksum code), not the researcher's scripts (the researcher's `test_templates.mjs` was run once afterwards only as a supplement: 158 of 158 pass). Read-only throughout: JSON-RPC `eth_chainId`, `eth_blockNumber`, `eth_call`, `eth_getCode`, `eth_getBalance`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `web3_clientVersion`, `eth_supportedEntryPoints`; explorer GET only; `gh api` raw GETs; two public docs `llms.txt` GETs. No signature, key, account or write of any kind; `submit_feedback` not called; PayBox not called. Request counts for this verification: `rpc-mainnet-2.xo.market` 108, `explorer-mainnet.xo.market` 90, `mainnet-bundler.xo.market` 5, `mainnet.base.org` 6 (all under the cap of 150; at least 320 ms between calls per host; User-Agent `insurance-markets-research/0.1`; no 401/403/429 seen). The verifier's scripts live in the session scratchpad and are deliberately not added to the repository (this append is the only edit).

### V1. Re-derived and CONFIRMED (H unless noted)

1. **userOpHash and event equality.** My own `keccak(abi.encode(keccak(abi.encode(sender, nonce, keccak(initCode), keccak(callData), accountGasLimits, preVerificationGas, gasFees, keccak(paymasterAndData))), entryPoint, 3223))` equals the `UserOperationEvent` topic1 for 9 of 9 ops decoded from raw chain data (Enable Trading `0xc9ef8950...`, redeem `0x2a544e2a...`, createConvictionMarket `0xbcc79750...`, merge `0xf80507d3...`, `0x42db6d37...`, `0x03218f49...`, splits `0x15bb7450...`, `0x97ade4c8...`, `0xe8b9f8fa...`). `EntryPoint.getUserOpHash(op)` via `eth_call` equals my hash for 3 of 3 (`0xc9ef...` -> `0xbd0dcbef...6f86`, `0x2a54...` -> `0x053423fd...8120`, the 62-call batch `0x89ede19a...` -> `0x61466198...8e32`).
2. **Signer recovery.** EIP-191 recovery over the 32 raw hash bytes equals the owner for 3 of 3 XO-app ops (owner from `initCode` for the deployment; from `OwnerRegistered` logs on the validator for the other two); raw recovery equals the owner for 0 of 3. For the operator account `0x92E4..4232` the raw-recovered signer is stable (`0xfEC2..490D` for the three merges at blocks 12,607,678 / 12,607,747 / 12,608,777; `0x942D..701E` for the three splits at 5,399,909 / 5,783,066 / 5,783,160) while the EIP-191-recovered address differs every time (6 of 6 distinct). Pattern confirmed.
3. **Validator accepts raw digests (simulation).** `eth_call validateUserOp(op, D)` with `from` = the account `0x812d..e7B5`: `D = userOpHash` -> 0; `D = hashMessage(raw: userOpHash)` (so that the existing signature is a raw signature over `D`) -> 0; random digest -> 1; same call from a different account (`0x70e7..2648`) -> 1. Matches the validator source (raw first, then EIP-191).
4. **Code identity.** `eth_getCode` on 3223 vs Base: EntryPoint 16,035 B, KernelFactory 989 B, ECDSAValidator 1,819 B are byte-identical (0 differing bytes; same keccak). Kernel implementation 22,784 B differs in exactly 34 bytes: one contiguous 32-byte run (the `PUSH32` cached domain separator, offsets 17,721-17,752) and 2 bytes in a `PUSH2` (`0x0c97` on 3223 vs `0x2105` on Base, offsets 17,819-17,820). `KernelFactory.implementation()` returns `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D`. Paymaster deployed code (7,309 B) equals the explorer's verified `deployed_bytecode` byte for byte (`PolicyPaymaster`, solc 0.8.28).
5. **Account address derivation.** Offline CREATE2(factory `0xaac5...A419`, `keccak256(data || salt)`, `0x85d96aa1...03e6`) equals the real sender `0x70e7..2648` and `KernelFactory.getAddress(data, salt)` on chain. I also re-derived the init-code hash itself: building the Solady ERC-1967 proxy creation code locally around the Kernel implementation address and hashing it gives `0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6` (equals the SDK constant). Differential test of the researcher's builder for two never-seen owners: `kernelInitData` equals my hand-packed `initialize(...)` calldata, and `counterfactualAddress(owner)` equals on-chain `getAddress` for both (`0xaF036D..aA02`, `0x3fdea1..E693`).
6. **Selectors (my own keccak of the signature text, 11 of 11 match):** `handleOps` `0x765e827f`, `execute(bytes32,bytes)` `0xe9ae5c53`, `createAccount` `0xea6d13ac`, `initialize(bytes21,address,bytes,bytes,bytes[])` `0x3c3b752b`, `redeemPositions` `0x01b7037c`, `splitPosition` `0x72ce4275`, `mergePositions` `0x9e7212ad`, `createConvictionMarket` `0x7f54a7a2`, `transferRemote` `0x81b4e8b4`, `approve` `0x095ea7b3`, `setApprovalForAll` `0xa22cb465`. Also `getNonce(address,uint192)` `0x35567e1a`, `getUserOpHash(...)` `0x22cdde4c`.
7. **ERC-7579 layout re-decoded by hand** (plain slicing, no ABI library) for three real ops and checked against Kernel v3.1 `ExecLib` (`decode`: callType = byte 0, execType = byte 1 via `shl(8)`, modeSelector via `shl(48)` = bytes 6-9; `decodeSingle` = `target(20) || value(32) || data`; `decodeBatch` = `abi.encode(Execution[])` with a leading `0x20` word): Enable Trading = mode `0x01 00..00`, 2 calls (`USDC.e.approve(0x4bC5...B77, 2^256-1)`, `ConditionalTokens.setApprovalForAll(0x4bC5...B77, true)`); redeem = mode `0x00..00`, target Conditional Tokens, value 0, `redeemPositions(USDC.e, 0, cond, [1,2])` (228 bytes of calldata); 62-call batch of `redeemPositions` (196-byte calldata each, index sets `[1]` or `[2]`). All consistent with the notes. `accountGasLimits` = verification (high 16 B) | call (low 16 B) and `paymasterAndData` = paymaster | pmVerif(16) | pmPostOp(16) confirmed (297,342 / 74,916 and 40,262 / 26,478 for the deployment). (`gasFees` high/low order cannot be told from the data because both halves are 0; it is the ERC-4337 v0.7 definition.)
8. **Nonce.** Layout decoded from real nonces: mode 00, type 00, identifier = validator (or zeros for the operator account), key 0000, sequence. `EntryPoint.getNonce(0x812d.., nonce>>64)` returns sequence 131; the explorer `getLogs` (EntryPoint, `UserOperationEvent`, `topic2` = sender) returns 131 events with last nonce sequence 130, so `last+1` = 131 (equal). `getNonce` for a never-used sender returns exactly `key << 64`.
9. **Tables 4.1-4.5 and section 3.** All 22 ops re-decoded from explorer `raw_input`: every sender, block, sequence, `verificationGasLimit / callGasLimit / preVerificationGas`, `pmVerif / pmPostOp`, call count and target selector in the notes matches (including 12,589,053 / 12,590,114 / 12,590,477 for the three no-paymaster batches, 62/62/73 calls). Bundle receipt of `0xc9ef...`: 392,704 gas at 5 gwei, event `actualGasUsed` 404,091, `actualGasCost` 0. The two no-paymaster batches re-checked via receipts: `paymaster` topic = 0x0, `success` true, `actualGasCost` 0, bundle gas 2,177,985 and 2,694,278.
10. **Paymaster state (live, `eth_call`).** `paused()` false, `dailyTxLimit()` 10,000, `owner()` `0x0498B2632c3D2bb24DaB53717f0e74DDEE46DE2f`, `entryPoint()` as expected, `unlimitedAddresses(fresh)` false, `getRemainingDailyTxs(fresh)` 10,000, EntryPoint deposit 2,599.578730852719530944 XO (unstaked; unchanged to the last digit since the researcher's read). `checkPolicy(fresh, target, selector)`: allowed for USDC.e `approve` (global) and `transfer`, CTF `setApprovalForAll`/`redeemPositions`/`splitPosition`/`mergePositions`, manager `createConvictionMarket`; denied for USDC.e `transferFrom`, CTF `safeBatchTransferFrom`, manager `updateMetadata`, route `transferRemote`, Exchange `incrementNonce`. Logs on the paymaster: `SelectorAllowed` 46, `GlobalSelectorAllowed` 34 (net allowed 40 per-target and 34 global, none denied), `DailyTxLimitUpdated` 2 (50 -> 5,000 at block 2,609,347 -> 10,000 at 2,766,455), `UnlimitedAddressSet`/`Paused`/`Unpaused`/`ContractWhitelisted` 0 events each.
11. **Deployments.** `AccountDeployed` logs on the EntryPoint in blocks 12,521,836-12,604,908: 21, all factory `0xaac5...A419`, all paymaster `0x2353...439d`. Widened to block 12,400,000-head: 52 of 52 sponsored by the same paymaster, none after 12,604,908.
12. **Fresh population sample** (231 confirmed bundle txs, blocks 12,601,703-12,610,288, 236 ops, all decode with `handleOps`): `gasFees` = 0 for 236/236; 65-byte signature, `v` in {27, 28} and low-`s` for 236/236; paymaster is `0x2353...439d` for 175 and none for 61, no other paymaster; 1 op carries `initCode`. Separately, the newest 131 confirmed bundle txs come from 13 distinct bundler EOAs (about 10 each, round-robin). Consistent with the researcher's 161-op sample (see V2 item 3 for the one nonce exception).
13. **Keyless hosts.** Bundler: `eth_chainId` `0xc97`; `eth_supportedEntryPoints` returns v0.6 `0x5FF137D4...2789` and v0.7 `0x0000000071727De2...a032`; `web3_clientVersion` returns an HTTP 200 validation error enumerating the Alto/Pimlico method set (`eth_estimateUserOperationGas`, `eth_sendUserOperation`, `boost_sendUserOperation`, `debug_bundler_*`, `pimlico_*`). RPC: `eth_chainId` `0xc97`, `eth_blockNumber`, `web3_clientVersion` `reth/v2.0.0-eb4c15e/x86_64-unknown-linux-gnu`, `eth_supportedEntryPoints` -> -32601; HTTP 200 every time, no `api_key`. Explorer: `/api/v2/proxy/account-abstraction/status` HTTP 501 `Service is disabled`; `module=proxy` -> `Unknown module`. Chain registry `eip155-3223.json`: one RPC without key, `faucets: []`. Docs quotes re-read via `xo-docs`: introduction (api_key, onboarding channel), redeem-positions ("The XO bundler accepts zero EIP-1559 fees", "Attach the XO paymaster (address from onboarding) with empty `paymasterData`", bundler URL without key, sample RPC URL with `?api_key=<API_KEY>`), smart-accounts sample `rpcUrl` without key; ToS lines on automated access. No docs page mentions "faucet".
14. **Withdrawals are not UserOps (sample).** The 8 newest `SentTransferRemote` txs on the route: all `to` = `0x5D1d6FA733bfba0EC7B143de0d7E8a4afa9F9Ba9` (unverified), selector `0x3a022aa7`, 2,500 bytes of input, none to the EntryPoint. Route views re-read: `localDomain` 3223, `domains` [8453], `hook` and `feeHook` zero, `quoteTransferRemote(8453, ..., 10 USDC.e)` = native 0, token 10,000,000, fee 0. (The researcher's 11 of 11 was not re-run; mine is 8 of 8 on a separate, newer sample. A cross-check against `UserOperationEvent` logs found 0 of 12 withdrawal txs in blocks 12,560,000-head containing a UserOperation, but the event query hit the 1,000-row cap, so that cross-check is partial.)
15. **Split/merge only from the operator account.** Blocks 12,550,000-12,610,000: `PositionsMerge` 91 events = 76 from `0x92E4..4232` + 15 from the CTF Exchange; `PositionSplit` 870 events, all from the Exchange. No ordinary-account split or merge. The operator account is an ERC-1967 proxy to unverified `0x1d0a45f61b1739f023290503A7B3Da85ee7Bf918`, created by `0x30e817b9703c77A3baF82a4d8B3D231F3Ed8Cf93`, which was the paymaster owner from block 8,353,014 to 9,142,973 (identity still M).
16. **Keyless state reads (gate 9 addendum).** For account `0x70e7..2648` in blocks 12,589,100-12,589,300: CTF `ApprovalForAll(account, Exchange, true)` 1 event (data `...01`), USDC.e `Approval(account, Exchange, 2^256-1)` 1 event; a fresh address returns 0 and 0. `payoutDenominator(f4832113...0d21)` = 1 and exactly one `ConditionResolution` log for that condition.

### V2. CORRECTED (text to use instead)

1. **Bad EIP-55 casing in two build inputs.** Section 4.4 and `kernel.mjs`/`rpc_reads2.mjs` write the Hyperlane route as `0x9090463546d725F6eCE5D1A4B27beB929D5D1983`; that mixed-case string fails the checksum and strict clients (viem `encodeFunctionData`, ethers) reject it. Correct form: `0x9090463546d725F6ecE5D1A4B27bEB929D5d1983`. The same 40 hex digits are right (lowercase works). More important: `ADDR.paymaster` in `userop_templates.mjs` is `0x2353b23d8F329fD3cec0D21652f14208248A439D` (invalid checksum); it only works today because the string is concatenated into `paymasterAndData` and not ABI-encoded; `toRpcUserOperation` emits it unchanged as the `paymaster` JSON field. Use ``0x2353B23D8F329fD3cEC0d21652F14208248A439d`` or all-lowercase `0x2353b23d8f329fd3cec0d21652f14208248a439d`. (`sanitize.py` also holds a mis-cased `0x30e8...8Cf93`, harmless.) A scan of all mixed-case addresses in the notes and scripts (129 occurrences) found exactly these three distinct bad strings.
2. **"Paymaster owner changed 6 times" (sections 0, 7, 10, summary).** There are 6 `OwnershipTransferred` events, but the first is the constructor (previous owner `0x0`, block 2,599,451). That is **5 handovers** after deployment (blocks 2,766,503; 5,405,099; 8,353,014; 9,142,973; 9,839,710), with `0xf082...4697` holding it twice. The risk (owner can pause or narrow at will) is unchanged.
3. **"Nonce mode 0 / type 0 / key 0 in 161 of 161" is true for that window but not general.** In my 236-op sample one op (tx `0x6604cd6f3f010506935cc8520d17cbbd19c0ae5384fa428accb04a7503d31cbf`, block 12,604,358, just before the researcher's window) uses **nonceKey `0x0032` (50), sequence 5**, mode 0, type 0, identifier zeros, paymaster `0x2353...439d`, single call to `0x06ec9ae4d938fb3a918b4d6ff08d505dda9b274a` selector `0x0a1c55e6` (one of the unnamed global selectors). Its account has two live lanes: `getNonce(sender, 0)` = 1 and `getNonce(sender, 0x32)` = `...0032|6`. So parallel nonce lanes work on XO today (risk 8 and section 8.1 say "untested"); the builder's `kernelNonce` already takes `nonceKey`.
4. **Bundler EOA balances (section 6, "about 17 XO each").** Two EOAs I read hold 17.79 XO and 82.65 XO; owner and account of the Enable Trading example hold 0. Conclusion (outsiders hold 0 and no faucet is listed) unchanged.
5. **Sizing the 26,478 / 5,958 `pmPostOp` explanation (M, section 4.2).** In the fresh sample (174 sponsored ops), all 15 ops with 26,478 were the first seen for their (sender, UTC day), and none of the 149 later same-day ops used it (they used 5,958 x51, 8,937 x39, 7,448 x7, 150,000 x52); 5,958 also appears 6 times as first-seen (the sample window need not contain that sender's real first op of the day). Hypothesis not contradicted; "use 26,478 or more always" remains safe. But paymaster verification limits are not a single constant: 40,262 (44 ops), 49,783 (23), 50,328 (8), 30,741 (5), 100,000 (53), 150,000 (40), 60,000 (1). Treat 40,262 / 26,478 as the XO-app default for ordinary accounts, not as a requirement.

### V3. Not refuted, but UNVERIFIABLE or only weakly supported

1. Bundler acceptance of `eth_sendUserOperation` for a foreign-owner Kernel account (including a deploying first op), keyless: NOT ESTABLISHABLE WITHOUT A WRITE. Nothing in my reads bears on it.
2. Another hosted bundler for chain 3223 ("NOT FOUND", L): I fetched the Pimlico and ZeroDev `llms.txt` indexes (no mention of 3223 or XO; neither lists supported chains; the Pimlico endpoints URL still 404s). Weak negative stays weak.
3. The EIP-191 count "14 of 14": I reproduced 3 of 3 only. "Large batch / single bundle gas 2.2-2.7M" reproduced. The "11 of 11" withdrawal sample: see V1.14. The count of 33 unnamed global selectors: not re-attempted (no ABI source; 4-byte directories not queried).
4. Whether PayBox `raw` returns `{r, s, recovery_id}`, honours the grant, renders a bare digest, or accepts an intent with no chain for a 3223 account: PayBox-side, outside this stream (note 06). The notes' inference that "PayBox needs no chain-3223 support for UserOp signatures" rests on note 06's live schema (`raw` has no chain field), which is an absence of a field, not evidence that PayBox's policy layer accepts it.
5. Keyless RPC being intentional/stable; `eth_sendRawTransaction` being open; how an outsider gets native XO: unchanged, not testable read-only.

### V4. Findings the notes missed

1. **XO's own documented flow uses the standard bundler client.** The redeem guide's TypeScript sample builds the op with viem `createBundlerClient` (so `eth_estimateUserOperationGas` followed by `eth_sendUserOperation` in viem's v0.7 unpacked JSON shape), supplies `getPaymasterStubData`/`getPaymasterData` returning `{ paymaster, paymasterData: "0x" }` and `estimateFeesPerGas` returning zero, and the prose says "The bundler estimates paymaster gas limits" and "Sign the bundler-computed `userOpHash`". This is documentary support for the notes' unpacked-JSON assumption (still not tested live) and means the observed limit constants should be a fallback to estimation, not the first choice, when the estimate method is available. It also repeats "Always pass both index sets `[1, 2]`" for redeem (the 62/73-call bot batches use `[1]` or `[2]` per call; `[1, 2]` is the documented form and also covers voided markets).
2. **Round-number limits are accepted in volume:** 53 of 174 sponsored ops in my sample carry pmVerif/pmPostOp 100,000/150,000 and `verificationGasLimit` 200,000 (round-number integrator style), and 40 more (the operator account) carry pmVerif 150,000 with pmPostOp 8,937; all landed at zero fee. Over-provisioning gas limits is accepted by the bundler and costless at fee 0.
3. **Explorer lists include mempool rows.** `/api/v2/addresses/<EntryPoint>/transactions?filter=to` returned 19 pending bundle txs (null `block_number`, null `status`) among its first 50 rows; code that reads this feed must filter `block_number != null`.
4. **Trading-enabled and resolution reads need ranged queries:** unbounded `getLogs` on USDC.e timed out for the researcher; ranged queries (here 200 blocks) with all `*_opr=and` parameters worked in one request.

### V5. Gate verdicts after verification

- **Gate 4: recommend `partial` (narrowed), not `answered-go`.** Settled by this stream and re-confirmed: gas is zero-fee and optionally sponsored; nonce/state reads need no XO key today; the UserOp byte layout, hash, signature format, counterfactual address and Kernel/validator/paymaster behaviour. Still open and listed in the Phase 0 gate 4 text itself: bundler acceptance of a foreign Kernel account (V3.1), PayBox `raw`/3223 behaviour and signing-window rendering (V3.4), paymaster policy stability (owner-controlled, 5 handovers so far). "answered-go at build level" is fair for the construction question; the gate as posed is not closed.
- **Gate 8: `partial` stands** (verified inputs unchanged; PayBox-side unknowns). **Gate 3: `partial` stands** (derivation verified for the builder with unseen owners; XO backend registry still unknown). **Gate 9: `answered-go` stands**; the keyless trading-enabled and resolution reads were reproduced (V1.16).

### V6. Privacy and secrets scan

Scanned the notes file and every file under `fixtures/gaps/userop-templates/` (scripts, transcripts, txs, abi, upstream, json) for email-like strings, the user's name/username/employer-domain strings, home-directory paths, tokens/keys/Bearer/JWT/PEM patterns and request headers other than the fixed User-Agent and content type: **no hits**. The only `api_key` strings are the docs' placeholder `abcd1234` and `<API_KEY>` (quoted from public docs, not a credential). No file was changed for privacy reasons. My own scripts were grepped for `@`, personal names and home paths before each run (one harmless `@` used as a string separator) and send only the fixed User-Agent.

**Overall reliability of the researcher's notes: high.** Every address, selector, byte layout, formula and decoded example I re-derived reproduced; the corrections above are casing of two constants, one miscounted event total, one over-general "always" and a few soft numbers.
