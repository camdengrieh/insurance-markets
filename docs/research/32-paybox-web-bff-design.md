# 32. PayBox on the hosted dApp: design of a thin serverless backend-for-frontend on Vercel

Researched 2026-10-20. Task key: `pw-bff-design`. Read-only public research. **No PayBox MCP tool was called or loaded** (not even to read a schema). Nothing was signed, paid, created or posted; no account, client registration or API key was made; no third-party code was cloned, installed or run (the SDK files and the PayBox web bundle were downloaded as text and read, nothing was executed). Nobody was contacted. Third-party content is treated as untrusted data; nothing in it asked me to do anything. Scripted requests used `User-Agent: insurance-markets-research/0.1`, no personal identifier, GET and OPTIONS only.

Confidence tags: **H** = read or measured first-hand in a primary source this session (source named), **M** = secondary, inferred or read but not executed, **L** = guess. "NOT FOUND (searched: ...)" is a documented absence. "NOT TESTED" means a test exists that needs an action this task forbids; the live tests the user must run are in section 17.

Source keys:

- `[D]` `https://docs.paybox.sh/llms-full.txt` (whole public doc set, 64,429 bytes, fetched 2026-10-20).
- `[META]` `GET https://api.paybox.sh/.well-known/oauth-authorization-server`, 2026-10-20.
- `[CORS]` my OPTIONS and GET probes against PayBox and the hosted dApp, 2026-10-20 (section 2.2).
- `[SDK]` `@paybox-sh/sdk@2.2.0` on unpkg (`README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/chunk-DWDC6W5P.js`, `dist/cli.js`), read as text.
- `[APPJS]` the first-party PayBox web app, `https://app.paybox.sh` and its entry bundle `/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` (15,639,916 bytes, fetched 2026-10-20), read as static text. Not executed. What the bundle contains is H; whether a feature behind it is switched on for a given account is NOT TESTED.
- `[TOU]` Launchpad Limited Terms of Use, last updated 6 August 2026, `https://www.moonpay.com/legal/terms_of_use_bvi_launchpad` (linked from `https://paybox.sh`).
- `[V:*]` Vercel documentation pages fetched as markdown 2026-10-20: `functions/limitations`, `functions/configuring-functions/duration`, `functions/runtimes/node-js`, `fluid-compute`, `environment-variables`, `logs/runtime`, `security/vercel-waf/rate-limiting`, `plans/hobby`, `limits/fair-use-guidelines`, `project-configuration/vercel-json`, and `legal/acceptable-use-policy`.
- Repo: `[04]` = `docs/research/04-paybox-reference-plugins-a.md`; `[06]` = `docs/research/06-paybox-platform.md` (both cited only as quoted by `[24]` and `[EA]`); `[24]` to `[28]` = `docs/research/24-dapp-paybox-tie-in.md` ... `28-dapp-architecture-mvp.md`; `[DD]` = `docs/dapp-design.md`; `[EA]` = `docs/everyone-architecture.md`; `[P1]` = `docs/phase1-gap-closing.md`; `[app]` = files under `app/`.

Sibling notes of this task set (other research angles) were not present in `docs/research/` when I read the tree. I do not cite them.

---

## 0. Bottom line

1. **A browser page still cannot be a PayBox client; re-measured today.** A preflight from `https://xo-markets-explorer.vercel.app` to `api.paybox.sh` `/mcp`, `/oauth/token`, `/oauth/register`, `/oauth/device_authorization` and `/agent/wallet-sign` returns 200 with methods and headers but **no `access-control-allow-origin`**; the same probes with `Origin: https://app.paybox.sh` get it (section 2.2) [H, `[CORS]`]. So a hosted-page-only design that talks to PayBox directly is dead unless PayBox changes its CORS policy. A server in the middle is the only way for this page to mint requests as a PayBox client.

2. **Two things I found that change what a BFF needs to be, and that other parts of the repo's notes did not know:**
   - **PayBox has a first-party browser signing page.** The web app ships a route `sign/[request_id]` (`https://app.paybox.sh/sign/<request_id>`): after PayBox sign-in ("This signing link belongs to your PayBox account. Sign in, then open the link again to approve the request") it hosts the signing window in an iframe `https://api.paybox.sh/iframe/shell?r=<request_id>`, i.e. the "browser" signing surface behind the docs heading "Signing: in the chat, or in your browser" [H code `[APPJS]`, H docs `[D]`; the page works for requests minted by another OAuth client: NOT TESTED]. **So the BFF does not need to hold a signing key.** It mints a request with the user's bearer token, hands the user a link to PayBox's own page, and polls `get_request` for the signature. The author's server never touches a `pbxk1.` key and never sees a private key or key share.
   - **The PayBox web app is also a WalletConnect v2 wallet.** The bundle contains Reown WalletKit initialised with metadata name "PayBox", a `/wc` route that accepts a `wc:` URI, session proposals with a "will not connect an app reported as malicious" check, and a request handler that supports only `personal_sign` (text only), `eth_signTypedData_v4`, `solana_signMessage` and `solana_signTransaction`, refuses `eth_sendTransaction` and `eth_signTransaction`, and ties each session to a per-session signing key [H code `[APPJS]`; NOT TESTED, and it contradicts the earlier "no WalletConnect surface" finding in `[24]`, `[28]`, `[DD]`]. Section 3.4 states what that does and does not replace. It is outside this note's task, but a BFF is only justified for what it cannot do (section 3.4).

3. **Recommended design: a "token-only" BFF.** One Vercel Function entry (`api/index.ts`, same project as the static dApp) that does: OAuth 2.1 authorization code + PKCE against PayBox with one registered public client; keeps the result in a **stateless sealed `HttpOnly` cookie** (AES-256-GCM, the author holds only an encryption secret, no database); requests scope `mcp` **without `offline_access`** (PayBox then issues no refresh token [H `[D]` "Opt-in — omit it and no refresh token is issued"], so there is nothing to rotate and nothing long-lived to steal; a session is at most 60 minutes); exposes six same-origin routes; proxies exactly three PayBox tools (`list_credentials`, `request_wallet_sign`, `get_request`) and two intent ops (`typedData`, `message`), `raw` behind its own default-OFF flag; rebuilds the intent server-side from a verified `Prepared` item rather than forwarding the page's intent; **never submits anything to a venue**; logs no token, cookie, body, signature or address.

4. **What the author operates and is exposed to** (section 13): a Vercel project with one secret; one PayBox OAuth client registration; **custody of live access tokens in transit, not keys, not funds, not passkeys, not a database**. A malicious deploy or a leaked secret plus stolen cookies exposes bearer tokens whose reach is "every PayBox MCP tool the user's grant allows" (the `mcp` scope is not tool-scoped [H `[D]`]), where each money or signing operation still pauses for the user's passkey under an `always_approve` grant. The BFF's tool allowlist is **our** control, not PayBox's, and does not bind an attacker who controls the deploy.

5. **It contradicts three binding rules of the earlier design**, deliberately (section 14): "nothing the author operates", "no custody of other people's credentials" and "never a Vercel function of ours" ([EA §1, §2.2], [DD §0], [28 §5.2]). The user's 2026-10-20 requirement ("I want people to be able to use their paybox wallet on the dApp itself") makes that trade; I list every repo statement that must change.

6. **What is proven, what is not.** Proven: the CORS block; PayBox OAuth shapes, scopes, TTLs and the opt-in refresh token; that the web app contains a signing page and a WalletConnect wallet; the shape of every Vercel limit I rely on. **Not proven by anyone: that a request minted by our client can be completed on `/sign/<request_id>`, what that page shows for typed data or a raw digest, whether replay-revocation is per user or global to the client, the access-token size, and whether `tools/call` works without an `initialize` round trip.** Those are live tests BW-T0 to BW-T10 (section 17); the first four decide whether this design works at all.

---

## 1. Scope and constraints

Task: design the thin serverless BFF, assuming a browser cannot do it alone. Constraints carried over from the task and the repo, and how this note treats them:

| Constraint | Treatment here |
|---|---|
| User requirement 2026-10-20: people use their PayBox wallet on the hosted dApp | The goal. The BFF is judged by how little authority it adds beyond that. |
| No fake or placeholder data anywhere; the repo is public | No placeholder values below: names of env vars only; the one concrete client name and redirect URI shapes are the real ones to register. |
| Nothing custodial: no key, no funds | Kept. The BFF holds no wallet key, no `pbxk1.` key (path P0, section 3), no venue credentials. |
| Every write path flag-gated OFF | `PAYBOX_CONNECT_ENABLED` and `PAYBOX_SIGN_ENABLED` both default `0`; `raw` has a third flag. A missing secret fails closed (section 15). |
| Caps are advisory against a compromised agent | Kept and extended: in hosted mode caps are advisory against a compromised *page* too, and the daily ledger does not exist (section 11.4). |
| Nobody contacts the XO team; no browser automation of third-party sites | Untouched. The BFF never calls XO. The user is the one who opens PayBox's page. |
| PayBox terms are no obstacle | Used as stated by the user. Section 13 still states what the terms say, because the author now holds strangers' tokens. |

---

## 2. Facts the design stands on

### 2.1 PayBox (all re-read 2026-10-20)

