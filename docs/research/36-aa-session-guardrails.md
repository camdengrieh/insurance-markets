# 36. On-chain guardrails for a session or agent key: what Safe and Kernel accounts can enforce, and what no account can

Task `aa-session-guardrails`. Written 2026-10-20 (harness date). Read-only research: public documentation, public npm and GitHub metadata and file reads (`gh api`), Sourcify GET lookups, and unauthenticated GETs of public docs. No PayBox tool was called, no JSON-RPC request of any kind was sent (so no `eth_getCode` or `eth_call`), nothing was signed, sent, deployed or created, no account or API key was made, no third-party code was cloned or run, and nobody at XO, PayBox, Candide, Polymarket, Predict.fun or Opinion was contacted. PDF audit reports were downloaded to a scratch directory and turned into text with a small script of my own that uses the macOS PDF reader; no downloaded code was executed.

Confidence tags: **H** = read first-hand in a primary source this session (URL, repo path or note id given); **M** = secondary, summariser-mediated, or inferred from H facts; **L** = guess. **NOT FOUND (searched: ...)** is used literally. Note ids: `[09]` = `09-venues-onchain-clob.md`, `[19]` = `19-smart-account-derivation.md`, `[21]` = `21-userop-templates.md`, `[25]` = `25-dapp-aa-wallet.md`, `[P1]` = `docs/phase1-gap-closing.md`, `[safety]` = `docs/safety.md`, `[tc]` = `docs/tool-contract.md`. "Sourcify" below always means a GET of `sourcify.dev/server/v2/contract/all-chains/{address}` or `.../contract/{chainId}/{address}`: an `exact_match` is a deployment proof for that chain, a partial match is a weaker proof, and **absence is not proof of absence** (a contract can be deployed and never verified there).

Binding decisions applied: runnable by everyone from day zero with nothing the author operates and no custody of other people's credentials; nobody contacts the XO team; no browser automation; caps are advisory unless enforced on chain; every write path flag-gated OFF; no new wallet, module or paymaster contracts written by us; the repo is public.

The user's proposal being tested (2026-10-20): a smart-contract wallet (Candide, Safe-based) derived from a PayBox wallet or any other wallet, operating on any chain, with session keys and strict guardrails, gasless, seamless cross-chain bets, and Predict.fun and Opinion on BNB Chain added. This note answers only the guardrail layer: **what can the chain itself enforce against a leaked or hijacked session key, for which prediction-market actions, and what must stay advisory.** The venue-by-venue account question is `[25]`; this note re-tests its conclusions in section 11.

---

## 0. Bottom line

