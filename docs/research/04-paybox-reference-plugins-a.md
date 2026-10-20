# 04 - PayBox Open Plugin reference repos (A): paylink-guard, arcanum-plugin, and the upstream starter

Researched 2026-10-18/19 (session date 2026-10-19). READ-ONLY. Nothing was cloned, installed, built or executed. Third-party files were fetched as raw text with `gh api` / `curl` into the session scratchpad and read. No money-moving or signing PayBox tool was called. No `.env`, key or wallet file was read.

Confidence tags: **H** = read first-hand in a primary source this session (path/URL cited), **M** = secondary or inferred, **L** = weak or stale.

---

## 0. TL;DR (what this changes in docs/plan.md)

1. **The upstream starter is found and hash-verified.** It is not a GitHub repo. It is served as plain text by MoonPay's own developer portal: `https://developer.paybox.sh/plugin-starter/v1.0.2/` (manifest at `.../manifest.json`). Every `scripts/*.mjs`, `src/paybox.ts`, `starter-version.json`, `pnpm-workspace.yaml`, `tsconfig.json` and `.gitignore` in the two reference repos matches the portal's SHA-256 manifest byte for byte (section 2). The portal guide `https://developer.paybox.sh/requirements.md` (last-modified 2026-10-18 12:01 GMT) is the primary spec; it is the first-hand source for most "how does PayBox run a plugin" facts below. [H]
2. **A plugin is a stdio MCP server (MCP protocol 2026-07-28), run as a fresh process per operation.** Tools are registered with `McpServer.registerTool` (zod v4 schemas, `.strict()`), served with `serveStdio(createServer, { legacy: "reject" })`. [H]
3. **A write = one `io.paybox/transactionProposal` in `structuredContent`, kinds `evm | solana | x402`, ONE call per proposal, expiry <= 5 min, no other fields.** No multi-call batches, no description/simulation-hint/gas fields, no off-chain-signature kind. XO's "enable trading" (USDC approve + ERC-1155 operator approval) is therefore two proposals, two approvals. [H]
4. **No plugin storage, no per-user secrets.** "Every operation uses a fresh sandbox." Env vars are plugin-wide and "non-sensitive"; real secrets are host-scoped brokered headers set by the plugin OWNER and used for all users. Per-request HMAC signing cannot use brokered headers. The plan's gate 1 ("per-user HMAC credentials held by the plugin") has no supported home in this model. [H for the docs, M for the HMAC inference]
5. **Daily counters ($50/day, 2 creates/day) cannot live in the plugin.** Neither reference plugin has one. paylink-guard has only stateless per-call caps and a stateless HMAC confirmation code; arcanum keeps its daily/30-day counters ON-CHAIN in its GuardedWallet contract and merely mirrors them by reading. We need read-derived counters, an on-chain policy contract, or an external state service reached over an allowlisted host. [H facts, M design]
6. **Gate 8 (sign-then-submit): PARTIAL.** Plugin-internal sign-then-submit is impossible with the documented contract (no proposal kind for typed data; plugins cannot call PayBox tools). An agent-orchestrated prepare -> `request_wallet_sign` (typedData) -> submit is supported by PayBox primitives but is demonstrated by neither reference repo. docs.paybox.sh says plugin money tools "always pause for the user's approval, even under an autonomous grant", but PayBox's own docs contradict each other on autonomous signing (section 8). [H/M]
7. **New release-blocking risk for the plan: the developer portal is a hackathon portal.** Uploads for a hackathon entry close at the deadline (2026-10-17 20:00 EDT, already past). Whether a non-participant can upload a new plugin now is NOT FOUND. [H for the text, open question]

---

## 1. Method and safety log

- Read `docs/plan.md` and `docs/research-notes.md` first. All XO and PayBox claims in them treated as leads; the PayBox claims below are re-verified against primary sources where stated.
- `gh api -H "Accept: application/vnd.github.raw" repos/OWNER/REPO/contents/PATH` for every file listed in the repo trees. `gh search code` / `gh search repos` / `gh api orgs/moonpay/repos` for the upstream-starter hunt.
- `curl -sS -m 20` (GET only, no auth, no cookies) to: `developer.paybox.sh` (static starter files, guide, skill.md, terms, home page), `docs.paybox.sh` (llms.txt, sitemap, four concept/reference pages), `registry.npmjs.org` (package metadata), `unpkg.com` (read two files of `@modelcontextprotocol/server@2.0.0` to see how tool errors are serialized; read as text, not run).
- Loaded (did not call) the schemas of `use_plugin`, `discover_plugins`, `get_contract`, `get_request` through ToolSearch to read their descriptions.
- One process slip, disclosed: my first batch-download command included an `rm -f` of temp files with variable expansion; the harness safety check blocked it. I did not work around it; I re-ran the downloads without any removal step. Nothing was deleted.
- Files written: only this notes file. `docs/research/fixtures/` was left empty (no fixtures needed for this task).
- Scratch copies (untrusted data, never executed): `<scratchpad>/pl/` (paylink-guard), `<scratchpad>/arc/` (arcanum-plugin), `<scratchpad>/portal/` (developer.paybox.sh + docs.paybox.sh), `<scratchpad>/ladder/`, `<scratchpad>/refpay/`, `<scratchpad>/sdk/`.

---

## 2. Upstream starter: found, and how we know

### 2.1 Where it lives [H]

