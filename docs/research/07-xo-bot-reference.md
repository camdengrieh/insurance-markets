# 07 - XO community-bot reference: implementation-level cross-check of the XO docs

Task `xo-bot-reference`. Researched 2026-10-18/19 (session date 2026-10-19; XO server clock read 2026-10-18T17:3x Z). Read-only. Nothing from any third-party repo was cloned, installed, built or executed. Files were fetched with `gh api` as raw text into the scratchpad and read as untrusted data. The only code run was Foundry `cast` (the user's own local tool) to re-derive hashes and signatures from the XO docs algorithm, using the public Hardhat account #0 test key that the bot's own test file hard-codes (key not reproduced here). No PayBox tool was called. No API key was created, no POST/PUT/DELETE was sent. Public unauthenticated GETs to the documented XO hosts were used to confirm response shapes (section 8).

Confidence tags: **H** = read first-hand in a primary source this session (path/URL cited) or live-probed; **M** = secondary or inferred; **L** = weak or stale.

Docs source = the `xo-docs` MCP (`docs.xo.market`), read via `cat`/`jq` on `.mdx` and `/openapi/*` (the OpenAPI files are single-line JSON; use `jq`). XO docs carry no per-page dates or version stamps, so staleness cannot be judged from the pages themselves; section 8 shows the live API is ahead of the docs in places.

---

## 0. Bottom line (read this first)

1. Every **constant** in the community bot (chain id, hosts, CTF Exchange, Conditional Tokens, Kernel validator, domains, ClobAuth message, tick, 6-decimals) matches the XO docs exactly. The bot's README says the same: it was written from the docs, so it is **not independent corroboration of the docs, only proof the docs are implementable**. No part of it is verified live by the author (README: "Live mode has not been run against real funds by the author").
2. The **EIP-712 order struct, domain, typehash, amount encoding and the Kernel v3 signature wrap** match the docs byte for byte (H, docs vs code). I independently re-derived the order hash, the Kernel wrap and the ClobAuth digest with `cast` from the docs algorithm and got stable golden vectors (section 4).
3. **Key finding for the PayBox design (H, derived + corroborated by a second implementation):** the "Kernel wrap" is exactly standard EIP-712 typed data `Kernel(bytes32 hash)` under domain `{name:"Kernel", version:"0.3.1", chainId:3223, verifyingContract:<smart account>}`. `cast wallet sign --no-hash <wrappedDigest>` and `cast wallet sign --data <that typed data>` produced byte-identical signatures. A second community client (`klumpfuss1234/xo-market-tui`) signs it with ethers `signTypedData(kernelDomain, {Kernel:[{name:"hash",type:"bytes32"}]}, {hash: digest})`. So a wallet that supports an EIP-712 `typedData` intent can sign XO orders; no raw-hash signing is needed. The wire signature is then `0x01 || validator(20) || ecdsa(65)` (86 bytes).
4. **The bot has real bugs / unverified paths** (section 6): it calls `GET /order/{id}` which does not exist (live: 404; docs: `GET /data/order/{id}`), which would halt it on the first fill; its `/balance-allowance` call omits the documented required `address` param; its cancel-by-id form is ambiguous against the docs. Do not copy `live.ts` reconciliation logic; copy only the signing and constants.
5. **Unresolved, release-relevant discrepancy:** docs say the L2 HMAC signs `timestamp + method + path-with-query + body`. The second community client defaults to **path only (no query)** and labels path-only "Live XO compatibility" and path-with-query "Documented form". I cannot test authenticated calls (no key may be created), so this stays open. Plan: implement both, probe once with a real test credential.
6. The bot never does Enable Trading approvals, never funds, never creates markets, and obtains the smart-account address from a user-supplied env var. Those parts of gates 3, 5, 6 are **not answered by any open-source code found**.

---

## 1. Provenance of the reference repo

| Item | Value | Conf |
|---|---|---|
| Repo | `NitinkashyapSTRR/xo-pulse-market-maker` | H |
| License | MIT (`LICENSE`, "Copyright (c) 2026 NitinkashyapSTRR"; GitHub API `spdx_id: MIT`) | H |
| Created / pushed | 2026-10-07T18:15:39Z / 2026-10-07T18:21:40Z, single commit `bfedc70` "Add files via upload", 2 stars | H |
| Stack | TypeScript, Node >=20, `viem ^2.21.0` is the only runtime dependency. No ZeroDev, no permissionless, no ethers. | H (`package.json`) |
| Scope | BUY-only GTD post-only quoting on BTC 5-minute Pulse markets. Read endpoints + L2-authenticated trade endpoints. | H |
| Live status | README: "Live mode has **not** been run against real funds by the author. Expect bugs; start tiny." Paper run lost money. | H |
| Hygiene | README references `.env.example` but `.env.example` returns 404 in the repo tree. No secrets seen in any file read. No embedded AI-directed instructions found (grep for injection phrases: none). | H |

Authority assessment: a day-old, single-commit, unrun-live hobby bot. Treat as a faithful transcription of the docs plus the author's guesses, not as evidence of how live XO behaves.

---

## 2. What the bot implements (extracted)

### 2.1 Hosts, chain, addresses (`src/xo/constants.ts`)

```
chainId            3223
orderbookUrl       https://orderbooks.xo.market
dataApiUrl         https://api-mainnet.xo.market/api
ctfExchange        0x4bC5E872256D12E6017dfe466E04c867DC761B77
conditionalTokens  0xCcf1b2C676E2f9A13e5674be0e0DdFF6d0B13909
kernelEcdsaValidator 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57
kernelName         "Kernel"          kernelVersion "0.3.1"
orderDomainName    "XO Market CLOB"  orderDomainVersion "1"
clobAuthDomainName "ClobAuthDomain"  (version "1" inline in signing.ts)
clobAuthMessage    "This message attests that I control the given wallet"
tick               0.001 (integers 1..999 over 1000)
micro              1_000_000n (6-decimal USDC and shares)
SIDE               BUY=0, SELL=1
SIGNATURE_TYPE_XO_SMART_ACCOUNT = 3
```

Not present in the bot: collateral token address, EntryPoint, bundler URL, RPC URL, paymaster, smart-account factory. (`ctfExchange`/`conditionalTokens` are read from docs, not discovered.)

### 2.2 Order struct and EIP-712 (`src/xo/signing.ts`)

- Domain: `{name:"XO Market CLOB", version:"1", chainId:3223, verifyingContract: ctfExchange}`.
- `Order` type, 13 fields in this order: `salt uint256, maker address, signer address, beneficiary address, tokenId uint256, makerAmount uint256, takerAmount uint256, expiration uint256, nonce uint128, identifier bytes16, metadata bytes32, side uint8, signatureType uint8`. (`signature` is on the wire but not in the typehash.)
- Order hash = viem `hashTypedData` = `keccak256(0x1901 || domainSeparator || structHash)`.
- `buildLimitOrder`: `maker = signer = smart account`, `beneficiary = 0x00..00`, `nonce = 0`, `identifier = 0x00*16`, `metadata = 0x00*32`, `signatureType = 3`, `salt` = random 8 bytes (`crypto.getRandomValues`), `expiration` default 0 (GTD sets round end + 1 s).
- Amount/rounding code: whole shares only (`Number.isInteger(shares) && shares > 0`). `priceToTick(price)`: `tick = Math.round(price*1000)`, rejects `tick<1 || tick>999` and `|tick/1000 - price| > 1e-9`. `shareMicro = shares * 1_000_000n`; `usdcMicro = (shareMicro * tick) / 1000n` (BigInt floor division, exact for whole shares). BUY: `makerAmount = usdcMicro`, `takerAmount = shareMicro`. SELL: `makerAmount = shareMicro`, `takerAmount = usdcMicro`. No fee field (matches docs). No min-size, min-notional or fee-budget logic.

### 2.3 Kernel v3 / ERC-1271 signature construction (`src/xo/signing.ts`)

Library: viem only (`hashTypedData`, `keccak256`, `concat`, `pad`, `numberToHex`, `toBytes`, `toHex`, `getAddress`, `privateKeyToAccount`). No smart-account SDK.

```
KERNEL_DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
KERNEL_SIGNED_TYPEHASH = keccak256("Kernel(bytes32 hash)")
domainSeparator = keccak256(concat([DOMAIN_TYPEHASH, keccak256("Kernel"), keccak256("0.3.1"), pad(chainId,32), pad(smartAccount,32)]))
structHash      = keccak256(concat([SIGNED_TYPEHASH, digest]))
wrapped         = keccak256(concat(["0x1901", domainSeparator, structHash]))
signature       = concat([0x01, kernelEcdsaValidator(20 bytes), account.sign({hash: wrapped})])   // raw ECDSA, no EIP-191 prefix
```

`XoSigner` holds the owner key in a private `#sign` closure; `signOrder` signs `hashOrder(order)` wrapped; `clobAuthHeaders` signs the ClobAuth digest wrapped the same way and returns `{XO_ADDRESS: smartAccount, XO_SIGNATURE, XO_TIMESTAMP, XO_NONCE}`.

### 2.4 How the smart-account address is obtained

It is **not** derived or discovered. The user pastes `XO_SMART_ACCOUNT` (env) copied from the XO app. `signerFromEnv()` only validates `isAddress`. README step 1: "Create a **dedicated** XO smart account and fund it." No factory, no counterfactual address computation, no `/balance-allowance` lookup of the owner.

### 2.5 L1 / L2 auth (`src/xo/orderbook.ts`)

- L1 (mint/derive key): `GET /auth/derive-api-key` with the 4 L1 headers; only on HTTP 404 falls back to `POST /auth/api-key` (body `"{}"`, fresh headers/timestamp). Parses `apiKey|api_key|key`, `secret|apiSecret|api_secret`, `passphrase|api_passphrase`.
- L2 HMAC (every private call):
  ```
  ts = String(Math.floor(Date.now()/1000))
  key = Buffer.from(secret.replace(/-/g,"+").replace(/_/g,"/"), "base64")   // falls back to the raw string if decoding yields 0 bytes
  sig = base64(HMAC_SHA256(key, ts + METHOD.toUpperCase() + pathWithQuery + rawBody)).replace(+ -> -).replace(/ -> _)   // padding "=" is KEPT
  headers: XO_API_KEY, XO_PASSPHRASE, XO_TIMESTAMP, XO_SIGNATURE   (no XO_ADDRESS on L2)
  Content-Type: application/json only when a body exists
  ```
  `pathWithQuery` is the literal string appended to the base URL, e.g. `/orders?next_cursor=` (so the query is signed). Body is signed as the exact `JSON.stringify` string that is sent. `serverTime()` (`GET /time`) is defined but **never called**: no clock alignment.

### 2.6 Endpoints the bot calls

| Call | Auth | Code |
|---|---|---|
| `GET /time` | none | defined, unused |
| `GET /markets/{conditionId}` | none | `marketTokens` (matches `/^(yes|up)$/i`, `/^(no|down)$/i`) |
| `GET /book?token_id=` | none | `book` |
| `GET /fee-rate?token_id=` | none | `feeRateBps`, defined, unused in loop |
| `GET /auth/derive-api-key`, `POST /auth/api-key` | L1 | `deriveOrCreateApiKey` |
| `POST /order` `{order, orderType, postOnly}` | L2 | `postOrder` (used: orderType "GTD", postOnly true) |
| `POST /orders` array of the same | L2 | `postOrders`, **dead code** |
| `DELETE /order` `{orderID}` | L2 | `cancelOrder` (one at a time, `Promise.allSettled`) |
| `GET /orders?next_cursor=&market=` (max 20 pages, stops on `"LTE="`) | L2 | `openOrders` |
| `GET /order/{id}` | L2 | `getOrder` (**wrong path**, see D1) |
| `GET /balance-allowance?asset_type=COLLATERAL` | L2 | `balanceAllowance` (no `address`, see D2) |
| `GET /positions` | L2 | `positions` (defined, unused in live loop) |
| Data API `GET /pulse/markets?limit&page&sortBy=expiresAt&sortOrder=DESC[&status=]` | none | `pulseRounds` |
| Data API `GET /public/liquidity-rewards/groups` | none | `pulseRewardRules` |

### 2.7 Cancel flow, requote, safety (`src/engine/live.ts`, `orderbook.ts`)

Per-order HMAC `DELETE /order` with body `{orderID: <id>}`. `cancelOrders` fans out `Promise.allSettled`; failures are only logged ("may have filled"). `cancelAll` lists open orders then cancels each by `o.id`. README: "Batch/all cancel endpoints need an EIP-712 cancel signature not yet implemented." Reconciliation: on the next tick it lists open orders for the market; for any tracked order not in the list it calls `getOrder`; if that throws it sets `haltReason` and stops trading. It never infers a fill from absence (good practice, worth copying conceptually).

### 2.8 Rate-limit / retry handling (`src/xo/http.ts`)

Wrapper: 8000 ms `AbortController` timeout, `retries = 2`. On HTTP 429 it parses `retry_after_ms` from the JSON body (default 1000), sleeps `min(wait, 10000)` and retries. On `AbortError`/`TypeError` (network) it retries after `300*attempt` ms. **It applies the same retries to POST and DELETE**, i.e. it can resend a signed order after a timeout. Docs say a replayed signed order returns 400 `duplicate order` (see D11), so the resend is safe at the engine level but the second response is an error, not the original `orderID`. No client-side throttle. Data API polling is reduced by a 4 s cache of the ACTIVE list.

### 2.9 Enable Trading / approvals

**Not implemented and not checked.** Zero matches for approve/allowance/bundler/UserOp/paymaster/redeem/RPC in `src/`. The bot only prints the `/balance-allowance` balance at start. It assumes the user already did Enable Trading in the XO app and relies on the docs' step "Approve the CTF Exchange for XO USDC and Conditional Tokens" having been done elsewhere.

### 2.10 Positions / redeem / withdraw / funding

None. `settle()` computes P&L locally; redemption is left to the user (docs: ERC-4337 UserOp via the XO bundler).

---

## 3. Test vectors in `test/signing.test.ts` (verbatim, golden for our tests)

Constants in the file: `TEST_KEY` = publicly known Hardhat account #0 key (line 8, comment "Throwaway test key (publicly known Hardhat account #0). Never fund it."); `SMART = "0xCAFE000000000000000000000000000000000A11"` (same fake address the XO OpenAPI examples use).

```ts
// 1. amounts
buildLimitOrder({ smartAccount: SMART, tokenId: 1n, side: SIDE.BUY, price: 0.55, shares: 100, salt: 1n })
  -> makerAmount 55_000_000n, takerAmount 100_000_000n, maker == signer, signatureType 3
buildLimitOrder({ smartAccount: SMART, tokenId: 1n, side: SIDE.SELL, price: 0.123, shares: 7, salt: 1n })
  -> makerAmount 7_000_000n, takerAmount 861_000n

// 2. ticks
priceToTick(0.5) === 500
priceToTick(0.5005) throws;  priceToTick(1) throws;  priceToTick(0) throws

// 3. order hash equals a from-scratch Solidity-style encoding
buildLimitOrder({ smartAccount: SMART, tokenId: 123456789n, side: SIDE.BUY, price: 0.42, shares: 10, salt: 99n, expiration: 1791389400n })
typeHash string: "Order(uint256 salt,address maker,address signer,address beneficiary,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint128 nonce,bytes16 identifier,bytes32 metadata,uint8 side,uint8 signatureType)"
domain typehash: "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
assert hashOrder(o) === keccak256(concat(["0x1901", domainSep, structHash]))

// 4. smart-account signature structure
buildLimitOrder({ smartAccount: SMART, tokenId: 5n, side: SIDE.BUY, price: 0.3, shares: 4, salt: 7n })
wire.signature.length === 2 + 2*(1+20+65)          // 174 characters including the "0x" (86 bytes)
slice(sig,0,1) === "0x01"
getAddress(slice(sig,1,21)) === getAddress(0x845ADb2C711129d4f3966735eD98a9F09fC4cE57)
recoverAddress({hash: wrapKernelDigest(hashOrder(o), SMART), signature: slice(sig,21)}) === signer.owner
wire.makerAmount === "1200000";  wire.tokenId === "5"

// 5. ClobAuth headers
signer.clobAuthHeaders(0n, "1791389400")
  XO_ADDRESS === getAddress(SMART);  XO_TIMESTAMP === "1791389400";  XO_SIGNATURE.startsWith("0x01")
```

Limit of these tests: they are **self-consistency** checks (our code vs a second encoding of the same docs algorithm). There is **no literal expected hash or signature** in the file, no HMAC test at all, and no cancel/wrap-of-ClobAuth literal. Literal vectors below are mine.

---

## 4. Independently derived literal vectors (Foundry `cast` 1.7.1, from the XO docs algorithm; not produced by the bot's code)

Confidence: H that they implement the documented algorithm (hand-built `abi.encode` + `keccak`, no library typed-data helper); M that they equal viem's output (they should; viem was not run). Use them as expected values in our own tests, then confirm once against viem/our implementation.

Inputs: `SMART = 0xCAFE000000000000000000000000000000000A11`, CTF Exchange `0x4bC5E872256D12E6017dfe466E04c867DC761B77`, chainId 3223, beneficiary zero, nonce 0, identifier 16 zero bytes, metadata 32 zero bytes, signatureType 3.

```json
{
  "orderTypehash":  "0x17df2a5febe57967a2c9c03de6869c37c67cff602ecbe4f734aad39de2b172ef",
  "eip712DomainTypehash(name,version,chainId,verifyingContract)": "0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f",
  "orderDomainSeparator(XO Market CLOB,1,3223,CTFExchange)": "0x377cb2cbb6c9bcc7400f72694c6fc43a929de4faf9ee0ce851a8c2cdd02260ae",

  "vectorA": {
    "note": "bot test 3: tokenId 123456789, BUY, price 0.42, 10 shares, salt 99, expiration 1791389400",
    "makerAmount": "4200000", "takerAmount": "10000000", "side": 0,
    "structHash": "0xb93cda9d1a93acbd73dce8fbf06235ad4b4f0cfa91ec4b58fcbff6e1ca31698b",
    "orderHash":  "0xe7a911054f6ac70d4afd6d707d45e3922ed778547ff13f39d7819a32f78b0de6"
  },

  "vectorB": {
    "note": "bot test 4: tokenId 5, BUY, price 0.3, 4 shares, salt 7, expiration 0",
    "makerAmount": "1200000", "takerAmount": "4000000", "side": 0,
    "orderHash": "0x82a01039202b975f6e72df3548784073a752df292a9fd4a4b6a4254e2354c8ff",
    "kernelDomainSeparator(Kernel,0.3.1,3223,SMART)": "0xb305ee98cecda15b485dcdcecc61ff47f94a59e52152b6b8c1428d7acfe02818",
    "kernelSignedTypehash(Kernel(bytes32 hash))": "0x1547321c374afde8a591d972a084b071c594c275e36724931ff96c25f2999c83",
    "wrappedDigest": "0xe1da1e6981c60c8be06301adf795d277e69fa7b96e7201ad797d68dfaaf16158",
    "ownerKey": "Hardhat default account #0 (public test key)",
    "ecdsa_rawHash_noPrefix_RFC6979": "0x29b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c1c",
    "ecdsa_viaEIP712TypedData(Kernel{hash}) ": "identical to the line above (cast wallet sign --data)",
    "wireSignature(0x01||validator||ecdsa)": "0x01845ADb2C711129d4f3966735eD98a9F09fC4cE5729b3a96fe7607ba7f66b60285c8f88702dcf9a2969e9a189d6bf404acea58ebf1433b00bf7c399efb10aa2d077bb6cb2a1a12233ecc3e98df89a467dad49975c1c"
  },

  "clobAuth": {
    "note": "address=SMART, timestamp='1791389400', nonce=0, message='This message attests that I control the given wallet'; domain has NO verifyingContract",
    "typehash(ClobAuth(address address,string timestamp,uint256 nonce,string message))": "0x52578c5c725a28a84fedc8c22aa47947822942f35b4dc350db028e45320e035c",
    "domainTypehash(EIP712Domain(string name,string version,uint256 chainId))": "0xc2f8787176b8ac6bf7215b4adcc1e069bf4ab82d9ab1df05a57a91d425935b6e",
    "domainSeparator(ClobAuthDomain,1,3223)": "0x44e30cd10e3df85b868a7b3850e9e35945475365c26a07680811e3ff1e85197b",
    "structHash": "0x0ddf259e437daad4d3e598a2e635eae681993f4b0c2e3ff53b4046db434c562f",
    "digest": "0x64a36fa69b02d5a273656445a2549ba8e1f2694743aad967273fa5943e198c1e",
    "kernelWrappedDigest": "0x4ed2d357e8765ce1f3d3c1bde491b31871015d7c8e9bd17fd608f38f4fe3b3cc",
    "ecdsa(Hardhat #0)": "0x292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b",
    "XO_SIGNATURE": "0x01845ADb2C711129d4f3966735eD98a9F09fC4cE57292df0d14e780293653e4d3227153e7f6b9369da499556988ee96098d72eea2b713d86a5776e464eaea637632d5548ae9544d32310130f9715cd519afccb80441b"
  },

  "hmacL2": {
    "note": "bot/docs algorithm, my own inputs (the docs publish no HMAC vector). secret is base64 of the 32 ASCII bytes 'secret-key-1234567890abcdef'",
    "secretBase64": "c2VjcmV0LWtleS0xMjM0NTY3ODkwYWJjZGVm",
    "timestamp": "1791389400", "method": "POST", "path": "/order", "body": "{\"orderType\":\"GTC\"}",
    "canonical": "1791389400POST/order{\"orderType\":\"GTC\"}",
    "signature_urlsafe_base64_with_padding": "1UIXoS3OTKqGeKfPthBHz3xsrh1tuF6f1oJl8hGmd2Q="
  }
}
```

Equivalence proof used for the PayBox design: typed data for `request_wallet_sign` (`typedData` intent) producing the same signature as vector B:

```json
{ "domain": {"name":"Kernel","version":"0.3.1","chainId":3223,"verifyingContract":"<smartAccount>"},
  "types":  {"Kernel":[{"name":"hash","type":"bytes32"}]},
  "primaryType":"Kernel",
  "message":{"hash":"<orderHash>"} }
```

Wire signature = `0x01 || 845ADb2C711129d4f3966735eD98a9F09fC4cE57 || <65-byte r||s||v>`. The signer sees an opaque `bytes32`, so the plugin must show the human-readable order and bind `hash` to it (blind-signing risk is inherent to Kernel's wrap; it cannot be avoided by choosing a different typed-data shape).

Docs pitfall: the docs print type strings with spaces after commas (e.g. `ClobAuth(address address, string timestamp, uint256 nonce, string message)`). The typehash must use the canonical no-space form used above.

---

## 5. Docs cross-check: constants and algorithms

Docs paths are on `docs.xo.market` (read through the `xo-docs` MCP). "OK" = docs and code agree.

| Item | Code | Docs | Status |
|---|---|---|---|
| Chain id | 3223 | `/documentation/introduction`: "Chain id `3223`" | OK (H) |
| Orderbook host | `https://orderbooks.xo.market` | same | OK (H) |
| Data API base | `https://api-mainnet.xo.market/api` | `/data-api-reference/introduction` Base URL | OK (H) |
| CTF Exchange | `0x4bC5E872...1B77` | `/documentation/introduction` Contracts table; also DefiLlama adapter calls it current `CTF_EXCHANGE` since block 8984354 and lists a retired `0xCf4509B2...4D5b` | OK (H); 2nd party M |
| Conditional Tokens | `0xCcf1b2C6...3909` | same table | OK (H) |
| Kernel ECDSA validator | `0x845ADb2C...4cE57` | `/guides/smart-accounts` | OK (H) |
| Kernel domain | name `Kernel`, version `0.3.1`, chainId 3223, verifyingContract = smart account | same | OK (H) |
| Order domain | `XO Market CLOB`, `1` | same; `/guides/wire-conventions` | OK (H) |
| Order typehash/field order | 13 fields as in section 2.2 | `/guides/smart-accounts` Solidity `ORDER_TYPEHASH` | OK (H); my `cast` typehash matches the string |
| ClobAuth domain/struct/message | `ClobAuthDomain`/`1`/chainId, no verifyingContract; struct `ClobAuth(address,timestamp,nonce,message)` | `/guides/wire-conventions`, `/api-reference/authentication` | OK (H) |
| Signature wrap | `0x01 || validator || ecdsa(wrapped)` | `/guides/smart-accounts`: "0x01 || bytes20(0x845ADb2C...) || ecdsa(wrappedDigest)" | OK (H) |
| `maker == signer`, `signatureType = 3`, beneficiary zero default | yes | yes (`/guides/smart-accounts`) | OK (H) |
| Amount semantics (BUY maker=USDC, taker=shares; SELL reverse; 6-dec micro) | yes | `/api-reference/trade/post-a-new-order` `makerAmount`/`takerAmount` text | OK (H) |
| No `feeRateBps`/`taker` in the signed order | none | docs: "Legacy wire keys `taker` and `feeRateBps` are ignored on parse and must not be used" | OK (H) |
| Tick 0.001 | yes | `/guides/wire-conventions`: bad tick -> 400 `"invalid price tick"` | OK (H) |
| Envelope `{order, orderType, postOnly}` | yes | `PlaceOrderRequest` | OK (H) |
| `postOnly` needs GTC/GTD | uses GTD | docs: FAK/FOK with postOnly returns an error | OK (H) |
| GTD needs non-zero expiration in seconds | `roundEnd/1000 + 1` | docs: "`GTD` ... requires non-zero `expiration`" | OK (H) |
| Derive-then-create | 404 only -> POST | `/api-reference/authentication/derive-api-key` 404 "SDKs use this 404 to fall through" | OK (H) |
| L2 headers | `XO_API_KEY`, `XO_PASSPHRASE`, `XO_TIMESTAMP`, `XO_SIGNATURE` | `/api-reference/authentication` | OK (H) |
| L2 canonical string | `ts + METHOD + pathWithQuery + body` | "`timestamp + method + path + body`" with "path ... including the query string when present" | Matches the docs; **but contested live by another client (D7)** |
| HMAC output encoding | URL-safe base64, padding kept | "URL-safe base64 HMAC-SHA256" | Padding not specified in docs (NOT FOUND); secret decoding "Base64-encoded HMAC secret" (spec) supports decoding (M) |
| Pagination sentinel | stops on `"LTE="` | `/guides/wire-conventions`: literal `"LTE="` is end-of-stream | OK (H) |
| 429 body | reads `retry_after_ms` | `Error429.retry_after_ms` = ms until the 1-second fixed window resets (write endpoints) | OK (H); public reads: docs say excess traffic is rejected "without backoff hints" |
| Rate limits | no throttle | public REST 5 rps; auth single place+cancel 250 rps; batch 25 rps; Data API 100 req/10 s | Bot unthrottled; fine at its volume |
| Clock | system clock | L2 timestamp within +-30 s of `GET /time` | **Gap: bot never aligns (D10)** |
| Tokens from `/markets/{cid}` | `tokens[].token_id`, `outcome` Yes/No | OpenAPI `MarketObject` | OK; live confirmed (section 8). Docs enum shows `[true,false]` for `outcome` (YAML Yes/No-as-boolean artefact in the generated spec) |
| `GET /book` | `bids/asks[{price,size}]`, `last_trade_price`, `timestamp` | `BookResponse` | OK; live confirmed |
| `GET /fee-rate` | `{base_fee}` | same | OK; live confirmed (`{"base_fee":0}` on a Pulse token) |

Corroborated by documentation but **not** by the bot: collateral token (`0x80c12230ce677e6f304027a14780Edd2A829ab0c`, "XO USDC (collateral, 6 decimals)"), EntryPoint v0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`), bundler `https://mainnet-bundler.xo.market/`, RPC `https://rpc-mainnet-2.xo.market?api_key=<API_KEY>` (key issued privately on onboarding), paymaster (address from onboarding, not public).

---

## 6. DISCREPANCIES (docs vs code, or docs vs live, or docs vs docs)

Severity: B = blocks or silently breaks something we need; W = worth a defensive implementation; I = informational.

**D1 (B) `GET /order/{id}` does not exist.** Bot `getOrder()` calls `GET /order/{id}` ("CLOB-style"). Docs/OpenAPI: `GET /data/order/{id}` ("Get a single order by id") only; `/order` has only POST and DELETE. Live probe: `GET /order/42` -> HTTP 404 empty body; `GET /data/order/42` -> 401 `HMAC L2 credentials required` (route exists). Effect in the bot: the first order that leaves the open list triggers `getOrder` -> 404 -> `haltReason` -> trading stops. (H)

**D2 (W) `/balance-allowance` without `address`.** Docs: `address` is a required query param on `GET /balance-allowance` (and `/balance-allowance/update`). Bot sends only `asset_type=COLLATERAL`. Live: unauthenticated `GET /balance-allowance?asset_type=COLLATERAL` -> 401; with `?address=<addr>` -> 200 and **no auth needed** (spec has no security on it). Whether the HMAC variant infers the caller's address cannot be tested without a key. (H for the param and for the public variant; M for the bot's form)

**D3 (B for any cancel feature) Cancel-by-id form is ambiguous.** Docs `DELETE /order`: schema `CancelOrderRequest` requires `orderId` (int64), `marketId`, `signature`, `signatureType` (EIP-712 "CancelOrder(orderId, marketId)"); a second example shows the HMAC "CLOB SDK form" `{"orderID": "42"}` (decimal internal id); the Rust sample passes a **0x hash**; `canceled[]` is "Order ids ... decimal strings". The bot sends `{orderID: <0x EIP-712 hash from PlaceOrderResponse>}` in the requote path, but `{orderID: <numeric id from GET /orders>}` in `cancelAll`. Which id the HMAC form accepts is undetermined. The EIP-712 `CancelOrder` domain/struct is **NOT FOUND in the docs** (searched: `CancelOrder(`, cancel signature, nonce cancel; only mentioned by name). The bot author notes the same gap. (H for docs ambiguity)

**D4 (I) Batch placement result shape.** Docs: `POST /orders` returns per-entry snake_case objects (`order_id, fills, resting, remaining_size, order_hash, error`), top-level 200 even if all entries fail, max 100 orders. Bot types it as an array of single-order camelCase responses (`success, errorMsg, orderID, status`). `postOrders` is dead code in the bot, so there is no runtime effect, but do not copy the type. (H)

**D5 (W) Data API Pulse list: docs lag the live API.** Docs list `marketAddress`, `openingTwap`, `closingTwap`, `status` values `ACTIVE|RESOLVED|CLOSED`. Live `GET /pulse/markets?status=ACTIVE&limit=1` returns additionally `conditionId`, `openingPrice`, `closingPrice`, `resolutionData`, `marketMetadata.outcomes:[{id:0,title:"UP"},{id:1,title:"DOWN"}]`, with `marketAddress: null` and `status: "active"` (lowercase). The bot depends on `conditionId`, `openingPrice`, `closingPrice` - undocumented but live. Treat undocumented fields as unstable; assert their presence at runtime. (H live)

**D6 (I) Liquidity-reward minimum rest time.** Docs `/product/rewards/liquidity-rewards`: "The current minimum is 30 seconds unless the market shows a different value." Live `GET /public/liquidity-rewards/groups` today: `min_order_rest_ms: 200`, `min_order_rest_seconds: 1` (bot README says 300 ms when it was written). Docs vs API disagree; API is authoritative per the docs' own caveat. Not needed for the plugin. (H)

**D7 (B, unresolved) HMAC canonical path: with or without query.** Docs: path "**including** the query string when present". Bot follows the docs. The second community client (`klumpfuss1234/xo-market-tui`, 2026-10-09) ships `hmacMode` defaulting to `path-only` and labels it "Live XO compatibility: path only" vs "Documented form: path + query"; its test file asserts `canonicalTarget(...)` returns `/orders` for `.../orders?limit=10` in `path-only` mode. Polymarket's py-clob-client (XO's stated model: "canonical CLOB wire conventions") signs the path without the query, which makes the TUI's claim plausible (M, general knowledge, not verified here). If live is path-only the bot's `GET /orders?...`, `GET /balance-allowance?...` calls would fail 401 while POST/DELETE (no query) would work. Cannot verify without a credential. Mitigation: make the target mode a config flag, and test both once with a dedicated credential before release. (M for the claim; H that the two clients disagree)

