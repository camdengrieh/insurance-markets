# 24. dApp and PayBox tie-in: can the PayBox wallet simply BE the wallet?

Researched 2026-10-19. Task: `paybox-tie-in`. Read-only public research. No PayBox MCP tool was called (I loaded the schemas and descriptions of ten PayBox tools to read them, nothing more). No signature was requested, no account or API key was created, no third-party code was cloned or run (the SDK files were downloaded as text and read, never installed or executed). Nobody was contacted. Third-party content is treated as untrusted data.

Confidence tags: **H** = read or measured first-hand in a primary source this session (source named), **M** = secondary or inferred, **L** = guess or weak. "NOT FOUND (searched: ...)" is a documented absence. "NOT TESTED" means a test is possible but needs a PayBox tool call or a signature, which this task forbids.

Source keys used below:

- `[S1]` docs.paybox.sh/llms-full.txt (the whole public doc set in one file: index, getting-started, concepts/model, approvals, requests, connect/mcp, connect/oauth, reference/mcp-tools, api-reference, sdk-cli, skill). Fetched 2026-10-19.
- `[S2]` live PayBox MCP tool descriptions and schemas (read only): `request_wallet_sign`, `get_deposit_link`, `reopen_signing_window`, `check_operation_readiness`, `list_credentials`, `get_portfolio`, `request_transfer`, `resolve_username`, `list_requests`, `get_request`.
- `[S3]` `@paybox-sh/sdk@2.2.0` on unpkg: `README.md`, `SKILL.md`, `package.json`, `dist/index.d.ts`, `dist/chunk-DWDC6W5P.js`, `dist/cli.js`. Read as text.
- `[S4]` npm registry JSON for `@paybox-sh/sdk` and `@paybox-sh/connect-react`.
- `[S5]` `api.paybox.sh` public discovery documents and CORS probes (section 4.3).
- `[S6]` developer.paybox.sh `llms.txt`, `skill.md`; plugin guide facts as verified in `[06]`.
- `[S7]` repo notes: `[04]` `docs/research/04-paybox-reference-plugins-a.md`, `[05]` `05-...-b.md`, `[06]` `06-paybox-platform.md`, `[08]` `08-venues-polymarket-kalshi.md`, `[09]` `09-venues-onchain-clob.md`, `[12]` `12-quotient.md`, `[19]` `19-smart-account-derivation.md`; `[P1]` `docs/phase1-gap-closing.md`; `[EA]` `docs/everyone-architecture.md`; `[LR]` `src/local/README.md`.
- `[S8]` my own read-only chain checks (`eth_getCode`, `eth_call`, `eth_supportedEntryPoints`), section 14.
- `[S9]` ZeroDev EIP-7702 quickstart, MoonPay's PayBox announcement, the MCP Apps specification.

---

## 0. Bottom line

1. **Option 0 (the user's PayBox wallet is the wallet, no separate AA kit) works for everything except four things, and those four are not needed on day zero.** PayBox gives an external agent: credential listing, portfolio reads, EIP-191, EIP-712, raw-digest, EIP-1559 transaction and EIP-7702 authorization signatures from an MPC-held ECDSA key that has one address on every EVM chain, plus transfers, swaps, x402 payments and plugin calls `[S1][S2]`. That covers off-chain order signing for any venue that accepts an EOA or an owner-signed smart account, and every UserOp for a smart account that PayBox's EOA owns. The four things an EOA-only design cannot do: (a) on-chain-enforced spend caps against a compromised agent, (b) unattended operation that is not "autonomous sign anything", (c) atomic multi-call batches, (d) gas sponsorship outside XO's own paymaster. See section 7.4.
2. **"Derive it" is possible for the account, not for the key.** The PayBox wallet key is MPC-held and there is no export in the public surface (NOT FOUND, searched `[S1]` for export, backup, import, recover). So nothing key-like can be derived from it, and deriving a local key from a PayBox signature ("sign a fixed message, hash it to a seed") must not be used: MPC ECDSA signatures are not known to be deterministic and PayBox says nothing about it (NOT FOUND). What *can* be derived, by pure CREATE2 arithmetic and with no key, is the **Kernel v3.1 smart account that the PayBox EOA owns**. I measured it: for one public test owner the factory returns the **same account address on all 8 EVM chains I checked** (Ethereum, Base, Arbitrum, Optimism, Polygon, BNB, Avalanche, HyperEVM), and the factory, ECDSA validator and EntryPoint v0.7 exist on all 8 `[S8]` [H]. That is the "multichain smart-contract wallet": **the PayBox EOA is the sole owner and validator, the dApp holds no key, and nothing separate has to be installed.** XO already requires exactly this account shape `[19]`.
3. **A web page cannot be a PayBox client directly.** `api.paybox.sh` answers CORS (preflight and plain GET) with `access-control-allow-origin` only for `https://app.paybox.sh`; a foreign origin gets no such header on `/mcp`, `/oauth/token` or `/oauth/register` `[S5]` [H, measured 2026-10-19]. There is no WalletConnect, EIP-1193 or web-SDK interface in any PayBox doc or package (NOT FOUND, searched `[S1]`, `[S3]`, `[S4]`; the one web package, `@paybox-sh/connect-react`, only renders "add PayBox to Claude or ChatGPT" instructions and "never authenticates, requests wallet permissions, or reports a successful connection") `[S4]`. So the tie-in has to go through something that is a normal PayBox client: either the user's own agent, or a **local helper process** that does the OAuth device-code login exactly as the official CLI does.
4. **Recommendation: Architecture B+A hybrid** (section 9): one local daemon that owns the data directory, the ledger, the caps and the credential store, serves the dApp UI on loopback, and exposes the same tools to the user's agent over stdio. It has **two interchangeable signing paths** behind one interface: **(A) agent-mediated** (default, nothing extra to set up, works with any PayBox-connected agent, the PayBox signing window appears in the agent's chat) and **(B) helper-as-PayBox-client** (opt-in: the daemon uses `@paybox-sh/sdk`, the user approves in the PayBox app, the dApp shows state). Both end in the same recompute-and-recover check before anything is sent. The smart-account layer is Kernel owned by the PayBox EOA, on only the chains where a venue needs it. A separate session-key AA layer is deferred behind a stated trigger (section 7.5).
5. **What is unverified, in one line:** nobody has made PayBox sign anything for this project. Every signing claim here rests on docs and tool schemas, not a run. The first live test (section 12, TP1) answers output shape, determinism, high-s, raw-digest acceptance and what the approver sees; until then the whole stack is design.

---

## 1. What "the PayBox agent wallet" is, technically

