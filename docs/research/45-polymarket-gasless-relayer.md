# 45. Polymarket with no gas and no pasted API key: the Relayer, Builder keys, remote signing and Session Keys

Task `polymarket-gasless-relayer`. Written 2026-10-24 (harness date). Read-only research: docs.polymarket.com pages and OpenAPI specs (`llms.txt`, `llms-full.txt`, `/api-spec/relayer-openapi.yaml`, `/api-spec/bridge-openapi.yaml`, `/api-spec/clob-openapi.yaml`), npm registry metadata, the published `@polymarket/client@0.14.0` tarball (unpacked into a scratch directory and grepped, not run), raw GitHub files of `Polymarket/builder-signing-server` and `Polymarket/builder-signing-sdk`, Sourcify v2 GETs for the Deposit Wallet source, and GET/OPTIONS probes of `relayer-v2.polymarket.com`, `clob.polymarket.com`, `bridge.polymarket.com` and `polymarket.com/api/geoblock` with `Origin: https://xo-markets-explorer.vercel.app`. Nothing was signed, posted, deployed or created; no account or key was made; nobody was contacted.

Confidence tags: **H** = read first-hand this session in a primary source (URL, file or probe given); **M** = inferred from H facts or from a secondary source; **L** = guess. **NOT FOUND (searched: ...)** is literal. Note ids: `[08]` = `docs/research/08-venues-polymarket-kalshi.md`, `[37]` = `docs/research/37-aa-venue-accounts.md` (section 4.2). Shipped browser code referred to: `app/src/features/trade/direct/polymarket/` (`maker.ts`, `funding.ts`, `l2.ts`, `order.ts`).

Context: the hosted dApp is a static site plus our own relay on AWS (the markets API in `api/`, which already carries `api/xo-relay.ts` and `api/limitless-relay.ts`). The relay may hold **our** operator secrets and never a visitor's private key. Note that this departs from [37]'s binding decision "nothing the author operates"; this note assumes the newer relay direction.

---

## 0. Bottom line

1. **The keyless, gasless path exists and is documented: a Builder API key held by us, used through "Remote Builder Signing".** Polymarket's docs describe a builder account that "owns the builder profile and API credentials used to create Deposit Wallets for your users. Each wallet remains controlled by its signer" (H, `trading/wallets-auth.md` "Create New Accounts"). The Relayer accepts **either** a per-user Relayer API key **or** the operator's Builder API key on `POST /submit` and on the session-key endpoints (H, `relayer-openapi.yaml`, `wallets-auth.md`). With the Builder key, the visitor pastes nothing. They only sign EIP-712 typed data.
2. **The visitor's wallet only ever signs typed data; it never sends a transaction and never needs POL.** Deploying the Deposit Wallet needs **no user signature at all**: `WALLET-CREATE` carries only `from = <signer>` (H). Approvals, transfers, wrap, split/merge/redeem and session-key authorisation are all one `DepositWallet` `Batch` typed-data signature, relayed by Polymarket (H). Orders are an ERC-7739 `TypedDataSign` signature (H). CLOB L1 auth is the `ClobAuth` typed data (H). So a sign-only wallet (PayBox over WalletConnect, many WalletConnect mobile wallets) is enough.
3. **Only the Builder HMAC must happen on our server.** The browser can call the Relayer, the CLOB and the Bridge directly: all three answer CORS preflights for our origin (section 3, H). The builder secret has to stay on our relay. The documented pattern is a signing endpoint that returns the four `POLY_BUILDER_*` headers for a `{method, path, body}` the client sends (H, `wallets-auth.md` "Remote Builder Signing", SDK `remoteBuilderSigning`). **Do not proxy CLOB order posts through AWS.** It is not needed (CLOB CORS is `*`), and it would replace the visitor's IP with ours for Polymarket's geoblock (section 8).
4. **Builder headers on CLOB orders are optional.** Attribution is now the signed `bytes32 builder` field in the order struct (H, `programs/builders/fees.md`, changelog 2026-04-17 "Builder attribution is native via `builderCode` on orders (no more `builder-signing-sdk`)"). The SDK still adds `POLY_BUILDER_*` to non-GET CLOB requests when a builder key is configured (H, SDK `resolveClobHeaders`), but no doc requires it.
5. **One-click trading with no per-order wallet prompt needs Session Keys, and they are gated.** A Deposit Wallet owner can authorise an EOA session signer for exactly about 180 days, with scope `CLOB`, `COMBOSRFQ` or `ALL`. It costs one owner `Batch` signature, and the relayer call is builder-HMAC'd (H, `trading/session-keys.md`). The gate: "During the initial rollout, contact builder@polymarket.com to authorize your Builder API key for session-key management" (H, still on the page 2026-10-24). Without that, every order costs one wallet prompt (the owner signs each order).
6. **Owner must be an ECDSA key; ERC-1271 smart accounts cannot own a Deposit Wallet.** The verified implementation says, in code, "always ECDSA, regardless of signer.code.length" (H, Sourcify `exact_match` `0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB`, `DepositWallet.sol`). An EIP-7702-upgraded EOA works if its wallet returns a plain ECDSA signature from the EOA key (M). A pure smart account (Safe, Coinbase Smart Wallet, Kernel) does not. Worse, an ERC-6492-wrapped signature is **misread as a session-signer envelope**, because the wallet reuses the 6492 magic suffix (H). Section 7.
7. **Free tier: 100 Relayer transactions per day for all our users together** (Unverified tier, "Start immediately with no approval required"). Verified (10,000 per day) needs an email to builder@polymarket.com (H, `programs/builders/tiers.md`). Onboarding one user costs about 2 to 3 relayer transactions (deploy, approvals batch, session-key authorisation), so the free tier serves roughly 30 to 50 new users a day (M).

