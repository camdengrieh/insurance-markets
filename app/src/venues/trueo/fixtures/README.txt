Trueo fixtures.

base_captured_2026-10-20.json is REAL chain data. On 2026-10-20 (06:01 UTC) the Trueo contracts on Base mainnet were
read with eth_call over JSON-RPC batches on the public RPC base-rpc.publicnode.com (read-only, no wallet, User-Agent
insurance-markets-research/0.1, 300 ms between POSTs, 21 requests in all). It holds, decoded with the adapter's own
ABIs and with bigints written as decimal strings:
  - the Manager's pause flag and its active-market count (1361), the TYD vault's decimals, asset and
    convertToAssets(1e6) rate;
  - 14 of the Manager's markets (indices 1345 to 1358, all version 2.0.0): every field the adapter reads, the pool
    keys and ids, and for each pool the StateView slot0 and liquidity, the hook's poolPaused flag and the token's
    decimals;
  - both hooks' feeNumerator and FEE_DENOMINATOR;
  - V4Quoter results for the ladder sizes (1, 5, 25, 100 and 500 shares), buying and selling, on the four pools of
    the first two markets. Where the real quoter reverted (a size beyond the pool's bound) the value is null.

mock-chain.ts: an in-memory JSON-RPC endpoint (single and batch) that serves what is loaded into it, encoding its
answers with the adapter's ABIs. It is a test double and contains no data of its own.
scenario.ts: loads the captured markets into that double. The first two are used exactly as captured (they have
opposite token orders). Six more are loaded with ONE state field overridden (status, winner, payment token, hook, a
paused pool) so the cases the adapter must tell apart exist; six spares are available to tests through
`variant(index, overrides)`. An override is a test input, not venue data; the addresses stay the real ones.

NOT captured, so not in any test: balances and positions of any wallet, claimable amounts, and Transfer logs. They
belong to real wallets, and none was looked up. Those tests were deleted; the empty and refused cases remain.

Independent checks that need no capture: rpc.test.ts and math.test.ts hold golden vectors computed with Foundry's
cast (calldata, return data, a pool id), and constants.test.ts pins each selector to docs/research/11-trueo.md.
