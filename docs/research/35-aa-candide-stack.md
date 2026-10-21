# 35. The Candide stack as an account and gas layer: what it is, what it can carry, what it cannot

Task `aa-candide-stack`. Written 2026-10-20 (harness date; machine clock 2026-10-20 07:16 UTC at the last probe). Read-only research: public documentation, public npm registry metadata and tarballs (downloaded to a scratch directory, read, never installed or executed), public GitHub reads through `gh api`, public explorer-style GETs (Sourcify), unauthenticated GET and one CORS preflight (`OPTIONS`) probes. No PayBox tool was called, nothing was signed, sent, deployed or created, no account or API key was made, no JSON-RPC call (POST) was sent to Candide or anyone else, no third-party code was run, nobody at XO, PayBox or Candide was contacted.

Confidence tags: **H** = read first-hand in a primary source this session (URL, repo path or note id given) or reproduced by a command I ran; **M** = secondary, inferred from H facts, or documented behaviour I did not exercise; **L** = guess. **NOT FOUND (searched: ...)** is used literally and is never filled with a guess. Note ids: `[06]` = `docs/research/06-paybox-platform.md`, `[09]` = `09-venues-onchain-clob.md`, `[19]` = `19-smart-account-derivation.md`, `[21]` = `21-userop-templates.md`, `[25]` = `25-dapp-aa-wallet.md`, `[31]` = `31-paybox-web-signing-surface.md`, `[P1]` = `docs/phase1-gap-closing.md`, `[dd]` = `docs/dapp-design.md`, `[bl]` = `docs/build-log-v0.1.md`, `[census]` = `docs/venue-census.md`.

Binding decisions applied (every verdict below is judged against them): runnable by everyone from day zero with nothing the author operates and no custody of other people's credentials; nobody contacts the XO team; no browser automation of any third-party site; caps are advisory unless enforced on chain; every write path flag-gated OFF; no new wallet contracts written by us; PayBox upload is not available; the repository is public.

The proposal under test (user, 2026-10-20): "a smart contract wallet using Account Abstraction that can be derived from a PayBox Wallet and any other wallet, that can then operate on any chain, and we use Candide.dev; then it can interact on the dApp with session keys etc. and strict guardrails, gasless transactions, seamless cross-chain bet placement across all the chains where the prediction markets exist. We can also add predict.fun and opinion on BNB Chain."

---

## 0. Bottom line

**Verdict: Candide is usable as an optional account and gas layer for the EVM "treasury and funding" role on eight chains. It is not a universal bet-placing wallet, it does not give session keys with call-level guardrails, it does not move money between chains, and gasless is not free. Most of the proposal's headline items are therefore not delivered by this stack, and two of them (strict on-chain guardrails on bets, seamless cross-chain placement) are not delivered by any single stack in the evidence gathered so far.**

Layer by layer:

| Layer the proposal asks for | Verdict | Basis |
|---|---|---|
| **A. A smart account derived from a PayBox wallet or any other wallet** | **Feasible (H).** A Safe v1.4.1 with the Safe 4337 module has a counterfactual address that is a pure function of owners, threshold, salt nonce and fixed contract addresses. `SafeAccountV0_3_0.initializeNewAccount([owner])` needs no network (H, SDK source, section 3.2). The PayBox EOA address is public (H, `[25]` 2.1), so the address can be computed with no PayBox call. "Derived from PayBox and any other wallet" has exactly one reading that keeps one address: a multi-owner Safe whose initial owner set is fixed at creation (section 5.5). | section 5 |
| **B. The PayBox wallet as owner, with no server** | **Feasible on paper, five unknowns on the PayBox side, none tested.** A Safe 4337 UserOp is authorised by one EIP-712 `SafeOp` typed-data signature with domain `{chainId, verifyingContract}`, which is a plain `typedData` intent. No raw digest is needed (H, contract source + SDK). PayBox's WalletConnect route signs `eth_signTypedData_v4` on its portfolio chains, and the AbstractionKit signer interface accepts a typed-data-only signer (H, section 4). | section 4 |
| **C. Bundler and paymaster on "any chain"** | **Eight of the eight requested chains plus six more, not "any".** Candide documents mainnet support for 1, 10, 56, 100, 137, 999, 8453, 42161, 43114, 480, 4217, 5031, 9745, 42220 (H). Not supported: XO 3223, Robinhood 4663, Arc 5042, SX 4162, Monad 143 and HyperCore (not an EVM chain). The remaining "extended" chains are by request only. The public endpoint is keyless; its rate limit is **NOT FOUND**. | section 2 |
| **D. Gasless** | **Partly.** Keyless use gives bundling plus ERC-20-paid gas (not gasless). Real sponsorship needs a funded gas policy; a policy needs a Candide account and money. Free tier: 1,000 sponsored operations in total, two mainnet chains, two policies. Eight chains need the $749 per month plan (or $333 for seven unnamed chains). Someone has to pay, and under the binding decisions it cannot be the author. | section 6 |
| **E. Session keys and strict guardrails** | **Not available as a general facility.** No ERC-7579 or session-key module in AbstractionKit (0 matches in the 0.4.3 package, H). The on-chain controls that do exist are narrow: Safe Allowance Module (capped token transfers to a delegate; not deployed on BNB Chain or HyperEVM, H), Calibur per-key expiry and hook (EIP-7702 account, no spending-limit hook ships, M), a 2-of-2 Safe with a local co-signer (software enforcement), and `validUntil` on each UserOp. "Safe Policies" is research and "Planned" (H). None of these can cap an off-chain CLOB order. | section 7 |
| **F. Seamless cross-chain bet placement** | **Not provided.** Candide has no bridge, solver or intent network. The closest items: Safe Unified Account (one signature authorises UserOps on several chains and can trigger USDC/USDT moves through CCTP or LayerZero; CCTP does not cover BNB Chain per `[25]` 7.3), Forwarding Address (a server-side service with a bearer token), and EIL (an Ethereum Foundation research article). "Candide Atlas": **NOT FOUND**. | section 9 |
| **G. Every venue accepts the account** | **No.** Each venue that forces a smart account forces its own type (XO Kernel v3.1; Polymarket Deposit Wallet; Opinion a Safe that Opinion's backend creates for the user's EOA; Predict.fun a Privy-plus-ZeroDev wallet or a plain EOA). PancakeSwap prediction rejects contract callers. Hyperliquid's account is the signer. Predict.fun and Opinion on BNB Chain therefore need the **owner EOA signature only**, which the PayBox wallet already provides, and no Candide account. | section 8 |

**What the stack is good for, stated narrowly:** one deterministic multi-chain address that holds stablecoins, pays gas in stablecoins (or is sponsored by whoever funds a policy), batches `approve` plus an action into one signature, has recovery options, and can top up a hot wallet or venue account through an on-chain capped allowance. That is a treasury and funding pump, not a trading account.

**Recommended order of work** (section 10): (1) change nothing in the MVP; (2) a zero-cost, zero-network test that a PayBox typed-data signature over a locally built `SafeOp` verifies to the PayBox address; (3) only after that, decide whether to add `abstractionkit` 0.4.2 (not 0.4.3, which is 13.7 days old on this clock and becomes eligible at 2026-10-20 13:56 UTC) as an opt-in Phase 3 module behind a flag. The dependency passes every rule in `[bl]` 2.4 and the app workspace except one: **it has no npm provenance, so it needs a written exception** (section 3.4).

---

## 1. Method, compliance, limits

