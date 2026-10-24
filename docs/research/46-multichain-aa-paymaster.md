# 46. Multichain gas sponsorship and generated wallets: connected-wallet mode, generated-wallet mode, paymaster provider, one owner across chains

Task key `multichain-aa-paymaster`. Written 2026-10-24 (harness date). Read-only research: the installed `viem` 2.57.2 source under `app/node_modules/viem`, the repo's own notes and code, public documentation fetched by GET (User-Agent `insurance-markets-research/0.1`, about 0.5 s apart), npm registry metadata by GET, and five CORS preflight `OPTIONS` probes. Nothing was signed, sent, deployed or created; no account, API key or policy was made; no POST or JSON-RPC call went to any third party; `pnpm install`/`add` was not run.

Product requirement under test (verbatim from the product owner): "a seamless aggregated experience that abstracts everything, we either allow the user to connect their wallet and it operates multichain with the ability to have their gas sponsored through paymasters or they have generated smart wallets with account abstraction kits / scw's and we keep them all together across all chains", and "never ask users for API keys".

Confidence tags: **H** = read first-hand in a primary source or reproduced by my own probe in this run (source given); **M** = secondary, summariser-mediated, or inferred from H facts; **L** = judgement without direct evidence. **NOT FOUND (searched: ...)** is used literally. Note keys: `[19]` smart-account derivation, `[37]` venue-forced accounts, `[38]` cross-chain, `[39]` owner derivation, `[40]` economics and risk, `[41]` account graph, `[42]` move planner, `[DAC]` = `docs/dapp-aa-candide.md`, `[UAA]` = `docs/unified-accounts-agent.md`.

Venue-forced accounts (from `[37]`, unchanged): XO forces Kernel v3.1 on chain 3223 with XO's own bundler and PolicyPaymaster; Polymarket forces its Deposit Wallet on Polygon 137; Limitless uses the EOA (`signatureType 0`) on Base 8453 for API orders; Predict.fun uses Kernel v3.1 (or EOA) on BNB 56. Every one of them verifies a **secp256k1 ECDSA signature by an owner EOA**.

---

## 0. Bottom line

1. **The identity is one secp256k1 owner key E in both modes. Every venue account is derived from E, and no smart account of ours replaces E as the trading identity** (H for the venue rules, `[37]` 4.1 to 4.5). A connected wallet whose address is itself a contract (Coinbase/Base Smart Wallet) or a passkey (P-256) signer cannot own the XO Kernel account, a Polymarket Deposit Wallet or a Limitless EOA order (sections 1.4, 3.3).
2. **"Gas sponsored through paymasters" for a connected EOA is mostly not available from the wallet side today.** Of the major wallets, only Coinbase/Base Account documents the ERC-7677 `paymasterService` capability (H, erc7677.xyz wallet list and CDP docs), and that wallet is a smart contract, so it breaks venue identity. MetaMask implements EIP-5792 atomic batches through its own EIP-7702 upgrade on BNB, Base and Polygon but documents no `paymasterService` (H, MetaMask Connect docs). EIP-7702 delegation **must not** be requested by a dApp (H, EIP-7702 text: "Applications must not expect that they can suggest the user sign an authorization"), and viem's `signAuthorization` refuses JSON-RPC accounts (H, viem source).
3. **What works for any connected EOA, with no new npm package:** (a) on Polygon, Polymarket's own relayer makes every Deposit Wallet operation gasless when the request carries **our** Builder credentials, signed server-side (H, Polymarket docs); (b) on XO, XO's PolicyPaymaster already sponsors deploy and Enable Trading (existing code `app/src/features/trade/direct/xo/setup.ts`); (c) on Base, USDC allowances and USDC transfers can be gasless through EIP-2612 `permit` / EIP-3009 `transferWithAuthorization` typed-data signatures relayed by our server or by Across's gasless API (H for Across; M for the USDC contracts); (d) for actions from the derived Kernel account K(E) on Base, Polygon or BNB, an ERC-4337 UserOperation with our paymaster, built with viem's `createBundlerClient`/`createPaymasterClient` and a hand-written `toSmartAccount` Kernel adapter over the repo's existing Kernel UserOp code (H for the viem exports and the existing builders). The remaining gap is an EOA transaction with no permit path (for example Limitless's `setApprovalForAll` for SELL), which needs native gas or a user who accepts a 7702 upgrade in their own wallet.
4. **Generated-wallet mode is where full sponsorship works.** A browser-generated secp256k1 key is a viem *local* account, so it can sign EIP-7702 authorizations. Delegated to viem's default `Simple7702Account` (EntryPoint v0.8), the address stays E (still a valid ECDSA EOA for Limitless, the owner of K(E) and of the Deposit Wallet), and the first UserOperation carries the authorization with Pimlico paying (H: viem source, Pimlico docs, `Simple7702Account.sol`). `Simple7702Account.isValidSignature` checks plain ECDSA over the raw hash by `address(this)` (H), so venue contracts that switch to ERC-1271 once the signer has code (OpenZeppelin master, Solady; H) still accept E's order signatures. Kernel-7702 or Coinbase-style accounts wrap the hash and would break that (H for the wrapping), so they must not be used as E's delegate.
5. **Owner key custody without a vendor:** generate the key with WebCrypto (`viem/accounts` `generatePrivateKey`), encrypt it with an AES-GCM key derived via HKDF from a WebAuthn PRF output, and store the ciphertext in IndexedDB (`idb` 8.0.3 is already a dependency) plus an encrypted backup blob on our API, with an explicit export. PRF support: Chrome/Edge 116+, Firefox desktop 139+, Safari 18+ for platform passkeys (MDN data marks Safari `get` false, a WebKit thread says released Safari works for platform authenticators but not hardware keys; H for both, so the conflict is real), Firefox Android `get` not supported (H, MDN data). A fallback for authenticators without PRF is needed (a password-wrapped key, or a vendor).
6. **Vendors add weight or cost and one breaks the lockfile:** `@privy-io/react-auth` 3.51.0 pins `viem@2.57.8` and `@walletconnect/*@2.22.4` (H, npm registry), the WalletConnect line already refused for needing `@noble/curves` 1.8.0; Turnkey charges $0.10 per signature after 25 free on Pay as You Go (H), which is ruinous when every CLOB order is a signature; Dynamic is $249/month from launch (H); Para is free to 1,200 MAU, then $200/month (H); Magic is $0 to 1,000 MAW with 3 dependencies (H); Web3Auth is free to 1,000 MAW (H). **Vendor-free is recommended.**
7. **Recommended paymaster provider: Pimlico**, reached only through a proxy route on our markets API. It is the only candidate that serves Polygon, Base and BNB with bundler and paymaster on EntryPoint v0.7 and v0.8, has Kernel 0.3.1 in its supported-accounts table, supports `eip7702Auth`, follows ERC-7677, has no monthly fee on pay-as-you-go (10% surcharge on sponsored gas), and has policies with global, per-user and per-operation USD caps plus a chain allowlist and an approve/reject webhook (all H, Pimlico docs). **No provider serves XO 3223** (NOT FOUND in Pimlico, ZeroDev, Alchemy, CDP, Biconomy and Relay lists; Candide per `[40]`), so XO stays on XO's own PolicyPaymaster.
8. **The key must not reach the browser or a wallet.** The `paymasterService` URL handed to a wallet is visible to anyone, and Pimlico's origin restriction rests on a header that any non-browser client can set. ERC-7677's own Security Considerations recommend that "app developers provide a URL to their app's backend, which can then proxy calls to paymaster services" (H). The markets API already runs this pattern for XO and Limitless (`api/xo-relay.ts`, `api/limitless-relay.ts`).
9. **"Keep them all together":** K(E) has the same address on 3223, 137, 8453 and 56 (H, `[39]` §9: factory `getAddress` agrees on six chains plus 3223); the Deposit Wallet D(E) is a CREATE2 function of E (H, `[37]` 4.2); Limitless is E itself. One owner gives one account map, and the unified balance view reads E, K(E) and D(E) per chain (`[41]`). Money moves through the Base USDC hub (`[42]`): Polymarket bridge deposit addresses (the creation endpoint is keyless with CORS `*`, H OPTIONS), CCTP v2 with Circle's Forwarding Service (no destination gas, H), Across gasless (EIP-3009/Permit2 signature, Across submits, H, operator API key), Relay `/execute` (gasless with an optional 7702 `authorizationList`, H, operator API key and funded app balance). XO is reachable only by XO's Hyperlane route (`[42]`).
10. **No new npm package is needed in `app/`** (H for every viem export used: section 1.1). The server proxy is plain `fetch`. One conflict with the requirement remains outside this note's scope: the Limitless ticket asks the visitor to paste a Limitless API token (`app/src/features/trade/direct/limitless/token.ts`), which "never ask users for API keys" forbids. Limitless's partner programme (EOA sub-accounts, `[37]` 4.5) is the candidate fix, UNVERIFIED.

