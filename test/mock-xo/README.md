# Local mock XO (read and write surfaces)

A local stand-in for XO's off-chain services, for tests that must not touch the network. Spec:
`docs/phase1-gap-closing.md` section 5.5 (categories A, B and C) and amendment A9. It serves the orderbook's and Data
API's reads, the block explorer, JSON-RPC for chain 3223 and Base, the bundler, and, since the write stream, orders and
cancels, L1 and L2 credentials, UserOp landing, a Hyperlane route and market creation, on top of the anvil chain in
`test/anvil` that runs the real account stack.

Nothing here reaches the network. Every listener binds `127.0.0.1` on a port the OS picks (never a fixed port).
`mock.fetch` maps the real hostnames to the listeners and refuses every other host.

## Use

```ts
import { startMockXo } from "./server.js";

const started = await startMockXo();               // pessimistic profile (decision D9), both chains
if (!started.ok) return skip(started.reason);       // only "anvil is not available" lands here
const { mock } = started;
try {
  const client = new XoClient({ fetchImpl: mock.fetch });        // real https hostnames, served locally
  const rpc = new RpcReader({ transport: mock.rpcTransport, url: mock.urls.xoRpc });
  const upstream = createUpstream({ hosts: XO_UPSTREAM_HOSTS, fetch: mock.asFetch });   // the relay's client
  mock.setProfile("optimistic");                    // or: mock.setSwitch("rpc.access", "open")
  await mock.advance(300);                          // clock +300 s; everything due inside it runs, in time order
} finally {
  await mock.stop();                                // closes every listener and every anvil it started
}
```

Inside a `describe`, `test/mock-xo/testing.ts` gives you `useMock(options)`: one mock per suite, and between tests the
state, switches, faults, limiter, scheduled tasks, held requests and the chain (snapshot and revert) put back, and a
test fails if a handler threw. `deployOwner(mock, index)` deploys a test owner's Kernel account with a sponsored UserOp
(it first makes the paymaster sponsor, whatever `paymaster.state` says). `test/mock-xo/traders.ts` is the matching set
of helpers for the write side: `setupTrader` (deployed, registered, funded), `createCredentials`, `l1Headers`,
`l2Call`, `buildOrder` / `placeOrder`, `signWrapped`, `wrapErc6492`. They sign with viem and the public Anvil test keys.

As a program: `pnpm exec tsx test/mock-xo/main.ts [--profile=optimistic] [--no-chains] [--set name=value]` prints one
JSON line with the listener URLs and stops every process on SIGINT or SIGTERM. There is no test code beside it, so the
control listener has the set-up routes (below).

Options: `startMockXo({ profile, clock, chains, seedMarkets })`. `chains: false` starts no anvil (the explorer serves
only synthetic rows, the RPC doors answer "not part of this mock", the registry sees no chain, and nothing that needs a
chain works: L1 for a smart account, orders, UserOps). An `XoChain` from `startXoChain` can be passed instead of
`true` to share one chain; the mock does not stop it.

## Tests

`pnpm exec tsx --test "test/mock-xo/*.test.ts"` (about 10 s, no network). Read side: `drift`, `profile`,
`switch-effects`, `orderbook-reads`, `data-api-reads`, `explorer`, `rpc-bundler`, `client-conformance`,
`relay-upstream`, `server`, `errors`, `state`. Write side:

| File | Proves |
|---|---|
| `auth.test.ts` | L1 (ClobAuth, every digest form and prefix, the 120 s window, wrong signer, undeployed account, malformed headers), L2 (HMAC, 30 s window, tampered body), the key cap, derive, delete |
| `orders.test.ts` | every intake guardrail has a failing case: L2, envelope, signatureType, signer, amounts, grid, size, nonce, expiry, token, market state, floors, funds with the fee bound, duplicates, post-only, signature (wrong key, wrong order, another account's wrap, every pinned domain, bad prefix and length), registry |
| `orders-engine.test.ts` | the taker hold on the mock clock, fills, FOK and FAK, resting orders of two accounts, self-trade, the GTD sweeper, the balance-drop rule, the cancel forms, the order reads |
| `bundler-write.test.ts` | UserOps land for real (deploy, Enable Trading, nonce), AA codes, inclusion delay, paymaster states, estimate |
| `hyperlane.test.ts` | the route is readable as the preflight reads it, a deposit end to end through the production `checkDelivery`, bad recipients, the credit rules, the withdrawal sketch |
| `creation.test.ts` | the manager stub (fee, layouts, owner and status checks), the oracle's timeline, owner cancel, metadata updates, the sampled distributions |
| `switch-effects-write.test.ts` | one probe per write switch, every value, written-out expectations |
| `profiles-write.test.ts` | the optimistic profile flips every write switch and one journey works; the pessimistic profile is a wall |
| `faults-write.test.ts` | faults before the write (nothing happened) and after it (the response is lost, the write is not) |
| `write-crosscheck.test.ts` | the mock's digests equal `src/xo/signing`; what the production signer builds is accepted through the real Kernel |
| `clock-scheduler.test.ts`, `control-write.test.ts` | the clock's waiters, the scheduler's ordering, the control routes |

## What each listener serves

Basis: **recorded** = a live GET saved in `test/fixtures/xo`; **docs** = XO docs or the research notes (the exact live
text is M); **synthetic** = invented because the live body was never seen (M). **M** marks every write-surface shape and
error text: no order, key or UserOp was ever sent to the live service, so each comes from docs and OpenAPI examples.

| Listener | Stands in for | Serves | Basis |
|---|---|---|---|
| `orderbook` reads | `orderbooks.xo.market` | `/time`, `/health`, `/version`, `/trading-state`, `/tick-size`, `/neg-risk`, `/book` (decimal sizes, `min_order_size`; resting orders of the write mock are levels), `/price`, `/last-trade-price`, `/fee-rate` (0), `/markets/{cid}`, `/balance-allowance` (`allowance` is what is left after resting BUYs' reservations), `/positions` (`reserved` includes resting SELLs), `/claimable` | recorded; the reservations are docs (guides/auto-cancellation) |
| `orderbook` writes | the same | `POST /order`, `GET /orders`, `GET /orders/{id}`, `DELETE /order`, `/orders`, `/cancel-all`, `/cancel-market-orders`, `GET /auth/derive-api-key`, `POST /auth/api-key`, `GET /auth/api-keys`, `DELETE /auth/api-key` | **M** (docs and OpenAPI); the 401 texts `HMAC L2 credentials required` and `L2 auth required` and the L1 text `L1 timestamp too old or too far in future` are recorded live |
| `dataApi` | `api-mainnet.xo.market/api` | `/markets` (type, status, search, sort, paging), `/markets/contract/{cid}`, `/markets/slug/{slug}`, `/markets/{id}`, `/users/portfolio`; markets created through the manager appear as PENDING | recorded; portfolio rows synthetic |
| `explorer` | `explorer-mainnet.xo.market` | `getLogs` (topic filters, 1,000-row cap, pending rows, blank address), lazy `is_contract` and smart-contracts, mempool; the manager's events and the mock Hyperlane `ProcessId` are in it | cap, `page`, lazy fill: research (H); Blockscout v2 fields M |
| `xoRpc` | `rpc-mainnet-2.xo.market` | read methods from anvil chain 3223, plus the virtual contracts below | methods and limit: research (H); error codes M |
| `baseRpc` | a Base public node | the same reads from the Base variant chain, the virtual Circle USDC, router and Mailbox, and the emulated Base transactions | M (the Base chain is derived, not captured) |
| `bundler` | `mainnet-bundler.xo.market` | `eth_chainId`, `eth_supportedEntryPoints`, `eth_estimateUserOperationGas`, `eth_sendUserOperation` (v0.7 unpacked), `eth_getUserOperationReceipt`; batch arrays refused | chain id and entry points: research (H); the rest M (ERC-4337 error codes, XO's refusal texts never seen) |
| `control` | the mock itself | `GET /state`, `POST /profile`, `/switch`, `/advance`, `/fault`, and `/provision`, `/register`, `/fund`, `/creation`, `/inclusion-delay` | n/a |

### Write surface: what is checked

- **L1** (`auth.ts`): the `XO_*` headers (`Xo-*` too, `POLY_*` never), the timestamp within 120 s of the mock clock, the
  ClobAuth digest recomputed, plain ECDSA for a 65-byte signature, else ERC-1271 on the account, which is the real
  deployed Kernel (raw or EIP-191 over the wrapped digest, prefix `0x01` or `0x00`). An undeployed account fails with
  `...EIP-1271: no contract code`, unless `l1.undeployed = erc6492` and the signature is an ERC-6492 wrapper by the owner
  of that counterfactual account.
- **L2** (`auth.ts`): `XO_API_KEY`, `XO_TIMESTAMP`, `XO_PASSPHRASE`, `XO_SIGNATURE` within 30 s, `XO_ADDRESS` when
  `l2.xo_address = required`, HMAC over `timestamp + METHOD + target + body` with the target and key decoding picked by
  `hmac.target` and `hmac.decode`.
- **Order intake** (`orders.ts`, `engine.ts`): see the table in `orders.test.ts`; order of checks is in the header of
  `orders.ts`. The signature is checked by recovering the owner from the Kernel-wrapped digest in a form
  `order.sig_forms` accepts and then by calling `isValidSignature` on the deployed Kernel with the exact bytes. The
  pinned order domain, the Kernel wrapper domain and the nonce (read from the exchange stub) are all enforced.
- **Engine** (category C, not a matching engine): resting orders, a hold of `engine.taker_delay` on the MOCK clock for
  FOK, FAK and crossing orders (the request stays open until a test moves the clock), fills against the displayed book
  and other accounts' resting orders at the resting price, the market's `takerFeeBps`, a GTD sweep 10 s after the
  deadline, newest-first cancels on a balance drop.
- **Bundler** (`userops.ts`): admission switches, then `handleOps` on the anvil chain with the real EntryPoint, factory,
  validator, Kernel and PolicyPaymaster. A policy refusal and a paused paymaster are the real contract's answers, and the
  EntryPoint reports both as `AA34 signature error` (bundler code -32501).
- **Hyperlane** (`hyperlane.ts`, `virtual.ts`): Base escrow, then an XO mint 10 to 30 s of mock time later
  (deterministic from the message id), `Mailbox.delivered`, no delivery for a recipient the XO route would revert on.
- **Creation** (`creation.ts`, `manager-stub.ts`): see below.

## Switches (spec 5.5 category B)

All 30 switches have behaviour. `switches.ts` (frozen in Wave 0) has the names, values and the two profile columns; the
default profile is **pessimistic**; `OPTIMISTIC_PROFILE` flips all of them. `SWITCH_IMPLEMENTATION` (and
`GET control /state`) says where each lives. A test fails if a switch gains behaviour without a probe or loses it.

| Switch | Visible effect |
|---|---|
| `rpc.access` | `down`: the XO RPC and the bundler close the connection. `requires-key`: 401. `open`: reads work. Base is never affected |
| `registry.trigger` | when `/balance-allowance` reports `smart_account`: `never`, `on-deploy`, `on-enable-trading`, `on-l1-create` |
| `faults` | `429-retry-after`, `5xx`, `timeout`, `truncated-json`; `inject(kind, {count, listeners, when})` |
| `bundler.foreign_account` | a send from an account XO did not provision (`state.provisioned`): `reject` (-32500, allowlist), `accept`, `requires-key` (HTTP 401) |
| `bundler.paymasterless` | a send with no paymaster: `reject` (-32500) or `accept` |
| `bundler.estimate` | `eth_estimateUserOperationGas`: `unsupported` (-32601) or the observed defaults by shape |
| `bundler.shape` | `v0.7-unpacked` accepts the unpacked JSON and refuses the packed; `reject-unpacked` the other way round (-32602) |
| `paymaster.state` | the REAL paymaster is made to agree: `sponsor`, `paused` (`pause()` as its impersonated owner), `policy-narrowed` (global `approve` and CTF `setApprovalForAll` removed). `paused()` and `checkPolicy` reads see it |
| `l1.undeployed` | an ERC-6492 signature for an undeployed account: `reject` or `erc6492` |
| `auth.derive_returns_secret` | derive returns `{apiKey}` only (`no`) or the whole triplet (`yes`) |
| `auth.max_keys` | `POST /auth/api-key` is 400 `api key limit reached` after 1 or 5 keys |
| `auth.delete_level` | `DELETE /auth/api-key` needs L1 or L2 |
| `hmac.target` | the server signs the path with the query (`path-with-query`) or without (`path-only`) |
| `hmac.decode` | `stripped` (decoded key, unpadded output), `raw` (the secret string as the key), `b64url-decoded-padded` |
| `l2.required_on_post` | `POST /order` without L2 is 401 (`yes`) or goes on (`no`); L2 headers that ARE sent are always checked |
| `l2.xo_address` | L2 needs `XO_ADDRESS` (`required`) or ignores it |
| `order.min_size`, `order.min_notional` | 422 `size below minimum: min 5000000, got ...` / `notional below minimum` |
| `order.gtd_min` | a GTD order must expire at least that many seconds from now (400) |
| `order.sig_forms` | which digest form the owner signed is accepted: `eip191-only`, `raw-only`, `both` |
| `order.prefix` | which wire prefix is accepted: `0x00`, `0x01`, `both` |
| `order.dup_key_includes_sig` | the duplicate key is the order hash (`no`) or the hash plus the signature bytes (`yes`) |
| `cancel.body` | `DELETE /order` takes `{orderID: <hash>}`, `{orderId: <hash>}` or `{orderID: <numeric id>}`; the others are 400 or "not found" |
| `cancel.batch_hmac_only` | `DELETE /orders`, `/cancel-all`, `/cancel-market-orders` work with an HMAC (`yes`) or 400 asking for a signature |
| `engine.taker_delay` | the hold of a crossing, FOK or FAK order, 500 or 3000 ms of mock time |
| `engine.balance_drop` | `lifo-on` cancels the newest resting BUYs when the balance falls below the reservations |
| `funding.credit` | does the orderbook credit a delivered deposit: `credited`, `not-credited`, `delayed-5min`, `credited-after-sweep-only` (`hyperlane.sweep()`) |
| `withdraw.paymasterless` | a paymaster-less `transferRemote` on the XO route: `reject` (bundler), `accept-and-deliver` (Base 12 to 18 s later), `accept-no-deliver` (burned on XO, never relayed) |
| `meta.foreign_uri` | a metadata URI outside XO's two buckets: `reviewed` like any, `ignored` (stays PENDING), `rejected` within minutes |
| `seed.on_pending` | an order on a PENDING or UPDATE_REQUIRED market: 422 `market is not active (status: Pending)` or accepted |

Note what the pessimistic default means for a reader of this mock: the XO RPC and the bundler are down, the paymaster is
paused the first time anything reads or sponsors through it, nothing registers by itself, orders need the `0x00` prefix
and EIP-191 signatures and 5 shares and $1 and 180 s, the credentials flow has one key and no secret on derive, and a
deposit is minted but never credited. A test that needs one of these paths names the switch it flips.

## Time

No handler reads `Date.now()`. Time is the injected `MockClock` (`clock.ts`), which starts one hour after the chain
harness' genesis and only moves when a test calls `mock.advance(seconds)`. Two things use it beyond timestamps:

- `clock.sleepMs(ms)` is how a handler waits: the taker hold of an order is a request that stays open until the clock has
  moved. A test starts the request, waits until `mock.clock.waiterCount() > 0`, then advances. A hold the client gave up
  on still completes when time passes (the order is on the book: the ambiguous case). `state.reset()` releases every
  waiter with "aborted", so nothing leaks into the next test.
- `Scheduler` (`scheduler.ts`) holds what happens later: a UserOp's inclusion (`userops.inclusionDelaySeconds`), a
  Hyperlane delivery, a credit, an oracle review, a GTD sweep. `mock.advance` walks to each task in time order, brings
  the chains' time up to it, runs it, and only then goes on.

## Faults

`mock.injectFault(kind, { count, listeners, retryAfterMs, when })`. `when: "before"` (default) fails the request before
the server does anything. `when: "after"` lets a POST, PUT or DELETE run and then replaces the RESPONSE with the fault:
the write happened and the client cannot tell. That is the case the relay's rules about ambiguity are for: an order
accepted behind a timeout, a UserOp landed behind a 503, a credential minted whose secret was never seen.

## Chain additions

`chains.ts` installs, next to the chain harness: the **manager stub** at the market manager address, and one STOP byte
at the Hyperlane route and Mailbox (XO) and at the Circle USDC, router and Mailbox (Base).

- `manager-stub.ts` (assembled with `test/anvil/asm.ts`) behaves like the real manager for `createConvictionMarket`
  (expiry and collateral checks, a real `transferFrom` of the 1,000,000 fee, the real `CLOBMarketCreated` and
  `MarketCreationFeeCharged` layouts), `respondToUpdateRequest` (owner, status and window checks) and `cancelMarket`.
  The oracle acts through two functions only the oracle address can call; their events are encoded by viem from the
  real ABI. Not like the real manager: no AccessManager, pause, UUPS or NFT, and `UpdateRequestResponded` carries an
  empty URI (the creation flow applies the accepted suggestion to its own catalogue).
- `virtual.ts` answers, from JavaScript, the views of contracts that have no bytecode here: the Base USDC, the routers,
  the Mailboxes (`delivered` follows `hyperlane.ts`), `canCall` (true, 0), `collateralConfig` (fee 1,000,000), the
  EIP-1967 implementation slots, and the emulated Base transactions' receipts. `virtual.implementations.set(...)`
  simulates an upgrade; `virtual.revertAll` makes every virtual call revert.

## Findings from the real bytecode (new in this stream)

- The PolicyPaymaster refuses a call, and stops sponsoring when paused, by FAILING VALIDATION, not by reverting: a refused
  `transferRemote` or `approve`, and any sponsored op while it is paused, are `AA34 signature error` (bundler code -32501).
- A signature without its last byte (r and s, no v) is a valid 64-byte EIP-2098 compact signature to the deployed
  validator, so L1 and order checks accept it. Low-s and v are relay hygiene, not contract rules.
- `AA10 sender already constructed` is what a replayed deploying op gets; a bad nonce is `AA25`; a wrong signer `AA24`.

## Determinism

Ids are seeded: API keys, order ids, Hyperlane message ids, created-market ids and every sampled draw (review delay,
decision, window, expiry change, metadata update) are keccak functions of their inputs, never `Math.random`. The same
run twice gives the same keys and the same plans.

## Drift (amendment A9)

`drift.ts` compares JSON shapes of the READ surfaces against the recordings (40 checks). The write surfaces have no
recording to compare with: their shapes are docs and OpenAPI only (**M**) and are pinned by the tests above. Recording
live write responses is a decision for a person, not something this directory does.

## Not built

- `POST /orders` (batch placement) answers 501 `TODO-for-mock-write`; the relay places one order at a time.
- Heartbeats, `/data/orders`, `/trades`, WebSocket feeds, `GET /balance-allowance/update`, the `CancelOrder` typed-data
  cancel forms (undocumented, not implemented on purpose).
- Matching beyond the displayed book and resting orders: no complementary-token minting, no real fee curve, no
  fill-or-kill across tokens. Fees are the market's flat `takerFeeBps`.
- The rest of the manager (pause, AccessManager checks, UUPS, the NFT) and the real FiatToken (the USDC.e stub is a
  plain ERC-20 with an open mint).
- Read surfaces not built: orderbook `/markets` (list), `/midpoint`, `/spread`, `/prices-history`, `/last-trades-prices`,
  `/live-activity`; Data API Pulse markets and liquidity rewards (`UNSERVED_FIXTURES` in `drift.ts` has the reasons).

## What this does not prove

Only the shape of XO's off-chain reads and the contract-level behaviour of the captured bytecode. Nothing about XO's
bundler admission, registry trigger, gateway acceptance or the live paymaster state: those are the switches, each an
assumption with a reason. The Base chain is a variant of the XO bytecode with two immutables rewritten, not a capture,
and carries no contract of its own (its router, USDC and Mailbox are virtual). USDC.e, the exchange, the Conditional
Tokens and the market manager are labelled stubs (`test/anvil/stubs.ts`, `manager-stub.ts`). Behaviours marked M above
are guesses with a reason, each set where one line changes it.

## Files

Read side: `server.ts` assembles the mock; `listener.ts` the node:http listener; `orderbook.ts`, `dataapi.ts`,
`explorer.ts`, `rpc.ts`, `bundler.ts` the surfaces; `catalog.ts` and `state.ts` the data; `registry.ts` the registry
rule; `chains.ts` the anvil chains; `profile.ts` the switch store; `faults.ts` and `limits.ts` fault injection and the
optional limiter; `errors.ts` every error body; `observed.ts` facts seen on the real service; `drift.ts` shape drift;
`testing.ts` test helpers; `main.ts` the standalone program; `switches.ts` the frozen switch table.

Write side: `auth.ts` (L1, L2, keys), `orders.ts` (intake, reads, cancels), `engine.ts` (the order engine),
`write-state.ts` (keys and orders), `verify.ts` (the independent digests and the chain checks), `wire.ts` (headers,
HMAC), `userops.ts` (bundler write side), `calls.ts` (reading a Kernel call), `paymaster.ts` (the paymaster follows the
switch), `hyperlane.ts` and `virtual.ts` (the route), `creation.ts` and `manager-stub.ts` (market creation),
`scheduler.ts` and `clock.ts` (later in mock time), `env.ts` (what every surface sees), `traders.ts` (test helpers).