---

## 1. The Relayer: hosts, endpoints, request shapes, what the user signs

Host: `https://relayer-v2.polymarket.com` (H, `relayer-openapi.yaml` `servers`, SDK). The OpenAPI file is partly stale: its `SubmitRequest.type` enum lists only `SAFE` and `PROXY`. The prose docs and the SDK use `WALLET-CREATE` and `WALLET` for Deposit Wallets (H, `wallets-auth.md`; SDK `RelayerTransactionType.{PROXY,SAFE,WALLET,WALLET_CREATE}`).

### 1.1 Endpoints relevant to a Deposit Wallet (H unless marked)

| Purpose | Method and path | Auth | Notes |
| - | - | - | - |
| Is the wallet deployed? | `GET /deployed?address=<depositWallet>&type=WALLET` | none | Live probe returned `{"deployed":false}` for a dummy address, with ACAO for our origin. |
| Deploy a Deposit Wallet | `POST /submit` body `{"type":"WALLET-CREATE","from":"<signer>","to":"0x00000000000Fb5C9ADea0298D729A0CB3823Cc07","metadata":"Deploy Deposit Wallet"}` | Builder HMAC (or Relayer key) | **No user signature in the body.** The factory's `deploy(owners, ids)` is `onlyOperator` (H, `DepositWalletFactory.sol`), so only Polymarket's relayer can run it. The owner is `from`. Response `{transactionID, state:"STATE_NEW"}`. |
| Batch nonce | `GET /v1/account/transactions/params?address=<signer>&type=WALLET` | docs show both builder/relayer-key headers and no auth (session-keys page) | The live probe without auth returned 200 `{"address":"0x4c91…6395","nonce":"0"}`. The `address` is the **relayer's** address, not the signer's (the session-keys page says so; the wallets-auth page labels it `<signer_address>`). |
| Execute a batch | `POST /submit` body `{"type":"WALLET","from":"<signer>","to":"<factory>","nonce":"<n>","signature":"<batchSig>","metadata":"<text>","depositWalletParams":{"depositWallet":"<dw>","deadline":"<unix s>","calls":[{"target","value","data"}]}}` | Builder HMAC (or Relayer key) | Approvals, `transferErc20`, wrap, split/merge/redeem, Perps deposit. |
| Poll | `GET /v1/account/transactions/<transactionID>` (new), `GET /transaction?id=<id>` (old) | docs show headers; live 404 probe without auth answered normally | Terminal states `STATE_CONFIRMED`, `STATE_FAILED`, `STATE_INVALID`. `WALLET-CREATE` returns the new wallet as `proxyAddress`. |
| Authorise a session key | `POST /v1/session-signers/authorizations` + `Idempotency-Key` | **Builder HMAC only** (SDK: "Session-key authorization requires builder API-key authentication") | Body `{walletAddress, sessionSignerAddress, scopes, validUntil, nonce, deadline, signature}`. Response `{operationId, status:"SUBMITTED", transactionHash, transactionId}`. |
| Revoke a session key | `POST /v1/session-signers/revocations` + `Idempotency-Key` | Builder HMAC per docs; the SDK accepts any gasless-capable key | Body `{walletAddress, sessionSignerAddress, nonce, deadline, signature}`. Revocation also cancels that key's open orders. |
| Legacy Safe/Proxy | `GET /nonce`, `GET /relay-payload`, `POST /submit` type `SAFE`/`PROXY` | — | Only for older accounts (signature type 2). The SDK builds the Safe `SafeTx` hash plus MultiSend. |

