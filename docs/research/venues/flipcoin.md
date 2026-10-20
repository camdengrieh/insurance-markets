# Flipcoin (flipcoin.fun) - venue spec

Researched 2026-10-19. Confidence tags: H = read first-hand this session in a primary source, M = secondary or inferred, L = weak or stale.

## Verdict

**adapter_priority: skip.** The production host `www.flipcoin.fun` serves a Vercel `DEPLOYMENT_DISABLED` error on every path. All trading, quoting and relaying go through that host, and the order book is off-chain, so the venue cannot be used and no live market data can be read. Resolution is a single admin oracle. No liquidity figure was found. Revisit only if the site comes back.

## Is it live?

- H: `curl` to `https://www.flipcoin.fun/`, `/docs`, `/llms.txt`, `/api/v1/markets` and bare `https://flipcoin.fun/` all return **HTTP 402**, `content-type: text/plain`, body `Payment required` / `DEPLOYMENT_DISABLED`. Headers: `server: Vercel`, `x-vercel-error: DEPLOYMENT_DISABLED` (checked 2026-10-19 05:07 UTC).
- M: Vercel uses 402 for a disabled deployment (an unpaid or blocked account, or a manual disable). It is not an x402 payment challenge and carries no payment requirements to record. I did not find a Vercel doc stating this, so the cause is inferred from the error code.
- H: `api.flipcoin.fun`, `app.flipcoin.fun` and `docs.flipcoin.fun` have no DNS records, so there is no alternate API host.
- H: GitHub org `flipcoin-fun` was created 2026-02-18. The org is still public, with no archived repos.
  - Last push to `flipcoin-protocol`: 2026-05-05.
  - Last push to `flipcoin-mcp`, `flipcoin-agent-starter`, `flipcoin-python`, `flipcoin-langchain` and `flipcoin-openclaw-skill`: 2026-05-29.
  - Nothing has been pushed in about 4.5 months.
- H: npm `@flipcoin/mcp-server` has releases through 0.2.0 (2026-05-17). `@flipcoin/sdk` has only 0.1.0 and 0.1.1 (both 2026-02-20).
- Not confirmed: on-chain activity. Base Blockscout is behind a Cloudflare challenge and I did not work around it. No JSON-RPC calls were made. A WebSearch (extended) for third-party coverage was refused because the session search budget was spent. The WebFetch of the site was not repeated, since `curl` already shows the deployment is disabled.
- Conclusion: contracts were deployed on Base mainnet and may still hold state, but the front end, API, relayer and matching engine are unreachable. The venue is effectively down. Whether it is permanently dead or temporarily disabled is unknown.

## Kind and market model

All H, from `flipcoin-protocol` README (https://github.com/flipcoin-fun/flipcoin-protocol).

- Hybrid **off-chain CLOB plus on-chain LMSR backstop AMM**.
- Binary YES/NO markets only. No categorical or scalar markets found (NOT FOUND in the README or API docs).
- Outcomes are ERC-1155 conditional tokens (`ShareToken`). 1 winning share = 1 USDC.
- Each market is an EIP-1167 clone of `MarketLMSR`, created by `FactoryV2`.
- Exchange settlement modes: `COMPLEMENTARY` (cross match), `MINT` (new shares via LMSR) and `MERGE` (redeem a pair).
- Prices are in basis points (`priceBps`, 100 to 9900 for the initial price).
- Market creation is open to anyone, and AI agents are explicitly supported. Creators seed LMSR liquidity of $35, $139 or $693 (low, medium, high tier), per `AGENT_API.md`. So markets are user-generated and probably thin.

## Chains and collateral

- H: Base mainnet (chainId 8453). Base Sepolia (84532) is a testnet.
- H: Collateral is USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, native Base USDC). It is held in an internal ledger, `VaultV2`.
- H: Mainnet v2 addresses from `deployments/base-mainnet.json`:
  - Exchange `0x41fF5e623e5a5a9B00fE876c348cCEfd4cEEd71B`
  - BackstopRouter `0x5257985E8170443D9341109419Dda4D206bcE9Af`
  - VaultV2 `0xACBf5A2f23d2b959D0623fe4345D3F9369dEA15a`
  - ShareToken `0x64b050CabF28D28eAb0A121A2259EB284A4fecA8`
  - FactoryV2 `0x1caaD8cA115010bF95D98E85EF0fcd426f8236ad`
  - DelegationRegistry `0xf7Ee72a9f42dA449907a934B74dF82477Ceae0Ee`
  - Deploy block 43786444.
- Positions sit in the user's `VaultV2` balance and ERC-1155 `ShareToken` balance, not in a per-market contract.

## Read API

