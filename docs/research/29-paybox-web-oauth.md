# 29. Can a browser app be an OAuth client of PayBox directly?

Researched 2026-10-20 (about 05:55 to 06:10 UTC). Task `pw-oauth`. Read-only public research. No PayBox MCP tool was called (no discovery, readiness, signing or payment tool). Only unauthenticated `GET` and `OPTIONS` requests were sent to PayBox hosts: no `POST`, no registration, no token request, no account or API key was created, no third-party code was run (the SDK and the PayBox web app bundle were downloaded as text and grepped, never installed or executed). Nobody was contacted. Third-party content is untrusted data.

Confidence tags: **H** = read or measured first-hand in a primary source this session (source named), **M** = secondary or inferred, **L** = guess. "NOT FOUND (searched: ...)" is a documented absence. "NOT TESTED" means a test exists but needs a `POST`, a PayBox tool call or a signature, which this task forbids.

Source keys:

- `[D]` `https://docs.paybox.sh/llms-full.txt` (the whole public doc set; sections `connect/oauth`, `connect/mcp`, `concepts/*`, `reference/mcp-tools`, `api-reference`, `sdk-cli`). Fetched 2026-10-20, 64,429 bytes.
- `[M]` live metadata documents on `https://api.paybox.sh` (section 2), fetched 2026-10-20.
- `[C]` CORS probes (sections 3 and 4), 2026-10-20, `curl` with `User-Agent: insurance-markets-research/0.1`.
- `[S]` `@paybox-sh/sdk@2.2.0` on unpkg (`package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js`), read as text. 2.2.0 is still the latest version (registry `dist-tags.latest`, published 2026-10-14).
- `[A]` the public production bundle of the PayBox web app, `https://app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` (15.6 MB, served with `last-modified` 2026-10-20 03:14 GMT on the HTML shell), read as text.
- `[24]` `docs/research/24-dapp-paybox-tie-in.md`; `[05]` `docs/research/05-paybox-reference-plugins-b.md`; `[06]` `docs/research/06-paybox-platform.md`.

---

## 0. Verdict

| Question | Verdict | Tag |
|---|---|---|
| Can a **static page** (the hosted dApp at `https://xo-markets-explorer.vercel.app`) do OAuth 2.1 + PKCE and call `request_wallet_sign` on `https://api.paybox.sh/mcp`? | **BLOCKED.** The OAuth server and MCP endpoint exist, are standards-shaped and need no client secret, but every endpoint a browser has to call by `fetch` (`/oauth/register`, `/oauth/token`, `/oauth/device_authorization`, `/mcp`) answers a preflight from the dApp origin with **no `Access-Control-Allow-Origin`**. The browser discards the response. Only `https://app.paybox.sh` and `https://developer.paybox.sh` are allowed (exact string match). | H, measured (section 4) |
| Does it work with a **thin server-side layer** on Vercel (CORS pass-through for register, token, MCP)? | **Works for OAuth and for the MCP call, but does not by itself produce a signature.** `request_wallet_sign` over MCP only parks a request (`pending_approval` then `pending_signature`). The artifact is produced by the MCP Apps signing window or by an in-process `pbxk1.` agent key. A proxy design therefore also needs the key-pairing and `moonx-sign` REST routes, which are undocumented ("not part of the developer surface") and are not covered by any public contract. | H for the mechanism (docs, SDK code); the end-to-end run is NOT TESTED |
| Can anyone register a client? | **Yes per the docs and the official client code** (dynamic registration, no authentication, public clients only). Not measured by me because registration is a `POST`. | H docs and SDK code; NOT TESTED |
| **Recommendation** | Do not build a PayBox OAuth client into the hosted dApp. A static page cannot do it. A proxy-based client is possible but rests on undocumented routes, puts bearer tokens through an author-operated function and still needs a signing key paired in the browser. **A different, shipping path exists and needs no PayBox CORS change: the PayBox web app itself is a WalletConnect v2 wallet** (section 8). That finding contradicts the "NOT FOUND" for WalletConnect in `[24]` (which searched the docs and the SDK, not the app bundle) and should be verified live first (section 9, test LT1). | H that the code is in the shipped bundle; whether it works for a given user is NOT TESTED |

---

## 1. The server and where its documentation lives

### 1.1 Endpoint URL

- The MCP endpoint is `https://api.paybox.sh/mcp`, "a **streamable HTTP** MCP endpoint (protocol version `2025-06-18`)" `[D connect/mcp]` [H]. The same URL is in the Grok host plugin's `.mcp.json` (`type: http`) `[05 §1]`, in `openapi.json` (`POST /mcp`, `operationId callMcp`) and in the protected-resource document (section 2.2).
- Users add it in a host's connector screen ("paste the MCP URL above as a custom connector"). Hosts without a connector screen use the CLI instead `[D connect/mcp]` [H].
- The consent screen is served from `https://app.paybox.sh`; everything else is on `https://api.paybox.sh` `[D connect/oauth]` [H].

### 1.2 What the docs promise

From `[D connect/oauth]` (H, quoted or closely paraphrased):

