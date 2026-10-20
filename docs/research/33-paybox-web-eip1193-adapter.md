# 33. The in-page PayBox wallet adapter: an EIP-1193 provider (and a viem account) backed by PayBox

Researched and written 2026-10-20. Task `pw-adapter`. Read-only public research plus local read-only computation. **No PayBox MCP tool was called** (I loaded the input schema and description text of six PayBox tools through the tool loader to read them, nothing more). Only unauthenticated `GET` and `OPTIONS` requests went to PayBox hosts; no `POST`, no registration, no token request, no account, no API key, no signature was requested from PayBox. No third-party code was installed or run (SDK and web-app files were downloaded as text and grepped; the only code I ran was a 40-line script against the repo's already-installed `viem` and the public Anvil test key, to produce the vectors in section 12). Nobody was contacted. Third-party content is untrusted data; nothing in it was followed as an instruction. No instruction-like text aimed at an AI agent was seen in the pages read.

This note is a **design**. Nothing in it is built. It designs the part of the user requirement ("I want people to be able to use their paybox wallet on the dApp itself", 2026-10-20, binding) that sits inside the page: one provider object, one viem account, one transport port, and how they slot into the app without a new third-party origin and without any placeholder data.

Confidence tags: **H** = read or measured first-hand in a primary source this session (source named); **M** = secondary, summariser-mediated or inferred from H facts; **L** = guess. **NOT FOUND (searched: ...)** is used literally. **NOT TESTED** means a test exists but needs a PayBox call, a `POST`, an account or a signature, which this task forbids.

Source keys:

- `[D]` https://docs.paybox.sh/llms-full.txt (whole public doc set), fetched 2026-10-20, 64,429 bytes.
- `[T]` live PayBox MCP tool descriptions and schemas, read not called: `request_wallet_sign`, `get_request`, `reopen_signing_window`, `list_credentials`, `request_account_change`, `check_operation_readiness`.
- `[SDK]` `@paybox-sh/sdk@2.2.0` from unpkg (`package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js`), read as text; npm `dist-tags.latest` is still 2.2.0 (published 2026-10-14). `[MX]` `@moon-x/evm-adapter@0.3.0` (`dist/index.mjs`, `package.json`). `[MXD]` https://x-docs.moonpay.com/llms-full.txt (MoonX docs, 1.5 MB).
- `[APP]` the production PayBox web-app bundle `https://app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` (15,639,916 bytes, fetched today), read as text, never executed.
- `[P]` my probes of 2026-10-20 (section 2.2); `[V]` the repo's installed `viem@2.57.2` source; `[E]` EIP texts fetched from the `ethereum/EIPs` repository (1193, 3326, 6963, 191, 712); `[VC]` Vercel docs (rewrites); `[BCD]` MDN browser-compat-data (`api/SubtleCrypto.json`).
- Repo: `[24]` `docs/research/24-dapp-paybox-tie-in.md`, `[25]` `25-dapp-aa-wallet.md`, `[28]` `28-dapp-architecture-mvp.md`, `[DD]` `docs/dapp-design.md`, `[P1]` `docs/phase1-gap-closing.md`, `[SV]` `docs/signing-vectors.md`. Sibling notes written today by other tasks: `[29]` `29-paybox-web-oauth.md`, `[30]` `30-paybox-web-sdk-cli.md`, `[31]` `31-paybox-web-signing-surface.md`, `[34]` `34-paybox-web-terms-risk.md`. I re-checked the claims of `[29]`/`[31]` that this design leans on (section 15); I did not re-derive their other findings.

---

## 0. Bottom line

1. **The adapter is feasible as a thin layer over a transport port, and the provider core does not depend on how PayBox is reached.** One `request({method, params})` object (EIP-1193 events, errors, and the exact method set in section 5) plus one viem `LocalAccount`-shaped object (`toAccount`) sit on a `SigningTransport` port. Three transports exist on paper; each has a different set of unknowns:
   - **TW, WalletConnect to the PayBox web app** (`app.paybox.sh/wc`). New today: the shipped PayBox web app contains a WalletConnect v2 wallet (H that the code is shipped, section 2.3; NOT TESTED that it works). It signs **`personal_sign` (UTF-8 text only) and `eth_signTypedData_v4`** for chains 1, 10, 56, 137, 999, 4663, 5042, 8453, 42161, 43114 and Solana; it does **not** sign transactions, raw digests, or typed data for chain 3223. Cost: a third-party relay origin and a WalletConnect dependency, which break the CSP rule given for this task and the repo's earlier "no WalletConnect" decision, and PayBox hard-codes the grant it creates to **`autonomous`** ("PayBox will sign them without asking again"), which conflicts with the repo's recommended approval-gated mode. Needs a user decision (section 3.2).
   - **TP, same-origin pass-through to the PayBox API** (`/pb/*` on the dApp's own origin, a Vercel external rewrite or a small function, OAuth 2.1 public client in the browser). Adds **no** third-party origin to the CSP. Carries every intent PayBox's API accepts (typed data for 3223, raw digests, transactions) **if** PayBox lets a browser-held client finish the signature. That depends on one unverified thing: the **`paybox` approval mode** ("the user completes transactions on the PayBox website without an agent signing key", H from the live tool text) working for `request_wallet_sign`; otherwise the browser would need a paired `pbxk1.` key over undocumented REST routes (section 3.1). Cost: the author's Vercel project sees the visitor's PayBox bearer token in transit (stated, section 4.4).
   - **TM, manual hand-off** (copy the intent to the user's own PayBox-connected agent, paste the signature back). Works today with nothing from anyone; poor UX; the floor.
2. **Method coverage is the same shape on every transport, and the unsupported part is large enough to say plainly.** Fully mappable: `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `personal_sign` for text, `eth_signTypedData_v4`. Mappable only on a transport that carries it: `eth_signTransaction`, `eth_sendTransaction` (needs PayBox's `transaction` op, which TW cannot do and which we then broadcast ourselves), and a binary `personal_sign` (needs a PayBox `raw` intent over the EIP-191 digest; TW refuses it). **No PayBox equivalent, refused with a clear error and never faked:** `eth_sign`, `eth_signTypedData` (v1) and `_v3`, `wallet_addEthereumChain`, `wallet_watchAsset`, `eth_subscribe`, `wallet_sendCalls`, `wallet_sendTransaction`, `eth_signAuthorization`/7702, anything else not on the allowlist. `wallet_switchEthereumChain` is a **page-local** operation (a PayBox EOA has no "active chain"; the provider keeps one because viem needs it). Section 5.
3. **XO is still not served by the browser-only paths.** XO's own signatures are `typedData` over chain 3223 (not in PayBox's catalog, refused by TW's chain check, untested elsewhere) and `raw` UserOp hashes (a binary `personal_sign` TW refuses). Even with a signature in hand, the hosted page cannot submit to XO (orderbook and bundler answer no CORS for the page's origin, `[DD §4.2]`). So this adapter makes **Polymarket-style typed-data flows, Base/Polygon/BNB/HyperEVM EOA transactions (flagged), message sign-in and address binding** possible in the hosted page, and leaves XO writes to the daemon/agent path of `[24]`/`[DD §3]`. The adapter is useful for XO only through the Cockpit build, where the daemon is the transport.
4. **Never trust the transport for correctness.** Every signature or signed transaction the provider is about to return is recovered locally with viem and compared with the connected address (and, for a transaction, parsed and compared field by field with what was requested). A transport, a proxy or PayBox that returns anything else gets `-32603 signature_mismatch` (an error code viem does not turn into a second request, see section 5), not a result. This is cheap, deterministic and testable with Anvil keys (section 12).
5. **What is proven, unproven, and needs the user:** proven (H) are the intent shapes, the signature assembly rule, the CORS facts, the WalletConnect code in the shipped app, the viem call shapes and retry behaviour, and the local vectors in section 12. Unproven: that any transport actually returns a signature to an ordinary visitor (nothing was signed through PayBox for this project, by anyone). The ten-minute test that decides the first fork is LT1 in section 13 (open `app.paybox.sh/wc` with a throwaway wallet); the one that decides the second is LT4 (does `paybox` mode complete a `request_wallet_sign`).

---

## 1. Scope and non-goals

In scope: the in-page object (`request`, `on`, accounts, chain, events), the viem account, the transport port, method mapping, errors, the approval UX state machine, address derivation and account change, how it fits `app/`, compatibility with viem, wagmi and EIP-6963, a test plan with only real signatures, the live tests the user must run, and what to ask PayBox.

Out of scope here: the OAuth client mechanics and the Vercel layer in detail (`[29]`), the SDK/CLI route (`[30]`), the signing-window/popup question (`[31]`), PayBox terms (`[34]`). Those notes are cited where the adapter depends on them. XO order submission through a relay is not designed here and is not available to a static page.

Binding decisions applied: nothing the author operates that holds other people's credentials (the proxy in TP is stateless and holds none at rest, with the risk stated in section 4.4); no browser automation of any third-party site; no fake or placeholder data anywhere (the provider returns `[]` accounts until a real PayBox credential is connected; no default address, no demo signer; test doubles live only under test paths and are excluded from the bundle by the existing checks); the repo is public (no key, token, project id or personal identifier is committed); caps are advisory against a compromised agent; every write path flag-gated OFF; PayBox terms are no obstacle but PayBox upload is not available.

---

## 2. What is new since notes 24, 25 and 28

### 2.1 Facts re-measured or newly found, with sources

| # | Fact | Tag | Source |
|---|---|---|---|
| N1 | The PayBox signing path is `intent -> client-side digest -> 32-byte MPC sign -> {r, s, recovery_id}`. For `message` the digest is viem `hashMessage(string)`, for `typedData` viem `hashTypedData(typedData)`, for `transaction` `keccak256(serializeTransaction(tx))`, for `authorization` `hashAuthorization`, for `raw` the payload as given. The 65-byte signature is assembled as `r ‖ s ‖ (27 + recovery_id)`. | H | `[SDK chunk, signIntent]`, `[MX dist/index.mjs]` |
| N2 | Because the digest is computed from the intent before the MPC call, **PayBox's MPC step is chain-blind**: a typed-data domain `chainId` (3223, 1337, 4162) is just part of the hashed bytes. Any chain restriction is server-side policy (a grant, a catalog), which is undocumented for wallet-sign. | H for the digest path, NOT FOUND for the policy | `[SDK]`, `[D]` |
| N3 | `message` is a **string** (`{op:"message", message:string}`). The signer calls `hashMessage(intent.message)`, so a string is signed as its UTF-8 bytes under the EIP-191 prefix. A hex string such as `"0x68656c6c6f"` is signed as 12 characters of text, not as 5 bytes (vector in section 12.1). | H | `[T]`, `[SDK]`, my run |
| N4 | `transaction` is EIP-1559 only: the SDK forces `type: "eip1559"` and reads `to, value, data, chainId, gas, maxPriorityFeePerGas, maxFeePerGas, nonce`. No `accessList`, no legacy `gasPrice`, no blob or 7702 fields. The caller supplies every field. The result is a serialized signed transaction, **not broadcast**. | H | `[SDK chunk reviveTx]`, `[D]` |
| N5 | Only **`typedData` and `transaction` accept an unconstrained object** in the live tool schema (`"typedData": true`, `"transaction": true`); `raw` is "a supported escape hatch for a precomputed digest". | H | `[T request_wallet_sign]` |
| N6 | The request life cycle is `pending_approval` (user passkey, `approval_url`, valid about 10 minutes, operation-bound) -> `pending_signature` (a signing surface must produce the artifact) -> `success` with `output`; or `denied` (with `reason`) or `error` (with `message`, possibly `retryable`). "Submit once, then poll"; "only the client that created the request can read it". | H | `[D concepts/requests]`, `[T get_request]` |
| N7 | A **fourth approval mode `paybox`** exists in the live tool: "For `paybox`, the user completes transactions on the PayBox website without an agent signing key. For other modes, a newly granted or created wallet is NOT usable until the user connects a fresh signing key by picking the code the signing window shows." | H (tool text) | `[T request_account_change]` |
| N8 | **CORS, re-measured today with the dApp's own origin.** `OPTIONS` preflights from `https://xo-markets-explorer.vercel.app` to `/mcp`, `/oauth/register`, `/oauth/token`, `/oauth/device_authorization`, `/api/agent-pairings/token`, `/agent/wallet-sign`, `/agent/requests/{id}`, `/agent/requests/{id}/binding`, `/moonx-sign`, `/signature` all return `200` with **no** `access-control-allow-origin`. The same requests from `https://app.paybox.sh` get `access-control-allow-origin: https://app.paybox.sh`. **Exception: `/iframe/pairing` and `/iframe/pairing/{id}` answer `access-control-allow-origin: *`** (allowed request headers `content-type,authorization`; methods `GET,POST,OPTIONS`). `GET /mcp` with the dApp's origin returns `401` (not `403`), so the server does not reject a foreign `Origin` before authentication (a `POST` was not sent). | H, measured | `[P]` (section 2.2) |
| N9 | The preflight's allowed request headers do **not** include `x-paybox-signing-surface`, the header the SDK sends to select the signing surface. A browser would have to send it through a same-origin proxy or not at all. | H | `[P]`, `[SDK]` |
| N10 | MoonX (the platform PayBox is built on) documents a set of eight methods for its own EIP-1193 provider: `eth_accounts`, `eth_chainId`, `eth_getBalance`, `eth_sendTransaction`, `eth_signTransaction`, `personal_sign`, `eth_signTypedData_v4`, `wallet_switchEthereumChain`. It is for MoonX apps' own embedded wallets; no cross-app access to a PayBox wallet is described. | H for the list, NOT FOUND for cross-app access | `[MXD "Ethereum Provider"]` |
| N11 | The `pbxk1.` signer is a MoonX **ephemeral signer**: signing needs two credentials, the app's secret key (held by PayBox's server) and the agent's Ed25519 key; "a leaked agent key alone can't reach the signing endpoint". So in-browser signing authority is exercised **through PayBox's server**, which is where grants and approvals are checked. | H | `[MXD "Ephemeral Signers (Agents)"]` |
| N12 | WebCrypto Ed25519 (`generateKey`, `sign`, `exportKey` for the public key) ships in Chrome 137, Firefox 129, Safari 17; Safari's `sign` is randomised, not deterministic (signatures still verify). A non-extractable key can be stored in IndexedDB. The SDK itself uses `tweetnacl`. | H | `[BCD]`, `[SDK]` |
| N13 | viem 2.57.2: `signMessage`, `signTypedData`, `sendTransaction` (JSON-RPC account), `sendRawTransaction`, `switchChain`, `signTransaction` all call the provider with `{retryCount: 0}`; the generic `shouldRetry` retries codes `-1`, `-32005`, `-32603`, `429`, `-32007`. | H | `[V utils/buildRequest.ts, actions/wallet/*]` |
| N14 | `@moon-x/evm-adapter` is `license: "UNLICENSED"`. The SDK (Apache-2.0) depends on it. **Do not bundle or copy it**; the assembly it does is six lines (section 12.1) and viem provides the rest. | H | `[MX package.json]`, `[SDK package.json]` |
| N16 | viem 2.57.2 re-sends a failed `eth_sendTransaction` as `wallet_sendTransaction` for the error names `InvalidInputRpcError`, `InvalidParamsRpcError`, `MethodNotFoundRpcError`, `MethodNotSupportedRpcError`, and rethrows the second error unless it is a method-not-found/not-supported one. | H | `[V actions/wallet/sendTransaction.ts]` |
| N15 | The PayBox web app's own CSP allows `wss://relay.walletconnect.org` and the verify hosts; its `frame-ancestors` is `'self'`. | H | `[P]` (GET `https://app.paybox.sh/`) |

### 2.2 The probes (all unauthenticated, no body, `User-Agent: insurance-markets-research/0.1`)

For each of the origins `https://xo-markets-explorer.vercel.app` (the dApp, a public URL), `https://app.paybox.sh` (control) and `https://example.org` (control), and for each path listed in N8: `curl -X OPTIONS` with `Origin`, `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: authorization,content-type,mcp-protocol-version,x-paybox-signing-surface`; plus `GET` with `Origin` for `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`, `/health`, `/iframe/pairing/<nil-uuid>` and `/mcp`. Results: 51 requests, summarised above; the dApp origin and `https://example.org` behave identically on every path except that the dApp's own origin is what the user cares about. `GET /iframe/pairing/<nil-uuid>` returned `404` with `access-control-allow-origin: *`. The authorization-server metadata (GET, 200) lists `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `device_authorization_endpoint`, grants `authorization_code`, `refresh_token`, device code, `code_challenge_methods_supported: ["S256"]`, `token_endpoint_auth_methods_supported: ["none"]`, scopes `mcp`, `offline_access`. `GET https://xo-markets-explorer.vercel.app/` returns the repo's standalone CSP (`connect-src 'self'` plus the CORS-open venue hosts, `frame-ancestors 'none'`, `require-trusted-types-for 'script'`, `trusted-types 'none'`) and `Cross-Origin-Opener-Policy: same-origin`.

The Origin header sent to PayBox in these probes named the dApp's public deployment; no other identifier was sent.

### 2.3 The WalletConnect finding, re-verified first-hand

Siblings `[29 §8]` and `[31 §4]` found that the PayBox web app is a WalletConnect v2 wallet. I downloaded the same bundle and confirmed by grep (code read, not executed; behaviour NOT TESTED):

- the text "Paste the connection link from the app you want to connect." with a `wc:` pairing field (1 hit);
- the supported namespace table `{eip155: ["personal_sign", "eth_signTypedData_v4"], solana: ["solana_signMessage", "solana_signTransaction"]}` and events `accountsChanged`, `chainChanged`;
- `personal_sign`: the message is decoded and, if it is not valid text, the preview is "This message is raw bytes, not text." and **no intent is created**;
- `eth_signTypedData_v4`: if `domain.chainId` differs from the session chain the request is refused ("This asks to sign for chain X, but the session approved Y."); otherwise it becomes `{op:"typedData", typedData}`;
- `eth_signTransaction`: "PayBox cannot sign an Ethereum transaction for an app yet."; `eth_sendTransaction` and the Solana send variant: "PayBox signs but does not broadcast for an app yet."; any other method: "PayBox cannot service <method>.";
- on session approval the app creates a client named "<app name> (WalletConnect)" with `approval_mode: "autonomous"` for each matching wallet credential, and the proposal screen says "Once connected it can request signatures for the addresses below, and PayBox will sign them without asking again. Disconnect it to stop that.";
- the app tab must be open and signed in ("Another PayBox tab is listening for this app. Only one can answer").

I also record that the repo's own notes `[24 §3 row G]`, `[DD §0, §2.7]` and `app/scripts/dependencies.json` say the opposite ("no WalletConnect: NOT FOUND", "refused to build"); those searched docs and the SDK, not the shipped app. The decision to refuse WalletConnect predates the user's requirement and is revisited in section 3.2.

---

## 3. Ways an ordinary visitor with a PayBox account could connect and sign (adapter view)

The full inventory of connection options is in `[29]`, `[30]`, `[31]`; this section lists the ones the adapter can sit on, what each needs, and what each leaves unknown. "Author operates" means a component the author deploys and is responsible for.

### 3.1 TP: same-origin pass-through, the visitor's browser is the PayBox client

**Mechanism.** The page runs OAuth 2.1 + PKCE as a public client. Redirects (`/oauth/authorize` and the callback) are top-level navigations and need no CORS (H, `[29 §5]`). Dynamic registration, the token exchange, refresh, `/mcp` calls and any REST call are `fetch` calls from the page to **its own origin** under a fixed prefix (called `/pb/*` here), and a layer on the dApp's origin forwards them to `https://api.paybox.sh`. The layer is stateless: tokens, the PKCE verifier and any key live in the visitor's browser.

**The layer, two forms** (decision for the user; either is "thin"):

- *Rewrite only, no code.* A Vercel external rewrite in `vercel.json` (`{"source": "/pb/:path*", "destination": "https://api.paybox.sh/:path*"}`), one rule per allowed path (fixed list, section 9.3). Vercel documents rewrites to external origins as a reverse proxy `[VC]` (H). Not documented there: whether `Authorization` and request bodies are forwarded unchanged (NOT TESTED, LT3), the timeout and streaming behaviour of an external rewrite (NOT FOUND in `[VC]`), and whether `Set-Cookie` from upstream can be dropped (NOT FOUND). **Caching must be disabled**: for projects created on or after 2026-04-06 Vercel honours upstream `cache-control` on external rewrites by default `[VC]` (H), and a cached authenticated response is a cross-user leak; set `x-vercel-enable-rewrite-caching: 0` on the prefix (the documented opt-out). If an upstream `Origin` check turns out to be needed, request-header deletion exists only in `routes` transforms `[VC search]` (H), and whether `routes` can coexist with the `headers` block the repo generates is NOT VERIFIED; if not, use the function form.
- *A small function.* A Vercel Function or Routing Middleware that checks the path against the allowlist, forwards method, body and `authorization`, drops every other request header (cookies, `origin`, `referer`, `x-forwarded-*` as far as the platform allows), returns status and body, never logs bodies or headers, and sets `cache-control: no-store`. It is code the author maintains; it can strip headers, which the rewrite cannot.

**Signing step.** The proxy only gets a request created. The artifact has to come from a signing surface (`[29 §6]`, `[31 §5.2]`):

- **TP-a, `paybox` mode (preferred, needs no key in the browser).** The visitor grants the dApp's client the wallet credential with mode `paybox` at the consent screen (or switches the mode later with `request_account_change` -> `manage_url`, N7). `request_wallet_sign` returns a request the user completes **on the PayBox website** (`completion_url`, as far as `[31]` read it; exact value NOT FOUND without a call). The adapter polls `get_request` through the proxy until `success` and reads `output`. Whether `request_wallet_sign` supports this mode for message, typed data and raw intents, or only for transactions and swaps, is **NOT TESTED** (LT4). If it works it carries everything PayBox's API accepts, including chain-3223 typed data (if the grant allows) and raw digests, which TW cannot.
- **TP-b, browser-held `pbxk1.` agent key (fallback).** The page generates an Ed25519 key (WebCrypto, non-extractable, N12), registers its public half through the pairing routes, and the visitor confirms an eight-emoji code at `app.paybox.sh/agent-key` (the SDK flow: `POST /api/agent-pairings/token` with the bearer, `POST /iframe/pairing`, poll `GET /iframe/pairing/{id}`, `[SDK cli.js pairSigningKey]`, H). Then per request: `POST /agent/wallet-sign`, wait for approval, `POST /agent/requests/{id}/binding`, `/moonx-sign` (an Ed25519-signed envelope of the digest), `/signature` (`[SDK chunk signWalletRequest]`, H). All of these are routes "not part of the developer surface" `[D]`, so this is the fragile branch: pin behaviour with golden tests and a kill switch. Note that only `/iframe/pairing*` is CORS-open to any origin (N8); every other route needs the proxy. Open question to PayBox: does the server bind the envelope's digest to the approved intent (section 14, Q5)? If it does not, an approval of a harmless message authorises any digest.

**What the visitor does:** one OAuth consent at PayBox (choose the wallet credential and mode; a passkey), optionally one pairing code (TP-b); then for each signature, an approval in the PayBox app or on `app.paybox.sh`, and a wait.

**What the author operates:** the rewrite/function and its logs. It sees the bearer token, the registration, request ids and the intent (typed data, message text) in transit.

**Unknown, decisive:** LT3 (forwarding works and PayBox's edge accepts Vercel egress), LT4 (`paybox` mode signs), LT5 (output shape). Per-visitor client registration is required, not optional: "replaying a used code or a rotated refresh token revokes the client" `[D]`, so a shared `client_id` would let one visitor's double submit revoke the client for everyone (if revocation is per client; whether it is per client-and-user is NOT FOUND). Each browser registers its own client (name shown to the user at consent: the dApp name plus "unofficial").

### 3.2 TW: WalletConnect to the PayBox web app

**Mechanism.** The page shows a WalletConnect pairing URI (a link and QR code we render ourselves); the visitor opens `app.paybox.sh/wc` signed in, pastes it (or follows a link with `?uri=`, per `[31]`), approves the session, optionally generates the browser signing key; after that `session_request` calls from the page are signed by the PayBox tab. The page speaks WalletConnect through `@walletconnect/ethereum-provider` or a lighter sign-client.

**What it carries:** `personal_sign` for text, `eth_signTypedData_v4` where `domain.chainId` equals the session chain and the chain is one of 1, 10, 56, 137, 999, 4663, 5042, 8453, 42161, 43114, plus Solana message/transaction (section 2.3). Not transactions, not raw digests, not 3223.

**Why this note does not make it the default** (all from the code and repo decisions):

1. *CSP.* A WalletConnect client needs a relay origin. The repo's standalone CSP is `default-src 'none'`, `connect-src` a closed list of CORS-open hosts, no `frame-src` (repo `app/headers.config.ts`). Reown's published partial CSP for its SDK lists `https://relay.walletconnect.org`, `wss://relay.walletconnect.org`, `https://rpc.walletconnect.org`, `https://pulse.walletconnect.org`, `https://verify.walletconnect.org` (frame-src) and more (Reown docs, M: it is written for AppKit and says "you may need additional sources"; the minimal set for a headless dApp-side client is NOT FOUND and would have to be measured). This breaks the rule for this task ("no new third-party origins except the BFF") and `B7` of `[DD §1.3]`.
2. *Dependency.* `@walletconnect/ethereum-provider@2.26.0` (published 2026-10-08, M from registry JSON) depends on `@reown/appkit`, and its licence field is "SEE LICENSE IN LICENSE.md". `app/scripts/dependencies.json` says "no wagmi, no WalletConnect" and `[DD §2.7]` lists both as refused. A WalletConnect project id is an account the author would create at Reown (not done here).
3. *Grant mode.* PayBox creates the client with `autonomous` (section 2.3). `[P1 §0 decision 5]` recommends approval-gated signing and limits `autonomous` to throwaway credentials. With TW the visitor must use a dedicated low-balance wallet and know that a compromised dApp origin can request typed-data signatures until they disconnect. Whether the visitor can switch that client to `always_approve` afterwards and whether the WC flow then honours it (a `pending_approval` that needs a passkey in an already open tab) is NOT TESTED (LT2).
4. *Operational constraints.* The PayBox tab must stay open and signed in; one tab answers; the session and key are tied to that browser.

**What it has that nothing else has:** zero author-operated components, zero PayBox cooperation, a standard WalletConnect session that wagmi/viem tooling already understands, and a ten-minute live test (LT1). If the user accepts the CSP and dependency delta (listed in section 9.4), TW is the quickest real signature for typed-data flows on the listed chains.

### 3.3 TM: manual hand-off to the user's own agent

The page shows the exact intent JSON (the same object `toPayboxIntent` produces) with a copy button and a one-line instruction for an agent that already has PayBox connected; the agent calls `request_wallet_sign` and prints the signature; the visitor pastes it back; the provider verifies it (section 4.3) and resolves the pending `request`. Works today for every intent PayBox's tool accepts (the agent-mediated Architecture A of `[24 §9]`). Costs: two surfaces, depends on an agent, and the text pasted into an agent can carry attacker-influenced strings (typed-data fields, message text), so the instruction must say "sign exactly this JSON, change nothing" and the provider's post-signature check is what actually protects the result. It is the floor transport and the test transport.

### 3.4 Not available as an in-page transport

| Option | Why not | Tag / source |
|---|---|---|
| Browser straight to `api.paybox.sh` | CORS (N8) | H |
| Popup or iframe to PayBox's approval or signing page with a result channel back to the page | `frame-ancestors 'self'` on the app and `https://app.paybox.sh` on the signing shell; no `postMessage` or redirect result channel; the dApp's `COOP: same-origin` severs a popup's opener anyway | H `[31 §3]`, `[P]` |
| Embedded MoonX wallet / MoonX SDK | Wallets are per MoonX app; PayBox's wallets belong to PayBox's app; no cross-app access in the docs | H for docs read, NOT FOUND for cross-app |
| Partner routing (`connect-react`, `?app=<slug>`) | Cosmetic; "a slug is routing, not authorization" | H `[24 §3 row F]` |
| Loopback helper called from the hosted page | Chrome/Safari local-network and mixed-content rules NOT verified; breaks `connect-src` rule B7; instead the Cockpit build served by the daemon uses the daemon as the transport (section 4.2) | M `[DD §4.1]` |
| Deriving a local key from a PayBox signature | Determinism NOT FOUND; rejected already | `[24]`, `[DD §2.2]` |

### 3.5 Decision table (what to pick, given what you learn)

| If the live tests show | Then |
|---|---|
| LT1 passes (WC signs text and typed data) and you accept the autonomous-grant and CSP/dependency delta | Ship TW behind a flag for typed-data flows on the listed chains; keep TM as floor |
| LT3 and LT4 pass (`paybox` mode signs through the pass-through) | Ship TP-a as the default; it needs no new origin and no key in the browser, carries 3223 typed data and raw digests if PayBox's grant allows, and is approval-gated per signature |
| LT4 fails but LT5/LT6 (pairing and `moonx-sign` through the proxy) pass | TP-b, behind a kill switch, with the binding question (Q5) answered or accepted |
| Everything blocked | TM plus the questions in section 14 |
| The Cockpit build (daemon) is what the user runs | `DaemonTransport` (S2 of `[DD §3.3]`); no change to the provider |

Nothing in this table needs a decision before the provider core and the test kit are built (section 9.1), because the transport is behind a port.

---

## 4. The architecture

### 4.1 Three layers

```
 app code (viem, SignatureCard, Polymarket L1/L2, Trueo, address binding)
        |                         \
        |  EIP-1193                \  viem LocalAccount (toAccount): signMessage, signTypedData,
        v                           v  signTransaction, sign({hash}) for explicit digests
 +---------------------- PayboxWalletCore (pure, injected deps) ----------------------+
 |  method allowlist + param parsing  ->  PayboxIntent (reuses toPayboxIntent rules)    |
 |  policy: chain/domain rules, text-only personal_sign, flags (send, raw digest)       |
 |  one pending request at a time, state machine, events, error codes                   |
 |  verify: recover signer / parse tx and compare BEFORE resolving                      |
 |  reads: allowlisted JSON-RPC methods to the page's existing T0-RPC origins           |
 +------------------------------------------------------------------------------------+
        |  SigningTransport port (no globals; fetch/clock/timers injected)
        v
  TP proxy+OAuth     TW WalletConnect     TM manual        DaemonTransport (Cockpit)
  (same-origin /pb)  (flagged, CSP delta) (copy/paste)     (loopback, the daemon is the PayBox client)
```

The viem account exists because viem offers two ways to sign and they differ in what the wallet must implement. With a JSON-RPC account (an address string over `custom(provider)`) viem sends `personal_sign`, `eth_signTypedData_v4` and **`eth_sendTransaction`**, so the provider must fill nonce, gas and fees and broadcast. With a **local-shaped account** (`toAccount({address, signMessage, signTypedData, signTransaction, sign})`) viem builds the transaction itself through the public client, calls `account.signTransaction`, and sends the result with `eth_sendRawTransaction` (`[V sendTransaction.ts]`, H); the adapter then only has to sign. This is the safer face for transactions and for explicit digests, and it keeps `eth_sendTransaction` (a broadcast with fee decisions made by a wallet) off by default. Both faces call the same core.

### 4.2 The transport port

```ts
// DESIGN. Types only; app/src/core/wallet-port.ts (no runtime code, like core/ports.ts).
type Capability = { ok: true } | { ok: false; reason: string };       // reason is fixed app words
interface TransportFacts {                                            // facts, never guesses
  id: "proxy" | "walletconnect" | "manual" | "daemon";
  approvalMode: "paybox" | "always_approve" | "iframe" | "autonomous" | "unknown";
  ops: { messageText: Capability; messageBytes: Capability; typedData: Capability; rawDigest: Capability; transaction: Capability };
  chains: readonly number[];            // chain ids the transport will carry typed data / tx for; derived from facts, not hard-coded defaults
}
interface SigningTransport {
  facts(): TransportFacts;
  connect(signal: AbortSignal): Promise<{ accounts: readonly { address: `0x${string}`; credentialId: string }[] }>;
  sign(intent: PayboxIntent, opts: { signal: AbortSignal; onState(s: PendingState): void }): Promise<SignedArtifact>;
  refreshAccounts(signal: AbortSignal): Promise<readonly { address: `0x${string}`; credentialId: string }[]>;
  disconnect(): Promise<void>;           // local only: forgets tokens/keys/sessions; cannot revoke the PayBox grant
}
```

`PayboxIntent` is the existing `{op:"raw"|"typedData"}` union from `src/relay/contract.ts`, extended on the page side with `{op:"message"}` and `{op:"transaction"}` (the full live union is in N5/N4). The existing `toPayboxIntent` and `checkPreparedSign` (`src/relay/contract.ts`, reachable from the bundle through `SHARED_ALLOW`) keep their role for relay-prepared items (the Signature Card); the provider's own parsing produces intents for everything a library asks for. In the Cockpit build the transport is `DaemonTransport` over the existing authenticated loopback channel (the daemon is a normal Node client, no CORS problem), and the page still never sees a PayBox token.

### 4.3 Never return an unverified signature

Before `request()` resolves, the core checks, with viem and no network:

- `personal_sign`/message: `recoverMessageAddress` equals the connected address;
- `eth_signTypedData_v4`: `recoverTypedDataAddress` over the same typed data equals the connected address;
- transaction: `parseTransaction(serialized)` has the requested `chainId, to, value, data, nonce, gas, maxFeePerGas, maxPriorityFeePerGas`, no extra fields, and `recoverTransactionAddress` equals the connected address; `s` is low (normalised with the matching `v` flip if the transport returned a high `s`, because nodes reject high-`s` transactions and OpenZeppelin-style verifiers reject high-`s` signatures);
- raw: `recoverAddress({hash: digest, signature})` equals the connected address.

A failure is `-32603` with `data.reason = "signature_mismatch"`, the signature is dropped, and the event is logged to the page's local audit list (no network). This makes the proxy, PayBox's output shape and a typo in the transport all fail closed, and it is the same recover-then-compare rule as relay invariants 1 to 8 (`[P1 §5.4]`) and pattern P3 of `[05]`.

Signature shape handling (strict, no guessing): accept `0x` + 130 hex (65 bytes, `v` 27/28 or 0/1) or `{r, s, recovery_id}` (the shape the signing layer returns, N1) and assemble `r ‖ s ‖ (27 + recovery_id)`; any other shape from `get_request.output` for `raw` is an error `unexpected_output` until LT5 records what PayBox returns. The `0x`-prefix question for `rawSigningPayloadHex` is still open (`[P1 §9 A1]`); the SDK strips `0x` and lower-cases it before building the envelope, so both forms are plausible, and the adapter sends the `0x` form that `toPayboxIntent` already pins until LT5 says otherwise.

### 4.4 The trust model, in plain words

| Party | Sees | Can do if malicious or compromised |
|---|---|---|
| The dApp's JavaScript (same origin) | everything below, in memory | request any signature the grant allows while the page is open; hold the tokens. This is the root of trust for any wallet connector; the repo's strict CSP (`script-src 'self'`, Trusted Types) is the control |
| The pass-through (TP) | bearer access and refresh tokens, registrations, request ids, the signed-over content (typed data, message text, tx fields), the visitor's IP | harvest tokens and read intents; create requests (which still need the user's approval in `always_approve`/`paybox` mode). With an `autonomous` grant a stolen bearer is more dangerous (payments, secrets). It **cannot** produce a signature without PayBox's approval flow and, in TP-b, the browser-held key. It holds nothing at rest. |
| PayBox | the content signed, the client, the address | everything PayBox can do to any wallet user |
| The user's agent (TM) | the intent | return a signature over different content, or sign nothing; the page recovers the signer from the returned signature against the digest **it** computed, so different content recovers to a different address and is rejected |

That is why section 4.3 recovers against **the digest the page computed from the request**, not merely "some signature from the right address".

Rule for TP: the page refuses to connect if `list_credentials` shows any granted credential that is not a wallet in mode `paybox` or `always_approve`, or any `autonomous` wallet mode, unless the visitor ticks a plain acknowledgement; a client-side check cannot defend against a hostile deployment, so the UI states that the connection is only as safe as the grant the visitor chose.

---

## 5. Method mapping (EIP-1193/EIP-712 call -> PayBox intent)

Conventions: errors use the EIP-1193 codes (`4001` user rejected, `4100` unauthorized, `4200` unsupported method, `4900` disconnected, `4901` chain disconnected; H `[E 1193]`) and the JSON-RPC codes viem already knows (`-32602` invalid params, `-32002` resource unavailable, `-32000` invalid input, `-32601` method not found; `[V buildRequest.ts]` H, EIP-1474 M). **Codes are chosen with viem's behaviour in mind (N13, N16): a refusal that creates no PayBox request may use `-32602`/`-32000`/`4200`; a failure after a PayBox request exists never uses `-32000`, `-32602`, `-32601` or a method-not-supported code, because viem re-sends a failed `eth_sendTransaction` as `wallet_sendTransaction` on exactly those; it uses `4001` for rejections and `-32603` (with `data.reason`) for everything else.** **No refusal creates a PayBox request.** Every refusal text is fixed app wording, never upstream text.

| EIP-1193 method | Params the library sends | PayBox intent | Notes and refusals |
|---|---|---|---|
| `eth_requestAccounts` | none | none (connect flow of the transport) | Resolves `[address]` only after a real credential is connected; rejects `4001` if the visitor cancels. No address before that. |
| `eth_accounts` | none | none | `[]` until connected; then `[address]` of the selected credential. Never a placeholder. |
| `eth_chainId` | none | none | `0x`-hex of the page-local active chain (section 6). |
| `net_version` | none | none | decimal string of the same id (legacy callers). |
| `wallet_switchEthereumChain` | `[{chainId}]` | none | Page-local state change (EIP-3326 `[E 3326]`: returns `null`). Accepted only for chains in the app's list (`ACCOUNT_CHAINS` plus any chain the transport reports); unknown chain -> `4902` (a de facto code from other wallets, not in EIP-3326 itself, M). Emits `chainChanged`. |
| `wallet_addEthereumChain` | `[{...}]` | none | `4200`. The page does not accept RPC URLs from callers (the CSP would block them anyway). |
| `wallet_getPermissions` | none | none | `[{parentCapability: "eth_accounts"}]` when connected, else `[]` (EIP-2255 shape, M). |
| `wallet_revokePermissions` | `[{eth_accounts: {}}]` | none | Local disconnect (forget tokens/keys/sessions) and `accountsChanged([])`. **Cannot revoke the PayBox grant**; the UI says so and links the user to PayBox's Clients screen. |
| `personal_sign` | `[hexData, address]` | `{op:"message", message: text}` when `hexData` decodes as valid UTF-8 **and re-encodes to exactly the same bytes**; text is displayed escaped | Binary data (not valid UTF-8, including every 32-byte digest) has **no `message` representation** (N3: sending the hex string as text would sign different bytes). With flag `allowEip191Digest` ON and a transport whose `rawDigest` capability is ok, the core signs `hashMessage({raw: bytes})` via `{op:"raw"}`; this is mathematically the same signature (vector 12.1, test V2) but the approver sees an opaque digest (blind signing, `[P1 §9 A4]`). Flag OFF or TW: `-32602` "binary message not supported". `address` must equal the connected account, else `4100`. Parameter order is the spec order only. |
| `eth_signTypedData_v4` | `[address, typedDataJsonOrObject]` | `{op:"typedData", typedData}` | JSON string or object accepted; parsed, validated (`primaryType`, `types`, `domain`), re-hashed locally with viem `hashTypedData` (numeric strings hash identically to bigints, vector 12.1) and the digest tag shown. **Domain chain policy:** if `domain.chainId` is present it must equal the active chain, or be in a small named allowlist of venue domains that deliberately use another id (Hyperliquid L1 `1337`); otherwise `-32602`. If the transport's `chains` lacks it (3223 on TW) -> `4901` with the list. `_v1`, `_v3` and the unsuffixed `eth_signTypedData` -> `4200`. |
| `eth_signTransaction` | `[txObject]` | `{op:"transaction", transaction}` | Only if the transport's `transaction` capability is ok (not TW). EIP-1559 only (N4): `type` other than `0x2`, `gasPrice`, non-empty `accessList`, `authorizationList`, blobs, `to: null` -> `-32602`. Missing nonce/gas/fees are filled by the core from allowlisted reads, shown to the user, then sent. |
| `eth_sendTransaction` | `[txObject]` | `{op:"transaction"}` then the core broadcasts the returned serialized transaction with `eth_sendRawTransaction` on the chain's allowlisted RPC | Flag `allowSend` default **OFF** (a broadcast is a write). Only on chains that have **both** a PayBox catalog entry (or a transport that carries them) and an RPC origin in the page's CSP (today 8453, 137, 56, 999, 3223; 3223 additionally untested at PayBox). Returns the hash `eth_sendRawTransaction` returned and checks it equals `keccak256(serialized)`. Failure after signing and before broadcast keeps the signed bytes for the user to retry the **broadcast only**, never the signature. |
| `eth_sign` | `[address, hash]` | none | `4200`. Its meaning differs between wallets (raw hash vs prefixed), which is exactly the ambiguity that makes it a phishing primitive. Explicit digests go through the viem account's `sign({hash})`, a separate, named, flag-gated method on the app side, not on the EIP-1193 surface. |
| `eth_getBalance`, `eth_call`, `eth_getCode`, `eth_getTransactionCount`, `eth_estimateGas`, `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_feeHistory`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getTransactionByHash`, `eth_getTransactionReceipt` | per JSON-RPC | none | Served from the page's existing T0-RPC origins by chain id; no other origin; unreachable endpoint -> `-32000 rpc_unreachable` (never an empty or zero answer, same rule as `features/wallet/rpc.ts`). |
| `wallet_sendTransaction` | `[txObject]` | as `eth_sendTransaction` | Alias with identical validation and identical errors (see the note below the table). |
| `eth_sendRawTransaction` | `[serialized]` | none | Allowed only for bytes the provider itself produced in this session (viem's local-account path calls it with the account's own output). Anything else -> `4200`. |
| `eth_subscribe`, `eth_getLogs`, `wallet_sendCalls`, `wallet_getCapabilities`, `wallet_watchAsset`, `eth_requestAccounts` re-entry while pending, everything else | | none | `4200` (`-32601` for names no wallet defines). Polling only, like the adapters (`AdapterCaps.stream: false`). |

Notes the table cannot hold:

- **The viem `wallet_sendTransaction` fallback (N16) and why the code choice above matters.** In viem 2.57.2 a failed `eth_sendTransaction` is re-sent once as `wallet_sendTransaction` when the error's name is `InvalidInputRpcError` (-32000), `InvalidParamsRpcError` (-32602), `MethodNotFoundRpcError` or `MethodNotSupportedRpcError`; if that second call also fails with a method-not-found/not-supported error the original error is rethrown, otherwise the **second** error is what the caller sees (`[V sendTransaction.ts]`, H). So: (a) the provider answers `wallet_sendTransaction` as an alias of `eth_sendTransaction` that re-runs the same validation and returns the same refusal, so the user sees the real reason; (b) every post-submission failure uses `4001` or `-32603`, which are not in viem's fallback list, so a PayBox request that already exists is never followed by a second one; (c) the idempotency key below is the backstop for libraries that retry on their own.
- **`retryCount: 0`.** viem already passes it for sign/send calls (N13). The provider additionally keeps an in-memory idempotency key per request so that a library that retries on its own (ethers, wagmi) is answered from the in-flight request instead of creating a second PayBox request ("never re-call a write tool", `[D]`, `[T]`).
- **MetaMask-style impersonation.** The provider sets `isPayBox: true`, never `isMetaMask`, and its EIP-6963 name is "PayBox wallet (unofficial connector)".

---

## 6. Chains

### 6.1 What each layer allows

| Layer | Set | Source |
|---|---|---|
| PayBox's own catalog (`discover_tokens mode=chains`, 2026-10-19) | Ethereum 1, Base 8453, Arbitrum 42161, OP 10, Polygon 137, BNB 56, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999, Solana. "Catalog membership does not guarantee provider coverage" (and it is "metadata, not a support allowlist") | H `[24 §1]`, `[25 §2.1]`; not re-run (no PayBox call allowed) |
| The WalletConnect wallet's chain list | the app's portfolio chains: the ten EVM chains above plus Solana. **3223 and Gnosis 100 are absent** | H (code read, `[29 §8.1]`; re-checked for the namespace table) |
| Chains where PayBox's MPC step is blind | any `chainId` inside a typed-data domain or a transaction (N2). Whether the grant or the signing window refuses 3223, 1337 or 4162 is **NOT FOUND**; `check_operation_readiness` is the dry-run (LT6) | H for the mechanism |
| The app's account chains | 3223, 8453, 137, 56, 999, 42161, 1, 10, 43114, 100 (`ACCOUNT_CHAINS` in `app/src/core/account.ts`); only 3223, 8453, 137, 56, 999 have a CSP-allowed RPC origin (`rpcService`) | H (repo) |

### 6.2 The provider's chain rules

- `eth_chainId` and `wallet_switchEthereumChain` operate on a **page-local active chain** (default: the chain of the market or screen the user is on, never a hard-coded Base). A PayBox EOA has one address on every EVM chain and no "current network", so this value exists only because viem asserts it before `sendTransaction` (`assertCurrentChain`, `[V]` H) and many libraries read it.
- Typed data and messages: allowed on any chain id the transport's `chains` lists. Message signing is chain-independent and is allowed whenever connected.
- Transactions (`eth_signTransaction`, `eth_sendTransaction`, and the account's `signTransaction`): require the chain to be on the transport's list **and** to have an RPC origin in the page's CSP for broadcast. Otherwise `4901` "this chain is not available for transactions in this build" (the text says which condition failed). Arbitrum, Ethereum, Optimism and Avalanche have no CSP-allowed RPC today, so they are typed-data-only until an origin is added through the reviewed `headers.config.ts` change.
- **3223 (XO):** typed-data signing is requested only if the transport lists it (TP-a/TP-b after LT6 passes; never TW). Transactions on 3223 are not offered: the PayBox EOA has no native XO (`[25 §2.6]`) and XO's own writes are UserOps sponsored by the paymaster, which a static page cannot submit.
- Chain id arithmetic is exact: `chainId` values are compared as integers parsed from `0x`-hex; a domain `chainId` given as a string or number is normalised before comparison, never coerced silently.

### 6.3 Non-EVM

Solana is a separate PayBox credential family with a base58 address and its own intents (`solanaMessage`, `solanaTransaction`; TW offers `solana_signMessage`, `solana_signTransaction`). It is not expressible through an EIP-1193 provider and must not share the "wallet" object: a second port `SolanaSigner` (`signMessage(bytes|string)`, `signTransaction(base64)`) with the same transport, verification (`ed25519` verify against the credential's pubkey) and state machine, and a Wallet Standard shim only if a Solana library needs it (M, not researched). Pascal's registered Ed25519 trading keys are a venue-native delegate of the Solana owner `[25 §3 iv-b]`; the owner message encoding PayBox expects for `solanaMessage` is undocumented (NOT FOUND), so no Solana path is specified beyond the port. Hyperliquid (HyperCore) needs only EVM typed data (chain-id rule above).

---

## 7. The asynchronous approval UX

A signature is not a function call: it is a human step in another app. The provider models it explicitly.

### 7.1 States of one request

```
idle
  -> preparing        (parse params, policy, local digest and tag, local preview built; NO network yet)
  -> awaiting_local   (the in-page confirm dialog: decoded content, digest tag, chain, account; the user can cancel here)
  -> submitting       (transport creates the PayBox request; request_id persisted BEFORE anything else)
  -> pending_approval (user must approve in PayBox: show approval/completion link or "check your PayBox app", countdown to ~10 min)
  -> pending_signature(approved; the signing surface is producing the artifact: TP-a/TW/TM wait, TP-b signs in the page)
  -> verifying        (local recovery/parse checks, section 4.3)
  -> done | rejected | expired | failed | uncertain
```

- `awaiting_local` is a UX and hygiene step, not a security boundary (a compromised page can skip it); it exists so the decoded request (typed-data fields, message text, transaction fields and decoded calldata where an ABI is known) is shown with the digest tag next to what PayBox shows, as the Signature Card does for relay items (`features/signing/card.ts`, `digestTag`). It reuses the card's rendering rules (`Untrusted` slots, one 80-character slot, no markup from data).
- `submitting` persists `request_id` (IndexedDB, with the intent hash) before polling; the SDK's rule is the same ("keep the request id so another process can resume", `[SDK README]`). If the page reloads, the original promise is gone; the UI offers "a signature request is pending in PayBox: check status" and shows the artifact if it completed, but cannot deliver it to a lost caller.
- Polling follows the SDK: 2 s start, doubling to 30 s, reset on a status change (H `[SDK README]`); a refresh of `list_credentials` is not part of the poll. The overall deadline is 10 minutes plus 60 seconds (the approval lifetime, H `[D]`); the countdown shown to the user is the approval's, not the page's.
- **One in-flight signature at a time.** A second `request()` that needs a signature while one is pending is rejected `-32002` ("a request is already pending"), as wallets do; it is not queued silently, because a queue of stale approvals is a phishing surface.

### 7.2 Cancel, timeout, retry

| Event | What the caller sees | What happens to PayBox |
|---|---|---|
| User closes the local dialog before `submitting` | `4001`, `data.reason: "cancelled_by_page"` | nothing was sent |
| User presses Cancel while `pending_*` | `4001`, `data.reason: "cancelled_by_page"`, `data.request_id` | **PayBox has no cancel call in its public surface (NOT FOUND, searched `[D]`, `[T]`, `[SDK]`)**; the request stays and expires; the UI tells the user to deny or ignore it in PayBox; a late success is dropped |
| `denied` | `4001`, `data.reason: "denied"`, `data.paybox_reason` (untrusted, length-capped) | final; the vocabulary of `reason` is NOT FOUND, so grant-policy denials cannot be told from user rejections and both map to `4001` until LT5 records the strings |
| Approval expires | `-32603`, `data.reason: "approval_expired"`; if PayBox flags `retryable: true`, `data.retryable: true` | "nothing was spent" per `[T get_request]`; the provider does **not** auto re-issue (the SDK's `withExpiryRetry` does; a wallet must not create a second approval prompt without the user asking). The app may call `request()` again on a user action |
| `error` | `-32603`, `data.reason: "paybox_error"`, `data.message` (untrusted) | final |
| Transport failure while `submitting`, before a request id exists | `-32603`, `data.reason: "uncertain_submission"` | **a request may or may not exist**; the SDK rule is to reconcile outside before re-invoking; the provider blocks new signature requests for 10 minutes or until the user presses "I checked PayBox" |
| Token expired mid-poll | handled inside the transport (single-flight refresh, section 8.3), invisible to the caller; if refresh fails -> `4900` and `disconnect` | |
| Signature fails local verification | `-32603`, `data.reason: "signature_mismatch"` | the artifact is discarded |
| Page hidden for a long time | nothing special; polling backs off | |

Everything shown to the user in these states is fixed app wording plus untrusted fields in an untrusted slot; the PayBox `approval_url`/`completion_url` is opened only if its origin is exactly the PayBox app origin (section 9.3), via a link the user clicks (`rel="noopener noreferrer"`), never by script navigation.

### 7.3 Mobile and cross-device

The approval happens in the PayBox app (push notification, passkey) or on `app.paybox.sh`. The page must work when the approving device is a phone: no assumption that the approval opens in the same browser. Whether `approval_url` is a universal link that opens the native app is NOT FOUND (LT9).

---

## 8. Addresses, derived accounts and account changes

### 8.1 What the addresses are

- The provider's account is the **PayBox EVM credential's address**: an MPC-held key with one address on every `eip155:*` chain (H `[T list_credentials]`, `[D]`). `list_credentials` returns `credential_id`, `kind`, `approval_mode`, `address`, `chains` (family only) and says `address` "may be `null` for older wallets"; such a credential cannot be connected (TP has no other address source; the visitor can still paste an address for read-only use through the existing binding screen, but that is not a connection).
- The **smart accounts the EOA owns are not provider accounts.** XO's Kernel v3.1 account is a pure function of the owner (`deriveAccount` in `src/xo/account/derive.ts`, reachable through `SHARED_ALLOW`; the app's `core/account.ts` already shows the status ladder `derived -> code-present -> venue-registered -> trading-enabled`); the same holds for the Polymarket Deposit Wallet candidate. `eth_accounts` stays `[EOA]` so that every library sees what it expects. App code that needs the account map calls the existing `core/account.ts` view with the provider's address; it does not ask the provider.
- ERC-1271 accounts need a wrapper at the app level: the Kernel `Kernel(bytes32 hash)` typed-data wrap and the `0x01 ‖ validator` prefix are produced by `src/xo/signing` (`kernel.ts`, `rebuild.ts`) and only the **owner's** signature comes from the provider (a `typedData` intent where the transport allows, otherwise a `raw` digest). The provider never signs "as" the Kernel account.

### 8.2 The "dedicated credential" rule

`[P1 §9 A4]`: for any funded use the owner is a dedicated PayBox credential. The connect screen lists the granted wallet credentials (`credential_id` suffix and address, never a name from PayBox rendered as trusted text) and recommends picking the dedicated one; if several EVM wallets are granted, the visitor must choose, and the choice is stored (credential id and address) in the page's IndexedDB. There is no default selection.

### 8.3 Account and session change handling

| Trigger | Provider action |
|---|---|
| Page becomes visible or gains focus after more than 30 s | `refreshAccounts()` (one `list_credentials`); the page reads each result against the stored selection |
| Before every signature | re-check that the selected `credential_id` is still granted and its address unchanged (one call; if the call fails, the signature is not attempted) |
| Selected credential no longer granted, or mode changed to `autonomous` while the page holds a "no autonomous" policy | emit `accountsChanged([])` then `disconnect` with a `ProviderRpcError` code `4900`; pending request (if any) is rejected `4100` |
| Same `credential_id` now reports a different address | treat as a security event: disconnect, warn, never auto-reconnect |
| Another credential becomes granted | no automatic change; the UI offers it; selection stays |
| A second tab | the connection state (selected credential, not tokens) is shared through `BroadcastChannel`; token **refresh is single-flight through the Web Locks API** so two tabs never present the same rotating refresh token twice (replaying a rotated token revokes the client, `[D]`); persist the new refresh token before using the new access token |
| Visitor presses Disconnect | forget tokens, key, session, stored selection; `accountsChanged([])`, `disconnect`; show how to revoke the grant in PayBox (the page cannot) |

Events follow `[E 1193]`: `connect` with `{chainId}` when a credential is selected, `disconnect` with a `ProviderRpcError` when connectivity to the transport is lost for good, `chainChanged` with a hex chain id, `accountsChanged` with an address array; `message` is not used (no subscriptions).

---

## 9. Slotting into the app

### 9.1 Files and ports (design; nothing created)

| Piece | Where | Notes |
|---|---|---|
| Types: `SigningTransport`, `TransportFacts`, `PayboxIntent` additions, `WalletPort` (what UI code is allowed to hold) | `app/src/core/wallet-port.ts` | types only, like `core/ports.ts`; frozen by W0 rules |
| Provider core, method parsing, policy, verification, state machine | `app/src/features/paybox-wallet/{provider,methods,policy,verify,pending}.ts` | pure, injected `fetch`/timers/clock like `core/env.ts`; imports viem (already a dependency) and `@shared/relay/contract` only |
| viem account | `.../account.ts` | `toAccount({...})` over the core |
| Transports | `.../transports/{proxy,walletconnect,manual,daemon}.ts` | `proxy` uses `rawFetch` against `/pb/*` only; `walletconnect` does not exist unless the user decides TW |
| UI | `.../{ConnectPanel,SignRequestDialog,PendingBanner}.tsx` | reuses `ui/` primitives, `UntrustedText`, `ProvenanceStrip` (the provenance says "signed by PayBox via <transport>") |
| EIP-6963 announcement | `.../eip6963.ts` | only dispatches when the user enabled the connector; section 10.3 |
| Test doubles | `app/e2e/support/paybox-mock/*` and `*.test.ts` | never imported from `src/`; `check:bundle` and `no-invented-data.test.ts` stay the guard |

Existing seams used: `core/bindings.ts` (a verified connected address becomes a binding source instead of a paste), `core/account.ts` (`ACCOUNT_CHAINS`, `chainById`, `observeCode`), `features/wallet/rpc.ts` (the read path; the provider's reads reuse its URL resolution `rpcUrlOf`, with an allowlist of more read methods in a separate module so that `rpc.ts` keeps "no generic request"), `features/signing/card.ts` (rendering rules), `@shared/relay/contract` (`toPayboxIntent`, `checkPreparedSign`, `digestTag`). The existing signing hygiene test (M4-4: "the page contains no code path that sends a signature") covers `features/signing/` and `routes/signing.tsx`; the adapter is a **new feature** with its **own hygiene test** (AST: only `provider.ts` may call `transport.sign`; only transports may call `fetch`; no `localStorage`; no logging of tokens or intents; no import of test helpers), so the old guarantee about the Signature Card page is unchanged.

### 9.2 What the adapter does not touch

- XO write flows stay in the daemon/agent path. In the hosted build the adapter exposes no XO submit.
- The relay's caps, ledger and prepared items are not reachable from a static page; the adapter has no caps. The UI must say "caps are advisory" wherever it shows a signing dialog (`SAFETY_NOTICES` wording from `src/relay/contract.ts`).
- `features/trade/` and `features/signing/` keep their daemon clients. A later "Sign here" button on the Signature Card in the **Cockpit** build can call `DaemonTransport`; in the hosted build it would be an addition for venue flows that exist there (none do yet).

### 9.3 CSP and policy deltas, exactly

TP adds **no** CSP entry: the page calls its own origin, and `connect-src 'self'` is already in both builds' CSP. The changes are in policy files, as reviewed changes:

1. `app/headers.config.ts`: add a constant listing the allowed upstream paths (`/.well-known/oauth-authorization-server`, `/oauth/register`, `/oauth/token`, `/mcp`, and for TP-b the `/api/agent-pairings/token`, `/iframe/pairing`, `/iframe/pairing/*`, `/agent/wallet-sign`, `/agent/requests/*/{binding,moonx-sign,signature}`, `/agent/requests/*`), and extend `renderGeneratedFiles` so the generated `vercel.json` carries the rewrite rules (or, for the function form, a `functions` entry) with `x-vercel-enable-rewrite-caching: 0` on the prefix. `vercel.json` is generated and drift-tested; a hand edit would fail `check:csp`.
2. `NEVER_IN_APP_HOSTS` currently forbids the strings `api.paybox.sh` and `app.paybox.sh` anywhere in the source or bundle (rule `never-host`), with the reason "a browser page is never a PayBox client". That reason is exactly what the user's new requirement overturns. The change: keep the rule for the whole bundle except **one policy module** that holds the two origins as constants for validating `approval_url`/`completion_url` (exact origin match) and nothing else; the page's `fetch` code names only `/pb/...`. The decision record in `docs/dapp-design.md` §2.7 ("a browser page as a PayBox client ... refused") needs a dated amendment pointing here and at the user's 2026-10-20 requirement.
3. The `vercel.json` header comment says "Example for a user who deploys the standalone explorer to their own Vercel account. The author deploys nothing." The author does deploy (observed: the dApp is live with the repo's headers). Adding the proxy makes that deployment an author-operated component; `[DD §8 fork F2]` is the place to record the user's decision, and the self-hosting examples (`_headers`, nginx, Caddy) need an equivalent proxy snippet or a note that they cannot offer PayBox connection.
4. The sanitisation of the OAuth callback: the redirect lands on a route of the SPA with `code` and `state` in the query; the page reads them once, removes them from the address bar immediately (the same pattern as `ui/pairing-fragment.ts`), and `Referrer-Policy: no-referrer` (already set) keeps them out of requests.

For TW only, the CSP would gain (Reown's list, M, to be measured): `connect-src https://relay.walletconnect.org wss://relay.walletconnect.org` and whatever the chosen client library adds (`rpc.walletconnect.org`, `pulse.walletconnect.org`, and a `frame-src` for the verify host appear in Reown's partial CSP); the generated files, `check-csp`, `check-origins` and `check-deps` would all change, and WalletConnect is on the repo's refused list.

### 9.4 No placeholder data, by construction

- Before connection: `eth_accounts` -> `[]`, `eth_requestAccounts` opens the connect flow, the UI shows "not connected"; no default address, chain-specific mock balance or sample signature exists in `src/`.
- After connection every value shown (address, credential id suffix, approval mode, chains) comes from `list_credentials` or the WalletConnect session, and carries the provenance strip ("from PayBox, read <time>, via <transport>").
- Unknown stays `null` (`approvalMode: "unknown"`, capability `{ok:false, reason:"not tested"}`), never a guess: the transport facts table is filled from live observations recorded by the user (section 13), not from this note.
- Test doubles (the mock PayBox, the Anvil key) exist only under test paths. The built-bundle check already fails on test-helper imports; add the Anvil address and the mock's route names to its forbidden-string list.

### 9.5 Bundle and supply chain

TP needs nothing new except, for TP-b only, an Ed25519 implementation when WebCrypto lacks it (`tweetnacl`, which the SDK uses; the repo's dependency rules require exact pins, provenance, no install hooks and a dated entry in `scripts/dependencies.json`). TP-a needs none. Do not add `@moon-x/*` (N14) or `@paybox-sh/sdk` (Node-only imports `node:fs`, `node:os`, `node:http`, `node:crypto`, `node:child_process`, and the `@moon-x/evm-adapter` licence): the wire protocol is small enough to implement against golden tests.

---

## 10. Compatibility: viem, wagmi, EIP-6963

### 10.1 viem

- `createWalletClient({ account: address, transport: custom(provider) })` works with the methods in section 5. `custom()` binds `provider.request` and passes through `retryCount` (`[V custom.ts]`, H). Set `custom(provider, { retryCount: 0 })` anyway for any call not already pinned to 0 (the generic read path is retried by `shouldRetry` for `-1`, `-32005`, `-32603`, `429`, `-32007`; the provider never uses those codes for signing outcomes).
- `walletClient.signMessage({ message: { raw } })` -> `personal_sign` with the hex of the bytes -> the binary rule in section 5. This is the path `permissionless`-style code uses for a UserOp hash (`owner.signMessage({message:{raw: userOpHash}})`, `[DD §2.5]`), so UserOp signing works only on a transport with `rawDigest` and with flag `allowEip191Digest` ON, never on TW.
- `walletClient.signTypedData(...)` -> `eth_signTypedData_v4` with `[address, serialized]` (verified in `signTypedData.ts`); `validateTypedData` runs in viem before the request.
- `walletClient.sendTransaction` on a JSON-RPC account -> `eth_sendTransaction` (section 5). The local-shaped account makes viem sign and `eth_sendRawTransaction` instead.
- `walletClient.switchChain` -> `wallet_switchEthereumChain`; `watchAsset`, `addChain`, `sendCalls`, `getCapabilities` -> refused.
- Typed data is JSON, so uint/int fields arrive as strings or numbers; viem hashes numeric strings and `0x` hex strings identically to bigints (vector 12.1), so no revival step is needed for hashing. The core still re-serialises with `JSON.stringify` replacing bigint with decimal strings when it builds the PayBox intent.

### 10.2 wagmi

Not added (the repo's refusal stands; wagmi is at 3.7.7, published 2026-08-27, per the registry, M). If a later task wants it: wagmi's `injected` connector takes a `target` function returning `{ id, name, provider }` and EIP-6963 discovery is enabled through `createConfig` (wagmi docs, M; the docs page does not say which provider methods the connector calls on connect and disconnect, so the provider implements `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `wallet_switchEthereumChain`, `wallet_getPermissions`, `wallet_revokePermissions` and the four events to be safe; the exact call set is NOT FOUND and would be measured by a test that records the connector's requests against the mock). A custom connector (`createConnector`) wrapping `PayboxWalletCore` is the clean alternative because the connector can expose the transport's capability facts, which the stock injected connector cannot.

### 10.3 EIP-6963

EIP-6963 lets a page discover several injected wallets through `eip6963:announceProvider` / `eip6963:requestProvider` events with `{ info: { uuid, name, icon, rdns }, provider }` (H `[E 6963]`). Our provider lives in the same page as its only consumer, so announcing it matters only if a library in the page does discovery. The adapter dispatches the announcement only when the visitor enables the connector, with: `name` "PayBox wallet (unofficial connector)"; `icon` a plain monochrome data URI authored for this app (`img-src data:` is already allowed; PayBox's logo is not used because no permission to use it was found, NOT FOUND); `rdns` derived from the deployment's own domain in reverse order (EIP-6963 says the domain "SHOULD BE an active domain controlled by the Provider"; PayBox's `sh.paybox` is not ours to claim, `[E 6963]` H). EIP-6963 `rdns` is self-attested, so nothing in the app uses it for feature detection.

---

## 11. Risks specific to the adapter

| Risk | Where | Mitigation |
|---|---|---|
| Blind signing (the PayBox approver may see a hash or a one-line preview) | all transports; TW preview is "Typed data for <name>" (code read) | local decoded dialog and digest tag; `raw` and binary `personal_sign` OFF by default |
| A signing call made by any script in the page | all | strict CSP, Trusted Types, one hygiene-tested call site, one pending request, in-page dialog before every request, but a compromised origin defeats it (stated in the UI and `docs`) |
| Standing authority (`autonomous`) | TW; any TP grant the visitor sets | refuse to connect TP with `autonomous` unless acknowledged; dedicated low-balance wallet text on the connect screen |
| Token theft | TP | memory-only access token; refresh token in IndexedDB with a short in-page lifetime option; the proxy never logs; Web Locks single-flight; clear on disconnect |
| Undocumented routes change (TP-b) | `/agent/*`, `/iframe/pairing`, `/api/agent-pairings/token` | golden tests of every request/response shape, version probe, kill switch; TP-a does not use them |
| Proxy abuse and shared egress | TP | fixed upstream, fixed path allowlist, method allowlist, size cap, no caching, Vercel firewall rate limit; PayBox may rate-limit or challenge Vercel egress (NOT TESTED, LT3, LT8) |
| Duplicate PayBox requests from library retries | all | idempotency key per call, one pending request, persisted `request_id` |
| `uint256` handling differences between a wallet's JSON parser and viem's | typed data | local `hashTypedData` is the only digest; a mismatch with what PayBox signs shows up as `signature_mismatch` |
| Licence and supply chain | `@moon-x/*` UNLICENSED; WalletConnect licence text | not used (TP) / user decision (TW) |
| The repo is public and the dApp URL is public | docs, tests | no tokens, project ids, client ids, credential ids, addresses of real users, or PayBox account details anywhere in the repo; client ids are per browser and never committed |

---

## 12. Test plan (only real signatures, public Anvil keys)

Nothing here needs PayBox. A local mock plays PayBox's wire protocol with a **public Anvil test key** standing in for the MPC key: given a 32-byte digest it returns `{r, s, recovery_id}` from a real ECDSA signature. All signatures in tests are real and verifiable; there are no canned signature strings. Note the MPC's real output may be non-deterministic (unknown, NOT FOUND), so tests assert **recoverability and verification**, never byte equality with a recorded PayBox output.

### 12.1 Vectors computed in this task (run against the repo's installed viem 2.57.2 and the public Anvil account 0, address `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`; script kept in the session scratchpad, results below)

| Check | Result |
|---|---|
| Mock MPC: sign `hashMessage("hello from the dApp")`, assemble `r ‖ s ‖ (27 + recovery_id)` | equals viem `account.signMessage`; recovers to the account (true) |
| `hashMessage("hello")` vs `hashMessage({raw: "0x68656c6c6f"})` | identical `0x50b2c43f...b37750` |
| `hashMessage("0x68656c6c6f")` (the hex string signed as text, the N3 trap) | different `0x83a0870b...0c7c32` |
| 32-byte value signed through a `raw` intent over `hashMessage({raw})` | equals viem `signMessage({message:{raw}})` (true) |
| Typed data (`chainId 3223`, `uint256` as the string `"42"`) signed via `hashTypedData` | equals viem `signTypedData` with `42n`; recovers via `recoverTypedDataAddress` (true) |
| `hashTypedData` with `uint256` as bigint, decimal string, and `0x` hex string; `int256` as `-5n` / `"-5"` | identical digest in all three |
| EIP-1559 transaction (chain 8453): digest `keccak256(serializeTransaction(tx))`, signed, `serializeTransaction(tx, {r,s,yParity})` | equals viem `signTransaction`; `recoverTransactionAddress` gives the account (true) |
| Low-`s` | `s <= N/2` (true) for the Anvil signer (a PayBox MPC signer is not known to normalise; the adapter normalises) |

### 12.2 Layers

| Layer | What it proves | Notes |
|---|---|---|
| **V1 mapping unit tests** | every row of section 5: accepted params become exactly the intended intent; every refusal code and text; parameter-order and address-mismatch cases; text round-trip rule (valid UTF-8, lone surrogates, BOM, embedded NUL, 32 random bytes); legacy tx fields refused; `to: null` refused; domain-chain rules (match, listed exception 1337, mismatch, transport lacks the chain) | pure functions, golden table |
| **V2 assembly and verification** | the mock MPC (Anvil key) output assembled and verified for message, typed data, tx, raw; a high-`s` variant is normalised and still verifies; a wrong-signer variant, a flipped byte, a signature over different content, a tx with a changed field, and a wrong `recovery_id` are all rejected with `signature_mismatch` | uses the second public Anvil key for the wrong-signer case |
| **V3 state machine** | all transitions in 7.1 and every row of 7.2 using a fake clock: approval expiry (10 min), retryable expiry not auto re-issued, cancel before and after submit, concurrent request `-32002`, uncertain submission lock, reload resume from persisted `request_id` | no network |
| **V4 mock PayBox server (contract tests)** | `/oauth/register`, `/oauth/token` (code replay revokes the client; refresh rotation; replay of a rotated token revokes), `/mcp` `tools/call request_wallet_sign` / `get_request` / `list_credentials` including SSE-framed replies, `pending_approval` -> `pending_signature` -> `success`, `denied`, `error`, `retryable`; for TP-b also pairing and the three signing routes; the mock exposes a "user" handle the test uses to approve | the mock serves **no CORS** for the page's origin, so tests prove the same-origin path is the only one that works (the CORS facts of N8 as a regression test) |
| **V5 viem integration on a real chain** | `createWalletClient({account, transport: custom(provider)})`: `signMessage`, `signTypedData`, `sendTransaction` (local-shaped account and JSON-RPC account) against **anvil** with the Anvil account funded by the node, real receipts; `verifyMessage`/`verifyTypedData` through the public client; Permit-style typed data verified by an ERC-20 permit contract if available in the repo's harness | uses the existing anvil harness approach (`test/anvil-harness.test.ts`, `test/userop-anvil.test.ts`) |
| **V6 Kernel ERC-1271** | the owner signature from the adapter over the Kernel-wrapped order and ClobAuth digests (typedData and `raw` forms) is accepted by `Kernel.isValidSignature` on the captured bytecode (`0x1626ba7e`) and a wrong owner gets `0xffffffff` | reuses `src/xo/signing` and the harness fixtures; proves the wrap math, not XO's acceptance |
| **V7 hygiene (AST)** | one call site for `transport.sign`; `fetch` only in transports; no storage outside the token/selection modules; no secrets in logs/errors; provider methods not on the allowlist are unreachable; no import of mock or Anvil material into `src/`; the provider returns `[]` before connect | mirrors `features/signing/hygiene.test.ts` |
| **V8 e2e (Playwright, existing `app/e2e`)** | the page served with the real generated CSP; `/pb/*` handled by a local forwarder to the mock; assert no console CSP violation, no request to any origin but self, the callback parameters are removed from the URL, the approval link is shown only for the exact PayBox origin and opens with `noopener`, two tabs never double-refresh (Web Locks), and the whole flow with a headless "user" approving through the mock | the e2e rig already has `csp.spec.ts`, `hostile.spec.ts`, `pairing.spec.ts` to extend |
| **V9 wagmi recording test** (only if wagmi is ever added) | records the connector's provider calls against the mock | |

None of these needs a mock signer with canned data; the only secret material is the public Anvil keys, already used by `docs/signing-vectors.md`.

---

## 13. Live tests the user must run (none run here)

Use a throwaway PayBox account or a dedicated credential holding almost nothing. Each result goes into the transport facts, not into this note.

| ID | Test | Decides | Needs |
|---|---|---|---|
| LT1 | Open `app.paybox.sh/wc` signed in; pair a WalletConnect test page (or a scratch script) with a throwaway wallet; request `personal_sign` (text), `personal_sign` (32 random bytes), `eth_signTypedData_v4` on 137, on 8453 with `domain.chainId` 137, and on 3223. Observe: passkey per signature?, the "Generate signing key" step, the preview text, what is refused | whether TW is worth a CSP delta; text and typed-data support; the 3223 and binary refusals | the user, a WalletConnect test page |
| LT2 | After LT1, open PayBox's Clients screen and switch the "(WalletConnect)" client to `always_approve`; repeat one typed-data request | whether the autonomous grant can be tightened and the WC flow honours it | the user |
| LT3 | In a throwaway Vercel project, deploy the rewrite from section 3.1 with caching disabled; from a browser console on that origin call `GET /pb/.well-known/oauth-authorization-server`; then a `POST` to the registration path with a body naming that origin as `redirect_uris` | forwarding of method/body/`Authorization`, whether PayBox's edge accepts Vercel egress, that registration works for an HTTPS redirect; **creates one OAuth client** | the user |
| LT4 | Complete OAuth through the proxy; set the credential to mode `paybox`; call `request_wallet_sign` `{op:"message", message:"test"}` | whether `paybox` mode applies to wallet-sign, what `completion_url` looks like, and whether `get_request` returns the signature to the minting client | the user, a throwaway credential |
| LT5 | Repeat LT4 for: `typedData` (chain 137, then 3223, then 1337), `raw` (a random 32-byte digest, `0x` and non-`0x` forms), `transaction` (Base, 0 value to self, tiny gas), and record **exact `get_request.output` shapes**, whether the signature is 65 bytes or `{r,s,recovery_id}`, `denied.reason` strings, low-`s`, and determinism (sign the same digest twice) | output parsing, the `0x` question, chain policy, the denial vocabulary | the user |
| LT6 | `check_operation_readiness` for a typed-data intent with `chainId` 3223 and one for `raw`, from any PayBox-connected agent | whether 3223 and raw are blocked before a request exists | the user |
| LT7 | Open the app in two tabs and force a refresh in both | single-flight refresh works; no revocation | the user |
| LT8 | 30 sequential read calls (`list_credentials`) through the proxy in a minute | rate limits, challenge pages | the user |
| LT9 | On iOS Safari and Android Chrome open the `approval_url`/`completion_url` | universal link or web page; same-device vs cross-device behaviour | the user |
| LT10 (TP-b only) | Pairing and `moonx-sign` through the proxy with a WebCrypto Ed25519 key; sign one message | whether the whole undocumented chain works from a browser | the user |

---

## 14. What to ask PayBox (names the exact ask; likely answers are inference, tag L)

The repo's decision "nobody contacts the XO team" does not mention PayBox, and "PayBox terms are no obstacle" is a decision, not a statement from PayBox. These are the asks if the user chooses to contact them; none was sent.

| # | Ask | Likely answer and why (L) |
|---|---|---|
| Q1 | Add the dApp's origin (or, better, the exact `redirect_uri` origins of registered public clients) to CORS for `/oauth/register`, `/oauth/token`, `/oauth/device_authorization`, `/mcp` | Plausible: the token endpoint of a public client used by a single-page app normally needs CORS, and they already run an origin allowlist with two entries. Might be declined for phishing reasons |
| Q2 | Publish a supported browser flow: either an official web SDK/popup connector that returns an EIP-1193 provider, or confirm `app.paybox.sh/wc` as a supported WalletConnect wallet for third-party dApps and document its method and chain list, and the grant mode it creates | The WalletConnect wallet exists in the shipped app; a statement of support is the cheapest thing for them to give (L) |
| Q3 | For WalletConnect sessions: allow the user to choose the grant mode (`always_approve`) at session approval instead of hard-coding `autonomous` | Reasonable security request; unknown |
| Q4 | Confirm the REST routes the SDK uses (`/agent/*`, `/iframe/pairing*`, `/api/agent-pairings/token`) as a supported, versioned surface for third-party clients, or provide MCP equivalents for the signing steps | They label them internal; a promise of stability is unlikely, a versioned MCP tool is possible |
| Q5 | Does the server bind the `raw_signing_payload` of an envelope to the intent of the approved request, so that an approval of a message cannot be used to sign a different digest? | Should be yes; if no, TP-b and every client-held-key path is weaker than it looks |
| Q6 | Does `request_wallet_sign` work in `paybox` mode for `message`, `typedData`, `raw`, `transaction`, and what does the completion page show the user for typed data and raw digests? | Unknown (NOT FOUND) |
| Q7 | Is there any server-side chain restriction on wallet-sign (3223, 1337, 4162), and would they add 3223 to the catalog? | Unknown; 3223 is XO's private chain, so a catalog addition is unlikely |
| Q8 | A `cancel_request` tool, and a `reason` code vocabulary for `denied` (user vs policy) | Reasonable, low cost |
| Q9 | Permission to use their name/logo in the EIP-6963 announcement, or a preferred neutral label | Unknown |
| Q10 | Rate limits and WAF behaviour for traffic from Vercel egress addresses | Unknown |

---

## Sources (all fetched or read 2026-10-20)

- https://docs.paybox.sh/llms-full.txt ; https://docs.paybox.sh/llms.txt
- https://api.paybox.sh/.well-known/oauth-authorization-server ; https://api.paybox.sh/.well-known/oauth-protected-resource ; https://api.paybox.sh/openapi.json (GET and OPTIONS probes of the paths in section 2.2)
- https://app.paybox.sh/ and its entry bundle `_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` (read as text)
- https://unpkg.com/@paybox-sh/sdk@2.2.0/ (`package.json`, `README.md`, `SKILL.md`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js`) ; https://registry.npmjs.org/@paybox-sh/sdk
- https://unpkg.com/@moon-x/evm-adapter@0.3.0/ (`package.json`, `dist/index.mjs`, `dist/index.d.ts`) ; https://registry.npmjs.org/@moon-x/evm-adapter
- https://x-docs.moonpay.com/llms.txt ; https://x-docs.moonpay.com/llms-full.txt
- https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-1193.md , eip-3326.md , eip-6963.md , eip-712.md ; https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-191.md
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SubtleCrypto.json
- https://vercel.com/docs/rewrites (redirects to https://vercel.com/docs/routing/rewrites) ; Vercel documentation search results for `routes` transforms
- https://wagmi.sh/core/api/connectors/injected ; https://docs.reown.com/advanced/security/content-security-policy ; https://registry.npmjs.org/wagmi , /viem , /@walletconnect/ethereum-provider
- Repo: `docs/plan.md`, `docs/phase1-gap-closing.md`, `docs/dapp-design.md`, `docs/signing-vectors.md`, `docs/research/{24,25,29,31}-*.md`, `src/relay/contract.ts`, `app/headers.config.ts`, `app/vercel.json`, `app/scripts/{policy,check-boundaries}.ts`, `app/scripts/dependencies.json`, `app/src/core/{ports,env,account,bindings}.ts`, `app/src/features/{signing,trade,wallet}/*`, `app/src/session.ts`

## 15. Verification (2026-10-20)

Re-checked first-hand in this session:

1. **Repo.** Read `docs/plan.md` (banner), `docs/phase1-gap-closing.md` (§9 A1), `docs/dapp-design.md` (§0, §1, §2, §3.3, §4.1 to §4.3, headings of the rest), `docs/research/24` and `25` in full, `docs/signing-vectors.md` (sections on EIP-191/raw forms), the shared contract `src/relay/contract.ts` (`toPayboxIntent`, `checkPreparedSign`, `DIGEST_FORMS`), and in `app/`: `headers.config.ts`, `vercel.json`, `scripts/policy.ts`, the opening of `scripts/check-boundaries.ts`, `src/core/{ports,env,account,bindings}.ts`, `src/features/signing/{client,card,hygiene.test}.ts`, `src/features/trade/{client,prepare}.ts`, `src/features/wallet/rpc.ts`, `src/session.ts`, `scripts/dependencies.json`. Confirmed that the app contains **no wallet-signing code today**: `viem` is used for hashing/ABI helpers only (no `createWalletClient`, no `custom(` transport), signing is done by the user's agent or the daemon, and the page "contains no code path that sends a signature" (hygiene test M4-4). The task text's "existing signing code in the dApp (viem walletClient/custom transport)" does not describe the repo as it stands; this adapter would be the first signing-capable port in the page.
2. **PayBox docs.** Fetched `llms-full.txt` and `llms.txt`; read the model, approvals, request lifecycle, connect/mcp, connect/oauth, mcp-tools (wallet-sign, get_request, list_requests, request_account_change), api-reference and sdk-cli sections.
3. **Live tool schemas** (read, not called): `request_wallet_sign`, `get_request`, `reopen_signing_window`, `list_credentials`, `request_account_change` (the source of the `paybox` mode text), `check_operation_readiness`.
4. **SDK.** Re-fetched `@paybox-sh/sdk@2.2.0`; read `signIntent`, `buildEnvelope`, `signWalletRequest`, `resolveBinding`, `completeWalletSignRequest`, `requestWalletSign`, the `nextActionFor` function, the pairing code in `cli.js`, and the dependency list; checked the registry (`latest` 2.2.0, published 2026-10-14) and `@moon-x/evm-adapter@0.3.0` (`index.mjs`, `package.json`: `UNLICENSED`). The repository named in the SDK's `package.json` returned 404 to unauthenticated `gh api` (private or moved).
5. **MoonX docs.** Fetched `x-docs.moonpay.com/llms-full.txt`; read "Ethereum Provider", "Ephemeral Signers (Agents)", "API overview", "Domain Whitelisting".
6. **CORS.** The probe set in section 2.2 (51 requests plus the metadata fetches, all `OPTIONS`/`GET`, no body), saved in the session scratchpad. Results as in N8/N9; `/iframe/pairing*` `access-control-allow-origin: *` is new relative to `[24]`/`[28]`.
7. **PayBox web app.** Downloaded `app.paybox.sh` and its entry bundle (15,639,916 bytes); grepped and read around: the pairing-link field text, the namespace table, `personal_sign` text-only handling, the typed-data chain check, the unsupported transaction methods, the `(WalletConnect)` client with `approval_mode: "autonomous"`, the "sign them without asking again" text, and the single-tab text. Response headers of `https://app.paybox.sh/` (CSP with the WalletConnect relay hosts; `frame-ancestors 'self'`). Not executed. I did not open the app in a browser and did not automate it.
8. **viem 2.57.2 (installed).** Read `clients/transports/custom.ts`, `utils/buildRequest.ts` (`shouldRetry`), `actions/wallet/{signMessage,signTypedData,sendTransaction}.ts`, `utils/chain/assertCurrentChain.ts`.
9. **Local computation.** The two scripts behind section 12.1, run with Node against the installed viem and the public Anvil account 0. Outputs in 12.1 are the actual outputs.
10. **Standards and platform.** Fetched EIP-1193, EIP-3326, EIP-6963 and EIP-712 texts from the `ethereum/EIPs` repository and grepped for error codes, events and the announce event shape; MDN browser-compat-data for Ed25519 in WebCrypto; Vercel's rewrites page and a documentation search for `routes` transforms; wagmi's `injected` connector page; Reown's CSP page; npm registry JSON for `wagmi` (3.7.7, 2026-08-27), `viem` (2.57.7, 2026-10-14; the repo pins 2.57.2) and `@walletconnect/ethereum-provider` (2.26.0, 2026-10-08).
11. **Sibling notes.** Read `[29]` §0 to §2 and §8 to §9 and `[31]` §0 and §5 to align terminology and live-test ids; I re-derived the WalletConnect claims myself (item 7) but did not re-run their other probes.

Not verified:

- That any transport returns a signature to a real visitor (nothing was signed through PayBox for this project); the output shape of `get_request` for `raw`, `transaction` and `typedData`; whether `paybox` mode works for wallet-sign; whether the PayBox MPC output is low-`s`, deterministic or 65-byte; the `denied.reason` vocabulary; whether grants refuse chain 3223/1337/4162.
- That Vercel's external rewrite forwards `Authorization`, request bodies and streams SSE, its timeout, and whether PayBox's edge accepts Vercel egress or a foreign `Origin` on a `POST` (only `GET /mcp` with a foreign origin was observed: `401`).
- Whether `routes` transforms can be combined with the generated `headers` block in `vercel.json`.
- Behaviour of the PayBox web app's WalletConnect wallet (the code was read, not run), the minimal CSP of a headless WalletConnect dApp-side client, and the licence status of `@walletconnect/ethereum-provider` beyond its registry `license` string.
- wagmi's actual connector call set; MetaMask's chain-mismatch error code; the code `4902` and `wallet_getPermissions` shape beyond EIP-3326's text and common practice (M).
- Whether `approval_url`/`completion_url` is a universal link on mobile; the exact `completion_url` path.
- XO's acceptance of any of this (the four doors of `[P1 §0]` are untouched).

Privacy check: this file contains no email address, personal name, username, GitHub login, home path or local absolute path (scratch files are referred to as "the session scratchpad"); the only addresses are the public Anvil account 0 address and public protocol facts; the public Anvil private key is not reproduced; no credential id, client id, token, WalletConnect project id or PayBox account detail of any user was read or recorded (no `list_credentials` call was made). The CSP header of the PayBox web app contains a third-party monitoring token in a report URL; I did not copy it. Probes carried `User-Agent: insurance-markets-research/0.1` and, as `Origin`, only the public dApp URL and two control origins.
