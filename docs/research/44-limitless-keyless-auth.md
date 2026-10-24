# 44. Trading on Limitless from the hosted dApp with only the visitor's wallet signature (no visitor API key)

Status: read-only research, 2026-10-24, branch `build/xo-paybox-plugin`. Nothing was built or committed. I made GET requests and CORS preflights (OPTIONS) only. I did not POST to any third party, create an account, sign anything or use any credential. User-Agent `insurance-markets-research/0.1`, requests about 0.5 s apart. Published tarballs and fetched pages went into a scratch directory and were only read and grepped.

Constraint this note serves (product owner, binding): **the visitor must never paste or create a Limitless API key.** Our setup is a static dApp (`https://xo-markets-explorer.vercel.app`) plus our own server relay (the AWS markets API). The relay can make server-side HTTP calls and hold **our** operator secrets. It never holds a user's private key. Today `api/limitless-relay.ts` forwards HMAC headers that the **visitor's own** scoped token produced, which breaks this constraint.

Confidence tags: **H** = I read it first-hand in a primary source this session or measured it live (URL or probe given). **M** = secondary or inferred from H facts. **L** = guess. **NOT FOUND (searched: ...)** is meant literally. Source ids: `[LLM]` = `docs.limitless.exchange/llms-full.txt` (1,085,472 bytes, fetched 2026-10-24); `[OAS]` = `docs.limitless.exchange/openapi.json` (445,033 bytes); `[SDK]` = npm `@limitless-exchange/sdk@1.3.0` (published 2026-10-20), `dist/index.js`; `[SRC]` = Sourcify v2 source of the Limitless `CTFExchange` at `0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5` (Base); `[WEB]` = limitless.exchange home page plus its 61 `/_next/static` JS chunks; `[PRIVY]` = `auth.privy.io/api/v1/apps/<id>` (public GET) and `docs.privy.io/llms-full.txt`; `[37]` = `docs/research/37-aa-venue-accounts.md`.

## 0. Bottom line

