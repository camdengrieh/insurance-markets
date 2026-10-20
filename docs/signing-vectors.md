# Signing vectors: golden values and independent verification

Status: sections 2 to 7 were verified by three methods on 2026-10-19. Sections 8 to 11 (UserOp hashes and signatures, account derivation, funding calldata, order fee-bound arithmetic) were added the same day for the v0.2 build and use the same three methods plus a fourth, M4, the real contract code on a local chain, wherever a contract can answer. This file records the exact inputs and outputs behind `test/signing-vectors.test.ts` and the other tests named in each section, and states what each method does and does not prove. Every value is marked with whether a committed test pins it as a literal; **a value no committed test pins is marked unverified as a regression guard**, although it was reproduced by the scripts in section 12 when this file was written. Nothing here was sent to XO, nothing was signed with a real key (only the public Anvil/Hardhat test keys), and no PayBox tool was called.

Code under test: `src/xo/signing/*.ts` (pure functions, no network, no key handling), `src/xo/account/derive.ts`, `src/xo/userop/*.ts`, `src/xo/funding/calldata.ts` and the fee-bound functions of `src/xo/signing/amounts.ts`. Tests on the last run (2026-10-19, project toolchain, Node 24.21.0): `test/signing-*.test.ts` 192 tests, 191 pass, 1 skipped, 0 fail (`test/signing-vectors.test.ts` 29 tests, 28 pass, 1 skipped; `test/signing-verify.test.ts` 35; `test/signing-amounts.test.ts` 48); `test/userop-golden.test.ts` 43; `test/userop-pack-hash.test.ts` 30; `test/userop-sign-verify.test.ts` 18; `test/userop-anvil.test.ts` 32 (31 pass, 1 reported as `todo`, see section 8); `test/account-derive.test.ts` 21; `test/funding-calldata.test.ts` 38. The one skipped test is the OpenAPI sample vector of section 7.

## 1. Methods

| Method | What it is | Shares code with `src/` |
|---|---|---|
| M1 | The implementation: viem `hashTypedData` and `hashStruct` through `src/xo/signing`, ECDSA by viem `privateKeyToAccount(...).sign({ hash })` (RFC 6979, so deterministic) | it is the implementation |
| M2 | Hand-rolled EIP-712: 32-byte words joined with `concat` and hashed with `keccak256` (viem utils only, no typed-data helper, no `src/` import), `bytes16` right-padded by hand; HMAC by RFC 2104 from the bare SHA-256 primitive; signatures from `signTypedData` over the Kernel JSON | no |
| M3 | Foundry `cast` 1.7.1 (`cast keccak`, `cast abi-encode`, `cast calldata`, `cast wallet sign --no-hash` over the digest and `cast wallet sign --data` over the typed-data JSON, `cast wallet verify`), and `openssl dgst -sha256 -mac HMAC` for the HMAC values. Offline commands only | no |
| M4 | The real contract code on a local anvil chain with id 3223 (the ERC-1271 check in section 6, and sections 8 and 9): the captured EntryPoint v0.7, KernelFactory 0.3.1, ECDSA validator and Kernel implementation runtime bytecode (`test/fixtures/bytecode/`, captured once from the public explorer on 2026-10-19) installed with `anvil_setCode` at their real addresses, then `EntryPoint.getUserOpHash(op)` and `KernelFactory.getAddress(initData, salt)` called with `eth_call`. No network once the bytecode is on disk | no (it calls the contracts; the test harness is `test/anvil/chain.ts`) |

M1 and M2 are both in the committed test file `test/signing-vectors.test.ts` (M2 helpers: `handOrderStructHash`, `handWrap`, `handClobStructHash`, `handHmacSha256`, and `signTypedData` over the Kernel JSON), so a regression shows up in `pnpm run unit`. The tables below come from running M1, M2 and M3 over every vector once, side by side, and comparing the outputs programmatically. Every hash and signature in the tables of sections 3 to 5 is pinned as a literal in a committed test, except the following (found by searching every test file for each literal when this file was updated): the `wire` rows for vectors A, B, C and L1c (plain concatenation of `0x01`, the validator and the signature; only the L1a wire value is a literal in a test, and `test/signing-signature.test.ts` covers the concatenation), the `structHash` of vector B (its `orderHash` and everything after it is pinned, and those are computed from it), and the `kernelDomainSeparator` for L1c (it feeds the pinned wrapped digest). An earlier version of this file said the wire row of vector B was pinned; it is not. The M3 script (section 12) needs Foundry and openssl on the machine, so the test suite does not run it, and its results are the literals the tests pin.

Result for sections 3 to 5: 48 values were compared across M1, M2 and M3. All agree. Inside M3, the two signing routes (`--no-hash` over the wrapped digest, and `--data` over the typed-data JSON with an explicit `EIP712Domain`) returned byte-identical signatures for all 5 signed vectors, and `cast wallet verify --no-hash` recovered the test owner for each.

## 2. Common inputs

- Test key: Anvil/Hardhat default account 0, a PUBLIC TEST KEY, never fund it. Owner address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`.
- `SMART` (the maker / Kernel account) is XO's documentation placeholder `0xCAFE000000000000000000000000000000000A11`. The mixed-case spelling in the docs does not carry a valid EIP-55 checksum, so the code requires the lower-case spelling `0xcafe000000000000000000000000000000000a11` (same 20 bytes, same hashes). Mixed-case addresses with a wrong checksum are refused on purpose.
- Order domain: name `XO Market CLOB`, version `1`, chainId `3223`, verifyingContract (CTF Exchange) `0x4bC5E872256D12E6017dfe466E04c867DC761B77`.
- Kernel domain: name `Kernel`, version `0.3.1`, chainId `3223`, verifyingContract = the smart account. Struct `Kernel(bytes32 hash)`.
- ClobAuth domain: name `ClobAuthDomain`, version `1`, chainId `3223`, no verifyingContract. Struct `ClobAuth(address address,string timestamp,uint256 nonce,string message)`, message `This message attests that I control the given wallet`.
- Validator in the wire signature: `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`.
- Order fields not listed per vector are: beneficiary zero address, nonce 0, identifier 16 zero bytes, metadata 32 zero bytes, signatureType 3, maker = signer = `SMART`.

"In notes" below is computed, not typed: the script that generated this file searched `docs/research/01-xo-auth-signing.md` and `docs/research/07-xo-bot-reference.md` for each value. "new" means the value is not in either note (an extra vector added here).

## 3. Order and Kernel vectors

Vector A (note 07 section 4 "vectorA"): BUY, tokenId `123456789`, price `0.42`, 10 shares, so makerAmount `4200000`, takerAmount `10000000`; salt `99`; expiration `1791389400`.

#### Vector A

| Item | Value (all three methods) | In notes |
|---|---|---|
| structHash | `0xb93cda9d1a93acbd73dce8fbf06235ad4b4f0cfa91ec4b58fcbff6e1ca31698b` | note 07 |
| orderHash | `0xe7a911054f6ac70d4afd6d707d45e3922ed778547ff13f39d7819a32f78b0de6` | note 07 |
| kernelDomainSeparator | `0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818` | note 01, note 07 |
| wrappedDigest | `0xdf106666fb338795075dccfe9b7a3f3fd818d15cca3be9c2887f5a46d2d198c3` | new |
| ecdsa | `0xaa9df47dc49d0875e2021cbd1ba9526bab15b7209a7829848f4c8badfc3e7eff2c5a008bf2c2423f6b7f4f98dc92ec60e9d17fa65fb7594b3f3c341af85b57db1c` | new |
| wire | `0x01845adb2c711129d4f3966735ed98a9f09fc4ce57aa9df47dc49d0875e2021cbd1ba9526bab15b7209a7829848f4c8badfc3e7eff2c5a008bf2c2423f6b7f4f98dc92ec60e9d17fa65fb7594b3f3c341af85b57db1c` | new |

Vector B (note 07 "vectorB"): BUY, tokenId `5`, price `0.3`, 4 shares, so makerAmount `1200000`, takerAmount `4000000`; salt `7`; expiration `0`.

#### Vector B

| Item | Value (all three methods) | In notes |
|---|---|---|
| structHash | `0x3c04190bd4c84a054e05a8380839a8da4950cc623466c01f48a2d5dc46bba86e` | new |
| orderHash | `0x82a01039202b975f6e72df3548784073a752df292a9fd4a4b6a4254e2354c8ff` | note 07 |
| kernelDomainSeparator | `0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818` | note 01, note 07 |
| wrappedDigest | `0xe1da1e6981c60c8be06301adf795d277e69fa7b96e7201ad797d68dfaaf16158` | note 07 |
| ecdsa | `0x29b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c1c` | note 07 |
| wire | `0x01845adb2c711129d4f3966735ed98a9f09fc4ce5729b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c1c` | note 07 |

Vector C (new, not in the notes): SELL of 7 shares at `0.123` (makerAmount `7000000`, takerAmount `861000`, the amounts in note 07 section 3 test 1) with every other field non-trivial, to cover what the note vectors leave out (the note 01 verifier flagged that `bytes16` right-padding was never exercised): salt `2^256 - 1`, tokenId `113287701564209339913693347405685749986285999146352375265161592243948562084773` (a real XO token id from `docs/research/fixtures/xo/`), beneficiary `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (Anvil account 1, public), expiration `1791389460`, nonce `2^128 - 1`, identifier `0x0102030405060708090a0b0c0d0e0f10`, metadata `0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899`, side `1`.

#### Vector C

| Item | Value (all three methods) | In notes |
|---|---|---|
| structHash | `0xc80d98c1233fa0e827b2733f6ac33b9b56ba6e376353056c67d4851b1de9eb68` | new |
| orderHash | `0x57b93ade0040dd11ac27a5bf243448862cb5eb37548f51b95b6d3b581caf7b17` | new |
| kernelDomainSeparator | `0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818` | note 01, note 07 |
| wrappedDigest | `0xcaf7295dd1a3fea94b7eb5bec3eca6a2eca718b346a6801d14e74b05c06d5b76` | new |
| ecdsa | `0x4db6ae48af737b995315eff1191be23097eda05175919e23cff294e130e2cd095e53124e9ab537cddd7c782571c2a71325d39b356b72f519d3336f70bc165fba1b` | new |
| wire | `0x01845adb2c711129d4f3966735ed98a9f09fc4ce574db6ae48af737b995315eff1191be23097eda05175919e23cff294e130e2cd095e53124e9ab537cddd7c782571c2a71325d39b356b72f519d3336f70bc165fba1b` | new |

#### Type hashes and domain separators