### 1.2 What the user signs

- **Batch** (every gasless action), EIP-712 (H, `wallets-auth.md` and SDK):
  - domain `{name:"DepositWallet", version:"1", chainId:137, verifyingContract:<depositWallet>}`
  - types `Call(address target,uint256 value,bytes data)`, `Batch(address wallet,uint256 nonce,uint256 deadline,Call[] calls)`
  - message `{wallet, nonce, deadline, calls}`
  - The SDK sets `deadline = now + 600 s` (`pm=600`). The relayer requires at least 10 s left (session-keys page).
  - The SDK retries automatically if the relayer answers 400 `batch nonce N does not match on-chain nonce M`, re-signing with M. That means a second wallet prompt.
- **Order**: the CTF/V2 Exchange `Order` struct wrapped in ERC-7739 `TypedDataSign` with the wallet's `DepositWallet`/`1` domain fields and `salt = 0x0`. `maker = signer = <depositWallet>`, `signatureType = 3` (H, `session-keys.md`, `place-orders.md`; already shipped in `order.ts`).
- **CLOB L1**: `ClobAuth` typed data, domain `ClobAuthDomain`/`1`/137, `address = <owner EOA or session key>` (H). Already shipped (`l2.ts` derives L2 credentials from it).

### 1.3 Which credentials, whose, and how an operator gets them