1. **There is a supported keyless-for-the-visitor path: the Programmatic API's "EOA (Web3 partners)" sub-account mode.** We, the operator, hold one partner scoped HMAC token on the relay. The visitor's wallet signs exactly two kinds of thing: (a) once per wallet, a plain-text ownership message (`personal_sign`) that registers the wallet as our sub-account; (b) one EIP-712 `Order` per order. The relay then submits `POST /orders` with **our** HMAC headers and `onBehalfOf = ownerId = <sub-account profileId>` (H, `[LLM]` programmatic-api "EOA (Web3 partners)", create-order "ownerId must match"). Limitless's own docs draw this exact layout for "Browser + backend" (H). The visitor never sees a token, and our server never sees a key.
2. **It needs an operator credential that needs approval.** A plain self-serve token carries `trading` only. `account_creation` (to register sub-accounts) and `delegated_signing` (needed even in EOA mode, to **cancel** and **read** a sub-account's orders and positions) appear only after Limitless approves a partner application (H, `[LLM]` get-capabilities: "Partner-level scopes ... only appear in `allowedScopes` after your account is approved"; cancel: "This on-behalf-of path additionally requires the `delegated_signing` scope ... it works for EOA sub-accounts that signed their own orders"). The programmatic-api page says "`trading` and `account_creation` are sufficient for EOA partner flows". That holds for placing orders only; the cancel and read pages contradict it (H, both quoted).
3. **Hard limit: a wallet that already has a Limitless profile cannot become our sub-account.** `POST /profiles/partner-accounts` returns `409` "if a profile already exists for the target address", and "there is no endpoint that links or adopts an existing one. Such users ... are not reachable through `onBehalfOf`" (H, `[LLM]` programmatic-api). So anyone who has ever signed in at limitless.exchange is outside this path. Corollary (M): our relay must **never** call the legacy `POST /auth/login` for a wallet before registering it, because a login probably creates a profile (its body takes `client` and a referral code `r`, H `[OAS]` `CreateUserDto`). That would lock the wallet out of the partner path for good.
4. **The other wallet-signature-only paths are closed or unsuitable.**
   - Privy SIWE to `POST /auth/api-tokens/derive` is closed to our origin: our origin is not among Limitless's Privy app's 21 `allowed_domains`, and a captcha is on (H, `[PRIVY]`). A server could only do it by forging Limitless's `Origin`. That would be impersonation, so I rule it out. It would also produce the user's own API token, which is the thing the product owner banned.
   - Legacy `GET /auth/signing-message` plus `POST /auth/login` is still live (signing message 200, `/auth/verify-auth` 401 "The token cookie is required", H measured). But `[OAS]` lists `POST /orders` as `HmacAuth` only, and the docs say "There is no keyless programmatic path" (H, `[LLM]` eip712-signing). So no source says a session cookie can place an order. Only a live signed test can settle it, and it carries the profile-creation risk in point 3.
   - The Limitless MCP OAuth server is real and open to dynamic client registration (section 3.4). But every order needs the user to approve it on limitless.exchange, it requires the user's trading wallet to be the Limitless Wallet (not their own EOA), and it is documented for AI assistants. It is a hand-off, not in-dApp trading.
5. **CORS: api.limitless.exchange refuses every preflight from our origin (404, no `access-control-*`), on every auth, trading, partner and OAuth endpoint I tried. It answers 200 with credentials for `https://limitless.exchange`** (H measured, section 5). So everything authenticated must go through our relay anyway. That fits point 1, because the partner token must stay server-side regardless.
6. **Smart accounts.** At the contract, `signatureType 0` is pure ECDSA with `signer == maker` and **no code-size check**, so an EIP-7702-upgraded EOA still verifies as type 0 (H, `[SRC]`). Type 3 (ERC-1271) checks `IERC1271(maker)` (H, `[SRC]`, also `[37]`). At the gateway, `[OAS]` accepts `signatureType` 0 to 3 in the schema, but the docs only describe type 0 for self-signed orders, and `maker`/`signer` are checked against the profile's trading mode. The partner EOA flow says "`maker` and `signer` must be the user's EOA address" (H). Whether a contract-account maker passes the gateway: NOT FOUND, live test only.
7. **Gas.** Limitless sponsors gas only for wallets it manages: the Limitless smart wallet ("Platform sponsors gas", H `[LLM]` wallet-types) and partner server wallets (Privy-sponsored user operations; the SDK has an error constant `PrivySponsorshipUnavailable`, H `[SDK]`). For partner **EOA** sub-accounts, gas sponsorship is NOT FOUND (searched: programmatic-api, wallet-types, venue-system, changelog, SDK). The visitor pays the one-time approvals in Base ETH, unless we sponsor them ourselves, for example with EIP-7702 plus our own paymaster (M, given point 6).

**Recommendation:** apply for partner access; build the EOA sub-account relay (section 4); for wallets that get `409`, fall back to a referral deep link to limitless.exchange; ask Limitless in the Builders Chat the three questions in section 7.

## 1. Method and sources

- **Docs (H):** `llms.txt` (190 lines) and `llms-full.txt`, sections read in full: `developers/programmatic-api`, `developers/authentication`, `developers/eip712-signing`, `developers/mcp-server`, `api-reference/trading/create-order`, `api-reference/trading/cancel`, `api-reference/partner-accounts/*`, `api-reference/api-tokens/*`, `api-reference/auth/*`, `user-guide/wallet-types`, `user-guide/embed-markets`, the changelog (2026-05-28 to 2026-10-19).
- **OpenAPI (H):** `docs.limitless.exchange/openapi.json` (also linked from `llms.txt`), server `https://api.limitless.exchange`. Security schemes: `HmacAuth` (`lmts-api-key`), `cookie` (`limitless_session`, "obtained from /auth/login"), `bearer` (JWT). The spec's top-level description still carries an old note: "Cookie-based session authentication is deprecated and will be removed within weeks."
- **SDK (H):** `@limitless-exchange/sdk@1.3.0` tarball. `PartnerAccountService.createAccount(input, eoaHeaders)` sends `x-account`, `x-signing-message`, `x-signature`. `SignatureType` enum is `EOA=0, POLY_PROXY=1, POLY_GNOSIS_SAFE=2` (no 3). `SIGNING_MESSAGE_TEMPLATE` is an older text than the live one (section 2.1).
- **Contract (H):** `[SRC]` `project/contracts/exchange/mixins/Signatures.sol`.
- **Web app (H):** `[WEB]` bundle. The axios instance that posts `/orders` adds `Authorization: Bearer <Privy access token>` and `Identity: Bearer <Privy identity token>` (chunk with "JWT: Request interceptor"), plus `x-region: eu` on order and cancel calls. Privy app id `cm5pgksxs05f9428uup8tuyd4`. Routes `/mcp-connect` and `/mcp-approve` exist.
- **Privy (H):** `GET auth.privy.io/api/v1/apps/cm5pgksxs05f9428uup8tuyd4` (public; the SDK fetches it). Privy docs "Allowed domains" and the `invalid_origin` error.
- **GitHub (H):** `api.github.com/orgs/limitless-labs-group/repos`: TS, Python, Go and Rust SDKs, `agents-starter`, `limitless-cli`, `limitless-ctf-exchange`. No partner or dApp sample repo. The docs say so too: "There is no official Next.js sample app in the public GitHub org today".
- **Live probes (H):** listed in sections 2.1 and 5. No request carried a credential.

## 2. Every auth path that needs only a wallet signature

### 2.1 Legacy wallet login: `GET /auth/signing-message`, then `POST /auth/login` (session cookie)

| Item | Finding | Tag |
| - | - | - |
| `GET /auth/signing-message` | **Live.** `200 text/plain` with the body "Welcome to Limitless Exchange!\n\nThis request will not trigger a blockchain transaction or cost any gas fees.\n\nSignature is required to authenticate an upcoming API request.\n\nNonce: 0x<64 hex>". No auth. `[OAS]` still shows the older "Welcome to Limitless.exchange! Please sign this message..." example, and so does the SDK template. **Sign the live text, not a template.** | H (probe 2026-10-24) |
| `POST /auth/login` | In `[OAS]`: headers `x-account` (address), `x-signing-message`, `x-signature`; body `CreateUserDto {client: "eoa"\|"etherspot"\|"base" (required), smartWallet?, r? (referral)}`; `200` sets the session cookie and returns `{account, displayName, smartWallet, client}`; `400` "Smart wallet is required"; `500` "Error creating JWT token". Absent from `llms.txt` and the human docs: only logout and api-keys are listed under `auth`. | H (`[OAS]`); not POSTed |
| `GET /auth/verify-auth` | **Live**, `401 {"message":"The token cookie is required"}` without a cookie. So the cookie-session middleware is still deployed. | H (probe) |
| Header encoding | For `/profiles/partner-accounts`, `x-signing-message` is the **hex-encoded UTF-8** of the message (`0x...`), `x-signature` is the `personal_sign` hex, and `x-account` is EIP-55 checksummed. `/auth/login` probably uses the same convention (same header names, same controller family). | H for partner-accounts (`[LLM]`); M for login |
| Session usable for orders? | `[OAS]` `POST /orders` security: `HmacAuth` only. Docs: "There is no keyless programmatic path: you must still HMAC-sign every API request, including `POST /orders`." The changelog says cancel and cancel-replace accept "HMAC (`apiToken`), Privy, and session". The web app itself posts `/orders` with **Privy** bearer tokens, not the session cookie. Whether `limitless_session` from `/auth/login` is accepted on `POST /orders`: **NOT FOUND** (searched: `[OAS]` security, create-order, authentication, changelog). | H (absence of a positive statement); acceptance unknown |
| Bearer instead of cookie | `[OAS]` defines `bearer` (JWT, "alternative to cookie auth") and uses it on `GET /portfolio/*` and `/markets/{slug}/get-feed-events`. Whether `/auth/login` returns a usable bearer, or only `Set-Cookie`: NOT FOUND. | H / NOT FOUND |
| Rate limit | `OPTIONS /auth/login` with `Origin: https://limitless.exchange` answered **429** while every other path answered 200, so this path has its own tight limiter. | H (probe) |

Verdict: alive, but not documented for trading. It would make our server hold a user session (not an API key, but a bearer credential for the user's whole account). It may create a Limitless profile and so close the partner path (section 0, point 3). Use it only as a last-resort test.

### 2.2 Privy SIWE identity token, then `POST /auth/api-tokens/derive`

| Item | Finding | Tag |
| - | - | - |
| Endpoint | `POST /auth/api-tokens/derive`. Header `identity: Bearer <Privy identity token>` (the `token` field of Privy's authenticate response, "not `privy_access_token`"). Body `{label?, scopes?}`; default scope `["trading"]`. Returns `{tokenId (apiKey), secret}` once. | H (`[LLM]` derive-token) |
| Privy app | `cm5pgksxs05f9428uup8tuyd4`, name "Limitless Exchange", `wallet_auth: true`, `captcha_enabled: true` (Turnstile), `smart_wallet_config.enabled: false` (Limitless runs its own smart wallets), embedded wallets created for all users. | H (`[WEB]`, `[PRIVY]`) |
| Origin allowlist | `allowed_domains` has 21 entries: limitless.exchange, limitless.markets, uefa.limitless.exchange, Limitless dev, UAT, pre-prod and mobile hosts, a few Limitless preview and campaign Vercel apps, and localhost ports. **Our origin is not listed.** Privy docs: allowed origins "restrict which domains are allowed to use your Privy app ID", and a request from elsewhere fails with `invalid_origin`. | H |
| CORS on Privy | `OPTIONS auth.privy.io/api/v1/siwe/init` reflects **any** origin (204 for ours too). The allowlist is enforced on the real request, not at preflight. | H (probe); enforcement M (Privy docs) |
| From our server? | Privy docs: the allowlist governs "client-side access"; backends use the app **secret**, which only Limitless holds. A server can only pass the client-side check by sending a forged `Origin: https://limitless.exchange`. **Ruled out**: it impersonates Limitless, would likely breach the terms, has to beat the captcha, and still yields the user's own `trading` token, which is what the product owner banned. | H (docs) / judgement |

Verdict: not usable by a third-party dApp.

### 2.3 Other wallet-signature paths

- **Partner EOA registration** (`x-account`/`x-signing-message`/`x-signature` on `POST /profiles/partner-accounts`): the one supported path. See section 3.
- **MCP OAuth** (`limitless.exchange/mcp-connect`): the user logs in on limitless.exchange (Privy). That is a wallet signature, but at Limitless's origin. See section 3.4.
- **Legacy static `X-API-Key`**: "deprecated and no longer available for new users" (H, `[LLM]` authentication).
- **Wallet-signed requests without a token** (some `x-account` + signature variant on `/orders`): NOT FOUND (searched: `[OAS]` all 101 operations' parameters, authentication, create-order).

## 3. Orders without a visitor key

### 3.1 Partner EOA sub-account (recommended)

Steps, from `[LLM]` programmatic-api "EOA (Web3 partners)" and the API reference (all H unless tagged):

1. **Operator bootstrap (once).** Sign in at limitless.exchange with an operator wallet, which creates our partner `profileId`. Apply with the Google form linked from programmatic-api ("Apply only if **other users** will trade through your platform"); the get-capabilities page names `help@limitless.network`. After approval, derive a token with `scopes: ["trading","account_creation","delegated_signing"]` through the UI's API token modal. That is the operator's own Privy session at limitless.exchange, so no Privy integration on our side is needed. Store `tokenId`/`secret` on the relay only.
2. **Register the visitor's wallet (once per address).** The relay does `GET /auth/signing-message`, because the browser cannot read it cross-origin. The browser has the wallet `personal_sign` the exact text. The relay sends:
   ```
   POST /profiles/partner-accounts
   lmts-api-key: <our tokenId>   lmts-timestamp: <ISO-8601>   lmts-signature: <base64 HMAC>
   x-account: <EIP-55 wallet>    x-signing-message: 0x<hex(utf8(message))>   x-signature: 0x<sig>
   content-type: application/json
   {"displayName": "<optional, <=44 chars>"}
   ```
   It returns `{profileId, account}`. `409` means a profile already exists for that address, which is either ours (recover it with `GET /profiles/partner-accounts?account=<addr>`, HMAC, `account_creation`) or someone else's (not reachable; fall back). The relay should store `wallet -> profileId`.
3. **Order.** The browser builds the EIP-712 order (domain `{name: "Limitless CTF Exchange", version: "1", chainId: 8453, verifyingContract: venue.exchange}`; type `Order(uint256 salt,address maker,address signer,address taker,uint256 tokenId,uint256 makerAmount,uint256 takerAmount,uint256 expiration,uint256 nonce,uint256 feeRateBps,uint8 side,uint8 signatureType)`) with `maker = signer = wallet`, `taker = 0x0`, `nonce = 0`, `expiration = 0`, `signatureType = 0`, and `feeRateBps = 0` on new venues (`venue.feeModuleType == "COLLATERAL"`). The relay then sends:
   ```
   POST /orders            (our HMAC headers over "/orders" and the exact body)
   {"order": {salt, maker, signer, taker, tokenId, makerAmount, takerAmount, expiration:"0", nonce:0,
              price (GTC/FAK only), feeRateBps, side, signature, signatureType:0},
    "ownerId": <profileId>, "onBehalfOf": <profileId>, "orderType": "GTC"|"FAK"|"FOK",
    "marketSlug": "<slug>", "postOnly"?: bool, "clientOrderId"?: str, "stpPolicy"?: str}
   ```
   `CreateOrderDto` has `additionalProperties: false`, and `ownerId`, `order`, `orderType`, `marketSlug` are required (H, `[OAS]`). Leave out `timestamp`: the server applies a 2000 ms default receive window to client timestamps, and the relay hop adds latency (H, `[OAS]` `recvWindow`). Errors to handle: `400 "Signer does not match authenticated profile account"` (wrong `ownerId`/`onBehalfOf`); `400 "Signer does not match - you should use embedded address for smart wallet"` (profile in `smartWallet` mode); `400 {"code":"FEE_RATE_MISMATCH","expectedFeeRateBps":n}` on legacy fee markets, where the partner cannot read the sub-account's rate and must re-sign with `n`; `400 "Insufficient collateral allowance for the order fee."` (missing USDC approval to `venue.feeModule`); `425` (receive window or maintenance).
4. **Cancel and read** (needs `delegated_signing`): `POST /orders/cancel?onBehalfOf=<profileId>` (sign the path **with** the query), `GET /markets/{slug}/user-orders`, `GET /portfolio/positions`, `GET /portfolio/history`, `POST /orders/status/batch`, `GET /v2/orders/status/:id`, each with header `x-on-behalf-of: <profileId>`. `POST /heartbeats` does **not** accept on-behalf-of.
5. **Approvals (on-chain, from the visitor's EOA, visitor pays gas):** USDC to `venue.exchange` (BUY); CTF `setApprovalForAll` to `venue.exchange` (SELL), plus `venue.adapter` for NegRisk; USDC to `venue.feeModule` on new venues for any non-`postOnly` order (H, `[OAS]` description and create-order). "Server wallets are approved for you", EOA sub-accounts are not (H, changelog 2026-10-14).

What each party holds:

| Holder | Holds | Can do alone |
| - | - | - |
| Visitor | wallet key | sign the registration message; sign each order |
| Our relay | partner `tokenId`/`secret` (scopes `trading`, `account_creation`, `delegated_signing`) | register a wallet **only with** the visitor's signature; submit an order **only with** the visitor's EIP-712 signature; **cancel any sub-account's orders and read its orders and positions without any visitor signature** (M from the cancel docs: cancel "is not EIP-712 signed") |
| Limitless | nothing of ours | n/a |

Design consequences (M): (a) the relay must require its own visitor-signed intent before it cancels for someone, otherwise our credential lets us cancel for any of our users; (b) if the partner token leaks, an attacker can cancel orders and read portfolios for all our sub-accounts, but cannot place orders or move funds for EOA sub-accounts; (c) the relay should check that `order.maker == order.signer ==` the registered wallet for `onBehalfOf`, and should never forward a body without a signature (that would be a delegated unsigned order, valid only for server-wallet sub-accounts, but still worth refusing).

### 3.2 Server wallet plus delegated signing (not "the user's wallet")

`createServerWallet: true` makes Limitless create a Privy server wallet for the sub-account. The relay submits **unsigned** orders and Limitless signs them, swapping in the server wallet as `maker`/`signer` (H). Approvals and gas are sponsored for these wallets (H, changelog and SDK error codes). But the funds sit in a wallet Limitless manages on **our** instruction. Withdrawals go only to "the partner's own account, partner smart wallet, or an active allowlisted treasury destination", and that allowlist is managed with a Privy identity token (H, `[LLM]` withdraw, wallet-types). The user's own wallet can neither withdraw directly nor be the destination unless we allowlist it. That makes us the custodian in practice (M). It does not meet "trade with their wallet" and creates custody and regulatory exposure. Not recommended.

### 3.3 Session cookie (only if a live test shows it works)

If `POST /orders` turns out to accept `limitless_session` (or a bearer) from `/auth/login`, the body would be the self-signed form: `ownerId` = the user's own profile id from `GET /profiles/me`, and no `onBehalfOf`. This path covers wallets that already have a profile, which the partner path cannot. Costs: the relay holds a session credential for the user's whole account, the path is deprecated, it has a tight rate limit, and it may create a profile. The profile must be in `eoa` mode; switching is `PUT /profiles {"tradeWalletOption":"eoa"}`, which also changes how the user trades in the Limitless app (H, `[LLM]` eip712-signing).

### 3.4 MCP OAuth hand-off (keyless, but not in-dApp)

| Item | Finding | Tag |
| - | - | - |
| Discovery | `/.well-known/oauth-protected-resource` gives resource `https://api.limitless.exchange/mcp`, scope `trading`. `/.well-known/oauth-authorization-server` gives `authorization_endpoint https://limitless.exchange/mcp-connect`, `token_endpoint .../mcp/oauth/token`, `registration_endpoint .../mcp/oauth/register` (dynamic client registration), `token_endpoint_auth_methods_supported ["none"]` (public clients), PKCE `S256`, grants `authorization_code`, `refresh_token`. | H (probe) |
| Behaviour | Access tokens last 1 h; the grant lasts 30 days, scope `trading`; there is no withdraw tool. `place_orders` returns an `approvalUrl`, and "Nothing is submitted until you open the link and approve" on limitless.exchange; up to 10 orders per approval; proposals expire in 10 min; at most 50 proposals per 10 min. Cancels execute directly. | H (`[LLM]` mcp-server) |
| Wallet requirement | The user's trading wallet must be the **Limitless Wallet** (smart-wallet mode, gas sponsored). External-wallet mode makes writes fail with "Write actions require the user to select their Limitless Wallet". | H |
| CORS | `OPTIONS /mcp/oauth/token` and `/mcp/oauth/register` return 404 for our origin (and for `https://claude.ai`), so only a server-side client works. | H (probe) |
| Use from our relay | Technically possible: register a client, send the user to `mcp-connect`, keep the tokens server-side, call `tools/call place_orders`, then open `approvalUrl`. Whether DCR accepts an `https://` redirect URI on our domain, and whether Limitless accepts a dApp, not an AI assistant, as a client: NOT FOUND. The docs frame it as "conversational ... with a human confirming every order". | M / NOT FOUND |

Verdict: a legitimate fallback for users who already have a Limitless profile, but every order leaves our page. A plain deep link with our referral code (`?via=` / referral program, 10% to 40% of referred fees, H `[LLM]` embed-markets) gives most of the same result with no OAuth. Ask Limitless before building on MCP.

## 4. What this means for `api/limitless-relay.ts` (proposal, not applied)

- **Switch the credential:** stop forwarding visitor `lmts-*` headers. Sign every upstream call with the operator partner token, held in the relay's secrets the same way as other operator secrets.
- **New routes:** `GET signing-message` (proxied, no auth); `POST register` (browser sends `{account, signature, messageHex}`, relay adds HMAC and calls `POST /profiles/partner-accounts`, stores `account -> profileId`, recovers on 409 via `GET /profiles/partner-accounts?account=`); `POST order` (browser sends the signed `order` plus `orderType`/`marketSlug`/`postOnly`/`clientOrderId`, relay fills `ownerId`/`onBehalfOf` from its own mapping, never from the browser, and checks `maker == signer == account` and `signatureType == 0`); `POST cancel` (requires a visitor-signed cancel intent that the relay verifies before using our `delegated_signing` credential); reads with `x-on-behalf-of`.
- **Keep:** origin allowlist, size caps, no retry on `POST /orders` (a timeout may have taken effect; dedupe is by `clientOrderId` or by order hash, which gives `409`), logs without bodies or headers.
- **UI:** detect `409`-foreign (the wallet already has a Limitless profile) and offer the deep link. Show the one-time approvals with their gas cost, or sponsor them (section 6).

## 5. CORS, measured 2026-10-24

Preflight `OPTIONS` with `Access-Control-Request-Method` (and `-Headers` where the route needs them) to `https://api.limitless.exchange`:

| Path (method) | `Origin: https://xo-markets-explorer.vercel.app` | `Origin: https://limitless.exchange` |
| - | - | - |
| `/auth/signing-message` (GET) | 404, no ACAO | 200, ACAO echoed, credentials true, max-age 86400 |
| `/auth/login` (POST) | 404 | **429** (rate limited) |
| `/auth/verify-auth` (GET) | 404 | 200 |
| `/orders` (POST, with and without `lmts-*` headers) | 404 | 200 |
| `/orders/<uuid>` (DELETE) | 404 | 200 |
| `/profiles/partner-accounts` (POST) | 404 | 200 |
| `/auth/api-tokens/derive` (POST), `/auth/api-tokens/capabilities` (GET) | 404 | 200 |
| `/profiles/me` (GET), `/profiles` (PUT) | 404 | 200 |
| `/markets/active` (GET) | 404 | 200 |
| `/mcp` (POST) | 404 | 200 |
| `/mcp/oauth/token`, `/mcp/oauth/register` (POST) | 404 (also 404 for `https://claude.ai`) | not probed |
| `https://api.limitless.markets/orders` (POST) | 404 | not probed |

Simple GETs without a preflight (`/auth/signing-message` with our `Origin`) return 200 with `vary: Origin` and **no** `access-control-allow-origin`, so a browser cannot read them. This matches the 2026-10-23 measurement quoted in `api/limitless-relay.ts`. Privy's API, by contrast, reflects any origin at preflight (section 2.2).

## 6. Smart wallets and gas

| Question | Finding | Tag |
| - | - | - |
| Contract `signatureType` | `enum {EOA, POLY_PROXY, LIMITLESS_SAFE, ERC1271}`. EOA: `signer == maker && ECDSA.recover(hash) == signer` (a `pure` function, so no `extcodesize`). LIMITLESS_SAFE: ECDSA plus `getSafeAddress(signer) == maker`. ERC1271: `IERC1271(maker).isValidSignature(hash, sig) == 0x1626ba7e`. POLY_PROXY: ECDSA plus proxy derivation. | H (`[SRC]`) |
| EIP-7702-upgraded EOA | Still an ECDSA key at the same address, so type 0 verifies at the contract. The gateway checks `maker`/`signer` against the profile `account`, which stays the EOA address. Expected to work. Not tested. | M |
| Kernel or Safe account as maker | Contract: yes, via type 3. Gateway: `[OAS]` schema allows 0 to 3, but the docs describe only type 0 for self-signed orders, and partner EOA mode requires `maker`/`signer` = "the user's EOA address". Whether registration accepts an ERC-1271 ownership signature for a contract `x-account`: NOT FOUND (searched: partner-accounts, authentication, `[OAS]`, `[SDK]`). | H / NOT FOUND |
| Profile modes | `tradeWalletOption`: `eoa` (maker = signer = account) or `smartWallet` (maker = the Limitless smart wallet, signer = the embedded Privy key, which cannot be exported). `[OAS]` login `client` enum: `eoa`, `etherspot`, `base`. The web bundle treats `client == "etherspot"` with a smart wallet as smart-wallet mode. | H |
| Gas sponsored by Limitless | Limitless smart wallet: yes ("Platform sponsors gas", "Limitless Safe wallets do not need ETH"). Partner server wallets: yes (Privy-sponsored user operations; `PrivySponsorshipUnavailable` error). External EOA, including partner EOA sub-accounts: **no** (EOA row: "You pay gas in ETH"; "external EOA wallets need a small Base ETH balance"). | H |
| Our own sponsorship | Approvals are ordinary ERC-20 `approve` and ERC-1155 `setApprovalForAll` calls from the EOA. With EIP-7702 delegation to a 4337 account and our paymaster, we could pay them without changing the order path (type 0 stays valid). Cost: one-off approvals per exchange, adapter and fee module. | M |

## 7. Open questions only a live signed test (or Limitless) can settle

1. **Does our application get `account_creation` + `delegated_signing`?** Partner status is a manual review. Ask in the Builders Chat (`t.me/LimitlessBuildersChat`) whether a public multi-venue dApp qualifies, and whether existing-profile wallets (`409`) can ever be linked.
2. **Partner EOA end to end:** register a fresh test wallet, place a `postOnly` GTC with `onBehalfOf`/`ownerId`, then cancel with `?onBehalfOf=`. Confirm the new sub-account defaults to `eoa` mode, and confirm the exact `x-signing-message` hex form and whether the nonce is single-use or expires.
3. **Fee rate for sub-accounts on legacy fee markets:** confirm the `FEE_RATE_MISMATCH` re-sign loop (a second wallet prompt) works, or ask Limitless to expose the rate to the partner.
4. **Session cookie on `POST /orders`:** whether `limitless_session` (or a bearer) from `/auth/login` is accepted. Run it only with a wallet that already has a Limitless profile, because login may create one.
5. **EIP-7702 EOA as maker:** a type-0 order from a delegated EOA, end to end through matching and settlement.
6. **Contract-account maker (type 3)** at registration and at `POST /orders`.
7. **MCP OAuth for a dApp:** whether DCR accepts our redirect URI, and whether Limitless permits non-assistant clients.

## 8. Fetch log (all GET or OPTIONS, 2026-10-24)

- `docs.limitless.exchange/{llms.txt, llms-full.txt, openapi.json}`: 200.
- `api.limitless.exchange/auth/signing-message`: 200 text/plain (twice, once with our `Origin`). `/auth/verify-auth`: 401. `/mcp`: 405 "Method not allowed" (POST only). `/.well-known/oauth-protected-resource[/mcp]`: 200. `/.well-known/oauth-authorization-server`: 200. `/.well-known/openid-configuration`: 404.
- 26 preflights to api.limitless.exchange (section 5), 4 to the OAuth endpoints, 1 to api.limitless.markets.
- `limitless.exchange/` plus 61 static JS chunks; `limitless.exchange/mcp-connect`: 200.
- `auth.privy.io/api/v1/apps/cm5pgksxs05f9428uup8tuyd4`: 200 (twice). `OPTIONS auth.privy.io/api/v1/siwe/init`: 204 (twice). `docs.privy.io/llms-full.txt`: 200.
- `registry.npmjs.org/@limitless-exchange/sdk` and the 1.3.0 tarball. `api.github.com/orgs/limitless-labs-group/repos`. `sourcify.dev/server/v2/contract/8453/0x05c748E2f4DcDe0ec9Fa8DDc40DE6b867f923fa5?fields=sources`.
