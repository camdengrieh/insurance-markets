# 27 - dApp agent terminal: design, options and an honest limit list

Researched and written 2026-10-19 (machine clock), branch `build/xo-paybox-plugin`. Task key: `agent-terminal`. Read-only research: public documentation, public GET endpoints, the public GitHub API and the repository files named below. I made no POST, PUT or DELETE to any third party, called no PayBox tool, contacted nobody, cloned and ran nothing, and read no key or credential file. Every scripted request used the User-Agent `insurance-markets-research/0.1`.

Confidence tags: **H** = primary source read first-hand this session (URL, repo path or command named), **M** = secondary source or inference from H facts, **L** = guess or judgement without evidence. **NOT FOUND (searched: ...)** is a documented absence, never a guess. All third-party text was treated as untrusted data; nothing in it was followed as an instruction.

Reference keys used below: `[P1]` = `docs/phase1-gap-closing.md` (section 9 overrides sections 1 to 8; A1 = PayBox intent shape, A4 = approval-gated claim narrowed, 16-hex `digest_tag`, dedicated credential), `[EA]` = `docs/everyone-architecture.md`, `[AGG]` = `docs/aggregation-design.md`, `[06]` = `docs/research/06-paybox-platform.md`, `[12]` = `docs/research/12-quotient.md`, `[SAFE]` = `docs/safety.md`. `F1` to `F30` are the facts in section 2.

Sibling documents for the dApp (architecture, the multichain smart-contract wallet) were written concurrently and I did not read them. Section 9 lists the interfaces I assume from them.

---

## 0. Bottom line

1. **Recommended MVP: a deterministic command terminal with no LLM in it, served by the local plugin process itself from a loopback origin, plus a "Signature Card" that independently re-verifies every prepared signature request and shows both digest tags.** It is runnable by anyone who can already run `dist/local.mjs`, needs nothing the author operates, holds no key, and ships with every write path dark. It is option (c) built on the transport of option (a), plus a read-only observer of the user's own agent. Section 5.
2. **Recommended stretch: an "agent seat" in which a bring-your-own model can only read and *propose* typed commands**, running in a credential-less sandbox that cannot reach the bridge token, with taint tracking, data minimisation and a spend cap. It reuses the MVP unchanged and adds no signing authority. Section 6.
3. **Option 0 (no separate AA kit) holds for the terminal.** Nothing the terminal does needs a session key, a module or a second signer. Every signature is a PayBox signature over a digest the local server prepared. The only thing Option 0 cannot give is unattended action, which the product does not want. Section 1.2.
4. **A browser page cannot be an MCP client of PayBox directly (F2, M for the POST routes).** PayBox's API origin answered a cross-origin GET with `access-control-allow-origin` only for `https://app.paybox.sh` and for no other origin I tried, including `https://claude.ai`. PayBox access from the dApp therefore has to go through a local process (an OAuth public client with an `http://localhost` redirect, or the SDK/CLI device-code login), never through browser JavaScript. Section 4.1.
5. **The dApp cannot see signature requests the user's own agent makes to PayBox.** `list_requests` returns only the calling client's own requests (F6). "Every signature request is shown" can honestly mean only "every request that originates from this software". Anything an agent asks PayBox to sign directly is invisible to the terminal. Caps stay advisory against a compromised agent in every mode.
6. **A real gap in the current prepared-item contract that matters for the card (F29, F30, H, from code).** For `typedData` intents the PayBox window shows the Kernel message `hash` (the inner order or auth hash), but `digest_tag` is the first 16 hex of the *wrapped* digest, which a typed-data window never displays. And `Prepared` carries no decoded payload (order struct, UserOp calls), so no client can re-derive the digest and the summary for itself. Recommended deltas R1 and R2 (section 5.9) fix both; without R1 the "independent verification" claim is only half available (orders: the quote can be shown but not tied to the hash).
7. **Prompt injection is handled structurally, not by detection.** Untrusted text never enters a trusted region of the UI or of a model's instructions. In the MVP there is no model, so the risks are rendering injection (markup, bidi, look-alike cards, paste-jacking) and they are removed by construction (typed `Untrusted` cells, `textContent` only, no links, one fixed slot). Section 5.7.
8. **The localhost bridge is the highest-risk new component.** The same shape (browser UI, local proxy, stdio server) produced a critical RCE in MCP Inspector (F12, H). Origin pinning, Host pinning, a pairing token, scoped tokens and "arming" by an out-of-band code are mandatory, and serving the UI from the same loopback origin removes the CORS and Local-Network-Access (LNA) questions (F21, F22). Section 5.3.
9. **Nothing in the terminal can be demonstrated end to end today.** The XO write path, PayBox raw-signature behaviour (T0) and the four XO doors are all unproven `[P1 §0]`. The MVP's day-zero value is read, compare, prepare-in-dry-run, second-screen verification and audit. Section 7 lists the terminal's own live tests.
10. **Rejected: (d) a hosted agent run by the author.** It contradicts the binding product decision, would put users' positions and prompts through an author-operated service, and something else works. Section 4.5.

---

## 1. Scope, constraints and the Option 0 stance

### 1.1 Constraints taken as binding (from the task and `[P1]`, `[EA]`)

- Runnable by everyone from day zero; nothing the author must operate; no custody of other people's credentials; no allowlisting of users.
- Nobody contacts the XO team; no browser automation of any third-party site; PayBox terms are no obstacle; PayBox upload is not available.
- Caps ($10 per order, $50 per day) are advisory against a compromised agent. Every write path is flag-gated OFF by default, and flags flip only through the environment of whoever runs the process (`src/relay/flags.ts`, H).
- `digest_tag` is the first 16 hex digits of the digest and is anti-accident only; the XO owner should be a dedicated PayBox credential; prefer `typedData` over `raw` where XO accepts both `[P1 §9 A4]`.
- Market text is returned only inside objects labelled `trust: "untrusted-user-content"` and, in anything an approver reads, only inside the fixed slot `[market title (untrusted): "..."]` of at most 80 characters (`marketTitleSlot`, `src/relay/contract.ts`, H).

### 1.2 Option 0 for the terminal: the PayBox wallet is the wallet

Baseline: **no separate AA kit, no session key, no module install, no second signer.** The XO owner is the user's dedicated PayBox EVM credential; the XO Kernel account is derived from that address (CREATE2, `src/xo/account/derive.ts`, per `[P1]`); every signature the terminal ever needs is produced by PayBox over a digest the local server prepared (`Prepared.sign`, `toPayboxIntent`).

What the terminal needs from a wallet, and whether Option 0 supplies it:

| Terminal need | Option 0 supplies it? | Note |
|---|---|---|
| Show owner and derived account, and prove they match the PayBox credential | Yes | `list_credentials` shows the wallet address (F5); the account is derived in-page by pure code |
| One human-approved signature per order, redeem, revoke, connect, deploy | Yes | `request_wallet_sign` with `raw` or `typedData` (F7); approval-gated grant = passkey per request |
| Batch of N orders with one approval | **No** | N orders = N approvals. Accept it. A batch of unattended orders is exactly what the product does not want |
| Unattended or scheduled action | **No, by design** | Needs a standing permission (a session key or an `autonomous` grant). The terminal has no such command and the terminal's own PayBox client must be approval-gated (section 5.6) |
| Approvals that fit the clocks | Mostly | Order TTL default 300 s, submit needs at least 90 s left, L1 window about 120 s, PayBox approvals expire after about 10 minutes (F5). A slow approver re-prepares at no cost |

Where Option 0 *would* fail for the product (not the terminal): high-frequency or market-making flows. They are out of scope `[P1 §5.2]`. So the terminal adds **no** AA layer. If one is ever proven necessary elsewhere, it would plug in as another signer behind the same Signature Card and the same server-side cap and recompute checks; this document does not specify it.

---

## 2. Facts found (with sources)

Fetched or read 2026-10-19 unless a date says otherwise. "Scratch" means my scratch directory for this task.

### 2.1 PayBox

**F1 [H]** PayBox's MCP endpoint is `https://api.paybox.sh/mcp`, "streamable HTTP ... protocol version `2025-06-18`"; it is an OAuth 2.1 authorization server with PKCE S256, dynamic client registration for **public clients only** (`token_endpoint_auth_method: none`), scopes `mcp` and `offline_access`, access token 60 minutes (JWT, audience-bound), refresh token 30 days sliding and rotated on every use (replay revokes the client); `redirect_uris` "must be HTTPS (or `http://localhost` for local dev)"; "the token's authority is exactly the grant set the user approved". Sources: `https://docs.paybox.sh/connect/mcp.md`, `https://docs.paybox.sh/connect/oauth.md`.

**F2 [H for the GET, M for everything else]** CORS on PayBox's API origin. I sent `GET https://api.paybox.sh/.well-known/oauth-authorization-server` with an `Origin` header and read the response headers. `access-control-allow-origin` was returned **only** for `Origin: https://app.paybox.sh`. For `https://claude.ai`, `http://localhost:3000`, `https://dapp.example` and `Origin: null` the response had `vary: origin, ...` and `access-control-allow-credentials: true` but no allow-origin header. This is an origin allowlist on that endpoint. **NOT TESTED**: `/oauth/register`, `/oauth/token` and `/mcp` (POST routes; testing them, even by preflight, was outside this task's read-only rule). The inference that a third-party browser origin cannot call them is therefore M.