| Item | Value (all three methods) | In notes |
|---|---|---|
| ORDER_TYPEHASH | `0x17df2a5febe57967a2c9c03de6869c37c67cff602ecbe4f734aad39de2b172ef` | note 01, note 07 |
| EIP712Domain(name,version,chainId,verifyingContract) typehash | `0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f` | note 07 |
| EIP712Domain(name,version,chainId) typehash (ClobAuth) | `0xc2f8787176b8ac6bf7215b4adcc1e069bf4ab82d9ab1df05a57a91d425935b6e` | note 07 |
| KERNEL_WRAPPER_TYPE_HASH | `0x1547321c374afde8a591d972a084b071c594c275e36724931ff96c25f2999c83` | note 01, note 07 |
| CLOBAUTH_TYPEHASH | `0x52578c5c725a28a84fedc8c22aa47947822942f35b4dc350db028e45320e035c` | note 01, note 07 |
| Order domain separator | `0x377cb2cbb6c9bcc7400f72694c6fc43a929de4faf9ee0ce851a8c2cdd02260ae` | note 01, note 07 |
| ClobAuth domain separator | `0x44e30cd10e3df85b868a7b3850e9e35945475365c26a07680811e3ff1e85197b` | note 01, note 07 |

`KERNEL_WRAPPER_TYPE_HASH` also equals the constant in `zerodevapp/kernel` tag v3.1 `src/types/Constants.sol` line 60 (section 6).

## 4. ClobAuth (L1) vectors

L1a (note 07 "clobAuth"): address `SMART`, timestamp `"1791389400"`, nonce `0`.

#### L1a

| Item | Value (all three methods) | In notes |
|---|---|---|
| structHash | `0x0ddf259e437daad4d3e598a2e635eae681993f4b0c2e3ff53b4046db434c562f` | note 07 |
| digest | `0x64a36fa69b02d5a273656445a2549ba8e1f2694743aad967273fa5943e198c1e` | note 07 |
| kernelDomainSeparator | `0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818` | note 01, note 07 |
| wrappedDigest | `0x4ed2d357e8765ce1f3d3c1bde491b31871015d7c8e9bd17fd608f38f4fe3b3cc` | note 07 |
| ecdsa | `0x292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b` | note 07 |
| wire | `0x01845adb2c711129d4f3966735ed98a9f09fc4ce57292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b` | note 07 |

L1b (note 01 section (a)): address `SMART`, timestamp `"1792344796"`, nonce `0`. Note 01 prints these values; its verifier recomputed them; they were not signed.

#### L1b

| Item | Value (all three methods) | In notes |
|---|---|---|
| structHash | `0xf92057811cbe2d513ba534bf9512265ac75a01535c8a2e5f8686d0c036d90e4f` | note 01 |
| digest | `0x21acb038432cbba0686a58bd4985506d07bb935e13080b87f25b3d65557e7d11` | note 01 |
| wrappedDigest | `0x6f0d66f4f6d133d4cdc7e04dd0e9841e5962322dc56bf6bb8078278ac51e3c6d` | note 01 |

L1c (new): address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (used as the account, so a second Kernel domain is covered), timestamp `"1792344796"`, nonce `7`.

#### L1c

| Item | Value (all three methods) | In notes |
|---|---|---|
| structHash | `0x6f1d183abb07e94dd397dd02baa1061e012f74bc7c683db028c9ee4ec7ea7079` | new |
| digest | `0x7f73e07485b669ef1737a75abbf1bd1c8c06b4ac848bb0869b660b231cbe9417` | new |
| kernelDomainSeparator | `0x59aafd17d6183c8ca48411b70a0f2e332ef9b64ae239779da507eda0a83fa322` | new |
| wrappedDigest | `0xaa0a9284912a3aaa38b342b133b0eb3e110fb145e91b846bc6628203d82f5111` | new |
| ecdsa | `0x4d2875c00b676dcc52a36a699bfb22db4bb2597817961eaf37256801e395718756eebe58a717e8b72152bdde3b365d993a39840470803ee3d30d7c69a7133e511b` | new |
| wire | `0x01845adb2c711129d4f3966735ed98a9f09fc4ce574d2875c00b676dcc52a36a699bfb22db4bb2597817961eaf37256801e395718756eebe58a717e8b72152bdde3b365d993a39840470803ee3d30d7c69a7133e511b` | new |

## 5. L2 HMAC vectors

Secret `S1` = `c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm` (base64 of the 27 ASCII bytes `secret-key-1234567890abcdef`; a test value, not an XO secret). Output is URL-safe base64 with `=` padding kept. Canonical string = `timestamp + METHOD + path + body`.

#### HMAC

| Item | Value (all three methods) | In notes |
|---|---|---|
| hmac1: S1, ts 1791389400, POST, /order, body {"orderType":"GTC"} | `1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q=` | note 07 |
| hmac2: S1, ts 1791389400, GET, /orders?next_cursor=&market=0xabc, canonical target /orders | `JmJz5GTC0PCT50UblUg_HYRptQQgTbzWi7_NedprQw0=` | new |
| hmac2: same request, canonical target /orders?next_cursor=&market=0xabc | `QD0vYcxOrBKpZW-C6J1Dbb4Vp1zEK5FX8c_ykzfg84A=` | new |
| hmac3: secret +//+/fz7+//+/fz7+//+/fz7 (standard alphabet), ts 1791389401, DELETE, /order, body {"orderID":"42"} | `qOUvNF1hm3SJNxyZ9mu1V-R3W7AgyGgWnUxrxGu-XM0=` | new |
| hmac3: same key spelled -__-_fz7-__-_fz7-__-_fz7 (URL-safe alphabet) | `qOUvNF1hm3SJNxyZ9mu1V-R3W7AgyGgWnUxrxGu-XM0=` | new |
| hmac4: OpenAPI example secret dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ=, ts 1791389402, GET, /orders?limit=10, path-with-query | `GUZXPTS1RzA3YpoR74CzvsqToddkb4zWuZOlGlv-N-w=` | new |
| hmac4: same secret without its trailing = | `GUZXPTS1RzA3YpoR74CzvsqToddkb4zWuZOlGlv-N-w=` | new |
| hmac5: S1, ts 1791389500, GET, /book (a signature that contains - and _) | `IJ8RYppty9OUNy57PaQArGhs96Dm-OcLHbDEZx5C0nk=` | new |

The first row is the only HMAC vector in the notes (note 07 section 4 "hmacL2"); the docs publish none. The other rows are derived here with openssl (M3) and by hand (M2). What they show: path-only and path-with-query signatures differ when a query string is present and are equal otherwise; standard and URL-safe spellings of the secret are the same key; the output keeps `=` padding.

## 6. Kernel v3.1 source cross-check (read-only, `gh api`, tag `v3.1` of `zerodevapp/kernel`)

| File | What it says | Used for |
|---|---|---|
| `src/Kernel.sol:153` | `_domainNameAndVersion()` returns `"Kernel"`, `"0.3.1"` | Kernel domain name and version |
| `src/Kernel.sol:24` | `import {EIP712} from "solady/utils/EIP712.sol"` (Solady source not read in this task) | `_hashTypedData` is the standard EIP-712 digest under this domain with `address(this)` as verifyingContract |
| `src/Kernel.sol:318-338` | `isValidSignature(hash, signature)`: `decodeSignature`; root type resolves to `rootValidator`; reverts `InvalidValidator` if the validator has no hook set; validator type calls `validator.isValidSignatureWithSender(msg.sender, _toWrappedHash(hash), sig)` | wrap applies to the exchange's `hash`; the prefix only picks the validator |
| `src/core/ValidationManager.sol:591-593` | `_toWrappedHash(hash) = _hashTypedData(keccak256(abi.encode(KERNEL_WRAPPER_TYPE_HASH, hash)))` | `kernelWrapDigest` |
| `src/types/Constants.sol:60` | `KERNEL_WRAPPER_TYPE_HASH = 0x1547321c...9c83` | equals `keccak256("Kernel(bytes32 hash)")` computed above |
| `src/utils/ValidationTypeLib.sol:80-102` | `decodeSignature`: first byte `0x00` consumes 1 byte (root), `0x01` consumes 21 (validator address), `0x02` consumes 5 (permission), anything else reverts | wire prefixes; this is why the `0x01` form is `0x01 + 20 bytes + sig` |

When the account's root validator is the ECDSA validator (a validator, not a permission), both prefix forms reach the same `_toWrappedHash(hash)`, so the digest the owner signs is identical for `0x01 || validator || sig` and `0x00 || sig`; only the prefix differs. Which of the two the live gateway accepts is unknown, so the code defaults to the documented `0x01` form and exposes `0x00` only through the named option `kernel-root-0x00`. On the captured Kernel code the `0x00` form (66 bytes) validates too (`test/anvil-harness.test.ts` returns the ERC-1271 magic value for it), while a `0x00` prefix followed by the validator address and the signature (86 bytes) does not.

#### Both digest forms are accepted (changed 2026-10-19)

The ECDSA validator is not in the v3.1 repo. From `zerodevapp/kernel-7579-plugins` `src/validators/ECDSAValidator.sol` (HEAD, read in the first version of this file and not re-read since): `_verifySignature(hash, sig, signer)` accepts a signature over the raw `hash` and also one over `toEthSignedMessageHash(hash)`. The deployed code agrees, from two independent observations:

- Phase 1 research probed the deployed validator on chain 3223 through a real deployed Kernel with key-free `eth_call` and found both forms valid, with `v` of 27 or 28 only (`docs/research/19`, section 7.2). That probe was not re-run here.
- `test/anvil-harness.test.ts` (66 tests, all passing on the last run) runs the same question against the captured bytecode on a local chain: `Kernel.isValidSignature(orderHash, 0x01 || validator || sig65)` returns the ERC-1271 magic value `0x1626ba7e` for the exact 86 wire bytes the relay sends, signed raw or EIP-191 over the Kernel-wrapped digest, including 24 seeded orders from 3 owners; it returns the invalid value `0xffffffff` for a wrong owner, a flipped byte, a signature over the unwrapped order hash, and a digest wrapped for another account or for chain 8453; and it reverts for a recovery byte of 0 or 1, an unknown validator, an unknown prefix and an empty signature.

