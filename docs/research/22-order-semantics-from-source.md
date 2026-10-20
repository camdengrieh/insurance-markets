# 22 - Order semantics from verified contract source, on-chain data and open-source clients

Task key: `order-semantics-from-source` (Phase 0 gates 1, 2 and the XO side of 8; open questions (a) to (h)).
Researched: 2026-10-19 (harness date); machine clock during live reads: 2026-10-18 20:0x UTC (one day behind, as in earlier notes).
Method: read-only. No account, key, order or signature was created, no PayBox tool called, nothing signed, no POST/PUT/DELETE, no JSON-RPC call at all (see section 10 for why none was needed). Sources: the verified `CTFExchange` source on the XO Blockscout explorer, public on-chain data from the same explorer (GET only), the `xo-docs` MCP (docs pages and both OpenAPI specs), `gh api` raw reads of Kernel v3.1, Polymarket clients and the community XO clients, and a few unauthenticated GETs to `orderbooks.xo.market`. Scripts: `docs/research/fixtures/gaps/order-semantics-from-source/` (results in `results.txt`).

Confidence: **H** = read first-hand in a primary source or reproduced by my own computation this session (cite given). **M** = secondary or inferred. **L** = weak. "NOT FOUND (searched: ...)" and "NOT ESTABLISHABLE WITHOUT A LIVE ORDER/ACCOUNT" are used literally.

Compliance with the ground rules (details in section 13, "Process disclosures"): User-Agent exactly `insurance-markets-research/0.1`; hosts touched: `explorer-mainnet.xo.market` 56 GETs, `orderbooks.xo.market` 9 GETs, `docs.polymarket.com` 3 GETs (counted by `fetch.py`, all under the 150 cap, >=300 ms apart, no 401/403/429 seen), plus roughly 100 `gh api` / `gh search` reads against GitHub (estimated, not counted by the helper, still under 150; a few `gh search code --repo` calls returned empty or non-JSON and were not retried); XO ToS clause read first (`/legal/terms-of-service` line 57: bots "must comply with these Terms and not overwhelm or misuse the system"; no scraping "for unauthorized purposes"). Every script was grepped for `@` and personal names before running.

---

## 0. Answers at a glance

| Q | Answer in one line | Conf |
|---|---|---|
| (a) nonce | `order.nonce` must equal the exchange's `nonces[order.maker]` at fill time; maker = the smart account; fresh account = 0; there is NO user-callable cancel or nonce bump (only admin `incrementNonceFor`, never called: zero `NonceIncremented` events); 600 of 600 sampled live orders carry nonce 0. | H |
| (b) signature | Exchange: `signer == maker`, `maker.code.length > 0`, Solady `isValidSignatureNow` (plain ERC-1271 staticcall, no ERC-6492). Kernel v3.1 prefix byte: `0x00` = root validator, `0x01 + validator(20)` = named validator (must be installed), `0x02` = permission. Both `0x01\|\|0x845ADb..\|\|sig` (595/600 sampled orders) and `0x00\|\|sig` (1/600, settled) are valid on chain. The ECDSA validator accepts raw ECDSA over the Kernel-wrapped digest OR EIP-191 over it; all 62 classifiable app accounts use the EIP-191 form, not the raw form the docs show. | H |
| (c) size/tick/rounding | No on-chain minimum, tick or step. Gateway tick 0.001 (global, 500/500 markets); live `min_order_size` is "0" on 4/4 books. Settled orders as small as 1.001 shares / $0.064 notional exist. XO's own UI rounds BUY collateral UP and SELL proceeds DOWN (580/580 inexact cases). Choosing share sizes in multiples of 0.001 share makes rounding exact. | H (chain), M (gateway floors) |
| (d) cancel | No on-chain cancel exists. Cancel is gateway-only. Documented HMAC form is `DELETE /order {"orderID": ...}`; batch/market/all HMAC-only shapes are undocumented in the OpenAPI schema but implied by the Rust sample and Polymarket SDKs. `CancelOrder` EIP-712 typed data: NOT FOUND. | H / M |
| (e) HMAC | Message is `timestamp + METHOD + path + body` in XO docs and all Polymarket clients. Difference: XO docs say path INCLUDING query; py/ts/rs Polymarket clients sign path only; the two XO community clients disagree. Identical when no query string. Recommended default and a 6-request auto-detect given in section (e.3). | H (facts), L (which the server verifies) |
| (f) API keys | Create mints (capped by unknown `MAX_KEYS_PER_USER`); derive "never mints" and returns the oldest key. Whether derive re-returns the secret is not determinable offline (evidence ~balanced, leaning yes). DELETE level: L2 more likely than the L1 the prose says. | M / L |
| (g) L2 on POST /order | Strong evidence yes (docs table, Rust sample, Polymarket reference clients, both XO community clients); OpenAPI `security` block is empty (known under-annotated). Treat as required. | M-H |
| (h) engine | Balance drop: LIFO cancel of newest orders until exposure fits (docs). Taker delay 500 ms (3 s sports in match time). GTD: non-zero expiration, sweeper ~10 s after deadline, exchange enforces expiry at `block.timestamp` anyway. Minimum lifetime: NOT FOUND for XO; Polymarket currently requires >= 3 minutes (not 60 s); XO orders with ~16 s remaining have been matched. | H (docs/code), L (gateway minimum) |

New findings not asked for, with build impact (details in section 9): (1) a cancelled order stays valid on chain until expiry/fill, so short GTD is the only hard bound; (2) BUY fills pull principal PLUS fee, fee ceiling is 800 bps of principal on chain (so `makerAmount <= cap/1.08`); (3) an order with `takerAmount == 0` crosses everything, never sign it; (4) XO accounts are deployed lazily by their first UserOp (6/6 sampled traded accounts), and neither the exchange nor Kernel accepts ERC-6492 wrappers, so the account must have code before it can sign; (5) the deployed ECDSA validator's dispatcher matches the Kernel v3.1 ABI exactly (9/9 selectors).

---

## 1. Evidence base (what was read, at which version)

| Item | Version / identifier | How read |
|---|---|---|
| XO `CTFExchange` implementation | `0x24BB67503d92f3b2A36cf97c45E51FF2C0c452ED`, solc 0.8.28, cancun, 200 runs, verified 2026-08-10T11:00:02Z (H) | `GET explorer-mainnet.xo.market/api/v2/smart-contracts/<impl>`; 66 source files extracted by `extract_src.py` |
| Proxy | `0x4bC5E872256D12E6017dfe466E04c867DC761B77` ERC1967Proxy created in tx `0x834910095e4d91e5503f754b0f73d3cf5ec1393d14a334e1e9f9f7a8ceee37ad`; exactly one `Upgraded` event ever (that tx), so the verified source is the only implementation the proxy has had (H) | explorer address + `getLogs` topic `Upgraded(address)` |
| Kernel v3.1 | tag `v3.1` (commit `03f7f5cf5871cda0070e4223f196f5b577f6cde2`); implementation on chain `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` = "Kernel v0.3.1 Account Logic" (also in `zerodevapp/sdk` `packages/core/constants.ts`, `pimlicolabs/mock-aa-environment` README) | `gh api` raw; XO accounts' proxy implementation read from the explorer |
| ECDSA validator | `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57`, unverified on the XO explorer, but its dispatcher exposes exactly the 9 selectors of the Kernel v3.1 `ECDSAValidator` ABI (`onInstall 6d61fe70`, `onUninstall 8a91b0e3`, `isModuleType ecd05961`, `isInitialized d60b347f`, `validateUserOp 97003203`, `isValidSignatureWithSender f551e2ee`, `preCheck d68f6025`, `postCheck 173bf7da`, `ecdsaValidatorStorage 20709efc`) and not the newer HEAD-only `validateSignatureWithData` (H, my selector check) | explorer bytecode + `cast sig` |
| On-chain order sample | 300 `matchOrders` txs from the operator account, explorer tx pages 1-6, blocks around 12.607M-12.609M, 2026-10-18T17:32Z to 19:52Z: 600 signed orders, 68 distinct makers | `page_op_txs.py`, `analyze_orders.py` |
| XO docs | `xo-docs` MCP: `/guides/{smart-accounts,order-types,wire-conventions,taker-delay,auto-cancellation,fees,trading-pause}`, `/api-reference/authentication*`, `/api-reference/trade/*`, `/openapi/api-reference/openapi.yaml`, `/legal/terms-of-service` | MCP reads |
| Polymarket clients | `Polymarket/py-clob-client` @ `b076b04d` (2026-05-25), `Polymarket/clob-client` (TS) @ `7df8257d` (2026-05-25), `Polymarket/rs-clob-client` @ `dc8f1e58` (2026-05-11) | `gh api` raw |
| XO community clients | `NitinkashyapSTRR/xo-pulse-market-maker` (MIT, pushed 2026-10-07), `klumpfuss1234/xo-market-tui` (MIT, pushed 2026-10-09). `Himess/ghost-mode-paybox` has zero XO order code (README, RESEARCH, DECISIONS grep: 0 hits for `xo.market`/orderbook/clob/hmac). Other `gh search` hits (`quanturbo/xo_market`, `Osivwi10/xo-trading-bot`, `HarrisonJL/pl-conviction-board`) are BSC/Base AMM-era bots or a dashboard with no CLOB/HMAC code. | `gh api`, `gh search code "orderbooks.xo.market"` (only the TUI matched), `gh search code "XO_SIGNATURE XO_PASSPHRASE"` (0), `gh search repos "xo.market"` |

---

## (a) Order nonce

**Answer.** `order.nonce` is not a free field. It must equal the maker's on-chain counter at fill time. The counter is per `maker` (the smart account). A fresh account has counter 0. Users cannot change the counter.