---

## 1. Connected-wallet mode

### 1.1 What the installed viem 2.57.2 gives us (H, `app/node_modules/viem`)

| Need | viem 2.57.2 | Evidence |
|---|---|---|
| ERC-4337 bundler client | `createBundlerClient`, `bundlerActions` | `_types/account-abstraction/index.d.ts` exports |
| ERC-7677 paymaster client | `createPaymasterClient`, `getPaymasterStubData`, `getPaymasterData` | same |
| Custom smart account (for Kernel v3.1) | `toSmartAccount` | same; the repo already builds Kernel v3.1 UserOps by hand (`sdk/trade/xo/userop/*`, `app/src/features/trade/direct/xo/setup.ts`) |
| EIP-7702 account | `toSimple7702SmartAccount`; default implementation `0xe6Cae83BdE06E4c305530e199D7217f42808555B` (EntryPoint 0.8) or `0xa46cc63eBF4Bd77888AA327837d20b23A63a56B5` (0.9) | `_esm/account-abstraction/accounts/implementations/toSimple7702SmartAccount.js` lines 40 to 46 |
| How Simple7702 signs a UserOp | `getUserOperationTypedData` then the owner's `signTypedData` (EntryPoint 0.8 user-op hash is EIP-712) | same file, `signUserOperation` |
| Coinbase, Solady accounts | `toCoinbaseSmartAccount` (replay-safe typed-data wrap `CoinbaseSmartWalletMessage`), `toSoladySmartAccount` (factory `0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df`, signs the user-op hash with `signMessage`) | implementation files |
| Passkey signer | `toWebAuthnAccount`: `type: 'webAuthn'`, signs with `ox/WebAuthnP256` | `_esm/account-abstraction/accounts/toWebAuthnAccount.js` |
| EIP-7702 authorization | `signAuthorization` throws `AccountTypeNotSupportedError`: "The `signAuthorization` Action does not support JSON-RPC Accounts." | `_esm/actions/wallet/signAuthorization.js` |
| EIP-5792 | `sendCalls`, `getCapabilities`, `getCallsStatus`, `waitForCallsStatus`; capability schema includes `paymasterService: { url, context?, optional? }` on `sendCalls` and `paymasterService: { supported }` on `getCapabilities` | `_types/types/capabilities.d.ts` |
| 5792 fallback | `sendCalls({ experimental_fallback: true })` falls back to sequential `eth_sendTransaction` when the wallet lacks `wallet_sendCalls`, but throws if any capability is non-optional | `_esm/actions/wallet/sendCalls.js` |
| Local key | `generatePrivateKey`, `privateKeyToAccount` (local accounts implement `signAuthorization`) | `viem/accounts` |

