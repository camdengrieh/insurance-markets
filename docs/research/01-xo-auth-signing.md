# 01 - XO Market Orderbook: authentication and order signing

Task: `xo-auth-signing` (feasibility gates 1, 2, 3 and the XO side of 8).
Researched: 2026-10-18/19 (server clock during live probes: 2026-10-18T17:33Z; task date 2026-10-19).
Method: read-only. Primary source = the `xo-docs` MCP (docs.xo.market pages and both OpenAPI specs). Corroboration = public GitHub reads of ZeroDev Kernel source (`gh api`, nothing cloned/executed), unauthenticated GETs to `orderbooks.xo.market` / `api-mainnet.xo.market`, and local pure hashing with `cast keccak`. No POST/PUT/DELETE, no keys, no PayBox money tools, no `.env` reads.

Confidence: **H** = read first-hand in a primary source (or observed live) this session; **M** = secondary/inferred; **L** = weak/stale.
Staleness: XO doc pages carry no dates (NOT FOUND). The live server reports `build_timestamp` 1791838229 = 2026-10-12T20:50Z, `version` 0.1.0, `git_sha` "unknown" (H, `GET /version`). So the API is a very young beta (0.1.0), and docs and spec disagree in places (see "Doc and spec inconsistencies").

---

## 0. Summary and gate verdicts

| Gate | Verdict | One-line reason |
|---|---|---|
| 1 auth/credentials | **partial** (XO side: go) | Auth is fully specified (L1 ClobAuth via the smart account, L2 HMAC). Where per-user secrets live is a PayBox-runtime question; XO's `derive-api-key` may allow a stateless design, but see unresolved items. |
| 2 order flow | **answered-go** | Orders are EIP-712 payloads POSTed to `POST /order`. The digest is a pure function, so prepare -> sign -> submit works and the plugin never needs keys. |
| 3 smart wallet ownership | **partial** | The signing primitive is exactly specified and PayBox `typedData` (or `raw`) can in principle produce it. But accounts are created only through the beta.xo.market UI, derivation parameters are undocumented, and RPC key / paymaster come from "your XO contact". No self-service path for a PayBox wallet to become owner is documented. |
| 8 (XO side) | **answered-go** | XO does not need an on-chain proposal for orders. The signature is an off-chain ECDSA over a digest the plugin can compute and verify with `ecrecover` before submitting. The order signature has no timestamp, so it can wait for approval. The PayBox half (do autonomous grants auto-sign?) is out of scope here. |

Five findings that change the plan:

1. **The owner must sign a Kernel-wrapped digest, not the order.** Exact bytes in section (c)/(e). It is expressible as a standard EIP-712 `typedData` (domain `Kernel` / `0.3.1` / `3223` / `verifyingContract = smart account`, struct `Kernel(bytes32 hash)`), or as a `raw` 32-byte digest. Final wire signature = `0x01 || validator(20) || ecdsa(65)` = 86 bytes.
2. **Orders are blind to the signer.** What the owner sees is only `Kernel(hash=0x...)`. The "quote -> re-verify" guardrail therefore has to live in the plugin: recompute the order hash from the quoted fields, and `ecrecover` the returned signature against the expected owner before POSTing.
3. **`GET /balance-allowance`, `/positions`, `/claimable` are public by address (live H).** v0.1 read-only needs no secrets. `/orders`, `/trades`, `/data/*`, `/auth/api-keys`, and WebSocket `/ws/user` need L2.
4. **L1 timestamp tolerance is about +/-120 s (live H); L2 is +/-30 s (docs).** A human-approval round trip of more than about two minutes will invalidate an L1 signature that was timestamped up front.
5. **The `CancelOrder(orderId, marketId)` EIP-712 type is not documented anywhere.** Cancel via L2 HMAC (`{"orderID": ...}`) is documented. Cancel-by-signature cannot be implemented byte-exactly from the docs.

---

## (a) L1 ClobAuth (wallet signature)

Source: `/api-reference/authentication`, `/guides/smart-accounts`, `/guides/wire-conventions`, OpenAPI `/auth/*`. All H unless noted.

**Endpoints** (host `https://orderbooks.xo.market`):

| Endpoint | Auth per OpenAPI | Auth per prose | Semantics |
|---|---|---|---|
| `POST /auth/api-key` | L1 | L1 | Mint a new key for the signing wallet. Body in the doc sample is `"{}"`. |
| `GET /auth/derive-api-key` | L1 | L1 | "Returns the oldest key in insertion order ... Never mints." 404 `no API key found for address 0x...` if none. |
| `GET /auth/api-keys` | **L2** | L1 | Lists key UUIDs only. Live: no headers gives 401 `L2 auth required` (H). |
| `DELETE /auth/api-key` | **L2** | L1 | Body `{"api_key": "<uuid>"}`. |

**Headers** (live-verified that the server reads these, with underscores or the hyphenated fallback; it does NOT read `POLY_*`):

| Header | Required | Value |
|---|---|---|
| `XO_ADDRESS` | yes | The **smart account** address (maker), not the owner EOA. |
| `XO_SIGNATURE` | yes | Hex. For smart accounts the 86-byte Kernel signature (below). |
| `XO_TIMESTAMP` | yes | Unix seconds as a decimal string; must equal the `timestamp` string in the signed struct. |
| `XO_NONCE` | no | Integer, default `0`; must equal the signed `nonce`. |

Hyphenated fallbacks `Xo-Address`, `Xo-Signature`, ... accepted (docs), and `Xo-Api-Key` was recognized live.

**EIP-712 domain** (no `verifyingContract`; two docs pages agree):

```
EIP712Domain(string name,string version,uint256 chainId)
name = "ClobAuthDomain", version = "1", chainId = 3223
```

**Struct** (field literally named `address`):

```
ClobAuth(address address,string timestamp,uint256 nonce,string message)
address   = smart account (same as XO_ADDRESS)
timestamp = the XO_TIMESTAMP string
nonce     = XO_NONCE (0 if absent)
message   = "This message attests that I control the given wallet"   // literal, "by SDK convention"
```

viem types from the official sample: `ClobAuth: [{address:address},{timestamp:string},{nonce:uint256},{message:string}]`.

**Smart-account signature** over the ClobAuth digest: `digest = hashTypedData(ClobAuth...)`, then Kernel-wrap and sign exactly as in (c). Verified by the gateway with ERC-1271 on `XO_ADDRESS`.

**Timestamp / nonce rules**
- Docs: NOT FOUND for L1 (searched `/api-reference/authentication*`, `/guides/smart-accounts`, `/guides/wire-conventions` for expire/window/replay/nonce). The +/-30 s rule is stated for L2 only.
- **Live (H, 2026-10-18, dummy signature, `GET /auth/derive-api-key`):** server error `L1 timestamp too old or too far in future`. Accepted past the timestamp check at delta -110 s and +120 s; rejected at -125 s and +150 s. So the window is about +/-120 s of server time.
- Nonce semantics (single-use? multiple keys per nonce, as in Polymarket?) NOT FOUND. `derive` returns "the oldest key", so the nonce does not appear to select a key.
- Live error text for a wrong signature: `L1 signature invalid (ECDSA failed; EIP-1271: ...)`. So the gateway tries plain ECDSA recovery first and then ERC-1271 on `XO_ADDRESS`. An 86-byte signature passes format checks and reaches the ERC-1271 path (H). The message also refers to a `--eip1271-rpc-url` config and "XO testnet for XO-deployed ZeroDev/Privy wallets" (developer text leaking from server config; meaning L, see "Suspicious / odd content").

