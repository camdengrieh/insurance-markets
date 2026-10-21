# Unified accounts, move planner and natural-language operation: the decision record

Status: decision record, 2026-10-20, branch `build/xo-paybox-plugin`. This document synthesises research notes 41 (account graph), 42 (move planner) and 43 (agent operation) with notes 35 to 40 (the Candide and smart-account run) and note 25 / `docs/dapp-design.md` (the existing wallet decision). **Nothing described as "to build" exists yet.** Nothing here was signed, sent or created; no PayBox tool was called (one PayBox tool schema was loaded and read, never invoked); no account or key was made; nobody was contacted.

**User goal (2026-10-20, binding, outcome first):** "ultimately, we need whatever the best solution is for seamless moving between venues and aggregating all the accounts for a given user; the agent should also be able to operate this with natural language." Smart-account choices (Candide, Safe, Kernel) are means to that goal, judged only by whether they serve it.

**Inputs.** Notes 35 to 43 all exist (written 2026-10-20), and so does the Candide run's own summary, `docs/dapp-aa-candide.md` (written after the first draft of this record). Section 4 and decision D6 reconcile the two records, including the one point where they disagree (which account is the money hub, conflict C17). A fact-check of this document ran on 2026-10-20 and every correction it produced is applied; see "Fact-check outcome" (section 11).

**Tags.** **H** = read or reproduced first-hand by me (repo file, public page or GET, schema, measurement) or by a cited note with a primary source and a probe id; **M** = secondary, inferred, or documented but not exercised; **L** = judgement or guess. **NOT FOUND (searched: ...)** is literal. "Verified" never means "run by this project": no edge, tool or flow in this document has been run end to end by anyone.

**Source keys.** `[NN]` = `docs/research/NN-*.md` (its Verification section overrides its body); `[DD]` `docs/dapp-design.md`; `[AD]` `docs/aggregation-design.md`; `[P1]` `docs/phase1-gap-closing.md`; `[TC]` `docs/tool-contract.md`; `[BL-D]` `docs/build-log-dapp.md`; `[EA]` `docs/everyone-architecture.md`; `[RB]` `docs/runbook.md`; `[PL]` `docs/plan.md`; `[V#]` = my re-check number in the Verification section at the end.

**Binding decisions applied everywhere** (from `[PL]`, `[P1]` section 9 and the task): runnable by everyone from day zero, nothing the author must operate, no custody of other people's credentials (local-first, static client plus the user's own daemon); nobody contacts the XO team; no browser automation of any third-party site; caps are advisory against a compromised agent unless enforced on-chain; every path that can move money, sign or write to a third party flag-gated OFF (local state writes are not flagged, section 3.2 says which); no wallet contract or bridge written by us; the repository is public; PayBox terms are no obstacle but PayBox upload is not available; no fake or placeholder data.

---

## 0. Bottom line, in plain words

**The best solution is not a smart account. It is three things on the user's own machine, around one key.**