**D8 (W) Smart-account signature prefix.** Docs and bot: `0x01 || validator || ecdsa` (86 bytes). TUI: `0x00 || ecdsa` (66 bytes, no validator address; Kernel v3 mode 0x00 = root validator, from general knowledge M). Both can only verify if the account's root validator is that ECDSA validator; XO verifies by on-chain ERC-1271, so either may work. Follow the docs form (`0x01` + validator) unless it fails. Docs also contradict themselves: OpenAPI `order.signature` says "0x-prefixed 65-byte hex" while the Smart accounts page defines an 86-byte signature. (H docs-internal conflict; M on 0x00)

**D9 (I) Header names inside the OpenAPI text.** `ApiKeyTriplet`/derive docs say the key is "sent as `POLY_API_KEY` header" and passphrase as "`POLY_PASSPHRASE`" (Polymarket copy-paste); `securitySchemes` and the Authentication page say `XO_API_KEY`/`XO_PASSPHRASE`. Bot uses `XO_*` (consistent with the Authentication page). Also the TUI additionally sends `XO_ADDRESS` on L2 requests, which the docs do not list for L2. (H)

**D10 (W) No clock alignment.** Docs: L2 requests fail if `XO_TIMESTAMP` drifts more than +-30 s; "Use `GET /time` to align". Bot defines `serverTime()` but never calls it. Live `GET /time` returns a bare integer in seconds (`1792344826` at probe time). (H)

