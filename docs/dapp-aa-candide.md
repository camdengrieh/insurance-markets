# A derived multichain smart-contract wallet on Candide: decision record

Status: decision record, written 2026-10-20 on branch `build/xo-paybox-plugin`. Synthesis of research notes 35 to 40 (`docs/research/35-aa-candide-stack.md` to `40-aa-economics-risk.md`) against `docs/research/25-dapp-aa-wallet.md`, `docs/dapp-design.md`, `docs/dapp-paybox-web.md`, `docs/plan.md`, `docs/phase1-gap-closing.md` and the shipped `app/`. **Design only. Nothing here was built, type-checked or run, nothing has ever been signed through PayBox for this project, and no live service has been shown to accept any account described below.** Where the notes disagreed I re-checked the primary source myself (section 9, section "Verification"). An independent fact-check on 2026-10-20 then corrected this record (section "Fact-check outcome", Verification item V12); the corrections are applied in place.

User proposal this answers (2026-10-20, verbatim): "a smart contract wallet using Account Abstraction that can be derived from a PayBox Wallet and any other wallet for that matter, that can then operate on any chain and we use Candide.dev. Then it can interact on the dApp with session keys etc. and strict guardrails, gasless transactions, seamless crosschain bet placement across all the chains where the prediction markets exist. We can also add predict.fun and opinion on BNB Chain."

Ground rules observed while writing: read-only public research only (public docs, public npm and Sourcify metadata, unauthenticated GET probes, the keyless XO explorer API); no PayBox tool was called; no JSON-RPC call, no POST, no account, no API key, no signature; third-party content treated as data (no instruction in it was followed); every scripted request used the User-Agent `insurance-markets-research/0.1`; this file holds no personal identifier and only repo-relative paths.

## How to read this