**F3 [H]** The same metadata document (read by GET) lists `device_authorization_endpoint` and the grant `urn:ietf:params:oauth:grant-type:device_code`, in addition to what the docs page shows. `paybox login` is documented as an OAuth 2.1 device-code grant (`https://docs.paybox.sh/sdk-cli.md`).

**F4 [H]** Signing never happens in agent code. A cleared wallet sign (`pending_signature`) is finished by the "signing window", "an interactive UI rendered in the chat (the MCP resource `ui://paybox/wallet-sign`)", which signs client-side via MoonX MPC. The headless alternative is the SDK/CLI: it "completes in-process when a `pbxk1.` signing key is configured"; when a grant requires approval, `--wait` "waits for your passkey approval in the app, signs in-process ... there is no signing window on this surface". `paybox connect` pairs a signing key generated on the local machine with an eight-emoji code. `PAYBOX_CONFIG_DIR` separates environments. Sources: `https://docs.paybox.sh/concepts/requests.md`, `https://docs.paybox.sh/sdk-cli.md`. SDK `@paybox-sh/sdk` 2.2.0, Apache-2.0, published 2026-10-14 (npm registry, H). Whether PayBox serves the signing-window resource to a non-chat host that is not one of its supported ones: NOT FOUND.

**F5 [H]** `list_credentials` returns, per granted credential, `approval_mode` in `always_approve` (passkey in the PayBox app), `iframe` (confirm in the signing window) or `autonomous`, and wallet `address`; approvals are "operation-bound" (a changed parameter is a new request) and expire after about 10 minutes. Source: `https://docs.paybox.sh/reference/mcp-tools.md`, `https://docs.paybox.sh/concepts/requests.md`, `https://docs.paybox.sh/concepts/approvals.md`.

**F6 [H]** `list_requests` "returns **only requests this client created**, never another client's" (`reference/mcp-tools.md`).

**F7 [H]** `request_wallet_sign` takes `{credential_id, intent}` with `intent.op` one of `message | typedData | transaction | authorization | solanaMessage | solanaTransaction | raw` and "the chain, destination, and value are read from the intent itself; there are no separate declared fields" (same page). Whether the PayBox approval screen decodes typed data or shows only a hash: NOT FOUND (`[06 §4]`).

### 2.2 MCP specification and SDK

**F8 [H]** The newest MCP specification revision is `2026-07-28` (`https://modelcontextprotocol.io/specification/2026-07-28`; sources in the `modelcontextprotocol/modelcontextprotocol` repository under `docs/specification/2026-07-28/`). Its changelog: protocol-level sessions and `Mcp-Session-Id` removed; the `initialize` handshake removed (each request carries version and capabilities in `_meta`); `server/discover` added; server-initiated requests replaced by the "multi round-trip request" pattern (`resultType: "input_required"`); roots, sampling and logging deprecated; HTTP+SSE deprecated; dynamic client registration deprecated in favour of Client ID Metadata Documents. The two standard transports are stdio and Streamable HTTP; **WebSocket is not a standard transport** (it would be a "custom transport"). Streamable HTTP security text: servers "**MUST** validate the `Origin` header on all incoming connections to prevent DNS rebinding attacks" (respond 403 if present and invalid), "**SHOULD** bind only to localhost (127.0.0.1)" when local, and "**SHOULD** implement proper authentication for all connections".

**F9 [H]** Tools section: "there **SHOULD** always be a human in the loop with the ability to deny tool invocations"; clients SHOULD show tool inputs before calling, validate results before passing them to the model, log tool usage; "clients **MUST** consider tool annotations to be untrusted unless they come from trusted servers" (`server/tools.mdx`).

**F10 [H]** Elicitation: servers MUST NOT use form mode for passwords, API keys, tokens or payment credentials; clients MUST make clear which server asks and offer decline/cancel (`client/elicitation.mdx`). Under the new revision the pattern is a retry with `inputResponses`.

**F11 [H]** `docs/docs/2026-07-28/tutorials/security/local-server-security.mdx`: a stdio server is "an ordinary operating system process" with the user's privileges; "the client and a stdio server share one trust domain"; and "the trust domain is also cumulative. Every server you configure shares the same model context, so a malicious server can influence how the agent uses the tools of every other server."

**F12 [H]** GitHub security advisories of `modelcontextprotocol/inspector` (public API read): **CVE-2025-49596, critical**, "versions below 0.14.1 are vulnerable to remote code execution due to lack of authentication between the Inspector client and proxy, allowing unauthenticated requests to launch MCP commands over stdio"; **CVE-2025-58444, high**, XSS when connecting to an untrusted remote MCP server leading to interaction with the inspector proxy and command execution, fixed in 0.16.6. This is the architecture of option (a) (browser UI, local proxy, stdio server) failing for want of authentication and origin checks.

**F13 [H]** The repository's installed `@modelcontextprotocol/server` is version 2.0.0 (read `node_modules/@modelcontextprotocol/server/package.json`). Its `dist/index.d.mts` exports `createMcpHandler`, `requireBearerAuth`, `verifyBearerToken`, `validateOriginHeader`, `validateHostHeader`, `localhostAllowedOrigins`, `localhostAllowedHostnames`, `originValidationResponse`, `hostHeaderValidationResponse`, `WebStandardStreamableHTTPServerTransport`, `inputRequired`, `isInputRequiredResult`. So an HTTP mode needs **no new dependency** (I read the type exports; I did not run them). `src/plugin.ts` pins `PROTOCOL_VERSION = "2026-07-28"`, and `src/local/server.ts` says the local server also answers the older `initialize` handshake. The matching browser client is `@modelcontextprotocol/client` (latest 2.3.1, Apache-2.0, 2026-10-05; its `.` export is separate from its `./stdio` subpath, and its docs list a `shimsBrowser` and OAuth support) (npm registry and `https://ts.sdk.modelcontextprotocol.io/v2/clients/connect`). Using it in a browser build: not tested.

**F25 [H]** MCP Apps (`modelcontextprotocol/modelcontextprotocol` `docs/extensions/apps/overview.mdx`): tools declare `_meta.ui.resourceUri` to a `ui://` resource; hosts render it in a sandboxed iframe; the app and host talk JSON-RPC over `postMessage`. `@modelcontextprotocol/ext-apps` 2.0.3 (MIT) has an `./app-bridge` export (npm registry). This is the mechanism behind PayBox's signing window (F4, M: the identification of `ui://paybox/wallet-sign` as an MCP App rests on the URI scheme and the page text, not on PayBox's source).

### 2.3 Agent and model routes

**F14 [H]** Claude Code: `claude mcp add --transport http <name> <url> --header "Authorization: Bearer ..."` registers an HTTP MCP server (`https://code.claude.com/docs/en/mcp.md`); a tool can set `_meta["anthropic/requiresUserInteraction"]: true` in its `tools/list` entry, and Claude Code then shows the permission prompt on every call "even in `acceptEdits`, `auto`, and `bypassPermissions` ... and doesn't offer a 'don't ask again' option", allow rules do not skip it, `dontAsk` mode denies it, the `--permission-prompt-tool` route cannot approve it, and the Agent SDK's `canUseTool` callback receives it. Claude Code shows MCP elicitation requests as an interactive dialog. **The repository does not use this marker**: `grep -rn requiresUserInteraction src relay test docs` returned nothing before this document was written (H).

**F15 [H]** Remote Control (`https://code.claude.com/docs/en/remote-control.md`): connects claude.ai/code and the Claude mobile apps to a Claude Code session on the user's machine; Pro/Max/Team/Enterprise login only ("API keys are not supported"), unavailable with a custom `ANTHROPIC_BASE_URL`, the session transcript is stored on Anthropic servers while connected. It is a window for Anthropic's own clients. A documented route for a third-party UI to attach to it: **NOT FOUND (searched: remote-control page for "third-party", "embed", "custom client", "WebSocket", "programmatic")**.

**F16 [H]** Agent SDK (`https://code.claude.com/docs/en/agent-sdk/overview.md`, `.../user-input.md`, `.../permissions.md`): embeds Claude Code's agent loop "in a process you operate"; "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Use the API key authentication methods"; the `canUseTool` callback surfaces approvals and is *not* called for tools approved earlier in the flow (allow rules, `acceptEdits`, `bypassPermissions`); `claude -p` supports `--output-format stream-json`, `--input-format stream-json`, `--tools ""` (disable built-ins), `--strict-mcp-config --mcp-config`, `--disallowedTools`, `--permission-prompts none` (`.../cli-reference.md`, `.../headless.md`). `--bare` mode "has access to the Bash, file read, and file edit tools". Whether spawning the *user's own* installed `claude` on their own login from a local bridge counts as "offering claude.ai login": **NOT FOUND**; treat as not allowed to assume.

**F17 [H]** Channels (`https://code.claude.com/docs/en/channels.md`): a research preview; "`--channels` only accepts plugins from an Anthropic-maintained allowlist", custom ones need `--dangerously-load-development-channels`; a channel can relay permission prompts, and "anyone who can reply through the channel can approve or deny tool use in your session".