1. **Real on-chain limits exist, but only on the call path.** Every mechanism studied (Safe AllowanceModule, Zodiac Roles on a Safe, Rhinestone Smart Sessions on a Safe7579 or other 7579 account, ZeroDev Kernel permissions) can cap and allowlist calls the account itself makes: ERC-20 `transfer`/`approve`, `transferFrom`-style funding legs, `redeemPositions`, AMM or parimutuel `bet` calls, bridge `transferRemote`. None of them can read the size, price or counterparty of an off-chain signed CLOB order. This is confirmed from source and from Rhinestone's own words: a scoped signing session "does not constrain message values such as the token, amount, spender, or deadline" (H, docs.rhinestone.dev `wallets/session-keys/custom-setup/session-signing.md`), and ZeroDev's `CallPolicy.checkSignaturePolicy` returns "valid" for any signature while its status is live (H, Sourcify source of `0x9a52...eaf2` on Base).
2. **For XO, Polymarket, Predict.fun and Opinion the only on-chain bound on a signed order is what the account holds and has approved to the exchange.** A compromised signing key can sign orders of any size at any price; the exchange can only fill what `balance` and `allowance` allow, and can only sell inventory the account holds. So the strict, enforceable quantity is **holdings at the venue account plus whatever inflow the treasury path allows until it is revoked**, not "$10 per order".
3. **The guardrail pattern that works: Vault, Faucet, Bucket (section 6).** Bulk funds sit in a vault the agent cannot sign for. A faucet key may move at most a fixed amount per period, only of one token, only to allowlisted bucket addresses, only until an expiry, enforced by an audited module. Each venue gets a bucket (the venue's mandatory account type) funded only through the faucet and holding no more than the user will lose. Where the venue account type allows a signing-only key, the order key cannot approve, transfer or withdraw; a separate allowance-setter key can re-grant an exchange allowance of at most the per-order cap, a bounded number of times per day. That chain is the only way to get "$10 per order, $50 per day" enforced on chain for the BUY side, and it works only where those key splits are possible (Predict.fun on BNB, maybe; XO, Opinion, Polymarket: no, or venue-native).
4. **What stays advisory, explicitly:** the per-order notional of a signed CLOB order; price quality (a key that can sign can sell inventory to a colluding taker at a cent); the stock of open positions (only the rate at which it can grow is capped); anything the agent does through a PayBox credential that is not approval-gated; gas griefing on non-sponsored paths; and every limit that lives in the plugin or relay (`XO_MAX_ORDER_USD`, `XO_MAX_DAILY_USD`) rather than in a contract.
5. **Candide ships no session-key or spend-policy module of its own.** Its on-chain pieces are the Safe account with Safe's 4337 module, the Safe AllowanceModule (wrapped by AbstractionKit, default now the v1.0.0 deployment), the Safe social-recovery module, a multi-chain-signature variant of the 4337 module (Nethermind, 0 findings, 3 GitHub stars, created 2026-01-16), and Calibur/Simple 7702 accounts. "Safe Policies" (role permissions, spending limits, velocity limits, allowlists) is a **roadmap page**: its own status table says custom policy development and the AbstractionKit integration are "Planned" (H, `candidelabs/developer-docs` `docs/account-abstraction/research/safe-policies.md`). Candide's InstaGas gas policies are **off-chain** sponsor rules that bound gas, not assets.
6. **Gasless is not free and not needed on BNB.** Mainnet sponsorship on Candide needs a gas policy funded by someone with an API key: Starter is $0 with 2,500 mainnet UserOps and 1,000 sponsored operations in total, one time; Launch is $333 a month (H, candide.dev/pricing via WebFetch, M for the summariser). On BNB the self-paid gas for two approvals is about $0.003 by Opinion's own estimate (H, docs.opinion.trade). The honest reading is that gasless is a UX feature on BNB and Polygon, and a cost line someone must own everywhere else.
7. **The recommended order of work (section 10) writes no contract and adds no account type first:** an exposure meter from public reads; capped-allowance approvals instead of `max`; dedicated bucket credentials; and only then, opt-in and user-keyed, a Safe vault with the AllowanceModule v1.0.0 as a faucet on Base, Polygon and Arbitrum. Smart Sessions and Kernel permissions for a signing-only key are gated on module presence on BNB and on a backend acceptance test that cannot be run read-only.

---

## 1. Method and limits

- Read in the repo: `docs/plan.md` banner, `docs/phase1-gap-closing.md` sections 0 and 9, `docs/safety.md`, `docs/tool-contract.md` (cap variables), `docs/research/25-dapp-aa-wallet.md` in full, `docs/research/09-venues-onchain-clob.md` sections 2.1 and 2.2, and the `pancakeswap-prediction.md` venue note.
- Source reads (all public, `gh api` or raw GET, User-Agent `insurance-markets-research/0.1` where a header was settable; `gh api` calls carry the local `gh` login, which GitHub can see, as disclosed in `[25]`): `safe-global/safe-modules` (`modules/allowances`: README, CHANGELOG, `AllowanceModule.sol`, `docs/v1.0.0/audit.md` and both PDFs), `safe-global/safe-smart-account` (`CompatibilityFallbackHandler.sol`), `gnosisguild/zodiac-modifier-roles` (README, `LICENSE.md`, `Membership.sol`, `Allowance.sol`), `erc7579/smartsessions` (README, policy sources, five audit PDFs), `rhinestonewtf/safe7579` (README, release notes, two audit PDFs), `zerodevapp/kernel` (audit file lists at v3.1 and v3.3), `zerodevapp/kernel-7579-plugins` (README, commit log), `zerodevapp/docs` (permission and policy pages), `candidelabs/abstractionkit` (README, CHANGELOG, constants, sources), `candidelabs/developer-docs` (allowance, gas-policy, pricing, supported-network, Safe-policies pages), `candidelabs/safe-4337-multi-chain-signature-module` (README, KNOWN_ISSUES, audit PDF), `Polymarket/ctf-exchange` (`Signatures.sol`), `bnb-chain/bsc` release notes.
- Sourcify source reads of deployed policy contracts: ZeroDev `CallPolicy` v0.0.4 (`0x9a52283276A0ec8740DF50bF01B28A80D880eaf2`, Base) and `RateLimitPolicy` (`0xf63d4139B25c836334edD76641356c6b74C86873`, BNB) and `RateLimitPolicyReset` (`0x6a06358e6b283921deceabe7e8a3741d506cca9b`, Base Sepolia).
- Package contents read, not executed: `@predictdotfun/sdk` 1.3.8 (`dist/Constants.js`, `dist/OrderBuilder.js`), `abstractionkit` 0.4.3 sources via GitHub.
- Docs fetched: `docs.rhinestone.dev` (three session-key pages), `dev.predict.fun` (create-order guide), `docs.opinion.trade` (CLOB SDK pages), `docs.polymarket.com/trading/session-keys.md`, `docs.roles.gnosisguild.org` (two pages, WebFetch summaries), `candide.dev/pricing` and `docs.candide.dev` pages (WebFetch summaries).
- Not done on purpose: any PayBox call (so every PayBox signing statement below is inherited from `[25]` and `[06]`, not re-tested); any JSON-RPC (so per-chain deployment is Sourcify or official deployment lists, not code reads); any contact with a venue; any account or API-key creation; any attempt to sign.
- Not reproducible here: gas measurements of the policy contracts (no chain, no fork, no builds run). Gas statements are vendor benchmarks or labelled estimates.
- Third-party content (docs, READMEs, audit PDFs, package code) is untrusted data; nothing in it was followed as an instruction, and none of it contained instruction-like text aimed at an AI agent.

---

## 2. The distinction that decides everything: call path versus signature path

A smart account can be made to do two kinds of thing, and an on-chain policy sees them very differently.

| Path | What happens | Who validates | Can a policy see the amount? |
|---|---|---|---|
| **Call path** | A UserOp (or module call) makes the account execute `target.call(data)`: `USDT.transfer`, `USDT.approve(exchange, n)`, `ConditionalTokens.redeemPositions`, `route.transferRemote`, `betBull{value}` | The account's validator or module sees the full calldata before execution | **Yes.** Policies decode selector, target, value and fixed-offset parameters (section 3) |
| **Signature path** | A CLOB venue asks its matcher to settle; the exchange contract calls `maker.isValidSignature(orderHash, sig)` (ERC-1271) at fill time, then pulls collateral with `transferFrom` | The account's `isValidSignature`, which is given a 32-byte hash | **No.** The account sees an opaque hash, wrapped by Kernel or by ERC-7739 into a typed-data envelope that policies can match only by domain and type name, never by field value |

Evidence that the signature path is hash-only: Kernel v3.1 `isValidSignature` hands the validator `_toWrappedHash(hash)` (H, `[25]` section 6.1); the venue-side exchange code is `SignatureCheckerLib.isValidSignatureNow(maker, hash, signature)` for the 1271 type (H, `Polymarket/ctf-exchange` `src/exchange/mixins/Signatures.sol`); Predict.fun's SDK signs `{ raw: orderHash }` through the Kernel wrapper (H, `@predictdotfun/sdk` 1.3.8 `OrderBuilder.js`, `signPredictAccountMessage`). The Safe `isValidSignature` is `safe.checkSignatures(...)` against the Safe's owners and threshold (H, `CompatibilityFallbackHandler.sol` line 83), so a Safe cannot give a non-owner a restricted signing right at all without an extra validator module.

Two properties of the signature path matter for guardrails and are not obvious:

1. **Revocation reaches already-signed orders on ERC-1271 accounts.** The exchange calls `isValidSignature` when the order is matched, not when it was signed (H, `Signatures.sol`: `verifyPoly1271Signature` runs inside `validateOrderSignature` at fill). If the session or owner is removed from the account before the fill, the same signature stops validating. That is better than an EOA maker, where a signed order is a bearer instrument until expiry or a nonce bump. It is only as fast as the revoke transaction (section 4.1), and it does not apply to venues whose signature is a plain `ecrecover` by an owner EOA (Opinion, Polymarket legacy Safe/Proxy types: `verifyPolySafeSignature` is `ECDSA.recover == signer && getSafeAddress(signer) == safe`).
2. **A signed order can only spend what the exchange can pull.** The binding on-chain quantity is `min(balance, allowance)` of the collateral and `balanceOf` plus the ERC-1155 `setApprovalForAll` operator approval for outcome tokens. ERC-20 allowances can be capped by amount; ERC-1155 approvals cannot (all-or-nothing per operator). So the BUY side is boundable by allowance and the SELL side (inventory) is not.

### 2.1 Which prediction-market actions are on which path

Sources: `[25]` section 4, `[09]` sections 2.1 and 2.2, the SDK and docs named above, `pancakeswap-prediction.md`. "Capped on chain" means a module on the account can bound it; it does not mean the venue is safe.

| Action | Venue examples | Path | Capped on chain by an account policy? |
|---|---|---|---|
| Move funds treasury -> venue account (ERC-20 `transfer`, bridge `transferRemote`) | all; XO via Hyperlane warp route from Base (`[20]`, `[P1]` section 0) | Call | **Yes:** target, selector, recipient, per-call amount, period amount |
| `ERC20.approve(exchange, n)` | XO "Enable Trading", Predict.fun `setApprovals`, Opinion "Enable Trading" (Safe tx relayed by the backend), Polymarket | Call | **Yes**, both spender and amount, if the policy has a parameter rule on each (Rhinestone: "approvals bind a spender and amount", H) |
| `ERC1155.setApprovalForAll(exchange, true)` | Predict.fun, Opinion, Polymarket, XO (conditional tokens) | Call | Spender can be allowlisted; **the grant itself is unbounded in amount** |
| Place or match an order | XO, Polymarket, Predict.fun, Opinion, Limitless (smart-wallet mode) | **Signature** (off-chain EIP-712, 1271 or `ecrecover`) | **No** (only indirectly through allowance and balance) |
| Cancel an order | Predict.fun (on-chain `cancelOrders` tx exists, REST removal too, H `dev.predict.fun`); XO has no on-chain cancel (`[safety]`) | Call or off-chain | Call variant yes |
| `redeemPositions` / `mergePositions` / `splitPosition` / NegRisk `convertPositions` | Predict.fun, Opinion (`split()`, `merge()`, `redeem()` need BNB gas, H docs.opinion.trade), Polymarket CTF | Call | **Yes:** `redeemPositions` pays collateral to `msg.sender`, so an allowlist on target and selector plus an `EQUAL` on the collateral parameter is a real limit (M, standard Gnosis CTF behaviour; not re-read here) |
| `ERC1155.safeTransferFrom` of positions | any | Call | Yes if simply not allowlisted. This is the "transfer inventory out" door and must stay closed |
| Bet into a pool or AMM (`betBull`, `buy`, `trade`) | PancakeSwap prediction, Trueo, Azuro/Overtime-style AMMs | Call (Azuro: EIP-712 plus approval, relayed, M) | Yes for EOA-compatible accounts. **PancakeSwap prediction rejects every contract caller** (`notContract`: no extcode and `msg.sender == tx.origin`, H `pancakeswap-prediction.md` line 79), so no smart account or 7702-delegated EOA can use it |
| Venue login (JWT, API key by signature) | Predict.fun, Opinion, Polymarket, XO | Signature (message) | No. Leaking a login signature is a credential problem, not a funds problem, but it lets the holder place and cancel orders as the account |
| Withdraw from venue | Polymarket deposit wallet (owner-signed batch), Opinion (Safe tx), XO (unverified, `[P1]` H1) | Call or Safe tx | Yes where it is an account call; venue-controlled otherwise |

---

## 3. The mechanisms, one by one

Format per mechanism: what it enforces; audit and maturity; chains; revocation; gas; browser-key suitability; what a thief of the key can and cannot do.

### 3.1 Safe AllowanceModule (`safe-global/safe-modules`, `modules/allowances`)

**What it enforces (H, `AllowanceModule.sol` read in full).** A registry shared by all Safes. The Safe adds a **delegate** and sets, per (delegate, token): `amount` (uint96), `resetTimeMin` (uint16 minutes, so at most 65,535 minutes, about 45.5 days), a reset base, and a running `spent`. A delegate calls `executeAllowanceTransfer(safe, token, to, amount, paymentToken, payment, delegate, signature)` either as `msg.sender` (empty signature) or by handing a signed EIP-712 `AllowanceTransfer` to anyone who submits it. The module then makes the Safe do an ERC-20 `transfer` (or a native send) to **any `to`**.
- Only transfers. It cannot `approve`, cannot call an exchange, cannot redeem, cannot sign an order. As a funding faucet it is complete; as a trading guardrail it is not.
- **No recipient allowlist, no token-pair allowlist beyond the allowance entries, no expiry.** The only time logic is the periodic reset. Candide's guide advertises "expiration controls" (H, `docs/wallet/plugins/2-allowance.mdx`); I found no expiry check in the contract (H, source). Treat that sentence as marketing for the reset period, not for a deadline. Time-boxing needs an owner transaction (`deleteAllowance`, `removeDelegate`) or a delegate that is itself time-limited (for example a smart account whose own session expires).
- Fixed reset windows aligned to `resetBaseMin`: a delegate can spend the full allowance just before and just after a boundary, so the worst case in any 24 h span is 2x. The repo already documents the same calendar-day effect for its own cap (RT-5, `[tc]` item 7).
- A delegate has at most 65,534 transfers per token entry (`nonce` is uint16; H source comment "use different delegate").
- A "payment" leg reimburses `tx.origin` out of the same allowance (the relayer incentive); it is counted against the allowance (H).

**Audit and maturity.** v0.1.0: a G0 Group report (`docs/v0.1.0/audit-report-g0.md`, H file name; Candide's guide also links an October 2020 Safe audit and an Ackee report of 2024, M, not read). **v1.0.0 (released 2026-02-25): Certora, 3 informational findings, all fixed; Nethermind NM-0993, 0 findings, final commit `c95f039` (H, both PDFs read).** v1.0.0 fixes a nonce-overflow that "would potentially allow replaying past allowance module transfers" and a transfer that did not revert when a token returned `false` (H, CHANGELOG). Anything still on the 0.1.x addresses carries those bugs. AbstractionKit 0.4.3 defaults to the v1.0.0 address `0x691f59471Bfd2B7d639DCF74671a2d648ED1E331` and labels the old one deprecated (H, `src/account/Safe/modules/AllowanceModule.ts`).

**Chains.** v1.0.0 `0x691f...E331`, Sourcify **exact match** on Ethereum 1, Optimism 10, Gnosis 100, **Polygon 137**, Robinhood 4663, **Base 8453**, **Arbitrum 42161**, Celo 42220, Avalanche 43114 (H, Sourcify). **Not found on BNB 56** (searched: Sourcify). The pre-fix v0.1.0 `0xCFbFaC74...3134` is on BNB 56 (partial match) and should not be used. XO 3223: not found.

**Revocation.** `deleteAllowance` (zeroes amount, spent and reset, keeps the nonce) or `removeDelegate(delegate, removeAllowances)`, both Safe transactions (a UserOp signed by the owners). Race: a pending `executeAllowanceTransfer` that lands before the revoke succeeds, bounded by `amount - spent` at that moment; a signed-but-unsent transfer dies at the revoke (allowance 0). The signed object has no deadline, so it stays usable until the allowance is exhausted or removed.

**Gas.** One extra external call plus two storage writes per transfer; no number measured here (NOT FOUND for this module). Not a UserOp validation path at all: it is a normal call, so the delegate or any relayer pays gas, unless the delegate is a 4337 account (Candide's guide does exactly this, "execute a delegated token transfer from the delegate's account", H).

**Browser key.** The delegate key is an EOA or a small smart account; the page can hold it in memory only under the caveats in section 4.3. A leaked delegate key bounds the loss at `amount` per reset period to any address, nothing else.

**Thief with the delegate key can:** move up to `amount` per period of each configured token to any address, and burn part of it as "payment". **Cannot:** approve, call arbitrary contracts, change the allowance, add delegates, sign ERC-1271 messages for the Safe.

### 3.2 Zodiac Roles Modifier on a Safe (`gnosisguild/zodiac-modifier-roles`)

**What it enforces.** A modifier between a Safe and its modules: a role is a set of (target, selector, parameter conditions, send/delegatecall options); a member address calls `execTransactionWithRole`. v2 and v3 both carry period allowances (`refill`, `maxRefill`, `period`, `balance`, `timestamp`, H `Allowance.sol` in v3, docs page `general/allowances`) usable on any uint calldata field and on ether value, plus a call-count form (`CallWithinAllowance`). Consumption is applied only after a successful call (docs). This is the only studied mechanism with **target allowlist + recipient (`EQUAL`/`ONE_OF`) + per-period amount** in one place.
- **v3 adds membership windows**: each membership packs `startTimestamp`, `endTimestamp` and `usesLeft` (H, `Membership.sol`). I did not confirm v2 has the same (NOT CHECKED).
- Single `moduleOnly` identity: the member must be `msg.sender` (or sign, in v3). For gasless use the member should be a small 4337 account of the agent (Candide's AbstractionKit can build it); a member EOA pays native gas.

**Audit and maturity.** v2: G0 Group (Apr 2023, Nov 2023) and Omniscia (May 2023, Nov 2023) reports in `packages/evm/docs` (H file names; text not extracted). **v3 was merged on 2026-10-15 ("contracts-v3 (#393)", H commit list) and its audit file is `Audit05_Roles-V3_Oct2026_ComeDuCrest.pdf` (file name only; I did not read it). The v3 contracts are BUSL-1.1 with "Additional Use Grant: None", change date 2030-03-01 (H, `LICENSE.md`)**, so production use of v3 needs a commercial licence or waits for the change date; whether that reaches an end user calling an already-deployed instance is a legal question I did not resolve. The v2 mastercopy `0x9646fDAD06d3e24444381f44362a3B0eB343D337` is **LGPL-3.0-only** (H, Sourcify source header).

**Chains.** v2 mastercopy, Sourcify partial match on Ethereum, Optimism, **BNB 56, Polygon 137, Base 8453, Arbitrum 42161** (H). v3 `0xF2964CE6161ce0e75964Fe7927cE114cb0B283D5`: README lists Ethereum, Optimism, Gnosis, Polygon, Arbitrum, Avalanche, BSC, Base and others (H, README); Sourcify shows partial matches only on 1, 100, 1301, 8453, 42161 and others, not 56 or 137 (so the README list is not independently confirmed, M). XO 3223: not found.

**Revocation.** Owner transaction `assignRoles`/role edits on the modifier (a Safe transaction). Same race as 3.1. Because the modifier is a Safe module, the Safe owners can also disable the whole modifier.

**Gas.** Condition evaluation is calldata-decoding in-contract; no number measured (NOT FOUND).

**Browser key.** Same as 3.1.

**Thief with the member key can:** do anything the role allows, up to the allowance, to the allowed recipients. **Cannot:** call outside the role, change roles, sign ERC-1271 for the Safe (a Safe's `isValidSignature` needs an owner signature, section 2).

### 3.3 Safe7579 adapter plus Rhinestone Smart Sessions (`rhinestonewtf/safe7579`, `erc7579/smartsessions`)

**What it enforces.** Smart Sessions is an ERC-7579 module. A session is a signer plus policies: **userOp policies** (whole-operation: time frame, usage limit, gas) and **action policies** keyed by (target, selector) (H, README and `contracts/external/policies/`):
- `ContractWhitelistPolicy` (targets), `UniActionPolicy` (per-call `valueLimitPerUse`, up to 16 parameter rules with `EQUAL/GT/LT/GTE/LTE/NEQ/IN_RANGE` on fixed-offset words, and a **cumulative `LimitUsage` per rule**), `ERC20SpendingLimitPolicy` (cumulative spend **plus approvals counted against the same limit**, no reset, lifetime of the session), `ValueLimitPolicy` (cumulative native value), `UsageLimitPolicy` (total op count), `TimeFramePolicy` (valid after/until, also usable for ERC-1271), `SimpleGasPolicy` (gas **limit** only), `SudoPolicy`.
- **No built-in rolling per-day window.** Limits are per-session lifetimes. A per-day cap is a session that lasts 24 hours, re-granted each day by the owner (section 6.4).
- **ERC-1271 signing is configurable** per session: disabled, unrestricted, or scoped to an EIP-712 domain plus primary-type schema. Scoped signing "does not constrain message values" and, at the time of the docs I read, "direct scoped signing through `signTypedData` remains unavailable until safe ERC-7739 signature emission is restored" (H, `session-signing.md`). So for a CLOB order the choices are none or anything-in-that-schema.

**Audit and maturity.** Cantina core review, 26 Aug to 3 Sep 2024, report dated 2024-10-08: 7 High, 7 Medium, 12 Low, 16 Informational, each marked fixed with a PR number (one informational acknowledged); the highs include "ValidationData not always intersected", "Enable mode can be frontrun to add policies for a different permissionId", "`removeSession()` doesn't remove data completely", "ERC-7739 does not use correct verifyingContract". **Cantina external-policies review: 1 Critical ("UniActionPolicy does not persist usages", fixed PR 76), 1 High ("ERC20SpendingLimitPolicy doesn't clear previous data", fixed PR 117), 1 Low (fixed PR 107)** (H, reports read). Renascence v1.0 (2024-11-09): 10 issues incl. 2 High, all resolved; Renascence update (2024-12-16 to 25): 2 Medium resolved; ChainLight (2025-07-30): 4 issues, 0 High, 2 Medium patched (SimpleGasPolicy does not cap gas **price**, so "the actual cost in ETH can still be arbitrarily high"; ContractWhitelist state not cleared on re-init). Latest release `v1.0.0` 2024-12-25, last push 2025-10-15, "beta" disclaimer in the README, AGPL-3.0, 61 stars (H, GitHub). It is the best-reviewed session module of the set, and the review history says the cumulative-limit policies, exactly the ones this use case needs, were where the worst bugs were. Safe7579: Ackee (reports 2024-06-14, fix review 06-20, final 2024-07-05; findings included a Critical "ERC-4337 counterfactual address can be stolen" and two Highs), ChainLight 2025-04-15 (4 issues: 2 Low, 2 Info, patched); release `v2.0.0` 2025-04-23 (H).

**Compatibility trap.** Safe7579 installs itself as the Safe's **fallback handler** and module (H, README). Candide's Safe accounts use Safe's `Safe4337Module`, which is also the fallback handler. A Safe has one fallback handler, and AbstractionKit has no 7579 or Smart Sessions support (searched `candidelabs/abstractionkit` for "7579" and "session": no code hit). So "Candide Safe plus Smart Sessions" is not a supported pairing; the supported stack for Smart Sessions is Rhinestone's own SDK or permissionless-style tooling with Candide used only as a bundler. A Safe7579 account and a Candide `SafeAccountV0_3_0` for the same owner are different addresses.

**Chains.** Smart Sessions `0x00000000008bDABA73cD9815d79069c247Eb4bDA` (contract name `SmartSession`, H Sourcify): partial match on Ethereum 1, **Base 8453, Arbitrum 42161** and testnets; **not found on BNB 56 or Polygon 137** (searched: Sourcify). Safe7579 v2.0.0 `0x7579d6Dd...C0003`: partial on **56, 137, 8453, 42161**; its launchpad `0x757963...00EF`: **not on 56** (only testnet BNB), so a brand-new Safe7579 account cannot be created through the launchpad on BNB mainnet as far as I can establish (H, Sourcify).

**Revocation.** `removeSession(permissionId)` or module uninstall, an owner UserOp. Audit finding 3.1.3 says removal once left data behind and was fixed (PR 62). Race: the 4337 bundler can include a session UserOp ahead of the revoke; bounded by the remaining limits.

**Gas.** No per-policy numbers published; ChainLight notes the gas-price gap. NOT FOUND.

**Browser key.** Rhinestone's own guidance: "If a browser must sign, keep the scope short-lived and low-value. Any script that can read the key can use it." and "Deleting a key or handle from application storage does not revoke the onchain session" (H, `security.md`). Passkey and multisig session signers exist (docs index, H), which opens the non-extractable-key route (section 4.3).

**Thief with a session key can:** do anything the session's action policies allow until they are exhausted or the session expires, and sign ERC-1271 messages per the session's signing mode. **Cannot:** exceed `ERC20SpendingLimitPolicy`/`UniActionPolicy` cumulative limits, call non-whitelisted targets, outlive `TimeFramePolicy`.

### 3.4 ZeroDev Kernel permissions (Kernel v3.1; v4 noted)

**What it enforces.** `Permission = 1 signer + N policies + 1 action` (H, ZeroDev docs). Source read of the deployed `CallPolicy` v0.0.4 (H, Sourcify):
- Per call in a UserOp: the (callType, target, selector) must be in the stored permission set (target `address(0)` means "any target"), `value <= valueLimit`, and every `ParamRule` (`EQUAL, GT, LT, GTE, LTE, NEQ, ONE_OF` on a 32-byte word at a fixed offset) must pass.
- **Batches:** each call in a batch is checked **individually**; nothing sums them. A batch of ten calls each at the per-call maximum passes.
- **There is no cumulative amount limit anywhere in the policy set** (Call, Gas, RateLimit, Signature, Sudo, Timestamp). The closest is `GasPolicy` (total gas in wei) and the rate limiters.
- `RateLimitPolicy` (no reset, deployed on BNB 56 and others): each UserOp consumes one slot and pushes `validAfter` forward by `interval`; unused time is **not** lost, so after an idle period the signer can burst (H, source). `RateLimitPolicyReset` (a true "N per interval, repeating") exists, but its Sourcify match is **testnets only** (Base Sepolia, Arbitrum Sepolia, Ethereum Sepolia, OP Sepolia), the source reads `block.timestamp` inside `checkUserOpPolicy` and imports `forge-std/console.sol` (H, source). A TIMESTAMP read in the validation phase is normally rejected by public bundlers for unstaked entities (M, ERC-7562 from memory; not re-read). Treat the resetting variant as not production.
- The effective "$50 per day" in Kernel is therefore `per-call cap x count`, with the count enforced per UserOp, not per call, so a batch multiplies it. A safe use needs the permission's action to be single-call only; I could not confirm that the policy rejects batch call type (it explicitly handles `CALLTYPE_BATCH`, so it does **not** reject it) (H).
- **ERC-1271:** `CallPolicy.checkSignaturePolicy` and `RateLimitPolicy.checkSignaturePolicy` both `return 0` (valid) if their status is live (H, source). A Kernel session with only Call and Rate policies can therefore sign **any** ERC-1271 message for **any** caller. Use `SignatureCallerPolicy` (`toSignatureCallerPolicy({ allowedCallers })`, H docs) so only the exchange contract can validate its signatures. That limits who consumes the signature, not what it says.
- Gas policy: total gas in wei, plus "enforce a paymaster" or "this specific paymaster" (H, docs).

**Audit and maturity.** Core Kernel: ChainLight v3.0 (34 pages; finding titles include "ExecLib._tryExecute inverted success", "Kernel should handle collisions of 4-bytes PermissionId", H), Kalos v1/v2.1/v2.2/webauthn/recovery, Kalos "v3 plugins" (12 Apr 2024; its scope is only `FactoryStaker.sol` and `KernelFactory.sol`, "No security issues found", H), a plugins-and-hook audit (27 May to 9 Jun 2024; WebAuthn, MultiChain WebAuthn, Weighted validators and a SpendingLimit **hook**, H), `v_3_1_incremental_audit.pdf` at v3.3 (name only). **NOT FOUND: any published audit of `CallPolicy`, `RateLimitPolicy`, `GasPolicy`, `TimestampPolicy` or `SignaturePolicy` themselves.** Their source is no longer in the Kernel repo; the repository `kernel-7579-plugins` now holds `CallerPolicy` and `TimelockPolicy` and recent commits reference Trail of Bits findings ("fix/tob-kernel-1"), i.e. the plugin family is being rewritten. ZeroDev's own constants file carries a WebAuthn signer note "fixed critical vulnerability present on all previous version" (`[25]`), and `CallPolicy` v0.0.4 is annotated "fixed erc4337 storage violation" (`[25]` section 6.1): versions matter. Kernel v4.0 (tag 2026-10-05, 14 days old, EntryPoint v0.9) removed its audit folder in the release commit (`[25]` section 5.2); do not use it.

**Chains.** Kernel v3.1 factory, implementation and ECDSA validator: BNB 56 and Base 8453 (partial matches, H Sourcify); factory not found on 137 or 42161. Policy contracts: SignaturePolicy, SudoPolicy, GasPolicy, RateLimitPolicy (no reset) and the ECDSA signer have partial matches on **56, 137, 8453, 42161**; TimestampPolicy on 56, 137, 42161 but **not Base** in Sourcify; `CallPolicy` v0.0.4 on 137, 8453, 42161 but **not 56**; v0.0.1 and v0.0.2 on 56 (H, Sourcify), and I cannot say whether those older versions have the bundler-rejection issue the v0.0.4 note describes. **Chain 3223: none of the policy or signer contracts exist** (explorer 404 with controls, `[25]` section 6.3), and the deployed ECDSA validator cannot be installed twice on one account.

**Revocation.** `revokeSessionKey(kernelClient[, key])` (SDK `@zerodev/session-key`, H docs) uninstalls the permission with the master signer; `status = Deprecated` on the policy. A session key can be given the right to revoke itself. Race: `[25]` T5 records that in Kernel v4 an uninstall earlier in a bundle does not stop later operations in the same `handleOps` (TOB-KERNEL-3); treat every revoke as racing the key.

**Gas.** ZeroDev's own benchmark (local simulation, 2024-02-24, v2.x not v3): Kernel v2.1 ERC-20 transfer 96,038 gas and creation 265,215, versus Safe 4337 105,089 and 401,848, SimpleAccount 90,907 and 383,218 (H, `zerodevapp/aa-benchmark`, vendor). Policy overhead not measured: NOT FOUND. L2 data fees not included.

**Browser key.** ECDSA, WebAuthn, multisig signers (H docs). Same custody caveats as 3.3.

**Thief with a Kernel session key can:** make the calls the `CallPolicy` allows (any number of calls per UserOp, each within its per-call limits) at the `RateLimit` pace; sign any ERC-1271 message for any caller unless a SignatureCallerPolicy narrows the caller. **Cannot:** touch targets or selectors outside the permission, exceed per-call value limits.

### 3.5 What Candide itself ships

| Piece | What it is | Guardrail value | Evidence |
|---|---|---|---|
| Safe account + Safe4337Module v0.3.0 (EntryPoint 0.7) | Standard Safe; 4337 validation is the Safe owners' EIP-712 `SafeOp` signature | **None for sessions**: any signer is a full owner | H, `abstractionkit` constants and README. Module deployed on 56, 137, 8453, 42161 (official `safe-modules-deployments` 3.0.11 list, H) |
| `SafeMultiChainSigAccountV1` + `Safe4337MultiChainSignatureModule` | EntryPoint 0.9; one EIP-712 signature over a Merkle root of per-chain UserOps | Convenience, **not a guardrail**; a weakness for approvals (below) | H, repo README, KNOWN_ISSUES, `NM_0874_Candide_safe.pdf` (Nethermind, 0 findings, one commit `81b732f`). Repo created 2026-01-16, 3 stars. Module address `0x22939E83...AEAd`, partial matches on 56, 137, 8453, 42161 |
| `AllowanceModule` helper | Builds the Safe AllowanceModule calls (recurring/one-time allowance, delegate transfer) | Section 3.1 | H, CHANGELOG 0.4.1 and 0.4.3 |
| `SocialRecoveryModule` | Guardian recovery with a delay | Recovery, not spend limits | H, `candide-contracts` README |
| Passkeys (Safe WebAuthn signer, P-256 via RIP-7951 precompile or Daimo verifier) | Hardware-bound owner | Strong owner key; as an *owner*, not a limited session | H, README and docs |
| Calibur / Simple 7702 accounts | EIP-7702 delegation; Calibur keys have `expiration` and `hook` | Out of scope here (`[25]` section 5.4: kill) | H, CHANGELOG 0.4.1 |
| **Safe Policies** | Role permissions, spending/velocity limits, allowlists, cosigner | **Not shipped.** Status table: custom policy development "Planned", AbstractionKit integration "Planned", hosted cosigner "Planned" | H, `safe-policies.md` |
| **InstaGas gas policies** | Off-chain sponsor rules: per-account total, per-op max, rate per period, account/origin/IP allowlists, **calldata rules per call (target, selector, parameter constraints)** | Bounds *sponsored gas* and can refuse to sponsor off-pattern calls. A key that holds native gas or another paymaster bypasses it. Toggle "Active State" is a fast off-chain kill lever for sponsored ops | H, `docs/instagas/2-gas-policies.mdx` |

**Multi-chain signature caveat for the proposal's "seamless cross-chain" idea (H, `KNOWN_ISSUES.md` K-02):** the module verifies only the current chain's leaf against the signed Merkle root, not the other leaves; "Signing clients MUST verify ALL leaves in the merkle tree before the root is signed." The signed typed data is `MerkleTreeRoot { bytes32 merkleTreeRoot }` (H, `abstractionkit/src/constants.ts`). An approver, human or PayBox window, sees a bytes32. For an agent product this is a blind signature unless the signing client decodes every leaf itself, and PayBox's approval screen would not. Whether PayBox accepts a typed-data domain without a `chainId` is untested (`[25]` T-AA1 class).

### 3.6 Comparison

| | AllowanceModule v1.0.0 | Zodiac Roles v2 (v3) | Smart Sessions (Safe7579) | Kernel v3.1 permissions |
|---|---|---|---|---|
| Per-call amount cap | No (only totals) | Yes (conditions) | Yes (UniAction) | Yes (CallPolicy) |
| Cumulative / per-period amount cap | **Yes, per period** | **Yes, per period** (allowance) | Lifetime cumulative only | **No** (count x per-call) |
| Recipient allowlist | **No** | **Yes** | Yes (param rule) | Yes (param rule) |
| Target / selector allowlist | n/a (transfer only) | Yes | Yes | Yes |
| Time window | No (periodic reset only) | v3 yes; v2 not checked | Yes | Yes (Timestamp) |
| Usage count / rate | 65,534 per entry | call-count allowance | Yes (UsageLimit; lifetime) | Yes (RateLimit; per UserOp; burst after idle) |
| Controls ERC-1271 signing | No | No | Yes (off / any / schema-scoped) | Partly (caller allowlist only) |
| Works with Candide's account as shipped | **Yes** | Yes (Safe module) | **No** (needs Safe7579 as fallback handler) | n/a (different account) |
| Gasless path | Delegate smart account via 4337 | Member smart account | UserOp from session key | UserOp from session key |
| Audits | Certora + Nethermind 2026 (v1.0.0) | G0 + Omniscia 2023 (v2); v3 Oct 2026 | Cantina x2, Renascence x2, ChainLight 2025 | Core yes; policies NOT FOUND |
| Licence | LGPL-3.0 | v2 LGPL-3.0-only; v3 BUSL-1.1 | AGPL-3.0 | MIT (Kernel) |
| Base / Polygon / Arbitrum / BNB | yes / yes / yes / **no (v1.0.0)** | yes (partial proofs) on all four | Base, Arbitrum yes; **Polygon, BNB not found** | CallPolicy: 137/8453/42161 yes, BNB older versions only |
| 3223 (XO) | no | no | no | no |

---

## 4. Cross-cutting questions

### 4.1 Revocation and its race conditions

- Every revocation is an **owner transaction** that must be mined or bundled; the key holder can submit its own operation in the same window. The loss during the race is bounded by what the module still allows at that moment (remaining allowance, remaining usage counts, balances and approvals), which is why those bounds, not the revoke, are the real protection.
- **Off-chain kill levers are faster but weaker:** disabling the Candide gas policy stops sponsored operations at once (H, docs "Active State"), but an account that holds native gas still pays its own way; PayBox grant revocation is off-chain too (`[25]` 2.4).
- **Outstanding signed orders:** on ERC-1271 accounts a revoke or owner change makes unfilled signatures fail at fill time (section 2); on an `ecrecover` owner-signature venue (Opinion, Polymarket legacy types) the owner key is the signer and nothing short of zeroing the allowance and moving the balance stops them. Zeroing the ERC-20 allowance is therefore **the** kill action for CLOB venues, and it must be doable by a key the attacker does not hold.
- **Counter-race:** if the hot key is the account's *root* owner (Kernel's single root validator, or a Safe owner), the attacker can transfer ownership first. Never make the hot key the only owner of anything holding more than the loss budget. (`[25]` 6.3: one ECDSA validator per Kernel account, so a second root owner is not available.)
- Kernel v4 bundle-ordering gap (TOB-KERNEL-3, `[25]` T5): revocation inside the same `handleOps` does not stop later operations in that bundle.

### 4.2 Gas overhead

- Only vendor numbers exist (section 3.4): a Safe 4337 account costs roughly 10% more per ERC-20 transfer and about 50% more to create than Kernel v2.1 (H, vendor benchmark, 2024, local simulation). Policy overhead is not published for any of the four mechanisms (NOT FOUND).
- On BNB the absolute numbers are small: Opinion's own table gives about 100,000 gas for `enable_trading()` (two approvals) and about 180,000 for `redeem()` at a 0.05 gwei minimum gas price, which it prices at $0.003 and $0.0054 at $600 per BNB (H, `docs.opinion.trade` gas-operations page; vendor estimate). Polygon, Base and Arbitrum figures: NOT MEASURED here.

### 4.3 Can a session key live in browser memory safely?

- **A secp256k1 key in JavaScript memory, IndexedDB or localStorage is readable by any script on that origin** (XSS, a compromised dependency, a hostile extension with page access). Rhinestone says so in terms (section 3.3). WebCrypto does not generate secp256k1 keys at all (M, from the API's algorithm list; not re-read), so an "extractable: false" secp256k1 key does not exist in a browser.
- **A P-256 key is the exception:** a non-extractable WebCrypto or passkey key can be *used* by hostile page script but not *copied*. The account must verify P-256: Safe's passkey signer (shared signer plus RIP-7951 precompile or the Daimo verifier fallback, H Candide docs), Kernel's WebAuthn signer (which had a critical bug in versions before `V0_0_4`, `[25]`), or Rhinestone's passkey/multisig session signers (H docs index). The precompile at `0x100` on BNB was scheduled for the Haber hardfork, mainnet 2024-06-20 06:05 UTC, via BEP-381 (H, `bnb-chain/bsc` v1.4.8 release notes; I did not confirm activation, M). Base and Polygon support: NOT CHECKED. This route moves the risk from "key stolen" to "key used while the page is open"; the on-chain limits then do all the work.
- **The repo's local-first model already has a better place for the key:** the localhost companion process (stdio MCP server, `[25]` section 8.3) with a mode 0600 file, never in the page. Prefer it. A browser-held session key should be limited to throwaway scopes (low value, short expiry), which is also Rhinestone's advice.

### 4.4 What an attacker with the session key can and cannot do (summary)

| Key type | Can | Cannot | Bounded by |
|---|---|---|---|
| AllowanceModule delegate | transfer up to `amount` per period of listed tokens to any address | approve, call contracts, sign for the Safe | `amount`, reset period, 65,534 transfers |
| Roles member | any call the role allows | anything else; change roles | role conditions, allowance |
| Smart Sessions key | allowed actions until cumulative limits or expiry; sign per signing mode | exceed limits; call non-whitelisted targets | policy state |
| Kernel permission key | calls matching CallPolicy (batched), sign ERC-1271 unless caller-restricted | other targets/selectors | per-call limits x pace |
| Order-signing key on a CLOB venue (any account type) | sign orders of any size/price/side; sell inventory to a colluding taker | pull more than `min(balance, allowance)`; move funds out if it cannot call the account | **holdings of the venue account** |
| Root owner key of a venue account | everything | nothing | the account's balance only |

---

## 5. The crucial question, answered venue by venue

The loss bound if the signing key leaks at time t is

`at_risk(t) = cash_in_account(t) + inventory_value(t) + inflow_allowed_until_revoked`

where `cash_in_account` is what the exchange can pull (capped further by the ERC-20 allowance on the BUY side), `inventory_value` is the outcome-token stock the account holds (sellable by the key through a colluding taker), and `inflow_allowed_until_revoked` is non-zero only if the leaked key can also trigger the treasury path (faucet), in which case it is at most the faucet's per-period cap times the periods before the revoke lands.

| Venue (chain) | Account type, who signs orders | On-chain call path available to the account | Signature path | What an order-signing key leak costs | Can a signing-only key exist? |
|---|---|---|---|---|---|
| **XO** (3223) | Kernel v3.1, ERC-1271 wrapped, owner = ECDSA validator (`[19]`, `[21]`) | UserOps via XO's bundler and PolicyPaymaster; funding via Hyperlane warp route from Base (`transferRemote`) | Orders; exchange needs `maker.code.length > 0` | cash + inventory in the XO account; Enable Trading in XO's own app is an unlimited approval (`[P1]` section 0.6, H) | **No.** No policy or signer module exists on 3223 and the one ECDSA validator takes the single slot (`[25]` 6.3, H) |
| **Predict.fun** (BNB 56) | **Kernel v3.1, the same implementation `0xBAC8...4b4D` and ECDSA validator `0x845A...cE57` XO uses**; order signature = Kernel `0x01 | validator | personal_sign(wrapped hash)`; owner is a Privy embedded wallet whose key the user can export; or a plain EOA (H, `@predictdotfun/sdk` 1.3.8 `Constants.js` and `OrderBuilder.js`, `dev.predict.fun`) | `setApprovals` and scoped per-operation approvals (ERC-20 USDT and ERC-1155 to CTF/NegRisk/yield-bearing exchanges), on-chain `cancelOrders`, `redeemPositions`, `mergePositions`, `convertPositions` (H) | Orders | cash + inventory in the account | **Possibly** (Kernel permission with SignatureCallerPolicy on BNB where the signer and policy contracts have partial matches); NOT FOUND whether Predict's backend accepts a permission-id-prefixed signature or a non-Privy owner |
| **Opinion** (BNB 56) | Gnosis Safe v1.3.0 from Opinion's own factory; `private_key` (a Safe owner) signs orders, `ecrecover` by the backend; "signature type 2" (H, `docs.opinion.trade` architecture and configuration pages) | Enable Trading = a Safe tx (EIP-712, relayed by the backend), `split/merge/redeem` need BNB gas (H) | Orders | cash + inventory in the Safe; the order key is a Safe owner and can also sign Safe transactions | **No** (the signer is a Safe owner by construction). If the exchange derives the Safe from the signer as Polymarket's does (`getSafeAddress(signer) == safe`, H `Signatures.sol`), a Candide Safe cannot be the maker at all (M: Opinion's contract source not read) |
| **Polymarket** (137) | Deposit Wallet (ERC-1271 with ERC-7739 wrapper) for accounts created after 2026-05-04; legacy Safe/Proxy (`ecrecover` owner) (`[25]` 4.1, H) | Wallet batches signed by the owner and relayed; funding is a pUSD transfer to the wallet | Orders; Session Keys (beta) | cash + inventory | **Yes, venue-native:** Session Keys are EOAs that "cannot withdraw", scope CLOB/Combos/All, 180 days fixed, revocable (`revokeSessionKey`), require a Builder API key and a rollout request (H, `docs.polymarket.com/trading/session-keys.md`). Not an on-chain size limit: "the doc lists no limits on order size, spend, or notional" |
| **PancakeSwap prediction** (BNB) | EOA only | `betBull{value}`, `claim` | none | n/a | Irrelevant: contract callers are rejected |
| **Trueo, Limitless EOA mode, Hyperliquid** | EOA / venue agent wallet | Plain calls (Trueo), orders (Limitless, Hyperliquid) | Orders | EOA holdings | Hyperliquid agent wallets are signing-only by design (`[25]` 4.1) |

Reading: **only the funding legs and the allowance are ever on chain**; everything about "how much did this order cost" is off chain. The one case where the account type itself offers a clean split of authority is Predict.fun (Kernel plus permission modules on BNB), and that is also the one venue whose acceptance of such a signature is unknown.

---

## 6. The guardrail pattern: Vault, Faucet, Bucket

### 6.1 Components

| Component | What it is | Holds | Key that controls it | On-chain rules (all from existing audited modules; nothing authored by us) |
|---|---|---|---|---|
| **Vault V** | A user-owned account: preferably a Candide-built Safe (Safe4337Module, owner = a dedicated PayBox credential in approval-gated mode, or the user's own wallet), or a plain EOA | The bulk of the user's stable balance per chain | Owner only; the agent holds no key that can sign for V | Owner-gated transactions only |
| **Faucet F** | A hot key (or a small 4337 account) authorized on V | nothing | the agent / local companion | Module on V: token = one stablecoin only; **amount per call <= cap_call; amount per period <= cap_day**; recipient in {bucket addresses} where the module supports it; expiry; kill by owner |
| **Bucket B_v** | The venue-mandated account (XO Kernel, Predict Kernel or EOA, Opinion Safe, Polymarket Deposit Wallet) | Only what the faucet delivered, plus positions | Order key H_v (agent-held) | Venue rules; optionally a signing-only permission (section 6.3) |
| **Allowance setter A** (only where a signing-only order key exists) | A separate key that may `approve(exchange, n)` | nothing | the local companion, rate-limited | Permission on B_v: target = collateral token, selector `approve`, spender `EQUAL` exchange, amount `LTE` cap_order, usage/rate limited |
| **Kill path** | Owner removes F's authority (revoke/delete), zeroes the exchange allowance from B_v, sweeps B_v and V | | owner (PayBox, approval-gated) | Section 4.1 caveats |

### 6.2 The faucet module, by chain (choose the first that exists on the chain)

1. **Zodiac Roles v2 on the vault Safe** (Base, Polygon, Arbitrum, BNB; Sourcify partial): role "faucet" = target stablecoin, selector `transfer`, `to` `ONE_OF` the bucket addresses, `amount` within an allowance of `refill = cap_day`, `maxRefill = cap_day`, `period = 86400`. Gives recipient allowlist and per-period cap. Costs: an extra module to deploy per Safe (a proxy of an existing mastercopy by the user, not code of ours) and a v2 audit from 2023.
2. **Safe AllowanceModule v1.0.0** (Base, Polygon, Arbitrum): delegate = the faucet's 4337 account, `amount = cap_day`, `resetTimeMin = 1440`. Strict per-day cap, freshest audits, shipped in AbstractionKit; **no recipient allowlist**, so a faucet leak sends up to `cap_day` anywhere (the cap is still strict).
3. **Kernel CallPolicy + RateLimit** on a Kernel vault (BNB: only CallPolicy v0.0.1/0.0.2): per-call `LTE` plus pace. No cumulative cap, batch multiplies; weakest.
4. **Smart Sessions** on a Safe7579 vault: `ERC20SpendingLimitPolicy` (lifetime = the session) + `ContractWhitelist` + `TimeFrame`. Re-grant daily (section 6.4). Not found on BNB or Polygon.

For BNB (Predict.fun, Opinion) no option 2 or 4 exists, so the vault faucet on BNB is Roles v2 or nothing; the realistic BNB design is therefore "dedicated bucket credential funded by hand, capped allowance, no faucet" (section 10, steps 1 to 3).

### 6.3 Signing-only order key where the account type allows it

Predict.fun's account is a Kernel v3.1 smart wallet on BNB (section 5). In principle the owner (cold) installs one permission whose signer is the agent's key, with `SignatureCallerPolicy(allowedCallers = [the Predict exchanges])` and a `CallPolicy` listing **no** callable target. That key can then produce ERC-1271 signatures the exchanges accept and **cannot** send a UserOp, approve, transfer or withdraw. A second permission (the allowance setter) allows only `USDT.approve(exchange, <= cap_order)`, rate limited. The owner key stays in PayBox, approval-gated. Unknown, and testable only with a funded throwaway account: whether Predict's API accepts the permission-id signature form; whether `approve` overwrite semantics hold for BSC-USD (M); whether the policy contracts at the partial-match addresses are the audited versions. Not recommended before a read-only module-presence check (T-G1) and a throwaway test.

### 6.4 Daily session grant (Smart Sessions variant)

Because Smart Sessions limits are lifetime, a $50 per day cap is a session that expires in 24 hours: `ERC20SpendingLimitPolicy` $50 (approvals counted), `ContractWhitelistPolicy` = the venue contracts, `TimeFramePolicy` = 24 h, `UsageLimitPolicy` = N. One owner approval per day (a PayBox approval, which fits "a handful of approvals a day" in `[safety]`). The cumulative-limit policies are exactly where Cantina found the Critical and the High (section 3.3), now fixed; this is the strongest argument to prefer Roles or the AllowanceModule for the faucet role until Smart Sessions has production history on the target chain.

### 6.5 Parameters (examples; per-token base units, note 18-decimals USDT on BNB and Predict versus 6-decimals USDC on Base and Polygon collateral to be read per chain)

- `cap_call` = the plugin's per-order cap in base units (default $10). `cap_day` = the day cap ($50). `bucket_max` = `cap_day` (never more than one day's allowance at rest). `expiry` = 24 h to 7 days. `allowance_to_exchange` = `cap_order` ($10), set by a setter key or by the owner each session, **never `max`**.
- Approvals to exchanges are ERC-20 only; `setApprovalForAll` is a one-time owner action (it cannot be capped), accepted risk = inventory.

---

## 7. How the existing caps map

| Today (plugin or relay, advisory against a compromised agent) | With this pattern | Enforced on chain? | Residual |
|---|---|---|---|
| `XO_MAX_ORDER_USD` = $10, per order | (a) allowance setter limits each exchange allowance grant to $10 where a signing-only key exists (Predict.fun, maybe); (b) otherwise the bucket and allowance bound the total | **BUY side: only through allowance and balance, and only where a separate setter exists.** Per-order notional itself: no | Orders larger than $10 cannot fill beyond `min(balance, allowance)`; a leaked key can still sign many $10 orders that each fill until the allowance is gone; SELL side unbounded by allowance |
| `XO_MAX_DAILY_USD` = $50, per UTC day | Faucet period cap $50 (Roles `period=86400`, or AllowanceModule `resetTimeMin=1440`) | **Yes for inflow** (fixed-window straddle: up to 2x in a rolling 24 h with the AllowanceModule; Roles accrues refill per elapsed period) | Inventory stock; fills from cash already in the bucket |
| Funding test cap $3, then $10, then $50/day (`[safety]`) | Same numbers as `cap_call` and `cap_day` on the faucet; the first deposit can use `cap_call` = $3 | Yes | Funding to XO: no module on 3223, and withdrawal unverified (`[P1]` H1), so the Base-side faucet is the only on-chain bound |
| Creation fee $1 and seed $10.80 counting toward the day | The fee is an on-chain call on XO (3223): no module there | **No** | Advisory |
| Short GTD expiry (300 s default) | Expiry is part of the signed order; on ERC-1271 accounts a revoke also kills it at fill time | Partly (revocation) | EOA-maker venues: bearer until expiry |
| Kill switch (`KILL`) | Software kill plus an on-chain revoke (owner removes faucet/delegate, zeroes allowance) | The on-chain half is real | Race (section 4.1) |
| Approval-gated PayBox signing | The owner key stays approval-gated; the hot keys are separate and low-privilege | Not an on-chain control | Opaque digests for `raw`; `[P1]` A4 still applies |

Net: "$50 per day" becomes enforceable on chain for **money entering the venue account** wherever a faucet module exists. "$10 per order" does not become enforceable; the closest real thing is a $10 allowance grant, which needs a separate key that can set allowances and a venue whose account permits a signing-only key.

---

## 8. What remains advisory (explicit list)

1. Per-order notional and price of any off-chain signed CLOB order (XO, Polymarket, Predict.fun, Opinion, Limitless in smart-wallet mode).
2. Selling inventory at a bad price to a colluding taker: the ERC-1155 operator approval is unbounded, so inventory stock is exposed; only its growth rate is capped.
3. Anything the agent does with a PayBox credential that it can reach under an `autonomous` grant (`[25]` T2, `[P1]` A4): a signing request outside the pattern bypasses the pattern.
4. Chain 3223 entirely: no session or policy module exists there; the bound is the funded balance (`[25]` 6.3).
5. Gas sponsorship limits (Candide gas policy) against a key that holds native gas.
6. Plugin and relay caps (`XO_MAX_ORDER_USD`, `XO_MAX_DAILY_USD`, funding caps, seed cap): enforced by software the compromised agent may bypass.
7. Venue-side logic: fees up to the operator's bound, upgradeable exchanges (`[25]` T6), resolution risk.
8. Replay and scope of a Merkle-root cross-chain signature: whatever leaves the approver did not see.
9. Any limit that depends on a module whose presence on the target chain is NOT FOUND (Smart Sessions on BNB and Polygon; AllowanceModule v1.0.0 on BNB; policy contracts on 3223).

---

## 9. Costs and who bears them

| Item | Cost | Who bears it | Source |
|---|---|---|---|
| Candide bundler + paymaster, public endpoint | Keyless, rate-limited per IP; whether mainnet **sponsorship** works on it is not stated | Nobody (rate limit) / unknown | H, `docs/wallet/api/public-endpoints.md`; M summariser |
| Candide Starter | $0; 2,500 mainnet UserOps total, 1,000 sponsored ops total (one time); testnets free; no card | The account owner of the API key | M, `candide.dev/pricing` via WebFetch |
| Candide Launch / Grow | $333 / $749 per month; 5,000 / 25,000 sponsored ops included, then $0.01 / $0.005 per op; gas passed through at cost from a deposit in the gas policy | The API-key owner. In a local-first design that is each user, or the author (which breaks "nothing the author operates") | M, same; H `docs/wallet/pricing.mdx` for the billing rules |
| Pay gas in USDT via Candide token paymaster | Token cost plus a markup; BNB, Polygon, Base, Arbitrum listed | The user | H, `1-tokens-supported.mdx` |
| Self-paid gas on BNB | about $0.003 for two approvals, $0.005 for a redeem | The user | M, vendor estimate (Opinion) |
| Roles / AllowanceModule setup | A few Safe transactions per chain; the module deployment is a proxy or a shared registry | The user | H design |
| Audits | None needed (no contract authored); but every module's audit status is in section 3 | n/a | |
| Roles v3 licence | BUSL-1.1, production use restricted until 2030-03-01 | Legal question for the user | H, `LICENSE.md` |
| Polymarket Session Keys | Needs a Builder API key and a rollout request to a Polymarket address | The user; a contact with Polymarket (not XO), flagged because the project rule is "nobody contacts XO" and this rollout step contacts someone else | H, docs |
| Engineering | Roles/AllowanceModule call builders, exposure meter, tests | The author (one-off) | |

At the plugin's volume (a handful of operations per day) the Starter allowance of 2,500 mainnet UserOps lasts on the order of months for one user (L, arithmetic from the stated totals). The sponsored 1,000 is the binding limit. Whether that matters depends on whether anyone wants gasless on BNB, where gas is a fraction of a cent.

---

## 10. What to build first

Everything is flag-gated OFF and adds no contract; each step is useful without the next.

1. **Exposure meter (read-only).** For each registry account compute, from public reads, the loss budget a leaked order key would have: collateral balance, ERC-20 allowances per known venue spender (flag `max`), ERC-1155 `isApprovedForAll`, position value, native gas balance, active modules or sessions if any. Show it beside the advisory caps and block "enable trading" when allowance is `max`. This turns the advisory cap into a measured on-chain quantity and works for every venue, EOA included. (`[P1]` A8 already reads `allowance()` and `isApprovedForAll()` for XO.)
2. **Capped-allowance approvals.** In the existing write tools, approve exactly the cap, not `max`, wherever the venue lets the caller choose: Predict.fun scoped approvals (SDK steps, H), XO (test T8 in `[P1]`), Opinion (Enable Trading amounts: NOT FOUND, relayed by the backend). This is the cheapest genuinely on-chain bound on the BUY side and needs no new account.
3. **Dedicated bucket credentials per venue** (already `[P1]` A4/O1), funded by hand in cap-sized steps. This *is* the bucket of the pattern, without a faucet.
4. **Opt-in vault and faucet, user-keyed, on Base, Polygon, Arbitrum only:** a Candide-built Safe, Safe AllowanceModule v1.0.0 (AbstractionKit already builds the calls), faucet delegate = a small 4337 account of the local companion, `amount = cap_day`, `resetTimeMin = 1440`. Roles v2 if the recipient allowlist is wanted. Treat as a decision gate for the user; it needs a Candide API key or self-paid gas per user.
5. **Later, gated on T-G1 to T-G4 below:** a signing-only Kernel permission for Predict.fun on BNB; Smart Sessions daily grants where the module exists.

**Do not build:** a universal "one smart wallet for all venues" (each venue forces its own account, section 5 and `[25]`); a cross-chain Merkle-root approval flow (blind signature); a wallet on Roles v3 until its licence and age are resolved; anything on Kernel v4 or 7702 delegation; any Safe Policies integration (not shipped); a hosted faucet or relay that holds other people's keys; a custom spending-limit or recipient-check contract (the one thing that would give an on-chain recipient check on AllowanceModule is a delegate *contract*, which Candide's own guide suggests and which this project's rule forbids).

### Cheap read-only tests, ordered

| ID | Question | How | Cost |
|---|---|---|---|
| T-G1 | Are Smart Sessions, Safe7579 launchpad, Roles v2 mastercopy, AllowanceModule v1.0.0 and the Kernel permission contracts actually **deployed** on BNB 56, Polygon 137, Base 8453, Arbitrum 42161 (code present at the addresses in section 3)? | Read-only code query on each address (the part this session could not do) | $0, no PayBox call |
| T-G2 | Does Predict.fun's API accept a Kernel signature in permission-id form, and a Kernel not owned by a Privy wallet? | Cannot be read-only; needs a funded throwaway account | skip until step 5 |
| T-G3 | Does PayBox sign the Safe4337 `SafeOp` typed data (domain chain id + module, H structure in `abstractionkit` constants) and the Kernel raw UserOp hash? | Inherited from `[25]` T-AA1; Safe's typed-data form is the PayBox-friendlier of the two | $0, one approval each |
| T-G4 | Does a venue-side `approve` on BSC-USD overwrite (so the allowance never exceeds the last grant)? | Read the token's source on the explorer | $0 |
| T-G5 | Is the BNB secp256r1 precompile live at `0x100`? | Read-only call or a BNB release/fork-status check | $0 |
| T-G6 | Does Candide's public endpoint sponsor on a mainnet without a key? | The docs do not say; a read-only `GET` cannot show it | skip |

---

## 11. Re-test of earlier findings

| Earlier finding (where) | Result now |
|---|---|
| Each venue forces its own account type (`[25]` §0.6, §4) | **Confirmed and sharpened.** New: Predict.fun's smart wallet is the *same Kernel v3.1 implementation and ECDSA validator XO uses* (H, SDK constants), so one derivation and one signing path covers XO and Predict.fun accounts in principle; that does not make them the same account (different venue registration) and Predict's backend acceptance of a self-owned Kernel is NOT FOUND. Opinion's maker is a Safe v1.3.0 from the venue's factory, signed by an `ecrecover` owner key (H docs); if its exchange mirrors Polymarket's `getSafeAddress(signer)` check (M), a Candide Safe cannot be the maker. PancakeSwap prediction rejects contract callers (H). |
| On-chain session policies cannot cap off-chain-signed CLOB orders (`[25]` §6.2) | **Confirmed from source and from Rhinestone's docs** (section 0.1). Refined: policies can restrict *who may consume* a signature (SignatureCallerPolicy), *which typed-data schema* a session may sign (Smart Sessions scoped mode, but unavailable through `signTypedData` at present), and revocation kills unfilled ERC-1271 orders at fill time; none can read amounts. |
| A grant cannot evaluate an off-chain order's size; caps are advisory (`[25]` §2.3, `[arch]`) | Unchanged. |
| PayBox signs typedData on ten EVM chains, cannot sign raw digests through WalletConnect, 3223 absent (`[25]`, `[06]`) | **Not re-testable here (no PayBox call).** Added: Candide's Safe `SafeOp` signature is EIP-712 typed data (PayBox-compatible by shape); Kernel UserOps need a raw digest signature (the PayBox-unverified path). |
| Candide public bundler/paymaster "unverified first-hand" (`[25]` §7.2) | **Now H:** keyless `api.candide.dev/public/v3/{chainId}`, rate-limited per IP, supported networks include BNB 56, Polygon 137, Base, Arbitrum, Ethereum, Optimism, HyperEVM 999 (H, developer-docs repo); mainnet sponsorship on the public endpoint is not stated. |
| Cantina titles on Smart Sessions looked unresolved (`[25]` §5.2) | **Resolved:** the reports are read; every named item is marked fixed with a PR (section 3.3). |
| Zodiac Roles "audited by G0 and Omniscia" (`[25]` §5.2) | True for v2. **New:** v3 was merged 2026-10-15, is BUSL-1.1 and was audited in Oct 2026 by a different firm (file name only). |
| Kernel v3.1 is XO's account and permission-capable (`[25]` §5.2) | Confirmed, with the addition that no audit of the policy contracts themselves was found, and `CallPolicy` checks batches call by call. |
| Safe's 4337 module is on the chains needed | **Confirmed (H):** `safe-modules-deployments` 3.0.11 lists v0.3.0 `0x75cf...c226` on 56, 137, 8453, 42161. |

---

## 12. Unverified, NOT FOUND, and open decisions

- NOT FOUND (searched: Sourcify, official deployment list): AllowanceModule v1.0.0 on BNB 56; Smart Sessions on BNB 56 and Polygon 137; Safe7579 launchpad on BNB mainnet; any policy, signer or Safe module on XO 3223; Kernel `CallPolicy` v0.0.4 on BNB.
- NOT FOUND (searched: kernel repo audit lists, kernel-7579-plugins, docs): published audits of ZeroDev's `CallPolicy`, `RateLimitPolicy`, `GasPolicy`, `TimestampPolicy`, `SignaturePolicy`.
- NOT FOUND: gas cost of any policy; Roles v2 membership expiry; whether Opinion's exchange derives the Safe from the signer; whether Predict.fun accepts non-Privy-owned or permission-signed Kernels; whether Candide's public endpoint sponsors on mainnet; Opinion's Enable Trading allowance amounts; activation confirmation of the BNB P-256 precompile.
- Inherited, not re-tested: all PayBox signing facts (`[06]`, `[25]`); XO acceptance of a PayBox-owned account (the four doors, `[P1]`); XO's exchange allowance semantics under a capped approval (T8).
- Audit PDFs were text-extracted by a script of mine; finding counts and titles above are from that text, not from the vendors' summaries; the Roles audits and Kernel core audits were not read in full.
- Decisions for the user: (1) is a Safe vault with an agent-held faucet key wanted at all, given it needs a Candide key or self-paid gas per user; (2) Roles (recipient allowlist, older audit, v3 licence unresolved) versus AllowanceModule (fresh audit, no recipient check); (3) whether to contact Polymarket for Session Keys rollout (the XO no-contact rule does not cover it, but it is a contact); (4) whether to treat "signing-only Kernel permission on BNB" as a research track after T-G1.

---

## Verification

What I re-checked after drafting, and the result.

1. **CallPolicy and RateLimit claims** re-read against the saved Sourcify source: `checkSignaturePolicy` returns `0` after `require(status == Live)` in both `CallPolicy` v0.0.4 and `RateLimitPolicy`; batches are looped call by call with no sum; `RateLimitPolicyReset` reads `block.timestamp` and imports `console.sol` and appears only on testnets in Sourcify. (H)
2. **AllowanceModule claims** re-read against `AllowanceModule.sol`: no recipient restriction, no expiry check, uint96 amount, uint16 reset minutes and nonce, fixed windows (`lastResetMin` alignment), payment to `tx.origin`. The Candide guide's "expiration controls" sentence is not backed by the contract. v1.0.0 audits: Certora (3 informational, fixed) and Nethermind NM-0993 (0 findings) text-extracted and matched against `audit.md`; audit commits dated 2026-02-19 and 2026-02-24. (H)
3. **Smart Sessions audit figures** re-read from the extracted PDFs: Cantina core (7 High, 7 Medium, 12 Low, 16 Info; fixes by PR), Cantina external policies (1 Critical, 1 High, 1 Low; fixed), Renascence (2 High, 3 Medium, 3 Low, 2 Info; update 2 Medium resolved), ChainLight 2025-07-30 (2 Medium, 1 Low, 1 Info, all patched). (H)
4. **Venue signing paths**: Polymarket `Signatures.sol` read for the four signature types; Predict.fun SDK `Constants.js`/`OrderBuilder.js` read for the Kernel domain, implementation and validator addresses and the wrapped-hash signing; Opinion pages read for Safe v1.3.0, signer versus multisig address and gas estimates; PancakeSwap `notContract` taken from the repo note, which cites contract source (H for the note's statement, not re-read at source this session).
5. **Deployment claims**: every address in section 3 was run through Sourcify all-chains; exact versus partial match is stated where it matters; Safe 4337 module v0.3.0 presence on 56/137/8453/42161 comes from the official `safe-modules-deployments` 3.0.11 package list. No JSON-RPC was used, so none of these is a code read.
6. **Candide claims**: AbstractionKit 0.4.3 README, CHANGELOG and sources read; "7579" and "session" searched in the repo; Safe Policies page quoted for its "Planned" status; pricing from the live pricing page via WebFetch (summariser-mediated, tagged M); billing rules and gas-policy fields from the docs repo (H).
7. **What I could not verify and said so**: policy-contract audits, Smart Sessions on BNB/Polygon, Predict.fun backend acceptance, Opinion exchange derivation, policy gas, Roles v3 audit text, BNB precompile activation, mainnet sponsorship on the public endpoint, all PayBox behaviour.
8. **Corrections relative to earlier repo statements**: none overturned; four refinements (Predict.fun is a Kernel v3.1 account; Candide public endpoint now first-hand; Smart Sessions audit titles resolved; Roles v3 is new and BUSL) and one flagged vendor-doc discrepancy (AllowanceModule "expiration controls").
9. **Privacy scan**: this file contains no email address, personal name, GitHub login or home-directory path; the only paths are repo-relative; no outbound request carried an identifier beyond the pinned User-Agent `insurance-markets-research/0.1` (the `gh api` login caveat is disclosed in the intro). Third-party contact addresses seen in documents were not reproduced.
10. **Scope**: only this file was written; no source, relay, test or package file was touched, nothing was installed or built, git state was not touched.