Evidence (all H, verified XO `CTFExchange` source; path inside the verified bundle, `src/clob/exchange/...`):
- `mixins/NonceManager.sol:27-29`: `isValidNonce(usr, nonce) { return nonces[usr] == nonce; }` (equality, not "greater or equal").
- `mixins/Trading.sol:92-93` (inside `_validateOrder`, called from every fill path via `_performOrderChecks`, lines 268-272): `if (!isValidNonce(order.maker, order.nonce)) revert InvalidNonce();`
- `libraries/OrderStructs.sol:36`: "Nonce used for onchain cancellations. Must equal the maker's current nonce". Type is `uint128` (XO changed it from upstream).
- The lookup key is `order.maker`. For `signatureType 3` the contract also forces `signer == maker` (`mixins/Signatures.sol:128`), and XO docs say both are the smart account.
- Nothing lets a user bump it. The only writer is `CTFExchange.sol:178-184`: `incrementNonceFor(address user) external onlyAdmin` with the NatSpec "Admin-only emergency nonce bump ... There is no self-service path" (`NonceManager.sol:15-25` is the internal helper). The deployed ABI (60 functions) has no `cancelOrder`, `cancelOrders` or `incrementNonce()`; the only cancel-like names are `incrementNonceFor`, `isValidNonce`, `nonces` (my read of `abi` in the explorer JSON).
- Upstream user-side cancellation was removed on purpose: `mixins/Trading.sol:39-69` is a commented-out block headed `// TODO remove cancellation` containing `cancelOrder` / `cancelOrders` / `_cancelOrder`. The ABI still lists an `OrderCancelled` event with no function that emits it.
- Fresh-account value: the counter is a mapping with default 0 and nothing initialises it. `getLogs` over blocks 0..latest for `NonceIncremented(address,uint128,uint128,address)` (`0xc3ab8769b052bec3201cd16265d258ccc297277e8d91d562d5b5e399d5f8cca0`) on the proxy returns "No logs found" (query form validated: the same call shape returns data for `Upgraded` and `MaxFeeRateUpdated`). So no account's counter has ever moved off 0 (H). Independent confirmation: 600 of 600 sampled live orders (all makers, XO app and bots alike) carry `nonce = 0` and were accepted by the exchange (`analyze_orders.py`, `results.txt`).

What the gateway does with the field at placement is not documented (NOT FOUND); since it only ever sees 0, signing `nonce = 0` is the proven value.

Implications:
- Hard-code `nonce = 0`. Before a signing session, read `NonceIncremented` logs filtered to the maker (topic1 = padded maker address; the explorer `getLogs` GET works without a key) and refuse to sign if any exists: the account's counter is then `newNonce` of the last log and all older signed orders are dead.
- There is no on-chain "cancel by nonce" for the user. See section 9, item 1, for the consequence for cancel and expiry design.

---

## (b) Signature validation (signatureType 3)

### b.1 What the exchange does

`validateOrderSignature` (`mixins/Signatures.sol:19-23`) routes to `isValidSignature(order.signer, order.maker, hash, order.signature, order.signatureType)` (lines 35-55). The `SignatureType` enum (`OrderStructs.sol:54-63`) is `EOA=0, POLY_PROXY=1, POLY_GNOSIS_SAFE=2, POLY_1271=3`. For 3 the code is (`Signatures.sol:123-130`):

```
return (signer == maker) && maker.code.length > 0
    && SignatureCheckerLib.isValidSignatureNow(maker, hash, signature);
```

Solady `SignatureCheckerLib.isValidSignatureNow(address,bytes32,bytes)` (`lib/solady/src/utils/SignatureCheckerLib.sol:32-77`, H): if `signer.code.length == 0` it uses ecrecover, otherwise it `staticcall`s `isValidSignature(bytes32,bytes)` (selector `0x1626ba7e`) and requires the same magic value back. It copies the signature as given. The ERC-6492 variants (`isValidERC6492SignatureNow...`, lines 319 and 400) exist in the library but are NOT called. Conclusions (H):
- ERC-6492 is not handled. A 6492-wrapped signature is passed raw to the account; for a Kernel account its first byte (zero padding of an ABI-encoded address) would select root mode and the remainder would not be a 65-byte ECDSA signature, so it fails.
- An undeployed (counterfactual) account always fails: `maker.code.length > 0` is required by the exchange; the gateway's L1 check likewise reported "EIP-1271: ... no contract code" for a no-code address (note 01 live probe, M).
- Any revert inside the account's `isValidSignature` (for example Kernel's `InvalidValidator`) becomes a `false` from Solady and then `InvalidSignature` at the exchange.
- `hash` is `hashOrder(order)` (the EIP-712 order digest, `mixins/Hashing.sol:19-40`), 13 fields, `signature` excluded.

### b.2 What Kernel v3.1 does with the prefix byte

`zerodevapp/kernel@v3.1`, H:
- `src/Kernel.sol:318-338` `isValidSignature(bytes32 hash, bytes signature)`:
  1. `(vId, sig) = ValidatorLib.decodeSignature(signature)`.
  2. If the type of `vId` is ROOT (`VALIDATION_TYPE_ROOT = 0x00`, `src/types/Constants.sol:40`), `vId = vs.rootValidator`.
  3. `if (address(vs.validationConfig[vId].hook) == address(0)) revert InvalidValidator();`
  4. If type is VALIDATOR (`0x01`): `validator.isValidSignatureWithSender(msg.sender, _toWrappedHash(hash), sig)`. Otherwise (PERMISSION `0x02`) it checks `permissionFlag` and calls `_checkPermissionSignature`.
- `src/utils/ValidationTypeLib.sol:80-102` `decodeSignature`, by first byte: `0x00` consumes 1 byte ("sudo mode"); `0x01` consumes 21 bytes (type + 20-byte validator address); `0x02` consumes 5 bytes (type + 4-byte permission id); anything else `revert(0,0)`.
- `src/core/ValidationManager.sol:591-593` `_toWrappedHash(h) = _hashTypedData(keccak256(abi.encode(KERNEL_WRAPPER_TYPE_HASH, h)))` with `KERNEL_WRAPPER_TYPE_HASH = 0x1547321c...9c83` (`Constants.sol:60`), and `Kernel.sol:153-156` domain `name "Kernel"`, `version "0.3.1"` (the domain also carries `chainId` and `address(this)` from Solady EIP712).
- The ECDSA validator in the same tag (`src/validator/ECDSAValidator.sol:68-84`), whose ABI matches the deployed `0x845ADb..` (section 1): `isValidSignatureWithSender` returns the magic value if `owner == ECDSA.recover(hash, sig)` (raw) OR `owner == ECDSA.recover(toEthSignedMessageHash(hash), sig)` (EIP-191). Returns invalid if `owner` mismatches. `owner` is the one set in `onInstall` and announced by `OwnerRegistered(kernel indexed, owner indexed)`.

### b.3 Which prefix is valid for an XO account, and when

| Wire signature | Valid iff | Observed on chain |
|---|---|---|
| `0x01 \|\| 0x845ADb2C..4cE57 \|\| ecdsa65` (86 bytes) | the ECDSA validator is installed on the account with a non-zero hook config (always true for the root validator) AND the owner key matches | 595 of 600 sampled orders (68 distinct makers in the whole sample), e.g. `0x26af2d5e0fe9a5e3cd802d9bde361105cc32f6991cb6bbe78f8596d042912f09` (H) |
| `0x00 \|\| ecdsa65` (66 bytes) | the account's CURRENT root validator accepts that ECDSA signature (true for ECDSA-rooted accounts) | 1 order, tx `0xfd285fe081e6e7659d286c182b0252e8cd2d7c97945b1a0dfdeeda79c971598b` (settled on chain; that account also has the 0x845A validator registered), used by `xo-market-tui` `signing.ts:81` (H for the observation) |
| `0x02 \|\| permissionId(4) \|\| sig` | a permission (policy + signer) has been installed with signatures allowed (`SKIP_SIGNATURE` flag not set) | n/a for a default XO account (would revert `InvalidValidator` otherwise) |
| bare 65 bytes (no prefix) | only for NON-Kernel ERC-1271 contracts that take a raw ECDSA signature. A Kernel account reverts on any first byte other than 0,1,2. | 4 orders from one non-Kernel account (impl `0x1d0a45f6...`, no ECDSA-validator events), accepted on chain; not usable for us |

Which digest the owner signs (verified end to end on mainnet, H; `verify_onchain_sigs.mjs`, `sigform_by_maker.mjs`):
- I recomputed, for 9 real orders (8 with `0x01`, 1 with `0x00`): the EIP-712 order digest under `{XO Market CLOB, 1, 3223, 0x4bC5..}`, the Kernel wrap under `{Kernel, 0.3.1, 3223, maker}`, then `ecrecover`, and compared with the owner registered in the validator's `OwnerRegistered` log for that maker. 9 of 9 match. This independently confirms the domain constants, the 13-field typehash and the Kernel wrapper against live mainnet data, not just the docs.
- Which form: the `0x00` account signed the RAW ECDSA over the wrapped digest (what the docs sample shows: `owner.sign({hash: wrapped})`). All 8 picked `0x01` accounts instead signed EIP-191 `personal_sign` over the 32 wrapped-digest bytes. Over all 600 orders grouped by maker: 62 makers classifiable as EIP-191-over-wrapped, 0 as raw-in-`0x01`-mode, 6 ambiguous (single order or repeated identical order). The validator source accepts both (above), so both are valid; the docs sample's raw form is proven on chain only for the one root-mode account, the EIP-191 form for 62.
- Consequence for a PayBox-signed flow: `typedData` of `Kernel(bytes32 hash)` yields raw ECDSA over the wrapped digest (accepted per source and per the root-mode account); a `message`/personal-sign style intent over the raw 32 bytes yields the EIP-191 form XO's own app uses (only if PayBox can sign hex bytes rather than a UTF-8 string, which is a PayBox-side unknown).

Conclusion (b): use `0x01 || 0x845ADb... || ecdsa65` as the default, because it is what the docs specify, what 99% of sampled orders use, and it does not depend on which validator is root. Keep `0x00 || ecdsa65` as a fallback: the 65-byte inner signature is the same for both prefixes (the prefix is not part of the signed digest), so a relay can swap prefixes without a new PayBox signature after an explicit signature-rejection response. Do not swap after a timeout or ambiguous response (see A4 in the register). Never use `0x02`. The account must already have code.

---

## (c) Minimum size, tick, rounding

### c.1 On-chain
- No minimum order size, notional, tick or step anywhere in the exchange (H: full source of `Trading.sol`, `CalculatorHelper.sol`, `Fees.sol`, `Registry.sol` read; nothing but `validateTokenId`, expiry, signature, filled-status, nonce, beneficiary checks in `_validateOrder` lines 71-94).
- Partial-fill rounding: `CalculatorHelper.sol:11-14`: `taking = making * takerAmount / makerAmount` (floor). A maker never gives more than `making <= remaining` (`Trading.sol:411-414`), and never receives less than the floor of the proportional amount (loss < 1 micro-unit per fill).
- Zero amounts: `isCrossing` (`CalculatorHelper.sol:25-27`) returns true when either order's `takerAmount == 0`, so such an order matches ANY counterparty price. Never sign `takerAmount == 0` (and `calculateTakingAmount` returns 0 for `makerAmount == 0`).
- Smallest settled amounts in the sample (H, public chain data): smallest order in shares 1.001001 (tx `0x3165885bed0acc185f674ec207fbdc9f9c59f4e272216a3149b0eea33bceef1f`, a $1.00 BUY at 0.999); smallest RESTING (maker) order 1.180001 shares (tx `0x2563932c2a5cec1241c3100cde324ffa3b63389fe713b9507ab90e2c8c45587e`); smallest order collateral 64,000 micro-USDC = $0.064 (8 shares at 0.008, same tx as the first); smallest `takerFillAmount` 35,846 micro-USDC (tx `0x18821f2883559ae5bdb8555b55866efd5837043cb19819d66c56be8353e72725`) and the smallest maker fill 8,064. So fills are not dust-limited on chain.

