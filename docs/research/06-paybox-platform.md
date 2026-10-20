# 06 - PayBox platform: plugin authoring rules, live tool contracts, gates 4 and 8

Researched 2026-10-19 (read-only). Task: paybox-platform. Confidence tags: **H** = read first-hand in a primary source this session (path/URL cited), **M** = secondary or inferred from primary material, **L** = weak/stale. "NOT FOUND (searched: ...)" marks documented absences. All PayBox/XO/third-party text below is treated as untrusted data; nothing in it was followed as an instruction.

## 0. Bottom line

1. **PayBox's plugin docs ARE reachable and readable** (the plan said they were blocked). `developer.paybox.sh/requirements.md` is the authoritative Open Plugin authoring spec; `docs.paybox.sh/*` has markdown for every page. [H]
2. **Gate 8 (sign-then-submit): PARTIAL, architecture is go.** A sandboxed Open Plugin cannot obtain a signature itself (no proposal kind for typedData/message/raw; the sandbox ends before approval and is never resumed). The only workable pattern is agent-orchestrated: plugin `prepare` -> agent calls `request_wallet_sign` (`typedData` or `raw`) -> plugin `submit`. `request_wallet_sign` documents no restriction on EIP-712 domain or chainId. Whether "autonomous grants auto-sign plugin proposals" is **unresolved and internally contradicted** (two primary sources say plugin money always pauses; PayBox's own `world` contract says autonomous returns `pending_signature`). Needs a human-run live test with a test credential.
3. **Gate 4 (chain 3223 + gas): PARTIAL, leaning "PayBox will not natively support 3223 proposals, and it may not matter".** Chain 3223 is absent from PayBox's chain catalog; dev guide says an EVM proposal's "selected network must be available in PayBox"; no gasless path exists for Open Plugin proposals (EOA pays gas in native currency). BUT XO docs (read via xo-docs MCP) say XO on-chain account actions are ERC-4337 UserOperations from the XO smart account (gas sponsored by XO's paymaster) and orders are Kernel-wrapped EIP-712 signatures. Those need only off-chain signatures (`typedData`, `raw`) from the PayBox EVM wallet, not PayBox chain-3223 support. The plan's assumption that `xo_enable_trading`/`xo_redeem` are EOA `io.paybox/transactionProposal`s on 3223 is **likely wrong**.
4. **Bridging to 3223 via PayBox `request_swap`: no evidence it works** (not in catalog; cannot test without a money tool). Treat funding as: XO's own bridge on the source chain (Base/Ethereum/BNB are all in PayBox's catalog) via one-call proposals, subject to gate 6.
5. **Packaging risk (new): the portal's upload/submit window for Chapter 1 closed 2026-10-17 8pm New York.** Public distribution needs manual approval of every version at MoonPay's sole discretion. Whether a non-entrant can upload/submit now is NOT FOUND. This is a schedule blocker for "own Open Plugin".
6. **Plugin guardrails are not a security boundary against an agent holding an `autonomous` wallet grant**: `request_wallet_sign` has no `value_cents`, so any agent can sign arbitrary typed data without the plugin.

## 1. What was reachable (exactly)

All via `curl -sS -m 20 -L` and spot-checked with WebFetch (both worked; no bot challenge seen):

| Host / path | Result |
|---|---|
| `https://docs.paybox.sh/` (+ `/llms.txt`, `/sitemap.xml`) | 200, `text/markdown`. Every page also served as markdown (`/getting-started`, `/concepts/{model,approvals,requests}`, `/connect/{mcp,oauth}`, `/reference/mcp-tools`, `/api-reference`, `/sdk-cli`, `/skill`). Sitemap lists 8 URLs. |
| `https://developer.paybox.sh/` | 200 HTML (hackathon landing; portal UI is behind "Register with PayBox", not readable). `/llms.txt`, `/skill.md`, `/requirements.md`, `/terms`, `/plugin-starter/v1.0.2/**` all 200. `/dashboard` returns the same SPA shell. |
| `https://paybox.sh/` + `/llms.txt` | 200. |
| `https://app.paybox.sh/plugins` | 200 but only an Expo SPA shell ("Loading plugins"); content needs login. I read the public JS bundle as text only (never executed). |
| `https://api.paybox.sh/openapi.json`, `/.well-known/api-catalog` | 200. OpenAPI only covers OAuth/MCP discovery: `/mcp`, `/oauth/{authorize,register,token}`, `/health`. |
| `https://unpkg.com/@paybox-sh/sdk@2.2.0/` | 200: README.md, SKILL.md, `dist/index.d.ts`, `dist/*.js`, package.json. Registry JSON also read. |
| `gh api repos/moonpay/paybox` | **404** (private or invisible to this account). Confirms the plan: official handlers are not readable. |
| `gh api orgs/moonpay/repos` | 4 public repos: `skills`, `paybox-plugin`, `moonpay-demo-integrations`, `devops-challenge`. |

Freshness: SDK 2.2.0 published 2026-10-14; starter release 1.0.2 and docs fetched live 2026-10-19; hackathon dates Oct 16-17 2026. Nothing older than 6 months. [H]

## 2. Open Plugin authoring spec (primary: developer.paybox.sh/requirements.md, "dev guide")

**Format and toolchain**
- "Build a standard TypeScript MCP server, bundle it into one `plugin.mjs`, then upload, configure and test it in the developer portal." [H] The app's own routes call these "open-plugins" (`/api/open-plugins/...`) and the dev guide says "installed Open Plugins" [H], so "Open Plugin" is PayBox's term.
- Starter release **1.0.2**: MCP protocol version **2026-07-28**, Node 24.21.0, pnpm 11.11.0, `@modelcontextprotocol/server` 2.0.0, `zod` 4.4.3, esbuild 0.28.2. stdio server via `serveStdio(createServer, { legacy: "reject" })`. [H, starter files + `manifest.json`]
- Commands: `pnpm install --frozen-lockfile`, `pnpm test` (type-check, **build twice, bytes must be identical**, then conformance), `pnpm build` -> `dist/plugin.mjs`, `pnpm conformance`, `pnpm dev`. `paybox-plugin.json` holds one sample tool name + args. macOS/Linux only (Windows via WSL2). [H]
- Conformance failure codes include `build_not_deterministic`, `startup_failed` ("all package dependencies must be bundled"), `protocol_invalid` (stdout = newline-delimited MCP JSON, `resultType: "complete"`), `tool_catalog_invalid` (unsupported `x-mcp-header`), `limit_exceeded`, `timeout`. Schemas must be self-contained JSON Schema 2020-12 (no remote `$ref`). [H]

**Limits (local checks; hosted calls have the same 10 s budget)** [H]

| Item | Limit |
|---|---|
| Bundle | 10 MiB, UTF-8, named `plugin.mjs` (no source maps / .env / node_modules) |
| Operation duration | **10 s** (startup + discovery + call; keep fetches ~4 s) |
| stdout / stderr per operation | 256 KiB / 16 KiB |
| Tool-list pages / total tools | 16 / 256 |
| Input+output schema per tool | 64 KiB; tool name 128 B; cursor 1 KiB; sample args 64 KiB; result content blocks 128 |
| Plugin call / hosted test / check rate | 1 start per second and 1,000 starts per rolling 24 h per user |
| Transaction validation | 1 active, 30 per hour; each result validated once within 5 min |
| Network hosts / brokered credentials | up to **16 / 16** per plugin |

**Runtime sandbox** [H]
- "Do not rely on memory or disk surviving: every operation uses a fresh sandbox." Tool discovery may run in a fresh process too.
- "Hosted code cannot supply executable UI; PayBox renders its own interface."
- Network: "add only the exact hostnames your tools call; wildcards, redirect chains and arbitrary destinations are not a networking contract." Calls over HTTPS to exact configured hosts. Keep network calls out of module startup/discovery. Methods other than GET/POST for ordinary calls: NOT FOUND (searched dev guide); WebSocket support: NOT FOUND (a WS orderbook feed from inside a plugin is therefore unsupported/unknown).
- Env vars: "Environment variable for non-sensitive `process.env` configuration" (plain text, plugin-wide, set by the plugin **owner** in the portal, not per user).
- Secrets: owner-level **brokered headers** only: portal asks for target hostname + header name + value; PayBox injects the header on requests to that host. "Your plugin makes an ordinary request to that host and does not read the secret from `process.env`." Output containing the literal credential is withheld. **Query-string credentials (e.g. a `?api_key=` RPC URL) cannot be brokered** (only headers are documented).
- Plugins get no user identity: PayBox "does not send [the wallet's] ID to plugin code"; for Solana the agent passes the public `sender`. NOT FOUND (searched dev guide, mcp-tools, SKILL.md): any user ID / session / wallet address injected into the plugin process. For EVM the plugin must receive the owner address as a tool argument.

**Developer portal flow** [H, dev guide]
1. "Register with PayBox" using an existing PayBox account; dev session lasts up to 3 days. An eligibility badge appears "when MoonPay KYC is required" (PayBox email must match MoonPay KYC email); then the submission workspace unlocks. Local build/conformance works anytime.
2. Upload `dist/plugin.mjs`. PayBox auto-discovers tools and runs hosted checks (preflight "never calls a tool or injects brokered credentials", but the module does run at startup/discovery; platform failures retried up to 3 times).
3. Configure hosts, variables, secrets in "Test & configure" / "Variables & Secrets"; "Run checks again" after 30 s.
4. **Test**: "Load tools" -> pick tool -> JSON args -> "Run test" (real network + real brokered credentials; never auto-retried). Transaction proposals shown as data only; **Validate transaction** simulates with a chosen owned wallet (public address only; nothing signed or broadcast).
5. Accept the hackathon T&C and **Submit Project** (one project per person). After submission the plugin "appears under **Unofficial plugins** in your PayBox account; enable it there to test it privately." [H] Uploading alone does not enter the hackathon ("Uploads are saved for private testing").
6. Review/promotion: "Publication to other users requires manual approval of every version." "Owners can update runtime hosts, variables and API credentials without resubmitting code." Installed plugins "keep their code version and use the owner's latest network hosts, variables and secrets on new calls." Existing installs stay on their accepted version until updated. [H]
7. Terms (developer.paybox.sh/terms): the MoonPay Group member "may decline, delay, condition, suspend, remove, or delist any Submission ... at any time, for any reason or for no reason"; listing is "subject to separate agreements and ... review processes, including any security audit, code review, or compliance assessment". "Winners and honorable mentions also enter the PayBox Marketplace ahead of its public opening." [H]
8. Path from Open Plugin to **official** plugin: NOT FOUND (searched dev guide, terms, llms.txt, docs). Official handlers are Rust-side in the private `moonpay/paybox` monorepo (tool descriptions use `WorldBuyOutcomeArgs`-style Rust names), so promotion presumably means MoonPay re-implementing. [M]

**Deadline problem** [H]: "You cannot upload another file, submit or withdraw a version, or delete your entry after the deadline." Chapter 1 ended Sat 2026-10-17 8pm New York; "Late Submissions will not be accepted unless the Chapter Details state otherwise"; the landing page says "A new mission every month" but gives no next date. NOT FOUND (searched developer.paybox.sh home, requirements.md, llms.txt, terms): any post-hackathon general-availability submission path or next Chapter date. Whether an account that never registered can still upload/submit today is unknown. **Consequence: the "own Open Plugin, installable privately" path may be blocked until the next Chapter or an undocumented GA.** Ask MoonPay/PayBox support (support.moonpay.com/en/collections/1437162-paybox).

**Another packaging route**: x402. "An API already wrapped in x402 works inside PayBox without a bespoke integration" (developer.paybox.sh/llms.txt) [H]. See section 9.

## 3. Transaction proposal contract (`io.paybox/transactionProposal`) [H, dev guide + starter `src/paybox.ts`]

Declared inline in the tool's `outputSchema`, returned under `structuredContent`. Never in an `isError` result. `version: "1"`, `expiresAt` whole-second UTC within **five minutes** (starter helpers use 4 min).

| `kind` | Fields | Limits |
|---|---|---|
| `evm` | `chain` `eip155:<id>`, `transaction:{to,value,data}` (value = decimal wei string, data = even-length hex) | **One call only.** Schema `.strict()` (no token/swap/gasless/sponsor/nonce/gas/wallet/signature/RPC fields; "unknown fields are rejected"). Chain regex accepts any `eip155:<uint64>`; calldata <= 120 KiB. |
| `solana` | `chain: "solana:mainnet"`, `transaction:{transactionBase64}` | <= 1,232 bytes, legacy/v0, one signer who is fee payer, no durable nonce, no sponsor. |
| `x402` | `chain` in {`eip155:8453`, `solana:mainnet`}, `request:{url,method GET|POST,body<=64KiB}`, `payment:{asset USDC, maxAmount}` | HTTPS:443, host must be a configured network host, no custom headers/secrets, expiry <= 5 min. |

- Quote: "Return one unsigned call on a supported chain; PayBox constructs and simulates the transaction." and for EVM "the selected network must be available in PayBox." So the schema accepts any chain id syntactically, but **supported-chain gating happens in PayBox**; the exact failure behaviour for an unsupported chain (rejection at validation? at request creation? message?) is NOT FOUND (searched dev guide, mcp-tools, SDK). It must be tested via portal "Validate transaction".
- "The wallet still needs native currency for network fees." EVM proposals "refresh their nonce and recheck execution without raising approved fee limits." [H] => EOA pays gas; no paymaster/sponsor field.
- "V1 accepts one transaction per proposal, with no array of separate approval/swap transactions." Approve-then-act = two proposals, two separate requests, each with its own approval; "wait for confirmation, then obtain a fresh swap quote/proposal". [H]
- PayBox displays "the network, sender, and raw transaction details; EVM also shows the destination and native value in wei. It does not provide a decoded ERC-20 transfer, allowance or swap asset-change summary." Plugin text is untrusted; PayBox "builds its own plan". [H] => users approving an XO funding/approval proposal see raw calldata only.
- Wallet choice: `use_plugin.wallet_id` ("Not sent to plugin code" per live schema); "With one compatible wallet, the field may be omitted; with multiple wallets it is required. A plugin cannot choose between them." [H]
- Idempotency: `use_plugin.invocation_id` UUID, "reuse it only to retrieve that exact call's stored outcome; never retry with a new id after a timeout or ambiguous failure." [H live tool contract]
- The sandbox invocation "ends before approval"; "The plugin is not automatically resumed; an agent may pass the paid response into a subsequent plugin call." (x402 section, same model applies to all proposals). [H]

## 4. `request_wallet_sign` semantics (docs.paybox.sh/reference/mcp-tools + live schema + SDK)

Live tool schema (this session): `{credential_id, intent}`; `intent` is a tagged union on `op`: `message | typedData | transaction | authorization | solanaMessage | solanaTransaction | raw`. **No `chain`, `value_cents` or other policy fields.** [H]

| `op` | Result on success | Notes |
|---|---|---|
| `message` | EIP-191 `{signature:"0x..."}` | |
| `typedData` | EIP-712 `{signature:"0x..."}` | SDK type `TypedDataDefinition` (viem); client signs with `hashTypedData(typedData)`; no domain/chainId allowlist anywhere in the client code. [H, `dist/*.js`] |
| `transaction` | `{serializedTransaction:"0x..."}` ("ready for `eth_sendRawTransaction`") | Caller supplies full EIP-1559 fields (`to,value,data,chainId,gas,maxFeePerGas,maxPriorityFeePerGas,nonce`; SDK `WireTx`). **Signed, not broadcast.** |
| `authorization` | EIP-7702 `{authorization:{...}}` | |
| `raw` | "Signs a pre-computed digest as-is (escape hatch)" | In the SDK the artifact is `{scheme, signature}` and the ECDSA transport result is `{r, s, recovery_id}` (M: you assemble a 65-byte signature yourself). |

- "The chain, destination, and value are read from the intent itself; there are no separate declared fields." [H] Live description: "PayBox never holds the key and returns the signed artifact without broadcasting a wallet-sign transaction." [H]
- **Arbitrary domains/chainIds for typedData?** Nothing in docs, live schema, or SDK restricts them [H absence]. Server-side restriction: NOT FOUND (searched docs.paybox.sh all pages, SDK source, tool descriptions). Docs mention that policy can deny "a chain or merchant not in the grant" (concepts/requests) but never say whether wallet-sign grants carry chain allowlists. `list_credentials` shows only the chain **family** (`evm`/`solana`), and "An EVM MPC wallet shares one address across every `eip155:*` chain" [H]: the same EOA is usable as an owner on any EVM chain.
- **Returns raw signature?** Yes: `typedData` => `{signature: 0x...}`; the SDK's `MoonXEvmSigner.signTypedData` yields a hex signature (65-byte r||s||v presumed, length not stated in docs) [M]. PayBox then needs the signing step to complete before `get_request` shows `output`.
- Lifecycle: submit once, poll `get_request`; `pending_signature` means "Cleared to sign (autonomous, or already approved). The signing window finishes it." Signing happens in an MCP-Apps iframe window or in-process via `@paybox-sh/sdk` with a paired `pbxk1.` key (`paybox connect`); `list_credentials.agent_signer_recorded: false` on this account means the first `pending_signature` will ask the user to connect a signing key. [H] Headless hosts (Claude Code etc.) therefore need the SDK/CLI path.
- Whether the signing window displays EIP-712 contents or only a hash: NOT FOUND. For XO the signed payload is `Kernel(bytes32 hash)` (opaque hash), so approvers may see little. [see 7]
- `value_cents` exists on `request_swap` and on plugin tools like `world_buy_outcome`, not on `request_wallet_sign`, so grant spend policy cannot evaluate an off-chain order signature. [H]

## 5. Gate 4: chain 3223 support, gas, bridging

**Chain catalog (live `discover_tokens`)** [H, 2026-10-19]: `mode=chains` returns 11 entries: Solana, Ethereum (1), Base (8453), Arbitrum (42161), OP (10), Polygon (137), BNB Smart Chain (56), Avalanche (43114), Robinhood (4663), Arc (5042), Hyperliquid (999). Queries `xo`, `XO Network`, `3223` => no XO Network (two unrelated hits: Exorde 2139927552, Xone 3721). `discover_tokens` search with `chain=eip155:3223` returned `network_id: 3223` and an empty token list (no error). The tool says "Mainnet metadata catalog, not a support allowlist ... Signing permissions are unchanged," so absence is evidence, not proof.
- Base, Ethereum, BNB are present => XO's reported bridge source chains are signable/fundable in PayBox. [H presence; XO bridge itself unverified here]

**Does PayBox simulate/sign proposals for chain 3223?** NOT FOUND / unverified. Evidence against: not in catalog; dev guide requires the network "be available in PayBox"; swaps/bridges are routed by MoonX, and Robinhood/Arc/Avalanche/Hyperliquid had to be added individually ("let its live quote determine whether the exact token route is available"). Evidence it may still work for raw signing: `request_wallet_sign` `transaction`/`typedData`/`raw` take chainId from the intent and sign without broadcasting. Behaviour for an unsupported chain on a *proposal*: NOT FOUND. **Test needed** (human, test credential): portal "Validate transaction" with a zero-value `evm` proposal on `eip155:3223`; and a readiness check (see Open questions).

**Gas** [H unless noted]
- Open Plugin EVM proposals: the PayBox EOA pays gas in the chain's native currency; no sponsor/paymaster/UserOp field exists (schema is strict).
- PayBox's official `request_swap` can use "gasless UserOperation envelopes" (docs/concepts/requests) and `x402` handles "EIP-7702 delegated" wallets with auto-undelegate, so gasless exists for the official swap/x402 flows only. SDK: "versioned plans and gasless prepared plans stop with `outcome: "unsupported"`."
- XO side (xo-docs MCP, first-hand): "on-chain calls (approvals, split/merge/redeem) execute as ERC-4337 UserOperations through the XO bundler"; "The XO bundler accepts zero EIP-1559 fees"; "The paymaster allowlists `ConditionalTokens.redeemPositions`, so redemption is gas-sponsored. The smart account does not need a native-token balance." Paymaster address comes from XO onboarding. Mainnet RPC needs a private `api_key` query parameter. Orders are off-chain, no gas.
- => The gasless flow for XO is XO's, and it is not an EOA proposal. A plugin (not PayBox) can post `eth_sendUserOperation` to the bundler host if that host is network-allowlisted and the agent first obtains the owner's raw ECDSA signature over `userOpHash` via `request_wallet_sign` `raw`. The plugin's allowlist then needs `mainnet-bundler.xo.market` (no key in URL); the key-in-query RPC would need a proxy or a plain env var.

**Bridging to 3223 with PayBox swap tooling**: `request_swap` supports `dst_chain` != `src_chain` ("Set a different chain to bridge ... `pending_settlement`") but only through MoonX routes; 3223 is not in the catalog and no doc lists it. Verifying would require calling `request_swap` (money tool, not allowed). Status: unverified, assume **not supported** (M). Recommended funding design: plugin proposals on the source chain (approve proposal, then bridge-call proposal) to XO's documented bridge, or a manual bridge step. `get_buy_link` destinations are Base, Ethereum, Robinhood, Solana only (SDK `BuyLinkArgs`). [H]

**Gate 4 verdict: PARTIAL.** Proposals/simulation on 3223: unverified, likely unsupported. Native PayBox gasless: not available to plugins. XO flows should be designed around off-chain signatures + XO bundler, which sidesteps the question. Bridging via PayBox to 3223: unverified/likely unsupported.

## 6. Gate 8: approval modes and what autonomous grants do

**Modes** [H]: `always_approve` (passkey in the app), `iframe` (confirm in signing window), `paybox` (user completes on PayBox website, "without an agent signing key"), `autonomous` ("acts within the grant"). The `list_credentials` docs name three of them (`always_approve`, `iframe`, `autonomous`); `paybox` appears only in `request_account_change` and the SDK `Grant` type. Both wallets on this account are `autonomous` (one `evm`, one `solana` family); I recorded no addresses or IDs. `agent_signer_recorded` is false.

**Primary evidence on "plugin money always pauses for passkey"**
- docs.paybox.sh/reference/mcp-tools, "Plugin tools" [H]: "plugin **money tools always pause for the user's approval**, even under an autonomous grant."
- `@paybox-sh/sdk@2.2.0/SKILL.md` [H]: "Plugin money always pauses for passkey."
- **Contradicting/qualifying evidence** [H]: live `get_contract(paybox://plugins/world)` for the official plugin: "Approval follows the grant: autonomous returns `pending_signature`, while approval-gated returns `pending_approval`." Also docs/concepts/requests: autonomous wallet signs/swaps "move to `pending_signature`", and concepts/model says sensitive ops "(revealing a raw secret, signing, issuing keys) require a fresh passkey assertion" "Regardless of mode", while concepts/approvals says "no separate proof-of-presence check runs server-side". The docs disagree with themselves.
- Dev guide, Open Plugin proposals: "Review the details and approve when required, then submit." and "PayBox handles wallet selection, policy, approval and signing." No explicit sentence that Open Plugin proposals always need a passkey. Connect docs: "Above-threshold and sensitive operations pause for your passkey" (threshold definition: NOT FOUND).
- Verdict: the claim has two primary sources (so it is not mere hearsay) but is generic prose, is contradicted by the official `world` contract, and is not stated for Open Plugin proposals specifically. **Unresolved. Test with a throwaway credential: run a zero-value `evm` proposal tool through `use_plugin` on an `autonomous` grant and observe `pending_approval` vs `pending_signature`.** The plan must work under both outcomes.

**Sign-then-submit** [H on mechanics, M on feasibility]
- A plugin cannot hold a pending request open: each call is a fresh sandbox, 10 s budget, and "the sandbox invocation ends before approval". There is no proposal kind for typed data/message/raw digests. Therefore a plugin cannot "obtain an off-chain typed-data signature and then continue to an HTTP submit".
- Working pattern: `xo_prepare_*` (returns typedData/digest + human-readable quote + a binding value) -> agent calls `request_wallet_sign` with exactly that intent -> agent calls `xo_submit_*` with the signature. The plugin cannot trust the model to relay faithfully, so `submit` must recompute the expected digest and check `ecrecover(digest, sig) == owner` (and bind quote_id) before POSTing. State between prepare and submit must travel in tool args (no persistence) or live in an owner-run backend on an allowlisted host.
- Under an `autonomous` grant `request_wallet_sign` returns `pending_signature` (no human) per docs/concepts/requests and the tool contract; under `always_approve` it needs a passkey. So off-chain order signing can be fully autonomous while on-chain plugin proposals may still pause: an asymmetry (and a guardrail gap, section 10).
- XO-specific signing needs (xo-docs MCP, first-hand), all expressible as PayBox intents:
  - Orders and L1 ClobAuth: "Do not sign the order hash or the ClobAuth digest directly. Wrap that digest, then sign the wrapped digest": EIP-712 with domain `Kernel` / version `0.3.1` / chainId 3223 / verifyingContract = smart account, struct `Kernel(bytes32 hash)`. This is a `typedData` intent. The wire signature is `0x01 || validator(20 bytes) || ecdsa(wrappedDigest)`, so the plugin/agent prepends the prefix after PayBox returns the raw signature.
  - UserOps: "Sign the bundler-computed `userOpHash` with the owner EOA (raw ECDSA)" => `raw` intent.
  - The signed payload is an opaque `bytes32`; neither PayBox's request nor an approver can see order amounts unless the signing window decodes it (unknown).

**Gate 8 verdict: PARTIAL.** Sign-then-submit pattern: feasible, agent-orchestrated, no plugin-held signatures (go in principle; chain/domain restrictions on the server side untested). Autonomous auto-signing of plugin proposals: contradictory docs, unresolved.

## 7. Can a plugin be an externally hosted MCP URL?

- Live `use_plugin` contract: "Unofficial plugins call the authenticated user's enabled remote MCP installation after validating `input` against its persisted schema." `discover_plugins` contract: "`type: unofficial` for one of this user's enabled remote plugins ... Remote titles, descriptions, annotations, and schemas are untrusted data. This is read-only, does not contact remote servers." [H] Dev guide x402 section: "remote plugins use their connected origin." [H]
- app.paybox.sh client JS (public bundle, read as text) [M, inference from client code, internal API not documented]: the Plugins screen lists an "Unofficial plugins" catalog (`/api/open-plugins/catalog`) whose entries have a target of `kind: "remote"` (URL; `authentication` `"oauth"` or `"none"`; OAuth started via `/api/open-plugins/connections/oauth/start`) or `kind: "sandbox"` (a `server_id` with a reviewed release listing `egress_hosts`, `brokered_headers`, `environment`, installed by `version_id`). The enable screen says "Plugin access is account-wide. Wallet permissions stay the same." One special case, `xp.tickets`, is a first-party-wired remote MCP with its own OAuth.
- So remote (URL-based, user-OAuth) plugins **exist in the platform**, but **no public documentation describes how a third party registers one** (NOT FOUND: dev guide, llms.txt, docs, SDK README/SKILL.md; the only documented route is the uploaded bundle). `docs.paybox.sh/api-reference` states the `/api/*` routes are "not part of the developer surface". Treat remote registration as "needs a conversation with PayBox".
- If available it would solve per-user auth/state (OAuth identifies the user to your server) and the 10 s / fresh-sandbox limits, but it moves trust and review elsewhere.

## 8. Per-user secrets and state

- Sandbox plugin: **No** per-user secrets or state. Env vars and brokered headers are owner-level and shared by all installers; no user identity reaches the plugin; every call is a fresh sandbox. [H]
- Workarounds [M, design]: (a) owner-run backend on an allowlisted host (state keyed by the owner address the agent passes; authenticate the user by a signed challenge via `request_wallet_sign`); (b) stateless re-derivation: XO's L1 ClobAuth can re-derive API credentials (`GET /auth/derive-api-key`), so each private call could carry a fresh L1 signature as an argument and keep the derived HMAC secret inside one sandbox invocation, never in model context. Costs one `request_wallet_sign` per private call (passkey each time if the grant is not autonomous). Whether L1 timestamps tolerate that latency: NOT FOUND here (XO docs only state the +/-30 s window for L2).
- Passing HMAC secrets as tool args would put them in model context: reject.
- Remote OAuth plugin: per-user auth possible in principle (section 7), registration undocumented.

## 9. x402 listing and monetising an aggregation signal service

**How PayBox surfaces services** [H]: live `discover_services` "across the Coinbase Bazaar and pay.sh x402 catalogs"; docs: "By default, PayBox returns services with recent usage, at least 10 unique payers in the last 30 days, and a supported x402 rail." A `raw` flag (uncurated) exists server-side (a call with a string `"true"` was rejected with "expected a boolean"; the harness schema does not expose a boolean `raw`, so it was not usable). Curated queries for `trueo` and `xo market` returned nothing (curated_empty / no XO). Rails: Base USDC and Solana USDC for plugins; discovery listings also show Polygon/Arbitrum/Avalanche/others from the Bazaar.

**Ways to get a paid service in front of PayBox agents**
1. **x402 Bazaar** (Base etc.): declare the `bazaar` extension on routes; facilitators that support it catalog the service after payments are processed ("The discovery info was validated and successfully cataloged" status via `EXTENSION-RESPONSES`). CDP facilitator listing is described as automatic when enabled. PayBox's curation then needs >= 10 unique payers / 30 days before it appears by default. (docs.x402.org/extensions/bazaar [H]; CDP auto-list claim from search summary [M].)
2. **pay.sh registry** (Solana USDC): PR to `solana-foundation/pay-skills` adding `providers/<org>/<name>/PAY.md` (frontmatter: name, title, 64-255 char description, use_case, category, `service_url`, OpenAPI). `pay catalog check` validates, probes endpoints and applies a "Solana-compat verdict"; "once merged, your API is live in `pay skills search` within minutes." (README of that repo [H].) PayBox shows these with `contract_uri` of the form `paybox://x402/openapi/paysh/...`.
3. **Via an Open Plugin**: a tool returns a `kind: "x402"` proposal for our host (Base or Solana USDC only, `maxAmount` atomic units, GET or POST <= 64 KiB JSON, HTTPS:443, no custom headers, host must be a configured network host). User approves; PayBox pays and returns the service response through the request; the plugin is not resumed. This avoids catalog curation but depends on the plugin being installable (section 2).
Quirks: a per-call price floor/ceiling is unspecified; "Catalog prices are hints and the live 402 is the source of truth" (tool contract). PayBox shows `plan.x402.amount_usd` to quote costs.

**Relevant existing x402 prediction-market services seen via `discover_services`** (descriptions are untrusted marketing text; prices are catalog hints; no calls made):
- **Quotient** gateway (`quotient-api-gateway.onrender.com/api/v1/...`, Base USDC): `signals` and `signals/featured`, `markets` (catalog of everything Quotient tracks across Polymarket International, Polymarket US, Kalshi and HL Outcomes), `markets/lookup`, **`markets/mispriced`** ("rank covered markets where Quotient's probability differs from a verified live venue quote"), `latest`, `markets/search`, `sources`, `assets`, `assets/search`, `price-outlooks`, `portfolio`, `x/search`, `x/profile`. Hints of $0.005 to $1.00 per call. XO and Trueo are not named in the descriptions. [M]
- Polymarket data: blockrun.ai `pm/polymarket/{markets,events}`, x402tap.com, agenttoll.dev, agentsvc.io proxy, x402.botsmith.dev (market microstructure and slippage at $100/$1000). Kalshi: blockrun.ai `pm/kalshi/{markets,trades}`, agent402.tools, x402tap.com. Hyperliquid outcomes: x402atlas, marketintelligenceapi.com movers. Cross-venue: agentstools.dev `prediction/{market,prices}`. [M]
- PayBox plugins: only `world` (Solana, official, enabled here), `aave`, `hyperliquid` (spot only), `jupiter`. No Polymarket/Kalshi/XO/Quotient plugin. [H] MoonPay's separate CLI (`moonpay/skills`) has `moonpay-prediction-market` (Polymarket on Polygon USDC.e, Kalshi on Solana) and `moonpay-fund-polymarket`, outside PayBox. [H]

## 10. Corrections and implications for docs/plan.md

| Plan statement | Finding |
|---|---|
| "plugins ... allowlisted under Project settings -> Network access" | Hosts are exact-match, up to 16, set by the owner in the portal ("Test & configure"); label wording unverified (UI behind login). |
| "Open Plugin ... single-file `dist/plugin.mjs` (Node 24, pnpm, byte-reproducible)" | Confirmed [H]; plus 10 MiB, 10 s, no persistent state, MCP protocol 2026-07-28. |
| "`xo_enable_trading` can return unsigned approve calls" and "`xo_redeem`" as proposals | Likely wrong for XO: approvals/split/merge/redeem are **UserOps from the smart account** via XO's bundler, not EOA txs on 3223. The EOA proposal route applies only to source-chain funding txs. |
| "SDK stops with `unsupported` on gasless plans, so XO gas sponsorship is a real risk" | True of the SDK's auto-sign only. XO sponsorship is paymaster-based on XO's bundler and needs no PayBox gasless support. Real risk is elsewhere (signature primitives, approvals, chain policy). |
| "Plugin-enforced caps hold even when a grant is autonomous" | Only for what the plugin prepares/submits. An agent can call `request_wallet_sign` (no `value_cents`), `request_transfer`, `request_swap` directly under an autonomous grant. The real boundary is PayBox grant policy plus XO's server-side checks. |
| "Quote-before-trade; `xo_submit_order` re-verifies the signed typed data equals the quote" | Right idea and necessary: recompute the Kernel-wrapped digest and ecrecover the signature in `submit`. Stateless sandbox means quote state must be re-derivable or kept in an owner backend. |
| "Per-user secrets: env vars are plugin-wide" | Confirmed: owner-level only, header-only brokering, no user identity. |
| "Marketplace listing is not publicly open yet" | Confirmed; additionally Chapter 1 submission closed 2026-10-17 and distribution is at MoonPay's sole discretion. |
| "`world` tool text says autonomous grants return `pending_signature`; docs say plugin money always pauses" | Both verified verbatim; they conflict; see section 6. |

**Design implications**
1. Treat PayBox as a **signature oracle plus proposal executor**: build XO trading around `typedData`/`raw` signing with plugin-side hash recomputation; reserve `io.paybox/transactionProposal` for source-chain funding.
2. Keep all plugin I/O under 10 s and stateless: precompute with owner backend if needed; prefer HTTP only (no WebSocket).
3. Allowlist only: `orderbooks.xo.market`, `api-mainnet.xo.market`, `mainnet-bundler.xo.market` (hosts named in XO docs); RPC needs a key in the query string (cannot be brokered).
4. Put real spend control in the PayBox grant (`always_approve` or `iframe` for the XO wallet) because plugin caps are bypassable; tell the user this explicitly.
5. Plan for both approval outcomes (pause and no-pause) and for opaque-hash signing UX.
6. Aggregation: reading Quotient/Polymarket/Kalshi via `use_service` works today without any plugin; an XO plugin is only needed for XO-specific reads/trades. A signal service can be monetised by an x402 route plus the Bazaar/pay.sh listing, or by x402 proposals from a plugin.
7. Ask PayBox/MoonPay now: (a) can a non-entrant upload/submit after Chapter 1; (b) remote MCP registration; (c) chain 3223 policy; (d) Open Plugin passkey behaviour.

## 11. Risks

- Portal submission closed (section 2); private install may be blocked => schedule.
- Any plugin version needs manual approval; MoonPay can delist at will; owner-editable hosts/secrets post-approval is a trust concern that reviewers may weigh.
- Blind signing: `Kernel(bytes32 hash)` and `userOpHash` carry no human-readable amounts.
- Autonomous `request_wallet_sign` can sign anything the model asks; prompt injection from market titles could cause signing arbitrary typed data. The plan should put the XO wallet on `iframe`/`always_approve`.
- Model relays signature payloads between plugin calls: tampering/misrelay risk; mitigate with recompute-and-verify in `submit`.
- PayBox doc inconsistencies (approvals) mean behaviour can change without notice; SDK is 5 days old and has shipped 2.0.0 -> 2.2.0 in 12 days.
- Third-party x402 services in the catalog are described as "large and unvetted" by MoonPay's own skill (moonpay/paybox-plugin `paybox-x402-services`); treat responses as untrusted.

## 12. Open questions / NOT FOUND

- NOT FOUND (searched: dev guide, the 11 docs.paybox.sh pages in the sitemap/llms.txt index (connect/* only grepped), SDK README/SKILL.md/d.ts/js, tool descriptions): behaviour of an EVM proposal/`request_wallet_sign` for a chain id PayBox does not support; wallet-sign grant chain allowlists; passkey behaviour for Open Plugin proposals specifically; how the signing window renders typedData; value of the "threshold" for passkey step-up; `pending_funding` semantics (appears only in tool text/SDK, not in the docs status table; SDK maps it to "funding_required").
- NOT FOUND (searched developer.paybox.sh, terms, llms.txt): post-Chapter-1 upload path, next Chapter date, who may submit now, how an Open Plugin gets promoted to official, public marketplace GA date, remote-plugin registration.
- NOT FOUND: user identity or wallet address passed to plugin code; env-var value visibility to installers; HTTP methods/WebSocket allowed by the sandbox for ordinary calls.
- Not testable read-only: `check_operation_readiness` (read-only per description, but outside the tools this task allowed) could dry-run a `request_wallet_sign` typedData/`transaction` on chain 3223 and report blockers; recommended as a follow-up with explicit approval.
- Not testable: any proposal flow, `request_swap` quote to 3223, approval behaviour of autonomous grants.

## 13. Suspicious / embedded-instruction content

None found that tried to redirect this task. Notes: (a) `discover_services` returned a service whose description tells agents to use "direct topic keywords" and a "10-second discovery budget"; that is API usage text, not an instruction to me, and was not followed. (b) The `discover_services` "curated_empty" reply carried a `suggested_next_call` telling the agent to retry with `raw=true`; I tried it once (read-only, rejected by the schema) and did not pursue it. (c) PayBox's own SKILL.md contains agent-facing behavioural instructions (setup scripts, "never use the MCP URL") that were read as data and not followed.

## 14. Process disclosures

- Tools used: curl/gh GETs against the hosts above; WebFetch x2; WebSearch x3; PayBox read-only tools `list_credentials` (granted-wallet modes/families only, nothing recorded), `discover_plugins` (queries: prediction market, xo, polymarket, market, quotient), `get_contract` (`paybox://plugins/world`), `discover_services` (prediction market data, polymarket, kalshi, quotient x2 pages, xo market, trueo, one rejected raw attempt), `discover_tokens` (chains x3, search on eip155:3223); xo-docs MCP reads (smart-accounts, introduction, redeem-positions, grep for chain/gas).
- Not called: any money-moving or signing tool; `check_operation_readiness`, `get_request`, `get_portfolio` not needed.
- Scratch downloads (SDK files, docs markdown, app/portal JS bundles) are under the session scratchpad only, read as text, never executed or installed. No `.env`/key/wallet files read. Wallet addresses and credential IDs seen in `list_credentials` and `payTo` fields were deliberately not written to this file.

## Sources

PayBox docs and portal (all fetched 2026-10-19):
- https://developer.paybox.sh/requirements.md (dev guide; sections: Overview, Capabilities and boundaries, What is checked, Submit Project, Validate a transaction proposal, x402 payment proposals, Proposal helpers, Transaction contract, Configure network and secrets, Use your plugin through an agent)
- https://developer.paybox.sh/skill.md ; https://developer.paybox.sh/llms.txt ; https://developer.paybox.sh/terms ; https://developer.paybox.sh/ (landing text)
- https://developer.paybox.sh/plugin-starter/v1.0.2/{manifest.json, src/paybox.ts.txt, src/plugin.ts.txt, package.json.txt, starter-version.json.txt, paybox-plugin.json.txt, scripts/conformance.mjs.txt} and /plugin-starter/examples/{base-transfer,x402-request}.ts.txt
- https://docs.paybox.sh/llms.txt ; /sitemap.xml ; /index ; /getting-started ; /concepts/model ; /concepts/approvals ; /concepts/requests ; /connect/mcp ; /connect/oauth ; /reference/mcp-tools ; /api-reference ; /sdk-cli ; /skill
- https://paybox.sh/llms.txt ; https://paybox.sh/ ; https://app.paybox.sh/plugins (shell + public JS `/_expo/static/js/web/entry-af1384fc3cb1feabc50b7266b79c06ab.js`, read as text) ; https://api.paybox.sh/openapi.json ; https://api.paybox.sh/.well-known/api-catalog
- https://unpkg.com/@paybox-sh/sdk@2.2.0/{README.md, SKILL.md, dist/index.d.ts, dist/chunk-DWDC6W5P.js, package.json} ; https://registry.npmjs.org/@paybox-sh/sdk (publish dates)
- GitHub (gh api, read-only): moonpay/paybox (404), moonpay org repo list, moonpay/paybox-plugin (README.md, .grok-plugin/plugin.json, .mcp.json, skills/paybox-x402-services/SKILL.md), moonpay/skills (skills/moonpay-prediction-market/SKILL.md, moonpay-fund-polymarket/SKILL.md), solana-foundation/pay-skills README.md
- x402 listing: https://docs.x402.org/extensions/bazaar ; https://pay.sh/llms.txt ; https://pay.sh/docs/building-with-pay/yaml-specification/index.md
- Live PayBox MCP tool contracts (this session): `use_plugin`, `discover_plugins`, `get_contract`, `request_wallet_sign`, `request_swap`, `discover_tokens`, `discover_services`, `list_credentials`, `get_request`, `get_portfolio`, `check_operation_readiness` (schemas read; only the read-only discovery tools were called)
- XO docs via xo-docs MCP (docs.xo.market): /guides/smart-accounts, /documentation/introduction, /guides/redeem-positions

Key verbatim quotes (each <= 25 words):
- "Plugins may read APIs and propose transactions; PayBox handles wallet selection, policy, approval and signing." (dev guide, Overview)
- "Do not rely on memory or disk surviving: every operation uses a fresh sandbox." (dev guide)
- "Return one unsigned call on a supported chain; PayBox constructs and simulates the transaction." (dev guide)
- "Publication to other users requires manual approval of every version." (dev guide)
- "You cannot upload another file, submit or withdraw a version, or delete your entry after the deadline." (dev guide)
- "plugin money tools always pause for the user's approval, even under an autonomous grant." (docs.paybox.sh/reference/mcp-tools)
- "Plugin money always pauses for passkey." (@paybox-sh/sdk@2.2.0 SKILL.md)
- "Approval follows the grant: autonomous returns `pending_signature`, while approval-gated returns `pending_approval`." (live world contract)
- "Unofficial plugins call the authenticated user's enabled remote MCP installation" (live `use_plugin` description)
- "Mainnet metadata catalog, not a support allowlist." (live `discover_tokens` notice)
- "The chain, destination, and value are read from the intent itself; there are no separate declared fields." (docs, request_wallet_sign)
- "at least 10 unique payers in the last 30 days" (docs, discover_services)
- "on-chain calls (approvals, split/merge/redeem) execute as ERC-4337 UserOperations through the XO bundler" (docs.xo.market introduction)
- "Do not sign the order hash or the ClobAuth digest directly. Wrap that digest, then sign the wrapped digest" (docs.xo.market smart-accounts)

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Method: re-downloaded the primary sources to the scratchpad (dev guide `requirements.md`, starter `paybox.ts`/`manifest.json`/`package.json`, `docs.paybox.sh` concepts + `reference/mcp-tools` + `sdk-cli`, `developer.paybox.sh` landing/terms/llms.txt/skill.md, `@paybox-sh/sdk@2.2.0` README/SKILL.md/d.ts/dist, npm registry JSON, app.paybox.sh entry JS read as text); re-ran the read-only PayBox calls `discover_tokens` (chains, plus search on 3223 and a bogus chain), `discover_plugins` (prediction market, market, polymarket, kalshi, quotient, xo, trueo), `get_contract paybox://plugins/world`, `discover_services` (quotient x4, trueo, xo, kalshi); re-read the XO docs via the xo-docs MCP. No money-moving or signing tool was called; `list_credentials` and `check_operation_readiness` were deliberately not called (not in this task's allowed set), so those two items are not independently re-tested. No secrets or wallet addresses found in this file (scan for hex addresses, keys, UUIDs, emails: clean; `pbxk1.` appears only as a key-prefix name; the account-mode remark in section 6 is metadata without IDs).

Result: the body of the notes is accurate. Most H claims reproduced verbatim. Items below are the ones that were corrected, softened, or could not be independently confirmed.

### Confirmed (re-derived from primary source, no change)
- Dev guide is the authoring spec; starter 1.0.2 pins protocol 2026-07-28, Node 24.21.0, pnpm 11.11.0, `@modelcontextprotocol/server` 2.0.0, zod 4.4.3, esbuild 0.28.2; `pnpm test` "Type-checks, builds twice, requires identical bytes, then runs conformance." [H]
- Limits table (10 MiB, 10 s, 256 KiB / 16 KiB, 16 pages / 256 tools, 64 KiB schema, 128 B name, 1 KiB cursor, 128 content blocks, 1 start/s and 1,000 per rolling 24 h, 16 hosts / 16 brokered credentials, validation 1 active + 30/h, each result validated once within 5 min). [H]
- Fresh sandbox per operation; exact hostnames, "wildcards" not a contract; env vars non-sensitive, secrets are host-scoped brokered headers; "PayBox ... does not send its ID to plugin code". [H]
- `io.paybox/transactionProposal`: starter `paybox.ts` has `.strict()` on every kind, EVM chain regex `^eip155:(0|[1-9][0-9]*)$` plus a `< 2^64` check, expiry within 300 s, x402 chain limited to `eip155:8453` / `solana:mainnet`; dev guide: "One call only; the selected network must be available in PayBox." No sponsor/gasless/array fields. [H]
- Chapter 1 ended Sat 2026-10-17 8pm New York; "You cannot upload another file, submit or withdraw a version, or delete your entry after the deadline." Terms: MoonPay Group member "may decline, delay, condition, suspend, remove, or delist any Submission ... for any reason or for no reason"; listing subject to "security audit, code review, or compliance assessment". [H]
- PayBox chain catalog: 11 entries re-listed (Solana, Ethereum 1, Base 8453, Arbitrum 42161, OP 10, Polygon 137, BNB 56, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999). Query `xo` returns only Exorde (2139927552) and Xone (3721); query `3223` returns 0. Notice text "Mainnet metadata catalog, not a support allowlist" reproduced. [H]
- "Plugin money always pauses" appears verbatim in `docs.paybox.sh/reference/mcp-tools` ("plugin money tools always pause for the user's approval, even under an autonomous grant") and `@paybox-sh/sdk@2.2.0` SKILL.md line 360 ("Plugin money always pauses for passkey."); live `get_contract world` says on `world_buy_outcome`, `world_change_position` and `world_redeem`: "Approval follows the grant: autonomous returns `pending_signature`, while approval-gated returns `pending_approval`." Contradiction is real; dev guide says only "approve when required". [H]
- `request_wallet_sign` live schema is exactly `{credential_id, intent}`; ops message/typedData/transaction/authorization/solanaMessage/solanaTransaction/raw; docs: "The chain, destination, and value are read from the intent itself". `request_swap`, `world_*` carry `value_cents`; `request_wallet_sign` does not. SDK signing code uses `hashTypedData(typedData)` with no domain/chainId filtering; `chainId` appears only when serialising an EIP-1559 tx. [H]
- SDK 2.2.0: published 2026-10-14T20:01Z, Apache-2.0, 2.0.0 was 2026-10-02 (12 days); README: "Unknown formats, versioned plans and gasless prepared plans stop with `outcome: "unsupported"`." `gh api repos/moonpay/paybox` is 404; org lists 4 public repos; `moonpay/paybox-plugin` README is a client-side connector + 3 skills. [H]
- XO docs: UserOps through `https://mainnet-bundler.xo.market/`, EntryPoint v0.7, "The XO bundler accepts zero EIP-1559 fees", owner signs bundler-computed `userOpHash` (raw ECDSA); orders/ClobAuth wrapped in `Kernel(bytes32 hash)` domain name "Kernel", version "0.3.1", chainId 3223, verifyingContract = smart account; wire signature `0x01 || validator(20) || ecdsa(wrappedDigest)`; hosts `orderbooks.xo.market`, `api-mainnet.xo.market`, bundler; RPC needs a private `api_key` query parameter. Also: "Only XO smart-account orders (`signatureType = 3`) are accepted ... Direct EOA orders ... not currently supported." [H]
- Plugin catalog: only `world`, `aave`, `hyperliquid` ("Browse Hyperliquid spot markets"), `jupiter`; queries polymarket / kalshi / quotient / xo / trueo return no plugins. [H]
- x402 services: Quotient gateway endpoints present on Base USDC at 5000 atomic ($0.005: markets, markets/lookup, sources, signals/featured), 10000 ($0.01: signals, price-outlooks), 20000 ($0.02: markets/mispriced, latest), 1000000 ($1.00: x/profile); Polymarket and Kalshi data from several vendors; `trueo` returns `curated_empty`; no XO service. Bazaar needs the `bazaar` extension and facilitator cataloging; pay.sh listing is a PR (PAY.md, `pay catalog check`); PayBox default curation "at least 10 unique payers in the last 30 days". [H for presence, M for descriptions (untrusted vendor text)]
- `discover_services` `raw` boolean is documented ("Debug escape hatch") but absent from this connector's tool schema (properties: cursor, limit, network, query), so uncurated results could not be fetched. [H]

### Corrected / softened
1. **"XO's documented bridge" and "XO's reported bridge source chains: Base/Ethereum/BNB" (sections 5, 10; gate 4 answer; design implication 1) are not supported by XO docs.** docs.xo.market has no bridge contract, ABI or deposit/bridge endpoint (searched `rg -i "bridge|deposit|funding"` over `/api-reference`, `/data-api-reference`, `/openapi`: zero hits). Funding is provider-mediated and described only in `/product/accounts/deposit`: (a) "Connect an external EVM or Solana wallet ... XO obtains a quote, transfers through the funding provider"; (b) send "a supported asset on the selected network" to a deposit address; (c) cash. Supported networks are "shown in the withdrawal flow itself" (withdraw) / the app, not enumerated in docs. Corrected statement: PayBox has Base/Ethereum/BNB in its catalog, but whether XO accepts deposits from them, and whether the deposit address or funding-provider quote is obtainable programmatically, is NOT FOUND (searched: xo-docs `/documentation`, `/guides`, `/product/accounts`, both OpenAPI specs). A plain ERC-20 transfer to a provider-issued deposit address is the only route the docs imply; "approve proposal then bridge-call proposal" has no source. Gate 6 owner should not inherit this sentence.
2. **XO gas sponsorship scope.** Facts item "XO paymaster sponsors; zero fees accepted" over-generalises. Docs sponsor only `ConditionalTokens.redeemPositions` ("The paymaster allowlists `ConditionalTokens.redeemPositions`, so redemption is gas-sponsored"). Intro says approvals/split/merge are also UserOperations, but who pays gas for those is NOT FOUND. The notes body (section 5, open questions) already hedges correctly; the structured summary does not.
3. **Next-Chapter / post-hackathon path ("NOT FOUND ... next Chapter date") is partly answerable.** Landing page: "Every month brings a new mission and new prize pool ... Miss this one and there's another next month." llms.txt: "one mission every full moon"; terms: "Each Chapter's opening date and submission deadline will be stated in the applicable Chapter Details." So a recurring series is promised (schedule blocker is "until the next Chapter", plausibly about a month, not indefinite), but no date is published and nothing addresses non-entrants or a general-availability upload path. Section 2 wrote "A new mission every month" without the llms.txt and terms context. Whether a non-entrant can upload now remains NOT FOUND (re-searched: requirements.md, skill.md, terms, llms.txt, landing text, two web searches).
4. **"Off-chain order signing can be fully autonomous" (section 6, last bullet of sign-then-submit) is stated more firmly than the evidence.** Supporting: mcp-tools ("`pending_signature` — autonomous: the signing window can sign right away") and sdk-cli ("operation clears immediately under an autonomous grant" when a `pbxk1.` key is configured). Against: `docs.paybox.sh/concepts/model` says "Regardless of mode, **sensitive operations** (revealing a raw secret, signing, issuing keys) require a fresh passkey assertion", and getting-started says "Above-threshold and sensitive operations always pause for a **passkey**" (threshold undefined, NOT FOUND). Treat as unresolved for `request_wallet_sign`, same as for plugin proposals.
5. **"No user/wallet identity is sent to plugin code" (facts item, tagged H) is broader than the source.** The dev guide only says PayBox "does not send its [the wallet's] ID to plugin code" and that Solana senders arrive as a tool argument. Whether any other user/session identity is injected is undocumented (the notes list it under NOT FOUND, which is the right framing). Downgrade the summary fact to M for anything beyond the wallet ID.
6. **discover_tokens on an unknown chain is non-diagnostic.** `search` with `chain=eip155:3223` returns `network_id: 3223`, `tokens: []`, no error (as noted), but `chain=eip155:999999` returns the identical shape. So that response says nothing for or against PayBox support of 3223; only the `chains` catalog absence (itself "not a support allowlist") and the dev-guide wording count.
7. **Minor: network-allowlist label.** Section 10 says the plan's "Project settings -> Network access" wording is unverified. A third-party hackathon plugin README surfaced in web search (ARCANUM on glama.ai, search-result summary only, not fetched) uses exactly "Project settings -> Network access", while the dev guide says "Test & configure". Likely two UI generations; M, low importance.
8. **Remote-plugin registration (M claim)** re-checked in app JS: `listUnofficialPlugins` reads `/api/open-plugins/catalog`; the enable action calls `createUnofficialPlugin(t.url)` with the URL taken from the catalog entry (`kind: "remote"`), so it is catalog-driven, not a free-form user URL box. How entries reach the catalog is still NOT FOUND. Verdict unchanged (M).

### Unverifiable by this verifier (left as the researcher wrote them)
- Account-specific remarks (both granted wallets `autonomous`, `agent_signer_recorded: false`): needs `list_credentials`, not in this task's allowed set; not load-bearing.
- Behaviour of an EVM proposal or `request_wallet_sign` for chain 3223 (unsupported-chain handling), grant chain policy, and how the signing window renders typed data / raw digests: no primary source says; would need `check_operation_readiness` with a credential or a portal "Validate transaction" run. Note one extra data point: `docs.paybox.sh/concepts/requests` lists "a chain or merchant not in the grant" as a deny reason, and for `typedData` the only chain PayBox can read from the intent is `domain.chainId`, so a 3223 denial is plausible (not evidenced). The notes' "untested" framing is right.
- `request_swap` bridging to 3223: not testable without a money tool; the live description names only Robinhood 4663, Arc 5042, Avalanche 43114, Hyperliquid 999 as the recently added EVM chains.

### NOT FOUND claims re-searched with different keywords (all stand)
- Unsupported-chain behaviour: grepped dev guide, mcp-tools, concepts/*, connect/*, sdk-cli, SDK README/d.ts/js for `unsupported`, `not supported`, `allowlist`, `supported chain`; only token-pair "unsupported" and "supported chain" wording found.
- Passkey "threshold" definition and `pending_funding` semantics (README: non-signing response, `reason: "funding_required"`): no numeric/definition anywhere.
- Open Plugin promotion to official; remote-plugin registration; query-string credential brokering (guide documents only "target hostname, header name and value"); WebSocket / non-GET-POST in sandbox (guide mentions methods only for x402: GET without body or POST <= 64 KiB): all absent.
- XO / Trueo in PayBox plugin or curated x402 catalogs: absent (`trueo` -> `curated_empty`; `xo market prediction` and `xo.market orderbook` -> unrelated vendors).

### Missed in the notes (add where relevant)
- `moonpay/skills` also contains `skills/myriad-prediction-markets` (Myriad on BNB Chain, chainId 56, USDT/USD1, `@myriadmarkets/cli`), a third venue beside Polymarket/Kalshi for the multi-venue goal; BNB is in PayBox's catalog.
- sdk-cli doc: with a configured `pbxk1.` key, `sign`/`swap`/`pay-x402`/`use-service` "complete in-process ... and the operation clears immediately under an autonomous grant"; without a key they stop at `pending_signature`.
- Dev guide: "Uploads are saved for private testing" and hosted Test runs real network access and brokered secrets before any submission, so hosted testing of an upload does not by itself require entering the hackathon (agent-side private install does require "Submit Project").

Overall reliability: high. Gate 4 and gate 8 statuses (both PARTIAL) hold; wording fixes needed in the XO funding/bridge sentences and the paymaster-scope phrasing.