**F18 [H]** Anthropic API from a browser: the TypeScript SDK refuses to run in a browser unless `dangerouslyAllowBrowser: true`, and then sends the header `anthropic-dangerous-direct-browser-access: true` (`anthropics/anthropic-sdk-typescript`, `src/client.ts`). The Messages API MCP connector requires that "the server must be publicly exposed through HTTP ... Local STDIO servers cannot be connected directly" (`https://platform.claude.com/docs/en/agents-and-tools/mcp-connector.md`). Anthropic's docs index lists Workspaces and a Spend Limits API (`https://platform.claude.com/llms.txt`); I did not read their contents.

**F19 [H]** OpenAI Responses API `mcp` tool: `server_url` for a public MCP server, or `tunnel_id` for a local server through "Secure MCP Tunnel" (a client released at `openai/tunnel-client`), with a `require_approval` setting (`https://platform.openai.com/docs/guides/tools-connectors-mcp`). Not examined further.

**F20 [H, partial]** OpenRouter documents an OAuth PKCE flow by which a user "bring[s] their own OpenRouter API key" and pays for their own inference; localhost callbacks on any port are supported (`https://openrouter.ai/docs/guides/overview/auth/oauth.md`). Browser CORS behaviour of its inference API and any per-key spend limit: NOT FOUND on the pages read.

**F26 [M]** WebMCP (`webmachinelearning/webmcp`) is a W3C-community proposal letting a page expose JavaScript tools to browser-hosted agents; README read, browser support not checked.

### 2.4 Browser platform

**F21 [H]** Chrome's Local Network Access: a permission prompt shipped in Chrome 142 for `fetch()`, subresource loads and subframe navigations from a public site to local-network or loopback destinations; the article states that WebSocket, WebTransport and WebRTC to the local network "are not yet gated"; permission-gated local requests are exempt from mixed-content checks when the destination is known local (`https://developer.chrome.com/blog/local-network-access`, published 2025-06-09, updated 2025-09-29). Status of the WebSocket gating by October 2026: NOT FOUND. Safari and Firefox behaviour: NOT FOUND (not searched).

**F22 [H]** W3C Secure Contexts: an origin whose host matches `127.0.0.0/8` or `::1/128` is "Potentially Trustworthy"; the name `localhost` is trustworthy only if the user agent follows the name-resolution rules (`https://w3c.github.io/webappsec-secure-contexts/`). So `http://127.0.0.1:<port>` is a secure context (secure-context-only APIs such as WebCrypto `subtle` are available; the API list is M) and, by the article's definition in F21 of a local network request (public network to local or loopback), a loopback page calling its own loopback origin is not one (M, inference).

**F23 [H]** RFC 6455 section 10.2: servers not meant to process input from any web page "SHOULD verify the |Origin| field is an origin they expect" and reply 403 otherwise (`https://www.rfc-editor.org/rfc/rfc6455.txt`). WebSocket has no CORS.