| Credential | Owner | How obtained | Secret? | Used for |
| - | - | - | - | - |
| **Builder API key + secret + passphrase** | **us** (one per builder account; several may be created) | polymarket.com → Settings → Builders (`/settings?tab=builder`) → create profile → "+ Create New" (H, tiers page, wallets-auth). Programmatic alternative: `POST https://clob.polymarket.com/auth/builder-api-key` with the builder account's CLOB L2 headers; list with `GET`, revoke with `DELETE` (H, `clob-openapi.yaml` `/auth/builder-api-key`). | Yes. "Keep them on your server, and never expose or share them" (H). | `POST /submit` (deploy and batches), session-signer endpoints, Combos RFQ, optional CLOB headers |
| **Builder code** (`bytes32`) | us | Same Settings → Builders page (H) | **No.** Public by design: "Builder profiles and fee rates are publicly queryable" (H). | `builder` field of every order; `X-Builder-Code` header on Bridge `/deposit` and `/withdraw` |
| Relayer API key + key address | **per user address** | polymarket.com → Settings → API Keys → Relayer API Keys. Creation needs "Gamma auth" (a polymarket.com login); at most 100 per address (H, `relayer-openapi.yaml` tag text) | Yes | Same Relayer endpoints, headers `RELAYER_API_KEY`, `RELAYER_API_KEY_ADDRESS` (must equal the key's owner). **This is the "paste an API key" path we avoid.** |
| CLOB L2 key/secret/passphrase | per signer (owner or session key) | Derived in the browser from a `ClobAuth` signature (`/auth/derive-api-key` or `/auth/api-key`) (H) | Yes, but it is the visitor's own and already handled in-browser (`l2.ts`) | CLOB private endpoints |

Cost and limits (H, `programs/builders/tiers.md`):
- **Unverified**: 100 relayer transactions per day, gas subsidised up to that limit, builder fees allowed, starts with no approval.
- **Verified**: 10,000 per day, leaderboard, Telegram, weekly rewards. Needs an email with the Builder API key, use case and expected volume.
- **Partner**: unlimited.
- Over the limit: "Relayer requests beyond your daily limit will be rate-limited and return an error" (the OpenAPI shows 429 `quota exceeded`).
- No fee for the key. **Is the daily limit counted per builder key or per builder profile? NOT FOUND** (searched tiers, overview, wallets-auth, relayer spec).

The operator's own prerequisite is a polymarket.com account. **Whether creating one or opening Settings → Builders is blocked from a close-only jurisdiction: NOT FOUND** (searched the geoblock page, tiers, overview). The geoblock page restricts order placement, not settings.

---

## 2. Server-side builder signing (remote signing)

- **Documented and supported (H).** `wallets-auth.md` "Remote Builder Signing" and the migration guide (`llms-full.txt`, "Configure Builder API Keys"). The browser SDK calls `remoteBuilderSigning({url, credentials?|headers?})`. For each Relayer request (and each non-GET CLOB request) it POSTs `{"body": <exact serialized body or undefined>, "method": "POST"|"GET", "path": "/submit"}` to our URL with `mode:"cors"` and expects exactly `{POLY_BUILDER_API_KEY, POLY_BUILDER_TIMESTAMP, POLY_BUILDER_PASSPHRASE, POLY_BUILDER_SIGNATURE}` back (zod schema `Fa`, H, `dist/index.js`). It then sends the request **itself, from the browser**, to the Relayer.
- **HMAC rule** (H, `@polymarket/client/node` `builderApiKey`, `builder-signing-sdk/src/signing/hmac.ts`, docs):
  - `message = String(unixSeconds) + METHOD + path + (body ?? "")`, where the path excludes the query string. For the GET params call the docs sign "timestamp, method, and path".
  - `key = base64decode(secret)`. The SDK first maps `-`→`+` and `_`→`/` and strips characters that are not base64.
  - `sig = base64(HMAC-SHA256(key, message))` with `+`→`-` and `/`→`_`, **padding kept**.
  - Headers: `POLY_BUILDER_API_KEY`, `POLY_BUILDER_PASSPHRASE`, `POLY_BUILDER_SIGNATURE`, `POLY_BUILDER_TIMESTAMP` (string seconds).
  - This is the same algorithm as the CLOB L2 signer already in `l2.ts`, so the relay can reuse the Node L2 signer's HMAC function.
- **Reference server (H, `Polymarket/builder-signing-server` `src/app.ts`):** Express, `cors()` open to every origin, optional static bearer token, `POST /sign {path, method, body}` → `createBuilderHeaderPayload`. **It signs anything.** Copying it as-is would make our relay a blind signing oracle for our builder identity.
- **What our relay should do instead (M, design):**
  1. Two options. (a) Implement the SDK contract at e.g. `POST /polymarket/builder-sign` and let the browser talk to the Relayer. (b) Make the relay forward the Relayer request itself (`POST /polymarket/relayer/submit` → adds headers → `relayer-v2`). Option (b) puts the validated body and the signed body in one place and removes a round-trip. Option (a) matches the SDK unchanged.
  2. Allowlist `(method, path)`:
     - `POST /submit` with `type ∈ {WALLET-CREATE, WALLET}` and `to == 0x00000000000Fb5C9ADea0298D729A0CB3823Cc07`;
     - `GET /v1/account/transactions/params`;
     - `GET /v1/account/transactions/<id>`;
     - `POST /v1/session-signers/authorizations` and `/revocations`.
  3. For `WALLET`, require every `calls[].target` to be in the trading set: pUSD `0xC011…2DFB` (`approve` to the three exchanges and the Neg Risk Adapter only), Conditional Tokens `0x4D97…6045` and PositionManager `0x006F…9fEF` (`setApprovalForAll`), the collateral adapters, the Onramp `0x9307…B8ee` (`wrap`), USDC.e `approve(Onramp)`, and the redeem targets. Allow `transfer` only to the visitor's own addresses, if at all.
  4. Rate-limit per `from` and per IP, because the 100 per day quota is shared.
  5. Require the caller to have proven control of `from` (a short signed challenge, or reuse the visitor's CLOB L1 signature). Otherwise anyone can make us deploy wallets for arbitrary addresses and burn the quota. Batches cannot be forged, since the wallet checks the owner signature on chain, but deploys need no signature.
- The SDK's `remoteBuilderSigning` also signs CLOB order POSTs whenever it is configured (`resolveClobHeaders`), which adds a round-trip to our relay per order. If we build orders ourselves (we do, `order.ts`), we simply do not add builder headers to CLOB calls.

---

## 3. CORS probes (2026-10-24, `Origin: https://xo-markets-explorer.vercel.app`, H)

| Endpoint | Preflight result | Actual GET result |
| - | - | - |
| `relayer-v2` `POST /submit` with `content-type,poly_builder_*` | 204, `ACAO: <our origin>`, `ACAC: true`, headers echoed | — |
| `relayer-v2` `POST /submit` with `content-type,relayer_api_key,relayer_api_key_address` | 204, same | — |
| `relayer-v2` `GET /v1/account/transactions/params` with `poly_builder_*` | 204 | 200 with `ACAO: <our origin>` |
| `relayer-v2` `POST /v1/session-signers/authorizations` with `idempotency-key,poly_builder_*` | 204 | — |
| `relayer-v2` `GET /deployed`, `/nonce`, `/transaction`, `/v1/account/transactions/<id>` | — | 200/404 with `ACAO: <our origin>` |
| `relayer-v2` with `Origin: https://example.invalid` and a made-up header | 204, origin and header **reflected** | — |
| `clob` `POST /order` with `poly_*` and also with `poly_builder_*` | 204, `ACAO: *`, max-age 30 days | — |
| `clob` `GET /auth/derive-api-key`, `POST /auth/api-key`, `GET /v1/user/session-signers` | 204, `ACAO: *` | `GET /time` 200 `ACAO: *` |
| `bridge` `POST /deposit` with `content-type,x-builder-code` | 204, `ACAO: *` | `GET /supported-assets` 200 `ACAO: *` |
| `polymarket.com/api/geoblock` | — | 200, `ACAO: *` |

Reading: the Relayer reflects any origin and any requested header, which is generic permissive CORS, so **browser calls are accepted**. A POST response's own `ACAO` was not observed, because POST is outside this task's allowed probes (M that it matches the GET responses). Nothing **has** to go through our server for CORS reasons. The server is needed only to keep the builder secret.

---

## 4. Order attribution: builder code (optional) vs builder headers (optional)

- Attribution = set the order's `builder` field (`bytes32`) to our builder code **before signing**. The default is 32 zero bytes (H, `place-orders.md` "Builder Attribution"). `OrderFilled` emits it. `GET https://clob.polymarket.com/builder/trades?builder_code=…` is public (H). Shipped `order.ts` currently sets `builder: ZERO32`, and `card.ts` labels it "none: no builder attribution".
- Required? **No.** "Include the builder code in every order you want attributed" (H). Builder fees are 0 by default, capped at 100 bps taker and 50 bps maker, with changes limited to once per 7 days and 3 days' notice. A disabled code makes the CLOB reject the order (H, `programs/builders/fees.md`). That last rule is a reason to ship the code behind a flag.
- `POLY_BUILDER_*` headers on `POST /order`: the CLOB preflight allows them. The SDK sends them when a builder key is configured, and `/data/orders` notes "Builder-authenticated clients can also use this endpoint to retrieve orders attributed to their builder account" (H, `clob-openapi.yaml`). **No doc says they are required for attribution or fees under CLOB V2** (searched `place-orders`, `fees`, `overview`, changelog, `clob-openapi` for `POLY_BUILDER`).

---

## 5. Session Keys (beta)

All H unless marked. Sources: `trading/session-keys.md`, SDK, `DepositWallet.sol`.

- **What:** an EOA that the Deposit Wallet owner authorises via `authorizeSessionSigner(address sessionSigner, uint256 validUntil)`, an `onlySelf` call inside an owner-signed `Batch`. It is stored on chain as `sessionSignerAuthorizedUntil(signer)`.
- **Scopes:** `CLOB`, `COMBOSRFQ`, or `["ALL"]` alone. Combos are refused for session keys in the SDK today ("Combos is not supported with Session Keys").
- **Expiry rule:** the docs say "Always set it to the current whole Unix timestamp in seconds plus 180 days. Other values are rejected", but their own Viem example and the SDK use `now + 4315 h` (179.8 days, `rC=4315*60*60`). So the relayer accepts some window below 180 days. **Exact accepted window: NOT FOUND** (searched the page, the SDK, the relayer spec). Re-authorise before expiry (one owner prompt about every 6 months).
- **Flow:**
  1. Generate a key in the browser.
  2. `GET …/params?type=WALLET` for the owner's nonce.
  3. Owner signs a `Batch` whose single call is `authorizeSessionSigner` on the wallet itself.
  4. `POST /v1/session-signers/authorizations` with builder HMAC.
  5. Poll the transaction.
  6. Poll `GET clob /v1/user/session-signers` with the **owner's** CLOB L2 headers, or read `sessionSignerAuthorizedUntil` on chain.
- **Using it:**
  - The session key does its own `ClobAuth` and derives its own L2 credentials (nonce 0).
  - Orders keep `maker = signer = <depositWallet>`, `signatureType 3`. The signature is the session key's `TypedDataSign` signature, wrapped as `abi.encode(bytes32(sessionSigner), bytes32(0), innerSig) ‖ 0x6492…6492`.
  - `POLY_ADDRESS` on the order POST is the **session key** address.
  - The SDK also lets a session key sign Relayer `WALLET` batches with the same envelope (`mr()`), for example the approval batch.
- **One-click trading: yes (M, from the flow).** Keep the session private key in the browser (IndexedDB, non-extractable where possible). After the single owner prompt, every order, every approval batch and every L2 credential derivation is signed locally with no wallet prompt.
- **"Cannot withdraw" is relayer policy, not contract code.** On chain, `execute` only forbids a session signer from calling the wallet itself (`SessionSignerSelfCallNotAllowed`), so it cannot add signers, transfer ownership or upgrade. A session-signed batch calling `pUSD.transfer(x)` would pass the contract. Only the relayer, the factory's sole operator, stops it (H for the code, M for the relayer rule). A stolen browser session key can therefore at worst place bad orders. That is the same risk class as a stolen CLOB key.
- **Gate:** "During the initial rollout, contact builder@polymarket.com to authorize your Builder API key for session-key management" (H). Until then, expect the authorisation endpoint to refuse our key (L: the refusal's exact error was not observable).
- **Amount or price caps on a session key: NOT FOUND** (unchanged from [37]).

---

## 6. Deposits: funding the Deposit Wallet from another chain

All H unless marked. Sources: `trading/bridge/deposit.md`, `supported-assets.md`, `bridge-openapi.yaml`, live `GET /supported-assets`.

- `POST https://bridge.polymarket.com/deposit {"address":"<depositWallet>"}` with optional `X-Builder-Code`. It returns one deposit address per family (`evm`, `svm`, `btc`, `tron`) plus a `note`. Assets sent there are bridged and swapped, then credited to the wallet as **pUSD** on Polygon (USDC or USDC.e is wrapped via the Collateral Onramp). Track with `GET /status/{address}`. Provider: Fun.xyz (changelog). CORS `*`, so call it from the browser; the builder code is not secret.
- **Live source chains (237 assets, 2026-10-24):** Ethereum (min $3 live; the docs say $7), Polygon, Arbitrum, Base, Optimism, BNB, HyperEVM, Hypercore, Ink, Monad, **Robinhood (4663, ETH only)**, Robinhood Lighter, Solana, Bitcoin (min $3.6 live; docs say $9), Lightning, Tron. Most minimums are $2. Docs: use DeBridge, Across or Portal for deposits over $50k from non-Polygon chains.
- **"Gasless" caveat (M):** the visitor still pays source-chain gas to send tokens to the bridge address, unless the funds come from an exchange withdrawal or from another wallet. A sign-only wallet cannot do that send at all. The cleanest instruction for it: "withdraw USDC from your exchange to this address". USDC.e that lands in the Deposit Wallet directly can be wrapped gaslessly with a `WALLET` batch `[USDC.e.approve(Onramp), Onramp.wrap(USDC.e, dw, amt)]` (Onramp `0x93070a847efEf7F70739046A929D47a521F5B8ee`, H, `concepts/pusd.md`).
- **Withdrawals back out** are `POST /withdraw`. They need a signed `transferErc20` batch to the returned address, also gasless (M; the withdraw page was fetched but not analysed beyond its endpoint).

---

## 7. CLOB L1/L2 and Deposit Wallet ownership for EIP-7702 EOAs and smart accounts

- **The Deposit Wallet owner check is ECDSA only (H).** Source: Sourcify `exact_match` for implementation `0x58CA52ebe0DadfdF531Cde7062e76746de4Db1eB`, which `@polymarket/client` names as `depositWalletImplementation`.
  - `isValidSignature` resolves the signer (the session signer from the envelope, else `owner()`). `_erc1271IsValidSignatureNowCalldata` returns `ECDSA.tryRecoverCalldata(hash, sig) == signer`, with the comment "always ECDSA, regardless of signer.code.length".
  - Batches from the factory use the direct path (`_erc1271CallerIsSafe` = `msg.sender == factory()`). Orders checked by the exchange use Solady's nested ERC-7739 path, with ECDSA at the bottom.
  - The beacon `0x7A18…c3a` is Sourcify `exact_match`. **The implementation that beacon currently points to was not read** (needs `eth_call`, outside allowed probes), so this is M for wallets deployed after 2026-06-29.
- **EIP-7702-upgraded EOA as owner: should work (M).** The address and private key are unchanged, the wallet's id is `bytes32(signer)`, and ECDSA recovery does not care about delegated code. Gotcha: some 7702 "smart account mode" wallets answer `eth_signTypedData_v4` with an ERC-1271 or ERC-6492-wrapped signature instead of the raw EOA signature. That fails.
- **ERC-1271 smart account (Safe, Kernel, Coinbase Smart Wallet passkey) as owner: does not work (H from code).**
  - Nothing it can produce is an ECDSA signature by its own address.
  - An ERC-6492-wrapped signature ends with the same `0x6492…` magic that `SessionSignerLib.extractSessionSigner` uses. The wallet would read the first 32 bytes (the 6492 factory address) as a "session signer" and revert `SessionSignerUnauthorized`.
  - `WALLET-CREATE` for such an address would still deploy (no signature needed). Funds sent there could leave only by the owner contract calling `pause()`, waiting `timelockDelay()`, then `withdrawERC20` directly on chain with gas (H, `DepositWallet.sol` `onlyOwner` uses `msg.sender`). **The dApp must refuse to deploy for an address that has code and is not a 7702 delegation** (check `eth_getCode` for a `0xef0100` prefix).
- **CLOB L1 (`ClobAuth`) for a contract signer: NOT FOUND** (searched `wallets-auth`, `getting-started/api`, `llms-full` for `1271`, `7702`, `smart account`, `isValidSignature`). The docs only say "Sign with the signer that controls `<signer_address>`". The session-key path avoids the question, because the session key is always a fresh EOA. But authorising it needs an ECDSA owner signature anyway.
- **Gotchas in the current shipped code:**
  - `maker.ts` already refuses a Deposit Wallet whose `owner()` is not the connected wallet. It does not refuse a connected wallet that is itself a contract.
  - `funding.ts` says a Deposit Wallet's approvals "are that contract's own transactions: the page says so and builds none". The Relayer `WALLET` batch now fills exactly that gap.
  - The wallets-auth page still lists Neg Risk Adapter `0xd91E…5296` for approvals, while the 2026-07-14 changelog says relayer calls to "the CLOB v1 Neg Risk Adapter" at that address are retired in favour of `0xadA2…eAab`. The contracts page reconciles the two (`0xd91E…` = approvals target, a different contract from `NegRiskCtfCollateralAdapter` `0xadA2…`), and the SDK's production config carries both (H). Keep both, as the contracts page says.

---

## 8. Geoblock and where calls originate

- "Orders submitted from blocked regions will be rejected" (H, `api-reference/geoblock`). AWS eu-north-1 (Sweden, `SE`) is in none of the three restricted tables (H). Proxying CLOB orders through our relay would therefore make blocked or close-only visitors look like Sweden. That is circumvention, so keep order POSTs in the browser and run `GET https://polymarket.com/api/geoblock` from the browser first (CORS `*`, H).
- Relayer calls carry the visitor's IP when sent from the browser (option 2a), or ours when forwarded (option 2b). **Whether the Relayer applies the geoblock: NOT FOUND** (searched the relayer spec, wallets-auth, geoblock page).

---

## 9. The flow, step by step (what to build)

1. **Connect** any EVM wallet (injected or WalletConnect) on chain 137 for typed data. No chain switch is needed for signing alone, though some wallets insist on it.
2. **Geoblock check** in the browser. Refuse to open new positions if `blocked`.
3. **Resolve account** (existing `maker.ts`). If there is no Deposit Wallet and no Safe, and the address has no non-7702 code, take the **new Deposit Wallet** path.
4. **Deploy:**
   - The browser asks our relay to deploy. The relay checks a control proof, then signs or forwards `POST /submit {"type":"WALLET-CREATE","from":<signer>,"to":<factory>,"metadata":"Deploy Deposit Wallet"}` with builder HMAC.
   - Poll `GET /v1/account/transactions/<id>` until `STATE_CONFIRMED`; read `proxyAddress`.
   - **Zero wallet prompts.**
5. **CLOB L1 → L2** for the owner: one `ClobAuth` prompt (already shipped). Skip it if a session key will do all CLOB work and on-chain polling replaces `/v1/user/session-signers`.
6. **Session key** (only once Polymarket authorises our builder key):
   - Generate the key in the browser.
   - One owner `Batch` prompt (`authorizeSessionSigner`, `validUntil = now + 4315 h`).
   - Our relay HMACs `POST /v1/session-signers/authorizations`.
7. **Approvals:**
   - One `WALLET` batch with the up to 8 approvals from `wallets-auth.md` (pUSD → V2 Exchange, Standard, Neg Risk, Neg Risk Adapter; `setApprovalForAll` on PositionManager → V2, Conditional Tokens → Standard, Neg Risk, Adapter), skipping those already set.
   - Signed by the session key (no prompt) or by the owner (one prompt). Relay HMACs `POST /submit`.
   - Then `GET clob /balance-allowance/update` with `signature_type=3` (L2 headers, browser).
8. **Fund:** `POST bridge /deposit {"address":<depositWallet>}` from the browser with `X-Builder-Code`. Show the `evm`, `svm`, `btc` and `tron` addresses, the live minimums and `GET /status/{address}`.
9. **Trade:**
   - Build the order with `maker = signer = depositWallet`, `signatureType 3`, `builder = <our code>` (flagged).
   - The session key signs it (no prompt) or the owner signs it (one prompt per order).
   - `POST clob /order` straight from the browser.
10. **Redeem, merge, withdraw:** a `WALLET` batch with the adapter or Router call, or `transferErc20` to the bridge `/withdraw` address. Relay HMACs `POST /submit`.

**Proxied or signed server-side:** every Relayer write and the session-signer endpoints (builder HMAC). Optionally the Relayer reads, to keep one code path.
**Never proxied:** CLOB (`/auth/*`, `/order`, `/balance-allowance/update`, `/v1/user/session-signers`), Bridge, geoblock.

---

## 10. Open unknowns that need a live, signed test

1. A `WALLET-CREATE` with our Unverified builder key for a fresh EOA reaches `STATE_CONFIRMED`, and the address matches the beacon CREATE2 derivation in `maker.ts`.
2. A `WALLET` approvals batch signed by a **browser wallet over WalletConnect** (sign-only, e.g. PayBox) is accepted. This includes `chainId 137` in the domain, `uint256` values as strings, and the nested `Call[]` array, which some wallets render or encode badly.
3. The Relayer's actual POST responses carry `ACAO` for our origin (preflight says yes; POST not probed).
4. The session-key authorisation with our builder key, before and after the builder@polymarket.com rollout approval: the error shape when not yet authorised, and the accepted `validUntil` window.
5. Whether the relayer refuses a session-signed `transfer` batch, which is the "cannot withdraw" claim.
6. CLOB L1 and order signatures from a 7702-delegated EOA, in the wallets we expect (MetaMask smart account mode, Ambire, Rabby), and whether any of them returns a wrapped signature.
7. Whether the 100 per day limit is per key or per profile, and whether deploys count.
8. Whether the CLOB accepts a `signatureType 3` order from a wallet whose deploy went through **our** builder key while the visitor never logged into polymarket.com. The docs imply yes ("Create New Accounts"); [37] left it open.
9. The current beacon implementation's signature code (one `eth_call` to `implementation()` on the beacon, then a Sourcify GET).
