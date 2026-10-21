# 41. The unified account graph and its read layer

Task `ua-account-graph`. Written 2026-10-20 (harness date; probe clock 07:05 to 07:45 UTC, from response `date` headers). Read-only research: public documentation, public GET endpoints, `gh api` reads of public repositories, read-only JSON-RPC calls (`eth_call`, `eth_getCode`, `eth_getLogs`, `eth_blockNumber`) to public RPC hosts, and offline recomputation. I sent no state-changing request of any kind, **no POST to any venue API** (so no Hyperliquid `/info` request was made; its facts come from its docs and are tagged accordingly), called no PayBox tool, created no account, key or API key, signed nothing, contacted nobody (no XO, PayBox, venue or Safe contact), cloned and ran no third-party code (I executed a copy of the public derivation formulas and this repository's own `src/xo/account/derive.ts` against public data, nothing else), and read no credential or `.env` file. Every scripted request used the User-Agent `insurance-markets-research/0.1`. All third-party text was treated as untrusted data; nothing in it was followed as an instruction. Third-party addresses below are truncated to the first 6 and last 4 hex digits, except public protocol contracts and the public Foundry/Anvil test key (account 0), which is a published test vector.

Confidence tags: **H** = read first-hand in a primary source or reproduced by my own probe or computation this session (probe id `[U#]`, listed in the Verification section); **M** = secondary, inferred from H facts, or documented but not exercised; **L** = guess. **NOT FOUND (searched: ...)** is a documented absence, never a guess. **NOT TESTED** means I did not or could not probe it.

Reference keys: `[NN]` = `docs/research/NN-*.md` (`[NN V]` = its Verification section, which overrides its body); `[AD]` = `docs/aggregation-design.md`; `[DD]` = `docs/dapp-design.md`; `[PG]` = `docs/phase1-gap-closing.md`; `[VC]` = `docs/venue-census.md`; `[VN:slug]` = `docs/research/venues/<slug>.md`; `[PR]` = `docs/platform-registry-design.md`; `[ML]` = `docs/market-linking-design.md`; `[TC]` = `docs/tool-contract.md`. Source keys for first-hand reads: `[S:pm-relayer]` = github.com/Polymarket/builder-relayer-client (`src/builder/derive.ts`, `src/client.ts`, `src/config/index.ts`, `src/constants/index.ts`); `[S:pm-docs]` = docs.polymarket.com (`trading/wallets-auth`, `resources/contracts`, `trading/wallet-activity`, `perps/*`); `[S:op-docs]` = docs.opinion.trade; `[S:pf-docs]` = dev.predict.fun; `[S:pf-sdk]` = github.com/PredictDotFun/sdk; `[S:hl-docs]` = hyperliquid.gitbook.io/hyperliquid-docs; `[S:pascal-docs]` = docs.pascal.trade; `[S:sx-oa]` = docs.sx.bet/openapi.json.

Sibling research `docs/research/35` to `39` and `docs/dapp-aa-candide.md` did not exist when I looked; `docs/research/40-aa-economics-risk.md` did and is cited as `[40]`. Nothing here waits on them: the smart-account choice (Candide, Safe, Kernel) is a means; this note specifies the graph those accounts plug into.

Binding decisions applied (restated because every verdict is judged against them): runnable by everyone from day zero with nothing the author must operate and no custody of other people's credentials (local-first / static client); nobody contacts the XO team; no browser automation of any third-party site; caps are advisory against a compromised agent unless enforced on-chain; every write path flag-gated OFF; no wallet contract or bridge written by us; the repository is public; PayBox terms are no obstacle but PayBox upload is not available. User goal (2026-10-20): the best solution for seamless moving between venues and aggregating all of a user's accounts, operable by the user's own agent in natural language.

---

## 0. Bottom line

1. **The graph is a graph, not a list of addresses, and its edges carry evidence.** A user has a few *owners* (signing identities: the PayBox EVM address, a Solana key, sometimes a venue-embedded wallet) and many *accounts* (the EOA itself, an XO Kernel account, a Polymarket Deposit Wallet, a Safe, a Hyperliquid sub-account, a custodial USD ledger). What makes an account "the user's" is the *control evidence on the edge*, not the address. Section 3.
2. **For the venues that matter most, the accounts an owner controls can be found with zero credentials and zero venue cooperation, by pure functions plus one `eth_getCode`.** XO Kernel (CREATE2, 2,627 of 2,627 on-chain accounts re-derive [19]; 18 of 18 fresh BNB-chain registrations re-derive [U11]); Polymarket Deposit Wallet (beacon-proxy CREATE2 from `bytes32(owner)`; I re-derived 4 of 4 deployed wallets (three fresh, one from about 1,000,000 blocks earlier) from the factory's own deployment events [U4, U4b]); Polymarket Safe (the derivation reproduces the `proxyWallet` that Gamma reports for the public Anvil test key [U2]); Predict.fun "Predict Account" (a Kernel v3.1 account, same implementation and validator constants as XO's [U10]). Section 4.
3. **A derived address proves origin, not current control, and the live data already contains the counter-example.** The Polymarket Safe derived from the public Anvil test key exists on Polygon and has `getOwners() = [0xD402...312d]`: a different single owner, nonce 34 [U7]. So *derived* never means *mine*. The control ladder (section 7) requires a **current on-chain ownership read** (Safe `getOwners`, Kernel validator storage, Deposit Wallet `owner()`; all three work keyless [U5, U11, U7]) or a signature, before an account joins "my total".
4. **Day zero with zero credentials covers more than the notes assumed, and one earlier claim is wrong.** `[26 §13]` says "there is no public 'orders by address' on any venue in scope". Pascal's account snapshot returns **open orders, positions, pending deposits and withdrawals and collateral by owner pubkey with no key and `Access-Control-Allow-Origin: *`** [U14]; Hyperliquid's `openOrders`, `userFills`, `spotClearinghouseState` are public by address (docs; POST, NOT TESTED) [S:hl-docs]. Opinion's positions and trades by wallet are keyless **and browser-readable** (the live API reflects the origin) [U8], which `[26 §4.9]` had marked "CORS NOT TESTED". Section 11 has the full table.
5. **The on-chain account and the venue-credited balance are different ledgers and the graph must never add them.** A live XO creator account shows 4,704.236695 USDC.e on chain through the explorer, while the orderbook says `cash_balance "0"` and `smart_account: null`, and the Data API portfolio is empty [U15]. Every `Balance` therefore carries a `custody` field (`self_account`, `venue_credited`, `venue_ledger`, `escrow`, `order_reserve`) and totals are kept per asset *and* per custody.
6. **The Data API cannot tell "empty" from "never used".** Polymarket `GET /v2/value?user=` answers `200 {"value": 0.0}` for addresses that have never existed, including a wallet deployed minutes earlier [U20]. The graph's rule: an unused-or-empty read is `no_activity_seen`, not `verified_zero`, unless the venue gave a registration signal (Pascal `has_deposited`, XO `smart_account`, Perps `registered`).
7. **Linking uses a proof ladder, never a claim.** Six grades: `proven` (a fresh signature, or the account is a proven key), `chain_owned`, `venue_attested`, `derived_origin`, `watch_only`, `conflicted`. Only the first two enter "my total" by default. Signature scheme: a local, replay-protected EIP-191 / ERC-1271 / Ed25519 challenge verified in the page; nothing is sent to anyone. Section 7.
8. **Privacy: addresses stay in the user's browser or local daemon; the honest leak surfaces are the venues, the RPC provider, and the model provider.** Each venue read tells that venue the user's IP and address; each RPC read tells the RPC host; and when the user's agent calls graph tools, the addresses and positions enter the model's context. The graph therefore has per-venue opt-in, a user-chosen RPC, and an explicit "this goes to your model provider" notice on every agent tool that returns account data. Section 8.
9. **The graph is the input contract for the move planner and the natural-language layer, so it is designed to say "I don't know" in a typed way.** Every field is `Reading<T>` = `ok | unknown(reason) | refused(reason) | not_applicable`; arithmetic over `unknown` is a type error; a `Move` precondition evaluates against the snapshot to `met | unmet | unknown` and `unknown` blocks execution. Section 5 and 12.
10. **What cannot be done, stated plainly:** no public owner-to-account reverse index exists for XO (refuted [19]) or Opinion's Safe (NOT FOUND); full-history `eth_getLogs` owner lookups are refused by every free public RPC I tried [U12]; Predict.fun, SX Bet, Kalshi, Gemini, Novig, OG/CDNA, UDX and ProphetX user data need the user's own key or are effectively unavailable; Polymarket and XO open orders need the user's venue credential. The graph shows these as typed gaps, not as empty tables. Section 4, 11, 14.

---

## 1. Method, compliance and what was and was not done

- **Read first:** the status banner of `docs/plan.md` (via `[PG]`), `[PG]` sections 0 and 9, `[AD]` sections 1 to 3, `[26]` (whole), `[DD]` sections 2 and 4, `[VC]` P0/P1 headings, `[19]`, `[40]` section 0, and the code that this note extends: `app/src/features/portfolio/{types,targets,readers,valuation}.ts`, `app/src/features/wallet/{account-map,balances}.ts`, `app/src/core/{bindings,account,venue-policy,ports,money}.ts`, `pm/types.ts`, `pm/adapters/types.ts`, `pm/tools/index.ts`, `src/xo/account/derive.ts`.
- **Live probes:** about 110 HTTP requests (GET, `OPTIONS` preflight, read-only JSON-RPC) across about 25 hosts, each at least 1 s after the previous to the same host, with a foreign `Origin: https://dapp.example` header so that CORS answers describe an arbitrary web page. Read-only JSON-RPC (POST transport, read methods only) to `polygon-bor-rpc.publicnode.com`, `bsc-rpc.publicnode.com`, `bsc-dataseed.bnbchain.org`; `OPTIONS` preflights only elsewhere. Full list in the Verification section.
- **Deviations to disclose:** (a) JSON-RPC is POST on the wire, so "no POST to third parties" was read as "no state-changing request", consistent with `[19 §1]`; (b) one full-history `eth_getLogs` was attempted to test reverse lookup and was refused by two hosts (reported as a finding, not retried); (c) two `eth_getLogs` windows on Polygon were slow and ran in the background; (d) I queried the Polymarket profile route for the public Anvil test address and three freshly deployed wallets, which returned a stranger's public profile once; I used only its `proxyWallet` field and discarded the rest.
- **Not done, deliberately:** no Hyperliquid `/info` call (POST), no Kalshi, Gemini, Novig, UDX, OG or SX key-gated route, no call that needs a credential, no scraping of any venue web app, no use of undocumented app JSON (Trueo `initialMarkets`, `api.trueo.com`).

---

## 2. What already exists, what this note adds, and corrections to earlier notes

`[26]` and `[DD §4]` already specify the market-and-position read model (transport classes T0 to T4, `AddressBinding`, `Position`, `Order`, `Fill`, valuation and terms rules R1 to R10, a day-zero table). `app/src/features/wallet/account-map.ts` already derives the XO Kernel account per chain and classifies its code. `app/src/features/portfolio/targets.ts` already plans which venue is asked about which saved address. This note **does not repeat them**. It adds:

| Added here | Why it was missing |
|---|---|
| A node-and-edge **account graph** with per-edge control evidence and a six-grade ladder | `AddressBinding.kind` is a flat enum (`eoa`, `kernel`, `venue_proxy`, `solana`, `venue_account`); it records *what an address is*, not *why it is the user's* |
| **Discovery functions per venue** (derive, factory read, registry, profile, chain-ownership read) with live validation | `[26 §7]` said the dApp "never computes a Polymarket wallet"; the published algorithm is now verified (section 4.2) |
| **Balances as first-class**, with custody and asset identity | `PortfolioRow` is per position; cash is a `facts` line on `VenueReadOk` |
| **Open orders by address** where they are public (Pascal, Hyperliquid) | `[26]` said none exist |
| A `Move` node shape, so the planner and the agent consume the same snapshot | not specified in `[26]`/`[DD]` |
| Link-by-signature protocol | `AddressBinding.source` is `pasted | agent_import | derived`; no proof field |

**Corrections to earlier notes** (this note's live probes override their bodies):

| Earlier claim | Correction | Evidence |
|---|---|---|
| `[26 §4.3]` "the dApp never computes a Polymarket wallet; Polygon derivation is not re-derived; the local code's Safe-proxy derivation is wrong [13 §5.1]" | Polymarket publishes three derivations (Proxy, Safe, Deposit Wallet) in its own SDK; I reproduced the Safe against Gamma and the Deposit Wallet against 4 of 4 on-chain deployment events. It stays a *candidate* until code is seen on chain (and control is read), but it is computable offline | [S:pm-relayer], [U2], [U4], [U5] |
| `[26 §13]` "no public orders-by-address on any venue in scope" | Pascal `GET /api/v1/accounts/{owner}` returns open orders; Hyperliquid `openOrders` by user is public | [U14], [S:hl-docs] |
| `[26 §4.9]` Opinion "CORS NOT TESTED", `[AD §3.2]` Opinion reads "5 rps live (docs say 15 with key)" | CORS reflects the origin for `openapi.opinion.trade` (T0); live headers show `x-ratelimit-limit-second: 5`; positions and trades by wallet need no key; open orders need a key bound to the "Opinion Login Wallet" | [U8] |
| `[DD §4.3]` "Opinion: out of scope" | Opinion positions are readable by address; the unresolved part is *which* address (EOA vs the Safe), which Opinion's own docs do not state | [U8], [U9] |
| `[19 §2]` "Data API `creator.walletPublicKey` is the smart account" and "`smart_account` registry flag" implying registered accounts | Mostly confirmed, with one live counter-case: a creator account holding USDC.e on chain returns `smart_account: null` from the orderbook, so `walletPublicKey` can be an unregistered (orderbook-wise) account | [U15] |

---

## 3. The graph: nodes, edges, and what "mine" means

### 3.1 Picture

```
  OWNERS (signing identities, held by the user)             ACCOUNTS (places value sits)                 HOLDINGS
  ---------------------------------------------             ------------------------------               ---------------------------
  O1  PayBox EVM address  0xAAAA...                         A1  EOA 0xAAAA... (evm: Base, BNB, ...)  --> balances (USDC, USDT, TYD ...)
        |  controls (self)                                  A2  XO Kernel v3.1  (derive, 3223)       --> USDC.e on chain  | orderbook cash | positions
        |-----------------------------------------------> A3  Polymarket Deposit Wallet (derive, 137) --> pUSD | positions (CTF) | open orders*
        |  derived_origin  --- chain_owned? (owner() read)  A4  Polymarket Safe / Proxy (legacy)      --> same, only if code present
        |                                                   A5  Predict Account = Kernel v3.1 (56)    --> USDT | positions*  (*needs key)
        |                                                   A6  Opinion Safe (56)  (venue-created)    --> USDT | positions (by address)
        |                                                   A7  Perps account (Polymarket, owner addr)--> registered? | balances*  (*auth)
        |                                                   A8  Hyperliquid master / sub-accounts / HIP-4 outcome tokens
  O2  Solana key  Gm...                                     A9  Pascal account (owner pubkey) + deposit PDA --> collateral | orders | positions
  O3  other EOA (Privy-embedded, MetaMask)                  A10 SX proxy wallet (Safe on 4162), Limitless EOA, Trueo (plain ERC-20s)
  O4  venue login (Kalshi, Gemini, ...)  -- not an address  A11 custodial USD ledger (Kalshi, Gemini, Novig, OG, UDX, ProphetX) --> balance*, positions*
```

An **owner** is something the user can sign with. An **account** is something that holds value or positions. An EOA is both: it is an owner and an account (kind `eoa`), joined to itself by a `self` edge.

### 3.2 Edge kinds

| Edge | Meaning | Evidence it can carry |
|---|---|---|
| `controls` | owner can authorise actions on the account | `self`, `derivation`, `chain_read`, `venue_attestation`, `signature`, `user_assertion` |
| `delegates` | owner has authorised a limited signer on the account (Hyperliquid agent, Pascal trading key, Polymarket session key) | venue read (`GET /api/v1/accounts/{owner}/trading-keys` for Pascal [S:pascal-docs]); Hyperliquid `userRole: agent` [S:hl-docs] |
| `sub_of` | account is a sub-account of another (Hyperliquid) | `subAccounts`, `userRole: subAccount {master}` [S:hl-docs] |
| `custody_at` | account's assets are held *credited by a venue*, not on the account's own address | venue read; this is how the XO "orderbook cash" and every custodial USD ledger are represented |
| `deposit_target` | a specific address on a specific chain where a deposit for the venue account must be sent | Pascal `deposit_address` (immutable once set) [S:pascal-docs]; Novig single-use Coinflow address [VC] |

### 3.3 Why derivation alone is not control (live)

[U7]: the Safe at `0xd93B...6E47` is exactly `deriveSafe(0xf39F...2266)` with Polymarket's published constants and is also the `proxyWallet` Gamma returns for that address [U1, U2]. Its current state (Polygon, public RPC and Safe Transaction Service agree): `threshold 1`, `owners [0xD402...312d]`, `nonce 34`, version 1.4.1. The original owner is the public Foundry test key, so it is reasonable (M) that the Safe was taken over; whatever the cause, **the derived address and its current controller can differ**. Consequences, all binding for the design: (i) a derived account is `derived_origin` until an ownership read succeeds; (ii) the read is repeated on every snapshot, because owners change; (iii) if the read returns a different owner the edge becomes `conflicted` and the account is *removed from the user's totals and from any move source*, with a visible reason.

A second, general hazard (M, general Safe behaviour, not tested here): Safe owner lists are not consent-based, so `GET .../owners/{eoa}/safes` can list Safes that merely include the user's address. For the public Anvil address the Safe Transaction Service on BNB Chain returned 9 Safes [U6]. The graph never adopts such a Safe: it is shown under "contracts that list you as an owner (not counted)" unless it is the account a venue bound (e.g. Opinion's, section 4.4).

---

## 4. Per-venue account discovery and reads

Legend for the access column used throughout: **PUB** = public by address, no credential; **PUB+** = public by address and browser-readable (CORS permits an arbitrary origin); **RELAY** = public by address but the browser is blocked (no CORS header, or WAF 403 on `Origin`), so it needs the user's own local daemon; **KEY** = needs the user's own credential, held by the daemon, never the browser or the author; **N/A** = not available to non-eligible users or not offered. Transport classes T0 to T4 are `[26 §2.1]`.

Every row below is one `VenueAccessMatrix` entry (section 5.6). A cell that says **NOT FOUND** is a typed gap, not an omission.

### 4.1 XO Market (chain 3223; USDC.e; Kernel v3.1)

| Item | Finding | Tag |
|---|---|---|
| Account model | The venue forces a **Kernel v3.1** smart account as maker and signer (`signatureType 3` only). The owner is any EOA (the user's PayBox EVM credential). Index 0, no hook, salt 0 | H [19 §0], [PG §2.1] |
| Discovery (owner to account) | **Pure function**, offline: `CREATE2(KernelFactory 0xaac5...E419, keccak256(initData(owner) ++ bytes32(0)), ERC-1967 init-code hash(impl 0xBAC8...4b4D))`. Implemented in `src/xo/account/derive.ts` and `app/src/core/account.ts`. Re-derives 2,627 of 2,627 on-chain XO accounts [19]. **No registry lookup exists**: `balance-allowance?address=<owner>` returns `smart_account: null` for owners (18 of 18) | H [19 §0, §6] |
| Present? | Explorer `GET /api/v2/smart-contracts/<account>` (404 = no code); never `is_contract` (false for deployed Kernels on this explorer) [19 §2]. Today one creator account returned `is_contract: true`, `implementations [0xEF2D...d6Bf]` and a creation transaction hash [U15], so the flag is inconsistent between accounts or over time; the `smart-contracts` route (and `eth_getCode` where an RPC exists) stays the test | H |
| Registered with the orderbook? | `GET orderbooks.xo.market/balance-allowance?address=<ACCOUNT>` returns `{balance, allowance, smart_account}`; `smart_account` is the queried address if registered else `null`. Registered state is **not** implied by code present or a funded balance [U15] | H |
| Current owner (control) | Validator storage read on chain 3223: **NOT TESTED** (chain RPC needs a private key [02]; the explorer's read-method query is POST). On BNB, where the same validator exists, `ecdsaValidatorStorage(kernel)` returned the owner for the account I tried (`0x9eC0...8097`, matches the registration event) [U11]. For XO accounts the owner is known from derivation input, so control stays `derived_origin` until the 3223 read is proven | H (BNB), NOT TESTED (3223) |
| Balances | Three surfaces, **not interchangeable**: (1) explorer `GET explorer-mainnet.xo.market/api/v2/addresses/{a}/token-balances` (chain truth: USDC.e `0x80c1...ab0c`, 6 dp; XOM), PUB+ (`ACAO *`, `x-ratelimit-limit 300`) [U15]; (2) orderbook `/positions?address=` `cash_balance` (venue-credited), RELAY (no ACAO) [U15]; (3) `balance-allowance` `balance/allowance`, RELAY. For one live creator account (2026-10-20): explorer USDC.e raw `4704236695` (4,704.236695), orderbook `cash_balance "0"`, `smart_account null`, Data API portfolio empty [U15] | H |
| Positions | Data API `GET api-mainnet.xo.market/api/users/portfolio?user=<ACCOUNT>&status=all` (PUB+, `ACAO *`, `x-ratelimit-limit: 50` observed vs 100 per 10 s documented). Empty shape captured: `{"data":[],"meta":{"page":1,"take":10,"itemCount":0,"pageCount":0,"hasPreviousPage":false,"hasNextPage":false}}`. **Populated shape still never observed** (the one creator I tried had none) [U15, 02 §2.2]. Orderbook `/positions` shape captured empty: `{"cash_balance":"0","positions":[]}`; token ids and micro-shares need the Data API join [26 §4.2] | H (empty), M (populated) |
| Open orders / fills | L2 HMAC only (live 401 [02 §0]); needs the XO credential triplet, itself gated by the unresolved wallet-ownership doors [PG §0 item 3]. No public tape | H |
| CORS / limits | Data API and explorer: T0. Orderbook host: T1 (no ACAO; echoes only `http://localhost:3000`) [26 C1]. Orderbook 5 req/s public; Data API see above | H |
| Terms on display | Bots allowed if compliant; "harvest or scrape data ... for unauthorized purposes" barred; display by address is not scraping on any natural reading [03 §5] | H text, M reading |

**Graph consequence.** XO yields up to three `Balance` rows per account (`self_account` from the explorer, `venue_credited` from the orderbook, `order_reserve` as `reserved` inside positions), kept apart. The registered/unregistered difference is a first-class `registration` fact on the account node.

### 4.2 Polymarket (Polygon 137; pUSD; plus Perps and Combos)

| Item | Finding | Tag |
|---|---|---|
| Account models | **Deposit Wallet** (all wallets deployed on or after 2026-05-04; ERC-1967 proxy from the Deposit Wallet Factory), **Safe** (legacy, external signer), **Proxy** (legacy, Magic Link or Google) [S:pm-docs wallets-auth]. A wallet created since the 2026-06-29 upgrade is a **beacon** proxy; earlier ones are UUPS proxies (the SDK tries UUPS first, uses it if code exists, else beacon) [S:pm-relayer `deriveDepositWalletAddress`; DD §2.3 V4] | H |
| Discovery (owner to wallet) | Three offline pure functions, constants from Polymarket's own repo: **Safe** `CREATE2(0xaacF...541b, keccak256(abi.encode(owner)), 0x2bce...cecf)`; **Proxy** `CREATE2(0xaB45...4052, keccak256(abi.encodePacked(owner)), 0xd21d...a00b)` (owner is the *Magic* key, not a PayBox EOA); **Deposit Wallet** `args = abi.encode(factory 0x0000...Cc07, bytes32(owner))`, `salt = keccak256(args)`, init-code hash = Solady `initCodeHashERC1967Beacon(beacon, args)` with `beacon = factory.beacon()` (selector `0x49493a4d`, returned `0x7A18...fc3a` today [U3]) or `initCodeHashERC1967(implementation 0x58CA...b1eB, args)` for UUPS. **Validation:** Safe derivation for the Anvil test address equals Gamma's `proxyWallet` [U1, U2]; Deposit Wallet derivation equals the indexed wallet topic of 4 of 4 sampled deployment events on the factory (three from the last 3,000 blocks, one from about 1,000,000 blocks earlier) (topic0 `0x7441de0a...8276`, topics = wallet, owner, walletId, data = beacon) [U4]; for one of them `eth_getCode` shows a 146-byte ERC-1967 beacon proxy (`0x363d3d37...5c60da`) and `owner()` returns the owner [U5] | H |
| Reverse index | The factory's deployment event is an on-chain owner-to-wallet index (owner is topic 2), usable only over a recent window: Polygon public RPC answered a 1,500-block window 1,000,000 blocks back [U4b]; full-history queries are refused on BNB hosts [U12]. So: **derive, then confirm with code and `owner()`**, never log-scan | H |
| Profile route | Gamma `GET /public-profile?address=` accepts a user or proxy address and returns `proxyWallet`, `createdAt`, `name`, `users[]`, `verifiedBadge`, `takerTier`, `weightedVolume` [U1]. **A fresh wallet has no profile**: 404 `{"type":"not found error","error":"profile not found"}` for one owner and two freshly deployed wallets [U20b]. 404 therefore means "not seen trading", not "no account" | H |
| Current owner (control) | Deposit Wallet: `owner()` returns the EOA (H, one wallet) [U5]. Safe: `getOwners()` / Safe Transaction Service `GET /tx-service/pol/api/v1/safes/{safe}/` (keyless, `ACAO *`, `x-ratelimit-limit 5000`) [U7]. Proxy wallet: NOT FOUND (searched: SDK source, docs) | H / NOT FOUND |
| Balances | pUSD (`0xC011...2DFB`, 6 dp [S:pm-docs contracts]) via `eth_call balanceOf` on the wallet (T0-RPC); positions value `GET data-api.polymarket.com/v2/value?user=` (PUB+) [U20] | H |
| Positions / activity / fills | Data API v2 (PUB+, `ACAO *`, `cache-control public, max-age 5 to 15`): `/v2/positions?user=&status=OPEN|REDEEMABLE|...`, `/v2/activity?user=`, `/v2/trades?user=`, `/v2/value`, `/v2/user-pnl`, `/v2/approvals`, `/v2/positions/combos` [S:pm-docs wallet-activity]. Shapes captured: empty positions `{"data":[],"pagination":{"limit":1,"offset":0,"has_more":false,"next_cursor":null}}`; one activity row has keys `proxy_wallet, timestamp, condition_id, type ("TRADE"), size, usdc_size, transaction_hash, price, token_id, ...` [U20] | H |
| Open orders | CLOB `GET /data/orders` needs L2 API credentials (a signature by the owner/signer, created by the user) [08 §2.2] | H [08] |
| Perps account | Separate account keyed by the owner address. **Registration is a public GET**: `GET api.perpetuals.polymarket.com/v1/info/registered?address=` returned `{"registered":true}` for the Anvil address (`ACAO *`, `cache-control max-age 300, s-maxage 86400`) [U20c]. Balances, open orders, fills need an authenticated session; position snapshots have a public POST variant (NOT TESTED, POST) [S:pm-docs perps] | H / NOT TESTED |
| Combos | `/v2/positions/combos`, `/v2/activity/combos` (separate product; relation to the main book unknown [PR §4.2]) | M |
| CORS / limits | all T0. Documented limits: Gamma `/public-profile` and markets 300 to 900 per 10 s; Data v2 800 per 10 s; CLOB `/book` 1,500 per 10 s [08 §2.6] | H [08] |
| Terms on display | redistribution terms for Gamma/CLOB/Data NOT FOUND [08 §2.11]; geoblock route `polymarket.com/api/geoblock` reports the caller's own status | H absence |

**Candidates, not claims.** The graph derives all applicable candidates (Safe, Deposit Wallet beacon and UUPS, plus Proxy only for a Magic-key owner), batches one `eth_getCode` per candidate in a single JSON-RPC batch, drops candidates with no code, then reads ownership. Code present with a foreign owner = `conflicted`.

### 4.3 Predict.fun (BNB Chain 56; USDT 18 dp; EOA or "Predict Account")

| Item | Finding | Tag |
|---|---|---|
| Account models | Either a plain EOA or a **Predict Account**, a smart wallet "automatically created" by the web app and shown as the **deposit address** in account settings. The SDK pins Kernel domain `{name "Kernel", version "0.3.1"}`, Kernel implementation `0xBAC8...4b4D`, ECDSA validator `0x845A...cE57` for BNB mainnet (the same constants as XO's) and routes every step through `Kernel.execute` when `predictAccount` is set [S:pf-sdk `Constants.ts`, README]. Owner = the **Privy wallet** from account settings, exportable [S:pf-sdk README step 1], an independently confirmed finding [40 §0 item 2] | H |
| Discovery | Same Kernel derivation as XO (index 0, no hook) is a **candidate** for any owner EOA: 18 of 18 ECDSA-validator registrations in a 4,000-block BNB window re-derive with `src/xo/account/derive.ts` [U11]. Whether Predict's own accounts are index 0 with no hook is **unverified** (their API is keyed [U10]); so the derived address is shown only as a candidate and the user's pasted deposit address wins. Controlling owner: read `ecdsaValidatorStorage(account)` on the validator (H on BNB) [U11]; it will be the Privy wallet, not necessarily the PayBox EOA, which makes the owner an **unproven owner** the user must prove separately or accept as `chain_owned` to an owner marked "not yours yet" | H / M |
| Balances | USDT on BNB (`eth_call balanceOf`, T0-RPC); positions are ERC-1155 balances in the `ConditionalTokens` contracts, whose token ids need the market API (keyed) | H |
| Positions / orders / fills | `GET api.predict.fun/v1/positions/{address}` exists ("Get positions by address") but **requires `x-api-key` on mainnet**; today it returns `401 {"success":false,"code":401,"error":"unauthorized"...}` and `ACAO` reflects the origin [U10]. Orders are "your own orders" (JWT). Mainnet default limit 240 requests per minute per key [S:pf-docs FAQ] | H |
| Day-zero | account candidate + validator owner + USDT balance only. Positions need the user's own key from `developers.predict.fun` (self-service), held by the daemon | H |
| Terms on display | ToS 2025-11-18 bars scraping by robots but offers official keys; excluded jurisdictions listed [AD §3.4], [40 §0 item 9] | M |

### 4.4 Opinion (BNB Chain 56; USDT; Gnosis Safe "trading wallet")

| Item | Finding | Tag |
|---|---|---|
| Account model | The EOA logs in (wallet connect and a signed message); funds sit in a **Gnosis Safe v1.3.0** "multi_sig_wallet" (SDK `multi_sig_addr`, "Assets wallet"); "Enable Trading" approves exchange and CTF from the Safe [S:op-docs SDK architecture, Get User] | H |
| Discovery | **Builder-mode `get_user(wallet_address)` returns `multi_sig_wallet` and `enable_trading`, but it is a builder (partner) API**, not available to an ordinary user [S:op-docs builder-mode]. Whether the Safe address is a function of the EOA: **NOT FOUND** (searched: SDK docs, authentication, architecture pages). Practical discovery for a user: (a) paste the "assets wallet" address shown in Opinion's UI, then **prove control on chain** with Safe `getOwners()` (keyless, [U7]-style); (b) optional candidate list from the Safe Transaction Service `GET api.safe.global/tx-service/bnb/api/v1/owners/{eoa}/safes/` (keyless, `ACAO *`, `x-ratelimit-limit 5000`, `x-ratelimit-reset 2592000`), narrowed to Safes for which Opinion returns data [U6]. Never adopt a Safe from the owner list alone | H / NOT FOUND |
| Which address do public routes want? | `GET /positions/user/{walletAddress}` and `/trade/user/{walletAddress}`: Opinion's own docs, asked directly, say the page **does not specify** whether `walletAddress` is the EOA or the Safe [U9]. The graph asks **both** addresses and records which answered with rows; both empty = `no_activity_seen` | H (docs gap) |
| Balances | USDT (`0x55d3...7955`, 18 dp) via `eth_call balanceOf` on the Safe (T0-RPC). Quote-token route lists the quote tokens [S:op-docs] | H |
| Positions | `GET openapi.opinion.trade/openapi/positions/user/{wallet}?limit=20&page=` **keyless**, `access-control-allow-origin` reflects the origin, `x-ratelimit-limit-second: 5` (docs say 15 [S:op-docs rate-limiting]); empty shape captured `{"errmsg":"","errno":0,"result":{"list":[],"total":0}}`. Row keys: `marketId, marketTitle, marketStatus, outcome, outcomeSide, sharesOwned, sharesFrozen, unrealizedPnl, dailyPnlChange, conditionId, tokenId, currentValueInQuoteToken, avgEntryPrice, claimStatus, quoteToken` [S:op-docs position OpenAPI, U8] | H |
| Fills | `GET /trade/user/{wallet}` keyless, same CORS/limits [U8] | H |
| Open orders | `GET /order` returns `401 {"errmsg":"This API Key has no related Opinion Login Wallet yet","errno":11001}` without a key; the key is self-service via an EIP-712 wallet signature once the wallet is a registered account [U8, S:op-docs authentication] | H |
| Terms on display | ToS bars scraping by robots but offers official keys; US, UK, France, Ontario, Singapore and others excluded [AD §3.4] | M |

Untrusted-text note: Opinion market `rules` and titles in the same API are attacker-controlled market text (the live market list contains long `rules` strings) and enter the graph only inside `Untrusted<string>` slots.

### 4.5 Limitless (Base 8453; USDC 6 dp)

| Item | Finding | Tag |
|---|---|---|
| Account model | The Base EOA itself (trading mode EOA, or a Privy embedded EOA) | M [09 V-B3] |
| Discovery | Account = the owner address; no derived or venue-forced account | M |
| Positions | `GET api.limitless.exchange/portfolio/{account}/positions` **keyless**; response keys `amm[], clob[], group[], points, rewards{todaysRewards, rewardsByEpoch[], rewardsChartData[], totalUnpaidRewards, totalUserRewardsLastEpoch}, accumulativePoints` (captured empty for the Anvil address); `cache-control: public, max-age=5, s-maxage=15`. **No `ACAO`** for a foreign origin: RELAY [U13] | H |
| Other public | `/portfolio/{account}/traded-volume` returns `{"data":"0"}` [U13]; `/profiles/{account}` returns 401 | H |
| Open orders | `GET /markets/{slug}/user-orders` needs the HMAC token [26 §4.5] | M |
| Balances | USDC via `eth_call` on Base (T0-RPC) | H |
| Terms | bots explicitly allowed (ToS 2026-09-15); US, "Republic of China", Ontario, Alberta excluded [AD §3.4] | M |

### 4.6 Trueo (Base 8453; TYD 6 dp, YES/NO 18 dp)

Account = any address that holds the outcome ERC-20s; no registration, no API [11]. Positions: `getUserPosition(address) -> (yes, no)`, `getUserClaimableAmount(address)`, `balanceOf` of `yesToken()`/`noToken()` per market, enumerated through `TruthMarketManager.getActiveMarketAddress(i)`; all T0-RPC, one batched call per refresh [26 §4.6]. Balance: TYD is an ERC-4626 share, **not USD** (`convertToAssets`) [11 §12]. Orders: none (AMM on Uniswap v4). Fills: swaps are the history (`eth_getLogs`, opt-in). Do not use `api.trueo.com` or the app's embedded JSON [11 V]. H/M as tagged in `[26]`.

### 4.7 Hyperliquid HIP-4 outcomes (HyperCore; USDC; account = signer)

All reads are `POST https://api.hyperliquid.xyz/info`; I sent none, so everything here is **docs-only (M)** except the CORS preflight (`OPTIONS` answered 200 with `ACAO *`, methods `*`, headers `*` [U18]).

| Item | Finding |
|---|---|
| Account model | The account **is** the signing address; the same EOA on HyperEVM. Sub-accounts are separate addresses owned by a master; agents (API wallets) are approved signers; vaults are separate. "To query the account data associated with a master or sub-account, you must pass in the actual address of that account. A common pitfall is to use an agent wallet's address which leads to an empty result" [S:hl-docs info-endpoint] |
| Discovery | `{"type":"userRole","user":a}` returns `{"role":"user"|"agent"|"vault"|"subAccount"|"missing", "data":{...}}` (agent gives `data.user`, sub-account gives `data.master`); `{"type":"subAccounts","user":master}` lists `[{name, subAccountUser, master, clearinghouseState, spotState}]`; `{"type":"userVaultEquities"}` for vault deposits. **Weights: `userRole` 60, `subAccounts` 20, `userVaultEquities` 20** against 1,200 per minute per IP [S:hl-docs rate-limits]. So a full walk costs about 100 weight, about 8 percent of the minute |
| Balances | `spotClearinghouseState` (weight 2) is "the source of truth for trading account balance across spot and perps" under unified account or portfolio margin; `clearinghouseState` (weight 2) for perps margin [S:hl-docs] |
| HIP-4 positions | Outcome tokens appear as spot balances whose `coin` is `+<encoding>` (docs example `{"coin":"+1230","total":"25.0","entryNtl":"12.5"}`); `encoding = 10*outcome + side`; the book coin is `#<encoding>`; resolve names with `outcomeMeta` and `outcomeTemplates` [S:hl-docs spot, VN:hyperliquid-hip-4-outcomes-native]. Live shape **NOT TESTED** (POST) |
| Open orders / fills | `openOrders` / `frontendOpenOrders` (weight 20) and `userFills` (20 plus 1 per 20 rows) by `user`, public [S:hl-docs] |
| CORS | preflight `ACAO *` [U18]; actual POST response headers NOT TESTED |
| Terms | "Excluded Persons" list is open-ended and unpublished [VC]; bots that "exceed reasonable usage" barred [26 §5.1]. The graph shows the clause; it cannot compute eligibility |

### 4.8 Pascal (Solana; USDC; owner pubkey)

| Item | Finding | Tag |
|---|---|---|
| Account model | One account per Solana wallet. The owner key does custody (withdrawals, trading-key lifecycle); a separate Ed25519 **trading key** (max 10, expiry at most 365 days, cannot withdraw) signs orders. Deposits go to an immutable **deposit address PDA** per owner, registered with a wallet-signed request [S:pascal-docs api: "Register A Deposit Address"] | H |
| Discovery | Account = owner pubkey (no derivation). `GET data.pascal.trade/api/v1/accounts/{owner}/trading-keys` lists delegates (documented, PUB). Deposit address: present in the register response; "immutable once set"; the PDA derivation is **NOT FOUND** in the docs (program id not published [VC]) | H / NOT FOUND |
| Snapshot | `GET data.pascal.trade/api/v1/accounts/{owner}` (optional `symbol`, `exclude_orders`): returns `has_deposited, username?, twitter_account_connection?, collateral_usd, rewards{...}, lifetime_stats{maker,taker}, orders[], positions[], pending_deposits[], pending_withdrawals[]`. **Captured live for the System Program pubkey**: `{"status":"success","data":{"has_deposited":false,"collateral_usd":"0.000000","rewards":{...zeros...},"lifetime_stats":{"maker":{...zeros},"taker":{...zeros}},"orders":[],"positions":[]...},"server_time_ms":"..."}`; `ACAO *`; `cache-control: no-store`; docs: "may be served from cache for up to 1 second" [U14] | H |
| Position shape | `PositionMsg`: `symbol, size` (signed i64 string; positive long, negative short), `cumulative_increasing_notional_usd`, `cumulative_fees_usd`, `realized_pnl_usd`, `unrealized_pnl_usd`, `mark_price`, `average_entry_price`, `open_ts_ms`, `update_ts_ms`. A short of q at p is NO exposure with entry `1-p` [26 §6.1] | H |
| Balances | `collateral_usd` (free collateral, venue-credited) plus `pending_deposits[]`; on-chain USDC in the deposit PDA via Solana RPC `getTokenAccountsByOwner` | H / M |
| Limits | Read endpoints "have their own lower limits" (HTTP 429 `RATE_LIMITED`), numbers NOT FOUND; WebSocket `wss://data.pascal.trade/ws` account channel for live state [S:pascal-docs] | H |
| Terms | ToS "Platform Data" clause (professional / fintech / market-data-distributor exclusion) is open; restricted jurisdictions include the US, UK, Germany, France, Singapore, Australia and others; the write API enforces them by Cloudflare headers, reads were not geo-blocked [VC] | M |

### 4.9 SX Bet (SX Rollup 4162; USDC 6 dp; proxy wallet)

| Item | Finding | Tag |
|---|---|---|
| Account model | The EOA signs (the "maker"); capital sits in a per-user **proxy wallet with an attached Safe** deployed through the API; SX sponsors bettor gas [VC], [S:sx-oa `/user/deploy-proxy`, `/user/multisig/*`] | H |
| Discovery | `GET /user/proxy` ("your proxy wallet") and `/user/multisig/proxy/{proxyAddress}` are **KEY** routes. Derivation of the proxy address from the EOA: **NOT FOUND**. Control proof: read Safe `getOwners()` on SX Rollup RPC `https://rpc-rollup.sx.technology` for a pasted proxy address (NOT TESTED) | H / NOT FOUND |
| Balances | `/user/balance-v3` KEY; or on-chain USDC (`0x6629...F050B`) in the proxy via the SX explorer `explorerl2.sx.technology/api/v2/...` (Blockscout, `ACAO *`, [U19]) | H |
| Positions / orders / fills | `/positions-v3`, `/orders-v3`, `/fills-v3`, `/trades-v3`: all `SxApiKey` (the OpenAPI marks every user route key-gated) [S:sx-oa]. `GET /positions-v3/public?userAddress=` ("de-anonymized positions") is also key-gated and subject to the user's privacy setting (`/user/privacy-v3`) [S:sx-oa] | H |
| CORS | `api.sx.bet`: no `ACAO` (RELAY) [26 C7e, U19] | H |
| Day-zero | explorer balance of a pasted proxy only. Positions need the user's own scoped key | H |

### 4.10 Manifold (play money; username)

`GET api.manifold.markets/v0/get-user-portfolio?userId=` and `/v0/user/{username}` are keyless with `ACAO *` and `cache-control public, max-age 1 to 5` [U16]. The portfolio object has `balance, cashBalance, investmentValue, loanTotal, totalDeposits, dailyProfit, ...` in Mana. **Manifold has no wallet**: an account cannot be tied to an owner address by any chain read, so its control grade can be at most `watch_only` or `proven` by a user-supplied proof (e.g. posting a nonce to the user's own profile; NOT DESIGNED, out of scope). Play-money assets are never added to any real-money total (`AssetRef.kind = "play_money"`).

### 4.11 Account-bound venues (Kalshi, Gemini, OG/CDNA, Novig, UDX, ProphetX, Polymarket US)

These accounts are **not addresses**. They are `venue_login` owners with a `custodial USD ledger` account, found only by the user configuring a key in the daemon; the browser never holds it [26 §2.3]. Public market data is covered in `[26 §4]`; the user-side facts:

| Venue | Account facts | User data | Display terms (as read in the notes; not legal advice) |
|---|---|---|---|
| Kalshi | USD account; read-scoped API keys exist; key carries a location attestation since 2026-08-16 [08 §4.8] | signed `GET /portfolio/positions|orders|fills|settlements|balance` (KEY, RSA-PSS or Ed25519). Public reads: browser `Origin` gets **403**, no `Origin` gets 200 (re-confirmed today [U21]) | Developer Agreement v1.1: own trading only; no caching, aggregating, storing except for own trading; no facilitating others; no benchmarking [08 §4.9] |
| Gemini Predictions | USD, HMAC-SHA384, `Trader` role | `/v1/prediction-markets/positions`, `/orders/active`, `/orders/history` (KEY). Public events: `ACAO` reflects origin [U21] | "Gemini Market Data is proprietary"; no derivative products [VC] |
| OG / CDNA (ex-Nadex) | USD; FCM onboarding, conformance sign-off, HMAC | `private/*` N/A for non-onboarded users. Public events: `ACAO` reflects origin [U21] | public REST terms NOT FOUND; separate EULA feed is non-commercial [VC] |
| Novig | USD ledger at Bitnomial; US-resident KYC'd individuals only | NOVIG-V3-signed routes with a trading key that can place orders (KEY, effectively N/A); public `types` routes `ACAO *`, `cache-control max-age 3600` [U21] | redistribution terms open [VC] |
| UDX | USD; Underdog account; RSA-PSS key | key-gated; public `markets` (no `ACAO`, `ratelimit "read";r=7;t=1`, `ratelimit-policy q=8;w=2`) [U21] | bars automated access other than approved APIs [26 §5.1] |
| ProphetX | partner contract | N/A | internal business use only [VC] |
| Polymarket US | SSN-KYC'd; separate pool [PR §4.2] | authenticated host only | public gateway REST 25 req/s [08 §3] |

### 4.12 World (PayBox official, Solana) and PayBox's own view

The catalogue is not publicly queryable; the 11 `world_*` tool names are from a third-party capture [14 §8.1]. Data reaches the graph only as a **T3 import**: the user's agent calls `use_plugin(world_*)` and hands the result to `ua_import` with `source: "paybox_plugin"`. The PayBox connector's own `get_portfolio` / `list_credentials` output is likewise a T3 source (first-party tool output, but still data, not instructions). I did not call either.

### 4.13 Cross-venue summary of discovery functions

| Venue | Owner to account | Function | Present check | Current-owner check | Reverse index | Offline? |
|---|---|---|---|---|---|---|
| XO | Kernel v3.1 | CREATE2 (factory, initData(owner), salt 0) | explorer `smart-contracts/<a>` | validator storage (3223 NOT TESTED) | none (refuted) | yes |
| Polymarket | Deposit Wallet / Safe / Proxy | CREATE2 (3 recipes) | `eth_getCode` Polygon | `owner()` / `getOwners()` | factory deployment event, recent window only | yes (+ factory `beacon()` once) |
| Predict.fun | Kernel v3.1 (candidate) | same as XO | `eth_getCode` BNB | `ecdsaValidatorStorage` | validator `OwnerRegistered(kernel, owner)` recent window only | yes |
| Opinion | Safe 1.3.0 | NOT FOUND | `eth_getCode` BNB | `getOwners()` | Safe Transaction Service owners route (candidates only) | no |
| Limitless / Trueo | EOA | identity | n/a | n/a | n/a | yes |
| Hyperliquid | EOA; sub-accounts; agents | `userRole`, `subAccounts` (POST) | `userRole != missing` | `userRole.data.master` | `subAccounts` | no |
| Pascal | owner pubkey | identity | `has_deposited` | n/a | trading-keys route | yes |
| SX Bet | proxy Safe | NOT FOUND (KEY route) | `eth_getCode` 4162 | `getOwners()` | none | no |
| Manifold | username | n/a | portfolio 200 | n/a | none | no |
| Kalshi, Gemini, OG, Novig, UDX, ProphetX | login | n/a | key accepted | n/a | n/a | no |

---

## 5. Data model (venue-agnostic)

TypeScript sketch of the contract; the shipping code extends the existing types as listed in 5.5. It reuses `Qty`, `Dec`, `Prov`, `Untrusted<T>`, `VenueId`, `Transport`, `Freshness`, `LicenseClass` from `app/src/core/{money,ports}.ts` and mirrors them in `pm/types.ts` for the Node side (they are already a shared vocabulary [26 §6, AD §2.1]).

### 5.1 Invariants (each is a test)

| # | Invariant | Why |
|---|---|---|
| I1 | **Missing is never zero.** A balance or position the venue did not return is `unknown`, and totals count the exclusion. An empty answer without a registration signal is `no_activity_seen`, never `verified_empty` [U20] | `/v2/value` returns 0.0 for non-existent wallets |
| I2 | **Units never mix.** Totals are keyed by `(asset.id, custody)`. pUSD, USDC, USDC.e, USDT (18 dp), TYD, `usd_ledger`, Mana and outcome shares are distinct assets. There is no implicit conversion to "USD"; a dollar view needs an explicit `FxView` with its own provenance, and a stablecoin is not assumed to equal a dollar | `QtyUnit` already separates `usd`, `usdc_e`, `tyd` |
| I3 | **Every leaf carries provenance**: source route, transport, fetch time, venue time or block, TTL, licence class. A reading without it is rejected at the adapter boundary | the app's `makeProv` |
| I4 | **Freshness is computed at read time** from an injected clock and the TTL; `stale` and `unknown` are excluded from totals and block move preconditions | `[26 §11.3]` |
| I5 | **Derived is not controlled.** `Account.control` is computed from edge evidence only (section 7.1), never stored as an assertion | section 3.3 |
| I6 | **Candidates, not adoptions.** Discovery proposes accounts; only an edge with evidence puts an account in "mine". A third-party list (Safe owner route, a profile lookup) never adopts | section 3.3 |
| I7 | **Conflict removes.** An ownership read that contradicts the edge turns the account `conflicted`, removes it from totals and from every move source, and raises a visible gap | section 3.3 |
| I8 | **Venue disagreement is data.** Two surfaces for the same fact (XO explorer vs orderbook) are two `Balance` rows with different `custody`; they are never merged or averaged | [U15] |
| I9 | **Market text is `Untrusted<string>`** and reaches the UI and the model only inside a fixed slot; account labels typed by the user are also length-capped and stripped (`sanitizeText`) | `[AD §1.2 item 6]` |
| I10 | **No credential, key or token in any graph object.** Credentialed venues appear as `credentialRef: "<label>"` only; the secret lives in the daemon vault | `[26 §2.3]`, bindings export rule |
| I11 | **Adapters never throw into the snapshot builder.** Each facet returns a `Reading`; a failure becomes `unknown(fetch_failed)` and every other venue still renders | acceptance M2-6 |
| I12 | **A snapshot is immutable and content-addressed** (`id = sha256(canonical JSON)`), so an audit entry can name exactly what the user and the agent saw | audit trail, section 12 |
| I13 | **Restricted-licence data stays memory-only** (Kalshi, Gemini, OG, UDX, Novig, ProphetX market data) while the user's *own* account rows may persist locally, as `[26 §5.2]` R3 and R4 say | terms |

### 5.2 Types

```ts
// ---- identity ---------------------------------------------------------------------------------------------
type ChainRef = `eip155:${number}` | "solana:mainnet" | "hyperliquid:core" | `ledger:${VenueId}` | "play:manifold";
type OwnerId = string;     // `${chain}:${address}`  (EVM lower-cased; base58 for Solana) or `login:${venue}:${label}`
type AccountId = string;   // same grammar; an EOA's AccountId equals its OwnerId

// ---- every field is a Reading; arithmetic over a non-ok Reading does not type-check -----------------------
type Reading<T> =
  | { state: "ok"; value: T; prov: FieldProv }
  | { state: "unknown"; why: UnknownWhy; prov?: FieldProv }          // not read, or could not be read
  | { state: "refused"; why: RefusedWhy; prov?: FieldProv }          // the venue, its terms, or our policy said no
  | { state: "not_applicable"; why: string };
type UnknownWhy = "not_requested" | "venue_off" | "needs_user_key" | "needs_relay" | "fetch_failed"
                | "rate_limited" | "stale_beyond_ttl" | "schema_drift" | "conflict" | "no_signal";
type RefusedWhy = "venue_geo" | "venue_403" | "terms_restricted" | "flag_off" | "policy";

interface FieldProv extends Prov {            // Prov from app/src/core/ports.ts (venue, source, fetchedAtMs, venueTsMs?,
                                              //   transport, freshness, ttlMs, license, schemaHash, adapterVersion)
  block?: { chain: ChainRef; number: bigint; hash?: string };   // for chain reads
  derivedFrom?: string[];                      // ids of the readings this one was computed from
}

// ---- owners and accounts ----------------------------------------------------------------------------------
interface Owner {
  id: OwnerId;
  kind: "evm_key" | "solana_key" | "embedded_wallet" | "venue_login";
  address: string | null;                      // null for venue_login
  label: string;                               // user text, sanitised, <= 48 chars
  proof: OwnerProof;                           // section 7.2
  source: "pasted" | "agent_import" | "signed_link";   // never "scraped"
}
type OwnerProof =
  | { state: "proven"; scheme: "eip191" | "erc1271" | "ed25519"; messageSha256: string; provenAtMs: number; ttlMs: number }
  | { state: "unproven" };

type AccountKind =
  | "eoa" | "solana_wallet"
  | "kernel" | "safe" | "polymarket_deposit_wallet" | "polymarket_proxy" | "polymarket_perps"
  | "hl_master" | "hl_sub" | "hl_agent" | "hl_vault"
  | "pascal_account" | "sx_proxy" | "venue_ledger" | "play_money" | "other_contract";

interface Account {
  id: AccountId;
  chain: ChainRef;
  address: string | null;                      // null for venue_ledger
  kind: AccountKind;
  venue: VenueId | null;                       // the venue that forces this account kind, if any
  label: string;
  deployment: Reading<{ code: "present" | "absent"; codeSize: number }>;       // eth_getCode, never explorer is_contract
  registration: Reading<{ registered: boolean; via: string }>;                 // XO smart_account, Perps registered, Pascal has_deposited
  edges: ControlEdge[];                        // who controls it, with evidence
  control: ControlGrade;                       // COMPUTED from edges (7.1); never set by a caller
  credentialRef: string | null;                // daemon-vault label for KEY venues; never a secret
}
type EdgeKind = "controls" | "delegates" | "sub_of" | "custody_at" | "deposit_target";
interface ControlEdge {
  from: OwnerId | AccountId; kind: EdgeKind; observedAtMs: number; ttlMs: number;
  evidence: Evidence;
}
type Evidence =
  | { kind: "self" }
  | { kind: "derivation"; fn: "kernel_v3_1_create2" | "pm_deposit_wallet_beacon" | "pm_deposit_wallet_uups" | "pm_safe" | "pm_proxy"; inputs: Record<string, string> }
  | { kind: "chain_read"; call: "safe.getOwners" | "kernel.ecdsaValidatorStorage" | "depositWallet.owner"; chain: ChainRef; result: string[]; prov: FieldProv }
  | { kind: "venue_attestation"; route: string; field: string; prov: FieldProv }
  | { kind: "signature"; scheme: "eip191" | "erc1271" | "ed25519"; challengeSha256: string; signedAtMs: number }
  | { kind: "user_assertion" };
type ControlGrade = "proven" | "chain_owned" | "venue_attested" | "derived_origin" | "watch_only" | "conflicted";

// ---- assets, balances, positions, orders -------------------------------------------------------------------
interface AssetRef {
  id: string;                                  // `${chain}:${ref|symbol}`; the totals key
  kind: "native" | "erc20" | "spl" | "hl_spot" | "ledger_usd" | "play_money" | "outcome_token" | "venue_position";
  chain: ChainRef; ref: string | null; symbol: string; decimals: number;
  peg: null | { to: "USD"; basis: "issuer_redeemable" | "venue_ledger"; verified: false };   // a claim, never verified here
}
type Custody = "self_account" | "venue_credited" | "venue_ledger" | "escrow" | "order_reserve";
interface Balance {
  id: string; account: AccountId; asset: AssetRef; custody: Custody;
  amount: Reading<Qty>; free?: Reading<Qty>; reserved?: Reading<Qty>;
}

type PositionShape = "token_holding" | "signed_net" | "long_short" | "escrow_bet" | "hl_outcome_token";
type Coverage = "complete" | "partial" | "no_activity_seen" | "verified_empty";
interface Position {                           // extends PortfolioRow (app/src/features/portfolio/types.ts)
  id: string; account: AccountId; venue: VenueId; market: Untrusted<string>; marketRef: MarketRef;
  outcome: Untrusted<string> | null; tokenId: string | null; shape: PositionShape;
  qty: Reading<Qty>; free: Reading<Qty>; reserved: Reading<Qty>; cost: Reading<Qty>; pnl: Reading<Qty>;
  pnlSource: "venue_reported" | "derived" | "unavailable";
  mark: Reading<{ price: Dec; basis: "bid" | "settlement" | "venue_reported" | "none" }>;
  status: "open" | "claimable" | "resolved_unclaimed" | "voided_refund" | "lost" | "closed" | "unknown";
  collateral: AssetRef;
}
interface Order {                              // OPEN orders
  id: string; account: AccountId; venue: VenueId; marketRef: MarketRef; outcomeIndex: number | null;
  side: "buy" | "sell"; price: Dec; size: Dec; filled: Dec; tif: "GTC"|"GTD"|"IOC"|"FOK"|"PO"|"unknown";
  expiresAtMs: number | null; reservedCollateral: Reading<Qty>;
  visibility: "public_by_address" | "needs_user_key";
}

// ---- the venue-side access matrix (static, TTL'd, in the platform registry; section 5.6) --------------------
interface VenueAccessMatrix { venue: VenueId; accounts: Access; balances: Access; positions: Access; orders: Access; fills: Access; verifiedOn: string; ttlDays: number }
type Access = { mode: "PUB" | "PUB+" | "RELAY" | "KEY" | "N/A" | "NOT_FOUND"; transport: Transport; limit: string | null; corsProbeId: string | null; note: string };

// ---- the snapshot the planner and the agent consume --------------------------------------------------------
interface GraphSnapshot {
  id: string;                                  // sha256 of canonical JSON (I12)
  asOfMs: number; clockSource: "injected";
  owners: Owner[]; accounts: Account[]; balances: Balance[]; positions: Position[]; orders: Order[];
  coverage: Record<AccountId, Record<VenueId, Coverage>>;
  totals: Array<{ assetId: string; custody: Custody; sum: Qty; rowsIncluded: number; rowsExcluded: number; exclusions: Array<"unknown"|"stale"|"watch_only"|"conflicted"|"restricted"> }>;
  gaps: Gap[];                                 // first-class: what could not be read, and why
}
interface Gap { venue: VenueId | "chain"; account: AccountId | null; facet: "accounts"|"balances"|"positions"|"orders"|"fills"; why: UnknownWhy | RefusedWhy; fix: "paste_address"|"run_daemon"|"add_own_key"|"enable_venue"|"none" }

// ---- a Move node (the planner fills cost/time/risk; the graph supplies from/to/preconditions) ---------------
type MoveKind = "cancel_orders" | "close_position" | "redeem" | "withdraw" | "transfer_same_chain" | "bridge" | "swap"
              | "deposit" | "enable_trading" | "wrap_unwrap" | "buy_outcome";
interface Move {
  id: string; kind: MoveKind; snapshotId: string;
  from: { account: AccountId; asset: AssetRef }; to: { account: AccountId; asset: AssetRef };
  amount: Reading<Qty>;
  edgeId: string;                              // the static venue/chain edge this instantiates (planner doc)
  preconditions: Array<{ id: string; text: string; result: "met" | "unmet" | "unknown"; basis: string[] /* reading ids */ }>;
  proof: { status: "proven_live" | "proven_source" | "documented" | "unproven" | "impossible"; evidence: string[]; testId: string | null };
  signer: { path: "paybox_eoa" | "kernel_owner_userop" | "venue_api_key" | "venue_signed_order" | "none"; account: AccountId | null };
  gate: { writeFlag: "off"; capAdvisory: true };     // every write path ships OFF
  cost: Reading<unknown>; time: Reading<unknown>; risk: string[];
}
```

### 5.3 Fail-closed semantics

- **Totals:** sum only `ok` readings whose `freshness` is `live` or `recent`, whose account grade is in the inclusion set (7.1), and whose licence permits aggregation; report `rowsExcluded` with the reason per row.
- **Move preconditions:** `unknown` is not `met`. The only action available on an `unknown` precondition is "re-read" (a read tool call) or "ask the user" (a clarifying question, section 12.3).
- **Coverage:** a positions table is rendered as "complete", "partial (pages cut)", "no activity seen", or "verified empty (venue says registered)". The words are fixed text.
- **Schema drift:** an unrecognised enum value or an unexpected shape becomes `unknown(schema_drift)` for that row and a counter on the adapter; the rest of the page still parses.

### 5.4 Asset identity table (no mixing)

| Venue / source | Asset | `AssetRef.id` (example key) | Decimals | Note |
|---|---|---|---|---|
| XO | USDC.e (bridged USDC on 3223) | `eip155:3223:0x80c1...ab0c` | 6 | explorer symbol "USDC.e", name "Bridged USDC (XO)" [U15] |
| XO | outcome share | `eip155:3223:token:<id>` | micro-shares | Data API values are micro-units; divide at the adapter [02] |
| Polymarket | pUSD | `eip155:137:0xC011...2DFB` | 6 | [S:pm-docs contracts] |
| Predict.fun, Opinion | USDT on BNB | `eip155:56:0x55d3...7955` | 18 | Opinion quote token seen in the live market list [U8] |
| Limitless, Quotient payer | USDC on Base | `eip155:8453:<usdc>` | 6 | address from the app's `CHAIN_TOKENS` |
| Trueo | TYD (ERC-4626 share, not USD) | `eip155:8453:<tyd>` | 6 | value via `convertToAssets` [11 §12] |
| Pascal | collateral USD | `solana:mainnet:usdc` | 6 | `collateral_usd` is a venue ledger figure |
| SX Bet | USDC on SX Rollup | `eip155:4162:0x6629...F050B` | 6 | [U19] |
| Hyperliquid | spot USDC; outcome `+<enc>` | `hyperliquid:core:USDC`, `hyperliquid:core:+1230` | per token | [S:hl-docs] |
| Kalshi, Gemini, Novig, OG, UDX | USD ledger | `ledger:<venue>:usd` | 2 to 5 | Novig reports 5 decimals [VC] |
| Manifold | Mana | `play:manifold:mana` | n/a | never summed with real assets |

### 5.5 How this extends the existing code

| Existing code | Change |
|---|---|
| `app/src/core/bindings.ts` `AddressBinding` (strict zod; kinds `eoa|kernel|venue_proxy|solana|venue_account`; `derivedFrom.method` `kernel_v3_1_create2|venue_profile_lookup`; `status` ladder) | Becomes the **persisted form of an `Account` plus its inbound edges**. Add kinds (`polymarket_deposit_wallet`, `safe`, `hl_sub`, `pascal_account`, ...), `derivedFrom.method` values for the other derivers, an `edges[]` array, a computed-on-load `control` (not stored), and `owner` records with `OwnerProof`. IndexedDB schema version bump with a migration that maps `venue_proxy` to `polymarket_*` only after a code read; unknown legacy rows load as `watch_only`. The export file keeps its "refuse anything that looks like a secret" rule and gains "no signature bytes, only `messageSha256`" |
| `app/src/features/wallet/account-map.ts` (`loadAccountMap`, `AccountRow`) | Stays as the **Kernel-specific view**: filter `kind === "kernel"`, one row per chain. Its status ladder `derived -> code-present -> venue-registered -> trading-enabled` becomes the `deployment` and `registration` readings; `foreign-code` and `rpc-unreachable` map to `conflicted` and `unknown(fetch_failed)`. `readXoRegistration` is the first `registration` reader |
| `app/src/features/portfolio/targets.ts` (`target()`, `POSITION_READERS`, `Resolution`) | Generalised from "per venue, per binding" to "per (account, venue)" with a `Deriver` registry: `{ id, ownerKinds, derive(owner, ctx) -> Candidate[] }`. `Resolution` gains `derived_polymarket`, `safe_owner_candidates`. A saved address still queries **no venue until the user selects it** [bindings privacy notice] |
| `app/src/features/portfolio/types.ts` `PortfolioRow`, `VenueReadOk`, `VenueReadOutcome` | `holder: string` becomes `account: AccountId`; `VenueReadOk.facts` (cash lines) becomes `Balance[]`; add `coverage`; `VenueReadOutcome` keeps its discriminants (`ok|failed|off|needs_cockpit|not_paired|unsupported|unresolved`) and each maps onto a `Reading` state so existing screens keep working |
| `app/src/features/portfolio/readers.ts` (`PortfolioAdapters`, `POSITION_READERS` = xo, polymarket, trueo, pascal) | Add readers: `opinion` (positions, trades), `limitless` (daemon), `hyperliquid` (positions, orders; flagged until a POST probe is run), `polymarket_perps` (registration), `sx_explorer` (balance). Each returns `Reading`s. Existing `markWithBids` stays the valuation path |
| `app/src/features/wallet/balances.ts` (`CHAIN_TOKENS`, `readChainBalances`, `readExplorerBalances`) | Becomes the **Balance reader** for `self_account` custody on every chain, adding BNB (USDT), Polygon (pUSD), SX Rollup (explorer). It already separates `holder: owner|account` |
| `app/src/core/venue-policy.ts` (`VenuePolicy`: tier, license, transport, bookTransport) | Add `userTransport` per facet (the `VenueAccessMatrix` in 5.6); keep `restricted`/`license` as the display rule |
| `app/headers.config.ts` `BROWSER_DIRECT_ORIGINS`, `DAEMON_ONLY_ORIGINS` | New browser-direct entries, each by a reviewed change with its probe id: `https://openapi.opinion.trade` [U8], `https://api.safe.global` [U6, U7], `https://api.perpetuals.polymarket.com` [U20c], `https://explorerl2.sx.technology` [U19]; RPC hosts for Polygon, BNB, Base already exist. Daemon-only (no CSP entry): none new. `https://rpc-rollup.sx.technology` and `https://api.mainnet-beta.solana.com` need their own preflight record before listing (the Solana host's preflight reflects the origin, [U18]) |
| `pm/types.ts` `VenueReadAdapter` and `pm/adapters/types.ts` `PmVenueAdapter`, `AdapterDescriptor` | Add a sibling port `UserReadAdapter { id; caps; discover(owner): Promise<Candidate[]>; balances(acct); positions(acct, cursor); openOrders(acct); fills(acct) }` with a ccxt-style `caps` map; `NOT_SUPPORTED` rather than invented data. Descriptors gain `userAccess: VenueAccessMatrix` and the same `restrictedTerms/memoryOnly/mayPersist/mayExport` flags. Parsers are pure and shared by the browser app and the Node daemon/plugin through the existing `@shared` alias, so the CORS-blocked venues work in Node without a second implementation |
| `src/xo/account/derive.ts`, `app/src/core/account.ts` | Registered as the `kernel_v3_1_create2` deriver (XO on 3223, Predict.fun candidate on BNB, any chain with the factory). Pinned constants and strict EIP-55 checks stay |

### 5.6 The venue access matrix is registry data

Per `[PR]`, venue facts are TTL'd records with a source and `last_verified`. The user-side access facts in section 4 and 11 become new fields in the platform registry (`pm/registry/records.ts`): `accounts`, `balances`, `positions`, `orders`, `fills`, each an `Access`, with `ttlDays` 7 for limits and CORS (they changed within days in this very study: Opinion's 15 rps became 5 [U8]; SX's legacy book limit changes 2026-12-01 [VC]) and 30 for account models. Past TTL a fact reads as `NOT_FOUND` and the planner treats the facet as `unknown`.

### 5.7 Example shapes (real captures only)

These are copied from live responses (probe ids), values shortened where noted. They are *what the adapters parse*, not sample data to ship.

1. Pascal account for an owner that never deposited [U14]: `{"status":"success","data":{"has_deposited":false,"collateral_usd":"0.000000","rewards":{...},"lifetime_stats":{"maker":{"volume_contracts":"0","weighted_volume":"0.000000","volume_notional_usd":"0.000000","fees_paid_usd":"0.000000"},"taker":{...}},"orders":[],"positions":[]}, ...,"server_time_ms":"..."}`. Normalised: `registration = ok{registered:false, via:"has_deposited"}`, `positions.coverage = verified_empty`, `orders` empty, `balances = [{asset: solana:mainnet:usdc, custody: venue_credited, amount: ok 0}]`.
2. Polymarket wallet with no positions [U20]: `{"data":[],"pagination":{"limit":1,"offset":0,"has_more":false,"next_cursor":null}}` plus `/v2/value` `{"data":{"proxy_wallet":"0xd93b...6e47","value":0.0}}`. Normalised: `positions.coverage = no_activity_seen` (no registration signal), **not** `verified_empty`.
3. XO creator account, three disagreeing readings on 2026-10-20 [U15]: explorer `token-balances` USDC.e `value "4704236695"` (`self_account`); orderbook `{"cash_balance":"0","positions":[]}` (`venue_credited`); `balance-allowance` `{"balance":"0","allowance":"0","smart_account":null}` (`registration = ok{registered:false}`). Normalised: two `Balance` rows, one `registration`, a `Gap`-free but flagged `anomaly: "funded_on_chain_unregistered"`.
4. Limitless positions, empty [U13]: `{"amm":[],"clob":[],"group":[],"points":"0.00000000","rewards":{...},"accumulativePoints":"0.00000000"}`; coverage `no_activity_seen`.
5. Opinion positions, empty [U8]: `{"errmsg":"","errno":0,"result":{"list":[],"total":0}}`; the same call with no key on `/order` returns `{"errmsg":"This API Key has no related Opinion Login Wallet yet","errno":11001,...}` which maps to `unknown(needs_user_key)`.
6. Polymarket deposit wallet derivation test vectors [U4]: owner `0xf64F...224B` derives wallet `0x3a7F...4280`; owner `0x6cb4...0974` derives `0xc5E1...5080`; owner `0x4e8f...fedf` derives `0x6eFd...248d`; owner `0xef5b...d55f` derives `0x1E19...796C`; each equals the indexed wallet topic of an on-chain deployment event on the factory. Safe vector: owner `0xf39F...2266` (public Anvil account 0) derives Safe `0xd93B...6E47` = Gamma `proxyWallet` [U1, U2]. The tests ship these as fixtures with the log hash and the Gamma capture.

---

## 6. The account walk: how the graph is built from an owner address

Input: one or more owner addresses (pasted, imported from the agent's `list_credentials`, or already saved) and the per-venue opt-ins. Output: a `GraphSnapshot`. Every step is a pure function of its inputs plus injected `fetch`, RPC reader and clock.

```
  step 0  validate    strict EIP-55 / base58; refuse protocol contracts as owners (existing parseOwner)
  step 1  derive      OFFLINE. for each EVM owner: kernel(owner)  [XO 3223 + chains with the factory]
                                                    polymarket: depositWalletBeacon(owner) [needs factory.beacon(), 1 read, cached],
                                                                depositWalletUups(owner), safe(owner)   (+ proxy(owner) only for a Magic key)
                      candidates carry Evidence{derivation}; grade derived_origin
  step 2  presence    ONE JSON-RPC batch per chain: eth_getCode for every candidate on that chain (Polygon, BNB, Base; XO via explorer)
                      absent -> candidate stays "counterfactual, not deployed" (shown read-only, never a deposit target)
  step 3  control     for present candidates: Safe.getOwners() / depositWallet.owner() / validator.ecdsaValidatorStorage(a)
                      result contains a proven owner -> chain_owned ; contradicts -> conflicted ; read failed -> unknown(fetch_failed)
  step 4  venue-bound for each opted-in venue: registration / profile lookup (XO balance-allowance, Gamma public-profile, Perps registered,
                      Pascal accounts, Hyperliquid userRole/subAccounts when enabled)  -> venue_attested edges, never above chain_owned
  step 5  facets      balances (chain reads + explorer), positions, open orders, fills per (account, venue) per the access matrix
  step 6  assemble    totals by (asset, custody); coverage; gaps; snapshot id
```

Properties:

- **Offline first.** Steps 0 and 1 make no request. The Polymarket beacon needs one cached `beacon()` read; if it fails the beacon candidate is skipped and the UUPS/Safe candidates still run (a `Gap{facet:"accounts"}` is raised).
- **Cost per owner for a full refresh** (typical, all day-zero venues on, one EVM owner and one Solana owner; weights from sections 4 and 9): about 30 requests: RPC batches 3 (Polygon, BNB, Base), Safe/validator reads 2 to 4 (batched into the same RPC calls), Gamma 1, Data API v2 3 (`positions`, `value`, `activity` page 1), Perps registered 1, Opinion 2 to 4 (EOA and Safe addresses, positions plus trades), Limitless 1 (daemon), Trueo 1 (one batched multicall), XO 3 (explorer, Data API, orderbook via the daemon), Pascal 1 to 2, Hyperliquid 4 POSTs (about 100 weight) when enabled, Safe Transaction Service 1. All reads respect `Retry-After`, are paced under the documented limits (Opinion at most 4 per second against the observed 5), pause when the tab is hidden, and stop after repeated 403/429 [26 §5.2 R9, R10].
- **Incremental.** Presence and ownership are cached for the TTL in 9; balances and positions refresh on the 30 s to 5 min cadence of `[26 §11.2]`. A re-read of ownership happens on every full snapshot, and always before a move leaves the draft state.
- **No address leaves the browser/daemon except to the venues and RPC hosts the user opted into** (section 8). The walk never calls a service that would see the whole owner set in one request, except the Safe Transaction Service owner route, which is therefore **opt-in and off by default** (it receives one owner address per call and returns every Safe listing it; the user can leave it off and paste instead).
- **Failure isolation.** Each (account, venue, facet) is independent; a failure becomes a `Reading.unknown` and a `Gap` with a fix hint (`paste_address`, `run_daemon`, `add_own_key`, `enable_venue`).

---

## 7. Linking "my" accounts without claiming ones the user does not control

### 7.1 The control ladder (computed, never asserted)

| Grade | Meaning | How it is reached | In "my total"? | Valid as move source? |
|---|---|---|---|---|
| `proven` | the account *is* a key the user signed a fresh challenge with (EOA, Solana wallet) | signature (7.2) within `ttl`; or `self` edge from a `proven` owner | yes | yes (subject to signer path) |
| `chain_owned` | an on-chain read *now* shows a `proven` owner as the account's controller | `Safe.getOwners()` contains the owner and threshold is satisfiable by user-held owners; `Kernel validator storage == owner`; `DepositWallet.owner() == owner` | yes | yes |
| `venue_attested` | the venue's own API ties the account to a `proven` owner | Hyperliquid `userRole` (sub-account of a proven master), Pascal trading-keys list for a proven owner pubkey, Polymarket Gamma profile whose `proxyWallet` equals a chain-owned candidate | only if the user ticks "include venue-attested" for that venue | no (needs a chain or signature upgrade) |
| `derived_origin` | the address is a pure function of a `proven` owner but no ownership read has succeeded yet (or the chain is not readable) | derivation only | no (shown as "counterfactual / unverified") | no |
| `watch_only` | pasted, or imported from the agent, nothing proven | none | no | no |
| `conflicted` | evidence contradicts (derived Safe whose owners exclude the user; registered account without code; code without registration where the venue requires it) | any contradiction | no, with a visible reason | no |

Rules: grade = best path from a `proven` owner through edges, **capped by the weakest evidence on the path**; an `unproven` owner caps every account it controls at `watch_only` (Predict.fun's Privy owner is the common case, 4.3); any contradictory edge wins over any supportive one (fail closed). The inclusion set for totals is `{proven, chain_owned}` plus ticked `venue_attested`. `watch_only` accounts are still shown, labelled "watch-only: public data about an address you have not proven", because anyone's positions are world-readable by address on most venues anyway [26 §0 item 1], and that is a legitimate read-only use (looking at a friend's, or your cold wallet's, public exposure) as long as it is never counted as the user's.

### 7.2 Proof by signature (local, replay-protected, nothing transmitted)

Why a signature at all: an address can be pasted by anyone, and an agent (or an injected instruction) could paste someone else's. The graph's guarantee "these are mine" must rest on something an attacker who only knows addresses cannot produce.

**Challenge** (plain text, EIP-191 `personal_sign` for EVM owners; `solanaMessage` Ed25519 for Solana owners). Fixed template, no free text field, no venue name that the user did not select:

```
insurance-markets account link v1
This signature only proves I control this key. It authorises no transaction and no spending.
owner: <eip155:1/0x... | solana:mainnet/<base58>>
claims: <comma-separated account ids this owner is asserting, max 20>
nonce: <32 random hex chars, generated locally>
issued: <UTC ISO-8601>
expires: <UTC ISO-8601, at most 30 days after issued>
```

**Verification:** EOA owner: `ecrecover` locally equals `owner`. Contract owner: ERC-1271 `isValidSignature(hash, sig)` via `eth_call` (the Safe signature format differs; reading `getOwners()` is simpler and is preferred for Safes). Solana: Ed25519 verify locally. The page stores `messageSha256`, the verified scheme, `provenAtMs` and `ttl` in IndexedDB; **the signature bytes and the message are discarded after verification** (no replay surface, nothing to leak). The nonce is single-use locally.

**Who signs:** for the PayBox owner the signature comes from `request_wallet_sign` with `intent.op = "message"` (EIP-191; the challenge is plain UTF-8 text, the case the tool documents) for EVM, or `op = "solanaMessage"` for a Solana owner [06 line 94, 24 line 55], approved by the user in the PayBox window. A second documented route is the PayBox web app's WalletConnect handler, which signs `personal_sign` (UTF-8 text only) and `solana_signMessage` [31 §122-146, H from shipped code]. The agent can *request* the signature (`ua_link_prepare` returns the exact text), but the daemon, not the model, verifies the result. This is the same "recompute and verify before showing" discipline the Signature Card uses [27]. **No PayBox signature has ever been produced for this project** (DT1-class behaviour test, **NOT TESTED**), and whether `message` output is a plain 65-byte `r||s||v` hex with a v convention `ecrecover` accepts is unverified [31 §171]; until a test passes, the PayBox owner's grade can still reach `proven` through any other signer the user holds (the page accepts a pasted signature over the same text), and otherwise stays `watch_only`. The same applies to the Solana key (Pascal's own open question about `solanaMessage` encoding [VC Pascal]).

**What a challenge never contains:** a transaction, a spender, an amount, a URL, or text from any market or venue. It is not sent to any server. The page refuses to display or sign anything the agent supplies other than the template filled with ids the page itself computed.

### 7.3 Why not "just ask the venue"

Venue attestation (Gamma profile, Hyperliquid `userRole`) is useful for *discovery* and cheap, but it is a claim by a third party about an address, not proof the user holds a key; Polymarket's own profile route returned a real, named profile for the public Anvil test address [U1]. So attestation caps at `venue_attested` and never joins totals silently.

### 7.4 Linking account-bound venues (Kalshi, Gemini, ...)

There is no address. The link is "the user put a key in the daemon vault and the venue accepted it": `Account{kind:"venue_ledger", credentialRef:"kalshi-main"}` with `control = "proven"` *for that venue only* (the venue authenticated the key; the key is the user's by construction of how it got into the vault). It never joins an on-chain owner edge, and it appears in totals only under `ledger:<venue>:usd`, never summed with on-chain assets (I2). The graph does not try to infer that a Kalshi account and a wallet belong to the same person.

### 7.5 Adversarial cases

| Attack | Control |
|---|---|
| Agent or injected market text asks to "add this address as mine" | adding is a user action in the page or an `ua_link_prepare` + signature; the grade stays `watch_only` until a valid challenge for that owner verifies; tool output says so in fixed text |
| Address poisoning (a look-alike address pasted) | strict EIP-55 parse; owner and account ids shown in full with the first/last 6 highlighted and a checksum-diff against saved ids |
| A Safe that lists you as an owner but you did not create (spam Safe, M) | owner-route results are candidates, listed apart, not counted; a venue binding is required |
| Ownership changed after linking (the live Safe example, 3.3) | chain ownership re-read on every snapshot and before any move leaves draft; `conflicted` removes it |
| Replayed old signature | single-use local nonce, `expires`, signature discarded after verify |
| Hostile RPC or API returns a convenient owner | chain facts are read from the user-chosen RPC; for any move the daemon re-reads from a second independent host and refuses on disagreement (design default D) |
| Prompt injection inside venue/market text steering the plan | section 12.4 |

---

## 8. Privacy model

### 8.1 Where things live

| Data | Lives | Never |
|---|---|---|
| Owner and account addresses, labels, edges, grades | the user's browser (IndexedDB, or memory when unavailable) or the user's local daemon; exportable as a JSON file of addresses and labels only | on an author server, in a URL, a log shared outside the machine, or analytics |
| Proof records | `messageSha256`, scheme, times | signature bytes, the message |
| Venue credentials (KEY venues) | the daemon vault on the user's machine | the page, the model's context, any export |
| Fetched venue data | memory; the user's own rows may persist locally (R4); restricted-licence market data is memory-only (R3) | any shared cache or CDN |
| Audit trail | local append-only file written by the daemon | any remote service |

The author operates nothing in this design: static assets plus the user's own processes. There is no author-run indexer, relay, cache or telemetry (R1).

### 8.2 Honest leak surfaces (stated in the UI)

1. **Each venue read tells that venue the user's IP and the queried address.** Positions are public by address anyway, but the *linkage* (these five addresses share a querier) is new information a venue could infer. Mitigation: per-venue opt-in per address (existing rule: a saved address queries no venue until selected), jittered ordering, no parallel burst to one venue, optional user-supplied proxy for their own egress.
2. **The RPC provider sees every address checked.** Default public RPCs (`publicnode.com`, `bnbchain.org`, `mainnet.base.org`) are third parties. The user may supply their own endpoint; the page shows which host receives which address. Batch requests reveal the whole candidate set at once to that host.
3. **Safe Transaction Service** receives the owner address of any owner-route call (opt-in, section 6).
4. **The model provider.** When the user's agent calls `ua_*` tools, the returned addresses, balances and positions enter the model's context and the provider's systems under the user's agreement with that provider. The tool descriptions and a one-time notice say so; a `redact` argument (default `false`) returns addresses as `0x1234...abcd` plus a stable local alias (`acct-3`) when the user prefers that the model never see full addresses; the daemon resolves aliases back locally. With `redact: true` the agent can still plan ("move from acct-3 to acct-5") and the Signature Card still shows full addresses to the human.
5. **The PayBox connector.** `list_credentials`/`get_portfolio` are PayBox calls made by the agent under the user's PayBox grant; their output is the user's own data, handed to `ua_import` as a T3 source. This note adds no new PayBox call.
6. **Browser-side:** no third-party fonts, scripts or analytics in the page (existing CSP: `default-src 'none'`, `script-src 'self'`, `connect-src` only the exact hosts in `headers.config.ts`).

### 8.3 What the graph deliberately does not do

It does not de-anonymise anyone: it only queries addresses the user supplied or derived from their own owner, and the optional owner-route returns Safes listing *that* address. It does not follow counterparties from fills, and it does not store other users' addresses (`counterparty` fields in Pascal fills and `de-anonymized` SX routes are dropped at the adapter).

---

## 9. Freshness, rate limits and the request budget

TTL = how long a reading stays `live`/`recent` before `stale`. Limits are the documented number, the number observed in response headers on 2026-10-20 (probe id), or **NOT FOUND**. Defaults marked D are design defaults to be calibrated.

| Source | Documented / observed limit | Cache signal seen | Default TTL (D) | Poll rule |
|---|---|---|---|---|
| XO Data API (`api-mainnet.xo.market/api`) | docs 100 per 10 s [02 §1]; header `x-ratelimit-limit: 50`, `remaining 49`, `reset 1` [U15] | none | positions 30 s | token bucket at the lower (50) |
| XO explorer (`explorer-mainnet.xo.market/api/v2`) | header `x-ratelimit-limit: 300`, `x-ratelimit-reset: 55987` (window semantics unverified) [U15] | `max-age=0, private` | balances 30 s; code state 10 min | at most 1 per 3 s per host |
| XO orderbook (`orderbooks.xo.market`) | 5 req/s public [02] | none | cash/positions 15 s | via daemon only |
| Public RPC (Polygon, BNB, Base: publicnode; `bnbchain.org`) | numeric limits NOT FOUND (not read); `eth_getLogs` windows limited, full history refused [U12] | n/a | code 10 min; ownership 5 min and always before a move leaves draft; balances 30 s | one JSON-RPC batch per chain per refresh |
| Polymarket Gamma `public-profile` | endpoint-specific limit NOT FOUND (Gamma `/markets` 300 per 10 s [08 §2.6]) | `public, max-age=120` [U1] | 120 s | at most once per address per 2 min |
| Polymarket Data API v2 | 800 per 10 s [08 §2.6]; `retry-after` on 429 | `public, max-age=5` to `15` [U20] | positions 15 s; activity 30 s | page cap 3 (existing `MAX_POSITION_PAGES`) |
| Polymarket Perps `info/registered` | NOT FOUND | `public, max-age=300, s-maxage=86400`; positive result permanent, negative cached up to 10 s [S:pm-docs perps, U20c] | positive: forever (until grade change); negative: 5 min | once per address per session |
| Opinion OpenAPI | docs 15 req/s [S:op-docs]; **observed `x-ratelimit-limit-second: 5`** [U8] | `no-cache` | positions 30 s | at most 4 req/s |
| Predict.fun (keyed) | 240 requests per minute per key [S:pf-docs FAQ] | n/a | 30 s | token bucket per key |
| Limitless (daemon) | NOT FOUND | `public, max-age=5, s-maxage=15` [U13] | 15 s | via daemon |
| Pascal | read endpoints "have their own lower limits", numbers NOT FOUND; account snapshot cached up to 1 s [S:pascal-docs] | `no-store` [U14] | 10 s; WebSocket `account` channel as an optional upgrade | 429 `RATE_LIMITED` honoured |
| Hyperliquid `/info` | 1,200 weight per minute per IP; `userRole` 60, `subAccounts`/`openOrders`/`userVaultEquities`/most others 20, `clearinghouseState`/`spotClearinghouseState` 2 [S:hl-docs] | n/a | balances 30 s; `userRole`/`subAccounts` 10 min | budget the minute: a full walk about 100 weight |
| Safe Transaction Service (`api.safe.global/tx-service`) | header `x-ratelimit-limit: 5000`, `x-ratelimit-reset: 2592000` (about 30 days), `remaining` fell 4999 to 4997 across three calls [U6, U7]: **reads as a keyless quota of 5,000 per about 30 days per client IP (M)** | `max-age=15` on the owner route | candidate lists 24 h; Safe info 5 min | opt-in; at most a handful of calls per refresh |
| SX explorer (`explorerl2.sx.technology`) | NOT FOUND | `max-age=0, private` | 60 s | at most 1 per 3 s |
| Solana public RPC | NOT FOUND (not read) | n/a | 30 s | user-chosen RPC recommended |
| Manifold | 500 req/min/IP [09 §2.10] | `max-age 1` to `5` | 60 s | n/a (play money) |

Freshness states are computed, not stored: `live` while younger than half the TTL, `recent` up to TTL, `stale` beyond (excluded from totals), `unknown` if never read. The clock is injected (as in `app/src/core`). A tab-hidden page pauses polling; the daemon never polls on its own for the page; an agent tool call forces a read when its `maxAgeSec` argument is smaller than the reading's age.

---

## 10. Terms and display limits

What the notes read (`[26 §5.1]`) plus what this study adds. Not legal advice; the shape of the design is "a per-user, client-side display of the user's own account rows, with no author server and no shared cache", the reading under which each text below is least restrictive, and the restricted flags stay OFF by default (R8).

| Source | Term as read | Display / storage decision for the account graph |
|---|---|---|
| Polymarket (Gamma, Data v2, CLOB, Perps public routes) | redistribution terms NOT FOUND; docs say no key and CORS `*` [08 §2.11]; geoblock route reports the caller's own status | show by address; own rows persist locally; show the geoblock banner; never hide a 403 |
| XO | bots allowed if compliant; "harvest or scrape data ... for unauthorized purposes" barred [03 §5] | per-address reads at human pace from the user's IP; no bulk crawl; no export of other users' data |
| Opinion | ToS (2025-10-19) bars robot scraping but offers official keys; public data endpoints documented as keyless [S:op-docs authentication] | positions/trades by the user's own addresses only; no leaderboard or counterparty crawl |
| Predict.fun | ToS (2025-11-18) bars scraping; official keys offered | user's own key; own rows only |
| Limitless | bots allowed with rules (ToS 2026-09-15) [AD §3.4] | via daemon; own rows persist |
| Trueo | scraping barred; on-chain reads fine [11 §13] | on-chain only |
| Hyperliquid | bots barred if they "exceed reasonable usage"; open-ended "Excluded Persons" [VC] | stay under 1,200 weight; show the clause; eligibility never computed |
| Pascal | ToS "Platform Data" clause open; reads not geo-blocked [VC] | own-owner reads only; no markets-data republishing; flagged OFF until the clause is cleared by the user |
| SX Bet | scraper clause; official API invited [VC] | explorer balance of a pasted proxy; keyed reads in the daemon |
| Kalshi | Developer Agreement v1.1: own trading only; no caching/aggregating/storing except for own trading; no facilitating others; no benchmarking [08 §4.9] | flag OFF; daemon-only; own account rows may persist locally (R4), market data memory-only; nothing exported |
| Gemini, OG/CDNA, UDX, Novig, ProphetX | market data proprietary / internal-use / non-commercial EULA [VC] | OFF; memory-only; user-side rows only if the user holds a key; effectively N/A for non-eligible users |
| Safe Transaction Service | terms NOT READ (I did not fetch them) | treated as restricted: opt-in, one call per user action, results memory-only for candidate lists |
| Public RPC providers | terms NOT READ | chain data is public; user may substitute their own endpoint |
| Blockscout explorers (XO, SX) | terms NOT FOUND | low-rate, per-address |

**Export rule.** The only exportable artefact is the user's own addresses, labels, grades and proof hashes (R5). A snapshot export contains the user's own rows; it contains no restricted-licence market data and no counterparty addresses.

---

## 11. Day zero: readable with zero credentials vs needing the user's own keys

"Zero credentials" = the user opens the static page (or runs the local daemon with no key) and supplies at most public addresses. **Yes (T0)** = the browser reads it directly; **Yes (daemon)** = public data but the browser is blocked, so the user's own local daemon is needed (still no credential); **Key** = the user's own credential, in the daemon vault; **N/A** = not offered or ineligible. "Verified" = I saw it work this session; "docs" = documented only.

| Venue / source | Find the accounts an owner controls | Balances | Positions | Open orders | Fills / history | Basis |
|---|---|---|---|---|---|---|
| Any EVM EOA | identity | **Yes (T0-RPC)** user-chosen RPC | n/a | n/a | n/a | verified preflights [U18] |
| **XO** (3223) | **Yes**: derive offline; present via explorer (T0); registered via orderbook (daemon) | **Yes**: explorer on-chain (T0); orderbook cash (daemon) | **Yes (T0)** Data API (empty shape verified; populated shape NOT yet observed); raw via daemon | Key: XO HMAC triplet, itself gated by the unresolved ownership doors | derived from portfolio entries only | [U15], [19] |
| **Polymarket** (137) | **Yes**: derive 3 recipes offline, `eth_getCode`, `owner()`/`getOwners()` | **Yes (T0-RPC)** pUSD | **Yes (T0)** `/v2/positions`, `/v2/value` | Key: CLOB L2 credentials (an owner signature the user creates) | **Yes (T0)** `/v2/trades`, `/v2/activity` | [U1-U5], [U20] |
| Polymarket **Perps** | registration **Yes (T0)** public GET | Key (authenticated session) | public POST snapshot (docs, not tested); else Key | Key | Key | [U20c], docs |
| **Predict.fun** (56) | **Partial**: candidate derive (Kernel) + validator owner read; deposit address must be pasted | **Yes (T0-RPC)** USDT | **Key**: `x-api-key` (401 verified) | Key | Key | [U10], [U11] |
| **Opinion** (56) | **Partial**: paste the assets wallet, prove by `getOwners()`; optional candidate list (opt-in); derivation NOT FOUND | **Yes (T0-RPC)** USDT on the Safe | **Yes (T0)** keyless, EOA and Safe both asked | Key (self-service key bound to the login wallet) | **Yes (T0)** `/trade/user/{wallet}` | [U8], [U9] |
| **Limitless** (8453) | **Yes** (EOA) | **Yes (T0-RPC)** | **Yes (daemon)** | Key (HMAC token) | **Yes (daemon)** history route | [U13] |
| **Trueo** (8453) | **Yes** (any holder) | **Yes (T0-RPC)** | **Yes (T0-RPC)** | n/a (AMM) | opt-in log scan | [26 §4.6] |
| **Hyperliquid** HIP-4 | **Yes** via `userRole`, `subAccounts` (POST) | **Yes** `spotClearinghouseState` (POST) | **Yes** outcome tokens in spot balance (POST) | **Yes** `openOrders` public (POST) | **Yes** `userFills` (POST) | docs only; preflight [U18]; **NOT TESTED** (POST) |
| **Pascal** (Solana) | **Yes** (owner pubkey; trading keys listed publicly) | **Yes (T0)** `collateral_usd` + pending deposits | **Yes (T0)** `positions[]` | **Yes (T0)** `orders[]` public by owner | `fills`/`history` per [26 §4.8] (not re-read) | [U14] |
| **SX Bet** (4162) | **No**: proxy derivation NOT FOUND; paste it | **Yes (T0)** explorer balance of a pasted proxy | Key | Key | Key | [U19], [S:sx-oa] |
| **Manifold** | username (no wallet link) | Mana only | **Yes (T0)** portfolio by userId | n/a | public bets route (not probed) | [U16] |
| **Kalshi** | login (not an address) | Key (read scope) | Key | Key | Key | [08 §4.8]; flag OFF |
| **Gemini Predictions** | login | Key | Key | Key | Key | [VC]; flag OFF |
| **Novig / OG-CDNA / UDX / ProphetX** | login | Key / N/A | Key / N/A | Key / N/A | Key / N/A | effectively N/A for non-eligible users [VC] |
| **World** (PayBox) | via the agent's PayBox session | T3 import | T3 import | T3 import | T3 import | [14 §8.1] |
| **Safe Transaction Service** (BNB, Polygon, ...) | candidates only (opt-in) | n/a | n/a | n/a | n/a | [U6], [U7] |

Cells that depend on a POST I did not send, a populated response I never saw, or a PayBox behaviour nobody tested are marked in place; the page degrades to "no data" rather than guess.

**What stays impossible without something this design excludes:** any custodial USD venue's balance for a user who is not an eligible account holder; a cross-venue identity of the same person across a custodial account and a wallet (no proof exists, so none is claimed); open orders on XO, Polymarket, Predict.fun, Limitless, SX, Opinion, Kalshi, Gemini without the user's credential; history before the free-RPC log window; push notifications with the page closed.

---

## 12. The read surface for the user's own agent, and what the graph hands the move planner

This section fixes the *contract* the natural-language layer and the move planner consume. The loop (plan, approve, execute), clarifying-question policy and signing mechanics belong to the sibling notes; here are the parts that the account graph determines.

### 12.1 Tools (read-only, no flag; `readOnlyHint`; registered next to the `pm_*` family, same conventions as `pm/tools/index.ts`)

| Tool | Returns | Notes |
|---|---|---|
| `ua_list_accounts` | owners, accounts with `kind`, `control`, `deployment`, `registration`, `gaps` | `redact?: boolean` (8.2 item 4); never includes credentials |
| `ua_discover` | the account walk for one owner address (candidates with evidence, nothing persisted) | no address leaves the machine beyond the venues/RPCs enabled |
| `ua_get_snapshot` | a `GraphSnapshot` (optionally filtered by account/venue/facet), `snapshotId`, `maxAgeSec` forces re-reads | the planner's only input |
| `ua_get_balances`, `ua_get_positions`, `ua_get_orders` | the corresponding rows with `Reading` states, `coverage`, pagination cursor | positions carry `status`, `claim`, `mark.basis` |
| `ua_explain_gap` | fixed-text reason and fix for one `Gap` | text is ours, never venue text |
| `ua_link_prepare` / `ua_link_verify` | the exact challenge text for a set of claimed account ids / verification of a returned signature | local only; the model can request the text but cannot verify or elevate |
| `ua_import` | normalises a T3 payload (PayBox `list_credentials`/`get_portfolio`, `world_*`) | imported accounts cap at `watch_only`; imported numbers carry `source: agent_supplied` and are never merged with venue-read data (I8) |

The dApp terminal's deterministic grammar exposes the same operations as commands (`accounts`, `balances`, `positions`, `orders`, `link`) so a user without an agent gets the same graph; the agent adds nothing the terminal cannot do.

### 12.2 What the planner may rely on

A `Move` is only draftable when, in the snapshot it names, **all** of these hold (each is a precondition with `met | unmet | unknown`):

1. the source account's `control` is `proven` or `chain_owned` (not `derived_origin`, `watch_only`, `venue_attested`, `conflicted`);
2. the source asset's `Balance.free` is `ok`, `live`/`recent`, and at least the amount, **in the same `AssetRef`** (no unit conversion inside a precondition);
3. the destination account is `deployment.present` on the destination chain (a counterfactual account is never a deposit target; XO additionally needs registration evidence [DD §2.3]);
4. the signer path exists (`paybox_eoa`, `kernel_owner_userop`, `venue_api_key`, `venue_signed_order`) and its prerequisite is `met` (e.g. XO Enable Trading; PayBox grant mode) or the move is labelled `manual` (the plan names the human step);
5. the venue/jurisdiction readings are not `refused`;
6. the **edge's proof status** is not `impossible`; `unproven` edges (XO exit, BNB USDC CCTP, geo-limited deposits) can be *shown* in a plan as "unproven, test first" but never executed from the agent loop while the write flag is off, and never without a passing test id once on.

`unknown` anywhere blocks execution and produces either a re-read (a read tool call) or a question to the human, never a guess.

### 12.3 Where the graph forces a clarifying question

The agent should ask, rather than choose, when: two accounts match a natural-language reference ("my Polymarket account": the Deposit Wallet and a legacy Safe both present); the account grade is below `chain_owned` but the request implies spending; Opinion's EOA and Safe both returned rows; an account is `conflicted`; a reading is `stale` and cannot be refreshed (RPC failing); an asset mismatch ("move 100 dollars" where the source asset is pUSD and the destination is USDT, which is not the same asset); or a venue is `refused` for the user's location. The question and its choices are generated from the typed state (fixed text plus account labels in `Untrusted` slots).

### 12.4 Prompt-injection and data-hygiene rules specific to the graph

- Every string that originates outside the app (market titles, rules, Opinion `rules`, Gamma `name`/`bio`, Manifold names, Hyperliquid outcome descriptions, order notes, Pascal usernames and Twitter handles) is `Untrusted<string>`, capped and stripped of control and bidi characters, and returned inside `{ "trust": "untrusted-user-content", "text": ... }` objects. None of it is allowed in `Gap.fix`, error messages, link challenges or `Move.preconditions[].text`.
- No `ua_*` tool takes a free-text instruction from the model and acts on it. Address arguments are strict-parsed; labels typed by the model are rejected (labels are user-entered in the page).
- No tool sets `control`. It is computed from evidence the daemon gathered itself; the model's description of an account never feeds it.
- Venue API fields that look like instructions ("ignore previous...") are data; the graph returns them only through the untrusted wrapper and the agent's own system prompt is expected to treat that wrapper as inert. Nothing in the graph's own text is ever phrased as an imperative to the model.
- Audit: every tool call appends `{ts, tool, argsSha256, snapshotId, readingsTouched[], redact}` to the daemon's local audit file; a `Move` records the `snapshotId` it was planned against so a replay shows exactly what the human approved.

---

## 13. Build plan (design only; another workflow owns `src/`, `relay/`, `test/` and `package.json`, and I changed none)

| WP | Scope | Where | Depends on | Tests (fixtures are the real captures in 5.7) |
|---|---|---|---|---|
| UA1 | `Reading`, invariants I1 to I13, `ControlGrade` function, totals/coverage/gaps, snapshot hashing | new pure module under `pm/` (shared to `app` via the existing `@shared` path) | none | property tests: unknown never summed; units never mixed; conflict removes; stale excluded; hash stable |
| UA2 | derivers: `kernel_v3_1_create2` (exists), `pm_deposit_wallet_beacon/uups`, `pm_safe`, `pm_proxy` | `src/xo/account/derive.ts` neighbour, `pm/ua/derive/*` | UA1 | the 4 deployment-event vectors, the Gamma/Safe vector, strict EIP-55 on every pinned address (the notes already contain bad-checksum strings [PG §0 item 6]) |
| UA3 | readers returning `Reading`: Polymarket (profile, positions, value, activity, perps registered), Opinion (positions, trades), Limitless (daemon), Pascal (account), XO (existing), Hyperliquid (flagged until a POST probe), SX explorer, chain balance/ownership readers | `app/src/features/portfolio/*`, `app/src/features/wallet/*`, daemon routes | UA1, UA2 | recorded-fixture parsers; schema-drift cases; empty-vs-unregistered cases (I1) |
| UA4 | persistence and screens: bindings migration, graph store, Accounts screen (grade chips, gaps list, "counted / not counted" split), Link wizard | `app/src/core/bindings.ts`, `app/src/features/wallet`, `app/headers.config.ts` (new origins with probe ids) | UA1 to UA3 | migration test; CSP check regenerated; hygiene tests (no secret in export) |
| UA5 | `ua_*` tools, redact aliasing, audit file | `pm/tools/`, daemon (`bridge/`) | UA1 to UA3 | tool-contract tests like `pm/tools/*`: untrusted wrapper, `readOnlyHint`, no write flag touched |
| UA6 | link challenge: build, local verify (EIP-191 `ecrecover`, ERC-1271 `eth_call`, Ed25519), proof record | `app/src/core`, daemon | UA1 | known-answer vectors; replay and expiry; signature bytes never persisted |

**Live tests, opt-in, none run by me:** LT-UA1 derive-vs-chain for the user's own owner (all chains); LT-UA2 ownership reads on the user's own accounts (Kernel validator on 3223 via the explorer, Deposit Wallet `owner()`, Safe `getOwners()`); LT-UA3 PayBox `message` and `solanaMessage` signing for the link challenge; LT-UA4 Hyperliquid `/info` from a browser (CORS of the POST response) and the shape of outcome-token balances; LT-UA5 Opinion: user pastes both EOA and Safe, records which one the positions route answers for; LT-UA6 Polymarket UUPS-variant derivation against the user's own older wallet, if any; LT-UA7 a populated XO portfolio response (any funded account) to freeze the shape.

---

## 14. Risks, unverified items and NOT FOUND

| # | Item | Status | How it is settled |
|---|---|---|---|
| 1 | XO populated `GET /users/portfolio` and orderbook `/positions` shapes | NOT OBSERVED (empty shapes only) [U15, 02 §2.2] | LT-UA7 |
| 2 | Cause of the XO "funded on chain, unregistered at the orderbook" case [U15] | unknown; hypothesis (L): registry is separate from balance; or the account never completed XO onboarding | the graph shows both readings and flags the anomaly; LT only if a user hits it |
| 3 | XO Kernel current-owner read on chain 3223 | NOT TESTED (works on BNB [U11]) | LT-UA2 |
| 4 | Hyperliquid account walk and HIP-4 balances | docs only; POST not sent; CORS of the POST response unknown | LT-UA4 |
| 5 | Opinion Safe: determinism from the EOA; which address the public routes want | NOT FOUND / docs silent [U9] | LT-UA5 |
| 6 | Predict Account: index 0 and no hook for real accounts | unverified (their API is keyed [U10]) | user pastes the deposit address; owner read decides |
| 7 | SX proxy wallet derivation | NOT FOUND | paste; `getOwners()` on SX Rollup RPC (NOT TESTED) |
| 8 | Polymarket UUPS-variant derivation live validation | not validated live (all four sampled wallets are the beacon variant; the UUPS code path is from the SDK source only [S:pm-relayer]) | LT-UA6; the SDK itself falls back by code check |
| 9 | Polymarket Proxy wallet current-owner read | NOT FOUND | treat as `derived_origin` unless the Gamma profile and code agree |
| 10 | PayBox accepting a `message` / `solanaMessage` intent for the link challenge | NOT TESTED | LT-UA3; until then owners can still be proven with another signer the user holds, else `watch_only` |
| 11 | Pascal deposit-PDA derivation, read-endpoint limits, program id | NOT FOUND in docs | read the registered `deposit_address` from the snapshot flow instead |
| 12 | Safe Transaction Service quota semantics and terms | quota inferred from headers (M); terms NOT READ | keep opt-in; cache 24 h |
| 13 | Free-RPC log history | refused beyond recent windows [U12] | derive-first; user-supplied archive RPC for history |
| 14 | Polymarket Perps authenticated reads; position-snapshot POST | NOT TESTED / needs session | out of day zero |
| 15 | Combos positions relation to the main book | unknown [PR §4.2] | shown separately, not summed |
| 16 | Gamma `public-profile` returns a named profile for the public Anvil address [U1] | privacy: profile fields (name, bio, image) are stranger data | the adapter reads `proxyWallet` and drops the rest |
| 17 | `pUSD` and some token decimals, Limitless/Quotient USDC address | M (from `[26]`, the app's `CHAIN_TOKENS`) | read `decimals()` on first use and compare |
| 18 | Public RPC providers may log every address checked | stated risk (8.2) | user-chosen RPC |

Not possible, restated: a graph that claims two accounts are the same *person* without a signature; any "net worth" figure that silently adds a custodial ledger to on-chain assets or converts stablecoins to dollars; owner-to-account reverse lookup for XO or Opinion; unattended discovery for venues that need a key the user has not created.

---

## Verification

What I re-checked after drafting, and the probe log. Times are UTC from response `date` headers, 2026-10-20, 07:05 to 07:45.

### Re-checks (this document against its own evidence)

1. **Derivations re-run, not recalled.** Safe derivation for the public Anvil account 0 equals Gamma's `proxyWallet` [U2]; Deposit Wallet derivation equals the indexed wallet topic of **4 of 4** sampled factory deployment events (3 from the last 3,000 blocks, 1 from about 1,000,000 blocks earlier) [U4, U4b]; the factory's `beacon()` equals the beacon address in the docs table [U3]; Kernel derivation using this repository's `src/xo/account/derive.ts` re-derives **18 of 18** ECDSA-validator registrations in a 4,000-block BNB window [U11].
2. **On-chain control reads work and disagree with derivation where they should:** Deposit Wallet `owner()` returned the owner [U5]; Kernel `ecdsaValidatorStorage(kernel)` returned the registered owner [U11]; the derived Safe's `getOwners()` returned a different owner from the derivation input [U7]. That last result is the basis for I5 to I7.
3. **Claims that changed while writing:** the deposit-wallet code size is 146 bytes (I first wrote 61 and corrected it after measuring); "3 of 3" became "4 of 4" after the older-window check; Opinion's observed limit is 5 per second, not the documented 15; `[26]`'s "no public orders by address" is wrong for Pascal [U14].
4. **Every venue in the task's list has a row** in sections 4 and 11: XO, Polymarket (plus Perps, Combos), Predict.fun, Opinion, Limitless, Trueo, Hyperliquid HIP-4, Pascal, Manifold, SX Bet, and Kalshi, Gemini, OG/CDNA, Novig, UDX, ProphetX (and Polymarket US, World) as restricted or account-bound.
5. **No placeholder data.** Section 5.7 examples are copied from live responses or on-chain events; no invented balance, position or address appears. Third-party addresses are truncated; the Gamma profile's name, bio and image were discarded; the only full addresses are protocol contracts and the public Anvil account 0 test vector.
6. **Privacy sweep of this file and my scratch scripts** (grep for `@`, personal names, the account handle, the home directory and the GitHub login) found no hit other than the strings `@shared` (a TypeScript path alias) and `@polymarket/...` package names quoted from the cited docs; the opinion docs' rate-limit page names a contact address for higher limits, which I did not copy or use. The scratch scripts contain only public constants.
7. **Not re-checked / still open** are listed in section 14; in particular nothing involving a POST, a populated XO response, PayBox signing, or the UUPS variant.

### Probe log

All requests: User-Agent `insurance-markets-research/0.1`; GET unless stated; foreign `Origin: https://dapp.example` on the probe-script calls so CORS answers describe an arbitrary page; at least 1 s between calls to one host.

| Id | Request (host and route) | Result used |
|---|---|---|
| U1 | `gamma-api.polymarket.com/public-profile?address=<Anvil 0>` | 200; keys `proxyWallet, createdAt, name, users[], verifiedBadge, takerTier, weightedVolume`; `ACAO` via Cloudflare; `cache-control max-age=120` |
| U2 | offline: Polymarket Safe derivation (constants from `builder-relayer-client`) for the Anvil address | `0xd93B...6E47` = U1 `proxyWallet` |
| U3 | Polygon `eth_call` `0x00000000000Fb5C9ADea0298D729A0CB3823Cc07` selector `0x49493a4d` | `0x7A18...fc3a` |
| U4 | Polygon `eth_getLogs` on the factory, last 3,000 blocks (head 95,849,830 at probe time) | deployment events (name not read; topic0 `0x7441de0a...8276`; topics wallet, owner, walletId); 3 sampled; offline beacon derivation matched all 3 |
| U4b | Polygon `eth_getLogs`, 1,500-block window about 1,000,000 blocks earlier (ran in background) | 1 event; derivation matched; windows at about 2,500,000 blocks earlier returned `[]`; wider windows were slow and not used |
| U5 | Polygon `eth_getCode` on a derived wallet and its owner; `owner()` call | 146-byte beacon-proxy code; owner has no code; `owner()` = owner |
| U6 | `api.safe.global/tx-service/bnb/api/v1/owners/<Anvil 0>/safes/` | 200; 9 Safes; `ACAO *`; `x-ratelimit-limit 5000`, `reset 2592000`; the old `safe-transaction-bsc.safe.global` host answers 308 to this one |
| U7 | `api.safe.global/tx-service/pol/api/v1/safes/0xd93B...6E47/` and Polygon `getOwners()` | owners `[0xD402...312d]`, threshold 1, nonce 34, version 1.4.1 (both agree) |
| U8 | `openapi.opinion.trade/openapi/{positions/user/<a>, trade/user/<a>, market?limit=1, order?limit=1}` | positions/trades 200 keyless; market 200 (long attacker-controlled `rules` text seen, discarded); `/order` 401 `errno 11001`; `ACAO` reflects origin; `x-ratelimit-limit-second 5` |
| U9 | `docs.opinion.trade` llms.txt, authentication, position, rate-limiting, SDK pages, and one GitBook `?ask=` query | docs gap on EOA vs Safe confirmed; rate-limit page says 15/s; `get_user` is builder mode |
| U10 | `dev.predict.fun` llms.txt, FAQs, deployed-contracts, positions-by-address, account schemas; `github.com/PredictDotFun/sdk` README and `Constants.ts` (via `gh api`); `api.predict.fun/v1/{positions/<a>, markets}` | Kernel 0.3.1 constants; positions-by-address needs `x-api-key`; both API calls 401 with `ACAO` reflecting origin |
| U11 | BNB `eth_getLogs` on validator `0x845A...cE57`, `OwnerRegistered`, 4,000-block window (18 events); `ecdsaValidatorStorage` call | derivation 18 of 18; owner read matches |
| U12 | BNB `eth_getLogs` from block 0, owner-filtered, on `bsc-rpc.publicnode.com` and `bsc-dataseed.bnbchain.org` | refused ("Archive requests require a personal token"; "limit exceeded") |
| U13 | `api.limitless.exchange/portfolio/<a>/{positions, traded-volume}`, `/profiles/<a>` | 200 keyless, no `ACAO`; profiles 401 |
| U14 | `data.pascal.trade/api/v1/accounts/<System Program pubkey>`; `docs.pascal.trade/llms.txt` and `llms/api.txt` | 200, `ACAO *`, `no-store`; snapshot fields as in 4.8 |
| U15 | `api-mainnet.xo.market/api/markets?marketType=2&statuses=ACTIVE&take=3` (one creator account taken from it), `/users/portfolio?user=<creator>`; `orderbooks.xo.market/{positions, balance-allowance}?address=`; `explorer-mainnet.xo.market/api/v2/{addresses/<a>/token-balances, addresses/<a>, smart-contracts/<a>}` | portfolio empty; orderbook `cash_balance "0"`, `smart_account null`; explorer USDC.e raw 4704236695 and XOM 2444; `is_contract true`, proxy to `0xEF2D...d6Bf`; Data API `x-ratelimit-limit 50`; explorer `300` |
| U16 | `api.manifold.markets/v0/{user/ManifoldMarkets (404), get-user-portfolio?userId=<a public id>}` | 200 `ACAO *` |
| U17 | `hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/{info-endpoint, info-endpoint/spot, info-endpoint/perpetuals, rate-limits-and-user-limits}.md` | account endpoints and weights as in 4.7 (no `/info` request sent) |
| U18 | `OPTIONS` preflights with `Access-Control-Request-Method: POST` to `polygon-bor-rpc.publicnode.com`, `bsc-rpc.publicnode.com`, `bsc-dataseed.bnbchain.org`, `api.mainnet-beta.solana.com`, `solana-rpc.publicnode.com`, `polygon-rpc.com`, `mainnet.base.org`, `base-rpc.publicnode.com`, `arbitrum-one-rpc.publicnode.com`, `api.hyperliquid.xyz/info` | all allow an arbitrary origin (`*` or reflected); the actual cross-origin POST from a browser was not made |
| U19 | `docs.sx.bet/openapi.json`; `explorerl2.sx.technology/api/v2/stats`; `api.sx.bet/metadata/obv3` | every user route `SxApiKey`; explorer `ACAO *`; metadata keyless, no `ACAO` |
| U20 | `data-api.polymarket.com/v2/{positions, value, activity}?user=<a>` (a = Gamma proxy wallet and two fresh deposit wallets); (b) Gamma `public-profile` for one owner and two fresh wallets (404 `profile not found`); (c) `api.perpetuals.polymarket.com/v1/info/registered?address=<Anvil 0>` | shapes in 4.2; `/v2/value` 200 `0.0` for never-used wallets; Perps `{"registered":true}`, `ACAO *` |
| U21 | re-probes: `external-api.kalshi.com/trade-api/v2/exchange/status` (403 with Origin), `api.underdogexchange.com/markets?limit=1` (no `ACAO`; `ratelimit` headers), `api.novig.com/v3/public/types/sports` (`ACAO *`), `api.gemini.com/v1/prediction-markets/events?limit=1` and `api.crypto.com/fcm/v1/public/get-events?limit=1` (`ACAO` reflects origin) | matches `[26 C4, C7]` one day later |
| U22 | `gh api` reads of `Polymarket/builder-relayer-client` (`src/builder/derive.ts`, `src/client.ts`, `src/config/index.ts`, `src/constants/index.ts`, `src/abis/depositWallet.ts`, examples) and the org repo list | derivation recipes, factory/implementation constants, `deriveDepositWalletAddress` logic |
| U23 | `docs.polymarket.com` `llms.txt`, `trading/{wallets-auth, session-keys, wallet-activity}`, `resources/contracts`, `perps/{fund-your-account, authenticated-sessions, account-management}`, `trading/combos/overview` | wallet types, factory table, public registration route, Combos |

Approximate counts: 7 hosts on the Polymarket side (docs, Gamma, CLOB not touched, Data API, Perps API, GitHub, Polygon RPC), 2 BNB RPC hosts, 1 Base-class RPC preflight set, 9 venue API hosts, 6 docs hosts. No request returned 429. One public RPC returned an "archive" refusal and another "limit exceeded" on the full-history query (U12), which I did not retry.