| Fact | Source | Tag |
|---|---|---|
| OAuth 2.1 server, issuer `https://api.paybox.sh`; endpoints `/oauth/authorize`, `/oauth/token`, `/oauth/register`, `/oauth/device_authorization`; `response_types_supported: ["code"]`, grants `authorization_code`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`; `code_challenge_methods_supported: ["S256"]`; `token_endpoint_auth_methods_supported: ["none"]`; scopes `mcp`, `offline_access`. **No `revocation_endpoint` in the metadata.** | `[META]` | H |
| Public clients only. Dynamic registration (RFC 7591) is an unauthenticated `POST /oauth/register`; `redirect_uris` must be HTTPS or `http://localhost`; matched **exactly** at authorize; a mismatch is an error page, not a redirect. Consent screen is served from `app.paybox.sh`: the user signs in, selects credentials, picks an approval mode per credential, approves with a passkey. | `[D]` "OAuth 2.1" | H |
| Tokens: authorization code 5 min, single use, "Replaying a used code revokes the client (treated as compromise)"; access token JWT HS256, 60 min, audience-bound to the MCP resource; refresh token opaque, 30 days sliding, "Rotated on every use ... Replaying a rotated token revokes the client". | `[D]` | H |
| Scope `mcp` = "Access to the MCP tools"; `offline_access` = "A refresh_token so the client can stay connected. Opt-in — omit it and no refresh token is issued." | `[D]` | H |
| "The token's authority is exactly the grant set the user approved — which credentials, and the approval mode per credential." Revoking a client in the app's Clients screen "immediately kills its access tokens and refresh chain". | `[D]` | H |
| `/mcp`: streamable HTTP, protocol `2025-06-18`, `Authorization: Bearer`. The SDK's own client does `initialize`, then `notifications/initialized`, then `tools/call`, sending `mcp-protocol-version` and no session-id header. A missing or invalid bearer gives 401 with `WWW-Authenticate` pointing at protected-resource metadata. | `[D]`, `[SDK]` chunk lines 726-800 | H |
| `request_wallet_sign {credential_id, intent}`; `op` is one of `message` (EIP-191), `typedData` (EIP-712), `transaction`, `authorization` (EIP-7702), `solanaMessage`, `solanaTransaction`, `raw`. Returns the status envelope; `pending_approval` carries `approval_url`; poll `get_request`; success `output` holds `{signature}`. "Submit once, then poll — never re-issue the original tool call." | `[D]` "MCP tools", "Request lifecycle" | H |
| Statuses: `pending_approval` (passkey in the PayBox app, ~10 minutes, operation-bound), `pending_signature` ("the signing window is producing the artifact"), `success`, `denied`, `error`. Wallet signing "never happens in agent code": the signing window signs client-side via MoonX MPC and posts the artifact back; the agent only polls. | `[D]` | H |
| `get_request`: "Only the client that minted a request can read it." `list_requests`: this client's requests only, outputs redacted. | `[D]` | H |
| `reopen_signing_window` is a real tool name (the SDK calls it with a `X-Paybox-Signing-Surface: in-process` header, then signs with a `pbxk1.` key). `X-Paybox-Signing-Surface` takes `in-process`, `browser` or `none`; "it does not grant signing access". What a `browser` value returns beyond an advisory `next_action`: NOT FOUND. | `[SDK]` README, chunk | H / NOT FOUND |
| A `pbxk1.` key is an ed25519 seed generated by whoever runs `paybox connect`, paired to one client by picking an eight-emoji code in PayBox, via `/api/agent-pairings/token`, `/iframe/pairing`, `/iframe/pairing/{id}` (not public developer surface). The SDK signs a JSON envelope `{raw_signing_payload, key_id, derivation_path, issued_at}` with it and posts to `/agent/requests/{id}/{binding,moonx-sign,signature}`. "A signer is bound to the client that paired it." | `[SDK]` cli.js 627-690, chunk 430-460, 640-660; README | H |
| The first-party web app's routes include `sign/[request_id]`, `wc`, `approvals/[id]`, `clients/[id]`, `agent-key`, `developer-authorize`. `app.paybox.sh` sends `frame-ancestors 'self'`; `api.paybox.sh/iframe/shell` sends `frame-ancestors https://app.paybox.sh`. Neither can be framed by us. | `[APPJS]`, `[CORS]` header reads | H |
| "Third-party apps and MCP clients connect with standard authorization-code + PKCE" and "your app holds a scoped access token it presents on the MCP endpoint." | `[D]` "OAuth 2.1" | H |

### 2.2 CORS, measured 2026-10-20 (exact results)

`OPTIONS` with `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: authorization,content-type,mcp-protocol-version`, one request per second:

| Path on `https://api.paybox.sh` | `Origin: https://xo-markets-explorer.vercel.app` | `Origin: https://app.paybox.sh` |
|---|---|---|
| `/mcp` | 200; `access-control-allow-credentials: true`; methods `GET,POST,PUT,PATCH,DELETE,OPTIONS`; headers `content-type,authorization,x-moonx-access-token,x-moonx-identity-token,x-moonx-presence,mcp-protocol-version`; **no allow-origin** | same, plus `access-control-allow-origin: https://app.paybox.sh` |
| `/oauth/token` | same, no allow-origin | with allow-origin |
| `/oauth/register` | same, no allow-origin | with allow-origin |
| `/oauth/device_authorization` | same, no allow-origin | with allow-origin |
| `/agent/wallet-sign` | same, no allow-origin | with allow-origin |

`GET /.well-known/oauth-authorization-server`, with and without `Origin: https://xo-markets-explorer.vercel.app`: 200, `vary: origin, ...`, `access-control-allow-credentials: true`, no allow-origin. [H] This reproduces `[24 §3.3]` and `[28 §5.1]` for the real hosted origin and adds the device-authorization and `/agent/*` paths.

The hosted dApp itself, 2026-10-20: `GET /` 200, `server: Vercel`, strict CSP with `default-src 'none'` and a closed `connect-src`, `x-frame-options: DENY`, `access-control-allow-origin: *` on the static document; `GET /api/paybox/session` returns **404** (no function exists today). [H]

### 2.3 Vercel facts the design relies on

| Fact | Source | Tag |
|---|---|---|
| With Fluid compute, Node.js function **default max duration is 300 s** on every plan (Hobby maximum 300 s; Pro 800 s, extended 1800 s beta). **The "10 s default" in older notes is out of date for Fluid projects**; Fluid is the default for new projects. Whether the existing dApp project has Fluid on: NOT FOUND (checking needs an authenticated Vercel call, not allowed here). Set `maxDuration` explicitly either way. | `[V:functions/limitations]` (last updated 2026-08-24) | H |
| Request and response body limit 4.5 MB; function bundle 250 MB uncompressed; Hobby and Pro 2 GB / 1 vCPU default; concurrency scales to 30,000 on Hobby and Pro. Fluid compute reuses instances across concurrent invocations, bills active CPU (not I/O wait) plus provisioned memory time, and reduces cold starts by bytecode caching (Node 20+) and production pre-warming. | `[V:functions/limitations]`, `[V:fluid-compute]` | H |
| Vercel recommends one shared entry point `api/index.ts` using `export default { fetch(request) }` (Web Standard) and routing inside it, rather than one function per endpoint. | `[V:functions/runtimes/node-js]` | H |
| Runtime logs include **request path and search parameters**; retention 1 hour Hobby, 1 day Pro, 3 days Enterprise, 30 days with Observability Plus. Each request may log up to 1 MB and 256 lines. | `[V:logs/runtime]` | H |
| WAF rate limiting: Hobby 1 rule per project, Pro 40; fixed window 10 s to 10 min; keys IP and JA4 (Hobby/Pro); counters are per region. | `[V:security/vercel-waf/rate-limiting]` | H |
| Environment variables: 64 KB total per deployment; types **Config** (readable) and **Secret** (write-only after saving). | `[V:environment-variables]` | H |
| **Hobby is "non-commercial personal use only"**; commercial use is "any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project, including a paid employee or consultant writing the code"; requesting or processing payment from visitors is an example; asking for donations is not. | `[V:limits/fair-use-guidelines]` | H |
| Acceptable Use Policy (last updated 2026-04-21) forbids "Impersonation, phishing, or misrepresenting authorization to act on behalf of others". No crypto-specific clause found. | `[V:legal/acceptable-use-policy]` | H / NOT FOUND for crypto |

### 2.4 The shipped hosted-dApp surface this must fit

