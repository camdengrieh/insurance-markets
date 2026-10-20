# Veilcast (Starknet) - venue spec

Researched 2026-10-19. Tags: H = read first-hand this session in a primary source, M = secondary/inferred, L = weak/stale.

## Verdict

- Adapter priority: **skip** (revisit only as a signal-only curiosity). A hackathon project (STRK20 Private Sprint) built in 20 days in Aug-Sep 2026 by one GitHub user; 0 stars, no evidence of organic users or volume. [H]
- Reasons: no demonstrated liquidity, pool-routed trading needs a STARK-proof privacy-pool flow on Starknet (not reachable from PayBox EVM/Solana wallets), no event categories that overlap other venues (markets are ad hoc, opener-resolved), and the project says its payout/claim leg reverts on mainnet.

## Is it live?

- Contracts deployed to Starknet mainnet 2026-08-26 (market + resolvers) and 2026-09-02 (LeveragedMarket). [H] README, cairo/address.md, strk20.json.
- Repo last push 2026-09-07; 0 stars, 0 open issues, MIT, created 2026-08-14; release "Veilcast v1.0.0 - STRK20 Private Sprint". [H] `gh api repos/zkasuran/veilcast`.
- npm `veilcast-agent` latest 0.3.1, published 2026-09-02, nothing since. [H] registry.npmjs.org/veilcast-agent.
- Landing page (https://zkasuran.github.io/veilcast/) fetched today showed "0 markets / Nothing is trading yet" (may be a JS-rendered page that did not load in the fetcher, so M). Landing page itself never states chain, collateral or network. [H for what it says]
- README says markets were seeded with close times "after judging" (i.e. close dates in Sep 2026), so they are likely closed by now. Current on-chain state NOT verified (no JSON-RPC POST made; read-only constraint was GET only). [M]
- Status: beta/hackathon demo, effectively dormant. Not independently verified that anyone besides the author has traded it.

## Kind and market model

- Kind: on-chain-other (Starknet, Cairo 2.20 contracts). [H]
- **VeilcastMarket**: parimutuel pools, up to 8 outcomes (`MAX_OUTCOMES = 8`), categorical/binary; all stakes go into per-outcome volume, winners split the pot net of fee pro rata. `get_outcome_volumes` is public; implied probability = outcome volume share. No order book, no AMM, no sell/exit before resolution. [H] cairo/src/market.cairo.
- Positions are not tokens: each bet is keyed by a fresh Stark public key ("bearer coupon"), private key kept in the user's browser localStorage or agent state. Transferable as a `veilcast:` URI. Nothing ERC-20/1155. [H] README.
- **LeveragedMarket**: separate binary FPMM (constant-product over YES/NO shares), isolated margin up to 5x (`leverage_bps` 10000-50000), vault-lent leverage, liquidation at 8% equity, insurance fund. Market 0 open on mainnet with vault seeded 5 STRK, depth 2 STRK, one real position. [H] README, claims by the author; tiny.
- Market creation is permissionless; the opener is the resolver (or binds a Pragma/committee resolver). Fee up to 500 bps set by opener. [H]

## Chains and collateral

- Starknet mainnet (`SN_MAIN`). Collateral: STRK (token 0x04718f5a...c938d), via the STRK20 privacy pool 0x040337b1...812a. [H] cairo/address.md, docs/INTEGRATION.md.
- Contracts (mainnet) [H]: VeilcastMarket 0x036be78d...6c6b8; PragmaResolver 0x0665a23c...259b; CommitteeResolver 0x00b0dec2...6cd7; LeveragedMarket 0x01912b5c...96774 (full hashes in fixtures/veilcast-starknet/strk20.json).
- Landing page header shows STRK/BTC/ZEC/ETH/USDC icons but only STRK is wired in contracts. [H]

## Read API

- Official REST/WebSocket API: **none**. NOT FOUND (searched: README, docs/INTEGRATION.md, docs/OPERATIONS.md, repo tree). [H]
- Read path is on-chain only: Starknet JSON-RPC `starknet_call` against the market: `get_market`, `get_market_views(start,count)`, `get_question`, `get_outcome_label`, `get_outcome_volumes`, `get_stake`, `get_n_markets`, `get_pool`, `get_token`, `get_total_escrow`; leverage: `get_position`, `get_mandate`, `price_bps`, `position_equity`, `get_vault_free`, `get_total_backing`, `get_insurance`. Events (`MarketCreated`, `MarketVoided`, `FeeCollected`, bets) via `starknet_getEvents`. [H] docs/INTEGRATION.md, market.cairo.
- `MarketView` embeds a ByteArray, so the felt stream must be walked (no fixed offsets); event scans must start at deploy block (public RPCs return an empty page for from_block 0). [H]
- Unofficial/convenience: `npx veilcast-agent markets|flow|lev-markets|quote` (no keys needed for reads), `veilcast-sdk` on npm, MCP server (28 tools). Third-party code, NOT executed or installed here. Default RPC in docs: a keyless public Starknet endpoint (the config example uses rpc.starknet.lava.build; a later commit says Cartridge replaced Lava). [H]
- Auth/rate limits: none at Veilcast level; limited by whichever Starknet RPC is used. No fixtures of live markets captured because reading requires JSON-RPC POST (not permitted in this task).
- Fixtures saved: `docs/research/fixtures/veilcast-starknet/strk20.json` (contract/class registry from repo), `npm-veilcast-agent-summary.json` (registry dist-tags/time). Probe `GET https://cloud.argent-api.com/v1/privacy/proving/ohttp-keys` returned HTTP 200 (third-party STRK20 proving service, not Veilcast's).

## Trade path

- Bet: `MarketAction::Bet [0, market_id, outcome, amount, position_key]` sent through the STRK20 privacy pool: shield STRK into the pool (public deposit), then one proof-carrying pool transaction withdraws stake into the market and books the bet; the on-chain sender is the pool relayer. Requires a STARK proof from Argent's OHTTP proving/discovery services (no API key), a built `starknet-privacy` SDK (not on npm), a Starknet account paying gas (STRK, with a padded-fee reserve; one measured bet cost 2.76 STRK realized), strict sequencing rules (prove at head-15, single-call submit, separate approve tx, wait for note indexing). [H] docs/INTEGRATION.md, docs/OPERATIONS.md.
- Claim: `[1, market_id, outcome, position_key, r, s, target_variant, target_data]`, Stark signature by the coupon key. The author states the **claim leg reverts on mainnet** (proof-version mismatch in privacy SDK 0.14.3-rc.5), works only on Sepolia. A bet that cannot be redeemed on mainnet is a hard blocker for any real use. [H] README ("What runs today"); L as to whether it has since been fixed (no commits after 2026-09-07).
- Leverage open/close/AgentClose and liquidate (public, permissionless) are also available; the mandate lets an agent close but not redirect payout. [H]
- Cancel/sell: none on the parimutuel side (no exit). Leveraged side can close against the FPMM.
- Orders: no signed-order/CLOB path; every action is an on-chain Starknet transaction.

## PayBox reachability

- **No.** Veilcast needs a Starknet account (Stark curve keys, STARK-proof privacy pool, starknet.js). PayBox EVM/Solana wallets cannot sign Starknet transactions or bridge into the STRK20 pool in-flow. Whether PayBox supports Starknet at all was not checked (NOT FOUND in the scope of this task); even if it did, the proof-carrying flow needs the privacy SDK and a custom prover client, not a simple transaction proposal. [M]
- Read-only (signal) use from the aggregator needs no PayBox at all.

## Fees

- Parimutuel: `fee_on(pot, fee_bps) = pot * fee_bps / 10000` (truncating), charged once at resolution on the gross pot, set by the market opener at creation, capped at 500 bps (5%), paid to the opener's fee recipient; paid by bettors out of the pot. [H] market.cairo.
- Leveraged: 0.30% open fee seeds the insurance fund; borrow fees go to LPs/vault. [H] README.
- Operational cost: Starknet gas in STRK plus the privacy-pool fee (the author measured ~2.76 STRK for one bet; STRK price not recorded). [H]

## Resolution and dispute risk

- Three paths: (1) Owner: whoever opens the market is its resolver; (2) Oracle: PragmaResolver bound to a Pragma spot pair + threshold, anyone can push the median, `max_price_age` 3600s on mainnet; (3) Jury: CommitteeResolver, named panel, first to quorum settles, deadlock leads to a public void after 30 days. Any market can be voided by anyone 30 days (`VOID_GRACE`) after close if the resolver never settles. If nobody backed the winner the market voids. [H] market.cairo, README.
- Risk: owner-resolved markets are fully trusted to the creator (high dispute/rug risk); no UMA-style dispute window. Only Pragma-bound price markets are trust-minimised. Contracts are author-tested (69 Cairo tests claimed) but no third-party audit found (NOT FOUND: audit). [H/M]

## Geo / ToS / automation

- NOT FOUND (searched: README, landing page, docs): no terms of service, geoblock or restriction on bots. Automation is explicitly encouraged (agent runtime, MCP server). Shielding is a "public, screened deposit" into the STRK20 pool (compliance screening is by the pool, not Veilcast). MIT licence. [H]
- Privacy model: identities hidden, amounts and per-outcome volumes public. [H]

## Liquidity

- No volume/OI/TVL figure published. Known scale from the README: vault seeded 5 STRK, leveraged market 0 depth 2 STRK, 14 pool transactions total of which 4 hit Veilcast contracts, one real leveraged position, three private bets. [H] README (2026-09-02). Effectively demo-size (tens of STRK at most). Current state not verified on-chain.

## Event overlap (arbitrage relevance)

- Markets are ad hoc questions created by the opener (README mentions Pragma STRK/USD price-style markets as the oracle use case). No categories with sustained liquidity; no sports or politics feed. Any overlap with other venues would be incidental crypto-price markets, and there is nothing to arb against at this depth. [M]
- Shares liquidity with no other venue; uses the shared STRK20 pool only as a payment rail. Independent, but too thin to matter.

## Open questions

- Is any market currently open, and what are volumes (needs JSON-RPC `starknet_call`, a POST; not done)?
- Has the mainnet claim-leg bug been fixed upstream?
- Does PayBox support Starknet accounts at all?

## Suspicious content

- None found. The README contains hackathon-judge marketing language ("The only entry in the field an autonomous agent can drive on mainnet") and an `AGENTS.md`/skill packs for agent hosts; nothing was executed or followed.

## Sources

- https://zkasuran.github.io/veilcast/ [H]
- https://github.com/zkasuran/veilcast (README.md, ARCHITECTURE.md listing, docs/INTEGRATION.md, docs/OPERATIONS.md, docs/SECURITY.md, cairo/address.md, cairo/src/market.cairo, strk20.json) via `gh api` [H]
- https://registry.npmjs.org/veilcast-agent [H]
- https://cloud.argent-api.com/v1/privacy/proving/ohttp-keys (HTTP 200 only) [H]
- WebSearch was unavailable (session budget exhausted), so no independent third-party coverage was checked. NOT FOUND (searched: n/a, search blocked).