- "PayBox is an OAuth 2.1 Authorization Server implementing the MCP authorization spec. Third-party apps and MCP clients connect with standard authorization-code + PKCE."
- Discovery: `GET /.well-known/oauth-authorization-server` and `GET /.well-known/oauth-protected-resource`, no auth.
- Registration: `POST /oauth/register`, RFC 7591, "PayBox supports public clients only: `token_endpoint_auth_method` must be `none`; there is no client secret." Response `201` with `client_id` of the form `pbx-oauth-...`. "`redirect_uris` must be HTTPS (or `http://localhost` for local dev)."
- Authorize: `GET /oauth/authorize` with `response_type=code`, `client_id`, `redirect_uri`, `code_challenge` (S256 only), `scope=mcp offline_access`, `resource=https://api.paybox.sh/mcp`, `state`. PayBox redirects to the consent screen, where the user "sign[s] in, select[s] which credentials to grant and the approval mode per credential, and approve[s] with a passkey". `redirect_uri` is matched **exactly**; a mismatched URI gets an error page, not a redirect.
- Token: `POST /oauth/token` (`application/x-www-form-urlencoded`), `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`.
- Lifetimes: authorization code 5 min, single use, "replaying a used code revokes the client"; access token JWT (HS256), 60 min, audience-bound to the MCP `resource`; refresh token opaque, 30 days sliding, **rotated on every use**, "replaying a rotated token revokes the client". `offline_access` is opt-in: without it no refresh token is issued.
- "The token's authority is exactly the grant set the user approved: which credentials, and the approval mode per credential." "Sensitive operations still pause for the user's passkey regardless of the app's token."
- An unauthenticated `/mcp` call returns `401` with `WWW-Authenticate` pointing at the protected-resource document.

---

## 2. Live metadata (measured 2026-10-20)

### 2.1 `GET https://api.paybox.sh/.well-known/oauth-authorization-server` `[M]` [H]

HTTP 200, `content-type: application/json`, 581 bytes:

```json
{"issuer":"https://api.paybox.sh",
 "authorization_endpoint":"https://api.paybox.sh/oauth/authorize",
 "token_endpoint":"https://api.paybox.sh/oauth/token",
 "registration_endpoint":"https://api.paybox.sh/oauth/register",
 "device_authorization_endpoint":"https://api.paybox.sh/oauth/device_authorization",
 "response_types_supported":["code"],
 "grant_types_supported":["authorization_code","refresh_token","urn:ietf:params:oauth:grant-type:device_code"],
 "code_challenge_methods_supported":["S256"],
 "token_endpoint_auth_methods_supported":["none"],
 "scopes_supported":["mcp","offline_access"]}
```

Differences from the docs page: the live document **adds** `device_authorization_endpoint` and the device-code grant type (the docs list only `authorization_code` and `refresh_token`). Absent from the live document: `revocation_endpoint`, `jwks_uri`, `service_documentation`, `introspection_endpoint`, `token_endpoint_auth_signing_alg_values_supported`. `/.well-known/oauth-authorization-server/mcp` and `/.well-known/openid-configuration` return 404.

### 2.2 `GET https://api.paybox.sh/.well-known/oauth-protected-resource` (and `.../oauth-protected-resource/mcp`) `[M]` [H]

HTTP 200 for both paths, identical body:

```json
{"resource":"https://api.paybox.sh/mcp","authorization_servers":["https://api.paybox.sh"],
 "bearer_methods_supported":["header"],"scopes_supported":["mcp"]}
```

Note the asymmetry: the protected resource lists only `mcp`; `offline_access` appears only in the authorization-server document.

### 2.3 Other public documents `[C]` [H]

- `GET /.well-known/api-catalog` 200 `application/linkset+json`, pointing at `/openapi.json`, `https://docs.paybox.sh/api-reference`, `/skill.md`, `/health`.
- `GET /openapi.json` 200 (OpenAPI 3.1.1, title "PayBox API" 0.1.0). Paths: `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/health`, `/mcp`, `/oauth/authorize`, `/oauth/register`, `/oauth/token`. The OpenAPI file does **not** list `/oauth/device_authorization` or any `/agent/*` route. Its security scheme documents only the `mcp` scope. Registration request properties: `client_name`, `redirect_uris` (required), `scope`, `token_endpoint_auth_method`. Registration response: `client_id`, `client_id_issued_at`, `client_name`, `redirect_uris`, `grant_types`, `response_types`, `scope`, `token_endpoint_auth_method`.
- `GET /mcp` without a token: HTTP 401, `www-authenticate: Bearer realm="paybox", resource_metadata="https://api.paybox.sh/.well-known/oauth-protected-resource"`, `cache-control: no-store`, body `{"error":"unauthorized","error_description":"MCP access requires an OAuth 2.1 access token. See WWW-Authenticate header for discovery."}`.
- `GET /oauth/authorize` with no parameters: HTTP 400 `text/plain`, body ``Failed to deserialize query string: missing field `response_type` `` (a strict typed query parser; the wording matches the Rust `axum` framework, M).
- `GET` on `/oauth/register`, `/oauth/token`, `/oauth/device_authorization`: HTTP 405 with `allow: POST`. So the device-code endpoint exists and is `POST`-only (H), consistent with the SDK (section 5).

---

## 3. CORS method

For each endpoint and each of four origins I sent (a) a preflight `OPTIONS` with `Origin`, `Access-Control-Request-Method` (the method the real call would use) and `Access-Control-Request-Headers` (`content-type`, or for `/mcp`: `authorization,content-type,mcp-protocol-version,mcp-session-id,accept`), and (b) a plain `GET` with `Origin` set. Origins: the dApp (`https://xo-markets-explorer.vercel.app`), a non-allowed origin (`https://example.org`), PayBox's own app (`https://app.paybox.sh`) and `https://claude.ai`. Raw output was kept in the session scratchpad only. No request body was ever sent; no `POST` was sent to PayBox.