**D11 (W) Retries on non-idempotent calls.** Bot retries POST/DELETE after network timeouts. Docs: replayed signed order -> 400 `"duplicate order: an order with the same signed-payload hash is already resting in this book"`, so engine-level safe; and `orderID` is the deterministic EIP-712 hash (computable before submit), so a lost response can be reconciled by hash. Our plugin should still follow "never auto-retry after an ambiguous write" and reconcile by hash. (H docs; design note)

**D12 (I) Approvals are not queryable through `/balance-allowance`.** Docs introduction: "Check `/balance-allowance` to verify funding and approvals." But the response schema says `allowance` is "Available cash after open-order reservations ... `balance - allowance` is the amount earmarked against resting BUY orders", i.e. not an ERC-20 allowance. No documented endpoint reads Enable-Trading state (USDC allowance / `isApprovedForAll`). On-chain reads need the api_key-gated RPC. NOT FOUND (searched: allowance, approv, operator, isApprovedForAll). (H)

**D13 (I) Docs defects noticed.** `/guides/market-lifecycle` has a garbled sentence ("See [Redeem positionsonditionalTokens.redeemPositions call made by...") and a duplicated paragraph; OpenAPI `MarketTokenObject.outcome` enum renders as `[true,false]`. Suggest reporting via the xo-docs `submit_feedback` tool, which I did **not** call (it is an external write outside this read-only task).