| Question | Answer | Tag and source |
|---|---|---|
| EOA or smart account? | An **EOA whose private key is an MPC key**. Evidence: `list_credentials` says "An EVM MPC wallet shares one address across every `eip155:*` chain"; the `transaction` op returns `serializedTransaction` "ready for `eth_sendRawTransaction`" (a plain signed EIP-1559 transaction from the wallet address); `pay_x402` "requires a plain EOA payer". Nothing documents a smart-account or Safe wallet. | H docs `[S1][S2]`; "EOA" is an inference from those three facts (no sentence says "EOA" about the default wallet) |
| EIP-7702? | Supported as an *operation* (`op: "authorization"` returns a signed EIP-7702 authorization) and PayBox knows about delegated wallets (x402 "returns a plain-EOA error or ... runs one composite signing flow that undelegates first"). Whether PayBox itself delegates the user's wallet (for the "gasless UserOperation envelopes" in `request_swap`) and to what contract: NOT FOUND (searched `[S1]`, `[S3]`, launch coverage). | H for the op and the x402 text; NOT FOUND for PayBox's own delegation |
| Key custody | Docs: "MoonX MPC (key never leaves the TEE)"; "A wallet grant yields signatures, never key shares". MoonPay's announcement says keys use "threshold cryptography (MPC) and secure enclaves (TEEs)" built on "Sodot's key management infrastructure" and that PayBox works "without ever taking custody of your funds". "Non-custodial" is the vendor's word; independent verification is NOT FOUND. The key shares sit in MoonPay-group infrastructure, so this is **MPC custody-by-threshold, not user-held keys**. | H for the quotes `[S1][S9]`; vendor claim |
| Passkey-controlled? | The **account** is. Sign-in is "email + passkey"; sensitive approvals need "a fresh passkey assertion"; the announcement adds "Every passkey approval is scoped to a single action and expires after use". The passkey authorizes an approval, it is not the wallet key and cannot sign for the chain. | H `[S1]`, M for the single-use sentence `[S9]` |
| How a signature is actually produced | An MPC signature requested through a **MoonX envelope** that is ed25519-signed by the *agent signing key* (`pbxk1.`) or by the in-chat signing window; the server-side `/sign` is "secret-gated". The `pbxk1.` key is generated on the machine running the CLI, paired to one OAuth client with an eight-emoji confirmation, and "PayBox never holds it". It authorizes signing; it is not the wallet key. | H `[S3]` (README, SKILL.md, `chunk` `buildEnvelope`, `signWalletRequest`) |
| Chains | `chains` is the family only (`evm` or `solana`). Catalog on 2026-10-19: Solana plus ten EVM chains (Ethereum 1, Base 8453, Arbitrum 42161, OP 10, Polygon 137, BNB 56, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999), with "Catalog membership does not guarantee provider coverage or trading support". Chain 3223 (XO) is absent. | H `[S1][06 §5]` |
| Solana | A **separate** credential and key family (base58 address; `solanaMessage`, `solanaTransaction`). No ERC-4337 equivalent applies. | H `[S1]` |
| Grants | Per **client**, per **credential**, with an approval mode: `always_approve` (passkey in the PayBox app), `iframe` (confirm in the signing window), `autonomous` (acts within the grant), and a fourth, `paybox`, that appears in the SDK `Grant` type and in tool text only. "One agent, one key. Rotate or revoke a client without touching the underlying credentials." | H `[S1][S3]` (`paybox` mode: H in the SDK type, NOT FOUND in the public docs) |

Consequence for the steer: the PayBox wallet is a fine **owner** and **signer** for other accounts, and it can be the account itself on every venue that accepts an EOA. It is not itself a programmable smart account unless the user chooses to delegate it (section 7.3).

---

## 2. What PayBox exposes to an external app

Everything below is reached the same way: an OAuth 2.1 (PKCE, public client) bearer token or a personal `pbx_live_*` API key on `https://api.paybox.sh/mcp` (streamable HTTP MCP, protocol `2025-06-18`), or the Node SDK that wraps it `[S1]`. The app-facing surface is deliberately small: "OAuth 2.1 to authorize, then MCP to act"; the first-party app's `/api/*` routes "are not part of the developer surface" `[S1]`.

| Capability | Tool or call | What the app gets | Notes |
|---|---|---|---|
| Addresses per chain | `list_credentials` | per granted wallet: `credential_id`, `kind`, `approval_mode`, `address`, `provider_wallet_id`, `chains` (family). One EVM address for all `eip155:*`; Solana separate. `ungranted` list is counts and safe metadata only. `agent_signer_recorded` flag. | `address` "may be `null` for older wallets" `[S1]` |
| Sign message (EIP-191) | `request_wallet_sign` `{op:"message"}` | `{signature}` | `message` is a string; signing raw bytes through it is untested |
| Sign EIP-712 | `{op:"typedData", typedData}` | `{signature}` | viem `TypedDataDefinition`; no domain or chainId allowlist in docs or SDK `[06 §4]`; chain-3223 behaviour NOT TESTED |
| Sign raw digest | `{op:"raw", rawSigningPayloadHex}` | "Signs a pre-computed digest as-is (escape hatch)" | chain-blind by construction; return shape (r,s,v vs 65 bytes) NOT TESTED `[P1 §9 A1]` |
| Sign a transaction | `{op:"transaction"}` full EIP-1559 fields | `serializedTransaction` | signed, **not broadcast** |
| Sign EIP-7702 authorization | `{op:"authorization"}` | signed authorization | the lever for section 7.3 |
| Solana | `solanaMessage`, `solanaTransaction` | signature, signed tx | |
| Agent keys | `paybox connect` (CLI) | a local `pbxk1.` ed25519 key bound to the client | enables in-process signing; no public API to mint one |
| Grants | read: `list_credentials`; change: `request_account_change` | a `manage_url` the **user** opens | "nothing is applied on the agent's behalf" `[S1]` |
| Portfolio reads | `get_portfolio` | balances across chains (raw and USD), per-wallet totals, NFTs, and (with World enabled) prediction-market outcome balances priced at the held side's mid | indexed by MoonX, can lag; treat `name`/`symbol` as attacker-set labels `[S2]` |
| Transfers | `request_transfer` | PayBox builds and broadcasts; wallet signs client-side | `value_cents` is a policy hint `[S2]` |
| Swaps and bridges | `request_swap` (`dst_chain` != `src_chain` bridges) | tx hash, `dst_tx_hash` | MoonX routes only |
| Funding links | `get_buy_link` (MoonPay checkout), `get_deposit_link` (PayBox "Open Deposit" URL, expires 24 h; SDK result has a `return_origin` field of unknown meaning) | URL for the human | moves nothing by itself `[S2][S3]` |
| Paid APIs (x402) | `discover_services`, `use_service`, `pay_x402` | paid response or `X-PAYMENT` header | needs a **plain EOA payer** `[S1]` |
| Plugins | `discover_plugins`, `get_contract`, `use_plugin` | official (World, Aave, Hyperliquid, Jupiter) and unofficial (installed by the user) | plugin money always pauses for approval (docs) `[S1]` |
| Request control | `get_request`, `list_requests`, `reopen_signing_window` | status, redacted history | "Only the client that minted a request can read it" |
| Readiness | `check_operation_readiness` | `can_attempt`, typed blockers, `unknowns` (local signing keys, region, funds) | the cheapest way to dry-run a signing intent later |

Not exposed to any external app, all NOT FOUND in `[S1]`, `[S3]`: key export, wallet creation (the CLI "cannot create wallets"; creation happens in the app), grant mutation without the user, an event or webhook stream, a documented rate limit on MCP calls, a decoded display of typed data.

---

## 3. Q1. The identity and connection models a dApp could use

