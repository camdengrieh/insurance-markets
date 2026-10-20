# 25. The dApp wallet layer: the PayBox wallet first, the thinnest possible AA layer second

Task `aa-wallet`. Written 2026-10-19 (harness date). Read-only research: public documentation, public GET endpoints, `gh api` reads of public repositories, and the keyless `xo-docs` search tool. No PayBox tool was called, nothing was signed, sent, deployed or created, no account or API key was made, no third-party code was cloned or run, and nobody at XO or PayBox was contacted.

Confidence tags: **H** = read first-hand in a primary source this session (URL, repo path or note id given) or reproduced by a probe I ran; **M** = secondary, summariser-mediated, or inferred from H facts; **L** = guess. **NOT FOUND (searched: ...)** is used literally. Note ids: `[06]` = `docs/research/06-paybox-platform.md`, `[08]` = `08-venues-polymarket-kalshi.md`, `[09]` = `09-venues-onchain-clob.md`, `[11]` = `11-trueo.md`, `[12]` = `12-quotient.md`, `[19]` = `19-smart-account-derivation.md`, `[20]` = `20-funding-route-verification.md`, `[21]` = `21-userop-templates.md`, `[P1]` = `docs/phase1-gap-closing.md`, `[census]` = `docs/venue-census.md`, `[arch]` = `docs/everyone-architecture.md`.

Binding decisions applied (restated because every recommendation below is judged against them): runnable by everyone from day zero with nothing the author operates and no custody of other people's credentials (local-first / static client); nobody contacts the XO team; no browser automation of any third-party site; caps are advisory against a compromised agent; every write path flag-gated OFF; PayBox upload is not available. The user's steer of 2026-10-19 ("see if we can somehow use the paybox agent wallet or derive it and use that instead of using a separate AA Kit") makes **Option 0 (no separate AA kit; the PayBox wallet is the wallet)** the baseline that this document first tries to prove or kill.

---

## 0. Bottom line