Reference vector (computed locally by me with `cast keccak` from the doc formulas, using the doc's placeholder address `0xCAFE000000000000000000000000000000000A11`, timestamp `"1792344796"`, nonce 0; not cross-checked against the server or a second implementation, so treat as M):
- ClobAuth domain separator: `0x44e30cd10e3df85b868a7b3850e9e35945475365c26a07680811e3ff1e85197b`
- CLOBAUTH_TYPEHASH: `0x52578c5c725a28a84fedc8c22aa47947822942f35b4dc350db028e45320e035c`
- ClobAuth struct hash: `0xf92057811cbe2d513ba534bf9512265ac75a01535c8a2e5f8686d0c036d90e4f`
- ClobAuth digest: `0x21acb038432cbba0686a58bd4985506d07bb935e13080b87f25b3d65557e7d11`
- Kernel-wrapped digest (owner signs this): `0x6f0d66f4f6d133d4cdc7e04dd0e9841e5962322dc56bf6bb8078278ac51e3c6d`

---

## (b) L2 HMAC

Source: `/api-reference/authentication`, `/guides/smart-accounts`, OpenAPI `ApiKeyTriplet`. H unless noted.

**Headers** (live H: `XO_API_KEY` / `XO_*` and `Xo-*` are recognized; `POLY_*` gives `HMAC L2 credentials required`):

| Header | Value |
|---|---|
| `XO_API_KEY` | `apiKey` UUIDv4 from create/derive |
| `XO_TIMESTAMP` | Unix seconds string, within +/-30 s of server time (docs). Align with `GET /time` (bare JSON number, seconds). |
| `XO_PASSPHRASE` | `passphrase` from create/derive ("constant-time-compared") |
| `XO_SIGNATURE` | URL-safe base64 of HMAC-SHA256 |

**Canonical string** (verbatim): `timestamp + method + path + body`
- `timestamp` = same string as the header; `method` = uppercase; `path` = request path **including the query string**; `body` = raw request body, `""` for body-less methods.
- `XO_SIGNATURE = URL_SAFE_BASE64( HMAC_SHA256(secret, timestamp + method + path + body) )`.
- Not specified (NOT FOUND): (1) whether the HMAC key is the **base64-decoded** secret or the literal string; the response says `secret` is "Base64-encoded HMAC secret" and the Polymarket reference (`py-clob-client` `signing/hmac.py`, read via `gh api`) does `base64.urlsafe_b64decode(secret)` first, so decoding is the likely rule (M); (2) whether the output base64 keeps `=` padding (Polymarket keeps it) (M); (3) body byte-exactness: sign the exact bytes sent. The Polymarket Python reference rewrites single to double quotes, which is irrelevant for a JS plugin that signs the same string it sends.

**Triplet lifecycle**
- Response `{ apiKey (uuid), secret, passphrase }`; camelCase. Prose: "Store all three; the secret is only shown once." **But** the OpenAPI example for `GET /auth/derive-api-key` also returns `secret` and `passphrase`, with the text "Returns the caller's existing (oldest) key". These conflict. If derive really re-returns the secret, credentials are recoverable with a fresh L1 signature at any time. Unverified (needs a valid L1 signature; I did not and cannot create one). Confidence in either reading: L.
- `MAX_KEYS_PER_USER`: **NOT FOUND** as a number (searched whole docs tree). Exceeding returns 400 `"api key limit reached"` (H).
- "Create vs derive": `POST` mints a new key each call until the cap; `GET derive` is idempotent, never mints, returns the oldest. SDK pattern = derive, fall back to create on 404 (the official `smart_wallet_api_key.ts` sample does exactly this).
- Expiry/rotation: NOT FOUND. No expiry field in any response. Rotation by implication = create a new key, then `DELETE /auth/api-key` the old one (needs L2 per OpenAPI). The list example shows multiple UUIDs ("caller has rotated keys").
- Key scope/permissions (read-only keys etc.): NOT FOUND. Reasoned (M): since every order needs an owner signature over the Kernel-wrapped hash, a stolen HMAC triplet cannot place orders; it can read private order/trade data, cancel via the HMAC cancel form, and send heartbeats. So it is a griefing/privacy risk, not a theft risk. Withdrawals are not exposed by the API at all.
- WebSocket `/ws/user`: the same triplet is delivered **inside the subscribe message body** (docs).
- Opt-in heartbeat: `POST /heartbeats` or `/v1/heartbeats` with valid L2; once opted in, missing a heartbeat for more than 30 s cancels all open orders (`/guides/auto-cancellation`). A plugin should never call it.

---

## (c) Orders

Source: `/guides/smart-accounts`, `/guides/wire-conventions`, `/guides/order-types`, `/guides/taker-delay`, `/guides/fees`, OpenAPI `CTFOrder`. H unless noted.

**Endpoint**: `POST https://orderbooks.xo.market/order`; batch `POST /orders` (up to 100, each independent, response `results[]` snake_case). Envelope: `{ "order": {...}, "orderType": "GTC|GTD|FOK|FAK", "postOnly": false }`.

**Order struct on the wire** (camelCase, all strings except `side`/`signatureType`):

| Field | Type | Meaning / units |
|---|---|---|
| `salt` | uint256 (decimal string) | Entropy. Example `"12345678901234567890"`. Duplicate resting payload gives 400 `duplicate order: ... same signed-payload hash is already resting`. |
| `maker` | address | XO smart account. Funds principal + fee; receives refunded principal. |
| `signer` | address | Must equal `maker` for `signatureType=3`. |
| `beneficiary` | address | Proceeds receiver; `0x000...0` = pay maker (default). Never funds fees or gets refunds. |
| `tokenId` | uint256 (decimal string) | CTF outcome token id; BUY = asset bought, SELL = asset sold. |
| `makerAmount` | uint256 (string) | Max the maker sells, **6-decimal micro units** (BUY: collateral; SELL: outcome shares). |
| `takerAmount` | uint256 (string) | Min the maker receives, 6-decimal micro units (BUY: shares; SELL: collateral). |
| `expiration` | uint256 (string) | Unix seconds; `0` = none. GTD requires non-zero. Enforced by a ~10 s sweeper. |
| `nonce` | uint128 | "On-chain cancel nonce"; JSON number, decimal string or 0x-hex accepted. Sample uses `"0"`. |
| `identifier` | bytes16 | Opaque tag, zeros default. Hashed. |
| `metadata` | bytes32 | Opaque tag, zeros default. Hashed. |
| `side` | uint8 | `0` BUY, `1` SELL |
| `signatureType` | uint8 | `3` for XO. (`0` EOA is documented as NOT accepted; `1`,`2` reserved/not used.) |
| `signature` | bytes | NOT in the typehash. See below. |

No fee field. `taker` and `feeRateBps` are legacy, ignored on parse, and must not be signed.

**Order EIP-712 domain**

```
EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
name = "XO Market CLOB", version = "1", chainId = 3223
verifyingContract = 0x4bC5E872256D12E6017dfe466E04c867DC761B77   // CTF Exchange
```

**Typehash string** (13 fields, order matters):
`Order(uint256 salt,address maker,address signer,address beneficiary,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint128 nonce,bytes16 identifier,bytes32 metadata,uint8 side,uint8 signatureType)`
`ORDER_TYPEHASH = 0x17df2a5febe57967a2c9c03de6869c37c67cff602ecbe4f734aad39de2b172ef` (I computed this with `cast keccak`; the docs do not print the hash).
Order domain separator (mainnet) = `0x377cb2cbb6c9bcc7400f72694c6fc43a929de4faf9ee0ce851a8c2cdd02260ae` (computed by me).
`orderHash = keccak256(0x1901 || domainSeparator || keccak256(abi.encode(ORDER_TYPEHASH, salt, maker, signer, beneficiary, tokenId, makerAmount, takerAmount, expiration, nonce, identifier, metadata, side, signatureType)))`. This is also the `orderID` returned by `POST /order` ("0x-prefixed EIP-712 order hash digest").

**signatureType semantics**
- `0` EOA (`ecrecover`): documented as rejected today ("the XO orderbook does not accept EOA-signed orders today"). The OpenAPI field text still says "direct EOA integrations use signatureType = 0": stale, contradicted by three other pages.
- `3` XO smart account (OpenAPI enum name `XO_ZERODEV`): exchange enforces `order.maker == order.signer`, `maker.code.length > 0`, and `IERC1271(maker).isValidSignature(orderHash, signature)` passes.

**The "wrapped order hash" and signature bytes (byte by byte)** - from `/guides/smart-accounts#xo-smart-account-signatures`:
1. `orderHash` as above (what the exchange passes to `isValidSignature`).
2. Kernel wrapper, a *second* EIP-712 whose verifying contract is the **smart account**:
   ```
   EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)
   name = "Kernel", version = "0.3.1", chainId = 3223, verifyingContract = <smart account>
   Kernel(bytes32 hash),   hash = orderHash   (or the ClobAuth digest)
   ```
   `wrapped = keccak256(0x1901 || kernelDomainSeparator || keccak256(KERNEL_TYPEHASH || orderHash))`, `KERNEL_TYPEHASH = keccak256("Kernel(bytes32 hash)") = 0x1547321c374afde8a591d972a084b071c594c275e36724931ff96c25f2999c83` (I re-computed it with `cast keccak`, and it equals `KERNEL_WRAPPER_TYPE_HASH` in zerodevapp/kernel `src/types/Constants.sol` at tag v3.1, H).
3. The **owner EOA** signs `wrapped` with plain secp256k1 over the 32-byte digest, no EIP-191 prefix (sample: `owner.sign({ hash: wrapped })` in viem). Result is 65 bytes `r||s||v` (sample signatures end in `1b`/`1c`, so `v` = 27/28).
4. Wire signature: `0x01 || bytes20(0x845ADb2C711129d4f3966735eD98a9F09fC4cE57) || ecdsa65` = 1 + 20 + 65 = **86 bytes** (172 hex chars after `0x`). `0x01` = Kernel `VALIDATION_TYPE_VALIDATOR`; `0x845ADb...` = ZeroDev ECDSA validator (zerodevapp/sdk `kernelVersionRangeToValidator[">=0.3.1"]`, H).
   - Kernel v3.1 `isValidSignature` -> `ValidatorLib.decodeSignature`: first byte `0x01` -> 21 bytes consumed -> `validator.isValidSignatureWithSender(msg.sender, _toWrappedHash(hash), sig)`; `_toWrappedHash(h) = _hashTypedData(keccak256(abi.encode(KERNEL_WRAPPER_TYPE_HASH, h)))`, domain `"Kernel"`/`"0.3.1"` (H, Kernel v3.1 source). This matches the XO docs.
   - Source also shows a mode-`0x00` (root) form `0x00 || sig` that Kernel v3.1 accepts. XO does not document it; do not use (M).
   - The validator source at ZeroDev's `kernel-7579-plugins` HEAD (last commit 2026-04-21) accepts either raw ECDSA over the hash or ECDSA over the EIP-191 `toEthSignedMessageHash(hash)`. The bytecode actually deployed at that address on chain 3223 is unverified, so rely on the raw form that XO documents (M).
5. Use the **same** signature bytes for `order.signature`; for L1 use `XO_SIGNATURE` over the wrapped ClobAuth digest.

Worked vector (computed by me with `cast keccak` from the doc formulas for the OpenAPI sample order: salt `12345678901234567890`, maker=signer=`0xCAFE000000000000000000000000000000000A11` (doc placeholder), beneficiary zero, tokenId `2651...6943`, makerAmount `55000000`, takerAmount `100000000`, expiration 0, nonce 0, zero identifier/metadata, side 0, signatureType 3). Not checked against the server (M):
- order struct hash `0x6dde358724fc1465baf9a0e1945adb50baae6de97dcdd4b717128ebbc9e2ef9f`
- `orderHash` `0x553d58fdb364eecefedb01cb565f886200482902f018cfd359168db15e57e723`
- Kernel domain separator (chain 3223, verifyingContract = placeholder maker) `0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818`
- **wrapped digest the owner signs** `0x9137675d1758698f00f6577092537be92abb390a5c32314349c618c06186bf8b`

**Units, ticks, sizes**
- Collateral "XO USDC" `0x80c12230ce677e6f304027a14780Edd2A829ab0c`, **6 decimals**; outcome shares are also 6-decimal micro-shares (`"1000000"` = 1 share). The docs never call it "USDC.e" (plan's name is unverified).
- Tick `0.001` globally; price as tick integer in [1,999] over 1000; off-tick gives 400 `invalid price tick`. Live `/tick-size` and `/book` agree (`0.001`, H).
- Worked example in the spec: BUY 100 shares at 0.55 -> `makerAmount=55000000`, `takerAmount=100000000`; `price = makerAmount/takerAmount` for BUY, inverse for SELL (M, inferred from the example and the "encode tick price into the ratio" text).
- Rounding rule when `shares_micro * tick` is not divisible by 1000: NOT FOUND.
- Minimum size: **no authoritative number**. Live `GET /book` returned `min_order_size: "0"` for two tokens (one Pulse, one long-form; the spec says "0" means no MarketInfo yet). 422 error *examples* show `size below minimum: min 5000000, got 1000` (= 5 shares) and `notional below minimum: min 10000, got 500` (= 0.01 USDC), but these are illustrative strings (L). The liquidity-rewards "Minimum size: 5 shares" is a rewards-eligibility rule, not an order floor.
- Wire-convention inconsistency: `/guides/wire-conventions` shows decimal share sizes (`"0.5"`), the OpenAPI says "decimal-string integers in human shares". Response `makingAmount`/`takingAmount` mix USDC micro (BUY) and "human-share tokens" (SELL).
- Fees: not in the order. `fee = C * feeBps/10000 * p * (1-p)`, charged to `maker`; fetch `GET /fee-rate?token_id` -> `{ "base_fee": <bps> }` (live: `0` on both probed tokens). Budget extra allowance for taker BUYs.

**Order types**: `GTC` rests; `GTD` needs non-zero `expiration`; `FAK` fills what it can at the signed price then cancels the rest; `FOK` all-or-nothing (rejection is HTTP 200 with `success:false`, `status:"delayed"`, `errorMsg`). No `MARKET`; emulate with a cap price (`0.99` BUY / `0.001` SELL) and FAK/FOK. `postOnly` is an envelope flag (not signed), only valid with GTC/GTD, 400 if it would cross. `status` in {`live`,`matched`,`delayed`}.
**Taker delay**: marketable orders (all FAK/FOK, and crossing GTC/GTD) are held 500 ms (3 s for sports markets in match time); `POST /order` **blocks** for the hold, so use timeouts of 1 s or more (3 s+ for live sports).
**Other statuses**: 422 `insufficient balance|insufficient position|size below minimum|notional below minimum|market is not active`; 429 with `retry_after_ms`; 503 `trading_paused` with `Retry-After: 60`; `GET /trading-state` is live (`{"state":"active"}`) but is not in the OpenAPI.

---

## (d) Cancel and cancel-all signing

Source: `/api-reference/trade/cancel-*`, OpenAPI `CancelOrderRequest` etc. H for what is written; the typed data itself is NOT FOUND.

| Endpoint | Documented forms |
|---|---|
| `DELETE /order` | (1) "CLOB SDK form (HMAC auth, just `orderID`)": body `{"orderID":"42"}`. (2) "legacy form (EIP-712 cancel signature)": `{orderId:int64, marketId, signature, signatureType:0\|3, signer}`; `signer` required when `signatureType=3`. |
| `DELETE /orders` | schema requires `orderIds[]` (int64), `marketId`, `signature`, `signatureType`, optional `signer` |
| `DELETE /cancel-market-orders` | `marketId`, `signature`, `signatureType`, `signer` |
| `DELETE /cancel-all` | `signature`, `signatureType`, `signer`. Example: "global cancel (sign with empty string as marketId)" |

- The only description of the signed message is `EIP-712 sig over CancelOrder(orderId, marketId)`. **Not documented**: domain (name/version/chainId/verifyingContract), field types (`uint64`? `string`? `bytes32`?), how the empty-`marketId` global form is encoded, and whether the Kernel wrapper applies (most likely yes for `signatureType=3`, but unstated). Searched: `/api-reference/trade/*`, `/guides/*`, OpenAPI, search tool for "CancelOrder EIP-712". Result: NOT FOUND.
- The HMAC form for single cancel is documented (OpenAPI `hmac_clob_form`). Whether `/orders`, `/cancel-market-orders`, `/cancel-all` accept HMAC-only requests is unclear: the OpenAPI marks `signature` and `signatureType` as required, but the Rust-sample comments say "Requires an authenticated client" with no signing.
- ID mismatch: `POST /order` returns `orderID` = 0x order hash; `GET /orders` returns numeric `id` and `order_hash`; `DELETE /order` examples use numeric id (`"42"`, `42`) but the Rust sample passes a 0x hash string. Treat the numeric `id` from `GET /orders` (L2) or batch `order_id` as the cancel key, and test which form the server takes before relying on a hash.
- Recommendation: v0.2 cancel = L2 HMAC single-order form; for cancel-all rely on `DELETE /cancel-all` only after XO confirms the HMAC-only form or the typed-data spec.

---

## (e) Smart account: address, deployment, ownership, signing primitive

**How the address is determined** - H for what is stated, NOT FOUND for derivation:
- XO docs: "Create an XO smart account at beta.xo.market. That smart account is your maker address." Created via the web app (Privy login / external wallet) - UI only. Docs say: your smart account address, owner key and paymaster "are account- and market-specific. Ask your XO contact for these during onboarding."
- Stack: Kernel (ERC-7579) v3.1 via ZeroDev/Privy (domain `"Kernel"`/`"0.3.1"`, enum name `XO_ZERODEV`, `execute(bytes32,bytes)` on "accounts created at beta.xo.market").
- Generic Kernel v3.1 (zerodevapp/kernel tag v3.1, `KernelFactory.sol`, H): `account = predictDeterministicAddressERC1967(implementation, keccak256(abi.encodePacked(initData, salt)), factory)`, so the address is a CREATE2 function of (factory, implementation, initData incl. root-validator install data = ECDSA validator + 20-byte owner, salt/index). **XO's factory address, implementation, initData layout and salt/index are not documented**, so a client cannot derive an XO account address from an owner EOA from the docs alone.
- Lookup: `GET /balance-allowance?address=<addr>` (public, no auth, live H) returns `smart_account` ("User's smart-account address as hex without 0x prefix; null for plain EOA users with no smart account"). Live probe with an unregistered address returned `{"balance":"0","allowance":"0","smart_account":null}`. The docs do not say whether `address` must be the owner or the smart account, and I did not test with a real account (no real addresses used). Treat "owner EOA -> smart account" lookup via this field as **plausible but unverified** (M/L). Data API `GET /users/portfolio?user=<wallet or username>` also resolves users (portfolio only).
- Who deploys: **NOT FOUND**. The exchange requires `maker.code.length > 0`, and on-chain actions run as ERC-4337 v0.7 UserOps via `https://mainnet-bundler.xo.market/` with an XO paymaster. Whether deployment happens at account creation or with the first UserOp ("Enable Trading") is not documented.

**Can an arbitrary external EOA be the owner?**
- Product docs: "Owner wallet (external or embedded)". The deposit page says "Connect an external EVM or Solana wallet". The ECDSA validator takes any non-zero 20-byte owner (`onInstall`, `_data.length == 20`; kernel-7579-plugins source, H). The smart-accounts troubleshooting says "The owner key must be the one registered on that account."
- So in principle yes: any EOA can be an owner if the account is created with it. What is NOT documented: a programmatic creation path, an owner-change flow, or whether the orderbook only accepts accounts registered in XO's own backend (the `smart_account` field and `owner` UUIDv5 suggest XO keeps a user/account registry). A PayBox wallet becoming owner therefore needs one of: (1) the user signs up at beta.xo.market with the PayBox address as external owner (needs a way for PayBox to sign the Privy/SIWE login; unknown); (2) owner replacement through a UserOp (undocumented); (3) XO provisions it (the docs repeatedly point to an XO contact).
- Practical gating: mainnet RPC `rpc-mainnet-2.xo.market` needs a private `api_key` "issued privately during onboarding" (docs); paymaster address also from onboarding. Both bundler and RPC are JSON-RPC (POST) and were not probed.

**Exactly which primitive must the owner produce?** (H, from `/guides/smart-accounts` + Kernel source)
- For **orders and L1 ClobAuth**: ECDSA (secp256k1, 65-byte r||s||v) over the 32-byte `wrapped` digest = EIP-712 hash of `Kernel(bytes32 hash)` under domain {`Kernel`, `0.3.1`, 3223, smart account}. This is *identically* what `eth_signTypedData_v4` returns for typed data:
  ```json
  { "types": { "EIP712Domain": [ {"name":"name","type":"string"}, {"name":"version","type":"string"},
                                  {"name":"chainId","type":"uint256"}, {"name":"verifyingContract","type":"address"} ],
               "Kernel": [ {"name":"hash","type":"bytes32"} ] },
    "primaryType": "Kernel",
    "domain": { "name":"Kernel", "version":"0.3.1", "chainId":3223, "verifyingContract":"<smart account>" },
    "message": { "hash":"<orderHash or ClobAuth digest>" } }
  ```
  (Proof by definition: the docs' `wrapHashKernelV3` computes `keccak(0x1901 || keccak(domainTypehash,nameHash,versionHash,chainId,wallet) || keccak(KERNEL_TYPEHASH, hash))`, which is the EIP-712 `hashStruct` encoding. No second implementation was run.)
  The plugin/agent then prepends `0x01 || validator` to the 65-byte result.
- For **UserOps** (Enable Trading, redeem): ECDSA over the bundler-computed `userOpHash`, "raw ECDSA, same key that signs orders" (`/guides/redeem-positions`). No EIP-712 wrapper. The deployed validator source also tolerates an EIP-191-prefixed form (M).
- NOT used: `personal_sign` over a hash (not documented; the validator source would tolerate it, but only if the message intent could sign raw 32 bytes), a plain EIP-712 signature over the *Order* typed data (rejected: the account verifies the Kernel-wrapped digest, the exchange's `Order` domain digest is only the inner hash), `eth_sendTransaction` from the owner (documented as not redeeming for the smart account).

**Could PayBox signing intents produce it?** Tool schema read first-hand this session (`request_wallet_sign`, not called); the intent *payload shapes* beyond `message: string`, `rawSigningPayloadHex: string` are `true` (untyped) in the schema, and PayBox docs were out of scope here:

| Intent | Verdict for XO | Why |
|---|---|---|
| `typedData` | **Yes, primary candidate (unverified end to end)** | The Kernel wrapper above is a standard EIP-712 object. Unknowns: does PayBox accept an arbitrary domain with `chainId` 3223 and `verifyingContract` = a foreign contract; does it return the 65-byte `r||s||v`; will grant policy treat it as risky (it is blind: user sees only `Kernel(hash)`). |
| `raw` (`rawSigningPayloadHex`, "a precomputed digest") | **Yes, in principle** | Sign the 32-byte wrapped digest (orders, ClobAuth) or `userOpHash` (UserOps) directly. This is the only intent that can also sign UserOps. Likely most restricted (blind). |
| `message` | Probably not | EIP-191/personal_sign of a *string*; the Kernel validator source would accept EIP-191 of the digest, but a UTF-8 string cannot carry raw digest bytes unless PayBox treats `0x...` as bytes (undocumented). |
| `transaction` | No | An EVM tx from the owner EOA is not a UserOp and does not act as the smart account. |
| `authorization` (EIP-7702) | No | Not what Kernel verifies here. |
| `solanaMessage` / `solanaTransaction` | No | Wrong chain family. |

Consequence: each order = 1 PayBox signature (batch = N signatures), plus 1 for an L1 derive/create, plus 1 UserOp signature for approvals/redeem. Whether autonomous grants auto-sign these is the PayBox half of gate 8.

---

## (f) Where per-user secrets (apiKey / secret / passphrase) could live

Constraint: secrets must never pass through tool args or model context. Documented facts that constrain the options:
- F1. Every L2 request needs the plaintext `secret` for HMAC *and* the `passphrase` header, so whichever component builds the HTTP request must hold them at signing time. XO offers no delegated/scoped/read-only key (NOT FOUND) and no signing oracle.
- F2. `POST /orders` needs an owner signature per order regardless, so a stolen triplet cannot place orders (M, reasoning above): the blast radius is private-data reads, cancels and heartbeats.
- F3. L1 can re-mint or re-derive credentials, with a signature valid for about +/-120 s (live H); `derive` is idempotent (oldest key); `create` is capped by `MAX_KEYS_PER_USER` (unknown value).
- F4. If `derive` re-returns `secret`/`passphrase` (spec example) credentials need not be stored. If the "shown once" prose is right, they must be stored or the key must be deleted (L2) and re-created.
- F5. Public by-address reads (`/balance-allowance`, `/positions`, `/claimable`, plus Data API) need no secrets. `GET /orders`, `/trades`, `/data/*`, `/auth/api-keys`, WS `/ws/user` need L2.
- F6. PayBox side (read first-hand from tool descriptions): `use_plugin` says unofficial plugins "call the authenticated user's enabled remote MCP installation after validating `input` against its persisted schema" (so there is a per-user installation, and it is described as a *remote MCP*, which conflicts with the plan's single-file ES-module description; for the PayBox-docs task to resolve). `wallet_id` is "Not sent to plugin code". `request_secret` returns a "one-time `secret_token`" when `raw=false`, or the real secret into the agent's context when `raw=true` (the latter violates the constraint). How a plugin would redeem a `secret_token`: NOT FOUND in those descriptions.

Design options:

| # | Option | What it needs | Fits constraints? | Open issues |
|---|---|---|---|---|
| A | **Stateless: derive on demand.** For each session/call batch: get an L1 signature from PayBox (typedData Kernel wrap of the ClobAuth digest), plugin calls `derive`, uses the triplet in memory only, discards it. | F3/F4: derive returns the secret. | Secrets never reach the model. The L1 signature does (it is a tool arg), but it is short-lived (~4 min replay window, nonce single-use unknown) and by itself only enables a derive call. | Unverified that derive returns the secret. Approval latency can exceed 120 s. One extra PayBox signature per session. Each session re-derives. |
| B | **Plugin-side per-user encrypted store** keyed by the PayBox user/installation identity. | A server-side store (remote-MCP plugin host) and a way to know the user. | Secret stays inside plugin infra, never in args/context. | Depends on PayBox runtime facts (F6): per-user storage / identity not verified. Makes the plugin operator a custodian of HMAC creds (griefing risk only, F2). |
| C | **PayBox `secret` credential + `request_secret` raw=false token**, consumed by the plugin. | A documented way for plugin code to resolve a `secret_token`. | Best fit if it exists. | NOT FOUND whether a plugin can redeem it. A raw=true request would put the secret into model context (violates constraint). |
| D | **Plugin-wide env vars.** | n/a | **No**: one shared key for all users, contradicted by L1 being per-wallet; the plan already rejects it. | - |
| E | **Avoid L2.** Use only signature-authenticated calls plus public reads. | Order POST and cancel accepting signature-only; typed data for cancel. | Would remove the secret entirely. | Unverified: OpenAPI lists no `security` on `POST /order`/`DELETE /order`, but the official Rust sample authenticates first and the prose says L2 covers "every other authenticated endpoint". The spec is plainly under-annotated (`/heartbeats` also shows none, yet docs require L2). Testing needs a POST (out of scope). Cancel typed data is undocumented, own-order listing needs L2. |

Recommended path for the plan: build v0.1 (public reads) with no secrets; design v0.2 around option A (re-derive) as the default and option B/C as upgrades once the PayBox plugin runtime is known; ask XO two direct questions (does `POST /order` require L2; does `derive` return the secret).

---

## (g) Rate limits (H, `/api-reference/rate-limits`, `/data-api-reference/rate-limits`)

| Tier / action | Limit |
|---|---|
| Public REST (orderbook) | 5 requests per second |
| Public WebSocket connections | 3 concurrent |
| Authenticated single order placement + cancellation | 250 requests per second **total** (shared budget, "limits do not stack") |
| Authenticated batch order placement + cancellation | 25 requests per second total |
| Authenticated batch cancel-all | 5 requests per second |
| Authenticated WebSocket connections | 25 concurrent |
| WS per-connection | idle timeout 60 s (send literal `PING`, reply `PONG`); 100 inbound msgs/s; max message 65 KB; max 100 market subscriptions |
| Data API REST (`api-mainnet.xo.market/api`) | 100 requests per 10 s; `/public/liquidity-rewards/*` 30 per 10 s; excess gets 429 |

429 body: `{ "error": "rate limit exceeded", "retry_after_ms": <ms> }` for a "1-second fixed window" per-user mutation limit. Guidance: separate queues for placement and cancellation.

---

## Doc and spec inconsistencies found (each one needs a decision or a question to XO)

| # | Conflict | Resolution used |
|---|---|---|
| 1 | Prose header names `XO_API_KEY`/`XO_PASSPHRASE`; OpenAPI response text says `POLY_API_KEY`/`POLY_PASSPHRASE` | Live probe: `XO_*` and `Xo-*` accepted, `POLY_*` ignored (H). OpenAPI text is stale. |
| 2 | Prose: all four `/auth/*` endpoints use L1. OpenAPI: delete + list use L2 | Live: `/auth/api-keys` needs L2 (H). Treat delete as L2. |
| 3 | "Secret only shown once" vs `derive` example returns secret + passphrase | Unresolved (see b/f). |
| 4 | `signatureType=0` "not accepted" (3 guides) vs OpenAPI `CTFOrder` "direct EOA integrations use 0" and cancel enums `0\|3` | Use 3 only. |
| 5 | `order.signature` described as "65-byte hex" vs guide's 86-byte wrapped form | Use the 86-byte form per the guide and Kernel source. |
| 6 | Cancel id: numeric (`42`) vs 0x hash in Rust sample | Unresolved; use numeric `id` from `GET /orders`. |
| 7 | Cancel-all/market/batch require `signature` in schema vs "authenticated client" samples | Unresolved. |
| 8 | `GET /trading-state` in guide, absent from OpenAPI | Exists live (H). |
| 9 | Share sizes: decimals in guide vs "integers" in OpenAPI | Unresolved; check min/step at runtime from the book. |
| 10 | Plan assumes dev on testnet 1000101; docs say "XO operates a single public production environment" | Docs have no testnet; only an odd server error string mentions a testnet (L). |
| 11 | OpenAPI `info.contact`/intro link `github.com/xomarket`; that account has no public repos (`gh api users/xomarket/repos` returned empty) | The "live OpenAPI spec" is only on the docs site. |

---

## Plan claims checked (docs/plan.md, research-notes.md)

| Plan / notes claim | Status |
|---|---|
| HMAC "L2" API auth | Confirmed H |
| Kernel v3 smart-account signing, owner key + smart-account address | Confirmed H (Kernel 0.3.1, ECDSA validator) |
| Orders are EIP-712-signed payloads POSTed to the API (gate 2) | Confirmed H |
| Collateral "USDC.e", decimals probably 6 | 6 decimals confirmed H; docs name it "XO USDC", ".e" not found |
| Gas sponsored by XO | Partly: paymaster sponsors at least `redeemPositions`; bundler accepts zero fees. Sponsorship of approvals/Enable Trading not documented (H for first part) |
| Enable Trading = USDC allowance + ERC-1155 operator approval | Confirmed H (`/product/accounts/wallets`); calldata not documented; done as a UserOp |
| Chain 3223 | Confirmed H |
| "Develop on testnet 1000101" | Not supported by docs (single production environment) |
| Community bot README shows addresses | Not needed: exchange `0x4bC5...`, ConditionalTokens `0xCcf1...`, USDC `0x80c1...`, EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` are all in XO's own docs (H) |

---

## NOT FOUND (what was searched)

- Numeric `MAX_KEYS_PER_USER` (whole docs tree `rg`).
- API key expiry, rotation, scopes/permissions (`/api-reference/authentication*`, OpenAPI).
- L1 nonce semantics, any replay protection for L1 (docs; only the live window was measured).
- `CancelOrder` EIP-712 domain/types and global-cancel encoding (cancel pages, OpenAPI, search tool, web search).
- Smart-account derivation parameters (factory, implementation, initData, salt), who deploys, programmatic creation, owner change (`rg factory|create2|deploy|kernel|privy|zerodev` over `/guides /api-reference /product /documentation /data-api-reference`).
- Whether `GET /balance-allowance?address=` accepts the owner EOA (docs silent; not tested with a real account).
- Authoritative minimum order size/notional and share-size step; rounding rule for non-divisible `size*tick` (live `min_order_size` was `"0"`).
- HMAC secret decoding and base64 padding rule.
- Whether `POST /order` requires L2 in addition to the order signature (POST not allowed in this task).
- Any XO SDK source: no public repos under `github.com/xomarket`; web search for `xo-orderbook-client` found nothing.
- Doc publication dates (pages undated).

## Open questions (to resolve with XO or via PayBox-side research)

1. Does `POST /order` (and `DELETE /order`) require L2 headers, or is the order signature alone enough?
2. Does `GET /auth/derive-api-key` return `secret` and `passphrase` on every call, or only once?
3. Exact `CancelOrder` typed data (domain, types, Kernel-wrapped?) and the global-cancel encoding; which cancel endpoints accept HMAC-only.
4. How can a non-Privy external owner (PayBox wallet) get an XO smart account: UI connect, XO provisioning, or owner-change UserOp? Factory/implementation/salt for address derivation.
5. Is the first UserOp (Enable Trading) paymaster-sponsored? Paymaster address and RPC `api_key` need an XO contact.
6. Order size/notional minimums and rounding; share-size step.
7. PayBox: does `typedData` accept `Kernel`/chain 3223 domains, return 65-byte r||s||v, and do autonomous grants auto-sign it? Does `raw` sign a bare 32-byte digest? Where can an Open Plugin keep per-user secrets (remote MCP vs bundle; `secret_token` redemption)?

## Design implications for the plugin

- `xo_prepare_order` should return a *human-readable quote* plus the Kernel `typedData` JSON (built by the plugin from pinned constants: chain 3223, exchange, Kernel 0.3.1, validator `0x845ADb...`). It must also return the expected `orderHash` and `wrappedDigest` so the agent/PayBox can display them.
- `xo_submit_order` should (1) rebuild the `Order` from the stored quote, (2) recompute `orderHash` and `wrappedDigest`, (3) `ecrecover` the returned 65-byte signature over `wrappedDigest` and require it equals the owner address PayBox signs with, (4) only then prepend `0x01 || validator`, build the envelope and POST. This gives a non-blind check without trusting the model.
- Pin constants in code (never accept from the agent): chain 3223, exchange `0x4bC5...`, domain strings, Kernel version, validator address, USDC `0x80c1...`, 6-decimal math. Compute `makerAmount/takerAmount` with integer math only; reject sizes where `shares_micro * tick % 1000 != 0` until XO states a rounding rule.
- Timeouts: order POST blocks 500 ms (3 s sports) plus matching; per-user mutation limits 250 rps single / 25 rps batch; caps from the plan ($10/order) are far below any rate limit.
- Treat `GET /time` as the clock source for L1/L2 timestamps; expect L1 sigs to die after about 2 minutes, so order the steps "build typedData with a fresh timestamp -> sign -> submit within ~60 s".
- Expect to need XO cooperation for gate 3 (account provisioning, RPC key, paymaster) and for the two L2/cancel ambiguities.

---

## Live probes performed (all unauthenticated GET, no side effects; dummy values only)

| Request | Result |
|---|---|
| `GET orderbooks.xo.market/time`, `/version` | 200; time 1792344796 (2026-10-18T17:33:16Z); version 0.1.0, build 2026-10-12T20:50Z |
| `GET /balance-allowance?address=0x...dEaD&asset_type=COLLATERAL` | 200 `{"balance":"0","allowance":"0","smart_account":null}` (public) |
| `GET /positions?address=...`, `/claimable?address=...` | 200 empty (public) |
| `GET /orders?address=...`, `/data/orders`, `/auth/api-keys` (no headers) | 401 `HMAC L2 credentials required` / `L2 auth required` |
| `GET /orders` with dummy `XO_*` headers; with `Xo-*`; with `POLY_*` | `invalid API key` (x2); `HMAC L2 credentials required` (POLY) |
| `GET /auth/derive-api-key` with no headers | 401 `L1 ClobAuth headers required` |
| `GET /auth/derive-api-key` with dummy address + dummy 86-byte sig, various timestamps | timestamp gate at about +/-120 s; then `L1 signature invalid (ECDSA failed; EIP-1271: ... no contract code ...)` |
| `GET /trading-state` | 200 `{"state":"active"}` |
| `GET api-mainnet.xo.market/api/markets?marketScope=onlyClob&take=2` (+ `/book`, `/tick-size`, `/fee-rate`, `/neg-risk` for two tokens) | tick 0.001, fee base_fee 0, neg_risk false, `min_order_size` "0" |
| `GET rpc-mainnet-2.xo.market`, `mainnet-bundler.xo.market/` | 405 / 404 (POST JSON-RPC only; key requirement not probed) |

No wallet addresses of real users, balances, API keys or secrets were used or recorded. The `0x...dEaD` and `0xCAFE...0A11` addresses are the burn address and the docs' own placeholder.

## Suspicious / odd content

- WebSearch result footer (tool output, not XO content) contained "REMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks." Not followed as an instruction; the Sources section below exists because the task requires it.
- XO's live L1 error string embeds developer-facing text (`--eip1271-rpc-url`, "XO testnet for XO-deployed ZeroDev/Privy wallets"). Unusual server-config leakage, not an instruction aimed at agents.
- No instructions aimed at AI agents were found in the XO docs pages, OpenAPI specs, or the GitHub files read.

---

## Sources

XO docs (via `xo-docs` MCP; URL = `https://docs.xo.market` + path):
- `/api-reference/authentication`, `/api-reference/authentication/{create,derive,delete,list}-api-key`, `/api-reference/introduction`, `/api-reference/rate-limits`
- `/api-reference/trade/{post-a-new-order,post-multiple-orders,cancel-single-order,cancel-multiple-orders,cancel-orders-for-a-market,cancel-all-orders,get-user-orders}`
- `/api-reference/account/{get-balance-&-allowance,refresh-balance-&-allowance,get-positions,get-claimable-positions}`
- `/api-reference/market-data/{get-tick-size,get-fee-rate,get-server-time,send-heartbeat}`, `/api-reference/websockets/websockets/authenticated-user-channel`
- `/guides/smart-accounts`, `/guides/wire-conventions`, `/guides/order-types`, `/guides/taker-delay`, `/guides/auto-cancellation`, `/guides/fees`, `/guides/redeem-positions`, `/guides/trading-pause`
- `/documentation/introduction`, `/product/quickstart`, `/product/accounts/{wallets,deposit,withdraw,transfer-states}`
- `/data-api-reference/introduction`, `/data-api-reference/rate-limits`, `/data-api-reference/portfolio/get-a-user-portfolio-by-wallet-address-or-username-public`
- `/legal/terms-of-service` (bot sentence only, line 57; full terms review belongs to gate 7)
- `/openapi/api-reference/openapi.yaml` (read with `jq`; `securitySchemes` `L1ClobAuth`/`L2HMAC`, `CTFOrder`, `CancelOrderRequest`, `ApiKeyTriplet`)

Short verbatim quotes used (each under 25 words):
- "`signatureType = 3` (XO smart account, ERC-1271) is the only order-signing model accepted by the orderbook today." (`/api-reference/authentication`)
- "Do not sign the order hash or the ClobAuth digest directly. Wrap that digest, then sign the wrapped digest" (`/guides/smart-accounts`)
- "0x01 || bytes20(0x845ADb2C711129d4f3966735eD98a9F09fC4cE57) || ecdsa(wrappedDigest)" (`/guides/smart-accounts`)
- "timestamp + method + path + body" and "URL_SAFE_BASE64( HMAC_SHA256(secret, timestamp + method + path + body) )" (`/api-reference/authentication`)
- "Returns the oldest key in insertion order so repeat callers see a stable result. Never mints" (`derive-api-key`)
- "Create an XO smart account at beta.xo.market. That smart account is your maker address." (`/documentation/introduction`)
- "Ask your XO contact for these during onboarding." (`/documentation/introduction`)
- "Sign the bundler-computed `userOpHash` with the owner EOA of the smart account (raw ECDSA, same key that signs orders)." (`/guides/redeem-positions`)
- "global cancel (sign with empty string as marketId)" (OpenAPI `CancelAllRequest` example)
- "XO operates a single public production environment." (`/documentation/introduction`)

Third-party code and live endpoints (all read-only):
- `gh api` reads: `zerodevapp/kernel` tag v3.1 `src/Kernel.sol`, `src/factory/KernelFactory.sol`, `src/core/ValidationManager.sol`, `src/types/Constants.sol`, `src/utils/ValidationTypeLib.sol` (release v3.1 published 2024-06-19, older than 6 months but it is the version XO pins); `zerodevapp/kernel-7579-plugins` `src/validators/ECDSAValidator.sol` (HEAD commit 2026-04-21); `zerodevapp/sdk` `plugins/ecdsa/constants.ts`; `Polymarket/py-clob-client` `py_clob_client/signing/hmac.py` (convention comparison only).
- Live: `https://orderbooks.xo.market` (`/time`, `/version`, `/trading-state`, `/balance-allowance`, `/positions`, `/claimable`, `/orders`, `/auth/*`, `/book`, `/tick-size`, `/fee-rate`, `/neg-risk`), `https://api-mainnet.xo.market/api/markets`, `https://rpc-mainnet-2.xo.market`, `https://mainnet-bundler.xo.market/`.
- Web search (standard): "xo-orderbook-client Rust crate ..." returned nothing relevant (docs.rs `polyoxide-clob` appeared as an unrelated Polymarket client).
- PayBox tool schemas read (not called): `request_wallet_sign`, `request_secret`, `list_credentials`, `use_plugin`, `check_operation_readiness` (MCP tool descriptions in this session).
- Local computation: `cast keccak` / `cast abi-encode` (Foundry) for typehashes, domain separators and the reference vector; script kept in the scratchpad, not in the repo.

---

## Verification (2026-10-19)

Adversarial verifier pass. Independent re-derivation from the primary sources (xo-docs MCP pages and both OpenAPI specs, live unauthenticated GETs to `orderbooks.xo.market`, `gh api` reads of zerodevapp/kernel v3.1, kernel-7579-plugins, zerodevapp/sdk, Polymarket/py-clob-client and Polymarket/ctf-exchange, and local `cast keccak`/`cast abi-encode`). Nothing was signed, no POST/PUT/DELETE, no keys created, no `.env` read, no PayBox tool called (schemas of `use_plugin`, `request_secret`, `request_wallet_sign` loaded only to re-read their descriptions). One GET (`/balance-allowance/update?address=<burn address>`) was made; it returned 200 without auth (see item V9).

Overall: the load-bearing cryptographic and wire facts (L1/L2 headers and domains, order domain/typehash/addresses, Kernel wrapper, 86-byte signature, units, rate limits, header-name staleness, L1 window) were all re-derived and match. All hash constants and both reference vectors in this file were recomputed independently and match character for character. Items below are the ones that were corrected, refuted, or are still unverifiable.

### Re-confirmed without change (H)

- L1 ClobAuth domain `ClobAuthDomain`/`1`/`3223` (no verifyingContract), struct `ClobAuth(address address,string timestamp,uint256 nonce,string message)`, message literal, headers `XO_ADDRESS/XO_SIGNATURE/XO_TIMESTAMP/XO_NONCE`: `/guides/smart-accounts`, `/guides/wire-conventions`, `/api-reference/authentication` agree (note: the authentication page prints `chainId = <XO chain id>`; 3223 comes from the other two pages).
- Order domain `XO Market CLOB`/`1`/`3223`/`0x4bC5E872256D12E6017dfe466E04c867DC761B77`; 13-field typehash; XO USDC `0x80c12230ce677e6f304027a14780Edd2A829ab0c` (6 decimals); validator `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`; EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`; Conditional Tokens `0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909`. Every address matched the docs text character for character (also matches the third-party repo constants file).
- Recomputed with `cast`: ORDER_TYPEHASH `0x17df2a5f...72ef`, KERNEL_TYPEHASH `0x1547321c...9c83`, CLOBAUTH_TYPEHASH `0x52578c5c...035c`, order domain separator `0x377cb2cb...60ae`, ClobAuth domain separator `0x44e30cd1...197b`, ClobAuth digest `0x21acb038...7d11`, wrapped ClobAuth `0x6f0d66f4...3c6d`, OpenAPI-sample order struct hash `0x6dde3587...ef9f`, orderHash `0x553d58fd...e723`, Kernel domain separator (placeholder maker) `0xb305ee98...2818`, wrapped order digest `0x9137675d...bf8b`. All equal to the values printed above. Caveat: the sample order has zero `identifier`, so the bytes16 right-padding rule in `abi.encode` is not exercised by the vector.
- Kernel v3.1 source (tag published 2024-06-19): `KERNEL_WRAPPER_TYPE_HASH = 0x1547...9c83`; `ValidatorLib.decodeSignature` case 1 consumes 21 bytes, case 0 is root mode (1 byte); `Kernel.isValidSignature` -> `validator.isValidSignatureWithSender(msg.sender, _toWrappedHash(hash), sig)`; `_toWrappedHash = _hashTypedData(keccak256(abi.encode(KERNEL_WRAPPER_TYPE_HASH, hash)))`; `_domainNameAndVersion` = `"Kernel"`/`"0.3.1"`. Additional detail not in the notes: `isValidSignature` reverts `InvalidValidator` unless the validator in the signature prefix is installed on the account with a non-zero hook, so the `0x01||0x845ADb...` prefix only works for accounts that have that ECDSA validator installed (true for XO per docs, unverified on chain 3223). `KernelFactory.getAddress` = CREATE2 over `keccak256(abi.encodePacked(data, salt))` as stated. zerodevapp/sdk `plugins/ecdsa/constants.ts` maps `">=0.3.1"` to `0x845ADb...`. `ECDSAValidator._verifySignature` tries raw hash then EIP-191 hash, as stated.
- Live (re-run 2026-10-18T17:4x-17:5x Z): `XO_*` and `Xo-*` headers reach the key check (`invalid API key`), `POLY_*` yields `HMAC L2 credentials required`; `/orders`, `/data/orders`, `/trades`, `/data/trades`, `/data/order/{id}`, `/auth/api-keys` return 401 without L2; `/balance-allowance`, `/positions`, `/claimable` are public; `/version` = 0.1.0, build 1791838229 = 2026-10-12T20:50:29Z; `/trading-state` live and absent from the OpenAPI (0 matches); RPC GET 405, bundler GET 404.
- L1 timestamp window, re-measured with a dummy 86-byte signature: accepted at -115 and +110/+119 s, rejected at -120, -122, +121, +125, +140 s. So the window is about +/-120 s (boundary between 119 and 121 on the positive side, between -115 and -120 on the negative side). The notes' "accepted at +120" is within one second of the boundary.
- Rate-limit table, fees curve (`C * feeBps/10000 * p*(1-p)`), taker delay (500 ms / 3 s), order types, heartbeat opt-in, ToS bot sentence (`/legal/terms-of-service` line 57), "single public production environment" (and zero hits for testnet/sandbox/staging/1000101 anywhere in the docs tree): all match the primary text.
- PayBox tool descriptions quoted in the notes are verbatim (`use_plugin`: "call the authenticated user's enabled remote MCP installation"; `request_secret`: raw=false returns a one-time `secret_token`; `request_wallet_sign`: `typedData`, `transaction`, `authorization` payloads are untyped (`true`), `raw` takes `rawSigningPayloadHex` described as an escape hatch "for a precomputed digest"; `wallet_id` "Not sent to plugin code").
- NOT FOUND items re-searched with different keywords and still NOT FOUND: numeric `MAX_KEYS_PER_USER` (only the symbol appears, in the create-api-key page); key expiry/rotation/scopes; L1 nonce semantics (`nonce` hits are only the header row, the struct and the order field); CancelOrder EIP-712 domain/types (only the one-line description and the `signature` field text; the third-party bot below says the same); smart-account derivation, factory, deployer, owner change (`rg` for privy|zerodev|kernel|factory|create2|counterfactual|deploy|owner wallet|programmatic over all non-OpenAPI pages: only the Privy/ZeroDev wording in the order endpoint descriptions and the redeem page's "Kernel ERC-7579 execute(bytes32,bytes) on accounts created at beta.xo.market"); minimum order size/notional (docs: nothing outside the rewards page's 5-share eligibility rule; live `min_order_size` is "0" also on an ACTIVE book that had 5 bids and 5 asks, so the "0 means no MarketInfo yet" explanation does not account for it); sponsorship of Enable Trading (only `redeemPositions` is stated as sponsored); doc publication dates (llms.txt and page headers carry none).

### Corrected

**V1. "Derive returns the secret" is more contested than the notes say, and the design default leans on the weaker side (claims: derive example, Option A default).**
Evidence the notes omit: OpenAPI schema `ApiKeyTriplet` (which the derive 200 response `$ref`s, together with an example containing `secret` and `passphrase`) itself says: "The triplet is the full credential - the secret/passphrase are never returned again. Store them on receipt." The `secret` field description also says "never sent on the wire after creation". Against that: the derive 200 response lists `secret`/`passphrase` as required and carries an example, and the official `smart_wallet_api_key.ts` sample and the third-party bot both call `parseTriplet`/`parseCreds` on the derive response and throw "triplet incomplete" if `secret` is missing. So there are three pro-"never again" statements (authentication page, `ApiKeyTriplet` description, secret field text) and three pro-"derive returns it" artifacts (schema, example, sample code), all unverified against live behavior (testing needs a valid L1 signature). Corrected position: genuinely unresolved, evidence roughly balanced; keep confidence L (the summary said M, the body said L; use L). Do NOT make stateless derive-on-demand (Option A) the default until XO answers; plan for storing the triplet (Option B/C) as the safe assumption.

**V2. Missing risk: API-key lockout (new, derived from the docs).**
If the secret is shown only once and is lost, the account can mint new keys only until `MAX_KEYS_PER_USER` (unknown) is hit; freeing a slot needs `DELETE /auth/api-key`, which the OpenAPI puts on L2 (requires the lost secret) while the prose says L1. If DELETE is really L2, a plugin that loses a triplet repeatedly can permanently lock the account's API access without XO's help. Test-with-XO question: is DELETE L1 or L2, and what is the cap.

**V3. "Smart accounts are created only through the beta.xo.market UI" (gate 3 wording) is an overstatement.**
The docs say "Create an XO smart account at beta.xo.market" (a documented path), not that it is the only path. What is established is: no programmatic creation, derivation inputs, deployer or owner-change flow is documented (still NOT FOUND). Corrected wording: "the only documented creation path is the beta.xo.market web app; a programmatic path is not documented (absence of docs is not a prohibition)". The summary fact's confidence H applies to the documented path, not to the word "only".

**V4. Doc/spec inconsistency #11 is not supported (refuted as stated).**
The notes say the OpenAPI `info.contact`/intro link points at `github.com/xomarket`. Both OpenAPI specs mounted in the docs MCP have `info.contact.url = https://beta.xo.market`, and `github.com/xomarket` appears nowhere in the docs tree or either spec (0 matches); the only GitHub link in the docs is the Gnosis conditional-tokens contract. What does stand: `gh api users/xomarket` shows 0 public repos (account created 2026-01-27), and the Rust samples reference a crate `xo-orderbook-client-rs` whose source is not public. Replace #11 with that.

**V5. Timeout guidance is the researcher's own, not the docs' (minor).**
Section (c) says POST /order blocks "so use timeouts of 1 s or more". `/guides/taker-delay` says "at least 500 ms on non-sports markets, and at least 3 s" for sports in match time. Use docs' numbers as the floor; 1 s is a prudent margin, not documented.

**V6. 429 backoff hints.** `/api-reference/rate-limits` says "The server will reject excess traffic without backoff hints", while OpenAPI `Error429` documents `retry_after_ms` for the per-user mutation limit. Both statements exist; treat `retry_after_ms` as best-effort, not guaranteed on every limiter.

**V7. Gate 2 and gate 8 verdicts are overstated (see verdict changes).**
Order hashing/signing/wire format is verified (H). But "prepare -> sign -> submit works" is untested end to end and depends on (a) whether `POST /order` needs L2 and therefore a per-user secret whose custody and recovery are unresolved (V1, V2), and (b) whether PayBox `typedData`/`raw` accept a Kernel-wrapper payload and whether autonomous grants auto-sign it. The strong hint is that POST needs L2: the docs list a 401 "L1 ClobAuth (wallet) or L2 HMAC (API key) headers were missing, malformed, expired" on `POST /order` and `POST /orders`, the OpenAPI Trade tag says "for the authenticated maker", the official Rust sample says "Requires an authenticated client (see POST /order for setup)", and the third-party bot sends every trading call with L2 HMAC (untested live by its own README). The OpenAPI `security` block is empty for `/order`, `/orders` POST, `/heartbeats` and the trade DELETE routes (`/order`, `/orders`, `/cancel-all`, `/cancel-market-orders`) (under-annotated; only `/auth/*` and some GET reads carry a scheme), so Option E (avoid L2) should be treated as unlikely.

### Unverifiable (cannot confirm from primary sources or without a POST/signature)

- V8. Whether `POST /order`/`DELETE /order` require L2 (see V7): unverifiable here; treat as required.
- V9. `/balance-allowance/update`: OpenAPI marks it `L2HMAC`, but a live GET without headers returned 200 (`{"balance":"0","allowance":"0","smart_account":null}` for the burn address). Another spec/live mismatch; harmless here, but do not rely on the OpenAPI `security` annotations in either direction. (I made this single GET to check; it is a documented "refresh" route.)
- V10. Owner-EOA to smart-account lookup through `GET /balance-allowance?address=`: still unverifiable. The docs say `smart_account` is `null` "for plain EOA users with no smart account", which implies EOA addresses are accepted as input, but no mapping was observable. Two public market-creator wallet fields from the Data API (`creator.walletPublicKey`) both returned `smart_account: null`, which is inconclusive (they may themselves be smart accounts, or EOAs with none). No addresses or balances recorded.
- V11. PayBox `typedData`/`raw` producing a valid Kernel-wrapped signature (chainId 3223, foreign verifyingContract, 32-byte raw digest not re-hashed): unverifiable without calling a signing tool; M stays.
- V12. Deployed ECDSA validator and Kernel implementation on chain 3223 matching the GitHub sources: unverifiable (no public RPC; the RPC needs a private key, no explorer probe done in this stream).
- V13. HMAC key handling (base64-decode before use; keep `=` padding): still NOT FOUND in XO docs. Supporting evidence only: OpenAPI calls the secret "Base64-encoded HMAC secret" and its example (`dGhpcy1pcy1hbi1leGFtcGxlLWhtYWMtc2VjcmV0LWtleS1iYXNlNjQ=`) decodes to ASCII text; Polymarket `py-clob-client` hmac.py (read this session) does `urlsafe_b64decode(secret)` and returns `urlsafe_b64encode(digest)` with padding; the third-party bot does the same but says in its README "confirm with setup-keys before trading". Keep M; test with a throwaway key before shipping.

### Missed findings (add to the plan)

1. **Signed orders are long-lived bearer instruments.** The order signature has no timestamp and `expiration = 0` means never; the notes present this only as a plus ("can wait for approval"). A signed order that sits in tool args, logs or a quote store can be submitted later at a stale price (by anyone who also holds or does not need L2, depending on V7). Mitigation: plugin-originated orders should always use GTD with a short non-zero `expiration` (it is inside the signed hash), and quotes should carry a TTL.
2. **Order `nonce` is probably not a free field.** Docs: "`nonce` is `uint128` and is used for on-chain cancellation". In the upstream Polymarket CTF Exchange that XO's `hashOrder` derives from, `NonceManager.isValidNonce(maker, nonce)` requires `nonces[maker] == order.nonce` and `incrementNonce()` invalidates all older orders (Trading.sol: `if (!isValidNonce(order.maker, order.nonce)) revert InvalidNonce();`). XO's fork changed the nonce to uint128, so whether it keeps equality semantics is unverified, but hard-coding `0` (as every sample does) is only safe while the account's on-chain nonce is 0. Read the maker's current nonce on-chain (needs the RPC key) or ask XO.
3. **Balance-drop auto-cancel.** `/guides/auto-cancellation` documents a second mass-cancel path besides heartbeats: when the indexer sees an on-chain balance drop (withdrawal, other-venue fill) the engine cancels resting orders LIFO to fit the new balance. Relevant to any multi-venue/arbitrage design that moves funds.
4. **Data API authenticated routes use a different auth.** `/liquidity-rewards/*` (non-public prefix) needs `Authorization: Bearer <privy_access_token>` and explicitly does not accept the orderbook L1/L2 scheme (`/data-api-reference/liquidity-rewards`). A plugin cannot call those with an XO API key; use the `/public/liquidity-rewards/*` by-wallet routes.
5. **A community XO implementation exists and was not listed.** `NitinkashyapSTRR/xo-pulse-market-maker` (MIT, created 2026-10-07, 2 stars, last push 2026-10-07; the plan's "community bot README" is probably this repo). Files read via `gh api` (data only, nothing run): `src/xo/signing.ts`, `orderbook.ts`, `constants.ts`, `http.ts`, `test/signing.test.ts`, `README.md`. It independently implements the same Kernel-wrapped signing with the same constants, derive-then-create key flow, HMAC with base64-decoded secret and padded url-safe output, per-order HMAC `DELETE /order` with `{orderID}`, and says batch/market/all cancel need a CancelOrder EIP-712 "not fully documented yet". Caveats: it mirrors the docs rather than independently proving them, and its README states live mode "has not been run against real funds". Treat as M corroboration of docs, not as proof the flows work. No instructions aimed at AI agents were found in the files read.
6. The notes' own inconsistency table should also list: `/balance-allowance/update` L2 in spec vs public live (V9), and `GET /orders` OpenAPI security `[{L2HMAC},{}]` (optional) vs live 401 without L2.

### Secrets / addresses check

The notes contain only public contract addresses from XO's docs (exchange, Conditional Tokens, XO USDC, validator, EntryPoint), the docs' placeholder `0xCAFE...0A11`, and an abbreviated burn address; no user wallet addresses, balances, API keys, secrets, UUID credentials or private keys (regex-scanned for 40-hex addresses, 64-hex values, UUIDs and key/secret patterns; the 64-hex values are the computed digests above). The verifier's own scratch files live in the scratchpad `verify-01` folder only (not in the repo).

### Gate verdict changes

- Gate 2: `answered-go` -> `partial`. Signing and wire format verified; submit path depends on L2 custody (V1, V2, V7) and an untested PayBox signing step.
- Gate 8: `answered-go` -> `partial`. The notes cover only the XO half by design; the PayBox half (auto-sign of `typedData`/`raw` under autonomous grants) is entirely open, so the gate cannot be scored `answered-go`. Add: signed orders need a short `expiration` (Missed finding 1).
- Gates 1 and 3: `partial` stands (gate 3 wording per V3).