## 4. CORS results `[C]` [H, measured]

Every preflight returned **HTTP 200** and the same permissive-looking lines:

```
access-control-allow-credentials: true
access-control-allow-methods: GET,POST,PUT,PATCH,DELETE,OPTIONS
access-control-allow-headers: content-type,authorization,x-moonx-access-token,x-moonx-identity-token,x-moonx-presence,mcp-protocol-version
vary: origin, access-control-request-method, access-control-request-headers
```

What differs by origin is **only** whether `access-control-allow-origin` (ACAO) is present:

| Endpoint (method of the real call) | Origin `https://xo-markets-explorer.vercel.app` | Origin `https://example.org` | Origin `https://claude.ai` | Origin `https://app.paybox.sh` |
|---|---|---|---|---|
| `/.well-known/oauth-authorization-server` (GET) | preflight 200, **no ACAO**; plain GET 200, **no ACAO** | same, no ACAO | same, no ACAO | ACAO = `https://app.paybox.sh` |
| `/.well-known/oauth-protected-resource` (GET) | no ACAO | no ACAO | no ACAO | ACAO = `https://app.paybox.sh` |
| `/oauth/register` (POST, `content-type`) | preflight 200, **no ACAO** | no ACAO | no ACAO | ACAO = `https://app.paybox.sh` |
| `/oauth/token` (POST, `content-type`) | **no ACAO** | no ACAO | no ACAO | ACAO = `https://app.paybox.sh` |
| `/oauth/device_authorization` (POST) | **no ACAO** | no ACAO | no ACAO | ACAO = `https://app.paybox.sh` |
| `/oauth/authorize` (GET, browser navigation) | plain GET 400 (no params), no ACAO; irrelevant, see below | same | same | ACAO = `https://app.paybox.sh` |
| `/mcp` (POST, `authorization,content-type,mcp-protocol-version,mcp-session-id,accept`) | preflight 200, **no ACAO**; plain GET 401, **no ACAO** | no ACAO | no ACAO | ACAO = `https://app.paybox.sh` |
| `/openapi.json` (GET) | no ACAO | no ACAO | no ACAO | ACAO = `https://app.paybox.sh` |
| `/health` (GET) | preflight 405 (`allow: GET,HEAD`); plain GET 200, no ACAO | same | same | same |

Additional facts from the same probes:

1. **The allowlist is an exact-string list of two origins.** A preflight against `/oauth/token` with `Origin` set to each of 14 variants returned ACAO only for `https://app.paybox.sh` and `https://developer.paybox.sh`. No ACAO for: `https://paybox.sh`, `https://www.paybox.sh`, `https://docs.paybox.sh`, `https://staging.paybox.sh`, `http://localhost`, `http://localhost:3000`, `http://127.0.0.1:3000`, `null`, `https://app.paybox.sh.example.org`, `https://vercel.app`, the dApp origin with a trailing slash, `https://APP.paybox.sh`, `http://app.paybox.sh` [H]. There is therefore **no localhost carve-out** and no wildcard-subdomain rule. A third origin is a configuration change on PayBox's side (M, inference from a two-entry list; the mechanism is not visible).
2. **`access-control-allow-credentials: true` is sent with every response**, including those without ACAO. The credentialed CORS design (app session cookies or MoonX session headers) is aimed at the first-party app. The allowed request headers include `x-moonx-access-token`, `x-moonx-identity-token`, `x-moonx-presence`: first-party session headers that are not part of any public surface and must not be used `[24 §3.3]`.
3. **Allowed request headers exclude two things an MCP client sends:** `x-paybox-signing-surface` (the SDK sends it on `/mcp` when a host sets it, `[S]` chunk line 782) and `mcp-session-id`. Even for an allowed origin, a browser client would have to leave both out. `accept` is a CORS-safelisted header and is not affected.
4. **No `access-control-expose-headers`** was returned on any response. A browser script could not read `WWW-Authenticate` from the `/mcp` 401 even if ACAO were present, so the RFC 9728 discovery-by-401 path would not work from a browser; a client would have to hard-code or fetch the well-known documents.
5. **Unmatched paths are different:** `/.well-known/openid-configuration` and `/.well-known/oauth-authorization-server/mcp` (404) returned `access-control-allow-origin: *`. This is a router fallback and gives no access to anything (H, measured; not exploitable, noted only so nobody mistakes it for an open policy).
6. **`/iframe/pairing` and `/iframe/pairing/{id}` are the exception.** Preflight returned ACAO `*` with `access-control-allow-headers: content-type,authorization`, for every origin tested, including the dApp's. These are routes the CLI uses for signing-key pairing (section 6.2). They are not usable on their own, because the token that authorizes the first call comes from `/api/agent-pairings/token`, which is **not** open (preflight, no ACAO for the dApp origin) [H].
7. **All REST routes the SDK uses are on the same allowlist.** Preflight with `Access-Control-Request-Headers: authorization,content-type` for `/agent/wallet-sign`, `/agent/grants`, `/agent/request`, `/agent/readiness`, `/agent/requests/{id}/binding`, `/agent/requests/{id}/moonx-sign`, `/agent/requests/{id}/signature`, `/api/agent-pairings/token` returned no ACAO for the dApp origin and ACAO = `https://app.paybox.sh` for the app [H]. (Unauthenticated `GET /agent/grants` returned 401; the other routes `405` for `GET`.)

