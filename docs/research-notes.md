# Research notes: XO Market + PayBox plugin model

Gathered 2026-10-18 by read-only research. **Read this as leads, not facts.** The XO docs (`docs.xo.market`), `xo.market`, and PayBox's own docs/developer portal were blocked or bot-challenged in the research sandbox, so almost every XO and PayBox-authoring claim comes from search-engine summaries of those pages. Only the PayBox MCP tool contracts and the `@paybox-sh/sdk@2.2.0` package were read first-hand. Confidence: **H** first-hand or multiply corroborated, **M** single secondary source, **L** weak, stale or conflicting.

No contract addresses are listed here on purpose: the only mainnet addresses found came from a community README and are unverified. Verify any address on the XO explorer before use.

## PayBox (first-hand unless noted)

- **H** No XO plugin or x402 service exists. The only prediction-market plugin is the official Solana `world` (7 read tools, 3 destructive: `world_buy_outcome`, `world_change_position`, `world_redeem`). It has no create-market tool.
- **H** Call model: `discover_plugins` → `get_contract` (official only) → `use_plugin`. `use_plugin` has a separate `wallet_id` that is not sent to plugin code, and an `invocation_id` for idempotent retrieval of unofficial calls. Writes return a PayBox `request_id`; poll `get_request` on the same id; never re-call the write.
- **H** Request statuses: `pending_approval | pending_funding | pending_signature | pending_settlement | pending_confirmation | success | denied | error`. A signature alone is not success; success is a tx hash.
- **H** Signing intents (`request_wallet_sign` / SDK `SignIntent`): `message`, `typedData`, `transaction`, `authorization`, `solanaMessage`, `solanaTransaction`, `raw`. The SDK auto-signs only plain EIP-1559 `transaction` and Solana transactions; versioned and **gasless** plans stop as `unsupported`.
- **H** Approval modes per grant: `always_approve | iframe | paybox | autonomous`. Both wallets on the test account are `autonomous`, so a plugin write reaches `pending_signature` with no human unless the plugin or grant policy gates it.
- **H** `@paybox-sh/sdk@2.2.0` (Apache-2.0, repo `moonpay/paybox`, dir `clients/sdk`) is a **client** SDK/CLI. Useful as a test harness: `paybox plugins list|contract|use`, `PayboxClient.runPlugin/resumeRequest`. It is not a plugin-authoring kit.
- **H** `moonpay/paybox` is not anonymously readable (private) and was not in the account's accessible repos. Official handlers are therefore not buildable from this repo.
- **M** Third-party "Open Plugin" route (from marketplace listings, not PayBox docs): single-file ES module `dist/plugin.mjs` (Node 24, pnpm, byte-reproducible build), uploaded in a developer portal (`developer.paybox.sh`), outbound hosts allowlisted, plain env vars, hosted conformance checks, then enabled at `app.paybox.sh/plugins`. Write tools return unsigned EVM calls as `io.paybox/transactionProposal` (PayBox simulates; user/grant approves; vault signs; ~5 min expiry). Field-level schema not found.
- **M** Public example plugins: `theluckystrike/paylink-guard`, `bunnyyxtan/arcanum-plugin` (repos exist; not yet read).
- **M** PayBox's first plugin hackathon ran Oct 16–17, 2026; marketplace public opening is pending.
- **L / unresolved** Whether `autonomous` grants auto-sign plugin proposals (SDK `SKILL.md` says plugin money "always pauses for passkey"). Whether a plugin can be an externally hosted MCP URL instead of an uploaded bundle. Per-user versus plugin-wide env secrets.

## XO Market

- **M** Permissionless, user-created Yes/No markets ("Convictions"); creator sets opening odds; docs say creator earns 20% of lifetime trading fees; "graduation" promotes a Conviction to a full market (threshold unknown). Press: CoinDesk, 2026-04-30; $6M seed.
- **M** Order-book-first: limit orders matched off-chain, settled on-chain; makers pay 0%; market orders can partially fill or not fill on thin books. The LS-LMSR AMM is described as legacy (older posts say AMM only; treat as stale).
- **M** Own EVM rollup ("XO Network", Evolve SDK, Celestia DA): chain ID **3223**, native token XO, Blockscout explorer, testnet chain ID 1000101. Candidate mainnet RPC `rpc-mainnet-2.xo.market` (from a third-party issue; unverified). Collateral reported as **USDC.e** (decimals probably 6; unconfirmed). Positions are ERC-1155 conditional tokens.
- **M** Trading uses an "XO smart wallet" and a first-time **Enable Trading** step (USDC allowance + conditional-token operator approval). XO claims gas is sponsored (fee-grant/relayer). Funding requires a bridge; reported source chains Base/Ethereum/BNB; no Solana path found.
- **M** Docs list an **Orderbook API reference** and **Data API reference**; the homepage advertises a Trading API. No endpoints, hosts or auth were seen. No XO SDK, npm package, MCP server, llms.txt or OpenAPI spec exists (npm 404s). Do not confuse with `xotrade.co` (different product, Polygon, UMA).
- **L** A community bot README (`NitinkashyapSTRR/xo-pulse-market-maker`) reportedly shows HMAC "L2" API auth, Kernel v3 (ZeroDev) smart-account signing from an owner key, and mainnet addresses. Unread and unverified.
- **M** Creation looks like a **UI flow**: claim, category, resolution condition, source, date, stake and price; $1 non-refundable charge plus a seed order of at least $10 priced 5–95¢; "creator eligibility and review may apply"; goes live once approved. Older sources cite a Catalyst badge (500 CP, one market per 7 days) and a 500 USDC seed. **No programmatic create path found.**
- **M** Resolution by MODRA (panel of AI agents, rules locked at creation, ambiguity escalates), bonded challenges, human juror court. Challenge-window length unknown.
- **L** Fees, bot/ToS policy, restricted jurisdictions, invite-only signup: unknown or conflicting. Volume/user figures disagree across CoinDesk, PredictionTalk and DefiLlama (on-chain TVL ~ $127K): do not trust any.

## Design patterns from other venues (medium confidence; npm READMEs and docs)

- Read-only unless credentials present; prepare → confirm/place two-step; idempotency keys (Kalshi `client_order_id`; Limitless required `idempotencyKey`, 409 on mismatch); hard per-order and daily caps, dry-run by default; integer-string base-unit amounts; verify exact market/outcome id before trading (as in `world`); geo handled by the venue's live check at signing, not hardcoded lists.
- Creation: absolute dates and a deterministic resolution source (Omen resolves INVALID on relative or unknown dates); duplicate detection by embedding clustering plus a judge; near-duplicate spam and date-sensitive wording are real failure modes.
- Market titles/descriptions are attacker-controlled input to any agent that reads them (prompt injection); return them as labeled untrusted data.
- Self-trading and wash-trading: creator-trades-own-market is an incentive and manipulation risk; CFTC advisory (2026-02-25) and tightened Polymarket/Kalshi rules (2026-03).

## Research-process disclosures

- One research sub-agent made a single `WebFetch` of a GitHub page for `bmorphism/manifold-mcp-server`, outside the repo scope I had set. It only informed low-stakes design-pattern notes; claims derived from it (e.g. a Manifold creation minimum) are not relied on.
- Sub-agents also saved small npm tarball/README fragments under `/tmp` scratch paths. No project files were changed, nothing was installed, and no money-moving PayBox tool was called.
- Attempts to clone the three reference repos and to run a script over the workflow journal were denied by the permission classifier; they were not retried or worked around.