`app/vercel.json` is static only: `buildCommand`, `outputDirectory: dist/standalone`, and a header block with the CSP, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`. `connect-src 'self'` already permits same-origin `/api/paybox/*` fetches; `form-action 'none'` does not stop link navigations. `COOP: same-origin` means a popup opened to `app.paybox.sh` has no `window.opener`, so the page must learn the result by polling its own BFF, which is the design anyway. `app/package.json` says "Holds no key and talks to no server the author operates" (to be amended, section 14). [H, files read]

---

## 3. Where a signature is completed: the five paths and which one the BFF uses

The BFF's job depends on who finishes the signature after PayBox accepts the intent. Everything here is a path for a request **minted by the BFF with the user's bearer**.

| Path | Who completes the signature | Where a secret lives | Author's added authority | Status |
|---|---|---|---|---|
| **P0. Hosted sign page** (recommended) | The user, in their own browser, on `https://app.paybox.sh/sign/<request_id>` (first-party signing window, MoonX MPC client-side). BFF polls `get_request`. | Nowhere new. | Bearer token only | Page and docs text found `[APPJS][D]`; cross-client completion NOT TESTED (BW-T1) |
| P1. `pbxk1.` key held by the BFF (sealed in the cookie) | The BFF, in a Vercel Function, via the SDK's `completeWalletSignRequest` or hand-rolled REST (`/agent/requests/{id}/binding`, `moonx-sign`, `signature`). | A per-user signing authority in the author's runtime | Bearer + signing authority within the grant | Possible per `[SDK]`; **rejected**: turns the BFF into the thing that signs, and its pairing routes (`/api/agent-pairings/token`, `/iframe/pairing`) are explicitly not developer surface `[D]` |
| P2. `pbxk1.` key held in the browser (non-extractable WebCrypto Ed25519), BFF relays envelopes | The user's browser | The user's browser | Bearer only, but the page must reimplement the SDK signing core and pairing | Not recommended: complexity and undocumented routes for no gain over P0 |
| P3. WalletConnect to `app.paybox.sh/wc` | The user's open PayBox tab | WC session keys in the user's PayBox browser | None (no BFF) | Code found `[APPJS]`; NOT TESTED; narrower (section 3.4) |
| P4. The user's chat agent (existing S1) | The agent's PayBox connector | The agent host | None | Unchanged; the local daemon path in `[DD §3.3]` |

### 3.1 Why P0 is the design

- The BFF never holds a signing credential. The most the author can do with what they hold (a bearer) is create requests, and under `always_approve` every request pauses for the user's passkey, then needs the user's browser to finish at PayBox's page. A compromised BFF cannot complete a signature by itself.
- The user's trust anchor is PayBox's own page on PayBox's own origin, framed by nothing of ours (both `frame-ancestors` headers forbid it). That is a better approval surface than anything the dApp could draw, and it is not forgeable by the dApp's JavaScript.
- It needs only documented tools (`list_credentials`, `request_wallet_sign`, `get_request`) plus a link the BFF builds. The link route is undocumented (section 2.1), so it is a vendor-churn risk, covered by the kill switch and by BW-T1.

### 3.2 What P0 leaves open

1. Whether the sign page accepts a request minted by a different OAuth client of the same account (the page reads the request by the user's first-party session; the MCP rule "only the client that minted a request can read it" governs `get_request`, not the app) [M]. BW-T1.
2. Whether `pending_approval` and `pending_signature` are two screens or one; the user may have to approve on `approval_url` and then open `/sign/<id>`. The BFF returns both links and the page shows the right one for the status.
3. What the page displays for `typedData` and for a `raw` digest (NOT FOUND `[24]`, `[06]`). BW-T8.
4. Whether `X-Paybox-Signing-Surface: browser` makes the tool result carry the sign link in `next_action`. If it does, use that URL (after host validation) rather than constructing one. BW-T1.

### 3.3 If P0 fails

Fallback order: (a) P3 WalletConnect for the typed-data venues it supports; (b) P1 only behind an explicit decision from the user, because it changes the author's exposure from "bearer" to "signing authority"; (c) the local daemon path S1/S2 of `[DD]`, which is unchanged and remains the only path for XO chain 3223 until BW-T5 says otherwise.

### 3.4 WalletConnect (P3): what the bundle shows, and what it does not replace

Read from `[APPJS]` (static, not run). All M until BW-T6:

| Item | What the code says |
|---|---|
| Role | `WalletKit.init({core, metadata:{name:"PayBox", description:"The payment vault for AI agents", url:"https://paybox.sh"}})`, a `/wc` route that calls `walletKit.pair({uri})`, handles `session_proposal`, approves or rejects, and handles `session_request` (`respondSessionRequest`). A package list in the bundle names `@reown/walletkit ^1.5.6` and `@walletconnect/core ^2.23.10`. |
| Chains and methods it will approve | EVM chains = the PayBox catalog's EVM entries (`PORTFOLIO_CHAINS` with family `evm`), plus Solana. Methods: `personal_sign`, `eth_signTypedData_v4`; Solana `solana_signMessage`, `solana_signTransaction`. Events `accountsChanged`, `chainChanged`. |
| Per method | `personal_sign`: the hex is decoded as strict UTF-8; text becomes `{op:"message"}`; **non-text bytes are refused** ("This message is raw bytes, not text"). `eth_signTypedData_v4`: becomes `{op:"typedData"}`; refused if `domain.chainId` differs from the chain the session approved. `eth_sendTransaction`, `solana_signAndSendTransaction`: refused ("PayBox signs but does not broadcast for an app yet"). `eth_signTransaction`: refused. No `eth_sign`, no raw digest. |
| Safety checks | Refuses an app flagged `isScam` by the WalletConnect verify context; shows name, URL, networks, granted methods, accounts. |
| Keys | Each session needs a per-session signing key ("Generate signing key"), stored with the session in the user's browser; the signing request is created through the same PayBox request path and signed in that tab. The tab must stay open and elects a "leader" tab. |

What it **cannot** replace: raw 32-byte digests (XO UserOps are `raw`), anything on chain 3223 (not in the catalog, and a domain `chainId` must equal the session chain), transactions, authorizations. What it **does** replace, if it works: the BFF for typed-data and text signing on catalog chains, with no author-operated component (the dApp would still need a WalletConnect project identifier and relies on the Reown relay, which is a third party it does not operate). **A BFF is justified for the XO path only if BW-T5 shows PayBox's MCP `request_wallet_sign` accepts what WalletConnect refuses** (raw, or typed data with domain chain 3223), and for users who will not keep a PayBox tab open. I did not design the WalletConnect integration; it belongs to another angle.

---

## 4. Architecture

### 4.1 Picture

```
 USER'S BROWSER (hosted dApp, strict CSP, Trusted Types)          PAYBOX
 +-------------------------------------+                +-------------------------------+
 | page (static, no secret)            |  1 navigate    | app.paybox.sh  consent + sign |
 |  - builds/reads Prepared items      |--------------->|   /sign/<request_id>   (P0)   |
 |  - verifyPrepared + Signature Card  |                |   /approvals/<id>             |
 |  - recover-check of the signature   |                | api.paybox.sh                 |
 +--------------+----------------------+                |   /oauth/{authorize,token}    |
                | same-origin fetch, HttpOnly cookie,   |   /mcp  (Bearer)              |
                | CSRF header                           +-------------^-----------------+
                v                                                     | HTTPS (server to server,
 VERCEL (same project)                                                | no CORS involved)
 +--------------------------------------------------------------------+------+
 | api/index.ts   (one Function, Node, Fluid)                                  |
 |  /api/paybox/login      302 to PayBox authorize (PKCE), sealed state cookie |
 |  /api/paybox/callback   exchange code once, set sealed session cookie        |
 |  /api/paybox/session    who/what is connected; CSRF token; expiry            |
 |  /api/paybox/sign       POST Prepared -> verify -> mint request -> ids+links |
 |  /api/paybox/request    GET poll -> allowlisted projection of get_request    |
 |  /api/paybox/logout     POST clear cookies                                   |
 |  holds: SESSION_KEYS (secret). stores: nothing.                              |
 +-----------------------------------------------------------------------------+
        (never: venues, XO, money tools, secrets other than the cookie key)
```

### 4.2 Who does what (the relay is local-only, so say it explicitly)

| Step | Page | BFF | PayBox | XO / venue | Local daemon (optional) |
|---|---|---|---|---|---|
| Read public data (markets, books where CORS allows, balances) | yes | no | no | serves | no |
| Derive the owner's XO/Kernel account | yes (pure code, `[app]/core/account.ts`) | re-derives to check | no | no | yes |
| Build a `Prepared` item | only from CORS-reachable public data | **never builds** | no | no | yes (relay-embedded; the only place that has orderbook/bundler reach and the ledger) |
| `verifyPrepared` + Signature Card | **yes, before the Sign button works** | **yes again**, server-side, on the same pure code | no | no | yes |
| Policy and per-item caps | shows | **enforces** (section 11.3) | grant is PayBox's own limit | no | relay caps ($10/order, $50/day) |
| Daily ledger / cumulative cap | no | **none** (no state; section 11.4) | no | no | relay |
| Mint the sign request | no | yes, with the session bearer | creates and audits it | no | no |
| Human approval and signature | opens the link | polls | passkey, signing window | no | no |
| Recover-check (`ecrecover(expected_digest, signature) == owner`) | **yes, before any use** | no (it does not need the signature) | no | no | yes before submit |
| Submit to a venue | only where the venue is browser-reachable and the user chooses | **never** | no | receives | yes (orderbook/bundler hosts block browsers, `[28 §5.1]`) |
| Audit trail | local UI log | structured log without secrets (section 10) | **the durable one** (`list_requests`, the user's) | its own | relay audit chain |
| Kill switch | shows state | `PAYBOX_SIGN_ENABLED`, `BFF_KILL`, a Vercel Firewall rule | user kills the client | no | `KILL` |

Honest consequence for XO: the BFF supplies only the **signing leg**. A hosted page cannot build or submit XO orders and UserOps itself (the orderbook and bundler hosts send no CORS headers for third-party origins, `[28 §5.1]`, and door (a) is unobserved). Until a prepare/submit path exists that is reachable from the hosted page, the BFF's practical value for XO is limited to flows where the page can build the item from CORS-open data and the signature is submitted by something the user runs. Building an author-operated prepare/submit proxy would be a much larger step (XO region and wash-trading terms concentrate on one egress, `[EA §2.2]`) and is **not** designed here (decision BD6, section 16).

### 4.3 The user-visible flow

1. **Connect PayBox** button. The page navigates to `/api/paybox/login`.
2. The BFF redirects to PayBox's `/oauth/authorize` (PKCE S256, `scope=mcp`, `resource=https://api.paybox.sh/mcp`). The user signs into PayBox, selects **one dedicated wallet credential**, chooses **Human approval**, approves with a passkey.
3. PayBox redirects to `/api/paybox/callback?code=...&state=...`. The BFF exchanges the code once, calls `list_credentials`, sets the sealed session cookie, redirects to `/`.
4. The page calls `/api/paybox/session` and shows: connected, the EVM address (full EIP-55), credential approval mode, session expiry countdown.
5. The user prepares an action. The Signature Card verifies it. **Sign with PayBox** posts the `Prepared` item to `/api/paybox/sign`.
6. The BFF verifies, rebuilds the intent, calls `request_wallet_sign`, returns `{request_id, status, approval_url?, sign_url}`. The page opens `approval_url` / `sign_url` in a new tab (PayBox's pages, not framed).
7. The page polls `/api/paybox/request?id=...`. On `success` it gets `{signature}`, runs the recover-check, and hands it to the submit path (section 4.2). Reconnect after at most 60 minutes.

---

## 5. Authentication flow options

### 5.1 Authorization code + PKCE (recommended) versus device code

| | Authorization code + PKCE | Device code (`/oauth/device_authorization`) |
|---|---|---|
| Fit for a hosted page | Native: browser redirects, we have a stable HTTPS redirect URI | Designed for headless; the page would display a user code and poll |
| Phishing: attacker starts the flow and gets a victim to approve | Not possible: the code returns to the browser that holds the sealed `state`+verifier cookie | **Possible (device-code phishing).** An attacker starts a flow on their own browser and persuades a victim to approve `user_code`; the attacker's polling session then holds the victim's grant. |
| Secrets in URLs | `code` and `state` appear in one request URL (visible in Vercel runtime logs, section 10) | None |
| Phone-approves-desktop-uses | Works too (the consent page is a normal web page) | Natural |
| Polling cost | None | One short Function per poll for up to the code lifetime |
| Registered redirect URI | Required, exact match | Not needed (the SDK registers a dummy `http://127.0.0.1/device`) |
| Verdict | **Default** | **Not shipped**; keep as a flagged fallback only if PayBox refuses our redirect URI or an in-app browser breaks the redirect |

Sources: `[D]` (code flow), `[META]` (device endpoint and grant), `[SDK]` chunk lines 120-200 (the CLI's device registration and polling). The device-code phishing risk is a property of the grant type in general (M); PayBox's own handling of a user code on the consent screen is NOT FOUND.

### 5.2 Client registration: one static public client, or one per login

- **R1 (recommended): register once.** The author (or a one-off script run by the user) performs a single `POST /oauth/register` with `client_name`, `redirect_uris` (the production callback `https://xo-markets-explorer.vercel.app/api/paybox/callback` and a `http://localhost` callback for development), `token_endpoint_auth_method: none`, `grant_types: ["authorization_code"]`, `response_types: ["code"]`, `scope: "mcp"`. The returned `client_id` is public and goes in `PAYBOX_OAUTH_CLIENT_ID`. Pros: no per-login call to PayBox, nothing for an attacker to amplify, one entry in the user's PayBox Clients screen. Cons: the documented rule "Replaying a used code or a rotated refresh token revokes the client" may apply to **all users** of that `client_id` (granularity NOT FOUND) so one replayed callback could lock everyone out until the client is re-registered. The design removes the two replay sources it controls (no refresh tokens at all; the callback consumes its `state` cookie in the same response, so a reload or prefetch of the callback URL is rejected before any call to PayBox).
- **R2 (fallback): register on every login** (as the SDK does for each `paybox login`). Each user is then their own client, so replay or revocation hits one user. Cons: every login makes an unauthenticated `POST /oauth/register` to PayBox (an amplification path to be rate-limited hard), the `client_id` must ride in the sealed state cookie, and the user's PayBox Clients screen fills with one entry per login (the CLI behaves this way; whether PayBox merges or lists them: NOT FOUND).
- **Decision BD3 depends on BW-T2** (per-user versus global revocation). Default R1.

### 5.3 What the BFF requests and checks

- Authorize: `response_type=code`, `client_id`, `redirect_uri` (derived from `APP_ORIGIN`, never from the request), `code_challenge` (S256 over a 32-byte random verifier), `scope=mcp`, `resource=https://api.paybox.sh/mcp`, `state` (32 random bytes). **No `offline_access`.**
- Discovery: endpoints are pinned as constants and compared against the metadata document at cold start; a difference fails closed and logs a code (no SSRF-style dependence on a fetched URL).
- Callback: reject without a valid sealed state cookie **before** any call to PayBox; compare `state` in constant time; require `code`; exchange with `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`; require `token_type` Bearer; clamp `expires_in` to at most 3600; **discard any `refresh_token` in the response** (it should not exist) and log a warning code if one appears.
- Decode the JWT payload only for display hints (`exp`); treat claims as untrusted; the authority is whatever `/mcp` accepts.
- Immediately call `list_credentials`; keep only wallet credentials with an EVM `address`; record `credential_id`, `address`, `approval_mode`, `chains`. Treat the credential `name` as attacker-influenced text (it is user-chosen in PayBox; render as text only).
- **Approval-mode gate (fail closed):** the BFF connects only when at least one granted wallet credential has `approval_mode: always_approve`, and signs only on such credentials (`PAYBOX_ALLOWED_APPROVAL_MODES`, default `always_approve`). `autonomous` is refused for the dApp; `iframe` stays refused until BW-T1 shows what it does; `paybox` (SDK type only, `[24]`) is refused. The check is repeated at mint time because the user can change a grant in PayBox at any time.

---

## 6. Where the token lives

### 6.1 (a) Sealed `HttpOnly` cookie, stateless (recommended) versus (b) server-side store

| | (a) Sealed cookie | (b) Server-side store (Redis/KV/Postgres) | (c) Hybrid: sealed cookie + tiny revocation set |
|---|---|---|---|
| What the author persists | Nothing | Every active session: access token (and refresh token and `pbxk1.` if used) | Only random session ids to deny, with an expiry |
| What a **database breach** exposes | n/a (no database) | All active users' bearer tokens, their credential ids, addresses, balances reachable via the tools, ability to raise approval prompts in every victim's PayBox app; with refresh tokens, 30-day sliding persistence | Nothing usable (ids only) |
| What a **leaked encryption secret** exposes | Nothing alone; plus a stolen cookie decrypts that one session | The store key is separate; the leak that matters is the DB | Same as (a) |
| What a **malicious deploy / compromised BFF code** exposes | Tokens of requests that arrive **during the compromise window**, from then on | Everything in the store, historical and live | Same as (a) |
| Logout / revocation | Clears the browser's copy; **a copied cookie stays valid until its expiry (at most 60 min)**; PayBox has no revocation endpoint in its metadata `[META]`, so the BFF cannot revoke upstream; the user's real revoke is the PayBox Clients screen (instant, `[D]`) | Delete the row | Add the session id to the deny set; the copied cookie dies at once at the BFF |
| Rotation races | None, because there is no refresh token | Needs locking for single-flight refresh | None |
| Operational burden | Zero | A managed store, backups, access control, retention, breach duty | One tiny store (Edge Config or KV) holding ids only |
| Verdict | **Default (v1)** | Rejected for v1 | Optional add-on if cookie-copy replay matters to the user |

The decisive point is the compromise-window property: with (a) the author cannot lose a stored pile of other people's tokens because there is none.

### 6.2 Cookie specification

- Session: `__Secure-pbx_sess`, `Secure; HttpOnly; SameSite=Strict; Path=/api/paybox; Max-Age = remaining token life minus 60 s`. No `Domain` attribute. `Path=/api/paybox` means the cookie is not attached to static asset requests, which shrinks exposure and traffic. (`__Host-` would require `Path=/`; the path scope is judged worth more here.)
- Login state: `__Secure-pbx_state`, `Secure; HttpOnly; SameSite=Lax; Path=/api/paybox; Max-Age=600`. `Lax` is required: the return from `api.paybox.sh` is a cross-site top-level GET navigation, and `Strict` cookies would not be sent. It contains `{state, verifier, ret, exp}`; it is deleted in the callback response whether the exchange succeeds or not. `ret` is an allowlisted route id, never a URL (no open redirect).
- Contents of the session payload: `{v, sid, iat, exp, at, cid, creds:[{id, addr, mode, chains}], inflight?}`. `at` is the access token. No refresh token. No `pbxk1.`. `sid` is a random 128-bit id used for the CSRF token and for the optional deny set; it is logged only as a keyed hash.
- Sealing: AES-256-GCM with Node's `crypto`, key = HKDF-SHA256(`SESSION_KEYS[kid]`, salt `pbx-bff-v1`, info = cookie name) so the two cookies use different keys, 96-bit random IV, additional authenticated data = `v|cookie-name|exp`, output `v1.<kid>.<base64url(iv|ciphertext|tag)>`. Zero dependencies for the sealing code (the repo keeps the app's runtime dependency set at seven packages `[app]/package.json`). `SESSION_KEYS` is a list of `{kid, secret}`; the first signs, all open; rotation = prepend a key, remove the old one after 60 minutes.
- Size: browsers accept about 4096 bytes per cookie (M). The access token is an HS256 JWT carrying the grant set; its size is unknown (BW-T3). If the sealed value exceeds about 3.5 KB, split into `.1` and `.2` cookies; if it exceeds that again, the design fails and falls to (b) or (c).
- All `/api/paybox/*` responses: `Cache-Control: no-store`, `X-Robots-Tag: noindex`, no `Access-Control-*` headers of any kind.

### 6.3 What (a) cannot do

It cannot make a session survive past the 60-minute token. That is the price of no refresh token (section 7), and it is accepted: the user re-approves on the PayBox consent page once an hour at most, and the page preserves non-sensitive UI state in `sessionStorage` across the redirect.

---

## 7. Rotation, scopes, lifetime

- **Rotation: none in v1, by design.** PayBox rotates refresh tokens on every use and treats replay as compromise `[D]`. A stateless BFF cannot serialise refreshes: two tabs, a retried request or a response lost after PayBox accepted the refresh would replay a spent token and revoke the client (for this user, or for all users under R1). Omitting `offline_access` removes the whole class. If longer sessions are ever wanted, the minimum safe shape is: refresh only in a single `POST /api/paybox/refresh` called by one tab under the Web Locks API, the new refresh token written in the response, and a store holding the previous token for a grace window. That is option (b) and is not designed for v1. Decision BD2.
- **Scopes:** request `mcp` only. The consent screen's credential selection and approval mode are the real scoping and are PayBox's. `mcp` is not tool-scoped `[D]`, so "no money tools" is enforced by our allowlist and by nothing at PayBox (section 11.1). Ask in section 16: finer scopes.
- **Session lifetime:** `exp = min(token expires_in, 3600) - 60 s`. The UI shows a countdown and offers Reconnect at five minutes left when idle. No sliding renewal.
- **Approval clock versus venue clocks:** a PayBox approval lasts about 10 minutes, but XO's auth item is valid 90 s and an order needs 90 s of life at submit `[DD §3.6]`; with two PayBox screens (approve, then sign) an item will often expire. The page shows the countdown and re-prepares; the BFF refuses an item with under 30 s left.

---

## 8. Request security

| Control | Specification |
|---|---|
| Origin pinning | `APP_ORIGIN` is an environment constant, never read from `Host`. Every state-changing route (`sign`, `logout`) requires `Origin === APP_ORIGIN`; missing or other value gives 403. `login` and `callback` are GET navigations. |
| Fetch metadata | State-changing routes also require `Sec-Fetch-Site: same-origin` (when the header is absent, e.g. non-browser clients, the request is refused; the page always sends it). |
| CSRF | POST only, `Content-Type: application/json` (non-simple, so a cross-origin form cannot send it), plus header `X-PBX-CSRF: <token>`; the token is `HMAC(csrf-key, sid)` returned in the body of `GET /api/paybox/session`, so a cross-origin page cannot read it (no CORS) and a cookie alone is not enough. |
| CORS | None. No `Access-Control-Allow-*` header on any `/api/paybox/*` response; `OPTIONS` answers 204 without them. Same-origin fetches need none. |
| Login CSRF | State bound to the sealed state cookie, single use, 10-minute life (section 6.2). |
| Open redirect | Return target is an allowlist key inside the sealed state, never a parameter. Links the BFF returns (`approval_url`, `sign_url`) are checked to be `https://app.paybox.sh/...` before they leave the function; the page renders them only after the same check. |
| SSRF | The BFF talks to exactly one origin, `https://api.paybox.sh`, with a fixed path set, redirects disabled, 8 s timeout, 1 MB response cap. No user-supplied URL is ever fetched. |
| Cookie hygiene | Section 6.2. Logout clears both cookies with the same attributes. |
| Headers | The existing site headers apply (`vercel.json`); add `Cache-Control: no-store` for the API path. No CSP change is needed for `/api/*` (`connect-src 'self'`). Links to PayBox are navigations, which `connect-src` does not govern. |
| Method/route allowlist | Unknown path or method gives 404/405 with an empty body; no stack traces; every error is a short code (section 10). |

---

## 9. Rate limiting, abuse, cost, and Vercel behaviour

### 9.1 Endpoint exposure

| Route | Needs session | Upstream calls | Abuse shape |
|---|---|---|---|
| `GET /api/paybox/login` | no | none (R1) | Cheap redirect; bots hit it. With R2 it would be a call to PayBox per hit, so R2 needs a hard limit. |
| `GET /api/paybox/callback` | state cookie | 1 token call, 1 MCP session (`initialize`, `initialized`, `list_credentials`) | Without a valid state cookie it returns before any upstream call. |
| `GET /api/paybox/session` | yes | none | Decrypt only. |
| `POST /api/paybox/sign` | yes | MCP `list_credentials` (mode re-check) and `request_wallet_sign` | Creates approval prompts in the user's PayBox app: approval-fatigue vector. |
| `GET /api/paybox/request` | yes | MCP `get_request` | The high-volume route (polling). |
| `POST /api/paybox/logout` | optional | none | Trivial. |

### 9.2 Limits

- **Vercel WAF rate limit** (Hobby: one rule per project; Pro: 40): a rule on path prefix `/api/paybox/` at 60 requests per minute per IP, action Deny/429; on Pro a second, stricter rule on `/api/paybox/sign` (6 per minute). Counters are per region `[V:security/vercel-waf/rate-limiting]`, so the limit is approximate.
- **In-process limits** (best effort; instance memory is not shared): one in-flight sign request per session, recorded in the sealed cookie (`inflight`: request id and expiry; a new `sign` while it is non-terminal returns the existing id with 409). A hard per-session ceiling of 6 mints per hour is tracked in the same cookie; it is resettable by re-login and is a speed bump, not a control.
- **Polling discipline:** the page polls every 3 s for the first 30 s, then 5 s, then 10 s, pauses while the tab is hidden, stops at the request's terminal status or 11 minutes. The BFF returns `Retry-After` and refuses faster polling by comparing the request's `since` parameter. Rough count: 25 polls for a user who approves within two minutes; at most about 80 for the full 10 minutes. (Estimate, L.)
- **Alternatives considered for waiting:** a streaming/SSE Function that polls PayBox internally (one long invocation per approval, limited to the configured `maxDuration`, up to 300 s on Hobby) trades many short invocations for long provisioned-memory time and reconnect logic. Not chosen for v1; revisit if invocation counts, not CPU, become the cost driver (Vercel bills active CPU, not I/O wait, with Fluid, `[V:functions/limitations]`).

### 9.3 Duration, memory, cold starts

- `maxDuration`: set **15 s** on every BFF Function in `vercel.json`, regardless of the 300 s Fluid default, so a stuck upstream call cannot run for five minutes (the task text's "10 s default" is the pre-Fluid figure; I could not check whether this project has Fluid on). Per-upstream-call timeout 8 s.
- Region: Vercel's default function region is `iad1` `[V:functions/limitations]`; where PayBox's API runs is NOT FOUND (it sits behind Cloudflare). Pick the region after BW-T7 measures latency; multi-region needs Pro.
- Cold start: the BFF imports only `node:crypto`, `fetch`, and (for section 11.2) the shared pure `verifyPrepared`/`rebuildDecoded` code and the packages they need. **It must not import `@paybox-sh/sdk`** (it pulls `@solana/web3.js`, `viem`, MoonX packages and file-system config code, `[SDK]` dependencies) because the BFF needs three MCP calls that are a few lines of `fetch`. Bytecode caching and pre-warming reduce cold starts `[V:fluid-compute]`; the size of the effect here is NOT FOUND (BW-T7 measures it).
- MCP handshake cost: the SDK does `initialize` and `notifications/initialized` before `tools/call`. The BFF memoises the initialised state per warm instance and per token in module scope and re-initialises on any 4xx. Whether `tools/call` works without `initialize` and whether PayBox returns a session id: NOT TESTED (BW-T4).
- Cost: with Fluid, active CPU is billed while code runs and pauses on I/O wait; memory is billed for running instances `[V:functions/limitations]`. Per signature: about 1 mint + 25 to 80 polls; the BFF's own CPU per call is a few milliseconds (decrypt, one HTTP call). Prices are not stated here (NOT FOUND in the pages read). Protect the budget with a Vercel Spend Management alert on Pro and the WAF rules above. **Hobby cannot be used if the dApp earns money for anyone involved** `[V:limits/fair-use-guidelines]` (section 13).

---

## 10. Logging that never contains tokens or user data

Rules:

1. One `log()` function is the only code path that writes to stdout/stderr. Its argument type is a closed object `{ts, level, route, method, status, ms, code, sid_h?}`. Nothing else is accepted by the type; free-form messages are not.
2. `code` is a short enumerated reason (`state_missing`, `pkce_fail`, `token_http_4xx`, `mode_refused`, `policy_chain`, `upstream_timeout`, ...). Upstream error bodies are never logged (they can echo request fields).
3. Never logged, anywhere: cookie values, `Authorization`, any token or JWT, OAuth `code` and `state`, `code_verifier`, request or response bodies, typed data, messages, signatures, credential names, **addresses**, IP addresses, `User-Agent`, `request_id` values (the hashed `sid_h` and the status code are enough). `console.error(err)` is banned because error objects can carry request configuration.
4. A redaction net on top of the typed logger: any string matching `eyJ[A-Za-z0-9_-]{10,}`, `pbxk1\.`, `pbx_live_`, `Bearer `, or `0x[0-9a-fA-F]{64,}` is replaced before output. A unit test feeds fixtures containing each; a build test fails if the built Function contains `console.` outside `log.ts` (mirrors the repo's audit-scanner rule, `[DD §5.4]`).
5. What Vercel logs on its own, outside our control: runtime logs record the request path **and search parameters** `[V:logs/runtime]`, so `/api/paybox/callback?code=...&state=...` is visible to anyone with log access for 1 hour (Hobby) or 1 day (Pro; 30 days with Observability Plus). The `code` is single-use, 5 minutes, and useless without the PKCE verifier that exists only in the user's cookie; the `state` is single-use. This is acceptable and must be stated, not hidden. Do not add a Log Drain, and do not buy Observability Plus for this project, unless the sink applies the same redaction.
6. No analytics, no error-tracking SaaS, no tracing exporter in the BFF.

---

## 11. How the BFF proxies PayBox calls

### 11.1 Tool allowlist

| PayBox tool | BFF use | Exposed to the page? |
|---|---|---|
| `list_credentials` | at callback and before each mint, for the mode/address gate | only the sanitised projection via `/session` |
| `request_wallet_sign` | the only write | indirectly, through `/sign` |
| `get_request` | poll | allowlisted projection via `/request` |
| `check_operation_readiness` | optional dry run of an intent before minting (cheaper failure) | no |
| `reopen_signing_window` | **not used** (P0 does not need it) | no |
| `list_requests` | **not used** (outputs are redacted, cannot dedupe by intent) | no |
| `request_transfer`, `request_swap`, `request_payment`, `pay_x402`, `use_service`, `use_plugin`, `request_secret`, `claim_payment_credentials`, `get_portfolio`, `get_buy_link`, `get_deposit_link`, `request_account_change`, all discovery tools | **denied** | no |

Implementation: a `Set` of three (optionally four) tool names; any other name throws before the network call; a unit test enumerates PayBox's documented tool list and asserts that exactly the allowed ones pass. **This is a BFF control, not a PayBox one: the bearer can call every tool the grant allows.** That is why a compromised deploy is dangerous even though the code does not call them (section 12, T1).

### 11.2 Intent ops and the server-side rebuild

- **The BFF never forwards the page's `intent`.** The page sends the `Prepared` item (including its decoded block). The BFF runs the same pure `verifyPrepared` + `rebuildDecoded` the Signature Card runs (`@shared/relay/contract`, `@shared/xo/signing/rebuild`, `[app]/features/signing/card.ts`; shipped and unit-tested in the repo per `[DD §5.3]`, not re-run by me), takes the typed data or raw payload **from the rebuild result** (`RebuildSuccess.typed_data`, whose use is already required by `verifyPrepared` so "nothing outside what the digest hashes can ride along"), and builds the `request_wallet_sign` intent from that. A page that skipped the card, or an XSS that tampered with the item after the card passed, cannot make the BFF sign a different payload than the decoded fields it can verify.
- Allowed ops: `typedData` (EIP-712) and `message` (EIP-191 text). `raw` only when `PAYBOX_RAW_ENABLED=1` **and** `digest_form` is a known form (`userOpHash`, `kernelWrappedOrderHash`, `kernelWrappedClobAuth`) **and** the rebuild proves the digest. `transaction`, `authorization` (EIP-7702) and both Solana ops are never built.
- Typed-data policy (deny by default): `domain.chainId` present and in `SIGN_ALLOWED_CHAIN_IDS`; `primaryType` and `verifyingContract` pair in a checked-in registry; message size at most 8 KB; denied by name regardless: `Permit`, `PermitSingle`, `PermitBatch`, `PermitTransferFrom`, `PermitBatchTransferFrom`, `Delegation`, any `SetApprovalForAll`-shaped type (drainer primitives, `[28 §8.1]`).
- `message` policy: at most 280 printable ASCII characters, matching one of a small set of server-side templates with a server-issued nonce. Arbitrary page-authored text is refused (the PayBox approval screen would show attacker-chosen words next to our client name).
- Owner binding: `prepared.owner` must equal the `address` of a granted wallet credential in `/session` (not a page-supplied value); the derived XO account must equal `prepared.account` (`deriveAccount`); `credential_id` must be one of the session's.
- Output projection: `/request` returns `{status, approval_url?, sign_url?, signature?, message?}`; `signature` must match `^0x[0-9a-fA-F]{130}$` (65 bytes) or the BFF returns `unexpected_shape` (the shape for `raw` is NOT TESTED, `[24 §12 TP1]`); everything else from PayBox is dropped.
- The signature then goes to the page, which does the recover-check before use. The BFF has no submit capability and no venue credentials.

### 11.3 Per-item checks the BFF can make without state

Chain allowlist, TTL (refuse under 30 s; `[DD §5.3]` uses 90 s for orders), per-order notional from the decoded terms (default cap equals the relay's $10 per order, `PAYBOX_PER_ITEM_CAP_USD`), destinations pinned to owner or derived account (`[DD §6]` row 3), mode gate, credential gate, one in-flight request.

### 11.4 Caps without our relay (stated plainly)

The relay, its ledger and the $50 daily cap run only in the local daemon `[EA §2.1]`. The hosted BFF has no database, so **there is no cumulative cap**. What exists: the per-item cap above; a speed bump in the cookie (resettable); PayBox's human approval for each signature; and the dedicated, small-balance credential. The UI must label hosted-mode caps "per item only; no daily limit" (never "protected"). If a daily limit is wanted, the options are an Edge Config/KV ledger keyed by address (stores addresses and amounts: privacy exposure, no tokens) or sending the user to the local daemon. Decision BD5.

### 11.5 Idempotency

PayBox's rule is "submit once, then poll" `[D]`. If the Function times out after PayBox created the request but before the response reached the page, the page's retry would create a second request (a second approval prompt). Mitigations: the `inflight` marker above; the page persists `request_id` per prepared item in `sessionStorage` and never re-mints; the BFF refuses a mint for the same `prepared_id` while a non-terminal request exists. A race can still produce two prompts; the user approves one and rejects the other; the venue-side one-send-per-item rule (`[DD §0]`) lives with whoever submits.

---

## 12. Threat table

Rows T1 to T14. "Residual" is what remains after the stated control.

| # | Threat | How it plays out here | Control | Residual |
|---|---|---|---|---|
| T1 | **BFF compromise**: malicious deploy (stolen Vercel or GitHub access, bad dependency), or leak of `SESSION_KEYS` | Attacker who controls the deploy sees the tokens of every request during the window, can read credentials/addresses, and can call **any** PayBox tool the grant allows (the allowlist is our code). With `always_approve` each money or signing request still needs the user's passkey and, for signatures, the user's browser at PayBox's page. They can phish through approval prompts that carry our client name. They cannot complete a signature alone (no `pbxk1.` key anywhere). They can also serve a malicious page (same deploy) that lies in the Signature Card. | No stored tokens; 60-minute tokens; `always_approve` gate; no signing authority in the BFF; protected branch + required review; Vercel account passkeys and 2FA; deploy from a tagged commit with the published build hash `[28 §8.1]`; env secret type; secret rotation drill; kill switches (section 15); small-balance dedicated credential | A fully compromised deploy defeats every in-page and in-BFF control. The user's last line is PayBox's own approval screen, which may show only a hash. This is strictly worse than the old local-first model and is the price of the requirement. |
| T2 | **XSS in the dApp** | Script in the page can call `/api/paybox/session` (reads the CSRF token) and `/sign` with in-policy items, ride the session, read the connected address, and draw a lying Signature Card. It cannot read the HttpOnly cookie or the token. | CSP with `default-src 'none'`, no inline, Trusted Types required (`vercel.json`), untrusted text rendered as text, exact pins and 14-day release age `[28 §8.4]`, BFF rebuilds intents and enforces policy so an XSS can only obtain in-policy items for the user's own account, one in-flight request, PayBox approval per signature | Approval fatigue; an XSS can time a request when the user is already expecting one. |
| T3 | **Prompt injection** | The BFF has no model and processes only typed JSON. Market titles and venue text reach the page only as `Untrusted` text. The PayBox approval screen shows our intent; free text is refused by the `message` template rule. A user's external agent is out of scope (it never sees these routes). | No LLM in the BFF; closed schemas; template-only `message`; section 11.2 | None added by the BFF. |
| T4 | **Token theft** | Paths: cookie copied off the device or by an extension; Vercel logs; Referer; XSS exfiltration; a leaked cookie plus leaked secret. | HttpOnly+Secure+Strict cookie scoped to `/api/paybox`; token never in a URL, response body, header or log; `Referrer-Policy: no-referrer`; no `Access-Control-*`; 60-minute life; PayBox Clients screen revokes instantly `[D]`; optional deny set (6.1 c) | A copied cookie is replayable until expiry because PayBox has no revocation endpoint `[META]` and a stateless BFF has no memory. Up to 60 minutes. |
| T5 | **Phishing look-alike sites** | (i) A clone of the dApp that sends users to a consent screen: dynamic registration is open to anyone, so an attacker can register a client with **the same `client_name`**; the user's only discriminator is whatever the consent page shows about the redirect (NOT FOUND, BW-T9). (ii) A fake "PayBox sign" page. (iii) Device-code phishing. | Authorization code flow, not device code; documentation tells users to check that the address bar shows `app.paybox.sh` for approvals and the exact dApp origin for connect; link allowlist for `app.paybox.sh`; ask PayBox to show the redirect host or support verified client identity (section 16 A4) | Consent phishing through an attacker's own look-alike client cannot be fixed by us. |
| T6 | **Replay** | (i) Session cookie replay (T4). (ii) Re-sending a mint (duplicate request). (iii) Authorization-code replay revokes the client. (iv) A signature replayed across chains or venues. | (i) section 6.1 (c); (ii) `inflight`, `sessionStorage` request id, section 11.5; (iii) callback consumes its state cookie in the same response; no refresh tokens; (iv) typed-data domains carry `chainId` and `verifyingContract`, intent rebuilt from a verified item; `raw` off by default | (iii) is the one that can lock out all users under R1 until the client is re-registered (BW-T2). |
| T7 | **CSRF and login CSRF** | Cross-site form posts to `/sign`; forced login with an attacker's code | Section 8 (Origin, Fetch metadata, JSON, token derived from `sid`; sealed single-use state) | None known. |
| T8 | **Wrong or hostile credential** | A visitor grants several wallets, or an `autonomous` one, or a high-balance wallet | Gate on `always_approve`; UI asks for one dedicated credential; address shown in full; first signature is recover-checked against the claimed owner (`[24]` P3 pattern) | A user who ignores the guidance. |
| T9 | **PayBox change or outage** | The sign route, token TTLs, CORS, the opt-in refresh rule or the tool schema change without notice (the SDK went 2.0.0 to 2.2.0 in 12 days, `[24 §8]`) | Three-tool surface; pinned discovery constants with a fail-closed check; contract tests against recorded shapes; `PAYBOX_SIGN_ENABLED=0` and `BFF_KILL=1`; the local daemon remains | Users cannot sign until we ship a fix. |
| T10 | **Cost or denial of wallet** | Floods of `/login` or `/request`; many mints to spam the user's approval inbox | Section 9 limits; one in-flight; `maxDuration` 15 s; spend alert | Per-region WAF counting is approximate. |
| T11 | **Privacy** | IP and address pairing in Vercel logs; `list_credentials` data in a cookie | No address or IP in our logs; cookie is encrypted and only the user's browser holds it; no analytics | Vercel's own request logs (IP, path) exist for 1 hour to 30 days. |
| T12 | **SSRF / open redirect / header injection** | Any user-controlled URL | Section 8 (one fixed upstream origin; allowlisted return targets; link host check) | None known. |
| T13 | **Approval fatigue / blind approval** | The PayBox page may show a hash for typed data or `raw` (NOT FOUND, BW-T8) | Signature Card in the page; BFF-rebuilt, server-computed tags in the `/sign` response; the comparison is the human's | The human. |
| T14 | **Legal/terms attribution** | The author is now an operator in the chain | Section 13 | Interpretation; not legal advice. |

---

## 13. What the author operates, what they are exposed to, and the terms

### 13.1 Operated

- A Vercel project (already exists) with one new Function entry, one **Secret**-type environment variable holding the sealing keys, a few Config variables (names only, section 15), a WAF rule.
- One PayBox OAuth client registration (R1) or a registration call per login (R2).
- Availability and incident duty: users waiting on approvals, a kill switch to flip, a secret rotation path.
- Nothing else: no database, no queue, no cron, no key, no signer.

### 13.2 Exposed to

| Exposure | Detail |
|---|---|
| Custody of live bearer tokens, in memory per request | Not keys, not funds, not passkeys, not refresh tokens. A token's reach is "every tool the grant allows", approval-gated for money and signing under `always_approve`. |
| Personal data | A session cookie (encrypted) in the user's browser; Vercel's own logs of IP, path and query for 1 hour to 30 days; the PayBox user id inside the token. The BFF logs none of it. |
| Operator liability for a vulnerability | A flaw in the BFF can be the way a user's approval prompts are abused. The old design had no such component. |
| Terms of three parties | See 13.3. |

### 13.3 Terms, stated plainly

- **PayBox (Launchpad Limited), Terms of Use of 6 August 2026 `[TOU]`.** Section 6B treats PayBox as "an agents-first credential vault" and lets users "grant AI agents and other software clients (each, an 'Agent Client')" access: "You bear all risk arising from the actions of any Agent Client you create, configure, or permit to operate", "Approvals are bound to the specific operation submitted", "You may revoke an Agent Client's access at any time", and Launchpad may "decline to produce a signature ... or restrict or close your Paybox account, including to manage sanctions, financial crime, or reputational risk". Section 4: users agree to "use the Services only for yourself, and not on behalf of any third party", and the agreement says "You may not use any of the Services on behalf of a business entity". **Reading (M, not legal advice):** the dApp is an Agent Client that each visitor authorises for themselves; PayBox's own OAuth page invites "third-party apps and MCP clients" `[D]`; the terms bind the user, and I found **no developer or OAuth-client terms** for operating a client for many users (NOT FOUND: searched the docs, `developer.paybox.sh` and the terms page). PayBox can still suspend a client, a user's signing, or the registration. The terms' "Prediction Market Restricted Jurisdictions" list is written for Dawn CLI and MoonPay CLI; I did not find it extended to Paybox (M) but a user in a listed country may be affected by PayBox's own compliance controls.
- **The hackathon-terms clause** quoted in `[EA §2.2]` (code that "exploits, exfiltrates, or misuses user credentials, wallet keys, or secrets") is from the MoonPay Hackathons terms `[04]` and governs hackathon submissions, not OAuth clients. `[EA]` declined to extend the user's "terms are no obstacle" decision to a service holding strangers' credentials. The user's new requirement does extend it; the design respects the clause's spirit (use only to perform the user's own request, never export, never log, user-revocable).
- **XO and venues.** Every signature the BFF helps produce is the user's own, but the author now runs a hosted component in the path of orders on venues with region, one-account-per-user and wash-trading clauses `[EA §2.2]`, `[DD §6]` row 22. The old argument that each user "carries their own terms" because traffic leaves from their own machine does not hold for a hosted BFF. Mitigations in the design: no submit, no creation UI, per-item caps, a geo-block hook (`GEO_BLOCK_COUNTRIES`, applied to `/login` and `/sign` from Vercel's `x-vercel-ip-country` header). Which countries to block is a legal question left to the user (BD4).
- **Vercel.** Hobby is "non-commercial personal use only" and commercial means financial gain of anyone involved in any part of production `[V:limits/fair-use-guidelines]`. If anyone involved expects revenue (builder fees, referral, paid signals), this project needs Pro. The Acceptable Use Policy bars phishing and "misrepresenting authorization to act on behalf of others" `[V:legal/acceptable-use-policy]`; the consent flow must clearly say whose app it is.
- **Data-protection law.** Setting an authentication cookie is a strictly necessary use; the BFF processes IP at the platform level only. Whether the author is a controller of any data beyond that is a question for counsel. NOT ASSESSED.

---

## 14. Which rules this contradicts, and why the user now accepts it

The earlier design was built to meet one binding decision: **runnable by everyone from day zero, with nothing the author must operate and no custody of other people's credentials** `[EA §1]`. That rule was the means to a goal (a design with no operator, no breach duty, no concentration of terms risk). On 2026-10-20 the user stated a different goal that cannot be reached with that means: "I want people to be able to use their paybox wallet on the dApp itself". PayBox has no browser connection surface for third-party origins (section 2.2), so some server must hold a PayBox OAuth token for the page. The user decided to accept an author-operated layer that holds **no user keys** and for which the risk is stated. That is the sense in which the rule is relaxed; what is **kept**: no wallet key, no signing credential, no funds, no XO credentials, no venue submission by the author, every write path flag-gated OFF, caps still advisory, and the local daemon path still fully supported.

What the BFF contradicts, by location (all to be amended before it ships; I changed none of them):

| Statement | Where | Needed change |
|---|---|---|
| "nothing the author must operate and no custody of other people's credentials (local-first / static client)" | `[EA §1]` constants; task banner; `[DD]` "Binding decisions" | Qualify: "except an optional, flag-OFF PayBox session BFF that holds short-lived bearer tokens (no keys)". |
| "Author-operated hosted multi-tenant relay: rejected for now" and its PayBox-terms bullet | `[EA §2.2]` | Add a section 2.5 "token-only session BFF: accepted for sign-in only", keep the relay itself rejected. |
| "What we refuse to build: ... a browser page acting as a PayBox client; anything hosted or operated by the author (proxy, agent, cache, push service, a deployed copy of the explorer unless fork F2 ...)" | `[DD §0]`, fork F2, threat rows 1, 2 and 22 (rows say the author deploys none and each user carries their own terms) | New fork and rows for the BFF; row 22's reasoning must be restated (section 13.3). |
| "Never an author-operated proxy. No CORS-relay, no Vercel function of ours, no Cloudflare Worker of ours." and constraint C1 | `[28 §5.2]`, `[28 §1]` | Superseded for the PayBox session routes only; the read-path rule (no proxy for venue data) stands. |
| "S2 ... still does not stop an external agent" and carrier B "token at rest" caution | `[28 §2.2]`, `[DD §3.3]` | Add the hosted path as carrier E. |
| `"description": "... Holds no key and talks to no server the author operates."` | `app/package.json` | Reword. |
| Static-only `vercel.json`; a check that the app has no server code | `app/vercel.json`, `app/scripts/check-*.ts` (I did not read each script) | Add `functions`/`rewrites`; extend boundary and origin checks to a new `api/` and `bff/` tree; add a test that the Function imports no venue host. |
| Hosted app labelled "read-only explorer" | `[28 §8.3]` | The hosted app becomes a sign-in-capable app; the "mode L is the real trust boundary" reasoning stays true and is why T1 is worse here. |

Said plainly: with this BFF the hosted origin is in the trust path of a signing flow. A compromised hosted deploy is no longer "can lie in a read-only explorer" `[DD §6]` row 2; it is "can raise approval prompts in the PayBox app of every connected user". That is the central cost.

---

## 15. Minimal Vercel layout and environment variables

Assumption: the Vercel project's Root Directory is `app/` (inferred from `app/vercel.json` carrying a `buildCommand` relative to it; not verified, M).

```
app/
  api/
    index.ts                 single Web-Standard fetch handler; routes on pathname (one Function)
  bff/
    config.ts                parse env; any missing required value => every route returns 503
    seal.ts                  AES-256-GCM + HKDF + kid; no dependencies
    cookies.ts               attributes, parsing, clearing
    oauth.ts                 pinned endpoints, PKCE, code exchange, discovery check
    mcp.ts                   initialize/initialized/tools/call over fetch; 3-tool allowlist
    policy.ts                intent rebuild from verified Prepared; chain/type registry; caps
    projection.ts            allowlisted shapes for /session and /request
    log.ts                   typed, redacting logger (only writer to stdout)
    routes/{login,callback,session,sign,request,logout}.ts
    test/                    seal, cookies, oauth (recorded shapes), policy, allowlist, redaction, csrf
  vercel.json                + "functions": {"api/index.ts": {"maxDuration": 15}},
                             + rewrites "/api/paybox/:path*" -> "/api/index"  (exact form: BW-T7),
                             + headers for "/api/paybox/(.*)": Cache-Control no-store
```

Environment variables (names only; Secret type where marked):

| Name | Type | Purpose |
|---|---|---|
| `APP_ORIGIN` | Config | Exact origin of the hosted dApp; source of the redirect URI and the Origin check |
| `PAYBOX_OAUTH_CLIENT_ID` | Config | The registered public client id (R1) |
| `PAYBOX_API_ORIGIN` | Config | `https://api.paybox.sh`; checked against the pinned constant |
| `PAYBOX_APP_ORIGIN` | Config | `https://app.paybox.sh`; the host allowed in returned links |
| `SESSION_KEYS` | **Secret** | List of `{kid, secret}` for sealing; first is current |
| `PAYBOX_CONNECT_ENABLED` | Config | Default `0`; enables login/callback/session |
| `PAYBOX_SIGN_ENABLED` | Config | Default `0`; enables `/sign` |
| `PAYBOX_RAW_ENABLED` | Config | Default `0`; allows the `raw` op for known digest forms |
| `PAYBOX_ALLOWED_APPROVAL_MODES` | Config | Default `always_approve` |
| `SIGN_ALLOWED_CHAIN_IDS` | Config | Domain chain ids the BFF will sign for |
| `PAYBOX_PER_ITEM_CAP_USD` | Config | Per-item notional ceiling |
| `GEO_BLOCK_COUNTRIES` | Config | Optional deny list applied from `x-vercel-ip-country` |
| `BFF_KILL` | Config | `1` makes every route return 503 |
| `LOG_LEVEL` | Config | `error` by default |
| `EDGE_CONFIG` | Secret | Only if the optional deny set (6.1 c) is adopted |

Set production-only; previews get none, so every route fails closed there (a preview origin cannot match the registered redirect URI anyway). Total size is far below the 64 KB limit `[V:environment-variables]`.

Switching it off: set `BFF_KILL=1` (takes a redeploy or an environment change, minutes), or add a Vercel Firewall rule that denies `/api/paybox/` (takes effect on publish), or revoke the client in PayBox, or delete the registered redirect by re-registering. Document all four.

---

## 16. Decisions for the user, and asks that would shrink or remove the BFF

### 16.1 Decisions

| ID | Decision | Recommendation |
|---|---|---|
| BD1 | Accept an author-operated token-only BFF and the exposure in section 13 (the requirement implies yes; I am recording it, not assuming it for you) | Yes, flag OFF at first |
| BD2 | Session length: 60 minutes with no refresh token, or a refresh design with a store | 60 minutes |
| BD3 | One static OAuth client (R1) or one per login (R2) | R1 until BW-T2 |
| BD4 | Geo-block list for the BFF routes | The user decides with counsel; I give a hook only |
| BD5 | Daily cap in hosted mode: none, cookie speed bump, or a ledger store | None, labelled |
| BD6 | Author-operated prepare/submit proxy so the hosted page can reach XO | Not designed; separate decision with its own risk table |
| BD7 | Vercel plan (Hobby or Pro) | Pro if anyone expects revenue; otherwise state non-commercial |

### 16.2 What to ask PayBox, and the likely answer (all L; nobody has been contacted)

| # | Ask | Likely answer |
|---|---|---|
| A1 | Document `https://app.paybox.sh/sign/<request_id>` and the `X-Paybox-Signing-Surface: browser` result as a supported surface for third-party OAuth clients, including a return behaviour | Plausible: the page exists and the header exists. Timeline unknown. |
| A2 | Publish a `revocation_endpoint` (RFC 7009) in the metadata | Plausible, low priority. |
| A3 | Allow our origin in CORS for `/oauth/token` and `/mcp` (removes the BFF; tokens would sit in page memory, which is weaker against XSS than an HttpOnly cookie) | Unlikely; their allowlist is first-party only. |
| A4 | Show the redirect host or a verified-app label on the consent screen, or support Client ID Metadata Documents (the 2026-07-28 MCP revision deprecates dynamic registration in favour of them, `[27 F8]`) | Possible; no sign of it yet. |
| A5 | State whether replay-revocation is per user-client or global to a `client_id` | Probably answerable in one line. |
| A6 | Tool-scoped scopes such as sign-only, so the bearer cannot call money tools | Possible; not on the metadata. |
| A7 | Confirm `/wc` is generally available to third-party dApps and extend it to raw digests and chain 3223 | Raw: unlikely (they refuse non-text `personal_sign` on purpose). 3223: only if PayBox lists the chain. |
| A8 | Document MCP rate limits | NOT FOUND today. |

---

## 17. Live tests the user must run (none was run by me)

Use a throwaway PayBox account and a throwaway wallet credential holding nothing. Record outputs; do not paste tokens into any repo file.

| ID | Test | Answers | Branch |
|---|---|---|---|
| BW-T0 | One `POST /oauth/register` with `client_name`, the production and localhost callback URIs, `token_endpoint_auth_method: none`, `grant_types: ["authorization_code"]`, `scope: "mcp"`. Record the exact response and whether `scope` and `grant_types` are accepted. | Registration works for a hosted redirect URI; client id shape | If refused, R2 or a different redirect shape |
| BW-T1 | A local script (localhost redirect) runs the code flow without `offline_access`, then MCP `list_credentials`, then `request_wallet_sign` `{op:"message", message:"bff test <random>"}` with and without `X-Paybox-Signing-Surface: browser`. Open `approval_url`, then `https://app.paybox.sh/sign/<request_id>`; poll `get_request`. Record each status, every link field in the results, whether the sign page completes a request minted by this client, and the final `output`. | **Whether P0 works at all**; one screen or two; whether `browser` returns a sign URL | If it fails: P3, then the decision in 3.3 |
| BW-T2 | Register a throwaway client; authorise it from two different test accounts; deliberately replay one account's used code; test whether the other's token still works | Revocation scope (decides R1 versus R2, BD3) | If global: R2 |
| BW-T3 | Record the byte length of the access token (JWT) for 1 and for 3 granted credentials; compute the sealed cookie size | Whether one cookie suffices | Split or fall to (b)/(c) |
| BW-T4 | `tools/call` without `initialize`; does `initialize` return a session id; does a 60-minute-old token return 401 with `WWW-Authenticate` | Handshake cost; expiry handling | Per-call init if required |
| BW-T5 | Through the same flow: `typedData` with domain chain 3223 and with chain 137, and `raw` with a 32-byte digest, minted via MCP; complete each on the sign page; also the same typed data over WalletConnect | The XO-relevant difference between MCP and WalletConnect, output shapes, high-s, determinism | If MCP refuses 3223/raw too: the BFF adds nothing for XO |
| BW-T6 | Pair a test dApp page (any WalletConnect v2 sample) with `app.paybox.sh/wc`; request `personal_sign` text, typed data on a catalog chain, and a non-text `personal_sign` | Whether the code in `[APPJS]` is live for ordinary accounts; confirms the refusals | Decides how much of this BFF is needed |
| BW-T7 | Deploy the Function to a Vercel preview; measure cold and warm latency for `/session` and `/request`; try the rewrite form; add the WAF rule; read the runtime logs for any token, cookie or address; confirm `maxDuration` applies | Region choice, cold-start cost, rewrite syntax, log hygiene | |
| BW-T8 | Screenshot what the sign and approval pages show for `message`, `typedData` and `raw` | Whether a human can compare anything with the Signature Card tags | If only a hash: tags are the only check (T13) |
| BW-T9 | Register a second client with the same `client_name` and a different redirect URI; screenshot the consent screen for both | Whether consent phishing by name is distinguishable (T5) | Decides how loudly to warn users |
| BW-T10 | Revoke the client in PayBox's Clients screen mid-session; call the BFF | Failure mapping to "reconnect" | |

BW-T0, T1, T2 and T3 decide whether to build at all; T5 decides whether the BFF is worth building for XO.

---

## 18. NOT FOUND and unverified (collected)

- Whether `https://app.paybox.sh/sign/<request_id>` completes a request minted by a different OAuth client, what it shows, and whether `X-Paybox-Signing-Surface: browser` returns its URL. NOT TESTED.
- Whether the WalletConnect wallet in the PayBox bundle is enabled for ordinary accounts. NOT TESTED.
- Revocation granularity (per user-client versus per `client_id`). NOT FOUND.
- A PayBox `revocation_endpoint`, developer or OAuth-client terms, MCP rate limits, finer-grained scopes. NOT FOUND.
- Access-token (JWT) size and claim contents. NOT TESTED.
- Whether `tools/call` works without `initialize`. NOT TESTED.
- Whether this Vercel project has Fluid compute enabled, its region, its plan, and the included invocation allowance on Hobby (not in the pages read). NOT FOUND.
- Cold-start magnitude of the planned Function. NOT TESTED.
- That `app/` is the Vercel Root Directory. M.
- Everything PayBox does after `pending_signature` for `raw` and for chain 3223. NOT TESTED (`[24 §12]` TP1, TP2).
- The repo scripts under `app/scripts/check-*.ts` that need amending: I read their headers and greps only.

---

## 19. Verification (2026-10-20)

What I re-checked first-hand, and how:

1. **PayBox docs.** Downloaded `https://docs.paybox.sh/llms-full.txt` (64,429 bytes) and read the sections on the model, approvals, request lifecycle (incl. the signing window), MCP connector (incl. "Signing: in the chat, or in your browser"), OAuth 2.1 (scopes table, tokens table, refresh), MCP tools (`request_wallet_sign`, `get_request`, `list_requests`, `request_account_change`), API and endpoints, and SDK and CLI. This is where "omit it and no refresh token is issued" and the 5-minute single-use code come from.
2. **OAuth metadata.** `GET /.well-known/oauth-authorization-server` with and without an `Origin` header: endpoints, grants, scopes, no `revocation_endpoint`, no allow-origin.
3. **CORS.** Ten `OPTIONS` preflights (five paths x two origins) as listed in section 2.2, one per second.
4. **SDK 2.2.0.** Fetched `package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/chunk-DWDC6W5P.js`, `dist/cli.js` as text; read `buildEnvelope`, `signWalletRequest`, `completeWalletSignRequest` (calls `reopen_signing_window` with the in-process surface header), the MCP client handshake, the device-code registration and polling, the pairing flow, the REST paths. Nothing was installed or run. Registry metadata: latest 2.2.0, published 2026-10-14.
5. **PayBox web app (static read).** Fetched `https://app.paybox.sh/`, `/sign/<nonexistent>`, `/wc` (HTML shells, headers) and the 15.6 MB entry bundle; extracted the route list (38 routes including `sign/[request_id]` and `wc`), the `sign/[request_id]` page module, the WalletKit module (`supportedNamespaces`, `describeProposal`, metadata), the session-request controller, and `describeSignRequest` (per-method behaviour, `decodeEvmMessage`). Read as text; nothing executed. I did not copy the WalletConnect project identifier or any analytics key into this note.
6. **Framing headers.** `app.paybox.sh` sends `frame-ancestors 'self'`; `https://api.paybox.sh/iframe/shell?r=<nonexistent>` sends `frame-ancestors https://app.paybox.sh`.
7. **The hosted dApp.** `GET /` and `GET /api/paybox/session` (404) headers on `https://xo-markets-explorer.vercel.app`.
8. **Terms.** Read the Launchpad Terms of Use (84 KB of text) for sections 1, 4, 6B and the prediction-market geographic clause; read `developer.paybox.sh/terms` (hackathon terms, not product terms); looked for developer/OAuth client terms and found none.
9. **Vercel.** Fetched the doc pages listed under `[V:*]` as markdown and read the cited sections; read the Acceptable Use Policy. I did not call any Vercel API or MCP tool (authenticated).
10. **Repo.** Read `docs/research/24` (all), `27` (section 2), `28` (sections 0 to 2, 5, 8), `docs/dapp-design.md` (0, 1, 3, 5, 6), `docs/everyone-architecture.md` (sections 1 to 2.4), `docs/plan.md` banner, `docs/phase1-gap-closing.md` (A1), `src/relay/contract.ts` (`verifyPrepared` and its rebuild contract), `app/src/features/signing/card.ts` (header and exports), `app/vercel.json`, `app/headers.config.ts`, `app/package.json`.

What I did **not** verify: anything that needs a PayBox call, a registration, a signature or an authenticated Vercel/PayBox session (section 17); that `verifyPrepared` passes on a hosted-page-built item (the repo's tests, not run here); the 4096-byte cookie limit and `SameSite` redirect behaviour beyond standard browser rules (M); every number in section 9 marked as an estimate.

Privacy check: this note contains no email address, personal name, username, GitHub login or home path; all paths are repo-relative or URLs of public services; no token, cookie, credential id, wallet address, WalletConnect project identifier, analytics key or contact address was copied; probe requests carried only the research User-Agent. Scratch files (docs, SDK text, app bundle, probe outputs) are in the session scratchpad only.

## Sources

- https://docs.paybox.sh/llms-full.txt ; https://api.paybox.sh/.well-known/oauth-authorization-server
- https://unpkg.com/@paybox-sh/sdk@2.2.0/ (README.md, SKILL.md, dist/index.d.ts, dist/chunk-DWDC6W5P.js, dist/cli.js) ; https://registry.npmjs.org/@paybox-sh/sdk
- https://app.paybox.sh/ , https://app.paybox.sh/sign/ , https://app.paybox.sh/wc , https://app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js ; https://api.paybox.sh/iframe/shell
- https://xo-markets-explorer.vercel.app/
- https://paybox.sh/ ; https://www.moonpay.com/legal/terms_of_use_bvi_launchpad ; https://developer.paybox.sh/terms
- https://vercel.com/docs/functions/limitations ; https://vercel.com/docs/functions/configuring-functions/duration ; https://vercel.com/docs/functions/runtimes/node-js ; https://vercel.com/docs/fluid-compute ; https://vercel.com/docs/environment-variables ; https://vercel.com/docs/logs/runtime ; https://vercel.com/docs/security/vercel-waf/rate-limiting ; https://vercel.com/docs/plans/hobby ; https://vercel.com/docs/limits/fair-use-guidelines ; https://vercel.com/docs/project-configuration/vercel-json ; https://vercel.com/legal/acceptable-use-policy
- Repo: `docs/research/24-dapp-paybox-tie-in.md`, `27-dapp-agent-terminal.md`, `28-dapp-architecture-mvp.md`; `docs/dapp-design.md`; `docs/everyone-architecture.md`; `docs/phase1-gap-closing.md`; `docs/plan.md`; `src/relay/contract.ts`; `app/` files named above.