XO's own app signs the EIP-191 form (62 of 62 classifiable makers and 99 of 99 fresh orders in `docs/research/22`, 14 of 14 sampled user operations in `test/fixtures/userop/golden-ops.json`), while the docs' sample and a PayBox `raw` or `typedData` intent produce the raw form. **The verifiers therefore accept both** (this replaces the earlier raw-only rule, which rejected signatures XO's own app produces):

- `src/xo/signing/verify.ts` exports `DIGEST_SIGNATURE_FORMS = ["raw", "eip191"]`. `verifyOrderEcdsa`, `verifyOrderWireSignature`, `verifyClobAuthEcdsa` and `verifyClobAuthWireSignature` rebuild the Kernel-wrapped digest from trusted inputs, recover the signer under each form in that order, require it to equal the expected owner under at least one, and return `digestForm` (`raw` or `eip191`) so a gateway that prefers one form can be diagnosed. The option `digestForms` restricts the forms (anything but `raw`, `eip191` or both throws a `TypeError`: a caller bug, not bad input). A failure is `unrecoverable_signature` or `owner_mismatch`, and the message names both recovered addresses and forms.
- `src/xo/userop/verify.ts` does the same for user operations (`verifyUserOpSignature`, result field `form`), over the user operation hash and its EIP-191 envelope.
- What stays stricter than the chain, on purpose: only 65-byte signatures are read (no compact 64-byte form, no ERC-6492 wrapper); the order and login verifier refuses a high `s` (`high_s_signature`) and rewrites a recovery byte of 0 or 1 to 27 or 28, while the user operation path flips a high `s` to its low twin and rewrites `v`, and reports both (`rewroteV`, `flippedHighS`). The chain's validator feeds `v` to `ecrecover` unchanged, so 27 or 28 is what is sent.

#### 6.1 The EIP-191 form: vectors

The EIP-191 form signs `keccak256("\x19Ethereum Signed Message:\n32" ++ wrappedDigest)`, the personal-sign envelope of the 32 raw bytes. Same test key, the same four wrapped digests as sections 3 and 4. M1 is viem `hashMessage({ raw })` and `signMessage({ message: { raw } })` through `src/xo/signing`; M2 is the envelope concatenated and hashed by hand and signed with `account.sign({ hash })`; M3 is `cast keccak` over `cast concat-hex` of the prefix and the digest, and `cast wallet sign` (without `--no-hash`) over the 0x message, which `cast` treats as bytes.

| Vector | wrappedDigest (sections 3 and 4) | EIP-191 digest | ecdsa over the EIP-191 digest |
|---|---|---|---|
| A | `0xdf106666fb338795075dccfe9b7a3f3fd818d15cca3be9c2887f5a46d2d198c3` | `0x3eb79a95ae9fbb5303fedb0446098551b0854d2eb63f342c587859aaa66f01af` | `0x4fade7e73d5a3686d0079199e8213aecf05d59208c4de51a38b5a597a8d34afc571e3ff8672c6669fe20d0fea0d4dc054cfd892a1a8b243b2d450c35caca84e61c` |
| B | `0xe1da1e6981c60c8be06301adf795d277e69fa7b96e7201ad797d68dfaaf16158` | `0xa648d47a134201a875886efcce592dc530f9d6bdad4436135227acb5a2881860` | `0xd3cae92508921d919a452529a45f305e26e186fca63bbb8657aba046eed8a92a7b61a1e54483f2585d6c2efaa074eb3a860c1d5d795748c9ec28b2f7c3ce49451b` |
| C | `0xcaf7295dd1a3fea94b7eb5bec3eca6a2eca718b346a6801d14e74b05c06d5b76` | `0x24fee2040dfd241ff0643ce32f23fa06cd98394d611376f798fc4fcb5ff4dce5` | `0x809311424f14d468bd5d9288978298752d2d59c5a3890a1d64a368ab0fa03b5006eac2a7e1330839170305655a3a13a45f5105af3a839885aae1740af3baefad1b` |
| L1a | `0x4ed2d357e8765ce1f3d3c1bde491b31871015d7c8e9bd17fd608f38f4fe3b3cc` | `0x339b3684de978fbfb7adfe34b2d583f796cc7192e0337d1e6338781adebce57d` | `0x84c3e3bd4a906658f88f6a4f4843909cf872b4efe6fa14460833e6ffc17da25b2c33d91cce20be4c18c8964e542cb2ea3b8b6c4f0e5b2b4fcaab1ea3398240871c` |

M1, M2 and M3 agree on all 8 values (4 digests, 4 signatures; the `wrappedDigest` column equals the pinned values of sections 3 and 4). For each vector `verifyOrderEcdsa` or `verifyClobAuthEcdsa` with the default forms reports `digestForm: "eip191"` for this signature and `"raw"` for the raw signature of sections 3 and 4; restricted to `digestForms: ["raw"]` it reports `owner_mismatch` for the EIP-191 signature; a signature by the other public test key reports `owner_mismatch` under both. The raw signatures verify as `raw` and not as EIP-191 (`cast wallet verify` of a raw signature against the same message fails), so the two forms cannot be confused. **Pinned in a test: no.** The literals above are not in a committed test; the behaviour is: `test/signing-verify.test.ts` ("accepts an EIP-191 signature and reports eip191", the restricted-form and wire-signature cases, the login case) signs at run time with the same keys, and `test/anvil-harness.test.ts` covers the chain side. A trap found while doing this: `cast hash-message 0x<64 hex>` hashes the 66 characters as text (prefix `\n66`), not the 32 bytes, and gives a different digest; use the concatenation above.

What none of this proves: that XO's gateway accepts such an order, that a PayBox wallet will sign these typed data, or that the account's validator set matches. See `docs/phase0-gate-results.md` gates 2, 3 and 8.

## 7. Not reproduced, and other limits

- Note 01 section (c) "Worked vector" (the OpenAPI sample order: struct hash `0x6dde3587...ef9f`, orderHash `0x553d58fd...e723`, wrapped digest `0x9137675d...bf8b`). The sample's tokenId is printed in the note only as `2651...6943`, and the full value is not in the repo, so these three hashes cannot be rebuilt here. The test file keeps a skipped test for it. The constants and code paths they depend on are covered by vectors A to C. If someone with the OpenAPI spec supplies the full tokenId, add it to `test/signing-vectors.test.ts` (inputs: salt `12345678901234567890`, maker = signer = `SMART`, beneficiary zero, makerAmount `55000000`, takerAmount `100000000`, expiration 0, nonce 0, side 0, signatureType 3).
- The methods share the documented algorithm. They prove the code implements XO's published formulas, Kernel's source and the deployed contract code, not that XO's live gateway, bundler or registry accepts the result. No order, ClobAuth request, HMAC request or user operation was sent anywhere.
- M4 runs the contract bytecode captured from the public explorer on 2026-10-19 (`test/fixtures/bytecode/`). Whether the bytecode on chain 3223 today is still that code is not re-checked here; the Base variant of the Kernel implementation is derived, not captured, and is unverified against the real Base contracts.
- The Kernel source line citations in section 6 were read through `gh api` in the first version of this file and were not re-read for this update (no network was used).
- Sections 8 to 11: the synthetic user operations (8.2), the EIP-191 vectors (6.1), the derivation intermediates (section 9) and the three fee-bound vectors A, B and C (section 11) are reproduced by the scripts in section 12 but are **not pinned as literals in any committed test**, so they are unverified as regression guards; each section says which values a test does pin. The fee formula itself (`maxFeeRateBps`, 800 today, ceiling 1000, applied on top of a BUY's principal and out of a SELL's proceeds) comes from the exchange source as read by `docs/research/22` (`Fees.sol`, `Trading.sol`); it was not re-read here, and what XO actually charges is unverified until a fill reconciles it (live test T3c).
- Property-style tests use a fixed-seed splitmix64 generator (no `Math.random`).

## 8. UserOp hash and signature vectors

ERC-4337 v0.7 `userOpHash` on XO chain 3223 (`src/xo/userop/hash.ts`):

```
inner      = keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
                                  accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData)))
userOpHash = keccak256(abi.encode(inner, entryPoint, 3223))
```

`entryPoint` is `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. `accountGasLimits` is verificationGasLimit (high 16 bytes) then callGasLimit (low 16 bytes); `gasFees` is maxPriorityFeePerGas then maxFeePerGas (both 0 at XO, so the word is zero); `paymasterAndData` is the PolicyPaymaster, paymasterVerificationGasLimit (16 bytes) and paymasterPostOpGasLimit (16 bytes), or `0x`; the signature is not part of the hash. The first operation of an account has nonce `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000` (mode 0, type 0, the ECDSA validator, lane 0, sequence 0) and carries a 440-byte `initCode`. The owner signs the 32-byte hash (a PayBox `raw` intent) or its EIP-191 envelope (what XO's app signs): section 6.

Methods: M1 `userOpHash` (and `prepareUserOp` for the synthetic operations); M2 a hand-written `abi.encode` with viem utilities only; M3 `userop_hash` in the cast script (it also builds `callData` and `initCode` with `cast calldata` and `cast abi-encode`, so nothing from `src/` is involved); M4 `EntryPoint.getUserOpHash(op)` on the captured v0.7 bytecode (`test/userop-anvil.test.ts` pins it equal to M1 for a deterministic corpus of more than 25 operations and 40 seeded ones of arbitrary shape).

### 8.1 Three real operations (public chain data)

Operations 0, 3 and 17 of `test/fixtures/userop/golden-ops.json` (22 real operations, the first operation of each bundle, public chain data; the sender and owner addresses of these third parties are left out here, they are in the fixture). Each hash is also the hash in the chain's own `UserOperationEvent` log, an independent source.

| Item | Operation 0 | Operation 3 | Operation 17 |
|---|---|---|---|
| Action | deploy plus Enable Trading (first operation of its account) | `redeemPositions`, one market | `createConvictionMarket` |
| Transaction (prefix) | `0xc9ef8950c7c5...` | `0x2a544e2adfb3...` | `0xbcc79750f764...` |
| Block | 12589192 | 12601956 | 12551478 |
| nonce | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000` | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000082` | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce570000000000000000000a` |
| accountGasLimits | `0x0000000000000000000000000004897e000000000000000000000000000124a4` | `0x0000000000000000000000000001573d0000000000000000000000000001ecea` | `0x00000000000000000000000000019be2000000000000000000000000000eeaba` |
| preVerificationGas | 56214 | 51195 | 55800 |
| gasFees | zero | zero | zero |
| paymasterAndData | PolicyPaymaster, 40,262, 26,478 (52 bytes) | the same | the same |
| initCode / callData bytes | 440 / 676 | 0 / 388 | 0 / 900 |
| signature form | EIP-191 | EIP-191 | EIP-191 |
| userOpHash (the event, M1, M2, M3, M4) | `0xbd0dcbef3d92d93ef7ce3305977099c21d1c57baf52779ebead30bd72bed6f86` | `0x053423fd89f999a20e6ebbc111965517c69a7a401a1c86b4ac13f92f5d458120` | `0x01a7c2dfc645164de1eb59e45f1ed72e82786d5e27863b457b74b29d0f9b20b4` |

All five sources agree for all three. **Pinned in a test: yes.** The hash is a literal in the fixture, and `test/userop-golden.test.ts` asserts that the rebuilt operation hashes to it (and to the hand-written hash and viem's own `getUserOperationHash`) for all 22 operations, 158 checks in total; the 14 operations from XO's app verify under the EIP-191 form and not under the raw form, and the 8 operator-account operations under the raw form. The research notes record the same hash equal to the on-chain `getUserOpHash` for 7 of 7 and 3 of 3 operations.

### 8.2 Four synthetic operations for the public Anvil account 0

Owner `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`, sender `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` (section 9). Built by `prepareUserOp` with the library's default gas plan; the gas words are inputs of the hash, not outputs of it, so another gas plan gives another hash (preVerificationGas includes a size term for the calldata, which is policy and not under test here).

| Item | U1 deploy plus Enable Trading | U2 revoke trading | U3 redeem one market | U4 withdraw 1 USDC |
|---|---|---|---|---|
| Calls | batch: `USDC.e.approve(exchange, 2^256 - 1)`, `ConditionalTokens.setApprovalForAll(exchange, true)` | batch: `approve(exchange, 0)`, `setApprovalForAll(exchange, false)` | single: `redeemPositions(USDC.e, 0x00..00, 0xabab..ab, [1, 2])` | batch: `USDC.e.approve(XO route, 1000000)`, `route.transferRemote(8453, bytes32(owner), 1000000)` |
| Account state / sponsor | undeployed, sponsored | deployed, sponsored (built with a paymaster to exercise that field; the relay itself sends a revoke without one) | deployed, sponsored | deployed, no paymaster |
| nonce | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000000` | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000001` | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000002` | `0x0000845adb2c711129d4f3966735ed98a9f09fc4ce5700000000000000000003` |
| accountGasLimits | `0x0000000000000000000000000004897e000000000000000000000000000124a4` | `0x0000000000000000000000000001573d000000000000000000000000000124a4` | `0x0000000000000000000000000001573d0000000000000000000000000001ecea` | `0x0000000000000000000000000001573d000000000000000000000000000927c0` |
| preVerificationGas | 59544 | 56016 | 53755 | 55764 |
| gasFees | zero | zero | zero | zero |
| paymasterAndData | `0x2353b23d8f329fd3cec0d21652f14208248a439d00000000000000000000000000009d460000000000000000000000000000676e` | `0x2353b23d8f329fd3cec0d21652f14208248a439d00000000000000000000000000009d460000000000000000000000000000676e` | `0x2353b23d8f329fd3cec0d21652f14208248a439d00000000000000000000000000009d460000000000000000000000000000676e` | `0x` |
| initCode | 440 bytes, keccak `0x13fcf8483d455daf3cec00860bb4ab2f11e9e629851ca53516162df77f64acbe` | `0x` | `0x` | `0x` |
| callData | 676 bytes, keccak `0xcb7a15030d827df29266f7ec452d95e304356d8c0973159845387e392e60551f` | 676 bytes, keccak `0xfae7673df2fb6dd4635b4530df665c816d2d2aa76190fe50cffac1e742a1a74e` | 388 bytes, keccak `0xa7648db7f18d8d84c1e4d8e8359edf66b1fc8ae00e96acba6a6310728d82a301` | 708 bytes, keccak `0x70e6f9bdb5f6cfa6a7a609a42844c96d613b53363fd4515c9ad6e5431cda5810` |
| **userOpHash** (M1, M2, M3, M4) | `0x43d8bcc6df4bce05a2accf210af5b99115d071ac767da5d5885f0b7d34a91b20` | `0xb1ff8b6d3ce59e4703540c1d721c93925c34bea4dfb761e27d0783d66a17862c` | `0xe73480af87650caa67bfbcc1c6a713b319ad76430fe18ac6d200df450cc88990` | `0x02fd4fee0ea27e13bf12afcd1abcafd55a8bffab1199553efeaef162f342cc31` |
| EIP-191 digest of the hash | `0x4c25ee177610c4c40caaa038605019310179c92e6cd3705f362b0af45452b3ac` | `0xf534e2eaebe8ee1128f20969faad6c19e2085977fc9d6cfa4c7a2dc26713c48c` | `0x85b6b0318a9d43944bc3025387d03946f7591dcb971db5e7c4cb54cdd4efdfc0` | `0x567c08527473293b1278bbf204a6239bbfc2f900d8faff7331965b76e3e893ed` |
| `digest_tag` (first 16 hex digits) | `43d8bcc6df4bce05` | `b1ff8b6d3ce59e47` | `e73480af87650caa` | `02fd4fee0ea27e13` |

The empty-`initCode` keccak is `0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470`. All four hashes agree across M1, M2, M3 and M4 (16 values), and `callData` and `initCode` are built independently by `cast` in M3. **Pinned in a test: no** (the literals are not in a committed test). The class is covered: `test/userop-pack-hash.test.ts` compares the hash with viem's for 100 seeded operations and flips every byte of every hashed field, and `test/userop-anvil.test.ts` compares it with the real EntryPoint's `getUserOpHash` for the corpus above.

### 8.3 Signatures over U1

The public test key signs the 32-byte hash. `0xcd534332ca0651c00e5f54ab4aa116c57c69fbb437b84196a0ff7dc918b8afcc4e0124a7265d2e566c9a1611e4afd40e0db691815d2d08cf2dececfe704587a31c` is the raw form, `0x128eff0bffde32a6f8c353d1698e9da4a0decdbffe46be7a6a7904e5037e8d1051f7453b752a587b14556fda93bc35458ec3915e3fe5f4f6280e4377654187831c` is the EIP-191 form (M1 and M3 agree on both; ECDSA with RFC 6979 is deterministic). `verifyUserOpSignature` reports form `raw` for the first and `eip191` for the second, and `owner_mismatch` for a signature by the other public test key; `cast wallet verify` agrees (the raw form with `--no-hash`, the EIP-191 form without). The same holds for U2 to U4. **Pinned in a test: no** for these literals; the property is, with random keys, in `test/userop-sign-verify.test.ts` (18 tests) and `test/userop-anvil.test.ts` (the real EntryPoint and Kernel accept both forms and reject a wrong signer with `AA24`; normalising a recovery byte of 0 or 1 and a high `s` is tested in `test/userop-sign-verify.test.ts`).

### 8.4 Limits of this section

- A hash that matches is a statement about bytes, not about acceptance: no user operation was sent to XO's bundler, and the bundler's acceptance of an account XO never provisioned is the open question T1.
- The real PolicyPaymaster bytecode is on the local chain with the 2026-10-18 allowlist replayed from the notes, but USDC.e, the conditional tokens and the exchange are labelled stubs there. `test/userop-anvil.test.ts` reports one `todo` (not a failure): the library's default gas plan gives a sponsored redeem the one-call paymaster verification limit (40,262), which fails batches of eight or more with `AA33`; the minimum needed rises with the call count (24,613 for one redeem, 138,360 for fifty). The relay raises the limit before it builds a sponsored operation (30,000 plus 3,000 per call, `relay/userops.ts`); the library default itself is unchanged.
- The preVerificationGas figures are policy (observed defaults plus a calldata term), not derived from anything in this section.

## 9. Account derivation vector

The XO smart account is a pure function of its owner (`src/xo/account/derive.ts`; `docs/phase1-gap-closing.md` section 2.1 B):

```
initData = 0x3c3b752b ++ abi.encode(bytes21 0x01 ++ ECDSA validator, address(0), bytes owner (20 bytes), bytes 0x, bytes[] [])   (292 bytes)
salt     = keccak256(initData ++ bytes32(0))                                  (account index 0)
account  = CREATE2(KernelFactory, salt, keccak256(proxyCreationCode(KernelImplementation)))
initCode = KernelFactory ++ createAccount(initData, bytes32(0))               (440 bytes, the first operation of a new account)
```

The proxy creation code is the 95-byte Solady ERC-1967 clone: `0x603d3d8160223d3973 ++ implementation ++ 0x6009 ++ 0x5155f3363d3d373d3d363d7f ++ 0x360894a13ba1a3210667c828492db98dca3e2076 ++ 0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3`; its keccak is `0x85d96aa1c9a65886d094915d76ccae85f14027a02c1647dde659f869460f03e6`, the pinned constant (recomputed by M1, M2 and M3). The pinned addresses are the KernelFactory 0.3.1 `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419`, the implementation `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` and the ECDSA validator `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`.

| Owner (public Anvil account) | initData keccak | salt | account |
|---|---|---|---|
| 0 `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `0x168144ba9e7aa0612abd4922fa81e2c73b6d6d8f67a1e4cf631ce015a9886cde` | `0xd1e8cafce5f04e0fab89ab9d030ec426d5ba9e3634ea930ff1c7fe16edc19bb4` | `0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` |
| 1 `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `0x8be05cf712609f669847a61d5b2a0988a780edf9fc047a88d7e5d141d22d73ef` | `0x530621b34bf44dab105e9499cd64ce3ab711ac2fa37fe997a91941e59692597f` | `0xEC4b217240f0292c65Bf136b341e400e2D28cA6F` |
| 2 `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `0x4ef5a3f975fa100251f17fc11142e745eb8e8a200becef6860e70fde686caff6` | `0xb0c5c100bf9e2d9003681c28e6ceb041740c96e40ecdba2376f992002dfa0512` | `0xBCB0FC9aE4908e04F89E328E3F6720C7bB856781` |

Methods: M1 `deriveAccount`, `buildInitData`, `accountCreate2Salt`; M2 the `initialize` arguments encoded by hand with viem's `encodeAbiParameters` and the CREATE2 hash taken by hand (`keccak256(0xff ++ factory ++ salt ++ codeHash)`); M3 `cast calldata 'initialize(bytes21,address,bytes,bytes,bytes[])'`, `cast keccak` and `cast to-check-sum-address`; M4 `KernelFactory.getAddress(initData, 0)` on the captured factory bytecode. All four agree on the three accounts, and the hand-encoded `initData` is byte-identical to M1's. **Pinned in a test:** the three accounts and the other seven Anvil accounts: yes (`test/fixtures/chain/owner-account-pairs.json`, whose Anvil pairs were computed with `cast`, and `test/account-derive.test.ts`, which also checks a hand-written CREATE2 for 200 seeded owners); the real factory's `getAddress` and a simulated `createAccount` for 50 owners: yes (`test/anvil-harness.test.ts`); the init-code hash: yes; the `initData` keccak and the salt: no (the structure, selector, length and decoded arguments are pinned, the hashes are not).

Also from the research, not re-run here: all 2,627 `OwnerRegistered` events on XO re-derive offline, the 34 decoded on-chain deployments share this structure, and the live Base factory's `getAddress` returned the same account for 6 of 6 owners. Anvil account 0's account is deployed on Base and undeployed on XO chain 3223 at the time of the research (a statement about the chain on that day, not about the formula).

## 10. Funding calldata goldens

The two Base calls of `xo_fund_account` (`src/xo/funding/calldata.ts`), each sent as a PayBox EVM proposal on `eip155:8453` with `value` `"0"`: `approve(router, amount)` on Circle USDC (68 bytes) and `transferRemote(3223, bytes32 recipient, amount)` on the Hyperlane router `0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F` (100 bytes). The recipient word is the derived account in the low 20 bytes with the upper 12 bytes zero.

| Call | Calldata (M1, M2, M3) | Words |
|---|---|---|
| `approve(router, 5 USDC)` | `0x095ea7b300000000000000000000000054716a535c3b5616e3f0d4d5005fc4bb660cdf5f00000000000000000000000000000000000000000000000000000000004c4b40` | selector `0x095ea7b3`; spender word = the router; amount `0x4c4b40` = 5,000,000 |
| `transferRemote(3223, 0x3333..33, 5 USDC)` (synthetic recipient) | `0x81b4e8b40000000000000000000000000000000000000000000000000000000000000c97000000000000000000000000333333333333333333333333333333333333333300000000000000000000000000000000000000000000000000000000004c4b40` | selector `0x81b4e8b4`; domain `0x0c97` = 3223; recipient word; amount `0x4c4b40` |
| `transferRemote(3223, account of Anvil 0, 1 USDC)` | `0x81b4e8b40000000000000000000000000000000000000000000000000000000000000c97000000000000000000000000b3729f7e1ab0b4a50e7de5599ecc321b8775d30d00000000000000000000000000000000000000000000000000000000000f4240` | the same selector and domain; recipient word `0x000000000000000000000000b3729f7e1ab0b4a50e7de5599ecc321b8775d30d`; amount `0x0f4240` = 1,000,000 |

M1 is `encodeApprove`, `encodeTransferRemote` and `buildTransferRemoteCall` (the recipient is re-derived from the owner and refused if it differs). M2 is the selector followed by the three 32-byte words written out as in the Words column. M3 is `cast calldata` for each. All three agree for all three calls. **Pinned in a test: yes**, as literals, in `test/funding-calldata.test.ts`, which also re-runs `cast calldata` for seven amounts and for the derived accounts of all ten Anvil owners at three amounts when `cast` is on the PATH (it skips that part with a message otherwise). The first two are also the worked example of `docs/research/20` section 4.

Not reproduced here: that the real router accepts these bytes. The research simulated `transferRemote` by `eth_call` on both chains (value 0 returns a message id; a value of 1 wei reverts at the Mailbox hook), and simulated that a right-padded, zero or blacklisted recipient strands the funds on the XO side. There is no router bytecode on the local chain, so no test here exercises it; delivery of a third-party message by XO's relayer is unobserved (`FU7`, test T3a).

## 11. Order fee-bound arithmetic

Orders carry no fee field; the exchange charges at most `maxFeeRateBps` of a leg's cash value (800 today, hard ceiling 1,000 [22, `Fees.sol`]) on top of a BUY's principal, and out of a SELL's proceeds. The plugin therefore bounds both (`src/xo/signing/amounts.ts`), with integer arithmetic that rounds in the safe direction (`ceil(a / b) = (a + b - 1) / b`), amounts in micro-USDC (6 decimals):

```
maxBuyFee(makerAmount, bps)        = ceil(makerAmount * bps / 10000)
maxBuyOutlay(makerAmount, bps)     = makerAmount + maxBuyFee(makerAmount, bps)
minSellProceeds(takerAmount, bps)  = takerAmount - ceil(takerAmount * bps / 10000)
cap rule: a BUY counts maxBuyOutlay (post-only included); a SELL counts takerAmount and is refused
          if minSellProceeds is below $0.30 (300,000 micro-USDC)
```

The creation seed is a $10.00 stake: `maxBuyOutlay(10000000, 800)` = `10,800,000`, the seed cap `SEED_CAP_ATOMIC`.

| Input | Value | Pinned in a test |
|---|---|---|
| `maxBuyOutlay(10000000, 800)` (and the fee `maxBuyFee` = 800,000) | 10,800,000 | yes |
| `maxBuyOutlay(123, 800)`, `maxBuyOutlay(1, 800)` | 133, 2 | yes |
| `maxBuyOutlay(1000000, 0)`, `maxBuyOutlay(1000000, 1000)` | 1,000,000, 1,100,000 | yes |
| `maxBuyOutlay(9259259, 800)`, `maxBuyOutlay(9259260, 800)` (the largest principal under a $10 cap, and the next) | 10,000,000, 10,000,001 | yes |
| `minSellProceeds(10000000, 800)`, `minSellProceeds(123, 800)`, `minSellProceeds(1, 800)`, `minSellProceeds(5000000, 0)` | 9,200,000, 113, 0, 5,000,000 | yes |
| `minSellProceeds(326087, 800)`, `minSellProceeds(326086, 800)` (the smallest SELL that clears the $0.30 floor, and the one below) | 300,000, 299,999 | yes |
| `SEED_CAP_ATOMIC` | 10,800,000 | yes |
| Vector A (BUY 10 shares at 0.42, makerAmount 4,200,000): `maxBuyOutlay(4200000, 800)`, fee 336,000 | 4,536,000 | no |
| Vector B (BUY 4 shares at 0.30, makerAmount 1,200,000): `maxBuyOutlay(1200000, 800)`, fee 96,000 | 1,296,000 | no |
| Vector C (SELL 7 shares at 0.123, takerAmount 861,000): cap counts 861,000; `minSellProceeds(861000, 800)`, fee 68,880 | 792,120 | no |

Methods: M1 the functions above (and `orderCapAmount`, which gave the Vector A to C results). M2 the remainder form of the ceiling (`q = floor(x * bps / 10000)`, add one when the remainder is not zero), checked for every `x` from 1 to 3,000 at 0, 1, 400, 799, 800, 801 and 1,000 basis points (21,000 pairs): equal to M1, covering `x * (10000 + bps) / 10000`, and minimal (one micro-unit less would not cover it). M3 bash integer arithmetic on the same cases, all agreeing. The property tests of `test/signing-amounts.test.ts` (seeds `0xfee02`, `0xfee03`) additionally show that a BUY split into any partial fills never pulls more than `maxBuyOutlay` and that a SELL in one leg nets at least `minSellProceeds`; many tiny SELL fills can each lose up to one micro-unit to the contract's own floor division on top of the bound.

Unverified: the contract's rule itself (read from the exchange source by the research, not re-read here), and what XO actually charges: `/fee-rate` reads 0 for everything while `effectiveFeeConfig` shows 400 to 800 basis points, and 4 of 300 sampled matches paid a taker fee of up to 5.5 percent. The 800 basis points are compiled in; an operator or XO raising the on-chain setting toward 1,000 makes a BUY cost up to 1.85 percent more than the cap assumed, and no tripwire checker is wired to notice (`docs/tool-contract.md`, v0.2 known gaps).

## 12. Re-running

### 12.1 Tests

Unit tests, project toolchain (anvil is needed for the chain tests, which skip with a message when it is missing):

```
cd <repo> && source .tools/env.sh && node_modules/.bin/tsx --test \
  test/signing-*.test.ts test/account-derive.test.ts test/funding-calldata.test.ts \
  test/userop-golden.test.ts test/userop-pack-hash.test.ts test/userop-sign-verify.test.ts \
  test/userop-anvil.test.ts test/anvil-harness.test.ts
```

Last run, 2026-10-19, the files of the command above together: 440 tests, 438 pass, 0 fail, 1 skipped, 1 `todo`. The skipped test is the OpenAPI sample vector (section 7) and the `todo` is the sponsored 50-redeem gas plan (section 8.4).

### 12.2 M3 for sections 3 to 5

Save the script below as a file and run it with `bash`. It needs Foundry `cast` and `openssl`, uses only offline subcommands, prints one `[vector] name=value` line per value, and takes no input from the network or from any file.

```bash
#!/usr/bin/env bash
# Independent derivation of the signing vectors with Foundry cast (offline commands only) and
# openssl. No code from src/ is used. Keys are the public Anvil/Hardhat test keys.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

ANVIL0_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ANVIL1_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
SMART=0xCAFE000000000000000000000000000000000A11
EXCHANGE=0x4bC5E872256D12E6017dfe466E04c867DC761B77
ZERO=0x0000000000000000000000000000000000000000
Z16=0x00000000000000000000000000000000
Z32=0x0000000000000000000000000000000000000000000000000000000000000000

ORDER_T='Order(uint256 salt,address maker,address signer,address beneficiary,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint128 nonce,bytes16 identifier,bytes32 metadata,uint8 side,uint8 signatureType)'
DOM4_T='EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
DOM3_T='EIP712Domain(string name,string version,uint256 chainId)'
KERNEL_T='Kernel(bytes32 hash)'
CLOB_T='ClobAuth(address address,string timestamp,uint256 nonce,string message)'
MSG='This message attests that I control the given wallet'

h() { cast keccak "$1"; }
cat_hex() { local out="0x"; local p; for p; do out="$out${p#0x}"; done; echo "$out"; }
digest_1901() { cast keccak "$(cat_hex 0x1901 "$1" "$2")"; }

ORDER_TH=$(h "$ORDER_T"); DOM4_TH=$(h "$DOM4_T"); DOM3_TH=$(h "$DOM3_T"); KERNEL_TH=$(h "$KERNEL_T"); CLOB_TH=$(h "$CLOB_T")
echo "orderTypehash=$ORDER_TH"
echo "eip712Domain4Typehash=$DOM4_TH"
echo "eip712Domain3Typehash=$DOM3_TH"
echo "kernelTypehash=$KERNEL_TH"
echo "clobAuthTypehash=$CLOB_TH"

ORDER_DS=$(cast keccak "$(cast abi-encode 'f(bytes32,bytes32,bytes32,uint256,address)' "$DOM4_TH" "$(h 'XO Market CLOB')" "$(h 1)" 3223 "$EXCHANGE")")
echo "orderDomainSeparator=$ORDER_DS"
CLOB_DS=$(cast keccak "$(cast abi-encode 'f(bytes32,bytes32,bytes32,uint256)' "$DOM3_TH" "$(h ClobAuthDomain)" "$(h 1)" 3223)")
echo "clobAuthDomainSeparator=$CLOB_DS"

kernel_ds() { cast keccak "$(cast abi-encode 'f(bytes32,bytes32,bytes32,uint256,address)' "$DOM4_TH" "$(h Kernel)" "$(h 0.3.1)" 3223 "$1")"; }
wrap() { # $1 inner hash, $2 smart account
  local ds sh; ds=$(kernel_ds "$2"); sh=$(cast keccak "$(cat_hex "$KERNEL_TH" "$1")"); digest_1901 "$ds" "$sh"; }

order_vector() { # name salt maker signer beneficiary tokenId makerAmt takerAmt expiration nonce identifier metadata side sigtype
  local name=$1; shift
  local enc sh oh
  enc=$(cast abi-encode 'f(bytes32,uint256,address,address,address,uint256,uint256,uint256,uint256,uint128,bytes16,bytes32,uint8,uint8)' "$ORDER_TH" $*)
  sh=$(cast keccak "$enc"); oh=$(digest_1901 "$ORDER_DS" "$sh")
  echo "[$name] structHash=$sh"; echo "[$name] orderHash=$oh"
  LAST_ORDER_HASH=$oh
}

sign_vector() { # name inner-hash smart-account
  local name=$1 inner=$2 acct=$3 wrapped sig sig2 td
  wrapped=$(wrap "$inner" "$acct")
  echo "[$name] kernelDomainSeparator=$(kernel_ds "$acct")"
  echo "[$name] wrappedDigest=$wrapped"
  sig=$(cast wallet sign --no-hash --private-key "$ANVIL0_KEY" "$wrapped")
  td=$(printf '{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"Kernel":[{"name":"hash","type":"bytes32"}]},"primaryType":"Kernel","domain":{"name":"Kernel","version":"0.3.1","chainId":3223,"verifyingContract":"%s"},"message":{"hash":"%s"}}' "$acct" "$inner")
  sig2=$(cast wallet sign --data --private-key "$ANVIL0_KEY" "$td")
  echo "[$name] ecdsa(--no-hash)=$sig"
  echo "[$name] ecdsa(--data)=$sig2"
  [ "$sig" = "$sig2" ] && echo "[$name] noHash==data: yes" || echo "[$name] noHash==data: NO"
  echo "[$name] wire=0x01845ADb2C711129d4f3966735eD98a9F09fC4cE57${sig#0x}"
  echo "[$name] verify=$(cast wallet verify --no-hash --address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 "$wrapped" "$sig" 2>&1)"
}

# --- vector A (note 07 section 4)
order_vector A 99 "$SMART" "$SMART" "$ZERO" 123456789 4200000 10000000 1791389400 0 "$Z16" "$Z32" 0 3
sign_vector A "$LAST_ORDER_HASH" "$SMART"
# --- vector B
order_vector B 7 "$SMART" "$SMART" "$ZERO" 5 1200000 4000000 0 0 "$Z16" "$Z32" 0 3
sign_vector B "$LAST_ORDER_HASH" "$SMART"
# --- vector C: SELL, every field non-trivial (bytes16 right-padding, uint128 max nonce, uint256 max salt, beneficiary set)
TOKEN_C=113287701564209339913693347405685749986285999146352375265161592243948562084773
SALT_C=115792089237316195423570985008687907853269984665640564039457584007913129639935
NONCE_C=340282366920938463463374607431768211455
ID_C=0x0102030405060708090a0b0c0d0e0f10
META_C=0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899
order_vector C "$SALT_C" "$SMART" "$SMART" "$ANVIL1_ADDR" "$TOKEN_C" 7000000 861000 1791389460 "$NONCE_C" "$ID_C" "$META_C" 1 3
sign_vector C "$LAST_ORDER_HASH" "$SMART"

# --- ClobAuth vectors
clob_vector() { # name address timestamp nonce
  local name=$1 addr=$2 ts=$3 nonce=$4 enc sh dg
  enc=$(cast abi-encode 'f(bytes32,address,bytes32,uint256,bytes32)' "$CLOB_TH" "$addr" "$(h "$ts")" "$nonce" "$(h "$MSG")")
  sh=$(cast keccak "$enc"); dg=$(digest_1901 "$CLOB_DS" "$sh")
  echo "[$name] structHash=$sh"; echo "[$name] digest=$dg"; LAST_CLOB=$dg
}
clob_vector L1a "$SMART" 1791389400 0
sign_vector L1a "$LAST_CLOB" "$SMART"
clob_vector L1b "$SMART" 1792344796 0
echo "[L1b] wrappedDigest=$(wrap "$LAST_CLOB" "$SMART")"
clob_vector L1c 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 1792344796 7
sign_vector L1c "$LAST_CLOB" 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

# --- HMAC vectors (openssl)
hmac() { # secretB64 canonical -> urlsafe base64 with padding
  local sec; sec=$(printf '%s' "$1" | tr '_-' '/+'); while [ $(( ${#sec} % 4 )) -ne 0 ]; do sec="${sec}="; done
  local keyhex; keyhex=$(printf '%s' "$sec" | openssl base64 -d -A | xxd -p | tr -d '\n')
  printf '%s' "$2" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$keyhex" -binary | openssl base64 -A | tr '+/' '-_'
}
S1=c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm
echo "[hmac1] canonical=1791389400POST/order{\"orderType\":\"GTC\"}"
echo "[hmac1] sig=$(hmac "$S1" '1791389400POST/order{"orderType":"GTC"}')"
echo "[hmac2] sig(path-only)=$(hmac "$S1" '1791389400GET/orders')"
echo "[hmac2] sig(path-with-query)=$(hmac "$S1" '1791389400GET/orders?next_cursor=&market=0xabc')"
S3_STD='+//+/fz7+//+/fz7+//+/fz7'   # standard alphabet (decodes to 18 bytes), no padding needed
S3_URL=$(printf '%s' "$S3_STD" | tr '+/' '-_')
echo "[hmac3] secretStd=$S3_STD secretUrl=$S3_URL"
echo "[hmac3] sigStd=$(hmac "$S3_STD" '1791389401DELETE/order{"orderID":"42"}')"
echo "[hmac3] sigUrl=$(hmac "$S3_URL" '1791389401DELETE/order{"orderID":"42"}')"
S4='dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ='
echo "[hmac4] (OpenAPI example secret, padded) sig=$(hmac "$S4" '1791389402GET/orders?limit=10')"
echo "[hmac4] (same secret, '=' stripped) sig=$(hmac "${S4%=}" '1791389402GET/orders?limit=10')"
# look for a timestamp whose signature contains '-' or '_' so the url-safe mapping is exercised
for ts in $(seq -f "%.0f" 1791389500 1791389700); do
  s=$(hmac "$S1" "${ts}GET/book")
  case "$s" in *-*|*_*) echo "[hmac5] ts=$ts canonical=${ts}GET/book sig=$s"; break;; esac
done
```

### 12.3 M3 for sections 6.1 and 8 to 11

Run from the repository root with the project toolchain on the PATH (`source .tools/env.sh`; it uses `cast` and one `node` one-liner that reads the public golden-operation fixture). Offline subcommands only.

```bash
#!/usr/bin/env bash
# M3 for sections 6.1 and 8 to 11 of docs/signing-vectors.md: Foundry cast (offline subcommands only), bash
# integer arithmetic and one node one-liner that reads the public golden-operation fixture. No code from src/
# is used. Keys are the public Anvil/Hardhat test keys. Run it from the repository root with the project
# toolchain on PATH (source .tools/env.sh). It prints one "[vector] name=value" line per value.
set -euo pipefail
export FOUNDRY_DISABLE_NIGHTLY_WARNING=1

ANVIL0_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ANVIL1_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
OWNER0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
OWNER1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
OWNER2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

ENTRY_POINT=0x0000000071727De22E5E9d8BAf0edAc6f37da032
FACTORY=0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419
VALIDATOR=0x845ADb2C711129d4f3966735eD98a9F09fC4cE57
IMPL=0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D
USDCE=0x80c12230ce677e6f304027a14780Edd2A829ab0c
CTF=0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909
EXCHANGE=0x4bC5E872256D12E6017dfe466E04c867DC761B77
XO_ROUTE=0x9090463546d725F6ecE5D1A4B27bEB929D5d1983
PAYMASTER=0x2353B23D8F329fD3cEC0d21652F14208248A439d
BASE_ROUTER=0x54716A535c3B5616e3f0d4D5005Fc4bB660cDF5F
Z32=0x0000000000000000000000000000000000000000000000000000000000000000
MAXU=0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
EIP191_PREFIX32=0x19457468657265756d205369676e6564204d6573736167653a0a3332   # "\x19Ethereum Signed Message:\n32"
CHAIN=3223

lc() { printf '%s' "$1" | tr 'A-F' 'a-f'; }
h() { cast keccak "$1"; }
cat_hex() { local out="0x" p; for p; do out="$out${p#0x}"; done; echo "$out"; }
word() { printf '0x%024d%s' 0 "$(lc "${1#0x}")"; }   # an address left-padded to 32 bytes
eip191_digest() { h "$(cat_hex $EIP191_PREFIX32 "$1")"; }   # do NOT use `cast hash-message` here: it hashes the 0x text

# ---------------- section 6.1: the EIP-191 digest form of the Kernel-wrapped digests of section 3 and 4
while read -r name wrapped; do
  sig=$(cast wallet sign --private-key $ANVIL0_KEY "$wrapped")      # a 0x message is signed as bytes
  echo "[$name] eip191Digest=$(eip191_digest "$wrapped")"
  echo "[$name] eip191Sig=$sig"
  echo "[$name] verifyEip191=$(cast wallet verify --address $OWNER0 "$wrapped" "$sig" 2>&1)"
done <<'LIST'
A 0xdf106666fb338795075dccfe9b7a3f3fd818d15cca3be9c2887f5a46d2d198c3
B 0xe1da1e6981c60c8be06301adf795d277e69fa7b96e7201ad797d68dfaaf16158
C 0xcaf7295dd1a3fea94b7eb5bec3eca6a2eca718b346a6801d14e74b05c06d5b76
L1a 0x4ed2d357e8765ce1f3d3c1bde491b31871015d7c8e9bd17fd608f38f4fe3b3cc
LIST

# ---------------- section 9: account derivation
proxy_code() { cat_hex 0x603d3d8160223d3973 "$(lc "$IMPL")" 0x6009 0x5155f3363d3d373d3d363d7f 0x360894a13ba1a3210667c828492db98dca3e2076 0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3; }
INIT_CODE_HASH=$(h "$(proxy_code)")
echo "[derive] initCodeHash=$INIT_CODE_HASH"
init_data() { cast calldata 'initialize(bytes21,address,bytes,bytes,bytes[])' "0x01$(lc "${VALIDATOR#0x}")" 0x0000000000000000000000000000000000000000 "$(lc "$1")" 0x '[]'; }
account_of() { # owner, label
  local data salt hash
  data=$(init_data "$1"); salt=$(h "$(cat_hex "$data" $Z32)")
  hash=$(h "$(cat_hex 0xff "$(lc "$FACTORY")" "$salt" "$INIT_CODE_HASH")")
  echo "[derive $2] initDataBytes=$(( (${#data} - 2) / 2 )) initDataKeccak=$(h "$data") salt=$salt"
  echo "[derive $2] account=$(cast to-check-sum-address "0x${hash:26}")"
}
account_of "$OWNER0" owner0; account_of "$OWNER1" owner1; account_of "$OWNER2" owner2

# ---------------- section 8: UserOp hashes (EntryPoint v0.7, chain 3223)
call() { echo "($1,0,$2)"; }                 # target, calldata -> tuple text for abi-encode
batch() { # tuples... -> execute(bytes32,bytes) calldata in batch mode (mode byte 0x01)
  local list="[" first=1 t; for t; do [ $first = 1 ] || list="$list,"; list="$list$t"; first=0; done; list="$list]"
  cast calldata 'execute(bytes32,bytes)' 0x0100000000000000000000000000000000000000000000000000000000000000 "$(cast abi-encode 'f((address,uint256,bytes)[])' "$list")"
}
single() { # target calldata -> execute(bytes32,bytes) calldata in single mode (target ++ value ++ data)
  cast calldata 'execute(bytes32,bytes)' $Z32 "$(cat_hex "$(lc "$1")" $Z32 "$2")"
}
userop_hash() { # sender nonce initCode callData accountGasLimits preVerificationGas gasFees paymasterAndData
  local inner
  inner=$(h "$(cast abi-encode 'f(address,uint256,bytes32,bytes32,bytes32,uint256,bytes32,bytes32)' "$1" "$2" "$(h "$3")" "$(h "$4")" "$5" "$6" "$7" "$(h "$8")")")
  h "$(cast abi-encode 'f(bytes32,address,uint256)' "$inner" "$ENTRY_POINT" $CHAIN)"
}
PMD=$(cat_hex "$(lc "$PAYMASTER")" 0x00000000000000000000000000009d46 0x0000000000000000000000000000676e)   # 40,262 and 26,478
GF=$Z32                                                                                                      # fees are zero
SENDER=0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d
NONCE_PREFIX=0x0000845adb2c711129d4f3966735ed98a9f09fc4ce57000000000000000000   # mode 0, type 0, validator, lane 0
APPROVE_MAX=$(cast calldata 'approve(address,uint256)' "$EXCHANGE" $MAXU)
APPROVE_ZERO=$(cast calldata 'approve(address,uint256)' "$EXCHANGE" 0)
SAFA_TRUE=$(cast calldata 'setApprovalForAll(address,bool)' "$EXCHANGE" true)
SAFA_FALSE=$(cast calldata 'setApprovalForAll(address,bool)' "$EXCHANGE" false)
INIT_CODE=$(cat_hex "$(lc "$FACTORY")" "$(cast calldata 'createAccount(bytes,bytes32)' "$(init_data "$OWNER0")" $Z32)")

CD1=$(batch "$(call $USDCE "$APPROVE_MAX")" "$(call $CTF "$SAFA_TRUE")")                      # U1 deploy plus Enable Trading
H1=$(userop_hash $SENDER ${NONCE_PREFIX}00 "$INIT_CODE" "$CD1" 0x0000000000000000000000000004897e000000000000000000000000000124a4 59544 $GF "$PMD")
echo "[U1] initCodeBytes=$(( (${#INIT_CODE} - 2) / 2 )) callDataBytes=$(( (${#CD1} - 2) / 2 )) userOpHash=$H1"
CD2=$(batch "$(call $USDCE "$APPROVE_ZERO")" "$(call $CTF "$SAFA_FALSE")")                    # U2 revoke trading
H2=$(userop_hash $SENDER ${NONCE_PREFIX}01 0x "$CD2" 0x0000000000000000000000000001573d000000000000000000000000000124a4 56016 $GF "$PMD")
echo "[U2] callDataBytes=$(( (${#CD2} - 2) / 2 )) userOpHash=$H2"
CID=0xabababababababababababababababababababababababababababababababab                         # U3 redeem one market
REDEEM=$(cast calldata 'redeemPositions(address,bytes32,bytes32,uint256[])' $USDCE $Z32 $CID '[1,2]')
CD3=$(single $CTF "$REDEEM")
H3=$(userop_hash $SENDER ${NONCE_PREFIX}02 0x "$CD3" 0x0000000000000000000000000001573d0000000000000000000000000001ecea 53755 $GF "$PMD")
echo "[U3] callDataBytes=$(( (${#CD3} - 2) / 2 )) userOpHash=$H3"
APPROVE_ROUTE=$(cast calldata 'approve(address,uint256)' $XO_ROUTE 1000000)                    # U4 withdraw 1 USDC to the owner on Base (no paymaster)
TRANSFER_BASE=$(cast calldata 'transferRemote(uint32,bytes32,uint256)' 8453 "$(word $OWNER0)" 1000000)
CD4=$(batch "$(call $USDCE "$APPROVE_ROUTE")" "$(call $XO_ROUTE "$TRANSFER_BASE")")
H4=$(userop_hash $SENDER ${NONCE_PREFIX}03 0x "$CD4" 0x0000000000000000000000000001573d000000000000000000000000000927c0 55764 $GF 0x)
echo "[U4] callDataBytes=$(( (${#CD4} - 2) / 2 )) userOpHash=$H4"

# signatures over U1: the raw hash, and the EIP-191 envelope of the 32 bytes
echo "[U1] eip191Digest=$(eip191_digest "$H1")"
RAW1=$(cast wallet sign --no-hash --private-key $ANVIL0_KEY "$H1")
EIP1=$(cast wallet sign --private-key $ANVIL0_KEY "$H1")
echo "[U1] rawSig=$RAW1"
echo "[U1] eip191Sig=$EIP1"
echo "[U1] verifyRaw=$(cast wallet verify --no-hash --address $OWNER0 "$H1" "$RAW1" 2>&1)"
echo "[U1] verifyEip191=$(cast wallet verify --address $OWNER0 "$H1" "$EIP1" 2>&1)"
echo "[U1] otherKeyRaw=$(cast wallet verify --no-hash --address $OWNER0 "$H1" "$(cast wallet sign --no-hash --private-key $ANVIL1_KEY "$H1")" 2>&1 | head -1)"

# three real operations of test/fixtures/userop/golden-ops.json (public chain data): entries 0, 3 and 17
for i in 0 3 17; do
  eval "$(node -e '
    const g = require(process.argv[1]).ops[Number(process.argv[2])], o = g.op;
    console.log(`G_TX=${g.txHash.slice(0, 14)} G_EVENT=${g.eventUserOpHash} G_SENDER=${o.sender} G_NONCE=${BigInt(o.nonce)} G_IC=${o.initCode} G_CD=${o.callData} G_AGL=${o.accountGasLimits} G_PVG=${o.preVerificationGas} G_GF=${o.gasFees} G_PMD=${o.paymasterAndData}`);
  ' "$PWD/test/fixtures/userop/golden-ops.json" "$i")"
  echo "[G$i] tx=$G_TX event=$G_EVENT cast=$(userop_hash "$G_SENDER" "$G_NONCE" "$G_IC" "$G_CD" "$G_AGL" "$G_PVG" "$G_GF" "$G_PMD")"
done

# ---------------- section 10: funding calldata goldens
ACC0=0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d
echo "[fund] approve5=$(cast calldata 'approve(address,uint256)' $BASE_ROUTER 5000000)"
echo "[fund] transferSynthetic5=$(cast calldata 'transferRemote(uint32,bytes32,uint256)' 3223 0x0000000000000000000000003333333333333333333333333333333333333333 5000000)"
echo "[fund] transferAnvil0_1=$(cast calldata 'transferRemote(uint32,bytes32,uint256)' 3223 "$(word $ACC0)" 1000000)"
echo "[fund] recipientWordAnvil0=$(word $ACC0)"

# ---------------- section 11: order fee-bound arithmetic (integers, rounding in the safe direction)
ceil_div() { echo $(( ($1 + $2 - 1) / $2 )); }
max_buy_outlay() { echo $(( $1 + $(ceil_div $(( $1 * $2 )) 10000) )); }          # makerAmount, bps
min_sell_proceeds() { echo $(( $1 - $(ceil_div $(( $1 * $2 )) 10000) )); }       # takerAmount, bps
for args in "10000000 800" "123 800" "1 800" "1000000 0" "1000000 1000" "9259259 800" "9259260 800" "4200000 800" "1200000 800"; do
  set -- $args; echo "[fee] maxBuyOutlay($1,$2)=$(max_buy_outlay "$1" "$2")"
done
for args in "10000000 800" "123 800" "1 800" "5000000 0" "326087 800" "326086 800" "861000 800"; do
  set -- $args; echo "[fee] minSellProceeds($1,$2)=$(min_sell_proceeds "$1" "$2")"
done
echo "[fee] seedCap=$(max_buy_outlay 10000000 800)"
```

### 12.4 M1, M2 and M4 for sections 6.1 and 8 to 11

A one-off script, not a committed test (so the values it prints are the "not pinned" ones above). Run from the repository root: `source .tools/env.sh && node_modules/.bin/tsx <file>`. It starts a local anvil with the captured bytecode (`test/anvil/chain.ts`), makes no network request, writes no file and stops anvil when it ends. It prints one JSON object: `derivation`, `userops`, `real`, `eip191` and `fee`.

```ts
// M1, M2 and M4 for docs/signing-vectors.md sections 6.1 and 8 to 11. Run from the repository root with the
// project toolchain:  node_modules/.bin/tsx <this file>
// M1 = the implementation under src/, M2 = hand-written formulas with viem utilities only, M4 = the real
// EntryPoint and KernelFactory bytecode on a local anvil chain (test/anvil/chain.ts). It makes no network
// request and writes no file. Keys are the public Anvil/Hardhat test keys.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { concat, encodeAbiParameters, getAddress, hashMessage, keccak256, parseAbi, stringToBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = process.cwd();
const load = async (rel: string): Promise<any> => import(pathToFileURL(join(root, rel)).href);
const [calls, sign, hashMod, nonceMod, verifyMod, derive, C, chainMod, keys, sg, amounts] = await Promise.all([
  load("src/xo/userop/calls.ts"), load("src/xo/userop/sign.ts"), load("src/xo/userop/hash.ts"), load("src/xo/userop/nonce.ts"),
  load("src/xo/userop/verify.ts"), load("src/xo/account/derive.ts"), load("src/xo/chain/constants.ts"), load("test/anvil/chain.ts"),
  load("test/fixtures/userop/anvil-test-keys.ts"), load("src/xo/signing/index.ts"), load("src/xo/signing/amounts.ts"),
]);
const key0 = privateKeyToAccount(keys.ANVIL_TEST_PRIVATE_KEYS[0]);
const key1 = privateKeyToAccount(keys.ANVIL_TEST_PRIVATE_KEYS[1]);
const owner0 = key0.address;
const out: Record<string, unknown> = {};

// ---- M2: the userOpHash by hand (EntryPoint v0.7, chain 3223)
const T8 = [{ type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }] as const;
const handHash = (op: any): string =>
  keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [keccak256(encodeAbiParameters(T8, [op.sender, op.nonce, keccak256(op.initCode), keccak256(op.callData), op.accountGasLimits, op.preVerificationGas, op.gasFees, keccak256(op.paymasterAndData)])), "0x0000000071727De22E5E9d8BAf0edAc6f37da032", 3223n],
    ),
  );

const started = await chainMod.startXoChain({ paymaster: false, stubs: false });
if (!started.ok) throw new Error(`anvil: ${started.reason}`);
const chain = started.chain;
try {
  // ---- section 9: account derivation, Anvil owners 0 to 2
  const factoryAbi = parseAbi(["function getAddress(bytes data, bytes32 salt) view returns (address)"]);
  const proxyCode = concat(["0x603d3d8160223d3973", C.KERNEL_IMPLEMENTATION.toLowerCase(), "0x6009", "0x5155f3363d3d373d3d363d7f", "0x360894a13ba1a3210667c828492db98dca3e2076", "0xcc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3"]);
  out.derivation = [];
  for (let i = 0; i < 3; i += 1) {
    const o = chain.owner(i).address;
    const initData = derive.buildInitData(o);
    const handInit = concat(["0x3c3b752b", encodeAbiParameters([{ type: "bytes21" }, { type: "address" }, { type: "bytes" }, { type: "bytes" }, { type: "bytes[]" }], [`0x01${C.ECDSA_VALIDATOR.slice(2).toLowerCase()}`, "0x0000000000000000000000000000000000000000", o.toLowerCase(), "0x", []])]);
    const salt = keccak256(concat([handInit, `0x${"00".repeat(32)}`]));
    (out.derivation as unknown[]).push({
      owner: o, initDataBytes: (initData.length - 2) / 2, initDataKeccak: keccak256(initData), salt, initCodeHash: keccak256(proxyCode),
      m1: derive.deriveAccount(o), initDataSameAsHand: initData === handInit,
      m2: getAddress(`0x${keccak256(concat(["0xff", C.KERNEL_FACTORY.toLowerCase(), salt, keccak256(proxyCode)])).slice(26)}`),
      m4: await chain.publicClient.readContract({ address: C.KERNEL_FACTORY, abi: factoryAbi, functionName: "getAddress", args: [initData, `0x${"00".repeat(32)}`] }),
    });
  }

  // ---- section 8.2: four synthetic operations for Anvil account 0
  const seq = (n: bigint) => nonceMod.kernelNonce({ sequence: n });
  const specs = [
    ["U1", "deploy_enable_trading", calls.enableTradingCalls(), nonceMod.firstOpNonce(), false, true],
    ["U2", "revoke_trading", calls.revokeTradingCalls(), seq(1n), true, true],
    ["U3", "redeem", calls.redeemCalls([`0x${"ab".repeat(32)}`]), seq(2n), true, true],
    ["U4", "withdraw", calls.withdrawCalls({ owner: owner0, amountAtomic: 1_000_000n }), seq(3n), true, false],
  ] as const;
  out.userops = [];
  for (const [id, action, cs, nonce, deployed, sponsor] of specs) {
    const p = sign.prepareUserOp({ action, owner: owner0, calls: cs, nonce, deployed, sponsor });
    const m1 = hashMod.userOpHash(p.op);
    const rawSig = await key0.sign({ hash: m1 });
    const eipSig = await key0.signMessage({ message: { raw: m1 } });
    const verdict = async (signature: string, op = p.op) => { const v = await verifyMod.verifyUserOpSignature({ op, signature, expectedOwner: owner0 }); return v.ok ? v.form : v.code; };
    (out.userops as unknown[]).push({
      id, action, sender: p.op.sender, nonce: `0x${p.op.nonce.toString(16).padStart(64, "0")}`, initCodeBytes: (p.op.initCode.length - 2) / 2, initCodeKeccak: keccak256(p.op.initCode),
      callDataBytes: (p.op.callData.length - 2) / 2, callDataKeccak: keccak256(p.op.callData), accountGasLimits: p.op.accountGasLimits, preVerificationGas: p.op.preVerificationGas.toString(),
      gasFees: p.op.gasFees, paymasterAndData: p.op.paymasterAndData, m1, m2: handHash(p.op), m4: await chain.entryPointGetUserOpHash(p.op),
      eip191Digest: hashMessage({ raw: m1 }), digestTag: p.digestTag, rawSig, eipSig, verifyRaw: await verdict(rawSig), verifyEip191: await verdict(eipSig),
      verifyOtherKey: await verdict(await key1.sign({ hash: m1 })),
    });
  }

  // ---- section 8.1: three real operations (public chain data, test/fixtures/userop/golden-ops.json)
  const golden = JSON.parse(readFileSync(join(root, "test/fixtures/userop/golden-ops.json"), "utf8"));
  out.real = [];
  for (const index of [0, 3, 17]) {
    const g = golden.ops[index];
    const op = { ...g.op, nonce: BigInt(g.op.nonce), preVerificationGas: BigInt(g.op.preVerificationGas) };
    (out.real as unknown[]).push({ index, action: g.action, tx: g.txHash.slice(0, 14), block: g.blockNumber, event: g.eventUserOpHash, m1: hashMod.userOpHash(op), m2: handHash(op), m4: await chain.entryPointGetUserOpHash(op), signatureForm: g.signatureForm });
  }
} finally {
  await chain.stop();
}

// ---- section 6.1: the EIP-191 digest form, orders A to C and login L1a
const SMART = "0xcafe000000000000000000000000000000000a11";
const base = { maker: SMART, signer: SMART, beneficiary: "0x0000000000000000000000000000000000000000", nonce: 0n, identifier: `0x${"00".repeat(16)}`, metadata: `0x${"00".repeat(32)}`, signatureType: 3 };
const orders: Record<string, any> = {
  A: { ...base, salt: 99n, tokenId: 123456789n, makerAmount: 4200000n, takerAmount: 10000000n, expiration: 1791389400n, side: 0 },
  B: { ...base, salt: 7n, tokenId: 5n, makerAmount: 1200000n, takerAmount: 4000000n, expiration: 0n, side: 0 },
  C: { salt: 2n ** 256n - 1n, maker: SMART, signer: SMART, beneficiary: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", tokenId: 113287701564209339913693347405685749986285999146352375265161592243948562084773n, makerAmount: 7000000n, takerAmount: 861000n, expiration: 1791389460n, nonce: 2n ** 128n - 1n, identifier: "0x0102030405060708090a0b0c0d0e0f10", metadata: "0xaabbccddeeff00112233445566778899aabbccddeeff00112233445566778899", side: 1, signatureType: 3 },
};
const opts = { allowNonZeroBeneficiary: true };
const prefix = toHex(stringToBytes("\x19Ethereum Signed Message:\n32"));
out.eip191 = {} as Record<string, unknown>;
const forms: Record<string, { wrapped: string; verify: (sig: string, extra?: object) => Promise<any> }> = {};
for (const [name, order] of Object.entries(orders)) {
  forms[name] = { wrapped: sg.kernelWrapDigest(sg.hashOrder(order, opts), SMART), verify: (ecdsa, extra = {}) => sg.verifyOrderEcdsa({ order, orderOptions: opts, ecdsa, expectedOwner: owner0, ...extra }) };
}
const login = { address: SMART, timestamp: "1791389400", nonce: 0n };
forms.L1a = { wrapped: sg.kernelWrapDigest(sg.hashClobAuth(login), SMART), verify: (ecdsa, extra = {}) => sg.verifyClobAuthEcdsa({ fields: login, ecdsa, expectedOwner: owner0, ...extra }) };
for (const [name, form] of Object.entries(forms)) {
  const m1 = hashMessage({ raw: form.wrapped as `0x${string}` });
  const m2 = keccak256(concat([prefix, form.wrapped as `0x${string}`]));
  const sigRaw = await key0.sign({ hash: form.wrapped as `0x${string}` });
  const sigEip = await key0.signMessage({ message: { raw: form.wrapped as `0x${string}` } });
  const sigEipHand = await key0.sign({ hash: m2 });
  const a = await form.verify(sigRaw), b = await form.verify(sigEip), c = await form.verify(sigEip, { digestForms: ["raw"] });
  (out.eip191 as Record<string, unknown>)[name] = { wrapped: form.wrapped, m1, m2, sameDigest: m1 === m2, sigRaw, sigEip, sameSignature: sigEip === sigEipHand, verifyRaw: a.ok ? a.digestForm : a.code, verifyEip191: b.ok ? b.digestForm : b.code, rawOnlyOnEip191: c.ok ? c.digestForm : c.code };
}

// ---- section 11: fee-bound arithmetic. M2 is the remainder form of the ceiling; 21,000 pairs checked.
let pairs = 0;
for (const bps of [0, 1, 400, 799, 800, 801, 1000]) {
  for (let x = 1n; x <= 3000n; x += 1n) {
    const q = (x * BigInt(bps)) / 10000n, r = (x * BigInt(bps)) % 10000n, fee = r === 0n ? q : q + 1n;
    if (amounts.maxBuyFee(x, bps) !== fee || amounts.maxBuyOutlay(x, bps) !== x + fee || amounts.minSellProceeds(x, bps) !== x - fee) throw new Error(`fee mismatch ${x} ${bps}`);
    if ((x + fee) * 10000n < x * (10000n + BigInt(bps)) || (fee > 0n && (x + fee - 1n) * 10000n >= x * (10000n + BigInt(bps)))) throw new Error(`fee not minimal ${x} ${bps}`);
    pairs += 1;
  }
}
out.fee = {
  exhaustivePairs: pairs,
  vectorA: amounts.orderCapAmount({ side: 0, makerAmount: 4200000n, takerAmount: 10000000n, feeBps: 800 }),
  vectorB: amounts.orderCapAmount({ side: 0, makerAmount: 1200000n, takerAmount: 4000000n, feeBps: 800 }),
  vectorC: amounts.orderCapAmount({ side: 1, makerAmount: 7000000n, takerAmount: 861000n, feeBps: 800 }),
  seed: { stake: amounts.SEED_STAKE_ATOMIC, cap: amounts.SEED_CAP_ATOMIC },
};
console.log(JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1));
```