- Portal guide section "Copy the starter files": "Starter release **1.0.2**. File checksums identify this release." with links to `./plugin-starter/v1.0.2/<file>.txt` (https://developer.paybox.sh/requirements.md lines 54-86).
- Manifest: https://developer.paybox.sh/plugin-starter/v1.0.2/manifest.json (1409 bytes) lists SHA-256 for: `.gitignore, package.json, paybox-plugin.json, pnpm-lock.yaml, pnpm-workspace.yaml, tsconfig.json, src/plugin.ts, src/paybox.ts, scripts/{conformance,test,process,report,schema}.mjs, starter-version.json`, plus `version 1.0.2, protocolVersion 2026-07-28, node 24.21.0, pnpm 11.11.0`.
- Three example `src/plugin.ts` replacements: `.../plugin-starter/examples/{repository-info,base-transfer,x402-request}.ts.txt`. The ladder repo's `plugin/examples/*.ts` are byte-identical to the portal's `base-transfer.ts` and `repository-info.ts` (cmp verified).
- Agent-oriented guide: https://developer.paybox.sh/skill.md (2095 bytes; tells a coding agent to read requirements.md and use the starter files).
- Fresh: `requirements.md` `last-modified: Sun, 18 Oct 2026 12:01:46 GMT`; starter `plugin.ts.txt` `last-modified: Fri, 16 Oct 2026 16:50:01 GMT`. Not stale.
- Probed `plugin-starter/{v1.0.0,v1.0.1,v1.0.3,v1.1.0,v1.1.1,v2.0.0,latest}/manifest.json`: all 404. 1.0.2 is the only starter version I found (not an exhaustive search).

### 2.2 Hash verification of the reference repos against the portal manifest [H]

SHA-256 computed locally on the fetched files; manifest values from the portal.

| File | paylink-guard | arcanum-plugin | Matches portal manifest |
|---|---|---|---|
| `scripts/conformance.mjs` | c562913a...4445 | c562913a...4445 | yes (both) |
| `scripts/test.mjs` | 6cbccaac...b4656 | 6cbccaac...b4656 | yes (both) |
| `scripts/process.mjs` | 097a0e57...7e6 | 097a0e57...7e6 | yes (both) |
| `scripts/report.mjs` | 23b07a80...6226 | 23b07a80...6226 | yes (both) |
| `scripts/schema.mjs` | 22d76374...bfa | 22d76374...bfa | yes (both) |
| `src/paybox.ts` | 65608cd3...ca | 65608cd3...ca | yes (both) |
| `starter-version.json` | 4ecd2912...811 | 4ecd2912...811 | yes (both) |
| `tsconfig.json` | 0eeb98e5...b10 (pristine) | 3b015dd6... (adds `skipLibCheck`) | paylink only |
| `pnpm-workspace.yaml` | 99c28a8a... (adds overrides) | dad6d0d0...b (pristine) | arcanum only |
| `.gitignore` | 58aea3d6...a62b (pristine) | adds `.tools/` | paylink only |
| `package.json`, `src/plugin.ts`, `paybox-plugin.json` | modified | modified | n/a (expected to be edited) |

Arcanum's `NOTICE` independently states the provenance: "includes the PayBox plugin starter (release 1.0.2) from MoonPay's PayBox developer portal: scripts/*.mjs, src/paybox.ts, pnpm-workspace.yaml and starter-version.json" (arcanum-plugin/NOTICE:4-5). [H]

`scripts/call.mjs` is NOT part of the starter manifest. It exists only in paylink-guard (author's addition): "Calls one tool on dist/plugin.mjs the way the PayBox sandbox does: one fresh process per operation." (pl/scripts/call.mjs:1).

### 2.3 Other places searched [H]

- `gh search code "starter-version.json"` returned only downstream hackathon repos (e.g. `udirobert/elcaro`, `drizzy765/refpay`, `kinnuworks/ladder`, `thesithunyein/bill402`, `Blockchain-Oracle/akashi`, `Blockchain-Oracle/hako`) - all copies of the portal starter. `kinnuworks/ladder/plugin/.starter-manifest.json` is a copy of the portal manifest.
- `gh api orgs/moonpay/repos`: only `moonpay/skills`, `moonpay/moonpay-demo-integrations`, `moonpay/paybox-plugin`, `moonpay/devops-challenge`. `moonpay/paybox-plugin` (pushed 2026-09-18) is the AGENT-side plugin (`.grok-plugin/plugin.json`, `.mcp.json`, three `skills/*/SKILL.md`), not the plugin-authoring starter. NOT FOUND: any public MoonPay GitHub repo for the starter.
- `drizzy765/refpay/docs/paybox-requirements.md` is byte-identical to the portal's `requirements.md` (cmp verified), i.e. a third-party snapshot of the same guide. `floflo777/undo/research/01_paybox_tech.md` also mentions it (not read).

---

## 3. The two reference repos at a glance [H]

| | paylink-guard | arcanum-plugin |
|---|---|---|
| URL | https://github.com/theluckystrike/paylink-guard | https://github.com/bunnyyxtan/arcanum-plugin |
| License | MIT (Copyright 2026 Michael Lip) | Apache-2.0 (Copyright 2026 Bunnyy) |
| Created / pushed | 2026-10-17T14:17Z (1 commit) | 2026-10-17T21:24Z (few commits) |
| Purpose | Check and pay EIP-681 / Solana Pay links | Propose calls to an ARCANUM on-chain policy wallet (Base, Arc) |
| Tools | 5: `create_payment_link, check_payment_link, pay_base_link, pay_solana_link, verify_payment` | 10: `arcanum_{status,preflight,pay,freeze,unfreeze,add_vendor,fund,create_wallet,find_wallet,deploy}` |
| Proposal kinds used | evm (Base), solana | evm only |
| Unit tests | 253 (my static count 48+13+62+38+50+6+36 = 253, matches README) | 6 unit tests (test/arcanum.test.ts) + anvil-fork e2e (test/fork.e2e.ts) |
| CI | none (no `.github/`) | `.github/workflows/ci.yml` |
| SECURITY / CONTRIBUTING | none | both |
| Deps | `@modelcontextprotocol/server 2.0.0, viem 2.51.3, zod 4.4.3, @solana/web3.js 1.99.0` | `@modelcontextprotocol/server 2.0.0, viem 2.21.55, zod 4.4.3` |

Maturity warning (M): both repos are one to two days old, unaudited, and their README "evidence" tables (reviews, mainnet simulations, hosted-sandbox timings) are author claims I did not reproduce. Arcanum states "The ARCANUM contracts have not had an independent audit" (README Limitations). Use them as structure references only.

Neither repo contains anything about XO, prediction markets, EIP-712 order signing, or HTTP-submit flows.

---

## 4. Plugin entry point shape

### 4.1 Skeleton (starter `src/plugin.ts`, verbatim, 36 lines; identical hash 647b11f4...) [H]

Source: https://developer.paybox.sh/plugin-starter/v1.0.2/src/plugin.ts.txt

```ts
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

const PROTOCOL_VERSION = "2026-07-28";

function createServer() {
  const server = new McpServer(
    { name: "my-plugin", version: "0.1.0" },
    { supportedProtocolVersions: [PROTOCOL_VERSION] },
  );
  server.registerTool("echo", {
      title: "Echo message",
      description: "Returns the provided message.",
      inputSchema: z.object({ message: z.string().min(1).max(256) }).strict(),
      outputSchema: z.object({ message: z.string() }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ message }) => ({ content: [{ type: "text", text: message }], structuredContent: { message } }),
  );
  return server;
}

serveStdio(createServer, { legacy: "reject" });
```

Both reference repos use exactly this frame (paylink-guard `src/plugin.ts:202-211`, arcanum `src/plugin.ts:60-61,269`).

### 4.2 Facts

- **Default export: none.** The module is an executable script: top-level `serveStdio(createServer, { legacy: "reject" })` (paylink-guard plugin.ts:211; arcanum plugin.ts:269). `dev` script is `tsx src/plugin.ts`. [H]
- **Protocol:** `supportedProtocolVersions: ["2026-07-28"]`; `legacy: "reject"` answers a 2025-era `initialize` with an unsupported-version error (`@modelcontextprotocol/server@2.0.0` `dist/stdio.d.cts`: "'reject' - the opening request is answered with the unsupported-protocol-version error"). The conformance client sends no `initialize`; each request carries `params._meta` with `io.modelcontextprotocol/protocolVersion`, `clientInfo`, `clientCapabilities` (conformance.mjs:146-153). [H]
- **Registration:** `server.registerTool(name, { title, description, inputSchema, outputSchema, annotations }, handler)`. Tools may be registered in helper functions taking `server` (paylink-guard `registerCreateLink/CheckLink/PayTools/Verify`) or inline (arcanum). [H]
- **Schema format:** zod v4 (`import * as z from "zod/v4"`) objects, converted by the SDK to JSON Schema (2020-12 required by conformance). Every input object uses `.strict()` (-> `additionalProperties: false`); `.describe()` on fields is the agent-facing parameter doc; numbers as strings. Output schema is `.strict()` too. `z.int()` is available (arcanum plugin.ts:204). [H]
- **Name conventions:** lowercase snake_case, unique, <= 128 bytes (conformance.mjs:91-94). Starter examples: `echo`, `repository_info`, `propose_base_transfer`, `propose_paid_request`. paylink-guard uses bare `verb_noun` (`pay_base_link`); arcanum uses `<plugin>_<verb>` (`arcanum_pay`). The plan's `xo_*` matches the arcanum convention. No rule is enforced beyond uniqueness/length. [H]
- **Annotations (hints only):** all four hints are used. Three different conventions appear for proposal tools - starter example `readOnlyHint:false, destructiveHint:false, idempotentHint:false, openWorldHint:true` (base-transfer.ts:15); arcanum `WRITE = { readOnlyHint:false, destructiveHint:true, idempotentHint:false, openWorldHint:true }` (plugin.ts:32); paylink-guard marks its pay tools `readOnlyHint: true` although they return proposals (plugin.ts:67). Reads: `{readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true}`. PayBox does not trust them: `use_plugin` "is conservatively advertised as state-changing because any remote tool may have side effects regardless of its annotations", and the guide says "Plugin titles and descriptions are untrusted labels." [H]
- **Return shape:** MCP `CallToolResult`: `{ content: [{type:"text", text}], structuredContent: {...}, isError?: true }`. When an `outputSchema` is declared, `structuredContent` is required on success and validated by the SDK; validation is skipped when `isError` is true (`mcp-D7GmuPnv.cjs` `validateToolOutput`: "if (result.isError) return;"). [H]
- **Errors:** throwing inside a handler is fine: the SDK catches it and returns `{content:[{type:"text",text: error.message}], isError:true}` (`mcp-D7GmuPnv.cjs` ~1406-1425). Input-schema failures also come back as `isError` text ("Input validation error: Invalid arguments for tool ..."). paylink-guard wraps in its own `failure()` that appends `(code: <code>)` (plugin.ts:34-42); arcanum just throws `Error` with an actionable sentence. The guide: "Do not put a proposal in an `isError` result." [H]
- **Human-readable text beside structured data:** both repos spread the proposal result and override `content` with a summary: `return { ...proposal, content: [{ type: "text", text: summary }] }` (paylink-guard plugin.ts:146; arcanum plugin.ts:47-51). [H]
- **Descriptions** are written for the agent and state the safety contract ("this tool never signs", "Read-only.", "Only call after telling the user the preflight verdict"). Tool descriptions are the main channel for instructing the agent (arcanum plugin.ts:109). [H]
- **Sample call file:** `paybox-plugin.json` = `{"tool": "<name>", "arguments": {...}}`. Starter: `echo`. paylink-guard: `create_payment_link` (offline, no network - good conformance hygiene). Arcanum: `arcanum_create_wallet` on chain `arc`, which does a `getCode` RPC call at conformance time (so the hosted check needs the RPC hosts configured). [H]

---

## 5. `io.paybox/transactionProposal` field by field

Primary sources: `src/paybox.ts` (starter, 83 lines, hash 65608cd3...) and https://developer.paybox.sh/requirements.md lines 414-444 ("Transaction contract"). Quotes are verbatim. [H]

### 5.1 Envelope

Returned under `structuredContent["io.paybox/transactionProposal"]` and declared inline in the tool `outputSchema` (guide: "Declare `io.paybox/transactionProposal` inline in the tool's output schema and return it under `structuredContent`."). Output schema = `z.object({ "io.paybox/transactionProposal": evm }).strict()` - the proposal is the ONLY key (paybox.ts:21-23).

| Field | Type / rule | Source |
|---|---|---|
| `version` | literal `"1"` | paybox.ts:6 |
| `kind` | `"evm" \| "solana" \| "x402"` | paybox.ts:7,11,15 |
| `expiresAt` | whole-second UTC RFC3339, regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$`; must be in the future and `<= now + 300_000 ms`; helper default `now + 240_000 ms` | paybox.ts:6,32-39; guide: "within five minutes" |
| `chain` | evm: `^eip155:(0\|[1-9][0-9]*)$` plus `< 2^64` check; solana: literal `"solana:mainnet"`; x402: `"eip155:8453" \| "solana:mainnet"` | paybox.ts:8,12,16,46 |
| all objects | `.strict()` - unknown fields rejected ("unknown fields are rejected", guide line 346) | paybox.ts |

### 5.2 `kind: "evm"`

```ts
transaction: z.object({ to: evmAddress, value: atomic, data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/) }).strict()
```
- `to`: `^0x[0-9a-fA-F]{40}$` (any case; checksum not enforced by schema).
- `value`: decimal wei string, `^(0|[1-9][0-9]{0,77})$`, must be `< 2^256` (paybox.ts:45).
- `data`: even-length hex, `<= 120 KiB` decoded (paybox.ts:47). Default `"0x"`; default `value` `"0"`.
- NOT present: `from`, `gas`, `maxFeePerGas`, `nonce`, `chainId` (it is inside `chain`), `description`, `label`, `simulation hints`, `accessList`. The guide says PayBox builds these: "PayBox constructs and simulates the transaction", "EVM proposals refresh their nonce and recheck execution without raising approved fee limits" (lines 45, 479-481).
- Chain availability: "One call only; the selected network must be available in PayBox." (guide line 424). The schema accepts ANY `eip155:<id>`; whether PayBox can simulate/sign chain 3223 is NOT FOUND (see gate 4).

### 5.3 `kind: "solana"`

`transaction: { transactionBase64: string }`, canonical padded base64, `<= 1232` bytes (paybox.ts:51-58). Guide additionally requires "exactly one required signer who is also the fee payer, and an empty signature slot", legacy or v0 only, "no durable nonce, pre-signing, extra signers or sponsor"; blockhash is replaced by PayBox, a placeholder `11111111111111111111111111111111` is accepted (guide 425-434; paylink-guard solana.ts:`ZERO_BLOCKHASH`). For Solana the agent supplies the public `sender`, and "PayBox verifies the encoded signer matches the selected wallet" (guide 409-411). For EVM no equivalent sender check is documented (NOT FOUND).

### 5.4 `kind: "x402"`

`request: { url (https, port 443 only, no credentials/fragment, <= 2048), method GET|POST, body? (JSON <= 64 KiB, none for GET) }`, `payment: { asset: <hard-coded USDC for the chain>, maxAmount: ^[1-9][0-9]{0,19}$ atomic, < 2^64 }`. Chains: Base `eip155:8453` and `solana:mainnet` only. "Custom headers and credential injection are not supported for these payment requests." (guide 273-276; paybox.ts:61-73). Relevant for gate 8 only as proof that PayBox can sign one narrow kind of typed data (EIP-3009 USDC authorization) on the plugin's behalf; it cannot be used for XO.

### 5.5 Batches, other result kinds, reads vs writes

- **Multi-call batches: NOT SUPPORTED in v1.** "V1 accepts one transaction per proposal, with no array of separate approval/swap transactions. If an additional allowance transaction is needed, propose it separately, wait for confirmation, then obtain a fresh swap quote/proposal." (guide 384-387). Arcanum CONTRIBUTING: "PayBox signs exactly one EVM call per proposal." [H]
- **Pattern for multi-step on-chain flows:** `arcanum_deploy` returns "the next module that is not deployed yet as a proposal"; "call again after each one confirms until it reports all five are live" (arcanum plugin.ts:231-249): state is re-derived from chain on every call (`getCode` on each address), so the plugin needs no storage. Reuse for `xo_enable_trading` (approve USDC -> setApprovalForAll) and `xo_fund_account`. [H]
- **Other `io.paybox/*` result kinds: NOT FOUND.** Searched: `requirements.md`, `skill.md`, both repos' `src/`, `gh search code "io.paybox/transactionProposal"`. Only `io.paybox/transactionProposal` exists in the documented contract. [H for absence in what I read]
- **Reads vs writes:** distinguished by whether the tool's `outputSchema` / result carries `io.paybox/transactionProposal`. A result with the key becomes a PayBox request (the guide: "PayBox checks the returned bytes and builds its own plan"; the tool's summary is "untrusted"). A result without it is just returned data. Annotations do not decide it. [H/M]
- **What PayBox does with a proposal:** opens its transaction window; "Review the details and approve when required, then submit"; polls `request_id`; `pending_confirmation` / `success` with tx hash; "A signed payload alone never counts as execution success." (guide 488-499). PayBox window shows network, sender, raw tx, destination and native value in wei; "It does not provide a decoded ERC-20 transfer, allowance or swap asset-change summary." (guide 393-396). [H]
- **Idempotency / `invocation_id`:** not visible to plugin code. It is a `use_plugin` argument: "For an unofficial call, generate an `invocation_id` UUID and reuse it only to retrieve that exact call's stored outcome; never retry with a new id after a timeout or ambiguous failure." `wallet_id` is "Not sent to plugin code." (use_plugin tool description). Request lifecycle: "submit once, then poll - never re-issue the original tool call" (docs.paybox.sh/concepts/requests). Plugin-level idempotency for HTTP side effects (e.g. an XO order POST) must come from a deterministic key derived from tool inputs (e.g. the quote id), because the plugin cannot remember anything. [H]