### c.2 Gateway and docs
- Tick: `/guides/wire-conventions`: "Tick size is 0.001 globally ... not a multiple of the tick ... 400 'invalid price tick'". Live `GET /tick-size?token_id=` for 4 active tokens returns `{"minimum_tick_size": 0.001}` (f64, not a string); `GET /book` returns `tick_size "0.001"`; the first page of `GET /markets?limit=500` has `minimum_tick_size = 0.001` for 500 of 500 (47,091 markets in total) (H, fetched this session; files in the scratchpad `raw/live_*`).
- `min_order_size`: `/book` returns `"0"` on 4 of 4 books fetched today, all populated (5-6 levels per side on three, 1 bid and 5 asks on the fourth) (the OpenAPI says "0 when the gateway has no MarketInfo yet"; this does not explain populated books, as noted by the earlier verifier).
- The only stated floors are error EXAMPLES in the OpenAPI (`size below minimum: min 5000000, got 1000`, `notional below minimum: min 10000, got 500`, named "MIN_ORDER_SIZE_SHARES floor"). The only "5 shares" in the docs is the liquidity-REWARDS eligibility rule (`/product/rewards/liquidity-rewards.mdx:26,33,91`), and the creation seed "At least $10.00" (`/product/trading/fees.mdx:118`). The sample orders of 1.00-1.18 shares and $0.064 notional settled on 2026-10-18, so a 5-share floor was not enforced on those markets (it may be market-specific, apply only to some order types, or be an illustration). Value of the real gateway floor: NOT ESTABLISHABLE WITHOUT A LIVE ORDER.
- Price range: tick integer in [1, 999] over 1000 (wire-conventions). Orders at 0.99/0.001 are the documented market-style caps.

### c.3 Rounding that XO itself uses (empirical, H)
For every one of the 600 orders I fitted the nearest tick `t` and compared the collateral leg `C` with `S*t/1000` (S = share micro-units): BUY inexact cases 289, all with `C = ceil(S*t/1000)`; SELL inexact cases 291, all with `C = floor(S*t/1000)`; exact (no rounding needed) 14 BUY, 6 SELL; 595 of 600 orders have `S % 1000 != 0` (arbitrary micro-share sizes are accepted). Example, tx `0x26af2d5e...2f09`: BUY S=50,838,669 at tick 291 gives C=14,794,053 (floor would be 14,794,052); SELL S=71,017,854 at tick 291 gives C=20,666,195 (ceil would be 20,666,196). So the app rounds toward "more aggressive by less than 1 micro-USDC" (BUY pays up, SELL accepts less), which guarantees crossing at the tick, and the gateway accepts it despite the sub-micro off-tick ratio.

### c.4 Which direction cannot overspend
- The signed `makerAmount` is the hard cap on principal the exchange can pull for a BUY (`_updateOrderStatus`, `Trading.sol:405-424`, rejects `making > remaining`). Floor rounding of a BUY collateral leg never exceeds the exact tick notional; ceil can exceed it by < 1 micro-USDC. Either way the cap check must be done on the integer `makerAmount`, not on the decimal price.
- Exactness trick (H, arithmetic): if `S` is a multiple of 1000 micro-shares (0.001 share) then `S*t/1000` is an integer for every integer tick `t`, so floor and ceil coincide and there is no rounding question and no sub-micro off-tick ratio. XO's own bot (`xo-pulse-market-maker/src/xo/signing.ts:206-223`) does this by whole shares.
- The cap must also include the fee, which sits on top of principal for BUYs (section 9, item 2): worst case outflow is `makerAmount * (1 + maxFeeRateBps/10000)`, and `maxFeeRateBps = 800` on chain today.

Recommended default (build): `t` integer in [1,999]; `S` in multiples of 1000 and >= 1,000,000 (1 share); BUY `(makerAmount=C, takerAmount=S)`, SELL `(makerAmount=S, takerAmount=C)` with `C = S*t/1000` exact; reject `S%1000 != 0` unless the XO-UI rule (BUY ceil, SELL floor) is explicitly enabled; reject zero amounts; check `makerAmount*1.08 <= cap`.

---

## (d) Cancel

### d.1 On chain
There is no on-chain cancel (section (a)). The only invalidations of a signed order are: fully filled; `expiration` passed (checked against `block.timestamp` in `_validateOrder` line 73: `order.expiration > 0 && order.expiration < block.timestamp`, so `expiration == block.timestamp` is still valid); insufficient maker balance/allowance when the operator tries to settle (the transfer reverts); admin nonce bump; the XO operator simply not matching it. Settlement is `onlyOperator` (`CTFExchange.sol:103,111,127`), so a leaked signature cannot be settled by a third party, only by XO's operator.

### d.2 What the docs/OpenAPI say (H for what is written)
- `DELETE /order`: "Cancel a single order via signed `CancelOrder(orderId, marketId)` or via HMAC + `orderID`." Examples: `hmac_clob_form {"orderID":"42"}` and `eip712_legacy_form {orderId:42, marketId, signature, signatureType:3, signer}`. Schema (legacy) requires `orderId:int64, marketId, signature, signatureType`; `signature` described as "EIP-712 sig over CancelOrder(orderId, marketId)". The typed-data domain, field types, Kernel wrapping and the empty-`marketId` global encoding are NOT FOUND (searched all of `/api-reference/trade/*`, `/guides/*`, both OpenAPI specs, the docs search tool, and every community client). Do not implement the signature forms.
- `DELETE /orders`, `DELETE /cancel-all`, `DELETE /cancel-market-orders`: OpenAPI schemas require `signature` + `signatureType` (legacy), `security` is null, and the Rust sample comments say only "Requires an authenticated client": `client.cancel_orders(&["0x<hash>", "0x<hash>"])`, `client.cancel_all_orders()` (no arguments), `client.cancel_market_orders(&CancelMarketOrderRequest{ market, asset_id })`. `CancelResponse` is `{canceled: [decimal ids], notCanceled: {id: reason}}`; reasons "already filled", "not found", "not owner".
- Auth: the authentication page lists L1 for the four `/auth/*` endpoints and "L2 HMAC: Every other authenticated endpoint" (`/api-reference/authentication`), which includes every trade route.

### d.3 Client comparison (H for what each file does; none of the XO clients has been run live with funds)

| Client | single cancel | batch | cancel-all | per market | HMAC target | L2 headers sent | sig prefix | amount rounding |
|---|---|---|---|---|---|---|---|---|
| XO docs / OpenAPI | `DELETE /order {"orderID":"42"}` (HMAC) or legacy signed | schema: legacy object `{orderIds[int64], marketId, signature, ...}` | schema: `{signature, signatureType, signer}` | schema: `{marketId, signature, ...}` | path **including** query | `XO_API_KEY, XO_TIMESTAMP, XO_PASSPHRASE, XO_SIGNATURE` | `0x01\|\|validator\|\|sig` | unspecified |
| XO Rust sample (docs) | `cancel_order("0x<hash>")` | `cancel_orders(&[hashes])` | `cancel_all_orders()` | `cancel_market_orders({market, asset_id})` | not shown | "authenticated client" | n/a | `price(dec!(0.55)).size(100)` |
| `xo-pulse-market-maker` (`src/xo/orderbook.ts`) | `DELETE /order {"orderID": id}` using `id` from `GET /orders` (lines 129-134) | none: loops single cancels (comment: batch/market/all "want an extra EIP-712 cancel signature ... not fully documented", lines 136-147) | `GET /orders` then loop single (149-152) | same loop | `pathWithQuery` (line 188-196, docs-faithful) | the four documented ones (no address header) | `0x01\|\|0x845A..` (`signing.ts:156-161`) | whole shares, exact (`signing.ts:206-223`) |
| `xo-market-tui` (`src/api/*`, `src/trading/*`) | none | `DELETE /orders` with body = JSON array of order HASHES, no signature (`trading-client.ts:66-69`) | none | none | default `path-only`, switchable to `path-with-query` (`wallet/session.ts:45,68-75`: "Live XO compatibility: path only" vs "Documented form: path + query") | the four + `XO_ADDRESS` (`auth.ts:21-30`) | `0x00\|\|sig` (`signing.ts:81`) | floor on both legs, >= 1 share (`units.ts:25-33`) |
| Polymarket py-clob-client | `DELETE /order {"orderID": id}` (`client.py:663-682`) | `DELETE /orders` body = JSON list of ids (684-701) | `DELETE /cancel-all` no body (703-711) | `DELETE /cancel-market-orders {"market","asset_id"}` (729-748) | path only (`request_path=ORDERS`; query appended after signing, lines 756-765) | `POLY_ADDRESS, POLY_SIGNATURE, POLY_TIMESTAMP, POLY_API_KEY, POLY_PASSPHRASE` | n/a | n/a |
| Polymarket rs-clob-client | `DELETE order {"orderId": id}` (`client.rs:1562-1571`; note camelCase `orderId`) | `DELETE orders` JSON array (1582-1591) | `DELETE cancel-all` (1601-1609) | `DELETE cancel-market-orders` (1613-1628) | `request.url().path()` (`auth.rs:398-405`) | same five POLY_ headers | n/a | n/a |

Takeaways:
1. Every client uses HMAC only for cancels. Nobody (docs, XO bots, Polymarket) implements the `CancelOrder` signature. Treat it as unimplementable offline.
2. Polymarket's two reference clients disagree on the single-cancel body key (`orderID` in py/TS, `orderId` in Rust). XO documents `orderID` (the legacy schema uses `orderId` with an int64 value). Default `orderID`; if the server answers 400 on parse, retry once with `orderId`.
3. Order id form: docs example numeric `"42"`; Rust sample 0x hash; `canceled[]` returns decimal ids; `POST /order` returns the 0x hash (`orderID`) and `GET /orders` rows carry both `id` and `order_hash`. Default: send the 0x order hash (always known locally, no extra call); on `notCanceled: "not found"` or 400, look up the numeric `id` via `GET /orders` and retry. A wrong-id cancel is harmless.
4. Batch/market/all: HMAC-only acceptance is implied (Rust sample, TUI) but not documented. Default for the relay: single `DELETE /order` per order, driven by `GET /orders` (no query string, so the HMAC-target ambiguity does not apply). Try `DELETE /cancel-all` HMAC-only only as an emergency path and fall back to the loop on a 400/401/422 that mentions a signature; nothing is cancelled by a rejected request.
5. Rate: authenticated single placement+cancel share 250 req/s, batch 25 req/s, cancel-all 5 req/s (note 01 section g), so a loop of single cancels is within limits for caps of this size.