**F24 [H]** CSP `connect-src` restricts `fetch()`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon()` and the `ping` attribute (`https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src`).

### 2.5 Threat framing and repository facts

**F27 [H]** The "lethal trifecta": an agent that combines access to private data, exposure to untrusted content and the ability to communicate externally can be made to exfiltrate the data; "LLMs follow instructions in content" and cannot reliably tell where an instruction came from (S. Willison, 2025-06-16, `https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/`; secondary source, M for the conclusion).

**F28 [H]** Repository facts read first-hand: `src/relay/contract.ts` (`Prepared`, `PreparedSign`, `digestTag`, `toPayboxIntent`, `marketTitleSlot`, `SAFETY_NOTICES`, `PREPARED_TTL_S = 300`, `AUTH_PREPARED_TTL_S = 90`, `SUMMARY_MAX_LINES = 24`, `SUMMARY_LINE_MAX_CHARS = 300`, `MARKET_TITLE_SLOT_CHARS = 80`); `src/guardrails/untrusted.ts` (sanitiser: whitespace collapse, bidi/tag/invisible/control removal, per-field caps, informational flags, "the label is the actual control"); `src/relay/flags.ts` and `relay/capabilities.ts` (flags from the environment only; KILL is one-way; `engageKill` is reached from `SIGUSR2` in `relay/main.ts`); `src/local/cli.ts` (commands `check`, `rotate-master-key`, otherwise stdio serving; only `SIGINT` handled; a second process on the same data directory gets `data_dir_locked`); `src/local/server.ts` (registers read, draft, account, userop, trade, fund and create tools); `src/tools/relay-tool-kit.ts` (annotations: `SUBMIT_ANNOTATIONS` is `destructiveHint: true`). The tool names present in `src/tools/*.ts` include `xo_account`, `xo_connect`, `xo_deploy_enable_trading`, `xo_fund_account`, `xo_prepare_order`, `xo_submit_order`, `xo_cancel_order`, `xo_list_orders`, `xo_order_status`, `xo_redeem`, `xo_revoke_trading`, `xo_submit_userop`, `xo_userop_status`, `xo_withdraw`, `xo_prepare_create_market`, `xo_submit_create_market`, `xo_track_market`, `xo_respond_update`, `xo_cancel_market`, `xo_place_seed`, and the seven read tools. The `pm_*` aggregation tools are proposed in `[AGG §9]` and I did not check whether any is built.

**F29 [H, derived from code]** The digest-tag/window mismatch. `kernelWrapDigest` and `buildKernelTypedData` (`src/xo/signing/kernel.ts`) define the signed object as `Kernel(bytes32 hash)` under the smart account's domain. For an order or a ClobAuth, `Prepared.sign.expected_digest` is the *wrapped* digest and `summary.digest_tag` is its first 16 hex (`checkPrepared` enforces this). If the intent is `typedData`, a signing window that decodes typed data would show `message.hash`, the *inner* order or ClobAuth hash, not the wrapped digest. The two share no prefix. If the intent is `raw`, the window can show only the wrapped digest (equal to `digest_tag`'s source). So the tag is comparable in a `raw` window and not comparable in a `typedData` window.

**F30 [H]** `Prepared` (and its order and userop variants) carries `summary.lines` (text), `quote` (orders), `user_op_hash` (userops), `sign`, `caps`, `capabilities`, `warnings`, and no decoded structured payload: no order struct (maker, taker, token id, amounts, expiry, nonce, fee rate, side, signature type), no UserOp fields or call list, no ClobAuth fields. A client therefore cannot recompute `expected_digest` from structured fields and cannot tell whether `summary.lines` describe the thing that is hashed.

---

## 3. What the terminal protects, and from whom

### 3.1 Assets

| Asset | Where | Exposure through the terminal |
|---|---|---|
| Owner key | PayBox MPC, never here | none; the terminal can only ask PayBox to sign what the server prepared |
| XO HMAC credentials | local vault, AES-256-GCM `[SAFE]` | never returned by any tool (`[P1 §5.4]` invariant 5); the terminal never sees them |
| Funds behind the dedicated credential and the XO account | chains | indirect: via signatures |
| Positions, balances, order history | local server, XO, PayBox | rendered in the UI; sent to a model provider in the stretch design |
| PayBox client token and `pbxk1` signing key (only if the signer adapter is enabled) | the bridge's own PayBox config directory | a secret; never enters the browser |
| Bridge session tokens | process memory, page memory | gate the tool surface |
| BYO model API key (stretch) | page memory (default) | spend and data exposure |

### 3.2 Attackers and what stops them

| Attacker | Capability | Stopped by | Not stopped |
|---|---|---|---|
| **Stranger who writes a market** (title, outcomes, rules, resolution sources, creator name) | Text reaches the UI, the user's agent, and in the stretch design a model | Typed `Untrusted` rendering, one slot, no markup/links (5.7); model sees it only as data and holds no authority (6.3) | A user who obeys text they read; a user's own external agent that follows it (the terminal cannot control that agent) |
| **Stranger who controls an upstream response** (XO error body, Quotient thesis text, venue API field, a future registry entry) | Same as above, plus numbers | The same typed cells (every upstream string is `Untrusted<T>`), schema-strict parsing, server-side recompute of amounts | Honest-looking wrong numbers: data poisoning is a market-data risk, not an injection one |
| **Hostile web page open in another tab** | Can try `fetch`/WebSocket to `127.0.0.1:<port>`, DNS rebinding, CSRF | Origin and Host pinning, bearer token in a non-simple header (forces preflight), random port, no cookies (5.3) | A same-user local process (malware) reads files and memory: out of scope, as in `[SAFE]` |
| **Compromised UI build or XSS on the UI origin** | Acts with the UI token | Token scopes enforced by the server, not the UI; `submit` scope only after arming with an out-of-band code; every submit still needs a PayBox signature the page does not hold; server-side audit; strict CSP | A compromised page can still *display* a wrong card. Mitigation: the server computes summary and tag, a second display on the bridge console, PayBox's own screen (5.5). It cannot remove this risk |
| **Prompt-injected model in the stretch design** | Writes any tokens | It holds no token, no tool but `read` and `propose`; proposals are typed commands the human reviews (6.3) | A persuaded human |
| **Prompt-injected or compromised external agent holding a PayBox grant** | Calls `request_wallet_sign` directly, talks to XO directly | Nothing in this software `[P1 §0 item 5, §9 A4]` | Advisory caps; dedicated credential; approval-gated grant |
| **Author or a package** (supply chain) | Ships bad code | Reproducible build, pinned versions, no new dependency in the MVP, same hygiene test as the repo | Trust in whoever builds `dist/` |

### 3.3 The trifecta, stated for this product

Private data (positions, balances, credentials list), untrusted content (market and upstream text) and external communication (a model provider, any fetch) meet only in the stretch design. The MVP has no model, so no component both reads untrusted content and decides anything. The stretch design cuts the trifecta by construction: the model's sandbox has no private-data tools beyond a minimised, pseudonymised context, no network except the provider, no authority, and cannot render links (6.3). Even so, the provider receives the context, which is a disclosed privacy cost (6.6).

---

## 4. Options evaluated

### 4.1 Option (a): the dApp as an MCP client of the user's own PayBox connector and of the local plugin server through a localhost bridge

Two separate links.

**(a1) dApp to local plugin server.** Feasible, standard and the right transport. Streamable HTTP on `127.0.0.1`, Origin and Host validation, bearer token (F8, F13). WebSocket is not an MCP standard transport (F8) and, as a browser-to-loopback channel, has no CORS and only the `Origin` check (F23), and the browser's LNA gating of it was not in place when last documented (F21); use Streamable HTTP plus SSE for the UI feed. The architecture class has a precedent of critical failure when authentication was missing (F12). Verdict: **use it, but serve the UI from the same loopback origin** so there is no cross-origin or LNA surface (F22), pin Origin and Host, require a token, scope it.

**(a2) dApp to PayBox.** A browser page cannot do it directly: PayBox's API origin returned `access-control-allow-origin` only for `https://app.paybox.sh` (F2). So PayBox must be reached from a local process:

| Route | How | Needs | Notes |
|---|---|---|---|
| OAuth public client in the bridge | RFC 7591 registration, PKCE, `redirect_uri = http://localhost:<port>/callback` (F1) | A client implementation; PayBox speaks MCP `2025-06-18` with the `initialize` handshake (F1) while the local server speaks `2026-07-28` (F13); `@modelcontextprotocol/client` has version negotiation and OAuth helpers (F13, not tested against PayBox) | The user consents on `app.paybox.sh` and picks the credentials and a per-credential approval mode: the grant is **the dApp's own**, separate from the user's chat agent's grant |
| SDK/CLI device-code login | `paybox login --no-open`, `paybox connect` (F3, F4) | `@paybox-sh/sdk` or the user's installed `paybox` CLI; a distinct `PAYBOX_CONFIG_DIR` | Signs in-process after passkey approval with `--wait`; no signing window (F4). Zero new dependency if the bridge spawns the CLI with an argument array |

Both give the dApp **its own PayBox client**. Properties worth stating: its grant can be `always_approve` while the user's chat agent keeps another mode (F1, F5); `list_requests` then lists only this client's requests (F6), which is the dApp's own ledger, not the agent's. The dApp cannot reduce a PayBox token below "can request any signature that the grant permits": OAuth scopes are only `mcp` and `offline_access` (F1). The safeguard is therefore code-level: the signer module accepts only a verified `Prepared.sign` and emits only `toPayboxIntent(...)` output (`raw` or `typedData`), and a test asserts that no other `op` can be constructed.

**Verdict on (a):** adopt (a1) for the MVP; adopt (a2) as an opt-in signer adapter behind a flag, because signing is blocked on T0 anyway `[P1 §6]`.

### 4.2 Option (b): model access

| Route | Works? | Key custody and exposure | Fit |
|---|---|---|---|
| **(b1) User's own API key in the browser** (Anthropic direct browser access, any OpenAI-compatible endpoint) | Yes technically (F18) | Key lives in page memory; any XSS or malicious extension reads it; cost is the user's; provider receives the context | Stretch, with a sandboxed runner (6.2) and a dedicated spend-limited key |
| **(b2) BYO key by OAuth PKCE (OpenRouter style)** | Yes (F20); browser CORS of the inference API not read | A key is minted per app and is revocable at the provider; same page-memory exposure | Stretch alternative to pasting a key |
| **(b3) Local model (e.g. Ollama)** | Not researched here | Context never leaves the machine; cross-origin permission is a server setting I did not verify | Stretch, privacy-preferring; quality and tool-use reliability are model-dependent (L) |
| **(b4) Agent SDK in the bridge with the user's API key** (F16) | Yes: `canUseTool`, `--tools ""`, `--strict-mcp-config`, `--disallowedTools` give a real policy engine | Key in the bridge's environment, not the page; the SDK is Node-side so the bridge needs it as a dependency or spawns `claude -p` | Possible stretch variant when the user already runs Claude Code. The coding-agent harness is a large attack surface for a trading terminal; if used, built-ins must be disabled (`--tools ""`) and only an allowlisted MCP config loaded |
| **(b5) The user's *existing* Claude through Remote Control or channels** | **No third-party attach route documented** (F15); channels are allowlisted preview plugins (F17) | n/a | Rejected as a design basis. The user's existing agent already works with the local server over MCP; the dApp complements it (observer feed, 5.4), it does not drive it |
| **(b6) Provider-hosted tool loop reaching the local server** (Anthropic MCP connector needs a public server, F18; OpenAI tunnel client, F19) | Only by exposing or tunnelling the local server to a third party | Moves tool outputs and a reachable endpoint off the machine | Rejected: against local-first, and the tunnel makes the signing-adjacent server remotely reachable |

Not allowed to assume: logging a user in with their claude.ai subscription inside our product (F16). Any model route must be "the user brings a key" or "a local model".

### 4.3 Option (c): plain command terminal, no LLM

Deterministic grammar over the same tools, structured result renderers, no free-form language. Strengths: no instruction-following component exists to be injected; every action is typed by the human; renderers are testable; zero model cost and zero data disclosure; fits "runnable by everyone". Weakness: no natural-language convenience, and the user's agent (Claude etc.) already provides that elsewhere. Verdict: **the MVP.**

### 4.4 Option (e) (added): observer and second screen for the user's own agent

Not in the task's list but the most direct way to "tie in with the user's PayBox agent" without a second agent: the local server runs one process (single writer; `data_dir_locked` otherwise, F28); the user's Claude Code registers it over HTTP with a bearer header (F14); the UI subscribes to a feed of prepared items, status changes and audit events. The human sees, in a page rendered by deterministic code, what the agent asked to be signed, and can compare digest tags with PayBox's screen. Value: independent display of an agent-initiated request. Limit: only requests that pass through this server (F6). Included in the MVP.

### 4.5 Option (d): a hosted agent run by the author - rejected

Reasons, each independent: (1) the binding decision says nothing may depend on the author operating a server `[EA §1]`; (2) it would receive users' prompts, positions, addresses and tool outputs, i.e. custody of other people's data, and for any signing-adjacent use, a high-value target; (3) the author would become the operator of an automated trading agent, inheriting XO's wash-trading, influence and region clauses and the one-account-per-user clause for everyone `[SAFE]`; (4) the model route cannot use users' claude.ai logins (F16), so the author would pay for inference or take users' API keys, which is custody; (5) a trifecta at scale (3.3). "Unless nothing else works" is not met: (c) and (e) work, and (b1) to (b4) work as stretch. **Known reach gap, stated plainly:** a user who can only use a phone or a hosted chat app and cannot run a local process cannot use local mode at all `[EA §2.1]`; none of the options here fixes that without an operator (M).

### 4.6 Scoring

Scale: ++ strong, + ok, - weak, -- fails. "Day zero" = usable by anyone without an operator.

| Criterion | (a1) local MCP bridge | (a2) PayBox client in bridge | (b1) BYO key in browser | (b4) Agent SDK in bridge | (c) command terminal | (e) observer | (d) hosted |
|---|---|---|---|---|---|---|---|
| Day zero, no operator | ++ | + | + | + | ++ | ++ | -- |
| Custody of others' secrets | ++ none | + own PayBox token on own disk | + key in page | + key in bridge env | ++ | ++ | -- |
| Injection exposure | + (no model) | + | - | - (large harness) | ++ | ++ | -- |
| Strengthens signature review | ++ | + | n/a | n/a | ++ | ++ | n/a |
| Verifiable today | + | - (T0, PayBox untested) | + | + | ++ | ++ | n/a |
| Effort | M | M | M | L | S to M | S | L |

---

## 5. Recommended MVP: "Cockpit" (loopback-served deterministic terminal, signature card, observer feed)

### 5.1 Shape

```
Browser tab  http://127.0.0.1:<random port>/      (static UI, strict CSP, same origin as the API)
    |  fetch + SSE, Authorization: Bearer <ui token>, no cookies
    v
node dist/local.mjs serve --ui          (proposed new subcommand; one process; single writer of the data dir)
    |- POST /mcp         Streamable HTTP MCP, same tools as stdio; per-token scope
    |- GET  /ui/*        static assets, Cache-Control: no-store
    |- GET  /ui/events   SSE: audit events, prepared items (decoded), status changes
    |- POST /ui/pair     one-time pairing exchange
    |- POST /ui/arm      arm / disarm (out-of-band code)
    |- POST /ui/kill     engage kill (one-way)
    |- embedded relay: credentials vault, ledger, prepared store, capability facts, relay audit log
    |
    '- optional signer adapter (flag off): spawns `paybox` CLI (argv array) with its own PAYBOX_CONFIG_DIR

User's own agent (Claude Code, etc.) --HTTP MCP + its own bearer token--> same /mcp (read + prepare, optionally submit)
```

Everything is the existing local mode plus an HTTP front. No hosted component, nothing the author runs.

### 5.2 Why serve the UI from the bridge process

Same-origin removes CORS, removes the Local Network Access prompt (loopback to loopback is not a public-to-local request, F21), makes `Origin` pinning trivial (expect exactly `http://127.0.0.1:<port>`), gives a secure context (F22), and lets the server set the CSP header (F24). A hosted copy of the UI (for people who do not want the bridge to serve it) is a stretch item (6.7), because it brings back CORS pinning, the LNA prompt and trust in the static host.

### 5.3 Bridge security (mandatory, each with a test)

1. Bind `127.0.0.1` only, random high port, no fixed port (F8).
2. Validate `Host` equals `127.0.0.1:<port>` (DNS rebinding) and, when `Origin` is present, equals the page origin; otherwise 403 (F8, F13: `validateOriginHeader`, `validateHostHeader`). Requests with no `Origin` (non-browser clients such as Claude Code) are accepted only with a valid agent token.
3. Every route needs `Authorization: Bearer <token>`; a custom header forces a CORS preflight, which the server never approves for any cross-origin caller. **No cookies**: cookies ignore ports, so a cookie set by one localhost service reaches another (M, standard cookie scoping; not re-verified this session).
4. Tokens are random 128 bits, scoped, in memory only. Classes: `ui` (read; prepare after arming policy below), `agent` (configurable; default read + prepare), `armed` (adds `submit`, 10 minutes maximum, issued only by the arming step). The **server** enforces the scope from a table that maps every registered tool to exactly one class (`read`, `prepare`, `submit`, `admin`); a tool missing from the table is denied, and a test fails the build if a registered tool is unclassified.
5. Pairing: the process prints `http://127.0.0.1:<port>/#pair=<code>` on stderr only. The fragment is not sent in the HTTP request; the page posts the code to `/ui/pair` (single use, 120 s) and receives a `ui` token kept in `sessionStorage` or memory. The eight-emoji pairing in PayBox's own CLI (F4) is a precedent for out-of-band confirmation.
6. **Arming**: a write needs the `armed` token. `POST /ui/arm {minutes <= 10}` makes the server print a short code on stderr (and a desktop notification if the existing alert hook is configured); the user types it into the page. A compromised page cannot read stderr. Disarm on expiry, on any tripwire, on kill, and when the SSE connection drops. Arming does nothing if every `ENABLE_*` flag is off.
7. **Kill**: `POST /ui/kill` engages the existing one-way software kill (`engageKill`, F28). The UI may engage it; nothing may disengage it except a process restart. Note the delta R6: today only the standalone relay maps `SIGUSR2` to it; the local CLI does not.
8. Flags are shown, never set. No endpoint changes `ENABLE_*`, `RELAY_ARM`, caps or the data directory. To change them, the user stops the process and restarts it from their own shell.
9. Strict CSP on every HTML response: `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. In the MVP `connect-src 'self'` means the page can reach nothing but the bridge, so a compromised page cannot exfiltrate to a third party (F24). `Referrer-Policy: no-referrer`; no third-party scripts, fonts or analytics.
10. The bridge's own outbound HTTP uses the existing upstream module with its pinned `User-Agent` and host allowlist (`relay/upstream.ts` per `[P1 §9 A5]`); the UI makes no request of its own to any venue.
11. Rate limits per token and per tool class; `prepare` is capped per session (it reserves daily-cap budget, so unbounded prepare calls are a denial-of-budget vector, M).

### 5.4 The two surfaces: terminal and observer feed

**Terminal pane.** A line input with a small deterministic grammar (not a shell: no pipes, no variables, no `eval`, no scripting). One line, no embedded newlines: a paste containing newlines is flattened to one line and never auto-executed (paste-jacking, M). History is local to the tab. Commands:

| Class | Commands (MVP) | Tools behind them |
|---|---|---|
| Read | `help`, `status`, `markets <query>`, `market <id or slug>`, `book <market> [yes or no]`, `prices <market>`, `positions`, `orders`, `order <hash>`, `account`, `flags`, `caps`, `audit [n]` | `xo_search`, `xo_get_market(s)`, `xo_orderbook`, `xo_market_prices`, `xo_positions`, `xo_list_orders`, `xo_order_status`, `xo_account`, local state |
| Compare and signals (when built) | `compare <market>`, `edge [filters]`, `signals <market>` | `pm_compare_market`, `pm_find_edge`, `pm_signal_request` / `pm_signal_parse` (`[AGG §9, §7]`) |
| Prepare (needs `prepare` scope and the relevant flag) | `buy <market> <yes or no> <shares> @ <price> [ttl <s>]`, `sell ...`, `redeem <market>`, `enable-trading`, `revoke-trading`, `connect` | `xo_prepare_order`, `xo_redeem`, `xo_deploy_enable_trading`, `xo_revoke_trading`, `xo_connect` |
| Session | `arm [minutes]`, `disarm`, `kill`, `clear`, `export-audit` | bridge routes |
| **Absent on purpose** | any flag setter, any cap setter, any raw-call, any "run this JSON", any `fund`/`withdraw`/`create` command, any session-key or module command | If the user's agent prepares those, the Signature Card shows them (5.5); the terminal does not originate them in the MVP |

`signals` is a paid call (`[AGG §7]`: $0.005 to $0.02 per call through x402 from a separate data credential). It never runs from a line alone: the card for it shows the host, the pinned payment tuple, the price ceiling and the purpose, and needs its own confirmation. No auto-pay, no loops.

Write-class commands print what will happen if the server would refuse (`flag_off`, `kill_switch`, `capability_unknown`) before asking for anything; with all flags off, the terminal is read-only and says so in its banner. Training mode against the repository's local mock and chain harness (`[P1 §5.5]`, `test/anvil`, `test/mock-xo` if built; I did not verify they run) is a natural fit for the first demonstration.

**Observer pane.** The same SSE feed as the audit panel plus a "prepared items" list: every item the server prepared, whoever asked (terminal or the user's agent), with state `prepared`, `shown`, `signed`, `submitted`, `accepted`, `rejected`, `expired`, `ambiguous`. A new agent-initiated item pops a Signature Card in the observer pane with the banner "Requested by: agent token <short id>". This is the "tie in with the user's PayBox agent" function for signatures. It does not control the agent; it cannot see anything the agent does outside this server (F6).

### 5.5 How every signature request is shown: the Signature Card

Goal (`[P1 §9 A1, A4]`): the human compares what they are about to approve with an independent rendering, and the rendering is produced by deterministic code from structured data, never by an LLM and never from agent-written text.

**Verification step (runs in the page, before the card is enabled).**

1. `preparedSchema.parse(item)` (the strict zod schema from `src/relay/contract.ts`, which is dependency-light and shared) and `checkPreparedSign(item.sign)`: the intent must hash to `expected_digest`; `digest_tag` must be its first 16 hex (both are already enforced by the schema).
2. Derive the XO account from `owner` with the repository's pure derivation code and compare with `item.account`. Compare `owner` with the wallet `address` of the PayBox credential the signer will use (only when the PayBox client is connected; otherwise show "unchecked").
3. **Recompute the digest from decoded fields and regenerate the summary from them.** Today the contract has no decoded payload (F30), so this step is available only after R1. Without R1 the card marks the item "digest not independently derivable" in amber and shows the relay's summary lines verbatim, with the market title in its slot.
4. Check freshness: seconds left against `expires_at`; disable Sign when an order has less than 90 s of life left (the server's own submit rule, `[P1 §5.2]`) or an auth item has less than about 30 s left (my margin against the 90 s auth TTL, L).
5. Show the capability list the call depends on (`capabilities`, each `unknown`/`yes`/`no`) and `warnings`, so the user sees what is unproven.

**Layout.** One bordered box. The top bar names the kind and its irreversibility (ORDER, USEROP, AUTH, CREATE, and for paid reads PAYMENT). A ruled "trusted" region contains only text the UI composed from typed fields: owner and derived account (short with full on hover), the action in one line with units, the dollar reservation against the daily cap, the countdown. Inside it, market-controlled text appears only as the single slot the server already builds, `[market title (untrusted): "..."]`, drawn with a distinct left bar and monospaced grey type and labelled "untrusted" on every line, and never on a line of its own without that prefix. The relay's wording of the summary is shown in a collapsed block and diffed against the UI's own numbers; a mismatch in any digit turns the card red and disables Sign.

**Tags.** The card shows `digest_tag` (16 hex, grouped in fours) and, because of F29, a second tag:

- For a `raw` intent: "PayBox's window should show this payload: `0x<digest>`; compare the first 16 hex: `<digest_tag>`."
- For a `typedData` intent: "A typed-data window should show `Kernel` with `hash` = `0x<inner hash>`; compare the first 16 hex: `<inner_hash_tag>`. The wrapped digest `<digest_tag>` is what is finally signed; a window may not show it."

Neither tag is a defence against a hostile agent (`[P1 §9 A4]`, `SAFETY_NOTICES.digestTag`); both help only against accidents and swaps. What PayBox actually displays is NOT FOUND (`[06 §4]`), so the card tells the user to confirm it in T0 and then edits the wording to match. This is one of the terminal's live tests (section 7).

**Buttons.** `Reject` (always enabled; records the decision), `Copy intent` (exact `request_wallet_sign` argument JSON, for the user's own agent: signing path S1), and `Sign with PayBox` (signer adapter, path S2; enabled only when armed, the flag for the adapter is on, the credential's `approval_mode` is `always_approve`, and every verification step passed). An `autonomous` or `iframe` credential disables S2 with the reason, because the headless surface has no signing window and an autonomous grant would sign without a human (F4, F5).

**Two signing paths, both unproven until T0 (PB1 to PB4 in `[P1]`).**

| Path | Who calls PayBox | Who submits | What the terminal adds | Limit |
|---|---|---|---|---|
| **S1: the user's agent signs** | The agent, with the exact intent from the card | The agent calls `xo_submit_*` with the signature | Independent card, submit-time gate (R4), audit | The agent can ignore the card; caps advisory |
| **S2: the terminal signs** | The bridge's own PayBox client (CLI/SDK), only with `toPayboxIntent(sign)` output, argument array not shell string, after passkey approval (`--wait`) | The bridge, server-side, after the existing recompute-and-recover check | The signature never enters the browser; the agent token can be limited to `read` + `prepare` so it cannot submit through this server | Needs a `pbxk1` key on the bridge host (a secret); the agent can still sign through its own grant and talk to XO directly; headless only, no signing window |

An integrity test for S2: a unit test feeds the signer module every other `op` (`message`, `transaction`, `authorization`, Solana ops) and a `Prepared` whose intent does not hash to its digest, and requires refusal.

### 5.6 Session and permission model

- **Session** = a page load plus its `ui` token. The MCP revision has no protocol sessions (F8); everything here is application state. `ui` tokens last until the tab closes or 8 hours.
- **Postures** the UI shows in a permanent status bar: `OBSERVE` (read), `PREPARE` (read + prepare, no signing UI), `ARMED mm:ss` (submit scope live), `KILLED`. Default `OBSERVE`. Moving to `PREPARE` is a click; to `ARMED` needs the out-of-band code (5.3 item 6).
- **Per-class rules.** Read: always allowed. Prepare: allowed when the matching flag is on and the daily-budget check passes; counts toward a session prepare cap. Submit and signer calls: only `ARMED`, only for an item this session verified and the human did not reject, one send per `prepared_id` (the existing invariant, `[P1 §5.4]`). Admin: `kill` only.
- **Human in the loop** is satisfied twice (F9): the Signature Card click, and PayBox's own approval (when the grant is approval-gated).
- **External agent policy.** The `agent` token's scope is chosen at start by the user (`--agent-scope read,prepare` default). A user who wants S2 gives the agent no `submit`. The status bar lists which tokens exist and their scopes, so the user sees what authority is outstanding.

### 5.7 Rendering tool calls, and prompt injection from market text and venue data

**Tool-call transcript.** Every call is one transcript entry: timestamp, actor (`you`, `agent <id>`, `system`), tool, arguments (shown *before* the call for `prepare` and above, per F9), status, duration, and a result card. Cards are generated from the tool's strict `outputSchema` by per-tool renderers; an unknown field is not rendered (allowlist rendering), and a result that fails its schema is shown as a red "schema violation" entry with the raw JSON in a collapsed, `textContent`-only block. The `text` content block is never rendered when `structuredContent` exists; it is shown only when it is the sole content. Typed cells: `Usd`, `Price`, `Shares`, `Hash` (short with copy), `Address`, `Time`, `Status` (closed enum), `Flag`, `Warning`, and **`Untrusted`**.

**Rule for untrusted text (extends the existing sanitiser rule).**

1. Every string that a market creator or an upstream service can influence has the branded type `Untrusted` (validated by `untrustedContentSchema`); a build-time type check and a lint test forbid passing an `Untrusted` where a plain label is expected. This includes market titles, outcome names, categories, descriptions, rules, resolution sources and evidence, creator names, upstream rejection text (`upstream_rejected` details), HTTP error bodies, Quotient theses and key factors, registry notes, and the raw text of unrecognised statuses.
2. The only renderer for `Untrusted` creates a text node with `textContent` inside a `span.untrusted`; no `innerHTML`, no markdown, no auto-linking, no images, no CSS from data, no `title`/`alt` taken from data. URLs inside text stay inert text; copying is manual.
3. Approval-adjacent surfaces (the Signature Card, the arming prompt, the status bar) show an `Untrusted` value only as the 80-character slot and never as a heading, button label, tooltip or error message. Everywhere else it is capped per field by the sanitiser limits (title 200, description 1,500, rules 3,000) and expanded only by an explicit click.
4. The sanitiser output is not trusted for safety: its flags (`instruction-like`, `tool-reference`, `role-marker`, `url`, `wallet-address`, `markup`, `mixed-script`) are shown as chips, never used to allow anything (`src/guardrails/untrusted.ts`: "the label ... is the actual control").
5. Look-alike defence: the trusted region of a card has a visual treatment (border, background) that `span.untrusted` cannot reproduce because untrusted content is rendered only inside inline spans with fixed typography; no untrusted text can create a block element. A test renders a corpus of hostile titles (fake cards, bidi reordering, 10,000 combining marks, ANSI/OSC sequences, markup, very long lines, text that names `request_wallet_sign`) and asserts the DOM has no element except the expected span and that the card's trusted region is byte-identical.
6. Clipboard: the UI never writes untrusted text to the clipboard as part of a "copy" of a command or an intent.

**What this does not cover.** A user's external agent reads the same tool outputs and may obey them; the terminal cannot prevent it (3.2). The mitigation the repository can ship is on the server side: mark signing-adjacent tools `_meta["anthropic/requiresUserInteraction"]: true` so Claude Code prompts for each call (F14, R3).

### 5.8 Audit log

Three layers; the server's is authoritative because the page may be compromised.

1. **Server audit** (existing `relay/audit.ts`, append-only JSON lines, mode 0600, redacted, rotated, addresses shortened `[SAFE]`): extended with terminal events: `ui.pair`, `ui.arm`, `ui.disarm`, `ui.kill`, `ui.command` (the parsed command, not the raw line), `ui.card.shown` (`prepared_id`, `digest_tag`, `inner_hash_tag`, verification result), `ui.card.decision` (approve/reject, seconds to decision), `signer.request` / `signer.result` (PayBox `request_id`, status; never the signature), `agent.call` (token id, tool, class, argument hash, outcome), `feed.mismatch` (relay summary differs from UI-derived summary), `schema.violation`.
2. **Hash chain**: `h_n = SHA-256(h_{n-1} || canonical-JSON(entry_n))`; the head is shown in the status bar and printed at exit. This is tamper-evident against accident and casual edits, not against a malicious local process that rewrites the file and the head.
3. **Page log** (IndexedDB, per origin, for the user's convenience): transcript and card decisions, exportable. Never contains signatures, tokens or secrets.

No log line includes a token, a signature, an HMAC value, a master key, a PayBox token or a model key. A scanner test (the repository already has one for secrets, `[P1 §6 relay-core]`) runs over the new events.

### 5.9 Deltas to existing code that the MVP depends on (recommendations, not made here)

| ID | Delta | Why | Where |
|---|---|---|---|
| R1 | Add a `decoded` block to `Prepared`: order struct (all ten signed fields), or UserOp (unpacked fields plus call list), or ClobAuth fields; plus a pure `verifyPrepared(prepared)` that recomputes `expected_digest` and regenerates the summary lines from `decoded` | A client cannot currently verify what a digest means (F30) | `src/relay/contract.ts`, `src/xo/signing/*`, `src/xo/userop/*` |
| R2 | Add `inner_hash_tag` (first 16 hex of the Kernel message `hash`) to `summary` for `typedData` intents | Tag cannot be compared in a typed-data window (F29) | `src/relay/contract.ts` `summarySchema`, `checkPrepared` |
| R3 | Set `_meta["anthropic/requiresUserInteraction"] = true` on every prepare/submit/connect/fund/withdraw/create tool | Makes Claude Code prompt on every call regardless of mode (F14) | `src/tools/relay-tool-kit.ts` registration helpers |
| R4 | `xo_submit_*` return an `input_required` result with a form-mode elicitation carrying the server-made summary and tag; proceed only on accept (`inputRequired` is exported, F13) | A protocol-native, server-worded confirmation in every client that implements elicitation (Claude Code shows a dialog, F14). It is UX, not security: the host controls the answer | `src/tools/*` submit handlers; test with a client that declines |
| R5 | `serve --ui` subcommand: HTTP front with the controls in 5.3, tool-class table, SSE feed, pairing, arming, kill | The bridge | `src/local/cli.ts`, new `src/local/http.ts` using only `node:http` and the already-installed server package exports (F13) |
| R6 | Runtime kill in local mode (map to the existing `engageKill`) | The panic button | `src/local/cli.ts`, `relay/embedded.ts` |
| R7 | A closed tool-class table and a test that every registered tool is classified | Scope enforcement | new `src/local/tool-classes.ts` |
| R8 | Signer adapter `src/local/paybox-signer.ts` (flag off) spawning the `paybox` CLI with an argument array, own `PAYBOX_CONFIG_DIR`, using only `toPayboxIntent` output | Path S2 | new file; no dependency added |

R1 and R2 are contract changes owned by the `plugin-tools`/`relay-core` streams `[P1 §5.3]`; they are listed here, not applied.

### 5.10 Build order and acceptance (sizes: S small, M medium, L large)

1. **M0 (S)**: `serve --ui` with Host/Origin pinning, pairing, `read` scope only, SSE audit feed, static UI with the read commands and renderers, CSP. Acceptance: the hostile-origin, rebinding, missing-token and wrong-Host tests return 403/401; hostile-title corpus renders inertly; the status bar shows flags and caps from `xo_account`.
2. **M1 (M)**: R7 tool classes; prepare commands; Signature Card with steps 1, 2, 4, 5 and the amber "not independently derivable" state; observer pane. Acceptance: an agent-initiated prepare appears in the feed; tamper tests (altered `digest_tag`, altered intent, expired item) disable Sign.
3. **M2 (M)**: R1 and R2, full verification and the red mismatch state; arming and `armed` token; kill; R3 and R4. Acceptance: mutating any one digit of the relay summary turns the card red; submit without arming returns 403; two submits of one `prepared_id` send once.
4. **M3 (M, flag off until T0)**: R8 signer adapter and the PayBox panel (`list_credentials`, `get_portfolio`, own `list_requests`, approval links). Acceptance: the signer refuses every non-`Prepared` intent; an `autonomous` credential disables Sign.

---

## 6. Stretch: "Agent seat" (bring-your-own model that can only read and propose)

Everything in section 5 stays. The addition is a model that helps the user read markets and compose commands. It is deliberately powerless.

### 6.1 Architecture

```
UI page (holds the ui token)  <--postMessage-->  Model sandbox (sandboxed iframe or Worker; no token, no cookies, no DOM access to the UI)
        |                                                |
        | policy engine (in the UI): tool allowlist,     | connect-src: only the chosen model endpoint
        | arg schema validation, rate limit, wrap results|
        v                                                v
   bridge /mcp (read tools only for the model)        model provider (user's key) or local model
```

The model never receives the bridge token. It asks the UI to run a read tool; the UI's policy engine checks it against a closed allowlist, validates arguments against the tool's input schema, runs it with the `read` scope and returns the result wrapped as untrusted data. A compromised provider response, or a model that has been injected, can therefore do nothing but read (what the UI would let it read) and emit text.

### 6.2 Model routes (user's choice; none is operated by the author)

(b1) user-pasted key held in page memory only, sent only to the endpoint named in the sandbox's CSP `connect-src` (F18, F24); (b2) OAuth-PKCE minted key (F20); (b3) a local model server on the user's machine (cross-origin setting not verified here); (b4) the Agent SDK in the bridge with the user's API key, only with built-in tools disabled (`--tools ""`), `--strict-mcp-config` to the single local server, `--disallowedTools` for everything that writes, and `canUseTool` returning deny for any tool outside the read list (F16). Never: a claude.ai login inside our product (F16), Remote Control or channels as a basis (F15, F17), a provider-hosted loop that reaches the local server over a tunnel (F18, F19). Model names are deliberately not specified; the doc depends on none.

### 6.3 What the model may and may not do

| May | May not |
|---|---|
| Call allowlisted read tools (markets, books, prices, positions, orders, compare, edge) through the policy engine | Call any prepare, submit, sign, connect, fund, withdraw, create, cancel, respond or admin tool |
| Emit a **proposal**: a structured object `{command, rationale}` where `command` is a line in the terminal grammar | Execute a proposal, edit a Signature Card, hold a token, open a URL, write to the clipboard |
| Explain what it read, in text shown in a pane labelled "model note (unverified)" | Appear inside or adjacent to a Signature Card, or provide any text a card displays |

A proposal lands in the input line as an editable, unsent command with a banner. The human presses Enter; only then does ordinary section 5 machinery run (prepare, card, arming, PayBox approval). Taint rule: if the model's context for this turn contained any `Untrusted` text (almost always), the proposal is flagged "tainted" and the terminal requires the human to re-type the market id and the size before preparing. Proposals are checked deterministically before display: the market id must be one the model actually read this session; the size must be within caps; a proposal naming more than one action is rejected.

### 6.4 Context construction

Data minimisation by construction: the context builder sends market data and, if the user opts in, positions; it replaces the owner and account addresses with stable pseudonyms (`OWNER_1`, `ACCT_1`) before sending and maps them back when rendering; it never sends credentials lists, tokens, the audit log, PayBox request ids or any file content. Untrusted text is delimited and prefixed with a fixed statement that it is data. Persistent model memory is not provided (a memory is a poisoning vector).

### 6.5 Runaway and cost controls

Per-session limits on turns, tool calls, tokens and, if the provider reports it, spend; a visible meter; a hard stop that cannot be raised from inside the sandbox; recommend a dedicated key with a provider-side spend limit where the provider has one (Anthropic lists Workspaces and a Spend Limits API, F18; not read). Loop detection stops on repeated identical tool calls.

### 6.6 Privacy statement the UI must show before the first model call

What is sent (the exact context preview, pseudonymised), to whom (the endpoint host), that the provider's retention applies, and that Quotient output (licence: personal or internal use, no redistribution, `[AGG §7]`) is excluded from the model context unless the user opts in. I did not verify whether sending Quotient data to a model provider is within its terms: NOT FOUND, so default off.

### 6.7 Further stretch items, each independent

- **Host the PayBox signing window** inside the page with `@modelcontextprotocol/ext-apps` `app-bridge` (F25), so `iframe` approval mode works like in chat hosts. Requires the bridge's own OAuth client to PayBox (F1), version negotiation with a `2025-06-18` server, and PayBox serving `ui://paybox/wallet-sign` to a non-listed host (NOT FOUND). Size L; do not start until M3 and T0 are done.
- **Hosted static copy of the UI** for users who prefer not to let the bridge serve it: needs pinned CORS on the bridge, the Chrome LNA prompt (F21), and a pairing step; trust moves to the static host and its build; keep CSP via `<meta>` where allowed. The bridge must refuse any origin but the one the user names at start.
- **WebMCP** (F26): expose *read-only* dApp state to browser-resident agents; never register prepare or sign tools.
- **Claude Code channel** with permission relay (F17): preview and allowlist-bound; the permission relay would approve Claude Code tool use, not PayBox signing; low value; watch only.
- **Elicitation-gated prepare** for external agents (extension of R4).

---

## 7. Unverified, and the terminal's own tests (to be run by the user, one at a time)

Nothing below has been run. Each is opt-in, prints its plan first, and moves no money.

| ID | Question | How (no spend) | Outcome that changes the design |
|---|---|---|---|
| TT1 | Does `createMcpHandler` plus `validateOriginHeader` behave as needed on loopback with a browser client, including the pre-2026 `initialize` fallback for Claude Code? | Build R5 against the mock; run a hostile-origin test page and Claude Code against it | If a client fails, add the legacy handler path |
| TT2 | Does `@modelcontextprotocol/client` run in a browser build and talk to the loopback server | Bundle it; list tools | If not, use a thin typed `fetch` JSON-RPC client |
| TT3 | What does PayBox's approval show for `raw` and for `typedData` (hash only, or decoded)? | Part of T0 with a throwaway credential: one `raw` and one `typedData` zero-value request, screenshot by the user | Decides the exact wording of the two-tag block (F29) |
| TT4 | Does PayBox accept `http://localhost:<port>` redirect URIs for dynamic registration with an `application_type` native client, and do `/oauth/*` and `/mcp` answer a CLI/server client normally? | Run the SDK device-code login in a separate `PAYBOX_CONFIG_DIR` | If OAuth from the bridge fails, use the CLI route only |
| TT5 | Does `paybox sign --wait` return the raw output shape the server expects (65 bytes or r, s, recovery id) under an `always_approve` grant? | T0 | Fixes `toPayboxIntent` options |
| TT6 | Does the browser's CSP and the SSE feed work under Safari and Firefox on loopback? | Manual | If not, document supported browsers |
| TT7 | Hostile-title corpus renders inertly in Chromium, Firefox and Safari | Automated DOM test plus manual | Gate for M0 |
| TT8 | Does Claude Code honour `_meta["anthropic/requiresUserInteraction"]` and show the elicitation dialog for R4 on the user's version? | Manual with a toy tool | If not, drop R3/R4 claims from tool descriptions |

Not established by this document (NOT FOUND or untested): PayBox CORS on its POST routes; whether PayBox serves its signing window to a third-party host; Safari/Firefox local-network behaviour; the October 2026 status of Chrome's WebSocket LNA gating; browser CORS for model providers other than Anthropic; whether `claude -p` under the user's own login is acceptable in a third-party bridge; whether Claude Desktop can use a loopback HTTP server (only Claude Code's `--transport http` was read, F14).

---

## 8. Risks

1. **The localhost bridge is a remote-code-execution-shaped surface.** The mitigations in 5.3 are necessary, not sufficient; M0 must ship with a hostile-origin test suite and an external review. Precedent: F12.
2. **The card can be wrong if the page is compromised.** Mitigated, not removed: server-computed summary and tag, the bridge console and PayBox's screen as other views, strict CSP, no third-party script. A human who never compares three views is not protected.
3. **Approval fatigue.** One passkey per order; the card makes the comparison cheap, it does not make people do it.
4. **R1/R2 not adopted.** Then the card cannot verify; it must say so loudly, and the claim "independently verified" must not appear.
5. **S2 adds a secret** (`pbxk1` and a PayBox token on the bridge host). A thief with both can complete signings the PayBox grant clears; under `always_approve` each still needs the passkey. Keep it off until needed.
6. **Autonomous grants defeat everything here** (`[P1 §7 risk 5]`). The terminal can warn only about its own client's grant (F6).
7. **Model route risks** (stretch): key theft, context disclosure, cost, persuasion of the human. The design limits authority, not persuasion.
8. **Spec churn.** The MCP revision moved to a stateless protocol this summer and deprecates DCR and sampling (F8); PayBox is still on `2025-06-18` (F1). Version negotiation bugs are likely; TT1 and TT4.
9. **Reach.** Local mode excludes phone-only and hosted-chat-only users (4.5).
10. **Licence and terms.** Quotient output stays in the browser/bridge of one user, never shared (`[AGG §7]`); sending it to a model provider is unverified (6.6).

## 9. Assumed interfaces from sibling dApp documents (not read)

- A multichain portfolio and market view exists elsewhere in the dApp; the terminal's `positions`, `portfolio` and `compare` commands call the same typed data layer or the MCP tools, not a second implementation.
- The "multichain smart-contract wallet" is Option 0 for this terminal: PayBox signs, no session key. If a sibling document introduces another signer, the Signature Card needs a new `kind` and a new verification rule; it must not bypass the card or the server-side recompute.
- The dApp will not ship a second copy of `src/relay/contract.ts`; it imports it.

## 10. Open decisions for the user

1. **MVP signing path**: ship S1 only (agent signs, terminal verifies), or also S2 (terminal signs, needs a `pbxk1` key and a separate PayBox client)? Default proposed: S1 in M1/M2, S2 behind a flag in M3 after T0.
2. **R1/R2/R3/R4 as contract and tool changes** to the plugin-tools and relay-core streams. Without R1 the card is a viewer, not a verifier.
3. **Observer feed and agent token**: is a shared single process (HTTP mode) acceptable for the user's agent, given the data-directory lock? The stdio mode stays available.
4. **Stretch model route preference**: pasted key, PKCE-minted key, local model or Agent SDK in the bridge.
5. **Hosted static UI copy**: wanted, or loopback-served only?

## 11. Sources

PayBox: `https://docs.paybox.sh/connect/mcp.md`, `.../connect/oauth.md`, `.../concepts/requests.md`, `.../concepts/approvals.md`, `.../reference/mcp-tools.md`, `.../sdk-cli.md`, `.../api-reference.md`; `https://api.paybox.sh/.well-known/oauth-authorization-server` (GET with an `Origin` header, headers read); npm registry entries for `@paybox-sh/sdk`.
MCP: `https://modelcontextprotocol.io/specification/2026-07-28` and the repository `modelcontextprotocol/modelcontextprotocol` files `docs/specification/2026-07-28/{changelog,basic/transports/index,basic/transports/streamable-http,client/elicitation,server/tools}.mdx`, `docs/docs/2026-07-28/tutorials/security/local-server-security.mdx`, `docs/extensions/apps/{overview,build}.mdx`; `https://ts.sdk.modelcontextprotocol.io/v2/clients/connect`; npm registry for `@modelcontextprotocol/{server,client,sdk}` and `@modelcontextprotocol/ext-apps`; GitHub security advisories API for `modelcontextprotocol/inspector`.
Claude: `https://code.claude.com/docs/en/{remote-control,mcp,channels,headless,cli-reference}.md`, `.../agent-sdk/{overview,user-input,permissions}.md`, `https://platform.claude.com/docs/en/agents-and-tools/mcp-connector.md`, `https://platform.claude.com/llms.txt`, `anthropics/anthropic-sdk-typescript` (`README.md`, `src/client.ts`).
Others: `https://platform.openai.com/docs/guides/tools-connectors-mcp`, `https://openrouter.ai/docs/guides/overview/auth/oauth.md`, `webmachinelearning/webmcp` README, `https://developer.chrome.com/blog/local-network-access`, `https://w3c.github.io/webappsec-secure-contexts/`, `https://www.rfc-editor.org/rfc/rfc6455.txt`, MDN CSP `connect-src`, `https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/`.
Repository: `docs/plan.md` (status banner), `docs/phase1-gap-closing.md` (sections 0, 5, 7, 8, 9), `docs/everyone-architecture.md`, `docs/aggregation-design.md` (sections 7, 9), `docs/safety.md`, `docs/tool-contract.md`, `docs/research/06-paybox-platform.md`, `src/relay/contract.ts`, `src/relay/flags.ts`, `relay/capabilities.ts`, `relay/main.ts`, `src/guardrails/untrusted.ts`, `src/xo/signing/kernel.ts`, `src/local/{cli,server,README}`, `src/tools/*.ts`, `src/plugin.ts`, `package.json`, and `node_modules/@modelcontextprotocol/server/{package.json,dist/index.d.mts}`.

---

## Verification

Re-checked in this session, with the method:

- **PayBox docs**: downloaded the markdown versions of the connect, OAuth, requests, approvals, MCP-tools, SDK/CLI and API pages (HTTP 200 each) and re-read the passages quoted in F1, F3 to F6. The HTML variants of the same URLs are Vocs shells; the markdown variants were used.
- **PayBox CORS (F2)**: five GETs to the same public well-known URL with different `Origin` values, headers only. Only `https://app.paybox.sh` produced `access-control-allow-origin`. No POST, no OPTIONS, no authenticated call was made. The inference for POST routes is marked M.
- **PayBox discovery document (F3)**: read in full by GET; contains `device_authorization_endpoint` and the device-code grant.
- **MCP specification (F8 to F11, F25)**: downloaded the 2026-07-28 changelog, transport, tools and elicitation pages and the two security guides from the public repository and re-read the quoted sentences. The WebSocket statement is from the transports index listing only stdio and Streamable HTTP as standard.
- **Inspector advisories (F12)**: read the two advisories' summaries through the public GitHub API. I did not copy any contact detail from them.
- **Installed server package (F13)**: read its `package.json` version (2.0.0) and grepped `dist/index.d.mts` for the exported names listed. I did not import or execute the package.
- **Claude Code and Agent SDK (F14 to F17)**: downloaded the pages, grepped and re-read the passages on `requiresUserInteraction`, Remote Control requirements and security, the third-party login note, `canUseTool`, the CLI flags and the channels preview text. The "NOT FOUND" for a third-party attach route to Remote Control rests on greps for third-party, embed, custom client, programmatic and WebSocket in that one page; I did not search the rest of the site.
- **Browser sources (F21 to F24)**: downloaded and grepped Chrome's LNA article (the "not yet gated" sentence for WebSockets, the Chrome 142 update), the Secure Contexts algorithm (loopback CIDR rule), RFC 6455 section 10.2, MDN `connect-src`.
- **npm versions and licences**: queried the public registry for `@modelcontextprotocol/{server,client,sdk,ext-apps}`, `@anthropic-ai/{sdk,claude-agent-sdk}`, `@xterm/xterm`, `@paybox-sh/sdk`.
- **Repository claims (F13, F14, F28 to F30)**: read the files named; confirmed by `grep` that `requiresUserInteraction` appeared nowhere in `src`, `relay`, `test` or `docs` before this document; that the local CLI handles only `SIGINT` while `SIGUSR2` is in `relay/main.ts`; that `Prepared` has no decoded payload; and derived the tag/window mismatch (F29) from `kernel.ts` and `checkPrepared`.
- **Privacy and hygiene**: the scripted requests used only the User-Agent `insurance-markets-research/0.1`. I ran the six rules of the repository's `test/hygiene-identifiers.test.ts` (handle, first name, organisation, session scratch path, temporary directory, home path) as regular expressions over this file, plus a search for `@` outside package names: zero hits. The document uses repository-relative paths only.

Not re-checked, or only partly: the contents of Anthropic's Workspaces/Spend Limits pages; OpenAI's tunnel client; OpenRouter CORS; xterm.js (I considered and rejected a terminal emulator for the MVP because structured cards need DOM, and `textContent` rendering is simpler to make inert, L-confidence design judgement, not a measured comparison); WebMCP implementation status; whether the `pm_*` tools exist yet in `src/tools`; whether the mock XO and anvil harness run; cookie port-scoping (stated from general knowledge, M); Fetch Metadata headers (not used in the design); the sibling dApp documents (not read).