The dApp's WalletConnect session asks only for `eth_signTypedData_v4`, `personal_sign`, `eth_sendTransaction` and `wallet_switchEthereumChain` (H, `app/src/core/walletconnect.ts` line 28). `wallet_getCapabilities` and `wallet_sendCalls` would have to be added as optional methods for WalletConnect wallets to receive them.

### 1.2 Option (a): EIP-5792 `wallet_sendCalls` with ERC-7677 `paymasterService`

- **Standards (H):** EIP-5792 is Final; ERC-7677 is in Review and requires 4337 and 5792. ERC-7677: "The wallet will then make the above paymaster RPC calls to the URL specified in the `paymasterService` capability field", and its Security Considerations recommend proxying through the app's backend to keep provider keys secret.
- **Wallet support:**

| Wallet | `paymasterService` | Chains | Account type | Evidence |
|---|---|---|---|---|
| Coinbase / Base Account (Coinbase Smart Wallet) | Yes | Example response lists Base `0x2105` and Base Sepolia; capabilities are "chain-specific and account-specific"; Polygon and BNB NOT FOUND (searched: CDP capabilities overview, `wallet_getCapabilities` reference, one web search) | Smart contract (ERC-4337) | H, `docs.cdp.coinbase.com/coinbase-wallet/reference/core/provider-rpc-methods/wallet_getCapabilities.md`; the only wallet on `erc7677.xyz/ecosystem/wallets` |
| MetaMask | NOT FOUND (no "paymaster" string anywhere in `llms-metamask-connect-full.txt`) | Atomic batch via its own 7702 upgrade on Ethereum, Gnosis, BNB, OP, Base, Polygon, Arbitrum, Unichain, Berachain | EOA, upgraded to "MetaMask smart account" on consent | H, MetaMask Connect docs (`docs.metamask.io/llms-metamask-connect-full.txt`, batch-transactions section) |
| Rabby, Rainbow, Ambire, Trust | NOT FOUND (searched: erc7677.xyz wallet list, two web searches) | n/a | n/a | n/a |
| WalletConnect-connected wallets | Per wallet: the request passes through if the session grants `wallet_sendCalls` | n/a | n/a | M; our session does not request it today (H, section 1.1) |
| PayBox over WalletConnect | No: signs messages and typed data only, cannot send transactions | n/a | n/a | H, `app/src/core/walletconnect.ts` comment and `[DAC]` |

- **Coinbase's base endpoint `https://paymaster.base.org/api/v1/sponsor`** appears in the CDP examples (H); its eligibility rules were not read (NOT FOUND).
- **Verdict:** usable as an opportunistic path when `getCapabilities(chain).paymasterService.supported === true`, pointed at our proxy. It cannot be the main path, because the one wallet that supports it has a contract address that cannot own venue accounts (section 1.4).

### 1.3 Option (b): EIP-7702 delegation of the user's EOA

