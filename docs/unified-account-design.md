# One trading account across every venue and chain: design

Status: build design, 2026-10-24, branch `build/xo-paybox-plugin`. It replaces the per-venue direct panels (one ticket,
setup card and credential per venue) and the Limitless "paste your API token" flow from efeb3b0, which the product
owner rejected: "a seemless aggregated experience that abstracts everything ... we shouldn't be asking users to input
their own api key in any case". Research: `docs/research/44-limitless-keyless-auth.md`,
`45-polymarket-gasless-relayer.md`, `46-multichain-aa-paymaster.md`.

## 1. The decision

Every visitor gets one **trading key E**: a secp256k1 key that lives in their browser, never on a server. E is the one
identity every venue sees, and the visitor never sees a venue account, a venue credential or a gas token.

- **Why a key of our own and not the connected wallet itself.** Every venue checks a plain ECDSA owner signature (XO
  Kernel owner, Polymarket Deposit Wallet owner, Limitless `signatureType 0`, note 46 section 1), so the trading
  identity must be an EOA. A connected EOA cannot have its gas sponsored on Polygon or Base (wallets barely support
  ERC-7677, and a dApp must not ask a wallet for an EIP-7702 authorization, note 46), and it would prompt on every
  order. A key the page holds can sign its own EIP-7702 authorization to viem's `Simple7702Account` (plain-ECDSA
  `isValidSignature`, so venue signatures keep working, note 46), which makes every action on 137, 8453 and 56
  sponsorable through our paymaster, and it signs orders without a wallet prompt.
- **Two ways in, one account.**
  - *Connect a wallet* (browser wallet, WalletConnect, PayBox): the wallet W signs one fixed EIP-712 message
    ("Unlock your trading account", domain without chainId) and E = keccak256(signature) reduced to a valid key. On
    first creation the page asks for the signature twice and compares: equal means W signs deterministically and E can
    be re-derived on any device from W alone. Different means the page falls back to the generated mode below and
    says so. W is also the funding and withdrawal wallet.
  - *Create one* (no wallet): a random E, encrypted with a key derived from a passkey's WebAuthn PRF output, stored in
    IndexedDB, with the ciphertext also backed up on our API (keyed by the passkey credential id; the server cannot
    decrypt it) and an explicit "export key" action. Where PRF is missing (some Safari and Firefox Android builds) the
    page says it cannot create a wallet there and offers Connect.