---

## 6. Env vars, secrets, per-user state, outbound HTTP, network allowlist

### 6.1 Env and secrets [H, guide lines 501-527]

- "In **Variables & Secrets**, choose Environment variable for non-sensitive `process.env` configuration."
- "For an API key, choose Secret and specify the target hostname, header name and value ... PayBox adds that header to requests to the chosen host. Your plugin makes an ordinary request to that host and does not read the secret from `process.env`."
- "Output containing the literal value of a configured brokered credential is withheld." Limits: 16 network hosts and 16 brokered credentials per plugin.
- "Installed plugins keep their code version and use the owner's latest network hosts, variables and secrets on new calls". => **secrets are owner-level and shared by every user of the plugin.** There is NO per-user secret mechanism. (NOT FOUND: any per-user credential, user id, or session handed to plugin code; `wallet_id` is explicitly withheld.)
- Hosted plugins "receive only their configured non-sensitive environment variables and approved network authority"; local runs do not inject brokered headers.
- Conformance runs the bundle with env `{ HOME: <tmpdir>, NODE_ENV: "production", NO_COLOR: "1", PATH }` only (conformance.mjs:132). Code must start and answer `tools/list` with no config present.
- Reference usage: paylink-guard reads one plain env var `PAYLINK_CONFIRM_KEY` (gate.ts:46) documented as "a random 64-character hex value" (README line 66). That puts a cryptographic key in the "non-sensitive" channel and falls back to a public default (`?? "paylink-guard-unkeyed"`), so if unset anyone can forge confirmation codes. Do not copy. Arcanum needs no env or secrets: "No secrets are needed" (README line 90).
- Inference (M): XO's reported per-request HMAC "L2" auth cannot be satisfied by brokered headers (static value per host) and would need the secret in plugin code via a non-sensitive env var, shared by all users. Gate 1 therefore needs XO auth to be either keyless/read-only, a static API key header, or signature-in-body supplied by the agent.

### 6.2 State [H]