---

## (e) HMAC canonical string

### e.1 The schemes side by side

| Aspect | XO docs (authentication page, smart-accounts page) | Polymarket py-clob-client | Polymarket TS clob-client | Polymarket rs-clob-client | XO MM bot | XO TUI |
|---|---|---|---|---|---|---|
| Message | `timestamp + method + path + body` | same, `str(ts)+str(method)+str(path)` (+ body) | `timestamp + method + requestPath` (+ body if defined) | `format!("{timestamp}{method}{path}{body}")` | `ts + METHOD + path + body` | `${ts}${METHOD}${target}${body}` |
| Path | request path **including the query string when present** | **path only**: `request_path=ORDERS`, query appended afterwards (`client.py:756-765`) | **path only**: `requestPath: endpoint` constants (`client.ts:497-500`, `665-668`) | **path only**: `request.url().path()` (`auth.rs:402`) | with query (docs-faithful) | default **path only**; docs form selectable |
| Body | "raw request body" | `str(body).replace("'", '"')`, compact JSON `separators=(",",":")` pre-serialised and sent byte-identically | body as sent | `body_to_string` also replaces `'` with `"` | `JSON.stringify(body)`, sent as-is | `JSON.stringify`, sent as-is |
| Key | "secret" ("Base64-encoded HMAC secret" in schema); decode step not stated | `urlsafe_b64decode(secret)` | url-safe to standard base64 then decode | `URL_SAFE.decode(secret)` | url-safe to standard base64, decode, falls back to raw string if empty | same decode with padding fix |
| Output | "URL-safe base64" (padding not stated) | `urlsafe_b64encode`, padded `=` | base64 with `+/` replaced (padded) | `URL_SAFE.encode`, padded | `digest("base64")` with `+/` replaced, padded | same, padded |
| Header names | `XO_*`, no address header | `POLY_*` incl. `POLY_ADDRESS` | `POLY_*` | `POLY_*` incl. `POLY_ADDRESS` | `XO_*`, no address | `XO_*` incl. `XO_ADDRESS` |
| Tolerance | +/-30 s | not stated in code | not stated | not stated | n/a | n/a |