**D14 (I) GTD expiry slack.** Bot README claims "nothing can rest past the round". Docs: GTD sweeper runs about every 10 s and cancels "under 10 seconds" after the deadline; resolved/closed markets cancel everything atomically. Bounded, not zero. (H)

**D15 (I) Data API rate limit.** Docs: 100 requests per 10 s (30 per 10 s for `/public/liquidity-rewards/*`). Live response headers on `/pulse/markets`: `x-ratelimit-limit: 50`, `x-ratelimit-remaining: 48`, `x-ratelimit-reset: 1`. Window semantics unreconciled; budget conservatively. (H observed)

---

## 7. Other open-source XO integrations found

Searched: `gh search repos` for `xo.market`, `XO Market`, `xo-market`, `xomarket`, `XO Market CLOB`, `orderbooks.xo.market`; `gh search code` for `"XO Market CLOB"`, `"api-mainnet.xo.market"`, `"orderbooks.xo.market"`, `"XO_SIGNATURE"`, `"XO_API_KEY"`, `"rpc-mainnet-2.xo.market"`, `"mainnet-bundler.xo.market"`, `"0x80c12230ce677e6f304027a14780Edd2A829ab0c"`, `"0x4bC5E872256D12E6017dfe466E04c867DC761B77"`. The GitHub code index is clearly incomplete: it returned nothing for hosts that two repos below demonstrably contain. Code search also hit its rate limit twice (waited, resumed).