- **Venue accounts, all derived from E, shown as one account.**
  - XO (3223): the Kernel v3.1 account K(E) (`sdk/trade/xo/account/derive.ts`). Setup and orders go through XO's own
    bundler and paymaster via our relay; E signs the raw user-op hash locally.
  - Polymarket (137): the Deposit Wallet owned by E. Deployed and approved through Polymarket's relayer with our
    Builder credentials (no gas, no prompt), CLOB credentials derived from E's `ClobAuth` signature, orders
    `signatureType 3`, posted from the browser (the CLOB must see the visitor's own location, note 45).
  - Limitless (8453): E itself, registered as our partner sub-account (`POST /profiles/partner-accounts` with E's
    signature over `GET /auth/signing-message`), orders `signatureType 0` with `ownerId`/`onBehalfOf`, sent by our
    relay with our partner token (note 44). Approvals are sponsored 7702 calls from E.
- **Money.** Deposits from W are gasless where the token allows it: W signs USDC `transferWithAuthorization`
  (EIP-3009, typed data only, so PayBox can do it) and E submits it as a sponsored call. Polymarket funding goes from
  E's Base USDC to Polymarket's bridge deposit address (sponsored transfer). Withdrawals are sponsored transfers from E
  to W (or any address the visitor types). One balance: E's USDC on Base and Polygon, the Deposit Wallet's pUSD, K(E)'s
  XO balance, plus open positions per venue.
- **Trading.** One ticket for every market. The venue is a detail on the market, not a separate flow. "Activate
  trading" runs every venue's activation once, in order, behind one progress list; a venue that is not available
  (operator credential missing, venue refuses this address) is shown as not available with the reason, and the rest
  still work.

## 2. Operator credentials (ours, server-side only)

Stored as SSM SecureString parameters under `/pm-workers/api/`, read by `pm-deploy` into `/etc/pm-api.env` on the host,
never in `app/` or the repo. Each feature reports "not available" while its parameter is absent.

| Parameter | What it is | How the operator gets it |
| --- | --- | --- |
| `PIMLICO_API_KEY` | bundler and paymaster for 137, 8453, 56 | pimlico.io dashboard, pay as you go, key limited to bundler and paymaster methods, IP-restricted to the API host's Elastic IP |
| `PIMLICO_SPONSORSHIP_POLICY_ID` | caps: chains, global, per user, per op | same dashboard |
| `POLY_BUILDER_API_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE` | Polymarket relayer access (unverified tier: 100 relayer txs/day shared) | polymarket.com, Settings, Builders |
| `POLY_BUILDER_CODE` | public attribution code (order `builder` field, bridge `X-Builder-Code`) | same page |
| `LIMITLESS_PARTNER_TOKEN_ID`, `LIMITLESS_PARTNER_SECRET` | partner HMAC token with `trading`, `account_creation`, `delegated_signing` | sign in at limitless.exchange with an operator wallet, apply for partner access, create the scoped token after approval |

## 3. Contracts between the parts

### 3.1 Page: the trading account (app/src/features/account/)

- `LocalSigner` implements `WalletSigner` (`app/src/core/signer.ts`) with `kind: "local"`. `signTypedData`,
  `signMessage`, `signRawMessage` sign with E. `sendTransaction` sends one sponsored call through the sponsor below and
  returns the transaction hash. `capabilities = { sendTransaction: true, rawMessage: true, chains: [137, 8453, 56, 3223] }`.
- `TradingAccount`: `{ signer: LocalSigner; address: Address /* E */; mode: "derived" | "generated"; funding: WalletSigner | null /* W */ }`
  from `useTradingAccount()`; null until created or unlocked.
- `Sponsor.sendCalls(chainId, calls: { to, data, value? }[]): Promise<Hex /* tx hash */>`: EIP-7702 delegation of E to
  viem's Simple7702Account (entry point 0.8) on first use per chain, user operations through viem's bundler and
  paymaster clients pointed at `${MARKETS_API_ORIGIN}/v1/paymaster/<chainId>`.
- Venue activation, one per venue, registered in one list:
  `interface VenueActivation { venue: VenueId; status(acct): Promise<ActivationStatus>; activate(acct, progress): Promise<DirectResult<void>> }`,
  `ActivationStatus = { state: "ready" } | { state: "needs_activation"; steps: readonly string[] } | { state: "unavailable"; reason: string }`.
- The direct executors keep their interface (`features/trade/direct/types.ts`) and receive the trading account's
  `LocalSigner` as their wallet.

### 3.2 API routes (api/), all behind CloudFront, CORS limited to the dApp origin

- `POST /v1/paymaster/:chainId` (137, 8453, 56): JSON-RPC pass-through to Pimlico with the key and policy id added by
  the server. Allowed methods only: `eth_chainId`, `eth_supportedEntryPoints`, `eth_estimateUserOperationGas`,
  `eth_sendUserOperation`, `eth_getUserOperationReceipt`, `eth_getUserOperationByHash`,
  `pimlico_getUserOperationGasPrice`, `pm_getPaymasterStubData`, `pm_getPaymasterData`. The server decodes the user
  operation's `callData` (Simple7702 `execute`/`executeBatch`) and sponsors only calls to an allowlist (USDC and pUSD
  on each chain, the venues' exchanges, CTF and adapters, Polymarket bridge deposit addresses returned by the bridge
  for that sender), with per-sender rate limits.
- `/v1/relay/polymarket/<relayer path>`: mirror of Polymarket's relayer with our Builder HMAC headers added; allowed
  paths and transaction types only (`WALLET-CREATE`, `WALLET` with target allowlist, status and nonce reads, the
  session-signer route). `WALLET-CREATE` needs an ownership proof (3.3) for `from`.
- Limitless partner relay (replaces visitor-token forwarding):
  - `GET /v1/relay/limitless/signing-message`
  - `POST /v1/relay/limitless/register` `{ account, signingMessageHex, signature }` returns `{ profileId }` (server
    stores account to profileId in its data dir; 409 from Limitless is returned as "this wallet already has a
    Limitless account")
  - `POST /v1/relay/limitless/orders` `{ account, order, orderType, marketSlug }` (the order's own signature proves
    control; the server adds `ownerId`/`onBehalfOf`)
  - `POST /v1/relay/limitless/orders/cancel` and `GET /v1/relay/limitless/orders?account&marketSlug`: ownership proof (3.3)
  - `GET /v1/relay/limitless/markets/<slug>` (unchanged)

### 3.3 Ownership proof

Header `x-im-proof: <account>.<unix-seconds>.<signature>` where signature is E's `personal_sign` over the text
`insurance-markets <METHOD> <path> <unix-seconds> <sha256-hex of body or empty string>`; accepted within 300 seconds,
recovered address must equal the account the request acts for.

## 4. What is not claimed

Nothing here has been run against a live venue. Open until a live signed test: Polymarket `WALLET-CREATE` on an
unverified builder key and address parity with `maker.ts`; Limitless partner approval, EOA mode default and signing
nonce lifetime; venues accepting an E with 7702 code; PRF on Windows Hello and password managers.