Confidence tags: **H** = read or measured first-hand in a primary source (named); **H[n]** = note `n` read it first-hand and I did not repeat it; **H[V#]** = I re-checked it myself for this record (list in "Verification"); **M** = secondary, inferred from H facts, or documented but not exercised; **L** = guess; **D** = a design default chosen here, not a finding. **NOT FOUND (searched: ...)** is a documented absence. **UNVERIFIED** means a test exists that needs an action this task forbids (a PayBox call, a POST, a funded account).

Source keys: `[35]` to `[40]` = `docs/research/35-aa-candide-stack.md`, `36-aa-session-guardrails.md`, `37-aa-venue-accounts.md`, `38-aa-crosschain.md`, `39-aa-owner-derivation.md`, `40-aa-economics-risk.md`. `[25]` = `docs/research/25-dapp-aa-wallet.md`. `[19]`, `[20]`, `[21]` = `docs/research/19-smart-account-derivation.md`, `20-funding-route-verification.md`, `21-userop-templates.md`. `[DD]` = `docs/dapp-design.md`. `[DPW]` = `docs/dapp-paybox-web.md`. `[P1]` = `docs/phase1-gap-closing.md` (section 9 overrides sections 1 to 8). `[VC]` = `docs/venue-census.md`. `[plan]` = `docs/plan.md`.

Binding decisions applied to every verdict: runnable by everyone from day zero with nothing the author must operate and no custody of other people's credentials (local-first, static client); nobody contacts the XO team (by the same spirit, nobody contacts a venue to ask for access); no browser automation of any third-party site; caps are advisory against a compromised agent unless enforced on-chain; every write path is flag-gated OFF; no new wallet, module, paymaster or bridge contract written by us; no fake or placeholder data; PayBox terms are no obstacle but PayBox upload is not available; the repository is public.

Vocabulary used throughout:

- **E** = the owner address: one EVM address, whether it belongs to a PayBox credential or to any other wallet.
- **K(E)** = the Kernel v3.1 account that E owns (XO's forced account, address a pure function of E, `src/xo/account/derive.ts`).
- **S(E, t)** = the Safe account of profile **S1** (Safe L2 1.4.1 + Safe4337Module v0.3.0 + EntryPoint v0.7), address a pure function of the owner set, threshold and one pinned salt `[39 §2]`. This is the only account that Candide's SDK and bundler fit and that a typed-data-only signer can drive.
- **Venue account** = whatever a venue itself requires as the trading account (XO: K(E); Polymarket: Deposit Wallet; Opinion: its Safe; Predict.fun: E or its Kernel-based "Predict account").

---

## 0. Bottom line (plain words)

**Is it not possible, then?** Part of it is real and worth building, part of it is the wrong layer, and two of the promises (strict limits on each bet, and a bet placed on one chain from money held on another in one step) do not exist anywhere in the venues' own rules. In one sentence: **a derived Safe on Candide can be your multichain treasury, funding and gas account; it cannot be the account that places the bets, because every venue forces its own account type; your PayBox (or any) wallet stays the owner of all of them.**

What "derived from a PayBox wallet and any other wallet" honestly means: **one owner address E yields a map of accounts, one per purpose, each a pure function of E and none a new key.** E itself (EOA venues), K(E) (XO, and possibly Predict.fun), the Polymarket Deposit Wallet (Polygon), Opinion's own Safe (made by Opinion at onboarding, address possibly computable from E, M), and our optional treasury S(E, t). "PayBox and another wallet together" is a two-owner Safe (a different address from the single-owner one, fixed at creation); "another wallet instead of PayBox" is the same function with another E.

### 0.1 Layer by layer

| Layer the proposal asks for | Verdict | In plain words | Who bears the cost | Evidence |
|---|---|---|---|---|
| **Account derived from E, "any wallet"** | **Feasible, with one open question** | S1 Safe address is a pure CREATE2 function of owners, threshold and one pinned salt; the same owner gives the same address on Ethereum, Optimism, BNB, Polygon, Base, Arbitrum, Avalanche and HyperEVM (code present on all eight by read-only `eth_getCode`, 2026-10-20, H[V12]; 9 golden vectors, three independent computations, and the fact-check recomputed V1 with `cast` alone). Any EOA (injected wallet, WalletConnect wallet, hardware wallet, PayBox) or a passkey can be an owner. The open question is whether PayBox's signer accepts the Safe's typed data (domain with no `name`, `v` byte, preview): UNVERIFIED, two zero-value tests settle it | Nobody at derivation; the deploying gas at first use (section 4) | H[39 §2, §7], H[V12], M for PayBox |
| **Operates "on any chain"** | **Eight chains proven by code reads, XO impossible** | Candide serves 14 EVM mainnets plus a Solana paymaster: every EVM chain we target except XO 3223 and SX 4162 (Pascal is Solana, no Safe). The Safe contracts are present on all eight overlap chains with PayBox (1, 10, 56, 137, 999, 8453, 42161, 43114) by read-only `eth_getCode` on 2026-10-20, with identical code hashes; the Safe module registry omits 999 and 43114, so the registry is not the proof, the code read is. A Safe cannot exist on XO's chain 3223 (no Safe contracts there per note 39's code reads and an explorer 404, Candide does not serve it); XO keeps its Kernel account | Candide infrastructure: free tier is 2 mainnet chains; more than 7 chains needs $749/month; whether our 8 fit Launch's 7 is NOT FOUND (which seven chains Launch includes is unpublished) | H[V2], H[39 §4.2], H[V10], H[V12] |
| **Is the trading account on the venues** | **No** (the central picture is not supported) | XO needs a Kernel v3.1 account; Polymarket its Deposit Wallet; Opinion its own Safe (a user-made Safe passes the contract check only at threshold 1, and nobody has shown the gateway accepts it); Predict.fun runs a Kernel v3.1 or plain EOA; PancakeSwap BNBUSD rejects every contract caller; Hyperliquid's account is the signer. A Safe is a treasury and funding account only | n/a | H[37 §3 to 4], H[V3], H[V4], H[V5] |
| **Session keys** | **Not one thing; none is a generic Candide feature** | Candide ships no session-key or spend-policy module (Safe Policies is "Planned"). What exists per venue: Polymarket Session Keys (beta, needs a request to Polymarket), Hyperliquid agent wallets, Pascal trading keys, a Safe Allowance delegate for token outflow, a 2-of-2 local co-signer, and (Predict.fun only, unproven) a signing-only Kernel permission | A hot key on the user's machine; never in the hosted page | H[35 §7], H[36 §3, §6], H[V6] |
| **Strict guardrails** | **Enforceable on-chain only for money moving, never for a bet's size** | An order is an off-chain signature over an opaque hash, so no account module can read its amount (the standard itself, re-confirmed by Rhinestone's and ZeroDev's own code). The bound on a bet is what the venue account holds and has approved. **$50/day is enforceable on-chain only as a cap on tokens leaving the treasury Safe through a delegate**, on chains where the Allowance Module exists (Ethereum, Optimism, Polygon, Base, Arbitrum, Avalanche; not BNB, not HyperEVM). It does not restrict where the tokens go (a recipient allowlist needs Zodiac Roles v2), and does not touch money moved by the owner, by an EOA-venue account, or on BNB and HyperEVM (so not for Predict.fun or Opinion); **$10/order cannot be enforced at all** | Gas for module setup; no fee | H[36 §0, §7], H[40 §0], H[V12] |
| **Gasless** | **True for bets already; not free for the rest** | Orders are off-chain signatures on every CLOB venue, so a bet costs no gas. Gas is spent on approvals, deposits, redeems and withdrawals, a fraction of a cent to a few cents (BNB, Base, Polygon). Sponsoring that for strangers needs a funded Candide policy: an operator burden that fails "nothing the author must operate". User-pays in a stablecoin through Candide's token paymaster is the honest "gasless", but whether the keyless endpoint serves it is UNVERIFIED | Venue (XO, Polymarket, Opinion builders), or the user, or an author who accepts $333/month plus deposit | H[40 §3], H[V2] |
| **Seamless cross-chain bet placement** | **Not feasible as stated; a fast funding step is** | No venue takes a cross-chain intent; an order cannot be bound to the arrival of funds. What is real: one funding step (seconds to about 19 minutes depending on the rail), then an instant off-chain order. CCTP does not cover BNB USDC; XO is reachable only through XO's own Hyperlane route; Candide's "chain abstraction" signs an opaque Merkle root and places no bets | Bridge fee 0.03% to 0.4% at $20 on the direct rails, plus source gas | H[38 §0, §4, §9] |
| **Add Predict.fun and Opinion on BNB** | **Yes, as EOA-first venue adapters; the AA account is not needed for them** | Both settle in USDT (18 decimals) on BNB. Predict.fun: PayBox EOA in EOA mode needs no gateway test; a PayBox-owned Kernel is a candidate worth one test. Opinion: Opinion's own Safe with E as signing owner; a user-made Safe passes the contract only if its threshold is 1, and is not proven at the gateway. Both are geo-restricted | User deposits, API keys (self-serve), BNB dust | H[37 §4.3 to 4.4], H[V5], H[V11] |

### 0.2 Venue by venue (can the derived account be the trading account?)

| Venue (chain) | Derived Safe S1 as the trading account? | What actually works | Confidence |
|---|---|---|---|
| **XO** (3223) | **No.** Not on Candide, no Safe contracts on 3223 | K(E) through XO's own bundler and paymaster; S funds it over the Hyperlane route (recipient K(E), never S) | H[V10], H[39 §4.2] |
| **Polymarket** (Polygon) | **No for the SDK and docs.** The exchange contract has a generic `POLY_1271` type, the gateway is unknown | Deposit Wallet owned by E (typed data), created with the user's own Builder or Relayer key; S can hold pUSD and fund it | H[37 §4.2], M for the gateway |
| **Predict.fun** (BNB) | **No** (contract-level yes, SDK path hand-rolled) | E in EOA mode first; K(E) as a tested candidate (same Kernel implementation `0xBAC8...4b4D` and validator `0x845A...cE57` as XO, SDK accepts any account whose validator owner is the signer) | H[V5], H[37 §4.3] |
| **Opinion** (BNB) | **Contract-level yes (threshold 1 only), gateway UNVERIFIED** | Opinion's own Safe 1.3.0 with E as signing owner; the deployed verifier does not derive the Safe from the signer, so a user-made Safe owned by E satisfies the contract, but only at threshold 1 (the same signature bytes must pass plain ECDSA by the signer and `Safe.checkSignatures` on the maker, so a 2-of-2 Safe, the F4 recommendation for the treasury, can never be an Opinion maker) | H[V4], NOT FOUND for the gateway |
| **Limitless** (Base) | No (EOA mode documented; type-3 ERC-1271 undocumented) | E in EOA mode | H[37 §4.5] |
| **Hyperliquid HIP-4** (HyperCore) | No for the API (account = signer); a HyperEVM contract could drive HyperCore through `CoreWriter` (outcome orders UNVERIFIED) | E plus a local agent wallet | H[37 §4.7] |
| **Pascal** (Solana) | Not possible (Ed25519) | Solana credential | H[37 §4.8] |
| **PancakeSwap prediction** (BNB) | **BNBUSD: impossible. BTCUSD and ETHUSD: allowed by the contract** (correction to earlier notes) | E for BNBUSD; E or S for BTCUSD/ETHUSD (positions then live in S, invisible to EOA views) | H[V3] |
| **Trueo** (Base) | Yes at contract level, but positions would sit in S | E by default; S only if batching is worth the split view | H[37 §4.6] |
| **Probable, Myriad** (BNB) | Probable: proxy wallet forced; Myriad: contract accepts ERC-1271, volume near zero | Out of scope | M |

### 0.3 What to build first (detail in section 7)

1. **Now, no live test, no dependency, no network write:** a pure `deriveSafe` (viem only) with the 9 golden vectors; a read-only status ladder and presence matrix in the account map; a gas-readiness panel and an exposure meter (what a leaked order key could lose). All flags stay OFF.
2. **Two zero-cost live tests the user may choose to run:** PayBox signing of a Safe `SafeMessage` and `SafeOp` typed data with zero value (P-S1, P-S2), then one cents-level operation through Candide's keyless endpoint on one cheap chain (T-C2). They decide whether any AA write path is worth building.
3. **In parallel, independent of AA:** Predict.fun and Opinion venue adapters, EOA-first, read-only then flag-OFF writes; the Funding Card and direct-rail builders from `[38 §11]`.
4. **Only after those pass:** the `SafeOp` prepared item with verify-before-submit in the local daemon, flag OFF, native-gas or user-key paymaster; optionally the Allowance Module vault and faucet on Base, Polygon, Arbitrum; a 2-of-2 local co-signer for balances above pocket money.
5. **Not built, ever, under current decisions:** our own wallet, module, paymaster or bridge contract; Safe Unified Account (blind Merkle root); EIP-7702 delegation of E; Kernel v4; an author-funded gas sponsor on by default; any Candide key or policy id in the repo or the page.

---

## 1. Venue matrix

### 1.1 What each venue accepts

"Contract" = what the settlement contract verifies (source read). "Gateway" = what the venue's API or SDK documents or accepts (the part that decides everything, and unverified for every non-native account). All order models except Trueo, Pancake and Hyperliquid are off-chain EIP-712 orders matched by the venue.

| Venue | Chain, collateral | Order model | Contract accepts | Gateway or SDK documents | Auth | Source |
|---|---|---|---|---|---|---|
| **XO** | 3223, USDC.e (6 dp) | Off-chain CLOB, EIP-712, ERC-1271 type 3 only | `maker == signer`, `maker.code.length > 0`, `IERC1271(maker).isValidSignature` (any contract in principle; undeployed fails, no ERC-6492) | Kernel v3.1 "XO smart account" only; EOA (type 0) "rejected" per guides while OpenAPI text still mentions it | L1 `ClobAuth` (Kernel-wrapped), L2 HMAC | H[37 §4.1], H[25 §4.1] |
| **Polymarket** | Polygon 137, pUSD (6 dp) | Off-chain CLOB, ERC-7739 wrapped order | Types EOA, POLY_PROXY and POLY_GNOSIS_SAFE (derived from Polymarket's own factories), and generic `POLY_1271` (`signer == maker`, code present, `isValidSignatureNow`) | Deposit Wallet (default for accounts since 2026-05-04); SDK resolves a wallet only if derived from the signer | L1 EIP-712, L2 HMAC; Relayer and Builder keys made in the UI; Session Keys need a request to Polymarket | H[37 §4.2], H[V6] |
| **Predict.fun** | BNB 56, USDT (18 dp) | Off-chain CLOB, EIP-712; `matchOrders` by operator | All four exchanges use OpenZeppelin `SignatureChecker`: any ERC-1271 account, or ECDSA | EOA, or "Predict account" = Kernel v3.1 with Privy owner; SDK takes any `predictAccount` if `ecdsaValidatorStorage(account) == signer`. The official Predict-account flow uses the Privy wallet's private key, exported from account settings, which this project must never ask for (H[V12]) | `x-api-key` (self-serve; 240 requests per minute on mainnet) plus JWT by signed message | H[V5], H[37 §4.3] |
| **Opinion** | BNB 56, USDT (18 dp) | Off-chain CLOB, EIP-712; venue pays settlement gas | Type EOA: plain ECDSA. Type Safe: ECDSA by signer AND `Safe.checkSignatures` on the maker; **no derivation check** (partial-match source). The same signature bytes must pass both checks, so only a **threshold-1** Safe whose owner set includes the signer can be a maker (H[V12]) | SDK: `private_key` = signer, `multi_sig_addr` = assets address ("can be the same or different"); Safe 1.3.0 from Opinion's factory, created asynchronously by Opinion | API key by EIP-712 signature; "registered Opinion account with a trading wallet enabled" first | H[V4], H[V11], H[37 §4.4] |
| **Limitless** | Base 8453, USDC | Off-chain CLOB | EOA, POLY_PROXY, LIMITLESS_SAFE (derived), ERC1271 (no `signer == maker` check) | Type 0 only for self-signed API orders; smart-wallet mode is Limitless-provisioned | Scoped HMAC token from the UI | H[37 §4.5] |
| **Trueo** | Base 8453, TYD | On-chain Uniswap v4 range orders, Permit2 | No caller restriction in 7 verified contracts (the adapter is unverified, not scanned) | Plain EVM calls | None | H[37 §4.6] |
| **Hyperliquid HIP-4** | HyperCore, USDC or USDH | On-chain order book on HyperCore | n/a (account = signer; `CoreWriter` for HyperEVM contracts) | Agent wallets sign only | Signed actions | H[37 §4.7] |
| **Pascal** | Solana, USDC | Off-chain CLOB | n/a | Ed25519 owner and up to 10 trading keys | Ed25519 permits | H[37 §4.8] |
| **PancakeSwap prediction** | BNB 56, BNB | Pari-mutuel rounds | BNBUSD: `notContract` (code check and `msg.sender == tx.origin`); BTCUSD and ETHUSD: none | Plain calls | None | H[V3] |
| **SX Bet** | SX Rollup 4162 | Off-chain, EOA maker | EOA | Not on Candide, not in PayBox's catalog | n/a | M[25 §4.1] |

### 1.2 What each derived account can do at each venue

K = K(E), S = S(E, t) of profile S1, E = the owner EOA. "Funds" means S sends the venue's collateral to the venue account (a call-path transfer or a bridge call). "Verdict" uses: **forced** (only the venue's account), **EOA**, **candidate** (contract and SDK say yes, gateway untested), **no**.

| Venue | E as trading account | K(E) | S1 Safe | Derived address of the venue account from E | Verdict |
|---|---|---|---|---|---|
| XO | No (orders by type 3 only) | **Forced**; deploys by XO-sponsored first UserOp (door (a) untested) | No (no contracts on 3223); funds K(E) via Hyperlane from Base | K(E) pure function, 2,627 of 2,627 re-derived `[19]` | forced K |
| Polymarket | Only if allowlisted | No | Candidate at contract level, no in SDK; holds pUSD and funds the Deposit Wallet | Deposit Wallet pure function of E (beacon wallets after 2026-06-29; older differ) | forced |
| Predict.fun | **Yes, EOA mode** (SDK without `predictAccount`) | **Candidate** (T-V2) | Contract yes, SDK no, hand-rolled `SafeMessage` | K(E) if Predict uses the same factory call and salt: **NOT FOUND**; existing accounts are owned by a Privy key the project must never ask for | EOA first, K candidate |
| Opinion | Yes if the EOA configuration is accepted on mainnet (NOT FOUND) | No (ECDSA only) | Candidate at threshold 1 only (T-V3; a 2-of-2 S can never satisfy the contract); Opinion's own Safe is the documented path | Opinion's Safe address is `CREATE2(safeFactory, masterCopy hash, keccak(abi.encode(signer)))` in `OLABFactoryHelper` (M, formula read, not run against a real account) | Opinion's Safe |
| Limitless | EOA mode | No | No | n/a | EOA |
| Hyperliquid | **Yes** | No | `CoreWriter` route UNVERIFIED | n/a | EOA |
| Pascal | No (Solana) | No | No | Solana credential | not EVM |
| Pancake BNBUSD | **Yes** | **No** | **No** | n/a | EOA only |
| Pancake BTC/ETH | Yes | Yes (contract) | Yes (contract); claims pay native BNB | n/a | EOA or S |
| Trueo | Yes (positions in caller) | Yes | Yes, positions then sit in S | n/a | EOA by default |

The map above, not a single contract, is the "multichain wallet": **an address map plus a funding valve**, which is what `[25 §8.1]` and `[DD §2.3]` already established and which this record keeps.

---

## 2. Architecture and trust boundaries

### 2.1 Accounts per owner

```
owner E   (a PayBox credential, an injected or WalletConnect wallet, a hardware wallet, a passkey;
           never a derived key, never exported)
 |
 |- E itself .................. EOA venues: Predict.fun (EOA mode), Limitless, Hyperliquid account,
 |                              Pancake BNBUSD, x402 payer, gas dust for BNB venues
 |- K(E) Kernel v3.1 .......... XO (chain 3223 only); Predict.fun "Predict account" candidate (BNB)
 |- DW(E) Deposit Wallet ...... Polymarket (Polygon), made by Polymarket's factory with the user's own key
 |- S_op Opinion Safe 1.3.0 ... Opinion (BNB), made by Opinion's backend; E signs orders as Safe owner
 '- S(E,t) Safe S1 ........... OUR OPTIONAL treasury, funding and gas account on the eight chains where code is present.
                               Never the trading account of a venue that forces another type.
                               Never on 3223.
```

Rules (extend `[39 §4.1]`, `[25 §8.1]`): registry rows carry `{venue_or_role, chain, accountType: kernel-3.1 | safe-s1 | deposit-wallet | opinion-safe | eoa, address, derivation, genesis, status, evidence}`; status ladder `derived` -> `code-present` -> `owner-verified` (Safe) or `venue-registered` (XO, Opinion) -> `trading-enabled`; an address is a **deposit target only at `code-present`** for the factory, singleton, module and setup helper on that chain plus the account itself, and for venue accounts only at `venue-registered`; "RPC unreachable" is never rendered as "undeployed"; a Safe row on 3223 is invalid; K(E) rows exist for 3223 (and any chain a venue needs) and are never shown as deposit targets elsewhere.

### 2.2 The S1 profile (pinned; this is what "derived" means)

Safe L2 1.4.1 `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`, SafeProxyFactory 1.4.1 `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`, Safe4337Module v0.3.0 `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` (also the fallback handler), SafeModuleSetup v0.3.0 `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47`, EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032`; owners sorted ascending; `saltNonce = uint256(keccak256("insurance-markets/safe-aa/v1"))`; direct `SafeModuleSetup.enableModules` setup (H[39 §2.1, §2.2]). The same owner and salt give five different addresses under other SDK defaults (`permissionless` 0.5.0, the non-L2 singleton, Safe 1.5.0, Candide's EntryPoint v0.9 "unified" module), so **the profile, not the library, defines the address**, and derivation lives in our own pure viem code with AbstractionKit used only as a frozen golden-vector oracle (decision D3 of `[39]`, kept here).

Why S1 and not Candide's newest path: S1 is EntryPoint v0.7 (the same UserOp shape as the existing XO tooling), the module has three audit reports for v0.3.0 (Ackee, Certora and Nethermind, `safe-fndn/safe-modules` `modules/4337/docs/v0.3.0`, H[V12]) and wide bundler support. Candide's current recommendation, `SafeMultiChainSigAccountV1` on EntryPoint v0.9, uses a young module (repo created 2026-01-16, no release tag, no licence field, one Nethermind audit, an accepted Medium known issue K-02) and a chain-agnostic signature that PayBox would show only as a root hash (H[39 §2.6 P9, P14], H[40 R6, R8]).

### 2.3 Who signs what, and what PayBox can and cannot do

| Signing need | Primitive | PayBox WalletConnect route (hosted page) | PayBox agent or daemon route (`request_wallet_sign`) |
|---|---|---|---|
| Safe UserOp | EIP-712 `SafeOp`, domain `{chainId, verifyingContract = module}` (no `name`) | Typed data on the ten chains below; **UNVERIFIED** for this domain | `typedData` intent, no chain or domain allowlist found; UNVERIFIED |
| Safe ERC-1271 message (venue login, order digest) | EIP-712 `SafeMessage` | Same | Same |
| Kernel orders and venue logins (XO, Predict Kernel mode) | Typed data over the `Kernel(bytes32)` wrap | Yes in principle | Yes in principle |
| Kernel UserOps | Raw 32-byte digest or `personal_sign` over non-text bytes | **Refused** | `raw` intent, availability under a grant UNVERIFIED |
| Plain EOA transactions (approvals for EOA-mode venues) | `transaction` intent, signed not broadcast | **Refused** (`eth_sendTransaction`, `eth_signTransaction`) | `transaction` intent; the caller broadcasts |
| Chain 3223 | any | Absent from the list | Absent from the catalog; typed data policy NOT FOUND |

The ten EVM chains of PayBox's WalletConnect list are 1, 10, 56, 137, 999, 4663, 5042, 8453, 42161, 43114 (H[V7]; the earlier twelve in `[31]` and `[35]` counted two names, Monad 143 and Celo 42220, that appear only in a display-name map). Intersection with Candide's mainnets is therefore **eight chains**: 1, 10, 56, 137, 999, 8453, 42161, 43114 (not nine as `[35 §5.1]` says). Robinhood 4663 and Arc 5042 are PayBox chains that Candide does not serve; XO 3223 and SX 4162 are Candide-absent and PayBox-absent (H[V12]).

Three further PayBox facts from the bundle that matter for the Safe route (H[V12], code shipped, runtime NOT TESTED): (1) a Safe typed-data request has no `domain.name`, and the approver describes typed data as `Typed data for {domain.name}` or just `Typed data`, so a Safe request shows only the generic label, which strengthens threat A2 (blind signing); (2) PayBox rejects a request whose `domain.chainId` differs from the session chain, so each chain needs its own approved session chain; (3) whether the server-side signer accepts a nameless domain and a `uint48`/`uint128` type set remains UNVERIFIED (L1). A raw-hash `secp256k1_sign` method exists in the MoonX provider SDK bundled into the app; it is not in the WalletConnect responder's method list (`personal_sign`, `eth_signTypedData_v4`) and is not exposed to WalletConnect peers.

**The design point the notes converge on:** the Safe is the only account family in this project for which a typed-data-only signer can drive every on-chain action (deploy, approve, transfer, bridge call) without a raw digest and without a signed transaction. That is the real, narrow value of the Candide stack: it turns on-chain actions into typed-data signatures, so a signer that can only do typed data (PayBox over WalletConnect, many hardware wallets) can still move treasury funds. It does nothing for EOA-mode venues, whose approvals are plain owner transactions needing a few cents of native gas in E.

### 2.4 Where session keys live, and local daemon versus hosted page

| Key | Lives in | Custody | Can do | Limit |
|---|---|---|---|---|
| Owner key (PayBox MPC, or the user's wallet) | PayBox or the user's wallet | The user; never exportable for PayBox | Everything, including reconfiguring S | None below it: it is the root |
| Order or login key for a venue | The venue account's owner (E, or K(E)'s validator owner) | Same as owner | Sign orders and logins | Funded balance and approvals only |
| Allowance delegate (optional) | Local daemon, a random locally generated key (never derived from a PayBox signature, `[DD §2.7]`) | The user's machine, file mode 0600, expiry always set | Move up to the token budget out of S per period, to any address | Allowance amount; recipient unconstrained |
| 2-of-2 co-signer (optional) | Local daemon | The user's machine | Co-sign S operations after local rules (targets, selectors, ceilings) | Software rules; an ownership guarantee, not a spending cap |
| Candide API key (optional) | Local daemon only | The user (a key is a URL path segment: "treat the full URL as a secret") | Pay for bundling and sponsorship on the user's plan | Plan allowance |
| Venue-native delegates (Polymarket Session Key, Hyperliquid agent, Pascal trading key) | Local daemon | The user | Sign orders for that venue only | Venue limit (none on amount found for Polymarket) |

**Hosted page versus local daemon.** The hosted page `https://xo-markets-explorer.vercel.app` is a static read-only explorer with a strict CSP (`[DPW]`); it never holds a key. Default for this work: **all Safe write paths (SafeOp signing, bundler submit, allowance, co-signing, Candide key) live in the local Cockpit daemon**, the page being a display. Reasons: PayBox's WalletConnect session is created with an `autonomous` grant and the text "PayBox will sign them without asking again" (H[V7]), so a hosted page holding that session could ask for a drain `SafeOp` with no per-request prompt if PayBox's server does not demand a passkey (UNVERIFIED); a Candide key must not sit in page code; and the daemon already owns the single-writer ledger, caps and kill switch (`[DD §3.2]`). The hosted page may use the WalletConnect route only for a **proof-of-control message** (address binding) and, if the user chooses and labels it "dedicated low-balance wallet", for `SafeMessage` login signatures; it never signs a `SafeOp` while the grant is `autonomous` (D).

### 2.5 Trust boundaries

| # | Boundary | Control |
|---|---|---|
| TB1 | Agent or page to daemon | Existing B1, B2, B6 controls (`[DD §1.3]`); a SafeOp is a `prepare` class tool, submit needs the ARM window; tool classification build check |
| TB2 | Daemon to PayBox | S1 (agent signs, daemon holds nothing) or S2 (daemon's own client, flag OFF, `always_approve` credential only); the signer adapter emits only `typedData` for a verified prepared SafeOp |
| TB3 | Daemon to Candide | Only the allowlisted host `api.candide.dev` (keyless `/public/v3/{chainId}`, or the user's keyed URL held in the vault); Candide sees the Safe address, the owner address in `factoryData` on the first operation, every call's target and data, and the IP; retention for the keyless path is NOT FOUND |
| TB4 | Candide to chain | A bundler can censor, delay or reorder, not alter (the signature covers every field); fallback bundlers: any ERC-4337 bundler serving EntryPoint v0.7, or self-hosted Voltaire (LGPL-3.0) |
| TB5 | Prepared item to signature | The daemon builds the SafeOp, stores it, shows a decoded summary and tag; `submit` recomputes the EIP-712 digest, recovers the signer, compares with the owner, **re-decodes `callData` against an allowlist of templates** (approve to a pinned spender with the exact amount, transfer to a pinned account-map recipient, pinned bridge call), pins the paymaster address and caps `approveAmount` on the token path, rejects `to == the Safe itself`, delegatecall and owner/module/guard selectors unless an explicit warning item |
| TB6 | Provider-supplied data to calldata | Never take a recipient or spender from a provider response; rails built locally from pinned ABIs, aggregator calldata decoded and compared (`[38 §7]`) |
| TB7 | Build to user | Exact pins, 14-day release age, no install scripts; the Phase 0 to 1 AA code adds **no dependency** (pure viem); if the SDK is ever adopted it needs a written provenance exception (section 8, N1) |

---

## 3. Guardrails: what is enforced on-chain, what stays advisory

### 3.1 The distinction that decides everything

An account can be made to do two things. On the **call path** (a UserOp makes S execute `token.transfer`, `approve`, `redeemPositions`, a bridge call) a module sees the full calldata and can cap, allowlist and rate-limit it. On the **signature path** (a venue asks the matcher to settle; the exchange calls `maker.isValidSignature(orderHash, sig)` at fill) the account sees a 32-byte hash, wrapped by Kernel or ERC-7739 into a typed-data envelope that policies can match by domain and type name, never by field value. Evidence: Kernel `CallPolicy.checkSignaturePolicy` returns valid for any signature while live (Sourcify source read on Base), Rhinestone's docs say scoped signing "does not constrain message values such as the token, amount, spender, or deadline", the exchange code is `isValidSignatureNow(maker, hash, sig)` (H[36 §0, §2]). **The earlier finding stands: on-chain session policies cannot cap off-chain-signed CLOB orders.**

Two consequences: (1) revocation reaches an already-signed order on ERC-1271 accounts because the exchange calls `isValidSignature` at fill time, but not on ecrecover-owner venues (Opinion, Polymarket legacy), where a signed order is a bearer instrument until expiry; (2) a signed order can only spend what the exchange can pull, so the BUY side is boundable by ERC-20 allowance and balance, but ERC-1155 `setApprovalForAll` cannot be capped, so inventory stock is exposed and only its growth rate is bounded (H[36 §2]).

### 3.2 Controls, ranked by what they actually bound

| Control | Bounds | Where available | Enforced on-chain? | Bypass |
|---|---|---|---|---|
| **Funded balance of the venue account** | Everything the venue can pull | Everywhere | Yes (physics) | None; this is the real loss bound |
| **Capped ERC-20 allowance, never `max`** | BUY-side spend | Wherever the caller chooses the amount (Predict.fun scoped approvals; XO test T8; Opinion's amount NOT FOUND, relayed by the backend) | Yes | A key that can re-approve (the owner, or an allowance-setter key); XO's own Enable Trading is unlimited |
| **Allowance Module v1.0.0 budget** on S | **Outflow** of one token from S per delegate, per period (`amount = cap_day`, `resetTimeMin = 1440`), to any recipient the delegate chooses. It does not bound inflow into a particular venue account | Ethereum, Optimism, Polygon, Base, Arbitrum, Avalanche (Sourcify exact match; `eth_getCode` present on 1, 10, 137, 8453, 42161, 43114 and empty on 56 and 999); **not BNB, not HyperEVM** (Candide: "v1.0.0 is not deployed on BSC, HyperEVM, Tempo, World Chain...") | Yes, strict per fixed window (up to 2x across a reset boundary); struct `Allowance {uint96 amount; uint96 spent; uint16 resetTimeMin; uint32 lastResetMin; uint16 nonce}`; **nonce limit 65,534 transfers per delegate per token**; no recipient allowlist; no expiry (Candide's "expiration controls" wording is not backed by the contract); v0.1.x had a nonce-overflow replay bug, so only v1.0.0; audited by Certora plus a second auditor (Ackee per Candide, Nethermind per the `safe-fndn/safe-modules` `docs/v1.0.0` folder; the sources differ) | The owner, any other key on S, an EOA-venue account, and any chain without the module; the delegate can send the budget anywhere (add Zodiac Roles v2 for a recipient allowlist) |
| **Zodiac Roles v2** on S | Target allowlist, recipient allowlist and per-period amount together | BNB, Polygon, Base, Arbitrum (Sourcify partial matches) | Yes, but an extra module the Candide SDK does not know; LGPL; audited 2023; v3 is BUSL-1.1 with no additional use grant, avoid | Owner compromise |
| **2-of-2 owners (E plus a local co-signer)** | A compromised PayBox grant alone cannot produce a valid UserOp | Every S chain | Yes as an ownership guarantee (an attacker needs both keys), not a spending cap | The local machine, or both keys |
| **Venue-native delegates** | One venue's order flow, cannot withdraw | Polymarket (beta, request to Polymarket, 180 days, no amount limit found), Hyperliquid agent, Pascal key | Venue-enforced | The venue |
| **Signing-only Kernel permission** (order key cannot approve or withdraw) | Separates order authority from fund authority | Predict.fun on BNB only, **unproven** (backend acceptance of a permission-id signature NOT FOUND; policy contracts partial or unverified on BNB) | Yes if it works | Not built |
| **Local software caps** (`XO_MAX_ORDER_USD`, `XO_MAX_DAILY_USD`, funding caps, exposure meter) | Cooperative agents | Everywhere | **No: advisory** | A compromised agent with an `autonomous` PayBox grant, or any signing request outside the relay |
| **PayBox approval-gated mode** | A human sees each signature | PayBox chains | Not on-chain | Approval fatigue; opaque digests under `raw` (typed data is more legible, `callData` stays opaque bytes) |

### 3.3 Mapping the $10 per order and $50 per day caps

| Today (plugin or relay, advisory) | After this work | Enforced on-chain? | Residual |
|---|---|---|---|
| **$50 per day** out of the treasury toward a venue account | Faucet period cap on S: Allowance Module delegate `amount = cap_day`, `resetTimeMin = 1440` on Base, Polygon, Arbitrum (and Ethereum, Optimism, Avalanche); Roles v2 if a recipient allowlist is wanted; **on BNB (Predict.fun, Opinion) and HyperEVM no Allowance Module exists**, so the realistic design is a dedicated bucket credential funded by hand in cap-sized steps with a capped allowance | **Yes, as an outflow cap on S via a delegate, where the module exists; advisory elsewhere.** It bounds what leaves S, not what arrives at a venue or where it goes, and not money moved by the owner or any EOA-venue account | Cash already inside the venue account; inventory stock; 2x across a fixed-window boundary; owner and any other key bypass it; a delegate can send the budget to any address |
| **$10 per order** | A $10 **allowance** grant by a separate allowance-setter key, where the account type allows a signing-only order key (Predict.fun, unproven); otherwise the bucket balance and allowance bound the total | **No for the order itself.** The closest real thing is a capped allowance | A leaked key can sign many $10 orders until the allowance is gone; SELL side unbounded by allowance; price quality (a colluding taker) |
| **$10 per funding / $50 per day funding** | Same numbers as `cap_call` and `cap_day` on the faucet | Yes as an outflow cap on S where the module exists | XO funding: no module on 3223, withdrawal unverified, so the Base-side faucet is the only bound |
| **Creation fee $1 and seed** | Advisory (no module on 3223) | No | |
| **Kill switch** | Software kill plus an on-chain revoke (owner removes the delegate, zeroes the exchange allowance, sweeps) | The on-chain half is real | Revocation races the key in the same block or bundle (TOB-KERNEL-3 cited from `[25]`, not re-read) |

**What the product must say on the screen where a write flag is enabled** (D): "$50 per day is enforced on-chain only as a cap on tokens leaving the treasury Safe through a delegate, on chains that have the Allowance Module; it does not control where they go and does not apply to money moved by the owner, by an EOA venue account, or on BNB and HyperEVM; the per-order $10 limit is advisory; the real bound on a venue account is its balance and its approval; an `autonomous` PayBox grant bypasses every control here."

### 3.4 What stays advisory (explicit list)

1. Per-order notional and price of any off-chain signed order (XO, Polymarket, Predict.fun, Opinion).
2. Selling inventory to a colluding taker (ERC-1155 operator approval is all-or-nothing).
3. Anything done with a PayBox credential under an `autonomous` grant (`[25 T2]`, `[P1 A4]`).
4. Chain 3223 entirely: no policy or session module exists there (H[V10]); the bound is the funded balance.
5. Gas sponsorship limits against a key that holds native gas.
6. Plugin and relay caps: software the compromised agent may bypass.
7. Venue logic: fees up to the operator's bound, upgradeable exchanges, resolution risk.
8. Any limit that depends on a module whose presence on the target chain is not shown (Smart Sessions on BNB and Polygon; Allowance v1.0.0 on BNB and HyperEVM; Kernel `CallPolicy` v0.0.4 is not Sourcify-verified on BNB, H[V9], although code reads in `[DD]` found it).

### 3.5 Session-key options by venue (what "session key" can mean)

| Venue | Option | Status |
|---|---|---|
| XO | The XO L2 HMAC credential (derived by an L1 signature) in the daemon vault; no on-chain session key possible (no module on 3223, one validator slot per account) | H[25 §6.3] |
| Polymarket | Session Keys: Deposit Wallet only, 180 days, scopes CLOB/Combos/All, cannot withdraw, **requires a Builder API key and a rollout request to Polymarket** (a contact the user must decide on) | H[V6] |
| Predict.fun | None native; signing-only Kernel permission is a research track after module-presence reads | H[36 §6.3] |
| Opinion | None; the order key is a Safe owner and can also sign Safe transactions | H[36 §5] |
| Hyperliquid | `approveAgent` wallets (sign only, nonce state per signer, never reuse an agent address) | H[37 §4.7] |
| Pascal | Registered Ed25519 trading keys, expiry at most 365 days | M[VC] |
| Safe S | Allowance delegate (token outflow), 2-of-2 co-signer | H[35 §7] |

---

## 4. Gasless economics and who pays

### 4.1 Where gas is actually spent

| Venue (chain) | Orders | Gas-costing actions | Venue sponsors? |
|---|---|---|---|
| XO | Off-chain | UserOps (enable trading, split, merge, redeem, create) | Yes: `PolicyPaymaster`, allowlisted selectors, owner changed 6 times and can pause; native XO not obtainable by an outsider |
| Polymarket | Off-chain | Wallet creation, approvals, deposit, redeem | Yes per account, with a Relayer key made in the UI |
| Opinion | Off-chain, "zero gas cost to user" | `enable_trading` about 100k gas, split 150k, merge 120k, redeem 180k, paid in BNB (about $0.003 for enabling by Opinion's own table) | Builder programme only (an application form, contact) |
| Predict.fun | Off-chain | Approvals and cancels from the owner EOA in BNB | None found |
| Trueo, Pancake BTC/ETH | n/a | Every bet | None |

Of the venue families, three already sponsor the actions that cost gas; the population a general paymaster helps is the user who holds stablecoins and **no native token** on Base, Polygon, Arbitrum or BNB while moving money into or out of a venue account (H[40 §3.1]). The scarce thing on BNB is not the fee but having any BNB at all, and a Safe cannot fix that for an EOA-mode venue except by sending a few cents of BNB dust to E (a call-path transfer paid in USDT through the token paymaster).

### 4.2 Gas numbers (M, time-dependent snapshots dated 2026-10-20, from `[40 §3.2]`, partly re-measured)

A sponsored deploy-approve-deposit UserOp of 400,000 gas (the size XO's real deploy-and-enable op used, 404,091, H[21]): Base about $0.017 (`[40]`; a re-measure at 0.006 gwei gave about $0.006 before the L1 data fee, so plausible, M), Polygon $0.010 to $0.015 in `[40]` (re-measured about $0.009 at 252.8 gwei and POL $0.0922, 2026-10-20 about 07:55 UTC, slightly below `[40]`'s range, H[V12]), BNB about $0.015 (re-measured about $0.0146 at 0.05 gwei and BNB $728, H[V12]), Arbitrum about $0.035 (`[40]`; re-measured about $0.019 before L1 data, plausible, M), Optimism about $0.001 (re-measured about $0.001 at 0.001 gwei, H[V12]), **Ethereum about $0.04** at a 0.037 gwei base fee (block 26232434, 2026-10-20 about 07:55 UTC, ETH $2,389.6, H[V12]). The Ethereum figure varies by an order of magnitude or more with congestion; `[40]`'s earlier $0.22 (average) and $1.77 (fast) are not what the chain showed that morning and are withdrawn. Every gas row here is a dated snapshot, not a price list. A Safe op is about 520,000 gas by estimate (M). The measured Safe figures are fork numbers on Optimism: first deployment plus a transfer 474,685 gas, a second deployment 424,697, later operations 124,958 to 157,557 (H[39 §7.3], no L1 data fee, fork pricing). BNB gas rests on news plus Opinion's table (no official source read).

### 4.3 The five meanings of "gasless" and who pays

| Model | Who pays | Operated by the author? | Status |
|---|---|---|---|
| **A. Author-funded public Candide policy** | The author: plan fee plus a gas deposit held by Candide's paymaster | **Yes** (a Candide account, funded policies per chain per call sequence, renewals) | Fails "nothing the author must operate"; griefable (section 6); counsel first. Optional, off by default, last. Candide also documents public gas policies set up by third-party apps (PoolTogether and Revoke.cash), applied automatically when a UserOp matches; they cover only those apps' own contract calls, and no public policy that would sponsor our calls is known (H[V12]) |
| **B. User's own Candide key** (Starter) | The user | No | Key is a URL path segment so it lives in the daemon only; Starter is 2 mainnet chains, 2,500 mainnet UserOps in total, 1,000 sponsored in total, 2 policies, 10 req/s (H[V2]) |
| **C. User pays in a stablecoin** (Candide token paymaster) | The user, at Candide's rate; any exchange-rate spread on the token paymaster is NOT FOUND (Candide's pricing page says "Gas markup: None" for sponsored gas) | No | **Keyless availability on mainnet UNVERIFIED**: the token page says "Visit the dashboard to get an API key... availability can vary by API key" (H[V2]); `[35]` assumed it works keyless. Counter-evidence: Candide's own ERC-20 and gasless quickstarts use the keyless endpoint `https://api.candide.dev/public/v3/11155111`, but that is Sepolia testnet only; whether mainnet is served keyless cannot be settled by GET and needs a POST (L2) (H[V12]). Lists BSC-USD and Binance-Peg USDC on BNB, USDC/USDT on Base, Polygon, Arbitrum; none on HyperEVM; not Polymarket's pUSD |
| **D. Venue-paid** | The venue | No (a human step per user for Polymarket's Relayer key) | XO, Polymarket, Opinion builders; covers most of what a trader does |
| **E. The user pays native gas** | The user | No | Works everywhere; defeats the purpose for stablecoin-only users |

**Recommended meaning for this project: D where it exists, C or E elsewhere, B for users who want a bundler of their own, A only as an optional subsidy.**

### 4.4 Candide plans and the cost cliff (H[V2], M for modelled totals)

| | Starter | Launch | Grow |
|---|---|---|---|
| Price | $0, no card | $333/month | $749/month |
| Mainnet UserOps | 2,500 total, then mainnet **pauses** for API and policies | 100,000/month | 500,000/month |
| Mainnet chains | 2 | 7 (which seven: NOT FOUND) | all |
| Gas policies | 2 | 10 | unlimited |
| Throughput | 10 req/s | 50 req/s | 200 req/s |
| Sponsored ops included | 1,000 total, one time | 5,000/month then $0.01/op | 25,000/month then $0.005/op |
| Gas | At cost, paid from the policy deposit ("Gas markup: None") | same | same |

Chain count: the record targets 8 Candide-served chains (the PayBox overlap), so **more than 7 chains needs Grow at $749/month; whether our 8 fit Launch's 7 is NOT FOUND**, because the Launch chain list is unpublished. Candide's terms say price or usage changes take effect after 30 days' written notice.

Modelled total if the **author** sponsors (all M, `[40 §3.4]`): about $5/month at 100 users, $376 at 1,000, $1,121 at 10,000, $3,630 at 50,000. **The $5 figure is the sponsored gas only and excludes the plan fee**: Starter's 1,000 sponsored operations are lifetime and mainnet pauses at 2,500 operations, so the $333 Launch step is reached after about two months at only 100 users, and the realistic author cost at 100 users is $333/month plus the gas deposit (section 0.1), not $5. A policy is per chain and per exact call sequence, so 4 chains x 3 sequences = 12 policies exceeds Launch's 10. Worst-case griefing exposure on Launch is about $2,100/month (M). **For a user paying for their own use, at a handful of operations a day Starter's 2,500 lasts months** (L, arithmetic), so the binding limit is the two-chain cap, not the operation count.

### 4.5 Who bears what

| Item | Amount | Bearer |
|---|---|---|
| Derivation | $0 | Nobody |
| First Safe deployment per chain | Gas of about 425k to 475k (fork) | The user's Safe, or the user's sponsor |
| Keyless bundler and token paymaster | Service $0; sponsored gas is at cost (Candide: no markup); any exchange-rate spread on the ERC-20 token paymaster is NOT FOUND | Candide (infrastructure), the user (gas) |
| Own Candide key | $0 Starter, $333 Launch, $749 Grow | The user |
| Author-sponsored policy | Plan plus deposit, suggested cap $50 to $100 per chain | The author, by choice, after counsel |
| Implementation and review | Encoder, vectors, bundler client; if the SDK is adopted, golden tests on every bump (23 releases in 12 months, breaking changes in minors, recent bugs in signature encoding, token approvals and expiry packing) | The author |
| Bridge fees | CCTP 0 to 1.4 bps, Across 3 to 5 bps (36 bps Base USDT to BNB USDT), LI.FI 25 bps plus route, deBridge about 2.4% at $20 | The user |

---

## 5. Cross-chain funding flow and failure modes

### 5.1 What "seamless" honestly means

Funding is one to three discrete steps with a wait in the middle; the bet that follows is as fast as the venue's matcher. "Seamless" in the interface means: one screen, one decoded summary, one or two approvals, a progress bar that is honest about "up to N minutes", and a ready indicator that flips only when the destination balance and the venue's own read both show the money. It never means a bet that executes on chain B from chain A (H[38 §9]).

Typical times (H[38 §9], quotes of 2026-10-20): Base to XO over Hyperlane 14 s median, 27 s max (253 deliveries; all through XO's own executor, door (e) open); Base to Polygon over Across 0 to 2 s estimated fill; Base to BNB USDT over LI.FI Intents 8 s quoted; Base to Arbitrum or HyperCore over Polymer standard 18 minutes (prefer CCTP Fast when the fee is small); CCTP Base standard without Fast 15 to 19 minutes; Across refund after expiry "several hours".

### 5.2 The flow (state machine, extends `[38 §7.2]`)

`quote` (public GET, no signature) -> `verify` (decode the calldata we built, compare every field with the invariants) -> `prepare` (the bundled SafeOp, or PayBox `transaction` proposals when the source is E) -> `approve` (human) -> `submitted` -> `source_confirmed` -> `in_flight` -> `destination_credited` | `refund_pending` | `stuck`. Ground truth for arrival is the destination token balance and, for Hyperlane, `Mailbox.delivered(messageId)`; a funded venue account is not "ready" until the venue's own read shows it. The `sending` marker is written before the first signature is handed out; an ambiguous result is never resent (`[P1 A2, A6]`).

Invariants (a transfer that violates one is refused before any signature): the recipient is an entry of the account map at the status the venue needs (K(E) for XO, DW for Polymarket, the venue Safe for Opinion, E or the Predict account for Predict.fun, E for Hyperliquid, Limitless, Trueo and Pancake) and never read from a provider; tokens and spenders are pinned per rail with decimals compared (BNB USDT has 18, Base USDC 6); approvals are exact and temporary (`approve(spender, a)`, the call, `approve(spender, 0)`, in one SafeOp when the source is S, which is the one place a Safe genuinely helps); native `value` is 0 except where a rail requires its fixed fee; minimums enforced (Hyperliquid 5 USDC plus 1 USDC activation, Polymarket bridge $2, Opinion order $5, Predict order 1 USDT); caps use the existing funding counter and are labelled advisory (H[38 §7.1]).

### 5.3 Rails per route

| Route | Rail | Source account | Notes |
|---|---|---|---|
| Base to XO | Hyperlane `transferRemote(3223, bytes32(K), a)` on `0x54716A53...DF5F`, value 0 | E, or S (a contract sender is UNVERIFIED for this route) | Recipient K(E) left-padded; K must be deployed and registered first; **no verified exit for an outsider**, so size as loss-tolerant; one EOA owns both ProxyAdmins (H[38 §4.3]) |
| Base or Arbitrum to Polygon (Polymarket) | LI.FI to pUSD (3 s quote) or CCTP to native USDC then wrap | S or E | Whether `CollateralOnramp.wrap` accepts native USDC: docs contradict (UNVERIFIED); Deposit Wallet must exist |
| Base or Arbitrum to BNB (Predict.fun, Opinion) | LI.FI Base USDC to BNB USDT (8 s quote) or Across Base USDT to BNB USDT (36 bps); **CCTP does not carry USDC to or from BNB** | S or E | Recipient: the venue account; delivery to a contract wallet by an aggregator is untested |
| Any chain to HyperCore | CCTP forwarder hook, LI.FI, Relay or Across (chain id 1337) | E (the account is the signer) | Minimum 5 USDC, 1 USDC activation, below the minimum is lost |
| BNB out | Across BNB to Base (about 3 bps) | E or S | |
| Across all chains at once with one signature | Candide Safe Unified Account | **Excluded** | Opaque Merkle root, EntryPoint v0.9, young unlicensed module |

### 5.4 Failure modes

| # | Failure | Where | Control |
|---|---|---|---|
| FM1 | Funds sent to a counterfactual S where the factory, singleton, module or setup helper has no code (code is present on all eight overlap chains including HyperEVM and Avalanche by `eth_getCode` on 2026-10-20, H[V12]; 3223 has none; the check still runs per chain at deposit time) | Any S deposit | Deposit target only at `code-present` for all four contracts plus EntryPoint v0.7; funds stay recoverable because the initializer is in the salt (M) |
| FM2 | Wrong recipient encoding strands funds | Hyperlane bytes32, HyperCore | Encoders with golden tests; refuse unpadded |
| FM3 | An undeployed Safe cannot satisfy a venue ERC-1271 check | Any venue that would use S | Deploy on first use before the first signed off-chain order; S is not a venue account anyway |
| FM4 | UserOp stuck, dropped or priced out; `validUntil` expired | Bundler | Short `validUntil` (minutes, never 0); resubmit with a new SafeOp, never re-sign blindly; the PayBox tab must be open for the WalletConnect route |
| FM5 | `AA24` from `v` = 0/1 or unsorted multi-owner signatures | Safe signing | Normalise `v` to 27 or 28; sort ascending by owner; recover each signature locally before sending (H[39 §2.6 P7]) |
| FM6 | Token-paymaster approve to a different spender than the paymaster (fixed in AbstractionKit 0.4.2) | Token gas path | Pin the paymaster address; cap `approveAmount`; re-decode `callData` locally |
| FM7 | Provider screening or compliance block mid-route (deBridge refused a flagged placeholder recipient; Relay and Polymarket's bridge screen) | Aggregators | Show the provider message verbatim; no workaround |
| FM8 | Provider key requirements appear (Relay since 2026-10-02, LayerZero value-transfer quotes, Across production) | Quote adapters | Degrade to "unavailable", never a guess |
| FM9 | Standing approvals on a router later exploited (LI.FI 2024, Socket 2024) | Aggregators | Exact, temporary approvals |
| FM10 | Funding a geo-restricted venue | Predict.fun, Opinion, Polymarket | The page warns and never advises circumvention; the user's legal exposure |
| FM11 | Owner state diverges per chain (replacing the PayBox key on Base does nothing on Arbitrum) | Multi-chain S | List `getOwners()` and `getThreshold()` per chain, flag divergence; the first response to suspected compromise is to move funds, not rotate |
| FM12 | Genesis parameters lost | Any S after owner changes | Persist `{profile, owners sorted, threshold, saltNonce}`; also recoverable from the deployment `setup` calldata (M) |
| FM13 | Bridging back and forth to burn fees (compromised agent) | Any rail | Relay ledger and minimum transfer size; a Kernel RateLimit policy is possible only on a daemon-held raw-signing session (deferred) |

---

## 6. Security threat table and terms exposure

### 6.1 Threats specific to adding S1 and Candide (extends `[DD §6]`, `[25 §9]`, `[40 §4]`)

| # | Threat | How it plays out | Mitigation | Residual |
|---|---|---|---|---|
| A1 | **Owner key compromise or an `autonomous` PayBox grant** | Whoever can get the owner to sign can add an owner, enable a module, delegatecall; WalletConnect's PayBox grant is `autonomous` with no expiry (H[V7]) | Dedicated PayBox credential for the treasury; approval-gated mode; typed data only, never `raw`; 2-of-2 with a local co-signer above pocket money; SafeOp never signed over an `autonomous` WalletConnect session | High: the owner is the root |
| A2 | **Blind signing of opaque `callData`** | Typed-data fields are visible only if PayBox renders them (NOT FOUND); `callData` is bytes | Daemon decodes and shows summary plus tag; hash-binding of every field; both-form verification | Human who never compares |
| A3 | **SDK default divergence yields a different address** | Five variants for one owner | Profile S1 pinned by address and code hash; pure viem derivation; golden vectors | Low |
| A4 | **SDK churn and bugs** | 80 versions, 23 in 12 months, 0.x, no npm provenance on any version | Do not make it a runtime dependency of derivation or signing; if adopted for the token path, pin an exact version at least 14 days old and not below 0.4.2, written provenance exception, golden vectors per bump | Medium |
| A5 | **Candide as a dependency** | Sees addresses, calldata, IP; can pause, reprice, change terms on 30 days' notice; keyless limit unknown; Starter pauses mainnet after 2,500 ops | Optional, off by default, fall back to another bundler or self-hosted Voltaire | Medium |
| A6 | **Author-funded sponsorship is drainable** | Sybil accounts, spoofable Origin, IP rotation, quota exhaustion, per-op fee drain; only the deposit is a hard cap | Not on by default; if ever built: tiny deposit, rules requiring real-value deposits, Starter first, counsel | Griefable by design |
| A7 | **Module risk** | Allowance v1.0.0 is a security-fix release (three fixes over v0.1.1); the multi-chain module is young; Roles v3 is BUSL; ZeroDev WebAuthn signer once had a critical bug | Pin by address and code hash; named modules only; revocation is a race, move funds first | Medium |
| A8 | **Counterfactual funding trap, address squatting** | Funds to an address with no factory; a third party can deploy your exact configuration (harmless) | Code check per contract per chain; owners are in the salt so a variant cannot take your address | Low once enforced |
| A9 | **Cross-chain replay** | Same address on many chains | `SafeOp` domain carries `chainId` and the module address; `SafeMessage` domain carries `chainId` and the Safe; reject typed data lacking `chainId` (rule T8); the Merkle-root typed data has none and is excluded | Low |
| A10 | **Dangerous Safe-self calls** | An owner-signed UserOp can add owners, enable modules, set a guard, delegatecall | Classify and warn; never auto-prepare by the agent; the agent cannot prepare them at all (D) | Human |
| A11 | **Account-type mismatch loses assets** | Routing EOA-only venues through S moves positions out of EOA views; a contract caller on BNBUSD fails | Never route Pancake BNBUSD, x402, Hyperliquid through S; registry marks each account type | Low |
| A12 | **Hosted dApp supply chain or look-alike** | Bybit/Safe{Wallet} 2025 front-end tampering (M) | Local-first daemon for every write path; published build hash; hosted page read-only | Medium for a hosted deployment |
| A13 | **Session or delegate key theft** | secp256k1 is not a WebCrypto curve, so a browser key is extractable | Keys only in the daemon, 0600, expiry set; budget by Allowance so theft is bounded by it | Allowance lost, recipient free |
| A14 | **Public Anvil test accounts are live targets** | All carry an EIP-7702 delegation indicator on mainnets; Safes owned by them exist on Base and Polygon | Tests use them on local forks only; never send mainnet funds | Low |
| A15 | **Merkle multi-chain signatures approved blind** | K-02 "by design" client must verify all leaves | Not built | None |
| A16 | **Privacy** | Candide sees the owner address and calls; venues see address plus IP | Per-binding venue choice; no analytics; the user's own key | Positions are world-readable by address regardless |

### 6.2 Terms and legal exposure (documentation reading, not legal advice)

| Party | What binds | Consequence here |
|---|---|---|
| **Candide** (Terms "Last modified September 29, 2026. Effective October 30, 2026"; the currently effective Terms were not retrievable, NOT FOUND) | Designed for developers and businesses; 7.1 names "Reselling Candide API access to third parties" as abuse; 7.3 "Candide does not monitor the end users of your application. You are responsible for your application's own compliance"; indemnity; liability capped at 12 months of fees (zero on the free plans); no SLA below Enterprise; governing law French | Author-embedded shared key is out; one key per user or the keyless endpoint is in; sponsoring makes the author the responsible party; keyless-path retention NOT FOUND |
| **PayBox** | Terms are no obstacle by decision; WalletConnect route ships an `autonomous` grant | See A1; no contact made |
| **Predict.fun** (ToS "Last Updated November 18, 2025", about 11 months old) | Restricted persons (US, UK, France, Ontario, Singapore, Poland, Thailand, Australia, Belgium, Taiwan), "on behalf of" and "directed ... by" prohibited, VPN circumvention prohibited, scraping by robots prohibited, trading bots not banned | Geo warning, no circumvention, official keyed API only |
| **Opinion** (Terms "Last Updated October 19, 2025", about 12 months old) | Same restricted-person, VPN and scraping language; the "Restricted Jurisdictions" definition text was not re-extracted | Same; a Builder application is a contact, not needed for core flows |
| **Polymarket** | Geoblock enforced at the API; Session Keys need a rollout request to a Polymarket address | A contact the user must decide on; not required |
| **XO** | No safe harbour for a non-app account; creation limits | Unchanged (`[P1 §9.4 O5]`) |
| **Module licences** | AbstractionKit MIT; Safe contracts LGPL/MIT; Zodiac Roles v2 LGPL, v3 BUSL-1.1 (production use restricted until 2030-03-01); the multi-chain module repo has no licence | Avoid v3 and the unified module |
| **Public repository** | Anything committed is public | No Candide key, policy id, management key or authenticated URL in the repo, a build artifact, a page or CI logs |

---

## 7. Phased build plan

### 7.1 Ground rules

Everything is flag-gated OFF; no wallet, module, paymaster or bridge contract is authored; **Phases A to C add no dependency** (derivation, SafeOp typed data, signature packing and the bundler JSON-RPC client are small and owned in pure viem, with a frozen oracle for tests, `[35 §3.4]`, `[39 D3]`); the plugin (`src/`, `relay/`, `test/`, root `package.json`) is untouched except the edits listed in 7.3; one WP owns one path prefix; only the scaffold WP wires aliases; nothing runs `pnpm install`. Tests use public Anvil keys on local forks only (the Safe tests of `[39 §7.3]` are the model: 24 checks per chain).

### 7.2 Work packages

| WP | Owns (paths) | Starts after | Content | Acceptance (offline unless marked) |
|---|---|---|---|---|
| **AA-0 scaffold** | New folder `aa/` (plain TypeScript, no `package.json`, no dependency of its own); stated edits E1 to E3 below | nothing | Folder, alias `@aa/*`, boundary rule (no Node built-ins, no network in `aa/`), test wiring | `check-boundaries` fixture importing `node:*` from `aa/` fails; the root lockfile hash is unchanged by `pnpm --dir app install --frozen-lockfile` (W0-1 style) |
| **AA-1 derive** | `aa/safe-s1/{constants,derive,parse,errors}.ts`, `aa/safe-s1/vectors.json`, tests | AA-0 | Pinned constants with strict EIP-55 check and pinned `PROXY_CREATION_CODE` hash; `deriveSafe(owners, threshold)` with sort, rejection of zero, sentinel `0x...01`, duplicates, protocol contracts; `describeSafe`; genesis record type | **T-S1** vectors V1 to V6, V8, V9 of `[39 §2.3]` equal; `[A1,A0]` t2 equals V4, never V5; **T-S2** pinned hashes (`keccak256(PROXY_CREATION_CODE) = 0x1856e0ee...caf5f`, `initCodeHash = 0xe298282c...fd31ee`, selectors `0xb63e800d`, `0x8d0dc49f`, `0x1688f0b9`, `0x7bb37428`, typehashes `0x47e79534...9218`, `0xc03dfc11...ea7f`); **T-S3** negatives; **T-S4** cast-only recipe reproduces V1 to V7; Kernel cross-check `K(A0) = 0xB3729F7e1Ab0B4a50E7De5599Ecc321B8775d30d` |
| **AA-2 SafeOp** | `aa/safe-s1/{userop,sign,decode}.ts`, tests, `aa/safe-s1/userop-vectors.json` | AA-1 | `SafeOp` typed-data builder and local EIP-712 digest; signature packing (`validAfter` 6 B, `validUntil` 6 B, sorted 65-byte ECDSA, `v` 27/28); recover-and-compare; `callData` decoder for `executeUserOp` and template allowlist; classifier for owner/module/guard/delegatecall selectors | Golden SafeOp vectors produced **once in a scratch directory** with `abstractionkit` as oracle (not a repo dependency) and checked in; `v` 0/1 normalised; unsorted refused; both typehashes; tamper tests (altered `callData`, `validUntil` 0, wrong chain id, wrong paymaster) fail verification; fork test on public-Anvil keys for the deploying first UserOp (`AA24` negative cases) |
| **AA-3 account map and meters** | New files `app/src/features/wallet/{safe-rows,presence,exposure,gas-readiness}.ts(x)` and tests; the only edits to existing files are the row-type union in `account-map.ts`, the panel mount in `WalletView.tsx` and `index.ts` exports | AA-1 | `safe-s1` rows with the status ladder, per-chain presence matrix data (factory, singleton, module, setup helper, EntryPoint v0.7), genesis persistence in the existing IndexedDB address book, per-chain owner and threshold display with divergence warning, **gas-readiness** (native balance per chain, dated cost estimates, warnings that Opinion and Predict.fun need BNB), **exposure meter** (collateral balance, ERC-20 allowance per known venue spender flagged on `max`, `isApprovedForAll`, positions, native gas) which blocks "enable trading" on a max allowance | M2-3 style: a derived address is never a deposit target before all five contracts show code; "RPC unreachable" is not "undeployed"; a Safe row on 3223 is invalid; K rows exist for 3223 only; a pasted Safe address that does not re-derive from stored genesis is shown "imported, not derived" and passes the six import checks of `[39 §5.5]`; the exposure meter fixture shows `max` allowance as red |
| **AA-4 daemon Safe path (flag OFF)** | New `bridge/{aa-prepare,aa-bundler,aa-verify}.ts` and tests; additions to `bridge/contract.ts` (schemas) by its owner | AA-2, live tests L1 and L2 before the flag may be armed | Prepared SafeOp item, `submit` with recompute, recover and template re-decode (TB5), bundler JSON-RPC client over the daemon's allowlisted proxy (`eth_estimateUserOperationGas`, `eth_sendUserOperation`, `eth_getUserOperationReceipt`; the keyless URL by default, the user's keyed URL from the vault), pinned paymaster address and capped `approveAmount` on the token path (native-gas path first) | Mock bundler tests; `flag_off` returned for every AA write tool with the flag OFF; a tampered item disables sign; a second submit of one `prepared_id` sends once; no key or policy id appears in logs or audit; a repo grep test fails on any `api.candide.dev/api/v3/` or `mk_` string |
| **AA-5 funding rails** | `app/src/features/funding/*`, `aa/rails/*` (Hyperlane, CCTP, Across encoders and the decode-and-compare verifier) | AA-1 for account rows; independent of AA-2 | Steps F0 to F3 of `[38 §11.1]`: Funding Card from CORS-open GET quotes, direct builders, status trackers, LI.FI diamond verifier | Fixtures are recorded live responses with dates (no invented data); golden tests: right recipient, wrong recipient, unpadded bytes32, wrong decimals, over cap, expired quote, unknown selector all refused; source can be E (two PayBox `transaction` proposals) or S (one SafeOp) |
| **AA-6 venue adapters** | `sdk/venues/{opinion,predict}/*` (reads), `bridge/venues/{opinion,predict}-*.ts` (writes, flag OFF) | independent; writes after the relevant live test | Opinion: keyless public reads (M), then API-key login by EIP-712 and order signing by E as Safe owner; Predict.fun: reads through the daemon with the user's own `x-api-key`, **EOA mode** orders and JWT login by E; K(E) mode behind T-V2; registry rows for the Opinion Safe candidate and the Predict account | Parser fixtures from recorded responses; unknown enums fail closed; 18-decimal USDT handled without mixing micro-units (property test); Predict order digest equals the SDK's for 200 randomised orders (oracle in scratch); geo notice always shown; the adapter refuses to proceed when the venue account is not `venue-registered` |
| **AA-7 treasury controls (opt-in)** | `aa/allowance/*`, `bridge/cosigner.ts` and tests | AA-4 and live test L6 | Allowance Module v1.0.0 call builders (set delegate, set allowance, execute transfer) on chains where the module has code; the daemon-held delegate; 2-of-2 co-signer with local rules (targets, selectors, ceilings, a day ledger) | Fork tests: cap enforced, reset after the window, over-budget reverts, delegate revoked; refuses the module on BNB and HyperEVM; co-signer refuses an owner-change item without an explicit user step |
| **AA-8 docs** | New `docs/dapp-aa-runbook.md`; the doc amendments of section 9.2 | any | Runbook, live-test kit text, the on-screen wording of section 3.3 | Doc hygiene test (no identifiers) |

Waves: **0** AA-0; **1** AA-1, AA-5 (F0), AA-6 (reads); **2** AA-2, AA-3; **3** AA-4, AA-5 (F1 to F3); **4** AA-6 (writes), AA-7. A review step closes each wave. The live tests below gate the flags, never the code.

### 7.3 Edits outside the owned paths (each with an owner; none blocks wave 1)

| ID | Edit | Owner | Needed by |
|---|---|---|---|
| E1 | `app/tsconfig.json` paths `@aa/*` and `app/scripts/vite-base.ts` alias, mirroring `@shared/*` | app scaffold owner | AA-0 |
| E2 | `app/scripts/check-boundaries.ts`: add `aa/` to the shared allowlist and ban Node built-ins and network calls there | app scaffold owner | AA-0 |
| E3 | Root `tsconfig.json` and `tsconfig.test.json` include `aa/**` | plugin-build owner | AA-0 |
| E4 | `bridge/allowlist.ts`: add `api.candide.dev` for POST JSON-RPC bodies of the three bundler methods plus `pm_*`; no other host | daemon owner | AA-4 |
| E5 | `src/relay/flags.ts`: new flags `ENABLE_AA_SAFE` and `ENABLE_AA_ALLOWANCE`, default OFF, each held until the live-test fact is recorded. Flag mapping for every other write path (H[V12], `src/relay/flags.ts` read 2026-10-20, which today lists `ENABLE_USEROP_SUBMIT`, `ENABLE_TRADING`, `ENABLE_FUNDING`, `ENABLE_WITHDRAW`, `XO_ENABLE_CREATE`, `ENABLE_SELF_HOSTED_METADATA`, all default false): **AA-4 SafeOp submit = `ENABLE_AA_SAFE`; AA-7 Allowance and co-signer = `ENABLE_AA_ALLOWANCE`; AA-5 funding-rail builders (PayBox `transaction` proposals or a SafeOp) = existing `ENABLE_FUNDING`, and additionally `ENABLE_AA_SAFE` when the source is S; AA-6 Predict.fun and Opinion order and login writes = existing `ENABLE_TRADING`**. No new flag is added for AA-5 or AA-6 | relay-core owner | AA-4 |
| E6 | `app/headers.config.ts`: **no change** for the local build (`connect-src 'self'`); the standalone build gets no Candide host, since it is read-only | app scaffold owner | none |
| E7 | `app/scripts/dependencies.json`: **no change** unless N1 is reopened and chooses the SDK | dependency owner | none |

### 7.4 Live tests the user must run, with budgets (all opt-in; none was run by me; nobody is contacted)

| ID | Question | Procedure | Budget | Pass | Abort |
|---|---|---|---|---|---|
| **L0** (T-AA2) | Does the PayBox EVM address carry an EIP-7702 delegation or any code? | Read-only code query of the public address on Base and Polygon | $0, no PayBox call | Recorded in the wallet screen | none |
| **L1 = P-S1 + P-S2 + T-C1** | Does PayBox sign a Safe `SafeMessage` and a `SafeOp` with the `{chainId, verifyingContract}` domain, what `v` does it return, what does the approver see, does the hash recomputed locally equal what was signed? | Throwaway PayBox credential, zero-value, a local SafeOp for chain 8453, one `typedData` request each (WalletConnect or agent route), recover the signer locally | $0, one approval each | Recovered address equals the credential; `v` recorded; preview recorded; nameless domain accepted | Domain refused: the AA owner route through PayBox is dead and S1 remains a hot-key or other-wallet account |
| **L2 = T-C2** | Is the keyless endpoint livable (rate limit), is the token paymaster served keyless, what is the markup and the first-operation cost, does the PayBox signature verify (`AA24` or not)? | Dedicated throwaway credential; a few cents of USDC or USDT in the counterfactual S on **one** cheap chain after the five-contract code check (Polygon, BNB or Base); `validUntil` five minutes ahead; deploy and send a minimal transfer | Under $1 | UserOp included; owner equals the credential | Throttled below about one op a minute, token paymaster not served keyless, or `AA24` |
| **L3** | Predict.fun EOA mode end to end | User's own geo-eligible account decision; E funded with BNB dust (about $0.5) and about 5 USDT; Developer Console key; JWT login; approvals by `transaction`; a 1 USDT limit order far from the market; cancel | About $6 | Order accepted and cancelled | Geo, key or login refusal |
| **L4 = T-V2** | Does Predict.fun's gateway accept a PayBox-owned Kernel v3.1 it did not provision? | Only if F2 chooses it: initData with the ECDSA validator and owner E, deposit about 5 USDT, Kernel-wrapped login, a 1 USDT order | About $6 plus BNB gas | Gateway accepts | Rejection turns the candidate into "venue-forced"; no loss beyond the deposit |
| **L5 = T-V3** | Can an Opinion account use a user-made Safe, or accept an EOA configuration? | Sign the API-key message with E; observe the prerequisite error; then the documented onboarding on opinion.trade | $0 to start; a $5 minimum order after onboarding | A route attaches an existing Safe, or EOA mode works | No route exists: the test ends at zero cost; Opinion stays "venue-created Safe, owner E" |
| **L6** | Does the Allowance Module v1.0.0 enforce and reset as described, with a PayBox-signed owner? | Base only: S with $2 USDC, one delegate key, an allowance of $1 with a short reset, an over-budget transfer, a within-budget transfer | About $5 including gas | Over-budget reverts; reset works | Any unexpected spend: stop, sweep |
| **L7 = T-XC5** | Real fill time and fee of one small Across transfer into the user's own account | Base to Polygon, $2 to $5, approval-gated | Fees | Recorded | none |
| **L8** | Kernel address identity with an existing Predict account | If the user already has a Predict deposit address, compare it with K(owner) computed for the same owner | $0 | Equal or not, recorded | none |

Not recommended: Polymarket `signatureType 3` for a foreign ERC-1271 maker (T-V7) and Limitless type 3 (T-V9), because both need funded accounts and a third-party gate for low value.

### 7.5 Kill criteria

Any one ends the item named: PayBox cannot sign the Safe typed data or the approver cannot see the call (ends the PayBox-as-owner route; S1 stays available to other wallets); Candide's public endpoint rejects, throttles below about one op a minute, or refuses a Safe owned by an external signer (users bring a key or a different bundler); sponsored cost per active user above $0.50/month at 1,000 users or more than 25% of a deposit consumed in a week by unattributable ops (ends author sponsorship); Candide changes terms to restrict frontend use or suspends a key under 7.1 (ends the Candide dependency; fall back to self-hosted Voltaire or another bundler); counsel negative or the author is a restricted person under either BNB venue (ends sponsorship); a venue's terms bar contract wallets or relayed traffic; any report of a critical bug in the Safe module, the Allowance Module or the multi-chain module (stop, move funds out first).

---

## 8. Decisions needed from the user (only real forks)

A fork is listed here only if neither the evidence nor a binding decision settles it and the answer changes what is built now, what is spent, or what risk is accepted. Everything else is in the two lists after the table.

| ID | Fork | Options | Recommendation |
|---|---|---|---|
| **F1** | **Build the Safe treasury layer at all** | Build read-only derivation and meters only, defer writes until L1 and L2 pass / skip AA entirely and keep Option 0 plus the funding rails | **Build the read-only layer now (AA-0, AA-1, AA-3).** It costs no dependency and no flag, gives the account map its seventh row and the exposure meter, and the AA write path stays closed until L1 and L2 pass. Skipping AA loses nothing for the venues but also loses the only route that lets a typed-data-only signer move treasury funds |
| **F2** | **Predict.fun account mode** | E in EOA mode first / also test a PayBox-owned Kernel (L4) | **EOA first.** It needs no gateway acceptance, uses typed data and text messages PayBox can sign, and needs only BNB dust for approvals. Run L4 only if the Kernel's benefits (batching, a signing-only order key) are wanted, and never ask the user to export a Privy key (the official Predict-account flow requires exactly that export) |
| **F3** | **Whether the author ever spends money on gas for others** | Never (user pays: native, or stablecoin through the token paymaster, with their own Candide key if wanted) / a later, optional, author-funded sponsor policy | **Never by default.** The binding rule "nothing the author must operate" already makes the default user-pays; the fork is only whether to open an optional subsidy later. If so: a separate phase after counsel, Starter first, a $50 to $100 deposit per chain, a visible "sponsored by the author" setting OFF by default. Realistic cost once Starter is exhausted is $333/month plus deposit (more than 7 chains: $749/month) |
| **F4** | **Second owner by default** | 1-of-1 PayBox for pocket money, 2-of-2 with a local co-signer above that / always 1-of-1 | **Warn at pocket money, recommend 2-of-2 with a local co-signer (or a passkey as second owner once exercised in a browser) before holding more.** A non-exportable PayBox key is fine as one owner and wrong as the only owner. Note that a 2-of-2 S can never be an Opinion maker (threshold 1 only), which is fine because S is never a trading account |
| **F5** | **Contacting Polymarket for Session Keys** (the XO no-contact rule does not mention it) | Never / after everything else | **Never for now.** Session Keys need a Builder key and a rollout request; Polymarket write is view-only under `[DD]` F7 |

**Not forks: settled by evidence or by a binding decision, or gated on a live test** (flagged for your veto, no answer needed now):

| ID | Item | Why it is not a fork |
|---|---|---|
| **N1** | How to build the UserOp layer: own pure-viem encoder, vectors and a thin bundler client (native-gas path first) rather than adopting `abstractionkit` | The binding "no new dependency without a written exception" and the golden-vector approach settle the first release. Reconsider the SDK only after L2 shows the keyless token paymaster works; then pin an exact version at least 14 days old and not below 0.4.2 (0.4.3, published 2026-10-06T13:56Z, became eligible 2026-10-20 13:56 UTC); the lockfile would grow from 111 to 112 packages |
| **N2** | Hosted page versus daemon for AA writes: daemon only in the first release | PayBox's WalletConnect grant is `autonomous` (H[V7]) and the local-first decision keeps keys out of the page; revisit only after PayBox's grant behaviour is known (`[DPW]` D2, PW-2) |
| **N3** | Opt-in vault and faucet (Allowance Module) on Base, Polygon, Arbitrum | Sequencing gated on L2 and L6. It is an outflow cap on S only (section 3.2), needs a Candide key or self-paid gas per user, and does nothing on BNB, where Predict.fun and Opinion live; the exposure meter and capped allowances give most of the benefit first |

**Decided here, not forks** (flagged for your veto): profile S1 and its salt label; pure-viem derivation with the SDK only as an oracle; S is never a venue's trading account; no Safe on 3223; the Safe Unified Account, Kernel v4, Roles v3, EIP-7702 delegation of E and any author-operated sponsor are not built; the "dedicated PayBox credential" floor of `[P1 O1]` extends to the treasury owner; the on-screen advisory wording of section 3.3; Opinion and Predict.fun adapters are flag-OFF (`ENABLE_TRADING`) and show a geo notice.

---

## 9. Conflicts between the notes, and how each was resolved

### 9.1 Conflicts

| # | Conflict | Resolution | Basis |
|---|---|---|---|
| 1 | **PayBox WalletConnect chain list**: `[35]` and `[31]` say twelve (adding Monad 143 and Celo 42220), so the Candide overlap is nine; `[DPW]`, `[25]`, `[37]`, `[39]` say ten | Ten. The bundle's `PORTFOLIO_CHAINS` is 1, 8453, 56, 137, 10, 42161, 43114, 4663, 5042, 999 plus Solana; Monad and Celo appear only in a display-name map. Overlap with Candide is **eight** chains | H[V7] |
| 2 | **Does Opinion's exchange derive the Safe from the signer?** `[36]` (M, by analogy with Polymarket) says a Candide Safe cannot be the maker; `[37]` read the source and says no derivation check; `[39]` says "probably no" | `[37]` is right at contract level: `verifyOLABSafeSignature` is `verifyECDSASignature(signer, ...) && checkSafeSignatures(safeAddress, ...)` and never calls `getSafeAddress`. The gateway question stays NOT FOUND, so a user-made Safe is a **candidate**, not a plan. Added by the fact-check: the same signature bytes must pass both the ECDSA check and `Safe.checkSignatures`, so only a threshold-1 Safe whose owners include the signer qualifies; a 2-of-2 S (recommendation F4) never can | H[V4], H[V12] |
| 3 | **PancakeSwap prediction rejects contract callers**: `[25]`, `[35]`, `[36]`, `[38]`, `[39]`, `[DD]` say every contract caller | True for BNBUSD only; BTCUSD and ETHUSD (2025, exact match) carry no `notContract` or `tx.origin` check. Volume is small (about $0.32M/day across all three, M), so practice barely changes | H[V3], H[37 §4.9] |
| 4 | **What is Predict.fun's account and what should we do?** `[35]`: Privy plus ZeroDev, add it in EOA mode without Candide; `[36]`, `[37]`, `[40]`: Kernel v3.1 with XO's implementation and validator, a PayBox-owned Kernel is a candidate; `[40]`: no route to create one with a chosen owner | Both hold. The SDK supports EOA mode (no `predictAccount`) and Kernel mode, and the Kernel constants equal XO's. First move: EOA mode; Kernel is a test (L4) | H[V5] |
| 5 | **Presence of Kernel policy modules and the Safe module on BNB**: `[25]`, `[35]`, `[36]`, `[38]` find Sourcify gaps (CallPolicy v0.0.4 and Safe4337Module v0.3.0 not verified on 56) and treat presence as unproven; `[39]` and `[DD]` read code on BNB and found them present | Both observations are true and not contradictory: Sourcify is a lower bound. I re-confirmed the Sourcify gaps (404 for the module and CallPolicy v0.0.4 on 56; Kernel factory, implementation, validator, RateLimitPolicy, Safe factory and singleton and EntryPoint v0.7 verified) and the Safe registry lists the module on 56. **Code reads (`[39]`, `[DD]`) outrank Sourcify for presence.** The first draft of this record made no code read; the fact-check then did read-only `eth_getCode` of the Safe factory, SafeL2 1.4.1, Safe4337Module, SafeModuleSetup and EntryPoint v0.7 on 1, 10, 56, 137, 8453, 42161, 43114 and 999 (all present, identical code hashes on 8453, 43114, 999 and 56 for singleton, module and factory). The Safe module registry for v0.3.0 lists about 40 chains and omits only 999 and 43114 among ours, so it is a lower bound too | H[V8], H[V9], H[V12] |
| 6 | **Which account is the multichain hub?** `[38]` recommends Kernel v3.1 with Candide only as bundler for policy-locked direct rails; `[36]` and `[39]` recommend a Safe (Allowance Module, Roles); `[DD] §2.5/F4` chose Kernel only and listed "Safe as our layer" under *never* | **Safe S1 for the treasury.** Kernel UserOps need a raw digest that PayBox's WalletConnect refuses and whose availability under any grant is unverified; no audit of Kernel's policy contracts (`CallPolicy`, `RateLimitPolicy` and the others) was found, and Sourcify shows only older `CallPolicy` versions on BNB (the code read in `[DD]` found v0.0.4 there, so presence is a code-read question, row 5); Safe's Allowance Module has fresh audits and ships in AbstractionKit. The `[DD]` row "Safe ... never" is softened to "opt-in treasury (F1)". Kernel stays the XO and (candidate) Predict.fun venue account; the policy-locked-router idea of `[38 §7.3]` stays a deferred research track | H[35 §7], H[36 §3], H[39 §3] |
| 7 | **Keyless endpoint plus ERC-20 gas**: `[35]` treats keyless token-paid gas as the honest default; `[40]` and Candide's token page say a dashboard API key is needed and availability varies by key | **UNVERIFIED** whether the keyless endpoint serves the token paymaster; Phase B assumes native gas or the user's own key until L2 | H[V2] |
| 8 | **The hosted page and PayBox**: `[DD] §0, §2.7` refuse "a browser page acting as a PayBox client" and say PayBox has no web connection surface; `[DPW]` finds a WalletConnect wallet in PayBox's web app | `[DPW]` supersedes for the hosted page, but it ships an `autonomous` grant (H[V7]), which is why AA writes stay in the daemon (N2) | H[V7], H[DPW] |
| 9 | **Candide chains**: `[35]` ten requested plus six, `[37]` fourteen mainnets; Launch "seven chains" unnamed | Fourteen EVM mainnets (42161, 43114, 8453, 56, 42220, 1, 100, 999, 10, 9745, 137, 5031, 4217, 480) plus a Solana paymaster, and 24 extended networks by request; neither 3223 nor 4162 is served. Which seven chains Launch includes is NOT FOUND, so whether our 8 fit Launch is unknown | H[V2], H[V12] |
| 10 | **Where `abstractionkit` should be pinned**: `[35]` 0.4.2; `[40]` 0.4.0 or 0.4.1; `[39]` not a dependency at all | No dependency in Phases A to C. If adopted, floor 0.4.2 (0.4.0 and 0.4.1 carry the token-paymaster spender/approve bug that 0.4.2 fixed and recent signature-encoding bugs); 0.4.3 eligible after 13:56 UTC today | H[V1], H[35 §3.3] |
| 11 | **Allowance Module on BNB**: `[36]` "only old v0.1.0 there"; Candide says v0.1.1 is the deprecated version | Irrelevant to the decision: v1.0.0 is absent on BSC and HyperEVM per Candide and Sourcify; do not use the old versions (nonce-overflow replay bug) | H[V2], H[V9 note] |
| 12 | **Safe fork gas versus modelled gas**: `[39]` measures 474,685 gas for deploy plus transfer on an Optimism fork; `[40]` models 520,000 for deploy-approve-deposit | Consistent in magnitude; both M for real chains (no L1 data fee on the fork). Use `[40]`'s table as the dated estimate and `[39]`'s as the lower bound | M |
| 13 | **Is "gasless" delivered by Candide?** `[35]` partly; `[40]` already true for bets; `[36]` UX on BNB | Same conclusion: orders have no gas; the paymaster matters for approvals, deposits, redeems, withdrawals; sponsorship is someone's money | H[40 §3] |
| 14 | **Opinion gasless**: `[40]` builder programme only; `[37]`/`[38]` Opinion pays settlement gas | Both: order and settlement gas is Opinion's; `enable_trading`, split, merge, redeem need BNB unless the user is an approved builder | H[40 §3.1] |
| 15 | **Candide's own recommendation** (`SafeMultiChainSigAccountV1`, EntryPoint v0.9) versus S1 | We diverge from Candide's newest path deliberately (section 2.2) | H[39 §6] |
| 16 | **CCTP and BNB**: `[25]` M; `[38]` H | `[38]` H: Circle's list, its address table and a live 400 on a Base to BNB fee query; also irrelevant since BNB venues settle in USDT | H[38 §4.2] |
| 17 | **Does the Allowance Module enforce "$50/day for inflow into a venue"?** First draft headline said yes; section 3.2 said no recipient allowlist | Refuted by the fact-check: the module bounds token outflow from the Safe per delegate and window to any recipient; it does not bound inflow to a venue, and the owner bypasses it. Headline reworded in sections 0.1, 3.3 and 8 | H[V12] |
| 18 | **Token-paymaster markup**: section 4.5 stated "an undisclosed markup", section 4.3 said NOT FOUND, Candide's pricing page says "Gas markup: None" | A markup is not established. Sponsored gas is at cost; any exchange-rate spread on the ERC-20 paymaster is NOT FOUND | H[V2], H[V12] |
| 19 | **Ethereum gas for a 400,000-gas op**: `[40]` $0.22 average, $1.77 fast | Refuted as a snapshot: about $0.04 at a 0.037 gwei base fee on 2026-10-20; gas rows are dated snapshots | H[V12] |

### 9.2 Repo statements this record changes (to amend; I changed none of them)

| Statement | Where | Change |
|---|---|---|
| "Safe with the 4337 module ... only where a venue forces it" and "A generic universal multichain smart wallet" refused | `[DD §2.5, §2.7]` | Soften to: a Safe S1 is an **opt-in treasury, funding and gas account**, never a trading account; the refusal of a generic *trading* wallet stands |
| F4 "Phase 3 on-chain session-key layer on Kernel v3.1" | `[DD §8]` | Replace with F1 and N3 of this record (Safe S1 treasury; Allowance Module faucet) |
| "BNB: no AA" and "PancakeSwap prediction rejects contract callers; no smart account can bet there" | `[25 §4.1, §7.1, §8.4]` | BNB venues' own accounts are AA (Predict.fun Kernel, Opinion Safe); Pancake rejects contracts on BNBUSD only |
| "Opinion needs a Safe" / "Predict.fun accepts EOA or its Smart Wallet" | `[25 §4.1]`, `[DD §2.3]` | Opinion's contract accepts any Safe owned by the signer EOA and the SDK documents an EOA configuration (gateway unverified); Predict's smart wallet is Kernel v3.1 with XO's validator |
| "Candide public bundler/paymaster unverified" | `[25 §7.2]` | Docs read: keyless `https://api.candide.dev/public/v3/{chainId}`, per-IP limit (number NOT FOUND); behaviour still untested |
| "Twelve WalletConnect chains" | `[31]`, `[35]` | Ten (section 9.1 row 1) |
| `[plan]` status banner | `docs/plan.md` | Add one line pointing to this record once accepted |

---

## 10. Unverified list (everything below is design until its test runs)

**PayBox**

1. Whether PayBox signs the Safe `SafeOp` and `SafeMessage` typed data: a domain with only `chainId` and `verifyingContract`, `uint48`/`uint128`/`bytes` types, the returned `v`, session chain inclusion, and what the approver sees (L1). The bundle shows the approver labels a nameless-domain request only `Typed data` and enforces `domain.chainId` equal to the session chain; whether the server-side signer accepts a nameless domain is not known. Settles the PayBox-as-owner route.
2. Whether the WalletConnect `autonomous` grant signs with no per-request passkey (the docs contradict each other, `[P1 §2]`); whether a PayBox address carries an EIP-7702 delegation today (L0).
3. Whether a grant can permit `raw` (a raw-hash `secp256k1_sign` exists in the MoonX provider SDK bundled in the PayBox app but not in the WalletConnect responder's method list); whether PayBox's own gasless UserOperation path can carry a non-swap call (a possible gas lead, `[DD §2.4 G4]`).

**Candide**

4. The keyless per-IP rate limit; whether the keyless path logs IPs; whether keyless UserOps count against any plan (L2).
5. Whether the keyless endpoint serves mainnet at all or serves the ERC-20 token paymaster on mainnet (Candide's own ERC-20 and gasless quickstarts use the keyless URL only on Sepolia 11155111; this needs a POST) (L2). Candide documents public gas policies set up by third-party apps (PoolTogether, Revoke.cash); none covering our calls is known.
6. Any exchange-rate spread on the token paymaster (sponsored gas has "Gas markup: None" per Candide's pricing page) and its extra gas units; real per-operation gas of a Safe op on each chain (L2, cents).
7. **Resolved by the fact-check, kept for traceability:** Safe factory, singleton, module, setup helper and EntryPoint v0.7 are present on HyperEVM 999 and Avalanche 43114 (read-only `eth_getCode`, 2026-10-20, identical code hashes; the Safe registry omits both). Still unverified: Candide's paymaster and bundler behaviour on those two chains, and the contract code on 3223 (absence rests on note 39's reads and an explorer 404, not re-read).
8. Which seven chains Launch includes (and so whether our 8 fit it); Candide's Terms before 2026-10-30; the audit PDFs' contents (Allowance Module, Nethermind multichain module); any audit of the SDK itself; "Candide Atlas" (NOT FOUND).

**Venues**

9. Gateway acceptance of an account the venue did not provision: Predict.fun Kernel (L4), Opinion user-made Safe or EOA mode (L5), Polymarket type 3, Limitless type 3, Myriad. Each failure turns a candidate into "venue-forced".
10. Whether Predict's Kernel address for an owner equals K(E) (same factory call, salt and init data): NOT FOUND (L8). K(E) is identical on nine chains by the factory's `getAddress` (`[DD V5]`, `[39]`).
11. Whether Opinion's Safe address is `CREATE2(safeFactory, ..., keccak(abi.encode(signer)))` for a real account (formula read from source, M); whether Opinion's backend-created Safe carries the Safe 4337 module or fallback handler; whether Opinion's EOA configuration works on mainnet; Opinion's Enable Trading approval amounts.
12. Whether the BNB `CallPolicy` v0.0.4 and Smart Sessions are deployed on BNB and Polygon (Sourcify absent; code reads in `[DD]` say CallPolicy present); whether Predict.fun's backend accepts a permission-id-prefixed Kernel signature.
13. XO: the four doors (bundler admits a foreign account, orderbook registers it, L1 check accepts it, orderbook credits direct mints), door (e) (third-party Hyperlane delivery), the exit path, and whether `signatureType 0` is rejected (docs contradict) (`[P1]`).
14. Whether a contract sender (S) works on the XO Hyperlane route; whether `CollateralOnramp.wrap` accepts native USDC; whether CoreWriter action 1 accepts outcome asset ids.
15. Opinion's "Restricted Jurisdictions" definition text (not re-extracted); Predict.fun and Opinion terms are 11 to 12 months old and may be stale; Hyperliquid and Myriad terms not read.

**Guardrails**

16. Allowance Module v1.0.0 with a PayBox-signed owner (L6); the audit attribution (Certora plus Ackee per Candide, Certora plus Nethermind per the Safe repo); recipient behaviour under Roles v2; whether Roles v2 membership can expire; the Roles v3 audit; any audit of ZeroDev's `CallPolicy`, `RateLimitPolicy`, `GasPolicy`, `TimestampPolicy`, `SignaturePolicy`.
17. Whether the BNB secp256r1 precompile is live (the P-256 precompile answered a valid signature with 1 on six chains in `[39]`, which settles passkey signing at contract level for those chains; real browser WebAuthn verification and rpId binding are untested).
18. Revocation race behaviour on Kernel v3.1 (the bundle-ordering finding TOB-KERNEL-3 is cited from `[25]` for v4 and was not re-read).

**Build**

19. Real behaviour of `pnpm`/Vite with the `@aa/*` alias (E1); whether a vitest run picks up `aa/**` without further wiring.
20. Whether the Safe 4337 module's signature-length check accepts a contract owner (out of scope, NOT TESTED).

---

## Fact-check outcome

An independent fact-check on 2026-10-20 tested 13 claims of this record against primary sources (GET fetches, a downloaded and text-searched PayBox bundle never executed, Sourcify, the npm registry, and read-only `eth_getCode`, `eth_call` and `eth_gasPrice` on public RPCs; no POST, no PayBox tool, no account or key). Result: 10 confirmed (three of them with an added precondition, understatement or wording fix), 2 refuted (C6, C13), 1 unverifiable (C3). Every correction is applied in place.

| Claim | Verdict | What changed in this record |
|---|---|---|
| C1 Candide serves 14 EVM mainnets plus Solana, not 3223 or 4162; overlap with PayBox is eight | Confirmed | Wording: "every EVM chain we target except XO 3223 and SX 4162; Pascal is Solana"; Robinhood 4663 and Arc 5042 noted as PayBox-only (sections 0.1, 2.3, 9.1 row 9) |
| C2 Candide plan terms (Starter, Launch, Grow) | Confirmed | Numbers kept; "undisclosed markup" removed (Candide: "Gas markup: None"); gas-policy and throughput rows added; the 30-day change notice noted (section 4.4, 4.5) |
| C3 Keyless endpoint and mainnet token paymaster | Unverifiable (needs a POST) | Stays UNVERIFIED; added that Candide's own ERC-20 quickstart uses the keyless URL only on Sepolia 11155111, and that third-party public gas policies (PoolTogether, Revoke.cash) exist but do not cover our calls (sections 4.3, 10 item 5) |
| C4 AbstractionKit and the multi-chain module facts | Confirmed (understated) | Safe4337Module v0.3.0 has three audit reports (Ackee, Certora, Nethermind), not only Ackee (section 2.2) |
| C5 S1 derivation, pinned constants, code presence | Confirmed and strengthened | V1 recomputed with `cast` alone; code present on all eight chains with identical hashes, so "six proven, two rest on Candide's claim" is replaced by "eight proven" (sections 0.1, 2.1, 5.4 FM1, 9.1 row 5, 10 item 7, V8, V12). 3223 absence still rests on note 39 and an explorer 404 |
| C6 Allowance Module and the "$50/day inflow" headline | **Refuted** (chain presence confirmed) | The module caps token **outflow** from the Safe per delegate and window, to any recipient; it does not bound inflow into a venue, does not bind the owner, and does not exist on BNB or HyperEVM. Headline reworded in sections 0.1, 3.2, 3.3, 8; nonce cap 65,534 and audit attribution added |
| C7 Predict.fun Kernel and SDK facts | Confirmed | Added that the official Predict-account flow requires exporting the Privy key, which the project never asks for (sections 1.1, 8 F2) |
| C8 Opinion exchange Safe verification | Confirmed with a missing precondition | Added: the same signature bytes must pass ECDSA and `Safe.checkSignatures`, so only a threshold-1 Safe can be an Opinion maker; a 2-of-2 S never can (sections 0.1, 0.2, 1.1, 1.2, 9.1 row 2) |
| C9 Polymarket Deposit Wallet and Session Keys | Confirmed | None. The POLY_1271 and POLY_GNOSIS_SAFE contract-level claims were not re-checked and stay tagged H[37] and M |
| C10 PancakeSwap `notContract` on BNBUSD only | Confirmed | None |
| C11 CCTP does not carry USDC to or from BNB Smart Chain | Confirmed | None |
| C12 PayBox WalletConnect chains, `autonomous` grant, typed-data only | Confirmed | Added: Safe requests show only the generic label "Typed data" (A2), `domain.chainId` must equal the session chain, and a raw-hash method exists only in the bundled MoonX provider SDK (section 2.3, 10 items 1 and 3) |
| C13 Gas numbers (section 4.2) | **Refuted** for Ethereum | Ethereum 400,000-gas op is about $0.04 on 2026-10-20, not $0.22 to $1.77; Polygon measured slightly below `[40]`'s range; L2 and BNB rows plausible; all gas rows date-stamped (section 4.2, 9.1 row 19) |

**Contradictions resolved:** (1) "gas at cost plus an undisclosed markup" versus "NOT FOUND" and Candide's "no markup": no markup is established. (2) "$50/day enforced for inflow" versus "no recipient allowlist": the cap is on outflow from S only. (3) "about $5/month at 100 users" versus "the $333 step is reached after about two months": the $5 excluded the plan fee; the realistic figure is $333/month plus deposit. (4) "all chains need $749/month" versus Launch's 7 chains: more than 7 chains needs $749/month, and whether our 8 fit Launch is NOT FOUND. (5) "six chains proven" is stale: eight. (6) A user-made Opinion Safe "passes the contract" needed "at threshold 1", which clashes with recommendation F4 (2-of-2) if S were reused as the maker. (7) Flag traceability: AA-5 builders map to existing `ENABLE_FUNDING`, AA-6 writes to existing `ENABLE_TRADING`, AA-4 to new `ENABLE_AA_SAFE`, AA-7 to new `ENABLE_AA_ALLOWANCE` (section 7.3 E5).

**Binding-decision check:** no violation found of no new wallet contracts, no browser automation, no contact with XO or a venue (the Polymarket Session Keys request stays refused in F5), no custody, or "nothing the author must operate" (author sponsorship is optional and OFF). The only stretched rule, caps advisory unless enforced on-chain, is fixed by the C6 correction. The privacy scan found no e-mail address, personal name, GitHub login, home path or contact address.

**Section 8 now lists five real forks (F1 to F5).** Former F4 (SDK), F5 (hosted page versus daemon) and F6 (Allowance vault) are not forks: each is settled by a binding decision or gated on a live test, and they are listed as N1 to N3 for veto. Former F7 and F8 are renumbered F4 and F5.

**Not re-checked by the fact-check:** Candide privacy policy, Zodiac Roles v3 licence, Predict.fun and Opinion terms dates and restricted-country lists, Hyperlane, Across and LI.FI timings and fees, XO off-chain doors, Hyperliquid CoreWriter outcome orders, any PayBox server-side behaviour, the $0.32M/day Pancake volume figure, and the POLY_1271 contract-level claims.

---

## Verification

What I re-checked for this record, on 2026-10-20 (harness clock 07:36 UTC at the first probe). All requests were unauthenticated GETs with the User-Agent `insurance-markets-research/0.1`, about 0.4 to 0.6 s apart; no POST, no JSON-RPC call, no PayBox tool, no account or key.

1. **[V1] AbstractionKit registry facts.** `registry.npmjs.org/abstractionkit`: dist-tags `latest` 0.4.3, `experimental` 0.2.41; 80 versions; MIT; runtime dependencies `@noble/curves ^1.2.0` and `@noble/hashes ^1.3.2`; published 0.4.0 2026-06-10, 0.4.1 2026-07-30, 0.4.2 2026-09-16T11:41:13Z (33.83 days), 0.4.3 2026-10-06T13:56:02Z (13.74 days at 07:36 UTC, eligible at 13:56 UTC today); no `dist.attestations` on 0.4.0 to 0.4.3; the attestations endpoint returned 404 for 0.4.2 and 0.4.3; none deprecated. Matches `[35]`. H.
2. **[V2] Candide docs and pricing.** `docs.candide.dev` `wallet/api/supported-networks.md` (14 EVM mainnets, none is 3223 or 4162; Solana paymaster; extended networks by request), `wallet/api/public-endpoints.md` (keyless `https://api.candide.dev/public/v3/`, per-IP limit, number not stated), `wallet/technical-reference/deployments.md` (Safe4337Module v0.3.0 `0x75cf...c226`, Allowance Module v1.0.0 `0x691f59471Bfd2B7d639DCF74671a2d648ED1E331`, "not deployed on BSC, HyperEVM, Tempo, World Chain, ..."), `wallet/pricing.md` (billing rules, Starter pauses mainnet at its allowance, gas at cost), `wallet/paymaster/tokens-supported.md` ("Visit the dashboard to get an API key"; "availability can vary by API key"), and the text of `candide.dev/pricing` (Starter $0, 2,500 mainnet UserOps no time limit, 2 mainnet chains; Launch $333/month, 7 chains; Grow $749/month; Starter's 1,000 sponsored operations a one-time allowance). H. Not re-read: Terms and privacy policy (taken from `[35]`, `[40]`).
3. **[V3] PancakeSwap prediction.** Sourcify v2 source of BNBUSD `0x18B2A687610328590Bc8F2e5fEdDe3b582A49cdA` (partial `match`): `modifier notContract() { require(!_isContract(msg.sender), "Contract not allowed"); require(msg.sender == tx.origin, "Proxy contract not allowed"); }`. BTCUSD `0x48781a7d35f6137a9135Bbb984AF65fd6AB25618` and ETHUSD `0x7451F994A8D510CBCB46cF57D50F31F188Ff58F5` (`exact_match`): no `notContract` or `tx.origin` in `src/PancakePredictionV2.sol`; `extcodesize` appears only in OpenZeppelin `SafeERC20`. H for the contract source; that these two are the live products behind the app is M (from `[37]`).
4. **[V4] Opinion exchange.** `GET openapi.opinion.trade/openapi/quoteToken` returned `ctfExchangeAddress` `0x5f45344126d6488025b0b84a3a8189f2487a7246` and quote token BSC-USD; Sourcify (`match`, not `exact_match`): `verifyOLABSafeSignature` is `verifyECDSASignature(signer, hash, signature) && checkSafeSignatures(safeAddress, hash, new bytes(0), signature)` with no call to `getSafeAddress`; `getSafeAddress(signer, implementation, deployer)` exists in `OLABSafeLib` and `OLABFactoryHelper` but is not on the verification path. H; a redeployment behind the address is not ruled out.
5. **[V5] Predict.fun SDK.** `@predictdotfun/sdk` 1.3.8 (published 2026-07-28, MIT) tarball unpacked and read, never executed: `AddressesByChainId[56]` KERNEL `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D`, ECDSA_VALIDATOR `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`, `KernelDomainByChainId[56] = {name: "Kernel", version: "0.3.1"}`; `predictAccount` is optional (EOA mode when absent), and when given the constructor requires `ecdsaValidatorStorage(predictAccount) == signer`; `signPredictAccountMessage` signs the 32 wrapped-digest bytes with `signer.signMessage` and prefixes `0x01 || validator`. H.
6. **[V6] Polymarket.** `trading/session-keys.md`: "Session Keys are in beta", a Session Key "cannot withdraw funds", authorisation "expiration of 180 days", requires a Builder API key, and "During the initial rollout" a request to Polymarket to authorise the Builder key. `trading/wallets-auth.md`: Deposit Wallet is the default for accounts deployed on or after May 4, 2026. H. The contact address in the page is not reproduced.
7. **[V7] PayBox web app bundle.** `app.paybox.sh/_expo/static/js/web/entry-1db563483c9812f59f2a958f4cb7d011.js` (15,639,916 bytes, same size as `[DPW]`), read as text, never executed: `PORTFOLIO_CHAINS` = Ethereum 1, Base 8453, BNB 56, Polygon 137, Optimism 10, Arbitrum 42161, Avalanche 43114, Robinhood 4663, Arc 5042, Hyperliquid 999, Solana; the WalletConnect names map is built from `PORTFOLIO_CHAINS`; Monad 143 and Celo 42220 appear only in a separate display-name map; the session approval builds `approval_mode:"autonomous"`; the proposal text says "PayBox will sign them without asking again". H for what the code ships; runtime NOT TESTED.
8. **[V8] Safe module registry.** `safe-modules-deployments` `safe-4337-module/v0.3.0` lists `0x75cf...c226` on about 40 chains; within our chain set it lists 1, 10, 56, 137, 8453 and 42161 and omits 999 and 43114 ("only" applies to our set, not to the registry). The registry is a lower bound: the fact-check's code reads (V12) found the contracts on 999 and 43114 too. H.
9. **[V9] Sourcify on BNB (chain 56).** Verified (`match` or `exact_match`): Kernel factory `0xaac5...E419`, Kernel implementation `0xBAC8...4b4D`, ECDSA validator `0x845A...cE57`, RateLimitPolicy `0xf63d...6873`, Safe proxy factory 1.4.1, SafeL2 1.4.1, EntryPoint v0.7. 404 (not verified): Safe4337Module v0.3.0 `0x75cf...c226`, CallPolicy v0.0.4 `0x9a52...eaf2`, Allowance Module v1.0.0. On chains 1, 10, 137, 8453, 42161 and 43114 the Allowance Module v1.0.0 is `exact_match`; on 56 and 999 it is 404. Sourcify absence is a lower bound, not proof. H.
10. **[V10] XO explorer (chain 3223).** `GET explorer-mainnet.xo.market/api/v2/smart-contracts/{address}`: Kernel validator, Kernel factory and EntryPoint v0.7 returned 200; the negative control `0x7777...7777` returned 404; Safe proxy factory 1.4.1, SafeL2 1.4.1, Safe4337Module v0.3.0 and SafeModuleSetup all returned 404. An explorer view, not a code read (the code reads are in `[39 §4.2]`). H.
11. **[V11] Opinion docs.** SDK configuration page: `private_key` is the signer, `multi_sig_addr` the assets address, "Can be the same address or different". Open API authentication page: "Your wallet must be a registered Opinion account with a trading wallet enabled". H.

12. **[V12] Fact-check re-checks (2026-10-20, read-only).** Candide `supported-networks.md`, `public-endpoints.md`, `pay-gas-in-erc20.md`, `send-gasless-tx.md`, `tokens-supported.md`, `deployments.md`, `allowance-migration.md`, `pricing.md`, `candide.dev/pricing` and `candide.dev/legal/tos` (GET). npm registry for `abstractionkit` and `@predictdotfun/sdk` 1.3.8 (tarball unpacked and grepped, not executed). Safe contracts: `cast` recomputation of the proxy creation code hash, init code hash, CREATE2 address (V1 equal), and both EIP-712 typehashes; `eth_getCode` of factory, SafeL2 1.4.1, Safe4337Module, SafeModuleSetup and EntryPoint v0.7 on chains 1, 10, 56, 137, 8453, 42161, 43114 and 999; `SUPPORTED_ENTRYPOINT()` on Base and Avalanche; `eth_getCode` of the Allowance Module on the same chains (present on 1, 10, 137, 8453, 42161, 43114; empty on 56 and 999); Sourcify struct and function list on Base; `safe-fndn/safe-modules` audit folders for v0.3.0 and v1.0.0. Opinion exchange via `GET openapi.opinion.trade/openapi/quoteToken` and Sourcify. PancakeSwap prediction contracts via Sourcify and `paused()` and `currentEpoch` reads. Circle CCTP supported-chains page. PayBox web bundle (15,639,916 bytes) searched as text, never executed. Gas: `eth_gasPrice` and base fee on Ethereum (block 26232434), Optimism, BNB, Polygon, Base and Arbitrum at about 07:55 UTC against CoinGecko spot (ETH $2,389.6, BNB $728.09, POL $0.0922). `src/relay/flags.ts` read for the flag names. XO explorer 404 for the Safe contracts on 3223 (an explorer view, not a code read). H, except gas prices which are dated snapshots (M).

Repo reading: `docs/plan.md` banner and Phase 0 outcome; `docs/phase1-gap-closing.md` section 0, the user decisions and section 9; `docs/dapp-design.md` sections 0 to 2, 6 to 10; `docs/dapp-paybox-web.md` sections 0 to 2 and 8; `docs/research/25` in full; notes 35 to 40 (bodies, not only summaries); `docs/venue-census.md` headings; `app/pnpm-workspace.yaml`, `app/scripts/dependencies.json`, `app/scripts/check-boundaries.ts` (shared-source allowlist) and `app/tsconfig.json` (the `@shared/*` alias), to size the file-ownership plan.

What I did **not** re-check or could not: any PayBox behaviour (no call allowed); in the first draft any JSON-RPC result (the fact-check later added the read-only code reads of V12 for the Safe contracts on eight chains), so the Kernel policy modules and Candide's paymaster still rest on the code reads in `[39]` and `[DD]`, and absence of Safe code on 3223 rests on note 39's reads plus an explorer 404, not a re-read; any Candide bundler or paymaster behaviour (all POSTs); the Candide Terms and privacy policy, the previous Terms, and every audit PDF; any venue gateway's acceptance of a non-native account; the gas and price inputs of `[40 §3.2]`; the XO off-chain doors; Roles v3 licensing text (taken from `[36]`); the Hyperliquid, Myriad and Probable terms.

Privacy scan: this file contains no email address, personal name, GitHub login or home-directory path; only repo-relative paths appear; contact addresses seen in Candide's and Polymarket's pages were deliberately not reproduced; the only identifier on any request was the fixed User-Agent. Scope: only this file was written; no source, relay, test, package or git state was touched; nothing was installed, built or run; scratch files lived in the session scratchpad.