- Status: **official-authenticated** (an `fc_` API key is required), and currently unreachable.
- Base URL: `https://www.flipcoin.fun` (H, default in `flipcoin-agent-starter/src/client.ts`). It is also the docs host (`/docs` returns the same disabled error).
- Docs: the repo file `docs/AGENT_API.md` in `flipcoin-protocol`, plus `flipcoin-agent-starter/docs/curl-examples.md`. There is no hosted API reference.
- Auth: `Authorization: Bearer fc_...`. Keys are created by a wallet owner through a SIWE session at `/agents` or `/api/agent/api-key`. I did not do this (no accounts, keys or wallets, per the ground rules).
- Rate limits: configurable per key. Response headers `X-RateLimit-Remaining` and `X-RateLimit-Reset`. The key-creation example uses `rateLimitPerHour: 20`, and the ping example shows `remaining: 8`. Defaults are NOT FOUND.
- Key endpoints (H, from the SDK `client.ts`; request and response shapes were NOT verified live):
  - `GET /api/agent/markets/explore` (params `status`, `sort`, `search`, `minVolume`, `resolveEndBefore`, `resolveEndAfter`, `limit`, `offset`)
  - `GET /api/agent/markets/{address}`
  - `GET /api/agent/markets/{address}/state` (LMSR state and slippage curve)
  - `GET /api/agent/markets/{address}/history` (raw points or OHLC)
  - `GET /api/quote?conditionId=&side=yes|no&action=buy|sell&amount=<6-decimal raw>` (LMSR plus CLOB smart routing)
  - `GET /api/agent/trade/history`
  - `GET /api/agent/feed` and `GET /api/agent/feed/stream` (SSE)
  - `POST /api/agent/webhooks`
  - `GET /api/agents/leaderboard`
  - `GET /api/agent/ping` (not rate-limited)
  - `GET /api/agent/config`
- Order book depth endpoint: NOT FOUND (searched the SDK client and MCP tool list). Only quotes and market state are exposed.
- Websocket: NOT FOUND. SSE feed only.
- On-chain read path: the Exchange and BackstopRouter events, plus `@flipcoin/sdk` ABIs. In theory the LMSR price can be derived from `MarketLMSR` state without the API. The CLOB is off-chain, so on-chain data would show LMSR state and settled fills but not resting orders.
- Fixtures: none saved. The only public host is disabled, so there is no response to capture. `docs/research/fixtures/flipcoin/` was not created.

## Trade path

H, from `AGENT_API.md`, the SDK and the MCP README.

- Order placement and trading (`/api/agent/trade/intent` then `/trade/relay`, `/api/agent/orders/intent` then `/orders/relay`, and `DELETE /api/agent/orders/{hash}`) all go through the operator's relayer at flipcoin.fun.
- Signing is EIP-712:
  - `TradeIntent` on `BackstopRouter` for LMSR trades.
  - `Order` on `Exchange` for CLOB orders, with a `maxFeeBps` ceiling, a strict sequential nonce and an expiry.
  - Mass cancel works by bumping the nonce.
- Delegation: `DelegationRegistry` session keys, with a rolling-24h USDC cap and expiry. The API's `auto_sign` mode lets a registered session key sign for the owner.
- The relayer submits on-chain and pays gas, so users do not send transactions themselves. USDC must first be deposited into `VaultV2` (`/api/agent/vault/deposit`; `DepositRouter` supports a signed deposit intent).
- A claim to confirm: the `Exchange` contract is "operator-submitted, user-signed" (README). Orders cannot be settled on-chain without the operator's matching engine, so a user cannot place a CLOB order without the operator. The LMSR path (`BackstopRouter`) might be callable directly by a user, but the README says it verifies `TradeIntent` signatures. A direct call without the relayer was not confirmed (NOT FOUND).

## PayBox reachability

- **partial, and moot while the site is down.**
- A PayBox EVM wallet on Base could in principle:
  - Send ERC-20 USDC approve and deposit transactions (as transaction proposals).
  - Sign EIP-712 `TradeIntent` and `Order` typed data, if PayBox exposes typed-data signing for Base. I did not verify that, and I called no PayBox tools.
- Placing orders also needs the SIWE-created `fc_` API key and the operator's relayer, which is unreachable. Nothing can be executed now.
- Redeeming winnings is an on-chain call (`ShareToken` redeem, calldata supplied by `/portfolio/redeem`), so it could be done from a wallet without the API once a market resolves. That is only relevant to existing positions.

## Fees

H, from `HYBRID_SPEC_v5.md`.

- Total fee = `protocolFeeBps + creatorFeeBps[conditionId]` = 50 + 50 = 100 bps at current published rates.
- Formula: `fee = totalFeeBps * min(priceBps, 10000 - priceBps) * fillAmount / 10000 / 10000`, rounded down.
- Maker and taker both pay it, according to the spec ("makerFee = fee, takerFee = fee").
- The user signs a ceiling `maxFeeBps` (typically 200). A per-creator fee override exists (commit 2026-04-29).
- The agent starter README shows "early_adopter, total 150 bps (creator 100 + protocol 50)". This conflicts with the 100 bps in the spec. Treat the fee as 100 to 150 bps and read `GET /api/agent/config` when the site is live.
- LMSR gas and spread: gasless for users (relayer-paid). The LMSR price impact depends on the liquidity parameter, which is set by the seed tier.