| Repo | Date / license | What it is | Value |
|---|---|---|---|
| `klumpfuss1234/xo-market-tui` | created 2026-10-09, MIT, 0 stars, TypeScript (ethers, ws) | Manual-first terminal client: market browse, WS books, place/cancel ladders. Docs `WALLET_SETUP.md`, `SECURITY.md`. Read: `constants.ts`, `trading/signing.ts`, `api/auth.ts`, `api/trading-client.ts`, `trading/units.ts`, `trading/validation.ts`, `wallet/session.ts`, `api/public-client.ts`, `api/market-socket.ts`, tests. | **Best second source.** Confirms Kernel wrap = `signTypedData(Kernel{hash})` (H). Introduces D7 (HMAC path-only), D8 (`0x00` prefix), `funder` field in order envelope (undocumented), batch cancel `DELETE /orders` with an array of order **hashes** (docs say `orderIds` int64 + marketId + signature), unauthenticated `GET /positions?address=` (confirmed by the spec), Data API `/v1/events`, `/convictions`, `/categories`, `/markets/contract/{id}` (the first three are NOT in the docs' Data API path list), WS `wss://orderbooks.xo.market/ws/market` subscribe `{type:"market", assets_ids, custom_feature_enabled, initial_dump}` (docs text only says clients "subscribe to one or more `assets_ids`"). Says "The TUI intentionally does not send approvals" and tells users to do Enable Trading in the official app. Whether the author ran it live is not stated (M). Fee estimate matches the docs curve `shares * bps/10000 * p * (1-p)`. |
| `quanturbo/xo_market` | 2026-05-16..17, **no license** ("Private - all rights reserved"), Python | Older BSC / AMM-router era bot (Privy auth, ERC-4337 UserOps, "stealth bridge", wallet-recovery modules). | **Not used.** Wrong era/chain (BSC), not CLOB, proprietary, stealth/sybil-style tooling. Only generic pattern seen: ERC-4337 v0.7 UserOp with paymaster and zero fees, consistent with the docs' redeem guide (L for chain 3223). |
| `Osivwi10/xo-trading-bot` | 2026-06-01, no license, JS | Paper edge bot with a placeholder contract and Base config; reads orderbook/Data API. | Only confirms public read endpoints and `tokens[0]=Yes/Up`, `tokens[1]=No/Down` (M). No signing. |
| `vedangagarwal/ipl-bot-service`, `HarrisonJL/pl-conviction-board`, `faroukobayanju/xomarket-prototype`, `ramijames/xo-market-test`, `imbjdd/market-resolution-chatbot` | 2025-08..2026-10 | Telegram score updater, dashboards, prototypes. | No trading/signing; not read in depth. |
| `DefiLlama/dimension-adapters` `dexs/xo-market/index.ts` | updated 2026-09-15, public | Third-party indexer adapter for chain key `xo`. | Independent corroboration (M) of: current CTF Exchange `0x4bC5E872...` (from block 8984354), a **retired** exchange, current XO USDC `0x80c12230...` = **6 decimals** vs a legacy **18-decimal** XO USDC, and a `CLOB_MARKET_MANAGER` contract (`0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307`) emitting `MarketCreationFeeCharged(conditionId, creator, collateralToken, fee)` ("Fees paid to the treasury when a conviction market is created"). A lead for gate 5 (on-chain creation fee path); not verified on an explorer. |

No official XO SDK/repo found (the docs mention `xo-orderbook-client-rs`, `polymarket-client-sdk`, `py-clob-client`, `rs-clob-client` compatibility and link `github.com/xomarket` for the OpenAPI spec; I did not fetch that org). No other independent implementation of Kernel signing, HMAC, bundler/UserOp for chain 3223 was found.

---

## 8. Live probes (public unauthenticated GETs, 2026-10-18 ~17:3x Z, outputs not retained beyond shapes)

- `GET orderbooks.xo.market/time` -> bare integer seconds. (H)
- `GET orderbooks.xo.market/trading-state` -> `{"state":"active"}`. (H)
- `GET orderbooks.xo.market/markets/{conditionId}` (a Pulse round) -> `{condition_id, tokens:[{token_id, outcome:"Yes", price}, {..., outcome:"No", ...}], minimum_tick_size:0.001, neg_risk:false, active:true}`. (H)
- `GET /book?token_id=...` -> `{market, asset_id, timestamp(ms string), hash, bids:[], asks:[], min_order_size:"0", tick_size:"0.001", neg_risk:false, last_trade_price:"0.000", last_update_id}`. (`min_order_size:"0"` on a fresh/empty Pulse book matches the docs caveat.) (H)
- `GET /fee-rate?token_id=` -> `{"base_fee":0}` for a Pulse token; `GET /tick-size?token_id=` -> `{"minimum_tick_size":0.001}`. (H)
- Public by `address` (no auth): `/balance-allowance?address=` -> `{balance, allowance, smart_account}` (strings; `smart_account` null for a dummy address); `/positions?address=` -> `{cash_balance, positions:[]}`; `/claimable?address=` -> `{address, claimable:[]}`. Auth required: `/orders`, `/data/order/{id}`, and `/balance-allowance` without `address`. (H) For the docs' example address the `smart_account` came back null, so **whether an owner-EOA query maps to its smart account remains unresolved** (no value recorded).
- Data API `GET /pulse/markets?status=ACTIVE&limit=1` and `GET /public/liquidity-rewards/groups` -> shapes in D5/D6.

---

## 9. Implications for the 9 feasibility-gate items (from this task's evidence only)

1. **Auth/credentials - partial.** Mechanism fully specified and implementable (L1 = smart-account-wrapped ClobAuth signature -> triplet; L2 HMAC per request). The L1 signature requires an owner-key signature each time it is used (PayBox sign request); the triplet is a long-lived per-user secret (docs also say `derive-api-key` re-returns the oldest key, and there is a `MAX_KEYS_PER_USER` cap). Custody of the triplet inside a PayBox plugin, and the HMAC path mode (D7), are open.
2. **Order flow - go on mechanism, unproven live.** Prepare (build order, compute hash) -> owner signs `Kernel{hash}` typed data -> submit `POST /order` with HMAC. Docs-complete and cross-implemented, but no community code is shown to have succeeded live, and cancel (D3) and approvals (D12) are unclear.
3. **Smart wallet ownership - unanswered.** Docs: owner is "external or embedded" EOA; the Kernel account is created by the XO app and must be a deployed contract (`maker.code.length > 0`). No factory address, salt scheme, or owner-registration API is documented; the bot takes the address from env. Whether a PayBox EVM wallet can be an owner is unanswered.
4. **Chain support / gas - partial.** Orders are off-chain; no chain 3223 transaction is needed to trade. Approvals/redeem are ERC-4337 v0.7 UserOps through the XO bundler with `maxFeePerGas = 0`, sponsored by an XO paymaster whose address is only given at onboarding, signed by the owner with raw ECDSA over `userOpHash`. PayBox simulation of chain 3223 is irrelevant to the order path but relevant if approvals/redeem are to be proposed through PayBox.
5. **Market creation - nothing in the bot.** Creation is the in-app flow (`/product/products/create-a-conviction`: stake >= $10, seed 5-95 c, "creation is not idempotent", "Creator eligibility can be gated"); ToS UGM terms: creation requires the Catalyst Badge (500 CP, 7-10 day login streak, verified social account). Lead only: `CLOB_MARKET_MANAGER` contract (DefiLlama). No public create API found.
6. **Funding/bridge - nothing in the bot.** `/product/accounts/deposit`: three in-app routes (connected **EVM or Solana** wallet via a funding provider, address transfer, card/cash), "USDC credited to your XO smart wallet"; withdrawal is also in-app. No programmatic deposit/bridge/withdraw API is documented. Release-blocking item remains open.
7. **Terms - partial (H, `/legal/terms-of-service`).** Restricted regions named: Cuba, Iran, North Korea, Syria, "the United States, the United Kingdom, France, Singapore, Ontario (Canada)"; VPN/proxy circumvention prohibited; "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system" (bots not banned). Terms may change "with or without notice". Whether an agent-run account counts as one user/one account is not addressed.
8. **Sign-then-submit - XO side answered, PayBox side open.** XO needs only an off-chain EIP-712 owner signature plus an HTTP submit; the `typedData` intent suffices (section 4). Whether PayBox `autonomous` grants auto-sign plugin-proposed typed data is not something this repo can answer.
9. **Read-side fallback - answered go.** Public unauthenticated reads cover markets (Data API `/markets`, `/pulse/markets`, `/users/portfolio`), books/prices (`/book`, `/markets/{cid}`, `/fee-rate`, `/tick-size`) and per-address `/balance-allowance`, `/positions`, `/claimable`. Open orders and single-order lookup need L2. No Blockscout/explorer URL appears in the docs (NOT FOUND: `blockscout`, `explorer`, `etherscan`); the official RPC needs a privately issued `api_key`.

---

## 10. NOT FOUND (what was searched)

- Smart-account factory, salt/index derivation, or any way to compute/look up a smart account from an owner EOA (searched docs for: factory, CREATE2, counterfactual, getAddress, ownerAddress, kernel, smart_account; searched bot and TUI source).
- Enable Trading calldata and any API to read approval state (searched docs: approv, allowance, operator, setApprovalForAll, isApprovedForAll; bot grep).
- EIP-712 `CancelOrder` domain/typehash (searched docs and OpenAPI for `CancelOrder(`, cancel signature).
- Paymaster address, RPC `api_key`, bundler authentication: onboarding-only per docs.
- A testnet: docs say "XO operates a single public production environment"; no `testnet`, `1000101` or `staging` anywhere in the docs. The plan's testnet chain 1000101 is therefore **unverified and contradicted by the docs** (H for the absence).
- The token name "USDC.e": docs call the collateral "XO USDC (collateral, 6 decimals)" and never "USDC.e" (searched `USDC\.e`, `bridged`).
- A bridge/Base deposit path: docs describe provider-based deposit from EVM or Solana wallets; no `Base`, `bridge`, `BNB` text in the account/deposit docs.
- A documented HMAC test vector, padding rule, or statement on path-with-query being verified live.
- WebSocket subscribe message shapes in the docs text (only prose; shapes seen in the TUI code).
- Any hard-coded literal expected hash/signature in the bot's tests (only structural asserts).
- Official XO SDK / OpenAPI repo contents (the docs point to `github.com/xomarket`; not fetched).

---

## 11. Sources

Docs (xo-docs MCP, `docs.xo.market`), all read this session:
- `/documentation/introduction` - environment, contracts, bundler/RPC, "Only XO smart-account orders (`signatureType = 3`) are accepted by the orderbook today", "XO operates a single public production environment."
- `/guides/smart-accounts` - roles, order domain, typehash, Solidity `hashOrder`, Kernel wrap, "0x01 || bytes20(0x845ADb2C711129d4f3966735eD98a9F09fC4cE57) || ecdsa(wrappedDigest)", L1/L2 auth, example script (fully read).
- `/guides/wire-conventions` - prices/sizes/timestamps/IDs, `LTE=`, ClobAuth domain, signatureType table.
- `/guides/order-types`, `/guides/fees`, `/guides/auto-cancellation`, `/guides/taker-delay`, `/guides/trading-pause`, `/guides/market-lifecycle`, `/guides/redeem-positions`.
- `/api-reference/authentication`, `/api-reference/rate-limits`, `/api-reference/introduction`, `/api-reference/trade/post-a-new-order`, `/api-reference/trade/cancel-single-order`, `/api-reference/authentication/derive-api-key`, `/api-reference/account/refresh-balance-&-allowance`, `/api-reference/websockets/websockets/public-market-channel`.
- `/openapi/api-reference/openapi.yaml` (JSON; paths, `CancelOrderRequest`, `CTFOrder`, `PlaceOrderRequest/Response`, `BatchPlaceOrderResultEntry`, `OpenOrder`, `OrdersPage`, `BalanceAllowanceResponse`, `ApiKeyTriplet`, `BookResponse`, `MarketObject`).
- `/openapi/data-api-reference/openapi.yaml` (paths, `/users/portfolio`, `/pulse/markets` params), `/data-api-reference/introduction`, `/data-api-reference/rate-limits`, `/data-api-reference/pulse-markets/list-pulse-markets`.
- `/product/accounts/wallets`, `/product/accounts/deposit`, `/product/accounts/withdraw`, `/product/accounts/transfer-states`, `/product/quickstart`, `/product/products/pulse`, `/product/products/create-a-conviction`, `/product/rewards/liquidity-rewards`, `/product/policies/risk-and-eligibility`, `/legal/terms-of-service` (Section 3 restricted regions; prohibited-activity bots clause; UGM Terms Section 2 Catalyst Badge).

Short verbatim quotes used above (docs): "Only XO smart-account orders (`signatureType = 3`) are accepted by the orderbook today."; "Do not sign the order hash or the ClobAuth digest directly. Wrap that digest, then sign the wrapped digest"; "`timestamp + method + path + body`"; "`path` - request path **including** the query string when present."; "Keep `XO_TIMESTAMP` within +-30 s of server time. Use `GET /time` to align."; "Legacy wire keys `taker` and `feeRateBps` are ignored on parse"; "Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system."; "This one-time step grants the smart wallet's USDC allowance and Conditional Token operator approval."; "Creator eligibility can be gated, and submissions may be reviewed before going live."

Reference repo `NitinkashyapSTRR/xo-pulse-market-maker` @ `bfedc70`, fetched with `gh api -H "Accept: application/vnd.github.raw" repos/NitinkashyapSTRR/xo-pulse-market-maker/contents/<path>`: `LICENSE`, `README.md`, `SECURITY.md`, `package.json`, `src/xo/constants.ts`, `src/xo/signing.ts`, `src/xo/orderbook.ts`, `src/xo/http.ts`, `src/xo/dataApi.ts`, `src/engine/live.ts`, `src/config.ts`, `src/cli.ts`, `src/bot.ts` (skimmed; grep for approvals/bundler/RPC), `test/signing.test.ts`. Quotes: "Mirrors https://docs.xo.market/guides/smart-accounts byte for byte" (`signing.ts` header); "Live mode has **not** been run against real funds by the author." (README); "Batch/all cancel endpoints need an EIP-712 cancel signature not yet implemented." (README).

Other repos (raw files via `gh api`): `klumpfuss1234/xo-market-tui` (`src/constants.ts`, `src/trading/signing.ts`, `src/api/auth.ts`, `src/api/trading-client.ts`, `src/trading/units.ts`, `src/trading/validation.ts`, `src/wallet/session.ts`, `src/api/public-client.ts`, `src/api/market-socket.ts` (head), `docs/WALLET_SETUP.md`, `docs/ARCHITECTURE.md`, `README.md`, `SECURITY.md`, `test/units.test.ts`, `test/auth.test.ts`); `quanturbo/xo_market` (`README.md`, `src/trading/userop.py` head); `Osivwi10/xo-trading-bot` (`config.js`, `markets.js`, `package.json`); `DefiLlama/dimension-adapters` (`dexs/xo-market/index.ts`, `helpers/coreAssets.json`, `helpers/chains.ts` grep). Quote: "Live XO compatibility: path only" / "Documented form: path + query" (`wallet/session.ts`).

Live probes: `https://orderbooks.xo.market/{time,trading-state,markets/<cid>,book,fee-rate,tick-size,balance-allowance,positions,claimable,orders,order/42,data/order/42}` and `https://api-mainnet.xo.market/api/{pulse/markets,public/liquidity-rewards/groups}` (GET only, small outputs).

Local derivation: Foundry `cast` 1.7.1 (`cast keccak`, `cast abi-encode`, `cast wallet sign --no-hash`, `cast wallet sign --data`), script kept in the scratchpad only.

---

## 12. Process disclosures

- The GitHub code-search endpoint rate-limited twice (10/min). I waited and ran fewer queries. The `plugin:github:github` MCP failed to connect (not needed; `gh` CLI was used).
- No `.env` or credential file was read anywhere. `.env.example` in the reference repo returned 404 (it is referenced by the README but absent); I deliberately did not fetch `.env.example` from `quanturbo/xo_market`.
- I did not call `submit_feedback` on the docs MCP (external write).
- Scratch copies of third-party files live under the session scratchpad (`bot/`, `tui/`, `qt/`, `ot/`); nothing was executed from them.


---

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Method: bot source (`NitinkashyapSTRR/xo-pulse-market-maker` @ `bfedc70`) and `klumpfuss1234/xo-market-tui` re-fetched with `gh api` (read only, nothing executed); every address and domain re-checked against `docs.xo.market` through the `xo-docs` MCP; vectors re-derived from the docs algorithm with Foundry `cast` 1.7.1 plus `openssl` (HMAC) using a throwaway key generated for the check; live public GET probes repeated (no auth, no POST/PUT/DELETE, no 402 seen). Tags: H = read or reproduced first-hand this verification.

### V1. Confirmed (independently re-derived, no change)

- **All protocol addresses and domains match the docs character for character (H).** I searched the docs for each of the 6 addresses in the notes (CTF Exchange, Conditional Tokens, Kernel ECDSA validator, XO USDC, EntryPoint v0.7, plus the docs' fake `0xCAFE...0A11`) with a case-sensitive fixed-string search; each is present with identical casing. Domains `XO Market CLOB`/`1`, `Kernel`/`0.3.1`, `ClobAuthDomain`/`1`, chain `3223`, ClobAuth message string, tick 0.001, 6 decimals all match `/guides/smart-accounts` and `/documentation/introduction`. The bot's `constants.ts` matches the same strings. The Data API base `https://api-mainnet.xo.market/api` matches `/data-api-reference/introduction` ("Base URL").
- **Every literal vector in section 4 reproduced exactly (H).** Order typehash, EIP712Domain typehash, order domain separator, vector A structHash and orderHash, vector B orderHash, Kernel domain separator, `Kernel(bytes32 hash)` typehash, wrapped digest, ClobAuth typehash, domain typehash, domain separator, struct hash, digest, Kernel-wrapped digest, and the HMAC vector (`1UIXoS3O...Gmd2Q=`, secret base64-decoded to the 28 ASCII bytes `secret-key-1234567890abcdef`, URL-safe, padding kept; computed with `openssl`). I wrote my own script (`abi.encode` + `keccak`), so the derivation is independent of the researcher's script, though it uses the same documented algorithm.
- **Order and ClobAuth hashes cross-checked against cast's own EIP-712 implementation (H).** Signing the full typed-data JSON (`cast wallet sign --data`) gave the same signature as signing the hand-derived digest with `--no-hash`, for vector B and for the ClobAuth digest. This validates the `abi.encode` derivation against an independent typed-data hasher.
- **Kernel wrap equals standard typed data (H, key finding).** With a fresh random key, `cast wallet sign --no-hash <wrappedDigest>` and `cast wallet sign --data <Kernel{hash} typed data>` were byte-identical. The researcher's two signatures (vector B and ClobAuth) both recover to the public Hardhat #0 test account via `cast wallet verify --no-hash`; a one-bit-changed digest fails (negative control). The 86-byte wire form `0x01 || validator || ecdsa` is as stated.
- **D1 (H).** OpenAPI paths: `/order` has only `post` and `delete`; there is no `GET /order/{id}`; `GET /data/order/{id}` exists with `L2HMAC` security. Live today: `GET /order/42` 404 (empty body), `GET /data/order/42` 401 `HMAC L2 credentials required`. Bot `getOrder` uses `/order/${id}`; `live.ts reconcile` sets `haltReason` on any `getOrder` throw. Confirmed.
- **D2 (H).** Spec: `address` required (query) and no security on `/balance-allowance`, `/positions`, `/claimable`. Live: `/balance-allowance?asset_type=COLLATERAL` 401; with `?address=` 200 `{balance, allowance, smart_account:null}`; `/positions?address=` and `/claimable?address=` 200 unauthenticated. Also new: `/orders?address=`, `/data/orders?address=`, `/trades?address=` all stay 401, so open orders and fills are not publicly readable even when an address is given.
- **D3 (H).** `CancelOrderRequest` requires `orderId` int64 + `marketId` + `signature` + `signatureType`; the "CLOB SDK form" example is `{"orderID":"42"}`; the Rust sample passes a `0x...` hash; the `CancelOrder` EIP-712 domain/typehash is not defined anywhere (searched `CancelOrder`, cancel + domain/typehash/eip712 in all mdx and the OpenAPI; only the shorthand `CancelOrder(orderId, marketId)` appears). Bot: requote path cancels by `res.orderID` (0x hash), `cancelAll` by `GET /orders` `id` (numeric). Note: `GET /orders` items carry both `id` (numeric) and `order_hash`, so both forms are obtainable; which one HMAC `DELETE /order` accepts is still undocumented.
- **D7 / D8 (H on what the code says).** `xo-market-tui` `src/wallet/session.ts` defaults `hmacMode` to `"path-only"` (lines 45 and 70-73: "Live XO compatibility: path only" vs "Documented form: path + query"); `src/api/auth.ts` `canonicalTarget` returns `url.pathname` for path-only; `test/auth.test.ts` asserts `/orders` vs `/orders?limit=10`. `src/trading/signing.ts` returns `` `0x00${raw.slice(2)}` `` after `signTypedData(kernelDomain, {Kernel:[{hash:bytes32}]}, {hash: digest})`. Docs (`/api-reference/authentication`): "`path` - request path **including** the query string when present." The disagreement is real; which one the live server verifies remains unverifiable without a credential. The TUI also sends `XO_ADDRESS` on L2 requests and lists orders with `GET /orders?address=<smartAccount>`.
- **Provenance (H).** Bot repo: created 2026-10-07T18:15:39Z, MIT, 2 stars, exactly 1 commit (`bfedc70`), `viem ^2.21.0` the only runtime dependency, README "Live mode has **not** been run against real funds by the author." (pushed_at is now 18:21:44Z, 4 s later than the notes say; immaterial.) `.env.example` is absent from the tree. TUI repo: created 2026-10-09, MIT, 0 stars, 2 commits.
- **ToS (H).** Restricted regions list (Cuba, Iran, North Korea, Syria, United States, United Kingdom, France, Singapore, Ontario), VPN/proxy ban, bots clause ("Automated bots or scripts accessing the service must comply with these Terms and not overwhelm or misuse the system."), Catalyst Badge (500 CP, 7-10 day streak, verified social account) all verified in `/legal/terms-of-service`.
- **Rate limits (H).** 5 rps public REST; 250 rps single place+cancel; 25 rps batch; 5 rps cancel-all; Data API 100 per 10 s and 30 per 10 s for `/public/liquidity-rewards/*`; `Error429.retry_after_ms` documented in `/guides/wire-conventions` and the post-order page. Live Data API response headers again showed `x-ratelimit-limit: 50`.
- **D6, D9, D10, D13, D14, D15, MAX_KEYS_PER_USER, derive returns the oldest key (H).** All re-read in the docs/live and match the notes.
- **DefiLlama adapter (H on its content).** `dexs/xo-market/index.ts` (last commit 2026-09-15) lists `CTF_EXCHANGE` `0x4bC5...1B77` (current), `CTF_EXCHANGE_RETIRED`, `CLOB_MARKET_MANAGER` (target of the `MarketCreationFeeCharged` event), `CURRENT_EXCHANGE_FROM_BLOCK = 8984354`, a legacy 18-decimal XO USDC and the current `0x80c1...ab0c` at 6 decimals. It also lists an `AMM_FACTORY` (see V4).

### V2. Corrected

1. **Gate 4 / section 9.4: paymaster sponsorship is documented for `redeemPositions` only, not for approvals.** The notes say approvals and redeem are UserOps "sponsored by an XO paymaster ... so no native gas is needed". Primary source: `/guides/redeem-positions`: "The paymaster allowlists `ConditionalTokens.redeemPositions`, so redemption is gas-sponsored." and the troubleshooting row "Paymaster rejects the op | ... that the inner target/selector is `ConditionalTokens.redeemPositions`." `/documentation/introduction` only says "on-chain calls (approvals, split/merge/redeem) execute as ERC-4337 UserOperations through the XO bundler." There is no statement that the paymaster sponsors the Enable Trading approvals or split/merge for third-party integrators. Corrected text: "Redeem is documented as gas-sponsored and allowlist-limited. Whether Enable Trading (USDC allowance + operator approval) and split/merge can use the paymaster, or need native gas on chain 3223, is NOT FOUND (searched: allowlist, sponsor, paymaster, gasless, native gas in all docs)." Also, "Order path needs no chain-3223 transaction" is true per order, but the one-time Enable Trading approval is a documented prerequisite (`/documentation/introduction` Start here step 3; `/product/accounts/wallets`) and is itself an on-chain transaction (product pages call create and claim transactions "sponsored"; Enable Trading is not described either way).
2. **Gate 3 / NOT FOUND "any owner-EOA to smart-account lookup": a documented lead exists.** `GET /balance-allowance` and `/balance-allowance/update` define a response field `smart_account`: "User's smart-account address as hex without 0x prefix ... null for plain EOA users with no smart account." (`/api-reference/account/get-balance-&-allowance`; `/guides/wire-conventions` "Watch this - every other address field has the prefix."). The wording ("User's") implies the endpoint may resolve a smart account from an address supplied as `address`, which would be an owner-EOA discovery path. This is untested (the only live call used the docs' fake address and returned null, and I did not probe other people's accounts), so it is a lead, not an answer. The notes' section 8 and gate 3 text should read "documented-but-untested lookup via `smart_account`", not "no lookup documented". Owner registration (can a PayBox EVM wallet become an owner) remains unanswered. Also note `/api-reference/trade/post-a-new-order` describes the account type as "XO Privy/ZeroDev smart accounts" with `signatureType` `3 = XO_ZERODEV`, i.e. the common owner is a Privy embedded wallet.
3. **Section 2.8 / D11 / summary "retries are engine-safe": the duplicate rejection is only documented for orders still resting.** The verbatim 400 message is "duplicate order: an order with the same signed-payload hash is already resting in this book". Replays of FOK/FAK orders (which never rest), or of orders already filled or cancelled, are not documented to be rejected. Corrected: a 400 `duplicate order` proves the first submit landed and is resting; absence of that error after a lost response does not make a blind retry safe. The researcher's design rule ("never auto-retry after an ambiguous write; reconcile by order hash") is right; the supporting sentence "so the resend is safe at the engine level" is not.
4. **D5 / summary fact 13: the live Pulse response is a superset of the docs, not a replacement.** Live `GET /pulse/markets?status=ACTIVE&limit=1` also still returns `marketAddress` (null), `openingTwap` and `closingTwap`, in addition to `conditionId`, `openingPrice`, `closingPrice`, `resolutionData`; `status` is lowercase `active`; `marketMetadata.outcomes` is `[{id:0,title:"UP"},{id:1,title:"DOWN"}]` (all confirmed). The summary's phrase "docs list marketAddress/openingTwap/closingTwap" can be misread as live dropping them; it does not. The notes body (section 6 D5) is accurate.
5. **Gate 9 `answered-go` is too strong for the plan's actual question.** The plan asks whether the Blockscout GraphQL endpoint (`/graphiql` on the XO explorer) is a usable read model if the Data API is restricted. Verified: the XO Data API and orderbook per-address reads are unrestricted (so the fallback is not needed today), but no explorer or Blockscout URL appears anywhere in the docs (searched blockscout, explorer, etherscan, scan, block explorer; the only hosts are orderbooks, api-mainnet, rpc-mainnet-2 (api_key gated), mainnet-bundler) and a web search for the chain 3223 explorer returned nothing. Status should be `partial`: go on XO's own public API as the read model, Blockscout fallback unverified.
6. **NOT FOUND "Official XO SDK or OpenAPI repo contents ... not fetched": now fetched.** `/api-reference/introduction` links the "live OpenAPI spec" to `https://github.com/xomarket`. `gh api users/xomarket` returns a User account (created 2026-01-27) with `public_repos: 0`; `orgs/xomarket/repos` is 404. So there is no public official repo behind that link, and the only machine-readable spec is the OpenAPI already mounted in the docs MCP.

### V3. Refuted

None of the 22 listed facts was refuted. The corrections above are scope or wording errors, not wrong constants, vectors or endpoints.

### V4. Missed findings (relevant to go/no-go; not in the notes)

- **ToS bans wash trading (gate 7, and the plan's self-trading decision).** `/legal/terms-of-service` "No Manipulation or Fraud": "wash trading (engaging in trades with yourself or colluding with others to create artificial activity or false liquidity)"; violators may be suspended and "offending markets may be halted or resolved as 'invalid' (with trades reversed or funds returned)". The plan's "self-trading by the creator is allowed by author decision" conflicts with this clause as written; a market-making or arbitrage bot trading against its own other account would also fall under it.
- **Maker programme terms are partly addressed (gate 7).** `/product/rewards/maker-rebates`: "On an eligible fill, XO returns **35% of the taker fee** to the maker in USDC.", "You do not need to apply, join a whitelist, or claim the payout. External makers can participate under the same eligibility rules.", fills must pass "screening and exclusion checks". The notes say market-maker programme terms are not addressed; the rebate page is the closest thing and applies only to fee-enabled markets.
- **Only CLOB and CLOB_PULSE markets are tradable through the orderbook.** `/data-api-reference/introduction`: "Scopes such as `default`, `withClob`, `withPulse`, and `onlyPulse` include LMSR AMM markets that are **not** tradable through the CLOB orderbook." Use `marketScope=onlyClob` or `onlyClobPulse`. The ToS says XO "primarily" uses the LS-LMSR AMM, and DefiLlama lists a separate `AMM_FACTORY`, so the CLOB-tradable universe is a subset of XO markets (matters for any aggregation or arbitrage scope).
- **Gate 5 detail.** `/product/products/create-a-conviction`: "XO signs your seed order against predicted market identifiers, creates the market through a sponsored on-chain transaction, submits the seed buy as a GTC order"; ToS UGM terms: "Approval is required for a new market to launch" and markets go live only "after admin approval by XO Market". Creation is therefore XO-mediated and approval-gated, which makes a fully autonomous plugin creation path less likely than the notes' "submissions may be reviewed" suggests.
- **Spec inconsistency.** OpenAPI `GET /orders` declares `security: [{L2HMAC}, {}]` (anonymous allowed) while live returns 401 without HMAC, even with `address`. Treat the live behaviour as authoritative.

### V5. Unverifiable (default applied)

- Which canonicalisation the live L2 HMAC verifies (path-only vs path-with-query), and which signature prefix mode (`0x00` vs `0x01||validator`) the live gateway accepts: needs an authenticated call with a dedicated credential. Stays open exactly as in D7/D8.
- Which id form HMAC `DELETE /order` accepts, and the `CancelOrder` EIP-712 shape: undocumented, untestable read-only.
- Whether `GET /balance-allowance?address=<owner EOA>` returns the owner's smart account (V2 item 2): needs a real owner/smart-account pair; not probed.
- On-chain facts about chain 3223 (contract code at the listed addresses, validator deployment, Enable Trading calldata): the official RPC requires a private `api_key`, and no explorer is documented. The Kernel validator address `0x845A...4cE57` equals the widely published ZeroDev ECDSA validator address from my own background knowledge (M, not checked on chain).
- Whether the TUI author ever ran their client live (the "Live XO compatibility" label suggests testing but nothing proves it).
- Whether the second community client's `funder` envelope field is accepted: undocumented; only the TUI source shows it.

### V6. NOT FOUND claims re-searched with different keywords (all stand, except as noted above)

- Testnet / staging: re-searched `testnet|test net|1000101|staging|sandbox|devnet|faucet|preview env|test environment|paper|demo|dry-run|simulat|mock` over all docs: only hit is the Start-here step "Dry-run a signed order with `signatureType = 3`" (no separate environment named) and unrelated prose. `beta.xo.market` is the production app host. Confirmed absent.
- Factory / salt / counterfactual: re-searched `factory|salt|counterfactual|create2|initcode|getaddress|predict|registered|zerodev|kernel|privy` over guides, product/accounts, documentation, api-reference: nothing beyond the points in V2 item 2. Confirmed absent.
- Approval-state read: re-searched `approv|allowance|operator|setApprovalForAll|isApprovedForAll`: only the introduction line "Check `/balance-allowance` to verify funding and approvals." and the `allowance` field definition. Confirmed (D12 stands).
- Explorer / Blockscout: V2 item 5.
- "USDC.e" / bridge / Base: re-searched `usdc\.e|usdce|bridged|bnb|polygon|ethereum|bridge`: absent from docs (the plan's "USDC.e" and "Base/Ethereum/BNB" are press or plan terms; the docs say XO USDC and name no source chains; deposit mentions only "EVM or Solana wallet"). Confirmed.
- WebSocket subscribe shapes: the two WebSocket pages only say clients "subscribe to one or more `assets_ids`" and that auth is "delivered inside the subscribe message body". Confirmed absent.
- Docs HMAC test vector / padding rule: re-searched `test vector|golden|padding|urlsafe|base64url|path-only|query string|canonical`: absent. Confirmed.

### V7. Notes-file hygiene

- No private keys, API keys, secrets, passphrases, e-mail addresses, home-directory paths, or wallet addresses of the user in the notes. The only 66-character hex values are public derived digests (all 15 match my re-derived values); the 132-character values are signatures made with the public Hardhat #0 test key (key and account address not reproduced). The only RPC URL form shown carries the placeholder `<API_KEY>`. The addresses present are protocol contracts, the docs' fake `0xCAFE...0A11`, and DefiLlama's contract addresses.
- The task prompt gave the notes path with a doubled prefix; the real file is `<repo>/docs/research/07-xo-bot-reference.md` (this file). Only this append was made to the repo.

### V8. Gate verdict changes recommended

| Gate | Researcher | Verified | Why |
|---|---|---|---|
| 3 smart wallet ownership | unanswered | partial | A documented-but-untested address-to-`smart_account` lookup exists on `/balance-allowance` (V2.2); owner registration of a PayBox wallet still unanswered. |
| 4 chain support / gas | partial | partial (text corrected) | Paymaster sponsorship documented for `redeemPositions` only; Enable Trading and split/merge sponsorship NOT FOUND (V2.1). |
| 9 read-side fallback | answered-go | partial | Public XO API reads are go; the Blockscout GraphQL fallback the plan asks about has no documented URL (V2.5). |
| 7 terms | partial | partial (more adverse) | Wash-trading clause and maker-rebate page add constraints and one openness signal (V4). |
| 1, 2, 5, 6, 8 | unchanged | unchanged | Re-checked against the cited sources; evidence holds. |