- "**Persistent state**: Do not rely on memory or disk surviving: every operation uses a fresh sandbox." (guide line 50). "Each discovery page and sample call may run in a fresh process, so do not rely on memory surviving between calls." (line 143). Arcanum README sequence: "P->>X: tool call (fresh sandbox)".
- NOT FOUND: any plugin storage / KV / database API (searched requirements.md, skill.md, both repos' READMEs and src).
- Sandbox filesystem write permission and `HOME` writability in the hosted runtime: NOT FOUND (locally `HOME` is a temp dir).

### 6.3 Outbound HTTP wrapper [H]

- The starter has NO http wrapper and no allowlist code; the allowlist is portal config: "add only the exact hostnames your tools call; wildcards, redirect chains and arbitrary destinations are not a networking contract." (guide 503-505). Starter example uses `fetch` with `signal: AbortSignal.timeout(4_000), redirect: "error"` (repository-info.ts:16-19).
- paylink-guard `src/net.ts` (29 lines) is only a JSON-RPC fallback helper: `rpcPost(fetchFn, urls[], method, params, deadline)` tries URLs in order; skips to the next on timeout/HTTP error (incl. 429)/JSON-RPC error; refuses to start an attempt with `< 300 ms` left before `deadline`; per attempt `AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left))` with `FETCH_TIMEOUT_MS = 3000`. Callers set an 8 s budget inside the 10 s limit (verify.ts:31 `BUDGET_MS = 8000`). `fetchFn` is injected so tests stub it.
- Arcanum builds a viem client per request with `fallback(http(url, { timeout: 3000, retryCount: 0, batch: true }))` over three RPC hosts (arcanum.ts:131-135), "Each host must also be allowed in the PayBox portal; later ones are fallbacks."
- Hosts the two repos allowlist (for reference of the format): paylink-guard 5 hosts (`mainnet.base.org`, `base-rpc.publicnode.com`, `solana-rpc.publicnode.com`, `api.mainnet-beta.solana.com`, `api.gopluslabs.io`); arcanum 4 (`mainnet.base.org`, `base-rpc.publicnode.com`, `base.drpc.org`, `rpc.mainnet.arc.io`). They noted public RPCs rate-limit shared sandbox IPs ("the official one rate-limits shared sandbox IPs (HTTP 429)", types.ts:53).
- Runtime budgets: 10 s per operation; "Keep network calls out of module startup and tool discovery"; "platform failures may be retried up to three attempts" (guide 143-146, 197-201, 505-506).
- Dev-console quotas (unclear whether they also apply to end-user runs; M): "Plugin calls, hosted tests, and checks share a per-user allowance of one start per second and 1,000 starts per rolling 24 hours." Transaction validation: one active, 30 per hour (guide 217-220).

---

## 7. Build, reproducibility, toolchain

### 7.1 Build command (starter package.json, verbatim) [H]

```
"build": "esbuild src/plugin.ts --bundle --platform=node --format=esm --target=node24 --minify --outfile=dist/plugin.mjs"
```
- Bundler: esbuild 0.28.2 (`devDependencies`, exact pins everywhere, no carets). Flags: bundle, `platform=node`, `format=esm`, `target=node24`, `minify`. No sourcemap, no metafile, no define/banner (upload "Do not upload source maps").
- paylink-guard adds `--banner:js="import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);"` so a CJS dependency (`@solana/web3.js`) can `require` Node built-ins inside the ESM bundle (package.json:13). Arcanum (viem only) needs no banner.
- `pnpm-workspace.yaml` (starter): `packages: ["."]` and `allowBuilds: { esbuild: true }` (pnpm 11 install-script allowlist). paylink-guard additionally sets `allowBuilds` false for `bigint-buffer, bufferutil, utf-8-validate` and `overrides` for `ws, uuid, stream-json` "(pnpm audit 2026-10-17)".
- Toolchain: `starter-version.json` = `{ version 1.0.2, protocolVersion 2026-07-28, node 24.21.0, pnpm 11.11.0 }`; `engines: { node: "24.x", pnpm: "11.11.0" }`, `packageManager: "pnpm@11.11.0"`. Guide: "Supported: macOS and Linux with Node.js 24 and pnpm 11.11.0. CI uses Node.js 24.21.0 ... Pin the same Node patch version for reproducible builds. Native Windows is not supported." `checkEnvironment()` fails unless Node major is 24 and platform is darwin/linux (report.mjs:12-16).
- Install: `pnpm install --frozen-lockfile`; the starter ships `pnpm-lock.yaml` (395 lines) pinning `@modelcontextprotocol/server@2.0.0`, `esbuild@0.28.2`, `zod@4.4.3`. "Replace all tooling files together; do not mix starter releases." Upgrade note (M): npm shows `@modelcontextprotocol/server` latest is 2.3.1 (2026-10-05); the starter intentionally pins 2.0.0 (published 2026-07-27).

### 7.2 How byte-reproducibility is "achieved" [H facts, M interpretation]

There is no special determinism machinery. It comes from: pinned exact deps + frozen lockfile + pinned esbuild + pinned Node patch + a build with no timestamps/paths/sourcemaps. It is VERIFIED only by `scripts/test.mjs`: typecheck, build, SHA-256, build again, SHA-256, compare, else `build_not_deterministic` (test.mjs:11-21). That check is local, same machine, same toolchain. Whether PayBox rebuilds from source or compares hashes anywhere: NOT FOUND - the portal takes only the uploaded `dist/plugin.mjs` ("upload only `dist/plugin.mjs`"). So "build must be byte-reproducible" is a starter-enforced local invariant, not a documented hosted check.

### 7.3 CI (arcanum `.github/workflows/ci.yml`, 61 lines) [H]

Job `check` (ubuntu-latest, 15 min): `actions/checkout@v4`, `actions/setup-node@v4` (node-version 24), `corepack enable && corepack prepare pnpm@11.11.0 --activate`, `pnpm install --frozen-lockfile`, `pnpm unit`, `pnpm --silent test`, bundle-size gate `test "$size" -le 10485760`, upload `dist/plugin.mjs` artifact. Job `fork-e2e` (needs `check`): `foundry-rs/foundry-toolchain@v1`, `anvil --fork-url https://mainnet.base.org --port 8546 --silent &`, `pnpm e2e:fork` with `FORK_RPC=http://127.0.0.1:8546`. `permissions: contents: read`, concurrency group cancel-in-progress.

### 7.4 Test conventions [H]

`node:test` + `node:assert/strict`, run with `tsx --test test/*.test.ts` (paylink: `"unit": "tsx --test test/*.test.ts"`) or `node --import tsx --test test/*.test.ts` (arcanum). `tsconfig.json` `include` is `src/**/*.ts` only, so tests are not type-checked by `pnpm typecheck`. Network is stubbed by replacing `globalThis.fetch` and routing on host and JSON-RPC method (paylink gate.test.ts:22-40) - restore in teardown. Regression tests are named `CRITICAL regression: ...`. Fork e2e: anvil `impersonateAccount` + `setBalance` + `setStorageAt` (USDC balance slot 9) to drive the real contracts (arcanum test/fork.e2e.ts:22-55) - a good model for a chain-3223 fork test if XO chain state can be forked.

---

## 8. `scripts/*` - what the local conformance checks (approximates the hosted checks)

The hosted checks are not public. The guide says "PayBox automatically discovers your tools and shows the result in the portal" and "Preflight never calls a tool or injects brokered credentials. Your module still runs during startup and discovery" (guide 190-199), so the hosted preflight is tool discovery; whether the hosted run also executes the sample call is NOT FOUND (paylink-guard README says "Hosted PayBox sandbox | Checks pass", M).

### 8.1 `pnpm test` = `scripts/test.mjs` (1278 bytes) [H]
1. `pnpm run typecheck` (120 s cap) 2. `pnpm run build` 3. SHA-256 of `dist/plugin.mjs` 4. `pnpm run build` again 5. SHA-256 again; mismatch in hash or size -> `build_not_deterministic` 6. `testArtifact(root)`. Failure codes `typecheck_failed`, `build_failed`.

### 8.2 `scripts/conformance.mjs` `testArtifact()` - every check [H]

| # | Check | Limit / rule | Code | Line |
|---|---|---|---|---|
| 1 | Environment | Node major 24; darwin or linux | `environment_invalid` | report.mjs:12-16 |
| 2 | Artifact | file name `plugin.mjs`; readable; 1 B..10 MiB; valid UTF-8 round-trip | `artifact_invalid` | 60-74 |
| 3 | `paybox-plugin.json` | valid JSON object; `tool` non-empty string; `arguments` object; tool name <= 128 B; arguments JSON <= 64 KiB | `config_invalid`, `limit_exceeded` | 31-40 |
| 4 | `tools/list` pagination | <= 16 pages; cursors non-empty, unique, <= 1 KiB; total tools <= 256 | `tool_catalog_invalid`, `limit_exceeded` | 76-118 |
| 5 | Each tool | `name` non-empty, unique, <= 128 B; `title`/`description` strings if present; `annotations` object if present; `inputSchema` is an object | `tool_catalog_invalid` | 89-100 |
| 6 | No `x-mcp-header` anywhere in `inputSchema` | unsupported | `tool_catalog_invalid` | 101 |
| 7 | Schema size | JSON(inputSchema)+JSON(outputSchema) <= 64 KiB per tool | `limit_exceeded` | 102-104 |
| 8 | Schema validity | input and output schemas compile as self-contained JSON Schema 2020-12 (Ajv2020 `strict:false, validateFormats:false`, sync only) | `schema_invalid` | 105-106; schema.mjs:4-12 |
| 9 | Sample tool exists in `tools/list` | | `config_invalid` | 42-43 |
| 10 | Sample args validate against that tool's `inputSchema` | | `arguments_invalid` | 44; schema.mjs:15-16 |
| 11 | Sample `tools/call` runs | fresh process, 10 s, `result.isError !== true` | `timeout`, `tool_failed` | 45-50 |
| 12 | Call result shape | `content` array, <= 128 items, `isError` boolean if present | `protocol_invalid`, `limit_exceeded` | 120-125 |
| 13 | Structured output | if tool declares `outputSchema`, result must have `structuredContent` and it must validate | `result_invalid` | schema.mjs:17-21 |
| 14 | Wire protocol | stdout newline-delimited JSON only; `jsonrpc:"2.0"`; response `id` matches request (2); exactly one of `result`/`error`; no JSON-RPC `error`; `result.resultType === "complete"`; messages without `id` ignored | `protocol_invalid`, `tool_failed` | 167-187 |
| 15 | Output volume | stdout <= 256 KiB, stderr <= 16 KiB per operation | `limit_exceeded` | 15-16,136-143 |
| 16 | Startup | process must answer; exit before a response -> `startup_failed` | `startup_failed` | 170 |

Report on pass: `{reportVersion:1, starterVersion, protocolVersion, toolchain:{node,platform,arch}, durationMs, status:"passed", sampleCall:{tool,status}, artifact:{bytes,sha256}, discoveredToolCount}`; on failure `{status:"failed", code, message}` with exit code 1; plugin stdout/stderr is never echoed.

NOT checked locally: that proposal contents are valid beyond the output schema; network use; secrets in the bundle; tool-description quality; the 10 s budget under real network latency ("a local timing pass does not guarantee a hosted pass", guide 144-145).

### 8.3 Helpers [H]
- `process.mjs` (31 lines): spawns the child `detached`, race between work, error, stdin error, SIGINT/SIGTERM interrupt and a timeout (default 10 s); always `process.kill(-pid, "SIGKILL")` (whole process group) then destroys stdio and awaits close.
- `report.mjs` (33 lines): `ConformanceError(message, code)`, `release` from `starter-version.json` (`with { type: "json" }`), `checkEnvironment`, `reportConformance(run)` (single JSON line on stdout; `process.exitCode = 1` on failure; non-ConformanceError -> `local_check_failed`).
- `schema.mjs` (23 lines): Ajv 2020, as in table.
- `call.mjs` (paylink-guard only): spawns `node dist/plugin.mjs`, writes one JSON-RPC `tools/call` or `tools/list` with the `_meta` block, 10 s kill timer, prints `{ms, ...message}`. Good dev ergonomics to copy: `node scripts/call.mjs <tool> '<json>'`.

### 8.4 Hosted flow (portal guide) [H]
Upload only `dist/plugin.mjs` -> set network hosts + variables + secrets -> automatic discovery/preflight (retry after 30 s if settings were missing) -> "Test" console (load tools, run a tool; "uses real configured network access and brokered credentials"; tool lists expire after 10 minutes) -> "Validate transaction" (select one of your wallets; simulation only, once per result, within 5 minutes, 1 active and 30/hour) -> submit for review (hackathon) -> private install under "Unofficial plugins" at app.paybox.sh/plugins; "Every new code version requires manual approval" for public distribution; owners "can update runtime hosts, variables and API credentials without resubmitting code".

---

## 9. Guardrail patterns (reusable for $10/order, $50/day, 2 creates/day)

### 9.1 What paylink-guard does (src/gate.ts, risk.ts, evm.ts) [H]

- **Intent binding.** The agent must pass the user's intent as inputs: `asset`, `max_amount`, optional `expected_recipient`; the tool refuses (before any network call) on asset mismatch, recipient mismatch, or amount `> max_amount` (gate.ts:59-87, error codes `asset_mismatch`, `recipient_mismatch`, `over_max`). A per-order cap in our plugin can use the same shape, but the cap value must come from owner config (env), not from the agent.
- **Exact integer money.** `toAtomic/fromAtomic`, `^(0|[1-9][0-9]{0,77})$`, `< 2^256`; no floats.
- **Fail closed.** If every recipient check returns `unknown` the tool throws `unverified` and makes no proposal (gate.ts:98-100).
- **Verdict model.** Checks have `pass|warn|fail|unknown`; `fail` -> block, any non-pass -> caution (risk.ts:76-82). A `caution` returns a short confirm code and a reason; the agent must show the reasons and call again with the code.
- **Stateless confirmation code.** `HMAC-SHA256(key, window | rawLink | atomic | open-check-ids)` truncated to 8 hex chars, window = 5 minutes, current and previous window accepted (gate.ts:37-54). It needs no storage. Caveat: key is `process.env.PAYLINK_CONFIRM_KEY` with a public fallback (see 6.1).
- **Untrusted text sanitization.** `untrusted()` strips control chars/newlines and truncates to 60 chars and JSON-quotes merchant labels before they appear in tool text (gate.ts:21-24, summary labels "merchant label, not verified"). Directly applicable to XO market titles.
- **Bounded runtime.** 3 s per attempt, 8 s overall, parallel `Promise.all` for checks.
- **No daily counters, no spend history.** NOT FOUND (searched `src/` for daily/day/counter/spent).

### 9.2 What arcanum does (src/arcanum.ts, plugin.ts) [H]

- **Policy lives in a contract, not the plugin.** `perTxCap, daily24hCap, monthlyCap, escalationThreshold, requireAllowlist` are on-chain; the wallet keeps `dailySpent`, `monthlySpent`, `spendDay`, `spendMonth` and reverts with `TransferDenied(reason)` (walletAbi, arcanum.ts:73-102). "A payment that breaks a rule reverts in the contract, even if the agent skipped every check before it." (README).
- **Plugin mirrors, never owns.** `readWallet` reads the counters and `rolledSpend` re-implements the contract's window rollover (`nowSec / 86_400n === spendDay`) so reads show the live window (arcanum.ts:168-174, unit-tested at test/arcanum.test.ts:29-35). `arcanum_preflight` calls the contract's own `PolicyEngine.evaluate` view with `account: wallet` and maps the verdict (ALLOW/ESCALATE/DENY/FREEZE) plus plugin-only `BLOCKED` (signer not authorised, frozen, balance too low) (arcanum.ts:195-221).
- **Refuse unless the verdict allows.** `arcanum_pay` throws on DENY/FREEZE/BLOCKED; it has an escape flag `propose_even_if_denied` that still returns the proposal on DENY "so PayBox's simulation shows the contract refusing it" (plugin.ts:113,124-127). Do not copy that flag; a hard cap should have no bypass parameter.
- **Owner-only actions are checked by reading the contract** (`requireOwner`, plugin.ts:54-58). Kill switch: `arcanum_freeze` proposal.
- **Validation mirrors the contract** (`validatePolicy`, arcanum.ts:246-253) so bad envelopes fail in the plugin, not in a reverted tx.

### 9.3 Answer: how daily counters persist "without storage"

They do not persist in either plugin. paylink-guard has none; arcanum offloads them to chain state. Options for XO (design inferences, M):

| Option | Per-order $10 | $50/day | 2 creates/day | Notes |
|---|---|---|---|---|
| Stateless in plugin (env cap, check input notional) | yes | no | no | Per-call only; cap value is owner-configured env (not agent-controlled). |
| Read-derived: sum my last-24h orders/creations from XO Data API or chain events (Blockscout) by the user's address | n/a | partial | partial | Needs the agent-supplied `sender` address (unverified for EVM), indexer lag undercounts, parallel calls race; proposals unconfirmed at check time must be reserved. |
| On-chain policy contract (ARCANUM-style guarded wallet, or a small counter contract the proposal must pass through) | yes | yes | yes | Strongest, but adds a contract and a funding hop; XO's smart-wallet ownership (gate 3) unresolved. |
| External counter service on an allowlisted host with a brokered header | yes | yes | yes | Allowed by the network model (<= 16 hosts), shares one owner-level credential, atomic increments possible; adds an operated service and a trust hop. |
| Rely on PayBox grant policy | - | - | - | Not plugin-configurable; Open Plugin proposals carry no USD value field (the plan's `value_cents` is a `world`-plugin idea, NOT FOUND in the Open Plugin contract). |

---

## 10. Gate 8: sign-then-submit, and autonomous grants vs approvals

### 10.1 What the two repos contain
- paylink-guard: no off-chain signing, no HTTP submit. `grep -iE "typedData|eip-?712|signTypedData|request_wallet_sign"` over `src/` and READMEs: no hits. [H]
- arcanum: README Limitations: "Off-chain signed payment intents are out of scope. PayBox agents use the direct `executeUSDC` path." [H] Only on-chain EVM calls.
- So the reference repos are NOT evidence for a prepare -> sign -> submit pattern. NOT FOUND (searched all of `src/`, `test/`, READMEs, SECURITY, CONTRIBUTING of both).

### 10.2 What the primary docs say [H]
- Open Plugin proposals cover only on-chain `evm` / `solana` and the narrow `x402` kind. "Do not include wallet IDs, signing keys, approval modes, signatures, RPC URLs or broadcast instructions in the proposal." (guide 442-443). Plugins "may read APIs and propose transactions; PayBox handles wallet selection, policy, approval and signing." (guide 8-9).
- Plugins cannot call PayBox tools: their only channels are the MCP result and HTTPS to allowlisted hosts. (Derived from the guide's capability table; NOT FOUND: any API for a plugin to request a signature.)
- PayBox-level off-chain signing exists as an AGENT tool: `request_wallet_sign` with `intent.op = "typedData"` returns an EIP-712 `{ "signature": "0x..." }`; "pending_signature - autonomous: the signing window can sign right away", "pending_approval - the user approves with their passkey first" (https://docs.paybox.sh/reference/mcp-tools, `request_wallet_sign` section, lines ~159-190). Wallet signing "never happens in agent code": the host draws the in-chat signing window (docs.paybox.sh/concepts/requests, "The signing window").
- Therefore a feasible XO order flow is **agent-orchestrated**: (1) plugin tool `xo_prepare_order` (read-only: quote, EIP-712 payload, `quote_id`) -> (2) agent calls PayBox `request_wallet_sign` (typedData) and polls `get_request` -> (3) plugin tool `xo_submit_order(quote_id, signature)` re-verifies the signature/typed data matches the quote and POSTs to XO. Nothing in the reference repos or the guide demonstrates or forbids step 3 taking a signature as input. The unverified parts are XO-side (does XO accept a plain EOA EIP-712 signature, or only a Kernel v3 smart-account signature?) and PayBox-side (is a chain-3223 EIP-712 domain accepted by `request_wallet_sign`? "Policy rejects it outright (e.g. a chain or merchant not in the grant)").
- **Autonomous grants vs plugin approvals:** docs.paybox.sh/reference/mcp-tools lines 553-556: "Plugin tools follow all the same rules as the core surface ... plugin **money tools always pause for the user's approval**, even under an autonomous grant." Context is "first-party plugins", so applicability to unofficial Open Plugins is M. Consistent with this, arcanum's README says "PayBox puts a passkey approval in front of every transaction" (M, author claim) and the portal guide says "approve when required".
- **PayBox docs disagree internally (M, risk):** concepts/model lines 48-50 say "Regardless of mode, sensitive operations (revealing a raw secret, signing, issuing keys) require a fresh passkey assertion"; concepts/requests lines 29-34 says an autonomous grant clears wallet signs to `pending_signature` with no approval; concepts/approvals lines 18-20 says "no separate proof-of-presence check runs server-side". Treat "does autonomous skip approval for wallet signs" as unresolved on the PayBox side; for plugin proposals the explicit "always pause" sentence is the most specific statement.

### 10.3 Verdict
**Gate 8: PARTIAL.**
- Plugin-internal sign-then-submit: answered NO-GO (no mechanism).
- Agent-orchestrated prepare -> `request_wallet_sign(typedData)` -> submit: feasible by PayBox primitives, untested, undemonstrated in any reference plugin, and dependent on XO accepting the signature scheme and PayBox accepting the chain/domain.
- Autonomous grants auto-signing plugin proposals: documented as NO (plugin money tools always pause) with the internal-contradiction caveat above. Practical consequence: every XO write (enable trading, fund, create, any on-chain proposal) needs a human approval; a bot-like autonomous loop cannot place on-chain XO writes through proposals. The plan's "guardrails that hold even when a grant is autonomous" is largely moot for proposals, but still matters for the agent-orchestrated typed-data path where `request_wallet_sign` under an autonomous grant goes to `pending_signature`.

---

## 11. Plugin skeleton spec (scaffold our repo from this)

Everything marked "verbatim" must be copied byte-for-byte from `https://developer.paybox.sh/plugin-starter/v1.0.2/` (check against `manifest.json` SHA-256 values in section 2). Keep a `NOTICE` crediting the starter like arcanum does.

### 11.1 File tree

```
insurance-markets/                      (repo root IS the plugin root; conformance resolves ./dist and ./paybox-plugin.json from cwd)
  package.json                          name "xo-paybox-plugin"; see 11.2
  pnpm-lock.yaml                        generate with pnpm 11.11.0 from starter lock + added deps; commit; CI uses --frozen-lockfile
  pnpm-workspace.yaml                   verbatim starter (packages ["."], allowBuilds esbuild: true)
  tsconfig.json                         verbatim starter (strict, noUncheckedIndexedAccess, NodeNext, types ["node"], include src/**/*.ts)
  starter-version.json                  verbatim
  .gitignore                            dist/ node_modules/   (add .tools/ if used)
  .gitattributes                        "* text=auto eol=lf"  (arcanum) - keeps hashes stable across OSes
  .editorconfig                         lf, 2 spaces (arcanum)
  paybox-plugin.json                    {"tool":"xo_<offline-tool>","arguments":{...}}  (see 11.5)
  NOTICE                                credit starter 1.0.2 (scripts/*.mjs, src/paybox.ts, pnpm-workspace.yaml, starter-version.json)
  scripts/{conformance,process,report,schema,test}.mjs    verbatim; do not edit
  scripts/call.mjs                      optional, copy from paylink-guard (not in starter manifest)
  src/paybox.ts                         verbatim
  src/plugin.ts                         createServer() + register modules + serveStdio
  src/net.ts                            bounded fetch/RPC with deadline + redirect:"error" (adapt paylink net.ts)
  src/config.ts                         env parsing with defaults (must not throw when env is empty)
  src/xo/{client,types}.ts, src/tools/{read,fund,trade,create}.ts, src/guardrails/*.ts   (per plan; each tool module exports registerX(server))
  test/*.test.ts                        node:test; stub globalThis.fetch; one failing-case test per guardrail
  test/fork.e2e.ts                      optional anvil fork (arcanum pattern) if chain 3223 can be forked
  .github/workflows/ci.yml              copy arcanum ci.yml (drop fork job until needed)
  docs/                                 existing
```

### 11.2 `package.json` (derive from starter, verbatim keys)

```json
{ "name": "xo-paybox-plugin", "version": "0.1.0", "private": true, "type": "module",
  "engines": { "node": "24.x", "pnpm": "11.11.0" }, "packageManager": "pnpm@11.11.0",
  "scripts": {
    "dev": "tsx src/plugin.ts",
    "build": "esbuild src/plugin.ts --bundle --platform=node --format=esm --target=node24 --minify --outfile=dist/plugin.mjs",
    "conformance": "node scripts/conformance.mjs",
    "test": "node scripts/test.mjs",
    "typecheck": "tsc --noEmit",
    "unit": "tsx --test test/*.test.ts" },
  "dependencies": { "@modelcontextprotocol/server": "2.0.0", "zod": "4.4.3", "viem": "<exact>" },
  "devDependencies": { "@types/node": "24.12.2", "ajv": "8.20.0", "esbuild": "0.28.2", "tsx": "4.23.12", "typescript": "5.9.3" } }
```
Exact pins only. Add `viem` (both repos use it for ABI encoding; the guide's own example uses `viem@2.51.3`). Pin Node to 24.21.0 in CI and local (`.nvmrc` suggested; the guide recommends the same patch for reproducible builds). Add the `--banner:js=` createRequire shim only if a bundled CJS dependency needs it.

### 11.3 `src/plugin.ts` structure (derived, not verbatim)

```ts
const PROTOCOL_VERSION = "2026-07-28";
function createServer() {
  const server = new McpServer({ name: "xo-market", version: "0.1.0" }, { supportedProtocolVersions: [PROTOCOL_VERSION] });
  registerReadTools(server);      // xo_search, xo_get_market, ... readOnlyHint true
  registerFundingTools(server);   // returns evmOutputSchema proposals
  registerTradeTools(server);
  registerCreateTools(server);
  return server;
}
serveStdio(createServer, { legacy: "reject" });
```
- No network or heavy work at import time or in `createServer()`; `tools/list` must work with an empty env.
- One tool = one read OR one proposal (arcanum CONTRIBUTING). Write tools: `outputSchema: evmOutputSchema`, return `{ ...proposeEvm({ chain: "eip155:3223", to, value, data }), content: [{type:"text", text: humanSummary}] }`.
- Pin `chain`, contract addresses, USDC.e address and decimals as constants (arcanum `DEPLOYMENTS` table pattern); never accept them from the agent.
- Inputs: `z.object({...}).strict()`; amounts as decimal strings parsed with exact-integer helpers (`atomicAmount` from `paybox.ts`, arcanum `parseUsdc`); addresses validated and checksummed (viem `getAddress`).
- Reads return `structuredContent` that is a labeled data object; market text fields go through an `untrusted()` sanitizer (gate.ts pattern) and are labeled as data.
- Multi-step on-chain flows (`xo_enable_trading`, `xo_fund_account`): "next missing step" tool that reads chain state and returns ONE proposal per call (arcanum_deploy pattern).
- Annotations: reads `{readOnlyHint:true, destructiveHint:false, idempotentHint:true, openWorldHint:true}`; proposals/HTTP writes `{readOnlyHint:false, destructiveHint:true, idempotentHint:false, openWorldHint:true}` (arcanum). Treat as UX hints only.
- Errors: `throw new Error("actionable sentence")` (SDK -> `isError`); never return a proposal with `isError`.
- Timeouts: `AbortSignal.timeout(3000)` per attempt, overall deadline 8 s, parallelize reads, `redirect: "error"`; fallback hosts only if allowlisted.
- Logging: stderr only, short (stderr cap 16 KiB, stdout reserved for MCP).

### 11.4 Hosted configuration to prepare (portal "Test & configure")
- Network hosts: exact hostnames only (no wildcards, no redirects), <= 16: XO API host(s), XO RPC (candidate `rpc-mainnet-2.xo.market` is unverified), Blockscout host, any fallback RPC.
- Variables (non-sensitive): caps (`XO_MAX_ORDER_USD`, `XO_MAX_DAY_USD`, `XO_MAX_CREATES_PER_DAY`) with safe in-code defaults. Never keys.
- Secrets: only static host-scoped header credentials (e.g. an XO API key header) - shared across all users of the plugin.

### 11.5 Conformance sample
Choose an OFFLINE, always-succeeding tool for `paybox-plugin.json` (e.g. `xo_validate_market_draft` with fixed args, or a pure-compute quote helper), as paylink-guard does with `create_payment_link`. Arcanum's network-dependent sample means a hosted check can fail on a missing host setting. Keep a live read tool (e.g. `xo_get_markets`) for the portal Test console.

### 11.6 Definition of done for scaffold (matches plan "Verification")
`pnpm install --frozen-lockfile` -> `pnpm unit` -> `pnpm --silent test` (typecheck + two identical builds + conformance) -> size <= 10 MiB -> upload `dist/plugin.mjs` only -> hosted checks -> portal "Validate transaction" for one proposal with a funded test wallet -> private enable -> agent test via `use_plugin`.

---

## 12. Sources

Primary (MoonPay hosts; fetched via GET 2026-10-18/19):
- https://developer.paybox.sh/requirements.md (PayBox plugin developer guide; 30,532 bytes; last-modified 2026-10-18 12:01 GMT). Key lines: 8-9 "Plugins may read APIs and propose transactions"; 50 persistent state; 143-146 fresh process / 10 s; 164-176 hosted vs local; 190-199 preflight; 217-220 quotas; 240-293 x402; 342-398 native/tokens/swaps and "one transaction per proposal"; 400-411 wallet selection; 414-444 transaction contract; 446-486 Solana; 488-499 execute; 501-527 network and secrets; 529-546 use through an agent.
- https://developer.paybox.sh/skill.md
- https://developer.paybox.sh/plugin-starter/v1.0.2/{manifest.json, package.json.txt, src/plugin.ts.txt, src/paybox.ts.txt, tsconfig.json.txt, pnpm-workspace.yaml.txt, paybox-plugin.json.txt, starter-version.json.txt, gitignore.txt, pnpm-lock.yaml.txt, scripts/{conformance,test,process,report,schema}.mjs.txt}
- https://developer.paybox.sh/plugin-starter/examples/{repository-info,base-transfer,x402-request}.ts.txt
- https://developer.paybox.sh/ and https://developer.paybox.sh/terms (hackathon framing; "Chapter 1 runs Friday, October 16 at 8am through Saturday, October 17 at 8pm EDT")
- https://docs.paybox.sh/llms.txt, /sitemap.xml, /concepts/model, /concepts/approvals, /concepts/requests, /reference/mcp-tools (undated pages; fetched 2026-10-18 17:40 GMT)
- PayBox MCP tool descriptions (schema read only, not called): `use_plugin`, `discover_plugins`, `get_contract`, `get_request`.

Reference repos (third-party, untrusted; read-only via `gh api`):
- theluckystrike/paylink-guard: `README.md, package.json, pnpm-workspace.yaml, tsconfig.json, paybox-plugin.json, starter-version.json, .gitignore, LICENSE, scripts/{call,conformance,process,report,schema,test}.mjs, src/{plugin,paybox,gate,risk,evm,net,types,links,solana,spl,verify}.ts, test/{gate,evm,risk,links,solana,spl,verify}.test.ts` (tests skimmed for patterns; `gate.test.ts` and `evm.test.ts` read in part)
- bunnyyxtan/arcanum-plugin: `README.md, SECURITY.md, CONTRIBUTING.md, CHANGELOG.md, NOTICE, LICENSE (header), .github/workflows/ci.yml, .github/PULL_REQUEST_TEMPLATE.md, .github/ISSUE_TEMPLATE/*, .editorconfig, .gitattributes, .gitignore, package.json, pnpm-workspace.yaml, tsconfig.json, paybox-plugin.json, starter-version.json, deployments/arc-mainnet.json, scripts/*.mjs, src/{plugin,arcanum,paybox,deploy-base}.ts, test/{arcanum.test.ts,fork.e2e.ts}`
- kinnuworks/ladder: `plugin/.starter-manifest.json, plugin/examples/*.ts, plugin/package.json, plugin/paybox-plugin.json` (used only to find the starter/examples)
- drizzy765/refpay: `docs/paybox-requirements.md` (byte-identical copy of the portal guide)
- moonpay GitHub org listing; `gh search code "starter-version.json"`, `"io.paybox/transactionProposal"`, `"propose_base_transfer"`, `"Read MCP SDK repository information"`; `gh search repos "paybox plugin starter"`, `"paybox-plugin"`.
- npm: https://registry.npmjs.org/@modelcontextprotocol%2fserver (+ `/2.0.0`); unpkg `@modelcontextprotocol/server@2.0.0/dist/{stdio.d.cts, mcp-D7GmuPnv.cjs}` (read as text).

Short load-bearing quotes (<=25 words):
- "Do not rely on memory or disk surviving: every operation uses a fresh sandbox." (requirements.md:50)
- "V1 accepts one transaction per proposal, with no array of separate approval/swap transactions." (requirements.md:384)
- "choose Environment variable for non-sensitive `process.env` configuration." (requirements.md:508)
- "use the owner's latest network hosts, variables and secrets on new calls" (requirements.md:517)
- "Do not include wallet IDs, signing keys, approval modes, signatures, RPC URLs or broadcast instructions in the proposal." (requirements.md:442)
- "plugin money tools always pause for the user's approval, even under an autonomous grant." (docs.paybox.sh/reference/mcp-tools:555)
- "Off-chain signed payment intents are out of scope." (arcanum-plugin/README.md:155)
- "PayBox signs exactly one EVM call per proposal." (arcanum-plugin/CONTRIBUTING.md:32)
- "Arc is read-only from PayBox until PayBox signs on Arc." (arcanum-plugin/README.md:73)

---

## 13. Not found (with what was searched)

- Upstream starter as a public GitHub repo: NOT FOUND (moonpay org listing; `gh search code starter-version.json`; `gh search repos`). The portal is the source.
- A starter version newer than 1.0.2: NOT FOUND (404 probes of six version paths).
- Any `io.paybox/*` key other than `transactionProposal`: NOT FOUND.
- Multi-call / batched proposal; `description`, `label`, `from`, `gas`, simulation-hint, USD-value (`value_cents`) fields: NOT FOUND, schema is strict and the guide says unknown fields are rejected.
- Proposal kind for off-chain typed data / personal_sign / HTTP-submit follow-up: NOT FOUND.
- Plugin storage / KV / per-user secrets / per-user identity passed to plugin code: NOT FOUND.
- Daily/weekly spend counters in any reference plugin: NOT FOUND (paylink: none; arcanum: on-chain only).
- Sender-address verification for EVM proposals: NOT FOUND (only Solana is documented as verified).
- Public list of chains PayBox can simulate/sign for Open Plugin proposals: NOT FOUND in requirements.md ("the selected network must be available in PayBox"). Indirect evidence only: arcanum ships Arc (5042) support "read-only from PayBox until PayBox signs on Arc" (README:73) - so a chain accepted by the schema is not necessarily signable.
- Hosted conformance source or its exact checks: NOT FOUND (not public; section 8 is the local approximation).
- Statements about autonomous grants in either reference repo: NOT FOUND (only arcanum's "PayBox puts a passkey approval in front of every transaction").
- paylink-guard CI workflow, SECURITY.md, CONTRIBUTING.md: absent from the repo tree.
- Anything XO-specific: out of scope for this task.

## 14. Open questions

1. Does PayBox support chain 3223 for EVM proposals (simulate + sign + broadcast), and for `request_wallet_sign` typedData with a 3223 domain? How to test without money: the portal's "Validate transaction" with one of our wallets (simulation only).
2. Can a non-hackathon developer upload a new plugin to developer.paybox.sh now (portal text is hackathon-scoped; uploads closed 2026-10-17 20:00 EDT; "a new mission every month")? When does the marketplace open publicly?
3. Do hosted checks run the sample `tools/call` or only discovery, and with which env/network config?
4. Is `sender` supplied by the agent verified against the selected wallet for EVM proposals? If not, any read-derived daily counter keyed by `sender` is spoofable.
5. Do plugin runs by END USERS count against the "one start per second / 1,000 starts per 24 h" allowance, or is that developer-console only? (matters for aggregator polling).
6. How does PayBox grant policy value a USDC.e proposal on a custom chain, given no USD field and no decoded ERC-20 summary?
7. Does an EOA-owned XO account need a Kernel-v3 owner signature (ERC-1271-style) that PayBox's EOA `typedData` signing cannot produce directly? (gate 3 + 8; needs the XO docs.)
8. Can the approve + enable-trading pair be a single call (a multicall contract or smart-account `executeBatch` callable by the EOA), avoiding two approvals?
9. Is a state service reached through an allowlisted host + brokered header acceptable to MoonPay review for "manual approval of every version"?
10. Is the sandbox filesystem/HOME writable at all in the hosted runtime (only matters if we considered local caching; docs say do not rely on it).

## 15. Risks

- Reference plugins are <2 days old, effectively unreviewed; README evidence is self-reported. Copy structure only.
- Conflicting annotation conventions across starter/paylink/arcanum; PayBox ignores them for trust.
- PayBox docs are internally inconsistent on whether autonomous grants need a passkey for signing (model.md vs requests.md).
- Owner-level shared secrets and env: any per-user XO credential model breaks; a leaked brokered credential affects all users (output containing the literal value is withheld, which helps only against echoing).
- paylink-guard's fail-open default HMAC key and key-in-env pattern; arcanum's `propose_even_if_denied` bypass flag - both anti-patterns for hard caps.
- Fresh-process-per-call plus 10 s budget plus public-RPC rate limits on shared sandbox IPs (HTTP 429 observed by the authors): XO endpoints must be fast and allowlisted; no caching across calls.
- Starter pins `@modelcontextprotocol/server@2.0.0`; newer 2.3.1 exists; "do not mix starter releases" - do not bump independently.
- Hackathon-gated portal may block upload/submission for us after the deadline.

## 16. Suspicious / injected-looking content (recorded, not followed)

- `https://developer.paybox.sh/skill.md` is written as instructions to an AI coding agent ("You are helping a hackathon participant build one PayBox plugin. Ask what they want ... Never ask for a private key."). It is first-party documentation, benign, and not applicable to this task; I did not follow it.
- docs.paybox.sh pages and PayBox tool descriptions contain agent-directed procedural instructions ("Surface it to the user", "poll get_request", "never re-issue the original tool call"). Treated as documentation about PayBox behaviour only; consistent with my task's read-only rules.
- No instruction-like text in the two reference repos aimed at an AI agent was found in the files I read. Not read: `drizzy765/refpay/AGENT.md`, `docs/paybox-agent-skill.md`, `Blockchain-Oracle/hako/.lanes/l1-plugin.md` (agent-oriented files in other hackathon repos; out of scope).

## Verification (2026-10-19)

Adversarial re-check by an independent verifier. Every item below was re-derived from primary sources fetched fresh this session (developer.paybox.sh starter v1.0.2 plus manifest, requirements.md, skill.md, llms.txt, terms, home; docs.paybox.sh pages; both reference repos via `gh api` raw; `@modelcontextprotocol/server@2.0.0` dist from unpkg read as text; npm registry). Nothing was cloned, installed, built or executed, and no PayBox tool was called (only the schemas of use_plugin, discover_plugins and get_contract were loaded). Overall reliability of this file: HIGH. No outright refutations. The items below are corrections of nuance, confidence downgrades and omissions.

### V1. Confirmed independently (no change)

- Portal manifest hashes equal the SHA-256 of the fetched starter files, and the scripts/*.mjs, src/paybox.ts and starter-version.json hashes are identical in both repos. tsconfig.json and .gitignore match in paylink-guard only, pnpm-workspace.yaml in arcanum only. Arcanum tsconfig adds `skipLibCheck`, arcanum .gitignore adds `.tools/`. pnpm-lock.yaml.txt hashes to the manifest value and is 395 lines. kinnuworks/ladder `.starter-manifest.json` equals the portal manifest and its base-transfer.ts equals the portal example. drizzy765/refpay `docs/paybox-requirements.md` is byte-identical to the portal requirements.md (30,532 bytes).
- `src/paybox.ts` (83 lines) read in full. Schema, regexes and helper checks are exactly as stated in section 5: version "1", kinds evm|solana|x402, strict objects, evm chain regex plus `< 2^64`, `value < 2^256`, calldata <= 120 KiB, expiry within 300,000 ms with default 240,000 ms, outputSchema is `{ [key]: proposal }.strict()` so the proposal is the only key. No `from`, `gas`, `description` or batch field exists. All 12 occurrences of `io.paybox/` in the portal files, both repos and the three examples are `io.paybox/transactionProposal`.
- Guide quotes confirmed at the cited lines: 50 (fresh sandbox), 384-387 (one transaction per proposal), 393-396 (no decoded ERC-20 summary), 400-407 (wallet_id not sent to plugin code), 414-444 (contract; "Do not include ... signatures" at 442-443), 503-527 (hosts, env, brokered headers, owner's latest settings, 16 hosts and 16 credentials).
- scripts/conformance.mjs, schema.mjs, report.mjs, process.mjs, test.mjs: every check, limit and error code in section 8.2 matches the code. Limits confirmed: 10 MiB, 256 KiB stdout, 16 KiB stderr, 256 tools, 16 pages, 64 KiB schema per tool, 128 B names, 1 KiB cursors, 128 content items, 64 KiB args, 10 s per operation, env `{HOME,NODE_ENV,NO_COLOR,PATH}`, `resultType === "complete"`. test.mjs builds twice and compares size plus SHA-256, with a 120 s cap per pnpm step.
- SDK 2.0.0 (`mcp-D7GmuPnv.cjs` lines 1397-1415, 1440-1446): a thrown handler error becomes `{content:[{type:"text",text}], isError:true}`; `validateToolOutput` returns early when `result.isError` is set; missing structuredContent when an outputSchema exists is an error. npm: 2.0.0 published 2026-07-27T23:55Z, dist-tag latest 2.3.1 published 2026-10-05T11:52Z.
- Reference repos: paylink-guard has 5 tools, 1 commit, created 2026-10-17T14:17Z, MIT, no .github. Arcanum has 10 tools, 6 commits, Apache-2.0, ci.yml as described (Node `24`, not pinned to 24.21.0). paylink test count is 253 (48+13+62+38+50+6+36); arcanum has 6 unit tests. paylink-guard `gate.ts:46` has the `?? "paylink-guard-unkeyed"` fallback, `plugin.ts:67` `annotationsPay` has `readOnlyHint: true` and is used on the pay tools (lines 141, 160), `net.ts` has 300 ms and 3000 ms (`types.ts:59`), `verify.ts:31` has 8000 ms. Arcanum has `propose_even_if_denied` (plugin.ts:113,125), `rolledSpend` (arcanum.ts:169) and the `arcanum_deploy` next-missing-step logic (plugin.ts:231-249).
- README quotes confirmed: arcanum README.md:73 "Arc is read-only from PayBox until PayBox signs on Arc.", :155 "Off-chain signed payment intents are out of scope.", CONTRIBUTING.md:32 "PayBox signs exactly one EVM call per proposal."
- No `typedData`, `eip712`, `request_wallet_sign`, `personal_sign` or `autonomous` string appears anywhere in either repo (grep over all fetched files except lockfiles). The only grant/approval sentence is arcanum README:9 "PayBox puts a passkey approval in front of every transaction".
- NOT FOUND items re-searched with different terms and still not found: a public GitHub starter repo (moonpay org has exactly 4 repos: devops-challenge, moonpay-demo-integrations, skills, paybox-plugin; none contains a starter; `gh search repos "paybox plugin starter"` returns nothing); starter versions other than 1.0.2 (manifest.json at v1.0.3, v1.1.0, v2, plugin-starter/manifest.json, latest.json, versions.json all 404); any other `io.paybox/*` key; any storage, KV, user id or session concept in requirements.md (grep for storage, database, kv, cache, session, user id, identity, per-user, caller, context); batch or array proposals.
- No secrets, API keys, emails or hex addresses of any kind are present in this file (regex scan for `0x` + 8 hex chars, key/secret/token patterns, e-mail patterns and home-directory paths returned nothing).

### V2. Corrected or downgraded

1. **"A plugin is a stdio MCP server in a fresh sandbox" and the NOT FOUND set for storage, per-user secrets and user identity (sections 0.2, 0.4, 6.2, gate 1) hold for HOSTED bundles only.** The guide itself distinguishes two classes: requirements.md:273-275 "Hosted payment endpoints must use a configured network host; remote plugins use their connected origin." The `use_plugin` tool description says "Unofficial plugins call the authenticated user's enabled remote MCP installation", and `discover_plugins` says "one of this user's enabled remote plugins". developer.paybox.sh/llms.txt labels requirements.md the "Hosted-plugin authoring guide". How a remote plugin is registered, whether third parties may do it, whether it can return `io.paybox/transactionProposal`, and whether it receives any user or session identity are all NOT FOUND (searched requirements.md, skill.md, llms.txt, docs.paybox.sh pages, portal JS chunks, gh search). If remote plugins are open to third parties they would change gates 1 and 8 (server-side state, per-user credentials, daily counters). Treat as an open lead, not a finding. Gate 1 stays partial.
2. **Summary fact "PayBox treats a result as a write only if it contains the transactionProposal" is M, not H.** The guide only says to declare the proposal inline in the outputSchema and return it in structuredContent (requirements.md:416) and that console tests show proposals "as data only" (:213-214). It does not say any other result is never treated as a write, and `use_plugin` is advertised as state-changing regardless of annotations. Section 5.5 already tags this [H/M]; the structured summary should have said M.
3. **Gate 8 / section 10.3 "Autonomous grants ... documented as NO (plugin money tools always pause)" is overstated.** The sentence (docs.paybox.sh/reference/mcp-tools:553-556) sits under "Plugin tools" whose first sentence is "PayBox has first-party plugins". It is not documented for Open Plugins. Correct wording: "documented for first-party plugins; UNVERIFIED for Open Plugins". Gate status stays partial.
4. **"PayBox docs contradict each other on autonomous signing" is a tension, not a hard contradiction.** concepts/model:48-50 says "Regardless of mode, sensitive operations (revealing a raw secret, signing, issuing keys) require a fresh passkey assertion". concepts/requests:32-33 says autonomous wallet signs "move to pending_signature — they still need the signing window". concepts/approvals says wallet grants in iframe mode "confirm in the in-chat signing window, which then signs and submits immediately". The fresh assertion could be the signing window itself. Still unresolved, but not provably contradictory.
5. **Section 6.3 / 11 "platform failures may be retried up to three attempts" applies to preflight and discovery** (requirements.md:197-200, "Preflight never calls a tool or injects brokered credentials ... platform failures may be retried up to three attempts"). For tool calls the guide says "PayBox never automatically retries a tool call" (:211-212, console context). Do not read the three-attempt sentence as a retry policy for write tools.
6. **Open question 3 / NOT FOUND "whether hosted checks run the sample tools/call" is partly answered.** requirements.md:197 says hosted preflight "never calls a tool". Remaining ambiguity: :143 ("Each discovery page and sample call may run in a fresh process") and :553 ("Run the hosted checks and a sample tool call") may refer to the console Test step. The offline-sample-tool recommendation (11.5) remains sound.
7. **NOT FOUND "Public list of chains PayBox can simulate/sign" (gate 4) is partly wrong.** docs.paybox.sh/reference/mcp-tools (`discover_tokens`, ~lines 260-276) documents `mode: "chains"` ("featured networks (including Robinhood, Arc, and Hyperliquid)") and a query over "the full production-chain catalog", with the explicit caveat "Catalog membership does not guarantee provider coverage or trading support." Arc is featured there yet arcanum says it is read-only for signing, so the catalog is not a signing list. The same page (lines ~110-112) says an EVM MPC wallet "shares one address across every `eip155:*` chain", which supports gate 4 (same address on chain 3223 if PayBox can sign there). `discover_tokens` is a read-only PayBox tool but was not called by this verifier (task did not authorise it). Gate 4 stays partial; a follow-up stream may call `discover_tokens` with `mode: "chains"` and a query for XO's chain.
8. **Citation nit:** "Output containing the literal value of a configured brokered credential is withheld" is requirements.md:222 (Test section), not within 501-527. Content is correct.
9. **TL;DR item 1 wording is over-broad.** "Every ... tsconfig.json and .gitignore in the two reference repos matches" holds only for the files listed in the section 2.2 table (tsconfig and .gitignore: paylink-guard only; pnpm-workspace.yaml: arcanum only). The table is right; the TL;DR sentence is not.
10. **"requirements.md last-modified 2026-10-18 12:01 GMT" does not mean the guide was edited on 10-18.** The refpay copy committed 2026-10-16T20:16Z is byte-identical, so the content is unchanged since at least then (the header is a deploy timestamp). Not stale, but also not updated after the deadline: all deadline language still reads in the future tense ("before Saturday at 8pm").
11. **paylink-guard guardrail description needs two caveats (summary says "stateless per-call caps").** (a) `max_amount` is an agent-supplied argument (`PayArgs`, gate.ts:56), so it is an intent-binding consistency check, not a cap that holds against a prompt-injected agent. (b) On a caution verdict the thrown error text itself contains the confirm code (gate.ts:107: "call again with confirm_code: ..."), so the agent receives the code with no human step; the "confirmation" only works if the agent honours the tool description. Neither pattern gives a human-in-the-loop or an enforceable cap. Section 9.1 already says the cap must come from owner config; add that the confirm-code pattern must not be used as a safety control.

### V3. Unverifiable this session (left as the researcher stated, confidence unchanged)

- docs.paybox.sh fetch timestamp "2026-10-18 17:40 GMT" (pages are undated; this verifier fetched them 2026-10-19 and the cited text is unchanged).
- Authors' README evidence tables (hosted timings, mainnet simulations, reviews) in both repos: not reproducible read-only.
- Whether PayBox honours MCP 2026-07-28 `input_required` results (see V4.6); whether PayBox verifies an EVM sender; whether the hosted runtime rebuilds the bundle; sandbox HOME writability; whether the 1,000 starts per 24 h allowance applies to end-user calls.
- `floflo777/undo` and the agent-oriented files the researcher did not read (refpay AGENT.md, hako .lanes) were not read here either.

### V4. Missed by the researcher (add to the plan's risk list)

1. **Portal eligibility includes MoonPay KYC** (requirements.md:25-30): "your PayBox email must match the email used for MoonPay KYC"; verified eligibility "unlocks the submission workspace". Combined with "You can submit one project" (:32), this is a release gate for gate 7.
2. **Hackathon terms** (developer.paybox.sh/terms): participants must be 18+ or age of majority, not located in or a national of a comprehensively sanctioned jurisdiction, and complete the relevant product onboarding before Submission; submissions must comply with "Featured Product developer terms"; the participant grants Launchpad and each MoonPay Group member a "non-exclusive, worldwide, royalty-free, perpetual, irrevocable license" to the Submission (use, reproduce, distribute, derivative works, plus name/likeness for promotion). Prohibited content includes code that "exploits, exfiltrates, or misuses user credentials, wallet keys, or secrets". Relevant to gate 7 and to any plugin that handles XO credentials.
3. **Marketplace is not yet public.** developer.paybox.sh/llms.txt: "Winners and honorable mentions also enter the PayBox Marketplace ahead of its public opening." Private end-to-end testing via `use_plugin` requires "Submit your checked project for review" first (requirements.md:531-532; also :47), so a non-participant may have no path to even a private install after 2026-10-17 20:00 EDT. Strengthens the release-blocking risk in 0.7.
4. **`discover_tokens` chain catalog and shared EVM address** (see V2.7).
5. **Remote plugin class** (see V2.1).
6. **MCP 2026-07-28 `input_required` results.** SDK 2.0.0 supports a handler returning an input-required result (`inputRequests` of elicitation/sampling/roots, `requestState`; mcp.cjs ~lines 499-560, 811-830, 899-903) on tools/call. The conformance script rejects anything but `resultType: "complete"` for the sample call and PayBox docs say nothing about it, so it is not usable evidence for a plugin-to-client continuation. Recorded only so nobody rediscovers it as a gate-8 shortcut without testing.
7. Arcanum README:71 claims its Base modules were deployed "through PayBox itself, with arcanum_deploy proposing each CREATE2 call" on 2026-10-17. That is an author claim (M, unverified) but is the only public evidence that a plugin proposal to a non-token contract was approved and broadcast on Base.

### V5. Gate verdicts after verification

No status changes. Gate 1 partial (scope narrowed to hosted bundles, see V2.1), gate 2 partial, gate 4 partial (new lead V2.7), gate 6 partial, gate 8 partial (autonomous-grant claim downgraded to first-party-only, V2.3), gates 3, 5, 7 and 9 unanswered by this stream (gate 7 gains the V4.1-4.3 facts).