1. **An account graph** that finds every account the user has across venues and chains, reads balances, positions and open orders from public addresses wherever the venue allows it (and with the user's own key, held by their own daemon, where not), and never claims an account is "mine" without evidence a stranger could not fake.
2. **A move planner** that knows every edge between venues and chains (close or redeem, withdraw, bridge, deposit, buy), labels each with cost, time, risk, preconditions and an honest proof status, refuses to walk the user into a one-way door, and prepares one step at a time.
3. **An agent door**: a small set of typed tools so the user's own agent (Claude with the PayBox connector plus our local tools, or the dApp terminal) can say "show me everything I hold" or "move $40 from Polymarket to XO and buy this market" in plain language, while deterministic code plans, checks, sends and reconciles, and the human signs every signature in PayBox.

**The one key is the owner EOA** (a dedicated PayBox credential). Every account a venue forces on the user (XO Kernel, Polymarket Deposit Wallet, Opinion Safe, Predict.fun Predict Account) is a view derived from, or read against, that owner; we write no wallet contract, bridge or router. The hub for money is the owner's USDC on Base (`[42]` section 3, H), **held as a working float, not as savings**: the owner key's single approval of an opaque digest can move all of its Base funds (`docs/runbook.md` section 2.1 step 1), so the hub concentrates every venue's risk on one key (threat T17); fund it with what you would accept losing and sweep the rest to an address no agent can sign for. Why no smart account of ours: no venue accepts "a Safe made by us" (`[40]` item 2, `[37]` item 1); a derived account cannot cap an off-chain signed order (`[36]` item 1, `[38]` item 2); gasless is already true for orders on every CLOB venue (`[40]` item 3); and what actually blocks seamless moves is not account type but a missing executor for ordinary EOA transactions in local mode (section 3.1, gap G-A3). Section 4 says exactly which smart-account parts are worth having as a means and which are not.

### What is possible, by stage

| Stage | What the user gets | Basis |
|---|---|---|
| **Today** (existing code, nothing new) | Read XO balance, positions and orders via `xo_account`, `xo_positions`, `xo_list_orders`; the Cockpit page's Portfolio screen reads XO, Polymarket, Trueo and Pascal by pasted address (built, tested against synthetic shapes only; whether Pascal's read should default OFF until its ToS clause is cleared is a build item, section 6.2) and its wallet map shows the derived XO Kernel account per chain; dry-run prepare of XO orders. The user's agent can call PayBox's `request_transfer` / `request_swap` directly to move its own funds, **with none of our verification, caps or plan** (`[43]` 2.3, H). | `[BL-D]` section 1 and 5; `[43]` section 2 |
| **Not possible today** | Any agent-visible read of a non-XO venue (gap G-A1); a cross-venue total for the agent; any plan, route comparison or multi-step move; **local broadcast of any EOA transaction**: `xo_fund_account` returns an `io.paybox/transactionProposal` "which only the hosted plugin can return" (`[EA]` line 73, H), PayBox's `transaction` signing "returns the signed artifact without broadcasting" (schema read today, [V4]), and `[RB]` step 3 tells the user to broadcast by hand. | `[43]` G-A1 to G-A4 |
| **After the read-side build** (no live test beyond day-zero reads) | The unified graph for XO, Polymarket (derive three recipes, confirm code, read the owner), Opinion (paste, then prove with an on-chain owner read), Limitless, Trueo, Pascal (adapter OFF by default until the user clears its Platform Data clause, section 6.2), and Predict.fun / SX Bet / Hyperliquid as typed partial views; balances, positions and, where public, open orders; the agent can say "here is what I read, here is what I could not read and why". Move **plans as advice**: routes with live quotes, proof status and blockers; nothing executes. | `[41]` sections 4, 11; `[42]` section 6 |
| **After live tests MT1 to MT6** | Own-wallet USDC moves among Base, Polygon, Arbitrum, Ethereum and OP (Circle CCTP v2, Across), to and from BNB (Across; deBridge and LI.FI only if the user accepts decision D3, opaque calldata; Polymarket's Bridge; never CCTP), Hyperliquid in and out, Polymarket in (and out only if the user accepts decision D4 below: a Relayer key and provider-issued addresses), Predict.fun / Opinion owner-direct where the PayBox EOA is the owner. Each step prepared just in time, decoded and re-hashed before send, PayBox-signed, sent once, reconciled by balance reads. | `[42]` sections 4, 12, 13 |
| **After T0 to T8 (the XO tests)** | Base to XO funding credited, XO orders and redeem. **XO exit only if T4 passes.** Until T3a and T4 are recorded, XO stays a capped one-way spoke ($3 per transfer, $10 lifetime). | `[P1]` section 6; `[42]` 6.6 |
| **Not at all** | XO to anywhere except Base **with our tools** (our `xo_withdraw` can only reach Base; XO's own web app offers other destination chains, which a third party cannot drive, section 2.2); a sponsored XO withdrawal (the paymaster refuses `transferRemote`); CCTP for USDC on BNB Smart Chain (Circle's page, read today: "supported on all CCTP domains except BNB Smart Chain"); moving an outcome position to another venue (close or redeem, move cash, re-enter); atomic cross-venue legs; programmatic Kalshi, Polymarket US, Novig, OG, ProphetX, Gemini or UDX; opening new positions from a close-only jurisdiction; any claim that a Kalshi account and a wallet are the same person. | `[42]` section 12; [V1] |

### What to build first

1. **Make `tools/list` fit and the tool set agent-sized** (envelope-only `outputSchema`, profiles, byte-budget test). Re-measured today and again by the fact-check: the 36 tools are 268,567 bytes, 6,423 over the 256 KiB hosted limit ([V3]). Small, needs nothing else.
2. **The pure graph core and the derivers** (`Reading`, control grades, the three Polymarket recipes, the existing Kernel derivation) with the on-chain vectors the notes captured. No network.
3. **The readers, the Accounts screen and the read-only `acct_*` tools**, so the agent can answer "what do I hold, where, and what could I not read".
4. **Live test MT1** (does PayBox sign a plugin-built EIP-1559 `transaction` intent, and does local broadcast work?). It costs gas in cents and gates every non-XO executed move, so run it before building the executor.
5. **The read-only planner** (`move_routes`, `move_plan`) with CCTP, Across, Hyperlane quoters; then the `evm_tx` executor and `move_prepare` / `move_submit` for those three rails only; aggregator calldata, Polymarket, Hyperliquid, Opinion and Predict behind their own OFF flags later.

Section 7 turns this into work packages with file ownership and acceptance tests; section 8 lists the seven real forks.

---

## 1. The unified account graph

### 1.1 Model

A graph, not a list of addresses. Source of truth: `[41]` sections 3 and 5 (H for the design; the types are a design sketch).

- **Owner**: something the user can sign with (the PayBox EVM address, a Solana key, an embedded wallet, or a venue login that is not an address).
- **Account**: something that holds value or positions (the EOA itself, an XO Kernel account, a Polymarket Deposit Wallet, a Safe, a Hyperliquid master or sub-account, a Pascal account, a custodial USD ledger).
- **Edge**: why the user can act on the account, carrying evidence: `self`, `derivation`, `chain_read`, `venue_attestation`, `signature`, `user_assertion`. Other edge kinds: `delegates` (Hyperliquid agent, Pascal trading key), `sub_of`, `custody_at` (value credited by a venue, not at the address), `deposit_target`.
- **Control grade** (computed from edges, never stored or settable by any caller): `proven`, `chain_owned`, `venue_attested`, `derived_origin`, `watch_only`, `conflicted`. Only `proven` and `chain_owned` count toward "my total" by default; a contradictory edge always wins (fail closed).
- **Reading<T>**: every fact is `ok | unknown(reason) | refused(reason) | not_applicable`; arithmetic over a non-`ok` value does not type-check; missing is never zero.
- **Snapshot**: immutable, content-addressed (`id = sha256(canonical JSON)`) so an audit entry names exactly what the user and agent saw.

**Why derivation is not control (live evidence).** The Polymarket Safe derived from the public Anvil test key exists on Polygon, but `getOwners()` now returns a different single owner (nonce 34) (`[41]` 3.3, probe U7, H). So the graph re-reads ownership on every snapshot and before any move leaves draft, and a mismatch makes the account `conflicted` and removes it from totals and from every move source.

**Custody is part of every balance.** One live XO creator account held 4,704.236695 USDC.e on chain (explorer) while the orderbook said `cash_balance "0"` and `smart_account: null`, and the Data API portfolio was empty (`[41]` U15, H, cited not re-probed). So `Balance` carries `custody` (`self_account`, `venue_credited`, `venue_ledger`, `escrow`, `order_reserve`); totals are keyed by `(asset, custody)`; stablecoins are never assumed equal to dollars; play money and TYD (an ERC-4626 share) never mix with real USD.

**Empty is not zero.** Polymarket `/v2/value` answers 200 `0.0` for addresses that never existed (`[41]` U20, H). Without a registration signal (XO `smart_account`, Pascal `has_deposited`, Perps `registered`) the answer is `no_activity_seen`, not `verified_empty`.

### 1.2 Eligibility rules the planner uses (my reconciliation, see conflict C5)

| Role in a move | Required |
|---|---|
| **Source account** | grade `proven` or `chain_owned`; `free` balance `ok` and fresh, in the same `AssetRef` as the move (no unit conversion inside a precondition); ownership re-read in this snapshot |
| **Destination account** | code present on the destination chain (`eth_getCode`, never an explorer flag) **and** either grade `chain_owned` / `proven`, or, for the XO Kernel account only, `derived_origin` plus code present while the validator-owner read on chain 3223 is still NOT TESTED, under recipient class R1 and the XO test caps. A Safe or Deposit Wallet at a derived address is never a destination on derivation alone (the Anvil Safe counter-example) |
| **Provider-issued transit address** (Polymarket Bridge) | class R3 only: issued for this plan, host-allowlisted, shown in full, test amount until an `observed` edge fact exists |
| **Anything an agent, market text, a web page or a provider message names** | never |

### 1.3 Per-venue read matrix

"PUB+" = public by address and browser-readable; "daemon" = public but the browser is blocked (no CORS), so the user's local daemon reads it; "KEY" = the user's own credential in their daemon vault. Transport classes and probe ids are in `[41]` sections 4 and 11; "[V#]" marks what I re-checked today.

| Venue / source | Find the accounts an owner controls | Balances | Positions | Open orders | Fills / history | Day zero? |
|---|---|---|---|---|---|---|
| Any EVM EOA | identity | RPC `balanceOf` (user-chosen RPC) | n/a | n/a | n/a | yes |
| **XO** (3223, Kernel v3.1, USDC.e 6 dp) | **derive offline** (`src/xo/account/derive.ts`; 2,627 of 2,627 accounts seen in six sampled windows re-derive, a sample and not a census, M `[19]`); present via explorer `smart-contracts/<a>`; registered via orderbook `balance-allowance` (daemon); owner read on 3223 NOT TESTED | explorer on-chain (PUB+) and orderbook cash (daemon), kept as separate custodies | Data API `/users/portfolio` (PUB+; **populated shape never observed**, only empty) | KEY (XO HMAC triplet, gated by the XO doors) | from portfolio only | partial |
| **Polymarket** (137, pUSD 6 dp) | **derive three recipes offline** (Deposit Wallet beacon and UUPS, Safe, Proxy), confirm code, read `owner()` / `getOwners()`; Gamma profile as hint only | pUSD `balanceOf` | Data API v2 (PUB+) | KEY (CLOB L2 credentials) | Data API v2 (PUB+) | yes |
| Polymarket **Perps** | `info/registered` public GET: returned `{"registered":true}` with `ACAO *` for the Anvil address ([V6], H) | KEY | public POST snapshot (docs, not tested) | KEY | KEY | registration only |
| **Predict.fun** (56, USDT 18 dp) | candidate Kernel derive + `ecdsaValidatorStorage` read; deposit address must be pasted; real accounts' index/hook unverified | USDT `balanceOf` | **KEY** (`x-api-key`; 401 observed in `[41]` U10) | KEY | KEY | partial |
| **Opinion** (56, USDT 18 dp) | account is a **Safe 1.3.0 or the EOA itself**: the SDK architecture page documents both setups ([V5], H); Safe derivation from the EOA NOT FOUND; paste, then prove by `getOwners()` | USDT `balanceOf` on the address that holds funds | PUB+ `GET /positions/user/{walletAddress}` keyless, ACAO reflects origin, observed 5 req/s (`[41]` U8); the docs do not say which address it wants ([V5]) so the graph asks EOA and Safe | KEY (self-service key) | PUB+ `/trade/user/{wallet}` | partial |
| **Limitless** (8453) | EOA identity | RPC | daemon (no CORS) | KEY | daemon | yes |
| **Trueo** (8453) | any holder | RPC | RPC (`getUserPosition`) | n/a (AMM) | log scan opt-in | yes |
| **Hyperliquid HIP-4** | `userRole`, `subAccounts` (POST) | `spotClearinghouseState` (POST) | outcome tokens as spot balances `+<enc>` (POST) | `openOrders` public by address (POST) | `userFills` | **docs only**: POST not tested, POST CORS unknown |
| **Pascal** (Solana) | owner pubkey | `collateral_usd` + pending deposits | `positions[]` | **`orders[]` public by owner** | per `[26]` | read path yes, **adapter OFF by default** until the user clears the Platform Data clause (section 6.2, C6) ([V6]: `GET data.pascal.trade/api/v1/accounts/{owner}` returned 200, `ACAO *`, `cache-control no-store`, `has_deposited:false` for the System Program pubkey) |
| **SX Bet** (4162) | proxy derivation NOT FOUND; paste, `getOwners()` on SX RPC NOT TESTED | explorer balance of pasted proxy | KEY | KEY | KEY | partial |
| **Manifold** | username, no wallet link | Mana only, never summed with real assets | PUB+ | n/a | n/a | yes |
| **Kalshi, Gemini, OG/CDNA, Novig, UDX, ProphetX, Polymarket US** | not addresses: a `venue_ledger` account created by the user putting a key in the daemon vault | KEY | KEY | KEY | KEY | flags OFF; memory-only for restricted market data; effectively N/A for ineligible users |
| **PayBox / World** | the agent's own `list_credentials` / `get_portfolio` output, imported as watch-only data | T3 import | T3 import | T3 import | T3 import | yes |
| Safe Transaction Service | owner-to-Safes candidate list only; keyless quota inferred from headers (5,000 per about 30 days per IP, M); **opt-in** | n/a | n/a | n/a | n/a | opt-in |

**Correction this record carries forward:** `[26]` section 13 said no venue offers public orders by address; Pascal does (re-confirmed today), and Hyperliquid's `openOrders` is public by address per its docs (`[41]` section 2).

### 1.4 Day zero versus keyed

- **Day zero, no credential, no venue contact beyond reads of public addresses:** everything marked yes or partial above (Pascal once its clause is cleared and its adapter switched on) using only the owner address the user pastes (or the agent imports from `list_credentials`). Static page or local daemon; the user may supply their own RPC.
- **Needs the user's own key, held in the daemon vault, never the page, the model's context, an export or the author:** XO and Polymarket open orders, Predict.fun positions, Opinion open orders, SX Bet user routes, Limitless open orders, every account-bound USD venue.
- **Typed gaps, not empty tables.** A venue that cannot be read gives a `Gap` with a fixed-text reason and a fix (`paste_address`, `run_daemon`, `add_own_key`, `enable_venue`). The agent must lead its answer with coverage ("read: ...; not read: ... (reason)").

### 1.5 Linking: proof, not claims

Challenge-by-signature (`[41]` 7.2): a fixed-template EIP-191 / ERC-1271 / Ed25519 message with a single-use local nonce and expiry, no transaction, spender, amount or URL; verified locally; signature bytes and message discarded, only `messageSha256`, scheme and times stored; nothing sent to any server. For the PayBox owner it is `request_wallet_sign` with `op: "message"` (EVM) or `op: "solanaMessage"` (Solana) (both ops confirmed in the live schema, [V4]); whether PayBox returns a 65-byte `r||s||v` that `ecrecover` accepts is **untested (LT-UA3)**. Until it passes, the PayBox owner can still be proven through any other signer the user holds, otherwise stays `watch_only`. The agent can request the challenge text and relay a signature; only the daemon verifies, and no tool sets a grade. Imported agent data caps at `watch_only` and is never merged with venue-read data.

### 1.6 Privacy

| Data | Lives | Never |
|---|---|---|
| Owner and account addresses, labels, edges, grades | the user's browser (IndexedDB) or local daemon; exportable as addresses + labels + proof hashes only | an author server, a URL, analytics |
| Venue credentials | daemon vault (AES-256-GCM, account address as AAD) | the page, the model, any export |
| Audit trail | local append-only, hash-chained | any remote service |

Honest leak surfaces, stated in the UI: each venue read tells that venue the IP and address; the RPC provider sees every address checked (batches reveal the whole candidate set to one host; user-supplied RPC recommended); the Safe Transaction Service sees an owner address (opt-in); **the model provider sees whatever an `acct_*` tool returns, and PayBox's own `get_portfolio` already puts the user's addresses in the model context**, so `redact` mode (`0x1234...abcd` plus a local alias) is a courtesy that the notes specify but that does not remove the exposure. No third-party fonts, scripts or analytics in the page.

---

## 2. The move planner

### 2.1 Shape: hub and spoke

```
 Solana --CCTP (fast ~8 s)-- Ethereum / OP / Arbitrum -- Polygon -- Base  <== HUB: owner EOA USDC
   |                              (CCTP v2 burn-and-mint)              |
 Pascal (deposit PDA)         Hyperliquid (HyperCore)                  | Hyperlane warp route (XO's own;
                               <- CCTP forwarder, no minimum           |  in: permissionless, 0 fee, ~14 s;
                               <- Bridge2 (Arbitrum, >= 5 USDC)        v  out: UNPROVEN)
 BNB 56 (USDT/USDC 18 dp) <-- Across / deBridge / LI.FI / Polymarket Bridge --  XO 3223 (Kernel acct, USDC.e)
   |-- Predict.fun (Kernel, Privy owner)        (no aggregator lists 3223; CCTP has no BNB USDC)
   '-- Opinion (Safe or EOA)
 Polymarket Deposit Wallet (Polygon, pUSD) <-> Polymarket Bridge API (provider-issued addresses)
 Custodial USD venues: manual only
```

Chain coverage (live GETs 2026-10-20, re-fetched by the fact-check, [V9], H): LI.FI 65 EVM chains (69 with the non-EVM chain types requested), Relay 60, Across 24, deBridge 18; none lists 3223; all list Base 8453 and BNB 56. Circle: BNB Smart Chain is "USYC only" ([V1], H, re-read as raw Markdown; Iris answered HTTP 400 "Invalid source/destination domain id" for Base to domain 17 and 200 `minimumFee 1.3` for Base to Polygon). Circle now lists about 30 CCTP domains, so the CCTP row below names a subset.

### 2.2 Edge table with proof status

Proof vocabulary (`[42]` section 1): **verified-docs** (an official document says so and was read), **verified-chain** (code, state, events or a simulation on chain), **unproven** (mechanism specified, one link never observed), **impossible** (blocked by a stated fact). Executability classes: **E2** existing prepared items (XO); **E2t** new prepared EVM transaction (`tx`); **E2v** typed data a venue API accepts; **E3** PayBox-native `request_transfer` / `request_swap` (PayBox builds; we can only pin arguments and reconcile); **E4** manual (human in a venue UI); **E5** impossible. Cost and time figures are $100 samples from 2026-10-20 (`[42]` 5.2, M here), quotes not guarantees.

| Edge | From to | Mechanism | Class | Cost / time (sample) | Proof | Main risk |
|---|---|---|---|---|---|---|
| `CCTP.STD` / `CCTP.FAST` | USDC among Ethereum, OP, Arbitrum, Base, Polygon, Avalanche, HyperEVM, Solana and about 20 more CCTP domains (Unichain, Linea, World Chain, Sonic, Ink, Monad ...; never BNB) | `approve(exact)` then `TokenMessengerV2.depositForBurn`; Iris attests; mint by anyone or Circle's forwarder | E2t | standard 0 bps; fast 1.3 to 1.4 bps (Iris Base to Polygon 1.3 re-read [V1]); forwarding about $0.06 to $0.08; fast about 8 s, standard 15 to 19 min (Polygon about 8 s) | verified-docs + verified-chain (contract code present on Base) | burn irreversible; wrong `mintRecipient` loses funds; destination gas trap unless forwarded; attestation expiry NOT FOUND |
| `HYP.BASE_XO` | Base USDC to XO Kernel account | `approve(router)` then `transferRemote(3223, bytes32(account), amount)`, `msg.value` 0 | E2t (today `xo_fund_account` proposal, not executable locally) | 0 fee; median 14 s, max 27 s (n=253) | mechanism verified-chain `[20]`; **credit of a third-party transfer unproven** (T3a) | wrong recipient encoding strands funds; account must be deployed first (T1) |
| `XO.EXIT.H1` | XO to Base | paymaster-less UserOp `[approve, transferRemote(8453, owner)]` | E2 (`xo_withdraw`, `ENABLE_WITHDRAW`) | unknown | **unproven** (T4); the paymaster refuses `transferRemote` so a sponsored exit is **impossible** (`[20]` section 7) | exit may never exist for outsiders |
| `XO.EXIT.APP` | XO to a destination chain the XO app offers (XO's withdraw docs say "a supported destination chain"; the list is not fixed here) | withdrawal in the XO web app | E4 | shown in XO's flow | **documented plus chain-observed for XO-initiated transfers** (230 XO-to-Base Hyperlane messages, median 12 s, 0 unmatched, `[20]`, H there), **not reproducible by a third party**; whether a PayBox-owned account can sign in is unknown | human step |
| `XO.EXIT.DIRECT` | XO to Base | owner EOA calls `execute` itself | none | needs native XO gas | **impossible for an outsider** (no way to get native XO; 3223 not in PayBox's catalog) | n/a |
| `ACROSS` | EVM to EVM incl. BNB | SpokePool `deposit*`; fillers front funds; destination gas not needed | E2t (decodable) | Base to Polygon $0.0156 in `[42]`, $0.0179 (`relayFeeTotal` 17851 on $100) when re-read by the fact-check; est. fill 1 s; min deposit $0.50 (500039 units) ([V9]) | verified-docs + live quote; **the API's approval transaction was an unlimited approve** (`[42]` T-ACROSS, H there) so we re-encode an exact approval | refund-page body unread; contract pins must come from Across docs |
| `LIFI` / `DEBRIDGE` / `RELAY` | EVM to EVM incl. BNB | aggregator-supplied calldata to a router | E2t, **opaque** | LI.FI about $0.25 fixed; deBridge about 0.6% impact + 0.001 ETH fix fee as `tx.value`; Relay quoting keyless unproven | verified-docs + live quote | opaque calldata; default OFF (`ENABLE_MOVE_OPAQUE_ROUTES`) |
| `PM.DEPOSIT` | any supported chain to Polymarket Deposit Wallet (pUSD) | Bridge API issues a deposit address; user sends | E3 / E2t, R3 recipient | min $2 on most chains (Base, Polygon, Arbitrum, Optimism, BNB, Solana, HyperEVM, Monad, Ink, Hypercore), **$3 on Ethereum mainnet**, $3.6 on two rows; a few minutes | verified-docs; supported-assets GET live (237 rows, [V10]) | provider-issued address cannot be cross-checked on chain; restricted jurisdictions |
| `PM.DEPOSIT.HYPERCORE` (candidate) | HyperCore balance to Polymarket Deposit Wallet | the supported-assets list has a "Hypercore USDC" row (chain 1337); how a HyperCore balance is sent to the issued address is **NOT FOUND** (not read) | none yet | unknown | **unproven candidate**; not planned until the sending mechanism is read | provider-issued address (R3); one-way door risk until tested |
| `PM.WITHDRAW` | Polymarket to owner EOA on chosen chain | pUSD `transferErc20` batch to a bridge address, unwrap, swap, bridge | **E4 manual first**; E2v later | "instant and free" per docs; example app fee 0.3% | verified-docs; **needs a Relayer/Builder API key the user makes in Polymarket's UI** ([V7], H) | pUSD is not USDC; pool exhaustion; key custody (decision D4) |
| `PM.REDEEM` / `PM.ORDER` | inside Polymarket | Deposit Wallet batches / CLOB orders | E4 / E2v later | UMA resolution about 2 h, disputes 4 to 6 days | verified-docs, unexercised | geoblock by request IP |
| `HL.IN.CCTP` | Arbitrum/Base/etc USDC to HyperCore | `depositForBurnWithHook` to the CCTP forwarder, hook data carries the HyperCore recipient | E2t | no minimum; forwarding $0.20; 1 USDC activation fee on the first outbound action ([V8], H) | verified-docs | recipient is a field inside bytes: must be decoded and required to be R0/R1/R2 |
| `HL.IN.BRIDGE2` | Arbitrum USDC to Hyperliquid | wallet-connected deposit | E2t | Arbitrum gas | verified-docs (`[42]`: deposits below 5 USDC are lost) | **hard block under 5 USDC** |
| `HL.OUT.W3` / `HL.OUT.CCTP` | HyperCore to EVM | user-signed EIP-712 `withdraw3` ($1, about 5 min) / `sendToEvmWithData` | E2v | $1 / $0.20 to $1.20 forwarding | verified-docs; PayBox `typedData` for chain id `0xa4b1` untested (MT6) | an API/agent wallet cannot withdraw to another address |
| `PREDICT.WITHDRAW.DIRECT` | Predict wallet to EOA | owner EOA calls the Kernel `execute` | E2t | BNB gas | source-verified (Kernel v3.1 ECDSA validator hook), deployed bytecode unread (M); **only if the PayBox EOA is the wallet's owner**, otherwise impossible for us (Privy-held owner) | needs BNB gas |
| `OPINION.WITHDRAW.SAFE` | Opinion Safe to owner | Safe `execTransaction` or builder-mode `build_withdraw_tx` | E2t / E2v | BNB gas, or sponsored via builder | verified-docs (builder access conditions unread) | EOA-funder setups need no edge |
| `PBX.TRANSFER` / `PBX.SWAP` | own wallet, any PayBox-supported pair | PayBox builds and sends | E3 | route set and price **NOT FOUND**; `request_swap` parks a real request, it is not a quote | unproven at pair level | cannot verify what PayBox builds |
| `XO.DEPLOY_ENABLE`, `XO.ORDER_*`, `XO.REDEEM` | inside XO | existing prepared items | E2 | $0 (sponsored) | gateway acceptance unproven (T1 to T3b, T5) | the four XO doors |
| Positions to another venue; atomic cross-venue legs; XO to anywhere but Base; BNB USDC via CCTP; custodial USD venues | | | E5 | | **impossible** | stated in the plan, never planned |

### 2.3 Plan object

The Move Plan generalises the Leg Plan of `[AD]` 6.3 (a leg is a step of kind `order`) and extends the existing `Prepared` item rather than replacing it (`[42]` section 7). Fields that matter:

- Plan: `plan_id`, `plan_hash` (hash of the canonical plan, binds approval, prepare and submit), `graph_hash`, `registry_hash`, `planner_version`, `valid_until` (default 120 s), `mode` (`proven_only` or `experimental`), `jurisdiction_attested[]` (the user attests, the planner never infers location), ordered `steps`, `totals` (fees, gas, friction %, time p50/p90/worst, signature count, opaque-step count), `exposure` (seconds in third-party hands, nodes without a proven exit, one-way doors), `rejected_alternatives` (up to 3, with reason codes, so "why can't I go XO to Polygon directly?" has a true answer), `caps`, `taint`, `confirmations_required`, `warnings`, `notices`.
- Step: `edge_id`, `kind`, `class` (E2/E2t/E2v/E3/E4), `from`/`to` node refs, `amount_in`, `expected_out`, `min_out`, `fee_usd`, `gas_usd`, `native_value_wei` (non-null only for allowlisted edges), `time`, `proof`, `edge_fact` (`unproven` / `observed` / `trusted` for this user), `preconditions[]` each `met | unmet | unknown`, `recipient {class R0..R3}`, `executor`, `prepared_ref`, `settle_when`, `abort_if[]`, `on_failure` (`unchanged` / `in_transit` / `stranded` / `unknown`), `point_of_no_return`, `unwind`, `state`, `evidence[]`.
- The agent writes only a typed **Goal** (`transfer`, `fund_and_buy`, `buy`, `close_positions`, `setup_trading`, `revoke_trading`, `arb_legs`) plus display-only `user_words`; amounts are decimal strings or `"all"` / `"50%"` resolved by the planner from a read. Everything money-relevant is produced by code.

### 2.4 Planner algorithm and the rules that make it honest

1. **Pure and read-only.** `plan(goal, world) -> ranked plans`; sends nothing; reserves nothing (reservations belong to `prepare`, otherwise a loop of plan calls could starve the day cap).
2. **Bounded enumeration** of simple paths, depth at most 5, over under 60 nodes and under 150 edges; each edge exposes `quote(a) -> {out, fee, gas, time p50/p90/worst, min_out, valid_until}` from a keyless GET adapter (CCTP Iris fees, Across suggested-fees, deBridge create-tx GET, LI.FI quote GET budgeted from the `ratelimit-*` response headers read at run time (on 2026-10-20 the keyless limit was 75 per window on `/quote` with a reset of about 75 minutes, and 100 per 60 s on `/chains` and `/status`, [V9]; never a hard-coded figure), Hyperlane static zero plus a router preflight).
3. **Hard filters**, each recorded for "why not": kill switch or flag off; edge `impossible`; precondition unmet and not repairable inside the plan; credential missing; jurisdiction not attested for a node entered; amount below an edge minimum or above a cap; **no-one-way-door**; destination close-only.
4. **Proof class**: default `proven_only`; `allow_unproven` (explicit, per call) admits unproven edges capped at the test amount and marks the plan `experimental`.
5. **Objective**: `cheapest` (min total friction at p90, default, subject to a time ceiling), `fastest`, or `safest`; ties break on fewer hops, fewer signatures, fewer opaque steps. The planner ranks with its own time weight: LI.FI's default Base to Polygon pick was a 1,080 s route.
6. **No-one-way-door.** For any node `N` on or at the end of a plan, `exit_proven(N)` needs every exit edge verified and an `observed` user edge fact at the amount, or the amount is at most the test amount. Otherwise the plan is refused (or capped, with a second confirmation). Today this holds XO to the existing $3 per transfer and $10 lifetime.
7. **Just-in-time preparation.** Approving a plan authorises preparing step 1 only. Each later step is re-quoted and re-checked after the previous step settles; if the remaining outcome is worse than `min_out` or a precondition changed, the plan pauses and re-plans. The agent never holds a chain of pre-signed transactions (digests commit to nonces, deadlines and gas; PayBox approvals last about 10 minutes and are operation-bound; prepared items live 300 s).
8. **Repair steps** are inserted, not failed: `allowance < amount` adds `APPROVE_EXACT`; undeployed XO account adds `XO.DEPLOY_ENABLE`; no destination gas prefers forwarding or Across, else a manual "obtain gas" step (decision stays "stop and ask"); a new HyperCore account requires `amount >= 1 USDC + fees`.
9. **After `ambiguous` or `pending`, never re-issue the write.** Read status, resume from the observed state. Idempotency key `plan_id + step + attempt`; the relay's `sending` marker is written before every broadcast or POST.

### 2.5 Caps, allowlists and recipients

Limits bound **what our relay will prepare**. They do not bound what an agent with a signing grant asks PayBox to sign directly (section 6). Defaults are **L-grade** judgement calls awaiting decision D2; env can only lower them.

| Limit | Default | Notes |
|---|---|---|
| Per plan (`value_in_flight_max_usd`) | $50 | resolves conflict C2 (note 42 said $100; note 43 said $50; I take the lower) |
| Per day (moves) | $50 | separate durable counter from the $10 per order / $50 per day trading caps; a restart cannot reset it |
| Proof-gated per-step ceiling | `unproven`: min($3 test amount, plan cap); verified in registry but never run by this user: $5; `observed`: $25; `trusted` (2 verified runs of at least $5): plan cap; `impossible`: refuse | folds note 43's proof ladder and note 42's first-use $5 and edge-fact ladder into one rule |
| Into XO | existing: $3 per transfer, $10 lifetime until `FU6`, `FU7`, `FU9` recorded | the planner calls the existing funding ledger, never bypasses it (`[TC]` caps) |
| Friction ceiling | 1.0% of amount plus $1.00 | beyond it an extra confirmation line |
| Quote age at prepare | at most 60 s | re-quote otherwise |
| Fee ceiling per tx | `maxFeePerGas <= 2x` estimate, gas cost at most $2 | blocks a fee-burn construction |

**Recipient classes.** R0 the owner EOA; R1 a deterministic account derived from the owner (XO Kernel account; Polymarket Deposit Wallet only when `chain_owned`), recomputed locally and proven deployed; R2 a registered venue account the user confirmed once in the page (Opinion Safe, Predict wallet, HyperCore address = owner, Pascal PDA); R3 a provider-issued transit address (single-use, shown in full, capped); anything else is refused. CCTP `mintRecipient`, `destinationCaller`, and Hyperliquid hook-data recipients are fields inside bytes: the decoder extracts them and requires R0/R1/R2.

**Pinned allowlists** (in code, strict EIP-55, each with source and a code-hash check where code is stable): tokens with decimals from a local registry **never from a provider** (BNB USDT and USDC are 18 decimals; a 10^12 error is one field away); spenders for `approve` with `amount == amount_in` exactly (never max; Across's own approval transaction was unlimited); selectors; native value 0 except a per-edge allowlisted maximum (deBridge `fixFee`); hosts https-only. A provider-supplied unlimited approval is replaced, not signed. Aggregator calldata is a separate class that needs `ENABLE_MOVE_OPAQUE_ROUTES`, simulation of balance deltas and recipient events, and a cap on native value.

**Checks at submit, not only at prepare.** Decode the returned `serializedTransaction`; require chain id, nonce, `to`, `value`, `data`, gas and fee fields to equal the prepared item byte for byte; recover the signer and require it equals the owner; re-run allowlists and caps on the decoded transaction; recheck kill switch and flags; check the nonce is still the account's next nonce; only then broadcast, once. A mismatch refuses and records `signature_mismatch`.

### 2.6 Failure and unwind

Every plan ends in or can fall back to a **rest node** (an owner-controlled account with a proven exit, usually `owner@<chain>:USDC`). Each step declares `abort_if`, `on_failure`, `point_of_no_return` (true after a CCTP burn confirms, after `transferRemote`, after a provider address receives funds) and `unwind`. The full catalogue of 20 failure cases is in `[42]` section 14; the ones the user will meet first: CCTP burned but attestation slow (wait, never re-burn); mint needs gas the EOA lacks (anyone may call `receiveMessage` unless `destinationCaller` is set, or plan with forwarding); Hyperlane dispatched but not delivered in 10 minutes (check `Mailbox.delivered(messageId)`, never resend); a provider returning a different address on a second call (refuse); PayBox signature differs from the prepared transaction (refuse to broadcast, tell the user to revoke the grant).

---

## 3. Natural-language operation by the user's own agent

### 3.1 Findings that shape the surface (re-verified where marked)

| Gap | Fact | Consequence |
|---|---|---|
| G-A1 | no agent tool reads a non-XO venue; the unified Portfolio exists only in the browser page (`app/src/features/portfolio/readers.ts`, H) | "show me everything I hold" is XO plus PayBox balances only |
| G-A2 | `xo_positions` rows carry no expiry; `expires_at` lives in `xo_get_market` | "close what expires this week" is N+1 reads |
| **G-A3** | **no local-mode executor for an EOA contract call**: `xo_fund_account` proposals are hosted-only (`[EA]` line 73), PayBox `transaction` is not broadcast (schema, [V4]; its docs say the op returns `{serializedTransaction}` "ready for eth_sendRawTransaction", documented and never tried, [V11]), `[RB]` says broadcast by hand | the largest functional gap for seamless moves; fix is the `evm_tx` executor |
| G-A4 | plan state lives only in the chat | a compaction loses where a six-step move stood; fix is a daemon-owned plan store |
| G-A6 | `tools/list` is 268,567 bytes with 36 tools, 6,423 over the 256 KiB hosted limit; 168,601 bytes (62.8%) is `outputSchema` | re-measured identically today ([V3]) |
| G-A7 | agent-direct PayBox calls bypass every control we own | only host-side controls and PayBox's own approval can bound it |
| (new) | **the Cockpit daemon has no `/mcp` endpoint in this build** (`[BL-D]` section 5: "agents use `node dist/local.mjs shim`"; `bridge/main.ts` prints "no MCP endpoint in this build"); the agent path is the stdio shim forwarding to `POST /ui/tool` with the agent token, or the plain stdio server with an embedded relay | note 43's "make `agent` the profile of the daemon's MCP endpoint" must be applied at the shim's `tools/list` and in `src/local/server.ts`; see C6 |

The size limit binds only the hosted runner, which is parked (PayBox upload is not available). Locally there is no hard cap; the cost is model context, and Claude Code defers tool definitions by default (names and server instructions only at session start, `[43]` 2.4). I keep the build inside 256 KiB anyway so the hosted path is not foreclosed.

### 3.2 Tool surface: 11 new tools, one naming scheme

The three notes named overlapping tools differently (`ua_*` in 41, `mv_*` in 42, `acct_*` / `move_*` in 43). This record adopts **`acct_*` and `move_*`** (conflict C1). Existing tools keep their names and classes. Classes are the existing `read` / `prepare` / `submit` of `bridge/tool-classes.ts`; an unlisted tool is denied and a test fails the build if the plugin registers a tool the table lacks.

**What "flag-gated OFF" covers (C9).** Every path that can move money, sign, or write to a third party has a flag that ships OFF (`move_prepare`, `move_submit` per step). Four new tools only write **local state** and have no flag: `move_plan` (stores a plan; no reservation), `acct_propose_binding` (puts an item in front of the human; applies nothing), `move_report` (records an agent-asserted fact; never advances a step) and `move_abort` (can only reduce risk). `move_plan` stays class `read` as a deliberate exception so that advice-only planning works for a read-scope token; its store must be bounded (bound set by UW8) and its entries are inert until a human approves in the page. The three others are class `prepare`. This is a decision flagged for veto in section 8, not a claim that no tool writes anything.

| New tool | Class | Flag | Replaces / merges | Purpose |
|---|---|---|---|---|
| `acct_graph` | read | none | `ua_list_accounts`, `ua_discover`, `ua_get_snapshot`, `ua_explain_gap` | owners, accounts, `control` grade, deployment/registration, `can_receive`, gaps (fixed text + fix), posture, flags and caps read-only; `refresh`, optional `redact` |
| `acct_portfolio` | read | none | `ua_get_balances/positions/orders` | balances, positions (with `expires_at`, `claimable`, `closable.via`), open orders, `coverage` per (venue, account), totals per `(asset, custody)`, `expires_within_days`, cursor paging, default under about 20 KB |
| `acct_propose_binding` | prepare | none (local state only, no money) | `ua_import`, `ua_link_prepare` | puts an address (watch-only) or a link challenge in front of the human in the page; applies nothing until the human accepts; refuses with `no_ui` without a daemon |
| `acct_verify_link` | read | none | `ua_link_verify` | daemon verifies a signature over the challenge locally; the model can relay but cannot elevate a grade |
| `move_routes` | read | none | `mv_list_edges`, `mv_quote_edge` | options between two endpoints: each edge with cost basis (`quoted` / `estimated` / `unknown`), time, risk codes, preconditions, proof, flag needed; `rejected` with reasons; quote sources |
| `move_plan` | read (exception: stores a plan in a bounded local store; no reservation) | none (local state only) | `mv_plan_move`, `mv_get_plan` | typed Goal in, hash-bound Plan out, returned even when not executable (`execution_ready:false`, `blocked_by`) so the agent can explain |
| `move_prepare` | prepare | per step (`ENABLE_*`) | `mv_prepare_step` | prepares step *i* only if earlier steps are `confirmed`; dispatches in-process to existing builders (so every existing check runs) or to `evm_tx`; reserves cap budget; returns `sign_with_paybox` unchanged or pinned PayBox args or manual instructions |
| `move_submit` | submit (needs an open ARM window) | per step | `mv_submit_step` | verifies plan/step/prepared linkage, then delegates to the existing submit path or the `evm_tx` broadcast; once-only per `prepared_id`; no resend after ambiguity |
| `move_report` | prepare | none (local state only) | (new in 43) | records facts the agent or user asserts (`paybox_request_id`, `tx_hash`, `manual_done`) labelled agent-asserted; **never advances a step**; the reconciler does |
| `move_status` | read | none | `mv_plan_status` | plan and step state with expected versus observed effect; `refresh:true` runs the reconciler; `next` is a closed vocabulary so a resumed agent knows exactly what to do |
| `move_abort` | prepare | none (local state only) | `mv_abort_plan` | cancels remaining steps, releases reservations of expired unsent items; it can only reduce risk |

**Not a tool:** `mv_record_edge_fact` (moves an edge up the unproven / observed / trusted ladder) is an operator command on the daemon CLI, like the flags, so no agent token can reach it.

**Size.** Measured: 36 tools, 268,567 response bytes, 268,343 of tool entries, 168,601 of `outputSchema` ([V3], reproduced by the fact-check to within 150 bytes). The write-side set is **17 tools, not 19**: the 15 write-capable tools of the class table (4 prepare, 4 submit, 7 stepped) plus the two status tools `xo_userop_status` and `xo_order_status`; their strict schemas total 81,401 bytes (fact-check). Note 43's "envelope-only schema saves 65,548 bytes" is **its estimate, not re-measured and not reproducible** from the class table. 11 new tools at a budget of 3,500 bytes each add 38,500 (a budget, not a measurement). Arithmetic that does hold: the `full` profile fits under 256 KiB (262,144) only if envelope-only schemas save **at least 44,699 bytes** (268,343 + 38,500 - 262,144), that is 54.9% of the 81,401-byte ceiling; note 43's saving would give 241,295 bytes (235.6 KiB, about 8% headroom) but that is unconfirmed. Shared `$defs` for the `Untrusted` object and shortening three repeated safety sentences would save about 13,000 more (also note 43's figure). The byte-budget CI test, not this arithmetic, decides; if the ceiling cannot be reached the `full` profile stays local-only, which the parked hosted runner does not need.

**Profiles** (startup configuration `XO_TOOL_PROFILE`, never a request argument): `full` (stdio local server, scripts, the page's `/ui/tool`), `agent` (the 11 new tools plus `xo_search`, `xo_get_market`, `xo_orderbook`, `xo_account`, `xo_positions`, `xo_list_orders`, `xo_get_prepared`, `xo_cancel_order`, `pm_get_quote`, `pm_compare_market`; the per-venue plumbing tools are reached only through `move_prepare` / `move_submit`; market-creation tools excluded because O5 is unaccepted), `hosted` and `hosted-relay` (parked). Natural-language market creation is out of scope.

### 3.3 The loop

States: plan `proposed -> approved -> running -> done | halted | expired | superseded`; step `pending -> ready -> prepared -> signed -> submitted -> confirmed | failed | ambiguous` (manual steps `awaiting_user -> confirmed`). Transitions only go forward; `ambiguous` leaves only through reconciliation. One writer per account: an ambiguous step blocks other prepares for that account.

| # | Phase | What happens | Decides |
|---|---|---|---|
| 1 | Orient | `acct_graph {}`: posture, which write flags are on, which accounts exist and can receive. If every write flag is OFF the agent says so before planning something it cannot run | code |
| 2 | Resolve | words to ids with read tools only (`acct_portfolio`, `xo_search` then `xo_get_market`, `pm_compare_market`); titles arrive only inside `Untrusted` slots | agent queries, code returns |
| 3 | Clarify | only per 3.4 | agent within policy |
| 4 | Plan | `move_routes` when options matter; `move_plan` for the Plan | code |
| 5 | Present | agent shows `plan.summary_lines` **unchanged**, then proof and blockers in its words; the Plan Card in the page is the authoritative display | code renders |
| 6 | Approve | multi-step plans: approval in the page before the first `move_prepare`; single-step: the Signature Card is the approval | human |
| 7 | Execute, one step | `move_prepare`, then PayBox `request_wallet_sign` with `sign_with_paybox` unchanged, poll `get_request` on the same `request_id` (never re-call), then `move_submit`; PayBox-native steps call the named PayBox tool with pinned args then `move_report`; manual steps wait | human signs, code builds/verifies/sends |
| 8 | Reconcile | `move_status {refresh:true}` until `confirmed`; the reconciler (receipt logs, destination balance, venue position), not the agent's belief, advances the step | code |
| 9 | Report | summarise from `move_status`: moved, actual versus estimated cost, in transit, ambiguous | agent relays |

### 3.4 Clarifying-question policy

Rule: **assume, state and show beats asking, when the assumption is visible in the approval artifact and nothing irreversible happens before the user has seen it.** Ask only where a wrong guess would cost money or create risk before the user sees the plan, or when no tool can supply the answer.

- **Ask:** amount not determinable ("move some"); several markets match (options built from short `condition_id`, status, expiry, best bid/ask; titles in slots); source ambiguous and cost differs materially; the plan contains an `unproven` or `impossible` step (once, before approval, naming the unknown fact and the amount ceiling); `plan_drift` after approval; the jurisdiction attestation for an entered venue is missing (the user attests, the agent never does); a credential is needed (Polymarket Relayer key); the graph shows two matching accounts, a `conflicted` account, a stale reading that cannot be refreshed, an asset mismatch ("100 dollars" from pUSD to USDT), or a `refused` venue.
- **Do not ask:** shares ("half", "all": the planner resolves and the plan shows it); a time word (state the UTC cut-off); anything a read tool answers; a cap overrun (report `blocked_by`, the cap is the owner's); eligibility (display the dated advisory, never decide it); formatting.
- Form: at most two questions before the first plan, one topic each, at most three options built from trusted fields, a default only when waiting is safe, never "are you sure?" on an approved plan. A tainted market choice is not a chat question at all: it is **target confirmation in the page** (the human re-types the last six hex digits of the market id and the amount).

### 3.5 Confirmation layers and who signs what

| Layer | Binds | Real against a prompt-injected agent? |
|---|---|---|
| A0 chat "shall I go ahead?" | nothing | No |
| A1 host elicitation (`confirmBeforeSubmit`, server-worded) | wording | partly (UX, the host decides) |
| A2 Plan Card in the page (`ui` token; the agent holds none) | `plan_hash` | **Yes** |
| A3 ARM window (code on stderr, typed into the page, at most 10 minutes, tied to the page's event stream) | when the daemon may send | **Yes** for anything sent through our daemon |
| A4 PayBox per-signature approval (`always_approve` or `iframe`) | each signature | **Yes in approval-gated modes**; the approver may see only an opaque digest (what PayBox shows for typed data or raw digests: NOT FOUND) |
| A5 host permission prompt (`requiresUserInteraction` on our tools; `permissions.ask` on PayBox money tools in Claude Code) | the tool call | **Yes in Claude Code**, including under `bypassPermissions`: tools matched by an explicit ask rule are not auto-approved in any mode (code.claude.com permission-modes page, read by the fact-check, [V12], H; `[43]` 6.5). claude.ai web and Desktop: NOT FOUND |

| Step | Prepared by | Signed by (PayBox `request_wallet_sign`) | Sent by | Verified by |
|---|---|---|---|---|
| XO deploy/enable, redeem, revoke, withdraw | local relay | owner, `raw` `userOpHash` | relay to XO bundler | relay recompute + signer recovery |
| XO order, `xo_connect` | local relay | owner, `typedData` (preferred) or `raw` | relay to XO gateway | same |
| EVM approve / burn / `transferRemote` / SpokePool deposit | local relay (`evm_tx`) | owner, `transaction` op (**unproven**, MT1) | **daemon, after decoding the signed bytes** | daemon |
| Hyperliquid withdraw / Polymarket batch / Opinion Safe | local relay (E2v, later) | owner, `typedData` | relay POST to the venue host (allowlisted) | relay |
| Account link challenge | page / daemon | owner, `message` / `solanaMessage` (**untested**, LT-UA3) | n/a (local verify) | daemon |
| PayBox-native transfer or swap | plan pins args | PayBox | PayBox | after the fact, by balance read |
| Polymarket sell/withdraw, Kalshi and other USD venues | n/a | the user in the venue UI | the user | balance read |

The notes call for the owner key to be a **dedicated PayBox credential** holding only what the user will fund (`[P1]` O1, A4). No component of ours ever holds an owner key; XO HMAC credentials live only in the daemon vault.

### 3.6 Worked examples (real tool names; `<x>` is read from the named output field; no invented values)

Marks: **NOW** possible today; **BUILD** needs the new tools but no live test; **LIVE** needs a recorded live test or an owner-set flag; **HUMAN** done by the person outside our tools; **NO** not possible.

**A. "Show me everything I hold."**

```
list_credentials {}                                        NOW   PayBox; read-only
get_portfolio {}                                           NOW   PayBox; labels are untrusted
xo_account { owner: <credentials[i].address> }             NOW
xo_positions { address: <xo_account.account> }             NOW
xo_list_orders { owner: <owner> }                          LIVE  needs stored XO credentials (T2); otherwise "not read"
-- after build --
acct_graph {}                                              BUILD accounts, grades, gaps
acct_portfolio { detail: "summary" }                       BUILD totals per (asset, custody), coverage per venue
acct_portfolio { include: ["positions"], status: ["claimable"], detail: "rows" }   BUILD "what can I collect"
```
The reply opens with coverage ("read: ...; not read: <venue> (<reason_code>)") because absence is never zero; custodial rows appear only if the user opted in.

**B. "Move $X from my Polymarket to XO and buy Y."**

```
acct_graph {}                                              BUILD  is there a Polymarket account at grade chain_owned? else: tell the user to add it in the page
xo_search { query: "<user's words>", status: "ACTIVE", limit: 5 }     NOW   several matches -> ask Q1 with options from trusted fields
xo_get_market { condition_id: "<chosen>" }                 NOW
move_routes { from: {account_id: <polymarket>}, to: {account_id: <xo_kernel>}, asset: "USDC", amount: "<X>", optimize: "balanced" }   BUILD
move_plan { goal: { kind: "fund_and_buy", from: {...}, to_venue: "xo", buy: { market: {venue:"xo", market_id:"<chosen>"}, outcome:"yes", usd:"<Y>" }, funding_amount: "<X>" }, route_id: "<routes[0].route_id>", user_words: "<sentence>" }   BUILD
```
What the plan can contain: a **manual** Polymarket withdrawal (Polymarket's write path is not ours; decision D4), a Polygon to Base CCTP step (`evm_tx`), the Hyperlane step to the XO account (capped at the $3 test amount until T3a and T4 are recorded), `xo_deploy_enable_trading` and `xo_connect` as preconditions if not done (T1, T2), then the XO buy ($10 per order, advisory). The agent says: step 1 is yours to do in Polymarket; the later steps are unproven and limited to the ceiling; with every flag OFF this is a preview (`execution_ready:false`). Execution of one signing step: `move_plan` approved in the page (target confirmation for the market) -> `move_prepare {plan_id, step_id, plan_hash}` -> `request_wallet_sign {credential_id, intent: <prepared.sign_with_paybox unchanged>}` -> `get_request` until success -> `move_submit {plan_id, step_id, prepared_id, signature}` (ARM window open) -> `move_status {refresh:true}`. The manual step is `move_report {manual_done:true}`, confirmed only when the Polygon balance rises. Status: resolve and quote NOW; routes/plan BUILD; Polymarket withdraw HUMAN; Polygon to Base LIVE (MT1, MT3); funding LIVE (T1, T3a); the buy LIVE (T3b); the whole move is never atomic and its XO exit is unproven.

**C. "Close out all positions that expire this week."**

```
acct_portfolio { include: ["positions"], status: ["open","claimable"], expires_within_days: 7, detail: "rows" }   BUILD (today: xo_positions + one xo_get_market per market)
move_plan { goal: { kind: "close_positions", select: { expires_within_days: 7, status: ["open","claimable"] }, method: "sell_at_bid" } }   BUILD
```
The plan lists each row with its UTC cut-off visible (so "this week" is checkable), one `xo_redeem` step for claimable rows (one approval for up to 50 markets), one order step per sell (prepared by `xo_prepare_order`, sent by `xo_submit_order`; no tool named `xo_order` exists) sized within the cap (a SELL counts at least `shares x $1` against the $10 per-order cap, so about 10 shares per order and 50 per day under defaults; larger positions are split or `deferred_by_cap`), other venues' rows as `manual` with fixed instructions, and `approvals_expected` as the count the user will feel. Sells LIVE (T2, T3b); redeem LIVE (T1, T5); a guaranteed fill NO.

**D. "What is the cheapest way to get USDC to BNB Chain?"**

```
list_credentials {}; get_portfolio {}                      NOW   where is the USDC
discover_tokens { mode: "search", query: "USDC", chain: "eip155:56", limit: 5 }    NOW
move_routes { from: {chain_id: <source>}, to: {chain_id: 56}, asset: "USDC", amount: "<n>", optimize: "cost", max_routes: 3 }   BUILD
```
Today the agent **cannot compare routes**: `request_swap` creates a parked request, it is not a quote. After build, `rejected` carries CCTP with `asset_not_supported_on_destination`; the quotable candidates are Across (decodable), deBridge and LI.FI (opaque, flag OFF), and PayBox's route (E3, price unknown). The plan converts atomic units **by code** (BNB USDT and USDC are 18 decimals; Base and Polygon USDC are 6).

**E. "Add my other wallet" / "link my Polymarket account."**

```
acct_propose_binding { address: "<addr>", family: "evm", venue_hint: "polymarket", role: "mine" }   BUILD  creates a page item; the grade stays watch_only
-- the human opens the Link wizard in the page, which shows the exact challenge text --
request_wallet_sign { credential_id, intent: { op: "message", message: "<challenge text from the page>" } }   LIVE (LT-UA3)
acct_verify_link { challenge_id, signature }               BUILD  daemon verifies locally; grade becomes proven or stays watch_only
```
Derived-but-unowned accounts never become `chain_owned` by assertion; the chain owner read decides.

### 3.7 Agent safety

The agent is an **untrusted planner of goals, never an author of transactions** (`[43]` section 0). The structural rules, each backed by a test in the evaluation matrix:

| # | Rule | What it removes |
|---|---|---|
| S1 | No new tool accepts free text that reaches a signature, address, amount or venue; the only agent-authored text is `user_words` (at most 300 chars, stored as agent-asserted, never parsed, hashed in the audit) | memo channel for payloads |
| S2 | Every destination, contract, token, chain and RPC host comes from a pinned or human-confirmed set; tools take ids (`account_id`, `route_id`, `edge_id`), never raw addresses, except `acct_propose_binding`, which applies nothing | text-chosen recipients |
| S3 | Amounts are the user's words or a spec resolved by code; atomic-unit conversion is by code | injected amounts, decimals errors |
| S4 | Tool results carry no free imperative text: `next_action`, `message`, `notes`, `warnings`, `summary_lines` come from fixed templates; third-party text appears only inside `trust: "untrusted-user-content"` objects or the 80-char slot `[market title (untrusted): "..."]` | injection riding in our wording |
| S5 | `plan_hash`, `prepared_id`, `args_hash` bind approval, prepare and submit | parameter edits after approval |
| S6 | `move_*` tools never accept `owner`; it comes from the graph. Four existing tools in the `agent` profile do take one (`xo_account`, `xo_cancel_order`, `xo_list_orders`: `owner`; `xo_positions`: `address`), because examples A and C need them. They are bounded rather than hidden: `XO_OWNER` should be set (the process then serves only its configured owners; unset, it binds the first wallet that signs; `src/local/README.md`, `src/local/runtime.ts`) and `XO_READ_ADDRESS_ALLOWLIST` (S10) is enforced by `xo_account` and `xo_positions` in code (`src/tools/account.ts`, `src/tools/read.ts`); that `xo_list_orders` and `xo_cancel_order` refuse a foreign owner through the relay is M, not exercised | owner steering |
| S7 | Target confirmation in the page for a tainted market choice (the daemon marks an agent token tainted when any result it received held non-empty untrusted text; the tracker stores kinds and ids, never text) | injected market choice |
| S8 | The Plan Card, not chat, is the record | an agent that misreports |
| S9 | One writer, once-only submit, no retry after ambiguity | double spends |
| S10 | `XO_READ_ADDRESS_ALLOWLIST` set to the graph's addresses in the `agent` profile | `xo_positions` as a probe on strangers |

What the agent cannot reach (from `ROUTE_RULES` and the class table, H in `bridge/tool-classes.ts`): flags, caps, allowlists, data directory, tool profile (no route exists); opening the ARM window (page only; the agent can close it); plan, binding and target confirmation (`ui` token only); the kill switch (the agent can engage it, one way, and cannot loosen anything).

**What the user really has, by PayBox mode.** `always_approve`: a person sees each signature (recommended; informed only if they compare the card with PayBox's window). `iframe`: weaker channel. **`autonomous`: nothing in our software protects the user.** PayBox documents three approval modes (`always_approve`, `iframe`, `autonomous`) and the SDK notes record a fourth, `paybox` (the user completes the request on PayBox's site), which this record does not support (notes 30 and 31). Under `autonomous`, if a signing window or a paired agent signing key is available, the agent can call `request_wallet_sign` itself and sign anything within the grant; PayBox's docs disagree with each other on whether signing needs a fresh passkey in every mode, and none of it was tested (notes 29 to 31, [V12]). This is the documented non-defence (test E12). Recommended supported setup: a dedicated credential, approval-gated, and for Claude Code a `permissions.ask` list on the PayBox money tools, which Claude Code does not auto-approve in any permission mode. The connector tools appear to Claude Code as `mcp__claude_ai_PayBox__<tool>` (the prefix this session lists them under; confirm it against your own host):

```json
{ "permissions": { "ask": [
  "mcp__claude_ai_PayBox__request_wallet_sign", "mcp__claude_ai_PayBox__request_transfer",
  "mcp__claude_ai_PayBox__request_swap", "mcp__claude_ai_PayBox__request_payment",
  "mcp__claude_ai_PayBox__pay_x402", "mcp__claude_ai_PayBox__use_service",
  "mcp__claude_ai_PayBox__use_plugin", "mcp__claude_ai_PayBox__request_account_change",
  "mcp__claude_ai_PayBox__request_secret", "mcp__claude_ai_PayBox__claim_payment_credentials",
  "mcp__claude_ai_PayBox__get_buy_link", "mcp__claude_ai_PayBox__get_deposit_link",
  "mcp__claude_ai_PayBox__reopen_signing_window" ],
  "deny": ["WebFetch", "WebSearch"] } }
```
The list names the connector's 13 money, secret, credential and signing-window tools as listed in this session; a tool the connector adds later is not covered, so re-check it against `tools/list` when the connector changes, or ask on the whole server (`mcp__claude_ai_PayBox`) and accept prompts on read tools too (M: whether a server-wide ask rule beats an allow rule for one tool follows the documented deny, ask, allow order, not exercised). A `PreToolUse` argument-guard hook (hash the `tool_input`, ask the daemon whether it equals an approved step) is a designed addition; the hooks documentation says a `deny` decision prevents the call and states no bypass exemption for `bypassPermissions` (M), but it was not exercised. The "lethal trifecta" (private data, untrusted content, external communication): our tools cut the third leg by construction, the host cannot, so run natural-language operation in a **dedicated operator session** with no web or mail tools.

**Audit.** Existing hash-chained events plus `plan.created`, `plan.revised`, `plan.approved`, `step.prepared`, `step.reported`, `step.submitted/confirmed/failed/ambiguous`, `plan.halted/done`, `guard.denied`; `plan.created` stores the recorded inputs by reference so a `replay-plan` script can recompute `plan_hash` (replay answers "why did the planner choose this", not "what did the model say").

### 3.8 The dApp terminal

Recommended route: the user's own agent over MCP (the shim), with the page contributing the Observer pane, Signature Card and a new **Plan Card** and "Copy: execute plan `<id>`" button that carries only the id. The deterministic terminal keeps its closed command table, refused write/setter verbs and four-tool `TERMINAL_TOOLS`; it gains reviewed read commands `graph`, `portfolio`, `routes`, `plan` backed by the read tools, and `approve <plan_tag>` / `step` / `abort` / `status` backed by the same tools. An optional bring-your-own-key "Ask" pane (sandboxed opaque-origin frame; reads through the page's policy engine; proposes typed goals only; "Plan it" is a human click from the page; off unless the daemon starts with `--enable-ask`) is designed in `[43]` section 7 and **not recommended for the first release** (decision D5): it adds a key-holding frame, a CSP directive and unverified provider CORS from an opaque origin.

---

## 4. How this reconciles with the Candide and smart-account findings

This section is built from notes 35 to 40, from the repository, and from the Candide run's own decision record `docs/dapp-aa-candide.md` (read in full for sections 3, 8 and 9.1 when this document was finalised).

**Where the two decision records agree and where they differ.** They agree on: a derived Safe is never a venue's trading account; the Safe derivation profile S1 (Safe L2 1.4.1 + Safe4337Module 0.3.0 + EntryPoint v0.7, `[39]`); build only the read-only derivation and meters now (Candide F1); the AllowanceModule faucet is deferred until live tests pass (Candide F6, this record D6); the author sponsors no gas (Candide F3); no dependency in the first phases (Candide F4). They differ on one label: Candide's section 9.1 row 6 chooses **a Safe S1 as the multichain treasury** and its section 3.3 says $50 per day can be enforced on-chain for inflow where the module exists; this record's C10 chooses **the owner EOA's Base USDC as the money hub** with the Safe display-only. **Resolution (C17):** the two are compatible because the Safe has no write path in either until the Candide live tests (L1, L2, L6) pass. Until the user answers D6 with "build", this record governs the hub the planner uses (owner EOA, working float only, threat T17), and the Candide record governs the Safe derivation profile and the faucet design. If D6 is answered "build", the Safe becomes another `safe` account in the graph with a `delegates` edge and the planner gains edges into and out of it; nothing else here changes. Where the Candide record's on-chain claims matter (module presence per chain), this record marks them as relying on Candide's own documents (below).

**Headline.** Notes 35, 37 and 40 agree on the verdict and I adopt it: a derived smart account is at most a **treasury and funding layer**, never a trading account anywhere, and "gasless" is already true for orders on every CLOB venue. The user's goal (seamless moves, one aggregated view, natural language) does not require one. What it requires is the graph, the planner, an EOA transaction executor and an agent surface.

| Smart-account component | Worth it as a means? | Why / when |
|---|---|---|
| **Pure derivation of venue-forced accounts** (XO Kernel, Polymarket's three recipes, Predict.fun Kernel candidate) | **Yes, core of the graph** | zero cost, no network, validated on chain (`[19]`, `[41]` probes U2, U4, U11); the XO derivation already exists in `src/xo/account/derive.ts` |
| **A Safe derived from the owner** (profile S1: Safe L2 1.4.1 + Safe4337Module 0.3.0 + EntryPoint v0.7, direct `SafeModuleSetup`, dedicated salt, pinned by code hash; `[39]` D1 to D3) | **Display only, now** (`deriveSafe` plus the `derived / code-present / owner-verified` ladder); **no write path** | same owner gives one address on Ethereum, Polygon, Base, Arbitrum, BNB and Optimism (`[39]`, 24 of 24 fork checks, H there); the default SDK profiles give five different addresses, so an address without a pinned profile is meaningless. Not a trading account for any venue |
| **PayBox as a Safe owner via `typedData`** | worth a test, not a dependency | a Safe 4337 UserOp is a plain EIP-712 `SafeOp`; PayBox's `typedData` op exists (schema, [V4]); behaviour unproven. **By contrast a Kernel UserOp needs a raw 32-byte digest**, which PayBox's MCP `raw` op supports but its WalletConnect page refuses (C7) |
| **Kernel owner-EOA `execute`** as a UserOp-free exit (Predict.fun) | **Yes, where the PayBox EOA is the owner** | by Kernel v3.1 source the ECDSA validator hook allows an owner call (`[42]`, M on deployed bytecode); BNB gas only |
| **Safe AllowanceModule v1.0.0 as a "faucet"** (an enforced per-period outflow budget from a Safe treasury to a delegate key) | **Defer; the only way to turn the advisory $50 per day into an on-chain bound** (`[36]` item 3, `[40]` item 7) | needs a user-owned Safe on Base, Polygon or Arbitrum (Candide states the module is absent on BNB and HyperEVM; this cannot be checked by a GET, because the Safe deployments registry lists only AllowanceModule v0.1.0 and v0.1.1 and v1.0.0 is Candide's own deployment, so per-chain absence needs an `eth_getCode` read, a JSON-RPC POST not sent here; M), a delegate key, and a stolen delegate can send the budget to any address; revisit when real balances sit in agent-signable accounts (decision D6) |
| **Session keys / Smart Sessions / Kernel permissions** | **No** for order caps | no on-chain policy can read the size, price or counterparty of an off-chain signed order (`[36]` item 1, confirmed from Rhinestone docs and ZeroDev source in that note); on 3223 the policy modules are absent and an outsider has no native XO to deploy (`[25]` 6.3) |
| **Candide bundler / ERC-20 paymaster (BNB gas paid in USDT)** | optional, user's own key, last | solves "no BNB" for on-chain legs only; mainnet sponsorship needs a funded policy (Starter: 1,000 one-time sponsored ops, though the plan card also says 2,500 mainnet UserOps; Launch $333 per month, [V13]) and Candide's terms (effective 2026-10-30) make the sponsor responsible for end-user compliance; **the author sponsors nothing** |
| **Safe Unified Account (one signature, many chains)** | **No** | signs a Merkle root, EntryPoint v0.9, rated "Medium (accepted, by design)" by its own known-issues file; PayBox cannot show every leaf |
| **Candide Forwarding Address / EIL** | **No** | server-side bearer-token service / research article, not live |
| **A generic multichain wallet contract of ours** | **Never** | no venue accepts it; binding decision |
| **EIP-7702 delegation of the PayBox EOA** | **No** | breaks x402 payers and XO's EntryPoint v0.7; `[DD]` 2.7 |

Net effect on the build: nothing in the first three work packages depends on any smart-account stack; the one new on-chain capability needed (`evm_tx`) works with a plain EOA. If the user later wants enforced outflow caps, the faucet is a separate opt-in package that plugs into the graph as another `safe` account with a `delegates` edge.

---

## 5. Architecture and trust boundaries

```
 USER'S MACHINE ---------------------------------------------------------------------------------------------
  Browser page (static app, served from 127.0.0.1 by the daemon, or the standalone read-only explorer)
     holds: addresses, labels, edges, grades (IndexedDB); a `ui` token (read, prepare; never submit)
     shows: Accounts, Portfolio, Plan Card, Signature Card, Observer; deterministic terminal
          |  /ui/* (loopback, token-gated)                                       ^ SSE: prepared items, plan events
          v                                                                      |
  Cockpit daemon  (node dist/local.mjs serve)  -- the single writer --------------------------------------------
     tool registry (existing 36 + 11 acct_/move_ tools)  |  gate: class, scope, kill, ARM window, once-only, rate limits
     embedded relay: ledger, caps, prepared items, plan store (new), flags, vault (XO HMAC, optional venue keys), audit
     graph core + planner (pure) | readers (allowlisted proxy) | evm_tx build/decode/broadcast (new, flag OFF)
          ^  POST /ui/tool with the `agent` token (scope ceiling set at start)
          |
  Stdio shim  (node dist/local.mjs shim)  <--- MCP over stdio --- User's agent host (Claude + PayBox connector)
                                                                         |  PayBox MCP tools called directly by the agent
                                                                         v
 PAYBOX (third party) ---------------------------------------- MPC-held owner key; approval modes; signs, never broadcasts
                                                                         ^ signed artifact returned to the agent, relayed to move_submit
 NETWORK (third parties; untrusted data) --------------------------------------------------------------------
  venue APIs (XO, Polymarket, Opinion, Pascal, ...), public RPCs, explorers, quote APIs (Circle Iris, Across, LI.FI ...)
  chains (the daemon's evm_tx sends the bytes PayBox signed, to the user's chosen RPC)
```

| Component | Trusted for | Not trusted for |
|---|---|---|
| Owner key in PayBox | being the only root of authority; signing what a human approves | knowing what the transaction is (the approver may see only a digest) |
| Daemon + relay + graph core + planner | graph, plan, digest recompute, signer recovery, send-once, reconcile, caps (advisory), audit | being a boundary against an agent that signs through PayBox directly |
| Page | showing the Plan Card and Signature Card, confirmations that the agent cannot make | anything if the page itself is compromised (a second display on the daemon console is the mitigation `[DD]` 5.4) |
| User's agent | translating words into typed goals; relaying signatures | amounts, addresses, tokens, venues, free text that reaches a signature; remembering state (the daemon is the memory) |
| Venues, RPCs, quote APIs, explorers, market text | being data | any instruction, any address, any decimals, any approval amount; Circle's and GitBook pages carry "Agent Instructions" blocks which were not followed and are inert |
| PayBox web / MCP tools the agent calls itself | signing | anything our caps promise; `get_portfolio` labels are "untrusted attacker-set labels" per PayBox's own schema text |

**What the author operates: nothing.** Static assets plus the user's own processes. No author-run indexer, relay, cache, proxy or telemetry. Two builds of the app (standalone read-only explorer with T0 hosts only; local build served by the daemon) as already decided in `[DD]` conflict 9.

**Two agent paths, one data directory.** Stdio server with embedded relay (one writer) or the shim to the daemon (shares ledger and caps with the page). Never both on one data directory; a second process is read-only (`data_dir_locked`).

---

## 6. Security threat table and terms exposure

### 6.1 Threats

Severity is my judgement (L): **H** loses funds without user action, **M** loses funds with one user mistake or leaks private data, **L** nuisance.

| # | Threat | Path | Control | Residual | Sev |
|---|---|---|---|---|---|
| T1 | Prompt injection in market titles, rules, Gamma `name`/`bio`, Opinion `rules`, token labels, bridge route names, error bodies steers the agent | text a stranger writes enters tool results | S1 to S4: typed slots, fixed templates, no free-text tool args; hostile-corpus fuzz test | an injected agent can still call **PayBox** tools directly | H |
| T2 | Injected agent signs through PayBox itself (`request_wallet_sign` raw digest or transaction hash, `request_transfer`) | PayBox is a separate connector | approval-gated mode; Claude Code `permissions.ask`; dedicated credential; guard hook (designed) | under `autonomous` nothing of ours helps (test E12 documents it); claude.ai web/Desktop controls NOT FOUND | H |
| T3 | Recipient redirect (address poisoning, "add this wallet as mine") | graph binding or plan destination | binding applies only after the human accepts; strict EIP-55; first/last-6 collision warning; destinations only graph accounts at the required grade; R0 to R3 classes | R3 provider addresses cannot be cross-checked on chain | H |
| T4 | Derived-but-hijacked account counted as mine (the live Anvil Safe) | derivation without ownership read | grade computed from a current chain read, re-read every snapshot and before any move leaves draft; `conflicted` removes it | hostile RPC returns a convenient owner: second independent RPC host for any move (design default) | M |
| T5 | Provider calldata does something other than the quote (unlimited approve, native value, wrong recipient inside bytes) | LI.FI/deBridge/Across/Relay responses | decode and compare; exact re-encoded approvals; pinned targets and selectors; opaque class OFF by default and simulation-gated | opaque routes remain a third-party trust | H |
| T6 | Decimals error (BNB USDT 18 vs USDC 6) | provider-reported decimals | local token registry; on-chain `decimals()` check on first use; atomic units converted by code | none known | H |
| T7 | One-way door (XO entry without a proven exit; HL deposit below 5 USDC; wrong Hyperlane recipient encoding) | planner | no-one-way-door rule; hard blocks; left-pad and re-decode; test amounts | XO exit may never exist (T4) | H |
| T8 | Signed artifact differs from the prepared transaction | PayBox or a bearer-instrument leak | submit-time byte-equality, signer recovery, nonce check; never rebroadcast with a new nonce blindly | PayBox `transaction` op unproven | M |
| T9 | Double send after ambiguity | retry loops | once-only ledger on `prepared_id`; `sending` marker before every broadcast/POST; no resend; reconcile by receipt | RPC lies about a receipt | M |
| T10 | Cap bypass by splitting or restart | many small plans | durable ledger; day counters; `MOVE_MAX_PLANS_PER_HOUR` | caps are advisory against a signing agent | M |
| T11 | Privacy leak of positions/balances | model provider; RPC and venue hosts; other tools in the same agent session | per-venue opt-in; user-chosen RPC; `redact`; dedicated operator session; custodial rows opt-in for the agent | `get_portfolio` already exposes addresses to the model | M |
| T12 | Loopback daemon attack (DNS rebinding, CSRF, token theft) | browser or local malware | origin check, token scopes, ARM window, no flag route; external security review required before release (not yet done, `[BL-D]`) | same-user malware out of scope | H |
| T13 | Stale or wrong quotes drive a bad plan | quote APIs | validity windows, `min_out`, drift re-plan, quote age at most 60 s | LI.FI keyless quota (75 per window on `/quote` on 2026-10-20, read from headers at run time) can exhaust | L |
| T14 | Approval fatigue leads to blind approval | six-step moves, twelve-position close-outs | `approvals_expected` shown first; just-in-time prepare; XO redeem batches up to 50 markets in one op; Plan Card shows the whole plan once | real; UA-D8 (a host prompt per prepare) adds more | M |
| T15 | Supply chain (new dependencies for CCTP, Safe, SDKs) | npm | no new dependency for Phase A to C (viem and zod only); `abstractionkit` has no npm provenance and would need a written exception (`[35]` 3.4) | n/a | M |
| T16 | Hostile model output in an optional Ask pane | frame | not built by default; sandbox, text-only DOM, no key outside the frame | CORS from an opaque origin unverified | L |
| T17 | **Hub concentration**: the owner EOA's Base USDC is the hub for every venue, and that key's single approval of an opaque digest can move all of its Base funds, not only one venue's (`docs/runbook.md` section 2.1 step 1) | a prompt-injected or careless approval of one digest or transaction | dedicated credential per purpose; hub holds a working float only; sweep the rest to an address no agent can sign for; approval-gated mode; `permissions.ask`; the planner's per-plan and per-day caps (advisory) | caps do not bind an agent that signs through PayBox directly; an enforced bound needs the deferred Safe faucet (D6) and still does not exist on BNB | H |

### 6.2 Terms and jurisdiction exposure (not legal advice)

Design shape: a per-user, client-side display of the user's own account rows, no author server, no shared cache. Restricted-terms adapters ship OFF with a clause disclosure (decision F5 in `[DD]`).

| Party | Term as read in the notes | Effect on this design |
|---|---|---|
| XO | bots allowed if compliant; "harvest or scrape data ... for unauthorized purposes" barred; restricted regions include US, UK, France, Singapore, Ontario (`[03]`, `[08]`) | per-address reads at human pace; no export of other users' data. Decision 1 of 2026-10-19 (nobody contacts XO) means there is no safe harbour for using an account XO did not provision; that exposure is the user's, already accepted, and no extra clause for plain trading or funding is known (`[42]` 4.2) |
| Polymarket | close-only for a long list of jurisdictions (including US, UK, France, Germany, Italy, Singapore, Australia, Ontario); VPN circumvention forbidden; third-party apps must not execute for users in restricted places (`[08]` 2.11, 8) | the planner does not infer location: the user attests per venue; exits allowed, entries refused when close-only; no VPN-aware routing |
| Opinion | ToS (2025-10-19) bars robot scraping, offers official keys; US, UK, France, Ontario, Singapore, Poland, Thailand, South Korea, China, Taiwan, Hong Kong excluded | own-address reads only; no leaderboard or counterparty crawl |
| Predict.fun | ToS (2025-11-18) bars scraping by robots, offers keys; about ten jurisdictions excluded | user's own key; own rows only |
| Hyperliquid | open-ended "Excluded Persons"; bots that "exceed reasonable usage" barred | stay under 1,200 weight per minute per IP; weights are per endpoint ([V14]): `userRole` 60, most info calls 20, `spotClearinghouseState` 2, so one full account refresh (`userRole` + `subAccounts` + `spotClearinghouseState` + `openOrders` + `userFills`) is about 120 and roughly 9 refreshes fit per minute; discover accounts once and cache; show the clause, never compute eligibility |
| Pascal | ToS "Platform Data" clause (professional / market-data-distributor exclusion) open | The public GET works from a browser (`ACAO *`, [V6]) so the read is technically available at day zero, but the adapter ships **OFF** and shows the clause; the user turns it on for their own owner address only after reading it. Section 1.3 and the stage table therefore count Pascal as "read path yes, adapter OFF by default" |
| Kalshi, Gemini, OG, Novig, UDX, ProphetX, Polymarket US | Developer Agreement bars caching, aggregating and storing except for own trading; others proprietary or internal-use | OFF; daemon-only; memory-only for market data; own account rows may persist locally |
| Circle, Across, LI.FI, deBridge, Relay, Safe Transaction Service, public RPCs, Blockscout | terms **NOT READ** by the notes (geo rules for CCTP NOT FOUND) | quote and read calls are low-rate GETs of public data; opt-in for the Safe service |
| Candide | terms effective 2026-10-30 make a sponsor responsible for "your application's own compliance" and indemnifying Candide (`[40]` 5.1) | irrelevant unless the author sponsors gas, which this record refuses |
| PayBox | terms are no obstacle (user decision 2026-10-19); no upload | n/a |

---

## 7. Phased build plan: work packages, file ownership, acceptance tests, live tests

Rule inherited from `[DD]` 7.4: one WP owns a path prefix and nobody else edits it; cross-WP needs go through frozen contracts (`bridge/contract.ts`, `app/src/core/ports.ts`, `src/relay/contract.ts`) changed only by their owner. Only the dependency owner runs `pnpm install`; Phases A to C need no new dependency. Sizes are L-grade estimates. **Placement correction (C9):** `app/tsconfig.json` aliases only `@shared/*` -> `../src/*` and `@bridge/*` -> `../bridge/*` (read today, [V2]); note 41 proposed putting the shared pure module under `pm/`, which the app cannot import. It goes under **`src/ua/`**. This is an edit in a tree another stream edits concurrently, so each WP names its owner and edits are coordinated by those owners.

### 7.1 Phase A: honest read side and schema hygiene (no live test needed)

| WP | Work | Files (owner) | Acceptance tests | Size |
|---|---|---|---|---|
| **UW0** (note 43 WP-B) | Envelope-only published `outputSchema` on the 17 write-capable and status tools (the 15 write-capable tools of the class table plus `xo_userop_status` and `xo_order_status`; strict schema stays in the handler; the saving must reach 44,699 bytes, section 3.2); shared `$defs` for `Untrusted`; one shortened safety sentence plus pointer; `XO_TOOL_PROFILE` (`full`, `agent`, `hosted`, `hosted-relay`) applied in the local server **and in the shim's `tools/list`**; byte-budget test | `src/tools/*` (plugin-tools owner); `src/plugin.ts`, `src/local/server.ts` (local-mode / plugin-build owners); `bridge/shim.ts` (D6 owner); new test | per-profile `tools/list` bytes under budget (hosted-relay below 256 KiB minus 10%); every tool classed; descriptions at most 4,096 chars; write tools carry envelope-only schemas; strict output still validated server-side | S to M |
| **UW1** (43 WP-A) | Fake-model harness: `ScriptedModel`, `GulliblePolicy`, `FuzzModel`, fake PayBox (stubs labelled M), scenario runner; properties E1, E3, E5, E6, E7 run against today's 36 tools | new `bridge/test/agent-eval/*` (security WP K) | the 20-property matrix of `[43]` 8.2 incrementally; E12 asserted as a documented non-defence; zero network | M |
| **UW2** (41 UA1 + UA2) | Pure graph core: `Reading`, invariants I1 to I13, `ControlGrade` function, totals/coverage/gaps, snapshot hashing; derivers `kernel_v3_1_create2` (wrapping existing `src/xo/account/derive.ts`), `pm_deposit_wallet_beacon`, `pm_deposit_wallet_uups`, `pm_safe`, `pm_proxy`, optional `deriveSafe` S1 | new `src/ua/**` (new owner "ua-core") | property tests: unknown never summed, units never mixed, conflict removes, stale excluded, hash stable; fixtures: the four Deposit Wallet deployment-event vectors and the Gamma/Safe vector of `[41]` 5.7 (the build stream must capture full addresses from public chain data; the note truncates them); strict EIP-55 on every pinned address (the notes already contain bad-checksum strings) | M |
| **UW3** (41 UA3) | Readers returning `Reading`s: Polymarket (profile, positions, value, activity, Perps registered), Opinion (positions, trades; EOA and Safe both asked), Limitless (daemon), Pascal (account), XO (existing), Hyperliquid (flagged until a POST probe), SX explorer, chain balance/ownership reads (`getOwners`, `owner()`, `ecdsaValidatorStorage`); user read-access matrix as registry data with TTL (7 days for limits/CORS, 30 for account models) | parsers in `src/ua/readers/*` (pure; fetch injected); `app/src/features/{portfolio,wallet}/*` (WP F); `app/headers.config.ts` new browser-direct origins each with a probe id (WP W0 owner); `bridge/{allowlist,proxy}.ts` daemon routes (D2); `pm/registry/records.ts` access matrix (registry owner) | recorded-fixture parsers (the real captures of `[41]` 5.7); schema-drift cases; empty-versus-unregistered cases (I1); CSP snapshot regenerated | L |
| **UW4** (41 UA4) | Persistence and screens: `AddressBinding` becomes the persisted form of an Account plus inbound edges (IndexedDB version bump; legacy `venue_proxy` rows load as `watch_only` until a code read); Accounts screen (grade chips, gaps list, counted / not counted split); Link wizard shell | `app/src/core/bindings.ts` (WP B); `app/src/features/wallet/*` (WP F); new `app/src/routes/accounts.tsx` | migration test; export refuses secrets and stores only `messageSha256`; accessibility checks | M |
| **UW5** (41 UA5 + 43 WP-C) | `acct_graph`, `acct_portfolio`, `acct_propose_binding`, `acct_verify_link`; `redact` aliasing; taint tracker on the gate's `onResult`; audit event types; page routes for binding decisions (`ui` token only) | new `src/tools/acct.ts` (plugin-tools); `bridge/tool-classes.ts`, `bridge/contract.ts`, `bridge/events.ts`, `bridge/inbox.ts` (daemon work packages D3 and D4 of `[DD]`, not the decisions of section 8); `relay/audit.ts` (relay-core, ask A7 style) | tool-contract tests like `pm/tools/*`: untrusted wrapper, `readOnlyHint`, no write flag touched; E3 fuzz (injection strings occur only in slots); class-table test updated; hosted bundle unchanged | M to L |
| **UW6** (41 UA6) | Link challenge: build, local verify (EIP-191 `ecrecover`, ERC-1271 `eth_call`, Ed25519), proof record, wizard | `src/ua/link.ts`; `app/src/features/wallet/*` | known-answer vectors; replay and expiry; signature bytes never persisted | S to M (grade `proven` for the PayBox owner gated on LT-UA3) |

### 7.2 Phase B: advice-only planner

| WP | Work | Files (owner) | Acceptance | Size |
|---|---|---|---|---|
| **UW7** (42 section 6, 43 move_routes/move_plan) | Edge registry as reviewed data (`proof`, `valid_from`, sources, `last_verified`, TTL: a stale record downgrades to `unproven`); quoters: CCTP (Iris fees GET), Across (suggested-fees, limits), Hyperlane (static zero + router preflight), LI.FI / deBridge (quote GET, opaque class), Polymarket bridge (docs, supported-assets GET); planner (bounded enumeration, filters, objective, no-one-way-door, repair steps); `move_routes`, `move_plan`; quote hosts on the allowlist | `src/ua/planner/*`, `src/ua/edges/*`; `src/tools/move-read.ts`; `bridge/allowlist.ts` | the 18 moves of `[42]` section 12 produce the expected plans, refusals and reasons against recorded fixtures; property tests: no recipient outside R0 to R3, no approve other than `amount_in`, no step prepared before its predecessor settled; determinism: replaying recordings yields the same `plan_hash`; cost basis `unknown` is shown, never filled | L |
| **UW11a** | Operating manual in server `instructions` (under 4,096 chars), an MCP prompt `operate`, a Claude Code skill file, the `permissions.ask` settings template; runbook statement that `autonomous` is unsupported for a funded credential | `src/plugin.ts`, `.claude/skills/*`, `docs/dapp-runbook.md` (docs WP) | instructions length test; template parses; manual says caps are advisory | S |

### 7.3 Phase C: execute own-wallet moves (flags OFF; gated on MT1)

| WP | Work | Files (owner) | Acceptance | Size |
|---|---|---|---|---|
| **UW8** | Daemon-owned plan store (plans, steps, recorded inputs, step to `prepared_id` links, expected effects) with `sending` markers; `move_status`, `move_report`, `move_abort`; Plan Card, target confirmation, `POST /ui/plans/decision` (`ui` token only); SSE `plan.*` events | `relay/**` plan store (relay-core); `bridge/{contract,tool-classes,events}.ts`; new `app/src/features/plans/*` | E4, E8, E9, E13, E14, E16, E17 of `[43]`; restart mid-step never resets a counter or re-sends | L |
| **UW9** | `evm_tx` executor behind `ENABLE_MOVE_TX` / `ENABLE_EVM_TX`: contract extension (Prepared kind `tx`, `payboxIntentSchema` op `transaction` strict EIP-1559 object, `evmTxHash` digest form, call templates `erc20_approve_exact`, `erc20_transfer`, `cctp_deposit_for_burn(_with_hook)`, `cctp_receive_message`, `hyperlane_transfer_remote`, `across_deposit`, `kernel_execute_direct`, `safe_exec_transaction`, `opaque_route_call`, `decodedTx`); pinned builders; submit-time decode, signer recovery, nonce check, send once, follow receipt; `move_prepare`, `move_submit` | `src/relay/contract.ts` (**relay-core owner; frozen file**); `src/tools/move.ts`; `relay/**`; reuse `src/xo/funding/*` | E10 (`signed_tx_mismatch`, nothing broadcast on a local anvil); exact-approval property; `xo_fund_account` local path replaced by `tx` while the hosted proposal path is unchanged; the hosted bundle stays byte-stable | L |
| **UW10** | Venue edges, each behind its own flag and edge-fact ladder: Hyperliquid typed-data builders (`withdraw3`, `sendToEvmWithData`, CCTP hook data), Polymarket bridge (R3) and Relayer batch (needs a user-made key), Predict `kernel_execute_direct`, Opinion Safe tx | `src/ua/edges/*`, `src/tools/move.ts`, new flags | recorded fixtures; hook-data recipient decode requires R0/R1/R2; sub-5 USDC Bridge2 refused | L each, later |

### 7.4 Phase D: stretch

UW12 Ask pane (`[43]` section 7.3, WP-G), the argument-guard hook (`guard/`), optional user-owned Safe + AllowanceModule faucet (decision D6). None is recommended before Phase C has run live.

### 7.5 Live tests the user must run (all opt-in; none was run; budgets are the principal at risk)

| ID | Settles | Procedure (minimal) | Budget / worst case | Stop rule |
|---|---|---|---|---|
| **DT1 / T0 plus a `transaction` row** | what PayBox signs and shows: `raw`, `typedData`, `message`, `transaction` | throwaway credential; `check_operation_readiness`; sign twice on one digest; `ecrecover` locally; screenshot approval screens | $0 | any refusal closes that path |
| **MT1** (42) | `request_wallet_sign` `op: "transaction"` on Base: accepts a plugin-built EIP-1559 object, returns `serializedTransaction`, local broadcast works | harmless call or 0-value self transfer; verify locally; broadcast via the user's RPC | Base gas, cents | any refusal: `transaction_intent: no`, E2t closes, fall back to E3 or manual |
| **LT-UA2** (41) | own-account ownership reads: Kernel validator on 3223 (via explorer), Deposit Wallet `owner()`, Safe `getOwners()` | read-only | $0 | n/a |
| **LT-UA3** (41) | PayBox `message` / `solanaMessage` signature accepted by `ecrecover` / Ed25519 verify | sign the fixed challenge once | $0 | wrong shape: owner stays `watch_only` unless another signer proves it |
| **LT-UA7 / DT8** | populated XO `/users/portfolio` and orderbook `/positions` shapes | any funded XO account the user owns (after T1, T3a) | $0 | freezes fixtures |
| LT-UA1, UA4, UA5, UA6 | derive-vs-chain for the user's own owner; Hyperliquid `/info` from a browser (POST CORS, outcome-token balance shape); Opinion: which address the positions route answers for; Polymarket UUPS-variant derivation against an older wallet | read-only | $0 | n/a |
| **MT3** | CCTP `depositForBurn` standard from Polygon then Base; mint via forwarding and by self-mint; Iris status | $2 | $2 + gas + about $0.06 forwarding | attestation not available in 30 min: wait, never re-burn |
| **MT2** | Across exact-approve + deposit decoding equals API semantics; status | $2 Base to Polygon | $2 + gas | decoder mismatch: never sign provider calldata |
| **MT4** | Polymarket Bridge deposit/withdraw with R3 addresses | $2 minimum; needs a Deposit Wallet and a Relayer key for the withdraw leg | $2 + provider fees | address mismatch between calls, or status not `COMPLETED` after 30 min |
| **MT5** | opaque route simulation (deBridge / LI.FI) | $5 Base to BNB | $5 + 0.001 ETH fix fee | simulation disagrees with quote: drop the route |
| **MT6** | Hyperliquid: PayBox `typedData` with `signatureChainId 0xa4b1`; CCTP deposit with hook; `withdraw3` round trip | $6 | $6 + $1 withdraw fee + 1 USDC activation | any "lost below minimum" doubt: do not retry |
| **T1 to T8** (`[P1]` 6) | the XO doors: deploy+enable (T1), credentials (T2), $1 deposit credited (T3a), first order (T3b), fee reconciliation (T3c), **exit (T4)**, redeem (T5), capped allowance and kill (T8) | as specified there | funding capped at $3 per transfer and $10 lifetime | per test |
| LT-NL1 (new, opt-in) | real-model conformance of the operating manual against mock backends | the user's own key from their environment, never in CI, with a spend cap | the user's key spend | structural pass rate must equal the fake-model result |

Principal at risk across MT2 to MT6 is about $18 plus fees, all moved between the user's own addresses or into venues with a documented exit; add at most $3 per XO transfer under T3a. Order of value: DT1/T0 + MT1 first (cents), LT-UA2 and LT-UA3 (free), then MT3, MT2, then the venue tests.

---

## 8. Decisions needed from the user (only real forks)

Defaults apply until answered; each is conservative.

| ID | Fork | Options | Recommendation |
|---|---|---|---|
| D1 | **Accept the `evm_tx` broadcaster** (the daemon decodes PayBox's signed transaction and sends it once to the user's RPC, behind a new flag; needs a contract extension by the owner of `src/relay/contract.ts`) | accept / reject (local-mode moves then stay "sign here, broadcast it yourself" per `[RB]`) | **Accept, but build only after MT1 passes.** It adds no key and no wallet contract; it is the same trust shape as `xo_submit_userop`. Basis: PayBox's docs say the `transaction` op returns `{serializedTransaction}` "ready for eth_sendRawTransaction" (documented, untested, [V11]). Without it no executed non-XO move exists |
| D2 | **Move caps**: plan $50, day $50, proof-gated ceilings ($3 unproven / $5 verified-never-run / $25 observed / plan cap trusted), friction ceiling 1% + $1; whether moves count toward the $50 trading day (open since `[AD]` 6.4) | as stated / other numbers / count toward the trading day | **As stated, separate counters, env can only lower.** All numbers are L-grade; this is your risk appetite |
| D3 | **Opaque aggregator calldata** (LI.FI, deBridge, Relay) | off / on behind `ENABLE_MOVE_OPAQUE_ROUTES` with simulation | **Off for the first release.** CCTP, Hyperlane and Across are decodable; use aggregators only for BNB, after MT5 |
| D4 | **Polymarket write path**: store a user-made Relayer/Builder key in the local vault and allow provider-issued R3 addresses | manual only / allow | **Manual first** (planner emits a manual step and reconciles by balance read). Revisit when you want Polymarket moves automated |
| D5 | **Ask pane** (bring-your-own-key model inside the page) | none / build | **None.** The user's own agent over the shim is the route; the pane adds a key-holding frame and a CSP directive |
| D6 | **Money hub and on-chain enforced outflow cap**: keep the owner EOA's Base USDC as the hub (working float only), or make a user-owned Safe S1 the multichain treasury with an AllowanceModule faucet on Base/Polygon/Arbitrum (the Candide record's section 9.1 row 6 and its F1, F6; conflict C17) | owner-EOA hub, Safe display-only (defer) / build the Safe treasury and faucet | **Defer; the owner EOA stays the hub for now.** The Safe faucet is the only way to turn the advisory $50 per day into an enforced bound on inflow, but it needs a user-owned Safe, a delegate key, does not constrain the recipient, does nothing on BNB, and its module presence per chain is unconfirmed (section 4). Build when meaningful balances sit in agent-signable accounts. Until then the hub concentrates risk on one key (T17), which is why it is a working float |
| D7 | **Custodial and private rows visible to the agent profile** (Kalshi and similar, once a user enables them) | hidden by default (`ACCT_AGENT_PRIVATE`) / shown labelled private | **Hidden by default, opt-in per venue.** Public on-chain positions leak little; custodial rows are the one non-public dataset in the lethal-trifecta session |

The Candide record's own forks that do not touch this record (its F2 Predict.fun account mode, F3 gas payer, F4 UserOp encoder, F5 hosted page versus daemon, F7 second owner, F8 contacting Polymarket) are decided there and not repeated here; its F3 and F8 are consistent with the binding decisions above.

**Decided here, flagged for your veto (not forks):** the hub is the owner's USDC on Base, as a working float (the fork on a Safe treasury is D6); local state writes (`move_plan`, `acct_propose_binding`, `move_report`, `move_abort`) carry no flag while every money-moving, signing or third-party-writing path does (section 3.2); XO stays a capped one-way spoke until T3a and T4 are recorded; `acct_*` / `move_*` naming; the `agent` profile hides per-venue plumbing and market creation (O5 unaccepted); `autonomous` is stated unsupported for a funded credential and the `permissions.ask` template ships; the user attests jurisdiction per venue, the software never infers it; the shared pure module lives in `src/ua/`; no author-sponsored gas (kill criteria in `[40]` 6.3 stand).

---

## 9. Conflicts between the notes (and with the repo) and how each was resolved

| # | Conflict | Resolution | Basis |
|---|---|---|---|
| C1 | Tool names: `ua_*` (41), `mv_*` (42), `acct_*` / `move_*` (43); 10 + 9 + 9 tools overlapping | one set of 11 `acct_*` / `move_*` tools (section 3.2); `mv_record_edge_fact` becomes a daemon CLI command; abort added from 42; link verification and import folded into `acct_propose_binding` / `acct_verify_link` | 43 is the agent-facing contract and measured sizes; 41/42 granularity preserved inside the outputs |
| C2 | Move caps: 42 says step $50, plan $100, day $100, first-use $5; 43 says plan $50, day $50 and a proof ladder | plan $50, day $50, and one combined ladder (section 2.5); both were L-grade proposals | take the lower; decision D2 |
| C3 | Polymarket withdrawal: 42 plans `PM.WITHDRAW` as E2v with a Relayer key; 43 says manual (no write path) | manual (E4) first, E2v later behind its own flag and decision D4 | the key is the user's credential; `[AD]` 6.2 "not planned"; wallets-auth page requires the Relayer/Builder key, created in the Polymarket UI ([V7]) |
| C4 | Account state vocabulary: 41 control grades vs 43 `role` (`mine_confirmed`, `derived_from_confirmed`, `watch_only`) | grades are authoritative; `role` is dropped; `can_receive` is computed (section 1.2) | one source of truth; 43 says the account-graph stream's types win |
| C5 | Destination eligibility: 43's `derived_from_confirmed` accounts may receive; 41 requires code present; the live Anvil Safe is derived, deployed and owned by someone else | destination needs code present and `chain_owned` / `proven`; only the XO Kernel account may rely on derivation plus code until the 3223 owner read passes | `[41]` probe U7 (live counter-example), `[42]` R1 class, `[19]` |
| C6 | 43 assumes the daemon serves `/mcp` and makes `agent` its profile; the build has no `/mcp` ("agents use `node dist/local.mjs shim`") | apply profiles at the shim's `tools/list` and in `src/local/server.ts`; revisit if `/mcp` is built | `[BL-D]` section 5, `bridge/main.ts` message ([V2]) |
| C7 | 37 and 39 say PayBox "refuses raw digests and transactions" (WalletConnect page); 42 and 43 rely on `raw` and `transaction` via `request_wallet_sign` | two different PayBox surfaces. The agent uses the MCP / CLI tool, whose live schema lists `raw` and `transaction` ([V4]); whether a **grant** permits `raw` and what PayBox shows are still untested (DT1). A Kernel UserOp needs `raw`, a Safe UserOp needs only `typedData` | schema read today; `[DD]` 2.1 kill criteria |
| C8 | Opinion account: 41/42/40 describe a Safe only; 37 says any Safe an EOA owns works; Opinion's SDK architecture page documents **both** an EOA-funder setup and a Safe v1.3.0 created through `GnosisSafeProxyFactory 0xa6B7...6AB2` on BNB | graph treats Opinion as "EOA or Safe", asks both addresses on the public routes, never assumes derivation | page read today ([V5]); derivation of the Safe address from the EOA stays NOT FOUND |
| C9 | 41 puts the shared pure module under `pm/` "via the existing `@shared` path"; the app's alias is `@shared/*` -> `../src/*` and `@bridge/*` -> `../bridge/*` only | module goes under `src/ua/`; `pm/` keeps registry data and tools | `app/tsconfig.json` ([V2]) |
| C10 | Hub account: 35/39 propose a derived Safe as a multichain treasury; 42/38 make the owner EOA's Base USDC the hub | EOA hub, as a working float; Safe is display-only now, faucet deferred (D6) | no venue accepts a generic Safe; G-A3 is the real gap, solved by `evm_tx` |
| C11 | Hosted size limit: plugin comment says "all 36 tools are about 268 KiB"; 43 gives 268,567 bytes; task statement said 268,559 | 268,567 response bytes, 168,601 of `outputSchema`, 18 tools = 123,809 | re-measured on a copy of the current bundle ([V3]); limit only binds the parked hosted runner |
| C12 | `[26]` "no public orders-by-address on any venue" vs 41 (Pascal, Hyperliquid) | 41 wins; Pascal re-confirmed live ([V6]) | probe |
| C13 | 43 notes `xo_cancel_order` lacks `requiresUserInteraction` while the class table keeps it `submit` | leave as is, listed for the plugin-tools owner; it only reduces risk | `bridge/tool-classes.ts` comment ([V2]) |
| C14 | Candide pricing/chains vs "nothing the author operates" (35, 40) | optional, user's own key, last; author sponsors nothing | binding decision |
| C15 | 42's list of tools for PayBox-native steps vs 43's `paybox_native`: same edge class (E3) | one name in tool outputs (`paybox_native`) and in the registry (`E3`) | naming |
| C16 | `ua_link_*` signature route: 41 says PayBox `message`; PayBox web WalletConnect signs `personal_sign` UTF-8 only | both are candidates; the MCP `message` op is what the agent calls; neither tested | `[41]` 7.2 |
| C17 | Hub, across decision records: `docs/dapp-aa-candide.md` section 9.1 row 6 chooses a Safe S1 as treasury and its section 3.3 says $50/day is enforceable on-chain for inflow; this record's C10 chooses the owner EOA as hub with the Safe display-only | neither record has a Safe write path until the Candide tests L1, L2, L6 pass, so they do not collide in practice; this record governs the planner's hub until D6 is answered "build"; the Candide record governs the Safe S1 profile and faucet design | section 4; decision D6 |
| C18 | The `agent` profile "hides `xo_*` tools that accept an owner" (S6) but keeps `xo_account` and `xo_cancel_order`, and S10 allowlists `xo_positions`, which the profile omitted | profile now includes `xo_positions` and `xo_list_orders`; S6 says these owner-taking tools are bounded by `XO_OWNER` and the address allowlist, not hidden | `src/tools/account.ts`, `src/tools/read.ts`, `src/tools/trade.ts` (arguments read in this pass) |
| C19 | Worked example C named a step `xo_order`, a tool that does not exist | real tools are `xo_prepare_order` then `xo_submit_order` | `bridge/tool-classes.ts` |
| C20 | "19 write and status tools" (section 3.2, UW0) versus the class table | 17 (15 write-capable plus `xo_userop_status`, `xo_order_status`); the 65,548-byte saving is note 43's estimate | `bridge/tool-classes.ts`; fact-check measurement of 81,401 strict-schema bytes |
| C21 | Pascal counted as a day-zero "yes" in section 1.3 and the stage table, while section 6.2 kept its flag OFF over the ToS clause | read path works; adapter ships OFF by default and is switched on by the user | section 6.2 |
| C22 | Stage table said Polymarket exit needs "decisions D3/D4"; D3 is opaque aggregator calldata | only D4 concerns Polymarket; D3 concerns deBridge and LI.FI legs | section 8 |
| C23 | "Every write path flag-gated OFF" versus `move_plan` (class `read`, stores a plan) and flag-less `acct_propose_binding`, `move_report`, `move_abort` | the binding decision applies to money-moving, signing and third-party-writing paths; local state writes are listed and unflagged | section 3.2 |

---

## 10. Unverified list

Carried from the notes unless marked; none of it is settled by this document.

1. Whether PayBox accepts and signs `request_wallet_sign` `op: "transaction"` for plugin-built EIP-1559 objects (field names, whether it fills nonce and gas, output shape), `typedData` for chain ids 3223, 42161, 1337, 4162, and raw digests under a grant (MT1, DT1/T0). What PayBox's approval screen shows for typed data or a raw digest. Whether `autonomous` signing needs a passkey (documented inconsistently).
2. Every XO off-chain door: bundler admission for a self-derived account (T1), orderbook registration and login (T2), crediting of a direct mint (T3a), first order (T3b), and the exit (T4). The XO populated portfolio and orderbook-position shapes. Why a funded XO creator account is unregistered at the orderbook.
3. Delivery of a third-party Hyperlane message on XO (400 of 400 recent Mailbox transactions came from one address).
4. Whether the Kernel ECDSA validator's deployed bytecode on BNB equals the source (owner-`execute` path), and whether real Predict.fun accounts are index-0, no-hook Kernels; Predict deposit mechanics.
5. Opinion: which address the public positions route wants; whether the Safe is a pure function of the EOA; builder-mode access conditions. SX Bet proxy derivation and withdrawal. Pascal deposit-PDA derivation and read-endpoint limits.
6. Hyperliquid `/info` responses, CORS of the POST response, outcome-token balance shape (all POST, never sent).
7. XO validator-owner read on chain 3223 (works on BNB).
8. Polymarket UUPS-variant derivation live; Proxy-wallet current-owner read; Perps authenticated reads; Combos relation to the main book; the 0.3% Bridge app fee (docs example, not a live quote); the Polymarket Bridge POST endpoints (never called).
9. Relay keyless quoting; Across refund page body; CCTP attestation and mint expiry; the unit of Circle's `forwardFee` (interpreted as USDC base units, M); deBridge `DlnSource` and Across SpokePool contract pins against their own docs (taken from API responses in the note).
10. Terms of Circle, Across, LI.FI, deBridge, Relay, the Safe Transaction Service, public RPC providers and Blockscout; the restricted-venue readings (Kalshi, Gemini, OG, Novig, UDX, Pascal Platform Data) are interpretations, not legal advice.
11. Host features: whether a Claude Code `PreToolUse` hook's deny holds under `bypassPermissions` (the hooks documentation says a deny prevents the call and states no exemption, M; not exercised); the exact prefix and the server-wide ask-versus-allow precedence of the PayBox connector's tools on the user's own host; equivalents in claude.ai web and Desktop; whether any host forwards `outputSchema` to the model; whether `tools/list` pagination restarts the 256 KiB cap; whether other hosts defer tool definitions; whether the Streamable HTTP `/mcp` front will be built.
12. Token decimals and addresses marked M (pUSD, some USDC addresses) pending an on-chain `decimals()` check; Candide's rate limit on the keyless endpoint (NOT FOUND).
13. Anything about a real model's conformance to the operating manual (LT-NL1). Everything designed here (11 tools, plan store, taint tracker, `evm_tx`, Plan Card, Ask pane, guard hook) is **designed, not built**.
14. The external security review of the loopback daemon required before release has not happened (`[BL-D]`).
15. Safe AllowanceModule v1.0.0 absence on BNB and HyperEVM: taken from Candide's documents; the Safe deployments registry cannot confirm it by GET (it lists only v0.1.0 and v0.1.1), and an `eth_getCode` read (a JSON-RPC POST) was not sent. The PayBox SDK mode `paybox` (notes 30, 31) is unsupported here and untested. A candidate Hypercore-to-Polymarket deposit edge has no read mechanism. The size of the saving from envelope-only `outputSchema` on the 17 write-capable and status tools is unmeasured (section 3.2).

---

## 11. Fact-check outcome

A separate fact-check on 2026-10-20 re-read the primary sources for twelve claims (the table merges the two bridge-minimum claims into one row). Result: 9 confirmed, several with corrections; 3 refuted in part (aggregator chain count, LI.FI keyless budget, XO edge wording); ten contradictions inside this document. Every item is applied above.

| Claim group | Verdict | What changed |
|---|---|---|
| CCTP has no USDC on BNB; Iris 400 and fee 1.3 | confirmed | Circle lists about 30 domains; the CCTP row now says "and about 20 more" (2.2) |
| Aggregator chain counts | **refuted in part** | LI.FI is 65 EVM chains (69 with non-EVM types), not 66; Relay 60, Across 24, deBridge 18 stand; none lists 3223 (2.1) |
| Public read matrix (Pascal, Perps, Polymarket `/value`, Opinion, XO CORS) | confirmed | Pascal's read works but its adapter ships OFF over the ToS clause (1.3, 6.2, C21) |
| Tool count and size | confirmed, one number refuted | 36 tools, 268,567 bytes, 168,601 of `outputSchema` stand; the write-side set is 17 tools, not 19, and the 65,548-byte saving is an unverified estimate (3.2, C20) |
| `request_wallet_sign` ops and no broadcast | confirmed | docs line "ready for eth_sendRawTransaction" cited as the untested basis of D1 |
| PayBox approval modes and autonomous | confirmed, with an omission | fourth SDK mode `paybox` named; autonomous wording corrected; passkey rule marked inconsistent and untested (3.7) |
| Claude Code `permissions.ask` under `bypassPermissions` | confirmed | real connector prefix, a complete 13-tool ask list, hook-deny status updated (3.7, item 11) |
| Across approval, min deposit, fill time; LI.FI keyless budget | **Across confirmed, LI.FI refuted** | LI.FI quota is read from `ratelimit-*` headers (75 per window on 2026-10-20), not 200 per 2 hours (2.4, T13); Across sample fee is $0.0179 re-read (2.2) |
| Hyperliquid and Polymarket bridge minimums | confirmed | per-endpoint Hyperliquid weights added (6.2); Polymarket minimum is $2 on most chains and $3 on Ethereum (2.2); Hypercore deposit row added as an unproven candidate |
| XO edges and "2,627 on-chain accounts" | **refuted in part** | XO exit "to anywhere except Base" now reads "with our tools"; `XO.EXIT.APP` is documented plus chain-observed for XO-initiated transfers; the 2,627 figure is a sample from six windows (1.3, 2.2, 0) |
| Candide and Safe component claims | confirmed | Starter wording and AllowanceModule absence marked as Candide's claim, not checkable by GET; the "pending" statements removed (4, item 15) |

Contradictions resolved: C1 (XO exit wording), C2 (hub across the two decision records, now C17 and D6), C3 (profile versus S6/S10, now C18), C4 (examples A and C, C19), C5 (17 versus 19, C20), C6 (Pascal, C21), C7 (D3/D4, C22), C8 (hub concentration, now threat T17 and the section 0 float rule), C9 (local state writes versus "every write path OFF", C23), C10 (stale figures replaced).

---

## Verification

What I re-checked myself on 2026-10-20 (public GETs with User-Agent `insurance-markets-research/0.1`, sent no state-changing request, called no PayBox tool, created no account or key, read no credential file, contacted nobody). Where the notes and my reads agree the note's other claims are still the note's.

- **[V1] Circle CCTP and BNB (re-read from the primary page).** `developers.circle.com/cctp/concepts/supported-chains-and-domains.md` fetched as Markdown: the chain table row "BNB Smart Chain (USYC only)" and the text "USDC: Supported on all CCTP domains except BNB" / "USYC: Supported only on Ethereum and BNB Smart Chain"; domain 17 is BNB. Iris `GET /v2/burn/USDC/fees/6/17` returned HTTP 400 `{"error":"Invalid source/destination domain id"}`; `/fees/6/7` (Base to Polygon) returned 200 with `minimumFee 1.3` at finality 1000 and 0 at 2000. This removes note 43's caveat that the BNB fact came from one summarising fetch.
- **[V2] Repository facts.** `bridge/tool-classes.ts` `TOOL_CLASS_TABLE`: 36 tools (21 read, 4 prepare, 4 submit, 7 stepped), `xo_cancel_order` classed `submit`; `bridge/main.ts` prints "no MCP endpoint in this build" when no `POST /mcp` route exists and `docs/build-log-dapp.md` section 5 states "The daemon has no MCP endpoint ... Agents use `node dist/local.mjs shim`"; `bridge/shim.ts` header (forwards each call to `POST /ui/tool` with the agent token, holds no relay) and `src/local/cli.ts` usage (`serve`, `shim`, stdio with embedded relay); `app/tsconfig.json` paths (`@shared/*`, `@bridge/*` only); `docs/everyone-architecture.md` line 73 and `docs/runbook.md` lines 31 to 35 on the transaction proposal and manual broadcast; `src/tools/fund.ts` line 123 `io.paybox/transactionProposal`; `src/plugin.ts` comment on the 256 KiB runner cap; `docs/dapp-design.md` sections 0, 2, 3, 7.4, 8, 9 and "Build status".
- **[V3] `tools/list` size, measured.** Copied the current `dist/plugin.mjs` (built 2026-10-20 13:25, the same build note 43 measured) into the session scratch directory and called `tools/list` with the `2026-07-28` stateless `_meta` envelope, stripped environment, no network: **18 tools, 123,809 bytes, 86,377 of `outputSchema`** without a relay; **36 tools, 268,567 bytes, 168,601 of `outputSchema`** with `XO_RELAY_URL` set to an unreachable local address. Both match note 43 exactly. 268,567 minus 262,144 is 6,423 over the hosted limit. The per-tool savings (65,548 bytes) and the 3,500-byte new-tool budget are note 43's, not re-measured by me; the fact-check could not reproduce the 65,548 figure (the write-side set is 17 tools with 81,401 strict-schema bytes, section 3.2).
- **[V4] PayBox schema.** Loaded (not called) the live `request_wallet_sign` schema: intent ops `message`, `typedData`, `transaction`, `authorization`, `solanaMessage`, `solanaTransaction`, `raw`; the description says PayBox "returns the signed artifact without broadcasting a wallet-sign transaction" and not to re-call for a pending request.
- **[V5] Opinion docs.** `docs.opinion.trade/llms.txt` and the SDK architecture page: the signer / funder ("multi_sig_addr") split, the EOA setup ("Same as signer (EOA holds funds)"), the Safe setup, Gnosis Safe v1.3.0 created via `GnosisSafeProxyFactory 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` on BNB Chain; the position OpenAPI: `GET /positions/user/{walletAddress}` with the parameter described only as "Target user's wallet address", no security requirement. Confirms note 41's "docs do not say which address" and adds the EOA-funder variant.
- **[V6] Public GETs.** Pascal `GET data.pascal.trade/api/v1/accounts/<System Program pubkey>` with a foreign `Origin`: HTTP 200, `access-control-allow-origin: *`, `cache-control: no-store`, body `{"status":"success","data":{"has_deposited":false,"collateral_usd":"0.000000",...,"orders":[],"positions":[]...}`. Polymarket Perps `GET api.perpetuals.polymarket.com/v1/info/registered?address=<public Anvil account 0>`: 200, `access-control-allow-origin: *`, `{"registered":true}`. Both match note 41.
- **[V7] Polymarket wallets-auth.** `docs.polymarket.com/trading/wallets-auth.md`: Relayer API key created at polymarket.com -> Settings -> API Keys -> Relayer API Keys, "authorizes gasless wallet operations for the account"; SDK examples pass it to the secure client. Confirms the human UI step and the credential precondition.
- **[V8] Circle HyperCore page.** `cctp-on-hypercore.md`: one-time 1 USDC activation fee on a new HyperCore account, "There is no minimum deposit amount", activation fee separate from CCTP forwarding fees. The 5 USDC floor belongs to the wallet-connected Bridge2 path (note 42, from Hyperliquid's FAQ; not re-fetched).
- **[V9] Fact-check, chains and quotes (reads by the fact-check run, relayed to me; I did not repeat them).** `li.quest/v1/chains` 65 EVM chains, 69 with `chainTypes=EVM,SVM,UTXO,MVM`; Relay `/chains` 60; Across `/api/swap/chains` 24; deBridge `supported-chains-info` 18; none lists 3223, all list 8453 and 56. Across: `swap/approval` data ends in 64 `f` (unlimited), limits `minDeposit` 500039, suggested-fees `estimatedFillTimeSec` 1 and `relayFeeTotal` 17851 on $100. LI.FI response headers: `/v1/quote` `ratelimit-limit` 75 with `ratelimit-reset` 4491 s, `/v1/chains` and `/v1/status` 100 per 60 s. Circle Iris `forward=true` fees: Polygon 59,237, HyperEVM 82,387, Solana 131,214 (units as in note 42, M). H for what was read; the quotas are as of 2026-10-20 only.
- **[V10] Fact-check, Polymarket bridge.** `bridge.polymarket.com/supported-assets`: 237 rows; `minCheckoutUsd` 2 (156 rows), 3 (79 rows), 3.6 (2 rows); Ethereum USDC and USDT are 3; a "Hypercore USDC" row (chain 1337) exists. H.
- **[V11] Fact-check, PayBox docs.** `docs.paybox.sh/reference/mcp-tools.md`: the `transaction` op returns `{serializedTransaction}` "ready for eth_sendRawTransaction"; `request_transfer` builds and broadcasts itself. Documented, never exercised. H for the text, NOT TESTED for the behaviour.
- **[V12] Fact-check, approval modes and Claude Code permissions.** PayBox reference: `always_approve`, `iframe`, `autonomous`; notes 29 to 31 add SDK mode `paybox` and record contradictory documentation on fresh passkeys (NOT TESTED). Claude Code `permission-modes` page: explicit ask rules and `requiresUserInteraction` MCP tools are not auto-approved in any mode including `bypassPermissions`; deny rules block in every mode; `permissions` page: `PreToolUse` hook decisions do not bypass ask or deny rules; `hooks` page: `permissionDecision: deny` prevents the call with no bypass exemption stated (M). H for the docs text, not exercised.
- **[V13] Fact-check, Candide.** `candide.dev/pricing`: Starter "1,000 are a one-time allowance" and a plan card saying 2,500 mainnet UserOps; Launch $333 per month with 5,000 sponsored ops; Grow $749. `candide.dev/legal/tos`: last modified 2026-09-29, effective 2026-10-30; "You are responsible for your application's own compliance"; indemnification at 11.5. Safe: the 4337 multi-chain-signature module README targets EntryPoint v0.9 and its known issues list "Medium (accepted, by design)"; the Safe Transaction Service sent `x-ratelimit-limit 5000` with a reset of about 29.97 days; `safe-modules-deployments` lists allowance-module v0.1.0 (15 networks, BNB included, no Arbitrum or HyperEVM) and v0.1.1 only. H.
- **[V14] Fact-check, Hyperliquid and Circle.** HL FAQ: wallet-connected deposits are Arbitrum only and below 5 USDC are lost; `withdraw3` "$1 fee ... approximately 5 minutes"; rate limits 1,200 weight per minute with `userRole` 60, most info calls 20, `spotClearinghouseState` 2; HIP-4 outcome tokens `+<encoding>`. Circle `cctp-on-hypercore.md`: no minimum, 1 USDC activation fee. XO docs (product/accounts/withdraw): "a supported destination chain". H.
- **[V15] My checks while applying the fact-check.** Read `bridge/tool-classes.ts` and counted the class table: 21 read, 4 prepare, 4 submit, 7 stepped (36); the 15 write-capable tools plus `xo_userop_status` and `xo_order_status` make 17. Read the argument definitions of `xo_account` (`src/tools/account.ts`: `owner`, allowlist check `address_not_allowed`), `xo_positions` (`src/tools/read.ts`: `XO_READ_ADDRESS_ALLOWLIST`), `xo_cancel_order` and `xo_list_orders` (`src/tools/trade.ts`: `owner`), `src/local/README.md` and `cli.ts` on `XO_OWNER`. Read `docs/dapp-aa-candide.md` sections 3 to 3.4, 8 and 9.1, and `docs/runbook.md` section 2.1. Read `docs/research/20` (230 XO-to-Base messages, median 12 s, 0 unmatched) and `docs/research/19` (2,627 of 2,627 across six windows, "windows, not census", M). The connector tool names in the ask template are the ones this session lists for the PayBox connector; no PayBox tool was called.
- **Not re-checked by me (relied on from the notes, tags as in the notes):** every on-chain probe (Hyperlane router, Kernel and Deposit Wallet derivations and ownership reads, the Anvil Safe takeover, the XO creator account), the Across / LI.FI / deBridge / Relay quotes beyond the fields listed in [V9] (the chain lists, Across and LI.FI figures were re-read by the fact-check, not by me), Hyperliquid docs, Candide pricing and terms (re-read by the fact-check, [V13], [V14]), Polymarket jurisdiction lists, Kernel source reads, and Claude Code permission-mode behaviour (docs text re-read by the fact-check, [V12]; behaviour not exercised).
- **Privacy scan.** The file was scanned before finishing for the user's email, name, username, GitHub login and home path fragments, and for key or token shapes; none present. Third-party content was treated as untrusted data; "Agent Instructions" blocks on fetched pages were not followed.
- **Scope.** This is the only file I wrote in the repository (the fact-check pass edited only this file and read the repository files named in [V15]); the privacy scan was repeated after the fact-check edits with no hits; no git state was touched; no build, install or test was run (the only code I executed was a copy of our own already-built plugin bundle, for `tools/list` only).
