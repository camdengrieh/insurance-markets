# XO Market tools for PayBox agents

An MCP plugin that lets an AI agent look at prediction markets on XO Market (docs: <https://docs.xo.market>) and, once the live tests below have been run, trade, fund and create markets there from a PayBox wallet.

> **Status (2026-10-19).** The read tools and an offline market-draft linter are built, tested offline and work with no setup. The trading, funding, redeem and withdraw tools are built and tested against a local mock, but **nobody has run them against the real XO service**, so they are switched off by default and XO's side of every one of them is unproven. The creation tools are built (and tested against a local mock) but, like the other write tools, off by default and unproven against XO. Local mode, the "run it on your own machine" mode that makes the plugin usable by everyone, is built: `pnpm build:local` writes `dist/local.mjs` (see [src/local/README.md](src/local/README.md)). It has only been run against a local mock and a local test chain, never under a real MCP client or against the real XO service. Where this page says "coming", nothing described there can be run today.

Nothing here is financial or legal advice. Prediction markets can lose you money, and XO restricts some regions: read [docs/safety.md](docs/safety.md) before putting any money anywhere near this.

## What it is, in plain words

You have an AI agent that can use MCP tools, and a PayBox account (<https://docs.paybox.sh>) (a non-custodial wallet for agents: PayBox, not this project, holds the keys and does the signing). This project gives the agent a set of `xo_*` tools:

- **Look**: search XO markets, read a market's rules, orderbook and prices, read an account's positions.
- **Check a draft**: lint a market you are thinking of creating, offline, before it costs anything.
- **Act (switched off until proven)**: work out your XO smart account from your PayBox wallet address, deploy it, enable trading, connect it to XO, fund it from Base, place and cancel orders, redeem winnings.

The tools never sign anything themselves and never hold your wallet key. For every write they build the exact thing to sign, hand it to the agent as a `request_wallet_sign` instruction for PayBox, and later send the signed result on. A part of the plugin (the "relay", embedded in local mode) checks the signature belongs to your wallet before anything is sent, keeps your daily totals, and keeps your XO API credentials encrypted. That design is in [docs/phase1-gap-closing.md](docs/phase1-gap-closing.md) sections 5 and 9.

## What works today with zero setup

Build it (see [docs/quickstart.md](docs/quickstart.md)); no keys, no wallet, no relay, no environment variables. These tools only read public data (`docs/tool-contract.md`, "v0.1 read tools") and are the ones the starter conformance check exercises.

| Tool | What it does |
|---|---|
| `xo_search` | Title search over live XO markets |
| `xo_get_markets` | Paginated market list with filters |
| `xo_get_market` | One market: rules, lifecycle, orderbook quote, tradability verdict, effective taker fee |
| `xo_orderbook` | Depth-limited book for one outcome token |
| `xo_market_prices` | Best bid and ask, spread, last trade, depth for both outcomes |
| `xo_positions` | Positions held by an XO account address (public on XO) |
| `xo_account` | Derives the XO smart account from your PayBox wallet address and reports whether it is deployed, registered, trading-enabled and funded. The relay part of its answer reads `not_configured` without a relay |
| `xo_validate_market_draft` | Offline dry run of a market draft: pass/warn/fail items with fix hints. Makes no network request, signs nothing, spends nothing |

Two cautions that apply to every read tool: market titles and rules are written by anonymous strangers, so the tools return them in fields marked `trust=untrusted-user-content` that the agent must treat as data, never as instructions; and prices for any decision come only from the orderbook tools, not from XO's display data.

**Aggregation signals (cross-venue comparison, edge finding):** design only, no code ([docs/aggregation-design.md](docs/aggregation-design.md), [docs/market-linking-design.md](docs/market-linking-design.md), [docs/platform-registry-design.md](docs/platform-registry-design.md)). Coming, not built.

## What needs the live tests first

XO's off-chain side (its bundler, orderbook registry, authentication check and deposit crediting) cannot be inspected by reading. The research settled every on-chain fact it could and narrowed the rest to named questions that only a live action can answer; `docs/phase1-gap-closing.md` section 0 says "no gate is closed end to end", and `docs/plan.md` records that no third party is known to have placed, funded or created anything on XO through an external signer. The plugin was built to be honest about that: every write tool sits behind a flag that is **off by default**, behind a kill switch, and behind recorded results of the tests below. Until a test passes, "XO accepts this" is a hope, not a fact.

The tests are scripts in `scripts/live/`. Each is optional, runs only with `--confirm` and a budget, prints every call before making it, and can be rehearsed against a local mock first. They are real actions on XO and PayBox (an account, a key, a deposit, an order), not reads. Recommended order: T0, T1, T2, T3a, T4, T3b (T3c optional), T5, T8, then T6 and T6b. Costs come from `tsx scripts/live/index.ts` and `docs/phase1-gap-closing.md` section 6.

| Tool | What it does while the tests are not run | Needs (live test) | Flag |
|---|---|---|---|
| `xo_deploy_enable_trading`, `xo_revoke_trading`, `xo_redeem` | **Dry run**: `prepare` shows what would be signed (packed operation, hash) and returns no signing instruction; `submit` is refused with `flag_off` | Whether XO's bundler admits the first operation of an account XO did not create (T1); redeem (T5); capped allowance and kill switch (T8) | `ENABLE_USEROP_SUBMIT` |
| `xo_submit_userop` | Refused with `flag_off` | T1 | `ENABLE_USEROP_SUBMIT` |
| `xo_connect` | Refused until trading is on; needs a deployed account | Whether XO's gateway accepts our login signature and which form (T2) | `ENABLE_TRADING` |
| `xo_prepare_order`, `xo_submit_order`, `xo_cancel_order` | Refused with `flag_off`; the order rules (price grid, size floors, fee bound, 300 s default expiry) are built and tested against the mock only | First real order and the gateway's minimums (T3b), fees (T3c) | `ENABLE_TRADING` |
| `xo_userop_status`, `xo_order_status`, `xo_list_orders` | Read-only status calls. They need the relay (and, for orders, a connected account) and say why when they cannot answer | T1, T2 | none |
| `xo_fund_account` | Refused with `flag_off`. When on: one PayBox proposal per call, **test amount only (3 USD by default)** until a first deposit has been seen to arrive and be credited | Whether XO credits USDC.e sent straight to the account (T3a) | `ENABLE_FUNDING` |
| `xo_withdraw` | Always `flag_off`. **There is no verified way to take money out of XO.** The only candidate is an untested hypothesis | The exit test (T4) | `ENABLE_WITHDRAW` |
| `xo_prepare_create_market`, `xo_submit_create_market`, `xo_track_market`, `xo_respond_update`, `xo_cancel_market`, `xo_place_seed` | Refused with `flag_off`. Registered and tested against the mock. A creation costs a non-refundable $1 fee; you host the metadata file yourself (the tool returns it) and XO's review may ignore a self-hosted file. `xo_track_market` is read-only | Hosting of market metadata and whether XO's review accepts it (T6, T6b) | `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA` (plus `ENABLE_USEROP_SUBMIT` / `ENABLE_TRADING` for submit and seed) |

(Flag names and their test prerequisites: `src/relay/flags.ts` and `relay/capabilities.ts`. Tool behaviour: the tool descriptions in `src/tools/*.ts`. Because funding is one-way until T4 passes, fund only what you can afford to lose.)

Also unproven on PayBox's side: whether `request_wallet_sign` signs a bare 32-byte digest, how it behaves under an `autonomous` grant, and what its approval window shows for a digest (T0, `docs/phase1-gap-closing.md` section 3.6).

## What it will never do

- **No browser automation.** Everything goes through public HTTP and JSON-RPC endpoints, never a scripted web page.
- **No custody.** The plugin never holds your wallet key; PayBox signs. The relay holds only your XO API credentials (an HMAC key set), AES-256-GCM encrypted under a master key (in local mode a random key kept in `master.key` next to it unless you set `XO_MASTER_KEY`, which protects against copies of the files but not against other processes running as you; in the hosted relay a passphrase you supply), on disk only in your data directory (`relay/crypto.ts`, `relay/store.ts`). Those credentials cannot place an order by themselves: every order needs your wallet's signature (an assumption marked medium confidence, AU5 in `docs/phase1-gap-closing.md`).
- **No contact with the XO team, no feedback channels, no support requests.** The plugin only calls XO's public data and chain hosts (allowlist in `relay/upstream.ts`).
- **No operator or oracle calls.** The XO contract functions meant for XO's own infrastructure are never called (`docs/phase1-gap-closing.md` section 2.2).
- **No blind retries.** After an ambiguous order, operation or funding result the tools say "check the status" and never resend.
- **No promise that the caps stop a hijacked agent.** The $10 per order and $50 per day caps (both configurable downward, and up only to compiled-in ceilings) are enforced by this software. A compromised or prompt-injected agent that holds a PayBox grant can ask PayBox to sign directly and walk around them. Approval-gated signing, where PayBox asks a human to approve each signature, is the recommended mode and the only one in which a person sees each signature. Use a dedicated PayBox credential for XO. Details: [docs/safety.md](docs/safety.md).

## Two ways to run it

One codebase, two modes (`docs/phase1-gap-closing.md` section 5.2 and the product decision recorded for this build).

1. **Local mode (the day-zero mode for everyone).** The same tools run as a stdio MCP server on your own machine, built by `pnpm build:local` to `dist/local.mjs` from `src/local.ts`, with the relay logic embedded in the same process. No HTTP hop, no relay key, no operator, no server run by anyone else. Your credential store, ledger and caps live in a per-user data directory (`XO_DATA_DIR`, otherwise your OS's per-user data location). Your agent orchestrates signing through whichever wallet MCP you use; PayBox's `request_wallet_sign` is the primary one. Setup and settings: [src/local/README.md](src/local/README.md). Tested only against a local mock and a local test chain.
2. **Hosted-sandbox mode.** `dist/plugin.mjs`, the bundle PayBox's plugin runner would run, built today by `pnpm build`. It holds no state, so it offers the read tools, the draft linter, and prepare/submit tools that talk to a relay by URL (`XO_RELAY_URL`, `XO_RELAY_KEY`). There is no PayBox upload path in use, so this mode has never run in PayBox's runner. A stateless variant that derives what it needs on every call is only designed, not built.

You can already run `dist/plugin.mjs` yourself as a stdio MCP server in your own client, which gives you the zero-setup read tools above.

## API mode (optional, off by default)

Either bundle can also read the hosted markets API (`api/`, [docs/sdk-and-api-design.md](docs/sdk-and-api-design.md) sections 4 and 8) instead of reading venues itself. Nothing here needs it: with `MARKETS_API_URL` unset, API mode is off, the tool set is exactly the one above and the plugin never contacts the API. No API is deployed yet, so there is no default URL.

Set `MARKETS_API_URL` (https, default port, no user name, password, query or fragment; in the PayBox portal its host must also be one of the plugin's network hosts) and five tools are added (`src/tools/api.ts`):

| Tool | What it does |
|---|---|
| `api_venues` | `GET /v1/venues`: each venue, whether the API has a reader for it, and the API's read state for it |
| `api_markets` | `GET /v1/markets`: markets across the venues the API reads, filtered by venue, category or title words |
| `api_market` | `GET /v1/markets/:venue/:id`: one market with its rules fingerprint and books |
| `api_groups` | `GET /v1/groups`: approved links and linker candidates (always "proposed") |
| `api_quote` | Paid `GET /v1/quote`: returns a PayBox x402 payment proposal; never pays |

How they behave:

- **Only the API.** They reach the configured origin and nothing else, never a venue and never a local fallback (`src/api/client.ts`). The API reads every venue the SDK has a keyless reader for; for any other venue they answer `no_reader` and point to the local tools.
- **Checked before use.** Every answer is validated with zod against the API's documented shapes (`src/api/schemas.ts`); a malformed one is refused whole. Each field keeps its source (`venue_api`, `chain` or `cache`) and age, a cached value is never called live, and market text passes through the same untrusted-text guardrail as every other read tool.
- **Refusals stated.** A 429 states the API's Retry-After and is not retried; a venue the API has no reader for, a missing market, a missing route and a server error each say so.
- **Paying.** The plugin holds no key and pays nothing. `api_quote` asks the route once unpaid, checks the API's 402 against `MARKETS_API_PAY_TO` (the payee) and `MARKETS_API_MAX_PAYMENT_USDC` (the per-call ceiling), both required, and returns an `io.paybox/transactionProposal` of kind `x402` for that URL. As PayBox's plugin contract describes, PayBox fetches the live 402 itself, checks its asset and amount, asks the user to approve, pays and retries the URL; the quote reaches the agent through the PayBox request (poll its request id), and the plugin is not called again. Do not also pay the same quote through PayBox's `pay_x402` or `use_service`. There is no tool for the API's `POST /v1/route/prepare` yet.

With the relay tools on as well, `tools/list` is already over the hosted runner's limit; API mode adds about 30 KB to it.

## Requirements

- Node 24.x (the repository pins 24.21.0) and pnpm 11.11.0 (`package.json`). Do not use Node 20.
- For local mode (`dist/local.mjs`, the one to use): any stdio MCP client (it accepts protocol versions 2024-11-05 to 2025-11-25). Only `dist/plugin.mjs` (the bundle for PayBox's plugin runner) needs a client that speaks 2026-07-28 and names it on every request; ordinary desktop clients cannot connect to it.
- Outbound HTTPS to XO's public hosts for the read tools.
- For anything that moves money: a PayBox account and a dedicated PayBox credential for XO, in approval-gated mode.
- To run the full test suite: optionally `anvil`, `forge` and `cast` from Foundry. Tests that need anvil skip with a message when it is missing.

## Links

- [docs/quickstart.md](docs/quickstart.md): build, configure, pair with PayBox, flags, live tests, roll back.
- [docs/safety.md](docs/safety.md): threat model, what the caps do and do not protect, secrets, XO terms and region exposure, reporting a problem.
- [docs/tool-contract.md](docs/tool-contract.md): what each read tool accepts and returns.
- [docs/phase1-gap-closing.md](docs/phase1-gap-closing.md): the build spec, constants, assumptions, the live tests and the amendments that override earlier sections (read section 9).
- [docs/phase0-gate-results.md](docs/phase0-gate-results.md): what was verified about XO and PayBox, and what was not.
- [docs/plan.md](docs/plan.md): product plan and the author's decisions.
- [docs/signing-vectors.md](docs/signing-vectors.md): the signing formulas and how they were checked.
- [docs/build-log-v0.1.md](docs/build-log-v0.1.md): what the first release built and how it was reviewed.
- [docs/research/](docs/research/): the research notes the claims above come from.
- [NOTICE](NOTICE): the PayBox plugin starter this repository is based on.