## Resolution mechanism and dispute risk

- H: `docs/RESOLUTION.md` is scoped as "dev / sandbox mode". It states "Production will require decentralized resolution (oracle network, bonded disputes, etc.)". There is no evidence this was ever built.
- H: Flow is: oracle proposes (yes, no or invalid) after the deadline, then a 24h dispute window where any shareholder can dispute for free (no bond in dev mode). A dispute resets the market to Open and the oracle must re-propose. Anyone can finalize after 24h.
- H: If the oracle proposes nothing within deadline + 6h, anyone can call `markAsInvalid`. Invalid markets return funds.
- H: The agent SDK also lets the creating agent propose and finalize resolution (`proposeResolution`, `finalizeResolution`). The README says "creating agent only" for finalize. So in practice the market creator or an admin decides the outcome.
- Risk: very high. Centralized, creator or admin resolution with free, repeatable disputes, and a platform that has stopped serving. Not suitable as an arbitrage leg because resolution can differ from other venues' oracles and settlement is slow.
- Audit: the README cites an "automated line-by-line review" by an LLM (Feb 2026) with 18 findings, all reported fixed. That is not an independent human audit (M).

## Geo, ToS and automation

- NOT FOUND. The site is down, and the repos contain no terms or geo-blocking text (searched: README, SECURITY.md, AGENT_API.md, MCP README).
- Automation is explicitly welcomed ("agent-first"), with API keys and an MCP server. That policy cannot be checked while the site is down.
- The `eliza-plugin`, `langchain`, `openclaw-skill` and `flipcoin-python` repos exist (H, org listing).

## Liquidity

- NOT FOUND. No volume, open interest or TVL was found in any primary source this session (searched: GitHub org, repo READMEs, API docs; hosted stats are unreachable). The only numbers are the LMSR seed tiers ($35 / $139 / $693 per market) and an example `volume_usdc` value in API docs, which is illustrative.
- Not checked: DefiLlama or Dune. WebSearch was unavailable.
- Prior from the structure: user-generated markets with small seeds, a young protocol and a 2-star repo. Expect very thin depth (L).

## Event categories and overlap

- Markets are created by anyone, including AI agents. The docs' examples are BTC price targets and ETH price targets (crypto price), plus generic politics, sports and world events (M, from the starter README and the MCP examples).
- The "category" field defaulted to `agent`. Crypto price thresholds would overlap Polymarket, Kalshi and Limitless in principle, but wording, dates and resolution sources differ market by market. A market linker would be needed.
- No evidence of any liquid market overlapping other venues.

## Shared liquidity

- None known. Flipcoin runs its own CLOB and LMSR, and it is not a front end for another venue (M, no mention of routing to external books). It would count as an independent leg if it were live and liquid.

## Integration notes (if it returns)

- Reading: poll `GET /api/agent/markets/explore` with `minVolume` and `status=open`, then `/state` for LMSR price. Use `/api/quote` for executable prices.
- Convert `priceBps / 10000` to a probability. Remember the 1.0 to 1.5% round-trip fee.
- Gate any use on a liveness check (non-402 response), because the venue has been disabled and may not come back.

## Suspicious content

- None found. Repo READMEs and docs contained no instructions aimed at AI agents beyond normal setup steps.
- Note for hygiene: the MCP README tells users to put an API key in an `env` block. That is ordinary configuration, and I did not act on it.

## Sources

- H: https://www.flipcoin.fun/ (and `/docs`, `/llms.txt`, `/api/v1/markets`, https://flipcoin.fun/): HTTP 402 `DEPLOYMENT_DISABLED`, 2026-10-19.
- H: https://github.com/flipcoin-fun (org, created 2026-02-18, repo list and push dates).
- H: https://github.com/flipcoin-fun/flipcoin-protocol (README, `docs/AGENT_API.md`, `docs/HYBRID_SPEC_v5.md`, `docs/RESOLUTION.md`, `deployments/base-mainnet.json`, commit log to 2026-05-05).
- H: https://github.com/flipcoin-fun/flipcoin-agent-starter (README, `src/client.ts`, `docs/curl-examples.md`).
- H: https://github.com/flipcoin-fun/flipcoin-mcp (README, tool list).
- H: https://registry.npmjs.org/@flipcoin/sdk and https://registry.npmjs.org/@flipcoin/mcp-server (release dates).
- Blocked: base.blockscout.com (Cloudflare challenge; not bypassed).

## Not found

- Live market data, any response sample, order book depth endpoint, websocket, rate-limit defaults, ToS and geo rules, TVL, volume, open interest, independent audit, third-party coverage.
