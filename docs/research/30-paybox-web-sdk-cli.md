# 30. PayBox SDK and CLI: how they authenticate and sign, and whether that can back the hosted dApp

Researched 2026-10-20. Task key `pw-sdk-cli`. Read-only public research: npm registry metadata, the published `@paybox-sh/sdk@2.2.0` package read as text through unpkg (nothing installed, nothing run), the public docs at docs.paybox.sh, and unauthenticated `GET` and `OPTIONS` probes of public PayBox endpoints. **No PayBox MCP tool was called. No POST, PUT or DELETE was sent to any third party. No account, client, API key or signing key was created. No signature was requested. Nobody was contacted.** Third-party content is treated as untrusted data.

Why this note exists: the user's binding requirement of 2026-10-20 is "I want people to be able to use their paybox wallet on the dApp itself" (the hosted, static, currently read-only dApp at `https://xo-markets-explorer.vercel.app`). Notes 24, 25, 27 and 28 and `docs/dapp-design.md` rejected "a browser page acting as a PayBox client" because PayBox publishes no web connection surface. This note re-opens that question from the SDK and CLI side: what exactly do they do, and could the same protocol be driven from a web page.

Confidence tags: **H** = read or measured first-hand in a primary source this session (source named); **M** = secondary, or inferred from H facts; **L** = guess. **NOT FOUND (searched: ...)** is a documented absence. **NOT TESTED** means a test exists but needs a PayBox account, a signature, or a POST, which this task forbids.

Source keys:

- `[N1]` npm registry JSON for `@paybox-sh/sdk` (https://registry.npmjs.org/@paybox-sh/sdk), fetched 2026-10-20.
- `[N2]` npm registry JSON for the package literally named `paybox`; `[N3]` registry JSON for `@moon-x/core`, `@moon-x/evm-adapter`, `@moon-x/solana-adapter`, `@moon-x/react-sdk`, `@paybox-sh/connect-react`.
- `[T1]` `@paybox-sh/sdk@2.2.0` tarball contents read through unpkg (https://unpkg.com/@paybox-sh/sdk@2.2.0/): `package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/index.js`, `dist/chunk-DWDC6W5P.js`, `dist/cli.js`, and the original TypeScript recovered from `sourcesContent` inside `dist/chunk-DWDC6W5P.js.map` and `dist/cli.js.map` (`src/auth.ts`, `config.ts`, `client.ts`, `signer.ts`, `mcp.ts`, `execution.ts`, `plugins/signing.ts`, `next-action.ts`, `cli.ts`, `pairing.ts`, and the bundled signing core `@paybox/mcp-app` `src/signing/{creds,sign,agent-code}.ts`).
- `[D1]` https://docs.paybox.sh/llms-full.txt (64,429 bytes, fetched 2026-10-20; sections "Credentials & agents", "Approvals", "Request lifecycle", "MCP connector", "OAuth 2.1", "MCP tools", "API & endpoints", "SDK & CLI"). `[D2]` https://docs.paybox.sh/sdk-cli (HTTP 200, 152,460 bytes).
- `[P]` my own unauthenticated probes of `api.paybox.sh` and `app.paybox.sh` on 2026-10-20 (section 6.2, raw output in the session scratchpad).
- `[MX]` the `@moon-x/*` READMEs as published in the registry JSON.
- Repo notes: `[24]` `docs/research/24-dapp-paybox-tie-in.md`, `[05]` `docs/research/05-paybox-reference-plugins-b.md`, `[06]` `docs/research/06-paybox-platform.md`, `[DD]` `docs/dapp-design.md`.

---

## 0. Bottom line

1. **The CLI is not a separate package.** The `paybox` command is the `bin` of `@paybox-sh/sdk` (`"bin": {"paybox": "./dist/cli.js"}`). The npm package literally named `paybox` is an unrelated 2013 library for a French payment gateway (last modified 2022, no `bin`). `npm i paybox` gets the wrong thing. [H, `[N1][N2][T1]`]
2. **Authentication is three independent secrets, not one.** (a) A bearer: either an OAuth 2.1 token obtained by device-code login (access token 60 min, refresh token 30 days sliding and rotated on every use) or a personal `pbx_live_` API key; the bearer identifies a PayBox "client" and carries the grant the user approved. (b) A separate ed25519 agent key, `pbxk1.`, generated on the machine that will sign, registered with PayBox by public key only and confirmed by the human picking an eight-emoji code in the PayBox app. (c) For grants that require approval, a passkey ceremony at `app.paybox.sh`, which neither of the other two can perform. [H, `[T1][D1]`]
3. **A signature is produced by a server-side MPC co-signer, on a request signed by the agent key.** The SDK computes the digest itself (EIP-191, EIP-712, EIP-1559 transaction hash, EIP-7702 authorization hash, or a caller-supplied `raw` digest), wraps it in a JSON body, ed25519-signs that body with the `pbxk1.` key, and POSTs it to `/agent/requests/{id}/moonx-sign`; PayBox returns `{scheme, signature:{r,s,recovery_id}}`, the SDK assembles the 65-byte signature (`0x` + r + s + (27 + yParity)) and posts the artifact to `/agent/requests/{id}/signature`. Completion is **polling** of `GET /agent/requests/{id}`; no callback or webhook exists in the SDK or docs. [H, `[T1]`]
4. **The SDK as published is Node-only; its signing core is not.** `dist/chunk-DWDC6W5P.js` imports `node:child_process`, `node:crypto`, `node:http`, `node:fs`, `node:os`, `node:path` and `node:timers/promises` at top level, and `package.json` has no `browser` field, so it will not load in a browser bundle as is. But the code that builds the digests and the signed envelopes comes from `@paybox/mcp-app`, which is the PayBox in-chat signing window (an iframe that stores the key in `window.localStorage`). The whole protocol is about seven REST calls plus tweetnacl and viem, and the SDK itself accepts an injected `fetchImpl`. A browser reimplementation is small. [H for the imports and the iframe code, M for "small"]
5. **The only hard blocker for a static page is CORS, and it is complete.** Measured 2026-10-20 for `Origin: https://xo-markets-explorer.vercel.app`: no `access-control-allow-origin` header on any of `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/token`, `/oauth/device_authorization`, `/mcp`, `/agent/*`, `/api/agent-pairings/token`. The same requests with `Origin: https://app.paybox.sh` get the header back. The single exception is `/iframe/pairing` and `/iframe/pairing/{id}`, which answer `access-control-allow-origin: *`. [H, `[P]`]
6. **So there are exactly two ways to run the SDK protocol for a visitor of the hosted page:** (i) a **stateless allowlisted relay** on the dApp's own Vercel project that forwards a short list of routes to `api.paybox.sh` (the page keeps tokens and the signing key; the relay sees bearer tokens in transit and stores nothing); or (ii) **PayBox allows the dApp's origin** (a PayBox-side change; section 9). Everything else (a local helper, the user's own agent) is already designed in `[24]` and needs no PayBox change. [M, inference from 5]
7. **What is NOT established, and decides whether it is safe to ship:** whether PayBox's server checks that the digest in a `moonx-sign` envelope matches the intent the user approved. The SDK computes the digest on the client, so the server either recomputes it from the stored intent or trusts the client. I could not tell (the server repo `moonpay/paybox` is not readable with the access I have; HTTP 404). If it does not check, anyone holding bearer plus `pbxk1.` can sign **any** digest during any `pending_signature` window of that client. This is test LT-4 in section 11 and must run before the feature is enabled. [NOT FOUND]
8. **Nothing here has been run against PayBox.** No relay, no browser client and no signing flow exists or was exercised. All of it is design on top of read source.

---

## 1. Package inventory

| Package | Facts | Tag, source |
|---|---|---|
| `@paybox-sh/sdk` | Description: "Typed Node SDK + `paybox` CLI for the PayBox agent API, with REST core operations and runtime MCP plugin discovery and invocation." License **Apache-2.0**. Repository `git+https://github.com/moonpay/paybox.git`, directory `clients/sdk`. Homepage https://docs.paybox.sh/sdk-cli. Maintainer account `moonpay-engineering` (plus one individual account). Published by GitHub Actions. No `dist.attestations` (no npm provenance) in the registry metadata. `engines.node >=18`, `"type": "module"`, `exports` has only `"."` with `import`, `bin` `paybox`. 12 files in the tarball, 363,447 bytes unpacked. | H `[N1][T1]` |
| Version history | 14 versions: 0.1.0 (2026-06-08), 0.2.0, 0.3.0, 0.4.0, 0.5.0 (all 2026-06-09), 0.7.0 (2026-07-08), 0.8.0 (2026-08-27), 0.8.1 (08-29), 0.8.2 (08-31), 0.8.5 (08-31), **1.0.0 (2026-09-17)**, **2.0.0 (2026-10-02)**, **2.1.0 (2026-10-13)**, **2.2.0 (2026-10-14T20:01Z)**, dist-tag `latest` = 2.2.0. Unpacked size grew 225,739 (1.0.0) to 363,447 bytes (2.2.0). A new major in 15 days and a minor every few days: expect churn. `paybox world` and `paybox hyperliquid` command groups were removed in 1.0.0 (docs). | H `[N1][D1]` |
| Runtime dependencies (2.2.0) | `@moon-x/core 0.17.0`, `@moon-x/evm-adapter 0.3.0`, `@moon-x/solana-adapter 0.3.0`, `@solana/web3.js 1.98.4`, `viem 2.40.3`, `tweetnacl 1.0.3`, `bs58 6.0.0`, `buffer 6.0.3`, `commander 12.1.0`, `siwe 3.0.0`. The signing core `@paybox/mcp-app` is a `file:` devDependency, bundled into `dist`. | H `[T1]` |
| `@moon-x/core`, `@moon-x/evm-adapter`, `@moon-x/solana-adapter`, `@moon-x/react-sdk` | License **UNLICENSED** ("All rights reserved") on every one. Latest: core 0.31.0 (2026-10-15), evm-adapter 0.3.6 and solana-adapter 0.3.6 (2026-10-14), react-sdk 0.29.0 (2026-10-15). The SDK pins much older versions (core 0.17.0, adapters 0.3.0). No repository field. | H `[N3]` |
| `paybox` (unqualified) | Version 0.0.8, "Library to simply connect to the Paybox platform", repository `Ideolys/node-paybox`, last modified 2022-06-23, no `bin`. A different company's payment-gateway client. Not PayBox. | H `[N2]` |
| `@paybox-sh/connect-react` | 0.1.1 (2026-09-17), Apache-2.0, renders Claude/ChatGPT setup instructions only (`[24]` section 3, F). Not a wallet connection. | H `[N3]`, `[24]` |
| `moonpay/paybox` (server and clients monorepo) | `gh api repos/moonpay/paybox` returns HTTP 404 with my read-only access: the server source is not readable. `moonpay/paybox-plugin` is public (MIT, last push 2026-09-18) but is plugin skills, not the client. | H (the 404) |

Two licensing consequences for the dApp (M): (a) the SDK (Apache-2.0) may be read, adapted and redistributed with notice, so a browser re-implementation of its protocol is licence-clean; (b) every `@moon-x/*` package is UNLICENSED, so shipping them inside a public bundle is not licence-clean. They are not needed: their EVM part is five lines of viem (section 4.4).

---

## 2. Credentials and what each can do

### 2.1 Device-code login (`paybox login`) [H, `[T1]` `src/auth.ts` `loginDevice`; `[P]` for the live metadata]

Discovery, no auth: `GET https://api.paybox.sh/.well-known/oauth-authorization-server` currently returns (2026-10-20, HTTP 200) `authorization_endpoint /oauth/authorize`, `token_endpoint /oauth/token`, `registration_endpoint /oauth/register`, **`device_authorization_endpoint https://api.paybox.sh/oauth/device_authorization`**, `grant_types_supported ["authorization_code","refresh_token","urn:ietf:params:oauth:grant-type:device_code"]`, `code_challenge_methods_supported ["S256"]`, `token_endpoint_auth_methods_supported ["none"]`, `scopes_supported ["mcp","offline_access"]`. The docs page "OAuth 2.1" still shows the older document without the device endpoint, and `https://api.paybox.sh/openapi.json` lists only `/.well-known/*`, `/health`, `/mcp`, `/oauth/{authorize,register,token}`: the device endpoint and every `/agent/*` route are undocumented in the OpenAPI file.

Sequence the CLI runs:

1. **Register a throwaway public client.** `POST /oauth/register`, JSON body fields `client_name` ("PayBox CLI"), `redirect_uris` (`["http://127.0.0.1/device"]`, a placeholder), `token_endpoint_auth_method: "none"`, `grant_types: ["urn:ietf:params:oauth:grant-type:device_code","refresh_token"]`, `response_types: ["code"]`, `scope`. Response field used: `client_id` (docs example: `pbx-oauth-a1b2c3d4e5f6`). **A new client is registered on every `login`.**
2. **Start the grant.** `POST /oauth/device_authorization`, form body `client_id`, `scope` (default `"mcp offline_access"`), `resource` (`https://api.paybox.sh/mcp`). Response fields read: `device_code`, `user_code`, `verification_uri`, `verification_uri_complete`, `expires_in`, `interval`.
3. **Human step.** The CLI prints `verification_uri_complete` and `user_code` ("Open this URL on your phone (or this computer) to approve access") and tries to open a browser. On the page the user "choose[s] your wallets" and taps "Connect with PayBox CLI" (`SKILL.md`, which tells agents not to describe a passkey or code-entry step the page does not show). The OAuth docs say the consent step ends "approve with a passkey". The two texts disagree on whether consent needs a fresh passkey assertion. NOT TESTED.
4. **Poll.** `POST /oauth/token`, form body `grant_type=urn:ietf:params:oauth:grant-type:device_code`, `device_code`, `client_id`. Interval: the server's `interval` if positive else **5 s**; on error `slow_down` add 5 s; on `authorization_pending` keep polling; any other error stops; total deadline `expires_in` seconds (the live value of `expires_in` NOT FOUND, it needs the POST).
5. **Result stored** (in `~/.config/paybox/config.json`, directory mode 0700, file 0600; `PAYBOX_CONFIG_DIR` overrides): `oauth: {clientId, accessToken, refreshToken, expiresAt, resource}`. `login` deletes any stored `apiKey` and any stored `signingKey`, because "a key paired to the previous client cannot sign".

Token facts: access token is an HS256 JWT, audience-bound to the MCP resource, **60 min**; the SDK reads a `cid` claim from its payload as the client id (`agentClientId`). Refresh token is opaque, **30 days sliding, rotated on every use**; "Replaying a rotated token revokes the client"; the authorization code (loopback flow) lives 5 min and replay of a used code revokes the client. The SDK refreshes when `Date.now() > expiresAt - 60_000`, calling `POST /oauth/token` with `grant_type=refresh_token`, `refresh_token`, `client_id`, `resource`, and writes the new pair back to the config file. Two processes on one config race and the loser fails with "refresh token has already been used" (`SKILL.md`: "Retry that one command once; do not run `login` again"). The `scope` `offline_access` is opt-in: without it no refresh token is issued. [H, `[D1][T1]`]

A second, equally supported flow is exported from the SDK as `loginLoopback`: dynamic registration with `redirect_uris: ["http://127.0.0.1:<port>/callback"]` and `grant_types: ["authorization_code","refresh_token"]`, then browser authorization with PKCE S256 and `state`, then `POST /oauth/token` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`, `resource`. The docs allow `redirect_uris` that are HTTPS or `http://localhost`, which means an HTTPS dApp URL such as `https://xo-markets-explorer.vercel.app/callback` is a legal redirect URI for a browser-based authorization-code flow. (The CORS block in section 6 is what stops it, not the protocol.) [H, `[T1][D1]`]

### 2.2 Personal API keys, `pbx_live_...` [H docs and SDK; NOT FOUND for expiry]

- **How obtained:** "issued from the app's Clients screen" (`[D1]`); `README.md` says "The `pbx_live_` key comes from the PayBox app (Agents -> create an agent, pick its wallets); it is shown once." A person does this in the PayBox app; there is no API to mint one.
- **What it is on the wire:** the same `Authorization: Bearer ...` header as an OAuth access token; "both resolve to the same scoped client" (`[D1]`). The scope is the grant picked at creation (which wallets, which approval mode); the OAuth scopes `mcp` and `offline_access` do not apply to it.
- **Lifetime:** NOT FOUND (searched `[D1]`, `[T1]`). No refresh logic exists for keys in the SDK: `bearer()` returns `opts.apiKey` as is.
- **Can it sign?** **No, not by itself.** `credsFromToken` throws if given one: "invalid signing key: got a `pbx_live_` API key; expected a `pbxk1.` token (keypair only)". With an API key as the bearer, in-process signing still needs a paired `pbxk1.` key, and the two are a "matched pair": a `pbxk1.` paired under another client fails with "agent signer belongs to another client" (`README.md`). "Rotating the API key mints a new client, so re-pair after rotation." The `README.md` headless recipe uses `paybox login --key pbx_live_...` then `paybox connect`. [H]
- Anything an API key can do without a signing key is whatever the grant allows through the API: list credentials, read portfolio, create requests (which then wait at `pending_approval` or `pending_signature`), poll requests. [M, from section 4]

### 2.3 Agent keys, `pbxk1.` [H, `[T1]` `pairing.ts`, `creds.ts`, `agent-code.ts`, `signer.ts`]

- **Format.** `pbxk1.` + base64url of the JSON `{"p": "<ed25519 public key hex>", "s": "<32-byte seed hex>"}`. It is an ed25519 keypair seed, nothing else. `parseToken` also accepts the legacy field names `apiPubHex` and `apiPrivHex`. The signing window stores the same pair in `window.localStorage` under `paybox.walletSign.creds.v2` (so the in-chat window, a browser iframe, keeps the key in browser storage).
- **Where generated.** On the machine that will sign: `nacl.randomBytes(32)` then `nacl.sign.keyPair.fromSeed`. "PayBox never holds it" (`README.md`, `[D1]`); PayBox receives only the public key.
- **Pairing (`paybox connect`)**, four steps, each with its route:
  1. `POST {base}/api/agent-pairings/token` with `Authorization: Bearer <OAuth access token or pbx_live key>` returns `{pairing_token, client_id}`. The pairing is therefore bound to the client the bearer belongs to.
  2. `POST {base}/iframe/pairing` with `Authorization: Bearer <pairing_token>` and JSON `{api_pub_hex}` returns `{pairing_id}`.
  3. The human opens `https://app.paybox.sh/agent-key?client_id=<id>&pairing_id=<id>` (app origin is `api.` replaced by `app.` in the base URL) and picks, among three emoji rows, the one matching the **eight emoji** the CLI printed. The code is the first 8 bytes of `SHA-256(public key)` mapped through a fixed 256-entry emoji table; the two decoys are derived deterministically from the public key (`paybox/agent-code/decoy/<pubhex>/<n>`). This is a channel-binding check (a different key pre-registered by an attacker would show a different code); it is not a secret.
  4. `GET {base}/iframe/pairing/{pairing_id}` every 1.5 s (exponential backoff capped at 15 s, give up after 90 s of continuous failures, overall 10 min) until `status` is `completed` (success), `cancelled` ("declined in PayBox") or `expired`.
- **What it authorizes.** It authorizes **producing signatures for the wallets granted to the client it was paired under, for requests that PayBox has cleared**. It signs the request body sent to `moonx-sign` (section 4) and nothing else. It never leaves the machine and is not a bearer: every call that carries an envelope also carries the OAuth/API-key bearer. Whether PayBox requires the bearer for `moonx-sign` or would accept the agent signature alone: NOT FOUND (the SDK always sends both).
- **Lifetime.** NOT FOUND. MoonX's own docs call its equivalent "ephemeral signers" and list statuses `active`, `needs_reauth`, `expired` with an `expires_at` (`[MX]` react-sdk README). If PayBox signers expire, the browser client must handle `needs_reauth` and re-pair. NOT TESTED.
- **Visibility.** `listCredentials()` returns `agent_signer_recorded: boolean` (SDK type), so a page can tell whether a signer is recorded for its client.
- **One pairing at a time.** `SKILL.md`: "a second pairing invalidates the code on screen"; "Do not re-run `connect` while one is polling".

---

## 3. The REST routes the SDK calls (exact paths and field names)

All are on `https://api.paybox.sh` with `Authorization: Bearer <bearer>` unless stated. `[H, T1]` `client.ts` and `signer.ts`. Measured CORS result per route is in section 6.2.

| Purpose | Method and path | Request fields | Response fields used |
|---|---|---|---|
| list grants | `GET /agent/grants` | none | `credentials[]` (`credential`, `grant{credential_id, approval_mode}`), `ungranted[]`, `agent_signer_recorded` |
| dry-run | `POST /agent/readiness` | `operation` | `can_attempt`, `blockers[]`, `unknowns[]` |
| **create a signing request** | `POST /agent/wallet-sign` | `{"operation":{"type":"wallet_sign","credential_id":"...","intent":{...}}}` | `response{request_id, status, output, approval_id, error, retryable}`, `binding{wallet_id, key_id, derivation_path}` |
| key binding | `POST /agent/requests/{id}/binding` | `api_pub`, `signed_body`, `agent_signature` | `wallet_id`, `key_id`, `derivation_path` |
| **MPC signature** | `POST /agent/requests/{id}/moonx-sign` | `api_pub`, `signed_body`, `agent_signature` | `scheme`, `signature{r, s, recovery_id}` (ECDSA) or `signature{signature}` (ed25519) |
| **submit artifact** | `POST /agent/requests/{id}/signature` | `{"artifact": {...}}` | not read |
| batch (swap, x402) | `POST /agent/requests/{id}/envelopes` | `{"envelopes":[{api_pub, signed_body, agent_signature}]}` | not read |
| re-quote before signing | `POST /agent/requests/{id}/refresh` | `{}` | `plan` |
| **poll** | `GET /agent/requests/{id}` | none | same envelope as `response` above |
| swap | `POST /agent/swap` | `{"operation":{"type":"swap", credential_id, src_chain, dst_chain, src_token, dst_token, amount, swap_direction, slippage_bps, recipient, value_cents}}` | `response`, `plan` |
| x402 | `POST /agent/x402`, `POST /agent/use-service` | `credential_id`, `accepts`, `resource_url` / `url`, `method`, `body` | `response`, `plan` |
| payment, secret | `POST /agent/request` | `{"operation":{"type":"payment"|"secret", ...}}` | `response` |
| funding links | `GET /agent/buy-link`, `GET /agent/deposit-link` | query `credential_id`, `destination_chain`, `currency_code`, `amount_usd` | `url` / `deposit_url`, `expires_at`, `return_origin` |
| portfolio | `GET /agent/portfolio`, `POST /agent/portfolio/verify-solana-balance` | query `address`, `network_ids`, `token`, `network_id` | untyped |
| account change | `POST /agent/account-change` | `note` | `manage_url` |
| MCP | `POST /mcp` (JSON-RPC, protocol `2025-06-18`, `accept: application/json, text/event-stream`, optional `x-paybox-signing-surface: in-process|browser|none`) | `tools/call` | tool results; used by the SDK only for plugins and `reopen_signing_window` |
| OAuth | `/oauth/register`, `/oauth/device_authorization`, `/oauth/token`, `/oauth/authorize` | section 2.1 | |
| pairing | `POST /api/agent-pairings/token`, `POST /iframe/pairing`, `GET /iframe/pairing/{id}` | section 2.3 | |

Observations:

- The `/agent/*` REST routes carry the SDK's "core operations", yet **neither the docs nor `openapi.json` publish them**; the docs say only OAuth and MCP are the developer surface and that the app's `/api/*` routes "are not part of the developer surface" (`[D1]`). The official SDK nevertheless depends on `/api/agent-pairings/token` and `/iframe/pairing`. They are stable only as long as the SDK versions that use them are. [H]
- Docs and SDK already disagree: `[D1]` shows `listCredentials()` returning `ungranted_summary` ("Count-only hints; no ungranted credential IDs"), whereas SDK 2.2.0's types and README use `ungranted: UngrantedCredential[]`. The server is ahead of the published SDK. [H both texts; M that this shows drift]
- Plugin and discovery calls go through MCP; **signing completion has no MCP equivalent** (the tools it uses, `moonx_*` and `submit_*`, are "hidden from the model and are not part of this surface", `[D1]`).

---

## 4. How a signature is actually produced

### 4.1 The request and approval states

`requestWalletSign` posts the intent. PayBox evaluates it against the client's grant for that credential and returns a status (`[D1]` "Request lifecycle"; `RequestStatus` in `index.d.ts`): `pending_approval`, `pending_funding`, `pending_signature`, `pending_settlement`, `pending_confirmation`, `success`, `denied`, `error`. For a wallet signature:

- grant mode `always_approve` ("Human approval"): `pending_approval` with an `approval_url`; the user approves with a passkey **in the PayBox app** (push notification on mobile); approvals are "operation-bound" and "expire after ~10 minutes"; then `pending_signature`;
- grant mode `iframe`: the user confirms in the in-chat signing window, "which then signs and submits immediately" (`[D1]` Approvals);
- grant mode `autonomous`: straight to `pending_signature`, "within the grant";
- a fourth `approval_mode` value, **`paybox`**, appears in the SDK's `Grant` type and nowhere in the docs. NOT FOUND what it does.

`pending_signature` means "cleared; a signer must now produce the artifact": the in-chat window, or the SDK with a `pbxk1.` key. Without a key "those commands stop at `pending_signature`" (`[D1]` CLI section).

### 4.2 The in-process signing sequence (SDK `signWalletRequest`, `signIntent`)

1. `binding` is taken from the `wallet-sign` response, or resolved by `POST /agent/requests/{id}/binding` with an envelope whose `signed_body` is the hex of the UTF-8 JSON `{"issued_at": "<ISO time>"}`.
2. The digest is computed on the **client**: message -> `hashMessage`; typedData -> `hashTypedData`; transaction -> `keccak256(serializeTransaction(<eip1559 tx>))`; authorization -> `hashAuthorization`; `raw` -> `rawSigningPayloadHex` as given; Solana -> ed25519 over the message bytes (for transactions, the part after the signature slots).
3. Envelope: `signed_body` = hex of UTF-8 JSON `{"raw_signing_payload": "<digest hex, no 0x, lower case>", "key_id": ..., "derivation_path": ..., "issued_at": "<ISO time>"}`; `agent_signature` = hex of `nacl.sign.detached(signed_body_bytes, secretKey)`; the body sent is `{api_pub, signed_body, agent_signature}`. **The request id is only in the URL path, not in the signed bytes.**
4. `POST /agent/requests/{id}/moonx-sign` returns `{scheme: "ecdsa_secp256k1", signature: {r, s, recovery_id}}`. The SDK throws if `r`, `s` or `recovery_id` is missing.
5. Assembly (from `@moon-x/evm-adapter` 0.3.0 `dist/index.mjs`, UNLICENSED, read only to understand the format): signature = `0x` + `r` + `s` + `(27 + yParity)` as two hex digits, with `yParity` required to be 0 or 1; a transaction is `serializeTransaction(tx, {r, s, yParity})`; an authorization is the input plus `r`, `s`, `yParity`. For `raw` the SDK returns `{scheme, signature}` unassembled.
6. `POST /agent/requests/{id}/signature` with `{"artifact": ...}`; on a thrown error the SDK reads the request once and retries the whole sign step once only if it is still `pending_signature` (`signWithReconcile`).
7. `GET /agent/requests/{id}` until `success`; the artifact is in `output.value` (`output_type: "signature"`; fields `signature`, `serializedTransaction`, `signedTransactionBase64`).

Facts that follow (H unless marked):

- `raw` is "an escape hatch" (`[D1]`): the server will sign any 32-byte payload the client puts in step 3 **if it accepts the request**. `typedData` and `message` differ from `raw` only in what the client hashes.
- Because the client computes the digest, **the server has to recompute it from the stored intent to bind signature to approval**. The SDK's own `completeWalletSignRequest` takes the intent from the server (`reopen_signing_window` returns `operation.intent`, `wallet_id`, `key_id`, `derivation_path`), so the server has the data to do so. Whether it does: NOT FOUND (section 8).
- The signed JSON has an `issued_at` but no request id, so a captured envelope can be replayed against another request id unless the server binds them. NOT FOUND whether it does; the effect would be limited to getting the same digest signed again.
- Under `autonomous`, docs conflict on whether signing still needs a fresh passkey ("Regardless of mode, sensitive operations (revealing a raw secret, signing, issuing keys) require a fresh passkey assertion" in `[D1]` "Credentials & agents" versus "Wallet signs and swaps move to `pending_signature`" in "Request lifecycle"). Same conflict as `[05]` B1. NOT TESTED.

### 4.3 Swap and x402 variants

`/agent/swap` returns a `plan` with `txs` and `binding`; for Solana swaps the SDK first calls `POST /agent/requests/{id}/refresh` to re-pin the blockhash, then builds one envelope per transaction and posts them to `/agent/requests/{id}/envelopes`. x402 does the same with an EIP-3009 typed-data digest (`typed_data` in the plan) or a Solana transaction. The plan is validated by `supportedSigningPlan` (rejects `version`, `schema_version`, `gasless`, mixed `vm`, anything not EIP-1559 or Solana) so the SDK **declines gasless UserOperation plans** (`reason: "unsupported"`). The signing core has a `buildGaslessEnvelopes` for `kind: "userOp"` and `kind: "authorization"` digests, but the SDK's `signer.ts` does not import it; that the in-chat window is therefore the only signer of gasless plans today is an inference (M). [H for `plugins/signing.ts` and `sign.ts`]

### 4.4 What it takes to reproduce this in a browser

Digest functions: `hashMessage`, `hashTypedData`, `keccak256(serializeTransaction(...))`, `hashAuthorization` are all viem (MIT). Signature assembly is the five lines above. The ed25519 envelope signature is `tweetnacl` (public domain) or WebCrypto Ed25519 (M: supported by current Chrome, Firefox and Safari; NOT TESTED here). The pairing only transmits the **public** key, so a browser could generate a **non-extractable** WebCrypto Ed25519 key, keep it in IndexedDB, and never hold a `pbxk1.` token string at all. That would make theft of the signing key from page storage impossible (a script on the page could still call `sign`). Whether PayBox's server accepts a pairing whose public key came from WebCrypto: it only sees `api_pub_hex`, so it should (M); NOT TESTED. Nothing from `@moon-x/*` is required.

---

## 5. Completion, approval surface, polling

| Question | Answer | Tag, source |
|---|---|---|
| Where does the human approve? | At `app.paybox.sh` (or the PayBox mobile app) via `approval_url`, with a passkey. The consent screen for login and the emoji screen for pairing are also on `app.paybox.sh`. | H `[D1][T1]` |
| Can a third-party page host that approval? | Probably not. `app.paybox.sh` sends `frame-ancestors 'self'` (cannot be framed by another origin) and `permissions-policy: publickey-credentials-get=(self ...)`. WebAuthn credentials are bound to a relying-party id, and PayBox's relying-party id is not published (NOT FOUND); the natural conclusion is that the passkey ceremony can only run on the PayBox origin. So a dApp has to send the user to PayBox (a popup or a new tab with `approval_url`) and wait. | H for the two headers `[P]`; M for the conclusion |
| Polling or callback? | **Polling only.** `GET /agent/requests/{id}`. SDK defaults: interval 2 s, doubling to 30 s while the status is unchanged, reset on change; overall deadline 300 s; `intervalMs` 1 to 30,000. No webhook, SSE or callback in the SDK, the docs, or the OpenAPI file. | H `[T1][D1]` |
| Idempotency | "submit once, then poll"; never re-call a write tool; the SDK persists nothing about a request; `resumeRequest(requestId)` reads and continues. Only the client that created a request can read it. | H `[D1][T1]` |
| What does the approver see for typed data or a raw digest? | NOT FOUND. The approval screen's rendering of `typedData` and `raw` is unpublished. | NOT FOUND (same as `[24]` section 4) |
| Passkey alternatives (MoonX) | `@moon-x/react-sdk` documents a different, app-embedded model: "embedded wallets with passkey-protected MPC signing", a secure iframe, `publishableKey`, and "An origin must still be on the app's allowlist before the SDK can use it". Every sensitive op does a fresh WebAuthn ceremony and mints a single-use 30-second presence token. That is MoonX's app model, with its own publishable key and user pool; whether a MoonX app can address a user's existing PayBox wallets is NOT FOUND. | H `[MX]` for the text; NOT FOUND for the cross-app question |

---

## 6. Does it run in a browser?

### 6.1 Code facts [H, `[T1]`]

- The published bundle `dist/chunk-DWDC6W5P.js` has top-level imports from `node:child_process` (`spawn`, used to open a browser), `node:crypto`, `node:http` (loopback callback server), `node:fs`, `node:os`, `node:path` (config file), `node:timers/promises`. `engines.node >=18`; no `browser` field; no `sideEffects` field. A browser bundler would fail or externalize these (M).
- The class `PayboxClient` itself only needs `fetch` and accepts `fetchImpl`; its `request()` is plain fetch. `fromConfig()` is the Node-only part.
- The signing core is browser code: `creds.ts` reads and writes `window.localStorage`; `sign.ts` uses `tweetnacl`, `viem`, `buffer`.
- `README.md`: "Wallet signing is non-custodial and runs in-process: the SDK reuses the exact signing core from the wallet-sign iframe (`@paybox/mcp-app`)".

### 6.2 CORS, measured 2026-10-20 [H, `[P]`]

Method: unauthenticated `OPTIONS` (headers `Access-Control-Request-Method: POST`, `Access-Control-Request-Headers: authorization,content-type,mcp-protocol-version,x-paybox-signing-surface`) and `GET` against `https://api.paybox.sh`, with `Origin` set to each of `https://xo-markets-explorer.vercel.app` (the hosted dApp), `https://app.paybox.sh` and `https://example.org`; `User-Agent: insurance-markets-research/0.1`; no body sent; request ids were the all-zero UUID. Status of every preflight: 200. Result:

| Route group | `Origin: https://xo-markets-explorer.vercel.app` | `Origin: https://app.paybox.sh` | `Origin: https://example.org` |
|---|---|---|---|
| `/.well-known/oauth-authorization-server` (GET) | no `access-control-allow-origin` | `https://app.paybox.sh` | none |
| `/oauth/register`, `/oauth/token`, `/oauth/device_authorization`, `/mcp` | none | `https://app.paybox.sh` | none |
| `/api/agent-pairings/token` | none | `https://app.paybox.sh` | none |
| `/agent/wallet-sign`, `/agent/request`, `/agent/swap`, `/agent/x402`, `/agent/use-service`, `/agent/readiness`, `/agent/requests/{id}/{binding,moonx-sign,signature,envelopes}` (OPTIONS) | none | `https://app.paybox.sh` | none |
| `/agent/grants`, `/agent/requests/{id}`, `/agent/portfolio`, `/agent/deposit-link` (GET, all HTTP 401 without a bearer) | none | `https://app.paybox.sh` | none |
| **`/iframe/pairing` (OPTIONS) and `/iframe/pairing/{id}` (GET, HTTP 404 for the zero id)** | **`access-control-allow-origin: *`** | `*` | `*` |
| `/health` (GET, 200) | no CORS headers at all | none | none |

Further header facts: `access-control-allow-credentials: true` is sent on the first-party routes; `access-control-allow-headers` there is `content-type,authorization,x-moonx-access-token,x-moonx-identity-token,x-moonx-presence,mcp-protocol-version` and does **not** include `x-paybox-signing-surface` even for the app origin (so that header is for non-browser MCP hosts); `access-control-allow-methods` is `GET,POST,PUT,PATCH,DELETE,OPTIONS`; the `/iframe/pairing` preflight allows `content-type,authorization` and methods `GET,POST,OPTIONS`. No `x-ratelimit-*`, `ratelimit-*` or `retry-after` header on any response seen. The `x-moonx-*` headers are the first-party app's session headers and are not part of the public surface; they must not be used.

Reading: the allowlist is the single origin `https://app.paybox.sh`, hard to extend without PayBox. The `/iframe/pairing*` pair is open to every origin by design because the in-chat signing iframe runs on a host-controlled sandbox origin and uses a one-purpose pairing token.

### 6.3 What the CORS result means for each step from a static page

| Step | From the browser directly | Needs |
|---|---|---|
| Read OAuth metadata | blocked | relay (or hard-code the endpoints) |
| Register an OAuth client | blocked | relay, or the author registers one client once out of band |
| Device authorization and token polling, refresh | blocked | relay |
| Mint pairing token (`/api/agent-pairings/token`) | blocked | relay |
| Register the public key (`POST /iframe/pairing`) and poll it | **allowed** (ACAO `*`) | nothing |
| Create a request, poll it, `binding`, `moonx-sign`, `signature` | blocked | relay |
| Passkey approval and the emoji screen | not embeddable (`frame-ancestors 'self'`) | popup or new tab to `app.paybox.sh` |

A "simple" cross-origin `POST` (form-encoded, no custom headers) does reach the server without a preflight, but the browser hides the response; since an authorization code or device code is single-use and a rotated refresh token revokes the client, a blind POST is harmful, not useful. [M]

---

## 7. Rate limits and other numbers

- **Rate limits for the REST and MCP surface: NOT FOUND** (searched `[D1]`, `[D2]`, `[T1]` for `rate`, `429`, `throttl`, `quota`, `retry-after`; no response header seen; the SDK has no 429 or `Retry-After` handling). The only published limit I know is the plugin-call one in `[06]` (1 start per second and 1,000 per rolling 24 hours per user), which applies to Open Plugins, not to this path.
- Cloudflare fronts `api.paybox.sh` (`server: cloudflare`, `cf-ray`, and a `__cf_bm` bot-management cookie set on a plain GET). Whether requests from a Vercel function's datacenter egress addresses are treated differently from a home connection: NOT TESTED (relevant to the relay, section 9).
- Timers: access token 3,600 s; refresh token 30 days sliding; authorization code 5 min; approval about 10 min; SDK request deadline 300 s default; pairing 10 min; device-code `expires_in` and `interval` are server values (CLI default interval 5 s).
- Limits on dynamic client registration (how many clients one IP or one user may register, retention of unused clients): NOT FOUND. A per-visitor registration design depends on this.

---

## 8. What a holder of a user's tokens could and could not do without the passkey

Setting: the holder is a server-side or malicious-script party that obtained some subset of {OAuth access token, OAuth refresh token or `pbx_live_` key, `pbxk1.` seed}. "Docs" means `[D1]`; "SDK" means `[T1]`.

| Holds | Could do (evidence) | Could not do (evidence) | Open question |
|---|---|---|---|
| Access token only (60 min) | Everything the grant allows over `/agent/*` and `/mcp`: list credentials, read portfolio and request history of that client, create requests, poll them. Under `always_approve`, a created request waits at `pending_approval`. Under `autonomous`, it reaches `pending_signature`. | Produce a signature artifact: `moonx-sign` needs an ed25519 envelope signed by a key registered to the same client ("agent signer belongs to another client", README). Approve anything: docs "the token alone never bypasses step-up". | Whether `moonx-sign` rejects an envelope when the bearer is valid but the signer is unknown: expected, NOT TESTED. |
| Refresh token or `pbx_live_` key | The above, repeatedly for 30 days sliding (refresh) or without stated expiry (key). Replaying a rotated refresh token revokes the client, so a thief and the owner using one chain will kill it for both and the owner will notice. | Same as above. | `pbx_live_` lifetime NOT FOUND; no rotation, so no replay tripwire. |
| `pbxk1.` seed only | Sign envelopes. | Reach the API without a bearer, per the SDK's behaviour (every call carries one). | Whether the server accepts an agent signature without a bearer: NOT FOUND, NOT TESTED. |
| Bearer and `pbxk1.`, grant `always_approve` | Create a request with an attacker-chosen intent. Then it sits at `pending_approval`: the approval needs the owner's passkey at `app.paybox.sh` (docs: "approve with a passkey in the PayBox app"). | Get that request signed without the owner. | If the owner approves **a** request (for example the dApp's own legitimate one), the window between `pending_signature` and `success` lets the holder call `moonx-sign` on that request id. Whether the server restricts the signed digest to the approved intent is the binding question below. |
| Bearer and `pbxk1.`, grant `autonomous` | Sign any intent the grant allows, including any `raw` digest (an EIP-1559 transaction hash, a UserOp hash, a Permit digest). `raw` carries no chain, so no chain policy can bind it ([24] section 8). | Nothing relevant, unless the fresh-passkey sentence in docs applies to signing in this mode. | Docs conflict on that sentence (`[05]` B1). NOT TESTED. |
| Bearer and `pbxk1.`, grant `iframe` | The "confirmation" is a click inside a window that holds the `pbxk1.` key in `localStorage`; a holder of key and bearer may reproduce the window's calls with no human present. | -- | Not tested; **avoid `iframe` mode for anything a hosted page does.** |

**The decisive unknown, binding of digest to approved intent.** Everything above that says "needs the owner's passkey" is only worth something if `moonx-sign` signs just the digest of the approved request. Evidence that it is checkable: the intent is stored server-side and handed back by `reopen_signing_window`; the server already "recomputes" plans in `refresh`. Evidence it may not be checked: the digest is computed by the client; the signed JSON does not contain the request id; the docs sentence "The window signs client-side via MoonX MPC" describes the key as the thing that signs, with the server only gating (`[D1]`, `README.md`: "the secret-gated `/sign` happens server-side"). If it is not checked, the correct description of an `always_approve` grant is "a passkey is needed to open a signing window, and during that window the paired agent key can sign anything". NOT FOUND; test LT-4.

Two more server-side mitigations to know about (H): the approval is "operation-bound" and expires (~10 minutes); and the MoonX layer demands, per sensitive operation, a presence token that is scope-bound, single-use and short-lived ([MX] "Security"). The MoonX text describes MoonX's own SDK flow; how PayBox's server obtains presence for an agent-key signature is NOT FOUND.

What a **relay on the dApp's Vercel project** would be in this table: it sees the access token and the refresh token (or key) in transit and, if designed as in section 9, never sees the `pbxk1.` seed. So a compromised relay is the "access token and refresh token" row: reads, request creation, and nothing signed without the owner. A compromised dApp **page** (XSS or a malicious dependency) is stronger: it holds the bearer and can ask the key to sign.

---

## 9. Can this back a hosted web app? Every route I can find

Constraint reminder (user decisions): runnable by everyone from day zero; nobody operates anything the author must keep running **except**, as of 2026-10-20, "a thin author-operated serverless layer on Vercel" that holds no user keys and whose risk is stated; no custody of other people's credentials; no browser automation of third-party sites; every write path flag-gated OFF; caps advisory; the repo is public; no fake data.

### W1. Browser straight to PayBox (no relay): not possible today [H]
Section 6.2. Even the 401 and the OAuth metadata are unreadable from the dApp's origin.

### W2. Stateless allowlisted relay + browser-held credentials + browser-held signing key (recommended if PayBox is not asked) [design, M]

```
 visitor's browser (dApp page)                       dApp's Vercel project              PayBox
 - device-code or PKCE login            -------->   /api/paybox/oauth/*     -------->  api.paybox.sh
 - holds access + refresh token                     /api/paybox/agent/*                  (CORS only for app.paybox.sh)
 - holds ed25519 key (WebCrypto,                    (path + method allowlist, no state)
   non-extractable)                                 /iframe/pairing*   (also via the relay, to keep connect-src 'self')
 - computes digests, signs envelopes
 - opens app.paybox.sh in a popup for consent, emoji pairing, passkey approvals
```

What the page does, in order (all routes in section 3): fetch metadata; `POST /oauth/register` once per browser (the CLI registers a fresh client at every `login`; mirror that so one visitor equals one PayBox client and revocation is one click); `POST /oauth/device_authorization` and poll `POST /oauth/token` (device flow needs no redirect URI and shows a code and a link) or run authorization-code + PKCE with an HTTPS redirect back to the dApp (legal per the docs, section 2.1); keep tokens in memory or `localStorage` (per-viewer convenience only); refresh under a **single-tab lock** (Web Locks API) because a replayed rotated refresh token revokes the client; mint a pairing token through the relay, generate the key in the page, `POST /iframe/pairing` and poll `GET /iframe/pairing/{id}` (through the relay, although PayBox would also answer the browser directly), and show the eight-emoji code; then for each signing action build the intent, `POST /agent/wallet-sign` via the relay, show `approval_url` (popup), poll, compute the digest in the page, post the envelope through the relay, assemble and verify the signature locally (recover the signer and compare with the credential's address) before using it anywhere.

What the relay is: one Vercel Function (or rewrite) that forwards only these paths to `https://api.paybox.sh`: `/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/device_authorization`, `/oauth/token`, `/api/agent-pairings/token`, `/agent/grants`, `/agent/readiness`, `/agent/wallet-sign`, `/agent/requests/{uuid}` and `/agent/requests/{uuid}/{binding,moonx-sign,signature}`, `/agent/portfolio`; fixed upstream host; no cookies, no `Set-Cookie` pass-through; request `Origin` must equal the dApp's origin; strips everything but `authorization`, `content-type`, `accept`; does not log headers or bodies; per-IP rate limit; no state at rest. Because the relay is same-origin (`/api/paybox/*`), the page's `connect-src` can stay `'self'` plus the existing closed list (both CSP builds in `app/headers.config.ts` already include `'self'`; H, read 2026-10-20), so route **every** PayBox call through the relay, including `/iframe/pairing*`, which the browser could call directly (ACAO `*`) but only at the price of adding `https://api.paybox.sh` to `connect-src`. Note the existing guard: `app/headers.config.ts` lists `api.paybox.sh` ("a browser page is never a PayBox client") and `app.paybox.sh` ("no PayBox web surface is used or embedded") in `NEVER_IN_APP_HOSTS`, and a boundary check fails the build on any hit. W2 reverses that decision, so it needs a reviewed, deliberate change to the guard (the page bundle can avoid naming `api.paybox.sh` at all, since the relay holds the upstream host; `app.paybox.sh` appears only in URLs the server returns, such as `approval_url`, and in the pairing link, which the page would build from a relay-supplied value). The strict policy that is already there (`default-src 'none'`, `require-trusted-types-for 'script'`, `frame-ancestors 'none'`, `form-action 'none'`) is what protects the key and bearer in the page.

Honest risks of W2:

1. **The relay sees bearer tokens.** It stores none, but the author's Vercel account, deploy pipeline and dependency tree become part of the trust base for "bearer in transit". Worst case, a hostile or compromised relay can read and create requests for every visitor's granted wallets and revoke nothing; it cannot sign (no `pbxk1.` seed, no passkey) -- **if** the binding question in section 8 is answered "bound". This is a materially weaker position than "the author operates nothing"; it must be stated on the dApp page.
2. **The page is the crown jewel.** Any script running in the dApp's origin holds the bearer and can invoke the key. The existing strict CSP, Trusted Types and dependency boundaries in `app/` are what protect it; a non-extractable key prevents *theft* of the key, not *use* by injected code.
3. **Egress and bot-management unknowns.** All visitors share the relay's egress IPs; Cloudflare may rate-limit or challenge them, and DCR may be limited per IP. NOT TESTED (LT-2).
4. **Undocumented routes.** The `/agent/*` routes and `/iframe/pairing*` can change between SDK versions (2.0.0 to 2.2.0 in 12 days). A contract test that replays the SDK's request shapes against a mock, plus a visible "PayBox protocol version" check, is needed. A kill switch must be one flag.
5. **Impersonation on the consent screen.** Any site can register a client with any name. A hostile page can register "PayBox CLI" and show the same screen; the user must check the URL and, for pairing, the emoji code. The dApp should show the exact client name it registered and the exact grant it asks for. [M]
6. **Forks.** The static build no longer runs for everyone by itself: a fork must deploy its own relay (a one-click `vercel.json` plus function template) or lose the PayBox connection. The relay's absence must degrade to the already-designed paths (W4, W5), not to errors.
7. **Not a public proxy.** The earlier refusals in `[DD]` ("a public CORS proxy; spoofed `Origin` headers") stay in force: this relay is path-allowlisted, single-purpose and Origin-checked, and sends no spoofed headers.

### W3. Server-side session (relay holds the user's tokens and optionally a `pbxk1.` key): rejected [M]
It would make the author custodian of other people's PayBox credentials (a stored bearer plus a stored signing key is the whole attack surface of section 8), contradicts the binding decision, and gives a single breach exposure for every user. Not an option even though Vercel could do it.

### W4. Local helper that is itself a PayBox client (Architecture B in `[24]` section 9) [H design in `[24]`, unchanged]
Uses the real `@paybox-sh/sdk` unmodified in Node, on the user's machine; the hosted page only talks to the loopback daemon. Works today with no PayBox change and no relay. The hosted `https://` page calling `http://127.0.0.1` runs into Chrome's Local Network Access prompts and Safari mixed-content rules (NOT verified in `[DD]`), which is why the design serves the UI from the daemon itself. That does not satisfy "on the dApp itself" for the Vercel-hosted page; it satisfies the intent for the Local build.

### W5. The user's own agent signs (Architecture A in `[24]`) [H design in `[24]`]
No PayBox client in our code; the PayBox window appears in the user's chat. Works with any PayBox-connected agent, never touches CORS. Not "on the dApp itself".

### W6. Ask PayBox to allow the dApp's origin [NOT DONE; asks and likely answers below]
This is the cleanest outcome: the page then becomes a normal public-client OAuth app, no relay, and the SDK protocol runs as is. The asks, most useful first:

| # | Ask | Why | Likely answer (L unless stated) |
|---|---|---|---|
| A1 | Add `https://xo-markets-explorer.vercel.app` (and a documented way to add other origins) to the CORS allowlist on `/.well-known/*`, `/oauth/register`, `/oauth/device_authorization`, `/oauth/token`, `/agent/*`; no credentials flag needed, the bearer is in a header | removes the relay entirely | The list is currently one origin, so it is policy, not accident; an allowlist per registered app is the usual product answer, but I have no sign PayBox offers one (NOT FOUND). Expect "not now" or "partner programme" (the only partner mechanism found is `?app=<partnerSlug>`, routing only, `[24]` F). |
| A2 | Publish the signing core as a browser-safe package, or a `browser` entry for `@paybox-sh/sdk` without `node:*` imports | avoids a re-implementation drifting from the server | They already have the code in two packages (`@paybox/mcp-app`, the SDK); publishing it is plausible, but the MoonX dependencies are UNLICENSED today. |
| A3 | Confirm in writing that `moonx-sign` signs only the digest of the approved intent for that request id, and that an envelope is bound to one request | decides section 8 | They can answer in one sentence; the test LT-4 answers it without them. |
| A4 | Document what the approver sees for `typedData` and `raw` | blind-signing | Unknown. |
| A5 | Publish rate limits for `/agent/*` and DCR, and `pbxk1.` / `pbx_live_` lifetimes | design inputs | Unknown. |
| A6 | A WalletConnect v2 or EIP-1193 session so that PayBox acts as a wallet for any dApp | the only no-relay, no-SDK, no-new-code path for visitors | No documentation of any such plan (NOT FOUND, `[24]` G). One L hint only: `app.paybox.sh` sends a `connect-src` for `relay.walletconnect.org` and `verify.walletconnect.org`; its purpose is not stated and may be for connecting external wallets to PayBox rather than the reverse. |
| A7 | (MoonX) whether a third-party MoonX app with its own `publishableKey` can address a user's existing PayBox wallet | would make the `@moon-x/react-sdk` model usable | I expect "no": wallets look scoped to the app that created them. NOT FOUND. Not recommended as a path; it is UNLICENSED and a different identity pool. |

I made none of these requests. The user decides whether to approach PayBox; the user's rule "nobody contacts the XO team" is a separate matter from asking PayBox.

### W7. MoonX embedded-wallet SDK inside the dApp [NOT a way to use *their PayBox wallet*]
`@moon-x/react-sdk` (0.29.0, UNLICENSED, React, `publishableKey`, secure iframe, per-op WebAuthn) lets a dApp create **its own MoonX wallets**; the user would hold a second, different wallet. It does not meet "use their PayBox wallet", it needs a MoonX publishable key bound to an origin allowlist (a developer account and contact with MoonX: NOT FOUND whether self-serve), and the licence forbids redistribution. Listed to close the question, not recommended. [M]

### W8. Paste-a-key variant of W2 (user pastes `pbx_live_...` into the page) [M]
Removes OAuth registration and consent from the page but needs the same relay for pairing and signing and puts a long-lived secret (no stated expiry, no rotation tripwire) into browser storage. Strictly worse than device-code; mention only as a fallback if dynamic registration turns out to be rate-limited.

### W9. dApp as an MCP Apps host of PayBox's `ui://paybox/wallet-sign` [rejected in `[24]`, reconfirmed]
Needs `resources/read` and tool proxying on `/mcp` with a bearer (CORS-blocked, so a relay again) and an MCP Apps host implementation with a sandbox-proxy origin, in order to run a window whose only job (digest plus envelope) the page can do itself. No gain over W2. I could not read the resource (an authenticated `/mcp` call, forbidden here). UNVERIFIED.

---

## 10. Recommendation

1. **Keep W4 and W5 as the no-relay baseline** exactly as `[24]` has them. They are the only paths that exist today with no new PayBox behaviour and no author-operated service, and they are what a fork gets by default.
2. **For "use my PayBox wallet on the hosted dApp", the only buildable route today is W2.** Build it as a self-contained module behind its own flag (off), with an interface `PayboxWebSigner` that the signing layer can swap for the loopback or agent paths, and with the relay as a separate, optional, deployable unit (`api/paybox/[...path]` plus allowlist, rate limit, Origin check, no logging), so that a fork without a relay still builds and shows "PayBox web connect unavailable: no relay configured".
3. **Do not enable it before three live results are in (section 11): LT-1 (CORS truth from the real origin), LT-3 (device-code through the relay with a throwaway account), and above all LT-4 (digest binding).** If LT-4 shows the server does not bind digest to approved intent, W2 must be restricted to read-only plus `message` and `typedData` signing with the full intent displayed by the page, and the decision to go on revisited, because the page's key could then sign anything while any request is pending.
4. **Require `always_approve` and a dedicated credential** for the dApp's client in the dApp's own instructions; refuse to enable signing if `list_credentials` shows another mode on that credential. Do not use `iframe` or `paybox` modes.
5. **Ask PayBox for A1 and A3** in parallel (the user's call); A1 makes the relay disappear, and a "yes" to A3 settles section 8 without a test.
6. **State the trust change in the product copy:** the relay sees bearer tokens; the page holds the signing key; the passkey stays at PayBox; revoking the client in PayBox kills the dApp's access.

---

## 11. Live tests the user must run (each needs a throwaway PayBox account or credential; none was run)

| ID | Test | What it settles | Kill or branch |
|---|---|---|---|
| LT-1 | In the browser console on `https://xo-markets-explorer.vercel.app`: `fetch("https://api.paybox.sh/.well-known/oauth-authorization-server")` and the same to `https://api.paybox.sh/iframe/pairing/00000000-0000-0000-0000-000000000000`. No account, no POST. | Confirms 6.2 from a real browser: the first should fail with a CORS error, the second should return 404 readable. | If the first succeeds, PayBox changed the allowlist; recheck section 6. |
| LT-2 | Deploy the relay (GET `.well-known` only), call it from a Vercel function and from the page; record status, `cf-` headers and any challenge page. | Whether Cloudflare treats Vercel egress like a normal client; relay viability. | A challenge or 403 kills W2 as designed. |
| LT-3 | Device-code login through the relay from the page: register, authorize, approve on a phone, poll to tokens, refresh once, then refresh the old token to confirm client revocation. Record `expires_in`, `interval`, the `exp` of the access token and the grant screen text. | Section 2.1 end to end; whether consent needs a passkey; DCR limits (repeat registration 5 times, politely). | Refresh replay not revoking, or DCR refusing, changes the client-per-visitor design. |
| LT-4 | With a throwaway wallet credential in `always_approve`: create `message` "A" via `POST /agent/wallet-sign`, approve it; at `pending_signature` post a `moonx-sign` envelope for the digest of message "B" (and separately for a random 32-byte payload) to **that** request id. Then post an envelope for "A" to a *different* pending request. Then try `moonx-sign` **before** approval (status `pending_approval`). | Section 8: digest-to-intent binding, envelope-to-request binding, state gating. | A "B" signature returned means the server does not bind: restrict or stop (section 10.3). |
| LT-5 | Pair a key generated by WebCrypto Ed25519 (non-extractable) from the page via `/api/agent-pairings/token` (through the relay) and `/iframe/pairing` (direct); sign one `message`. | Section 4.4: whether PayBox accepts a pairing without a `pbxk1.` token string; whether Ed25519 envelopes verify. | If refused, fall back to a `tweetnacl` key held in IndexedDB (extractable) and tighten CSP. |
| LT-6 | Sign `message`, `typedData` (EIP-712) and `raw` (a fixed 32-byte payload) twice each; recover the signer locally; test determinism and high-s. | Output shape (`r`, `s`, `recovery_id`), assembly rule `27 + yParity`, whether `raw` is accepted for the grant, what the approver screen shows (the user takes screenshots). | Same as `[24]` TP1 and TP5. |
| LT-7 | Leave a paired signer idle for days, then sign; watch for `needs_reauth` or expiry. | Signer lifetime (section 2.3). | A short lifetime forces re-pairing UX. |
| LT-8 | Two tabs refreshing one refresh token concurrently (with and without the Web Locks guard). | Whether the lock is necessary (it is, per docs); what error the page sees. | |
| LT-9 | Poll `GET /agent/requests/{id}` at 1 s for a minute from the relay; record any 429 or throttling headers. Keep it polite. | Rate limits (section 7). | |
| LT-10 | Grant the dApp's client a second credential in `autonomous`, request a `message` signature, and observe whether a passkey is demanded. | The docs conflict in 4.2 (`[05]` B1). | Informational; the product never uses `autonomous`. |

---

## 12. NOT FOUND and unverified (collected)

- Whether `moonx-sign` binds the signed digest to the approved intent and the envelope to one request id. NOT FOUND; server source not readable.
- Whether consent (device-code approval and pairing) needs a fresh passkey assertion; `[D1]` and `SKILL.md` disagree.
- Live `expires_in` and `interval` of the device grant; DCR limits; any rate limit on `/agent/*`, `/oauth/*`, `/mcp`.
- `pbx_live_` key lifetime and scope model beyond the grant; `pbxk1.` signer lifetime and revocation visibility.
- The meaning of `approval_mode: "paybox"` and of `X-Paybox-Signing-Surface: browser` beyond an advisory hint.
- Whether `moonx-sign` or `signature` accept an agent signature without a bearer.
- What the approver sees for `typedData` and `raw`.
- Any PayBox web SDK, partner programme, origin allowlist process, WalletConnect or EIP-1193 session support.
- The relying-party id of PayBox passkeys (inferred from headers only).
- Whether a Vercel-hosted relay is treated normally by Cloudflare in front of `api.paybox.sh`.
- Whether WebCrypto Ed25519 keys can be used for pairing.

---

## 13. Verification (2026-10-20)

What I re-checked first-hand, and how.

1. **npm metadata.** Fetched registry JSON for `@paybox-sh/sdk`, `paybox`, `@moon-x/core`, `@moon-x/evm-adapter`, `@moon-x/solana-adapter`, `@moon-x/react-sdk`, `@paybox-sh/connect-react` with `User-Agent: insurance-markets-research/0.1`. Re-read versions, publish times, licences, dependencies, `bin`, `exports`, `engines`, `dist.fileCount`, `dist.unpackedSize`, publisher account type and absence of `dist.attestations` for 1.0.0, 2.0.0, 2.1.0 and 2.2.0. `@paybox-sh/cli` returns 404 (no such package); `paybox` has no `bin`. An npm search by scope returned only unrelated packages and was discarded.
2. **Tarball.** Obtained the file list (`?meta` on unpkg and the jsDelivr flat listing: 12 files) and downloaded `package.json`, `README.md`, `SKILL.md`, `LICENSE`, `dist/index.js`, `dist/index.d.ts`, `dist/chunk-DWDC6W5P.js`, `dist/cli.js` and both source maps as text. Extracted `sourcesContent` from the two maps to read the original TypeScript. Grepped the bundle for top-level `import` statements (node built-ins listed in 6.1) and for `window.localStorage` (present in the bundled `creds.ts`, absent from the Node chunk). Read the unpkg `@moon-x/evm-adapter@0.3.0` `dist/index.mjs` for the signature assembly. Nothing was installed, built or executed.
3. **Docs.** Fetched `https://docs.paybox.sh/llms-full.txt` (64,429 bytes) and `llms.txt`, and confirmed `https://docs.paybox.sh/sdk-cli` returns 200. Read the sections cited above in full. Grepped the whole file for `rate limit`, `429`, `throttl`, `quota`, `CORS`, `walletconnect`, `browser`: no rate-limit, CORS or WalletConnect statements exist; the one "in your browser" heading ("Signing: in the chat, or in your browser") has a body that describes only the in-chat window.
4. **Live probes (GET and OPTIONS only).** `GET /.well-known/oauth-authorization-server` (shows `device_authorization_endpoint`), `GET /openapi.json` (paths listed in section 3), `GET` of `/iframe`, `/iframe/`, `/iframe/wallet-sign`, `/iframe/index.html` (all 404), response headers of `GET /agent/grants` (401, no rate-limit headers), `GET https://app.paybox.sh/` and `/agent-key?...` (CSP with `frame-ancestors 'self'`, `frame-src https://api.paybox.sh ...`, `connect-src` including WalletConnect relay hosts; `permissions-policy` for `publickey-credentials-get`). CORS matrix: 16 `OPTIONS` routes and 7 `GET` routes for each of three origins (371 output lines kept in the session scratchpad). `GET /iframe/pairing/<zero uuid>` returned 404 with `access-control-allow-origin: *`. No body was sent to PayBox in any probe.
5. **GitHub.** `gh api repos/moonpay/paybox` and `.../contents/clients/sdk` returned 404; `moonpay/paybox-plugin` returned public metadata (MIT). Only repo metadata was read; nothing was cloned.
6. **Repo notes.** Read `docs/research/24-dapp-paybox-tie-in.md` in full and `05-paybox-reference-plugins-b.md` (grep of its SDK, pbxk1 and device-code facts and its verification section B1); grepped `docs/dapp-design.md` and read `app/headers.config.ts` (CSP builder and the `NEVER_IN_APP_HOSTS` guard) and the `connect-src` of `app/vercel.json` for the hosting and CSP facts cited in section 9. I did not re-read `plan.md`, `phase1-gap-closing.md`, `aggregation-design.md`, `market-linking-design.md`, `platform-registry-design.md` or `venue-census.md` in this task; nothing in this note depends on their detail.
7. **Fragment check.** Before finishing I grepped the quoted route paths, field names and error strings in this note against the downloaded sources (`/agent/wallet-sign`, `/agent/requests/${id}/moonx-sign`, `/signature`, `/binding`, `/envelopes`, `/refresh`, `/api/agent-pairings/token`, `/iframe/pairing`, `raw_signing_payload`, `issued_at`, `api_pub`, `signed_body`, `agent_signature`, `recovery_id`, `paybox.walletSign.creds.v2`, `pbxk1.`, `agent signer belongs to another client`, `urn:ietf:params:oauth:grant-type:device_code`, `authorization_pending`, `slow_down`, `x-paybox-signing-surface`); result: every listed fragment was found in the downloaded sources (the two error strings that the README and SKILL.md wrap across lines were found after whitespace normalization, and `frame-ancestors 'self'` was re-read from a fresh response header). A final scan of this file for e-mail-like strings, personal names and absolute home paths found none.
8. **Privacy.** This file contains no email address, personal name, user name, GitHub login or home path. The only account names are the vendor's npm publisher account. Scripted requests used only `insurance-markets-research/0.1`. No `.env`, key or credential file was read.

What I did **not** verify: anything that needs a PayBox account, an authenticated call, a POST, or a signature; the server's behaviour in section 8; the live device-code parameters; any rate limit; Cloudflare's treatment of Vercel egress; WebCrypto Ed25519 acceptance by PayBox; browser behaviour of a built relay or client (nothing was built); the licence status of `@paybox/mcp-app` (it is bundled into the Apache-2.0 SDK but has no separate published licence); that the SDK's REST routes are stable.

## Sources

- https://registry.npmjs.org/@paybox-sh/sdk ; https://registry.npmjs.org/paybox ; https://registry.npmjs.org/@moon-x/core ; https://registry.npmjs.org/@moon-x/evm-adapter ; https://registry.npmjs.org/@moon-x/solana-adapter ; https://registry.npmjs.org/@moon-x/react-sdk ; https://registry.npmjs.org/@paybox-sh/connect-react
- https://unpkg.com/@paybox-sh/sdk@2.2.0/ (README.md, SKILL.md, package.json, LICENSE, dist/index.js, dist/index.d.ts, dist/chunk-DWDC6W5P.js, dist/chunk-DWDC6W5P.js.map, dist/cli.js, dist/cli.js.map) ; https://unpkg.com/@moon-x/evm-adapter@0.3.0/dist/index.mjs ; https://data.jsdelivr.com/v1/packages/npm/@paybox-sh/sdk@2.2.0?structure=flat
- https://docs.paybox.sh/llms-full.txt ; https://docs.paybox.sh/llms.txt ; https://docs.paybox.sh/sdk-cli
- https://api.paybox.sh/.well-known/oauth-authorization-server ; https://api.paybox.sh/openapi.json ; https://api.paybox.sh/ (CORS probes of the routes in section 6.2) ; https://app.paybox.sh/ and https://app.paybox.sh/agent-key (response headers only)
- Repo: `docs/research/24-dapp-paybox-tie-in.md`, `docs/research/05-paybox-reference-plugins-b.md`, `docs/research/06-paybox-platform.md`, `docs/dapp-design.md`, `app/headers.config.ts`.