- **A dApp may not ask for it (H).** EIP-7702 (Final): "Applications **must not** expect that they can suggest the user sign an authorization, and therefore it is the duty of the wallet to not provide an interface to do so. **There is no safe way to provide this interface**." viem refuses `signAuthorization` for JSON-RPC accounts (section 1.1), and MetaMask's Smart Accounts Kit repeats it (H, `llms-smart-accounts-kit-full.txt` line 569: "The `signAuthorization` action does not support JSON-RPC accounts.").
- **What wallets do instead (H, MetaMask):** an atomic `wallet_sendCalls` may make MetaMask "prompt users to upgrade their externally owned account (EOA) to a MetaMask smart account" (its `EIP7702StatelessDeleGator`). "If the user has already upgraded their account to a third-party smart contract account, MetaMask does not currently support atomic batch transactions for that account." The upgrade transaction itself is paid by the user in native gas (M: it is the EOA's own type-4 transaction; MetaMask documents no sponsor).
- **A possible but unproven path (M/L):** after a MetaMask user has upgraded, E carries the DeleGator, which validates UserOperations by an EIP-712 `PackedUserOperation(... address entryPoint)` signature (H, `MetaMask/delegation-framework` `src/EIP7702/EIP7702DeleGatorCore.sol` lines 56 to 57). A dApp could then build a UserOperation with `sender = E`, have MetaMask sign it with `eth_signTypedData_v4`, and send it through Pimlico with our paymaster, with no authorization request. Whether MetaMask shows or blocks that typed-data request is UNVERIFIED (test X3, section 7). The DeleGator's `isValidSignature` is plain ECDSA over the raw hash (H, `EIP7702StatelessDeleGator.sol` line 55), so venue order signatures stay valid.
- **Toolkits:** MetaMask Smart Accounts Kit (`@metamask/smart-accounts-kit`), ZeroDev `to7702KernelSmartAccount`, Pimlico `to7702SimpleSmartAccount` all assume a *local* signer for the authorization (H, docs). They are new packages; viem's `toSimple7702SmartAccount` covers the same need for local keys.

### 1.4 Option (c): an ERC-4337 smart account owned by the EOA

- **The right one is K(E), not a new Safe.** XO forces Kernel v3.1 and Predict.fun uses the same implementation and validator (H, `[37]` 4.3). The factory's `getAddress` returns the same K(E) on Ethereum, Polygon, Base, Arbitrum, BNB, Optimism and 3223 (H, `[39]` §9 and §4.1). Pimlico lists Kernel 0.3.1 as supported on EntryPoint v0.7 on Base, Polygon and BNB (H, `docs.pimlico.io/guides/supported-chains.md`).
- **Signing:** Kernel v3.1 user-op hashes on EntryPoint v0.7 are not EIP-712, so the owner must `personal_sign` the 32 raw bytes (H, the repo's XO setup flow comment, `app/src/features/trade/direct/xo/setup.ts` step 6). Browser wallets can do this; PayBox over WalletConnect cannot (H, same file, `RAW_SIGNING_WORDS`). For PayBox only, a typed-data account (Safe S1 `[39]`, or any EntryPoint v0.8 account whose validator checks raw ECDSA over the EIP-712 user-op hash) is needed; that account is a treasury, not a venue account.
- **What K(E) can do off XO:** hold funds and pay for funding moves (bridge burns, transfers to deposit addresses) with our paymaster; be the Predict.fun account if Predict accepts a K(E) it did not provision (UNVERIFIED, `[37]` test T-V2). It cannot replace E on Limitless or D(E) on Polymarket.

### 1.5 Venue compatibility of each option

| Option | XO (3223) | Polymarket (137) | Limitless (8453) | Predict.fun (56) |
|---|---|---|---|---|
| E as-is, no AA | Owner of K(E); K(E) setup sponsored by XO's PolicyPaymaster (existing) | Owner of D(E); D(E) operations gasless via Polymarket relayer with our Builder key (H, section 4.2) | Trading identity; approvals cost ETH, USDC allowance could be a relayed `permit` (M) | E in EOA mode (BNB gas) or owner of K(E) |
| (a) Coinbase Smart Wallet address W | **Breaks**: the Kernel ECDSA validator needs an EOA owner (H, `[37]` 4.1 signature format `0x01‖validator‖ecdsa`) | **Breaks** for docs: Deposit Wallet owner as a contract NOT FOUND (`[37]` 4.2) | **Breaks**: type 0 needs ECDSA by `signer == maker` (H, `[37]` 4.5) | Breaks for the SDK (`ecdsaValidatorStorage` must equal the signer) |
| (b) E delegated by 7702 to Simple7702 or MetaMask DeleGator | Compatible: the Kernel validator recovers ECDSA against the stored owner (M; validator source per `[19]`) | Contract-level compatible: if the Deposit Wallet uses an ERC-1271-on-code checker, the delegate's raw-ECDSA `isValidSignature` passes (H for the delegates; Deposit Wallet source NOT FOUND, `[37]` 4.2) | Compatible at the contract (type 0 is ECDSA); whether Limitless's backend rejects an EOA with code: UNVERIFIED | Compatible at the contract (OZ `SignatureChecker`; H `[37]` 4.3) |
| (b') E delegated to Kernel-7702 or a Coinbase-style account | Compatible (validator path) | **Risky**: Kernel and Coinbase `isValidSignature` wrap the hash (H: XO docs' Kernel wrap in `[37]` 4.1, viem `toReplaySafeTypedData`); a checker that routes to ERC-1271 on code would reject E's raw order signature | Same risk | Same risk |
| (c) K(E) via 4337 | The XO account itself | Not a venue account | Not a venue account | Candidate venue account (UNVERIFIED) |

Why (b') is a hazard (H, source read): OpenZeppelin `SignatureChecker.isValidSignatureNow` on `master` uses `ecrecover` only `if (signer.code.length == 0)` and otherwise calls ERC-1271; Solady `SignatureCheckerLib` says "If `signer.code.length == 0`, then validate with `ecrecover`, else ..." ERC-1271. OZ v4.9.6 tried `ecrecover` first. A 7702-delegated EOA has code, so the delegate's `isValidSignature` decides. `Simple7702Account._checkSignature` is `ECDSA.recover(hash, signature) == address(this)` (H, `eth-infinitism/account-abstraction` `contracts/accounts/Simple7702Account.sol` line 45, `develop` branch; that the deployed `0xe6Ca...555B` matches it is M).

### 1.6 Recommended connected-wallet flow

1. Read `wallet_getCapabilities` once per chain (viem `getCapabilities`), and classify the account: EOA (no code), 7702-delegated EOA (code `0xef0100‖delegate`; read by `eth_getCode`), or contract wallet.
2. Contract wallet (Coinbase Smart Wallet): treasury and funding only. `paymasterService` to our proxy for transfers to deposit addresses. Show plainly that it cannot be the XO, Polymarket or Limitless identity; offer "create a trading key" (generated-wallet mode) owned beside it.
3. EOA: per chain:
   - **3223:** XO PolicyPaymaster (existing flow).
   - **137:** Deposit Wallet operations through Polymarket's relayer with our Builder key, HMAC added by a new markets-API relay route (the same shape as `api/limitless-relay.ts`). No Pimlico needed on Polygon for Polymarket.
   - **8453:** USDC allowance by EIP-2612 `permit` typed data relayed by our API's hot wallet (works for PayBox too, typed data only); USDC funding by EIP-3009 or Across gasless; the remaining plain transactions (CTF `setApprovalForAll`) are user-paid, or `wallet_sendCalls` with `paymasterService` when a wallet ever reports it.
   - **56:** K(E) UserOperations with Pimlico sponsorship (browser wallets), or user-paid EOA mode.
4. Never ask the wallet for an authorization. If the EOA is already MetaMask-delegated, test X3 decides whether sponsored UserOps with `sender = E` are offered.

---

## 2. Paymaster and bundler providers

All rows from the provider's own docs fetched today unless tagged.

| Provider | 137 / 8453 / 56 | 3223 | ERC-7677 | Policy controls | Price | Key protection |
|---|---|---|---|---|---|---|
| **Pimlico** | Yes / yes / yes; EntryPoint v0.6, v0.7, v0.8 bundler and paymaster (v0.9 bundler only); EIP-7702 ✅ on all three; Kernel 0.3.1 listed (H, `guides/supported-chains.md`) | No (H, 73 chain sections, no 3223) | Yes: `pm_getPaymasterStubData`, `pm_getPaymasterData` (H) | Sponsorship policy object: chain allowlist, global, per-user and per-operation USD spending limits, start/end time, webhook that returns `{"sponsor": true}` per request (H, `references/platform/api/sponsorship-policies/object.md`, `guides/how-to/sponsorship-policies/webhook.md`). No contract allowlist field in the object (searched the object page); our proxy or the webhook enforces targets | Free: testnets only. Pay-as-you-go: $0/month, card required, 10,000,000 credits/month included (~9,500 sponsored ops), then ~$0.0105 per sponsored op; 10% surcharge on sponsored mainnet gas; overdraft limit $1,000 companies, $10 individuals (H, `guides/pricing.md`) | API keys restrictable by IP, user agent and origin, and per feature (bundler, paymaster, account APIs); proxy recommended (H, `guides/how-to/security/protect-api-keys.md`). Public keyless endpoint has no mainnet paymaster, 20 requests/min/IP (H) |
| **ZeroDev** | Yes / yes / yes (H, `api-and-toolings/faqs/chains.md`) | Not in the docs list (searched); `chains.zerodev.app` is a script-rendered page with no data in the HTML (H) | Listed on erc7677.xyz (H) | Project, contract (contract and function), wallet and custom-webhook policies; rate limits by amount, requests, gas price, amount per transaction (H) | Sandbox $0 testnet only; Launch $69/month with 100,000 credits and mainnet sponsorship; Scale $399; 8% gas premium (H, `zerodev.app/pricing`) | Project RPC URL with the project id; key protection guidance NOT FOUND (searched: docs index for origin, whitelist, domain, security) |
| **Alchemy Gas Manager** | Yes / yes / yes (H, `wallets/supported-chains.md`) | No (H) | Listed on erc7677.xyz (H); own `alchemy_requestGasAndPaymasterAndData` (H) | Spending rules, sender allowlist, custom rules by webhook `{approved}` (H) | Free tier: mainnet N/A; PAYG $0/month, 8% of gas covered (H, `reference/gas-manager-faqs.md`) | Not read (NOT FOUND for origin rules in the pages fetched) |
| **Coinbase CDP Paymaster** | Base only: "CDP Paymaster currently supports Base Mainnet and Base Sepolia only" (H) | No | Yes, "ERC-7677 compliant" (H) | Contract allowlists, per-user limits, global caps (H) | Gas plus 7% fee, monthly invoice; up to $15K gas credits by application (H) | Endpoint URL from the portal; proxy recommended in Base docs (M, search summary) |
| **Biconomy (MEE)** | Yes / yes / yes (H, docs index chain table) | No (H) | NOT FOUND (not in its index; erc7677.xyz lists Biconomy, H) | "Enable sponsorship" per API key; finer policy NOT FOUND | "Sponsorship is post-paid"; prices NOT FOUND | One `mee_` key for all chains. Fusion mode for external EOAs routes tokens "through a temporary account" (H), which puts approvals and positions in the wrong account for venues |
| **Candide** | Yes / yes / yes (`[40]`, H there) | No (`[39]`, `[40]`) | Listed on erc7677.xyz (H) | Gas policies with general, account, access and transaction rules (H, docs index) | Starter $0 (1,000 sponsored ops lifetime, 2 mainnet chains); Launch $333/month; Grow $749/month (`[40]`, H there) | Public policies need no key in the page; per-user rate limiting not possible from a static site (`[40]`) |
| **Gelato** | Polygon, Base, BNB in a third-party listing (M) | NOT FOUND | NOT FOUND | Gas Tank cross-chain balance (M, search summary) | NOT FOUND | `docs.gelato.cloud` and `docs.gelato.network` failed TLS today with "certificate has expired" (H, probe), so nothing was read first-hand |

Coverage of 3223 by anyone except XO: NOT FOUND (searched: the six provider lists above, Relay's live `GET /chains` (59 chains, has 137, 8453, 56, not 3223; H)). `[42]` found no aggregator listing 3223 either.

### 2.1 Recommendation: Pimlico, behind our proxy

Why: the only option with all three chains, both EntryPoints we need (v0.7 for K(E), v0.8 for Simple7702), 7702 on all three, per-user caps, no monthly fee, and the standard ERC-7677 methods viem's `createPaymasterClient` speaks without a vendor SDK. ZeroDev is the runner-up (contract-level policies in the dashboard, but $69/month before the first sponsored op). CDP is Base-only.

**What the operator signs up for and pastes (exactly):**

1. Create a Pimlico account at `dashboard.pimlico.io`; switch to **Pay-as-you-go** (card). Set the overdraft alert.
2. Create **one API key**. Restrictions: enable only "Bundler methods" and "Paymaster methods"; **IP allowlist = the markets API server's egress IP** (the EC2 instance's public IP in the existing eu-north-1 stack). Do not set an origin restriction as a security measure (it is a header); the key never reaches a browser.
3. Create **one sponsorship policy**: chain allowlist `[137, 8453, 56]`; global limit (for example $50/month to start); per-user limit (for example $0.50/month per sender); per-operation limit (for example $0.10); optional webhook URL pointing at the markets API so our server can refuse anything not on our call allowlist.
4. Paste into the markets API's secret store (never into `app/`, never into the repo): `PIMLICO_API_KEY` and `PIMLICO_SPONSORSHIP_POLICY_ID`. The browser and any wallet get only `https://<markets-api>/v1/paymaster/<chainId>`.
5. For Polymarket gasless (not Pimlico): create a polymarket.com builder account, Settings, Builders: copy **builder code**, **Builder API key, secret, passphrase** into the same secret store (`POLYMARKET_BUILDER_*`). "Builder API credentials are secrets. Keep them on your server" (H).

The proxy route must: accept only `pm_getPaymasterStubData`, `pm_getPaymasterData`, `eth_estimateUserOperationGas`, `eth_sendUserOperation`, `eth_getUserOperationReceipt`, `eth_supportedEntryPoints`, `pimlico_getUserOperationGasPrice`; decode the UserOperation's `callData` (Kernel `execute`, Simple7702 `execute`/`executeBatch`) and check every call against an allowlist (venue exchange approvals, USDC `transfer` to a verified Polymarket bridge deposit address or CCTP `depositForBurn`, Across SpokePool deposits); attach `sponsorshipPolicyId` itself; rate-limit per sender and per IP; answer CORS for our origin and for `keys.coinbase.com` if Coinbase `paymasterService` is used (M: that wallet calls from its own web origin). Cost reference: a 400,000-gas UserOp is about $0.017 on Base, $0.010 to $0.015 on Polygon, $0.015 on BNB (`[40]` §3.2, M there), plus Pimlico's 10% and credits.

---

## 3. Generated-wallet mode

### 3.1 Vendor-free owner key with a passkey (recommended)

- **Key:** `generatePrivateKey()` (WebCrypto randomness) and `privateKeyToAccount()` from `viem/accounts` (H). It signs EIP-191, EIP-712, raw digests and EIP-7702 authorizations, so it satisfies XO (raw `personal_sign` of the user-op hash), Polymarket and Limitless (EIP-712 orders), and 7702.
- **Wrapping:** WebAuthn `navigator.credentials.create/get` with the `prf` extension; HKDF-SHA-256 over the PRF output gives an AES-GCM key (WebCrypto); the ciphertext of the secp256k1 key goes to IndexedDB through `idb` 8.0.3 (already a dependency, H `app/package.json`). The same PRF salt gives the same output for the same credential (M, PRF explainer), so a synced passkey on another device can decrypt **if the ciphertext is there too**: store an encrypted copy on the markets API keyed by credential id (the server never sees the key). Alternative: derive the secp256k1 key deterministically from the PRF output (no ciphertext to sync; losing the passkey loses the key unless exported). Either way, offer an explicit "export key" and a "download encrypted backup".
- **Browser support (H, MDN `browser-compat-data` `api/CredentialsContainer.json`, fetched today):**

| Browser | `create` with PRF | `get` with PRF |
|---|---|---|
| Chrome / Edge / Opera / Samsung Internet | 116+ | 116+ |
| Firefox desktop | 139+ (135 to 138 partial, not macOS) | 139+ |
| Firefox Android | 149+ | not supported (bug 1958716) |
| Safari macOS / iOS | 18+ | marked not supported (WebKit bug 259934) |

  WebKit bug 259934 is RESOLVED FIXED, and a comment in it says "Platform authenticator PRF support is well implemented in released Safari, but not for hardware keys" (H, `bugs.webkit.org/show_bug.cgi?id=259934`). The MDN row and the WebKit comment disagree; test G1 decides. Authenticator-side support (Windows Hello, 1Password, Bitwarden, Google Password Manager, iCloud Keychain) was not researched: NOT FOUND (not searched in this run).
- **Fallback when PRF is missing:** a password-wrapped key (PBKDF2 or scrypt via WebCrypto plus AES-GCM) with the same backup blob, or a vendor (3.2). Keys must never be held in the hosted page beyond the session that unlocked them.
- **Gas:** the generated E delegates by 7702 to `Simple7702Account` on Base, Polygon and BNB, sponsored by Pimlico (the first UserOp carries `eip7702Auth`, H Pimlico FAQ), and keeps acting as an ECDSA EOA for the venues (section 1.5). XO setup stays on XO's paymaster. Polymarket stays on Polymarket's relayer.

### 3.2 Vendors

| Vendor | npm (latest, H registry) | What the operator configures | Cost (H, pricing page today) | Fit |
|---|---|---|---|---|
| Privy | `@privy-io/react-auth` 3.51.0: 42 deps, 9 peers, 6.9 MB unpacked; **pins `viem@2.57.8`, `@walletconnect/ethereum-provider@2.22.4`, `@walletconnect/universal-provider@2.22.4`** | App id; allowed URLs in the dashboard (H, docs index "Configure allowed URLs"); app secret server-side | Free to 499 MAU (50K signatures, $1M volume); 500 to 2,499 MAU $299/month; 2,500 to 9,999 $499/month; PAYG beyond: $2,000 base, $0.05/MAU over 10K, $0.01/signature over 50K | Supports EIP-7702 (docs index "Integrating with EIP-7702"); **blocked by our lockfile policy** (WalletConnect 2.22 needs `@noble/curves` ≥ 1.8) |
| Dynamic | `@dynamic-labs/sdk-react-core` 5.12.3: 29 deps, 11.6 MB | Environment id, allowed origins (M) | Live mode from $249/month (5,000 MAU), $0.005/MAU above | Heavy, paid from day one |
| Turnkey | `@turnkey/react-wallet-kit` 2.7.1: 17 deps (viem `^2.40.2`); `@turnkey/sdk-browser` 8.7.1: 12 deps | Organization id, auth proxy config (M) | **25 free signatures, then $0.10 per signature**; Pro $99/month at $0.05 | Every order is a signature: unaffordable for trading |
| Web3Auth (MetaMask Embedded Wallets) | `@web3auth/modal` 11.4.3: 17 deps, 10 peers (viem `>=2.45`) | Client id, allowed origins (M) | Free to 1,000 MAW, $0.05/MAW above; Growth $69/month | Possible; MPC custody model not reviewed |
| Magic | `magic-sdk` 33.13.0: 3 deps, 0.9 MB | Publishable key, allowed origins (M) | $0 to 1,000 MAW + 50,000 signatures; Startup $99/month | Lightest vendor; iframe custody |
| Para | `@getpara/react-sdk` 3.24.0: 43 deps, 8 peers incl. `ethers`, `wagmi` | API key, allowed origins (M) | Free to 1,200 MAU; Starter $200/month (2.5K MAU) | Pulls wagmi and ethers |

### 3.3 Passkey-only (P-256) signers do not satisfy the venues (confirmed)

viem's `toWebAuthnAccount` is `type: 'webAuthn'` and signs with `ox/WebAuthnP256` (H). The venues verify secp256k1 `ecrecover` by the owner: XO's order and login signature is `0x01‖ECDSA_VALIDATOR‖ecdsa(wrapped digest)` (H, `[37]` 4.1); Polymarket type 0 and the Deposit Wallet's owner signature are ECDSA (H, `[37]` 4.2); Limitless type 0 is ECDSA by `signer == maker` (H, `[37]` 4.5); Predict's SDK checks `ecdsaValidatorStorage(account) == signer` (H, `[37]` 4.3). A passkey can only be the *unlock* for an ECDSA key (3.1), never the signer itself. (A Kernel account with a WebAuthn validator would be a different account from the one XO's order format names.)

---

## 4. One owner across all chains

### 4.1 The account map

```
E  (secp256k1 owner: connected EOA, or generated key unlocked by a passkey)
 |- K(E)  Kernel v3.1, same address on 3223, 137, 8453, 56 ([39] §9, H)
 |     3223: XO trading account; deploy + Enable Trading sponsored by XO's PolicyPaymaster (existing)
 |     56:   Predict.fun account candidate (UNVERIFIED) and optional sponsored treasury
 |     137, 8453: optional sponsored treasury; not a venue account
 |- D(E)  Polymarket Deposit Wallet on 137, CREATE2 from E ([37] 4.2, H); gasless via Polymarket relayer + our Builder key
 '- E     Limitless trading identity on 8453; Base USDC hub ([42]); 7702 -> Simple7702 only in generated mode
```

The unified balance view reads USDC/pUSD/USDC.e and positions at E, K(E) and D(E) per chain (the account graph of `[41]`), labels each row with the derivation evidence, and never shows K(E) on 137 or 8453 as a deposit target unless the user opted into a treasury.

### 4.2 Moving USDC between them

| Move | Mechanism | Gas for the user | Keys | Evidence |
|---|---|---|---|---|
| Base or any EVM to Polymarket D(E) | Polymarket Bridge: `POST bridge.polymarket.com/deposit {address}` returns per-wallet deposit addresses; send USDC there; credited as pUSD | Only the source transfer: sponsorable (UserOp from K(E) or 7702 E) or EIP-3009 relayed | None for creation; optional `X-Builder-Code` header | H, `trading/bridge/deposit.md`; OPTIONS answered `access-control-allow-origin: *` |
| D(E) operations on Polygon (approvals, transfers, split/merge/redeem, wallet creation) | Polymarket relayer `relayer-v2.polymarket.com/submit` | None ("Gas-free wallet deployment, approvals, order execution and position operations") | Our Builder key, HMAC server-side | H, `programs/builders/overview.md`, `trading/wallets-auth.md` |
| Base to Polygon and back (USDC) | CCTP v2 with Circle Forwarding Service: Circle mints on the destination, fees paid upfront on the source | Source burn only: sponsorable | Circle API for quotes and attestations; key requirement for Forwarding NOT CHECKED | H, `developers.circle.com/cctp/concepts/forwarding-service.md` |
| Anything to or from BNB | Across or Relay (CCTP excludes BNB USDC, `[UAA]` H there) | Across gasless: one EIP-712 signature (ERC-3009 or Permit2), Across submits | Across API key and integrator id for production (operator's, server-side) | H, `docs.across.to` index ("Get a gasless swap quote") |
| Arbitrary gasless calls on 137/8453/56 | Relay `/execute` with optional EIP-7702 `authorizationList`; Relay pays from our app balance | None | Relay API key with linked funding wallet and funded balance (operator's) | H, `docs.relay.link/features/gasless-execution.md`, `fee-sponsorship.md`; OPTIONS `/execute` answered CORS `*` |
| Base to XO 3223 | XO's Hyperlane warp route from Base USDC (only route) | Base source tx: sponsorable; XO side by XO | none | `[42]` (H there) |
| XO back out | Only to Base; the XO paymaster refuses `transferRemote` | User-paid on XO | none | `[UAA]` (H there) |

No mechanism makes a bet on one chain from money on another in one step (`[38]`, `[DAC]` §0.1).

---

## 5. Architecture recommendation (both modes)

- **Shared core:** an `OwnerSigner` (connected EOA via the existing `WalletSigner`, or the generated local account) and an account map derived from it (K(E), D(E), E). One sponsorship router chooses per action: XO paymaster (3223), Polymarket relayer (D(E) on 137), Pimlico via our proxy (K(E) on 56/8453/137; Simple7702 E in generated mode), permit/3009 relay (Base USDC for any EOA, PayBox included), user-paid (everything else).
- **Connected mode:** no authorization requests; capability detection; Coinbase `paymasterService` only for funding moves; a "create a trading key" button for contract-wallet and passkey users.
- **Generated mode:** vendor-free passkey-PRF-wrapped secp256k1 key with server-held ciphertext and export; 7702 to `Simple7702Account` (never Kernel-7702 or Coinbase); every action sponsorable on 137/8453/56.
- **Server (markets API on AWS):** `/v1/paymaster/:chainId` (Pimlico proxy with call allowlist and caps), `/v1/relay/polymarket` (Builder HMAC), optional `/v1/relay/permit` (hot wallet that submits `permit`/`transferWithAuthorization` for allowlisted spenders and recipients). All flags OFF until the tests in section 7 pass; all secrets in the server's secret store.
- **New npm packages:** none in `app/`. If the hand-written Kernel `toSmartAccount` adapter proves costly, `permissionless` 0.5.2 (1 dependency, peer viem `^2.44.4`, H registry) is the lightest fallback; that would need the lockfile policy check.

---

## 6. Method, compliance and limits

- Repo reading: `[DAC]` §0, `[UAA]` §0, `[37]` (all of §4.1 to §4.5), `[39]` §0, §4.1, §9, `[40]` §0, `app/package.json`, `app/src/core/walletconnect.ts`, `app/src/core/signer.ts` (interface lines), `app/src/features/trade/direct/xo/setup.ts` header, `app/src/features/trade/direct/limitless/token.ts` header, `api/limitless-relay.ts` header, `sdk/trade/xo/account/derive.ts` header.
- Local source: `viem` 2.57.2 type exports and the implementation files named in section 1.1.
- GET fetches (all with the research User-Agent): `llms.txt` indexes of Pimlico, ZeroDev, Alchemy (wallets), CDP, Biconomy, Candide, Privy, Turnkey, Dynamic, MetaMask, Base, Polymarket, Circle, Across, Relay; their linked `.md` pages named in the text; `erc7677.xyz` wallet and paymaster lists; raw GitHub files for ERC-7677, EIP-5792, EIP-7702, `Simple7702Account.sol`, OpenZeppelin `SignatureChecker.sol` (master and v4.9.6), Solady `SignatureCheckerLib.sol`, MetaMask `EIP7702StatelessDeleGator.sol` and `EIP7702DeleGatorCore.sol`, MDN `browser-compat-data` `api/CredentialsContainer.json`; WebKit bug 259934; Relay `GET /chains`; pricing pages of ZeroDev, Privy, Turnkey, Dynamic, Para, Magic, Web3Auth; npm registry `/<pkg>/latest` for ten packages.
- OPTIONS preflights (Origin `https://example.org`, method POST, header content-type): `api.pimlico.io/v2/8453/rpc` (200, allow-origin `*`), `relayer-v2.polymarket.com/submit` (204, origin echoed), `bridge.polymarket.com/deposit` (204, `*`), `api.relay.link/execute` (204, `*`), `rpc.zerodev.app/api/v3/x/chain/8453` (204, `*`).
- Failed or refused: Gelato docs (TLS certificate expired, twice); `base.blockscout.com` smart-contract API (403), so the EIP-3009/2612 support of native USDC on Base and Polygon is M here (it is the payment primitive of x402, `[25]`/`[26]`).
- Web search was used three times to locate pages (wallet support for `paymasterService`, Ambire, Gelato); facts from search summaries are tagged M.
- Third-party content was treated as data. Circle's pages carry an "Agent Instructions" block asking coding agents to install a plugin and an MCP server; it was not followed.
- No person's name, email, handle, home path or account id was put in any request or in this file.

---

## 7. Open unknowns and cheap tests (ordered)

| Id | Question | Test | Cost |
|---|---|---|---|
| G1 | Does PRF `get` work on Safari 18+ (iCloud Keychain), Chrome on Windows (Windows Hello), Android (Google Password Manager), 1Password, Bitwarden? | A static test page that creates and gets a credential with `prf` and reports `getClientExtensionResults().prf` | Free |
| X1 | Does Limitless's backend accept a type-0 order from an E that has 7702 code? | Generated key, delegate on Base Sepolia or mainnet with cents, place and cancel a minimum order | Cents |
| X2 | Does a Polymarket Deposit Wallet accept owner signatures from a 7702-delegated E, and does the relayer deploy D(E) for it? | Same key, `WALLET-CREATE` through our Builder relay, then an approval | Free (relayer pays) |
| X3 | Will MetaMask sign a `PackedUserOperation` typed-data request for an already-upgraded EOA, so we can sponsor it? | Upgraded test EOA on Base, one sponsored no-op UserOp | Cents |
| X4 | Does Coinbase/Base Account report `paymasterService` on 137 and 56? | `wallet_getCapabilities` from a test session | Free |
| X5 | Does Predict.fun accept a K(E) it did not provision (`[37]` T-V2)? | Login flow with a K(E) on BNB | Free |
| X6 | Pimlico policy behaviour: is the per-user limit keyed by `sender`? Can the webhook see decoded calls (it gets the `userOperation`)? | Testnet policy with a webhook to our API | Free |
| X7 | Limitless without user API tokens: does the partner programme's EOA sub-account path remove the paste? | Read partner docs, ask only if the user approves contact | Free |
| X8 | Circle Forwarding Service: does it need a Circle API key, and what does it cost on Base to Polygon? | Read `howtos/transfer-usdc-with-forwarding-service.md` | Free |
| X9 | Is the deployed `Simple7702Account` at `0xe6Ca...555B` byte-equal to the read source? | Sourcify or explorer GET | Free |

Not decided here and needing the product owner: who funds sponsorship and the monthly cap; whether a server hot wallet for permit/3009 relays is acceptable (it is a new thing the operator runs, and it holds native gas on three chains); whether sponsorship is offered to unscreened users given the venues' geo rules (`[40]` §5.5).