- Repository reading: `docs/plan.md` status banner, `docs/phase1-gap-closing.md` sections 0 and 9 (via `[25]` and `[dd]`), `docs/research/25-dapp-aa-wallet.md` in full for sections 4 to 8, `docs/research/31-paybox-web-signing-surface.md` section 4, `docs/research/09-venues-onchain-clob.md` sections 2.1 and 2.2, `docs/build-log-v0.1.md` section 2.4, `app/pnpm-workspace.yaml`, `app/scripts/check-supply-chain.mjs`, `app/scripts/check-deps.ts`, `app/scripts/dependencies.json`, root `package.json`, root `pnpm-workspace.yaml`, the lockfile entries for `@noble/*`.
- Fetched this session (public GET, `User-Agent: insurance-markets-research/0.1`, about 0.3 to 0.5 s apart): `docs.candide.dev` (`llms.txt`, `llms-full.txt`, and the `.md` form of the pages cited), `candide.dev/pricing` (redirects to `www.candide.dev/pricing`), `www.candide.dev/legal/tos`, `www.candide.dev/legal/privacy-policy`, `status.candide.dev` (headers only), `api.candide.dev/public/v3/{chainId}` (GET only, plus one CORS preflight), `registry.npmjs.org` metadata for `abstractionkit`, `@noble/curves`, `@noble/hashes`, the `abstractionkit-0.4.2.tgz` and `-0.4.3.tgz` tarballs, npm attestation endpoints, `sourcify.dev/server/v2/contract/{chainId}/{address}`, `docs.predict.fun` and `dev.predict.fun` (`llms.txt`, wallets page, contracts page), `docs.opinion.trade` (`llms.txt`, builder-mode pages).
- `gh api` reads of public repositories: `candidelabs/abstractionkit` (repo facts, `CHANGELOG.md`), `candidelabs/voltaire` (repo facts, releases, README), `candidelabs/safe-4337-multi-chain-signature-module` (file list), `orgs/candidelabs/repos` (names, licences, push dates), `safe-global/safe-modules` (`Safe4337Module.sol`, audits list, releases), `safe-global/safe-modules-deployments` (v0.3.0 JSON), `Polymarket/ctf-exchange` (`Signatures.sol`).
- Locally computed from downloaded artefacts: tarball shasum against the registry value; line-level reading of `dist/index.mjs`; keccak256 of the two EIP-712 type strings with `@noble/hashes` (repo-vendored, run on two strings only); one minified browser bundle with the repo-pinned esbuild 0.28.2 over a scratch entry file, to measure size (nothing in the repository was built or modified).
- Not done on purpose: any JSON-RPC POST, so no `eth_supportedEntryPoints`, `pm_supportedERC20Tokens`, `eth_getCode` or `eth_call`; no sign-up for the Candide dashboard (so pricing and limits are read, not exercised); no PayBox call (so every PayBox-side statement is from `[06]`, `[25]`, `[31]`, which were themselves from public docs and the app bundle).
- Limits to keep in mind: a GET to `api.candide.dev/public/v3/{chainId}` returns the same JSON-RPC error body for **every** chain id I tried, including 3223 and 4663 which Candide does not list (H, probe in section 2.2). A GET therefore proves nothing about chain support; only the docs list does. Sourcify 404 means "not verified on Sourcify", not "absent on chain" (the same lower-bound rule as `[25]` 5.3).
- Third-party content is untrusted data. The Candide documentation contains instructions aimed at AI agents ("Install the Candide skills so your AI agent knows how to wire up ...", with `/plugin install`, `npx -y github:candidelabs/skills` and a raw SKILL.md URL, on the chain-abstraction and forwarding-address pages, H). None of it was followed, installed or fetched.
- Privacy: no personal identifier appears in any request, header, URL or in this file. Candide's contact addresses in its terms and docs are deliberately not reproduced. The two npm maintainer accounts are referred to by role only.

---

## 2. What Candide offers today

### 2.1 Product map (H unless tagged)