### What this means for the browser

A preflight whose response lacks ACAO for the requesting origin fails, and the browser does not send the real request. So from `https://xo-markets-explorer.vercel.app`:

- the metadata documents cannot be read by script (the plain `GET` has no ACAO);
- `/oauth/register`, `/oauth/token`, `/oauth/device_authorization` and `/mcp` calls fail before they are sent. **Nothing is registered or issued by an attempted browser call**, so the user can test this safely in devtools (LT2);
- only `GET /oauth/authorize` works, and only because it is a top-level navigation (the dApp may redirect the user's tab there; no CORS applies). The redirect back to the dApp's HTTPS `redirect_uri` would also work. The dance dies at the **token exchange**.

---

## 5. Answers to the four questions

### (1) Can a static page do the full OAuth 2.1 + PKCE dance and call `tools/call request_wallet_sign` with CORS?

**No.** Steps that would work: discovery (if hard-coded), `GET /oauth/authorize` by navigation, the redirect back. Steps that fail by CORS: registration, code exchange, refresh, every `/mcp` call (section 4) [H, measured].

Two further problems exist even if CORS were opened, both from the docs and the SDK `[D][S]` [H]:

- **Rotating refresh tokens in a browser.** A refresh token is rotated on every use and replaying a rotated token revokes the whole client. A page with two tabs, or a refresh that succeeds server-side while the response is lost, revokes the client. A single owner (a service worker or a lock, e.g. the Web Locks API) is required. The refresh token would sit in browser storage (XSS-readable) because a static page has nowhere else to put it.
- **OAuth alone never signs.** The docs: "Wallet signing never happens in agent code" and the result of `request_wallet_sign` is `pending_approval` (passkey in the PayBox app) then `pending_signature`, "the signing window is producing the artifact". The signing window is an MCP Apps resource (`ui://paybox/wallet-sign`) rendered by a chat host; the dApp is not a host `[D concepts/requests]`. The only other route is the SDK's in-process path with a `pbxk1.` key (section 6). The reference note `[05 §2.4]` records the same split: "OAuth alone can NEVER sign".

### (2) If metadata exists but CORS blocks, what exactly blocks?

Both the token endpoint and the MCP endpoint, plus registration and device authorization (rows of section 4). The first blocking call in the sequence is `POST /oauth/register` (a dApp has no `client_id` to start with, unless one is registered out of band by the author, see 5.3). The blocking element is the **absence of the dApp origin in a two-entry exact-match allowlist** (`https://app.paybox.sh`, `https://developer.paybox.sh`), not the HTTP method, not the headers (the header allow-list covers `content-type`, `authorization` and `mcp-protocol-version`), and not the protocol.

### (3) Is client registration needed, and can anyone register?

- **Needed:** yes. `client_id` is required by `/oauth/authorize`, and `redirect_uri` must match the registered value exactly `[D]` [H].
- **Who:** anyone, unauthenticated. The docs table lists `/oauth/register` with "Auth: none"; the official CLI registers a **fresh client on every login** with no credentials, via both the loopback flow (`redirect_uris: ["http://127.0.0.1:<port>/callback"]`) and the device flow (`redirect_uris: ["http://127.0.0.1/device"]`, `grant_types: [device_code, refresh_token]`, `scope: "mcp offline_access"`) `[S chunk, loginLoopback/loginDevice]` [H, code read]. I did not register a client (POST), so: NOT TESTED.
- **Rules (documented):** public clients only (`token_endpoint_auth_method: "none"`), `redirect_uris` HTTPS or `http://localhost` (the SDK uses `http://127.0.0.1`, so loopback IPs are accepted in practice, M), exact match at authorize time, S256 only.
- **Static page implications:** the dApp could use one `client_id` registered once by the author (a client record the author never operates beyond pasting an id) with `redirect_uris = ["https://xo-markets-explorer.vercel.app/<callback>"]`. Preview deployments on other Vercel hostnames would each need their own registration. Whether a registered client persists indefinitely, is rate-limited, or is garbage-collected: NOT FOUND (searched `[D]`, `openapi.json`, `[S]`).
- **Trust display:** the consent screen shows a client name the registrant chose. Anyone may register any name, so the user sees a self-asserted label (M, inference from open registration).

### (4) What scopes would a client hold, and how do grants and approval modes apply?

- **Scopes** `[M][D]` [H]: only `mcp` (all tools) and `offline_access` (refresh token). No per-tool, per-chain, per-credential or per-spend scope exists. Authority is expressed entirely in the **grant set** chosen on the consent screen: which credentials, and an approval mode for each. A third-party client is the same as Claude or the CLI: same MCP surface, same consent screen.
- **Approval modes** (SDK type `Grant.approval_mode`): `always_approve`, `iframe`, `autonomous`, `paybox` `[S dist/index.d.ts line 165]` [H]. The docs name two: "Human approval" (every operation pauses for a passkey) and "Autonomous" (acts without per-op approval within the grant), plus the `iframe` mode for wallet grants ("the user confirms in the in-chat signing window, which then signs and submits immediately") `[D concepts/approvals]`. `paybox` is in the SDK type only (NOT FOUND in public docs).
  - For a browser dApp, **`iframe` is unusable** (no host renders the window) and `autonomous` still ends at `pending_signature` without a window or a paired key.
  - `always_approve` gives `pending_approval` with an `approval_url`; the user approves with a passkey in the PayBox app; the dApp polls `get_request` `[D concepts/requests]` [H].
- **The passkey rule is internally inconsistent** in the docs: "Regardless of mode, sensitive operations (revealing a raw secret, signing, issuing keys) require a fresh passkey assertion" (`concepts/model`) versus autonomous wallet signs moving to `pending_signature` with no mention of a passkey (`concepts/requests`). `[06 §6]` and `[05]` flagged this already. Whether an autonomous grant signs `request_wallet_sign` with no passkey is NOT TESTED.
- **Caps:** nothing in the OAuth surface carries a spend cap for `request_wallet_sign` (`value_cents` is only a hint on transfers and swaps `[24 §2]`). A token with a wallet grant that signs can sign any typed data or any `raw` digest. Caps stay advisory, as decided.
- **Revocation:** "Revoking the client (from the app's Clients screen) immediately kills its access tokens and refresh chain" `[D]` [H]. A dApp client appears as its own row there, separate from the user's chat agent.

---

## 6. Where the signature actually comes from (why a proxy is not enough)

### 6.1 The two signing surfaces

From the docs and the SDK `[D][S]` [H]:

1. **MCP Apps signing window** inside a chat host. Not available to a dApp.
2. **In-process signing with a `pbxk1.` agent key** (`paybox connect`, "no signing window on this surface"). The SDK's `requestWalletSign` posts `{operation:{type:"wallet_sign", credential_id, intent}}` to REST `POST /agent/wallet-sign`; for `pending_signature` it then calls `POST /agent/requests/{id}/binding`, `POST /agent/requests/{id}/moonx-sign` (ed25519-signed envelope per op; for `raw` the result is `{scheme, signature}`) and `POST /agent/requests/{id}/signature` with the artifact. These routes use the same bearer as MCP.

### 6.2 Key pairing (undocumented REST) `[S cli.js pairSigningKey]` [H, code read]

1. `POST /api/agent-pairings/token` with the OAuth bearer returns `{pairing_token, client_id}`.
2. The client generates an ed25519 key (`tweetnacl`), keeps the seed, and sends the public key: `POST /iframe/pairing` (`Authorization: Bearer <pairing_token>`) returns `{pairing_id}`.
3. The user opens `https://app.paybox.sh/agent-key?client_id=...&pairing_id=...` and picks the row showing the same eight emoji (derived from the public key).
4. The client polls `GET /iframe/pairing/{id}` until `completed`.

The pairing token call is not CORS-open to the dApp; the other two are (ACAO `*`). The private key never leaves the client. A key paired this way is bound to **one** client; a re-login clears it.

These routes are explicitly "not part of the developer surface" `[D api-reference]`, are absent from `openapi.json`, and the SDK moved from 2.0.0 to 2.2.0 in 12 days `[24 §8]`. The SDK repository (`github.com/moonpay/paybox`) is not public (404 on the GitHub API), so there is no source to track.

### 6.3 So the "thin proxy" design is really a larger design

A Vercel function can forward `POST /oauth/register`, `POST /oauth/token`, `POST /oauth/device_authorization`, `POST /mcp`, and the `/agent/*` and `/api/agent-pairings/token` routes, adding CORS headers for the dApp origin. Server-to-server calls are not subject to CORS (the Node SDK works without an `Origin`). With such a pass-through:

- the browser generates the ed25519 key itself (WebCrypto `Ed25519` or `tweetnacl`), so **the server never sees a signing key**;
- the browser holds the OAuth tokens (the server must not store them);
- the server sees, in transit, bearer tokens (a refresh token and a 60-minute access token, whose authority equals the grant) and signed envelopes.

That is a legitimate "holds no user keys" layer, but "no keys" is not "no authority": whoever operates the function (or anyone who can read its logs or alter its deployment) can read bearer tokens in flight. For `always_approve` grants the damage is bounded by the passkey step; for `autonomous` grants it is not. The hosted dApp's JavaScript is already served by the same author, so a user who trusts the page already trusts that author; the proxy adds a log-capable intermediary and a second deployment artifact on the same trust root. **The documented, supportable part of this design is the OAuth + MCP part; the part that produces a signature rides on undocumented routes.** Other risks:

- Cloudflare bot management is in front of the API (a `__cf_bm` cookie is set on every response, H). Requests from shared Vercel egress addresses might be challenged or rate-limited. NOT TESTED (needs a `POST`).
- Rotating refresh tokens plus serverless concurrency (two cold starts, one retry) is a revocation hazard; the proxy must be a pure pass-through and never retry a token request.
- The function would be an open relay unless it checks `Origin` and restricts targets to the five or six PayBox paths. Even then it is a convenience for anyone to proxy PayBox calls from the author's quota.
- The proxy enlarges the author's operational duty ("nothing the author must operate" is a binding decision; a stateless function is the smallest possible form but it is still something to deploy, patch and monitor).

I rate the proxy path **not recommended** on the evidence: it needs the three most fragile surfaces (open registration behaviour, rotating tokens, undocumented signing routes) to all hold, for a capability the WalletConnect path (section 8) appears to give without any of them.

---

## 7. Options that need PayBox's cooperation (what to ask, likely answer)

No contact was made; these are drafts for the user to decide on.

| Ask | Why it would work | Likely answer | Tag |
|---|---|---|---|
| **A. Add `https://xo-markets-explorer.vercel.app` to the CORS allowlist for `/oauth/register`, `/oauth/token`, `/oauth/device_authorization` and `/mcp`** (plus `x-paybox-signing-surface` in allowed headers and `access-control-expose-headers: www-authenticate`). | The list already has two entries (`app.paybox.sh`, `developer.paybox.sh`), so per-origin additions are plausible. The server already advertises `browser` as a signing-surface value `[S README]`. Then the registration, code exchange and MCP calls all work from the dApp without any proxy. | Uncertain; they have no public partner programme (NOT FOUND `[24 §3]`, `[06 §2]`). A request for one named origin is more likely to be accepted than a wildcard. A wildcard for public PKCE clients is technically defensible (bearer auth, no cookies), but `allow-credentials: true` on every response shows the policy was written for the first-party app. | L |
| **B. Publish the signing-key pairing and `moonx-sign` routes as a supported browser SDK** (or document the `browser` signing surface). | Without it, even an allowlisted origin has to drive undocumented routes. | Unknown; the SDK's own `browser` surface value suggests it is planned. | L |
| **C. Document the WalletConnect wallet** (`app.paybox.sh/wc`): supported methods, chains, approval behaviour, and whether it is intended for third-party dApps. | The code ships (section 8); documentation is absent from the docs, llms.txt, the SDK and the developer portal. | A documented, supported feature would remove the biggest uncertainty (section 8.4). | L |

None is needed for the WalletConnect path if it works as the bundle suggests.

---

## 8. Adjacent finding that changes the picture: `app.paybox.sh/wc` is a WalletConnect v2 wallet

This is outside the OAuth question, but it answers the user's requirement ("use their PayBox wallet on the dApp itself") better than any OAuth design, and `[24]` recorded the opposite ("WalletConnect: NOT FOUND, searched docs, SDK, npm"). That search did not include the web app's own JavaScript. I read the production bundle `[A]` as text.

### 8.1 What the shipped code contains [H: code is in the bundle; behaviour NOT TESTED]

- **Reown/WalletConnect WalletKit** initialised with metadata `name "PayBox"`, `description "The payment vault for AI agents"`, `url https://paybox.sh`. The page's content-security policy allows `wss://relay.walletconnect.org`, `https://relay.walletconnect.org` and the verify hosts in `connect-src` (read from the response headers of `https://app.paybox.sh/`).
- A screen titled **"Connect an app"** with a crumb "WalletConnect" and the text "Paste the connection link from the app you want to connect." with a `wc:` pairing field; a **session proposal** screen "Connect this app?" with Connect and Reject; a **signature request** screen; a "Connected apps" list ("Listening for signature requests.").
- The route is `https://app.paybox.sh/wc` (HTTP 200; the app is a single-page shell, so this proves only that the path serves the shell). The feature flag in the component is hard-coded on (`I=!0`).
- **Namespaces offered to the dApp** (`supportedNamespaces`): `eip155` with methods `personal_sign` and `eth_signTypedData_v4`, events `accountsChanged`, `chainChanged`; `solana` with `solana_signMessage` and `solana_signTransaction`. Chains: the app's portfolio chain list, which is Ethereum 1, Base 8453, BNB Chain 56, Polygon 137, Optimism 10, Arbitrum 42161, Avalanche 43114, Robinhood Chain 4663, Arc 5042, Hyperliquid 999, plus Solana. **Chain 3223 (XO) is not in the list.** Accounts are the user's wallet credentials that have a stored address and are not disabled.
- **Not supported by the code:** `eth_sendTransaction` and `solana_signAndSendTransaction` (preview text "PayBox signs but does not broadcast for an app yet"), `eth_signTransaction` ("cannot sign an Ethereum transaction for an app yet"), `eth_sign`, `wallet_*`, and any raw-digest method.
- **`personal_sign` is text only.** The handler hex-decodes the message and requires valid UTF-8; otherwise the preview is "This message is raw bytes, not text." and no intent is created (the request is declined with "PayBox cannot service personal_sign"). A 32-byte binary hash (a UserOp hash) therefore cannot be signed through this route.
- **`eth_signTypedData_v4`:** the typed data is passed through as a `typedData` intent. If `domain.chainId` is present and differs from the chain in the request, the request is refused ("This asks to sign for chain X, but the session approved Y."). The chain in the request must be one the session approved. A typed-data payload for chain 3223 therefore cannot be signed unless 3223 becomes a supported chain or the payload's domain carries no `chainId` (NOT TESTED).
- **How it signs:** when the user approves a session, the app creates a PayBox **client** named "`<app name>` (WalletConnect)" with a grant for each matching wallet, `approval_mode: "autonomous"`. The proposal screen says: "Once connected it can request signatures for the addresses below, and PayBox will sign them without asking again. Disconnect it to stop that." On the first signature the user is asked to "Generate signing key … it stays in this browser and can be revoked at any time" (the `pbxk1.` key from section 6, minted in the browser). Each request then runs the same REST sequence as the SDK (`/agent/wallet-sign`, `/agent/requests/{id}/binding`, `moonx-sign`, `signature`) **from the PayBox app's own origin**, which is on the CORS allowlist.
- **Operational constraints visible in the code:** the PayBox app tab must be open and signed in and "listening"; only one tab answers ("Another PayBox tab is listening ... click into this tab to take over"); a session is "tied to the browser that approved it"; the signing key is stored in that browser. Sessions are validated against the requesting site (a name or URL mismatch shows a warning; reported-malicious apps are refused).

### 8.2 What this would give the hosted dApp (if it works as read)

- No PayBox CORS change, no OAuth client in the dApp, no proxy, nothing for the author to operate beyond a WalletConnect project id (a free public identifier from Reown; creating it is an account action for the author and a third-party relay dependency; not done here).
- `eth_signTypedData_v4` on chains 1, 8453, 56, 137, 10, 42161, 43114, 4663, 5042, 999 (for example Polymarket-style orders and ClobAuth on Polygon 137), and `personal_sign` for text messages.
- It does **not** cover: XO chain 3223 typed data (chain not offered, and the chainId check), UserOp-hash signing (binary `personal_sign` refused, no raw method), and anything that must be sent (`eth_sendTransaction` is not serviced; the dApp would have to broadcast the signed data itself).

### 8.3 Risks specific to this path [M, from the code and strings]

- It is described to the user as signing "without asking again" (autonomous). That makes it a standing signing authority for the connected app on the listed addresses, with no per-signature passkey (the app's own text; whether a step-up appears for some requests is NOT TESTED). For a wallet that holds funds, a compromised dApp origin (or a supply-chain compromise of its JavaScript) can request typed-data signatures until the user disconnects. This is stronger authority than the `always_approve` mode recommended in `[24]`. The user should use a **dedicated, low-balance PayBox wallet** for this connection.
- Blind signing: the code shows a one-line preview ("Typed data for <domain name>"), not the decoded order. The dApp must show the decoded item itself.
- It depends on an undocumented, very recent feature (the shell was modified today). It can change or be withdrawn without notice. The old bundle hash recorded in `[06]` now returns 404, so I could not check whether it existed on 2026-10-19.

### 8.4 What I could not establish

Secondary corroboration: one web search found nothing about `app.paybox.sh/wc` (MoonPay's app mentions WalletConnect as a MoonPay feature, not PayBox). The public docs, `llms.txt` and the developer portal have zero hits for WalletConnect. Whether the feature is rolled out to all accounts, whether it is meant for third-party dApps, whether the per-session client survives a reload, and every behaviour in 8.1 are NOT TESTED.

---

## 9. Live tests the user must run (none were run here)

| ID | Test | Expected if this note is right | Needs |
|---|---|---|---|
| LT1 | In the PayBox web app (signed in), open `https://app.paybox.sh/wc`. Pair with a WalletConnect **test dApp** or a scratch page, using a throwaway wallet credential holding almost nothing. Request `personal_sign` (text) and `eth_signTypedData_v4` on chain 137. Observe: is a passkey asked per signature; does the "Generate signing key" step appear; what the preview shows; whether a typed-data domain with `chainId` 3223 is refused; whether a binary `personal_sign` is refused. | Connect works; text and typed data sign; 3223 and binary are refused; no per-signature passkey | The user, a throwaway credential, a WalletConnect project id for the test page |
| LT2 | From the live dApp page, open the browser devtools console and run `fetch('https://api.paybox.sh/.well-known/oauth-authorization-server')` and `fetch('https://api.paybox.sh/oauth/register', {method:'POST', headers:{'content-type':'application/json'}, body:'{}'})`. | Both reject with a CORS `TypeError` ("blocked by CORS policy: No 'Access-Control-Allow-Origin' header"); nothing is created because the preflight fails | The user, 1 minute. Safe: no request reaches PayBox's registration logic. |
| LT3 | From a throwaway Vercel function (not the dApp), send `POST /oauth/register` with a loopback-free HTTPS `redirect_uris` for the dApp origin and `token_endpoint_auth_method: "none"`. | `201` with a `pbx-oauth-...` id: confirms open registration for an HTTPS redirect and that Cloudflare does not challenge Vercel egress | The user (a `POST`, creates a client record, which this task cannot do) |
| LT4 | With a registered client, run the device-code flow once from the function and call `tools/list`, then `request_wallet_sign` `{op:"message"}` on a throwaway credential with `always_approve`. | `pending_approval` with an `approval_url`; after the passkey approval `pending_signature` and no artifact until a window or a paired key exists | The user, a throwaway credential |
| LT5 | Repeat LT4 with a key paired through the CLI flow (`/api/agent-pairings/token`, `/iframe/pairing`, `app.paybox.sh/agent-key`) driven by a throwaway script on the server. | Signature returned; proves the undocumented chain end to end | The user, a throwaway credential |
| LT6 | `check_operation_readiness` for a typed-data intent with chain 3223, via any PayBox-connected agent. | A typed blocker or an accept; independent of the transport used | The user (a PayBox tool call) |

---

## 10. NOT FOUND (collected)

- Registration rate limits, client expiry, validation of `client_name`, whether `scope` at registration restricts later grants (searched `[D]`, `openapi.json`, `[S]`).
- Device-code `expires_in`, polling `interval` and error codes (the SDK handles `authorization_pending` and `slow_down`; values are in the unmeasured `POST` response).
- A documented web SDK, a browser signing surface, a partner programme, an origin allowlist process, MCP rate limits (searched `[D]`, `[S]`, `https://paybox.sh/llms.txt`, `https://developer.paybox.sh/llms.txt`, `https://api.paybox.sh/skill.md`).
- Any public documentation of the WalletConnect wallet (searched the same sources, hits: 0).
- Whether an `autonomous` grant skips the passkey for `request_wallet_sign`, and what step-up applies to a WalletConnect session.
- The source of the SDK (`github.com/moonpay/paybox` returns 404 to an unauthenticated read).

---

## 11. Verification (2026-10-20)

What I re-checked first-hand, and how:

1. **Docs.** Downloaded `https://docs.paybox.sh/llms-full.txt` (64,429 bytes) and read the sections `Credentials & agents`, `Approvals`, `Request lifecycle`, `MCP connector`, `OAuth 2.1`, `MCP tools` (`list_credentials`, `request_wallet_sign`), `API & endpoints`, `SDK & CLI`. Grepped it for `walletconnect`, `wc:`: 0 hits. Fetched `https://docs.paybox.sh/sitemap.xml` (8 pages), `https://paybox.sh/llms.txt`, `https://paybox.sh/`, `https://developer.paybox.sh/llms.txt`, `https://docs.paybox.sh/llms.txt`, `https://api.paybox.sh/skill.md`: 0 WalletConnect hits in each.
2. **Metadata.** `GET` of `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server/mcp` (404), `/.well-known/openid-configuration` (404), `/.well-known/api-catalog`, `/openapi.json`, `/health`, `/mcp` (401), `/oauth/authorize` (400), and `GET` on `/oauth/register`, `/oauth/token`, `/oauth/device_authorization` (405, `allow: POST`).
3. **CORS.** Preflight `OPTIONS` and plain `GET` for 9 endpoints times 4 origins (section 4); preflight against `/oauth/token` for 14 further origin strings; preflight against 10 REST paths for 2 origins (section 4, items 6 and 7). No `POST`, `PUT` or `DELETE` was sent to any PayBox host. Request header `User-Agent: insurance-markets-research/0.1` throughout; `Origin` and `Access-Control-Request-*` were the only other request headers.
4. **SDK.** Downloaded `package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js` of `@paybox-sh/sdk@2.2.0`; read `loginLoopback`, `loginDevice`, `refreshTokens`, `pairSigningKey`, `signWalletRequest`, `signIntent`, `requestWalletSign`, the MCP `post()` headers. Confirmed registry `latest` is 2.2.0 (2026-10-14). Nothing was installed or run.
5. **PayBox web app.** Downloaded the HTML shell and the entry bundle of `https://app.paybox.sh` as text. Read the response headers (CSP: `connect-src` includes the WalletConnect relay and verify hosts, `frame-ancestors 'self'`, so the app cannot be embedded in the dApp), the WalletKit initialisation, `supportedNamespaces`, `describeProposal`, `describeSignRequest`, the session-approval code (`approval_mode: "autonomous"`, `createClient`), the "Generate signing key" flow, the request controller and the portfolio chain list. I did not execute the bundle or open the app.
6. **Repo notes.** Read `docs/research/24-dapp-paybox-tie-in.md` in full and the OAuth, CORS and signing-related passages of `05` and `06`. I did not re-verify their other claims. `[24 §3.3]` measured CORS for `app.paybox.sh`, `example.org` and `claude.ai` on 2026-10-19; my 2026-10-20 measurements agree for those origins and add the dApp origin and the second allowed origin, `https://developer.paybox.sh`, which `[24]` did not list.
7. **Search.** One web search for PayBox and WalletConnect: no corroboration.

What I did **not** verify: registration, token exchange, device authorization, any `/mcp` call (all need a `POST`), what the consent screen shows a third-party client, Cloudflare's behaviour toward Vercel egress addresses, every behaviour of the WalletConnect screens (section 8), and whether the feature is enabled for all accounts.

Privacy check: this file contains no email address, personal name, username, GitHub login or home path. No credential id, wallet address or token was read or recorded (no PayBox tool was called; no `Set-Cookie`, `report-to` or monitoring key from the response headers is reproduced). Scratch files (docs, SDK text, app bundle, probe scripts and raw header dumps) are in the session scratchpad only.

## Sources

- https://docs.paybox.sh/llms-full.txt ; https://docs.paybox.sh/sitemap.xml ; https://docs.paybox.sh/llms.txt
- https://api.paybox.sh/.well-known/oauth-authorization-server ; https://api.paybox.sh/.well-known/oauth-protected-resource ; https://api.paybox.sh/.well-known/api-catalog ; https://api.paybox.sh/openapi.json ; https://api.paybox.sh/skill.md ; https://api.paybox.sh/health
- https://unpkg.com/@paybox-sh/sdk@2.2.0/ (`package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js`) ; https://registry.npmjs.org/@paybox-sh/sdk
- https://app.paybox.sh/ and https://app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js
- https://paybox.sh/llms.txt ; https://developer.paybox.sh/llms.txt
- Repo notes: `docs/research/24-dapp-paybox-tie-in.md`, `05-paybox-reference-plugins-b.md`, `06-paybox-platform.md`