| Model | Public? | What it gives | Fit for a dApp |
|---|---|---|---|
| **A. OAuth 2.1 MCP connector** (`https://api.paybox.sh/mcp`) | Public, documented. Dynamic client registration (RFC 7591), public clients only (`token_endpoint_auth_method: none`), `redirect_uris` must be HTTPS or `http://localhost`, PKCE S256 required, `resource` parameter. Access token 60 min (HS256 JWT, audience-bound), refresh token 30 days sliding and **rotated on every use**; replaying a used code or a rotated refresh token **revokes the client**. | The token's authority "is exactly the grant set the user approved". The user picks credentials and approval mode per credential on a consent screen and approves with a passkey. | Yes for a **non-browser** client (local helper, `http://localhost` redirect works). Not directly from a browser (section 3.3). |
| **B. Device-code login** (`paybox login`; discovery lists `device_authorization_endpoint`, grant type `urn:ietf:params:oauth:grant-type:device_code`) | Public (in the live metadata, `[S5]`; the OAuth page in `[S1]` predates it) | Same token as A without a redirect URI; "the browser that approves doesn't have to be on the machine running the CLI" | Best fit for a headless local helper. |
| **C. Personal API key** (`pbx_live_*`, "issued from the app's Clients screen", shown once) | Public | Same scoped bearer; "Keys suit headless use (CI, servers)" | Works but is a long-lived secret on disk; prefer B. |
| **D. Agent signing key** (`pbxk1.`, `paybox connect`) | Public CLI/SDK flow, key format opaque | Enables **in-process** signing (the headless equivalent of the signing window). Bound to the client that paired it: "agent signer belongs to another client" if mismatched. | Needed for Architecture B. It is signing authority within the grant; treat as a secret. |
| **E. Signing window (MCP Apps iframe `ui://paybox/wallet-sign`)** | The window exists and is described; its internal tools are "hidden from the agent ... not part of this surface" | Interactive signing UI rendered by an MCP host | Only chat hosts that implement MCP Apps; section 4. |
| **F. Partner routing** (`https://api.paybox.sh/mcp?app=<partnerSlug>` via `@paybox-sh/connect-react`) | Package public (Apache-2.0, 2 versions, 2026-09-16/17). Becoming an "enabled PayBox partner" is NOT FOUND, and "A slug is routing, not authorization." | A branded "connect" button that shows Claude/ChatGPT setup steps | Cosmetic. Not a wallet connection and not needed. Do not pursue (requires contacting PayBox, and gains nothing technical). |
| **G. Wallet-connect style (WalletConnect, EIP-1193 provider, injected wallet)** | NOT FOUND (searched `[S1]`, developer-portal docs, `[S3]`, npm search for `paybox`) | n/a | Not available. A dApp cannot ask "connect my PayBox wallet" the way it asks MetaMask. |
| **H. `X-Paybox-Signing-Surface` header** (`in-process`, `browser`, `none`) | Public in the SDK README | An MCP host declares where a human or key can sign; "selects one advisory `next_action`; it does not grant signing access" | Shows PayBox anticipates a `browser` surface; what it does server-side beyond an advisory hint is NOT FOUND. |

### 3.1 The per-client grant is the right shape for a dApp

A PayBox **client** is "an agent integration ... runs under its own client key". The dApp's helper registers as its **own** client. The user can then give it a **different grant** from the one their chat agent has: for example only the dedicated XO credential, approval mode `always_approve`, while Claude's client gets no signing grant at all. Revoking the dApp is one click on the PayBox Clients screen and does not touch anything else `[S1]`. This is a real advantage over a "connect once to everything" wallet. Evidence: H `[S1]` (model, OAuth tokens). That the consent screen really allows a different mode per client for the same credential: M (stated, not tested).

### 3.2 Official precedent for a non-chat PayBox client

