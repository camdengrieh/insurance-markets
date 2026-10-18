# XO Market plugin for PayBox

> **Status (2026-10-18): planning only, no plugin code yet.** Phase 0 is blocked on (1) the XO docs, which were unreachable from the research sandbox, (2) reading the public reference plugins (the clone was denied by the permission classifier), and (3) PayBox developer-portal access. See "Resume checklist" at the end and `docs/research-notes.md` for sources and confidence levels. Every XO-specific claim below is unverified.

## Context

PayBox (MoonPay's non-custodial agent wallet, exposed over MCP) has no route to XO Market (xo.market, a permissionless, user-created prediction-market platform). Its only prediction-market plugin, `world`, is Solana-only and has no create-market tool. Goal: a plugin so people's PayBox agents can **discover, bet on, and create** XO markets, with guardrails that hold even when a wallet grant is `autonomous` (both of this account's granted wallets are).

`camdengrieh/insurance-markets` is empty (only `.gitattributes`), so this is greenfield.

## Packaging decision (needs your confirmation)

You chose "official PayBox plugin". Research shows official handlers live in MoonPay's **private** monorepo (`moonpay/paybox`; anonymous git read refused; not in your accessible repos), so an official plugin cannot be built from this repo. What outside developers *can* build is an **Open Plugin**:

- single-file ES module `dist/plugin.mjs` (Node 24, pnpm, build must be byte-reproducible), uploaded in the PayBox developer portal (developer.paybox.sh), outbound hosts allowlisted under Project settings → Network access, plain env vars, hosted conformance checks, then enabled at app.paybox.sh/plugins. It appears in `discover_plugins` as `unofficial`.
- write tools return **unsigned EVM calls as `io.paybox/transactionProposal`**; PayBox simulates, the user/grant approves, the vault signs. Proposals expire in ~5 minutes. (Field-level schema not yet seen — it is in the reference repos below.)
- marketplace listing is not publicly open yet (hackathon winners go first); promotion to "official" is MoonPay's call.

**Plan: build the Open Plugin in this repo, structured so MoonPay can promote it.** Public working examples to copy the structure from: `theluckystrike/paylink-guard` (EVM + Solana proposals), `bunnyyxtan/arcanum-plugin`. Test harness: `@paybox-sh/sdk` (Apache-2.0): `paybox plugins list|contract|use`, `PayboxClient.runPlugin/resumeRequest`.

## What is known about XO (secondary sources only; XO docs not yet read — treat as unverified)

- Own EVM chain "XO Network", chain ID **3223**, native token XO, Blockscout explorer; testnet ID 1000101. Collateral **USDC.e**; funding by bridge (Base/Ethereum/BNB reported). Trading uses an **XO smart wallet** and an "Enable Trading" approval (USDC allowance + ERC-1155 operator approval). Gas is sponsored on XO's side (fee-grant/relayer).
- Order book: **off-chain matching, on-chain settlement**; Orderbook API + Data API documented for integrators. A community bot README reportedly shows **HMAC "L2" API auth**, **Kernel v3 smart-account signing** (owner key + smart-account address), CTF Exchange/Conditional Tokens addresses on 3223 (unverified).
- Conviction (user market) creation looks like a **UI flow**: $1 charge + ≥$10 seed at 5–95¢, "eligibility and review may apply", creator earns 20% of lifetime fees. **No programmatic create path found.** MODRA (AI panel) resolves; rules are locked at creation.
- Fees, bot/ToS policy, jurisdictions, invite-code gating: unknown or conflicting.

## What PayBox gives us

- Signing intents: `message`, `typedData` (EIP-712), `transaction`, `authorization`, `solanaMessage`, `solanaTransaction`, `raw`. So EIP-712 order signing is possible at the PayBox layer.
- Request lifecycle: `pending_approval | pending_funding | pending_signature | pending_settlement | pending_confirmation | success | denied | error`; poll the same `request_id`; never re-call a write; reuse `invocation_id` for idempotency; success needs a tx hash, "a signature alone is not success".
- Tool conventions to mirror (from `world`): read tools `readOnlyHint`, writes `destructiveHint`; `<plugin>_<verb>` names; string amounts; PayBox pins wallet/sender; optional `slippage_bps` and `value_cents`; description boilerplate on approval and polling.
- SDK stops with `unsupported` on versioned and **gasless** plans, so the XO gas-sponsorship model is a real risk.

## Feasibility gate (Phase 0 — nothing else starts until these are answered)

1. **Auth/credentials**: how does the Orderbook API authenticate? If it needs per-user HMAC credentials derived from a wallet signature, where can a plugin hold per-user secrets (env vars are plugin-wide; secrets must never pass through tool args or model context)?
2. **Order flow**: are orders EIP-712-signed payloads POSTed to the API? If so use a **prepare → `request_wallet_sign` (typedData) → submit** pattern, with the plugin never holding keys.
3. **Smart wallet**: can a PayBox EVM wallet be the owner of an XO (Kernel v3) smart account, and is the account deployable/usable by an external owner?
4. **Chain support**: will PayBox simulate/sign proposals for chainId 3223, and how does gas work for an external wallet?
5. **Market creation**: any API or contract path, and what "eligibility/review" means for agents.
6. **Funding**: bridge path from the PayBox wallets' chains to XO.
7. **Terms**: bot policy, restricted jurisdictions.
8. **Sign-then-submit**: the documented `io.paybox/transactionProposal` pattern only covers on-chain EVM calls. Can a plugin obtain an off-chain typed-data signature and then continue to an HTTP submit, or must the agent orchestrate prepare → `request_wallet_sign` → submit? And do `autonomous` grants auto-sign Open Plugin proposals (an SDK `SKILL.md` reportedly says "plugin money always pauses for passkey"; `world` tool text says autonomous grants return `pending_signature`; unresolved)?
9. **Read-side fallback**: if the Data API is restricted, is the Blockscout GraphQL endpoint (`/graphiql` on the XO explorer) a usable read model?

Go/no-go: reads ship regardless; trading needs 1–4 and 8; creation needs 5. If creation is UI-only, "agents create markets" cannot be built as a plugin without XO's cooperation; do not substitute browser automation.

## Staged delivery

- **v0.1 read-only** (no signing, no secrets, lowest risk): `xo_search`, `xo_get_markets`, `xo_get_market`, `xo_orderbook`, `xo_market_prices`, `xo_positions`, `xo_account`. Ships even if trading is blocked.
- **v0.2 trading**: `xo_prepare_order` (returns EIP-712 payload + quote, read-only), `xo_submit_order`, `xo_cancel_order`, `xo_enable_trading`, `xo_redeem`. Funding via existing PayBox buy/deposit links and bridge guidance.
- **v0.3 creation**: `xo_validate_market_draft` (free dry run), `xo_create_market` only if a real path exists; otherwise return a finished draft and a link for the user to submit in the app.

## Guardrails (enforced in the plugin; do not rely on prompts or human approval)

- Hard per-order and per-day USDC caps (env-configurable, conservative defaults), price/slippage band, `value_cents` supplied so grant policy can evaluate.
- Pinned constants: chain ID, RPC, exchange, conditional-token and USDC.e addresses are constants in the plugin, verified on the explorer, and are never accepted from the agent. Prefer capped allowances over unlimited in `xo_enable_trading`.
- Off-chain order signing must not be blind: turn intent into a human-readable quote with a `quote_id`, then have `xo_submit_order` re-verify that the signed typed data equals the quote before submitting. Amounts are strings in one documented unit; confirm USDC.e decimals before use (a 6-vs-18 mix-up is a 10^12 error).
- Creation is always approval-gated and rate-limited even when the credential is `autonomous`. Creator trading its own market is blocked unless explicitly flagged.
- Read-then-verify-then-act: writes require the exact market id returned by a read; refuse stale, closed, determined or disputed markets; refuse thin books; never infer outcomes from absent data.
- Quote-before-trade; dry-run first; no automatic retry after ambiguous failure; idempotency keys; one request per intent.
- Creation lint: absolute close date, named deterministic resolution source, no relative dates, near-duplicate detection against existing markets, creation rate limit, quoted creation cost and seed shown before signing, block/flag a creator trading its own market.
- Market titles/descriptions are attacker-controlled: return them in labeled fields as data, never as instructions.
- Defer geo restrictions to XO's live check or the signing window; never hardcode country lists.
- Repo hygiene: no keys or XO credentials in code or logs.

## Repo layout (proposed)

`package.json` (pnpm, Node 24, TypeScript, single-file bundler) · `src/plugin.ts` (entry shape copied from reference plugins) · `src/xo/{client,auth,signing,types}.ts` · `src/tools/{read,trade,create}.ts` · `src/guardrails/` · `test/` + recorded fixtures · `docs/tool-contract.md` · `docs/runbook.md`.

## Verification

Typecheck, lint and unit tests pass; build twice is byte-identical; hosted conformance check passes; each guardrail has a failing-case test; `paybox plugins contract` shows the expected schemas; XO **testnet** (chain 1000101) order placed and cancelled through `paybox plugins use` with an approval-gated test credential; mainnet only with tiny caps after that. No money tool is called outside a dedicated test credential.

## Prerequisites still needed from you

1. Confirm **Open Plugin** instead of official (the plan assumes this).
2. XO docs via the `.mcp.json` on branch `add-xo-docs-mcp` (server `xo-docs` at `https://docs.xo.market/mcp`) in a new session started from a branch that contains it, with `docs.xo.market` allowlisted. Also allowlist `developer.paybox.sh` and `docs.paybox.sh` to read the plugin spec directly.
3. The three reference repos (`theluckystrike/paylink-guard`, `bunnyyxtan/arcanum-plugin`, `NitinkashyapSTRR/xo-pulse-market-maker`) must be read. A shallow clone into the scratchpad was **denied by the permission classifier ("untrusted code integration")**. Either add a Bash permission rule allowing read-only `git clone --depth 1` into the scratchpad, or paste the relevant files (plugin entry point, the `io.paybox/transactionProposal` schema, build/test scripts, the XO order-signing and auth sections). They are read, never run or installed.
4. Access to the PayBox developer portal (account) for upload and conformance checks.

## Decisions to make before building (from the research critic)

- **Scope of "bet on them"**: any XO market, or only markets the agent created? Recommended: any market, with creator-trades-own-market blocked unless flagged.
- **Phasing**: read-only → trading → creation (recommended), or is creation needed in the first release?
- **Funding**: the PayBox EVM wallet on XO chain 3223 is assumed. A Solana-held balance cannot trade on XO directly. Is a manual bridge step acceptable for v1? Who pays gas if the wallet is not sponsored?
- **Guardrail defaults** (numbers to confirm): per-order cap, per-day cap, max markets created per day (suggest 1–3), topic denylist for creation, kill switch. Enforce in the plugin because current grants are `autonomous`.
- **Secrets**: if XO needs per-user HMAC credentials, may the plugin hold per-user secrets, or must it be stateless? A shared XO API key is not acceptable for per-user trading.
- **Environments**: develop on XO testnet (chain 1000101); what dedicated PayBox credential and dollar budget is approved for mainnet smoke tests (suggest a few dollars, approval-gated)?
- **Legal posture**: who accepts responsibility for agents creating markets and betting, which jurisdictions to exclude, and whether MoonPay compliance sign-off is needed for listing. XO is offshore and its terms on bots are unknown.
- **Timing**: PayBox's plugin hackathon ("Chapter 1", Oct 16–17, 2026) appears to have just closed and the marketplace is not publicly open. Is there a later submission date or demo deadline?

## Resume checklist (new session)

1. Start from a branch containing `.mcp.json` (merge `add-xo-docs-mcp` into this branch or `main`); confirm `docs.xo.market` is allowlisted; check the `xo-docs` tools appear.
2. Query `xo-docs` for: Orderbook API and Data API reference (hosts, auth, order struct, EIP-712 domain, rate limits), market creation, Enable Trading, deposits/withdrawals, fees, resolution/claims, contract addresses, bot/ToS and restricted regions.
3. Read the three reference repos (see prerequisite 3).
4. Run the feasibility gate; record go/no-go per tier in this file.
5. Only then scaffold the repo and build v0.1.