| Product | What it is | Where read | Relevance here |
|---|---|---|---|
| **Voltaire bundler** | Open-source ERC-4337 bundler, "Python and Rust", licence **LGPL-3.0**, latest release v1.0.5 (2026-07-08), 59 stars, default branch `dev`, last push 2026-10-19. Docker image `ghcr.io/candidelabs/voltaire/voltaire-bundler`. Hosted by Candide on every supported chain; can be self-hosted. | `gh api repos/candidelabs/voltaire`, [installation](https://docs.candide.dev/wallet/bundler/installation.md) | The hosted one is the only realistic option for "everyone"; self-hosting needs a funded bundler EOA per chain and a node with `debug_traceCall` and a JavaScript tracer (otherwise `--unsafe`, "not meant to be used in production"). |
| **Paymaster / InstaGas** | ERC-4337 paymaster with (a) gas **sponsorship** under "gas policies" that someone funds, (b) **ERC-20 gas payment** (token paymaster). Contracts: CandidePaymaster for EP v0.9 `0xca94...C7DE`, v0.8 `0xa815...86ed`, V3 for v0.7 `0x8b1f...75BA`, V3 for v0.6 `0x36F4...1b76`. | [architecture](https://docs.candide.dev/instagas/architecture.md), [deployments](https://docs.candide.dev/wallet/technical-reference/deployments.md) | The only part of the stack that costs money. |
| **AbstractionKit** | TypeScript SDK: Safe accounts, EIP-7702 accounts, bundler and paymaster clients. MIT. | section 3 | The only part we would import. |
| **Safe Unified Account** | `SafeMultiChainSigAccountV1` on EntryPoint v0.9 plus the Candide-written `Safe4337MultiChainSignatureModule` (Nethermind audit NM-0874 is the only audit file in the repo; repo has no licence field in the GitHub API). Sign a Merkle root once, execute on several chains; "consolidate USDC/USDT to one chain" via CCTP or LayerZero. | [overview](https://docs.candide.dev/wallet/guides/chain-abstraction-overview.md), `gh api repos/candidelabs/safe-4337-multi-chain-signature-module` | Closest thing to "cross-chain", see section 9. |
| **Account Recovery Service** | Managed guardian service (email and SMS), "Access and pricing on request". | pricing page | A hosted service the author or user would depend on; out of scope. |
| **Forwarding Address** | Deterministic deposit addresses that relay funds across chains; needs a team API key and a bearer token "your server uses to activate addresses"; priced per transaction. | [overview](https://docs.candide.dev/forwarding-address/overview.md), pricing page | A server-side service. Fails "nothing the author operates". |
| **Solana Paymaster** | Hosted Kora endpoint; fee in USDT. | [supported networks](https://docs.candide.dev/wallet/api/supported-networks.md) | Solana is a separate wallet family; not evaluated further. |
| **Safe Policies** | "Composable security policies"; status table says custom policies, hosted cosigner, AbstractionKit integration and dashboard are all **Planned**, framework is "Safe research (exists)"; early partners wanted. | [safe-policies](https://docs.candide.dev/account-abstraction/research/safe-policies.md) | Not available. Do not plan on it. |
| **EIL page** | An explainer of the Ethereum Foundation's Ethereum Interoperability Layer (intents plus liquidity providers); no Candide product. | [eil](https://docs.candide.dev/account-abstraction/research/eil.md) | Not available. |
| **"Candide Atlas"** | **NOT FOUND** (searched: `llms.txt` and `llms-full.txt` of docs.candide.dev for "atlas" case-insensitively; a web search for "Candide Atlas cross-chain"; the 36-repository list of the `candidelabs` GitHub organisation). If the name refers to something unlisted, it is not public. | | Treated as non-existent for planning. |

### 2.2 Endpoints, chains, keys (H)

- **Public (keyless) endpoint:** `https://api.candide.dev/public/v3/{chainId}`. One URL serves both Bundler and Paymaster. "No API required. Available on mainnets and testnets." Limit: "we limit the number of requests you can make from a single IP address ... `Too Many Requests`". The number is **NOT FOUND** (searched: public-endpoints page, authenticated-endpoints page, pricing page, billing page, llms-full.txt). The pricing table lists a "Public" bundler tier with "10 req/s" under Starter, which may or may not be the keyless limit (M).
- **Authenticated endpoint:** `https://api.candide.dev/api/v3/{chainId}/{apiKey}`; the key is a **URL path segment, "there are no separate auth headers. Treat the full URL as a secret."** A static page therefore cannot hold a key safely: it would be readable by every visitor and by any script on the page. Docs: "Keep keys out of client-side code where possible. For frontend paymaster flows, scope what a key can sponsor with gas policies so a leaked key cannot drain your gas tank."
- **Old per-service URLs** (`/bundler/v3/`, `/paymaster/v3/`) are deprecated.
- **CORS (H, probe):** `GET` returns `access-control-allow-origin: *`; a preflight `OPTIONS` with `Access-Control-Request-Method: POST` and `Access-Control-Request-Headers: content-type` returned `204` with `access-control-allow-origin: *` and `access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE`. A browser page on any origin can therefore call the keyless endpoint directly. The actual POST was not sent.
- **GET probe result (H):** `https://api.candide.dev/public/v3/{1,10,56,137,999,8453,42161,43114,3223,4663}` each answered HTTP 200 `{"jsonrpc":"2.0","id":0,"error":{"message":"GET requests are not supported (path not allowed)"}}`. Same body for unsupported 3223 and 4663, so this is not a chain-support test.
- **Supported mainnets (H, [supported-networks](https://docs.candide.dev/wallet/api/supported-networks.md)):** Arbitrum One 42161, Avalanche 43114, Base 8453, BNB Smart Chain 56, Celo 42220, Ethereum 1, Gnosis 100, HyperEVM 999, Optimism 10, Plasma 9745, Polygon PoS 137, Somnia 5031, Tempo 4217, Worldchain 480. All eight chains named in the task (1, 10, 56, 137, 999, 8453, 42161, 43114) are on the list.
- **Extended networks "by request"** (zkSync Era, Linea 59144, Ink, Unichain, Mantle, Blast, Scroll, Sonic, Berachain, Cronos, Polygon zkEVM, Taiko, Metis, Mode, Abstract 2741, Zora, Moonbeam, Fraxtal, Kava, Aurora, Morph, Plume, Derive, Lisk): "Not included" in Starter, Launch and Grow; "Any EVM chain" only on Enterprise ($3,000+ per month) per the plan table. Chain 3223 (XO) is in neither list.
- **EntryPoints served (docs example response, H):** v0.9 `0x4337...D009`, v0.8 `0x4337...f108`, v0.7 `0x0000...da032`; v0.6 is documented too.
- **Reliability (H):** "Every minute, on every chain we support, we execute a real signed transaction end to end", multiple RPC providers behind each chain, public status page. **SLA only on Enterprise** (99.9%); Starter, Launch and Grow have none (terms 6.1).

### 2.3 Plans, prices and limits (H, [pricing](https://www.candide.dev/pricing), [billing and usage](https://docs.candide.dev/wallet/pricing.md), read 2026-10-20)

| | Starter | Launch | Grow | Enterprise |
|---|---|---|---|---|
| Price | $0, no card | $333 per month ("two months free" if annual) | $749 per month | $3,000+ per month |
| Mainnet UserOps | **2,500 total, no time limit**; then mainnet access **pauses** for bundler, paymaster and policies | 100,000 per month | 500,000 per month | up to unlimited |
| API requests | 25,000 total | 1M per month | 5M per month | up to unlimited |
| Throughput | 10 req/s | 50 req/s | 200 req/s | custom |
| Mainnet chains | **2** | **7** (which seven: NOT FOUND) | all | all plus your own |
| Testnet | unlimited | unlimited | unlimited | unlimited |
| Gas policies | 2 | 10 | unlimited, custom rules | unlimited |
| Sponsored ops included | **1,000 total** (one-time) | 5,000 per month | 25,000 per month | per contract |
| Fee after included | "move to Launch" | $0.01 per op | $0.005 per op | custom |
| Gas | at cost, "never mark up the gas itself", paid from funds deposited in policies | same | same | same |
| Support | Discord, best effort | Slack or Telegram, 24 h | 4 h | 1 h, 24/7 incidents |

Counting rule: one smart-account transaction is one UserOp; "about 10 API requests" per UserOp (estimate, sponsor, sign, submit, confirm). Testnet UserOps never count. Deposits into policies are "non-refundable once consumed" and "unused deposits may be withdrawn subject to the terms of your gas policy configuration" (terms 5.3); on account end "any unused balance in your gas policies remains yours" (terms 14).

### 2.4 Terms and policies that bind the design (H, [terms](https://www.candide.dev/legal/tos), "Last modified September 29, 2026. Effective October 30, 2026")

- **The text on the site is the new version, effective in 10 days; "until then, the previous Terms apply." The previous Terms were not retrievable here: NOT FOUND (searched: the live terms URL and the site footer links).** Everything below is the new text.
- 3: services are "designed for software companies, developers, and enterprises"; users "represent that you are using them for business or development purposes". Whether a retail user of a static public client counts is not addressed.
- 7.1 fair use: Candide may throttle or suspend for "sustained API requests exceeding the rate limits", "malformed, spam, or intentionally failing UserOperations", circumventing limits, and **"Reselling Candide API access to third parties without written authorization"**. Consequence: a design in which the author embeds one Candide key in a public client for all users is the clearest violation; the design in which each user supplies their own key, or uses the keyless endpoint from their own IP, is not.
- 7.3: Candide is EU-established, must comply with EU sanctions law, requires account holders to confirm they are not sanctioned; "Candide does not monitor the end users of your application".
- 4.4 and 4.5: Starter pauses mainnet after the free UserOps; paid plans reject requests at the allowance.
- 10.2: API usage data is "associated with your API key, not with individual end-users". Whether the **keyless** endpoint logs IP addresses is **NOT FOUND** (the privacy policy covers the dashboard and OpenSig only; it says Candide does not log IP addresses for OpenSig simulation nodes). A user of Candide infrastructure reveals to Candide: the Safe address, the owner address in `factoryData` on the first operation, every call's target and data, and the IP address at least at the network layer (H for what is on the wire, M for retention).
- 11: "as-is", liability capped at 12 months of fees (which is zero on keyless or Starter). 16: French law, Paris courts.

### 2.5 What the keyless endpoint cannot do for us (H and M)

- It sponsors a UserOp only if **a public gas policy somebody funded matches that exact UserOp**: "Public Gas Policies: set up by dApps for wallet consumption without requiring a sponsorship policy ID"; "Private ... requiring a sponsorship policy ID. Used when no public gas policy matches" (H, [gas policies](https://docs.candide.dev/instagas/gas-policies.md)). A policy's transaction rules pin the exact ordered list of calls ("the same calls, in the same order, with nothing extra"), contract addresses, selectors and parameter constraints. Whether any public policy exists for any prediction-market call: **NOT FOUND** and it cannot be probed without a JSON-RPC POST.
- Absent a matching policy the supported fallback is the ERC-20 token paymaster, which charges the user in a supported token (section 6.2). That is paid gas, not gasless.

---

## 3. AbstractionKit (the SDK)

### 3.1 Facts (H unless tagged; registry metadata and tarball read 2026-10-20)

| Item | Value |
|---|---|
| Package | `abstractionkit`, dist-tag `latest` = 0.4.3, `experimental` = 0.2.41. 80 versions since 2023-07-29. **23 releases in the last 12 months**; 0.4.0 to 0.4.3 shipped 2026-06-10, 07-30, 09-16, 10-06. |
| Candidate pin | **0.4.2** (published 2026-09-16T11:41:13Z, 33.8 days old). 0.4.3 was published 2026-10-06T13:56:02Z, **13.7 days old at 07:16 UTC today; it clears the 14-day gate at 2026-10-20T13:56:02Z.** |
| Tarball integrity | 0.4.2: `sha512-rqK64BoyhOUazDxQngX+UVTgNnX1LfcElsrERxdruK9QSWP0OrI/kygQ6VnTAwkiv4aJGSjkNE21bs/gc2hBFw==`, shasum `0fdb92423dc8450225fe05ff30198b7b5bd54805` (matched my download). 0.4.3: shasum `242a9f209f47cb2213398a775d9853a85d6d2cfd` (matched). |
| Licence | MIT (`LICENSE` in tarball, "Copyright <2023> <CandideLabs>"; registry and GitHub agree). |
| Runtime dependencies | **two**: `@noble/curves ^1.2.0`, `@noble/hashes ^1.3.2`. The `ethers` runtime dependency was removed in 0.4.0 (changelog). |
| Package contents | `dist/` only (`files: ["dist"]`): ESM `index.mjs` (525,149 bytes in 0.4.3), CJS `index.cjs`, type definitions, source maps (973 KB), one 360-byte runtime chunk, `README.md`, `LICENSE`. |
| Node / browser | `engines.node >= 18`. The only imports are `@noble/hashes/sha3` and `@noble/curves/secp256k1`; the only globals used are `fetch` and `navigator.credentials` (the latter only in documentation comments). **No `eval`, `new Function`, `innerHTML`, `WebAssembly`, `Buffer`, or Node built-ins** (0 matches; changelog 0.4.0 says the `Buffer`/`TextDecoder` uses were removed for browsers and React Native). The IIFE/UMD build was removed in 0.4.0, so a bundler is required. It bundles for the browser with esbuild without errors (H, my build). |
| Measured size (H, esbuild 0.28.2 `--bundle --minify --platform=browser`, noble 1.9.1 and 1.8.0 as already locked in `app/`) | Four classes used (`SafeAccountV0_3_0`, `CandidePaymaster`, `Erc7677Paymaster`, `Bundler`): **182,943 bytes minified, 51,050 bytes gzip**. Whole namespace imported: 224,060 bytes, 61,304 gzip. For scale the app's `dist/cockpit` is 1.2 MB. |
| Network behaviour | Calls only the URLs the caller passes, plus two caller-triggered optional helpers: `https://gasstation.polygon.technology/{chain}` (Polygon fee option) and `https://api.tenderly.co/...` (simulation, needs the caller's Tenderly key). No telemetry, no analytics, no hard-coded Candide key. |
| Install scripts | **None of `preinstall`, `install`, `postinstall` in any of the 80 versions.** There is a `prepare` script (`tsdown`) in 0.2.39 and later; npm and pnpm do not run `prepare` for a registry tarball dependency (M, documented lifecycle behaviour, not exercised here), and `allowBuilds: {}` in `app/pnpm-workspace.yaml` blocks dependency builds anyway. |
| Deprecation | none of the 80 versions is deprecated. |
| Provenance | **No npm attestation on any version of `abstractionkit`** (the `dist.attestations` field is absent on all 80, and `GET /-/npm/v1/attestations/abstractionkit@0.4.2|0.4.3|0.4.1` returned 404, while the same endpoint returned 200 for `@noble/curves@1.9.7` and `@noble/hashes@1.8.0`). Signed by the registry key only. |
| Maintainers | two npm accounts (Candide staff). 36 stars, 3 open issues on GitHub. |
| Audit of the SDK itself | **NOT FOUND** (searched: README, docs introduction, changelog, repository root listing for an audit folder). The contracts are audited (below); the TypeScript that builds UserOps and approvals is not claimed to be. |
| Breaking-change cadence | 0.x. 0.3.0 changed `CandidePaymaster` argument order; 0.4.0 removed `ethers`, removed the UMD build, changed `UserOperationReceipt.logs`; 0.4.3 removed three exports. Expect to re-test on every bump. |

### 3.2 Account types (H, README of 0.4.3 and `dist/index.d.mts`)

| Class | EntryPoint | What it is | Use for us |
|---|---|---|---|
| `SafeAccountV0_3_0` | v0.7 | Safe v1.4.1 SafeL2 proxy + Safe4337Module v0.3.0 (`0x75cf...c226`) + SafeModuleSetup v0.3.0; owners are EOAs or one WebAuthn passkey; optional social-recovery module, allowance module, multisig (threshold 1..N). "Recommended for most new projects." | The candidate. Audited module: Ackee Blockchain for v0.3.0 (`docs/v0.3.0/audit.md` in safe-modules, H). |
| `SafeAccountV1_5_0_M_0_3_0` | v0.7 | Safe v1.5.0 with the Daimo P-256 verifier for WebAuthn | Not needed. |
| `SafeAccountV0_2_0` | v0.6 | legacy | No. |
| `SafeMultiChainSigAccountV1` | **v0.9** | Safe + Candide's multichain-signature module (`0x2293...AEAd`); single-chain use behaves like a normal Safe but with a different module and a **different address for the same owner** than `SafeAccountV0_3_0` | Only if cross-chain batch signing is wanted. Newer, one audit (Nethermind NM-0874), v0.9 EntryPoint. |
| `Calibur7702Account` | v0.8 | EIP-7702 delegation to Uniswap's Calibur (`0x0000...8f00`; "audited by OpenZeppelin and Cantina"); registered keys with **expiry, admin flag and an optional hook contract** | The only "session key" shape in the SDK, but it delegates the PayBox owner EOA itself, which `[25]` 5.4 rejected for Phases 1 and 2. |
| `Simple7702Account`, `Simple7702AccountV09` | v0.8, v0.9 | minimal 7702 reference | No. |

- **ERC-7579: 0 occurrences** in the 0.4.3 `dist/index.mjs` and README (H, `grep -c`). The user's question about 7579 support is answered: not supported by the SDK, and nothing in the docs index (`llms.txt`) mentions it.
- Passkeys (WebAuthn owner, one per Safe at creation), social recovery with guardians and a 3, 7 or 14 day grace period, the Allowance Module and multisig are in the SDK (H).
- The Safe address is deterministic: `createAccountAddressAndFactoryAddressAndData` computes the proxy address from the initializer (owners, threshold, modules), `c2Nonce` (default 0), the Safe proxy factory (v1.4.1 `0x4e1D...ec67`) and singleton init hash. It is the same on every chain where those addresses hold the same code (H, SDK source).

### 3.3 Release health, bugs fixed recently (H, `CHANGELOG.md` of the repository)

- 0.4.2 (2026-09-16): **"Token paymaster flows could return an operation whose ERC-20 approval and paymaster disagreed ... an RPC could quote one spender and finalize with a different paymaster, or none at all, leaving the caller to sign an approval for an address the operation never pays."** Fixed by throwing `PAYMASTER_ERROR`. Any pin below 0.4.2 has this flaw in the token-gas path.
- 0.4.3 (2026-10-06): the default module address in `getUserOperationEip712Data_V9` / `...Hash_V9` was one "that only exists on Sepolia"; signatures failed with `AA24`. Only affects direct static calls on the v0.9 path; `SafeAccountV0_3_0` (v0.7) is unaffected (M, from the changelog text).
- 0.4.1: Calibur `expiration` overflowed into the `isAdmin` bit when given a millisecond timestamp, "registering the key as an admin"; high-`s` EIP-7702 authorizations silently never applied; WebAuthn init failed for about half of key pairs.
- Reading: the SDK is actively fixed and honest about its bugs, and those bugs are in exactly the places this project would lean on (token approvals, signature encoding, expiry fields). That argues for a pin, for golden-vector tests on every bump, and against letting an agent build UserOps without a local re-decode of `callData`.

### 3.4 Check against the repository's dependency rules (H for the facts, rules read from files)

Rules: `[bl]` 2.4 (exact pins, nothing younger than 14 days, MIT, no install hooks, provenance attestations) and the stricter app rules in `app/pnpm-workspace.yaml` (`minimumReleaseAge: 20160`, `blockExoticSubdeps`, `trustPolicy: no-downgrade`, `allowBuilds: {}`) and `app/scripts/check-supply-chain.mjs` / `check-deps.ts` (`dependencies.json` entry per direct dependency; **"A dependency without npm provenance needs an exception with a reason"**; no `overrides` or `resolutions`; no install-time script in the installed tree; lockfile ceiling `MAX_LOCK_PACKAGES = 150`, currently 111 packages).

| Rule | `abstractionkit` 0.4.2 | `abstractionkit` 0.4.3 | `@noble/curves` | `@noble/hashes` |
|---|---|---|---|---|
| Exact pin | pin `0.4.2` | pin `0.4.3` | already locked at **1.9.1** in `app/pnpm-lock.yaml` and in the root lockfile; `^1.2.0` is satisfied by it | locked at **1.8.0**; `^1.3.2` is satisfied |
| 14 days old at 2026-10-20 07:16 UTC | **pass** (33.8 d) | **fail** (13.7 d; passes after 13:56:02 UTC today) | pass (1.9.1 published 2025-05-14) | pass (1.8.0, 2025-04-21) |
| Licence | MIT | MIT | MIT | MIT |
| Install scripts | none | none | none | none |
| npm provenance (attestation) | **none** | **none** | yes (SLSA v1, endpoint returned 200 for 1.9.7; 1.9.1 shows attestations in metadata) | yes (SLSA v1, endpoint 200) |
| Deprecated | no | no | no | no |
| New packages added to the lockfile | +1 (itself); noble already present | +1 | 0 | 0 |
| `trustPolicy: no-downgrade` | no earlier trust level to regress from, so it does not trip (M) | same | n/a | n/a |

- **Outcome:** passes the age gate (0.4.2 only), licence, hook and footprint rules. **Fails the provenance rule and needs a written exception in `dependencies.json`** (reason would be: "no alternative publishes attestations; tarball shasum matched; source read; no install script; network use limited to caller-supplied URLs"). The lockfile would go from 111 to 112 packages (ceiling 150). It must be added to `app/` (a workspace of its own), not to the plugin root, if it is added at all.
- **Parity rule:** `app/scripts/dependencies.json` requires the plugin and app to pin the same `viem`, `zod`, `typescript`, `@types/node`; `abstractionkit` has no peer on `viem` (it uses its own noble-based helpers), so there is no new parity edge. Its devDependency on `viem ^2.48.11` is a dev-only range and not installed.
- **CSP and origin rules:** `app/scripts/check-origins.ts` and the strict `connect-src` mean `https://api.candide.dev` and any JSON-RPC node origin would have to be added deliberately; the page's `require-trusted-types-for 'script'` is compatible with the package (no DOM sinks, 0 matches).
- **Alternatives that do not need the SDK:** the signing and address math is small (section 4 and 3.2): the SafeOp type, the domain, the signature packing and the CREATE2 derivation can be re-implemented over `viem` (already pinned) with the SDK as a golden-vector oracle in a scratch directory. That gives zero new runtime dependencies at the cost of owning the encoding code (which is where the SDK's own bugs were found, section 3.3).

---

## 4. How a Safe 4337 UserOp is signed, and whether a PayBox wallet can be the owner with no server

### 4.1 The signature, from the contract and the SDK (H)

Contract: `Safe4337Module.sol` v0.3.0 in `safe-global/safe-modules` (`modules/4337/contracts/`), with typehashes I reproduced:

- `DOMAIN_SEPARATOR_TYPEHASH = keccak256("EIP712Domain(uint256 chainId,address verifyingContract)") = 0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218` (reproduced).
- `SAFE_OP_TYPEHASH = keccak256("SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)") = 0xc03dfc11d8b10bf9cf703d558958c8c42777f785d998c62060d85a4f0ef6ea7f` (reproduced).
- `domainSeparator() = keccak256(abi.encode(DOMAIN_SEPARATOR_TYPEHASH, block.chainid, address(this)))`, where `this` is the **module** address, so the domain is **`{chainId, verifyingContract = Safe4337Module}`** with no `name` or `version`.
- `validateUserOp` takes the 12-byte prefix of `userOp.signature`: `validAfter = bytes6[0:6]`, `validUntil = bytes6[6:12]`, and passes the remainder to the Safe as `checkSignatures(keccak256(operationData), operationData, signatures)` with `operationData = 0x19 0x01 || domainSeparator || structHash`. So the owner signs the standard EIP-712 digest directly, as a 65-byte ECDSA `r || s || v` with `v` = 27 or 28 (Safe's "direct ecrecover" path); owner signatures must be sorted by owner address; the signatures length is checked exactly against the threshold.
- Every UserOp field except `signature` is bound into the struct hash, including `keccak256(callData)`, `initCode`, gas limits, fees and `paymasterAndData` ("It is important that all user operation fields are represented in the SafeOp data ... even initCode"). A signature therefore authorises one exact operation on one chain and one EntryPoint; it cannot be replayed on another chain or for different calls.
- `validUntil = 0` means "forever"; a non-zero value gives a hard expiry on the signature, enforced by the EntryPoint (`AA22`).

SDK: `SafeAccountV0_3_0.getUserOperationEip712Data(userOp, chainId, {validAfter, validUntil})` returns `{domain: {chainId, verifyingContract: <module>}, types: {SafeOp: [...v7 field list...]}, messageValue}`; `signUserOperationWithSigners(userOp, [signer], chainId, {validAfter, validUntil})` builds `{domain, types (EIP712Domain removed), primaryType: "SafeOp", message}`, calls the signer, and returns `solidityPacked([uint48 validAfter, uint48 validUntil, bytes signatures])`. It does **not** verify the returned signature locally; a wrong signature fails at the bundler (`AA24`).

Signer interface (`ExternalSigner`): `{address, signTypedData?(typedData, context), signHash?(hash, context)}`; the Safe class prefers `typedData` and falls back to `hash`. `fromViemWalletClient` yields a typed-data-only signer. A custom signer that forwards `signTypedData` to any transport (a PayBox request, a WalletConnect request) is a normal use.

### 4.2 Can the PayBox wallet be the owner with no server of ours?

The chain of reasoning, with the status of each link:

| # | Link | Status |
|---|---|---|
| 1 | The owner key only has to produce `eth_signTypedData_v4` over the SafeOp, nothing else | **H** (4.1) |
| 2 | The PayBox EVM address is one address on every `eip155` chain and is public | H (`[25]` 2.1) |
| 3 | PayBox's web app is a WalletConnect v2 wallet that accepts `personal_sign` and `eth_signTypedData_v4` for `eip155` chains in its portfolio list: Ethereum 1, OP 10, BNB 56, Polygon 137, Monad 143, HyperEVM 999, Robinhood 4663, Arc 5042, Base 8453, Arbitrum 42161, Celo 42220, Avalanche 43114; a request is refused if `domain.chainId` is set and differs from the session chain | H for the code read in `[31]` 4.1; **runtime not tested** |
| 4 | The MCP `request_wallet_sign` `typedData` intent takes a viem `TypedDataDefinition` and reads `chainId` from the domain; no domain or chain allowlist was found | H for the schema read in `[25]` 2.2; not called |
| 5 | The SafeOp domain has **no `name` or `version`** | The WalletConnect preview is documented as "Typed data for <domain.name>" (H, `[31]`), so the approver sees an empty or undefined name and none of the fields. Not a blocker, a display problem. |
| 6 | PayBox returns a 65-byte signature with `v` = 27 or 28 | **Unverified.** If `v` came back as 0 or 1 the Safe would read it as a contract signature or an approved-hash signature and reject it; the SDK would need to normalise `v`. Zero-cost test below. |
| 7 | PayBox accepts a typed-data payload with `bytes`, `uint48`, `uint128` fields and a two-field domain | Unverified. viem's `signTypedData` handles it; PayBox's server-side handling is not documented. |
| 8 | The domain `chainId` for the target chain is in the session (the WalletConnect session is built only from the chains the PayBox wallet credential lists) | H for the eight chains; the multichain `MerkleTreeRoot` domain has **no** `chainId` at all (`{verifyingContract}` only), so the "domain.chainId differs" check does not apply and the signature is deliberately valid on every chain (section 9.1). |
| 9 | Latency: bundler and paymaster calls precede the signature, and the signature must reach the bundler before `validUntil` and before the paymaster's own validity window expires | Set `validUntil` to minutes, not zero; the PayBox tab must be open, signed in and be the leader tab (H, `[31]` 4.4); a closed tab means the request waits on the WalletConnect relay until it expires (M). |
| 10 | Security of the route: the WalletConnect client PayBox creates is `autonomous` with no expiry and "appears to sign without a per-request confirmation" (H code, server behaviour untested, `[31]` 4.4 and risks) | Any page holding the session can request typed-data signatures over that wallet, including a SafeOp for a drain. A dedicated PayBox wallet funded with a small amount is the mitigation already adopted in `[P1]` A4. |

**Conclusion:** the server-less owner path is plausible and needs no raw digest, which removes the blocker `[25]` found for XO (`raw` UserOp hash over WalletConnect). It is not established until links 3, 6, 7 and 8 are exercised. The test costs nothing and touches no chain:

- **T-C1 (zero cost, zero network).** Build a SafeOp locally for any chain in the list with a dummy `callData`, request `typedData` signing from the PayBox wallet (WalletConnect or MCP, whichever the user chooses to run), then recover the signer locally with `viem` `recoverTypedDataAddress` and compare with the PayBox address; also normalise and check `v`. Pass/fail answers links 3 to 8 without sending anything. Failing at link 7 or 3 would kill this route and leave only a hot-key owner (no longer "derived from PayBox").

### 4.3 What the owner signature does not give you

It binds each UserOp exactly, but it is **not** a policy: the owner key can sign any operation. A compromised agent that holds an `autonomous` PayBox grant can sign a SafeOp that transfers everything the Safe holds. The Safe signature scheme adds no cap. Section 7 lists what can.

### 4.4 Passkeys instead of PayBox

The Safe passkey owner (WebAuthn, P-256) is a supported owner type (H); it is a different key from the PayBox wallet and would be created in the user's own browser. It is relevant only as a second owner or as an alternative if the PayBox route fails link 3.

### 4.5 "Derived from PayBox and any other wallet"

- The Safe address depends on the full initial owner list, the threshold and `c2Nonce`. `owners=[PayBox]` and `owners=[PayBox, MetaMask]` are **different addresses**.
- To keep one address and let several wallets act: create with `owners=[PayBox]`, then add owners later with an owner-management transaction (per chain, or in one signature through `SafeMultiChainSigAccountV1`). Each added owner at threshold 1 has full control, so the account is as safe as its weakest owner.
- Threshold 2-of-2 with a **local co-signer key** is the only design in this stack in which a compromise of the PayBox grant alone cannot move funds (section 7.4).
- The same owner on a chain where the factory or module is missing yields an address nobody can deploy; funds sent there are stranded until the contracts exist. `[25]` 5.3 already sets the rule: never show a counterfactual address as a deposit target before a per-chain code check.

---

## 5. Chains: where the stack can actually run

### 5.1 Intersection table (H unless tagged)

"Verified" below means Sourcify exact match (a lower bound). "Safe registry" = `safe-global/safe-modules-deployments`, `safe-4337-module/v0.3.0` (`networkAddresses`). Candide's own page claims every contract it lists is at the same address on every supported EVM network.

| Chain | Candide bundler/paymaster | ERC-20 gas tokens (docs) | PayBox typed data (WC list) | EP v0.7 / v0.9 / Safe L2 1.4.1 / proxy factory 1.4.1 (Sourcify) | Safe4337Module v0.3.0: Safe registry / Sourcify | Allowance Module v1.0.0 |
|---|---|---|---|---|---|---|
| Ethereum 1 | yes | DAI, USDC, USDT and others | yes | all verified | yes / yes | yes (Sourcify) |
| Optimism 10 | yes | DAI, USDC (native and bridged), USDT | yes | all verified | yes / yes | yes |
| BNB 56 | yes | DAI (peg), BSC-USD, USDC (peg) | yes | all verified | yes / **no** | **not deployed** (docs) |
| Polygon 137 | yes | DAI, EURe, USDC native, USDC.e, USDT, XAUt0 | yes | all verified | yes / no | yes |
| HyperEVM 999 | yes | **none listed** | yes | all verified (EP v0.7, v0.9, Safe L2, factory) | **not in Safe registry** / no | **not deployed** (docs) |
| Base 8453 | yes | DAI, USDC native, USDS, USDT | yes | all verified | yes / no | yes |
| Arbitrum 42161 | yes | DAI, EURe, USDC native, USDT, XAUt0 | yes | all verified | yes / yes | yes |
| Avalanche 43114 | yes | USDT (bridged) only | yes | all verified | **not in Safe registry** / no | yes (Sourcify) |
| Celo 42220 | yes | cUSD, cEUR, USDC, USDT | yes | not probed | not probed | not probed |
| XO 3223, Robinhood 4663, Arc 5042, SX 4162, Monad 143 | **no** | n/a | 4663, 5042, 143 yes; 3223, 4162 no | n/a | n/a | n/a |

Reading:
- The set that is genuinely common to Candide and the PayBox typed-data list is **nine chains**: 1, 10, 56, 137, 999, 8453, 42161, 43114, 42220. (The brief's "ten EVM chains" for PayBox is the catalog in `[25]` 2.1; the WalletConnect display map in `[31]` has twelve, adding Monad and Celo.)
- **Independent evidence of the Safe 4337 module exists for six chains (the Safe registry's list)**; for HyperEVM and Avalanche only Candide's own statement supports it, and a JSON-RPC `eth_getCode` (not allowed in this task) would settle it. Candide's own paymaster contract V3 for v0.7 is Sourcify-verified on 1, 10, 56, 137, 8453, 42161 and not on 999 and 43114 (H, probe).
- On **HyperEVM, ERC-20 gas has no listed token**. HyperEVM is also **not HyperCore**: Hyperliquid's prediction-market outcomes (HIP-4) live on HyperCore, where the account is the signer's address (`[25]` 4.1). A 4337 account on HyperEVM does not become a HyperCore account.
- BNB Chain has the prediction venues the user wants to add and **no Allowance Module**, so no on-chain spend cap there from this stack.

---

## 6. Gas: who pays, how much, and what "gasless" means here

### 6.1 Options, with the cost and the bearer

| Option | Gasless for the user? | Who pays | Limits | Fit with binding decisions |
|---|---|---|---|---|
| **Keyless public endpoint + native gas in the Safe** | No (user holds the native token) | user, at network cost | unknown per-IP rate limit | Fits. Defeats the purpose on chains where the user holds only stablecoins. |
| **Keyless + ERC-20 token paymaster** (`Erc7677Paymaster.createPaymasterUserOperation(..., {token})`) | Gas paid in a stablecoin from the Safe; no native token needed | user, in the token, at Candide's quoted exchange rate (a stated "on-chain markup" exists in the token paymaster, size **NOT FOUND**: changelog 0.4.3 mentions it, the pricing and terms say "zero markup on gas" for sponsorship only; terms 5.2 say rates are not guaranteed) | token list per chain (section 5.1); first operation also pays for the Safe deployment; an `approve` to the paymaster is prepended to `callData` by the SDK, which is why the 0.4.2 spender bug mattered | Fits. This is the honest default for "no native token needed". The dApp must pin the expected paymaster address and cap `approveAmount` (the SDK exposes both since 0.4.2). |
| **Public gas policy someone else funded** | Yes, if the UserOp matches the policy's exact call list | the policy's funder | NOT FOUND whether any exists for prediction-market calls | Opportunistic only; cannot be relied on. |
| **User's own Candide account (Starter), private policy** | Yes, for the user's own operations | Candide for the service, the user for the gas deposited | 2 mainnet chains, 2,500 mainnet UserOps total, **1,000 sponsored ops total**, 2 policies, 25,000 API requests total | Fits ("bring your own key") but the key is a URL path segment, so it must live in the user's local daemon, not in page code (as `[dd]` G4 already says). Two chains is below the eight asked for. |
| **Launch ($333/mo) or Grow ($749/mo) for the user** | Yes | the user | Launch has seven chains, Grow all | Not a realistic ask of individual users. |
| **Author funds a public policy and a key** | Yes | the author | per plan | **Violates "nothing the author operates"** and terms 7.1 ("reselling") if the key is shared; also puts a funded hot wallet behind an open endpoint. Rejected. |
| **Venue-paid gas** | Yes, for what the venue relays | the venue | per venue | Already how Polymarket (relayer for Deposit Wallet), Opinion ("Opinion pays match/settle gas"; Safe transactions relayed by its backend) and XO (PolicyPaymaster) behave. This covers most of what a trader does without any Candide account. |

### 6.2 Cost model (formulas only; I have no gas measurements)

- Candide service fee per month on a paid plan = plan price + max(0, sponsored ops - included) x per-op fee. Gas is extra, at cost, drawn from the policy deposit.
- Starter lifetime budget = 2,500 mainnet UserOps, of which 1,000 may be sponsored; each UserOp costs about 10 API requests, so 25,000 requests also caps it near 2,500 operations.
- **Per-operation gas for a Safe UserOp on each chain: NOT MEASURED** (no JSON-RPC allowed). Nothing here should be read as a claim that sponsorship is cheap or expensive on a given chain. The first operation includes proxy creation and module setup, which is materially larger than later ones (M).
- Sponsoring all eight chains for strangers is therefore a monthly bill of $749 plus gas, paid by someone; the only party that can bear it under the binding decisions is each user for their own use, which Starter limits to two chains and 1,000 sponsored operations in total.

### 6.3 Abuse controls on Candide's side (H, gas-policies and architecture pages)

Per policy: effective date range, active flag, public or private, per-account total maximum, per-operation maximum, per-account rate limit, account allowlist, **origin allowlist** (web origins, wildcard subdomains, scheme required), **IP allowlist**, and ordered transaction rules (contract, selector, ABI, parameter constraints with `$eq/$gt/$gte/$lt/$lte/$startsWith`). A "Paymaster Verifier" checks policies against the submitted UserOp. Reading (M): the origin allowlist is a header check and is not a security boundary against a non-browser client; the transaction rules and per-op maxima are the real bound on what a leaked policy ID or key can drain. Platform API (a team-scoped management key in a Bearer header) can create and edit policies programmatically; that key is not for client code.

---

## 7. Session keys and "strict guardrails": what exists in this stack

### 7.1 Inventory (H unless tagged)

| Control | Type | Where it applies | Limit |
|---|---|---|---|
| `validAfter` / `validUntil` in each SafeOp | on-chain, per operation | any Safe UserOp | an expiry on a signature, not a spending bound |
| Safe **Allowance Module v1.0.0** (`0x691f...E331`; Certora and Ackee audits per Candide; "three security fixes" over v0.1.1) | on-chain, per delegate and token: one-time or recurring allowance, reset period, start delay | token transfers **from the Safe to any address the delegate names** (`to` is a free parameter of `createAllowanceTransferMetaTransaction`) | not for contract calls, not for arbitrary tokens in one number, **not deployed on BNB Chain or HyperEVM** (docs; Sourcify agrees). A compromised delegate can move the allowance to an attacker each period. |
| **Calibur** key settings (EIP-7702 account): expiration, admin flag, optional hook contract | on-chain | an EOA delegated to Calibur | a spending-limit hook ships nowhere I could find (NOT FOUND in the docs searched); a hook is a contract someone must write and deploy, which breaks "no new wallet contracts"; requires delegating the PayBox EOA, which `[25]` 5.4 killed for Phases 1 and 2 |
| **Safe Policies** | planned | | "Planned" for custom policies, hosted cosigner, SDK integration (H, status table) |
| **Gas policy rules** | off-chain rules at Candide's paymaster | what Candide will sponsor | bounds Candide's gas spend, not the user's funds |
| **2-of-2 Safe, PayBox + a local co-signer key** | software enforcement by the co-signer, signature check on chain | every UserOp of that Safe | the co-signer is a hot key on the user's machine: advisory against anyone who can reach it; effective against a compromised agent that holds only the PayBox grant |
| Safe module/guard ecosystem outside Candide (Zodiac Roles Modifier; `[25]` 5.2) | on-chain | calls | not part of Candide's SDK; adds a module the SDK does not know |

### 7.2 What it cannot bound: off-chain venue orders

Venue orders (XO, Polymarket, Opinion, Predict.fun, Limitless, Hyperliquid) are off-chain EIP-712 or ERC-1271 signatures that a matcher settles later. No account-level policy reads their amount (`[25]` 6.2, re-tested: the AbstractionKit/Candide stack adds no mechanism that changes this; the policy engines in this stack act on UserOp `callData`). **The earlier finding stands: on-chain session policies cannot cap off-chain-signed CLOB orders.** The on-chain bound for such venues remains the funded balance, which the Allowance Module can make rate-limited where it is deployed.

### 7.3 The one on-chain cap this stack does deliver

"Treasury and pump": the Safe holds the bulk; a hot address (a venue's deposit address, or a locally held session EOA) is topped up through an on-chain recurring allowance of $X per period. A compromised hot address loses at most the current balance plus one period's allowance; a compromised agent that only holds the PayBox grant but not the delegate key cannot raise the allowance without a Safe owner signature (the allowance change is a Safe transaction, so it needs the PayBox signature, which is again the thing a compromised agent may hold). Hence the cap is meaningful only together with approval-gated signing or the 2-of-2 co-signer, which `[P1]` A4 already identifies as the recommended mode. Not available on BNB Chain.

### 7.4 The 2-of-2 co-signer pattern

AbstractionKit supports multiple signers (`signUserOperationWithSigners` takes a list; threshold 1..N at creation; documented "Multisig Smart Accounts with Safe" guide). Pattern: owners `[PayBox EOA, local daemon EOA]`, threshold 2. The daemon verifies the decoded `callData` against rules (allowed targets and selectors, amount ceilings, daily total kept in its own ledger) before signing. Properties: a compromise of the PayBox grant (including the autonomous WalletConnect client) cannot produce a valid UserOp; a compromise of the local machine can. Cost: 130 bytes of signature instead of 65 (more verification gas, M), a second prompt flow, and the daemon holds a key (custody by the user, not by the author, which the binding decisions allow). It does nothing for off-chain orders.

---

## 8. Venue by venue (re-testing the earlier findings)

"Account the venue accepts" is from `[25]` 4.1 and the primary pages named; "Candide adds" is what this stack would contribute. H unless tagged.

| Venue (chain) | Account the venue accepts | A Candide Safe as the trading account? | What Candide could still add | Net |
|---|---|---|---|---|
| **XO** (3223) | Kernel v3.1 as maker with `signatureType 3` | **No.** Chain 3223 has no Candide endpoint and is outside every list; XO's own bundler and PolicyPaymaster apply (`[21]`). A Safe is not a Kernel. | nothing | Out. The earlier finding stands. |
| **Polymarket** (137) | New accounts: Deposit Wallet (`signatureType 3`, ERC-7739 wrapper); legacy Proxy and Safe via Polymarket's own factories | **No for new accounts.** On chain, Polymarket's open-source CTF Exchange has a `POLY_1271` type that accepts any contract with `maker == signer` and code (H, `Signatures.sol`), and a Safe implements ERC-1271 through its fallback handler (M); whether the off-chain CLOB registers such a maker is **unverified** and its docs require the Deposit Wallet. The legacy `POLY_GNOSIS_SAFE` type checks `getSafeAddress(signer) == safe` against Polymarket's own factory (H, line 117), so an arbitrary Safe fails that path. | Safe could be the **owner** of nothing here (the Deposit Wallet's signer must be the PayBox EOA per `[25]`); it can hold pUSD/USDC and pump to the Deposit Wallet | Treasury only. |
| **Opinion** (56) | A Safe that **Opinion's backend creates** for the user's login EOA (1 to 10 minutes, `multiSigWallet`); the owner EOA signs the Enable Trading `SafeTx` EIP-712 and orders; the backend relays (H, builder-mode docs) | **No.** The Safe is theirs; whether it carries the 4337 module or fallback handler is NOT FOUND, and it is not necessary. | nothing needed: the PayBox EOA signature suffices, BNB is in the PayBox list, Opinion pays match/settle gas | **Add Opinion without Candide.** Needs the user's one-time web onboarding (`[09]` 2.2); geo-restricted. |
| **Predict.fun** (56) | "Traditional EOA or a Smart Wallet": the Smart Wallet is **Privy plus ZeroDev** (H, `docs.predict.fun/knowledge-base/wallets`), gasless and approval-less inside their app; the API supports EOA signing | **No for the Smart Wallet** (a ZeroDev Kernel they create); **EOA mode works** with a PayBox EOA (login `message`, orders `typedData`, BNB approvals) | nothing needed | **Add Predict.fun without Candide**, in EOA mode, with BNB for approval gas (an ERC-20 gas path via Candide would need a Safe, which Predict does not recognise as the trading account). Geo-restricted, API key self-service. |
| **Limitless** (8453) | EOA mode, or a smart-wallet mode in which "the API rejects EOA-signed orders" (`[09]` 2.3) | EOA mode only | USDC approvals | Out of scope for Candide. |
| **PancakeSwap prediction** (56) | `require(!_isContract(msg.sender))` and `tx.origin == msg.sender` (`[25]`) | **Impossible**: a 4337 account is a contract caller | nothing | Out. EOA only. |
| **Hyperliquid HIP-4** (HyperCore) | account = signer; agent wallets sign only (`[25]` 4.1) | **No**: HyperEVM 999 is a different layer | nothing | Out. |
| **Trueo** (8453), **Quotient x402** (Base) | plain EOA; x402 needs an undelegated payer | No (positions would sit in the Safe; x402 payer must be an EOA) | batching only | Out. |
| **SX Bet** (4162) | EOA maker | chain not supported | nothing | Out. |

Tally: of the venues the user named (XO, Polymarket, Opinion, Predict.fun) **none accept a Candide account as the trading account**; two of the four (Opinion, Predict.fun) can be added on BNB Chain with the PayBox EOA alone. The proposal's central picture, one smart wallet placing bets everywhere, is not supported by the venues' own account rules, which re-confirms `[25]` section 4.3 ("any generic AA wallet is wrong for roughly half the venues and unused by the rest") with one refinement: the Polymarket exchange contract would accept a generic ERC-1271 maker on chain, so the block there is the venue's off-chain gate, not its contract.

---

## 9. Cross-chain: what Candide offers and what it does not

### 9.1 Safe Unified Account (H)

- One EIP-712 signature over `MerkleTreeRoot(bytes32 merkleTreeRoot)` with domain `{verifyingContract}` only (no chain id) authorises a set of UserOps, one per chain; each chain's UserOp carries the Merkle proof. EntryPoint v0.9, a different module and different account addresses than `SafeAccountV0_3_0`.
- Documented uses: add owner, add guardian, change threshold on N chains with one signature; "consolidate USDC/USDT to one chain" through CCTP or LayerZero from all source chains with one signature.
- Limits: each target chain still needs a bundler, gas (sponsored or token-paid) and funds on that chain; the signature is intentionally replayable across the chains in the tree; the approver sees an opaque Merkle root, not the operations; it is audited once (Nethermind NM-0874) and is newer than the v0.7 module; USDC via CCTP is not available to or from BNB Chain (Circle, `[25]` 7.3). It is a way to sign several chain operations at once, not a way to place a bet on one chain with money held on another.

### 9.2 Other cross-chain items

- **Forwarding Address**: a hosted relay with a server-held bearer token; fails the local-first rule.
- **EIL**: an explainer of a protocol being built elsewhere; nothing to integrate.
- **Atlas**: NOT FOUND.
- Everything the user would call "seamless cross-chain bet placement" (hold USDC on Base, bet on Opinion on BNB) needs a bridge or an intent network that this stack does not contain. `[25]` 7.3 already records the rule "do not build a bridge; reuse CCTP, Hyperlane warp (Base to XO), PayBox `request_swap` with `dst_chain`". The dApp's unified view should **sum per-chain balances** and tell the user where each venue's balance lives, not move value.

---

## 10. Verdict, what to build first, tests, costs

### 10.1 Is it usable as "the account and gas layer"?

- **As the account layer:** conditionally yes, for one role (multi-chain treasury and funding account with the PayBox wallet as owner), only on the nine overlapping chains, behind a flag, and only after T-C1 passes. Not as a trading account for any venue named.
- **As the gas layer:** yes for bundling and token-paid gas on the keyless endpoint, with the caveats of an unknown per-IP limit and Candide's terms; no for free sponsorship at scale.
- **As a guardrail layer:** no, except the Allowance Module (six of eight chains) and a local co-signer.

### 10.2 What to build first (ordered; every step keeps writes flagged OFF)

1. **Nothing in the MVP changes.** The plan, the Kernel v3.1 decision and the "never: own wallet contracts / Safe as our layer" row in `[dd]` 2.5 stay; this note refines the reasons (the Safe row can be softened from "never" to "Phase 3 opt-in treasury account" if T-C1 passes).
2. **T-C1 (section 4.2), zero cost, zero chain access.** Local SafeOp build, PayBox typed-data signature, local recovery. Needs the user to run one signature (their call, not made here). Output: pass or fail on links 3, 6, 7, 8. Cost: none.
3. **Pure derivation module, no dependency (optional, read-only):** `owners -> Safe address` for `SafeAccountV0_3_0` over `viem`, golden vectors produced once with `abstractionkit@0.4.2` in a scratch directory. Used only to display "your multi-chain treasury address" in the account map, marked "not deployed, not a deposit target until a per-chain code check passes".
4. **T-C2 (cents): one real operation on one cheap chain** (e.g. Polygon or BNB), from a dedicated throwaway PayBox wallet, keyless endpoint, token paymaster, `validUntil` five minutes ahead: deploy the Safe and send a minimal transfer. Needs: a few cents of stablecoin in the Safe's counterfactual address on a chain where factory and module code are proven present (needs a JSON-RPC `eth_getCode`, which the app's RPC panel already does). Questions it answers: whether the keyless limit is livable, the real token markup, first-operation cost, whether the PayBox signature verifies (`AA24` or not), and the actual per-operation gas on that chain.
5. **Only then** add `abstractionkit` 0.4.2 (or the first release that is 14 days old and has no new regression) to `app/` with a provenance exception, behind a new flag, as a Phase 3 module; or keep the pure-`viem` encoder from step 3.
6. **Allowance Module and 2-of-2 co-signer** as separate opt-in steps after T-C2, on chains where the module exists; nothing on BNB Chain.

What to say to the user about Opinion and Predict.fun: they do not need the account layer at all. They need the PayBox EOA, BNB for Predict.fun approvals, and each venue's human onboarding step (Opinion's Safe creation, Predict.fun's API key). That is a venue-adapter job (`[09]`, `[census]`), not an AA job.

### 10.3 Costs and who bears them

| Item | Amount | Bearer |
|---|---|---|
| Keyless bundler and token paymaster | service $0; gas at cost in the user's token plus an undisclosed markup | Candide (infrastructure), user (gas) |
| Starter key for one user | $0, 2 chains, 1,000 sponsored ops, 2,500 UserOps total | user (and their Candide account) |
| Sponsoring all eight chains | $749 per month plus gas, plus $0.005 per op beyond 25,000 | whoever funds it; **cannot be the author** under the binding decisions |
| Implementation | one small dependency (+1 lockfile package, +183 KB minified, +51 KB gzip) or an owned encoder | author (build and review time) |
| Review burden | provenance exception; golden vectors on every SDK bump; a re-read of the changelog (23 releases per year, breaking changes in minors) | author |

---

## 11. Unverified, NOT FOUND, and what would settle each

| Item | Status | What would settle it |
|---|---|---|
| Keyless rate limit per IP | NOT FOUND | T-C2 observation; the user's own IP |
| Whether the keyless endpoint logs IP addresses | NOT FOUND | Candide (not contacted); do not assume |
| Previous (currently effective) Terms | NOT FOUND | none until 2026-10-30 |
| Token paymaster markup size | NOT FOUND (changelog says an on-chain markup exists) | `pm_supportedERC20Tokens` / on-chain read (POST, not done) |
| Any public gas policy that sponsors a prediction-market call | NOT FOUND | JSON-RPC probe (not done) |
| Safe 4337 module and paymaster code on HyperEVM 999 and Avalanche 43114 | claimed by Candide; absent from the Safe registry (module); Sourcify misses Candide's paymaster there | `eth_getCode` per chain |
| Which seven chains Launch includes | NOT FOUND | pricing page does not name them |
| PayBox returns `v` in {27,28}; accepts the two-field domain and `uint48`/`bytes` types; session includes the target chain; preview content for a nameless domain | unverified | T-C1 |
| Whether PayBox WalletConnect really signs without a per-request prompt | unverified (`[31]`) | user-run test |
| Whether Opinion's backend-created Safe has the Safe 4337 module or fallback handler | NOT FOUND | read the Safe on chain (not done) |
| Whether Polymarket's CLOB accepts a non-Deposit-Wallet ERC-1271 maker | unverified (contract accepts `POLY_1271`) | not testable without a funded account and Polymarket's gate |
| Per-operation gas of a Safe UserOp on each chain | NOT MEASURED | T-C2 |
| Audit coverage of AbstractionKit's TypeScript | NOT FOUND | none |
| "Candide Atlas" | NOT FOUND | none |
| Safe Allowance Module v1.0.0 audit contents (Certora, Ackee) | claimed by Candide's page; reports not read | read the PDFs (no PDF tooling used here) |

---

## 12. Sources

- Candide docs index: https://docs.candide.dev/llms.txt ; full text https://docs.candide.dev/llms-full.txt
- Public endpoints: https://docs.candide.dev/wallet/api/public-endpoints.md ; authenticated: https://docs.candide.dev/wallet/api/authenticated-endpoints.md ; networks: https://docs.candide.dev/wallet/api/supported-networks.md ; reliability: https://docs.candide.dev/wallet/api/reliability.md
- Pricing page: https://www.candide.dev/pricing ; billing: https://docs.candide.dev/wallet/pricing.md ; terms: https://www.candide.dev/legal/tos ; privacy: https://www.candide.dev/legal/privacy-policy ; status: https://status.candide.dev
- InstaGas: https://docs.candide.dev/instagas/overview.md , /instagas/gas-policies.md , /instagas/architecture.md ; sponsorship guide: https://docs.candide.dev/wallet/guides/send-gasless-tx.md ; token gas: https://docs.candide.dev/wallet/guides/pay-gas-in-erc20.md ; tokens: https://docs.candide.dev/wallet/paymaster/tokens-supported.md ; paymaster RPC: https://docs.candide.dev/wallet/paymaster/rpc-methods.md
- Deployments: https://docs.candide.dev/wallet/technical-reference/deployments.md
- Voltaire: https://docs.candide.dev/wallet/bundler/installation.md ; https://github.com/candidelabs/voltaire
- AbstractionKit: https://www.npmjs.com/package/abstractionkit ; https://registry.npmjs.org/abstractionkit ; tarballs `https://registry.npmjs.org/abstractionkit/-/abstractionkit-0.4.2.tgz` and `-0.4.3.tgz` ; https://github.com/candidelabs/abstractionkit (README, `CHANGELOG.md`) ; docs https://docs.candide.dev/wallet/abstractionkit/introduction.md , /safe-account-v3.md , /safe-unified-account.md , /external-signers.md , /calibur-account.md
- Allowance and recovery: https://docs.candide.dev/wallet/plugins/allowance.md , /allowance-reference.md , /allowance-migration.md
- Safe Unified Account: https://docs.candide.dev/wallet/guides/chain-abstraction-overview.md , /chain-abstraction-getting-started.md ; https://github.com/candidelabs/safe-4337-multi-chain-signature-module
- Safe Policies and EIL: https://docs.candide.dev/account-abstraction/research/safe-policies.md , /eil.md ; Forwarding Address: https://docs.candide.dev/forwarding-address/overview.md
- Safe 4337 module: https://github.com/safe-global/safe-modules (`modules/4337/contracts/Safe4337Module.sol`, README audits list) ; deployments registry https://github.com/safe-global/safe-modules-deployments (`src/assets/safe-4337-module/v0.3.0/safe-4337-module.json`)
- Polymarket CTF Exchange signature types: https://github.com/Polymarket/ctf-exchange (`src/exchange/mixins/Signatures.sol`)
- Predict.fun: https://docs.predict.fun/knowledge-base/wallets.md , https://dev.predict.fun/llms.txt ; Opinion: https://docs.opinion.trade/developer-guide/opinion-clob-typescript-sdk/builder-mode/create-user.md , /enable-trading.md
- npm attestations endpoint used: `https://registry.npmjs.org/-/npm/v1/attestations/{package}@{version}` ; Sourcify: `https://sourcify.dev/server/v2/contract/{chainId}/{address}`
- Repository: `docs/research/25-dapp-aa-wallet.md`, `31-paybox-web-signing-surface.md`, `09-venues-onchain-clob.md`; `docs/dapp-design.md` 2.4 to 2.5; `docs/build-log-v0.1.md` 2.4; `app/pnpm-workspace.yaml`; `app/scripts/check-supply-chain.mjs`; `app/scripts/check-deps.ts`; `app/scripts/dependencies.json`.

---

## Verification

What I re-checked, how, and the result (all 2026-10-20, UTC between about 06:55 and 07:20):

1. **Registry facts for `abstractionkit`.** Fetched the packument; read `dist-tags`, `time`, `license`, per-version `scripts`, `dependencies`, `deprecated`, `dist.attestations`. Result: latest 0.4.3, 80 versions, MIT, two dependencies from 0.4.0, no install-type script in any version, none deprecated, no attestation on any version. Cross-checked by calling the attestations endpoint (404 for `abstractionkit@0.4.1|0.4.2|0.4.3`; 200 for two noble packages as positive controls).
2. **Tarball identity.** Downloaded both tarballs to a scratch directory and compared `shasum` with the registry's `dist.shasum` (both equal). Extracted, listed files (`dist/`, `LICENSE`, `README.md`, `package.json`), read `package.json` (`files: ["dist"]`, `engines.node >= 18`, MIT).
3. **Age arithmetic.** Computed ages from the packument timestamps against 2026-10-20 07:15 UTC: 0.4.2 = 33.82 days, 0.4.3 = 13.72 days. Eligibility moment for 0.4.3 = 2026-10-20T13:56:02Z.
4. **Noble dependencies.** Fetched both packuments; checked licence, scripts, attestations, deprecation for the versions already locked in `app/pnpm-lock.yaml` (curves 1.9.1, hashes 1.8.0) and the newest 1.x (curves 1.9.7). Confirmed the lockfile text lists those versions.
5. **SDK source claims.** Read `dist/index.mjs` 0.4.3 around the SafeOp type definitions, `getUserOperationEip712Data*`, `baseSignUserOperationWithSigners`, `formatSignaturesToUseroperationSignature`, `pickScheme`, `fromViemWalletClient`; grepped for `7579`, `eval`, `new Function`, `innerHTML`, `WebAssembly`, `Buffer`, `node:`, and all `https://` literals. Result as stated in section 3.1.
6. **Contract source.** Read `Safe4337Module.sol` (v0.3.0 lines for typehashes, `domainSeparator`, `_getSafeOp`, `_validateSignatures`); recomputed both typehashes with keccak256 and they equal the constants in the source.
7. **Public endpoint behaviour.** GET on ten chain ids (identical body, including unsupported ids) and one CORS preflight (204 with permissive headers). No POST was sent.
8. **Docs claims.** Read pricing, billing, terms, privacy, public and authenticated endpoint pages, supported networks, gas policies, architecture, paymaster RPC head, token list, deployments, allowance pages, Safe Unified Account pages, Safe Policies status table, EIL page, Forwarding Address page; searched the full docs text for "atlas", "7579", "session key", "markup", "rate limit".
9. **Deployment evidence.** Sourcify GET on eight chains for eight addresses (EntryPoint v0.7, v0.9, Safe 4337 module v0.3.0, module setup, SafeL2 1.4.1, proxy factory 1.4.1, multichain module, Candide paymaster V3 v0.7) plus the Allowance Module; Safe registry JSON for the module and setup on the eight chains. Routescan was tried and returned 404 for every request including controls, so it was discarded.
10. **Size.** Ran the repo-pinned esbuild 0.28.2 on two scratch entry files against a scratch copy of the 0.4.3 `dist` with the repo's locked noble packages symlinked; recorded byte sizes and gzip sizes.
11. **Repo rules.** Read `docs/build-log-v0.1.md` 2.4, `app/pnpm-workspace.yaml`, `app/scripts/check-supply-chain.mjs` (rules, ceiling 150, install-time script scan), `check-deps.ts` (provenance exception rule), `dependencies.json` (format), root `package.json` and `pnpm-workspace.yaml`.
12. **Venue claims.** Read Predict.fun wallets and contracts pages, Opinion builder-mode create-user and enable-trading pages, and Polymarket's `Signatures.sol`; re-read `[25]` 4.1 and `[31]` 4.1 for the account and WalletConnect facts reused here.
13. **Voltaire.** `gh api` for licence, release list and README; read the installation page for the hardware and node requirements.

What I did **not** re-check or could not: any PayBox behaviour (no call allowed); any JSON-RPC result (no POST allowed), so deployment of the Safe module on HyperEVM and Avalanche, the token markup, gas costs and the keyless rate limit are open; the previous Candide terms; the audit PDFs; Opinion's on-chain Safe configuration; whether the Candide dashboard's free tier behaves as the pricing page states (no account created).

Checks of privacy: this file contains no email address, name, username or home path; third-party contact addresses seen in Candide's terms and docs were not copied; the User-Agent on every request was `insurance-markets-research/0.1`.