1. **Option 0 survives for everything except one thing the venue forces and a few things it cannot do.** The PayBox EVM wallet is an MPC-held EOA with one address on every `eip155:*` chain (H, [PayBox docs](https://docs.paybox.sh/reference/mcp-tools)). It can sign EIP-191 messages, EIP-712 typed data (no domain or chain allowlist anywhere in the docs, schema or SDK), 32-byte raw digests, full EIP-1559 transactions (signed, not broadcast), EIP-7702 authorizations, and on the Solana side messages and transactions (H, same page). That is enough to be the signer for every venue in the census that is wallet-signed at all (section 4). The dApp therefore needs **no wallet kit of its own**: the "multichain wallet" is one owner key plus a registry of the venue accounts that key owns or controls.
2. **"Derive it" has exactly three real meanings, and the PayBox-internal one is not real (section 3).** (i) Deterministic CREATE2 smart accounts derived from the owner address are real and already required by XO (Kernel v3.1, owner in `initData`, salt 0; 2,627 of 2,627 recomputed, [19]); Polymarket has its own equivalent (Deposit Wallet, `walletId = bytes32(signer)`, H). (ii) Venue API credentials derived by an L1 signature (XO `derive-api-key`, Polymarket `auth/derive-api-key`) are real but are venue credentials, not wallets. (iii) PayBox-internal derivation (HD, per-agent sub-keys): **NOT FOUND**. The `pbxk1.` "agent signer" is an Ed25519 key that authorizes a client to ask the MPC to sign; it is bound to one client and is not a sub-key of the EVM wallet (H, SDK README). (iv) The one extra thing found: PayBox exposes an EIP-7702 `authorization` intent and its own docs say a PayBox wallet can be "EIP-7702 delegated" (H), so the owner EOA itself could become a smart account without any new address. That is a real mechanism but not one to build on in Phases 1 to 2 (section 5.4).
3. **Where Option 0 demonstrably cannot do the job** (section 5): (a) **XO forces a smart account** for the maker (EOA orders rejected, `signatureType 3` only, H), so a Kernel v3.1 account is unavoidable on chain 3223, but it is the account XO already requires and the dApp derives it by a pure function; (b) **on-chain enforcement of the $10 per order and $50 per day caps** is not available from PayBox (grants are enforced by PayBox's servers, and `request_wallet_sign` carries no value field, [06]); (c) **gas sponsorship and one-signature batching on EVM chains** (PayBox proposals are one call each and the EOA pays native gas, [06]); (d) **chain 3223 is outside PayBox's catalog** and the PayBox EOA cannot get native XO.
4. **Recommendation: Option 0 plus exactly one smart account, the XO Kernel v3.1 account, with no AA kit.** Phase 1 and Phase 2 add no wallet contract and no bundler or paymaster subscription of our own. The XO path uses XO's own bundler and paymaster (keyless reads confirmed, sponsorship policy verified at the paymaster, [21]). An optional Phase 3 adds a user-supplied-key Kernel v3.1 layer on Base, Polygon and Arbitrum only, and only if the user wants on-chain session-key policies or batched sponsored calls; it reuses the audited Kernel and the already-deployed ZeroDev policy modules and writes no contract.
5. **The on-chain cap on chain 3223 is not achievable with deployed modules** (new finding, H, section 6.3): the ZeroDev policy and signer contracts are absent from chain 3223 (the XO explorer returns 404 for all of them, the same as an empty address, while the CREATE2 deployer and the ECDSA validator return code), the only deployed validator cannot be installed twice on one account (`ValidationId` is derived from the validator address, H source), and an outsider has no native XO to deploy anything. On XO the honest on-chain bound is **the amount the user funds** (and optionally a capped `allowance`), not a policy.
6. **A single "multichain smart-contract wallet" is not what the venue set needs, and building one would be harmful.** Each venue that forces a smart account forces *its own* account type (XO: Kernel v3.1; Polymarket: its Deposit Wallet; Opinion: a Safe; Limitless: its smart-wallet mode; PancakeSwap prediction: no contract accounts at all). A generic account on top would be accepted by none of them and would split positions away from the EOA the EOA-only venues use. The dApp's job is an **owner-derived account map** (section 8.1).
7. **What is unverified and decides the next step** (section 9): whether PayBox signs typed data for chain ids 3223, 1337 and 4162; whether it signs a 32-byte raw digest; whether the PayBox wallet currently carries an EIP-7702 delegation; whether XO's off-chain stack accepts a PayBox-owned Kernel account (the four "doors" in [P1]); whether `signatureType 0` is truly rejected by XO (its own docs contradict each other, section 4.1).

---

## 1. Method, compliance, limits

- Repository reading: `docs/plan.md` banner, `docs/phase1-gap-closing.md` sections 0, 2.1 and 9, `docs/everyone-architecture.md` section 1, `docs/venue-census.md` P0 and P1, research notes 06, 08, 09, 11, 12, 19, 20, 21 (each with its Verification section).
- Fetched fresh this session (public GET, User-Agent `insurance-markets-research/0.1`, about 0.4 s apart): `docs.paybox.sh` markdown pages (`llms.txt`, `reference/mcp-tools`, `concepts/{model,approvals,requests}`, `sdk-cli`, `skill`, `getting-started`, `connect/{mcp,oauth}`, `api-reference`), `@paybox-sh/sdk@2.2.0` from unpkg (README, SKILL, `dist/index.d.ts`, `dist/index.js`, the one bundled chunk, grepped only, never executed), Polymarket docs (`llms.txt`, `trading/wallets-auth.md`, `trading/session-keys.md`, `resources/contracts.md`), `registry.npmjs.org/@zerodev/permissions`, `unpkg.com/@zerodev/permissions@5.6.4/_esm/constants.js`, `sourcify.dev/server/v2/contract/all-chains/{address}`, the XO explorer `/api/v2/smart-contracts/{address}` (GET), Ethereum Blockscout (GET), pages via WebFetch (ZeroDev permissions, ZeroDev pricing, Pimlico public-endpoint, Hyperliquid API docs, Circle CCTP supported chains, Safe 4337 overview), web searches (pricing, public bundlers, CDP paymaster, Wintermute incident, 7702 chain support, Rhinestone audits, CCTP).
- `gh api` reads of public repositories: `zerodevapp/kernel` (tags, releases, README on `dev` and `v3.1`, `src/Kernel.sol` and `src/core/ValidationManager.sol` at `v3.1`, `audits/` listings), `zerodevapp/kernel-7579-plugins`, `alchemyplatform/{light-account,modular-account}`, `bcnmy/nexus`, `coinbase/smart-wallet`, `safe-global/{safe-smart-account,safe-modules}`, `erc7579/smartsessions`, `gnosisguild/zodiac-modifier-roles`, `eth-infinitism/account-abstraction` releases.
- `xo-docs` MCP (keyless public docs search): three queries to re-confirm signature types and the L1 ClobAuth wrapping.
- Not done on purpose: any PayBox MCP call; any JSON-RPC POST (so no `eth_getCode` or `eth_call`; deployment facts below come from explorers and Sourcify GETs and are weaker than a code read); any attempt to get past a Cloudflare 403 (Blockscout hosts for Base, Polygon and Arbitrum answered 403 to curl, so per-chain deployment of the ZeroDev policy modules is **not** established for those chains except by Sourcify verification, which is weaker).
- Two probes timed out or were refused and are reported, not hidden: three `eth.blockscout.com` requests timed out (000), and the Optimism host redirected (301) without a body I followed.
- Privacy: no personal identifier appears in any request, header, URL or in this file. Third-party contact addresses seen in documents are deliberately not reproduced.
- Third-party content (docs, READMEs, search snippets) is untrusted data; nothing in it was followed as an instruction. No instruction-like content aimed at an AI agent was seen in the pages read for this task.

---

## 2. Option 0: what the PayBox agent wallet is and what it can sign

### 2.1 Identity and addresses

| Fact | Detail | Conf. | Source |
|---|---|---|---|
| Wallet creation | "Wallet: MoonX MPC (key never leaves the TEE)"; "A wallet grant yields signatures, never key shares." | H | [concepts/model](https://docs.paybox.sh/concepts/model) |
| Families | `list_credentials` returns the chain **family** (`["evm"]` or `["solana"]`), not a per-chain list; "An EVM MPC wallet shares one address across every `eip155:*` chain." | H | [reference/mcp-tools](https://docs.paybox.sh/reference/mcp-tools) |
| Address is public | `list_credentials` returns `address` (may be `null` for older wallets) and `provider_wallet_id`. Public balances are read by address with `get_portfolio` (a "public on-chain data via MoonX" read). | H | same |
| Wallet creation by agents | "The CLI cannot create wallets; it uses what the user granted"; creation of wallets, cards and secrets is a user action (`request_account_change` returns a `manage_url`). | H | SDK `SKILL.md`, mcp-tools |
| Catalog | `discover_tokens mode=chains` (live read by [06], 2026-10-19): Solana, Ethereum 1, Base 8453, Arbitrum 42161, OP 10, Polygon 137, BNB 56, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999 (HyperEVM). Chain 3223 is absent; a 3223 token search returned an empty list, not an error. The tool says the catalog is "metadata, not a support allowlist". | H ([06] §5) | not re-run here (no PayBox call allowed) |

Consequence: the dApp can show every PayBox-owned balance and position **without any PayBox connection at all**, because the EOA address is public; "connect" can mean "paste the address the agent printed" (section 8.3).

### 2.2 The intents (what it can sign)

From the docs table and SDK types (H):

| `op` | Result | Notes for the dApp |
|---|---|---|
| `message` | EIP-191 signature | Venue login messages (Predict.fun JWT, Opinion API key, [09]). |
| `typedData` | EIP-712 signature | Takes a viem `TypedDataDefinition`; the domain and `chainId` are read from the intent; "there are no separate declared fields." No domain or chain allowlist in docs, schema or SDK. Server-side restriction: NOT FOUND (searched all docs pages, tool schema, SDK types and the bundled SDK chunk). |
| `transaction` | `serializedTransaction` | Caller supplies every EIP-1559 field including `chainId`, `gas` and `nonce`. "Signed, not broadcast" ([06]). Broadcasting is the caller's job, so in principle this signs a transaction for chain 3223 too; untested, and the EOA would need native XO. |
| `authorization` | EIP-7702 authorization | viem `Authorization` type (`chainId`, `address`, `nonce`). Section 5.4. |
| `raw` | signature over a 32-byte digest "as-is (escape hatch)" | `rawSigningPayloadHex`. The SDK returns r, s and a recovery id per [06] (M): a 65-byte signature is assembled by the caller (`v = 27 + recovery_id`). No domain separation, so it is the dangerous intent (section 7). |
| `solanaMessage` | `{signature: hex}` | Encoding and scheme not documented (M: Ed25519 over the UTF-8 message). |
| `solanaTransaction` | `{signedTransactionBase64}` | |

The SDK confirms the signing path is client-side in all cases: the `pbxk1.` key "ed25519-signs the MoonX envelope", "the MoonX secret never reaches the client" (H, SDK README). The signing window (browser iframe) or the SDK (headless) is where the MPC share is exercised; the agent only ever sees a signature.

### 2.3 Grants and approvals (the policy layer PayBox has)

| Mode | Behaviour | Conf. |
|---|---|---|
| `always_approve` | passkey in the PayBox app for every operation | H |
| `iframe` | confirm in the in-chat signing window | H |
| `autonomous` | "acts within the grant"; payments and secrets complete, wallet signs and swaps move to `pending_signature` and still need the signing window or an SDK key | H ([concepts/requests](https://docs.paybox.sh/concepts/requests)) |
| `paybox` | complete on the PayBox website without an agent signing key (appears in `request_account_change` and the SDK `Grant` type) | M ([06]) |

Policy can deny "a chain or merchant not in the grant" (H, concepts/requests), but whether a **wallet-sign** grant carries a chain or value allowlist is NOT FOUND (all pages, schema and SDK searched). `request_wallet_sign` has no `value_cents` field (H, live schema read by [06] and [P1] A1), `request_swap` does. So **a grant cannot evaluate an off-chain order signature's size**, which is the reason the repo already treats the $10 and $50 caps as advisory ([arch] §1).

Whether `autonomous` auto-signs: the docs contradict themselves (`concepts/model`: signing needs "a fresh passkey assertion" regardless of mode; `concepts/approvals`: "no separate proof-of-presence check runs server-side"; `concepts/requests`: autonomous moves to `pending_signature`). Re-read this session: all three sentences are still present (H). Unresolved (test T0 in [P1]).

### 2.4 The "agent signer" (`pbxk1.`) is not a derivation

SDK README, verbatim facts (H): the `pbxk1.` key is generated "on the machine running the CLI and PayBox never holds it"; it "ed25519-signs the MoonX envelope"; "a signer is bound to the client that paired it. Present a `pbxk1.` to a different client ... and signing fails with `agent signer belongs to another client`"; rotating the API key mints a new client and requires re-pairing. `list_credentials.agent_signer_recorded` says whether one is recorded ([06]).

Reading: it is an **authorization credential for one client to trigger MPC signing within a grant**, not an EVM key and not derived from the wallet. Theft of a `pbxk1.` plus its matching API key lets the thief request signatures within the grant (M, follows from the pairing text). It is the closest PayBox has to a "session key", and it is **off-chain, server-enforced and revocable by the user in the PayBox app**, with no on-chain footprint (section 5.1).

### 2.5 7702 and gasless facts

- `pay_x402`: "x402 requires a plain EOA payer. If the wallet is still EIP-7702 delegated, the tool either returns a plain-EOA error or ... runs one composite signing flow that undelegates first" (H, mcp-tools). So some PayBox flow can leave a PayBox wallet delegated.
- `request_swap` "signs the swap transaction or gasless UserOperation envelopes" (H, concepts/requests). Which smart account or delegate those envelopes target is NOT FOUND (the SDK bundle contains no mention of 7702, UserOp, delegate or gasless handling; its README says "versioned plans and gasless prepared plans stop with `outcome: unsupported`").
- Open Plugin EVM proposals carry no sponsor, paymaster or UserOp field; "the wallet still needs native currency for network fees" ([06] §3, H).
- Inference (M): the MoonX swap path may delegate the PayBox EOA via 7702 on some chains. **Whether any PayBox wallet currently has code is checkable by anyone with a read-only code query on the public address** (test T-AA2); I did not run it (no JSON-RPC POST, no PayBox address available to me).

### 2.6 What PayBox cannot or does not do (relevant to the wallet)

1. No chain 3223 in the catalog; proposals and swaps there are unsupported or unverified ([06] §5).
2. No on-chain policy, no spending limit enforced on-chain; no wallet-sign value field.
3. No sponsor/paymaster on proposals; one call per proposal; approve-then-act is two requests, two approvals.
4. The approver sees "raw transaction details" for proposals and, for `raw` or the Kernel `Kernel(bytes32)` wrapper, an opaque digest ([06] §3-4, [P1] A4).
5. No HD or sub-key derivation, no per-agent sub-wallet (NOT FOUND, searched: all docs pages, SDK types, README, SKILL, API reference). Separate wallets exist only as separate user-created credentials, each with its own address and grant.
6. Browser dApp access: PayBox's developer surface is "OAuth 2.1 to authorize, then MCP to act" with a personal `pbx_live_*` key as an alternative bearer (H, api-reference). Whether `/mcp` or `/oauth/token` send CORS headers for a browser origin is NOT FOUND. Signing needs either the MCP-App signing window or the Node SDK with a paired `pbxk1.` key.

---

## 3. What "derive it" can mean, and which meanings are real

| # | Meaning | Real? | Evidence | What it gives the dApp |
|---|---|---|---|---|
| i | **Deterministic smart accounts derived from the PayBox owner address.** XO: `account = CREATE2(KernelFactory, keccak256(initData(owner) \|\| salt0), initCodeHashERC1967(impl))`, `initData` = `initialize(0x01 \|\| ECDSAValidator, no hook, validatorData = owner, empty, [])`. Polymarket: `depositWallet = CREATE2(factory 0x0000...Cc07, keccak256(abi.encode(factory, bytes32(signer))), beaconProxyInitCodeHash(beacon 0x7A18...fc3a, args))`. | **Real** | XO: [19] §5 (formula; 2,627 of 2,627 recomputed; live `getAddress` on Base returned the real XO account for 6 of 6; the public Anvil account 0 derives to `0xB3729F7e...d30d`, deployed on Base). Polymarket: [wallets-auth](https://docs.polymarket.com/trading/wallets-auth) "Derive a Deposit Wallet address" (H). Owner is inside the hashed salt, so a third party cannot deploy "your" address with another owner (H, [19] §5.1). | One owner EOA yields: its own address on every EVM chain, the XO account (same address on every chain where the factory exists), the Polymarket Deposit Wallet on 137. This is the "multichain wallet": **an address map, not a contract**. |
| ii | **Venue API credentials derived by an L1 signature.** XO `GET /auth/derive-api-key` (returns the caller's oldest existing key, never mints; 404 if none), Polymarket `GET /auth/derive-api-key`. | **Real, but it is a credential, not a wallet** | XO docs search (H, this session): "Deterministically derive the caller's existing key ... Never mints"; Polymarket session-keys page shows the same call with `POLY_ADDRESS/SIGNATURE/TIMESTAMP/NONCE` headers (H). | The L1 signature is a `typedData` PayBox request (EIP-712 `ClobAuth`); the resulting HMAC triplet is per-user custody ([arch], [P1] gate 1), not derivable from the key alone. |
| iii | **PayBox-internal derivation (HD, per-agent sub-keys, `pbxk1.`).** | **Not real** | Section 2.4; NOT FOUND for HD or sub-keys. `pbxk1.` is an Ed25519 client-bound authorization key. | Nothing to build on. A "dedicated wallet" for XO must be a separate PayBox credential ([P1] A4). |
| iv-a | **EIP-7702: the owner EOA becomes the smart account** (no new address). | **Mechanism real, adoption risky** | PayBox `authorization` intent and "EIP-7702 delegated" wording (H); Kernel v3.3 shipped "7702 implemented" and Kernel v4 has a `Kernel7702` variant (H, releases); EntryPoint v0.8 added native 7702 (H, release notes). | Section 5.4. Not usable for XO: XO's EntryPoint is v0.7 (`0x0000000071727De2...da032`, [21] §2) which has no 7702 authorization handling (H: 7702 support is listed as new in v0.8). |
| iv-b | **Venue-native delegation** (the venue's own "session/agent key"): Hyperliquid `approveAgent` (signing-only agent wallets, nonce state per signer); Polymarket Session Keys (beta, Deposit Wallet only, 180 days, "cannot withdraw", scoped to CLOB, Combos or All, requires a Builder API key and a rollout request); Pascal registered Ed25519 trading keys (up to 10, expiry at most 365 days, cannot withdraw, [census]). | **Real and better than any generic AA layer for those venues** | H for Polymarket and Hyperliquid docs (this session); M for Pascal (census, venue note). | These are on-venue limits enforced by the venue; the PayBox EOA is the owner, a locally held hot key is the delegate. Same trade-off as any session key: a new hot key to custody. |
| iv-c | **Same private key, different address formats** | Not applicable | PayBox EVM and Solana wallets are separate credentials, separate keys (H, `list_credentials` families). | The dApp must not imply one key spans EVM and Solana. |

---

## 4. Per-venue: is a plain PayBox EOA signature enough?

Scope: census P0 and P1 plus the Phase 0 venues. "EOA enough" means the PayBox wallet's own address can be the trading account and the signature primitives above suffice. Account types and signature facts are H from the cited primary page unless tagged.

### 4.1 Venues where a wallet signs

| Venue (chain) | Account the venue forces | Plain EOA enough? | PayBox primitive | Gas / funding | Verdict and caveats |
|---|---|---|---|---|---|
| **XO** (3223) | Kernel v3.1 smart account as `maker == signer`, `signatureType 3`, ERC-1271 via `IERC1271(maker).isValidSignature`; the exchange requires `maker.code.length > 0` and has no ERC-6492 unwrap, so an **undeployed account fails** ([19] §7.1). | **No.** The owner EOA signs a *wrapped* digest. | `typedData` for the `Kernel(bytes32 hash)` wrap (domain `Kernel`/`0.3.1`/3223/account) then prefix `0x01 \|\| 0x845A...cE57`; `raw` (or `message` with the 32 raw bytes) for the UserOp hash. XO's own app signs `personal_sign`-style over the 32 raw bytes (14 of 14 UserOps, 18 of 18 orders); the deployed validator accepts raw and EIP-191 forms ([19] §7.2-7.3, [21] §5, H). | UserOps via XO's bundler, sponsored by `PolicyPaymaster` (never-seen sender allowed at the paymaster, [21] §7). Funding: Hyperlane warp route Base to 3223 ([20] §0). | Smart account unavoidable. Four off-chain "doors" (bundler admits a foreign account, orderbook registers it, L1 check accepts it, orderbook credits direct mints) are NOT ESTABLISHABLE WITHOUT XO ([P1] §0). **Docs contradiction found this session:** `/guides/wire-conventions` and `/api-reference/introduction` say direct EOA orders (`signatureType 0`) "will be rejected / not currently accepted"; the `POST /order` and `POST /orders` OpenAPI field descriptions say "direct EOA integrations use `signatureType = 0`" and the cancel endpoint's enum is `0 = EOA, 3 = EIP-1271` (H, xo-docs). The exchange source check ([19] §7.1) is the tie-breaker for settlement, but the gateway's behaviour for type 0 is unknown; do not rely on it. |
| **Polymarket global** (137) | New accounts (deployed on or after 2026-05-04) are **Deposit Wallets**, `signatureType 3`; legacy Proxy (1) and Safe (2) remain. EOA (0) works "only if your EOA is allowlisted for trading" and then "requires POL for gas". | **No for new accounts; effectively no for type 0** (allowlist). | Orders are an ERC-7739 `TypedDataSign` wrapper (`primaryType TypedDataSign`, inner domain `DepositWallet`/`1`/137/wallet, outer domain `Polymarket CTF Exchange`) signed by the owner = a `typedData` intent, no digest tricks needed. | Gasless through a Relayer or Builder API key made in the polymarket.com UI ("Settings, API Keys"); Deposit Wallet creation uses a Builder API key and the SDK; "Session Keys" additionally need rollout authorization. Collateral is pUSD; exchange `0xE1111800...996B`, Deposit Wallet factory `0x0000...Cc07`, beacon `0x7A18...fc3a` ([contracts](https://docs.polymarket.com/resources/contracts)). | Feasible in principle for a PayBox EOA as the **owner/signer** of a freshly created Deposit Wallet, but every credential step is a human, UI-made key (Builder or Relayer) and Polymarket may upgrade the wallet implementation through a beacon (opt-out exists with a timelock, H). Geoblock applies ([08] §8). A generic Kernel account is **not** a Polymarket account; whether the exchange would accept any other ERC-1271 contract as maker via the CLOB backend: NOT FOUND. |
| **Hyperliquid HIP-4 outcomes** (HyperCore) | None. The account is the signer's address. Smart-contract wallets: not mentioned in the API docs (searched `nonces-and-api-wallets`, `signing`). | **Yes (EOA only).** | `typedData`: L1 actions use a msgpack-hash "phantom agent" in an EIP-712 domain (chainId 1337 per SDK knowledge, M [census]); user-signed actions (`approveAgent`, `withdraw3`) carry a `signatureChainId`. PayBox signing of chainId 1337 is untested. | Funding: USDC via Arbitrum (CCTP preferred, minimum 5 USDC, below that is lost, [census]); PayBox lists Hyperliquid only as `eip155:999` (HyperEVM), the wrong layer. | Native agent wallets are the right session key: "API wallets are only used to sign"; nonce state is per signer (100 highest nonces, window T-2 days to T+1 day) and "previously signed actions can be replayed once nonce state is pruned, so do not reuse agent addresses" (H, Hyperliquid docs). Official `hyperliquid` PayBox plugin is read-only spot ([census]). |
| **SX Bet** (SX Rollup 4162) | EOA is the order `maker`; capital sits in a per-user proxy wallet created in the UI ([census]). | **Yes for orders** (EIP-712, domain `OBv3 Escrow`/`1`/4162). | `typedData` with chainId 4162 (not in PayBox catalog; signing unrestricted in docs, untested). | Funding via the sx.bet deposit address (UI). | EOA signing fine; onboarding is human. |
| **Pascal** (Solana) | Owner is a Solana wallet; registered Ed25519 trading keys sign orders ([census]). | **Yes (Solana wallet, not EVM).** | `solanaMessage`; encoding undocumented (M). | SPL USDC to a PDA deposit address. | Needs a local hot trading key for order flow; the PayBox wallet registers it once (venue-native delegation, iv-b). |
| **Trueo** (Base 8453) | None. Every action is a plain EVM call; positions are ERC-20 YES/NO in the caller's address ([11] §1). | **Yes, and it must be the EOA.** | Open Plugin `io.paybox/transactionProposal` (one call each). Permit2 `PermitTransferFrom` for funding a proposal is `typedData` ([11] §1). | EOA pays Base ETH. | Putting a Kernel account in front of Trueo only helps batching; positions would then sit in the Kernel, invisible to an EOA-based view. |
| **Limitless** (Base) | Two modes: EOA trading mode and a smart-wallet 1-click mode in which "the API rejects EOA-signed orders" ([09] §2.3, H). | **Yes, in EOA mode.** | `typedData` orders; HMAC token created in the UI. | USDC approvals as ordinary proposals. | Use EOA mode. |
| **Predict.fun / Opinion / Probable / Myriad** (BNB 56) | Predict: "traditional EOA or a Smart Wallet"; Opinion: Gnosis Safe "trading wallet" with an EIP-712-signed Enable Trading ([09] §2.1-2.2, H). | **Yes for Predict.fun (EOA); Opinion needs its Safe** (owner EOA signs). | `message` (login), `typedData` (orders), BNB `transaction` approvals. | BNB gas. | PancakeSwap prediction rejects contract callers outright (`require(!_isContract(msg.sender))` and `tx.origin == msg.sender`, [`pancakeswap-prediction.md`] and [`tendieswap.md`] venue notes, H source): **no smart account, and no 7702-delegated EOA, can bet there**. |
| **Quotient** (signal source, not a venue) | None. | **Yes, must be a plain EOA.** | `pay_x402` / `use_service`: Base USDC, EIP-3009 typed data ([12] §0.4). PayBox: "x402 requires a plain EOA payer". | USDC on Base, $0.005 to $0.02 per call. | Never pay from a smart account or a delegated wallet. Terms limit redistribution ([12] §0.7). |

### 4.2 Venues with no wallet signature at all

Kalshi, Polymarket US, Novig, OG / Crypto.com / CDNA / Nadex, ProphetX, Gemini Predictions, Underdog UDX and the other census P0/P1 regulated venues authenticate with HMAC, RSA-PSS, Ed25519 request signing or session tokens on KYC'd USD accounts ([census], [08] §9). No PayBox signature and no smart account applies; at most a wallet funds the owner's own account (OG Mesh route US-only; UDX bars crypto deposits). The dApp shows these as **read-only price/liquidity sources and "external account, not wallet-controlled"**, never as a wallet balance.

### 4.3 What this table decides

- Venues that need a smart account: **XO (Kernel v3.1), Polymarket new accounts (Deposit Wallet), Opinion (Safe)**; Limitless and Predict.fun optionally.
- Venues that need an EOA and break on a contract: PancakeSwap prediction (notContract), Hyperliquid (account = signer), Trueo (positions in caller), Quotient/x402 (EOA payer).
- Therefore any generic AA wallet is **wrong for roughly half the venues and unused by the rest**. The only account type shared by more than one venue is "the owner EOA".

---

## 5. Where Option 0 cannot do the job, and the evaluation of an AA layer

### 5.1 The four gaps

| Gap | Why Option 0 fails | What would close it | What it costs |
|---|---|---|---|
| **G1. On-chain caps** ($10 per order, $50 per day) | PayBox enforces grants server-side; wallet-sign has no value field; a compromised agent that holds an `autonomous` grant can sign anything ([06] §0.6, [P1] A4). | A session key whose policy is enforced by the account (Kernel permissions, Rhinestone Smart Sessions, Zodiac Roles on a Safe); or a venue-native delegate (Hyperliquid agent, Polymarket Session Key, Pascal trading key); or simply a small balance. | A new hot key on the user's machine (or the venue's own key type) and, for generic AA, a bundler. See section 6. |
| **G2. Gas sponsorship** | EOA proposals pay native gas ([06]); a user with USDC and no ETH cannot act. | A paymaster. | Mainnet sponsorship is paid everywhere I could price it (section 7.2); free tiers are testnet-only. |
| **G3. Batching** | One call per proposal, so approve + act is two approvals ([06] §3). | A smart account `executeBatch`, one owner signature. | Positions then live in the account, which only suits contract-only venues. |
| **G4. Chain 3223** | Not in the PayBox catalog; the PayBox EOA has no native XO and no way to get it ([21] §6). | XO's bundler and paymaster (sponsored, zero-fee) with a Kernel account. | The account is mandatory for XO anyway. |

### 5.2 Account implementations compared

Facts read first-hand from each repository this session (H) unless tagged. "Same address across chains" is judged by whether the account address is a pure function of the owner and fixed parameters.

| Implementation | Version / date | EntryPoint | Owner = external EOA | Same address across chains | Session keys with on-chain policy | Audits listed in repo | Licence | Notes |
|---|---|---|---|---|---|---|---|---|
| **ZeroDev Kernel v3.1** (XO uses it) | tag v3.1, 2024-06-19; factory `0xaac5...E419`, impl `0xBAC8...4b4D`, ECDSA validator `0x845A...cE57` | v0.7 (XO bundler advertises v0.6 and v0.7, [21] §6) | Yes: `validatorData` = owner; any non-zero 20-byte owner accepted ([19] §0.3) | Yes: owner is in the hashed salt; factory identical bytecode on 3223 and Base | Yes: `VALIDATION_TYPE_PERMISSION` is built into v3.1 `Kernel.sol`; policies are separate contracts (CallPolicy, GasPolicy, RateLimitPolicy, TimestampPolicy, SignaturePolicy, SudoPolicy) | `audits/` at v3.1: ChainLight v3.0, Kalos v1, v2.1, v2.2, v2.2-lite, v3-plugins, webauthn, recovery. v3.3 tag adds `v_3_1_incremental_audit.pdf` | MIT | I could not extract text from the PDFs (no PDF tooling in the sandbox); the **file names** are H, which report covers which module is M. ZeroDev's own constants file notes WebAuthn signer V0_0_4 "fixed critical vulnerability present on all previous version" (H): a policy/signer module has had a critical bug. |
| **Kernel v3.3** | 2025-04-03 | v0.7 | Yes | Yes | Yes | same set plus incremental audit | MIT | Release note: "7702 implemented". |
| **Kernel v4.0** | tag 2026-10-05 (14 days old) | **v0.9** | Yes; `Kernel7702` variant | Yes | Yes; "Permission = signer + policies", enable-mode install with chain-specific and replayable variants | README on `dev` names Trail of Bits findings (TOB-KERNEL-3 acknowledged, TOB-KERNEL-11) but **the release commit "removes audit changelog and audit folder"**, so no audit report is in the repo; Certora specs and Halmos present | MIT | Not usable with XO's bundler (EntryPoint v0.9 not advertised there). Too new to depend on. |
| **Safe 1.4.1+ with Safe4337Module** | Safe audits: v1.5.0 (Certora, Ackee), v1.4.0/1.4.1 (Ackee), v1.3.0 (G0, Certora, Nethermind); module v0.3.0 | v0.7.0 ("tested and audited with the EntryPoint version in the changelog") | Yes (Safe owners are EOAs) | Only if deployed through the same singleton factory with the same `saltNonce` and `setup` data on each chain; the older nonce-based factory was reproducible by an attacker on another chain (Wintermute on Optimism, 2022: the Safe existed only on Ethereum, the attacker replayed pre-EIP-155 deployments and created the same address with different owners; M, [GoPlus](https://blog.gopluslabs.io/vulnerabilities-cases/replay-attack/wintermute-and-op), [SlowMist](https://slowmist.medium.com/slowmist-key-to-the-theft-of-20-million-op-tokens-transaction-replay-490baaf45f26)) | Not natively; Zodiac Roles Modifier (allowlisted targets/selectors/parameters, audited by G0 and Omniscia per its README) or the Allowance module | Yes, listed above | LGPL-3.0 | Most audited base, heaviest per-chain footprint. Required by Opinion as the venue's own wallet type, so a Safe is sometimes **forced**, not chosen. |
| **Alchemy LightAccount v2** / **Modular Account v2** | LightAccount v2.0.0 2024-04-30; MA v2.0.0 2025-03-18 | v0.6 / v0.7 | Yes (LightAccount owner via ecrecover or ERC-1271) | Yes (CREATE2) | LightAccount: no. Modular Account v2: ERC-6900/7579-style modules (M) | LightAccount: Quantstamp x2 (2024); Modular Account: `audits/` folder referenced | GPL-3.0 (dual MIT/GPL for LightAccount) | GPL on MA v2 is a distribution concern for a bundled client. Alchemy-centred tooling. |
| **Biconomy Nexus** | v1.2.0 2025-04-07 | v0.7 | Yes | Yes (CREATE2 factory) | ERC-7579 modules incl. Smart Sessions | Cyfrin/CodeHawks 2024-09, Spearbit/Cantina 2024-10/11 + ERC-7739 add-on, Zenith 2025-03, Pashov 2025-03 | MIT | README warns: "`main` contains a fix for a disclosed issue affecting classic (non-7702) accounts that hold funds **before** they are deployed. Build from `main` at or after commit `272c408`" (H). Relevant to any counterfactual-funding UX. |
| **Coinbase Smart Wallet** | v1.1.0 2025-07-14 | **v0.6** | Yes (multiple owners incl. passkeys, owner stored as bytes) | Yes; owner updates deliberately replayable across chains via `executeWithoutChainIdValidation` | No on-chain policies in the account | `audits/`: Cantina Dec 2023 and Apr 2024, Certora Feb 2024, Code4rena Mar 2024 | MIT | EntryPoint v0.6 only (README), so not for XO. The cross-chain replay of owner changes is a feature that widens blast radius if one chain's owner is compromised. |
| **Rhinestone / Biconomy Smart Sessions** (ERC-7579 module) | v1.0.0 2024-12-25 | account-dependent | n/a (module) | n/a | Yes: spending limits, usage count, time windows, parameter rules (M, Biconomy docs) | ChainLight; Cantina core and external policies (Aug 2024); two Rhinestone reports (H file names) | not stated | Cantina titles seen via search show unresolved-looking items (policy data not cleared on session removal; front-run when enabling policies for another permission id): M, resolution not checked. |

**Reading.** On the evidence, **Kernel v3.1 is the only candidate that is both (a) already the XO-mandated account and (b) permission-capable**, and its audits are the oldest in the set (2024). Safe is the most audited but the most expensive on gas and is only needed where a venue forces it. No candidate is chosen *for* the dApp; the XO requirement chooses Kernel v3.1 and everything else is justified only against that.

### 5.3 Same-address-across-chains (CREATE2 counterfactual)

- Kernel v3.1: the factory is deterministic (`actualSalt = keccak256(initData || salt)`), `initData` includes the owner, so the address is a pure function of owner, validator and implementation; ECDSA validator and factory are **identical bytecode on 3223 and Base**; the implementation differs by 34 bytes only (cached EIP-712 domain separator and chain id), which does not change the account address ([19] §5.2, H).
- Where the factory exists (Sourcify exact-match verification, which is a lower bound, not a deployment proof): factory `0xaac5...E419` on chains 1, 10, 56, 8453 (plus 1088, 122, 4114, 7777777 and testnets); ECDSA validator on 1, 10, 56, 137, 8453 (plus 1088, 122, 4114, 7777777, 80002); implementation on 1, 10, 56, 100, 8453, 42161, 59144, 747, 81457 (plus others). **The factory is not Sourcify-verified on 137 or 42161**, which does not mean it is absent, but it means "same address everywhere" must be a **per-chain code check before an address is shown as fundable** (H design rule; a code read needs JSON-RPC, so the check belongs in the local companion, T-AA3).
- Funds sent to a counterfactual address on a chain where the factory is missing are stranded until someone deploys the factory at the canonical address. The XO case already shows the second hazard: an undeployed account cannot settle orders and "USDC.e minted to an undeployed account can only be moved by a UserOp" ([P1] §0.3). Rule: **never display a counterfactual address as a deposit target until deployment is proven** ([P1] A11 already requires this for funding).
- Polymarket Deposit Wallets are the same pattern with the signer in the salt.

### 5.4 Option 0 plus: delegate the owner EOA itself (EIP-7702)

Facts (H unless tagged): PayBox has the `authorization` intent; Kernel v3.3 and v4 have 7702 variants; EntryPoint v0.8 added native 7702 authorizations; a delegated EOA's key stays valid and can always re-delegate; chain-id-0 authorizations are valid on every chain; x402 requires an undelegated payer; XO's EntryPoint is v0.7 and its chain 3223 hardfork level is NOT FOUND (searched: chain registry entry, ethereum-lists lists only the RPC; the keyless RPC reports reth v2.0.0 per [21] §6 but that does not prove Prague).

- **Benefit.** Same address on every chain, positions stay in the EOA (EOA-only venues keep working), and on-chain policies become possible through a delegate that supports them.
- **Why not now.** (1) It cannot serve XO (v0.7, and XO's gateway wants a registered Kernel account). (2) It breaks Quotient's x402 payments and PancakeSwap-style `notContract` venues while delegated. (3) The owner key stays the root, so a compromised owner key still bypasses every policy; the benefit is only against a *separate* session key, which then needs the same hot-key custody as any other design. (4) A wrongly scoped authorization (chainId 0, or a delegate with an unprotected `initialize`) hands the account to an attacker across chains; PayBox's approval screen would show a raw authorization object. (5) PayBox's own gasless swaps may already delegate the wallet to an unknown implementation (section 2.5), which is a reason to *inspect* first (T-AA2) before adding a second.
- **Verdict.** Kill for Phases 1 to 2. Keep as a Phase 3 research item only after T-AA2 and T-AA4.

---

## 6. Session keys, on-chain policies and what is feasible where

### 6.1 What Kernel v3.1 permissions are, from source (H)

`Kernel.sol` at tag v3.1: `isValidSignature` decodes a validator or permission id from the first bytes of the signature, requires that id's hook slot to be non-zero (installed), and for a validator calls `validator.isValidSignatureWithSender(msg.sender, _toWrappedHash(hash), sig)`; for a permission it runs `_checkPermissionSignature`. `installModule` is `onlyEntryPointOrSelfOrRoot`, and for a validator it derives `ValidationId` **from the validator contract address**, so one validator contract is one validation slot per account.

ZeroDev's permission model (docs, H): `Permission = 1 signer + N policies + 1 action`; policies: Sudo, Call (contracts, functions, parameters), Gas (total gas), Signature (which messages may be signed), Rate limit, Timestamp; signers: ECDSA, WebAuthn, multisig. Policy contract addresses in `@zerodev/permissions@5.6.4` (MIT, published 2026-10-16): CallPolicy v0.0.4 `0x9a52...eaf2` ("fixed erc4337 storage violation"), v0.0.5 `0x8577...aDd2` (SLICE_EQUAL), GasPolicy `0xaeFC...4b23`, RateLimitPolicy `0xf63d...6873`, TimestampPolicy `0xB9f8...E20F`, SudoPolicy `0x67b4...B9B7`, SignaturePolicy `0xF6A9...591d`, ECDSA signer `0x6A6F...D4FF`.

### 6.2 Which dApp caps could become on-chain, by venue

| Cap | Needs | Possible via | Where |
|---|---|---|---|
| Per-order $10 on XO | The *order signature* to be limited, not a UserOp (orders are off-chain ERC-1271 signatures) | Kernel `SignaturePolicy` limits which messages a session key may sign, but it cannot read order amounts unless the policy decodes the typed data; none of the shipped policies does (M: policy list above; I did not read the policy source). Practically: **no**. | none |
| Per-day $50 on XO | A balance bound | **The funded balance itself** (and optionally a capped `allowance`/approval to the exchange; capped allowance is inside the paymaster policy but untested with the exchange, [P1] §0.6). A compromised owner key can still re-approve, so the bound holds only while the human gates approvals. | 3223 |
| Contract calls (Trueo, Limitless approvals, redeems) | UserOp-level call allowlists, value and rate limits | Kernel CallPolicy + GasPolicy + RateLimitPolicy + TimestampPolicy on a Kernel account | Base, Polygon, Arbitrum, Optimism, Ethereum (CallPolicy v0.0.4 Sourcify-verified on 1, 10, 137, 8453, 42161, 59144; **not** on 56 or 3223; Ethereum Blockscout returned 200 for CallPolicy v0.0.4, GasPolicy, RateLimitPolicy, TimestampPolicy) |
| Hyperliquid orders | A venue-side limit | Hyperliquid agent wallet (signing-only, can be pruned/expired), not an account policy | HyperCore |
| Polymarket orders | A venue-side limit | Session Keys (beta; CLOB/Combos/All; cannot withdraw; 180 days) | Polygon |

### 6.3 Chain 3223: the on-chain policy route is closed to an outsider (new, H)

Probes (explorer GET `/api/v2/smart-contracts/{address}` on the XO explorer, 2026-10-19, run alongside two positive controls and one negative control):

| Address | Result |
|---|---|
| ECDSA validator `0x845A...cE57` (control) | 200 (code present) |
| EntryPoint v0.7 `0x0000...da032` (control) | 200 |
| Arachnid CREATE2 deployer `0x4e59...956C` | **200 (present)** |
| random address `0x7777...7777` (negative control) | 404 |
| CallPolicy v0.0.4, v0.0.5, GasPolicy, RateLimitPolicy, TimestampPolicy, SudoPolicy, SignaturePolicy, ECDSA signer, Permit2 | **404, same as the negative control** |

Consequences: (1) no ZeroDev permission module exists on 3223 (H for the explorer's view; a code read would be stronger); (2) the deterministic deployer exists, so anyone *could* deploy the identical bytecode at the identical address, with no new contract authored; (3) deployment costs gas and "no faucet is listed and no way to acquire XO for an outsider was found" ([21] §6), though XO's bundler accepts **zero-fee** operations for existing accounts (38 of 161 recent UserOps carry no paymaster, [21] §0.5), so a deployment *through a UserOp* from the Kernel account to the deployer is conceivable but unobserved and the paymaster allowlist would not sponsor it; (4) a second ECDSA signer on one account is **not** possible with the deployed validator (one validator address, one validation slot per account, section 6.1), so the cheap "order-signing key distinct from the owner" idea fails without new deployments. I recorded this because I first expected it to work and the source says it does not.

Conclusion for XO: the thinnest honest control is `fund only what you accept to lose`, plus approval-gated signing so a human gates the one key that can both order and move funds, as [P1] §5.2 and A4 already conclude. No AA layer improves it today.

---

## 7. Chains, infrastructure and money flow

### 7.1 Chain table (phased)

| Chain | Role for prediction markets | In PayBox catalog | Kernel v3.1 factory source-verified | Bundler / paymaster | 7702 (M) | Phase |
|---|---|---|---|---|---|---|
| **Polygon 137** | Polymarket (Deposit Wallet, pUSD, CTF exchanges) | Yes | not on Sourcify (validator yes, CallPolicy yes) | Pimlico (pay-as-you-go), ZeroDev (paid), Candide public | listed by Candide and Coinbase CDP lists (M) | 1 read, 2 write via Deposit Wallet (owner signs only) |
| **Base 8453** | Trueo, Limitless, Quotient x402, USDC funding hub, XO route source | Yes | yes | CDP paymaster+bundler (7% fee on gas, M), Pimlico, ZeroDev, Candide | yes (M) | 1 |
| **Arbitrum 42161** | Hyperliquid funding (USDC via CCTP), Rain | Yes | impl yes; factory not | as above | yes (M) | 1 (funding only) |
| **BNB 56** | Predict.fun, Opinion, Probable, Myriad, PancakeSwap prediction | Yes | yes (factory, validator, impl) | fewer providers (M); CallPolicy **not** Sourcify-verified; Circle: USDC "supported on all CCTP domains except BNB" | not in Etherspot's list (M) | 1 read / EOA only. No AA. |
| **XO 3223** | XO | **No** | factory present (989 bytes, [19]) | XO bundler `mainnet-bundler.xo.market` (Alto fingerprint, M), XO PolicyPaymaster, v0.6 and v0.7; no third-party bundler known for 3223 (NOT FOUND, searched in [21]) | NOT FOUND | 2 |
| **HyperCore** (not EVM) / **HyperEVM 999** | HIP-4 outcomes | 999 only (HyperEVM) | n/a | n/a | n/a | 1 read, 2 write via agent wallet |
| **SX Rollup 4162** | SX Bet | No | n/a | venue-sponsored gas ([census]) | n/a | 3 at earliest |
| **Solana** | Pascal, funding | Yes (separate wallet family) | n/a | n/a | n/a | 1 read, 2 write |
| Optimism 10, Ethereum 1, Avalanche 43114 | no venue in the census set; funding/CCTP only | Yes | yes | all | yes (M) | not needed |

### 7.2 Bundler and paymaster options (and honest pricing)

| Provider | What I found | Conf. | Local-first fit |
|---|---|---|---|
| **XO bundler + PolicyPaymaster** (3223) | Keyless `eth_chainId`/`eth_supportedEntryPoints`; zero EIP-1559 fees accepted; paymaster sponsors never-seen senders for allowlisted selectors, 10,000/day cap, owner changed 6 times and can pause ([21] §6-7). `eth_sendUserOperation` acceptance for a foreign account: NOT ESTABLISHABLE WITHOUT XO. | H | Yes: no author-operated component. Fragile: one owner key controls policy. |
| **Pimlico** | Public endpoint `public.pimlico.io/v2/{chainId}/rpc`, 20 requests/minute/IP, "paymaster methods only on testnets", "for testing" (H, docs). Free plan is testnet-only; pay-as-you-go needs a card, $0/month, 10M credits, mainnet included, 10% surcharge on verifying and ERC-20 paymaster (M, search of pricing page). | H / M | BYO key; user billing. |
| **ZeroDev** | Sandbox $0 testnet only (10,000 credits); Launch $69/month mainnet (100,000 credits); Scale $399; 8% gas sponsorship premium; 20 credits per UserOp, 10 per wallet signature (H, pricing page via WebFetch). Search result lists ZeroDev "by Offchain Labs" (M). | H / M | BYO key; paid. |
| **Coinbase CDP paymaster** | "Gas plus 7% fee, invoiced monthly"; bundler and paymaster at one endpoint; sponsorship needs smart accounts, EOAs need a 7702 upgrade; free-credit claims are marketing (M). | M | BYO account. |
| **Candide** | Public bundler and paymaster at `api.candide.dev/public/v3/{chainId}`, no key, "available on mainnets and testnets" per a search snippet (M); the doc page itself returned 404 or a JS shell, so unverified first-hand. | M | Best candidate for a keyless path; verify before relying. |
| **Alchemy, Biconomy, Etherspot/Skandha, Particle, Gelato** | Bundler endpoints exist (search); pricing and chain lists not read. | L | not evaluated |

**Honest summary.** Mainnet sponsorship is a paid service from every provider whose pricing I could read; every free tier is testnet-only; one keyless path (Candide, unverified) exists. "Nothing the author operates" is satisfied only if each user brings their own provider key or pays their own gas. That is why Phase 3 is optional.

### 7.3 Funding and bridging (and what must not be built)

- **Do not build a bridge.** Reuse: (a) XO's Hyperlane warp route Base to 3223, plain and permissionless at contract level (no fee, `msg.value` must be 0), 253 of 253 deliveries paired, median 14 s; but XO's own app uses a private executor, withdrawal has no verified third-party path, and one EOA owns both routes' ProxyAdmin ([20] §0, H); (b) Circle CCTP for USDC among Ethereum, Base, Arbitrum, OP, Polygon, Avalanche, Solana and HyperEVM (Circle supported-chains page via WebFetch, M: USDC "supported on all CCTP domains except BNB Smart Chain"); (c) PayBox `request_swap` with `dst_chain` for MoonX-routed bridges between catalog chains (H that the parameter exists; pair coverage unverified, 3223 unsupported (M)); (d) PayBox `get_buy_link` for fiat on-ramp to Base, Ethereum, Robinhood, Solana (H, SDK `BuyLinkArgs`).
- **Hyperliquid deposits** are Arbitrum USDC only for wallet-connected accounts, minimum 5 USDC, below that is lost ([census], M for the amount): the dApp must hard-block sub-minimum amounts.
- Cross-chain "one balance": the dApp **sums per-chain read balances**; it never moves value between chains on its own.

---

## 8. Recommended design

### 8.1 One owner, an account map, no wallet kit

```
owner EOA (PayBox EVM credential, dedicated per venue family per [P1] A4)
 |- EVM EOA address ................ same on every eip155 chain  (positions: Trueo, Limitless EOA mode, Predict.fun, Hyperliquid account, Quotient payer)
 |- XO Kernel v3.1 account ......... pure function of owner; same on every chain with the factory; used on 3223 only
 |- Polymarket Deposit Wallet (137)  pure function of owner (walletId = signer); created only by the user via their own Builder key
 |- Opinion Safe "trading wallet" .. venue-created; owner EOA signs
 |- Hyperliquid agent (optional) ... locally held, venue-native, signing-only
PayBox Solana credential (separate key)
 '- Solana wallet ................... Pascal owner; no AA; not "the same wallet"
```

Registry entry (data, not code): `{ venue, chain, accountType, address, derivation: "owner" | "factory-pure-function" | "venue-created" | "user-pasted", status: "derived" | "code-present" | "venue-registered" | "unverified", evidence }`. Status gates what the UI may say: `derived` accounts are shown as read-only addresses; an address becomes a deposit target only at `code-present` (or `venue-registered` where the venue requires it, XO's `smart_account` flag).

### 8.2 The AA stack, as a ladder (stop at the first rung that suffices)

| Rung | What | New contracts? | Needs a provider key? | Decision |
|---|---|---|---|---|
| **L0** | PayBox EOA only (Option 0). All reads, Trueo, Limitless EOA mode, Predict.fun, Hyperliquid, Quotient payments, Solana. | none | none | **Phase 1, default** |
| **L1** | Derive-and-verify the XO Kernel v3.1 account; UserOps through XO's bundler and paymaster; orders via ERC-1271 wrap. | none (the account is deployed by XO's own first sponsored UserOp) | none | **Phase 2**, behind the existing flags; blocked on the four doors |
| **L2** | Polymarket Deposit Wallet owned by the PayBox EOA, created by the user with their own Builder or Relayer key; Session Key if the user obtains authorization. | none (Polymarket's contracts) | user's own Polymarket key | **Phase 2 optional**; geoblocked |
| **L3** | Kernel v3.1 account (owner = PayBox EOA, ECDSA validator) on Base / Polygon / Arbitrum with a *user-supplied* bundler/paymaster key, for batched approve-and-act and, optionally, one session key under CallPolicy + GasPolicy + RateLimitPolicy + TimestampPolicy. Reuses the audited Kernel and the ZeroDev policy contracts already deployed (Sourcify-verified on 1, 10, 137, 8453, 42161). | none authored | yes, user's | **Phase 3, opt-in**, only for venues whose flow is contract-call-only and not EOA-bound |
| **L4** | 7702 delegation of the owner EOA, Safe, Nexus, Smart Sessions | n/a | n/a | **Not recommended** |

Why L3 uses Kernel v3.1 rather than v3.3 or v4: it is the version XO already runs, so one derivation function and one set of golden tests cover both; v3.3 adds 7702 we do not want yet; v4 is 14 days old, targets EntryPoint v0.9, and its repo no longer carries audit reports. Revisit after 3 months of v4 in production and a published audit.

### 8.3 How the dApp ties to the PayBox agent (wallet-relevant part only)

- **Read side needs no key and no connection.** Addresses come from the agent (`list_credentials`) or are pasted; positions are read from public sources by address: XO Data API keyed by the **smart account** (owner EOA returns 404, [19] §6), Polymarket public data by Deposit Wallet or EOA, Hyperliquid info by address, Solana RPC, Trueo on-chain. This is the "one place for all markets, bets and positions" and it works from a static client.
- **Write side goes through the user's own agent.** The dApp's agent terminal is an MCP client of the local stdio server ([arch] §1, mode 1); every signature is a `request_wallet_sign` the user's agent sends to PayBox; the dApp and the local server hold **no owner key**. A browser page cannot sign by itself because signing needs the MCP-App window or the Node SDK with a paired `pbxk1.` key, and CORS for PayBox's API is NOT FOUND. So: a localhost companion (the same process as the local MCP server) may expose "prepared" items to the page and relay signatures; the page never touches credentials.
- **Quotient signals** are paid per call through `pay_x402`/`use_service` from the PayBox EOA on Base, never from a smart account; the dApp renders results next to positions and shows spend against the same advisory cap ([12] §0.8).
- **Caps** stay advisory in every mode; the dApp must say so on the screen where a user enables a write flag.

### 8.4 Phased chain list

| Phase | Chains | Wallet layer |
|---|---|---|
| 1 | Polygon, Base, Arbitrum, BNB, HyperCore/HyperEVM, Solana (read); Base and Arbitrum EOA funding | L0 only. Account map with derived XO and Polymarket addresses displayed read-only. |
| 2 | XO 3223 (write); Polymarket Deposit Wallet (owner signs); Hyperliquid agent wallet; Pascal trading key | L1, L2; all flags default OFF |
| 3 (opt-in) | Base, Polygon, Arbitrum (Kernel v3.1 with user-supplied provider key) | L3 |
| never (in this design) | own bridge, own wallet contracts, own paymaster, BNB AA, 7702 delegation | |

---

## 9. Threat model

| # | Threat | Where it bites | Evidence | Mitigation in this design |
|---|---|---|---|---|
| T1 | **Owner key custody** | The PayBox MPC credential is the root of everything, including the XO Kernel account | PayBox: non-custodial MPC; but the `raw` intent has no domain separation and "one blind approval can move its Base funds" ([P1] A4) | Dedicated credential per venue family; prefer `typedData` over `raw`; approval-gated grants for funded use; the dApp refuses to display "safe" for an `autonomous` grant. |
| T2 | **Compromised agent with an `autonomous` grant** | Can sign orders, ClobAuth, UserOps, transactions, authorizations; caps are advisory | [06] §0.6; `request_wallet_sign` has no value field | Say so on screen; funded balance is the on-chain cap on XO; native venue delegates elsewhere. |
| T3 | **`pbxk1.` / API key theft** | Lets the thief request signatures within the grant | SDK README pairing text (M for impact) | Treat as a secret; user can revoke the client in PayBox; never store it in the page. |
| T4 | **Session-key theft** (L3, Hyperliquid agent, Polymarket Session Key, Pascal key) | Bounded by the policy or venue limit, not by the owner | Polymarket: session keys are EOAs, "keep their private keys secret"; Hyperliquid: agents are signing-only | Local companion holds hot keys with file mode 0600; expiry always set; Hyperliquid agent addresses are never reused (nonce-pruning replay, H). |
| T5 | **Module risk** | Policy and signer modules are code | ZeroDev WebAuthn signer: "fixed critical vulnerability present on all previous version" (H); Kernel v4 TOB-KERNEL-3: a validator uninstall earlier in a bundle does not invalidate later operations in the same `handleOps`, "treat revocations of compromised keys as racing the key" (H); Nexus: disclosed pre-deployment-funding issue (H); Cantina titles on Smart Sessions (M) | Pin module versions by address and code hash; no WebAuthn signer; no module not named in this doc; revocation is a race, so the first response to suspected compromise is to move funds out. |
| T6 | **Upgrade authority** | XO and Polymarket are upgradable by their operators | XO: paymaster owner changed 6 times, UUPS manager and exchange, role wiring editable, route ProxyAdmin is one EOA ([21] §7, [20] §0.6, [P1] §9); Polymarket: beacon upgrades with an opt-out and timelock (H) | Display "operator-upgradable" on every venue account row; Polymarket opt-out documented; nothing in this design adds an upgrade key of our own. |
| T7 | **Paymaster abuse / dependency** | XO's policy can be paused or narrowed at will; a third-party paymaster can refuse or reprice | [21] §7 | Unsponsored zero-fee path observed for existing XO accounts; third-party paymasters are optional and per-user. |
| T8 | **Cross-chain signature replay** | Same address on many chains | Kernel UserOps commit to chain id and EntryPoint ([21] §8.3); Kernel ERC-1271 wraps in a domain with `chainId` and `verifyingContract = account` (XO: 3223, H); Kernel v4 adds replayable (chain-agnostic) variants by design; Coinbase deliberately replays owner updates across chains | Never sign a chain-agnostic variant; reject any intent whose chain id is 0 or whose domain omits `chainId` unless the user explicitly asks; Kernel v3.1 only. |
| T9 | **Same-address front-running / squatting** | An attacker deploys "your" address on another chain | Kernel and Deposit Wallet salts include the owner, so the attacker can only deploy *your* account with *you* as owner (H); the Wintermute case needed a nonce-based factory | Only owner-bound CREATE2 factories are allowed; never display counterfactual addresses as fundable. |
| T10 | **Raw-signature confusion** | An agent asks `raw` to sign an Ethereum transaction hash or a UserOp hash while presenting it as something else | [P1] A4 | Each prepared item carries its expected digest and digest form; `submit` recomputes and `ecrecover`s before posting ([21] §5). |
| T11 | **7702 authorization with chain id 0 or a hostile delegate** | Takes the whole EOA across chains | EIP-7702 semantics; PayBox exposes the intent | The dApp never constructs an `authorization` intent in Phases 1 to 3. |
| T12 | **Bundler trust** | A bundler sees and orders UserOps and can censor, not alter | ERC-4337 signature covers all fields | XO's bundler is the only option for 3223 (single point); `handleOps` is public, but outsiders have no native XO ([21] §6). |

**Audit and dependency stance.** We write no wallet contract, paymaster or module. We depend on, by exact address: Kernel v3.1 factory, implementation and ECDSA validator (and, in L3 only, named ZeroDev policy contracts), the canonical EntryPoint v0.7, XO's and Polymarket's contracts as operators run them. Every pinned address is EIP-55 checked in code (the repo already found 10 bad-checksum strings, [P1] §0.6). Nothing is added from a repository whose latest release is under three months old.

---

## 10. Unverified items and tests (cheap, ordered)

| ID | Question | How | Cost / risk |
|---|---|---|---|
| T-AA1 | Does PayBox sign typed data with chain ids 3223, 1337 (Hyperliquid) and 4162 (SX), and a 32-byte `raw` digest? | Throwaway credential, zero-value requests; local `ecrecover` check | $0; one approval each ([P1] T0) |
| T-AA2 | Does the PayBox EVM address carry an EIP-7702 delegation today (code starts `0xef0100`)? | Read-only code query on the public address on Base and Polygon | $0, no PayBox call |
| T-AA3 | Is the Kernel v3.1 factory present on Polygon, Arbitrum and BNB (code present at `0xaac5...E419`)? | Read-only code query | $0 |
| T-AA4 | Is `signatureType 0` truly rejected by XO's gateway? | Not testable read-only; leave as capability fact | n/a |
| T-AA5 | Does XO's bundler admit a zero-fee, unsponsored UserOp that deploys the policy modules via the CREATE2 deployer? | Needs a funded test account; **not recommended** (changes XO state, adds load) | skip |
| T-AA6 | Does a PayBox-owned Deposit Wallet derive and deploy with a user-made Builder key, and do Session Keys work for a locally generated key? | User-run, geoblock permitting | user's call |
| T-AA7 | Is Candide's public bundler/paymaster keyless on Base and Polygon and does it sponsor? | Fetch its docs/endpoint (the docs page failed this session) | $0 |
| T-AA8 | CORS headers on `api.paybox.sh/oauth/*` and `/mcp` | Read-only `OPTIONS`/`GET` | $0 (not done here: no POST/OPTIONS to third parties) |

Open decisions for the user: (1) accept that Phase 1 and Phase 2 add **no** AA layer beyond the XO Kernel account; (2) whether L3 (user-supplied provider key) is wanted at all; (3) whether to allow L2 (needs a Polymarket Builder or Relayer key made by the user in the Polymarket UI; the product rule "no browser automation" means the user does that step).

---

## Verification

What I re-checked after drafting, and its result.

1. **PayBox wallet facts** re-read from the live markdown pages and the SDK this session: shared EVM address across `eip155:*`, intent table (7 ops), "signs ... never key shares", `pbxk1.` pairing text, plain-EOA x402 warning, 7702 wording, `request_swap` gasless UserOperation sentence. All present as quoted (H). The SDK bundle (`dist/chunk-DWDC6W5P.js`) contains no `7702`, `userop`, `delegat`, `gasless` or `envelope` string (grep, H), which supports "NOT FOUND" for the gasless implementation.
2. **XO account derivation, signature types and ClobAuth wrapping**: re-read from [19] and [21] and re-confirmed against the live docs through the xo-docs search (signature type table, "only signature type the orderbook accepts today", smart-account L1 wrapping, `derive-api-key` semantics). New finding (H): the OpenAPI field descriptions for `POST /order`, `POST /orders` and the cancel endpoint still mention `signatureType 0` as a supported EOA option while the guides say it is rejected.
3. **Kernel v3.1 source** (`src/Kernel.sol`, `src/core/ValidationManager.sol` at tag v3.1) read: `isValidSignature` accepts any installed validator or permission; validator `ValidationId` derives from the validator address. This is what killed the "second ECDSA signer" idea.
4. **Chain 3223 module probe**: ran positive controls (ECDSA validator, EntryPoint, Arachnid deployer returned 200) and a negative control (404) before reading the policy-contract 404s. Caveat: an explorer view, not a code read.
5. **Polymarket**: derived-address algorithm, wallet types, EOA allowlist statement, Session Keys limits and contract addresses re-read from three fetched pages (H).
6. **Pricing**: ZeroDev tiers via WebFetch (matches the search snippet); Pimlico public endpoint caveats via WebFetch; Pimlico paid plan and CDP fee from search summaries only (M).
7. **Not verified** (and tagged accordingly above): audit report contents (PDF text extraction not possible here; only file names), Candide public endpoint behaviour, CCTP page (summariser table), 7702 chain support (search summaries only), per-chain deployment of ZeroDev policies on Base/Polygon/Arbitrum (Blockscout 403; Sourcify verification used as a lower bound), PayBox behaviour for any untested intent, XO's off-chain acceptance of a PayBox-owned account, Hyperliquid chain id for L1 actions (M from census, the API docs page did not state it).
8. **Corrections to earlier repo statements found while doing this**: none overturned; one addition: [06]'s statement that EVM proposals are always EOA-gas is still correct, but PayBox's own swap flow can use "gasless UserOperation envelopes", so "no gasless path" is accurate only for Open Plugin proposals.
9. **Privacy scan**: this file contains no email address, personal name, GitHub login or home-directory path (the only paths named are repo-relative); no outbound request carried an identifier beyond the pinned User-Agent `insurance-markets-research/0.1`. `gh api` calls carry the local `gh` login, which GitHub can see (disclosed here, as in [20]).
10. **Scope**: only this file was written; no source, relay, test or package file was touched, nothing was installed or built, git state was not touched.