Facts that follow (H unless noted):
- Differences between XO's documented scheme and Polymarket's reference: (1) query string inclusion; (2) header names (`XO_*` vs `POLY_*`; live: `POLY_*` rejected with "HMAC L2 credentials required", `XO_*` accepted, note 01); (3) no address header in XO's docs vs `POLY_ADDRESS`; (4) the single-to-double-quote replacement in the body, which Polymarket clients apply and XO docs do not mention (irrelevant for JSON we build: our bodies contain no apostrophes); (5) whether the key is the base64-decoded secret and whether padding is kept: XO docs silent, all five clients decode and keep padding.
- With no query string the two path variants are byte-identical (`hmac_variants.py`: for `GET /auth/api-keys` and `DELETE /order` the path-only and path-with-query signatures are equal, and my copy of py-clob-client's function reproduces the path-only value exactly). So the ambiguity exists only for signed requests that carry a query: `GET /orders?...`, `GET /data/orders?...`, `GET /trades?...`, `GET /data/trades?...`. POST, DELETE, `/auth/*` and `GET /orders` without parameters are unaffected.
- Which variant each XO client uses: MM bot = path+query; TUI = path-only default with a switch labelled "Live XO compatibility". Neither has demonstrated success against live XO (MM bot README: live mode not run with real funds; TUI: unknown, 0 stars, private launcher mentioned). So the "live" label is M/L, not proof.

### e.2 Does the evidence support path-only or path+query?
- For path+query: the vendor's own wording in two pages ("**including** the query string when present").
- For path-only: all three official Polymarket clients; XO's Rust SDK shape is a near-copy of `rs-clob-client` (same builder API: `authentication_builder(signer).authenticate()`, `limit_order()...`, `post_order`, `cancel_orders`, `cancel_all_orders`, `cancel_market_orders`), which signs `url().path()`; the TUI author's "Live XO compatibility" label (weak).
- Verdict: genuinely undecided (call it 50/50, L). Do not assume either; design so it rarely matters, and detect.

### e.3 Recommended default and auto-detect without burning limits or key slots

Default: avoid query strings on signed requests (use `GET /orders` with no parameters and filter client-side; track order state by hash). With no query, only secret decoding and padding remain open, and they are settled by the first authenticated call.

Detection protocol, run once per deployment/environment (re-run only if XO changes auth):
1. Align the clock with `GET /time` (seconds) so the +/-30 s window is not the cause of any 401.
2. Probe A, no query (isolates key/passphrase/decoding/padding): `GET /auth/api-keys` with the freshly minted or stored triplet. Variants in order: base64url-decode + padded (expected), decode + stripped padding, raw-string key + padded, raw + stripped. Stop at the first 200. At most 4 requests.
3. Probe B, with query (isolates the target): `GET /orders?limit=1` first with the documented form (path + query); on a 401 repeat once with path-only. Because probe A already proved key, passphrase, timestamp and decoding, a 401 here is a target mismatch. At most 2 requests.
4. Cache the winning `{decode, padding, target}` in relay config; apply it globally (server behaviour, not per user). Space probes >= 1 s apart; total <= 6 authenticated GETs.
5. Burn analysis: all probes are read-only GETs on an existing key, so no key slot is consumed (never call `POST /auth/api-key` to test), no order is created, and the volume is far below the documented limits. Failed-auth lockout behaviour is NOT FOUND, so cap attempts (stop after 6 failures per credential and alert instead of looping).
6. Do not auto-retry on timeouts or non-401 errors. Do not use detection on POST/DELETE (they carry no query, so there is nothing to detect).

Test vectors for the relay's unit tests (self-consistency only, not server-confirmed) are in `fixtures/gaps/order-semantics-from-source/results.txt`, computed from the OpenAPI example secret.

---

## (f) API keys

### f.1 What the sources say

| Question | Evidence | Source | Conf |
|---|---|---|---|
| Create semantics | `POST /auth/api-key` "Mint a new API key ... rate-limited to `MAX_KEYS_PER_USER` total keys; further calls return 400 'api key limit reached'". | `/api-reference/authentication/create-api-key` | H |
| Derive semantics | `GET /auth/derive-api-key` "Deterministically derive the caller's existing key - returns the oldest key in insertion order ... Never mints"; 200: "existing (oldest) key, NOT a fresh one"; 404: "SDKs use this 404 to fall through to POST /auth/api-key (recover-or-create flow)". The L1 `nonce` does not select a key (not mentioned). | `/api-reference/authentication/derive-api-key` | H |
| Derive returns secret? FOR | derive 200 lists `apiKey, secret, passphrase` as required with an example; the page's own words "recover-or-create"; official sample `smart_wallet_api_key.ts` and both community bots call derive first and require a full triplet; XO's Rust `authenticate()` is described as "mints/derives". | OpenAPI, notes 01/07 | M |
| Derive returns secret? AGAINST | `ApiKeyTriplet` description: "the secret/passphrase are never returned again. Store them on receipt"; secret field: "never sent on the wire after creation"; authentication page: "the secret is only shown once". | OpenAPI, auth page | M |
| Key limit | symbol `MAX_KEYS_PER_USER` only; numeric value NOT FOUND (searched the docs tree, both OpenAPI specs, all community code). | docs | - |
| DELETE level | prose table puts `DELETE /auth/api-key` under L1; OpenAPI security puts delete and list under L2; live `GET /auth/api-keys` without L2 is 401 (note 01); Polymarket's `delete_api_key` is L2 in py (`client.py:291-300`) and TS (`client.ts:535-548`) and the Rust client builds L2 headers for it (`client.rs:1384-1391`). XO's body carries `{api_key}`. | docs + clients | M for L2 |
| Scopes/expiry/read-only keys | none documented. Polymarket has read-only keys (`CREATE_READONLY_API_KEY` in py/TS); XO's OpenAPI path list has no equivalent (`/auth/api-key`, `/auth/api-keys`, `/auth/derive-api-key` only). | OpenAPI path list, TS client | H (absence) |

### f.2 What Polymarket's open source tells us, and whether XO copies it
- In Polymarket's SDKs `derive_api_key` returns the full credential: py `client.py:232-251` builds `ApiCreds(api_key, api_secret=creds_raw["secret"], api_passphrase=creds_raw["passphrase"])` from the derive response; TS `client.ts:464-483` the same; Rust `client.rs:444-456` deserialises `Credentials`. The TS README says "In general don't create a new API key, always derive or createOrDerive" (`README.md:32`). So on Polymarket derive re-returns the secret deterministically for `(address, nonce)` (H as the SDK contract; the server side is not open source).
- Create-or-derive order: py/TS/Rust all try CREATE first and fall back to DERIVE on error (`client.py:253-260`, `client.ts:485-492`, `client.rs:458-472`). Doc comment (`client.rs:1269-1270`): create "returns an error if there already is one for the particular ... `address` and `nonce`".
- XO copies the wire shape (endpoints, camelCase `apiKey/secret/passphrase`, 404-then-create idiom, `XO_NONCE`) but not the semantics: Polymarket keys are per `(address, nonce)`; XO has several keys per user, derive returns "the oldest", and a cap. XO's own Rust sample uses the Polymarket idiom (create first, then derive on error): with XO's cap semantics it would mint a new key on every `authenticate()` until the cap, then fall back to derive, which only works if derive returns the secret. That tilts toward "derive returns it" (M, perhaps 60/40) but is an inference.
- Net: whether derive re-returns the secret is NOT ESTABLISHABLE WITHOUT A LIVE ACCOUNT. It is not determinable from open-source Polymarket behaviour because XO's key model differs; Polymarket analogy is supportive only.

### f.3 Consequences and defaults
- Treat the secret as shown once: persist the triplet (encrypted, keyed by smart account) at creation, before using it.
- Mint at most ONE key per account until `MAX_KEYS_PER_USER` is known; never "create-or-derive" with create first (Polymarket idiom) because that spends a slot each time. Use derive first, like both XO community bots, and validate any derived triplet with probe A.
- If derive does not return a usable secret and the stored triplet is lost, recovery needs `DELETE /auth/api-key`, which is probably L2 and so needs the lost secret: lockout risk (note 01 V2). The relay must therefore never lose the triplet, and must back it up before first use.

---

## (g) Is L2 required on POST /order (and the DELETE routes)?

Evidence, strongest first:
1. `/api-reference/authentication`: L1 is used by the four `/auth/*` endpoints; "L2 HMAC | Per-request secret-keyed signature | **Every other authenticated endpoint**" (H, vendor statement). `POST /order` is authenticated (Tag "Trade": "Place, cancel, and inspect orders and trades for the authenticated maker").
2. `POST /order` and `POST /orders` document `401: L1 ClobAuth (wallet) or L2 HMAC (API key) headers were missing, malformed, expired, or did not match the requested resource` (OpenAPI Error401, shared by all routes, so weak).
3. Rust sample: `authenticate()` then `client.post_order(signed)`; XO's SDK mirrors Polymarket's, whose `post_order` attaches L2 headers (`rs-clob-client client.rs:1487-1496`, `create_headers`) and whose py client does the same (`client.py:623-651`) (H for Polymarket).
4. Both community XO clients send HMAC on every trading call (MM bot `orderbook.ts:188-204`, TUI `trading-client.ts:17-34`) (H for the code).
5. Against: OpenAPI `security` is empty for `POST /order`, `POST /orders` and the DELETE trade routes; the same spec also under-annotates `/heartbeats` and over-annotates `/balance-allowance/update` (note 02), so it is unreliable in both directions.
6. Semantically the order is self-authenticating (the maker signature), so a server could skip L2; the gateway derives `owner` as a UUIDv5 of the maker address, so it could also work without a key. Nothing in the docs says it does.

Verdict: treat L2 as required (M-H). Consequence if wrong in the other direction: a leaked signed order could be POSTed by anyone (no HMAC needed), which makes the short-GTD rule even more important. Cheapest decisive test: see A8 in the register (a POST with a deliberately invalid signature and no L2 headers is safe: whichever error comes back first tells the check order, and it cannot place an order).

---

## (h) Engine behaviour

### h.1 Balance drops (auto-cancel)
`/guides/auto-cancellation` (H): "When the on-chain indexer reports a balance drop - a USDC withdrawal, an AMM trade, or a fill on another venue - the engine cancels enough resting orders to keep your remaining exposure within your new balance. Cancellation order is **LIFO** (newest first), so your oldest resting orders are most likely to survive." Signals: `orders_rebalanced` on combined `/ws`, per-order `order/CANCELLATION` on `/ws/user`. Not documented: how outcome-token (SELL) reservations react to a token transfer or `safeTransferFrom` (the paymaster allowlists it, note 03), any hysteresis or delay, and whether partial fills trigger it. The guide says there are four causes; `/guides/order-types` lists a fifth, "self-trade prevention", in the CANCELLATION frame description (docs inconsistency). `GET /balance-allowance` reports `allowance` as available cash after open-order reservations (`balance - allowance` is earmarked for resting BUYs).

Other cancel causes (docs, H): heartbeat sweep is opt-in (first successful `POST /heartbeats` opts the user in; 30 s threshold, 5 s sweep; a never-opted-in user is never tracked), market terminal states (`Resolved`/`Voided`/`Closed`) cancel everything atomically, `Paused` does not, GTD expiry sweeper.

### h.2 Taker delay
`/guides/taker-delay` (H): marketable orders are held 500 ms by default and 3 s on sports markets during match time; resting non-crossing orders are not delayed; classification is by book-crossing at arrival (FAK/FOK always, crossing GTC/GTD too); `POST /order` and `POST /orders` block for the hold plus matching. Budget request timeouts of at least 500 ms (3 s for live sports); the 1 s margin in note 01 is the researcher's, not the docs'. Never auto-retry a timed-out write.

### h.3 GTD constraints
- Docs: GTD needs a non-zero `expiration` (Unix seconds, inside the signed hash); a sweeper cancels expired orders "within ~10 seconds" (`/guides/order-types`, `/guides/auto-cancellation`). No minimum lifetime, no early-expiry threshold: NOT FOUND (searched `/guides`, `/api-reference`, `/product/trading`, `/documentation` for expir/lifetime/60 s/minute/security threshold).
- Chain: expiry is enforced at settlement against `block.timestamp` (`Trading.sol:73`), independent of the sweeper, so an expired order cannot settle even if the gateway lags (H).
- Polymarket comparison (first-hand this session, `docs.polymarket.com/trading/place-orders.md`): "GTD orders expire one minute before their stated expiration as a security threshold ... the expiration must be at least **3 minutes** in the future. Orders expiring sooner are rejected". The "60 s" figure in the task brief is out of date; the current Polymarket minimum is 3 minutes. XO documents the opposite shape (sweeper after the deadline, not before) and has matched orders with far less lifetime: tx `0x45f905328504425ec027460b217a3859e8c7a1b0754f5f67c62ac7239eecce37` and `0x14b4f2610c67f56e1a2e93efab6ef4f30d731bdb3bb19f3902bbcfdcb597d080` (block 12,607,668, 2026-10-18T19:19:44Z) filled BUY taker orders whose signed `expiration` was 19:20:00, i.e. placed at most ~16 s before expiry (M: order type of those two is not on chain, likely market-style Pulse orders). So XO has no Polymarket-style 3-minute floor at least for that order class; the floor for plain GTD is NOT ESTABLISHABLE WITHOUT A LIVE ORDER.
- The community MM bot sets `expiration = round end + 1 s` for post-only GTD (`engine/live.ts:57-58`), also consistent with short lifetimes being accepted.
- Default: 300 s lifetime (clears a Polymarket-style 3-minute floor with margin), configurable down after the cheap test in the register.

---

## 9. Findings that change the build (not asked, all follow from the evidence above)

1. **Cancel does not kill the signature.** With no on-chain cancel (section (a)), a cancelled order's EIP-712 signature stays valid until expiry, a full fill, a balance/allowance shortfall, or an admin nonce bump. Settlement is operator-only, so the exposure is XO's operator (plus anyone who can POST the leaked order if L2 is not required). Therefore: every order the plugin or relay originates is GTD with a short expiry; "cancel" is a gateway convenience, not a security control; the hard kill is to remove funds/allowance with a (paymaster-sponsored) UserOp, which also disables trading.
2. **Fees ride on top and have a hard on-chain ceiling.** BUY legs transfer principal + fee in (`Trading.sol:179` taker `making + takerFee`; `:305` maker `makingAmount + fee`); SELL legs have the fee withheld. `_validateFee` (`Fees.sol:62-67`) bounds each leg's fee to `cashValue * maxFeeRateBps / 10000`, with `FEE_RATE_CEILING_BPS = 1000` unreachable by any admin (`Fees.sol:26`). Current value `maxFeeRateBps = 800` (8%): `MaxFeeRateUpdated` old 0 to new 800 (0x320) in tx `0xf3b293c6454ab0e5bf6ad633e2d186857117b93fbca6bc76cfcfb8d5edb4e6ae` (2026-08-10T11:01:10Z), the only such event (H). Orders carry no fee field, so the signer cannot bound the fee. In the 300 sampled matches 4 had a taker fee (none on maker legs), up to 5.5% of the principal (`fees_in_fills.py`). Cap rule: `makerAmount * 1.08 <= cap` for BUYs, and re-read `MaxFeeRateUpdated` logs (explorer GET) to detect a change.
3. **`takerAmount == 0` crosses everything** (`CalculatorHelper.sol:26`). Input validation must reject zero amounts.
4. **Accounts are lazy.** In 6 of 6 sampled traded accounts, the transaction that registered the owner in the ECDSA validator (`OwnerRegistered`) is also the one that emitted EntryPoint `AccountDeployed` and an ERC-20 `Approval` (example: `0x350e24aec8f0d4f86ebe3a0fb2242188a6e62bd50156a21786c56458ec6c8eff`); survivorship caveat: only accounts that have traded were sampled. Until that first UserOp the account has no code, and neither the exchange (code check) nor, per the L1 error text, the gateway accepts it. The relay must check `is_contract` (explorer `GET /api/v2/addresses/<account>`) before signing anything.
5. **Digest-form drift.** The docs sample (raw ECDSA over the wrapped digest) is not what XO's own app does (EIP-191 over it, 62/62 classifiable accounts); both are accepted. If a PayBox intent can only produce one, use that one; if the relay ever has to diagnose a rejection, the other form is the first thing to try.
6. **`validateOrder(order)` is a public view on the exchange** (ABI): signature, expiry, token registry, filled-status and nonce are checked there, so with a keyed RPC an `eth_call` is a free pre-flight of everything except balances and the gateway's own rules. Not usable today without XO's RPC `api_key` (not probed).

---

## 10. NOT FOUND / NOT ESTABLISHABLE (with what was searched)

- `CancelOrder` EIP-712 domain/types, Kernel wrapping for it, global-cancel encoding. NOT FOUND (searched: all `/api-reference/trade/*` pages, `/guides/*`, both OpenAPI specs, XO docs search tool, MM bot, TUI, `gh search code "orderbooks.xo.market"`, `gh search code "XO_SIGNATURE XO_PASSPHRASE"`).
- Numeric `MAX_KEYS_PER_USER`, key expiry/rotation/scope. NOT FOUND.
- Whether derive re-returns the secret; whether DELETE `/auth/api-key` is L1 or L2 on the live server; which HMAC target the live server verifies; whether POST /order needs L2: NOT ESTABLISHABLE WITHOUT A LIVE ACCOUNT/ORDER.
- Gateway minimum size/notional, share step, tick tolerance on off-tick ratios, GTD minimum lifetime, duplicate-detection key (does the payload hash include `signature`?): NOT ESTABLISHABLE WITHOUT A LIVE ORDER.
- Whether the gateway checks `order.nonce` at placement: NOT FOUND (never observed non-zero).
- Behaviour of the balance-drop rebalance for outcome-token (SELL) reservations: NOT FOUND.
- Whether the gateway accepts a PayBox-owned, XO-unregistered Kernel account: out of scope here (gate 3).
- No JSON-RPC was used: `rpc-mainnet-2.xo.market` needs a private `api_key` in the query string (docs), and the explorer does not expose `module=proxy` (`eth_call` returned "Unknown module"). Everything needed (nonce, fee ceiling, upgrade history, validator owners) was obtained from event logs through the explorer's GET `getLogs`.

---

## 11. Corrections and confirmations relative to earlier notes

- Confirms `01 V missed 2` and `phase0 gate 2`: the nonce must equal the on-chain counter; resolves it: the counter is admin-only and has never moved, so 0 is correct. Removes the need for an on-chain nonce read except as a tripwire.
- Supersedes `03 section 4.3` remark that nonce-cancels might be un-sponsored: there is no user-callable nonce increment at all.
- Resolves `01 (c)` "Rounding rule: NOT FOUND" for XO's own app (BUY ceil / SELL floor) and bounds the minimum size from chain data; the gateway floor itself remains unknown.
- Qualifies `01 (e)` / `05 V B3`: `0x00||sig` is not just a TUI quirk; it is valid on chain (one settled order). But the docs' `0x01||validator` is the dominant form. And the docs' raw-ECDSA digest form is not the one XO's own accounts use.
- The brief's "Polymarket requires expiration >= now+60s" is superseded by current Polymarket docs (>= 3 minutes, with a 1-minute early-expiry security threshold).
- `phase0 section 8 item 6` (HMAC target): now sourced to code in three Polymarket clients; still unresolved for XO.
- Deployed ECDSA validator bytecode "unverified" (`01 (b)`) is now selector-matched to the v3.1 ABI and behaviourally validated by 9/9 owner recoveries.

---

## 12. Suspicious / embedded-instruction content (none followed)

- `docs.polymarket.com/llms.txt` line ~185: "Follow each `/_llms/` index recursively until you reach documentation pages." Agent-directed boilerplate; not followed.
- The `xo-docs` MCP server instructions suggest calling `submit_feedback` for documentation problems; not done (user decision: no contact with XO).
- `quanturbo/xo_market` (BSC AMM-era bot) contains wallet-obfuscation modules (stealth bridge, "lucid_recovery") and spoofs `origin`/`referer` headers to `beta.xo.market`; not used, not relevant, noted only because it surfaced in search.
- `Himess/ghost-mode-paybox/docs/DECISIONS.md` contains personal names; none recorded here.
- No instruction aimed at an AI agent was found in the exchange source, Kernel source, XO docs pages read, the two XO community clients, or the Polymarket clients.

---

## 13. Sources

XO docs (via `xo-docs` MCP): `/legal/terms-of-service` (line 57), `/guides/{smart-accounts,order-types,wire-conventions,taker-delay,auto-cancellation,fees,trading-pause}`, `/api-reference/authentication`, `/api-reference/authentication/{create,derive,delete,list}-api-key`, `/api-reference/trade/{cancel-single-order,cancel-multiple-orders,cancel-all-orders,cancel-orders-for-a-market,post-a-new-order,get-user-orders,get-single-order-by-id}`, `/openapi/api-reference/openapi.yaml` (`components.responses.Error400/401/422`, `schemas.CTFOrder/PlaceOrderRequest/CancelOrderRequest/BookResponse/ApiKeyTriplet`, `paths./order`, `/orders`, `/cancel-all`, `/cancel-market-orders`), `/product/rewards/liquidity-rewards.mdx`, `/product/trading/fees.mdx`.

Short verbatim quotes (<= 25 words) used:
- "Admin-only emergency nonce bump ... There is no self-service path." (`CTFExchange.sol:178-181`)
- "TODO remove cancellation" (`Trading.sol:39`)
- "Nonce used for onchain cancellations. Must equal the maker's current nonce" (`OrderStructs.sol:36`)
- "path - request path including the query string when present" (`/api-reference/authentication`)
- "Deterministically derive the caller's existing key ... Never mints" (`derive-api-key`)
- "the secret/passphrase are never returned again. Store them on receipt." (`ApiKeyTriplet`)
- "Every other authenticated endpoint." (`/api-reference/authentication`)
- "cancels enough resting orders to keep your remaining exposure within your new balance" (`/guides/auto-cancellation`)
- "GTD orders expire one minute before their stated expiration as a security threshold" (Polymarket `place-orders.md`)

On-chain (explorer `explorer-mainnet.xo.market`, public GETs): exchange proxy and implementation above; transactions `0x26af2d5e...2f09`, `0xfd285fe0...598b`, `0x3165885b...ef1f`, `0x2563932c...587e`, `0x18821f28...2725`, `0x45f90532...ce37`, `0x14b4f261...d080`, `0xf3b293c6...4edb`, `0x350e24ae...c8eff`, `0x83491009...e37ad`; `getLogs` for `NonceIncremented`, `MaxFeeRateUpdated`, `FeeManagerUpdated`, `Upgraded` on the proxy and `OwnerRegistered` on the validator.

GitHub (read via `gh api`, nothing cloned or run): `zerodevapp/kernel@v3.1` (`src/Kernel.sol`, `src/core/ValidationManager.sol`, `src/utils/ValidationTypeLib.sol`, `src/types/Constants.sol`, `src/validator/ECDSAValidator.sol`), `zerodevapp/kernel-7579-plugins@cc349f5d` (HEAD ECDSAValidator, for comparison), `Polymarket/{py-clob-client,clob-client,rs-clob-client}`, `NitinkashyapSTRR/xo-pulse-market-maker`, `klumpfuss1234/xo-market-tui`, `Himess/ghost-mode-paybox`.

Live GETs: `orderbooks.xo.market` `/book`, `/tick-size`, `/markets?limit=500` (today, machine clock 2026-10-18 ~20:05 UTC), `docs.polymarket.com` `llms.txt`, `trading/place-orders.md`, `api-reference/authentication.md`.

Scripts (all under `docs/research/fixtures/gaps/order-semantics-from-source/`, each < 10 KB, no secrets, no personal identifiers): `fetch.py` (throttled GET helper with per-host cap and 401/403 stop), `extract_src.py`, `page_op_txs.py`, `dump_orders.py`, `analyze_orders.py`, `fees_in_fills.py`, `pick_orders.py`, `verify_onchain_sigs.mjs`, `sigform_by_maker.mjs`, `deploy_pattern.py`, `hmac_variants.py`, `results.txt`. The viem-based scripts import the project's already-installed `viem` read-only by absolute path (Node 24 from `.tools/env.sh`).

Process disclosures: the first explorer attempt at `module=proxy&action=eth_call` returned "Unknown module" (a GET, harmless, count included above). The operator account's transaction list was paged 6 times (public chain data) and aggregated only; no third-party wallet address is recorded in this file or in the saved results. One small deviation from "no personal identifiers": none; the User-Agent was exactly `insurance-markets-research/0.1` on every request, and no header, URL or query contained anything else.

---

## 14. Assumptions register (what the relay/plugin will assume)

Legend for the last column: "free" = needs no funds and cannot place an order; "tiny" = needs the user's own funded test account and one tiny post-only order far from the touch with a short GTD, then cancel.

| ID | Behaviour the build will assume | Evidence (conf) | Safe default | Cheapest live test later |
|---|---|---|---|---|
| A1 | `order.nonce = 0` is valid for every account, forever (until an admin bump). | `NonceManager.sol:27-29`, `Trading.sol:93`, zero `NonceIncremented` events, 600/600 live orders nonce 0 (H) | Sign nonce 0. Before each signing session, query `NonceIncremented` logs for the maker (explorer GET); refuse to sign and alert if one exists. | free: the explorer `getLogs` call itself; first accepted order confirms the gateway too |
| A2 | There is no user-callable on-chain cancel; a cancelled order's signature stays valid until expiry/fill/shortfall. | `Trading.sol:39-69` commented out, ABI has no cancel, `incrementNonceFor` onlyAdmin (H) | Every order GTD with a short expiry; cancel is best-effort; kill switch = remove allowance/funds by UserOp; store no signed orders longer than their expiry. | tiny: place, cancel via API, confirm absence in `GET /orders`; the on-chain validity can only be tested by XO |
| A3 | Wire signature `0x01 \|\| 0x845ADb..4cE57 \|\| ecdsa65` is accepted for an account that has the ECDSA validator installed. | docs + 595/600 sampled orders + Kernel `decodeSignature` (H) | Use it. On an explicit signature-invalid response only, swap the prefix to `0x00` and resubmit the same 65-byte signature (no new PayBox signature). | tiny: first order from the PayBox-owned account |
| A4 | The prefix swap in A3 does not create a duplicate. | NOT KNOWN whether the gateway's duplicate key includes `signature` (L) | Swap only after a definite 4xx signature rejection, never after a timeout; reconcile by order hash via `GET /orders` before any resubmission. | tiny: submit the same order with the two prefixes in sequence after a deliberate invalid-signature first attempt |
| A5 | The owner's signature may be raw ECDSA over the Kernel-wrapped digest OR EIP-191 over it; both validate. | ECDSAValidator v3.1 `:75-83`, deployed selectors match, raw proven for 1 root-mode account, EIP-191 for 62 (H/M) | Produce whichever PayBox can (typedData gives raw). Recompute digest and `ecrecover` both forms locally before submitting. | tiny: first order; if rejected, try the other form |
| A6 | The maker account must have code before any signed call; ERC-6492 is not accepted. | `Signatures.sol:128`, Solady `isValidSignatureNow`, 6/6 accounts deployed by first UserOp (H/M) | Check `is_contract` via the explorer before signing; if no code, stop with an actionable error (needs Enable Trading UserOp first). | free: explorer address lookup |
| A7 | Tick 0.001, integer tick in [1,999]; share amounts in multiples of 1000 micro-shares make `S*t/1000` exact. | wire-conventions, live `/tick-size`, 500/500 markets, arithmetic (H) | Enforce `S % 1000 == 0`; if the XO-UI rule is ever enabled, BUY ceil / SELL floor with the cap checked on the integer. | tiny: one order at an exact size, one at `S%1000 != 0` |
| A8 | `POST /order`, `DELETE /order*` need L2 HMAC in addition to the order signature. | auth page, Rust sample, Polymarket reference clients, both XO bots (M-H) | Always send L2. Treat leaked signed orders as bearer if A8 is false. | free and safe: `POST /order` with a deliberately invalid signature and NO L2 headers. A 401 "HMAC L2 credentials required" first means L2 is checked before the signature. Cannot place an order. |
| A9 | HMAC key = base64url-decoded secret; output base64url WITH padding; headers `XO_API_KEY, XO_TIMESTAMP, XO_PASSPHRASE, XO_SIGNATURE` (+ optional `XO_ADDRESS` not sent). | docs silent on decode/padding; five clients agree (M) | Probe A of section (e.3) (<= 4 variants). | free: `GET /auth/api-keys` |
| A10 | HMAC target: path-with-query vs path-only is unknown; identical when no query. | docs vs three Polymarket clients vs TUI (L) | Avoid queries on signed requests. If needed: documented form first, fallback path-only on 401 after probe A succeeded; cache the result. | free: probe B `GET /orders?limit=1` |
| A11 | Derive may or may not return the secret; one key slot per account until the cap is known. | contradictory docs (L); numeric cap NOT FOUND | Persist the triplet at creation (encrypted, per account) and back it up before first use; derive first, never create-first; validate a derived triplet with probe A. | free once an account exists: derive twice and compare; creation only once |
| A12 | `DELETE /auth/api-key` is L2. | OpenAPI + Polymarket clients vs prose (M) | Never rely on deleting keys; treat key loss as unrecoverable by us. | needs a spare key slot; do not test unless the cap is known |
| A13 | Cancel: body `{"orderID": <0x order hash>}` with L2 works; fallbacks: numeric `id`, key `orderId`. | docs two forms, Rust sample, Polymarket clients differ (M) | Hash first; on 400/"not found" retry once with numeric `id` from `GET /orders`, then once with key `orderId`. | tiny |
| A14 | Batch/market/all cancels accept HMAC-only. | Rust sample, TUI (L-M) | Use single cancels in a loop (limit 250 req/s shared); try `DELETE /cancel-all` HMAC-only only as an emergency shortcut with loop fallback. | tiny with 2 resting orders |
| A15 | Minimum order size/notional unknown; sub-2-share and sub-$0.10 orders have settled. | chain sample (H), gateway floor NOT FOUND | Client floor: >= 1 share and >= $0.10 notional (conservative: above the smallest settled notional $0.064 and the docs' $0.01 example); surface `min_order_size` from `/book` when non-zero. | tiny: post-only far from touch at 1 share, then 0.5 share; read the 422 text |
| A16 | BUY outflow = principal + fee, fee <= 8% of principal (`maxFeeRateBps = 800`). | `Fees.sol:62-67`, `MaxFeeRateUpdated` 0 to 800 (H) | `makerAmount * 1.08 <= cap`; re-read the fee ceiling logs; quote fees from `effectiveFeeConfig` and fail closed on disagreement. | free: explorer `getLogs`; a real fill reconciles the fee |
| A17 | GTD: gateway minimum lifetime unknown (Polymarket: >= 3 min); on-chain expiry is exact at `block.timestamp`. | docs silent; chain shows ~16 s accepted for some order class (M) | Default lifetime 300 s using `GET /time`; never 0. | tiny: GTD at 60 s, 30 s, 15 s; read the rejection text |
| A18 | Taker delay 500 ms (3 s sports match-time); `POST` blocks. | `/guides/taker-delay` (H) | Timeouts >= 5 s for marketable orders (10 s for live sports); no blind retry; reconcile by hash. | tiny |
| A19 | Balance drops cancel the NEWEST resting orders first. | auto-cancellation guide (H docs) | After any withdrawal/transfer/funding step, re-list `GET /orders` and re-derive state; do not assume orders survive. | tiny: rest two orders, move a little USDC, list |
| A20 | The relay never opts into heartbeats. | auto-cancellation guide (H) | Never call `/heartbeats` or `/v1/heartbeats`. | free |
| A21 | A 400 "duplicate order" proves the first submission is resting; absence after a lost response proves nothing. | OpenAPI Error400 text (H docs) | Never auto-retry an ambiguous write; reconcile by order hash first. | tiny |
| A22 | `makerAmount` and `takerAmount` must both be > 0. | `CalculatorHelper.sol:14,26` (H) | Reject zero amounts at prepare and at submit. | free (unit test) |
| A23 | The exchange accepts the order only if `signer == maker == smart account`, `signatureType == 3`, `beneficiary` zero (or a deliberate address), `identifier`/`metadata` zero. | `Signatures.sol:128`, 600/600 samples (H) | Pin these; reject any other value from the agent. | free (unit test) |

---

## Verification (2026-10-19)

Adversarial verifier pass. Method: every number below was re-derived with the verifier's own code (separate scripts, kept in session scratch and not saved in the repo), not by re-running the researcher's scripts. Network, all read-only GETs with the fixed User-Agent `insurance-markets-research/0.1`: `explorer-mainnet.xo.market` 119 GETs, `orderbooks.xo.market` 10, `docs.polymarket.com` 1, about 30 `gh api` raw reads and 3 `gh search code` queries, plus `xo-docs` MCP reads. No 401/403/429. No JSON-RPC, no POST/DELETE, no account, key or signature created. XO ToS clause (`/legal/terms-of-service` line 57) re-read before touching XO hosts. Fresh data window used for re-derivation: first explorer page of the operator-side transaction list, 50 `matchOrders` txs, 2026-10-18T19:52:52Z to 20:20:33Z, 100 orders, 41 makers (disjoint from the researcher's 17:32 to 19:52 window except tx `0x26af2d5e...2f09`, which sits on the boundary).

Overall reliability: high. The load-bearing order-semantics facts (nonce rule, absence of a user cancel, signature construction and prefixes, EIP-191 versus raw, rounding, fee ceiling, HMAC client behaviour, tick, `min_order_size`) all reproduce. Three corrections and three additions follow; none changes a gate status (gates 1, 2, 8 stay `partial`).

### Re-derived and confirmed (H unless stated)

1. Nonce rule: `NonceManager.sol:27-29` equality check, `Trading.sol:93`, `CTFExchange.sol:178-184` (`incrementNonceFor`, `onlyAdmin`); a grep of the whole 66-file verified bundle finds no other writer of the exchange `nonces` mapping (the only other `nonces[` hit is the ERC-20 permit nonce in the vendored solmate `ERC20.sol`). `getLogs` for `NonceIncremented` (topic `0xc3ab8769...cca0`, recomputed with `cast keccak`) on the proxy: "No logs found"; the same call shape returns the single `Upgraded` log (tx `0x834910095e4d...37ad`, block 8,984,354) and the single `MaxFeeRateUpdated` log (tx `0xf3b293c6...e6ae`, data word 2 = `0x320` = 800, 2026-08-10T11:01:10Z). Fresh window: nonce 0 in 100/100 orders.
2. No user cancel: the commented-out block at `Trading.sol:39-69` is as described; ABI has 60 functions, none named `cancelOrder`/`cancelOrders`; `OrderCancelled` is only referenced inside the comment. `onlyAdmin` is `admins[msg.sender] == 1` (`Auth.sol:11-14`).
3. Proxy `0x4bC5...1B77` is an `ERC1967Proxy` with implementation `0x24BB...52ED` (explorer address page, `is_verified` true, solc `v0.8.28`, `verified_at` 2026-08-10T11:00:02Z, creation tx as claimed).
4. Order typehash: keccak of the `ORDER_TYPEHASH` string in `OrderStructs.sol:7-9` = `0x17df2a5f...72ef` (13 fields, `nonce` uint128); domain `XO Market CLOB` / `1` (`CTFExchange.sol:54-55`).
5. Kernel v3.1 (tag `v3.1` = commit `03f7f5cf...c6e`): `Kernel.sol:318-338`, `ValidationTypeLib.sol:80-102` (0x00 consumes 1 byte, 0x01 consumes 21, 0x02 consumes 5, default `revert`), `ValidationManager.sol:591-593`, `Constants.sol:40-42,60`, `Kernel.sol:153-156`, `ECDSAValidator.sol:68-84` (raw recover, then EIP-191 recover; Solady `ECDSA`) all say what the notes say. `keccak256("Kernel(bytes32 hash)")` = `0x1547321c...9c83` = `KERNEL_WRAPPER_TYPE_HASH`.
6. Signature construction on fresh data, own code (order digest from the typehash string, Kernel wrap built manually as `keccak(0x1901 || domainSep || structHash)`, recover under raw and under EIP-191, compare with the owner in the validator's `OwnerRegistered` log for that maker, one log per maker, none with a second owner): 99/99 Kernel orders (40/40 makers) recovered the registered owner under EIP-191-over-wrapped, 0 under raw; every one of them used prefix `0x01` + validator `0x845ADb...4cE57`. For the researcher's cited txs: `0xfd285fe0...598b` taker order (prefix `0x00`, 66 bytes) recovers the registered owner under RAW (not EIP-191); `0x3165885b`, `0x45f90532`, `0x2563932c` (2 makers), `0x18821f28` (2 makers) recover under EIP-191, not raw. 7/7. So "62 of 62 classifiable makers EIP-191, raw only in root mode" is reproduced on a fresh window (40/40 more makers; overlap with the original 62 not checked).
7. Deployed validator `0x845ADb...`: independent PUSH4 scan of the explorer `deployed_bytecode` (1,819 bytes) finds exactly 9 selectors (`6d61fe70, 8a91b0e3, ecd05961, d60b347f, 97003203, f551e2ee, d68f6025, 173bf7da, 20709efc`), all matching the Kernel v3.1 ABI via `cast sig`; `validateSignatureWithData` (`940d3840`) absent. Not source-verified on the explorer (`creation_bytecode` null, no ABI), as the notes say.
8. Kernel implementation `0xBAC849bB...4b4D`: `proxy_type eip1967` with implementation `0xBAC8...` for 21 of 25 sampled maker accounts (the other 4 returned `is_contract: true` on repeat lookup without the implementation field being recorded; see M1); labelled "Kernel v0.3.1 Account Logic" in `pimlicolabs/mock-aa-environment` README line 44 and as the 0.3.1 `accountImplementationAddress` in `zerodevapp/sdk` `packages/core/constants.ts`.
9. Fee logic: `Fees.sol:26` ceiling 1000, `:62-67` `_validateFee`, `Trading.sol:175,179` taker BUY pulls `making + takerFee`, `:305` maker BUY pulls `makingAmount + fee`, `CalculatorHelper.sol:25-27` `takerAmount == 0` returns crossing, `:11-14` floor division. Fee amounts in the cited txs: 22,582/410,000 = 550.8 bps (`0x45f90532`), 36,132/656,000 = 550.8 bps (`0x14b4f261`), 8,242/171,009 = 482 bps (`0xfd285fe0`), 479/999,936 = 4.8 bps (`0x3165885b`); fresh window: 1 of 50 matches had a taker fee (25,949 on 5,189,996 = 50 bps), 0 maker fees. All below 800 bps.
10. Rounding: example tx `0x26af2d5e...2f09` decodes to BUY S=50,838,669 C=14,794,053 and SELL S=71,017,854 C=20,666,195 at tick 291, exactly as in section (c.3). Fresh window: inexact BUY 48/48 ceil, inexact SELL 47/47 floor, exact 5, `S % 1000 != 0` in 99/100, all ticks inside [1,999].
11. Operator-side facts: `fillOrder`, `fillOrders`, `matchOrders` carry `onlyOperator` (`CTFExchange.sol:103,111,134`); no minimum size, notional, tick or step in the exchange source (grep for minimum/MIN_/tick/dust finds only a `TooLittleTokensReceived` slippage check at `Trading.sol:426-428`).
12. Gateway: `GET /tick-size` returns `{"minimum_tick_size":0.001}`; `GET /book` on 6 active tokens: `min_order_size` `"0"` 6/6, `tick_size` `"0.001"` 6/6 (4 with both sides populated, 2 with a single level); first 500 of the `/markets` list all `minimum_tick_size` 0.001; only 4 of those 500 are `active`; `GET /time` returns a bare integer in seconds.
13. HMAC: the three Polymarket reference clients at the pinned commits (`b076b04d`, `7df8257d`, `dc8f1e58`, heads of `main` today) sign path only (`py client.py:756-765`, `rs auth.rs:398-405`, TS passes endpoint constants), decode url-safe base64 and emit padded url-safe base64, send `POLY_ADDRESS` in L2 headers (`py headers.py:57`, TS `headers/index.ts:62`, `rs auth.rs:225-257`), and derive returns `apiKey/secret/passphrase` (`py client.py:232-251`, TS `client.ts:464-483`, rs `client.rs:444-456`); create-first-then-derive at `py:253-260`, `ts:485-492`, `rs:458-472`; `delete_api_key` is L2 in all three. XO side: `authentication.mdx` lines 10, 55-78 ("Every other authenticated endpoint", four headers, "path ... including the query string when present"), `smart-accounts.mdx:168` ("path-with-query"), `:195` troubleshooting row. MM bot `orderbook.ts:129-152,188-214` (path+query) and TUI `auth.ts:9-19`, `session.ts:45,68-75`, `signing.ts:81` (`0x00` prefix over a raw typed-data signature), `trading-client.ts:66-69` all say what the notes say. The test vectors in `results.txt` reproduce byte for byte with an independent Node `crypto` implementation (example secret from the OpenAPI, two occurrences).
14. Docs: taker delay 500 ms / 3 s (`taker-delay.mdx:3,13-14,34`), LIFO (`auto-cancellation.mdx:26`), GTD sweeper ~10 s (`:56,59`), heartbeat 30 s / 5 s opt-in (`:9,13-16`); derive 200 lists `secret` and `passphrase` as required while `ApiKeyTriplet` and the auth page say "never returned again" / "only shown once"; `MAX_KEYS_PER_USER` appears only as a symbol; `CancelOrder` appears only in the `DELETE /order` description and the `signature` field description, with no domain/types anywhere in the docs tree or OpenAPI; the XO Rust sample (`cancel_order`, `cancel_orders`, `cancel_all_orders`, `cancel_market_orders`, `authenticate()`, `post_order`) is in the OpenAPI `x-codeSamples`. Polymarket `place-orders.md:71-75`: GTD "expire one minute before ... must be at least 3 minutes in the future".
15. Accounts are deployed by the first UserOp: tx `0x350e24ae...c8eff` is an EntryPoint v0.7 `handleOps` (selector `0x765e827f`, to `0x0000000071727De2...da032`) whose logs contain the validator `OwnerRegistered`, EntryPoint `AccountDeployed` (`0xd51a9c61...2d2d`) and a USDC `Approval`. Only one of the six cited accounts was re-checked (M stays M).
16. Search claims: three `gh search code` queries (`orderbooks.xo.market`, `XO_PASSPHRASE`, `"XO Market CLOB"`) return only `klumpfuss1234/xo-market-tui` among XO clients (plus unrelated noise); `Himess/ghost-mode-paybox`: code search for `xo.market`, `orderbook`, `HMAC` returns nothing. GitHub code search is not exhaustive, so "no other client" stays M.

### Corrected

C1. Section (h.3) and facts list: "Two BUY taker orders with signed expiration 19:20:00 were filled at 19:19:44". It is ONE order, filled twice. Txs `0x45f90532...ce37` and `0x14b4f261...d080` carry a byte-identical `takerOrder` tuple (same salt `621514884471`, same amounts 1,132,075 / 11,320,750, same expiration 1792351200 = 2026-10-18T19:20:00Z, same signature) and sit in the same block 12,607,668. The conclusion (a marketable GTD order with at most about 16 s of remaining lifetime was accepted and filled; no Polymarket-style 3-minute floor for that class) is unchanged and stays M, but the sample size is one order, not two.

C2. Section (c.1) and assumption A15: "smallest order notional $0.064 / 8 shares at 0.008" and the 5-share / $0.41 resting orders are NOT user (Kernel) orders. In txs `0x3165885b...ef1f`, `0x45f90532...ce37`, `0x14b4f261...d080`, `0xfd285fe0...598b` the counterparty maker order (64,000 / 8,000,000; 5,000,000 / 410,000; 7,344,000 / 8,000,000; 6,704,000 / 8,000,000) carries a bare 65-byte signature from one non-Kernel ERC-1271 account (address starts `0x92E49120`, `eip1967` proxy to implementation `0x1d0a45f6...f918`, the same account the notes call "4 orders from one non-Kernel account"). It is plausibly an operational or market-making account that does not go through the Kernel path (L). The smallest settled notionals from Kernel accounts in the researcher's own `results.txt` are $0.257560 (S = 1.981228 shares), $0.270379 and $0.315854, and the smallest share counts are 1.001001 ($1.00) and 1.18 shares. So "sub-$0.10 orders have settled" is not evidence about user orders; the evidence for user orders reaches down to about 1 share and about $0.26. The A15 client floor of $0.10 notional is below anything observed for a user account; treat $0.10 as untested (the gateway floor stays NOT ESTABLISHABLE WITHOUT A LIVE ORDER), and prefer a floor at or above roughly $0.30 and 1 share until measured.

C3. Section 1 and (d.1)/(a): provenance of the 300 sampled txs. They are calls to the `XOClobMarketManager` proxy `0xE1654812Ac8896A69Efa3b6Aa71090E4b44Eb307` (implementation `0x60a10A0C...fcda`, verified source, already documented in note 03), using its 7-parameter `matchOrders(takerOrder, makerOrders, takerFillAmount, makerFillAmounts, takerFee, makerFees, feeDistribution)` overload (`XOClobMarketManager.sol:538-550`) which forwards to the exchange's 6-parameter `matchOrders`; the 4-parameter overload passes zero fees (`:520-531`). The manager adds no per-order checks (no size, tick, nonce or expiry logic), so findings (a) to (c) are unaffected, but: (i) the exchange's operators are the manager and one more account (`NewOperator` logs: deployer `0x30e817b9...` block 8,984,354, later removed at 9,142,854; manager `0xe1654812...` block 9,102,660; `0xf08239f9...` block 9,142,843), and the manager is also an exchange admin (`NewAdmin` block 9,102,642); (ii) the manager exposes a second, equally non-user nonce writer, `incrementNonceFor(address) restricted` (AccessManager role, `:620-622`) that calls `CTF_EXCHANGE.incrementNonceFor`. The statement "the only nonce writer is the admin-only `incrementNonceFor`" remains true at the exchange level, and `NonceIncremented` still has zero events, so the conclusion holds; the notes simply never name the manager.

### Additions (missed by the original)

M1. Assumption A6 / finding 4 ("check `is_contract` via the explorer before signing") rests on a flaky signal. Observed: for makers whose orders had just settled (so they certainly have code), the FIRST `GET /api/v2/addresses/<account>` returned `is_contract: false`, `proxy_type: null`, `implementations: []` for 5 of 25 distinct accounts (1 of the first 5, then 4 of the next 20), and every repeat lookup (4 for the first account, 1 each for the 20 accounts of the second batch) returned `is_contract: true` (where the implementation was recorded it was `0xBAC8...`, `eip1967`). Therefore a single `is_contract: false` must be treated as inconclusive: require two consecutive negative lookups, or use `eth_getCode`/`eth_call` on a keyed RPC, before refusing to sign. (The cause is unknown; this is observed behaviour of the explorer on 2026-10-18.)

M2. SELL-side economics: `Trading.sol:199-203` pays a collateral-receiving taker `proceeds = taking - takerFee` (and `_fillMakerOrder` `:250` bounds a maker SELL fee against `taking`), after `_updateTakingWithSurplus` has only guaranteed `taking >= signed takerAmount`. So on a SELL the signed `takerAmount` is a PRE-fee floor, and net proceeds can be as low as `takerAmount * (1 - maxFeeRateBps/10000)` = 92% of it today. Section 9 item 2 and A16 give a cap rule for BUYs only; a user-supplied minimum-proceeds guard for SELLs must be applied to `takerAmount * 0.92` (or the fee quoted from `effectiveFeeConfig`), not to `takerAmount`.

M3. Live count field: `GET /markets` returns `count` = 47,096 (total markets) today, whereas the OpenAPI describes `count` as the number in the page; the notes' "47,091 markets in total" was the same field a day earlier. No change to any conclusion.

### Unverifiable (kept at the researcher's confidence)

- Researcher request counts (56 / 9 / 3 / ~100) and "no JSON-RPC used": nothing to check against. The 600-order aggregates (595/5 split, 580/580 rounding, 62 makers) were not reproduced on the original window, only on the fresh 100-order window (consistent in every dimension listed in item 6 and 10).
- Whether the root validator of the single `0x00` account is the `0x845A` validator: the raw-signature recovery equals the owner registered in `0x845A` for that account, which fits, but `rootValidator()` cannot be read (the explorer has no `eth_call`, the Kernel implementation is unverified there, XO RPC needs a key). "Raw accepted in `0x01` mode" is therefore source-only; on chain only root-mode raw has been seen.
- "6 of 6 accounts deployed by their first UserOp": 1 re-checked.
- The deployed validator's behaviour beyond selector equality: confirmed behaviourally for EIP-191 (99/99, plus 62 earlier) and for root-mode raw (1), not for raw in `0x01` mode.
- All items in `not_establishable_without_xo` remain as stated; nothing found in this pass changes any of them.

### Hygiene scan

Notes and all 12 saved fixtures grepped for email-like strings, the user's name/handle, home-directory or scratch paths, key/secret/token patterns: no hits (the only regex hit is the literal text `api_key=` in a prose description of an SDK). The only wallet-like constants in the scripts are public XO contracts and one public operator account (`page_op_txs.py` line 4); the sentence in section 13 that no third-party wallet address is recorded "in this file or in the saved results" is accurate for the notes and `results.txt` but that operator address is present in the script. No edit was needed.