The official SDK and CLI *are* a third-party-capable client of the same OAuth server (device code, refresh rotation, paired signing key). A community repo used a hand-rolled version (`paybox-hermes-agent`, Aug 2026, Solana only, now partly stale) `[05 §2.4]`. Nothing in the docs or terms forbids a local app from doing the same (the user's decision is also that PayBox terms are no obstacle).

### 3.3 Browser-direct is blocked (measured)

On 2026-10-19 I sent preflight `OPTIONS` requests (Origin set, `Access-Control-Request-Method: POST`, headers `authorization,content-type,mcp-protocol-version`) and plain `GET`s with an `Origin` header to `https://api.paybox.sh/mcp`, `/oauth/token`, `/oauth/register` and `/.well-known/oauth-authorization-server`:

- `Origin: https://app.paybox.sh` receives `access-control-allow-origin: https://app.paybox.sh` and `access-control-allow-credentials: true`.
- `Origin: https://example.org` and `Origin: https://claude.ai` receive **no** `access-control-allow-origin` header. (Chat hosts call the MCP server from their back end, so this is consistent.)
- The allowed request headers include `x-moonx-access-token`, `x-moonx-identity-token`, `x-moonx-presence`: the first-party app's MoonX session headers. They are not part of the public surface and must not be used.

[H, measured; `[S5]`.] So a static page on any other origin cannot register a client, exchange a token or call `/mcp` from the browser. A PayBox-side change could open this (an origin allowlist for partners is plausible) but nothing public says so (NOT FOUND). Design for the block, and treat a future allowlist as a bonus, not a dependency.

---

## 4. Q2. Can the dApp be a PayBox MCP client, and how does signing appear to its user?

**Yes, as a local process; no, as a web page** (section 3.3). As a local MCP/OAuth client it can: list credentials, read the portfolio, request any signature, run transfers, swaps, x402 purchases, and use plugins, all subject to the grant `[S1][S3]`.

The signing step has four possible surfaces. Which one a user sees depends on the architecture.

| Surface | What the user sees | Available to a dApp? |
|---|---|---|
| **Signing window in an agent chat** (MCP Apps iframe) | An interactive card in the chat (Claude, ChatGPT, Grok); "Most agents draw it the moment the tool runs. Grok draws it only after the agent finishes replying". It signs client-side "as soon as your key is connected to it". | Only inside the agent. The dApp can *request it indirectly* by instructing the agent (Architecture A). |
| **Approval in the PayBox app** (`pending_approval` with `approval_url`) | A push notification and a passkey confirmation in the PayBox app or at `app.paybox.sh`. Approvals are "operation-bound" and "expire after ~10 minutes". | **Yes**, from any client: the dApp shows the `approval_url` and polls `get_request`. This is the realistic dApp UX. |
| **In-process signing with `pbxk1.`** | Nothing visible: after approval (or at once under an `autonomous` grant) the SDK signs and posts the artifact. "there is no signing window on this surface." | Yes, Architecture B. |
| **dApp acting as an MCP Apps host** | The dApp would fetch `ui://paybox/wallet-sign` and render PayBox's own window inside itself. | **Not supported.** MCP Apps requires web hosts to use "an intermediate Sandbox proxy" on a different origin `[S9]` (M, spec read via a summarizing fetch); PayBox's window calls hidden, app-only tools; browsers are blocked by CORS anyway (section 3.3); and PayBox documents no third-party host. Treat as UNVERIFIED and out of scope. |

What the approver sees for XO or other opaque signatures: NOT FOUND. XO's order and ClobAuth signatures are over `Kernel(bytes32 hash)` and a UserOp is a `raw` 32-byte digest, so the PayBox approval screen can at best show a hash `[06 §6][P1 §9 A4]`. The dApp's real contribution is that **it shows the decoded order or UserOp next to the digest tag on the user's own screen**, so the user compares the tag shown in the dApp with what PayBox shows. That is a human check against a cooperative or confused agent; it is not protection against a deceived human or a compromised helper.

The approval clock matters: a `pending_approval` lives about 10 minutes (H `[S1]`), but XO's L1 ClobAuth must be signed within about 90 s of preparation and an order needs at least 90 s of TTL left at submit `[P1 §5.2]`. The dApp must show a countdown and re-prepare silently when an item goes stale; the cost is zero.

---

## 5. Q3. Can the PayBox credential be the OWNER/validator of the dApp's smart account?

**Yes, and this is already the shape XO requires.** Evidence:

- XO accounts are ZeroDev **Kernel v3.1**, created by the canonical factory with the ECDSA validator and a 20-byte owner; the account address is a pure function of the owner (`CREATE2(factory, keccak256(initData || salt), proxy-init-code-hash)`) and **any EOA** can be that owner. Verified for 2,627 of 2,627 `OwnerRegistered` events and by on-chain `getAddress` calls `[19 §0]` [H].
- The owner EOA signs UserOp hashes (`raw`) and the Kernel-wrapped order digests (`typedData` or `raw`); the validator accepts both a raw-digest and an EIP-191 signature `[19 §7.3][P1 §0]` [H]. These are signature primitives PayBox exposes (section 2).
- **New in this task: the same account address exists on every chain I checked.** For a public test owner (the public Anvil account 0 address, a TEST value with no funds) the Kernel v3.1 factory's `getAddress(initData, 0)` returns the identical address on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Smart Chain, Avalanche and HyperEVM (it equals the value in `[19]`). The factory (989 bytes), ECDSA validator (1,819 bytes) and EntryPoint v0.7 (16,035 bytes) have **identical code hashes** on all 8. The Kernel implementation sits at the same address on all 8 with the same size (22,784 bytes) but with a **different code hash on each chain**; the account address depends on the implementation *address*, not its code, so derivation is unaffected, and the per-chain hash difference is probably a chain-specific constant in the constructor (L, not investigated). Section 14 lists the commands. [H, `[S8]`.]
- Keyless public ERC-4337 bundlers answer on at least Base and Polygon: `eth_supportedEntryPoints` on `public.pimlico.io/v2/{chainId}/rpc` and `api.candide.dev/public/v3/8453` returned the EntryPoint v0.7 address among four. Rate limits, terms and reliability are unknown (NOT FOUND). [H for the response, 2026-10-19.]

So, for each chain `c` where a venue needs it: `account(owner = PayBox EOA, c)` is the same address, deployed lazily by the first UserOp, with PayBox as the only signer. **The dApp never holds a key.** Nothing needs to be installed beyond the derivation and UserOp packing that `src/xo/account` and `src/xo/userop` already contain (chain-parametric work is not built; XO chain 3223 is the only configured chain `[P1 §5]`).

What this does **not** buy:

- **XO acceptance** of a PayBox-owned account is still NOT ESTABLISHABLE WITHOUT XO (doors a to e in `[P1 §0]`). Test T1 there is unchanged.
- **Gas.** Outside XO's sponsored chain the account pays in the native token, or a paymaster must sponsor it. Paymaster services (ZeroDev "Gas Policies", Pimlico, others) are configured with keys in a dashboard, which is something the user would have to operate; a keyless public paymaster is NOT FOUND. Funding native gas into the account is a plain `request_transfer` from the PayBox wallet to the (possibly undeployed) account address.
- **A venue's own account contract.** Several venues do not use Kernel. Polymarket's wallets "deployed on or after May 4, 2026" are Deposit Wallets (`signatureType 3`, ERC-7739 `TypedDataSign`); Opinion uses a Safe owned by the EOA; Predict.fun accepts an EOA or a Kernel account; Hyperliquid has its own agent-wallet concept `[08][09 line 300]`. In every case the PayBox EOA is the **owner/signer** of the venue's account; we derive nothing and install nothing. This is the strongest argument against building one "universal smart wallet": the contract that matters is the venue's.

---

## 6. Q4. How the local plugin (`dist/local.mjs`) and the dApp share account, caps and ledger

### 6.1 What exists

`dist/local.mjs` is a stdio MCP server with the relay embedded in the same process. State is in one data directory (`0700`, files `0600`): encrypted credential vault, ledger, prepared items, capability facts, audit log. "A second process on the same directory cannot write: it says so, still lists the tools, and leaves the first untouched." Caps ($10 per order, $50 per day) are enforced inside the relay and are "advisory against a compromised or prompt-injected agent" `[LR][EA]` [H, repo files read 2026-10-19]. The tool layer talks to the relay through the `RelayClient` interface and the same route handlers serve both modes `[EA §2.1]`.

### 6.2 The conflict this creates

An MCP client (Claude Code, Claude Desktop) **spawns its own `local.mjs` per session**. If the dApp helper is a separate long-running process that holds the data-dir lock, the agent's spawned process is read-only and cannot prepare or submit. If the agent's process holds the lock, the dApp cannot write and exists only while an agent session runs. Two processes must not each keep a ledger: a split ledger means caps reset per process (the failure `[P1 §9 A2]` forbids).

### 6.3 Design (not built)

- **One owner of the data directory: a daemon** (`local.mjs serve`, designed). It embeds the relay, serves the dApp UI and a JSON API on `127.0.0.1` only (Host/Origin validation, a rotated local key, per-endpoint rate limit, as specified in `[P1 §9 A5]`), and holds the PayBox client state in Architecture B.
- **The stdio entry becomes a thin shim** when a daemon is running (same tool schemas, forwards each call to the daemon over loopback with the local key). When no daemon is running, the stdio process embeds the relay as today. The lock rule decides which one applies; the user does nothing.
- **Shared by construction:** account derivation (owner, chain), prepared items (`prepared_id`, single use, TTL 5 min; auth 90 s), daily ledger, flags, kill switch, audit log. The dApp shows them; both front doors mutate them through the same handlers.
- **Caps stay in the relay**, not in the dApp. The dApp shows `reserved_usd` and `day_remaining_usd` from `Prepared.caps`. Funding, withdrawal and creation fees follow the existing recommended defaults `[P1 §9]`. The new data budget for Quotient calls is a separate small cap (section 10), not part of the $50.
- **Signing-path independence:** `Prepared.sign` carries the exact `request_wallet_sign` intent plus an `expected_digest` and `digest_form` that stay on the relay side `[P1 §9 A1]`. `submit` takes only `prepared_id` and `signature` and recomputes the digest and recovers the signer before any send, whichever path produced the signature. That makes Architecture A and B equal in safety at the relay.
- **Identity binding:** the first signature from a credential is verified by ecrecover against the claimed owner address (pattern P3 in `[05]`). In Architecture B the helper additionally records the `credential_id` and `address` from `list_credentials`; a mismatch stops everything.

If the user wants no daemon, the fallback is: the UI is served inside the stdio process while an agent session is open (works, but "dApp only while the agent runs" is a poor product). I would not ship that as the main path.

---

## 7. Option ladder for the wallet: prove or kill each rung

The user's steer makes **Option 0** the baseline. Each rung is judged on what it adds and what it demonstrably cannot do before the next one is justified.

### 7.1 Option 0: PayBox EOA is the wallet (BASELINE)

Covers: any venue/order flow where the venue accepts an EOA or an owner-signed account (Polymarket owner/session signer, Opinion Safe owner, Predict.fun, Hyperliquid agent approval, Myriad), PayBox-native money movement (transfers, swaps, bridges, buy/deposit links), x402 purchases (Quotient), and portfolio reads.

Status: **PLAUSIBLE, not proven.** Nothing has been signed yet. Kill criteria: PayBox refuses `typedData` or `raw` for the needed domain/chain, returns an unusable signature (non-65-byte without a known assembly rule, or high-s that a venue rejects), or its grant model blocks an external client's `request_wallet_sign` on the dedicated credential. Any of these is a live-test result (TP1, TP2).

### 7.2 Option 1: PayBox EOA owns Kernel v3.1 accounts (derived, multichain)

Covers: XO (required), any chain where a user wants a smart account address that is the same everywhere, and UserOp-based flows (redeem, approvals) with sponsored gas on XO.

Status: **derivation PROVEN on 8 chains (H); acceptance by XO NOT ESTABLISHABLE; PayBox `raw` signing NOT TESTED.** This is not a "separate AA kit": no second key, no second vendor, the code is the repo's own.

### 7.3 Option 2: EIP-7702-delegate the PayBox EOA itself (the wallet becomes the smart account at its own address)

Mechanics: PayBox signs an `authorization` for a Kernel or other implementation; the EOA address then acts as a smart account on that chain `[S9]` (ZeroDev: "dual account", same address, "any 7702-compatible network"; the example uses Kernel v3.3 and a ZeroDev bundler and paymaster).

Why I recommend **killing it for v1**:

1. **It breaks PayBox's x402.** PayBox: "x402 requires a plain EOA payer." A delegated wallet gets "a plain-EOA error" unless "auto-undelegate is enabled for the chain". Quotient signals (section 10) depend on x402 from the same wallet `[S1]`.
2. **It may collide with PayBox's own delegation.** PayBox's swap flow signs "gasless UserOperation envelopes" and its x402 code knows delegated payers; if PayBox delegates the wallet to its own contract on some chains, a user-chosen delegate replaces it and may break swaps. NOT FOUND what PayBox does (section 1).
3. **It does not fit XO**: "Only XO smart-account orders (`signatureType = 3`) are accepted"; an EOA at its own address, even delegated, is not an XO-registered account `[09][19]`.
4. **Replacing a delegation, and per-chain 7702 support, are undocumented here** (ZeroDev's guide "doesn't cover" replacing delegation; chain support is not verified by me for the eight chains).
5. **It makes the EOA key hotter**: the same ECDSA key is both the owner and the account, so one blind `raw` approval can authorize both an account action and a plain transaction.

Prove-or-kill test if ever wanted: TP7 (throwaway credential only).

### 7.4 What an EOA-only design demonstrably cannot do

| Gap | Why Option 0/1 cannot close it | Is it needed on day zero? |
|---|---|---|
| **On-chain-enforced caps** | A PayBox grant can cap `request_swap`/`request_transfer` (`value_cents`) but `request_wallet_sign` has no value field and `raw` has no chain, so an agent with a signing grant can sign anything `[06 §4,§10]`. | No: caps are advisory by decision, and approval-gated signing is the recommended mode. |
| **Unattended trading that is not "autonomous sign anything"** | The only unattended mode is `autonomous`, which means a compromised agent can sign any digest within the grant. | No: per-order approval at $10/$50 per day is "a small cost" `[P1 §5.2]`. |
| **Atomic batches** | An EOA transaction is one call; PayBox plugin proposals are one call each `[04 §5.5]`. A Kernel UserOp can batch. | Partly met by Option 1 for XO (`approve` + `setApprovalForAll` in one UserOp). |
| **Sponsored gas outside XO** | Needs a paymaster someone operates or pays for. | No. |

### 7.5 Option 3: a separate session-key smart-account layer (deferred; trigger stated)

A Kernel permission validator (or equivalent) with a call-policy and spend limit, controlled by a *locally generated random session key*, installed by one PayBox-signed UserOp. It gives on-chain caps and unattended operation without handing the agent PayBox's blanket signing authority. **Trigger to build it**: the user wants unattended trading inside hard on-chain limits AND the venue accepts the permission validator's signature form (XO: NOT ESTABLISHABLE; Polymarket has a native, venue-side analogue, Session Keys: beta, Deposit Wallet only, 180 days, "cannot withdraw", needs a Builder API key `[08]`). Until the trigger, do not build it: it adds a hot key on disk, a second thing to audit, and no day-zero capability.

Rule for the design: **sign-to-derive is rejected.** The session key is random and stored in the encrypted vault, never derived from a PayBox signature, because PayBox signature determinism is NOT FOUND and an MPC signer that is not deterministic would make the "derived" key unrecoverable.

---

## 8. Q5. PayBox-side limits that constrain the design

| Limit | Value or behaviour | Tag, source | Effect |
|---|---|---|---|
| Plugin sandbox 10 s, fresh process, no state | Applies to Open Plugins only | H `[06]` | **Does not apply** to a dApp/helper. Long sends, polling and background watchers are fine in the daemon. |
| Approval modes | `always_approve`, `iframe`, `autonomous`, plus `paybox` (SDK type only) | H `[S1][S3]` | Use `always_approve` on the dedicated credential for the dApp client. Behaviour of `autonomous` for `request_wallet_sign` is documented as `pending_signature`; docs conflict on whether signing "regardless of mode" needs a fresh passkey (`concepts/model` vs `concepts/requests`) `[06 §6]`. NOT TESTED. |
| Passkey for sensitive ops | "revealing a raw secret, signing, issuing keys" require a fresh passkey assertion "Regardless of mode"; threshold for "above-threshold" ops undefined | H quote, NOT FOUND threshold `[S1]` | Plan for a passkey on every signature; if autonomous works without one, treat it as a bonus. |
| Approval lifetime | about 10 minutes, operation-bound ("change any parameter and it's a new request") | H `[S1]` | Re-prepare on stale items; countdown in the UI. |
| Token lifetime | access 60 min; refresh 30 days sliding, rotated each use; replay revokes the client | H `[S1]` | **Single process owns the token.** Two processes sharing one config race ("refresh token has already been used") `[S3]`. The daemon is the only PayBox client process. |
| Signing key binding | a `pbxk1.` key is bound to one client; `login` clears the stored key | H `[S3]` | After any re-login run pairing again; keep the pair together. |
| Idempotency | "submit once, then poll"; never re-call a write tool; re-sending the same `request_swap` returns the same parked request | H `[S1][05 §2.4]` | The daemon persists `request_id` before polling and never re-issues. SDK's `resumeRequest` exists. |
| Request visibility | "Only the client that minted a request can read it" | H `[S1]` | A dApp client cannot see or complete the agent's requests, and vice versa. Do not design a hand-off of a pending request between the two. |
| Rate limits on MCP | NOT FOUND (plugin-call limits are 1 start/s and 1,000 per rolling 24 h per user, plugin-only) | `[06]` | Poll with backoff (SDK default 2 s doubling to 30 s). |
| Chain policy | "a chain or merchant not in the grant" can be denied; wallet-sign grants' chain allowlists and unsupported-chain behaviour are NOT FOUND | H quote, NOT FOUND `[06 §5]` | `raw` carries no chain, so chain policy cannot bind it (M, inference). Chain 3223 `typedData` could be denied (plausible, not evidenced). |
| What the signer shows | typed-data and raw rendering NOT FOUND | `[06 §4]` | Blind-signing risk; mitigations in section 4. |
| No portal access, no upload | Open Plugin upload closed after Chapter 1 for non-entrants (NOT FOUND otherwise) | `[06 §2]` | Irrelevant to a client. The dApp does not need any PayBox approval, listing or partner status to function. |
| Terms | user decision: no obstacle | `[P1]` | Not used as an argument here. |
| Churn | SDK 2.0.0 (2026-10-02) to 2.2.0 (2026-10-14) in 12 days; core operations use REST routes (`/agent/requests/...`) that are not in the public API docs (`openapi.json` lists only OAuth, MCP, health) | H `[S3][S4][S5]` | Pin the SDK version, wrap it behind one adapter with a golden test, and prefer the documented MCP tools wherever the SDK offers a choice. In-process signing has no documented MCP equivalent. |
| Non-custodial claim | vendor statement; MPC shares held by MoonPay-group infrastructure; no key export | `[S1][S9]` | A user cannot leave with the key. Tell the user plainly; keep withdrawal tests (T4) before funding. |

---

## 9. Integration architectures

Common to all: read-side (positions, prices, market lists, Quotient signals) needs **addresses only** and no PayBox access. Positions are keyed by the account addresses (XO: the smart account, `[19 §2]`; Polymarket: the proxy or deposit wallet; others: the venue's account). The user supplies or confirms the owner address once (it is public). PayBox is needed only for signing, funding, balances in the PayBox wallet itself and paid x402 reads.

### Architecture A: agent-mediated (no PayBox client in our code)

```
browser (dApp UI, served by the daemon on 127.0.0.1)
   |  shows: positions, prepared item, digest_tag, "Sign in PayBox" panel with the exact intent
   v
local daemon (relay, ledger, caps, vault)  <--stdio shim--  user's agent (Claude / ChatGPT) --MCP--> PayBox
   ^                                                              |
   |  xo_prepare_* returns {intent, expected digest}              |  request_wallet_sign(intent) -> signing window / passkey
   +----------------  xo_submit_*(prepared_id, signature)  <------+
```

- Flow: the dApp (or the agent) calls prepare; the dApp shows the decoded item and a "waiting for your agent" state; the tool result tells the agent to call `request_wallet_sign` with the intent unchanged; the agent hands the signature to `xo_submit_*`; the daemon recomputes, recovers, sends; the dApp updates from the ledger.
- What the user sees: the PayBox signing window in the chat, or an approval in the PayBox app; the dApp mirrors status.
- Needs: nothing beyond what the repo plans. No OAuth client in our code, no `pbxk1.` key near our process, no SDK dependency.
- Pros: day zero for anyone with a PayBox-connected agent; smallest attack surface; no PayBox churn exposure in our code; works whatever the CORS policy.
- Cons: two surfaces (chat and dApp); depends on the agent to relay (mitigated by recompute-and-recover); no one-click UX; a dApp-only user without an agent cannot sign.
- Unverified: whether `use_plugin`/tool results carry structured intents through to the agent faithfully (the release-blocking P9 question in `docs/plan.md`; for local mode the tool result goes to the agent over stdio, so the plugin-side question differs).

### Architecture B: the daemon is itself a PayBox client (SDK, device-code, optional `pbxk1.`)

```
browser (dApp UI) <--loopback--> local daemon  --@paybox-sh/sdk--> api.paybox.sh (OAuth device code, MCP/REST)
                                    |                                  ^
                                    +-- request_wallet_sign(raw|typedData) -> pending_approval -> approval_url
user's phone / PayBox app: passkey approval -----------------------------+
daemon: in-process sign with pbxk1 after approval -> artifact -> submit_* -> venue
```

- Setup, one time, shown in the dApp: (1) "Connect PayBox": the daemon runs the device-code login and shows the link; the user selects **only the dedicated credential** and mode `always_approve`; (2) "Pair signing key": eight emoji, the user picks the matching code in PayBox.
- What the user sees: a button in the dApp, a push/approval in the PayBox app, result in the dApp. Identical for orders, UserOps, Quotient purchases, transfers.
- Pros: one-click UX; the dApp can show the decoded item and the PayBox approval side by side; the dApp's grant is separate and revocable; the helper can poll balances (`get_portfolio`) and fund (`get_deposit_link`) without an agent.
- Cons: the daemon now holds an OAuth refresh token and a `pbxk1.` key. With an `always_approve` grant they cannot sign without a passkey, which is the whole point of that mode; with `autonomous` they let malware on the machine sign anything in the grant. SDK pinned to a fast-moving 2.x line using non-public REST routes. A single-process rule for tokens.
- Unverified: that PayBox lets this client's `request_wallet_sign` finish with an in-process key after an `always_approve` passkey (the SDK says "Approval-mode operations can wait for the user's passkey approval and then sign in-process" `[S1]`; for `request_wallet_sign` NOT TESTED).

### Architecture C: Kernel-account layer on top of A or B (the "multichain smart-contract wallet")

Not a third way to connect; it is the account model both A and B use for any chain/venue that needs one: `account(owner = PayBox EOA, chain)`, deployed lazily, UserOps built by the daemon (userOpHash signed through whichever path), keyless public bundlers or the venue's bundler, gas from the account or a paymaster the user configures. Off by default, per-chain flag, XO first. The dApp's "one wallet" screen is a *view* over three layers: the PayBox EOA (same address on every EVM chain), its derived Kernel accounts (same address on every enabled chain), and the venue accounts (XO Kernel, Polymarket Deposit Wallet, others).

### Architecture D (rejected): dApp as MCP Apps host or direct browser client

Blocked by CORS, by the unsupported hidden window tools and by the sandbox-origin rules; adds no capability A and B lack. Revisit only if PayBox publishes a web SDK or allowlists origins.

### Recommendation

1. **Build the daemon and the loopback UI first; ship Architecture A as the default signing path** (it needs nothing from PayBox beyond what the plan already assumes and keeps PayBox churn out of our code).
2. **Add Architecture B as an opt-in module** behind one interface (`SigningPath = AgentMediated | PayboxClient`), a feature flag defaulting off, a pinned SDK version and an adapter with golden tests. Turn it on only after TP1 and TP3 pass.
3. **Use Option 1 accounts (C)** for XO, parametrized by chain; add other chains only when a venue needs a smart account there.
4. **Defer Option 2 (7702) and Option 3 (session keys)** with the triggers above.
5. **Keep every claim of "dApp never holds keys" precise**: the dApp holds no wallet key and no owner key; in Architecture B the daemon holds PayBox *authorization* credentials (OAuth refresh token, `pbxk1.` key) whose power equals the grant, which is why the grant must be `always_approve` on a dedicated credential.

---

## 10. Quotient signals, positions and the "everything in one place" views

- **Positions and bets:** keyless reads by address from each venue's public API (no PayBox call). XO Data API is keyed by the smart account, so a PayBox owner address must first be mapped to its derived account (`deriveAccount`, section 5). Kalshi and Polymarket US are custodial accounts with API-key auth and cannot be reached by a PayBox wallet at all; they can appear only as manual or read-only legs `[08][aggregation-design]`. Per-user Kalshi/Quotient credentials live in the local vault if the user chooses to add them, never in the dApp page.
- **Quotient:** Quotient is x402 pay-per-call on Base (about $0.005 to $0.02 per call; its signals, `markets/mispriced` and `markets/lookup`), covers Polymarket, Polymarket US, Kalshi and HL Outcomes, not XO or Trueo, and its terms allow "personal or internal business purposes" while barring redistribution and shared access `[12]`. In this design **each user's own PayBox wallet pays**: Architecture B calls `use_service` (gateway mode) or `pay_x402` (header mode) through the SDK; Architecture A has the agent do it. Preconditions: the wallet must be a **plain EOA** (so no 7702 delegation, see 7.3), the daemon pre-flights the unpaid 402 and refuses unless the payment tuple (scheme, network, asset, payee, amount, timeout) matches the pinned values `[12 §10]`, and a separate daily data budget applies. Results are cached **per user on disk only**, shown with provenance and price, and never re-served. Quotient's `/portfolio` endpoint takes a wallet address and would leak the user's address to a third party; it stays off `[12]`.
- **Agent terminal:** a thin console over the same tool handlers (and, optionally, a bring-your-own-LLM agent). It is a second consumer of the prepare/submit queue, not a second wallet. Who runs the LLM and with what credentials is outside this note.

---

## 11. Risks

1. **Nothing is proven live.** The two largest unknowns are PayBox's signing behaviour (shape, determinism, display, chain policy) and XO's acceptance of a PayBox-owned account. Fund nothing beyond test amounts until TP1 and `[P1]` T1 pass.
2. **Blind signing.** `raw` and `Kernel(bytes32)` approvals carry no amounts. A compromised agent or helper can request a digest that is a different UserOp or even a plain transaction hash; the dedicated-credential rule (`[P1 §9 A4]`) and the dApp-side decoded summary reduce, not remove, this.
3. **The helper is a juicy local target (Architecture B).** Refresh token plus `pbxk1.` key plus the vault master key on one machine. `always_approve` is the mitigation; `autonomous` negates it.
4. **Vendor dependence.** SDK churn, undocumented REST routes, and PayBox's right to change CORS, grants or approval rules without notice. Mitigation: adapter, pinned version, kill switch, the agent-mediated path as fallback.
5. **MPC custody and no exit.** No key export is documented; a PayBox outage or account lockout ("removing the last passkey locks the account") strands funds. Keep balances in the PayBox-owned wallet small and prefer venues where funds can be withdrawn to a PayBox address.
6. **Account-level mistakes in the multichain layer.** Sending tokens to an undeployed counterfactual account is fine for ERC-20s but the USDC.e-to-undeployed-account trap in `[P1 §0]` applies: deploy and verify on a chain before funding it.
7. **Same address, different chain risk.** The Kernel account address is identical across chains; replaying a UserOp signature across chains is prevented by the chainId in `userOpHash`, but a *`raw` digest* shown to the approver without a chain is ambiguous to a human. Show the chain in the dApp next to the tag.
8. **Local web security.** Loopback listeners are attackable by other pages and local processes: bind to 127.0.0.1, validate Host and Origin, rotate the local key, no wildcard CORS. Browser private-network-access behaviour for a public page calling loopback was not tested (L); serving the UI from the daemon itself avoids the question.
9. **Terms and jurisdiction** (Quotient redistribution, XO creation limits, venue geo-blocks) are unchanged by this note and tracked in `[P1][12]`.

---

## 12. Live tests to run later (each needs a throwaway PayBox credential and explicit user go-ahead; none was run)

| ID | Test | Answers | Kill or branch |
|---|---|---|---|
| TP0 | `check_operation_readiness` for a `request_wallet_sign` `raw` and a `typedData` intent (including chain 3223 and Polygon 137 domains) | blockers and `unknowns` before any request exists | a typed blocker for 3223 means XO signing needs `raw` only |
| TP1 | Sign a fixed 32-byte digest with `raw` twice; sign the same EIP-712 payload with `typedData` twice | output shape and 0x handling, high-s, **determinism** (sign-to-derive stays rejected either way), whether `raw` accepts the digest as-is, whether the ECDSA validator and ecrecover accept the result | non-determinism is expected; a shape that cannot be assembled into 65 bytes kills raw-based UserOps |
| TP2 | `typedData` with domain chain 3223 and chain 137 | chain policy for typed data | denial = XO needs `raw` or a PayBox-side change |
| TP3 | Device-code login from a local process via the SDK; grant one credential, mode `always_approve`; pair `pbxk1.`; sign a `message` | Architecture B end to end; how a second client's grant differs from the chat agent's | failure keeps A as the only path |
| TP4 | Two clients on one credential, different modes; revoke one | independence of grants and revocation | |
| TP5 | What the approval screen shows for `typedData` and for `raw` (screenshot by the user) | whether a human can ever verify an order at the approval step | if only a hash, the dApp-side tag comparison is the only check |
| TP6 | `use_service` of one Quotient `markets/lookup` call ($0.005) from the helper | x402 from an EOA end to end; wallet must be non-delegated | |
| TP7 (only if Option 2 is ever pursued) | `authorization` op for a Kernel implementation on a throwaway wallet on one L2, then an x402 call | whether PayBox signs arbitrary delegates and what breaks | any x402 break kills Option 2 |
| TP8 | Two processes using one SDK config | the refresh race | confirms the single-process rule |
| TP9 | `get_deposit_link` and `return_origin` (read what the link does; the human pays or not) | usable as the dApp's Fund button | |

---

## 13. NOT FOUND and unverified (collected)

- Whether PayBox signs `raw`/`typedData` for arbitrary domains and chains, the signature byte layout, and determinism. NOT TESTED.
- What the PayBox approval and signing screens display for typed data and raw digests. NOT FOUND.
- Whether PayBox delegates the user's wallet via EIP-7702 itself and to what. NOT FOUND (searched `[S1]`, `[S3]`, launch coverage).
- The `paybox` approval mode and `X-Paybox-Signing-Surface: browser` semantics beyond the SDK type and README. NOT FOUND in public docs.
- A way to become an enabled PayBox partner, a web SDK, a wallet-connect interface, an origin allowlist, MCP rate limits, key export. NOT FOUND.
- `get_deposit_link.return_origin` semantics. NOT FOUND.
- Per-chain EIP-7702 availability for the eight chains. Not checked.
- XO's acceptance of a PayBox-owned Kernel account, and a Kernel permission validator signature at XO. NOT ESTABLISHABLE WITHOUT XO.
- A keyless public paymaster; the terms and rate limits of the public bundlers. NOT FOUND.
- Whether a Polymarket Deposit Wallet address is derivable from an owner without the venue. NOT FOUND here.

---

## 14. Verification (2026-10-19)

What I re-checked first-hand, and how:

1. **PayBox docs.** Downloaded `llms-full.txt` and the HTML pages (getting-started, concepts/*, connect/*, reference/mcp-tools, api-reference, sdk-cli, skill) and developer.paybox.sh `llms.txt`, `skill.md`, `requirements.md`, `terms` into the session scratchpad; read `llms-full.txt` end to end. Grepped all pages and the SDK for `7702`, `delegat`, `gasless`, `walletconnect`, `1193`, `window.ethereum`, `wagmi`, `export`, `recover`, `backup`, `import`, `smart account`, `4337`, `eoa`, `iframe_approval`, `signing key`: the hit lists are as reported above (no WalletConnect/EIP-1193 hits; no key export hits).
2. **SDK.** Fetched `@paybox-sh/sdk@2.2.0` `README.md`, `SKILL.md`, `package.json`, `dist/index.d.ts`, `dist/index.js`, `dist/cli.js`, `dist/chunk-DWDC6W5P.js`, and registry JSON (latest 2.2.0, published 2026-10-14; 2.0.0 on 2026-10-02). Read as text only; nothing installed or run. Confirmed: ed25519-signed MoonX envelope, `pbxk1.` prefix, `X-Paybox-Signing-Surface` header sent by `post()`, `Grant.approval_mode` includes `paybox`, `get_deposit_link` types, `completeWalletSignRequest`, REST paths `/agent/requests/{id}/{binding,moonx-sign,signature,envelopes}`.
3. **`@paybox-sh/connect-react`.** Read the registry README: the component "never authenticates, requests wallet permissions, or reports a successful connection"; `partnerSlug` produces `https://api.paybox.sh/mcp?app=...`; "A slug is routing, not authorization."
4. **Live tool schemas** (loaded only): `request_wallet_sign` (intent union and description), `get_deposit_link`, `reopen_signing_window`, `check_operation_readiness`, `list_credentials`, `get_portfolio`, `request_transfer`, `resolve_username`, `list_requests`, `get_request`. No PayBox tool was called.
5. **API discovery and CORS.** GET of `openapi.json` (paths: `/.well-known/*`, `/health`, `/mcp`, `/oauth/{authorize,register,token}` only), `/.well-known/oauth-authorization-server` (includes `device_authorization_endpoint` and the device-code grant type, which the docs page does not), `/.well-known/oauth-protected-resource`, `/.well-known/api-catalog`, `/health`, `/skill.md`. CORS: `OPTIONS` preflight and `GET` with `Origin` set to `https://app.paybox.sh`, `https://claude.ai` and `https://example.org` against `/mcp`, `/oauth/token`, `/oauth/register`: allow-origin only for `https://app.paybox.sh` (the GET probes also covered the authorization-server metadata and `/mcp` with a 401). Request header `User-Agent: insurance-markets-research/0.1` throughout; no body was sent to PayBox.
6. **On-chain (read-only JSON-RPC).** `eth_getCode` for the Kernel v3.1 factory, implementation, ECDSA validator and EntryPoint v0.7 on 8 chains (Ethereum, Base, Arbitrum, Optimism, Polygon, BNB, Avalanche, HyperEVM) through public RPCs: factory, validator and EntryPoint have one code hash each across all 8; the implementation has 8 different hashes at the same address and the same size. `eth_call` of the factory's `getAddress(initData, salt 0)` for the public Anvil account 0 address (TEST only, no key used; `initData` built with the repo's installed `viem`, 292 bytes as in `src/xo/account/derive.ts`) returned the same account on all 8 chains and equals the value in `[19]`. `eth_supportedEntryPoints` on `public.pimlico.io/v2/{8453,137}/rpc` and `api.candide.dev/public/v3/8453` returned four entry points including v0.7.
7. **Third-party docs.** ZeroDev EIP-7702 quickstart and MoonPay's PayBox announcement were read through a summarizing fetch (so M, not verbatim); the MCP Apps specification was read the same way (M); a web search for ZeroDev 7702 and for PayBox 7702/MoonX found nothing about PayBox's own delegation.
8. **Repo.** Read `docs/plan.md` (banner), `docs/phase1-gap-closing.md` (sections 0, 5, 9), `docs/everyone-architecture.md` (sections 1 to 2.1), `docs/aggregation-design.md` (summary), `docs/platform-registry-design.md` and `docs/venue-census.md` (headings and P0/P1 reasons), `src/local/README.md` and `src/local/paths.ts`, `src/local.ts`, and notes `[04]`, `[05]` (sections 0 to 4), `[06]` (whole), `[08]` (Polymarket and XO sections), `[09]` (HIP-4 and precedent lines), `[12]` (sections 0 to 1, 8, 10), `[19]` (section 0). I did not re-verify their individual claims except where stated above.

What I did **not** verify: anything that needs a PayBox call or a signature (section 12); that the PayBox wallet is an EOA beyond the three documentary signals in section 1; XO's off-chain acceptance; per-chain 7702 support; public bundler terms; whether the SDK works unchanged behind a long-running daemon.

Privacy check: this file contains no email address, personal name, username, GitHub login or home path; the only addresses are public protocol contracts and the well-known public Anvil test address; no credential ID or wallet address of any user was read or recorded (no `list_credentials` call was made). Scratch files (docs, SDK text, probe scripts) are under the session scratchpad only.

## Sources

- https://docs.paybox.sh/llms-full.txt (and the page URLs under docs.paybox.sh listed in its sitemap); https://docs.paybox.sh/sitemap.xml
- https://developer.paybox.sh/llms.txt ; https://developer.paybox.sh/skill.md ; https://developer.paybox.sh/requirements.md
- https://api.paybox.sh/openapi.json ; https://api.paybox.sh/.well-known/oauth-authorization-server ; https://api.paybox.sh/.well-known/oauth-protected-resource ; https://api.paybox.sh/.well-known/api-catalog ; https://api.paybox.sh/skill.md
- https://unpkg.com/@paybox-sh/sdk@2.2.0/ (README.md, SKILL.md, package.json, dist/index.d.ts, dist/index.js, dist/cli.js, dist/chunk-DWDC6W5P.js) ; https://registry.npmjs.org/@paybox-sh/sdk ; https://registry.npmjs.org/@paybox-sh/connect-react
- https://www.moonpay.com/newsroom/moonpay-paybox
- https://docs.zerodev.app/get-started/eip-7702/quickstart
- https://github.com/modelcontextprotocol/ext-apps (specification/2026-01-26/apps.mdx)
- Public bundlers probed: https://public.pimlico.io/v2/8453/rpc , https://public.pimlico.io/v2/137/rpc , https://api.candide.dev/public/v3/8453
- Public RPCs used for `eth_getCode`/`eth_call`: ethereum-rpc.publicnode.com, mainnet.base.org, arbitrum-one-rpc.publicnode.com, optimism-rpc.publicnode.com, polygon-bor-rpc.publicnode.com, bsc-rpc.publicnode.com, avalanche-c-chain-rpc.publicnode.com, rpc.hyperliquid.xyz/evm
- Repo notes and docs cited as listed at the top.
