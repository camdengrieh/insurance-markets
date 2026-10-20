# 31. PayBox signing surface: can a web page on another origin drive it?

Researched 2026-10-20. Task `pw-signing-surface`. Read-only public research: public docs, public npm metadata, public JavaScript read as text (never executed), and unauthenticated `GET`/`OPTIONS` probes of public endpoints. **No PayBox MCP tool was called** (I loaded the schema and description text of six PayBox tools to read them, nothing more). No account, API key or OAuth client was created, no signature was requested, no POST was sent to any third party, no third-party code was cloned or run. Third-party content is treated as untrusted data. Probes used `User-Agent: insurance-markets-research/0.1`.

Binding context (from the task and `docs/plan.md`, `docs/phase1-gap-closing.md`): the user now requires "people to be able to use their paybox wallet on the dApp itself" (hosted at https://xo-markets-explorer.vercel.app, Vercel, static, today read-only); no fake or placeholder data; the repo is public; nothing the author must operate that holds other people's credentials; caps are advisory; every write path flag-gated OFF; PayBox terms are no obstacle; no browser automation of any third-party site.

Confidence tags: **H** = read or measured first-hand in a primary source this session (source named), **M** = secondary or inferred from code/text, **L** = guess. **NOT FOUND (searched: ...)** is a documented absence. **NOT TESTED** means a test is possible but needs a signature, an account or a POST that this task forbids.

Source keys:

- `[D]` https://docs.paybox.sh/llms-full.txt (whole public doc set), fetched 2026-10-20.
- `[T]` live PayBox MCP tool descriptions and input schemas for `request_wallet_sign`, `request_account_change`, `get_request`, `reopen_signing_window`, `get_deposit_link`, `check_operation_readiness` (read, not called).
- `[SDK]` `@paybox-sh/sdk@2.2.0` (latest on the registry on 2026-10-20, published 2026-10-14): `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/chunk-DWDC6W5P.js`, read as text from unpkg.
- `[APP]` the production web app bundle `https://app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` (15.6 MB, `last-modified` 2026-10-20 03:24 GMT, so current production), read as text. Quoted fragments are short; byte offsets are given where useful. Reading minified code is **M** for behaviour (I did not run it) and **H** for "this code is shipped".
- `[SHELL]` the signing-window page `https://api.paybox.sh/iframe/shell`, its `loader.js` and `app.js` (version 283), read as text.
- `[P]` my probes (section 2.3).
- `[24]`, `[28]`, `[34]`, `[05]`, `[06]` = `docs/research/24-dapp-paybox-tie-in.md`, `28-dapp-architecture-mvp.md`, `34-paybox-web-terms-risk.md`, `05-paybox-reference-plugins-b.md`, `06-paybox-platform.md`; `[P1]` = `docs/phase1-gap-closing.md`; `[SV]` = `docs/signing-vectors.md`.

---

## 0. Verdict

**Three answers, because the question has three different surfaces.**

1. **Can the hosted dApp open PayBox's approval / signing window as an iframe or popup and get the result back (the thing the task asked about)? No.** The approval and signing pages are served with `frame-ancestors 'self'` (app) and `frame-ancestors https://app.paybox.sh` (signing shell), so they cannot be framed by another origin `[P]` (H). There is no `postMessage`, redirect or `return_origin`-style channel back to a third-party page: the only `return_origin` in PayBox's code is for the Deposit link and the app hard-codes it to `grok.com` / `x.ai` `[APP]` (H, section 3.2). A request's result is readable only by the client that created it, with a bearer token `[D][T][P]` (H). The dApp's own `Cross-Origin-Opener-Policy: same-origin` would also sever any popup opener link `[P]` (H). **Verdict for "popup/iframe approval driven by the page": not possible, and a partner allowlist would have to add the capability, not just flip an entry** (section 8).

2. **But there is a surface nobody had found, and it is the answer to the user's requirement: the PayBox web app is a WalletConnect v2 wallet.** `https://app.paybox.sh/wc` ships a Reown `WalletKit`, handles `session_proposal` and `session_request`, accepts a pairing link through `?uri=`, and signs `personal_sign` and `eth_signTypedData_v4` (EVM) and `solana_signMessage` / `solana_signTransaction` for the connected app, using the user's PayBox wallet `[APP]` (H that the code is shipped; M that it works end to end, NOT TESTED). Public PayBox docs say nothing about it (NOT FOUND, searched `[D]`, `paybox.sh/llms.txt`, `developer.paybox.sh/llms.txt`), which is why `[24] G`, `[28]` and `[34]` recorded "no WalletConnect": those searches covered docs, not the shipped app. **Verdict: feasible with no author-operated server and no PayBox cooperation, subject to one live test, with hard limits** (no `eth_sendTransaction`, no raw digest, no `eth_signTransaction`, and a chain check that refuses chain 3223 typed data, so **XO's own signatures cannot go through it today**). Section 4.

3. **A conventional OAuth route for a web client exists on paper but needs a thin Vercel proxy and is unproven.** PayBox's `paybox` approval mode ("Complete in PayBox", `completion_url` on `app.paybox.sh`, no agent signing key) is the only mode where a browser-only client would not need an MCP-Apps window or a local `pbxk1.` key. Browser-direct is blocked by CORS (re-measured today for the dApp origin), so the token exchange and `/mcp` calls would run through a stateless function. Whether `request_wallet_sign` supports `paybox` mode at all is NOT TESTED. Section 5.

**Recommended path:** build the WalletConnect connector first (section 4.6), because it is the only route that works for an ordinary visitor with only a PayBox account, adds no author-operated component, and can be live-tested by the user in ten minutes. Keep the existing local-helper / agent-mediated path (`[24]` Architectures A and B) for what WalletConnect cannot carry: XO signatures, UserOps and on-chain transactions. Do **not** build the iframe/popup route.

---

## 1. Method in one paragraph

Read `[24]`, `[05]`, `[06]`, `[28]` and the repo status docs; re-fetched `docs.paybox.sh/llms-full.txt` and grepped for signing window, `approval_url`, iframe, deposit, `return_origin`, CORS, browser; read the SDK README, `SKILL.md`, type declarations and the bundled chunk; fetched `app.paybox.sh` and its entry bundle and grepped it for routes, `postMessage`, `window.opener`, `return_origin`, `approval`, `WalletKit`, `session_request`; fetched the signing shell, its loader and its `app.js`; probed response headers of the app, the shell, the API and the dApp itself with `GET` and `OPTIONS` using the dApp's real origin as `Origin`. Nothing was executed.

---

## 2. Facts

### 2.1 Surface map

| Surface | URL (as read) | What it is | Who can drive it | Source |
|---|---|---|---|---|
| Approval page | `https://app.paybox.sh/approvals/{id}` (route `approvals/[id].tsx`; the `approval_url` the MCP returns is documented only as "show the `approval_url`") | Passkey approval in the PayBox app | The signed-in PayBox user, in the app origin | `[APP]` routes, `[D]` lifecycle (H route exists; exact `approval_url` shape NOT FOUND without a call) |
| Web signing page | `https://app.paybox.sh/sign/{request_id}` (route `sign/[request_id].tsx`) | Hosts the signing window inside the app: it creates a hidden iframe to `https://api.paybox.sh/iframe/shell?r={request_id}` and supplies it tools through an origin-pinned transport. Text: "This signing link belongs to your PayBox account. Sign in, then open the link again to approve the request." | The signed-in PayBox user | `[APP]` offset ~9658000 to 9660500 (H code, M behaviour) |
| `completion_url` | A field of the request's initial result when `complete_in_paybox` is true; the in-chat card's button "Complete in PayBox" opens it, accepted only if the host is `app.paybox.sh`, `staging.app.paybox.sh`, localhost or `paybox.localhost` | The "paybox" approval mode's handoff to the website | The user | `[SHELL]` `app.js` ~69400 to 70200 and ~1383700 (H code) |
| Signing shell | `https://api.paybox.sh/iframe/shell` | The MCP-Apps guest UI `ui://paybox/wallet-sign` as a page; JSON-RPC over `postMessage` using the standard `ext-apps` SDK (`ui/initialize`, `tools/call`, `ui/open-link`) | An MCP-Apps host (chat clients) or `app.paybox.sh` | `[SHELL]`, `[P]` |
| WalletConnect wallet | `https://app.paybox.sh/wc` (`?uri=` pairing link; `?requestId=&sessionTopic=` deep link) | PayBox as WC v2 wallet | The signed-in PayBox user's open tab | `[APP]` (section 4) |
| OAuth / MCP | `https://api.paybox.sh/{oauth/*,mcp}` | The documented developer surface | Any OAuth client with the right CORS or a server | `[D]`, `[P]` |
| Internal app API | `https://api.paybox.sh/api/*`, `/agent/*`, `/iframe/requests/{id}/*` | Not part of the developer surface (`[D]` "an integration never calls them") | The app origin only (CORS); the shell with a per-request capability | `[D]`, `[APP]`, `[P]` |

### 2.2 The approval modes (task question 4)

| Mode | Where it is documented | What a human must do, and where | Needs a PayBox UI? |
|---|---|---|---|
| `always_approve` | `[D]` "passkey in the PayBox app"; MCP returns `pending_approval` + `approval_url` | Open the approval in the PayBox app or at `app.paybox.sh`, confirm with a passkey. Approvals are operation-bound and expire after about 10 minutes. After approval the request is `pending_signature` and something still has to **produce the signature artifact**: a signing window or an in-process `pbxk1.` key | Yes (approval), then a signing surface |
| `iframe` | `[D]` "confirm in the signing window" | Confirm in the in-chat signing window (an MCP-Apps host renders `ui://paybox/wallet-sign`) | Yes, but it must be an MCP-Apps host; a web page is not one |
| `autonomous` | `[D]` | No per-operation approval "within the grant". Wallet signs "still need the signing window to produce the artifact" (status `pending_signature`). `[D]` contradicts itself on whether signing needs a fresh passkey "regardless of mode" `[06 §6]` | No approval, but a signing window or `pbxk1.` key |
| `paybox` | Not in `[D]`. In `[T] request_account_change`: "For `paybox`, the user completes transactions on the PayBox website without an agent signing key." In `[SDK]` `Grant.approval_mode` type. In `[APP]` the consent screen text: "Transactions are completed in PayBox. No agent signing key is needed." and "Return to your chat. When you are ready, use Complete in PayBox to submit your transaction." | The user opens `completion_url` on app.paybox.sh and completes there | Yes, the PayBox website |

H for the four names and the quoted strings. NOT FOUND: whether `paybox` mode applies to `request_wallet_sign` (the strings say "transactions"); what exactly the website shows for typed data.

Also relevant: `X-Paybox-Signing-Surface: in-process | browser | none` is an MCP-host request header that "selects one advisory `next_action`; it does not grant signing access" `[SDK README]` (H). The SDK's `nextActionFor` maps `pending_signature` to `sign` (in-process), `await_human` (signing UI) or `stop`; `pending_approval` to `await_human` or `stop` `[SDK chunk]` (H). It is a hint for agents, not a third-party-page integration point.

### 2.3 Probes (all unauthenticated, 2026-10-20; "dApp origin" = `https://xo-markets-explorer.vercel.app`)

| Request | Result | Relevance |
|---|---|---|
| `GET https://app.paybox.sh/`, `/sign/00000000-0000-4000-8000-000000000000`, `/approvals/<same>`, `/wc` | `200 text/html` (SPA shell, content needs a session). CSP includes `frame-ancestors 'self'`, `form-action 'self'`, `frame-src https://api.paybox.sh ...`, `connect-src 'self' https://api.paybox.sh ... wss://relay.walletconnect.org https://relay.walletconnect.org https://verify.walletconnect.org https://verify.walletconnect.com`. `permissions-policy: publickey-credentials-get=(self ...)`. No `X-Frame-Options`, no `Cross-Origin-*` headers returned. `access-control-allow-origin: *` on the HTML (irrelevant: it is a page) | The app cannot be framed by another origin (H). It can be opened top-level or as a popup (H); a passkey assertion for it can only run on its own origin (permissions policy, M for the WebAuthn consequence) |
| `GET https://api.paybox.sh/iframe/shell` and `?r=<uuid>` | `200 text/html`, `content-security-policy: ... frame-ancestors https://app.paybox.sh`, `cache-control: no-store`, `access-control-allow-origin: *`, no `X-Frame-Options`. Body: a loader that imports `/iframe/assets/loader.js`, which reads `/iframe/version` (`{"version":283}`) and imports `/iframe/assets/v283/app.js` | The signing window cannot be embedded by the dApp (H) |
| `OPTIONS https://api.paybox.sh/iframe/requests/<uuid>` (Origin dApp and app) | `200`, `access-control-allow-origin: *`, methods `GET,POST,OPTIONS`, headers `content-type,authorization`. `GET` of it returns `405` with `access-control-allow-origin: *` | The shell's per-request endpoints (`signature`, `envelopes`, `moonx-sign`, `binding`, `get_request`, mapped in `[APP]` ~9667900) are CORS-open but authenticated by a per-request capability that only the app, the shell or the MCP tool result holds (M) |
| `GET https://api.paybox.sh/agent/requests/<uuid>` (Origin dApp) | `401 {"error":"missing authorization header"}`; no `access-control-allow-origin` | Request status needs a bearer token (H) |
| `GET https://api.paybox.sh/mcp` (Origin dApp) | `401`, `www-authenticate: Bearer realm="paybox", resource_metadata="https://api.paybox.sh/.well-known/oauth-protected-resource"`, no ACAO | Same (H) |
| `OPTIONS` of `/mcp`, `/oauth/token`, `/oauth/register`, `/agent/requests/<uuid>`, `/api/requests/<uuid>/signing-payload` with Origin = dApp | `200` with `access-control-allow-credentials: true`, methods `GET,POST,PUT,PATCH,DELETE,OPTIONS`, headers `content-type,authorization,x-moonx-access-token,x-moonx-identity-token,x-moonx-presence,mcp-protocol-version`, **no `access-control-allow-origin`** | A browser blocks the actual request (H). Same call with Origin `https://app.paybox.sh` returns `access-control-allow-origin: https://app.paybox.sh` (H) |
| `GET https://api.paybox.sh/.well-known/oauth-authorization-server` (Origin dApp) | `200`; lists `registration_endpoint`, `device_authorization_endpoint`, grant types `authorization_code`, `refresh_token`, `urn:ietf:params:oauth:grant-type:device_code`, auth method `none`, scopes `mcp`, `offline_access`; no ACAO | Dynamic registration and device flow are open to servers (H) |
| `GET https://xo-markets-explorer.vercel.app/` | `200`; CSP `default-src 'none'; script-src 'self'; ... connect-src 'self' <XO, Polymarket, Manifold, ... RPC hosts>; frame-ancestors 'none'; form-action 'none'; require-trusted-types-for 'script'; trusted-types 'none'`; `Cross-Origin-Opener-Policy: same-origin`; `Cross-Origin-Resource-Policy: same-origin`; `X-Frame-Options: DENY`; `Referrer-Policy: no-referrer` | The hosted dApp cannot reach `api.paybox.sh` or the WalletConnect relay as shipped; its COOP breaks popup opener links (H) |

---

## 3. Answers to the five questions

### 3.1 Q1. What URL does the user open to approve a `request_wallet_sign`, and what does it need?

- **Approval step (`always_approve`):** the `approval_url` returned in the `pending_approval` envelope, opened "in the PayBox app" `[D]`. The app has a route `approvals/[id]` and the API `POST /api/approvals/{id}/approve` with an `expected_revision` (operation binding) `[APP]` ~7933600 (H). The user must be signed in to PayBox (email plus passkey). The URL carries the approval id; whether it also carries a token: NOT FOUND (needs a real call). The approving request is made by the app's own session (`x-moonx-*` headers), not by the original client, which is why a third-party page cannot do it.
- **Signing step:** `https://app.paybox.sh/sign/{request_id}` in the web case; or the in-chat window. The page needs only the request id in the path plus the user's PayBox web session; it says so itself ("This signing link belongs to your PayBox account"). It then fetches the signing payload with `POST /api/requests/{id}/signing-payload` using the user's session, creates a hidden iframe to the shell, and for `paybox_hosted` requests provisions an ephemeral signer ("PayBox transaction") before the shell signs `[APP]` ~9658000 to 9667000 (M, code read, not run).
- **What it needs about the origin:** nothing is passed. No origin, token or return parameter appears in the `sign/[request_id]` route code (H, read). The only inputs are `request_id` (path) and the session.

### 3.2 Q2. Popup or iframe from another origin; does it post a result back; is there a documented `return_origin`?

- **Iframe: blocked.** App pages `frame-ancestors 'self'`; shell `frame-ancestors https://app.paybox.sh` `[P]` (H). Not even a Vercel preview of the dApp, nor a partner on its own domain, can embed them; a PayBox-side change to those CSPs would be required.
- **Popup / new tab: the pages load** (no `X-Frame-Options`, no COOP/CORP on the app's HTML, `[P]`), **but nothing sends a result back.** I grepped `[APP]` for `postMessage` (49 hits), `window.opener` (4) and `targetOrigin` (51). The `window.opener` uses are: a Mastercard click-to-pay callback with `type: "mastercard_auth_callback"`, the Expo web-browser auth-session redirect completion (same-origin), and an X-faucet return that posts to `window.location.origin` only `[APP]` offsets 8866374, 9006781, 12179608 (H). None is on the approval or signing routes. In `[SHELL]` the one `postMessage` is the ext-apps transport that posts JSON-RPC to the embedding parent with target `*` (standard SDK), and it accepts only the host that framed it. So there is **no documented or implemented popup-result channel for a third party**.
- **`return_origin` is real but is not this.** The SDK type `DepositLinkResult.return_origin: string | null` is documented nowhere (`[24]` row F: "unknown meaning"). In `[APP]` offset ~9557700 the Deposit page does `N(e.return_origin ? depositReturnHref(e.return_origin) : null)`, and `depositReturnHref` returns an origin only if it is `https`, has no port or credentials, and the host is exactly `grok.com` or `x.ai` with an empty path `[APP]` ~7950800 (H). So `return_origin` is a "send the user back to the chat host after funding" feature, hard-coded to two hosts, and has nothing to do with signing. A third-party dApp origin would be rejected (null).
- **The dApp's own header blocks the popup anyway.** `Cross-Origin-Opener-Policy: same-origin` on the dApp puts any cross-origin window it opens in a different browsing context group, so `window.opener` / `popup.closed` / `postMessage` links do not work; only a plain top-level navigation or a `target=_blank rel=noopener` link would work `[P]` (H for the header, M for the browser consequence).
- **MCP-Apps host route: not available.** Hosting `ui://paybox/wallet-sign` inside the dApp would require the dApp to be an MCP-Apps host that supplies the window with hidden app-only tools (`submit_*`, `moonx_*`), and the shell only talks to the frame that embeds it and only inside `https://app.paybox.sh` by CSP `[SHELL][P]` (H). `[D]`: "The window's own calls back to PayBox use internal tools that are hidden from the agent... not part of this surface."

### 3.3 Q3. Can a dApp poll request status without PayBox credentials?

No. Status is `get_request` (MCP) or `GET /agent/requests/{id}` (the SDK's REST route), both bearer-authenticated; "Only the client that created the request can read it" `[D][T]` (H); unauthenticated `GET` returns `401 missing authorization header` `[P]` (H). `list_requests` returns only this client's requests with redacted outputs `[D]`. The CORS-open `/iframe/requests/{id}` endpoints use a per-request capability (the `refresh_token`-named value handed from a tool result to the window, `[APP]` ~9664300) that a page would only hold if it had already made the MCP call (M). A dApp that is itself an OAuth client (section 5) can poll; a dApp that merely watches somebody else's request cannot. In the WalletConnect route no polling exists: the answer comes back over the relay (section 4).

### 3.4 Q4. Approval modes

See section 2.2.

### 3.5 Q5. What a visitor must have set up

For **WalletConnect (section 4)**: a PayBox account (email plus passkey); at least one wallet credential created in the app (`supportedNamespaces` is built only from non-disabled `wallet` credentials with an address); the app open and signed in at `app.paybox.sh/wc` in **one** tab (a leadership lock makes other tabs stand by: "Another PayBox tab is listening for this app"); a signing key generated in that browser the first time ("Generate signing key ... stays in this browser and can be revoked at any time"); no per-dApp grant to set up by hand, because PayBox creates the client and its grant itself at connect time `[APP]` ~10205000 to 10208000 (H code). For **OAuth (section 5)**: the same account and wallet, plus a consent screen where the user selects credentials and an approval mode for the dApp's client (`[D]`), and for `paybox` mode the user must be signed in at app.paybox.sh to complete. For **agent-mediated / local helper** (`[24]`): a PayBox-connected agent or the helper's device-code login. In every case the wallet credential must exist already; the CLI "cannot create wallets" `[24]`.

---

## 4. The WalletConnect surface (the finding)

### 4.1 Evidence

All from `[APP]` (H that the code is shipped to production today; M for runtime behaviour):

1. **Wallet-side SDK present.** `WalletKit.init({core: new Core({projectId: ...}), metadata: {name: "PayBox", description: "The payment vault for AI agents", url: "https://paybox.sh", ...}})` at ~10219900. (A WalletConnect Cloud project id is embedded; I do not reproduce it.)
2. **A route and UI.** Expo route `./wc.tsx` (~707147). UI strings: "Connect an app", "Paste the connection link from the app you want to connect.", "Connect this app?", "Addresses it will see", "What it can ask for", "Connected apps", "Listening for signature requests.", "Signature request", "Signing - the app gets the answer in a moment.", "The app has the signature. You can go back to it." (~10208000 to 10219000).
3. **Pairing by link.** `/wc?uri=<wc: URI>`: the page reads `search.uri`, strips it from the address bar and calls `walletKit.pair({uri})` (~10204500). A dApp can therefore deep-link the user straight into the pairing, no QR needed.
4. **Methods and chains PayBox will approve.** `WALLET_CONNECT_METHODS = { eip155: ["personal_sign", "eth_signTypedData_v4"], solana: ["solana_signMessage", "solana_signTransaction"] }`, events `accountsChanged`, `chainChanged` (EVM). EVM chains are `PORTFOLIO_CHAINS` of family `evm`, expressed as `eip155:{id}`, intersected with each wallet credential's chains; Solana is the mainnet genesis id. The exact list is the app's portfolio chain list: its display map names Ethereum 1, Optimism 10, BNB 56, Polygon 137, Monad 143, Hyperliquid 999, Robinhood 4663, Arc 5042, Base 8453, Arbitrum 42161, Celo 42220, Avalanche 43114 (~9061500). XO's chain 3223 is not in it (consistent with `[06]`).
5. **Request handling (`describeSignRequest`, ~10562223).**
   - `personal_sign`: hex or plain text decoded as strict UTF-8; if it is not valid text the preview says "This message is raw bytes, not text." and no intent is created, i.e. the request is refused. Otherwise intent `{op:"message", message}`.
   - `eth_signTypedData_v4`: JSON-parsed; if `domain.chainId` is set and differs from the session chain the request is refused ("This asks to sign for chain X, but the session approved Y."); otherwise intent `{op:"typedData", typedData}`. Preview shown to the user: "Typed data for <domain.name>", not the fields.
   - `eth_sendTransaction` and `solana_signAndSendTransaction`: refused with "PayBox signs but does not broadcast for an app yet."
   - `eth_signTransaction`: refused with "PayBox cannot sign an Ethereum transaction for an app yet."
   - anything else (including `eth_sign`, `eth_signTypedData`, `eth_signTypedData_v3`, `wallet_*`): "PayBox cannot service {method}."
   - `sessionAllows` also checks that the request's chain and address are in the approved session.
6. **How it signs.** On `session_request` (`controller.h`, ~10557000 to 10561500): find the PayBox wallet credential for the requested address, require an in-browser ed25519 "signing key" (`needsKey` stage otherwise), then `POST /agent/wallet-sign` with `Bearer {clientKey}` and `{type:"wallet_sign", credential_id, intent}` (the same `request_wallet_sign` machinery), then `signParkedRequest`, which posts `/agent/requests/{id}/binding`, `/moonx-sign`, `/signature` with the ephemeral key (the same flow as the SDK's in-process path), then `respondSessionRequest` with the signature. For `personal_sign` and `eth_signTypedData_v4` the result is the hex `signature` string.
7. **The grant it creates.** At `approveSession`, PayBox calls `createClient({name: "<app name> (WalletConnect)", grants: [{credential_id, approval_mode: "autonomous", allowed_merchants: [], allow_raw_secret: false}], expires_at: null})` for every wallet credential whose address matches the accounts being approved, and stores `{topic, clientId, clientKey, apiPubHex, apiPrivHex}` in the browser's `localStorage` under `paybox.wc.sessions` ("a session is tied to the browser that approved it").
8. **Safeguards visible in code.** WalletConnect **Verify** is consulted: the proposal shows a verified or "self-reported and could not be verified" badge, and `isScam` apps are refused ("PayBox will not connect an app reported as malicious."). Only one PayBox tab answers at a time (BroadcastChannel plus a `localStorage` lease, `paybox.wc.leader`, claims per request).
9. **What the UI does not show.** There is no per-request "Approve" button in the signing path I read: after the `Signature request` preview the controller proceeds to create the request and sign (stage `signing`). Whether the PayBox **server** then insists on a passkey for `request_wallet_sign` despite the `autonomous` grant is the unresolved contradiction in `[D]` (`[06 §6]`); if it does, `signParkedRequest` would error ("Signing failed: ...") and the dApp would receive error `4001`. NOT TESTED.

### 4.2 What this means for the dApp (what is possible)

| Need | Through WalletConnect | Why |
|---|---|---|
| Show the user's PayBox EVM address and identify them | Yes: session `accounts` (one address valid on every approved `eip155` chain) | `supportedNamespaces` (H) |
| Sign-in message (SIWE or plain text) | Yes via `personal_sign` if the message is UTF-8 text | (H code) |
| EIP-712 order signing for venues on a chain PayBox lists, e.g. Polymarket CLOB orders on Polygon 137, ClobAuth-style attestations on a listed chain | Yes in principle (domain `chainId` must equal the requested session chain) | (H code, NOT TESTED) |
| **XO orders, XO ClobAuth, Kernel `Kernel(bytes32)` wrapper** | **No, refused.** Every XO domain carries `chainId 3223` `[SV]`. 3223 is not a PayBox chain, so there is no session chain to request on, and a request on another chain with domain chainId 3223 is refused by the mismatch check | (H code, M behaviour) |
| **ERC-4337 UserOps for any smart account** | **No.** The signer must sign the 32-byte `userOpHash` as `raw` (or as an EIP-191 hash of bytes). `personal_sign` refuses non-UTF-8 bytes, and WC has no raw-digest method | (H code) |
| On-chain transactions (approve, deposit, redeem) | **No.** `eth_sendTransaction` and `eth_signTransaction` are refused | (H code) |
| EIP-7702 authorization | **No** | not in the method list |
| Solana message / transaction signing | Yes, `solana_signMessage` and `solana_signTransaction` (sign only) | (H code) |
| Moving funds | Not through the dApp; the user does that inside PayBox | |

So WalletConnect gives **identity plus off-chain typed-data/message signing on PayBox-supported chains**. For this project that covers the read-side identity (which smart-account/proxy addresses to show) and venues whose orders are signed on a listed chain; it does not cover XO writes, which `[P1]` already treats as the hardest part.

### 4.3 What the dApp would have to do

1. Add a headless WalletConnect Sign client (`@walletconnect/sign-client` 2.26.0 or `@walletconnect/ethereum-provider` 2.26.0 are the current registry versions on 2026-10-20 (H, registry); `@reown/appkit` 1.8.24 is the modal SDK). Prefer no modal: the dApp renders its own QR code and a button that opens `https://app.paybox.sh/wc?uri=<encodeURIComponent(uri)>` in a new tab. The earlier design rule against AppKit/wagmi (`dapp-design.md` line 245; `[28]`) was about spoofing surface and third-party registration; the user's new requirement overrides it for this connector, and a headless client keeps the smaller surface.
2. Create a free **project id** with Reown Cloud (the relay requires it; it can be restricted to an origin allowlist, `https://docs.reown.com/cloud/relay`, H). That is one third-party registration by the author, not an operated service; the project id is public in the bundle by design.
3. Request namespaces **optionally**: `optionalNamespaces.eip155 = { chains: [...], methods: ["personal_sign", "eth_signTypedData_v4"], events: [...] }`. Anything PayBox cannot support in `requiredNamespaces` makes approval fail (WalletConnect spec behaviour for `buildApprovedNamespaces`, M).
4. Set a short request expiry and show a countdown: the tab must be open and the user must be present (section 4.5).
5. Change the hosted headers: `connect-src` needs `wss://relay.walletconnect.org https://relay.walletconnect.org https://verify.walletconnect.org https://verify.walletconnect.com` (the hosts PayBox itself lists for its WC use, H); `require-trusted-types-for 'script'` with `trusted-types 'none'` may break libraries that touch DOM sinks (L; test with the headless client); bundle the library under `script-src 'self'`. `frame-src`, `frame-ancestors`, COOP can stay as they are for this route (a new-tab link needs none of them). The existing dependency allowlist and supply-chain checks (`app/scripts/check-deps.ts`, `dependencies.json`) must be extended deliberately; WalletConnect pulls a large transitive tree (L, not measured).
6. Decode every typed-data request into plain fields in the dApp before sending, because PayBox's own preview is only "Typed data for <domain name>" (section 4.4).

### 4.4 Security reading (it matters more than the plumbing)

- **PayBox's WalletConnect path appears to sign without a per-request confirmation** and the client it creates is `autonomous` with no expiry (H code, section 4.1 items 7 and 9; server behaviour NOT TESTED). While the user's PayBox tab is open and signed in, any app that holds the WC session can ask for typed-data signatures over that wallet. EIP-712 includes ERC-2612 `Permit`, Permit2 and Seaport-style orders, which can authorise token transfers; this is the standard drainer pattern. The Verify badge and the `isScam` list help against known-bad domains only.
- Consequence for the product: a **look-alike of the hosted dApp** can ask the same user to connect. The honest mitigations are advice and defaults, not guarantees: (a) tell the user to use a **dedicated PayBox wallet funded with a small amount** for the dApp (the same rule as `[P1 §9 A4]`), (b) show the connected-client name and the revoke path ("Clients" screen in PayBox revokes the `(WalletConnect)` client and its key), (c) register the real origin with Reown so the Verify badge reads "verified", (d) the dApp must never request methods outside the two it needs, and (e) the dApp shows decoded fields next to each request so a user comparing the PayBox preview with the dApp can notice a mismatch (a human check, not a protection against a deceived user).
- **No custody by the author.** The dApp holds no key and no PayBox token. The only secrets are the user's WalletConnect session keys, kept by the client library in the visitor's browser storage; the PayBox client key and signing key are in the visitor's PayBox origin storage. The author operates nothing.
- **Trust in PayBox's web client.** Signing logic for this route runs in PayBox's page (a 15 MB bundle that changes daily). The user trusts PayBox as they already do.

### 4.5 Limits and unknowns specific to this route

- **The PayBox tab must stay open, signed in, and be the leader tab**; the relay transport is closed in non-leader tabs. A closed tab means requests wait on the relay until they expire (default WC request TTL is about five minutes; M, general WalletConnect behaviour). Phones: browsers throttle background tabs and WebSockets (L). The PayBox iOS app (App Store id appears in the page meta) may or may not support WC: NOT FOUND.
- Whether a **first connection** needs a passkey and what the "Generate signing key" step asks the user to do: NOT TESTED.
- Whether signatures are the plain 65-byte `r||s||v` hex: for `personal_sign` and `eth_signTypedData_v4` the app returns `output.signature` verbatim (H code); its length and v-value convention, and whether `s` is low: NOT TESTED (the same question as `[24]` TP1).
- Whether the production server accepts the WC-created client's `request_wallet_sign` for **every** chain in the session: NOT TESTED.
- WalletConnect Cloud availability, rate limits and terms for the author's project id: not evaluated beyond the relay docs (M).

### 4.6 Recommendation for this surface

Build it, behind a flag that defaults off until the live test in section 9 (WC-1 to WC-4) passes, as an **additional signer** in the existing `SigningPath` abstraction of `[24]`: `WalletConnectPayBox`. Scope it to `personal_sign` identity and typed-data signing on PayBox-listed chains. Keep XO and UserOps on the local helper / agent path. Say plainly in the UI which actions a WalletConnect-connected PayBox wallet cannot do and why.

---

## 5. The OAuth-client route with a thin Vercel layer

This is the conventional answer to "log in with PayBox", and it is what the user may expect from the words "use my wallet on the dApp". It is feasible only in part and unproven.

### 5.1 What works in a browser, what does not

| Step | Browser-only | Why |
|---|---|---|
| Discover (`/.well-known/*`) | CORS responses carry no `access-control-allow-origin` for the dApp origin (GET returned 200 but the browser would block the read) `[P]` | (H) |
| Dynamic client registration `POST /oauth/register` | Blocked | CORS (H) |
| `GET /oauth/authorize` | Works as a **top-level redirect** (no CORS involved); redirect URIs must be `https` or `http://localhost`, matched exactly `[D]` | (H) |
| `POST /oauth/token` (code and refresh) | Blocked | CORS (H) |
| `POST /mcp` | Blocked | CORS (H) |

So a thin function is needed for registration, token exchange and MCP forwarding. It can be **stateless**: PKCE verifier and tokens live in the visitor's browser; the function forwards to `api.paybox.sh` only (fixed upstream, no logging, no storage). It sees tokens in transit, and a compromised deployment could read them, which is a real risk to state, though no key or long-term storage is held by the author (this satisfies "holds no user keys"; it does not satisfy "nothing the author must operate").

### 5.2 Then the signing step

Whatever the dApp client requests, the artifact must be produced by a signing surface:

- In `always_approve` or `autonomous`, a browser client has **no** surface: it is not an MCP-Apps host (section 3.2), and the in-process `pbxk1.` key route needs `/agent/requests/{id}/binding|moonx-sign|signature` calls, which are internal routes not in the public API `[D]`, pairing by an eight-emoji confirmation done in the PayBox UI `[24]`, and CORS blocks them from the dApp origin anyway `[P]`. Rejected.
- In **`paybox` mode**, the user opens `completion_url` (`app.paybox.sh/sign/{request_id}` as far as I can tell; the exact value is NOT FOUND without a call), signs there, and the dApp's client polls `get_request` through the proxy until `success` and reads `output`. This is the only browser-compatible OAuth path. It has no result channel back to the page, so the dApp shows a "Waiting for PayBox" state with the link and polls.
- Unknown: whether `request_wallet_sign` returns `complete_in_paybox`, `paybox_hosted` and a `completion_url` for message/typed-data/raw intents, or only for transfers and swaps (the code and strings say "transactions" and "swap"). The sign page text is generic ("approve the request"). NOT TESTED.
- Unknown: whether `paybox` mode can sign the chain-3223 typed data and raw digests that WalletConnect cannot; `[24]` TP0/TP2 questions apply unchanged.

If the live test (section 9, OA-1) shows `request_wallet_sign` working in `paybox` mode, this route would carry XO's typed data and `raw` UserOp digests through a normal PayBox page, which WalletConnect cannot. It would then be the better path for XO, at the price of the proxy.

### 5.3 What `paybox` mode asks of the visitor

Account and wallet (as above); a one-time consent at `app.paybox.sh` choosing the wallet and mode `paybox` for the dApp's client (the consent screen offers per-credential approval modes `[D]`); each signature then needs the user to be signed in at app.paybox.sh and press the completion control.

---

## 6. Every way a PayBox account holder could sign from the hosted page, ranked

| # | Route | Signs which things | Author-operated component | PayBox cooperation | Status | Verdict |
|---|---|---|---|---|---|---|
| 1 | **WalletConnect v2 into `app.paybox.sh/wc`** | `personal_sign` (UTF-8), `eth_signTypedData_v4` (chain in PayBox list), Solana message/tx | None (Reown project id only) | None | Code shipped (H), runtime NOT TESTED | **Feasible; build first** |
| 2 | OAuth client + stateless Vercel proxy + `paybox` mode | Potentially all `request_wallet_sign` intents incl. `raw` and chain 3223 typedData | Stateless function (tokens in transit) | None | `paybox` mode applicability NOT TESTED | **Plausible; test, then decide** |
| 3 | OAuth client + proxy + `always_approve`/`iframe`/`autonomous` | Same | Proxy | None | No browser signing surface | Not possible without a signer |
| 4 | OAuth client + proxy + browser-held `pbxk1.` key | Same | Proxy | None | Internal routes, CORS-blocked, pairing in PayBox UI | Rejected |
| 5 | Embed approval or signing window (iframe) | n/a | n/a | CSP change | Blocked by `frame-ancestors` | Not possible |
| 6 | Popup to `app.paybox.sh/approvals/{id}` or `/sign/{id}` and wait for `postMessage` | n/a | n/a | New return channel | No channel exists; COOP also blocks it | Not possible |
| 7 | dApp as an MCP-Apps host | n/a | n/a | Partner host API | Window talks only to `app.paybox.sh` | Not possible |
| 8 | Local helper as OAuth client (existing `[24]` Architecture B) | All intents | User's own machine | None | Designed, not built, NOT TESTED | Keep as the XO/UserOp path |
| 9 | Agent-mediated (existing `[24]` Architecture A) | All intents | None | None | Works in principle; PayBox-connected agent required | Keep as default for XO |
| 10 | Direct browser call to `api.paybox.sh/mcp` | n/a | n/a | CORS allowlist | Blocked | Not possible |

---

## 7. What a visitor must have, per route (task question 5, consolidated)

| Route | PayBox account | Wallet credential | Grant for the dApp | Other |
|---|---|---|---|---|
| 1 WalletConnect | Yes (signed in at app.paybox.sh) | Yes, in the app | Created automatically at connect time (client "<dApp name> (WalletConnect)", autonomous) | One open PayBox tab, a locally generated signing key, Reown project id on the author's side |
| 2 OAuth + `paybox` mode | Yes | Yes | Chosen on the consent screen (mode `paybox`) | Signed in at app.paybox.sh for each completion; the proxy |
| 8 Local helper | Yes | Yes | Device-code consent for the helper's client | The helper installed on their machine |
| 9 Agent-mediated | Yes | Yes | The agent's existing grant | A PayBox-connected agent |

---

## 8. What would need PayBox's cooperation, and the likely answer

These are asks to name, not asks to send: the project decision is that nobody contacts XO and PayBox was not asked; no message was sent. Likely answers are **L** (judgement, no evidence).

| # | Ask | What it would unlock | Likely answer (L) |
|---|---|---|---|
| A1 | Confirm that `app.paybox.sh/wc` WalletConnect support is public, supported, and stable | Route 1 on a supported footing | Plausible yes, as the code is in production; unknown whether they call it supported |
| A2 | Add chain 3223 to the WalletConnect session chains and allow typed data whose `domain.chainId` is 3223 | XO orders and ClobAuth over route 1 | Unlikely to be a priority; chain 3223 is not in their catalog and "catalog membership does not guarantee support" |
| A3 | Add a raw-digest method (or `personal_sign` over bytes) to WalletConnect | UserOps over route 1 | Unlikely: a raw digest is blind signing |
| A4 | Add `eth_sendTransaction` / `eth_signTransaction` to WalletConnect | On-chain steps over route 1 | The code says "yet"; plausible later, no date |
| A5 | Allow the dApp origin in CORS on `/oauth/*` and `/mcp` | Removes the proxy for route 2 | Possible for a partner; they allow only their app today. PayBox's docs say partner routing exists (`?app=slug`, `@paybox-sh/connect-react`) but "a slug is routing, not authorization" `[24]` |
| A6 | Allow third-party origins as a post-completion `return_origin` for `completion_url` (as they already do for `grok.com` / `x.ai` on the Deposit link) | Lets route 2 return the user to the dApp | Possible; precedent exists for two hosts |
| A7 | Per-request confirmation (or a spending policy) on WalletConnect-created clients | Closes the autosign risk in 4.4 | Reasonable security request; unknown |
| A8 | Framing allowlist for the signing shell | In-page window | Very unlikely (frame-ancestors is deliberate) |

---

## 9. Live tests the user can run (none was run; none uses a PayBox MCP tool from this repo's agent)

Use a **throwaway PayBox wallet with no balance**. Record results in a new `docs/phase0-gate-results`-style note; do not paste addresses publicly.

| ID | Test | Answers | Pass criteria |
|---|---|---|---|
| WC-1 | In a normal browser signed in to PayBox, open `https://app.paybox.sh/wc`. Use any WalletConnect v2 test dApp with your own free Reown project id (or the dApp after the connector exists) to create a pairing link and paste it into PayBox (or open `/wc?uri=<encoded>`). Approve. | Whether the route is live for a normal account; what "Connect this app?" shows (name, verified badge, chains, "What it can ask for"); that a "(WalletConnect)" client appears on the PayBox Clients screen with mode `autonomous` | Session established; client listed |
| WC-2 | From that dApp send `personal_sign("hello")`, then `eth_signTypedData_v4` with a trivial domain `{name, version, chainId: 137}` on `eip155:137`. Verify both with `viem` (`recoverMessageAddress`, `recoverTypedDataAddress`). Sign the same payload twice. | Whether signatures return, their length/`v`/`s`, determinism, whether a passkey prompt or approval appears at any point, whether the user must click anything, what PayBox displays for the typed data | Recovered address equals the wallet address |
| WC-3 | Send `eth_signTypedData_v4` with `domain.chainId = 3223` (the XO Kernel/order domain) on `eip155:137`, and `eth_sendTransaction`, `eth_signTransaction`, `eth_sign`, and `personal_sign` over 32 random bytes. | Confirms the refusals in section 4.1 item 5 and the exact error codes | All five refused |
| WC-4 | Close the PayBox tab, send a request, reopen the tab within a minute; then open two PayBox tabs; then test on a phone browser. | Request queueing, leader-tab behaviour, mobile viability | Documented behaviour |
| WC-5 | Revoke the "(WalletConnect)" client on the Clients screen, then send a request. | Revocation takes effect | Request fails |
| OA-1 | In PayBox's UI, set a throwaway client's mode to `paybox` (the Clients screen "manage" page). From a client you control (for example your normal agent), call `request_wallet_sign` with a `message` intent and read the returned envelope for `completion_url`/`complete_in_paybox`; open the link; complete; read `get_request`. | Whether `paybox` mode applies to `request_wallet_sign`; the exact `completion_url`; whether the website shows message and typed data legibly; whether `typedData` with chainId 3223 and `raw` are accepted | `success` with a signature in `output` |
| HDR-1 | After the connector exists, in the dApp's preview deploy, open DevTools and confirm zero CSP violations with the new `connect-src`, and that Trusted Types does not throw. | Header changes in section 4.3 are sufficient | No violations |

OA-1 is the single most valuable test for XO: if it passes, route 2 can carry XO's chain-3223 typed data and UserOp digests.

---

## 10. Corrections to earlier notes

- `[24]` section 3 row G ("WalletConnect... NOT FOUND") and section 0 item 3, `[28]` section 2 ("PayBox documents no WalletConnect... dApp connection") and its "C (killed): browser page as PayBox client", and `[34]` section 5 ("no evidence that PayBox can be connected in as a WalletConnect wallet") are **superseded for the sentence "PayBox cannot be connected in as a WalletConnect wallet"**. The docs still do not document it; the shipped app does implement it. The CORS and OAuth measurements in those notes are re-confirmed for the dApp origin (section 2.3).
- `[24]` section 3.3 and `[28]`: "There is no Vercel function of ours" (`[28]` principle in section 5.3: "Never an author-operated proxy") conflicts with route 2; the user's new requirement now permits a thin layer, but route 1 avoids it.
- `[24]` row H (`X-Paybox-Signing-Surface`): confirmed advisory only; the `browser` value is not a third-party integration point.
- `[24]` section 4 last row ("dApp acting as an MCP Apps host... not supported") is confirmed with new evidence: shell CSP `frame-ancestors https://app.paybox.sh`.
- `dapp-design.md` line 245 ("A free-form call builder, ENS, WalletConnect, wagmi, AppKit" are refused) is superseded narrowly by the user's requirement; the recommended implementation is headless Sign client, two methods, no modal.

---

## 11. NOT FOUND and unverified (collected)

- The exact `approval_url` and `completion_url` formats (need a real call). NOT FOUND (searched `[D]`, `[SDK]`, `[APP]` routes; strings are built server-side).
- Whether `request_wallet_sign` supports `paybox` mode. NOT TESTED.
- Whether WalletConnect signing in the PayBox app needs a passkey at any step, and what the first-connection "signing key" step requires. NOT TESTED.
- The exact EVM chain list in WalletConnect sessions (the code derives it from a portfolio chain list that I did not locate as a literal). NOT FOUND.
- Whether PayBox's mobile app supports WalletConnect. NOT FOUND (searched web-app code only).
- Whether WalletConnect Cloud / the Reown relay is acceptable for the author's project (terms, limits). Not evaluated beyond the relay doc page.
- Whether any PayBox documentation, release note or blog describes the WalletConnect feature. NOT FOUND (searched `llms-full.txt`, `paybox.sh/llms.txt`, `developer.paybox.sh/llms.txt`, the `paybox.sh` landing page for "walletconnect", "wallet connect", "dapp", "eip-1193").
- Whether a Reown Verify "verified" badge is obtainable for a `vercel.app` subdomain. Not checked.
- Signature byte layout, determinism, low-s (`[24]` TP1). NOT TESTED.
- What the approval/signing pages display for typed data or raw digests. NOT FOUND.

---

## 12. Verification (2026-10-20)

Re-checked first-hand this session:

1. Read `[24]` end to end, `[05]` and `[06]` by targeted search for iframe, signing window, `return_origin`, `approval_url`, passkey, modes, `pending_approval`; read `docs/plan.md` status banner, the dApp-related parts of `[28]`, `[34]` section 5, `dapp-design.md` WalletConnect lines, and `docs/signing-vectors.md` for the XO domain chain ids (3223 in order, Kernel and ClobAuth domains).
2. Fetched `https://docs.paybox.sh/llms-full.txt` (64,429 bytes, 200) and read the lifecycle, signing window, approvals, MCP-tool, OAuth, API and SDK sections.
3. Fetched `@paybox-sh/sdk@2.2.0` `README.md`, `SKILL.md`, `package.json`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js` and the registry JSON (latest 2.2.0; `@paybox-sh/connect-react` latest 0.1.1). Confirmed `Grant.approval_mode` includes `paybox`, `DepositLinkResult.return_origin`, `nextActionFor`, `x-paybox-signing-surface` header, REST paths `/agent/*`. Nothing installed or run.
4. Fetched `app.paybox.sh/` and `/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` and grepped/read: route table (`sign/[request_id].tsx`, `approvals/[id].tsx`, `wc.tsx`, `deposit/[id].tsx`, `clients/[id]/manage.tsx`), `depositReturnHref` (allows only `grok.com` / `x.ai`), `postMessage` and `window.opener` contexts, the sign page, the `paybox` mode strings, the WalletKit initialisation, `supportedNamespaces`, `WALLET_CONNECT_METHODS`, `describeSignRequest`, `sessionAllows`, the session controller, the `approveSession` + `createClient` grant, and `signParkedRequest`. Nothing executed.
5. Fetched `api.paybox.sh/iframe/shell`, `/iframe/assets/loader.js`, `/iframe/version`, `/iframe/assets/v283/app.js` and read the CSP and the ext-apps transport (`postMessage` to `window.parent`, source check on the embedding host).
6. Probed with `GET` and `OPTIONS` (headers only, no bodies sent, 1 s gap): `app.paybox.sh/`, `/wc`, `/sign/<zero uuid>`, `/approvals/<zero uuid>`; `api.paybox.sh/iframe/shell`, `/iframe/requests/<zero uuid>`, `/iframe/version`, `/agent/requests/<zero uuid>`, `/mcp`, `/oauth/token`, `/oauth/register`, `/api/requests/<zero uuid>/signing-payload`, `/.well-known/oauth-authorization-server`, using Origin `https://xo-markets-explorer.vercel.app` and `https://app.paybox.sh`. Results are in section 2.3; the all-zero UUID is not a real request. The dApp's own response headers were read with a `GET`.
7. Looked up `@walletconnect/ethereum-provider`, `@walletconnect/sign-client`, `@reown/appkit`, `@reown/walletkit` latest versions on the npm registry, and read `docs.reown.com/cloud/relay` for the project-id and origin-allowlist statements.
8. Loaded (did not call) the schema and description text of `request_wallet_sign`, `request_account_change`, `get_request`, `reopen_signing_window`, `get_deposit_link`, `check_operation_readiness` to read them.

What I did **not** verify: any runtime behaviour of the WalletConnect route, of `paybox` mode, or of the proxy route; the approval and signing screens' content; the server's passkey policy for `request_wallet_sign`; signature format; mobile behaviour; anything that needs a PayBox account, a signature, or a POST.

Privacy check: this file contains no email address, personal name, username, GitHub login or home path. The WalletConnect project id and a public analytics token that appear in PayBox's headers/bundle are deliberately not reproduced; the all-zero UUID used in probes is a placeholder. No credential id or wallet address of any user was read or recorded (no `list_credentials` call was made). Scratch files (docs, SDK text, the app bundle, the shell) are in the session scratchpad only.

## Sources

- https://docs.paybox.sh/llms-full.txt ; https://docs.paybox.sh/llms.txt ; https://paybox.sh/llms.txt ; https://developer.paybox.sh/llms.txt
- https://unpkg.com/@paybox-sh/sdk@2.2.0/ (README.md, SKILL.md, package.json, dist/index.d.ts, dist/index.js, dist/cli.js, dist/chunk-DWDC6W5P.js) ; https://registry.npmjs.org/@paybox-sh/sdk ; https://registry.npmjs.org/@paybox-sh/connect-react
- https://app.paybox.sh/ ; https://app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js (read as text)
- https://api.paybox.sh/iframe/shell ; https://api.paybox.sh/iframe/assets/loader.js ; https://api.paybox.sh/iframe/assets/v283/app.js ; https://api.paybox.sh/iframe/version
- https://api.paybox.sh/.well-known/oauth-authorization-server ; https://api.paybox.sh/mcp ; https://api.paybox.sh/oauth/token ; https://api.paybox.sh/oauth/register (probes)
- https://docs.reown.com/cloud/relay ; https://docs.reown.com/llms.txt ; https://registry.npmjs.org/@walletconnect/ethereum-provider ; https://registry.npmjs.org/@walletconnect/sign-client ; https://registry.npmjs.org/@reown/appkit ; https://registry.npmjs.org/@reown/walletkit
- Repo: `docs/research/24-dapp-paybox-tie-in.md`, `05-paybox-reference-plugins-b.md`, `06-paybox-platform.md`, `28-dapp-architecture-mvp.md`, `34-paybox-web-terms-risk.md`; `docs/dapp-design.md`, `docs/signing-vectors.md`, `docs/phase1-gap-closing.md`, `docs/plan.md`.
